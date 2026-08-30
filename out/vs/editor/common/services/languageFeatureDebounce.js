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
import { doHash } from "../../../base/common/hash.js";
import { LRUCache } from "../../../base/common/map.js";
import { clamp, MovingAverage, SlidingWindowAverage } from "../../../base/common/numbers.js";
import { IEnvironmentService } from "../../../platform/environment/common/environment.js";
import { InstantiationType, registerSingleton } from "../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { matchesScheme } from "../../../base/common/network.js";
const ILanguageFeatureDebounceService = createDecorator("ILanguageFeatureDebounceService");
var IdentityHash;
((IdentityHash2) => {
  const _hashes = /* @__PURE__ */ new WeakMap();
  let pool = 0;
  function of(obj) {
    let value = _hashes.get(obj);
    if (value === void 0) {
      value = ++pool;
      _hashes.set(obj, value);
    }
    return value;
  }
  IdentityHash2.of = of;
})(IdentityHash || (IdentityHash = {}));
class NullDebounceInformation {
  constructor(_default) {
    this._default = _default;
  }
  get(_model) {
    return this._default;
  }
  update(_model, _value) {
    return this._default;
  }
  default() {
    return this._default;
  }
}
class FeatureDebounceInformation {
  constructor(_logService, _name, _registry, _default, _min, _max) {
    this._logService = _logService;
    this._name = _name;
    this._registry = _registry;
    this._default = _default;
    this._min = _min;
    this._max = _max;
    this._cache = new LRUCache(50, 0.7);
  }
  _key(model) {
    return model.id + this._registry.all(model).reduce((hashVal, obj) => doHash(IdentityHash.of(obj), hashVal), 0);
  }
  get(model) {
    const key = this._key(model);
    const avg = this._cache.get(key);
    return avg ? clamp(avg.value, this._min, this._max) : this.default();
  }
  update(model, value) {
    const key = this._key(model);
    let avg = this._cache.get(key);
    if (!avg) {
      avg = new SlidingWindowAverage(6);
      this._cache.set(key, avg);
    }
    const newValue = clamp(avg.update(value), this._min, this._max);
    if (!matchesScheme(model.uri, "output")) {
      this._logService.trace(`[DEBOUNCE: ${this._name}] for ${model.uri.toString()} is ${newValue}ms`);
    }
    return newValue;
  }
  _overall() {
    const result = new MovingAverage();
    for (const [, avg] of this._cache) {
      result.update(avg.value);
    }
    return result.value;
  }
  default() {
    const value = this._overall() | 0 || this._default;
    return clamp(value, this._min, this._max);
  }
}
let LanguageFeatureDebounceService = class {
  constructor(_logService, envService) {
    this._logService = _logService;
    this._data = /* @__PURE__ */ new Map();
    this._isDev = envService.isExtensionDevelopment || !envService.isBuilt;
  }
  for(feature, name, config) {
    const min = config?.min ?? 50;
    const max = config?.max ?? min ** 2;
    const extra = config?.key ?? void 0;
    const key = `${IdentityHash.of(feature)},${min}${extra ? "," + extra : ""}`;
    let info = this._data.get(key);
    if (!info) {
      if (this._isDev) {
        this._logService.debug(`[DEBOUNCE: ${name}] is disabled in developed mode`);
        info = new NullDebounceInformation(min * 1.5);
      } else {
        info = new FeatureDebounceInformation(
          this._logService,
          name,
          feature,
          this._overallAverage() | 0 || min * 1.5,
          // default is overall default or derived from min-value
          min,
          max
        );
      }
      this._data.set(key, info);
    }
    return info;
  }
  _overallAverage() {
    const result = new MovingAverage();
    for (const info of this._data.values()) {
      result.update(info.default());
    }
    return result.value;
  }
};
LanguageFeatureDebounceService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IEnvironmentService)
], LanguageFeatureDebounceService);
registerSingleton(ILanguageFeatureDebounceService, LanguageFeatureDebounceService, InstantiationType.Delayed);
export {
  ILanguageFeatureDebounceService,
  LanguageFeatureDebounceService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcc2VydmljZXNcXGxhbmd1YWdlRmVhdHVyZURlYm91bmNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZG9IYXNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBjbGFtcCwgTW92aW5nQXZlcmFnZSwgU2xpZGluZ1dpbmRvd0F2ZXJhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uL21vZGVsLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc1NjaGVtZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuXG5cbmV4cG9ydCBjb25zdCBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2U+KCdJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGZvcihmZWF0dXJlOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxvYmplY3Q+LCBkZWJ1Z05hbWU6IHN0cmluZywgY29uZmlnPzogeyBtaW4/OiBudW1iZXI7IG1heD86IG51bWJlcjsgc2FsdD86IHN0cmluZyB9KTogSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiB7XG5cdGdldChtb2RlbDogSVRleHRNb2RlbCk6IG51bWJlcjtcblx0dXBkYXRlKG1vZGVsOiBJVGV4dE1vZGVsLCB2YWx1ZTogbnVtYmVyKTogbnVtYmVyO1xuXHRkZWZhdWx0KCk6IG51bWJlcjtcbn1cblxubmFtZXNwYWNlIElkZW50aXR5SGFzaCB7XG5cdGNvbnN0IF9oYXNoZXMgPSBuZXcgV2Vha01hcDxvYmplY3QsIG51bWJlcj4oKTtcblx0bGV0IHBvb2wgPSAwO1xuXHRleHBvcnQgZnVuY3Rpb24gb2Yob2JqOiBvYmplY3QpOiBudW1iZXIge1xuXHRcdGxldCB2YWx1ZSA9IF9oYXNoZXMuZ2V0KG9iaik7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHZhbHVlID0gKytwb29sO1xuXHRcdFx0X2hhc2hlcy5zZXQob2JqLCB2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5jbGFzcyBOdWxsRGVib3VuY2VJbmZvcm1hdGlvbiBpbXBsZW1lbnRzIElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdDogbnVtYmVyKSB7IH1cblxuXHRnZXQoX21vZGVsOiBJVGV4dE1vZGVsKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdDtcblx0fVxuXHR1cGRhdGUoX21vZGVsOiBJVGV4dE1vZGVsLCBfdmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHQ7XG5cdH1cblx0ZGVmYXVsdCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0O1xuXHR9XG59XG5cbmNsYXNzIEZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uIGltcGxlbWVudHMgSUZlYXR1cmVEZWJvdW5jZUluZm9ybWF0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYWNoZSA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIFNsaWRpbmdXaW5kb3dBdmVyYWdlPig1MCwgMC43KTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9uYW1lOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0cnk6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PG9iamVjdD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21pbjogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21heDogbnVtYmVyLFxuXHQpIHsgfVxuXG5cdHByaXZhdGUgX2tleShtb2RlbDogSVRleHRNb2RlbCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIG1vZGVsLmlkICsgdGhpcy5fcmVnaXN0cnkuYWxsKG1vZGVsKS5yZWR1Y2UoKGhhc2hWYWwsIG9iaikgPT4gZG9IYXNoKElkZW50aXR5SGFzaC5vZihvYmopLCBoYXNoVmFsKSwgMCk7XG5cdH1cblxuXHRnZXQobW9kZWw6IElUZXh0TW9kZWwpOiBudW1iZXIge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShtb2RlbCk7XG5cdFx0Y29uc3QgYXZnID0gdGhpcy5fY2FjaGUuZ2V0KGtleSk7XG5cdFx0cmV0dXJuIGF2Z1xuXHRcdFx0PyBjbGFtcChhdmcudmFsdWUsIHRoaXMuX21pbiwgdGhpcy5fbWF4KVxuXHRcdFx0OiB0aGlzLmRlZmF1bHQoKTtcblx0fVxuXG5cdHVwZGF0ZShtb2RlbDogSVRleHRNb2RlbCwgdmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5KG1vZGVsKTtcblx0XHRsZXQgYXZnID0gdGhpcy5fY2FjaGUuZ2V0KGtleSk7XG5cdFx0aWYgKCFhdmcpIHtcblx0XHRcdGF2ZyA9IG5ldyBTbGlkaW5nV2luZG93QXZlcmFnZSg2KTtcblx0XHRcdHRoaXMuX2NhY2hlLnNldChrZXksIGF2Zyk7XG5cdFx0fVxuXHRcdGNvbnN0IG5ld1ZhbHVlID0gY2xhbXAoYXZnLnVwZGF0ZSh2YWx1ZSksIHRoaXMuX21pbiwgdGhpcy5fbWF4KTtcblx0XHRpZiAoIW1hdGNoZXNTY2hlbWUobW9kZWwudXJpLCAnb3V0cHV0JykpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtERUJPVU5DRTogJHt0aGlzLl9uYW1lfV0gZm9yICR7bW9kZWwudXJpLnRvU3RyaW5nKCl9IGlzICR7bmV3VmFsdWV9bXNgKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ld1ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3ZlcmFsbCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNb3ZpbmdBdmVyYWdlKCk7XG5cdFx0Zm9yIChjb25zdCBbLCBhdmddIG9mIHRoaXMuX2NhY2hlKSB7XG5cdFx0XHRyZXN1bHQudXBkYXRlKGF2Zy52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQudmFsdWU7XG5cdH1cblxuXHRkZWZhdWx0KCkge1xuXHRcdGNvbnN0IHZhbHVlID0gKHRoaXMuX292ZXJhbGwoKSB8IDApIHx8IHRoaXMuX2RlZmF1bHQ7XG5cdFx0cmV0dXJuIGNsYW1wKHZhbHVlLCB0aGlzLl9taW4sIHRoaXMuX21heCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIGltcGxlbWVudHMgSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGF0YSA9IG5ldyBNYXA8c3RyaW5nLCBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzRGV2OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHRoaXMuX2lzRGV2ID0gZW52U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50IHx8ICFlbnZTZXJ2aWNlLmlzQnVpbHQ7XG5cdH1cblxuXHRmb3IoZmVhdHVyZTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8b2JqZWN0PiwgbmFtZTogc3RyaW5nLCBjb25maWc/OiB7IG1pbj86IG51bWJlcjsgbWF4PzogbnVtYmVyOyBrZXk/OiBzdHJpbmcgfSk6IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbiB7XG5cdFx0Y29uc3QgbWluID0gY29uZmlnPy5taW4gPz8gNTA7XG5cdFx0Y29uc3QgbWF4ID0gY29uZmlnPy5tYXggPz8gbWluICoqIDI7XG5cdFx0Y29uc3QgZXh0cmEgPSBjb25maWc/LmtleSA/PyB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qga2V5ID0gYCR7SWRlbnRpdHlIYXNoLm9mKGZlYXR1cmUpfSwke21pbn0ke2V4dHJhID8gJywnICsgZXh0cmEgOiAnJ31gO1xuXHRcdGxldCBpbmZvID0gdGhpcy5fZGF0YS5nZXQoa2V5KTtcblx0XHRpZiAoIWluZm8pIHtcblx0XHRcdGlmICh0aGlzLl9pc0Rldikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbREVCT1VOQ0U6ICR7bmFtZX1dIGlzIGRpc2FibGVkIGluIGRldmVsb3BlZCBtb2RlYCk7XG5cdFx0XHRcdGluZm8gPSBuZXcgTnVsbERlYm91bmNlSW5mb3JtYXRpb24obWluICogMS41KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluZm8gPSBuZXcgRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24oXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZSxcblx0XHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRcdGZlYXR1cmUsXG5cdFx0XHRcdFx0KHRoaXMuX292ZXJhbGxBdmVyYWdlKCkgfCAwKSB8fCAobWluICogMS41KSwgLy8gZGVmYXVsdCBpcyBvdmVyYWxsIGRlZmF1bHQgb3IgZGVyaXZlZCBmcm9tIG1pbi12YWx1ZVxuXHRcdFx0XHRcdG1pbixcblx0XHRcdFx0XHRtYXhcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2RhdGEuc2V0KGtleSwgaW5mbyk7XG5cdFx0fVxuXHRcdHJldHVybiBpbmZvO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3ZlcmFsbEF2ZXJhZ2UoKTogbnVtYmVyIHtcblx0XHQvLyBBdmVyYWdlIG9mIGFsbCBsYW5ndWFnZSBmZWF0dXJlcy4gTm90IGEgZ3JlYXQgdmFsdWUgYnV0IGFuIGFwcHJveGltYXRpb25cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTW92aW5nQXZlcmFnZSgpO1xuXHRcdGZvciAoY29uc3QgaW5mbyBvZiB0aGlzLl9kYXRhLnZhbHVlcygpKSB7XG5cdFx0XHRyZXN1bHQudXBkYXRlKGluZm8uZGVmYXVsdCgpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdC52YWx1ZTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLCBMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxPQUFPLGVBQWUsNEJBQTRCO0FBRzNELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQjtBQUd2QixNQUFNLGtDQUFrQyxnQkFBaUQsaUNBQWlDO0FBZWpJLElBQVU7QUFBQSxDQUFWLENBQVVBLGtCQUFWO0FBQ0MsUUFBTSxVQUFVLG9CQUFJLFFBQXdCO0FBQzVDLE1BQUksT0FBTztBQUNKLFdBQVMsR0FBRyxLQUFxQjtBQUN2QyxRQUFJLFFBQVEsUUFBUSxJQUFJLEdBQUc7QUFDM0IsUUFBSSxVQUFVLFFBQVc7QUFDeEIsY0FBUSxFQUFFO0FB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
