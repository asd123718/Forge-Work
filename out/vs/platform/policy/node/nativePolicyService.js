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
import { AbstractPolicyService } from "../common/policy.js";
import { Throttler } from "../../../base/common/async.js";
import { MutableDisposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
let NativePolicyService = class extends AbstractPolicyService {
  constructor(logService, productName) {
    super();
    this.logService = logService;
    this.productName = productName;
    this.throttler = this._register(new Throttler());
    this.watcher = this._register(new MutableDisposable());
  }
  async _updatePolicyDefinitions(policyDefinitions) {
    this.logService.trace(`NativePolicyService#_updatePolicyDefinitions - Found ${Object.keys(policyDefinitions).length} policy definitions`);
    const { createWatcher } = await import("@vscode/policy-watcher");
    await this.throttler.queue(() => new Promise((c, e) => {
      try {
        this.logService.trace(`Creating watcher for productName ${this.productName}`);
        this.watcher.value = createWatcher(this.productName, policyDefinitions, (update) => {
          this._onDidPolicyChange(update);
          c();
        });
      } catch (err) {
        this.logService.error(`NativePolicyService#_updatePolicyDefinitions - Error creating watcher:`, err);
        e(err);
      }
    }));
  }
  _onDidPolicyChange(update) {
    this.logService.trace(`NativePolicyService#_onDidPolicyChange - Updated policy values: ${JSON.stringify(update)}`);
    for (const key in update) {
      const value = update[key];
      if (value === void 0) {
        this.policies.delete(key);
      } else {
        this.policies.set(key, value);
      }
    }
    this._onDidChange.fire(Object.keys(update));
  }
};
NativePolicyService = __decorateClass([
  __decorateParam(0, ILogService)
], NativePolicyService);
export {
  NativePolicyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccG9saWN5XFxub2RlXFxuYXRpdmVQb2xpY3lTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlLCBJUG9saWN5U2VydmljZSwgUG9saWN5RGVmaW5pdGlvbiwgUG9saWN5VmFsdWUgfSBmcm9tICcuLi9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHR5cGUgeyBQb2xpY3lVcGRhdGUsIFdhdGNoZXIgfSBmcm9tICdAdnNjb2RlL3BvbGljeS13YXRjaGVyJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlUG9saWN5U2VydmljZSBleHRlbmRzIEFic3RyYWN0UG9saWN5U2VydmljZSBpbXBsZW1lbnRzIElQb2xpY3lTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgd2F0Y2hlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxXYXRjaGVyPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3ROYW1lOiBzdHJpbmdcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMocG9saWN5RGVmaW5pdGlvbnM6IElTdHJpbmdEaWN0aW9uYXJ5PFBvbGljeURlZmluaXRpb24+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBOYXRpdmVQb2xpY3lTZXJ2aWNlI191cGRhdGVQb2xpY3lEZWZpbml0aW9ucyAtIEZvdW5kICR7T2JqZWN0LmtleXMocG9saWN5RGVmaW5pdGlvbnMpLmxlbmd0aH0gcG9saWN5IGRlZmluaXRpb25zYCk7XG5cblx0XHRjb25zdCB7IGNyZWF0ZVdhdGNoZXIgfSA9IGF3YWl0IGltcG9ydCgnQHZzY29kZS9wb2xpY3ktd2F0Y2hlcicpO1xuXG5cdFx0YXdhaXQgdGhpcy50aHJvdHRsZXIucXVldWUoKCkgPT4gbmV3IFByb21pc2U8dm9pZD4oKGMsIGUpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ3JlYXRpbmcgd2F0Y2hlciBmb3IgcHJvZHVjdE5hbWUgJHt0aGlzLnByb2R1Y3ROYW1lfWApO1xuXHRcdFx0XHR0aGlzLndhdGNoZXIudmFsdWUgPSBjcmVhdGVXYXRjaGVyKHRoaXMucHJvZHVjdE5hbWUsIHBvbGljeURlZmluaXRpb25zLCB1cGRhdGUgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUG9saWN5Q2hhbmdlKHVwZGF0ZSk7XG5cdFx0XHRcdFx0YygpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYE5hdGl2ZVBvbGljeVNlcnZpY2UjX3VwZGF0ZVBvbGljeURlZmluaXRpb25zIC0gRXJyb3IgY3JlYXRpbmcgd2F0Y2hlcjpgLCBlcnIpO1xuXHRcdFx0XHRlKGVycik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRQb2xpY3lDaGFuZ2UodXBkYXRlOiBQb2xpY3lVcGRhdGU8SVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5RGVmaW5pdGlvbj4+KTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBOYXRpdmVQb2xpY3lTZXJ2aWNlI19vbkRpZFBvbGljeUNoYW5nZSAtIFVwZGF0ZWQgcG9saWN5IHZhbHVlczogJHtKU09OLnN0cmluZ2lmeSh1cGRhdGUpfWApO1xuXG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gdXBkYXRlIGFzIFJlY29yZDxzdHJpbmcsIFBvbGljeVZhbHVlIHwgdW5kZWZpbmVkPikge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB1cGRhdGVba2V5XTtcblxuXHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5wb2xpY2llcy5kZWxldGUoa2V5KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMucG9saWNpZXMuc2V0KGtleSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoT2JqZWN0LmtleXModXBkYXRlKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw2QkFBNEU7QUFFckYsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFFckIsSUFBTSxzQkFBTixjQUFrQyxzQkFBZ0Q7QUFBQSxFQUt4RixZQUMrQixZQUNiLGFBQ2hCO0FBQ0QsVUFBTTtBQUh3QjtBQUNiO0FBTGxCLFNBQVEsWUFBWSxLQUFLLFVBQVUsSUFBSSxVQUFVLENBQUM7QUFDbEQsU0FBaUIsVUFBVSxLQUFLLFVBQVUsSUFBSSxrQkFBMkIsQ0FBQztBQUFBLEVBTzFFO0FBQUEsRUFFQSxNQUFnQix5QkFBeUIsbUJBQXVFO0FBQy9HLFNBQUssV0FBVyxNQUFNLHdEQUF3RCxPQUFPLEtBQUssaUJBQWlCLEVBQUUsTUFBTSxxQkFBcUI7QUFFeEksVUFBTSxFQUFFLGNBQWMsSUFBSSxNQUFNLE9BQU8sd0JBQXdCO0FBRS9ELFVBQU0sS0FBSyxVQUFVLE1BQU0sTUFBTSxJQUFJLFFBQWMsQ0FBQyxHQUFHLE1BQU07QUFDNUQsVUFBSTtBQUNILGFBQUssV0FBVyxNQUFNLG9DQUFvQyxLQUFLLFdBQVcsRUFBRTtBQUM1RSxhQUFLLFFBQVEsUUFBUSxjQUFjLEtBQUssYUFBYSxtQkFBbUIsWUFBVTtBQUNqRixlQUFLLG1CQUFtQixNQUFNO0FBQzlCLFlBQUU7QUFBQSxRQUNILENBQUM7QUFBQSxNQUNGLFNBQVMsS0FBSztBQUNiLGFBQUssV0FBVyxNQUFNLDBFQUEwRSxHQUFHO0FBQ25HLFVBQUUsR0FBRztBQUFBLE1BQ047QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLG1CQUFtQixRQUFpRTtBQUMzRixTQUFLLFdBQVcsTUFBTSxtRUFBbUUsS0FBSyxVQUFVLE1BQU0sQ0FBQyxFQUFFO0FBRWpILGVBQVcsT0FBTyxRQUFtRDtBQUNwRSxZQUFNLFFBQVEsT0FBTyxHQUFHO0FBRXhCLFVBQUksVUFBVSxRQUFXO0FBQ3hCLGFBQUssU0FBUyxPQUFPLEdBQUc7QUFBQSxNQUN6QixPQUFPO0FBQ04sYUFBSyxTQUFTLElBQUksS0FBSyxLQUFLO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBRUEsU0FBSyxhQUFhLEtBQUssT0FBTyxLQUFLLE1BQU0sQ0FBQztBQUFBLEVBQzNDO0FBQ0Q7QUE5Q2Esc0JBQU47QUFBQSxFQU1KO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
