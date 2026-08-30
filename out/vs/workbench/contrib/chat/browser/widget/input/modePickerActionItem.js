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
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { coalesce } from "../../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { groupBy } from "../../../../../../base/common/collections.js";
import { autorun, observableValue } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { getFlatActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatMode } from "../../../common/chatModes.js";
import { isOrganizationPromptFile } from "../../../common/promptSyntax/utils/promptsServiceUtils.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../../common/constants.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { getOpenChatActionIdForMode } from "../../actions/chatActions.js";
import { ToggleAgentModeActionId } from "../../actions/chatExecuteActions.js";
import { ChatInputPickerActionViewItem } from "./chatInputPickerActionItem.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IWorkbenchAssignmentService } from "../../../../../services/assignment/common/assignmentService.js";
const builtinDefaultIcon = (mode) => {
  switch (mode.name.get().toLowerCase()) {
    case "ask":
      return Codicon.ask;
    case "plan":
      return Codicon.tasklist;
    default:
      return void 0;
  }
};
let ModePickerActionItem = class extends ChatInputPickerActionViewItem {
  constructor(action, delegate, pickerOptions, actionWidgetService, chatAgentService, keybindingService, configurationService, contextKeyService, menuService, commandService, _productService, telemetryService, openerService, assignmentService) {
    const assignments = observableValue("modePickerAssignments", { showOldAskMode: false });
    const getCustomAgentTarget = () => delegate.customAgentTarget?.() ?? Target.Undefined;
    const builtInCategory = { label: localize("built-in", "Built-In"), order: 0 };
    const customCategory = { label: localize("custom", "Custom"), order: 1 };
    const policyDisabledCategory = { label: localize("managedByOrganization", "Managed by your organization"), order: 999, showHeader: true };
    const agentModeDisabledViaPolicy = configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
    const makeAction = (mode, currentMode) => {
      const isDisabledViaPolicy = mode.kind === ChatModeKind.Agent && agentModeDisabledViaPolicy;
      const tooltip = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip;
      const toolbarActions = [];
      if (mode.kind === ChatModeKind.Agent && !isDisabledViaPolicy) {
        if (mode.uri) {
          let label, icon, id;
          if (mode.source?.storage === PromptsStorage.extension) {
            icon = Codicon.file;
            id = `viewAgent:${mode.id}`;
            label = localize("viewModeConfiguration", "View {0} agent", mode.label.get());
          } else {
            icon = Codicon.edit;
            id = `editAgent:${mode.id}`;
            label = localize("editModeConfiguration", "Edit {0} agent", mode.label.get());
          }
          const modeResource = mode.uri;
          toolbarActions.push({
            id,
            label,
            tooltip: label,
            class: ThemeIcon.asClassName(icon),
            enabled: true,
            run: async () => {
              openerService.open(modeResource.get());
            }
          });
        }
      }
      return {
        ...action,
        id: getOpenChatActionIdForMode(mode),
        label: mode.label.get(),
        icon: isDisabledViaPolicy ? ThemeIcon.fromId(Codicon.lock.id) : mode.icon.get(),
        class: isDisabledViaPolicy ? "disabled-by-policy" : void 0,
        enabled: !isDisabledViaPolicy,
        checked: !isDisabledViaPolicy && currentMode.id === mode.id,
        tooltip: "",
        hover: { content: tooltip },
        toolbarActions,
        run: async () => {
          if (isDisabledViaPolicy) {
            return;
          }
          if (this.delegate.setMode && !this.delegate.sessionResource()) {
            this.delegate.setMode(mode);
            if (this.element) {
              this.renderLabel(this.element);
            }
            return;
          }
          const result = await commandService.executeCommand(
            ToggleAgentModeActionId,
            { modeId: mode.id, sessionResource: this.delegate.sessionResource() }
          );
          if (this.element) {
            this.renderLabel(this.element);
          }
          return result;
        },
        category: isDisabledViaPolicy ? policyDisabledCategory : builtInCategory
      };
    };
    const makeActionFromCustomMode = (mode, currentMode) => {
      return {
        ...makeAction(mode, currentMode),
        tooltip: "",
        hover: { content: mode.description.get() ?? chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip },
        icon: mode.icon.get() ?? (isModeConsideredBuiltIn(mode, this._productService) ? builtinDefaultIcon(mode) : void 0),
        category: agentModeDisabledViaPolicy ? policyDisabledCategory : customCategory
      };
    };
    const getActionsForCustomAgentTarget = (currentTarget) => {
      const modes = delegate.currentChatModes.get();
      const currentMode = delegate.currentMode.get();
      const filteredCustomModes = modes.custom.filter((mode) => {
        const target = mode.target.get();
        if (target !== currentTarget && target !== Target.Undefined) {
          return false;
        }
        return true;
      });
      const customModes = groupBy(
        filteredCustomModes,
        (mode) => isModeConsideredBuiltIn(mode, this._productService) ? "builtin" : "custom"
      );
      const checked = currentMode.id === ChatMode.Agent.id;
      const defaultAction = { ...makeAction(ChatMode.Agent, ChatMode.Agent), checked };
      defaultAction.category = builtInCategory;
      const builtInActions = customModes.builtin?.map((mode) => {
        const action2 = makeActionFromCustomMode(mode, currentMode);
        action2.category = builtInCategory;
        return action2;
      }) ?? [];
      const customActions = customModes.custom?.map((mode) => makeActionFromCustomMode(mode, currentMode)) ?? [];
      return [defaultAction, ...builtInActions, ...customActions];
    };
    const actionProvider = {
      getActions: () => {
        const modes = delegate.currentChatModes.get();
        const currentMode = delegate.currentMode.get();
        const agentMode = modes.builtin.find((mode) => mode.id === ChatMode.Agent.id);
        const otherBuiltinModes = modes.builtin.filter((mode) => {
          return mode.id !== ChatMode.Agent.id && shouldShowBuiltInMode(mode, assignments.get(), agentModeDisabledViaPolicy);
        });
        const filteredCustomModes = modes.custom.filter((mode) => {
          if (isModeConsideredBuiltIn(mode, this._productService)) {
            return shouldShowBuiltInMode(mode, assignments.get(), agentModeDisabledViaPolicy);
          }
          return true;
        });
        const customModes = groupBy(
          filteredCustomModes,
          (mode) => isModeConsideredBuiltIn(mode, this._productService) ? "builtin" : "custom"
        );
        const customBuiltinModeActions = customModes.builtin?.map((mode) => {
          const action2 = makeActionFromCustomMode(mode, currentMode);
          action2.category = agentModeDisabledViaPolicy ? policyDisabledCategory : builtInCategory;
          return action2;
        }) ?? [];
        customBuiltinModeActions.sort((a, b) => a.label.localeCompare(b.label));
        const customModeActions = customModes.custom?.map((mode) => makeActionFromCustomMode(mode, currentMode)) ?? [];
        customModeActions.sort((a, b) => a.label.localeCompare(b.label));
        const orderedModes = coalesce([
          agentMode && makeAction(agentMode, currentMode),
          ...otherBuiltinModes.map((mode) => mode && makeAction(mode, currentMode)),
          ...customBuiltinModeActions,
          ...customModeActions
        ]);
        return orderedModes;
      }
    };
    const dynamicActionProvider = {
      getActions: () => {
        const currentTarget = getCustomAgentTarget();
        if (currentTarget !== Target.Undefined) {
          return getActionsForCustomAgentTarget(currentTarget);
        }
        return actionProvider.getActions();
      }
    };
    const modePickerActionWidgetOptions = {
      actionProvider: dynamicActionProvider,
      actionBarActionProvider: {
        getActions: () => this.getModePickerActionBarActions()
      },
      showItemKeybindings: true,
      reporter: { id: "ChatModePicker", name: "ChatModePicker", includeOptions: true }
    };
    super(action, modePickerActionWidgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.delegate = delegate;
    this.contextKeyService = contextKeyService;
    this.menuService = menuService;
    this._productService = _productService;
    this._register(autorun((reader) => {
      this.delegate.currentMode.read(reader).label.read(reader);
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
    assignmentService.getTreatment("chat.showOldAskMode").then((showOldAskMode) => {
      assignments.set({ showOldAskMode: showOldAskMode === "enabled" }, void 0);
    });
    this._register(assignmentService.onDidRefetchAssignments(async () => {
      assignments.set({ showOldAskMode: await assignmentService.getTreatment("chat.showOldAskMode") === "enabled" }, void 0);
    }));
  }
  getModePickerActionBarActions() {
    const menuActions = this.menuService.createMenu(MenuId.ChatModePicker, this.contextKeyService);
    const menuContributions = getFlatActionBarActions(menuActions.getActions({ renderShortTitle: true }));
    menuActions.dispose();
    return menuContributions;
  }
  render(container) {
    super.render(container);
    container.classList.add("chat-mode-picker-item");
  }
  renderLabel(element) {
    this.setAriaLabelAttributes(element);
    const currentMode = this.delegate.currentMode.get();
    const state = currentMode.label.get();
    let icon = currentMode.icon.get();
    if (!icon && isModeConsideredBuiltIn(currentMode, this._productService)) {
      icon = builtinDefaultIcon(currentMode);
    }
    const labelElements = [];
    const collapsed = this.pickerOptions.compact.get();
    if (icon) {
      labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
    }
    if (!collapsed || !icon) {
      labelElements.push(dom.$("span.chat-input-picker-label", void 0, state));
    }
    dom.reset(element, ...labelElements);
    return null;
  }
};
ModePickerActionItem = __decorateClass([
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IChatAgentService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IProductService),
  __decorateParam(11, ITelemetryService),
  __decorateParam(12, IOpenerService),
  __decorateParam(13, IWorkbenchAssignmentService)
], ModePickerActionItem);
function isModeConsideredBuiltIn(mode, productService) {
  if (mode.isBuiltin) {
    return true;
  }
  if (mode.source?.storage !== PromptsStorage.extension) {
    return false;
  }
  const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
  if (!chatExtensionId || mode.source.extensionId.value !== chatExtensionId) {
    return false;
  }
  const modeUri = mode.uri?.get();
  if (!modeUri) {
    return true;
  }
  return !isOrganizationPromptFile(modeUri, mode.source.extensionId, productService);
}
function shouldShowBuiltInMode(mode, assignments, agentModeDisabledViaPolicy) {
  if (mode.id === ChatMode.Edit.id) {
    return agentModeDisabledViaPolicy;
  }
  if (mode.id === ChatMode.Ask.id || mode.name.get().toLowerCase() === "ask") {
    if (mode.id === ChatMode.Ask.id) {
      return assignments.showOldAskMode || agentModeDisabledViaPolicy;
    } else {
      return !(assignments.showOldAskMode || agentModeDisabledViaPolicy);
    }
  }
  return true;
}
export {
  ModePickerActionItem,
  isModeConsideredBuiltIn
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVQaWNrZXJBY3Rpb25JdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciwgSUFjdGlvbldpZGdldERyb3Bkb3duT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlLCBJQ2hhdE1vZGUsIElDaGF0TW9kZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvdXRpbHMvcHJvbXB0c1NlcnZpY2VVdGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBnZXRPcGVuQ2hhdEFjdGlvbklkRm9yTW9kZSB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVRvZ2dsZUNoYXRNb2RlQXJncywgVG9nZ2xlQWdlbnRNb2RlQWN0aW9uSWQgfSBmcm9tICcuLi8uLi9hY3Rpb25zL2NoYXRFeGVjdXRlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRQaWNrZXJBY3Rpb25WaWV3SXRlbSwgSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgfSBmcm9tICcuL2NoYXRJbnB1dFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9hc3NpZ25tZW50L2NvbW1vbi9hc3NpZ25tZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1vZGVQaWNrZXJEZWxlZ2F0ZSB7XG5cdHJlYWRvbmx5IGN1cnJlbnRNb2RlOiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGU+O1xuXHRyZWFkb25seSBjdXJyZW50Q2hhdE1vZGVzOiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGVzPjtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKiBEaXJlY3QgbW9kZS1jaGFuZ2UgY2FsbGJhY2sgZm9yIGhvc3RzIHdpdGhvdXQgYSByZWdpc3RlcmVkIElDaGF0V2lkZ2V0IChieXBhc3NlcyBUb2dnbGVBZ2VudE1vZGVBY3Rpb25JZCkuICovXG5cdHJlYWRvbmx5IHNldE1vZGU/OiAobW9kZTogSUNoYXRNb2RlKSA9PiB2b2lkO1xuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoZSBtb2RlIHBpY2tlciB3aWxsIHNob3cgY3VzdG9tIGFnZW50cyB3aG9zZSB0YXJnZXQgbWF0Y2hlcyB0aGlzIHZhbHVlLlxuXHQgKiBDdXN0b20gYWdlbnRzIHdpdGhvdXQgYSB0YXJnZXQgYXJlIGFsd2F5cyBzaG93biBpbiBhbGwgc2Vzc2lvbiB0eXBlcy4gSWYgbm8gYWdlbnRzIG1hdGNoIHRoZSB0YXJnZXQsIHNob3dzIGEgZGVmYXVsdCBcIkFnZW50XCIgb3B0aW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgY3VzdG9tQWdlbnRUYXJnZXQ/OiAoKSA9PiBUYXJnZXQ7XG59XG5cbi8vIFRPRE86IHRoZXJlIHNob3VsZCBiZSBhbiBpY29uIGNvbnRyaWJ1dGVkIGZvciBidWlsdC1pbiBtb2Rlc1xuY29uc3QgYnVpbHRpbkRlZmF1bHRJY29uID0gKG1vZGU6IElDaGF0TW9kZSkgPT4ge1xuXHRzd2l0Y2ggKG1vZGUubmFtZS5nZXQoKS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0Y2FzZSAnYXNrJzogcmV0dXJuIENvZGljb24uYXNrO1xuXHRcdGNhc2UgJ3BsYW4nOiByZXR1cm4gQ29kaWNvbi50YXNrbGlzdDtcblx0XHRkZWZhdWx0OiByZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59O1xuXG5leHBvcnQgY2xhc3MgTW9kZVBpY2tlckFjdGlvbkl0ZW0gZXh0ZW5kcyBDaGF0SW5wdXRQaWNrZXJBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSU1vZGVQaWNrZXJEZWxlZ2F0ZSxcblx0XHRwaWNrZXJPcHRpb25zOiBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoQXNzaWdubWVudFNlcnZpY2UgYXNzaWdubWVudFNlcnZpY2U6IElXb3JrYmVuY2hBc3NpZ25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgYXNzaWdubWVudHMgPSBvYnNlcnZhYmxlVmFsdWU8eyBzaG93T2xkQXNrTW9kZTogYm9vbGVhbiB9PignbW9kZVBpY2tlckFzc2lnbm1lbnRzJywgeyBzaG93T2xkQXNrTW9kZTogZmFsc2UgfSk7XG5cblx0XHQvLyBHZXQgY3VzdG9tIGFnZW50IHRhcmdldCBkeW5hbWljYWxseSAobWF5IGNoYW5nZSB3aGVuIHN3aXRjaGluZyBzZXNzaW9uIHR5cGVzKVxuXHRcdGNvbnN0IGdldEN1c3RvbUFnZW50VGFyZ2V0ID0gKCkgPT4gZGVsZWdhdGUuY3VzdG9tQWdlbnRUYXJnZXQ/LigpID8/IFRhcmdldC5VbmRlZmluZWQ7XG5cblx0XHQvLyBDYXRlZ29yeSBkZWZpbml0aW9uc1xuXHRcdGNvbnN0IGJ1aWx0SW5DYXRlZ29yeSA9IHsgbGFiZWw6IGxvY2FsaXplKCdidWlsdC1pbicsIFwiQnVpbHQtSW5cIiksIG9yZGVyOiAwIH07XG5cdFx0Y29uc3QgY3VzdG9tQ2F0ZWdvcnkgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnY3VzdG9tJywgXCJDdXN0b21cIiksIG9yZGVyOiAxIH07XG5cdFx0Y29uc3QgcG9saWN5RGlzYWJsZWRDYXRlZ29yeSA9IHsgbGFiZWw6IGxvY2FsaXplKCdtYW5hZ2VkQnlPcmdhbml6YXRpb24nLCBcIk1hbmFnZWQgYnkgeW91ciBvcmdhbml6YXRpb25cIiksIG9yZGVyOiA5OTksIHNob3dIZWFkZXI6IHRydWUgfTtcblxuXHRcdGNvbnN0IGFnZW50TW9kZURpc2FibGVkVmlhUG9saWN5ID0gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWQpLnBvbGljeVZhbHVlID09PSBmYWxzZTtcblxuXHRcdGNvbnN0IG1ha2VBY3Rpb24gPSAobW9kZTogSUNoYXRNb2RlLCBjdXJyZW50TW9kZTogSUNoYXRNb2RlKTogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uID0+IHtcblx0XHRcdGNvbnN0IGlzRGlzYWJsZWRWaWFQb2xpY3kgPVxuXHRcdFx0XHRtb2RlLmtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCAmJlxuXHRcdFx0XHRhZ2VudE1vZGVEaXNhYmxlZFZpYVBvbGljeTtcblxuXHRcdFx0Y29uc3QgdG9vbHRpcCA9IGNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIG1vZGUua2luZCk/LmRlc2NyaXB0aW9uID8/IGFjdGlvbi50b29sdGlwO1xuXG5cdFx0XHQvLyBBZGQgdG9vbGJhciBhY3Rpb25zIGZvciBBZ2VudCBtb2Rlc1xuXHRcdFx0Y29uc3QgdG9vbGJhckFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0aWYgKG1vZGUua2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50ICYmICFpc0Rpc2FibGVkVmlhUG9saWN5KSB7XG5cdFx0XHRcdGlmIChtb2RlLnVyaSkge1xuXHRcdFx0XHRcdGxldCBsYWJlbCwgaWNvbiwgaWQ7XG5cdFx0XHRcdFx0aWYgKG1vZGUuc291cmNlPy5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pIHtcblx0XHRcdFx0XHRcdGljb24gPSBDb2RpY29uLmZpbGU7XG5cdFx0XHRcdFx0XHRpZCA9IGB2aWV3QWdlbnQ6JHttb2RlLmlkfWA7XG5cdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCd2aWV3TW9kZUNvbmZpZ3VyYXRpb24nLCBcIlZpZXcgezB9IGFnZW50XCIsIG1vZGUubGFiZWwuZ2V0KCkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRpY29uID0gQ29kaWNvbi5lZGl0O1xuXHRcdFx0XHRcdFx0aWQgPSBgZWRpdEFnZW50OiR7bW9kZS5pZH1gO1xuXHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnZWRpdE1vZGVDb25maWd1cmF0aW9uJywgXCJFZGl0IHswfSBhZ2VudFwiLCBtb2RlLmxhYmVsLmdldCgpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBtb2RlUmVzb3VyY2UgPSBtb2RlLnVyaTtcblx0XHRcdFx0XHR0b29sYmFyQWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiBsYWJlbCxcblx0XHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbiksXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdG9wZW5lclNlcnZpY2Uub3Blbihtb2RlUmVzb3VyY2UuZ2V0KCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmFjdGlvbixcblx0XHRcdFx0aWQ6IGdldE9wZW5DaGF0QWN0aW9uSWRGb3JNb2RlKG1vZGUpLFxuXHRcdFx0XHRsYWJlbDogbW9kZS5sYWJlbC5nZXQoKSxcblx0XHRcdFx0aWNvbjogaXNEaXNhYmxlZFZpYVBvbGljeSA/IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5sb2NrLmlkKSA6IG1vZGUuaWNvbi5nZXQoKSxcblx0XHRcdFx0Y2xhc3M6IGlzRGlzYWJsZWRWaWFQb2xpY3kgPyAnZGlzYWJsZWQtYnktcG9saWN5JyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZDogIWlzRGlzYWJsZWRWaWFQb2xpY3ksXG5cdFx0XHRcdGNoZWNrZWQ6ICFpc0Rpc2FibGVkVmlhUG9saWN5ICYmIGN1cnJlbnRNb2RlLmlkID09PSBtb2RlLmlkLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0aG92ZXI6IHsgY29udGVudDogdG9vbHRpcCB9LFxuXHRcdFx0XHR0b29sYmFyQWN0aW9ucyxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzRGlzYWJsZWRWaWFQb2xpY3kpIHtcblx0XHRcdFx0XHRcdHJldHVybjsgLy8gQmxvY2sgaW50ZXJhY3Rpb24gaWYgZGlzYWJsZWQgYnkgcG9saWN5XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFNlc3Npb24tbGVzcyBob3N0cyAoZS5nLiB0aGUgYXV0b21hdGlvbnMgZGlhbG9nKSBwcm92aWRlXG5cdFx0XHRcdFx0Ly8gYHNldE1vZGVgIGFuZCBhIGBzZXNzaW9uUmVzb3VyY2VgIHRoYXQgcmV0dXJucyB1bmRlZmluZWQuXG5cdFx0XHRcdFx0Ly8gU2tpcCB0aGUgY29tbWFuZCBwYXRoIGJlY2F1c2UgaXQgcmVxdWlyZXMgYSByZWdpc3RlcmVkXG5cdFx0XHRcdFx0Ly8gYElDaGF0V2lkZ2V0YC4gUm91dGUgdGhlIGNoYW5nZSB0byB0aGUgaG9zdCBkaXJlY3RseSBzbyB0aGVcblx0XHRcdFx0XHQvLyBpbnB1dCdzIG1vZGUgb2JzZXJ2YWJsZSBpcyBhY3R1YWxseSB1cGRhdGVkLiBSZWFsIGNoYXRcblx0XHRcdFx0XHQvLyB3aWRnZXRzIGFsd2F5cyBoYXZlIGEgc2Vzc2lvbiBVUkkuIFRoZXkgYWx3YXlzIHRha2UgdGhlXG5cdFx0XHRcdFx0Ly8gY29tbWFuZCBwYXRoICh0ZWxlbWV0cnksIGNvbmZpcm1hdGlvbiwgbmV3LWNoYXQtb24tY2xlYXIpLlxuXHRcdFx0XHRcdGlmICh0aGlzLmRlbGVnYXRlLnNldE1vZGUgJiYgIXRoaXMuZGVsZWdhdGUuc2Vzc2lvblJlc291cmNlKCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuZGVsZWdhdGUuc2V0TW9kZShtb2RlKTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJMYWJlbCh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChcblx0XHRcdFx0XHRcdFRvZ2dsZUFnZW50TW9kZUFjdGlvbklkLFxuXHRcdFx0XHRcdFx0eyBtb2RlSWQ6IG1vZGUuaWQsIHNlc3Npb25SZXNvdXJjZTogdGhpcy5kZWxlZ2F0ZS5zZXNzaW9uUmVzb3VyY2UoKSB9IHNhdGlzZmllcyBJVG9nZ2xlQ2hhdE1vZGVBcmdzXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNhdGVnb3J5OiBpc0Rpc2FibGVkVmlhUG9saWN5ID8gcG9saWN5RGlzYWJsZWRDYXRlZ29yeSA6IGJ1aWx0SW5DYXRlZ29yeVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFrZUFjdGlvbkZyb21DdXN0b21Nb2RlID0gKG1vZGU6IElDaGF0TW9kZSwgY3VycmVudE1vZGU6IElDaGF0TW9kZSk6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5tYWtlQWN0aW9uKG1vZGUsIGN1cnJlbnRNb2RlKSxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdGhvdmVyOiB7IGNvbnRlbnQ6IG1vZGUuZGVzY3JpcHRpb24uZ2V0KCkgPz8gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgbW9kZS5raW5kKT8uZGVzY3JpcHRpb24gPz8gYWN0aW9uLnRvb2x0aXAgfSxcblx0XHRcdFx0aWNvbjogbW9kZS5pY29uLmdldCgpID8/IChpc01vZGVDb25zaWRlcmVkQnVpbHRJbihtb2RlLCB0aGlzLl9wcm9kdWN0U2VydmljZSkgPyBidWlsdGluRGVmYXVsdEljb24obW9kZSkgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRjYXRlZ29yeTogYWdlbnRNb2RlRGlzYWJsZWRWaWFQb2xpY3kgPyBwb2xpY3lEaXNhYmxlZENhdGVnb3J5IDogY3VzdG9tQ2F0ZWdvcnlcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldEFjdGlvbnNGb3JDdXN0b21BZ2VudFRhcmdldCA9IChjdXJyZW50VGFyZ2V0OiBUYXJnZXQpOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlcyA9IGRlbGVnYXRlLmN1cnJlbnRDaGF0TW9kZXMuZ2V0KCk7XG5cdFx0XHRjb25zdCBjdXJyZW50TW9kZSA9IGRlbGVnYXRlLmN1cnJlbnRNb2RlLmdldCgpO1xuXHRcdFx0Y29uc3QgZmlsdGVyZWRDdXN0b21Nb2RlcyA9IG1vZGVzLmN1c3RvbS5maWx0ZXIobW9kZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IG1vZGUudGFyZ2V0LmdldCgpO1xuXHRcdFx0XHRpZiAodGFyZ2V0ICE9PSBjdXJyZW50VGFyZ2V0ICYmIHRhcmdldCAhPT0gVGFyZ2V0LlVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgY3VzdG9tTW9kZXMgPSBncm91cEJ5KFxuXHRcdFx0XHRmaWx0ZXJlZEN1c3RvbU1vZGVzLFxuXHRcdFx0XHRtb2RlID0+IGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluKG1vZGUsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKSA/ICdidWlsdGluJyA6ICdjdXN0b20nKTtcblx0XHRcdC8vIEFsd2F5cyBpbmNsdWRlIHRoZSBkZWZhdWx0IFwiQWdlbnRcIiBvcHRpb24gZmlyc3Rcblx0XHRcdGNvbnN0IGNoZWNrZWQgPSBjdXJyZW50TW9kZS5pZCA9PT0gQ2hhdE1vZGUuQWdlbnQuaWQ7XG5cdFx0XHRjb25zdCBkZWZhdWx0QWN0aW9uID0geyAuLi5tYWtlQWN0aW9uKENoYXRNb2RlLkFnZW50LCBDaGF0TW9kZS5BZ2VudCksIGNoZWNrZWQgfTtcblx0XHRcdGRlZmF1bHRBY3Rpb24uY2F0ZWdvcnkgPSBidWlsdEluQ2F0ZWdvcnk7XG5cdFx0XHRjb25zdCBidWlsdEluQWN0aW9ucyA9IGN1c3RvbU1vZGVzLmJ1aWx0aW4/Lm1hcChtb2RlID0+IHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbWFrZUFjdGlvbkZyb21DdXN0b21Nb2RlKG1vZGUsIGN1cnJlbnRNb2RlKTtcblx0XHRcdFx0YWN0aW9uLmNhdGVnb3J5ID0gYnVpbHRJbkNhdGVnb3J5O1xuXHRcdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdFx0fSkgPz8gW107XG5cdFx0XHQvLyBBZGQgZmlsdGVyZWQgY3VzdG9tIG1vZGVzXG5cdFx0XHRjb25zdCBjdXN0b21BY3Rpb25zID0gY3VzdG9tTW9kZXMuY3VzdG9tPy5tYXAobW9kZSA9PiBtYWtlQWN0aW9uRnJvbUN1c3RvbU1vZGUobW9kZSwgY3VycmVudE1vZGUpKSA/PyBbXTtcblx0XHRcdHJldHVybiBbZGVmYXVsdEFjdGlvbiwgLi4uYnVpbHRJbkFjdGlvbnMsIC4uLmN1c3RvbUFjdGlvbnNdO1xuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25Qcm92aWRlcjogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uUHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVzID0gZGVsZWdhdGUuY3VycmVudENoYXRNb2Rlcy5nZXQoKTtcblx0XHRcdFx0Y29uc3QgY3VycmVudE1vZGUgPSBkZWxlZ2F0ZS5jdXJyZW50TW9kZS5nZXQoKTtcblx0XHRcdFx0Y29uc3QgYWdlbnRNb2RlID0gbW9kZXMuYnVpbHRpbi5maW5kKG1vZGUgPT4gbW9kZS5pZCA9PT0gQ2hhdE1vZGUuQWdlbnQuaWQpO1xuXG5cdFx0XHRcdGNvbnN0IG90aGVyQnVpbHRpbk1vZGVzID0gbW9kZXMuYnVpbHRpbi5maWx0ZXIobW9kZSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGUuaWQgIT09IENoYXRNb2RlLkFnZW50LmlkICYmIHNob3VsZFNob3dCdWlsdEluTW9kZShtb2RlLCBhc3NpZ25tZW50cy5nZXQoKSwgYWdlbnRNb2RlRGlzYWJsZWRWaWFQb2xpY3kpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgZmlsdGVyZWRDdXN0b21Nb2RlcyA9IG1vZGVzLmN1c3RvbS5maWx0ZXIobW9kZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluKG1vZGUsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNob3VsZFNob3dCdWlsdEluTW9kZShtb2RlLCBhc3NpZ25tZW50cy5nZXQoKSwgYWdlbnRNb2RlRGlzYWJsZWRWaWFQb2xpY3kpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIEZpbHRlciBvdXQgJ2ltcGxlbWVudCcgbW9kZSBmcm9tIHRoZSBkcm9wZG93biAtIGl0J3MgYXZhaWxhYmxlIGZvciBoYW5kb2ZmcyBidXQgbm90IHVzZXItc2VsZWN0YWJsZVxuXHRcdFx0XHRjb25zdCBjdXN0b21Nb2RlcyA9IGdyb3VwQnkoXG5cdFx0XHRcdFx0ZmlsdGVyZWRDdXN0b21Nb2Rlcyxcblx0XHRcdFx0XHRtb2RlID0+IGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluKG1vZGUsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKSA/ICdidWlsdGluJyA6ICdjdXN0b20nKTtcblxuXHRcdFx0XHRjb25zdCBjdXN0b21CdWlsdGluTW9kZUFjdGlvbnMgPSBjdXN0b21Nb2Rlcy5idWlsdGluPy5tYXAobW9kZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbWFrZUFjdGlvbkZyb21DdXN0b21Nb2RlKG1vZGUsIGN1cnJlbnRNb2RlKTtcblx0XHRcdFx0XHRhY3Rpb24uY2F0ZWdvcnkgPSBhZ2VudE1vZGVEaXNhYmxlZFZpYVBvbGljeSA/IHBvbGljeURpc2FibGVkQ2F0ZWdvcnkgOiBidWlsdEluQ2F0ZWdvcnk7XG5cdFx0XHRcdFx0cmV0dXJuIGFjdGlvbjtcblx0XHRcdFx0fSkgPz8gW107XG5cdFx0XHRcdGN1c3RvbUJ1aWx0aW5Nb2RlQWN0aW9ucy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG5cdFx0XHRcdGNvbnN0IGN1c3RvbU1vZGVBY3Rpb25zID0gY3VzdG9tTW9kZXMuY3VzdG9tPy5tYXAobW9kZSA9PiBtYWtlQWN0aW9uRnJvbUN1c3RvbU1vZGUobW9kZSwgY3VycmVudE1vZGUpKSA/PyBbXTtcblx0XHRcdFx0Y3VzdG9tTW9kZUFjdGlvbnMuc29ydCgoYSwgYikgPT4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpKTtcblxuXHRcdFx0XHRjb25zdCBvcmRlcmVkTW9kZXMgPSBjb2FsZXNjZShbXG5cdFx0XHRcdFx0YWdlbnRNb2RlICYmIG1ha2VBY3Rpb24oYWdlbnRNb2RlLCBjdXJyZW50TW9kZSksXG5cdFx0XHRcdFx0Li4ub3RoZXJCdWlsdGluTW9kZXMubWFwKG1vZGUgPT4gbW9kZSAmJiBtYWtlQWN0aW9uKG1vZGUsIGN1cnJlbnRNb2RlKSksXG5cdFx0XHRcdFx0Li4uY3VzdG9tQnVpbHRpbk1vZGVBY3Rpb25zLFxuXHRcdFx0XHRcdC4uLmN1c3RvbU1vZGVBY3Rpb25zXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRyZXR1cm4gb3JkZXJlZE1vZGVzO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBkeW5hbWljQWN0aW9uUHJvdmlkZXI6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50VGFyZ2V0ID0gZ2V0Q3VzdG9tQWdlbnRUYXJnZXQoKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRUYXJnZXQgIT09IFRhcmdldC5VbmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZ2V0QWN0aW9uc0ZvckN1c3RvbUFnZW50VGFyZ2V0KGN1cnJlbnRUYXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhY3Rpb25Qcm92aWRlci5nZXRBY3Rpb25zKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVQaWNrZXJBY3Rpb25XaWRnZXRPcHRpb25zOiBPbWl0PElBY3Rpb25XaWRnZXREcm9wZG93bk9wdGlvbnMsICdsYWJlbCcgfCAnbGFiZWxSZW5kZXJlcic+ID0ge1xuXHRcdFx0YWN0aW9uUHJvdmlkZXI6IGR5bmFtaWNBY3Rpb25Qcm92aWRlcixcblx0XHRcdGFjdGlvbkJhckFjdGlvblByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0TW9kZVBpY2tlckFjdGlvbkJhckFjdGlvbnMoKVxuXHRcdFx0fSxcblx0XHRcdHNob3dJdGVtS2V5YmluZGluZ3M6IHRydWUsXG5cdFx0XHRyZXBvcnRlcjogeyBpZDogJ0NoYXRNb2RlUGlja2VyJywgbmFtZTogJ0NoYXRNb2RlUGlja2VyJywgaW5jbHVkZU9wdGlvbnM6IHRydWUgfSxcblx0XHR9O1xuXG5cdFx0c3VwZXIoYWN0aW9uLCBtb2RlUGlja2VyQWN0aW9uV2lkZ2V0T3B0aW9ucywgcGlja2VyT3B0aW9ucywgYWN0aW9uV2lkZ2V0U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdC8vIExpc3RlbiB0byBjaGFuZ2VzIGluIHRoZSBjdXJyZW50IG1vZGUgYW5kIGl0cyBwcm9wZXJ0aWVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5kZWxlZ2F0ZS5jdXJyZW50TW9kZS5yZWFkKHJlYWRlcikubGFiZWwucmVhZChyZWFkZXIpOyAvLyB1c2UgdGhlIHJlYWRlciBzbyBhdXRvcnVuIHRyYWNrcyBpdFxuXHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0YXNzaWdubWVudFNlcnZpY2UuZ2V0VHJlYXRtZW50KCdjaGF0LnNob3dPbGRBc2tNb2RlJykudGhlbihzaG93T2xkQXNrTW9kZSA9PiB7XG5cdFx0XHRhc3NpZ25tZW50cy5zZXQoeyBzaG93T2xkQXNrTW9kZTogc2hvd09sZEFza01vZGUgPT09ICdlbmFibGVkJyB9LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFzc2lnbm1lbnRTZXJ2aWNlLm9uRGlkUmVmZXRjaEFzc2lnbm1lbnRzKGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2lnbm1lbnRzLnNldCh7IHNob3dPbGRBc2tNb2RlOiBhd2FpdCBhc3NpZ25tZW50U2VydmljZS5nZXRUcmVhdG1lbnQoJ2NoYXQuc2hvd09sZEFza01vZGUnKSA9PT0gJ2VuYWJsZWQnIH0sIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlUGlja2VyQWN0aW9uQmFyQWN0aW9ucygpOiBJQWN0aW9uW10ge1xuXHRcdGNvbnN0IG1lbnVBY3Rpb25zID0gdGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5DaGF0TW9kZVBpY2tlciwgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgbWVudUNvbnRyaWJ1dGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhtZW51QWN0aW9ucy5nZXRBY3Rpb25zKHsgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSB9KSk7XG5cdFx0bWVudUFjdGlvbnMuZGlzcG9zZSgpO1xuXG5cdFx0cmV0dXJuIG1lbnVDb250cmlidXRpb25zO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC1tb2RlLXBpY2tlci1pdGVtJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyTGFiZWwoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB8IG51bGwge1xuXHRcdHRoaXMuc2V0QXJpYUxhYmVsQXR0cmlidXRlcyhlbGVtZW50KTtcblxuXHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gdGhpcy5kZWxlZ2F0ZS5jdXJyZW50TW9kZS5nZXQoKTtcblx0XHRjb25zdCBzdGF0ZSA9IGN1cnJlbnRNb2RlLmxhYmVsLmdldCgpO1xuXHRcdGxldCBpY29uID0gY3VycmVudE1vZGUuaWNvbi5nZXQoKTtcblxuXHRcdC8vIEV2ZXJ5IGJ1aWx0LWluIG1vZGUgc2hvdWxkIGhhdmUgYW4gaWNvbi4gLy8gVE9ETzogdGhpcyBzaG91bGQgYmUgcHJvdmlkZWQgYnkgdGhlIG1vZGUgaXRzZWxmXG5cdFx0aWYgKCFpY29uICYmIGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluKGN1cnJlbnRNb2RlLCB0aGlzLl9wcm9kdWN0U2VydmljZSkpIHtcblx0XHRcdGljb24gPSBidWlsdGluRGVmYXVsdEljb24oY3VycmVudE1vZGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudHMgPSBbXTtcblx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLnBpY2tlck9wdGlvbnMuY29tcGFjdC5nZXQoKTtcblx0XHRpZiAoaWNvbikge1xuXHRcdFx0bGFiZWxFbGVtZW50cy5wdXNoKC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGAkKCR7aWNvbi5pZH0pYCkpO1xuXHRcdH1cblx0XHRpZiAoIWNvbGxhcHNlZCB8fCAhaWNvbikge1xuXHRcdFx0bGFiZWxFbGVtZW50cy5wdXNoKGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJywgdW5kZWZpbmVkLCBzdGF0ZSkpO1xuXHRcdH1cblxuXHRcdGRvbS5yZXNldChlbGVtZW50LCAuLi5sYWJlbEVsZW1lbnRzKTtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNb2RlQ29uc2lkZXJlZEJ1aWx0SW4obW9kZTogSUNoYXRNb2RlLCBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlKTogYm9vbGVhbiB7XG5cdGlmIChtb2RlLmlzQnVpbHRpbikge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdC8vIE5vdCBidWlsdC1pbiBpZiBub3QgZnJvbSB0aGUgYnVpbHQtaW4gY2hhdCBleHRlbnNpb25cblx0aWYgKG1vZGUuc291cmNlPy5zdG9yYWdlICE9PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgY2hhdEV4dGVuc2lvbklkID0gcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkO1xuXHRpZiAoIWNoYXRFeHRlbnNpb25JZCB8fCBtb2RlLnNvdXJjZS5leHRlbnNpb25JZC52YWx1ZSAhPT0gY2hhdEV4dGVuc2lvbklkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdC8vIE9yZ2FuaXphdGlvbi1wcm92aWRlZCBhZ2VudHMgKHVuZGVyIC9naXRodWIvIHBhdGgpIGFyZSBhbHNvIG5vdCBjb25zaWRlcmVkIGJ1aWx0LWluXG5cdGNvbnN0IG1vZGVVcmkgPSBtb2RlLnVyaT8uZ2V0KCk7XG5cdGlmICghbW9kZVVyaSkge1xuXHRcdC8vIElmIHNvbWVob3cgdGhlcmUgaXMgbm8gVVJJLCBidXQgaXQncyBmcm9tIHRoZSBidWlsdC1pbiBjaGF0IGV4dGVuc2lvbiwgY29uc2lkZXIgaXQgYnVpbHQtaW5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gIWlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZShtb2RlVXJpLCBtb2RlLnNvdXJjZS5leHRlbnNpb25JZCwgcHJvZHVjdFNlcnZpY2UpO1xufVxuXG5mdW5jdGlvbiBzaG91bGRTaG93QnVpbHRJbk1vZGUobW9kZTogSUNoYXRNb2RlLCBhc3NpZ25tZW50czogeyBzaG93T2xkQXNrTW9kZTogYm9vbGVhbiB9LCBhZ2VudE1vZGVEaXNhYmxlZFZpYVBvbGljeTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHQvLyBUaGUgYnVpbHQtaW4gXCJFZGl0XCIgbW9kZSBpcyBkZXByZWNhdGVkLCBidXQgc3RpbGwgc2hvd24gd2hlbiBhZ2VudCBtb2RlIGlzIGRpc2FibGVkIHZpYSBwb2xpY3kuXG5cdGlmIChtb2RlLmlkID09PSBDaGF0TW9kZS5FZGl0LmlkKSB7XG5cdFx0cmV0dXJuIGFnZW50TW9kZURpc2FibGVkVmlhUG9saWN5O1xuXHR9XG5cblx0Ly8gVGhlIFwiQXNrXCIgbW9kZSBpcyBhIHNwZWNpYWwgY2FzZSAtIHdlIHdhbnQgdG8gc2hvdyBlaXRoZXIgdGhlIG9sZCBvciBuZXcgdmVyc2lvbiBiYXNlZCBvbiB0aGUgYXNzaWdubWVudCBvciBhZ2VudCBkaXNhYmxlbWVudCwgYnV0IG5vdCBib3RoXG5cdC8vIFdlIHN0aWxsIHN1cHBvcnQgdGhlIG9sZCBcIkFza1wiIG1vZGUgZm9yIGNvbnZlcnNhdGlvbnMgdGhhdCBhbHJlYWR5IHVzZSBpdC5cblx0aWYgKG1vZGUuaWQgPT09IENoYXRNb2RlLkFzay5pZCB8fCBtb2RlLm5hbWUuZ2V0KCkudG9Mb3dlckNhc2UoKSA9PT0gJ2FzaycpIHtcblx0XHRpZiAobW9kZS5pZCA9PT0gQ2hhdE1vZGUuQXNrLmlkKSB7XG5cdFx0XHRyZXR1cm4gYXNzaWdubWVudHMuc2hvd09sZEFza01vZGUgfHwgYWdlbnRNb2RlRGlzYWJsZWRWaWFQb2xpY3k7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAhKGFzc2lnbm1lbnRzLnNob3dPbGRBc2tNb2RlIHx8IGFnZW50TW9kZURpc2FibGVkVmlhUG9saWN5KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxTQUFzQix1QkFBdUI7QUFDdEQsU0FBUyxpQkFBaUI7QUFF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
