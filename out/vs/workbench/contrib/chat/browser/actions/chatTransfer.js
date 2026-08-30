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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { IChatTransferService } from "../../common/model/chatTransferService.js";
let ChatTransferContribution = class extends Disposable {
  constructor(chatTransferService) {
    super();
    chatTransferService.checkAndSetTransferredWorkspaceTrust();
  }
};
ChatTransferContribution.ID = "workbench.contrib.chatTransfer";
ChatTransferContribution = __decorateClass([
  __decorateParam(0, IChatTransferService)
], ChatTransferContribution);
export {
  ChatTransferContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRUcmFuc2Zlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDaGF0VHJhbnNmZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRUcmFuc2ZlclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdFRyYW5zZmVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFRyYW5zZmVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRUcmFuc2ZlclNlcnZpY2UgY2hhdFRyYW5zZmVyU2VydmljZTogSUNoYXRUcmFuc2ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y2hhdFRyYW5zZmVyU2VydmljZS5jaGVja0FuZFNldFRyYW5zZmVycmVkV29ya3NwYWNlVHJ1c3QoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDRCQUE0QjtBQUU5QixJQUFNLDJCQUFOLGNBQXVDLFdBQTZDO0FBQUEsRUFHMUYsWUFDdUIscUJBQ3JCO0FBQ0QsVUFBTTtBQUNOLHdCQUFvQixxQ0FBcUM7QUFBQSxFQUMxRDtBQUNEO0FBVGEseUJBQ0ksS0FBSztBQURULDJCQUFOO0FBQUEsRUFJSjtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
