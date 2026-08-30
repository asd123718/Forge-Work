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
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IChatAgentService } from "../../../chat/common/participants/chatAgents.js";
import { ChatAgentLocation } from "../../../chat/common/constants.js";
import { TerminalChatContextKeys } from "./terminalChat.js";
let TerminalChatEnabler = class {
  constructor(chatAgentService, contextKeyService) {
    this._store = new DisposableStore();
    this._ctxHasProvider = TerminalChatContextKeys.hasChatAgent.bindTo(contextKeyService);
    this._store.add(Event.runAndSubscribe(chatAgentService.onDidChangeAgents, () => {
      const hasTerminalAgent = Boolean(chatAgentService.getDefaultAgent(ChatAgentLocation.Terminal));
      this._ctxHasProvider.set(hasTerminalAgent);
    }));
  }
  dispose() {
    this._ctxHasProvider.reset();
    this._store.dispose();
  }
};
TerminalChatEnabler.Id = "terminalChat.enabler";
TerminalChatEnabler = __decorateClass([
  __decorateParam(0, IChatAgentService),
  __decorateParam(1, IContextKeyService)
], TerminalChatEnabler);
export {
  TerminalChatEnabler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdFxcYnJvd3NlclxcdGVybWluYWxDaGF0RW5hYmxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuL3Rlcm1pbmFsQ2hhdC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbENoYXRFbmFibGVyIHtcblxuXHRzdGF0aWMgSWQgPSAndGVybWluYWxDaGF0LmVuYWJsZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eEhhc1Byb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9jdHhIYXNQcm92aWRlciA9IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLmhhc0NoYXRBZ2VudC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUoY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGFzVGVybWluYWxBZ2VudCA9IEJvb2xlYW4oY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uVGVybWluYWwpKTtcblx0XHRcdHRoaXMuX2N0eEhhc1Byb3ZpZGVyLnNldChoYXNUZXJtaW5hbEFnZW50KTtcblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2N0eEhhc1Byb3ZpZGVyLnJlc2V0KCk7XG5cdFx0dGhpcy5fc3RvcmUuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQkFBK0I7QUFFakMsSUFBTSxzQkFBTixNQUEwQjtBQUFBLEVBUWhDLFlBQ29CLGtCQUNDLG1CQUNuQjtBQUxGLFNBQWlCLFNBQVMsSUFBSSxnQkFBZ0I7QUFNN0MsU0FBSyxrQkFBa0Isd0JBQXdCLGFBQWEsT0FBTyxpQkFBaUI7QUFDcEYsU0FBSyxPQUFPLElBQUksTUFBTSxnQkFBZ0IsaUJBQWlCLG1CQUFtQixNQUFNO0FBQy9FLFlBQU0sbUJBQW1CLFFBQVEsaUJBQWlCLGdCQUFnQixrQkFBa0IsUUFBUSxDQUFDO0FBQzdGLFdBQUssZ0JBQWdCLElBQUksZ0JBQWdCO0FBQUEsSUFDMUMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsVUFBVTtBQUNULFNBQUssZ0JBQWdCLE1BQU07QUFDM0IsU0FBSyxPQUFPLFFBQVE7QUFBQSxFQUNyQjtBQUNEO0FBdkJhLG9CQUVMLEtBQUs7QUFGQSxzQkFBTjtBQUFBLEVBU0o7QUFBQSxFQUNBO0FBQUEsR0FWVTsiLAogICJuYW1lcyI6IFtdCn0K
