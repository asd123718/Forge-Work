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
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { MainContext } from "./extHost.protocol.js";
import { ChatDebugGenericEvent, ChatDebugHookResult, ChatDebugMessageContentType, ChatDebugMessageSection, ChatDebugModelTurnEvent, ChatDebugSubagentInvocationEvent, ChatDebugSubagentStatus, ChatDebugToolCallEvent, ChatDebugToolCallResult, ChatDebugUserMessageEvent, ChatDebugAgentResponseEvent } from "./extHostTypes.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
let ExtHostChatDebug = class extends Disposable {
  constructor(extHostRpc) {
    super();
    this._nextHandle = 0;
    /** Progress pipelines keyed by `${handle}:${sessionResource}` so multiple sessions can stream concurrently. */
    this._activeProgress = /* @__PURE__ */ new Map();
    this._onDidAddCoreEvent = this._register(new Emitter({
      onWillAddFirstListener: () => this._proxy.$subscribeToCoreDebugEvents(),
      onDidRemoveLastListener: () => this._proxy.$unsubscribeFromCoreDebugEvents()
    }));
    this.onDidAddCoreEvent = this._onDidAddCoreEvent.event;
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatDebug);
  }
  _progressKey(handle, sessionResource) {
    return `${handle}:${URI.revive(sessionResource).toString()}`;
  }
  _cleanupProgress(key) {
    const store = this._activeProgress.get(key);
    if (store) {
      store.dispose();
      this._activeProgress.delete(key);
    }
  }
  registerChatDebugLogProvider(provider) {
    if (this._provider) {
      throw new Error("A ChatDebugLogProvider is already registered.");
    }
    this._provider = provider;
    const handle = this._nextHandle++;
    this._proxy.$registerChatDebugLogProvider(handle);
    return toDisposable(() => {
      this._provider = void 0;
      for (const [key, store] of this._activeProgress) {
        if (key.startsWith(`${handle}:`)) {
          store.dispose();
          this._activeProgress.delete(key);
        }
      }
      this._proxy.$unregisterChatDebugLogProvider(handle);
    });
  }
  async $provideChatDebugLog(handle, sessionResource, token) {
    if (!this._provider) {
      return void 0;
    }
    const key = this._progressKey(handle, sessionResource);
    this._cleanupProgress(key);
    const store = new DisposableStore();
    this._activeProgress.set(key, store);
    const emitter = store.add(new Emitter());
    store.add(emitter.event((event) => {
      const dto = this._serializeEvent(event);
      if (!dto.sessionResource) {
        dto.sessionResource = sessionResource;
      }
      this._proxy.$acceptChatDebugEvent(handle, dto);
    }));
    store.add(token.onCancellationRequested(() => {
      this._cleanupProgress(key);
    }));
    try {
      const progress = {
        report: (value) => emitter.fire(value)
      };
      const sessionUri = URI.revive(sessionResource);
      const result = await this._provider.provideChatDebugLog(sessionUri, progress, token);
      if (!result) {
        return void 0;
      }
      return result.map((event) => this._serializeEvent(event));
    } catch (err) {
      this._cleanupProgress(key);
      throw err;
    }
  }
  _serializeEvent(event) {
    const base = {
      id: event.id,
      sessionResource: event.sessionResource,
      created: event.created.getTime(),
      parentEventId: event.parentEventId
    };
    const kind = event._kind;
    switch (kind) {
      case "toolCall": {
        const e = event;
        return {
          ...base,
          kind: "toolCall",
          toolName: e.toolName,
          toolCallId: e.toolCallId,
          input: e.input,
          output: e.output,
          result: e.result === ChatDebugToolCallResult.Success ? "success" : e.result === ChatDebugToolCallResult.Error ? "error" : void 0,
          durationInMillis: e.durationInMillis
        };
      }
      case "modelTurn": {
        const e = event;
        return {
          ...base,
          kind: "modelTurn",
          model: e.model,
          requestName: e.requestName,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          cachedTokens: e.cachedTokens,
          totalTokens: e.totalTokens,
          copilotUsageNanoAiu: e.copilotUsageNanoAiu,
          durationInMillis: e.durationInMillis
        };
      }
      case "generic": {
        const e = event;
        return {
          ...base,
          kind: "generic",
          name: e.name,
          details: e.details,
          level: e.level,
          category: e.category
        };
      }
      case "subagentInvocation": {
        const e = event;
        return {
          ...base,
          kind: "subagentInvocation",
          agentName: e.agentName,
          description: e.description,
          status: e.status === ChatDebugSubagentStatus.Running ? "running" : e.status === ChatDebugSubagentStatus.Completed ? "completed" : e.status === ChatDebugSubagentStatus.Failed ? "failed" : void 0,
          durationInMillis: e.durationInMillis,
          toolCallCount: e.toolCallCount,
          modelTurnCount: e.modelTurnCount
        };
      }
      case "userMessage": {
        const e = event;
        return {
          ...base,
          kind: "userMessage",
          message: e.message,
          sections: e.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "agentResponse": {
        const e = event;
        return {
          ...base,
          kind: "agentResponse",
          message: e.message,
          sections: e.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      default: {
        const generic = event;
        const rawName = generic.name;
        const rawDetails = generic.details;
        return {
          ...base,
          kind: "generic",
          name: typeof rawName === "string" ? rawName : "",
          details: typeof rawDetails === "string" ? rawDetails : void 0,
          level: generic.level ?? 1,
          category: generic.category
        };
      }
    }
  }
  async $resolveChatDebugLogEvent(_handle, eventId, token) {
    if (!this._provider?.resolveChatDebugLogEvent) {
      return void 0;
    }
    const result = await this._provider.resolveChatDebugLogEvent(eventId, token);
    if (!result) {
      return void 0;
    }
    const kind = result._kind;
    switch (kind) {
      case "text":
        return { kind: "text", value: result.value };
      case "messageContent": {
        const msg = result;
        return {
          kind: "message",
          type: msg.type === ChatDebugMessageContentType.User ? "user" : "agent",
          message: msg.message,
          sections: msg.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "userMessage": {
        const msg = result;
        return {
          kind: "message",
          type: "user",
          message: msg.message,
          sections: msg.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "agentResponse": {
        const msg = result;
        return {
          kind: "message",
          type: "agent",
          message: msg.message,
          sections: msg.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "toolCallContent": {
        const tc = result;
        return {
          kind: "toolCall",
          toolName: tc.toolName,
          result: tc.result === ChatDebugToolCallResult.Success ? "success" : tc.result === ChatDebugToolCallResult.Error ? "error" : void 0,
          durationInMillis: tc.durationInMillis,
          input: tc.input,
          output: tc.output
        };
      }
      case "modelTurnContent": {
        const mt = result;
        return {
          kind: "modelTurn",
          requestName: mt.requestName,
          model: mt.model,
          status: mt.status,
          durationInMillis: mt.durationInMillis,
          timeToFirstTokenInMillis: mt.timeToFirstTokenInMillis,
          requestId: mt.requestId,
          maxInputTokens: mt.maxInputTokens,
          maxOutputTokens: mt.maxOutputTokens,
          inputTokens: mt.inputTokens,
          outputTokens: mt.outputTokens,
          cachedTokens: mt.cachedTokens,
          totalTokens: mt.totalTokens,
          requestOptions: mt.requestOptions,
          errorMessage: mt.errorMessage,
          sections: mt.sections?.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "hookContent": {
        const hk = result;
        return {
          kind: "hook",
          hookType: hk.hookType,
          command: hk.command,
          result: hk.result === ChatDebugHookResult.Success ? "success" : hk.result === ChatDebugHookResult.Error ? "error" : hk.result === ChatDebugHookResult.NonBlockingError ? "nonBlockingError" : void 0,
          durationInMillis: hk.durationInMillis,
          input: hk.input,
          output: hk.output,
          exitCode: hk.exitCode,
          errorMessage: hk.errorMessage
        };
      }
      default:
        return void 0;
    }
  }
  _deserializeEvent(dto) {
    const created = new Date(dto.created);
    const sessionResource = dto.sessionResource ? URI.revive(dto.sessionResource) : void 0;
    switch (dto.kind) {
      case "toolCall": {
        const evt = new ChatDebugToolCallEvent(dto.toolName, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.toolCallId = dto.toolCallId;
        evt.input = dto.input;
        evt.output = dto.output;
        evt.result = dto.result === "success" ? ChatDebugToolCallResult.Success : dto.result === "error" ? ChatDebugToolCallResult.Error : void 0;
        evt.durationInMillis = dto.durationInMillis;
        return evt;
      }
      case "modelTurn": {
        const evt = new ChatDebugModelTurnEvent(created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.model = dto.model;
        evt.requestName = dto.requestName;
        evt.inputTokens = dto.inputTokens;
        evt.outputTokens = dto.outputTokens;
        evt.cachedTokens = dto.cachedTokens;
        evt.totalTokens = dto.totalTokens;
        evt.copilotUsageNanoAiu = dto.copilotUsageNanoAiu;
        evt.durationInMillis = dto.durationInMillis;
        return evt;
      }
      case "generic": {
        const evt = new ChatDebugGenericEvent(dto.name, dto.level, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.details = dto.details;
        evt.category = dto.category;
        return evt;
      }
      case "subagentInvocation": {
        const evt = new ChatDebugSubagentInvocationEvent(dto.agentName, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.description = dto.description;
        evt.status = dto.status === "running" ? ChatDebugSubagentStatus.Running : dto.status === "completed" ? ChatDebugSubagentStatus.Completed : dto.status === "failed" ? ChatDebugSubagentStatus.Failed : void 0;
        evt.durationInMillis = dto.durationInMillis;
        evt.toolCallCount = dto.toolCallCount;
        evt.modelTurnCount = dto.modelTurnCount;
        return evt;
      }
      case "userMessage": {
        const evt = new ChatDebugUserMessageEvent(dto.message, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.sections = dto.sections.map((s) => new ChatDebugMessageSection(s.name, s.content));
        return evt;
      }
      case "agentResponse": {
        const evt = new ChatDebugAgentResponseEvent(dto.message, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.sections = dto.sections.map((s) => new ChatDebugMessageSection(s.name, s.content));
        return evt;
      }
      default:
        return void 0;
    }
  }
  $onCoreDebugEvent(dto) {
    const event = this._deserializeEvent(dto);
    if (event) {
      this._onDidAddCoreEvent.fire(event);
    }
  }
  async $exportChatDebugLog(_handle, sessionResource, coreEventDtos, sessionTitle, token) {
    if (!this._provider?.provideChatDebugLogExport) {
      return void 0;
    }
    const sessionUri = URI.revive(sessionResource);
    const coreEvents = coreEventDtos.map((dto) => this._deserializeEvent(dto)).filter((e) => e !== void 0);
    const options = { coreEvents, sessionTitle };
    const result = await this._provider.provideChatDebugLogExport(sessionUri, options, token);
    if (!result) {
      return void 0;
    }
    return VSBuffer.wrap(result);
  }
  async $importChatDebugLog(_handle, data, token) {
    if (!this._provider?.resolveChatDebugLogImport) {
      return void 0;
    }
    const result = await this._provider.resolveChatDebugLogImport(data.buffer, token);
    if (!result) {
      return void 0;
    }
    return { uri: result.uri, sessionTitle: result.sessionTitle };
  }
  async $getAvailableDebugSessionResources(_handle, token) {
    if (!this._provider?.provideAvailableDebugSessionResources) {
      return [];
    }
    const result = await this._provider.provideAvailableDebugSessionResources(token);
    return result ?? [];
  }
  dispose() {
    for (const store of this._activeProgress.values()) {
      store.dispose();
    }
    this._activeProgress.clear();
    super.dispose();
  }
};
ExtHostChatDebug = __decorateClass([
  __decorateParam(0, IExtHostRpcService)
], ExtHostChatDebug);
export {
  ExtHostChatDebug
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q2hhdERlYnVnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENoYXREZWJ1Z1NoYXBlLCBJQ2hhdERlYnVnRXZlbnREdG8sIElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudER0bywgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDaGF0RGVidWdTaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBDaGF0RGVidWdHZW5lcmljRXZlbnQsIENoYXREZWJ1Z0hvb2tSZXN1bHQsIENoYXREZWJ1Z0xvZ0xldmVsLCBDaGF0RGVidWdNZXNzYWdlQ29udGVudFR5cGUsIENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uLCBDaGF0RGVidWdNb2RlbFR1cm5FdmVudCwgQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQsIENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzLCBDaGF0RGVidWdUb29sQ2FsbEV2ZW50LCBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdCwgQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudCwgQ2hhdERlYnVnQWdlbnRSZXNwb25zZUV2ZW50LCBDaGF0RGVidWdFdmVudEhvb2tDb250ZW50IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q2hhdERlYnVnIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIEV4dEhvc3RDaGF0RGVidWdTaGFwZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkQ2hhdERlYnVnU2hhcGU7XG5cdHByaXZhdGUgX3Byb3ZpZGVyOiB2c2NvZGUuQ2hhdERlYnVnTG9nUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX25leHRIYW5kbGU6IG51bWJlciA9IDA7XG5cdC8qKiBQcm9ncmVzcyBwaXBlbGluZXMga2V5ZWQgYnkgYCR7aGFuZGxlfToke3Nlc3Npb25SZXNvdXJjZX1gIHNvIG11bHRpcGxlIHNlc3Npb25zIGNhbiBzdHJlYW0gY29uY3VycmVudGx5LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVQcm9ncmVzcyA9IG5ldyBNYXA8c3RyaW5nLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBZGRDb3JlRXZlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2c2NvZGUuQ2hhdERlYnVnRXZlbnQ+KHtcblx0XHRvbldpbGxBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB0aGlzLl9wcm94eS4kc3Vic2NyaWJlVG9Db3JlRGVidWdFdmVudHMoKSxcblx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4gdGhpcy5fcHJveHkuJHVuc3Vic2NyaWJlRnJvbUNvcmVEZWJ1Z0V2ZW50cygpLFxuXHR9KSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkQ29yZUV2ZW50ID0gdGhpcy5fb25EaWRBZGRDb3JlRXZlbnQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRDaGF0RGVidWcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvZ3Jlc3NLZXkoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZTogVXJpQ29tcG9uZW50cyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2hhbmRsZX06JHtVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSkudG9TdHJpbmcoKX1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW51cFByb2dyZXNzKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSB0aGlzLl9hY3RpdmVQcm9ncmVzcy5nZXQoa2V5KTtcblx0XHRpZiAoc3RvcmUpIHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2FjdGl2ZVByb2dyZXNzLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0fVxuXG5cdHJlZ2lzdGVyQ2hhdERlYnVnTG9nUHJvdmlkZXIocHJvdmlkZXI6IHZzY29kZS5DaGF0RGVidWdMb2dQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQSBDaGF0RGVidWdMb2dQcm92aWRlciBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuJyk7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fbmV4dEhhbmRsZSsrO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckNoYXREZWJ1Z0xvZ1Byb3ZpZGVyKGhhbmRsZSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0Ly8gQ2xlYW4gdXAgYWxsIHByb2dyZXNzIHBpcGVsaW5lcyBmb3IgdGhpcyBoYW5kbGVcblx0XHRcdGZvciAoY29uc3QgW2tleSwgc3RvcmVdIG9mIHRoaXMuX2FjdGl2ZVByb2dyZXNzKSB7XG5cdFx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChgJHtoYW5kbGV9OmApKSB7XG5cdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVByb2dyZXNzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckNoYXREZWJ1Z0xvZ1Byb3ZpZGVyKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUNoYXREZWJ1Z0xvZyhoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0RGVidWdFdmVudER0b1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDbGVhbiB1cCBhbnkgcHJldmlvdXMgcHJvZ3Jlc3MgcGlwZWxpbmUgZm9yIHRoaXMgaGFuZGxlK3Nlc3Npb24gcGFpclxuXHRcdGNvbnN0IGtleSA9IHRoaXMuX3Byb2dyZXNzS2V5KGhhbmRsZSwgc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl9jbGVhbnVwUHJvZ3Jlc3Moa2V5KTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2FjdGl2ZVByb2dyZXNzLnNldChrZXksIHN0b3JlKTtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dnNjb2RlLkNoYXREZWJ1Z0V2ZW50PigpKTtcblxuXHRcdC8vIEZvcndhcmQgcHJvZ3Jlc3MgZXZlbnRzIHRvIHRoZSBtYWluIHRocmVhZFxuXHRcdHN0b3JlLmFkZChlbWl0dGVyLmV2ZW50KGV2ZW50ID0+IHtcblx0XHRcdGNvbnN0IGR0byA9IHRoaXMuX3NlcmlhbGl6ZUV2ZW50KGV2ZW50KTtcblx0XHRcdGlmICghZHRvLnNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHQoZHRvIGFzIHsgc2Vzc2lvblJlc291cmNlPzogVXJpQ29tcG9uZW50cyB9KS5zZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0Q2hhdERlYnVnRXZlbnQoaGFuZGxlLCBkdG8pO1xuXHRcdH0pKTtcblxuXHRcdC8vIENsZWFuIHVwIHdoZW4gdGhlIHRva2VuIGlzIGNhbmNlbGxlZFxuXHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jbGVhbnVwUHJvZ3Jlc3Moa2V5KTtcblx0XHR9KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuQ2hhdERlYnVnRXZlbnQ+ID0ge1xuXHRcdFx0XHRyZXBvcnQ6ICh2YWx1ZSkgPT4gZW1pdHRlci5maXJlKHZhbHVlKVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3ZpZGVyLnByb3ZpZGVDaGF0RGVidWdMb2coc2Vzc2lvblVyaSwgcHJvZ3Jlc3MsIHRva2VuKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQubWFwKGV2ZW50ID0+IHRoaXMuX3NlcmlhbGl6ZUV2ZW50KGV2ZW50KSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9jbGVhbnVwUHJvZ3Jlc3Moa2V5KTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdFx0Ly8gTm90ZTogZG8gTk9UIGRpc3Bvc2UgcHJvZ3Jlc3MgcGlwZWxpbmUgaGVyZSAtIGtlZXAgaXQgYWxpdmUgZm9yXG5cdFx0Ly8gc3RyZWFtaW5nIGV2ZW50cyB2aWEgcHJvZ3Jlc3MucmVwb3J0KCkgYWZ0ZXIgdGhlIGluaXRpYWwgcmV0dXJuLlxuXHRcdC8vIEl0IHdpbGwgYmUgY2xlYW5lZCB1cCB3aGVuIGEgbmV3IHNlc3Npb24gaXMgcmVxdWVzdGVkLCB0aGUgdG9rZW5cblx0XHQvLyBpcyBjYW5jZWxsZWQsIG9yIHRoZSBwcm92aWRlciBpcyB1bnJlZ2lzdGVyZWQuXG5cdH1cblxuXHRwcml2YXRlIF9zZXJpYWxpemVFdmVudChldmVudDogdnNjb2RlLkNoYXREZWJ1Z0V2ZW50KTogSUNoYXREZWJ1Z0V2ZW50RHRvIHtcblx0XHRjb25zdCBiYXNlID0ge1xuXHRcdFx0aWQ6IGV2ZW50LmlkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiAoZXZlbnQgYXMgeyBzZXNzaW9uUmVzb3VyY2U/OiB2c2NvZGUuVXJpIH0pLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNyZWF0ZWQ6IGV2ZW50LmNyZWF0ZWQuZ2V0VGltZSgpLFxuXHRcdFx0cGFyZW50RXZlbnRJZDogZXZlbnQucGFyZW50RXZlbnRJZCxcblx0XHR9O1xuXG5cdFx0Ly8gVXNlIHRoZSBfa2luZCBkaXNjcmltaW5hbnQgc2V0IGJ5IGFsbCBldmVudCBjbGFzcyBjb25zdHJ1Y3RvcnMuXG5cdFx0Ly8gVGhpcyB3b3JrcyBib3RoIGZvciBkaXJlY3QgaW5zdGFuY2VzIGFuZCB3aGVuIGV4dGVuc2lvbnMgYnVuZGxlXG5cdFx0Ly8gdGhlaXIgb3duIGNvcHkgb2YgdGhlIEFQSSB0eXBlcyAod2hlcmUgaW5zdGFuY2VvZiB3b3VsZCBmYWlsKS5cblx0XHRjb25zdCBraW5kID0gKGV2ZW50IGFzIHsgX2tpbmQ/OiBzdHJpbmcgfSkuX2tpbmQ7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlICd0b29sQ2FsbCc6IHtcblx0XHRcdFx0Y29uc3QgZSA9IGV2ZW50IGFzIHZzY29kZS5DaGF0RGVidWdUb29sQ2FsbEV2ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ3Rvb2xDYWxsJyxcblx0XHRcdFx0XHR0b29sTmFtZTogZS50b29sTmFtZSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBlLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0aW5wdXQ6IGUuaW5wdXQsXG5cdFx0XHRcdFx0b3V0cHV0OiBlLm91dHB1dCxcblx0XHRcdFx0XHRyZXN1bHQ6IGUucmVzdWx0ID09PSBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdC5TdWNjZXNzID8gJ3N1Y2Nlc3MnXG5cdFx0XHRcdFx0XHQ6IGUucmVzdWx0ID09PSBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdC5FcnJvciA/ICdlcnJvcidcblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZS5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnbW9kZWxUdXJuJzoge1xuXHRcdFx0XHRjb25zdCBlID0gZXZlbnQgYXMgdnNjb2RlLkNoYXREZWJ1Z01vZGVsVHVybkV2ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ21vZGVsVHVybicsXG5cdFx0XHRcdFx0bW9kZWw6IGUubW9kZWwsXG5cdFx0XHRcdFx0cmVxdWVzdE5hbWU6IGUucmVxdWVzdE5hbWUsXG5cdFx0XHRcdFx0aW5wdXRUb2tlbnM6IGUuaW5wdXRUb2tlbnMsXG5cdFx0XHRcdFx0b3V0cHV0VG9rZW5zOiBlLm91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRjYWNoZWRUb2tlbnM6IGUuY2FjaGVkVG9rZW5zLFxuXHRcdFx0XHRcdHRvdGFsVG9rZW5zOiBlLnRvdGFsVG9rZW5zLFxuXHRcdFx0XHRcdGNvcGlsb3RVc2FnZU5hbm9BaXU6IGUuY29waWxvdFVzYWdlTmFub0FpdSxcblx0XHRcdFx0XHRkdXJhdGlvbkluTWlsbGlzOiBlLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdnZW5lcmljJzoge1xuXHRcdFx0XHRjb25zdCBlID0gZXZlbnQgYXMgdnNjb2RlLkNoYXREZWJ1Z0dlbmVyaWNFdmVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRuYW1lOiBlLm5hbWUsXG5cdFx0XHRcdFx0ZGV0YWlsczogZS5kZXRhaWxzLFxuXHRcdFx0XHRcdGxldmVsOiBlLmxldmVsLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBlLmNhdGVnb3J5LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc3ViYWdlbnRJbnZvY2F0aW9uJzoge1xuXHRcdFx0XHRjb25zdCBlID0gZXZlbnQgYXMgdnNjb2RlLkNoYXREZWJ1Z1N1YmFnZW50SW52b2NhdGlvbkV2ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ3N1YmFnZW50SW52b2NhdGlvbicsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiBlLmFnZW50TmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRzdGF0dXM6IGUuc3RhdHVzID09PSBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cy5SdW5uaW5nID8gJ3J1bm5pbmcnXG5cdFx0XHRcdFx0XHQ6IGUuc3RhdHVzID09PSBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cy5Db21wbGV0ZWQgPyAnY29tcGxldGVkJ1xuXHRcdFx0XHRcdFx0XHQ6IGUuc3RhdHVzID09PSBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cy5GYWlsZWQgPyAnZmFpbGVkJ1xuXHRcdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGUuZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0XHR0b29sQ2FsbENvdW50OiBlLnRvb2xDYWxsQ291bnQsXG5cdFx0XHRcdFx0bW9kZWxUdXJuQ291bnQ6IGUubW9kZWxUdXJuQ291bnQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd1c2VyTWVzc2FnZSc6IHtcblx0XHRcdFx0Y29uc3QgZSA9IGV2ZW50IGFzIHZzY29kZS5DaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ3VzZXJNZXNzYWdlJyxcblx0XHRcdFx0XHRtZXNzYWdlOiBlLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IGUuc2VjdGlvbnMubWFwKHMgPT4gKHsgbmFtZTogcy5uYW1lLCBjb250ZW50OiBzLmNvbnRlbnQgfSkpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYWdlbnRSZXNwb25zZSc6IHtcblx0XHRcdFx0Y29uc3QgZSA9IGV2ZW50IGFzIHZzY29kZS5DaGF0RGVidWdBZ2VudFJlc3BvbnNlRXZlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAnYWdlbnRSZXNwb25zZScsXG5cdFx0XHRcdFx0bWVzc2FnZTogZS5tZXNzYWdlLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiBlLnNlY3Rpb25zLm1hcChzID0+ICh7IG5hbWU6IHMubmFtZSwgY29udGVudDogcy5jb250ZW50IH0pKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0Y29uc3QgZ2VuZXJpYyA9IGV2ZW50IGFzIHZzY29kZS5DaGF0RGVidWdHZW5lcmljRXZlbnQ7XG5cdFx0XHRcdGNvbnN0IHJhd05hbWUgPSBnZW5lcmljLm5hbWU7XG5cdFx0XHRcdGNvbnN0IHJhd0RldGFpbHMgPSBnZW5lcmljLmRldGFpbHM7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0bmFtZTogdHlwZW9mIHJhd05hbWUgPT09ICdzdHJpbmcnID8gcmF3TmFtZSA6ICcnLFxuXHRcdFx0XHRcdGRldGFpbHM6IHR5cGVvZiByYXdEZXRhaWxzID09PSAnc3RyaW5nJyA/IHJhd0RldGFpbHMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bGV2ZWw6IGdlbmVyaWMubGV2ZWwgPz8gMSxcblx0XHRcdFx0XHRjYXRlZ29yeTogZ2VuZXJpYy5jYXRlZ29yeSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50KF9oYW5kbGU6IG51bWJlciwgZXZlbnRJZDogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0RGVidWdSZXNvbHZlZEV2ZW50Q29udGVudER0byB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghdGhpcy5fcHJvdmlkZXI/LnJlc29sdmVDaGF0RGVidWdMb2dFdmVudCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50KGV2ZW50SWQsIHRva2VuKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBVc2UgdGhlIF9raW5kIGRpc2NyaW1pbmFudCBzZXQgYnkgYWxsIGNvbnRlbnQgY2xhc3MgY29uc3RydWN0b3JzLlxuXHRcdGNvbnN0IGtpbmQgPSAocmVzdWx0IGFzIHsgX2tpbmQ/OiBzdHJpbmcgfSkuX2tpbmQ7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlICd0ZXh0Jzpcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3RleHQnLCB2YWx1ZTogKHJlc3VsdCBhcyB2c2NvZGUuQ2hhdERlYnVnRXZlbnRUZXh0Q29udGVudCkudmFsdWUgfTtcblx0XHRcdGNhc2UgJ21lc3NhZ2VDb250ZW50Jzoge1xuXHRcdFx0XHRjb25zdCBtc2cgPSByZXN1bHQgYXMgdnNjb2RlLkNoYXREZWJ1Z0V2ZW50TWVzc2FnZUNvbnRlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogJ21lc3NhZ2UnLFxuXHRcdFx0XHRcdHR5cGU6IG1zZy50eXBlID09PSBDaGF0RGVidWdNZXNzYWdlQ29udGVudFR5cGUuVXNlciA/ICd1c2VyJyA6ICdhZ2VudCcsXG5cdFx0XHRcdFx0bWVzc2FnZTogbXNnLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IG1zZy5zZWN0aW9ucy5tYXAocyA9PiAoeyBuYW1lOiBzLm5hbWUsIGNvbnRlbnQ6IHMuY29udGVudCB9KSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd1c2VyTWVzc2FnZSc6IHtcblx0XHRcdFx0Y29uc3QgbXNnID0gcmVzdWx0IGFzIHZzY29kZS5DaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdtZXNzYWdlJyxcblx0XHRcdFx0XHR0eXBlOiAndXNlcicsXG5cdFx0XHRcdFx0bWVzc2FnZTogbXNnLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IG1zZy5zZWN0aW9ucy5tYXAocyA9PiAoeyBuYW1lOiBzLm5hbWUsIGNvbnRlbnQ6IHMuY29udGVudCB9KSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdhZ2VudFJlc3BvbnNlJzoge1xuXHRcdFx0XHRjb25zdCBtc2cgPSByZXN1bHQgYXMgdnNjb2RlLkNoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAnbWVzc2FnZScsXG5cdFx0XHRcdFx0dHlwZTogJ2FnZW50Jyxcblx0XHRcdFx0XHRtZXNzYWdlOiBtc2cubWVzc2FnZSxcblx0XHRcdFx0XHRzZWN0aW9uczogbXNnLnNlY3Rpb25zLm1hcChzID0+ICh7IG5hbWU6IHMubmFtZSwgY29udGVudDogcy5jb250ZW50IH0pKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Rvb2xDYWxsQ29udGVudCc6IHtcblx0XHRcdFx0Y29uc3QgdGMgPSByZXN1bHQgYXMgdnNjb2RlLkNoYXREZWJ1Z0V2ZW50VG9vbENhbGxDb250ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sQ2FsbCcsXG5cdFx0XHRcdFx0dG9vbE5hbWU6IHRjLnRvb2xOYW1lLFxuXHRcdFx0XHRcdHJlc3VsdDogdGMucmVzdWx0ID09PSBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdC5TdWNjZXNzID8gJ3N1Y2Nlc3MnXG5cdFx0XHRcdFx0XHQ6IHRjLnJlc3VsdCA9PT0gQ2hhdERlYnVnVG9vbENhbGxSZXN1bHQuRXJyb3IgPyAnZXJyb3InXG5cdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IHRjLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0aW5wdXQ6IHRjLmlucHV0LFxuXHRcdFx0XHRcdG91dHB1dDogdGMub3V0cHV0LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnbW9kZWxUdXJuQ29udGVudCc6IHtcblx0XHRcdFx0Y29uc3QgbXQgPSByZXN1bHQgYXMgdnNjb2RlLkNoYXREZWJ1Z0V2ZW50TW9kZWxUdXJuQ29udGVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRcdFx0XHRyZXF1ZXN0TmFtZTogbXQucmVxdWVzdE5hbWUsXG5cdFx0XHRcdFx0bW9kZWw6IG10Lm1vZGVsLFxuXHRcdFx0XHRcdHN0YXR1czogbXQuc3RhdHVzLFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IG10LmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0dGltZVRvRmlyc3RUb2tlbkluTWlsbGlzOiBtdC50aW1lVG9GaXJzdFRva2VuSW5NaWxsaXMsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiBtdC5yZXF1ZXN0SWQsXG5cdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IG10Lm1heElucHV0VG9rZW5zLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogbXQubWF4T3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRcdGlucHV0VG9rZW5zOiBtdC5pbnB1dFRva2Vucyxcblx0XHRcdFx0XHRvdXRwdXRUb2tlbnM6IG10Lm91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRjYWNoZWRUb2tlbnM6IG10LmNhY2hlZFRva2Vucyxcblx0XHRcdFx0XHR0b3RhbFRva2VuczogbXQudG90YWxUb2tlbnMsXG5cdFx0XHRcdFx0cmVxdWVzdE9wdGlvbnM6IG10LnJlcXVlc3RPcHRpb25zLFxuXHRcdFx0XHRcdGVycm9yTWVzc2FnZTogbXQuZXJyb3JNZXNzYWdlLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiBtdC5zZWN0aW9ucz8ubWFwKHMgPT4gKHsgbmFtZTogcy5uYW1lLCBjb250ZW50OiBzLmNvbnRlbnQgfSkpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaG9va0NvbnRlbnQnOiB7XG5cdFx0XHRcdGNvbnN0IGhrID0gcmVzdWx0IGFzIHVua25vd24gYXMgQ2hhdERlYnVnRXZlbnRIb29rQ29udGVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAnaG9vaycsXG5cdFx0XHRcdFx0aG9va1R5cGU6IGhrLmhvb2tUeXBlLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGhrLmNvbW1hbmQsXG5cdFx0XHRcdFx0cmVzdWx0OiBoay5yZXN1bHQgPT09IENoYXREZWJ1Z0hvb2tSZXN1bHQuU3VjY2VzcyA/ICdzdWNjZXNzJ1xuXHRcdFx0XHRcdFx0OiBoay5yZXN1bHQgPT09IENoYXREZWJ1Z0hvb2tSZXN1bHQuRXJyb3IgPyAnZXJyb3InXG5cdFx0XHRcdFx0XHRcdDogaGsucmVzdWx0ID09PSBDaGF0RGVidWdIb29rUmVzdWx0Lk5vbkJsb2NraW5nRXJyb3IgPyAnbm9uQmxvY2tpbmdFcnJvcidcblx0XHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkdXJhdGlvbkluTWlsbGlzOiBoay5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHRcdGlucHV0OiBoay5pbnB1dCxcblx0XHRcdFx0XHRvdXRwdXQ6IGhrLm91dHB1dCxcblx0XHRcdFx0XHRleGl0Q29kZTogaGsuZXhpdENvZGUsXG5cdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBoay5lcnJvck1lc3NhZ2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Rlc2VyaWFsaXplRXZlbnQoZHRvOiBJQ2hhdERlYnVnRXZlbnREdG8pOiB2c2NvZGUuQ2hhdERlYnVnRXZlbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNyZWF0ZWQgPSBuZXcgRGF0ZShkdG8uY3JlYXRlZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gZHRvLnNlc3Npb25SZXNvdXJjZSA/IFVSSS5yZXZpdmUoZHRvLnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoIChkdG8ua2luZCkge1xuXHRcdFx0Y2FzZSAndG9vbENhbGwnOiB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IG5ldyBDaGF0RGVidWdUb29sQ2FsbEV2ZW50KGR0by50b29sTmFtZSwgY3JlYXRlZCk7XG5cdFx0XHRcdGV2dC5pZCA9IGR0by5pZDtcblx0XHRcdFx0ZXZ0LnNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0ZXZ0LnBhcmVudEV2ZW50SWQgPSBkdG8ucGFyZW50RXZlbnRJZDtcblx0XHRcdFx0ZXZ0LnRvb2xDYWxsSWQgPSBkdG8udG9vbENhbGxJZDtcblx0XHRcdFx0ZXZ0LmlucHV0ID0gZHRvLmlucHV0O1xuXHRcdFx0XHRldnQub3V0cHV0ID0gZHRvLm91dHB1dDtcblx0XHRcdFx0ZXZ0LnJlc3VsdCA9IGR0by5yZXN1bHQgPT09ICdzdWNjZXNzJyA/IENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0LlN1Y2Nlc3Ncblx0XHRcdFx0XHQ6IGR0by5yZXN1bHQgPT09ICdlcnJvcicgPyBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdC5FcnJvclxuXHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdGV2dC5kdXJhdGlvbkluTWlsbGlzID0gZHRvLmR1cmF0aW9uSW5NaWxsaXM7XG5cdFx0XHRcdHJldHVybiBldnQ7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdtb2RlbFR1cm4nOiB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IG5ldyBDaGF0RGVidWdNb2RlbFR1cm5FdmVudChjcmVhdGVkKTtcblx0XHRcdFx0ZXZ0LmlkID0gZHRvLmlkO1xuXHRcdFx0XHRldnQuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRldnQucGFyZW50RXZlbnRJZCA9IGR0by5wYXJlbnRFdmVudElkO1xuXHRcdFx0XHRldnQubW9kZWwgPSBkdG8ubW9kZWw7XG5cdFx0XHRcdGV2dC5yZXF1ZXN0TmFtZSA9IGR0by5yZXF1ZXN0TmFtZTtcblx0XHRcdFx0ZXZ0LmlucHV0VG9rZW5zID0gZHRvLmlucHV0VG9rZW5zO1xuXHRcdFx0XHRldnQub3V0cHV0VG9rZW5zID0gZHRvLm91dHB1dFRva2Vucztcblx0XHRcdFx0ZXZ0LmNhY2hlZFRva2VucyA9IGR0by5jYWNoZWRUb2tlbnM7XG5cdFx0XHRcdGV2dC50b3RhbFRva2VucyA9IGR0by50b3RhbFRva2Vucztcblx0XHRcdFx0ZXZ0LmNvcGlsb3RVc2FnZU5hbm9BaXUgPSBkdG8uY29waWxvdFVzYWdlTmFub0FpdTtcblx0XHRcdFx0ZXZ0LmR1cmF0aW9uSW5NaWxsaXMgPSBkdG8uZHVyYXRpb25Jbk1pbGxpcztcblx0XHRcdFx0cmV0dXJuIGV2dDtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dlbmVyaWMnOiB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IG5ldyBDaGF0RGVidWdHZW5lcmljRXZlbnQoZHRvLm5hbWUsIGR0by5sZXZlbCBhcyBDaGF0RGVidWdMb2dMZXZlbCwgY3JlYXRlZCk7XG5cdFx0XHRcdGV2dC5pZCA9IGR0by5pZDtcblx0XHRcdFx0ZXZ0LnNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0ZXZ0LnBhcmVudEV2ZW50SWQgPSBkdG8ucGFyZW50RXZlbnRJZDtcblx0XHRcdFx0ZXZ0LmRldGFpbHMgPSBkdG8uZGV0YWlscztcblx0XHRcdFx0ZXZ0LmNhdGVnb3J5ID0gZHRvLmNhdGVnb3J5O1xuXHRcdFx0XHRyZXR1cm4gZXZ0O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc3ViYWdlbnRJbnZvY2F0aW9uJzoge1xuXHRcdFx0XHRjb25zdCBldnQgPSBuZXcgQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQoZHRvLmFnZW50TmFtZSwgY3JlYXRlZCk7XG5cdFx0XHRcdGV2dC5pZCA9IGR0by5pZDtcblx0XHRcdFx0ZXZ0LnNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0ZXZ0LnBhcmVudEV2ZW50SWQgPSBkdG8ucGFyZW50RXZlbnRJZDtcblx0XHRcdFx0ZXZ0LmRlc2NyaXB0aW9uID0gZHRvLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRldnQuc3RhdHVzID0gZHRvLnN0YXR1cyA9PT0gJ3J1bm5pbmcnID8gQ2hhdERlYnVnU3ViYWdlbnRTdGF0dXMuUnVubmluZ1xuXHRcdFx0XHRcdDogZHRvLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcgPyBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cy5Db21wbGV0ZWRcblx0XHRcdFx0XHRcdDogZHRvLnN0YXR1cyA9PT0gJ2ZhaWxlZCcgPyBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cy5GYWlsZWRcblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdGV2dC5kdXJhdGlvbkluTWlsbGlzID0gZHRvLmR1cmF0aW9uSW5NaWxsaXM7XG5cdFx0XHRcdGV2dC50b29sQ2FsbENvdW50ID0gZHRvLnRvb2xDYWxsQ291bnQ7XG5cdFx0XHRcdGV2dC5tb2RlbFR1cm5Db3VudCA9IGR0by5tb2RlbFR1cm5Db3VudDtcblx0XHRcdFx0cmV0dXJuIGV2dDtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzoge1xuXHRcdFx0XHRjb25zdCBldnQgPSBuZXcgQ2hhdERlYnVnVXNlck1lc3NhZ2VFdmVudChkdG8ubWVzc2FnZSwgY3JlYXRlZCk7XG5cdFx0XHRcdGV2dC5pZCA9IGR0by5pZDtcblx0XHRcdFx0ZXZ0LnNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0ZXZ0LnBhcmVudEV2ZW50SWQgPSBkdG8ucGFyZW50RXZlbnRJZDtcblx0XHRcdFx0ZXZ0LnNlY3Rpb25zID0gZHRvLnNlY3Rpb25zLm1hcChzID0+IG5ldyBDaGF0RGVidWdNZXNzYWdlU2VjdGlvbihzLm5hbWUsIHMuY29udGVudCkpO1xuXHRcdFx0XHRyZXR1cm4gZXZ0O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYWdlbnRSZXNwb25zZSc6IHtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IENoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudChkdG8ubWVzc2FnZSwgY3JlYXRlZCk7XG5cdFx0XHRcdGV2dC5pZCA9IGR0by5pZDtcblx0XHRcdFx0ZXZ0LnNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0ZXZ0LnBhcmVudEV2ZW50SWQgPSBkdG8ucGFyZW50RXZlbnRJZDtcblx0XHRcdFx0ZXZ0LnNlY3Rpb25zID0gZHRvLnNlY3Rpb25zLm1hcChzID0+IG5ldyBDaGF0RGVidWdNZXNzYWdlU2VjdGlvbihzLm5hbWUsIHMuY29udGVudCkpO1xuXHRcdFx0XHRyZXR1cm4gZXZ0O1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQkb25Db3JlRGVidWdFdmVudChkdG86IElDaGF0RGVidWdFdmVudER0byk6IHZvaWQge1xuXHRcdGNvbnN0IGV2ZW50ID0gdGhpcy5fZGVzZXJpYWxpemVFdmVudChkdG8pO1xuXHRcdGlmIChldmVudCkge1xuXHRcdFx0dGhpcy5fb25EaWRBZGRDb3JlRXZlbnQuZmlyZShldmVudCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJGV4cG9ydENoYXREZWJ1Z0xvZyhfaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZTogVXJpQ29tcG9uZW50cywgY29yZUV2ZW50RHRvczogSUNoYXREZWJ1Z0V2ZW50RHRvW10sIHNlc3Npb25UaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFZTQnVmZmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlcj8ucHJvdmlkZUNoYXREZWJ1Z0xvZ0V4cG9ydCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBjb3JlRXZlbnRzID0gY29yZUV2ZW50RHRvcy5tYXAoZHRvID0+IHRoaXMuX2Rlc2VyaWFsaXplRXZlbnQoZHRvKSkuZmlsdGVyKChlKTogZSBpcyB2c2NvZGUuQ2hhdERlYnVnRXZlbnQgPT4gZSAhPT0gdW5kZWZpbmVkKTtcblx0XHRjb25zdCBvcHRpb25zOiB2c2NvZGUuQ2hhdERlYnVnTG9nRXhwb3J0T3B0aW9ucyA9IHsgY29yZUV2ZW50cywgc2Vzc2lvblRpdGxlIH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUNoYXREZWJ1Z0xvZ0V4cG9ydChzZXNzaW9uVXJpLCBvcHRpb25zLCB0b2tlbik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBWU0J1ZmZlci53cmFwKHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyAkaW1wb3J0Q2hhdERlYnVnTG9nKF9oYW5kbGU6IG51bWJlciwgZGF0YTogVlNCdWZmZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyB1cmk6IFVyaUNvbXBvbmVudHM7IHNlc3Npb25UaXRsZT86IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlcj8ucmVzb2x2ZUNoYXREZWJ1Z0xvZ0ltcG9ydCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucmVzb2x2ZUNoYXREZWJ1Z0xvZ0ltcG9ydChkYXRhLmJ1ZmZlciwgdG9rZW4pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyB1cmk6IHJlc3VsdC51cmksIHNlc3Npb25UaXRsZTogcmVzdWx0LnNlc3Npb25UaXRsZSB9O1xuXHR9XG5cblx0YXN5bmMgJGdldEF2YWlsYWJsZURlYnVnU2Vzc2lvblJlc291cmNlcyhfaGFuZGxlOiBudW1iZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8eyB1cmk6IFVyaUNvbXBvbmVudHM7IHRpdGxlPzogc3RyaW5nIH1bXT4ge1xuXHRcdGlmICghdGhpcy5fcHJvdmlkZXI/LnByb3ZpZGVBdmFpbGFibGVEZWJ1Z1Nlc3Npb25SZXNvdXJjZXMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUF2YWlsYWJsZURlYnVnU2Vzc2lvblJlc291cmNlcyh0b2tlbik7XG5cdFx0cmV0dXJuIHJlc3VsdCA/PyBbXTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzdG9yZSBvZiB0aGlzLl9hY3RpdmVQcm9ncmVzcy52YWx1ZXMoKSkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVQcm9ncmVzcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxXQUEwQjtB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
