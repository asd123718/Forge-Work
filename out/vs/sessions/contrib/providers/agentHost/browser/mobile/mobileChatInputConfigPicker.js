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
import * as dom from "../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Gesture, EventType as TouchEventType } from "../../../../../../base/browser/touch.js";
import { BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { IActionViewItemService } from "../../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../../workbench/common/contributions.js";
import { IChatPhoneInputPresenter } from "../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js";
import { getModelProviderIcon } from "../../../../../../workbench/contrib/chat/browser/widget/input/modelPicker/modelProviderIcons.js";
import { Menus } from "../../../../../browser/menus.js";
import { SessionUsesCombinedConfigPickerContext, IsPhoneLayoutContext } from "../../../../../common/contextkeys.js";
import { isAgentHostProvider, isAgentHostProviderId } from "../../../../../common/agentHostSessionsProvider.js";
import { ISessionsService } from "../../../../../services/sessions/browser/sessionsService.js";
import { ISessionsProvidersService } from "../../../../../services/sessions/browser/sessionsProvidersService.js";
import { ISessionContext } from "../../../../../services/sessions/browser/sessionContext.js";
import { isWellKnownModeSchema } from "../agentHostPermissionPickerDelegate.js";
import { getAgentHostModeIcon } from "../agentHostModeIcon.js";
import { INewChatModelPickerService } from "../../../../chat/browser/newChatModelPicker.js";
import { ISessionModelSelectionModel } from "../../../../chat/browser/sessionModelSelectionModel.js";
import { reportNewChatPickerClosed } from "../../../../chat/browser/newChatPickerTelemetry.js";
import { createChatPhoneInputSessionContext, createChatPhoneInputTarget, matchesChatPhoneInputTarget } from "./mobileChatPhoneInputTarget.js";
const MOBILE_CHAT_INPUT_CONFIG_PICKER_ID = "sessions.agentHost.mobileChatInputConfigPicker";
let MobileChatInputConfigPicker = class extends Disposable {
  constructor(_session, _sessionsProvidersService, _telemetryService, _phonePresenter, _newChatModelPickerService, _selectionModel, _uriIdentityService) {
    super();
    this._session = _session;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._telemetryService = _telemetryService;
    this._phonePresenter = _phonePresenter;
    this._newChatModelPickerService = _newChatModelPickerService;
    this._selectionModel = _selectionModel;
    this._uriIdentityService = _uriIdentityService;
    this._renderDisposables = this._register(new DisposableStore());
    this._providerListeners = this._register(new DisposableMap());
    this._register(this._newChatModelPickerService.registerModelPicker({
      open: () => {
        void this._showSheet();
      },
      switchToModel: (modelIdentifier) => this._switchToModel(modelIdentifier)
    }));
    this._register(autorun((reader) => {
      this._session.read(reader);
      this._selectionModel.state.read(reader);
      this._updateTrigger();
    }));
    this._register(this._sessionsProvidersService.onDidChangeProviders((e) => {
      for (const provider of e.removed) {
        this._providerListeners.deleteAndDispose(provider.id);
      }
      this._watchProviders(e.added);
      this._updateTrigger();
    }));
    this._watchProviders(this._sessionsProvidersService.getProviders());
  }
  /**
   * Subscribe to each agent-host provider's `onDidChangeSessionConfig`
   * so the button refreshes when the session's mode is mutated outside
   * the sheet (e.g. by a setting reload, schema re-resolve, or
   * another picker).
   */
  _watchProviders(providers) {
    for (const provider of providers) {
      if (this._providerListeners.has(provider.id)) {
        continue;
      }
      const resolved = this._sessionsProvidersService.getProvider(provider.id);
      if (!resolved || !isAgentHostProvider(resolved)) {
        continue;
      }
      this._providerListeners.set(provider.id, resolved.onDidChangeSessionConfig(() => this._updateTrigger()));
    }
  }
  render(container) {
    this._renderDisposables.clear();
    this._containerElement = container;
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot.sessions-chat-picker-slot-mobile-config"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    this._slotElement = slot;
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._renderDisposables.add(Gesture.addTarget(trigger));
    for (const eventType of [dom.EventType.CLICK, TouchEventType.Tap]) {
      this._renderDisposables.add(dom.addDisposableListener(trigger, eventType, (e) => {
        dom.EventHelper.stop(e, true);
        this._showSheet();
      }));
    }
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this._showSheet();
      }
    }));
    this._updateTrigger();
  }
  _getContext() {
    const session = this._session.get();
    if (!session) {
      return void 0;
    }
    const provider = this._sessionsProvidersService.getProvider(session.providerId);
    if (!provider || !isAgentHostProvider(provider)) {
      return void 0;
    }
    const config = provider.getSessionConfig(session.sessionId);
    const modeSchema = config?.schema.properties[SessionConfigKey.Mode];
    const modeItems = modeSchema && isWellKnownModeSchema(modeSchema) ? (modeSchema.enum ?? []).map((value, index) => ({
      value: String(value),
      label: modeSchema.enumLabels?.[index] ?? String(value),
      description: modeSchema.enumDescriptions?.[index]
    })) : [];
    const rawCurrentMode = config?.values[SessionConfigKey.Mode] ?? modeSchema?.default;
    const currentMode = typeof rawCurrentMode === "string" && modeItems.some((i) => i.value === rawCurrentMode) ? rawCurrentMode : modeItems[0]?.value;
    const selectionState = this._selectionModel.state.get();
    const modelItems = selectionState.models;
    const currentModelId = selectionState.currentModel?.identifier;
    const showAutoModel = selectionState.options.showAutoModel;
    return { provider, session, modeItems, currentMode, modelItems, currentModelId, showAutoModel };
  }
  _updateTrigger() {
    if (!this._slotElement || !this._triggerElement || !this._containerElement) {
      return;
    }
    const ctx = this._getContext();
    if (!ctx || ctx.modeItems.length === 0 && ctx.modelItems.length === 0 && ctx.showAutoModel) {
      this._slotElement.style.display = "none";
      this._containerElement.style.display = "none";
      return;
    }
    this._slotElement.style.display = "";
    this._containerElement.style.display = "";
    dom.clearNode(this._triggerElement);
    const modeIcon = ctx.currentMode ? getAgentHostModeIcon(ctx.currentMode) : void 0;
    if (modeIcon) {
      dom.append(this._triggerElement, renderIcon(modeIcon));
    }
    const currentModel = ctx.currentModelId ? ctx.modelItems.find((m) => m.identifier === ctx.currentModelId) : void 0;
    if (currentModel) {
      dom.append(this._triggerElement, renderIcon(getModelProviderIcon(currentModel)));
    }
    const labelText = currentModel?.metadata.name ?? (ctx.showAutoModel ? localize("mobileChatInputConfigPicker.autoLabel", "Auto") : localize("mobileChatInputConfigPicker.noModelsLabel", "No models available"));
    const labelSpan = dom.append(this._triggerElement, dom.$("span.chat-input-picker-label"));
    labelSpan.textContent = labelText;
    const ariaParts = [];
    if (ctx.currentMode) {
      const modeItem = ctx.modeItems.find((i) => i.value === ctx.currentMode);
      if (modeItem) {
        ariaParts.push(modeItem.label);
      }
    }
    ariaParts.push(labelText);
    this._triggerElement.ariaLabel = localize(
      "mobileChatInputConfigPicker.triggerAriaLabel",
      "Pick Mode and Model, {0}",
      ariaParts.join(", ")
    );
    const isResolving = ctx.provider.isSessionConfigResolving(ctx.session.sessionId).get();
    this._slotElement.classList.toggle("resolving", isResolving);
    this._triggerElement.setAttribute("aria-disabled", isResolving ? "true" : "false");
  }
  _switchToModel(modelIdentifier) {
    return this._selectionModel.selectModel(modelIdentifier);
  }
  async _showSheet() {
    if (!this._triggerElement) {
      return;
    }
    const ctx = this._getContext();
    if (ctx && ctx.provider.isSessionConfigResolving(ctx.session.sessionId).get()) {
      return;
    }
    const trigger = this._triggerElement;
    const beforeCtx = ctx;
    const target = createChatPhoneInputTarget(createChatPhoneInputSessionContext(beforeCtx?.session), this._uriIdentityService);
    const beforeMode = beforeCtx?.currentMode;
    const beforeModeItem = beforeCtx?.modeItems.find((i) => i.value === beforeMode);
    const beforeModelId = beforeCtx?.currentModelId;
    const beforeModel = beforeModelId ? beforeCtx?.modelItems.find((m) => m.identifier === beforeModelId) : void 0;
    trigger.setAttribute("aria-expanded", "true");
    try {
      await this._phonePresenter.showCombinedModeAndModelSheet(trigger, {
        kind: "session",
        getSessionContext: () => createChatPhoneInputSessionContext(this._session.get()),
        selectModel: (modelIdentifier) => this._switchToModel(modelIdentifier)
      });
      const afterCtx = this._getContext();
      if (beforeCtx && afterCtx && matchesChatPhoneInputTarget(target, createChatPhoneInputSessionContext(afterCtx.session), this._uriIdentityService)) {
        if (beforeCtx.modeItems.length > 0) {
          const afterMode = afterCtx.currentMode;
          const afterModeItem = afterCtx.modeItems.find((i) => i.value === afterMode);
          reportNewChatPickerClosed(this._telemetryService, {
            id: "NewChatMobileChatInputConfigPicker",
            name: "NewChatMobileChatInputConfigPicker.mode",
            optionIdBefore: beforeMode,
            optionIdAfter: afterMode,
            optionLabelBefore: beforeModeItem?.label ?? beforeMode,
            optionLabelAfter: afterModeItem?.label ?? afterMode,
            isPII: false
          });
        }
        if (beforeCtx.modelItems.length > 0) {
          const afterModelId = afterCtx.currentModelId;
          const afterModel = afterModelId ? afterCtx.modelItems.find((m) => m.identifier === afterModelId) : void 0;
          reportNewChatPickerClosed(this._telemetryService, {
            id: "NewChatMobileChatInputConfigPicker",
            name: "NewChatMobileChatInputConfigPicker.model",
            optionIdBefore: beforeModelId,
            optionIdAfter: afterModelId,
            optionLabelBefore: beforeModel?.metadata.name,
            optionLabelAfter: afterModel?.metadata.name,
            isPII: false
          });
        }
      }
    } finally {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    }
  }
};
MobileChatInputConfigPicker = __decorateClass([
  __decorateParam(1, ISessionsProvidersService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IChatPhoneInputPresenter),
  __decorateParam(4, INewChatModelPickerService),
  __decorateParam(5, ISessionModelSelectionModel),
  __decorateParam(6, IUriIdentityService)
], MobileChatInputConfigPicker);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: MOBILE_CHAT_INPUT_CONFIG_PICKER_ID,
      title: localize2("mobileChatInputConfigPicker", "Mode and Model"),
      f1: false,
      menu: [{
        id: Menus.NewSessionConfig,
        group: "navigation",
        order: 0,
        when: ContextKeyExpr.and(SessionUsesCombinedConfigPickerContext, IsPhoneLayoutContext)
      }]
    });
  }
  async run() {
  }
});
let MobileChatInputConfigPickerContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, sessionsService, contextKeyService) {
    super();
    const usesCombinedPicker = SessionUsesCombinedConfigPickerContext.bindTo(contextKeyService);
    this._register(autorun((reader) => {
      const session = sessionsService.activeSession.read(reader);
      usesCombinedPicker.set(!!session && isAgentHostProviderId(session.providerId));
    }));
    this._register(actionViewItemService.register(
      Menus.NewSessionConfig,
      MOBILE_CHAT_INPUT_CONFIG_PICKER_ID,
      (_action, _options, scopedInstantiationService) => {
        const { session } = scopedInstantiationService.invokeFunction((accessor) => accessor.get(ISessionContext));
        const picker = scopedInstantiationService.createInstance(MobileChatInputConfigPicker, session);
        return new MobileChatInputConfigPickerActionViewItem(picker);
      }
    ));
  }
};
MobileChatInputConfigPickerContribution.ID = "sessions.contrib.mobileChatInputConfigPicker";
MobileChatInputConfigPickerContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IContextKeyService)
], MobileChatInputConfigPickerContribution);
class MobileChatInputConfigPickerActionViewItem extends BaseActionViewItem {
  constructor(_picker) {
    super(void 0, { id: "", label: "", enabled: true, class: void 0, tooltip: "", run: () => {
    } });
    this._picker = _picker;
  }
  render(container) {
    this._picker.render(container);
    container.classList.add("chat-input-picker-item");
  }
  dispose() {
    this._picker.dispose();
    super.dispose();
  }
}
registerWorkbenchContribution2(MobileChatInputConfigPickerContribution.ID, MobileChatInputConfigPickerContribution, WorkbenchPhase.AfterRestored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXGJyb3dzZXJcXG1vYmlsZVxcbW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlLCBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyB0eXBlIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElDaGF0UGhvbmVJbnB1dFByZXNlbnRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgZ2V0TW9kZWxQcm92aWRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L21vZGVsUGlja2VyL21vZGVsUHJvdmlkZXJJY29ucy5qcyc7XG5pbXBvcnQgeyBNZW51cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbWVudXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblVzZXNDb21iaW5lZENvbmZpZ1BpY2tlckNvbnRleHQsIElzUGhvbmVMYXlvdXRDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIGlzQWdlbnRIb3N0UHJvdmlkZXIsIGlzQWdlbnRIb3N0UHJvdmlkZXJJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbkNvbnRleHQuanMnO1xuaW1wb3J0IHsgaXNXZWxsS25vd25Nb2RlU2NoZW1hIH0gZnJvbSAnLi4vYWdlbnRIb3N0UGVybWlzc2lvblBpY2tlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IGdldEFnZW50SG9zdE1vZGVJY29uIH0gZnJvbSAnLi4vYWdlbnRIb3N0TW9kZUljb24uanMnO1xuaW1wb3J0IHsgSU5ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvbmV3Q2hhdE1vZGVsUGlja2VyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9zZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyByZXBvcnROZXdDaGF0UGlja2VyQ2xvc2VkIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL25ld0NoYXRQaWNrZXJUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ2hhdFBob25lSW5wdXRTZXNzaW9uQ29udGV4dCwgY3JlYXRlQ2hhdFBob25lSW5wdXRUYXJnZXQsIG1hdGNoZXNDaGF0UGhvbmVJbnB1dFRhcmdldCB9IGZyb20gJy4vbW9iaWxlQ2hhdFBob25lSW5wdXRUYXJnZXQuanMnO1xuXG5jb25zdCBNT0JJTEVfQ0hBVF9JTlBVVF9DT05GSUdfUElDS0VSX0lEID0gJ3Nlc3Npb25zLmFnZW50SG9zdC5tb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXInO1xuXG5pbnRlcmZhY2UgSU1vYmlsZUNvbmZpZ0NvbnRleHQge1xuXHRyZWFkb25seSBwcm92aWRlcjogSUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI7XG5cdHJlYWRvbmx5IHNlc3Npb246IElBY3RpdmVTZXNzaW9uO1xuXHRyZWFkb25seSBtb2RlSXRlbXM6IHJlYWRvbmx5IHsgdmFsdWU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfVtdO1xuXHRyZWFkb25seSBjdXJyZW50TW9kZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBtb2RlbEl0ZW1zOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXTtcblx0cmVhZG9ubHkgY3VycmVudE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2hvd0F1dG9Nb2RlbDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBQaG9uZS1vbmx5IGNoYXQgaW5wdXQgY29uZmlnIHBpY2tlciB0aGF0IGNvbWJpbmVzIHRoZSBNb2RlIGFuZCBNb2RlbFxuICogcGlja2VycyBpbnRvIG9uZSBjb21wYWN0IGJ1dHRvbiB0aGF0IG9wZW5zIGEgdW5pZmllZCBib3R0b20gc2hlZXQuXG4gKlxuICogRGVza3RvcCByZW5kZXJzIE1vZGUgYW5kIE1vZGVsIGFzIHR3byBzZXBhcmF0ZSBwaWNrZXJzIGluIHRoZSBpbnB1dFxuICogdG9vbGJhciAoc2VlIHtAbGluayBBZ2VudEhvc3RNb2RlUGlja2VyfSBhbmQgdGhlIHNlc3Npb25zLWNvcmUgbW9kZWxcbiAqIHBpY2tlcikuIE9uIHBob25lIHRob3NlIHR3byBkZXNrdG9wIHBpY2tlcnMgYXJlXG4gKiBnYXRlZCBvZmYgdmlhIGB3aGVuOiBJc1Bob25lTGF5b3V0Q29udGV4dC5uZWdhdGUoKWAgYW5kIHRoaXMgc2luZ2xlXG4gKiBjb21iaW5lZCBwaWNrZXIgdGFrZXMgdGhlaXIgc2xvdCBcdTIwMTQgc2FtZSBkYXRhLCBkaWZmZXJlbnQgcHJlc2VudGF0aW9uLFxuICogbWF0Y2hpbmcgdGhlIE1PQklMRS5tZCBjb3JlIHByaW5jaXBsZS5cbiAqXG4gKiBUaGUgdHJpZ2dlciBsYWJlbCBzaG93cyB0aGUgY3VycmVudCBtb2RlbCBuYW1lIChlLmcuIFwiQXV0b1wiKSBzbyB0aGVcbiAqIHVzZXIgaW1tZWRpYXRlbHkgc2VlcyB0aGUgbW9zdCByZWxldmFudCBjb25maWd1cmF0aW9uOyB0aGUgbW9kZSBpc1xuICogc3VyZmFjZWQgYXMgdGhlIGJ1dHRvbidzIGxlYWRpbmcgaWNvbiB3aGVuIG9uZSBpcyBzZWxlY3RlZC4gVGFwcGluZ1xuICogb3BlbnMgYSBzaGVldCB3aXRoIHR3byBzZWN0aW9uczogQWdlbnQgTW9kZSAoSW50ZXJhY3RpdmUgLyBQbGFuIC9cbiAqIEF1dG9waWxvdCB3aGVuIGFwcGxpY2FibGUpIGFuZCBNb2RlbCAodGhlIG1vZGVsIGxpc3QgZmlsdGVyZWQgYnkgdGhlXG4gKiBhY3RpdmUgc2Vzc2lvbidzIHJlc291cmNlIHNjaGVtZSkuXG4gKi9cbmNsYXNzIE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIF9jb250YWluZXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2xvdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF90cmlnZ2VyRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+LFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDaGF0UGhvbmVJbnB1dFByZXNlbnRlciBwcml2YXRlIHJlYWRvbmx5IF9waG9uZVByZXNlbnRlcjogSUNoYXRQaG9uZUlucHV0UHJlc2VudGVyLFxuXHRcdEBJTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9uZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlOiBJTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSxcblx0XHRASVNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsIHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbk1vZGVsOiBJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2UucmVnaXN0ZXJNb2RlbFBpY2tlcih7XG5cdFx0XHRvcGVuOiAoKSA9PiB7IHZvaWQgdGhpcy5fc2hvd1NoZWV0KCk7IH0sXG5cdFx0XHRzd2l0Y2hUb01vZGVsOiBtb2RlbElkZW50aWZpZXIgPT4gdGhpcy5fc3dpdGNoVG9Nb2RlbChtb2RlbElkZW50aWZpZXIpLFxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJlbmRlciB0aGUgdHJpZ2dlciB3aGVuZXZlciB0aGUgYWN0aXZlIHNlc3Npb24sIGl0cyBjb25maWcsXG5cdFx0Ly8gaXRzIG1vZGVsLCBvciB0aGUgYXZhaWxhYmxlIGxhbmd1YWdlIG1vZGVscyBjaGFuZ2UuIFRoZVxuXHRcdC8vIFRoZSBpbnB1dC1zY29wZWQgc2VsZWN0aW9uIG1vZGVsIG93bnMgbW9kZWwgaW5pdGlhbGl6YXRpb24gZXZlbiB3aGVuXG5cdFx0Ly8gdGhlIGRlc2t0b3AgcGlja2VyIGlzIGdhdGVkIG9mZiwgc28gdGhpcyBzdXJmYWNlIG9ubHkgcmVuZGVycyBpdC5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbk1vZGVsLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXIoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJvdmlkZXJzKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShwcm92aWRlci5pZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93YXRjaFByb3ZpZGVycyhlLmFkZGVkKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXIoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fd2F0Y2hQcm92aWRlcnModGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTdWJzY3JpYmUgdG8gZWFjaCBhZ2VudC1ob3N0IHByb3ZpZGVyJ3MgYG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZ2Bcblx0ICogc28gdGhlIGJ1dHRvbiByZWZyZXNoZXMgd2hlbiB0aGUgc2Vzc2lvbidzIG1vZGUgaXMgbXV0YXRlZCBvdXRzaWRlXG5cdCAqIHRoZSBzaGVldCAoZS5nLiBieSBhIHNldHRpbmcgcmVsb2FkLCBzY2hlbWEgcmUtcmVzb2x2ZSwgb3Jcblx0ICogYW5vdGhlciBwaWNrZXIpLlxuXHQgKi9cblx0cHJpdmF0ZSBfd2F0Y2hQcm92aWRlcnMocHJvdmlkZXJzOiByZWFkb25seSB7IGlkOiBzdHJpbmcgfVtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBwcm92aWRlcnMpIHtcblx0XHRcdGlmICh0aGlzLl9wcm92aWRlckxpc3RlbmVycy5oYXMocHJvdmlkZXIuaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIocHJvdmlkZXIuaWQpO1xuXHRcdFx0aWYgKCFyZXNvbHZlZCB8fCAhaXNBZ2VudEhvc3RQcm92aWRlcihyZXNvbHZlZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm92aWRlckxpc3RlbmVycy5zZXQocHJvdmlkZXIuaWQsIHJlc29sdmVkLm9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZygoKSA9PiB0aGlzLl91cGRhdGVUcmlnZ2VyKCkpKTtcblx0XHR9XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY29udGFpbmVyRWxlbWVudCA9IGNvbnRhaW5lcjtcblxuXHRcdGNvbnN0IHNsb3QgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXBpY2tlci1zbG90LnNlc3Npb25zLWNoYXQtcGlja2VyLXNsb3QtbW9iaWxlLWNvbmZpZycpKTtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiBzbG90LnJlbW92ZSgpIH0pO1xuXHRcdHRoaXMuX3Nsb3RFbGVtZW50ID0gc2xvdDtcblxuXHRcdGNvbnN0IHRyaWdnZXIgPSBkb20uYXBwZW5kKHNsb3QsIGRvbS4kKCdhLmFjdGlvbi1sYWJlbCcpKTtcblx0XHR0cmlnZ2VyLnRhYkluZGV4ID0gMDtcblx0XHR0cmlnZ2VyLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudCA9IHRyaWdnZXI7XG5cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoR2VzdHVyZS5hZGRUYXJnZXQodHJpZ2dlcikpO1xuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtkb20uRXZlbnRUeXBlLkNMSUNLLCBUb3VjaEV2ZW50VHlwZS5UYXBdKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBldmVudFR5cGUsIGUgPT4ge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5fc2hvd1NoZWV0KCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRyaWdnZXIsIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuX3Nob3dTaGVldCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZVRyaWdnZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENvbnRleHQoKTogSU1vYmlsZUNvbmZpZ0NvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXIoc2Vzc2lvbi5wcm92aWRlcklkKTtcblx0XHRpZiAoIXByb3ZpZGVyIHx8ICFpc0FnZW50SG9zdFByb3ZpZGVyKHByb3ZpZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBNb2RlIChvcHRpb25hbCBcdTIwMTQgYWdlbnQgbWF5IG5vdCBhZHZlcnRpc2UgYSB3ZWxsLWtub3duIHNjaGVtYSlcblx0XHRjb25zdCBjb25maWcgPSBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBtb2RlU2NoZW1hID0gY29uZmlnPy5zY2hlbWEucHJvcGVydGllc1tTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdO1xuXHRcdGNvbnN0IG1vZGVJdGVtcyA9IChtb2RlU2NoZW1hICYmIGlzV2VsbEtub3duTW9kZVNjaGVtYShtb2RlU2NoZW1hKSlcblx0XHRcdD8gKG1vZGVTY2hlbWEuZW51bSA/PyBbXSkubWFwKCh2YWx1ZSwgaW5kZXgpID0+ICh7XG5cdFx0XHRcdHZhbHVlOiBTdHJpbmcodmFsdWUpLFxuXHRcdFx0XHRsYWJlbDogbW9kZVNjaGVtYS5lbnVtTGFiZWxzPy5baW5kZXhdID8/IFN0cmluZyh2YWx1ZSksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBtb2RlU2NoZW1hLmVudW1EZXNjcmlwdGlvbnM/LltpbmRleF0sXG5cdFx0XHR9KSlcblx0XHRcdDogW107XG5cdFx0Y29uc3QgcmF3Q3VycmVudE1vZGUgPSBjb25maWc/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdID8/IG1vZGVTY2hlbWE/LmRlZmF1bHQ7XG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSAodHlwZW9mIHJhd0N1cnJlbnRNb2RlID09PSAnc3RyaW5nJyAmJiBtb2RlSXRlbXMuc29tZShpID0+IGkudmFsdWUgPT09IHJhd0N1cnJlbnRNb2RlKSlcblx0XHRcdD8gcmF3Q3VycmVudE1vZGVcblx0XHRcdDogbW9kZUl0ZW1zWzBdPy52YWx1ZTtcblxuXHRcdC8vIE1vZGVsXG5cdFx0Y29uc3Qgc2VsZWN0aW9uU3RhdGUgPSB0aGlzLl9zZWxlY3Rpb25Nb2RlbC5zdGF0ZS5nZXQoKTtcblx0XHRjb25zdCBtb2RlbEl0ZW1zID0gc2VsZWN0aW9uU3RhdGUubW9kZWxzO1xuXHRcdGNvbnN0IGN1cnJlbnRNb2RlbElkID0gc2VsZWN0aW9uU3RhdGUuY3VycmVudE1vZGVsPy5pZGVudGlmaWVyO1xuXHRcdGNvbnN0IHNob3dBdXRvTW9kZWwgPSBzZWxlY3Rpb25TdGF0ZS5vcHRpb25zLnNob3dBdXRvTW9kZWw7XG5cblx0XHRyZXR1cm4geyBwcm92aWRlciwgc2Vzc2lvbiwgbW9kZUl0ZW1zLCBjdXJyZW50TW9kZSwgbW9kZWxJdGVtcywgY3VycmVudE1vZGVsSWQsIHNob3dBdXRvTW9kZWwgfTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVRyaWdnZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zbG90RWxlbWVudCB8fCAhdGhpcy5fdHJpZ2dlckVsZW1lbnQgfHwgIXRoaXMuX2NvbnRhaW5lckVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdHggPSB0aGlzLl9nZXRDb250ZXh0KCk7XG5cdFx0Ly8gSGlkZSB0aGUgYnV0dG9uIHdoZW4gdGhlcmUncyBub3RoaW5nIHRvIHBpY2sgKG5vIG1vZGUgQU5EIG5vXG5cdFx0Ly8gbW9kZWxzKS4gSW4gdGhhdCBzdGF0ZSB0aGUgdG9vbGJhciBpcyBtb3JlIGNvbXBhY3QgcmF0aGVyIHRoYW5cblx0XHQvLyBzaG93aW5nIGEgbm8tb3AgdHJpZ2dlci4gQWxzbyBjb2xsYXBzZSB0aGUgd3JhcHBpbmdcblx0XHQvLyBgLmFjdGlvbi1pdGVtYCB0aGF0IGBNZW51V29ya2JlbmNoVG9vbEJhcmAgY3JlYXRlZCBcdTIwMTQgaGlkaW5nXG5cdFx0Ly8gb25seSB0aGUgaW5uZXIgc2xvdCBsZWF2ZXMgdGhlIHdyYXBwZXIgb2NjdXB5aW5nIGl0c1xuXHRcdC8vIGBtaW4td2lkdGhgIGZsb29yIGFuZCBwcm9kdWNlcyBhIHZpc2libGUgZW1wdHkgZ2FwLlxuXHRcdGlmICghY3R4IHx8IChjdHgubW9kZUl0ZW1zLmxlbmd0aCA9PT0gMCAmJiBjdHgubW9kZWxJdGVtcy5sZW5ndGggPT09IDAgJiYgY3R4LnNob3dBdXRvTW9kZWwpKSB7XG5cdFx0XHR0aGlzLl9zbG90RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fY29udGFpbmVyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zbG90RWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fY29udGFpbmVyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX3RyaWdnZXJFbGVtZW50KTtcblxuXHRcdC8vIExlYWRpbmcgaWNvbjogdGhlIGN1cnJlbnQgbW9kZSdzIGljb24gaWYgYSBtb2RlIGlzIHNlbGVjdGVkLFxuXHRcdC8vIG90aGVyd2lzZSBub3RoaW5nLlxuXHRcdGNvbnN0IG1vZGVJY29uID0gY3R4LmN1cnJlbnRNb2RlID8gZ2V0QWdlbnRIb3N0TW9kZUljb24oY3R4LmN1cnJlbnRNb2RlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAobW9kZUljb24pIHtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24obW9kZUljb24pKTtcblx0XHR9XG5cblx0XHQvLyBMYWJlbDogdGhlIGN1cnJlbnQgbW9kZWwgbmFtZSAob3IgXCJBdXRvXCIgcGxhY2Vob2xkZXIgd2hlbiBub1xuXHRcdC8vIG1vZGVsIGlzIGF2YWlsYWJsZSkuIE1vZGUgaXMgc3VyZmFjZWQgdmlhIHRoZSBpY29uLCBub3Rcblx0XHQvLyBkdXBsaWNhdGVkIGluIHRoZSBsYWJlbCwgdG8ga2VlcCB0aGUgYnV0dG9uIGNvbXBhY3QuXG5cdFx0Y29uc3QgY3VycmVudE1vZGVsID0gY3R4LmN1cnJlbnRNb2RlbElkXG5cdFx0XHQ/IGN0eC5tb2RlbEl0ZW1zLmZpbmQobSA9PiBtLmlkZW50aWZpZXIgPT09IGN0eC5jdXJyZW50TW9kZWxJZClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChjdXJyZW50TW9kZWwpIHtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oZ2V0TW9kZWxQcm92aWRlckljb24oY3VycmVudE1vZGVsKSkpO1xuXHRcdH1cblx0XHRjb25zdCBsYWJlbFRleHQgPSBjdXJyZW50TW9kZWw/Lm1ldGFkYXRhLm5hbWVcblx0XHRcdD8/IChjdHguc2hvd0F1dG9Nb2RlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXIuYXV0b0xhYmVsJywgXCJBdXRvXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlci5ub01vZGVsc0xhYmVsJywgXCJObyBtb2RlbHMgYXZhaWxhYmxlXCIpKTtcblx0XHRjb25zdCBsYWJlbFNwYW4gPSBkb20uYXBwZW5kKHRoaXMuX3RyaWdnZXJFbGVtZW50LCBkb20uJCgnc3Bhbi5jaGF0LWlucHV0LXBpY2tlci1sYWJlbCcpKTtcblx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBsYWJlbFRleHQ7XG5cblx0XHRjb25zdCBhcmlhUGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKGN0eC5jdXJyZW50TW9kZSkge1xuXHRcdFx0Y29uc3QgbW9kZUl0ZW0gPSBjdHgubW9kZUl0ZW1zLmZpbmQoaSA9PiBpLnZhbHVlID09PSBjdHguY3VycmVudE1vZGUpO1xuXHRcdFx0aWYgKG1vZGVJdGVtKSB7XG5cdFx0XHRcdGFyaWFQYXJ0cy5wdXNoKG1vZGVJdGVtLmxhYmVsKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXJpYVBhcnRzLnB1c2gobGFiZWxUZXh0KTtcblx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudC5hcmlhTGFiZWwgPSBsb2NhbGl6ZShcblx0XHRcdCdtb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXIudHJpZ2dlckFyaWFMYWJlbCcsXG5cdFx0XHRcIlBpY2sgTW9kZSBhbmQgTW9kZWwsIHswfVwiLFxuXHRcdFx0YXJpYVBhcnRzLmpvaW4oJywgJyksXG5cdFx0KTtcblxuXHRcdC8vIFNoZWV0J3MgbW9kZSByb3cgd3JpdGVzIHRocm91Z2ggYHNldFNlc3Npb25Db25maWdWYWx1ZWAsIHNvXG5cdFx0Ly8gZGlzYWJsZSB0aGUgYnV0dG9uIHdoaWxlIGEgcmVzb2x2ZSBpcyBpbiBmbGlnaHQuXG5cdFx0Y29uc3QgaXNSZXNvbHZpbmcgPSBjdHgucHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKGN0eC5zZXNzaW9uLnNlc3Npb25JZCkuZ2V0KCk7XG5cdFx0dGhpcy5fc2xvdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgncmVzb2x2aW5nJywgaXNSZXNvbHZpbmcpO1xuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIGlzUmVzb2x2aW5nID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdH1cblxuXHRwcml2YXRlIF9zd2l0Y2hUb01vZGVsKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbGVjdGlvbk1vZGVsLnNlbGVjdE1vZGVsKG1vZGVsSWRlbnRpZmllcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93U2hlZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl90cmlnZ2VyRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTaGVldCdzIG1vZGUgcm93IHdyaXRlcyB0aHJvdWdoIGBzZXRTZXNzaW9uQ29uZmlnVmFsdWVgOyB0aGVcblx0XHQvLyBidXR0b24gcmV0YWlucyBpdHMgdGFwIHRhcmdldCB3aGlsZSB2aXN1YWxseSBkaXNhYmxlZCwgc29cblx0XHQvLyBndWFyZCBleHBsaWNpdGx5LlxuXHRcdGNvbnN0IGN0eCA9IHRoaXMuX2dldENvbnRleHQoKTtcblx0XHRpZiAoY3R4ICYmIGN0eC5wcm92aWRlci5pc1Nlc3Npb25Db25maWdSZXNvbHZpbmcoY3R4LnNlc3Npb24uc2Vzc2lvbklkKS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBEZWxlZ2F0ZSBzaGVldCBjb25zdHJ1Y3Rpb24gdG8gdGhlIHNoYXJlZCBwaG9uZSBwcmVzZW50ZXIgc29cblx0XHQvLyB0aGUgbmV3LXNlc3Npb24gYW5kIG9wZW5lZC1jaGF0IGJ1dHRvbnMgcmVuZGVyIHRoZSBleGFjdFxuXHRcdC8vIHNhbWUgTW9kZSArIE1vZGVsIHJvd3MuIFRoZSBwcmVzZW50ZXIncyBhZ2VudC1ob3N0IGJyYW5jaFxuXHRcdC8vIHJlYWRzIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHByb3ZpZGVyLW93bmVkIGNvbmZpZyBhbmQgbW9kZWxzLlxuXHRcdGNvbnN0IHRyaWdnZXIgPSB0aGlzLl90cmlnZ2VyRWxlbWVudDtcblx0XHRjb25zdCBiZWZvcmVDdHggPSBjdHg7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gY3JlYXRlQ2hhdFBob25lSW5wdXRUYXJnZXQoY3JlYXRlQ2hhdFBob25lSW5wdXRTZXNzaW9uQ29udGV4dChiZWZvcmVDdHg/LnNlc3Npb24pLCB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdGNvbnN0IGJlZm9yZU1vZGUgPSBiZWZvcmVDdHg/LmN1cnJlbnRNb2RlO1xuXHRcdGNvbnN0IGJlZm9yZU1vZGVJdGVtID0gYmVmb3JlQ3R4Py5tb2RlSXRlbXMuZmluZChpID0+IGkudmFsdWUgPT09IGJlZm9yZU1vZGUpO1xuXHRcdGNvbnN0IGJlZm9yZU1vZGVsSWQgPSBiZWZvcmVDdHg/LmN1cnJlbnRNb2RlbElkO1xuXHRcdGNvbnN0IGJlZm9yZU1vZGVsID0gYmVmb3JlTW9kZWxJZCA/IGJlZm9yZUN0eD8ubW9kZWxJdGVtcy5maW5kKG0gPT4gbS5pZGVudGlmaWVyID09PSBiZWZvcmVNb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Bob25lUHJlc2VudGVyLnNob3dDb21iaW5lZE1vZGVBbmRNb2RlbFNoZWV0KHRyaWdnZXIsIHtcblx0XHRcdFx0a2luZDogJ3Nlc3Npb24nLFxuXHRcdFx0XHRnZXRTZXNzaW9uQ29udGV4dDogKCkgPT4gY3JlYXRlQ2hhdFBob25lSW5wdXRTZXNzaW9uQ29udGV4dCh0aGlzLl9zZXNzaW9uLmdldCgpKSxcblx0XHRcdFx0c2VsZWN0TW9kZWw6IG1vZGVsSWRlbnRpZmllciA9PiB0aGlzLl9zd2l0Y2hUb01vZGVsKG1vZGVsSWRlbnRpZmllciksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFmdGVyQ3R4ID0gdGhpcy5fZ2V0Q29udGV4dCgpO1xuXHRcdFx0aWYgKGJlZm9yZUN0eCAmJiBhZnRlckN0eCAmJiBtYXRjaGVzQ2hhdFBob25lSW5wdXRUYXJnZXQodGFyZ2V0LCBjcmVhdGVDaGF0UGhvbmVJbnB1dFNlc3Npb25Db250ZXh0KGFmdGVyQ3R4LnNlc3Npb24pLCB0aGlzLl91cmlJZGVudGl0eVNlcnZpY2UpKSB7XG5cdFx0XHRcdGlmIChiZWZvcmVDdHgubW9kZUl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBhZnRlck1vZGUgPSBhZnRlckN0eC5jdXJyZW50TW9kZTtcblx0XHRcdFx0XHRjb25zdCBhZnRlck1vZGVJdGVtID0gYWZ0ZXJDdHgubW9kZUl0ZW1zLmZpbmQoaSA9PiBpLnZhbHVlID09PSBhZnRlck1vZGUpO1xuXHRcdFx0XHRcdHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0XHRcdFx0aWQ6ICdOZXdDaGF0TW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyJyxcblx0XHRcdFx0XHRcdG5hbWU6ICdOZXdDaGF0TW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyLm1vZGUnLFxuXHRcdFx0XHRcdFx0b3B0aW9uSWRCZWZvcmU6IGJlZm9yZU1vZGUsXG5cdFx0XHRcdFx0XHRvcHRpb25JZEFmdGVyOiBhZnRlck1vZGUsXG5cdFx0XHRcdFx0XHRvcHRpb25MYWJlbEJlZm9yZTogYmVmb3JlTW9kZUl0ZW0/LmxhYmVsID8/IGJlZm9yZU1vZGUsXG5cdFx0XHRcdFx0XHRvcHRpb25MYWJlbEFmdGVyOiBhZnRlck1vZGVJdGVtPy5sYWJlbCA/PyBhZnRlck1vZGUsXG5cdFx0XHRcdFx0XHRpc1BJSTogZmFsc2UsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGJlZm9yZUN0eC5tb2RlbEl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBhZnRlck1vZGVsSWQgPSBhZnRlckN0eC5jdXJyZW50TW9kZWxJZDtcblx0XHRcdFx0XHRjb25zdCBhZnRlck1vZGVsID0gYWZ0ZXJNb2RlbElkID8gYWZ0ZXJDdHgubW9kZWxJdGVtcy5maW5kKG0gPT4gbS5pZGVudGlmaWVyID09PSBhZnRlck1vZGVsSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJlcG9ydE5ld0NoYXRQaWNrZXJDbG9zZWQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0XHRcdFx0aWQ6ICdOZXdDaGF0TW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyJyxcblx0XHRcdFx0XHRcdG5hbWU6ICdOZXdDaGF0TW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyLm1vZGVsJyxcblx0XHRcdFx0XHRcdG9wdGlvbklkQmVmb3JlOiBiZWZvcmVNb2RlbElkLFxuXHRcdFx0XHRcdFx0b3B0aW9uSWRBZnRlcjogYWZ0ZXJNb2RlbElkLFxuXHRcdFx0XHRcdFx0b3B0aW9uTGFiZWxCZWZvcmU6IGJlZm9yZU1vZGVsPy5tZXRhZGF0YS5uYW1lLFxuXHRcdFx0XHRcdFx0b3B0aW9uTGFiZWxBZnRlcjogYWZ0ZXJNb2RlbD8ubWV0YWRhdGEubmFtZSxcblx0XHRcdFx0XHRcdGlzUElJOiBmYWxzZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cmlnZ2VyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0dHJpZ2dlci5mb2N1cygpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIEFjdGlvbiB3cmFwcGVyIGZvciB0aGUgbW9iaWxlIGNoYXQtaW5wdXQgY29uZmlnIHBpY2tlci4gSGFzIG5vIGYxXG4gKiBzdXJmYWNlIGFuZCBpcyBnYXRlZCBvbiBwaG9uZSBsYXlvdXQgKyBhbiBhY3RpdmUgYWdlbnQtaG9zdCBzZXNzaW9uLlxuICogT3JkZXIgbWF0Y2hlcyB0aGUgZXhpc3RpbmcgZGVza3RvcCBtb2RlIHBpY2tlciAoMCkgc28gdGhlIGJ1dHRvbiBsYW5kc1xuICogaW4gdGhlIHNhbWUgdG9vbGJhciBzbG90LlxuICovXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE1PQklMRV9DSEFUX0lOUFVUX0NPTkZJR19QSUNLRVJfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXInLCBcIk1vZGUgYW5kIE1vZGVsXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVzLk5ld1Nlc3Npb25Db25maWcsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoU2Vzc2lvblVzZXNDb21iaW5lZENvbmZpZ1BpY2tlckNvbnRleHQsIElzUGhvbmVMYXlvdXRDb250ZXh0KSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9XG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxufSk7XG5cbi8qKlxuICogV29ya2JlbmNoIGNvbnRyaWJ1dGlvbiB0aGF0IHdpcmVzIHRoZSB7QGxpbmsgTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyfVxuICogaW50byB0aGUgbmV3LXNlc3Npb24gY29uZmlnIHRvb2xiYXIuIFJlZ2lzdGVycyBhbiBhY3Rpb24gdmlldyBpdGVtXG4gKiBmYWN0b3J5IGZvciB0aGUgbW9iaWxlLW9ubHkgY29tbWFuZCBpZDsgdGhlIGFjdGlvbidzIGB3aGVuYCBjbGF1c2VcbiAqIChhYm92ZSkgZW5zdXJlcyB0aGUgcGlja2VyIGlzIG9ubHkgZGlzcGxheWVkIG9uIHBob25lIGxheW91dHMuIE9uXG4gKiBkZXNrdG9wLCB0aGUgZXhpc3RpbmcgbW9kZSBhbmQgc2Vzc2lvbnMtY29yZSBtb2RlbCBwaWNrZXIgcmVnaXN0cmF0aW9uc1xuICogcHJvdmlkZSB0aGUgdG9vbGJhciBpdGVtcyBhcyBiZWZvcmUuXG4gKi9cbmNsYXNzIE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMuY29udHJpYi5tb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2Ugc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFRoZSBhZ2VudCBob3N0IG93bnMgdGhlIFwiY29tYmluZWQgY29uZmlnIHBpY2tlclwiIGRlY2lzaW9uOiBvbiBwaG9uZVxuXHRcdC8vIGxheW91dHMgaXQgcmVwbGFjZXMgdGhlIHN0YW5kYWxvbmUgbW9kZSArIG1vZGVsIHBpY2tlcnMgd2l0aCBhIHNpbmdsZVxuXHRcdC8vIGJvdHRvbSBzaGVldC4gUHVibGlzaCB0aGlzIGFzIGEgbmV1dHJhbCBjb250ZXh0IGtleSBzbyB0aGUgY29yZSBtb2RlbFxuXHRcdC8vIHBpY2tlciBjYW4gZ2F0ZSBpdHNlbGYgb3V0IHdpdGhvdXQgZGVwZW5kaW5nIG9uIGFnZW50LWhvc3QgaWRlbnRpdHkuXG5cdFx0Y29uc3QgdXNlc0NvbWJpbmVkUGlja2VyID0gU2Vzc2lvblVzZXNDb21iaW5lZENvbmZpZ1BpY2tlckNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dXNlc0NvbWJpbmVkUGlja2VyLnNldCghIXNlc3Npb24gJiYgaXNBZ2VudEhvc3RQcm92aWRlcklkKHNlc3Npb24ucHJvdmlkZXJJZCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVzLk5ld1Nlc3Npb25Db25maWcsXG5cdFx0XHRNT0JJTEVfQ0hBVF9JTlBVVF9DT05GSUdfUElDS0VSX0lELFxuXHRcdFx0KF9hY3Rpb24sIF9vcHRpb25zLCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHNlc3Npb24gfSA9IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJU2Vzc2lvbkNvbnRleHQpKTtcblx0XHRcdFx0Y29uc3QgcGlja2VyID0gc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyLCBzZXNzaW9uKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBNb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXJBY3Rpb25WaWV3SXRlbShwaWNrZXIpO1xuXHRcdFx0fSxcblx0XHQpKTtcblx0fVxufVxuXG5jbGFzcyBNb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXJBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3BpY2tlcjogTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyKSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCB7IGlkOiAnJywgbGFiZWw6ICcnLCBlbmFibGVkOiB0cnVlLCBjbGFzczogdW5kZWZpbmVkLCB0b29sdGlwOiAnJywgcnVuOiAoKSA9PiB7IH0gfSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3BpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC1pbnB1dC1waWNrZXItaXRlbScpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9waWNrZXIuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTW9iaWxlQ2hhdElucHV0Q29uZmlnUGlja2VyQ29udHJpYnV0aW9uLklELCBNb2JpbGVDaGF0SW5wdXRDb25maWdQaWNrZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLGFBQWEsc0JBQXNCO0FBQ3JELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsWUFBWSxlQUFlLHVCQUF1QjtBQUMzRCxTQUFTLGVBQTRCO0FBQ3JDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBaUMsZ0NBQWdDLHNCQUFzQjtBQUV2RixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx3Q0FBd0MsNEJBQTRCO0FBQzdFLFNBQTBDLHFCQUFxQiw2QkFBNkI7QUFFNUYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFD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
