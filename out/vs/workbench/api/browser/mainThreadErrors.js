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
import { onUnexpectedError, transformErrorFromSerialization } from "../../../base/common/errors.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
let MainThreadErrors = class {
  dispose() {
  }
  $onUnexpectedError(err) {
    if (err?.$isError) {
      err = transformErrorFromSerialization(err);
    }
    onUnexpectedError(err);
  }
};
MainThreadErrors = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadErrors)
], MainThreadErrors);
export {
  MainThreadErrors
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZEVycm9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNlcmlhbGl6ZWRFcnJvciwgb25VbmV4cGVjdGVkRXJyb3IsIHRyYW5zZm9ybUVycm9yRnJvbVNlcmlhbGl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IE1haW5Db250ZXh0LCBNYWluVGhyZWFkRXJyb3JzU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkRXJyb3JzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRFcnJvcnMgaW1wbGVtZW50cyBNYWluVGhyZWFkRXJyb3JzU2hhcGUge1xuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly9cblx0fVxuXG5cdCRvblVuZXhwZWN0ZWRFcnJvcihlcnI6IHVua25vd24gfCBTZXJpYWxpemVkRXJyb3IpOiB2b2lkIHtcblx0XHRpZiAoKGVyciBhcyBTZXJpYWxpemVkRXJyb3IgfCB1bmRlZmluZWQpPy4kaXNFcnJvcikge1xuXHRcdFx0ZXJyID0gdHJhbnNmb3JtRXJyb3JGcm9tU2VyaWFsaXphdGlvbihlcnIgYXMgU2VyaWFsaXplZEVycm9yKTtcblx0XHR9XG5cdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQTBCLG1CQUFtQix1Q0FBdUM7QUFDcEYsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQkFBMEM7QUFHNUMsSUFBTSxtQkFBTixNQUF3RDtBQUFBLEVBRTlELFVBQWdCO0FBQUEsRUFFaEI7QUFBQSxFQUVBLG1CQUFtQixLQUFzQztBQUN4RCxRQUFLLEtBQXFDLFVBQVU7QUFDbkQsWUFBTSxnQ0FBZ0MsR0FBc0I7QUFBQSxJQUM3RDtBQUNBLHNCQUFrQixHQUFHO0FBQUEsRUFDdEI7QUFDRDtBQVphLG1CQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxnQkFBZ0I7QUFBQSxHQUNyQzsiLAogICJuYW1lcyI6IFtdCn0K
