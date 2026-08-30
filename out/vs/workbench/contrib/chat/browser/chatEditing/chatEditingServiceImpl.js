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
import { compareBy, delta } from "../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { groupBy } from "../../../../../base/common/collections.js";
import { ErrorNoTelemetry } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../../base/common/lifecycle.js";
import { LinkedList } from "../../../../../base/common/linkedList.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { derived, observableValueOpts, runOnChange, ValueWithChangeEventFromObservable } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { compare } from "../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { assertType } from "../../../../../base/common/types.js";
import { TextEdit } from "../../../../../editor/common/languages.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IMultiDiffSourceResolverService, MultiDiffEditorItem } from "../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { CellUri } from "../../../notebook/common/notebookCommon.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME, chatEditingAgentSupportsReadonlyReferencesContextKey, chatEditingResourceContextKey, ChatEditingSessionState, inChatEditingSessionContextKey, ModifiedFileEntryState, parseChatMultiDiffUri } from "../../common/editing/chatEditingService.js";
import { isCellTextEditOperationArray } from "../../common/model/chatModel.js";
import { IChatService } from "../../common/chatService/chatService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { ChatEditorInput } from "../widgetHosts/editor/chatEditorInput.js";
import { AbstractChatEditingModifiedFileEntry } from "./chatEditingModifiedFileEntry.js";
import { ChatEditingSession } from "./chatEditingSession.js";
import { ChatEditingSnapshotTextModelContentProvider, ChatEditingTextModelContentProvider } from "./chatEditingTextModelContentProviders.js";
let ChatEditingService = class extends Disposable {
  constructor(_instantiationService, multiDiffSourceResolverService, textModelService, contextKeyService, _chatService, _editorService, decorationsService, _fileService, lifecycleService, storageService, logService, extensionService, productService, notebookService, _configurationService) {
    super();
    this._instantiationService = _instantiationService;
    this._chatService = _chatService;
    this._editorService = _editorService;
    this._fileService = _fileService;
    this.lifecycleService = lifecycleService;
    this.notebookService = notebookService;
    this._configurationService = _configurationService;
    this._providers = /* @__PURE__ */ new Map();
    this._sessionsObs = observableValueOpts({ equalsFn: (a, b) => false }, new LinkedList());
    this.editingSessionsObs = derived((r) => {
      const result = Array.from(this._sessionsObs.read(r));
      return result;
    });
    this._register(decorationsService.registerDecorationsProvider(_instantiationService.createInstance(ChatDecorationsProvider, this.editingSessionsObs)));
    this._register(multiDiffSourceResolverService.registerResolver(_instantiationService.createInstance(ChatEditingMultiDiffSourceResolver, this.editingSessionsObs)));
    this._register(textModelService.registerTextModelContentProvider(ChatEditingTextModelContentProvider.scheme, _instantiationService.createInstance(ChatEditingTextModelContentProvider, this)));
    this._register(textModelService.registerTextModelContentProvider(Schemas.chatEditingSnapshotScheme, _instantiationService.createInstance(ChatEditingSnapshotTextModelContentProvider, this)));
    this._register(this._chatService.onDidDisposeSession((e) => {
      if (e.reason === "cleared") {
        for (const resource of e.sessionResources) {
          this.getEditingSession(resource)?.stop();
        }
      }
    }));
    const readonlyEnabledContextKey = chatEditingAgentSupportsReadonlyReferencesContextKey.bindTo(contextKeyService);
    const setReadonlyFilesEnabled = () => {
      const enabled = productService.quality !== "stable" && extensionService.extensions.some((e) => e.enabledApiProposals?.includes("chatReadonlyPromptReference"));
      readonlyEnabledContextKey.set(enabled);
    };
    setReadonlyFilesEnabled();
    this._register(extensionService.onDidRegisterExtensions(setReadonlyFilesEnabled));
    this._register(extensionService.onDidChangeExtensions(setReadonlyFilesEnabled));
    let storageTask;
    this._register(storageService.onWillSaveState(() => {
      const tasks = [];
      for (const session of this.editingSessionsObs.get()) {
        if (!session.isGlobalEditingSession) {
          continue;
        }
        tasks.push(session.storeState());
      }
      storageTask = Promise.resolve(storageTask).then(() => Promise.all(tasks)).finally(() => storageTask = void 0);
    }));
    this._register(this.lifecycleService.onWillShutdown((e) => {
      if (!storageTask) {
        return;
      }
      e.join(storageTask, {
        id: "join.chatEditingSession",
        label: localize("join.chatEditingSession", "Saving chat edits history")
      });
    }));
  }
  dispose() {
    dispose(this._sessionsObs.get());
    super.dispose();
  }
  startOrContinueGlobalEditingSession(chatModel) {
    return this.getEditingSession(chatModel.sessionResource) || this.createEditingSession(chatModel, true);
  }
  _lookupEntry(uri) {
    for (const item of Iterable.concat(this.editingSessionsObs.get())) {
      const candidate = item.getEntry(uri);
      if (candidate instanceof AbstractChatEditingModifiedFileEntry) {
        return candidate.acquire();
      }
    }
    return void 0;
  }
  getEditingSession(chatSessionResource) {
    return this.editingSessionsObs.get().find((candidate) => isEqual(candidate.chatSessionResource, chatSessionResource));
  }
  createEditingSession(chatModel, global = false) {
    return this._createEditingSession(chatModel, global, void 0);
  }
  transferEditingSession(chatModel, session) {
    return this._createEditingSession(chatModel, session.isGlobalEditingSession, session);
  }
  _createEditingSession(chatModel, global, initFrom) {
    assertType(this.getEditingSession(chatModel.sessionResource) === void 0, "CANNOT have more than one editing session per chat session");
    const provider = this._providers.get(getChatSessionType(chatModel.sessionResource));
    const session = provider ? provider.createEditingSession(chatModel.sessionResource) : this._instantiationService.createInstance(ChatEditingSession, chatModel.sessionResource, global, this._lookupEntry.bind(this), initFrom);
    const list = this._sessionsObs.get();
    const removeSession = list.unshift(session);
    const store = new DisposableStore();
    this._store.add(store);
    if (!provider && session instanceof ChatEditingSession) {
      store.add(this.installAutoApplyObserver(session, chatModel));
    }
    store.add(session.onDidDispose((e) => {
      removeSession();
      this._sessionsObs.set(list, void 0);
      this._store.delete(store);
    }));
    this._sessionsObs.set(list, void 0);
    return session;
  }
  registerEditingSessionProvider(scheme, provider) {
    this._providers.set(scheme, provider);
    return toDisposable(() => {
      if (this._providers.get(scheme) === provider) {
        this._providers.delete(scheme);
      }
    });
  }
  installAutoApplyObserver(session, chatModel) {
    if (!chatModel) {
      throw new ErrorNoTelemetry(`Edit session was created for a non-existing chat session: ${session.chatSessionResource}`);
    }
    const observerDisposables = new DisposableStore();
    observerDisposables.add(chatModel.onDidChange(async (e) => {
      if (e.kind !== "addRequest") {
        return;
      }
      session.createSnapshot(e.request.id, void 0);
      const responseModel = e.request.response;
      if (responseModel) {
        this.observerEditsInResponse(e.request.id, responseModel, session, observerDisposables);
      }
    }));
    observerDisposables.add(chatModel.onDidDispose(() => observerDisposables.dispose()));
    return observerDisposables;
  }
  observerEditsInResponse(requestId, responseModel, session, observerDisposables) {
    let K;
    ((K2) => {
      K2[K2["Stream"] = 0] = "Stream";
      K2[K2["Workspace"] = 1] = "Workspace";
    })(K || (K = {}));
    const editsSeen = [];
    const initialActiveEditor = this._editorService.activeEditorPane?.input;
    const editorOpenPromises = new ResourceMap();
    const openChatEditedFiles = this._configurationService.getValue("accessibility.openChatEditedFiles");
    const ensureEditorOpen = (partUri) => {
      const uri = CellUri.parse(partUri)?.notebook ?? partUri;
      if (editorOpenPromises.has(uri)) {
        return;
      }
      editorOpenPromises.set(uri, (async () => {
        if (this.notebookService.getNotebookTextModel(uri) || uri.scheme === Schemas.untitled || await this._fileService.exists(uri).catch(() => false)) {
          const activeUri = this._editorService.activeEditorPane?.input.resource;
          const currentActiveEditor = this._editorService.activeEditorPane?.input;
          const editorDidChange = initialActiveEditor && currentActiveEditor ? !initialActiveEditor.matches(currentActiveEditor) : initialActiveEditor !== currentActiveEditor;
          const inactive = editorDidChange || this._editorService.activeEditorPane?.input instanceof ChatEditorInput && isEqual(this._editorService.activeEditorPane.input.sessionResource, session.chatSessionResource) || Boolean(activeUri && session.entries.get().find((entry) => isEqual(activeUri, entry.modifiedURI)));
          this._editorService.openEditor({ resource: uri, options: { inactive, preserveFocus: true, pinned: true, isExplicit: false } });
        }
      })());
    };
    const onResponseComplete = () => {
      for (const remaining of editsSeen) {
        if (remaining?.kind === 0 /* Stream */) {
          remaining.stream.complete();
        }
      }
      editsSeen.length = 0;
      editorOpenPromises.clear();
    };
    const handleResponseParts = async () => {
      if (responseModel.isCanceled) {
        return;
      }
      let undoStop;
      for (let i = 0; i < responseModel.response.value.length; i++) {
        const part = responseModel.response.value[i];
        if (part.kind === "undoStop") {
          undoStop = part.id;
          continue;
        }
        if (part.kind === "workspaceEdit") {
          if (!editsSeen[i]) {
            editsSeen[i] = { kind: 1 /* Workspace */ };
            session.applyWorkspaceEdit(part, responseModel, undoStop ?? responseModel.requestId);
          }
          continue;
        }
        if (part.kind !== "textEditGroup" && part.kind !== "notebookEditGroup") {
          continue;
        }
        if (part.isExternalEdit) {
          continue;
        }
        if (openChatEditedFiles) {
          ensureEditorOpen(part.uri);
        }
        let entry = editsSeen[i];
        if (!entry) {
          entry = { kind: 0 /* Stream */, seen: 0, stream: session.startStreamingEdits(CellUri.parse(part.uri)?.notebook ?? part.uri, responseModel, undoStop) };
          editsSeen[i] = entry;
        }
        if (entry.kind !== 0 /* Stream */) {
          continue;
        }
        const isFirst = entry.seen === 0;
        const newEdits = part.edits.slice(entry.seen);
        entry.seen = part.edits.length;
        if (newEdits.length > 0 || isFirst) {
          for (let i2 = 0; i2 < newEdits.length; i2++) {
            const edit = newEdits[i2];
            const done = part.done ? i2 === newEdits.length - 1 : false;
            if (isTextEditOperationArray(edit)) {
              entry.stream.pushText(edit, done);
            } else if (isCellTextEditOperationArray(edit)) {
              for (const edits of Object.values(groupBy(edit, (e) => e.uri.toString()))) {
                if (edits) {
                  entry.stream.pushNotebookCellText(edits[0].uri, edits.map((e) => e.edit), done);
                }
              }
            } else {
              entry.stream.pushNotebook(edit, done);
            }
          }
        }
        if (part.done) {
          entry.stream.complete();
        }
      }
    };
    if (responseModel.isComplete) {
      handleResponseParts().then(() => {
        onResponseComplete();
      });
    } else {
      const disposable = observerDisposables.add(responseModel.onDidChange((e2) => {
        if (e2.reason === "undoStop") {
          session.createSnapshot(requestId, e2.id);
        } else {
          handleResponseParts().then(() => {
            if (responseModel.isComplete) {
              onResponseComplete();
              observerDisposables.delete(disposable);
            }
          });
        }
      }));
    }
  }
};
ChatEditingService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IMultiDiffSourceResolverService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IDecorationsService),
  __decorateParam(7, IFileService),
  __decorateParam(8, ILifecycleService),
  __decorateParam(9, IStorageService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IExtensionService),
  __decorateParam(12, IProductService),
  __decorateParam(13, INotebookService),
  __decorateParam(14, IConfigurationService)
], ChatEditingService);
function observeArrayChanges(obs, compare2, store) {
  const emitter = store.add(new Emitter());
  store.add(runOnChange(obs, (newArr, oldArr) => {
    const change = delta(oldArr || [], newArr, compare2);
    const changedElements = [].concat(change.added).concat(change.removed);
    emitter.fire(changedElements);
  }));
  return emitter.event;
}
class ChatDecorationsProvider extends Disposable {
  constructor(_sessions) {
    super();
    this._sessions = _sessions;
    this.label = localize("chat", "Chat Editing");
    this._currentEntries = derived(this, (r) => {
      const sessions = this._sessions.read(r);
      if (!sessions) {
        return [];
      }
      const result = [];
      for (const session of sessions) {
        if (session.state.read(r) !== ChatEditingSessionState.Disposed) {
          const entries = session.entries.read(r);
          result.push(...entries);
        }
      }
      return result;
    });
    this._currentlyEditingUris = derived(this, (r) => {
      const uri = this._currentEntries.read(r);
      return uri.filter((entry) => entry.isCurrentlyBeingModifiedBy.read(r)).map((entry) => entry.modifiedURI);
    });
    this._modifiedUris = derived(this, (r) => {
      const uri = this._currentEntries.read(r);
      return uri.filter((entry) => !entry.isCurrentlyBeingModifiedBy.read(r) && entry.state.read(r) === ModifiedFileEntryState.Modified).map((entry) => entry.modifiedURI);
    });
    this.onDidChange = Event.any(
      observeArrayChanges(this._currentlyEditingUris, compareBy((uri) => uri.toString(), compare), this._store),
      observeArrayChanges(this._modifiedUris, compareBy((uri) => uri.toString(), compare), this._store)
    );
  }
  provideDecorations(uri, _token) {
    const isCurrentlyBeingModified = this._currentlyEditingUris.get().some((e) => isEqual(e, uri));
    if (isCurrentlyBeingModified) {
      return {
        weight: 1e3,
        letter: ThemeIcon.modify(Codicon.loading, "spin"),
        bubble: false
      };
    }
    const isModified = this._modifiedUris.get().some((e) => isEqual(e, uri));
    if (isModified) {
      return {
        weight: 1e3,
        letter: Codicon.diffModified,
        tooltip: localize("chatEditing.modified2", "Pending changes from chat"),
        bubble: true
      };
    }
    return void 0;
  }
}
let ChatEditingMultiDiffSourceResolver = class {
  constructor(_editingSessionsObs, _instantiationService) {
    this._editingSessionsObs = _editingSessionsObs;
    this._instantiationService = _instantiationService;
  }
  canHandleUri(uri) {
    return uri.scheme === CHAT_EDITING_MULTI_DIFF_SOURCE_RESOLVER_SCHEME;
  }
  async resolveDiffSource(uri) {
    const parsed = parseChatMultiDiffUri(uri);
    const thisSession = derived(this, (r) => {
      return this._editingSessionsObs.read(r).find((candidate) => isEqual(candidate.chatSessionResource, parsed.chatSessionResource));
    });
    return this._instantiationService.createInstance(ChatEditingMultiDiffSource, thisSession, parsed.showPreviousChanges);
  }
};
ChatEditingMultiDiffSourceResolver = __decorateClass([
  __decorateParam(1, IInstantiationService)
], ChatEditingMultiDiffSourceResolver);
class ChatEditingMultiDiffSource {
  constructor(_currentSession, _showPreviousChanges) {
    this._currentSession = _currentSession;
    this._showPreviousChanges = _showPreviousChanges;
    this._resources = derived(this, (reader) => {
      const currentSession = this._currentSession.read(reader);
      if (!currentSession) {
        return [];
      }
      const entries = currentSession.entries.read(reader);
      return entries.map((entry) => {
        if (this._showPreviousChanges) {
          const entryDiffObs = currentSession.getEntryDiffBetweenStops(entry.modifiedURI, void 0, void 0);
          const entryDiff = entryDiffObs?.read(reader);
          if (entryDiff) {
            return new MultiDiffEditorItem(
              entryDiff.originalURI,
              entryDiff.modifiedURI,
              void 0,
              void 0,
              {
                [chatEditingResourceContextKey.key]: entry.entryId
              }
            );
          }
        }
        return new MultiDiffEditorItem(
          entry.originalURI,
          entry.modifiedURI,
          void 0,
          void 0,
          {
            [chatEditingResourceContextKey.key]: entry.entryId
            // [inChatEditingSessionContextKey.key]: true
          }
        );
      });
    });
    this.resources = new ValueWithChangeEventFromObservable(this._resources);
    this.contextKeys = {
      [inChatEditingSessionContextKey.key]: true
    };
  }
}
function isTextEditOperationArray(value) {
  return value.some((e) => TextEdit.isTextEdit(e));
}
export {
  ChatEditingMultiDiffSourceResolver,
  ChatEditingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ1NlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29tcGFyZUJ5LCBkZWx0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZ3JvdXBCeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVycm9yTm9UZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cywgcnVuT25DaGFuZ2UsIFZhbHVlV2l0aENoYW5nZUV2ZW50RnJvbU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgY29tcGFyZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSURlY29yYXRpb25EYXRhLCBJRGVjb3JhdGlvbnNQcm92aWRlciwgSURlY29yYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2RlY29yYXRpb25zL2NvbW1vbi9kZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXIsIElNdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UsIElSZXNvbHZlZE11bHRpRGlmZlNvdXJjZSwgTXVsdGlEaWZmRWRpdG9ySXRlbSB9IGZyb20gJy4uLy4uLy4uL211bHRpRGlmZkVkaXRvci9icm93c2VyL211bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDZWxsVXJpLCBJQ2VsbEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9FRElUSU5HX01VTFRJX0RJRkZfU09VUkNFX1JFU09MVkVSX1NDSEVNRSwgY2hhdEVkaXRpbmdBZ2VudFN1cHBvcnRzUmVhZG9ubHlSZWZlcmVuY2VzQ29udGV4dEtleSwgY2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXksIENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLCBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBJQ2hhdEVkaXRpbmdTZXNzaW9uUHJvdmlkZXIsIElNb2RpZmllZEZpbGVFbnRyeSwgaW5DaGF0RWRpdGluZ1Nlc3Npb25Db250ZXh0S2V5LCBJU3RyZWFtaW5nRWRpdHMsIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUsIHBhcnNlQ2hhdE11bHRpRGlmZlVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWwsIElDZWxsVGV4dEVkaXRPcGVyYXRpb24sIElDaGF0UmVzcG9uc2VNb2RlbCwgaXNDZWxsVGV4dEVkaXRPcGVyYXRpb25BcnJheSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JJbnB1dCB9IGZyb20gJy4uL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RDaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5IH0gZnJvbSAnLi9jaGF0RWRpdGluZ01vZGlmaWVkRmlsZUVudHJ5LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU2Vzc2lvbiB9IGZyb20gJy4vY2hhdEVkaXRpbmdTZXNzaW9uLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU25hcHNob3RUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIsIENoYXRFZGl0aW5nVGV4dE1vZGVsQ29udGVudFByb3ZpZGVyIH0gZnJvbSAnLi9jaGF0RWRpdGluZ1RleHRNb2RlbENvbnRlbnRQcm92aWRlcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0RWRpdGluZ1NlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRFZGl0aW5nU2Vzc2lvblByb3ZpZGVyPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zT2JzID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxMaW5rZWRMaXN0PElDaGF0RWRpdGluZ1Nlc3Npb24+Pih7IGVxdWFsc0ZuOiAoYSwgYikgPT4gZmFsc2UgfSwgbmV3IExpbmtlZExpc3QoKSk7XG5cblx0cmVhZG9ubHkgZWRpdGluZ1Nlc3Npb25zT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdEVkaXRpbmdTZXNzaW9uW10+ID0gZGVyaXZlZChyID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBBcnJheS5mcm9tKHRoaXMuX3Nlc3Npb25zT2JzLnJlYWQocikpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU11bHRpRGlmZlNvdXJjZVJlc29sdmVyU2VydmljZSBtdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2U6IElNdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIGRlY29yYXRpb25zU2VydmljZTogSURlY29yYXRpb25zU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihkZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RGVjb3JhdGlvbnNQcm92aWRlciwgdGhpcy5lZGl0aW5nU2Vzc2lvbnNPYnMpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyUmVzb2x2ZXIoX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0aW5nTXVsdGlEaWZmU291cmNlUmVzb2x2ZXIsIHRoaXMuZWRpdGluZ1Nlc3Npb25zT2JzKSkpO1xuXG5cdFx0Ly8gVE9ET0Bqcmlla2VuXG5cdFx0Ly8gc29tZSB1Z2x5IGNhc3Rpbmcgc28gdGhhdCB0aGlzIHNlcnZpY2UgY2FuIHBhc3MgaXRzZWxmIGFzIGFyZ3VtZW50IGluc3RhZCBhcyBzZXJ2aWNlIGRlcGVuZGVueVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoQ2hhdEVkaXRpbmdUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIuc2NoZW1lLCBfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIgYXMgYW55LCB0aGlzKSkpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoU2NoZW1hcy5jaGF0RWRpdGluZ1NuYXBzaG90U2NoZW1lLCBfaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdTbmFwc2hvdFRleHRNb2RlbENvbnRlbnRQcm92aWRlciBhcyBhbnksIHRoaXMpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0U2VydmljZS5vbkRpZERpc3Bvc2VTZXNzaW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5yZWFzb24gPT09ICdjbGVhcmVkJykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGUuc2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0XHRcdHRoaXMuZ2V0RWRpdGluZ1Nlc3Npb24ocmVzb3VyY2UpPy5zdG9wKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IHRlbXBvcmFyeSB1bnRpbCBjaGF0UmVhZG9ubHlQcm9tcHRSZWZlcmVuY2UgcHJvcG9zYWwgaXMgZmluYWxpemVkXG5cdFx0Y29uc3QgcmVhZG9ubHlFbmFibGVkQ29udGV4dEtleSA9IGNoYXRFZGl0aW5nQWdlbnRTdXBwb3J0c1JlYWRvbmx5UmVmZXJlbmNlc0NvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzZXRSZWFkb25seUZpbGVzRW5hYmxlZCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJyAmJiBleHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuc29tZShlID0+IGUuZW5hYmxlZEFwaVByb3Bvc2Fscz8uaW5jbHVkZXMoJ2NoYXRSZWFkb25seVByb21wdFJlZmVyZW5jZScpKTtcblx0XHRcdHJlYWRvbmx5RW5hYmxlZENvbnRleHRLZXkuc2V0KGVuYWJsZWQpO1xuXHRcdH07XG5cdFx0c2V0UmVhZG9ubHlGaWxlc0VuYWJsZWQoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25TZXJ2aWNlLm9uRGlkUmVnaXN0ZXJFeHRlbnNpb25zKHNldFJlYWRvbmx5RmlsZXNFbmFibGVkKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoc2V0UmVhZG9ubHlGaWxlc0VuYWJsZWQpKTtcblxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRsZXQgc3RvcmFnZVRhc2s6IFByb21pc2U8YW55PiB8IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0Y29uc3QgdGFza3M6IFByb21pc2U8YW55PltdID0gW107XG5cblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLmVkaXRpbmdTZXNzaW9uc09icy5nZXQoKSkge1xuXHRcdFx0XHRpZiAoIXNlc3Npb24uaXNHbG9iYWxFZGl0aW5nU2Vzc2lvbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRhc2tzLnB1c2goKHNlc3Npb24gYXMgQ2hhdEVkaXRpbmdTZXNzaW9uKS5zdG9yZVN0YXRlKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yYWdlVGFzayA9IFByb21pc2UucmVzb2x2ZShzdG9yYWdlVGFzaylcblx0XHRcdFx0LnRoZW4oKCkgPT4gUHJvbWlzZS5hbGwodGFza3MpKVxuXHRcdFx0XHQuZmluYWxseSgoKSA9PiBzdG9yYWdlVGFzayA9IHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4ge1xuXHRcdFx0aWYgKCFzdG9yYWdlVGFzaykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRlLmpvaW4oc3RvcmFnZVRhc2ssIHtcblx0XHRcdFx0aWQ6ICdqb2luLmNoYXRFZGl0aW5nU2Vzc2lvbicsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnam9pbi5jaGF0RWRpdGluZ1Nlc3Npb24nLCBcIlNhdmluZyBjaGF0IGVkaXRzIGhpc3RvcnlcIilcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9zZXNzaW9uc09icy5nZXQoKSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0c3RhcnRPckNvbnRpbnVlR2xvYmFsRWRpdGluZ1Nlc3Npb24oY2hhdE1vZGVsOiBDaGF0TW9kZWwpOiBJQ2hhdEVkaXRpbmdTZXNzaW9uIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRFZGl0aW5nU2Vzc2lvbihjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlKSB8fCB0aGlzLmNyZWF0ZUVkaXRpbmdTZXNzaW9uKGNoYXRNb2RlbCwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9sb29rdXBFbnRyeSh1cmk6IFVSSSk6IEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgSXRlcmFibGUuY29uY2F0KHRoaXMuZWRpdGluZ1Nlc3Npb25zT2JzLmdldCgpKSkge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gaXRlbS5nZXRFbnRyeSh1cmkpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZSBpbnN0YW5jZW9mIEFic3RyYWN0Q2hhdEVkaXRpbmdNb2RpZmllZEZpbGVFbnRyeSkge1xuXHRcdFx0XHQvLyBtYWtlIHN1cmUgdG8gcmVmLWNvdW50IHRoaXMgb2JqZWN0XG5cdFx0XHRcdHJldHVybiBjYW5kaWRhdGUuYWNxdWlyZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0RWRpdGluZ1Nlc3Npb24oY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJKTogSUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdGluZ1Nlc3Npb25zT2JzLmdldCgpXG5cdFx0XHQuZmluZChjYW5kaWRhdGUgPT4gaXNFcXVhbChjYW5kaWRhdGUuY2hhdFNlc3Npb25SZXNvdXJjZSwgY2hhdFNlc3Npb25SZXNvdXJjZSkpO1xuXHR9XG5cblx0Y3JlYXRlRWRpdGluZ1Nlc3Npb24oY2hhdE1vZGVsOiBDaGF0TW9kZWwsIGdsb2JhbDogYm9vbGVhbiA9IGZhbHNlKTogSUNoYXRFZGl0aW5nU2Vzc2lvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUVkaXRpbmdTZXNzaW9uKGNoYXRNb2RlbCwgZ2xvYmFsLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0dHJhbnNmZXJFZGl0aW5nU2Vzc2lvbihjaGF0TW9kZWw6IENoYXRNb2RlbCwgc2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbik6IElDaGF0RWRpdGluZ1Nlc3Npb24ge1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVFZGl0aW5nU2Vzc2lvbihjaGF0TW9kZWwsIHNlc3Npb24uaXNHbG9iYWxFZGl0aW5nU2Vzc2lvbiwgc2Vzc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVFZGl0aW5nU2Vzc2lvbihjaGF0TW9kZWw6IENoYXRNb2RlbCwgZ2xvYmFsOiBib29sZWFuLCBpbml0RnJvbTogSUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZCk6IElDaGF0RWRpdGluZ1Nlc3Npb24ge1xuXG5cdFx0YXNzZXJ0VHlwZSh0aGlzLmdldEVkaXRpbmdTZXNzaW9uKGNoYXRNb2RlbC5zZXNzaW9uUmVzb3VyY2UpID09PSB1bmRlZmluZWQsICdDQU5OT1QgaGF2ZSBtb3JlIHRoYW4gb25lIGVkaXRpbmcgc2Vzc2lvbiBwZXIgY2hhdCBzZXNzaW9uJyk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVycy5nZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKGNoYXRNb2RlbC5zZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXJcblx0XHRcdD8gcHJvdmlkZXIuY3JlYXRlRWRpdGluZ1Nlc3Npb24oY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZSlcblx0XHRcdDogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVkaXRpbmdTZXNzaW9uLCBjaGF0TW9kZWwuc2Vzc2lvblJlc291cmNlLCBnbG9iYWwsIHRoaXMuX2xvb2t1cEVudHJ5LmJpbmQodGhpcyksIGluaXRGcm9tKTtcblxuXHRcdGNvbnN0IGxpc3QgPSB0aGlzLl9zZXNzaW9uc09icy5nZXQoKTtcblx0XHRjb25zdCByZW1vdmVTZXNzaW9uID0gbGlzdC51bnNoaWZ0KHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHN0b3JlKTtcblxuXHRcdGlmICghcHJvdmlkZXIgJiYgc2Vzc2lvbiBpbnN0YW5jZW9mIENoYXRFZGl0aW5nU2Vzc2lvbikge1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMuaW5zdGFsbEF1dG9BcHBseU9ic2VydmVyKHNlc3Npb24sIGNoYXRNb2RlbCkpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZChzZXNzaW9uLm9uRGlkRGlzcG9zZShlID0+IHtcblx0XHRcdHJlbW92ZVNlc3Npb24oKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25zT2JzLnNldChsaXN0LCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc3RvcmUuZGVsZXRlKHN0b3JlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9zZXNzaW9uc09icy5zZXQobGlzdCwgdW5kZWZpbmVkKTtcblxuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0cmVnaXN0ZXJFZGl0aW5nU2Vzc2lvblByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCBwcm92aWRlcjogSUNoYXRFZGl0aW5nU2Vzc2lvblByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQoc2NoZW1lLCBwcm92aWRlcik7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcHJvdmlkZXJzLmdldChzY2hlbWUpID09PSBwcm92aWRlcikge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKHNjaGVtZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGluc3RhbGxBdXRvQXBwbHlPYnNlcnZlcihzZXNzaW9uOiBDaGF0RWRpdGluZ1Nlc3Npb24sIGNoYXRNb2RlbDogQ2hhdE1vZGVsKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICghY2hhdE1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3JOb1RlbGVtZXRyeShgRWRpdCBzZXNzaW9uIHdhcyBjcmVhdGVkIGZvciBhIG5vbi1leGlzdGluZyBjaGF0IHNlc3Npb246ICR7c2Vzc2lvbi5jaGF0U2Vzc2lvblJlc291cmNlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9ic2VydmVyRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRvYnNlcnZlckRpc3Bvc2FibGVzLmFkZChjaGF0TW9kZWwub25EaWRDaGFuZ2UoYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5raW5kICE9PSAnYWRkUmVxdWVzdCcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c2Vzc2lvbi5jcmVhdGVTbmFwc2hvdChlLnJlcXVlc3QuaWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCByZXNwb25zZU1vZGVsID0gZS5yZXF1ZXN0LnJlc3BvbnNlO1xuXHRcdFx0aWYgKHJlc3BvbnNlTW9kZWwpIHtcblx0XHRcdFx0dGhpcy5vYnNlcnZlckVkaXRzSW5SZXNwb25zZShlLnJlcXVlc3QuaWQsIHJlc3BvbnNlTW9kZWwsIHNlc3Npb24sIG9ic2VydmVyRGlzcG9zYWJsZXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRvYnNlcnZlckRpc3Bvc2FibGVzLmFkZChjaGF0TW9kZWwub25EaWREaXNwb3NlKCgpID0+IG9ic2VydmVyRGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdFx0cmV0dXJuIG9ic2VydmVyRGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIG9ic2VydmVyRWRpdHNJblJlc3BvbnNlKHJlcXVlc3RJZDogc3RyaW5nLCByZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsIHNlc3Npb246IENoYXRFZGl0aW5nU2Vzc2lvbiwgb2JzZXJ2ZXJEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0Ly8gU3BhcnNlIGFycmF5OiB0aGUgaW5kaWNpZXMgYXJlIGluZGV4ZXMgb2YgYHJlc3BvbnNlTW9kZWwucmVzcG9uc2UudmFsdWVgXG5cdFx0Ly8gdGhhdCBhcmUgZWRpdCBncm91cHMsIGFuZCB0aGVuIHRoaXMgdHJhY2tzIHRoZSBlZGl0IGFwcGxpY2F0aW9uIGZvclxuXHRcdC8vIGVhY2ggb2YgdGhlbS4gTm90ZSB0aGF0IHRleHQgZWRpdCBncm91cHMgY2FuIGJlIHVwZGF0ZWRcblx0XHQvLyBtdWx0aXBsZSB0aW1lcyBkdXJpbmcgdGhlIHByb2Nlc3Mgb2YgcmVzcG9uc2Ugc3RyZWFtaW5nLlxuXHRcdGNvbnN0IGVudW0gSyB7IFN0cmVhbSwgV29ya3NwYWNlIH1cblx0XHRjb25zdCBlZGl0c1NlZW46ICh7IGtpbmQ6IEsuU3RyZWFtOyBzZWVuOiBudW1iZXI7IHN0cmVhbTogSVN0cmVhbWluZ0VkaXRzIH0gfCB7IGtpbmQ6IEsuV29ya3NwYWNlIH0pW10gPSBbXTtcblxuXHRcdGNvbnN0IGluaXRpYWxBY3RpdmVFZGl0b3IgPSB0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU/LmlucHV0O1xuXHRcdGNvbnN0IGVkaXRvck9wZW5Qcm9taXNlcyA9IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPHZvaWQ+PigpO1xuXHRcdGNvbnN0IG9wZW5DaGF0RWRpdGVkRmlsZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS5vcGVuQ2hhdEVkaXRlZEZpbGVzJyk7XG5cblx0XHRjb25zdCBlbnN1cmVFZGl0b3JPcGVuID0gKHBhcnRVcmk6IFVSSSkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gQ2VsbFVyaS5wYXJzZShwYXJ0VXJpKT8ubm90ZWJvb2sgPz8gcGFydFVyaTtcblx0XHRcdGlmIChlZGl0b3JPcGVuUHJvbWlzZXMuaGFzKHVyaSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZWRpdG9yT3BlblByb21pc2VzLnNldCh1cmksIChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLm5vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbCh1cmkpIHx8IHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgfHwgYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHVyaSkuY2F0Y2goKCkgPT4gZmFsc2UpKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlVXJpID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5pbnB1dC5yZXNvdXJjZTtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50QWN0aXZlRWRpdG9yID0gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5pbnB1dDtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JEaWRDaGFuZ2UgPSBpbml0aWFsQWN0aXZlRWRpdG9yICYmIGN1cnJlbnRBY3RpdmVFZGl0b3IgPyAhaW5pdGlhbEFjdGl2ZUVkaXRvci5tYXRjaGVzKGN1cnJlbnRBY3RpdmVFZGl0b3IpIDogaW5pdGlhbEFjdGl2ZUVkaXRvciAhPT0gY3VycmVudEFjdGl2ZUVkaXRvcjtcblx0XHRcdFx0XHRjb25zdCBpbmFjdGl2ZSA9IGVkaXRvckRpZENoYW5nZVxuXHRcdFx0XHRcdFx0fHwgdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5pbnB1dCBpbnN0YW5jZW9mIENoYXRFZGl0b3JJbnB1dCAmJiBpc0VxdWFsKHRoaXMuX2VkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5pbnB1dC5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb24uY2hhdFNlc3Npb25SZXNvdXJjZSlcblx0XHRcdFx0XHRcdHx8IEJvb2xlYW4oYWN0aXZlVXJpICYmIHNlc3Npb24uZW50cmllcy5nZXQoKS5maW5kKGVudHJ5ID0+IGlzRXF1YWwoYWN0aXZlVXJpLCBlbnRyeS5tb2RpZmllZFVSSSkpKTtcblxuXHRcdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1cmksIG9wdGlvbnM6IHsgaW5hY3RpdmUsIHByZXNlcnZlRm9jdXM6IHRydWUsIHBpbm5lZDogdHJ1ZSwgaXNFeHBsaWNpdDogZmFsc2UgfSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9uUmVzcG9uc2VDb21wbGV0ZSA9ICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVtYWluaW5nIG9mIGVkaXRzU2Vlbikge1xuXHRcdFx0XHRpZiAocmVtYWluaW5nPy5raW5kID09PSBLLlN0cmVhbSkge1xuXHRcdFx0XHRcdHJlbWFpbmluZy5zdHJlYW0uY29tcGxldGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRlZGl0c1NlZW4ubGVuZ3RoID0gMDtcblx0XHRcdGVkaXRvck9wZW5Qcm9taXNlcy5jbGVhcigpO1xuXHRcdH07XG5cblx0XHRjb25zdCBoYW5kbGVSZXNwb25zZVBhcnRzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHJlc3BvbnNlTW9kZWwuaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCB1bmRvU3RvcDogdW5kZWZpbmVkIHwgc3RyaW5nO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXNwb25zZU1vZGVsLnJlc3BvbnNlLnZhbHVlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHBhcnQgPSByZXNwb25zZU1vZGVsLnJlc3BvbnNlLnZhbHVlW2ldO1xuXG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICd1bmRvU3RvcCcpIHtcblx0XHRcdFx0XHR1bmRvU3RvcCA9IHBhcnQuaWQ7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocGFydC5raW5kID09PSAnd29ya3NwYWNlRWRpdCcpIHtcblx0XHRcdFx0XHQvLyBUcmFjayBpZiB3ZSd2ZSBhbHJlYWR5IHN0YXJ0ZWQgcHJvY2Vzc2luZyB0aGlzIHdvcmtzcGFjZSBlZGl0XG5cdFx0XHRcdFx0aWYgKCFlZGl0c1NlZW5baV0pIHtcblx0XHRcdFx0XHRcdGVkaXRzU2VlbltpXSA9IHsga2luZDogSy5Xb3Jrc3BhY2UgfTtcblx0XHRcdFx0XHRcdHNlc3Npb24uYXBwbHlXb3Jrc3BhY2VFZGl0KHBhcnQsIHJlc3BvbnNlTW9kZWwsIHVuZG9TdG9wID8/IHJlc3BvbnNlTW9kZWwucmVxdWVzdElkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocGFydC5raW5kICE9PSAndGV4dEVkaXRHcm91cCcgJiYgcGFydC5raW5kICE9PSAnbm90ZWJvb2tFZGl0R3JvdXAnKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTa2lwIGV4dGVybmFsIGVkaXRzIC0gdGhleSdyZSBhbHJlYWR5IGFwcGxpZWQgb24gZGlza1xuXHRcdFx0XHRpZiAocGFydC5pc0V4dGVybmFsRWRpdCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG9wZW5DaGF0RWRpdGVkRmlsZXMpIHtcblx0XHRcdFx0XHRlbnN1cmVFZGl0b3JPcGVuKHBhcnQudXJpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIGdldCBuZXcgZWRpdHMgYW5kIHN0YXJ0IGVkaXRpbmcgc2Vzc2lvblxuXHRcdFx0XHRsZXQgZW50cnkgPSBlZGl0c1NlZW5baV07XG5cdFx0XHRcdGlmICghZW50cnkpIHtcblx0XHRcdFx0XHRlbnRyeSA9IHsga2luZDogSy5TdHJlYW0sIHNlZW46IDAsIHN0cmVhbTogc2Vzc2lvbi5zdGFydFN0cmVhbWluZ0VkaXRzKENlbGxVcmkucGFyc2UocGFydC51cmkpPy5ub3RlYm9vayA/PyBwYXJ0LnVyaSwgcmVzcG9uc2VNb2RlbCwgdW5kb1N0b3ApIH07XG5cdFx0XHRcdFx0ZWRpdHNTZWVuW2ldID0gZW50cnk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZW50cnkua2luZCAhPT0gSy5TdHJlYW0pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGlzRmlyc3QgPSBlbnRyeS5zZWVuID09PSAwO1xuXHRcdFx0XHRjb25zdCBuZXdFZGl0cyA9IHBhcnQuZWRpdHMuc2xpY2UoZW50cnkuc2Vlbik7XG5cdFx0XHRcdGVudHJ5LnNlZW4gPSBwYXJ0LmVkaXRzLmxlbmd0aDtcblxuXHRcdFx0XHRpZiAobmV3RWRpdHMubGVuZ3RoID4gMCB8fCBpc0ZpcnN0KSB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBuZXdFZGl0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdCA9IG5ld0VkaXRzW2ldO1xuXHRcdFx0XHRcdFx0Y29uc3QgZG9uZSA9IHBhcnQuZG9uZSA/IGkgPT09IG5ld0VkaXRzLmxlbmd0aCAtIDEgOiBmYWxzZTtcblxuXHRcdFx0XHRcdFx0aWYgKGlzVGV4dEVkaXRPcGVyYXRpb25BcnJheShlZGl0KSkge1xuXHRcdFx0XHRcdFx0XHRlbnRyeS5zdHJlYW0ucHVzaFRleHQoZWRpdCwgZG9uZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzQ2VsbFRleHRFZGl0T3BlcmF0aW9uQXJyYXkoZWRpdCkpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBlZGl0cyBvZiBPYmplY3QudmFsdWVzKGdyb3VwQnkoZWRpdCwgZSA9PiBlLnVyaS50b1N0cmluZygpKSkpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoZWRpdHMpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGVudHJ5LnN0cmVhbS5wdXNoTm90ZWJvb2tDZWxsVGV4dChlZGl0c1swXS51cmksIGVkaXRzLm1hcChlID0+IGUuZWRpdCksIGRvbmUpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZW50cnkuc3RyZWFtLnB1c2hOb3RlYm9vayhlZGl0LCBkb25lKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAocGFydC5kb25lKSB7XG5cdFx0XHRcdFx0ZW50cnkuc3RyZWFtLmNvbXBsZXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKHJlc3BvbnNlTW9kZWwuaXNDb21wbGV0ZSkge1xuXHRcdFx0aGFuZGxlUmVzcG9uc2VQYXJ0cygpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRvblJlc3BvbnNlQ29tcGxldGUoKTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gb2JzZXJ2ZXJEaXNwb3NhYmxlcy5hZGQocmVzcG9uc2VNb2RlbC5vbkRpZENoYW5nZShlMiA9PiB7XG5cdFx0XHRcdGlmIChlMi5yZWFzb24gPT09ICd1bmRvU3RvcCcpIHtcblx0XHRcdFx0XHRzZXNzaW9uLmNyZWF0ZVNuYXBzaG90KHJlcXVlc3RJZCwgZTIuaWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhbmRsZVJlc3BvbnNlUGFydHMoKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChyZXNwb25zZU1vZGVsLmlzQ29tcGxldGUpIHtcblx0XHRcdFx0XHRcdFx0b25SZXNwb25zZUNvbXBsZXRlKCk7XG5cdFx0XHRcdFx0XHRcdG9ic2VydmVyRGlzcG9zYWJsZXMuZGVsZXRlKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogRW1pdHMgYW4gZXZlbnQgY29udGFpbmluZyB0aGUgYWRkZWQgb3IgcmVtb3ZlZCBlbGVtZW50cyBvZiB0aGUgb2JzZXJ2YWJsZS5cbiAqL1xuZnVuY3Rpb24gb2JzZXJ2ZUFycmF5Q2hhbmdlczxUPihvYnM6IElPYnNlcnZhYmxlPFRbXT4sIGNvbXBhcmU6IChhOiBULCBiOiBUKSA9PiBudW1iZXIsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiBFdmVudDxUW10+IHtcblx0Y29uc3QgZW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxUW10+KCkpO1xuXHRzdG9yZS5hZGQocnVuT25DaGFuZ2Uob2JzLCAobmV3QXJyLCBvbGRBcnIpID0+IHtcblx0XHRjb25zdCBjaGFuZ2UgPSBkZWx0YShvbGRBcnIgfHwgW10sIG5ld0FyciwgY29tcGFyZSk7XG5cdFx0Y29uc3QgY2hhbmdlZEVsZW1lbnRzID0gKFtdIGFzIFRbXSkuY29uY2F0KGNoYW5nZS5hZGRlZCkuY29uY2F0KGNoYW5nZS5yZW1vdmVkKTtcblx0XHRlbWl0dGVyLmZpcmUoY2hhbmdlZEVsZW1lbnRzKTtcblx0fSkpO1xuXHRyZXR1cm4gZW1pdHRlci5ldmVudDtcbn1cblxuY2xhc3MgQ2hhdERlY29yYXRpb25zUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURlY29yYXRpb25zUHJvdmlkZXIge1xuXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmcgPSBsb2NhbGl6ZSgnY2hhdCcsIFwiQ2hhdCBFZGl0aW5nXCIpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRFbnRyaWVzID0gZGVyaXZlZDxyZWFkb25seSBJTW9kaWZpZWRGaWxlRW50cnlbXT4odGhpcywgKHIpID0+IHtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuX3Nlc3Npb25zLnJlYWQocik7XG5cdFx0aWYgKCFzZXNzaW9ucykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElNb2RpZmllZEZpbGVFbnRyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRpZiAoc2Vzc2lvbi5zdGF0ZS5yZWFkKHIpICE9PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5EaXNwb3NlZCkge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gc2Vzc2lvbi5lbnRyaWVzLnJlYWQocik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKC4uLmVudHJpZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50bHlFZGl0aW5nVXJpcyA9IGRlcml2ZWQ8VVJJW10+KHRoaXMsIChyKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fY3VycmVudEVudHJpZXMucmVhZChyKTtcblx0XHRyZXR1cm4gdXJpLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeS5yZWFkKHIpKS5tYXAoZW50cnkgPT4gZW50cnkubW9kaWZpZWRVUkkpO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFVyaXMgPSBkZXJpdmVkPFVSSVtdPih0aGlzLCAocikgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX2N1cnJlbnRFbnRyaWVzLnJlYWQocik7XG5cdFx0cmV0dXJuIHVyaS5maWx0ZXIoZW50cnkgPT4gIWVudHJ5LmlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5LnJlYWQocikgJiYgZW50cnkuc3RhdGUucmVhZChyKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCkubWFwKGVudHJ5ID0+IGVudHJ5Lm1vZGlmaWVkVVJJKTtcblx0fSk7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PFVSSVtdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRFZGl0aW5nU2Vzc2lvbltdPlxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2UgPSBFdmVudC5hbnkoXG5cdFx0XHRvYnNlcnZlQXJyYXlDaGFuZ2VzKHRoaXMuX2N1cnJlbnRseUVkaXRpbmdVcmlzLCBjb21wYXJlQnkodXJpID0+IHVyaS50b1N0cmluZygpLCBjb21wYXJlKSwgdGhpcy5fc3RvcmUpLFxuXHRcdFx0b2JzZXJ2ZUFycmF5Q2hhbmdlcyh0aGlzLl9tb2RpZmllZFVyaXMsIGNvbXBhcmVCeSh1cmkgPT4gdXJpLnRvU3RyaW5nKCksIGNvbXBhcmUpLCB0aGlzLl9zdG9yZSksXG5cdFx0KTtcblx0fVxuXG5cdHByb3ZpZGVEZWNvcmF0aW9ucyh1cmk6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkID0gdGhpcy5fY3VycmVudGx5RWRpdGluZ1VyaXMuZ2V0KCkuc29tZShlID0+IGlzRXF1YWwoZSwgdXJpKSk7XG5cdFx0aWYgKGlzQ3VycmVudGx5QmVpbmdNb2RpZmllZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0d2VpZ2h0OiAxMDAwLFxuXHRcdFx0XHRsZXR0ZXI6IFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpLFxuXHRcdFx0XHRidWJibGU6IGZhbHNlXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBpc01vZGlmaWVkID0gdGhpcy5fbW9kaWZpZWRVcmlzLmdldCgpLnNvbWUoZSA9PiBpc0VxdWFsKGUsIHVyaSkpO1xuXHRcdGlmIChpc01vZGlmaWVkKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR3ZWlnaHQ6IDEwMDAsXG5cdFx0XHRcdGxldHRlcjogQ29kaWNvbi5kaWZmTW9kaWZpZWQsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjaGF0RWRpdGluZy5tb2RpZmllZDInLCBcIlBlbmRpbmcgY2hhbmdlcyBmcm9tIGNoYXRcIiksXG5cdFx0XHRcdGJ1YmJsZTogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdEVkaXRpbmdNdWx0aURpZmZTb3VyY2VSZXNvbHZlciBpbXBsZW1lbnRzIElNdWx0aURpZmZTb3VyY2VSZXNvbHZlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdGluZ1Nlc3Npb25zT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdEVkaXRpbmdTZXNzaW9uW10+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRjYW5IYW5kbGVVcmkodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdXJpLnNjaGVtZSA9PT0gQ0hBVF9FRElUSU5HX01VTFRJX0RJRkZfU09VUkNFX1JFU09MVkVSX1NDSEVNRTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVEaWZmU291cmNlKHVyaTogVVJJKTogUHJvbWlzZTxJUmVzb2x2ZWRNdWx0aURpZmZTb3VyY2U+IHtcblxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdE11bHRpRGlmZlVyaSh1cmkpO1xuXHRcdGNvbnN0IHRoaXNTZXNzaW9uID0gZGVyaXZlZCh0aGlzLCByID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9lZGl0aW5nU2Vzc2lvbnNPYnMucmVhZChyKS5maW5kKGNhbmRpZGF0ZSA9PiBpc0VxdWFsKGNhbmRpZGF0ZS5jaGF0U2Vzc2lvblJlc291cmNlLCBwYXJzZWQuY2hhdFNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFZGl0aW5nTXVsdGlEaWZmU291cmNlLCB0aGlzU2Vzc2lvbiwgcGFyc2VkLnNob3dQcmV2aW91c0NoYW5nZXMpO1xuXHR9XG59XG5cbmNsYXNzIENoYXRFZGl0aW5nTXVsdGlEaWZmU291cmNlIGltcGxlbWVudHMgSVJlc29sdmVkTXVsdGlEaWZmU291cmNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VzID0gZGVyaXZlZDxyZWFkb25seSBNdWx0aURpZmZFZGl0b3JJdGVtW10+KHRoaXMsIChyZWFkZXIpID0+IHtcblx0XHRjb25zdCBjdXJyZW50U2Vzc2lvbiA9IHRoaXMuX2N1cnJlbnRTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIWN1cnJlbnRTZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJpZXMgPSBjdXJyZW50U2Vzc2lvbi5lbnRyaWVzLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gZW50cmllcy5tYXAoKGVudHJ5KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc2hvd1ByZXZpb3VzQ2hhbmdlcykge1xuXHRcdFx0XHRjb25zdCBlbnRyeURpZmZPYnMgPSBjdXJyZW50U2Vzc2lvbi5nZXRFbnRyeURpZmZCZXR3ZWVuU3RvcHMoZW50cnkubW9kaWZpZWRVUkksIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3QgZW50cnlEaWZmID0gZW50cnlEaWZmT2JzPy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChlbnRyeURpZmYpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IE11bHRpRGlmZkVkaXRvckl0ZW0oXG5cdFx0XHRcdFx0XHRlbnRyeURpZmYub3JpZ2luYWxVUkksXG5cdFx0XHRcdFx0XHRlbnRyeURpZmYubW9kaWZpZWRVUkksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFtjaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleS5rZXldOiBlbnRyeS5lbnRyeUlkLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBuZXcgTXVsdGlEaWZmRWRpdG9ySXRlbShcblx0XHRcdFx0ZW50cnkub3JpZ2luYWxVUkksXG5cdFx0XHRcdGVudHJ5Lm1vZGlmaWVkVVJJLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtjaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleS5rZXldOiBlbnRyeS5lbnRyeUlkLFxuXHRcdFx0XHRcdC8vIFtpbkNoYXRFZGl0aW5nU2Vzc2lvbkNvbnRleHRLZXkua2V5XTogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cdHJlYWRvbmx5IHJlc291cmNlcyA9IG5ldyBWYWx1ZVdpdGhDaGFuZ2VFdmVudEZyb21PYnNlcnZhYmxlKHRoaXMuX3Jlc291cmNlcyk7XG5cblx0cmVhZG9ubHkgY29udGV4dEtleXMgPSB7XG5cdFx0W2luQ2hhdEVkaXRpbmdTZXNzaW9uQ29udGV4dEtleS5rZXldOiB0cnVlXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudFNlc3Npb246IElPYnNlcnZhYmxlPElDaGF0RWRpdGluZ1Nlc3Npb24gfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dQcmV2aW91c0NoYW5nZXM6IGJvb2xlYW5cblx0KSB7IH1cbn1cblxuZnVuY3Rpb24gaXNUZXh0RWRpdE9wZXJhdGlvbkFycmF5KHZhbHVlOiBUZXh0RWRpdFtdIHwgSUNlbGxUZXh0RWRpdE9wZXJhdGlvbltdIHwgSUNlbGxFZGl0T3BlcmF0aW9uW10pOiB2YWx1ZSBpcyBUZXh0RWRpdFtdIHtcblx0cmV0dXJuIHZhbHVlLnNvbWUoZSA9PiBUZXh0RWRpdC5pc1RleHRFZGl0KGUpKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUFXLGFBQWE7QUFFakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksaUJBQWlCLFNBQXNCLG9CQUFvQjtBQUNoRixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFzQixxQkFBcUIsYUFBYSwwQ0FBMEM7QUFDM0csU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFnRCwyQkFBMkI7QUFDM0UsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBbUMsaUNBQTJELDJCQUEyQjtBQUN6SCxTQUFTLGVBQW1DO0FBQzVDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0RBQWdELHNEQUFzRCwrQkFBK0IseUJBQW9ILGdDQUFpRCx3QkFBd0IsNkJBQTZCO0FBQ3hXLFNBQWdFLG9DQUFvQztBQUNwRyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRDQUE0QztBQUNyRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZDQUE2QywyQ0FBMkM7QUFF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
