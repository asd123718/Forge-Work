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
import Severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { IIntegrityService } from "../common/integrity.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { INotificationService, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { FileAccess } from "../../../../base/common/network.js";
import { IChecksumService } from "../../../../platform/checksum/common/checksumService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
const _IntegrityStorage = class _IntegrityStorage {
  constructor(storageService) {
    this.storageService = storageService;
    this.value = this._read();
  }
  _read() {
    const jsonValue = this.storageService.get(_IntegrityStorage.KEY, StorageScope.APPLICATION);
    if (!jsonValue) {
      return null;
    }
    try {
      return JSON.parse(jsonValue);
    } catch (err) {
      return null;
    }
  }
  get() {
    return this.value;
  }
  set(data) {
    this.value = data;
    this.storageService.store(_IntegrityStorage.KEY, JSON.stringify(this.value), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
};
_IntegrityStorage.KEY = "integrityService";
let IntegrityStorage = _IntegrityStorage;
let IntegrityService = class {
  constructor(notificationService, storageService, lifecycleService, openerService, productService, checksumService, logService) {
    this.notificationService = notificationService;
    this.lifecycleService = lifecycleService;
    this.openerService = openerService;
    this.productService = productService;
    this.checksumService = checksumService;
    this.logService = logService;
    this.storage = new IntegrityStorage(storageService);
    this.isPurePromise = this._isPure();
    this._compute();
  }
  isPure() {
    return this.isPurePromise;
  }
  async _compute() {
    const { isPure } = await this.isPure();
    if (isPure) {
      return;
    }
    this.logService.warn(`

----------------------------------------------
***	Installation has been modified on disk ***
----------------------------------------------

`);
    const storedData = this.storage.get();
    if (storedData?.dontShowPrompt && storedData.commit === this.productService.commit) {
      return;
    }
    this._showNotification();
  }
  async _isPure() {
    const expectedChecksums = this.productService.checksums || {};
    await this.lifecycleService.when(LifecyclePhase.Eventually);
    const allResults = await Promise.all(Object.keys(expectedChecksums).map((filename) => this._resolve(filename, expectedChecksums[filename])));
    let isPure = true;
    for (let i = 0, len = allResults.length; i < len; i++) {
      if (!allResults[i].isPure) {
        isPure = false;
        break;
      }
    }
    return {
      isPure,
      proof: allResults
    };
  }
  async _resolve(filename, expected) {
    const fileUri = FileAccess.asFileUri(filename);
    try {
      const checksum = await this.checksumService.checksum(fileUri);
      return IntegrityService._createChecksumPair(fileUri, checksum, expected);
    } catch (error) {
      return IntegrityService._createChecksumPair(fileUri, "", expected);
    }
  }
  static _createChecksumPair(uri, actual, expected) {
    return {
      uri,
      actual,
      expected,
      isPure: actual === expected
    };
  }
  _showNotification() {
    const checksumFailMoreInfoUrl = this.productService.checksumFailMoreInfoUrl;
    const message = localize("integrity.prompt", "Your {0} installation appears to be corrupt. Please reinstall.", this.productService.nameShort);
    if (checksumFailMoreInfoUrl) {
      this.notificationService.prompt(
        Severity.Warning,
        message,
        [
          {
            label: localize("integrity.moreInformation", "More Information"),
            run: () => this.openerService.open(URI.parse(checksumFailMoreInfoUrl))
          },
          {
            label: localize("integrity.dontShowAgain", "Don't Show Again"),
            isSecondary: true,
            run: () => this.storage.set({ dontShowPrompt: true, commit: this.productService.commit })
          }
        ],
        {
          sticky: true,
          priority: NotificationPriority.URGENT
        }
      );
    } else {
      this.notificationService.notify({
        severity: Severity.Warning,
        message,
        sticky: true,
        priority: NotificationPriority.URGENT
      });
    }
  }
};
IntegrityService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, ILifecycleService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IChecksumService),
  __decorateParam(6, ILogService)
], IntegrityService);
registerSingleton(IIntegrityService, IntegrityService, InstantiationType.Delayed);
export {
  IntegrityService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxpbnRlZ3JpdHlcXGVsZWN0cm9uLWJyb3dzZXJcXGludGVncml0eVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENoZWNrc3VtUGFpciwgSUludGVncml0eVNlcnZpY2UsIEludGVncml0eVRlc3RSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vaW50ZWdyaXR5LmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgQXBwUmVzb3VyY2VQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJQ2hlY2tzdW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2hlY2tzdW0vY29tbW9uL2NoZWNrc3VtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuaW50ZXJmYWNlIElTdG9yYWdlRGF0YSB7XG5cdHJlYWRvbmx5IGRvbnRTaG93UHJvbXB0OiBib29sZWFuO1xuXHRyZWFkb25seSBjb21taXQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgSW50ZWdyaXR5U3RvcmFnZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgS0VZID0gJ2ludGVncml0eVNlcnZpY2UnO1xuXG5cdHByaXZhdGUgdmFsdWU6IElTdG9yYWdlRGF0YSB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0dGhpcy52YWx1ZSA9IHRoaXMuX3JlYWQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlYWQoKTogSVN0b3JhZ2VEYXRhIHwgbnVsbCB7XG5cdFx0Y29uc3QganNvblZhbHVlID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoSW50ZWdyaXR5U3RvcmFnZS5LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFqc29uVmFsdWUpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShqc29uVmFsdWUpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0Z2V0KCk6IElTdG9yYWdlRGF0YSB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLnZhbHVlO1xuXHR9XG5cblx0c2V0KGRhdGE6IElTdG9yYWdlRGF0YSB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLnZhbHVlID0gZGF0YTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEludGVncml0eVN0b3JhZ2UuS0VZLCBKU09OLnN0cmluZ2lmeSh0aGlzLnZhbHVlKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlZ3JpdHlTZXJ2aWNlIGltcGxlbWVudHMgSUludGVncml0eVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZTogSW50ZWdyaXR5U3RvcmFnZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlzUHVyZVByb21pc2U6IFByb21pc2U8SW50ZWdyaXR5VGVzdFJlc3VsdD47XG5cdGlzUHVyZSgpOiBQcm9taXNlPEludGVncml0eVRlc3RSZXN1bHQ+IHsgcmV0dXJuIHRoaXMuaXNQdXJlUHJvbWlzZTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNoZWNrc3VtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoZWNrc3VtU2VydmljZTogSUNoZWNrc3VtU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLnN0b3JhZ2UgPSBuZXcgSW50ZWdyaXR5U3RvcmFnZShzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5pc1B1cmVQcm9taXNlID0gdGhpcy5faXNQdXJlKCk7XG5cblx0XHR0aGlzLl9jb21wdXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgaXNQdXJlIH0gPSBhd2FpdCB0aGlzLmlzUHVyZSgpO1xuXHRcdGlmIChpc1B1cmUpIHtcblx0XHRcdHJldHVybjsgLy8gYWxsIGlzIGdvb2Rcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgXG5cbi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbioqKlx0SW5zdGFsbGF0aW9uIGhhcyBiZWVuIG1vZGlmaWVkIG9uIGRpc2sgKioqXG4tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmApO1xuXG5cdFx0Y29uc3Qgc3RvcmVkRGF0YSA9IHRoaXMuc3RvcmFnZS5nZXQoKTtcblx0XHRpZiAoc3RvcmVkRGF0YT8uZG9udFNob3dQcm9tcHQgJiYgc3RvcmVkRGF0YS5jb21taXQgPT09IHRoaXMucHJvZHVjdFNlcnZpY2UuY29tbWl0KSB7XG5cdFx0XHRyZXR1cm47IC8vIERvIG5vdCBwcm9tcHRcblx0XHR9XG5cblx0XHR0aGlzLl9zaG93Tm90aWZpY2F0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc1B1cmUoKTogUHJvbWlzZTxJbnRlZ3JpdHlUZXN0UmVzdWx0PiB7XG5cdFx0Y29uc3QgZXhwZWN0ZWRDaGVja3N1bXMgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNoZWNrc3VtcyB8fCB7fTtcblxuXHRcdGF3YWl0IHRoaXMubGlmZWN5Y2xlU2VydmljZS53aGVuKExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuXG5cdFx0Y29uc3QgYWxsUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKE9iamVjdC5rZXlzKGV4cGVjdGVkQ2hlY2tzdW1zKS5tYXAoZmlsZW5hbWUgPT4gdGhpcy5fcmVzb2x2ZSg8QXBwUmVzb3VyY2VQYXRoPmZpbGVuYW1lLCBleHBlY3RlZENoZWNrc3Vtc1tmaWxlbmFtZV0pKSk7XG5cblx0XHRsZXQgaXNQdXJlID0gdHJ1ZTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYWxsUmVzdWx0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKCFhbGxSZXN1bHRzW2ldLmlzUHVyZSkge1xuXHRcdFx0XHRpc1B1cmUgPSBmYWxzZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzUHVyZSxcblx0XHRcdHByb29mOiBhbGxSZXN1bHRzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmUoZmlsZW5hbWU6IEFwcFJlc291cmNlUGF0aCwgZXhwZWN0ZWQ6IHN0cmluZyk6IFByb21pc2U8Q2hlY2tzdW1QYWlyPiB7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKGZpbGVuYW1lKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGVja3N1bSA9IGF3YWl0IHRoaXMuY2hlY2tzdW1TZXJ2aWNlLmNoZWNrc3VtKGZpbGVVcmkpO1xuXG5cdFx0XHRyZXR1cm4gSW50ZWdyaXR5U2VydmljZS5fY3JlYXRlQ2hlY2tzdW1QYWlyKGZpbGVVcmksIGNoZWNrc3VtLCBleHBlY3RlZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHJldHVybiBJbnRlZ3JpdHlTZXJ2aWNlLl9jcmVhdGVDaGVja3N1bVBhaXIoZmlsZVVyaSwgJycsIGV4cGVjdGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY3JlYXRlQ2hlY2tzdW1QYWlyKHVyaTogVVJJLCBhY3R1YWw6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZyk6IENoZWNrc3VtUGFpciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVyaTogdXJpLFxuXHRcdFx0YWN0dWFsOiBhY3R1YWwsXG5cdFx0XHRleHBlY3RlZDogZXhwZWN0ZWQsXG5cdFx0XHRpc1B1cmU6IChhY3R1YWwgPT09IGV4cGVjdGVkKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9zaG93Tm90aWZpY2F0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoZWNrc3VtRmFpbE1vcmVJbmZvVXJsID0gdGhpcy5wcm9kdWN0U2VydmljZS5jaGVja3N1bUZhaWxNb3JlSW5mb1VybDtcblx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ2ludGVncml0eS5wcm9tcHQnLCBcIllvdXIgezB9IGluc3RhbGxhdGlvbiBhcHBlYXJzIHRvIGJlIGNvcnJ1cHQuIFBsZWFzZSByZWluc3RhbGwuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZVNob3J0KTtcblx0XHRpZiAoY2hlY2tzdW1GYWlsTW9yZUluZm9VcmwpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ludGVncml0eS5tb3JlSW5mb3JtYXRpb24nLCBcIk1vcmUgSW5mb3JtYXRpb25cIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShjaGVja3N1bUZhaWxNb3JlSW5mb1VybCkpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2ludGVncml0eS5kb250U2hvd0FnYWluJywgXCJEb24ndCBTaG93IEFnYWluXCIpLFxuXHRcdFx0XHRcdFx0aXNTZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuc3RvcmFnZS5zZXQoeyBkb250U2hvd1Byb21wdDogdHJ1ZSwgY29tbWl0OiB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCB9KVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRwcmlvcml0eTogTm90aWZpY2F0aW9uUHJpb3JpdHkuVVJHRU5UXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUludGVncml0eVNlcnZpY2UsIEludGVncml0eVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixPQUFPLGNBQWM7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQXVCLHlCQUE4QztBQUNyRSxTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0IsNEJBQTRCO0FBQzNELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFtQztBQUM1QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQjtBQU81QixNQUFNLG9CQUFOLE1BQU0sa0JBQWlCO0FBQUEsRUFNdEIsWUFBNkIsZ0JBQWlDO0FBQWpDO0FBQzVCLFNBQUssUUFBUSxLQUFLLE1BQU07QUFBQSxFQUN6QjtBQUFBLEVBRVEsUUFBNkI7QUFDcEMsVUFBTSxZQUFZLEtBQUssZUFBZSxJQUFJLGtCQUFpQixLQUFLLGFBQWEsV0FBVztBQUN4RixRQUFJLENBQUMsV0FBVztBQUNmLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSTtBQUNILGFBQU8sS0FBSyxNQUFNLFNBQVM7QUFBQSxJQUM1QixTQUFTLEtBQUs7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQTJCO0FBQzFCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUks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
