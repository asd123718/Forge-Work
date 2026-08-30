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
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import Severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ITrustedDomainService } from "./trustedDomainService.js";
import { isURLDomainTrusted } from "../../../../platform/url/common/trustedDomains.js";
import { configureOpenerTrustedDomainsHandler, readStaticTrustedDomains } from "./trustedDomains.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
let OpenerValidatorContributions = class {
  constructor(_openerService, _storageService, _dialogService, _productService, _quickInputService, _editorService, _clipboardService, _telemetryService, _instantiationService, _configurationService, _workspaceTrustService, _trustedDomainService) {
    this._openerService = _openerService;
    this._storageService = _storageService;
    this._dialogService = _dialogService;
    this._productService = _productService;
    this._quickInputService = _quickInputService;
    this._editorService = _editorService;
    this._clipboardService = _clipboardService;
    this._telemetryService = _telemetryService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._workspaceTrustService = _workspaceTrustService;
    this._trustedDomainService = _trustedDomainService;
    this._openerService.registerValidator({ shouldOpen: (uri, options) => this.validateLink(uri, options) });
  }
  async validateLink(resource, openOptions) {
    if (!matchesScheme(resource, Schemas.http) && !matchesScheme(resource, Schemas.https)) {
      return true;
    }
    if (openOptions?.fromWorkspace && this._workspaceTrustService.isWorkspaceTrusted() && !this._configurationService.getValue("workbench.trustedDomains.promptInTrustedWorkspace")) {
      return true;
    }
    const originalResource = resource;
    let resourceUri;
    if (typeof resource === "string") {
      resourceUri = URI.parse(resource);
    } else {
      resourceUri = resource;
    }
    if (this._trustedDomainService.isValid(resourceUri)) {
      return true;
    } else {
      const { scheme, authority, path, query, fragment } = resourceUri;
      let formattedLink = `${scheme}://${authority}${path}`;
      const linkTail = `${query ? "?" + query : ""}${fragment ? "#" + fragment : ""}`;
      const remainingLength = Math.max(0, 60 - formattedLink.length);
      const linkTailLengthToKeep = Math.min(Math.max(5, remainingLength), linkTail.length);
      if (linkTailLengthToKeep === linkTail.length) {
        formattedLink += linkTail;
      } else {
        formattedLink += linkTail.charAt(0) + "..." + linkTail.substring(linkTail.length - linkTailLengthToKeep + 1);
      }
      const { result } = await this._dialogService.prompt({
        type: Severity.Info,
        message: localize(
          "openExternalLinkAt",
          "Do you want {0} to open the external website?",
          this._productService.nameShort
        ),
        detail: typeof originalResource === "string" ? originalResource : formattedLink,
        buttons: [
          {
            label: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open"),
            run: () => true
          },
          {
            label: localize({ key: "copy", comment: ["&& denotes a mnemonic"] }, "&&Copy"),
            run: () => {
              this._clipboardService.writeText(typeof originalResource === "string" ? originalResource : resourceUri.toString(true));
              return false;
            }
          },
          {
            label: localize({ key: "configureTrustedDomains", comment: ["&& denotes a mnemonic"] }, "Configure &&Trusted Domains"),
            run: async () => {
              const { trustedDomains } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
              const domainToOpen = `${scheme}://${authority}`;
              const pickedDomains = await configureOpenerTrustedDomainsHandler(
                trustedDomains,
                domainToOpen,
                resourceUri,
                this._quickInputService,
                this._storageService,
                this._editorService,
                this._telemetryService
              );
              if (pickedDomains.indexOf("*") !== -1) {
                return true;
              }
              if (isURLDomainTrusted(resourceUri, pickedDomains)) {
                return true;
              }
              return false;
            }
          }
        ],
        cancelButton: {
          run: () => false
        }
      });
      return result;
    }
  }
};
OpenerValidatorContributions = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IClipboardService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IWorkspaceTrustManagementService),
  __decorateParam(11, ITrustedDomainService)
], OpenerValidatorContributions);
export {
  OpenerValidatorContributions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVybFxcYnJvd3NlclxcdHJ1c3RlZERvbWFpbnNWYWxpZGF0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTY2hlbWFzLCBtYXRjaGVzU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UsIE9wZW5PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVHJ1c3RlZERvbWFpblNlcnZpY2UgfSBmcm9tICcuL3RydXN0ZWREb21haW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVVJMRG9tYWluVHJ1c3RlZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdHJ1c3RlZERvbWFpbnMuanMnO1xuaW1wb3J0IHsgY29uZmlndXJlT3BlbmVyVHJ1c3RlZERvbWFpbnNIYW5kbGVyLCByZWFkU3RhdGljVHJ1c3RlZERvbWFpbnMgfSBmcm9tICcuL3RydXN0ZWREb21haW5zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIE9wZW5lclZhbGlkYXRvckNvbnRyaWJ1dGlvbnMgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9xdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElUcnVzdGVkRG9tYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90cnVzdGVkRG9tYWluU2VydmljZTogSVRydXN0ZWREb21haW5TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLnJlZ2lzdGVyVmFsaWRhdG9yKHsgc2hvdWxkT3BlbjogKHVyaSwgb3B0aW9ucykgPT4gdGhpcy52YWxpZGF0ZUxpbmsodXJpLCBvcHRpb25zKSB9KTtcblx0fVxuXG5cdGFzeW5jIHZhbGlkYXRlTGluayhyZXNvdXJjZTogVVJJIHwgc3RyaW5nLCBvcGVuT3B0aW9ucz86IE9wZW5PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFtYXRjaGVzU2NoZW1lKHJlc291cmNlLCBTY2hlbWFzLmh0dHApICYmICFtYXRjaGVzU2NoZW1lKHJlc291cmNlLCBTY2hlbWFzLmh0dHBzKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKG9wZW5PcHRpb25zPy5mcm9tV29ya3NwYWNlICYmIHRoaXMuX3dvcmtzcGFjZVRydXN0U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSAmJiAhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dvcmtiZW5jaC50cnVzdGVkRG9tYWlucy5wcm9tcHRJblRydXN0ZWRXb3Jrc3BhY2UnKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxSZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdGxldCByZXNvdXJjZVVyaTogVVJJO1xuXHRcdGlmICh0eXBlb2YgcmVzb3VyY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXNvdXJjZVVyaSA9IFVSSS5wYXJzZShyZXNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc291cmNlVXJpID0gcmVzb3VyY2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3RydXN0ZWREb21haW5TZXJ2aWNlLmlzVmFsaWQocmVzb3VyY2VVcmkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgeyBzY2hlbWUsIGF1dGhvcml0eSwgcGF0aCwgcXVlcnksIGZyYWdtZW50IH0gPSByZXNvdXJjZVVyaTtcblx0XHRcdGxldCBmb3JtYXR0ZWRMaW5rID0gYCR7c2NoZW1lfTovLyR7YXV0aG9yaXR5fSR7cGF0aH1gO1xuXG5cdFx0XHRjb25zdCBsaW5rVGFpbCA9IGAke3F1ZXJ5ID8gJz8nICsgcXVlcnkgOiAnJ30ke2ZyYWdtZW50ID8gJyMnICsgZnJhZ21lbnQgOiAnJ31gO1xuXG5cblx0XHRcdGNvbnN0IHJlbWFpbmluZ0xlbmd0aCA9IE1hdGgubWF4KDAsIDYwIC0gZm9ybWF0dGVkTGluay5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgbGlua1RhaWxMZW5ndGhUb0tlZXAgPSBNYXRoLm1pbihNYXRoLm1heCg1LCByZW1haW5pbmdMZW5ndGgpLCBsaW5rVGFpbC5sZW5ndGgpO1xuXG5cdFx0XHRpZiAobGlua1RhaWxMZW5ndGhUb0tlZXAgPT09IGxpbmtUYWlsLmxlbmd0aCkge1xuXHRcdFx0XHRmb3JtYXR0ZWRMaW5rICs9IGxpbmtUYWlsO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8ga2VlcCB0aGUgZmlyc3QgY2hhciA/IG9yICNcblx0XHRcdFx0Ly8gYWRkIC4uLiBhbmQga2VlcCB0aGUgdGFpbCBlbmQgYXMgbXVjaCBhcyBwb3NzaWJsZVxuXHRcdFx0XHRmb3JtYXR0ZWRMaW5rICs9IGxpbmtUYWlsLmNoYXJBdCgwKSArICcuLi4nICsgbGlua1RhaWwuc3Vic3RyaW5nKGxpbmtUYWlsLmxlbmd0aCAtIGxpbmtUYWlsTGVuZ3RoVG9LZWVwICsgMSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdDxib29sZWFuPih7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKFxuXHRcdFx0XHRcdCdvcGVuRXh0ZXJuYWxMaW5rQXQnLFxuXHRcdFx0XHRcdCdEbyB5b3Ugd2FudCB7MH0gdG8gb3BlbiB0aGUgZXh0ZXJuYWwgd2Vic2l0ZT8nLFxuXHRcdFx0XHRcdHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRkZXRhaWw6IHR5cGVvZiBvcmlnaW5hbFJlc291cmNlID09PSAnc3RyaW5nJyA/IG9yaWdpbmFsUmVzb3VyY2UgOiBmb3JtYXR0ZWRMaW5rLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnb3BlbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgJyYmT3BlbicpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0cnVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdjb3B5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCAnJiZDb3B5JyksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQodHlwZW9mIG9yaWdpbmFsUmVzb3VyY2UgPT09ICdzdHJpbmcnID8gb3JpZ2luYWxSZXNvdXJjZSA6IHJlc291cmNlVXJpLnRvU3RyaW5nKHRydWUpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnY29uZmlndXJlVHJ1c3RlZERvbWFpbnMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sICdDb25maWd1cmUgJiZUcnVzdGVkIERvbWFpbnMnKSxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IHRydXN0ZWREb21haW5zLCB9ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVhZFN0YXRpY1RydXN0ZWREb21haW5zKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZG9tYWluVG9PcGVuID0gYCR7c2NoZW1lfTovLyR7YXV0aG9yaXR5fWA7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHBpY2tlZERvbWFpbnMgPSBhd2FpdCBjb25maWd1cmVPcGVuZXJUcnVzdGVkRG9tYWluc0hhbmRsZXIoXG5cdFx0XHRcdFx0XHRcdFx0dHJ1c3RlZERvbWFpbnMsXG5cdFx0XHRcdFx0XHRcdFx0ZG9tYWluVG9PcGVuLFxuXHRcdFx0XHRcdFx0XHRcdHJlc291cmNlVXJpLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0Ly8gVHJ1c3QgYWxsIGRvbWFpbnNcblx0XHRcdFx0XHRcdFx0aWYgKHBpY2tlZERvbWFpbnMuaW5kZXhPZignKicpICE9PSAtMSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdC8vIFRydXN0IGN1cnJlbnQgZG9tYWluXG5cdFx0XHRcdFx0XHRcdGlmIChpc1VSTERvbWFpblRydXN0ZWQocmVzb3VyY2VVcmksIHBpY2tlZERvbWFpbnMpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiBmYWxzZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLHFCQUFxQjtBQUN2QyxPQUFPLGNBQWM7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQW1DO0FBQzVDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0NBQXdDO0FBRWpELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0NBQXNDLGdDQUFnQztBQUMvRSxTQUFTLHNCQUFzQjtBQUV4QixJ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
