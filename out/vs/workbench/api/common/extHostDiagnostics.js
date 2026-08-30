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
import { localize } from "../../../nls.js";
import { MarkerSeverity } from "../../../platform/markers/common/markers.js";
import { URI } from "../../../base/common/uri.js";
import { MainContext } from "./extHost.protocol.js";
import { DiagnosticSeverity } from "./extHostTypes.js";
import * as converter from "./extHostTypeConverters.js";
import { Event, DebounceEmitter } from "../../../base/common/event.js";
import { coalesce } from "../../../base/common/arrays.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ResourceMap } from "../../../base/common/map.js";
import { IExtHostFileSystemInfo } from "./extHostFileSystemInfo.js";
class DiagnosticCollection {
  constructor(_name, _owner, _maxDiagnosticsTotal, _maxDiagnosticsPerFile, _modelVersionIdProvider, extUri, proxy, onDidChangeDiagnostics) {
    this._name = _name;
    this._owner = _owner;
    this._maxDiagnosticsTotal = _maxDiagnosticsTotal;
    this._maxDiagnosticsPerFile = _maxDiagnosticsPerFile;
    this._modelVersionIdProvider = _modelVersionIdProvider;
    this._isDisposed = false;
    this._maxDiagnosticsTotal = Math.max(_maxDiagnosticsPerFile, _maxDiagnosticsTotal);
    this.#data = new ResourceMap((uri) => extUri.getComparisonKey(uri));
    this.#proxy = proxy;
    this.#onDidChangeDiagnostics = onDidChangeDiagnostics;
  }
  #proxy;
  #onDidChangeDiagnostics;
  #data;
  dispose() {
    if (!this._isDisposed) {
      this.#onDidChangeDiagnostics.fire([...this.#data.keys()]);
      this.#proxy?.$clear(this._owner);
      this.#data.clear();
      this._isDisposed = true;
    }
  }
  get name() {
    this._checkDisposed();
    return this._name;
  }
  set(first, diagnostics) {
    if (!first) {
      this.clear();
      return;
    }
    this._checkDisposed();
    let toSync = [];
    if (URI.isUri(first)) {
      if (!diagnostics) {
        this.delete(first);
        return;
      }
      this.#data.set(first, coalesce(diagnostics));
      toSync = [first];
    } else if (Array.isArray(first)) {
      toSync = [];
      let lastUri;
      first = [...first].sort(DiagnosticCollection._compareIndexedTuplesByUri);
      for (const tuple of first) {
        const [uri, diagnostics2] = tuple;
        if (!lastUri || uri.toString() !== lastUri.toString()) {
          if (lastUri && this.#data.get(lastUri).length === 0) {
            this.#data.delete(lastUri);
          }
          lastUri = uri;
          toSync.push(uri);
          this.#data.set(uri, []);
        }
        if (!diagnostics2) {
          const currentDiagnostics = this.#data.get(uri);
          if (currentDiagnostics) {
            currentDiagnostics.length = 0;
          }
        } else {
          const currentDiagnostics = this.#data.get(uri);
          currentDiagnostics?.push(...coalesce(diagnostics2));
        }
      }
    }
    this.#onDidChangeDiagnostics.fire(toSync);
    if (!this.#proxy) {
      return;
    }
    const entries = [];
    let totalMarkerCount = 0;
    for (const uri of toSync) {
      let marker = [];
      const diagnostics2 = this.#data.get(uri);
      if (diagnostics2) {
        if (diagnostics2.length > this._maxDiagnosticsPerFile) {
          marker = [];
          const order = [DiagnosticSeverity.Error, DiagnosticSeverity.Warning, DiagnosticSeverity.Information, DiagnosticSeverity.Hint];
          orderLoop: for (let i = 0; i < 4; i++) {
            for (const diagnostic of diagnostics2) {
              if (diagnostic.severity === order[i]) {
                const len = marker.push({ ...converter.Diagnostic.from(diagnostic), modelVersionId: this._modelVersionIdProvider(uri) });
                if (len === this._maxDiagnosticsPerFile) {
                  break orderLoop;
                }
              }
            }
          }
          marker.push({
            severity: MarkerSeverity.Info,
            message: localize({ key: "limitHit", comment: ["amount of errors/warning skipped due to limits"] }, "Not showing {0} further errors and warnings.", diagnostics2.length - this._maxDiagnosticsPerFile),
            startLineNumber: marker[marker.length - 1].startLineNumber,
            startColumn: marker[marker.length - 1].startColumn,
            endLineNumber: marker[marker.length - 1].endLineNumber,
            endColumn: marker[marker.length - 1].endColumn
          });
        } else {
          marker = diagnostics2.map((diag) => ({ ...converter.Diagnostic.from(diag), modelVersionId: this._modelVersionIdProvider(uri) }));
        }
      }
      entries.push([uri, marker]);
      totalMarkerCount += marker.length;
      if (totalMarkerCount > this._maxDiagnosticsTotal) {
        break;
      }
    }
    this.#proxy.$changeMany(this._owner, entries);
  }
  delete(uri) {
    this._checkDisposed();
    this.#onDidChangeDiagnostics.fire([uri]);
    this.#data.delete(uri);
    this.#proxy?.$changeMany(this._owner, [[uri, void 0]]);
  }
  clear() {
    this._checkDisposed();
    this.#onDidChangeDiagnostics.fire([...this.#data.keys()]);
    this.#data.clear();
    this.#proxy?.$clear(this._owner);
  }
  forEach(callback, thisArg) {
    this._checkDisposed();
    for (const [uri, values] of this) {
      callback.call(thisArg, uri, values, this);
    }
  }
  *[Symbol.iterator]() {
    this._checkDisposed();
    for (const uri of this.#data.keys()) {
      yield [uri, this.get(uri)];
    }
  }
  get(uri) {
    this._checkDisposed();
    const result = this.#data.get(uri);
    if (Array.isArray(result)) {
      return Object.freeze(result.slice(0));
    }
    return [];
  }
  has(uri) {
    this._checkDisposed();
    return Array.isArray(this.#data.get(uri));
  }
  _checkDisposed() {
    if (this._isDisposed) {
      throw new Error("illegal state - object is disposed");
    }
  }
  static _compareIndexedTuplesByUri(a, b) {
    if (a[0].toString() < b[0].toString()) {
      return -1;
    } else if (a[0].toString() > b[0].toString()) {
      return 1;
    } else {
      return 0;
    }
  }
}
let ExtHostDiagnostics = class {
  constructor(mainContext, _logService, _fileSystemInfoService, _extHostDocumentsAndEditors) {
    this._logService = _logService;
    this._fileSystemInfoService = _fileSystemInfoService;
    this._extHostDocumentsAndEditors = _extHostDocumentsAndEditors;
    this._collections = /* @__PURE__ */ new Map();
    this._onDidChangeDiagnostics = new DebounceEmitter({ merge: (all) => all.flat(), delay: 50 });
    this.onDidChangeDiagnostics = Event.map(this._onDidChangeDiagnostics.event, ExtHostDiagnostics._mapper);
    this._proxy = mainContext.getProxy(MainContext.MainThreadDiagnostics);
  }
  static _mapper(last) {
    const map = new ResourceMap();
    for (const uri of last) {
      map.set(uri, uri);
    }
    return { uris: Object.freeze(Array.from(map.values())) };
  }
  createDiagnosticCollection(extensionId, name) {
    const { _collections, _proxy, _onDidChangeDiagnostics, _logService, _fileSystemInfoService, _extHostDocumentsAndEditors } = this;
    const loggingProxy = new class {
      $changeMany(owner2, entries) {
        _proxy.$changeMany(owner2, entries);
        _logService.trace("[DiagnosticCollection] change many (extension, owner, uris)", extensionId.value, owner2, entries.length === 0 ? "CLEARING" : entries);
      }
      $clear(owner2) {
        _proxy.$clear(owner2);
        _logService.trace("[DiagnosticCollection] remove all (extension, owner)", extensionId.value, owner2);
      }
      dispose() {
        _proxy.dispose();
      }
    }();
    let owner;
    if (!name) {
      name = "_generated_diagnostic_collection_name_#" + ExtHostDiagnostics._idPool++;
      owner = name;
    } else if (!_collections.has(name)) {
      owner = name;
    } else {
      this._logService.warn(`DiagnosticCollection with name '${name}' does already exist.`);
      do {
        owner = name + ExtHostDiagnostics._idPool++;
      } while (_collections.has(owner));
    }
    const result = new class extends DiagnosticCollection {
      constructor() {
        super(
          name,
          owner,
          ExtHostDiagnostics._maxDiagnosticsTotal,
          ExtHostDiagnostics._maxDiagnosticsPerFile,
          (uri) => _extHostDocumentsAndEditors.getDocument(uri)?.version,
          _fileSystemInfoService.extUri,
          loggingProxy,
          _onDidChangeDiagnostics
        );
        _collections.set(owner, this);
      }
      dispose() {
        super.dispose();
        _collections.delete(owner);
      }
    }();
    return result;
  }
  getDiagnostics(resource) {
    if (resource) {
      return this._getDiagnostics(resource);
    } else {
      const index = /* @__PURE__ */ new Map();
      const res = [];
      for (const collection of this._collections.values()) {
        collection.forEach((uri, diagnostics) => {
          let idx = index.get(uri.toString());
          if (typeof idx === "undefined") {
            idx = res.length;
            index.set(uri.toString(), idx);
            res.push([uri, []]);
          }
          res[idx][1] = res[idx][1].concat(diagnostics);
        });
      }
      return res;
    }
  }
  _getDiagnostics(resource) {
    let res = [];
    for (const collection of this._collections.values()) {
      if (collection.has(resource)) {
        res = res.concat(collection.get(resource));
      }
    }
    return res;
  }
  $acceptMarkersChange(data) {
    if (!this._mirrorCollection) {
      const name = "_generated_mirror";
      const collection = new DiagnosticCollection(
        name,
        name,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        // no limits because this collection is just a mirror of "sanitized" data
        (_uri) => void 0,
        this._fileSystemInfoService.extUri,
        void 0,
        this._onDidChangeDiagnostics
      );
      this._collections.set(name, collection);
      this._mirrorCollection = collection;
    }
    for (const [uri, markers] of data) {
      this._mirrorCollection.set(URI.revive(uri), markers.map(converter.Diagnostic.to));
    }
  }
};
ExtHostDiagnostics._idPool = 0;
ExtHostDiagnostics._maxDiagnosticsPerFile = 1e3;
ExtHostDiagnostics._maxDiagnosticsTotal = 1.1 * ExtHostDiagnostics._maxDiagnosticsPerFile;
ExtHostDiagnostics = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostFileSystemInfo)
], ExtHostDiagnostics);
export {
  DiagnosticCollection,
  ExtHostDiagnostics
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0RGlhZ25vc3RpY3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWREaWFnbm9zdGljc1NoYXBlLCBFeHRIb3N0RGlhZ25vc3RpY3NTaGFwZSwgSU1haW5Db250ZXh0IH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IERpYWdub3N0aWNTZXZlcml0eSB9IGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCAqIGFzIGNvbnZlcnRlciBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciwgRGVib3VuY2VFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvIH0gZnJvbSAnLi9leHRIb3N0RmlsZVN5c3RlbUluZm8uanMnO1xuaW1wb3J0IHsgSUV4dFVyaSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgRGlhZ25vc3RpY0NvbGxlY3Rpb24gaW1wbGVtZW50cyB2c2NvZGUuRGlhZ25vc3RpY0NvbGxlY3Rpb24ge1xuXG5cdHJlYWRvbmx5ICNwcm94eTogTWFpblRocmVhZERpYWdub3N0aWNzU2hhcGUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5ICNvbkRpZENoYW5nZURpYWdub3N0aWNzOiBFbWl0dGVyPHJlYWRvbmx5IHZzY29kZS5VcmlbXT47XG5cdHJlYWRvbmx5ICNkYXRhOiBSZXNvdXJjZU1hcDx2c2NvZGUuRGlhZ25vc3RpY1tdPjtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbmFtZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX293bmVyOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWF4RGlhZ25vc3RpY3NUb3RhbDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21heERpYWdub3N0aWNzUGVyRmlsZTogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsVmVyc2lvbklkUHJvdmlkZXI6ICh1cmk6IFVSSSkgPT4gbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRcdGV4dFVyaTogSUV4dFVyaSxcblx0XHRwcm94eTogTWFpblRocmVhZERpYWdub3N0aWNzU2hhcGUgfCB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VEaWFnbm9zdGljczogRW1pdHRlcjxyZWFkb25seSB2c2NvZGUuVXJpW10+XG5cdCkge1xuXHRcdHRoaXMuX21heERpYWdub3N0aWNzVG90YWwgPSBNYXRoLm1heChfbWF4RGlhZ25vc3RpY3NQZXJGaWxlLCBfbWF4RGlhZ25vc3RpY3NUb3RhbCk7XG5cdFx0dGhpcy4jZGF0YSA9IG5ldyBSZXNvdXJjZU1hcCh1cmkgPT4gZXh0VXJpLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cdFx0dGhpcy4jcHJveHkgPSBwcm94eTtcblx0XHR0aGlzLiNvbkRpZENoYW5nZURpYWdub3N0aWNzID0gb25EaWRDaGFuZ2VEaWFnbm9zdGljcztcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLiNvbkRpZENoYW5nZURpYWdub3N0aWNzLmZpcmUoWy4uLnRoaXMuI2RhdGEua2V5cygpXSk7XG5cdFx0XHR0aGlzLiNwcm94eT8uJGNsZWFyKHRoaXMuX293bmVyKTtcblx0XHRcdHRoaXMuI2RhdGEuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGdldCBuYW1lKCk6IHN0cmluZyB7XG5cdFx0dGhpcy5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdHJldHVybiB0aGlzLl9uYW1lO1xuXHR9XG5cblx0c2V0KHVyaTogdnNjb2RlLlVyaSwgZGlhZ25vc3RpY3M6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+KTogdm9pZDtcblx0c2V0KGVudHJpZXM6IFJlYWRvbmx5QXJyYXk8W3ZzY29kZS5VcmksIFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+XT4pOiB2b2lkO1xuXHRzZXQoZmlyc3Q6IHZzY29kZS5VcmkgfCBSZWFkb25seUFycmF5PFt2c2NvZGUuVXJpLCBSZWFkb25seUFycmF5PHZzY29kZS5EaWFnbm9zdGljPl0+LCBkaWFnbm9zdGljcz86IFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+KSB7XG5cblx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHQvLyB0aGlzIHNldC1jYWxsIGlzIGEgY2xlYXItY2FsbFxuXHRcdFx0dGhpcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHRoZSBhY3R1YWwgaW1wbGVtZW50YXRpb24gZm9yICNzZXRcblxuXHRcdHRoaXMuX2NoZWNrRGlzcG9zZWQoKTtcblx0XHRsZXQgdG9TeW5jOiB2c2NvZGUuVXJpW10gPSBbXTtcblxuXHRcdGlmIChVUkkuaXNVcmkoZmlyc3QpKSB7XG5cblx0XHRcdGlmICghZGlhZ25vc3RpY3MpIHtcblx0XHRcdFx0Ly8gcmVtb3ZlIHRoaXMgZW50cnlcblx0XHRcdFx0dGhpcy5kZWxldGUoZmlyc3QpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIHVwZGF0ZSBzaW5nbGUgcm93XG5cdFx0XHR0aGlzLiNkYXRhLnNldChmaXJzdCwgY29hbGVzY2UoZGlhZ25vc3RpY3MpKTtcblx0XHRcdHRvU3luYyA9IFtmaXJzdF07XG5cblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZmlyc3QpKSB7XG5cdFx0XHQvLyB1cGRhdGUgbWFueSByb3dzXG5cdFx0XHR0b1N5bmMgPSBbXTtcblx0XHRcdGxldCBsYXN0VXJpOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBlbnN1cmUgc3RhYmxlLXNvcnRcblx0XHRcdGZpcnN0ID0gWy4uLmZpcnN0XS5zb3J0KERpYWdub3N0aWNDb2xsZWN0aW9uLl9jb21wYXJlSW5kZXhlZFR1cGxlc0J5VXJpKTtcblxuXHRcdFx0Zm9yIChjb25zdCB0dXBsZSBvZiBmaXJzdCkge1xuXHRcdFx0XHRjb25zdCBbdXJpLCBkaWFnbm9zdGljc10gPSB0dXBsZTtcblx0XHRcdFx0aWYgKCFsYXN0VXJpIHx8IHVyaS50b1N0cmluZygpICE9PSBsYXN0VXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRpZiAobGFzdFVyaSAmJiB0aGlzLiNkYXRhLmdldChsYXN0VXJpKSEubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLiNkYXRhLmRlbGV0ZShsYXN0VXJpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGFzdFVyaSA9IHVyaTtcblx0XHRcdFx0XHR0b1N5bmMucHVzaCh1cmkpO1xuXHRcdFx0XHRcdHRoaXMuI2RhdGEuc2V0KHVyaSwgW10pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFkaWFnbm9zdGljcykge1xuXHRcdFx0XHRcdC8vIFtVcmksIHVuZGVmaW5lZF0gbWVhbnMgY2xlYXIgdGhpc1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnREaWFnbm9zdGljcyA9IHRoaXMuI2RhdGEuZ2V0KHVyaSk7XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnREaWFnbm9zdGljcykge1xuXHRcdFx0XHRcdFx0Y3VycmVudERpYWdub3N0aWNzLmxlbmd0aCA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJlbnREaWFnbm9zdGljcyA9IHRoaXMuI2RhdGEuZ2V0KHVyaSk7XG5cdFx0XHRcdFx0Y3VycmVudERpYWdub3N0aWNzPy5wdXNoKC4uLmNvYWxlc2NlKGRpYWdub3N0aWNzKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBzZW5kIGV2ZW50IGZvciBleHRlbnNpb25zXG5cdFx0dGhpcy4jb25EaWRDaGFuZ2VEaWFnbm9zdGljcy5maXJlKHRvU3luYyk7XG5cblx0XHQvLyBjb21wdXRlIGNoYW5nZSBhbmQgc2VuZCB0byBtYWluIHNpZGVcblx0XHRpZiAoIXRoaXMuI3Byb3h5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJpZXM6IFtVUkksIElNYXJrZXJEYXRhW11dW10gPSBbXTtcblx0XHRsZXQgdG90YWxNYXJrZXJDb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgdG9TeW5jKSB7XG5cdFx0XHRsZXQgbWFya2VyOiBJTWFya2VyRGF0YVtdID0gW107XG5cdFx0XHRjb25zdCBkaWFnbm9zdGljcyA9IHRoaXMuI2RhdGEuZ2V0KHVyaSk7XG5cdFx0XHRpZiAoZGlhZ25vc3RpY3MpIHtcblxuXHRcdFx0XHQvLyBubyBtb3JlIHRoYW4gTiBkaWFnbm9zdGljcyBwZXIgZmlsZVxuXHRcdFx0XHRpZiAoZGlhZ25vc3RpY3MubGVuZ3RoID4gdGhpcy5fbWF4RGlhZ25vc3RpY3NQZXJGaWxlKSB7XG5cdFx0XHRcdFx0bWFya2VyID0gW107XG5cdFx0XHRcdFx0Y29uc3Qgb3JkZXIgPSBbRGlhZ25vc3RpY1NldmVyaXR5LkVycm9yLCBEaWFnbm9zdGljU2V2ZXJpdHkuV2FybmluZywgRGlhZ25vc3RpY1NldmVyaXR5LkluZm9ybWF0aW9uLCBEaWFnbm9zdGljU2V2ZXJpdHkuSGludF07XG5cdFx0XHRcdFx0b3JkZXJMb29wOiBmb3IgKGxldCBpID0gMDsgaSA8IDQ7IGkrKykge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBkaWFnbm9zdGljIG9mIGRpYWdub3N0aWNzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChkaWFnbm9zdGljLnNldmVyaXR5ID09PSBvcmRlcltpXSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGxlbiA9IG1hcmtlci5wdXNoKHsgLi4uY29udmVydGVyLkRpYWdub3N0aWMuZnJvbShkaWFnbm9zdGljKSwgbW9kZWxWZXJzaW9uSWQ6IHRoaXMuX21vZGVsVmVyc2lvbklkUHJvdmlkZXIodXJpKSB9KTtcblx0XHRcdFx0XHRcdFx0XHRpZiAobGVuID09PSB0aGlzLl9tYXhEaWFnbm9zdGljc1BlckZpbGUpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGJyZWFrIG9yZGVyTG9vcDtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBhZGQgJ3NpZ25hbCcgbWFya2VyIGZvciBzaG93aW5nIG9taXR0ZWQgZXJyb3JzL3dhcm5pbmdzXG5cdFx0XHRcdFx0bWFya2VyLnB1c2goe1xuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSh7IGtleTogJ2xpbWl0SGl0JywgY29tbWVudDogWydhbW91bnQgb2YgZXJyb3JzL3dhcm5pbmcgc2tpcHBlZCBkdWUgdG8gbGltaXRzJ10gfSwgXCJOb3Qgc2hvd2luZyB7MH0gZnVydGhlciBlcnJvcnMgYW5kIHdhcm5pbmdzLlwiLCBkaWFnbm9zdGljcy5sZW5ndGggLSB0aGlzLl9tYXhEaWFnbm9zdGljc1BlckZpbGUpLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBtYXJrZXJbbWFya2VyLmxlbmd0aCAtIDFdLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBtYXJrZXJbbWFya2VyLmxlbmd0aCAtIDFdLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogbWFya2VyW21hcmtlci5sZW5ndGggLSAxXS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiBtYXJrZXJbbWFya2VyLmxlbmd0aCAtIDFdLmVuZENvbHVtblxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1hcmtlciA9IGRpYWdub3N0aWNzLm1hcChkaWFnID0+ICh7IC4uLmNvbnZlcnRlci5EaWFnbm9zdGljLmZyb20oZGlhZyksIG1vZGVsVmVyc2lvbklkOiB0aGlzLl9tb2RlbFZlcnNpb25JZFByb3ZpZGVyKHVyaSkgfSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGVudHJpZXMucHVzaChbdXJpLCBtYXJrZXJdKTtcblxuXHRcdFx0dG90YWxNYXJrZXJDb3VudCArPSBtYXJrZXIubGVuZ3RoO1xuXHRcdFx0aWYgKHRvdGFsTWFya2VyQ291bnQgPiB0aGlzLl9tYXhEaWFnbm9zdGljc1RvdGFsKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBtYXJrZXJzIHRoYXQgYXJlIGFib3ZlIHRoZSBsaW1pdFxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy4jcHJveHkuJGNoYW5nZU1hbnkodGhpcy5fb3duZXIsIGVudHJpZXMpO1xuXHR9XG5cblx0ZGVsZXRlKHVyaTogdnNjb2RlLlVyaSk6IHZvaWQge1xuXHRcdHRoaXMuX2NoZWNrRGlzcG9zZWQoKTtcblx0XHR0aGlzLiNvbkRpZENoYW5nZURpYWdub3N0aWNzLmZpcmUoW3VyaV0pO1xuXHRcdHRoaXMuI2RhdGEuZGVsZXRlKHVyaSk7XG5cdFx0dGhpcy4jcHJveHk/LiRjaGFuZ2VNYW55KHRoaXMuX293bmVyLCBbW3VyaSwgdW5kZWZpbmVkXV0pO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdHRoaXMuI29uRGlkQ2hhbmdlRGlhZ25vc3RpY3MuZmlyZShbLi4udGhpcy4jZGF0YS5rZXlzKCldKTtcblx0XHR0aGlzLiNkYXRhLmNsZWFyKCk7XG5cdFx0dGhpcy4jcHJveHk/LiRjbGVhcih0aGlzLl9vd25lcik7XG5cdH1cblxuXHRmb3JFYWNoKGNhbGxiYWNrOiAodXJpOiBVUkksIGRpYWdub3N0aWNzOiBSZWFkb25seUFycmF5PHZzY29kZS5EaWFnbm9zdGljPiwgY29sbGVjdGlvbjogRGlhZ25vc3RpY0NvbGxlY3Rpb24pID0+IHVua25vd24sIHRoaXNBcmc/OiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hlY2tEaXNwb3NlZCgpO1xuXHRcdGZvciAoY29uc3QgW3VyaSwgdmFsdWVzXSBvZiB0aGlzKSB7XG5cdFx0XHRjYWxsYmFjay5jYWxsKHRoaXNBcmcsIHVyaSwgdmFsdWVzLCB0aGlzKTtcblx0XHR9XG5cdH1cblxuXHQqW1N5bWJvbC5pdGVyYXRvcl0oKTogSXRlcmFibGVJdGVyYXRvcjxbdXJpOiB2c2NvZGUuVXJpLCBkaWFnbm9zdGljczogcmVhZG9ubHkgdnNjb2RlLkRpYWdub3N0aWNbXV0+IHtcblx0XHR0aGlzLl9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgdGhpcy4jZGF0YS5rZXlzKCkpIHtcblx0XHRcdHlpZWxkIFt1cmksIHRoaXMuZ2V0KHVyaSldO1xuXHRcdH1cblx0fVxuXG5cdGdldCh1cmk6IFVSSSk6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+IHtcblx0XHR0aGlzLl9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy4jZGF0YS5nZXQodXJpKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZShyZXN1bHQuc2xpY2UoMCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRoYXModXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHR0aGlzLl9jaGVja0Rpc3Bvc2VkKCk7XG5cdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkodGhpcy4jZGF0YS5nZXQodXJpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja0Rpc3Bvc2VkKCkge1xuXHRcdGlmICh0aGlzLl9pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2lsbGVnYWwgc3RhdGUgLSBvYmplY3QgaXMgZGlzcG9zZWQnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY29tcGFyZUluZGV4ZWRUdXBsZXNCeVVyaShhOiBbdnNjb2RlLlVyaSwgcmVhZG9ubHkgdnNjb2RlLkRpYWdub3N0aWNbXV0sIGI6IFt2c2NvZGUuVXJpLCByZWFkb25seSB2c2NvZGUuRGlhZ25vc3RpY1tdXSk6IG51bWJlciB7XG5cdFx0aWYgKGFbMF0udG9TdHJpbmcoKSA8IGJbMF0udG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSBpZiAoYVswXS50b1N0cmluZygpID4gYlswXS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0RGlhZ25vc3RpY3MgaW1wbGVtZW50cyBFeHRIb3N0RGlhZ25vc3RpY3NTaGFwZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2lkUG9vbDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX21heERpYWdub3N0aWNzUGVyRmlsZTogbnVtYmVyID0gMTAwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX21heERpYWdub3N0aWNzVG90YWw6IG51bWJlciA9IDEuMSAqIHRoaXMuX21heERpYWdub3N0aWNzUGVyRmlsZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZERpYWdub3N0aWNzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxlY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIERpYWdub3N0aWNDb2xsZWN0aW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZURpYWdub3N0aWNzID0gbmV3IERlYm91bmNlRW1pdHRlcjxyZWFkb25seSB2c2NvZGUuVXJpW10+KHsgbWVyZ2U6IGFsbCA9PiBhbGwuZmxhdCgpLCBkZWxheTogNTAgfSk7XG5cblx0c3RhdGljIF9tYXBwZXIobGFzdDogcmVhZG9ubHkgdnNjb2RlLlVyaVtdKTogeyB1cmlzOiByZWFkb25seSB2c2NvZGUuVXJpW10gfSB7XG5cdFx0Y29uc3QgbWFwID0gbmV3IFJlc291cmNlTWFwPHZzY29kZS5Vcmk+KCk7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgbGFzdCkge1xuXHRcdFx0bWFwLnNldCh1cmksIHVyaSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHVyaXM6IE9iamVjdC5mcmVlemUoQXJyYXkuZnJvbShtYXAudmFsdWVzKCkpKSB9O1xuXHR9XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaWFnbm9zdGljczogRXZlbnQ8dnNjb2RlLkRpYWdub3N0aWNDaGFuZ2VFdmVudD4gPSBFdmVudC5tYXAodGhpcy5fb25EaWRDaGFuZ2VEaWFnbm9zdGljcy5ldmVudCwgRXh0SG9zdERpYWdub3N0aWNzLl9tYXBwZXIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG1haW5Db250ZXh0OiBJTWFpbkNvbnRleHQsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdEZpbGVTeXN0ZW1JbmZvIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTeXN0ZW1JbmZvU2VydmljZTogSUV4dEhvc3RGaWxlU3lzdGVtSW5mbyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9yczogRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gbWFpbkNvbnRleHQuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZERpYWdub3N0aWNzKTtcblx0fVxuXG5cdGNyZWF0ZURpYWdub3N0aWNDb2xsZWN0aW9uKGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBuYW1lPzogc3RyaW5nKTogdnNjb2RlLkRpYWdub3N0aWNDb2xsZWN0aW9uIHtcblxuXHRcdGNvbnN0IHsgX2NvbGxlY3Rpb25zLCBfcHJveHksIF9vbkRpZENoYW5nZURpYWdub3N0aWNzLCBfbG9nU2VydmljZSwgX2ZpbGVTeXN0ZW1JbmZvU2VydmljZSwgX2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gPSB0aGlzO1xuXG5cdFx0Y29uc3QgbG9nZ2luZ1Byb3h5ID0gbmV3IGNsYXNzIGltcGxlbWVudHMgTWFpblRocmVhZERpYWdub3N0aWNzU2hhcGUge1xuXHRcdFx0JGNoYW5nZU1hbnkob3duZXI6IHN0cmluZywgZW50cmllczogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW10gfCB1bmRlZmluZWRdW10pOiB2b2lkIHtcblx0XHRcdFx0X3Byb3h5LiRjaGFuZ2VNYW55KG93bmVyLCBlbnRyaWVzKTtcblx0XHRcdFx0X2xvZ1NlcnZpY2UudHJhY2UoJ1tEaWFnbm9zdGljQ29sbGVjdGlvbl0gY2hhbmdlIG1hbnkgKGV4dGVuc2lvbiwgb3duZXIsIHVyaXMpJywgZXh0ZW5zaW9uSWQudmFsdWUsIG93bmVyLCBlbnRyaWVzLmxlbmd0aCA9PT0gMCA/ICdDTEVBUklORycgOiBlbnRyaWVzKTtcblx0XHRcdH1cblx0XHRcdCRjbGVhcihvd25lcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdF9wcm94eS4kY2xlYXIob3duZXIpO1xuXHRcdFx0XHRfbG9nU2VydmljZS50cmFjZSgnW0RpYWdub3N0aWNDb2xsZWN0aW9uXSByZW1vdmUgYWxsIChleHRlbnNpb24sIG93bmVyKScsIGV4dGVuc2lvbklkLnZhbHVlLCBvd25lcik7XG5cdFx0XHR9XG5cdFx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdFx0XHRfcHJveHkuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblxuXHRcdGxldCBvd25lcjogc3RyaW5nO1xuXHRcdGlmICghbmFtZSkge1xuXHRcdFx0bmFtZSA9ICdfZ2VuZXJhdGVkX2RpYWdub3N0aWNfY29sbGVjdGlvbl9uYW1lXyMnICsgRXh0SG9zdERpYWdub3N0aWNzLl9pZFBvb2wrKztcblx0XHRcdG93bmVyID0gbmFtZTtcblx0XHR9IGVsc2UgaWYgKCFfY29sbGVjdGlvbnMuaGFzKG5hbWUpKSB7XG5cdFx0XHRvd25lciA9IG5hbWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgRGlhZ25vc3RpY0NvbGxlY3Rpb24gd2l0aCBuYW1lICcke25hbWV9JyBkb2VzIGFscmVhZHkgZXhpc3QuYCk7XG5cdFx0XHRkbyB7XG5cdFx0XHRcdG93bmVyID0gbmFtZSArIEV4dEhvc3REaWFnbm9zdGljcy5faWRQb29sKys7XG5cdFx0XHR9IHdoaWxlIChfY29sbGVjdGlvbnMuaGFzKG93bmVyKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IGNsYXNzIGV4dGVuZHMgRGlhZ25vc3RpY0NvbGxlY3Rpb24ge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKFxuXHRcdFx0XHRcdG5hbWUhLCBvd25lcixcblx0XHRcdFx0XHRFeHRIb3N0RGlhZ25vc3RpY3MuX21heERpYWdub3N0aWNzVG90YWwsXG5cdFx0XHRcdFx0RXh0SG9zdERpYWdub3N0aWNzLl9tYXhEaWFnbm9zdGljc1BlckZpbGUsXG5cdFx0XHRcdFx0dXJpID0+IF9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5nZXREb2N1bWVudCh1cmkpPy52ZXJzaW9uLFxuXHRcdFx0XHRcdF9maWxlU3lzdGVtSW5mb1NlcnZpY2UuZXh0VXJpLCBsb2dnaW5nUHJveHksIF9vbkRpZENoYW5nZURpYWdub3N0aWNzXG5cdFx0XHRcdCk7XG5cdFx0XHRcdF9jb2xsZWN0aW9ucy5zZXQob3duZXIsIHRoaXMpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRcdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRfY29sbGVjdGlvbnMuZGVsZXRlKG93bmVyKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldERpYWdub3N0aWNzKHJlc291cmNlOiB2c2NvZGUuVXJpKTogUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz47XG5cdGdldERpYWdub3N0aWNzKCk6IFJlYWRvbmx5QXJyYXk8W3ZzY29kZS5VcmksIFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+XT47XG5cdGdldERpYWdub3N0aWNzKHJlc291cmNlPzogdnNjb2RlLlVyaSk6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+IHwgUmVhZG9ubHlBcnJheTxbdnNjb2RlLlVyaSwgUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz5dPjtcblx0Z2V0RGlhZ25vc3RpY3MocmVzb3VyY2U/OiB2c2NvZGUuVXJpKTogUmVhZG9ubHlBcnJheTx2c2NvZGUuRGlhZ25vc3RpYz4gfCBSZWFkb25seUFycmF5PFt2c2NvZGUuVXJpLCBSZWFkb25seUFycmF5PHZzY29kZS5EaWFnbm9zdGljPl0+IHtcblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXREaWFnbm9zdGljcyhyZXNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRcdGNvbnN0IHJlczogW3ZzY29kZS5VcmksIHZzY29kZS5EaWFnbm9zdGljW11dW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgY29sbGVjdGlvbiBvZiB0aGlzLl9jb2xsZWN0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0XHRjb2xsZWN0aW9uLmZvckVhY2goKHVyaSwgZGlhZ25vc3RpY3MpID0+IHtcblx0XHRcdFx0XHRsZXQgaWR4ID0gaW5kZXguZ2V0KHVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGlkeCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0XHRcdGlkeCA9IHJlcy5sZW5ndGg7XG5cdFx0XHRcdFx0XHRpbmRleC5zZXQodXJpLnRvU3RyaW5nKCksIGlkeCk7XG5cdFx0XHRcdFx0XHRyZXMucHVzaChbdXJpLCBbXV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXNbaWR4XVsxXSA9IHJlc1tpZHhdWzFdLmNvbmNhdChkaWFnbm9zdGljcyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXREaWFnbm9zdGljcyhyZXNvdXJjZTogdnNjb2RlLlVyaSk6IFJlYWRvbmx5QXJyYXk8dnNjb2RlLkRpYWdub3N0aWM+IHtcblx0XHRsZXQgcmVzOiB2c2NvZGUuRGlhZ25vc3RpY1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBjb2xsZWN0aW9uIG9mIHRoaXMuX2NvbGxlY3Rpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoY29sbGVjdGlvbi5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJlcyA9IHJlcy5jb25jYXQoY29sbGVjdGlvbi5nZXQocmVzb3VyY2UpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlcztcblx0fVxuXG5cdHByaXZhdGUgX21pcnJvckNvbGxlY3Rpb246IHZzY29kZS5EaWFnbm9zdGljQ29sbGVjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHQkYWNjZXB0TWFya2Vyc0NoYW5nZShkYXRhOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXV1bXSk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLl9taXJyb3JDb2xsZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBuYW1lID0gJ19nZW5lcmF0ZWRfbWlycm9yJztcblx0XHRcdGNvbnN0IGNvbGxlY3Rpb24gPSBuZXcgRGlhZ25vc3RpY0NvbGxlY3Rpb24oXG5cdFx0XHRcdG5hbWUsIG5hbWUsXG5cdFx0XHRcdE51bWJlci5NQVhfU0FGRV9JTlRFR0VSLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgLy8gbm8gbGltaXRzIGJlY2F1c2UgdGhpcyBjb2xsZWN0aW9uIGlzIGp1c3QgYSBtaXJyb3Igb2YgXCJzYW5pdGl6ZWRcIiBkYXRhXG5cdFx0XHRcdF91cmkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHR0aGlzLl9maWxlU3lzdGVtSW5mb1NlcnZpY2UuZXh0VXJpLCB1bmRlZmluZWQsIHRoaXMuX29uRGlkQ2hhbmdlRGlhZ25vc3RpY3Ncblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9jb2xsZWN0aW9ucy5zZXQobmFtZSwgY29sbGVjdGlvbik7XG5cdFx0XHR0aGlzLl9taXJyb3JDb2xsZWN0aW9uID0gY29sbGVjdGlvbjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFt1cmksIG1hcmtlcnNdIG9mIGRhdGEpIHtcblx0XHRcdHRoaXMuX21pcnJvckNvbGxlY3Rpb24uc2V0KFVSSS5yZXZpdmUodXJpKSwgbWFya2Vycy5tYXAoY29udmVydGVyLkRpYWdub3N0aWMudG8pKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsV0FBMEI7QUFFbkMsU0FBUyxtQkFBc0Y7QUFDL0YsU0FBUywwQkFBMEI7QUFDbkMsWUFBWSxlQUFlO0FBQzNCLFNBQVMsT0FBZ0IsdUJBQXVCO0FBQ2hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsOEJBQThCO0FBSWhDLE1BQU0scUJBQTREO0FBQUEsRUFReEUsWUFDa0IsT0FDQSxRQUNBLHNCQUNBLHdCQUNBLHlCQUNqQixRQUNBLE9BQ0Esd0JBQ0M7QUFSZ0I7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQVBsQixTQUFRLGNBQWM7QUFZckIsU0FBSyx1QkFBdUIsS0FBSyxJQUFJLHdC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
