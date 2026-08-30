var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _ctxHasProvider, _ctxHasNotebookProvider, _ctxPossible, _store, _data;
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, dispose, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { autorun, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { isCodeEditor, isCompositeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IChatAgentService } from "../../chat/common/participants/chatAgents.js";
import { ModifiedFileEntryState } from "../../chat/common/editing/chatEditingService.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../chat/common/tools/languageModelToolsService.js";
import { CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT, CTX_INLINE_CHAT_POSSIBLE, InlineChatConfigKeys } from "../common/inlineChat.js";
import { IInlineChatSessionService } from "./inlineChatSessionService.js";
const _InlineChatError = class _InlineChatError extends Error {
  constructor(message) {
    super(message);
    this.name = _InlineChatError.code;
  }
};
_InlineChatError.code = "InlineChatError";
let InlineChatError = _InlineChatError;
let InlineChatSessionServiceImpl = class {
  constructor(chatService, chatAgentService) {
    this.#store = new DisposableStore();
    this.#sessions = new ResourceMap();
    this.#onWillStartSession = this.#store.add(new Emitter());
    this.onWillStartSession = this.#onWillStartSession.event;
    this.#onDidChangeSessions = this.#store.add(new Emitter());
    this.onDidChangeSessions = this.#onDidChangeSessions.event;
    this.#chatService = chatService;
    const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
    this.#store.add(autorun((r) => {
      const agent = agentObs.read(r);
      if (!agent) {
        dispose(this.#sessions.values());
        this.#sessions.clear();
      }
    }));
  }
  #store;
  #sessions;
  #onWillStartSession;
  #onDidChangeSessions;
  #chatService;
  dispose() {
    this.#store.dispose();
  }
  createSession(editor) {
    const uri = editor.getModel().uri;
    if (this.#sessions.has(uri)) {
      throw new Error("Session already exists");
    }
    this.#onWillStartSession.fire(editor);
    const chatModelRef = this.#chatService.startNewLocalSession(ChatAgentLocation.EditorInline, {
      canUseTools: false
      /* SEE https://github.com/microsoft/vscode/issues/279946 */
    });
    const chatModel = chatModelRef.object;
    chatModel.startEditingSession(false);
    const terminationState = observableValue(this, void 0);
    const store = new DisposableStore();
    store.add(toDisposable(() => {
      void this.#chatService.cancelCurrentRequestForSession(chatModel.sessionResource, "inlineChatSession");
      chatModel.editingSession?.reject();
      this.#sessions.delete(uri);
      this.#onDidChangeSessions.fire(this);
    }));
    store.add(chatModelRef);
    store.add(autorun((r) => {
      const entries = chatModel.editingSession?.entries.read(r);
      if (!entries?.length) {
        return;
      }
      const state = entries.find((entry) => isEqual(entry.modifiedURI, uri))?.state.read(r);
      if (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected) {
        const response = chatModel.getRequests().at(-1)?.response;
        if (response) {
          this.#chatService.notifyUserAction({
            sessionResource: response.session.sessionResource,
            requestId: response.requestId,
            agentId: response.agent?.id,
            command: response.slashCommand?.name,
            result: response.result,
            action: {
              kind: "inlineChat",
              action: state === ModifiedFileEntryState.Accepted ? "accepted" : "discarded"
            }
          });
        }
      }
      const allSettled = entries.every((entry) => {
        const state2 = entry.state.read(r);
        return (state2 === ModifiedFileEntryState.Accepted || state2 === ModifiedFileEntryState.Rejected) && !entry.isCurrentlyBeingModifiedBy.read(r);
      });
      if (allSettled && !chatModel.requestInProgress.read(void 0)) {
        store.dispose();
      }
    }));
    const result = {
      uri,
      initialPosition: editor.getSelection().getStartPosition().delta(-1),
      /* one line above selection start */
      initialSelection: editor.getSelection(),
      chatModel,
      editingSession: chatModel.editingSession,
      terminationState,
      setTerminationState: (state) => {
        terminationState.set(state, void 0);
        this.#onDidChangeSessions.fire(this);
      },
      dispose: store.dispose.bind(store)
    };
    this.#sessions.set(uri, result);
    this.#onDidChangeSessions.fire(this);
    return result;
  }
  getSessionByTextModel(uri) {
    let result = this.#sessions.get(uri);
    if (!result) {
      for (const [_, candidate] of this.#sessions) {
        const entry = candidate.editingSession.getEntry(uri);
        if (entry) {
          result = candidate;
          break;
        }
      }
    }
    return result;
  }
  getSessionBySessionUri(sessionResource) {
    for (const session of this.#sessions.values()) {
      if (isEqual(session.chatModel.sessionResource, sessionResource)) {
        return session;
      }
    }
    return void 0;
  }
};
InlineChatSessionServiceImpl = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IChatAgentService)
], InlineChatSessionServiceImpl);
let InlineChatEnabler = class {
  constructor(contextKeyService, chatAgentService, editorService, configService) {
    __privateAdd(this, _ctxHasProvider);
    __privateAdd(this, _ctxHasNotebookProvider);
    __privateAdd(this, _ctxPossible);
    __privateAdd(this, _store, new DisposableStore());
    __privateSet(this, _ctxHasProvider, CTX_INLINE_CHAT_HAS_AGENT.bindTo(contextKeyService));
    __privateSet(this, _ctxHasNotebookProvider, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT.bindTo(contextKeyService));
    __privateSet(this, _ctxPossible, CTX_INLINE_CHAT_POSSIBLE.bindTo(contextKeyService));
    const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
    const notebookAgentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
    const notebookAgentConfigObs = observableConfigValue(InlineChatConfigKeys.NotebookAgent, false, configService);
    __privateGet(this, _store).add(autorun((r) => {
      const agent = agentObs.read(r);
      if (!agent) {
        __privateGet(this, _ctxHasProvider).reset();
      } else {
        __privateGet(this, _ctxHasProvider).set(true);
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      __privateGet(this, _ctxHasNotebookProvider).set(notebookAgentConfigObs.read(r) && !!notebookAgentObs.read(r));
    }));
    const updateEditor = () => {
      const ctrl = editorService.activeEditorPane?.getControl();
      const isCodeEditorLike = isCodeEditor(ctrl) || isDiffEditor(ctrl) || isCompositeEditor(ctrl);
      __privateGet(this, _ctxPossible).set(isCodeEditorLike);
    };
    __privateGet(this, _store).add(editorService.onDidActiveEditorChange(updateEditor));
    updateEditor();
  }
  dispose() {
    __privateGet(this, _ctxPossible).reset();
    __privateGet(this, _ctxHasProvider).reset();
    __privateGet(this, _store).dispose();
  }
};
_ctxHasProvider = new WeakMap();
_ctxHasNotebookProvider = new WeakMap();
_ctxPossible = new WeakMap();
_store = new WeakMap();
InlineChatEnabler.Id = "inlineChat.enabler";
InlineChatEnabler = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IConfigurationService)
], InlineChatEnabler);
let InlineChatEscapeToolContribution = class extends Disposable {
  constructor(lmTools, inlineChatSessionService, logService) {
    super();
    this._store.add(lmTools.registerTool(__privateGet(InlineChatEscapeToolContribution, _data), {
      invoke: async (invocation, _tokenCountFn, _progress, _token) => {
        const sessionResource = invocation.context?.sessionResource;
        if (!sessionResource) {
          logService.warn("InlineChatEscapeToolContribution: no sessionId in tool invocation context");
          return { content: [{ kind: "text", value: "Cancel" }] };
        }
        const session = inlineChatSessionService.getSessionBySessionUri(sessionResource);
        if (!session) {
          logService.warn(`InlineChatEscapeToolContribution: no session found for id ${sessionResource}`);
          return { content: [{ kind: "text", value: "Cancel" }] };
        }
        const lastRequest = session.chatModel.getRequests().at(-1);
        if (!lastRequest) {
          logService.warn(`InlineChatEscapeToolContribution: no request found for id ${sessionResource}`);
          return { content: [{ kind: "text", value: "Cancel" }], toolResultMessage: localize("tool.cancel", "Cancel") };
        }
        const response = typeof invocation.parameters?.response === "string" && invocation.parameters.response.trim().length > 0 ? invocation.parameters.response.trim() : localize("terminated.message", "Inline chat is designed for making single-file code changes. Continue your request in the Chat view or rephrase it for inline chat.");
        session.setTerminationState(response);
        return { content: [{ kind: "text", value: "Success" }] };
      }
    }));
  }
};
_data = new WeakMap();
InlineChatEscapeToolContribution.Id = "inlineChat.escapeTool";
__privateAdd(InlineChatEscapeToolContribution, _data, {
  id: "inline_chat_exit",
  source: ToolDataSource.Internal,
  canBeReferencedInPrompt: false,
  alwaysDisplayInputOutput: false,
  displayName: localize("name", "Inline Chat to Panel Chat"),
  modelDescription: "Show a short textual response when not being able to make code changes and when not having been asked for code changes. Can also be used to move the request to the richer panel chat which supports edits across files, creating and deleting files, multi-turn conversations between the user and the assistant, and access to more IDE tools, like retrieve problems, interact with source control, run terminal commands etc.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      response: {
        type: "string",
        description: localize("response.description", "Optional brief response for inline chat. Keep it at 10 words or fewer."),
        maxLength: 200
      }
    }
  }
});
InlineChatEscapeToolContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInlineChatSessionService),
  __decorateParam(2, ILogService)
], InlineChatEscapeToolContribution);
export {
  InlineChatEnabler,
  InlineChatError,
  InlineChatEscapeToolContribution,
  InlineChatSessionServiceImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXGJyb3dzZXJcXGlubGluZUNoYXRTZXNzaW9uU2VydmljZUltcGwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IsIGlzQ29tcG9zaXRlRWRpdG9yLCBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ1RYX0lOTElORV9DSEFUX0hBU19BR0VOVCwgQ1RYX0lOTElORV9DSEFUX0hBU19OT1RFQk9PS19BR0VOVCwgQ1RYX0lOTElORV9DSEFUX1BPU1NJQkxFLCBJbmxpbmVDaGF0Q29uZmlnS2V5cyB9IGZyb20gJy4uL2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCB7IElJbmxpbmVDaGF0U2Vzc2lvbiwgSUlubGluZUNoYXRTZXNzaW9uU2VydmljZSwgSW5saW5lQ2hhdFNlc3Npb25UZXJtaW5hdGlvblN0YXRlIH0gZnJvbSAnLi9pbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lQ2hhdEVycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRzdGF0aWMgcmVhZG9ubHkgY29kZSA9ICdJbmxpbmVDaGF0RXJyb3InO1xuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRzdXBlcihtZXNzYWdlKTtcblx0XHR0aGlzLm5hbWUgPSBJbmxpbmVDaGF0RXJyb3IuY29kZTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlSW1wbCBpbXBsZW1lbnRzIElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5ICNzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cmVhZG9ubHkgI3Nlc3Npb25zID0gbmV3IFJlc291cmNlTWFwPElJbmxpbmVDaGF0U2Vzc2lvbj4oKTtcblxuXHRyZWFkb25seSAjb25XaWxsU3RhcnRTZXNzaW9uID0gdGhpcy4jc3RvcmUuYWRkKG5ldyBFbWl0dGVyPElBY3RpdmVDb2RlRWRpdG9yPigpKTtcblx0cmVhZG9ubHkgb25XaWxsU3RhcnRTZXNzaW9uOiBFdmVudDxJQWN0aXZlQ29kZUVkaXRvcj4gPSB0aGlzLiNvbldpbGxTdGFydFNlc3Npb24uZXZlbnQ7XG5cblx0cmVhZG9ubHkgI29uRGlkQ2hhbmdlU2Vzc2lvbnMgPSB0aGlzLiNzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dGhpcz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PHRoaXM+ID0gdGhpcy4jb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblxuXHRyZWFkb25seSAjY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLiNjaGF0U2VydmljZSA9IGNoYXRTZXJ2aWNlO1xuXHRcdC8vIExpc3RlbiBmb3IgYWdlbnQgY2hhbmdlcyBhbmQgZGlzcG9zZSBhbGwgc2Vzc2lvbnMgd2hlbiB0aGVyZSBpcyBubyBhZ2VudFxuXHRcdGNvbnN0IGFnZW50T2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBjaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzLCAoKSA9PiBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpKTtcblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IGFnZW50ID0gYWdlbnRPYnMucmVhZChyKTtcblx0XHRcdGlmICghYWdlbnQpIHtcblx0XHRcdFx0Ly8gTm8gYWdlbnQgYXZhaWxhYmxlLCBkaXNwb3NlIGFsbCBzZXNzaW9uc1xuXHRcdFx0XHRkaXNwb3NlKHRoaXMuI3Nlc3Npb25zLnZhbHVlcygpKTtcblx0XHRcdFx0dGhpcy4jc2Vzc2lvbnMuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuI3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxuXG5cblx0Y3JlYXRlU2Vzc2lvbihlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yKTogSUlubGluZUNoYXRTZXNzaW9uIHtcblx0XHRjb25zdCB1cmkgPSBlZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cblx0XHRpZiAodGhpcy4jc2Vzc2lvbnMuaGFzKHVyaSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2Vzc2lvbiBhbHJlYWR5IGV4aXN0cycpO1xuXHRcdH1cblxuXHRcdHRoaXMuI29uV2lsbFN0YXJ0U2Vzc2lvbi5maXJlKGVkaXRvcik7XG5cblx0XHRjb25zdCBjaGF0TW9kZWxSZWYgPSB0aGlzLiNjaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUsIHsgY2FuVXNlVG9vbHM6IGZhbHNlIC8qIFNFRSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjc5OTQ2ICovIH0pO1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IGNoYXRNb2RlbFJlZi5vYmplY3Q7XG5cdFx0Y2hhdE1vZGVsLnN0YXJ0RWRpdGluZ1Nlc3Npb24oZmFsc2UpO1xuXHRcdGNvbnN0IHRlcm1pbmF0aW9uU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SW5saW5lQ2hhdFNlc3Npb25UZXJtaW5hdGlvblN0YXRlIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuI2NoYXRTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlLCAnaW5saW5lQ2hhdFNlc3Npb24nKTtcblx0XHRcdGNoYXRNb2RlbC5lZGl0aW5nU2Vzc2lvbj8ucmVqZWN0KCk7XG5cdFx0XHR0aGlzLiNzZXNzaW9ucy5kZWxldGUodXJpKTtcblx0XHRcdHRoaXMuI29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh0aGlzKTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGNoYXRNb2RlbFJlZik7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0Y29uc3QgZW50cmllcyA9IGNoYXRNb2RlbC5lZGl0aW5nU2Vzc2lvbj8uZW50cmllcy5yZWFkKHIpO1xuXHRcdFx0aWYgKCFlbnRyaWVzPy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGVudHJpZXMuZmluZChlbnRyeSA9PiBpc0VxdWFsKGVudHJ5Lm1vZGlmaWVkVVJJLCB1cmkpKT8uc3RhdGUucmVhZChyKTtcblx0XHRcdGlmIChzdGF0ZSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCB8fCBzdGF0ZSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5SZWplY3RlZCkge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKT8ucmVzcG9uc2U7XG5cdFx0XHRcdGlmIChyZXNwb25zZSkge1xuXHRcdFx0XHRcdHRoaXMuI2NoYXRTZXJ2aWNlLm5vdGlmeVVzZXJBY3Rpb24oe1xuXHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiByZXNwb25zZS5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogcmVzcG9uc2UucmVxdWVzdElkLFxuXHRcdFx0XHRcdFx0YWdlbnRJZDogcmVzcG9uc2UuYWdlbnQ/LmlkLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogcmVzcG9uc2Uuc2xhc2hDb21tYW5kPy5uYW1lLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiByZXNwb25zZS5yZXN1bHQsXG5cdFx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2lubGluZUNoYXQnLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb246IHN0YXRlID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLkFjY2VwdGVkID8gJ2FjY2VwdGVkJyA6ICdkaXNjYXJkZWQnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWxsU2V0dGxlZCA9IGVudHJpZXMuZXZlcnkoZW50cnkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGVudHJ5LnN0YXRlLnJlYWQocik7XG5cdFx0XHRcdHJldHVybiAoc3RhdGUgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQgfHwgc3RhdGUgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuUmVqZWN0ZWQpXG5cdFx0XHRcdFx0JiYgIWVudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5LnJlYWQocik7XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGFsbFNldHRsZWQgJiYgIWNoYXRNb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5yZWFkKHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0Ly8gc2VsZiB0ZXJtaW5hdGVcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSUlubGluZUNoYXRTZXNzaW9uID0ge1xuXHRcdFx0dXJpLFxuXHRcdFx0aW5pdGlhbFBvc2l0aW9uOiBlZGl0b3IuZ2V0U2VsZWN0aW9uKCkuZ2V0U3RhcnRQb3NpdGlvbigpLmRlbHRhKC0xKSwgLyogb25lIGxpbmUgYWJvdmUgc2VsZWN0aW9uIHN0YXJ0ICovXG5cdFx0XHRpbml0aWFsU2VsZWN0aW9uOiBlZGl0b3IuZ2V0U2VsZWN0aW9uKCksXG5cdFx0XHRjaGF0TW9kZWwsXG5cdFx0XHRlZGl0aW5nU2Vzc2lvbjogY2hhdE1vZGVsLmVkaXRpbmdTZXNzaW9uISxcblx0XHRcdHRlcm1pbmF0aW9uU3RhdGUsXG5cdFx0XHRzZXRUZXJtaW5hdGlvblN0YXRlOiBzdGF0ZSA9PiB7XG5cdFx0XHRcdHRlcm1pbmF0aW9uU3RhdGUuc2V0KHN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLiNvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUodGhpcyk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogc3RvcmUuZGlzcG9zZS5iaW5kKHN0b3JlKVxuXHRcdH07XG5cdFx0dGhpcy4jc2Vzc2lvbnMuc2V0KHVyaSwgcmVzdWx0KTtcblx0XHR0aGlzLiNvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUodGhpcyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldFNlc3Npb25CeVRleHRNb2RlbCh1cmk6IFVSSSk6IElJbmxpbmVDaGF0U2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHJlc3VsdCA9IHRoaXMuI3Nlc3Npb25zLmdldCh1cmkpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHQvLyBubyBkaXJlY3Qgc2Vzc2lvbiwgdHJ5IHRvIGZpbmQgYW4gZWRpdGluZyBzZXNzaW9uIHdoaWNoIGhhcyBhIGZpbGUgZW50cnkgZm9yIHRoZSB1cmlcblx0XHRcdGZvciAoY29uc3QgW18sIGNhbmRpZGF0ZV0gb2YgdGhpcy4jc2Vzc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBjYW5kaWRhdGUuZWRpdGluZ1Nlc3Npb24uZ2V0RW50cnkodXJpKTtcblx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gY2FuZGlkYXRlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRTZXNzaW9uQnlTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUlubGluZUNoYXRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy4jc2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChpc0VxdWFsKHNlc3Npb24uY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lQ2hhdEVuYWJsZXIge1xuXG5cdHN0YXRpYyBJZCA9ICdpbmxpbmVDaGF0LmVuYWJsZXInO1xuXG5cdHJlYWRvbmx5ICNjdHhIYXNQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHJlYWRvbmx5ICNjdHhIYXNOb3RlYm9va1Byb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cmVhZG9ubHkgI2N0eFBvc3NpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRyZWFkb25seSAjc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuI2N0eEhhc1Byb3ZpZGVyID0gQ1RYX0lOTElORV9DSEFUX0hBU19BR0VOVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuI2N0eEhhc05vdGVib29rUHJvdmlkZXIgPSBDVFhfSU5MSU5FX0NIQVRfSEFTX05PVEVCT09LX0FHRU5ULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy4jY3R4UG9zc2libGUgPSBDVFhfSU5MSU5FX0NIQVRfUE9TU0lCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGFnZW50T2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBjaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzLCAoKSA9PiBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpKTtcblx0XHRjb25zdCBub3RlYm9va0FnZW50T2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBjaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzLCAoKSA9PiBjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vaykpO1xuXHRcdGNvbnN0IG5vdGVib29rQWdlbnRDb25maWdPYnMgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoSW5saW5lQ2hhdENvbmZpZ0tleXMuTm90ZWJvb2tBZ2VudCwgZmFsc2UsIGNvbmZpZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGFnZW50T2JzLnJlYWQocik7XG5cdFx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRcdHRoaXMuI2N0eEhhc1Byb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLiNjdHhIYXNQcm92aWRlci5zZXQodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHR0aGlzLiNjdHhIYXNOb3RlYm9va1Byb3ZpZGVyLnNldChub3RlYm9va0FnZW50Q29uZmlnT2JzLnJlYWQocikgJiYgISFub3RlYm9va0FnZW50T2JzLnJlYWQocikpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUVkaXRvciA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGN0cmwgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmdldENvbnRyb2woKTtcblx0XHRcdGNvbnN0IGlzQ29kZUVkaXRvckxpa2UgPSBpc0NvZGVFZGl0b3IoY3RybCkgfHwgaXNEaWZmRWRpdG9yKGN0cmwpIHx8IGlzQ29tcG9zaXRlRWRpdG9yKGN0cmwpO1xuXHRcdFx0dGhpcy4jY3R4UG9zc2libGUuc2V0KGlzQ29kZUVkaXRvckxpa2UpO1xuXHRcdH07XG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSh1cGRhdGVFZGl0b3IpKTtcblx0XHR1cGRhdGVFZGl0b3IoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy4jY3R4UG9zc2libGUucmVzZXQoKTtcblx0XHR0aGlzLiNjdHhIYXNQcm92aWRlci5yZXNldCgpO1xuXHRcdHRoaXMuI3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVDaGF0RXNjYXBlVG9vbENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJZCA9ICdpbmxpbmVDaGF0LmVzY2FwZVRvb2wnO1xuXHRzdGF0aWMgcmVhZG9ubHkgI2RhdGE6IElUb29sRGF0YSA9IHtcblx0XHRpZDogJ2lubGluZV9jaGF0X2V4aXQnLFxuXHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IGZhbHNlLFxuXHRcdGFsd2F5c0Rpc3BsYXlJbnB1dE91dHB1dDogZmFsc2UsXG5cdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCduYW1lJywgXCJJbmxpbmUgQ2hhdCB0byBQYW5lbCBDaGF0XCIpLFxuXHRcdG1vZGVsRGVzY3JpcHRpb246ICdTaG93IGEgc2hvcnQgdGV4dHVhbCByZXNwb25zZSB3aGVuIG5vdCBiZWluZyBhYmxlIHRvIG1ha2UgY29kZSBjaGFuZ2VzIGFuZCB3aGVuIG5vdCBoYXZpbmcgYmVlbiBhc2tlZCBmb3IgY29kZSBjaGFuZ2VzLiBDYW4gYWxzbyBiZSB1c2VkIHRvIG1vdmUgdGhlIHJlcXVlc3QgdG8gdGhlIHJpY2hlciBwYW5lbCBjaGF0IHdoaWNoIHN1cHBvcnRzIGVkaXRzIGFjcm9zcyBmaWxlcywgY3JlYXRpbmcgYW5kIGRlbGV0aW5nIGZpbGVzLCBtdWx0aS10dXJuIGNvbnZlcnNhdGlvbnMgYmV0d2VlbiB0aGUgdXNlciBhbmQgdGhlIGFzc2lzdGFudCwgYW5kIGFjY2VzcyB0byBtb3JlIElERSB0b29scywgbGlrZSByZXRyaWV2ZSBwcm9ibGVtcywgaW50ZXJhY3Qgd2l0aCBzb3VyY2UgY29udHJvbCwgcnVuIHRlcm1pbmFsIGNvbW1hbmRzIGV0Yy4nLFxuXHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0cmVzcG9uc2U6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Jlc3BvbnNlLmRlc2NyaXB0aW9uJywgXCJPcHRpb25hbCBicmllZiByZXNwb25zZSBmb3IgaW5saW5lIGNoYXQuIEtlZXAgaXQgYXQgMTAgd29yZHMgb3IgZmV3ZXIuXCIpLFxuXHRcdFx0XHRcdG1heExlbmd0aDogMjAwLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBsbVRvb2xzOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUlubGluZUNoYXRTZXNzaW9uU2VydmljZSBpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2U6IElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQobG1Ub29scy5yZWdpc3RlclRvb2woSW5saW5lQ2hhdEVzY2FwZVRvb2xDb250cmlidXRpb24uI2RhdGEsIHtcblx0XHRcdGludm9rZTogYXN5bmMgKGludm9jYXRpb24sIF90b2tlbkNvdW50Rm4sIF9wcm9ncmVzcywgX3Rva2VuKSA9PiB7XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2U7XG5cblx0XHRcdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oJ0lubGluZUNoYXRFc2NhcGVUb29sQ29udHJpYnV0aW9uOiBubyBzZXNzaW9uSWQgaW4gdG9vbCBpbnZvY2F0aW9uIGNvbnRleHQnKTtcblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnQ2FuY2VsJyB9XSB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGlubGluZUNoYXRTZXNzaW9uU2VydmljZS5nZXRTZXNzaW9uQnlTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBJbmxpbmVDaGF0RXNjYXBlVG9vbENvbnRyaWJ1dGlvbjogbm8gc2Vzc2lvbiBmb3VuZCBmb3IgaWQgJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ0NhbmNlbCcgfV0gfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gc2Vzc2lvbi5jaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0XHRcdGlmICghbGFzdFJlcXVlc3QpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYElubGluZUNoYXRFc2NhcGVUb29sQ29udHJpYnV0aW9uOiBubyByZXF1ZXN0IGZvdW5kIGZvciBpZCAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnQ2FuY2VsJyB9XSwgdG9vbFJlc3VsdE1lc3NhZ2U6IGxvY2FsaXplKCd0b29sLmNhbmNlbCcsIFwiQ2FuY2VsXCIpIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IHR5cGVvZiBpbnZvY2F0aW9uLnBhcmFtZXRlcnM/LnJlc3BvbnNlID09PSAnc3RyaW5nJyAmJiBpbnZvY2F0aW9uLnBhcmFtZXRlcnMucmVzcG9uc2UudHJpbSgpLmxlbmd0aCA+IDBcblx0XHRcdFx0XHQ/IGludm9jYXRpb24ucGFyYW1ldGVycy5yZXNwb25zZS50cmltKClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCd0ZXJtaW5hdGVkLm1lc3NhZ2UnLCBcIklubGluZSBjaGF0IGlzIGRlc2lnbmVkIGZvciBtYWtpbmcgc2luZ2xlLWZpbGUgY29kZSBjaGFuZ2VzLiBDb250aW51ZSB5b3VyIHJlcXVlc3QgaW4gdGhlIENoYXQgdmlldyBvciByZXBocmFzZSBpdCBmb3IgaW5saW5lIGNoYXQuXCIpO1xuXG5cdFx0XHRcdHNlc3Npb24uc2V0VGVybWluYXRpb25TdGF0ZShyZXNwb25zZSk7XG5cdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdTdWNjZXNzJyB9XSB9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUE7QUFJQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxTQUFTLGlCQUFpQixvQkFBb0I7QUFDbkUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxTQUFTLHFCQUFxQix1QkFBdUI7QUFDOUQsU0FBUyxlQUFlO0FBRXhCLFNBQTRCLGNBQWMsbUJBQW1CLG9CQUFvQjtBQUNqRixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBdUMsc0JBQXNCO0FBQ3RFLFNBQVMsMkJBQTJCLG9DQUFvQywwQkFBMEIsNEJBQTRCO0FBQzlILFNBQTZCLGlDQUFvRTtBQUUxRixNQUFNLG1CQUFOLE1BQU0seUJBQXdCLE1BQU07QUFBQSxFQUUxQyxZQUFZLFNBQWlCO0FBQzVCLFVBQU0sT0FBTztBQUNiLFNBQUssT0FBTyxpQkFBZ0I7QUFBQSxFQUM3QjtBQUNEO0FBTmEsaUJBQ0ksT0FBTztBQURqQixJQUFNLGtCQUFOO0FBUUEsSUFBTSwrQkFBTixNQUF3RTtBQUFBLEVBZTlFLFlBQ2UsYUFDSyxrQkFDbEI7QUFkRixTQUFTLFNBQVMsSUFBSSxnQkFBZ0I7QUFDdEMsU0FBUyxZQUFZLElBQUksWUFBZ0M7QUFFekQsU0FBUyxzQkFBc0IsS0FBSyxPQUFPLElBQUksSUFBSSxRQUEyQixDQUFDO0FBQy9FLFNBQVMscUJBQStDLEtBQUssb0JBQW9CO0FBRWpGLFNBQVMsdUJBQXVCLEtBQUssT0FBTyxJQUFJLElBQUksUUFBYyxD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
