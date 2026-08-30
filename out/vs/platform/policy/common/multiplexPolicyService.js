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
import { Event } from "../../../base/common/event.js";
import { ILogService } from "../../log/common/log.js";
import { AbstractPolicyService } from "./policy.js";
let MultiplexPolicyService = class extends AbstractPolicyService {
  constructor(policyServices, logService) {
    super();
    this.policyServices = policyServices;
    this.logService = logService;
    this.updatePolicies();
    this._register(Event.any(...this.policyServices.map((service) => service.onDidChange))((names) => {
      this.updatePolicies();
      this._onDidChange.fire(names);
    }));
  }
  async updatePolicyDefinitions(policyDefinitions) {
    await this._updatePolicyDefinitions(policyDefinitions);
    return this.getPolicyValues();
  }
  async _updatePolicyDefinitions(policyDefinitions) {
    await Promise.all(this.policyServices.map((service) => service.updatePolicyDefinitions(policyDefinitions)));
    this.updatePolicies();
  }
  updatePolicies() {
    this.clearPolicyValues();
    const updated = [];
    for (const service of this.policyServices) {
      const definitions = service.policyDefinitions;
      for (const name in definitions) {
        const value = service.getPolicyValue(name);
        this.policyDefinitions[name] = definitions[name];
        if (value !== void 0) {
          updated.push(name);
          this.updatePolicyValue(name, value, service.getPolicyValueSource(name));
        }
      }
    }
    const changed = /* @__PURE__ */ new Set();
    for (const key of updated) {
      if (changed.has(key)) {
        this.logService.warn(`MultiplexPolicyService#_updatePolicyDefinitions - Found overlapping keys in policy services: ${key}`);
      }
      changed.add(key);
    }
  }
};
MultiplexPolicyService = __decorateClass([
  __decorateParam(1, ILogService)
], MultiplexPolicyService);
export {
  MultiplexPolicyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccG9saWN5XFxjb21tb25cXG11bHRpcGxleFBvbGljeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFBvbGljeVNlcnZpY2UsIElQb2xpY3lTZXJ2aWNlLCBQb2xpY3lEZWZpbml0aW9uLCBQb2xpY3lWYWx1ZSB9IGZyb20gJy4vcG9saWN5LmpzJztcblxuZXhwb3J0IGNsYXNzIE11bHRpcGxleFBvbGljeVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFBvbGljeVNlcnZpY2UgaW1wbGVtZW50cyBJUG9saWN5U2VydmljZSB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwb2xpY3lTZXJ2aWNlczogUmVhZG9ubHlBcnJheTxJUG9saWN5U2VydmljZT4sXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVwZGF0ZVBvbGljaWVzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KC4uLnRoaXMucG9saWN5U2VydmljZXMubWFwKHNlcnZpY2UgPT4gc2VydmljZS5vbkRpZENoYW5nZSkpKG5hbWVzID0+IHtcblx0XHRcdHRoaXMudXBkYXRlUG9saWNpZXMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUobmFtZXMpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHVwZGF0ZVBvbGljeURlZmluaXRpb25zKHBvbGljeURlZmluaXRpb25zOiBJU3RyaW5nRGljdGlvbmFyeTxQb2xpY3lEZWZpbml0aW9uPik6IFByb21pc2U8SVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5VmFsdWU+PiB7XG5cdFx0YXdhaXQgdGhpcy5fdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMocG9saWN5RGVmaW5pdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLmdldFBvbGljeVZhbHVlcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF91cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhwb2xpY3lEZWZpbml0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5RGVmaW5pdGlvbj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLnBvbGljeVNlcnZpY2VzLm1hcChzZXJ2aWNlID0+IHNlcnZpY2UudXBkYXRlUG9saWN5RGVmaW5pdGlvbnMocG9saWN5RGVmaW5pdGlvbnMpKSk7XG5cdFx0dGhpcy51cGRhdGVQb2xpY2llcygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQb2xpY2llcygpOiB2b2lkIHtcblx0XHR0aGlzLmNsZWFyUG9saWN5VmFsdWVzKCk7XG5cdFx0Y29uc3QgdXBkYXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlcnZpY2Ugb2YgdGhpcy5wb2xpY3lTZXJ2aWNlcykge1xuXHRcdFx0Y29uc3QgZGVmaW5pdGlvbnMgPSBzZXJ2aWNlLnBvbGljeURlZmluaXRpb25zO1xuXHRcdFx0Zm9yIChjb25zdCBuYW1lIGluIGRlZmluaXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gc2VydmljZS5nZXRQb2xpY3lWYWx1ZShuYW1lKTtcblx0XHRcdFx0dGhpcy5wb2xpY3lEZWZpbml0aW9uc1tuYW1lXSA9IGRlZmluaXRpb25zW25hbWVdO1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHVwZGF0ZWQucHVzaChuYW1lKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVBvbGljeVZhbHVlKG5hbWUsIHZhbHVlLCBzZXJ2aWNlLmdldFBvbGljeVZhbHVlU291cmNlKG5hbWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHRoYXQgbm8gcmVzdWx0cyBoYXZlIG92ZXJsYXBwaW5nIGtleXNcblx0XHRjb25zdCBjaGFuZ2VkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdXBkYXRlZCkge1xuXHRcdFx0aWYgKGNoYW5nZWQuaGFzKGtleSkpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYE11bHRpcGxleFBvbGljeVNlcnZpY2UjX3VwZGF0ZVBvbGljeURlZmluaXRpb25zIC0gRm91bmQgb3ZlcmxhcHBpbmcga2V5cyBpbiBwb2xpY3kgc2VydmljZXM6ICR7a2V5fWApO1xuXHRcdFx0fVxuXHRcdFx0Y2hhbmdlZC5hZGQoa2V5KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTRFO0FBRTlFLElBQU0seUJBQU4sY0FBcUMsc0JBQWdEO0FBQUEsRUFFM0YsWUFDa0IsZ0JBQ2EsWUFDN0I7QUFDRCxVQUFNO0FBSFc7QUFDYTtBQUk5QixTQUFLLGVBQWU7QUFDcEIsU0FBSyxVQUFVLE1BQU0sSUFBSSxHQUFHLEtBQUssZUFBZSxJQUFJLGFBQVcsUUFBUSxXQUFXLENBQUMsRUFBRSxXQUFTO0FBQzdGLFdBQUssZUFBZTtBQUNwQixXQUFLLGFBQWEsS0FBSyxLQUFLO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBZSx3QkFBd0IsbUJBQWlHO0FBQ3ZJLFVBQU0sS0FBSyx5QkFBeUIsaUJBQWlCO0FBQ3JELFdBQU8sS0FBSyxnQkFBZ0I7QUFBQSxFQUM3QjtBQUFBLEVBRUEsTUFBZ0IseUJBQXlCLG1CQUF1RTtBQUMvRyxVQUFNLFFBQVEsSUFBSSxLQUFLLGVBQWUsSUFBSSxhQUFXLFFBQVEsd0JBQXdCLGlCQUFpQixDQUFDLENBQUM7QUFDeEcsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVRLGlCQUF1QjtBQUM5QixTQUFLLGtCQUFrQjtBQUN2QixVQUFNLFVBQW9CLENBQUM7QUFDM0IsZUFBVyxXQUFXLEtBQUssZ0JBQWdCO0FBQzFDLFlBQU0sY0FBYyxRQUFRO0FBQzVCLGlCQUFXLFFBQVEsYUFBYTtBQUMvQixjQUFNLFFBQVEsUUFBUSxlQUFlLElBQUk7QUFDekMsYUFBSyxrQkFBa0IsSUFBSSxJQUFJLFlBQVksSUFBSTtBQUMvQyxZQUFJLFVBQVUsUUFBVztBQUN4QixrQkFBUSxLQUFLLElBQUk7QUFDakIsZUFBSyxrQkFBa0IsTUFBTSxPQUFPLFFBQVEscUJBQXFCLElBQUksQ0FBQztBQUFBLFFBQ3ZFO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxVQUFNLFVBQVUsb0JBQUksSUFBWTtBQUNoQyxlQUFXLE9BQU8sU0FBUztBQUMxQixVQUFJLFFBQVEsSUFBSSxHQUFHLEdBQUc7QUFDckIsYUFBSyxXQUFXLEtBQUssZ0dBQWdHLEdBQUcsRUFBRTtBQUFBLE1BQzNIO0FBQ0EsY0FBUSxJQUFJLEdBQUc7QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFDRDtBQWpEYSx5QkFBTjtBQUFBLEVBSUo7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
