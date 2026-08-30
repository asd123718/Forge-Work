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
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Action } from "../../../../base/common/actions.js";
import { URI } from "../../../../base/common/uri.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { localize } from "../../../../nls.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { IRequestService, asText } from "../../../../platform/request/common/request.js";
import { joinPath } from "../../../../base/common/resources.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { Utils } from "../../../../platform/profiling/common/profiling.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
class RepoInfo {
  static fromExtension(desc) {
    let result;
    if (desc.bugs && typeof desc.bugs.url === "string") {
      const base = URI.parse(desc.bugs.url);
      const match = /\/([^/]+)\/([^/]+)\/issues\/?$/.exec(desc.bugs.url);
      if (match) {
        result = {
          base: base.with({ path: null, fragment: null, query: null }).toString(true),
          owner: match[1],
          repo: match[2]
        };
      }
    }
    if (!result && desc.repository && typeof desc.repository.url === "string") {
      const base = URI.parse(desc.repository.url);
      const match = /\/([^/]+)\/([^/]+)(\.git)?$/.exec(desc.repository.url);
      if (match) {
        result = {
          base: base.with({ path: null, fragment: null, query: null }).toString(true),
          owner: match[1],
          repo: match[2]
        };
      }
    }
    if (result && result.base.indexOf("github") === -1) {
      result = void 0;
    }
    return result;
  }
}
let SlowExtensionAction = class extends Action {
  constructor(extension, profile, _instantiationService) {
    super("report.slow", localize("cmd.reportOrShow", "Performance Issue"), "extension-action report-issue");
    this.extension = extension;
    this.profile = profile;
    this._instantiationService = _instantiationService;
    this.enabled = Boolean(RepoInfo.fromExtension(extension));
  }
  async run() {
    const action = await this._instantiationService.invokeFunction(createSlowExtensionAction, this.extension, this.profile);
    if (action) {
      await action.run();
    }
  }
};
SlowExtensionAction = __decorateClass([
  __decorateParam(2, IInstantiationService)
], SlowExtensionAction);
async function createSlowExtensionAction(accessor, extension, profile) {
  const info = RepoInfo.fromExtension(extension);
  if (!info) {
    return void 0;
  }
  const requestService = accessor.get(IRequestService);
  const instaService = accessor.get(IInstantiationService);
  const url = `https://api.github.com/search/issues?q=is:issue+state:open+in:title+repo:${info.owner}/${info.repo}+%22Extension+causes+high+cpu+load%22`;
  let res;
  try {
    res = await requestService.request({ url, callSite: "extensionsSlowActions.getSlowExtensionAction" }, CancellationToken.None);
  } catch {
    return void 0;
  }
  const rawText = await asText(res);
  if (!rawText) {
    return void 0;
  }
  const data = JSON.parse(rawText);
  if (!data || typeof data.total_count !== "number") {
    return void 0;
  } else if (data.total_count === 0) {
    return instaService.createInstance(ReportExtensionSlowAction, extension, info, profile);
  } else {
    return instaService.createInstance(ShowExtensionSlowAction, extension, info, profile);
  }
}
let ReportExtensionSlowAction = class extends Action {
  constructor(extension, repoInfo, profile, _dialogService, _openerService, _productService, _nativeHostService, _environmentService, _fileService) {
    super("report.slow", localize("cmd.report", "Report Issue"));
    this.extension = extension;
    this.repoInfo = repoInfo;
    this.profile = profile;
    this._dialogService = _dialogService;
    this._openerService = _openerService;
    this._productService = _productService;
    this._nativeHostService = _nativeHostService;
    this._environmentService = _environmentService;
    this._fileService = _fileService;
  }
  async run() {
    const data = Utils.rewriteAbsolutePaths(this.profile.data, "pii_removed");
    const path = joinPath(this._environmentService.tmpDir, `${this.extension.identifier.value}-unresponsive.cpuprofile.txt`);
    await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(data, void 0, 4)));
    const os = await this._nativeHostService.getOSProperties();
    const title = encodeURIComponent("Extension causes high cpu load");
    const osVersion = `${os.type} ${os.arch} ${os.release}`;
    const message = `:warning: Make sure to **attach** this file from your *home*-directory:
:warning:\`${path}\`

Find more details here: https://github.com/microsoft/vscode/wiki/Explain-extension-causes-high-cpu-load`;
    const body = encodeURIComponent(`- Issue Type: \`Performance\`
- Extension Name: \`${this.extension.name}\`
- Extension Version: \`${this.extension.version}\`
- OS Version: \`${osVersion}\`
- VS Code version: \`${this._productService.version}\`

${message}`);
    const url = `${this.repoInfo.base}/${this.repoInfo.owner}/${this.repoInfo.repo}/issues/new/?body=${body}&title=${title}`;
    this._openerService.open(URI.parse(url));
    this._dialogService.info(
      localize("attach.title", "Did you attach the CPU-Profile?"),
      localize("attach.msg", "This is a reminder to make sure that you have not forgotten to attach '{0}' to the issue you have just created.", path.fsPath)
    );
  }
};
ReportExtensionSlowAction = __decorateClass([
  __decorateParam(3, IDialogService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IProductService),
  __decorateParam(6, INativeHostService),
  __decorateParam(7, INativeWorkbenchEnvironmentService),
  __decorateParam(8, IFileService)
], ReportExtensionSlowAction);
let ShowExtensionSlowAction = class extends Action {
  constructor(extension, repoInfo, profile, _dialogService, _openerService, _environmentService, _fileService) {
    super("show.slow", localize("cmd.show", "Show Issues"));
    this.extension = extension;
    this.repoInfo = repoInfo;
    this.profile = profile;
    this._dialogService = _dialogService;
    this._openerService = _openerService;
    this._environmentService = _environmentService;
    this._fileService = _fileService;
  }
  async run() {
    const data = Utils.rewriteAbsolutePaths(this.profile.data, "pii_removed");
    const path = joinPath(this._environmentService.tmpDir, `${this.extension.identifier.value}-unresponsive.cpuprofile.txt`);
    await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(data, void 0, 4)));
    const url = `${this.repoInfo.base}/${this.repoInfo.owner}/${this.repoInfo.repo}/issues?utf8=\u2713&q=is%3Aissue+state%3Aopen+%22Extension+causes+high+cpu+load%22`;
    this._openerService.open(URI.parse(url));
    this._dialogService.info(
      localize("attach.title", "Did you attach the CPU-Profile?"),
      localize("attach.msg2", "This is a reminder to make sure that you have not forgotten to attach '{0}' to an existing performance issue.", path.fsPath)
    );
  }
};
ShowExtensionSlowAction = __decorateClass([
  __decorateParam(3, IDialogService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, INativeWorkbenchEnvironmentService),
  __decorateParam(6, IFileService)
], ShowExtensionSlowAction);
export {
  SlowExtensionAction,
  createSlowExtensionAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGVsZWN0cm9uLWJyb3dzZXJcXGV4dGVuc2lvbnNTbG93QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkhvc3RQcm9maWxlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0U2VydmljZSwgYXNUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVXRpbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9maWxpbmcvY29tbW9uL3Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcblxuYWJzdHJhY3QgY2xhc3MgUmVwb0luZm8ge1xuXHRhYnN0cmFjdCBnZXQgYmFzZSgpOiBzdHJpbmc7XG5cdGFic3RyYWN0IGdldCBvd25lcigpOiBzdHJpbmc7XG5cdGFic3RyYWN0IGdldCByZXBvKCk6IHN0cmluZztcblxuXHRzdGF0aWMgZnJvbUV4dGVuc2lvbihkZXNjOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBSZXBvSW5mbyB8IHVuZGVmaW5lZCB7XG5cblx0XHRsZXQgcmVzdWx0OiBSZXBvSW5mbyB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIHNjaGVtZTphdXRoL09XTkVSL1JFUE8vaXNzdWVzL1xuXHRcdGlmIChkZXNjLmJ1Z3MgJiYgdHlwZW9mIGRlc2MuYnVncy51cmwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCBiYXNlID0gVVJJLnBhcnNlKGRlc2MuYnVncy51cmwpO1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSAvXFwvKFteL10rKVxcLyhbXi9dKylcXC9pc3N1ZXNcXC8/JC8uZXhlYyhkZXNjLmJ1Z3MudXJsKTtcblx0XHRcdGlmIChtYXRjaCkge1xuXHRcdFx0XHRyZXN1bHQgPSB7XG5cdFx0XHRcdFx0YmFzZTogYmFzZS53aXRoKHsgcGF0aDogbnVsbCwgZnJhZ21lbnQ6IG51bGwsIHF1ZXJ5OiBudWxsIH0pLnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0XHRcdG93bmVyOiBtYXRjaFsxXSxcblx0XHRcdFx0XHRyZXBvOiBtYXRjaFsyXVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBzY2hlbWU6YXV0aC9PV05FUi9SRVBPLmdpdFxuXHRcdGlmICghcmVzdWx0ICYmIGRlc2MucmVwb3NpdG9yeSAmJiB0eXBlb2YgZGVzYy5yZXBvc2l0b3J5LnVybCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IGJhc2UgPSBVUkkucGFyc2UoZGVzYy5yZXBvc2l0b3J5LnVybCk7XG5cdFx0XHRjb25zdCBtYXRjaCA9IC9cXC8oW14vXSspXFwvKFteL10rKShcXC5naXQpPyQvLmV4ZWMoZGVzYy5yZXBvc2l0b3J5LnVybCk7XG5cdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0cmVzdWx0ID0ge1xuXHRcdFx0XHRcdGJhc2U6IGJhc2Uud2l0aCh7IHBhdGg6IG51bGwsIGZyYWdtZW50OiBudWxsLCBxdWVyeTogbnVsbCB9KS50b1N0cmluZyh0cnVlKSxcblx0XHRcdFx0XHRvd25lcjogbWF0Y2hbMV0sXG5cdFx0XHRcdFx0cmVwbzogbWF0Y2hbMl1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBmb3Igbm93IG9ubHkgR0ggaXMgc3VwcG9ydGVkXG5cdFx0aWYgKHJlc3VsdCAmJiByZXN1bHQuYmFzZS5pbmRleE9mKCdnaXRodWInKSA9PT0gLTEpIHtcblx0XHRcdHJlc3VsdCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTbG93RXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRyZWFkb25seSBwcm9maWxlOiBJRXh0ZW5zaW9uSG9zdFByb2ZpbGUsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigncmVwb3J0LnNsb3cnLCBsb2NhbGl6ZSgnY21kLnJlcG9ydE9yU2hvdycsIFwiUGVyZm9ybWFuY2UgSXNzdWVcIiksICdleHRlbnNpb24tYWN0aW9uIHJlcG9ydC1pc3N1ZScpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IEJvb2xlYW4oUmVwb0luZm8uZnJvbUV4dGVuc2lvbihleHRlbnNpb24pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhY3Rpb24gPSBhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihjcmVhdGVTbG93RXh0ZW5zaW9uQWN0aW9uLCB0aGlzLmV4dGVuc2lvbiwgdGhpcy5wcm9maWxlKTtcblx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRhd2FpdCBhY3Rpb24ucnVuKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVTbG93RXh0ZW5zaW9uQWN0aW9uKFxuXHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0ZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdHByb2ZpbGU6IElFeHRlbnNpb25Ib3N0UHJvZmlsZVxuKTogUHJvbWlzZTxBY3Rpb24gfCB1bmRlZmluZWQ+IHtcblxuXHRjb25zdCBpbmZvID0gUmVwb0luZm8uZnJvbUV4dGVuc2lvbihleHRlbnNpb24pO1xuXHRpZiAoIWluZm8pIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmVxdWVzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVJlcXVlc3RTZXJ2aWNlKTtcblx0Y29uc3QgaW5zdGFTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdGNvbnN0IHVybCA9IGBodHRwczovL2FwaS5naXRodWIuY29tL3NlYXJjaC9pc3N1ZXM/cT1pczppc3N1ZStzdGF0ZTpvcGVuK2luOnRpdGxlK3JlcG86JHtpbmZvLm93bmVyfS8ke2luZm8ucmVwb30rJTIyRXh0ZW5zaW9uK2NhdXNlcytoaWdoK2NwdStsb2FkJTIyYDtcblx0bGV0IHJlczogSVJlcXVlc3RDb250ZXh0O1xuXHR0cnkge1xuXHRcdHJlcyA9IGF3YWl0IHJlcXVlc3RTZXJ2aWNlLnJlcXVlc3QoeyB1cmwsIGNhbGxTaXRlOiAnZXh0ZW5zaW9uc1Nsb3dBY3Rpb25zLmdldFNsb3dFeHRlbnNpb25BY3Rpb24nIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhd1RleHQgPSBhd2FpdCBhc1RleHQocmVzKTtcblx0aWYgKCFyYXdUZXh0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGRhdGEgPSA8eyB0b3RhbF9jb3VudDogbnVtYmVyIH0+SlNPTi5wYXJzZShyYXdUZXh0KTtcblx0aWYgKCFkYXRhIHx8IHR5cGVvZiBkYXRhLnRvdGFsX2NvdW50ICE9PSAnbnVtYmVyJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH0gZWxzZSBpZiAoZGF0YS50b3RhbF9jb3VudCA9PT0gMCkge1xuXHRcdHJldHVybiBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwb3J0RXh0ZW5zaW9uU2xvd0FjdGlvbiwgZXh0ZW5zaW9uLCBpbmZvLCBwcm9maWxlKTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNob3dFeHRlbnNpb25TbG93QWN0aW9uLCBleHRlbnNpb24sIGluZm8sIHByb2ZpbGUpO1xuXHR9XG59XG5cbmNsYXNzIFJlcG9ydEV4dGVuc2lvblNsb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdHJlYWRvbmx5IHJlcG9JbmZvOiBSZXBvSW5mbyxcblx0XHRyZWFkb25seSBwcm9maWxlOiBJRXh0ZW5zaW9uSG9zdFByb2ZpbGUsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9uYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdyZXBvcnQuc2xvdycsIGxvY2FsaXplKCdjbWQucmVwb3J0JywgXCJSZXBvcnQgSXNzdWVcIikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gcmV3cml0ZSBwaWkgKHBhdGhzKSBhbmQgc3RvcmUgb24gZGlza1xuXHRcdGNvbnN0IGRhdGEgPSBVdGlscy5yZXdyaXRlQWJzb2x1dGVQYXRocyh0aGlzLnByb2ZpbGUuZGF0YSwgJ3BpaV9yZW1vdmVkJyk7XG5cdFx0Y29uc3QgcGF0aCA9IGpvaW5QYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS50bXBEaXIsIGAke3RoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9LXVucmVzcG9uc2l2ZS5jcHVwcm9maWxlLnR4dGApO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShwYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGRhdGEsIHVuZGVmaW5lZCwgNCkpKTtcblxuXHRcdC8vIGJ1aWxkIGlzc3VlXG5cdFx0Y29uc3Qgb3MgPSBhd2FpdCB0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5nZXRPU1Byb3BlcnRpZXMoKTtcblx0XHRjb25zdCB0aXRsZSA9IGVuY29kZVVSSUNvbXBvbmVudCgnRXh0ZW5zaW9uIGNhdXNlcyBoaWdoIGNwdSBsb2FkJyk7XG5cdFx0Y29uc3Qgb3NWZXJzaW9uID0gYCR7b3MudHlwZX0gJHtvcy5hcmNofSAke29zLnJlbGVhc2V9YDtcblx0XHRjb25zdCBtZXNzYWdlID0gYDp3YXJuaW5nOiBNYWtlIHN1cmUgdG8gKiphdHRhY2gqKiB0aGlzIGZpbGUgZnJvbSB5b3VyICpob21lKi1kaXJlY3Rvcnk6XFxuOndhcm5pbmc6XFxgJHtwYXRofVxcYFxcblxcbkZpbmQgbW9yZSBkZXRhaWxzIGhlcmU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3dpa2kvRXhwbGFpbi1leHRlbnNpb24tY2F1c2VzLWhpZ2gtY3B1LWxvYWRgO1xuXHRcdGNvbnN0IGJvZHkgPSBlbmNvZGVVUklDb21wb25lbnQoYC0gSXNzdWUgVHlwZTogXFxgUGVyZm9ybWFuY2VcXGBcbi0gRXh0ZW5zaW9uIE5hbWU6IFxcYCR7dGhpcy5leHRlbnNpb24ubmFtZX1cXGBcbi0gRXh0ZW5zaW9uIFZlcnNpb246IFxcYCR7dGhpcy5leHRlbnNpb24udmVyc2lvbn1cXGBcbi0gT1MgVmVyc2lvbjogXFxgJHtvc1ZlcnNpb259XFxgXG4tIFZTIENvZGUgdmVyc2lvbjogXFxgJHt0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9ufVxcYFxcblxcbiR7bWVzc2FnZX1gKTtcblxuXHRcdGNvbnN0IHVybCA9IGAke3RoaXMucmVwb0luZm8uYmFzZX0vJHt0aGlzLnJlcG9JbmZvLm93bmVyfS8ke3RoaXMucmVwb0luZm8ucmVwb30vaXNzdWVzL25ldy8/Ym9keT0ke2JvZHl9JnRpdGxlPSR7dGl0bGV9YDtcblx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKHVybCkpO1xuXG5cdFx0dGhpcy5fZGlhbG9nU2VydmljZS5pbmZvKFxuXHRcdFx0bG9jYWxpemUoJ2F0dGFjaC50aXRsZScsIFwiRGlkIHlvdSBhdHRhY2ggdGhlIENQVS1Qcm9maWxlP1wiKSxcblx0XHRcdGxvY2FsaXplKCdhdHRhY2gubXNnJywgXCJUaGlzIGlzIGEgcmVtaW5kZXIgdG8gbWFrZSBzdXJlIHRoYXQgeW91IGhhdmUgbm90IGZvcmdvdHRlbiB0byBhdHRhY2ggJ3swfScgdG8gdGhlIGlzc3VlIHlvdSBoYXZlIGp1c3QgY3JlYXRlZC5cIiwgcGF0aC5mc1BhdGgpXG5cdFx0KTtcblx0fVxufVxuXG5jbGFzcyBTaG93RXh0ZW5zaW9uU2xvd0FjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0cmVhZG9ubHkgcmVwb0luZm86IFJlcG9JbmZvLFxuXHRcdHJlYWRvbmx5IHByb2ZpbGU6IElFeHRlbnNpb25Ib3N0UHJvZmlsZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cblx0KSB7XG5cdFx0c3VwZXIoJ3Nob3cuc2xvdycsIGxvY2FsaXplKCdjbWQuc2hvdycsIFwiU2hvdyBJc3N1ZXNcIikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gcmV3cml0ZSBwaWkgKHBhdGhzKSBhbmQgc3RvcmUgb24gZGlza1xuXHRcdGNvbnN0IGRhdGEgPSBVdGlscy5yZXdyaXRlQWJzb2x1dGVQYXRocyh0aGlzLnByb2ZpbGUuZGF0YSwgJ3BpaV9yZW1vdmVkJyk7XG5cdFx0Y29uc3QgcGF0aCA9IGpvaW5QYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS50bXBEaXIsIGAke3RoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9LXVucmVzcG9uc2l2ZS5jcHVwcm9maWxlLnR4dGApO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShwYXRoLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGRhdGEsIHVuZGVmaW5lZCwgNCkpKTtcblxuXHRcdC8vIHNob3cgaXNzdWVzXG5cdFx0Y29uc3QgdXJsID0gYCR7dGhpcy5yZXBvSW5mby5iYXNlfS8ke3RoaXMucmVwb0luZm8ub3duZXJ9LyR7dGhpcy5yZXBvSW5mby5yZXBvfS9pc3N1ZXM/dXRmOD1cdTI3MTMmcT1pcyUzQWlzc3VlK3N0YXRlJTNBb3BlbislMjJFeHRlbnNpb24rY2F1c2VzK2hpZ2grY3B1K2xvYWQlMjJgO1xuXHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UodXJsKSk7XG5cblx0XHR0aGlzLl9kaWFsb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRsb2NhbGl6ZSgnYXR0YWNoLnRpdGxlJywgXCJEaWQgeW91IGF0dGFjaCB0aGUgQ1BVLVByb2ZpbGU/XCIpLFxuXHRcdFx0bG9jYWxpemUoJ2F0dGFjaC5tc2cyJywgXCJUaGlzIGlzIGEgcmVtaW5kZXIgdG8gbWFrZSBzdXJlIHRoYXQgeW91IGhhdmUgbm90IGZvcmdvdHRlbiB0byBhdHRhY2ggJ3swfScgdG8gYW4gZXhpc3RpbmcgcGVyZm9ybWFuY2UgaXNzdWUuXCIsIHBhdGguZnNQYXRoKVxuXHRcdCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjO0FBRXZCLFNBQVMsV0FBVztBQUVwQixTQUFTLDZCQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGlCQUFpQixjQUFjO0FBQ3hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsYUFBYTtBQUN0QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUd6QixNQUFlLFNBQVM7QUFBQSxFQUt2QixPQUFPLGNBQWMsTUFBbUQ7QUFFdkUsUUFBSTtBQUdKLFFBQUksS0FBSyxRQUFRLE9BQU8sS0FBSyxLQUFLLFFBQVEsVUFBVTtBQUNuRCxZQUFNLE9BQU8sSUFBSSxNQUFNLEtBQUssS0FBSyxHQUFHO0FBQ3BDLFlBQU0sUUFBUSxpQ0FBaUMsS0FBSyxLQUFLLEtBQUssR0FBRztBQUNqRSxVQUFJLE9BQU87QUFDVixpQkFBUztBQUFBLFVBQ1IsTUFBTSxLQUFLLEtBQUssRUFBRSxNQUFNLE1BQU0sVUFBVSxNQUFNLE9BQU8sS0FBSyxDQUFDLEVBQUUsU0FBUyxJQUFJO0FBQUEsVUFDMUUsT0FBTyxNQUFNLENBQUM7QUFBQSxVQUNkLE1BQU0sTUFBTSxDQUFDO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLFVBQVUsS0FBSyxjQUFjLE9BQU8sS0FBSyxXQUFXLFFBQVEsVUFBVTtBQUMxRSxZQUFNLE9BQU8sSUFBSSxNQUFNLEtBQUssV0FBVyxHQUFHO0FBQzFDLFlBQU0sUUFBUSw4QkFBOEIsS0FBSyxLQUFLLFdBQVcsR0FBRztBQUNwRSxVQUFJ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
