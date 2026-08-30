import { URI } from "../../../../base/common/uri.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { DisposableStore, Disposable } from "../../../../base/common/lifecycle.js";
import { createLineMatcher, ApplyToKind, getResource } from "./problemMatcher.js";
import { IMarkerData } from "../../../../platform/markers/common/markers.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isWindows } from "../../../../base/common/platform.js";
var ProblemCollectorEventKind = /* @__PURE__ */ ((ProblemCollectorEventKind2) => {
  ProblemCollectorEventKind2["BackgroundProcessingBegins"] = "backgroundProcessingBegins";
  ProblemCollectorEventKind2["BackgroundProcessingEnds"] = "backgroundProcessingEnds";
  return ProblemCollectorEventKind2;
})(ProblemCollectorEventKind || {});
var IProblemCollectorEvent;
((IProblemCollectorEvent2) => {
  function create(kind, capturedVariables) {
    return Object.freeze({ kind, capturedVariables });
  }
  IProblemCollectorEvent2.create = create;
})(IProblemCollectorEvent || (IProblemCollectorEvent = {}));
class AbstractProblemCollector extends Disposable {
  constructor(problemMatchers, markerService, modelService, fileService, logService) {
    super();
    this.problemMatchers = problemMatchers;
    this.markerService = markerService;
    this.modelService = modelService;
    this.logService = logService;
    this.modelListeners = new DisposableStore();
    this._onDidFindFirstMatch = this._register(new Emitter());
    this.onDidFindFirstMatch = this._onDidFindFirstMatch.event;
    this._onDidFindErrors = this._register(new Emitter());
    this.onDidFindErrors = this._onDidFindErrors.event;
    this._onDidRequestInvalidateLastMarker = this._register(new Emitter());
    this.onDidRequestInvalidateLastMarker = this._onDidRequestInvalidateLastMarker.event;
    this.matchers = /* @__PURE__ */ Object.create(null);
    this.bufferLength = 1;
    problemMatchers.map((elem) => createLineMatcher(elem, fileService, logService)).forEach((matcher) => {
      const length = matcher.matchLength;
      if (length > this.bufferLength) {
        this.bufferLength = length;
      }
      let value = this.matchers[length];
      if (!value) {
        value = [];
        this.matchers[length] = value;
      }
      value.push(matcher);
    });
    this.buffer = [];
    this.activeMatcher = null;
    this._numberOfMatches = 0;
    this._maxMarkerSeverity = void 0;
    this.openModels = /* @__PURE__ */ Object.create(null);
    this.applyToByOwner = /* @__PURE__ */ new Map();
    for (const problemMatcher of problemMatchers) {
      const current = this.applyToByOwner.get(problemMatcher.owner);
      if (current === void 0) {
        this.applyToByOwner.set(problemMatcher.owner, problemMatcher.applyTo);
      } else {
        this.applyToByOwner.set(problemMatcher.owner, this.mergeApplyTo(current, problemMatcher.applyTo));
      }
    }
    this.resourcesToClean = /* @__PURE__ */ new Map();
    this.markers = /* @__PURE__ */ new Map();
    this.deliveredMarkers = /* @__PURE__ */ new Map();
    this._register(this.modelService.onModelAdded((model) => {
      this.openModels[model.uri.toString()] = true;
    }, this, this.modelListeners));
    this._register(this.modelService.onModelRemoved((model) => {
      delete this.openModels[model.uri.toString()];
    }, this, this.modelListeners));
    this.modelService.getModels().forEach((model) => this.openModels[model.uri.toString()] = true);
    this._onDidStateChange = this._register(new Emitter());
  }
  get onDidStateChange() {
    return this._onDidStateChange.event;
  }
  processLine(line) {
    if (this.tail) {
      const oldTail = this.tail;
      this.tail = oldTail.then(() => {
        return this.processLineInternal(line);
      });
    } else {
      this.tail = this.processLineInternal(line);
    }
  }
  dispose() {
    super.dispose();
    this.modelListeners.dispose();
  }
  get numberOfMatches() {
    return this._numberOfMatches;
  }
  get maxMarkerSeverity() {
    return this._maxMarkerSeverity;
  }
  tryFindMarker(line) {
    let result = null;
    if (this.activeMatcher) {
      result = this.activeMatcher.next(line);
      if (result) {
        this.captureMatch(result);
        return result;
      }
      this.clearBuffer();
      this.activeMatcher = null;
    }
    if (this.buffer.length < this.bufferLength) {
      this.buffer.push(line);
    } else {
      const end = this.buffer.length - 1;
      for (let i = 0; i < end; i++) {
        this.buffer[i] = this.buffer[i + 1];
      }
      this.buffer[end] = line;
    }
    result = this.tryMatchers();
    if (result) {
      this.clearBuffer();
    }
    return result;
  }
  async shouldApplyMatch(result) {
    switch (result.description.applyTo) {
      case ApplyToKind.allDocuments:
        return true;
      case ApplyToKind.openDocuments:
        return !!this.openModels[(await result.resource).toString()];
      case ApplyToKind.closedDocuments:
        return !this.openModels[(await result.resource).toString()];
      default:
        return true;
    }
  }
  mergeApplyTo(current, value) {
    if (current === value || current === ApplyToKind.allDocuments) {
      return current;
    }
    return ApplyToKind.allDocuments;
  }
  tryMatchers() {
    this.activeMatcher = null;
    const length = this.buffer.length;
    for (let startIndex = 0; startIndex < length; startIndex++) {
      const candidates = this.matchers[length - startIndex];
      if (!candidates) {
        continue;
      }
      for (const matcher of candidates) {
        const result = matcher.handle(this.buffer, startIndex);
        if (result.match) {
          this.captureMatch(result.match);
          if (result.continue) {
            this.activeMatcher = matcher;
          }
          return result.match;
        }
      }
    }
    return null;
  }
  captureMatch(match) {
    this._numberOfMatches++;
    if (this._maxMarkerSeverity === void 0 || match.marker.severity > this._maxMarkerSeverity) {
      this._maxMarkerSeverity = match.marker.severity;
    }
  }
  clearBuffer() {
    if (this.buffer.length > 0) {
      this.buffer = [];
    }
  }
  recordResourcesToClean(owner) {
    const resourceSetToClean = this.getResourceSetToClean(owner);
    this.markerService.read({ owner }).forEach((marker) => resourceSetToClean.set(marker.resource.toString(), marker.resource));
  }
  recordResourceToClean(owner, resource) {
    this.getResourceSetToClean(owner).set(resource.toString(), resource);
  }
  removeResourceToClean(owner, resource) {
    const resourceSet = this.resourcesToClean.get(owner);
    resourceSet?.delete(resource);
  }
  getResourceSetToClean(owner) {
    let result = this.resourcesToClean.get(owner);
    if (!result) {
      result = /* @__PURE__ */ new Map();
      this.resourcesToClean.set(owner, result);
    }
    return result;
  }
  cleanAllMarkers() {
    this.resourcesToClean.forEach((value, owner) => {
      this._cleanMarkers(owner, value);
    });
    this.resourcesToClean = /* @__PURE__ */ new Map();
  }
  cleanMarkers(owner) {
    const toClean = this.resourcesToClean.get(owner);
    if (toClean) {
      this._cleanMarkers(owner, toClean);
      this.resourcesToClean.delete(owner);
    }
  }
  _cleanMarkers(owner, toClean) {
    const uris = [];
    const applyTo = this.applyToByOwner.get(owner);
    toClean.forEach((uri, uriAsString) => {
      if (applyTo === ApplyToKind.allDocuments || applyTo === ApplyToKind.openDocuments && this.openModels[uriAsString] || applyTo === ApplyToKind.closedDocuments && !this.openModels[uriAsString]) {
        uris.push(uri);
      }
    });
    this.markerService.remove(owner, uris);
  }
  recordMarker(marker, owner, resourceAsString) {
    let markersPerOwner = this.markers.get(owner);
    if (!markersPerOwner) {
      markersPerOwner = /* @__PURE__ */ new Map();
      this.markers.set(owner, markersPerOwner);
    }
    let markersPerResource = markersPerOwner.get(resourceAsString);
    if (!markersPerResource) {
      markersPerResource = /* @__PURE__ */ new Map();
      markersPerOwner.set(resourceAsString, markersPerResource);
    }
    const key = IMarkerData.makeKeyOptionalMessage(marker, false);
    let existingMarker;
    if (!markersPerResource.has(key)) {
      markersPerResource.set(key, marker);
    } else if ((existingMarker = markersPerResource.get(key)) !== void 0 && existingMarker.message.length < marker.message.length && isWindows) {
      markersPerResource.set(key, marker);
    }
  }
  reportMarkers() {
    this.markers.forEach((markersPerOwner, owner) => {
      const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
      markersPerOwner.forEach((markers, resource) => {
        this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markers, deliveredMarkersPerOwner);
      });
    });
  }
  deliverMarkersPerOwnerAndResource(owner, resource) {
    const markersPerOwner = this.markers.get(owner);
    if (!markersPerOwner) {
      return;
    }
    const deliveredMarkersPerOwner = this.getDeliveredMarkersPerOwner(owner);
    const markersPerResource = markersPerOwner.get(resource);
    if (!markersPerResource) {
      return;
    }
    this.deliverMarkersPerOwnerAndResourceResolved(owner, resource, markersPerResource, deliveredMarkersPerOwner);
  }
  deliverMarkersPerOwnerAndResourceResolved(owner, resource, markers, reported) {
    if (markers.size !== reported.get(resource)) {
      const toSet = [];
      markers.forEach((value) => toSet.push(value));
      this.markerService.changeOne(owner, URI.parse(resource), toSet);
      reported.set(resource, markers.size);
    }
  }
  getDeliveredMarkersPerOwner(owner) {
    let result = this.deliveredMarkers.get(owner);
    if (!result) {
      result = /* @__PURE__ */ new Map();
      this.deliveredMarkers.set(owner, result);
    }
    return result;
  }
  cleanMarkerCaches() {
    this._numberOfMatches = 0;
    this._maxMarkerSeverity = void 0;
    this.markers.clear();
    this.deliveredMarkers.clear();
  }
  done() {
    this.reportMarkers();
    this.cleanAllMarkers();
  }
}
var ProblemHandlingStrategy = /* @__PURE__ */ ((ProblemHandlingStrategy2) => {
  ProblemHandlingStrategy2[ProblemHandlingStrategy2["Clean"] = 0] = "Clean";
  return ProblemHandlingStrategy2;
})(ProblemHandlingStrategy || {});
class StartStopProblemCollector extends AbstractProblemCollector {
  constructor(problemMatchers, markerService, modelService, _strategy = 0 /* Clean */, fileService, logService) {
    super(problemMatchers, markerService, modelService, fileService, logService);
    this._hasStarted = false;
    const ownerSet = /* @__PURE__ */ Object.create(null);
    problemMatchers.forEach((description) => ownerSet[description.owner] = true);
    this.owners = Object.keys(ownerSet);
    this.owners.forEach((owner) => {
      this.recordResourcesToClean(owner);
    });
  }
  async processLineInternal(line) {
    if (!this._hasStarted) {
      this._hasStarted = true;
      this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* BackgroundProcessingBegins */));
    }
    const markerMatch = this.tryFindMarker(line);
    if (!markerMatch) {
      return;
    }
    const owner = markerMatch.description.owner;
    const resource = await markerMatch.resource;
    const resourceAsString = resource.toString();
    this.removeResourceToClean(owner, resourceAsString);
    const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
    if (shouldApplyMatch) {
      this.recordMarker(markerMatch.marker, owner, resourceAsString);
      if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
        if (this.currentOwner && this.currentResource) {
          this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
        }
        this.currentOwner = owner;
        this.currentResource = resourceAsString;
      }
    }
  }
}
class WatchingProblemCollector extends AbstractProblemCollector {
  constructor(problemMatchers, markerService, modelService, fileService, logService) {
    super(problemMatchers, markerService, modelService, fileService, logService);
    this.lines = [];
    this.beginPatterns = [];
    this.resetCurrentResource();
    this.backgroundPatterns = [];
    this._activeBackgroundMatchers = /* @__PURE__ */ new Set();
    this.problemMatchers.forEach((matcher) => {
      if (matcher.watching) {
        const key = generateUuid();
        this.backgroundPatterns.push({
          key,
          matcher,
          begin: matcher.watching.beginsPattern,
          end: matcher.watching.endsPattern
        });
        this.beginPatterns.push(matcher.watching.beginsPattern.regexp);
      }
    });
    this.modelListeners.add(this.modelService.onModelRemoved((modelEvent) => {
      let markerChanged = Event.debounce(
        this.markerService.onMarkerChanged,
        (last, e) => (last ?? []).concat(e),
        500,
        false,
        true
      )(async (markerEvent) => {
        if (markerEvent.length === 0) {
          return;
        }
        const modelEventUriStr = modelEvent.uri.toString();
        if (!markerEvent.some((uri) => uri.toString() === modelEventUriStr) || this.markerService.read({ resource: modelEvent.uri }).length !== 0) {
          return;
        }
        const oldLines = Array.from(this.lines);
        for (const line of oldLines) {
          await this.processLineInternal(line, false);
        }
      });
      setTimeout(() => {
        if (markerChanged) {
          const _markerChanged = markerChanged;
          markerChanged = void 0;
          _markerChanged.dispose();
        }
      }, 600);
    }));
  }
  aboutToStart() {
    for (const background of this.backgroundPatterns) {
      if (background.matcher.watching && background.matcher.watching.activeOnStart) {
        this._activeBackgroundMatchers.add(background.key);
        this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* BackgroundProcessingBegins */));
        this.recordResourcesToClean(background.matcher.owner);
      }
    }
  }
  async processLineInternal(line, recordLine = true) {
    if (await this.tryBegin(line, recordLine) || this.tryFinish(line, recordLine)) {
      return;
    }
    if (recordLine) {
      this.lines.push(line);
    }
    const markerMatch = this.tryFindMarker(line);
    if (!markerMatch) {
      return;
    }
    const resource = await markerMatch.resource;
    const owner = markerMatch.description.owner;
    const resourceAsString = resource.toString();
    this.removeResourceToClean(owner, resourceAsString);
    const shouldApplyMatch = await this.shouldApplyMatch(markerMatch);
    if (shouldApplyMatch) {
      this.recordMarker(markerMatch.marker, owner, resourceAsString);
      if (this.currentOwner !== owner || this.currentResource !== resourceAsString) {
        this.reportMarkersForCurrentResource();
        this.currentOwner = owner;
        this.currentResource = resourceAsString;
      }
    }
  }
  forceDelivery() {
    this.reportMarkersForCurrentResource();
  }
  async tryBegin(line, recordLine) {
    let result = false;
    for (const background of this.backgroundPatterns) {
      const start = Date.now();
      const matches = background.begin.regexp.exec(line);
      const elapsed = Date.now() - start;
      if (elapsed > 5) {
        this.logService?.trace(`ProblemMatcher: slow begin regexp took ${elapsed}ms to execute`, background.begin.regexp.source);
      }
      if (matches) {
        if (this._activeBackgroundMatchers.has(background.key)) {
          continue;
        }
        this._activeBackgroundMatchers.add(background.key);
        result = true;
        this._onDidFindFirstMatch.fire();
        if (recordLine) {
          this.lines = [];
          this.lines.push(line);
        }
        this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingBegins" /* BackgroundProcessingBegins */));
        this.cleanMarkerCaches();
        this.resetCurrentResource();
        const owner = background.matcher.owner;
        const file = matches[background.begin.file];
        if (file) {
          const resource = getResource(file, background.matcher);
          this.recordResourceToClean(owner, await resource);
        } else {
          this.recordResourcesToClean(owner);
        }
      }
    }
    return result;
  }
  tryFinish(line, recordLine) {
    let result = false;
    for (const background of this.backgroundPatterns) {
      const start = Date.now();
      const matches = background.end.regexp.exec(line);
      const elapsed = Date.now() - start;
      if (elapsed > 5) {
        this.logService?.trace(`ProblemMatcher: slow end regexp took ${elapsed}ms to execute`, background.end.regexp.source);
      }
      if (matches) {
        if (this._numberOfMatches > 0) {
          this._onDidFindErrors.fire(this.markerService.read({ owner: background.matcher.owner }));
        } else {
          this._onDidRequestInvalidateLastMarker.fire();
        }
        if (this._activeBackgroundMatchers.delete(background.key)) {
          this.resetCurrentResource();
          const capturedVariables = matches.groups ? new Map(Object.entries(matches.groups)) : void 0;
          this._onDidStateChange.fire(IProblemCollectorEvent.create("backgroundProcessingEnds" /* BackgroundProcessingEnds */, capturedVariables));
          result = true;
          if (recordLine) {
            this.lines.push(line);
          }
          const owner = background.matcher.owner;
          this.cleanMarkers(owner);
          this.cleanMarkerCaches();
        }
      }
    }
    return result;
  }
  resetCurrentResource() {
    this.reportMarkersForCurrentResource();
    this.currentOwner = void 0;
    this.currentResource = void 0;
  }
  reportMarkersForCurrentResource() {
    if (this.currentOwner && this.currentResource) {
      this.deliverMarkersPerOwnerAndResource(this.currentOwner, this.currentResource);
    }
  }
  done() {
    [...this.applyToByOwner.keys()].forEach((owner) => {
      this.recordResourcesToClean(owner);
    });
    super.done();
  }
  isWatching() {
    return this.backgroundPatterns.length > 0;
  }
}
export {
  AbstractProblemCollector,
  ProblemCollectorEventKind,
  ProblemHandlingStrategy,
  StartStopProblemCollector,
  WatchingProblemCollector
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXHByb2JsZW1Db2xsZWN0b3JzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnksIElOdW1iZXJEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcblxuaW1wb3J0IHsgSUxpbmVNYXRjaGVyLCBjcmVhdGVMaW5lTWF0Y2hlciwgUHJvYmxlbU1hdGNoZXIsIElQcm9ibGVtTWF0Y2gsIEFwcGx5VG9LaW5kLCBJV2F0Y2hpbmdQYXR0ZXJuLCBnZXRSZXNvdXJjZSB9IGZyb20gJy4vcHJvYmxlbU1hdGNoZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UsIElNYXJrZXJEYXRhLCBNYXJrZXJTZXZlcml0eSwgSU1hcmtlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQge1xuXHRCYWNrZ3JvdW5kUHJvY2Vzc2luZ0JlZ2lucyA9ICdiYWNrZ3JvdW5kUHJvY2Vzc2luZ0JlZ2lucycsXG5cdEJhY2tncm91bmRQcm9jZXNzaW5nRW5kcyA9ICdiYWNrZ3JvdW5kUHJvY2Vzc2luZ0VuZHMnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2JsZW1Db2xsZWN0b3JFdmVudCB7XG5cdGtpbmQ6IFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQ7XG5cdGNhcHR1cmVkVmFyaWFibGVzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG5uYW1lc3BhY2UgSVByb2JsZW1Db2xsZWN0b3JFdmVudCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBjcmVhdGUoa2luZDogUHJvYmxlbUNvbGxlY3RvckV2ZW50S2luZCwgY2FwdHVyZWRWYXJpYWJsZXM/OiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4pIHtcblx0XHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7IGtpbmQsIGNhcHR1cmVkVmFyaWFibGVzIH0pO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2JsZW1NYXRjaGVyIHtcblx0cHJvY2Vzc0xpbmUobGluZTogc3RyaW5nKTogdm9pZDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0UHJvYmxlbUNvbGxlY3RvciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBtYXRjaGVyczogSU51bWJlckRpY3Rpb25hcnk8SUxpbmVNYXRjaGVyW10+O1xuXHRwcml2YXRlIGFjdGl2ZU1hdGNoZXI6IElMaW5lTWF0Y2hlciB8IG51bGw7XG5cdHByb3RlY3RlZCBfbnVtYmVyT2ZNYXRjaGVzOiBudW1iZXI7XG5cdHByaXZhdGUgX21heE1hcmtlclNldmVyaXR5PzogTWFya2VyU2V2ZXJpdHk7XG5cdHByaXZhdGUgYnVmZmVyOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSBidWZmZXJMZW5ndGg6IG51bWJlcjtcblx0cHJpdmF0ZSBvcGVuTW9kZWxzOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IG1vZGVsTGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHRhaWw6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0Ly8gW293bmVyXSAtPiBBcHBseVRvS2luZFxuXHRwcm90ZWN0ZWQgYXBwbHlUb0J5T3duZXI6IE1hcDxzdHJpbmcsIEFwcGx5VG9LaW5kPjtcblx0Ly8gW293bmVyXSAtPiBbcmVzb3VyY2VdIC0+IFVSSVxuXHRwcml2YXRlIHJlc291cmNlc1RvQ2xlYW46IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIFVSST4+O1xuXHQvLyBbb3duZXJdIC0+IFtyZXNvdXJjZV0gLT4gW21hcmtlcmtleV0gLT4gbWFya2VyRGF0YVxuXHRwcml2YXRlIG1hcmtlcnM6IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIElNYXJrZXJEYXRhPj4+O1xuXHQvLyBbb3duZXJdIC0+IFtyZXNvdXJjZV0gLT4gbnVtYmVyO1xuXHRwcml2YXRlIGRlbGl2ZXJlZE1hcmtlcnM6IE1hcDxzdHJpbmcsIE1hcDxzdHJpbmcsIG51bWJlcj4+O1xuXG5cdHByb3RlY3RlZCBfb25EaWRTdGF0ZUNoYW5nZTogRW1pdHRlcjxJUHJvYmxlbUNvbGxlY3RvckV2ZW50PjtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkRmluZEZpcnN0TWF0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRGaW5kRmlyc3RNYXRjaCA9IHRoaXMuX29uRGlkRmluZEZpcnN0TWF0Y2guZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEZpbmRFcnJvcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWFya2VyW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZpbmRFcnJvcnMgPSB0aGlzLl9vbkRpZEZpbmRFcnJvcnMuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RJbnZhbGlkYXRlTGFzdE1hcmtlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcXVlc3RJbnZhbGlkYXRlTGFzdE1hcmtlciA9IHRoaXMuX29uRGlkUmVxdWVzdEludmFsaWRhdGVMYXN0TWFya2VyLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBwcm9ibGVtTWF0Y2hlcnM6IFByb2JsZW1NYXRjaGVyW10sIHByb3RlY3RlZCBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSwgcHJvdGVjdGVkIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSwgZmlsZVNlcnZpY2U/OiBJRmlsZVNlcnZpY2UsIHByb3RlY3RlZCByZWFkb25seSBsb2dTZXJ2aWNlPzogSUxvZ1NlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubWF0Y2hlcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuYnVmZmVyTGVuZ3RoID0gMTtcblx0XHRwcm9ibGVtTWF0Y2hlcnMubWFwKGVsZW0gPT4gY3JlYXRlTGluZU1hdGNoZXIoZWxlbSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpKS5mb3JFYWNoKChtYXRjaGVyKSA9PiB7XG5cdFx0XHRjb25zdCBsZW5ndGggPSBtYXRjaGVyLm1hdGNoTGVuZ3RoO1xuXHRcdFx0aWYgKGxlbmd0aCA+IHRoaXMuYnVmZmVyTGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuYnVmZmVyTGVuZ3RoID0gbGVuZ3RoO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHZhbHVlID0gdGhpcy5tYXRjaGVyc1tsZW5ndGhdO1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHR2YWx1ZSA9IFtdO1xuXHRcdFx0XHR0aGlzLm1hdGNoZXJzW2xlbmd0aF0gPSB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdHZhbHVlLnB1c2gobWF0Y2hlcik7XG5cdFx0fSk7XG5cdFx0dGhpcy5idWZmZXIgPSBbXTtcblx0XHR0aGlzLmFjdGl2ZU1hdGNoZXIgPSBudWxsO1xuXHRcdHRoaXMuX251bWJlck9mTWF0Y2hlcyA9IDA7XG5cdFx0dGhpcy5fbWF4TWFya2VyU2V2ZXJpdHkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5vcGVuTW9kZWxzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLmFwcGx5VG9CeU93bmVyID0gbmV3IE1hcDxzdHJpbmcsIEFwcGx5VG9LaW5kPigpO1xuXHRcdGZvciAoY29uc3QgcHJvYmxlbU1hdGNoZXIgb2YgcHJvYmxlbU1hdGNoZXJzKSB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5hcHBseVRvQnlPd25lci5nZXQocHJvYmxlbU1hdGNoZXIub3duZXIpO1xuXHRcdFx0aWYgKGN1cnJlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLmFwcGx5VG9CeU93bmVyLnNldChwcm9ibGVtTWF0Y2hlci5vd25lciwgcHJvYmxlbU1hdGNoZXIuYXBwbHlUbyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFwcGx5VG9CeU93bmVyLnNldChwcm9ibGVtTWF0Y2hlci5vd25lciwgdGhpcy5tZXJnZUFwcGx5VG8oY3VycmVudCwgcHJvYmxlbU1hdGNoZXIuYXBwbHlUbykpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnJlc291cmNlc1RvQ2xlYW4gPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgVVJJPj4oKTtcblx0XHR0aGlzLm1hcmtlcnMgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgTWFwPHN0cmluZywgSU1hcmtlckRhdGE+Pj4oKTtcblx0XHR0aGlzLmRlbGl2ZXJlZE1hcmtlcnMgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgbnVtYmVyPj4oKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsU2VydmljZS5vbk1vZGVsQWRkZWQoKG1vZGVsKSA9PiB7XG5cdFx0XHR0aGlzLm9wZW5Nb2RlbHNbbW9kZWwudXJpLnRvU3RyaW5nKCldID0gdHJ1ZTtcblx0XHR9LCB0aGlzLCB0aGlzLm1vZGVsTGlzdGVuZXJzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQoKG1vZGVsKSA9PiB7XG5cdFx0XHRkZWxldGUgdGhpcy5vcGVuTW9kZWxzW21vZGVsLnVyaS50b1N0cmluZygpXTtcblx0XHR9LCB0aGlzLCB0aGlzLm1vZGVsTGlzdGVuZXJzKSk7XG5cdFx0dGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCkuZm9yRWFjaChtb2RlbCA9PiB0aGlzLm9wZW5Nb2RlbHNbbW9kZWwudXJpLnRvU3RyaW5nKCldID0gdHJ1ZSk7XG5cblx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXIoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkU3RhdGVDaGFuZ2UoKTogRXZlbnQ8SVByb2JsZW1Db2xsZWN0b3JFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIHByb2Nlc3NMaW5lKGxpbmU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLnRhaWwpIHtcblx0XHRcdGNvbnN0IG9sZFRhaWwgPSB0aGlzLnRhaWw7XG5cdFx0XHR0aGlzLnRhaWwgPSBvbGRUYWlsLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5wcm9jZXNzTGluZUludGVybmFsKGxpbmUpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGFpbCA9IHRoaXMucHJvY2Vzc0xpbmVJbnRlcm5hbChsaW5lKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcHJvY2Vzc0xpbmVJbnRlcm5hbChsaW5lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLm1vZGVsTGlzdGVuZXJzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbnVtYmVyT2ZNYXRjaGVzKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX251bWJlck9mTWF0Y2hlcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgbWF4TWFya2VyU2V2ZXJpdHkoKTogTWFya2VyU2V2ZXJpdHkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tYXhNYXJrZXJTZXZlcml0eTtcblx0fVxuXG5cdHByb3RlY3RlZCB0cnlGaW5kTWFya2VyKGxpbmU6IHN0cmluZyk6IElQcm9ibGVtTWF0Y2ggfCBudWxsIHtcblx0XHRsZXQgcmVzdWx0OiBJUHJvYmxlbU1hdGNoIHwgbnVsbCA9IG51bGw7XG5cdFx0aWYgKHRoaXMuYWN0aXZlTWF0Y2hlcikge1xuXHRcdFx0cmVzdWx0ID0gdGhpcy5hY3RpdmVNYXRjaGVyLm5leHQobGluZSk7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHRoaXMuY2FwdHVyZU1hdGNoKHJlc3VsdCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNsZWFyQnVmZmVyKCk7XG5cdFx0XHR0aGlzLmFjdGl2ZU1hdGNoZXIgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5idWZmZXIubGVuZ3RoIDwgdGhpcy5idWZmZXJMZW5ndGgpIHtcblx0XHRcdHRoaXMuYnVmZmVyLnB1c2gobGluZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVuZCA9IHRoaXMuYnVmZmVyLmxlbmd0aCAtIDE7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVuZDsgaSsrKSB7XG5cdFx0XHRcdHRoaXMuYnVmZmVyW2ldID0gdGhpcy5idWZmZXJbaSArIDFdO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5idWZmZXJbZW5kXSA9IGxpbmU7XG5cdFx0fVxuXG5cdFx0cmVzdWx0ID0gdGhpcy50cnlNYXRjaGVycygpO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHRoaXMuY2xlYXJCdWZmZXIoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBzaG91bGRBcHBseU1hdGNoKHJlc3VsdDogSVByb2JsZW1NYXRjaCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHN3aXRjaCAocmVzdWx0LmRlc2NyaXB0aW9uLmFwcGx5VG8pIHtcblx0XHRcdGNhc2UgQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgQXBwbHlUb0tpbmQub3BlbkRvY3VtZW50czpcblx0XHRcdFx0cmV0dXJuICEhdGhpcy5vcGVuTW9kZWxzWyhhd2FpdCByZXN1bHQucmVzb3VyY2UpLnRvU3RyaW5nKCldO1xuXHRcdFx0Y2FzZSBBcHBseVRvS2luZC5jbG9zZWREb2N1bWVudHM6XG5cdFx0XHRcdHJldHVybiAhdGhpcy5vcGVuTW9kZWxzWyhhd2FpdCByZXN1bHQucmVzb3VyY2UpLnRvU3RyaW5nKCldO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBtZXJnZUFwcGx5VG8oY3VycmVudDogQXBwbHlUb0tpbmQsIHZhbHVlOiBBcHBseVRvS2luZCk6IEFwcGx5VG9LaW5kIHtcblx0XHRpZiAoY3VycmVudCA9PT0gdmFsdWUgfHwgY3VycmVudCA9PT0gQXBwbHlUb0tpbmQuYWxsRG9jdW1lbnRzKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudDtcblx0XHR9XG5cdFx0cmV0dXJuIEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cztcblx0fVxuXG5cdHByaXZhdGUgdHJ5TWF0Y2hlcnMoKTogSVByb2JsZW1NYXRjaCB8IG51bGwge1xuXHRcdHRoaXMuYWN0aXZlTWF0Y2hlciA9IG51bGw7XG5cdFx0Y29uc3QgbGVuZ3RoID0gdGhpcy5idWZmZXIubGVuZ3RoO1xuXHRcdGZvciAobGV0IHN0YXJ0SW5kZXggPSAwOyBzdGFydEluZGV4IDwgbGVuZ3RoOyBzdGFydEluZGV4KyspIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSB0aGlzLm1hdGNoZXJzW2xlbmd0aCAtIHN0YXJ0SW5kZXhdO1xuXHRcdFx0aWYgKCFjYW5kaWRhdGVzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBtYXRjaGVyIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gbWF0Y2hlci5oYW5kbGUodGhpcy5idWZmZXIsIHN0YXJ0SW5kZXgpO1xuXHRcdFx0XHRpZiAocmVzdWx0Lm1hdGNoKSB7XG5cdFx0XHRcdFx0dGhpcy5jYXB0dXJlTWF0Y2gocmVzdWx0Lm1hdGNoKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0LmNvbnRpbnVlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFjdGl2ZU1hdGNoZXIgPSBtYXRjaGVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0Lm1hdGNoO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBjYXB0dXJlTWF0Y2gobWF0Y2g6IElQcm9ibGVtTWF0Y2gpOiB2b2lkIHtcblx0XHR0aGlzLl9udW1iZXJPZk1hdGNoZXMrKztcblx0XHRpZiAodGhpcy5fbWF4TWFya2VyU2V2ZXJpdHkgPT09IHVuZGVmaW5lZCB8fCBtYXRjaC5tYXJrZXIuc2V2ZXJpdHkgPiB0aGlzLl9tYXhNYXJrZXJTZXZlcml0eSkge1xuXHRcdFx0dGhpcy5fbWF4TWFya2VyU2V2ZXJpdHkgPSBtYXRjaC5tYXJrZXIuc2V2ZXJpdHk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckJ1ZmZlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5idWZmZXIubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5idWZmZXIgPSBbXTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVjb3JkUmVzb3VyY2VzVG9DbGVhbihvd25lcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2VTZXRUb0NsZWFuID0gdGhpcy5nZXRSZXNvdXJjZVNldFRvQ2xlYW4ob3duZXIpO1xuXHRcdHRoaXMubWFya2VyU2VydmljZS5yZWFkKHsgb3duZXI6IG93bmVyIH0pLmZvckVhY2gobWFya2VyID0+IHJlc291cmNlU2V0VG9DbGVhbi5zZXQobWFya2VyLnJlc291cmNlLnRvU3RyaW5nKCksIG1hcmtlci5yZXNvdXJjZSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlY29yZFJlc291cmNlVG9DbGVhbihvd25lcjogc3RyaW5nLCByZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRSZXNvdXJjZVNldFRvQ2xlYW4ob3duZXIpLnNldChyZXNvdXJjZS50b1N0cmluZygpLCByZXNvdXJjZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVtb3ZlUmVzb3VyY2VUb0NsZWFuKG93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByZXNvdXJjZVNldCA9IHRoaXMucmVzb3VyY2VzVG9DbGVhbi5nZXQob3duZXIpO1xuXHRcdHJlc291cmNlU2V0Py5kZWxldGUocmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXNvdXJjZVNldFRvQ2xlYW4ob3duZXI6IHN0cmluZyk6IE1hcDxzdHJpbmcsIFVSST4ge1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLnJlc291cmNlc1RvQ2xlYW4uZ2V0KG93bmVyKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmVzdWx0ID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblx0XHRcdHRoaXMucmVzb3VyY2VzVG9DbGVhbi5zZXQob3duZXIsIHJlc3VsdCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY2xlYW5BbGxNYXJrZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMucmVzb3VyY2VzVG9DbGVhbi5mb3JFYWNoKCh2YWx1ZSwgb3duZXIpID0+IHtcblx0XHRcdHRoaXMuX2NsZWFuTWFya2Vycyhvd25lciwgdmFsdWUpO1xuXHRcdH0pO1xuXHRcdHRoaXMucmVzb3VyY2VzVG9DbGVhbiA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBVUkk+PigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNsZWFuTWFya2Vycyhvd25lcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9DbGVhbiA9IHRoaXMucmVzb3VyY2VzVG9DbGVhbi5nZXQob3duZXIpO1xuXHRcdGlmICh0b0NsZWFuKSB7XG5cdFx0XHR0aGlzLl9jbGVhbk1hcmtlcnMob3duZXIsIHRvQ2xlYW4pO1xuXHRcdFx0dGhpcy5yZXNvdXJjZXNUb0NsZWFuLmRlbGV0ZShvd25lcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW5NYXJrZXJzKG93bmVyOiBzdHJpbmcsIHRvQ2xlYW46IE1hcDxzdHJpbmcsIFVSST4pOiB2b2lkIHtcblx0XHRjb25zdCB1cmlzOiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IGFwcGx5VG8gPSB0aGlzLmFwcGx5VG9CeU93bmVyLmdldChvd25lcik7XG5cdFx0dG9DbGVhbi5mb3JFYWNoKCh1cmksIHVyaUFzU3RyaW5nKSA9PiB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGFwcGx5VG8gPT09IEFwcGx5VG9LaW5kLmFsbERvY3VtZW50cyB8fFxuXHRcdFx0XHQoYXBwbHlUbyA9PT0gQXBwbHlUb0tpbmQub3BlbkRvY3VtZW50cyAmJiB0aGlzLm9wZW5Nb2RlbHNbdXJpQXNTdHJpbmddKSB8fFxuXHRcdFx0XHQoYXBwbHlUbyA9PT0gQXBwbHlUb0tpbmQuY2xvc2VkRG9jdW1lbnRzICYmICF0aGlzLm9wZW5Nb2RlbHNbdXJpQXNTdHJpbmddKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHVyaXMucHVzaCh1cmkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMubWFya2VyU2VydmljZS5yZW1vdmUob3duZXIsIHVyaXMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlY29yZE1hcmtlcihtYXJrZXI6IElNYXJrZXJEYXRhLCBvd25lcjogc3RyaW5nLCByZXNvdXJjZUFzU3RyaW5nOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQgbWFya2Vyc1Blck93bmVyID0gdGhpcy5tYXJrZXJzLmdldChvd25lcik7XG5cdFx0aWYgKCFtYXJrZXJzUGVyT3duZXIpIHtcblx0XHRcdG1hcmtlcnNQZXJPd25lciA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBJTWFya2VyRGF0YT4+KCk7XG5cdFx0XHR0aGlzLm1hcmtlcnMuc2V0KG93bmVyLCBtYXJrZXJzUGVyT3duZXIpO1xuXHRcdH1cblx0XHRsZXQgbWFya2Vyc1BlclJlc291cmNlID0gbWFya2Vyc1Blck93bmVyLmdldChyZXNvdXJjZUFzU3RyaW5nKTtcblx0XHRpZiAoIW1hcmtlcnNQZXJSZXNvdXJjZSkge1xuXHRcdFx0bWFya2Vyc1BlclJlc291cmNlID0gbmV3IE1hcDxzdHJpbmcsIElNYXJrZXJEYXRhPigpO1xuXHRcdFx0bWFya2Vyc1Blck93bmVyLnNldChyZXNvdXJjZUFzU3RyaW5nLCBtYXJrZXJzUGVyUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSBJTWFya2VyRGF0YS5tYWtlS2V5T3B0aW9uYWxNZXNzYWdlKG1hcmtlciwgZmFsc2UpO1xuXHRcdGxldCBleGlzdGluZ01hcmtlcjtcblx0XHRpZiAoIW1hcmtlcnNQZXJSZXNvdXJjZS5oYXMoa2V5KSkge1xuXHRcdFx0bWFya2Vyc1BlclJlc291cmNlLnNldChrZXksIG1hcmtlcik7XG5cdFx0fSBlbHNlIGlmICgoKGV4aXN0aW5nTWFya2VyID0gbWFya2Vyc1BlclJlc291cmNlLmdldChrZXkpKSAhPT0gdW5kZWZpbmVkKSAmJiAoZXhpc3RpbmdNYXJrZXIubWVzc2FnZS5sZW5ndGggPCBtYXJrZXIubWVzc2FnZS5sZW5ndGgpICYmIGlzV2luZG93cykge1xuXHRcdFx0Ly8gTW9zdCBsaWtlbHkgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzc3NDc1XG5cdFx0XHQvLyBIZXVyaXN0aWMgZGljdGF0ZXMgdGhhdCB3aGVuIHRoZSBrZXkgaXMgdGhlIHNhbWUgYW5kIG1lc3NhZ2UgaXMgc21hbGxlciwgd2UgaGF2ZSBoaXQgdGhpcyBsaW1pdGF0aW9uLlxuXHRcdFx0bWFya2Vyc1BlclJlc291cmNlLnNldChrZXksIG1hcmtlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlcG9ydE1hcmtlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5tYXJrZXJzLmZvckVhY2goKG1hcmtlcnNQZXJPd25lciwgb3duZXIpID0+IHtcblx0XHRcdGNvbnN0IGRlbGl2ZXJlZE1hcmtlcnNQZXJPd25lciA9IHRoaXMuZ2V0RGVsaXZlcmVkTWFya2Vyc1Blck93bmVyKG93bmVyKTtcblx0XHRcdG1hcmtlcnNQZXJPd25lci5mb3JFYWNoKChtYXJrZXJzLCByZXNvdXJjZSkgPT4ge1xuXHRcdFx0XHR0aGlzLmRlbGl2ZXJNYXJrZXJzUGVyT3duZXJBbmRSZXNvdXJjZVJlc29sdmVkKG93bmVyLCByZXNvdXJjZSwgbWFya2VycywgZGVsaXZlcmVkTWFya2Vyc1Blck93bmVyKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGRlbGl2ZXJNYXJrZXJzUGVyT3duZXJBbmRSZXNvdXJjZShvd25lcjogc3RyaW5nLCByZXNvdXJjZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbWFya2Vyc1Blck93bmVyID0gdGhpcy5tYXJrZXJzLmdldChvd25lcik7XG5cdFx0aWYgKCFtYXJrZXJzUGVyT3duZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZGVsaXZlcmVkTWFya2Vyc1Blck93bmVyID0gdGhpcy5nZXREZWxpdmVyZWRNYXJrZXJzUGVyT3duZXIob3duZXIpO1xuXHRcdGNvbnN0IG1hcmtlcnNQZXJSZXNvdXJjZSA9IG1hcmtlcnNQZXJPd25lci5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghbWFya2Vyc1BlclJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZGVsaXZlck1hcmtlcnNQZXJPd25lckFuZFJlc291cmNlUmVzb2x2ZWQob3duZXIsIHJlc291cmNlLCBtYXJrZXJzUGVyUmVzb3VyY2UsIGRlbGl2ZXJlZE1hcmtlcnNQZXJPd25lcik7XG5cdH1cblxuXHRwcml2YXRlIGRlbGl2ZXJNYXJrZXJzUGVyT3duZXJBbmRSZXNvdXJjZVJlc29sdmVkKG93bmVyOiBzdHJpbmcsIHJlc291cmNlOiBzdHJpbmcsIG1hcmtlcnM6IE1hcDxzdHJpbmcsIElNYXJrZXJEYXRhPiwgcmVwb3J0ZWQ6IE1hcDxzdHJpbmcsIG51bWJlcj4pOiB2b2lkIHtcblx0XHRpZiAobWFya2Vycy5zaXplICE9PSByZXBvcnRlZC5nZXQocmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCB0b1NldDogSU1hcmtlckRhdGFbXSA9IFtdO1xuXHRcdFx0bWFya2Vycy5mb3JFYWNoKHZhbHVlID0+IHRvU2V0LnB1c2godmFsdWUpKTtcblx0XHRcdHRoaXMubWFya2VyU2VydmljZS5jaGFuZ2VPbmUob3duZXIsIFVSSS5wYXJzZShyZXNvdXJjZSksIHRvU2V0KTtcblx0XHRcdHJlcG9ydGVkLnNldChyZXNvdXJjZSwgbWFya2Vycy5zaXplKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldERlbGl2ZXJlZE1hcmtlcnNQZXJPd25lcihvd25lcjogc3RyaW5nKTogTWFwPHN0cmluZywgbnVtYmVyPiB7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuZGVsaXZlcmVkTWFya2Vycy5nZXQob3duZXIpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRcdFx0dGhpcy5kZWxpdmVyZWRNYXJrZXJzLnNldChvd25lciwgcmVzdWx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBjbGVhbk1hcmtlckNhY2hlcygpOiB2b2lkIHtcblx0XHR0aGlzLl9udW1iZXJPZk1hdGNoZXMgPSAwO1xuXHRcdHRoaXMuX21heE1hcmtlclNldmVyaXR5ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMubWFya2Vycy5jbGVhcigpO1xuXHRcdHRoaXMuZGVsaXZlcmVkTWFya2Vycy5jbGVhcigpO1xuXHR9XG5cblx0cHVibGljIGRvbmUoKTogdm9pZCB7XG5cdFx0dGhpcy5yZXBvcnRNYXJrZXJzKCk7XG5cdFx0dGhpcy5jbGVhbkFsbE1hcmtlcnMoKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgZW51bSBQcm9ibGVtSGFuZGxpbmdTdHJhdGVneSB7XG5cdENsZWFuXG59XG5cbmV4cG9ydCBjbGFzcyBTdGFydFN0b3BQcm9ibGVtQ29sbGVjdG9yIGV4dGVuZHMgQWJzdHJhY3RQcm9ibGVtQ29sbGVjdG9yIGltcGxlbWVudHMgSVByb2JsZW1NYXRjaGVyIHtcblx0cHJpdmF0ZSBvd25lcnM6IHN0cmluZ1tdO1xuXG5cdHByaXZhdGUgY3VycmVudE93bmVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudFJlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfaGFzU3RhcnRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKHByb2JsZW1NYXRjaGVyczogUHJvYmxlbU1hdGNoZXJbXSwgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSwgX3N0cmF0ZWd5OiBQcm9ibGVtSGFuZGxpbmdTdHJhdGVneSA9IFByb2JsZW1IYW5kbGluZ1N0cmF0ZWd5LkNsZWFuLCBmaWxlU2VydmljZT86IElGaWxlU2VydmljZSwgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIocHJvYmxlbU1hdGNoZXJzLCBtYXJrZXJTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBvd25lclNldDogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHByb2JsZW1NYXRjaGVycy5mb3JFYWNoKGRlc2NyaXB0aW9uID0+IG93bmVyU2V0W2Rlc2NyaXB0aW9uLm93bmVyXSA9IHRydWUpO1xuXHRcdHRoaXMub3duZXJzID0gT2JqZWN0LmtleXMob3duZXJTZXQpO1xuXHRcdHRoaXMub3duZXJzLmZvckVhY2goKG93bmVyKSA9PiB7XG5cdFx0XHR0aGlzLnJlY29yZFJlc291cmNlc1RvQ2xlYW4ob3duZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIHByb2Nlc3NMaW5lSW50ZXJuYWwobGluZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9oYXNTdGFydGVkKSB7XG5cdFx0XHR0aGlzLl9oYXNTdGFydGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShJUHJvYmxlbUNvbGxlY3RvckV2ZW50LmNyZWF0ZShQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kLkJhY2tncm91bmRQcm9jZXNzaW5nQmVnaW5zKSk7XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtlck1hdGNoID0gdGhpcy50cnlGaW5kTWFya2VyKGxpbmUpO1xuXHRcdGlmICghbWFya2VyTWF0Y2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvd25lciA9IG1hcmtlck1hdGNoLmRlc2NyaXB0aW9uLm93bmVyO1xuXHRcdGNvbnN0IHJlc291cmNlID0gYXdhaXQgbWFya2VyTWF0Y2gucmVzb3VyY2U7XG5cdFx0Y29uc3QgcmVzb3VyY2VBc1N0cmluZyA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5yZW1vdmVSZXNvdXJjZVRvQ2xlYW4ob3duZXIsIHJlc291cmNlQXNTdHJpbmcpO1xuXHRcdGNvbnN0IHNob3VsZEFwcGx5TWF0Y2ggPSBhd2FpdCB0aGlzLnNob3VsZEFwcGx5TWF0Y2gobWFya2VyTWF0Y2gpO1xuXHRcdGlmIChzaG91bGRBcHBseU1hdGNoKSB7XG5cdFx0XHR0aGlzLnJlY29yZE1hcmtlcihtYXJrZXJNYXRjaC5tYXJrZXIsIG93bmVyLCByZXNvdXJjZUFzU3RyaW5nKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRPd25lciAhPT0gb3duZXIgfHwgdGhpcy5jdXJyZW50UmVzb3VyY2UgIT09IHJlc291cmNlQXNTdHJpbmcpIHtcblx0XHRcdFx0aWYgKHRoaXMuY3VycmVudE93bmVyICYmIHRoaXMuY3VycmVudFJlc291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5kZWxpdmVyTWFya2Vyc1Blck93bmVyQW5kUmVzb3VyY2UodGhpcy5jdXJyZW50T3duZXIsIHRoaXMuY3VycmVudFJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmN1cnJlbnRPd25lciA9IG93bmVyO1xuXHRcdFx0XHR0aGlzLmN1cnJlbnRSZXNvdXJjZSA9IHJlc291cmNlQXNTdHJpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJQmFja2dyb3VuZFBhdHRlcm5zIHtcblx0a2V5OiBzdHJpbmc7XG5cdG1hdGNoZXI6IFByb2JsZW1NYXRjaGVyO1xuXHRiZWdpbjogSVdhdGNoaW5nUGF0dGVybjtcblx0ZW5kOiBJV2F0Y2hpbmdQYXR0ZXJuO1xufVxuXG5leHBvcnQgY2xhc3MgV2F0Y2hpbmdQcm9ibGVtQ29sbGVjdG9yIGV4dGVuZHMgQWJzdHJhY3RQcm9ibGVtQ29sbGVjdG9yIGltcGxlbWVudHMgSVByb2JsZW1NYXRjaGVyIHtcblxuXHRwcml2YXRlIGJhY2tncm91bmRQYXR0ZXJuczogSUJhY2tncm91bmRQYXR0ZXJuc1tdO1xuXG5cdC8vIHdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80NDAxOFxuXHRwcml2YXRlIF9hY3RpdmVCYWNrZ3JvdW5kTWF0Y2hlcnM6IFNldDxzdHJpbmc+O1xuXG5cdC8vIEN1cnJlbnQgU3RhdGVcblx0cHJpdmF0ZSBjdXJyZW50T3duZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50UmVzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRwdWJsaWMgYmVnaW5QYXR0ZXJuczogUmVnRXhwW10gPSBbXTtcblx0Y29uc3RydWN0b3IocHJvYmxlbU1hdGNoZXJzOiBQcm9ibGVtTWF0Y2hlcltdLCBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSwgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLCBmaWxlU2VydmljZT86IElGaWxlU2VydmljZSwgbG9nU2VydmljZT86IElMb2dTZXJ2aWNlKSB7XG5cdFx0c3VwZXIocHJvYmxlbU1hdGNoZXJzLCBtYXJrZXJTZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHR0aGlzLnJlc2V0Q3VycmVudFJlc291cmNlKCk7XG5cdFx0dGhpcy5iYWNrZ3JvdW5kUGF0dGVybnMgPSBbXTtcblx0XHR0aGlzLl9hY3RpdmVCYWNrZ3JvdW5kTWF0Y2hlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnByb2JsZW1NYXRjaGVycy5mb3JFYWNoKG1hdGNoZXIgPT4ge1xuXHRcdFx0aWYgKG1hdGNoZXIud2F0Y2hpbmcpIHtcblx0XHRcdFx0Y29uc3Qga2V5OiBzdHJpbmcgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdFx0dGhpcy5iYWNrZ3JvdW5kUGF0dGVybnMucHVzaCh7XG5cdFx0XHRcdFx0a2V5LFxuXHRcdFx0XHRcdG1hdGNoZXI6IG1hdGNoZXIsXG5cdFx0XHRcdFx0YmVnaW46IG1hdGNoZXIud2F0Y2hpbmcuYmVnaW5zUGF0dGVybixcblx0XHRcdFx0XHRlbmQ6IG1hdGNoZXIud2F0Y2hpbmcuZW5kc1BhdHRlcm5cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuYmVnaW5QYXR0ZXJucy5wdXNoKG1hdGNoZXIud2F0Y2hpbmcuYmVnaW5zUGF0dGVybi5yZWdleHApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5tb2RlbExpc3RlbmVycy5hZGQodGhpcy5tb2RlbFNlcnZpY2Uub25Nb2RlbFJlbW92ZWQobW9kZWxFdmVudCA9PiB7XG5cdFx0XHRsZXQgbWFya2VyQ2hhbmdlZDogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQgPSBFdmVudC5kZWJvdW5jZShcblx0XHRcdFx0dGhpcy5tYXJrZXJTZXJ2aWNlLm9uTWFya2VyQ2hhbmdlZCxcblx0XHRcdFx0KGxhc3Q6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkLCBlOiByZWFkb25seSBVUklbXSkgPT4gKGxhc3QgPz8gW10pLmNvbmNhdChlKSxcblx0XHRcdFx0NTAwLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0dHJ1ZVxuXHRcdFx0KShhc3luYyAobWFya2VyRXZlbnQ6IHJlYWRvbmx5IFVSSVtdKSA9PiB7XG5cdFx0XHRcdGlmIChtYXJrZXJFdmVudC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZWxFdmVudFVyaVN0ciA9IG1vZGVsRXZlbnQudXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmICgoIW1hcmtlckV2ZW50LnNvbWUodXJpID0+IHVyaS50b1N0cmluZygpID09PSBtb2RlbEV2ZW50VXJpU3RyKSkgfHwgKHRoaXMubWFya2VyU2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IG1vZGVsRXZlbnQudXJpIH0pLmxlbmd0aCAhPT0gMCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgb2xkTGluZXMgPSBBcnJheS5mcm9tKHRoaXMubGluZXMpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxpbmUgb2Ygb2xkTGluZXMpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnByb2Nlc3NMaW5lSW50ZXJuYWwobGluZSwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gRGlzcG9zZSB0aGUgZGVib3VuY2VkIGxpc3RlbmVyIGFmdGVyIHRpbWVvdXQgLSBubyBuZWVkIHRvIHJlZ2lzdGVyIGl0IHNpbmNlXG5cdFx0XHQvLyBpdCdzIG9ubHkgdXNlZCB0ZW1wb3JhcmlseSBhbmQgd2lsbCBiZSBkaXNwb3NlZCBiZWxvd1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdGlmIChtYXJrZXJDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0Y29uc3QgX21hcmtlckNoYW5nZWQgPSBtYXJrZXJDaGFuZ2VkO1xuXHRcdFx0XHRcdG1hcmtlckNoYW5nZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0X21hcmtlckNoYW5nZWQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCA2MDApO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBhYm91dFRvU3RhcnQoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBiYWNrZ3JvdW5kIG9mIHRoaXMuYmFja2dyb3VuZFBhdHRlcm5zKSB7XG5cdFx0XHRpZiAoYmFja2dyb3VuZC5tYXRjaGVyLndhdGNoaW5nICYmIGJhY2tncm91bmQubWF0Y2hlci53YXRjaGluZy5hY3RpdmVPblN0YXJ0KSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUJhY2tncm91bmRNYXRjaGVycy5hZGQoYmFja2dyb3VuZC5rZXkpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmZpcmUoSVByb2JsZW1Db2xsZWN0b3JFdmVudC5jcmVhdGUoUHJvYmxlbUNvbGxlY3RvckV2ZW50S2luZC5CYWNrZ3JvdW5kUHJvY2Vzc2luZ0JlZ2lucykpO1xuXHRcdFx0XHR0aGlzLnJlY29yZFJlc291cmNlc1RvQ2xlYW4oYmFja2dyb3VuZC5tYXRjaGVyLm93bmVyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcHJvY2Vzc0xpbmVJbnRlcm5hbChsaW5lOiBzdHJpbmcsIHJlY29yZExpbmUgPSB0cnVlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGF3YWl0IHRoaXMudHJ5QmVnaW4obGluZSwgcmVjb3JkTGluZSkgfHwgdGhpcy50cnlGaW5pc2gobGluZSwgcmVjb3JkTGluZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHJlY29yZExpbmUpIHtcblx0XHRcdHRoaXMubGluZXMucHVzaChsaW5lKTtcblx0XHR9XG5cdFx0Y29uc3QgbWFya2VyTWF0Y2ggPSB0aGlzLnRyeUZpbmRNYXJrZXIobGluZSk7XG5cdFx0aWYgKCFtYXJrZXJNYXRjaCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXNvdXJjZSA9IGF3YWl0IG1hcmtlck1hdGNoLnJlc291cmNlO1xuXHRcdGNvbnN0IG93bmVyID0gbWFya2VyTWF0Y2guZGVzY3JpcHRpb24ub3duZXI7XG5cdFx0Y29uc3QgcmVzb3VyY2VBc1N0cmluZyA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5yZW1vdmVSZXNvdXJjZVRvQ2xlYW4ob3duZXIsIHJlc291cmNlQXNTdHJpbmcpO1xuXHRcdGNvbnN0IHNob3VsZEFwcGx5TWF0Y2ggPSBhd2FpdCB0aGlzLnNob3VsZEFwcGx5TWF0Y2gobWFya2VyTWF0Y2gpO1xuXHRcdGlmIChzaG91bGRBcHBseU1hdGNoKSB7XG5cdFx0XHR0aGlzLnJlY29yZE1hcmtlcihtYXJrZXJNYXRjaC5tYXJrZXIsIG93bmVyLCByZXNvdXJjZUFzU3RyaW5nKTtcblx0XHRcdGlmICh0aGlzLmN1cnJlbnRPd25lciAhPT0gb3duZXIgfHwgdGhpcy5jdXJyZW50UmVzb3VyY2UgIT09IHJlc291cmNlQXNTdHJpbmcpIHtcblx0XHRcdFx0dGhpcy5yZXBvcnRNYXJrZXJzRm9yQ3VycmVudFJlc291cmNlKCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudE93bmVyID0gb3duZXI7XG5cdFx0XHRcdHRoaXMuY3VycmVudFJlc291cmNlID0gcmVzb3VyY2VBc1N0cmluZztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9yY2VEZWxpdmVyeSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlcG9ydE1hcmtlcnNGb3JDdXJyZW50UmVzb3VyY2UoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ5QmVnaW4obGluZTogc3RyaW5nLCByZWNvcmRMaW5lOiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IHJlc3VsdCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgYmFja2dyb3VuZCBvZiB0aGlzLmJhY2tncm91bmRQYXR0ZXJucykge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IGJhY2tncm91bmQuYmVnaW4ucmVnZXhwLmV4ZWMobGluZSk7XG5cdFx0XHRjb25zdCBlbGFwc2VkID0gRGF0ZS5ub3coKSAtIHN0YXJ0O1xuXHRcdFx0aWYgKGVsYXBzZWQgPiA1KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZT8udHJhY2UoYFByb2JsZW1NYXRjaGVyOiBzbG93IGJlZ2luIHJlZ2V4cCB0b29rICR7ZWxhcHNlZH1tcyB0byBleGVjdXRlYCwgYmFja2dyb3VuZC5iZWdpbi5yZWdleHAuc291cmNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVCYWNrZ3JvdW5kTWF0Y2hlcnMuaGFzKGJhY2tncm91bmQua2V5KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUJhY2tncm91bmRNYXRjaGVycy5hZGQoYmFja2dyb3VuZC5rZXkpO1xuXHRcdFx0XHRyZXN1bHQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZpbmRGaXJzdE1hdGNoLmZpcmUoKTtcblx0XHRcdFx0aWYgKHJlY29yZExpbmUpIHtcblx0XHRcdFx0XHR0aGlzLmxpbmVzID0gW107XG5cdFx0XHRcdFx0dGhpcy5saW5lcy5wdXNoKGxpbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX29uRGlkU3RhdGVDaGFuZ2UuZmlyZShJUHJvYmxlbUNvbGxlY3RvckV2ZW50LmNyZWF0ZShQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kLkJhY2tncm91bmRQcm9jZXNzaW5nQmVnaW5zKSk7XG5cdFx0XHRcdHRoaXMuY2xlYW5NYXJrZXJDYWNoZXMoKTtcblx0XHRcdFx0dGhpcy5yZXNldEN1cnJlbnRSZXNvdXJjZSgpO1xuXHRcdFx0XHRjb25zdCBvd25lciA9IGJhY2tncm91bmQubWF0Y2hlci5vd25lcjtcblx0XHRcdFx0Y29uc3QgZmlsZSA9IG1hdGNoZXNbYmFja2dyb3VuZC5iZWdpbi5maWxlIV07XG5cdFx0XHRcdGlmIChmaWxlKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBnZXRSZXNvdXJjZShmaWxlLCBiYWNrZ3JvdW5kLm1hdGNoZXIpO1xuXHRcdFx0XHRcdHRoaXMucmVjb3JkUmVzb3VyY2VUb0NsZWFuKG93bmVyLCBhd2FpdCByZXNvdXJjZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5yZWNvcmRSZXNvdXJjZXNUb0NsZWFuKG93bmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSB0cnlGaW5pc2gobGluZTogc3RyaW5nLCByZWNvcmRMaW5lOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0bGV0IHJlc3VsdCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgYmFja2dyb3VuZCBvZiB0aGlzLmJhY2tncm91bmRQYXR0ZXJucykge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgbWF0Y2hlcyA9IGJhY2tncm91bmQuZW5kLnJlZ2V4cC5leGVjKGxpbmUpO1xuXHRcdFx0Y29uc3QgZWxhcHNlZCA9IERhdGUubm93KCkgLSBzdGFydDtcblx0XHRcdGlmIChlbGFwc2VkID4gNSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2U/LnRyYWNlKGBQcm9ibGVtTWF0Y2hlcjogc2xvdyBlbmQgcmVnZXhwIHRvb2sgJHtlbGFwc2VkfW1zIHRvIGV4ZWN1dGVgLCBiYWNrZ3JvdW5kLmVuZC5yZWdleHAuc291cmNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChtYXRjaGVzKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9udW1iZXJPZk1hdGNoZXMgPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRGaW5kRXJyb3JzLmZpcmUodGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoeyBvd25lcjogYmFja2dyb3VuZC5tYXRjaGVyLm93bmVyIH0pKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RJbnZhbGlkYXRlTGFzdE1hcmtlci5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZUJhY2tncm91bmRNYXRjaGVycy5kZWxldGUoYmFja2dyb3VuZC5rZXkpKSB7XG5cdFx0XHRcdFx0dGhpcy5yZXNldEN1cnJlbnRSZXNvdXJjZSgpO1xuXHRcdFx0XHRcdGNvbnN0IGNhcHR1cmVkVmFyaWFibGVzID0gbWF0Y2hlcy5ncm91cHMgPyBuZXcgTWFwKE9iamVjdC5lbnRyaWVzKG1hdGNoZXMuZ3JvdXBzKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5maXJlKElQcm9ibGVtQ29sbGVjdG9yRXZlbnQuY3JlYXRlKFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQuQmFja2dyb3VuZFByb2Nlc3NpbmdFbmRzLCBjYXB0dXJlZFZhcmlhYmxlcykpO1xuXHRcdFx0XHRcdHJlc3VsdCA9IHRydWU7XG5cdFx0XHRcdFx0aWYgKHJlY29yZExpbmUpIHtcblx0XHRcdFx0XHRcdHRoaXMubGluZXMucHVzaChsaW5lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgb3duZXIgPSBiYWNrZ3JvdW5kLm1hdGNoZXIub3duZXI7XG5cdFx0XHRcdFx0dGhpcy5jbGVhbk1hcmtlcnMob3duZXIpO1xuXHRcdFx0XHRcdHRoaXMuY2xlYW5NYXJrZXJDYWNoZXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldEN1cnJlbnRSZXNvdXJjZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlcG9ydE1hcmtlcnNGb3JDdXJyZW50UmVzb3VyY2UoKTtcblx0XHR0aGlzLmN1cnJlbnRPd25lciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1cnJlbnRSZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0TWFya2Vyc0ZvckN1cnJlbnRSZXNvdXJjZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jdXJyZW50T3duZXIgJiYgdGhpcy5jdXJyZW50UmVzb3VyY2UpIHtcblx0XHRcdHRoaXMuZGVsaXZlck1hcmtlcnNQZXJPd25lckFuZFJlc291cmNlKHRoaXMuY3VycmVudE93bmVyLCB0aGlzLmN1cnJlbnRSZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRvbmUoKTogdm9pZCB7XG5cdFx0Wy4uLnRoaXMuYXBwbHlUb0J5T3duZXIua2V5cygpXS5mb3JFYWNoKG93bmVyID0+IHtcblx0XHRcdHRoaXMucmVjb3JkUmVzb3VyY2VzVG9DbGVhbihvd25lcik7XG5cdFx0fSk7XG5cdFx0c3VwZXIuZG9uZSgpO1xuXHR9XG5cblx0cHVibGljIGlzV2F0Y2hpbmcoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYmFja2dyb3VuZFBhdHRlcm5zLmxlbmd0aCA+IDA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsV0FBVztBQUNwQixTQUFTLE9BQU8sZUFBZTtBQUMvQixTQUFzQixpQkFBaUIsa0JBQWtCO0FBSXpELFNBQXVCLG1CQUFrRCxhQUErQixtQkFBbUI7QUFDM0gsU0FBeUIsbUJBQTRDO0FBQ3JFLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsaUJBQWlCO0FBR25CLElBQVcsNEJBQVgsa0JBQVdBLCtCQUFYO0FBQ04sRUFBQUEsMkJBQUEsZ0NBQTZCO0FBQzdCLEVBQUFBLDJCQUFBLDhCQUEyQjtBQUZWLFNBQUFBO0FBQUEsR0FBQTtBQVVsQixJQUFVO0FBQUEsQ0FBVixDQUFVQyw0QkFBVjtBQUNRLFdBQVMsT0FBTyxNQUFp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LEVBQ1I7QUFBQSxFQUVRLHVCQUE2QjtBQUNwQyxTQUFLLGdDQUFnQztBQUNyQyxTQUFLLGVBQWU7QUFDcEIsU0FBSyxrQkFBa0I7QUFBQSxFQUN4QjtBQUFBLEVBRVEsa0NBQXdDO0FBQy9DLFFBQUksS0FBSyxnQkFBZ0IsS0FBSyxpQkFBaUI7QUFDOUMsV0FBSyxrQ0FBa0MsS0FBSyxjQUFjLEtBQUssZUFBZTtBQUFBLElBQy9FO0FBQUEsRUFDRDtBQUFBLEVBRWdCLE9BQWE7QUFDNUIsS0FBQyxHQUFHLEtBQUssZUFBZSxLQUFLLENBQUMsRUFBRSxRQUFRLFdBQVM7QUFDaEQsV0FBSyx1QkFBdUIsS0FBSztBQUFBLElBQ2xDLENBQUM7QUFDRCxVQUFNLEtBQUs7QUFBQSxFQUNaO0FBQUEsRUFFTyxhQUFzQjtBQUM1QixXQUFPLEtBQUssbUJBQW1CLFNBQVM7QUFBQSxFQUN6QztBQUNEOyIsCiAgIm5hbWVzIjogWyJQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kIiwgIklQcm9ibGVtQ29sbGVjdG9yRXZlbnQiLCAiUHJvYmxlbUhhbmRsaW5nU3RyYXRlZ3kiXQp9Cg==
