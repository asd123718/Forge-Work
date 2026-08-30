import { toAction } from "../../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { localize } from "../../../../../../../nls.js";
import { ActionListItemKind } from "../../../../../../../platform/actionWidget/browser/actionList.js";
import { ChatEntitlement } from "../../../../../../services/chat/common/chatEntitlementService.js";
import { ILanguageModelChatMetadata } from "../../../../common/languageModels.js";
import { buildModelToProviderGroupMap, createModelAction, createModelItem, createPinAction, createUnavailableModelItem, getProviderGroupForModel, getProviderGroupKey, getUnavailableReason, isVersionAtLeast } from "./modelPickerItemPrimitives.js";
import { isAutoModel } from "./modelPickerPresentation.js";
const ModelPickerSection = {
  Other: "other"
};
const RESTRICTED_MODE_TRUST_ACTION_ID = "restrictedModeTrust";
const SETUP_REQUIRED_SIGN_IN_ACTION_ID = "setupRequiredSignIn";
function createSyntheticAutoItem() {
  return createModelItem({
    id: "auto",
    enabled: true,
    checked: true,
    class: void 0,
    tooltip: localize("chat.modelPicker.auto", "Auto"),
    label: localize("chat.modelPicker.auto", "Auto"),
    run: () => {
    }
  });
}
function buildUnavailableStateItems(options) {
  const { restrictedMode, setupRequired, showAutoModel } = options.presentation;
  if (restrictedMode) {
    const enabled = !!options.actions.onRequestTrust;
    return [
      { kind: ActionListItemKind.Header, label: localize("chat.modelPicker.restrictedMode", "Models unavailable while in Restricted mode") },
      {
        item: {
          id: RESTRICTED_MODE_TRUST_ACTION_ID,
          enabled,
          checked: false,
          class: void 0,
          tooltip: localize("chat.modelPicker.restrictedMode.trustTooltip", "Trust the workspace to enable models."),
          label: localize("chat.modelPicker.restrictedMode.trust", "Trust Workspace to enable models..."),
          run: () => options.actions.onRequestTrust?.()
        },
        kind: ActionListItemKind.Action,
        label: localize("chat.modelPicker.restrictedMode.trust", "Trust Workspace to enable models..."),
        group: { title: "", icon: ThemeIcon.fromId(Codicon.workspaceTrusted.id) },
        disabled: !enabled,
        hideIcon: false
      }
    ];
  }
  if (setupRequired) {
    const enabled = !!options.actions.onRequestSetup;
    const items = [
      { kind: ActionListItemKind.Header, label: localize("chat.modelPicker.setupRequired", "Sign in to use Copilot") },
      {
        item: {
          id: SETUP_REQUIRED_SIGN_IN_ACTION_ID,
          enabled,
          checked: false,
          class: void 0,
          tooltip: localize("chat.modelPicker.setupRequired.signInTooltip", "Sign in to GitHub Copilot to choose a model."),
          label: localize("chat.modelPicker.setupRequired.signIn", "Sign in to use Copilot..."),
          run: () => options.actions.onRequestSetup?.()
        },
        kind: ActionListItemKind.Action,
        label: localize("chat.modelPicker.setupRequired.signIn", "Sign in to use Copilot..."),
        group: { title: "", icon: ThemeIcon.fromId(Codicon.signIn.id) },
        disabled: !enabled,
        hideIcon: false
      }
    ];
    if (options.presentation.showManageModelsInSetupRequired && options.manageModelsAction) {
      items.push(
        { kind: ActionListItemKind.Separator },
        {
          item: options.manageModelsAction,
          kind: ActionListItemKind.Action,
          label: options.manageModelsAction.label,
          group: { title: "", icon: Codicon.blank },
          hideIcon: false,
          showAlways: true
        }
      );
    }
    return items;
  }
  if (options.models.length > 0) {
    return void 0;
  }
  if (showAutoModel) {
    return void 0;
  }
  const entitlement = options.chatEntitlementService.entitlement;
  const canUpgrade = entitlement === ChatEntitlement.Free || entitlement === ChatEntitlement.EDU;
  const description = canUpgrade ? new MarkdownString(localize("chat.modelPicker.upgradeLink", '[Upgrade](command:workbench.action.chat.upgradePlan " ")'), { isTrusted: true }) : void 0;
  const hover = canUpgrade ? new MarkdownString("", { isTrusted: true, supportThemeIcons: true }) : void 0;
  hover?.appendMarkdown(localize("chat.modelPicker.upgradeHover", '[Upgrade to GitHub Copilot Pro](command:workbench.action.chat.upgradePlan " ") to use the best models.'));
  return [{
    item: {
      id: "noModels",
      enabled: false,
      checked: false,
      class: void 0,
      tooltip: localize("chat.modelPicker.noModels", "No models available"),
      label: localize("chat.modelPicker.noModels", "No models available"),
      run: () => {
      }
    },
    kind: ActionListItemKind.Action,
    label: localize("chat.modelPicker.noModels", "No models available"),
    description,
    group: { title: "", icon: ThemeIcon.fromId(Codicon.blank.id) },
    disabled: true,
    hideIcon: false,
    hover: hover ? { content: hover } : void 0
  }];
}
function buildFlatModelItems(options) {
  const items = [];
  if (options.models.length === 0 && options.presentation.showAutoModel) {
    items.push(createSyntheticAutoItem());
  }
  const autoModel = options.models.find(isAutoModel);
  if (autoModel) {
    const { action, ariaDescription } = createModelAction(autoModel, options.selectedModelId, options.actions.onSelect);
    items.push(createModelItem(action, autoModel, options.openerService, void 0, options.presentation.isUBB, ariaDescription));
  }
  const sortedModels = options.models.filter((model) => model !== autoModel).sort((left, right) => left.metadata.vendor.localeCompare(right.metadata.vendor) || left.metadata.name.localeCompare(right.metadata.name));
  for (const model of sortedModels) {
    const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect);
    items.push(createModelItem(action, model, options.openerService, void 0, options.presentation.isUBB, ariaDescription, void 0, options.actions.onConfigure));
  }
  return items;
}
function createGroupedContext(options) {
  const modelToGroup = buildModelToProviderGroupMap(options.languageModelsService);
  const allModels = new Map(options.models.map((model) => [model.identifier, model]));
  const modelsByMetadataId = new Map(options.models.map((model) => [model.metadata.id, model]));
  const placed = /* @__PURE__ */ new Set();
  return {
    options,
    items: [],
    modelToGroup,
    resolveModel: (id) => allModels.get(id) ?? modelsByMetadataId.get(id),
    placed,
    showGroupLabel: new Set(options.models.map((model) => {
      const group = getProviderGroupForModel(model, modelToGroup, options.languageModelsService);
      return getProviderGroupKey(group.vendor, group.groupName);
    })).size > 1,
    makePinAction: (model) => options.actions.onTogglePin ? createPinAction(model.identifier, options.pinnedModelIds.includes(model.identifier), options.actions.onTogglePin) : void 0,
    markPlaced: (identifierOrId) => placed.add(identifierOrId)
  };
}
function appendLeadingModels(context) {
  const { options, items } = context;
  const autoModel = options.models.find(isAutoModel);
  if (!autoModel && options.models.length === 0 && options.presentation.showAutoModel) {
    items.push(createSyntheticAutoItem());
  }
  if (autoModel) {
    context.markPlaced(autoModel.identifier);
    const { action, ariaDescription } = createModelAction(autoModel, options.selectedModelId, options.actions.onSelect);
    items.push(createModelItem(action, autoModel, options.openerService, void 0, options.presentation.isUBB, ariaDescription));
  }
  for (const model of options.models) {
    if (!context.placed.has(model.identifier) && ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)) {
      context.markPlaced(model.identifier);
      const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect);
      items.push(createModelItem(action, model, options.openerService, void 0, options.presentation.isUBB, ariaDescription));
    }
  }
  return autoModel;
}
function appendPinnedModels(context) {
  const { options, items } = context;
  const pinnedSet = new Set(options.pinnedModelIds);
  const pinnedModels = [];
  for (const id of options.pinnedModelIds) {
    const model = context.resolveModel(id);
    if (!context.placed.has(id) && model && !context.placed.has(model.identifier)) {
      context.markPlaced(model.identifier);
      pinnedModels.push(model);
    }
  }
  pinnedModels.sort((left, right) => {
    const leftGroup = getProviderGroupForModel(left, context.modelToGroup, options.languageModelsService);
    const rightGroup = getProviderGroupForModel(right, context.modelToGroup, options.languageModelsService);
    return leftGroup.groupName.localeCompare(rightGroup.groupName) || left.metadata.name.localeCompare(right.metadata.name);
  });
  if (pinnedModels.length > 0) {
    items.push({ kind: ActionListItemKind.Separator, label: localize("chat.modelPicker.pinned", "Pinned") });
    for (const model of pinnedModels) {
      const groupLabel = context.showGroupLabel ? getProviderGroupForModel(model, context.modelToGroup, options.languageModelsService).groupName : void 0;
      const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect, void 0, context.showGroupLabel);
      items.push(createModelItem(action, model, options.openerService, groupLabel, options.presentation.isUBB, ariaDescription, context.makePinAction(model), options.actions.onConfigure));
    }
  }
  return pinnedSet;
}
function appendPromotedModels(context, autoModel, pinnedSet) {
  const { options, items } = context;
  const promoted = [];
  const tryPlace = (id) => {
    if (context.placed.has(id)) {
      return false;
    }
    const model = context.resolveModel(id);
    if (model && !context.placed.has(model.identifier)) {
      context.markPlaced(model.identifier);
      const entry2 = options.controlModels[model.metadata.id];
      if (entry2?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, entry2.minVSCodeVersion)) {
        promoted.push({ kind: "unavailable", id: model.metadata.id, entry: entry2, reason: "update" });
      } else {
        promoted.push({ kind: "available", model });
      }
      return true;
    }
    const entry = options.controlModels[id];
    if (!model && entry && !entry.exists) {
      context.markPlaced(id);
      promoted.push({ kind: "unavailable", id, entry, reason: getUnavailableReason(entry, options.chatEntitlementService, options.currentVSCodeVersion) });
      return true;
    }
    return false;
  };
  if (options.selectedModelId && options.selectedModelId !== autoModel?.identifier) {
    tryPlace(options.selectedModelId);
  }
  for (const id of options.recentModelIds.filter((id2) => !pinnedSet.has(id2)).slice(0, 3)) {
    tryPlace(id);
  }
  if (options.presentation.showFeatured) {
    for (const model of options.models) {
      if (model.metadata.promo && !ILanguageModelChatMetadata.hasPromoDiscount(model.metadata)) {
        tryPlace(model.identifier);
      }
    }
    for (const [entryId, entry] of Object.entries(options.controlModels)) {
      if (!entry.featured || context.placed.has(entryId)) {
        continue;
      }
      const model = context.resolveModel(entryId);
      if (model && !context.placed.has(model.identifier)) {
        if (entry.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, entry.minVSCodeVersion)) {
          if (options.presentation.showUnavailableFeatured) {
            context.markPlaced(model.identifier);
            promoted.push({ kind: "unavailable", id: entryId, entry, reason: "update" });
          }
        } else {
          context.markPlaced(model.identifier);
          promoted.push({ kind: "available", model });
        }
      } else if (!model && !entry.exists && options.presentation.showUnavailableFeatured) {
        context.markPlaced(entryId);
        promoted.push({ kind: "unavailable", id: entryId, entry, reason: getUnavailableReason(entry, options.chatEntitlementService, options.currentVSCodeVersion) });
      }
    }
  }
  if (promoted.length === 0) {
    return;
  }
  if (items.length > 0) {
    items.push({ kind: ActionListItemKind.Separator });
  }
  promoted.sort((left, right) => {
    const availability = (left.kind === "available" ? 0 : 1) - (right.kind === "available" ? 0 : 1);
    const leftName = left.kind === "available" ? left.model.metadata.name : left.entry.label;
    const rightName = right.kind === "available" ? right.model.metadata.name : right.entry.label;
    return availability || leftName.localeCompare(rightName);
  });
  for (const item of promoted) {
    if (item.kind === "available") {
      const groupLabel = context.showGroupLabel ? getProviderGroupForModel(item.model, context.modelToGroup, options.languageModelsService).groupName : void 0;
      const { action, ariaDescription } = createModelAction(item.model, options.selectedModelId, options.actions.onSelect, void 0, context.showGroupLabel);
      items.push(createModelItem(action, item.model, options.openerService, groupLabel, options.presentation.isUBB, ariaDescription, context.makePinAction(item.model), options.actions.onConfigure));
    } else {
      items.push(createUnavailableModelItem(item.id, item.entry, item.reason, options.manageSettingsUrl, options.updateStateType, options.chatEntitlementService));
    }
  }
}
function appendOtherModels(context) {
  const { options, items } = context;
  const otherModels = options.models.filter((model) => !context.placed.has(model.identifier));
  if (otherModels.length === 0) {
    return false;
  }
  if (items.length > 0) {
    items.push({ kind: ActionListItemKind.Separator });
  }
  const toolbarActions = options.manageModelsAction ? [toAction({ id: options.manageModelsAction.id, label: options.manageModelsAction.tooltip ?? options.manageModelsAction.label, class: ThemeIcon.asClassName(Codicon.gear), run: () => options.manageModelsAction.run() })] : void 0;
  items.push({
    item: { id: "otherModels", enabled: true, checked: false, class: void 0, tooltip: localize("chat.modelPicker.otherModels", "Other Models"), label: localize("chat.modelPicker.otherModels", "Other Models"), run: () => {
    } },
    kind: ActionListItemKind.Action,
    label: localize("chat.modelPicker.otherModels", "Other Models"),
    group: { title: "", icon: Codicon.chevronDown },
    hideIcon: false,
    section: ModelPickerSection.Other,
    isSectionToggle: true,
    toolbarActions,
    className: "chat-model-picker-section-toggle"
  });
  const groups = /* @__PURE__ */ new Map();
  for (const model of otherModels) {
    const info = getProviderGroupForModel(model, context.modelToGroup, options.languageModelsService);
    const key = getProviderGroupKey(info.vendor, info.groupName);
    const bucket = groups.get(key) ?? { vendor: info.vendor, groupName: info.groupName, models: [] };
    bucket.models.push(model);
    groups.set(key, bucket);
  }
  const sortedGroups = [...groups.values()].sort((left, right) => {
    if (left.vendor === "copilot" && right.vendor !== "copilot") {
      return -1;
    }
    if (right.vendor === "copilot" && left.vendor !== "copilot") {
      return 1;
    }
    return left.groupName.localeCompare(right.groupName);
  });
  const showHeaders = sortedGroups.length > 1;
  for (const group of sortedGroups) {
    if (showHeaders) {
      items.push({ kind: ActionListItemKind.Separator, label: group.groupName, section: ModelPickerSection.Other });
    }
    group.models.sort((left, right) => {
      const leftEntry = options.controlModels[left.metadata.id] ?? options.controlModels[left.identifier];
      const rightEntry = options.controlModels[right.metadata.id] ?? options.controlModels[right.identifier];
      const leftUnavailable = leftEntry?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, leftEntry.minVSCodeVersion) ? 1 : 0;
      const rightUnavailable = rightEntry?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, rightEntry.minVSCodeVersion) ? 1 : 0;
      return leftUnavailable - rightUnavailable || left.metadata.name.localeCompare(right.metadata.name);
    });
    for (const model of group.models) {
      const entry = options.controlModels[model.metadata.id] ?? options.controlModels[model.identifier];
      if (entry?.minVSCodeVersion && !isVersionAtLeast(options.currentVSCodeVersion, entry.minVSCodeVersion)) {
        items.push(createUnavailableModelItem(model.metadata.id, entry, "update", options.manageSettingsUrl, options.updateStateType, options.chatEntitlementService, ModelPickerSection.Other));
      } else {
        const { action, ariaDescription } = createModelAction(model, options.selectedModelId, options.actions.onSelect, ModelPickerSection.Other, showHeaders);
        items.push(createModelItem(action, model, options.openerService, void 0, options.presentation.isUBB, ariaDescription, context.makePinAction(model), options.actions.onConfigure));
      }
    }
  }
  return true;
}
function buildGroupedModelItems(options) {
  const context = createGroupedContext(options);
  const autoModel = appendLeadingModels(context);
  const pinnedSet = appendPinnedModels(context);
  appendPromotedModels(context, autoModel, pinnedSet);
  const hasOtherModels = appendOtherModels(context);
  if (options.manageModelsAction && !hasOtherModels) {
    context.items.push({ kind: ActionListItemKind.Separator });
    context.items.push({
      item: options.manageModelsAction,
      kind: ActionListItemKind.Action,
      label: options.manageModelsAction.label,
      group: { title: "", icon: Codicon.blank },
      hideIcon: false,
      showAlways: true
    });
  }
  return context.items;
}
export {
  ModelPickerSection,
  RESTRICTED_MODE_TRUST_ACTION_ID,
  SETUP_REQUIRED_SIGN_IN_ACTION_ID,
  buildFlatModelItems,
  buildGroupedModelItems,
  buildUnavailableStateItems
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXG1vZGVsUGlja2VyXFxtb2RlbFBpY2tlckl0ZW1TZWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsQ29udHJvbEVudHJ5LCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IGJ1aWxkTW9kZWxUb1Byb3ZpZGVyR3JvdXBNYXAsIGNyZWF0ZU1vZGVsQWN0aW9uLCBjcmVhdGVNb2RlbEl0ZW0sIGNyZWF0ZVBpbkFjdGlvbiwgY3JlYXRlVW5hdmFpbGFibGVNb2RlbEl0ZW0sIGdldFByb3ZpZGVyR3JvdXBGb3JNb2RlbCwgZ2V0UHJvdmlkZXJHcm91cEtleSwgZ2V0VW5hdmFpbGFibGVSZWFzb24sIGlzVmVyc2lvbkF0TGVhc3QsIFByb3ZpZGVyR3JvdXBLZXkgfSBmcm9tICcuL21vZGVsUGlja2VySXRlbVByaW1pdGl2ZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQnVpbGRNb2RlbFBpY2tlckl0ZW1zT3B0aW9ucyB9IGZyb20gJy4vbW9kZWxQaWNrZXJJdGVtVHlwZXMuanMnO1xuaW1wb3J0IHsgaXNBdXRvTW9kZWwgfSBmcm9tICcuL21vZGVsUGlja2VyUHJlc2VudGF0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IE1vZGVsUGlja2VyU2VjdGlvbiA9IHtcblx0T3RoZXI6ICdvdGhlcicsXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgUkVTVFJJQ1RFRF9NT0RFX1RSVVNUX0FDVElPTl9JRCA9ICdyZXN0cmljdGVkTW9kZVRydXN0JztcbmV4cG9ydCBjb25zdCBTRVRVUF9SRVFVSVJFRF9TSUdOX0lOX0FDVElPTl9JRCA9ICdzZXR1cFJlcXVpcmVkU2lnbkluJztcblxuZnVuY3Rpb24gY3JlYXRlU3ludGhldGljQXV0b0l0ZW0oKTogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj4ge1xuXHRyZXR1cm4gY3JlYXRlTW9kZWxJdGVtKHtcblx0XHRpZDogJ2F1dG8nLFxuXHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmF1dG8nLCBcIkF1dG9cIiksXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLmF1dG8nLCBcIkF1dG9cIiksXG5cdFx0cnVuOiAoKSA9PiB7IH0sXG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRVbmF2YWlsYWJsZVN0YXRlSXRlbXMob3B0aW9uczogSUJ1aWxkTW9kZWxQaWNrZXJJdGVtc09wdGlvbnMpOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgeyByZXN0cmljdGVkTW9kZSwgc2V0dXBSZXF1aXJlZCwgc2hvd0F1dG9Nb2RlbCB9ID0gb3B0aW9ucy5wcmVzZW50YXRpb247XG5cdGlmIChyZXN0cmljdGVkTW9kZSkge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSAhIW9wdGlvbnMuYWN0aW9ucy5vblJlcXVlc3RUcnVzdDtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIucmVzdHJpY3RlZE1vZGUnLCBcIk1vZGVscyB1bmF2YWlsYWJsZSB3aGlsZSBpbiBSZXN0cmljdGVkIG1vZGVcIikgfSxcblx0XHRcdHtcblx0XHRcdFx0aXRlbToge1xuXHRcdFx0XHRcdGlkOiBSRVNUUklDVEVEX01PREVfVFJVU1RfQUNUSU9OX0lELFxuXHRcdFx0XHRcdGVuYWJsZWQsXG5cdFx0XHRcdFx0Y2hlY2tlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5yZXN0cmljdGVkTW9kZS50cnVzdFRvb2x0aXAnLCBcIlRydXN0IHRoZSB3b3Jrc3BhY2UgdG8gZW5hYmxlIG1vZGVscy5cIiksXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLnJlc3RyaWN0ZWRNb2RlLnRydXN0JywgXCJUcnVzdCBXb3Jrc3BhY2UgdG8gZW5hYmxlIG1vZGVscy4uLlwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IG9wdGlvbnMuYWN0aW9ucy5vblJlcXVlc3RUcnVzdD8uKCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5yZXN0cmljdGVkTW9kZS50cnVzdCcsIFwiVHJ1c3QgV29ya3NwYWNlIHRvIGVuYWJsZSBtb2RlbHMuLi5cIiksXG5cdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLndvcmtzcGFjZVRydXN0ZWQuaWQpIH0sXG5cdFx0XHRcdGRpc2FibGVkOiAhZW5hYmxlZCxcblx0XHRcdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cdGlmIChzZXR1cFJlcXVpcmVkKSB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9ICEhb3B0aW9ucy5hY3Rpb25zLm9uUmVxdWVzdFNldHVwO1xuXHRcdGNvbnN0IGl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdID0gW1xuXHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyLCBsYWJlbDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIuc2V0dXBSZXF1aXJlZCcsIFwiU2lnbiBpbiB0byB1c2UgQ29waWxvdFwiKSB9LFxuXHRcdFx0e1xuXHRcdFx0XHRpdGVtOiB7XG5cdFx0XHRcdFx0aWQ6IFNFVFVQX1JFUVVJUkVEX1NJR05fSU5fQUNUSU9OX0lELFxuXHRcdFx0XHRcdGVuYWJsZWQsXG5cdFx0XHRcdFx0Y2hlY2tlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5zZXR1cFJlcXVpcmVkLnNpZ25JblRvb2x0aXAnLCBcIlNpZ24gaW4gdG8gR2l0SHViIENvcGlsb3QgdG8gY2hvb3NlIGEgbW9kZWwuXCIpLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5zZXR1cFJlcXVpcmVkLnNpZ25JbicsIFwiU2lnbiBpbiB0byB1c2UgQ29waWxvdC4uLlwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IG9wdGlvbnMuYWN0aW9ucy5vblJlcXVlc3RTZXR1cD8uKCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5zZXR1cFJlcXVpcmVkLnNpZ25JbicsIFwiU2lnbiBpbiB0byB1c2UgQ29waWxvdC4uLlwiKSxcblx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc2lnbkluLmlkKSB9LFxuXHRcdFx0XHRkaXNhYmxlZDogIWVuYWJsZWQsXG5cdFx0XHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XTtcblx0XHRpZiAob3B0aW9ucy5wcmVzZW50YXRpb24uc2hvd01hbmFnZU1vZGVsc0luU2V0dXBSZXF1aXJlZCAmJiBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbikge1xuXHRcdFx0aXRlbXMucHVzaChcblx0XHRcdFx0eyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpdGVtOiBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbixcblx0XHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRcdGxhYmVsOiBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb246IENvZGljb24uYmxhbmsgfSxcblx0XHRcdFx0XHRoaWRlSWNvbjogZmFsc2UsXG5cdFx0XHRcdFx0c2hvd0Fsd2F5czogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIGl0ZW1zO1xuXHR9XG5cdGlmIChvcHRpb25zLm1vZGVscy5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoc2hvd0F1dG9Nb2RlbCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZW50aXRsZW1lbnQgPSBvcHRpb25zLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cdGNvbnN0IGNhblVwZ3JhZGUgPSBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUgfHwgZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5FRFU7XG5cdGNvbnN0IGRlc2NyaXB0aW9uID0gY2FuVXBncmFkZVxuXHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLnVwZ3JhZGVMaW5rJywgXCJbVXBncmFkZV0oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4gXFxcIiBcXFwiKVwiKSwgeyBpc1RydXN0ZWQ6IHRydWUgfSlcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3QgaG92ZXIgPSBjYW5VcGdyYWRlID8gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSkgOiB1bmRlZmluZWQ7XG5cdGhvdmVyPy5hcHBlbmRNYXJrZG93bihsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci51cGdyYWRlSG92ZXInLCBcIltVcGdyYWRlIHRvIEdpdEh1YiBDb3BpbG90IFByb10oY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4gXFxcIiBcXFwiKSB0byB1c2UgdGhlIGJlc3QgbW9kZWxzLlwiKSk7XG5cdHJldHVybiBbe1xuXHRcdGl0ZW06IHtcblx0XHRcdGlkOiAnbm9Nb2RlbHMnLFxuXHRcdFx0ZW5hYmxlZDogZmFsc2UsXG5cdFx0XHRjaGVja2VkOiBmYWxzZSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5ub01vZGVscycsIFwiTm8gbW9kZWxzIGF2YWlsYWJsZVwiKSxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5ub01vZGVscycsIFwiTm8gbW9kZWxzIGF2YWlsYWJsZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4geyB9LFxuXHRcdH0sXG5cdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYXQubW9kZWxQaWNrZXIubm9Nb2RlbHMnLCBcIk5vIG1vZGVscyBhdmFpbGFibGVcIiksXG5cdFx0ZGVzY3JpcHRpb24sXG5cdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uYmxhbmsuaWQpIH0sXG5cdFx0ZGlzYWJsZWQ6IHRydWUsXG5cdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdGhvdmVyOiBob3ZlciA/IHsgY29udGVudDogaG92ZXIgfSA6IHVuZGVmaW5lZCxcblx0fV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEZsYXRNb2RlbEl0ZW1zKG9wdGlvbnM6IElCdWlsZE1vZGVsUGlja2VySXRlbXNPcHRpb25zKTogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbj5bXSB7XG5cdGNvbnN0IGl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdID0gW107XG5cdGlmIChvcHRpb25zLm1vZGVscy5sZW5ndGggPT09IDAgJiYgb3B0aW9ucy5wcmVzZW50YXRpb24uc2hvd0F1dG9Nb2RlbCkge1xuXHRcdGl0ZW1zLnB1c2goY3JlYXRlU3ludGhldGljQXV0b0l0ZW0oKSk7XG5cdH1cblx0Y29uc3QgYXV0b01vZGVsID0gb3B0aW9ucy5tb2RlbHMuZmluZChpc0F1dG9Nb2RlbCk7XG5cdGlmIChhdXRvTW9kZWwpIHtcblx0XHRjb25zdCB7IGFjdGlvbiwgYXJpYURlc2NyaXB0aW9uIH0gPSBjcmVhdGVNb2RlbEFjdGlvbihhdXRvTW9kZWwsIG9wdGlvbnMuc2VsZWN0ZWRNb2RlbElkLCBvcHRpb25zLmFjdGlvbnMub25TZWxlY3QpO1xuXHRcdGl0ZW1zLnB1c2goY3JlYXRlTW9kZWxJdGVtKGFjdGlvbiwgYXV0b01vZGVsLCBvcHRpb25zLm9wZW5lclNlcnZpY2UsIHVuZGVmaW5lZCwgb3B0aW9ucy5wcmVzZW50YXRpb24uaXNVQkIsIGFyaWFEZXNjcmlwdGlvbikpO1xuXHR9XG5cdGNvbnN0IHNvcnRlZE1vZGVscyA9IG9wdGlvbnMubW9kZWxzXG5cdFx0LmZpbHRlcihtb2RlbCA9PiBtb2RlbCAhPT0gYXV0b01vZGVsKVxuXHRcdC5zb3J0KChsZWZ0LCByaWdodCkgPT4gbGVmdC5tZXRhZGF0YS52ZW5kb3IubG9jYWxlQ29tcGFyZShyaWdodC5tZXRhZGF0YS52ZW5kb3IpIHx8IGxlZnQubWV0YWRhdGEubmFtZS5sb2NhbGVDb21wYXJlKHJpZ2h0Lm1ldGFkYXRhLm5hbWUpKTtcblx0Zm9yIChjb25zdCBtb2RlbCBvZiBzb3J0ZWRNb2RlbHMpIHtcblx0XHRjb25zdCB7IGFjdGlvbiwgYXJpYURlc2NyaXB0aW9uIH0gPSBjcmVhdGVNb2RlbEFjdGlvbihtb2RlbCwgb3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQsIG9wdGlvbnMuYWN0aW9ucy5vblNlbGVjdCk7XG5cdFx0aXRlbXMucHVzaChjcmVhdGVNb2RlbEl0ZW0oYWN0aW9uLCBtb2RlbCwgb3B0aW9ucy5vcGVuZXJTZXJ2aWNlLCB1bmRlZmluZWQsIG9wdGlvbnMucHJlc2VudGF0aW9uLmlzVUJCLCBhcmlhRGVzY3JpcHRpb24sIHVuZGVmaW5lZCwgb3B0aW9ucy5hY3Rpb25zLm9uQ29uZmlndXJlKSk7XG5cdH1cblx0cmV0dXJuIGl0ZW1zO1xufVxuXG5pbnRlcmZhY2UgSUdyb3VwZWRDb250ZXh0IHtcblx0cmVhZG9ubHkgb3B0aW9uczogSUJ1aWxkTW9kZWxQaWNrZXJJdGVtc09wdGlvbnM7XG5cdHJlYWRvbmx5IGl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdO1xuXHRyZWFkb25seSBtb2RlbFRvR3JvdXA6IFJldHVyblR5cGU8dHlwZW9mIGJ1aWxkTW9kZWxUb1Byb3ZpZGVyR3JvdXBNYXA+O1xuXHRyZWFkb25seSByZXNvbHZlTW9kZWw6IChpZDogc3RyaW5nKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHBsYWNlZDogU2V0PHN0cmluZz47XG5cdHJlYWRvbmx5IHNob3dHcm91cExhYmVsOiBib29sZWFuO1xuXHRyZWFkb25seSBtYWtlUGluQWN0aW9uOiAobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcikgPT4gUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlUGluQWN0aW9uPiB8IHVuZGVmaW5lZDtcblx0bWFya1BsYWNlZChpZGVudGlmaWVyT3JJZDogc3RyaW5nKTogdm9pZDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlR3JvdXBlZENvbnRleHQob3B0aW9uczogSUJ1aWxkTW9kZWxQaWNrZXJJdGVtc09wdGlvbnMpOiBJR3JvdXBlZENvbnRleHQge1xuXHRjb25zdCBtb2RlbFRvR3JvdXAgPSBidWlsZE1vZGVsVG9Qcm92aWRlckdyb3VwTWFwKG9wdGlvbnMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0Y29uc3QgYWxsTW9kZWxzID0gbmV3IE1hcChvcHRpb25zLm1vZGVscy5tYXAobW9kZWwgPT4gW21vZGVsLmlkZW50aWZpZXIsIG1vZGVsXSkpO1xuXHRjb25zdCBtb2RlbHNCeU1ldGFkYXRhSWQgPSBuZXcgTWFwKG9wdGlvbnMubW9kZWxzLm1hcChtb2RlbCA9PiBbbW9kZWwubWV0YWRhdGEuaWQsIG1vZGVsXSkpO1xuXHRjb25zdCBwbGFjZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cmV0dXJuIHtcblx0XHRvcHRpb25zLFxuXHRcdGl0ZW1zOiBbXSxcblx0XHRtb2RlbFRvR3JvdXAsXG5cdFx0cmVzb2x2ZU1vZGVsOiBpZCA9PiBhbGxNb2RlbHMuZ2V0KGlkKSA/PyBtb2RlbHNCeU1ldGFkYXRhSWQuZ2V0KGlkKSxcblx0XHRwbGFjZWQsXG5cdFx0c2hvd0dyb3VwTGFiZWw6IG5ldyBTZXQob3B0aW9ucy5tb2RlbHMubWFwKG1vZGVsID0+IHtcblx0XHRcdGNvbnN0IGdyb3VwID0gZ2V0UHJvdmlkZXJHcm91cEZvck1vZGVsKG1vZGVsLCBtb2RlbFRvR3JvdXAsIG9wdGlvbnMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKTtcblx0XHRcdHJldHVybiBnZXRQcm92aWRlckdyb3VwS2V5KGdyb3VwLnZlbmRvciwgZ3JvdXAuZ3JvdXBOYW1lKTtcblx0XHR9KSkuc2l6ZSA+IDEsXG5cdFx0bWFrZVBpbkFjdGlvbjogbW9kZWwgPT4gb3B0aW9ucy5hY3Rpb25zLm9uVG9nZ2xlUGluXG5cdFx0XHQ/IGNyZWF0ZVBpbkFjdGlvbihtb2RlbC5pZGVudGlmaWVyLCBvcHRpb25zLnBpbm5lZE1vZGVsSWRzLmluY2x1ZGVzKG1vZGVsLmlkZW50aWZpZXIpLCBvcHRpb25zLmFjdGlvbnMub25Ub2dnbGVQaW4pXG5cdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRtYXJrUGxhY2VkOiBpZGVudGlmaWVyT3JJZCA9PiBwbGFjZWQuYWRkKGlkZW50aWZpZXJPcklkKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gYXBwZW5kTGVhZGluZ01vZGVscyhjb250ZXh0OiBJR3JvdXBlZENvbnRleHQpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCB7IG9wdGlvbnMsIGl0ZW1zIH0gPSBjb250ZXh0O1xuXHRjb25zdCBhdXRvTW9kZWwgPSBvcHRpb25zLm1vZGVscy5maW5kKGlzQXV0b01vZGVsKTtcblx0aWYgKCFhdXRvTW9kZWwgJiYgb3B0aW9ucy5tb2RlbHMubGVuZ3RoID09PSAwICYmIG9wdGlvbnMucHJlc2VudGF0aW9uLnNob3dBdXRvTW9kZWwpIHtcblx0XHRpdGVtcy5wdXNoKGNyZWF0ZVN5bnRoZXRpY0F1dG9JdGVtKCkpO1xuXHR9XG5cdGlmIChhdXRvTW9kZWwpIHtcblx0XHRjb250ZXh0Lm1hcmtQbGFjZWQoYXV0b01vZGVsLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHsgYWN0aW9uLCBhcmlhRGVzY3JpcHRpb24gfSA9IGNyZWF0ZU1vZGVsQWN0aW9uKGF1dG9Nb2RlbCwgb3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQsIG9wdGlvbnMuYWN0aW9ucy5vblNlbGVjdCk7XG5cdFx0aXRlbXMucHVzaChjcmVhdGVNb2RlbEl0ZW0oYWN0aW9uLCBhdXRvTW9kZWwsIG9wdGlvbnMub3BlbmVyU2VydmljZSwgdW5kZWZpbmVkLCBvcHRpb25zLnByZXNlbnRhdGlvbi5pc1VCQiwgYXJpYURlc2NyaXB0aW9uKSk7XG5cdH1cblx0Zm9yIChjb25zdCBtb2RlbCBvZiBvcHRpb25zLm1vZGVscykge1xuXHRcdGlmICghY29udGV4dC5wbGFjZWQuaGFzKG1vZGVsLmlkZW50aWZpZXIpICYmIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLmhhc1Byb21vRGlzY291bnQobW9kZWwubWV0YWRhdGEpKSB7XG5cdFx0XHRjb250ZXh0Lm1hcmtQbGFjZWQobW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHRjb25zdCB7IGFjdGlvbiwgYXJpYURlc2NyaXB0aW9uIH0gPSBjcmVhdGVNb2RlbEFjdGlvbihtb2RlbCwgb3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQsIG9wdGlvbnMuYWN0aW9ucy5vblNlbGVjdCk7XG5cdFx0XHRpdGVtcy5wdXNoKGNyZWF0ZU1vZGVsSXRlbShhY3Rpb24sIG1vZGVsLCBvcHRpb25zLm9wZW5lclNlcnZpY2UsIHVuZGVmaW5lZCwgb3B0aW9ucy5wcmVzZW50YXRpb24uaXNVQkIsIGFyaWFEZXNjcmlwdGlvbikpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gYXV0b01vZGVsO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRQaW5uZWRNb2RlbHMoY29udGV4dDogSUdyb3VwZWRDb250ZXh0KTogU2V0PHN0cmluZz4ge1xuXHRjb25zdCB7IG9wdGlvbnMsIGl0ZW1zIH0gPSBjb250ZXh0O1xuXHRjb25zdCBwaW5uZWRTZXQgPSBuZXcgU2V0KG9wdGlvbnMucGlubmVkTW9kZWxJZHMpO1xuXHRjb25zdCBwaW5uZWRNb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdID0gW107XG5cdGZvciAoY29uc3QgaWQgb2Ygb3B0aW9ucy5waW5uZWRNb2RlbElkcykge1xuXHRcdGNvbnN0IG1vZGVsID0gY29udGV4dC5yZXNvbHZlTW9kZWwoaWQpO1xuXHRcdGlmICghY29udGV4dC5wbGFjZWQuaGFzKGlkKSAmJiBtb2RlbCAmJiAhY29udGV4dC5wbGFjZWQuaGFzKG1vZGVsLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRjb250ZXh0Lm1hcmtQbGFjZWQobW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHRwaW5uZWRNb2RlbHMucHVzaChtb2RlbCk7XG5cdFx0fVxuXHR9XG5cdHBpbm5lZE1vZGVscy5zb3J0KChsZWZ0LCByaWdodCkgPT4ge1xuXHRcdGNvbnN0IGxlZnRHcm91cCA9IGdldFByb3ZpZGVyR3JvdXBGb3JNb2RlbChsZWZ0LCBjb250ZXh0Lm1vZGVsVG9Hcm91cCwgb3B0aW9ucy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJpZ2h0R3JvdXAgPSBnZXRQcm92aWRlckdyb3VwRm9yTW9kZWwocmlnaHQsIGNvbnRleHQubW9kZWxUb0dyb3VwLCBvcHRpb25zLmxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdFx0cmV0dXJuIGxlZnRHcm91cC5ncm91cE5hbWUubG9jYWxlQ29tcGFyZShyaWdodEdyb3VwLmdyb3VwTmFtZSkgfHwgbGVmdC5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUocmlnaHQubWV0YWRhdGEubmFtZSk7XG5cdH0pO1xuXHRpZiAocGlubmVkTW9kZWxzLmxlbmd0aCA+IDApIHtcblx0XHRpdGVtcy5wdXNoKHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciwgbGFiZWw6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLnBpbm5lZCcsIFwiUGlubmVkXCIpIH0pO1xuXHRcdGZvciAoY29uc3QgbW9kZWwgb2YgcGlubmVkTW9kZWxzKSB7XG5cdFx0XHRjb25zdCBncm91cExhYmVsID0gY29udGV4dC5zaG93R3JvdXBMYWJlbCA/IGdldFByb3ZpZGVyR3JvdXBGb3JNb2RlbChtb2RlbCwgY29udGV4dC5tb2RlbFRvR3JvdXAsIG9wdGlvbnMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKS5ncm91cE5hbWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB7IGFjdGlvbiwgYXJpYURlc2NyaXB0aW9uIH0gPSBjcmVhdGVNb2RlbEFjdGlvbihtb2RlbCwgb3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQsIG9wdGlvbnMuYWN0aW9ucy5vblNlbGVjdCwgdW5kZWZpbmVkLCBjb250ZXh0LnNob3dHcm91cExhYmVsKTtcblx0XHRcdGl0ZW1zLnB1c2goY3JlYXRlTW9kZWxJdGVtKGFjdGlvbiwgbW9kZWwsIG9wdGlvbnMub3BlbmVyU2VydmljZSwgZ3JvdXBMYWJlbCwgb3B0aW9ucy5wcmVzZW50YXRpb24uaXNVQkIsIGFyaWFEZXNjcmlwdGlvbiwgY29udGV4dC5tYWtlUGluQWN0aW9uKG1vZGVsKSwgb3B0aW9ucy5hY3Rpb25zLm9uQ29uZmlndXJlKSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBwaW5uZWRTZXQ7XG59XG5cbnR5cGUgUHJvbW90ZWRJdGVtID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICdhdmFpbGFibGUnOyByZWFkb25seSBtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICd1bmF2YWlsYWJsZSc7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGVudHJ5OiBJTW9kZWxDb250cm9sRW50cnk7IHJlYWRvbmx5IHJlYXNvbjogJ3VwZ3JhZGUnIHwgJ3VwZGF0ZScgfCAnYWRtaW4nIH07XG5cbmZ1bmN0aW9uIGFwcGVuZFByb21vdGVkTW9kZWxzKGNvbnRleHQ6IElHcm91cGVkQ29udGV4dCwgYXV0b01vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQsIHBpbm5lZFNldDogU2V0PHN0cmluZz4pOiB2b2lkIHtcblx0Y29uc3QgeyBvcHRpb25zLCBpdGVtcyB9ID0gY29udGV4dDtcblx0Y29uc3QgcHJvbW90ZWQ6IFByb21vdGVkSXRlbVtdID0gW107XG5cdGNvbnN0IHRyeVBsYWNlID0gKGlkOiBzdHJpbmcpOiBib29sZWFuID0+IHtcblx0XHRpZiAoY29udGV4dC5wbGFjZWQuaGFzKGlkKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IGNvbnRleHQucmVzb2x2ZU1vZGVsKGlkKTtcblx0XHRpZiAobW9kZWwgJiYgIWNvbnRleHQucGxhY2VkLmhhcyhtb2RlbC5pZGVudGlmaWVyKSkge1xuXHRcdFx0Y29udGV4dC5tYXJrUGxhY2VkKG1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBvcHRpb25zLmNvbnRyb2xNb2RlbHNbbW9kZWwubWV0YWRhdGEuaWRdO1xuXHRcdFx0aWYgKGVudHJ5Py5taW5WU0NvZGVWZXJzaW9uICYmICFpc1ZlcnNpb25BdExlYXN0KG9wdGlvbnMuY3VycmVudFZTQ29kZVZlcnNpb24sIGVudHJ5Lm1pblZTQ29kZVZlcnNpb24pKSB7XG5cdFx0XHRcdHByb21vdGVkLnB1c2goeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZDogbW9kZWwubWV0YWRhdGEuaWQsIGVudHJ5LCByZWFzb246ICd1cGRhdGUnIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJvbW90ZWQucHVzaCh7IGtpbmQ6ICdhdmFpbGFibGUnLCBtb2RlbCB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IG9wdGlvbnMuY29udHJvbE1vZGVsc1tpZF07XG5cdFx0aWYgKCFtb2RlbCAmJiBlbnRyeSAmJiAhZW50cnkuZXhpc3RzKSB7XG5cdFx0XHRjb250ZXh0Lm1hcmtQbGFjZWQoaWQpO1xuXHRcdFx0cHJvbW90ZWQucHVzaCh7IGtpbmQ6ICd1bmF2YWlsYWJsZScsIGlkLCBlbnRyeSwgcmVhc29uOiBnZXRVbmF2YWlsYWJsZVJlYXNvbihlbnRyeSwgb3B0aW9ucy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBvcHRpb25zLmN1cnJlbnRWU0NvZGVWZXJzaW9uKSB9KTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH07XG5cdGlmIChvcHRpb25zLnNlbGVjdGVkTW9kZWxJZCAmJiBvcHRpb25zLnNlbGVjdGVkTW9kZWxJZCAhPT0gYXV0b01vZGVsPy5pZGVudGlmaWVyKSB7XG5cdFx0dHJ5UGxhY2Uob3B0aW9ucy5zZWxlY3RlZE1vZGVsSWQpO1xuXHR9XG5cdGZvciAoY29uc3QgaWQgb2Ygb3B0aW9ucy5yZWNlbnRNb2RlbElkcy5maWx0ZXIoaWQgPT4gIXBpbm5lZFNldC5oYXMoaWQpKS5zbGljZSgwLCAzKSkge1xuXHRcdHRyeVBsYWNlKGlkKTtcblx0fVxuXHRpZiAob3B0aW9ucy5wcmVzZW50YXRpb24uc2hvd0ZlYXR1cmVkKSB7XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBvcHRpb25zLm1vZGVscykge1xuXHRcdFx0aWYgKG1vZGVsLm1ldGFkYXRhLnByb21vICYmICFJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YS5oYXNQcm9tb0Rpc2NvdW50KG1vZGVsLm1ldGFkYXRhKSkge1xuXHRcdFx0XHR0cnlQbGFjZShtb2RlbC5pZGVudGlmaWVyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbZW50cnlJZCwgZW50cnldIG9mIE9iamVjdC5lbnRyaWVzKG9wdGlvbnMuY29udHJvbE1vZGVscykpIHtcblx0XHRcdGlmICghZW50cnkuZmVhdHVyZWQgfHwgY29udGV4dC5wbGFjZWQuaGFzKGVudHJ5SWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWwgPSBjb250ZXh0LnJlc29sdmVNb2RlbChlbnRyeUlkKTtcblx0XHRcdGlmIChtb2RlbCAmJiAhY29udGV4dC5wbGFjZWQuaGFzKG1vZGVsLmlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdGlmIChlbnRyeS5taW5WU0NvZGVWZXJzaW9uICYmICFpc1ZlcnNpb25BdExlYXN0KG9wdGlvbnMuY3VycmVudFZTQ29kZVZlcnNpb24sIGVudHJ5Lm1pblZTQ29kZVZlcnNpb24pKSB7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMucHJlc2VudGF0aW9uLnNob3dVbmF2YWlsYWJsZUZlYXR1cmVkKSB7XG5cdFx0XHRcdFx0XHRjb250ZXh0Lm1hcmtQbGFjZWQobW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0XHRwcm9tb3RlZC5wdXNoKHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWQ6IGVudHJ5SWQsIGVudHJ5LCByZWFzb246ICd1cGRhdGUnIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb250ZXh0Lm1hcmtQbGFjZWQobW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHRcdFx0cHJvbW90ZWQucHVzaCh7IGtpbmQ6ICdhdmFpbGFibGUnLCBtb2RlbCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghbW9kZWwgJiYgIWVudHJ5LmV4aXN0cyAmJiBvcHRpb25zLnByZXNlbnRhdGlvbi5zaG93VW5hdmFpbGFibGVGZWF0dXJlZCkge1xuXHRcdFx0XHRjb250ZXh0Lm1hcmtQbGFjZWQoZW50cnlJZCk7XG5cdFx0XHRcdHByb21vdGVkLnB1c2goeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZDogZW50cnlJZCwgZW50cnksIHJlYXNvbjogZ2V0VW5hdmFpbGFibGVSZWFzb24oZW50cnksIG9wdGlvbnMuY2hhdEVudGl0bGVtZW50U2VydmljZSwgb3B0aW9ucy5jdXJyZW50VlNDb2RlVmVyc2lvbikgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdGlmIChwcm9tb3RlZC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblx0aWYgKGl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRpdGVtcy5wdXNoKHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciB9KTtcblx0fVxuXHRwcm9tb3RlZC5zb3J0KChsZWZ0LCByaWdodCkgPT4ge1xuXHRcdGNvbnN0IGF2YWlsYWJpbGl0eSA9IChsZWZ0LmtpbmQgPT09ICdhdmFpbGFibGUnID8gMCA6IDEpIC0gKHJpZ2h0LmtpbmQgPT09ICdhdmFpbGFibGUnID8gMCA6IDEpO1xuXHRcdGNvbnN0IGxlZnROYW1lID0gbGVmdC5raW5kID09PSAnYXZhaWxhYmxlJyA/IGxlZnQubW9kZWwubWV0YWRhdGEubmFtZSA6IGxlZnQuZW50cnkubGFiZWw7XG5cdFx0Y29uc3QgcmlnaHROYW1lID0gcmlnaHQua2luZCA9PT0gJ2F2YWlsYWJsZScgPyByaWdodC5tb2RlbC5tZXRhZGF0YS5uYW1lIDogcmlnaHQuZW50cnkubGFiZWw7XG5cdFx0cmV0dXJuIGF2YWlsYWJpbGl0eSB8fCBsZWZ0TmFtZS5sb2NhbGVDb21wYXJlKHJpZ2h0TmFtZSk7XG5cdH0pO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgcHJvbW90ZWQpIHtcblx0XHRpZiAoaXRlbS5raW5kID09PSAnYXZhaWxhYmxlJykge1xuXHRcdFx0Y29uc3QgZ3JvdXBMYWJlbCA9IGNvbnRleHQuc2hvd0dyb3VwTGFiZWwgPyBnZXRQcm92aWRlckdyb3VwRm9yTW9kZWwoaXRlbS5tb2RlbCwgY29udGV4dC5tb2RlbFRvR3JvdXAsIG9wdGlvbnMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKS5ncm91cE5hbWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB7IGFjdGlvbiwgYXJpYURlc2NyaXB0aW9uIH0gPSBjcmVhdGVNb2RlbEFjdGlvbihpdGVtLm1vZGVsLCBvcHRpb25zLnNlbGVjdGVkTW9kZWxJZCwgb3B0aW9ucy5hY3Rpb25zLm9uU2VsZWN0LCB1bmRlZmluZWQsIGNvbnRleHQuc2hvd0dyb3VwTGFiZWwpO1xuXHRcdFx0aXRlbXMucHVzaChjcmVhdGVNb2RlbEl0ZW0oYWN0aW9uLCBpdGVtLm1vZGVsLCBvcHRpb25zLm9wZW5lclNlcnZpY2UsIGdyb3VwTGFiZWwsIG9wdGlvbnMucHJlc2VudGF0aW9uLmlzVUJCLCBhcmlhRGVzY3JpcHRpb24sIGNvbnRleHQubWFrZVBpbkFjdGlvbihpdGVtLm1vZGVsKSwgb3B0aW9ucy5hY3Rpb25zLm9uQ29uZmlndXJlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGl0ZW1zLnB1c2goY3JlYXRlVW5hdmFpbGFibGVNb2RlbEl0ZW0oaXRlbS5pZCwgaXRlbS5lbnRyeSwgaXRlbS5yZWFzb24sIG9wdGlvbnMubWFuYWdlU2V0dGluZ3NVcmwsIG9wdGlvbnMudXBkYXRlU3RhdGVUeXBlLCBvcHRpb25zLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UpKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gYXBwZW5kT3RoZXJNb2RlbHMoY29udGV4dDogSUdyb3VwZWRDb250ZXh0KTogYm9vbGVhbiB7XG5cdGNvbnN0IHsgb3B0aW9ucywgaXRlbXMgfSA9IGNvbnRleHQ7XG5cdGNvbnN0IG90aGVyTW9kZWxzID0gb3B0aW9ucy5tb2RlbHMuZmlsdGVyKG1vZGVsID0+ICFjb250ZXh0LnBsYWNlZC5oYXMobW9kZWwuaWRlbnRpZmllcikpO1xuXHRpZiAob3RoZXJNb2RlbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChpdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0aXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgfSk7XG5cdH1cblx0Y29uc3QgdG9vbGJhckFjdGlvbnMgPSBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvblxuXHRcdD8gW3RvQWN0aW9uKHsgaWQ6IG9wdGlvbnMubWFuYWdlTW9kZWxzQWN0aW9uLmlkLCBsYWJlbDogb3B0aW9ucy5tYW5hZ2VNb2RlbHNBY3Rpb24udG9vbHRpcCA/PyBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbi5sYWJlbCwgY2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdlYXIpLCBydW46ICgpID0+IG9wdGlvbnMubWFuYWdlTW9kZWxzQWN0aW9uIS5ydW4oKSB9KV1cblx0XHQ6IHVuZGVmaW5lZDtcblx0aXRlbXMucHVzaCh7XG5cdFx0aXRlbTogeyBpZDogJ290aGVyTW9kZWxzJywgZW5hYmxlZDogdHJ1ZSwgY2hlY2tlZDogZmFsc2UsIGNsYXNzOiB1bmRlZmluZWQsIHRvb2x0aXA6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLm90aGVyTW9kZWxzJywgXCJPdGhlciBNb2RlbHNcIiksIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5tb2RlbFBpY2tlci5vdGhlck1vZGVscycsIFwiT3RoZXIgTW9kZWxzXCIpLCBydW46ICgpID0+IHsgfSB9LFxuXHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0Lm1vZGVsUGlja2VyLm90aGVyTW9kZWxzJywgXCJPdGhlciBNb2RlbHNcIiksXG5cdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLmNoZXZyb25Eb3duIH0sXG5cdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdHNlY3Rpb246IE1vZGVsUGlja2VyU2VjdGlvbi5PdGhlcixcblx0XHRpc1NlY3Rpb25Ub2dnbGU6IHRydWUsXG5cdFx0dG9vbGJhckFjdGlvbnMsXG5cdFx0Y2xhc3NOYW1lOiAnY2hhdC1tb2RlbC1waWNrZXItc2VjdGlvbi10b2dnbGUnLFxuXHR9KTtcblx0aW50ZXJmYWNlIElQcm92aWRlckdyb3VwQnVja2V0IHsgdmVuZG9yOiBzdHJpbmc7IGdyb3VwTmFtZTogc3RyaW5nOyBtb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdIH1cblx0Y29uc3QgZ3JvdXBzID0gbmV3IE1hcDxQcm92aWRlckdyb3VwS2V5LCBJUHJvdmlkZXJHcm91cEJ1Y2tldD4oKTtcblx0Zm9yIChjb25zdCBtb2RlbCBvZiBvdGhlck1vZGVscykge1xuXHRcdGNvbnN0IGluZm8gPSBnZXRQcm92aWRlckdyb3VwRm9yTW9kZWwobW9kZWwsIGNvbnRleHQubW9kZWxUb0dyb3VwLCBvcHRpb25zLmxhbmd1YWdlTW9kZWxzU2VydmljZSk7XG5cdFx0Y29uc3Qga2V5ID0gZ2V0UHJvdmlkZXJHcm91cEtleShpbmZvLnZlbmRvciwgaW5mby5ncm91cE5hbWUpO1xuXHRcdGNvbnN0IGJ1Y2tldCA9IGdyb3Vwcy5nZXQoa2V5KSA/PyB7IHZlbmRvcjogaW5mby52ZW5kb3IsIGdyb3VwTmFtZTogaW5mby5ncm91cE5hbWUsIG1vZGVsczogW10gfTtcblx0XHRidWNrZXQubW9kZWxzLnB1c2gobW9kZWwpO1xuXHRcdGdyb3Vwcy5zZXQoa2V5LCBidWNrZXQpO1xuXHR9XG5cdGNvbnN0IHNvcnRlZEdyb3VwcyA9IFsuLi5ncm91cHMudmFsdWVzKCldLnNvcnQoKGxlZnQsIHJpZ2h0KSA9PiB7XG5cdFx0aWYgKGxlZnQudmVuZG9yID09PSAnY29waWxvdCcgJiYgcmlnaHQudmVuZG9yICE9PSAnY29waWxvdCcpIHsgcmV0dXJuIC0xOyB9XG5cdFx0aWYgKHJpZ2h0LnZlbmRvciA9PT0gJ2NvcGlsb3QnICYmIGxlZnQudmVuZG9yICE9PSAnY29waWxvdCcpIHsgcmV0dXJuIDE7IH1cblx0XHRyZXR1cm4gbGVmdC5ncm91cE5hbWUubG9jYWxlQ29tcGFyZShyaWdodC5ncm91cE5hbWUpO1xuXHR9KTtcblx0Y29uc3Qgc2hvd0hlYWRlcnMgPSBzb3J0ZWRHcm91cHMubGVuZ3RoID4gMTtcblx0Zm9yIChjb25zdCBncm91cCBvZiBzb3J0ZWRHcm91cHMpIHtcblx0XHRpZiAoc2hvd0hlYWRlcnMpIHtcblx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogZ3JvdXAuZ3JvdXBOYW1lLCBzZWN0aW9uOiBNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXIgfSk7XG5cdFx0fVxuXHRcdGdyb3VwLm1vZGVscy5zb3J0KChsZWZ0LCByaWdodCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVmdEVudHJ5ID0gb3B0aW9ucy5jb250cm9sTW9kZWxzW2xlZnQubWV0YWRhdGEuaWRdID8/IG9wdGlvbnMuY29udHJvbE1vZGVsc1tsZWZ0LmlkZW50aWZpZXJdO1xuXHRcdFx0Y29uc3QgcmlnaHRFbnRyeSA9IG9wdGlvbnMuY29udHJvbE1vZGVsc1tyaWdodC5tZXRhZGF0YS5pZF0gPz8gb3B0aW9ucy5jb250cm9sTW9kZWxzW3JpZ2h0LmlkZW50aWZpZXJdO1xuXHRcdFx0Y29uc3QgbGVmdFVuYXZhaWxhYmxlID0gbGVmdEVudHJ5Py5taW5WU0NvZGVWZXJzaW9uICYmICFpc1ZlcnNpb25BdExlYXN0KG9wdGlvbnMuY3VycmVudFZTQ29kZVZlcnNpb24sIGxlZnRFbnRyeS5taW5WU0NvZGVWZXJzaW9uKSA/IDEgOiAwO1xuXHRcdFx0Y29uc3QgcmlnaHRVbmF2YWlsYWJsZSA9IHJpZ2h0RW50cnk/Lm1pblZTQ29kZVZlcnNpb24gJiYgIWlzVmVyc2lvbkF0TGVhc3Qob3B0aW9ucy5jdXJyZW50VlNDb2RlVmVyc2lvbiwgcmlnaHRFbnRyeS5taW5WU0NvZGVWZXJzaW9uKSA/IDEgOiAwO1xuXHRcdFx0cmV0dXJuIGxlZnRVbmF2YWlsYWJsZSAtIHJpZ2h0VW5hdmFpbGFibGUgfHwgbGVmdC5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUocmlnaHQubWV0YWRhdGEubmFtZSk7XG5cdFx0fSk7XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBncm91cC5tb2RlbHMpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gb3B0aW9ucy5jb250cm9sTW9kZWxzW21vZGVsLm1ldGFkYXRhLmlkXSA/PyBvcHRpb25zLmNvbnRyb2xNb2RlbHNbbW9kZWwuaWRlbnRpZmllcl07XG5cdFx0XHRpZiAoZW50cnk/Lm1pblZTQ29kZVZlcnNpb24gJiYgIWlzVmVyc2lvbkF0TGVhc3Qob3B0aW9ucy5jdXJyZW50VlNDb2RlVmVyc2lvbiwgZW50cnkubWluVlNDb2RlVmVyc2lvbikpIHtcblx0XHRcdFx0aXRlbXMucHVzaChjcmVhdGVVbmF2YWlsYWJsZU1vZGVsSXRlbShtb2RlbC5tZXRhZGF0YS5pZCwgZW50cnksICd1cGRhdGUnLCBvcHRpb25zLm1hbmFnZVNldHRpbmdzVXJsLCBvcHRpb25zLnVwZGF0ZVN0YXRlVHlwZSwgb3B0aW9ucy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXIpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHsgYWN0aW9uLCBhcmlhRGVzY3JpcHRpb24gfSA9IGNyZWF0ZU1vZGVsQWN0aW9uKG1vZGVsLCBvcHRpb25zLnNlbGVjdGVkTW9kZWxJZCwgb3B0aW9ucy5hY3Rpb25zLm9uU2VsZWN0LCBNb2RlbFBpY2tlclNlY3Rpb24uT3RoZXIsIHNob3dIZWFkZXJzKTtcblx0XHRcdFx0aXRlbXMucHVzaChjcmVhdGVNb2RlbEl0ZW0oYWN0aW9uLCBtb2RlbCwgb3B0aW9ucy5vcGVuZXJTZXJ2aWNlLCB1bmRlZmluZWQsIG9wdGlvbnMucHJlc2VudGF0aW9uLmlzVUJCLCBhcmlhRGVzY3JpcHRpb24sIGNvbnRleHQubWFrZVBpbkFjdGlvbihtb2RlbCksIG9wdGlvbnMuYWN0aW9ucy5vbkNvbmZpZ3VyZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkR3JvdXBlZE1vZGVsSXRlbXMob3B0aW9uczogSUJ1aWxkTW9kZWxQaWNrZXJJdGVtc09wdGlvbnMpOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uPltdIHtcblx0Y29uc3QgY29udGV4dCA9IGNyZWF0ZUdyb3VwZWRDb250ZXh0KG9wdGlvbnMpO1xuXHRjb25zdCBhdXRvTW9kZWwgPSBhcHBlbmRMZWFkaW5nTW9kZWxzKGNvbnRleHQpO1xuXHRjb25zdCBwaW5uZWRTZXQgPSBhcHBlbmRQaW5uZWRNb2RlbHMoY29udGV4dCk7XG5cdGFwcGVuZFByb21vdGVkTW9kZWxzKGNvbnRleHQsIGF1dG9Nb2RlbCwgcGlubmVkU2V0KTtcblx0Y29uc3QgaGFzT3RoZXJNb2RlbHMgPSBhcHBlbmRPdGhlck1vZGVscyhjb250ZXh0KTtcblx0aWYgKG9wdGlvbnMubWFuYWdlTW9kZWxzQWN0aW9uICYmICFoYXNPdGhlck1vZGVscykge1xuXHRcdGNvbnRleHQuaXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IgfSk7XG5cdFx0Y29udGV4dC5pdGVtcy5wdXNoKHtcblx0XHRcdGl0ZW06IG9wdGlvbnMubWFuYWdlTW9kZWxzQWN0aW9uLFxuXHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdGxhYmVsOiBvcHRpb25zLm1hbmFnZU1vZGVsc0FjdGlvbi5sYWJlbCxcblx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5ibGFuayB9LFxuXHRcdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdFx0c2hvd0Fsd2F5czogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gY29udGV4dC5pdGVtcztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEyQztBQUVwRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUE2QixrQ0FBMkU7QUFDeEcsU0FBUyw4QkFBOEIsbUJBQW1CLGlCQUFpQixpQkFBaUIsNEJBQTRCLDBCQUEwQixxQkFBcUIsc0JBQXNCLHdCQUEwQztBQUV2TyxTQUFTLG1CQUFtQjtBQUVyQixNQUFNLHFCQUFxQjtBQUFBLEVBQ2pDLE9BQU87QUFDUjtBQUVPLE1BQU0sa0NBQWtDO0FBQ3hDLE1BQU0sbUNBQW1DO0FBRWhELFNBQVMsMEJBQXdFO0FBQ2hGLFNBQU8sZ0JBQWdCO0FBQUEsSUFDdEIsSUFBSTtBQUFBLElBQ0osU0FBUztBQUFBLElBQ1QsU0FBUztBQUFBLElBQ1QsT0FBTztBQUFBLElBQ1AsU0FBUyxTQUFTLHlCQUF5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
