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
import { ThrottledDelayer } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isUndefined, isUndefinedOrNull } from "../../../base/common/types.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
var SaveStrategy = /* @__PURE__ */ ((SaveStrategy2) => {
  SaveStrategy2[SaveStrategy2["IMMEDIATE"] = 0] = "IMMEDIATE";
  SaveStrategy2[SaveStrategy2["DELAYED"] = 1] = "DELAYED";
  return SaveStrategy2;
})(SaveStrategy || {});
class FileStorage extends Disposable {
  constructor(storagePath, saveStrategy, logService, fileService) {
    super();
    this.storagePath = storagePath;
    this.logService = logService;
    this.fileService = fileService;
    this.storage = /* @__PURE__ */ Object.create(null);
    this.lastSavedStorageContents = "";
    this.initializing = void 0;
    this.closing = void 0;
    this.flushDelayer = this._register(new ThrottledDelayer(
      saveStrategy === 0 /* IMMEDIATE */ ? 0 : 100
      /* buffer saves over a short time */
    ));
  }
  init() {
    if (!this.initializing) {
      this.initializing = this.doInit();
    }
    return this.initializing;
  }
  async doInit() {
    try {
      this.lastSavedStorageContents = (await this.fileService.readFile(this.storagePath)).value.toString();
      this.storage = JSON.parse(this.lastSavedStorageContents);
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
    }
  }
  getItem(key, defaultValue) {
    const res = this.storage[key];
    if (isUndefinedOrNull(res)) {
      return defaultValue;
    }
    return res;
  }
  setItem(key, data) {
    this.setItems([{ key, data }]);
  }
  setItems(items) {
    let save = false;
    for (const { key, data } of items) {
      if (this.storage[key] === data) {
        continue;
      }
      if (isUndefinedOrNull(data)) {
        if (!isUndefined(this.storage[key])) {
          this.storage[key] = void 0;
          save = true;
        }
      } else {
        this.storage[key] = data;
        save = true;
      }
    }
    if (save) {
      this.save();
    }
  }
  removeItem(key) {
    if (!isUndefined(this.storage[key])) {
      this.storage[key] = void 0;
      this.save();
    }
  }
  async save() {
    if (this.closing) {
      return;
    }
    return this.flushDelayer.trigger(() => this.doSave());
  }
  async doSave() {
    if (!this.initializing) {
      return;
    }
    await this.initializing;
    const serializedDatabase = JSON.stringify(this.storage, null, 4);
    if (serializedDatabase === this.lastSavedStorageContents) {
      return;
    }
    try {
      await this.fileService.writeFile(this.storagePath, VSBuffer.fromString(serializedDatabase), { atomic: { postfix: ".vsctmp" } });
      this.lastSavedStorageContents = serializedDatabase;
    } catch (error) {
      this.logService.error(error);
    }
  }
  async close() {
    if (!this.closing) {
      this.closing = this.flushDelayer.trigger(
        () => this.doSave(),
        0
        /* as soon as possible */
      );
    }
    return this.closing;
  }
}
let StateReadonlyService = class extends Disposable {
  constructor(saveStrategy, environmentService, logService, fileService) {
    super();
    this.fileStorage = this._register(new FileStorage(environmentService.stateResource, saveStrategy, logService, fileService));
  }
  async init() {
    await this.fileStorage.init();
  }
  getItem(key, defaultValue) {
    return this.fileStorage.getItem(key, defaultValue);
  }
};
StateReadonlyService = __decorateClass([
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IFileService)
], StateReadonlyService);
class StateService extends StateReadonlyService {
  setItem(key, data) {
    this.fileStorage.setItem(key, data);
  }
  setItems(items) {
    this.fileStorage.setItems(items);
  }
  removeItem(key) {
    this.fileStorage.removeItem(key);
  }
  close() {
    return this.fileStorage.close();
  }
}
export {
  FileStorage,
  SaveStrategy,
  StateReadonlyService,
  StateService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcc3RhdGVcXG5vZGVcXHN0YXRlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFRocm90dGxlZERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkLCBpc1VuZGVmaW5lZE9yTnVsbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVN0YXRlUmVhZFNlcnZpY2UsIElTdGF0ZVNlcnZpY2UgfSBmcm9tICcuL3N0YXRlLmpzJztcblxudHlwZSBTdG9yYWdlRGF0YWJhc2UgPSB7IFtrZXk6IHN0cmluZ106IHVua25vd24gfTtcblxuZXhwb3J0IGNvbnN0IGVudW0gU2F2ZVN0cmF0ZWd5IHtcblx0SU1NRURJQVRFLFxuXHRERUxBWUVEXG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlU3RvcmFnZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RvcmFnZTogU3RvcmFnZURhdGFiYXNlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0cHJpdmF0ZSBsYXN0U2F2ZWRTdG9yYWdlQ29udGVudHMgPSAnJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZsdXNoRGVsYXllcjogVGhyb3R0bGVkRGVsYXllcjx2b2lkPjtcblxuXHRwcml2YXRlIGluaXRpYWxpemluZzogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjbG9zaW5nOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVBhdGg6IFVSSSxcblx0XHRzYXZlU3RyYXRlZ3k6IFNhdmVTdHJhdGVneSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZmx1c2hEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXI8dm9pZD4oc2F2ZVN0cmF0ZWd5ID09PSBTYXZlU3RyYXRlZ3kuSU1NRURJQVRFID8gMCA6IDEwMCAvKiBidWZmZXIgc2F2ZXMgb3ZlciBhIHNob3J0IHRpbWUgKi8pKTtcblx0fVxuXG5cdGluaXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmluaXRpYWxpemluZykge1xuXHRcdFx0dGhpcy5pbml0aWFsaXppbmcgPSB0aGlzLmRvSW5pdCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmluaXRpYWxpemluZztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Jbml0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmxhc3RTYXZlZFN0b3JhZ2VDb250ZW50cyA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuc3RvcmFnZVBhdGgpKS52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0dGhpcy5zdG9yYWdlID0gSlNPTi5wYXJzZSh0aGlzLmxhc3RTYXZlZFN0b3JhZ2VDb250ZW50cyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldEl0ZW08VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZTogVCk6IFQ7XG5cdGdldEl0ZW08VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IFQpOiBUIHwgdW5kZWZpbmVkO1xuXHRnZXRJdGVtPFQ+KGtleTogc3RyaW5nLCBkZWZhdWx0VmFsdWU/OiBUKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVzID0gdGhpcy5zdG9yYWdlW2tleV07XG5cdFx0aWYgKGlzVW5kZWZpbmVkT3JOdWxsKHJlcykpIHtcblx0XHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcyBhcyBUO1xuXHR9XG5cblx0c2V0SXRlbShrZXk6IHN0cmluZywgZGF0YT86IG9iamVjdCB8IHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4gfCB1bmRlZmluZWQgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5zZXRJdGVtcyhbeyBrZXksIGRhdGEgfV0pO1xuXHR9XG5cblx0c2V0SXRlbXMoaXRlbXM6IHJlYWRvbmx5IHsga2V5OiBzdHJpbmc7IGRhdGE/OiBvYmplY3QgfCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkIHwgbnVsbCB9W10pOiB2b2lkIHtcblx0XHRsZXQgc2F2ZSA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCB7IGtleSwgZGF0YSB9IG9mIGl0ZW1zKSB7XG5cblx0XHRcdC8vIFNob3J0Y3V0IGZvciBkYXRhIHRoYXQgZGlkIG5vdCBjaGFuZ2Vcblx0XHRcdGlmICh0aGlzLnN0b3JhZ2Vba2V5XSA9PT0gZGF0YSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIGl0ZW1zIHdoZW4gdGhleSBhcmUgdW5kZWZpbmVkIG9yIG51bGxcblx0XHRcdGlmIChpc1VuZGVmaW5lZE9yTnVsbChkYXRhKSkge1xuXHRcdFx0XHRpZiAoIWlzVW5kZWZpbmVkKHRoaXMuc3RvcmFnZVtrZXldKSkge1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVtrZXldID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHNhdmUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIE90aGVyd2lzZSBhZGQgYW4gaXRlbVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHRoaXMuc3RvcmFnZVtrZXldID0gZGF0YTtcblx0XHRcdFx0c2F2ZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHNhdmUpIHtcblx0XHRcdHRoaXMuc2F2ZSgpO1xuXHRcdH1cblx0fVxuXG5cdHJlbW92ZUl0ZW0oa2V5OiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdC8vIE9ubHkgdXBkYXRlIGlmIHRoZSBrZXkgaXMgYWN0dWFsbHkgcHJlc2VudCAobm90IHVuZGVmaW5lZClcblx0XHRpZiAoIWlzVW5kZWZpbmVkKHRoaXMuc3RvcmFnZVtrZXldKSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlW2tleV0gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnNhdmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNhdmUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuY2xvc2luZykge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGFib3V0IHRvIGNsb3NlXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZmx1c2hEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5kb1NhdmUoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2F2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaW5pdGlhbGl6aW5nKSB7XG5cdFx0XHRyZXR1cm47IC8vIGlmIHdlIG5ldmVyIGluaXRpYWxpemVkLCB3ZSBzaG91bGQgbm90IHNhdmUgb3VyIHN0YXRlXG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIHRvIHdhaXQgZm9yIGluaXQgdG8gZmluaXNoIGZpcnN0XG5cdFx0YXdhaXQgdGhpcy5pbml0aWFsaXppbmc7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlIGRhdGFiYXNlIGhhcyBub3QgY2hhbmdlZFxuXHRcdGNvbnN0IHNlcmlhbGl6ZWREYXRhYmFzZSA9IEpTT04uc3RyaW5naWZ5KHRoaXMuc3RvcmFnZSwgbnVsbCwgNCk7XG5cdFx0aWYgKHNlcmlhbGl6ZWREYXRhYmFzZSA9PT0gdGhpcy5sYXN0U2F2ZWRTdG9yYWdlQ29udGVudHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBXcml0ZSB0byBkaXNrXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMuc3RvcmFnZVBhdGgsIFZTQnVmZmVyLmZyb21TdHJpbmcoc2VyaWFsaXplZERhdGFiYXNlKSwgeyBhdG9taWM6IHsgcG9zdGZpeDogJy52c2N0bXAnIH0gfSk7XG5cdFx0XHR0aGlzLmxhc3RTYXZlZFN0b3JhZ2VDb250ZW50cyA9IHNlcmlhbGl6ZWREYXRhYmFzZTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjbG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuY2xvc2luZykge1xuXHRcdFx0dGhpcy5jbG9zaW5nID0gdGhpcy5mbHVzaERlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLmRvU2F2ZSgpLCAwIC8qIGFzIHNvb24gYXMgcG9zc2libGUgKi8pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNsb3Npbmc7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFN0YXRlUmVhZG9ubHlTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTdGF0ZVJlYWRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgZmlsZVN0b3JhZ2U6IEZpbGVTdG9yYWdlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNhdmVTdHJhdGVneTogU2F2ZVN0cmF0ZWd5LFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmZpbGVTdG9yYWdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEZpbGVTdG9yYWdlKGVudmlyb25tZW50U2VydmljZS5zdGF0ZVJlc291cmNlLCBzYXZlU3RyYXRlZ3ksIGxvZ1NlcnZpY2UsIGZpbGVTZXJ2aWNlKSk7XG5cdH1cblxuXHRhc3luYyBpbml0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZmlsZVN0b3JhZ2UuaW5pdCgpO1xuXHR9XG5cblx0Z2V0SXRlbTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlOiBUKTogVDtcblx0Z2V0SXRlbTxUPihrZXk6IHN0cmluZywgZGVmYXVsdFZhbHVlPzogVCk6IFQgfCB1bmRlZmluZWQ7XG5cdGdldEl0ZW08VD4oa2V5OiBzdHJpbmcsIGRlZmF1bHRWYWx1ZT86IFQpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5maWxlU3RvcmFnZS5nZXRJdGVtKGtleSwgZGVmYXVsdFZhbHVlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhdGVTZXJ2aWNlIGV4dGVuZHMgU3RhdGVSZWFkb25seVNlcnZpY2UgaW1wbGVtZW50cyBJU3RhdGVTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRzZXRJdGVtKGtleTogc3RyaW5nLCBkYXRhPzogb2JqZWN0IHwgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHVuZGVmaW5lZCB8IG51bGwpOiB2b2lkIHtcblx0XHR0aGlzLmZpbGVTdG9yYWdlLnNldEl0ZW0oa2V5LCBkYXRhKTtcblx0fVxuXG5cdHNldEl0ZW1zKGl0ZW1zOiByZWFkb25seSB7IGtleTogc3RyaW5nOyBkYXRhPzogb2JqZWN0IHwgc3RyaW5nIHwgbnVtYmVyIHwgYm9vbGVhbiB8IHVuZGVmaW5lZCB8IG51bGwgfVtdKTogdm9pZCB7XG5cdFx0dGhpcy5maWxlU3RvcmFnZS5zZXRJdGVtcyhpdGVtcyk7XG5cdH1cblxuXHRyZW1vdmVJdGVtKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5maWxlU3RvcmFnZS5yZW1vdmVJdGVtKGtleSk7XG5cdH1cblxuXHRjbG9zZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5maWxlU3RvcmFnZS5jbG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYSx5QkFBeUI7QUFFL0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBNkIscUJBQXFCLG9CQUFvQjtBQUN0RSxTQUFTLG1CQUFtQjtBQUtyQixJQUFXLGVBQVgsa0JBQVdBLGtCQUFYO0FBQ04sRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUZpQixTQUFBQTtBQUFBLEdBQUE7QUFLWCxNQUFNLG9CQUFvQixXQUFXO0FBQUEsRUFVM0MsWUFDa0IsYUFDakIsY0FDaUIsWUFDQSxhQUNoQjtBQUNELFVBQU07QUFMVztBQUVBO0FBQ0E7QUFabEIsU0FBUSxVQUEyQix1QkFBTyxPQUFPLElBQUk7QUFDckQsU0FBUSwyQkFBMkI7QUFJbkMsU0FBUSxlQUEwQztBQUNsRCxTQUFRLFVBQXFDO0FBVTVDLFNBQUssZUFBZSxLQUFLLFVBQVUsSUFBSTtBQUFBLE1BQXVCLGlCQUFpQixvQkFBeUIsSUFBSTtBQUFBO0FBQUEsSUFBd0MsQ0FBQztBQUFBLEVBQ3RKO0FBQUEsRUFFQSxPQUFzQjtBQUNyQixRQUFJLENBQUMsS0FBSyxjQUFjO0FBQ3ZCLFdBQUssZUFBZSxLQUFLLE9BQU87QUFBQSxJQUNqQztBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWMsU0FBd0I7QUFDckMsUUFBSTtBQUNILFdBQUssNEJBQTRCLE1BQU0sS0FBSyxZQUFZLFNBQVMsS0FBSyxXQUFXLEdBQUcsTUFBTSxTQUFTO0FBQ25HLFdBQUssVUFBVSxLQUFLLE1BQU0sS0FBSyx3QkFBd0I7QUFBQSxJQUN4RCxTQUFTLE9BQU87QUFDZixVQUF5QixNQUFPLHdCQUF3QixvQkFBb0IsZ0JBQWdCO0FBQzNGLGFBQUssV0FBVyxNQUFNLEtBQUs7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFJQSxRQUFXLEtBQWEsY0FBaUM7QUFDeEQsVUFBTSxNQUFNLEtBQUssUUFBUSxHQUFHO0FBQzVCLFFBQUksa0JBQWtCLEdBQUcsR0FBRztBQUMzQixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxRQUFRLEtBQWEsTUFBb0U7QUFDeEYsU0FBSyxTQUFTLENBQUMsRUFBRSxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDOUI7QUFBQSxFQUVBLFNBQVMsT0FBdUc7QUFDL0csUUFBSSxPQUFPO0FBRVgsZUFBVyxFQUFFLEtBQUssS0FBSyxLQUFLLE9BQU87QUFHbEMsVUFBSSxLQUFLLFFBQVEsR0FBRyxNQUFNLE1BQU07QUFDL0I7QUFBQSxNQUNEO0FBR0EsVUFBSSxrQkFBa0IsSUFBSSxHQUFHO0FBQzVCLFlBQUksQ0FBQyxZQUFZLEtBQUssUUFBUSxHQUFHLENBQUMsR0FBRztBQUNwQyxlQUFLLFFBQVEsR0FBRyxJQUFJO0FBQ3BCLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsT0FHSztBQUNKLGFBQUssUUFBUSxHQUFHLElBQUk7QUFDcEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsUUFBSSxNQUFNO0FBQ1QsV0FBSyxLQUFLO0FBQUEsSUFDWDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFdBQVcsS0FBbUI7QUFHN0IsUUFBSSxDQUFDLFlBQVksS0FBSyxRQUFRLEdBQUcsQ0FBQyxHQUFHO0FBQ3BDLFdBQUssUUFBUSxHQUFHLElBQUk7QUFDcEIsV0FBSyxLQUFLO0FBQUEsSUFDWDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsT0FBc0I7QUFDbkMsUUFBSSxLQUFLLFNBQVM7QUFDakI7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLLGFBQWEsUUFBUSxNQUFNLEtBQUssT0FBTyxDQUFDO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQWMsU0FBd0I7QUFDckMsUUFBSSxDQUFDLEtBQUssY0FBYztBQUN2QjtBQUFBLElBQ0Q7QUFHQSxVQUFNLEtBQUs7QUFHWCxVQUFNLHFCQUFxQixLQUFLLFVBQVUsS0FBSyxTQUFTLE1BQU0sQ0FBQztBQUMvRCxRQUFJLHVCQUF1QixLQUFLLDBCQUEwQjtBQUN6RDtBQUFBLElBQ0Q7QUFHQSxRQUFJO0FBQ0gsWUFBTSxLQUFLLFlBQVksVUFBVSxLQUFLLGFBQWEsU0FBUyxXQUFXLGtCQUFrQixHQUFHLEVBQUUsUUFBUSxFQUFFLFNBQVMsVUFBVSxFQUFFLENBQUM7QUFDOUgsV0FBSywyQkFBMkI7QUFBQSxJQUNqQyxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSxLQUFLO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLFFBQXVCO0FBQzVCLFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsV0FBSyxVQUFVLEtBQUssYUFBYTtBQUFBLFFBQVEsTUFBTSxLQUFLLE9BQU87QUFBQSxRQUFHO0FBQUE7QUFBQSxNQUEyQjtBQUFBLElBQzFGO0FBRUEsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBRU8sSUFBTSx1QkFBTixjQUFtQyxXQUF3QztBQUFBLEVBTWpGLFlBQ0MsY0FDcUIsb0JBQ1IsWUFDQyxhQUNiO0FBQ0QsVUFBTTtBQUVOLFNBQUssY0FBYyxLQUFLLFVBQVUsSUFBSSxZQUFZLG1CQUFtQixlQUFlLGNBQWMsWUFBWSxXQUFXLENBQUM7QUFBQSxFQUMzSDtBQUFBLEVBRUEsTUFBTSxPQUFzQjtBQUMzQixVQUFNLEtBQUssWUFBWSxLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUlBLFFBQVcsS0FBYSxjQUFpQztBQUN4RCxXQUFPLEtBQUssWUFBWSxRQUFRLEtBQUssWUFBWTtBQUFBLEVBQ2xEO0FBQ0Q7QUExQmEsdUJBQU47QUFBQSxFQVFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZVO0FBNEJOLE1BQU0scUJBQXFCLHFCQUE4QztBQUFBLEVBSS9FLFFBQVEsS0FBYSxNQUFvRTtBQUN4RixTQUFLLFlBQVksUUFBUSxLQUFLLElBQUk7QUFBQSxFQUNuQztBQUFBLEVBRUEsU0FBUyxPQUF1RztBQUMvRyxTQUFLLFlBQVksU0FBUyxLQUFLO0FBQUEsRUFDaEM7QUFBQSxFQUVBLFdBQVcsS0FBbUI7QUFDN0IsU0FBSyxZQUFZLFdBQVcsR0FBRztBQUFBLEVBQ2hDO0FBQUEsRUFFQSxRQUF1QjtBQUN0QixXQUFPLEtBQUssWUFBWSxNQUFNO0FBQUEsRUFDL0I7QUFDRDsiLAogICJuYW1lcyI6IFsiU2F2ZVN0cmF0ZWd5Il0KfQo=
