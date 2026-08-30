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
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { AgentHostAllowSignedOutWhenUsableSettingId } from "../../../../../../platform/agentHost/common/agentService.js";
import { IsSessionsWindowContext } from "../../../../../common/contextkeys.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderDescription, getAgentSessionProviderIcon, getAgentSessionProviderName, isFirstPartyAgentSessionProvider } from "../../agentSessions/agentSessions.js";
import { getSessionTypeAvailability, getSessionTypePickerAvailability, getSessionTypeUnavailableDescription, getSessionTypeUnavailableHover, SessionTypeAvailability } from "../../agentSessions/sessionTypeAvailability.js";
import { ChatConfiguration, getDefaultNewChatSessionType, isVisibleEditorChatSessionType, recordUserSelectedSessionType } from "../../../common/constants.js";
import { ChatInputPickerActionViewItem } from "./chatInputPickerActionItem.js";
const firstPartyCategory = { label: localize("chat.sessionTarget.category.agent", "Agent Types"), order: 1 };
const otherCategory = { label: localize("chat.sessionTarget.category.other", "Other"), order: 2 };
function createSessionTypePickerAction(action, sessionTypeItem, currentType, availability, enabled, category, sourceDescription, icon, run) {
  const unavailable = availability !== SessionTypeAvailability.Available;
  const description = getSessionTypeUnavailableDescription(availability) ?? sourceDescription;
  const hoverDescription = getSessionTypeUnavailableHover(availability) ?? sessionTypeItem.hoverDescription;
  const ariaDescription = description ? renderAsPlaintext(description) : void 0;
  const ariaHoverDescription = hoverDescription ? renderAsPlaintext(hoverDescription) : void 0;
  return {
    ...action,
    id: sessionTypeItem.commandId,
    label: sessionTypeItem.label,
    checked: currentType === sessionTypeItem.type,
    icon,
    enabled: unavailable ? false : enabled,
    category,
    description,
    ariaDescription: ariaDescription && ariaHoverDescription ? localize("chat.sessionTarget.ariaDescription", "{0}. {1}", ariaDescription, ariaHoverDescription) : ariaDescription ?? ariaHoverDescription,
    tooltip: "",
    hover: { content: hoverDescription },
    run: async () => run()
  };
}
function getConfiguredSessionTypePickerAvailability(type, configurationService, chatSessionsService, chatEntitlementService, languageModelsService) {
  const allowSignedOutWhenUsable = configurationService.getValue(AgentHostAllowSignedOutWhenUsableSettingId) === true;
  return getSessionTypePickerAvailability(
    type,
    getSessionTypeAvailability(chatSessionsService, chatEntitlementService, languageModelsService, type, allowSignedOutWhenUsable),
    allowSignedOutWhenUsable
  );
}
let SessionTypePickerActionItem = class extends ChatInputPickerActionViewItem {
  constructor(action, chatSessionPosition, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, chatSessionsService, commandService, openerService, telemetryService, chatEntitlementService, languageModelsService, configurationService, storageService, workspaceContextService, agentHostEnablementService) {
    const actionProvider = {
      getActions: () => {
        const currentType = this._getSelectedSessionType() ?? this._getDefaultSessionType();
        const actions = [...this._getAdditionalActions().map((a) => ({ ...action, ...a }))];
        for (const sessionTypeItem of this._sessionTypeItems) {
          const availability = getConfiguredSessionTypePickerAvailability(
            sessionTypeItem.type,
            this.configurationService,
            this.chatSessionsService,
            this.chatEntitlementService,
            this.languageModelsService
          );
          actions.push(createSessionTypePickerAction(
            action,
            sessionTypeItem,
            currentType,
            availability,
            this._isSessionTypeEnabled(sessionTypeItem.type),
            this._getSessionCategory(sessionTypeItem),
            this._getSessionDescription(sessionTypeItem),
            this._getSessionIcon(sessionTypeItem),
            () => this._run(sessionTypeItem)
          ));
        }
        return actions;
      }
    };
    const actionBarActionProvider = {
      getActions: () => {
        return [this._getLearnMore()];
      }
    };
    const sessionTargetPickerOptions = {
      actionProvider,
      actionBarActionProvider,
      showItemKeybindings: true,
      reporter: { id: "ChatSessionTypePicker", name: `ChatSessionTypePicker`, includeOptions: true }
    };
    super(action, sessionTargetPickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.chatSessionPosition = chatSessionPosition;
    this.delegate = delegate;
    this.keybindingService = keybindingService;
    this.chatSessionsService = chatSessionsService;
    this.commandService = commandService;
    this.openerService = openerService;
    this.chatEntitlementService = chatEntitlementService;
    this.languageModelsService = languageModelsService;
    this.configurationService = configurationService;
    this.storageService = storageService;
    this.workspaceContextService = workspaceContextService;
    this.agentHostEnablementService = agentHostEnablementService;
    this._sessionTypeItems = [];
    this._isSessionsWindow = IsSessionsWindowContext.getValue(contextKeyService) === true;
    if (this.delegate.onDidChangeActiveSessionProvider) {
      this._register(this.delegate.onDidChangeActiveSessionProvider(() => {
        if (this.element) {
          this.renderLabel(this.element);
        }
      }));
    }
    this._register(this.chatSessionsService.onDidChangeAvailability(() => {
      this._updateAgentSessionItems();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.EditorPreferCopilotHarness) || e.affectsConfiguration(ChatConfiguration.DefaultToCopilotHarness) || e.affectsConfiguration(ChatConfiguration.EditorLocalAgentEnabled)) {
        this._updateAgentSessionItems();
        if (this.element) {
          this.renderLabel(this.element);
        }
      }
    }));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this._updateAgentSessionItems()));
    this._updateAgentSessionItems();
  }
  _run(sessionTypeItem) {
    if (!this._isSessionsWindow) {
      recordUserSelectedSessionType(this.storageService, this.configurationService, this.chatSessionsService, this.workspaceContextService.getWorkspace(), sessionTypeItem.type, this.agentHostEnablementService.enabled.get());
    }
    if (this.delegate.setActiveSessionProvider) {
      this.delegate.setActiveSessionProvider(sessionTypeItem.type);
    } else {
      this.commandService.executeCommand(sessionTypeItem.commandId, this.chatSessionPosition);
    }
    if (this.element) {
      this.renderLabel(this.element);
    }
  }
  _getSelectedSessionType() {
    return this.delegate.getActiveSessionProvider();
  }
  _getAdditionalActions() {
    return [];
  }
  _getLearnMore() {
    const learnMoreUrl = "https://aka.ms/vscode-concept-harnesses";
    return {
      id: "workbench.action.chat.agentOverview.learnMore",
      label: localize("chat.learnMoreAgentTypes", "Learn about harnesses..."),
      tooltip: learnMoreUrl,
      class: void 0,
      enabled: true,
      run: async () => {
        await this.openerService.open(URI.parse(learnMoreUrl));
      }
    };
  }
  _updateAgentSessionItems() {
    const localSessionItem = {
      type: AgentSessionProviders.Local,
      label: getAgentSessionProviderName(AgentSessionProviders.Local),
      hoverDescription: getAgentSessionProviderDescription(AgentSessionProviders.Local),
      commandId: `workbench.action.chat.openNewChatSessionInPlace.${AgentSessionProviders.Local}`
    };
    const allAgentSessionItems = [localSessionItem];
    const contributions = this.chatSessionsService.getAllChatSessionContributions();
    for (const contribution of contributions) {
      const agentSessionType = getAgentSessionProvider(contribution.type);
      if (agentSessionType) {
        allAgentSessionItems.push({
          type: agentSessionType,
          label: getAgentSessionProviderName(agentSessionType),
          hoverDescription: getAgentSessionProviderDescription(agentSessionType),
          commandId: contribution.canDelegate ? `workbench.action.chat.openNewChatSessionInPlace.${contribution.type}` : `workbench.action.chat.openNewChatSessionExternal.${contribution.type}`
        });
      } else {
        allAgentSessionItems.push({
          type: contribution.type,
          label: contribution.displayName ?? contribution.name ?? contribution.type,
          hoverDescription: contribution.description ?? "",
          commandId: `workbench.action.chat.openNewChatSessionInPlace.${contribution.type}`
        });
      }
    }
    const agentSessionItems = allAgentSessionItems.filter((item) => this._isVisible(item.type));
    const defaultType = this._getDefaultSessionType();
    if (defaultType !== AgentSessionProviders.Local) {
      const index = agentSessionItems.findIndex((item) => item.type === defaultType);
      if (index > 0) {
        const [defaultItem] = agentSessionItems.splice(index, 1);
        agentSessionItems.unshift(defaultItem);
      }
    }
    this._sessionTypeItems = agentSessionItems;
  }
  /**
   * The default session type for the picker when no session is yet active.
   * Defaults to Agent Host Copilot when the agent host is enabled, otherwise
   * {@link AgentSessionProviders.Local}.
   */
  _getDefaultSessionType() {
    return getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService, this.workspaceContextService.getWorkspace(), this.agentHostEnablementService.enabled.get());
  }
  _isVisible(type) {
    return isVisibleEditorChatSessionType(type, this.configurationService, this.chatSessionsService, this.workspaceContextService.getWorkspace());
  }
  _isSessionTypeEnabled(type) {
    if (type === AgentSessionProviders.Local) {
      return true;
    }
    return !!this.chatSessionsService.getChatSessionContribution(type);
  }
  _getSessionCategory(sessionTypeItem) {
    const knownType = getAgentSessionProvider(sessionTypeItem.type);
    return knownType && isFirstPartyAgentSessionProvider(knownType) ? firstPartyCategory : otherCategory;
  }
  _getSessionDescription(_sessionTypeItem) {
    return void 0;
  }
  _getSessionIcon(sessionTypeItem) {
    const knownType = getAgentSessionProvider(sessionTypeItem.type);
    if (knownType) {
      return getAgentSessionProviderIcon(knownType);
    }
    const contribution = this.chatSessionsService.getChatSessionContribution(sessionTypeItem.type);
    if (contribution && ThemeIcon.isThemeIcon(contribution.icon)) {
      return contribution.icon;
    }
    return Codicon.extensions;
  }
  render(container) {
    super.render(container);
    container.classList.add("chat-session-target-picker-item");
  }
  renderLabel(element) {
    this.setAriaLabelAttributes(element);
    const currentType = this._getSelectedSessionType() ?? this._getDefaultSessionType();
    const knownType = getAgentSessionProvider(currentType);
    const label = knownType ? getAgentSessionProviderName(knownType) : this.chatSessionsService.getChatSessionContribution(currentType)?.displayName ?? currentType;
    const icon = this._getSessionIcon({ type: currentType, label, hoverDescription: "", commandId: "" });
    const labelElements = [];
    labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
    labelElements.push(dom.$("span.chat-input-picker-label", void 0, label));
    dom.reset(element, ...labelElements);
    return null;
  }
};
SessionTypePickerActionItem = __decorateClass([
  __decorateParam(4, IActionWidgetService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IChatSessionsService),
  __decorateParam(8, ICommandService),
  __decorateParam(9, IOpenerService),
  __decorateParam(10, ITelemetryService),
  __decorateParam(11, IChatEntitlementService),
  __decorateParam(12, ILanguageModelsService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IStorageService),
  __decorateParam(15, IWorkspaceContextService),
  __decorateParam(16, IAgentHostEnablementService)
], SessionTypePickerActionItem);
export {
  SessionTypePickerActionItem,
  createSessionTypePickerAction,
  getConfiguredSessionTypePickerAvailability
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXHNlc3Npb25UYXJnZXRQaWNrZXJBY3Rpb25JdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciwgSUFjdGlvbldpZGdldERyb3Bkb3duT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEFsbG93U2lnbmVkT3V0V2hlblVzYWJsZVNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBBZ2VudFNlc3Npb25UYXJnZXQsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckRlc2NyaXB0aW9uLCBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24sIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZSwgaXNGaXJzdFBhcnR5QWdlbnRTZXNzaW9uUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgZ2V0U2Vzc2lvblR5cGVBdmFpbGFiaWxpdHksIGdldFNlc3Npb25UeXBlUGlja2VyQXZhaWxhYmlsaXR5LCBnZXRTZXNzaW9uVHlwZVVuYXZhaWxhYmxlRGVzY3JpcHRpb24sIGdldFNlc3Npb25UeXBlVW5hdmFpbGFibGVIb3ZlciwgU2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL3Nlc3Npb25UeXBlQXZhaWxhYmlsaXR5LmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlLCBpc1Zpc2libGVFZGl0b3JDaGF0U2Vzc2lvblR5cGUsIHJlY29yZFVzZXJTZWxlY3RlZFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRQaWNrZXJBY3Rpb25WaWV3SXRlbSwgSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgfSBmcm9tICcuL2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElBY3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bi5qcyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblR5cGVJdGVtIHtcblx0dHlwZTogQWdlbnRTZXNzaW9uVGFyZ2V0O1xuXHRsYWJlbDogc3RyaW5nO1xuXHRob3ZlckRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGNvbW1hbmRJZDogc3RyaW5nO1xufVxuXG5jb25zdCBmaXJzdFBhcnR5Q2F0ZWdvcnkgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5zZXNzaW9uVGFyZ2V0LmNhdGVnb3J5LmFnZW50JywgXCJBZ2VudCBUeXBlc1wiKSwgb3JkZXI6IDEgfTtcbmNvbnN0IG90aGVyQ2F0ZWdvcnkgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5zZXNzaW9uVGFyZ2V0LmNhdGVnb3J5Lm90aGVyJywgXCJPdGhlclwiKSwgb3JkZXI6IDIgfTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb25UeXBlUGlja2VyQWN0aW9uKFxuXHRhY3Rpb246IElBY3Rpb24sXG5cdHNlc3Npb25UeXBlSXRlbTogSVNlc3Npb25UeXBlSXRlbSxcblx0Y3VycmVudFR5cGU6IEFnZW50U2Vzc2lvblRhcmdldCxcblx0YXZhaWxhYmlsaXR5OiBTZXNzaW9uVHlwZUF2YWlsYWJpbGl0eSxcblx0ZW5hYmxlZDogYm9vbGVhbixcblx0Y2F0ZWdvcnk6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblsnY2F0ZWdvcnknXSxcblx0c291cmNlRGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0aWNvbjogVGhlbWVJY29uLFxuXHRydW46ICgpID0+IHZvaWQsXG4pOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24ge1xuXHRjb25zdCB1bmF2YWlsYWJsZSA9IGF2YWlsYWJpbGl0eSAhPT0gU2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkuQXZhaWxhYmxlO1xuXHRjb25zdCBkZXNjcmlwdGlvbiA9IGdldFNlc3Npb25UeXBlVW5hdmFpbGFibGVEZXNjcmlwdGlvbihhdmFpbGFiaWxpdHkpID8/IHNvdXJjZURlc2NyaXB0aW9uO1xuXHRjb25zdCBob3ZlckRlc2NyaXB0aW9uID0gZ2V0U2Vzc2lvblR5cGVVbmF2YWlsYWJsZUhvdmVyKGF2YWlsYWJpbGl0eSkgPz8gc2Vzc2lvblR5cGVJdGVtLmhvdmVyRGVzY3JpcHRpb247XG5cdGNvbnN0IGFyaWFEZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uID8gcmVuZGVyQXNQbGFpbnRleHQoZGVzY3JpcHRpb24pIDogdW5kZWZpbmVkO1xuXHRjb25zdCBhcmlhSG92ZXJEZXNjcmlwdGlvbiA9IGhvdmVyRGVzY3JpcHRpb24gPyByZW5kZXJBc1BsYWludGV4dChob3ZlckRlc2NyaXB0aW9uKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHQuLi5hY3Rpb24sXG5cdFx0aWQ6IHNlc3Npb25UeXBlSXRlbS5jb21tYW5kSWQsXG5cdFx0bGFiZWw6IHNlc3Npb25UeXBlSXRlbS5sYWJlbCxcblx0XHRjaGVja2VkOiBjdXJyZW50VHlwZSA9PT0gc2Vzc2lvblR5cGVJdGVtLnR5cGUsXG5cdFx0aWNvbixcblx0XHRlbmFibGVkOiB1bmF2YWlsYWJsZSA/IGZhbHNlIDogZW5hYmxlZCxcblx0XHRjYXRlZ29yeSxcblx0XHRkZXNjcmlwdGlvbixcblx0XHRhcmlhRGVzY3JpcHRpb246IGFyaWFEZXNjcmlwdGlvbiAmJiBhcmlhSG92ZXJEZXNjcmlwdGlvblxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5zZXNzaW9uVGFyZ2V0LmFyaWFEZXNjcmlwdGlvbicsIFwiezB9LiB7MX1cIiwgYXJpYURlc2NyaXB0aW9uLCBhcmlhSG92ZXJEZXNjcmlwdGlvbilcblx0XHRcdDogYXJpYURlc2NyaXB0aW9uID8/IGFyaWFIb3ZlckRlc2NyaXB0aW9uLFxuXHRcdHRvb2x0aXA6ICcnLFxuXHRcdGhvdmVyOiB7IGNvbnRlbnQ6IGhvdmVyRGVzY3JpcHRpb24gfSxcblx0XHRydW46IGFzeW5jICgpID0+IHJ1bigpLFxuXHR9O1xufVxuXG4vKipcbiAqIFJldHVybnMgcGlja2VyIGF2YWlsYWJpbGl0eSB1c2luZyB0aGUgc2lnbmVkLW91dCBBZ2VudCBIb3N0IHNldHRpbmcgZm9yIGV2ZXJ5IGNoYXQgc3VyZmFjZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvbmZpZ3VyZWRTZXNzaW9uVHlwZVBpY2tlckF2YWlsYWJpbGl0eShcblx0dHlwZTogQWdlbnRTZXNzaW9uVGFyZ2V0LFxuXHRjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0Y2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcbik6IFNlc3Npb25UeXBlQXZhaWxhYmlsaXR5IHtcblx0Y29uc3QgYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlU2V0dGluZ0lkKSA9PT0gdHJ1ZTtcblx0cmV0dXJuIGdldFNlc3Npb25UeXBlUGlja2VyQXZhaWxhYmlsaXR5KFxuXHRcdHR5cGUsXG5cdFx0Z2V0U2Vzc2lvblR5cGVBdmFpbGFiaWxpdHkoY2hhdFNlc3Npb25zU2VydmljZSwgY2hhdEVudGl0bGVtZW50U2VydmljZSwgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB0eXBlLCBhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUpLFxuXHRcdGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSxcblx0KTtcbn1cblxuLyoqXG4gKiBBY3Rpb24gdmlldyBpdGVtIGZvciBzZWxlY3RpbmcgYSBzZXNzaW9uIHRhcmdldCBpbiB0aGUgY2hhdCBpbnRlcmZhY2UuXG4gKiBUaGlzIHBpY2tlciBhbGxvd3Mgc3dpdGNoaW5nIGJldHdlZW4gZGlmZmVyZW50IGNoYXQgc2Vzc2lvbiB0eXBlcyBmb3IgbmV3L2VtcHR5IHNlc3Npb25zLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvblR5cGVQaWNrZXJBY3Rpb25JdGVtIGV4dGVuZHMgQ2hhdElucHV0UGlja2VyQWN0aW9uVmlld0l0ZW0ge1xuXHRwcml2YXRlIF9zZXNzaW9uVHlwZUl0ZW1zOiBJU2Vzc2lvblR5cGVJdGVtW10gPSBbXTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9pc1Nlc3Npb25zV2luZG93OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNoYXRTZXNzaW9uUG9zaXRpb246ICdzaWRlYmFyJyB8ICdlZGl0b3InLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBkZWxlZ2F0ZTogSVNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUsXG5cdFx0cGlja2VyT3B0aW9uczogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdGNvbnN0IGFjdGlvblByb3ZpZGVyOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciA9IHtcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFR5cGUgPSB0aGlzLl9nZXRTZWxlY3RlZFNlc3Npb25UeXBlKCkgPz8gdGhpcy5fZ2V0RGVmYXVsdFNlc3Npb25UeXBlKCk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uW10gPSBbLi4udGhpcy5fZ2V0QWRkaXRpb25hbEFjdGlvbnMoKS5tYXAoYSA9PiAoeyAuLi5hY3Rpb24sIC4uLmEgfSkpXTtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uVHlwZUl0ZW0gb2YgdGhpcy5fc2Vzc2lvblR5cGVJdGVtcykge1xuXHRcdFx0XHRcdGNvbnN0IGF2YWlsYWJpbGl0eSA9IGdldENvbmZpZ3VyZWRTZXNzaW9uVHlwZVBpY2tlckF2YWlsYWJpbGl0eShcblx0XHRcdFx0XHRcdHNlc3Npb25UeXBlSXRlbS50eXBlLFxuXHRcdFx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKGNyZWF0ZVNlc3Npb25UeXBlUGlja2VyQWN0aW9uKFxuXHRcdFx0XHRcdFx0YWN0aW9uLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblR5cGVJdGVtLFxuXHRcdFx0XHRcdFx0Y3VycmVudFR5cGUsXG5cdFx0XHRcdFx0XHRhdmFpbGFiaWxpdHksXG5cdFx0XHRcdFx0XHR0aGlzLl9pc1Nlc3Npb25UeXBlRW5hYmxlZChzZXNzaW9uVHlwZUl0ZW0udHlwZSksXG5cdFx0XHRcdFx0XHR0aGlzLl9nZXRTZXNzaW9uQ2F0ZWdvcnkoc2Vzc2lvblR5cGVJdGVtKSxcblx0XHRcdFx0XHRcdHRoaXMuX2dldFNlc3Npb25EZXNjcmlwdGlvbihzZXNzaW9uVHlwZUl0ZW0pLFxuXHRcdFx0XHRcdFx0dGhpcy5fZ2V0U2Vzc2lvbkljb24oc2Vzc2lvblR5cGVJdGVtKSxcblx0XHRcdFx0XHRcdCgpID0+IHRoaXMuX3J1bihzZXNzaW9uVHlwZUl0ZW0pLFxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIGFjdGlvbnM7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhckFjdGlvblByb3ZpZGVyOiBJQWN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBbdGhpcy5fZ2V0TGVhcm5Nb3JlKCldO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBzZXNzaW9uVGFyZ2V0UGlja2VyT3B0aW9uczogT21pdDxJQWN0aW9uV2lkZ2V0RHJvcGRvd25PcHRpb25zLCAnbGFiZWwnIHwgJ2xhYmVsUmVuZGVyZXInPiA9IHtcblx0XHRcdGFjdGlvblByb3ZpZGVyLFxuXHRcdFx0YWN0aW9uQmFyQWN0aW9uUHJvdmlkZXIsXG5cdFx0XHRzaG93SXRlbUtleWJpbmRpbmdzOiB0cnVlLFxuXHRcdFx0cmVwb3J0ZXI6IHsgaWQ6ICdDaGF0U2Vzc2lvblR5cGVQaWNrZXInLCBuYW1lOiBgQ2hhdFNlc3Npb25UeXBlUGlja2VyYCwgaW5jbHVkZU9wdGlvbnM6IHRydWUgfSxcblx0XHR9O1xuXG5cdFx0c3VwZXIoYWN0aW9uLCBzZXNzaW9uVGFyZ2V0UGlja2VyT3B0aW9ucywgcGlja2VyT3B0aW9ucywgYWN0aW9uV2lkZ2V0U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2lzU2Vzc2lvbnNXaW5kb3cgPSBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5nZXRWYWx1ZShjb250ZXh0S2V5U2VydmljZSkgPT09IHRydWU7XG5cblx0XHRpZiAodGhpcy5kZWxlZ2F0ZS5vbkRpZENoYW5nZUFjdGl2ZVNlc3Npb25Qcm92aWRlcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWxlZ2F0ZS5vbkRpZENoYW5nZUFjdGl2ZVNlc3Npb25Qcm92aWRlcigoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlQWdlbnRTZXNzaW9uSXRlbXMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVkaXRvclByZWZlckNvcGlsb3RIYXJuZXNzKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRUb0NvcGlsb3RIYXJuZXNzKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkVkaXRvckxvY2FsQWdlbnRFbmFibGVkKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVBZ2VudFNlc3Npb25JdGVtcygpO1xuXHRcdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJMYWJlbCh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoKCkgPT4gdGhpcy5fdXBkYXRlQWdlbnRTZXNzaW9uSXRlbXMoKSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlQWdlbnRTZXNzaW9uSXRlbXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfcnVuKHNlc3Npb25UeXBlSXRlbTogSVNlc3Npb25UeXBlSXRlbSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0cmVjb3JkVXNlclNlbGVjdGVkU2Vzc2lvblR5cGUodGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLCBzZXNzaW9uVHlwZUl0ZW0udHlwZSwgdGhpcy5hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5lbmFibGVkLmdldCgpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5kZWxlZ2F0ZS5zZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXIpIHtcblx0XHRcdC8vIFVzZSBwcm92aWRlZCBzZXR0ZXIgKGZvciB3ZWxjb21lIHZpZXcpXG5cdFx0XHR0aGlzLmRlbGVnYXRlLnNldEFjdGl2ZVNlc3Npb25Qcm92aWRlcihzZXNzaW9uVHlwZUl0ZW0udHlwZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEV4ZWN1dGUgY29tbWFuZCB0byBjcmVhdGUgbmV3IHNlc3Npb25cblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoc2Vzc2lvblR5cGVJdGVtLmNvbW1hbmRJZCwgdGhpcy5jaGF0U2Vzc2lvblBvc2l0aW9uKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5yZW5kZXJMYWJlbCh0aGlzLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0U2VsZWN0ZWRTZXNzaW9uVHlwZSgpOiBBZ2VudFNlc3Npb25UYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmRlbGVnYXRlLmdldEFjdGl2ZVNlc3Npb25Qcm92aWRlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRBZGRpdGlvbmFsQWN0aW9ucygpOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRMZWFybk1vcmUoKTogSUFjdGlvbiB7XG5cdFx0Y29uc3QgbGVhcm5Nb3JlVXJsID0gJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1jb25jZXB0LWhhcm5lc3Nlcyc7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmFnZW50T3ZlcnZpZXcubGVhcm5Nb3JlJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5sZWFybk1vcmVBZ2VudFR5cGVzJywgXCJMZWFybiBhYm91dCBoYXJuZXNzZXMuLi5cIiksXG5cdFx0XHR0b29sdGlwOiBsZWFybk1vcmVVcmwsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UobGVhcm5Nb3JlVXJsKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFnZW50U2Vzc2lvbkl0ZW1zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxvY2FsU2Vzc2lvbkl0ZW06IElTZXNzaW9uVHlwZUl0ZW0gPSB7XG5cdFx0XHR0eXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwsXG5cdFx0XHRsYWJlbDogZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCksXG5cdFx0XHRob3ZlckRlc2NyaXB0aW9uOiBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckRlc2NyaXB0aW9uKEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCksXG5cdFx0XHRjb21tYW5kSWQ6IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld0NoYXRTZXNzaW9uSW5QbGFjZS4ke0FnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbH1gLFxuXHRcdH07XG5cblx0XHRjb25zdCBhbGxBZ2VudFNlc3Npb25JdGVtczogSVNlc3Npb25UeXBlSXRlbVtdID0gW2xvY2FsU2Vzc2lvbkl0ZW1dO1xuXG5cdFx0Y29uc3QgY29udHJpYnV0aW9ucyA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKTtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBjb250cmlidXRpb25zKSB7XG5cdFx0XHQvLyBUT0RPOiBSZW1vdmUgaGFyZGNvZGVkIHByb3ZpZGVycyBmcm9tIGNvcmVcblx0XHRcdGNvbnN0IGFnZW50U2Vzc2lvblR5cGUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihjb250cmlidXRpb24udHlwZSk7XG5cdFx0XHRpZiAoYWdlbnRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHQvLyBXZWxsLWtub3duIHNlc3Npb24gdHlwZSBcdTIwMTQgdXNlIGhhcmRjb2RlZCBtZXRhZGF0YVxuXHRcdFx0XHRhbGxBZ2VudFNlc3Npb25JdGVtcy5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBhZ2VudFNlc3Npb25UeXBlLFxuXHRcdFx0XHRcdGxhYmVsOiBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoYWdlbnRTZXNzaW9uVHlwZSksXG5cdFx0XHRcdFx0aG92ZXJEZXNjcmlwdGlvbjogZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJEZXNjcmlwdGlvbihhZ2VudFNlc3Npb25UeXBlKSxcblx0XHRcdFx0XHRjb21tYW5kSWQ6IGNvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZSA/XG5cdFx0XHRcdFx0XHRgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5OZXdDaGF0U2Vzc2lvbkluUGxhY2UuJHtjb250cmlidXRpb24udHlwZX1gIDpcblx0XHRcdFx0XHRcdGB3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld0NoYXRTZXNzaW9uRXh0ZXJuYWwuJHtjb250cmlidXRpb24udHlwZX1gLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEV4dGVuc2lvbi1jb250cmlidXRlZCBzZXNzaW9uIHR5cGUgXHUyMDE0IGFsd2F5cyB1c2UgaW4tcGxhY2Vcblx0XHRcdFx0Ly8gKG9wZW5OZXdDaGF0U2Vzc2lvbkV4dGVybmFsIHJlcXVpcmVzIGEgbWVudSBhY3Rpb24gcmVnaXN0ZXJlZFxuXHRcdFx0XHQvLyBieSBfcmVnaXN0ZXJNZW51SXRlbXMsIHdoaWNoIG1heSBub3QgZXhpc3QgZm9yIGV4dGVuc2lvbnMpXG5cdFx0XHRcdGFsbEFnZW50U2Vzc2lvbkl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdHR5cGU6IGNvbnRyaWJ1dGlvbi50eXBlLFxuXHRcdFx0XHRcdGxhYmVsOiBjb250cmlidXRpb24uZGlzcGxheU5hbWUgPz8gY29udHJpYnV0aW9uLm5hbWUgPz8gY29udHJpYnV0aW9uLnR5cGUsXG5cdFx0XHRcdFx0aG92ZXJEZXNjcmlwdGlvbjogY29udHJpYnV0aW9uLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTmV3Q2hhdFNlc3Npb25JblBsYWNlLiR7Y29udHJpYnV0aW9uLnR5cGV9YCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyIG91dCBoaWRkZW4gaXRlbXMgYmFzZWQgb24gc2V0dGluZ3Ncblx0XHRjb25zdCBhZ2VudFNlc3Npb25JdGVtcyA9IGFsbEFnZW50U2Vzc2lvbkl0ZW1zLmZpbHRlcihpdGVtID0+IHRoaXMuX2lzVmlzaWJsZShpdGVtLnR5cGUpKTtcblxuXHRcdC8vIFdoZW4gdGhlIGV4cGVyaW1lbnRhbCBcImxvY2FsIGFnZW50IGhvc3QgYXMgZGVmYXVsdFwiIHNldHRpbmcgaXNcblx0XHQvLyBlbmFibGVkLCBob2lzdCB0aGUgYWdlbnQtaG9zdCBpdGVtIHRvIHRoZSBmcm9udCBvZiB0aGUgcGlja2VyIHNvIGl0XG5cdFx0Ly8gaXMgdGhlIGRlZmF1bHQgc2VsZWN0aW9uLlxuXHRcdGNvbnN0IGRlZmF1bHRUeXBlID0gdGhpcy5fZ2V0RGVmYXVsdFNlc3Npb25UeXBlKCk7XG5cdFx0aWYgKGRlZmF1bHRUeXBlICE9PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwpIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gYWdlbnRTZXNzaW9uSXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS50eXBlID09PSBkZWZhdWx0VHlwZSk7XG5cdFx0XHRpZiAoaW5kZXggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IFtkZWZhdWx0SXRlbV0gPSBhZ2VudFNlc3Npb25JdGVtcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0XHRhZ2VudFNlc3Npb25JdGVtcy51bnNoaWZ0KGRlZmF1bHRJdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9zZXNzaW9uVHlwZUl0ZW1zID0gYWdlbnRTZXNzaW9uSXRlbXM7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGRlZmF1bHQgc2Vzc2lvbiB0eXBlIGZvciB0aGUgcGlja2VyIHdoZW4gbm8gc2Vzc2lvbiBpcyB5ZXQgYWN0aXZlLlxuXHQgKiBEZWZhdWx0cyB0byBBZ2VudCBIb3N0IENvcGlsb3Qgd2hlbiB0aGUgYWdlbnQgaG9zdCBpcyBlbmFibGVkLCBvdGhlcndpc2Vcblx0ICoge0BsaW5rIEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbH0uXG5cdCAqL1xuXHRwcm90ZWN0ZWQgX2dldERlZmF1bHRTZXNzaW9uVHlwZSgpOiBBZ2VudFNlc3Npb25UYXJnZXQge1xuXHRcdHJldHVybiBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSwgdGhpcy5hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5lbmFibGVkLmdldCgpKSBhcyBBZ2VudFNlc3Npb25UYXJnZXQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2lzVmlzaWJsZSh0eXBlOiBBZ2VudFNlc3Npb25UYXJnZXQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNWaXNpYmxlRWRpdG9yQ2hhdFNlc3Npb25UeXBlKHR5cGUsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSwgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2lzU2Vzc2lvblR5cGVFbmFibGVkKHR5cGU6IEFnZW50U2Vzc2lvblRhcmdldCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBMb2NhbCBpcyBhbHdheXMgYXZhaWxhYmxlXG5cdFx0fVxuXHRcdC8vIERpc2FibGUgbm9uLWxvY2FsIHNlc3Npb24gdHlwZXMgd2hlbiB0aGVpciBwcm92aWRlciBpcyBub3QgcmVnaXN0ZXJlZCB5ZXRcblx0XHRyZXR1cm4gISF0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24odHlwZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFNlc3Npb25DYXRlZ29yeShzZXNzaW9uVHlwZUl0ZW06IElTZXNzaW9uVHlwZUl0ZW0pIHtcblx0XHQvLyBUT0RPOiBSZW1vdmUgaGFyZGNvZGVkIHByb3ZpZGVycyBmcm9tIGNvcmVcblx0XHRjb25zdCBrbm93blR5cGUgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihzZXNzaW9uVHlwZUl0ZW0udHlwZSk7XG5cdFx0cmV0dXJuIGtub3duVHlwZSAmJiBpc0ZpcnN0UGFydHlBZ2VudFNlc3Npb25Qcm92aWRlcihrbm93blR5cGUpID8gZmlyc3RQYXJ0eUNhdGVnb3J5IDogb3RoZXJDYXRlZ29yeTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0U2Vzc2lvbkRlc2NyaXB0aW9uKF9zZXNzaW9uVHlwZUl0ZW06IElTZXNzaW9uVHlwZUl0ZW0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTZXNzaW9uSWNvbihzZXNzaW9uVHlwZUl0ZW06IElTZXNzaW9uVHlwZUl0ZW0pOiBUaGVtZUljb24ge1xuXHRcdC8vIFRPRE86IFJlbW92ZSBoYXJkY29kZWQgcHJvdmlkZXJzIGZyb20gY29yZVxuXHRcdGNvbnN0IGtub3duVHlwZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKHNlc3Npb25UeXBlSXRlbS50eXBlKTtcblx0XHRpZiAoa25vd25UeXBlKSB7XG5cdFx0XHRyZXR1cm4gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJJY29uKGtub3duVHlwZSk7XG5cdFx0fVxuXHRcdC8vIEV4dGVuc2lvbi1jb250cmlidXRlZDogbG9vayB1cCBpY29uIGZyb20gdGhlIGNvbnRyaWJ1dGlvblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihzZXNzaW9uVHlwZUl0ZW0udHlwZSk7XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbiAmJiBUaGVtZUljb24uaXNUaGVtZUljb24oY29udHJpYnV0aW9uLmljb24pKSB7XG5cdFx0XHRyZXR1cm4gY29udHJpYnV0aW9uLmljb247XG5cdFx0fVxuXHRcdHJldHVybiBDb2RpY29uLmV4dGVuc2lvbnM7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXNlc3Npb24tdGFyZ2V0LXBpY2tlci1pdGVtJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyTGFiZWwoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB8IG51bGwge1xuXHRcdHRoaXMuc2V0QXJpYUxhYmVsQXR0cmlidXRlcyhlbGVtZW50KTtcblx0XHRjb25zdCBjdXJyZW50VHlwZSA9IHRoaXMuX2dldFNlbGVjdGVkU2Vzc2lvblR5cGUoKSA/PyB0aGlzLl9nZXREZWZhdWx0U2Vzc2lvblR5cGUoKTtcblxuXHRcdC8vIFRPRE86IFJlbW92ZSBoYXJkY29kZWQgcHJvdmlkZXJzIGZyb20gY29yZVxuXHRcdGNvbnN0IGtub3duVHlwZSA9IGdldEFnZW50U2Vzc2lvblByb3ZpZGVyKGN1cnJlbnRUeXBlKTtcblx0XHRjb25zdCBsYWJlbCA9IGtub3duVHlwZVxuXHRcdFx0PyBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoa25vd25UeXBlKVxuXHRcdFx0OiAodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKGN1cnJlbnRUeXBlKT8uZGlzcGxheU5hbWUgPz8gY3VycmVudFR5cGUpO1xuXHRcdGNvbnN0IGljb24gPSB0aGlzLl9nZXRTZXNzaW9uSWNvbih7IHR5cGU6IGN1cnJlbnRUeXBlLCBsYWJlbCwgaG92ZXJEZXNjcmlwdGlvbjogJycsIGNvbW1hbmRJZDogJycgfSk7XG5cblx0XHRjb25zdCBsYWJlbEVsZW1lbnRzID0gW107XG5cdFx0bGFiZWxFbGVtZW50cy5wdXNoKC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGAkKCR7aWNvbi5pZH0pYCkpO1xuXHRcdGxhYmVsRWxlbWVudHMucHVzaChkb20uJCgnc3Bhbi5jaGF0LWlucHV0LXBpY2tlci1sYWJlbCcsIHVuZGVmaW5lZCwgbGFiZWwpKTtcblxuXHRcdGRvbS5yZXNldChlbGVtZW50LCAuLi5sYWJlbEVsZW1lbnRzKTtcblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGVBQWU7QUFFeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsa0RBQWtEO0FBQzNELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQTJDLHlCQUF5QixvQ0FBb0MsNkJBQTZCLDZCQUE2Qix3Q0FBd0M7QUFDbk4sU0FBUyw0QkFBNEIsa0NBQWtDLHNDQUFzQyxnQ0FBZ0MsK0JBQStCO0FBQzVLLFNBQVMsbUJBQW1CLDhCQUE4QixnQ0FBZ0MscUNBQXFDO0FBQy9ILFNBQVMscUNBQThEO0FBWXZFLE1BQU0scUJBQXFCLEVBQUUsT0FBTyxTQUFTLHFDQUFxQyxhQUFhLEdBQUcsT0FBTyxFQUFFO0FBQzNHLE1BQU0sZ0JBQWdCLEVBQUUsT0FBTyxTQUFTLHFDQUFxQyxPQUFPLEdBQUcsT0FBTyxFQUFFO0FBRXpGLFNBQVMsOEJBQ2YsUUFDQSxpQkFDQSxhQUNBLGNBQ0EsU0FDQSxVQUNBLG1CQUNBLE1BQ0EsS0FDOEI7QUFDOUIsUUFBTSxjQUFjLGlCQUFpQix3QkFBd0I7QUFDN0QsUUFBTSxjQUFjLHFDQUFxQyxZQUFZLEtBQUs7QUFDMUUsUUFBTSxtQkFBbUIsK0JBQStCLFlBQVksS0FBSyxnQkFBZ0I7QUFDekYsUUFBTSxrQkFBa0IsY0FBYyxrQkFBa0IsV0FBVyxJQUFJO0FBQ3ZFLFFBQU0sdUJBQXVCLG1CQUFtQixrQkFBa0IsZ0JBQWdCLElBQUk7QUFDdEYsU0FBTztBQUFBLElBQ04sR0FBRztBQUFBLElBQ0gsSUFBSSxnQkFBZ0I7QUFBQSxJQUNwQixPQUFPLGdCQUFnQjtBQUFBLElBQ3ZCLFNBQVMsZ0JBQWdCLGdCQUFnQjtBQUFBLElBQ3pDO0FBQUEsSUFDQSxTQUFTLGNBQWMsUUFBUTtBQUFBLElBQy9CO0FBQUEsSUFDQTtBQUFBLElBQ0EsaUJBQWlCLG1CQUFtQix1QkFDakMsU0FBUyxzQ0FBc0MsWUFBWSxpQkFBaUIsb0JBQW9CLElBQ2hHLG1CQUFtQjtBQUFBLElBQ3RCLFNBQVM7QUFBQSxJQUNULE9BQU8sRUFBRSxTQUFTLGlCQUFpQjtBQUFBLElBQ25DLEtBQUssWUFBWSxJQUFJO0FBQUEsRUFDdEI7QUFDRDtBQUtPLFNBQVMsMkNBQ2YsTUFDQSxzQkFDQSxxQkFDQSx3QkFDQSx1QkFDMEI7QUFDMUIsUUFBTSwyQkFBMkIscUJBQXFCLFNBQWtCLDBDQUEwQyxNQUFNO0FBQ3hILFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSwyQkFBMkIscUJBQXFCLHdCQUF3Qix1QkFBdUIsTUFBTSx3QkFBd0I7QUFBQSxJQUM3SDtBQUFBLEVBQ0Q7QUFDRDtBQU1PLElBQU0sOEJBQU4sY0FBMEMsOEJBQThCO0FBQUEsRUFJOUUsWUFDQyxRQUNtQixxQkFDQSxVQUNuQixlQUNzQixxQkFDaUIsbUJBQ25CLG1CQUNxQixxQkFDTCxnQkFDRCxlQUNoQixrQkFDeUIsd0JBQ0QsdUJBQ0Qsc0JBQ04sZ0JBQ08seUJBQ0csNEJBQzdDO0FBRUQsVUFBTSxpQkFBc0Q7QUFBQSxNQUMzRCxZQUFZLE1BQU07QUFDakIsY0FBTSxjQUFjLEtBQUssd0JBQXdCLEtBQUssS0FBSyx1QkFBdUI7QUFFbEYsY0FBTSxVQUF5QyxDQUFDLEdBQUcsS0FBSyxzQkFBc0IsRUFBRSxJQUFJLFFBQU0sRUFBRSxHQUFHLFFBQVEsR0FBRyxFQUFFLEVBQUUsQ0FBQztBQUMvRyxtQkFBVyxtQkFBbUIsS0FBSyxtQkFBbUI7QUFDckQsZ0JBQU0sZUFBZTtBQUFBLFlBQ3BCLGdCQUFnQjtBQUFBLFlBQ2hCLEtBQUs7QUFBQSxZQUNMLEtBQUs7QUFBQSxZQUNMLEtBQUs7QUFBQSxZQUNMLEtBQUs7QUFBQSxVQUNOO0FBQ0Esa0JBQVEsS0FBSztBQUFBLFlBQ1o7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBLEtBQUssc0JBQXNCLGdCQUFnQixJQUFJO0FBQUEsWUFDL0MsS0FBSyxvQkFBb0IsZUFBZTtBQUFBLFlBQ3hDLEtBQUssdUJBQXVCLGVBQWU7QUFBQSxZQUMzQyxLQUFLLGdCQUFnQixlQUFlO0FBQUEsWUFDcEMsTUFBTSxLQUFLLEtBQUssZUFBZTtBQUFBLFVBQ2hDLENBQUM7QUFBQSxRQUNGO0FBRUEsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsVUFBTSwwQkFBMkM7QUFBQSxNQUNoRCxZQUFZLE1BQU07QUFDakIsZUFBTyxDQUFDLEtBQUssY0FBYyxDQUFDO0FBQUEsTUFDN0I7QUFBQSxJQUNEO0FBRUEsVUFBTSw2QkFBNEY7QUFBQSxNQUNqRztBQUFBLE1BQ0E7QUFBQSxNQUNBLHFCQUFxQjtBQUFBLE1BQ3JCLFVBQVUsRUFBRSxJQUFJLHlCQUF5QixNQUFNLHlCQUF5QixnQkFBZ0IsS0FBSztBQUFBLElBQzlGO0FBRUEsVUFBTSxRQUFRLDRCQUE0QixlQUFlLHFCQUFxQixtQkFBbUIsbUJBQW1CLGdCQUFnQjtBQTdEakg7QUFDQTtBQUdvQjtBQUVFO0FBQ0w7QUFDRDtBQUVTO0FBQ0Q7QUFDRDtBQUNOO0FBQ087QUFDRztBQXBCL0MsU0FBUSxvQkFBd0MsQ0FBQztBQW9FaEQsU0FBSyxvQkFBb0Isd0JBQXdCLFNBQVMsaUJBQWlCLE1BQU07QUFFakYsUUFBSSxLQUFLLFNBQVMsa0NBQWtDO0FBQ25ELFdBQUssVUFBVSxLQUFLLFNBQVMsaUNBQWlDLE1BQU07QUFDbkUsWUFBSSxLQUFLLFNBQVM7QUFDakIsZUFBSyxZQUFZLEtBQUssT0FBTztBQUFBLFFBQzlCO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsU0FBSyxVQUFVLEtBQUssb0JBQW9CLHdCQUF3QixNQUFNO0FBQ3JFLFdBQUsseUJBQXlCO0FBQUEsSUFDL0IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUsscUJBQXFCLHlCQUF5QixPQUFLO0FBQ3RFLFVBQUksRUFBRSxxQkFBcUIsa0JBQWtCLDBCQUEwQixLQUN0RSxFQUFFLHFCQUFxQixrQkFBa0IsdUJBQXVCLEtBQ2hFLEVBQUUscUJBQXFCLGtCQUFrQix1QkFBdUIsR0FBRztBQUNuRSxhQUFLLHlCQUF5QjtBQUM5QixZQUFJLEtBQUssU0FBUztBQUNqQixlQUFLLFlBQVksS0FBSyxPQUFPO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsS0FBSyx3QkFBd0IsNEJBQTRCLE1BQU0sS0FBSyx5QkFBeUIsQ0FBQyxDQUFDO0FBRTlHLFNBQUsseUJBQXlCO0FBQUEsRUFDL0I7QUFBQSxFQUVVLEtBQUssaUJBQXlDO0FBQ3ZELFFBQUksQ0FBQyxLQUFLLG1CQUFtQjtBQUM1QixvQ0FBOEIsS0FBSyxnQkFBZ0IsS0FBSyxzQkFBc0IsS0FBSyxxQkFBcUIsS0FBSyx3QkFBd0IsYUFBYSxHQUFHLGdCQUFnQixNQUFNLEtBQUssMkJBQTJCLFFBQVEsSUFBSSxDQUFDO0FBQUEsSUFDek47QUFFQSxRQUFJLEtBQUssU0FBUywwQkFBMEI7QUFFM0MsV0FBSyxTQUFTLHlCQUF5QixnQkFBZ0IsSUFBSTtBQUFBLElBQzVELE9BQU87QUFFTixXQUFLLGVBQWUsZUFBZSxnQkFBZ0IsV0FBVyxLQUFLLG1CQUFtQjtBQUFBLElBQ3ZGO0FBQ0EsUUFBSSxLQUFLLFNBQVM7QUFDakIsV0FBSyxZQUFZLEtBQUssT0FBTztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRVUsMEJBQTBEO0FBQ25FLFdBQU8sS0FBSyxTQUFTLHlCQUF5QjtBQUFBLEVBQy9DO0FBQUEsRUFFVSx3QkFBdUQ7QUFDaEUsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUFBLEVBRVUsZ0JBQXlCO0FBQ2xDLFVBQU0sZUFBZTtBQUNyQixXQUFPO0FBQUEsTUFDTixJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsNEJBQTRCLDBCQUEwQjtBQUFBLE1BQ3RFLFNBQVM7QUFBQSxNQUNULE9BQU87QUFBQSxNQUNQLFNBQVM7QUFBQSxNQUNULEtBQUssWUFBWTtBQUNoQixjQUFNLEtBQUssY0FBYyxLQUFLLElBQUksTUFBTSxZQUFZLENBQUM7QUFBQSxNQUN0RDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSwyQkFBaUM7QUFDeEMsVUFBTSxtQkFBcUM7QUFBQSxNQUMxQyxNQUFNLHNCQUFzQjtBQUFBLE1BQzVCLE9BQU8sNEJBQTRCLHNCQUFzQixLQUFLO0FBQUEsTUFDOUQsa0JBQWtCLG1DQUFtQyxzQkFBc0IsS0FBSztBQUFBLE1BQ2hGLFdBQVcsbURBQW1ELHNCQUFzQixLQUFLO0FBQUEsSUFDMUY7QUFFQSxVQUFNLHVCQUEyQyxDQUFDLGdCQUFnQjtBQUVsRSxVQUFNLGdCQUFnQixLQUFLLG9CQUFvQiwrQkFBK0I7QUFDOUUsZUFBVyxnQkFBZ0IsZUFBZTtBQUV6QyxZQUFNLG1CQUFtQix3QkFBd0IsYUFBYSxJQUFJO0FBQ2xFLFVBQUksa0JBQWtCO0FBRXJCLDZCQUFxQixLQUFLO0FBQUEsVUFDekIsTUFBTTtBQUFBLFVBQ04sT0FBTyw0QkFBNEIsZ0JBQWdCO0FBQUEsVUFDbkQsa0JBQWtCLG1DQUFtQyxnQkFBZ0I7QUFBQSxVQUNyRSxXQUFXLGFBQWEsY0FDdkIsbURBQW1ELGFBQWEsSUFBSSxLQUNwRSxvREFBb0QsYUFBYSxJQUFJO0FBQUEsUUFDdkUsQ0FBQztBQUFBLE1BQ0YsT0FBTztBQUlOLDZCQUFxQixLQUFLO0FBQUEsVUFDekIsTUFBTSxhQUFhO0FBQUEsVUFDbkIsT0FBTyxhQUFhLGVBQWUsYUFBYSxRQUFRLGFBQWE7QUFBQSxVQUNyRSxrQkFBa0IsYUFBYSxlQUFlO0FBQUEsVUFDOUMsV0FBVyxtREFBbUQsYUFBYSxJQUFJO0FBQUEsUUFDaEYsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBR0EsVUFBTSxvQkFBb0IscUJBQXFCLE9BQU8sVUFBUSxLQUFLLFdBQVcsS0FBSyxJQUFJLENBQUM7QUFLeEYsVUFBTSxjQUFjLEtBQUssdUJBQXVCO0FBQ2hELFFBQUksZ0JBQWdCLHNCQUFzQixPQUFPO0FBQ2hELFlBQU0sUUFBUSxrQkFBa0IsVUFBVSxVQUFRLEtBQUssU0FBUyxXQUFXO0FBQzNFLFVBQUksUUFBUSxHQUFHO0FBQ2QsY0FBTSxDQUFDLFdBQVcsSUFBSSxrQkFBa0IsT0FBTyxPQUFPLENBQUM7QUFDdkQsMEJBQWtCLFFBQVEsV0FBVztBQUFBLE1BQ3RDO0FBQUEsSUFDRDtBQUVBLFNBQUssb0JBQW9CO0FBQUEsRUFDMUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPVSx5QkFBNkM7QUFDdEQsV0FBTyw2QkFBNkIsS0FBSyxzQkFBc0IsS0FBSyxxQkFBcUIsS0FBSyxnQkFBZ0IsS0FBSyx3QkFBd0IsYUFBYSxHQUFHLEtBQUssMkJBQTJCLFFBQVEsSUFBSSxDQUFDO0FBQUEsRUFDek07QUFBQSxFQUVVLFdBQVcsTUFBbUM7QUFDdkQsV0FBTywrQkFBK0IsTUFBTSxLQUFLLHNCQUFzQixLQUFLLHFCQUFxQixLQUFLLHdCQUF3QixhQUFhLENBQUM7QUFBQSxFQUM3STtBQUFBLEVBRVUsc0JBQXNCLE1BQW1DO0FBQ2xFLFFBQUksU0FBUyxzQkFBc0IsT0FBTztBQUN6QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sQ0FBQyxDQUFDLEtBQUssb0JBQW9CLDJCQUEyQixJQUFJO0FBQUEsRUFDbEU7QUFBQSxFQUVVLG9CQUFvQixpQkFBbUM7QUFFaEUsVUFBTSxZQUFZLHdCQUF3QixnQkFBZ0IsSUFBSTtBQUM5RCxXQUFPLGFBQWEsaUNBQWlDLFNBQVMsSUFBSSxxQkFBcUI7QUFBQSxFQUN4RjtBQUFBLEVBRVUsdUJBQXVCLGtCQUF3RDtBQUN4RixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0JBQWdCLGlCQUE4QztBQUVyRSxVQUFNLFlBQVksd0JBQXdCLGdCQUFnQixJQUFJO0FBQzlELFFBQUksV0FBVztBQUNkLGFBQU8sNEJBQTRCLFNBQVM7QUFBQSxJQUM3QztBQUVBLFVBQU0sZUFBZSxLQUFLLG9CQUFvQiwyQkFBMkIsZ0JBQWdCLElBQUk7QUFDN0YsUUFBSSxnQkFBZ0IsVUFBVSxZQUFZLGFBQWEsSUFBSSxHQUFHO0FBQzdELGFBQU8sYUFBYTtBQUFBLElBQ3JCO0FBQ0EsV0FBTyxRQUFRO0FBQUEsRUFDaEI7QUFBQSxFQUVTLE9BQU8sV0FBOEI7QUFDN0MsVUFBTSxPQUFPLFNBQVM7QUFDdEIsY0FBVSxVQUFVLElBQUksaUNBQWlDO0FBQUEsRUFDMUQ7QUFBQSxFQUVtQixZQUFZLFNBQTBDO0FBQ3hFLFNBQUssdUJBQXVCLE9BQU87QUFDbkMsVUFBTSxjQUFjLEtBQUssd0JBQXdCLEtBQUssS0FBSyx1QkFBdUI7QUFHbEYsVUFBTSxZQUFZLHdCQUF3QixXQUFXO0FBQ3JELFVBQU0sUUFBUSxZQUNYLDRCQUE0QixTQUFTLElBQ3BDLEtBQUssb0JBQW9CLDJCQUEyQixXQUFXLEdBQUcsZUFBZTtBQUNyRixVQUFNLE9BQU8sS0FBSyxnQkFBZ0IsRUFBRSxNQUFNLGFBQWEsT0FBTyxrQkFBa0IsSUFBSSxXQUFXLEdBQUcsQ0FBQztBQUVuRyxVQUFNLGdCQUFnQixDQUFDO0FBQ3ZCLGtCQUFjLEtBQUssR0FBRyxxQkFBcUIsS0FBSyxLQUFLLEVBQUUsR0FBRyxDQUFDO0FBQzNELGtCQUFjLEtBQUssSUFBSSxFQUFFLGdDQUFnQyxRQUFXLEtBQUssQ0FBQztBQUUxRSxRQUFJLE1BQU0sU0FBUyxHQUFHLGFBQWE7QUFFbkMsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXRRYSw4QkFBTjtBQUFBLEVBU0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXJCVTsiLAogICJuYW1lcyI6IFtdCn0K
