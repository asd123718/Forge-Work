import { isFalsyOrEmpty, isNonEmptyArray } from "../../../base/common/arrays.js";
import { MicrotaskEmitter } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { Schemas } from "../../../base/common/network.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { MarkerSeverity } from "./markers.js";
const unsupportedSchemas = /* @__PURE__ */ new Set([
  Schemas.inMemory,
  Schemas.vscodeSourceControl,
  Schemas.walkThrough,
  Schemas.walkThroughSnippet,
  Schemas.vscodeChatCodeBlock,
  Schemas.vscodeTerminal
]);
class DoubleResourceMap {
  constructor() {
    this._byResource = new ResourceMap();
    this._byOwner = /* @__PURE__ */ new Map();
  }
  set(resource, owner, value) {
    let ownerMap = this._byResource.get(resource);
    if (!ownerMap) {
      ownerMap = /* @__PURE__ */ new Map();
      this._byResource.set(resource, ownerMap);
    }
    ownerMap.set(owner, value);
    let resourceMap = this._byOwner.get(owner);
    if (!resourceMap) {
      resourceMap = new ResourceMap();
      this._byOwner.set(owner, resourceMap);
    }
    resourceMap.set(resource, value);
  }
  get(resource, owner) {
    const ownerMap = this._byResource.get(resource);
    return ownerMap?.get(owner);
  }
  delete(resource, owner) {
    let removedA = false;
    let removedB = false;
    const ownerMap = this._byResource.get(resource);
    if (ownerMap) {
      removedA = ownerMap.delete(owner);
    }
    const resourceMap = this._byOwner.get(owner);
    if (resourceMap) {
      removedB = resourceMap.delete(resource);
    }
    if (removedA !== removedB) {
      throw new Error("illegal state");
    }
    return removedA && removedB;
  }
  values(key) {
    if (typeof key === "string") {
      return this._byOwner.get(key)?.values() ?? Iterable.empty();
    }
    if (URI.isUri(key)) {
      return this._byResource.get(key)?.values() ?? Iterable.empty();
    }
    return Iterable.map(Iterable.concat(...this._byOwner.values()), (map) => map[1]);
  }
}
class MarkerStats {
  constructor(service) {
    this.errors = 0;
    this.infos = 0;
    this.warnings = 0;
    this.unknowns = 0;
    this._data = new ResourceMap();
    this._service = service;
    this._subscription = service.onMarkerChanged(this._update, this);
  }
  dispose() {
    this._subscription.dispose();
  }
  _update(resources) {
    for (const resource of resources) {
      const oldStats = this._data.get(resource);
      if (oldStats) {
        this._substract(oldStats);
      }
      const newStats = this._resourceStats(resource);
      this._add(newStats);
      this._data.set(resource, newStats);
    }
  }
  _resourceStats(resource) {
    const result = { errors: 0, warnings: 0, infos: 0, unknowns: 0 };
    if (unsupportedSchemas.has(resource.scheme)) {
      return result;
    }
    for (const { severity } of this._service.read({ resource })) {
      if (severity === MarkerSeverity.Error) {
        result.errors += 1;
      } else if (severity === MarkerSeverity.Warning) {
        result.warnings += 1;
      } else if (severity === MarkerSeverity.Info) {
        result.infos += 1;
      } else {
        result.unknowns += 1;
      }
    }
    return result;
  }
  _substract(op) {
    this.errors -= op.errors;
    this.warnings -= op.warnings;
    this.infos -= op.infos;
    this.unknowns -= op.unknowns;
  }
  _add(op) {
    this.errors += op.errors;
    this.warnings += op.warnings;
    this.infos += op.infos;
    this.unknowns += op.unknowns;
  }
}
class MarkerService {
  constructor() {
    this._onMarkerChanged = new MicrotaskEmitter({
      merge: MarkerService._merge
    });
    this.onMarkerChanged = this._onMarkerChanged.event;
    this._data = new DoubleResourceMap();
    this._stats = new MarkerStats(this);
    this._filteredResources = new ResourceMap();
  }
  dispose() {
    this._stats.dispose();
    this._onMarkerChanged.dispose();
  }
  getStatistics() {
    return this._stats;
  }
  remove(owner, resources) {
    for (const resource of resources || []) {
      this.changeOne(owner, resource, []);
    }
  }
  changeOne(owner, resource, markerData) {
    if (isFalsyOrEmpty(markerData)) {
      const removed = this._data.delete(resource, owner);
      if (removed) {
        this._onMarkerChanged.fire([resource]);
      }
    } else {
      const markers = [];
      for (const data of markerData) {
        const marker = MarkerService._toMarker(owner, resource, data);
        if (marker) {
          markers.push(marker);
        }
      }
      this._data.set(resource, owner, markers);
      this._onMarkerChanged.fire([resource]);
    }
  }
  installResourceFilter(resource, reason) {
    let reasons = this._filteredResources.get(resource);
    if (!reasons) {
      reasons = [];
      this._filteredResources.set(resource, reasons);
    }
    reasons.push(reason);
    this._onMarkerChanged.fire([resource]);
    return toDisposable(() => {
      const reasons2 = this._filteredResources.get(resource);
      if (!reasons2) {
        return;
      }
      const reasonIndex = reasons2.indexOf(reason);
      if (reasonIndex !== -1) {
        reasons2.splice(reasonIndex, 1);
        if (reasons2.length === 0) {
          this._filteredResources.delete(resource);
        }
        this._onMarkerChanged.fire([resource]);
      }
    });
  }
  static _toMarker(owner, resource, data) {
    let {
      code,
      severity,
      message,
      source,
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
      relatedInformation,
      modelVersionId,
      tags,
      origin
    } = data;
    if (!message) {
      return void 0;
    }
    startLineNumber = startLineNumber > 0 ? startLineNumber : 1;
    startColumn = startColumn > 0 ? startColumn : 1;
    endLineNumber = endLineNumber >= startLineNumber ? endLineNumber : startLineNumber;
    endColumn = endColumn > 0 ? endColumn : startColumn;
    return {
      resource,
      owner,
      code,
      severity,
      message,
      source,
      startLineNumber,
      startColumn,
      endLineNumber,
      endColumn,
      relatedInformation,
      modelVersionId,
      tags,
      origin
    };
  }
  changeAll(owner, data) {
    const changes = [];
    const existing = this._data.values(owner);
    if (existing) {
      for (const data2 of existing) {
        const first = Iterable.first(data2);
        if (first) {
          changes.push(first.resource);
          this._data.delete(first.resource, owner);
        }
      }
    }
    if (isNonEmptyArray(data)) {
      const groups = new ResourceMap();
      for (const { resource, marker: markerData } of data) {
        const marker = MarkerService._toMarker(owner, resource, markerData);
        if (!marker) {
          continue;
        }
        const array = groups.get(resource);
        if (!array) {
          groups.set(resource, [marker]);
          changes.push(resource);
        } else {
          array.push(marker);
        }
      }
      for (const [resource, value] of groups) {
        this._data.set(resource, owner, value);
      }
    }
    if (changes.length > 0) {
      this._onMarkerChanged.fire(changes);
    }
  }
  /**
   * Creates an information marker for filtered resources
   */
  _createFilteredMarker(resource, reasons) {
    const message = reasons.length === 1 ? localize("filtered", 'Problems are paused because: "{0}"', reasons[0]) : localize("filtered.network", 'Problems are paused because: "{0}" and {1} more', reasons[0], reasons.length - 1);
    return {
      owner: "markersFilter",
      resource,
      severity: MarkerSeverity.Info,
      message,
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1
    };
  }
  read(filter = /* @__PURE__ */ Object.create(null)) {
    let { owner, resource, severities, take } = filter;
    if (!take || take < 0) {
      take = -1;
    }
    if (owner && resource) {
      const reasons = !filter.ignoreResourceFilters ? this._filteredResources.get(resource) : void 0;
      if (reasons?.length) {
        const infoMarker = this._createFilteredMarker(resource, reasons);
        return [infoMarker];
      }
      const data = this._data.get(resource, owner);
      if (!data) {
        return [];
      }
      const result = [];
      for (const marker of data) {
        if (take > 0 && result.length === take) {
          break;
        }
        const reasons2 = !filter.ignoreResourceFilters ? this._filteredResources.get(resource) : void 0;
        if (reasons2?.length) {
          result.push(this._createFilteredMarker(resource, reasons2));
        } else if (MarkerService._accept(marker, severities)) {
          result.push(marker);
        }
      }
      return result;
    } else {
      const iterable = !owner && !resource ? this._data.values() : this._data.values(resource ?? owner);
      const result = [];
      const filtered = new ResourceSet();
      for (const markers of iterable) {
        for (const data of markers) {
          if (filtered.has(data.resource)) {
            continue;
          }
          if (take > 0 && result.length === take) {
            break;
          }
          const reasons = !filter.ignoreResourceFilters ? this._filteredResources.get(data.resource) : void 0;
          if (reasons?.length) {
            result.push(this._createFilteredMarker(data.resource, reasons));
            filtered.add(data.resource);
          } else if (MarkerService._accept(data, severities)) {
            result.push(data);
          }
        }
      }
      return result;
    }
  }
  static _accept(marker, severities) {
    return severities === void 0 || (severities & marker.severity) === marker.severity;
  }
  // --- event debounce logic
  static _merge(all) {
    const set = new ResourceMap();
    for (const array of all) {
      for (const item of array) {
        set.set(item, true);
      }
    }
    return Array.from(set.keys());
  }
}
export {
  MarkerService,
  unsupportedSchemas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWFya2Vyc1xcY29tbW9uXFxtYXJrZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNGYWxzeU9yRW1wdHksIGlzTm9uRW1wdHlBcnJheSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBNaWNyb3Rhc2tFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1hcmtlciwgSU1hcmtlckRhdGEsIElNYXJrZXJSZWFkT3B0aW9ucywgSU1hcmtlclNlcnZpY2UsIElSZXNvdXJjZU1hcmtlciwgTWFya2VyU2V2ZXJpdHksIE1hcmtlclN0YXRpc3RpY3MgfSBmcm9tICcuL21hcmtlcnMuanMnO1xuXG5leHBvcnQgY29uc3QgdW5zdXBwb3J0ZWRTY2hlbWFzID0gbmV3IFNldChbXG5cdFNjaGVtYXMuaW5NZW1vcnksXG5cdFNjaGVtYXMudnNjb2RlU291cmNlQ29udHJvbCxcblx0U2NoZW1hcy53YWxrVGhyb3VnaCxcblx0U2NoZW1hcy53YWxrVGhyb3VnaFNuaXBwZXQsXG5cdFNjaGVtYXMudnNjb2RlQ2hhdENvZGVCbG9jayxcblx0U2NoZW1hcy52c2NvZGVUZXJtaW5hbFxuXSk7XG5cbmNsYXNzIERvdWJsZVJlc291cmNlTWFwPFY+IHtcblxuXHRwcml2YXRlIF9ieVJlc291cmNlID0gbmV3IFJlc291cmNlTWFwPE1hcDxzdHJpbmcsIFY+PigpO1xuXHRwcml2YXRlIF9ieU93bmVyID0gbmV3IE1hcDxzdHJpbmcsIFJlc291cmNlTWFwPFY+PigpO1xuXG5cdHNldChyZXNvdXJjZTogVVJJLCBvd25lcjogc3RyaW5nLCB2YWx1ZTogVikge1xuXHRcdGxldCBvd25lck1hcCA9IHRoaXMuX2J5UmVzb3VyY2UuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoIW93bmVyTWFwKSB7XG5cdFx0XHRvd25lck1hcCA9IG5ldyBNYXAoKTtcblx0XHRcdHRoaXMuX2J5UmVzb3VyY2Uuc2V0KHJlc291cmNlLCBvd25lck1hcCk7XG5cdFx0fVxuXHRcdG93bmVyTWFwLnNldChvd25lciwgdmFsdWUpO1xuXG5cdFx0bGV0IHJlc291cmNlTWFwID0gdGhpcy5fYnlPd25lci5nZXQob3duZXIpO1xuXHRcdGlmICghcmVzb3VyY2VNYXApIHtcblx0XHRcdHJlc291cmNlTWFwID0gbmV3IFJlc291cmNlTWFwKCk7XG5cdFx0XHR0aGlzLl9ieU93bmVyLnNldChvd25lciwgcmVzb3VyY2VNYXApO1xuXHRcdH1cblx0XHRyZXNvdXJjZU1hcC5zZXQocmVzb3VyY2UsIHZhbHVlKTtcblx0fVxuXG5cdGdldChyZXNvdXJjZTogVVJJLCBvd25lcjogc3RyaW5nKTogViB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgb3duZXJNYXAgPSB0aGlzLl9ieVJlc291cmNlLmdldChyZXNvdXJjZSk7XG5cdFx0cmV0dXJuIG93bmVyTWFwPy5nZXQob3duZXIpO1xuXHR9XG5cblx0ZGVsZXRlKHJlc291cmNlOiBVUkksIG93bmVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRsZXQgcmVtb3ZlZEEgPSBmYWxzZTtcblx0XHRsZXQgcmVtb3ZlZEIgPSBmYWxzZTtcblx0XHRjb25zdCBvd25lck1hcCA9IHRoaXMuX2J5UmVzb3VyY2UuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAob3duZXJNYXApIHtcblx0XHRcdHJlbW92ZWRBID0gb3duZXJNYXAuZGVsZXRlKG93bmVyKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb3VyY2VNYXAgPSB0aGlzLl9ieU93bmVyLmdldChvd25lcik7XG5cdFx0aWYgKHJlc291cmNlTWFwKSB7XG5cdFx0XHRyZW1vdmVkQiA9IHJlc291cmNlTWFwLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0fVxuXHRcdGlmIChyZW1vdmVkQSAhPT0gcmVtb3ZlZEIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaWxsZWdhbCBzdGF0ZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVtb3ZlZEEgJiYgcmVtb3ZlZEI7XG5cdH1cblxuXHR2YWx1ZXMoa2V5PzogVVJJIHwgc3RyaW5nKTogSXRlcmFibGU8Vj4ge1xuXHRcdGlmICh0eXBlb2Yga2V5ID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2J5T3duZXIuZ2V0KGtleSk/LnZhbHVlcygpID8/IEl0ZXJhYmxlLmVtcHR5KCk7XG5cdFx0fVxuXHRcdGlmIChVUkkuaXNVcmkoa2V5KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2J5UmVzb3VyY2UuZ2V0KGtleSk/LnZhbHVlcygpID8/IEl0ZXJhYmxlLmVtcHR5KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEl0ZXJhYmxlLm1hcChJdGVyYWJsZS5jb25jYXQoLi4udGhpcy5fYnlPd25lci52YWx1ZXMoKSksIG1hcCA9PiBtYXBbMV0pO1xuXHR9XG59XG5cbmNsYXNzIE1hcmtlclN0YXRzIGltcGxlbWVudHMgTWFya2VyU3RhdGlzdGljcyB7XG5cblx0ZXJyb3JzOiBudW1iZXIgPSAwO1xuXHRpbmZvczogbnVtYmVyID0gMDtcblx0d2FybmluZ3M6IG51bWJlciA9IDA7XG5cdHVua25vd25zOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGEgPSBuZXcgUmVzb3VyY2VNYXA8TWFya2VyU3RhdGlzdGljcz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VydmljZTogSU1hcmtlclNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1YnNjcmlwdGlvbjogSURpc3Bvc2FibGU7XG5cblx0Y29uc3RydWN0b3Ioc2VydmljZTogSU1hcmtlclNlcnZpY2UpIHtcblx0XHR0aGlzLl9zZXJ2aWNlID0gc2VydmljZTtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb24gPSBzZXJ2aWNlLm9uTWFya2VyQ2hhbmdlZCh0aGlzLl91cGRhdGUsIHRoaXMpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKHJlc291cmNlczogcmVhZG9ubHkgVVJJW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIHJlc291cmNlcykge1xuXHRcdFx0Y29uc3Qgb2xkU3RhdHMgPSB0aGlzLl9kYXRhLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAob2xkU3RhdHMpIHtcblx0XHRcdFx0dGhpcy5fc3Vic3RyYWN0KG9sZFN0YXRzKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld1N0YXRzID0gdGhpcy5fcmVzb3VyY2VTdGF0cyhyZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9hZGQobmV3U3RhdHMpO1xuXHRcdFx0dGhpcy5fZGF0YS5zZXQocmVzb3VyY2UsIG5ld1N0YXRzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvdXJjZVN0YXRzKHJlc291cmNlOiBVUkkpOiBNYXJrZXJTdGF0aXN0aWNzIHtcblx0XHRjb25zdCByZXN1bHQ6IE1hcmtlclN0YXRpc3RpY3MgPSB7IGVycm9yczogMCwgd2FybmluZ3M6IDAsIGluZm9zOiAwLCB1bmtub3duczogMCB9O1xuXG5cdFx0Ly8gVE9ETyB0aGlzIGlzIGEgaGFja1xuXHRcdGlmICh1bnN1cHBvcnRlZFNjaGVtYXMuaGFzKHJlc291cmNlLnNjaGVtZSkpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB7IHNldmVyaXR5IH0gb2YgdGhpcy5fc2VydmljZS5yZWFkKHsgcmVzb3VyY2UgfSkpIHtcblx0XHRcdGlmIChzZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuRXJyb3IpIHtcblx0XHRcdFx0cmVzdWx0LmVycm9ycyArPSAxO1xuXHRcdFx0fSBlbHNlIGlmIChzZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuV2FybmluZykge1xuXHRcdFx0XHRyZXN1bHQud2FybmluZ3MgKz0gMTtcblx0XHRcdH0gZWxzZSBpZiAoc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5LkluZm8pIHtcblx0XHRcdFx0cmVzdWx0LmluZm9zICs9IDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQudW5rbm93bnMgKz0gMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc3Vic3RyYWN0KG9wOiBNYXJrZXJTdGF0aXN0aWNzKSB7XG5cdFx0dGhpcy5lcnJvcnMgLT0gb3AuZXJyb3JzO1xuXHRcdHRoaXMud2FybmluZ3MgLT0gb3Aud2FybmluZ3M7XG5cdFx0dGhpcy5pbmZvcyAtPSBvcC5pbmZvcztcblx0XHR0aGlzLnVua25vd25zIC09IG9wLnVua25vd25zO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWRkKG9wOiBNYXJrZXJTdGF0aXN0aWNzKSB7XG5cdFx0dGhpcy5lcnJvcnMgKz0gb3AuZXJyb3JzO1xuXHRcdHRoaXMud2FybmluZ3MgKz0gb3Aud2FybmluZ3M7XG5cdFx0dGhpcy5pbmZvcyArPSBvcC5pbmZvcztcblx0XHR0aGlzLnVua25vd25zICs9IG9wLnVua25vd25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJTZXJ2aWNlIGltcGxlbWVudHMgSU1hcmtlclNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWFya2VyQ2hhbmdlZCA9IG5ldyBNaWNyb3Rhc2tFbWl0dGVyPHJlYWRvbmx5IFVSSVtdPih7XG5cdFx0bWVyZ2U6IE1hcmtlclNlcnZpY2UuX21lcmdlXG5cdH0pO1xuXG5cdHJlYWRvbmx5IG9uTWFya2VyQ2hhbmdlZCA9IHRoaXMuX29uTWFya2VyQ2hhbmdlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhID0gbmV3IERvdWJsZVJlc291cmNlTWFwPElNYXJrZXJbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHMgPSBuZXcgTWFya2VyU3RhdHModGhpcyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbHRlcmVkUmVzb3VyY2VzID0gbmV3IFJlc291cmNlTWFwPHN0cmluZ1tdPigpO1xuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uTWFya2VyQ2hhbmdlZC5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXRTdGF0aXN0aWNzKCk6IE1hcmtlclN0YXRpc3RpY3Mge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0cztcblx0fVxuXG5cdHJlbW92ZShvd25lcjogc3RyaW5nLCByZXNvdXJjZXM6IFVSSVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiByZXNvdXJjZXMgfHwgW10pIHtcblx0XHRcdHRoaXMuY2hhbmdlT25lKG93bmVyLCByZXNvdXJjZSwgW10pO1xuXHRcdH1cblx0fVxuXG5cdGNoYW5nZU9uZShvd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJLCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdKTogdm9pZCB7XG5cblx0XHRpZiAoaXNGYWxzeU9yRW1wdHkobWFya2VyRGF0YSkpIHtcblx0XHRcdC8vIHJlbW92ZSBtYXJrZXIgZm9yIHRoaXMgKG93bmVyLHJlc291cmNlKS10dXBsZVxuXHRcdFx0Y29uc3QgcmVtb3ZlZCA9IHRoaXMuX2RhdGEuZGVsZXRlKHJlc291cmNlLCBvd25lcik7XG5cdFx0XHRpZiAocmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9vbk1hcmtlckNoYW5nZWQuZmlyZShbcmVzb3VyY2VdKTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBpbnNlcnQgbWFya2VyIGZvciB0aGlzIChvd25lcixyZXNvdXJjZSktdHVwbGVcblx0XHRcdGNvbnN0IG1hcmtlcnM6IElNYXJrZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBkYXRhIG9mIG1hcmtlckRhdGEpIHtcblx0XHRcdFx0Y29uc3QgbWFya2VyID0gTWFya2VyU2VydmljZS5fdG9NYXJrZXIob3duZXIsIHJlc291cmNlLCBkYXRhKTtcblx0XHRcdFx0aWYgKG1hcmtlcikge1xuXHRcdFx0XHRcdG1hcmtlcnMucHVzaChtYXJrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kYXRhLnNldChyZXNvdXJjZSwgb3duZXIsIG1hcmtlcnMpO1xuXHRcdFx0dGhpcy5fb25NYXJrZXJDaGFuZ2VkLmZpcmUoW3Jlc291cmNlXSk7XG5cdFx0fVxuXHR9XG5cblx0aW5zdGFsbFJlc291cmNlRmlsdGVyKHJlc291cmNlOiBVUkksIHJlYXNvbjogc3RyaW5nKTogSURpc3Bvc2FibGUge1xuXHRcdGxldCByZWFzb25zID0gdGhpcy5fZmlsdGVyZWRSZXNvdXJjZXMuZ2V0KHJlc291cmNlKTtcblxuXHRcdGlmICghcmVhc29ucykge1xuXHRcdFx0cmVhc29ucyA9IFtdO1xuXHRcdFx0dGhpcy5fZmlsdGVyZWRSZXNvdXJjZXMuc2V0KHJlc291cmNlLCByZWFzb25zKTtcblx0XHR9XG5cdFx0cmVhc29ucy5wdXNoKHJlYXNvbik7XG5cdFx0dGhpcy5fb25NYXJrZXJDaGFuZ2VkLmZpcmUoW3Jlc291cmNlXSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IHJlYXNvbnMgPSB0aGlzLl9maWx0ZXJlZFJlc291cmNlcy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFyZWFzb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlYXNvbkluZGV4ID0gcmVhc29ucy5pbmRleE9mKHJlYXNvbik7XG5cdFx0XHRpZiAocmVhc29uSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHJlYXNvbnMuc3BsaWNlKHJlYXNvbkluZGV4LCAxKTtcblx0XHRcdFx0aWYgKHJlYXNvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVyZWRSZXNvdXJjZXMuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbk1hcmtlckNoYW5nZWQuZmlyZShbcmVzb3VyY2VdKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF90b01hcmtlcihvd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJLCBkYXRhOiBJTWFya2VyRGF0YSk6IElNYXJrZXIgfCB1bmRlZmluZWQge1xuXHRcdGxldCB7XG5cdFx0XHRjb2RlLCBzZXZlcml0eSxcblx0XHRcdG1lc3NhZ2UsIHNvdXJjZSxcblx0XHRcdHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbixcblx0XHRcdHJlbGF0ZWRJbmZvcm1hdGlvbixcblx0XHRcdG1vZGVsVmVyc2lvbklkLFxuXHRcdFx0dGFncywgb3JpZ2luXG5cdFx0fSA9IGRhdGE7XG5cblx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gc2FudGl6ZSBkYXRhXG5cdFx0c3RhcnRMaW5lTnVtYmVyID0gc3RhcnRMaW5lTnVtYmVyID4gMCA/IHN0YXJ0TGluZU51bWJlciA6IDE7XG5cdFx0c3RhcnRDb2x1bW4gPSBzdGFydENvbHVtbiA+IDAgPyBzdGFydENvbHVtbiA6IDE7XG5cdFx0ZW5kTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXIgPj0gc3RhcnRMaW5lTnVtYmVyID8gZW5kTGluZU51bWJlciA6IHN0YXJ0TGluZU51bWJlcjtcblx0XHRlbmRDb2x1bW4gPSBlbmRDb2x1bW4gPiAwID8gZW5kQ29sdW1uIDogc3RhcnRDb2x1bW47XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRvd25lcixcblx0XHRcdGNvZGUsXG5cdFx0XHRzZXZlcml0eSxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRzb3VyY2UsXG5cdFx0XHRzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRzdGFydENvbHVtbixcblx0XHRcdGVuZExpbmVOdW1iZXIsXG5cdFx0XHRlbmRDb2x1bW4sXG5cdFx0XHRyZWxhdGVkSW5mb3JtYXRpb24sXG5cdFx0XHRtb2RlbFZlcnNpb25JZCxcblx0XHRcdHRhZ3MsXG5cdFx0XHRvcmlnaW5cblx0XHR9O1xuXHR9XG5cblx0Y2hhbmdlQWxsKG93bmVyOiBzdHJpbmcsIGRhdGE6IElSZXNvdXJjZU1hcmtlcltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlczogVVJJW10gPSBbXTtcblxuXHRcdC8vIHJlbW92ZSBvbGQgbWFya2VyXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9kYXRhLnZhbHVlcyhvd25lcik7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRhdGEgb2YgZXhpc3RpbmcpIHtcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSBJdGVyYWJsZS5maXJzdChkYXRhKTtcblx0XHRcdFx0aWYgKGZpcnN0KSB7XG5cdFx0XHRcdFx0Y2hhbmdlcy5wdXNoKGZpcnN0LnJlc291cmNlKTtcblx0XHRcdFx0XHR0aGlzLl9kYXRhLmRlbGV0ZShmaXJzdC5yZXNvdXJjZSwgb3duZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIG5ldyBtYXJrZXJzXG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShkYXRhKSkge1xuXG5cdFx0XHQvLyBncm91cCBieSByZXNvdXJjZVxuXHRcdFx0Y29uc3QgZ3JvdXBzID0gbmV3IFJlc291cmNlTWFwPElNYXJrZXJbXT4oKTtcblx0XHRcdGZvciAoY29uc3QgeyByZXNvdXJjZSwgbWFya2VyOiBtYXJrZXJEYXRhIH0gb2YgZGF0YSkge1xuXHRcdFx0XHRjb25zdCBtYXJrZXIgPSBNYXJrZXJTZXJ2aWNlLl90b01hcmtlcihvd25lciwgcmVzb3VyY2UsIG1hcmtlckRhdGEpO1xuXHRcdFx0XHRpZiAoIW1hcmtlcikge1xuXHRcdFx0XHRcdC8vIGZpbHRlciBiYWQgbWFya2Vyc1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFycmF5ID0gZ3JvdXBzLmdldChyZXNvdXJjZSk7XG5cdFx0XHRcdGlmICghYXJyYXkpIHtcblx0XHRcdFx0XHRncm91cHMuc2V0KHJlc291cmNlLCBbbWFya2VyXSk7XG5cdFx0XHRcdFx0Y2hhbmdlcy5wdXNoKHJlc291cmNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhcnJheS5wdXNoKG1hcmtlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gaW5zZXJ0IGFsbFxuXHRcdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIHZhbHVlXSBvZiBncm91cHMpIHtcblx0XHRcdFx0dGhpcy5fZGF0YS5zZXQocmVzb3VyY2UsIG93bmVyLCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25NYXJrZXJDaGFuZ2VkLmZpcmUoY2hhbmdlcyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gaW5mb3JtYXRpb24gbWFya2VyIGZvciBmaWx0ZXJlZCByZXNvdXJjZXNcblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZUZpbHRlcmVkTWFya2VyKHJlc291cmNlOiBVUkksIHJlYXNvbnM6IHN0cmluZ1tdKTogSU1hcmtlciB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHJlYXNvbnMubGVuZ3RoID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdmaWx0ZXJlZCcsIFwiUHJvYmxlbXMgYXJlIHBhdXNlZCBiZWNhdXNlOiBcXFwiezB9XFxcIlwiLCByZWFzb25zWzBdKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZmlsdGVyZWQubmV0d29yaycsIFwiUHJvYmxlbXMgYXJlIHBhdXNlZCBiZWNhdXNlOiBcXFwiezB9XFxcIiBhbmQgezF9IG1vcmVcIiwgcmVhc29uc1swXSwgcmVhc29ucy5sZW5ndGggLSAxKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvd25lcjogJ21hcmtlcnNGaWx0ZXInLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0fTtcblx0fVxuXG5cdHJlYWQoZmlsdGVyOiBJTWFya2VyUmVhZE9wdGlvbnMgPSBPYmplY3QuY3JlYXRlKG51bGwpKTogSU1hcmtlcltdIHtcblxuXHRcdGxldCB7IG93bmVyLCByZXNvdXJjZSwgc2V2ZXJpdGllcywgdGFrZSB9ID0gZmlsdGVyO1xuXG5cdFx0aWYgKCF0YWtlIHx8IHRha2UgPCAwKSB7XG5cdFx0XHR0YWtlID0gLTE7XG5cdFx0fVxuXG5cdFx0aWYgKG93bmVyICYmIHJlc291cmNlKSB7XG5cdFx0XHQvLyBleGFjdGx5IG9uZSBvd25lciBBTkQgcmVzb3VyY2Vcblx0XHRcdGNvbnN0IHJlYXNvbnMgPSAhZmlsdGVyLmlnbm9yZVJlc291cmNlRmlsdGVycyA/IHRoaXMuX2ZpbHRlcmVkUmVzb3VyY2VzLmdldChyZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocmVhc29ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGluZm9NYXJrZXIgPSB0aGlzLl9jcmVhdGVGaWx0ZXJlZE1hcmtlcihyZXNvdXJjZSwgcmVhc29ucyk7XG5cdFx0XHRcdHJldHVybiBbaW5mb01hcmtlcl07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhLmdldChyZXNvdXJjZSwgb3duZXIpO1xuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBJTWFya2VyW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgbWFya2VyIG9mIGRhdGEpIHtcblx0XHRcdFx0aWYgKHRha2UgPiAwICYmIHJlc3VsdC5sZW5ndGggPT09IHRha2UpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByZWFzb25zID0gIWZpbHRlci5pZ25vcmVSZXNvdXJjZUZpbHRlcnMgPyB0aGlzLl9maWx0ZXJlZFJlc291cmNlcy5nZXQocmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAocmVhc29ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5fY3JlYXRlRmlsdGVyZWRNYXJrZXIocmVzb3VyY2UsIHJlYXNvbnMpKTtcblxuXHRcdFx0XHR9IGVsc2UgaWYgKE1hcmtlclNlcnZpY2UuX2FjY2VwdChtYXJrZXIsIHNldmVyaXRpZXMpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2gobWFya2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBvZiBvbmUgcmVzb3VyY2UgT1Igb3duZXJcblx0XHRcdGNvbnN0IGl0ZXJhYmxlID0gIW93bmVyICYmICFyZXNvdXJjZVxuXHRcdFx0XHQ/IHRoaXMuX2RhdGEudmFsdWVzKClcblx0XHRcdFx0OiB0aGlzLl9kYXRhLnZhbHVlcyhyZXNvdXJjZSA/PyBvd25lciEpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IElNYXJrZXJbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZmlsdGVyZWQgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRcdFx0Zm9yIChjb25zdCBtYXJrZXJzIG9mIGl0ZXJhYmxlKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZGF0YSBvZiBtYXJrZXJzKSB7XG5cdFx0XHRcdFx0aWYgKGZpbHRlcmVkLmhhcyhkYXRhLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0YWtlID4gMCAmJiByZXN1bHQubGVuZ3RoID09PSB0YWtlKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcmVhc29ucyA9ICFmaWx0ZXIuaWdub3JlUmVzb3VyY2VGaWx0ZXJzID8gdGhpcy5fZmlsdGVyZWRSZXNvdXJjZXMuZ2V0KGRhdGEucmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChyZWFzb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuX2NyZWF0ZUZpbHRlcmVkTWFya2VyKGRhdGEucmVzb3VyY2UsIHJlYXNvbnMpKTtcblx0XHRcdFx0XHRcdGZpbHRlcmVkLmFkZChkYXRhLnJlc291cmNlKTtcblxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoTWFya2VyU2VydmljZS5fYWNjZXB0KGRhdGEsIHNldmVyaXRpZXMpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChkYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FjY2VwdChtYXJrZXI6IElNYXJrZXIsIHNldmVyaXRpZXM/OiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2V2ZXJpdGllcyA9PT0gdW5kZWZpbmVkIHx8IChzZXZlcml0aWVzICYgbWFya2VyLnNldmVyaXR5KSA9PT0gbWFya2VyLnNldmVyaXR5O1xuXHR9XG5cblx0Ly8gLS0tIGV2ZW50IGRlYm91bmNlIGxvZ2ljXG5cblx0cHJpdmF0ZSBzdGF0aWMgX21lcmdlKGFsbDogKHJlYWRvbmx5IFVSSVtdKVtdKTogVVJJW10ge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPigpO1xuXHRcdGZvciAoY29uc3QgYXJyYXkgb2YgYWxsKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYXJyYXkpIHtcblx0XHRcdFx0c2V0LnNldChpdGVtLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIEFycmF5LmZyb20oc2V0LmtleXMoKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCLHVCQUF1QjtBQUNoRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFzQixvQkFB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
