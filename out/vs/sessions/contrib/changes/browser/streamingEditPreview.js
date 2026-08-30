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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { LiveEditPreviewController } from "../../../../workbench/contrib/chat/browser/agentSessions/agentHost/liveEditPreview.js";
import { isIChatSessionFileChange2 } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { isActiveSessionStatus } from "../../../services/sessions/common/session.js";
import { buildStreamingEditAnimation, buildStreamingEditFrames, DialecticLiveEditSlotMap, liveEditPreviewShouldOpenEditor, liveEditPreviewUsesSplit } from "../../../../workbench/contrib/chat/browser/agentSessions/agentHost/liveEditPreview.js";
let StreamingEditPreviewContribution = class extends Disposable {
  constructor(sessionsService, instantiationService) {
    super();
    this._seenRevisions = /* @__PURE__ */ new Map();
    this._turnSequence = 0;
    this._wasActive = false;
    this._controller = this._register(instantiationService.createInstance(LiveEditPreviewController));
    this._register(autorun((reader) => {
      const session = sessionsService.activeSession.read(reader);
      const chat = session?.activeChat.read(reader);
      const status = chat?.status.read(reader);
      const chatKey = session && chat ? `${session.resource.toString()}\0${chat.resource.toString()}` : void 0;
      if (!session || !chat || !chatKey || status === void 0) {
        return;
      }
      if (this._activeChatKey !== chatKey) {
        this._activeChatKey = chatKey;
        this._turnSequence = 0;
        this._wasActive = false;
      }
      const isActive = isActiveSessionStatus(status);
      if (isActive && !this._wasActive) {
        this._turnSequence++;
      }
      this._wasActive = isActive;
      const contextKey = `${chatKey}\0${this._turnSequence}`;
      if (this._activeContextKey !== contextKey) {
        this._activeContextKey = contextKey;
        this._seenRevisions.clear();
        this._controller.setContext(contextKey);
      }
      if (!isActive) {
        this._controller.finishContext(contextKey);
        return;
      }
      let focused = this._seenRevisions.size > 0;
      for (const change of chat.lastTurnChanges?.read(reader) ?? []) {
        const snapshotUri = change.modifiedSnapshotUri;
        if (!snapshotUri) {
          continue;
        }
        const resource = isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
        if (this._seenRevisions.get(resource.toString()) === snapshotUri.toString()) {
          continue;
        }
        this._seenRevisions.set(resource.toString(), snapshotUri.toString());
        const takeFocus = !focused;
        focused = true;
        this._controller.show({ contextKey, chatKey: chat.resource.toString(), resource, originalUri: change.originalUri, snapshotUri, isFinal: false, takeFocus });
      }
    }));
  }
};
StreamingEditPreviewContribution.ID = "workbench.contrib.sessions.streamingEditPreview";
StreamingEditPreviewContribution = __decorateClass([
  __decorateParam(0, ISessionsService),
  __decorateParam(1, IInstantiationService)
], StreamingEditPreviewContribution);
export {
  DialecticLiveEditSlotMap,
  StreamingEditPreviewContribution,
  buildStreamingEditAnimation,
  buildStreamingEditFrames,
  liveEditPreviewShouldOpenEditor,
  liveEditPreviewUsesSplit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3Nlclxcc3RyZWFtaW5nRWRpdFByZXZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaXZlRWRpdFByZXZpZXdDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2xpdmVFZGl0UHJldmlldy5qcyc7XG5pbXBvcnQgeyBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNBY3RpdmVTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuXG5leHBvcnQgeyBidWlsZFN0cmVhbWluZ0VkaXRBbmltYXRpb24sIGJ1aWxkU3RyZWFtaW5nRWRpdEZyYW1lcywgRGlhbGVjdGljTGl2ZUVkaXRTbG90TWFwLCBsaXZlRWRpdFByZXZpZXdTaG91bGRPcGVuRWRpdG9yLCBsaXZlRWRpdFByZXZpZXdVc2VzU3BsaXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvbGl2ZUVkaXRQcmV2aWV3LmpzJztcblxuLyoqIFJvdXRlcyBTZXNzaW9ucy1hcHAgZmlsZSBzbmFwc2hvdHMgdGhyb3VnaCBGb3JnZSdzIHNoYXJlZCBsaXZlIERpZmYgY29udHJvbGxlci4gKi9cbmV4cG9ydCBjbGFzcyBTdHJlYW1pbmdFZGl0UHJldmlld0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zLnN0cmVhbWluZ0VkaXRQcmV2aWV3JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cm9sbGVyOiBMaXZlRWRpdFByZXZpZXdDb250cm9sbGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWVuUmV2aXNpb25zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfYWN0aXZlQ29udGV4dEtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3RpdmVDaGF0S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3R1cm5TZXF1ZW5jZSA9IDA7XG5cdHByaXZhdGUgX3dhc0FjdGl2ZSA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpdmVFZGl0UHJldmlld0NvbnRyb2xsZXIpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IHNlc3Npb24/LmFjdGl2ZUNoYXQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gY2hhdD8uc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGNoYXRLZXkgPSBzZXNzaW9uICYmIGNoYXQgPyBgJHtzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCl9XFwwJHtjaGF0LnJlc291cmNlLnRvU3RyaW5nKCl9YCA6IHVuZGVmaW5lZDtcblx0XHRcdGlmICghc2Vzc2lvbiB8fCAhY2hhdCB8fCAhY2hhdEtleSB8fCBzdGF0dXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlQ2hhdEtleSAhPT0gY2hhdEtleSkge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVDaGF0S2V5ID0gY2hhdEtleTtcblx0XHRcdFx0dGhpcy5fdHVyblNlcXVlbmNlID0gMDtcblx0XHRcdFx0dGhpcy5fd2FzQWN0aXZlID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpc0FjdGl2ZSA9IGlzQWN0aXZlU2Vzc2lvblN0YXR1cyhzdGF0dXMpO1xuXHRcdFx0aWYgKGlzQWN0aXZlICYmICF0aGlzLl93YXNBY3RpdmUpIHtcblx0XHRcdFx0dGhpcy5fdHVyblNlcXVlbmNlKys7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93YXNBY3RpdmUgPSBpc0FjdGl2ZTtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXkgPSBgJHtjaGF0S2V5fVxcMCR7dGhpcy5fdHVyblNlcXVlbmNlfWA7XG5cdFx0XHRpZiAodGhpcy5fYWN0aXZlQ29udGV4dEtleSAhPT0gY29udGV4dEtleSkge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVDb250ZXh0S2V5ID0gY29udGV4dEtleTtcblx0XHRcdFx0dGhpcy5fc2VlblJldmlzaW9ucy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9jb250cm9sbGVyLnNldENvbnRleHQoY29udGV4dEtleSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzQWN0aXZlKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2xsZXIuZmluaXNoQ29udGV4dChjb250ZXh0S2V5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGZvY3VzZWQgPSB0aGlzLl9zZWVuUmV2aXNpb25zLnNpemUgPiAwO1xuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgY2hhdC5sYXN0VHVybkNoYW5nZXM/LnJlYWQocmVhZGVyKSA/PyBbXSkge1xuXHRcdFx0XHRjb25zdCBzbmFwc2hvdFVyaSA9IGNoYW5nZS5tb2RpZmllZFNuYXBzaG90VXJpO1xuXHRcdFx0XHRpZiAoIXNuYXBzaG90VXJpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBpc0lDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyKGNoYW5nZSkgPyBjaGFuZ2UudXJpIDogY2hhbmdlLm1vZGlmaWVkVXJpO1xuXHRcdFx0XHRpZiAodGhpcy5fc2VlblJldmlzaW9ucy5nZXQocmVzb3VyY2UudG9TdHJpbmcoKSkgPT09IHNuYXBzaG90VXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zZWVuUmV2aXNpb25zLnNldChyZXNvdXJjZS50b1N0cmluZygpLCBzbmFwc2hvdFVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y29uc3QgdGFrZUZvY3VzID0gIWZvY3VzZWQ7XG5cdFx0XHRcdGZvY3VzZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9jb250cm9sbGVyLnNob3coeyBjb250ZXh0S2V5LCBjaGF0S2V5OiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCksIHJlc291cmNlLCBvcmlnaW5hbFVyaTogY2hhbmdlLm9yaWdpbmFsVXJpLCBzbmFwc2hvdFVyaSwgaXNGaW5hbDogZmFsc2UsIHRha2VGb2N1cyB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBRXRDLFNBQVMsNkJBQTZCLDBCQUEwQiwwQkFBMEIsaUNBQWlDLGdDQUFnQztBQUdwSixJQUFNLG1DQUFOLGNBQStDLFdBQTZDO0FBQUEsRUFVbEcsWUFDbUIsaUJBQ0ssc0JBQ3RCO0FBQ0QsVUFBTTtBQVZQLFNBQWlCLGlCQUFpQixvQkFBSSxJQUFvQjtBQUcxRCxTQUFRLGdCQUFnQjtBQUN4QixTQUFRLGFBQWE7QUFPcEIsU0FBSyxjQUFjLEtBQUssVUFBVSxxQkFBcUIsZUFBZSx5QkFBeUIsQ0FBQztBQUNoRyxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sVUFBVSxnQkFBZ0IsY0FBYyxLQUFLLE1BQU07QUFDekQsWUFBTSxPQUFPLFNBQVMsV0FBVyxLQUFLLE1BQU07QUFDNUMsWUFBTSxTQUFTLE1BQU0sT0FBTyxLQUFLLE1BQU07QUFDdkMsWUFBTSxVQUFVLFdBQVcsT0FBTyxHQUFHLFFBQVEsU0FBUyxTQUFTLENBQUMsS0FBSyxLQUFLLFNBQVMsU0FBUyxDQUFDLEtBQUs7QUFDbEcsVUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsV0FBVyxXQUFXLFFBQVc7QUFDMUQ7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLG1CQUFtQixTQUFTO0FBQ3BDLGFBQUssaUJBQWlCO0FBQ3RCLGFBQUssZ0JBQWdCO0FBQ3JCLGFBQUssYUFBYTtBQUFBLE1BQ25CO0FBQ0EsWUFBTSxXQUFXLHNCQUFzQixNQUFNO0FBQzdDLFVBQUksWUFBWSxDQUFDLEtBQUssWUFBWTtBQUNqQyxhQUFLO0FBQUEsTUFDTjtBQUNBLFdBQUssYUFBYTtBQUNsQixZQUFNLGFBQWEsR0FBRyxPQUFPLEtBQUssS0FBSyxhQUFhO0FBQ3BELFVBQUksS0FBSyxzQkFBc0IsWUFBWTtBQUMxQyxhQUFLLG9CQUFvQjtBQUN6QixhQUFLLGVBQWUsTUFBTTtBQUMxQixhQUFLLFlBQVksV0FBVyxVQUFVO0FBQUEsTUFDdkM7QUFDQSxVQUFJLENBQUMsVUFBVTtBQUNkLGFBQUssWUFBWSxjQUFjLFVBQVU7QUFDekM7QUFBQSxNQUNEO0FBQ0EsVUFBSSxVQUFVLEtBQUssZUFBZSxPQUFPO0FBQ3pDLGlCQUFXLFVBQVUsS0FBSyxpQkFBaUIsS0FBSyxNQUFNLEtBQUssQ0FBQyxHQUFHO0FBQzlELGNBQU0sY0FBYyxPQUFPO0FBQzNCLFlBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsUUFDRDtBQUNBLGNBQU0sV0FBVywwQkFBMEIsTUFBTSxJQUFJLE9BQU8sTUFBTSxPQUFPO0FBQ3pFLFlBQUksS0FBSyxlQUFlLElBQUksU0FBUyxTQUFTLENBQUMsTUFBTSxZQUFZLFNBQVMsR0FBRztBQUM1RTtBQUFBLFFBQ0Q7QUFDQSxhQUFLLGVBQWUsSUFBSSxTQUFTLFNBQVMsR0FBRyxZQUFZLFNBQVMsQ0FBQztBQUNuRSxjQUFNLFlBQVksQ0FBQztBQUNuQixrQkFBVTtBQUNWLGFBQUssWUFBWSxLQUFLLEVBQUUsWUFBWSxTQUFTLEtBQUssU0FBUyxTQUFTLEdBQUcsVUFBVSxhQUFhLE9BQU8sYUFBYSxhQUFhLFNBQVMsT0FBTyxVQUFVLENBQUM7QUFBQSxNQUMzSjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNEO0FBN0RhLGlDQUNJLEtBQUs7QUFEVCxtQ0FBTjtBQUFBLEVBV0o7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
