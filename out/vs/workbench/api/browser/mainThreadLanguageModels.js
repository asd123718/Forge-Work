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
import { AsyncIterableSource, DeferredPromise } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { CancellationError, transformErrorForSerialization, transformErrorFromSerialization } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { equalSets } from "../../../base/common/collections.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { resizeImage } from "../../contrib/chat/browser/chatImageUtils.js";
import { ILanguageModelIgnoredFilesService } from "../../contrib/chat/common/ignoredFiles.js";
import { ILanguageModelsService } from "../../contrib/chat/common/languageModels.js";
import { IAuthenticationAccessService } from "../../services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from "../../services/authentication/common/authentication.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { LanguageModelError } from "../common/extHostTypes.js";
class RequestCancellationTokenSource extends Disposable {
  constructor(parent, onCancellationRequested) {
    super();
    this._source = this._register(new CancellationTokenSource(parent));
    if (onCancellationRequested) {
      this._register(this._source.token.onCancellationRequested(onCancellationRequested));
    }
  }
  get token() {
    return this._source.token;
  }
  cancel() {
    this._source.cancel();
  }
}
let MainThreadLanguageModels = class {
  constructor(extHostContext, _chatProviderService, _logService, _productService, _authenticationService, _authenticationAccessService, _extensionService, _ignoredFilesService) {
    this._chatProviderService = _chatProviderService;
    this._logService = _logService;
    this._productService = _productService;
    this._authenticationService = _authenticationService;
    this._authenticationAccessService = _authenticationAccessService;
    this._extensionService = _extensionService;
    this._ignoredFilesService = _ignoredFilesService;
    this._store = new DisposableStore();
    this._providerRegistrations = new DisposableMap();
    this._lmProviderChange = new Emitter();
    this._pendingProgress = /* @__PURE__ */ new Map();
    this._pendingCancelCTS = new DisposableMap();
    this._ignoredFileProviderRegistrations = new DisposableMap();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);
    let lastModelIds = new Set(this._chatProviderService.getLanguageModelIds());
    this._store.add(this._chatProviderService.onDidChangeLanguageModels(() => {
      const currentModelIds = new Set(this._chatProviderService.getLanguageModelIds());
      if (equalSets(lastModelIds, currentModelIds)) {
        return;
      }
      lastModelIds = currentModelIds;
      this._proxy.$onChatModelsChange();
    }));
  }
  dispose() {
    this._lmProviderChange.dispose();
    this._providerRegistrations.dispose();
    this._pendingProgress.clear();
    this._pendingCancelCTS.dispose();
    this._ignoredFileProviderRegistrations.dispose();
    this._store.dispose();
  }
  $registerLanguageModelProvider(vendor) {
    const disposables = new DisposableStore();
    try {
      disposables.add(this._chatProviderService.registerLanguageModelProvider(vendor, {
        onDidChange: Event.filter(this._lmProviderChange.event, (e) => e.vendor === vendor, disposables),
        provideLanguageModelChatInfo: async (options, token) => {
          const modelsAndIdentifiers = await this._proxy.$provideLanguageModelChatInfo(vendor, options, token);
          const copilotExtensionId = this._productService.defaultChatAgent?.chatExtensionId;
          return modelsAndIdentifiers.map((m) => {
            if (m.metadata.auth) {
              disposables.add(this._registerAuthenticationProvider(m.metadata.extension, m.metadata.auth));
            }
            if (m.metadata.isBYOK !== void 0) {
              return m;
            }
            const isBuiltinCopilot = !!copilotExtensionId && ExtensionIdentifier.equals(m.metadata.extension, copilotExtensionId);
            return { ...m, metadata: { ...m.metadata, isBYOK: !isBuiltinCopilot } };
          });
        },
        sendChatRequest: async (modelId, messages, from, options, token) => {
          const requestId = Math.random() * 1e6 | 0;
          const defer = new DeferredPromise();
          defer.p.catch(() => {
          });
          const stream = new AsyncIterableSource();
          try {
            this._pendingProgress.set(requestId, { defer, stream });
            const cts = new RequestCancellationTokenSource(token, () => {
              this._proxy.$cancelLanguageModelChatRequest(requestId);
            });
            this._pendingCancelCTS.set(requestId, cts);
            await Promise.all(
              messages.flatMap((msg) => msg.content).filter((part) => part.type === "image_url").map(async (part) => {
                part.value.data = VSBuffer.wrap(await resizeImage(part.value.data.buffer));
              })
            );
            if (token.isCancellationRequested) {
              this._pendingProgress.delete(requestId);
              this._pendingCancelCTS.deleteAndDispose(requestId);
              const err = new CancellationError();
              stream.reject(err);
              defer.error(err);
              return {
                result: defer.p,
                stream: stream.asyncIterable
              };
            }
            await this._proxy.$startChatRequest(modelId, requestId, from, new SerializableObjectWithBuffers(messages), options, cts.token);
          } catch (err) {
            this._pendingProgress.delete(requestId);
            this._pendingCancelCTS.deleteAndDispose(requestId);
            throw err;
          }
          return {
            result: defer.p,
            stream: stream.asyncIterable
          };
        },
        provideTokenCount: (modelId, str, token) => {
          return this._proxy.$provideTokenLength(modelId, str, token);
        }
      }));
      this._providerRegistrations.set(vendor, disposables);
    } catch (err) {
      disposables.dispose();
      throw err;
    }
  }
  $onLMProviderChange(vendor) {
    this._lmProviderChange.fire({ vendor });
  }
  async $reportResponsePart(requestId, chunk) {
    const data = this._pendingProgress.get(requestId);
    this._logService.trace("[LM] report response PART", Boolean(data), requestId, chunk);
    if (data) {
      data.stream.emitOne(chunk.value);
    }
  }
  async $reportResponseDone(requestId, err) {
    const data = this._pendingProgress.get(requestId);
    this._logService.trace("[LM] report response DONE", Boolean(data), requestId, err);
    if (data) {
      this._pendingProgress.delete(requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      if (err) {
        const error = LanguageModelError.tryDeserialize(err) ?? transformErrorFromSerialization(err);
        data.stream.reject(error);
        data.defer.error(error);
      } else {
        data.stream.resolve();
        data.defer.complete(void 0);
      }
    }
  }
  $unregisterProvider(vendor) {
    this._providerRegistrations.deleteAndDispose(vendor);
  }
  $cancelLanguageModelChatRequest(requestId) {
    this._pendingCancelCTS.get(requestId)?.cancel();
  }
  $selectChatModels(selector) {
    return this._chatProviderService.selectLanguageModels(selector);
  }
  async $tryStartChatRequest(extension, modelIdentifier, requestId, messages, options, token) {
    this._logService.trace("[CHAT] request STARTED", extension.value, requestId);
    const cts = new RequestCancellationTokenSource(token);
    this._pendingCancelCTS.set(requestId, cts);
    let response;
    try {
      response = await this._chatProviderService.sendChatRequest(modelIdentifier, extension, messages.value, options, cts.token);
    } catch (err) {
      this._logService.error("[CHAT] request FAILED", extension.value, requestId, err);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      throw err;
    }
    const streaming = (async () => {
      try {
        for await (const part of response.stream) {
          this._logService.trace("[CHAT] request PART", extension.value, requestId, part);
          await this._proxy.$acceptResponsePart(requestId, new SerializableObjectWithBuffers(part));
        }
        this._logService.trace("[CHAT] request DONE", extension.value, requestId);
      } catch (err) {
        this._logService.error("[CHAT] extension request ERRORED in STREAM", toErrorMessage(err, true), extension.value, requestId);
        this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
      }
    })();
    Promise.allSettled([response.result, streaming]).then(() => {
      this._logService.debug("[CHAT] extension request DONE", extension.value, requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$acceptResponseDone(requestId, void 0);
    }, (err) => {
      this._logService.error("[CHAT] extension request ERRORED", toErrorMessage(err, true), extension.value, requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
    });
  }
  $countTokens(modelId, value, token) {
    return this._chatProviderService.computeTokenLength(modelId, value, token);
  }
  _registerAuthenticationProvider(extension, auth) {
    const authProviderId = INTERNAL_AUTH_PROVIDER_PREFIX + extension.value;
    if (this._authenticationService.getProviderIds().includes(authProviderId)) {
      return Disposable.None;
    }
    const accountLabel = auth.accountLabel ?? localize("languageModelsAccountId", "Language Models");
    const disposables = new DisposableStore();
    const provider = new LanguageModelAccessAuthProvider(authProviderId, auth.providerLabel, accountLabel);
    this._authenticationService.registerAuthenticationProvider(authProviderId, provider);
    disposables.add(toDisposable(() => {
      this._authenticationService.unregisterAuthenticationProvider(authProviderId);
      provider.dispose();
    }));
    disposables.add(this._authenticationAccessService.onDidChangeExtensionSessionAccess(async (e) => {
      const allowedExtensions = this._authenticationAccessService.readAllowedExtensions(authProviderId, accountLabel);
      const accessList = [];
      for (const allowedExtension of allowedExtensions) {
        const from = await this._extensionService.getExtension(allowedExtension.id);
        if (from) {
          accessList.push({
            from: from.identifier,
            to: extension,
            enabled: allowedExtension.allowed ?? true
          });
        }
      }
      this._proxy.$updateModelAccesslist(accessList);
    }));
    return disposables;
  }
  $fileIsIgnored(uri, token) {
    return this._ignoredFilesService.fileIsIgnored(URI.revive(uri), token);
  }
  $registerFileIgnoreProvider(handle) {
    this._ignoredFileProviderRegistrations.set(handle, this._ignoredFilesService.registerIgnoredFileProvider({
      isFileIgnored: async (uri, token) => this._proxy.$isFileIgnored(handle, uri, token)
    }));
  }
  $unregisterFileIgnoreProvider(handle) {
    this._ignoredFileProviderRegistrations.deleteAndDispose(handle);
  }
};
MainThreadLanguageModels = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadLanguageModels),
  __decorateParam(1, ILanguageModelsService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IAuthenticationService),
  __decorateParam(5, IAuthenticationAccessService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, ILanguageModelIgnoredFilesService)
], MainThreadLanguageModels);
class LanguageModelAccessAuthProvider {
  constructor(id, label, _accountLabel) {
    this.id = id;
    this.label = label;
    this._accountLabel = _accountLabel;
    this.supportsMultipleAccounts = false;
    // Important for updating the UI
    this._onDidChangeSessions = new Emitter();
    this.onDidChangeSessions = this._onDidChangeSessions.event;
  }
  async getSessions(scopes) {
    if (scopes === void 0 && !this._session) {
      return [];
    }
    if (this._session) {
      return [this._session];
    }
    return [await this.createSession(scopes || [])];
  }
  async createSession(scopes) {
    this._session = this._createFakeSession(scopes);
    this._onDidChangeSessions.fire({ added: [this._session], changed: [], removed: [] });
    return this._session;
  }
  removeSession(sessionId) {
    if (this._session) {
      this._onDidChangeSessions.fire({ added: [], changed: [], removed: [this._session] });
      this._session = void 0;
    }
    return Promise.resolve();
  }
  confirmation(extensionName, _recreatingSession) {
    return localize("confirmLanguageModelAccess", "The extension '{0}' wants to access the language models provided by {1}.", extensionName, this.label);
  }
  _createFakeSession(scopes) {
    return {
      id: "fake-session",
      account: {
        id: this.id,
        label: this._accountLabel
      },
      accessToken: "fake-access-token",
      scopes
    };
  }
  dispose() {
    this._onDidChangeSessions.dispose();
  }
}
export {
  MainThreadLanguageModels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcYnJvd3NlclxcbWFpblRocmVhZExhbmd1YWdlTW9kZWxzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVNvdXJjZSwgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yLCBTZXJpYWxpemVkRXJyb3IsIHRyYW5zZm9ybUVycm9yRm9yU2VyaWFsaXphdGlvbiwgdHJhbnNmb3JtRXJyb3JGcm9tU2VyaWFsaXphdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVxdWFsU2V0cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXNpemVJbWFnZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRJbWFnZVV0aWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vaWdub3JlZEZpbGVzLmpzJztcbmltcG9ydCB7IElDaGF0TWVzc2FnZSwgSUNoYXRSZXNwb25zZVBhcnQsIElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlLCBJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3RvciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2Jyb3dzZXIvYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiwgQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50LCBJQXV0aGVudGljYXRpb25Qcm92aWRlciwgSUF1dGhlbnRpY2F0aW9uU2VydmljZSwgSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVggfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RDb250ZXh0LCBleHRIb3N0TmFtZWRDdXN0b21lciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHNTaGFwZSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRMYW5ndWFnZU1vZGVsc1NoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbEVycm9yIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3RUeXBlcy5qcyc7XG5cbmNsYXNzIFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U7XG5cblx0Y29uc3RydWN0b3IocGFyZW50OiBDYW5jZWxsYXRpb25Ub2tlbiwgb25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQ/OiAoKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zb3VyY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UocGFyZW50KSk7XG5cdFx0aWYgKG9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zb3VyY2UudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQob25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQpKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgdG9rZW4oKTogQ2FuY2VsbGF0aW9uVG9rZW4ge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UudG9rZW47XG5cdH1cblxuXHRjYW5jZWwoKTogdm9pZCB7XG5cdFx0dGhpcy5fc291cmNlLmNhbmNlbCgpO1xuXHR9XG59XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzIGltcGxlbWVudHMgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzU2hhcGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyUmVnaXN0cmF0aW9ucyA9IG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbG1Qcm92aWRlckNoYW5nZSA9IG5ldyBFbWl0dGVyPHsgdmVuZG9yOiBzdHJpbmcgfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Byb2dyZXNzID0gbmV3IE1hcDxudW1iZXIsIHsgZGVmZXI6IERlZmVycmVkUHJvbWlzZTx1bmtub3duPjsgc3RyZWFtOiBBc3luY0l0ZXJhYmxlU291cmNlPElDaGF0UmVzcG9uc2VQYXJ0IHwgSUNoYXRSZXNwb25zZVBhcnRbXT4gfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NhbmNlbENUUyA9IG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlciwgUmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pZ25vcmVkRmlsZVByb3ZpZGVyUmVnaXN0cmF0aW9ucyA9IG5ldyBEaXNwb3NhYmxlTWFwPG51bWJlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRQcm92aWRlclNlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlOiBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2lnbm9yZWRGaWxlc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBleHRIb3N0Q29udGV4dC5nZXRQcm94eShFeHRIb3N0Q29udGV4dC5FeHRIb3N0Q2hhdFByb3ZpZGVyKTtcblxuXHRcdC8vIEJyaWRnZSB3b3JrYmVuY2gtc2lkZSBsYW5ndWFnZS1tb2RlbCBjaGFuZ2VzIHRvIGV4dGVuc2lvbnMgdmlhIGB2c2NvZGUubG0ub25EaWRDaGFuZ2VDaGF0TW9kZWxzYC5cblx0XHQvLyBPbmx5IGZvcndhcmQgd2hlbiB0aGUgc2V0IG9mIG1vZGVsIGlkZW50aWZpZXJzIGNoYW5nZXMuIFByb3ZpZGVycyAoZS5nLiBCWU9LIHV0aWxpdHkgYWxpYXNlcykgY2FuXG5cdFx0Ly8gcmUtcHVibGlzaCBtb2RlbHMgd2l0aCBtZXRhZGF0YS1vbmx5IGRpZmZzIG1hbnkgdGltZXMgcGVyIHNlY29uZDsgZmlyaW5nIG9uIHRob3NlIGxldHMgbGlzdGVuZXJzXG5cdFx0Ly8gdGhhdCByZS1yZXNvbHZlIG1vZGVscyAoZS5nLiBgc2VsZWN0Q2hhdE1vZGVsc2ApIHNwaW4gYW4gdW5ib3VuZGVkIENQVS1waW5uaW5nIGZlZWRiYWNrIGxvb3AuXG5cdFx0bGV0IGxhc3RNb2RlbElkcyA9IG5ldyBTZXQodGhpcy5fY2hhdFByb3ZpZGVyU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCkpO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0aGlzLl9jaGF0UHJvdmlkZXJTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudE1vZGVsSWRzID0gbmV3IFNldCh0aGlzLl9jaGF0UHJvdmlkZXJTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKSk7XG5cdFx0XHRpZiAoZXF1YWxTZXRzKGxhc3RNb2RlbElkcywgY3VycmVudE1vZGVsSWRzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsYXN0TW9kZWxJZHMgPSBjdXJyZW50TW9kZWxJZHM7XG5cdFx0XHR0aGlzLl9wcm94eS4kb25DaGF0TW9kZWxzQ2hhbmdlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9sbVByb3ZpZGVyQ2hhbmdlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wcm92aWRlclJlZ2lzdHJhdGlvbnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3BlbmRpbmdQcm9ncmVzcy5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2lnbm9yZWRGaWxlUHJvdmlkZXJSZWdpc3RyYXRpb25zLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXHQkcmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NoYXRQcm92aWRlclNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5maWx0ZXIodGhpcy5fbG1Qcm92aWRlckNoYW5nZS5ldmVudCwgZSA9PiBlLnZlbmRvciA9PT0gdmVuZG9yLCBkaXNwb3NhYmxlcykgYXMgdW5rbm93biBhcyBFdmVudDx2b2lkPixcblx0XHRcdFx0cHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbzogYXN5bmMgKG9wdGlvbnMsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxzQW5kSWRlbnRpZmllcnMgPSBhd2FpdCB0aGlzLl9wcm94eS4kcHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbyh2ZW5kb3IsIG9wdGlvbnMsIHRva2VuKTtcblx0XHRcdFx0XHRjb25zdCBjb3BpbG90RXh0ZW5zaW9uSWQgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQ7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGVsc0FuZElkZW50aWZpZXJzLm1hcChtID0+IHtcblx0XHRcdFx0XHRcdGlmIChtLm1ldGFkYXRhLmF1dGgpIHtcblx0XHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3JlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihtLm1ldGFkYXRhLmV4dGVuc2lvbiwgbS5tZXRhZGF0YS5hdXRoKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobS5tZXRhZGF0YS5pc0JZT0sgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbTsgLy8gcHJvdmlkZXIgZGVjbGFyZWQgaXQgZXhwbGljaXRseVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gQW55IGNvbnRyaWJ1dGVkIG1vZGVsIHRoYXQgaXNuJ3QgZnJvbSB0aGUgYnVpbHQtaW4gQ29waWxvdCBjaGF0IGV4dGVuc2lvbiBpcyBCWU9LLlxuXHRcdFx0XHRcdFx0Y29uc3QgaXNCdWlsdGluQ29waWxvdCA9ICEhY29waWxvdEV4dGVuc2lvbklkICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKG0ubWV0YWRhdGEuZXh0ZW5zaW9uLCBjb3BpbG90RXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgLi4ubSwgbWV0YWRhdGE6IHsgLi4ubS5tZXRhZGF0YSwgaXNCWU9LOiAhaXNCdWlsdGluQ29waWxvdCB9IH07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNlbmRDaGF0UmVxdWVzdDogYXN5bmMgKG1vZGVsSWQsIG1lc3NhZ2VzLCBmcm9tLCBvcHRpb25zLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RJZCA9IChNYXRoLnJhbmRvbSgpICogMWU2KSB8IDA7XG5cdFx0XHRcdFx0Y29uc3QgZGVmZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHVua25vd24+KCk7XG5cdFx0XHRcdFx0Ly8gYHJlc3VsdGAgbWlycm9ycyB0aGUgc3RyZWFtJ3MgdGVybWluYWwgc3RhdHVzIGFuZCBpcyByZWplY3RlZCB0b2dldGhlciB3aXRoIHRoZVxuXHRcdFx0XHRcdC8vIHN0cmVhbSBvbiBlcnJvciAoc2VlIGAkcmVwb3J0UmVzcG9uc2VEb25lYCkuIENvbnN1bWVycyB0aGF0IHJlYWQgdGhlIHN0cmVhbSBsZXQgdGhlXG5cdFx0XHRcdFx0Ly8gZm9yLWF3YWl0IHRocm93IGFuZCBuZXZlciByZWFjaCBgYXdhaXQgcmVzcG9uc2UucmVzdWx0YCwgbGVhdmluZyBpdHMgcmVqZWN0aW9uIChlLmcuXG5cdFx0XHRcdFx0Ly8gYW4gZXhwZWN0ZWQgYENoYXRRdW90YUV4Y2VlZGVkYCkgdW5vYnNlcnZlZC4gQXR0YWNoIGEgbm8tb3AgaGFuZGxlciBzbyBpdCBjYW5ub3Rcblx0XHRcdFx0XHQvLyBzdXJmYWNlIGFzIGFuIHVuaGFuZGxlZCByZWplY3Rpb247IHJlYWwgYXdhaXRlcnMgb2YgYHJlc3VsdGAgc3RpbGwgc2VlIHRoZSBlcnJvci5cblx0XHRcdFx0XHRkZWZlci5wLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RyZWFtID0gbmV3IEFzeW5jSXRlcmFibGVTb3VyY2U8SUNoYXRSZXNwb25zZVBhcnQgfCBJQ2hhdFJlc3BvbnNlUGFydFtdPigpO1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdQcm9ncmVzcy5zZXQocmVxdWVzdElkLCB7IGRlZmVyLCBzdHJlYW0gfSk7XG5cblx0XHRcdFx0XHRcdGNvbnN0IGN0cyA9IG5ldyBSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4sICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdChyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLnNldChyZXF1ZXN0SWQsIGN0cyk7XG5cblx0XHRcdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlcy5mbGF0TWFwKG1zZyA9PiBtc2cuY29udGVudClcblx0XHRcdFx0XHRcdFx0XHQuZmlsdGVyKHBhcnQgPT4gcGFydC50eXBlID09PSAnaW1hZ2VfdXJsJylcblx0XHRcdFx0XHRcdFx0XHQubWFwKGFzeW5jIHBhcnQgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0cGFydC52YWx1ZS5kYXRhID0gVlNCdWZmZXIud3JhcChhd2FpdCByZXNpemVJbWFnZShwYXJ0LnZhbHVlLmRhdGEuYnVmZmVyKSk7XG5cdFx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb2dyZXNzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLmRlbGV0ZUFuZERpc3Bvc2UocmVxdWVzdElkKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXJyID0gbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHRcdFx0XHRcdHN0cmVhbS5yZWplY3QoZXJyKTtcblx0XHRcdFx0XHRcdFx0ZGVmZXIuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQ6IGRlZmVyLnAsXG5cdFx0XHRcdFx0XHRcdFx0c3RyZWFtOiBzdHJlYW0uYXN5bmNJdGVyYWJsZVxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRzdGFydENoYXRSZXF1ZXN0KG1vZGVsSWQsIHJlcXVlc3RJZCwgZnJvbSwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKG1lc3NhZ2VzKSwgb3B0aW9ucywgY3RzLnRva2VuKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdQcm9ncmVzcy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRyZXN1bHQ6IGRlZmVyLnAsXG5cdFx0XHRcdFx0XHRzdHJlYW06IHN0cmVhbS5hc3luY0l0ZXJhYmxlXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0UmVzcG9uc2U7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb3ZpZGVUb2tlbkNvdW50OiAobW9kZWxJZCwgc3RyLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9wcm94eS4kcHJvdmlkZVRva2VuTGVuZ3RoKG1vZGVsSWQsIHN0ciwgdG9rZW4pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJSZWdpc3RyYXRpb25zLnNldCh2ZW5kb3IsIGRpc3Bvc2FibGVzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHQkb25MTVByb3ZpZGVyQ2hhbmdlKHZlbmRvcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbG1Qcm92aWRlckNoYW5nZS5maXJlKHsgdmVuZG9yIH0pO1xuXHR9XG5cblx0YXN5bmMgJHJlcG9ydFJlc3BvbnNlUGFydChyZXF1ZXN0SWQ6IG51bWJlciwgY2h1bms6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElDaGF0UmVzcG9uc2VQYXJ0IHwgSUNoYXRSZXNwb25zZVBhcnRbXT4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fcGVuZGluZ1Byb2dyZXNzLmdldChyZXF1ZXN0SWQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tMTV0gcmVwb3J0IHJlc3BvbnNlIFBBUlQnLCBCb29sZWFuKGRhdGEpLCByZXF1ZXN0SWQsIGNodW5rKTtcblx0XHRpZiAoZGF0YSkge1xuXHRcdFx0ZGF0YS5zdHJlYW0uZW1pdE9uZShjaHVuay52YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgJHJlcG9ydFJlc3BvbnNlRG9uZShyZXF1ZXN0SWQ6IG51bWJlciwgZXJyOiBTZXJpYWxpemVkRXJyb3IgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fcGVuZGluZ1Byb2dyZXNzLmdldChyZXF1ZXN0SWQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tMTV0gcmVwb3J0IHJlc3BvbnNlIERPTkUnLCBCb29sZWFuKGRhdGEpLCByZXF1ZXN0SWQsIGVycik7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdQcm9ncmVzcy5kZWxldGUocmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0aWYgKGVycikge1xuXHRcdFx0XHRjb25zdCBlcnJvciA9IExhbmd1YWdlTW9kZWxFcnJvci50cnlEZXNlcmlhbGl6ZShlcnIpID8/IHRyYW5zZm9ybUVycm9yRnJvbVNlcmlhbGl6YXRpb24oZXJyKTtcblx0XHRcdFx0ZGF0YS5zdHJlYW0ucmVqZWN0KGVycm9yKTtcblx0XHRcdFx0ZGF0YS5kZWZlci5lcnJvcihlcnJvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkYXRhLnN0cmVhbS5yZXNvbHZlKCk7XG5cdFx0XHRcdGRhdGEuZGVmZXIuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQkdW5yZWdpc3RlclByb3ZpZGVyKHZlbmRvcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvdmlkZXJSZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UodmVuZG9yKTtcblx0fVxuXG5cdCRjYW5jZWxMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3QocmVxdWVzdElkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLmdldChyZXF1ZXN0SWQpPy5jYW5jZWwoKTtcblx0fVxuXG5cdCRzZWxlY3RDaGF0TW9kZWxzKHNlbGVjdG9yOiBJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3Rvcik6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdFByb3ZpZGVyU2VydmljZS5zZWxlY3RMYW5ndWFnZU1vZGVscyhzZWxlY3Rvcik7XG5cdH1cblxuXHRhc3luYyAkdHJ5U3RhcnRDaGF0UmVxdWVzdChleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIsIG1vZGVsSWRlbnRpZmllcjogc3RyaW5nLCByZXF1ZXN0SWQ6IG51bWJlciwgbWVzc2FnZXM6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElDaGF0TWVzc2FnZVtdPiwgb3B0aW9uczoge30sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tDSEFUXSByZXF1ZXN0IFNUQVJURUQnLCBleHRlbnNpb24udmFsdWUsIHJlcXVlc3RJZCk7XG5cblx0XHQvLyBDcmVhdGUgYSBsb2NhbCBDVFMgc28gY2FuY2VsbGF0aW9uIGNhbiBiZSBzaWduYWxsZWQgdmlhXG5cdFx0Ly8gJGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdCBldmVuIGFmdGVyIHRoZSBSUEMgY2FuY2VsXG5cdFx0Ly8gaGFuZGxlciBmb3IgdGhlIG9yaWdpbmFsIHRva2VuIGhhcyBiZWVuIHJlbW92ZWQuXG5cdFx0Y29uc3QgY3RzID0gbmV3IFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5zZXQocmVxdWVzdElkLCBjdHMpO1xuXG5cdFx0bGV0IHJlc3BvbnNlOiBJTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZTtcblx0XHR0cnkge1xuXHRcdFx0cmVzcG9uc2UgPSBhd2FpdCB0aGlzLl9jaGF0UHJvdmlkZXJTZXJ2aWNlLnNlbmRDaGF0UmVxdWVzdChtb2RlbElkZW50aWZpZXIsIGV4dGVuc2lvbiwgbWVzc2FnZXMudmFsdWUsIG9wdGlvbnMsIGN0cy50b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQ0hBVF0gcmVxdWVzdCBGQUlMRUQnLCBleHRlbnNpb24udmFsdWUsIHJlcXVlc3RJZCwgZXJyKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdC8vICEhISBJTVBPUlRBTlQgISEhXG5cdFx0Ly8gVGhpcyBtZXRob2QgbXVzdCByZXR1cm4gYmVmb3JlIHRoZSByZXNwb25zZSBpcyBkb25lIChoYXMgc3RyZWFtZWQgYWxsIHBhcnRzKVxuXHRcdC8vIGFuZCBiZWNhdXNlIG9mIHRoYXQgd2UgY29uc3VtZSB0aGUgc3RyZWFtIHdpdGhvdXQgYXdhaXRpbmdcblx0XHQvLyAhISEgSU1QT1JUQU5UICEhIVxuXHRcdGNvbnN0IHN0cmVhbWluZyA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmb3IgYXdhaXQgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2Uuc3RyZWFtKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0NIQVRdIHJlcXVlc3QgUEFSVCcsIGV4dGVuc2lvbi52YWx1ZSwgcmVxdWVzdElkLCBwYXJ0KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eS4kYWNjZXB0UmVzcG9uc2VQYXJ0KHJlcXVlc3RJZCwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHBhcnQpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbQ0hBVF0gcmVxdWVzdCBET05FJywgZXh0ZW5zaW9uLnZhbHVlLCByZXF1ZXN0SWQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tDSEFUXSBleHRlbnNpb24gcmVxdWVzdCBFUlJPUkVEIGluIFNUUkVBTScsIHRvRXJyb3JNZXNzYWdlKGVyciwgdHJ1ZSksIGV4dGVuc2lvbi52YWx1ZSwgcmVxdWVzdElkKTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFJlc3BvbnNlRG9uZShyZXF1ZXN0SWQsIHRyYW5zZm9ybUVycm9yRm9yU2VyaWFsaXphdGlvbihlcnIpKTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgcmVzcG9uc2UgaXMgZG9uZSAoc2lnbmFsZWQgdmlhIGl0cyByZXN1bHQpIHdlIHRlbGwgdGhlIEVIXG5cdFx0UHJvbWlzZS5hbGxTZXR0bGVkKFtyZXNwb25zZS5yZXN1bHQsIHN0cmVhbWluZ10pLnRoZW4oKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnW0NIQVRdIGV4dGVuc2lvbiByZXF1ZXN0IERPTkUnLCBleHRlbnNpb24udmFsdWUsIHJlcXVlc3RJZCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLmRlbGV0ZUFuZERpc3Bvc2UocmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRSZXNwb25zZURvbmUocmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQ0hBVF0gZXh0ZW5zaW9uIHJlcXVlc3QgRVJST1JFRCcsIHRvRXJyb3JNZXNzYWdlKGVyciwgdHJ1ZSksIGV4dGVuc2lvbi52YWx1ZSwgcmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFJlc3BvbnNlRG9uZShyZXF1ZXN0SWQsIHRyYW5zZm9ybUVycm9yRm9yU2VyaWFsaXphdGlvbihlcnIpKTtcblx0XHR9KTtcblx0fVxuXG5cblx0JGNvdW50VG9rZW5zKG1vZGVsSWQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IElDaGF0TWVzc2FnZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdFByb3ZpZGVyU2VydmljZS5jb21wdXRlVG9rZW5MZW5ndGgobW9kZWxJZCwgdmFsdWUsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIsIGF1dGg6IHsgcHJvdmlkZXJMYWJlbDogc3RyaW5nOyBhY2NvdW50TGFiZWw/OiBzdHJpbmcgfCB1bmRlZmluZWQgfSk6IElEaXNwb3NhYmxlIHtcblx0XHQvLyBUaGlzIG5lZWRzIHRvIGJlIGRvbmUgaW4gYm90aCBNYWluVGhyZWFkICYgRXh0SG9zdCBDaGF0UHJvdmlkZXJcblx0XHRjb25zdCBhdXRoUHJvdmlkZXJJZCA9IElOVEVSTkFMX0FVVEhfUFJPVklERVJfUFJFRklYICsgZXh0ZW5zaW9uLnZhbHVlO1xuXG5cdFx0Ly8gT25seSByZWdpc3RlciBvbmUgYXV0aCBwcm92aWRlciBwZXIgZXh0ZW5zaW9uXG5cdFx0aWYgKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRQcm92aWRlcklkcygpLmluY2x1ZGVzKGF1dGhQcm92aWRlcklkKSkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY2NvdW50TGFiZWwgPSBhdXRoLmFjY291bnRMYWJlbCA/PyBsb2NhbGl6ZSgnbGFuZ3VhZ2VNb2RlbHNBY2NvdW50SWQnLCAnTGFuZ3VhZ2UgTW9kZWxzJyk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgTGFuZ3VhZ2VNb2RlbEFjY2Vzc0F1dGhQcm92aWRlcihhdXRoUHJvdmlkZXJJZCwgYXV0aC5wcm92aWRlckxhYmVsLCBhY2NvdW50TGFiZWwpO1xuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5yZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoYXV0aFByb3ZpZGVySWQsIHByb3ZpZGVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS51bnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihhdXRoUHJvdmlkZXJJZCk7XG5cdFx0XHRwcm92aWRlci5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25TZXNzaW9uQWNjZXNzKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRjb25zdCBhbGxvd2VkRXh0ZW5zaW9ucyA9IHRoaXMuX2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5yZWFkQWxsb3dlZEV4dGVuc2lvbnMoYXV0aFByb3ZpZGVySWQsIGFjY291bnRMYWJlbCk7XG5cdFx0XHRjb25zdCBhY2Nlc3NMaXN0ID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGFsbG93ZWRFeHRlbnNpb24gb2YgYWxsb3dlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZnJvbSA9IGF3YWl0IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGFsbG93ZWRFeHRlbnNpb24uaWQpO1xuXHRcdFx0XHRpZiAoZnJvbSkge1xuXHRcdFx0XHRcdGFjY2Vzc0xpc3QucHVzaCh7XG5cdFx0XHRcdFx0XHRmcm9tOiBmcm9tLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0XHR0bzogZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdFx0ZW5hYmxlZDogYWxsb3dlZEV4dGVuc2lvbi5hbGxvd2VkID8/IHRydWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJveHkuJHVwZGF0ZU1vZGVsQWNjZXNzbGlzdChhY2Nlc3NMaXN0KTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0JGZpbGVJc0lnbm9yZWQodXJpOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5faWdub3JlZEZpbGVzU2VydmljZS5maWxlSXNJZ25vcmVkKFVSSS5yZXZpdmUodXJpKSwgdG9rZW4pO1xuXHR9XG5cblx0JHJlZ2lzdGVyRmlsZUlnbm9yZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5faWdub3JlZEZpbGVQcm92aWRlclJlZ2lzdHJhdGlvbnMuc2V0KGhhbmRsZSwgdGhpcy5faWdub3JlZEZpbGVzU2VydmljZS5yZWdpc3Rlcklnbm9yZWRGaWxlUHJvdmlkZXIoe1xuXHRcdFx0aXNGaWxlSWdub3JlZDogYXN5bmMgKHVyaTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHRoaXMuX3Byb3h5LiRpc0ZpbGVJZ25vcmVkKGhhbmRsZSwgdXJpLCB0b2tlbilcblx0XHR9KSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlckZpbGVJZ25vcmVQcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2lnbm9yZWRGaWxlUHJvdmlkZXJSZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UoaGFuZGxlKTtcblx0fVxufVxuXG4vLyBUaGUgZmFrZSBBdXRoZW50aWNhdGlvblByb3ZpZGVyIHRoYXQgd2lsbCBiZSB1c2VkIHRvIGdhdGUgYWNjZXNzIHRvIHRoZSBMYW5ndWFnZSBNb2RlbC4gVGhlcmUgd2lsbCBiZSBvbmUgcGVyIHByb3ZpZGVyLlxuY2xhc3MgTGFuZ3VhZ2VNb2RlbEFjY2Vzc0F1dGhQcm92aWRlciBpbXBsZW1lbnRzIElBdXRoZW50aWNhdGlvblByb3ZpZGVyIHtcblx0c3VwcG9ydHNNdWx0aXBsZUFjY291bnRzID0gZmFsc2U7XG5cblx0Ly8gSW1wb3J0YW50IGZvciB1cGRhdGluZyB0aGUgVUlcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTZXNzaW9uczogRW1pdHRlcjxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+ID0gbmV3IEVtaXR0ZXI8QXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50PigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblxuXHRwcml2YXRlIF9zZXNzaW9uOiBBdXRoZW50aWNhdGlvblNlc3Npb24gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgaWQ6IHN0cmluZywgcmVhZG9ubHkgbGFiZWw6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSBfYWNjb3VudExhYmVsOiBzdHJpbmcpIHsgfVxuXG5cdGFzeW5jIGdldFNlc3Npb25zKHNjb3Blcz86IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxyZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXT4ge1xuXHRcdC8vIElmIHRoZXJlIGFyZSBubyBzY29wZXMgYW5kIG5vIHNlc3Npb24gdGhhdCBtZWFucyBubyBleHRlbnNpb24gaGFzIHJlcXVlc3RlZCBhIHNlc3Npb24geWV0XG5cdFx0Ly8gYW5kIHRoZSB1c2VyIGlzIHNpbXBseSBvcGVuaW5nIHRoZSBBY2NvdW50IG1lbnUuIEluIHRoYXQgY2FzZSwgd2Ugc2hvdWxkIG5vdCByZXR1cm4gYW55IFwic2Vzc2lvbnNcIi5cblx0XHRpZiAoc2NvcGVzID09PSB1bmRlZmluZWQgJiYgIXRoaXMuX3Nlc3Npb24pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb24pIHtcblx0XHRcdHJldHVybiBbdGhpcy5fc2Vzc2lvbl07XG5cdFx0fVxuXHRcdHJldHVybiBbYXdhaXQgdGhpcy5jcmVhdGVTZXNzaW9uKHNjb3BlcyB8fCBbXSldO1xuXHR9XG5cdGFzeW5jIGNyZWF0ZVNlc3Npb24oc2NvcGVzOiBzdHJpbmdbXSk6IFByb21pc2U8QXV0aGVudGljYXRpb25TZXNzaW9uPiB7XG5cdFx0dGhpcy5fc2Vzc2lvbiA9IHRoaXMuX2NyZWF0ZUZha2VTZXNzaW9uKHNjb3Blcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFt0aGlzLl9zZXNzaW9uXSwgY2hhbmdlZDogW10sIHJlbW92ZWQ6IFtdIH0pO1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uO1xuXHR9XG5cdHJlbW92ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFtdLCBjaGFuZ2VkOiBbXSwgcmVtb3ZlZDogW3RoaXMuX3Nlc3Npb25dIH0pO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0Y29uZmlybWF0aW9uKGV4dGVuc2lvbk5hbWU6IHN0cmluZywgX3JlY3JlYXRpbmdTZXNzaW9uOiBib29sZWFuKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbmZpcm1MYW5ndWFnZU1vZGVsQWNjZXNzJywgXCJUaGUgZXh0ZW5zaW9uICd7MH0nIHdhbnRzIHRvIGFjY2VzcyB0aGUgbGFuZ3VhZ2UgbW9kZWxzIHByb3ZpZGVkIGJ5IHsxfS5cIiwgZXh0ZW5zaW9uTmFtZSwgdGhpcy5sYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVGYWtlU2Vzc2lvbihzY29wZXM6IHN0cmluZ1tdKTogQXV0aGVudGljYXRpb25TZXNzaW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6ICdmYWtlLXNlc3Npb24nLFxuXHRcdFx0YWNjb3VudDoge1xuXHRcdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdFx0bGFiZWw6IHRoaXMuX2FjY291bnRMYWJlbCxcblx0XHRcdH0sXG5cdFx0XHRhY2Nlc3NUb2tlbjogJ2Zha2UtYWNjZXNzLXRva2VuJyxcblx0XHRcdHNjb3Blcyxcblx0XHR9O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQix1QkFBdUI7QUFDckQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW9DLGdDQUFnQyx1Q0FBdUM7QUFD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
