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
import { binarySearch2, equals } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../base/common/linkedList.js";
import { compare } from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { Range } from "../../../common/core/range.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isEqual } from "../../../../base/common/resources.js";
class MarkerCoordinate {
  constructor(marker, index, total) {
    this.marker = marker;
    this.index = index;
    this.total = total;
  }
}
let MarkerList = class {
  constructor(resourceFilter, _markerService, _configService) {
    this._markerService = _markerService;
    this._configService = _configService;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._dispoables = new DisposableStore();
    this._markers = [];
    this._nextIdx = -1;
    if (URI.isUri(resourceFilter)) {
      this._resourceFilter = (uri) => uri.toString() === resourceFilter.toString();
    } else if (resourceFilter) {
      this._resourceFilter = resourceFilter;
    }
    const compareOrder = this._configService.getValue("problems.sortOrder");
    const compareMarker = (a, b) => {
      let res = compare(a.resource.toString(), b.resource.toString());
      if (res === 0) {
        if (compareOrder === "position") {
          res = Range.compareRangesUsingStarts(a, b) || MarkerSeverity.compare(a.severity, b.severity);
        } else {
          res = MarkerSeverity.compare(a.severity, b.severity) || Range.compareRangesUsingStarts(a, b);
        }
      }
      return res;
    };
    const updateMarker = () => {
      let newMarkers = this._markerService.read({
        resource: URI.isUri(resourceFilter) ? resourceFilter : void 0,
        severities: MarkerSeverity.Error | MarkerSeverity.Warning | MarkerSeverity.Info
      });
      if (typeof resourceFilter === "function") {
        newMarkers = newMarkers.filter((m) => this._resourceFilter(m.resource));
      }
      newMarkers.sort(compareMarker);
      if (equals(
        newMarkers,
        this._markers,
        (a, b) => a.resource.toString() === b.resource.toString() && a.startLineNumber === b.startLineNumber && a.startColumn === b.startColumn && a.endLineNumber === b.endLineNumber && a.endColumn === b.endColumn && a.severity === b.severity && a.message === b.message
      )) {
        return false;
      }
      this._markers = newMarkers;
      return true;
    };
    updateMarker();
    this._dispoables.add(_markerService.onMarkerChanged((uris) => {
      if (!this._resourceFilter || uris.some((uri) => this._resourceFilter(uri))) {
        if (updateMarker()) {
          this._nextIdx = -1;
          this._onDidChange.fire();
        }
      }
    }));
  }
  dispose() {
    this._dispoables.dispose();
    this._onDidChange.dispose();
  }
  matches(uri) {
    if (!this._resourceFilter && !uri) {
      return true;
    }
    if (!this._resourceFilter || !uri) {
      return false;
    }
    return this._resourceFilter(uri);
  }
  get selected() {
    const marker = this._markers[this._nextIdx];
    return marker && new MarkerCoordinate(marker, this._nextIdx + 1, this._markers.length);
  }
  _initIdx(model, position, fwd) {
    let idx = this._markers.findIndex((marker) => isEqual(marker.resource, model.uri));
    if (idx < 0) {
      idx = binarySearch2(this._markers.length, (idx2) => compare(this._markers[idx2].resource.toString(), model.uri.toString()));
      if (idx < 0) {
        idx = ~idx;
      }
      if (fwd) {
        this._nextIdx = idx;
      } else {
        this._nextIdx = (this._markers.length + idx - 1) % this._markers.length;
      }
    } else {
      let found = false;
      let wentPast = false;
      for (let i = idx; i < this._markers.length; i++) {
        let range = Range.lift(this._markers[i]);
        if (range.isEmpty()) {
          const word = model.getWordAtPosition(range.getStartPosition());
          if (word) {
            range = new Range(range.startLineNumber, word.startColumn, range.startLineNumber, word.endColumn);
          }
        }
        if (position && (range.containsPosition(position) || position.isBeforeOrEqual(range.getStartPosition()))) {
          this._nextIdx = i;
          found = true;
          wentPast = !range.containsPosition(position);
          break;
        }
        if (this._markers[i].resource.toString() !== model.uri.toString()) {
          break;
        }
      }
      if (!found) {
        this._nextIdx = fwd ? 0 : this._markers.length - 1;
      } else if (wentPast && !fwd) {
        this._nextIdx -= 1;
      }
    }
    if (this._nextIdx < 0) {
      this._nextIdx = this._markers.length - 1;
    }
  }
  resetIndex() {
    this._nextIdx = -1;
  }
  move(fwd, model, position) {
    if (this._markers.length === 0) {
      return false;
    }
    const oldIdx = this._nextIdx;
    if (this._nextIdx === -1) {
      this._initIdx(model, position, fwd);
    } else if (fwd) {
      this._nextIdx = (this._nextIdx + 1) % this._markers.length;
    } else if (!fwd) {
      this._nextIdx = (this._nextIdx - 1 + this._markers.length) % this._markers.length;
    }
    if (oldIdx !== this._nextIdx) {
      return true;
    }
    return false;
  }
  find(uri, position) {
    let idx = this._markers.findIndex((marker) => marker.resource.toString() === uri.toString());
    if (idx < 0) {
      return void 0;
    }
    for (; idx < this._markers.length; idx++) {
      if (Range.containsPosition(this._markers[idx], position)) {
        return new MarkerCoordinate(this._markers[idx], idx + 1, this._markers.length);
      }
    }
    return void 0;
  }
};
MarkerList = __decorateClass([
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IConfigurationService)
], MarkerList);
const IMarkerNavigationService = createDecorator("IMarkerNavigationService");
let MarkerNavigationService = class {
  constructor(_markerService, _configService) {
    this._markerService = _markerService;
    this._configService = _configService;
    this._provider = new LinkedList();
  }
  registerProvider(provider) {
    const remove = this._provider.unshift(provider);
    return toDisposable(() => remove());
  }
  getMarkerList(resource) {
    for (const provider of this._provider) {
      const result = provider.getMarkerList(resource);
      if (result) {
        return result;
      }
    }
    return new MarkerList(resource, this._markerService, this._configService);
  }
};
MarkerNavigationService = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, IConfigurationService)
], MarkerNavigationService);
registerSingleton(IMarkerNavigationService, MarkerNavigationService, InstantiationType.Delayed);
export {
  IMarkerNavigationService,
  MarkerCoordinate,
  MarkerList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGdvdG9FcnJvclxcYnJvd3NlclxcbWFya2VyTmF2aWdhdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBiaW5hcnlTZWFyY2gyLCBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlua2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpbmtlZExpc3QuanMnO1xuaW1wb3J0IHsgY29tcGFyZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2VyLCBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNYXJrZXJDb29yZGluYXRlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbWFya2VyOiBJTWFya2VyLFxuXHRcdHJlYWRvbmx5IGluZGV4OiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgdG90YWw6IG51bWJlclxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgTWFya2VyTGlzdCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZUZpbHRlcj86ICh1cmk6IFVSSSkgPT4gYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9hYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIF9tYXJrZXJzOiBJTWFya2VyW10gPSBbXTtcblx0cHJpdmF0ZSBfbmV4dElkeDogbnVtYmVyID0gLTE7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVzb3VyY2VGaWx0ZXI6IFVSSSB8ICgodXJpOiBVUkkpID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZUZpbHRlcikpIHtcblx0XHRcdHRoaXMuX3Jlc291cmNlRmlsdGVyID0gdXJpID0+IHVyaS50b1N0cmluZygpID09PSByZXNvdXJjZUZpbHRlci50b1N0cmluZygpO1xuXHRcdH0gZWxzZSBpZiAocmVzb3VyY2VGaWx0ZXIpIHtcblx0XHRcdHRoaXMuX3Jlc291cmNlRmlsdGVyID0gcmVzb3VyY2VGaWx0ZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tcGFyZU9yZGVyID0gdGhpcy5fY29uZmlnU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdwcm9ibGVtcy5zb3J0T3JkZXInKTtcblx0XHRjb25zdCBjb21wYXJlTWFya2VyID0gKGE6IElNYXJrZXIsIGI6IElNYXJrZXIpOiBudW1iZXIgPT4ge1xuXHRcdFx0bGV0IHJlcyA9IGNvbXBhcmUoYS5yZXNvdXJjZS50b1N0cmluZygpLCBiLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKHJlcyA9PT0gMCkge1xuXHRcdFx0XHRpZiAoY29tcGFyZU9yZGVyID09PSAncG9zaXRpb24nKSB7XG5cdFx0XHRcdFx0cmVzID0gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEsIGIpIHx8IE1hcmtlclNldmVyaXR5LmNvbXBhcmUoYS5zZXZlcml0eSwgYi5zZXZlcml0eSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzID0gTWFya2VyU2V2ZXJpdHkuY29tcGFyZShhLnNldmVyaXR5LCBiLnNldmVyaXR5KSB8fCBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYSwgYik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXM7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHVwZGF0ZU1hcmtlciA9ICgpID0+IHtcblx0XHRcdGxldCBuZXdNYXJrZXJzID0gdGhpcy5fbWFya2VyU2VydmljZS5yZWFkKHtcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5pc1VyaShyZXNvdXJjZUZpbHRlcikgPyByZXNvdXJjZUZpbHRlciA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nIHwgTWFya2VyU2V2ZXJpdHkuSW5mb1xuXHRcdFx0fSk7XG5cdFx0XHRpZiAodHlwZW9mIHJlc291cmNlRmlsdGVyID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRcdG5ld01hcmtlcnMgPSBuZXdNYXJrZXJzLmZpbHRlcihtID0+IHRoaXMuX3Jlc291cmNlRmlsdGVyIShtLnJlc291cmNlKSk7XG5cdFx0XHR9XG5cdFx0XHRuZXdNYXJrZXJzLnNvcnQoY29tcGFyZU1hcmtlcik7XG5cblx0XHRcdGlmIChlcXVhbHMobmV3TWFya2VycywgdGhpcy5fbWFya2VycywgKGEsIGIpID0+XG5cdFx0XHRcdGEucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gYi5yZXNvdXJjZS50b1N0cmluZygpXG5cdFx0XHRcdCYmIGEuc3RhcnRMaW5lTnVtYmVyID09PSBiLnN0YXJ0TGluZU51bWJlclxuXHRcdFx0XHQmJiBhLnN0YXJ0Q29sdW1uID09PSBiLnN0YXJ0Q29sdW1uXG5cdFx0XHRcdCYmIGEuZW5kTGluZU51bWJlciA9PT0gYi5lbmRMaW5lTnVtYmVyXG5cdFx0XHRcdCYmIGEuZW5kQ29sdW1uID09PSBiLmVuZENvbHVtblxuXHRcdFx0XHQmJiBhLnNldmVyaXR5ID09PSBiLnNldmVyaXR5XG5cdFx0XHRcdCYmIGEubWVzc2FnZSA9PT0gYi5tZXNzYWdlXG5cdFx0XHQpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbWFya2VycyA9IG5ld01hcmtlcnM7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9O1xuXG5cdFx0dXBkYXRlTWFya2VyKCk7XG5cblx0XHR0aGlzLl9kaXNwb2FibGVzLmFkZChfbWFya2VyU2VydmljZS5vbk1hcmtlckNoYW5nZWQodXJpcyA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX3Jlc291cmNlRmlsdGVyIHx8IHVyaXMuc29tZSh1cmkgPT4gdGhpcy5fcmVzb3VyY2VGaWx0ZXIhKHVyaSkpKSB7XG5cdFx0XHRcdGlmICh1cGRhdGVNYXJrZXIoKSkge1xuXHRcdFx0XHRcdHRoaXMuX25leHRJZHggPSAtMTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3BvYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdG1hdGNoZXModXJpOiBVUkkgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIXRoaXMuX3Jlc291cmNlRmlsdGVyICYmICF1cmkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Jlc291cmNlRmlsdGVyIHx8ICF1cmkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc291cmNlRmlsdGVyKHVyaSk7XG5cdH1cblxuXHRnZXQgc2VsZWN0ZWQoKTogTWFya2VyQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWFya2VyID0gdGhpcy5fbWFya2Vyc1t0aGlzLl9uZXh0SWR4XTtcblx0XHRyZXR1cm4gbWFya2VyICYmIG5ldyBNYXJrZXJDb29yZGluYXRlKG1hcmtlciwgdGhpcy5fbmV4dElkeCArIDEsIHRoaXMuX21hcmtlcnMubGVuZ3RoKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRJZHgobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgZndkOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHRsZXQgaWR4ID0gdGhpcy5fbWFya2Vycy5maW5kSW5kZXgobWFya2VyID0+IGlzRXF1YWwobWFya2VyLnJlc291cmNlLCBtb2RlbC51cmkpKTtcblx0XHRpZiAoaWR4IDwgMCkge1xuXHRcdFx0Ly8gaWdub3JlIG1vZGVsLCBwb3NpdGlvbiBiZWNhdXNlIHRoaXMgd2lsbCBiZSBhIGRpZmZlcmVudCBmaWxlXG5cdFx0XHRpZHggPSBiaW5hcnlTZWFyY2gyKHRoaXMuX21hcmtlcnMubGVuZ3RoLCBpZHggPT4gY29tcGFyZSh0aGlzLl9tYXJrZXJzW2lkeF0ucmVzb3VyY2UudG9TdHJpbmcoKSwgbW9kZWwudXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRcdGlkeCA9IH5pZHg7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZndkKSB7XG5cdFx0XHRcdHRoaXMuX25leHRJZHggPSBpZHg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9uZXh0SWR4ID0gKHRoaXMuX21hcmtlcnMubGVuZ3RoICsgaWR4IC0gMSkgJSB0aGlzLl9tYXJrZXJzLmxlbmd0aDtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZmluZCBtYXJrZXIgZm9yIGZpbGVcblx0XHRcdGxldCBmb3VuZCA9IGZhbHNlO1xuXHRcdFx0bGV0IHdlbnRQYXN0ID0gZmFsc2U7XG5cdFx0XHRmb3IgKGxldCBpID0gaWR4OyBpIDwgdGhpcy5fbWFya2Vycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRsZXQgcmFuZ2UgPSBSYW5nZS5saWZ0KHRoaXMuX21hcmtlcnNbaV0pO1xuXG5cdFx0XHRcdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRjb25zdCB3b3JkID0gbW9kZWwuZ2V0V29yZEF0UG9zaXRpb24ocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRcdFx0XHRpZiAod29yZCkge1xuXHRcdFx0XHRcdFx0cmFuZ2UgPSBuZXcgUmFuZ2UocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB3b3JkLnN0YXJ0Q29sdW1uLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIHdvcmQuZW5kQ29sdW1uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocG9zaXRpb24gJiYgKHJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pIHx8IHBvc2l0aW9uLmlzQmVmb3JlT3JFcXVhbChyYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpKSkge1xuXHRcdFx0XHRcdHRoaXMuX25leHRJZHggPSBpO1xuXHRcdFx0XHRcdGZvdW5kID0gdHJ1ZTtcblx0XHRcdFx0XHR3ZW50UGFzdCA9ICFyYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLl9tYXJrZXJzW2ldLnJlc291cmNlLnRvU3RyaW5nKCkgIT09IG1vZGVsLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFmb3VuZCkge1xuXHRcdFx0XHQvLyBhZnRlciB0aGUgbGFzdCBjaGFuZ2Vcblx0XHRcdFx0dGhpcy5fbmV4dElkeCA9IGZ3ZCA/IDAgOiB0aGlzLl9tYXJrZXJzLmxlbmd0aCAtIDE7XG5cdFx0XHR9IGVsc2UgaWYgKHdlbnRQYXN0ICYmICFmd2QpIHtcblx0XHRcdFx0Ly8gd2Ugd2VudCBwYXN0IGFuZCBoYXZlIHRvIGdvIG9uZSBiYWNrXG5cdFx0XHRcdHRoaXMuX25leHRJZHggLT0gMTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbmV4dElkeCA8IDApIHtcblx0XHRcdHRoaXMuX25leHRJZHggPSB0aGlzLl9tYXJrZXJzLmxlbmd0aCAtIDE7XG5cdFx0fVxuXHR9XG5cblx0cmVzZXRJbmRleCgpIHtcblx0XHR0aGlzLl9uZXh0SWR4ID0gLTE7XG5cdH1cblxuXHRtb3ZlKGZ3ZDogYm9vbGVhbiwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9tYXJrZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZElkeCA9IHRoaXMuX25leHRJZHg7XG5cdFx0aWYgKHRoaXMuX25leHRJZHggPT09IC0xKSB7XG5cdFx0XHR0aGlzLl9pbml0SWR4KG1vZGVsLCBwb3NpdGlvbiwgZndkKTtcblx0XHR9IGVsc2UgaWYgKGZ3ZCkge1xuXHRcdFx0dGhpcy5fbmV4dElkeCA9ICh0aGlzLl9uZXh0SWR4ICsgMSkgJSB0aGlzLl9tYXJrZXJzLmxlbmd0aDtcblx0XHR9IGVsc2UgaWYgKCFmd2QpIHtcblx0XHRcdHRoaXMuX25leHRJZHggPSAodGhpcy5fbmV4dElkeCAtIDEgKyB0aGlzLl9tYXJrZXJzLmxlbmd0aCkgJSB0aGlzLl9tYXJrZXJzLmxlbmd0aDtcblx0XHR9XG5cblx0XHRpZiAob2xkSWR4ICE9PSB0aGlzLl9uZXh0SWR4KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0ZmluZCh1cmk6IFVSSSwgcG9zaXRpb246IFBvc2l0aW9uKTogTWFya2VyQ29vcmRpbmF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGlkeCA9IHRoaXMuX21hcmtlcnMuZmluZEluZGV4KG1hcmtlciA9PiBtYXJrZXIucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChpZHggPCAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKDsgaWR4IDwgdGhpcy5fbWFya2Vycy5sZW5ndGg7IGlkeCsrKSB7XG5cdFx0XHRpZiAoUmFuZ2UuY29udGFpbnNQb3NpdGlvbih0aGlzLl9tYXJrZXJzW2lkeF0sIHBvc2l0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtlckNvb3JkaW5hdGUodGhpcy5fbWFya2Vyc1tpZHhdLCBpZHggKyAxLCB0aGlzLl9tYXJrZXJzLmxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IElNYXJrZXJOYXZpZ2F0aW9uU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJTWFya2VyTmF2aWdhdGlvblNlcnZpY2U+KCdJTWFya2VyTmF2aWdhdGlvblNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJTWFya2VyTmF2aWdhdGlvblNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXI6IElNYXJrZXJMaXN0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZTtcblx0Z2V0TWFya2VyTGlzdChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogTWFya2VyTGlzdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWFya2VyTGlzdFByb3ZpZGVyIHtcblx0Z2V0TWFya2VyTGlzdChyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogTWFya2VyTGlzdCB8IHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgTWFya2VyTmF2aWdhdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJTWFya2VyTmF2aWdhdGlvblNlcnZpY2UsIElNYXJrZXJMaXN0UHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlciA9IG5ldyBMaW5rZWRMaXN0PElNYXJrZXJMaXN0UHJvdmlkZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXI6IElNYXJrZXJMaXN0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVtb3ZlID0gdGhpcy5fcHJvdmlkZXIudW5zaGlmdChwcm92aWRlcik7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiByZW1vdmUoKSk7XG5cdH1cblxuXHRnZXRNYXJrZXJMaXN0KHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBNYXJrZXJMaXN0IHtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMuX3Byb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwcm92aWRlci5nZXRNYXJrZXJMaXN0KHJlc291cmNlKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gZGVmYXVsdFxuXHRcdHJldHVybiBuZXcgTWFya2VyTGlzdChyZXNvdXJjZSwgdGhpcy5fbWFya2VyU2VydmljZSwgdGhpcy5fY29uZmlnU2VydmljZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSU1hcmtlck5hdmlnYXRpb25TZXJ2aWNlLCBNYXJrZXJOYXZpZ2F0aW9uU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZSxjQUFjO0FBQ3RDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxpQkFBOEIsb0JBQW9CO0FBQzNELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFFcEIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFrQixnQkFBZ0Isc0JBQXNCO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtBQUVqQixNQUFNLGlCQUFpQjtBQUFBLEVBQzdCLFlBQ1UsUUFDQSxPQUNBLE9BQ1I7QUFIUTtBQUNBO0FBQ0E7QUFBQSxFQUNOO0FBQ0w7QUFFTyxJQUFNLGFBQU4sTUFBaUI7QUFBQSxFQVd2QixZQUNDLGdCQUNpQyxnQkFDTyxnQkFDdkM7QUFGZ0M7QUFDTztBQVp6QyxTQUFpQixlQUFlLElBQUksUUFBYztBQUNsRCxTQUFTLGNBQTJCLEtBQUssYUFBYTtBQUd0RCxTQUFpQixjQUFjLElBQUksZ0JBQWdCO0FBRW5ELFNBQVEsV0FBc0IsQ0FBQztBQUMvQixTQUFRLFdBQW1CO0FBTzFCLFFBQUksSUFBSSxNQUFNLGNBQWMsR0FBRztBQUM5QixXQUFLLGtCQUFrQixTQUFPLElBQUksU0FBUyxNQUFNLGVBQWUsU0FBUztBQUFBLElBQzFFLFdBQVcsZ0JBQWdCO0FBQzFCLFdBQUssa0JBQWtCO0FBQUEsSUFDeEI7QUFFQSxVQUFNLGVBQWUsS0FBSyxlQUFlLFNBQWlCLG9CQUFvQjtBQUM5RSxVQUFNLGdCQUFnQixDQUFDLEdBQVksTUFB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
