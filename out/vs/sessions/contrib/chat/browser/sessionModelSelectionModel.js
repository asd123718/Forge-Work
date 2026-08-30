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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { getSelectedModelStorageKey, getStoredSelectedModel, storeSelectedModel } from "../../../../workbench/contrib/chat/common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../workbench/contrib/chat/common/constants.js";
import { ModelSelectionReason, transitionModelSelection } from "../../../../workbench/contrib/chat/common/modelSelection.js";
import { ChatModelSelectionDiagnostics } from "../../../../workbench/contrib/chat/browser/widget/input/chatModelSelectionDiagnostics.js";
import { ISessionsProvidersService } from "../../../services/sessions/browser/sessionsProvidersService.js";
import { SessionStatus } from "../../../services/sessions/common/session.js";
const DEFAULT_MODEL_PICKER_OPTIONS = {
  useGroupedModelPicker: true,
  showFeatured: true,
  showUnavailableFeatured: false,
  showManageModelsAction: false,
  showAutoModel: true
};
function normalizeModelPickerOptions(options) {
  return {
    ...DEFAULT_MODEL_PICKER_OPTIONS,
    ...options,
    showAutoModel: options?.showAutoModel ?? true
  };
}
function legacyModelPickerStorageKey(providerId, sessionType) {
  return `sessions.modelPicker.${providerId}.${sessionType}.selectedModelId`;
}
function persistSessionModelSelection(session, provider, storageService, model, modelTarget) {
  provider.setModel(session.sessionId, model.identifier);
  storeSelectedModel(storageService, ChatAgentLocation.Chat, modelTarget, model.identifier);
}
function hasSelectableModel(models, options) {
  return models.length > 0 || options.showAutoModel;
}
const ISessionModelSelectionModel = createDecorator("sessionModelSelectionModel");
let SessionModelSelectionModel = class extends Disposable {
  constructor(_session, _sessionsProvidersService, _storageService, _configurationService, logService) {
    super();
    this._session = _session;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._state = observableValue(this, {
      currentModel: void 0,
      pendingSelection: void 0,
      models: [],
      options: normalizeModelPickerOptions(void 0),
      hasSelectableModel: false
    });
    this.state = this._state;
    this._providerListener = this._register(new MutableDisposable());
    this._memory = {
      sessionKey: void 0,
      lastPushedChatKey: void 0,
      currentModel: void 0,
      currentReason: void 0
    };
    this._sharedDiagnostics = new ChatModelSelectionDiagnostics(logService, this._storageService, () => {
      const session = this._session.get();
      return {
        surface: "sessions",
        location: ChatAgentLocation.Chat,
        modelTarget: this._modelTarget,
        sessionKey: session ? this._sessionKey(session) : void 0,
        conversationKey: session?.activeChat.get().resource.toString(),
        metadata: {
          providerId: session?.providerId,
          sessionType: session?.sessionType,
          sessionId: session?.sessionId
        }
      };
    });
    this._register(autorun((reader) => {
      const session = this._session.read(reader);
      session?.modelId.read(reader);
      session?.status.read(reader);
      session?.activeChat.read(reader);
      this._refresh("sessionState", session);
    }));
    this._register(this._configurationService.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ChatConfiguration.DefaultModel)) {
        this._refresh("configuration");
      }
    }));
    this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._refresh("providers")));
    this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this._store)((event) => {
      this._sharedDiagnostics.logStorageChange(event, this._state.get().currentModel?.identifier);
    }));
  }
  selectModel(modelIdentifier) {
    const session = this._session.get();
    const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : void 0;
    if (!session || !provider) {
      this._sharedDiagnostics.report("selection-rejected", {
        requestedModel: modelIdentifier,
        reason: !session ? "noSession" : "noProvider"
      }, "info");
      return false;
    }
    const snapshot = provider.getModelsSnapshot(session.sessionId);
    this._modelTarget = snapshot.modelTarget;
    const models = snapshot.models;
    const model = models.find((model2) => model2.identifier === modelIdentifier);
    if (!model) {
      this._sharedDiagnostics.report("selection-rejected", {
        requestedModel: modelIdentifier,
        reason: "modelUnavailable",
        availableModels: models.map((model2) => model2.identifier).join(",")
      }, "info");
      return false;
    }
    const options = normalizeModelPickerOptions(provider.getModelPickerOptions(session.sessionId));
    const previousState = this._state.get();
    const previousMemory = this._memory;
    const providerModelBefore = session.modelId.get();
    const storageKey = getSelectedModelStorageKey(ChatAgentLocation.Chat, snapshot.modelTarget);
    this._state.set({
      models,
      options,
      hasSelectableModel: hasSelectableModel(models, options),
      currentModel: model,
      pendingSelection: void 0
    }, void 0);
    this._memory = {
      sessionKey: this._sessionKey(session),
      lastPushedChatKey: session.activeChat.get().resource.toString(),
      currentModel: model,
      currentReason: ModelSelectionReason.UserSelection
    };
    this._sharedDiagnostics.report("explicit-selection", { model: model.identifier }, "info");
    try {
      persistSessionModelSelection(session, provider, this._storageService, model, snapshot.modelTarget);
      this._sharedDiagnostics.report("explicit-selection-applied", { model: model.identifier }, "info");
    } catch (error) {
      this._memory = previousMemory;
      this._sharedDiagnostics.report("explicit-selection-failed", { model: model.identifier, error: String(error) }, "error");
      this._sharedDiagnostics.report("provider-selection-failed", {
        requestedModel: modelIdentifier,
        providerModelBefore,
        providerModelAfter: session.modelId.get(),
        storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE),
        error: String(error)
      }, "error");
      this._state.set({
        models,
        options,
        hasSelectableModel: hasSelectableModel(models, options),
        currentModel: previousState.currentModel,
        pendingSelection: previousState.pendingSelection
      }, void 0);
      throw error;
    }
    this._sharedDiagnostics.report("provider-selection-applied", {
      requestedModel: modelIdentifier,
      providerModelBefore,
      providerModelAfter: session.modelId.get(),
      storedModelAfter: this._storageService.get(storageKey, StorageScope.PROFILE)
    }, "info");
    return true;
  }
  _refresh(trigger, session = this._session.get()) {
    const provider = session ? this._sessionsProvidersService.getProvider(session.providerId) : void 0;
    this._setProvider(provider);
    const sessionKey = session ? this._sessionKey(session) : void 0;
    const sessionModelId = session?.modelId.get();
    const previousState = this._state.get();
    const previousMemory = this._memory;
    const sessionContext = session ? {
      kind: session.status.get() === SessionStatus.Untitled ? "untitled" : "existing",
      key: sessionKey,
      chatKey: session.activeChat.get().resource.toString(),
      modelId: sessionModelId
    } : { kind: "none" };
    const currentReason = sessionKey === this._memory.sessionKey ? this._memory.currentReason : void 0;
    const initialSnapshot = session && provider ? provider.getModelsSnapshot(session.sessionId, sessionModelId) : { models: [], desiredModelResolution: { kind: "notRequested" }, modelTarget: void 0 };
    const rememberedSelection = session ? this._getRememberedModel(session, initialSnapshot.modelTarget) : void 0;
    const rememberedModelId = rememberedSelection?.identifier;
    const desiredModelIdentifier = sessionContext.kind === "untitled" ? currentReason === ModelSelectionReason.FirstAvailable ? rememberedModelId : sessionModelId ?? rememberedModelId : sessionModelId;
    const snapshot = desiredModelIdentifier !== sessionModelId && session && provider ? provider.getModelsSnapshot(session.sessionId, desiredModelIdentifier) : initialSnapshot;
    const fallbackModel = snapshot.models.find((model) => model.metadata.isDefaultForLocation[ChatAgentLocation.Chat]) ?? snapshot.models[0];
    const result = transitionModelSelection({
      session: sessionContext,
      models: {
        available: snapshot.models,
        configuredModel: this._configurationService.getValue(ChatConfiguration.DefaultModel),
        rememberedModelId,
        desiredModelResolution: snapshot.desiredModelResolution,
        fallbackModel
      },
      previous: { ...this._memory, currentReason }
    });
    this._memory = {
      sessionKey: result.sessionKey,
      lastPushedChatKey: result.lastPushedChatKey,
      currentModel: result.currentModel,
      currentReason: result.currentReason
    };
    this._modelTarget = snapshot.modelTarget;
    const models = snapshot.models;
    const options = normalizeModelPickerOptions(session && provider ? provider.getModelPickerOptions(session.sessionId) : void 0);
    this._state.set({
      models,
      options,
      hasSelectableModel: !!session && !!provider && hasSelectableModel(models, options),
      currentModel: result.currentModel,
      pendingSelection: result.pendingSelection
    }, void 0);
    this._sharedDiagnostics.report("transition", {
      trigger,
      sessionKind: sessionContext.kind,
      modelTarget: snapshot.modelTarget,
      configuredModel: this._configurationService.getValue(ChatConfiguration.DefaultModel),
      rememberedModel: rememberedModelId,
      rememberedSource: rememberedSelection?.source,
      desiredModel: desiredModelIdentifier,
      desiredResolution: snapshot.desiredModelResolution.kind,
      fallbackModel: fallbackModel?.identifier,
      availableModels: snapshot.models.map((model) => model.identifier).join(","),
      previousModel: previousMemory.currentModel?.identifier,
      previousReason: currentReason,
      resultModel: result.currentModel?.identifier,
      resultReason: result.currentReason,
      pendingReference: result.pendingSelection?.reference,
      effect: result.effect.kind,
      effectModel: result.effect.kind === "apply" ? result.effect.model.identifier : void 0,
      effectReason: result.effect.kind === "none" ? void 0 : result.effect.reason
    }, result.effect.kind === "none" && previousMemory.currentModel?.identifier === result.currentModel?.identifier ? "debug" : "info");
    if (result.effect.kind === "apply" && session && provider) {
      const effect = result.effect;
      const providerModelBefore = session.modelId.get();
      try {
        provider.setModel(session.sessionId, effect.model.identifier);
      } catch (error) {
        this._memory = previousMemory;
        this._state.set(previousState, void 0);
        this._sharedDiagnostics.report("provider-automatic-selection-failed", {
          model: effect.model.identifier,
          reason: effect.reason,
          providerModelBefore,
          providerModelAfter: session.modelId.get(),
          error: String(error)
        }, "error");
        throw error;
      }
      this._sharedDiagnostics.report("provider-automatic-selection-applied", {
        model: effect.model.identifier,
        reason: effect.reason,
        providerModelBefore,
        providerModelAfter: session.modelId.get()
      }, "info");
    }
  }
  _getRememberedModel(session, modelTarget) {
    const storedSelection = getStoredSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget);
    if (storedSelection) {
      return { identifier: storedSelection, source: "stored" };
    }
    const legacyStorageKey = legacyModelPickerStorageKey(session.providerId, session.sessionType);
    const legacyIdentifier = this._storageService.get(legacyStorageKey, StorageScope.PROFILE);
    if (legacyIdentifier) {
      storeSelectedModel(this._storageService, ChatAgentLocation.Chat, modelTarget, legacyIdentifier);
      this._sharedDiagnostics.report("legacy-selection-migrated", {
        legacyStorageKey,
        model: legacyIdentifier
      }, "info");
      return { identifier: legacyIdentifier, source: "legacy" };
    }
    return void 0;
  }
  _setProvider(provider) {
    if (this._provider === provider) {
      return;
    }
    this._provider = provider;
    this._providerListener.value = provider?.onDidChangeModels(() => this._refresh("models"));
  }
  _sessionKey(session) {
    return session.sessionId;
  }
};
SessionModelSelectionModel = __decorateClass([
  __decorateParam(1, ISessionsProvidersService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILogService)
], SessionModelSelectionModel);
export {
  ISessionModelSelectionModel,
  SessionModelSelectionModel,
  hasSelectableModel,
  normalizeModelPickerOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0U2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXksIGdldFN0b3JlZFNlbGVjdGVkTW9kZWwsIHN0b3JlU2VsZWN0ZWRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZWxlY3RlZE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZWxlY3Rpb25NZW1vcnksIElNb2RlbFNlbGVjdGlvblNlc3Npb25Db250ZXh0LCBJUGVuZGluZ01vZGVsU2VsZWN0aW9uLCBNb2RlbFNlbGVjdGlvblJlYXNvbiwgdHJhbnNpdGlvbk1vZGVsU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWxTZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2NoYXRNb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucywgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTm9ybWFsaXplZFNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMgZXh0ZW5kcyBJU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNob3dBdXRvTW9kZWw6IGJvb2xlYW47XG59XG5cbmNvbnN0IERFRkFVTFRfTU9ERUxfUElDS0VSX09QVElPTlM6IElOb3JtYWxpemVkU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyA9IHtcblx0dXNlR3JvdXBlZE1vZGVsUGlja2VyOiB0cnVlLFxuXHRzaG93RmVhdHVyZWQ6IHRydWUsXG5cdHNob3dVbmF2YWlsYWJsZUZlYXR1cmVkOiBmYWxzZSxcblx0c2hvd01hbmFnZU1vZGVsc0FjdGlvbjogZmFsc2UsXG5cdHNob3dBdXRvTW9kZWw6IHRydWUsXG59O1xuXG50eXBlIE1vZGVsU2VsZWN0aW9uUmVmcmVzaFRyaWdnZXIgPSAnc2Vzc2lvblN0YXRlJyB8ICdjb25maWd1cmF0aW9uJyB8ICdwcm92aWRlcnMnIHwgJ21vZGVscycgfCAnc3RvcmFnZSc7XG5cbmludGVyZmFjZSBJUmVtZW1iZXJlZE1vZGVsU2VsZWN0aW9uIHtcblx0cmVhZG9ubHkgaWRlbnRpZmllcjogc3RyaW5nO1xuXHRyZWFkb25seSBzb3VyY2U6ICdzdG9yZWQnIHwgJ2xlZ2FjeSc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVNb2RlbFBpY2tlck9wdGlvbnMob3B0aW9uczogSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMgfCB1bmRlZmluZWQpOiBJTm9ybWFsaXplZFNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMge1xuXHRyZXR1cm4ge1xuXHRcdC4uLkRFRkFVTFRfTU9ERUxfUElDS0VSX09QVElPTlMsXG5cdFx0Li4ub3B0aW9ucyxcblx0XHRzaG93QXV0b01vZGVsOiBvcHRpb25zPy5zaG93QXV0b01vZGVsID8/IHRydWUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGxlZ2FjeU1vZGVsUGlja2VyU3RvcmFnZUtleShwcm92aWRlcklkOiBzdHJpbmcsIHNlc3Npb25UeXBlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYHNlc3Npb25zLm1vZGVsUGlja2VyLiR7cHJvdmlkZXJJZH0uJHtzZXNzaW9uVHlwZX0uc2VsZWN0ZWRNb2RlbElkYDtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdFNlc3Npb25Nb2RlbFNlbGVjdGlvbihcblx0c2Vzc2lvbjogUGljazxJQWN0aXZlU2Vzc2lvbiwgJ3Byb3ZpZGVySWQnIHwgJ3Nlc3Npb25UeXBlJyB8ICdzZXNzaW9uSWQnPixcblx0cHJvdmlkZXI6IFBpY2s8SVNlc3Npb25zUHJvdmlkZXIsICdzZXRNb2RlbCc+LFxuXHRzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLFxuXHRtb2RlbFRhcmdldDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuKTogdm9pZCB7XG5cdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24uc2Vzc2lvbklkLCBtb2RlbC5pZGVudGlmaWVyKTtcblx0c3RvcmVTZWxlY3RlZE1vZGVsKHN0b3JhZ2VTZXJ2aWNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlbFRhcmdldCwgbW9kZWwuaWRlbnRpZmllcik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYXNTZWxlY3RhYmxlTW9kZWwoXG5cdG1vZGVsczogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10sXG5cdG9wdGlvbnM6IElOb3JtYWxpemVkU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucyxcbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbW9kZWxzLmxlbmd0aCA+IDAgfHwgb3B0aW9ucy5zaG93QXV0b01vZGVsO1xufVxuXG5leHBvcnQgY29uc3QgSVNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsID0gY3JlYXRlRGVjb3JhdG9yPElTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbD4oJ3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25Nb2RlbFNlbGVjdGlvblN0YXRlIHtcblx0cmVhZG9ubHkgY3VycmVudE1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHBlbmRpbmdTZWxlY3Rpb246IElQZW5kaW5nTW9kZWxTZWxlY3Rpb24gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1vZGVsczogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW107XG5cdHJlYWRvbmx5IG9wdGlvbnM6IElOb3JtYWxpemVkU2Vzc2lvbk1vZGVsUGlja2VyT3B0aW9ucztcblx0cmVhZG9ubHkgaGFzU2VsZWN0YWJsZU1vZGVsOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc3RhdGU6IElPYnNlcnZhYmxlPElTZXNzaW9uTW9kZWxTZWxlY3Rpb25TdGF0ZT47XG5cdHNlbGVjdE1vZGVsKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8SVNlc3Npb25Nb2RlbFNlbGVjdGlvblN0YXRlPih0aGlzLCB7XG5cdFx0Y3VycmVudE1vZGVsOiB1bmRlZmluZWQsXG5cdFx0cGVuZGluZ1NlbGVjdGlvbjogdW5kZWZpbmVkLFxuXHRcdG1vZGVsczogW10sXG5cdFx0b3B0aW9uczogbm9ybWFsaXplTW9kZWxQaWNrZXJPcHRpb25zKHVuZGVmaW5lZCksXG5cdFx0aGFzU2VsZWN0YWJsZU1vZGVsOiBmYWxzZSxcblx0fSk7XG5cdHJlYWRvbmx5IHN0YXRlOiBJT2JzZXJ2YWJsZTxJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uU3RhdGU+ID0gdGhpcy5fc3RhdGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NoYXJlZERpYWdub3N0aWNzOiBDaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcztcblx0cHJpdmF0ZSBfbWVtb3J5OiBJTW9kZWxTZWxlY3Rpb25NZW1vcnkgPSB7XG5cdFx0c2Vzc2lvbktleTogdW5kZWZpbmVkLFxuXHRcdGxhc3RQdXNoZWRDaGF0S2V5OiB1bmRlZmluZWQsXG5cdFx0Y3VycmVudE1vZGVsOiB1bmRlZmluZWQsXG5cdFx0Y3VycmVudFJlYXNvbjogdW5kZWZpbmVkLFxuXHR9O1xuXHRwcml2YXRlIF9wcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vZGVsVGFyZ2V0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+LFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zaGFyZWREaWFnbm9zdGljcyA9IG5ldyBDaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcyhsb2dTZXJ2aWNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSwgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24uZ2V0KCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzdXJmYWNlOiAnc2Vzc2lvbnMnLFxuXHRcdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0bW9kZWxUYXJnZXQ6IHRoaXMuX21vZGVsVGFyZ2V0LFxuXHRcdFx0XHRzZXNzaW9uS2V5OiBzZXNzaW9uID8gdGhpcy5fc2Vzc2lvbktleShzZXNzaW9uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29udmVyc2F0aW9uS2V5OiBzZXNzaW9uPy5hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0cHJvdmlkZXJJZDogc2Vzc2lvbj8ucHJvdmlkZXJJZCxcblx0XHRcdFx0XHRzZXNzaW9uVHlwZTogc2Vzc2lvbj8uc2Vzc2lvblR5cGUsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiBzZXNzaW9uPy5zZXNzaW9uSWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHNlc3Npb24/Lm1vZGVsSWQucmVhZChyZWFkZXIpO1xuXHRcdFx0c2Vzc2lvbj8uc3RhdHVzLnJlYWQocmVhZGVyKTtcblx0XHRcdHNlc3Npb24/LmFjdGl2ZUNoYXQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcmVmcmVzaCgnc2Vzc2lvblN0YXRlJywgc2Vzc2lvbik7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdE1vZGVsKSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoKCdjb25maWd1cmF0aW9uJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5vbkRpZENoYW5nZVByb3ZpZGVycygoKSA9PiB0aGlzLl9yZWZyZXNoKCdwcm92aWRlcnMnKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpKGV2ZW50ID0+IHtcblx0XHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLmxvZ1N0b3JhZ2VDaGFuZ2UoZXZlbnQsIHRoaXMuX3N0YXRlLmdldCgpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcik7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2VsZWN0TW9kZWwobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHNlc3Npb24gPyB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIoc2Vzc2lvbi5wcm92aWRlcklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXNlc3Npb24gfHwgIXByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9zaGFyZWREaWFnbm9zdGljcy5yZXBvcnQoJ3NlbGVjdGlvbi1yZWplY3RlZCcsIHtcblx0XHRcdFx0cmVxdWVzdGVkTW9kZWw6IG1vZGVsSWRlbnRpZmllcixcblx0XHRcdFx0cmVhc29uOiAhc2Vzc2lvbiA/ICdub1Nlc3Npb24nIDogJ25vUHJvdmlkZXInLFxuXHRcdFx0fSwgJ2luZm8nKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzbmFwc2hvdCA9IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9tb2RlbFRhcmdldCA9IHNuYXBzaG90Lm1vZGVsVGFyZ2V0O1xuXHRcdGNvbnN0IG1vZGVscyA9IHNuYXBzaG90Lm1vZGVscztcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IG1vZGVsSWRlbnRpZmllcik7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCdzZWxlY3Rpb24tcmVqZWN0ZWQnLCB7XG5cdFx0XHRcdHJlcXVlc3RlZE1vZGVsOiBtb2RlbElkZW50aWZpZXIsXG5cdFx0XHRcdHJlYXNvbjogJ21vZGVsVW5hdmFpbGFibGUnLFxuXHRcdFx0XHRhdmFpbGFibGVNb2RlbHM6IG1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllcikuam9pbignLCcpLFxuXHRcdFx0fSwgJ2luZm8nKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0gbm9ybWFsaXplTW9kZWxQaWNrZXJPcHRpb25zKHByb3ZpZGVyLmdldE1vZGVsUGlja2VyT3B0aW9ucyhzZXNzaW9uLnNlc3Npb25JZCkpO1xuXHRcdGNvbnN0IHByZXZpb3VzU3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRjb25zdCBwcmV2aW91c01lbW9yeSA9IHRoaXMuX21lbW9yeTtcblx0XHRjb25zdCBwcm92aWRlck1vZGVsQmVmb3JlID0gc2Vzc2lvbi5tb2RlbElkLmdldCgpO1xuXHRcdGNvbnN0IHN0b3JhZ2VLZXkgPSBnZXRTZWxlY3RlZE1vZGVsU3RvcmFnZUtleShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBzbmFwc2hvdC5tb2RlbFRhcmdldCk7XG5cdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdG1vZGVscyxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRoYXNTZWxlY3RhYmxlTW9kZWw6IGhhc1NlbGVjdGFibGVNb2RlbChtb2RlbHMsIG9wdGlvbnMpLFxuXHRcdFx0Y3VycmVudE1vZGVsOiBtb2RlbCxcblx0XHRcdHBlbmRpbmdTZWxlY3Rpb246IHVuZGVmaW5lZCxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX21lbW9yeSA9IHtcblx0XHRcdHNlc3Npb25LZXk6IHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbiksXG5cdFx0XHRsYXN0UHVzaGVkQ2hhdEtleTogc2Vzc2lvbi5hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRjdXJyZW50TW9kZWw6IG1vZGVsLFxuXHRcdFx0Y3VycmVudFJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uVXNlclNlbGVjdGlvbixcblx0XHR9O1xuXHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgnZXhwbGljaXQtc2VsZWN0aW9uJywgeyBtb2RlbDogbW9kZWwuaWRlbnRpZmllciB9LCAnaW5mbycpO1xuXHRcdHRyeSB7XG5cdFx0XHRwZXJzaXN0U2Vzc2lvbk1vZGVsU2VsZWN0aW9uKHNlc3Npb24sIHByb3ZpZGVyLCB0aGlzLl9zdG9yYWdlU2VydmljZSwgbW9kZWwsIHNuYXBzaG90Lm1vZGVsVGFyZ2V0KTtcblx0XHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgnZXhwbGljaXQtc2VsZWN0aW9uLWFwcGxpZWQnLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyIH0sICdpbmZvJyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX21lbW9yeSA9IHByZXZpb3VzTWVtb3J5O1xuXHRcdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCdleHBsaWNpdC1zZWxlY3Rpb24tZmFpbGVkJywgeyBtb2RlbDogbW9kZWwuaWRlbnRpZmllciwgZXJyb3I6IFN0cmluZyhlcnJvcikgfSwgJ2Vycm9yJyk7XG5cdFx0XHR0aGlzLl9zaGFyZWREaWFnbm9zdGljcy5yZXBvcnQoJ3Byb3ZpZGVyLXNlbGVjdGlvbi1mYWlsZWQnLCB7XG5cdFx0XHRcdHJlcXVlc3RlZE1vZGVsOiBtb2RlbElkZW50aWZpZXIsXG5cdFx0XHRcdHByb3ZpZGVyTW9kZWxCZWZvcmUsXG5cdFx0XHRcdHByb3ZpZGVyTW9kZWxBZnRlcjogc2Vzc2lvbi5tb2RlbElkLmdldCgpLFxuXHRcdFx0XHRzdG9yZWRNb2RlbEFmdGVyOiB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdFx0XHRlcnJvcjogU3RyaW5nKGVycm9yKSxcblx0XHRcdH0sICdlcnJvcicpO1xuXHRcdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdFx0bW9kZWxzLFxuXHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0XHRoYXNTZWxlY3RhYmxlTW9kZWw6IGhhc1NlbGVjdGFibGVNb2RlbChtb2RlbHMsIG9wdGlvbnMpLFxuXHRcdFx0XHRjdXJyZW50TW9kZWw6IHByZXZpb3VzU3RhdGUuY3VycmVudE1vZGVsLFxuXHRcdFx0XHRwZW5kaW5nU2VsZWN0aW9uOiBwcmV2aW91c1N0YXRlLnBlbmRpbmdTZWxlY3Rpb24sXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgncHJvdmlkZXItc2VsZWN0aW9uLWFwcGxpZWQnLCB7XG5cdFx0XHRyZXF1ZXN0ZWRNb2RlbDogbW9kZWxJZGVudGlmaWVyLFxuXHRcdFx0cHJvdmlkZXJNb2RlbEJlZm9yZSxcblx0XHRcdHByb3ZpZGVyTW9kZWxBZnRlcjogc2Vzc2lvbi5tb2RlbElkLmdldCgpLFxuXHRcdFx0c3RvcmVkTW9kZWxBZnRlcjogdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KHN0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSxcblx0XHR9LCAnaW5mbycpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaCh0cmlnZ2VyOiBNb2RlbFNlbGVjdGlvblJlZnJlc2hUcmlnZ2VyLCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKSk6IHZvaWQge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gc2Vzc2lvbiA/IHRoaXMuX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihzZXNzaW9uLnByb3ZpZGVySWQpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3NldFByb3ZpZGVyKHByb3ZpZGVyKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvbiA/IHRoaXMuX3Nlc3Npb25LZXkoc2Vzc2lvbikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbk1vZGVsSWQgPSBzZXNzaW9uPy5tb2RlbElkLmdldCgpO1xuXHRcdGNvbnN0IHByZXZpb3VzU3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRjb25zdCBwcmV2aW91c01lbW9yeSA9IHRoaXMuX21lbW9yeTtcblx0XHRjb25zdCBzZXNzaW9uQ29udGV4dDogSU1vZGVsU2VsZWN0aW9uU2Vzc2lvbkNvbnRleHQgPSBzZXNzaW9uID8ge1xuXHRcdFx0a2luZDogc2Vzc2lvbi5zdGF0dXMuZ2V0KCkgPT09IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgPyAndW50aXRsZWQnIDogJ2V4aXN0aW5nJyxcblx0XHRcdGtleTogc2Vzc2lvbktleSEsXG5cdFx0XHRjaGF0S2V5OiBzZXNzaW9uLmFjdGl2ZUNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdG1vZGVsSWQ6IHNlc3Npb25Nb2RlbElkLFxuXHRcdH0gOiB7IGtpbmQ6ICdub25lJyB9O1xuXHRcdGNvbnN0IGN1cnJlbnRSZWFzb24gPSBzZXNzaW9uS2V5ID09PSB0aGlzLl9tZW1vcnkuc2Vzc2lvbktleSA/IHRoaXMuX21lbW9yeS5jdXJyZW50UmVhc29uIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGluaXRpYWxTbmFwc2hvdCA9IHNlc3Npb24gJiYgcHJvdmlkZXJcblx0XHRcdD8gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIHNlc3Npb25Nb2RlbElkKVxuXHRcdFx0OiB7IG1vZGVsczogW10sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ25vdFJlcXVlc3RlZCcgfSBhcyBjb25zdCwgbW9kZWxUYXJnZXQ6IHVuZGVmaW5lZCB9O1xuXHRcdGNvbnN0IHJlbWVtYmVyZWRTZWxlY3Rpb24gPSBzZXNzaW9uID8gdGhpcy5fZ2V0UmVtZW1iZXJlZE1vZGVsKHNlc3Npb24sIGluaXRpYWxTbmFwc2hvdC5tb2RlbFRhcmdldCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZE1vZGVsSWQgPSByZW1lbWJlcmVkU2VsZWN0aW9uPy5pZGVudGlmaWVyO1xuXHRcdGNvbnN0IGRlc2lyZWRNb2RlbElkZW50aWZpZXIgPSBzZXNzaW9uQ29udGV4dC5raW5kID09PSAndW50aXRsZWQnXG5cdFx0XHQ/IChjdXJyZW50UmVhc29uID09PSBNb2RlbFNlbGVjdGlvblJlYXNvbi5GaXJzdEF2YWlsYWJsZSA/IHJlbWVtYmVyZWRNb2RlbElkIDogKHNlc3Npb25Nb2RlbElkID8/IHJlbWVtYmVyZWRNb2RlbElkKSlcblx0XHRcdDogc2Vzc2lvbk1vZGVsSWQ7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBkZXNpcmVkTW9kZWxJZGVudGlmaWVyICE9PSBzZXNzaW9uTW9kZWxJZCAmJiBzZXNzaW9uICYmIHByb3ZpZGVyXG5cdFx0XHQ/IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkLCBkZXNpcmVkTW9kZWxJZGVudGlmaWVyKVxuXHRcdFx0OiBpbml0aWFsU25hcHNob3Q7XG5cdFx0Y29uc3QgZmFsbGJhY2tNb2RlbCA9IHNuYXBzaG90Lm1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLm1ldGFkYXRhLmlzRGVmYXVsdEZvckxvY2F0aW9uW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdKSA/PyBzbmFwc2hvdC5tb2RlbHNbMF07XG5cdFx0Y29uc3QgcmVzdWx0ID0gdHJhbnNpdGlvbk1vZGVsU2VsZWN0aW9uKHtcblx0XHRcdHNlc3Npb246IHNlc3Npb25Db250ZXh0LFxuXHRcdFx0bW9kZWxzOiB7XG5cdFx0XHRcdGF2YWlsYWJsZTogc25hcHNob3QubW9kZWxzLFxuXHRcdFx0XHRjb25maWd1cmVkTW9kZWw6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdE1vZGVsKSxcblx0XHRcdFx0cmVtZW1iZXJlZE1vZGVsSWQsXG5cdFx0XHRcdGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHNuYXBzaG90LmRlc2lyZWRNb2RlbFJlc29sdXRpb24sXG5cdFx0XHRcdGZhbGxiYWNrTW9kZWwsXG5cdFx0XHR9LFxuXHRcdFx0cHJldmlvdXM6IHsgLi4udGhpcy5fbWVtb3J5LCBjdXJyZW50UmVhc29uIH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5fbWVtb3J5ID0ge1xuXHRcdFx0c2Vzc2lvbktleTogcmVzdWx0LnNlc3Npb25LZXksXG5cdFx0XHRsYXN0UHVzaGVkQ2hhdEtleTogcmVzdWx0Lmxhc3RQdXNoZWRDaGF0S2V5LFxuXHRcdFx0Y3VycmVudE1vZGVsOiByZXN1bHQuY3VycmVudE1vZGVsLFxuXHRcdFx0Y3VycmVudFJlYXNvbjogcmVzdWx0LmN1cnJlbnRSZWFzb24sXG5cdFx0fTtcblx0XHR0aGlzLl9tb2RlbFRhcmdldCA9IHNuYXBzaG90Lm1vZGVsVGFyZ2V0O1xuXHRcdGNvbnN0IG1vZGVscyA9IHNuYXBzaG90Lm1vZGVscztcblx0XHRjb25zdCBvcHRpb25zID0gbm9ybWFsaXplTW9kZWxQaWNrZXJPcHRpb25zKHNlc3Npb24gJiYgcHJvdmlkZXIgPyBwcm92aWRlci5nZXRNb2RlbFBpY2tlck9wdGlvbnMoc2Vzc2lvbi5zZXNzaW9uSWQpIDogdW5kZWZpbmVkKTtcblxuXHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRtb2RlbHMsXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0aGFzU2VsZWN0YWJsZU1vZGVsOiAhIXNlc3Npb24gJiYgISFwcm92aWRlciAmJiBoYXNTZWxlY3RhYmxlTW9kZWwobW9kZWxzLCBvcHRpb25zKSxcblx0XHRcdGN1cnJlbnRNb2RlbDogcmVzdWx0LmN1cnJlbnRNb2RlbCxcblx0XHRcdHBlbmRpbmdTZWxlY3Rpb246IHJlc3VsdC5wZW5kaW5nU2VsZWN0aW9uLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc2hhcmVkRGlhZ25vc3RpY3MucmVwb3J0KCd0cmFuc2l0aW9uJywge1xuXHRcdFx0dHJpZ2dlcixcblx0XHRcdHNlc3Npb25LaW5kOiBzZXNzaW9uQ29udGV4dC5raW5kLFxuXHRcdFx0bW9kZWxUYXJnZXQ6IHNuYXBzaG90Lm1vZGVsVGFyZ2V0LFxuXHRcdFx0Y29uZmlndXJlZE1vZGVsOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRNb2RlbCksXG5cdFx0XHRyZW1lbWJlcmVkTW9kZWw6IHJlbWVtYmVyZWRNb2RlbElkLFxuXHRcdFx0cmVtZW1iZXJlZFNvdXJjZTogcmVtZW1iZXJlZFNlbGVjdGlvbj8uc291cmNlLFxuXHRcdFx0ZGVzaXJlZE1vZGVsOiBkZXNpcmVkTW9kZWxJZGVudGlmaWVyLFxuXHRcdFx0ZGVzaXJlZFJlc29sdXRpb246IHNuYXBzaG90LmRlc2lyZWRNb2RlbFJlc29sdXRpb24ua2luZCxcblx0XHRcdGZhbGxiYWNrTW9kZWw6IGZhbGxiYWNrTW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRhdmFpbGFibGVNb2RlbHM6IHNuYXBzaG90Lm1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllcikuam9pbignLCcpLFxuXHRcdFx0cHJldmlvdXNNb2RlbDogcHJldmlvdXNNZW1vcnkuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0cHJldmlvdXNSZWFzb246IGN1cnJlbnRSZWFzb24sXG5cdFx0XHRyZXN1bHRNb2RlbDogcmVzdWx0LmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHJlc3VsdFJlYXNvbjogcmVzdWx0LmN1cnJlbnRSZWFzb24sXG5cdFx0XHRwZW5kaW5nUmVmZXJlbmNlOiByZXN1bHQucGVuZGluZ1NlbGVjdGlvbj8ucmVmZXJlbmNlLFxuXHRcdFx0ZWZmZWN0OiByZXN1bHQuZWZmZWN0LmtpbmQsXG5cdFx0XHRlZmZlY3RNb2RlbDogcmVzdWx0LmVmZmVjdC5raW5kID09PSAnYXBwbHknID8gcmVzdWx0LmVmZmVjdC5tb2RlbC5pZGVudGlmaWVyIDogdW5kZWZpbmVkLFxuXHRcdFx0ZWZmZWN0UmVhc29uOiByZXN1bHQuZWZmZWN0LmtpbmQgPT09ICdub25lJyA/IHVuZGVmaW5lZCA6IHJlc3VsdC5lZmZlY3QucmVhc29uLFxuXHRcdH0sIHJlc3VsdC5lZmZlY3Qua2luZCA9PT0gJ25vbmUnICYmIHByZXZpb3VzTWVtb3J5LmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciA9PT0gcmVzdWx0LmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciA/ICdkZWJ1ZycgOiAnaW5mbycpO1xuXG5cdFx0aWYgKHJlc3VsdC5lZmZlY3Qua2luZCA9PT0gJ2FwcGx5JyAmJiBzZXNzaW9uICYmIHByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBlZmZlY3QgPSByZXN1bHQuZWZmZWN0O1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJNb2RlbEJlZm9yZSA9IHNlc3Npb24ubW9kZWxJZC5nZXQoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24uc2Vzc2lvbklkLCBlZmZlY3QubW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9tZW1vcnkgPSBwcmV2aW91c01lbW9yeTtcblx0XHRcdFx0dGhpcy5fc3RhdGUuc2V0KHByZXZpb3VzU3RhdGUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgncHJvdmlkZXItYXV0b21hdGljLXNlbGVjdGlvbi1mYWlsZWQnLCB7XG5cdFx0XHRcdFx0bW9kZWw6IGVmZmVjdC5tb2RlbC5pZGVudGlmaWVyLFxuXHRcdFx0XHRcdHJlYXNvbjogZWZmZWN0LnJlYXNvbixcblx0XHRcdFx0XHRwcm92aWRlck1vZGVsQmVmb3JlLFxuXHRcdFx0XHRcdHByb3ZpZGVyTW9kZWxBZnRlcjogc2Vzc2lvbi5tb2RlbElkLmdldCgpLFxuXHRcdFx0XHRcdGVycm9yOiBTdHJpbmcoZXJyb3IpLFxuXHRcdFx0XHR9LCAnZXJyb3InKTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zaGFyZWREaWFnbm9zdGljcy5yZXBvcnQoJ3Byb3ZpZGVyLWF1dG9tYXRpYy1zZWxlY3Rpb24tYXBwbGllZCcsIHtcblx0XHRcdFx0bW9kZWw6IGVmZmVjdC5tb2RlbC5pZGVudGlmaWVyLFxuXHRcdFx0XHRyZWFzb246IGVmZmVjdC5yZWFzb24sXG5cdFx0XHRcdHByb3ZpZGVyTW9kZWxCZWZvcmUsXG5cdFx0XHRcdHByb3ZpZGVyTW9kZWxBZnRlcjogc2Vzc2lvbi5tb2RlbElkLmdldCgpLFxuXHRcdFx0fSwgJ2luZm8nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZW1lbWJlcmVkTW9kZWwoc2Vzc2lvbjogSUFjdGl2ZVNlc3Npb24sIG1vZGVsVGFyZ2V0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJUmVtZW1iZXJlZE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdG9yZWRTZWxlY3Rpb24gPSBnZXRTdG9yZWRTZWxlY3RlZE1vZGVsKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlbFRhcmdldCk7XG5cdFx0aWYgKHN0b3JlZFNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHsgaWRlbnRpZmllcjogc3RvcmVkU2VsZWN0aW9uLCBzb3VyY2U6ICdzdG9yZWQnIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGVnYWN5U3RvcmFnZUtleSA9IGxlZ2FjeU1vZGVsUGlja2VyU3RvcmFnZUtleShzZXNzaW9uLnByb3ZpZGVySWQsIHNlc3Npb24uc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IGxlZ2FjeUlkZW50aWZpZXIgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQobGVnYWN5U3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGlmIChsZWdhY3lJZGVudGlmaWVyKSB7XG5cdFx0XHRzdG9yZVNlbGVjdGVkTW9kZWwodGhpcy5fc3RvcmFnZVNlcnZpY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGVsVGFyZ2V0LCBsZWdhY3lJZGVudGlmaWVyKTtcblx0XHRcdHRoaXMuX3NoYXJlZERpYWdub3N0aWNzLnJlcG9ydCgnbGVnYWN5LXNlbGVjdGlvbi1taWdyYXRlZCcsIHtcblx0XHRcdFx0bGVnYWN5U3RvcmFnZUtleSxcblx0XHRcdFx0bW9kZWw6IGxlZ2FjeUlkZW50aWZpZXIsXG5cdFx0XHR9LCAnaW5mbycpO1xuXHRcdFx0cmV0dXJuIHsgaWRlbnRpZmllcjogbGVnYWN5SWRlbnRpZmllciwgc291cmNlOiAnbGVnYWN5JyB9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UHJvdmlkZXIocHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVyID09PSBwcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXIudmFsdWUgPSBwcm92aWRlcj8ub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4gdGhpcy5fcmVmcmVzaCgnbW9kZWxzJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2Vzc2lvbktleShzZXNzaW9uOiBJQWN0aXZlU2Vzc2lvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHNlc3Npb24uc2Vzc2lvbklkO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLFNBQXNCLHVCQUF1QjtBQUN0RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixvQkFB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
