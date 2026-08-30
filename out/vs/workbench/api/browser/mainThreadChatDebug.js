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
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { ChatDebugHookResult, IChatDebugService } from "../../contrib/chat/common/chatDebugService.js";
import { IChatService } from "../../contrib/chat/common/chatService/chatService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadChatDebug = class extends Disposable {
  constructor(extHostContext, _chatDebugService, _chatService) {
    super();
    this._chatDebugService = _chatDebugService;
    this._chatService = _chatService;
    this._providerDisposables = /* @__PURE__ */ new Map();
    this._activeSessionResources = /* @__PURE__ */ new Map();
    this._coreEventForwarder = this._register(new MutableDisposable());
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatDebug);
  }
  $subscribeToCoreDebugEvents() {
    this._coreEventForwarder.value = this._chatDebugService.onDidAddEvent((event) => {
      if (this._chatDebugService.isCoreEvent(event)) {
        this._proxy.$onCoreDebugEvent(this._serializeEvent(event));
      }
    });
  }
  $unsubscribeFromCoreDebugEvents() {
    this._coreEventForwarder.clear();
  }
  $registerChatDebugLogProvider(handle) {
    const disposables = new DisposableStore();
    this._providerDisposables.set(handle, disposables);
    disposables.add(this._chatDebugService.registerProvider({
      provideChatDebugLog: async (sessionResource, token) => {
        this._activeSessionResources.set(handle, sessionResource);
        const dtos = await this._proxy.$provideChatDebugLog(handle, sessionResource, token);
        return dtos?.map((dto) => this._reviveEvent(dto, sessionResource));
      },
      resolveChatDebugLogEvent: async (eventId, token) => {
        const dto = await this._proxy.$resolveChatDebugLogEvent(handle, eventId, token);
        return dto ? this._reviveResolvedContent(dto) : void 0;
      },
      provideChatDebugLogExport: async (sessionResource, token) => {
        const coreEventDtos = this._chatDebugService.getEvents(sessionResource).filter((e) => this._chatDebugService.isCoreEvent(e)).map((e) => this._serializeEvent(e));
        const sessionTitle = this._chatService.getSessionTitle(sessionResource);
        const result = await this._proxy.$exportChatDebugLog(handle, sessionResource, coreEventDtos, sessionTitle, token);
        return result?.buffer;
      },
      resolveChatDebugLogImport: async (data, token) => {
        const result = await this._proxy.$importChatDebugLog(handle, VSBuffer.wrap(data), token);
        if (!result) {
          return void 0;
        }
        const uri = URI.revive(result.uri);
        if (result.sessionTitle) {
          this._chatDebugService.setImportedSessionTitle(uri, result.sessionTitle);
        }
        return uri;
      }
    }));
    disposables.add(this._chatDebugService.registerAvailableSessionsFetcher(async (token) => {
      const entries = await this._proxy.$getAvailableDebugSessionResources(handle, token);
      return entries.map((e) => ({ uri: URI.revive(e.uri), title: e.title }));
    }));
  }
  $unregisterChatDebugLogProvider(handle) {
    const disposables = this._providerDisposables.get(handle);
    disposables?.dispose();
    this._providerDisposables.delete(handle);
    this._activeSessionResources.delete(handle);
  }
  $acceptChatDebugEvent(handle, dto) {
    const sessionResource = (dto.sessionResource ? URI.revive(dto.sessionResource) : void 0) ?? this._activeSessionResources.get(handle) ?? this._chatDebugService.activeSessionResource;
    if (!sessionResource) {
      return;
    }
    const revived = this._reviveEvent(dto, sessionResource);
    this._chatDebugService.addProviderEvent(revived);
  }
  _serializeEvent(event) {
    const base = {
      id: event.id,
      sessionResource: event.sessionResource,
      created: event.created.getTime(),
      parentEventId: event.parentEventId
    };
    switch (event.kind) {
      case "toolCall":
        return { ...base, kind: "toolCall", toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output, result: event.result, durationInMillis: event.durationInMillis };
      case "modelTurn":
        return { ...base, kind: "modelTurn", model: event.model, requestName: event.requestName, inputTokens: event.inputTokens, outputTokens: event.outputTokens, cachedTokens: event.cachedTokens, totalTokens: event.totalTokens, copilotUsageNanoAiu: event.copilotUsageNanoAiu, durationInMillis: event.durationInMillis };
      case "generic":
        return { ...base, kind: "generic", name: event.name, details: event.details, level: event.level, category: event.category };
      case "subagentInvocation":
        return { ...base, kind: "subagentInvocation", agentName: event.agentName, description: event.description, status: event.status, durationInMillis: event.durationInMillis, toolCallCount: event.toolCallCount, modelTurnCount: event.modelTurnCount };
      case "userMessage":
        return { ...base, kind: "userMessage", message: event.message, sections: event.sections.map((s) => ({ name: s.name, content: s.content })) };
      case "agentResponse":
        return { ...base, kind: "agentResponse", message: event.message, sections: event.sections.map((s) => ({ name: s.name, content: s.content })) };
    }
  }
  _reviveEvent(dto, sessionResource) {
    const base = {
      id: dto.id,
      sessionResource,
      created: new Date(dto.created),
      parentEventId: dto.parentEventId
    };
    switch (dto.kind) {
      case "toolCall":
        return {
          ...base,
          kind: "toolCall",
          toolName: dto.toolName,
          toolCallId: dto.toolCallId,
          input: dto.input,
          output: dto.output,
          result: dto.result,
          durationInMillis: dto.durationInMillis
        };
      case "modelTurn":
        return {
          ...base,
          kind: "modelTurn",
          model: dto.model,
          requestName: dto.requestName,
          inputTokens: dto.inputTokens,
          outputTokens: dto.outputTokens,
          cachedTokens: dto.cachedTokens,
          totalTokens: dto.totalTokens,
          copilotUsageNanoAiu: dto.copilotUsageNanoAiu,
          durationInMillis: dto.durationInMillis
        };
      case "generic":
        return {
          ...base,
          kind: "generic",
          name: dto.name,
          details: dto.details,
          level: dto.level,
          category: dto.category
        };
      case "subagentInvocation":
        return {
          ...base,
          kind: "subagentInvocation",
          agentName: dto.agentName,
          description: dto.description,
          status: dto.status,
          durationInMillis: dto.durationInMillis,
          toolCallCount: dto.toolCallCount,
          modelTurnCount: dto.modelTurnCount
        };
      case "userMessage":
        return {
          ...base,
          kind: "userMessage",
          message: dto.message,
          sections: dto.sections
        };
      case "agentResponse":
        return {
          ...base,
          kind: "agentResponse",
          message: dto.message,
          sections: dto.sections
        };
    }
  }
  _reviveResolvedContent(dto) {
    switch (dto.kind) {
      case "text":
        return { kind: "text", value: dto.value };
      case "message":
        return {
          kind: "message",
          type: dto.type,
          message: dto.message,
          sections: dto.sections
        };
      case "toolCall":
        return {
          kind: "toolCall",
          toolName: dto.toolName,
          result: dto.result,
          durationInMillis: dto.durationInMillis,
          input: dto.input,
          output: dto.output
        };
      case "modelTurn":
        return {
          kind: "modelTurn",
          requestName: dto.requestName,
          model: dto.model,
          status: dto.status,
          durationInMillis: dto.durationInMillis,
          timeToFirstTokenInMillis: dto.timeToFirstTokenInMillis,
          requestId: dto.requestId,
          maxInputTokens: dto.maxInputTokens,
          maxOutputTokens: dto.maxOutputTokens,
          inputTokens: dto.inputTokens,
          outputTokens: dto.outputTokens,
          cachedTokens: dto.cachedTokens,
          totalTokens: dto.totalTokens,
          requestOptions: dto.requestOptions,
          errorMessage: dto.errorMessage,
          sections: dto.sections
        };
      case "hook":
        return {
          kind: "hook",
          hookType: dto.hookType,
          command: dto.command,
          result: dto.result === "success" ? ChatDebugHookResult.Success : dto.result === "error" ? ChatDebugHookResult.Error : dto.result === "nonBlockingError" ? ChatDebugHookResult.NonBlockingError : void 0,
          durationInMillis: dto.durationInMillis,
          input: dto.input,
          output: dto.output,
          exitCode: dto.exitCode,
          errorMessage: dto.errorMessage
        };
    }
  }
};
MainThreadChatDebug = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatDebug),
  __decorateParam(1, IChatDebugService),
  __decorateParam(2, IChatService)
], MainThreadChatDebug);
export {
  MainThreadChatDebug
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZENoYXREZWJ1Zy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0hvb2tSZXN1bHQsIENoYXREZWJ1Z0xvZ0xldmVsLCBJQ2hhdERlYnVnRXZlbnQsIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudCwgSUNoYXREZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdERlYnVnU2hhcGUsIEV4dEhvc3RDb250ZXh0LCBJQ2hhdERlYnVnRXZlbnREdG8sIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudER0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDaGF0RGVidWdTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFByb3hpZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuXG5AZXh0SG9zdE5hbWVkQ3VzdG9tZXIoTWFpbkNvbnRleHQuTWFpblRocmVhZENoYXREZWJ1ZylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkQ2hhdERlYnVnIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRDaGF0RGVidWdTaGFwZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBQcm94aWVkPEV4dEhvc3RDaGF0RGVidWdTaGFwZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyRGlzcG9zYWJsZXMgPSBuZXcgTWFwPG51bWJlciwgRGlzcG9zYWJsZVN0b3JlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTZXNzaW9uUmVzb3VyY2VzID0gbmV3IE1hcDxudW1iZXIsIFVSST4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29yZUV2ZW50Rm9yd2FyZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElDaGF0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXREZWJ1Z1NlcnZpY2U6IElDaGF0RGVidWdTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0RGVidWcpO1xuXHR9XG5cblx0JHN1YnNjcmliZVRvQ29yZURlYnVnRXZlbnRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvcmVFdmVudEZvcndhcmRlci52YWx1ZSA9IHRoaXMuX2NoYXREZWJ1Z1NlcnZpY2Uub25EaWRBZGRFdmVudChldmVudCA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY2hhdERlYnVnU2VydmljZS5pc0NvcmVFdmVudChldmVudCkpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uQ29yZURlYnVnRXZlbnQodGhpcy5fc2VyaWFsaXplRXZlbnQoZXZlbnQpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdCR1bnN1YnNjcmliZUZyb21Db3JlRGVidWdFdmVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29yZUV2ZW50Rm9yd2FyZGVyLmNsZWFyKCk7XG5cdH1cblxuXHQkcmVnaXN0ZXJDaGF0RGVidWdMb2dQcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyRGlzcG9zYWJsZXMuc2V0KGhhbmRsZSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NoYXREZWJ1Z1NlcnZpY2UucmVnaXN0ZXJQcm92aWRlcih7XG5cdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nOiBhc3luYyAoc2Vzc2lvblJlc291cmNlLCB0b2tlbikgPT4ge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uUmVzb3VyY2VzLnNldChoYW5kbGUsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IGR0b3MgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUNoYXREZWJ1Z0xvZyhoYW5kbGUsIHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXHRcdFx0XHRyZXR1cm4gZHRvcz8ubWFwKGR0byA9PiB0aGlzLl9yZXZpdmVFdmVudChkdG8sIHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVDaGF0RGVidWdMb2dFdmVudDogYXN5bmMgKGV2ZW50SWQsIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGR0byA9IGF3YWl0IHRoaXMuX3Byb3h5LiRyZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQoaGFuZGxlLCBldmVudElkLCB0b2tlbik7XG5cdFx0XHRcdHJldHVybiBkdG8gPyB0aGlzLl9yZXZpdmVSZXNvbHZlZENvbnRlbnQoZHRvKSA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRwcm92aWRlQ2hhdERlYnVnTG9nRXhwb3J0OiBhc3luYyAoc2Vzc2lvblJlc291cmNlLCB0b2tlbikgPT4ge1xuXHRcdFx0XHQvLyBHYXRoZXIgY29yZSBldmVudHMgYW5kIHNlc3Npb24gdGl0bGUgdG8gcGFzcyB0byB0aGUgZXh0ZW5zaW9uLlxuXHRcdFx0XHRjb25zdCBjb3JlRXZlbnREdG9zID0gdGhpcy5fY2hhdERlYnVnU2VydmljZS5nZXRFdmVudHMoc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0XHRcdC5maWx0ZXIoZSA9PiB0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLmlzQ29yZUV2ZW50KGUpKVxuXHRcdFx0XHRcdC5tYXAoZSA9PiB0aGlzLl9zZXJpYWxpemVFdmVudChlKSk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25UaXRsZSA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb25UaXRsZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kZXhwb3J0Q2hhdERlYnVnTG9nKGhhbmRsZSwgc2Vzc2lvblJlc291cmNlLCBjb3JlRXZlbnREdG9zLCBzZXNzaW9uVGl0bGUsIHRva2VuKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdD8uYnVmZmVyO1xuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVDaGF0RGVidWdMb2dJbXBvcnQ6IGFzeW5jIChkYXRhLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kaW1wb3J0Q2hhdERlYnVnTG9nKGhhbmRsZSwgVlNCdWZmZXIud3JhcChkYXRhKSwgdG9rZW4pO1xuXHRcdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShyZXN1bHQudXJpKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5zZXNzaW9uVGl0bGUpIHtcblx0XHRcdFx0XHR0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLnNldEltcG9ydGVkU2Vzc2lvblRpdGxlKHVyaSwgcmVzdWx0LnNlc3Npb25UaXRsZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVyaTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZWdpc3RlciBhIGxhenkgZmV0Y2hlciBzbyBoaXN0b3JpY2FsIHNlc3Npb25zIGFyZSBsb2FkZWQgZnJvbSB0aGVcblx0XHQvLyBleHRlbnNpb24gb25seSB3aGVuIHRoZSBkZWJ1ZyBwYW5lbCBob21lIHBhZ2UgZmlyc3QgbmVlZHMgdGhlbS5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY2hhdERlYnVnU2VydmljZS5yZWdpc3RlckF2YWlsYWJsZVNlc3Npb25zRmV0Y2hlcihhc3luYyAodG9rZW4pID0+IHtcblx0XHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCB0aGlzLl9wcm94eS4kZ2V0QXZhaWxhYmxlRGVidWdTZXNzaW9uUmVzb3VyY2VzKGhhbmRsZSwgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIGVudHJpZXMubWFwKGUgPT4gKHsgdXJpOiBVUkkucmV2aXZlKGUudXJpKSwgdGl0bGU6IGUudGl0bGUgfSkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdCR1bnJlZ2lzdGVyQ2hhdERlYnVnTG9nUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuX3Byb3ZpZGVyRGlzcG9zYWJsZXMuZ2V0KGhhbmRsZSk7XG5cdFx0ZGlzcG9zYWJsZXM/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wcm92aWRlckRpc3Bvc2FibGVzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25SZXNvdXJjZXMuZGVsZXRlKGhhbmRsZSk7XG5cdH1cblxuXHQkYWNjZXB0Q2hhdERlYnVnRXZlbnQoaGFuZGxlOiBudW1iZXIsIGR0bzogSUNoYXREZWJ1Z0V2ZW50RHRvKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gKGR0by5zZXNzaW9uUmVzb3VyY2UgPyBVUkkucmV2aXZlKGR0by5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkKVxuXHRcdFx0Pz8gdGhpcy5fYWN0aXZlU2Vzc2lvblJlc291cmNlcy5nZXQoaGFuZGxlKVxuXHRcdFx0Pz8gdGhpcy5fY2hhdERlYnVnU2VydmljZS5hY3RpdmVTZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcmV2aXZlZCA9IHRoaXMuX3Jldml2ZUV2ZW50KGR0bywgc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLmFkZFByb3ZpZGVyRXZlbnQocmV2aXZlZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXJpYWxpemVFdmVudChldmVudDogSUNoYXREZWJ1Z0V2ZW50KTogSUNoYXREZWJ1Z0V2ZW50RHRvIHtcblx0XHRjb25zdCBiYXNlID0ge1xuXHRcdFx0aWQ6IGV2ZW50LmlkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBldmVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjcmVhdGVkOiBldmVudC5jcmVhdGVkLmdldFRpbWUoKSxcblx0XHRcdHBhcmVudEV2ZW50SWQ6IGV2ZW50LnBhcmVudEV2ZW50SWQsXG5cdFx0fTtcblxuXHRcdHN3aXRjaCAoZXZlbnQua2luZCkge1xuXHRcdFx0Y2FzZSAndG9vbENhbGwnOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBraW5kOiAndG9vbENhbGwnLCB0b29sTmFtZTogZXZlbnQudG9vbE5hbWUsIHRvb2xDYWxsSWQ6IGV2ZW50LnRvb2xDYWxsSWQsIGlucHV0OiBldmVudC5pbnB1dCwgb3V0cHV0OiBldmVudC5vdXRwdXQsIHJlc3VsdDogZXZlbnQucmVzdWx0LCBkdXJhdGlvbkluTWlsbGlzOiBldmVudC5kdXJhdGlvbkluTWlsbGlzIH07XG5cdFx0XHRjYXNlICdtb2RlbFR1cm4nOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBraW5kOiAnbW9kZWxUdXJuJywgbW9kZWw6IGV2ZW50Lm1vZGVsLCByZXF1ZXN0TmFtZTogZXZlbnQucmVxdWVzdE5hbWUsIGlucHV0VG9rZW5zOiBldmVudC5pbnB1dFRva2Vucywgb3V0cHV0VG9rZW5zOiBldmVudC5vdXRwdXRUb2tlbnMsIGNhY2hlZFRva2VuczogZXZlbnQuY2FjaGVkVG9rZW5zLCB0b3RhbFRva2VuczogZXZlbnQudG90YWxUb2tlbnMsIGNvcGlsb3RVc2FnZU5hbm9BaXU6IGV2ZW50LmNvcGlsb3RVc2FnZU5hbm9BaXUsIGR1cmF0aW9uSW5NaWxsaXM6IGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMgfTtcblx0XHRcdGNhc2UgJ2dlbmVyaWMnOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBraW5kOiAnZ2VuZXJpYycsIG5hbWU6IGV2ZW50Lm5hbWUsIGRldGFpbHM6IGV2ZW50LmRldGFpbHMsIGxldmVsOiBldmVudC5sZXZlbCwgY2F0ZWdvcnk6IGV2ZW50LmNhdGVnb3J5IH07XG5cdFx0XHRjYXNlICdzdWJhZ2VudEludm9jYXRpb24nOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBraW5kOiAnc3ViYWdlbnRJbnZvY2F0aW9uJywgYWdlbnROYW1lOiBldmVudC5hZ2VudE5hbWUsIGRlc2NyaXB0aW9uOiBldmVudC5kZXNjcmlwdGlvbiwgc3RhdHVzOiBldmVudC5zdGF0dXMsIGR1cmF0aW9uSW5NaWxsaXM6IGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMsIHRvb2xDYWxsQ291bnQ6IGV2ZW50LnRvb2xDYWxsQ291bnQsIG1vZGVsVHVybkNvdW50OiBldmVudC5tb2RlbFR1cm5Db3VudCB9O1xuXHRcdFx0Y2FzZSAndXNlck1lc3NhZ2UnOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBraW5kOiAndXNlck1lc3NhZ2UnLCBtZXNzYWdlOiBldmVudC5tZXNzYWdlLCBzZWN0aW9uczogZXZlbnQuc2VjdGlvbnMubWFwKHMgPT4gKHsgbmFtZTogcy5uYW1lLCBjb250ZW50OiBzLmNvbnRlbnQgfSkpIH07XG5cdFx0XHRjYXNlICdhZ2VudFJlc3BvbnNlJzpcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwga2luZDogJ2FnZW50UmVzcG9uc2UnLCBtZXNzYWdlOiBldmVudC5tZXNzYWdlLCBzZWN0aW9uczogZXZlbnQuc2VjdGlvbnMubWFwKHMgPT4gKHsgbmFtZTogcy5uYW1lLCBjb250ZW50OiBzLmNvbnRlbnQgfSkpIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmV2aXZlRXZlbnQoZHRvOiBJQ2hhdERlYnVnRXZlbnREdG8sIHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUNoYXREZWJ1Z0V2ZW50IHtcblx0XHRjb25zdCBiYXNlID0ge1xuXHRcdFx0aWQ6IGR0by5pZCxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNyZWF0ZWQ6IG5ldyBEYXRlKGR0by5jcmVhdGVkKSxcblx0XHRcdHBhcmVudEV2ZW50SWQ6IGR0by5wYXJlbnRFdmVudElkLFxuXHRcdH07XG5cblx0XHRzd2l0Y2ggKGR0by5raW5kKSB7XG5cdFx0XHRjYXNlICd0b29sQ2FsbCc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAndG9vbENhbGwnLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiBkdG8udG9vbE5hbWUsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogZHRvLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0aW5wdXQ6IGR0by5pbnB1dCxcblx0XHRcdFx0XHRvdXRwdXQ6IGR0by5vdXRwdXQsXG5cdFx0XHRcdFx0cmVzdWx0OiBkdG8ucmVzdWx0LFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGR0by5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnbW9kZWxUdXJuJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGtpbmQ6ICdtb2RlbFR1cm4nLFxuXHRcdFx0XHRcdG1vZGVsOiBkdG8ubW9kZWwsXG5cdFx0XHRcdFx0cmVxdWVzdE5hbWU6IGR0by5yZXF1ZXN0TmFtZSxcblx0XHRcdFx0XHRpbnB1dFRva2VuczogZHRvLmlucHV0VG9rZW5zLFxuXHRcdFx0XHRcdG91dHB1dFRva2VuczogZHRvLm91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRjYWNoZWRUb2tlbnM6IGR0by5jYWNoZWRUb2tlbnMsXG5cdFx0XHRcdFx0dG90YWxUb2tlbnM6IGR0by50b3RhbFRva2Vucyxcblx0XHRcdFx0XHRjb3BpbG90VXNhZ2VOYW5vQWl1OiBkdG8uY29waWxvdFVzYWdlTmFub0FpdSxcblx0XHRcdFx0XHRkdXJhdGlvbkluTWlsbGlzOiBkdG8uZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ2dlbmVyaWMnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdG5hbWU6IGR0by5uYW1lLFxuXHRcdFx0XHRcdGRldGFpbHM6IGR0by5kZXRhaWxzLFxuXHRcdFx0XHRcdGxldmVsOiBkdG8ubGV2ZWwgYXMgQ2hhdERlYnVnTG9nTGV2ZWwsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGR0by5jYXRlZ29yeSxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ3N1YmFnZW50SW52b2NhdGlvbic6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnRJbnZvY2F0aW9uJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6IGR0by5hZ2VudE5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGR0by5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRzdGF0dXM6IGR0by5zdGF0dXMsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZHRvLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0dG9vbENhbGxDb3VudDogZHRvLnRvb2xDYWxsQ291bnQsXG5cdFx0XHRcdFx0bW9kZWxUdXJuQ291bnQ6IGR0by5tb2RlbFR1cm5Db3VudCxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGtpbmQ6ICd1c2VyTWVzc2FnZScsXG5cdFx0XHRcdFx0bWVzc2FnZTogZHRvLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IGR0by5zZWN0aW9ucyxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ2FnZW50UmVzcG9uc2UnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ2FnZW50UmVzcG9uc2UnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGR0by5tZXNzYWdlLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiBkdG8uc2VjdGlvbnMsXG5cdFx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmV2aXZlUmVzb2x2ZWRDb250ZW50KGR0bzogSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50RHRvKTogSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50IHtcblx0XHRzd2l0Y2ggKGR0by5raW5kKSB7XG5cdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3RleHQnLCB2YWx1ZTogZHRvLnZhbHVlIH07XG5cdFx0XHRjYXNlICdtZXNzYWdlJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAnbWVzc2FnZScsXG5cdFx0XHRcdFx0dHlwZTogZHRvLnR5cGUsXG5cdFx0XHRcdFx0bWVzc2FnZTogZHRvLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IGR0by5zZWN0aW9ucyxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ3Rvb2xDYWxsJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAndG9vbENhbGwnLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiBkdG8udG9vbE5hbWUsXG5cdFx0XHRcdFx0cmVzdWx0OiBkdG8ucmVzdWx0LFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGR0by5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHRcdGlucHV0OiBkdG8uaW5wdXQsXG5cdFx0XHRcdFx0b3V0cHV0OiBkdG8ub3V0cHV0LFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnbW9kZWxUdXJuJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRcdFx0XHRyZXF1ZXN0TmFtZTogZHRvLnJlcXVlc3ROYW1lLFxuXHRcdFx0XHRcdG1vZGVsOiBkdG8ubW9kZWwsXG5cdFx0XHRcdFx0c3RhdHVzOiBkdG8uc3RhdHVzLFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGR0by5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHRcdHRpbWVUb0ZpcnN0VG9rZW5Jbk1pbGxpczogZHRvLnRpbWVUb0ZpcnN0VG9rZW5Jbk1pbGxpcyxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6IGR0by5yZXF1ZXN0SWQsXG5cdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IGR0by5tYXhJbnB1dFRva2Vucyxcblx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IGR0by5tYXhPdXRwdXRUb2tlbnMsXG5cdFx0XHRcdFx0aW5wdXRUb2tlbnM6IGR0by5pbnB1dFRva2Vucyxcblx0XHRcdFx0XHRvdXRwdXRUb2tlbnM6IGR0by5vdXRwdXRUb2tlbnMsXG5cdFx0XHRcdFx0Y2FjaGVkVG9rZW5zOiBkdG8uY2FjaGVkVG9rZW5zLFxuXHRcdFx0XHRcdHRvdGFsVG9rZW5zOiBkdG8udG90YWxUb2tlbnMsXG5cdFx0XHRcdFx0cmVxdWVzdE9wdGlvbnM6IGR0by5yZXF1ZXN0T3B0aW9ucyxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGR0by5lcnJvck1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IGR0by5zZWN0aW9ucyxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgJ2hvb2snOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdob29rJyxcblx0XHRcdFx0XHRob29rVHlwZTogZHRvLmhvb2tUeXBlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGR0by5jb21tYW5kLFxuXHRcdFx0XHRcdHJlc3VsdDogZHRvLnJlc3VsdCA9PT0gJ3N1Y2Nlc3MnID8gQ2hhdERlYnVnSG9va1Jlc3VsdC5TdWNjZXNzXG5cdFx0XHRcdFx0XHQ6IGR0by5yZXN1bHQgPT09ICdlcnJvcicgPyBDaGF0RGVidWdIb29rUmVzdWx0LkVycm9yXG5cdFx0XHRcdFx0XHRcdDogZHRvLnJlc3VsdCA9PT0gJ25vbkJsb2NraW5nRXJyb3InID8gQ2hhdERlYnVnSG9va1Jlc3VsdC5Ob25CbG9ja2luZ0Vycm9yXG5cdFx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZHRvLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0aW5wdXQ6IGR0by5pbnB1dCxcblx0XHRcdFx0XHRvdXRwdXQ6IGR0by5vdXRwdXQsXG5cdFx0XHRcdFx0ZXhpdENvZGU6IGR0by5leGl0Q29kZSxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGR0by5lcnJvck1lc3NhZ2UsXG5cdFx0XHRcdH07XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUF5Rix5QkFBeUI7QUFDM0gsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw0QkFBNkM7QUFDdEQsU0FBZ0MsZ0JBQXVFLG1CQUE2QztBQUk3SSxJQUFNLHNCQUFOLGNBQWtDLFdBQStDO0FBQUEsRUFNdkYsWUFDQyxnQkFDb0MsbUJBQ0wsY0FDOUI7QUFDRCxVQUFNO0FBSDhCO0FBQ0w7QUFQaEMsU0FBaUIsdUJBQXVCLG9CQUFJLElBQTZCO0FBQ3pFLFNBQWlCLDBCQUEwQixvQkFBSSxJQUFpQjtBQUNoRSxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFRNUUsU0FBSyxTQUFTLGVBQWUsU0FBUyxlQUFlLGdCQUFnQjtBQUFBLEVBQ3RFO0FBQUEsRUFFQSw4QkFBb0M7QUFDbkMsU0FBSyxvQkFBb0IsUUFBUSxLQUFLLGtCQUFrQixjQUFjLFdBQVM7QUFDOUUsVUFBSSxLQUFLLGtCQUFrQixZQUFZLEtBQUssR0FBRztBQUM5QyxhQUFLLE9BQU8sa0JBQWtCLEtBQUssZ0JBQWdCLEtBQUssQ0FBQztBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEs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
