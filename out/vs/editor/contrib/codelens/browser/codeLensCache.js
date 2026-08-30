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
import { Event } from "../../../../base/common/event.js";
import { LRUCache } from "../../../../base/common/map.js";
import { Range } from "../../../common/core/range.js";
import { CodeLensModel } from "./codelens.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget, WillSaveStateReason } from "../../../../platform/storage/common/storage.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { runWhenWindowIdle } from "../../../../base/browser/dom.js";
const ICodeLensCache = createDecorator("ICodeLensCache");
class CacheItem {
  constructor(lineCount, data) {
    this.lineCount = lineCount;
    this.data = data;
  }
}
let CodeLensCache = class {
  constructor(storageService) {
    this._fakeProvider = new class {
      provideCodeLenses() {
        throw new Error("not supported");
      }
    }();
    this._cache = new LRUCache(20, 0.75);
    const oldkey = "codelens/cache";
    runWhenWindowIdle(mainWindow, () => storageService.remove(oldkey, StorageScope.WORKSPACE));
    const key = "codelens/cache2";
    const raw = storageService.get(key, StorageScope.WORKSPACE, "{}");
    this._deserialize(raw);
    const onWillSaveStateBecauseOfShutdown = Event.filter(storageService.onWillSaveState, (e) => e.reason === WillSaveStateReason.SHUTDOWN);
    Event.once(onWillSaveStateBecauseOfShutdown)((e) => {
      storageService.store(key, this._serialize(), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
  }
  put(model, data) {
    const copyItems = data.lenses.map((item2) => {
      return {
        range: item2.symbol.range,
        command: item2.symbol.command && { id: "", title: item2.symbol.command?.title }
      };
    });
    const copyModel = new CodeLensModel();
    copyModel.add({ lenses: copyItems }, this._fakeProvider);
    const item = new CacheItem(model.getLineCount(), copyModel);
    this._cache.set(model.uri.toString(), item);
  }
  get(model) {
    const item = this._cache.get(model.uri.toString());
    return item && item.lineCount === model.getLineCount() ? item.data : void 0;
  }
  delete(model) {
    this._cache.delete(model.uri.toString());
  }
  // --- persistence
  _serialize() {
    const data = /* @__PURE__ */ Object.create(null);
    for (const [key, value] of this._cache) {
      const lines = /* @__PURE__ */ new Set();
      for (const d of value.data.lenses) {
        lines.add(d.symbol.range.startLineNumber);
      }
      data[key] = {
        lineCount: value.lineCount,
        lines: [...lines.values()]
      };
    }
    return JSON.stringify(data);
  }
  _deserialize(raw) {
    try {
      const data = JSON.parse(raw);
      for (const key in data) {
        const element = data[key];
        const lenses = [];
        for (const line of element.lines) {
          lenses.push({ range: new Range(line, 1, line, 11) });
        }
        const model = new CodeLensModel();
        model.add({ lenses }, this._fakeProvider);
        this._cache.set(key, new CacheItem(element.lineCount, model));
      }
    } catch {
    }
  }
};
CodeLensCache = __decorateClass([
  __decorateParam(0, IStorageService)
], CodeLensCache);
registerSingleton(ICodeLensCache, CodeLensCache, InstantiationType.Delayed);
export {
  CodeLensCache,
  ICodeLensCache
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvZGVsZW5zXFxicm93c2VyXFxjb2RlTGVuc0NhY2hlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ29kZUxlbnMsIENvZGVMZW5zTGlzdCwgQ29kZUxlbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgQ29kZUxlbnNNb2RlbCB9IGZyb20gJy4vY29kZWxlbnMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0LCBXaWxsU2F2ZVN0YXRlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBydW5XaGVuV2luZG93SWRsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuXG5leHBvcnQgY29uc3QgSUNvZGVMZW5zQ2FjaGUgPSBjcmVhdGVEZWNvcmF0b3I8SUNvZGVMZW5zQ2FjaGU+KCdJQ29kZUxlbnNDYWNoZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlTGVuc0NhY2hlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwdXQobW9kZWw6IElUZXh0TW9kZWwsIGRhdGE6IENvZGVMZW5zTW9kZWwpOiB2b2lkO1xuXHRnZXQobW9kZWw6IElUZXh0TW9kZWwpOiBDb2RlTGVuc01vZGVsIHwgdW5kZWZpbmVkO1xuXHRkZWxldGUobW9kZWw6IElUZXh0TW9kZWwpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRDYWNoZURhdGEge1xuXHRsaW5lQ291bnQ6IG51bWJlcjtcblx0bGluZXM6IG51bWJlcltdO1xufVxuXG5jbGFzcyBDYWNoZUl0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGxpbmVDb3VudDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGRhdGE6IENvZGVMZW5zTW9kZWxcblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIENvZGVMZW5zQ2FjaGUgaW1wbGVtZW50cyBJQ29kZUxlbnNDYWNoZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZmFrZVByb3ZpZGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgQ29kZUxlbnNQcm92aWRlciB7XG5cdFx0cHJvdmlkZUNvZGVMZW5zZXMoKTogQ29kZUxlbnNMaXN0IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignbm90IHN1cHBvcnRlZCcpO1xuXHRcdH1cblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIENhY2hlSXRlbT4oMjAsIDAuNzUpO1xuXG5cdGNvbnN0cnVjdG9yKEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSkge1xuXG5cdFx0Ly8gcmVtb3ZlIG9sZCBkYXRhXG5cdFx0Y29uc3Qgb2xka2V5ID0gJ2NvZGVsZW5zL2NhY2hlJztcblx0XHRydW5XaGVuV2luZG93SWRsZShtYWluV2luZG93LCAoKSA9PiBzdG9yYWdlU2VydmljZS5yZW1vdmUob2xka2V5LCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSk7XG5cblx0XHQvLyByZXN0b3JlIGxlbnMgZGF0YSBvbiBzdGFydFxuXHRcdGNvbnN0IGtleSA9ICdjb2RlbGVucy9jYWNoZTInO1xuXHRcdGNvbnN0IHJhdyA9IHN0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICd7fScpO1xuXHRcdHRoaXMuX2Rlc2VyaWFsaXplKHJhdyk7XG5cblx0XHQvLyBzdG9yZSBsZW5zIGRhdGEgb24gc2h1dGRvd25cblx0XHRjb25zdCBvbldpbGxTYXZlU3RhdGVCZWNhdXNlT2ZTaHV0ZG93biA9IEV2ZW50LmZpbHRlcihzdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUsIGUgPT4gZS5yZWFzb24gPT09IFdpbGxTYXZlU3RhdGVSZWFzb24uU0hVVERPV04pO1xuXHRcdEV2ZW50Lm9uY2Uob25XaWxsU2F2ZVN0YXRlQmVjYXVzZU9mU2h1dGRvd24pKGUgPT4ge1xuXHRcdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoa2V5LCB0aGlzLl9zZXJpYWxpemUoKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1dChtb2RlbDogSVRleHRNb2RlbCwgZGF0YTogQ29kZUxlbnNNb2RlbCk6IHZvaWQge1xuXHRcdC8vIGNyZWF0ZSBhIGNvcHkgb2YgdGhlIG1vZGVsIHRoYXQgaXMgd2l0aG91dCBjb21tYW5kLWlkc1xuXHRcdC8vIGJ1dCB3aXRoIGNvbWFuZC1sYWJlbHNcblx0XHRjb25zdCBjb3B5SXRlbXMgPSBkYXRhLmxlbnNlcy5tYXAoKGl0ZW0pOiBDb2RlTGVucyA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyYW5nZTogaXRlbS5zeW1ib2wucmFuZ2UsXG5cdFx0XHRcdGNvbW1hbmQ6IGl0ZW0uc3ltYm9sLmNvbW1hbmQgJiYgeyBpZDogJycsIHRpdGxlOiBpdGVtLnN5bWJvbC5jb21tYW5kPy50aXRsZSB9LFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHRjb25zdCBjb3B5TW9kZWwgPSBuZXcgQ29kZUxlbnNNb2RlbCgpO1xuXHRcdGNvcHlNb2RlbC5hZGQoeyBsZW5zZXM6IGNvcHlJdGVtcyB9LCB0aGlzLl9mYWtlUHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgaXRlbSA9IG5ldyBDYWNoZUl0ZW0obW9kZWwuZ2V0TGluZUNvdW50KCksIGNvcHlNb2RlbCk7XG5cdFx0dGhpcy5fY2FjaGUuc2V0KG1vZGVsLnVyaS50b1N0cmluZygpLCBpdGVtKTtcblx0fVxuXG5cdGdldChtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9jYWNoZS5nZXQobW9kZWwudXJpLnRvU3RyaW5nKCkpO1xuXHRcdHJldHVybiBpdGVtICYmIGl0ZW0ubGluZUNvdW50ID09PSBtb2RlbC5nZXRMaW5lQ291bnQoKSA/IGl0ZW0uZGF0YSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGRlbGV0ZShtb2RlbDogSVRleHRNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhY2hlLmRlbGV0ZShtb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHQvLyAtLS0gcGVyc2lzdGVuY2VcblxuXHRwcml2YXRlIF9zZXJpYWxpemUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBkYXRhOiBSZWNvcmQ8c3RyaW5nLCBJU2VyaWFsaXplZENhY2hlRGF0YT4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMuX2NhY2hlKSB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xuXHRcdFx0Zm9yIChjb25zdCBkIG9mIHZhbHVlLmRhdGEubGVuc2VzKSB7XG5cdFx0XHRcdGxpbmVzLmFkZChkLnN5bWJvbC5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdFx0ZGF0YVtrZXldID0ge1xuXHRcdFx0XHRsaW5lQ291bnQ6IHZhbHVlLmxpbmVDb3VudCxcblx0XHRcdFx0bGluZXM6IFsuLi5saW5lcy52YWx1ZXMoKV1cblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeShkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rlc2VyaWFsaXplKHJhdzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRhdGE6IFJlY29yZDxzdHJpbmcsIElTZXJpYWxpemVkQ2FjaGVEYXRhPiA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIGRhdGEpIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IGRhdGFba2V5XTtcblx0XHRcdFx0Y29uc3QgbGVuc2VzOiBDb2RlTGVuc1tdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgbGluZSBvZiBlbGVtZW50LmxpbmVzKSB7XG5cdFx0XHRcdFx0bGVuc2VzLnB1c2goeyByYW5nZTogbmV3IFJhbmdlKGxpbmUsIDEsIGxpbmUsIDExKSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IENvZGVMZW5zTW9kZWwoKTtcblx0XHRcdFx0bW9kZWwuYWRkKHsgbGVuc2VzIH0sIHRoaXMuX2Zha2VQcm92aWRlcik7XG5cdFx0XHRcdHRoaXMuX2NhY2hlLnNldChrZXksIG5ldyBDYWNoZUl0ZW0oZWxlbWVudC5saW5lQ291bnQsIG1vZGVsKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBpZ25vcmUuLi5cblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUNvZGVMZW5zQ2FjaGUsIENvZGVMZW5zQ2FjaGUsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBR3RCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixjQUFjLGVBQWUsMkJBQTJCO0FBQ2xGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCO0FBRTNCLE1BQU0saUJBQWlCLGdCQUFnQyxnQkFBZ0I7QUFjOUUsTUFBTSxVQUFVO0FBQUEsRUFFZixZQUNVLFdBQ0EsTUFDUjtBQUZRO0FBQ0E7QUFBQSxFQUNOO0FBQ0w7QUFFTyxJQUFNLGdCQUFOLE1BQThDO0FBQUEsRUFZcEQsWUFBNkIsZ0JBQWlDO0FBUjlELFNBQWlCLGdCQUFnQixJQUFJLE1BQWtDO0FBQUEsTUFDdEUsb0JBQWtDO0FBQ2pD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
