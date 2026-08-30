import { findLast } from "../../../../base/common/arraysFind.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunHandleChanges, autorunOpts, autorunWithStore, observableValue, transaction } from "../../../../base/common/observable.js";
import { ElementSizeObserver } from "../../config/elementSizeObserver.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { TextLength } from "../../../common/core/text/textLength.js";
function joinCombine(arr1, arr2, keySelector, combine) {
  if (arr1.length === 0) {
    return arr2;
  }
  if (arr2.length === 0) {
    return arr1;
  }
  const result = [];
  let i = 0;
  let j = 0;
  while (i < arr1.length && j < arr2.length) {
    const val1 = arr1[i];
    const val2 = arr2[j];
    const key1 = keySelector(val1);
    const key2 = keySelector(val2);
    if (key1 < key2) {
      result.push(val1);
      i++;
    } else if (key1 > key2) {
      result.push(val2);
      j++;
    } else {
      result.push(combine(val1, val2));
      i++;
      j++;
    }
  }
  while (i < arr1.length) {
    result.push(arr1[i]);
    i++;
  }
  while (j < arr2.length) {
    result.push(arr2[j]);
    j++;
  }
  return result;
}
function applyObservableDecorations(editor, decorations) {
  const d = new DisposableStore();
  const decorationsCollection = editor.createDecorationsCollection();
  d.add(autorunOpts({ debugName: () => `Apply decorations from ${decorations.debugName}` }, (reader) => {
    const d2 = decorations.read(reader);
    decorationsCollection.set(d2);
  }));
  d.add({
    dispose: () => {
      decorationsCollection.clear();
    }
  });
  return d;
}
function appendRemoveOnDispose(parent, child) {
  parent.appendChild(child);
  return toDisposable(() => {
    child.remove();
  });
}
function prependRemoveOnDispose(parent, child) {
  parent.prepend(child);
  return toDisposable(() => {
    child.remove();
  });
}
class ObservableElementSizeObserver extends Disposable {
  constructor(element, dimension) {
    super();
    this._automaticLayout = false;
    this.elementSizeObserver = this._register(new ElementSizeObserver(element, dimension));
    this._width = observableValue(this, this.elementSizeObserver.getWidth());
    this._height = observableValue(this, this.elementSizeObserver.getHeight());
    this._register(this.elementSizeObserver.onDidChange((e) => transaction((tx) => {
      this._width.set(this.elementSizeObserver.getWidth(), tx);
      this._height.set(this.elementSizeObserver.getHeight(), tx);
    })));
  }
  get width() {
    return this._width;
  }
  get height() {
    return this._height;
  }
  get automaticLayout() {
    return this._automaticLayout;
  }
  observe(dimension) {
    this.elementSizeObserver.observe(dimension);
  }
  setAutomaticLayout(automaticLayout) {
    this._automaticLayout = automaticLayout;
    if (automaticLayout) {
      this.elementSizeObserver.startObserving();
    } else {
      this.elementSizeObserver.stopObserving();
    }
  }
}
function animatedObservable(targetWindow, base, store) {
  let targetVal = base.get();
  let startVal = targetVal;
  let curVal = targetVal;
  const result = observableValue("animatedValue", targetVal);
  let animationStartMs = -1;
  const durationMs = 300;
  let animationFrame = void 0;
  store.add(autorunHandleChanges({
    changeTracker: {
      createChangeSummary: () => ({ animate: false }),
      handleChange: (ctx, s) => {
        if (ctx.didChange(base)) {
          s.animate = s.animate || ctx.change;
        }
        return true;
      }
    }
  }, (reader, s) => {
    if (animationFrame !== void 0) {
      targetWindow.cancelAnimationFrame(animationFrame);
      animationFrame = void 0;
    }
    startVal = curVal;
    targetVal = base.read(reader);
    if (startVal === targetVal) {
      animationStartMs = Date.now() - durationMs;
    } else {
      animationStartMs = Date.now() - (s.animate ? 0 : durationMs);
    }
    update();
  }));
  function update() {
    const passedMs = Date.now() - animationStartMs;
    curVal = Math.floor(easeOutExpo(passedMs, startVal, targetVal - startVal, durationMs));
    if (passedMs < durationMs) {
      animationFrame = targetWindow.requestAnimationFrame(update);
    } else {
      curVal = targetVal;
    }
    result.set(curVal, void 0);
  }
  return result;
}
function easeOutExpo(t, b, c, d) {
  return t === d ? b + c : c * (-Math.pow(2, -10 * t / d) + 1) + b;
}
function deepMerge(source1, source2) {
  const result = {};
  for (const key in source1) {
    result[key] = source1[key];
  }
  for (const key in source2) {
    const source2Value = source2[key];
    if (typeof result[key] === "object" && source2Value && typeof source2Value === "object") {
      result[key] = deepMerge(result[key], source2Value);
    } else {
      result[key] = source2Value;
    }
  }
  return result;
}
class ViewZoneOverlayWidget extends Disposable {
  constructor(editor, viewZone, htmlElement) {
    super();
    this._register(new ManagedOverlayWidget(editor, htmlElement));
    this._register(applyStyle(htmlElement, {
      height: viewZone.actualHeight,
      top: viewZone.actualTop
    }));
  }
}
class PlaceholderViewZone {
  constructor(_afterLineNumber, heightInPx) {
    this._afterLineNumber = _afterLineNumber;
    this.heightInPx = heightInPx;
    this.domNode = document.createElement("div");
    this._actualTop = observableValue(this, void 0);
    this._actualHeight = observableValue(this, void 0);
    this.actualTop = this._actualTop;
    this.actualHeight = this._actualHeight;
    this.showInHiddenAreas = true;
    this.onChange = this._afterLineNumber;
    this.onDomNodeTop = (top) => {
      this._actualTop.set(top, void 0);
    };
    this.onComputedHeight = (height) => {
      this._actualHeight.set(height, void 0);
    };
  }
  get afterLineNumber() {
    return this._afterLineNumber.get();
  }
}
const _ManagedOverlayWidget = class _ManagedOverlayWidget {
  constructor(_editor, _domElement) {
    this._editor = _editor;
    this._domElement = _domElement;
    this._overlayWidgetId = `managedOverlayWidget-${_ManagedOverlayWidget._counter++}`;
    this._overlayWidget = {
      getId: () => this._overlayWidgetId,
      getDomNode: () => this._domElement,
      getPosition: () => null
    };
    this._editor.addOverlayWidget(this._overlayWidget);
  }
  dispose() {
    this._editor.removeOverlayWidget(this._overlayWidget);
  }
};
_ManagedOverlayWidget._counter = 0;
let ManagedOverlayWidget = _ManagedOverlayWidget;
function applyStyle(domNode, style) {
  return autorun((reader) => {
    for (let [key, val] of Object.entries(style)) {
      if (val && typeof val === "object" && "read" in val) {
        val = val.read(reader);
      }
      if (typeof val === "number") {
        val = `${val}px`;
      }
      key = key.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
      domNode.style[key] = val;
    }
  });
}
function applyViewZones(editor, viewZones, setIsUpdating, zoneIds) {
  const store = new DisposableStore();
  const lastViewZoneIds = [];
  store.add(autorunWithStore((reader, store2) => {
    const curViewZones = viewZones.read(reader);
    const viewZonIdsPerViewZone = /* @__PURE__ */ new Map();
    const viewZoneIdPerOnChangeObservable = /* @__PURE__ */ new Map();
    if (setIsUpdating) {
      setIsUpdating(true);
    }
    editor.changeViewZones((a) => {
      for (const id of lastViewZoneIds) {
        a.removeZone(id);
        zoneIds?.delete(id);
      }
      lastViewZoneIds.length = 0;
      for (const z of curViewZones) {
        const id = a.addZone(z);
        if (z.setZoneId) {
          z.setZoneId(id);
        }
        lastViewZoneIds.push(id);
        zoneIds?.add(id);
        viewZonIdsPerViewZone.set(z, id);
      }
    });
    if (setIsUpdating) {
      setIsUpdating(false);
    }
    store2.add(autorunHandleChanges({
      changeTracker: {
        createChangeSummary() {
          return { zoneIds: [] };
        },
        handleChange(context, changeSummary) {
          const id = viewZoneIdPerOnChangeObservable.get(context.changedObservable);
          if (id !== void 0) {
            changeSummary.zoneIds.push(id);
          }
          return true;
        }
      }
    }, (reader2, changeSummary) => {
      for (const vz of curViewZones) {
        if (vz.onChange) {
          viewZoneIdPerOnChangeObservable.set(vz.onChange, viewZonIdsPerViewZone.get(vz));
          vz.onChange.read(reader2);
        }
      }
      if (setIsUpdating) {
        setIsUpdating(true);
      }
      editor.changeViewZones((a) => {
        for (const id of changeSummary.zoneIds) {
          a.layoutZone(id);
        }
      });
      if (setIsUpdating) {
        setIsUpdating(false);
      }
    }));
  }));
  store.add({
    dispose() {
      if (setIsUpdating) {
        setIsUpdating(true);
      }
      editor.changeViewZones((a) => {
        for (const id of lastViewZoneIds) {
          a.removeZone(id);
        }
      });
      zoneIds?.clear();
      if (setIsUpdating) {
        setIsUpdating(false);
      }
    }
  });
  return store;
}
class DisposableCancellationTokenSource extends CancellationTokenSource {
  dispose() {
    super.dispose(true);
  }
}
function translatePosition(posInOriginal, mappings) {
  const mapping = findLast(mappings, (m) => m.original.startLineNumber <= posInOriginal.lineNumber);
  if (!mapping) {
    return Range.fromPositions(posInOriginal);
  }
  if (mapping.original.endLineNumberExclusive <= posInOriginal.lineNumber) {
    const newLineNumber = posInOriginal.lineNumber - mapping.original.endLineNumberExclusive + mapping.modified.endLineNumberExclusive;
    return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
  }
  if (!mapping.innerChanges) {
    return Range.fromPositions(new Position(mapping.modified.startLineNumber, 1));
  }
  const innerMapping = findLast(mapping.innerChanges, (m) => m.originalRange.getStartPosition().isBeforeOrEqual(posInOriginal));
  if (!innerMapping) {
    const newLineNumber = posInOriginal.lineNumber - mapping.original.startLineNumber + mapping.modified.startLineNumber;
    return Range.fromPositions(new Position(newLineNumber, posInOriginal.column));
  }
  if (innerMapping.originalRange.containsPosition(posInOriginal)) {
    return innerMapping.modifiedRange;
  } else {
    const l = lengthBetweenPositions(innerMapping.originalRange.getEndPosition(), posInOriginal);
    return Range.fromPositions(l.addToPosition(innerMapping.modifiedRange.getEndPosition()));
  }
}
function lengthBetweenPositions(position1, position2) {
  if (position1.lineNumber === position2.lineNumber) {
    return new TextLength(0, position2.column - position1.column);
  } else {
    return new TextLength(position2.lineNumber - position1.lineNumber, position2.column - 1);
  }
}
function filterWithPrevious(arr, filter) {
  let prev;
  return arr.filter((cur) => {
    const result = filter(cur, prev);
    prev = cur;
    return result;
  });
}
class RefCounted {
  static create(value, debugOwner = void 0) {
    return new BaseRefCounted(value, value, debugOwner);
  }
  static createWithDisposable(value, disposable, debugOwner = void 0) {
    const store = new DisposableStore();
    store.add(disposable);
    store.add(value);
    return new BaseRefCounted(value, store, debugOwner);
  }
  static createOfNonDisposable(value, disposable, debugOwner = void 0) {
    return new BaseRefCounted(value, disposable, debugOwner);
  }
}
class BaseRefCounted extends RefCounted {
  constructor(object, _disposable, _debugOwner) {
    super();
    this.object = object;
    this._disposable = _disposable;
    this._debugOwner = _debugOwner;
    this._refCount = 1;
    this._isDisposed = false;
    this._owners = [];
    if (_debugOwner) {
      this._addOwner(_debugOwner);
    }
  }
  _addOwner(debugOwner) {
    if (debugOwner) {
      this._owners.push(debugOwner);
    }
  }
  createNewRef(debugOwner) {
    this._refCount++;
    if (debugOwner) {
      this._addOwner(debugOwner);
    }
    return new ClonedRefCounted(this, debugOwner);
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._decreaseRefCount(this._debugOwner);
  }
  _decreaseRefCount(debugOwner) {
    this._refCount--;
    if (this._refCount === 0) {
      this._disposable.dispose();
    }
    if (debugOwner) {
      const idx = this._owners.indexOf(debugOwner);
      if (idx !== -1) {
        this._owners.splice(idx, 1);
      }
    }
  }
}
class ClonedRefCounted extends RefCounted {
  constructor(_base, _debugOwner) {
    super();
    this._base = _base;
    this._debugOwner = _debugOwner;
    this._isDisposed = false;
  }
  get object() {
    return this._base.object;
  }
  createNewRef(debugOwner) {
    return this._base.createNewRef(debugOwner);
  }
  dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._base._decreaseRefCount(this._debugOwner);
  }
}
export {
  DisposableCancellationTokenSource,
  ManagedOverlayWidget,
  ObservableElementSizeObserver,
  PlaceholderViewZone,
  RefCounted,
  ViewZoneOverlayWidget,
  animatedObservable,
  appendRemoveOnDispose,
  applyObservableDecorations,
  applyStyle,
  applyViewZones,
  deepMerge,
  filterWithPrevious,
  joinCombine,
  prependRemoveOnDispose,
  translatePosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcdXRpbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UsIElTZXR0YWJsZU9ic2VydmFibGUsIGF1dG9ydW4sIGF1dG9ydW5IYW5kbGVDaGFuZ2VzLCBhdXRvcnVuT3B0cywgYXV0b3J1bldpdGhTdG9yZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgRWxlbWVudFNpemVPYnNlcnZlciB9IGZyb20gJy4uLy4uL2NvbmZpZy9lbGVtZW50U2l6ZU9ic2VydmVyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSVZpZXdab25lIH0gZnJvbSAnLi4vLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TGVuZ3RoIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC90ZXh0TGVuZ3RoLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGpvaW5Db21iaW5lPFQ+KGFycjE6IHJlYWRvbmx5IFRbXSwgYXJyMjogcmVhZG9ubHkgVFtdLCBrZXlTZWxlY3RvcjogKHZhbDogVCkgPT4gbnVtYmVyLCBjb21iaW5lOiAodjE6IFQsIHYyOiBUKSA9PiBUKTogcmVhZG9ubHkgVFtdIHtcblx0aWYgKGFycjEubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGFycjI7XG5cdH1cblx0aWYgKGFycjIubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGFycjE7XG5cdH1cblxuXHRjb25zdCByZXN1bHQ6IFRbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdGxldCBqID0gMDtcblx0d2hpbGUgKGkgPCBhcnIxLmxlbmd0aCAmJiBqIDwgYXJyMi5sZW5ndGgpIHtcblx0XHRjb25zdCB2YWwxID0gYXJyMVtpXTtcblx0XHRjb25zdCB2YWwyID0gYXJyMltqXTtcblx0XHRjb25zdCBrZXkxID0ga2V5U2VsZWN0b3IodmFsMSk7XG5cdFx0Y29uc3Qga2V5MiA9IGtleVNlbGVjdG9yKHZhbDIpO1xuXG5cdFx0aWYgKGtleTEgPCBrZXkyKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh2YWwxKTtcblx0XHRcdGkrKztcblx0XHR9IGVsc2UgaWYgKGtleTEgPiBrZXkyKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh2YWwyKTtcblx0XHRcdGorKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnB1c2goY29tYmluZSh2YWwxLCB2YWwyKSk7XG5cdFx0XHRpKys7XG5cdFx0XHRqKys7XG5cdFx0fVxuXHR9XG5cdHdoaWxlIChpIDwgYXJyMS5sZW5ndGgpIHtcblx0XHRyZXN1bHQucHVzaChhcnIxW2ldKTtcblx0XHRpKys7XG5cdH1cblx0d2hpbGUgKGogPCBhcnIyLmxlbmd0aCkge1xuXHRcdHJlc3VsdC5wdXNoKGFycjJbal0pO1xuXHRcdGorKztcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyBUT0RPIG1ha2UgdXRpbGl0eVxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5T2JzZXJ2YWJsZURlY29yYXRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IsIGRlY29yYXRpb25zOiBJT2JzZXJ2YWJsZTxJTW9kZWxEZWx0YURlY29yYXRpb25bXT4pOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGQgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGRlY29yYXRpb25zQ29sbGVjdGlvbiA9IGVkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0ZC5hZGQoYXV0b3J1bk9wdHMoeyBkZWJ1Z05hbWU6ICgpID0+IGBBcHBseSBkZWNvcmF0aW9ucyBmcm9tICR7ZGVjb3JhdGlvbnMuZGVidWdOYW1lfWAgfSwgcmVhZGVyID0+IHtcblx0XHRjb25zdCBkID0gZGVjb3JhdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdGRlY29yYXRpb25zQ29sbGVjdGlvbi5zZXQoZCk7XG5cdH0pKTtcblx0ZC5hZGQoe1xuXHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdGRlY29yYXRpb25zQ29sbGVjdGlvbi5jbGVhcigpO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwZW5kUmVtb3ZlT25EaXNwb3NlKHBhcmVudDogSFRNTEVsZW1lbnQsIGNoaWxkOiBIVE1MRWxlbWVudCkge1xuXHRwYXJlbnQuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRjaGlsZC5yZW1vdmUoKTtcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmVwZW5kUmVtb3ZlT25EaXNwb3NlKHBhcmVudDogSFRNTEVsZW1lbnQsIGNoaWxkOiBIVE1MRWxlbWVudCkge1xuXHRwYXJlbnQucHJlcGVuZChjaGlsZCk7XG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdGNoaWxkLnJlbW92ZSgpO1xuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIE9ic2VydmFibGVFbGVtZW50U2l6ZU9ic2VydmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudFNpemVPYnNlcnZlcjogRWxlbWVudFNpemVPYnNlcnZlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aWR0aDogSVNldHRhYmxlT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHRwdWJsaWMgZ2V0IHdpZHRoKCk6IElPYnNlcnZhYmxlPG51bWJlcj4geyByZXR1cm4gdGhpcy5fd2lkdGg7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oZWlnaHQ6IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPjtcblx0cHVibGljIGdldCBoZWlnaHQoKTogSU9ic2VydmFibGU8bnVtYmVyPiB7IHJldHVybiB0aGlzLl9oZWlnaHQ7IH1cblxuXHRwcml2YXRlIF9hdXRvbWF0aWNMYXlvdXQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHVibGljIGdldCBhdXRvbWF0aWNMYXlvdXQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9hdXRvbWF0aWNMYXlvdXQ7IH1cblxuXHRjb25zdHJ1Y3RvcihlbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwsIGRpbWVuc2lvbjogSURpbWVuc2lvbiB8IHVuZGVmaW5lZCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVsZW1lbnRTaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRWxlbWVudFNpemVPYnNlcnZlcihlbGVtZW50LCBkaW1lbnNpb24pKTtcblx0XHR0aGlzLl93aWR0aCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLmVsZW1lbnRTaXplT2JzZXJ2ZXIuZ2V0V2lkdGgoKSk7XG5cdFx0dGhpcy5faGVpZ2h0ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRoaXMuZWxlbWVudFNpemVPYnNlcnZlci5nZXRIZWlnaHQoKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVsZW1lbnRTaXplT2JzZXJ2ZXIub25EaWRDaGFuZ2UoZSA9PiB0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFNldCB3aWR0aC9oZWlnaHQgZnJvbSBlbGVtZW50U2l6ZU9ic2VydmVyICovXG5cdFx0XHR0aGlzLl93aWR0aC5zZXQodGhpcy5lbGVtZW50U2l6ZU9ic2VydmVyLmdldFdpZHRoKCksIHR4KTtcblx0XHRcdHRoaXMuX2hlaWdodC5zZXQodGhpcy5lbGVtZW50U2l6ZU9ic2VydmVyLmdldEhlaWdodCgpLCB0eCk7XG5cdFx0fSkpKTtcblx0fVxuXG5cdHB1YmxpYyBvYnNlcnZlKGRpbWVuc2lvbj86IElEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmVsZW1lbnRTaXplT2JzZXJ2ZXIub2JzZXJ2ZShkaW1lbnNpb24pO1xuXHR9XG5cblx0cHVibGljIHNldEF1dG9tYXRpY0xheW91dChhdXRvbWF0aWNMYXlvdXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hdXRvbWF0aWNMYXlvdXQgPSBhdXRvbWF0aWNMYXlvdXQ7XG5cdFx0aWYgKGF1dG9tYXRpY0xheW91dCkge1xuXHRcdFx0dGhpcy5lbGVtZW50U2l6ZU9ic2VydmVyLnN0YXJ0T2JzZXJ2aW5nKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWxlbWVudFNpemVPYnNlcnZlci5zdG9wT2JzZXJ2aW5nKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbmltYXRlZE9ic2VydmFibGUodGFyZ2V0V2luZG93OiBXaW5kb3csIGJhc2U6IElPYnNlcnZhYmxlV2l0aENoYW5nZTxudW1iZXIsIGJvb2xlYW4+LCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogSU9ic2VydmFibGU8bnVtYmVyPiB7XG5cdGxldCB0YXJnZXRWYWwgPSBiYXNlLmdldCgpO1xuXHRsZXQgc3RhcnRWYWwgPSB0YXJnZXRWYWw7XG5cdGxldCBjdXJWYWwgPSB0YXJnZXRWYWw7XG5cdGNvbnN0IHJlc3VsdCA9IG9ic2VydmFibGVWYWx1ZSgnYW5pbWF0ZWRWYWx1ZScsIHRhcmdldFZhbCk7XG5cblx0bGV0IGFuaW1hdGlvblN0YXJ0TXM6IG51bWJlciA9IC0xO1xuXHRjb25zdCBkdXJhdGlvbk1zID0gMzAwO1xuXHRsZXQgYW5pbWF0aW9uRnJhbWU6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRzdG9yZS5hZGQoYXV0b3J1bkhhbmRsZUNoYW5nZXMoe1xuXHRcdGNoYW5nZVRyYWNrZXI6IHtcblx0XHRcdGNyZWF0ZUNoYW5nZVN1bW1hcnk6ICgpID0+ICh7IGFuaW1hdGU6IGZhbHNlIH0pLFxuXHRcdFx0aGFuZGxlQ2hhbmdlOiAoY3R4LCBzKSA9PiB7XG5cdFx0XHRcdGlmIChjdHguZGlkQ2hhbmdlKGJhc2UpKSB7XG5cdFx0XHRcdFx0cy5hbmltYXRlID0gcy5hbmltYXRlIHx8IGN0eC5jaGFuZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LCAocmVhZGVyLCBzKSA9PiB7XG5cdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgdmFsdWUgKi9cblx0XHRpZiAoYW5pbWF0aW9uRnJhbWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGFyZ2V0V2luZG93LmNhbmNlbEFuaW1hdGlvbkZyYW1lKGFuaW1hdGlvbkZyYW1lKTtcblx0XHRcdGFuaW1hdGlvbkZyYW1lID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHN0YXJ0VmFsID0gY3VyVmFsO1xuXHRcdHRhcmdldFZhbCA9IGJhc2UucmVhZChyZWFkZXIpO1xuXHRcdGlmIChzdGFydFZhbCA9PT0gdGFyZ2V0VmFsKSB7XG5cdFx0XHQvLyBObyBjaGFuZ2UsIG5vIGFuaW1hdGlvblxuXHRcdFx0YW5pbWF0aW9uU3RhcnRNcyA9IERhdGUubm93KCkgLSBkdXJhdGlvbk1zO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhbmltYXRpb25TdGFydE1zID0gRGF0ZS5ub3coKSAtIChzLmFuaW1hdGUgPyAwIDogZHVyYXRpb25Ncyk7XG5cdFx0fVxuXG5cdFx0dXBkYXRlKCk7XG5cdH0pKTtcblxuXHRmdW5jdGlvbiB1cGRhdGUoKSB7XG5cdFx0Y29uc3QgcGFzc2VkTXMgPSBEYXRlLm5vdygpIC0gYW5pbWF0aW9uU3RhcnRNcztcblx0XHRjdXJWYWwgPSBNYXRoLmZsb29yKGVhc2VPdXRFeHBvKHBhc3NlZE1zLCBzdGFydFZhbCwgdGFyZ2V0VmFsIC0gc3RhcnRWYWwsIGR1cmF0aW9uTXMpKTtcblxuXHRcdGlmIChwYXNzZWRNcyA8IGR1cmF0aW9uTXMpIHtcblx0XHRcdGFuaW1hdGlvbkZyYW1lID0gdGFyZ2V0V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSh1cGRhdGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXJWYWwgPSB0YXJnZXRWYWw7XG5cdFx0fVxuXG5cdFx0cmVzdWx0LnNldChjdXJWYWwsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBlYXNlT3V0RXhwbyh0OiBudW1iZXIsIGI6IG51bWJlciwgYzogbnVtYmVyLCBkOiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gdCA9PT0gZCA/IGIgKyBjIDogYyAqICgtTWF0aC5wb3coMiwgLTEwICogdCAvIGQpICsgMSkgKyBiO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVlcE1lcmdlPFQgZXh0ZW5kcyB7fT4oc291cmNlMTogVCwgc291cmNlMjogUGFydGlhbDxUPik6IFQge1xuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0Y29uc3QgcmVzdWx0ID0ge30gYXMgYW55IGFzIFQ7XG5cdGZvciAoY29uc3Qga2V5IGluIHNvdXJjZTEpIHtcblx0XHRyZXN1bHRba2V5XSA9IHNvdXJjZTFba2V5XTtcblx0fVxuXHRmb3IgKGNvbnN0IGtleSBpbiBzb3VyY2UyKSB7XG5cdFx0Y29uc3Qgc291cmNlMlZhbHVlID0gc291cmNlMltrZXldO1xuXHRcdGlmICh0eXBlb2YgcmVzdWx0W2tleV0gPT09ICdvYmplY3QnICYmIHNvdXJjZTJWYWx1ZSAmJiB0eXBlb2Ygc291cmNlMlZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdHJlc3VsdFtrZXldID0gZGVlcE1lcmdlPGFueT4ocmVzdWx0W2tleV0sIHNvdXJjZTJWYWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0cmVzdWx0W2tleV0gPSBzb3VyY2UyVmFsdWUgYXMgYW55O1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgVmlld1pvbmVPdmVybGF5V2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0dmlld1pvbmU6IFBsYWNlaG9sZGVyVmlld1pvbmUsXG5cdFx0aHRtbEVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IE1hbmFnZWRPdmVybGF5V2lkZ2V0KGVkaXRvciwgaHRtbEVsZW1lbnQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseVN0eWxlKGh0bWxFbGVtZW50LCB7XG5cdFx0XHRoZWlnaHQ6IHZpZXdab25lLmFjdHVhbEhlaWdodCxcblx0XHRcdHRvcDogdmlld1pvbmUuYWN0dWFsVG9wLFxuXHRcdH0pKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPYnNlcnZhYmxlVmlld1pvbmUgZXh0ZW5kcyBJVmlld1pvbmUge1xuXHQvLyBDYXVzZXMgdGhlIHZpZXcgem9uZSB0byByZWxheW91dC5cblx0b25DaGFuZ2U/OiBJT2JzZXJ2YWJsZTx1bmtub3duPjtcblxuXHQvLyBUZWxscyBhIHZpZXcgem9uZSBpdHMgaWQuXG5cdHNldFpvbmVJZD8oem9uZUlkOiBzdHJpbmcpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgUGxhY2Vob2xkZXJWaWV3Wm9uZSBpbXBsZW1lbnRzIElPYnNlcnZhYmxlVmlld1pvbmUge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3R1YWxUb3A7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdHVhbEhlaWdodDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgYWN0dWFsVG9wOiBJT2JzZXJ2YWJsZTxudW1iZXIgfCB1bmRlZmluZWQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgYWN0dWFsSGVpZ2h0OiBJT2JzZXJ2YWJsZTxudW1iZXIgfCB1bmRlZmluZWQ+O1xuXG5cdHB1YmxpYyByZWFkb25seSBzaG93SW5IaWRkZW5BcmVhcztcblxuXHRwdWJsaWMgZ2V0IGFmdGVyTGluZU51bWJlcigpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fYWZ0ZXJMaW5lTnVtYmVyLmdldCgpOyB9XG5cblx0cHVibGljIHJlYWRvbmx5IG9uQ2hhbmdlPzogSU9ic2VydmFibGU8dW5rbm93bj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWZ0ZXJMaW5lTnVtYmVyOiBJT2JzZXJ2YWJsZTxudW1iZXI+LFxuXHRcdHB1YmxpYyByZWFkb25seSBoZWlnaHRJblB4OiBudW1iZXIsXG5cdCkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2FjdHVhbFRvcCA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXIgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYWN0dWFsSGVpZ2h0ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlciB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmFjdHVhbFRvcCA9IHRoaXMuX2FjdHVhbFRvcDtcblx0XHR0aGlzLmFjdHVhbEhlaWdodCA9IHRoaXMuX2FjdHVhbEhlaWdodDtcblx0XHR0aGlzLnNob3dJbkhpZGRlbkFyZWFzID0gdHJ1ZTtcblx0XHR0aGlzLm9uQ2hhbmdlID0gdGhpcy5fYWZ0ZXJMaW5lTnVtYmVyO1xuXHRcdHRoaXMub25Eb21Ob2RlVG9wID0gKHRvcDogbnVtYmVyKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3R1YWxUb3Auc2V0KHRvcCwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXHRcdHRoaXMub25Db21wdXRlZEhlaWdodCA9IChoZWlnaHQ6IG51bWJlcikgPT4ge1xuXHRcdFx0dGhpcy5fYWN0dWFsSGVpZ2h0LnNldChoZWlnaHQsIHVuZGVmaW5lZCk7XG5cdFx0fTtcblx0fVxuXG5cdG9uRG9tTm9kZVRvcDtcblxuXHRvbkNvbXB1dGVkSGVpZ2h0O1xufVxuXG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VkT3ZlcmxheVdpZGdldCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgX2NvdW50ZXIgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdmVybGF5V2lkZ2V0SWQgPSBgbWFuYWdlZE92ZXJsYXlXaWRnZXQtJHtNYW5hZ2VkT3ZlcmxheVdpZGdldC5fY291bnRlcisrfWA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcmxheVdpZGdldDogSU92ZXJsYXlXaWRnZXQgPSB7XG5cdFx0Z2V0SWQ6ICgpID0+IHRoaXMuX292ZXJsYXlXaWRnZXRJZCxcblx0XHRnZXREb21Ob2RlOiAoKSA9PiB0aGlzLl9kb21FbGVtZW50LFxuXHRcdGdldFBvc2l0aW9uOiAoKSA9PiBudWxsXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb21FbGVtZW50OiBIVE1MRWxlbWVudCxcblx0KSB7XG5cdFx0dGhpcy5fZWRpdG9yLmFkZE92ZXJsYXlXaWRnZXQodGhpcy5fb3ZlcmxheVdpZGdldCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMuX292ZXJsYXlXaWRnZXQpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ1NTU3R5bGUge1xuXHRoZWlnaHQ6IG51bWJlciB8IHN0cmluZztcblx0d2lkdGg6IG51bWJlciB8IHN0cmluZztcblx0dG9wOiBudW1iZXIgfCBzdHJpbmc7XG5cdHZpc2liaWxpdHk6ICd2aXNpYmxlJyB8ICdoaWRkZW4nIHwgJ2NvbGxhcHNlJztcblx0ZGlzcGxheTogJ2Jsb2NrJyB8ICdpbmxpbmUnIHwgJ2lubGluZS1ibG9jaycgfCAnZmxleCcgfCAnbm9uZSc7XG5cdHBhZGRpbmdMZWZ0OiBudW1iZXIgfCBzdHJpbmc7XG5cdHBhZGRpbmdSaWdodDogbnVtYmVyIHwgc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlTdHlsZShkb21Ob2RlOiBIVE1MRWxlbWVudCwgc3R5bGU6IFBhcnRpYWw8eyBbVEtleSBpbiBrZXlvZiBDU1NTdHlsZV06IENTU1N0eWxlW1RLZXldIHwgSU9ic2VydmFibGU8Q1NTU3R5bGVbVEtleV0gfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkIH0+KSB7XG5cdHJldHVybiBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0LyoqIEBkZXNjcmlwdGlvbiBhcHBseVN0eWxlICovXG5cdFx0Zm9yIChsZXQgW2tleSwgdmFsXSBvZiBPYmplY3QuZW50cmllcyhzdHlsZSkpIHtcblx0XHRcdGlmICh2YWwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCcgJiYgJ3JlYWQnIGluIHZhbCkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0dmFsID0gdmFsLnJlYWQocmVhZGVyKSBhcyBhbnk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIHZhbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dmFsID0gYCR7dmFsfXB4YDtcblx0XHRcdH1cblx0XHRcdGtleSA9IGtleS5yZXBsYWNlKC9bQS1aXS9nLCBtID0+ICctJyArIG0udG9Mb3dlckNhc2UoKSk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdGRvbU5vZGUuc3R5bGVba2V5IGFzIGFueV0gPSB2YWwgYXMgYW55O1xuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseVZpZXdab25lcyhlZGl0b3I6IElDb2RlRWRpdG9yLCB2aWV3Wm9uZXM6IElPYnNlcnZhYmxlPElPYnNlcnZhYmxlVmlld1pvbmVbXT4sIHNldElzVXBkYXRpbmc/OiAoaXNVcGRhdGluZ1ZpZXdab25lczogYm9vbGVhbikgPT4gdm9pZCwgem9uZUlkcz86IFNldDxzdHJpbmc+KTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgbGFzdFZpZXdab25lSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHN0b3JlLmFkZChhdXRvcnVuV2l0aFN0b3JlKChyZWFkZXIsIHN0b3JlKSA9PiB7XG5cdFx0LyoqIEBkZXNjcmlwdGlvbiBhcHBseVZpZXdab25lcyAqL1xuXHRcdGNvbnN0IGN1clZpZXdab25lcyA9IHZpZXdab25lcy5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCB2aWV3Wm9uSWRzUGVyVmlld1pvbmUgPSBuZXcgTWFwPElPYnNlcnZhYmxlVmlld1pvbmUsIHN0cmluZz4oKTtcblx0XHRjb25zdCB2aWV3Wm9uZUlkUGVyT25DaGFuZ2VPYnNlcnZhYmxlID0gbmV3IE1hcDxJT2JzZXJ2YWJsZTx1bmtub3duPiwgc3RyaW5nPigpO1xuXG5cdFx0Ly8gQWRkL3JlbW92ZSB2aWV3IHpvbmVzXG5cdFx0aWYgKHNldElzVXBkYXRpbmcpIHsgc2V0SXNVcGRhdGluZyh0cnVlKTsgfVxuXHRcdGVkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoYSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGxhc3RWaWV3Wm9uZUlkcykgeyBhLnJlbW92ZVpvbmUoaWQpOyB6b25lSWRzPy5kZWxldGUoaWQpOyB9XG5cdFx0XHRsYXN0Vmlld1pvbmVJZHMubGVuZ3RoID0gMDtcblxuXHRcdFx0Zm9yIChjb25zdCB6IG9mIGN1clZpZXdab25lcykge1xuXHRcdFx0XHRjb25zdCBpZCA9IGEuYWRkWm9uZSh6KTtcblx0XHRcdFx0aWYgKHouc2V0Wm9uZUlkKSB7XG5cdFx0XHRcdFx0ei5zZXRab25lSWQoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RWaWV3Wm9uZUlkcy5wdXNoKGlkKTtcblx0XHRcdFx0em9uZUlkcz8uYWRkKGlkKTtcblx0XHRcdFx0dmlld1pvbklkc1BlclZpZXdab25lLnNldCh6LCBpZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKHNldElzVXBkYXRpbmcpIHsgc2V0SXNVcGRhdGluZyhmYWxzZSk7IH1cblxuXHRcdC8vIExheW91dCB6b25lIG9uIGNoYW5nZVxuXHRcdHN0b3JlLmFkZChhdXRvcnVuSGFuZGxlQ2hhbmdlcyh7XG5cdFx0XHRjaGFuZ2VUcmFja2VyOiB7XG5cdFx0XHRcdGNyZWF0ZUNoYW5nZVN1bW1hcnkoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgem9uZUlkczogW10gYXMgc3RyaW5nW10gfTtcblx0XHRcdFx0fSxcblx0XHRcdFx0aGFuZGxlQ2hhbmdlKGNvbnRleHQsIGNoYW5nZVN1bW1hcnkpIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IHZpZXdab25lSWRQZXJPbkNoYW5nZU9ic2VydmFibGUuZ2V0KGNvbnRleHQuY2hhbmdlZE9ic2VydmFibGUpO1xuXHRcdFx0XHRcdGlmIChpZCAhPT0gdW5kZWZpbmVkKSB7IGNoYW5nZVN1bW1hcnkuem9uZUlkcy5wdXNoKGlkKTsgfVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sIChyZWFkZXIsIGNoYW5nZVN1bW1hcnkpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gbGF5b3V0Wm9uZSBvbiBjaGFuZ2UgKi9cblx0XHRcdGZvciAoY29uc3Qgdnogb2YgY3VyVmlld1pvbmVzKSB7XG5cdFx0XHRcdGlmICh2ei5vbkNoYW5nZSkge1xuXHRcdFx0XHRcdHZpZXdab25lSWRQZXJPbkNoYW5nZU9ic2VydmFibGUuc2V0KHZ6Lm9uQ2hhbmdlLCB2aWV3Wm9uSWRzUGVyVmlld1pvbmUuZ2V0KHZ6KSEpO1xuXHRcdFx0XHRcdHZ6Lm9uQ2hhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHNldElzVXBkYXRpbmcpIHsgc2V0SXNVcGRhdGluZyh0cnVlKTsgfVxuXHRcdFx0ZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhID0+IHsgZm9yIChjb25zdCBpZCBvZiBjaGFuZ2VTdW1tYXJ5LnpvbmVJZHMpIHsgYS5sYXlvdXRab25lKGlkKTsgfSB9KTtcblx0XHRcdGlmIChzZXRJc1VwZGF0aW5nKSB7IHNldElzVXBkYXRpbmcoZmFsc2UpOyB9XG5cdFx0fSkpO1xuXHR9KSk7XG5cblx0c3RvcmUuYWRkKHtcblx0XHRkaXNwb3NlKCkge1xuXHRcdFx0aWYgKHNldElzVXBkYXRpbmcpIHsgc2V0SXNVcGRhdGluZyh0cnVlKTsgfVxuXHRcdFx0ZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhID0+IHsgZm9yIChjb25zdCBpZCBvZiBsYXN0Vmlld1pvbmVJZHMpIHsgYS5yZW1vdmVab25lKGlkKTsgfSB9KTtcblx0XHRcdHpvbmVJZHM/LmNsZWFyKCk7XG5cdFx0XHRpZiAoc2V0SXNVcGRhdGluZykgeyBzZXRJc1VwZGF0aW5nKGZhbHNlKTsgfVxuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIHN0b3JlO1xufVxuXG5leHBvcnQgY2xhc3MgRGlzcG9zYWJsZUNhbmNlbGxhdGlvblRva2VuU291cmNlIGV4dGVuZHMgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2Uge1xuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHRzdXBlci5kaXNwb3NlKHRydWUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2xhdGVQb3NpdGlvbihwb3NJbk9yaWdpbmFsOiBQb3NpdGlvbiwgbWFwcGluZ3M6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdKTogUmFuZ2Uge1xuXHRjb25zdCBtYXBwaW5nID0gZmluZExhc3QobWFwcGluZ3MsIG0gPT4gbS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXIgPD0gcG9zSW5PcmlnaW5hbC5saW5lTnVtYmVyKTtcblx0aWYgKCFtYXBwaW5nKSB7XG5cdFx0Ly8gTm8gY2hhbmdlcyBiZWZvcmUgdGhlIHBvc2l0aW9uXG5cdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zSW5PcmlnaW5hbCk7XG5cdH1cblxuXHRpZiAobWFwcGluZy5vcmlnaW5hbC5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIDw9IHBvc0luT3JpZ2luYWwubGluZU51bWJlcikge1xuXHRcdGNvbnN0IG5ld0xpbmVOdW1iZXIgPSBwb3NJbk9yaWdpbmFsLmxpbmVOdW1iZXIgLSBtYXBwaW5nLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgKyBtYXBwaW5nLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMobmV3IFBvc2l0aW9uKG5ld0xpbmVOdW1iZXIsIHBvc0luT3JpZ2luYWwuY29sdW1uKSk7XG5cdH1cblxuXHRpZiAoIW1hcHBpbmcuaW5uZXJDaGFuZ2VzKSB7XG5cdFx0Ly8gT25seSBmb3IgbGVnYWN5IGFsZ29yaXRobVxuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihtYXBwaW5nLm1vZGlmaWVkLnN0YXJ0TGluZU51bWJlciwgMSkpO1xuXHR9XG5cblx0Y29uc3QgaW5uZXJNYXBwaW5nID0gZmluZExhc3QobWFwcGluZy5pbm5lckNoYW5nZXMsIG0gPT4gbS5vcmlnaW5hbFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKS5pc0JlZm9yZU9yRXF1YWwocG9zSW5PcmlnaW5hbCkpO1xuXHRpZiAoIWlubmVyTWFwcGluZykge1xuXHRcdGNvbnN0IG5ld0xpbmVOdW1iZXIgPSBwb3NJbk9yaWdpbmFsLmxpbmVOdW1iZXIgLSBtYXBwaW5nLm9yaWdpbmFsLnN0YXJ0TGluZU51bWJlciArIG1hcHBpbmcubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbihuZXdMaW5lTnVtYmVyLCBwb3NJbk9yaWdpbmFsLmNvbHVtbikpO1xuXHR9XG5cblx0aWYgKGlubmVyTWFwcGluZy5vcmlnaW5hbFJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zSW5PcmlnaW5hbCkpIHtcblx0XHRyZXR1cm4gaW5uZXJNYXBwaW5nLm1vZGlmaWVkUmFuZ2U7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgbCA9IGxlbmd0aEJldHdlZW5Qb3NpdGlvbnMoaW5uZXJNYXBwaW5nLm9yaWdpbmFsUmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSwgcG9zSW5PcmlnaW5hbCk7XG5cdFx0cmV0dXJuIFJhbmdlLmZyb21Qb3NpdGlvbnMobC5hZGRUb1Bvc2l0aW9uKGlubmVyTWFwcGluZy5tb2RpZmllZFJhbmdlLmdldEVuZFBvc2l0aW9uKCkpKTtcblx0fVxufVxuXG5mdW5jdGlvbiBsZW5ndGhCZXR3ZWVuUG9zaXRpb25zKHBvc2l0aW9uMTogUG9zaXRpb24sIHBvc2l0aW9uMjogUG9zaXRpb24pOiBUZXh0TGVuZ3RoIHtcblx0aWYgKHBvc2l0aW9uMS5saW5lTnVtYmVyID09PSBwb3NpdGlvbjIubGluZU51bWJlcikge1xuXHRcdHJldHVybiBuZXcgVGV4dExlbmd0aCgwLCBwb3NpdGlvbjIuY29sdW1uIC0gcG9zaXRpb24xLmNvbHVtbik7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIG5ldyBUZXh0TGVuZ3RoKHBvc2l0aW9uMi5saW5lTnVtYmVyIC0gcG9zaXRpb24xLmxpbmVOdW1iZXIsIHBvc2l0aW9uMi5jb2x1bW4gLSAxKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gZmlsdGVyV2l0aFByZXZpb3VzPFQ+KGFycjogVFtdLCBmaWx0ZXI6IChjdXI6IFQsIHByZXY6IFQgfCB1bmRlZmluZWQpID0+IGJvb2xlYW4pOiBUW10ge1xuXHRsZXQgcHJldjogVCB8IHVuZGVmaW5lZDtcblx0cmV0dXJuIGFyci5maWx0ZXIoY3VyID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBmaWx0ZXIoY3VyLCBwcmV2KTtcblx0XHRwcmV2ID0gY3VyO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0pO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWZDb3VudGVkIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRjcmVhdGVOZXdSZWYoKTogdGhpcztcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIFJlZkNvdW50ZWQ8VD4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZTxUPiB7XG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlPFQgZXh0ZW5kcyBJRGlzcG9zYWJsZT4odmFsdWU6IFQsIGRlYnVnT3duZXI6IG9iamVjdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IFJlZkNvdW50ZWQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQmFzZVJlZkNvdW50ZWQodmFsdWUsIHZhbHVlLCBkZWJ1Z093bmVyKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlV2l0aERpc3Bvc2FibGU8VCBleHRlbmRzIElEaXNwb3NhYmxlPih2YWx1ZTogVCwgZGlzcG9zYWJsZTogSURpc3Bvc2FibGUsIGRlYnVnT3duZXI6IG9iamVjdCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IFJlZkNvdW50ZWQ8VD4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblx0XHRzdG9yZS5hZGQodmFsdWUpO1xuXHRcdHJldHVybiBuZXcgQmFzZVJlZkNvdW50ZWQodmFsdWUsIHN0b3JlLCBkZWJ1Z093bmVyKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlT2ZOb25EaXNwb3NhYmxlPFQ+KHZhbHVlOiBULCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSwgZGVidWdPd25lcjogb2JqZWN0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogUmVmQ291bnRlZDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBCYXNlUmVmQ291bnRlZCh2YWx1ZSwgZGlzcG9zYWJsZSwgZGVidWdPd25lcik7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgY3JlYXRlTmV3UmVmKGRlYnVnT3duZXI/OiBvYmplY3QgfCB1bmRlZmluZWQpOiBSZWZDb3VudGVkPFQ+O1xuXG5cdHB1YmxpYyBhYnN0cmFjdCBkaXNwb3NlKCk6IHZvaWQ7XG5cblx0cHVibGljIGFic3RyYWN0IGdldCBvYmplY3QoKTogVDtcbn1cblxuY2xhc3MgQmFzZVJlZkNvdW50ZWQ8VD4gZXh0ZW5kcyBSZWZDb3VudGVkPFQ+IHtcblx0cHJpdmF0ZSBfcmVmQ291bnQgPSAxO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX293bmVyczogb2JqZWN0W10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgb3ZlcnJpZGUgcmVhZG9ubHkgb2JqZWN0OiBULFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGU6IElEaXNwb3NhYmxlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnT3duZXI6IG9iamVjdCB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlmIChfZGVidWdPd25lcikge1xuXHRcdFx0dGhpcy5fYWRkT3duZXIoX2RlYnVnT3duZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZE93bmVyKGRlYnVnT3duZXI6IG9iamVjdCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChkZWJ1Z093bmVyKSB7XG5cdFx0XHR0aGlzLl9vd25lcnMucHVzaChkZWJ1Z093bmVyKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlTmV3UmVmKGRlYnVnT3duZXI/OiBvYmplY3QgfCB1bmRlZmluZWQpOiBSZWZDb3VudGVkPFQ+IHtcblx0XHR0aGlzLl9yZWZDb3VudCsrO1xuXHRcdGlmIChkZWJ1Z093bmVyKSB7XG5cdFx0XHR0aGlzLl9hZGRPd25lcihkZWJ1Z093bmVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBDbG9uZWRSZWZDb3VudGVkKHRoaXMsIGRlYnVnT3duZXIpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHsgcmV0dXJuOyB9XG5cdFx0dGhpcy5faXNEaXNwb3NlZCA9IHRydWU7XG5cdFx0dGhpcy5fZGVjcmVhc2VSZWZDb3VudCh0aGlzLl9kZWJ1Z093bmVyKTtcblx0fVxuXG5cdHB1YmxpYyBfZGVjcmVhc2VSZWZDb3VudChkZWJ1Z093bmVyPzogb2JqZWN0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVmQ291bnQtLTtcblx0XHRpZiAodGhpcy5fcmVmQ291bnQgPT09IDApIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmIChkZWJ1Z093bmVyKSB7XG5cdFx0XHRjb25zdCBpZHggPSB0aGlzLl9vd25lcnMuaW5kZXhPZihkZWJ1Z093bmVyKTtcblx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdHRoaXMuX293bmVycy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQ2xvbmVkUmVmQ291bnRlZDxUPiBleHRlbmRzIFJlZkNvdW50ZWQ8VD4ge1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Jhc2U6IEJhc2VSZWZDb3VudGVkPFQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnT3duZXI6IG9iamVjdCB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb2JqZWN0KCk6IFQgeyByZXR1cm4gdGhpcy5fYmFzZS5vYmplY3Q7IH1cblxuXHRwdWJsaWMgY3JlYXRlTmV3UmVmKGRlYnVnT3duZXI/OiBvYmplY3QgfCB1bmRlZmluZWQpOiBSZWZDb3VudGVkPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fYmFzZS5jcmVhdGVOZXdSZWYoZGVidWdPd25lcik7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkgeyByZXR1cm47IH1cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9iYXNlLl9kZWNyZWFzZVJlZkNvdW50KHRoaXMuX2RlYnVnT3duZXIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFlBQVksaUJBQTBDLG9CQUFvQjtBQUNuRixTQUFrRSxTQUFTLHNCQUFzQixhQUFhLGtCQUFrQixpQkFBaUIsbUJBQW1CO0FBQ3BLLFNBQVMsMkJBQTJCO0FBRXBDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUd0QixTQUFTLGtCQUFrQjtBQUVwQixTQUFTLFlBQWUsTUFBb0IsTUFBb0IsYUFBaUMsU0FBNEM7QUFDbkosTUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksS0FBSyxXQUFXLEdBQUc7QUFDdEIsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLFNBQWMsQ0FBQztBQUNyQixNQUFJLElBQUk7QUFDUixNQUFJLElBQUk7QUFDUixTQUFPLElBQUksS0FBSyxVQUFVLElBQUksS0FBSyxRQUFRO0FBQzFDLFVBQU0sT0FBTyxLQUFLLENBQUM7QUFDbkIsVUFBTSxPQUFPLEtBQUssQ0FBQztBQUNuQixVQUFNLE9BQU8sWUFBWSxJQUFJO0FBQzdCLFVBQU0sT0FB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QVEsUUFBUSxVQUFVO0FBQzNDLFVBQUksUUFBUSxJQUFJO0FBQ2YsYUFBSyxRQUFRLE9BQU8sS0FBSyxDQUFDO0FBQUEsTUFDM0I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSx5QkFBNEIsV0FBYztBQUFBLEVBRS9DLFlBQ2tCLE9BQ0EsYUFDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQUhsQixTQUFRLGNBQWM7QUFBQSxFQU10QjtBQUFBLEVBRUEsSUFBVyxTQUFZO0FBQUUsV0FBTyxLQUFLLE1BQU07QUFBQSxFQUFRO0FBQUEsRUFFNUMsYUFBYSxZQUFnRDtBQUNuRSxXQUFPLEtBQUssTUFBTSxhQUFhLFVBQVU7QUFBQSxFQUMxQztBQUFBLEVBRU8sVUFBZ0I7QUFDdEIsUUFBSSxLQUFLLGFBQWE7QUFBRTtBQUFBLElBQVE7QUFDaEMsU0FBSyxjQUFjO0FBQ25CLFNBQUssTUFBTSxrQkFBa0IsS0FBSyxXQUFXO0FBQUEsRUFDOUM7QUFDRDsiLAogICJuYW1lcyI6IFsiZCIsICJzdG9yZSIsICJyZWFkZXIiXQp9Cg==
