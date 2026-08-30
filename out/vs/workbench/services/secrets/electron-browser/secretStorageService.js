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
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { isLinux } from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IEncryptionService, KnownStorageProvider, PasswordStoreCLIOption, isGnome, isKwallet } from "../../../../platform/encryption/common/encryptionService.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { BaseSecretStorageService, ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IJSONEditingService } from "../../configuration/common/jsonEditing.js";
let NativeSecretStorageService = class extends BaseSecretStorageService {
  constructor(_notificationService, _dialogService, _openerService, _jsonEditingService, _environmentService, storageService, encryptionService, logService) {
    super(
      !!_environmentService.useInMemorySecretStorage,
      storageService,
      encryptionService,
      logService
    );
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._openerService = _openerService;
    this._jsonEditingService = _jsonEditingService;
    this._environmentService = _environmentService;
    this.notifyOfNoEncryptionOnce = createSingleCallFunction(() => this.notifyOfNoEncryption());
  }
  set(key, value) {
    this._sequencer.queue(key, async () => {
      await this.resolvedStorageService;
      if (this.type !== "persisted" && !this._environmentService.useInMemorySecretStorage) {
        this._logService.trace("[NativeSecretStorageService] Notifying user that secrets are not being stored on disk.");
        await this.notifyOfNoEncryptionOnce();
      }
    });
    return super.set(key, value);
  }
  async notifyOfNoEncryption() {
    const buttons = [];
    const troubleshootingButton = {
      label: localize("troubleshootingButton", "Open troubleshooting guide"),
      run: () => this._openerService.open("https://go.microsoft.com/fwlink/?linkid=2239490"),
      // doesn't close dialogs
      keepOpen: true
    };
    buttons.push(troubleshootingButton);
    let errorMessage = localize("encryptionNotAvailableJustTroubleshootingGuide", "An OS keyring couldn't be identified for storing the encryption related data in your current desktop environment.");
    if (!isLinux) {
      this._notificationService.prompt(Severity.Error, errorMessage, buttons);
      return;
    }
    const provider = await this._encryptionService.getKeyStorageProvider();
    if (provider === KnownStorageProvider.basicText) {
      const detail = localize("usePlainTextExtraSentence", "Open the troubleshooting guide to address this or you can use weaker encryption that doesn't use the OS keyring.");
      const usePlainTextButton = {
        label: localize("usePlainText", "Use weaker encryption"),
        run: async () => {
          await this._encryptionService.setUsePlainTextEncryption();
          await this._jsonEditingService.write(this._environmentService.argvResource, [{ path: ["password-store"], value: PasswordStoreCLIOption.basic }], true);
          this.reinitialize();
        }
      };
      buttons.unshift(usePlainTextButton);
      await this._dialogService.prompt({
        type: "error",
        buttons,
        message: errorMessage,
        detail
      });
      return;
    }
    if (isGnome(provider)) {
      errorMessage = localize("isGnome", "You're running in a GNOME environment but the OS keyring is not available for encryption. Ensure you have gnome-keyring or another libsecret compatible implementation installed and running.");
    } else if (isKwallet(provider)) {
      errorMessage = localize("isKwallet", "You're running in a KDE environment but the OS keyring is not available for encryption. Ensure you have kwallet running.");
    }
    this._notificationService.prompt(Severity.Error, errorMessage, buttons);
  }
};
NativeSecretStorageService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IJSONEditingService),
  __decorateParam(4, INativeEnvironmentService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IEncryptionService),
  __decorateParam(7, ILogService)
], NativeSecretStorageService);
registerSingleton(ISecretStorageService, NativeSecretStorageService, InstantiationType.Delayed);
export {
  NativeSecretStorageService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWNyZXRzXFxlbGVjdHJvbi1icm93c2VyXFxzZWNyZXRTdG9yYWdlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Z1bmN0aW9uYWwuanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVuY3J5cHRpb25TZXJ2aWNlLCBLbm93blN0b3JhZ2VQcm92aWRlciwgUGFzc3dvcmRTdG9yZUNMSU9wdGlvbiwgaXNHbm9tZSwgaXNLd2FsbGV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW5jcnlwdGlvbi9jb21tb24vZW5jcnlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZSwgSVNlY3JldFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc2VjcmV0cy9jb21tb24vc2VjcmV0cy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElKU09ORWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9qc29uRWRpdGluZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVTZWNyZXRTdG9yYWdlU2VydmljZSBleHRlbmRzIEJhc2VTZWNyZXRTdG9yYWdlU2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfanNvbkVkaXRpbmdTZXJ2aWNlOiBJSlNPTkVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFbmNyeXB0aW9uU2VydmljZSBlbmNyeXB0aW9uU2VydmljZTogSUVuY3J5cHRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdCEhX2Vudmlyb25tZW50U2VydmljZS51c2VJbk1lbW9yeVNlY3JldFN0b3JhZ2UsXG5cdFx0XHRzdG9yYWdlU2VydmljZSxcblx0XHRcdGVuY3J5cHRpb25TZXJ2aWNlLFxuXHRcdFx0bG9nU2VydmljZVxuXHRcdCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXQoa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zZXF1ZW5jZXIucXVldWUoa2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlc29sdmVkU3RvcmFnZVNlcnZpY2U7XG5cblx0XHRcdGlmICh0aGlzLnR5cGUgIT09ICdwZXJzaXN0ZWQnICYmICF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlSW5NZW1vcnlTZWNyZXRTdG9yYWdlKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tOYXRpdmVTZWNyZXRTdG9yYWdlU2VydmljZV0gTm90aWZ5aW5nIHVzZXIgdGhhdCBzZWNyZXRzIGFyZSBub3QgYmVpbmcgc3RvcmVkIG9uIGRpc2suJyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMubm90aWZ5T2ZOb0VuY3J5cHRpb25PbmNlKCk7XG5cdFx0XHR9XG5cblx0XHR9KTtcblxuXHRcdHJldHVybiBzdXBlci5zZXQoa2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG5vdGlmeU9mTm9FbmNyeXB0aW9uT25jZSA9IGNyZWF0ZVNpbmdsZUNhbGxGdW5jdGlvbigoKSA9PiB0aGlzLm5vdGlmeU9mTm9FbmNyeXB0aW9uKCkpO1xuXHRwcml2YXRlIGFzeW5jIG5vdGlmeU9mTm9FbmNyeXB0aW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJ1dHRvbnM6IElQcm9tcHRDaG9pY2VbXSA9IFtdO1xuXHRcdGNvbnN0IHRyb3VibGVzaG9vdGluZ0J1dHRvbjogSVByb21wdENob2ljZSA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndHJvdWJsZXNob290aW5nQnV0dG9uJywgXCJPcGVuIHRyb3VibGVzaG9vdGluZyBndWlkZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKCdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9MjIzOTQ5MCcpLFxuXHRcdFx0Ly8gZG9lc24ndCBjbG9zZSBkaWFsb2dzXG5cdFx0XHRrZWVwT3BlbjogdHJ1ZVxuXHRcdH07XG5cdFx0YnV0dG9ucy5wdXNoKHRyb3VibGVzaG9vdGluZ0J1dHRvbik7XG5cblx0XHRsZXQgZXJyb3JNZXNzYWdlID0gbG9jYWxpemUoJ2VuY3J5cHRpb25Ob3RBdmFpbGFibGVKdXN0VHJvdWJsZXNob290aW5nR3VpZGUnLCBcIkFuIE9TIGtleXJpbmcgY291bGRuJ3QgYmUgaWRlbnRpZmllZCBmb3Igc3RvcmluZyB0aGUgZW5jcnlwdGlvbiByZWxhdGVkIGRhdGEgaW4geW91ciBjdXJyZW50IGRlc2t0b3AgZW52aXJvbm1lbnQuXCIpO1xuXG5cdFx0aWYgKCFpc0xpbnV4KSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgZXJyb3JNZXNzYWdlLCBidXR0b25zKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMuX2VuY3J5cHRpb25TZXJ2aWNlLmdldEtleVN0b3JhZ2VQcm92aWRlcigpO1xuXHRcdGlmIChwcm92aWRlciA9PT0gS25vd25TdG9yYWdlUHJvdmlkZXIuYmFzaWNUZXh0KSB7XG5cdFx0XHRjb25zdCBkZXRhaWwgPSBsb2NhbGl6ZSgndXNlUGxhaW5UZXh0RXh0cmFTZW50ZW5jZScsIFwiT3BlbiB0aGUgdHJvdWJsZXNob290aW5nIGd1aWRlIHRvIGFkZHJlc3MgdGhpcyBvciB5b3UgY2FuIHVzZSB3ZWFrZXIgZW5jcnlwdGlvbiB0aGF0IGRvZXNuJ3QgdXNlIHRoZSBPUyBrZXlyaW5nLlwiKTtcblx0XHRcdGNvbnN0IHVzZVBsYWluVGV4dEJ1dHRvbjogSVByb21wdENob2ljZSA9IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd1c2VQbGFpblRleHQnLCBcIlVzZSB3ZWFrZXIgZW5jcnlwdGlvblwiKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZW5jcnlwdGlvblNlcnZpY2Uuc2V0VXNlUGxhaW5UZXh0RW5jcnlwdGlvbigpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2pzb25FZGl0aW5nU2VydmljZS53cml0ZSh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJndlJlc291cmNlLCBbeyBwYXRoOiBbJ3Bhc3N3b3JkLXN0b3JlJ10sIHZhbHVlOiBQYXNzd29yZFN0b3JlQ0xJT3B0aW9uLmJhc2ljIH1dLCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLnJlaW5pdGlhbGl6ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0YnV0dG9ucy51bnNoaWZ0KHVzZVBsYWluVGV4dEJ1dHRvbik7XG5cblx0XHRcdGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0bWVzc2FnZTogZXJyb3JNZXNzYWdlLFxuXHRcdFx0XHRkZXRhaWxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpc0dub21lKHByb3ZpZGVyKSkge1xuXHRcdFx0ZXJyb3JNZXNzYWdlID0gbG9jYWxpemUoJ2lzR25vbWUnLCBcIllvdSdyZSBydW5uaW5nIGluIGEgR05PTUUgZW52aXJvbm1lbnQgYnV0IHRoZSBPUyBrZXlyaW5nIGlzIG5vdCBhdmFpbGFibGUgZm9yIGVuY3J5cHRpb24uIEVuc3VyZSB5b3UgaGF2ZSBnbm9tZS1rZXlyaW5nIG9yIGFub3RoZXIgbGlic2VjcmV0IGNvbXBhdGlibGUgaW1wbGVtZW50YXRpb24gaW5zdGFsbGVkIGFuZCBydW5uaW5nLlwiKTtcblx0XHR9IGVsc2UgaWYgKGlzS3dhbGxldChwcm92aWRlcikpIHtcblx0XHRcdGVycm9yTWVzc2FnZSA9IGxvY2FsaXplKCdpc0t3YWxsZXQnLCBcIllvdSdyZSBydW5uaW5nIGluIGEgS0RFIGVudmlyb25tZW50IGJ1dCB0aGUgT1Mga2V5cmluZyBpcyBub3QgYXZhaWxhYmxlIGZvciBlbmNyeXB0aW9uLiBFbnN1cmUgeW91IGhhdmUga3dhbGxldCBydW5uaW5nLlwiKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgZXJyb3JNZXNzYWdlLCBidXR0b25zKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJU2VjcmV0U3RvcmFnZVNlcnZpY2UsIE5hdGl2ZVNlY3JldFN0b3JhZ2VTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxlQUFlO0FBQ3hCLE9BQU8sY0FBYztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQixzQkFBc0Isd0JBQXdCLFNBQVMsaUJBQWlCO0FBQ3JHLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUEyQztBQUNwRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDBCQUEwQiw2QkFBNkI7QUFDaEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBMkI7QUFFN0IsSUFBTSw2QkFBTixjQUF5Qyx5QkFBeUI7QUFBQSxFQUV4RSxZQUN3QyxzQkFDTixnQkFDQSxnQkFDSyxxQkFDTSxxQkFDM0IsZ0JBQ0csbUJBQ1AsWUFDWjtBQUNEO0FBQUEsTUFDQyxDQUFDLENBQUMsb0JBQW9CO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFkdUM7QUFDTjtBQUNBO0FBQ0s7QUFDTTtBQTJCN0MsU0FBUSwyQkFBMkIseUJBQXlCLE1BQU0sS0FBSyxxQkFBcUIsQ0FBQztBQUFBLEVBaEI3RjtBQUFBLEVBRVMsSUFBSSxLQUFhLE9BQThCO0FBQ3ZELFNBQUssV0FBVyxNQUFNLEtBQUssWUFBWTtBQUN0QyxZQUFNLEtBQUs7QUFFWCxVQUFJLEtBQUssU0FBUyxlQUFlLENBQUMsS0FBSyxvQkFBb0IsMEJBQTBCO0FBQ3BGLGFBQUssWUFBWSxNQUFNLHdGQUF3RjtBQUMvRyxjQUFNLEtBQUsseUJBQXlCO0FBQUEsTUFDckM7QUFBQSxJQUVELENBQUM7QUFFRCxXQUFPLE1BQU0sSUFBSSxLQUFLLEtBQUs7QUFBQSxFQUM1QjtBQUFBLEVBR0EsTUFBYyx1QkFBc0M7QUFDbkQsVUFBTSxVQUEyQixDQUFDO0FBQ2xDLFVBQU0sd0JBQXVDO0FBQUEsTUFDNUMsT0FBTyxTQUFTLHlCQUF5Qiw0QkFBNEI7QUFBQSxNQUNyRSxLQUFLLE1BQU0sS0FBSyxlQUFlLEtBQUssaURBQWlEO0FBQUE7QUFBQSxNQUVyRixVQUFVO0FBQUEsSUFDWDtBQUNBLFlBQVEsS0FBSyxxQkFBcUI7QUFFbEMsUUFBSSxlQUFlLFNBQVMsa0RBQWtELG1IQUFtSDtBQUVqTSxRQUFJLENBQUMsU0FBUztBQUNiLFdBQUsscUJBQXFCLE9BQU8sU0FBUyxPQUFPLGNBQWMsT0FBTztBQUN0RTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsTUFBTSxLQUFLLG1CQUFtQixzQkFBc0I7QUFDckUsUUFBSSxhQUFhLHFCQUFxQixXQUFXO0FBQ2hELFlBQU0sU0FBUyxTQUFTLDZCQUE2QixrSEFBa0g7QUFDdkssWUFBTSxxQkFBb0M7QUFBQSxRQUN6QyxPQUFPLFNBQVMsZ0JBQWdCLHVCQUF1QjtBQUFBLFFBQ3ZELEtBQUssWUFBWTtBQUNoQixnQkFBTSxLQUFLLG1CQUFtQiwwQkFBMEI7QUFDeEQsZ0JBQU0sS0FBSyxvQkFBb0IsTUFBTSxLQUFLLG9CQUFvQixjQUFjLENBQUMsRUFBRSxNQUFNLENBQUMsZ0JBQWdCLEdBQUcsT0FBTyx1QkFBdUIsTUFBTSxDQUFDLEdBQUcsSUFBSTtBQUNySixlQUFLLGFBQWE7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFDQSxjQUFRLFFBQVEsa0JBQWtCO0FBRWxDLFlBQU0sS0FBSyxlQUFlLE9BQU87QUFBQSxRQUNoQyxNQUFNO0FBQUEsUUFDTjtBQUFBLFFBQ0EsU0FBUztBQUFBLFFBQ1Q7QUFBQSxNQUNELENBQUM7QUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLFFBQVEsUUFBUSxHQUFHO0FBQ3RCLHFCQUFlLFNBQVMsV0FBVywrTEFBK0w7QUFBQSxJQUNuTyxXQUFXLFVBQVUsUUFBUSxHQUFHO0FBQy9CLHFCQUFlLFNBQVMsYUFBYSwwSEFBMEg7QUFBQSxJQUNoSztBQUVBLFNBQUsscUJBQXFCLE9BQU8sU0FBUyxPQUFPLGNBQWMsT0FBTztBQUFBLEVBQ3ZFO0FBQ0Q7QUFsRmEsNkJBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7QUFvRmIsa0JBQWtCLHVCQUF1Qiw0QkFBNEIsa0JBQWtCLE9BQU87IiwKICAibmFtZXMiOiBbXQp9Cg==
