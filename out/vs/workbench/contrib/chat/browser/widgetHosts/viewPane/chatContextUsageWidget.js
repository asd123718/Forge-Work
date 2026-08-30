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
import "./media/chatContextUsageWidget.css";
import * as dom from "../../../../../../base/browser/dom.js";
import { EventType, addDisposableListener } from "../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue, observableValueOpts } from "../../../../../../base/common/observable.js";
import { equals } from "../../../../../../base/common/arrays.js";
import { localize } from "../../../../../../nls.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatConfiguration } from "../../../common/constants.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatContextUsageDetails } from "./chatContextUsageDetails.js";
import { StandardKeyboardEvent } from "../../../../../../base/browser/keyboardEvent.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
const $ = dom.$;
function resolveContextWindowInputTokens(modelConfiguration, configurationSchema, maxInputTokens) {
  const configuredContextSize = typeof modelConfiguration?.contextSize === "number" ? modelConfiguration.contextSize : void 0;
  const schemaDefaultContextSize = configurationSchema?.properties?.contextSize?.default;
  return configuredContextSize ?? (typeof schemaDefaultContextSize === "number" ? schemaDefaultContextSize : void 0) ?? maxInputTokens;
}
function isSameContextUsageData(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return a.usedTokens === b.usedTokens && a.completionTokens === b.completionTokens && a.totalContextWindow === b.totalContextWindow && a.percentage === b.percentage && a.outputBufferPercentage === b.outputBufferPercentage && a.sessionCost === b.sessionCost && equals(a.promptTokenDetails, b.promptTokenDetails, (x, y) => x.category === y.category && x.label === y.label && x.percentageOfPrompt === y.percentageOfPrompt);
}
const _CircularProgressIndicator = class _CircularProgressIndicator {
  constructor() {
    const r = _CircularProgressIndicator.RADIUS;
    this.circumference = 2 * Math.PI * r;
    this.domNode = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.domNode.setAttribute("viewBox", "0 0 36 36");
    this.domNode.classList.add("circular-progress");
    const bgCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    bgCircle.setAttribute("cx", String(_CircularProgressIndicator.CENTER_X));
    bgCircle.setAttribute("cy", String(_CircularProgressIndicator.CENTER_Y));
    bgCircle.setAttribute("r", String(r));
    bgCircle.classList.add("progress-bg");
    this.domNode.appendChild(bgCircle);
    this.progressCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    this.progressCircle.setAttribute("cx", String(_CircularProgressIndicator.CENTER_X));
    this.progressCircle.setAttribute("cy", String(_CircularProgressIndicator.CENTER_Y));
    this.progressCircle.setAttribute("r", String(r));
    this.progressCircle.classList.add("progress-arc");
    this.progressCircle.setAttribute("stroke-dasharray", String(this.circumference));
    this.progressCircle.setAttribute("stroke-dashoffset", String(this.circumference));
    this.domNode.appendChild(this.progressCircle);
  }
  /**
   * Updates the ring to display the given percentage (0-100).
   * @param percentage The percentage of the ring to fill (clamped to 0-100)
   */
  setProgress(percentage) {
    const clamped = Math.max(0, Math.min(100, percentage));
    const offset = this.circumference - clamped / 100 * this.circumference;
    this.progressCircle.setAttribute("stroke-dashoffset", String(offset));
  }
};
_CircularProgressIndicator.CENTER_X = 18;
_CircularProgressIndicator.CENTER_Y = 18;
_CircularProgressIndicator.RADIUS = 14;
let CircularProgressIndicator = _CircularProgressIndicator;
let ChatContextUsageWidget = class extends Disposable {
  constructor(hoverService, instantiationService, languageModelsService, contextKeyService, storageService, configurationService) {
    super();
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.languageModelsService = languageModelsService;
    this.contextKeyService = contextKeyService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    this._isVisible = observableValue(this, false);
    this._lastRequestDisposable = this._register(new MutableDisposable());
    this._modelConfigurationListener = this._register(new MutableDisposable());
    this._hoverDisposable = this._register(new MutableDisposable());
    this._contextUsageDetails = this._register(new MutableDisposable());
    this._currentData = observableValueOpts({ owner: this, equalsFn: isSameContextUsageData }, void 0);
    this._hoverOptions = {
      id: ChatContextUsageWidget._HOVER_ID,
      appearance: { showPointer: true, compact: true },
      persistence: { hideOnHover: false },
      trapFocus: true
    };
    this.domNode = $(".chat-context-usage-widget");
    this.domNode.style.display = "none";
    this.domNode.setAttribute("tabindex", "0");
    this.domNode.setAttribute("role", "button");
    this.domNode.setAttribute("aria-label", localize("contextUsageLabel", "Context window usage"));
    const iconContainer = this.domNode.appendChild($(".icon-container"));
    this.progressIndicator = new CircularProgressIndicator();
    iconContainer.appendChild(this.progressIndicator.domNode);
    this.percentageLabel = this.domNode.appendChild($(".percentage-label"));
    this._contextUsageOpenedKey = ChatContextKeys.contextUsageHasBeenOpened.bindTo(this.contextKeyService);
    if (this.storageService.getBoolean(ChatContextUsageWidget._OPENED_STORAGE_KEY, StorageScope.WORKSPACE, false)) {
      this._contextUsageOpenedKey.set(true);
    }
    this._enabled = this.configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled) !== false;
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.ChatContextUsageEnabled)) {
        this._enabled = this.configurationService.getValue(ChatConfiguration.ChatContextUsageEnabled) !== false;
        if (!this._enabled) {
          this.hide();
        } else if (this._currentData.get()) {
          this.show();
        }
      }
    }));
    this.setupHover();
  }
  get isVisible() {
    return this._isVisible;
  }
  setChatWidget(widget) {
    this._chatWidget = widget;
    this._contextUsageDetails.value?.setChatWidget(widget);
  }
  /**
   * Shows the sticky context usage details hover and records that the user
   * has opened it. Returns `true` if the details were shown.
   */
  showDetails() {
    const details = this._createDetails();
    if (!details) {
      return false;
    }
    this.hoverService.showInstantHover(
      { ...this._hoverOptions, content: details.domNode, target: this.domNode, persistence: { hideOnHover: false, sticky: true } },
      true
    );
    this._markOpened();
    return true;
  }
  _createDetails() {
    if (!this._isVisible.get() || !this._currentData.get()) {
      return void 0;
    }
    if (!this._contextUsageDetails.value) {
      this._contextUsageDetails.value = this.instantiationService.createInstance(ChatContextUsageDetails, this._chatWidget, this._currentData);
    }
    return this._contextUsageDetails.value;
  }
  _markOpened() {
    this._contextUsageOpenedKey.set(true);
    this.storageService.store(ChatContextUsageWidget._OPENED_STORAGE_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  setupHover() {
    this._hoverDisposable.clear();
    const store = new DisposableStore();
    this._hoverDisposable.value = store;
    store.add(this.hoverService.setupDelayedHover(this.domNode, () => ({
      ...this._hoverOptions,
      content: this._createDetails()?.domNode ?? ""
    })));
    store.add(addDisposableListener(this.domNode, EventType.CLICK, (e) => {
      e.stopPropagation();
      this.showDetails();
    }));
    store.add(addDisposableListener(this.domNode, EventType.KEY_DOWN, (e) => {
      const evt = new StandardKeyboardEvent(e);
      if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
        e.preventDefault();
        this.showDetails();
      }
    }));
  }
  /**
   * Updates the widget with the latest request/response data.
   * The model is retrieved from the request's modelId.
   * @param lastRequest The last request in the session
   */
  update(lastRequest) {
    this._lastRequestDisposable.clear();
    this._currentResponse = void 0;
    this._currentModelId = void 0;
    if (!lastRequest) {
      this._currentData.set(void 0, void 0);
      this.hide();
      return;
    }
    if (!lastRequest.response || !lastRequest.modelId) {
      if (!this._currentData.get()) {
        this.hide();
      }
      return;
    }
    const response = lastRequest.response;
    const modelId = lastRequest.modelId;
    this._currentResponse = response;
    this._currentModelId = modelId;
    this.updateFromResponse(response, modelId);
    this._lastRequestDisposable.value = response.onDidChange(() => {
      this.updateFromResponse(response, modelId);
    });
  }
  updateSessionCost(sessionCost) {
    const data = this._currentData.get();
    if (data && data.sessionCost !== sessionCost) {
      this.render({ ...data, sessionCost });
    }
  }
  /**
   * Provides a per-editor resolver for the selected model's configuration
   * (notably the user-selected context size). The widget re-renders whenever
   * the supplied event fires for the currently displayed model. Without this,
   * the widget falls back to the profile-global value, which can drift from
   * the editor's actual selection (see issue #320393).
   */
  setModelConfigurationResolver(resolver, onDidChange) {
    this._modelConfigurationResolver = resolver;
    this._modelConfigurationListener.value = onDidChange((modelId) => {
      const affectsDisplayedModel = this._currentModelId === modelId || this._selectedModelId === modelId;
      if (this._currentResponse && this._currentModelId && affectsDisplayedModel) {
        this.updateFromResponse(this._currentResponse, this._currentModelId);
      }
    });
  }
  /**
   * Sets the model the user currently has selected in the picker. The
   * context-window denominator then reflects this model immediately, even
   * before a request is sent with it. The usage numerator still comes from the
   * last completed response.
   */
  setSelectedModel(modelId) {
    if (this._selectedModelId === modelId) {
      return;
    }
    this._selectedModelId = modelId;
    if (this._currentResponse && this._currentModelId) {
      this.updateFromResponse(this._currentResponse, this._currentModelId);
    }
  }
  /**
   * Resolves a model's context-window dimensions, or `undefined` when it has no usable window. A meta-model such as
   * "auto" advertises a zero-sized window, so it resolves to `undefined` and the caller falls back to the model that
   * actually served the request (see issue #321781).
   */
  resolveContextWindow(modelId) {
    if (!modelId) {
      return void 0;
    }
    const modelMetadata = this.languageModelsService.lookupLanguageModel(modelId);
    if (!modelMetadata) {
      return void 0;
    }
    const modelConfiguration = this._modelConfigurationResolver?.(modelId) ?? this.languageModelsService.getModelConfiguration(modelId);
    const maxInputTokens = resolveContextWindowInputTokens(modelConfiguration, modelMetadata.configurationSchema, modelMetadata.maxInputTokens);
    const maxOutputTokens = modelMetadata.maxOutputTokens;
    const totalContextWindow = (maxInputTokens ?? 0) + (maxOutputTokens ?? 0);
    if (totalContextWindow <= 0) {
      return void 0;
    }
    return { maxOutputTokens, totalContextWindow };
  }
  updateFromResponse(response, modelId) {
    const usage = response.usage;
    const effectiveModelId = usage?.actualModelId ?? modelId;
    const contextWindow = this.resolveContextWindow(this._selectedModelId) ?? this.resolveContextWindow(effectiveModelId);
    if (!usage || !contextWindow) {
      if (!this._currentData.get()) {
        this.hide();
      }
      return;
    }
    const { maxOutputTokens, totalContextWindow } = contextWindow;
    const promptTokens = usage.promptTokens;
    const completionTokens = usage.completionTokens;
    const promptTokenDetails = usage.promptTokenDetails;
    const usedTokens = promptTokens + completionTokens;
    const percentage = usedTokens / totalContextWindow * 100;
    const outputBufferPercentage = maxOutputTokens !== void 0 ? Math.max(0, maxOutputTokens - completionTokens) / totalContextWindow * 100 : void 0;
    this.render({
      usedTokens,
      completionTokens,
      totalContextWindow,
      percentage,
      outputBufferPercentage,
      promptTokenDetails,
      sessionCost: response.session.sessionCost
    });
    this.show();
  }
  render(data) {
    this._currentData.set(data, void 0);
    this.progressIndicator.setProgress(data.percentage);
    const roundedPercentage = Math.min(100, Math.round(data.percentage));
    this.percentageLabel.textContent = `${roundedPercentage}%`;
    this.domNode.setAttribute("aria-label", localize("contextUsagePercentageLabel", "Context window usage: {0}%", roundedPercentage));
    this.domNode.classList.remove("warning", "error");
    if (data.percentage >= 90) {
      this.domNode.classList.add("error");
    } else if (data.percentage >= 75) {
      this.domNode.classList.add("warning");
    }
  }
  show() {
    if (!this._enabled) {
      return;
    }
    if (this.domNode.style.display === "none") {
      this.domNode.style.display = "";
      this._isVisible.set(true, void 0);
      this._onDidChangeVisibility.fire();
    }
  }
  hide() {
    if (this.domNode.style.display !== "none") {
      this.domNode.style.display = "none";
      this._isVisible.set(false, void 0);
      this._onDidChangeVisibility.fire();
    }
  }
};
ChatContextUsageWidget._OPENED_STORAGE_KEY = "chat.contextUsage.hasBeenOpened";
ChatContextUsageWidget._HOVER_ID = "chat.contextUsage";
ChatContextUsageWidget = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService)
], ChatContextUsageWidget);
export {
  ChatContextUsageWidget,
  CircularProgressIndicator,
  isSameContextUsageData,
  resolveContextWindowInputTokens
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldEhvc3RzXFx2aWV3UGFuZVxcY2hhdENvbnRleHRVc2FnZVdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0Q29udGV4dFVzYWdlV2lkZ2V0LmNzcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSURlbGF5ZWRIb3Zlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RNb2RlbCwgSUNoYXRSZXNwb25zZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENvbmZpZ3VyYXRpb25TY2hlbWEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRVc2FnZURldGFpbHMsIElDaGF0Q29udGV4dFVzYWdlRGF0YSB9IGZyb20gJy4vY2hhdENvbnRleHRVc2FnZURldGFpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBpbnB1dC10b2tlbiBkZW5vbWluYXRvciB1c2VkIGJ5IHRoZSBjb250ZXh0LXVzYWdlIGdhdWdlLlxuICpcbiAqIFJlc29sdXRpb24gb3JkZXIsIG1pcnJvcmluZyB0aGUgcmVxdWVzdCBwYXRoJ3MgYGFwcGx5Q29udGV4dFNpemVPdmVycmlkZWA6XG4gKiAgIDEuIEFuIGV4cGxpY2l0IGBjb250ZXh0U2l6ZWAgaW4gdGhlIHJlc29sdmVkIG1vZGVsIGNvbmZpZ3VyYXRpb24uXG4gKiAgIDIuIFRoZSBzY2hlbWEncyBkZWZhdWx0IGBjb250ZXh0U2l6ZWAgdGllciAoZS5nLiAyMDBLKS4gVXNlZCB3aGVuIHRoZVxuICogICAgICByZXNvbHZlZCBjb25maWd1cmF0aW9uIGlzIG1pc3NpbmcgYGNvbnRleHRTaXplYCAoZS5nLiB0aGUgc2NoZW1hIGRlZmF1bHRcbiAqICAgICAgaGFzIG5vdCBsb2FkZWQgeWV0KSBzbyB0aGUgZ2F1Z2UgZGVub21pbmF0b3IgYWdyZWVzIHdpdGggdGhlIHNpemUgdGhlXG4gKiAgICAgIHJlcXVlc3QgYWN0dWFsbHkgdXNlcyBpbnN0ZWFkIG9mIGp1bXBpbmcgdG8gdGhlIG1vZGVsJ3MgZnVsbCBuYXRpdmVcbiAqICAgICAgd2luZG93LiBTZWUgaXNzdWUgIzMyMDM5My5cbiAqICAgMy4gVGhlIG1vZGVsJ3MgZnVsbCBuYXRpdmUgd2luZG93IChgbWF4SW5wdXRUb2tlbnNgKS4gTW9kZWxzIHdpdGhvdXQgYVxuICogICAgICBjb250ZXh0LXNpemUgcGlja2VyIGhhdmUgbm8gc3VjaCBzY2hlbWEgcHJvcGVydHkgYW5kIGxhbmQgaGVyZSwgd2hlcmVcbiAqICAgICAgZGVmYXVsdCBhbmQgbWF4IGFyZSB0aGUgc2FtZSB2YWx1ZS5cbiAqXG4gKiBAaW50ZXJuYWwgLSBleHBvcnRlZCBmb3IgdGVzdGluZ1xuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNvbnRleHRXaW5kb3dJbnB1dFRva2Vucyhcblx0bW9kZWxDb25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCxcblx0Y29uZmlndXJhdGlvblNjaGVtYTogSUxhbmd1YWdlTW9kZWxDb25maWd1cmF0aW9uU2NoZW1hIHwgdW5kZWZpbmVkLFxuXHRtYXhJbnB1dFRva2VuczogbnVtYmVyIHwgdW5kZWZpbmVkLFxuKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY29uZmlndXJlZENvbnRleHRTaXplID0gdHlwZW9mIG1vZGVsQ29uZmlndXJhdGlvbj8uY29udGV4dFNpemUgPT09ICdudW1iZXInID8gbW9kZWxDb25maWd1cmF0aW9uLmNvbnRleHRTaXplIDogdW5kZWZpbmVkO1xuXHRjb25zdCBzY2hlbWFEZWZhdWx0Q29udGV4dFNpemUgPSBjb25maWd1cmF0aW9uU2NoZW1hPy5wcm9wZXJ0aWVzPy5jb250ZXh0U2l6ZT8uZGVmYXVsdDtcblx0cmV0dXJuIGNvbmZpZ3VyZWRDb250ZXh0U2l6ZVxuXHRcdD8/ICh0eXBlb2Ygc2NoZW1hRGVmYXVsdENvbnRleHRTaXplID09PSAnbnVtYmVyJyA/IHNjaGVtYURlZmF1bHRDb250ZXh0U2l6ZSA6IHVuZGVmaW5lZClcblx0XHQ/PyBtYXhJbnB1dFRva2Vucztcbn1cblxuLyoqXG4gKiBFcXVhbGl0eSBjb21wYXJlciBmb3Ige0BsaW5rIElDaGF0Q29udGV4dFVzYWdlRGF0YX0gdXNlZCB0byBzdXBwcmVzcyByZWR1bmRhbnQgdXBkYXRlcy5cbiAqXG4gKiBAaW50ZXJuYWwgLSBleHBvcnRlZCBmb3IgdGVzdGluZ1xuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTYW1lQ29udGV4dFVzYWdlRGF0YShhOiBJQ2hhdENvbnRleHRVc2FnZURhdGEgfCB1bmRlZmluZWQsIGI6IElDaGF0Q29udGV4dFVzYWdlRGF0YSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoYSA9PT0gYikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdGlmICghYSB8fCAhYikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gYS51c2VkVG9rZW5zID09PSBiLnVzZWRUb2tlbnNcblx0XHQmJiBhLmNvbXBsZXRpb25Ub2tlbnMgPT09IGIuY29tcGxldGlvblRva2Vuc1xuXHRcdCYmIGEudG90YWxDb250ZXh0V2luZG93ID09PSBiLnRvdGFsQ29udGV4dFdpbmRvd1xuXHRcdCYmIGEucGVyY2VudGFnZSA9PT0gYi5wZXJjZW50YWdlXG5cdFx0JiYgYS5vdXRwdXRCdWZmZXJQZXJjZW50YWdlID09PSBiLm91dHB1dEJ1ZmZlclBlcmNlbnRhZ2Vcblx0XHQmJiBhLnNlc3Npb25Db3N0ID09PSBiLnNlc3Npb25Db3N0XG5cdFx0JiYgZXF1YWxzKGEucHJvbXB0VG9rZW5EZXRhaWxzLCBiLnByb21wdFRva2VuRGV0YWlscywgKHgsIHkpID0+XG5cdFx0XHR4LmNhdGVnb3J5ID09PSB5LmNhdGVnb3J5ICYmIHgubGFiZWwgPT09IHkubGFiZWwgJiYgeC5wZXJjZW50YWdlT2ZQcm9tcHQgPT09IHkucGVyY2VudGFnZU9mUHJvbXB0KTtcbn1cblxuLyoqXG4gKiBBIHJldXNhYmxlIGNpcmN1bGFyIHByb2dyZXNzIGluZGljYXRvciB0aGF0IGRpc3BsYXlzIGEgcmluZy5cbiAqIFRoZSByaW5nIGZpbGxzIGNsb2Nrd2lzZSBmcm9tIHRoZSB0b3AgYmFzZWQgb24gdGhlIHBlcmNlbnRhZ2UgdmFsdWUuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaXJjdWxhclByb2dyZXNzSW5kaWNhdG9yIHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBTVkdTVkdFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NDaXJjbGU6IFNWR0NpcmNsZUVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2lyY3VtZmVyZW5jZTogbnVtYmVyO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENFTlRFUl9YID0gMTg7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENFTlRFUl9ZID0gMTg7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJBRElVUyA9IDE0O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IHIgPSBDaXJjdWxhclByb2dyZXNzSW5kaWNhdG9yLlJBRElVUztcblx0XHR0aGlzLmNpcmN1bWZlcmVuY2UgPSAyICogTWF0aC5QSSAqIHI7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50TlMoJ2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJywgJ3N2ZycpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3ZpZXdCb3gnLCAnMCAwIDM2IDM2Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NpcmN1bGFyLXByb2dyZXNzJyk7XG5cblx0XHQvLyBCYWNrZ3JvdW5kIGNpcmNsZVxuXHRcdGNvbnN0IGJnQ2lyY2xlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudE5TKCdodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZycsICdjaXJjbGUnKTtcblx0XHRiZ0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ2N4JywgU3RyaW5nKENpcmN1bGFyUHJvZ3Jlc3NJbmRpY2F0b3IuQ0VOVEVSX1gpKTtcblx0XHRiZ0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ2N5JywgU3RyaW5nKENpcmN1bGFyUHJvZ3Jlc3NJbmRpY2F0b3IuQ0VOVEVSX1kpKTtcblx0XHRiZ0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ3InLCBTdHJpbmcocikpO1xuXHRcdGJnQ2lyY2xlLmNsYXNzTGlzdC5hZGQoJ3Byb2dyZXNzLWJnJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKGJnQ2lyY2xlKTtcblxuXHRcdC8vIFByb2dyZXNzIGFyYyAoc3Ryb2tlLWJhc2VkIHJpbmcpXG5cdFx0dGhpcy5wcm9ncmVzc0NpcmNsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCAnY2lyY2xlJyk7XG5cdFx0dGhpcy5wcm9ncmVzc0NpcmNsZS5zZXRBdHRyaWJ1dGUoJ2N4JywgU3RyaW5nKENpcmN1bGFyUHJvZ3Jlc3NJbmRpY2F0b3IuQ0VOVEVSX1gpKTtcblx0XHR0aGlzLnByb2dyZXNzQ2lyY2xlLnNldEF0dHJpYnV0ZSgnY3knLCBTdHJpbmcoQ2lyY3VsYXJQcm9ncmVzc0luZGljYXRvci5DRU5URVJfWSkpO1xuXHRcdHRoaXMucHJvZ3Jlc3NDaXJjbGUuc2V0QXR0cmlidXRlKCdyJywgU3RyaW5nKHIpKTtcblx0XHR0aGlzLnByb2dyZXNzQ2lyY2xlLmNsYXNzTGlzdC5hZGQoJ3Byb2dyZXNzLWFyYycpO1xuXHRcdHRoaXMucHJvZ3Jlc3NDaXJjbGUuc2V0QXR0cmlidXRlKCdzdHJva2UtZGFzaGFycmF5JywgU3RyaW5nKHRoaXMuY2lyY3VtZmVyZW5jZSkpO1xuXHRcdHRoaXMucHJvZ3Jlc3NDaXJjbGUuc2V0QXR0cmlidXRlKCdzdHJva2UtZGFzaG9mZnNldCcsIFN0cmluZyh0aGlzLmNpcmN1bWZlcmVuY2UpKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5wcm9ncmVzc0NpcmNsZSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgcmluZyB0byBkaXNwbGF5IHRoZSBnaXZlbiBwZXJjZW50YWdlICgwLTEwMCkuXG5cdCAqIEBwYXJhbSBwZXJjZW50YWdlIFRoZSBwZXJjZW50YWdlIG9mIHRoZSByaW5nIHRvIGZpbGwgKGNsYW1wZWQgdG8gMC0xMDApXG5cdCAqL1xuXHRzZXRQcm9ncmVzcyhwZXJjZW50YWdlOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBjbGFtcGVkID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMTAwLCBwZXJjZW50YWdlKSk7XG5cdFx0Y29uc3Qgb2Zmc2V0ID0gdGhpcy5jaXJjdW1mZXJlbmNlIC0gKGNsYW1wZWQgLyAxMDApICogdGhpcy5jaXJjdW1mZXJlbmNlO1xuXHRcdHRoaXMucHJvZ3Jlc3NDaXJjbGUuc2V0QXR0cmlidXRlKCdzdHJva2UtZGFzaG9mZnNldCcsIFN0cmluZyhvZmZzZXQpKTtcblx0fVxufVxuXG4vKipcbiAqIFdpZGdldCB0aGF0IGRpc3BsYXlzIHRoZSBjb250ZXh0L3Rva2VuIHVzYWdlIGZvciB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24uXG4gKiBTaG93cyBhIGNpcmN1bGFyIHByb2dyZXNzIGljb24gdGhhdCBleHBhbmRzIG9uIGhvdmVyL2ZvY3VzIHRvIHNob3cgdG9rZW4gY291bnRzLFxuICogYW5kIG9uIGNsaWNrIHNob3dzIHRoZSBkZXRhaWxlZCBjb250ZXh0IHVzYWdlIHdpZGdldC5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRDb250ZXh0VXNhZ2VXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudDtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzSW5kaWNhdG9yOiBDaXJjdWxhclByb2dyZXNzSW5kaWNhdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBlcmNlbnRhZ2VMYWJlbDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaXNWaXNpYmxlID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIGZhbHNlKTtcblx0Z2V0IGlzVmlzaWJsZSgpOiBJT2JzZXJ2YWJsZTxib29sZWFuPiB7IHJldHVybiB0aGlzLl9pc1Zpc2libGU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0UmVxdWVzdERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsQ29uZmlndXJhdGlvbkxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9jdXJyZW50UmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFRoZSBtb2RlbCB0aGUgdXNlciBjdXJyZW50bHkgaGFzIHNlbGVjdGVkIGluIHRoZSBwaWNrZXIuIFdoZW4gc2V0IGl0XG5cdCAqIG92ZXJyaWRlcyB0aGUgbGFzdCByZXF1ZXN0J3MgbW9kZWwgZm9yIGNvbXB1dGluZyB0aGUgY29udGV4dC13aW5kb3dcblx0ICogZGVub21pbmF0b3IsIHNvIHN3aXRjaGluZyBtb2RlbHMgdXBkYXRlcyB0aGUgd2lkZ2V0IGJlZm9yZSB0aGUgbmV4dFxuXHQgKiByZXF1ZXN0IGlzIHNlbnQuIFRoZSB1c2FnZSBudW1lcmF0b3Igc3RpbGwgY29tZXMgZnJvbSB0aGUgbGFzdCByZXNwb25zZS5cblx0ICovXG5cdHByaXZhdGUgX3NlbGVjdGVkTW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dFVzYWdlRGV0YWlscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0Q29udGV4dFVzYWdlRGV0YWlscz4oKSk7XG5cdHByaXZhdGUgX2NoYXRXaWRnZXQ6IElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnREYXRhID0gb2JzZXJ2YWJsZVZhbHVlT3B0czxJQ2hhdENvbnRleHRVc2FnZURhdGEgfCB1bmRlZmluZWQ+KHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBpc1NhbWVDb250ZXh0VXNhZ2VEYXRhIH0sIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX09QRU5FRF9TVE9SQUdFX0tFWSA9ICdjaGF0LmNvbnRleHRVc2FnZS5oYXNCZWVuT3BlbmVkJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0hPVkVSX0lEID0gJ2NoYXQuY29udGV4dFVzYWdlJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0VXNhZ2VPcGVuZWRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgX2VuYWJsZWQ6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFBlci1lZGl0b3IgcmVzb2x2ZXIgZm9yIGEgbW9kZWwncyBjb25maWd1cmF0aW9uIChlLmcuIHVzZXItc2VsZWN0ZWRcblx0ICogY29udGV4dCBzaXplKS4gV2hlbiB1bnNldCB0aGUgd2lkZ2V0IGZhbGxzIGJhY2sgdG8gdGhlIHByb2ZpbGUtZ2xvYmFsXG5cdCAqIHZhbHVlIGZyb20ge0BsaW5rIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TW9kZWxDb25maWd1cmF0aW9ufSwgd2hpY2ggY2FuXG5cdCAqIGxhZyB0aGUgZWRpdG9yJ3MgYWN0dWFsIHNlbGVjdGlvbiAoc2VlIGlzc3VlICMzMjAzOTMpLlxuXHQgKi9cblx0cHJpdmF0ZSBfbW9kZWxDb25maWd1cmF0aW9uUmVzb2x2ZXI6ICgobW9kZWxJZDogc3RyaW5nKSA9PiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvbU5vZGUgPSAkKCcuY2hhdC1jb250ZXh0LXVzYWdlLXdpZGdldCcpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY29udGV4dFVzYWdlTGFiZWwnLCBcIkNvbnRleHQgd2luZG93IHVzYWdlXCIpKTtcblxuXHRcdC8vIEljb24gY29udGFpbmVyIChhbHdheXMgdmlzaWJsZSwgY29udGFpbnMgdGhlIHBpZSBjaGFydClcblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gdGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKCQoJy5pY29uLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnByb2dyZXNzSW5kaWNhdG9yID0gbmV3IENpcmN1bGFyUHJvZ3Jlc3NJbmRpY2F0b3IoKTtcblx0XHRpY29uQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMucHJvZ3Jlc3NJbmRpY2F0b3IuZG9tTm9kZSk7XG5cblx0XHQvLyBQZXJjZW50YWdlIGxhYmVsICh2aXNpYmxlIG9uIGhvdmVyL2ZvY3VzKVxuXHRcdHRoaXMucGVyY2VudGFnZUxhYmVsID0gdGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKCQoJy5wZXJjZW50YWdlLWxhYmVsJykpO1xuXG5cdFx0Ly8gVHJhY2sgY29udGV4dCB1c2FnZSBvcGVuZWQgc3RhdGVcblx0XHR0aGlzLl9jb250ZXh0VXNhZ2VPcGVuZWRLZXkgPSBDaGF0Q29udGV4dEtleXMuY29udGV4dFVzYWdlSGFzQmVlbk9wZW5lZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHQvLyBSZXN0b3JlIHBlcnNpc3RlZCBzdGF0ZVxuXHRcdGlmICh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQ2hhdENvbnRleHRVc2FnZVdpZGdldC5fT1BFTkVEX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSkpIHtcblx0XHRcdHRoaXMuX2NvbnRleHRVc2FnZU9wZW5lZEtleS5zZXQodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgZW5hYmxlZCBzdGF0ZSBmcm9tIGNvbmZpZ3VyYXRpb25cblx0XHR0aGlzLl9lbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q29udGV4dFVzYWdlRW5hYmxlZCkgIT09IGZhbHNlO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdENvbnRleHRVc2FnZUVuYWJsZWQpKSB7XG5cdFx0XHRcdHRoaXMuX2VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRDb250ZXh0VXNhZ2VFbmFibGVkKSAhPT0gZmFsc2U7XG5cdFx0XHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnREYXRhLmdldCgpKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgdXAgaG92ZXIgLSB3aWxsIGJlIGNvbmZpZ3VyZWQgd2hlbiBkYXRhIGlzIGF2YWlsYWJsZVxuXHRcdHRoaXMuc2V0dXBIb3ZlcigpO1xuXHR9XG5cblx0c2V0Q2hhdFdpZGdldCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdFdpZGdldCA9IHdpZGdldDtcblx0XHR0aGlzLl9jb250ZXh0VXNhZ2VEZXRhaWxzLnZhbHVlPy5zZXRDaGF0V2lkZ2V0KHdpZGdldCk7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgdGhlIHN0aWNreSBjb250ZXh0IHVzYWdlIGRldGFpbHMgaG92ZXIgYW5kIHJlY29yZHMgdGhhdCB0aGUgdXNlclxuXHQgKiBoYXMgb3BlbmVkIGl0LiBSZXR1cm5zIGB0cnVlYCBpZiB0aGUgZGV0YWlscyB3ZXJlIHNob3duLlxuXHQgKi9cblx0c2hvd0RldGFpbHMoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGV0YWlscyA9IHRoaXMuX2NyZWF0ZURldGFpbHMoKTtcblx0XHRpZiAoIWRldGFpbHMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5ob3ZlclNlcnZpY2Uuc2hvd0luc3RhbnRIb3Zlcihcblx0XHRcdHsgLi4udGhpcy5faG92ZXJPcHRpb25zLCBjb250ZW50OiBkZXRhaWxzLmRvbU5vZGUsIHRhcmdldDogdGhpcy5kb21Ob2RlLCBwZXJzaXN0ZW5jZTogeyBoaWRlT25Ib3ZlcjogZmFsc2UsIHN0aWNreTogdHJ1ZSB9IH0sXG5cdFx0XHR0cnVlXG5cdFx0KTtcblx0XHR0aGlzLl9tYXJrT3BlbmVkKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3Zlck9wdGlvbnM6IE9taXQ8SURlbGF5ZWRIb3Zlck9wdGlvbnMsICdjb250ZW50Jz4gPSB7XG5cdFx0aWQ6IENoYXRDb250ZXh0VXNhZ2VXaWRnZXQuX0hPVkVSX0lELFxuXHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUsIGNvbXBhY3Q6IHRydWUgfSxcblx0XHRwZXJzaXN0ZW5jZTogeyBoaWRlT25Ib3ZlcjogZmFsc2UgfSxcblx0XHR0cmFwRm9jdXM6IHRydWVcblx0fTtcblxuXHRwcml2YXRlIF9jcmVhdGVEZXRhaWxzKCk6IENoYXRDb250ZXh0VXNhZ2VEZXRhaWxzIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZS5nZXQoKSB8fCAhdGhpcy5fY3VycmVudERhdGEuZ2V0KCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY29udGV4dFVzYWdlRGV0YWlscy52YWx1ZSkge1xuXHRcdFx0Ly8gRGV0YWlscyBzdWJzY3JpYmVzIHRvIGBfY3VycmVudERhdGFgIGFuZCByZS1yZW5kZXJzIHJlYWN0aXZlbHkuXG5cdFx0XHR0aGlzLl9jb250ZXh0VXNhZ2VEZXRhaWxzLnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29udGV4dFVzYWdlRGV0YWlscywgdGhpcy5fY2hhdFdpZGdldCwgdGhpcy5fY3VycmVudERhdGEpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dFVzYWdlRGV0YWlscy52YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX21hcmtPcGVuZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dFVzYWdlT3BlbmVkS2V5LnNldCh0cnVlKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKENoYXRDb250ZXh0VXNhZ2VXaWRnZXQuX09QRU5FRF9TVE9SQUdFX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0dXBIb3ZlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9ob3ZlckRpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9ob3ZlckRpc3Bvc2FibGUudmFsdWUgPSBzdG9yZTtcblxuXHRcdHN0b3JlLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLmRvbU5vZGUsICgpID0+ICh7XG5cdFx0XHQuLi50aGlzLl9ob3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiB0aGlzLl9jcmVhdGVEZXRhaWxzKCk/LmRvbU5vZGUgPz8gJydcblx0XHR9KSkpO1xuXG5cdFx0Ly8gU2hvdyBzdGlja3kgKyBmb2N1c2VkIGhvdmVyIG9uIGNsaWNrXG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0dGhpcy5zaG93RGV0YWlscygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNob3cgc3RpY2t5ICsgZm9jdXNlZCBob3ZlciBvbiBrZXlib2FyZCBhY3RpdmF0aW9uIChTcGFjZS9FbnRlcilcblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2dCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZ0LmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBldnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5zaG93RGV0YWlscygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWRnZXQgd2l0aCB0aGUgbGF0ZXN0IHJlcXVlc3QvcmVzcG9uc2UgZGF0YS5cblx0ICogVGhlIG1vZGVsIGlzIHJldHJpZXZlZCBmcm9tIHRoZSByZXF1ZXN0J3MgbW9kZWxJZC5cblx0ICogQHBhcmFtIGxhc3RSZXF1ZXN0IFRoZSBsYXN0IHJlcXVlc3QgaW4gdGhlIHNlc3Npb25cblx0ICovXG5cdHVwZGF0ZShsYXN0UmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0UmVxdWVzdERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLl9jdXJyZW50UmVzcG9uc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY3VycmVudE1vZGVsSWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIWxhc3RSZXF1ZXN0KSB7XG5cdFx0XHQvLyBOZXcvZW1wdHkgY2hhdCBzZXNzaW9uIGNsZWFyIGV2ZXJ5dGhpbmdcblx0XHRcdHRoaXMuX2N1cnJlbnREYXRhLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWxhc3RSZXF1ZXN0LnJlc3BvbnNlIHx8ICFsYXN0UmVxdWVzdC5tb2RlbElkKSB7XG5cdFx0XHQvLyBQZW5kaW5nIHJlcXVlc3Qga2VlcCBvbGQgZGF0YSB2aXNpYmxlIGlmIGF2YWlsYWJsZVxuXHRcdFx0aWYgKCF0aGlzLl9jdXJyZW50RGF0YS5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZSA9IGxhc3RSZXF1ZXN0LnJlc3BvbnNlO1xuXHRcdGNvbnN0IG1vZGVsSWQgPSBsYXN0UmVxdWVzdC5tb2RlbElkO1xuXHRcdHRoaXMuX2N1cnJlbnRSZXNwb25zZSA9IHJlc3BvbnNlO1xuXHRcdHRoaXMuX2N1cnJlbnRNb2RlbElkID0gbW9kZWxJZDtcblxuXHRcdC8vIFVwZGF0ZSBpbW1lZGlhdGVseSBpZiB1c2FnZSBkYXRhIGlzIGFscmVhZHkgYXZhaWxhYmxlXG5cdFx0dGhpcy51cGRhdGVGcm9tUmVzcG9uc2UocmVzcG9uc2UsIG1vZGVsSWQpO1xuXG5cdFx0Ly8gU3Vic2NyaWJlIHRvIHJlc3BvbnNlIGNoYW5nZXMgdG8gdXBkYXRlIHdoZW5ldmVyIHVzYWdlIGRhdGEgY2hhbmdlc1xuXHRcdHRoaXMuX2xhc3RSZXF1ZXN0RGlzcG9zYWJsZS52YWx1ZSA9IHJlc3BvbnNlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlRnJvbVJlc3BvbnNlKHJlc3BvbnNlLCBtb2RlbElkKTtcblx0XHR9KTtcblx0fVxuXG5cdHVwZGF0ZVNlc3Npb25Db3N0KHNlc3Npb25Db3N0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fY3VycmVudERhdGEuZ2V0KCk7XG5cdFx0aWYgKGRhdGEgJiYgZGF0YS5zZXNzaW9uQ29zdCAhPT0gc2Vzc2lvbkNvc3QpIHtcblx0XHRcdHRoaXMucmVuZGVyKHsgLi4uZGF0YSwgc2Vzc2lvbkNvc3QgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFByb3ZpZGVzIGEgcGVyLWVkaXRvciByZXNvbHZlciBmb3IgdGhlIHNlbGVjdGVkIG1vZGVsJ3MgY29uZmlndXJhdGlvblxuXHQgKiAobm90YWJseSB0aGUgdXNlci1zZWxlY3RlZCBjb250ZXh0IHNpemUpLiBUaGUgd2lkZ2V0IHJlLXJlbmRlcnMgd2hlbmV2ZXJcblx0ICogdGhlIHN1cHBsaWVkIGV2ZW50IGZpcmVzIGZvciB0aGUgY3VycmVudGx5IGRpc3BsYXllZCBtb2RlbC4gV2l0aG91dCB0aGlzLFxuXHQgKiB0aGUgd2lkZ2V0IGZhbGxzIGJhY2sgdG8gdGhlIHByb2ZpbGUtZ2xvYmFsIHZhbHVlLCB3aGljaCBjYW4gZHJpZnQgZnJvbVxuXHQgKiB0aGUgZWRpdG9yJ3MgYWN0dWFsIHNlbGVjdGlvbiAoc2VlIGlzc3VlICMzMjAzOTMpLlxuXHQgKi9cblx0c2V0TW9kZWxDb25maWd1cmF0aW9uUmVzb2x2ZXIoXG5cdFx0cmVzb2x2ZXI6IChtb2RlbElkOiBzdHJpbmcpID0+IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkLFxuXHRcdG9uRGlkQ2hhbmdlOiBFdmVudDxzdHJpbmc+LFxuXHQpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbENvbmZpZ3VyYXRpb25SZXNvbHZlciA9IHJlc29sdmVyO1xuXHRcdHRoaXMuX21vZGVsQ29uZmlndXJhdGlvbkxpc3RlbmVyLnZhbHVlID0gb25EaWRDaGFuZ2UobW9kZWxJZCA9PiB7XG5cdFx0XHRjb25zdCBhZmZlY3RzRGlzcGxheWVkTW9kZWwgPSB0aGlzLl9jdXJyZW50TW9kZWxJZCA9PT0gbW9kZWxJZCB8fCB0aGlzLl9zZWxlY3RlZE1vZGVsSWQgPT09IG1vZGVsSWQ7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFJlc3BvbnNlICYmIHRoaXMuX2N1cnJlbnRNb2RlbElkICYmIGFmZmVjdHNEaXNwbGF5ZWRNb2RlbCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUZyb21SZXNwb25zZSh0aGlzLl9jdXJyZW50UmVzcG9uc2UsIHRoaXMuX2N1cnJlbnRNb2RlbElkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBtb2RlbCB0aGUgdXNlciBjdXJyZW50bHkgaGFzIHNlbGVjdGVkIGluIHRoZSBwaWNrZXIuIFRoZVxuXHQgKiBjb250ZXh0LXdpbmRvdyBkZW5vbWluYXRvciB0aGVuIHJlZmxlY3RzIHRoaXMgbW9kZWwgaW1tZWRpYXRlbHksIGV2ZW5cblx0ICogYmVmb3JlIGEgcmVxdWVzdCBpcyBzZW50IHdpdGggaXQuIFRoZSB1c2FnZSBudW1lcmF0b3Igc3RpbGwgY29tZXMgZnJvbSB0aGVcblx0ICogbGFzdCBjb21wbGV0ZWQgcmVzcG9uc2UuXG5cdCAqL1xuXHRzZXRTZWxlY3RlZE1vZGVsKG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zZWxlY3RlZE1vZGVsSWQgPT09IG1vZGVsSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2VsZWN0ZWRNb2RlbElkID0gbW9kZWxJZDtcblx0XHRpZiAodGhpcy5fY3VycmVudFJlc3BvbnNlICYmIHRoaXMuX2N1cnJlbnRNb2RlbElkKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZUZyb21SZXNwb25zZSh0aGlzLl9jdXJyZW50UmVzcG9uc2UsIHRoaXMuX2N1cnJlbnRNb2RlbElkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgYSBtb2RlbCdzIGNvbnRleHQtd2luZG93IGRpbWVuc2lvbnMsIG9yIGB1bmRlZmluZWRgIHdoZW4gaXQgaGFzIG5vIHVzYWJsZSB3aW5kb3cuIEEgbWV0YS1tb2RlbCBzdWNoIGFzXG5cdCAqIFwiYXV0b1wiIGFkdmVydGlzZXMgYSB6ZXJvLXNpemVkIHdpbmRvdywgc28gaXQgcmVzb2x2ZXMgdG8gYHVuZGVmaW5lZGAgYW5kIHRoZSBjYWxsZXIgZmFsbHMgYmFjayB0byB0aGUgbW9kZWwgdGhhdFxuXHQgKiBhY3R1YWxseSBzZXJ2ZWQgdGhlIHJlcXVlc3QgKHNlZSBpc3N1ZSAjMzIxNzgxKS5cblx0ICovXG5cdHByaXZhdGUgcmVzb2x2ZUNvbnRleHRXaW5kb3cobW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyBtYXhPdXRwdXRUb2tlbnM6IG51bWJlciB8IHVuZGVmaW5lZDsgdG90YWxDb250ZXh0V2luZG93OiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFtb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbE1ldGFkYXRhID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbElkKTtcblx0XHQvLyBDb21wdXRpbmcgdGhlIHRvdGFsIGNvbnRleHQgd2luZG93IG5lZWRzIHRoZSBtb2RlbCdzIG1ldGFkYXRhLCBub3RhYmx5IGl0cyBvdXRwdXQtdG9rZW4gYnVkZ2V0XG5cdFx0Ly8gKGBtYXhPdXRwdXRUb2tlbnNgKSwgd2hpY2ggXHUyMDE0IHVubGlrZSB0aGUgaW5wdXQgd2luZG93IFx1MjAxNCBoYXMgbm8gY29uZmlndXJhdGlvbiBmYWxsYmFjay4gUmlnaHQgYWZ0ZXIgYSByZWxvYWQgdGhlXG5cdFx0Ly8gbW9kZWwgcHJvdmlkZXIgbWF5IG5vdCBoYXZlIHJlZ2lzdGVyZWQgdGhlIHNlbGVjdGVkIG1vZGVsIHlldCB3aGlsZSBhIHBlcnNpc3RlZCBgY29udGV4dFNpemVgIGlzIGFscmVhZHlcblx0XHQvLyByZXNvbHZhYmxlLCBzbyB0aGUgd2luZG93IHdvdWxkIGJlIGNvbXB1dGVkIGlucHV0LW9ubHkgKGUuZy4gMjcySyBpbnN0ZWFkIG9mIDI3MksgKyAxMjhLIGZvciBHUFQtNSkuIEJhaWwgb3V0XG5cdFx0Ly8gdW50aWwgbWV0YWRhdGEgaXMgYXZhaWxhYmxlIHJhdGhlciB0aGFuIHJlbmRlciBhIG1pc2xlYWRpbmcgcGFydGlhbCB2YWx1ZTsgdGhlIHdpZGdldCByZS1yZW5kZXJzIG9uIG1vZGVsXG5cdFx0Ly8gcmVnaXN0cmF0aW9uIChgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsc2ApIGFuZCBvbiBtb2RlbCBzZWxlY3Rpb24uXG5cdFx0aWYgKCFtb2RlbE1ldGFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbENvbmZpZ3VyYXRpb24gPSB0aGlzLl9tb2RlbENvbmZpZ3VyYXRpb25SZXNvbHZlcj8uKG1vZGVsSWQpID8/IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkKTtcblx0XHQvLyBQcmVmZXIgdGhlIHNjaGVtYSBkZWZhdWx0IGNvbnRleHQtc2l6ZSB0aWVyIHdoZW4gY29uZmlnIGlzIG1pc3NpbmcgKGtlZXBzIGRlbm9taW5hdG9yIGFsaWduZWQgd2l0aCB0aGUgcmVxdWVzdCBwYXRoKS5cblx0XHRjb25zdCBtYXhJbnB1dFRva2VucyA9IHJlc29sdmVDb250ZXh0V2luZG93SW5wdXRUb2tlbnMobW9kZWxDb25maWd1cmF0aW9uLCBtb2RlbE1ldGFkYXRhLmNvbmZpZ3VyYXRpb25TY2hlbWEsIG1vZGVsTWV0YWRhdGEubWF4SW5wdXRUb2tlbnMpO1xuXHRcdGNvbnN0IG1heE91dHB1dFRva2VucyA9IG1vZGVsTWV0YWRhdGEubWF4T3V0cHV0VG9rZW5zO1xuXHRcdGNvbnN0IHRvdGFsQ29udGV4dFdpbmRvdyA9IChtYXhJbnB1dFRva2VucyA/PyAwKSArIChtYXhPdXRwdXRUb2tlbnMgPz8gMCk7XG5cdFx0aWYgKHRvdGFsQ29udGV4dFdpbmRvdyA8PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBtYXhPdXRwdXRUb2tlbnMsIHRvdGFsQ29udGV4dFdpbmRvdyB9O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVGcm9tUmVzcG9uc2UocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VNb2RlbCwgbW9kZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdXNhZ2UgPSByZXNwb25zZS51c2FnZTtcblxuXHRcdC8vIFdoZW4gYSBtZXRhLW1vZGVsIChlLmcuIFwiYXV0b1wiKSByb3V0ZXMgdG8gYSBjb25jcmV0ZSBtb2RlbCwgdGhlXG5cdFx0Ly8gdXNhZ2UgcmVwb3J0cyB0aGUgYWN0dWFsIG1vZGVsIHRoYXQgc2VydmVkIHRoZSByZXF1ZXN0LlxuXHRcdGNvbnN0IGVmZmVjdGl2ZU1vZGVsSWQgPSB1c2FnZT8uYWN0dWFsTW9kZWxJZCA/PyBtb2RlbElkO1xuXG5cdFx0Ly8gVGhlIGRlbm9taW5hdG9yIChjb250ZXh0IHdpbmRvdykgZm9sbG93cyB0aGUgY3VycmVudGx5IHNlbGVjdGVkIG1vZGVsIHNvIHN3aXRjaGluZyBtb2RlbHMgdXBkYXRlcyB0aGUgd2lkZ2V0XG5cdFx0Ly8gaW1tZWRpYXRlbHk7IHRoZSBudW1lcmF0b3IgKHVzYWdlKSBzdGlsbCBjb21lcyBmcm9tIHRoZSBsYXN0IHJlc3BvbnNlLiBBIG1ldGEtbW9kZWwgc3VjaCBhcyBcImF1dG9cIiBoYXMgbm9cblx0XHQvLyBjb250ZXh0IHdpbmRvdyBvZiBpdHMgb3duLCBzbyBmYWxsIGJhY2sgdG8gdGhlIG1vZGVsIHRoYXQgYWN0dWFsbHkgc2VydmVkIHRoZSByZXF1ZXN0IChzZWUgaXNzdWUgIzMyMTc4MSkuXG5cdFx0Y29uc3QgY29udGV4dFdpbmRvdyA9IHRoaXMucmVzb2x2ZUNvbnRleHRXaW5kb3codGhpcy5fc2VsZWN0ZWRNb2RlbElkKSA/PyB0aGlzLnJlc29sdmVDb250ZXh0V2luZG93KGVmZmVjdGl2ZU1vZGVsSWQpO1xuXHRcdGlmICghdXNhZ2UgfHwgIWNvbnRleHRXaW5kb3cpIHtcblx0XHRcdGlmICghdGhpcy5fY3VycmVudERhdGEuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBtYXhPdXRwdXRUb2tlbnMsIHRvdGFsQ29udGV4dFdpbmRvdyB9ID0gY29udGV4dFdpbmRvdztcblxuXHRcdGNvbnN0IHByb21wdFRva2VucyA9IHVzYWdlLnByb21wdFRva2Vucztcblx0XHRjb25zdCBjb21wbGV0aW9uVG9rZW5zID0gdXNhZ2UuY29tcGxldGlvblRva2Vucztcblx0XHRjb25zdCBwcm9tcHRUb2tlbkRldGFpbHMgPSB1c2FnZS5wcm9tcHRUb2tlbkRldGFpbHM7XG5cdFx0Y29uc3QgdXNlZFRva2VucyA9IHByb21wdFRva2VucyArIGNvbXBsZXRpb25Ub2tlbnM7XG5cdFx0Y29uc3QgcGVyY2VudGFnZSA9ICh1c2VkVG9rZW5zIC8gdG90YWxDb250ZXh0V2luZG93KSAqIDEwMDtcblxuXHRcdC8vIFRoZSByZXNlcnZlIGJhbmQgaXMgYSBwcm9wZXJ0eSBvZiB0aGUgbW9kZWwgdGhlIHVzZXIgY3VycmVudGx5IGhhc1xuXHRcdC8vIHNlbGVjdGVkIChob3cgbXVjaCBvZiBpdHMgd2luZG93IGlzIHNldCBhc2lkZSBmb3Igb3V0cHV0KSwgbm90IG9mIHRoZVxuXHRcdC8vIHBhc3QgcmVzcG9uc2UsIHNvIGl0IGlzIGRlcml2ZWQgZnJvbSB0aGUgc2VsZWN0ZWQgbW9kZWwncyBtYXggb3V0cHV0XG5cdFx0Ly8gdG9rZW5zIHJhdGhlciB0aGFuIGB1c2FnZWAuIFJlbWFpbmluZyByZXNlcnZlID0gdGhhdCByZXNlcnZlIG1pbnVzIHdoYXRcblx0XHQvLyBjb21wbGV0aW9ucyBoYXZlIGFscmVhZHkgY29uc3VtZWQ7IG9uY2UgY29tcGxldGlvbnMgZXhjZWVkIGl0LCBpdCBkcm9wc1xuXHRcdC8vIHRvIDAuXG5cdFx0Y29uc3Qgb3V0cHV0QnVmZmVyUGVyY2VudGFnZSA9IG1heE91dHB1dFRva2VucyAhPT0gdW5kZWZpbmVkXG5cdFx0XHQ/IChNYXRoLm1heCgwLCBtYXhPdXRwdXRUb2tlbnMgLSBjb21wbGV0aW9uVG9rZW5zKSAvIHRvdGFsQ29udGV4dFdpbmRvdykgKiAxMDBcblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5yZW5kZXIoe1xuXHRcdFx0dXNlZFRva2VucywgY29tcGxldGlvblRva2VucywgdG90YWxDb250ZXh0V2luZG93LFxuXHRcdFx0cGVyY2VudGFnZSwgb3V0cHV0QnVmZmVyUGVyY2VudGFnZSxcblx0XHRcdHByb21wdFRva2VuRGV0YWlscywgc2Vzc2lvbkNvc3Q6IHJlc3BvbnNlLnNlc3Npb24uc2Vzc2lvbkNvc3QsXG5cdFx0fSk7XG5cdFx0dGhpcy5zaG93KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcihkYXRhOiBJQ2hhdENvbnRleHRVc2FnZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJyZW50RGF0YS5zZXQoZGF0YSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFBpZSBjaGFydCBzaG93cyBhY3R1YWwgdXNhZ2UgcGVyY2VudGFnZSBvbmx5XG5cdFx0dGhpcy5wcm9ncmVzc0luZGljYXRvci5zZXRQcm9ncmVzcyhkYXRhLnBlcmNlbnRhZ2UpO1xuXG5cdFx0Ly8gVXBkYXRlIHBlcmNlbnRhZ2UgbGFiZWwgYW5kIGFyaWEtbGFiZWwgKGNsYW1wIGRpc3BsYXkgdG8gMTAwKVxuXHRcdGNvbnN0IHJvdW5kZWRQZXJjZW50YWdlID0gTWF0aC5taW4oMTAwLCBNYXRoLnJvdW5kKGRhdGEucGVyY2VudGFnZSkpO1xuXHRcdHRoaXMucGVyY2VudGFnZUxhYmVsLnRleHRDb250ZW50ID0gYCR7cm91bmRlZFBlcmNlbnRhZ2V9JWA7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjb250ZXh0VXNhZ2VQZXJjZW50YWdlTGFiZWwnLCBcIkNvbnRleHQgd2luZG93IHVzYWdlOiB7MH0lXCIsIHJvdW5kZWRQZXJjZW50YWdlKSk7XG5cblx0XHQvLyBDb2xvciBiYXNlZCBvbiBhY3R1YWwgdXNhZ2UgcGVyY2VudGFnZVxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCd3YXJuaW5nJywgJ2Vycm9yJyk7XG5cdFx0aWYgKGRhdGEucGVyY2VudGFnZSA+PSA5MCkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2Vycm9yJyk7XG5cdFx0fSBlbHNlIGlmIChkYXRhLnBlcmNlbnRhZ2UgPj0gNzUpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd3YXJuaW5nJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPT09ICdub25lJykge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuX2lzVmlzaWJsZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoaWRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2lzVmlzaWJsZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZmlyZSgpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsV0FBVyw2QkFBNkI7QUFHakQsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFzQixpQkFBaUIsMkJBQTJCO0FBQ2xFLFNBQVMsY0FBYztBQUN2QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBNEMsOEJBQThCO0FBQzFFLFNBQVMsK0JBQXNEO0FBRS9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZUFBZTtBQUV4QixNQUFNLElBQUksSUFBSTtBQWtCUCxTQUFTLGdDQUNmLG9CQUNBLHFCQUNBLGdCQUNxQjtBQUNyQixRQUFNLHdCQUF3QixPQUFPLG9CQUFvQixnQkFBZ0IsV0FBVyxtQkFBbUIsY0FBYztBQUNySCxRQUFNLDJCQUEyQixxQkFBcUIsWUFBWSxhQUFhO0FBQy9FLFNBQU8sMEJBQ0YsT0FBTyw2QkFBNkIsV0FBVywyQkFBMkIsV0FDM0U7QUFDTDtBQU9PLFNBQVMsdUJBQXVCLEdBQXNDLEdBQStDO0FBQzNILE1BQUksTUFBTSxHQUFHO0FBQ1osV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLENBQUMsS0FBSyxDQUFD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
