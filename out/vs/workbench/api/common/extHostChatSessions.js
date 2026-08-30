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
import { coalesce } from "../../../base/common/arrays.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { CancellationError } from "../../../base/common/errors.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../base/common/map.js";
import { MarshalledId } from "../../../base/common/marshallingIds.js";
import * as objects from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { SymbolKind, SymbolKinds } from "../../../editor/common/languages.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IDiagnosticVariableEntryFilterData, PromptFileVariableKind, toPromptFileVariableEntry } from "../../contrib/chat/common/attachments/chatVariableEntries.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
import { getChatSessionType, isUntitledChatSession } from "../../contrib/chat/common/model/chatUri.js";
import { MainContext } from "./extHost.protocol.js";
import { ChatAgentResponseStream } from "./extHostChatAgents2.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { Diagnostic } from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { isEqual } from "../../../base/common/resources.js";
class ChatSessionInputStateImpl {
  constructor(groups, onChangedDelegate) {
    this.#onDidChangeEmitter = new Emitter();
    this.onDidChange = this.#onDidChangeEmitter.event;
    this.#onDidDisposeEmitter = new Emitter();
    this.onDidDispose = this.#onDidDisposeEmitter.event;
    this.#groups = groups;
    this.#onChangedDelegate = onChangedDelegate;
  }
  #groups;
  #onChangedDelegate;
  #onDidChangeEmitter;
  #onDidDisposeEmitter;
  #sessionResource;
  get sessionResource() {
    return this.#sessionResource;
  }
  set sessionResource(value) {
    this.#sessionResource = value;
  }
  #untitledSessionResource;
  get untitledSessionResource() {
    return this.#untitledSessionResource;
  }
  set untitledSessionResource(value) {
    this.#untitledSessionResource = value;
  }
  get groups() {
    return this.#groups;
  }
  set groups(value) {
    this.#groups = value;
    this.#onChangedDelegate?.();
  }
  _fireDidChange() {
    this.#onDidChangeEmitter.fire();
  }
  _setGroups(groups) {
    this.#groups = groups;
  }
  _dispose() {
    this.#onDidDisposeEmitter.fire();
    this.#onDidDisposeEmitter.dispose();
    this.#onDidChangeEmitter.dispose();
  }
}
class ChatSessionItemImpl {
  #label;
  #iconPath;
  #description;
  #badge;
  #status;
  #archived;
  #tooltip;
  #timing;
  #changes;
  #metadata;
  #onChanged;
  constructor(resource, label, onChanged) {
    this.resource = resource;
    this.#label = label;
    this.#onChanged = onChanged;
  }
  get label() {
    return this.#label;
  }
  set label(value) {
    if (this.#label !== value) {
      this.#label = value;
      this.#onChanged();
    }
  }
  get iconPath() {
    return this.#iconPath;
  }
  set iconPath(value) {
    if (this.#iconPath !== value) {
      this.#iconPath = value;
      this.#onChanged();
    }
  }
  get description() {
    return this.#description;
  }
  set description(value) {
    if (this.#description !== value) {
      this.#description = value;
      this.#onChanged();
    }
  }
  get badge() {
    return this.#badge;
  }
  set badge(value) {
    if (this.#badge !== value) {
      this.#badge = value;
      this.#onChanged();
    }
  }
  get status() {
    return this.#status;
  }
  set status(value) {
    if (this.#status !== value) {
      this.#status = value;
      this.#onChanged();
    }
  }
  get archived() {
    return this.#archived;
  }
  set archived(value) {
    if (this.#archived !== value) {
      this.#archived = value;
      this.#onChanged();
    }
  }
  get tooltip() {
    return this.#tooltip;
  }
  set tooltip(value) {
    if (this.#tooltip !== value) {
      this.#tooltip = value;
      this.#onChanged();
    }
  }
  get timing() {
    return this.#timing;
  }
  set timing(value) {
    if (this.#timing !== value) {
      this.#timing = value;
      this.#onChanged();
    }
  }
  get changes() {
    return this.#changes;
  }
  set changes(value) {
    if (this.#changes !== value) {
      this.#changes = value;
      this.#onChanged();
    }
  }
  get metadata() {
    return this.#metadata;
  }
  set metadata(value) {
    if (value !== void 0) {
      try {
        JSON.stringify(value);
      } catch {
        throw new Error("metadata must be JSON-serializable");
      }
    }
    if (!objects.equals(this.#metadata, value)) {
      this.#metadata = value;
      this.#onChanged();
    }
  }
}
function computeItemsDelta(oldItems, newItems) {
  const delta = {
    addedOrUpdated: new ResourceMap(),
    removed: new ResourceSet()
  };
  for (const [newResource, newItem] of newItems) {
    const oldItem = oldItems.get(newResource);
    if (oldItem !== newItem) {
      delta.addedOrUpdated.set(newResource, newItem);
    }
  }
  for (const oldResource of oldItems.keys()) {
    if (!newItems.has(oldResource)) {
      delta.removed.add(oldResource);
    }
  }
  return delta;
}
function convertChatSessionDeltaToDto(delta) {
  return {
    addedOrUpdated: delta.addedOrUpdated ? Array.from(delta.addedOrUpdated.values(), typeConvert.ChatSessionItem.from) : [],
    removed: delta.removed ? Array.from(delta.removed.keys()) : []
  };
}
class ChatSessionItemCollectionImpl {
  #items = new ResourceMap();
  #proxy;
  #controllerHandle;
  constructor(controllerHandle, proxy) {
    this.#proxy = proxy;
    this.#controllerHandle = controllerHandle;
  }
  get size() {
    return this.#items.size;
  }
  replace(newItems) {
    if (!newItems.length && !this.#items.size) {
      return;
    }
    const newItemsMap = new ResourceMap(newItems.map((item) => [item.resource, item]));
    const delta = computeItemsDelta(this.#items, newItemsMap);
    if (!delta.addedOrUpdated?.size && !delta.removed?.size) {
      return;
    }
    this.#items = newItemsMap;
    void this.#proxy.$updateChatSessionItems(this.#controllerHandle, convertChatSessionDeltaToDto(delta));
  }
  forEach(callback, thisArg) {
    for (const [_, item] of this.#items) {
      callback.call(thisArg, item, this);
    }
  }
  add(item) {
    const existing = this.#items.get(item.resource);
    if (existing && existing === item) {
      return;
    }
    this.#items.set(item.resource, item);
    void this.#proxy.$addOrUpdateChatSessionItem(this.#controllerHandle, typeConvert.ChatSessionItem.from(item));
  }
  delete(resource) {
    if (this.#items.delete(resource)) {
      void this.#proxy.$updateChatSessionItems(this.#controllerHandle, {
        addedOrUpdated: [],
        removed: [resource]
      });
    }
  }
  get(resource) {
    return this.#items.get(resource);
  }
  [Symbol.iterator]() {
    return this.#items.entries();
  }
}
class ExtHostChatSession {
  constructor(session, extension, request, proxy, commandsConverter, sessionDisposables) {
    this.session = session;
    this.extension = extension;
    this.proxy = proxy;
    this.commandsConverter = commandsConverter;
    this.sessionDisposables = sessionDisposables;
    // Empty map since question carousel is designed for chat agents, not chat sessions
    this._pendingCarouselResolvers = /* @__PURE__ */ new Map();
    this._stream = new ChatAgentResponseStream(extension, request, proxy, commandsConverter, sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
  }
  get activeResponseStream() {
    return this._stream;
  }
  getActiveRequestStream(request) {
    return new ChatAgentResponseStream(this.extension, request, this.proxy, this.commandsConverter, this.sessionDisposables, this._pendingCarouselResolvers, CancellationToken.None);
  }
}
let ExtHostChatSessions = class extends Disposable {
  constructor(commands, _languageModels, _extHostRpc, _logService) {
    super();
    this.commands = commands;
    this._languageModels = _languageModels;
    this._extHostRpc = _extHostRpc;
    this._logService = _logService;
    this._itemControllerHandlePool = 0;
    this._chatSessionItemControllers = /* @__PURE__ */ new Map();
    this._contentProviderHandlePool = 0;
    this._chatSessionContentProviders = /* @__PURE__ */ new Map();
    /**
     * Map of uri -> chat sessions infos
     */
    this._extHostChatSessions = new ResourceMap();
    /**
     * Map of proxy command id -> original command id + controller handle.
     * Used to wrap option group commands so they receive `{ inputState, sessionResource }` instead of just `sessionResource`.
     */
    this._proxyCommands = /* @__PURE__ */ new Map();
    this._proxy = this._extHostRpc.getProxy(MainContext.MainThreadChatSessions);
    commands.registerArgumentProcessor({
      processArgument: (arg) => {
        if (arg && arg.$mid === MarshalledId.AgentSessionContext) {
          const resource = arg.session.resource;
          for (const { controller } of this._chatSessionItemControllers.values()) {
            const item = controller.items.get(resource);
            if (item) {
              return item;
            }
          }
          this._logService.warn(`No chat session found with uri: ${resource}`);
          return arg;
        }
        return arg;
      }
    });
  }
  registerChatSessionItemProvider(extension, chatSessionType, provider) {
    const controllerHandle = this._itemControllerHandlePool++;
    const disposables = new DisposableStore();
    const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter());
    const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);
    const controller = {
      id: chatSessionType,
      items: collection,
      createChatSessionItem: (_resource, _label) => {
        throw new Error("Not implemented for providers");
      },
      createChatSessionInputState: (_options) => {
        return new ChatSessionInputStateImpl([]);
      },
      onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
      newChatSessionItemHandler: void 0,
      // Bridge the deprecated `ChatSessionItemProvider.resolveChatSessionItem` hook through the
      // new controller surface so both code paths share the same `$resolveChatSessionItem` impl.
      // The legacy provider returns a new item; the bridge adds it to the collection so the
      // controller contract (update via collection, return void) is satisfied.
      resolveChatSessionItem: provider.resolveChatSessionItem ? async (item, token) => {
        const resolved = await provider.resolveChatSessionItem(item, token);
        if (resolved) {
          collection.add(resolved);
        }
      } : void 0,
      dispose: () => {
        disposables.dispose();
      },
      refreshHandler: async (token) => {
        const items = await provider.provideChatSessionItems(token) ?? [];
        collection.replace(items);
      }
    };
    this._chatSessionItemControllers.set(controllerHandle, { chatSessionType, controller, extension, disposable: disposables, onDidChangeChatSessionItemStateEmitter, inputStates: /* @__PURE__ */ new Set() });
    this._proxy.$registerChatSessionItemController(controllerHandle, chatSessionType, !!provider.resolveChatSessionItem);
    if (provider.onDidChangeChatSessionItems) {
      disposables.add(provider.onDidChangeChatSessionItems(() => {
        this._logService.trace(`ExtHostChatSessions. Provider items changed for ${chatSessionType}`);
        controller.refreshHandler(CancellationToken.None);
      }));
    }
    if (provider.onDidCommitChatSessionItem) {
      disposables.add(provider.onDidCommitChatSessionItem((e) => {
        const { original, modified } = e;
        this._proxy.$onDidCommitChatSessionItem(controllerHandle, original.resource, modified.resource);
      }));
    }
    const disposable = {
      dispose: () => {
        this._chatSessionItemControllers.delete(controllerHandle);
        disposables.dispose();
        this._proxy.$unregisterChatSessionItemController(controllerHandle);
      }
    };
    return Object.assign(disposable, {
      onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event
    });
  }
  createChatSessionItemController(extension, id, refreshHandler) {
    const controllerHandle = this._itemControllerHandlePool++;
    const disposables = new DisposableStore();
    let isDisposed = false;
    let newChatSessionItemHandler;
    let forkHandler;
    let resolveChatSessionItemHandler;
    let provideChatSessionInputStateHandler;
    const onDidChangeChatSessionItemStateEmitter = disposables.add(new Emitter());
    const inputStates = /* @__PURE__ */ new Set();
    const collection = new ChatSessionItemCollectionImpl(controllerHandle, this._proxy);
    const proxy = this._proxy;
    const controller = Object.freeze({
      id,
      refreshHandler: async (refreshToken) => {
        if (isDisposed) {
          throw new Error("ChatSessionItemController has been disposed");
        }
        this._logService.trace(`ExtHostChatSessions. Controller(${id}).refresh()`);
        await refreshHandler(refreshToken);
      },
      items: collection,
      onDidChangeChatSessionItemState: onDidChangeChatSessionItemStateEmitter.event,
      createChatSessionItem: (resource, label) => {
        if (isDisposed) {
          throw new Error("ChatSessionItemController has been disposed");
        }
        const item = new ChatSessionItemImpl(resource, label, () => {
          if (collection.get(resource) === item) {
            void this._proxy.$addOrUpdateChatSessionItem(controllerHandle, typeConvert.ChatSessionItem.from(item));
          }
        });
        return item;
      },
      get newChatSessionItemHandler() {
        return newChatSessionItemHandler;
      },
      set newChatSessionItemHandler(handler) {
        newChatSessionItemHandler = handler;
      },
      get forkHandler() {
        return forkHandler;
      },
      set forkHandler(handler) {
        forkHandler = handler;
      },
      get resolveChatSessionItem() {
        return resolveChatSessionItemHandler;
      },
      set resolveChatSessionItem(handler) {
        const hadHandler = !!resolveChatSessionItemHandler;
        resolveChatSessionItemHandler = handler;
        const hasHandler = !!handler;
        if (hadHandler !== hasHandler && !isDisposed) {
          proxy.$updateChatSessionItemControllerCapabilities(controllerHandle, hasHandler);
        }
      },
      get getChatSessionInputState() {
        return provideChatSessionInputStateHandler;
      },
      set getChatSessionInputState(handler) {
        provideChatSessionInputStateHandler = handler;
      },
      createChatSessionInputState: (groups) => {
        if (isDisposed) {
          throw new Error("ChatSessionItemController has been disposed");
        }
        const inputState = new ChatSessionInputStateImpl(groups, () => {
          const entry = this._chatSessionItemControllers.get(controllerHandle);
          if (entry) {
            entry.optionGroups = inputState.groups;
          }
          const wrappedGroups = this._wrapOptionGroupCommands(controllerHandle, inputState.groups);
          const serializableGroups = wrappedGroups.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
            items: g.items,
            selected: g.selected,
            when: g.when,
            icon: g.icon,
            commands: g.commands,
            kind: g.kind
          }));
          const resource = inputState.sessionResource ?? inputState.untitledSessionResource;
          if (resource) {
            void this._proxy.$updateChatSessionInputState(controllerHandle, resource, serializableGroups);
          }
        });
        inputStates.add(inputState);
        return inputState;
      },
      dispose: () => {
        isDisposed = true;
        for (const inputState of inputStates) {
          inputState._dispose();
        }
        inputStates.clear();
        disposables.dispose();
      }
    });
    this._chatSessionItemControllers.set(controllerHandle, { controller, extension, disposable: disposables, chatSessionType: id, onDidChangeChatSessionItemStateEmitter, inputStates });
    this._proxy.$registerChatSessionItemController(controllerHandle, id, !!resolveChatSessionItemHandler);
    disposables.add(toDisposable(() => {
      this._chatSessionItemControllers.delete(controllerHandle);
      this._proxy.$unregisterChatSessionItemController(controllerHandle);
    }));
    return controller;
  }
  registerChatSessionContentProvider(extension, chatSessionScheme, chatParticipant, provider, capabilities) {
    const handle = this._contentProviderHandlePool++;
    const disposables = new DisposableStore();
    this._chatSessionContentProviders.set(handle, { chatSessionScheme, provider, extension, capabilities, disposable: disposables });
    this._proxy.$registerChatSessionContentProvider(handle, chatSessionScheme);
    if (provider.onDidChangeChatSessionOptions) {
      disposables.add(provider.onDidChangeChatSessionOptions((evt) => {
        const updates = /* @__PURE__ */ Object.create(null);
        for (const update of evt.updates) {
          updates[update.optionId] = update.value;
        }
        this._proxy.$onDidChangeChatSessionOptions(handle, evt.resource, updates);
      }));
    }
    if (provider.onDidChangeChatSessionProviderOptions) {
      disposables.add(provider.onDidChangeChatSessionProviderOptions(() => {
        this._proxy.$onDidChangeChatSessionProviderOptions(handle);
      }));
    }
    return new extHostTypes.Disposable(() => {
      this._chatSessionContentProviders.delete(handle);
      disposables.dispose();
      this._proxy.$unregisterChatSessionContentProvider(handle);
    });
  }
  async $provideChatSessionContent(handle, sessionResourceComponents, context, token) {
    const provider = this._chatSessionContentProviders.get(handle);
    if (!provider) {
      throw new Error(`No provider for handle ${handle}`);
    }
    const sessionResource = URI.revive(sessionResourceComponents);
    const controllerData = this.getChatSessionItemController(getChatSessionType(sessionResource));
    let inputState;
    if (controllerData?.controller.getChatSessionInputState) {
      const result = await controllerData.controller.getChatSessionInputState(isUntitledChatSession(sessionResource) ? void 0 : sessionResource, {
        previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], context.initialSessionOptions)
      }, token);
      if (result) {
        inputState = result;
      }
    }
    inputState ??= this._createInputStateFromOptions(
      controllerData?.optionGroups ?? [],
      context.initialSessionOptions
    );
    if (inputState instanceof ChatSessionInputStateImpl) {
      if (controllerData) {
        this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
      }
      if (isUntitledChatSession(sessionResource)) {
        inputState.untitledSessionResource = sessionResource;
      } else {
        inputState.sessionResource = sessionResource;
      }
    }
    const session = await provider.provider.provideChatSessionContent(sessionResource, token, {
      inputState
    });
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    const sessionDisposables = new DisposableStore();
    const id = sessionResource.toString();
    const chatSession = new ExtHostChatSession(session, provider.extension, {
      sessionResource,
      requestId: "ongoing",
      agentId: id,
      message: "",
      variables: { variables: [] },
      location: ChatAgentLocation.Chat
    }, {
      $handleProgressChunk: (requestId, chunks) => {
        return this._proxy.$handleProgressChunk(handle, sessionResource, requestId, chunks);
      },
      $handleAnchorResolve: (requestId, requestHandle, anchor) => {
        this._proxy.$handleAnchorResolve(handle, sessionResource, requestId, requestHandle, anchor);
      }
    }, this.commands.converter, sessionDisposables);
    const disposeCts = sessionDisposables.add(new CancellationTokenSource());
    this._extHostChatSessions.set(sessionResource, { sessionObj: chatSession, disposeCts });
    if (session.activeResponseCallback) {
      Promise.resolve(session.activeResponseCallback(chatSession.activeResponseStream.apiObject, disposeCts.token)).finally(() => {
        this._proxy.$handleProgressComplete(handle, sessionResource, "ongoing");
      });
    }
    const { capabilities } = provider;
    return {
      resource: URI.revive(sessionResource),
      title: session.title,
      hasActiveResponseCallback: !!session.activeResponseCallback,
      hasRequestHandler: !!session.requestHandler,
      hasForkHandler: !!controllerData?.controller.forkHandler || !!session.forkHandler,
      supportsInterruption: !!capabilities?.supportsInterruptions,
      options: session.options,
      history: session.history.map((turn) => {
        if (turn instanceof extHostTypes.ChatRequestTurn) {
          return this.convertRequestTurn(turn);
        } else {
          return this.convertResponseTurn(turn, sessionDisposables);
        }
      })
    };
  }
  async $provideHandleOptionsChange(handle, sessionResourceComponents, updates, token) {
    const sessionResource = URI.revive(sessionResourceComponents);
    const provider = this._chatSessionContentProviders.get(handle);
    if (!provider) {
      this._logService.warn(`No provider for handle ${handle}`);
      return;
    }
    if (provider.provider.provideHandleOptionsChange) {
      try {
        const updatesToSend = Object.entries(updates).map(([optionId, value]) => ({
          optionId,
          value: value === void 0 ? void 0 : typeof value === "string" ? value : value.id
        }));
        provider.provider.provideHandleOptionsChange(sessionResource, updatesToSend, token);
      } catch (error) {
        this._logService.error(`Error calling provideHandleOptionsChange for handle ${handle}, sessionResource ${sessionResource}:`, error);
      }
      return;
    }
    const sessionType = getChatSessionType(sessionResource);
    const controllerData = this.getChatSessionItemController(sessionType);
    if (!controllerData || !controllerData.controller.getChatSessionInputState) {
      this._logService.warn(`No valid controller found for session type ${sessionType}`);
      return;
    }
    for (const inputState of controllerData?.inputStates ?? []) {
      const updatedGroups = inputState.groups.map((group) => {
        const update = updates[group.id];
        if (!update) {
          return group;
        }
        const selectedId = typeof update === "string" ? update : update.id;
        const selectedItem = group.items.find((item) => item.id === selectedId);
        if (!selectedItem) {
          return group;
        }
        return { ...group, selected: selectedItem };
      });
      inputState._setGroups(updatedGroups);
      inputState._fireDidChange();
    }
  }
  async $provideChatSessionProviderOptions(handle, token) {
    const entry = this._chatSessionContentProviders.get(handle);
    if (!entry) {
      this._logService.warn(`No provider for handle ${handle} when requesting chat session options`);
      return;
    }
    const provider = entry.provider;
    if (!provider.provideChatSessionProviderOptions) {
      return;
    }
    try {
      const result = await provider.provideChatSessionProviderOptions(token);
      if (!result) {
        return;
      }
      const { optionGroups, newSessionOptions } = result;
      if (optionGroups) {
        const controllerData = this.getChatSessionItemController(entry.chatSessionScheme);
        if (controllerData) {
          controllerData.optionGroups = optionGroups;
        }
      }
      return {
        optionGroups,
        newSessionOptions
      };
    } catch (error) {
      this._logService.error(`Error calling provideChatSessionProviderOptions for handle ${handle}:`, error);
      return;
    }
  }
  async $interruptChatSessionActiveResponse(providerHandle, sessionResource, requestId) {
    const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
    entry?.disposeCts.cancel();
  }
  async $disposeChatSessionContent(providerHandle, sessionResource) {
    const resource = URI.revive(sessionResource);
    const entry = this._extHostChatSessions.get(resource);
    if (!entry) {
      this._logService.warn(`No chat session found for resource: ${sessionResource}`);
      return;
    }
    const controllerData = this.getChatSessionItemController(resource.scheme);
    if (controllerData) {
      this._disposeInputStatesForResource(controllerData.inputStates, resource);
    }
    entry.disposeCts.cancel();
    entry.sessionObj.sessionDisposables.dispose();
    this._extHostChatSessions.delete(resource);
  }
  async $invokeChatSessionRequestHandler(handle, sessionResource, request, history, token) {
    const entry = this._extHostChatSessions.get(URI.revive(sessionResource));
    if (!entry || !entry.sessionObj.session.requestHandler) {
      return {};
    }
    const chatRequest = typeConvert.ChatAgentRequest.to(request, void 0, await this.getModelForRequest(request, entry.sessionObj.extension), request.modelConfiguration, [], /* @__PURE__ */ new Map(), entry.sessionObj.extension, this._logService);
    const stream = entry.sessionObj.getActiveRequestStream(request);
    await entry.sessionObj.session.requestHandler(chatRequest, { history, yieldRequested: false }, stream.apiObject, token);
    return {};
  }
  async $forkChatSession(handle, sessionResourceComponents, request, token) {
    const sessionResource = URI.revive(sessionResourceComponents);
    const entry = this._extHostChatSessions.get(sessionResource);
    if (!entry) {
      throw new Error(`No chat session found for resource ${sessionResource.toString()}`);
    }
    const requestTurn = this.convertRequestDtoToRequestTurn(request);
    const controllerData = this.getChatSessionItemController(getChatSessionType(sessionResource));
    if (controllerData?.controller.forkHandler) {
      const item2 = await controllerData.controller.forkHandler(sessionResource, requestTurn, token);
      return typeConvert.ChatSessionItem.from(item2);
    }
    if (!entry.sessionObj.session.forkHandler) {
      throw new Error(`No fork handler for session ${sessionResource.toString()}`);
    }
    const item = await entry.sessionObj.session.forkHandler(sessionResource, requestTurn, token);
    return typeConvert.ChatSessionItem.from(item);
  }
  convertRequestDtoToRequestTurn(request) {
    if (!request) {
      return void 0;
    }
    return new extHostTypes.ChatRequestTurn(
      request.prompt,
      request.command,
      [],
      request.participant,
      [],
      void 0,
      request.id,
      request.modelId,
      typeConvert.ChatRequestModeInstructions.to(request.modeInstructions)
    );
  }
  getChatSessionItemController(chatSessionType) {
    for (const controllerData of this._chatSessionItemControllers.values()) {
      if (controllerData.chatSessionType === chatSessionType) {
        return controllerData;
      }
    }
    return void 0;
  }
  _disposeInputStatesForResource(inputStates, resource) {
    for (const inputState of inputStates) {
      const inputResource = inputState.sessionResource ?? inputState.untitledSessionResource;
      if (inputResource && isEqual(resource, inputResource)) {
        inputState._dispose();
        inputStates.delete(inputState);
      }
    }
  }
  _createInputStateFromOptions(groups, sessionOptions) {
    if (!sessionOptions?.length) {
      return new ChatSessionInputStateImpl(groups);
    }
    const resolvedGroups = groups.map((group) => {
      const match = sessionOptions.find((o) => o.optionId === group.id);
      if (!match) {
        return group;
      }
      const selectedItem = group.items.find((item) => item.id === match.value);
      if (!selectedItem) {
        return group;
      }
      return { ...group, selected: selectedItem };
    });
    return new ChatSessionInputStateImpl(resolvedGroups);
  }
  /**
   * Gets the input state for a session. This calls the controller's `getChatSessionInputState` handler if available,
   * otherwise falls back to creating an input state from the session options.
   */
  async getInputStateForSession(sessionResource, initialSessionOptions, token) {
    const sessionType = sessionResource ? getChatSessionType(sessionResource) : void 0;
    const controllerData = sessionType ? this.getChatSessionItemController(sessionType) : void 0;
    const resolvedResource = sessionResource && !isUntitledChatSession(sessionResource) ? sessionResource : void 0;
    if (controllerData?.controller.getChatSessionInputState) {
      const result = await controllerData.controller.getChatSessionInputState(
        resolvedResource,
        { previousInputState: this._createInputStateFromOptions(controllerData.optionGroups ?? [], initialSessionOptions) },
        token
      );
      if (result) {
        if (result instanceof ChatSessionInputStateImpl) {
          if (sessionResource && controllerData) {
            this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
          }
          if (sessionResource && isUntitledChatSession(sessionResource)) {
            result.untitledSessionResource = sessionResource;
          } else if (sessionResource) {
            result.sessionResource = resolvedResource;
          }
        }
        return result;
      }
    }
    const fallback = this._createInputStateFromOptions(controllerData?.optionGroups ?? [], initialSessionOptions);
    fallback.sessionResource = resolvedResource;
    return fallback;
  }
  /**
   * Wraps option group commands with proxy commands so that extensions using the new
   * `getChatSessionInputState` API receive `{ inputState, sessionResource }` instead of just `sessionResource`.
   *
   * For controllers that do not implement the new API, commands are returned unchanged.
   */
  _wrapOptionGroupCommands(controllerHandle, groups) {
    const controllerData = this._chatSessionItemControllers.get(controllerHandle);
    if (!controllerData?.controller.getChatSessionInputState) {
      return groups;
    }
    return groups.map((group) => {
      if (!group.commands?.length) {
        return group;
      }
      return {
        ...group,
        commands: group.commands.map((command) => {
          const proxyId = `_chatSession.proxyCommand.${generateUuid()}`;
          this._proxyCommands.set(proxyId, { originalCommandId: command.command, controllerHandle });
          this.commands.registerCommand(true, proxyId, async (...args) => {
            const sessionResource = args[0] instanceof URI ? args[0] : void 0;
            const inputState = await this.getInputStateForSession(
              sessionResource,
              void 0,
              CancellationToken.None
            );
            return this.commands.executeCommand(
              command.command,
              { inputState, sessionResource },
              ...command.arguments ?? []
            );
          });
          return { ...command, command: proxyId };
        })
      };
    });
  }
  async getModelForRequest(request, extension) {
    let model;
    if (request.userSelectedModelId) {
      model = await this._languageModels.getLanguageModelByIdentifier(extension, request.userSelectedModelId);
    }
    if (!model) {
      model = await this._languageModels.getDefaultLanguageModel(extension);
      if (!model) {
        throw new Error("Language model unavailable");
      }
    }
    return model;
  }
  convertRequestTurn(turn) {
    const variables = turn.references.map((ref) => this.convertReferenceToVariable(ref));
    return {
      type: "request",
      id: turn.id,
      prompt: turn.prompt,
      participant: turn.participant,
      command: turn.command,
      variableData: variables.length > 0 ? { variables } : void 0,
      modelId: turn.modelId,
      modeInstructions: typeConvert.ChatRequestModeInstructions.from(turn.modeInstructions2)
    };
  }
  convertReferenceToVariable(ref) {
    const value = ref.value && typeof ref.value === "object" && "uri" in ref.value && "range" in ref.value ? typeConvert.Location.from(ref.value) : ref.value;
    const range = ref.range ? { start: ref.range[0], endExclusive: ref.range[1] } : void 0;
    if (value && value instanceof extHostTypes.ChatReferenceDiagnostic && Array.isArray(value.diagnostics) && value.diagnostics.length && value.diagnostics[0][1].length) {
      const marker = Diagnostic.from(value.diagnostics[0][1][0]);
      const refValue = {
        filterRange: { startLineNumber: marker.startLineNumber, startColumn: marker.startColumn, endLineNumber: marker.endLineNumber, endColumn: marker.endColumn },
        filterSeverity: marker.severity,
        filterUri: value.diagnostics[0][0],
        problemMessage: value.diagnostics[0][1][0].message
      };
      return IDiagnosticVariableEntryFilterData.toEntry(refValue);
    }
    if (extHostTypes.Location.isLocation(ref.value) && ref.name.startsWith(`sym:`)) {
      const loc = typeConvert.Location.from(ref.value);
      return {
        id: ref.id,
        name: ref.name,
        fullName: ref.name.substring(4),
        value: { uri: ref.value.uri, range: loc.range },
        // We never send this information to extensions, so default to Property
        symbolKind: SymbolKind.Property,
        // We never send this information to extensions, so default to Property
        icon: SymbolKinds.toIcon(SymbolKind.Property),
        kind: "symbol",
        range
      };
    }
    if (URI.isUri(value) && ref.name.startsWith(`prompt:`)) {
      if (ref.id.startsWith(PromptFileVariableKind.Instruction)) {
        return toPromptFileVariableEntry(value, PromptFileVariableKind.Instruction);
      }
      if (ref.id.startsWith(PromptFileVariableKind.InstructionReference)) {
        return toPromptFileVariableEntry(value, PromptFileVariableKind.InstructionReference);
      }
      if (ref.id.startsWith(PromptFileVariableKind.PromptFile)) {
        return toPromptFileVariableEntry(value, PromptFileVariableKind.PromptFile);
      }
    }
    const isFile = URI.isUri(value) || value && typeof value === "object" && "uri" in value;
    const isFolder = isFile && URI.isUri(value) && value.path.endsWith("/");
    return {
      id: ref.id,
      name: ref.name,
      value,
      modelDescription: ref.modelDescription,
      range,
      kind: isFolder ? "directory" : isFile ? "file" : "generic"
    };
  }
  convertResponseTurn(turn, sessionDisposables) {
    const parts = coalesce(turn.response.map((r) => typeConvert.ChatResponsePart.from(r, this.commands.converter, sessionDisposables)));
    return {
      type: "response",
      parts,
      participant: turn.participant,
      details: turn.result?.details
    };
  }
  async $refreshChatSessionItems(handle, token) {
    const controllerData = this._chatSessionItemControllers.get(handle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${handle}`);
      return;
    }
    await controllerData.controller.refreshHandler(token);
  }
  async $newChatSessionItem(handle, request, token) {
    const controllerData = this._chatSessionItemControllers.get(handle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${handle}`);
      return void 0;
    }
    const handler = controllerData.controller.newChatSessionItemHandler;
    if (!handler) {
      return void 0;
    }
    const previousInputState = this._createInputStateFromOptions(controllerData.optionGroups ?? [], request.initialSessionOptions);
    let inputState;
    if (controllerData.controller.getChatSessionInputState) {
      inputState = await controllerData.controller.getChatSessionInputState(void 0, { previousInputState }, token);
    } else {
      inputState = previousInputState;
    }
    const item = await handler({
      request: {
        prompt: request.prompt,
        command: request.command
      },
      inputState
    }, token);
    if (!item) {
      return void 0;
    }
    controllerData.controller.items.add(item);
    return typeConvert.ChatSessionItem.from(item);
  }
  $onDidChangeChatSessionItemState(controllerHandle, sessionResourceComponents, archived) {
    const controllerData = this._chatSessionItemControllers.get(controllerHandle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${controllerHandle}`);
      return;
    }
    const sessionResource = URI.revive(sessionResourceComponents);
    const item = controllerData.controller.items.get(sessionResource);
    if (!item) {
      this._logService.warn(`No item found for session resource ${sessionResource.toString()}`);
      return;
    }
    item.archived = archived;
    controllerData.onDidChangeChatSessionItemStateEmitter.fire(item);
  }
  async $resolveChatSessionItem(handle, sessionResourceComponents, token) {
    const sessionResource = URI.revive(sessionResourceComponents);
    const controllerData = this._chatSessionItemControllers.get(handle);
    if (!controllerData?.controller.resolveChatSessionItem) {
      return void 0;
    }
    const item = controllerData.controller.items.get(sessionResource);
    if (!item) {
      this._logService.warn(`No item found for session resource ${sessionResource.toString()}`);
      return void 0;
    }
    await controllerData.controller.resolveChatSessionItem(item, token);
    const updatedItem = controllerData.controller.items.get(sessionResource);
    if (!updatedItem) {
      return void 0;
    }
    return typeConvert.ChatSessionItem.from(updatedItem);
  }
  async $provideChatSessionInputState(controllerHandle, sessionResourceComponents, token) {
    const controllerData = this._chatSessionItemControllers.get(controllerHandle);
    if (!controllerData) {
      this._logService.warn(`No controller found for handle ${controllerHandle}`);
      return void 0;
    }
    const handler = controllerData.controller.getChatSessionInputState;
    if (!handler) {
      return void 0;
    }
    const sessionResource = sessionResourceComponents ? URI.revive(sessionResourceComponents) : void 0;
    const inputState = await handler(!sessionResource || isUntitledChatSession(sessionResource) ? void 0 : sessionResource, { previousInputState: void 0 }, token);
    if (!inputState) {
      return void 0;
    }
    if (inputState instanceof ChatSessionInputStateImpl && sessionResource) {
      this._disposeInputStatesForResource(controllerData.inputStates, sessionResource);
      if (isUntitledChatSession(sessionResource)) {
        inputState.untitledSessionResource = sessionResource;
      } else {
        inputState.sessionResource = sessionResource;
      }
    }
    controllerData.optionGroups = inputState.groups;
    const wrappedGroups = this._wrapOptionGroupCommands(controllerHandle, inputState.groups);
    return wrappedGroups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      items: g.items,
      selected: g.selected,
      when: g.when,
      icon: g.icon,
      commands: g.commands,
      kind: g.kind
    }));
  }
};
ExtHostChatSessions = __decorateClass([
  __decorateParam(2, IExtHostRpcService),
  __decorateParam(3, ILogService)
], ExtHostChatSessions);
export {
  ExtHostChatSessions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q2hhdFNlc3Npb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCAqIGFzIG9iamVjdHMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBTeW1ib2xLaW5kLCBTeW1ib2xLaW5kcyB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhLCBJU3ltYm9sVmFyaWFibGVFbnRyeSwgUHJvbXB0RmlsZVZhcmlhYmxlS2luZCwgdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIGlzVW50aXRsZWRDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgUHJveGllZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbkNvbnRlbnRDb250ZXh0RHRvLCBFeHRIb3N0Q2hhdFNlc3Npb25zU2hhcGUsIElDaGF0QWdlbnRQcm9ncmVzc1NoYXBlLCBJQ2hhdE5ld1Nlc3Npb25SZXF1ZXN0RHRvLCBJQ2hhdFNlc3Npb25EdG8sIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucywgSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENoYXRTZXNzaW9uc1NoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFJlc3BvbnNlU3RyZWFtIH0gZnJvbSAnLi9leHRIb3N0Q2hhdEFnZW50czIuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNDb252ZXJ0ZXIsIEV4dEhvc3RDb21tYW5kcyB9IGZyb20gJy4vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVscyB9IGZyb20gJy4vZXh0SG9zdExhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnQgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0IHsgRGlhZ25vc3RpYyB9IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxudHlwZSBDaGF0U2Vzc2lvblRpbWluZyA9IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1bJ3RpbWluZyddO1xuXG4vLyAjcmVnaW9uIENoYXQgU2Vzc2lvbiBJbnB1dCBTdGF0ZVxuXG5jbGFzcyBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsIGltcGxlbWVudHMgdnNjb2RlLkNoYXRTZXNzaW9uSW5wdXRTdGF0ZSB7XG5cdCNncm91cHM6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXTtcblx0cmVhZG9ubHkgI29uQ2hhbmdlZERlbGVnYXRlOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgI29uRGlkQ2hhbmdlRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy4jb25EaWRDaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXG5cdHJlYWRvbmx5ICNvbkRpZERpc3Bvc2VFbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlID0gdGhpcy4jb25EaWREaXNwb3NlRW1pdHRlci5ldmVudDtcblxuXHQjc2Vzc2lvblJlc291cmNlOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkO1xuXHRnZXQgc2Vzc2lvblJlc291cmNlKCk6IHZzY29kZS5VcmkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNzZXNzaW9uUmVzb3VyY2U7XG5cdH1cblx0c2V0IHNlc3Npb25SZXNvdXJjZSh2YWx1ZTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuI3Nlc3Npb25SZXNvdXJjZSA9IHZhbHVlO1xuXHR9XG5cblx0I3VudGl0bGVkU2Vzc2lvblJlc291cmNlOiB2c2NvZGUuVXJpIHwgdW5kZWZpbmVkO1xuXHRnZXQgdW50aXRsZWRTZXNzaW9uUmVzb3VyY2UoKTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI3VudGl0bGVkU2Vzc2lvblJlc291cmNlO1xuXHR9XG5cdHNldCB1bnRpdGxlZFNlc3Npb25SZXNvdXJjZSh2YWx1ZTogdnNjb2RlLlVyaSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuI3VudGl0bGVkU2Vzc2lvblJlc291cmNlID0gdmFsdWU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihncm91cHM6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSwgb25DaGFuZ2VkRGVsZWdhdGU/OiAoKSA9PiB2b2lkKSB7XG5cdFx0dGhpcy4jZ3JvdXBzID0gZ3JvdXBzO1xuXHRcdHRoaXMuI29uQ2hhbmdlZERlbGVnYXRlID0gb25DaGFuZ2VkRGVsZWdhdGU7XG5cdH1cblxuXHRnZXQgZ3JvdXBzKCk6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSB7XG5cdFx0cmV0dXJuIHRoaXMuI2dyb3Vwcztcblx0fVxuXG5cdHNldCBncm91cHModmFsdWU6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSkge1xuXHRcdHRoaXMuI2dyb3VwcyA9IHZhbHVlO1xuXHRcdHRoaXMuI29uQ2hhbmdlZERlbGVnYXRlPy4oKTtcblx0fVxuXG5cdF9maXJlRGlkQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuI29uRGlkQ2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdH1cblxuXHRfc2V0R3JvdXBzKGdyb3VwczogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdKTogdm9pZCB7XG5cdFx0dGhpcy4jZ3JvdXBzID0gZ3JvdXBzO1xuXHR9XG5cblx0X2Rpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy4jb25EaWREaXNwb3NlRW1pdHRlci5maXJlKCk7XG5cdFx0dGhpcy4jb25EaWREaXNwb3NlRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy4jb25EaWRDaGFuZ2VFbWl0dGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG5cbi8vICNyZWdpb24gQ2hhdCBTZXNzaW9uIEl0ZW0gQ29udHJvbGxlclxuXG5jbGFzcyBDaGF0U2Vzc2lvbkl0ZW1JbXBsIGltcGxlbWVudHMgdnNjb2RlLkNoYXRTZXNzaW9uSXRlbSB7XG5cdCNsYWJlbDogc3RyaW5nO1xuXHQjaWNvblBhdGg/OiB2c2NvZGUuSWNvblBhdGg7XG5cdCNkZXNjcmlwdGlvbj86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0I2JhZGdlPzogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nO1xuXHQjc3RhdHVzPzogdnNjb2RlLkNoYXRTZXNzaW9uU3RhdHVzO1xuXHQjYXJjaGl2ZWQ/OiBib29sZWFuO1xuXHQjdG9vbHRpcD86IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZztcblx0I3RpbWluZz86IENoYXRTZXNzaW9uVGltaW5nO1xuXHQjY2hhbmdlcz86IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvbkNoYW5nZWRGaWxlW107XG5cdCNtZXRhZGF0YT86IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogdW5rbm93biB9O1xuXHQjb25DaGFuZ2VkOiAoKSA9PiB2b2lkO1xuXG5cdHJlYWRvbmx5IHJlc291cmNlOiB2c2NvZGUuVXJpO1xuXG5cdGNvbnN0cnVjdG9yKHJlc291cmNlOiB2c2NvZGUuVXJpLCBsYWJlbDogc3RyaW5nLCBvbkNoYW5nZWQ6ICgpID0+IHZvaWQpIHtcblx0XHR0aGlzLnJlc291cmNlID0gcmVzb3VyY2U7XG5cdFx0dGhpcy4jbGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLiNvbkNoYW5nZWQgPSBvbkNoYW5nZWQ7XG5cdH1cblxuXHRnZXQgbGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy4jbGFiZWw7XG5cdH1cblxuXHRzZXQgbGFiZWwodmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLiNsYWJlbCAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI2xhYmVsID0gdmFsdWU7XG5cdFx0XHR0aGlzLiNvbkNoYW5nZWQoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaWNvblBhdGgoKTogdnNjb2RlLkljb25QYXRoIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jaWNvblBhdGg7XG5cdH1cblxuXHRzZXQgaWNvblBhdGgodmFsdWU6IHZzY29kZS5JY29uUGF0aCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiNpY29uUGF0aCAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI2ljb25QYXRoID0gdmFsdWU7XG5cdFx0XHR0aGlzLiNvbkNoYW5nZWQoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgZGVzY3JpcHRpb24oKTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jZGVzY3JpcHRpb247XG5cdH1cblxuXHRzZXQgZGVzY3JpcHRpb24odmFsdWU6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiNkZXNjcmlwdGlvbiAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI2Rlc2NyaXB0aW9uID0gdmFsdWU7XG5cdFx0XHR0aGlzLiNvbkNoYW5nZWQoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgYmFkZ2UoKTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jYmFkZ2U7XG5cdH1cblxuXHRzZXQgYmFkZ2UodmFsdWU6IHN0cmluZyB8IHZzY29kZS5NYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiNiYWRnZSAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI2JhZGdlID0gdmFsdWU7XG5cdFx0XHR0aGlzLiNvbkNoYW5nZWQoKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgc3RhdHVzKCk6IHZzY29kZS5DaGF0U2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI3N0YXR1cztcblx0fVxuXG5cdHNldCBzdGF0dXModmFsdWU6IHZzY29kZS5DaGF0U2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiNzdGF0dXMgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLiNzdGF0dXMgPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBhcmNoaXZlZCgpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jYXJjaGl2ZWQ7XG5cdH1cblxuXHRzZXQgYXJjaGl2ZWQodmFsdWU6IGJvb2xlYW4gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy4jYXJjaGl2ZWQgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLiNhcmNoaXZlZCA9IHZhbHVlO1xuXHRcdFx0dGhpcy4jb25DaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHRvb2x0aXAoKTogc3RyaW5nIHwgdnNjb2RlLk1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy4jdG9vbHRpcDtcblx0fVxuXG5cdHNldCB0b29sdGlwKHZhbHVlOiBzdHJpbmcgfCB2c2NvZGUuTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy4jdG9vbHRpcCAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI3Rvb2x0aXAgPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCB0aW1pbmcoKTogQ2hhdFNlc3Npb25UaW1pbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiN0aW1pbmc7XG5cdH1cblxuXHRzZXQgdGltaW5nKHZhbHVlOiBDaGF0U2Vzc2lvblRpbWluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLiN0aW1pbmcgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLiN0aW1pbmcgPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjaGFuZ2VzKCk6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvbkNoYW5nZWRGaWxlW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLiNjaGFuZ2VzO1xuXHR9XG5cblx0c2V0IGNoYW5nZXModmFsdWU6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvbkNoYW5nZWRGaWxlW10gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy4jY2hhbmdlcyAhPT0gdmFsdWUpIHtcblx0XHRcdHRoaXMuI2NoYW5nZXMgPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBtZXRhZGF0YSgpOiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd24gfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI21ldGFkYXRhO1xuXHR9XG5cblx0c2V0IG1ldGFkYXRhKHZhbHVlOiB7IHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHVua25vd24gfSB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh2YWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdtZXRhZGF0YSBtdXN0IGJlIEpTT04tc2VyaWFsaXphYmxlJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghb2JqZWN0cy5lcXVhbHModGhpcy4jbWV0YWRhdGEsIHZhbHVlKSkge1xuXHRcdFx0dGhpcy4jbWV0YWRhdGEgPSB2YWx1ZTtcblx0XHRcdHRoaXMuI29uQ2hhbmdlZCgpO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgQ2hhdFNlc3Npb25EZWx0YSB7XG5cdHJlYWRvbmx5IGFkZGVkT3JVcGRhdGVkPzogUmVzb3VyY2VNYXA8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbT47XG5cdHJlYWRvbmx5IHJlbW92ZWQ/OiBSZXNvdXJjZVNldDtcbn1cblxuZnVuY3Rpb24gY29tcHV0ZUl0ZW1zRGVsdGEob2xkSXRlbXM6IFJlc291cmNlTWFwPHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW0+LCBuZXdJdGVtczogUmVzb3VyY2VNYXA8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbT4pOiBDaGF0U2Vzc2lvbkRlbHRhIHtcblx0Y29uc3QgZGVsdGEgPSB7XG5cdFx0YWRkZWRPclVwZGF0ZWQ6IG5ldyBSZXNvdXJjZU1hcDx2c2NvZGUuQ2hhdFNlc3Npb25JdGVtPigpLFxuXHRcdHJlbW92ZWQ6IG5ldyBSZXNvdXJjZVNldCgpLFxuXHR9IHNhdGlzZmllcyBDaGF0U2Vzc2lvbkRlbHRhO1xuXG5cdGZvciAoY29uc3QgW25ld1Jlc291cmNlLCBuZXdJdGVtXSBvZiBuZXdJdGVtcykge1xuXHRcdGNvbnN0IG9sZEl0ZW0gPSBvbGRJdGVtcy5nZXQobmV3UmVzb3VyY2UpO1xuXHRcdGlmIChvbGRJdGVtICE9PSBuZXdJdGVtKSB7XG5cdFx0XHRkZWx0YS5hZGRlZE9yVXBkYXRlZC5zZXQobmV3UmVzb3VyY2UsIG5ld0l0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdGZvciAoY29uc3Qgb2xkUmVzb3VyY2Ugb2Ygb2xkSXRlbXMua2V5cygpKSB7XG5cdFx0aWYgKCFuZXdJdGVtcy5oYXMob2xkUmVzb3VyY2UpKSB7XG5cdFx0XHRkZWx0YS5yZW1vdmVkLmFkZChvbGRSZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGRlbHRhO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0Q2hhdFNlc3Npb25EZWx0YVRvRHRvKGRlbHRhOiBDaGF0U2Vzc2lvbkRlbHRhKTogeyBhZGRlZE9yVXBkYXRlZDogUmV0dXJuVHlwZTx0eXBlb2YgdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25JdGVtLmZyb20+W107IHJlbW92ZWQ6IFVSSVtdIH0ge1xuXHRyZXR1cm4ge1xuXHRcdGFkZGVkT3JVcGRhdGVkOiBkZWx0YS5hZGRlZE9yVXBkYXRlZCA/IEFycmF5LmZyb20oZGVsdGEuYWRkZWRPclVwZGF0ZWQudmFsdWVzKCksIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tKSA6IFtdLFxuXHRcdHJlbW92ZWQ6IGRlbHRhLnJlbW92ZWQgPyBBcnJheS5mcm9tKGRlbHRhLnJlbW92ZWQua2V5cygpKSA6IFtdXG5cdH07XG59XG5cbmNsYXNzIENoYXRTZXNzaW9uSXRlbUNvbGxlY3Rpb25JbXBsIGltcGxlbWVudHMgdnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbGxlY3Rpb24ge1xuXHQjaXRlbXMgPSBuZXcgUmVzb3VyY2VNYXA8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbT4oKTtcblx0cmVhZG9ubHkgI3Byb3h5OiBQcm94aWVkPE1haW5UaHJlYWRDaGF0U2Vzc2lvbnNTaGFwZT47XG5cdHJlYWRvbmx5ICNjb250cm9sbGVySGFuZGxlOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoY29udHJvbGxlckhhbmRsZTogbnVtYmVyLCBwcm94eTogUHJveGllZDxNYWluVGhyZWFkQ2hhdFNlc3Npb25zU2hhcGU+KSB7XG5cdFx0dGhpcy4jcHJveHkgPSBwcm94eTtcblx0XHR0aGlzLiNjb250cm9sbGVySGFuZGxlID0gY29udHJvbGxlckhhbmRsZTtcblx0fVxuXG5cdGdldCBzaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuI2l0ZW1zLnNpemU7XG5cdH1cblxuXHRyZXBsYWNlKG5ld0l0ZW1zOiByZWFkb25seSB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtW10pOiB2b2lkIHtcblx0XHRpZiAoIW5ld0l0ZW1zLmxlbmd0aCAmJiAhdGhpcy4jaXRlbXMuc2l6ZSkge1xuXHRcdFx0Ly8gTm8gY2hhbmdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3SXRlbXNNYXAgPSBuZXcgUmVzb3VyY2VNYXAobmV3SXRlbXMubWFwKGl0ZW0gPT4gW2l0ZW0ucmVzb3VyY2UsIGl0ZW1dIGFzIGNvbnN0KSk7XG5cblx0XHRjb25zdCBkZWx0YSA9IGNvbXB1dGVJdGVtc0RlbHRhKHRoaXMuI2l0ZW1zLCBuZXdJdGVtc01hcCk7XG5cdFx0aWYgKCFkZWx0YS5hZGRlZE9yVXBkYXRlZD8uc2l6ZSAmJiAhZGVsdGEucmVtb3ZlZD8uc2l6ZSkge1xuXHRcdFx0Ly8gTm8gY2hhbmdlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy4jaXRlbXMgPSBuZXdJdGVtc01hcDtcblx0XHR2b2lkIHRoaXMuI3Byb3h5LiR1cGRhdGVDaGF0U2Vzc2lvbkl0ZW1zKHRoaXMuI2NvbnRyb2xsZXJIYW5kbGUsIGNvbnZlcnRDaGF0U2Vzc2lvbkRlbHRhVG9EdG8oZGVsdGEpKTtcblx0fVxuXG5cdGZvckVhY2goY2FsbGJhY2s6IChpdGVtOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtLCBjb2xsZWN0aW9uOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29sbGVjdGlvbikgPT4gdW5rbm93biwgdGhpc0FyZz86IGFueSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW18sIGl0ZW1dIG9mIHRoaXMuI2l0ZW1zKSB7XG5cdFx0XHRjYWxsYmFjay5jYWxsKHRoaXNBcmcsIGl0ZW0sIHRoaXMpO1xuXHRcdH1cblx0fVxuXG5cdGFkZChpdGVtOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLiNpdGVtcy5nZXQoaXRlbS5yZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nID09PSBpdGVtKSB7XG5cdFx0XHQvLyBXZSdyZSBhZGRpbmcgdGhlIHNhbWUgaXRlbSBhZ2FpblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuI2l0ZW1zLnNldChpdGVtLnJlc291cmNlLCBpdGVtKTtcblx0XHR2b2lkIHRoaXMuI3Byb3h5LiRhZGRPclVwZGF0ZUNoYXRTZXNzaW9uSXRlbSh0aGlzLiNjb250cm9sbGVySGFuZGxlLCB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkl0ZW0uZnJvbShpdGVtKSk7XG5cdH1cblxuXHRkZWxldGUocmVzb3VyY2U6IHZzY29kZS5VcmkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy4jaXRlbXMuZGVsZXRlKHJlc291cmNlKSkge1xuXHRcdFx0dm9pZCB0aGlzLiNwcm94eS4kdXBkYXRlQ2hhdFNlc3Npb25JdGVtcyh0aGlzLiNjb250cm9sbGVySGFuZGxlLCB7XG5cdFx0XHRcdGFkZGVkT3JVcGRhdGVkOiBbXSxcblx0XHRcdFx0cmVtb3ZlZDogW3Jlc291cmNlXVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0KHJlc291cmNlOiB2c2NvZGUuVXJpKTogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI2l0ZW1zLmdldChyZXNvdXJjZSk7XG5cdH1cblxuXHRbU3ltYm9sLml0ZXJhdG9yXSgpOiBJdGVyYXRvcjxyZWFkb25seSBbaWQ6IFVSSSwgY2hhdFNlc3Npb25JdGVtOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtXT4ge1xuXHRcdHJldHVybiB0aGlzLiNpdGVtcy5lbnRyaWVzKCk7XG5cdH1cbn1cblxuLy8gI2VuZHJlZ2lvblxuXG5jbGFzcyBFeHRIb3N0Q2hhdFNlc3Npb24ge1xuXHRwcml2YXRlIF9zdHJlYW06IENoYXRBZ2VudFJlc3BvbnNlU3RyZWFtO1xuXHQvLyBFbXB0eSBtYXAgc2luY2UgcXVlc3Rpb24gY2Fyb3VzZWwgaXMgZGVzaWduZWQgZm9yIGNoYXQgYWdlbnRzLCBub3QgY2hhdCBzZXNzaW9uc1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgRGVmZXJyZWRQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkPj4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlc3Npb246IHZzY29kZS5DaGF0U2Vzc2lvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sXG5cdFx0cmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3h5OiBJQ2hhdEFnZW50UHJvZ3Jlc3NTaGFwZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29tbWFuZHNDb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBzZXNzaW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZVxuXHQpIHtcblx0XHR0aGlzLl9zdHJlYW0gPSBuZXcgQ2hhdEFnZW50UmVzcG9uc2VTdHJlYW0oZXh0ZW5zaW9uLCByZXF1ZXN0LCBwcm94eSwgY29tbWFuZHNDb252ZXJ0ZXIsIHNlc3Npb25EaXNwb3NhYmxlcywgdGhpcy5fcGVuZGluZ0Nhcm91c2VsUmVzb2x2ZXJzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdGdldCBhY3RpdmVSZXNwb25zZVN0cmVhbSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RyZWFtO1xuXHR9XG5cblx0Z2V0QWN0aXZlUmVxdWVzdFN0cmVhbShyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCkge1xuXHRcdHJldHVybiBuZXcgQ2hhdEFnZW50UmVzcG9uc2VTdHJlYW0odGhpcy5leHRlbnNpb24sIHJlcXVlc3QsIHRoaXMucHJveHksIHRoaXMuY29tbWFuZHNDb252ZXJ0ZXIsIHRoaXMuc2Vzc2lvbkRpc3Bvc2FibGVzLCB0aGlzLl9wZW5kaW5nQ2Fyb3VzZWxSZXNvbHZlcnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q2hhdFNlc3Npb25zIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIEV4dEhvc3RDaGF0U2Vzc2lvbnNTaGFwZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBQcm94aWVkPE1haW5UaHJlYWRDaGF0U2Vzc2lvbnNTaGFwZT47XG5cblx0cHJpdmF0ZSBfaXRlbUNvbnRyb2xsZXJIYW5kbGVQb29sID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMgPSBuZXcgTWFwPC8qIGhhbmRsZSAqLyBudW1iZXIsIHtcblx0XHRyZWFkb25seSBjaGF0U2Vzc2lvblR5cGU6IHN0cmluZztcblx0XHRyZWFkb25seSBjb250cm9sbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcjtcblx0XHRyZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRyZWFkb25seSBkaXNwb3NhYmxlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdFx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZUVtaXR0ZXI6IEVtaXR0ZXI8dnNjb2RlLkNoYXRTZXNzaW9uSXRlbT47XG5cdFx0cmVhZG9ubHkgaW5wdXRTdGF0ZXM6IFNldDxDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsPjtcblx0XHRvcHRpb25Hcm91cHM/OiByZWFkb25seSB2c2NvZGUuQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW107XG5cdH0+KCk7XG5cblx0cHJpdmF0ZSBfY29udGVudFByb3ZpZGVySGFuZGxlUG9vbCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVycyA9IG5ldyBNYXA8LyogaGFuZGxlICovIG51bWJlciwge1xuXHRcdHJlYWRvbmx5IGNoYXRTZXNzaW9uU2NoZW1lOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgcHJvdmlkZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcjtcblx0XHRyZWFkb25seSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcblx0XHRyZWFkb25seSBjYXBhYmlsaXRpZXM/OiB2c2NvZGUuQ2hhdFNlc3Npb25DYXBhYmlsaXRpZXM7XG5cdFx0cmVhZG9ubHkgZGlzcG9zYWJsZTogRGlzcG9zYWJsZVN0b3JlO1xuXHR9PigpO1xuXG5cdC8qKlxuXHQgKiBNYXAgb2YgdXJpIC0+IGNoYXQgc2Vzc2lvbnMgaW5mb3Ncblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dEhvc3RDaGF0U2Vzc2lvbnMgPSBuZXcgUmVzb3VyY2VNYXA8eyByZWFkb25seSBzZXNzaW9uT2JqOiBFeHRIb3N0Q2hhdFNlc3Npb247IHJlYWRvbmx5IGRpc3Bvc2VDdHM6IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0+KCk7XG5cblx0LyoqXG5cdCAqIE1hcCBvZiBwcm94eSBjb21tYW5kIGlkIC0+IG9yaWdpbmFsIGNvbW1hbmQgaWQgKyBjb250cm9sbGVyIGhhbmRsZS5cblx0ICogVXNlZCB0byB3cmFwIG9wdGlvbiBncm91cCBjb21tYW5kcyBzbyB0aGV5IHJlY2VpdmUgYHsgaW5wdXRTdGF0ZSwgc2Vzc2lvblJlc291cmNlIH1gIGluc3RlYWQgb2YganVzdCBgc2Vzc2lvblJlc291cmNlYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5Q29tbWFuZHMgPSBuZXcgTWFwPC8qIHByb3h5SWQgKi8gc3RyaW5nLCB7IHJlYWRvbmx5IG9yaWdpbmFsQ29tbWFuZElkOiBzdHJpbmc7IHJlYWRvbmx5IGNvbnRyb2xsZXJIYW5kbGU6IG51bWJlciB9PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZHM6IEV4dEhvc3RDb21tYW5kcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsczogRXh0SG9zdExhbmd1YWdlTW9kZWxzLFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IHRoaXMuX2V4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZENoYXRTZXNzaW9ucyk7XG5cblx0XHRjb21tYW5kcy5yZWdpc3RlckFyZ3VtZW50UHJvY2Vzc29yKHtcblx0XHRcdHByb2Nlc3NBcmd1bWVudDogKGFyZykgPT4ge1xuXHRcdFx0XHRpZiAoYXJnICYmIGFyZy4kbWlkID09PSBNYXJzaGFsbGVkSWQuQWdlbnRTZXNzaW9uQ29udGV4dCkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gYXJnLnNlc3Npb24ucmVzb3VyY2U7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB7IGNvbnRyb2xsZXIgfSBvZiB0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy52YWx1ZXMoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbSA9IGNvbnRyb2xsZXIuaXRlbXMuZ2V0KHJlc291cmNlKTtcblx0XHRcdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBpdGVtO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gY2hhdCBzZXNzaW9uIGZvdW5kIHdpdGggdXJpOiAke3Jlc291cmNlfWApO1xuXHRcdFx0XHRcdHJldHVybiBhcmc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gYXJnO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Ly8gVGhlIGxlZ2FjeSBwcm92aWRlciBhcGkgaXMgaW1wbGVtZW50ZWQgdXNpbmcgdGhlIG5ldyBjb250cm9sbGVyIEFQSSBvbiB0aGUgYmFja2VuZFxuXHRcdGNvbnN0IGNvbnRyb2xsZXJIYW5kbGUgPSB0aGlzLl9pdGVtQ29udHJvbGxlckhhbmRsZVBvb2wrKztcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGVFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW0+KCkpO1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBDaGF0U2Vzc2lvbkl0ZW1Db2xsZWN0aW9uSW1wbChjb250cm9sbGVySGFuZGxlLCB0aGlzLl9wcm94eSk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciA9IHtcblx0XHRcdGlkOiBjaGF0U2Vzc2lvblR5cGUsXG5cdFx0XHRpdGVtczogY29sbGVjdGlvbixcblx0XHRcdGNyZWF0ZUNoYXRTZXNzaW9uSXRlbTogKF9yZXNvdXJjZTogdnNjb2RlLlVyaSwgX2xhYmVsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQgZm9yIHByb3ZpZGVycycpO1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZTogKF9vcHRpb25zOiB2c2NvZGUuQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10pID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsKFtdKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlOiBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlRW1pdHRlci5ldmVudCxcblx0XHRcdG5ld0NoYXRTZXNzaW9uSXRlbUhhbmRsZXI6IHVuZGVmaW5lZCxcblx0XHRcdC8vIEJyaWRnZSB0aGUgZGVwcmVjYXRlZCBgQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbWAgaG9vayB0aHJvdWdoIHRoZVxuXHRcdFx0Ly8gbmV3IGNvbnRyb2xsZXIgc3VyZmFjZSBzbyBib3RoIGNvZGUgcGF0aHMgc2hhcmUgdGhlIHNhbWUgYCRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtYCBpbXBsLlxuXHRcdFx0Ly8gVGhlIGxlZ2FjeSBwcm92aWRlciByZXR1cm5zIGEgbmV3IGl0ZW07IHRoZSBicmlkZ2UgYWRkcyBpdCB0byB0aGUgY29sbGVjdGlvbiBzbyB0aGVcblx0XHRcdC8vIGNvbnRyb2xsZXIgY29udHJhY3QgKHVwZGF0ZSB2aWEgY29sbGVjdGlvbiwgcmV0dXJuIHZvaWQpIGlzIHNhdGlzZmllZC5cblx0XHRcdHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW06IHByb3ZpZGVyLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW1cblx0XHRcdFx0PyBhc3luYyAoaXRlbSwgdG9rZW4pID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHByb3ZpZGVyLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0hKGl0ZW0sIHRva2VuKTtcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rpb24uYWRkKHJlc29sdmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH0sXG5cdFx0XHRyZWZyZXNoSGFuZGxlcjogYXN5bmMgKHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25JdGVtcyh0b2tlbikgPz8gW107XG5cdFx0XHRcdGNvbGxlY3Rpb24ucmVwbGFjZShpdGVtcyk7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy5zZXQoY29udHJvbGxlckhhbmRsZSwgeyBjaGF0U2Vzc2lvblR5cGU6IGNoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlciwgZXh0ZW5zaW9uLCBkaXNwb3NhYmxlOiBkaXNwb3NhYmxlcywgb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZUVtaXR0ZXIsIGlucHV0U3RhdGVzOiBuZXcgU2V0KCkgfSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihjb250cm9sbGVySGFuZGxlLCBjaGF0U2Vzc2lvblR5cGUsICEhcHJvdmlkZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSk7XG5cblx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1zKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgRXh0SG9zdENoYXRTZXNzaW9ucy4gUHJvdmlkZXIgaXRlbXMgY2hhbmdlZCBmb3IgJHtjaGF0U2Vzc2lvblR5cGV9YCk7XG5cdFx0XHRcdC8vIFdoZW4gYSBwcm92aWRlciBmaXJlcyB0aGlzLCB3ZSB0cmVhdCBpdCB0aGUgc2FtZSBhcyB0cmlnZ2VyaW5nIGEgcmVmcmVzaCBpbiB0aGUgbmV3IGNvbnRyb2xsZXIgYmFzZWQgbW9kZWwuXG5cdFx0XHRcdC8vIFRoaXMgaXMgYmVjYXVzZSB3aXRoIHByb3ZpZGVycywgZmlyaW5nIHRoaXMgZXZlbnQgd291bGQgc2lnbmFsIHRoYXQgYHByb3ZpZGVgIHNob3VsZCBiZSBjYWxsZWQgYWdhaW4uXG5cdFx0XHRcdC8vIFdpdGggY29udHJvbGxlcnMsIGl0IGluc3RlYWQgc2lnbmFscyB0aGF0IHlvdSBzaG91bGQgcmVhZCB0aGUgY3VycmVudCBpdGVtcyBhZ2Fpbi5cblx0XHRcdFx0Y29udHJvbGxlci5yZWZyZXNoSGFuZGxlcihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAocHJvdmlkZXIub25EaWRDb21taXRDaGF0U2Vzc2lvbkl0ZW0pIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENvbW1pdENoYXRTZXNzaW9uSXRlbSgoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IG9yaWdpbmFsLCBtb2RpZmllZCB9ID0gZTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ29tbWl0Q2hhdFNlc3Npb25JdGVtKGNvbnRyb2xsZXJIYW5kbGUsIG9yaWdpbmFsLnJlc291cmNlLCBtb2RpZmllZC5yZXNvdXJjZSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZTogdnNjb2RlLkRpc3Bvc2FibGUgPSB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLmRlbGV0ZShjb250cm9sbGVySGFuZGxlKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHJldHVybiBPYmplY3QuYXNzaWduKGRpc3Bvc2FibGUsIHtcblx0XHRcdG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGU6IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGVFbWl0dGVyLmV2ZW50LFxuXHRcdH0pO1xuXHR9XG5cblx0Y3JlYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgcmVmcmVzaEhhbmRsZXI6ICh0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKSA9PiBUaGVuYWJsZTx2b2lkPik6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIHtcblx0XHRjb25zdCBjb250cm9sbGVySGFuZGxlID0gdGhpcy5faXRlbUNvbnRyb2xsZXJIYW5kbGVQb29sKys7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRsZXQgaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGxldCBuZXdDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlclsnbmV3Q2hhdFNlc3Npb25JdGVtSGFuZGxlciddO1xuXHRcdGxldCBmb3JrSGFuZGxlcjogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJbJ2ZvcmtIYW5kbGVyJ107XG5cdFx0bGV0IHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlclsncmVzb2x2ZUNoYXRTZXNzaW9uSXRlbSddO1xuXHRcdGxldCBwcm92aWRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlSGFuZGxlcjogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJbJ2dldENoYXRTZXNzaW9uSW5wdXRTdGF0ZSddO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGVFbWl0dGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW0+KCkpO1xuXHRcdGNvbnN0IGlucHV0U3RhdGVzID0gbmV3IFNldDxDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsPigpO1xuXG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IG5ldyBDaGF0U2Vzc2lvbkl0ZW1Db2xsZWN0aW9uSW1wbChjb250cm9sbGVySGFuZGxlLCB0aGlzLl9wcm94eSk7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9wcm94eTtcblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBPYmplY3QuZnJlZXplPHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyPih7XG5cdFx0XHRpZCxcblx0XHRcdHJlZnJlc2hIYW5kbGVyOiBhc3luYyAocmVmcmVzaFRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRpZiAoaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciBoYXMgYmVlbiBkaXNwb3NlZCcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgRXh0SG9zdENoYXRTZXNzaW9ucy4gQ29udHJvbGxlcigke2lkfSkucmVmcmVzaCgpYCk7XG5cdFx0XHRcdGF3YWl0IHJlZnJlc2hIYW5kbGVyKHJlZnJlc2hUb2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0aXRlbXM6IGNvbGxlY3Rpb24sXG5cdFx0XHRvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlOiBvbkRpZENoYW5nZUNoYXRTZXNzaW9uSXRlbVN0YXRlRW1pdHRlci5ldmVudCxcblx0XHRcdGNyZWF0ZUNoYXRTZXNzaW9uSXRlbTogKHJlc291cmNlOiB2c2NvZGUuVXJpLCBsYWJlbDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmIChpc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIGhhcyBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpdGVtID0gbmV3IENoYXRTZXNzaW9uSXRlbUltcGwocmVzb3VyY2UsIGxhYmVsLCAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSBpdGVtIHJlYWxseSBpcyBpbiB0aGUgY29sbGVjdGlvbi4gSWYgbm90IHdlIGRvbid0IG5lZWQgdG8gdHJhbnNtaXQgaXQgdG8gdGhlIG1haW4gdGhyZWFkIHlldFxuXHRcdFx0XHRcdGlmIChjb2xsZWN0aW9uLmdldChyZXNvdXJjZSkgPT09IGl0ZW0pIHtcblx0XHRcdFx0XHRcdHZvaWQgdGhpcy5fcHJveHkuJGFkZE9yVXBkYXRlQ2hhdFNlc3Npb25JdGVtKGNvbnRyb2xsZXJIYW5kbGUsIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tKGl0ZW0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgbmV3Q2hhdFNlc3Npb25JdGVtSGFuZGxlcigpIHsgcmV0dXJuIG5ld0NoYXRTZXNzaW9uSXRlbUhhbmRsZXI7IH0sXG5cdFx0XHRzZXQgbmV3Q2hhdFNlc3Npb25JdGVtSGFuZGxlcihoYW5kbGVyOiB2c2NvZGUuQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlclsnbmV3Q2hhdFNlc3Npb25JdGVtSGFuZGxlciddKSB7IG5ld0NoYXRTZXNzaW9uSXRlbUhhbmRsZXIgPSBoYW5kbGVyOyB9LFxuXHRcdFx0Z2V0IGZvcmtIYW5kbGVyKCkgeyByZXR1cm4gZm9ya0hhbmRsZXI7IH0sXG5cdFx0XHRzZXQgZm9ya0hhbmRsZXIoaGFuZGxlcjogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJbJ2ZvcmtIYW5kbGVyJ10pIHsgZm9ya0hhbmRsZXIgPSBoYW5kbGVyOyB9LFxuXHRcdFx0Z2V0IHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0oKSB7IHJldHVybiByZXNvbHZlQ2hhdFNlc3Npb25JdGVtSGFuZGxlcjsgfSxcblx0XHRcdHNldCByZXNvbHZlQ2hhdFNlc3Npb25JdGVtKGhhbmRsZXI6IHZzY29kZS5DaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyWydyZXNvbHZlQ2hhdFNlc3Npb25JdGVtJ10pIHtcblx0XHRcdFx0Y29uc3QgaGFkSGFuZGxlciA9ICEhcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbUhhbmRsZXI7XG5cdFx0XHRcdHJlc29sdmVDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyID0gaGFuZGxlcjtcblx0XHRcdFx0Y29uc3QgaGFzSGFuZGxlciA9ICEhaGFuZGxlcjtcblx0XHRcdFx0aWYgKGhhZEhhbmRsZXIgIT09IGhhc0hhbmRsZXIgJiYgIWlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRwcm94eS4kdXBkYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlckNhcGFiaWxpdGllcyhjb250cm9sbGVySGFuZGxlLCBoYXNIYW5kbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGdldCBnZXRDaGF0U2Vzc2lvbklucHV0U3RhdGUoKSB7IHJldHVybiBwcm92aWRlQ2hhdFNlc3Npb25JbnB1dFN0YXRlSGFuZGxlcjsgfSxcblx0XHRcdHNldCBnZXRDaGF0U2Vzc2lvbklucHV0U3RhdGUoaGFuZGxlcjogdnNjb2RlLkNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJbJ2dldENoYXRTZXNzaW9uSW5wdXRTdGF0ZSddKSB7IHByb3ZpZGVDaGF0U2Vzc2lvbklucHV0U3RhdGVIYW5kbGVyID0gaGFuZGxlcjsgfSxcblx0XHRcdGNyZWF0ZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZTogKGdyb3VwczogdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdKSA9PiB7XG5cdFx0XHRcdGlmIChpc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyIGhhcyBiZWVuIGRpc3Bvc2VkJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpbnB1dFN0YXRlID0gbmV3IENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGwoZ3JvdXBzLCAoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gU3RvcmUgdXBkYXRlZCBvcHRpb24gZ3JvdXBzIG9uIHRoZSBjb250cm9sbGVyIGVudHJ5XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy5nZXQoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0XHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdFx0XHRlbnRyeS5vcHRpb25Hcm91cHMgPSBpbnB1dFN0YXRlLmdyb3Vwcztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgd3JhcHBlZEdyb3VwcyA9IHRoaXMuX3dyYXBPcHRpb25Hcm91cENvbW1hbmRzKGNvbnRyb2xsZXJIYW5kbGUsIGlucHV0U3RhdGUuZ3JvdXBzKTtcblx0XHRcdFx0XHRjb25zdCBzZXJpYWxpemFibGVHcm91cHMgPSB3cmFwcGVkR3JvdXBzLm1hcChnID0+ICh7XG5cdFx0XHRcdFx0XHRpZDogZy5pZCxcblx0XHRcdFx0XHRcdG5hbWU6IGcubmFtZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBnLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0aXRlbXM6IGcuaXRlbXMsXG5cdFx0XHRcdFx0XHRzZWxlY3RlZDogZy5zZWxlY3RlZCxcblx0XHRcdFx0XHRcdHdoZW46IGcud2hlbixcblx0XHRcdFx0XHRcdGljb246IGcuaWNvbixcblx0XHRcdFx0XHRcdGNvbW1hbmRzOiBnLmNvbW1hbmRzLFxuXHRcdFx0XHRcdFx0a2luZDogZy5raW5kLFxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGlucHV0U3RhdGUuc2Vzc2lvblJlc291cmNlID8/IGlucHV0U3RhdGUudW50aXRsZWRTZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHR2b2lkIHRoaXMuX3Byb3h5LiR1cGRhdGVDaGF0U2Vzc2lvbklucHV0U3RhdGUoY29udHJvbGxlckhhbmRsZSwgcmVzb3VyY2UsIHNlcmlhbGl6YWJsZUdyb3Vwcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aW5wdXRTdGF0ZXMuYWRkKGlucHV0U3RhdGUpO1xuXHRcdFx0XHRyZXR1cm4gaW5wdXRTdGF0ZTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlucHV0U3RhdGUgb2YgaW5wdXRTdGF0ZXMpIHtcblx0XHRcdFx0XHRpbnB1dFN0YXRlLl9kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5wdXRTdGF0ZXMuY2xlYXIoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLnNldChjb250cm9sbGVySGFuZGxlLCB7IGNvbnRyb2xsZXIsIGV4dGVuc2lvbiwgZGlzcG9zYWJsZTogZGlzcG9zYWJsZXMsIGNoYXRTZXNzaW9uVHlwZTogaWQsIG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtU3RhdGVFbWl0dGVyLCBpbnB1dFN0YXRlcyB9KTtcblxuXHRcdC8vIFJlZ2lzdGVyIHRoZSBjb250cm9sbGVyIHdpdGggdGhlIG1haW4gdGhyZWFkLiBgcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbWAgbWF5IGJlIGFzc2lnbmVkXG5cdFx0Ly8gbGF0ZXIgdmlhIHRoZSBzZXR0ZXIsIHdoaWNoIGZpcmVzIGAkdXBkYXRlQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlckNhcGFiaWxpdGllc2AgdG9cblx0XHQvLyBmbGlwIGBzdXBwb3J0c1Jlc29sdmVgIG9uLiBTdGFydCBvdXQgYXMgYGZhbHNlYCBzbyBjb250cm9sbGVycyB0aGF0IG5ldmVyIHNldCB0aGVcblx0XHQvLyBoYW5kbGVyIGRvbid0IHBheSBhbiBSUEMgcGVyIHJlbmRlci5cblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUsIGlkLCAhIXJlc29sdmVDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMuZGVsZXRlKGNvbnRyb2xsZXJIYW5kbGUpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNvbnRyb2xsZXJIYW5kbGUpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBjb250cm9sbGVyO1xuXHR9XG5cblx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgY2hhdFNlc3Npb25TY2hlbWU6IHN0cmluZywgY2hhdFBhcnRpY2lwYW50OiB2c2NvZGUuQ2hhdFBhcnRpY2lwYW50LCBwcm92aWRlcjogdnNjb2RlLkNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyLCBjYXBhYmlsaXRpZXM/OiB2c2NvZGUuQ2hhdFNlc3Npb25DYXBhYmlsaXRpZXMpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5fY29udGVudFByb3ZpZGVySGFuZGxlUG9vbCsrO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dGhpcy5fY2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXJzLnNldChoYW5kbGUsIHsgY2hhdFNlc3Npb25TY2hlbWUsIHByb3ZpZGVyLCBleHRlbnNpb24sIGNhcGFiaWxpdGllcywgZGlzcG9zYWJsZTogZGlzcG9zYWJsZXMgfSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoaGFuZGxlLCBjaGF0U2Vzc2lvblNjaGVtZSk7XG5cblx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbk9wdGlvbnMpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUNoYXRTZXNzaW9uT3B0aW9ucyhldnQgPT4ge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdFx0Zm9yIChjb25zdCB1cGRhdGUgb2YgZXZ0LnVwZGF0ZXMpIHtcblx0XHRcdFx0XHR1cGRhdGVzW3VwZGF0ZS5vcHRpb25JZF0gPSB1cGRhdGUudmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25PcHRpb25zKGhhbmRsZSwgZXZ0LnJlc291cmNlLCB1cGRhdGVzKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAocHJvdmlkZXIub25EaWRDaGFuZ2VDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucykge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRDaGFuZ2VDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyhoYW5kbGUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXJzLmRlbGV0ZShoYW5kbGUpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihoYW5kbGUpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVDaGF0U2Vzc2lvbkNvbnRlbnQoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIGNvbnRleHQ6IENoYXRTZXNzaW9uQ29udGVudENvbnRleHREdG8sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRTZXNzaW9uRHRvPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBwcm92aWRlciBmb3IgaGFuZGxlICR7aGFuZGxlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlQ29tcG9uZW50cyk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0bGV0IGlucHV0U3RhdGU6IHZzY29kZS5DaGF0U2Vzc2lvbklucHV0U3RhdGU7XG5cdFx0aWYgKGNvbnRyb2xsZXJEYXRhPy5jb250cm9sbGVyLmdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZSkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29udHJvbGxlckRhdGEuY29udHJvbGxlci5nZXRDaGF0U2Vzc2lvbklucHV0U3RhdGUoaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgPyB1bmRlZmluZWQgOiBzZXNzaW9uUmVzb3VyY2UsIHtcblx0XHRcdFx0cHJldmlvdXNJbnB1dFN0YXRlOiB0aGlzLl9jcmVhdGVJbnB1dFN0YXRlRnJvbU9wdGlvbnMoY29udHJvbGxlckRhdGEub3B0aW9uR3JvdXBzID8/IFtdLCBjb250ZXh0LmluaXRpYWxTZXNzaW9uT3B0aW9ucyksXG5cdFx0XHR9LCB0b2tlbik7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdGlucHV0U3RhdGUgPSByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlucHV0U3RhdGUgPz89IHRoaXMuX2NyZWF0ZUlucHV0U3RhdGVGcm9tT3B0aW9ucyhcblx0XHRcdGNvbnRyb2xsZXJEYXRhPy5vcHRpb25Hcm91cHMgPz8gW10sIGNvbnRleHQuaW5pdGlhbFNlc3Npb25PcHRpb25zXG5cdFx0KTtcblxuXHRcdGlmIChpbnB1dFN0YXRlIGluc3RhbmNlb2YgQ2hhdFNlc3Npb25JbnB1dFN0YXRlSW1wbCkge1xuXHRcdFx0Ly8gRGlzcG9zZSBhbnkgcHJldmlvdXMgaW5wdXQgc3RhdGVzIGZvciB0aGlzIHNlc3Npb24gcmVzb3VyY2Vcblx0XHRcdGlmIChjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NlSW5wdXRTdGF0ZXNGb3JSZXNvdXJjZShjb250cm9sbGVyRGF0YS5pbnB1dFN0YXRlcywgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdGlucHV0U3RhdGUudW50aXRsZWRTZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpbnB1dFN0YXRlLnNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIHRva2VuLCB7XG5cdFx0XHRpbnB1dFN0YXRlLFxuXHRcdH0pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbkRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGlkID0gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdFNlc3Npb24gPSBuZXcgRXh0SG9zdENoYXRTZXNzaW9uKHNlc3Npb24sIHByb3ZpZGVyLmV4dGVuc2lvbiwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0cmVxdWVzdElkOiAnb25nb2luZycsXG5cdFx0XHRhZ2VudElkOiBpZCxcblx0XHRcdG1lc3NhZ2U6ICcnLFxuXHRcdFx0dmFyaWFibGVzOiB7IHZhcmlhYmxlczogW10gfSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdH0sIHtcblx0XHRcdCRoYW5kbGVQcm9ncmVzc0NodW5rOiAocmVxdWVzdElkLCBjaHVua3MpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRoYW5kbGVQcm9ncmVzc0NodW5rKGhhbmRsZSwgc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0SWQsIGNodW5rcyk7XG5cdFx0XHR9LFxuXHRcdFx0JGhhbmRsZUFuY2hvclJlc29sdmU6IChyZXF1ZXN0SWQsIHJlcXVlc3RIYW5kbGUsIGFuY2hvcikgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kaGFuZGxlQW5jaG9yUmVzb2x2ZShoYW5kbGUsIHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdElkLCByZXF1ZXN0SGFuZGxlLCBhbmNob3IpO1xuXHRcdFx0fSxcblx0XHR9LCB0aGlzLmNvbW1hbmRzLmNvbnZlcnRlciwgc2Vzc2lvbkRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2VDdHMgPSBzZXNzaW9uRGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHR0aGlzLl9leHRIb3N0Q2hhdFNlc3Npb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHsgc2Vzc2lvbk9iajogY2hhdFNlc3Npb24sIGRpc3Bvc2VDdHMgfSk7XG5cblx0XHQvLyBDYWxsIGFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2sgaW1tZWRpYXRlbHkgZm9yIGJlc3QgdXNlciBleHBlcmllbmNlXG5cdFx0aWYgKHNlc3Npb24uYWN0aXZlUmVzcG9uc2VDYWxsYmFjaykge1xuXHRcdFx0UHJvbWlzZS5yZXNvbHZlKHNlc3Npb24uYWN0aXZlUmVzcG9uc2VDYWxsYmFjayhjaGF0U2Vzc2lvbi5hY3RpdmVSZXNwb25zZVN0cmVhbS5hcGlPYmplY3QsIGRpc3Bvc2VDdHMudG9rZW4pKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0Ly8gY29tcGxldGVcblx0XHRcdFx0dGhpcy5fcHJveHkuJGhhbmRsZVByb2dyZXNzQ29tcGxldGUoaGFuZGxlLCBzZXNzaW9uUmVzb3VyY2UsICdvbmdvaW5nJyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3QgeyBjYXBhYmlsaXRpZXMgfSA9IHByb3ZpZGVyO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0dGl0bGU6IHNlc3Npb24udGl0bGUsXG5cdFx0XHRoYXNBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiAhIXNlc3Npb24uYWN0aXZlUmVzcG9uc2VDYWxsYmFjayxcblx0XHRcdGhhc1JlcXVlc3RIYW5kbGVyOiAhIXNlc3Npb24ucmVxdWVzdEhhbmRsZXIsXG5cdFx0XHRoYXNGb3JrSGFuZGxlcjogISFjb250cm9sbGVyRGF0YT8uY29udHJvbGxlci5mb3JrSGFuZGxlciB8fCAhIXNlc3Npb24uZm9ya0hhbmRsZXIsXG5cdFx0XHRzdXBwb3J0c0ludGVycnVwdGlvbjogISFjYXBhYmlsaXRpZXM/LnN1cHBvcnRzSW50ZXJydXB0aW9ucyxcblx0XHRcdG9wdGlvbnM6IHNlc3Npb24ub3B0aW9ucyxcblx0XHRcdGhpc3Rvcnk6IHNlc3Npb24uaGlzdG9yeS5tYXAodHVybiA9PiB7XG5cdFx0XHRcdGlmICh0dXJuIGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkNoYXRSZXF1ZXN0VHVybikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbnZlcnRSZXF1ZXN0VHVybih0dXJuKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jb252ZXJ0UmVzcG9uc2VUdXJuKHR1cm4gYXMgZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVR1cm4yLCBzZXNzaW9uRGlzcG9zYWJsZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2UoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHVwZGF0ZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSB8IHVuZGVmaW5lZD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBwcm92aWRlciBmb3IgaGFuZGxlICR7aGFuZGxlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9sZCBwcm92aWRlciBiYXNlZCBpbXBsZW1lbnRhdGlvblxuXHRcdGlmIChwcm92aWRlci5wcm92aWRlci5wcm92aWRlSGFuZGxlT3B0aW9uc0NoYW5nZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdXBkYXRlc1RvU2VuZCA9IE9iamVjdC5lbnRyaWVzKHVwZGF0ZXMpLm1hcCgoW29wdGlvbklkLCB2YWx1ZV0pID0+ICh7XG5cdFx0XHRcdFx0b3B0aW9uSWQsXG5cdFx0XHRcdFx0dmFsdWU6IHZhbHVlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdmFsdWUuaWQpXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0cHJvdmlkZXIucHJvdmlkZXIucHJvdmlkZUhhbmRsZU9wdGlvbnNDaGFuZ2Uoc2Vzc2lvblJlc291cmNlLCB1cGRhdGVzVG9TZW5kLCB0b2tlbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciBjYWxsaW5nIHByb3ZpZGVIYW5kbGVPcHRpb25zQ2hhbmdlIGZvciBoYW5kbGUgJHtoYW5kbGV9LCBzZXNzaW9uUmVzb3VyY2UgJHtzZXNzaW9uUmVzb3VyY2V9OmAsIGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5nZXRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNlc3Npb25UeXBlKTtcblx0XHRpZiAoIWNvbnRyb2xsZXJEYXRhIHx8ICFjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLmdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyB2YWxpZCBjb250cm9sbGVyIGZvdW5kIGZvciBzZXNzaW9uIHR5cGUgJHtzZXNzaW9uVHlwZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUZW1wb3Jhcnkgd29ya2Fyb3VuZDogaW5wdXQgc3RhdGUgY2hhbmdlcyBmb3Igb25lIHJlc291cmNlIGFyZSBwcm9wYWdhdGVkIHRvIGFsbFxuXHRcdC8vIGlucHV0IHN0YXRlcyBmb3IgdGhlIHNhbWUgcmVzb3VyY2UgdHlwZSB1bnRpbCB3ZSBjYW4gbWFrZSB0aGlzIHNlc3Npb24tc3BlY2lmaWMuXG5cdFx0Zm9yIChjb25zdCBpbnB1dFN0YXRlIG9mIGNvbnRyb2xsZXJEYXRhPy5pbnB1dFN0YXRlcyA/PyBbXSkge1xuXHRcdFx0Ly8gVXBkYXRlIHRoZSBzZWxlY3RlZCBpdGVtcyBvbiB0aGUgZ3JvdXBzIGJlZm9yZSBmaXJpbmcgdGhlIGNoYW5nZSBldmVudFxuXHRcdFx0Y29uc3QgdXBkYXRlZEdyb3VwcyA9IGlucHV0U3RhdGUuZ3JvdXBzLm1hcChncm91cCA9PiB7XG5cdFx0XHRcdGNvbnN0IHVwZGF0ZSA9IHVwZGF0ZXNbZ3JvdXAuaWRdO1xuXHRcdFx0XHRpZiAoIXVwZGF0ZSkge1xuXHRcdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkSWQgPSB0eXBlb2YgdXBkYXRlID09PSAnc3RyaW5nJyA/IHVwZGF0ZSA6IHVwZGF0ZS5pZDtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gZ3JvdXAuaXRlbXMuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IHNlbGVjdGVkSWQpO1xuXHRcdFx0XHRpZiAoIXNlbGVjdGVkSXRlbSkge1xuXHRcdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyAuLi5ncm91cCwgc2VsZWN0ZWQ6IHNlbGVjdGVkSXRlbSB9O1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFVzZSBxdWlldCBzZXR0ZXIgdG8gYXZvaWQgbm90aWZ5aW5nIHRoZSBtYWluIHRocmVhZCBiYWNrIChpdCdzIHRoZSBzb3VyY2Ugb2YgdGhpcyBjaGFuZ2UpXG5cdFx0XHRpbnB1dFN0YXRlLl9zZXRHcm91cHModXBkYXRlZEdyb3Vwcyk7XG5cdFx0XHRpbnB1dFN0YXRlLl9maXJlRGlkQ2hhbmdlKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9ucyhoYW5kbGU6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2NoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIHByb3ZpZGVyIGZvciBoYW5kbGUgJHtoYW5kbGV9IHdoZW4gcmVxdWVzdGluZyBjaGF0IHNlc3Npb24gb3B0aW9uc2ApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gZW50cnkucHJvdmlkZXI7XG5cdFx0aWYgKCFwcm92aWRlci5wcm92aWRlQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zKHRva2VuKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgb3B0aW9uR3JvdXBzLCBuZXdTZXNzaW9uT3B0aW9ucyB9ID0gcmVzdWx0O1xuXHRcdFx0aWYgKG9wdGlvbkdyb3Vwcykge1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihlbnRyeS5jaGF0U2Vzc2lvblNjaGVtZSk7XG5cdFx0XHRcdGlmIChjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0XHRcdGNvbnRyb2xsZXJEYXRhLm9wdGlvbkdyb3VwcyA9IG9wdGlvbkdyb3Vwcztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b3B0aW9uR3JvdXBzLFxuXHRcdFx0XHRuZXdTZXNzaW9uT3B0aW9ucyxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIGNhbGxpbmcgcHJvdmlkZUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25zIGZvciBoYW5kbGUgJHtoYW5kbGV9OmAsIGVycm9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkaW50ZXJydXB0Q2hhdFNlc3Npb25BY3RpdmVSZXNwb25zZShwcm92aWRlckhhbmRsZTogbnVtYmVyLCBzZXNzaW9uUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHJlcXVlc3RJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9leHRIb3N0Q2hhdFNlc3Npb25zLmdldChVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdGVudHJ5Py5kaXNwb3NlQ3RzLmNhbmNlbCgpO1xuXHR9XG5cblx0YXN5bmMgJGRpc3Bvc2VDaGF0U2Vzc2lvbkNvbnRlbnQocHJvdmlkZXJIYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9leHRIb3N0Q2hhdFNlc3Npb25zLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBjaGF0IHNlc3Npb24gZm91bmQgZm9yIHJlc291cmNlOiAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIGlucHV0IHN0YXRlcyBhc3NvY2lhdGVkIHdpdGggdGhpcyBzZXNzaW9uXG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLmdldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIocmVzb3VyY2Uuc2NoZW1lKTtcblx0XHRpZiAoY29udHJvbGxlckRhdGEpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VJbnB1dFN0YXRlc0ZvclJlc291cmNlKGNvbnRyb2xsZXJEYXRhLmlucHV0U3RhdGVzLCByZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0ZW50cnkuZGlzcG9zZUN0cy5jYW5jZWwoKTtcblx0XHRlbnRyeS5zZXNzaW9uT2JqLnNlc3Npb25EaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZXh0SG9zdENoYXRTZXNzaW9ucy5kZWxldGUocmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgJGludm9rZUNoYXRTZXNzaW9uUmVxdWVzdEhhbmRsZXIoaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZTogVXJpQ29tcG9uZW50cywgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIGhpc3Rvcnk6IGFueVtdLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2V4dEhvc3RDaGF0U2Vzc2lvbnMuZ2V0KFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKCFlbnRyeSB8fCAhZW50cnkuc2Vzc2lvbk9iai5zZXNzaW9uLnJlcXVlc3RIYW5kbGVyKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFJlcXVlc3QgPSB0eXBlQ29udmVydC5DaGF0QWdlbnRSZXF1ZXN0LnRvKHJlcXVlc3QsIHVuZGVmaW5lZCwgYXdhaXQgdGhpcy5nZXRNb2RlbEZvclJlcXVlc3QocmVxdWVzdCwgZW50cnkuc2Vzc2lvbk9iai5leHRlbnNpb24pLCByZXF1ZXN0Lm1vZGVsQ29uZmlndXJhdGlvbiwgW10sIG5ldyBNYXAoKSwgZW50cnkuc2Vzc2lvbk9iai5leHRlbnNpb24sIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgc3RyZWFtID0gZW50cnkuc2Vzc2lvbk9iai5nZXRBY3RpdmVSZXF1ZXN0U3RyZWFtKHJlcXVlc3QpO1xuXHRcdGF3YWl0IGVudHJ5LnNlc3Npb25PYmouc2Vzc2lvbi5yZXF1ZXN0SGFuZGxlcihjaGF0UmVxdWVzdCwgeyBoaXN0b3J5LCB5aWVsZFJlcXVlc3RlZDogZmFsc2UgfSwgc3RyZWFtLmFwaU9iamVjdCwgdG9rZW4pO1xuXG5cdFx0Ly8gVE9ETzogZG8gd2UgbmVlZCB0byBkaXNwb3NlIHRoZSBzdHJlYW0gb2JqZWN0P1xuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdGFzeW5jICRmb3JrQ2hhdFNlc3Npb24oaGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIHJlcXVlc3Q6IElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbUR0byB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZXR1cm5UeXBlPHR5cGVvZiB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkl0ZW0uZnJvbT4+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucmV2aXZlKHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHMpO1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZXh0SG9zdENoYXRTZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGNoYXQgc2Vzc2lvbiBmb3VuZCBmb3IgcmVzb3VyY2UgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0VHVybiA9IHRoaXMuY29udmVydFJlcXVlc3REdG9Ub1JlcXVlc3RUdXJuKHJlcXVlc3QpO1xuXG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLmdldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdGlmIChjb250cm9sbGVyRGF0YT8uY29udHJvbGxlci5mb3JrSGFuZGxlcikge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGF3YWl0IGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuZm9ya0hhbmRsZXIoc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0VHVybiwgdG9rZW4pO1xuXHRcdFx0cmV0dXJuIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tKGl0ZW0pO1xuXHRcdH1cblxuXHRcdGlmICghZW50cnkuc2Vzc2lvbk9iai5zZXNzaW9uLmZvcmtIYW5kbGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGZvcmsgaGFuZGxlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSBhd2FpdCBlbnRyeS5zZXNzaW9uT2JqLnNlc3Npb24uZm9ya0hhbmRsZXIoc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0VHVybiwgdG9rZW4pO1xuXHRcdHJldHVybiB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkl0ZW0uZnJvbShpdGVtKTtcblx0fVxuXG5cdHByaXZhdGUgY29udmVydFJlcXVlc3REdG9Ub1JlcXVlc3RUdXJuKHJlcXVlc3Q6IElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbUR0byB8IHVuZGVmaW5lZCk6IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdFR1cm4gfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdFR1cm4oXG5cdFx0XHRyZXF1ZXN0LnByb21wdCxcblx0XHRcdHJlcXVlc3QuY29tbWFuZCxcblx0XHRcdFtdLFxuXHRcdFx0cmVxdWVzdC5wYXJ0aWNpcGFudCxcblx0XHRcdFtdLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0cmVxdWVzdC5pZCxcblx0XHRcdHJlcXVlc3QubW9kZWxJZCxcblx0XHRcdHR5cGVDb252ZXJ0LkNoYXRSZXF1ZXN0TW9kZUluc3RydWN0aW9ucy50byhyZXF1ZXN0Lm1vZGVJbnN0cnVjdGlvbnMpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpIHtcblx0XHRmb3IgKGNvbnN0IGNvbnRyb2xsZXJEYXRhIG9mIHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoY29udHJvbGxlckRhdGEuY2hhdFNlc3Npb25UeXBlID09PSBjaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRyb2xsZXJEYXRhO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlSW5wdXRTdGF0ZXNGb3JSZXNvdXJjZShpbnB1dFN0YXRlczogU2V0PENoYXRTZXNzaW9uSW5wdXRTdGF0ZUltcGw+LCByZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpbnB1dFN0YXRlIG9mIGlucHV0U3RhdGVzKSB7XG5cdFx0XHRjb25zdCBpbnB1dFJlc291cmNlID0gaW5wdXRTdGF0ZS5zZXNzaW9uUmVzb3VyY2UgPz8gaW5wdXRTdGF0ZS51bnRpdGxlZFNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGlmIChpbnB1dFJlc291cmNlICYmIGlzRXF1YWwocmVzb3VyY2UsIGlucHV0UmVzb3VyY2UpKSB7XG5cdFx0XHRcdGlucHV0U3RhdGUuX2Rpc3Bvc2UoKTtcblx0XHRcdFx0aW5wdXRTdGF0ZXMuZGVsZXRlKGlucHV0U3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUlucHV0U3RhdGVGcm9tT3B0aW9ucyhcblx0XHRncm91cHM6IHJlYWRvbmx5IHZzY29kZS5DaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSxcblx0XHRzZXNzaW9uT3B0aW9ucz86IFJlYWRvbmx5QXJyYXk8eyBvcHRpb25JZDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+LFxuXHQpOiBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsIHtcblx0XHRpZiAoIXNlc3Npb25PcHRpb25zPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBuZXcgQ2hhdFNlc3Npb25JbnB1dFN0YXRlSW1wbChncm91cHMpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkR3JvdXBzID0gZ3JvdXBzLm1hcChncm91cCA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaCA9IHNlc3Npb25PcHRpb25zLmZpbmQobyA9PiBvLm9wdGlvbklkID09PSBncm91cC5pZCk7XG5cdFx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGVkSXRlbSA9IGdyb3VwLml0ZW1zLmZpbmQoaXRlbSA9PiBpdGVtLmlkID09PSBtYXRjaC52YWx1ZSk7XG5cdFx0XHRpZiAoIXNlbGVjdGVkSXRlbSkge1xuXHRcdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyAuLi5ncm91cCwgc2VsZWN0ZWQ6IHNlbGVjdGVkSXRlbSB9O1xuXHRcdH0pO1xuXHRcdHJldHVybiBuZXcgQ2hhdFNlc3Npb25JbnB1dFN0YXRlSW1wbChyZXNvbHZlZEdyb3Vwcyk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgaW5wdXQgc3RhdGUgZm9yIGEgc2Vzc2lvbi4gVGhpcyBjYWxscyB0aGUgY29udHJvbGxlcidzIGBnZXRDaGF0U2Vzc2lvbklucHV0U3RhdGVgIGhhbmRsZXIgaWYgYXZhaWxhYmxlLFxuXHQgKiBvdGhlcndpc2UgZmFsbHMgYmFjayB0byBjcmVhdGluZyBhbiBpbnB1dCBzdGF0ZSBmcm9tIHRoZSBzZXNzaW9uIG9wdGlvbnMuXG5cdCAqL1xuXHRhc3luYyBnZXRJbnB1dFN0YXRlRm9yU2Vzc2lvbihcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCxcblx0XHRpbml0aWFsU2Vzc2lvbk9wdGlvbnM6IFJlYWRvbmx5QXJyYXk8eyBvcHRpb25JZDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIH0+IHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTx2c2NvZGUuQ2hhdFNlc3Npb25JbnB1dFN0YXRlPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBzZXNzaW9uUmVzb3VyY2UgPyBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHNlc3Npb25UeXBlID8gdGhpcy5nZXRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNlc3Npb25UeXBlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXNvbHZlZFJlc291cmNlID0gc2Vzc2lvblJlc291cmNlICYmICFpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSA/IHNlc3Npb25SZXNvdXJjZSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY29udHJvbGxlckRhdGE/LmNvbnRyb2xsZXIuZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLmdldENoYXRTZXNzaW9uSW5wdXRTdGF0ZShcblx0XHRcdFx0cmVzb2x2ZWRSZXNvdXJjZSxcblx0XHRcdFx0eyBwcmV2aW91c0lucHV0U3RhdGU6IHRoaXMuX2NyZWF0ZUlucHV0U3RhdGVGcm9tT3B0aW9ucyhjb250cm9sbGVyRGF0YS5vcHRpb25Hcm91cHMgPz8gW10sIGluaXRpYWxTZXNzaW9uT3B0aW9ucykgfSxcblx0XHRcdFx0dG9rZW4sXG5cdFx0XHQpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRpZiAocmVzdWx0IGluc3RhbmNlb2YgQ2hhdFNlc3Npb25JbnB1dFN0YXRlSW1wbCkge1xuXHRcdFx0XHRcdC8vIERpc3Bvc2UgYW55IHByZXZpb3VzIGlucHV0IHN0YXRlcyBmb3IgdGhpcyBzZXNzaW9uIHJlc291cmNlXG5cdFx0XHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGlzcG9zZUlucHV0U3RhdGVzRm9yUmVzb3VyY2UoY29udHJvbGxlckRhdGEuaW5wdXRTdGF0ZXMsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnVudGl0bGVkU2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuc2Vzc2lvblJlc291cmNlID0gcmVzb2x2ZWRSZXNvdXJjZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZmFsbGJhY2sgPSB0aGlzLl9jcmVhdGVJbnB1dFN0YXRlRnJvbU9wdGlvbnMoY29udHJvbGxlckRhdGE/Lm9wdGlvbkdyb3VwcyA/PyBbXSwgaW5pdGlhbFNlc3Npb25PcHRpb25zKTtcblx0XHRmYWxsYmFjay5zZXNzaW9uUmVzb3VyY2UgPSByZXNvbHZlZFJlc291cmNlO1xuXHRcdHJldHVybiBmYWxsYmFjaztcblx0fVxuXG5cdC8qKlxuXHQgKiBXcmFwcyBvcHRpb24gZ3JvdXAgY29tbWFuZHMgd2l0aCBwcm94eSBjb21tYW5kcyBzbyB0aGF0IGV4dGVuc2lvbnMgdXNpbmcgdGhlIG5ld1xuXHQgKiBgZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlYCBBUEkgcmVjZWl2ZSBgeyBpbnB1dFN0YXRlLCBzZXNzaW9uUmVzb3VyY2UgfWAgaW5zdGVhZCBvZiBqdXN0IGBzZXNzaW9uUmVzb3VyY2VgLlxuXHQgKlxuXHQgKiBGb3IgY29udHJvbGxlcnMgdGhhdCBkbyBub3QgaW1wbGVtZW50IHRoZSBuZXcgQVBJLCBjb21tYW5kcyBhcmUgcmV0dXJuZWQgdW5jaGFuZ2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfd3JhcE9wdGlvbkdyb3VwQ29tbWFuZHMoXG5cdFx0Y29udHJvbGxlckhhbmRsZTogbnVtYmVyLFxuXHRcdGdyb3VwczogcmVhZG9ubHkgdnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdLFxuXHQpOiByZWFkb25seSB2c2NvZGUuQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMuZ2V0KGNvbnRyb2xsZXJIYW5kbGUpO1xuXHRcdGlmICghY29udHJvbGxlckRhdGE/LmNvbnRyb2xsZXIuZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZ3JvdXBzO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cHMubWFwKGdyb3VwID0+IHtcblx0XHRcdGlmICghZ3JvdXAuY29tbWFuZHM/Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4gZ3JvdXA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5ncm91cCxcblx0XHRcdFx0Y29tbWFuZHM6IGdyb3VwLmNvbW1hbmRzLm1hcChjb21tYW5kID0+IHtcblx0XHRcdFx0XHRjb25zdCBwcm94eUlkID0gYF9jaGF0U2Vzc2lvbi5wcm94eUNvbW1hbmQuJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXHRcdFx0XHRcdHRoaXMuX3Byb3h5Q29tbWFuZHMuc2V0KHByb3h5SWQsIHsgb3JpZ2luYWxDb21tYW5kSWQ6IGNvbW1hbmQuY29tbWFuZCwgY29udHJvbGxlckhhbmRsZSB9KTtcblxuXHRcdFx0XHRcdHRoaXMuY29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKHRydWUsIHByb3h5SWQsIGFzeW5jICguLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdFx0XHRcdC8vIFRoZSBtYWluIHRocmVhZCBwYXNzZXMgc2Vzc2lvblJlc291cmNlIGFzIHRoZSBmaXJzdCBhcmd1bWVudFxuXHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gYXJnc1swXSBpbnN0YW5jZW9mIFVSSSA/IGFyZ3NbMF0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnB1dFN0YXRlID0gYXdhaXQgdGhpcy5nZXRJbnB1dFN0YXRlRm9yU2Vzc2lvbihcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0Ly8gQ2FsbCB0aGUgb3JpZ2luYWwgY29tbWFuZCB3aXRoIHRoZSBuZXcgY29udGV4dCBvYmplY3Rcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRcdFx0XHRcdHsgaW5wdXRTdGF0ZSwgc2Vzc2lvblJlc291cmNlIH0sXG5cdFx0XHRcdFx0XHRcdC4uLihjb21tYW5kLmFyZ3VtZW50cyA/PyBbXSksXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4uY29tbWFuZCwgY29tbWFuZDogcHJveHlJZCB9O1xuXHRcdFx0XHR9KSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldE1vZGVsRm9yUmVxdWVzdChyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBQcm9taXNlPHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdD4ge1xuXHRcdGxldCBtb2RlbDogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChyZXF1ZXN0LnVzZXJTZWxlY3RlZE1vZGVsSWQpIHtcblx0XHRcdG1vZGVsID0gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHMuZ2V0TGFuZ3VhZ2VNb2RlbEJ5SWRlbnRpZmllcihleHRlbnNpb24sIHJlcXVlc3QudXNlclNlbGVjdGVkTW9kZWxJZCk7XG5cdFx0fVxuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdG1vZGVsID0gYXdhaXQgdGhpcy5fbGFuZ3VhZ2VNb2RlbHMuZ2V0RGVmYXVsdExhbmd1YWdlTW9kZWwoZXh0ZW5zaW9uKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMYW5ndWFnZSBtb2RlbCB1bmF2YWlsYWJsZScpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgY29udmVydFJlcXVlc3RUdXJuKHR1cm46IGV4dEhvc3RUeXBlcy5DaGF0UmVxdWVzdFR1cm4pIHtcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB0dXJuLnJlZmVyZW5jZXMubWFwKHJlZiA9PiB0aGlzLmNvbnZlcnRSZWZlcmVuY2VUb1ZhcmlhYmxlKHJlZikpO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAncmVxdWVzdCcgYXMgY29uc3QsXG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdHByb21wdDogdHVybi5wcm9tcHQsXG5cdFx0XHRwYXJ0aWNpcGFudDogdHVybi5wYXJ0aWNpcGFudCxcblx0XHRcdGNvbW1hbmQ6IHR1cm4uY29tbWFuZCxcblx0XHRcdHZhcmlhYmxlRGF0YTogdmFyaWFibGVzLmxlbmd0aCA+IDAgPyB7IHZhcmlhYmxlcyB9IDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZWxJZDogdHVybi5tb2RlbElkLFxuXHRcdFx0bW9kZUluc3RydWN0aW9uczogdHlwZUNvbnZlcnQuQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zLmZyb20odHVybi5tb2RlSW5zdHJ1Y3Rpb25zMiksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY29udmVydFJlZmVyZW5jZVRvVmFyaWFibGUocmVmOiB2c2NvZGUuQ2hhdFByb21wdFJlZmVyZW5jZSk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRcdGNvbnN0IHZhbHVlID0gcmVmLnZhbHVlICYmIHR5cGVvZiByZWYudmFsdWUgPT09ICdvYmplY3QnICYmICd1cmknIGluIHJlZi52YWx1ZSAmJiAncmFuZ2UnIGluIHJlZi52YWx1ZVxuXHRcdFx0PyB0eXBlQ29udmVydC5Mb2NhdGlvbi5mcm9tKHJlZi52YWx1ZSBhcyB2c2NvZGUuTG9jYXRpb24pXG5cdFx0XHQ6IHJlZi52YWx1ZTtcblx0XHRjb25zdCByYW5nZSA9IHJlZi5yYW5nZSA/IHsgc3RhcnQ6IHJlZi5yYW5nZVswXSwgZW5kRXhjbHVzaXZlOiByZWYucmFuZ2VbMV0gfSA6IHVuZGVmaW5lZDtcblxuXHRcdGlmICh2YWx1ZSAmJiB2YWx1ZSBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5DaGF0UmVmZXJlbmNlRGlhZ25vc3RpYyAmJiBBcnJheS5pc0FycmF5KHZhbHVlLmRpYWdub3N0aWNzKSAmJiB2YWx1ZS5kaWFnbm9zdGljcy5sZW5ndGggJiYgdmFsdWUuZGlhZ25vc3RpY3NbMF1bMV0ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSBEaWFnbm9zdGljLmZyb20odmFsdWUuZGlhZ25vc3RpY3NbMF1bMV1bMF0pO1xuXHRcdFx0Y29uc3QgcmVmVmFsdWU6IElEaWFnbm9zdGljVmFyaWFibGVFbnRyeUZpbHRlckRhdGEgPSB7XG5cdFx0XHRcdGZpbHRlclJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogbWFya2VyLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IG1hcmtlci5zdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogbWFya2VyLmVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogbWFya2VyLmVuZENvbHVtbiB9LFxuXHRcdFx0XHRmaWx0ZXJTZXZlcml0eTogbWFya2VyLnNldmVyaXR5LFxuXHRcdFx0XHRmaWx0ZXJVcmk6IHZhbHVlLmRpYWdub3N0aWNzWzBdWzBdLFxuXHRcdFx0XHRwcm9ibGVtTWVzc2FnZTogdmFsdWUuZGlhZ25vc3RpY3NbMF1bMV1bMF0ubWVzc2FnZVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBJRGlhZ25vc3RpY1ZhcmlhYmxlRW50cnlGaWx0ZXJEYXRhLnRvRW50cnkocmVmVmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmIChleHRIb3N0VHlwZXMuTG9jYXRpb24uaXNMb2NhdGlvbihyZWYudmFsdWUpICYmIHJlZi5uYW1lLnN0YXJ0c1dpdGgoYHN5bTpgKSkge1xuXHRcdFx0Y29uc3QgbG9jID0gdHlwZUNvbnZlcnQuTG9jYXRpb24uZnJvbShyZWYudmFsdWUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHJlZi5pZCxcblx0XHRcdFx0bmFtZTogcmVmLm5hbWUsXG5cdFx0XHRcdGZ1bGxOYW1lOiByZWYubmFtZS5zdWJzdHJpbmcoNCksXG5cdFx0XHRcdHZhbHVlOiB7IHVyaTogcmVmLnZhbHVlLnVyaSwgcmFuZ2U6IGxvYy5yYW5nZSB9LFxuXHRcdFx0XHQvLyBXZSBuZXZlciBzZW5kIHRoaXMgaW5mb3JtYXRpb24gdG8gZXh0ZW5zaW9ucywgc28gZGVmYXVsdCB0byBQcm9wZXJ0eVxuXHRcdFx0XHRzeW1ib2xLaW5kOiBTeW1ib2xLaW5kLlByb3BlcnR5LFxuXHRcdFx0XHQvLyBXZSBuZXZlciBzZW5kIHRoaXMgaW5mb3JtYXRpb24gdG8gZXh0ZW5zaW9ucywgc28gZGVmYXVsdCB0byBQcm9wZXJ0eVxuXHRcdFx0XHRpY29uOiBTeW1ib2xLaW5kcy50b0ljb24oU3ltYm9sS2luZC5Qcm9wZXJ0eSksXG5cdFx0XHRcdGtpbmQ6ICdzeW1ib2wnLFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdH0gc2F0aXNmaWVzIElTeW1ib2xWYXJpYWJsZUVudHJ5O1xuXHRcdH1cblxuXHRcdGlmIChVUkkuaXNVcmkodmFsdWUpICYmIHJlZi5uYW1lLnN0YXJ0c1dpdGgoYHByb21wdDpgKSkge1xuXHRcdFx0aWYgKHJlZi5pZC5zdGFydHNXaXRoKFByb21wdEZpbGVWYXJpYWJsZUtpbmQuSW5zdHJ1Y3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5KHZhbHVlLCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLkluc3RydWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWYuaWQuc3RhcnRzV2l0aChQcm9tcHRGaWxlVmFyaWFibGVLaW5kLkluc3RydWN0aW9uUmVmZXJlbmNlKSkge1xuXHRcdFx0XHRyZXR1cm4gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSh2YWx1ZSwgUHJvbXB0RmlsZVZhcmlhYmxlS2luZC5JbnN0cnVjdGlvblJlZmVyZW5jZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVmLmlkLnN0YXJ0c1dpdGgoUHJvbXB0RmlsZVZhcmlhYmxlS2luZC5Qcm9tcHRGaWxlKSkge1xuXHRcdFx0XHRyZXR1cm4gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeSh2YWx1ZSwgUHJvbXB0RmlsZVZhcmlhYmxlS2luZC5Qcm9tcHRGaWxlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpc0ZpbGUgPSBVUkkuaXNVcmkodmFsdWUpIHx8ICh2YWx1ZSAmJiB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmICd1cmknIGluIHZhbHVlKTtcblx0XHRjb25zdCBpc0ZvbGRlciA9IGlzRmlsZSAmJiBVUkkuaXNVcmkodmFsdWUpICYmIHZhbHVlLnBhdGguZW5kc1dpdGgoJy8nKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHJlZi5pZCxcblx0XHRcdG5hbWU6IHJlZi5uYW1lLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiByZWYubW9kZWxEZXNjcmlwdGlvbixcblx0XHRcdHJhbmdlLFxuXHRcdFx0a2luZDogaXNGb2xkZXIgPyAnZGlyZWN0b3J5JyBhcyBjb25zdCA6IGlzRmlsZSA/ICdmaWxlJyBhcyBjb25zdCA6ICdnZW5lcmljJyBhcyBjb25zdFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNvbnZlcnRSZXNwb25zZVR1cm4odHVybjogZXh0SG9zdFR5cGVzLkNoYXRSZXNwb25zZVR1cm4yLCBzZXNzaW9uRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkge1xuXHRcdGNvbnN0IHBhcnRzID0gY29hbGVzY2UodHVybi5yZXNwb25zZS5tYXAociA9PiB0eXBlQ29udmVydC5DaGF0UmVzcG9uc2VQYXJ0LmZyb20ociwgdGhpcy5jb21tYW5kcy5jb252ZXJ0ZXIsIHNlc3Npb25EaXNwb3NhYmxlcykpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3Jlc3BvbnNlJyBhcyBjb25zdCxcblx0XHRcdHBhcnRzLFxuXHRcdFx0cGFydGljaXBhbnQ6IHR1cm4ucGFydGljaXBhbnQsXG5cdFx0XHRkZXRhaWxzOiB0dXJuLnJlc3VsdD8uZGV0YWlscyxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgJHJlZnJlc2hDaGF0U2Vzc2lvbkl0ZW1zKGhhbmRsZTogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghY29udHJvbGxlckRhdGEpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gY29udHJvbGxlciBmb3VuZCBmb3IgaGFuZGxlICR7aGFuZGxlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIucmVmcmVzaEhhbmRsZXIodG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgJG5ld0NoYXRTZXNzaW9uSXRlbShoYW5kbGU6IG51bWJlciwgcmVxdWVzdDogSUNoYXROZXdTZXNzaW9uUmVxdWVzdER0bywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxSZXR1cm5UeXBlPHR5cGVvZiB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkl0ZW0uZnJvbT4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuX2NoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghY29udHJvbGxlckRhdGEpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gY29udHJvbGxlciBmb3VuZCBmb3IgaGFuZGxlICR7aGFuZGxlfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGVyID0gY29udHJvbGxlckRhdGEuY29udHJvbGxlci5uZXdDaGF0U2Vzc2lvbkl0ZW1IYW5kbGVyO1xuXHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c0lucHV0U3RhdGUgPSB0aGlzLl9jcmVhdGVJbnB1dFN0YXRlRnJvbU9wdGlvbnMoY29udHJvbGxlckRhdGEub3B0aW9uR3JvdXBzID8/IFtdLCByZXF1ZXN0LmluaXRpYWxTZXNzaW9uT3B0aW9ucyk7XG5cdFx0bGV0IGlucHV0U3RhdGU6IHZzY29kZS5DaGF0U2Vzc2lvbklucHV0U3RhdGU7XG5cdFx0aWYgKGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuZ2V0Q2hhdFNlc3Npb25JbnB1dFN0YXRlKSB7XG5cdFx0XHRpbnB1dFN0YXRlID0gYXdhaXQgY29udHJvbGxlckRhdGEuY29udHJvbGxlci5nZXRDaGF0U2Vzc2lvbklucHV0U3RhdGUodW5kZWZpbmVkLCB7IHByZXZpb3VzSW5wdXRTdGF0ZSB9LCB0b2tlbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlucHV0U3RhdGUgPSBwcmV2aW91c0lucHV0U3RhdGU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IGF3YWl0IGhhbmRsZXIoe1xuXHRcdFx0cmVxdWVzdDoge1xuXHRcdFx0XHRwcm9tcHQ6IHJlcXVlc3QucHJvbXB0LFxuXHRcdFx0XHRjb21tYW5kOiByZXF1ZXN0LmNvbW1hbmRcblx0XHRcdH0sXG5cdFx0XHRpbnB1dFN0YXRlLFxuXHRcdH0sIHRva2VuKTtcblx0XHRpZiAoIWl0ZW0pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29udHJvbGxlckRhdGEuY29udHJvbGxlci5pdGVtcy5hZGQoaXRlbSk7XG5cblx0XHRyZXR1cm4gdHlwZUNvbnZlcnQuQ2hhdFNlc3Npb25JdGVtLmZyb20oaXRlbSk7XG5cdH1cblxuXHQkb25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZShjb250cm9sbGVySGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMsIGFyY2hpdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy5nZXQoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBjb250cm9sbGVyIGZvdW5kIGZvciBoYW5kbGUgJHtjb250cm9sbGVySGFuZGxlfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlQ29tcG9uZW50cyk7XG5cdFx0Y29uc3QgaXRlbSA9IGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuaXRlbXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYE5vIGl0ZW0gZm91bmQgZm9yIHNlc3Npb24gcmVzb3VyY2UgJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpdGVtLmFyY2hpdmVkID0gYXJjaGl2ZWQ7XG5cdFx0Y29udHJvbGxlckRhdGEub25EaWRDaGFuZ2VDaGF0U2Vzc2lvbkl0ZW1TdGF0ZUVtaXR0ZXIuZmlyZShpdGVtKTtcblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlQ2hhdFNlc3Npb25JdGVtKGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFJldHVyblR5cGU8dHlwZW9mIHR5cGVDb252ZXJ0LkNoYXRTZXNzaW9uSXRlbS5mcm9tPiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlQ29tcG9uZW50cyk7XG5cblx0XHQvLyBCb3RoIHRoZSBuZXcgYENoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIucmVzb2x2ZUNoYXRTZXNzaW9uSXRlbWAgYW5kIHRoZSBkZXByZWNhdGVkXG5cdFx0Ly8gYENoYXRTZXNzaW9uSXRlbVByb3ZpZGVyLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW1gIGhvb2tzIGFyZSBicmlkZ2VkIG9udG8gdGhlIGNvbnRyb2xsZXJcblx0XHQvLyBzdXJmYWNlLCBzbyBhIHNpbmdsZSBjb2RlIHBhdGggaGFuZGxlcyBib3RoLlxuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5fY2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YT8uY29udHJvbGxlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLml0ZW1zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghaXRlbSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBpdGVtIGZvdW5kIGZvciBzZXNzaW9uIHJlc291cmNlICR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBjb250cm9sbGVyJ3MgcmVzb2x2ZSBoYW5kbGVyIHVwZGF0ZXMgdGhlIGl0ZW0gaW4gdGhlIGNvbGxlY3Rpb25cblx0XHQvLyAodmlhIGl0ZW1zLmFkZCBvciBieSBtdXRhdGluZyBwcm9wZXJ0aWVzKS4gV2UgcmUtcmVhZCBmcm9tIHRoZVxuXHRcdC8vIGNvbGxlY3Rpb24gYWZ0ZXIgaXQgY29tcGxldGVzIHRvIHBpY2sgdXAgdGhlIGNoYW5nZXMuXG5cdFx0YXdhaXQgY29udHJvbGxlckRhdGEuY29udHJvbGxlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKGl0ZW0sIHRva2VuKTtcblxuXHRcdGNvbnN0IHVwZGF0ZWRJdGVtID0gY29udHJvbGxlckRhdGEuY29udHJvbGxlci5pdGVtcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXVwZGF0ZWRJdGVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0eXBlQ29udmVydC5DaGF0U2Vzc2lvbkl0ZW0uZnJvbSh1cGRhdGVkSXRlbSk7XG5cdH1cblxuXHRhc3luYyAkcHJvdmlkZUNoYXRTZXNzaW9uSW5wdXRTdGF0ZShjb250cm9sbGVySGFuZGxlOiBudW1iZXIsIHNlc3Npb25SZXNvdXJjZUNvbXBvbmVudHM6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLkNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLl9jaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVycy5nZXQoY29udHJvbGxlckhhbmRsZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBObyBjb250cm9sbGVyIGZvdW5kIGZvciBoYW5kbGUgJHtjb250cm9sbGVySGFuZGxlfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kbGVyID0gY29udHJvbGxlckRhdGEuY29udHJvbGxlci5nZXRDaGF0U2Vzc2lvbklucHV0U3RhdGU7XG5cdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzID8gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2VDb21wb25lbnRzKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbnB1dFN0YXRlID0gYXdhaXQgaGFuZGxlcighc2Vzc2lvblJlc291cmNlIHx8IGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpID8gdW5kZWZpbmVkIDogc2Vzc2lvblJlc291cmNlLCB7IHByZXZpb3VzSW5wdXRTdGF0ZTogdW5kZWZpbmVkIH0sIHRva2VuKTtcblx0XHRpZiAoIWlucHV0U3RhdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGlucHV0U3RhdGUgaW5zdGFuY2VvZiBDaGF0U2Vzc2lvbklucHV0U3RhdGVJbXBsICYmIHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Ly8gRGlzcG9zZSBhbnkgcHJldmlvdXMgaW5wdXQgc3RhdGVzIGZvciB0aGlzIHNlc3Npb24gcmVzb3VyY2Vcblx0XHRcdHRoaXMuX2Rpc3Bvc2VJbnB1dFN0YXRlc0ZvclJlc291cmNlKGNvbnRyb2xsZXJEYXRhLmlucHV0U3RhdGVzLCBzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRpZiAoaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0aW5wdXRTdGF0ZS51bnRpdGxlZFNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlucHV0U3RhdGUuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFN0b3JlIHRoZSBvcHRpb24gZ3JvdXBzIGZvciBvblNlYXJjaCBjYWxsYmFja3Ncblx0XHRjb250cm9sbGVyRGF0YS5vcHRpb25Hcm91cHMgPSBpbnB1dFN0YXRlLmdyb3VwcztcblxuXHRcdGNvbnN0IHdyYXBwZWRHcm91cHMgPSB0aGlzLl93cmFwT3B0aW9uR3JvdXBDb21tYW5kcyhjb250cm9sbGVySGFuZGxlLCBpbnB1dFN0YXRlLmdyb3Vwcyk7XG5cblx0XHQvLyBTdHJpcCBub24tc2VyaWFsaXphYmxlIGZpZWxkcyAob25TZWFyY2gpIGJlZm9yZSByZXR1cm5pbmcgb3ZlciB0aGUgcHJvdG9jb2xcblx0XHRyZXR1cm4gd3JhcHBlZEdyb3Vwcy5tYXAoZyA9PiAoe1xuXHRcdFx0aWQ6IGcuaWQsXG5cdFx0XHRuYW1lOiBnLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZy5kZXNjcmlwdGlvbixcblx0XHRcdGl0ZW1zOiBnLml0ZW1zLFxuXHRcdFx0c2VsZWN0ZWQ6IGcuc2VsZWN0ZWQsXG5cdFx0XHR3aGVuOiBnLndoZW4sXG5cdFx0XHRpY29uOiBnLmljb24sXG5cdFx0XHRjb21tYW5kczogZy5jb21tYW5kcyxcblx0XHRcdGtpbmQ6IGcua2luZCxcblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsb0JBQW9CO0FBQzdCLFlBQVksYUFBYTtBQUN6QixTQUFTLFdBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWSxtQkFBbUI7QUFFeEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBb0Msb0NBQTBELHdCQUF3QixpQ0FBaUM7QUFFdkosU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0IsNkJBQTZCO0FBRzFELFNBQXNNLG1CQUFnRDtBQUN0UCxTQUFTLCtCQUErQjtBQUd4QyxTQUFTLDBCQUEwQjtBQUNuQyxZQUFZLGlCQUFpQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLGtCQUFrQjtBQUM5QixTQUFTLGVBQWU7QUFNeEIsTUFBTSwwQkFBa0U7QUFBQSxFQTBCdkUsWUFBWSxRQUEwRCxtQkFBZ0M7QUF0QnRHLFNBQVMsc0JBQXNCLElBQUksUUFBYztBQUNqRCxTQUFTLGNBQWMsS0FBSyxvQkFBb0I7QUFFaEQsU0FBUyx1QkFBdUIsSUFBSSxRQUFjO0FBQ2xELFNBQVMsZUFBZSxLQUFLLHFCQUFxQjtBQW1CakQsU0FBSyxVQUFVO0FBQ2YsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBNUJBO0FBQUEsRUFDUztBQUFBLEVBRUE7QUFBQSxFQUdBO0FBQUEsRUFHVDtBQUFBLEVBQ0EsSUFBSSxrQkFBMEM7QUFDN0MsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBQ0EsSUFBSSxnQkFBZ0IsT0FBK0I7QUFDbEQsU0FBSyxtQkFBbUI7QUFBQSxFQUN6QjtBQUFBLEVBRUE7QUFBQSxFQUNBLElBQUksMEJBQWtEO0FBQ3JELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUNBLElBQUksd0JBQXdCLE9BQStCO0FBQzFELFNBQUssMkJBQTJCO0FBQUEsRUFDakM7QUFBQSxFQU9BLElBQUksU0FBMkQ7QUFDOUQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxPQUFPLE9BQXlEO0FBQ25FLFNBQUssVUFBVTtBQUNmLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVBLGlCQUF1QjtBQUN0QixTQUFLLG9CQUFvQixLQUFLO0FBQUEsRUFDL0I7QUFBQSxFQUVBLFdBQVcsUUFBZ0U7QUFDMUUsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUVBLFdBQWlCO0FBQ2hCLFNBQUsscUJBQXFCLEtBQUs7QUFDL0IsU0FBSyxxQkFBcUIsUUFBUTtBQUNsQyxTQUFLLG9CQUFvQixRQUFRO0FBQUEsRUFDbEM7QUFDRDtBQU1BLE1BQU0sb0JBQXNEO0FBQUEsRUFDM0Q7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFJQSxZQUFZLFVBQXNCLE9BQWUsV0FBdUI7QUFDdkUsU0FBSyxXQUFXO0FBQ2hCLFNBQUssU0FBUztBQUNkLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFQSxJQUFJLFFBQWdCO0FBQ25CLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksTUFBTSxPQUFlO0FBQ3hCLFFBQUksS0FBSyxXQUFXLE9BQU87QUFDMUIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLFdBQXdDO0FBQzNDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksU0FBUyxPQUFvQztBQUNoRCxRQUFJLEtBQUssY0FBYyxPQUFPO0FBQzdCLFdBQUssWUFBWTtBQUNqQixXQUFLLFdBQVc7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksY0FBMEQ7QUFDN0QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxZQUFZLE9BQW1EO0FBQ2xFLFFBQUksS0FBSyxpQkFBaUIsT0FBTztBQUNoQyxXQUFLLGVBQWU7QUFDcEIsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLFFBQW9EO0FBQ3ZELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksTUFBTSxPQUFtRDtBQUM1RCxRQUFJLEtBQUssV0FBVyxPQUFPO0FBQzFCLFdBQUssU0FBUztBQUNkLFdBQUssV0FBVztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxTQUErQztBQUNsRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLE9BQU8sT0FBNkM7QUFDdkQsUUFBSSxLQUFLLFlBQVksT0FBTztBQUMzQixXQUFLLFVBQVU7QUFDZixXQUFLLFdBQVc7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLElBQUksV0FBZ0M7QUFDbkMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxTQUFTLE9BQTRCO0FBQ3hDLFFBQUksS0FBSyxjQUFjLE9BQU87QUFDN0IsV0FBSyxZQUFZO0FBQ2pCLFdBQUssV0FBVztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxVQUFzRDtBQUN6RCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFFBQVEsT0FBbUQ7QUFDOUQsUUFBSSxLQUFLLGFBQWEsT0FBTztBQUM1QixXQUFLLFdBQVc7QUFDaEIsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLFNBQXdDO0FBQzNDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksT0FBTyxPQUFzQztBQUNoRCxRQUFJLEtBQUssWUFBWSxPQUFPO0FBQzNCLFdBQUssVUFBVTtBQUNmLFdBQUssV0FBVztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxVQUFnRTtBQUNuRSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFFBQVEsT0FBNkQ7QUFDeEUsUUFBSSxLQUFLLGFBQWEsT0FBTztBQUM1QixXQUFLLFdBQVc7QUFDaEIsV0FBSyxXQUFXO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLFdBQTREO0FBQy9ELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksU0FBUyxPQUF3RDtBQUNwRSxRQUFJLFVBQVUsUUFBVztBQUN4QixVQUFJO0FBQ0gsYUFBSyxVQUFVLEtBQUs7QUFBQSxNQUNyQixRQUFRO0FBQ1AsY0FBTSxJQUFJLE1BQU0sb0NBQW9DO0FBQUEsTUFDckQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxDQUFDLFFBQVEsT0FBTyxLQUFLLFdBQVcsS0FBSyxHQUFHO0FBQzNDLFdBQUssWUFBWTtBQUNqQixXQUFLLFdBQVc7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFDRDtBQU9BLFNBQVMsa0JBQWtCLFVBQStDLFVBQWlFO0FBQzFJLFFBQU0sUUFBUTtBQUFBLElBQ2IsZ0JBQWdCLElBQUksWUFBb0M7QUFBQSxJQUN4RCxTQUFTLElBQUksWUFBWTtBQUFBLEVBQzFCO0FBRUEsYUFBVyxDQUFDLGFBQWEsT0FBTyxLQUFLLFVBQVU7QUFDOUMsVUFBTSxVQUFVLFNBQVMsSUFBSSxXQUFXO0FBQ3hDLFFBQUksWUFBWSxTQUFTO0FBQ3hCLFlBQU0sZUFBZSxJQUFJLGFBQWEsT0FBTztBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUVBLGFBQVcsZUFBZSxTQUFTLEtBQUssR0FBRztBQUMxQyxRQUFJLENBQUMsU0FBUyxJQUFJLFdBQVcsR0FBRztBQUMvQixZQUFNLFFBQVEsSUFBSSxXQUFXO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSO0FBRUEsU0FBUyw2QkFBNkIsT0FBb0g7QUFDekosU0FBTztBQUFBLElBQ04sZ0JBQWdCLE1BQU0saUJBQWlCLE1BQU0sS0FBSyxNQUFNLGVBQWUsT0FBTyxHQUFHLFlBQVksZ0JBQWdCLElBQUksSUFBSSxDQUFDO0FBQUEsSUFDdEgsU0FBUyxNQUFNLFVBQVUsTUFBTSxLQUFLLE1BQU0sUUFBUSxLQUFLLENBQUMsSUFBSSxDQUFDO0FBQUEsRUFDOUQ7QUFDRDtBQUVBLE1BQU0sOEJBQTBFO0FBQUEsRUFDL0UsU0FBUyxJQUFJLFlBQW9DO0FBQUEsRUFDeEM7QUFBQSxFQUNBO0FBQUEsRUFFVCxZQUFZLGtCQUEwQixPQUE2QztBQUNsRixTQUFLLFNBQVM7QUFDZCxTQUFLLG9CQUFvQjtBQUFBLEVBQzFCO0FBQUEsRUFFQSxJQUFJLE9BQWU7QUFDbEIsV0FBTyxLQUFLLE9BQU87QUFBQSxFQUNwQjtBQUFBLEVBRUEsUUFBUSxVQUFtRDtBQUMxRCxRQUFJLENBQUMsU0FBUyxVQUFVLENBQUMsS0FBSyxPQUFPLE1BQU07QUFFMUM7QUFBQSxJQUNEO0FBRUEsVUFBTSxjQUFjLElBQUksWUFBWSxTQUFTLElBQUksVUFBUSxDQUFDLEtBQUssVUFBVSxJQUFJLENBQVUsQ0FBQztBQUV4RixVQUFNLFFBQVEsa0JBQWtCLEtBQUssUUFBUSxXQUFXO0FBQ3hELFFBQUksQ0FBQyxNQUFNLGdCQUFnQixRQUFRLENBQUMsTUFBTSxTQUFTLE1BQU07QUFFeEQ7QUFBQSxJQUNEO0FBRUEsU0FBSyxTQUFTO0FBQ2QsU0FBSyxLQUFLLE9BQU8sd0JBQXdCLEtBQUssbUJBQW1CLDZCQUE2QixLQUFLLENBQUM7QUFBQSxFQUNyRztBQUFBLEVBRUEsUUFBUSxVQUFtRyxTQUFxQjtBQUMvSCxlQUFXLENBQUMsR0FBRyxJQUFJLEtBQUssS0FBSyxRQUFRO0FBQ3BDLGVBQVMsS0FBSyxTQUFTLE1BQU0sSUFBSTtBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxNQUFvQztBQUN2QyxVQUFNLFdBQVcsS0FBSyxPQUFPLElBQUksS0FBSyxRQUFRO0FBQzlDLFFBQUksWUFBWSxhQUFhLE1BQU07QUFFbEM7QUFBQSxJQUNEO0FBRUEsU0FBSyxPQUFPLElBQUksS0FBSyxVQUFVLElBQUk7QUFDbkMsU0FBSyxLQUFLLE9BQU8sNEJBQTRCLEtBQUssbUJBQW1CLFlBQVksZ0JBQWdCLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDNUc7QUFBQSxFQUVBLE9BQU8sVUFBNEI7QUFDbEMsUUFBSSxLQUFLLE9BQU8sT0FBTyxRQUFRLEdBQUc7QUFDakMsV0FBSyxLQUFLLE9BQU8sd0JBQXdCLEtBQUssbUJBQW1CO0FBQUEsUUFDaEUsZ0JBQWdCLENBQUM7QUFBQSxRQUNqQixTQUFTLENBQUMsUUFBUTtBQUFBLE1BQ25CLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxVQUEwRDtBQUM3RCxXQUFPLEtBQUssT0FBTyxJQUFJLFFBQVE7QUFBQSxFQUNoQztBQUFBLEVBRUEsQ0FBQyxPQUFPLFFBQVEsSUFBMkU7QUFDMUYsV0FBTyxLQUFLLE9BQU8sUUFBUTtBQUFBLEVBQzVCO0FBQ0Q7QUFJQSxNQUFNLG1CQUFtQjtBQUFBLEVBS3hCLFlBQ2lCLFNBQ0EsV0FDaEIsU0FDZ0IsT0FDQSxtQkFDQSxvQkFDZjtBQU5lO0FBQ0E7QUFFQTtBQUNBO0FBQ0E7QUFSakI7QUFBQSxTQUFpQiw0QkFBNEIsb0JBQUksSUFBK0U7QUFVL0gsU0FBSyxVQUFVLElBQUksd0JBQXdCLFdBQVcsU0FBUyxPQUFPLG1CQUFtQixvQkFBb0IsS0FBSywyQkFBMkIsa0JBQWtCLElBQUk7QUFBQSxFQUNwSztBQUFBLEVBRUEsSUFBSSx1QkFBdUI7QUFDMUIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsdUJBQXVCLFNBQTRCO0FBQ2xELFdBQU8sSUFBSSx3QkFBd0IsS0FBSyxXQUFXLFNBQVMsS0FBSyxPQUFPLEtBQUssbUJBQW1CLEtBQUssb0JBQW9CLEtBQUssMkJBQTJCLGtCQUFrQixJQUFJO0FBQUEsRUFDaEw7QUFDRDtBQUVPLElBQU0sc0JBQU4sY0FBa0MsV0FBK0M7QUFBQSxFQWtDdkYsWUFDa0IsVUFDQSxpQkFDb0IsYUFDUCxhQUM3QjtBQUNELFVBQU07QUFMVztBQUNBO0FBQ29CO0FBQ1A7QUFuQy9CLFNBQVEsNEJBQTRCO0FBQ3BDLFNBQWlCLDhCQUE4QixvQkFBSSxJQVFoRDtBQUVILFNBQVEsNkJBQTZCO0FBQ3JDLFNBQWlCLCtCQUErQixvQkFBSSxJQU1qRDtBQUtIO0FBQUE7QUFBQTtBQUFBLFNBQWlCLHVCQUF1QixJQUFJLFlBQXVHO0FBTW5KO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsaUJBQWlCLG9CQUFJLElBQXFHO0FBUzFJLFNBQUssU0FBUyxLQUFLLFlBQVksU0FBUyxZQUFZLHNCQUFzQjtBQUUxRSxhQUFTLDBCQUEwQjtBQUFBLE1BQ2xDLGlCQUFpQixDQUFDLFFBQVE7QUFDekIsWUFBSSxPQUFPLElBQUksU0FBUyxhQUFhLHFCQUFxQjtBQUN6RCxnQkFBTSxXQUFXLElBQUksUUFBUTtBQUM3QixxQkFBVyxFQUFFLFdBQVcsS0FBSyxLQUFLLDRCQUE0QixPQUFPLEdBQUc7QUFDdkUsa0JBQU0sT0FBTyxXQUFXLE1BQU0sSUFBSSxRQUFRO0FBQzFDLGdCQUFJLE1BQU07QUFDVCxxQkFBTztBQUFBLFlBQ1I7QUFBQSxVQUNEO0FBRUEsZUFBSyxZQUFZLEtBQUssbUNBQW1DLFFBQVEsRUFBRTtBQUNuRSxpQkFBTztBQUFBLFFBQ1I7QUFFQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGdDQUFnQyxXQUFrQyxpQkFBeUIsVUFBNkQ7QUFFdkosVUFBTSxtQkFBbUIsS0FBSztBQUM5QixVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsVUFBTSx5Q0FBeUMsWUFBWSxJQUFJLElBQUksUUFBZ0MsQ0FBQztBQUVwRyxVQUFNLGFBQWEsSUFBSSw4QkFBOEIsa0JBQWtCLEtBQUssTUFBTTtBQUVsRixVQUFNLGFBQStDO0FBQUEsTUFDcEQsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsdUJBQXVCLENBQUMsV0FBdUIsV0FBbUI7QUFDakUsY0FBTSxJQUFJLE1BQU0sK0JBQStCO0FBQUEsTUFDaEQ7QUFBQSxNQUNBLDZCQUE2QixDQUFDLGFBQXNEO0FBQ25GLGVBQU8sSUFBSSwwQkFBMEIsQ0FBQyxDQUFDO0FBQUEsTUFDeEM7QUFBQSxNQUNBLGlDQUFpQyx1Q0FBdUM7QUFBQSxNQUN4RSwyQkFBMkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSzNCLHdCQUF3QixTQUFTLHlCQUM5QixPQUFPLE1BQU0sVUFBVTtBQUN4QixjQUFNLFdBQVcsTUFBTSxTQUFTLHVCQUF3QixNQUFNLEtBQUs7QUFDbkUsWUFBSSxVQUFVO0FBQ2IscUJBQVcsSUFBSSxRQUFRO0FBQUEsUUFDeEI7QUFBQSxNQUNELElBQ0U7QUFBQSxNQUNILFNBQVMsTUFBTTtBQUNkLG9CQUFZLFFBQVE7QUFBQSxNQUNyQjtBQUFBLE1BQ0EsZ0JBQWdCLE9BQU8sVUFBb0M7QUFDMUQsY0FBTSxRQUFRLE1BQU0sU0FBUyx3QkFBd0IsS0FBSyxLQUFLLENBQUM7QUFDaEUsbUJBQVcsUUFBUSxLQUFLO0FBQUEsTUFDekI7QUFBQSxJQUNEO0FBRUEsU0FBSyw0QkFBNEIsSUFBSSxrQkFBa0IsRUFBRSxpQkFBa0MsWUFBWSxXQUFXLFlBQVksYUFBYSx3Q0FBd0MsYUFBYSxvQkFBSSxJQUFJLEVBQUUsQ0FBQztBQUMzTSxTQUFLLE9BQU8sbUNBQW1DLGtCQUFrQixpQkFBaUIsQ0FBQyxDQUFDLFNBQVMsc0JBQXNCO0FBRW5ILFFBQUksU0FBUyw2QkFBNkI7QUFDekMsa0JBQVksSUFBSSxTQUFTLDRCQUE0QixNQUFNO0FBQzFELGFBQUssWUFBWSxNQUFNLG1EQUFtRCxlQUFlLEVBQUU7QUFJM0YsbUJBQVcsZUFBZSxrQkFBa0IsSUFBSTtBQUFBLE1BQ2pELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFFQSxRQUFJLFNBQVMsNEJBQTRCO0FBQ3hDLGtCQUFZLElBQUksU0FBUywyQkFBMkIsQ0FBQyxNQUFNO0FBQzFELGNBQU0sRUFBRSxVQUFVLFNBQVMsSUFBSTtBQUMvQixhQUFLLE9BQU8sNEJBQTRCLGtCQUFrQixTQUFTLFVBQVUsU0FBUyxRQUFRO0FBQUEsTUFDL0YsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFVBQU0sYUFBZ0M7QUFBQSxNQUNyQyxTQUFTLE1BQU07QUFDZCxhQUFLLDRCQUE0QixPQUFPLGdCQUFnQjtBQUN4RCxvQkFBWSxRQUFRO0FBQ3BCLGFBQUssT0FBTyxxQ0FBcUMsZ0JBQWdCO0FBQUEsTUFDbEU7QUFBQSxJQUNEO0FBRUEsV0FBTyxPQUFPLE9BQU8sWUFBWTtBQUFBLE1BQ2hDLGlDQUFpQyx1Q0FBdUM7QUFBQSxJQUN6RSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsZ0NBQWdDLFdBQWtDLElBQVksZ0JBQXVHO0FBQ3BMLFVBQU0sbUJBQW1CLEtBQUs7QUFDOUIsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLFFBQUksYUFBYTtBQUNqQixRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBQ0osVUFBTSx5Q0FBeUMsWUFBWSxJQUFJLElBQUksUUFBZ0MsQ0FBQztBQUNwRyxVQUFNLGNBQWMsb0JBQUksSUFBK0I7QUFFdkQsVUFBTSxhQUFhLElBQUksOEJBQThCLGtCQUFrQixLQUFLLE1BQU07QUFDbEYsVUFBTSxRQUFRLEtBQUs7QUFFbkIsVUFBTSxhQUFhLE9BQU8sT0FBeUM7QUFBQSxNQUNsRTtBQUFBLE1BQ0EsZ0JBQWdCLE9BQU8saUJBQW9DO0FBQzFELFlBQUksWUFBWTtBQUNmLGdCQUFNLElBQUksTUFBTSw2Q0FBNkM7QUFBQSxRQUM5RDtBQUVBLGFBQUssWUFBWSxNQUFNLG1DQUFtQyxFQUFFLGFBQWE7QUFDekUsY0FBTSxlQUFlLFlBQVk7QUFBQSxNQUNsQztBQUFBLE1BQ0EsT0FBTztBQUFBLE1BQ1AsaUNBQWlDLHVDQUF1QztBQUFBLE1BQ3hFLHVCQUF1QixDQUFDLFVBQXNCLFVBQWtCO0FBQy9ELFlBQUksWUFBWTtBQUNmLGdCQUFNLElBQUksTUFBTSw2Q0FBNkM7QUFBQSxRQUM5RDtBQUVBLGNBQU0sT0FBTyxJQUFJLG9CQUFvQixVQUFVLE9BQU8sTUFBTTtBQUUzRCxjQUFJLFdBQVcsSUFBSSxRQUFRLE1BQU0sTUFBTTtBQUN0QyxpQkFBSyxLQUFLLE9BQU8sNEJBQTRCLGtCQUFrQixZQUFZLGdCQUFnQixLQUFLLElBQUksQ0FBQztBQUFBLFVBQ3RHO0FBQUEsUUFDRCxDQUFDO0FBQ0QsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLElBQUksNEJBQTRCO0FBQUUsZUFBTztBQUFBLE1BQTJCO0FBQUEsTUFDcEUsSUFBSSwwQkFBMEIsU0FBd0U7QUFBRSxvQ0FBNEI7QUFBQSxNQUFTO0FBQUEsTUFDN0ksSUFBSSxjQUFjO0FBQUUsZUFBTztBQUFBLE1BQWE7QUFBQSxNQUN4QyxJQUFJLFlBQVksU0FBMEQ7QUFBRSxzQkFBYztBQUFBLE1BQVM7QUFBQSxNQUNuRyxJQUFJLHlCQUF5QjtBQUFFLGVBQU87QUFBQSxNQUErQjtBQUFBLE1BQ3JFLElBQUksdUJBQXVCLFNBQXFFO0FBQy9GLGNBQU0sYUFBYSxDQUFDLENBQUM7QUFDckIsd0NBQWdDO0FBQ2hDLGNBQU0sYUFBYSxDQUFDLENBQUM7QUFDckIsWUFBSSxlQUFlLGNBQWMsQ0FBQyxZQUFZO0FBQzdDLGdCQUFNLDZDQUE2QyxrQkFBa0IsVUFBVTtBQUFBLFFBQ2hGO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSwyQkFBMkI7QUFBRSxlQUFPO0FBQUEsTUFBcUM7QUFBQSxNQUM3RSxJQUFJLHlCQUF5QixTQUF1RTtBQUFFLDhDQUFzQztBQUFBLE1BQVM7QUFBQSxNQUNySiw2QkFBNkIsQ0FBQyxXQUFvRDtBQUNqRixZQUFJLFlBQVk7QUFDZixnQkFBTSxJQUFJLE1BQU0sNkNBQTZDO0FBQUEsUUFDOUQ7QUFFQSxjQUFNLGFBQWEsSUFBSSwwQkFBMEIsUUFBUSxNQUFNO0FBRTlELGdCQUFNLFFBQVEsS0FBSyw0QkFBNEIsSUFBSSxnQkFBZ0I7QUFDbkUsY0FBSSxPQUFPO0FBQ1Ysa0JBQU0sZUFBZSxXQUFXO0FBQUEsVUFDakM7QUFDQSxnQkFBTSxnQkFBZ0IsS0FBSyx5QkFBeUIsa0JBQWtCLFdBQVcsTUFBTTtBQUN2RixnQkFBTSxxQkFBcUIsY0FBYyxJQUFJLFFBQU07QUFBQSxZQUNsRCxJQUFJLEVBQUU7QUFBQSxZQUNOLE1BQU0sRUFBRTtBQUFBLFlBQ1IsYUFBYSxFQUFFO0FBQUEsWUFDZixPQUFPLEVBQUU7QUFBQSxZQUNULFVBQVUsRUFBRTtBQUFBLFlBQ1osTUFBTSxFQUFFO0FBQUEsWUFDUixNQUFNLEVBQUU7QUFBQSxZQUNSLFVBQVUsRUFBRTtBQUFBLFlBQ1osTUFBTSxFQUFFO0FBQUEsVUFDVCxFQUFFO0FBQ0YsZ0JBQU0sV0FBVyxXQUFXLG1CQUFtQixXQUFXO0FBQzFELGNBQUksVUFBVTtBQUNiLGlCQUFLLEtBQUssT0FBTyw2QkFBNkIsa0JBQWtCLFVBQVUsa0JBQWtCO0FBQUEsVUFDN0Y7QUFBQSxRQUNELENBQUM7QUFDRCxvQkFBWSxJQUFJLFVBQVU7QUFDMUIsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUNkLHFCQUFhO0FBQ2IsbUJBQVcsY0FBYyxhQUFhO0FBQ3JDLHFCQUFXLFNBQVM7QUFBQSxRQUNyQjtBQUNBLG9CQUFZLE1BQU07QUFDbEIsb0JBQVksUUFBUTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw0QkFBNEIsSUFBSSxrQkFBa0IsRUFBRSxZQUFZLFdBQVcsWUFBWSxhQUFhLGlCQUFpQixJQUFJLHdDQUF3QyxZQUFZLENBQUM7QUFNbkwsU0FBSyxPQUFPLG1DQUFtQyxrQkFBa0IsSUFBSSxDQUFDLENBQUMsNkJBQTZCO0FBRXBHLGdCQUFZLElBQUksYUFBYSxNQUFNO0FBQ2xDLFdBQUssNEJBQTRCLE9BQU8sZ0JBQWdCO0FBQ3hELFdBQUssT0FBTyxxQ0FBcUMsZ0JBQWdCO0FBQUEsSUFDbEUsQ0FBQyxDQUFDO0FBRUYsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLG1DQUFtQyxXQUFrQyxtQkFBMkIsaUJBQXlDLFVBQTZDLGNBQWtFO0FBQ3ZQLFVBQU0sU0FBUyxLQUFLO0FBQ3BCLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxTQUFLLDZCQUE2QixJQUFJLFFBQVEsRUFBRSxtQkFBbUIsVUFBVSxXQUFXLGNBQWMsWUFBWSxZQUFZLENBQUM7QUFDL0gsU0FBSyxPQUFPLG9DQUFvQyxRQUFRLGlCQUFpQjtBQUV6RSxRQUFJLFNBQVMsK0JBQStCO0FBQzNDLGtCQUFZLElBQUksU0FBUyw4QkFBOEIsU0FBTztBQUM3RCxjQUFNLFVBQW1FLHVCQUFPLE9BQU8sSUFBSTtBQUMzRixtQkFBVyxVQUFVLElBQUksU0FBUztBQUNqQyxrQkFBUSxPQUFPLFFBQVEsSUFBSSxPQUFPO0FBQUEsUUFDbkM7QUFDQSxhQUFLLE9BQU8sK0JBQStCLFFBQVEsSUFBSSxVQUFVLE9BQU87QUFBQSxNQUN6RSxDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsUUFBSSxTQUFTLHVDQUF1QztBQUNuRCxrQkFBWSxJQUFJLFNBQVMsc0NBQXNDLE1BQU07QUFDcEUsYUFBSyxPQUFPLHVDQUF1QyxNQUFNO0FBQUEsTUFDMUQsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUVBLFdBQU8sSUFBSSxhQUFhLFdBQVcsTUFBTTtBQUN4QyxXQUFLLDZCQUE2QixPQUFPLE1BQU07QUFDL0Msa0JBQVksUUFBUTtBQUNwQixXQUFLLE9BQU8sc0NBQXNDLE1BQU07QUFBQSxJQUN6RCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSwyQkFBMkIsUUFBZ0IsMkJBQTBDLFNBQXVDLE9BQW9EO0FBQ3JMLFVBQU0sV0FBVyxLQUFLLDZCQUE2QixJQUFJLE1BQU07QUFDN0QsUUFBSSxDQUFDLFVBQVU7QUFDZCxZQUFNLElBQUksTUFBTSwwQkFBMEIsTUFBTSxFQUFFO0FBQUEsSUFDbkQ7QUFFQSxVQUFNLGtCQUFrQixJQUFJLE9BQU8seUJBQXlCO0FBRTVELFVBQU0saUJBQWlCLEtBQUssNkJBQTZCLG1CQUFtQixlQUFlLENBQUM7QUFDNUYsUUFBSTtBQUNKLFFBQUksZ0JBQWdCLFdBQVcsMEJBQTBCO0FBQ3hELFlBQU0sU0FBUyxNQUFNLGVBQWUsV0FBVyx5QkFBeUIsc0JBQXNCLGVBQWUsSUFBSSxTQUFZLGlCQUFpQjtBQUFBLFFBQzdJLG9CQUFvQixLQUFLLDZCQUE2QixlQUFlLGdCQUFnQixDQUFDLEdBQUcsUUFBUSxxQkFBcUI7QUFBQSxNQUN2SCxHQUFHLEtBQUs7QUFDUixVQUFJLFFBQVE7QUFDWCxxQkFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQ0EsbUJBQWUsS0FBSztBQUFBLE1BQ25CLGdCQUFnQixnQkFBZ0IsQ0FBQztBQUFBLE1BQUcsUUFBUTtBQUFBLElBQzdDO0FBRUEsUUFBSSxzQkFBc0IsMkJBQTJCO0FBRXBELFVBQUksZ0JBQWdCO0FBQ25CLGFBQUssK0JBQStCLGVBQWUsYUFBYSxlQUFlO0FBQUEsTUFDaEY7QUFFQSxVQUFJLHNCQUFzQixlQUFlLEdBQUc7QUFDM0MsbUJBQVcsMEJBQTBCO0FBQUEsTUFDdEMsT0FBTztBQUNOLG1CQUFXLGtCQUFrQjtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxNQUFNLFNBQVMsU0FBUywwQkFBMEIsaUJBQWlCLE9BQU87QUFBQSxNQUN6RjtBQUFBLElBQ0QsQ0FBQztBQUNELFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsWUFBTSxJQUFJLGtCQUFrQjtBQUFBLElBQzdCO0FBRUEsVUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsVUFBTSxLQUFLLGdCQUFnQixTQUFTO0FBQ3BDLFVBQU0sY0FBYyxJQUFJLG1CQUFtQixTQUFTLFNBQVMsV0FBVztBQUFBLE1BQ3ZFO0FBQUEsTUFDQSxXQUFXO0FBQUEsTUFDWCxTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVCxXQUFXLEVBQUUsV0FBVyxDQUFDLEVBQUU7QUFBQSxNQUMzQixVQUFVLGtCQUFrQjtBQUFBLElBQzdCLEdBQUc7QUFBQSxNQUNGLHNCQUFzQixDQUFDLFdBQVcsV0FBVztBQUM1QyxlQUFPLEtBQUssT0FBTyxxQkFBcUIsUUFBUSxpQkFBaUIsV0FBVyxNQUFNO0FBQUEsTUFDbkY7QUFBQSxNQUNBLHNCQUFzQixDQUFDLFdBQVcsZUFBZSxXQUFXO0FBQzNELGFBQUssT0FBTyxxQkFBcUIsUUFBUSxpQkFBaUIsV0FBVyxlQUFlLE1BQU07QUFBQSxNQUMzRjtBQUFBLElBQ0QsR0FBRyxLQUFLLFNBQVMsV0FBVyxrQkFBa0I7QUFFOUMsVUFBTSxhQUFhLG1CQUFtQixJQUFJLElBQUksd0JBQXdCLENBQUM7QUFDdkUsU0FBSyxxQkFBcUIsSUFBSSxpQkFBaUIsRUFBRSxZQUFZLGFBQWEsV0FBVyxDQUFDO0FBR3RGLFFBQUksUUFBUSx3QkFBd0I7QUFDbkMsY0FBUSxRQUFRLFFBQVEsdUJBQXVCLFlBQVkscUJBQXFCLFdBQVcsV0FBVyxLQUFLLENBQUMsRUFBRSxRQUFRLE1BQU07QUFFM0gsYUFBSyxPQUFPLHdCQUF3QixRQUFRLGlCQUFpQixTQUFTO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFDQSxVQUFNLEVBQUUsYUFBYSxJQUFJO0FBQ3pCLFdBQU87QUFBQSxNQUNOLFVBQVUsSUFBSSxPQUFPLGVBQWU7QUFBQSxNQUNwQyxPQUFPLFFBQVE7QUFBQSxNQUNmLDJCQUEyQixDQUFDLENBQUMsUUFBUTtBQUFBLE1BQ3JDLG1CQUFtQixDQUFDLENBQUMsUUFBUTtBQUFBLE1BQzdCLGdCQUFnQixDQUFDLENBQUMsZ0JBQWdCLFdBQVcsZUFBZSxDQUFDLENBQUMsUUFBUTtBQUFBLE1BQ3RFLHNCQUFzQixDQUFDLENBQUMsY0FBYztBQUFBLE1BQ3RDLFNBQVMsUUFBUTtBQUFBLE1BQ2pCLFNBQVMsUUFBUSxRQUFRLElBQUksVUFBUTtBQUNwQyxZQUFJLGdCQUFnQixhQUFhLGlCQUFpQjtBQUNqRCxpQkFBTyxLQUFLLG1CQUFtQixJQUFJO0FBQUEsUUFDcEMsT0FBTztBQUNOLGlCQUFPLEtBQUssb0JBQW9CLE1BQXdDLGtCQUFrQjtBQUFBLFFBQzNGO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sNEJBQTRCLFFBQWdCLDJCQUEwQyxTQUE4RSxPQUF5QztBQUNsTixVQUFNLGtCQUFrQixJQUFJLE9BQU8seUJBQXlCO0FBQzVELFVBQU0sV0FBVyxLQUFLLDZCQUE2QixJQUFJLE1BQU07QUFDN0QsUUFBSSxDQUFDLFVBQVU7QUFDZCxXQUFLLFlBQVksS0FBSywwQkFBMEIsTUFBTSxFQUFFO0FBQ3hEO0FBQUEsSUFDRDtBQUdBLFFBQUksU0FBUyxTQUFTLDRCQUE0QjtBQUNqRCxVQUFJO0FBQ0gsY0FBTSxnQkFBZ0IsT0FBTyxRQUFRLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQyxVQUFVLEtBQUssT0FBTztBQUFBLFVBQ3pFO0FBQUEsVUFDQSxPQUFPLFVBQVUsU0FBWSxTQUFhLE9BQU8sVUFBVSxXQUFXLFFBQVEsTUFBTTtBQUFBLFFBQ3JGLEVBQUU7QUFDRixpQkFBUyxTQUFTLDJCQUEyQixpQkFBaUIsZUFBZSxLQUFLO0FBQUEsTUFDbkYsU0FBUyxPQUFPO0FBQ2YsYUFBSyxZQUFZLE1BQU0sdURBQXVELE1BQU0scUJBQXFCLGVBQWUsS0FBSyxLQUFLO0FBQUEsTUFDbkk7QUFDQTtBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQWMsbUJBQW1CLGVBQWU7QUFDdEQsVUFBTSxpQkFBaUIsS0FBSyw2QkFBNkIsV0FBVztBQUNwRSxRQUFJLENBQUMsa0JBQWtCLENBQUMsZUFBZSxXQUFXLDBCQUEwQjtBQUMzRSxXQUFLLFlBQVksS0FBSyw4Q0FBOEMsV0FBVyxFQUFFO0FBQ2pGO0FBQUEsSUFDRDtBQUlBLGVBQVcsY0FBYyxnQkFBZ0IsZUFBZSxDQUFDLEdBQUc7QUFFM0QsWUFBTSxnQkFBZ0IsV0FBVyxPQUFPLElBQUksV0FBUztBQUNwRCxjQUFNLFNBQVMsUUFBUSxNQUFNLEVBQUU7QUFDL0IsWUFBSSxDQUFDLFFBQVE7QUFDWixpQkFBTztBQUFBLFFBQ1I7QUFFQSxjQUFNLGFBQWEsT0FBTyxXQUFXLFdBQVcsU0FBUyxPQUFPO0FBQ2hFLGNBQU0sZUFBZSxNQUFNLE1BQU0sS0FBSyxVQUFRLEtBQUssT0FBTyxVQUFVO0FBQ3BFLFlBQUksQ0FBQyxjQUFjO0FBQ2xCLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGVBQU8sRUFBRSxHQUFHLE9BQU8sVUFBVSxhQUFhO0FBQUEsTUFDM0MsQ0FBQztBQUdELGlCQUFXLFdBQVcsYUFBYTtBQUNuQyxpQkFBVyxlQUFlO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLG1DQUFtQyxRQUFnQixPQUE0RTtBQUNwSSxVQUFNLFFBQVEsS0FBSyw2QkFBNkIsSUFBSSxNQUFNO0FBQzFELFFBQUksQ0FBQyxPQUFPO0FBQ1gsV0FBSyxZQUFZLEtBQUssMEJBQTBCLE1BQU0sdUNBQXVDO0FBQzdGO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxNQUFNO0FBQ3ZCLFFBQUksQ0FBQyxTQUFTLG1DQUFtQztBQUNoRDtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0gsWUFBTSxTQUFTLE1BQU0sU0FBUyxrQ0FBa0MsS0FBSztBQUNyRSxVQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsTUFDRDtBQUNBLFlBQU0sRUFBRSxjQUFjLGtCQUFrQixJQUFJO0FBQzVDLFVBQUksY0FBYztBQUNqQixjQUFNLGlCQUFpQixLQUFLLDZCQUE2QixNQUFNLGlCQUFpQjtBQUNoRixZQUFJLGdCQUFnQjtBQUNuQix5QkFBZSxlQUFlO0FBQUEsUUFDL0I7QUFBQSxNQUNEO0FBQ0EsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQ2YsV0FBSyxZQUFZLE1BQU0sOERBQThELE1BQU0sS0FBSyxLQUFLO0FBQ3JHO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sb0NBQW9DLGdCQUF3QixpQkFBZ0MsV0FBa0M7QUFDbkksVUFBTSxRQUFRLEtBQUsscUJBQXFCLElBQUksSUFBSSxPQUFPLGVBQWUsQ0FBQztBQUN2RSxXQUFPLFdBQVcsT0FBTztBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFNLDJCQUEyQixnQkFBd0IsaUJBQStDO0FBQ3ZHLFVBQU0sV0FBVyxJQUFJLE9BQU8sZUFBZTtBQUMzQyxVQUFNLFFBQVEsS0FBSyxxQkFBcUIsSUFBSSxRQUFRO0FBQ3BELFFBQUksQ0FBQyxPQUFPO0FBQ1gsV0FBSyxZQUFZLEtBQUssdUNBQXVDLGVBQWUsRUFBRTtBQUM5RTtBQUFBLElBQ0Q7QUFHQSxVQUFNLGlCQUFpQixLQUFLLDZCQUE2QixTQUFTLE1BQU07QUFDeEUsUUFBSSxnQkFBZ0I7QUFDbkIsV0FBSywrQkFBK0IsZUFBZSxhQUFhLFFBQVE7QUFBQSxJQUN6RTtBQUVBLFVBQU0sV0FBVyxPQUFPO0FBQ3hCLFVBQU0sV0FBVyxtQkFBbUIsUUFBUTtBQUM1QyxTQUFLLHFCQUFxQixPQUFPLFFBQVE7QUFBQSxFQUMxQztBQUFBLEVBRUEsTUFBTSxpQ0FBaUMsUUFBZ0IsaUJBQWdDLFNBQTRCLFNBQWdCLE9BQXFEO0FBQ3ZMLFVBQU0sUUFBUSxLQUFLLHFCQUFxQixJQUFJLElBQUksT0FBTyxlQUFlLENBQUM7QUFDdkUsUUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLFdBQVcsUUFBUSxnQkFBZ0I7QUFDdkQsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sY0FBYyxZQUFZLGlCQUFpQixHQUFHLFNBQVMsUUFBVyxNQUFNLEtBQUssbUJBQW1CLFNBQVMsTUFBTSxXQUFXLFNBQVMsR0FBRyxRQUFRLG9CQUFvQixDQUFDLEdBQUcsb0JBQUksSUFBSSxHQUFHLE1BQU0sV0FBVyxXQUFXLEtBQUssV0FBVztBQUVuTyxVQUFNLFNBQVMsTUFBTSxXQUFXLHVCQUF1QixPQUFPO0FBQzlELFVBQU0sTUFBTSxXQUFXLFFBQVEsZUFBZSxhQUFhLEVBQUUsU0FBUyxnQkFBZ0IsTUFBTSxHQUFHLE9BQU8sV0FBVyxLQUFLO0FBR3RILFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQSxFQUVBLE1BQU0saUJBQWlCLFFBQWdCLDJCQUEwQyxTQUF3RCxPQUF3RjtBQUNoTyxVQUFNLGtCQUFrQixJQUFJLE9BQU8seUJBQXlCO0FBQzVELFVBQU0sUUFBUSxLQUFLLHFCQUFxQixJQUFJLGVBQWU7QUFDM0QsUUFBSSxDQUFDLE9BQU87QUFDWCxZQUFNLElBQUksTUFBTSxzQ0FBc0MsZ0JBQWdCLFNBQVMsQ0FBQyxFQUFFO0FBQUEsSUFDbkY7QUFFQSxVQUFNLGNBQWMsS0FBSywrQkFBK0IsT0FBTztBQUUvRCxVQUFNLGlCQUFpQixLQUFLLDZCQUE2QixtQkFBbUIsZUFBZSxDQUFDO0FBQzVGLFFBQUksZ0JBQWdCLFdBQVcsYUFBYTtBQUMzQyxZQUFNQSxRQUFPLE1BQU0sZUFBZSxXQUFXLFlBQVksaUJBQWlCLGFBQWEsS0FBSztBQUM1RixhQUFPLFlBQVksZ0JBQWdCLEtBQUtBLEtBQUk7QUFBQSxJQUM3QztBQUVBLFFBQUksQ0FBQyxNQUFNLFdBQVcsUUFBUSxhQUFhO0FBQzFDLFlBQU0sSUFBSSxNQUFNLCtCQUErQixnQkFBZ0IsU0FBUyxDQUFDLEVBQUU7QUFBQSxJQUM1RTtBQUVBLFVBQU0sT0FBTyxNQUFNLE1BQU0sV0FBVyxRQUFRLFlBQVksaUJBQWlCLGFBQWEsS0FBSztBQUMzRixXQUFPLFlBQVksZ0JBQWdCLEtBQUssSUFBSTtBQUFBLEVBQzdDO0FBQUEsRUFFUSwrQkFBK0IsU0FBa0c7QUFDeEksUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sSUFBSSxhQUFhO0FBQUEsTUFDdkIsUUFBUTtBQUFBLE1BQ1IsUUFBUTtBQUFBLE1BQ1IsQ0FBQztBQUFBLE1BQ0QsUUFBUTtBQUFBLE1BQ1IsQ0FBQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLFFBQVE7QUFBQSxNQUNSLFFBQVE7QUFBQSxNQUNSLFlBQVksNEJBQTRCLEdBQUcsUUFBUSxnQkFBZ0I7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDZCQUE2QixpQkFBeUI7QUFDN0QsZUFBVyxrQkFBa0IsS0FBSyw0QkFBNEIsT0FBTyxHQUFHO0FBQ3ZFLFVBQUksZUFBZSxvQkFBb0IsaUJBQWlCO0FBQ3ZELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSwrQkFBK0IsYUFBNkMsVUFBcUI7QUFDeEcsZUFBVyxjQUFjLGFBQWE7QUFDckMsWUFBTSxnQkFBZ0IsV0FBVyxtQkFBbUIsV0FBVztBQUMvRCxVQUFJLGlCQUFpQixRQUFRLFVBQVUsYUFBYSxHQUFHO0FBQ3RELG1CQUFXLFNBQVM7QUFDcEIsb0JBQVksT0FBTyxVQUFVO0FBQUEsTUFDOUI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsNkJBQ1AsUUFDQSxnQkFDNEI7QUFDNUIsUUFBSSxDQUFDLGdCQUFnQixRQUFRO0FBQzVCLGFBQU8sSUFBSSwwQkFBMEIsTUFBTTtBQUFBLElBQzVDO0FBRUEsVUFBTSxpQkFBaUIsT0FBTyxJQUFJLFdBQVM7QUFDMUMsWUFBTSxRQUFRLGVBQWUsS0FBSyxPQUFLLEVBQUUsYUFBYSxNQUFNLEVBQUU7QUFDOUQsVUFBSSxDQUFDLE9BQU87QUFDWCxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sZUFBZSxNQUFNLE1BQU0sS0FBSyxVQUFRLEtBQUssT0FBTyxNQUFNLEtBQUs7QUFDckUsVUFBSSxDQUFDLGNBQWM7QUFDbEIsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPLEVBQUUsR0FBRyxPQUFPLFVBQVUsYUFBYTtBQUFBLElBQzNDLENBQUM7QUFDRCxXQUFPLElBQUksMEJBQTBCLGNBQWM7QUFBQSxFQUNwRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFNLHdCQUNMLGlCQUNBLHVCQUNBLE9BQ3dDO0FBQ3hDLFVBQU0sY0FBYyxrQkFBa0IsbUJBQW1CLGVBQWUsSUFBSTtBQUM1RSxVQUFNLGlCQUFpQixjQUFjLEtBQUssNkJBQTZCLFdBQVcsSUFBSTtBQUN0RixVQUFNLG1CQUFtQixtQkFBbUIsQ0FBQyxzQkFBc0IsZUFBZSxJQUFJLGtCQUFrQjtBQUN4RyxRQUFJLGdCQUFnQixXQUFXLDBCQUEwQjtBQUN4RCxZQUFNLFNBQVMsTUFBTSxlQUFlLFdBQVc7QUFBQSxRQUM5QztBQUFBLFFBQ0EsRUFBRSxvQkFBb0IsS0FBSyw2QkFBNkIsZUFBZSxnQkFBZ0IsQ0FBQyxHQUFHLHFCQUFxQixFQUFFO0FBQUEsUUFDbEg7QUFBQSxNQUNEO0FBQ0EsVUFBSSxRQUFRO0FBQ1gsWUFBSSxrQkFBa0IsMkJBQTJCO0FBRWhELGNBQUksbUJBQW1CLGdCQUFnQjtBQUN0QyxpQkFBSywrQkFBK0IsZUFBZSxhQUFhLGVBQWU7QUFBQSxVQUNoRjtBQUVBLGNBQUksbUJBQW1CLHNCQUFzQixlQUFlLEdBQUc7QUFDOUQsbUJBQU8sMEJBQTBCO0FBQUEsVUFDbEMsV0FBVyxpQkFBaUI7QUFDM0IsbUJBQU8sa0JBQWtCO0FBQUEsVUFDMUI7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLEtBQUssNkJBQTZCLGdCQUFnQixnQkFBZ0IsQ0FBQyxHQUFHLHFCQUFxQjtBQUM1RyxhQUFTLGtCQUFrQjtBQUMzQixXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEseUJBQ1Asa0JBQ0EsUUFDbUQ7QUFDbkQsVUFBTSxpQkFBaUIsS0FBSyw0QkFBNEIsSUFBSSxnQkFBZ0I7QUFDNUUsUUFBSSxDQUFDLGdCQUFnQixXQUFXLDBCQUEwQjtBQUN6RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sT0FBTyxJQUFJLFdBQVM7QUFDMUIsVUFBSSxDQUFDLE1BQU0sVUFBVSxRQUFRO0FBQzVCLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTztBQUFBLFFBQ04sR0FBRztBQUFBLFFBQ0gsVUFBVSxNQUFNLFNBQVMsSUFBSSxhQUFXO0FBQ3ZDLGdCQUFNLFVBQVUsNkJBQTZCLGFBQWEsQ0FBQztBQUMzRCxlQUFLLGVBQWUsSUFBSSxTQUFTLEVBQUUsbUJBQW1CLFFBQVEsU0FBUyxpQkFBaUIsQ0FBQztBQUV6RixlQUFLLFNBQVMsZ0JBQWdCLE1BQU0sU0FBUyxVQUFVLFNBQW9CO0FBRTFFLGtCQUFNLGtCQUFrQixLQUFLLENBQUMsYUFBYSxNQUFNLEtBQUssQ0FBQyxJQUFJO0FBQzNELGtCQUFNLGFBQWEsTUFBTSxLQUFLO0FBQUEsY0FDN0I7QUFBQSxjQUNBO0FBQUEsY0FDQSxrQkFBa0I7QUFBQSxZQUNuQjtBQUVBLG1CQUFPLEtBQUssU0FBUztBQUFBLGNBQ3BCLFFBQVE7QUFBQSxjQUNSLEVBQUUsWUFBWSxnQkFBZ0I7QUFBQSxjQUM5QixHQUFJLFFBQVEsYUFBYSxDQUFDO0FBQUEsWUFDM0I7QUFBQSxVQUNELENBQUM7QUFFRCxpQkFBTyxFQUFFLEdBQUcsU0FBUyxTQUFTLFFBQVE7QUFBQSxRQUN2QyxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsbUJBQW1CLFNBQTRCLFdBQXFFO0FBQ2pJLFFBQUk7QUFDSixRQUFJLFFBQVEscUJBQXFCO0FBQ2hDLGNBQVEsTUFBTSxLQUFLLGdCQUFnQiw2QkFBNkIsV0FBVyxRQUFRLG1CQUFtQjtBQUFBLElBQ3ZHO0FBQ0EsUUFBSSxDQUFDLE9BQU87QUFDWCxjQUFRLE1BQU0sS0FBSyxnQkFBZ0Isd0JBQXdCLFNBQVM7QUFDcEUsVUFBSSxDQUFDLE9BQU87QUFDWCxjQUFNLElBQUksTUFBTSw0QkFBNEI7QUFBQSxNQUM3QztBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsbUJBQW1CLE1BQW9DO0FBQzlELFVBQU0sWUFBWSxLQUFLLFdBQVcsSUFBSSxTQUFPLEtBQUssMkJBQTJCLEdBQUcsQ0FBQztBQUNqRixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixJQUFJLEtBQUs7QUFBQSxNQUNULFFBQVEsS0FBSztBQUFBLE1BQ2IsYUFBYSxLQUFLO0FBQUEsTUFDbEIsU0FBUyxLQUFLO0FBQUEsTUFDZCxjQUFjLFVBQVUsU0FBUyxJQUFJLEVBQUUsVUFBVSxJQUFJO0FBQUEsTUFDckQsU0FBUyxLQUFLO0FBQUEsTUFDZCxrQkFBa0IsWUFBWSw0QkFBNEIsS0FBSyxLQUFLLGlCQUFpQjtBQUFBLElBQ3RGO0FBQUEsRUFDRDtBQUFBLEVBRVEsMkJBQTJCLEtBQTREO0FBQzlGLFVBQU0sUUFBUSxJQUFJLFNBQVMsT0FBTyxJQUFJLFVBQVUsWUFBWSxTQUFTLElBQUksU0FBUyxXQUFXLElBQUksUUFDOUYsWUFBWSxTQUFTLEtBQUssSUFBSSxLQUF3QixJQUN0RCxJQUFJO0FBQ1AsVUFBTSxRQUFRLElBQUksUUFBUSxFQUFFLE9BQU8sSUFBSSxNQUFNLENBQUMsR0FBRyxjQUFjLElBQUksTUFBTSxDQUFDLEVBQUUsSUFBSTtBQUVoRixRQUFJLFNBQVMsaUJBQWlCLGFBQWEsMkJBQTJCLE1BQU0sUUFBUSxNQUFNLFdBQVcsS0FBSyxNQUFNLFlBQVksVUFBVSxNQUFNLFlBQVksQ0FBQyxFQUFFLENBQUMsRUFBRSxRQUFRO0FBQ3JLLFlBQU0sU0FBUyxXQUFXLEtBQUssTUFBTSxZQUFZLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3pELFlBQU0sV0FBK0M7QUFBQSxRQUNwRCxhQUFhLEVBQUUsaUJBQWlCLE9BQU8saUJBQWlCLGFBQWEsT0FBTyxhQUFhLGVBQWUsT0FBTyxlQUFlLFdBQVcsT0FBTyxVQUFVO0FBQUEsUUFDMUosZ0JBQWdCLE9BQU87QUFBQSxRQUN2QixXQUFXLE1BQU0sWUFBWSxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQ2pDLGdCQUFnQixNQUFNLFlBQVksQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUU7QUFBQSxNQUM1QztBQUNBLGFBQU8sbUNBQW1DLFFBQVEsUUFBUTtBQUFBLElBQzNEO0FBRUEsUUFBSSxhQUFhLFNBQVMsV0FBVyxJQUFJLEtBQUssS0FBSyxJQUFJLEtBQUssV0FBVyxNQUFNLEdBQUc7QUFDL0UsWUFBTSxNQUFNLFlBQVksU0FBUyxLQUFLLElBQUksS0FBSztBQUMvQyxhQUFPO0FBQUEsUUFDTixJQUFJLElBQUk7QUFBQSxRQUNSLE1BQU0sSUFBSTtBQUFBLFFBQ1YsVUFBVSxJQUFJLEtBQUssVUFBVSxDQUFDO0FBQUEsUUFDOUIsT0FBTyxFQUFFLEtBQUssSUFBSSxNQUFNLEtBQUssT0FBTyxJQUFJLE1BQU07QUFBQTtBQUFBLFFBRTlDLFlBQVksV0FBVztBQUFBO0FBQUEsUUFFdkIsTUFBTSxZQUFZLE9BQU8sV0FBVyxRQUFRO0FBQUEsUUFDNUMsTUFBTTtBQUFBLFFBQ047QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksSUFBSSxNQUFNLEtBQUssS0FBSyxJQUFJLEtBQUssV0FBVyxTQUFTLEdBQUc7QUFDdkQsVUFBSSxJQUFJLEdBQUcsV0FBVyx1QkFBdUIsV0FBVyxHQUFHO0FBQzFELGVBQU8sMEJBQTBCLE9BQU8sdUJBQXVCLFdBQVc7QUFBQSxNQUMzRTtBQUNBLFVBQUksSUFBSSxHQUFHLFdBQVcsdUJBQXVCLG9CQUFvQixHQUFHO0FBQ25FLGVBQU8sMEJBQTBCLE9BQU8sdUJBQXVCLG9CQUFvQjtBQUFBLE1BQ3BGO0FBQ0EsVUFBSSxJQUFJLEdBQUcsV0FBVyx1QkFBdUIsVUFBVSxHQUFHO0FBQ3pELGVBQU8sMEJBQTBCLE9BQU8sdUJBQXVCLFVBQVU7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsSUFBSSxNQUFNLEtBQUssS0FBTSxTQUFTLE9BQU8sVUFBVSxZQUFZLFNBQVM7QUFDbkYsVUFBTSxXQUFXLFVBQVUsSUFBSSxNQUFNLEtBQUssS0FBSyxNQUFNLEtBQUssU0FBUyxHQUFHO0FBQ3RFLFdBQU87QUFBQSxNQUNOLElBQUksSUFBSTtBQUFBLE1BQ1IsTUFBTSxJQUFJO0FBQUEsTUFDVjtBQUFBLE1BQ0Esa0JBQWtCLElBQUk7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsTUFBTSxXQUFXLGNBQXVCLFNBQVMsU0FBa0I7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixNQUFzQyxvQkFBcUM7QUFDdEcsVUFBTSxRQUFRLFNBQVMsS0FBSyxTQUFTLElBQUksT0FBSyxZQUFZLGlCQUFpQixLQUFLLEdBQUcsS0FBSyxTQUFTLFdBQVcsa0JBQWtCLENBQUMsQ0FBQztBQUNoSSxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0EsYUFBYSxLQUFLO0FBQUEsTUFDbEIsU0FBUyxLQUFLLFFBQVE7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0seUJBQXlCLFFBQWdCLE9BQXlDO0FBQ3ZGLFVBQU0saUJBQWlCLEtBQUssNEJBQTRCLElBQUksTUFBTTtBQUNsRSxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFdBQUssWUFBWSxLQUFLLGtDQUFrQyxNQUFNLEVBQUU7QUFDaEU7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLFdBQVcsZUFBZSxLQUFLO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLFFBQWdCLFNBQW9DLE9BQW9HO0FBQ2pMLFVBQU0saUJBQWlCLEtBQUssNEJBQTRCLElBQUksTUFBTTtBQUNsRSxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFdBQUssWUFBWSxLQUFLLGtDQUFrQyxNQUFNLEVBQUU7QUFDaEUsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFVBQVUsZUFBZSxXQUFXO0FBQzFDLFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLHFCQUFxQixLQUFLLDZCQUE2QixlQUFlLGdCQUFnQixDQUFDLEdBQUcsUUFBUSxxQkFBcUI7QUFDN0gsUUFBSTtBQUNKLFFBQUksZUFBZSxXQUFXLDBCQUEwQjtBQUN2RCxtQkFBYSxNQUFNLGVBQWUsV0FBVyx5QkFBeUIsUUFBVyxFQUFFLG1CQUFtQixHQUFHLEtBQUs7QUFBQSxJQUMvRyxPQUFPO0FBQ04sbUJBQWE7QUFBQSxJQUNkO0FBRUEsVUFBTSxPQUFPLE1BQU0sUUFBUTtBQUFBLE1BQzFCLFNBQVM7QUFBQSxRQUNSLFFBQVEsUUFBUTtBQUFBLFFBQ2hCLFNBQVMsUUFBUTtBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxLQUFLO0FBQ1IsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLG1CQUFlLFdBQVcsTUFBTSxJQUFJLElBQUk7QUFFeEMsV0FBTyxZQUFZLGdCQUFnQixLQUFLLElBQUk7QUFBQSxFQUM3QztBQUFBLEVBRUEsaUNBQWlDLGtCQUEwQiwyQkFBMEMsVUFBeUI7QUFDN0gsVUFBTSxpQkFBaUIsS0FBSyw0QkFBNEIsSUFBSSxnQkFBZ0I7QUFDNUUsUUFBSSxDQUFDLGdCQUFnQjtBQUNwQixXQUFLLFlBQVksS0FBSyxrQ0FBa0MsZ0JBQWdCLEVBQUU7QUFDMUU7QUFBQSxJQUNEO0FBRUEsVUFBTSxrQkFBa0IsSUFBSSxPQUFPLHlCQUF5QjtBQUM1RCxVQUFNLE9BQU8sZUFBZSxXQUFXLE1BQU0sSUFBSSxlQUFlO0FBQ2hFLFFBQUksQ0FBQyxNQUFNO0FBQ1YsV0FBSyxZQUFZLEtBQUssc0NBQXNDLGdCQUFnQixTQUFTLENBQUMsRUFBRTtBQUN4RjtBQUFBLElBQ0Q7QUFFQSxTQUFLLFdBQVc7QUFDaEIsbUJBQWUsdUNBQXVDLEtBQUssSUFBSTtBQUFBLEVBQ2hFO0FBQUEsRUFFQSxNQUFNLHdCQUF3QixRQUFnQiwyQkFBMEMsT0FBb0c7QUFDM0wsVUFBTSxrQkFBa0IsSUFBSSxPQUFPLHlCQUF5QjtBQUs1RCxVQUFNLGlCQUFpQixLQUFLLDRCQUE0QixJQUFJLE1BQU07QUFDbEUsUUFBSSxDQUFDLGdCQUFnQixXQUFXLHdCQUF3QjtBQUN2RCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sT0FBTyxlQUFlLFdBQVcsTUFBTSxJQUFJLGVBQWU7QUFDaEUsUUFBSSxDQUFDLE1BQU07QUFDVixXQUFLLFlBQVksS0FBSyxzQ0FBc0MsZ0JBQWdCLFNBQVMsQ0FBQyxFQUFFO0FBQ3hGLGFBQU87QUFBQSxJQUNSO0FBS0EsVUFBTSxlQUFlLFdBQVcsdUJBQXVCLE1BQU0sS0FBSztBQUVsRSxVQUFNLGNBQWMsZUFBZSxXQUFXLE1BQU0sSUFBSSxlQUFlO0FBQ3ZFLFFBQUksQ0FBQyxhQUFhO0FBQ2pCLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxZQUFZLGdCQUFnQixLQUFLLFdBQVc7QUFBQSxFQUNwRDtBQUFBLEVBRUEsTUFBTSw4QkFBOEIsa0JBQTBCLDJCQUFzRCxPQUF3RjtBQUMzTSxVQUFNLGlCQUFpQixLQUFLLDRCQUE0QixJQUFJLGdCQUFnQjtBQUM1RSxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFdBQUssWUFBWSxLQUFLLGtDQUFrQyxnQkFBZ0IsRUFBRTtBQUMxRSxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sVUFBVSxlQUFlLFdBQVc7QUFDMUMsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sa0JBQWtCLDRCQUE0QixJQUFJLE9BQU8seUJBQXlCLElBQUk7QUFDNUYsVUFBTSxhQUFhLE1BQU0sUUFBUSxDQUFDLG1CQUFtQixzQkFBc0IsZUFBZSxJQUFJLFNBQVksaUJBQWlCLEVBQUUsb0JBQW9CLE9BQVUsR0FBRyxLQUFLO0FBQ25LLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxzQkFBc0IsNkJBQTZCLGlCQUFpQjtBQUV2RSxXQUFLLCtCQUErQixlQUFlLGFBQWEsZUFBZTtBQUUvRSxVQUFJLHNCQUFzQixlQUFlLEdBQUc7QUFDM0MsbUJBQVcsMEJBQTBCO0FBQUEsTUFDdEMsT0FBTztBQUNOLG1CQUFXLGtCQUFrQjtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUdBLG1CQUFlLGVBQWUsV0FBVztBQUV6QyxVQUFNLGdCQUFnQixLQUFLLHlCQUF5QixrQkFBa0IsV0FBVyxNQUFNO0FBR3ZGLFdBQU8sY0FBYyxJQUFJLFFBQU07QUFBQSxNQUM5QixJQUFJLEVBQUU7QUFBQSxNQUNOLE1BQU0sRUFBRTtBQUFBLE1BQ1IsYUFBYSxFQUFFO0FBQUEsTUFDZixPQUFPLEVBQUU7QUFBQSxNQUNULFVBQVUsRUFBRTtBQUFBLE1BQ1osTUFBTSxFQUFFO0FBQUEsTUFDUixNQUFNLEVBQUU7QUFBQSxNQUNSLFVBQVUsRUFBRTtBQUFBLE1BQ1osTUFBTSxFQUFFO0FBQUEsSUFDVCxFQUFFO0FBQUEsRUFDSDtBQUNEO0FBbjRCYSxzQkFBTjtBQUFBLEVBcUNKO0FBQUEsRUFDQTtBQUFBLEdBdENVOyIsCiAgIm5hbWVzIjogWyJpdGVtIl0KfQo=
