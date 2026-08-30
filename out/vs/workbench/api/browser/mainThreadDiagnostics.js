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
import { IMarkerService } from "../../../platform/markers/common/markers.js";
import { URI } from "../../../base/common/uri.js";
import { MainContext, ExtHostContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IUriIdentityService } from "../../../platform/uriIdentity/common/uriIdentity.js";
import { ResourceMap } from "../../../base/common/map.js";
let MainThreadDiagnostics = class {
  constructor(extHostContext, _markerService, _uriIdentService) {
    this._markerService = _markerService;
    this._uriIdentService = _uriIdentService;
    this._activeOwners = /* @__PURE__ */ new Set();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDiagnostics);
    this._markerListener = this._markerService.onMarkerChanged(this._forwardMarkers, this);
    this.extHostId = `extHost${MainThreadDiagnostics.ExtHostCounter++}`;
  }
  dispose() {
    this._markerListener.dispose();
    for (const owner of this._activeOwners) {
      const markersData = new ResourceMap();
      for (const marker of this._markerService.read({ owner })) {
        let data = markersData.get(marker.resource);
        if (data === void 0) {
          data = [];
          markersData.set(marker.resource, data);
        }
        if (marker.origin !== this.extHostId) {
          data.push(marker);
        }
      }
      for (const [resource, local] of markersData.entries()) {
        this._markerService.changeOne(owner, resource, local);
      }
    }
    this._activeOwners.clear();
  }
  _forwardMarkers(resources) {
    const data = [];
    for (const resource of resources) {
      const allMarkerData = this._markerService.read({ resource, ignoreResourceFilters: true });
      if (allMarkerData.length === 0) {
        data.push([resource, []]);
      } else {
        const foreignMarkerData = allMarkerData.filter((marker) => marker?.origin !== this.extHostId);
        if (foreignMarkerData.length > 0) {
          data.push([resource, foreignMarkerData]);
        }
      }
    }
    if (data.length > 0) {
      this._proxy.$acceptMarkersChange(data);
    }
  }
  $changeMany(owner, entries) {
    for (const entry of entries) {
      const [uri, markers] = entry;
      if (markers) {
        for (const marker of markers) {
          if (marker.relatedInformation) {
            for (const relatedInformation of marker.relatedInformation) {
              relatedInformation.resource = URI.revive(relatedInformation.resource);
            }
          }
          if (marker.code && typeof marker.code !== "string") {
            marker.code.target = URI.revive(marker.code.target);
          }
          if (marker.origin === void 0) {
            marker.origin = this.extHostId;
          }
        }
      }
      this._markerService.changeOne(owner, this._uriIdentService.asCanonicalUri(URI.revive(uri)), markers);
    }
    this._activeOwners.add(owner);
  }
  $clear(owner) {
    this._markerService.changeAll(owner, []);
    this._activeOwners.delete(owner);
  }
};
MainThreadDiagnostics.ExtHostCounter = 1;
MainThreadDiagnostics = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadDiagnostics),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IUriIdentityService)
], MainThreadDiagnostics);
export {
  MainThreadDiagnostics
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZERpYWdub3N0aWNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UsIElNYXJrZXJEYXRhLCB0eXBlIElNYXJrZXIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkRGlhZ25vc3RpY3NTaGFwZSwgTWFpbkNvbnRleHQsIEV4dEhvc3REaWFnbm9zdGljc1NoYXBlLCBFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZERpYWdub3N0aWNzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWREaWFnbm9zdGljcyBpbXBsZW1lbnRzIE1haW5UaHJlYWREaWFnbm9zdGljc1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVPd25lcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdERpYWdub3N0aWNzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcmtlckxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblxuXHRwcml2YXRlIHN0YXRpYyBFeHRIb3N0Q291bnRlcjogbnVtYmVyID0gMTtcblx0cHJpdmF0ZSByZWFkb25seSBleHRIb3N0SWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91cmlJZGVudFNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdERpYWdub3N0aWNzKTtcblxuXHRcdHRoaXMuX21hcmtlckxpc3RlbmVyID0gdGhpcy5fbWFya2VyU2VydmljZS5vbk1hcmtlckNoYW5nZWQodGhpcy5fZm9yd2FyZE1hcmtlcnMsIHRoaXMpO1xuXHRcdHRoaXMuZXh0SG9zdElkID0gYGV4dEhvc3Qke01haW5UaHJlYWREaWFnbm9zdGljcy5FeHRIb3N0Q291bnRlcisrfWA7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX21hcmtlckxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRmb3IgKGNvbnN0IG93bmVyIG9mIHRoaXMuX2FjdGl2ZU93bmVycykge1xuXHRcdFx0Y29uc3QgbWFya2Vyc0RhdGE6IFJlc291cmNlTWFwPElNYXJrZXJbXT4gPSBuZXcgUmVzb3VyY2VNYXA8SU1hcmtlcltdPigpO1xuXHRcdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgdGhpcy5fbWFya2VyU2VydmljZS5yZWFkKHsgb3duZXIgfSkpIHtcblx0XHRcdFx0bGV0IGRhdGEgPSBtYXJrZXJzRGF0YS5nZXQobWFya2VyLnJlc291cmNlKTtcblx0XHRcdFx0aWYgKGRhdGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRhdGEgPSBbXTtcblx0XHRcdFx0XHRtYXJrZXJzRGF0YS5zZXQobWFya2VyLnJlc291cmNlLCBkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobWFya2VyLm9yaWdpbiAhPT0gdGhpcy5leHRIb3N0SWQpIHtcblx0XHRcdFx0XHRkYXRhLnB1c2gobWFya2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIGxvY2FsXSBvZiBtYXJrZXJzRGF0YS5lbnRyaWVzKCkpIHtcblx0XHRcdFx0dGhpcy5fbWFya2VyU2VydmljZS5jaGFuZ2VPbmUob3duZXIsIHJlc291cmNlLCBsb2NhbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZU93bmVycy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9yd2FyZE1hcmtlcnMocmVzb3VyY2VzOiByZWFkb25seSBVUklbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGRhdGE6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMpIHtcblx0XHRcdGNvbnN0IGFsbE1hcmtlckRhdGEgPSB0aGlzLl9tYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSwgaWdub3JlUmVzb3VyY2VGaWx0ZXJzOiB0cnVlIH0pO1xuXHRcdFx0aWYgKGFsbE1hcmtlckRhdGEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGRhdGEucHVzaChbcmVzb3VyY2UsIFtdXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBmb3JlaWduTWFya2VyRGF0YSA9IGFsbE1hcmtlckRhdGEuZmlsdGVyKG1hcmtlciA9PiBtYXJrZXI/Lm9yaWdpbiAhPT0gdGhpcy5leHRIb3N0SWQpO1xuXHRcdFx0XHRpZiAoZm9yZWlnbk1hcmtlckRhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGRhdGEucHVzaChbcmVzb3VyY2UsIGZvcmVpZ25NYXJrZXJEYXRhXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGRhdGEubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdE1hcmtlcnNDaGFuZ2UoZGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0JGNoYW5nZU1hbnkob3duZXI6IHN0cmluZywgZW50cmllczogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGNvbnN0IFt1cmksIG1hcmtlcnNdID0gZW50cnk7XG5cdFx0XHRpZiAobWFya2Vycykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1hcmtlciBvZiBtYXJrZXJzKSB7XG5cdFx0XHRcdFx0aWYgKG1hcmtlci5yZWxhdGVkSW5mb3JtYXRpb24pIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcmVsYXRlZEluZm9ybWF0aW9uIG9mIG1hcmtlci5yZWxhdGVkSW5mb3JtYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0cmVsYXRlZEluZm9ybWF0aW9uLnJlc291cmNlID0gVVJJLnJldml2ZShyZWxhdGVkSW5mb3JtYXRpb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWFya2VyLmNvZGUgJiYgdHlwZW9mIG1hcmtlci5jb2RlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0bWFya2VyLmNvZGUudGFyZ2V0ID0gVVJJLnJldml2ZShtYXJrZXIuY29kZS50YXJnZXQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWFya2VyLm9yaWdpbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRtYXJrZXIub3JpZ2luID0gdGhpcy5leHRIb3N0SWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZShvd25lciwgdGhpcy5fdXJpSWRlbnRTZXJ2aWNlLmFzQ2Fub25pY2FsVXJpKFVSSS5yZXZpdmUodXJpKSksIG1hcmtlcnMpO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVPd25lcnMuYWRkKG93bmVyKTtcblx0fVxuXG5cdCRjbGVhcihvd25lcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFya2VyU2VydmljZS5jaGFuZ2VBbGwob3duZXIsIFtdKTtcblx0XHR0aGlzLl9hY3RpdmVPd25lcnMuZGVsZXRlKG93bmVyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFpRDtBQUMxRCxTQUFTLFdBQTBCO0FBQ25DLFNBQXFDLGFBQXNDLHNCQUFzQjtBQUNqRyxTQUFTLDRCQUE2QztBQUV0RCxTQUFTLDJC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
