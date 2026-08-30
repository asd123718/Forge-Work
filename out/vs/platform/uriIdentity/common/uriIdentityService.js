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
import { IUriIdentityService } from "./uriIdentity.js";
import { URI } from "../../../base/common/uri.js";
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { IFileService, FileSystemProviderCapabilities } from "../../files/common/files.js";
import { ExtUri, normalizePath } from "../../../base/common/resources.js";
import { Event } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { quickSelect } from "../../../base/common/arrays.js";
const _Entry = class _Entry {
  constructor(uri) {
    this.uri = uri;
    this.time = _Entry._clock++;
  }
  touch() {
    this.time = _Entry._clock++;
    return this;
  }
};
_Entry._clock = 0;
let Entry = _Entry;
let UriIdentityService = class {
  constructor(_fileService) {
    this._fileService = _fileService;
    this._dispooables = new DisposableStore();
    this._limit = 2 ** 16;
    const schemeIgnoresPathCasingCache = /* @__PURE__ */ new Map();
    const ignorePathCasing = (uri) => {
      let ignorePathCasing2 = schemeIgnoresPathCasingCache.get(uri.scheme);
      if (ignorePathCasing2 === void 0) {
        ignorePathCasing2 = _fileService.hasProvider(uri) && !this._fileService.hasCapability(uri, FileSystemProviderCapabilities.PathCaseSensitive);
        schemeIgnoresPathCasingCache.set(uri.scheme, ignorePathCasing2);
      }
      return ignorePathCasing2;
    };
    this._dispooables.add(Event.any(
      _fileService.onDidChangeFileSystemProviderRegistrations,
      _fileService.onDidChangeFileSystemProviderCapabilities
    )((e) => {
      const oldIgnorePathCasingValue = schemeIgnoresPathCasingCache.get(e.scheme);
      if (oldIgnorePathCasingValue === void 0) {
        return;
      }
      schemeIgnoresPathCasingCache.delete(e.scheme);
      const newIgnorePathCasingValue = ignorePathCasing(URI.from({ scheme: e.scheme }));
      if (newIgnorePathCasingValue === newIgnorePathCasingValue) {
        return;
      }
      for (const [key, entry] of this._canonicalUris.entries()) {
        if (entry.uri.scheme !== e.scheme) {
          continue;
        }
        this._canonicalUris.delete(key);
      }
    }));
    this.extUri = new ExtUri(ignorePathCasing);
    this._canonicalUris = /* @__PURE__ */ new Map();
  }
  dispose() {
    this._dispooables.dispose();
    this._canonicalUris.clear();
  }
  asCanonicalUri(uri) {
    if (this._fileService.hasProvider(uri)) {
      uri = normalizePath(uri);
    }
    const uriKey = this.extUri.getComparisonKey(uri, true);
    const item = this._canonicalUris.get(uriKey);
    if (item) {
      return item.touch().uri.with({ fragment: uri.fragment });
    }
    this._canonicalUris.set(uriKey, new Entry(uri));
    this._checkTrim();
    return uri;
  }
  _checkTrim() {
    if (this._canonicalUris.size < this._limit) {
      return;
    }
    Entry._clock = 1;
    const times = [...this._canonicalUris.values()].map((e) => e.time);
    const median = quickSelect(
      Math.floor(times.length / 2),
      times,
      (a, b) => a - b
    );
    for (const [key, entry] of this._canonicalUris.entries()) {
      if (entry.time <= median) {
        this._canonicalUris.delete(key);
      } else {
        entry.time = 0;
      }
    }
  }
};
UriIdentityService = __decorateClass([
  __decorateParam(0, IFileService)
], UriIdentityService);
registerSingleton(IUriIdentityService, UriIdentityService, InstantiationType.Delayed);
export {
  UriIdentityService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXJpSWRlbnRpdHlcXGNvbW1vblxcdXJpSWRlbnRpdHlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNDaGFuZ2VFdmVudCwgSUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEV4dFVyaSwgSUV4dFVyaSwgbm9ybWFsaXplUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBxdWlja1NlbGVjdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5cbmNsYXNzIEVudHJ5IHtcblx0c3RhdGljIF9jbG9jayA9IDA7XG5cdHRpbWU6IG51bWJlciA9IEVudHJ5Ll9jbG9jaysrO1xuXHRjb25zdHJ1Y3RvcihyZWFkb25seSB1cmk6IFVSSSkgeyB9XG5cdHRvdWNoKCkge1xuXHRcdHRoaXMudGltZSA9IEVudHJ5Ll9jbG9jaysrO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVcmlJZGVudGl0eVNlcnZpY2UgaW1wbGVtZW50cyBJVXJpSWRlbnRpdHlTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBleHRVcmk6IElFeHRVcmk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9vYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nhbm9uaWNhbFVyaXM6IE1hcDxzdHJpbmcsIEVudHJ5Pjtcblx0cHJpdmF0ZSByZWFkb25seSBfbGltaXQgPSAyICoqIDE2O1xuXG5cdGNvbnN0cnVjdG9yKEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSkge1xuXG5cdFx0Y29uc3Qgc2NoZW1lSWdub3Jlc1BhdGhDYXNpbmdDYWNoZSA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXG5cdFx0Ly8gYXNzdW1lIHBhdGggY2FzaW5nIG1hdHRlcnMgdW5sZXNzIHRoZSBmaWxlIHN5c3RlbSBwcm92aWRlciBzcGVjJ2VkIHRoZSBvcHBvc2l0ZS5cblx0XHQvLyBmb3IgYWxsIG90aGVyIGNhc2VzIHBhdGggY2FzaW5nIG1hdHRlcnMsIGUuZyBmb3Jcblx0XHQvLyAqIHZpcnR1YWwgZG9jdW1lbnRzXG5cdFx0Ly8gKiBpbi1tZW1vcnkgdXJpc1xuXHRcdC8vICogYWxsIGtpbmQgb2YgXCJwcml2YXRlXCIgc2NoZW1lc1xuXHRcdGNvbnN0IGlnbm9yZVBhdGhDYXNpbmcgPSAodXJpOiBVUkkpOiBib29sZWFuID0+IHtcblx0XHRcdGxldCBpZ25vcmVQYXRoQ2FzaW5nID0gc2NoZW1lSWdub3Jlc1BhdGhDYXNpbmdDYWNoZS5nZXQodXJpLnNjaGVtZSk7XG5cdFx0XHRpZiAoaWdub3JlUGF0aENhc2luZyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIHJldHJpZXZlIG9uY2UgYW5kIHRoZW4gY2FzZSBwZXIgc2NoZW1lIHVudGlsIGEgY2hhbmdlIGhhcHBlbnNcblx0XHRcdFx0aWdub3JlUGF0aENhc2luZyA9IF9maWxlU2VydmljZS5oYXNQcm92aWRlcih1cmkpICYmICF0aGlzLl9maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KHVyaSwgRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzLlBhdGhDYXNlU2Vuc2l0aXZlKTtcblx0XHRcdFx0c2NoZW1lSWdub3Jlc1BhdGhDYXNpbmdDYWNoZS5zZXQodXJpLnNjaGVtZSwgaWdub3JlUGF0aENhc2luZyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaWdub3JlUGF0aENhc2luZztcblx0XHR9O1xuXHRcdHRoaXMuX2Rpc3Bvb2FibGVzLmFkZChFdmVudC5hbnk8SUZpbGVTeXN0ZW1Qcm92aWRlckNhcGFiaWxpdGllc0NoYW5nZUV2ZW50IHwgSUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbkV2ZW50Pihcblx0XHRcdF9maWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMsXG5cdFx0XHRfZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXNcblx0XHQpKGUgPT4ge1xuXHRcdFx0Y29uc3Qgb2xkSWdub3JlUGF0aENhc2luZ1ZhbHVlID0gc2NoZW1lSWdub3Jlc1BhdGhDYXNpbmdDYWNoZS5nZXQoZS5zY2hlbWUpO1xuXHRcdFx0aWYgKG9sZElnbm9yZVBhdGhDYXNpbmdWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHNjaGVtZUlnbm9yZXNQYXRoQ2FzaW5nQ2FjaGUuZGVsZXRlKGUuc2NoZW1lKTtcblx0XHRcdGNvbnN0IG5ld0lnbm9yZVBhdGhDYXNpbmdWYWx1ZSA9IGlnbm9yZVBhdGhDYXNpbmcoVVJJLmZyb20oeyBzY2hlbWU6IGUuc2NoZW1lIH0pKTtcblx0XHRcdGlmIChuZXdJZ25vcmVQYXRoQ2FzaW5nVmFsdWUgPT09IG5ld0lnbm9yZVBhdGhDYXNpbmdWYWx1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIGVudHJ5XSBvZiB0aGlzLl9jYW5vbmljYWxVcmlzLmVudHJpZXMoKSkge1xuXHRcdFx0XHRpZiAoZW50cnkudXJpLnNjaGVtZSAhPT0gZS5zY2hlbWUpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jYW5vbmljYWxVcmlzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZXh0VXJpID0gbmV3IEV4dFVyaShpZ25vcmVQYXRoQ2FzaW5nKTtcblx0XHR0aGlzLl9jYW5vbmljYWxVcmlzID0gbmV3IE1hcCgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb29hYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2Fub25pY2FsVXJpcy5jbGVhcigpO1xuXHR9XG5cblx0YXNDYW5vbmljYWxVcmkodXJpOiBVUkkpOiBVUkkge1xuXG5cdFx0Ly8gKDEpIG5vcm1hbGl6ZSBVUklcblx0XHRpZiAodGhpcy5fZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIodXJpKSkge1xuXHRcdFx0dXJpID0gbm9ybWFsaXplUGF0aCh1cmkpO1xuXHRcdH1cblxuXHRcdC8vICgyKSBmaW5kIHRoZSB1cmkgaW4gaXRzIGNhbm9uaWNhbCBmb3JtIG9yIHVzZSB0aGlzIHVyaSB0byBkZWZpbmUgaXRcblx0XHRjb25zdCB1cmlLZXkgPSB0aGlzLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHVyaSwgdHJ1ZSk7XG5cdFx0Y29uc3QgaXRlbSA9IHRoaXMuX2Nhbm9uaWNhbFVyaXMuZ2V0KHVyaUtleSk7XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdHJldHVybiBpdGVtLnRvdWNoKCkudXJpLndpdGgoeyBmcmFnbWVudDogdXJpLmZyYWdtZW50IH0pO1xuXHRcdH1cblxuXHRcdC8vIHRoaXMgdXJpIGlzIGZpcnN0IGFuZCBkZWZpbmVzIHRoZSBjYW5vbmljYWwgZm9ybVxuXHRcdHRoaXMuX2Nhbm9uaWNhbFVyaXMuc2V0KHVyaUtleSwgbmV3IEVudHJ5KHVyaSkpO1xuXHRcdHRoaXMuX2NoZWNrVHJpbSgpO1xuXG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrVHJpbSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY2Fub25pY2FsVXJpcy5zaXplIDwgdGhpcy5fbGltaXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRFbnRyeS5fY2xvY2sgPSAxO1xuXHRcdGNvbnN0IHRpbWVzID0gWy4uLnRoaXMuX2Nhbm9uaWNhbFVyaXMudmFsdWVzKCldLm1hcChlID0+IGUudGltZSk7XG5cdFx0Y29uc3QgbWVkaWFuID0gcXVpY2tTZWxlY3QoXG5cdFx0XHRNYXRoLmZsb29yKHRpbWVzLmxlbmd0aCAvIDIpLFxuXHRcdFx0dGltZXMsXG5cdFx0XHQoYSwgYikgPT4gYSAtIGIpO1xuXHRcdGZvciAoY29uc3QgW2tleSwgZW50cnldIG9mIHRoaXMuX2Nhbm9uaWNhbFVyaXMuZW50cmllcygpKSB7XG5cdFx0XHQvLyBJdHMgaW1wb3J0YW50IHRvIHJlbW92ZSB0aGUgbWVkaWFuIHZhbHVlIGhlcmUgKDw9IG5vdCA8KS5cblx0XHRcdC8vIElmIHdlIGhhdmUgbm90IHRvdWNoZWQgYW55IGl0ZW1zIHNpbmNlIHRoZSBsYXN0IHRyaW0sIHRoZVxuXHRcdFx0Ly8gbWVkaWFuIHdpbGwgYmUgMCBhbmQgbm8gaXRlbXMgd2lsbCBiZSByZW1vdmVkIG90aGVyd2lzZS5cblx0XHRcdGlmIChlbnRyeS50aW1lIDw9IG1lZGlhbikge1xuXHRcdFx0XHR0aGlzLl9jYW5vbmljYWxVcmlzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZW50cnkudGltZSA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElVcmlJZGVudGl0eVNlcnZpY2UsIFVyaUlkZW50aXR5U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxjQUFjLHNDQUF3SDtBQUMvSSxTQUFTLFFBQWlCLHFCQUFxQjtBQUMvQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFFNUIsTUFBTSxTQUFOLE1BQU0sT0FBTTtBQUFBLEVBR1gsWUFBcUIsS0FBVTtBQUFWO0FBRHJCLGdCQUFlLE9BQU07QUFBQSxFQUNZO0FBQUEsRUFDakMsUUFBUTtBQUNQLFNBQUssT0FBTyxPQUFNO0FBQ2xCLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFSTSxPQUNFLFNBQVM7QUFEakIsSUFBTSxRQUFOO0FBVU8sSUFB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
