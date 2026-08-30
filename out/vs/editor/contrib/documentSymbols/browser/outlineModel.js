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
import { binarySearch, coalesceInPlace, equals } from "../../../../base/common/arrays.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LRUCache } from "../../../../base/common/map.js";
import { commonPrefixLength } from "../../../../base/common/strings.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IModelService } from "../../../common/services/model.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
class TreeElement {
  remove() {
    this.parent?.children.delete(this.id);
  }
  static findId(candidate, container) {
    let candidateId;
    if (typeof candidate === "string") {
      candidateId = `${container.id}/${candidate}`;
    } else {
      candidateId = `${container.id}/${candidate.name}`;
      if (container.children.get(candidateId) !== void 0) {
        candidateId = `${container.id}/${candidate.name}_${candidate.range.startLineNumber}_${candidate.range.startColumn}`;
      }
    }
    let id = candidateId;
    for (let i = 0; container.children.get(id) !== void 0; i++) {
      id = `${candidateId}_${i}`;
    }
    return id;
  }
  static getElementById(id, element) {
    if (!id) {
      return void 0;
    }
    const len = commonPrefixLength(id, element.id);
    if (len === id.length) {
      return element;
    }
    if (len < element.id.length) {
      return void 0;
    }
    for (const [, child] of element.children) {
      const candidate = TreeElement.getElementById(id, child);
      if (candidate) {
        return candidate;
      }
    }
    return void 0;
  }
  static size(element) {
    let res = 1;
    for (const [, child] of element.children) {
      res += TreeElement.size(child);
    }
    return res;
  }
  static empty(element) {
    return element.children.size === 0;
  }
}
class OutlineElement extends TreeElement {
  constructor(id, parent, symbol) {
    super();
    this.id = id;
    this.parent = parent;
    this.symbol = symbol;
    this.children = /* @__PURE__ */ new Map();
  }
}
class OutlineGroup extends TreeElement {
  constructor(id, parent, label, order) {
    super();
    this.id = id;
    this.parent = parent;
    this.label = label;
    this.order = order;
    this.children = /* @__PURE__ */ new Map();
  }
  getItemEnclosingPosition(position) {
    return position ? this._getItemEnclosingPosition(position, this.children) : void 0;
  }
  _getItemEnclosingPosition(position, children) {
    for (const [, item] of children) {
      if (!item.symbol.range || !Range.containsPosition(item.symbol.range, position)) {
        continue;
      }
      return this._getItemEnclosingPosition(position, item.children) || item;
    }
    return void 0;
  }
  updateMarker(marker) {
    for (const [, child] of this.children) {
      this._updateMarker(marker, child);
    }
  }
  _updateMarker(markers, item) {
    item.marker = void 0;
    const idx = binarySearch(markers, item.symbol.range, Range.compareRangesUsingStarts);
    let start;
    if (idx < 0) {
      start = ~idx;
      if (start > 0 && Range.areIntersecting(markers[start - 1], item.symbol.range)) {
        start -= 1;
      }
    } else {
      start = idx;
    }
    const myMarkers = [];
    let myTopSev;
    for (; start < markers.length && Range.areIntersecting(item.symbol.range, markers[start]); start++) {
      const marker = markers[start];
      myMarkers.push(marker);
      markers[start] = void 0;
      if (!myTopSev || marker.severity > myTopSev) {
        myTopSev = marker.severity;
      }
    }
    for (const [, child] of item.children) {
      this._updateMarker(myMarkers, child);
    }
    if (myTopSev) {
      item.marker = {
        count: myMarkers.length,
        topSev: myTopSev
      };
    }
    coalesceInPlace(markers);
  }
}
class OutlineModel extends TreeElement {
  constructor(uri) {
    super();
    this.uri = uri;
    this.id = "root";
    this.parent = void 0;
    this._groups = /* @__PURE__ */ new Map();
    this.children = /* @__PURE__ */ new Map();
    this.id = "root";
    this.parent = void 0;
  }
  static create(registry, textModel, token) {
    const cts = new CancellationTokenSource(token);
    const result = new OutlineModel(textModel.uri);
    const provider = registry.ordered(textModel);
    const promises = provider.map((provider2, index) => {
      const id = TreeElement.findId(`provider_${index}`, result);
      const group = new OutlineGroup(id, result, provider2.displayName ?? "Unknown Outline Provider", index);
      return Promise.resolve(provider2.provideDocumentSymbols(textModel, cts.token)).then((result2) => {
        for (const info of result2 || []) {
          OutlineModel._makeOutlineElement(info, group);
        }
        return group;
      }, (err) => {
        onUnexpectedExternalError(err);
        return group;
      }).then((group2) => {
        if (!TreeElement.empty(group2)) {
          result._groups.set(id, group2);
        } else {
          group2.remove();
        }
      });
    });
    const listener = registry.onDidChange(() => {
      const newProvider = registry.ordered(textModel);
      if (!equals(newProvider, provider)) {
        cts.cancel();
      }
    });
    return Promise.all(promises).then(() => {
      if (cts.token.isCancellationRequested && !token.isCancellationRequested) {
        return OutlineModel.create(registry, textModel, token);
      } else {
        return result._compact();
      }
    }).finally(() => {
      cts.dispose();
      listener.dispose();
      cts.dispose();
    });
  }
  static _makeOutlineElement(info, container) {
    const id = TreeElement.findId(info, container);
    const res = new OutlineElement(id, container, info);
    if (info.children) {
      for (const childInfo of info.children) {
        OutlineModel._makeOutlineElement(childInfo, res);
      }
    }
    container.children.set(res.id, res);
  }
  static get(element) {
    while (element) {
      if (element instanceof OutlineModel) {
        return element;
      }
      element = element.parent;
    }
    return void 0;
  }
  _compact() {
    let count = 0;
    for (const [key, group] of this._groups) {
      if (group.children.size === 0) {
        this._groups.delete(key);
      } else {
        count += 1;
      }
    }
    if (count !== 1) {
      this.children = this._groups;
    } else {
      const group = Iterable.first(this._groups.values());
      for (const [, child] of group.children) {
        child.parent = this;
        this.children.set(child.id, child);
      }
    }
    return this;
  }
  merge(other) {
    if (this.uri.toString() !== other.uri.toString()) {
      return false;
    }
    if (this._groups.size !== other._groups.size) {
      return false;
    }
    this._groups = other._groups;
    this.children = other.children;
    return true;
  }
  getItemEnclosingPosition(position, context) {
    let preferredGroup;
    if (context) {
      let candidate = context.parent;
      while (candidate && !preferredGroup) {
        if (candidate instanceof OutlineGroup) {
          preferredGroup = candidate;
        }
        candidate = candidate.parent;
      }
    }
    let result = void 0;
    for (const [, group] of this._groups) {
      result = group.getItemEnclosingPosition(position);
      if (result && (!preferredGroup || preferredGroup === group)) {
        break;
      }
    }
    return result;
  }
  getItemById(id) {
    return TreeElement.getElementById(id, this);
  }
  updateMarker(marker) {
    marker.sort(Range.compareRangesUsingStarts);
    for (const [, group] of this._groups) {
      group.updateMarker(marker.slice(0));
    }
  }
  getTopLevelSymbols() {
    const roots = [];
    for (const child of this.children.values()) {
      if (child instanceof OutlineElement) {
        roots.push(child.symbol);
      } else {
        roots.push(...Iterable.map(child.children.values(), (child2) => child2.symbol));
      }
    }
    return roots.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
  }
  asListOfDocumentSymbols() {
    const roots = this.getTopLevelSymbols();
    const bucket = [];
    OutlineModel._flattenDocumentSymbols(bucket, roots, "");
    return bucket.sort(
      (a, b) => Position.compare(Range.getStartPosition(a.range), Range.getStartPosition(b.range)) || Position.compare(Range.getEndPosition(b.range), Range.getEndPosition(a.range))
    );
  }
  static _flattenDocumentSymbols(bucket, entries, overrideContainerLabel) {
    for (const entry of entries) {
      bucket.push({
        kind: entry.kind,
        tags: entry.tags,
        name: entry.name,
        detail: entry.detail,
        containerName: entry.containerName || overrideContainerLabel,
        range: entry.range,
        selectionRange: entry.selectionRange,
        children: void 0
        // we flatten it...
      });
      if (entry.children) {
        OutlineModel._flattenDocumentSymbols(bucket, entry.children, entry.name);
      }
    }
  }
}
const IOutlineModelService = createDecorator("IOutlineModelService");
let OutlineModelService = class {
  constructor(_languageFeaturesService, debounces, modelService) {
    this._languageFeaturesService = _languageFeaturesService;
    this._disposables = new DisposableStore();
    this._cache = new LRUCache(15, 0.7);
    this._debounceInformation = debounces.for(_languageFeaturesService.documentSymbolProvider, "DocumentSymbols", { min: 350 });
    this._disposables.add(modelService.onModelRemoved((textModel) => {
      this._cache.delete(textModel.id);
    }));
  }
  dispose() {
    this._disposables.dispose();
  }
  async getOrCreate(textModel, token) {
    const registry = this._languageFeaturesService.documentSymbolProvider;
    const provider = registry.ordered(textModel);
    let data = this._cache.get(textModel.id);
    if (!data || data.versionId !== textModel.getVersionId() || !equals(data.provider, provider)) {
      const source = new CancellationTokenSource();
      data = {
        versionId: textModel.getVersionId(),
        provider,
        promiseCnt: 0,
        source,
        promise: OutlineModel.create(registry, textModel, source.token),
        model: void 0
      };
      this._cache.set(textModel.id, data);
      const now = Date.now();
      data.promise.then((outlineModel) => {
        data.model = outlineModel;
        this._debounceInformation.update(textModel, Date.now() - now);
      }).catch((_err) => {
        this._cache.delete(textModel.id);
      });
    }
    if (data.model) {
      return data.model;
    }
    data.promiseCnt += 1;
    const listener = token.onCancellationRequested(() => {
      if (--data.promiseCnt === 0) {
        data.source.cancel();
        this._cache.delete(textModel.id);
      }
    });
    try {
      return await data.promise;
    } finally {
      listener.dispose();
    }
  }
  getDebounceValue(textModel) {
    return this._debounceInformation.get(textModel);
  }
  getCachedModels() {
    return Iterable.filter(Iterable.map(this._cache.values(), (entry) => entry.model), (model) => model !== void 0);
  }
};
OutlineModelService = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, ILanguageFeatureDebounceService),
  __decorateParam(2, IModelService)
], OutlineModelService);
registerSingleton(IOutlineModelService, OutlineModelService, InstantiationType.Delayed);
export {
  IOutlineModelService,
  OutlineElement,
  OutlineGroup,
  OutlineModel,
  OutlineModelService,
  TreeElement
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGRvY3VtZW50U3ltYm9sc1xcYnJvd3Nlclxcb3V0bGluZU1vZGVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYmluYXJ5U2VhcmNoLCBjb2FsZXNjZUluUGxhY2UsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IExSVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGNvbW1vblByZWZpeExlbmd0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudFN5bWJvbCwgRG9jdW1lbnRTeW1ib2xQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiwgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVEZWJvdW5jZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgVHJlZUVsZW1lbnQge1xuXG5cdGFic3RyYWN0IGlkOiBzdHJpbmc7XG5cdGFic3RyYWN0IGNoaWxkcmVuOiBNYXA8c3RyaW5nLCBUcmVlRWxlbWVudD47XG5cdGFic3RyYWN0IHBhcmVudDogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cmVtb3ZlKCk6IHZvaWQge1xuXHRcdHRoaXMucGFyZW50Py5jaGlsZHJlbi5kZWxldGUodGhpcy5pZCk7XG5cdH1cblxuXHRzdGF0aWMgZmluZElkKGNhbmRpZGF0ZTogRG9jdW1lbnRTeW1ib2wgfCBzdHJpbmcsIGNvbnRhaW5lcjogVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdC8vIGNvbXBsZXggaWQtY29tcHV0YXRpb24gd2hpY2ggY29udGFpbnMgdGhlIG9yaWdpbi9leHRlbnNpb24sXG5cdFx0Ly8gdGhlIHBhcmVudCBwYXRoLCBhbmQgc29tZSBkZWR1cGUgbG9naWMgd2hlbiBuYW1lcyBjb2xsaWRlXG5cdFx0bGV0IGNhbmRpZGF0ZUlkOiBzdHJpbmc7XG5cdFx0aWYgKHR5cGVvZiBjYW5kaWRhdGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjYW5kaWRhdGVJZCA9IGAke2NvbnRhaW5lci5pZH0vJHtjYW5kaWRhdGV9YDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2FuZGlkYXRlSWQgPSBgJHtjb250YWluZXIuaWR9LyR7Y2FuZGlkYXRlLm5hbWV9YDtcblx0XHRcdGlmIChjb250YWluZXIuY2hpbGRyZW4uZ2V0KGNhbmRpZGF0ZUlkKSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZUlkID0gYCR7Y29udGFpbmVyLmlkfS8ke2NhbmRpZGF0ZS5uYW1lfV8ke2NhbmRpZGF0ZS5yYW5nZS5zdGFydExpbmVOdW1iZXJ9XyR7Y2FuZGlkYXRlLnJhbmdlLnN0YXJ0Q29sdW1ufWA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGlkID0gY2FuZGlkYXRlSWQ7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGNvbnRhaW5lci5jaGlsZHJlbi5nZXQoaWQpICE9PSB1bmRlZmluZWQ7IGkrKykge1xuXHRcdFx0aWQgPSBgJHtjYW5kaWRhdGVJZH1fJHtpfWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGlkO1xuXHR9XG5cblx0c3RhdGljIGdldEVsZW1lbnRCeUlkKGlkOiBzdHJpbmcsIGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghaWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxlbiA9IGNvbW1vblByZWZpeExlbmd0aChpZCwgZWxlbWVudC5pZCk7XG5cdFx0aWYgKGxlbiA9PT0gaWQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudDtcblx0XHR9XG5cdFx0aWYgKGxlbiA8IGVsZW1lbnQuaWQubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFssIGNoaWxkXSBvZiBlbGVtZW50LmNoaWxkcmVuKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IFRyZWVFbGVtZW50LmdldEVsZW1lbnRCeUlkKGlkLCBjaGlsZCk7XG5cdFx0XHRpZiAoY2FuZGlkYXRlKSB7XG5cdFx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzdGF0aWMgc2l6ZShlbGVtZW50OiBUcmVlRWxlbWVudCk6IG51bWJlciB7XG5cdFx0bGV0IHJlcyA9IDE7XG5cdFx0Zm9yIChjb25zdCBbLCBjaGlsZF0gb2YgZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdFx0cmVzICs9IFRyZWVFbGVtZW50LnNpemUoY2hpbGQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzO1xuXHR9XG5cblx0c3RhdGljIGVtcHR5KGVsZW1lbnQ6IFRyZWVFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuY2hpbGRyZW4uc2l6ZSA9PT0gMDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPdXRsaW5lTWFya2VyIHtcblx0c3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0ZW5kQ29sdW1uOiBudW1iZXI7XG5cdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eTtcbn1cblxuZXhwb3J0IGNsYXNzIE91dGxpbmVFbGVtZW50IGV4dGVuZHMgVHJlZUVsZW1lbnQge1xuXG5cdGNoaWxkcmVuID0gbmV3IE1hcDxzdHJpbmcsIE91dGxpbmVFbGVtZW50PigpO1xuXHRtYXJrZXI6IHsgY291bnQ6IG51bWJlcjsgdG9wU2V2OiBNYXJrZXJTZXZlcml0eSB9IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cHVibGljIHBhcmVudDogVHJlZUVsZW1lbnQgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgc3ltYm9sOiBEb2N1bWVudFN5bWJvbFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPdXRsaW5lR3JvdXAgZXh0ZW5kcyBUcmVlRWxlbWVudCB7XG5cblx0Y2hpbGRyZW4gPSBuZXcgTWFwPHN0cmluZywgT3V0bGluZUVsZW1lbnQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaWQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcGFyZW50OiBUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBsYWJlbDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IG9yZGVyOiBudW1iZXIsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRnZXRJdGVtRW5jbG9zaW5nUG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbik6IE91dGxpbmVFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gcG9zaXRpb24gPyB0aGlzLl9nZXRJdGVtRW5jbG9zaW5nUG9zaXRpb24ocG9zaXRpb24sIHRoaXMuY2hpbGRyZW4pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SXRlbUVuY2xvc2luZ1Bvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24sIGNoaWxkcmVuOiBNYXA8c3RyaW5nLCBPdXRsaW5lRWxlbWVudD4pOiBPdXRsaW5lRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBbLCBpdGVtXSBvZiBjaGlsZHJlbikge1xuXHRcdFx0aWYgKCFpdGVtLnN5bWJvbC5yYW5nZSB8fCAhUmFuZ2UuY29udGFpbnNQb3NpdGlvbihpdGVtLnN5bWJvbC5yYW5nZSwgcG9zaXRpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2dldEl0ZW1FbmNsb3NpbmdQb3NpdGlvbihwb3NpdGlvbiwgaXRlbS5jaGlsZHJlbikgfHwgaXRlbTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHVwZGF0ZU1hcmtlcihtYXJrZXI6IElPdXRsaW5lTWFya2VyW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFssIGNoaWxkXSBvZiB0aGlzLmNoaWxkcmVuKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVNYXJrZXIobWFya2VyLCBjaGlsZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTWFya2VyKG1hcmtlcnM6IElPdXRsaW5lTWFya2VyW10sIGl0ZW06IE91dGxpbmVFbGVtZW50KTogdm9pZCB7XG5cdFx0aXRlbS5tYXJrZXIgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBmaW5kIHRoZSBwcm9wZXIgc3RhcnQgaW5kZXggdG8gY2hlY2sgZm9yIGl0ZW0vbWFya2VyIG92ZXJsYXAuXG5cdFx0Y29uc3QgaWR4ID0gYmluYXJ5U2VhcmNoPElSYW5nZT4obWFya2VycywgaXRlbS5zeW1ib2wucmFuZ2UsIFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdFx0bGV0IHN0YXJ0OiBudW1iZXI7XG5cdFx0aWYgKGlkeCA8IDApIHtcblx0XHRcdHN0YXJ0ID0gfmlkeDtcblx0XHRcdGlmIChzdGFydCA+IDAgJiYgUmFuZ2UuYXJlSW50ZXJzZWN0aW5nKG1hcmtlcnNbc3RhcnQgLSAxXSwgaXRlbS5zeW1ib2wucmFuZ2UpKSB7XG5cdFx0XHRcdHN0YXJ0IC09IDE7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXJ0ID0gaWR4O1xuXHRcdH1cblxuXHRcdGNvbnN0IG15TWFya2VyczogSU91dGxpbmVNYXJrZXJbXSA9IFtdO1xuXHRcdGxldCBteVRvcFNldjogTWFya2VyU2V2ZXJpdHkgfCB1bmRlZmluZWQ7XG5cblx0XHRmb3IgKDsgc3RhcnQgPCBtYXJrZXJzLmxlbmd0aCAmJiBSYW5nZS5hcmVJbnRlcnNlY3RpbmcoaXRlbS5zeW1ib2wucmFuZ2UsIG1hcmtlcnNbc3RhcnRdKTsgc3RhcnQrKykge1xuXHRcdFx0Ly8gcmVtb3ZlIG1hcmtlcnMgaW50ZXJzZWN0aW5nIHdpdGggdGhpcyBvdXRsaW5lIGVsZW1lbnRcblx0XHRcdC8vIGFuZCBzdG9yZSB0aGVtIGluIGEgJ3ByaXZhdGUnIGFycmF5LlxuXHRcdFx0Y29uc3QgbWFya2VyID0gbWFya2Vyc1tzdGFydF07XG5cdFx0XHRteU1hcmtlcnMucHVzaChtYXJrZXIpO1xuXHRcdFx0KG1hcmtlcnMgYXMgQXJyYXk8SU91dGxpbmVNYXJrZXIgfCB1bmRlZmluZWQ+KVtzdGFydF0gPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIW15VG9wU2V2IHx8IG1hcmtlci5zZXZlcml0eSA+IG15VG9wU2V2KSB7XG5cdFx0XHRcdG15VG9wU2V2ID0gbWFya2VyLnNldmVyaXR5O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlY3Vyc2UgaW50byBjaGlsZHJlbiBhbmQgbGV0IHRoZW0gbWF0Y2ggbWFya2VycyB0aGF0IGhhdmUgbWF0Y2hlZFxuXHRcdC8vIHRoaXMgb3V0bGluZSBlbGVtZW50LiBUaGlzIG1pZ2h0IHJlbW92ZSBtYXJrZXJzIGZyb20gdGhpcyBlbGVtZW50IGFuZFxuXHRcdC8vIHRoZXJlZm9yZSB3ZSByZW1lbWJlciB0aGF0IHdlIGhhdmUgaGFkIG1hcmtlcnMuIFRoYXQgYWxsb3dzIHVzIHRvIHJlbmRlclxuXHRcdC8vIHRoZSBkb3QsIHNheWluZyAndGhpcyBlbGVtZW50IGhhcyBjaGlsZHJlbiB3aXRoIG1hcmtlcnMnXG5cdFx0Zm9yIChjb25zdCBbLCBjaGlsZF0gb2YgaXRlbS5jaGlsZHJlbikge1xuXHRcdFx0dGhpcy5fdXBkYXRlTWFya2VyKG15TWFya2VycywgY2hpbGQpO1xuXHRcdH1cblxuXHRcdGlmIChteVRvcFNldikge1xuXHRcdFx0aXRlbS5tYXJrZXIgPSB7XG5cdFx0XHRcdGNvdW50OiBteU1hcmtlcnMubGVuZ3RoLFxuXHRcdFx0XHR0b3BTZXY6IG15VG9wU2V2XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvYWxlc2NlSW5QbGFjZShtYXJrZXJzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgT3V0bGluZU1vZGVsIGV4dGVuZHMgVHJlZUVsZW1lbnQge1xuXG5cdHN0YXRpYyBjcmVhdGUocmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PERvY3VtZW50U3ltYm9sUHJvdmlkZXI+LCB0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8T3V0bGluZU1vZGVsPiB7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBPdXRsaW5lTW9kZWwodGV4dE1vZGVsLnVyaSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSByZWdpc3RyeS5vcmRlcmVkKHRleHRNb2RlbCk7XG5cdFx0Y29uc3QgcHJvbWlzZXMgPSBwcm92aWRlci5tYXAoKHByb3ZpZGVyLCBpbmRleCkgPT4ge1xuXG5cdFx0XHRjb25zdCBpZCA9IFRyZWVFbGVtZW50LmZpbmRJZChgcHJvdmlkZXJfJHtpbmRleH1gLCByZXN1bHQpO1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSBuZXcgT3V0bGluZUdyb3VwKGlkLCByZXN1bHQsIHByb3ZpZGVyLmRpc3BsYXlOYW1lID8/ICdVbmtub3duIE91dGxpbmUgUHJvdmlkZXInLCBpbmRleCk7XG5cblxuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShwcm92aWRlci5wcm92aWRlRG9jdW1lbnRTeW1ib2xzKHRleHRNb2RlbCwgY3RzLnRva2VuKSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGluZm8gb2YgcmVzdWx0IHx8IFtdKSB7XG5cdFx0XHRcdFx0T3V0bGluZU1vZGVsLl9tYWtlT3V0bGluZUVsZW1lbnQoaW5mbywgZ3JvdXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IoZXJyKTtcblx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0fSkudGhlbihncm91cCA9PiB7XG5cdFx0XHRcdGlmICghVHJlZUVsZW1lbnQuZW1wdHkoZ3JvdXApKSB7XG5cdFx0XHRcdFx0cmVzdWx0Ll9ncm91cHMuc2V0KGlkLCBncm91cCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z3JvdXAucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGlzdGVuZXIgPSByZWdpc3RyeS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXdQcm92aWRlciA9IHJlZ2lzdHJ5Lm9yZGVyZWQodGV4dE1vZGVsKTtcblx0XHRcdGlmICghZXF1YWxzKG5ld1Byb3ZpZGVyLCBwcm92aWRlcikpIHtcblx0XHRcdFx0Y3RzLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgJiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBPdXRsaW5lTW9kZWwuY3JlYXRlKHJlZ2lzdHJ5LCB0ZXh0TW9kZWwsIHRva2VuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQuX2NvbXBhY3QoKTtcblx0XHRcdH1cblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdGN0cy5kaXNwb3NlKCk7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRjdHMuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX21ha2VPdXRsaW5lRWxlbWVudChpbmZvOiBEb2N1bWVudFN5bWJvbCwgY29udGFpbmVyOiBPdXRsaW5lR3JvdXAgfCBPdXRsaW5lRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGlkID0gVHJlZUVsZW1lbnQuZmluZElkKGluZm8sIGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgcmVzID0gbmV3IE91dGxpbmVFbGVtZW50KGlkLCBjb250YWluZXIsIGluZm8pO1xuXHRcdGlmIChpbmZvLmNoaWxkcmVuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkSW5mbyBvZiBpbmZvLmNoaWxkcmVuKSB7XG5cdFx0XHRcdE91dGxpbmVNb2RlbC5fbWFrZU91dGxpbmVFbGVtZW50KGNoaWxkSW5mbywgcmVzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29udGFpbmVyLmNoaWxkcmVuLnNldChyZXMuaWQsIHJlcyk7XG5cdH1cblxuXHRzdGF0aWMgZ2V0KGVsZW1lbnQ6IFRyZWVFbGVtZW50IHwgdW5kZWZpbmVkKTogT3V0bGluZU1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHR3aGlsZSAoZWxlbWVudCkge1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBPdXRsaW5lTW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0XHR9XG5cdFx0XHRlbGVtZW50ID0gZWxlbWVudC5wYXJlbnQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZWFkb25seSBpZCA9ICdyb290Jztcblx0cmVhZG9ubHkgcGFyZW50ID0gdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBfZ3JvdXBzID0gbmV3IE1hcDxzdHJpbmcsIE91dGxpbmVHcm91cD4oKTtcblx0Y2hpbGRyZW4gPSBuZXcgTWFwPHN0cmluZywgT3V0bGluZUdyb3VwIHwgT3V0bGluZUVsZW1lbnQ+KCk7XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKHJlYWRvbmx5IHVyaTogVVJJKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaWQgPSAncm9vdCc7XG5cdFx0dGhpcy5wYXJlbnQgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wYWN0KCk6IHRoaXMge1xuXHRcdGxldCBjb3VudCA9IDA7XG5cdFx0Zm9yIChjb25zdCBba2V5LCBncm91cF0gb2YgdGhpcy5fZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAuY2hpbGRyZW4uc2l6ZSA9PT0gMCkgeyAvLyBlbXB0eVxuXHRcdFx0XHR0aGlzLl9ncm91cHMuZGVsZXRlKGtleSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb3VudCArPSAxO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY291bnQgIT09IDEpIHtcblx0XHRcdC8vXG5cdFx0XHR0aGlzLmNoaWxkcmVuID0gdGhpcy5fZ3JvdXBzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhZG9wdCBhbGwgZWxlbWVudHMgb2YgdGhlIGZpcnN0IGdyb3VwXG5cdFx0XHRjb25zdCBncm91cCA9IEl0ZXJhYmxlLmZpcnN0KHRoaXMuX2dyb3Vwcy52YWx1ZXMoKSkhO1xuXHRcdFx0Zm9yIChjb25zdCBbLCBjaGlsZF0gb2YgZ3JvdXAuY2hpbGRyZW4pIHtcblx0XHRcdFx0Y2hpbGQucGFyZW50ID0gdGhpcztcblx0XHRcdFx0dGhpcy5jaGlsZHJlbi5zZXQoY2hpbGQuaWQsIGNoaWxkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRtZXJnZShvdGhlcjogT3V0bGluZU1vZGVsKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMudXJpLnRvU3RyaW5nKCkgIT09IG90aGVyLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9ncm91cHMuc2l6ZSAhPT0gb3RoZXIuX2dyb3Vwcy5zaXplKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX2dyb3VwcyA9IG90aGVyLl9ncm91cHM7XG5cdFx0dGhpcy5jaGlsZHJlbiA9IG90aGVyLmNoaWxkcmVuO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0SXRlbUVuY2xvc2luZ1Bvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24sIGNvbnRleHQ/OiBPdXRsaW5lRWxlbWVudCk6IE91dGxpbmVFbGVtZW50IHwgdW5kZWZpbmVkIHtcblxuXHRcdGxldCBwcmVmZXJyZWRHcm91cDogT3V0bGluZUdyb3VwIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZXh0KSB7XG5cdFx0XHRsZXQgY2FuZGlkYXRlID0gY29udGV4dC5wYXJlbnQ7XG5cdFx0XHR3aGlsZSAoY2FuZGlkYXRlICYmICFwcmVmZXJyZWRHcm91cCkge1xuXHRcdFx0XHRpZiAoY2FuZGlkYXRlIGluc3RhbmNlb2YgT3V0bGluZUdyb3VwKSB7XG5cdFx0XHRcdFx0cHJlZmVycmVkR3JvdXAgPSBjYW5kaWRhdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FuZGlkYXRlID0gY2FuZGlkYXRlLnBhcmVudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0OiBPdXRsaW5lRWxlbWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IFssIGdyb3VwXSBvZiB0aGlzLl9ncm91cHMpIHtcblx0XHRcdHJlc3VsdCA9IGdyb3VwLmdldEl0ZW1FbmNsb3NpbmdQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRpZiAocmVzdWx0ICYmICghcHJlZmVycmVkR3JvdXAgfHwgcHJlZmVycmVkR3JvdXAgPT09IGdyb3VwKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldEl0ZW1CeUlkKGlkOiBzdHJpbmcpOiBUcmVlRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0cmV0dXJuIFRyZWVFbGVtZW50LmdldEVsZW1lbnRCeUlkKGlkLCB0aGlzKTtcblx0fVxuXG5cdHVwZGF0ZU1hcmtlcihtYXJrZXI6IElPdXRsaW5lTWFya2VyW10pOiB2b2lkIHtcblx0XHQvLyBzb3J0IG1hcmtlcnMgYnkgc3RhcnQgcmFuZ2Ugc28gdGhhdCB3ZSBjYW4gdXNlXG5cdFx0Ly8gb3V0bGluZSBlbGVtZW50IHN0YXJ0cyBmb3IgcXVpY2tlciBsb29rIHVwXG5cdFx0bWFya2VyLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblxuXHRcdGZvciAoY29uc3QgWywgZ3JvdXBdIG9mIHRoaXMuX2dyb3Vwcykge1xuXHRcdFx0Z3JvdXAudXBkYXRlTWFya2VyKG1hcmtlci5zbGljZSgwKSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0VG9wTGV2ZWxTeW1ib2xzKCk6IERvY3VtZW50U3ltYm9sW10ge1xuXHRcdGNvbnN0IHJvb3RzOiBEb2N1bWVudFN5bWJvbFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiB0aGlzLmNoaWxkcmVuLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBPdXRsaW5lRWxlbWVudCkge1xuXHRcdFx0XHRyb290cy5wdXNoKGNoaWxkLnN5bWJvbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyb290cy5wdXNoKC4uLkl0ZXJhYmxlLm1hcChjaGlsZC5jaGlsZHJlbi52YWx1ZXMoKSwgY2hpbGQgPT4gY2hpbGQuc3ltYm9sKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByb290cy5zb3J0KChhLCBiKSA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYS5yYW5nZSwgYi5yYW5nZSkpO1xuXHR9XG5cblx0YXNMaXN0T2ZEb2N1bWVudFN5bWJvbHMoKTogRG9jdW1lbnRTeW1ib2xbXSB7XG5cdFx0Y29uc3Qgcm9vdHMgPSB0aGlzLmdldFRvcExldmVsU3ltYm9scygpO1xuXHRcdGNvbnN0IGJ1Y2tldDogRG9jdW1lbnRTeW1ib2xbXSA9IFtdO1xuXHRcdE91dGxpbmVNb2RlbC5fZmxhdHRlbkRvY3VtZW50U3ltYm9scyhidWNrZXQsIHJvb3RzLCAnJyk7XG5cdFx0cmV0dXJuIGJ1Y2tldC5zb3J0KChhLCBiKSA9PlxuXHRcdFx0UG9zaXRpb24uY29tcGFyZShSYW5nZS5nZXRTdGFydFBvc2l0aW9uKGEucmFuZ2UpLCBSYW5nZS5nZXRTdGFydFBvc2l0aW9uKGIucmFuZ2UpKSB8fCBQb3NpdGlvbi5jb21wYXJlKFJhbmdlLmdldEVuZFBvc2l0aW9uKGIucmFuZ2UpLCBSYW5nZS5nZXRFbmRQb3NpdGlvbihhLnJhbmdlKSlcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2ZsYXR0ZW5Eb2N1bWVudFN5bWJvbHMoYnVja2V0OiBEb2N1bWVudFN5bWJvbFtdLCBlbnRyaWVzOiBEb2N1bWVudFN5bWJvbFtdLCBvdmVycmlkZUNvbnRhaW5lckxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGJ1Y2tldC5wdXNoKHtcblx0XHRcdFx0a2luZDogZW50cnkua2luZCxcblx0XHRcdFx0dGFnczogZW50cnkudGFncyxcblx0XHRcdFx0bmFtZTogZW50cnkubmFtZSxcblx0XHRcdFx0ZGV0YWlsOiBlbnRyeS5kZXRhaWwsXG5cdFx0XHRcdGNvbnRhaW5lck5hbWU6IGVudHJ5LmNvbnRhaW5lck5hbWUgfHwgb3ZlcnJpZGVDb250YWluZXJMYWJlbCxcblx0XHRcdFx0cmFuZ2U6IGVudHJ5LnJhbmdlLFxuXHRcdFx0XHRzZWxlY3Rpb25SYW5nZTogZW50cnkuc2VsZWN0aW9uUmFuZ2UsXG5cdFx0XHRcdGNoaWxkcmVuOiB1bmRlZmluZWQsIC8vIHdlIGZsYXR0ZW4gaXQuLi5cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBSZWN1cnNlIG92ZXIgY2hpbGRyZW5cblx0XHRcdGlmIChlbnRyeS5jaGlsZHJlbikge1xuXHRcdFx0XHRPdXRsaW5lTW9kZWwuX2ZsYXR0ZW5Eb2N1bWVudFN5bWJvbHMoYnVja2V0LCBlbnRyeS5jaGlsZHJlbiwgZW50cnkubmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cblxuZXhwb3J0IGNvbnN0IElPdXRsaW5lTW9kZWxTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElPdXRsaW5lTW9kZWxTZXJ2aWNlPignSU91dGxpbmVNb2RlbFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJT3V0bGluZU1vZGVsU2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0Z2V0T3JDcmVhdGUobW9kZWw6IElUZXh0TW9kZWwsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8T3V0bGluZU1vZGVsPjtcblx0Z2V0RGVib3VuY2VWYWx1ZSh0ZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXI7XG5cdGdldENhY2hlZE1vZGVscygpOiBJdGVyYWJsZTxPdXRsaW5lTW9kZWw+O1xufVxuXG5pbnRlcmZhY2UgQ2FjaGVFbnRyeSB7XG5cdHZlcnNpb25JZDogbnVtYmVyO1xuXHRwcm92aWRlcjogRG9jdW1lbnRTeW1ib2xQcm92aWRlcltdO1xuXG5cdHByb21pc2VDbnQ6IG51bWJlcjtcblx0c291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0cHJvbWlzZTogUHJvbWlzZTxPdXRsaW5lTW9kZWw+O1xuXHRtb2RlbDogT3V0bGluZU1vZGVsIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgT3V0bGluZU1vZGVsU2VydmljZSBpbXBsZW1lbnRzIElPdXRsaW5lTW9kZWxTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVib3VuY2VJbmZvcm1hdGlvbjogSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIENhY2hlRW50cnk+KDE1LCAwLjcpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSBkZWJvdW5jZXM6IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24gPSBkZWJvdW5jZXMuZm9yKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLCAnRG9jdW1lbnRTeW1ib2xzJywgeyBtaW46IDM1MCB9KTtcblxuXHRcdC8vIGRvbid0IGNhY2hlIG91dGxpbmUgbW9kZWxzIGxvbmdlciB0aGFuIHRoZWlyIHRleHQgbW9kZWxcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKHRleHRNb2RlbCA9PiB7XG5cdFx0XHR0aGlzLl9jYWNoZS5kZWxldGUodGV4dE1vZGVsLmlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jIGdldE9yQ3JlYXRlKHRleHRNb2RlbDogSVRleHRNb2RlbCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxPdXRsaW5lTW9kZWw+IHtcblxuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTeW1ib2xQcm92aWRlcjtcblx0XHRjb25zdCBwcm92aWRlciA9IHJlZ2lzdHJ5Lm9yZGVyZWQodGV4dE1vZGVsKTtcblxuXHRcdGxldCBkYXRhID0gdGhpcy5fY2FjaGUuZ2V0KHRleHRNb2RlbC5pZCk7XG5cdFx0aWYgKCFkYXRhIHx8IGRhdGEudmVyc2lvbklkICE9PSB0ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCkgfHwgIWVxdWFscyhkYXRhLnByb3ZpZGVyLCBwcm92aWRlcikpIHtcblx0XHRcdGNvbnN0IHNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0ZGF0YSA9IHtcblx0XHRcdFx0dmVyc2lvbklkOiB0ZXh0TW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0XHRwcm9taXNlQ250OiAwLFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdHByb21pc2U6IE91dGxpbmVNb2RlbC5jcmVhdGUocmVnaXN0cnksIHRleHRNb2RlbCwgc291cmNlLnRva2VuKSxcblx0XHRcdFx0bW9kZWw6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9jYWNoZS5zZXQodGV4dE1vZGVsLmlkLCBkYXRhKTtcblxuXHRcdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRcdGRhdGEucHJvbWlzZS50aGVuKG91dGxpbmVNb2RlbCA9PiB7XG5cdFx0XHRcdGRhdGEhLm1vZGVsID0gb3V0bGluZU1vZGVsO1xuXHRcdFx0XHR0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLnVwZGF0ZSh0ZXh0TW9kZWwsIERhdGUubm93KCkgLSBub3cpO1xuXHRcdFx0fSkuY2F0Y2goX2VyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2NhY2hlLmRlbGV0ZSh0ZXh0TW9kZWwuaWQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKGRhdGEubW9kZWwpIHtcblx0XHRcdC8vIHJlc29sdmVkIC0+IHJldHVybiBkYXRhXG5cdFx0XHRyZXR1cm4gZGF0YS5tb2RlbDtcblx0XHR9XG5cblx0XHQvLyBpbmNyZWFzZSB1c2FnZSBjb3VudGVyXG5cdFx0ZGF0YS5wcm9taXNlQ250ICs9IDE7XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdC8vIGxhc3QgLT4gY2FuY2VsIHByb3ZpZGVyIHJlcXVlc3QsIHJlbW92ZSBjYWNoZWQgcHJvbWlzZVxuXHRcdFx0aWYgKC0tZGF0YS5wcm9taXNlQ250ID09PSAwKSB7XG5cdFx0XHRcdGRhdGEuc291cmNlLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9jYWNoZS5kZWxldGUodGV4dE1vZGVsLmlkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgZGF0YS5wcm9taXNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0RGVib3VuY2VWYWx1ZSh0ZXh0TW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLmdldCh0ZXh0TW9kZWwpO1xuXHR9XG5cblx0Z2V0Q2FjaGVkTW9kZWxzKCk6IEl0ZXJhYmxlPE91dGxpbmVNb2RlbD4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5maWx0ZXI8T3V0bGluZU1vZGVsIHwgdW5kZWZpbmVkLCBPdXRsaW5lTW9kZWw+KEl0ZXJhYmxlLm1hcCh0aGlzLl9jYWNoZS52YWx1ZXMoKSwgZW50cnkgPT4gZW50cnkubW9kZWwpLCBtb2RlbCA9PiBtb2RlbCAhPT0gdW5kZWZpbmVkKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJT3V0bGluZU1vZGVsU2VydmljZSwgT3V0bGluZU1vZGVsU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsY0FBYyxpQkFBaUIsY0FBYztBQUN0RCxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFFbkMsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQWlCLGFBQWE7QUFJOUIsU0FBc0MsdUNBQXVDO0FBQzdFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGdDQUFnQztBQUVsQyxNQUFl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
