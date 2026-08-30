import { Disposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { isInConversationModelChoice, ModelSelectionReason, resolveConfiguredModel, resolveInitialModelSelection, resolveModelIdentifier } from "../../../common/modelSelection.js";
import { findBestMatchingModel, findDefaultModel, hasModelsTargetingSession, resolveModelFromSyncState, shouldDropAgnosticDraftModel, shouldResetModelToDefault, shouldResetOnModelListChange } from "./chatInputModelUtils.js";
import { NullChatModelSelectionDiagnostics } from "./chatModelSelectionDiagnostics.js";
class ChatInputModelSelectionController extends Disposable {
  constructor(_runtime, _diagnostics = NullChatModelSelectionDiagnostics) {
    super();
    this._runtime = _runtime;
    this._diagnostics = _diagnostics;
    this._currentModel = observableValue(this, void 0);
    this.currentModel = this._currentModel;
    this._restorePerTypeModel = false;
    this._register(this._runtime.subscribeToModelChanges(() => this.reconcileModelListChange(this._pool())));
    this._register(toDisposable(() => this._clearIntent()));
  }
  get restorePerTypeModel() {
    return this._restorePerTypeModel;
  }
  get selectionReason() {
    return this._selectionReason;
  }
  beginSessionSwitch(isEmpty, ownsPool, hadIncomingModel) {
    this._selectionReason = void 0;
    this._restorePerTypeModel = isEmpty && ownsPool && !hadIncomingModel;
    this._clearIntent();
  }
  endSessionSwitch() {
    this._restorePerTypeModel = false;
  }
  hasPendingIntent() {
    return !!this._intent;
  }
  /**
   * True while the remembered model is not selectable, i.e. whatever is currently selected is a
   * stand-in that {@link _restoreRememberedModel} will replace once the catalog offers the real
   * one. Callers use this to avoid acting on a selection that is about to change.
   */
  isAwaitingRememberedModel() {
    const modelId = this._intendedModel?.modelId;
    return !!modelId && !this._pool().some((model) => model.identifier === modelId);
  }
  hasPendingProgrammaticSelection() {
    return !!this._intent;
  }
  clearIntent() {
    this._clearIntent();
  }
  /**
   * Shows `model` and runs `apply`. A user action claims authority over the conversation and is
   * rolled back if `apply` throws; anything else is a mechanical follow-on that leaves the
   * conversation's intent — and the authority already in force — untouched.
   */
  applySelection(model, apply, isUserAction, rollbackOnError = false) {
    if (!isUserAction) {
      this._display(model);
      apply();
      return;
    }
    this._clearIntent();
    const previousModel = this._currentModel.get();
    const previousReason = this._selectionReason;
    const previousRememberedSelection = this._intendedModel;
    this._currentModel.set(model, void 0);
    this._selectionReason = ModelSelectionReason.UserSelection;
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.UserSelection });
    this._diagnostics.report("explicit-selection", { model: model.identifier }, "info");
    try {
      apply();
      this._diagnostics.report("explicit-selection-applied", { model: model.identifier }, "info");
    } catch (error) {
      if (rollbackOnError) {
        this._currentModel.set(previousModel, void 0);
        this._selectionReason = previousReason;
        this._remember(previousRememberedSelection);
      }
      this._diagnostics.report("explicit-selection-failed", { model: model.identifier, error: String(error) }, "error");
      throw error;
    }
  }
  applyProgrammaticSelection(model) {
    this._clearIntent();
    this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.ProgrammaticSelection });
    this._applyModel(model);
  }
  requestProgrammaticSelection(resolveModel, conversationKey) {
    this._clearIntent();
    this._selectionReason = ModelSelectionReason.ProgrammaticSelection;
    return new Promise((resolve) => {
      let complete = resolve;
      this._intent = {
        resolveModel,
        conversationKey,
        complete: (applied) => {
          complete(applied);
          complete = () => {
          };
        }
      };
      this._reconcileIntent();
    });
  }
  initialize(rememberedModelId) {
    this._clearIntent();
    if (!this._intendedModel) {
      this._remember(rememberedModelId ? { modelId: rememberedModelId, reason: ModelSelectionReason.Remembered } : void 0);
    }
    const resolveSelection = () => {
      const configuredModelValue = this._runtime.getConfiguredModelValue();
      const models = this._pool();
      const configuredModel = this._runtime.isEmpty() ? resolveConfiguredModel(configuredModelValue, models) : void 0;
      const resolution = resolveModelIdentifier(models, rememberedModelId, false);
      return resolveInitialModelSelection({
        configuredModel,
        desiredModelResolution: resolution,
        desiredReason: ModelSelectionReason.Remembered,
        fallbackModel: findDefaultModel(models, this._runtime.location),
        fallbackReason: ModelSelectionReason.FirstAvailable
      });
    };
    const selection = resolveSelection();
    this._reportInitialization(this._runtime.getConfiguredModelValue(), rememberedModelId, selection);
    if (selection.kind === "apply") {
      this._selectionReason = selection.reason;
      this._applyModel(selection.model);
      this.ensureCurrentModelSupported();
    } else if (selection.kind === "pending") {
      const fallbackModel = findDefaultModel(this._pool(), this._runtime.location);
      if (fallbackModel) {
        this._selectionReason = ModelSelectionReason.FirstAvailable;
        this._applyModel(fallbackModel);
      }
    }
  }
  ensureCurrentModelSupported() {
    const currentModel = this._currentModel.get();
    const sessionType = this._runtime.getCurrentSessionType();
    const models = this._pool(sessionType);
    const context = {
      location: this._runtime.location,
      currentModeKind: this._runtime.getCurrentModeKind(),
      sessionType
    };
    const willReset = shouldResetModelToDefault(currentModel, models, context, this._runtime.getAllModels());
    this._diagnostics.report("compatibility-check", {
      currentModel: currentModel?.identifier,
      mode: context.currentModeKind,
      sessionType,
      willReset
    }, willReset ? "info" : "debug");
    if (willReset) {
      this.selectDefault(sessionType);
    }
  }
  selectDefault(sessionType = this._runtime.getCurrentSessionType()) {
    const allModels = this._runtime.getAllModels();
    if (sessionType && this._runtime.requiresCustomModels(sessionType) && !hasModelsTargetingSession(allModels, sessionType)) {
      return;
    }
    const models = this._pool(sessionType);
    const configuredModel = resolveConfiguredModel(this._runtime.getConfiguredModelValue(), models);
    const defaultModel = configuredModel ?? findDefaultModel(models, this._runtime.location);
    this._diagnostics.report("select-default", {
      configuredModel: configuredModel?.identifier,
      defaultModel: defaultModel?.identifier,
      currentModel: this._currentModel.get()?.identifier
    }, defaultModel ? "info" : "debug");
    if (!defaultModel) {
      return;
    }
    if (!this.hasPendingProgrammaticSelection()) {
      this._selectionReason = configuredModel ? ModelSelectionReason.ConfiguredDefault : ModelSelectionReason.FirstAvailable;
    }
    this._applyModel(defaultModel);
  }
  applyConfiguredDefault() {
    if (!this._runtime.isEmpty() || isInConversationModelChoice(this._selectionReason) || this._intent) {
      return false;
    }
    const configuredValue = this._runtime.getConfiguredModelValue();
    if (!configuredValue) {
      return false;
    }
    const configuredModel = resolveConfiguredModel(configuredValue, this._pool());
    if (!configuredModel) {
      return false;
    }
    if (configuredModel.identifier === this._currentModel.get()?.identifier) {
      if (this._selectionReason !== ModelSelectionReason.ConfiguredDefault) {
        this._selectionReason = ModelSelectionReason.ConfiguredDefault;
        return true;
      }
      return false;
    }
    this._selectionReason = ModelSelectionReason.ConfiguredDefault;
    this._applyModel(configuredModel);
    this.ensureCurrentModelSupported();
    return true;
  }
  reconcileModelListChange(models) {
    if (this.applyConfiguredDefault() || this._reconcileIntent() || this._restoreRememberedModel()) {
      return;
    }
    const currentModel = this._currentModel.get();
    const locationDefault = models.find((model) => model.metadata.isDefaultForLocation[this._runtime.location]);
    if (this._runtime.isEmpty() && this._selectionReason === ModelSelectionReason.FirstAvailable && locationDefault && currentModel?.identifier !== locationDefault.identifier) {
      this._applyModel(locationDefault);
      return;
    }
    if (!shouldResetOnModelListChange(currentModel?.identifier, [...models])) {
      return;
    }
    const match = findBestMatchingModel(currentModel, models);
    if (match) {
      this._applyModel(match);
    } else {
      this.selectDefault();
    }
  }
  /**
   * Reclaims the conversation's intended model whenever the catalog can offer it, however late
   * that is. A model can go missing for reasons unrelated to intent — an agent host publishes its
   * catalog in waves, and restarting one drops and republishes all of it — so whatever is shown
   * meanwhile is only a stand-in and may be superseded.
   *
   * The intent is read from the bound conversation, so another conversation's choice is not
   * reachable here and cannot be applied to this one.
   */
  _restoreRememberedModel() {
    const remembered = this._intendedModel;
    if (!remembered || this._currentModel.get()?.identifier === remembered.modelId) {
      return false;
    }
    if (this._selectionReason === ModelSelectionReason.ConfiguredDefault && !isInConversationModelChoice(remembered.reason)) {
      return false;
    }
    const pool = this._pool();
    const exact = pool.find((model2) => model2.identifier === remembered.modelId);
    const model = exact ?? (remembered.reason === ModelSelectionReason.SessionRestore ? findBestMatchingModel(remembered.model, pool) : void 0);
    if (!model || !exact && this._currentModel.get()?.identifier === model.identifier) {
      return false;
    }
    this._diagnostics.report("restore-remembered-model", { model: model.identifier, remembered: remembered.modelId, reason: remembered.reason }, "info");
    this._selectionReason = remembered.reason;
    if (exact && remembered.configuration) {
      this._runtime.restoreModelConfiguration(remembered.modelId, remembered.configuration);
    }
    this._applyModel(model);
    return true;
  }
  syncFromConversationState(desiredModel, modelConfiguration, sessionType, conversationKey, isRemoteEdit = false) {
    if (!isRemoteEdit && this._isEchoOfStandIn(desiredModel.identifier, conversationKey)) {
      this._diagnostics.report("conversation-restore-echo-ignored", {
        desiredModel: desiredModel.identifier,
        awaitingModel: this._intendedModel?.modelId
      }, "info");
      return;
    }
    const allModels = this._runtime.getAllModels();
    const currentModel = this._currentModel.get();
    const syncResult = resolveModelFromSyncState(desiredModel, currentModel, allModels, sessionType, {
      location: this._runtime.location,
      currentModeKind: this._runtime.getCurrentModeKind(),
      sessionType
    });
    this._diagnostics.report("conversation-restore", {
      desiredModel: desiredModel.identifier,
      currentModel: currentModel?.identifier,
      sessionType,
      action: syncResult.action
    }, syncResult.action === "keep" ? "debug" : "info");
    if (syncResult.action === "apply" || syncResult.action === "keep") {
      this._applySessionRestore(desiredModel, syncResult.action === "apply", modelConfiguration, conversationKey);
      return;
    }
    this._rememberOnBoundConversation(desiredModel, modelConfiguration, conversationKey);
    this._clearIntent();
    const pool = this._pool(sessionType);
    const match = findBestMatchingModel(desiredModel, pool) ?? findBestMatchingModel(currentModel, pool);
    if (match) {
      this._applyModel(match);
      this._selectionReason = ModelSelectionReason.SessionRestore;
    } else {
      this.selectDefault(sessionType);
    }
  }
  /**
   * Whether a conversation-state sync is just this controller's own stand-in coming back.
   *
   * Applying a model writes it into the conversation's input state, which the local sync hands
   * straight back. While the real model is still missing, that echo would be mistaken for the
   * conversation's own model and overwrite the selection being awaited — the loop that makes a
   * transient stand-in stick for good.
   *
   * Only the model currently standing in counts, and only for a local write: a peer genuinely
   * selecting it arrives as {@link ChatInputStateOrigin.Remote} and still wins.
   */
  _isEchoOfStandIn(desiredModelId, conversationKey) {
    return this._runtime.getBoundConversationKey() === conversationKey && desiredModelId === this._standInModelId && this.isAwaitingRememberedModel();
  }
  /**
   * The model on screen only because the intended one cannot be offered yet — that is, whatever is
   * displayed while it differs from the intent. Derived rather than tracked so it cannot fall out
   * of step with either.
   */
  get _standInModelId() {
    const intended = this._intendedModel;
    const displayed = this._currentModel.get()?.identifier;
    return intended && displayed !== intended.modelId ? displayed : void 0;
  }
  /** Replaces the bound conversation's intended model. */
  _remember(selection) {
    this._runtime.getIntentHolder().setIntendedModel(selection);
  }
  /** The intended model of the conversation this input is currently bound to. */
  get _intendedModel() {
    return this._runtime.getIntentHolder().intendedModel;
  }
  /** The models selectable for the bound session right now. */
  _pool(sessionType = this._runtime.getCurrentSessionType()) {
    return this._runtime.getModels(sessionType);
  }
  /**
   * Records the conversation's model as the one to reclaim, unless this sync belongs to a
   * conversation the input has already moved off — a late sync for an outgoing session must not
   * dictate the active one's model.
   */
  _rememberOnBoundConversation(model, configuration, conversationKey) {
    if (this._runtime.getBoundConversationKey() !== conversationKey) {
      return;
    }
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration });
  }
  /**
   * Re-seeds from storage when the current model is absent from the destination session's pool,
   * restoring the user's previous selection for that pool. Uses the filtered pool so a model that
   * is catalogued but not valid for the destination is caught before targeted models load.
   */
  reinitializeIfOutsidePool(initialize) {
    const currentModel = this._currentModel.get();
    if (!currentModel || this._pool().some((model) => model.identifier === currentModel.identifier)) {
      return;
    }
    initialize();
    this.ensureCurrentModelSupported();
  }
  revalidateForSessionType(initialize) {
    const previousModel = this._currentModel.get();
    this._selectionReason = void 0;
    initialize();
    const restoredModel = this._currentModel.get();
    const sessionType = this._runtime.getCurrentSessionType();
    const models = this._pool(sessionType);
    if (restoredModel && models.some((model) => model.identifier === restoredModel.identifier)) {
      return;
    }
    const match = findBestMatchingModel(previousModel, models);
    if (match) {
      this._applyModel(match);
    } else if (models.length === 0) {
      this._currentModel.set(void 0, void 0);
    } else {
      this.selectDefault(sessionType);
    }
  }
  resolveDraftModel(draftModel, sessionTypeForValidation, validatePool) {
    let model = draftModel;
    if (validatePool && shouldDropAgnosticDraftModel(model, this._runtime.getAllModels(), sessionTypeForValidation)) {
      model = void 0;
    }
    const configuredValue = this._runtime.getConfiguredModelValue();
    if (configuredValue) {
      model = resolveConfiguredModel(configuredValue, this._pool());
    }
    return { model, changed: model?.identifier !== draftModel?.identifier };
  }
  _applySessionRestore(model, applyModel, configuration, conversationKey) {
    this._clearIntent();
    this._selectionReason = ModelSelectionReason.SessionRestore;
    this._remember({ modelId: model.identifier, model, reason: ModelSelectionReason.SessionRestore, configuration });
    if (configuration) {
      this._runtime.restoreModelConfiguration(model.identifier, configuration);
    }
    if (applyModel) {
      this._applyModel(model);
    }
  }
  _reconcileIntent() {
    const intent = this._intent;
    if (!intent) {
      return false;
    }
    if (this._runtime.getBoundConversationKey() !== intent.conversationKey) {
      this._clearIntent();
      return true;
    }
    const model = intent.resolveModel();
    if (!model) {
      return false;
    }
    this._intent = void 0;
    intent.complete(true);
    this.applyProgrammaticSelection(model);
    return true;
  }
  _clearIntent() {
    const intent = this._intent;
    this._intent = void 0;
    if (intent) {
      intent.complete(false);
      if (this._selectionReason === ModelSelectionReason.ProgrammaticSelection) {
        this._selectionReason = void 0;
      }
    }
  }
  /** Shows `model` without touching the authority already in force. */
  _display(model) {
    this._currentModel.set(model, void 0);
  }
  _applyModel(model) {
    this._display(model);
    this._runtime.applyModel(model);
  }
  _reportInitialization(configuredModel, rememberedModel, selection) {
    this._diagnostics.report("initialize", {
      configuredModel,
      rememberedModel,
      availableModels: this._pool().map((model) => model.identifier).join(","),
      selection: selection.kind,
      resultModel: selection.kind === "apply" ? selection.model.identifier : void 0,
      resultReason: selection.kind === "apply" ? selection.reason : void 0,
      pendingReference: selection.kind === "pending" ? selection.selection.reference : void 0
    }, selection.kind === "none" ? "debug" : "info");
  }
}
export {
  ChatInputModelSelectionController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElJbnRlbmRlZE1vZGVsSG9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJSW50ZW5kZWRNb2RlbFNlbGVjdGlvbiwgSW5pdGlhbE1vZGVsU2VsZWN0aW9uUmVzdWx0LCBpc0luQ29udmVyc2F0aW9uTW9kZWxDaG9pY2UsIE1vZGVsU2VsZWN0aW9uQXBwbHlSZWFzb24sIE1vZGVsU2VsZWN0aW9uUmVhc29uLCByZXNvbHZlQ29uZmlndXJlZE1vZGVsLCByZXNvbHZlSW5pdGlhbE1vZGVsU2VsZWN0aW9uLCByZXNvbHZlTW9kZWxJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsU2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IGZpbmRCZXN0TWF0Y2hpbmdNb2RlbCwgZmluZERlZmF1bHRNb2RlbCwgaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbiwgcmVzb2x2ZU1vZGVsRnJvbVN5bmNTdGF0ZSwgc2hvdWxkRHJvcEFnbm9zdGljRHJhZnRNb2RlbCwgc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdCwgc2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZSB9IGZyb20gJy4vY2hhdElucHV0TW9kZWxVdGlscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MsIE51bGxDaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcyB9IGZyb20gJy4vY2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MuanMnO1xuXG4vKiogU3VwcGxpZXMgV29ya2JlbmNoIGNoYXQncyBmaWx0ZXJlZCBtb2RlbCBjYXRhbG9nIGFuZCBjb252ZXJzYXRpb24gZWZmZWN0cy4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSB7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbjtcblx0cmVhZG9ubHkgZ2V0Q3VycmVudE1vZGVLaW5kOiAoKSA9PiBDaGF0TW9kZUtpbmQ7XG5cdHJlYWRvbmx5IGdldEN1cnJlbnRTZXNzaW9uVHlwZTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpc0VtcHR5OiAoKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBnZXRNb2RlbHM6IChzZXNzaW9uVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXTtcblx0cmVhZG9ubHkgZ2V0QWxsTW9kZWxzOiAoKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXTtcblx0cmVhZG9ubHkgcmVxdWlyZXNDdXN0b21Nb2RlbHM6IChzZXNzaW9uVHlwZTogc3RyaW5nKSA9PiBib29sZWFuO1xuXHRyZWFkb25seSBnZXRDb25maWd1cmVkTW9kZWxWYWx1ZTogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBzdWJzY3JpYmVUb01vZGVsQ2hhbmdlczogKGxpc3RlbmVyOiAoKSA9PiB2b2lkKSA9PiBJRGlzcG9zYWJsZTtcblx0cmVhZG9ubHkgZ2V0Qm91bmRDb252ZXJzYXRpb25LZXk6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFdob2V2ZXIgc3BlYWtzIGZvciB0aGUgYm91bmQgY29udmVyc2F0aW9uJ3MgaW50ZW5kZWQgbW9kZWwgXHUyMDE0IHRoZSBjb252ZXJzYXRpb24sIGVsc2UgdGhlIGNvbXBvc2VyLiAqL1xuXHRyZWFkb25seSBnZXRJbnRlbnRIb2xkZXI6ICgpID0+IElJbnRlbmRlZE1vZGVsSG9sZGVyO1xuXHRyZWFkb25seSByZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uOiAobW9kZWxJZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgYXBwbHlNb2RlbDogKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpID0+IHZvaWQ7XG59XG5cbmludGVyZmFjZSBJUmVzb2x2ZWREcmFmdE1vZGVsU2VsZWN0aW9uIHtcblx0cmVhZG9ubHkgbW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hhbmdlZDogYm9vbGVhbjtcbn1cblxuLyoqIEEgbW9kZWwgc2VsZWN0aW9uIHRoYXQgY2Fubm90IGJlIGFwcGxpZWQgeWV0IGJlY2F1c2UgdGhlIGNhdGFsb2cgaGFzIG5vdCBwdWJsaXNoZWQgaXQuICovXG5pbnRlcmZhY2UgTW9kZWxTZWxlY3Rpb25JbnRlbnQge1xuXHRyZWFkb25seSByZXNvbHZlTW9kZWw6ICgpID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29udmVyc2F0aW9uS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbXBsZXRlOiAoYXBwbGllZDogYm9vbGVhbikgPT4gdm9pZDtcbn1cblxuLyoqIFJlY29uY2lsZXMgdGhlIHNoYXJlZCBzZWxlY3Rpb24gbW9kZWwgd2l0aCBXb3JrYmVuY2gtc3BlY2lmaWMgaW5wdXQgYW5kIGNhdGFsb2cgc3RhdGUuICovXG5leHBvcnQgY2xhc3MgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudE1vZGVsID0gb2JzZXJ2YWJsZVZhbHVlPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgY3VycmVudE1vZGVsOiBJT2JzZXJ2YWJsZTxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ+ID0gdGhpcy5fY3VycmVudE1vZGVsO1xuXHRwcml2YXRlIF9zZWxlY3Rpb25SZWFzb246IE1vZGVsU2VsZWN0aW9uQXBwbHlSZWFzb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2ludGVudDogTW9kZWxTZWxlY3Rpb25JbnRlbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Jlc3RvcmVQZXJUeXBlTW9kZWwgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ydW50aW1lOiBJQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25SdW50aW1lLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpYWdub3N0aWNzOiBJQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MgPSBOdWxsQ2hhdE1vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcnVudGltZS5zdWJzY3JpYmVUb01vZGVsQ2hhbmdlcygoKSA9PiB0aGlzLnJlY29uY2lsZU1vZGVsTGlzdENoYW5nZSh0aGlzLl9wb29sKCkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2NsZWFySW50ZW50KCkpKTtcblx0fVxuXG5cdGdldCByZXN0b3JlUGVyVHlwZU1vZGVsKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXN0b3JlUGVyVHlwZU1vZGVsO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGlvblJlYXNvbigpOiBNb2RlbFNlbGVjdGlvbkFwcGx5UmVhc29uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0aW9uUmVhc29uO1xuXHR9XG5cblx0YmVnaW5TZXNzaW9uU3dpdGNoKGlzRW1wdHk6IGJvb2xlYW4sIG93bnNQb29sOiBib29sZWFuLCBoYWRJbmNvbWluZ01vZGVsOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Jlc3RvcmVQZXJUeXBlTW9kZWwgPSBpc0VtcHR5ICYmIG93bnNQb29sICYmICFoYWRJbmNvbWluZ01vZGVsO1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdH1cblxuXHRlbmRTZXNzaW9uU3dpdGNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc3RvcmVQZXJUeXBlTW9kZWwgPSBmYWxzZTtcblx0fVxuXG5cdGhhc1BlbmRpbmdJbnRlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5faW50ZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgd2hpbGUgdGhlIHJlbWVtYmVyZWQgbW9kZWwgaXMgbm90IHNlbGVjdGFibGUsIGkuZS4gd2hhdGV2ZXIgaXMgY3VycmVudGx5IHNlbGVjdGVkIGlzIGFcblx0ICogc3RhbmQtaW4gdGhhdCB7QGxpbmsgX3Jlc3RvcmVSZW1lbWJlcmVkTW9kZWx9IHdpbGwgcmVwbGFjZSBvbmNlIHRoZSBjYXRhbG9nIG9mZmVycyB0aGUgcmVhbFxuXHQgKiBvbmUuIENhbGxlcnMgdXNlIHRoaXMgdG8gYXZvaWQgYWN0aW5nIG9uIGEgc2VsZWN0aW9uIHRoYXQgaXMgYWJvdXQgdG8gY2hhbmdlLlxuXHQgKi9cblx0aXNBd2FpdGluZ1JlbWVtYmVyZWRNb2RlbCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBtb2RlbElkID0gdGhpcy5faW50ZW5kZWRNb2RlbD8ubW9kZWxJZDtcblx0XHRyZXR1cm4gISFtb2RlbElkICYmICF0aGlzLl9wb29sKCkuc29tZShtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSBtb2RlbElkKTtcblx0fVxuXG5cdGhhc1BlbmRpbmdQcm9ncmFtbWF0aWNTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5faW50ZW50O1xuXHR9XG5cblx0Y2xlYXJJbnRlbnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2xlYXJJbnRlbnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93cyBgbW9kZWxgIGFuZCBydW5zIGBhcHBseWAuIEEgdXNlciBhY3Rpb24gY2xhaW1zIGF1dGhvcml0eSBvdmVyIHRoZSBjb252ZXJzYXRpb24gYW5kIGlzXG5cdCAqIHJvbGxlZCBiYWNrIGlmIGBhcHBseWAgdGhyb3dzOyBhbnl0aGluZyBlbHNlIGlzIGEgbWVjaGFuaWNhbCBmb2xsb3ctb24gdGhhdCBsZWF2ZXMgdGhlXG5cdCAqIGNvbnZlcnNhdGlvbidzIGludGVudCBcdTIwMTQgYW5kIHRoZSBhdXRob3JpdHkgYWxyZWFkeSBpbiBmb3JjZSBcdTIwMTQgdW50b3VjaGVkLlxuXHQgKi9cblx0YXBwbHlTZWxlY3Rpb24oXG5cdFx0bW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0XHRhcHBseTogKCkgPT4gdm9pZCxcblx0XHRpc1VzZXJBY3Rpb246IGJvb2xlYW4sXG5cdFx0cm9sbGJhY2tPbkVycm9yID0gZmFsc2UsXG5cdCk6IHZvaWQge1xuXHRcdGlmICghaXNVc2VyQWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9kaXNwbGF5KG1vZGVsKTtcblx0XHRcdGFwcGx5KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0Y29uc3QgcHJldmlvdXNNb2RlbCA9IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKTtcblx0XHRjb25zdCBwcmV2aW91c1JlYXNvbiA9IHRoaXMuX3NlbGVjdGlvblJlYXNvbjtcblx0XHRjb25zdCBwcmV2aW91c1JlbWVtYmVyZWRTZWxlY3Rpb24gPSB0aGlzLl9pbnRlbmRlZE1vZGVsO1xuXHRcdHRoaXMuX2N1cnJlbnRNb2RlbC5zZXQobW9kZWwsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gTW9kZWxTZWxlY3Rpb25SZWFzb24uVXNlclNlbGVjdGlvbjtcblx0XHR0aGlzLl9yZW1lbWJlcih7IG1vZGVsSWQ6IG1vZGVsLmlkZW50aWZpZXIsIG1vZGVsLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlVzZXJTZWxlY3Rpb24gfSk7XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdleHBsaWNpdC1zZWxlY3Rpb24nLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyIH0sICdpbmZvJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGFwcGx5KCk7XG5cdFx0XHR0aGlzLl9kaWFnbm9zdGljcy5yZXBvcnQoJ2V4cGxpY2l0LXNlbGVjdGlvbi1hcHBsaWVkJywgeyBtb2RlbDogbW9kZWwuaWRlbnRpZmllciB9LCAnaW5mbycpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAocm9sbGJhY2tPbkVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRNb2RlbC5zZXQocHJldmlvdXNNb2RlbCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gcHJldmlvdXNSZWFzb247XG5cdFx0XHRcdHRoaXMuX3JlbWVtYmVyKHByZXZpb3VzUmVtZW1iZXJlZFNlbGVjdGlvbik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kaWFnbm9zdGljcy5yZXBvcnQoJ2V4cGxpY2l0LXNlbGVjdGlvbi1mYWlsZWQnLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyLCBlcnJvcjogU3RyaW5nKGVycm9yKSB9LCAnZXJyb3InKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFwcGx5UHJvZ3JhbW1hdGljU2VsZWN0aW9uKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhckludGVudCgpO1xuXHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IE1vZGVsU2VsZWN0aW9uUmVhc29uLlByb2dyYW1tYXRpY1NlbGVjdGlvbjtcblx0XHR0aGlzLl9yZW1lbWJlcih7IG1vZGVsSWQ6IG1vZGVsLmlkZW50aWZpZXIsIG1vZGVsLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlByb2dyYW1tYXRpY1NlbGVjdGlvbiB9KTtcblx0XHR0aGlzLl9hcHBseU1vZGVsKG1vZGVsKTtcblx0fVxuXG5cdHJlcXVlc3RQcm9ncmFtbWF0aWNTZWxlY3Rpb24oXG5cdFx0cmVzb2x2ZU1vZGVsOiAoKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdFx0Y29udmVyc2F0aW9uS2V5OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gTW9kZWxTZWxlY3Rpb25SZWFzb24uUHJvZ3JhbW1hdGljU2VsZWN0aW9uO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdGxldCBjb21wbGV0ZSA9IHJlc29sdmU7XG5cdFx0XHR0aGlzLl9pbnRlbnQgPSB7XG5cdFx0XHRcdHJlc29sdmVNb2RlbCxcblx0XHRcdFx0Y29udmVyc2F0aW9uS2V5LFxuXHRcdFx0XHRjb21wbGV0ZTogYXBwbGllZCA9PiB7XG5cdFx0XHRcdFx0Y29tcGxldGUoYXBwbGllZCk7XG5cdFx0XHRcdFx0Y29tcGxldGUgPSAoKSA9PiB7IH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlSW50ZW50KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRpbml0aWFsaXplKHJlbWVtYmVyZWRNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhckludGVudCgpO1xuXHRcdC8vIFRoZSBwcm9maWxlIHByZWZlcmVuY2UgYmVsb25ncyB0byBubyBjb252ZXJzYXRpb24sIHNvIGl0IHNlZWRzIG9uZSB0aGF0IGhhcyBub3QgY2hvc2VuIGFcblx0XHQvLyBtb2RlbCBidXQgbmV2ZXIgZGlzcGxhY2VzIG9uZSB0aGF0IGhhcyBcdTIwMTQgdGhlIGNvbnZlcnNhdGlvbidzIG93biBtb2RlbCBvdXRyYW5rcyBpdCwgYW5kXG5cdFx0Ly8gcmUtaW5pdGlhbGl6aW5nIG9uIGEgcG9vbCByZWJpbmQgbXVzdCBub3QgZXJhc2Ugd2hhdCBpdCBpcyB3YWl0aW5nIGZvci5cblx0XHRpZiAoIXRoaXMuX2ludGVuZGVkTW9kZWwpIHtcblx0XHRcdC8vIFN0b3JhZ2UgcmVjb3JkcyBvbmx5IGV4cGxpY2l0IHBpY2tzLCBidXQgaXQgaXMgbm90IGFuIGluLWNvbnZlcnNhdGlvbiBjaG9pY2U6IGEgbmV3XG5cdFx0XHQvLyBjb252ZXJzYXRpb24gc3RpbGwgbGV0cyBgY2hhdC5kZWZhdWx0TW9kZWxgIHRha2UgcHJlY2VkZW5jZSBvdmVyIGl0LlxuXHRcdFx0dGhpcy5fcmVtZW1iZXIocmVtZW1iZXJlZE1vZGVsSWQgPyB7IG1vZGVsSWQ6IHJlbWVtYmVyZWRNb2RlbElkLCByZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlJlbWVtYmVyZWQgfSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVTZWxlY3Rpb24gPSAoKTogSW5pdGlhbE1vZGVsU2VsZWN0aW9uUmVzdWx0ID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRNb2RlbFZhbHVlID0gdGhpcy5fcnVudGltZS5nZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fcG9vbCgpO1xuXHRcdFx0Ly8gYGNoYXQuZGVmYXVsdE1vZGVsYCBzZWVkcyBuZXcgY29udmVyc2F0aW9ucyBvbmx5OyBhIGNvbnZlcnNhdGlvbiB3aXRoIGhpc3Rvcnkga2VlcHNcblx0XHRcdC8vIHRoZSBtb2RlbCBpdCB3YXMgc3RhcnRlZCB3aXRoLlxuXHRcdFx0Y29uc3QgY29uZmlndXJlZE1vZGVsID0gdGhpcy5fcnVudGltZS5pc0VtcHR5KCkgPyByZXNvbHZlQ29uZmlndXJlZE1vZGVsKGNvbmZpZ3VyZWRNb2RlbFZhbHVlLCBtb2RlbHMpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVzb2x1dGlvbiA9IHJlc29sdmVNb2RlbElkZW50aWZpZXIobW9kZWxzLCByZW1lbWJlcmVkTW9kZWxJZCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuIHJlc29sdmVJbml0aWFsTW9kZWxTZWxlY3Rpb24oe1xuXHRcdFx0XHRjb25maWd1cmVkTW9kZWwsXG5cdFx0XHRcdGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHJlc29sdXRpb24sXG5cdFx0XHRcdGRlc2lyZWRSZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLlJlbWVtYmVyZWQsXG5cdFx0XHRcdGZhbGxiYWNrTW9kZWw6IGZpbmREZWZhdWx0TW9kZWwobW9kZWxzLCB0aGlzLl9ydW50aW1lLmxvY2F0aW9uKSxcblx0XHRcdFx0ZmFsbGJhY2tSZWFzb246IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlLFxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHJlc29sdmVTZWxlY3Rpb24oKTtcblx0XHR0aGlzLl9yZXBvcnRJbml0aWFsaXphdGlvbih0aGlzLl9ydW50aW1lLmdldENvbmZpZ3VyZWRNb2RlbFZhbHVlKCksIHJlbWVtYmVyZWRNb2RlbElkLCBzZWxlY3Rpb24pO1xuXHRcdGlmIChzZWxlY3Rpb24ua2luZCA9PT0gJ2FwcGx5Jykge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gc2VsZWN0aW9uLnJlYXNvbjtcblx0XHRcdHRoaXMuX2FwcGx5TW9kZWwoc2VsZWN0aW9uLm1vZGVsKTtcblx0XHRcdHRoaXMuZW5zdXJlQ3VycmVudE1vZGVsU3VwcG9ydGVkKCk7XG5cdFx0fSBlbHNlIGlmIChzZWxlY3Rpb24ua2luZCA9PT0gJ3BlbmRpbmcnKSB7XG5cdFx0XHQvLyBUaGUgcmVtZW1iZXJlZCBtb2RlbCBpc24ndCBpbiB0aGUgY2F0YWxvZyB5ZXQuIFNob3cgdGhlIGRlZmF1bHQgbWVhbndoaWxlO1xuXHRcdFx0Ly8gYF9yZXN0b3JlUmVtZW1iZXJlZE1vZGVsYCBjbGFpbXMgdGhlIHJlYWwgb25lIGFzIHNvb24gYXMgaXQgaXMgcHVibGlzaGVkLlxuXHRcdFx0Y29uc3QgZmFsbGJhY2tNb2RlbCA9IGZpbmREZWZhdWx0TW9kZWwodGhpcy5fcG9vbCgpLCB0aGlzLl9ydW50aW1lLmxvY2F0aW9uKTtcblx0XHRcdGlmIChmYWxsYmFja01vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlO1xuXHRcdFx0XHR0aGlzLl9hcHBseU1vZGVsKGZhbGxiYWNrTW9kZWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGVuc3VyZUN1cnJlbnRNb2RlbFN1cHBvcnRlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpO1xuXHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuX3Bvb2woc2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSB7XG5cdFx0XHRsb2NhdGlvbjogdGhpcy5fcnVudGltZS5sb2NhdGlvbixcblx0XHRcdGN1cnJlbnRNb2RlS2luZDogdGhpcy5fcnVudGltZS5nZXRDdXJyZW50TW9kZUtpbmQoKSxcblx0XHRcdHNlc3Npb25UeXBlLFxuXHRcdH07XG5cdFx0Y29uc3Qgd2lsbFJlc2V0ID0gc2hvdWxkUmVzZXRNb2RlbFRvRGVmYXVsdChjdXJyZW50TW9kZWwsIG1vZGVscywgY29udGV4dCwgdGhpcy5fcnVudGltZS5nZXRBbGxNb2RlbHMoKSk7XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdjb21wYXRpYmlsaXR5LWNoZWNrJywge1xuXHRcdFx0Y3VycmVudE1vZGVsOiBjdXJyZW50TW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRtb2RlOiBjb250ZXh0LmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdHNlc3Npb25UeXBlLFxuXHRcdFx0d2lsbFJlc2V0LFxuXHRcdH0sIHdpbGxSZXNldCA/ICdpbmZvJyA6ICdkZWJ1ZycpO1xuXHRcdGlmICh3aWxsUmVzZXQpIHtcblx0XHRcdHRoaXMuc2VsZWN0RGVmYXVsdChzZXNzaW9uVHlwZSk7XG5cdFx0fVxuXHR9XG5cblx0c2VsZWN0RGVmYXVsdChzZXNzaW9uVHlwZSA9IHRoaXMuX3J1bnRpbWUuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCkpOiB2b2lkIHtcblx0XHRjb25zdCBhbGxNb2RlbHMgPSB0aGlzLl9ydW50aW1lLmdldEFsbE1vZGVscygpO1xuXHRcdGlmIChzZXNzaW9uVHlwZSAmJiB0aGlzLl9ydW50aW1lLnJlcXVpcmVzQ3VzdG9tTW9kZWxzKHNlc3Npb25UeXBlKSAmJiAhaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbihhbGxNb2RlbHMsIHNlc3Npb25UeXBlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLl9wb29sKHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBjb25maWd1cmVkTW9kZWwgPSByZXNvbHZlQ29uZmlndXJlZE1vZGVsKHRoaXMuX3J1bnRpbWUuZ2V0Q29uZmlndXJlZE1vZGVsVmFsdWUoKSwgbW9kZWxzKTtcblx0XHRjb25zdCBkZWZhdWx0TW9kZWwgPSBjb25maWd1cmVkTW9kZWwgPz8gZmluZERlZmF1bHRNb2RlbChtb2RlbHMsIHRoaXMuX3J1bnRpbWUubG9jYXRpb24pO1xuXHRcdHRoaXMuX2RpYWdub3N0aWNzLnJlcG9ydCgnc2VsZWN0LWRlZmF1bHQnLCB7XG5cdFx0XHRjb25maWd1cmVkTW9kZWw6IGNvbmZpZ3VyZWRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdGRlZmF1bHRNb2RlbDogZGVmYXVsdE1vZGVsPy5pZGVudGlmaWVyLFxuXHRcdFx0Y3VycmVudE1vZGVsOiB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIsXG5cdFx0fSwgZGVmYXVsdE1vZGVsID8gJ2luZm8nIDogJ2RlYnVnJyk7XG5cdFx0aWYgKCFkZWZhdWx0TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmhhc1BlbmRpbmdQcm9ncmFtbWF0aWNTZWxlY3Rpb24oKSkge1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gY29uZmlndXJlZE1vZGVsID8gTW9kZWxTZWxlY3Rpb25SZWFzb24uQ29uZmlndXJlZERlZmF1bHQgOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5GaXJzdEF2YWlsYWJsZTtcblx0XHR9XG5cdFx0dGhpcy5fYXBwbHlNb2RlbChkZWZhdWx0TW9kZWwpO1xuXHR9XG5cblx0YXBwbHlDb25maWd1cmVkRGVmYXVsdCgpOiBib29sZWFuIHtcblx0XHQvLyBgY2hhdC5kZWZhdWx0TW9kZWxgIHNlZWRzIGV2ZXJ5IG5ldyAoZW1wdHkpIGNvbnZlcnNhdGlvbi4gT25seSBhIGdlbnVpbmUgaW4tY29udmVyc2F0aW9uXG5cdFx0Ly8gY2hvaWNlIGJsb2NrcyBpdDsgYSBgU2Vzc2lvblJlc3RvcmVgIG9uIGFuIGVtcHR5IHNlc3Npb24gaXMgc3BpbGxvdmVyIGZyb20gdGhlIHByZXZpb3VzXG5cdFx0Ly8gY29udmVyc2F0aW9uIGFuZCBtdXN0IHlpZWxkLlxuXHRcdGlmICghdGhpcy5fcnVudGltZS5pc0VtcHR5KClcblx0XHRcdHx8IGlzSW5Db252ZXJzYXRpb25Nb2RlbENob2ljZSh0aGlzLl9zZWxlY3Rpb25SZWFzb24pXG5cdFx0XHR8fCB0aGlzLl9pbnRlbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJlZFZhbHVlID0gdGhpcy5fcnVudGltZS5nZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpO1xuXHRcdGlmICghY29uZmlndXJlZFZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRNb2RlbCA9IHJlc29sdmVDb25maWd1cmVkTW9kZWwoY29uZmlndXJlZFZhbHVlLCB0aGlzLl9wb29sKCkpO1xuXHRcdGlmICghY29uZmlndXJlZE1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjb25maWd1cmVkTW9kZWwuaWRlbnRpZmllciA9PT0gdGhpcy5fY3VycmVudE1vZGVsLmdldCgpPy5pZGVudGlmaWVyKSB7XG5cdFx0XHRpZiAodGhpcy5fc2VsZWN0aW9uUmVhc29uICE9PSBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdCkge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25SZWFzb24gPSBNb2RlbFNlbGVjdGlvblJlYXNvbi5Db25maWd1cmVkRGVmYXVsdDtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IE1vZGVsU2VsZWN0aW9uUmVhc29uLkNvbmZpZ3VyZWREZWZhdWx0O1xuXHRcdHRoaXMuX2FwcGx5TW9kZWwoY29uZmlndXJlZE1vZGVsKTtcblx0XHR0aGlzLmVuc3VyZUN1cnJlbnRNb2RlbFN1cHBvcnRlZCgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmVjb25jaWxlTW9kZWxMaXN0Q2hhbmdlKG1vZGVsczogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hcHBseUNvbmZpZ3VyZWREZWZhdWx0KCkgfHwgdGhpcy5fcmVjb25jaWxlSW50ZW50KCkgfHwgdGhpcy5fcmVzdG9yZVJlbWVtYmVyZWRNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRNb2RlbCA9IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKTtcblx0XHRjb25zdCBsb2NhdGlvbkRlZmF1bHQgPSBtb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5tZXRhZGF0YS5pc0RlZmF1bHRGb3JMb2NhdGlvblt0aGlzLl9ydW50aW1lLmxvY2F0aW9uXSk7XG5cdFx0aWYgKHRoaXMuX3J1bnRpbWUuaXNFbXB0eSgpXG5cdFx0XHQmJiB0aGlzLl9zZWxlY3Rpb25SZWFzb24gPT09IE1vZGVsU2VsZWN0aW9uUmVhc29uLkZpcnN0QXZhaWxhYmxlXG5cdFx0XHQmJiBsb2NhdGlvbkRlZmF1bHRcblx0XHRcdCYmIGN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciAhPT0gbG9jYXRpb25EZWZhdWx0LmlkZW50aWZpZXIpIHtcblx0XHRcdHRoaXMuX2FwcGx5TW9kZWwobG9jYXRpb25EZWZhdWx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKGN1cnJlbnRNb2RlbD8uaWRlbnRpZmllciwgWy4uLm1vZGVsc10pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1hdGNoID0gZmluZEJlc3RNYXRjaGluZ01vZGVsKGN1cnJlbnRNb2RlbCwgbW9kZWxzKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdHRoaXMuX2FwcGx5TW9kZWwobWF0Y2gpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNlbGVjdERlZmF1bHQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVjbGFpbXMgdGhlIGNvbnZlcnNhdGlvbidzIGludGVuZGVkIG1vZGVsIHdoZW5ldmVyIHRoZSBjYXRhbG9nIGNhbiBvZmZlciBpdCwgaG93ZXZlciBsYXRlXG5cdCAqIHRoYXQgaXMuIEEgbW9kZWwgY2FuIGdvIG1pc3NpbmcgZm9yIHJlYXNvbnMgdW5yZWxhdGVkIHRvIGludGVudCBcdTIwMTQgYW4gYWdlbnQgaG9zdCBwdWJsaXNoZXMgaXRzXG5cdCAqIGNhdGFsb2cgaW4gd2F2ZXMsIGFuZCByZXN0YXJ0aW5nIG9uZSBkcm9wcyBhbmQgcmVwdWJsaXNoZXMgYWxsIG9mIGl0IFx1MjAxNCBzbyB3aGF0ZXZlciBpcyBzaG93blxuXHQgKiBtZWFud2hpbGUgaXMgb25seSBhIHN0YW5kLWluIGFuZCBtYXkgYmUgc3VwZXJzZWRlZC5cblx0ICpcblx0ICogVGhlIGludGVudCBpcyByZWFkIGZyb20gdGhlIGJvdW5kIGNvbnZlcnNhdGlvbiwgc28gYW5vdGhlciBjb252ZXJzYXRpb24ncyBjaG9pY2UgaXMgbm90XG5cdCAqIHJlYWNoYWJsZSBoZXJlIGFuZCBjYW5ub3QgYmUgYXBwbGllZCB0byB0aGlzIG9uZS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3RvcmVSZW1lbWJlcmVkTW9kZWwoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVtZW1iZXJlZCA9IHRoaXMuX2ludGVuZGVkTW9kZWw7XG5cdFx0aWYgKCFyZW1lbWJlcmVkIHx8IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciA9PT0gcmVtZW1iZXJlZC5tb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zZWxlY3Rpb25SZWFzb24gPT09IE1vZGVsU2VsZWN0aW9uUmVhc29uLkNvbmZpZ3VyZWREZWZhdWx0ICYmICFpc0luQ29udmVyc2F0aW9uTW9kZWxDaG9pY2UocmVtZW1iZXJlZC5yZWFzb24pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIFBvb2wgbWVtYmVyc2hpcCBpcyB0aGUgdmFsaWRpdHkgdGVzdDogdGhlIHBvb2wgaXMgYWxyZWFkeSBmaWx0ZXJlZCBieSBzZXNzaW9uIGFuZCBtb2RlLFxuXHRcdC8vIHNvIGEgbW9kZWwgdGhhdCBpcyBhYnNlbnQgaGVyZSBpcyBnZW51aW5lbHkgbm90IHNlbGVjdGFibGUgcmlnaHQgbm93LlxuXHRcdGNvbnN0IHBvb2wgPSB0aGlzLl9wb29sKCk7XG5cdFx0Y29uc3QgZXhhY3QgPSBwb29sLmZpbmQobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciA9PT0gcmVtZW1iZXJlZC5tb2RlbElkKTtcblx0XHQvLyBBIHBvb2wgY2FuIHJlcHVibGlzaCB0aGUgc2FtZSBtb2RlbCB1bmRlciBhIG5ldyBpZGVudGlmaWVyLCBzbyBhbiBlcXVpdmFsZW50IHNlcnZlcyB0aGVcblx0XHQvLyBjb252ZXJzYXRpb24gYmV0dGVyIHRoYW4gdGhlIGdlbmVyaWMgZGVmYXVsdC4gVGhlIHJlbWVtYmVyZWQgc2VsZWN0aW9uIGtlZXBzIHBvaW50aW5nIGF0XG5cdFx0Ly8gdGhlIG9yaWdpbmFsLCBzbyB0aGUgZXhhY3QgbW9kZWwgc3RpbGwgd2lucyBpZiBpdCBjb21lcyBiYWNrLlxuXHRcdGNvbnN0IG1vZGVsID0gZXhhY3QgPz8gKHJlbWVtYmVyZWQucmVhc29uID09PSBNb2RlbFNlbGVjdGlvblJlYXNvbi5TZXNzaW9uUmVzdG9yZSA/IGZpbmRCZXN0TWF0Y2hpbmdNb2RlbChyZW1lbWJlcmVkLm1vZGVsLCBwb29sKSA6IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAoIWV4YWN0ICYmIHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllciA9PT0gbW9kZWwuaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdyZXN0b3JlLXJlbWVtYmVyZWQtbW9kZWwnLCB7IG1vZGVsOiBtb2RlbC5pZGVudGlmaWVyLCByZW1lbWJlcmVkOiByZW1lbWJlcmVkLm1vZGVsSWQsIHJlYXNvbjogcmVtZW1iZXJlZC5yZWFzb24gfSwgJ2luZm8nKTtcblx0XHR0aGlzLl9zZWxlY3Rpb25SZWFzb24gPSByZW1lbWJlcmVkLnJlYXNvbjtcblx0XHRpZiAoZXhhY3QgJiYgcmVtZW1iZXJlZC5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHR0aGlzLl9ydW50aW1lLnJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb24ocmVtZW1iZXJlZC5tb2RlbElkLCByZW1lbWJlcmVkLmNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9hcHBseU1vZGVsKG1vZGVsKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoXG5cdFx0ZGVzaXJlZE1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsXG5cdFx0bW9kZWxDb25maWd1cmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCxcblx0XHRzZXNzaW9uVHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdGNvbnZlcnNhdGlvbktleTogc3RyaW5nLFxuXHRcdGlzUmVtb3RlRWRpdCA9IGZhbHNlLFxuXHQpOiB2b2lkIHtcblx0XHRpZiAoIWlzUmVtb3RlRWRpdCAmJiB0aGlzLl9pc0VjaG9PZlN0YW5kSW4oZGVzaXJlZE1vZGVsLmlkZW50aWZpZXIsIGNvbnZlcnNhdGlvbktleSkpIHtcblx0XHRcdHRoaXMuX2RpYWdub3N0aWNzLnJlcG9ydCgnY29udmVyc2F0aW9uLXJlc3RvcmUtZWNoby1pZ25vcmVkJywge1xuXHRcdFx0XHRkZXNpcmVkTW9kZWw6IGRlc2lyZWRNb2RlbC5pZGVudGlmaWVyLFxuXHRcdFx0XHRhd2FpdGluZ01vZGVsOiB0aGlzLl9pbnRlbmRlZE1vZGVsPy5tb2RlbElkLFxuXHRcdFx0fSwgJ2luZm8nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWxsTW9kZWxzID0gdGhpcy5fcnVudGltZS5nZXRBbGxNb2RlbHMoKTtcblx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk7XG5cdFx0Y29uc3Qgc3luY1Jlc3VsdCA9IHJlc29sdmVNb2RlbEZyb21TeW5jU3RhdGUoZGVzaXJlZE1vZGVsLCBjdXJyZW50TW9kZWwsIGFsbE1vZGVscywgc2Vzc2lvblR5cGUsIHtcblx0XHRcdGxvY2F0aW9uOiB0aGlzLl9ydW50aW1lLmxvY2F0aW9uLFxuXHRcdFx0Y3VycmVudE1vZGVLaW5kOiB0aGlzLl9ydW50aW1lLmdldEN1cnJlbnRNb2RlS2luZCgpLFxuXHRcdFx0c2Vzc2lvblR5cGUsXG5cdFx0fSk7XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdjb252ZXJzYXRpb24tcmVzdG9yZScsIHtcblx0XHRcdGRlc2lyZWRNb2RlbDogZGVzaXJlZE1vZGVsLmlkZW50aWZpZXIsXG5cdFx0XHRjdXJyZW50TW9kZWw6IGN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcixcblx0XHRcdHNlc3Npb25UeXBlLFxuXHRcdFx0YWN0aW9uOiBzeW5jUmVzdWx0LmFjdGlvbixcblx0XHR9LCBzeW5jUmVzdWx0LmFjdGlvbiA9PT0gJ2tlZXAnID8gJ2RlYnVnJyA6ICdpbmZvJyk7XG5cdFx0aWYgKHN5bmNSZXN1bHQuYWN0aW9uID09PSAnYXBwbHknIHx8IHN5bmNSZXN1bHQuYWN0aW9uID09PSAna2VlcCcpIHtcblx0XHRcdHRoaXMuX2FwcGx5U2Vzc2lvblJlc3RvcmUoZGVzaXJlZE1vZGVsLCBzeW5jUmVzdWx0LmFjdGlvbiA9PT0gJ2FwcGx5JywgbW9kZWxDb25maWd1cmF0aW9uLCBjb252ZXJzYXRpb25LZXkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBjb252ZXJzYXRpb24ncyBtb2RlbCBpcyBub3QgYXZhaWxhYmxlIHlldCwgdXN1YWxseSBiZWNhdXNlIGl0cyBwb29sIGlzIHN0aWxsXG5cdFx0Ly8gcHVibGlzaGluZy4gVGhhdCBzYXlzIG5vdGhpbmcgYWJvdXQgd2hhdCB0aGUgdXNlciBzaG91bGQgYmUgb24sIHNvIHJlbWVtYmVyIGl0IGFueXdheSBhbmRcblx0XHQvLyBzaG93IHRoZSBiZXN0IHN0YW5kLWluIHVudGlsIGBfcmVzdG9yZVJlbWVtYmVyZWRNb2RlbGAgY2FuIGNsYWltIHRoZSByZWFsIG9uZS5cblx0XHR0aGlzLl9yZW1lbWJlck9uQm91bmRDb252ZXJzYXRpb24oZGVzaXJlZE1vZGVsLCBtb2RlbENvbmZpZ3VyYXRpb24sIGNvbnZlcnNhdGlvbktleSk7XG5cdFx0dGhpcy5fY2xlYXJJbnRlbnQoKTtcblx0XHRjb25zdCBwb29sID0gdGhpcy5fcG9vbChzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgbWF0Y2ggPSBmaW5kQmVzdE1hdGNoaW5nTW9kZWwoZGVzaXJlZE1vZGVsLCBwb29sKSA/PyBmaW5kQmVzdE1hdGNoaW5nTW9kZWwoY3VycmVudE1vZGVsLCBwb29sKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdHRoaXMuX2FwcGx5TW9kZWwobWF0Y2gpO1xuXHRcdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2VsZWN0RGVmYXVsdChzZXNzaW9uVHlwZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYSBjb252ZXJzYXRpb24tc3RhdGUgc3luYyBpcyBqdXN0IHRoaXMgY29udHJvbGxlcidzIG93biBzdGFuZC1pbiBjb21pbmcgYmFjay5cblx0ICpcblx0ICogQXBwbHlpbmcgYSBtb2RlbCB3cml0ZXMgaXQgaW50byB0aGUgY29udmVyc2F0aW9uJ3MgaW5wdXQgc3RhdGUsIHdoaWNoIHRoZSBsb2NhbCBzeW5jIGhhbmRzXG5cdCAqIHN0cmFpZ2h0IGJhY2suIFdoaWxlIHRoZSByZWFsIG1vZGVsIGlzIHN0aWxsIG1pc3NpbmcsIHRoYXQgZWNobyB3b3VsZCBiZSBtaXN0YWtlbiBmb3IgdGhlXG5cdCAqIGNvbnZlcnNhdGlvbidzIG93biBtb2RlbCBhbmQgb3ZlcndyaXRlIHRoZSBzZWxlY3Rpb24gYmVpbmcgYXdhaXRlZCBcdTIwMTQgdGhlIGxvb3AgdGhhdCBtYWtlcyBhXG5cdCAqIHRyYW5zaWVudCBzdGFuZC1pbiBzdGljayBmb3IgZ29vZC5cblx0ICpcblx0ICogT25seSB0aGUgbW9kZWwgY3VycmVudGx5IHN0YW5kaW5nIGluIGNvdW50cywgYW5kIG9ubHkgZm9yIGEgbG9jYWwgd3JpdGU6IGEgcGVlciBnZW51aW5lbHlcblx0ICogc2VsZWN0aW5nIGl0IGFycml2ZXMgYXMge0BsaW5rIENoYXRJbnB1dFN0YXRlT3JpZ2luLlJlbW90ZX0gYW5kIHN0aWxsIHdpbnMuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0VjaG9PZlN0YW5kSW4oZGVzaXJlZE1vZGVsSWQ6IHN0cmluZywgY29udmVyc2F0aW9uS2V5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcnVudGltZS5nZXRCb3VuZENvbnZlcnNhdGlvbktleSgpID09PSBjb252ZXJzYXRpb25LZXlcblx0XHRcdCYmIGRlc2lyZWRNb2RlbElkID09PSB0aGlzLl9zdGFuZEluTW9kZWxJZFxuXHRcdFx0JiYgdGhpcy5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIG1vZGVsIG9uIHNjcmVlbiBvbmx5IGJlY2F1c2UgdGhlIGludGVuZGVkIG9uZSBjYW5ub3QgYmUgb2ZmZXJlZCB5ZXQgXHUyMDE0IHRoYXQgaXMsIHdoYXRldmVyIGlzXG5cdCAqIGRpc3BsYXllZCB3aGlsZSBpdCBkaWZmZXJzIGZyb20gdGhlIGludGVudC4gRGVyaXZlZCByYXRoZXIgdGhhbiB0cmFja2VkIHNvIGl0IGNhbm5vdCBmYWxsIG91dFxuXHQgKiBvZiBzdGVwIHdpdGggZWl0aGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX3N0YW5kSW5Nb2RlbElkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW50ZW5kZWQgPSB0aGlzLl9pbnRlbmRlZE1vZGVsO1xuXHRcdGNvbnN0IGRpc3BsYXllZCA9IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0XHRyZXR1cm4gaW50ZW5kZWQgJiYgZGlzcGxheWVkICE9PSBpbnRlbmRlZC5tb2RlbElkID8gZGlzcGxheWVkIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFJlcGxhY2VzIHRoZSBib3VuZCBjb252ZXJzYXRpb24ncyBpbnRlbmRlZCBtb2RlbC4gKi9cblx0cHJpdmF0ZSBfcmVtZW1iZXIoc2VsZWN0aW9uOiBJSW50ZW5kZWRNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3J1bnRpbWUuZ2V0SW50ZW50SG9sZGVyKCkuc2V0SW50ZW5kZWRNb2RlbChzZWxlY3Rpb24pO1xuXHR9XG5cblx0LyoqIFRoZSBpbnRlbmRlZCBtb2RlbCBvZiB0aGUgY29udmVyc2F0aW9uIHRoaXMgaW5wdXQgaXMgY3VycmVudGx5IGJvdW5kIHRvLiAqL1xuXHRwcml2YXRlIGdldCBfaW50ZW5kZWRNb2RlbCgpOiBJSW50ZW5kZWRNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3J1bnRpbWUuZ2V0SW50ZW50SG9sZGVyKCkuaW50ZW5kZWRNb2RlbDtcblx0fVxuXG5cdC8qKiBUaGUgbW9kZWxzIHNlbGVjdGFibGUgZm9yIHRoZSBib3VuZCBzZXNzaW9uIHJpZ2h0IG5vdy4gKi9cblx0cHJpdmF0ZSBfcG9vbChzZXNzaW9uVHlwZSA9IHRoaXMuX3J1bnRpbWUuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCkpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3J1bnRpbWUuZ2V0TW9kZWxzKHNlc3Npb25UeXBlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvcmRzIHRoZSBjb252ZXJzYXRpb24ncyBtb2RlbCBhcyB0aGUgb25lIHRvIHJlY2xhaW0sIHVubGVzcyB0aGlzIHN5bmMgYmVsb25ncyB0byBhXG5cdCAqIGNvbnZlcnNhdGlvbiB0aGUgaW5wdXQgaGFzIGFscmVhZHkgbW92ZWQgb2ZmIFx1MjAxNCBhIGxhdGUgc3luYyBmb3IgYW4gb3V0Z29pbmcgc2Vzc2lvbiBtdXN0IG5vdFxuXHQgKiBkaWN0YXRlIHRoZSBhY3RpdmUgb25lJ3MgbW9kZWwuXG5cdCAqL1xuXHRwcml2YXRlIF9yZW1lbWJlck9uQm91bmRDb252ZXJzYXRpb24oXG5cdFx0bW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcixcblx0XHRjb25maWd1cmF0aW9uOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCxcblx0XHRjb252ZXJzYXRpb25LZXk6IHN0cmluZyxcblx0KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3J1bnRpbWUuZ2V0Qm91bmRDb252ZXJzYXRpb25LZXkoKSAhPT0gY29udmVyc2F0aW9uS2V5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbWVtYmVyKHsgbW9kZWxJZDogbW9kZWwuaWRlbnRpZmllciwgbW9kZWwsIHJlYXNvbjogTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmUsIGNvbmZpZ3VyYXRpb24gfSk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtc2VlZHMgZnJvbSBzdG9yYWdlIHdoZW4gdGhlIGN1cnJlbnQgbW9kZWwgaXMgYWJzZW50IGZyb20gdGhlIGRlc3RpbmF0aW9uIHNlc3Npb24ncyBwb29sLFxuXHQgKiByZXN0b3JpbmcgdGhlIHVzZXIncyBwcmV2aW91cyBzZWxlY3Rpb24gZm9yIHRoYXQgcG9vbC4gVXNlcyB0aGUgZmlsdGVyZWQgcG9vbCBzbyBhIG1vZGVsIHRoYXRcblx0ICogaXMgY2F0YWxvZ3VlZCBidXQgbm90IHZhbGlkIGZvciB0aGUgZGVzdGluYXRpb24gaXMgY2F1Z2h0IGJlZm9yZSB0YXJnZXRlZCBtb2RlbHMgbG9hZC5cblx0ICovXG5cdHJlaW5pdGlhbGl6ZUlmT3V0c2lkZVBvb2woaW5pdGlhbGl6ZTogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRNb2RlbCA9IHRoaXMuX2N1cnJlbnRNb2RlbC5nZXQoKTtcblx0XHRpZiAoIWN1cnJlbnRNb2RlbCB8fCB0aGlzLl9wb29sKCkuc29tZShtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSBjdXJyZW50TW9kZWwuaWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aW5pdGlhbGl6ZSgpO1xuXHRcdHRoaXMuZW5zdXJlQ3VycmVudE1vZGVsU3VwcG9ydGVkKCk7XG5cdH1cblxuXHRyZXZhbGlkYXRlRm9yU2Vzc2lvblR5cGUoaW5pdGlhbGl6ZTogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZpb3VzTW9kZWwgPSB0aGlzLl9jdXJyZW50TW9kZWwuZ2V0KCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gdW5kZWZpbmVkO1xuXHRcdGluaXRpYWxpemUoKTtcblx0XHRjb25zdCByZXN0b3JlZE1vZGVsID0gdGhpcy5fY3VycmVudE1vZGVsLmdldCgpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gdGhpcy5fcnVudGltZS5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKTtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLl9wb29sKHNlc3Npb25UeXBlKTtcblx0XHRpZiAocmVzdG9yZWRNb2RlbCAmJiBtb2RlbHMuc29tZShtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSByZXN0b3JlZE1vZGVsLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1hdGNoID0gZmluZEJlc3RNYXRjaGluZ01vZGVsKHByZXZpb3VzTW9kZWwsIG1vZGVscyk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHR0aGlzLl9hcHBseU1vZGVsKG1hdGNoKTtcblx0XHR9IGVsc2UgaWYgKG1vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRNb2RlbC5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnNlbGVjdERlZmF1bHQoc2Vzc2lvblR5cGUpO1xuXHRcdH1cblx0fVxuXG5cdHJlc29sdmVEcmFmdE1vZGVsKFxuXHRcdGRyYWZ0TW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCxcblx0XHRzZXNzaW9uVHlwZUZvclZhbGlkYXRpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHR2YWxpZGF0ZVBvb2w6IGJvb2xlYW4sXG5cdCk6IElSZXNvbHZlZERyYWZ0TW9kZWxTZWxlY3Rpb24ge1xuXHRcdGxldCBtb2RlbCA9IGRyYWZ0TW9kZWw7XG5cdFx0aWYgKHZhbGlkYXRlUG9vbCAmJiBzaG91bGREcm9wQWdub3N0aWNEcmFmdE1vZGVsKG1vZGVsLCB0aGlzLl9ydW50aW1lLmdldEFsbE1vZGVscygpLCBzZXNzaW9uVHlwZUZvclZhbGlkYXRpb24pKSB7XG5cdFx0XHRtb2RlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJlZFZhbHVlID0gdGhpcy5fcnVudGltZS5nZXRDb25maWd1cmVkTW9kZWxWYWx1ZSgpO1xuXHRcdGlmIChjb25maWd1cmVkVmFsdWUpIHtcblx0XHRcdG1vZGVsID0gcmVzb2x2ZUNvbmZpZ3VyZWRNb2RlbChjb25maWd1cmVkVmFsdWUsIHRoaXMuX3Bvb2woKSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IG1vZGVsLCBjaGFuZ2VkOiBtb2RlbD8uaWRlbnRpZmllciAhPT0gZHJhZnRNb2RlbD8uaWRlbnRpZmllciB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlTZXNzaW9uUmVzdG9yZShcblx0XHRtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLFxuXHRcdGFwcGx5TW9kZWw6IGJvb2xlYW4sXG5cdFx0Y29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdFx0Y29udmVyc2F0aW9uS2V5OiBzdHJpbmcsXG5cdCk6IHZvaWQge1xuXHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0dGhpcy5fc2VsZWN0aW9uUmVhc29uID0gTW9kZWxTZWxlY3Rpb25SZWFzb24uU2Vzc2lvblJlc3RvcmU7XG5cdFx0dGhpcy5fcmVtZW1iZXIoeyBtb2RlbElkOiBtb2RlbC5pZGVudGlmaWVyLCBtb2RlbCwgcmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5TZXNzaW9uUmVzdG9yZSwgY29uZmlndXJhdGlvbiB9KTtcblx0XHRpZiAoY29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhpcy5fcnVudGltZS5yZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uKG1vZGVsLmlkZW50aWZpZXIsIGNvbmZpZ3VyYXRpb24pO1xuXHRcdH1cblx0XHRpZiAoYXBwbHlNb2RlbCkge1xuXHRcdFx0dGhpcy5fYXBwbHlNb2RlbChtb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlSW50ZW50KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGludGVudCA9IHRoaXMuX2ludGVudDtcblx0XHRpZiAoIWludGVudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBUaGUgY29udmVyc2F0aW9uIG1vdmVkIG9uIHdoaWxlIHRoZSBtb2RlbCB3YXMgc3RpbGwgdW5wdWJsaXNoZWQsIHNvIG5vYm9keSBpcyB3YWl0aW5nLlxuXHRcdGlmICh0aGlzLl9ydW50aW1lLmdldEJvdW5kQ29udmVyc2F0aW9uS2V5KCkgIT09IGludGVudC5jb252ZXJzYXRpb25LZXkpIHtcblx0XHRcdHRoaXMuX2NsZWFySW50ZW50KCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSBpbnRlbnQucmVzb2x2ZU1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9pbnRlbnQgPSB1bmRlZmluZWQ7XG5cdFx0aW50ZW50LmNvbXBsZXRlKHRydWUpO1xuXHRcdHRoaXMuYXBwbHlQcm9ncmFtbWF0aWNTZWxlY3Rpb24obW9kZWwpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJJbnRlbnQoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW50ZW50ID0gdGhpcy5faW50ZW50O1xuXHRcdHRoaXMuX2ludGVudCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoaW50ZW50KSB7XG5cdFx0XHRpbnRlbnQuY29tcGxldGUoZmFsc2UpO1xuXHRcdFx0aWYgKHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9PT0gTW9kZWxTZWxlY3Rpb25SZWFzb24uUHJvZ3JhbW1hdGljU2VsZWN0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGlvblJlYXNvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogU2hvd3MgYG1vZGVsYCB3aXRob3V0IHRvdWNoaW5nIHRoZSBhdXRob3JpdHkgYWxyZWFkeSBpbiBmb3JjZS4gKi9cblx0cHJpdmF0ZSBfZGlzcGxheShtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudE1vZGVsLnNldChtb2RlbCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TW9kZWwobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3BsYXkobW9kZWwpO1xuXHRcdHRoaXMuX3J1bnRpbWUuYXBwbHlNb2RlbChtb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnRJbml0aWFsaXphdGlvbihjb25maWd1cmVkTW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVtZW1iZXJlZE1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlbGVjdGlvbjogSW5pdGlhbE1vZGVsU2VsZWN0aW9uUmVzdWx0KTogdm9pZCB7XG5cdFx0dGhpcy5fZGlhZ25vc3RpY3MucmVwb3J0KCdpbml0aWFsaXplJywge1xuXHRcdFx0Y29uZmlndXJlZE1vZGVsLFxuXHRcdFx0cmVtZW1iZXJlZE1vZGVsLFxuXHRcdFx0YXZhaWxhYmxlTW9kZWxzOiB0aGlzLl9wb29sKCkubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLmpvaW4oJywnKSxcblx0XHRcdHNlbGVjdGlvbjogc2VsZWN0aW9uLmtpbmQsXG5cdFx0XHRyZXN1bHRNb2RlbDogc2VsZWN0aW9uLmtpbmQgPT09ICdhcHBseScgPyBzZWxlY3Rpb24ubW9kZWwuaWRlbnRpZmllciA6IHVuZGVmaW5lZCxcblx0XHRcdHJlc3VsdFJlYXNvbjogc2VsZWN0aW9uLmtpbmQgPT09ICdhcHBseScgPyBzZWxlY3Rpb24ucmVhc29uIDogdW5kZWZpbmVkLFxuXHRcdFx0cGVuZGluZ1JlZmVyZW5jZTogc2VsZWN0aW9uLmtpbmQgPT09ICdwZW5kaW5nJyA/IHNlbGVjdGlvbi5zZWxlY3Rpb24ucmVmZXJlbmNlIDogdW5kZWZpbmVkLFxuXHRcdH0sIHNlbGVjdGlvbi5raW5kID09PSAnbm9uZScgPyAnZGVidWcnIDogJ2luZm8nKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBc0IsdUJBQXVCO0FBSTdDLFNBQStELDZCQUF3RCxzQkFBc0Isd0JBQXdCLDhCQUE4Qiw4QkFBOEI7QUFDak8sU0FBUyx1QkFBdUIsa0JBQWtCLDJCQUEyQiwyQkFBMkIsOEJBQThCLDJCQUEyQixvQ0FBb0M7QUFDck0sU0FBeUMseUNBQXlDO0FBaUMzRSxNQUFNLDBDQUEwQyxXQUFXO0FBQUEsRUFRakUsWUFDa0IsVUFDQSxlQUErQyxtQ0FDL0Q7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQVJsQixTQUFpQixnQkFBZ0IsZ0JBQXFFLE1BQU0sTUFBUztBQUNySCxTQUFTLGVBQWlGLEtBQUs7QUFHL0YsU0FBUSx1QkFBdUI7QUFPOUIsU0FBSyxVQUFVLEtBQUssU0FBUyx3QkFBd0IsTUFBTSxLQUFLLHlCQUF5QixLQUFLLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFDdkcsU0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLElBQUksc0JBQStCO0FBQ2xDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksa0JBQXlEO0FBQzVELFdBQU8sS0FBSztBQUFB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
