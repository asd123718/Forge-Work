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
import * as platform from "../../../../base/common/platform.js";
import { dedupExtensions } from "../common/extensionsUtil.js";
import { IExtensionsScannerService, toExtensionDescription as toExtensionDescriptionFromScannedExtension } from "../../../../platform/extensionManagement/common/extensionsScannerService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { timeout } from "../../../../base/common/async.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { toExtensionDescription } from "../common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
let CachedExtensionScanner = class {
  constructor(_notificationService, _hostService, _extensionsScannerService, _userDataProfileService, _extensionManagementService, _environmentService, _logService) {
    this._notificationService = _notificationService;
    this._hostService = _hostService;
    this._extensionsScannerService = _extensionsScannerService;
    this._userDataProfileService = _userDataProfileService;
    this._extensionManagementService = _extensionManagementService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this.scannedExtensions = new Promise((resolve, reject) => {
      this._scannedExtensionsResolve = resolve;
      this._scannedExtensionsReject = reject;
    });
  }
  async startScanningExtensions() {
    try {
      const extensions = await this._scanInstalledExtensions();
      this._scannedExtensionsResolve(extensions);
    } catch (err) {
      this._scannedExtensionsReject(err);
    }
  }
  async _scanInstalledExtensions() {
    try {
      const language = platform.language;
      const result = await Promise.allSettled([
        this._extensionsScannerService.scanSystemExtensions({ language, checkControlFile: true }),
        this._extensionsScannerService.scanUserExtensions({ language, profileLocation: this._userDataProfileService.currentProfile.extensionsResource, useCache: true }),
        this._environmentService.remoteAuthority ? [] : this._extensionManagementService.getInstalledWorkspaceExtensions(false)
      ]);
      let hasErrors = false;
      let scannedSystemExtensions = [];
      if (result[0].status === "fulfilled") {
        scannedSystemExtensions = result[0].value;
      } else {
        hasErrors = true;
        this._logService.error(`Error scanning system extensions:`, getErrorMessage(result[0].reason));
      }
      let scannedUserExtensions = [];
      if (result[1].status === "fulfilled") {
        scannedUserExtensions = result[1].value;
      } else {
        hasErrors = true;
        this._logService.error(`Error scanning user extensions:`, getErrorMessage(result[1].reason));
      }
      let workspaceExtensions = [];
      if (result[2].status === "fulfilled") {
        workspaceExtensions = result[2].value;
      } else {
        hasErrors = true;
        this._logService.error(`Error scanning workspace extensions:`, getErrorMessage(result[2].reason));
      }
      const scannedDevelopedExtensions = [];
      try {
        const allScannedDevelopedExtensions = await this._extensionsScannerService.scanExtensionsUnderDevelopment([...scannedSystemExtensions, ...scannedUserExtensions], { language, includeInvalid: true });
        const invalidExtensions = [];
        for (const extensionUnderDevelopment of allScannedDevelopedExtensions) {
          if (extensionUnderDevelopment.isValid) {
            scannedDevelopedExtensions.push(extensionUnderDevelopment);
          } else {
            invalidExtensions.push(extensionUnderDevelopment);
          }
        }
        if (invalidExtensions.length > 0) {
          this._notificationService.prompt(
            Severity.Warning,
            invalidExtensions.length === 1 ? localize("extensionUnderDevelopment.invalid", "Failed loading extension '{0}' under development because it is invalid: {1}", invalidExtensions[0].location.fsPath, invalidExtensions[0].validations[0][1]) : localize("extensionsUnderDevelopment.invalid", "Failed loading extensions {0} under development because they are invalid: {1}", invalidExtensions.map((ext) => `'${ext.location.fsPath}'`).join(", "), invalidExtensions.map((ext) => `${ext.validations[0][1]}`).join(", ")),
            []
          );
        }
      } catch (error) {
        this._logService.error(error);
      }
      const system = scannedSystemExtensions.map((e) => toExtensionDescriptionFromScannedExtension(e, false));
      const user = scannedUserExtensions.map((e) => toExtensionDescriptionFromScannedExtension(e, false));
      const workspace = workspaceExtensions.map((e) => toExtensionDescription(e, false));
      const development = scannedDevelopedExtensions.map((e) => toExtensionDescriptionFromScannedExtension(e, true));
      const r = dedupExtensions(system, user, workspace, development, this._logService);
      if (!hasErrors) {
        const disposable = this._extensionsScannerService.onDidChangeCache(() => {
          disposable.dispose();
          this._notificationService.prompt(
            Severity.Error,
            localize("extensionCache.invalid", "Extensions have been modified on disk. Please reload the window."),
            [{
              label: localize("reloadWindow", "Reload Window"),
              run: () => this._hostService.reload()
            }]
          );
        });
        timeout(5e3).then(() => disposable.dispose());
      }
      return r;
    } catch (err) {
      this._logService.error(`Error scanning installed extensions:`);
      this._logService.error(err);
      return [];
    }
  }
};
CachedExtensionScanner = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IHostService),
  __decorateParam(2, IExtensionsScannerService),
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IWorkbenchExtensionManagementService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, ILogService)
], CachedExtensionScanner);
export {
  CachedExtensionScanner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxleHRlbnNpb25zXFxlbGVjdHJvbi1icm93c2VyXFxjYWNoZWRFeHRlbnNpb25TY2FubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBJRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBkZWR1cEV4dGVuc2lvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uc1V0aWwuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSwgSVNjYW5uZWRFeHRlbnNpb24sIHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24gYXMgdG9FeHRlbnNpb25EZXNjcmlwdGlvbkZyb21TY2FubmVkRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgdG9FeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIENhY2hlZEV4dGVuc2lvblNjYW5uZXIge1xuXG5cdHB1YmxpYyByZWFkb25seSBzY2FubmVkRXh0ZW5zaW9uczogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXT47XG5cdHByaXZhdGUgX3NjYW5uZWRFeHRlbnNpb25zUmVzb2x2ZSE6IChyZXN1bHQ6IElFeHRlbnNpb25EZXNjcmlwdGlvbltdKSA9PiB2b2lkO1xuXHRwcml2YXRlIF9zY2FubmVkRXh0ZW5zaW9uc1JlamVjdCE6IChlcnI6IHVua25vd24pID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNTY2FubmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25zU2Nhbm5lclNlcnZpY2U6IElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLnNjYW5uZWRFeHRlbnNpb25zID0gbmV3IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uW10+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHRoaXMuX3NjYW5uZWRFeHRlbnNpb25zUmVzb2x2ZSA9IHJlc29sdmU7XG5cdFx0XHR0aGlzLl9zY2FubmVkRXh0ZW5zaW9uc1JlamVjdCA9IHJlamVjdDtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzdGFydFNjYW5uaW5nRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX3NjYW5JbnN0YWxsZWRFeHRlbnNpb25zKCk7XG5cdFx0XHR0aGlzLl9zY2FubmVkRXh0ZW5zaW9uc1Jlc29sdmUoZXh0ZW5zaW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9zY2FubmVkRXh0ZW5zaW9uc1JlamVjdChlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NjYW5JbnN0YWxsZWRFeHRlbnNpb25zKCk6IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uW10+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBwbGF0Zm9ybS5sYW5ndWFnZTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZChbXG5cdFx0XHRcdHRoaXMuX2V4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuU3lzdGVtRXh0ZW5zaW9ucyh7IGxhbmd1YWdlLCBjaGVja0NvbnRyb2xGaWxlOiB0cnVlIH0pLFxuXHRcdFx0XHR0aGlzLl9leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblVzZXJFeHRlbnNpb25zKHsgbGFuZ3VhZ2UsIHByb2ZpbGVMb2NhdGlvbjogdGhpcy5fdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5leHRlbnNpb25zUmVzb3VyY2UsIHVzZUNhY2hlOiB0cnVlIH0pLFxuXHRcdFx0XHR0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ID8gW10gOiB0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWRXb3Jrc3BhY2VFeHRlbnNpb25zKGZhbHNlKVxuXHRcdFx0XSk7XG5cblx0XHRcdGxldCBoYXNFcnJvcnMgPSBmYWxzZTtcblxuXHRcdFx0bGV0IHNjYW5uZWRTeXN0ZW1FeHRlbnNpb25zOiBJU2Nhbm5lZEV4dGVuc2lvbltdID0gW107XG5cdFx0XHRpZiAocmVzdWx0WzBdLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcblx0XHRcdFx0c2Nhbm5lZFN5c3RlbUV4dGVuc2lvbnMgPSByZXN1bHRbMF0udmFsdWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRoYXNFcnJvcnMgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciBzY2FubmluZyBzeXN0ZW0gZXh0ZW5zaW9uczpgLCBnZXRFcnJvck1lc3NhZ2UocmVzdWx0WzBdLnJlYXNvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2Nhbm5lZFVzZXJFeHRlbnNpb25zOiBJU2Nhbm5lZEV4dGVuc2lvbltdID0gW107XG5cdFx0XHRpZiAocmVzdWx0WzFdLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcblx0XHRcdFx0c2Nhbm5lZFVzZXJFeHRlbnNpb25zID0gcmVzdWx0WzFdLnZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGFzRXJyb3JzID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRXJyb3Igc2Nhbm5pbmcgdXNlciBleHRlbnNpb25zOmAsIGdldEVycm9yTWVzc2FnZShyZXN1bHRbMV0ucmVhc29uKSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCB3b3Jrc3BhY2VFeHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdGlmIChyZXN1bHRbMl0uc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuXHRcdFx0XHR3b3Jrc3BhY2VFeHRlbnNpb25zID0gcmVzdWx0WzJdLnZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGFzRXJyb3JzID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRXJyb3Igc2Nhbm5pbmcgd29ya3NwYWNlIGV4dGVuc2lvbnM6YCwgZ2V0RXJyb3JNZXNzYWdlKHJlc3VsdFsyXS5yZWFzb24pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Nhbm5lZERldmVsb3BlZEV4dGVuc2lvbnM6IElTY2FubmVkRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGFsbFNjYW5uZWREZXZlbG9wZWRFeHRlbnNpb25zID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5FeHRlbnNpb25zVW5kZXJEZXZlbG9wbWVudChbLi4uc2Nhbm5lZFN5c3RlbUV4dGVuc2lvbnMsIC4uLnNjYW5uZWRVc2VyRXh0ZW5zaW9uc10sIHsgbGFuZ3VhZ2UsIGluY2x1ZGVJbnZhbGlkOiB0cnVlIH0pO1xuXHRcdFx0XHRjb25zdCBpbnZhbGlkRXh0ZW5zaW9uczogSVNjYW5uZWRFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvblVuZGVyRGV2ZWxvcG1lbnQgb2YgYWxsU2Nhbm5lZERldmVsb3BlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uVW5kZXJEZXZlbG9wbWVudC5pc1ZhbGlkKSB7XG5cdFx0XHRcdFx0XHRzY2FubmVkRGV2ZWxvcGVkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvblVuZGVyRGV2ZWxvcG1lbnQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpbnZhbGlkRXh0ZW5zaW9ucy5wdXNoKGV4dGVuc2lvblVuZGVyRGV2ZWxvcG1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW52YWxpZEV4dGVuc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdGludmFsaWRFeHRlbnNpb25zLmxlbmd0aCA9PT0gMVxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdleHRlbnNpb25VbmRlckRldmVsb3BtZW50LmludmFsaWQnLCBcIkZhaWxlZCBsb2FkaW5nIGV4dGVuc2lvbiAnezB9JyB1bmRlciBkZXZlbG9wbWVudCBiZWNhdXNlIGl0IGlzIGludmFsaWQ6IHsxfVwiLCBpbnZhbGlkRXh0ZW5zaW9uc1swXS5sb2NhdGlvbi5mc1BhdGgsIGludmFsaWRFeHRlbnNpb25zWzBdLnZhbGlkYXRpb25zWzBdWzFdKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdleHRlbnNpb25zVW5kZXJEZXZlbG9wbWVudC5pbnZhbGlkJywgXCJGYWlsZWQgbG9hZGluZyBleHRlbnNpb25zIHswfSB1bmRlciBkZXZlbG9wbWVudCBiZWNhdXNlIHRoZXkgYXJlIGludmFsaWQ6IHsxfVwiLCBpbnZhbGlkRXh0ZW5zaW9ucy5tYXAoZXh0ID0+IGAnJHtleHQubG9jYXRpb24uZnNQYXRofSdgKS5qb2luKCcsICcpLCBpbnZhbGlkRXh0ZW5zaW9ucy5tYXAoZXh0ID0+IGAke2V4dC52YWxpZGF0aW9uc1swXVsxXX1gKS5qb2luKCcsICcpKSxcblx0XHRcdFx0XHRcdFtdXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN5c3RlbSA9IHNjYW5uZWRTeXN0ZW1FeHRlbnNpb25zLm1hcChlID0+IHRvRXh0ZW5zaW9uRGVzY3JpcHRpb25Gcm9tU2Nhbm5lZEV4dGVuc2lvbihlLCBmYWxzZSkpO1xuXHRcdFx0Y29uc3QgdXNlciA9IHNjYW5uZWRVc2VyRXh0ZW5zaW9ucy5tYXAoZSA9PiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uRnJvbVNjYW5uZWRFeHRlbnNpb24oZSwgZmFsc2UpKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHdvcmtzcGFjZUV4dGVuc2lvbnMubWFwKGUgPT4gdG9FeHRlbnNpb25EZXNjcmlwdGlvbihlLCBmYWxzZSkpO1xuXHRcdFx0Y29uc3QgZGV2ZWxvcG1lbnQgPSBzY2FubmVkRGV2ZWxvcGVkRXh0ZW5zaW9ucy5tYXAoZSA9PiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uRnJvbVNjYW5uZWRFeHRlbnNpb24oZSwgdHJ1ZSkpO1xuXHRcdFx0Y29uc3QgciA9IGRlZHVwRXh0ZW5zaW9ucyhzeXN0ZW0sIHVzZXIsIHdvcmtzcGFjZSwgZGV2ZWxvcG1lbnQsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0XHRpZiAoIWhhc0Vycm9ycykge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlQ2FjaGUoKCkgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0U2V2ZXJpdHkuRXJyb3IsXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnZXh0ZW5zaW9uQ2FjaGUuaW52YWxpZCcsIFwiRXh0ZW5zaW9ucyBoYXZlIGJlZW4gbW9kaWZpZWQgb24gZGlzay4gUGxlYXNlIHJlbG9hZCB0aGUgd2luZG93LlwiKSxcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVsb2FkV2luZG93JywgXCJSZWxvYWQgV2luZG93XCIpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuX2hvc3RTZXJ2aWNlLnJlbG9hZCgpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aW1lb3V0KDUwMDApLnRoZW4oKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHNjYW5uaW5nIGluc3RhbGxlZCBleHRlbnNpb25zOmApO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksY0FBYztBQUUxQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUE4QywwQkFBMEIsa0RBQWtEO0FBQ25JLFNBQVMsbUJBQW1CO0FBQzVCLE9BQU8sY0FBYztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQ0FBb0M7QUFFdEMsSUFBTSx5QkFBTixNQUE2QjtBQUFBLEVBTW5DLFlBQ3dDLHNCQUNSLGNBQ2EsMkJBQ0YseUJBQ2EsNkJBQ1IscUJBQ2pCLGFBQzdCO0FBUHNDO0FBQ1I7QUFDYTtBQUNGO0FBQ2E7QUFDUjtBQUNqQjtBQUU5QixTQUFLLG9CQUFvQixJQUFJLFFBQWlDLENBQUMsU0FBUyxXQUFXO0FBQ2xGLFdBQUssNEJBQTRCO0FBQ2pDLFdBQUssMkJBQTJCO0FBQUEsSUFDakMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWEsMEJBQXlDO0FBQ3JELFFBQUk7QUFDSCxZQUFNLGFBQWEsTUFBTSxLQUFLLHlCQUF5QjtBQUN2RCxXQUFLLDBCQUEwQixVQUFVO0FBQUEsSUFDMUMsU0FBUyxLQUFLO0FBQ2IsV0FBSyx5QkFBeUIsR0FBRztBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYywyQkFBNkQ7QUFDMUUsUUFBSTtBQUNILFlBQU0sV0FBVyxTQUFTO0FBQzFCLFlBQU0sU0FBUyxNQUFNLFFBQVEsV0FBVztBQUFBLFFBQ3ZDLEtBQUssMEJBQTBCLHFCQUFxQixFQUFFLFVBQVUsa0JBQWtCLEtBQUssQ0FBQztBQUFBLFFBQ3hGLEtBQUssMEJBQTBCLG1CQUFtQixFQUFFLFVBQVUsaUJBQWlCLEtBQUssd0JBQXdCLGVBQWUsb0JBQW9CLFVBQVUsS0FBSyxDQUFDO0FBQUEsUUFDL0osS0FBSyxvQkFBb0Isa0JBQWtCLENBQUMsSUFBSSxLQUFLLDRCQUE0QixnQ0FBZ0MsS0FBSztBQUFBLE1BQ3ZILENBQUM7QUFFRCxVQUFJLFlBQVk7QUFFaEIsVUFBSSwwQkFBK0MsQ0FBQztBQUNwRCxVQUFJLE9BQU8sQ0FBQyxFQUFFLFdBQVcsYUFBYTtBQUNyQyxrQ0FBMEIsT0FBTyxDQUFDLEVBQUU7QUFBQSxNQUNyQyxPQUFPO0FBQ04sb0JBQVk7QUFDWixhQUFLLFlBQVksTUFBTSxxQ0FBcUMsZ0JBQWdCLE9BQU8sQ0FBQyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQzlGO0FBRUEsVUFBSSx3QkFBNkMsQ0FBQztBQUNsRCxVQUFJLE9BQU8sQ0FBQyxFQUFFLFdBQVcsYUFBYTtBQUNyQyxnQ0FBd0IsT0FBTyxDQUFDLEVBQUU7QUFBQSxNQUNuQyxPQUFPO0FBQ04sb0JBQVk7QUFDWixhQUFLLFlBQVksTUFBTSxtQ0FBbUMsZ0JBQWdCLE9BQU8sQ0FBQyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQzVGO0FBRUEsVUFBSSxzQkFBb0MsQ0FBQztBQUN6QyxVQUFJLE9BQU8sQ0FBQyxFQUFFLFdBQVcsYUFBYTtBQUNyQyw4QkFBc0IsT0FBTyxDQUFDLEVBQUU7QUFBQSxNQUNqQyxPQUFPO0FBQ04sb0JBQVk7QUFDWixhQUFLLFlBQVksTUFBTSx3Q0FBd0MsZ0JBQWdCLE9BQU8sQ0FBQyxFQUFFLE1BQU0sQ0FBQztBQUFBLE1BQ2pHO0FBRUEsWUFBTSw2QkFBa0QsQ0FBQztBQUN6RCxVQUFJO0FBQ0gsY0FBTSxnQ0FBZ0MsTUFBTSxLQUFLLDBCQUEwQiwrQkFBK0IsQ0FBQyxHQUFHLHlCQUF5QixHQUFHLHFCQUFxQixHQUFHLEVBQUUsVUFBVSxnQkFBZ0IsS0FBSyxDQUFDO0FBQ3BNLGNBQU0sb0JBQXlDLENBQUM7QUFDaEQsbUJBQVcsNkJBQTZCLCtCQUErQjtBQUN0RSxjQUFJLDBCQUEwQixTQUFTO0FBQ3RDLHVDQUEyQixLQUFLLHlCQUF5QjtBQUFBLFVBQzFELE9BQU87QUFDTiw4QkFBa0IsS0FBSyx5QkFBeUI7QUFBQSxVQUNqRDtBQUFBLFFBQ0Q7QUFDQSxZQUFJLGtCQUFrQixTQUFTLEdBQUc7QUFDakMsZUFBSyxxQkFBcUI7QUFBQSxZQUN6QixTQUFTO0FBQUEsWUFDVCxrQkFBa0IsV0FBVyxJQUMxQixTQUFTLHFDQUFxQywrRUFBK0Usa0JBQWtCLENBQUMsRUFBRSxTQUFTLFFBQVEsa0JBQWtCLENBQUMsRUFBRSxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUMsSUFDek0sU0FBUyxzQ0FBc0MsaUZBQWlGLGtCQUFrQixJQUFJLFNBQU8sSUFBSSxJQUFJLFNBQVMsTUFBTSxHQUFHLEVBQUUsS0FBSyxJQUFJLEdBQUcsa0JBQWtCLElBQUksU0FBTyxHQUFHLElBQUksWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLFlBQzNRLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsYUFBSyxZQUFZLE1BQU0sS0FBSztBQUFBLE1BQzdCO0FBRUEsWUFBTSxTQUFTLHdCQUF3QixJQUFJLE9BQUssMkNBQTJDLEdBQUcsS0FBSyxDQUFDO0FBQ3BHLFlBQU0sT0FBTyxzQkFBc0IsSUFBSSxPQUFLLDJDQUEyQyxHQUFHLEtBQUssQ0FBQztBQUNoRyxZQUFNLFlBQVksb0JBQW9CLElBQUksT0FBSyx1QkFBdUIsR0FBRyxLQUFLLENBQUM7QUFDL0UsWUFBTSxjQUFjLDJCQUEyQixJQUFJLE9BQUssMkNBQTJDLEdBQUcsSUFBSSxDQUFDO0FBQzNHLFlBQU0sSUFBSSxnQkFBZ0IsUUFBUSxNQUFNLFdBQVcsYUFBYSxLQUFLLFdBQVc7QUFFaEYsVUFBSSxDQUFDLFdBQVc7QUFDZixjQUFNLGFBQWEsS0FBSywwQkFBMEIsaUJBQWlCLE1BQU07QUFDeEUscUJBQVcsUUFBUTtBQUNuQixlQUFLLHFCQUFxQjtBQUFBLFlBQ3pCLFNBQVM7QUFBQSxZQUNULFNBQVMsMEJBQTBCLGtFQUFrRTtBQUFBLFlBQ3JHLENBQUM7QUFBQSxjQUNBLE9BQU8sU0FBUyxnQkFBZ0IsZUFBZTtBQUFBLGNBQy9DLEtBQUssTUFBTSxLQUFLLGFBQWEsT0FBTztBQUFBLFlBQ3JDLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRCxDQUFDO0FBQ0QsZ0JBQVEsR0FBSSxFQUFFLEtBQUssTUFBTSxXQUFXLFFBQVEsQ0FBQztBQUFBLE1BQzlDO0FBRUEsYUFBTztBQUFBLElBQ1IsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLE1BQU0sc0NBQXNDO0FBQzdELFdBQUssWUFBWSxNQUFNLEdBQUc7QUFDMUIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFFRDtBQXRIYSx5QkFBTjtBQUFBLEVBT0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWJVOyIsCiAgIm5hbWVzIjogW10KfQo=
