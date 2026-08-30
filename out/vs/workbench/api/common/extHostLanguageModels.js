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
import { AsyncIterableProducer, AsyncIterableSource, RunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { transformErrorForSerialization, transformErrorFromSerialization } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { DisposableMap, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { Progress } from "../../../platform/progress/common/progress.js";
import { COPILOT_VENDOR_ID } from "../../contrib/chat/common/languageModels.js";
import { INTERNAL_AUTH_PROVIDER_PREFIX } from "../../services/authentication/common/authentication.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostAuthentication } from "./extHostAuthentication.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as typeConvert from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
const IExtHostLanguageModels = createDecorator("IExtHostLanguageModels");
class LanguageModelResponse {
  constructor() {
    this._defaultStream = new AsyncIterableSource();
    this._isDone = false;
    const that = this;
    const [stream1, stream2] = AsyncIterableProducer.tee(that._defaultStream.asyncIterable);
    this.apiObject = {
      // result: promise,
      get stream() {
        return stream1;
      },
      get text() {
        return stream2.map((part) => {
          if (part instanceof extHostTypes.LanguageModelTextPart) {
            return part.value;
          } else {
            return void 0;
          }
        }).coalesce();
      }
    };
  }
  handleResponsePart(parts) {
    if (this._isDone) {
      return;
    }
    const lmResponseParts = [];
    for (const part of Iterable.wrap(parts)) {
      let out;
      if (part.type === "text") {
        out = new extHostTypes.LanguageModelTextPart(part.value, part.audience);
      } else if (part.type === "thinking") {
        out = new extHostTypes.LanguageModelThinkingPart(part.value, part.id, part.metadata);
      } else if (part.type === "data") {
        out = new extHostTypes.LanguageModelDataPart(part.data.buffer, part.mimeType, part.audience);
      } else {
        out = new extHostTypes.LanguageModelToolCallPart(part.toolCallId, part.name, part.parameters);
      }
      lmResponseParts.push(out);
    }
    this._defaultStream.emitMany(lmResponseParts);
  }
  reject(err) {
    this._isDone = true;
    this._defaultStream.reject(err);
  }
  resolve() {
    this._isDone = true;
    this._defaultStream.resolve();
  }
}
let ExtHostLanguageModels = class {
  constructor(extHostRpc, _logService, _extHostAuthentication) {
    this._logService = _logService;
    this._extHostAuthentication = _extHostAuthentication;
    this._onDidChangeModelAccess = new Emitter();
    this._onDidChangeProviders = new Emitter();
    this.onDidChangeProviders = this._onDidChangeProviders.event;
    this._onDidChangeModelProxyAvailability = new Emitter();
    this.onDidChangeModelProxyAvailability = this._onDidChangeModelProxyAvailability.event;
    this._languageModelProviders = /* @__PURE__ */ new Map();
    // TODO @lramos15 - Remove the need for both info and metadata as it's a lot of redundancy. Should just need one
    this._localModels = /* @__PURE__ */ new Map();
    this._modelAccessList = new ExtensionIdentifierMap();
    this._pendingRequest = /* @__PURE__ */ new Map();
    this._pendingCancelCTS = new DisposableMap();
    this._ignoredFileProviders = /* @__PURE__ */ new Map();
    this._languageAccessInformationExtensions = /* @__PURE__ */ new Set();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadLanguageModels);
  }
  dispose() {
    this._onDidChangeModelAccess.dispose();
    this._onDidChangeProviders.dispose();
    this._onDidChangeModelProxyAvailability.dispose();
    this._pendingRequest.clear();
    this._pendingCancelCTS.dispose();
  }
  registerLanguageModelChatProvider(extension, vendor, provider) {
    this._languageModelProviders.set(vendor, { extension, provider });
    this._proxy.$registerLanguageModelProvider(vendor);
    let providerChangeEventDisposable;
    if (provider.onDidChangeLanguageModelChatInformation) {
      providerChangeEventDisposable = provider.onDidChangeLanguageModelChatInformation(() => {
        this._proxy.$onLMProviderChange(vendor);
      });
    }
    return toDisposable(() => {
      this._languageModelProviders.delete(vendor);
      this._localModels.forEach((value, key) => {
        if (value.metadata.vendor === vendor) {
          this._localModels.delete(key);
        }
      });
      providerChangeEventDisposable?.dispose();
      this._proxy.$unregisterProvider(vendor);
    });
  }
  toModelIdentifier(vendor, group, modelId) {
    return group ? `${vendor}/${group}/${modelId}` : `${vendor}/${modelId}`;
  }
  getVendorFromModelIdentifier(modelIdentifier) {
    const firstSlash = modelIdentifier.indexOf("/");
    return firstSlash === -1 ? void 0 : modelIdentifier.substring(0, firstSlash);
  }
  async $provideLanguageModelChatInfo(vendor, options, token) {
    const data = this._languageModelProviders.get(vendor);
    if (!data) {
      return [];
    }
    const modelInformation = await data.provider.provideLanguageModelChatInformation({ silent: options.silent, configuration: options.configuration }, token) ?? [];
    const modelMetadataAndIdentifier = modelInformation.map((m) => {
      let auth;
      if (m.requiresAuthorization && isProposedApiEnabled(data.extension, "chatProvider")) {
        auth = {
          providerLabel: data.extension.displayName || data.extension.name,
          accountLabel: typeof m.requiresAuthorization === "object" ? m.requiresAuthorization.label : void 0
        };
      }
      if (m.capabilities.editTools) {
        checkProposedApiEnabled(data.extension, "chatProvider");
      }
      const isDefaultForLocation = {};
      if (isProposedApiEnabled(data.extension, "chatProvider")) {
        if (m.isDefault === true) {
          for (const key of Object.values(ChatAgentLocation)) {
            if (typeof key === "string") {
              isDefaultForLocation[key] = true;
            }
          }
        } else if (typeof m.isDefault === "object") {
          for (const key of Object.keys(m.isDefault)) {
            const enumKey = parseInt(key);
            isDefaultForLocation[typeConvert.ChatLocation.from(enumKey)] = m.isDefault[enumKey];
          }
        }
      }
      return {
        metadata: {
          extension: data.extension.identifier,
          id: m.id,
          vendor,
          name: m.name ?? "",
          family: m.family ?? "",
          detail: m.detail,
          tooltip: m.tooltip,
          version: m.version,
          multiplierNumeric: m.multiplierNumeric,
          isBYOK: m.isBYOK,
          pricing: m.pricing,
          inputCost: m.inputCost,
          outputCost: m.outputCost,
          cacheCost: m.cacheCost,
          cacheWriteCost: m.cacheWriteCost,
          longContextInputCost: m.longContextInputCost,
          longContextOutputCost: m.longContextOutputCost,
          longContextCacheCost: m.longContextCacheCost,
          longContextCacheWriteCost: m.longContextCacheWriteCost,
          priceCategory: m.priceCategory,
          category: m.category,
          maxInputTokens: m.maxInputTokens,
          maxOutputTokens: m.maxOutputTokens,
          auth,
          isDefaultForLocation,
          isUserSelectable: m.isUserSelectable,
          statusIcon: m.statusIcon,
          targetChatSessionType: m.targetChatSessionType,
          configurationSchema: m.configurationSchema,
          warningText: m.warningText,
          promo: m.promo,
          capabilities: m.capabilities ? {
            vision: m.capabilities.imageInput,
            editTools: m.capabilities.editTools,
            toolCalling: !!m.capabilities.toolCalling,
            agentMode: !!m.capabilities.toolCalling
          } : void 0
        },
        identifier: this.toModelIdentifier(vendor, options.group, m.id)
      };
    });
    this._localModels.forEach((value, key) => {
      if (value.metadata.vendor === vendor && value.group === options.group) {
        this._localModels.delete(key);
      }
    });
    for (let i = 0; i < modelMetadataAndIdentifier.length; i++) {
      this._localModels.set(modelMetadataAndIdentifier[i].identifier, {
        group: options.group,
        metadata: modelMetadataAndIdentifier[i].metadata,
        info: modelInformation[i]
      });
    }
    return modelMetadataAndIdentifier;
  }
  async $startChatRequest(modelId, requestId, from, messages, options, token) {
    const knownModel = this._localModels.get(modelId);
    if (!knownModel) {
      throw new Error("Model not found");
    }
    const data = this._languageModelProviders.get(knownModel.metadata.vendor);
    if (!data) {
      throw new Error(`Language model provider for '${knownModel.metadata.id}' not found.`);
    }
    const cts = new CancellationTokenSource(token);
    this._pendingCancelCTS.set(requestId, cts);
    const providerToken = cts.token;
    const queue = [];
    const sendNow = () => {
      if (queue.length > 0) {
        this._proxy.$reportResponsePart(requestId, new SerializableObjectWithBuffers(queue));
        queue.length = 0;
      }
    };
    const queueScheduler = new RunOnceScheduler(sendNow, 30);
    const sendSoon = (part) => {
      const newLen = queue.push(part);
      if (newLen > 30) {
        sendNow();
        queueScheduler.cancel();
      } else {
        queueScheduler.schedule();
      }
    };
    const progress = new Progress(async (fragment) => {
      if (providerToken.isCancellationRequested) {
        this._logService.warn(`[CHAT](${data.extension.identifier.value}) CANNOT send progress because the REQUEST IS CANCELLED`);
        return;
      }
      let part;
      if (fragment instanceof extHostTypes.LanguageModelToolCallPart) {
        part = { type: "tool_use", name: fragment.name, parameters: fragment.input, toolCallId: fragment.callId };
      } else if (fragment instanceof extHostTypes.LanguageModelTextPart) {
        part = { type: "text", value: fragment.value, audience: fragment.audience };
      } else if (fragment instanceof extHostTypes.LanguageModelDataPart) {
        part = { type: "data", mimeType: fragment.mimeType, data: VSBuffer.wrap(fragment.data), audience: fragment.audience };
      } else if (fragment instanceof extHostTypes.LanguageModelThinkingPart) {
        part = { type: "thinking", value: fragment.value, id: fragment.id, metadata: fragment.metadata };
      }
      if (!part) {
        this._logService.warn(`[CHAT](${data.extension.identifier.value}) UNKNOWN part ${JSON.stringify(fragment)}`);
        return;
      }
      sendSoon(part);
    });
    let value;
    try {
      value = data.provider.provideLanguageModelChatResponse(
        knownModel.info,
        messages.value.map(typeConvert.LanguageModelChatMessage2.to),
        // todo@connor4312: move `core` -> `undefined` after 1.111 Insiders is out
        { ...options, modelOptions: options.modelOptions ?? {}, modelConfiguration: options.configuration, requestInitiator: from ? ExtensionIdentifier.toKey(from) : "core", toolMode: options.toolMode ?? extHostTypes.LanguageModelChatToolMode.Auto, includeEncryptedThinking: options.includeEncryptedThinking },
        progress,
        providerToken
      );
    } catch (err) {
      this._pendingCancelCTS.deleteAndDispose(requestId);
      throw err;
    }
    Promise.resolve(value).then(() => {
      sendNow();
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$reportResponseDone(requestId, void 0);
    }, (err) => {
      sendNow();
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$reportResponseDone(requestId, transformErrorForSerialization(err));
    });
  }
  //#region --- token counting
  $cancelLanguageModelChatRequest(requestId) {
    this._pendingCancelCTS.get(requestId)?.cancel();
  }
  $provideTokenLength(modelId, value, token) {
    const knownModel = this._localModels.get(modelId);
    if (!knownModel) {
      return Promise.resolve(0);
    }
    const data = this._languageModelProviders.get(knownModel.metadata.vendor);
    if (!data) {
      return Promise.resolve(0);
    }
    return Promise.resolve(data.provider.provideTokenCount(knownModel.info, value, token));
  }
  //#region --- making request
  async getDefaultLanguageModel(extension, forceResolveModels) {
    let defaultModelId;
    if (forceResolveModels) {
      await this.selectLanguageModels(extension, {});
    }
    for (const [modelIdentifier, modelData] of this._localModels) {
      if (modelData.metadata.isDefaultForLocation[ChatAgentLocation.Chat] && modelData.metadata.vendor === COPILOT_VENDOR_ID) {
        defaultModelId = modelIdentifier;
        break;
      }
    }
    if (!defaultModelId && !forceResolveModels) {
      return this.getDefaultLanguageModel(extension, true);
    }
    return this.getLanguageModelByIdentifier(extension, defaultModelId);
  }
  async getLanguageModelByIdentifier(extension, modelId) {
    if (!modelId) {
      return void 0;
    }
    if (!this._localModels.has(modelId)) {
      const vendor = this.getVendorFromModelIdentifier(modelId);
      if (!vendor) {
        this._logService.warn(`[LanguageModelProxy](${extension.identifier.value}) Could not extract vendor from model identifier '${modelId}'.`);
        return void 0;
      }
      this._logService.trace(`[LanguageModelProxy](${extension.identifier.value}) Could not find model '${modelId}' in local cache. Trying to resolve model again.`);
      await this._proxy.$selectChatModels({ vendor, extension: extension.identifier });
      if (!this._localModels.has(modelId)) {
        this._logService.warn(`[LanguageModelProxy](${extension.identifier.value}) Could not find model '${modelId}' in local cache after re-resolving models.`);
        return void 0;
      }
    }
    return this._createLanguageModelChatApi(extension, modelId);
  }
  async _createLanguageModelChatApi(extension, modelId) {
    const model = this._localModels.get(modelId);
    if (!model) {
      return void 0;
    }
    if (this._isUsingAuth(extension.identifier, model.metadata)) {
      await this._fakeAuthPopulate(model.metadata);
    }
    const that = this;
    const apiObject = {
      id: model.info.id,
      vendor: model.metadata.vendor,
      family: model.info.family,
      version: model.info.version,
      name: model.info.name,
      pricing: model.metadata.pricing,
      inputCost: model.metadata.inputCost,
      outputCost: model.metadata.outputCost,
      cacheCost: model.metadata.cacheCost,
      cacheWriteCost: model.metadata.cacheWriteCost,
      longContextInputCost: model.metadata.longContextInputCost,
      longContextOutputCost: model.metadata.longContextOutputCost,
      longContextCacheCost: model.metadata.longContextCacheCost,
      longContextCacheWriteCost: model.metadata.longContextCacheWriteCost,
      priceCategory: model.metadata.priceCategory,
      category: model.metadata.category,
      capabilities: {
        supportsImageToText: model.metadata.capabilities?.vision ?? false,
        supportsToolCalling: !!model.metadata.capabilities?.toolCalling,
        editToolsHint: model.metadata.capabilities?.editTools
      },
      maxInputTokens: model.metadata.maxInputTokens,
      countTokens(text, token) {
        if (!that._localModels.has(modelId)) {
          throw extHostTypes.LanguageModelError.NotFound(modelId);
        }
        return that._computeTokenLength(modelId, text, token ?? CancellationToken.None);
      },
      sendRequest(messages, options, token) {
        if (!that._localModels.has(modelId)) {
          throw extHostTypes.LanguageModelError.NotFound(modelId);
        }
        return that._sendChatRequest(extension, modelId, messages, options ?? {}, token ?? CancellationToken.None);
      }
    };
    Object.freeze(apiObject);
    return apiObject;
  }
  async selectLanguageModels(extension, selector) {
    const models = await this._proxy.$selectChatModels({ ...selector, extension: extension.identifier });
    const modelResults = await Promise.all(models.map((identifier) => this._createLanguageModelChatApi(extension, identifier)));
    return modelResults.filter((m) => !!m);
  }
  async _sendChatRequest(extension, languageModelId, messages, options, token) {
    const internalMessages = this._convertMessages(extension, messages);
    const from = extension.identifier;
    const metadata = this._localModels.get(languageModelId)?.metadata;
    if (!metadata || !this._localModels.has(languageModelId)) {
      throw extHostTypes.LanguageModelError.NotFound(`Language model '${languageModelId}' is unknown.`);
    }
    if (this._isUsingAuth(from, metadata)) {
      const success = await this._getAuthAccess(extension, { identifier: metadata.extension, displayName: metadata.auth.providerLabel }, options.justification, false);
      if (!success || !this._modelAccessList.get(from)?.has(metadata.extension)) {
        throw extHostTypes.LanguageModelError.NoPermissions(`Language model '${languageModelId}' cannot be used by '${from.value}'.`);
      }
    }
    const requestId = Math.random() * 1e6 | 0;
    const res = new LanguageModelResponse();
    this._pendingRequest.set(requestId, { languageModelId, res });
    const cts = new CancellationTokenSource(token);
    this._pendingCancelCTS.set(requestId, cts);
    cts.token.onCancellationRequested(() => {
      this._proxy.$cancelLanguageModelChatRequest(requestId);
    });
    try {
      await this._proxy.$tryStartChatRequest(from, languageModelId, requestId, new SerializableObjectWithBuffers(internalMessages), options, cts.token);
    } catch (error) {
      this._pendingRequest.delete(requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      throw extHostTypes.LanguageModelError.tryDeserialize(error) ?? error;
    }
    return res.apiObject;
  }
  _convertMessages(extension, messages) {
    const internalMessages = [];
    for (const message of messages) {
      if (message.role === extHostTypes.LanguageModelChatMessageRole.System) {
        checkProposedApiEnabled(extension, "languageModelSystem");
      }
      internalMessages.push(typeConvert.LanguageModelChatMessage2.from(message));
    }
    return internalMessages;
  }
  async $acceptResponsePart(requestId, chunk) {
    const data = this._pendingRequest.get(requestId);
    if (data) {
      data.res.handleResponsePart(chunk.value);
    }
  }
  $onChatModelsChange() {
    this._onDidChangeProviders.fire();
  }
  async $acceptResponseDone(requestId, error) {
    const data = this._pendingRequest.get(requestId);
    if (!data) {
      return;
    }
    this._pendingRequest.delete(requestId);
    this._pendingCancelCTS.deleteAndDispose(requestId);
    if (error) {
      data.res.reject(extHostTypes.LanguageModelError.tryDeserialize(error) ?? transformErrorFromSerialization(error));
    } else {
      data.res.resolve();
    }
  }
  // BIG HACK: Using AuthenticationProviders to check access to Language Models
  async _getAuthAccess(from, to, justification, silent) {
    const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + to.identifier.value;
    const session = await this._extHostAuthentication.getSession(from, providerId, [], { silent: true });
    if (session) {
      this.$updateModelAccesslist([{ from: from.identifier, to: to.identifier, enabled: true }]);
      return true;
    }
    if (silent) {
      return false;
    }
    try {
      const detail = justification ? localize("chatAccessWithJustification", "Justification: {1}", to.displayName, justification) : void 0;
      await this._extHostAuthentication.getSession(from, providerId, [], { forceNewSession: { detail } });
      this.$updateModelAccesslist([{ from: from.identifier, to: to.identifier, enabled: true }]);
      return true;
    } catch (err) {
      return false;
    }
  }
  _isUsingAuth(from, toMetadata) {
    return !!toMetadata.auth && !ExtensionIdentifier.equals(toMetadata.extension, from);
  }
  async _fakeAuthPopulate(metadata) {
    if (!metadata.auth) {
      return;
    }
    for (const from of this._languageAccessInformationExtensions) {
      try {
        await this._getAuthAccess(from, { identifier: metadata.extension, displayName: "" }, void 0, true);
      } catch (err) {
        this._logService.error("Fake Auth request failed");
        this._logService.error(err);
      }
    }
  }
  async _computeTokenLength(modelId, value, token) {
    const data = this._localModels.get(modelId);
    if (!data) {
      throw extHostTypes.LanguageModelError.NotFound(`Language model '${modelId}' is unknown.`);
    }
    return this._languageModelProviders.get(data.metadata.vendor)?.provider.provideTokenCount(data.info, value, token) ?? 0;
  }
  $updateModelAccesslist(data) {
    const updated = new Array();
    for (const { from, to, enabled } of data) {
      const set = this._modelAccessList.get(from) ?? new ExtensionIdentifierSet();
      const oldValue = set.has(to);
      if (oldValue !== enabled) {
        if (enabled) {
          set.add(to);
        } else {
          set.delete(to);
        }
        this._modelAccessList.set(from, set);
        const newItem = { from, to };
        updated.push(newItem);
        this._onDidChangeModelAccess.fire(newItem);
      }
    }
  }
  createLanguageModelAccessInformation(from) {
    this._languageAccessInformationExtensions.add(from);
    const _onDidChangeAccess = Event.signal(Event.filter(this._onDidChangeModelAccess.event, (e) => ExtensionIdentifier.equals(e.from, from.identifier)));
    const _onDidAddRemove = Event.signal(this._onDidChangeProviders.event);
    return {
      get onDidChange() {
        return Event.any(_onDidChangeAccess, _onDidAddRemove);
      },
      canSendRequest(chat) {
        return true;
      }
    };
  }
  fileIsIgnored(extension, uri, token = CancellationToken.None) {
    checkProposedApiEnabled(extension, "chatParticipantAdditions");
    return this._proxy.$fileIsIgnored(uri, token);
  }
  get isModelProxyAvailable() {
    return !!this._languageModelProxyProvider;
  }
  async getModelProxy(extension) {
    checkProposedApiEnabled(extension, "languageModelProxy");
    if (!this._languageModelProxyProvider) {
      this._logService.trace("[LanguageModelProxy] No LanguageModelProxyProvider registered");
      throw new Error("No language model proxy provider is registered.");
    }
    const requestingExtensionId = ExtensionIdentifier.toKey(extension.identifier);
    try {
      const result = await Promise.resolve(this._languageModelProxyProvider.provideModelProxy(requestingExtensionId, CancellationToken.None));
      if (!result) {
        this._logService.warn(`[LanguageModelProxy] Provider returned no proxy for ${requestingExtensionId}`);
        throw new Error("Language model proxy is not available.");
      }
      return result;
    } catch (err) {
      this._logService.error(`[LanguageModelProxy] Provider failed to return proxy for ${requestingExtensionId}`, err);
      throw err;
    }
  }
  async $isFileIgnored(handle, uri, token) {
    const provider = this._ignoredFileProviders.get(handle);
    if (!provider) {
      throw new Error("Unknown LanguageModelIgnoredFileProvider");
    }
    return await provider.provideFileIgnored(URI.revive(uri), token) ?? false;
  }
  registerIgnoredFileProvider(extension, provider) {
    checkProposedApiEnabled(extension, "chatParticipantPrivate");
    const handle = ExtHostLanguageModels._idPool++;
    this._proxy.$registerFileIgnoreProvider(handle);
    this._ignoredFileProviders.set(handle, provider);
    return toDisposable(() => {
      this._proxy.$unregisterFileIgnoreProvider(handle);
      this._ignoredFileProviders.delete(handle);
    });
  }
  registerLanguageModelProxyProvider(extension, provider) {
    checkProposedApiEnabled(extension, "chatParticipantPrivate");
    this._languageModelProxyProvider = provider;
    this._onDidChangeModelProxyAvailability.fire();
    return toDisposable(() => {
      if (this._languageModelProxyProvider === provider) {
        this._languageModelProxyProvider = void 0;
        this._onDidChangeModelProxyAvailability.fire();
      }
    });
  }
};
ExtHostLanguageModels._idPool = 1;
ExtHostLanguageModels = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostAuthentication)
], ExtHostLanguageModels);
export {
  ExtHostLanguageModels,
  IExtHostLanguageModels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0TGFuZ3VhZ2VNb2RlbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyLCBBc3luY0l0ZXJhYmxlU291cmNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6ZWRFcnJvciwgdHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uLCB0cmFuc2Zvcm1FcnJvckZyb21TZXJpYWxpemF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlTWFwLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgRXh0ZW5zaW9uSWRlbnRpZmllck1hcCwgRXh0ZW5zaW9uSWRlbnRpZmllclNldCwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9WRU5ET1JfSUQsIElDaGF0TWVzc2FnZSwgSUNoYXRSZXNwb25zZVBhcnQsIElMYW5ndWFnZU1vZGVsQ2hhdEluZm9PcHRpb25zLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVggfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgY2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHNTaGFwZSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRMYW5ndWFnZU1vZGVsc1NoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IElFeHRIb3N0QXV0aGVudGljYXRpb24gfSBmcm9tICcuL2V4dEhvc3RBdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIHR5cGVDb252ZXJ0IGZyb20gJy4vZXh0SG9zdFR5cGVDb252ZXJ0ZXJzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdExhbmd1YWdlTW9kZWxzIGV4dGVuZHMgRXh0SG9zdExhbmd1YWdlTW9kZWxzIHsgfVxuXG5leHBvcnQgY29uc3QgSUV4dEhvc3RMYW5ndWFnZU1vZGVscyA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdExhbmd1YWdlTW9kZWxzPignSUV4dEhvc3RMYW5ndWFnZU1vZGVscycpO1xuXG50eXBlIExhbmd1YWdlTW9kZWxQcm92aWRlckRhdGEgPSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRyZWFkb25seSBwcm92aWRlcjogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXI7XG59O1xuXG50eXBlIExNUmVzcG9uc2VQYXJ0ID0gdnNjb2RlLkxhbmd1YWdlTW9kZWxUZXh0UGFydCB8IHZzY29kZS5MYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0IHwgdnNjb2RlLkxhbmd1YWdlTW9kZWxEYXRhUGFydCB8IHZzY29kZS5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0O1xuXG5cbmNsYXNzIExhbmd1YWdlTW9kZWxSZXNwb25zZSB7XG5cblx0cmVhZG9ubHkgYXBpT2JqZWN0OiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0U3RyZWFtID0gbmV3IEFzeW5jSXRlcmFibGVTb3VyY2U8TE1SZXNwb25zZVBhcnQ+KCk7XG5cdHByaXZhdGUgX2lzRG9uZTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cblx0XHRjb25zdCBbc3RyZWFtMSwgc3RyZWFtMl0gPSBBc3luY0l0ZXJhYmxlUHJvZHVjZXIudGVlKHRoYXQuX2RlZmF1bHRTdHJlYW0uYXN5bmNJdGVyYWJsZSk7XG5cblx0XHR0aGlzLmFwaU9iamVjdCA9IHtcblx0XHRcdC8vIHJlc3VsdDogcHJvbWlzZSxcblx0XHRcdGdldCBzdHJlYW0oKSB7XG5cdFx0XHRcdHJldHVybiBzdHJlYW0xO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0ZXh0KCkge1xuXHRcdFx0XHRyZXR1cm4gc3RyZWFtMi5tYXAocGFydCA9PiB7XG5cdFx0XHRcdFx0aWYgKHBhcnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGFydC52YWx1ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLmNvYWxlc2NlKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRoYW5kbGVSZXNwb25zZVBhcnQocGFydHM6IElDaGF0UmVzcG9uc2VQYXJ0IHwgSUNoYXRSZXNwb25zZVBhcnRbXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0RvbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsbVJlc3BvbnNlUGFydHM6IExNUmVzcG9uc2VQYXJ0W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgcGFydCBvZiBJdGVyYWJsZS53cmFwKHBhcnRzKSkge1xuXG5cdFx0XHRsZXQgb3V0OiBMTVJlc3BvbnNlUGFydDtcblx0XHRcdGlmIChwYXJ0LnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRvdXQgPSBuZXcgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydChwYXJ0LnZhbHVlLCBwYXJ0LmF1ZGllbmNlKTtcblx0XHRcdH0gZWxzZSBpZiAocGFydC50eXBlID09PSAndGhpbmtpbmcnKSB7XG5cdFx0XHRcdG91dCA9IG5ldyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydChwYXJ0LnZhbHVlLCBwYXJ0LmlkLCBwYXJ0Lm1ldGFkYXRhKTtcblxuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICdkYXRhJykge1xuXHRcdFx0XHRvdXQgPSBuZXcgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydChwYXJ0LmRhdGEuYnVmZmVyLCBwYXJ0Lm1pbWVUeXBlLCBwYXJ0LmF1ZGllbmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dCA9IG5ldyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydChwYXJ0LnRvb2xDYWxsSWQsIHBhcnQubmFtZSwgcGFydC5wYXJhbWV0ZXJzKTtcblx0XHRcdH1cblx0XHRcdGxtUmVzcG9uc2VQYXJ0cy5wdXNoKG91dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVmYXVsdFN0cmVhbS5lbWl0TWFueShsbVJlc3BvbnNlUGFydHMpO1xuXHR9XG5cblx0cmVqZWN0KGVycjogRXJyb3IpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0RvbmUgPSB0cnVlO1xuXHRcdHRoaXMuX2RlZmF1bHRTdHJlYW0ucmVqZWN0KGVycik7XG5cdH1cblxuXHRyZXNvbHZlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRG9uZSA9IHRydWU7XG5cdFx0dGhpcy5fZGVmYXVsdFN0cmVhbS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RMYW5ndWFnZU1vZGVscyBpbXBsZW1lbnRzIEV4dEhvc3RMYW5ndWFnZU1vZGVsc1NoYXBlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyBfaWRQb29sID0gMTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogTWFpblRocmVhZExhbmd1YWdlTW9kZWxzU2hhcGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWxBY2Nlc3MgPSBuZXcgRW1pdHRlcjx7IGZyb206IEV4dGVuc2lvbklkZW50aWZpZXI7IHRvOiBFeHRlbnNpb25JZGVudGlmaWVyIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUHJvdmlkZXJzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnMgPSB0aGlzLl9vbkRpZENoYW5nZVByb3ZpZGVycy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlTW9kZWxQcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGF0YT4oKTtcblx0Ly8gVE9ETyBAbHJhbW9zMTUgLSBSZW1vdmUgdGhlIG5lZWQgZm9yIGJvdGggaW5mbyBhbmQgbWV0YWRhdGEgYXMgaXQncyBhIGxvdCBvZiByZWR1bmRhbmN5LiBTaG91bGQganVzdCBuZWVkIG9uZVxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbE1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCB7IGdyb3VwOiBzdHJpbmcgfCB1bmRlZmluZWQ7IG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YTsgaW5mbzogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0SW5mb3JtYXRpb24gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxBY2Nlc3NMaXN0ID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uSWRlbnRpZmllclNldD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1JlcXVlc3QgPSBuZXcgTWFwPG51bWJlciwgeyBsYW5ndWFnZU1vZGVsSWQ6IHN0cmluZzsgcmVzOiBMYW5ndWFnZU1vZGVsUmVzcG9uc2UgfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NhbmNlbENUUyA9IG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lnbm9yZWRGaWxlUHJvdmlkZXJzID0gbmV3IE1hcDxudW1iZXIsIHZzY29kZS5MYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSBfbGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXI6IHZzY29kZS5MYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlciB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0QXV0aGVudGljYXRpb24gcHJpdmF0ZSByZWFkb25seSBfZXh0SG9zdEF1dGhlbnRpY2F0aW9uOiBJRXh0SG9zdEF1dGhlbnRpY2F0aW9uLFxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZExhbmd1YWdlTW9kZWxzKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbEFjY2Vzcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm92aWRlcnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxQcm94eUF2YWlsYWJpbGl0eS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3QuY2xlYXIoKTtcblx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdmVuZG9yOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblxuXHRcdHRoaXMuX2xhbmd1YWdlTW9kZWxQcm92aWRlcnMuc2V0KHZlbmRvciwgeyBleHRlbnNpb246IGV4dGVuc2lvbiwgcHJvdmlkZXIgfSk7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKHZlbmRvcik7XG5cblx0XHRsZXQgcHJvdmlkZXJDaGFuZ2VFdmVudERpc3Bvc2FibGU6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxDaGF0SW5mb3JtYXRpb24pIHtcblx0XHRcdHByb3ZpZGVyQ2hhbmdlRXZlbnREaXNwb3NhYmxlID0gcHJvdmlkZXIub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsQ2hhdEluZm9ybWF0aW9uKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uTE1Qcm92aWRlckNoYW5nZSh2ZW5kb3IpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYW5ndWFnZU1vZGVsUHJvdmlkZXJzLmRlbGV0ZSh2ZW5kb3IpO1xuXHRcdFx0dGhpcy5fbG9jYWxNb2RlbHMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuXHRcdFx0XHRpZiAodmFsdWUubWV0YWRhdGEudmVuZG9yID09PSB2ZW5kb3IpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2NhbE1vZGVscy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRwcm92aWRlckNoYW5nZUV2ZW50RGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHVucmVnaXN0ZXJQcm92aWRlcih2ZW5kb3IpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b01vZGVsSWRlbnRpZmllcih2ZW5kb3I6IHN0cmluZywgZ3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZCwgbW9kZWxJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZ3JvdXAgPyBgJHt2ZW5kb3J9LyR7Z3JvdXB9LyR7bW9kZWxJZH1gIDogYCR7dmVuZG9yfS8ke21vZGVsSWR9YDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VmVuZG9yRnJvbU1vZGVsSWRlbnRpZmllcihtb2RlbElkZW50aWZpZXI6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmlyc3RTbGFzaCA9IG1vZGVsSWRlbnRpZmllci5pbmRleE9mKCcvJyk7XG5cdFx0cmV0dXJuIGZpcnN0U2xhc2ggPT09IC0xID8gdW5kZWZpbmVkIDogbW9kZWxJZGVudGlmaWVyLnN1YnN0cmluZygwLCBmaXJzdFNsYXNoKTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvKHZlbmRvcjogc3RyaW5nLCBvcHRpb25zOiBJTGFuZ3VhZ2VNb2RlbENoYXRJbmZvT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXT4ge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9sYW5ndWFnZU1vZGVsUHJvdmlkZXJzLmdldCh2ZW5kb3IpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbEluZm9ybWF0aW9uOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRJbmZvcm1hdGlvbltdID0gYXdhaXQgZGF0YS5wcm92aWRlci5wcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvcm1hdGlvbih7IHNpbGVudDogb3B0aW9ucy5zaWxlbnQsIGNvbmZpZ3VyYXRpb246IG9wdGlvbnMuY29uZmlndXJhdGlvbiB9LCB0b2tlbikgPz8gW107XG5cdFx0Y29uc3QgbW9kZWxNZXRhZGF0YUFuZElkZW50aWZpZXI6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gbW9kZWxJbmZvcm1hdGlvbi5tYXAoKG0pOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPT4ge1xuXHRcdFx0bGV0IGF1dGg7XG5cdFx0XHRpZiAobS5yZXF1aXJlc0F1dGhvcml6YXRpb24gJiYgaXNQcm9wb3NlZEFwaUVuYWJsZWQoZGF0YS5leHRlbnNpb24sICdjaGF0UHJvdmlkZXInKSkge1xuXHRcdFx0XHRhdXRoID0ge1xuXHRcdFx0XHRcdHByb3ZpZGVyTGFiZWw6IGRhdGEuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGRhdGEuZXh0ZW5zaW9uLm5hbWUsXG5cdFx0XHRcdFx0YWNjb3VudExhYmVsOiB0eXBlb2YgbS5yZXF1aXJlc0F1dGhvcml6YXRpb24gPT09ICdvYmplY3QnID8gbS5yZXF1aXJlc0F1dGhvcml6YXRpb24ubGFiZWwgOiB1bmRlZmluZWRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGlmIChtLmNhcGFiaWxpdGllcy5lZGl0VG9vbHMpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZGF0YS5leHRlbnNpb24sICdjaGF0UHJvdmlkZXInKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0sgaW4gQ2hhdEFnZW50TG9jYXRpb25dPzogYm9vbGVhbiB9ID0ge307XG5cdFx0XHRpZiAoaXNQcm9wb3NlZEFwaUVuYWJsZWQoZGF0YS5leHRlbnNpb24sICdjaGF0UHJvdmlkZXInKSkge1xuXHRcdFx0XHRpZiAobS5pc0RlZmF1bHQgPT09IHRydWUpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3QudmFsdWVzKENoYXRBZ2VudExvY2F0aW9uKSkge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBrZXkgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uW2tleSBhcyBDaGF0QWdlbnRMb2NhdGlvbl0gPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgbS5pc0RlZmF1bHQgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMobS5pc0RlZmF1bHQpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbnVtS2V5ID0gcGFyc2VJbnQoa2V5KSBhcyBleHRIb3N0VHlwZXMuQ2hhdExvY2F0aW9uO1xuXHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb25bdHlwZUNvbnZlcnQuQ2hhdExvY2F0aW9uLmZyb20oZW51bUtleSldID0gbS5pc0RlZmF1bHRbZW51bUtleV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBkYXRhLmV4dGVuc2lvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdGlkOiBtLmlkLFxuXHRcdFx0XHRcdHZlbmRvcixcblx0XHRcdFx0XHRuYW1lOiBtLm5hbWUgPz8gJycsXG5cdFx0XHRcdFx0ZmFtaWx5OiBtLmZhbWlseSA/PyAnJyxcblx0XHRcdFx0XHRkZXRhaWw6IG0uZGV0YWlsLFxuXHRcdFx0XHRcdHRvb2x0aXA6IG0udG9vbHRpcCxcblx0XHRcdFx0XHR2ZXJzaW9uOiBtLnZlcnNpb24sXG5cdFx0XHRcdFx0bXVsdGlwbGllck51bWVyaWM6IG0ubXVsdGlwbGllck51bWVyaWMsXG5cdFx0XHRcdFx0aXNCWU9LOiBtLmlzQllPSyxcblx0XHRcdFx0XHRwcmljaW5nOiBtLnByaWNpbmcsXG5cdFx0XHRcdFx0aW5wdXRDb3N0OiBtLmlucHV0Q29zdCxcblx0XHRcdFx0XHRvdXRwdXRDb3N0OiBtLm91dHB1dENvc3QsXG5cdFx0XHRcdFx0Y2FjaGVDb3N0OiBtLmNhY2hlQ29zdCxcblx0XHRcdFx0XHRjYWNoZVdyaXRlQ29zdDogbS5jYWNoZVdyaXRlQ29zdCxcblx0XHRcdFx0XHRsb25nQ29udGV4dElucHV0Q29zdDogbS5sb25nQ29udGV4dElucHV0Q29zdCxcblx0XHRcdFx0XHRsb25nQ29udGV4dE91dHB1dENvc3Q6IG0ubG9uZ0NvbnRleHRPdXRwdXRDb3N0LFxuXHRcdFx0XHRcdGxvbmdDb250ZXh0Q2FjaGVDb3N0OiBtLmxvbmdDb250ZXh0Q2FjaGVDb3N0LFxuXHRcdFx0XHRcdGxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3Q6IG0ubG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdCxcblx0XHRcdFx0XHRwcmljZUNhdGVnb3J5OiBtLnByaWNlQ2F0ZWdvcnksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IG0uY2F0ZWdvcnksXG5cdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IG0ubWF4SW5wdXRUb2tlbnMsXG5cdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiBtLm1heE91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRhdXRoLFxuXHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uLFxuXHRcdFx0XHRcdGlzVXNlclNlbGVjdGFibGU6IG0uaXNVc2VyU2VsZWN0YWJsZSxcblx0XHRcdFx0XHRzdGF0dXNJY29uOiBtLnN0YXR1c0ljb24sXG5cdFx0XHRcdFx0dGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBtLnRhcmdldENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uU2NoZW1hOiBtLmNvbmZpZ3VyYXRpb25TY2hlbWEgYXMgSUpTT05TY2hlbWEgfCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0d2FybmluZ1RleHQ6IG0ud2FybmluZ1RleHQsXG5cdFx0XHRcdFx0cHJvbW86IG0ucHJvbW8sXG5cdFx0XHRcdFx0Y2FwYWJpbGl0aWVzOiBtLmNhcGFiaWxpdGllcyA/IHtcblx0XHRcdFx0XHRcdHZpc2lvbjogbS5jYXBhYmlsaXRpZXMuaW1hZ2VJbnB1dCxcblx0XHRcdFx0XHRcdGVkaXRUb29sczogbS5jYXBhYmlsaXRpZXMuZWRpdFRvb2xzLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxpbmc6ICEhbS5jYXBhYmlsaXRpZXMudG9vbENhbGxpbmcsXG5cdFx0XHRcdFx0XHRhZ2VudE1vZGU6ICEhbS5jYXBhYmlsaXRpZXMudG9vbENhbGxpbmdcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpZGVudGlmaWVyOiB0aGlzLnRvTW9kZWxJZGVudGlmaWVyKHZlbmRvciwgb3B0aW9ucy5ncm91cCwgbS5pZClcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9sb2NhbE1vZGVscy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRpZiAodmFsdWUubWV0YWRhdGEudmVuZG9yID09PSB2ZW5kb3IgJiYgdmFsdWUuZ3JvdXAgPT09IG9wdGlvbnMuZ3JvdXApIHtcblx0XHRcdFx0dGhpcy5fbG9jYWxNb2RlbHMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG1vZGVsTWV0YWRhdGFBbmRJZGVudGlmaWVyLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9sb2NhbE1vZGVscy5zZXQobW9kZWxNZXRhZGF0YUFuZElkZW50aWZpZXJbaV0uaWRlbnRpZmllciwge1xuXHRcdFx0XHRncm91cDogb3B0aW9ucy5ncm91cCxcblx0XHRcdFx0bWV0YWRhdGE6IG1vZGVsTWV0YWRhdGFBbmRJZGVudGlmaWVyW2ldLm1ldGFkYXRhLFxuXHRcdFx0XHRpbmZvOiBtb2RlbEluZm9ybWF0aW9uW2ldXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWxNZXRhZGF0YUFuZElkZW50aWZpZXI7XG5cdH1cblxuXHRhc3luYyAkc3RhcnRDaGF0UmVxdWVzdChtb2RlbElkOiBzdHJpbmcsIHJlcXVlc3RJZDogbnVtYmVyLCBmcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyIHwgdW5kZWZpbmVkLCBtZXNzYWdlczogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SUNoYXRNZXNzYWdlW10+LCBvcHRpb25zOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0T3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga25vd25Nb2RlbCA9IHRoaXMuX2xvY2FsTW9kZWxzLmdldChtb2RlbElkKTtcblx0XHRpZiAoIWtub3duTW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTW9kZWwgbm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2xhbmd1YWdlTW9kZWxQcm92aWRlcnMuZ2V0KGtub3duTW9kZWwubWV0YWRhdGEudmVuZG9yKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgcHJvdmlkZXIgZm9yICcke2tub3duTW9kZWwubWV0YWRhdGEuaWR9JyBub3QgZm91bmQuYCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbG9jYWwgQ1RTIHNvIHRoZSBwcm92aWRlcidzIHRva2VuIGNhbiBiZSBjYW5jZWxsZWQgdmlhXG5cdFx0Ly8gJGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdCBldmVuIGFmdGVyIHRoZSBSUEMgY2FuY2VsIGhhbmRsZXJcblx0XHQvLyBmb3IgdGhlIG9yaWdpbmFsIHRva2VuIGhhcyBiZWVuIHJlbW92ZWQuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLnNldChyZXF1ZXN0SWQsIGN0cyk7XG5cblx0XHRjb25zdCBwcm92aWRlclRva2VuID0gY3RzLnRva2VuO1xuXG5cdFx0Y29uc3QgcXVldWU6IElDaGF0UmVzcG9uc2VQYXJ0W10gPSBbXTtcblx0XHRjb25zdCBzZW5kTm93ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJHJlcG9ydFJlc3BvbnNlUGFydChyZXF1ZXN0SWQsIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyhxdWV1ZSkpO1xuXHRcdFx0XHRxdWV1ZS5sZW5ndGggPSAwO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgcXVldWVTY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcihzZW5kTm93LCAzMCk7XG5cdFx0Y29uc3Qgc2VuZFNvb24gPSAocGFydDogSUNoYXRSZXNwb25zZVBhcnQpID0+IHtcblx0XHRcdGNvbnN0IG5ld0xlbiA9IHF1ZXVlLnB1c2gocGFydCk7XG5cdFx0XHQvLyBmbHVzaC9zZW5kIGlmIHRoaW5ncyBwaWxlIHVwIG1vcmUgdGhhbiBleHBlY3RlZFxuXHRcdFx0aWYgKG5ld0xlbiA+IDMwKSB7XG5cdFx0XHRcdHNlbmROb3coKTtcblx0XHRcdFx0cXVldWVTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRxdWV1ZVNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm9ncmVzcyA9IG5ldyBQcm9ncmVzczx2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCB2c2NvZGUuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHwgdnNjb2RlLkxhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQ+KGFzeW5jIGZyYWdtZW50ID0+IHtcblx0XHRcdGlmIChwcm92aWRlclRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NIQVRdKCR7ZGF0YS5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0pIENBTk5PVCBzZW5kIHByb2dyZXNzIGJlY2F1c2UgdGhlIFJFUVVFU1QgSVMgQ0FOQ0VMTEVEYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHBhcnQ6IElDaGF0UmVzcG9uc2VQYXJ0IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGZyYWdtZW50IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQpIHtcblx0XHRcdFx0cGFydCA9IHsgdHlwZTogJ3Rvb2xfdXNlJywgbmFtZTogZnJhZ21lbnQubmFtZSwgcGFyYW1ldGVyczogZnJhZ21lbnQuaW5wdXQsIHRvb2xDYWxsSWQ6IGZyYWdtZW50LmNhbGxJZCB9O1xuXHRcdFx0fSBlbHNlIGlmIChmcmFnbWVudCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQpIHtcblx0XHRcdFx0cGFydCA9IHsgdHlwZTogJ3RleHQnLCB2YWx1ZTogZnJhZ21lbnQudmFsdWUsIGF1ZGllbmNlOiBmcmFnbWVudC5hdWRpZW5jZSB9O1xuXHRcdFx0fSBlbHNlIGlmIChmcmFnbWVudCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsRGF0YVBhcnQpIHtcblx0XHRcdFx0cGFydCA9IHsgdHlwZTogJ2RhdGEnLCBtaW1lVHlwZTogZnJhZ21lbnQubWltZVR5cGUsIGRhdGE6IFZTQnVmZmVyLndyYXAoZnJhZ21lbnQuZGF0YSksIGF1ZGllbmNlOiBmcmFnbWVudC5hdWRpZW5jZSB9O1xuXHRcdFx0fSBlbHNlIGlmIChmcmFnbWVudCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0KSB7XG5cdFx0XHRcdHBhcnQgPSB7IHR5cGU6ICd0aGlua2luZycsIHZhbHVlOiBmcmFnbWVudC52YWx1ZSwgaWQ6IGZyYWdtZW50LmlkLCBtZXRhZGF0YTogZnJhZ21lbnQubWV0YWRhdGEgfTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFwYXJ0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NIQVRdKCR7ZGF0YS5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0pIFVOS05PV04gcGFydCAke0pTT04uc3RyaW5naWZ5KGZyYWdtZW50KX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRzZW5kU29vbihwYXJ0KTtcblx0XHR9KTtcblxuXHRcdGxldCB2YWx1ZTogdW5rbm93bjtcblxuXHRcdHRyeSB7XG5cdFx0XHR2YWx1ZSA9IGRhdGEucHJvdmlkZXIucHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0UmVzcG9uc2UoXG5cdFx0XHRcdGtub3duTW9kZWwuaW5mbyxcblx0XHRcdFx0bWVzc2FnZXMudmFsdWUubWFwKHR5cGVDb252ZXJ0Lkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIudG8pLFxuXHRcdFx0XHQvLyB0b2RvQGNvbm5vcjQzMTI6IG1vdmUgYGNvcmVgIC0+IGB1bmRlZmluZWRgIGFmdGVyIDEuMTExIEluc2lkZXJzIGlzIG91dFxuXHRcdFx0XHR7IC4uLm9wdGlvbnMsIG1vZGVsT3B0aW9uczogb3B0aW9ucy5tb2RlbE9wdGlvbnMgPz8ge30sIG1vZGVsQ29uZmlndXJhdGlvbjogb3B0aW9ucy5jb25maWd1cmF0aW9uLCByZXF1ZXN0SW5pdGlhdG9yOiBmcm9tID8gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShmcm9tKSA6ICdjb3JlJywgdG9vbE1vZGU6IG9wdGlvbnMudG9vbE1vZGUgPz8gZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxDaGF0VG9vbE1vZGUuQXV0bywgaW5jbHVkZUVuY3J5cHRlZFRoaW5raW5nOiBvcHRpb25zLmluY2x1ZGVFbmNyeXB0ZWRUaGlua2luZyB9LFxuXHRcdFx0XHRwcm9ncmVzcyxcblx0XHRcdFx0cHJvdmlkZXJUb2tlblxuXHRcdFx0KTtcblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gc3luY2hyb25vdXNseSBmYWlsZWRcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdFByb21pc2UucmVzb2x2ZSh2YWx1ZSkudGhlbigoKSA9PiB7XG5cdFx0XHRzZW5kTm93KCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLmRlbGV0ZUFuZERpc3Bvc2UocmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRyZXBvcnRSZXNwb25zZURvbmUocmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHRzZW5kTm93KCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLmRlbGV0ZUFuZERpc3Bvc2UocmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRyZXBvcnRSZXNwb25zZURvbmUocmVxdWVzdElkLCB0cmFuc2Zvcm1FcnJvckZvclNlcmlhbGl6YXRpb24oZXJyKSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyNyZWdpb24gLS0tIHRva2VuIGNvdW50aW5nXG5cblx0JGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdChyZXF1ZXN0SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZ2V0KHJlcXVlc3RJZCk/LmNhbmNlbCgpO1xuXHR9XG5cblx0JHByb3ZpZGVUb2tlbkxlbmd0aChtb2RlbElkOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0Y29uc3Qga25vd25Nb2RlbCA9IHRoaXMuX2xvY2FsTW9kZWxzLmdldChtb2RlbElkKTtcblx0XHRpZiAoIWtub3duTW9kZWwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoMCk7XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9sYW5ndWFnZU1vZGVsUHJvdmlkZXJzLmdldChrbm93bk1vZGVsLm1ldGFkYXRhLnZlbmRvcik7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKDApO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGRhdGEucHJvdmlkZXIucHJvdmlkZVRva2VuQ291bnQoa25vd25Nb2RlbC5pbmZvLCB2YWx1ZSwgdG9rZW4pKTtcblx0fVxuXG5cblx0Ly8jcmVnaW9uIC0tLSBtYWtpbmcgcmVxdWVzdFxuXG5cdGFzeW5jIGdldERlZmF1bHRMYW5ndWFnZU1vZGVsKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBmb3JjZVJlc29sdmVNb2RlbHM/OiBib29sZWFuKTogUHJvbWlzZTx2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgZGVmYXVsdE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChmb3JjZVJlc29sdmVNb2RlbHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoZXh0ZW5zaW9uLCB7fSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbbW9kZWxJZGVudGlmaWVyLCBtb2RlbERhdGFdIG9mIHRoaXMuX2xvY2FsTW9kZWxzKSB7XG5cdFx0XHRpZiAobW9kZWxEYXRhLm1ldGFkYXRhLmlzRGVmYXVsdEZvckxvY2F0aW9uW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdICYmIG1vZGVsRGF0YS5tZXRhZGF0YS52ZW5kb3IgPT09IENPUElMT1RfVkVORE9SX0lEKSB7XG5cdFx0XHRcdGRlZmF1bHRNb2RlbElkID0gbW9kZWxJZGVudGlmaWVyO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFkZWZhdWx0TW9kZWxJZCAmJiAhZm9yY2VSZXNvbHZlTW9kZWxzKSB7XG5cdFx0XHQvLyBNYXliZSB0aGUgZGVmYXVsdCB3YXNuJ3QgY2FjaGVkIHNvIHdlIHdpbGwgdHJ5IGFnYWluIHdpdGggcmVzb2x2aW5nIHRoZSBtb2RlbHMgdG9vXG5cdFx0XHRyZXR1cm4gdGhpcy5nZXREZWZhdWx0TGFuZ3VhZ2VNb2RlbChleHRlbnNpb24sIHRydWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXRMYW5ndWFnZU1vZGVsQnlJZGVudGlmaWVyKGV4dGVuc2lvbiwgZGVmYXVsdE1vZGVsSWQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TGFuZ3VhZ2VNb2RlbEJ5SWRlbnRpZmllcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIW1vZGVsSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9sb2NhbE1vZGVscy5oYXMobW9kZWxJZCkpIHtcblx0XHRcdC8vIG1vZGVsIGdvbmU/IGlzIHRoaXMgYW4gZXJyb3Igb24gdXM/IFRyeSB0byByZXNvbHZlIG1vZGVsIGFnYWluXG5cdFx0XHRjb25zdCB2ZW5kb3IgPSB0aGlzLmdldFZlbmRvckZyb21Nb2RlbElkZW50aWZpZXIobW9kZWxJZCk7XG5cdFx0XHRpZiAoIXZlbmRvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMYW5ndWFnZU1vZGVsUHJveHldKCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9KSBDb3VsZCBub3QgZXh0cmFjdCB2ZW5kb3IgZnJvbSBtb2RlbCBpZGVudGlmaWVyICcke21vZGVsSWR9Jy5gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtMYW5ndWFnZU1vZGVsUHJveHldKCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9KSBDb3VsZCBub3QgZmluZCBtb2RlbCAnJHttb2RlbElkfScgaW4gbG9jYWwgY2FjaGUuIFRyeWluZyB0byByZXNvbHZlIG1vZGVsIGFnYWluLmApO1xuXHRcdFx0Ly8gQ2FsbCBwcm94eSBkaXJlY3RseTogcm91dGluZyB0aHJvdWdoIGBzZWxlY3RMYW5ndWFnZU1vZGVsc2Agd291bGQgcmVjdXJzZSBoZXJlIGZvciBldmVyeSBpZGVudGlmaWVyIGFuZCBibG93IHVwIHdoZW4gdGhlIGNhY2hlIHN0YXlzIGVtcHR5IChwcm92aWRlciBpbiBhbm90aGVyIGV4dCBob3N0KS5cblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRzZWxlY3RDaGF0TW9kZWxzKHsgdmVuZG9yLCBleHRlbnNpb246IGV4dGVuc2lvbi5pZGVudGlmaWVyIH0pO1xuXHRcdFx0aWYgKCF0aGlzLl9sb2NhbE1vZGVscy5oYXMobW9kZWxJZCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbTGFuZ3VhZ2VNb2RlbFByb3h5XSgke2V4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfSkgQ291bGQgbm90IGZpbmQgbW9kZWwgJyR7bW9kZWxJZH0nIGluIGxvY2FsIGNhY2hlIGFmdGVyIHJlLXJlc29sdmluZyBtb2RlbHMuYCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUxhbmd1YWdlTW9kZWxDaGF0QXBpKGV4dGVuc2lvbiwgbW9kZWxJZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVMYW5ndWFnZU1vZGVsQ2hhdEFwaShleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgbW9kZWxJZDogc3RyaW5nKTogUHJvbWlzZTx2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2xvY2FsTW9kZWxzLmdldChtb2RlbElkKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIG1ha2Ugc3VyZSBhdXRoIGluZm9ybWF0aW9uIGlzIGNvcnJlY3Rcblx0XHRpZiAodGhpcy5faXNVc2luZ0F1dGgoZXh0ZW5zaW9uLmlkZW50aWZpZXIsIG1vZGVsLm1ldGFkYXRhKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZmFrZUF1dGhQb3B1bGF0ZShtb2RlbC5tZXRhZGF0YSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgYXBpT2JqZWN0OiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQgPSB7XG5cdFx0XHRpZDogbW9kZWwuaW5mby5pZCxcblx0XHRcdHZlbmRvcjogbW9kZWwubWV0YWRhdGEudmVuZG9yLFxuXHRcdFx0ZmFtaWx5OiBtb2RlbC5pbmZvLmZhbWlseSxcblx0XHRcdHZlcnNpb246IG1vZGVsLmluZm8udmVyc2lvbixcblx0XHRcdG5hbWU6IG1vZGVsLmluZm8ubmFtZSxcblx0XHRcdHByaWNpbmc6IG1vZGVsLm1ldGFkYXRhLnByaWNpbmcsXG5cdFx0XHRpbnB1dENvc3Q6IG1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCxcblx0XHRcdG91dHB1dENvc3Q6IG1vZGVsLm1ldGFkYXRhLm91dHB1dENvc3QsXG5cdFx0XHRjYWNoZUNvc3Q6IG1vZGVsLm1ldGFkYXRhLmNhY2hlQ29zdCxcblx0XHRcdGNhY2hlV3JpdGVDb3N0OiBtb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCxcblx0XHRcdGxvbmdDb250ZXh0SW5wdXRDb3N0OiBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dElucHV0Q29zdCxcblx0XHRcdGxvbmdDb250ZXh0T3V0cHV0Q29zdDogbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0LFxuXHRcdFx0bG9uZ0NvbnRleHRDYWNoZUNvc3Q6IG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVDb3N0LFxuXHRcdFx0bG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdDogbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdCxcblx0XHRcdHByaWNlQ2F0ZWdvcnk6IG1vZGVsLm1ldGFkYXRhLnByaWNlQ2F0ZWdvcnksXG5cdFx0XHRjYXRlZ29yeTogbW9kZWwubWV0YWRhdGEuY2F0ZWdvcnksXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0c3VwcG9ydHNJbWFnZVRvVGV4dDogbW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24gPz8gZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnRzVG9vbENhbGxpbmc6ICEhbW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy50b29sQ2FsbGluZyxcblx0XHRcdFx0ZWRpdFRvb2xzSGludDogbW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy5lZGl0VG9vbHMsXG5cdFx0XHR9LFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IG1vZGVsLm1ldGFkYXRhLm1heElucHV0VG9rZW5zLFxuXHRcdFx0Y291bnRUb2tlbnModGV4dCwgdG9rZW4pIHtcblx0XHRcdFx0aWYgKCF0aGF0Ll9sb2NhbE1vZGVscy5oYXMobW9kZWxJZCkpIHtcblx0XHRcdFx0XHR0aHJvdyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbEVycm9yLk5vdEZvdW5kKG1vZGVsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9jb21wdXRlVG9rZW5MZW5ndGgobW9kZWxJZCwgdGV4dCwgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9LFxuXHRcdFx0c2VuZFJlcXVlc3QobWVzc2FnZXMsIG9wdGlvbnMsIHRva2VuKSB7XG5cdFx0XHRcdGlmICghdGhhdC5fbG9jYWxNb2RlbHMuaGFzKG1vZGVsSWQpKSB7XG5cdFx0XHRcdFx0dGhyb3cgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxFcnJvci5Ob3RGb3VuZChtb2RlbElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhhdC5fc2VuZENoYXRSZXF1ZXN0KGV4dGVuc2lvbiwgbW9kZWxJZCwgbWVzc2FnZXMsIG9wdGlvbnMgPz8ge30sIHRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRPYmplY3QuZnJlZXplKGFwaU9iamVjdCk7XG5cdFx0cmV0dXJuIGFwaU9iamVjdDtcblx0fVxuXG5cdGFzeW5jIHNlbGVjdExhbmd1YWdlTW9kZWxzKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBzZWxlY3RvcjogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3IpIHtcblxuXHRcdC8vIHRoaXMgdHJpZ2dlcnMgZXh0ZW5zaW9uIGFjdGl2YXRpb25cblx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCB0aGlzLl9wcm94eS4kc2VsZWN0Q2hhdE1vZGVscyh7IC4uLnNlbGVjdG9yLCBleHRlbnNpb246IGV4dGVuc2lvbi5pZGVudGlmaWVyIH0pO1xuXG5cdFx0Ly8gU2tpcCB0aGUgd2Fybi9yZXRyeSBwYXRoIGluIGBnZXRMYW5ndWFnZU1vZGVsQnlJZGVudGlmaWVyYDogaWRlbnRpZmllcnMgYXJlIGZyZXNoLCBzbyBhIG1pc3NpbmcgbG9jYWwgZW50cnkgbWVhbnMgdGhlIHByb3ZpZGVyIGxpdmVzIGluIGFub3RoZXIgZXh0IGhvc3QgYW5kIHJlLXJlc29sdmluZyB3aWxsIG5vdCBoZWxwLlxuXHRcdGNvbnN0IG1vZGVsUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKG1vZGVscy5tYXAoaWRlbnRpZmllciA9PiB0aGlzLl9jcmVhdGVMYW5ndWFnZU1vZGVsQ2hhdEFwaShleHRlbnNpb24sIGlkZW50aWZpZXIpKSk7XG5cdFx0cmV0dXJuIG1vZGVsUmVzdWx0cy5maWx0ZXIoKG0pOiBtIGlzIHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCA9PiAhIW0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZENoYXRSZXF1ZXN0KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBsYW5ndWFnZU1vZGVsSWQ6IHN0cmluZywgbWVzc2FnZXM6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyW10sIG9wdGlvbnM6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblxuXHRcdGNvbnN0IGludGVybmFsTWVzc2FnZXM6IElDaGF0TWVzc2FnZVtdID0gdGhpcy5fY29udmVydE1lc3NhZ2VzKGV4dGVuc2lvbiwgbWVzc2FnZXMpO1xuXG5cdFx0Y29uc3QgZnJvbSA9IGV4dGVuc2lvbi5pZGVudGlmaWVyO1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5fbG9jYWxNb2RlbHMuZ2V0KGxhbmd1YWdlTW9kZWxJZCk/Lm1ldGFkYXRhO1xuXG5cdFx0aWYgKCFtZXRhZGF0YSB8fCAhdGhpcy5fbG9jYWxNb2RlbHMuaGFzKGxhbmd1YWdlTW9kZWxJZCkpIHtcblx0XHRcdHRocm93IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsRXJyb3IuTm90Rm91bmQoYExhbmd1YWdlIG1vZGVsICcke2xhbmd1YWdlTW9kZWxJZH0nIGlzIHVua25vd24uYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2lzVXNpbmdBdXRoKGZyb20sIG1ldGFkYXRhKSkge1xuXHRcdFx0Y29uc3Qgc3VjY2VzcyA9IGF3YWl0IHRoaXMuX2dldEF1dGhBY2Nlc3MoZXh0ZW5zaW9uLCB7IGlkZW50aWZpZXI6IG1ldGFkYXRhLmV4dGVuc2lvbiwgZGlzcGxheU5hbWU6IG1ldGFkYXRhLmF1dGgucHJvdmlkZXJMYWJlbCB9LCBvcHRpb25zLmp1c3RpZmljYXRpb24sIGZhbHNlKTtcblxuXHRcdFx0aWYgKCFzdWNjZXNzIHx8ICF0aGlzLl9tb2RlbEFjY2Vzc0xpc3QuZ2V0KGZyb20pPy5oYXMobWV0YWRhdGEuZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHR0aHJvdyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbEVycm9yLk5vUGVybWlzc2lvbnMoYExhbmd1YWdlIG1vZGVsICcke2xhbmd1YWdlTW9kZWxJZH0nIGNhbm5vdCBiZSB1c2VkIGJ5ICcke2Zyb20udmFsdWV9Jy5gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0SWQgPSAoTWF0aC5yYW5kb20oKSAqIDFlNikgfCAwO1xuXHRcdGNvbnN0IHJlcyA9IG5ldyBMYW5ndWFnZU1vZGVsUmVzcG9uc2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdC5zZXQocmVxdWVzdElkLCB7IGxhbmd1YWdlTW9kZWxJZCwgcmVzIH0pO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLnNldChyZXF1ZXN0SWQsIGN0cyk7XG5cdFx0Y3RzLnRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRjYW5jZWxMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3QocmVxdWVzdElkKTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kdHJ5U3RhcnRDaGF0UmVxdWVzdChmcm9tLCBsYW5ndWFnZU1vZGVsSWQsIHJlcXVlc3RJZCwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKGludGVybmFsTWVzc2FnZXMpLCBvcHRpb25zLCBjdHMudG9rZW4pO1xuXG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGVycm9yJ2luZyBoZXJlIG1lYW5zIHRoYXQgdGhlIHJlcXVlc3QgY291bGQgTk9UIGJlIHN0YXJ0ZWQvbWFkZSwgZS5nLiB3cm9uZyBtb2RlbCwgbm8gYWNjZXNzLCBldGMsIGJ1dFxuXHRcdFx0Ly8gbGF0ZXIgdGhlIHJlc3BvbnNlIGNhbiBmYWlsIGFzIHdlbGwuIFRob3NlIGZhaWx1cmVzIGFyZSBjb21tdW5pY2F0ZWQgdmlhIHRoZSBzdHJlYW0tb2JqZWN0XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdC5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhyb3cgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxFcnJvci50cnlEZXNlcmlhbGl6ZShlcnJvcikgPz8gZXJyb3I7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlcy5hcGlPYmplY3Q7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0TWVzc2FnZXMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG1lc3NhZ2VzOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMltdKSB7XG5cdFx0Y29uc3QgaW50ZXJuYWxNZXNzYWdlczogSUNoYXRNZXNzYWdlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgbWVzc2FnZXMpIHtcblx0XHRcdGlmIChtZXNzYWdlLnJvbGUgYXMgbnVtYmVyID09PSBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlUm9sZS5TeXN0ZW0pIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VNb2RlbFN5c3RlbScpO1xuXHRcdFx0fVxuXHRcdFx0aW50ZXJuYWxNZXNzYWdlcy5wdXNoKHR5cGVDb252ZXJ0Lkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTIuZnJvbShtZXNzYWdlKSk7XG5cdFx0fVxuXHRcdHJldHVybiBpbnRlcm5hbE1lc3NhZ2VzO1xuXHR9XG5cblx0YXN5bmMgJGFjY2VwdFJlc3BvbnNlUGFydChyZXF1ZXN0SWQ6IG51bWJlciwgY2h1bms6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElDaGF0UmVzcG9uc2VQYXJ0IHwgSUNoYXRSZXNwb25zZVBhcnRbXT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fcGVuZGluZ1JlcXVlc3QuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdGRhdGEucmVzLmhhbmRsZVJlc3BvbnNlUGFydChjaHVuay52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0JG9uQ2hhdE1vZGVsc0NoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3ZpZGVycy5maXJlKCk7XG5cdH1cblxuXHRhc3luYyAkYWNjZXB0UmVzcG9uc2VEb25lKHJlcXVlc3RJZDogbnVtYmVyLCBlcnJvcjogU2VyaWFsaXplZEVycm9yIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX3BlbmRpbmdSZXF1ZXN0LmdldChyZXF1ZXN0SWQpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdC5kZWxldGUocmVxdWVzdElkKTtcblx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLmRlbGV0ZUFuZERpc3Bvc2UocmVxdWVzdElkKTtcblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdC8vIHdlIGVycm9yIHRoZSBzdHJlYW0gYmVjYXVzZSB0aGF0J3MgdGhlIG9ubHkgd2F5IHRvIHNpZ25hbFxuXHRcdFx0Ly8gdGhhdCB0aGUgcmVxdWVzdCBoYXMgZmFpbGVkXG5cdFx0XHRkYXRhLnJlcy5yZWplY3QoZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxFcnJvci50cnlEZXNlcmlhbGl6ZShlcnJvcikgPz8gdHJhbnNmb3JtRXJyb3JGcm9tU2VyaWFsaXphdGlvbihlcnJvcikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnJlcy5yZXNvbHZlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQklHIEhBQ0s6IFVzaW5nIEF1dGhlbnRpY2F0aW9uUHJvdmlkZXJzIHRvIGNoZWNrIGFjY2VzcyB0byBMYW5ndWFnZSBNb2RlbHNcblx0cHJpdmF0ZSBhc3luYyBfZ2V0QXV0aEFjY2Vzcyhmcm9tOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRvOiB7IGlkZW50aWZpZXI6IEV4dGVuc2lvbklkZW50aWZpZXI7IGRpc3BsYXlOYW1lOiBzdHJpbmcgfSwganVzdGlmaWNhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBzaWxlbnQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyBUaGlzIG5lZWRzIHRvIGJlIGRvbmUgaW4gYm90aCBNYWluVGhyZWFkICYgRXh0SG9zdCBDaGF0UHJvdmlkZXJcblx0XHRjb25zdCBwcm92aWRlcklkID0gSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVggKyB0by5pZGVudGlmaWVyLnZhbHVlO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCB0aGlzLl9leHRIb3N0QXV0aGVudGljYXRpb24uZ2V0U2Vzc2lvbihmcm9tLCBwcm92aWRlcklkLCBbXSwgeyBzaWxlbnQ6IHRydWUgfSk7XG5cblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy4kdXBkYXRlTW9kZWxBY2Nlc3NsaXN0KFt7IGZyb206IGZyb20uaWRlbnRpZmllciwgdG86IHRvLmlkZW50aWZpZXIsIGVuYWJsZWQ6IHRydWUgfV0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHNpbGVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBkZXRhaWwgPSBqdXN0aWZpY2F0aW9uXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXRBY2Nlc3NXaXRoSnVzdGlmaWNhdGlvbicsIFwiSnVzdGlmaWNhdGlvbjogezF9XCIsIHRvLmRpc3BsYXlOYW1lLCBqdXN0aWZpY2F0aW9uKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IHRoaXMuX2V4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGZyb20sIHByb3ZpZGVySWQsIFtdLCB7IGZvcmNlTmV3U2Vzc2lvbjogeyBkZXRhaWwgfSB9KTtcblx0XHRcdHRoaXMuJHVwZGF0ZU1vZGVsQWNjZXNzbGlzdChbeyBmcm9tOiBmcm9tLmlkZW50aWZpZXIsIHRvOiB0by5pZGVudGlmaWVyLCBlbmFibGVkOiB0cnVlIH1dKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBpZ25vcmVcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pc1VzaW5nQXV0aChmcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyLCB0b01ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSk6IHRvTWV0YWRhdGEgaXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgJiB7IGF1dGg6IE5vbk51bGxhYmxlPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhWydhdXRoJ10+IH0ge1xuXHRcdC8vIElmIHRoZSAndG8nIGV4dGVuc2lvbiB1c2VzIGFuIGF1dGggY2hlY2tcblx0XHRyZXR1cm4gISF0b01ldGFkYXRhLmF1dGhcblx0XHRcdC8vIEFuZCB3ZSdyZSBhc2tpbmcgZnJvbSBhIGRpZmZlcmVudCBleHRlbnNpb25cblx0XHRcdCYmICFFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0b01ldGFkYXRhLmV4dGVuc2lvbiwgZnJvbSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mYWtlQXV0aFBvcHVsYXRlKG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKCFtZXRhZGF0YS5hdXRoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBmcm9tIG9mIHRoaXMuX2xhbmd1YWdlQWNjZXNzSW5mb3JtYXRpb25FeHRlbnNpb25zKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9nZXRBdXRoQWNjZXNzKGZyb20sIHsgaWRlbnRpZmllcjogbWV0YWRhdGEuZXh0ZW5zaW9uLCBkaXNwbGF5TmFtZTogJycgfSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdGYWtlIEF1dGggcmVxdWVzdCBmYWlsZWQnKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVUb2tlbkxlbmd0aChtb2RlbElkOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bnVtYmVyPiB7XG5cblx0XHRjb25zdCBkYXRhID0gdGhpcy5fbG9jYWxNb2RlbHMuZ2V0KG1vZGVsSWQpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhyb3cgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxFcnJvci5Ob3RGb3VuZChgTGFuZ3VhZ2UgbW9kZWwgJyR7bW9kZWxJZH0nIGlzIHVua25vd24uYCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9sYW5ndWFnZU1vZGVsUHJvdmlkZXJzLmdldChkYXRhLm1ldGFkYXRhLnZlbmRvcik/LnByb3ZpZGVyLnByb3ZpZGVUb2tlbkNvdW50KGRhdGEuaW5mbywgdmFsdWUsIHRva2VuKSA/PyAwO1xuXHRcdC8vIHJldHVybiB0aGlzLl9wcm94eS4kY291bnRUb2tlbnMobGFuZ3VhZ2VNb2RlbElkLCAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdHlwZUNvbnZlcnQuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMi5mcm9tKHZhbHVlKSksIHRva2VuKTtcblx0fVxuXG5cdCR1cGRhdGVNb2RlbEFjY2Vzc2xpc3QoZGF0YTogeyBmcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyOyB0bzogRXh0ZW5zaW9uSWRlbnRpZmllcjsgZW5hYmxlZDogYm9vbGVhbiB9W10pOiB2b2lkIHtcblx0XHRjb25zdCB1cGRhdGVkID0gbmV3IEFycmF5PHsgZnJvbTogRXh0ZW5zaW9uSWRlbnRpZmllcjsgdG86IEV4dGVuc2lvbklkZW50aWZpZXIgfT4oKTtcblx0XHRmb3IgKGNvbnN0IHsgZnJvbSwgdG8sIGVuYWJsZWQgfSBvZiBkYXRhKSB7XG5cdFx0XHRjb25zdCBzZXQgPSB0aGlzLl9tb2RlbEFjY2Vzc0xpc3QuZ2V0KGZyb20pID8/IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyU2V0KCk7XG5cdFx0XHRjb25zdCBvbGRWYWx1ZSA9IHNldC5oYXModG8pO1xuXHRcdFx0aWYgKG9sZFZhbHVlICE9PSBlbmFibGVkKSB7XG5cdFx0XHRcdGlmIChlbmFibGVkKSB7XG5cdFx0XHRcdFx0c2V0LmFkZCh0byk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2V0LmRlbGV0ZSh0byk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbW9kZWxBY2Nlc3NMaXN0LnNldChmcm9tLCBzZXQpO1xuXHRcdFx0XHRjb25zdCBuZXdJdGVtID0geyBmcm9tLCB0byB9O1xuXHRcdFx0XHR1cGRhdGVkLnB1c2gobmV3SXRlbSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxBY2Nlc3MuZmlyZShuZXdJdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUFjY2Vzc0luZm9ybWF0aW9uRXh0ZW5zaW9ucyA9IG5ldyBTZXQ8UmVhZG9ubHk8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPj4oKTtcblxuXHRjcmVhdGVMYW5ndWFnZU1vZGVsQWNjZXNzSW5mb3JtYXRpb24oZnJvbTogUmVhZG9ubHk8SUV4dGVuc2lvbkRlc2NyaXB0aW9uPik6IHZzY29kZS5MYW5ndWFnZU1vZGVsQWNjZXNzSW5mb3JtYXRpb24ge1xuXG5cdFx0dGhpcy5fbGFuZ3VhZ2VBY2Nlc3NJbmZvcm1hdGlvbkV4dGVuc2lvbnMuYWRkKGZyb20pO1xuXG5cdFx0Ly8gY29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y29uc3QgX29uRGlkQ2hhbmdlQWNjZXNzID0gRXZlbnQuc2lnbmFsKEV2ZW50LmZpbHRlcih0aGlzLl9vbkRpZENoYW5nZU1vZGVsQWNjZXNzLmV2ZW50LCBlID0+IEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuZnJvbSwgZnJvbS5pZGVudGlmaWVyKSkpO1xuXHRcdGNvbnN0IF9vbkRpZEFkZFJlbW92ZSA9IEV2ZW50LnNpZ25hbCh0aGlzLl9vbkRpZENoYW5nZVByb3ZpZGVycy5ldmVudCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Z2V0IG9uRGlkQ2hhbmdlKCkge1xuXHRcdFx0XHRyZXR1cm4gRXZlbnQuYW55KF9vbkRpZENoYW5nZUFjY2VzcywgX29uRGlkQWRkUmVtb3ZlKTtcblx0XHRcdH0sXG5cdFx0XHRjYW5TZW5kUmVxdWVzdChjaGF0OiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXQpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdC8vIFRPRE8gQGxyYW1vczE1IC0gRml4XG5cblx0XHRcdFx0Ly8gbGV0IG1ldGFkYXRhOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBvdXQ6IGZvciAoY29uc3QgW18sIHZhbHVlXSBvZiB0aGF0Ll9hbGxMYW5ndWFnZU1vZGVsRGF0YSkge1xuXHRcdFx0XHQvLyBcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIHZhbHVlLmFwaU9iamVjdHMudmFsdWVzKCkpIHtcblx0XHRcdFx0Ly8gXHRcdGlmIChjYW5kaWRhdGUgPT09IGNoYXQpIHtcblx0XHRcdFx0Ly8gXHRcdFx0bWV0YWRhdGEgPSB2YWx1ZS5tZXRhZGF0YTtcblx0XHRcdFx0Ly8gXHRcdFx0YnJlYWsgb3V0O1xuXHRcdFx0XHQvLyBcdFx0fVxuXHRcdFx0XHQvLyBcdH1cblx0XHRcdFx0Ly8gfVxuXHRcdFx0XHQvLyBpZiAoIW1ldGFkYXRhKSB7XG5cdFx0XHRcdC8vIFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0Ly8gfVxuXHRcdFx0XHQvLyBpZiAoIXRoYXQuX2lzVXNpbmdBdXRoKGZyb20uaWRlbnRpZmllciwgbWV0YWRhdGEpKSB7XG5cdFx0XHRcdC8vIFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdC8vIH1cblxuXHRcdFx0XHQvLyBjb25zdCBsaXN0ID0gdGhhdC5fbW9kZWxBY2Nlc3NMaXN0LmdldChmcm9tLmlkZW50aWZpZXIpO1xuXHRcdFx0XHQvLyBpZiAoIWxpc3QpIHtcblx0XHRcdFx0Ly8gXHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyB9XG5cdFx0XHRcdC8vIHJldHVybiBsaXN0LmhhcyhtZXRhZGF0YS5leHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRmaWxlSXNJZ25vcmVkKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB1cmk6IHZzY29kZS5VcmksIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50QWRkaXRpb25zJyk7XG5cblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuJGZpbGVJc0lnbm9yZWQodXJpLCB0b2tlbik7XG5cdH1cblxuXHRnZXQgaXNNb2RlbFByb3h5QXZhaWxhYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2xhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyO1xuXHR9XG5cblx0YXN5bmMgZ2V0TW9kZWxQcm94eShleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbik6IFByb21pc2U8dnNjb2RlLkxhbmd1YWdlTW9kZWxQcm94eT4ge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2xhbmd1YWdlTW9kZWxQcm94eScpO1xuXG5cdFx0aWYgKCF0aGlzLl9sYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0xhbmd1YWdlTW9kZWxQcm94eV0gTm8gTGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXIgcmVnaXN0ZXJlZCcpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBsYW5ndWFnZSBtb2RlbCBwcm94eSBwcm92aWRlciBpcyByZWdpc3RlcmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RpbmdFeHRlbnNpb25JZCA9IEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uLmlkZW50aWZpZXIpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5fbGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXIucHJvdmlkZU1vZGVsUHJveHkocmVxdWVzdGluZ0V4dGVuc2lvbklkLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMYW5ndWFnZU1vZGVsUHJveHldIFByb3ZpZGVyIHJldHVybmVkIG5vIHByb3h5IGZvciAke3JlcXVlc3RpbmdFeHRlbnNpb25JZH1gKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMYW5ndWFnZSBtb2RlbCBwcm94eSBpcyBub3QgYXZhaWxhYmxlLicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtMYW5ndWFnZU1vZGVsUHJveHldIFByb3ZpZGVyIGZhaWxlZCB0byByZXR1cm4gcHJveHkgZm9yICR7cmVxdWVzdGluZ0V4dGVuc2lvbklkfWAsIGVycik7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJGlzRmlsZUlnbm9yZWQoaGFuZGxlOiBudW1iZXIsIHVyaTogVXJpQ29tcG9uZW50cywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9pZ25vcmVkRmlsZVByb3ZpZGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlUHJvdmlkZXInKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVGaWxlSWdub3JlZChVUkkucmV2aXZlKHVyaSksIHRva2VuKSkgPz8gZmFsc2U7XG5cdH1cblxuXHRyZWdpc3Rlcklnbm9yZWRGaWxlUHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVyOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlUHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXG5cdFx0Y29uc3QgaGFuZGxlID0gRXh0SG9zdExhbmd1YWdlTW9kZWxzLl9pZFBvb2wrKztcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJGaWxlSWdub3JlUHJvdmlkZXIoaGFuZGxlKTtcblx0XHR0aGlzLl9pZ25vcmVkRmlsZVByb3ZpZGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlckZpbGVJZ25vcmVQcm92aWRlcihoYW5kbGUpO1xuXHRcdFx0dGhpcy5faWdub3JlZEZpbGVQcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRyZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBwcm92aWRlcjogdnNjb2RlLkxhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKTtcblxuXHRcdHRoaXMuX2xhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5LmZpcmUoKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9sYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlciA9PT0gcHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxQcm94eUF2YWlsYWJpbGl0eS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx1QkFBdUIscUJBQXFCLHdCQUF3QjtBQUM3RSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBMEIsZ0NBQWdDLHVDQUF1QztBQUNqRyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQTRCLG9CQUFvQjtBQUV6RCxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLHdCQUF3Qiw4QkFBcUQ7QUFDM0csU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBZ007QUFDek0sU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx5QkFBeUIsNEJBQTRCO0FBQzlELFNBQVMscUNBQXFDO0FBQzlDLFNBQXFDLG1CQUFrRDtBQUN2RixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQjtBQUNuQyxZQUFZLGlCQUFpQjtBQUM3QixZQUFZLGtCQUFrQjtBQUM5QixTQUFTLHlCQUF5QjtBQUkzQixNQUFNLHlCQUF5QixnQkFBd0Msd0JB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QXdCLG9CQUFvQixNQUFNLFVBQVUsVUFBVTtBQUM1RSxRQUFJO0FBQ0gsWUFBTSxTQUFTLE1BQU0sUUFBUSxRQUFRLEtBQUssNEJBQTRCLGtCQUFrQix1QkFBdUIsa0JBQWtCLElBQUksQ0FBQztBQUN0SSxVQUFJLENBQUMsUUFBUTtBQUNaLGFBQUssWUFBWSxLQUFLLHVEQUF1RCxxQkFBcUIsRUFBRTtBQUNwRyxjQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFBQSxNQUN6RDtBQUNBLGFBQU87QUFBQSxJQUNSLFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxNQUFNLDREQUE0RCxxQkFBcUIsSUFBSSxHQUFHO0FBQy9HLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxlQUFlLFFBQWdCLEtBQW9CLE9BQTRDO0FBQ3BHLFVBQU0sV0FBVyxLQUFLLHNCQUFzQixJQUFJLE1BQU07QUFDdEQsUUFBSSxDQUFDLFVBQVU7QUFDZCxZQUFNLElBQUksTUFBTSwwQ0FBMEM7QUFBQSxJQUMzRDtBQUVBLFdBQVEsTUFBTSxTQUFTLG1CQUFtQixJQUFJLE9BQU8sR0FBRyxHQUFHLEtBQUssS0FBTTtBQUFBLEVBQ3ZFO0FBQUEsRUFFQSw0QkFBNEIsV0FBa0MsVUFBc0U7QUFDbkksNEJBQXdCLFdBQVcsd0JBQXdCO0FBRTNELFVBQU0sU0FBUyxzQkFBc0I7QUFDckMsU0FBSyxPQUFPLDRCQUE0QixNQUFNO0FBQzlDLFNBQUssc0JBQXNCLElBQUksUUFBUSxRQUFRO0FBQy9DLFdBQU8sYUFBYSxNQUFNO0FBQ3pCLFdBQUssT0FBTyw4QkFBOEIsTUFBTTtBQUNoRCxXQUFLLHNCQUFzQixPQUFPLE1BQU07QUFBQSxJQUN6QyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsbUNBQW1DLFdBQWtDLFVBQWdFO0FBQ3BJLDRCQUF3QixXQUFXLHdCQUF3QjtBQUUzRCxTQUFLLDhCQUE4QjtBQUNuQyxTQUFLLG1DQUFtQyxLQUFLO0FBQzdDLFdBQU8sYUFBYSxNQUFNO0FBQ3pCLFVBQUksS0FBSyxnQ0FBZ0MsVUFBVTtBQUNsRCxhQUFLLDhCQUE4QjtBQUNuQyxhQUFLLG1DQUFtQyxLQUFLO0FBQUEsTUFDOUM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFqcEJhLHNCQUlHLFVBQVU7QUFKYix3QkFBTjtBQUFBLEVBdUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXpCVTsiLAogICJuYW1lcyI6IFtdCn0K
