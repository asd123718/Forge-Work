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
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { CodeBlockPart, CodeCompareBlockPart } from "./codeBlockPart.js";
import { ResourcePool, KeyedResourcePool } from "./chatCollections.js";
import { createSingleCallFunction } from "../../../../../../base/common/functional.js";
let EditorPool = class extends Disposable {
  constructor(options, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService) {
    super();
    this.isSimpleWidget = isSimpleWidget;
    this._pool = this._register(new KeyedResourcePool(() => {
      return instantiationService.createInstance(CodeBlockPart, options, MenuId.ChatCodeBlock, delegate, overflowWidgetsDomNode, this.isSimpleWidget);
    }, { maxIdleSize: 2 }));
  }
  inUse() {
    return this._pool.inUse;
  }
  get(key) {
    const codeBlock = this._pool.get(key);
    let stale = false;
    return {
      object: codeBlock,
      isStale: () => stale,
      dispose: createSingleCallFunction(() => {
        codeBlock.reset();
        stale = true;
        this._pool.release(codeBlock, key);
      })
    };
  }
  clear() {
    this._pool.clear();
  }
};
EditorPool = __decorateClass([
  __decorateParam(4, IInstantiationService)
], EditorPool);
let DiffEditorPool = class extends Disposable {
  constructor(options, delegate, overflowWidgetsDomNode, isSimpleWidget = false, instantiationService) {
    super();
    this.isSimpleWidget = isSimpleWidget;
    this._pool = this._register(new ResourcePool(() => {
      return instantiationService.createInstance(CodeCompareBlockPart, options, MenuId.ChatCompareBlock, delegate, overflowWidgetsDomNode, this.isSimpleWidget);
    }));
  }
  inUse() {
    return this._pool.inUse;
  }
  get() {
    const codeBlock = this._pool.get();
    let stale = false;
    return {
      object: codeBlock,
      isStale: () => stale,
      dispose: createSingleCallFunction(() => {
        codeBlock.reset();
        stale = true;
        this._pool.release(codeBlock);
      })
    };
  }
  clear() {
    this._pool.clear();
  }
};
DiffEditorPool = __decorateClass([
  __decorateParam(4, IInstantiationService)
], DiffEditorPool);
export {
  DiffEditorPool,
  EditorPool
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdENvbnRlbnRDb2RlUG9vbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyRGVsZWdhdGUgfSBmcm9tICcuLi9jaGF0TGlzdFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vY2hhdE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kZUJsb2NrUGFydCwgQ29kZUNvbXBhcmVCbG9ja1BhcnQgfSBmcm9tICcuL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VQb29sLCBLZXllZFJlc291cmNlUG9vbCwgSURpc3Bvc2FibGVSZWZlcmVuY2UgfSBmcm9tICcuL2NoYXRDb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcblxuZXhwb3J0IGNsYXNzIEVkaXRvclBvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wb29sOiBLZXllZFJlc291cmNlUG9vbDxDb2RlQmxvY2tQYXJ0PjtcblxuXHRpblVzZSgpOiBJdGVyYWJsZTxDb2RlQmxvY2tQYXJ0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Bvb2wuaW5Vc2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBDaGF0RWRpdG9yT3B0aW9ucyxcblx0XHRkZWxlZ2F0ZTogSUNoYXRSZW5kZXJlckRlbGVnYXRlLFxuXHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaXNTaW1wbGVXaWRnZXQ6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcG9vbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBLZXllZFJlc291cmNlUG9vbCgoKSA9PiB7XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUJsb2NrUGFydCwgb3B0aW9ucywgTWVudUlkLkNoYXRDb2RlQmxvY2ssIGRlbGVnYXRlLCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlLCB0aGlzLmlzU2ltcGxlV2lkZ2V0KTtcblx0XHR9LCB7IG1heElkbGVTaXplOiAyIH0pKTtcblx0fVxuXG5cdGdldChrZXk6IHN0cmluZyk6IElEaXNwb3NhYmxlUmVmZXJlbmNlPENvZGVCbG9ja1BhcnQ+IHtcblx0XHRjb25zdCBjb2RlQmxvY2sgPSB0aGlzLl9wb29sLmdldChrZXkpO1xuXHRcdGxldCBzdGFsZSA9IGZhbHNlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IGNvZGVCbG9jayxcblx0XHRcdGlzU3RhbGU6ICgpID0+IHN0YWxlLFxuXHRcdFx0ZGlzcG9zZTogY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKCgpID0+IHtcblx0XHRcdFx0Y29kZUJsb2NrLnJlc2V0KCk7XG5cdFx0XHRcdHN0YWxlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fcG9vbC5yZWxlYXNlKGNvZGVCbG9jaywga2V5KTtcblx0XHRcdH0pXG5cdFx0fTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Bvb2wuY2xlYXIoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlmZkVkaXRvclBvb2wgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wb29sOiBSZXNvdXJjZVBvb2w8Q29kZUNvbXBhcmVCbG9ja1BhcnQ+O1xuXG5cdHB1YmxpYyBpblVzZSgpOiBJdGVyYWJsZTxDb2RlQ29tcGFyZUJsb2NrUGFydD4ge1xuXHRcdHJldHVybiB0aGlzLl9wb29sLmluVXNlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogQ2hhdEVkaXRvck9wdGlvbnMsXG5cdFx0ZGVsZWdhdGU6IElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSxcblx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlzU2ltcGxlV2lkZ2V0OiBib29sZWFuID0gZmFsc2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Bvb2wgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVzb3VyY2VQb29sKCgpID0+IHtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlQ29tcGFyZUJsb2NrUGFydCwgb3B0aW9ucywgTWVudUlkLkNoYXRDb21wYXJlQmxvY2ssIGRlbGVnYXRlLCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlLCB0aGlzLmlzU2ltcGxlV2lkZ2V0KTtcblx0XHR9KSk7XG5cdH1cblxuXHRnZXQoKTogSURpc3Bvc2FibGVSZWZlcmVuY2U8Q29kZUNvbXBhcmVCbG9ja1BhcnQ+IHtcblx0XHRjb25zdCBjb2RlQmxvY2sgPSB0aGlzLl9wb29sLmdldCgpO1xuXHRcdGxldCBzdGFsZSA9IGZhbHNlO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IGNvZGVCbG9jayxcblx0XHRcdGlzU3RhbGU6ICgpID0+IHN0YWxlLFxuXHRcdFx0ZGlzcG9zZTogY3JlYXRlU2luZ2xlQ2FsbEZ1bmN0aW9uKCgpID0+IHtcblx0XHRcdFx0Y29kZUJsb2NrLnJlc2V0KCk7XG5cdFx0XHRcdHN0YWxlID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fcG9vbC5yZWxlYXNlKGNvZGVCbG9jayk7XG5cdFx0XHR9KVxuXHRcdH07XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9wb29sLmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsZUFBZSw0QkFBNEI7QUFDcEQsU0FBUyxjQUFjLHlCQUErQztBQUN0RSxTQUFTLGdDQUFnQztBQUVsQyxJQUFNLGFBQU4sY0FBeUIsV0FBVztBQUFBLEVBUTFDLFlBQ0MsU0FDQSxVQUNBLHdCQUNpQixpQkFBMEIsT0FDcEIsc0JBQ3RCO0FBQ0QsVUFBTTtBQUhXO0FBSWpCLFNBQUssUUFBUSxLQUFLLFVBQVUsSUFBSSxrQkFBa0IsTUFBTTtBQUN2RCxhQUFPLHFCQUFxQixlQUFlLGVBQWUsU0FBUyxPQUFPLGVBQWUsVUFBVSx3QkFBd0IsS0FBSyxjQUFjO0FBQUEsSUFDL0ksR0FBRyxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7QUFBQSxFQUN2QjtBQUFBLEVBZkEsUUFBaUM7QUFDaEMsV0FBTyxLQUFLLE1BQU07QUFBQSxFQUNuQjtBQUFBLEVBZUEsSUFBSSxLQUFrRDtBQUNyRCxVQUFNLFlBQVksS0FBSyxNQUFNLElBQUksR0FBRztBQUNwQyxRQUFJLFFBQVE7QUFDWixXQUFPO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixTQUFTLE1BQU07QUFBQSxNQUNmLFNBQVMseUJBQXlCLE1BQU07QUFDdkMsa0JBQVUsTUFBTTtBQUNoQixnQkFBUTtBQUNSLGFBQUssTUFBTSxRQUFRLFdBQVcsR0FBRztBQUFBLE1BQ2xDLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsUUFBYztBQUNiLFNBQUssTUFBTSxNQUFNO0FBQUEsRUFDbEI7QUFDRDtBQXRDYSxhQUFOO0FBQUEsRUFhSjtBQUFBLEdBYlU7QUF3Q04sSUFBTSxpQkFBTixjQUE2QixXQUFXO0FBQUEsRUFROUMsWUFDQyxTQUNBLFVBQ0Esd0JBQ2lCLGlCQUEwQixPQUNwQixzQkFDdEI7QUFDRCxVQUFNO0FBSFc7QUFJakIsU0FBSyxRQUFRLEtBQUssVUFBVSxJQUFJLGFBQWEsTUFBTTtBQUNsRCxhQUFPLHFCQUFxQixlQUFlLHNCQUFzQixTQUFTLE9BQU8sa0JBQWtCLFVBQVUsd0JBQXdCLEtBQUssY0FBYztBQUFBLElBQ3pKLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQWZPLFFBQXdDO0FBQzlDLFdBQU8sS0FBSyxNQUFNO0FBQUEsRUFDbkI7QUFBQSxFQWVBLE1BQWtEO0FBQ2pELFVBQU0sWUFBWSxLQUFLLE1BQU0sSUFBSTtBQUNqQyxRQUFJLFFBQVE7QUFDWixXQUFPO0FBQUEsTUFDTixRQUFRO0FBQUEsTUFDUixTQUFTLE1BQU07QUFBQSxNQUNmLFNBQVMseUJBQXlCLE1BQU07QUFDdkMsa0JBQVUsTUFBTTtBQUNoQixnQkFBUTtBQUNSLGFBQUssTUFBTSxRQUFRLFNBQVM7QUFBQSxNQUM3QixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLE1BQU0sTUFBTTtBQUFBLEVBQ2xCO0FBQ0Q7QUF0Q2EsaUJBQU47QUFBQSxFQWFKO0FBQUEsR0FiVTsiLAogICJuYW1lcyI6IFtdCn0K
