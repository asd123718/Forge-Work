import { defaultGenerator } from "../../../../base/common/idGenerator.js";
import { equals } from "../../../../base/common/objects.js";
var LoadingPhase = /* @__PURE__ */ ((LoadingPhase2) => {
  LoadingPhase2[LoadingPhase2["Created"] = 1] = "Created";
  LoadingPhase2[LoadingPhase2["Loading"] = 2] = "Loading";
  LoadingPhase2[LoadingPhase2["Loaded"] = 3] = "Loaded";
  LoadingPhase2[LoadingPhase2["Errored"] = 4] = "Errored";
  LoadingPhase2[LoadingPhase2["Disposed"] = 5] = "Disposed";
  return LoadingPhase2;
})(LoadingPhase || {});
class FileQueryCacheState {
  constructor(cacheQuery, loadFn, disposeFn, previousCacheState) {
    this.cacheQuery = cacheQuery;
    this.loadFn = loadFn;
    this.disposeFn = disposeFn;
    this.previousCacheState = previousCacheState;
    this._cacheKey = defaultGenerator.nextId();
    this.query = this.cacheQuery(this._cacheKey);
    this.loadingPhase = 1 /* Created */;
    if (this.previousCacheState) {
      const current = Object.assign({}, this.query, { cacheKey: null });
      const previous = Object.assign({}, this.previousCacheState.query, { cacheKey: null });
      if (!equals(current, previous)) {
        this.previousCacheState.dispose();
        this.previousCacheState = void 0;
      }
    }
  }
  get cacheKey() {
    if (this.loadingPhase === 3 /* Loaded */ || !this.previousCacheState) {
      return this._cacheKey;
    }
    return this.previousCacheState.cacheKey;
  }
  get isLoaded() {
    const isLoaded = this.loadingPhase === 3 /* Loaded */;
    return isLoaded || !this.previousCacheState ? isLoaded : this.previousCacheState.isLoaded;
  }
  get isUpdating() {
    const isUpdating = this.loadingPhase === 2 /* Loading */;
    return isUpdating || !this.previousCacheState ? isUpdating : this.previousCacheState.isUpdating;
  }
  load() {
    if (this.isUpdating) {
      return this;
    }
    this.loadingPhase = 2 /* Loading */;
    this.loadPromise = (async () => {
      try {
        await this.loadFn(this.query);
        this.loadingPhase = 3 /* Loaded */;
        if (this.previousCacheState) {
          this.previousCacheState.dispose();
          this.previousCacheState = void 0;
        }
      } catch (error) {
        this.loadingPhase = 4 /* Errored */;
        throw error;
      }
    })();
    return this;
  }
  dispose() {
    if (this.loadPromise) {
      (async () => {
        try {
          await this.loadPromise;
        } catch (error) {
        }
        this.loadingPhase = 5 /* Disposed */;
        this.disposeFn(this._cacheKey);
      })();
    } else {
      this.loadingPhase = 5 /* Disposed */;
    }
    if (this.previousCacheState) {
      this.previousCacheState.dispose();
      this.previousCacheState = void 0;
    }
  }
}
export {
  FileQueryCacheState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcY29tbW9uXFxjYWNoZVN0YXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVmYXVsdEdlbmVyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2lkR2VuZXJhdG9yLmpzJztcbmltcG9ydCB7IElGaWxlUXVlcnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcblxuZW51bSBMb2FkaW5nUGhhc2Uge1xuXHRDcmVhdGVkID0gMSxcblx0TG9hZGluZyA9IDIsXG5cdExvYWRlZCA9IDMsXG5cdEVycm9yZWQgPSA0LFxuXHREaXNwb3NlZCA9IDVcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVRdWVyeUNhY2hlU3RhdGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlS2V5O1xuXHRnZXQgY2FjaGVLZXkoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5sb2FkaW5nUGhhc2UgPT09IExvYWRpbmdQaGFzZS5Mb2FkZWQgfHwgIXRoaXMucHJldmlvdXNDYWNoZVN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGVLZXk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucHJldmlvdXNDYWNoZVN0YXRlLmNhY2hlS2V5O1xuXHR9XG5cblx0Z2V0IGlzTG9hZGVkKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlzTG9hZGVkID0gdGhpcy5sb2FkaW5nUGhhc2UgPT09IExvYWRpbmdQaGFzZS5Mb2FkZWQ7XG5cblx0XHRyZXR1cm4gaXNMb2FkZWQgfHwgIXRoaXMucHJldmlvdXNDYWNoZVN0YXRlID8gaXNMb2FkZWQgOiB0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZS5pc0xvYWRlZDtcblx0fVxuXG5cdGdldCBpc1VwZGF0aW5nKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlzVXBkYXRpbmcgPSB0aGlzLmxvYWRpbmdQaGFzZSA9PT0gTG9hZGluZ1BoYXNlLkxvYWRpbmc7XG5cblx0XHRyZXR1cm4gaXNVcGRhdGluZyB8fCAhdGhpcy5wcmV2aW91c0NhY2hlU3RhdGUgPyBpc1VwZGF0aW5nIDogdGhpcy5wcmV2aW91c0NhY2hlU3RhdGUuaXNVcGRhdGluZztcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcXVlcnk7XG5cblx0cHJpdmF0ZSBsb2FkaW5nUGhhc2U7XG5cdHByaXZhdGUgbG9hZFByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBjYWNoZVF1ZXJ5OiAoY2FjaGVLZXk6IHN0cmluZykgPT4gSUZpbGVRdWVyeSxcblx0XHRwcml2YXRlIGxvYWRGbjogKHF1ZXJ5OiBJRmlsZVF1ZXJ5KSA9PiBQcm9taXNlPHVua25vd24+LFxuXHRcdHByaXZhdGUgZGlzcG9zZUZuOiAoY2FjaGVLZXk6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPixcblx0XHRwcml2YXRlIHByZXZpb3VzQ2FjaGVTdGF0ZTogRmlsZVF1ZXJ5Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHR0aGlzLl9jYWNoZUtleSA9IGRlZmF1bHRHZW5lcmF0b3IubmV4dElkKCk7XG5cdFx0dGhpcy5xdWVyeSA9IHRoaXMuY2FjaGVRdWVyeSh0aGlzLl9jYWNoZUtleSk7XG5cdFx0dGhpcy5sb2FkaW5nUGhhc2UgPSBMb2FkaW5nUGhhc2UuQ3JlYXRlZDtcblx0XHRpZiAodGhpcy5wcmV2aW91c0NhY2hlU3RhdGUpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnF1ZXJ5LCB7IGNhY2hlS2V5OiBudWxsIH0pO1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZS5xdWVyeSwgeyBjYWNoZUtleTogbnVsbCB9KTtcblx0XHRcdGlmICghZXF1YWxzKGN1cnJlbnQsIHByZXZpb3VzKSkge1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMucHJldmlvdXNDYWNoZVN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGxvYWQoKTogRmlsZVF1ZXJ5Q2FjaGVTdGF0ZSB7XG5cdFx0aWYgKHRoaXMuaXNVcGRhdGluZykge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2FkaW5nUGhhc2UgPSBMb2FkaW5nUGhhc2UuTG9hZGluZztcblxuXHRcdHRoaXMubG9hZFByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5sb2FkRm4odGhpcy5xdWVyeSk7XG5cblx0XHRcdFx0dGhpcy5sb2FkaW5nUGhhc2UgPSBMb2FkaW5nUGhhc2UuTG9hZGVkO1xuXG5cdFx0XHRcdGlmICh0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMucHJldmlvdXNDYWNoZVN0YXRlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2FkaW5nUGhhc2UgPSBMb2FkaW5nUGhhc2UuRXJyb3JlZDtcblxuXHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxvYWRQcm9taXNlKSB7XG5cdFx0XHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMubG9hZFByb21pc2U7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmxvYWRpbmdQaGFzZSA9IExvYWRpbmdQaGFzZS5EaXNwb3NlZDtcblx0XHRcdFx0dGhpcy5kaXNwb3NlRm4odGhpcy5fY2FjaGVLZXkpO1xuXHRcdFx0fSkoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2FkaW5nUGhhc2UgPSBMb2FkaW5nUGhhc2UuRGlzcG9zZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJldmlvdXNDYWNoZVN0YXRlKSB7XG5cdFx0XHR0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnByZXZpb3VzQ2FjaGVTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsY0FBYztBQUV2QixJQUFLLGVBQUwsa0JBQUtBLGtCQUFMO0FBQ0MsRUFBQUEsNEJBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsNEJBQUEsYUFBVSxL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
