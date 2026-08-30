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
import { localize } from "../../../../nls.js";
import { dirname, basename } from "../../../../base/common/resources.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { PerfviewContrib } from "../browser/perfviewEditor.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { URI } from "../../../../base/common/uri.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
let StartupProfiler = class {
  constructor(_dialogService, _environmentService, _textModelResolverService, _clipboardService, lifecycleService, extensionService, _openerService, _nativeHostService, _productService, _fileService, _labelService) {
    this._dialogService = _dialogService;
    this._environmentService = _environmentService;
    this._textModelResolverService = _textModelResolverService;
    this._clipboardService = _clipboardService;
    this._openerService = _openerService;
    this._nativeHostService = _nativeHostService;
    this._productService = _productService;
    this._fileService = _fileService;
    this._labelService = _labelService;
    Promise.all([
      lifecycleService.when(LifecyclePhase.Eventually),
      extensionService.whenInstalledExtensionsRegistered()
    ]).then(() => {
      this._stopProfiling();
    });
  }
  _stopProfiling() {
    if (!this._environmentService.args["prof-startup-prefix"]) {
      return;
    }
    const profileFilenamePrefix = URI.file(this._environmentService.args["prof-startup-prefix"]);
    const dir = dirname(profileFilenamePrefix);
    const prefix = basename(profileFilenamePrefix);
    const removeArgs = ["--prof-startup"];
    const markerFile = this._fileService.readFile(profileFilenamePrefix).then((value) => removeArgs.push(...value.toString().split("|"))).then(() => this._fileService.del(profileFilenamePrefix, { recursive: true })).then(() => new Promise((resolve) => {
      const check = () => {
        this._fileService.exists(profileFilenamePrefix).then((exists) => {
          if (exists) {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        });
      };
      check();
    })).then(() => this._fileService.del(profileFilenamePrefix, { recursive: true }));
    markerFile.then(() => {
      return this._fileService.resolve(dir).then((stat) => {
        return (stat.children ? stat.children.filter((value) => value.resource.path.includes(prefix)) : []).map((stat2) => stat2.resource);
      });
    }).then((files) => {
      const profileFiles = files.reduce((prev, cur) => `${prev}${this._labelService.getUriLabel(cur)}
`, "\n");
      return this._dialogService.confirm({
        type: "info",
        message: localize("prof.message", "Successfully created profiles."),
        detail: localize("prof.detail", "Please create an issue and manually attach the following files:\n{0}", profileFiles),
        primaryButton: localize({ key: "prof.restartAndFileIssue", comment: ["&& denotes a mnemonic"] }, "&&Create Issue and Restart"),
        cancelButton: localize("prof.restart", "Restart")
      }).then((res) => {
        if (res.confirmed) {
          Promise.all([
            this._nativeHostService.showItemInFolder(files[0].fsPath),
            this._createPerfIssue(files.map((file) => basename(file)))
          ]).then(() => {
            return this._dialogService.confirm({
              type: "info",
              message: localize("prof.thanks", "Thanks for helping us."),
              detail: localize("prof.detail.restart", "A final restart is required to continue to use '{0}'. Again, thank you for your contribution.", this._productService.nameLong),
              primaryButton: localize({ key: "prof.restart.button", comment: ["&& denotes a mnemonic"] }, "&&Restart")
            }).then((res2) => {
              if (res2.confirmed) {
                this._nativeHostService.relaunch({ removeArgs });
              }
            });
          });
        } else {
          this._nativeHostService.relaunch({ removeArgs });
        }
      });
    });
  }
  async _createPerfIssue(files) {
    const reportIssueUrl = this._productService.reportIssueUrl;
    if (!reportIssueUrl) {
      return;
    }
    const contrib = PerfviewContrib.get();
    const ref = await this._textModelResolverService.createModelReference(contrib.getInputUri());
    try {
      await this._clipboardService.writeText(ref.object.textEditorModel.getValue());
    } finally {
      ref.dispose();
    }
    const body = `
1. :warning: We have copied additional data to your clipboard. Make sure to **paste** here. :warning:
1. :warning: Make sure to **attach** these files from your *home*-directory: :warning:
${files.map((file) => `-\`${file}\``).join("\n")}
`;
    const baseUrl = reportIssueUrl;
    const queryStringPrefix = baseUrl.indexOf("?") === -1 ? "?" : "&";
    this._openerService.open(URI.parse(`${baseUrl}${queryStringPrefix}body=${encodeURIComponent(body)}`));
  }
};
StartupProfiler = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, INativeWorkbenchEnvironmentService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, ILifecycleService),
  __decorateParam(5, IExtensionService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, INativeHostService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IFileService),
  __decorateParam(10, ILabelService)
], StartupProfiler);
export {
  StartupProfiler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHBlcmZvcm1hbmNlXFxlbGVjdHJvbi1icm93c2VyXFxzdGFydHVwUHJvZmlsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2VsZWN0cm9uLWJyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFBlcmZ2aWV3Q29udHJpYiB9IGZyb20gJy4uL2Jyb3dzZXIvcGVyZnZpZXdFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcblxuZXhwb3J0IGNsYXNzIFN0YXJ0dXBQcm9maWxlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0KSB7XG5cdFx0Ly8gd2FpdCBmb3IgZXZlcnl0aGluZyB0byBiZSByZWFkeVxuXHRcdFByb21pc2UuYWxsKFtcblx0XHRcdGxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KSxcblx0XHRcdGV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKClcblx0XHRdKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuX3N0b3BQcm9maWxpbmcoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BQcm9maWxpbmcoKTogdm9pZCB7XG5cblx0XHRpZiAoIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydwcm9mLXN0YXJ0dXAtcHJlZml4J10pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJvZmlsZUZpbGVuYW1lUHJlZml4ID0gVVJJLmZpbGUodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3Byb2Ytc3RhcnR1cC1wcmVmaXgnXSk7XG5cblx0XHRjb25zdCBkaXIgPSBkaXJuYW1lKHByb2ZpbGVGaWxlbmFtZVByZWZpeCk7XG5cdFx0Y29uc3QgcHJlZml4ID0gYmFzZW5hbWUocHJvZmlsZUZpbGVuYW1lUHJlZml4KTtcblxuXHRcdGNvbnN0IHJlbW92ZUFyZ3M6IHN0cmluZ1tdID0gWyctLXByb2Ytc3RhcnR1cCddO1xuXHRcdGNvbnN0IG1hcmtlckZpbGUgPSB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShwcm9maWxlRmlsZW5hbWVQcmVmaXgpLnRoZW4odmFsdWUgPT4gcmVtb3ZlQXJncy5wdXNoKC4uLnZhbHVlLnRvU3RyaW5nKCkuc3BsaXQoJ3wnKSkpXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLl9maWxlU2VydmljZS5kZWwocHJvZmlsZUZpbGVuYW1lUHJlZml4LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KSkgLy8gKDEpIGRlbGV0ZSB0aGUgZmlsZSB0byB0ZWxsIHRoZSBtYWluIHByb2Nlc3MgdG8gc3RvcCBwcm9maWxpbmdcblx0XHRcdC50aGVuKCgpID0+IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyAvLyAoMikgd2FpdCBmb3IgbWFpbiB0aGF0IHJlY3JlYXRlcyB0aGUgZmFpbCB0byBzaWduYWwgcHJvZmlsaW5nIGhhcyBzdG9wcGVkXG5cdFx0XHRcdGNvbnN0IGNoZWNrID0gKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhwcm9maWxlRmlsZW5hbWVQcmVmaXgpLnRoZW4oZXhpc3RzID0+IHtcblx0XHRcdFx0XHRcdGlmIChleGlzdHMpIHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c2V0VGltZW91dChjaGVjaywgNTAwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fTtcblx0XHRcdFx0Y2hlY2soKTtcblx0XHRcdH0pKVxuXHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHByb2ZpbGVGaWxlbmFtZVByZWZpeCwgeyByZWN1cnNpdmU6IHRydWUgfSkpOyAvLyAoMykgZmluYWxseSBkZWxldGUgdGhlIGZpbGUgYWdhaW5cblxuXHRcdG1hcmtlckZpbGUudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShkaXIpLnRoZW4oc3RhdCA9PiB7XG5cdFx0XHRcdHJldHVybiAoc3RhdC5jaGlsZHJlbiA/IHN0YXQuY2hpbGRyZW4uZmlsdGVyKHZhbHVlID0+IHZhbHVlLnJlc291cmNlLnBhdGguaW5jbHVkZXMocHJlZml4KSkgOiBbXSkubWFwKHN0YXQgPT4gc3RhdC5yZXNvdXJjZSk7XG5cdFx0XHR9KTtcblx0XHR9KS50aGVuKGZpbGVzID0+IHtcblx0XHRcdGNvbnN0IHByb2ZpbGVGaWxlcyA9IGZpbGVzLnJlZHVjZSgocHJldiwgY3VyKSA9PiBgJHtwcmV2fSR7dGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGN1cil9XFxuYCwgJ1xcbicpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncHJvZi5tZXNzYWdlJywgXCJTdWNjZXNzZnVsbHkgY3JlYXRlZCBwcm9maWxlcy5cIiksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Byb2YuZGV0YWlsJywgXCJQbGVhc2UgY3JlYXRlIGFuIGlzc3VlIGFuZCBtYW51YWxseSBhdHRhY2ggdGhlIGZvbGxvd2luZyBmaWxlczpcXG57MH1cIiwgcHJvZmlsZUZpbGVzKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdwcm9mLnJlc3RhcnRBbmRGaWxlSXNzdWUnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDcmVhdGUgSXNzdWUgYW5kIFJlc3RhcnRcIiksXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjogbG9jYWxpemUoJ3Byb2YucmVzdGFydCcsIFwiUmVzdGFydFwiKVxuXHRcdFx0fSkudGhlbihyZXMgPT4ge1xuXHRcdFx0XHRpZiAocmVzLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdFByb21pc2UuYWxsPGFueT4oW1xuXHRcdFx0XHRcdFx0dGhpcy5fbmF0aXZlSG9zdFNlcnZpY2Uuc2hvd0l0ZW1JbkZvbGRlcihmaWxlc1swXS5mc1BhdGgpLFxuXHRcdFx0XHRcdFx0dGhpcy5fY3JlYXRlUGVyZklzc3VlKGZpbGVzLm1hcChmaWxlID0+IGJhc2VuYW1lKGZpbGUpKSlcblx0XHRcdFx0XHRdKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdC8vIGtlZXAgd2luZG93IHN0YWJsZSB1bnRpbCByZXN0YXJ0IGlzIHNlbGVjdGVkXG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2luZm8nLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgncHJvZi50aGFua3MnLCBcIlRoYW5rcyBmb3IgaGVscGluZyB1cy5cIiksXG5cdFx0XHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Byb2YuZGV0YWlsLnJlc3RhcnQnLCBcIkEgZmluYWwgcmVzdGFydCBpcyByZXF1aXJlZCB0byBjb250aW51ZSB0byB1c2UgJ3swfScuIEFnYWluLCB0aGFuayB5b3UgZm9yIHlvdXIgY29udHJpYnV0aW9uLlwiLCB0aGlzLl9wcm9kdWN0U2VydmljZS5uYW1lTG9uZyksXG5cdFx0XHRcdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAncHJvZi5yZXN0YXJ0LmJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlc3RhcnRcIilcblx0XHRcdFx0XHRcdH0pLnRoZW4ocmVzID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gbm93IHdlIGFyZSByZWFkeSB0byByZXN0YXJ0XG5cdFx0XHRcdFx0XHRcdGlmIChyZXMuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UucmVsYXVuY2goeyByZW1vdmVBcmdzIH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHNpbXBseSByZXN0YXJ0XG5cdFx0XHRcdFx0dGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UucmVsYXVuY2goeyByZW1vdmVBcmdzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVBlcmZJc3N1ZShmaWxlczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXBvcnRJc3N1ZVVybCA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnJlcG9ydElzc3VlVXJsO1xuXHRcdGlmICghcmVwb3J0SXNzdWVVcmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmliID0gUGVyZnZpZXdDb250cmliLmdldCgpO1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjb250cmliLmdldElucHV0VXJpKCkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRjb25zdCBib2R5ID0gYFxuMS4gOndhcm5pbmc6IFdlIGhhdmUgY29waWVkIGFkZGl0aW9uYWwgZGF0YSB0byB5b3VyIGNsaXBib2FyZC4gTWFrZSBzdXJlIHRvICoqcGFzdGUqKiBoZXJlLiA6d2FybmluZzpcbjEuIDp3YXJuaW5nOiBNYWtlIHN1cmUgdG8gKiphdHRhY2gqKiB0aGVzZSBmaWxlcyBmcm9tIHlvdXIgKmhvbWUqLWRpcmVjdG9yeTogOndhcm5pbmc6XFxuJHtmaWxlcy5tYXAoZmlsZSA9PiBgLVxcYCR7ZmlsZX1cXGBgKS5qb2luKCdcXG4nKX1cbmA7XG5cblx0XHRjb25zdCBiYXNlVXJsID0gcmVwb3J0SXNzdWVVcmw7XG5cdFx0Y29uc3QgcXVlcnlTdHJpbmdQcmVmaXggPSBiYXNlVXJsLmluZGV4T2YoJz8nKSA9PT0gLTEgPyAnPycgOiAnJic7XG5cblx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKGAke2Jhc2VVcmx9JHtxdWVyeVN0cmluZ1ByZWZpeH1ib2R5PSR7ZW5jb2RlVVJJQ29tcG9uZW50KGJvZHkpfWApKTtcblx0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
