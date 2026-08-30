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
import { Disposable } from "../../../base/common/lifecycle.js";
import { IChatStatusItemService } from "../../contrib/chat/browser/chatStatus/chatStatusItemService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
let MainThreadChatStatus = class extends Disposable {
  constructor(_extHostContext, _chatStatusItemService) {
    super();
    this._chatStatusItemService = _chatStatusItemService;
  }
  $setEntry(id, entry) {
    this._chatStatusItemService.setOrUpdateEntry({
      id,
      label: entry.title,
      description: entry.description,
      detail: entry.detail,
      tooltip: entry.tooltip
    });
  }
  $disposeEntry(id) {
    this._chatStatusItemService.deleteEntry(id);
  }
};
MainThreadChatStatus = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatStatus),
  __decorateParam(1, IChatStatusItemService)
], MainThreadChatStatus);
export {
  MainThreadChatStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZENoYXRTdGF0dXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDaGF0U3RhdHVzSXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3RhdHVzL2NoYXRTdGF0dXNJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQsIGV4dEhvc3ROYW1lZEN1c3RvbWVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBDaGF0U3RhdHVzSXRlbUR0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDaGF0U3RhdHVzU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkQ2hhdFN0YXR1cylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQ2hhdFN0YXR1cyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkQ2hhdFN0YXR1c1NoYXBlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRfZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUNoYXRTdGF0dXNJdGVtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U3RhdHVzSXRlbVNlcnZpY2U6IElDaGF0U3RhdHVzSXRlbVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQkc2V0RW50cnkoaWQ6IHN0cmluZywgZW50cnk6IENoYXRTdGF0dXNJdGVtRHRvKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLnNldE9yVXBkYXRlRW50cnkoe1xuXHRcdFx0aWQsXG5cdFx0XHRsYWJlbDogZW50cnkudGl0bGUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZW50cnkuZGVzY3JpcHRpb24sXG5cdFx0XHRkZXRhaWw6IGVudHJ5LmRldGFpbCxcblx0XHRcdHRvb2x0aXA6IGVudHJ5LnRvb2x0aXAsXG5cdFx0fSk7XG5cdH1cblxuXHQkZGlzcG9zZUVudHJ5KGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0U3RhdHVzSXRlbVNlcnZpY2UuZGVsZXRlRW50cnkoaWQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQTBCLDRCQUE0QjtBQUN0RCxTQUE0QixtQkFBOEM7QUFHbkUsSUFBTSx1QkFBTixjQUFtQyxXQUFnRDtBQUFBLEVBRXpGLFlBQ0MsaUJBQ3lDLHdCQUN4QztBQUNELFVBQU07QUFGbUM7QUFBQSxFQUcxQztBQUFBLEVBRUEsVUFBVSxJQUFZLE9BQWdDO0FBQ3JELFNBQUssdUJBQXVCLGlCQUFpQjtBQUFBLE1BQzVDO0FBQUEsTUFDQSxPQUFPLE1BQU07QUFBQSxNQUNiLGFBQWEsTUFBTTtBQUFBLE1BQ25CLFFBQVEsTUFBTTtBQUFBLE1BQ2QsU0FBUyxNQUFNO0FBQUEsSUFDaEIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGNBQWMsSUFBa0I7QUFDL0IsU0FBSyx1QkFBdUIsWUFBWSxFQUFFO0FBQUEsRUFDM0M7QUFDRDtBQXRCYSx1QkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVksb0JBQW9CO0FBQUEsRUFLbkQ7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
