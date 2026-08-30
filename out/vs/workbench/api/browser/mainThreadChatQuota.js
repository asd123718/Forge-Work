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
import { IChatEntitlementService } from "../../services/chat/common/chatEntitlementService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
let MainThreadChatQuota = class extends Disposable {
  constructor(extHostContext, _chatEntitlementService) {
    super();
    this._chatEntitlementService = _chatEntitlementService;
  }
  $updateQuotas(quotas) {
    this._chatEntitlementService.acceptQuotas({ ...this._chatEntitlementService.quotas, ...quotas });
  }
};
MainThreadChatQuota = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatQuota),
  __decorateParam(1, IChatEntitlementService)
], MainThreadChatQuota);
export {
  MainThreadChatQuota
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZENoYXRRdW90YS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCwgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IElRdW90YVNuYXBzaG90c0R0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDaGF0UXVvdGFTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRDaGF0UXVvdGEpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZENoYXRRdW90YSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkQ2hhdFF1b3RhU2hhcGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0JHVwZGF0ZVF1b3RhcyhxdW90YXM6IElRdW90YVNuYXBzaG90c0R0byk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuYWNjZXB0UXVvdGFzKHsgLi4udGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5xdW90YXMsIC4uLnF1b3RhcyB9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLCtCQUErQjtBQUN4QyxTQUEwQiw0QkFBNEI7QUFDdEQsU0FBNkIsbUJBQTZDO0FBR25FLElBQU0sc0JBQU4sY0FBa0MsV0FBK0M7QUFBQSxFQUV2RixZQUNDLGdCQUMwQyx5QkFDekM7QUFDRCxVQUFNO0FBRm9DO0FBQUEsRUFHM0M7QUFBQSxFQUVBLGNBQWMsUUFBa0M7QUFDL0MsU0FBSyx3QkFBd0IsYUFBYSxFQUFFLEdBQUcsS0FBSyx3QkFBd0IsUUFBUSxHQUFHLE9BQU8sQ0FBQztBQUFBLEVBQ2hHO0FBQ0Q7QUFaYSxzQkFBTjtBQUFBLEVBRE4scUJBQXFCLFlBQVksbUJBQW1CO0FBQUEsRUFLbEQ7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
