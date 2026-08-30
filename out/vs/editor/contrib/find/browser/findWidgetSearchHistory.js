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
import { Emitter } from "../../../../base/common/event.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
let FindWidgetSearchHistory = class {
  constructor(storageService) {
    this.storageService = storageService;
    this.inMemoryValues = /* @__PURE__ */ new Set();
    this._onDidChangeEmitter = new Emitter();
    this.onDidChange = this._onDidChangeEmitter.event;
    this.load();
  }
  static getOrCreate(storageService) {
    if (!FindWidgetSearchHistory._instance) {
      FindWidgetSearchHistory._instance = new FindWidgetSearchHistory(storageService);
    }
    return FindWidgetSearchHistory._instance;
  }
  delete(t) {
    const result = this.inMemoryValues.delete(t);
    this.save();
    return result;
  }
  add(t) {
    this.inMemoryValues.add(t);
    this.save();
    return this;
  }
  has(t) {
    return this.inMemoryValues.has(t);
  }
  clear() {
    this.inMemoryValues.clear();
    this.save();
  }
  forEach(callbackfn, thisArg) {
    this.load();
    return this.inMemoryValues.forEach(callbackfn);
  }
  replace(t) {
    this.inMemoryValues = new Set(t);
    this.save();
  }
  load() {
    let result;
    const raw = this.storageService.get(
      FindWidgetSearchHistory.FIND_HISTORY_KEY,
      StorageScope.WORKSPACE
    );
    if (raw) {
      try {
        result = JSON.parse(raw);
      } catch (e) {
      }
    }
    this.inMemoryValues = new Set(result || []);
  }
  // Run saves async
  save() {
    const elements = [];
    this.inMemoryValues.forEach((e) => elements.push(e));
    return new Promise((resolve) => {
      this.storageService.store(
        FindWidgetSearchHistory.FIND_HISTORY_KEY,
        JSON.stringify(elements),
        StorageScope.WORKSPACE,
        StorageTarget.USER
      );
      this._onDidChangeEmitter.fire(elements);
      resolve();
    });
  }
};
FindWidgetSearchHistory.FIND_HISTORY_KEY = "workbench.find.history";
FindWidgetSearchHistory._instance = null;
FindWidgetSearchHistory = __decorateClass([
  __decorateParam(0, IStorageService)
], FindWidgetSearchHistory);
export {
  FindWidgetSearchHistory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZpbmRcXGJyb3dzZXJcXGZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpc3RvcnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuZXhwb3J0IGNsYXNzIEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5IGltcGxlbWVudHMgSUhpc3Rvcnk8c3RyaW5nPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgRklORF9ISVNUT1JZX0tFWSA9ICd3b3JrYmVuY2guZmluZC5oaXN0b3J5Jztcblx0cHJpdmF0ZSBpbk1lbW9yeVZhbHVlczogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdHB1YmxpYyBvbkRpZENoYW5nZT86IEV2ZW50PHN0cmluZ1tdPjtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VFbWl0dGVyOiBFbWl0dGVyPHN0cmluZ1tdPjtcblxuXHRwcml2YXRlIHN0YXRpYyBfaW5zdGFuY2U6IEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5IHwgbnVsbCA9IG51bGw7XG5cblx0c3RhdGljIGdldE9yQ3JlYXRlKFxuXHRcdHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCk6IEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5IHtcblx0XHRpZiAoIUZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5Ll9pbnN0YW5jZSkge1xuXHRcdFx0RmluZFdpZGdldFNlYXJjaEhpc3RvcnkuX2luc3RhbmNlID0gbmV3IEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5KHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIEZpbmRXaWRnZXRTZWFyY2hIaXN0b3J5Ll9pbnN0YW5jZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxzdHJpbmdbXT4oKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXHRcdHRoaXMubG9hZCgpO1xuXHR9XG5cblx0ZGVsZXRlKHQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuaW5NZW1vcnlWYWx1ZXMuZGVsZXRlKHQpO1xuXHRcdHRoaXMuc2F2ZSgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhZGQodDogc3RyaW5nKTogdGhpcyB7XG5cdFx0dGhpcy5pbk1lbW9yeVZhbHVlcy5hZGQodCk7XG5cdFx0dGhpcy5zYXZlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRoYXModDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5NZW1vcnlWYWx1ZXMuaGFzKHQpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5pbk1lbW9yeVZhbHVlcy5jbGVhcigpO1xuXHRcdHRoaXMuc2F2ZSgpO1xuXHR9XG5cblx0Zm9yRWFjaChjYWxsYmFja2ZuOiAodmFsdWU6IHN0cmluZywgdmFsdWUyOiBzdHJpbmcsIHNldDogU2V0PHN0cmluZz4pID0+IHZvaWQsIHRoaXNBcmc/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0Ly8gZmV0Y2ggbGF0ZXN0IGZyb20gc3RvcmFnZVxuXHRcdHRoaXMubG9hZCgpO1xuXHRcdHJldHVybiB0aGlzLmluTWVtb3J5VmFsdWVzLmZvckVhY2goY2FsbGJhY2tmbik7XG5cdH1cblx0cmVwbGFjZT8odDogc3RyaW5nW10pOiB2b2lkIHtcblx0XHR0aGlzLmluTWVtb3J5VmFsdWVzID0gbmV3IFNldCh0KTtcblx0XHR0aGlzLnNhdmUoKTtcblx0fVxuXG5cdGxvYWQoKSB7XG5cdFx0bGV0IHJlc3VsdDogW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoXG5cdFx0XHRGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS5GSU5EX0hJU1RPUllfS0VZLFxuXHRcdFx0U3RvcmFnZVNjb3BlLldPUktTUEFDRVxuXHRcdCk7XG5cblx0XHRpZiAocmF3KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXN1bHQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIEludmFsaWQgZGF0YVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuaW5NZW1vcnlWYWx1ZXMgPSBuZXcgU2V0KHJlc3VsdCB8fCBbXSk7XG5cdH1cblxuXHQvLyBSdW4gc2F2ZXMgYXN5bmNcblx0c2F2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbGVtZW50czogc3RyaW5nW10gPSBbXTtcblx0XHR0aGlzLmluTWVtb3J5VmFsdWVzLmZvckVhY2goZSA9PiBlbGVtZW50cy5wdXNoKGUpKTtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0XHRGaW5kV2lkZ2V0U2VhcmNoSGlzdG9yeS5GSU5EX0hJU1RPUllfS0VZLFxuXHRcdFx0XHRKU09OLnN0cmluZ2lmeShlbGVtZW50cyksXG5cdFx0XHRcdFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsXG5cdFx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUixcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUVtaXR0ZXIuZmlyZShlbGVtZW50cyk7XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUUvQixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUV0RCxJQUFNLDBCQUFOLE1BQTBEO0FBQUEsRUFpQmhFLFlBQ21DLGdCQUNqQztBQURpQztBQWhCbkMsU0FBUSxpQkFBOEIsb0JBQUksSUFBSTtBQWtCN0MsU0FBSyxzQkFBc0IsSUFBSSxRQUFrQjtBQUNqRCxTQUFLLGNBQWMsS0FBSyxvQkFBb0I7QUFDNUMsU0FBSyxLQUFLO0FBQUEsRUFDWDtBQUFBLEVBZkEsT0FBTyxZQUNOLGdCQUMwQjtBQUMxQixRQUFJLENBQUMsd0JBQXdCLFdBQVc7QUFDdkMsOEJBQXdCLFlBQVksSUFBSSx3QkFBd0IsY0FBYztBQUFBLElBQy9FO0FBQ0EsV0FBTyx3QkFBd0I7QUFBQSxFQUNoQztBQUFBLEVBVUEsT0FBTyxHQUFvQjtBQUMxQixVQUFNLFNBQVMsS0FBSyxlQUFlLE9BQU8sQ0FBQztBQUMzQyxTQUFLLEtBQUs7QUFDVixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsSUFBSSxHQUFpQjtBQUNwQixTQUFLLGVBQWUsSUFBSSxDQUFDO0FBQ3pCLFNBQUssS0FBSztBQUNWLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxJQUFJLEdBQW9CO0FBQ3ZCLFdBQU8sS0FBSyxlQUFlLElBQUksQ0FBQztBQUFBLEVBQ2pDO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxlQUFlLE1BQU07QUFDMUIsU0FBSyxLQUFLO0FBQUEsRUFDWDtBQUFBLEVBRUEsUUFBUSxZQUF1RSxTQUF5QjtBQUV2RyxTQUFLLEtBQUs7QUFDVixXQUFPLEtBQUssZUFBZSxRQUFRLFVBQVU7QUFBQSxFQUM5QztBQUFBLEVBQ0EsUUFBUyxHQUFtQjtBQUMzQixTQUFLLGlCQUFpQixJQUFJLElBQUksQ0FBQztBQUMvQixTQUFLLEtBQUs7QUFBQSxFQUNYO0FBQUEsRUFFQSxPQUFPO0FBQ04sUUFBSTtBQUNKLFVBQU0sTUFBTSxLQUFLLGVBQWU7QUFBQSxNQUMvQix3QkFBd0I7QUFBQSxNQUN4QixhQUFhO0FBQUEsSUFDZDtBQUVBLFFBQUksS0FBSztBQUNSLFVBQUk7QUFDSCxpQkFBUyxLQUFLLE1BQU0sR0FBRztBQUFBLE1BQ3hCLFNBQVMsR0FBRztBQUFBLE1BRVo7QUFBQSxJQUNEO0FBRUEsU0FBSyxpQkFBaUIsSUFBSSxJQUFJLFVBQVUsQ0FBQyxDQUFDO0FBQUEsRUFDM0M7QUFBQTtBQUFBLEVBR0EsT0FBc0I7QUFDckIsVUFBTSxXQUFxQixDQUFDO0FBQzVCLFNBQUssZUFBZSxRQUFRLE9BQUssU0FBUyxLQUFLLENBQUMsQ0FBQztBQUNqRCxXQUFPLElBQUksUUFBYyxhQUFXO0FBQ25DLFdBQUssZUFBZTtBQUFBLFFBQ25CLHdCQUF3QjtBQUFBLFFBQ3hCLEtBQUssVUFBVSxRQUFRO0FBQUEsUUFDdkIsYUFBYTtBQUFBLFFBQ2IsY0FBYztBQUFBLE1BQ2Y7QUFDQSxXQUFLLG9CQUFvQixLQUFLLFFBQVE7QUFDdEMsY0FBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXpGYSx3QkFDVyxtQkFBbUI7QUFEOUIsd0JBTUcsWUFBNEM7QUFOL0MsMEJBQU47QUFBQSxFQWtCSjtBQUFBLEdBbEJVOyIsCiAgIm5hbWVzIjogW10KfQo=
