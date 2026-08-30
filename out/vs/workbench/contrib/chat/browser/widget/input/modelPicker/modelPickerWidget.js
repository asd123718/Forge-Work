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
import "./media/modelPicker.css";
import * as dom from "../../../../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../../../../base/browser/keyboardEvent.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { getBaseLayerHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegate2.js";
import { getDefaultHoverDelegate } from "../../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { KeyCode } from "../../../../../../../base/common/keyCodes.js";
import { AnchorPosition } from "../../../../../../../base/common/layout.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../../base/common/lifecycle.js";
import { disposableTimeout } from "../../../../../../../base/common/async.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { localize } from "../../../../../../../nls.js";
import { IActionWidgetService } from "../../../../../../../platform/actionWidget/browser/actionWidget.js";
import { AgentHostAllowSignedOutWhenUsableSettingId } from "../../../../../../../platform/agentHost/common/agentService.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IOpenerService } from "../../../../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../../platform/storage/common/storage.js";
import { TelemetryTrustedValue } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { ILanguageModelsService } from "../../../../common/languageModels.js";
import { IChatEntitlementService } from "../../../../../../services/chat/common/chatEntitlementService.js";
import { CHAT_SETUP_ACTION_ID } from "../../../actions/chatActions.js";
import { IUriIdentityService } from "../../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IUpdateService } from "../../../../../../../platform/update/common/update.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../../../../platform/workspace/common/workspaceTrust.js";
import { withChatInputPickerMotion } from "../chatInputPickerActionItem.js";
import { buildModelPickerItems, createManageModelsAction, getModelPickerAccessibilityProvider, getModelPickerControlModels, ModelPickerSection, shouldShowManageModelsAction } from "./modelPickerItems.js";
import { ModelPickerConfiguration } from "./modelPickerConfiguration.js";
import { getModelPickerIcon } from "./modelProviderIcons.js";
import { getModelPickerUnavailableReason, isAutoModel, ModelPickerUnavailableReason, modelPickerRequiresSetup, shouldShowCacheBreakHint as computeShouldShowCacheBreakHint } from "./modelPickerPresentation.js";
const CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY = "chat.cacheBreakHintDismissed";
let ModelPickerWidget = class extends Disposable {
  constructor(_delegate, _actionWidgetService, _commandService, _openerService, _telemetryService, _languageModelsService, _productService, _entitlementService, _updateService, _uriIdentityService, _defaultAccountService, _workspaceTrustManagementService, _workspaceTrustRequestService, _storageService, _configurationService, instantiationService) {
    super();
    this._delegate = _delegate;
    this._actionWidgetService = _actionWidgetService;
    this._commandService = _commandService;
    this._openerService = _openerService;
    this._telemetryService = _telemetryService;
    this._languageModelsService = _languageModelsService;
    this._productService = _productService;
    this._entitlementService = _entitlementService;
    this._updateService = _updateService;
    this._uriIdentityService = _uriIdentityService;
    this._defaultAccountService = _defaultAccountService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    this._workspaceTrustInitialized = false;
    this._activatingAfterTrust = false;
    this._activatingTimer = this._register(new MutableDisposable());
    this._pendingAuxiliaryRelayout = this._register(new MutableDisposable());
    this._activeShowDisposables = this._register(new MutableDisposable());
    this._showRequestId = 0;
    this._configuration = instantiationService.createInstance(ModelPickerConfiguration, {
      getSelectedModel: () => this._selectedModel,
      getConfigurationAccess: () => this._delegate.modelConfiguration ?? this._languageModelsService,
      isDisabled: () => !!this._domNode?.classList.contains("disabled"),
      shouldShowCacheBreakHint: () => this.shouldShowCacheBreakHint(
        /* excludeAutoModel */
        false
      ),
      getCacheBreakLearnMoreLink: () => this.getCacheBreakLearnMoreLink(),
      dismissCacheBreakHint: () => this.dismissCacheBreakHint(),
      onDidChangeVisibility: (visible) => this._delegate.onDidChangeVisibility?.(visible),
      getActionWidgetContainer: () => this._delegate.actionWidgetContainer,
      getActionWidgetAnchor: (anchor) => this._delegate.getActionWidgetAnchor?.(anchor) ?? anchor,
      getAnchorPosition: () => this._delegate.anchorPosition
    });
    this._register(this._languageModelsService.onDidChangeLanguageModels(() => {
      if (this._activatingAfterTrust && this._delegate.getModels().length > 0) {
        this._clearActivating();
      }
      this._renderLabel();
    }));
    this._register(this._workspaceTrustManagementService.onDidChangeTrust((trusted) => {
      if (trusted && this._delegate.getPresentationOptions().showAutoModel && this._delegate.getModels().length === 0) {
        this._activatingAfterTrust = true;
        this._activatingTimer.value = disposableTimeout(() => {
          this._activatingAfterTrust = false;
          this._renderLabel();
        }, 15e3);
      } else {
        this._clearActivating();
      }
      this._renderLabel();
    }));
    this._workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
      if (this._store.isDisposed) {
        return;
      }
      this._workspaceTrustInitialized = true;
      this._renderLabel();
    });
    this._register(this._entitlementService.onDidChangeUsageBasedBilling(() => {
      this._renderLabel();
    }));
    this._register(this._entitlementService.onDidChangeEntitlement(() => this._renderLabel()));
    this._register(this._entitlementService.onDidChangeSentiment(() => this._renderLabel()));
    this._register(this._entitlementService.onDidChangeAnonymous(() => this._renderLabel()));
    if (this._delegate.modelConfiguration?.onDidChange) {
      this._register(this._delegate.modelConfiguration.onDidChange(() => {
        this._renderLabel();
      }));
    }
  }
  get selectedModel() {
    return this._selectedModel;
  }
  get domNode() {
    return this._domNode;
  }
  get nameButton() {
    return this._nameButton;
  }
  setCompact(compact) {
    this._compact = compact;
    this._register(autorun((reader) => {
      const isCompact = compact.read(reader);
      if (this._domNode) {
        this._domNode.classList.toggle("compact", isCompact);
      }
      this._renderLabel();
    }));
  }
  setSelectedModel(model) {
    this._selectedModel = model;
    this._renderLabel();
  }
  setEnabled(enabled) {
    if (this._domNode) {
      this._domNode.classList.toggle("disabled", !enabled);
      this._domNode.setAttribute("aria-disabled", String(!enabled));
    }
  }
  setBadge(badge) {
    this._badge = badge;
    this._updateBadge();
  }
  /**
   * Why the picker currently has no model to offer (untrusted vs. needs
   * sign-in/setup), or `undefined` when a model is available. See
   * {@link getModelPickerUnavailableReason}.
   */
  _unavailableReason() {
    return getModelPickerUnavailableReason({
      trustInitialized: this._workspaceTrustInitialized,
      trusted: this._workspaceTrustManagementService.isWorkspaceTrusted(),
      pickerModels: this._delegate.getModels(),
      liveModelIds: this._languageModelsService.getLanguageModelIds(),
      requiresSetup: this._requiresSetup()
    });
  }
  _requiresSetup() {
    return modelPickerRequiresSetup({
      entitlement: this._entitlementService.entitlement,
      anonymous: this._entitlementService.anonymous,
      hasByokModels: this._entitlementService.hasByokModels
    });
  }
  /**
   * Whether the picker has no usable model specifically because the workspace
   * is untrusted (Restricted Mode disables the chat model providers).
   */
  isRestrictedMode() {
    return this._unavailableReason() === ModelPickerUnavailableReason.Restricted;
  }
  /**
   * Whether the picker has no usable model because Chat still needs sign-in /
   * setup (and the workspace is trusted, so it is not Restricted Mode). BYOK
   * and anonymous access never report this state.
   */
  isSetupRequired() {
    return this._unavailableReason() === ModelPickerUnavailableReason.SetupRequired;
  }
  _clearActivating() {
    this._activatingAfterTrust = false;
    this._activatingTimer.clear();
  }
  /**
   * Prompts the user to trust the workspace. On grant, providers register their
   * models and `onDidChangeLanguageModels` refreshes the picker.
   */
  async _requestWorkspaceTrust() {
    await this._workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("chat.modelPicker.trustMessage", "Trusting this workspace enables AI models and chat features.")
    });
  }
  /**
   * Starts the Chat setup / sign-in flow (same command as the title-bar Sign In
   * affordance). On completion the entitlement and model registry change, which
   * refreshes the picker.
   */
  _requestSetup() {
    this._commandService.executeCommand(CHAT_SETUP_ACTION_ID);
  }
  render(container) {
    this._domNode = dom.append(container, dom.$("div.action-label.model-picker-split"));
    this._domNode.setAttribute("role", "group");
    this._domNode.tabIndex = -1;
    if (this._compact?.get()) {
      this._domNode.classList.toggle("compact", true);
    }
    this._nameButton = dom.append(this._domNode, dom.$("a.model-picker-section.model-picker-name"));
    this._nameButton.tabIndex = 0;
    this._nameButton.setAttribute("role", "button");
    this._nameButton.setAttribute("aria-haspopup", "true");
    this._nameButton.setAttribute("aria-expanded", "false");
    this._configButton = dom.append(this._domNode, dom.$("a.model-picker-section.model-picker-config"));
    this._configButton.tabIndex = 0;
    this._configButton.setAttribute("role", "button");
    this._configButton.setAttribute("aria-haspopup", "true");
    this._configButton.setAttribute("aria-expanded", "false");
    this._configButton.style.display = "none";
    this._badgeIcon = dom.$("span.model-picker-badge");
    this._updateBadge();
    this._renderLabel();
    this._registerButtonAction(this._nameButton, () => this.show());
    this._registerButtonAction(this._configButton, () => this._configuration.show(this._configButton));
    this._register(getBaseLayerHoverDelegate().setupManagedHover(
      getDefaultHoverDelegate("mouse"),
      this._configButton,
      localize("chat.modelPicker.configTooltip", "Configure Model")
    ));
  }
  /**
   * Registers mouse-down and Enter/Space key handlers on a button element.
   */
  _registerButtonAction(element, action) {
    let expandedOnMouseDown = false;
    if (this._delegate.openOnMouseUp) {
      this._register(dom.addDisposableGenericMouseDownListener(element, (e) => {
        if (e.button === 0) {
          expandedOnMouseDown = element.getAttribute("aria-expanded") === "true";
        }
      }));
    }
    const runAction = (e) => {
      if (e.button !== 0) {
        return;
      }
      dom.EventHelper.stop(e, true);
      if (this._delegate.openOnMouseUp && expandedOnMouseDown && element.getAttribute("aria-expanded") !== "true") {
        expandedOnMouseDown = false;
        return;
      }
      expandedOnMouseDown = false;
      action();
    };
    this._register(this._delegate.openOnMouseUp ? dom.addDisposableGenericMouseUpListener(element, runAction) : dom.addDisposableGenericMouseDownListener(element, runAction));
    this._register(dom.addDisposableListener(element, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e, true);
        action();
      }
    }));
  }
  /** The "Learn more" header link for cache-break hints; `undefined` when the product has no URL. */
  getCacheBreakLearnMoreLink() {
    const url = this._productService.defaultChatAgent?.optimizeUsageDocumentationUrl;
    return url ? { label: localize("chat.cacheBreak.learnMore", "Learn more"), uri: URI.parse(url) } : void 0;
  }
  isCacheBreakHintDismissed() {
    return this._storageService.getBoolean(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, StorageScope.APPLICATION, false);
  }
  dismissCacheBreakHint() {
    this._storageService.store(CACHE_BREAK_HINT_DISMISSED_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
  }
  /**
   * The picker's current availability, derived once so the label states and the "nothing to switch
   * to" hint suppression (#325185) cannot disagree.
   */
  _availability() {
    const reason = this._unavailableReason();
    const empty = this._delegate.getModels().length === 0;
    const activating = reason === void 0 && empty && this._activatingAfterTrust;
    const genericNoModels = reason === void 0 && !activating && empty && !this._delegate.getPresentationOptions().showAutoModel;
    return { reason, activating, genericNoModels, noModels: reason !== void 0 || activating || genericNoModels };
  }
  /** Thin wrapper over {@link computeShouldShowCacheBreakHint} that supplies this picker's live state. */
  shouldShowCacheBreakHint(excludeAutoModel) {
    return computeShouldShowCacheBreakHint({
      dismissed: this.isCacheBreakHintDismissed(),
      cacheWarm: this._delegate.isCacheWarm?.() ?? false,
      noModelsAvailable: this._availability().noModels,
      excludeAutoModel,
      selectedModelIsAuto: !!this._selectedModel && isAutoModel(this._selectedModel)
    });
  }
  show(anchor) {
    const anchorElement = anchor ?? this._domNode;
    if (!anchorElement || this._domNode?.classList.contains("disabled")) {
      return;
    }
    if (this._nameButton?.getAttribute("aria-expanded") === "true") {
      this._showRequestId++;
      this._activeShowDisposables.clear();
      this._nameButton.setAttribute("aria-expanded", "false");
      const visibilityChange2 = this._delegate.onDidChangeVisibility?.(false);
      if (visibilityChange2) {
        void visibilityChange2.catch(() => {
        });
      }
      this._actionWidgetService.hide(true);
      return;
    }
    const previousModel = this._selectedModel;
    const onSelect = (model) => {
      this._telemetryService.publicLog2("chat.modelChange", {
        fromModel: previousModel?.metadata.vendor === "copilot" ? new TelemetryTrustedValue(previousModel.identifier) : "unknown",
        toModel: model.metadata.vendor === "copilot" ? new TelemetryTrustedValue(model.identifier) : "unknown",
        chatSessionId: this._delegate.getChatSessionId?.()
      });
      this._selectedModel = model;
      this._renderLabel();
      this._onDidChangeSelection.fire(model);
    };
    const onConfigure = (model, group) => {
      onSelect(model);
      this._actionWidgetService.hide();
      this._configuration.show(this._configButton, group);
    };
    const models = this._delegate.getModels();
    const presentation = this._delegate.getPresentationOptions();
    const manifest = this._languageModelsService.getModelsControlManifest();
    const controlModelsForTier = getModelPickerControlModels(manifest, this._entitlementService.entitlement, models);
    const canShowManageModelsAction = presentation.showManageModelsAction && shouldShowManageModelsAction(this._entitlementService);
    const manageModelsAction = canShowManageModelsAction ? createManageModelsAction(this._commandService) : void 0;
    const logModelPickerInteraction = (interaction) => {
      this._telemetryService.publicLog2("chat.modelPickerInteraction", { interaction });
    };
    const manageSettingsUrl = this._defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings);
    const onTogglePin = (modelIdentifier, pinned) => {
      if (pinned) {
        this._languageModelsService.pinModel(modelIdentifier);
      } else {
        this._languageModelsService.unpinModel(modelIdentifier);
      }
      this._actionWidgetService.hide();
      this.show(anchorElement);
    };
    const items = buildModelPickerItems({
      models,
      selectedModelId: this._selectedModel?.identifier,
      recentModelIds: this._languageModelsService.getRecentlyUsedModelIds().filter((id) => !this._languageModelsService.isModelHidden(id)),
      pinnedModelIds: this._languageModelsService.getPinnedModelIds().filter((id) => !this._languageModelsService.isModelHidden(id)),
      controlModels: controlModelsForTier,
      currentVSCodeVersion: this._productService.version,
      updateStateType: this._updateService.state.type,
      manageSettingsUrl,
      manageModelsAction,
      chatEntitlementService: this._entitlementService,
      languageModelsService: this._languageModelsService,
      openerService: this._openerService,
      presentation: {
        ...presentation,
        restrictedMode: this.isRestrictedMode(),
        setupRequired: this.isSetupRequired(),
        showManageModelsInSetupRequired: this._configurationService.getValue(AgentHostAllowSignedOutWhenUsableSettingId) === true,
        isUBB: !!this._entitlementService.quotas.usageBasedBilling
      },
      actions: {
        onSelect,
        onTogglePin,
        onConfigure,
        onRequestTrust: () => {
          void this._requestWorkspaceTrust();
        },
        onRequestSetup: () => {
          this._requestSetup();
        }
      }
    });
    const hoverDisposables = new DisposableStore();
    const showDisposables = new DisposableStore();
    showDisposables.add(hoverDisposables);
    this._activeShowDisposables.value = showDisposables;
    for (const item of items) {
      if (item.hover?.disposable) {
        hoverDisposables.add(item.hover.disposable);
      }
    }
    const unavailable = this.isRestrictedMode() || this.isSetupRequired();
    const showCacheBreakHint = this.shouldShowCacheBreakHint(
      /* excludeAutoModel */
      true
    );
    const listOptions = withChatInputPickerMotion({
      className: "chat-model-picker-dropdown",
      headerText: showCacheBreakHint ? localize("chat.modelPicker.cacheBreakHint", "Switching models mid-session resets the prompt cache and may increase cost.") : void 0,
      headerIcon: showCacheBreakHint ? Codicon.info : void 0,
      headerLink: showCacheBreakHint ? this.getCacheBreakLearnMoreLink() : void 0,
      headerDismiss: showCacheBreakHint ? () => this.dismissCacheBreakHint() : void 0,
      showFilter: !unavailable,
      filterPlaceholder: localize("chat.modelPicker.search", "Search models"),
      focusFilterOnOpen: true,
      collapsedByDefault: /* @__PURE__ */ new Set([ModelPickerSection.Other]),
      onDidToggleSection: (section, collapsed) => {
        if (section === ModelPickerSection.Other) {
          logModelPickerInteraction(collapsed ? "otherModelsCollapsed" : "otherModelsExpanded");
        }
      },
      linkHandler: (uri) => {
        if (uri.scheme === "command" && uri.path === "workbench.action.chat.upgradePlan") {
          logModelPickerInteraction("premiumModelUpgradePlanClicked");
        } else if (manageSettingsUrl && this._uriIdentityService.extUri.isEqual(uri, URI.parse(manageSettingsUrl))) {
          logModelPickerInteraction("disabledModelContactAdminClicked");
        }
        void this._openerService.open(uri, { allowCommands: true });
      },
      minWidth: 200,
      anchorPosition: this._delegate.anchorPosition ?? AnchorPosition.ABOVE
    });
    const previouslyFocusedElement = dom.getActiveElement();
    const delegate = {
      onSelect: (action) => {
        this._actionWidgetService.hide();
        action.run();
      },
      onHide: () => {
        this._showRequestId++;
        if (this._activeShowDisposables.value === showDisposables) {
          this._activeShowDisposables.clear();
        } else {
          showDisposables.dispose();
        }
        this._nameButton?.setAttribute("aria-expanded", "false");
        const visibilityChange2 = this._delegate.onDidChangeVisibility?.(false);
        if (visibilityChange2) {
          void visibilityChange2.catch(() => {
          });
        }
        if (dom.isHTMLElement(previouslyFocusedElement)) {
          previouslyFocusedElement.focus();
        }
      }
    };
    this._nameButton?.setAttribute("aria-expanded", "true");
    const showRequestId = ++this._showRequestId;
    const showActionWidget = () => {
      if (showRequestId !== this._showRequestId || this._nameButton?.getAttribute("aria-expanded") !== "true") {
        if (this._activeShowDisposables.value === showDisposables) {
          this._activeShowDisposables.clear();
        }
        return;
      }
      this._actionWidgetService.show(
        "ChatModelPicker",
        false,
        items,
        delegate,
        this._delegate.getActionWidgetAnchor?.(anchorElement) ?? anchorElement,
        this._delegate.actionWidgetContainer,
        [],
        getModelPickerAccessibilityProvider(),
        listOptions
      );
      if (this._delegate.onDidChangeVisibility) {
        this._pendingAuxiliaryRelayout.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(anchorElement), () => {
          this._actionWidgetService.updateItems(items);
        });
      }
    };
    const visibilityChange = this._delegate.onDidChangeVisibility?.(true);
    if (visibilityChange) {
      void visibilityChange.then(showActionWidget, () => {
        if (showRequestId !== this._showRequestId) {
          return;
        }
        this._showRequestId++;
        if (this._activeShowDisposables.value === showDisposables) {
          this._activeShowDisposables.clear();
        }
        this._nameButton?.setAttribute("aria-expanded", "false");
        const hideVisibilityChange = this._delegate.onDidChangeVisibility?.(false);
        if (hideVisibilityChange) {
          void hideVisibilityChange.catch(() => {
          });
        }
        if (dom.isHTMLElement(previouslyFocusedElement)) {
          previouslyFocusedElement.focus();
        }
      });
    } else {
      showActionWidget();
    }
  }
  dispose() {
    this._showRequestId++;
    this._activeShowDisposables.clear();
    this._configuration.dispose();
    if (this._nameButton?.getAttribute("aria-expanded") === "true") {
      this._actionWidgetService.hide(true);
    }
    super.dispose();
  }
  _updateBadge() {
    if (this._badgeIcon) {
      if (this._badge) {
        const icon = this._badge === "info" ? Codicon.info : Codicon.warning;
        dom.reset(this._badgeIcon, renderIcon(icon));
        this._badgeIcon.style.display = "";
        this._badgeIcon.classList.toggle("info", this._badge === "info");
        this._badgeIcon.classList.toggle("warning", this._badge === "warning");
      } else {
        this._badgeIcon.style.display = "none";
      }
    }
  }
  _renderLabel() {
    if (!this._domNode || !this._nameButton) {
      return;
    }
    const { name } = this._selectedModel?.metadata || {};
    const { reason, activating, genericNoModels, noModels: noModelsAvailable } = this._availability();
    const restrictedMode = reason === ModelPickerUnavailableReason.Restricted;
    const setupRequired = reason === ModelPickerUnavailableReason.SetupRequired;
    const unavailable = reason !== void 0;
    const nameChildren = [];
    const modelIcon = this._selectedModel ? this._selectedModel.metadata.statusIcon ?? (this._delegate.getPresentationOptions().showModelIcon ? getModelPickerIcon(this._selectedModel) : void 0) : void 0;
    const compact = this._compact?.get() ?? false;
    if (modelIcon && !noModelsAvailable) {
      nameChildren.push(renderIcon(modelIcon));
    }
    const modelLabel = unavailable ? localize("chat.modelPicker.modelsLabel", "Models") : activating ? localize("chat.modelPicker.activating", "Activating...") : genericNoModels ? localize("chat.modelPicker.noModels", "No models available") : name ?? localize("chat.modelPicker.auto", "Auto");
    if (!compact || !modelIcon || noModelsAvailable) {
      nameChildren.push(dom.$("span.chat-input-picker-label", void 0, modelLabel));
    }
    if (this._badgeIcon) {
      nameChildren.push(this._badgeIcon);
    }
    dom.reset(this._nameButton, ...nameChildren);
    if (this._configButton) {
      this._configuration.renderButton(this._configButton, compact, noModelsAvailable);
    }
    const ariaLabel = restrictedMode ? localize("chat.modelPicker.ariaLabelRestricted", "Models, unavailable while in Restricted mode") : setupRequired ? localize("chat.modelPicker.ariaLabelSetupRequired", "Models, sign in to use Copilot") : localize("chat.modelPicker.ariaLabel", "Models, {0}", modelLabel);
    this._domNode.ariaLabel = ariaLabel;
    this._nameButton.ariaLabel = ariaLabel;
  }
};
ModelPickerWidget = __decorateClass([
  __decorateParam(1, IActionWidgetService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, ILanguageModelsService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IChatEntitlementService),
  __decorateParam(8, IUpdateService),
  __decorateParam(9, IUriIdentityService),
  __decorateParam(10, IDefaultAccountService),
  __decorateParam(11, IWorkspaceTrustManagementService),
  __decorateParam(12, IWorkspaceTrustRequestService),
  __decorateParam(13, IStorageService),
  __decorateParam(14, IConfigurationService),
  __decorateParam(15, IInstantiationService)
], ModelPickerWidget);
export {
  ModelPickerWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVsUGlja2VyXFxtb2RlbFBpY2tlcldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9tb2RlbFBpY2tlci5jc3MnO1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZTIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQW5jaG9yUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbkxpc3RIZWFkZXJMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uTGlzdC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udHJvbEVudHJ5LCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFBpY2tlckRlbGVnYXRlIH0gZnJvbSAnLi9tb2RlbFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgQ0hBVF9TRVRVUF9BQ1RJT05fSUQgfSBmcm9tICcuLi8uLi8uLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgR2l0SHViUGF0aHMsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgd2l0aENoYXRJbnB1dFBpY2tlck1vdGlvbiB9IGZyb20gJy4uL2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgYnVpbGRNb2RlbFBpY2tlckl0ZW1zLCBjcmVhdGVNYW5hZ2VNb2RlbHNBY3Rpb24sIGdldE1vZGVsUGlja2VyQWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBnZXRNb2RlbFBpY2tlckNvbnRyb2xNb2RlbHMsIE1vZGVsUGlja2VyU2VjdGlvbiwgc2hvdWxkU2hvd01hbmFnZU1vZGVsc0FjdGlvbiB9IGZyb20gJy4vbW9kZWxQaWNrZXJJdGVtcy5qcyc7XG5pbXBvcnQgeyBNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuL21vZGVsUGlja2VyQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRNb2RlbFBpY2tlckljb24gfSBmcm9tICcuL21vZGVsUHJvdmlkZXJJY29ucy5qcyc7XG5pbXBvcnQgeyBnZXRNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29uLCBpc0F1dG9Nb2RlbCwgTW9kZWxQaWNrZXJVbmF2YWlsYWJsZVJlYXNvbiwgbW9kZWxQaWNrZXJSZXF1aXJlc1NldHVwLCBzaG91bGRTaG93Q2FjaGVCcmVha0hpbnQgYXMgY29tcHV0ZVNob3VsZFNob3dDYWNoZUJyZWFrSGludCB9IGZyb20gJy4vbW9kZWxQaWNrZXJQcmVzZW50YXRpb24uanMnO1xuXG5jb25zdCBDQUNIRV9CUkVBS19ISU5UX0RJU01JU1NFRF9TVE9SQUdFX0tFWSA9ICdjaGF0LmNhY2hlQnJlYWtIaW50RGlzbWlzc2VkJztcbnR5cGUgQ2hhdE1vZGVsQ2hhbmdlQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnbHJhbW9zMTUnO1xuXHRjb21tZW50OiAnUmVwb3J0aW5nIHdoZW4gdGhlIG1vZGVsIHBpY2tlciBpcyBzd2l0Y2hlZCc7XG5cdGZyb21Nb2RlbD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgcHJldmlvdXMgY2hhdCBtb2RlbCcgfTtcblx0dG9Nb2RlbDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBuZXcgY2hhdCBtb2RlbCcgfTtcblx0Y2hhdFNlc3Npb25JZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWQgb2YgdGhlIGN1cnJlbnQgY2hhdCBzZXNzaW9uLCB1c2VkIHRvIGNvcnJlbGF0ZSB0aGUgbW9kZWwgc3dpdGNoIHdpdGggdGhlIHNlc3Npb24uJyB9O1xufTtcblxudHlwZSBDaGF0TW9kZWxDaGFuZ2VFdmVudCA9IHtcblx0ZnJvbU1vZGVsOiBzdHJpbmcgfCBUZWxlbWV0cnlUcnVzdGVkVmFsdWU8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0dG9Nb2RlbDogc3RyaW5nIHwgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlPHN0cmluZz47XG5cdGNoYXRTZXNzaW9uSWQ/OiBzdHJpbmc7XG59O1xuXG50eXBlIENoYXRNb2RlbFBpY2tlckludGVyYWN0aW9uID0gJ2Rpc2FibGVkTW9kZWxDb250YWN0QWRtaW5DbGlja2VkJyB8ICdwcmVtaXVtTW9kZWxVcGdyYWRlUGxhbkNsaWNrZWQnIHwgJ290aGVyTW9kZWxzRXhwYW5kZWQnIHwgJ290aGVyTW9kZWxzQ29sbGFwc2VkJztcblxudHlwZSBDaGF0TW9kZWxQaWNrZXJJbnRlcmFjdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3NhbmR5MDgxJztcblx0Y29tbWVudDogJ1JlcG9ydGluZyBpbnRlcmFjdGlvbnMgaW4gdGhlIGNoYXQgbW9kZWwgcGlja2VyJztcblx0aW50ZXJhY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbW9kZWwgcGlja2VyIGludGVyYWN0aW9uIHRoYXQgb2NjdXJyZWQnIH07XG59O1xuXG50eXBlIENoYXRNb2RlbFBpY2tlckludGVyYWN0aW9uRXZlbnQgPSB7XG5cdGludGVyYWN0aW9uOiBDaGF0TW9kZWxQaWNrZXJJbnRlcmFjdGlvbjtcbn07XG5cbnR5cGUgTW9kZWxQaWNrZXJCYWRnZSA9ICdpbmZvJyB8ICd3YXJuaW5nJztcblxuLyoqIFdoeSB0aGUgcGlja2VyIGhhcyBubyBtb2RlbCB0byBvZmZlciwgYW5kIHRoZSBsYWJlbCBzdGF0ZXMgdGhhdCBmb2xsb3cgZnJvbSBpdC4gKi9cbmludGVyZmFjZSBJTW9kZWxQaWNrZXJBdmFpbGFiaWxpdHkge1xuXHQvKiogVW50cnVzdGVkIHdvcmtzcGFjZSBvciBzaWduLWluIC8gc2V0dXAgcmVxdWlyZWQsIG9yIGB1bmRlZmluZWRgIHdoZW4gYSBtb2RlbCBpcyBhdmFpbGFibGUuICovXG5cdHJlYWRvbmx5IHJlYXNvbjogTW9kZWxQaWNrZXJVbmF2YWlsYWJsZVJlYXNvbiB8IHVuZGVmaW5lZDtcblx0LyoqIFRydXN0ZWQsIGJ1dCBtb2RlbHMgYXJlIHN0aWxsIGxvYWRpbmcgd2hpbGUgdGhlIGNoYXQgZXh0ZW5zaW9uIGFjdGl2YXRlcy4gKi9cblx0cmVhZG9ubHkgYWN0aXZhdGluZzogYm9vbGVhbjtcblx0LyoqIFRydXN0ZWQgYW5kIHNldCB1cCwgYnV0IHRoZSBsaXN0IGlzIGVtcHR5IGFuZCB0aGVyZSBpcyBubyBBdXRvIGZhbGxiYWNrLiAqL1xuXHRyZWFkb25seSBnZW5lcmljTm9Nb2RlbHM6IGJvb2xlYW47XG5cdC8qKiBBbnkgb2YgdGhlIGFib3ZlOiB0aGUgcGlja2VyIGhhcyBub3RoaW5nIHRvIG9mZmVyLiAqL1xuXHRyZWFkb25seSBub01vZGVsczogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBBIG1vZGVsIHNlbGVjdGlvbiBkcm9wZG93biB3aWRnZXQuXG4gKlxuICogUmVuZGVycyBhIGJ1dHRvbiBzaG93aW5nIHRoZSBjdXJyZW50bHkgc2VsZWN0ZWQgbW9kZWwgbmFtZS5cbiAqIE9uIGNsaWNrLCBvcGVucyBhIGdyb3VwZWQgcGlja2VyIHBvcHVwIHdpdGg6XG4gKiBBdXRvIFx1MjE5MiBQcm9tb3RlZCAocmVjZW50bHkgdXNlZCArIGN1cmF0ZWQpIFx1MjE5MiBPdGhlciBNb2RlbHMgKGNvbGxhcHNlZCB3aXRoIHNlYXJjaCkuXG4gKlxuICogVGhlIHdpZGdldCBvd25zIGl0cyBzdGF0ZSAtIHNldCBtb2RlbHMsIHNlbGVjdGlvbiwgYW5kIGN1cmF0ZWQgSURzIHZpYSBzZXR0ZXJzLlxuICogTGlzdGVuIGZvciBzZWxlY3Rpb24gY2hhbmdlcyB2aWEgYG9uRGlkQ2hhbmdlU2VsZWN0aW9uYC5cbiAqL1xuZXhwb3J0IGNsYXNzIE1vZGVsUGlja2VyV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZWxlY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbjogRXZlbnQ8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyPiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX3NlbGVjdGVkTW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYmFkZ2U6IE1vZGVsUGlja2VyQmFkZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvbXBhY3Q6IElPYnNlcnZhYmxlPGJvb2xlYW4+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2FjdGl2YXRpbmdBZnRlclRydXN0ID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2YXRpbmdUaW1lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0F1eGlsaWFyeVJlbGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTaG93RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfc2hvd1JlcXVlc3RJZCA9IDA7XG5cblx0cHJpdmF0ZSBfZG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2JhZGdlSWNvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX25hbWVCdXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb25maWdCdXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uOiBNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb247XG5cblx0Z2V0IHNlbGVjdGVkTW9kZWwoKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWRNb2RlbDtcblx0fVxuXG5cdGdldCBkb21Ob2RlKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdGdldCBuYW1lQnV0dG9uKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbmFtZUJ1dHRvbjtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RlbGVnYXRlOiBJTW9kZWxQaWNrZXJEZWxlZ2F0ZSxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASVVwZGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRBY2NvdW50U2VydmljZTogSURlZmF1bHRBY2NvdW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2RlbFBpY2tlckNvbmZpZ3VyYXRpb24sIHtcblx0XHRcdGdldFNlbGVjdGVkTW9kZWw6ICgpID0+IHRoaXMuX3NlbGVjdGVkTW9kZWwsXG5cdFx0XHRnZXRDb25maWd1cmF0aW9uQWNjZXNzOiAoKSA9PiB0aGlzLl9kZWxlZ2F0ZS5tb2RlbENvbmZpZ3VyYXRpb24gPz8gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0aXNEaXNhYmxlZDogKCkgPT4gISF0aGlzLl9kb21Ob2RlPy5jbGFzc0xpc3QuY29udGFpbnMoJ2Rpc2FibGVkJyksXG5cdFx0XHRzaG91bGRTaG93Q2FjaGVCcmVha0hpbnQ6ICgpID0+IHRoaXMuc2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50KC8qIGV4Y2x1ZGVBdXRvTW9kZWwgKi8gZmFsc2UpLFxuXHRcdFx0Z2V0Q2FjaGVCcmVha0xlYXJuTW9yZUxpbms6ICgpID0+IHRoaXMuZ2V0Q2FjaGVCcmVha0xlYXJuTW9yZUxpbmsoKSxcblx0XHRcdGRpc21pc3NDYWNoZUJyZWFrSGludDogKCkgPT4gdGhpcy5kaXNtaXNzQ2FjaGVCcmVha0hpbnQoKSxcblx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdmlzaWJsZSA9PiB0aGlzLl9kZWxlZ2F0ZS5vbkRpZENoYW5nZVZpc2liaWxpdHk/Lih2aXNpYmxlKSxcblx0XHRcdGdldEFjdGlvbldpZGdldENvbnRhaW5lcjogKCkgPT4gdGhpcy5fZGVsZWdhdGUuYWN0aW9uV2lkZ2V0Q29udGFpbmVyLFxuXHRcdFx0Z2V0QWN0aW9uV2lkZ2V0QW5jaG9yOiBhbmNob3IgPT4gdGhpcy5fZGVsZWdhdGUuZ2V0QWN0aW9uV2lkZ2V0QW5jaG9yPy4oYW5jaG9yKSA/PyBhbmNob3IsXG5cdFx0XHRnZXRBbmNob3JQb3NpdGlvbjogKCkgPT4gdGhpcy5fZGVsZWdhdGUuYW5jaG9yUG9zaXRpb24sXG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2FjdGl2YXRpbmdBZnRlclRydXN0ICYmIHRoaXMuX2RlbGVnYXRlLmdldE1vZGVscygpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJBY3RpdmF0aW5nKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZmxlY3QgUmVzdHJpY3RlZCBNb2RlIGltbWVkaWF0ZWx5IHdoZW4gdHJ1c3QgY2hhbmdlcy4gV2hlbiB0cnVzdCBpc1xuXHRcdC8vIGdyYW50ZWQgYnV0IG5vIG1vZGVscyBhcmUgYXZhaWxhYmxlIHlldCwgYnJpZWZseSBzaG93IGFuIFwiQWN0aXZhdGluZy4uLlwiXG5cdFx0Ly8gc3RhdGUgd2hpbGUgdGhlIGNoYXQgZXh0ZW5zaW9uIGNvbWVzIHVwIGFuZCBsb2FkcyB0aGVtLCByYXRoZXIgdGhhbiBhXG5cdFx0Ly8gbWlzbGVhZGluZyBcIkF1dG9cIiBmYWxsYmFjay5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QodHJ1c3RlZCA9PiB7XG5cdFx0XHRpZiAodHJ1c3RlZCAmJiB0aGlzLl9kZWxlZ2F0ZS5nZXRQcmVzZW50YXRpb25PcHRpb25zKCkuc2hvd0F1dG9Nb2RlbCAmJiB0aGlzLl9kZWxlZ2F0ZS5nZXRNb2RlbHMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZhdGluZ0FmdGVyVHJ1c3QgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmF0aW5nVGltZXIudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZhdGluZ0FmdGVyVHJ1c3QgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xuXHRcdFx0XHR9LCAxNTAwMCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jbGVhckFjdGl2YXRpbmcoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJ1c3QgcmVhZHMgYXMgdW50cnVzdGVkIHVudGlsIGluaXRpYWxpemF0aW9uIHJlc29sdmVzOyBnYXRlIG9uIGl0IHNvIGFcblx0XHQvLyB0cnVzdGVkIHdvcmtzcGFjZSBkb2Vzbid0IGJyaWVmbHkgcmVuZGVyIGFzIHJlc3RyaWN0ZWQgYXQgc3RhcnR1cC5cblx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVRydXN0SW5pdGlhbGl6ZWQudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3JlbmRlckxhYmVsKCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VVc2FnZUJhc2VkQmlsbGluZygoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRoZSBzZXR1cC1yZXF1aXJlZCBzdGF0ZSBkZXJpdmVzIGZyb20gZW50aXRsZW1lbnQgLyBzZW50aW1lbnQgLyBhbm9ueW1vdXNcblx0XHQvLyBhY2Nlc3MsIHNvIHJlZnJlc2ggdGhlIGxhYmVsIHdoZW4gYW55IG9mIHRob3NlIGNoYW5nZSAoZS5nLiBhZnRlciBzaWduLWluKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VFbnRpdGxlbWVudCgoKSA9PiB0aGlzLl9yZW5kZXJMYWJlbCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHRoaXMuX3JlbmRlckxhYmVsKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VBbm9ueW1vdXMoKCkgPT4gdGhpcy5fcmVuZGVyTGFiZWwoKSkpO1xuXG5cdFx0Ly8gQWxzbyByZWZyZXNoIHRoZSBsYWJlbCB3aGVuIHRoZSBwZXItZWRpdG9yIGNvbmZpZyBsYXllciAoaWYgYW55KSByZXBvcnRzXG5cdFx0Ly8gYSBjaGFuZ2UuIFRoZSBnbG9iYWwgc2VydmljZSBwYXRoIGlzIGFscmVhZHkgY292ZXJlZCBhYm92ZSB2aWFcblx0XHQvLyBgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsc2Agd2hpY2ggZmlyZXMgZnJvbSBgc2V0TW9kZWxDb25maWd1cmF0aW9uYC5cblx0XHRpZiAodGhpcy5fZGVsZWdhdGUubW9kZWxDb25maWd1cmF0aW9uPy5vbkRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGVsZWdhdGUubW9kZWxDb25maWd1cmF0aW9uLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRzZXRDb21wYWN0KGNvbXBhY3Q6IElPYnNlcnZhYmxlPGJvb2xlYW4+KTogdm9pZCB7XG5cdFx0dGhpcy5fY29tcGFjdCA9IGNvbXBhY3Q7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXNDb21wYWN0ID0gY29tcGFjdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodGhpcy5fZG9tTm9kZSkge1xuXHRcdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NvbXBhY3QnLCBpc0NvbXBhY3QpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRzZXRTZWxlY3RlZE1vZGVsKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RlZE1vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fcmVuZGVyTGFiZWwoKTtcblx0fVxuXG5cdHNldEVuYWJsZWQoZW5hYmxlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kb21Ob2RlKSB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgIWVuYWJsZWQpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcoIWVuYWJsZWQpKTtcblx0XHR9XG5cdH1cblxuXHRzZXRCYWRnZShiYWRnZTogTW9kZWxQaWNrZXJCYWRnZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2JhZGdlID0gYmFkZ2U7XG5cdFx0dGhpcy5fdXBkYXRlQmFkZ2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaHkgdGhlIHBpY2tlciBjdXJyZW50bHkgaGFzIG5vIG1vZGVsIHRvIG9mZmVyICh1bnRydXN0ZWQgdnMuIG5lZWRzXG5cdCAqIHNpZ24taW4vc2V0dXApLCBvciBgdW5kZWZpbmVkYCB3aGVuIGEgbW9kZWwgaXMgYXZhaWxhYmxlLiBTZWVcblx0ICoge0BsaW5rIGdldE1vZGVsUGlja2VyVW5hdmFpbGFibGVSZWFzb259LlxuXHQgKi9cblx0cHJpdmF0ZSBfdW5hdmFpbGFibGVSZWFzb24oKTogTW9kZWxQaWNrZXJVbmF2YWlsYWJsZVJlYXNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldE1vZGVsUGlja2VyVW5hdmFpbGFibGVSZWFzb24oe1xuXHRcdFx0dHJ1c3RJbml0aWFsaXplZDogdGhpcy5fd29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZCxcblx0XHRcdHRydXN0ZWQ6IHRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCksXG5cdFx0XHRwaWNrZXJNb2RlbHM6IHRoaXMuX2RlbGVnYXRlLmdldE1vZGVscygpLFxuXHRcdFx0bGl2ZU1vZGVsSWRzOiB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpLFxuXHRcdFx0cmVxdWlyZXNTZXR1cDogdGhpcy5fcmVxdWlyZXNTZXR1cCgpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWlyZXNTZXR1cCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gbW9kZWxQaWNrZXJSZXF1aXJlc1NldHVwKHtcblx0XHRcdGVudGl0bGVtZW50OiB0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQsXG5cdFx0XHRhbm9ueW1vdXM6IHRoaXMuX2VudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMsXG5cdFx0XHRoYXNCeW9rTW9kZWxzOiB0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2UuaGFzQnlva01vZGVscyxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBwaWNrZXIgaGFzIG5vIHVzYWJsZSBtb2RlbCBzcGVjaWZpY2FsbHkgYmVjYXVzZSB0aGUgd29ya3NwYWNlXG5cdCAqIGlzIHVudHJ1c3RlZCAoUmVzdHJpY3RlZCBNb2RlIGRpc2FibGVzIHRoZSBjaGF0IG1vZGVsIHByb3ZpZGVycykuXG5cdCAqL1xuXHRpc1Jlc3RyaWN0ZWRNb2RlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91bmF2YWlsYWJsZVJlYXNvbigpID09PSBNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29uLlJlc3RyaWN0ZWQ7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgcGlja2VyIGhhcyBubyB1c2FibGUgbW9kZWwgYmVjYXVzZSBDaGF0IHN0aWxsIG5lZWRzIHNpZ24taW4gL1xuXHQgKiBzZXR1cCAoYW5kIHRoZSB3b3Jrc3BhY2UgaXMgdHJ1c3RlZCwgc28gaXQgaXMgbm90IFJlc3RyaWN0ZWQgTW9kZSkuIEJZT0tcblx0ICogYW5kIGFub255bW91cyBhY2Nlc3MgbmV2ZXIgcmVwb3J0IHRoaXMgc3RhdGUuXG5cdCAqL1xuXHRpc1NldHVwUmVxdWlyZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3VuYXZhaWxhYmxlUmVhc29uKCkgPT09IE1vZGVsUGlja2VyVW5hdmFpbGFibGVSZWFzb24uU2V0dXBSZXF1aXJlZDtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyQWN0aXZhdGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmF0aW5nQWZ0ZXJUcnVzdCA9IGZhbHNlO1xuXHRcdHRoaXMuX2FjdGl2YXRpbmdUaW1lci5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb21wdHMgdGhlIHVzZXIgdG8gdHJ1c3QgdGhlIHdvcmtzcGFjZS4gT24gZ3JhbnQsIHByb3ZpZGVycyByZWdpc3RlciB0aGVpclxuXHQgKiBtb2RlbHMgYW5kIGBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzYCByZWZyZXNoZXMgdGhlIHBpY2tlci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlcXVlc3RXb3Jrc3BhY2VUcnVzdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdCh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci50cnVzdE1lc3NhZ2UnLCBcIlRydXN0aW5nIHRoaXMgd29ya3NwYWNlIGVuYWJsZXMgQUkgbW9kZWxzIGFuZCBjaGF0IGZlYXR1cmVzLlwiKVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0cyB0aGUgQ2hhdCBzZXR1cCAvIHNpZ24taW4gZmxvdyAoc2FtZSBjb21tYW5kIGFzIHRoZSB0aXRsZS1iYXIgU2lnbiBJblxuXHQgKiBhZmZvcmRhbmNlKS4gT24gY29tcGxldGlvbiB0aGUgZW50aXRsZW1lbnQgYW5kIG1vZGVsIHJlZ2lzdHJ5IGNoYW5nZSwgd2hpY2hcblx0ICogcmVmcmVzaGVzIHRoZSBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXF1ZXN0U2V0dXAoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQpO1xuXHR9XG5cblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9kb21Ob2RlID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCdkaXYuYWN0aW9uLWxhYmVsLm1vZGVsLXBpY2tlci1zcGxpdCcpKTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdncm91cCcpO1xuXHRcdC8vIFRoZSBjb250YWluZXIgZ3JvdXBzIHRoZSBpbmRpdmlkdWFsIGJ1dHRvbnM7IG9ubHkgdGhlIGJ1dHRvbnMgc2hvdWxkIGJlXG5cdFx0Ly8gdGFiIHN0b3BzLCBub3QgdGhlIGNvbnRhaW5lciBpdHNlbGYuXG5cdFx0dGhpcy5fZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXG5cdFx0Ly8gQXBwbHkgaW5pdGlhbCBjb2xsYXBzZWQgc3RhdGUgbm93IHRoYXQgX2RvbU5vZGUgZXhpc3RzXG5cdFx0aWYgKHRoaXMuX2NvbXBhY3Q/LmdldCgpKSB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NvbXBhY3QnLCB0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBNb2RlbCBuYW1lIGJ1dHRvblxuXHRcdHRoaXMuX25hbWVCdXR0b24gPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsIGRvbS4kKCdhLm1vZGVsLXBpY2tlci1zZWN0aW9uLm1vZGVsLXBpY2tlci1uYW1lJykpO1xuXHRcdHRoaXMuX25hbWVCdXR0b24udGFiSW5kZXggPSAwO1xuXHRcdHRoaXMuX25hbWVCdXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX25hbWVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWhhc3BvcHVwJywgJ3RydWUnKTtcblx0XHR0aGlzLl9uYW1lQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXG5cdFx0Ly8gQ29tYmluZWQgY29uZmlndXJhdGlvbiBidXR0b24gKGNvbmRpdGlvbmFsbHkgdmlzaWJsZSk6IG9wZW5zIGEgc2luZ2xlXG5cdFx0Ly8gZHJvcGRvd24gd2l0aCBUaGlua2luZyBFZmZvcnQgYW5kIENvbnRleHQgU2l6ZSBzZWN0aW9ucy5cblx0XHR0aGlzLl9jb25maWdCdXR0b24gPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsIGRvbS4kKCdhLm1vZGVsLXBpY2tlci1zZWN0aW9uLm1vZGVsLXBpY2tlci1jb25maWcnKSk7XG5cdFx0dGhpcy5fY29uZmlnQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9jb25maWdCdXR0b24uc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2NvbmZpZ0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGFzcG9wdXAnLCAndHJ1ZScpO1xuXHRcdHRoaXMuX2NvbmZpZ0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHR0aGlzLl9jb25maWdCdXR0b24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdHRoaXMuX2JhZGdlSWNvbiA9IGRvbS4kKCdzcGFuLm1vZGVsLXBpY2tlci1iYWRnZScpO1xuXHRcdHRoaXMuX3VwZGF0ZUJhZGdlKCk7XG5cblx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXJCdXR0b25BY3Rpb24odGhpcy5fbmFtZUJ1dHRvbiwgKCkgPT4gdGhpcy5zaG93KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyQnV0dG9uQWN0aW9uKHRoaXMuX2NvbmZpZ0J1dHRvbiwgKCkgPT4gdGhpcy5fY29uZmlndXJhdGlvbi5zaG93KHRoaXMuX2NvbmZpZ0J1dHRvbikpO1xuXG5cdFx0Ly8gTWFuYWdlZCBob3ZlciBmb3IgdGhlIGNvbWJpbmVkIGNvbmZpZ3VyYXRpb24gYnV0dG9uXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSgpLnNldHVwTWFuYWdlZEhvdmVyKFxuXHRcdFx0Z2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksXG5cdFx0XHR0aGlzLl9jb25maWdCdXR0b24sXG5cdFx0XHRsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5jb25maWdUb29sdGlwJywgXCJDb25maWd1cmUgTW9kZWxcIilcblx0XHQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgbW91c2UtZG93biBhbmQgRW50ZXIvU3BhY2Uga2V5IGhhbmRsZXJzIG9uIGEgYnV0dG9uIGVsZW1lbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlckJ1dHRvbkFjdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgYWN0aW9uOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0bGV0IGV4cGFuZGVkT25Nb3VzZURvd24gPSBmYWxzZTtcblx0XHRpZiAodGhpcy5fZGVsZWdhdGUub3Blbk9uTW91c2VVcCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoZWxlbWVudCwgZSA9PiB7XG5cdFx0XHRcdC8vIEZvY3VzaW5nIHRoaXMgd2luZG93IGNhbiBkaXNtaXNzIGEgcGlja2VyIGluIGFub3RoZXIgd2luZG93IGJlZm9yZSBtb3VzZS11cC5cblx0XHRcdFx0aWYgKGUuYnV0dG9uID09PSAwKSB7XG5cdFx0XHRcdFx0ZXhwYW5kZWRPbk1vdXNlRG93biA9IGVsZW1lbnQuZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJztcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRjb25zdCBydW5BY3Rpb24gPSAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuYnV0dG9uICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0aWYgKHRoaXMuX2RlbGVnYXRlLm9wZW5Pbk1vdXNlVXAgJiYgZXhwYW5kZWRPbk1vdXNlRG93biAmJiBlbGVtZW50LmdldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcpICE9PSAndHJ1ZScpIHtcblx0XHRcdFx0ZXhwYW5kZWRPbk1vdXNlRG93biA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRleHBhbmRlZE9uTW91c2VEb3duID0gZmFsc2U7XG5cdFx0XHRhY3Rpb24oKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RlbGVnYXRlLm9wZW5Pbk1vdXNlVXBcblx0XHRcdD8gZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VVcExpc3RlbmVyKGVsZW1lbnQsIHJ1bkFjdGlvbilcblx0XHRcdDogZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIoZWxlbWVudCwgcnVuQWN0aW9uKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0aWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdGFjdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBUaGUgXCJMZWFybiBtb3JlXCIgaGVhZGVyIGxpbmsgZm9yIGNhY2hlLWJyZWFrIGhpbnRzOyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBwcm9kdWN0IGhhcyBubyBVUkwuICovXG5cdHByaXZhdGUgZ2V0Q2FjaGVCcmVha0xlYXJuTW9yZUxpbmsoKTogSUFjdGlvbkxpc3RIZWFkZXJMaW5rIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB1cmwgPSB0aGlzLl9wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5vcHRpbWl6ZVVzYWdlRG9jdW1lbnRhdGlvblVybDtcblx0XHRyZXR1cm4gdXJsID8geyBsYWJlbDogbG9jYWxpemUoJ2NoYXQuY2FjaGVCcmVhay5sZWFybk1vcmUnLCBcIkxlYXJuIG1vcmVcIiksIHVyaTogVVJJLnBhcnNlKHVybCkgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgaXNDYWNoZUJyZWFrSGludERpc21pc3NlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihDQUNIRV9CUkVBS19ISU5UX0RJU01JU1NFRF9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGRpc21pc3NDYWNoZUJyZWFrSGludCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShDQUNIRV9CUkVBS19ISU5UX0RJU01JU1NFRF9TVE9SQUdFX0tFWSwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBwaWNrZXIncyBjdXJyZW50IGF2YWlsYWJpbGl0eSwgZGVyaXZlZCBvbmNlIHNvIHRoZSBsYWJlbCBzdGF0ZXMgYW5kIHRoZSBcIm5vdGhpbmcgdG8gc3dpdGNoXG5cdCAqIHRvXCIgaGludCBzdXBwcmVzc2lvbiAoIzMyNTE4NSkgY2Fubm90IGRpc2FncmVlLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXZhaWxhYmlsaXR5KCk6IElNb2RlbFBpY2tlckF2YWlsYWJpbGl0eSB7XG5cdFx0Ly8gUXVlcmllZCBkaXJlY3RseSByYXRoZXIgdGhhbiB0aHJvdWdoIHRoZSBpc1Jlc3RyaWN0ZWRNb2RlKCkvaXNTZXR1cFJlcXVpcmVkKCkgd3JhcHBlcnMsXG5cdFx0Ly8gd2hpY2ggd291bGQgZWFjaCByZWNvbXB1dGUgaXQuXG5cdFx0Y29uc3QgcmVhc29uID0gdGhpcy5fdW5hdmFpbGFibGVSZWFzb24oKTtcblx0XHRjb25zdCBlbXB0eSA9IHRoaXMuX2RlbGVnYXRlLmdldE1vZGVscygpLmxlbmd0aCA9PT0gMDtcblx0XHRjb25zdCBhY3RpdmF0aW5nID0gcmVhc29uID09PSB1bmRlZmluZWQgJiYgZW1wdHkgJiYgdGhpcy5fYWN0aXZhdGluZ0FmdGVyVHJ1c3Q7XG5cdFx0Y29uc3QgZ2VuZXJpY05vTW9kZWxzID0gcmVhc29uID09PSB1bmRlZmluZWQgJiYgIWFjdGl2YXRpbmcgJiYgZW1wdHkgJiYgIXRoaXMuX2RlbGVnYXRlLmdldFByZXNlbnRhdGlvbk9wdGlvbnMoKS5zaG93QXV0b01vZGVsO1xuXHRcdHJldHVybiB7IHJlYXNvbiwgYWN0aXZhdGluZywgZ2VuZXJpY05vTW9kZWxzLCBub01vZGVsczogcmVhc29uICE9PSB1bmRlZmluZWQgfHwgYWN0aXZhdGluZyB8fCBnZW5lcmljTm9Nb2RlbHMgfTtcblx0fVxuXG5cdC8qKiBUaGluIHdyYXBwZXIgb3ZlciB7QGxpbmsgY29tcHV0ZVNob3VsZFNob3dDYWNoZUJyZWFrSGludH0gdGhhdCBzdXBwbGllcyB0aGlzIHBpY2tlcidzIGxpdmUgc3RhdGUuICovXG5cdHByaXZhdGUgc2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50KGV4Y2x1ZGVBdXRvTW9kZWw6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gY29tcHV0ZVNob3VsZFNob3dDYWNoZUJyZWFrSGludCh7XG5cdFx0XHRkaXNtaXNzZWQ6IHRoaXMuaXNDYWNoZUJyZWFrSGludERpc21pc3NlZCgpLFxuXHRcdFx0Y2FjaGVXYXJtOiB0aGlzLl9kZWxlZ2F0ZS5pc0NhY2hlV2FybT8uKCkgPz8gZmFsc2UsXG5cdFx0XHRub01vZGVsc0F2YWlsYWJsZTogdGhpcy5fYXZhaWxhYmlsaXR5KCkubm9Nb2RlbHMsXG5cdFx0XHRleGNsdWRlQXV0b01vZGVsLFxuXHRcdFx0c2VsZWN0ZWRNb2RlbElzQXV0bzogISF0aGlzLl9zZWxlY3RlZE1vZGVsICYmIGlzQXV0b01vZGVsKHRoaXMuX3NlbGVjdGVkTW9kZWwpLFxuXHRcdH0pO1xuXHR9XG5cblx0c2hvdyhhbmNob3I/OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFuY2hvckVsZW1lbnQgPSBhbmNob3IgPz8gdGhpcy5fZG9tTm9kZTtcblx0XHRpZiAoIWFuY2hvckVsZW1lbnQgfHwgdGhpcy5fZG9tTm9kZT8uY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9uYW1lQnV0dG9uPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSA9PT0gJ3RydWUnKSB7XG5cdFx0XHR0aGlzLl9zaG93UmVxdWVzdElkKys7XG5cdFx0XHR0aGlzLl9hY3RpdmVTaG93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX25hbWVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHRjb25zdCB2aXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fZGVsZWdhdGUub25EaWRDaGFuZ2VWaXNpYmlsaXR5Py4oZmFsc2UpO1xuXHRcdFx0aWYgKHZpc2liaWxpdHlDaGFuZ2UpIHtcblx0XHRcdFx0dm9pZCB2aXNpYmlsaXR5Q2hhbmdlLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUodHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNNb2RlbCA9IHRoaXMuX3NlbGVjdGVkTW9kZWw7XG5cblx0XHRjb25zdCBvblNlbGVjdCA9IChtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyKSA9PiB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdE1vZGVsQ2hhbmdlRXZlbnQsIENoYXRNb2RlbENoYW5nZUNsYXNzaWZpY2F0aW9uPignY2hhdC5tb2RlbENoYW5nZScsIHtcblx0XHRcdFx0ZnJvbU1vZGVsOiBwcmV2aW91c01vZGVsPy5tZXRhZGF0YS52ZW5kb3IgPT09ICdjb3BpbG90JyA/IG5ldyBUZWxlbWV0cnlUcnVzdGVkVmFsdWUocHJldmlvdXNNb2RlbC5pZGVudGlmaWVyKSA6ICd1bmtub3duJyxcblx0XHRcdFx0dG9Nb2RlbDogbW9kZWwubWV0YWRhdGEudmVuZG9yID09PSAnY29waWxvdCcgPyBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKG1vZGVsLmlkZW50aWZpZXIpIDogJ3Vua25vd24nLFxuXHRcdFx0XHRjaGF0U2Vzc2lvbklkOiB0aGlzLl9kZWxlZ2F0ZS5nZXRDaGF0U2Vzc2lvbklkPy4oKVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9zZWxlY3RlZE1vZGVsID0gbW9kZWw7XG5cdFx0XHR0aGlzLl9yZW5kZXJMYWJlbCgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZWxlY3Rpb24uZmlyZShtb2RlbCk7XG5cdFx0fTtcblxuXHRcdC8vIFNlbGVjdGluZyBhIG1vZGVsIGZyb20gYSBob3ZlcidzIGNvbmZpZyBidXR0b246IGFwcGx5IHRoZSBzZWxlY3Rpb24sXG5cdFx0Ly8gY2xvc2UgdGhlIG1vZGVsIHBpY2tlciwgdGhlbiBvcGVuIHRoZSBjb25maWcgcGlja2VyIGZvY3VzZWQgb24gdGhlXG5cdFx0Ly8gcmVxdWVzdGVkIHNlY3Rpb24gKFRoaW5raW5nIEVmZm9ydCBvciBDb250ZXh0IFNpemUpLlxuXHRcdGNvbnN0IG9uQ29uZmlndXJlID0gKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIGdyb3VwOiBzdHJpbmcpID0+IHtcblx0XHRcdG9uU2VsZWN0KG1vZGVsKTtcblx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi5zaG93KHRoaXMuX2NvbmZpZ0J1dHRvbiwgZ3JvdXApO1xuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLl9kZWxlZ2F0ZS5nZXRNb2RlbHMoKTtcblx0XHRjb25zdCBwcmVzZW50YXRpb24gPSB0aGlzLl9kZWxlZ2F0ZS5nZXRQcmVzZW50YXRpb25PcHRpb25zKCk7XG5cdFx0Y29uc3QgbWFuaWZlc3QgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TW9kZWxzQ29udHJvbE1hbmlmZXN0KCk7XG5cdFx0Y29uc3QgY29udHJvbE1vZGVsc0ZvclRpZXI6IElTdHJpbmdEaWN0aW9uYXJ5PElNb2RlbENvbnRyb2xFbnRyeT4gPSBnZXRNb2RlbFBpY2tlckNvbnRyb2xNb2RlbHMobWFuaWZlc3QsIHRoaXMuX2VudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCwgbW9kZWxzKTtcblx0XHRjb25zdCBjYW5TaG93TWFuYWdlTW9kZWxzQWN0aW9uID0gcHJlc2VudGF0aW9uLnNob3dNYW5hZ2VNb2RlbHNBY3Rpb24gJiYgc2hvdWxkU2hvd01hbmFnZU1vZGVsc0FjdGlvbih0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IG1hbmFnZU1vZGVsc0FjdGlvbiA9IGNhblNob3dNYW5hZ2VNb2RlbHNBY3Rpb24gPyBjcmVhdGVNYW5hZ2VNb2RlbHNBY3Rpb24odGhpcy5fY29tbWFuZFNlcnZpY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxvZ01vZGVsUGlja2VySW50ZXJhY3Rpb24gPSAoaW50ZXJhY3Rpb246IENoYXRNb2RlbFBpY2tlckludGVyYWN0aW9uKSA9PiB7XG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdE1vZGVsUGlja2VySW50ZXJhY3Rpb25FdmVudCwgQ2hhdE1vZGVsUGlja2VySW50ZXJhY3Rpb25DbGFzc2lmaWNhdGlvbj4oJ2NoYXQubW9kZWxQaWNrZXJJbnRlcmFjdGlvbicsIHsgaW50ZXJhY3Rpb24gfSk7XG5cdFx0fTtcblx0XHRjb25zdCBtYW5hZ2VTZXR0aW5nc1VybCA9IHRoaXMuX2RlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmNvcGlsb3RTZXR0aW5ncyk7XG5cdFx0Y29uc3Qgb25Ub2dnbGVQaW4gPSAobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcsIHBpbm5lZDogYm9vbGVhbikgPT4ge1xuXHRcdFx0aWYgKHBpbm5lZCkge1xuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UucGluTW9kZWwobW9kZWxJZGVudGlmaWVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS51bnBpbk1vZGVsKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZS1zaG93IHRoZSBwaWNrZXIgdG8gcmVmbGVjdCB0aGUgdXBkYXRlZCBwaW4gc3RhdGVcblx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0dGhpcy5zaG93KGFuY2hvckVsZW1lbnQpO1xuXHRcdH07XG5cblx0XHRjb25zdCBpdGVtcyA9IGJ1aWxkTW9kZWxQaWNrZXJJdGVtcyh7XG5cdFx0XHRtb2RlbHMsXG5cdFx0XHRzZWxlY3RlZE1vZGVsSWQ6IHRoaXMuX3NlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIsXG5cdFx0XHRyZWNlbnRNb2RlbElkczogdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmdldFJlY2VudGx5VXNlZE1vZGVsSWRzKCkuZmlsdGVyKGlkID0+ICF0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuaXNNb2RlbEhpZGRlbihpZCkpLFxuXHRcdFx0cGlubmVkTW9kZWxJZHM6IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRQaW5uZWRNb2RlbElkcygpLmZpbHRlcihpZCA9PiAhdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxIaWRkZW4oaWQpKSxcblx0XHRcdGNvbnRyb2xNb2RlbHM6IGNvbnRyb2xNb2RlbHNGb3JUaWVyLFxuXHRcdFx0Y3VycmVudFZTQ29kZVZlcnNpb246IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb24sXG5cdFx0XHR1cGRhdGVTdGF0ZVR5cGU6IHRoaXMuX3VwZGF0ZVNlcnZpY2Uuc3RhdGUudHlwZSxcblx0XHRcdG1hbmFnZVNldHRpbmdzVXJsLFxuXHRcdFx0bWFuYWdlTW9kZWxzQWN0aW9uLFxuXHRcdFx0Y2hhdEVudGl0bGVtZW50U2VydmljZTogdGhpcy5fZW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRvcGVuZXJTZXJ2aWNlOiB0aGlzLl9vcGVuZXJTZXJ2aWNlLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7XG5cdFx0XHRcdC4uLnByZXNlbnRhdGlvbixcblx0XHRcdFx0cmVzdHJpY3RlZE1vZGU6IHRoaXMuaXNSZXN0cmljdGVkTW9kZSgpLFxuXHRcdFx0XHRzZXR1cFJlcXVpcmVkOiB0aGlzLmlzU2V0dXBSZXF1aXJlZCgpLFxuXHRcdFx0XHRzaG93TWFuYWdlTW9kZWxzSW5TZXR1cFJlcXVpcmVkOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWQpID09PSB0cnVlLFxuXHRcdFx0XHRpc1VCQjogISF0aGlzLl9lbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0b25TZWxlY3QsXG5cdFx0XHRcdG9uVG9nZ2xlUGluLFxuXHRcdFx0XHRvbkNvbmZpZ3VyZSxcblx0XHRcdFx0b25SZXF1ZXN0VHJ1c3Q6ICgpID0+IHsgdm9pZCB0aGlzLl9yZXF1ZXN0V29ya3NwYWNlVHJ1c3QoKTsgfSxcblx0XHRcdFx0b25SZXF1ZXN0U2V0dXA6ICgpID0+IHsgdGhpcy5fcmVxdWVzdFNldHVwKCk7IH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gQ29sbGVjdCBhbGwgaG92ZXIgZGlzcG9zYWJsZXMgc28gdGhleSBhcmUgcHJvcGVybHkgY2xlYW5lZCB1cCB3aGVuIHRoZVxuXHRcdC8vIHBpY2tlciBpcyBoaWRkZW4uIFRoZSBBY3Rpb25MaXN0V2lkZ2V0IG9ubHkgdHJhY2tzIHRoZSBkaXNwb3NhYmxlIGZvciB0aGVcblx0XHQvLyBjdXJyZW50bHktc2hvd24gaG92ZXI7IGFsbCBvdGhlciBpdGVtcycgaG92ZXIgZGlzcG9zYWJsZXMgd291bGQgbGVhay5cblx0XHRjb25zdCBob3ZlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNob3dEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzaG93RGlzcG9zYWJsZXMuYWRkKGhvdmVyRGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuX2FjdGl2ZVNob3dEaXNwb3NhYmxlcy52YWx1ZSA9IHNob3dEaXNwb3NhYmxlcztcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLmhvdmVyPy5kaXNwb3NhYmxlKSB7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGl0ZW0uaG92ZXIuZGlzcG9zYWJsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSGlkZSB0aGUgZmlsdGVyIGluIHRoZSB1bmF2YWlsYWJsZSBzdGF0ZXMgKFJlc3RyaWN0ZWQgTW9kZSAvIHNldHVwXG5cdFx0Ly8gcmVxdWlyZWQpOiB0aGUgb25seSBlbnRyaWVzIGFyZSB0aGUgZXhwbGFuYXRvcnkgaGVhZGVyIGFuZCB0aGUgVHJ1c3QgL1xuXHRcdC8vIFNpZ24gSW4gYWN0aW9uLCBzbyBhIHNlYXJjaCBmaWVsZCB3b3VsZCBqdXN0IGxldCB1c2VycyBmaWx0ZXIgdGhyb3VnaFxuXHRcdC8vIHN0YWxlLCB1bnVzYWJsZSBtb2RlbHMuIFNob3duIG90aGVyd2lzZSAoaXQgYWxzbyBob3N0cyB0aGUgc2Vjb25kYXJ5XG5cdFx0Ly8gaGVhZGluZykuXG5cdFx0Y29uc3QgdW5hdmFpbGFibGUgPSB0aGlzLmlzUmVzdHJpY3RlZE1vZGUoKSB8fCB0aGlzLmlzU2V0dXBSZXF1aXJlZCgpO1xuXHRcdGNvbnN0IHNob3dDYWNoZUJyZWFrSGludCA9IHRoaXMuc2hvdWxkU2hvd0NhY2hlQnJlYWtIaW50KC8qIGV4Y2x1ZGVBdXRvTW9kZWwgKi8gdHJ1ZSk7XG5cdFx0Y29uc3QgbGlzdE9wdGlvbnMgPSB3aXRoQ2hhdElucHV0UGlja2VyTW90aW9uKHtcblx0XHRcdGNsYXNzTmFtZTogJ2NoYXQtbW9kZWwtcGlja2VyLWRyb3Bkb3duJyxcblx0XHRcdGhlYWRlclRleHQ6IHNob3dDYWNoZUJyZWFrSGludCA/IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmNhY2hlQnJlYWtIaW50JywgXCJTd2l0Y2hpbmcgbW9kZWxzIG1pZC1zZXNzaW9uIHJlc2V0cyB0aGUgcHJvbXB0IGNhY2hlIGFuZCBtYXkgaW5jcmVhc2UgY29zdC5cIikgOiB1bmRlZmluZWQsXG5cdFx0XHRoZWFkZXJJY29uOiBzaG93Q2FjaGVCcmVha0hpbnQgPyBDb2RpY29uLmluZm8gOiB1bmRlZmluZWQsXG5cdFx0XHRoZWFkZXJMaW5rOiBzaG93Q2FjaGVCcmVha0hpbnQgPyB0aGlzLmdldENhY2hlQnJlYWtMZWFybk1vcmVMaW5rKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRoZWFkZXJEaXNtaXNzOiBzaG93Q2FjaGVCcmVha0hpbnQgPyAoKSA9PiB0aGlzLmRpc21pc3NDYWNoZUJyZWFrSGludCgpIDogdW5kZWZpbmVkLFxuXHRcdFx0c2hvd0ZpbHRlcjogIXVuYXZhaWxhYmxlLFxuXHRcdFx0ZmlsdGVyUGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLnNlYXJjaCcsIFwiU2VhcmNoIG1vZGVsc1wiKSxcblx0XHRcdGZvY3VzRmlsdGVyT25PcGVuOiB0cnVlLFxuXHRcdFx0Y29sbGFwc2VkQnlEZWZhdWx0OiBuZXcgU2V0KFtNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXJdKSxcblx0XHRcdG9uRGlkVG9nZ2xlU2VjdGlvbjogKHNlY3Rpb246IHN0cmluZywgY29sbGFwc2VkOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdGlmIChzZWN0aW9uID09PSBNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXIpIHtcblx0XHRcdFx0XHRsb2dNb2RlbFBpY2tlckludGVyYWN0aW9uKGNvbGxhcHNlZCA/ICdvdGhlck1vZGVsc0NvbGxhcHNlZCcgOiAnb3RoZXJNb2RlbHNFeHBhbmRlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bGlua0hhbmRsZXI6ICh1cmk6IFVSSSkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnNjaGVtZSA9PT0gJ2NvbW1hbmQnICYmIHVyaS5wYXRoID09PSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnVwZ3JhZGVQbGFuJykge1xuXHRcdFx0XHRcdGxvZ01vZGVsUGlja2VySW50ZXJhY3Rpb24oJ3ByZW1pdW1Nb2RlbFVwZ3JhZGVQbGFuQ2xpY2tlZCcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKG1hbmFnZVNldHRpbmdzVXJsICYmIHRoaXMuX3VyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh1cmksIFVSSS5wYXJzZShtYW5hZ2VTZXR0aW5nc1VybCkpKSB7XG5cdFx0XHRcdFx0bG9nTW9kZWxQaWNrZXJJbnRlcmFjdGlvbignZGlzYWJsZWRNb2RlbENvbnRhY3RBZG1pbkNsaWNrZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2b2lkIHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdH0sXG5cdFx0XHRtaW5XaWR0aDogMjAwLFxuXHRcdFx0YW5jaG9yUG9zaXRpb246IHRoaXMuX2RlbGVnYXRlLmFuY2hvclBvc2l0aW9uID8/IEFuY2hvclBvc2l0aW9uLkFCT1ZFLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCA9IGRvbS5nZXRBY3RpdmVFbGVtZW50KCk7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHtcblx0XHRcdG9uU2VsZWN0OiAoYWN0aW9uOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24pID0+IHtcblx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fc2hvd1JlcXVlc3RJZCsrO1xuXHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlU2hvd0Rpc3Bvc2FibGVzLnZhbHVlID09PSBzaG93RGlzcG9zYWJsZXMpIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVTaG93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzaG93RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX25hbWVCdXR0b24/LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0XHRjb25zdCB2aXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fZGVsZWdhdGUub25EaWRDaGFuZ2VWaXNpYmlsaXR5Py4oZmFsc2UpO1xuXHRcdFx0XHRpZiAodmlzaWJpbGl0eUNoYW5nZSkge1xuXHRcdFx0XHRcdHZvaWQgdmlzaWJpbGl0eUNoYW5nZS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0cHJldmlvdXNseUZvY3VzZWRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fbmFtZUJ1dHRvbj8uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHRjb25zdCBzaG93UmVxdWVzdElkID0gKyt0aGlzLl9zaG93UmVxdWVzdElkO1xuXHRcdGNvbnN0IHNob3dBY3Rpb25XaWRnZXQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoc2hvd1JlcXVlc3RJZCAhPT0gdGhpcy5fc2hvd1JlcXVlc3RJZCB8fCB0aGlzLl9uYW1lQnV0dG9uPy5nZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKSAhPT0gJ3RydWUnKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVTaG93RGlzcG9zYWJsZXMudmFsdWUgPT09IHNob3dEaXNwb3NhYmxlcykge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVNob3dEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2Uuc2hvdyhcblx0XHRcdFx0J0NoYXRNb2RlbFBpY2tlcicsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRpdGVtcyxcblx0XHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRcdHRoaXMuX2RlbGVnYXRlLmdldEFjdGlvbldpZGdldEFuY2hvcj8uKGFuY2hvckVsZW1lbnQpID8/IGFuY2hvckVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX2RlbGVnYXRlLmFjdGlvbldpZGdldENvbnRhaW5lcixcblx0XHRcdFx0W10sXG5cdFx0XHRcdGdldE1vZGVsUGlja2VyQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCksXG5cdFx0XHRcdGxpc3RPcHRpb25zXG5cdFx0XHQpO1xuXHRcdFx0aWYgKHRoaXMuX2RlbGVnYXRlLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eSkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQXV4aWxpYXJ5UmVsYXlvdXQudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGFuY2hvckVsZW1lbnQpLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS51cGRhdGVJdGVtcyhpdGVtcyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgdmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMuX2RlbGVnYXRlLm9uRGlkQ2hhbmdlVmlzaWJpbGl0eT8uKHRydWUpO1xuXHRcdGlmICh2aXNpYmlsaXR5Q2hhbmdlKSB7XG5cdFx0XHR2b2lkIHZpc2liaWxpdHlDaGFuZ2UudGhlbihzaG93QWN0aW9uV2lkZ2V0LCAoKSA9PiB7XG5cdFx0XHRcdGlmIChzaG93UmVxdWVzdElkICE9PSB0aGlzLl9zaG93UmVxdWVzdElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Nob3dSZXF1ZXN0SWQrKztcblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVNob3dEaXNwb3NhYmxlcy52YWx1ZSA9PT0gc2hvd0Rpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlU2hvd0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbmFtZUJ1dHRvbj8uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ2ZhbHNlJyk7XG5cdFx0XHRcdGNvbnN0IGhpZGVWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fZGVsZWdhdGUub25EaWRDaGFuZ2VWaXNpYmlsaXR5Py4oZmFsc2UpO1xuXHRcdFx0XHRpZiAoaGlkZVZpc2liaWxpdHlDaGFuZ2UpIHtcblx0XHRcdFx0XHR2b2lkIGhpZGVWaXNpYmlsaXR5Q2hhbmdlLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KHByZXZpb3VzbHlGb2N1c2VkRWxlbWVudCkpIHtcblx0XHRcdFx0XHRwcmV2aW91c2x5Rm9jdXNlZEVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNob3dBY3Rpb25XaWRnZXQoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nob3dSZXF1ZXN0SWQrKztcblx0XHR0aGlzLl9hY3RpdmVTaG93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRpZiAodGhpcy5fbmFtZUJ1dHRvbj8uZ2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJykgPT09ICd0cnVlJykge1xuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKHRydWUpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVCYWRnZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYmFkZ2VJY29uKSB7XG5cdFx0XHRpZiAodGhpcy5fYmFkZ2UpIHtcblx0XHRcdFx0Y29uc3QgaWNvbiA9IHRoaXMuX2JhZGdlID09PSAnaW5mbycgPyBDb2RpY29uLmluZm8gOiBDb2RpY29uLndhcm5pbmc7XG5cdFx0XHRcdGRvbS5yZXNldCh0aGlzLl9iYWRnZUljb24sIHJlbmRlckljb24oaWNvbikpO1xuXHRcdFx0XHR0aGlzLl9iYWRnZUljb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0aGlzLl9iYWRnZUljb24uY2xhc3NMaXN0LnRvZ2dsZSgnaW5mbycsIHRoaXMuX2JhZGdlID09PSAnaW5mbycpO1xuXHRcdFx0XHR0aGlzLl9iYWRnZUljb24uY2xhc3NMaXN0LnRvZ2dsZSgnd2FybmluZycsIHRoaXMuX2JhZGdlID09PSAnd2FybmluZycpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fYmFkZ2VJY29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kb21Ob2RlIHx8ICF0aGlzLl9uYW1lQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBuYW1lIH0gPSB0aGlzLl9zZWxlY3RlZE1vZGVsPy5tZXRhZGF0YSB8fCB7fTtcblxuXHRcdGNvbnN0IHsgcmVhc29uLCBhY3RpdmF0aW5nLCBnZW5lcmljTm9Nb2RlbHMsIG5vTW9kZWxzOiBub01vZGVsc0F2YWlsYWJsZSB9ID0gdGhpcy5fYXZhaWxhYmlsaXR5KCk7XG5cdFx0Y29uc3QgcmVzdHJpY3RlZE1vZGUgPSByZWFzb24gPT09IE1vZGVsUGlja2VyVW5hdmFpbGFibGVSZWFzb24uUmVzdHJpY3RlZDtcblx0XHRjb25zdCBzZXR1cFJlcXVpcmVkID0gcmVhc29uID09PSBNb2RlbFBpY2tlclVuYXZhaWxhYmxlUmVhc29uLlNldHVwUmVxdWlyZWQ7XG5cdFx0Y29uc3QgdW5hdmFpbGFibGUgPSByZWFzb24gIT09IHVuZGVmaW5lZDtcblxuXHRcdC8vIC0tLSBOYW1lIHNlY3Rpb24gLS0tXG5cdFx0Y29uc3QgbmFtZUNoaWxkcmVuOiAoSFRNTEVsZW1lbnQgfCBzdHJpbmcpW10gPSBbXTtcblx0XHRjb25zdCBtb2RlbEljb24gPSB0aGlzLl9zZWxlY3RlZE1vZGVsXG5cdFx0XHQ/ICh0aGlzLl9zZWxlY3RlZE1vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24gPz8gKHRoaXMuX2RlbGVnYXRlLmdldFByZXNlbnRhdGlvbk9wdGlvbnMoKS5zaG93TW9kZWxJY29uID8gZ2V0TW9kZWxQaWNrZXJJY29uKHRoaXMuX3NlbGVjdGVkTW9kZWwpIDogdW5kZWZpbmVkKSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbXBhY3QgPSB0aGlzLl9jb21wYWN0Py5nZXQoKSA/PyBmYWxzZTtcblx0XHRpZiAobW9kZWxJY29uICYmICFub01vZGVsc0F2YWlsYWJsZSkge1xuXHRcdFx0bmFtZUNoaWxkcmVuLnB1c2gocmVuZGVySWNvbihtb2RlbEljb24pKTtcblx0XHR9XG5cdFx0Ly8gQSBcIk1vZGVsc1wiIHBsYWNlaG9sZGVyIChubyBiYWRnZSkgYmVhdHMgYSBkZWFkLWVuZCBsYWJlbCB3aGlsZSB1bmF2YWlsYWJsZSBcdTIwMTQgdGhlIGhvdmVyIGFuZFxuXHRcdC8vIGRyb3Bkb3duIGNhcnJ5IHRoZSBSZXN0cmljdGVkIE1vZGUgZXhwbGFuYXRpb24gYW5kIHRoZSBUcnVzdCBXb3Jrc3BhY2UgLyBTaWduIEluIGFjdGlvbi5cblx0XHQvLyBcIkFjdGl2YXRpbmcuLi5cIiBpcyB0cmFuc2llbnQgd2hpbGUgbW9kZWxzIGxvYWQgYWZ0ZXIgYSBUcnVzdCBncmFudDsgXCJObyBtb2RlbHMgYXZhaWxhYmxlXCJcblx0XHQvLyBpcyB0aGUgZ2VudWluZWx5IGVtcHR5IHN0YXRlIChlLmcuIGFuIGFnZW50LWhvc3Qgc2Vzc2lvbiB3aXRoIG5vIEF1dG8gZmFsbGJhY2spLlxuXHRcdGNvbnN0IG1vZGVsTGFiZWwgPSB1bmF2YWlsYWJsZVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5tb2RlbHNMYWJlbCcsIFwiTW9kZWxzXCIpXG5cdFx0XHQ6IGFjdGl2YXRpbmdcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5hY3RpdmF0aW5nJywgXCJBY3RpdmF0aW5nLi4uXCIpXG5cdFx0XHRcdDogZ2VuZXJpY05vTW9kZWxzXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5ub01vZGVscycsIFwiTm8gbW9kZWxzIGF2YWlsYWJsZVwiKVxuXHRcdFx0XHRcdDogKG5hbWUgPz8gbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuYXV0bycsIFwiQXV0b1wiKSk7XG5cdFx0aWYgKCFjb21wYWN0IHx8ICFtb2RlbEljb24gfHwgbm9Nb2RlbHNBdmFpbGFibGUpIHtcblx0XHRcdG5hbWVDaGlsZHJlbi5wdXNoKGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJywgdW5kZWZpbmVkLCBtb2RlbExhYmVsKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9iYWRnZUljb24pIHtcblx0XHRcdG5hbWVDaGlsZHJlbi5wdXNoKHRoaXMuX2JhZGdlSWNvbik7XG5cdFx0fVxuXHRcdGRvbS5yZXNldCh0aGlzLl9uYW1lQnV0dG9uLCAuLi5uYW1lQ2hpbGRyZW4pO1xuXG5cdFx0aWYgKHRoaXMuX2NvbmZpZ0J1dHRvbikge1xuXHRcdFx0dGhpcy5fY29uZmlndXJhdGlvbi5yZW5kZXJCdXR0b24odGhpcy5fY29uZmlnQnV0dG9uLCBjb21wYWN0LCBub01vZGVsc0F2YWlsYWJsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXJpYSBcdTIwMTQgbmFtZSB0aGUgY29udHJvbCBcIk1vZGVsc1wiIHRvIG1hdGNoIHRoZSB2aXNpYmxlIGxhYmVsOyB0aGUgY29tbWFcblx0XHQvLyBzZXBhcmF0ZXMgdGhlIGNvbnRyb2wgbmFtZSBmcm9tIGl0cyBjdXJyZW50IHZhbHVlIC8gc3RhdGUuXG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gcmVzdHJpY3RlZE1vZGVcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuYXJpYUxhYmVsUmVzdHJpY3RlZCcsIFwiTW9kZWxzLCB1bmF2YWlsYWJsZSB3aGlsZSBpbiBSZXN0cmljdGVkIG1vZGVcIilcblx0XHRcdDogc2V0dXBSZXF1aXJlZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmFyaWFMYWJlbFNldHVwUmVxdWlyZWQnLCBcIk1vZGVscywgc2lnbiBpbiB0byB1c2UgQ29waWxvdFwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmFyaWFMYWJlbCcsIFwiTW9kZWxzLCB7MH1cIiwgbW9kZWxMYWJlbCk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcmlhTGFiZWwgPSBhcmlhTGFiZWw7XG5c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
