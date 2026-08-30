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
import "./media/chatModelsWidget.css";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import * as DOM from "../../../../../base/browser/dom.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { ILanguageModelsService, resolveProviderDeprecationLink } from "../../../chat/common/languageModels.js";
import { localize } from "../../../../../nls.js";
import { defaultButtonStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchTable } from "../../../../../platform/list/browser/listService.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { toAction, Action, Separator } from "../../../../../base/common/actions.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ChatModelsViewModel, getManageModelsProviderLabel, SEARCH_SUGGESTIONS, isLanguageModelProviderEntry, isLanguageModelGroupEntry, isStatusEntry } from "./chatModelsViewModel.js";
import { HighlightedLabel } from "../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { Link } from "../../../../../platform/opener/browser/link.js";
import { SuggestEnabledInput } from "../../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { Delayer } from "../../../../../base/common/async.js";
import { settingsTextInputBorder } from "../../../preferences/common/settingsEditorColorRegistry.js";
import { IChatEntitlementService, ChatEntitlement } from "../../../../services/chat/common/chatEntitlementService.js";
import { DropdownMenuActionViewItem } from "../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { AnchorAlignment } from "../../../../../base/browser/ui/contextview/contextview.js";
import { ToolBar } from "../../../../../base/browser/ui/toolbar/toolbar.js";
import { preferencesClearInputIcon } from "../../../preferences/browser/preferencesIcons.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IEditorProgressService } from "../../../../../platform/progress/common/progress.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { CONTEXT_MODELS_SEARCH_FOCUS } from "../../common/constants.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG } from "../../../../../platform/extensionManagement/common/extensionManagement.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import Severity from "../../../../../base/common/severity.js";
import { formatTokenCount } from "../../../../../base/common/numbers.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { CHAT_SETUP_ACTION_ID } from "../actions/chatActions.js";
const $ = DOM.$;
const HEADER_HEIGHT = 30;
const VENDOR_ROW_HEIGHT = 30;
const MODEL_ROW_HEIGHT = 26;
const CLOSE_MODAL_EDITOR_COMMAND_ID = "workbench.action.closeModalEditor";
function getModelHoverContent(model) {
  const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
  markdown.appendMarkdown(`**${model.metadata.name}**`);
  if (model.metadata.id !== model.metadata.version) {
    markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}&#64;${model.metadata.version}_&nbsp;</span>`);
  } else {
    markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${model.metadata.id}_&nbsp;</span>`);
  }
  markdown.appendText(`
`);
  if (model.metadata.statusIcon && model.metadata.tooltip) {
    if (model.metadata.statusIcon) {
      markdown.appendMarkdown(`$(${model.metadata.statusIcon.id})&nbsp;`);
    }
    markdown.appendMarkdown(`${model.metadata.tooltip}`);
    markdown.appendText(`
`);
  }
  if (model.metadata.pricing) {
    markdown.appendMarkdown(`${localize("models.pricing", "Pricing")}: `);
    markdown.appendMarkdown(model.metadata.pricing);
    markdown.appendText(`
`);
  }
  if (model.metadata.inputCost !== void 0 || model.metadata.outputCost !== void 0 || model.metadata.cacheCost !== void 0 || model.metadata.cacheWriteCost !== void 0) {
    if (model.metadata.inputCost !== void 0) {
      markdown.appendMarkdown(model.metadata.inputCost === 1 ? localize("models.inputCost.singular", "Input Cost: {0} credit per 1M tokens", model.metadata.inputCost) : localize("models.inputCost.plural", "Input Cost: {0} credits per 1M tokens", model.metadata.inputCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.cacheCost !== void 0) {
      markdown.appendMarkdown(model.metadata.cacheCost === 1 ? localize("models.cacheCost.singular", "Cache Read Cost: {0} credit per 1M tokens", model.metadata.cacheCost) : localize("models.cacheCost.plural", "Cache Read Cost: {0} credits per 1M tokens", model.metadata.cacheCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.cacheWriteCost !== void 0) {
      markdown.appendMarkdown(model.metadata.cacheWriteCost === 1 ? localize("models.cacheWriteCost.singular", "Cache Write Cost: {0} credit per 1M tokens", model.metadata.cacheWriteCost) : localize("models.cacheWriteCost.plural", "Cache Write Cost: {0} credits per 1M tokens", model.metadata.cacheWriteCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.outputCost !== void 0) {
      markdown.appendMarkdown(model.metadata.outputCost === 1 ? localize("models.outputCost.singular", "Output Cost: {0} credit per 1M tokens", model.metadata.outputCost) : localize("models.outputCost.plural", "Output Cost: {0} credits per 1M tokens", model.metadata.outputCost));
      markdown.appendText(`
`);
    }
    if (model.metadata.longContextInputCost !== void 0 || model.metadata.longContextOutputCost !== void 0 || model.metadata.longContextCacheCost !== void 0 || model.metadata.longContextCacheWriteCost !== void 0) {
      markdown.appendText(`
`);
      markdown.appendMarkdown(`**${localize("models.longContextPricing", "Long Context Pricing")}**`);
      markdown.appendText(`
`);
      if (model.metadata.longContextInputCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextInputCost === 1 ? localize("models.longContextInputCost.singular", "Input Cost: {0} credit per 1M tokens", model.metadata.longContextInputCost) : localize("models.longContextInputCost.plural", "Input Cost: {0} credits per 1M tokens", model.metadata.longContextInputCost));
        markdown.appendText(`
`);
      }
      if (model.metadata.longContextCacheCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextCacheCost === 1 ? localize("models.longContextCacheCost.singular", "Cache Read Cost: {0} credit per 1M tokens", model.metadata.longContextCacheCost) : localize("models.longContextCacheCost.plural", "Cache Read Cost: {0} credits per 1M tokens", model.metadata.longContextCacheCost));
        markdown.appendText(`
`);
      }
      if (model.metadata.longContextCacheWriteCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextCacheWriteCost === 1 ? localize("models.longContextCacheWriteCost.singular", "Cache Write Cost: {0} credit per 1M tokens", model.metadata.longContextCacheWriteCost) : localize("models.longContextCacheWriteCost.plural", "Cache Write Cost: {0} credits per 1M tokens", model.metadata.longContextCacheWriteCost));
        markdown.appendText(`
`);
      }
      if (model.metadata.longContextOutputCost !== void 0) {
        markdown.appendMarkdown(model.metadata.longContextOutputCost === 1 ? localize("models.longContextOutputCost.singular", "Output Cost: {0} credit per 1M tokens", model.metadata.longContextOutputCost) : localize("models.longContextOutputCost.plural", "Output Cost: {0} credits per 1M tokens", model.metadata.longContextOutputCost));
        markdown.appendText(`
`);
      }
    }
  }
  if (model.metadata.maxInputTokens || model.metadata.maxOutputTokens) {
    const totalTokens = (model.metadata.maxInputTokens ?? 0) + (model.metadata.maxOutputTokens ?? 0);
    markdown.appendMarkdown(`${localize("models.contextSize", "Context Size")}: `);
    markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
    markdown.appendText(`
`);
  }
  if (model.metadata.capabilities) {
    markdown.appendMarkdown(`${localize("models.capabilities", "Capabilities")}: `);
    if (model.metadata.capabilities?.toolCalling) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize("models.toolCalling", "Tools")}_&nbsp;</span>`);
    }
    if (model.metadata.capabilities?.vision) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize("models.vision", "Vision")}_&nbsp;</span>`);
    }
    if (model.metadata.capabilities?.agentMode) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${localize("models.agentMode", "Agent Mode")}_&nbsp;</span>`);
    }
    for (const editTool of model.metadata.capabilities.editTools ?? []) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${editTool}_&nbsp;</span>`);
    }
    markdown.appendText(`
`);
  }
  return markdown;
}
function buildAddModelsDropdownActions(configurableVendors, supportsAddingModels, runVendorAction, runCopilotSignInAction) {
  if (!supportsAddingModels && !runCopilotSignInAction) {
    return [];
  }
  const customEndpointVendor = configurableVendors.find((v) => v.vendor === "customendpoint");
  const customOaiVendor = configurableVendors.find((v) => v.vendor === "customoai");
  const sortedVendors = configurableVendors.filter((v) => v.vendor !== "customendpoint" && v.vendor !== "customoai").sort((a, b) => {
    const aDeprecated = a.deprecation?.link ? 1 : 0;
    const bDeprecated = b.deprecation?.link ? 1 : 0;
    if (aDeprecated !== bDeprecated) {
      return aDeprecated - bDeprecated;
    }
    return a.displayName.localeCompare(b.displayName);
  });
  if (customOaiVendor) {
    sortedVendors.push(customOaiVendor);
  }
  const toVendorAction = (vendor) => toAction({
    id: `enable-${vendor.vendor}`,
    label: vendor.displayName,
    run: async () => {
      await runVendorAction(vendor);
    }
  });
  const vendorActions = supportsAddingModels ? sortedVendors.map(toVendorAction) : [];
  if (supportsAddingModels && customEndpointVendor) {
    if (vendorActions.length > 0) {
      vendorActions.push(new Separator());
    }
    vendorActions.push(toVendorAction(customEndpointVendor));
  }
  const actions = [];
  if (runCopilotSignInAction) {
    actions.push(toAction({
      id: "signIn-github-copilot",
      label: localize("models.signInGitHubCopilot", "GitHub Copilot"),
      run: async () => {
        await runCopilotSignInAction();
      }
    }));
  }
  if (actions.length > 0 && vendorActions.length > 0) {
    actions.push(new Separator());
  }
  actions.push(...vendorActions);
  return actions;
}
class ModelsFilterAction extends Action {
  constructor() {
    super("workbench.models.filter", localize("filter", "Filter"), ThemeIcon.asClassName(Codicon.filter));
  }
  async run() {
  }
}
function toggleFilter(currentQuery, filter) {
  const { query, synonyms = [], excludes = [] } = filter;
  const allSynonyms = [query, ...synonyms];
  const isChecked = allSynonyms.some((q) => currentQuery.includes(q));
  const hasExcludedQuery = excludes.some((q) => currentQuery.includes(q));
  if (isChecked) {
    let queryWithRemovedFilter = currentQuery;
    for (const q of allSynonyms) {
      queryWithRemovedFilter = queryWithRemovedFilter.replace(q, "");
    }
    return queryWithRemovedFilter.replace(/\s+/g, " ").trim();
  } else if (hasExcludedQuery) {
    let newQuery = currentQuery;
    for (const q of excludes) {
      newQuery = newQuery.replace(q, "");
    }
    newQuery = newQuery.replace(/\s+/g, " ").trim();
    return newQuery ? `${newQuery} ${query}` : query;
  } else {
    const trimmedQuery = currentQuery.trim();
    return trimmedQuery ? `${trimmedQuery} ${query}` : query;
  }
}
let ModelsSearchFilterDropdownMenuActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, search, viewModel, contextMenuService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        ...options,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
        menuAsChild: true
      }
    );
    this.search = search;
    this.viewModel = viewModel;
  }
  createProviderAction(vendor, displayName) {
    const query = `@provider:"${displayName}"`;
    const currentQuery = this.search.getValue();
    const isChecked = currentQuery.includes(query) || currentQuery.includes(`@provider:${vendor}`);
    return {
      id: `provider-${vendor}`,
      label: displayName,
      tooltip: localize("filterByProvider", "Filter by {0}", displayName),
      class: void 0,
      enabled: true,
      checked: isChecked,
      run: () => this.toggleFilterAndSearch({ query, synonyms: [`@provider:${vendor}`] })
    };
  }
  createCapabilityAction(capability, label) {
    const query = `@capability:${capability}`;
    const currentQuery = this.search.getValue();
    const isChecked = currentQuery.includes(query);
    return {
      id: `capability-${capability}`,
      label,
      tooltip: localize("filterByCapability", "Filter by {0}", label),
      class: void 0,
      enabled: true,
      checked: isChecked,
      run: () => this.toggleFilterAndSearch({ query })
    };
  }
  toggleFilterAndSearch(filter) {
    const currentQuery = this.search.getValue();
    const newQuery = toggleFilter(currentQuery, filter);
    this.search.setValue(newQuery);
  }
  getActions() {
    const actions = [];
    actions.push(
      this.createCapabilityAction("tools", localize("capability.tools", "Tools")),
      this.createCapabilityAction("vision", localize("capability.vision", "Vision")),
      this.createCapabilityAction("agent", localize("capability.agent", "Agent Mode"))
    );
    const configuredVendors = this.viewModel.getConfiguredVendors();
    if (configuredVendors.length > 1) {
      actions.push(new Separator());
      actions.push(...configuredVendors.map((vendor) => this.createProviderAction(vendor.vendor.vendor, vendor.group.name)));
    }
    return actions;
  }
};
ModelsSearchFilterDropdownMenuActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService)
], ModelsSearchFilterDropdownMenuActionViewItem);
class Delegate {
  constructor() {
    this.headerRowHeight = HEADER_HEIGHT;
  }
  getHeight(element) {
    return isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element) ? VENDOR_ROW_HEIGHT : MODEL_ROW_HEIGHT;
  }
}
class ModelsTableColumnRenderer {
  renderElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    const isVendor = isLanguageModelProviderEntry(element);
    const isGroup = isLanguageModelGroupEntry(element);
    const isStatus = isStatusEntry(element);
    templateData.container.classList.add("models-table-column");
    const row = templateData.container.parentElement;
    row.classList.toggle("models-vendor-row", isVendor || isGroup);
    row.classList.toggle("models-model-row", !isVendor && !isGroup);
    row.classList.toggle("models-status-row", isStatus);
    const isHidden = isVendor && element.hidden || !isVendor && !isGroup && !isStatus && element.model?.hidden;
    row.classList.toggle("models-row-hidden", !!isHidden);
    if (isVendor) {
      this.renderVendorElement(element, index, templateData);
    } else if (isGroup) {
      this.renderGroupElement(element, index, templateData);
    } else if (isStatus) {
      this.renderStatusElement(element, index, templateData);
    } else {
      this.renderModelElement(element, index, templateData);
    }
  }
  renderStatusElement(element, index, templateData) {
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
}
const _GutterColumnRenderer = class _GutterColumnRenderer extends ModelsTableColumnRenderer {
  constructor(viewModel) {
    super();
    this.viewModel = viewModel;
    this.templateId = _GutterColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("models-gutter-column");
    const actionBar = disposables.add(new ActionBar(container));
    return {
      listRowElement: container.parentElement?.parentElement ?? null,
      container,
      actionBar,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    templateData.actionBar.clear();
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
    this.renderCollapsableElement(entry, templateData);
    this.renderGroupVisibilityElement(entry, templateData);
  }
  renderGroupElement(entry, index, templateData) {
    this.renderCollapsableElement(entry, templateData);
  }
  renderCollapsableElement(entry, templateData) {
    if (templateData.listRowElement) {
      templateData.listRowElement.setAttribute("aria-expanded", entry.collapsed ? "false" : "true");
    }
    const label = entry.collapsed ? localize("expand", "Expand") : localize("collapse", "Collapse");
    const toggleCollapseAction = {
      id: "toggleCollapse",
      label,
      tooltip: label,
      enabled: true,
      class: ThemeIcon.asClassName(entry.collapsed ? Codicon.chevronRight : Codicon.chevronDown),
      run: () => this.viewModel.toggleCollapsed(entry)
    };
    templateData.actionBar.push(toggleCollapseAction, { icon: true, label: false });
  }
  renderModelElement(entry, index, templateData) {
    this.renderModelVisibilityElement(entry, templateData);
  }
  renderGroupVisibilityElement(entry, templateData) {
    const hidden = entry.hidden;
    templateData.actionBar.push({
      id: hidden ? "showGroup" : "hideGroup",
      label: hidden ? localize("models.showGroup", "Show All Models") : localize("models.hideGroup", "Hide All Models"),
      tooltip: hidden ? localize("models.showGroup", "Show All Models") : localize("models.hideGroup", "Hide All Models"),
      class: `model-visibility-toggle ${ThemeIcon.asClassName(hidden ? Codicon.eyeClosed : Codicon.eye)}`,
      enabled: true,
      run: () => this.viewModel.toggleGroupHidden(entry)
    }, { icon: true, label: false });
  }
  renderModelVisibilityElement(entry, templateData) {
    const hidden = entry.model.hidden;
    templateData.actionBar.push({
      id: hidden ? "showModel" : "hideModel",
      label: hidden ? localize("models.showModel", "Show Model") : localize("models.hideModel", "Hide Model"),
      tooltip: hidden ? localize("models.showModel", "Show Model") : localize("models.hideModel", "Hide Model"),
      class: `model-visibility-toggle ${ThemeIcon.asClassName(hidden ? Codicon.eyeClosed : Codicon.eye)}`,
      enabled: true,
      run: () => this.viewModel.toggleModelHidden(entry)
    }, { icon: true, label: false });
  }
};
_GutterColumnRenderer.TEMPLATE_ID = "gutter";
let GutterColumnRenderer = _GutterColumnRenderer;
let ModelNameColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(hoverService, instantiationService, productService, environmentService) {
    super();
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.productService = productService;
    this.environmentService = environmentService;
    this.templateId = ModelNameColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const nameContainer = DOM.append(container, $(".model-name-container"));
    const statusIcon = DOM.append(nameContainer, $(".status-icon"));
    const providerIcon = DOM.append(nameContainer, $(".model-provider-icon"));
    providerIcon.setAttribute("aria-hidden", "true");
    const nameLabel = disposables.add(new HighlightedLabel(DOM.append(nameContainer, $(".model-name"))));
    const sourceDescription = DOM.append(nameContainer, $(".model-source-description"));
    sourceDescription.style.display = "none";
    const deprecationLinkContainer = DOM.append(nameContainer, $(".model-deprecation-link"));
    deprecationLinkContainer.style.display = "none";
    const deprecationLink = disposables.add(this.instantiationService.createInstance(Link, deprecationLinkContainer, { label: "", href: "" }, {}));
    const modelStatusIcon = DOM.append(nameContainer, $(".model-status-icon"));
    return {
      container,
      statusIcon,
      providerIcon,
      nameLabel,
      sourceDescription,
      modelStatusIcon,
      deprecationLinkContainer,
      deprecationLink,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    DOM.clearNode(templateData.modelStatusIcon);
    templateData.providerIcon.className = "model-provider-icon";
    templateData.providerIcon.style.display = "none";
    templateData.sourceDescription.textContent = "";
    templateData.sourceDescription.style.display = "none";
    templateData.nameLabel.element.classList.remove("error-status", "warning-status", "info-status");
    templateData.deprecationLinkContainer.style.display = "none";
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
    templateData.nameLabel.set(entry.vendorEntry.group.name, void 0);
    if (entry.sourcePresentation?.icon) {
      templateData.providerIcon.classList.add(...ThemeIcon.asClassNameArray(entry.sourcePresentation.icon));
      templateData.providerIcon.style.display = "";
    }
    if (entry.sourcePresentation?.description) {
      templateData.sourceDescription.textContent = entry.sourcePresentation.description;
      templateData.sourceDescription.style.display = "";
    }
    const deprecationLink = entry.vendorEntry.vendor.deprecation?.link;
    if (deprecationLink && !this.environmentService.isSessionsWindow) {
      const icon = $("span");
      icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.linkExternal));
      icon.setAttribute("aria-hidden", "true");
      const label = $("span.model-deprecation-link-label", void 0, localize("models.deprecation.link.label", "Migrate"), icon);
      templateData.deprecationLink.link = {
        label,
        href: resolveProviderDeprecationLink(deprecationLink, this.productService.urlProtocol).toString(),
        title: localize("models.deprecation.link.tooltip", "The Ollama model provider is deprecated. Please migrate to the official extension.")
      };
      templateData.deprecationLinkContainer.style.display = "";
    }
  }
  renderGroupElement(entry, index, templateData) {
    templateData.nameLabel.set(entry.label, void 0);
  }
  renderModelElement(entry, index, templateData) {
    const { model: modelEntry, modelNameMatches } = entry;
    templateData.statusIcon.style.display = "none";
    templateData.modelStatusIcon.className = "model-status-icon";
    if (modelEntry.metadata.statusIcon) {
      templateData.modelStatusIcon.classList.add(...ThemeIcon.asClassNameArray(modelEntry.metadata.statusIcon));
      templateData.modelStatusIcon.style.display = "";
    } else {
      templateData.modelStatusIcon.style.display = "none";
    }
    templateData.nameLabel.set(modelEntry.metadata.name, modelNameMatches);
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    markdown.appendMarkdown(`**${entry.model.metadata.name}**`);
    if (entry.model.metadata.id !== entry.model.metadata.version) {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}&#64;${entry.model.metadata.version}_&nbsp;</span>`);
    } else {
      markdown.appendMarkdown(`&nbsp;<span style="background-color:#8080802B;">&nbsp;_${entry.model.metadata.id}_&nbsp;</span>`);
    }
    markdown.appendText(`
`);
    if (entry.model.metadata.statusIcon && entry.model.metadata.tooltip) {
      if (entry.model.metadata.statusIcon) {
        markdown.appendMarkdown(`$(${entry.model.metadata.statusIcon.id})&nbsp;`);
      }
      markdown.appendMarkdown(`${entry.model.metadata.tooltip}`);
      markdown.appendText(`
`);
    }
    templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
      content: markdown,
      appearance: {
        compact: true,
        skipFadeInAnimation: true
      }
    })));
  }
  renderStatusElement(entry, index, templateData) {
    templateData.statusIcon.style.display = "";
    templateData.statusIcon.className = "status-icon";
    switch (entry.severity) {
      case Severity.Error:
        templateData.nameLabel.element.classList.add("error-status");
        templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
        break;
      case Severity.Warning:
        templateData.nameLabel.element.classList.add("warning-status");
        templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
        break;
      case Severity.Info:
        templateData.nameLabel.element.classList.add("info-status");
        templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
        break;
    }
    templateData.nameLabel.set(entry.message, void 0, entry.message);
  }
};
ModelNameColumnRenderer.TEMPLATE_ID = "modelName";
ModelNameColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IWorkbenchEnvironmentService)
], ModelNameColumnRenderer);
let CombinedCostColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(hoverService) {
    super();
    this.hoverService = hoverService;
    this.templateId = CombinedCostColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const grid = DOM.append(container, $(".model-cost-grid"));
    const inputCell = DOM.append(grid, $("span.model-cost-cell"));
    const outputCell = DOM.append(grid, $("span.model-cost-cell"));
    const cacheReadCell = DOM.append(grid, $("span.model-cost-cell"));
    const cacheWriteCell = DOM.append(grid, $("span.model-cost-cell"));
    return {
      container,
      inputCell,
      outputCell,
      cacheReadCell,
      cacheWriteCell,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    templateData.inputCell.textContent = "";
    templateData.outputCell.textContent = "";
    templateData.cacheReadCell.textContent = "";
    templateData.cacheWriteCell.textContent = "";
    super.renderElement(entry, index, templateData);
  }
  renderGroupElement(_element, _index, _templateData) {
  }
  renderVendorElement(_element, _index, _templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const { inputCost, outputCost, cacheCost, cacheWriteCost } = entry.model.metadata;
    const hasCost = inputCost !== void 0 || outputCost !== void 0 || cacheCost !== void 0 || cacheWriteCost !== void 0;
    if (hasCost) {
      templateData.inputCell.textContent = inputCost !== void 0 ? localize("cost.input", "In: {0}", inputCost) : "";
      templateData.outputCell.textContent = outputCost !== void 0 ? localize("cost.output", "Out: {0}", outputCost) : "";
      templateData.cacheReadCell.textContent = cacheCost !== void 0 ? localize("cost.cacheRead", "Cache Read: {0}", cacheCost) : "";
      templateData.cacheWriteCell.textContent = cacheWriteCost !== void 0 ? localize("cost.cacheWrite", "Cache Write: {0}", cacheWriteCost) : "";
      const parts = [];
      if (inputCost !== void 0) {
        parts.push(inputCost === 1 ? localize("cost.inputHover.singular", "Input: {0} credit per 1M tokens", inputCost) : localize("cost.inputHover.plural", "Input: {0} credits per 1M tokens", inputCost));
      }
      if (outputCost !== void 0) {
        parts.push(outputCost === 1 ? localize("cost.outputHover.singular", "Output: {0} credit per 1M tokens", outputCost) : localize("cost.outputHover.plural", "Output: {0} credits per 1M tokens", outputCost));
      }
      if (cacheCost !== void 0) {
        parts.push(cacheCost === 1 ? localize("cost.cacheHover.singular", "Cache Read: {0} credit per 1M tokens", cacheCost) : localize("cost.cacheHover.plural", "Cache Read: {0} credits per 1M tokens", cacheCost));
      }
      if (cacheWriteCost !== void 0) {
        parts.push(cacheWriteCost === 1 ? localize("cost.cacheWriteHover.singular", "Cache Write: {0} credit per 1M tokens", cacheWriteCost) : localize("cost.cacheWriteHover.plural", "Cache Write: {0} credits per 1M tokens", cacheWriteCost));
      }
      templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
        content: parts.join("\n"),
        appearance: {
          compact: true,
          skipFadeInAnimation: true
        }
      })));
    } else {
      const pricingText = entry.model.metadata.pricing;
      if (pricingText) {
        templateData.inputCell.textContent = pricingText;
        templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
          content: localize("pricing.tooltip", "Pricing: {0}", pricingText),
          appearance: {
            compact: true,
            skipFadeInAnimation: true
          }
        })));
      }
    }
  }
};
CombinedCostColumnRenderer.TEMPLATE_ID = "combinedCost";
CombinedCostColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], CombinedCostColumnRenderer);
let TokenLimitsColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(hoverService) {
    super();
    this.hoverService = hoverService;
    this.templateId = TokenLimitsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const tokenLimitsElement = DOM.append(container, $(".model-token-limits"));
    return {
      container,
      tokenLimitsElement,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    DOM.clearNode(templateData.tokenLimitsElement);
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
  }
  renderGroupElement(entry, index, templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const { model: modelEntry } = entry;
    const markdown = new MarkdownString("", { isTrusted: true, supportThemeIcons: true });
    if (modelEntry.metadata.maxInputTokens || modelEntry.metadata.maxOutputTokens) {
      const totalTokens = (modelEntry.metadata.maxInputTokens ?? 0) + (modelEntry.metadata.maxOutputTokens ?? 0);
      const tokenDiv = DOM.append(templateData.tokenLimitsElement, $(".token-limit-item"));
      const tokenText = DOM.append(tokenDiv, $("span"));
      tokenText.textContent = formatTokenCount(totalTokens);
      markdown.appendMarkdown(`${localize("models.contextSize", "Context Size")}: `);
      markdown.appendMarkdown(`${formatTokenCount(totalTokens)}`);
    }
    templateData.elementDisposables.add(this.hoverService.setupDelayedHoverAtMouse(templateData.container, () => ({
      content: markdown,
      appearance: {
        compact: true,
        skipFadeInAnimation: true
      }
    })));
  }
};
TokenLimitsColumnRenderer.TEMPLATE_ID = "tokenLimits";
TokenLimitsColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], TokenLimitsColumnRenderer);
const _CapabilitiesColumnRenderer = class _CapabilitiesColumnRenderer extends ModelsTableColumnRenderer {
  constructor() {
    super(...arguments);
    this.templateId = _CapabilitiesColumnRenderer.TEMPLATE_ID;
    this._onDidClickCapability = new Emitter();
    this.onDidClickCapability = this._onDidClickCapability.event;
  }
  dispose() {
    this._onDidClickCapability.dispose();
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("model-capability-column");
    const metadataRow = DOM.append(container, $(".model-capabilities"));
    return {
      container,
      metadataRow,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    DOM.clearNode(templateData.metadataRow);
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
  }
  renderGroupElement(entry, index, templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const { model: modelEntry, capabilityMatches } = entry;
    if (modelEntry.metadata.capabilities?.toolCalling) {
      templateData.elementDisposables.add(this.createCapabilityButton(
        templateData.metadataRow,
        capabilityMatches?.includes("toolCalling") || false,
        localize("models.tools", "Tools"),
        "tools"
      ));
    }
    if (modelEntry.metadata.capabilities?.vision) {
      templateData.elementDisposables.add(this.createCapabilityButton(
        templateData.metadataRow,
        capabilityMatches?.includes("vision") || false,
        localize("models.vision", "Vision"),
        "vision"
      ));
    }
  }
  createCapabilityButton(container, isActive, label, capability) {
    const disposables = new DisposableStore();
    const buttonContainer = DOM.append(container, $(".model-badge-container"));
    const button = disposables.add(new Button(buttonContainer, { secondary: true }));
    button.element.classList.add("model-capability");
    button.element.classList.toggle("active", isActive);
    button.label = label;
    disposables.add(button.onDidClick(() => this._onDidClickCapability.fire(capability)));
    return disposables;
  }
};
_CapabilitiesColumnRenderer.TEMPLATE_ID = "capabilities";
let CapabilitiesColumnRenderer = _CapabilitiesColumnRenderer;
function createProviderGroupActions(viewModel, vendor, groupName, languageModelsService, dialogService) {
  const configuration = vendor.configuration;
  if (!configuration) {
    return [];
  }
  const actions = [];
  const configurationProperties = configuration.properties;
  actions.push(toAction({
    id: "goToSettingsAction",
    label: localize("models.goToSettings", "Open in Language Models (JSON)"),
    run: () => languageModelsService.openLanguageModelsProviderGroupSettings(vendor.vendor, groupName)
  }));
  actions.push(new Separator());
  actions.push(toAction({
    id: "renameGroupAction",
    label: localize("models.renameGroup", "Rename Group"),
    run: () => languageModelsService.renameLanguageModelsProviderGroup(vendor.vendor, groupName)
  }));
  if (configurationProperties?.apiKey) {
    actions.push(toAction({
      id: "updateApiKeyAction",
      label: localize("models.updateApiKey", "Update API Key"),
      run: () => languageModelsService.updateLanguageModelsProviderGroupApiKey(vendor.vendor, groupName)
    }));
  }
  if (configurationProperties?.models?.defaultSnippets?.[0]) {
    actions.push(toAction({
      id: "addModelAction",
      label: localize("models.addModel", "Add Model"),
      run: () => languageModelsService.addLanguageModelsProviderGroupModel(vendor.vendor, groupName)
    }));
  }
  actions.push(new Separator());
  actions.push(toAction({
    id: "deleteAction",
    label: localize("models.deleteAction", "Delete"),
    class: ThemeIcon.asClassName(Codicon.trash),
    run: async () => {
      const result = await dialogService.confirm({
        type: "info",
        message: localize("models.deleteConfirmation", "Would you like to delete {0}?", groupName)
      });
      if (!result.confirmed) {
        return;
      }
      await languageModelsService.removeLanguageModelsProviderGroup(vendor.vendor, groupName);
      viewModel.refresh();
    }
  }));
  return actions;
}
let ActionsColumnRenderer = class extends ModelsTableColumnRenderer {
  constructor(viewModel, instantiationService, languageModelsService, dialogService, commandService, contextMenuService) {
    super();
    this.viewModel = viewModel;
    this.instantiationService = instantiationService;
    this.languageModelsService = languageModelsService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.contextMenuService = contextMenuService;
    this.templateId = ActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("models-actions-column");
    const parent = DOM.append(container, $(".actions-container"));
    const actionBar = disposables.add(this.instantiationService.createInstance(
      ToolBar,
      parent,
      this.contextMenuService,
      {
        icon: true,
        label: false,
        moreIcon: Codicon.gear,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT
      }
    ));
    return {
      container,
      actionBar,
      disposables,
      elementDisposables
    };
  }
  renderElement(entry, index, templateData) {
    templateData.actionBar.setActions([]);
    super.renderElement(entry, index, templateData);
  }
  renderVendorElement(entry, index, templateData) {
    const { vendorEntry } = entry;
    const primaryActions = [];
    const secondaryActions = [];
    if (vendorEntry.vendor.configuration) {
      secondaryActions.push(...createProviderGroupActions(this.viewModel, vendorEntry.vendor, vendorEntry.group.name, this.languageModelsService, this.dialogService));
    } else if (vendorEntry.vendor.managementCommand) {
      primaryActions.push(toAction({
        id: "manageVendor",
        label: localize("models.manageProvider", "Manage {0}...", vendorEntry.group.name),
        class: ThemeIcon.asClassName(Codicon.gear),
        run: async () => {
          await this.commandService.executeCommand(vendorEntry.vendor.managementCommand, vendorEntry.vendor.vendor);
          this.viewModel.refresh();
        }
      }));
    }
    templateData.actionBar.setActions(primaryActions, secondaryActions);
  }
  renderGroupElement(entry, index, templateData) {
  }
  renderModelElement(entry, index, templateData) {
    const primaryActions = [];
    if (entry.model.metadata.id !== "auto") {
      primaryActions.push(this.createPinAction(entry.model.identifier));
    }
    const configActions = this.languageModelsService.getModelConfigurationActions(entry.model.identifier);
    const secondaryActions = [...configActions];
    const vendor = entry.model.provider.vendor;
    if (!vendor.isDefault && !vendor.managementCommand && (configActions.length > 0 || entry.model.metadata.configurationSchema)) {
      secondaryActions.push(toAction({
        id: "configureModel",
        label: localize("models.configureModel", "Configure..."),
        run: () => this.languageModelsService.configureModel(entry.model.identifier)
      }));
    }
    templateData.actionBar.setActions(primaryActions, secondaryActions);
  }
  createPinAction(modelIdentifier) {
    const isPinned = this.languageModelsService.isModelPinned(modelIdentifier);
    return toAction({
      id: isPinned ? `unpin.${modelIdentifier}` : `pin.${modelIdentifier}`,
      label: isPinned ? localize("models.unpinModel", "Unpin Model") : localize("models.pinModel", "Pin Model"),
      class: ThemeIcon.asClassName(isPinned ? Codicon.pinned : Codicon.pin),
      run: () => {
        if (isPinned) {
          this.languageModelsService.unpinModel(modelIdentifier);
        } else {
          this.languageModelsService.pinModel(modelIdentifier);
        }
        this.viewModel.refresh();
      }
    });
  }
};
ActionsColumnRenderer.TEMPLATE_ID = "actions";
ActionsColumnRenderer = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IContextMenuService)
], ActionsColumnRenderer);
const _ProviderColumnRenderer = class _ProviderColumnRenderer extends ModelsTableColumnRenderer {
  constructor() {
    super(...arguments);
    this.templateId = _ProviderColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    const providerElement = DOM.append(container, $(".model-provider"));
    return {
      container,
      providerElement,
      disposables,
      elementDisposables
    };
  }
  renderVendorElement(entry, index, templateData) {
    templateData.providerElement.textContent = "";
  }
  renderGroupElement(entry, index, templateData) {
    templateData.providerElement.textContent = "";
  }
  renderModelElement(entry, index, templateData) {
    templateData.providerElement.textContent = getManageModelsProviderLabel(entry.model);
  }
};
_ProviderColumnRenderer.TEMPLATE_ID = "provider";
let ProviderColumnRenderer = _ProviderColumnRenderer;
let ChatModelsWidget = class extends Disposable {
  constructor(languageModelsService, instantiationService, extensionService, contextMenuService, chatEntitlementService, editorProgressService, commandService, editorGroupsService, contextKeyService, dialogService, extensionsWorkbenchService, environmentService, defaultAccountService) {
    super();
    this.languageModelsService = languageModelsService;
    this.instantiationService = instantiationService;
    this.extensionService = extensionService;
    this.contextMenuService = contextMenuService;
    this.chatEntitlementService = chatEntitlementService;
    this.editorProgressService = editorProgressService;
    this.commandService = commandService;
    this.editorGroupsService = editorGroupsService;
    this.contextKeyService = contextKeyService;
    this.dialogService = dialogService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.environmentService = environmentService;
    this.defaultAccountService = defaultAccountService;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this.tableMinWidth = 0;
    this.dropdownActions = [];
    this.defaultAccountResolved = false;
    this.tableDisposables = this._register(new DisposableStore());
    this.searchFocusContextKey = CONTEXT_MODELS_SEARCH_FOCUS.bindTo(this.contextKeyService);
    this.delayedFiltering = this._register(new Delayer(200));
    this.viewModel = this._register(this.instantiationService.createInstance(ChatModelsViewModel));
    this.element = DOM.$(".models-widget");
    this.create(this.element);
    this._register(this.defaultAccountService.onDidChangeDefaultAccount(() => {
      this.defaultAccountResolved = true;
      this.updateAddModelsButton();
    }));
    this.defaultAccountService.getDefaultAccount().then(() => {
      if (!this._store.isDisposed) {
        this.defaultAccountResolved = true;
        this.updateAddModelsButton();
      }
    });
    const loadingPromise = this.extensionService.whenInstalledExtensionsRegistered().then(() => this.viewModel.refresh());
    this.editorProgressService.showWhile(loadingPromise, 300);
  }
  create(container) {
    const searchAndButtonContainer = DOM.append(container, $(".models-search-and-button-container"));
    const placeholder = localize("Search.FullTextSearchPlaceholder", "Type to search...");
    const searchContainer = DOM.append(searchAndButtonContainer, $(".models-search-container"));
    this.searchWidget = this._register(this.instantiationService.createInstance(
      SuggestEnabledInput,
      "chatModelsWidget.searchbox",
      searchContainer,
      {
        triggerCharacters: ["@", ":"],
        provideResults: (query) => {
          const providerSuggestions = this.viewModel.getVendors().map((v) => `@provider:"${v.displayName}"`);
          const allSuggestions = [
            ...providerSuggestions,
            ...SEARCH_SUGGESTIONS.CAPABILITIES
          ];
          if (!query.trim()) {
            return allSuggestions;
          }
          const queryParts = query.split(/\s/g);
          const lastPart = queryParts[queryParts.length - 1];
          if (lastPart.startsWith("@provider:")) {
            return providerSuggestions;
          } else if (lastPart.startsWith("@capability:")) {
            return SEARCH_SUGGESTIONS.CAPABILITIES;
          } else if (lastPart.startsWith("@")) {
            return allSuggestions;
          }
          return [];
        }
      },
      placeholder,
      `chatModelsWidget:searchinput:${ChatModelsWidget.NUM_INSTANCES++}`,
      {
        placeholderText: placeholder,
        styleOverrides: {
          inputBorder: settingsTextInputBorder
        },
        focusContextKey: this.searchFocusContextKey
      }
    ));
    const filterAction = this._register(new ModelsFilterAction());
    const clearSearchAction = this._register(new Action(
      "workbench.models.clearSearch",
      localize("clearSearch", "Clear Search"),
      ThemeIcon.asClassName(preferencesClearInputIcon),
      false,
      () => this.clearSearch()
    ));
    const collapseAllAction = this._register(new Action(
      "workbench.models.collapseAll",
      localize("collapseAll", "Collapse All"),
      ThemeIcon.asClassName(Codicon.collapseAll),
      false,
      () => {
        this.viewModel.collapseAll();
      }
    ));
    collapseAllAction.enabled = this.viewModel.viewModelEntries.some((e) => isLanguageModelGroupEntry(e) || isLanguageModelProviderEntry(e));
    this._register(this.viewModel.onDidChange(() => collapseAllAction.enabled = this.viewModel.viewModelEntries.some((e) => isLanguageModelProviderEntry(e) || isLanguageModelGroupEntry(e))));
    this._register(this.searchWidget.onInputDidChange(() => {
      clearSearchAction.enabled = !!this.searchWidget.getValue();
      this.filterModels();
    }));
    this.searchActionsContainer = DOM.append(searchContainer, $(".models-search-actions"));
    const actions = [clearSearchAction, collapseAllAction, filterAction];
    const toolBar = this._register(new ToolBar(this.searchActionsContainer, this.contextMenuService, {
      actionViewItemProvider: (action, options) => {
        if (action.id === filterAction.id) {
          return this.instantiationService.createInstance(ModelsSearchFilterDropdownMenuActionViewItem, action, options, {
            getValue: () => this.searchWidget.getValue(),
            setValue: (searchValue) => this.search(searchValue)
          }, this.viewModel);
        }
        return void 0;
      },
      getKeyBinding: () => void 0
    }));
    toolBar.setActions(actions);
    this.searchWidget.inputWidget.getContainerDomNode().style.paddingRight = `${DOM.getTotalWidth(this.searchActionsContainer) + 12}px`;
    this.addButtonContainer = DOM.append(searchAndButtonContainer, $(".section-title-actions"));
    const buttonOptions = {
      ...defaultButtonStyles,
      supportIcons: true
    };
    this.addButton = this._register(new Button(this.addButtonContainer, buttonOptions));
    this.addButton.label = `$(${Codicon.add.id}) ${localize("models.enableModelProvider", "Add Models")}`;
    this.addButton.element.classList.add("models-add-model-button");
    this.updateAddModelsButton();
    this._register(this.addButton.onDidClick((e) => {
      if (this.dropdownActions.length > 0) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => this.addButton.element,
          getActions: () => this.dropdownActions
        });
      }
    }));
    if (!this.environmentService.isSessionsWindow) {
      const browseMarketplaceButton = this._register(new Button(this.addButtonContainer, {
        ...buttonOptions,
        secondary: true
      }));
      browseMarketplaceButton.label = `$(${Codicon.extensions.id}) ${localize("models.installProviderExtensions", "Install Model Providers")}`;
      browseMarketplaceButton.element.classList.add("models-browse-marketplace-button");
      this._register(browseMarketplaceButton.onDidClick(() => this.openLanguageModelProviderExtensionsSearch()));
    }
    this.tableContainer = DOM.append(container, $(".models-table-container"));
    this.createTable();
    this._register(this.viewModel.onDidChangeGrouping(() => this.createTable()));
    this._register(this.chatEntitlementService.onDidChangeEntitlement(() => {
      this.updateAddModelsButton();
      this.createTable();
    }));
    this._register(this.chatEntitlementService.onDidChangeUsageBasedBilling(() => this.createTable()));
    this._register(this.languageModelsService.onDidChangeLanguageModelVendors(() => this.updateAddModelsButton()));
    this._register(this.languageModelsService.onDidChangePinnedModels(() => this.viewModel.refresh()));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(/* @__PURE__ */ new Set(["github.copilot.clientByokEnabled"]))) {
        this.updateAddModelsButton();
      }
    }));
  }
  createTable() {
    this.tableDisposables.clear();
    DOM.clearNode(this.tableContainer);
    this.tableViewport = $(".models-table-viewport");
    this.tableInner = DOM.append(this.tableViewport, $(".models-table-inner"));
    this.tableScrollable = this.tableDisposables.add(new DomScrollableElement(this.tableViewport, {
      horizontal: ScrollbarVisibility.Auto,
      vertical: ScrollbarVisibility.Hidden,
      useShadows: false,
      scrollYToX: true
    }));
    this.tableContainer.appendChild(this.tableScrollable.getDomNode());
    const gutterColumnRenderer = this.instantiationService.createInstance(GutterColumnRenderer, this.viewModel);
    const modelNameColumnRenderer = this.instantiationService.createInstance(ModelNameColumnRenderer);
    const combinedCostColumnRenderer = this.instantiationService.createInstance(CombinedCostColumnRenderer);
    const tokenLimitsColumnRenderer = this.instantiationService.createInstance(TokenLimitsColumnRenderer);
    const capabilitiesColumnRenderer = this.instantiationService.createInstance(CapabilitiesColumnRenderer);
    const actionsColumnRenderer = this.instantiationService.createInstance(ActionsColumnRenderer, this.viewModel);
    const providerColumnRenderer = this.instantiationService.createInstance(ProviderColumnRenderer);
    this.tableDisposables.add(capabilitiesColumnRenderer);
    this.tableDisposables.add(capabilitiesColumnRenderer.onDidClickCapability((capability) => {
      const currentQuery = this.searchWidget.getValue();
      const query = `@capability:${capability}`;
      const newQuery = toggleFilter(currentQuery, { query });
      this.search(newQuery);
    }));
    const columns = [
      {
        label: "",
        tooltip: "",
        weight: 0.05,
        minimumWidth: 64,
        maximumWidth: 64,
        templateId: GutterColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: localize("modelName", "Name"),
        tooltip: "",
        weight: 0.35,
        minimumWidth: 200,
        templateId: ModelNameColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      }
    ];
    const isUBB = this.chatEntitlementService.quotas.usageBasedBilling === true;
    columns.push(
      {
        label: localize("tokenLimits", "Context Size"),
        tooltip: "",
        weight: 0.1,
        minimumWidth: 140,
        templateId: TokenLimitsColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: localize("capabilities", "Capabilities"),
        tooltip: "",
        weight: 0.15,
        minimumWidth: 180,
        templateId: CapabilitiesColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: isUBB ? localize("cost", "Cost (Credits per 1M Tokens)") : localize("pricing", "Pricing"),
        tooltip: "",
        weight: isUBB ? 0.24 : 0.15,
        minimumWidth: isUBB ? 240 : 200,
        templateId: CombinedCostColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      },
      {
        label: "",
        tooltip: "",
        weight: 0.05,
        minimumWidth: 64,
        maximumWidth: 64,
        templateId: ActionsColumnRenderer.TEMPLATE_ID,
        project(row) {
          return row;
        }
      }
    );
    this.tableMinWidth = columns.reduce((sum, c) => sum + c.minimumWidth, 0);
    this.tableInner.style.minWidth = `${this.tableMinWidth}px`;
    this.table = this.tableDisposables.add(this.instantiationService.createInstance(
      WorkbenchTable,
      "ModelsWidget",
      this.tableInner,
      new Delegate(),
      columns,
      [
        gutterColumnRenderer,
        modelNameColumnRenderer,
        combinedCostColumnRenderer,
        tokenLimitsColumnRenderer,
        capabilitiesColumnRenderer,
        actionsColumnRenderer,
        providerColumnRenderer
      ],
      {
        identityProvider: { getId: (e) => e.id },
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (e) => {
            if (isLanguageModelProviderEntry(e)) {
              return e.hidden ? localize("vendor.hidden.ariaLabel", "{0} Models (hidden)", e.vendorEntry.group.name) : localize("vendor.ariaLabel", "{0} Models", e.vendorEntry.group.name);
            } else if (isLanguageModelGroupEntry(e)) {
              return e.id === "visible" ? localize("visible.ariaLabel", "Visible Models") : localize("hidden.ariaLabel", "Hidden Models");
            } else if (isStatusEntry(e)) {
              return localize("status.ariaLabel", "Status: {0}", e.message);
            }
            const ariaLabels = [];
            ariaLabels.push(e.model.hidden ? localize("model.name.hidden", "{0} from {1} (hidden)", e.model.metadata.name, getManageModelsProviderLabel(e.model)) : localize("model.name", "{0} from {1}", e.model.metadata.name, getManageModelsProviderLabel(e.model)));
            if (e.model.metadata.maxInputTokens || e.model.metadata.maxOutputTokens) {
              const totalTokens = (e.model.metadata.maxInputTokens ?? 0) + (e.model.metadata.maxOutputTokens ?? 0);
              ariaLabels.push(localize("model.contextSize.totalTokens", "Context size: {0} tokens", formatTokenCount(totalTokens)));
            }
            if (e.model.metadata.capabilities) {
              ariaLabels.push(localize("model.capabilities", "Capabilities: {0}", Object.keys(e.model.metadata.capabilities).join(", ")));
            }
            const pricingText = e.model.metadata.pricing ?? "-";
            if (pricingText !== "-") {
              ariaLabels.push(localize("pricing.ariaLabel", "Pricing: {0}", pricingText));
            }
            if (e.model.metadata.inputCost !== void 0) {
              ariaLabels.push(e.model.metadata.inputCost === 1 ? localize("inputCost.ariaLabel.singular", "Input cost: {0} credit per 1M tokens", e.model.metadata.inputCost) : localize("inputCost.ariaLabel.plural", "Input cost: {0} credits per 1M tokens", e.model.metadata.inputCost));
            }
            if (e.model.metadata.cacheCost !== void 0) {
              ariaLabels.push(e.model.metadata.cacheCost === 1 ? localize("cacheCost.ariaLabel.singular", "Cache read cost: {0} credit per 1M tokens", e.model.metadata.cacheCost) : localize("cacheCost.ariaLabel.plural", "Cache read cost: {0} credits per 1M tokens", e.model.metadata.cacheCost));
            }
            if (e.model.metadata.cacheWriteCost !== void 0) {
              ariaLabels.push(e.model.metadata.cacheWriteCost === 1 ? localize("cacheWriteCost.ariaLabel.singular", "Cache write cost: {0} credit per 1M tokens", e.model.metadata.cacheWriteCost) : localize("cacheWriteCost.ariaLabel.plural", "Cache write cost: {0} credits per 1M tokens", e.model.metadata.cacheWriteCost));
            }
            if (e.model.metadata.outputCost !== void 0) {
              ariaLabels.push(e.model.metadata.outputCost === 1 ? localize("outputCost.ariaLabel.singular", "Output cost: {0} credit per 1M tokens", e.model.metadata.outputCost) : localize("outputCost.ariaLabel.plural", "Output cost: {0} credits per 1M tokens", e.model.metadata.outputCost));
            }
            return ariaLabels.join(". ");
          },
          getWidgetAriaLabel: () => localize("modelsTable.ariaLabel", "Language Models")
        },
        multipleSelectionSupport: true,
        setRowLineHeight: false,
        openOnSingleClick: true,
        alwaysConsumeMouseWheel: false
      }
    ));
    this.tableDisposables.add(this.table.onContextMenu((e) => {
      if (!e.element) {
        return;
      }
      const selection = this.table.getSelection();
      const selectedEntries = selection.every((i) => i !== e.index) ? [e.element] : selection.map((i) => this.viewModel.viewModelEntries[i]).filter((e2) => !!e2);
      const selectedModelEntries = selectedEntries.filter(
        (entry) => !isLanguageModelProviderEntry(entry) && !isLanguageModelGroupEntry(entry) && !isStatusEntry(entry)
      );
      const actions = [];
      let configureGroup;
      let configureVendor;
      if (selectedModelEntries.length) {
        const pinnableEntries = selectedModelEntries.filter((e2) => e2.model.metadata.id !== "auto");
        if (pinnableEntries.length > 0) {
          const allPinned = pinnableEntries.every((e2) => this.languageModelsService.isModelPinned(e2.model.identifier));
          actions.push(toAction({
            id: allPinned ? "unpinModels" : "pinModels",
            label: allPinned ? localize("models.unpinModel", "Unpin Model") : localize("models.pinModel", "Pin Model"),
            class: ThemeIcon.asClassName(allPinned ? Codicon.pinned : Codicon.pin),
            run: () => {
              for (const entry of pinnableEntries) {
                if (allPinned) {
                  this.languageModelsService.unpinModel(entry.model.identifier);
                } else {
                  this.languageModelsService.pinModel(entry.model.identifier);
                }
              }
            }
          }));
        }
        const allHidden = selectedModelEntries.every((e2) => e2.model.hidden);
        actions.push(toAction({
          id: allHidden ? "showModels" : "hideModels",
          label: allHidden ? selectedModelEntries.length === 1 ? localize("models.showModel", "Show Model") : localize("models.showModelsPlural", "Show Models") : selectedModelEntries.length === 1 ? localize("models.hideModel", "Hide Model") : localize("models.hideModelsPlural", "Hide Models"),
          class: ThemeIcon.asClassName(allHidden ? Codicon.eyeClosed : Codicon.eye),
          run: () => this.viewModel.setModelsHidden(selectedModelEntries, !allHidden)
        }));
        if (selectedModelEntries.length === 1) {
          const configActions = this.languageModelsService.getModelConfigurationActions(selectedModelEntries[0].model.identifier);
          if (configActions.length) {
            actions.push(new Separator());
            actions.push(...configActions);
          }
        }
        configureGroup = selectedModelEntries[0].model.provider.group.name;
        configureVendor = selectedModelEntries[0].model.provider.vendor;
        if (selectedModelEntries.some((entry) => entry.model.provider.vendor.isDefault || entry.model.provider.group.name !== configureGroup)) {
          configureGroup = void 0;
          configureVendor = void 0;
        }
      } else if (selectedEntries.length === 1) {
        const entry = e.element;
        if (isLanguageModelProviderEntry(entry)) {
          configureGroup = entry.vendorEntry.group.name;
          configureVendor = entry.vendorEntry.vendor;
          actions.push(toAction({
            id: entry.hidden ? "showGroup" : "hideGroup",
            label: entry.hidden ? localize("models.showGroup", "Show All Models") : localize("models.hideGroup", "Hide All Models"),
            class: ThemeIcon.asClassName(entry.hidden ? Codicon.eyeClosed : Codicon.eye),
            run: () => this.viewModel.toggleGroupHidden(entry)
          }));
        }
      }
      if (configureGroup && configureVendor) {
        const groupActions = configureVendor.managementCommand ? [toAction({
          id: "manageVendor",
          label: localize("models.manageProvider", "Manage {0}...", configureGroup),
          run: async () => {
            await this.commandService.executeCommand(configureVendor.managementCommand, configureVendor.vendor);
            await this.viewModel.refresh();
          }
        })] : createProviderGroupActions(this.viewModel, configureVendor, configureGroup, this.languageModelsService, this.dialogService);
        if (groupActions.length) {
          if (actions.length) {
            actions.push(new Separator());
          }
          actions.push(...groupActions);
        }
      }
      if (actions.length > 0) {
        this.contextMenuService.showContextMenu({
          getAnchor: () => e.anchor,
          getActions: () => actions
        });
      }
    }));
    this.table.splice(0, this.table.length, this.viewModel.viewModelEntries);
    this._onDidChangeItemCount.fire(this.itemCount);
    this.tableDisposables.add(this.viewModel.onDidChange(({ at, removed, added }) => {
      this.table.splice(at, removed, added);
      this._onDidChangeItemCount.fire(this.itemCount);
      if (this.viewModel.selectedEntry) {
        const selectedEntryIndex = this.viewModel.viewModelEntries.indexOf(this.viewModel.selectedEntry);
        this.table.setFocus([selectedEntryIndex]);
        this.table.setSelection([selectedEntryIndex]);
      }
    }));
    this.tableDisposables.add(this.table.onDidOpen(async ({ element, browserEvent }) => {
      if (!element) {
        return;
      }
      if (isStatusEntry(element)) {
        return;
      }
      if (isLanguageModelProviderEntry(element) || isLanguageModelGroupEntry(element)) {
        this.viewModel.toggleCollapsed(element);
      }
    }));
    this.tableDisposables.add(this.table.onDidChangeSelection((e) => this.viewModel.selectedEntry = e.elements[0]));
    this.tableDisposables.add(this.table.onDidBlur(() => {
      if (this.viewModel.shouldRefilter()) {
        this.viewModel.filter(this.searchWidget.getValue());
      }
    }));
    this.layout(this.element.clientHeight, this.element.clientWidth);
  }
  updateAddModelsButton() {
    const configurableVendors = this.languageModelsService.getVendors().filter((vendor) => vendor.managementCommand || vendor.configuration);
    const entitlement = this.chatEntitlementService.entitlement;
    const isManagedEntitlement = entitlement === ChatEntitlement.Business || entitlement === ChatEntitlement.Enterprise;
    const supportsAddingModels = this.chatEntitlementService.isInternal || this.chatEntitlementService.clientByokEnabled || entitlement !== ChatEntitlement.Unknown && entitlement !== ChatEntitlement.Available && !isManagedEntitlement;
    this.dropdownActions = buildAddModelsDropdownActions(
      configurableVendors,
      supportsAddingModels,
      (vendor) => this.addModelsForVendor(vendor),
      this.defaultAccountResolved && this.defaultAccountService.currentDefaultAccount === null ? () => this.commandService.executeCommand(CHAT_SETUP_ACTION_ID) : void 0
    );
    this.addButton.enabled = this.dropdownActions.length > 0;
    this.addButton.setTitle(!supportsAddingModels && isManagedEntitlement ? localize("models.managedByOrganization", "Adding models is managed by your organization") : "");
  }
  async openLanguageModelProviderExtensionsSearch() {
    const activeModalEditorPart = this.editorGroupsService.activeModalEditorPart;
    const isInModalEditor = !!activeModalEditorPart && this.editorGroupsService.getPart(this.editorGroupsService.activeGroup) === activeModalEditorPart;
    if (isInModalEditor) {
      await this.commandService.executeCommand(CLOSE_MODAL_EDITOR_COMMAND_ID);
    }
    await this.extensionsWorkbenchService.openSearch(`tag:"${LANGUAGE_MODEL_CHAT_PROVIDER_EXTENSION_TAG}"`, false);
  }
  filterModels() {
    this.delayedFiltering.trigger(() => {
      this.viewModel.filter(this.searchWidget.getValue());
    });
  }
  async addModelsForVendor(vendor) {
    await this.languageModelsService.configureLanguageModelsProviderGroup(vendor.vendor);
    await this.viewModel.refresh();
  }
  layout(height, width) {
    width = width - 24;
    this.searchWidget.layout(new DOM.Dimension(width - this.searchActionsContainer.clientWidth - this.addButtonContainer.clientWidth - 8, 22));
    const tableHeight = height - 40;
    this.tableContainer.style.height = `${tableHeight}px`;
    const tableWidth = Math.max(width, this.tableMinWidth);
    this.table.layout(tableHeight, tableWidth);
    this.tableScrollable?.scanDomNode();
  }
  focusSearch() {
    this.searchWidget.focus();
  }
  search(filter) {
    this.focusSearch();
    this.searchWidget.setValue(filter);
    this.viewModel.filter(filter);
  }
  clearSearch() {
    this.focusSearch();
    this.searchWidget.setValue("");
  }
  render() {
    if (this.viewModel.shouldRefilter()) {
      this.viewModel.filter(this.searchWidget.getValue());
    }
  }
  /**
   * Gets the total model count (excluding vendor/group/status headers).
   */
  get itemCount() {
    return this.viewModel.viewModelEntries.filter((e) => !isLanguageModelProviderEntry(e) && !isLanguageModelGroupEntry(e) && !isStatusEntry(e)).length;
  }
  /**
   * Re-fires the current item count. Call after subscribing to onDidChangeItemCount
   * to ensure the subscriber receives the latest count.
   */
  fireItemCount() {
    this._onDidChangeItemCount.fire(this.itemCount);
  }
};
ChatModelsWidget.NUM_INSTANCES = 0;
ChatModelsWidget = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IChatEntitlementService),
  __decorateParam(5, IEditorProgressService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IEditorGroupsService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IDialogService),
  __decorateParam(10, IExtensionsWorkbenchService),
  __decorateParam(11, IWorkbenchEnvironmentService),
  __decorateParam(12, IDefaultAccountService)
], ChatModelsWidget);
export {
  ChatModelsWidget,
  buildAddModelsDropdownActions,
  getModelHoverContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRNYW5hZ2VtZW50XFxjaGF0TW9kZWxzV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRNb2RlbHNXaWRnZXQuY3NzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIElCdXR0b25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIElMYW5ndWFnZU1vZGVsUHJvdmlkZXJEZXNjcmlwdG9yLCByZXNvbHZlUHJvdmlkZXJEZXByZWNhdGlvbkxpbmsgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRhYmxlVmlydHVhbERlbGVnYXRlLCBJVGFibGVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90YWJsZS90YWJsZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiwgQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWxzVmlld01vZGVsLCBnZXRNYW5hZ2VNb2RlbHNQcm92aWRlckxhYmVsLCBJTGFuZ3VhZ2VNb2RlbCwgSUxhbmd1YWdlTW9kZWxFbnRyeSwgSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIFNFQVJDSF9TVUdHRVNUSU9OUywgaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSwgaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeSwgSVZpZXdNb2RlbEVudHJ5LCBpc1N0YXR1c0VudHJ5LCBJU3RhdHVzRW50cnkgfSBmcm9tICcuL2NoYXRNb2RlbHNWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdEVuYWJsZWRJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zdWdnZXN0RW5hYmxlZElucHV0L3N1Z2dlc3RFbmFibGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHNldHRpbmdzVGV4dElucHV0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vcHJlZmVyZW5jZXMvY29tbW9uL3NldHRpbmdzRWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSwgQ2hhdEVudGl0bGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bkFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgcHJlZmVyZW5jZXNDbGVhcklucHV0SWNvbiB9IGZyb20gJy4uLy4uLy4uL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXNJY29ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDT05URVhUX01PREVMU19TRUFSQ0hfRk9DVVMgfSBmcm9tICcuLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgTEFOR1VBR0VfTU9ERUxfQ0hBVF9QUk9WSURFUl9FWFRFTlNJT05fVEFHIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBmb3JtYXRUb2tlbkNvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVmYXVsdEFjY291bnQvY29tbW9uL2RlZmF1bHRBY2NvdW50LmpzJztcbmltcG9ydCB7IENIQVRfU0VUVVBfQUNUSU9OX0lEIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcblxuY29uc3QgSEVBREVSX0hFSUdIVCA9IDMwO1xuY29uc3QgVkVORE9SX1JPV19IRUlHSFQgPSAzMDtcbmNvbnN0IE1PREVMX1JPV19IRUlHSFQgPSAyNjtcbmNvbnN0IENMT1NFX01PREFMX0VESVRPUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VNb2RhbEVkaXRvcic7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RlbEhvdmVyQ29udGVudChtb2RlbDogSUxhbmd1YWdlTW9kZWwpOiBNYXJrZG93blN0cmluZyB7XG5cdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAqKiR7bW9kZWwubWV0YWRhdGEubmFtZX0qKmApO1xuXHRpZiAobW9kZWwubWV0YWRhdGEuaWQgIT09IG1vZGVsLm1ldGFkYXRhLnZlcnNpb24pIHtcblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJm5ic3A7PHNwYW4gc3R5bGU9XCJiYWNrZ3JvdW5kLWNvbG9yOiM4MDgwODAyQjtcIj4mbmJzcDtfJHttb2RlbC5tZXRhZGF0YS5pZH0mIzY0OyR7bW9kZWwubWV0YWRhdGEudmVyc2lvbn1fJm5ic3A7PC9zcGFuPmApO1xuXHR9IGVsc2Uge1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke21vZGVsLm1ldGFkYXRhLmlkfV8mbmJzcDs8L3NwYW4+YCk7XG5cdH1cblx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cblx0aWYgKG1vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24gJiYgbW9kZWwubWV0YWRhdGEudG9vbHRpcCkge1xuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5zdGF0dXNJY29uKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJCgke21vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24uaWR9KSZuYnNwO2ApO1xuXHRcdH1cblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJHttb2RlbC5tZXRhZGF0YS50b29sdGlwfWApO1xuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHR9XG5cblx0aWYgKG1vZGVsLm1ldGFkYXRhLnByaWNpbmcpIHtcblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgJHtsb2NhbGl6ZSgnbW9kZWxzLnByaWNpbmcnLCAnUHJpY2luZycpfTogYCk7XG5cdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEucHJpY2luZyk7XG5cdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdH1cblxuXHRpZiAobW9kZWwubWV0YWRhdGEuaW5wdXRDb3N0ICE9PSB1bmRlZmluZWQgfHwgbW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCAhPT0gdW5kZWZpbmVkIHx8IG1vZGVsLm1ldGFkYXRhLmNhY2hlQ29zdCAhPT0gdW5kZWZpbmVkIHx8IG1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRpZiAobW9kZWwubWV0YWRhdGEuaW5wdXRDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKG1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMuaW5wdXRDb3N0LnNpbmd1bGFyJywgJ0lucHV0IENvc3Q6IHswfSBjcmVkaXQgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLmlucHV0Q29zdC5wbHVyYWwnLCAnSW5wdXQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCkpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5jYWNoZUNvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0ID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5jYWNoZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgUmVhZCBDb3N0OiB7MH0gY3JlZGl0IHBlciAxTSB0b2tlbnMnLCBtb2RlbC5tZXRhZGF0YS5jYWNoZUNvc3QpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5jYWNoZUNvc3QucGx1cmFsJywgJ0NhY2hlIFJlYWQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmNhY2hlQ29zdCkpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihtb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMuY2FjaGVXcml0ZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEuY2FjaGVXcml0ZUNvc3QpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5jYWNoZVdyaXRlQ29zdC5wbHVyYWwnLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0KSk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cdFx0aWYgKG1vZGVsLm1ldGFkYXRhLm91dHB1dENvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMub3V0cHV0Q29zdC5zaW5ndWxhcicsICdPdXRwdXQgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLm91dHB1dENvc3QucGx1cmFsJywgJ091dHB1dCBDb3N0OiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCkpO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0ICE9PSB1bmRlZmluZWQgfHwgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQgfHwgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZUNvc3QgIT09IHVuZGVmaW5lZCB8fCBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCoqJHtsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0UHJpY2luZycsICdMb25nIENvbnRleHQgUHJpY2luZycpfSoqYCk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHRcdGlmIChtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dElucHV0Q29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0SW5wdXRDb3N0LnNpbmd1bGFyJywgJ0lucHV0IENvc3Q6IHswfSBjcmVkaXQgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5sb25nQ29udGV4dElucHV0Q29zdC5wbHVyYWwnLCAnSW5wdXQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0KSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZUNvc3QgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMubG9uZ0NvbnRleHRDYWNoZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgUmVhZCBDb3N0OiB7MH0gY3JlZGl0IHBlciAxTSB0b2tlbnMnLCBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlQ29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMubG9uZ0NvbnRleHRDYWNoZUNvc3QucGx1cmFsJywgJ0NhY2hlIFJlYWQgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVDb3N0KSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3Quc2luZ3VsYXInLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMubG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdC5wbHVyYWwnLCAnQ2FjaGUgV3JpdGUgQ29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2VucycsIG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0Q2FjaGVXcml0ZUNvc3QpKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24obW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0ID09PSAxXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLmxvbmdDb250ZXh0T3V0cHV0Q29zdC5zaW5ndWxhcicsICdPdXRwdXQgQ29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5sb25nQ29udGV4dE91dHB1dENvc3QucGx1cmFsJywgJ091dHB1dCBDb3N0OiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zJywgbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRPdXRwdXRDb3N0KSk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlmIChtb2RlbC5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyB8fCBtb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMpIHtcblx0XHRjb25zdCB0b3RhbFRva2VucyA9IChtb2RlbC5tZXRhZGF0YS5tYXhJbnB1dFRva2VucyA/PyAwKSArIChtb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMgPz8gMCk7XG5cdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7bG9jYWxpemUoJ21vZGVscy5jb250ZXh0U2l6ZScsICdDb250ZXh0IFNpemUnKX06IGApO1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2Zvcm1hdFRva2VuQ291bnQodG90YWxUb2tlbnMpfWApO1xuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXHR9XG5cblx0aWYgKG1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcykge1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2xvY2FsaXplKCdtb2RlbHMuY2FwYWJpbGl0aWVzJywgJ0NhcGFiaWxpdGllcycpfTogYCk7XG5cdFx0aWYgKG1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcz8udG9vbENhbGxpbmcpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke2xvY2FsaXplKCdtb2RlbHMudG9vbENhbGxpbmcnLCAnVG9vbHMnKX1fJm5ic3A7PC9zcGFuPmApO1xuXHRcdH1cblx0XHRpZiAobW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy52aXNpb24pIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke2xvY2FsaXplKCdtb2RlbHMudmlzaW9uJywgJ1Zpc2lvbicpfV8mbmJzcDs8L3NwYW4+YCk7XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LmFnZW50TW9kZSkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+Jm5ic3A7XyR7bG9jYWxpemUoJ21vZGVscy5hZ2VudE1vZGUnLCAnQWdlbnQgTW9kZScpfV8mbmJzcDs8L3NwYW4+YCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZWRpdFRvb2wgb2YgbW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzLmVkaXRUb29scyA/PyBbXSkge1xuXHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCZuYnNwOzxzcGFuIHN0eWxlPVwiYmFja2dyb3VuZC1jb2xvcjojODA4MDgwMkI7XCI+Jm5ic3A7XyR7ZWRpdFRvb2x9XyZuYnNwOzwvc3Bhbj5gKTtcblx0XHR9XG5cdFx0bWFya2Rvd24uYXBwZW5kVGV4dChgXFxuYCk7XG5cdH1cblxuXHRyZXR1cm4gbWFya2Rvd247XG59XG5cbi8qKlxuICogUHVyZSBoZWxwZXIgZm9yIGJ1aWxkaW5nIHRoZSBkcm9wZG93biBhY3Rpb25zIHNob3duIGJ5IHRoZSAqKkFkZCBNb2RlbHMqKiBidXR0b24uXG4gKlxuICogRXhwb3NlZCBmb3IgdW5pdCB0ZXN0aW5nLiBUaGUgQ29waWxvdCBzaWduLWluIGFjdGlvbiBpcyBpbmRlcGVuZGVudCBvZiB3aGV0aGVyIGFkZGluZ1xuICogY29uZmlndXJhYmxlIEJZT0sgdmVuZG9ycyBpcyBzdXBwb3J0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZEFkZE1vZGVsc0Ryb3Bkb3duQWN0aW9ucyhcblx0Y29uZmlndXJhYmxlVmVuZG9yczogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3JbXSxcblx0c3VwcG9ydHNBZGRpbmdNb2RlbHM6IGJvb2xlYW4sXG5cdHJ1blZlbmRvckFjdGlvbjogKHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+LFxuXHRydW5Db3BpbG90U2lnbkluQWN0aW9uPzogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4sXG4pOiBJQWN0aW9uW10ge1xuXHRpZiAoIXN1cHBvcnRzQWRkaW5nTW9kZWxzICYmICFydW5Db3BpbG90U2lnbkluQWN0aW9uKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Ly8gU29ydCB2ZW5kb3JzIGFscGhhYmV0aWNhbGx5IGJ5IGRpc3BsYXlOYW1lLCBidXQgc2luayBkZXByZWNhdGVkIHByb3ZpZGVycyAodGhvc2UgZGVjbGFyaW5nIGFcblx0Ly8gYGRlcHJlY2F0aW9uLmxpbmtgLCBlLmcuIE9sbGFtYSkgdG8gdGhlIGVuZCBvZiB0aGUgbGlzdC4gXCJPcGVuQUkgQ29tcGF0aWJsZSAoRGVwcmVjYXRlZClcIiAoY3VzdG9tb2FpKVxuXHQvLyBpcyBwaW5uZWQgYWZ0ZXIgdGhlIHNvcnRlZCBsaXN0IGFuZCBcIkN1c3RvbSBFbmRwb2ludFwiIChjdXN0b21lbmRwb2ludCkgYWZ0ZXIgYSBzZXBhcmF0b3IgYXQgdGhlIHZlcnkgZW5kLlxuXHRjb25zdCBjdXN0b21FbmRwb2ludFZlbmRvciA9IGNvbmZpZ3VyYWJsZVZlbmRvcnMuZmluZCh2ID0+IHYudmVuZG9yID09PSAnY3VzdG9tZW5kcG9pbnQnKTtcblx0Y29uc3QgY3VzdG9tT2FpVmVuZG9yID0gY29uZmlndXJhYmxlVmVuZG9ycy5maW5kKHYgPT4gdi52ZW5kb3IgPT09ICdjdXN0b21vYWknKTtcblx0Y29uc3Qgc29ydGVkVmVuZG9ycyA9IGNvbmZpZ3VyYWJsZVZlbmRvcnNcblx0XHQuZmlsdGVyKHYgPT4gdi52ZW5kb3IgIT09ICdjdXN0b21lbmRwb2ludCcgJiYgdi52ZW5kb3IgIT09ICdjdXN0b21vYWknKVxuXHRcdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRjb25zdCBhRGVwcmVjYXRlZCA9IGEuZGVwcmVjYXRpb24/LmxpbmsgPyAxIDogMDtcblx0XHRcdGNvbnN0IGJEZXByZWNhdGVkID0gYi5kZXByZWNhdGlvbj8ubGluayA/IDEgOiAwO1xuXHRcdFx0aWYgKGFEZXByZWNhdGVkICE9PSBiRGVwcmVjYXRlZCkge1xuXHRcdFx0XHRyZXR1cm4gYURlcHJlY2F0ZWQgLSBiRGVwcmVjYXRlZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoYi5kaXNwbGF5TmFtZSk7XG5cdFx0fSk7XG5cdGlmIChjdXN0b21PYWlWZW5kb3IpIHtcblx0XHRzb3J0ZWRWZW5kb3JzLnB1c2goY3VzdG9tT2FpVmVuZG9yKTtcblx0fVxuXG5cdGNvbnN0IHRvVmVuZG9yQWN0aW9uID0gKHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IpID0+IHRvQWN0aW9uKHtcblx0XHRpZDogYGVuYWJsZS0ke3ZlbmRvci52ZW5kb3J9YCxcblx0XHRsYWJlbDogdmVuZG9yLmRpc3BsYXlOYW1lLFxuXHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcnVuVmVuZG9yQWN0aW9uKHZlbmRvcik7XG5cdFx0fVxuXHR9KTtcblxuXHRjb25zdCB2ZW5kb3JBY3Rpb25zOiBJQWN0aW9uW10gPSBzdXBwb3J0c0FkZGluZ01vZGVscyA/IHNvcnRlZFZlbmRvcnMubWFwKHRvVmVuZG9yQWN0aW9uKSA6IFtdO1xuXHRpZiAoc3VwcG9ydHNBZGRpbmdNb2RlbHMgJiYgY3VzdG9tRW5kcG9pbnRWZW5kb3IpIHtcblx0XHRpZiAodmVuZG9yQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR2ZW5kb3JBY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHR9XG5cdFx0dmVuZG9yQWN0aW9ucy5wdXNoKHRvVmVuZG9yQWN0aW9uKGN1c3RvbUVuZHBvaW50VmVuZG9yKSk7XG5cdH1cblxuXHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblx0aWYgKHJ1bkNvcGlsb3RTaWduSW5BY3Rpb24pIHtcblx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdzaWduSW4tZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMuc2lnbkluR2l0SHViQ29waWxvdCcsIFwiR2l0SHViIENvcGlsb3RcIiksXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgcnVuQ29waWxvdFNpZ25JbkFjdGlvbigpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdH1cblx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCAmJiB2ZW5kb3JBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0fVxuXHRhY3Rpb25zLnB1c2goLi4udmVuZG9yQWN0aW9ucyk7XG5cblx0cmV0dXJuIGFjdGlvbnM7XG59XG5cbmNsYXNzIE1vZGVsc0ZpbHRlckFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2gubW9kZWxzLmZpbHRlcicsIGxvY2FsaXplKCdmaWx0ZXInLCBcIkZpbHRlclwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZmlsdGVyKSk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHR9XG59XG5cbmludGVyZmFjZSBJRmlsdGVyUXVlcnkge1xuXHQvKiogVGhlIHByaW1hcnkgZmlsdGVyIHF1ZXJ5IHN0cmluZyAqL1xuXHRxdWVyeTogc3RyaW5nO1xuXHQvKiogQWx0ZXJuYXRpdmUgcXVlcnkgc3RyaW5ncyB0aGF0IGFyZSB0cmVhdGVkIGFzIHN5bm9ueW1zIG9mIHRoZSBwcmltYXJ5IHF1ZXJ5ICovXG5cdHN5bm9ueW1zPzogc3RyaW5nW107XG5cdC8qKiBRdWVyeSBzdHJpbmdzIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQgd2hlbiBhZGRpbmcgdGhpcyBmaWx0ZXIgKG11dHVhbGx5IGV4Y2x1c2l2ZSBmaWx0ZXJzKSAqL1xuXHRleGNsdWRlcz86IHN0cmluZ1tdO1xufVxuXG5mdW5jdGlvbiB0b2dnbGVGaWx0ZXIoY3VycmVudFF1ZXJ5OiBzdHJpbmcsIGZpbHRlcjogSUZpbHRlclF1ZXJ5KTogc3RyaW5nIHtcblx0Y29uc3QgeyBxdWVyeSwgc3lub255bXMgPSBbXSwgZXhjbHVkZXMgPSBbXSB9ID0gZmlsdGVyO1xuXHRjb25zdCBhbGxTeW5vbnltcyA9IFtxdWVyeSwgLi4uc3lub255bXNdO1xuXHRjb25zdCBpc0NoZWNrZWQgPSBhbGxTeW5vbnltcy5zb21lKHEgPT4gY3VycmVudFF1ZXJ5LmluY2x1ZGVzKHEpKTtcblx0Y29uc3QgaGFzRXhjbHVkZWRRdWVyeSA9IGV4Y2x1ZGVzLnNvbWUocSA9PiBjdXJyZW50UXVlcnkuaW5jbHVkZXMocSkpO1xuXG5cdGlmIChpc0NoZWNrZWQpIHtcblx0XHQvLyBRdWVyeSBvciBzeW5vbnltIGlzIGFscmVhZHkgc2V0LCByZW1vdmUgYWxsIG9mIHRoZW0gKHRvZ2dsZSBvZmYpXG5cdFx0bGV0IHF1ZXJ5V2l0aFJlbW92ZWRGaWx0ZXIgPSBjdXJyZW50UXVlcnk7XG5cdFx0Zm9yIChjb25zdCBxIG9mIGFsbFN5bm9ueW1zKSB7XG5cdFx0XHRxdWVyeVdpdGhSZW1vdmVkRmlsdGVyID0gcXVlcnlXaXRoUmVtb3ZlZEZpbHRlci5yZXBsYWNlKHEsICcnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHF1ZXJ5V2l0aFJlbW92ZWRGaWx0ZXIucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0fSBlbHNlIGlmIChoYXNFeGNsdWRlZFF1ZXJ5KSB7XG5cdFx0Ly8gQW4gZXhjbHVkZWQgcXVlcnkgaXMgc2V0LCByZXBsYWNlIGl0IHdpdGggdGhlIG5ldyBxdWVyeVxuXHRcdGxldCBuZXdRdWVyeSA9IGN1cnJlbnRRdWVyeTtcblx0XHRmb3IgKGNvbnN0IHEgb2YgZXhjbHVkZXMpIHtcblx0XHRcdG5ld1F1ZXJ5ID0gbmV3UXVlcnkucmVwbGFjZShxLCAnJyk7XG5cdFx0fVxuXHRcdG5ld1F1ZXJ5ID0gbmV3UXVlcnkucmVwbGFjZSgvXFxzKy9nLCAnICcpLnRyaW0oKTtcblx0XHRyZXR1cm4gbmV3UXVlcnkgPyBgJHtuZXdRdWVyeX0gJHtxdWVyeX1gIDogcXVlcnk7XG5cdH0gZWxzZSB7XG5cdFx0Ly8gTm8gZmlsdGVyIGlzIHNldCwgYWRkIHRoZSBuZXcgcXVlcnlcblx0XHRjb25zdCB0cmltbWVkUXVlcnkgPSBjdXJyZW50UXVlcnkudHJpbSgpO1xuXHRcdHJldHVybiB0cmltbWVkUXVlcnkgPyBgJHt0cmltbWVkUXVlcnl9ICR7cXVlcnl9YCA6IHF1ZXJ5O1xuXHR9XG59XG5cbmNsYXNzIE1vZGVsc1NlYXJjaEZpbHRlckRyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoOiB7XG5cdFx0XHRnZXRWYWx1ZSgpOiBzdHJpbmc7XG5cdFx0XHRzZXRWYWx1ZShuZXdWYWx1ZTogc3RyaW5nKTogdm9pZDtcblx0XHR9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsOiBDaGF0TW9kZWxzVmlld01vZGVsLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihhY3Rpb24sXG5cdFx0XHR7IGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0QWN0aW9ucygpIH0sXG5cdFx0XHRjb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdGNsYXNzTmFtZXM6IGFjdGlvbi5jbGFzcyxcblx0XHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IEFuY2hvckFsaWdubWVudC5SSUdIVCxcblx0XHRcdFx0bWVudUFzQ2hpbGQ6IHRydWVcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQcm92aWRlckFjdGlvbih2ZW5kb3I6IHN0cmluZywgZGlzcGxheU5hbWU6IHN0cmluZyk6IElBY3Rpb24ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gYEBwcm92aWRlcjpcIiR7ZGlzcGxheU5hbWV9XCJgO1xuXHRcdGNvbnN0IGN1cnJlbnRRdWVyeSA9IHRoaXMuc2VhcmNoLmdldFZhbHVlKCk7XG5cdFx0Y29uc3QgaXNDaGVja2VkID0gY3VycmVudFF1ZXJ5LmluY2x1ZGVzKHF1ZXJ5KSB8fCBjdXJyZW50UXVlcnkuaW5jbHVkZXMoYEBwcm92aWRlcjoke3ZlbmRvcn1gKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogYHByb3ZpZGVyLSR7dmVuZG9yfWAsXG5cdFx0XHRsYWJlbDogZGlzcGxheU5hbWUsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZmlsdGVyQnlQcm92aWRlcicsIFwiRmlsdGVyIGJ5IHswfVwiLCBkaXNwbGF5TmFtZSksXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNoZWNrZWQ6IGlzQ2hlY2tlZCxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy50b2dnbGVGaWx0ZXJBbmRTZWFyY2goeyBxdWVyeSwgc3lub255bXM6IFtgQHByb3ZpZGVyOiR7dmVuZG9yfWBdIH0pXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ2FwYWJpbGl0eUFjdGlvbihjYXBhYmlsaXR5OiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcpOiBJQWN0aW9uIHtcblx0XHRjb25zdCBxdWVyeSA9IGBAY2FwYWJpbGl0eToke2NhcGFiaWxpdHl9YDtcblx0XHRjb25zdCBjdXJyZW50UXVlcnkgPSB0aGlzLnNlYXJjaC5nZXRWYWx1ZSgpO1xuXHRcdGNvbnN0IGlzQ2hlY2tlZCA9IGN1cnJlbnRRdWVyeS5pbmNsdWRlcyhxdWVyeSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGBjYXBhYmlsaXR5LSR7Y2FwYWJpbGl0eX1gLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnZmlsdGVyQnlDYXBhYmlsaXR5JywgXCJGaWx0ZXIgYnkgezB9XCIsIGxhYmVsKSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0Y2hlY2tlZDogaXNDaGVja2VkLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLnRvZ2dsZUZpbHRlckFuZFNlYXJjaCh7IHF1ZXJ5IH0pXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlRmlsdGVyQW5kU2VhcmNoKGZpbHRlcjogSUZpbHRlclF1ZXJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudFF1ZXJ5ID0gdGhpcy5zZWFyY2guZ2V0VmFsdWUoKTtcblx0XHRjb25zdCBuZXdRdWVyeSA9IHRvZ2dsZUZpbHRlcihjdXJyZW50UXVlcnksIGZpbHRlcik7XG5cdFx0dGhpcy5zZWFyY2guc2V0VmFsdWUobmV3UXVlcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zKCk6IElBY3Rpb25bXSB7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHQvLyBDYXBhYmlsaXR5IGZpbHRlcnNcblx0XHRhY3Rpb25zLnB1c2goXG5cdFx0XHR0aGlzLmNyZWF0ZUNhcGFiaWxpdHlBY3Rpb24oJ3Rvb2xzJywgbG9jYWxpemUoJ2NhcGFiaWxpdHkudG9vbHMnLCBcIlRvb2xzXCIpKSxcblx0XHRcdHRoaXMuY3JlYXRlQ2FwYWJpbGl0eUFjdGlvbigndmlzaW9uJywgbG9jYWxpemUoJ2NhcGFiaWxpdHkudmlzaW9uJywgXCJWaXNpb25cIikpLFxuXHRcdFx0dGhpcy5jcmVhdGVDYXBhYmlsaXR5QWN0aW9uKCdhZ2VudCcsIGxvY2FsaXplKCdjYXBhYmlsaXR5LmFnZW50JywgXCJBZ2VudCBNb2RlXCIpKVxuXHRcdCk7XG5cblx0XHQvLyBQcm92aWRlciBmaWx0ZXJzIC0gb25seSBzaG93IHByb3ZpZGVycyB3aXRoIGNvbmZpZ3VyZWQgbW9kZWxzXG5cdFx0Y29uc3QgY29uZmlndXJlZFZlbmRvcnMgPSB0aGlzLnZpZXdNb2RlbC5nZXRDb25maWd1cmVkVmVuZG9ycygpO1xuXHRcdGlmIChjb25maWd1cmVkVmVuZG9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdGFjdGlvbnMucHVzaCguLi5jb25maWd1cmVkVmVuZG9ycy5tYXAodmVuZG9yID0+IHRoaXMuY3JlYXRlUHJvdmlkZXJBY3Rpb24odmVuZG9yLnZlbmRvci52ZW5kb3IsIHZlbmRvci5ncm91cC5uYW1lKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG59XG5cbmNsYXNzIERlbGVnYXRlIGltcGxlbWVudHMgSVRhYmxlVmlydHVhbERlbGVnYXRlPElWaWV3TW9kZWxFbnRyeT4ge1xuXHRyZWFkb25seSBoZWFkZXJSb3dIZWlnaHQgPSBIRUFERVJfSEVJR0hUO1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSVZpZXdNb2RlbEVudHJ5KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlbGVtZW50KSB8fCBpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGVsZW1lbnQpID8gVkVORE9SX1JPV19IRUlHSFQgOiBNT0RFTF9ST1dfSEVJR0hUO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTW9kZWxUYWJsZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBNb2RlbHNUYWJsZUNvbHVtblJlbmRlcmVyPFQgZXh0ZW5kcyBJTW9kZWxUYWJsZUNvbHVtblRlbXBsYXRlRGF0YT4gaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJVmlld01vZGVsRW50cnksIFQ+IHtcblx0YWJzdHJhY3QgcmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nO1xuXHRhYnN0cmFjdCByZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogVDtcblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElWaWV3TW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBUKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IGlzVmVuZG9yID0gaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlbGVtZW50KTtcblx0XHRjb25zdCBpc0dyb3VwID0gaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShlbGVtZW50KTtcblx0XHRjb25zdCBpc1N0YXR1cyA9IGlzU3RhdHVzRW50cnkoZWxlbWVudCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb2RlbHMtdGFibGUtY29sdW1uJyk7XG5cdFx0Y29uc3Qgcm93ID0gdGVtcGxhdGVEYXRhLmNvbnRhaW5lci5wYXJlbnRFbGVtZW50ITtcblx0XHRyb3cuY2xhc3NMaXN0LnRvZ2dsZSgnbW9kZWxzLXZlbmRvci1yb3cnLCBpc1ZlbmRvciB8fCBpc0dyb3VwKTtcblx0XHRyb3cuY2xhc3NMaXN0LnRvZ2dsZSgnbW9kZWxzLW1vZGVsLXJvdycsICFpc1ZlbmRvciAmJiAhaXNHcm91cCk7XG5cdFx0cm93LmNsYXNzTGlzdC50b2dnbGUoJ21vZGVscy1zdGF0dXMtcm93JywgaXNTdGF0dXMpO1xuXHRcdGNvbnN0IGlzSGlkZGVuID0gKGlzVmVuZG9yICYmIGVsZW1lbnQuaGlkZGVuKSB8fCAoIWlzVmVuZG9yICYmICFpc0dyb3VwICYmICFpc1N0YXR1cyAmJiAoZWxlbWVudCBhcyBJTGFuZ3VhZ2VNb2RlbEVudHJ5KS5tb2RlbD8uaGlkZGVuKTtcblx0XHRyb3cuY2xhc3NMaXN0LnRvZ2dsZSgnbW9kZWxzLXJvdy1oaWRkZW4nLCAhIWlzSGlkZGVuKTtcblx0XHRpZiAoaXNWZW5kb3IpIHtcblx0XHRcdHRoaXMucmVuZGVyVmVuZG9yRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9IGVsc2UgaWYgKGlzR3JvdXApIHtcblx0XHRcdHRoaXMucmVuZGVyR3JvdXBFbGVtZW50KGVsZW1lbnQsIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH0gZWxzZSBpZiAoaXNTdGF0dXMpIHtcblx0XHRcdHRoaXMucmVuZGVyU3RhdHVzRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJNb2RlbEVsZW1lbnQoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3QgcmVuZGVyVmVuZG9yRWxlbWVudChlbGVtZW50OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogVCk6IHZvaWQ7XG5cdGFic3RyYWN0IHJlbmRlckdyb3VwRWxlbWVudChlbGVtZW50OiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogVCk6IHZvaWQ7XG5cdGFic3RyYWN0IHJlbmRlck1vZGVsRWxlbWVudChlbGVtZW50OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IFQpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCByZW5kZXJTdGF0dXNFbGVtZW50KGVsZW1lbnQ6IElTdGF0dXNFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBUKTogdm9pZCB7IH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBUKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVRvZ2dsZUNvbGxhcHNlQ29sdW1uVGVtcGxhdGVEYXRhIGV4dGVuZHMgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBsaXN0Um93RWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcbn1cblxuY2xhc3MgR3V0dGVyQ29sdW1uUmVuZGVyZXIgZXh0ZW5kcyBNb2RlbHNUYWJsZUNvbHVtblJlbmRlcmVyPElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdndXR0ZXInO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IEd1dHRlckNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsOiBDaGF0TW9kZWxzVmlld01vZGVsLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb2RlbHMtZ3V0dGVyLWNvbHVtbicpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGNvbnRhaW5lcikpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaXN0Um93RWxlbWVudDogY29udGFpbmVyLnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQgPz8gbnVsbCxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGFjdGlvbkJhcixcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZW50cnk6IElWaWV3TW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVG9nZ2xlQ29sbGFwc2VDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0c3VwZXIucmVuZGVyRWxlbWVudChlbnRyeSwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJWZW5kb3JFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRvZ2dsZUNvbGxhcHNlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJDb2xsYXBzYWJsZUVsZW1lbnQoZW50cnksIHRlbXBsYXRlRGF0YSk7XG5cdFx0dGhpcy5yZW5kZXJHcm91cFZpc2liaWxpdHlFbGVtZW50KGVudHJ5LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyR3JvdXBFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRvZ2dsZUNvbGxhcHNlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJDb2xsYXBzYWJsZUVsZW1lbnQoZW50cnksIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNvbGxhcHNhYmxlRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5IHwgSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCB0ZW1wbGF0ZURhdGE6IElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGlmICh0ZW1wbGF0ZURhdGEubGlzdFJvd0VsZW1lbnQpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5saXN0Um93RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBlbnRyeS5jb2xsYXBzZWQgPyAnZmFsc2UnIDogJ3RydWUnKTtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbCA9IGVudHJ5LmNvbGxhcHNlZCA/IGxvY2FsaXplKCdleHBhbmQnLCAnRXhwYW5kJykgOiBsb2NhbGl6ZSgnY29sbGFwc2UnLCAnQ29sbGFwc2UnKTtcblx0XHRjb25zdCB0b2dnbGVDb2xsYXBzZUFjdGlvbiA9IHtcblx0XHRcdGlkOiAndG9nZ2xlQ29sbGFwc2UnLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHR0b29sdGlwOiBsYWJlbCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVudHJ5LmNvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93biksXG5cdFx0XHRydW46ICgpID0+IHRoaXMudmlld01vZGVsLnRvZ2dsZUNvbGxhcHNlZChlbnRyeSlcblx0XHR9O1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaCh0b2dnbGVDb2xsYXBzZUFjdGlvbiwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJNb2RlbEVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRvZ2dsZUNvbGxhcHNlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJNb2RlbFZpc2liaWxpdHlFbGVtZW50KGVudHJ5LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJHcm91cFZpc2liaWxpdHlFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnksIHRlbXBsYXRlRGF0YTogSVRvZ2dsZUNvbGxhcHNlQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgaGlkZGVuID0gZW50cnkuaGlkZGVuO1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaCh7XG5cdFx0XHRpZDogaGlkZGVuID8gJ3Nob3dHcm91cCcgOiAnaGlkZUdyb3VwJyxcblx0XHRcdGxhYmVsOiBoaWRkZW5cblx0XHRcdFx0PyBsb2NhbGl6ZSgnbW9kZWxzLnNob3dHcm91cCcsIFwiU2hvdyBBbGwgTW9kZWxzXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5oaWRlR3JvdXAnLCBcIkhpZGUgQWxsIE1vZGVsc1wiKSxcblx0XHRcdHRvb2x0aXA6IGhpZGRlblxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMuc2hvd0dyb3VwJywgXCJTaG93IEFsbCBNb2RlbHNcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLmhpZGVHcm91cCcsIFwiSGlkZSBBbGwgTW9kZWxzXCIpLFxuXHRcdFx0Y2xhc3M6IGBtb2RlbC12aXNpYmlsaXR5LXRvZ2dsZSAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShoaWRkZW4gPyBDb2RpY29uLmV5ZUNsb3NlZCA6IENvZGljb24uZXllKX1gLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy52aWV3TW9kZWwudG9nZ2xlR3JvdXBIaWRkZW4oZW50cnkpLFxuXHRcdH0sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNb2RlbFZpc2liaWxpdHlFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCB0ZW1wbGF0ZURhdGE6IElUb2dnbGVDb2xsYXBzZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGhpZGRlbiA9IGVudHJ5Lm1vZGVsLmhpZGRlbjtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2goe1xuXHRcdFx0aWQ6IGhpZGRlbiA/ICdzaG93TW9kZWwnIDogJ2hpZGVNb2RlbCcsXG5cdFx0XHRsYWJlbDogaGlkZGVuXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5zaG93TW9kZWwnLCBcIlNob3cgTW9kZWxcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLmhpZGVNb2RlbCcsIFwiSGlkZSBNb2RlbFwiKSxcblx0XHRcdHRvb2x0aXA6IGhpZGRlblxuXHRcdFx0XHQ/IGxvY2FsaXplKCdtb2RlbHMuc2hvd01vZGVsJywgXCJTaG93IE1vZGVsXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ21vZGVscy5oaWRlTW9kZWwnLCBcIkhpZGUgTW9kZWxcIiksXG5cdFx0XHRjbGFzczogYG1vZGVsLXZpc2liaWxpdHktdG9nZ2xlICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKGhpZGRlbiA/IENvZGljb24uZXllQ2xvc2VkIDogQ29kaWNvbi5leWUpfWAsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLnZpZXdNb2RlbC50b2dnbGVNb2RlbEhpZGRlbihlbnRyeSksXG5cdFx0fSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNb2RlbE5hbWVDb2x1bW5UZW1wbGF0ZURhdGEgZXh0ZW5kcyBJTW9kZWxUYWJsZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IHN0YXR1c0ljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBwcm92aWRlckljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBuYW1lTGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdHJlYWRvbmx5IHNvdXJjZURlc2NyaXB0aW9uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgbW9kZWxTdGF0dXNJY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVwcmVjYXRpb25MaW5rQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVwcmVjYXRpb25MaW5rOiBMaW5rO1xufVxuXG5jbGFzcyBNb2RlbE5hbWVDb2x1bW5SZW5kZXJlciBleHRlbmRzIE1vZGVsc1RhYmxlQ29sdW1uUmVuZGVyZXI8SU1vZGVsTmFtZUNvbHVtblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnbW9kZWxOYW1lJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBNb2RlbE5hbWVDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElNb2RlbE5hbWVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBuYW1lQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tb2RlbC1uYW1lLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBzdGF0dXNJY29uID0gRE9NLmFwcGVuZChuYW1lQ29udGFpbmVyLCAkKCcuc3RhdHVzLWljb24nKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXJJY29uID0gRE9NLmFwcGVuZChuYW1lQ29udGFpbmVyLCAkKCcubW9kZWwtcHJvdmlkZXItaWNvbicpKTtcblx0XHRwcm92aWRlckljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0Y29uc3QgbmFtZUxhYmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKERPTS5hcHBlbmQobmFtZUNvbnRhaW5lciwgJCgnLm1vZGVsLW5hbWUnKSkpKTtcblx0XHRjb25zdCBzb3VyY2VEZXNjcmlwdGlvbiA9IERPTS5hcHBlbmQobmFtZUNvbnRhaW5lciwgJCgnLm1vZGVsLXNvdXJjZS1kZXNjcmlwdGlvbicpKTtcblx0XHRzb3VyY2VEZXNjcmlwdGlvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGNvbnN0IGRlcHJlY2F0aW9uTGlua0NvbnRhaW5lciA9IERPTS5hcHBlbmQobmFtZUNvbnRhaW5lciwgJCgnLm1vZGVsLWRlcHJlY2F0aW9uLWxpbmsnKSk7XG5cdFx0ZGVwcmVjYXRpb25MaW5rQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0Y29uc3QgZGVwcmVjYXRpb25MaW5rID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGluaywgZGVwcmVjYXRpb25MaW5rQ29udGFpbmVyLCB7IGxhYmVsOiAnJywgaHJlZjogJycgfSwge30pKTtcblx0XHRjb25zdCBtb2RlbFN0YXR1c0ljb24gPSBET00uYXBwZW5kKG5hbWVDb250YWluZXIsICQoJy5tb2RlbC1zdGF0dXMtaWNvbicpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0c3RhdHVzSWNvbixcblx0XHRcdHByb3ZpZGVySWNvbixcblx0XHRcdG5hbWVMYWJlbCxcblx0XHRcdHNvdXJjZURlc2NyaXB0aW9uLFxuXHRcdFx0bW9kZWxTdGF0dXNJY29uLFxuXHRcdFx0ZGVwcmVjYXRpb25MaW5rQ29udGFpbmVyLFxuXHRcdFx0ZGVwcmVjYXRpb25MaW5rLFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyRWxlbWVudChlbnRyeTogSVZpZXdNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNb2RlbE5hbWVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRET00uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS5tb2RlbFN0YXR1c0ljb24pO1xuXHRcdHRlbXBsYXRlRGF0YS5wcm92aWRlckljb24uY2xhc3NOYW1lID0gJ21vZGVsLXByb3ZpZGVyLWljb24nO1xuXHRcdHRlbXBsYXRlRGF0YS5wcm92aWRlckljb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlRGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlRGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZXJyb3Itc3RhdHVzJywgJ3dhcm5pbmctc3RhdHVzJywgJ2luZm8tc3RhdHVzJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmRlcHJlY2F0aW9uTGlua0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZW50cnksIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElNb2RlbE5hbWVDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLnNldChlbnRyeS52ZW5kb3JFbnRyeS5ncm91cC5uYW1lLCB1bmRlZmluZWQpO1xuXHRcdGlmIChlbnRyeS5zb3VyY2VQcmVzZW50YXRpb24/Lmljb24pIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5wcm92aWRlckljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShlbnRyeS5zb3VyY2VQcmVzZW50YXRpb24uaWNvbikpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnByb3ZpZGVySWNvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXHRcdGlmIChlbnRyeS5zb3VyY2VQcmVzZW50YXRpb24/LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlRGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBlbnRyeS5zb3VyY2VQcmVzZW50YXRpb24uZGVzY3JpcHRpb247XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc291cmNlRGVzY3JpcHRpb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlcHJlY2F0aW9uTGluayA9IGVudHJ5LnZlbmRvckVudHJ5LnZlbmRvci5kZXByZWNhdGlvbj8ubGluaztcblx0XHRpZiAoZGVwcmVjYXRpb25MaW5rICYmICF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRjb25zdCBpY29uID0gJCgnc3BhbicpO1xuXHRcdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ubGlua0V4dGVybmFsKSk7XG5cdFx0XHRpY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSAkKCdzcGFuLm1vZGVsLWRlcHJlY2F0aW9uLWxpbmstbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdtb2RlbHMuZGVwcmVjYXRpb24ubGluay5sYWJlbCcsIFwiTWlncmF0ZVwiKSwgaWNvbik7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVwcmVjYXRpb25MaW5rLmxpbmsgPSB7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRocmVmOiByZXNvbHZlUHJvdmlkZXJEZXByZWNhdGlvbkxpbmsoZGVwcmVjYXRpb25MaW5rLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sKS50b1N0cmluZygpLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ21vZGVscy5kZXByZWNhdGlvbi5saW5rLnRvb2x0aXAnLCBcIlRoZSBPbGxhbWEgbW9kZWwgcHJvdmlkZXIgaXMgZGVwcmVjYXRlZC4gUGxlYXNlIG1pZ3JhdGUgdG8gdGhlIG9mZmljaWFsIGV4dGVuc2lvbi5cIilcblx0XHRcdH07XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVwcmVjYXRpb25MaW5rQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJHcm91cEVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTW9kZWxOYW1lQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLm5hbWVMYWJlbC5zZXQoZW50cnkubGFiZWwsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJNb2RlbEVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSU1vZGVsTmFtZUNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgbW9kZWw6IG1vZGVsRW50cnksIG1vZGVsTmFtZU1hdGNoZXMgfSA9IGVudHJ5O1xuXG5cdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0ljb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0ZW1wbGF0ZURhdGEubW9kZWxTdGF0dXNJY29uLmNsYXNzTmFtZSA9ICdtb2RlbC1zdGF0dXMtaWNvbic7XG5cdFx0aWYgKG1vZGVsRW50cnkubWV0YWRhdGEuc3RhdHVzSWNvbikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLm1vZGVsU3RhdHVzSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KG1vZGVsRW50cnkubWV0YWRhdGEuc3RhdHVzSWNvbikpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLm1vZGVsU3RhdHVzSWNvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5tb2RlbFN0YXR1c0ljb24uc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLnNldChtb2RlbEVudHJ5Lm1ldGFkYXRhLm5hbWUsIG1vZGVsTmFtZU1hdGNoZXMpO1xuXG5cdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoJycsIHsgaXNUcnVzdGVkOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgKioke2VudHJ5Lm1vZGVsLm1ldGFkYXRhLm5hbWV9KipgKTtcblx0XHRpZiAoZW50cnkubW9kZWwubWV0YWRhdGEuaWQgIT09IGVudHJ5Lm1vZGVsLm1ldGFkYXRhLnZlcnNpb24pIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke2VudHJ5Lm1vZGVsLm1ldGFkYXRhLmlkfSYjNjQ7JHtlbnRyeS5tb2RlbC5tZXRhZGF0YS52ZXJzaW9ufV8mbmJzcDs8L3NwYW4+YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAmbmJzcDs8c3BhbiBzdHlsZT1cImJhY2tncm91bmQtY29sb3I6IzgwODA4MDJCO1wiPiZuYnNwO18ke2VudHJ5Lm1vZGVsLm1ldGFkYXRhLmlkfV8mbmJzcDs8L3NwYW4+YCk7XG5cdFx0fVxuXHRcdG1hcmtkb3duLmFwcGVuZFRleHQoYFxcbmApO1xuXG5cdFx0aWYgKGVudHJ5Lm1vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24gJiYgZW50cnkubW9kZWwubWV0YWRhdGEudG9vbHRpcCkge1xuXHRcdFx0aWYgKGVudHJ5Lm1vZGVsLm1ldGFkYXRhLnN0YXR1c0ljb24pIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCQoJHtlbnRyeS5tb2RlbC5tZXRhZGF0YS5zdGF0dXNJY29uLmlkfSkmbmJzcDtgKTtcblx0XHRcdH1cblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2VudHJ5Lm1vZGVsLm1ldGFkYXRhLnRvb2x0aXB9YCk7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRUZXh0KGBcXG5gKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlckF0TW91c2UodGVtcGxhdGVEYXRhLmNvbnRhaW5lciEsICgpID0+ICh7XG5cdFx0XHRjb250ZW50OiBtYXJrZG93bixcblx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdFx0c2tpcEZhZGVJbkFuaW1hdGlvbjogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlclN0YXR1c0VsZW1lbnQoZW50cnk6IElTdGF0dXNFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJTW9kZWxOYW1lQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0ljb24uc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLmNsYXNzTmFtZSA9ICdzdGF0dXMtaWNvbic7XG5cdFx0c3dpdGNoIChlbnRyeS5zZXZlcml0eSkge1xuXHRcdFx0Y2FzZSBTZXZlcml0eS5FcnJvcjpcblx0XHRcdFx0dGVtcGxhdGVEYXRhLm5hbWVMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2Vycm9yLXN0YXR1cycpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZXJyb3IpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFNldmVyaXR5Lldhcm5pbmc6XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5uYW1lTGFiZWwuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd3YXJuaW5nLXN0YXR1cycpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ud2FybmluZykpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgU2V2ZXJpdHkuSW5mbzpcblx0XHRcdFx0dGVtcGxhdGVEYXRhLm5hbWVMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2luZm8tc3RhdHVzJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5pbmZvKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEubmFtZUxhYmVsLnNldChlbnRyeS5tZXNzYWdlLCB1bmRlZmluZWQsIGVudHJ5Lm1lc3NhZ2UpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJQ29tYmluZWRDb3N0Q29sdW1uVGVtcGxhdGVEYXRhIGV4dGVuZHMgSU1vZGVsVGFibGVDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBpbnB1dENlbGw6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBvdXRwdXRDZWxsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2FjaGVSZWFkQ2VsbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNhY2hlV3JpdGVDZWxsOiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgQ29tYmluZWRDb3N0Q29sdW1uUmVuZGVyZXIgZXh0ZW5kcyBNb2RlbHNUYWJsZUNvbHVtblJlbmRlcmVyPElDb21iaW5lZENvc3RDb2x1bW5UZW1wbGF0ZURhdGE+IHtcblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NvbWJpbmVkQ29zdCc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gQ29tYmluZWRDb3N0Q29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUNvbWJpbmVkQ29zdENvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGdyaWQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm1vZGVsLWNvc3QtZ3JpZCcpKTtcblx0XHRjb25zdCBpbnB1dENlbGwgPSBET00uYXBwZW5kKGdyaWQsICQoJ3NwYW4ubW9kZWwtY29zdC1jZWxsJykpO1xuXHRcdGNvbnN0IG91dHB1dENlbGwgPSBET00uYXBwZW5kKGdyaWQsICQoJ3NwYW4ubW9kZWwtY29zdC1jZWxsJykpO1xuXHRcdGNvbnN0IGNhY2hlUmVhZENlbGwgPSBET00uYXBwZW5kKGdyaWQsICQoJ3NwYW4ubW9kZWwtY29zdC1jZWxsJykpO1xuXHRcdGNvbnN0IGNhY2hlV3JpdGVDZWxsID0gRE9NLmFwcGVuZChncmlkLCAkKCdzcGFuLm1vZGVsLWNvc3QtY2VsbCcpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0aW5wdXRDZWxsLFxuXHRcdFx0b3V0cHV0Q2VsbCxcblx0XHRcdGNhY2hlUmVhZENlbGwsXG5cdFx0XHRjYWNoZVdyaXRlQ2VsbCxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZW50cnk6IElWaWV3TW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ29tYmluZWRDb3N0Q29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmlucHV0Q2VsbC50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRlbXBsYXRlRGF0YS5vdXRwdXRDZWxsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0dGVtcGxhdGVEYXRhLmNhY2hlUmVhZENlbGwudGV4dENvbnRlbnQgPSAnJztcblx0XHR0ZW1wbGF0ZURhdGEuY2FjaGVXcml0ZUNlbGwudGV4dENvbnRlbnQgPSAnJztcblx0XHRzdXBlci5yZW5kZXJFbGVtZW50KGVudHJ5LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckdyb3VwRWxlbWVudChfZWxlbWVudDogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBfaW5kZXg6IG51bWJlciwgX3RlbXBsYXRlRGF0YTogSUNvbWJpbmVkQ29zdENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChfZWxlbWVudDogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBfaW5kZXg6IG51bWJlciwgX3RlbXBsYXRlRGF0YTogSUNvbWJpbmVkQ29zdENvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyTW9kZWxFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDb21iaW5lZENvc3RDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCB7IGlucHV0Q29zdCwgb3V0cHV0Q29zdCwgY2FjaGVDb3N0LCBjYWNoZVdyaXRlQ29zdCB9ID0gZW50cnkubW9kZWwubWV0YWRhdGE7XG5cdFx0Y29uc3QgaGFzQ29zdCA9IGlucHV0Q29zdCAhPT0gdW5kZWZpbmVkIHx8IG91dHB1dENvc3QgIT09IHVuZGVmaW5lZCB8fCBjYWNoZUNvc3QgIT09IHVuZGVmaW5lZCB8fCBjYWNoZVdyaXRlQ29zdCAhPT0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGhhc0Nvc3QpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5pbnB1dENlbGwudGV4dENvbnRlbnQgPSBpbnB1dENvc3QgIT09IHVuZGVmaW5lZCA/IGxvY2FsaXplKCdjb3N0LmlucHV0JywgXCJJbjogezB9XCIsIGlucHV0Q29zdCkgOiAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS5vdXRwdXRDZWxsLnRleHRDb250ZW50ID0gb3V0cHV0Q29zdCAhPT0gdW5kZWZpbmVkID8gbG9jYWxpemUoJ2Nvc3Qub3V0cHV0JywgXCJPdXQ6IHswfVwiLCBvdXRwdXRDb3N0KSA6ICcnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNhY2hlUmVhZENlbGwudGV4dENvbnRlbnQgPSBjYWNoZUNvc3QgIT09IHVuZGVmaW5lZCA/IGxvY2FsaXplKCdjb3N0LmNhY2hlUmVhZCcsIFwiQ2FjaGUgUmVhZDogezB9XCIsIGNhY2hlQ29zdCkgOiAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS5jYWNoZVdyaXRlQ2VsbC50ZXh0Q29udGVudCA9IGNhY2hlV3JpdGVDb3N0ICE9PSB1bmRlZmluZWQgPyBsb2NhbGl6ZSgnY29zdC5jYWNoZVdyaXRlJywgXCJDYWNoZSBXcml0ZTogezB9XCIsIGNhY2hlV3JpdGVDb3N0KSA6ICcnO1xuXG5cdFx0XHRjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmIChpbnB1dENvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwYXJ0cy5wdXNoKGlucHV0Q29zdCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Nvc3QuaW5wdXRIb3Zlci5zaW5ndWxhcicsIFwiSW5wdXQ6IHswfSBjcmVkaXQgcGVyIDFNIHRva2Vuc1wiLCBpbnB1dENvc3QpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY29zdC5pbnB1dEhvdmVyLnBsdXJhbCcsIFwiSW5wdXQ6IHswfSBjcmVkaXRzIHBlciAxTSB0b2tlbnNcIiwgaW5wdXRDb3N0KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3V0cHV0Q29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2gob3V0cHV0Q29zdCA9PT0gMVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2Nvc3Qub3V0cHV0SG92ZXIuc2luZ3VsYXInLCBcIk91dHB1dDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIG91dHB1dENvc3QpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY29zdC5vdXRwdXRIb3Zlci5wbHVyYWwnLCBcIk91dHB1dDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBvdXRwdXRDb3N0KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2FjaGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cGFydHMucHVzaChjYWNoZUNvc3QgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjb3N0LmNhY2hlSG92ZXIuc2luZ3VsYXInLCBcIkNhY2hlIFJlYWQ6IHswfSBjcmVkaXQgcGVyIDFNIHRva2Vuc1wiLCBjYWNoZUNvc3QpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY29zdC5jYWNoZUhvdmVyLnBsdXJhbCcsIFwiQ2FjaGUgUmVhZDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBjYWNoZUNvc3QpKTtcblx0XHRcdH1cblx0XHRcdGlmIChjYWNoZVdyaXRlQ29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHBhcnRzLnB1c2goY2FjaGVXcml0ZUNvc3QgPT09IDFcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjb3N0LmNhY2hlV3JpdGVIb3Zlci5zaW5ndWxhcicsIFwiQ2FjaGUgV3JpdGU6IHswfSBjcmVkaXQgcGVyIDFNIHRva2Vuc1wiLCBjYWNoZVdyaXRlQ29zdClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdjb3N0LmNhY2hlV3JpdGVIb3Zlci5wbHVyYWwnLCBcIkNhY2hlIFdyaXRlOiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zXCIsIGNhY2hlV3JpdGVDb3N0KSk7XG5cdFx0XHR9XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlckF0TW91c2UodGVtcGxhdGVEYXRhLmNvbnRhaW5lciwgKCkgPT4gKHtcblx0XHRcdFx0Y29udGVudDogcGFydHMuam9pbignXFxuJyksXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0XHRcdHNraXBGYWRlSW5BbmltYXRpb246IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fSkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRmFsbGJhY2sgZm9yIG5vbi10b2tlbi1iYXNlZCBiaWxsaW5nIChwcmVtaXVtIHJlcXVlc3RzIHVzZXJzKVxuXHRcdFx0Y29uc3QgcHJpY2luZ1RleHQgPSBlbnRyeS5tb2RlbC5tZXRhZGF0YS5wcmljaW5nO1xuXHRcdFx0aWYgKHByaWNpbmdUZXh0KSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5pbnB1dENlbGwudGV4dENvbnRlbnQgPSBwcmljaW5nVGV4dDtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXJBdE1vdXNlKHRlbXBsYXRlRGF0YS5jb250YWluZXIsICgpID0+ICh7XG5cdFx0XHRcdFx0Y29udGVudDogbG9jYWxpemUoJ3ByaWNpbmcudG9vbHRpcCcsIFwiUHJpY2luZzogezB9XCIsIHByaWNpbmdUZXh0KSxcblx0XHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0XHRcdFx0c2tpcEZhZGVJbkFuaW1hdGlvbjogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUb2tlbkxpbWl0c0NvbHVtblRlbXBsYXRlRGF0YSBleHRlbmRzIElNb2RlbFRhYmxlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgdG9rZW5MaW1pdHNFbGVtZW50OiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgVG9rZW5MaW1pdHNDb2x1bW5SZW5kZXJlciBleHRlbmRzIE1vZGVsc1RhYmxlQ29sdW1uUmVuZGVyZXI8SVRva2VuTGltaXRzQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICd0b2tlbkxpbWl0cyc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gVG9rZW5MaW1pdHNDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUb2tlbkxpbWl0c0NvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHRva2VuTGltaXRzRWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcubW9kZWwtdG9rZW4tbGltaXRzJykpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR0b2tlbkxpbWl0c0VsZW1lbnQsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJFbGVtZW50KGVudHJ5OiBJVmlld01vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVRva2VuTGltaXRzQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEudG9rZW5MaW1pdHNFbGVtZW50KTtcblx0XHRzdXBlci5yZW5kZXJFbGVtZW50KGVudHJ5LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlclZlbmRvckVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVG9rZW5MaW1pdHNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckdyb3VwRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUb2tlbkxpbWl0c0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyTW9kZWxFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUb2tlbkxpbWl0c0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHsgbW9kZWw6IG1vZGVsRW50cnkgfSA9IGVudHJ5O1xuXHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCcnLCB7IGlzVHJ1c3RlZDogdHJ1ZSwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0aWYgKG1vZGVsRW50cnkubWV0YWRhdGEubWF4SW5wdXRUb2tlbnMgfHwgbW9kZWxFbnRyeS5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMpIHtcblx0XHRcdGNvbnN0IHRvdGFsVG9rZW5zID0gKG1vZGVsRW50cnkubWV0YWRhdGEubWF4SW5wdXRUb2tlbnMgPz8gMCkgKyAobW9kZWxFbnRyeS5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMgPz8gMCk7XG5cdFx0XHRjb25zdCB0b2tlbkRpdiA9IERPTS5hcHBlbmQodGVtcGxhdGVEYXRhLnRva2VuTGltaXRzRWxlbWVudCwgJCgnLnRva2VuLWxpbWl0LWl0ZW0nKSk7XG5cdFx0XHRjb25zdCB0b2tlblRleHQgPSBET00uYXBwZW5kKHRva2VuRGl2LCAkKCdzcGFuJykpO1xuXHRcdFx0dG9rZW5UZXh0LnRleHRDb250ZW50ID0gZm9ybWF0VG9rZW5Db3VudCh0b3RhbFRva2Vucyk7XG5cblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2xvY2FsaXplKCdtb2RlbHMuY29udGV4dFNpemUnLCAnQ29udGV4dCBTaXplJyl9OiBgKTtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2Zvcm1hdFRva2VuQ291bnQodG90YWxUb2tlbnMpfWApO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyQXRNb3VzZSh0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCAoKSA9PiAoe1xuXHRcdFx0Y29udGVudDogbWFya2Rvd24sXG5cdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdGNvbXBhY3Q6IHRydWUsXG5cdFx0XHRcdHNraXBGYWRlSW5BbmltYXRpb246IHRydWUsXG5cdFx0XHR9XG5cdFx0fSkpKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNhcGFiaWxpdGllc0NvbHVtblRlbXBsYXRlRGF0YSBleHRlbmRzIElNb2RlbFRhYmxlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgbWV0YWRhdGFSb3c6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBDYXBhYmlsaXRpZXNDb2x1bW5SZW5kZXJlciBleHRlbmRzIE1vZGVsc1RhYmxlQ29sdW1uUmVuZGVyZXI8SUNhcGFiaWxpdGllc0NvbHVtblRlbXBsYXRlRGF0YT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdjYXBhYmlsaXRpZXMnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IENhcGFiaWxpdGllc0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tDYXBhYmlsaXR5ID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENsaWNrQ2FwYWJpbGl0eSA9IHRoaXMuX29uRGlkQ2xpY2tDYXBhYmlsaXR5LmV2ZW50O1xuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDbGlja0NhcGFiaWxpdHkuZGlzcG9zZSgpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDYXBhYmlsaXRpZXNDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9kZWwtY2FwYWJpbGl0eS1jb2x1bW4nKTtcblx0XHRjb25zdCBtZXRhZGF0YVJvdyA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcubW9kZWwtY2FwYWJpbGl0aWVzJykpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRtZXRhZGF0YVJvdyxcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0ZWxlbWVudERpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckVsZW1lbnQoZW50cnk6IElWaWV3TW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2FwYWJpbGl0aWVzQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0RE9NLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEubWV0YWRhdGFSb3cpO1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZW50cnksIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDYXBhYmlsaXRpZXNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckdyb3VwRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDYXBhYmlsaXRpZXNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlck1vZGVsRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2FwYWJpbGl0aWVzQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBtb2RlbDogbW9kZWxFbnRyeSwgY2FwYWJpbGl0eU1hdGNoZXMgfSA9IGVudHJ5O1xuXG5cdFx0aWYgKG1vZGVsRW50cnkubWV0YWRhdGEuY2FwYWJpbGl0aWVzPy50b29sQ2FsbGluZykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5jcmVhdGVDYXBhYmlsaXR5QnV0dG9uKFxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubWV0YWRhdGFSb3csXG5cdFx0XHRcdGNhcGFiaWxpdHlNYXRjaGVzPy5pbmNsdWRlcygndG9vbENhbGxpbmcnKSB8fCBmYWxzZSxcblx0XHRcdFx0bG9jYWxpemUoJ21vZGVscy50b29scycsICdUb29scycpLFxuXHRcdFx0XHQndG9vbHMnXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHRpZiAobW9kZWxFbnRyeS5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LnZpc2lvbikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodGhpcy5jcmVhdGVDYXBhYmlsaXR5QnV0dG9uKFxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEubWV0YWRhdGFSb3csXG5cdFx0XHRcdGNhcGFiaWxpdHlNYXRjaGVzPy5pbmNsdWRlcygndmlzaW9uJykgfHwgZmFsc2UsXG5cdFx0XHRcdGxvY2FsaXplKCdtb2RlbHMudmlzaW9uJywgJ1Zpc2lvbicpLFxuXHRcdFx0XHQndmlzaW9uJ1xuXHRcdFx0KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDYXBhYmlsaXR5QnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGlzQWN0aXZlOiBib29sZWFuLCBsYWJlbDogc3RyaW5nLCBjYXBhYmlsaXR5OiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tb2RlbC1iYWRnZS1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgYnV0dG9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oYnV0dG9uQ29udGFpbmVyLCB7IHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0YnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9kZWwtY2FwYWJpbGl0eScpO1xuXHRcdGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzQWN0aXZlKTtcblx0XHRidXR0b24ubGFiZWwgPSBsYWJlbDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5fb25EaWRDbGlja0NhcGFiaWxpdHkuZmlyZShjYXBhYmlsaXR5KSkpO1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxufVxuXG5pbnRlcmZhY2UgSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEgZXh0ZW5kcyBJTW9kZWxUYWJsZUNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogVG9vbEJhcjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXJHcm91cEFjdGlvbnMoXG5cdHZpZXdNb2RlbDogQ2hhdE1vZGVsc1ZpZXdNb2RlbCxcblx0dmVuZG9yOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvcixcblx0Z3JvdXBOYW1lOiBzdHJpbmcsXG5cdGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0ZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG4pOiBJQWN0aW9uW10ge1xuXHRjb25zdCBjb25maWd1cmF0aW9uID0gdmVuZG9yLmNvbmZpZ3VyYXRpb24gYXMgSUpTT05TY2hlbWEgfCB1bmRlZmluZWQ7XG5cdGlmICghY29uZmlndXJhdGlvbikge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRjb25zdCBjb25maWd1cmF0aW9uUHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb24ucHJvcGVydGllcztcblx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRpZDogJ2dvVG9TZXR0aW5nc0FjdGlvbicsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMuZ29Ub1NldHRpbmdzJywgXCJPcGVuIGluIExhbmd1YWdlIE1vZGVscyAoSlNPTilcIiksXG5cdFx0cnVuOiAoKSA9PiBsYW5ndWFnZU1vZGVsc1NlcnZpY2Uub3Blbkxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFNldHRpbmdzKHZlbmRvci52ZW5kb3IsIGdyb3VwTmFtZSlcblx0fSkpO1xuXHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRpZDogJ3JlbmFtZUdyb3VwQWN0aW9uJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ21vZGVscy5yZW5hbWVHcm91cCcsICdSZW5hbWUgR3JvdXAnKSxcblx0XHRydW46ICgpID0+IGxhbmd1YWdlTW9kZWxzU2VydmljZS5yZW5hbWVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9yLnZlbmRvciwgZ3JvdXBOYW1lKVxuXHR9KSk7XG5cdGlmIChjb25maWd1cmF0aW9uUHJvcGVydGllcz8uYXBpS2V5KSB7XG5cdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdGlkOiAndXBkYXRlQXBpS2V5QWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzLnVwZGF0ZUFwaUtleScsIFwiVXBkYXRlIEFQSSBLZXlcIiksXG5cdFx0XHRydW46ICgpID0+IGxhbmd1YWdlTW9kZWxzU2VydmljZS51cGRhdGVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBBcGlLZXkodmVuZG9yLnZlbmRvciwgZ3JvdXBOYW1lKVxuXHRcdH0pKTtcblx0fVxuXHRpZiAoY29uZmlndXJhdGlvblByb3BlcnRpZXM/Lm1vZGVscz8uZGVmYXVsdFNuaXBwZXRzPy5bMF0pIHtcblx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdhZGRNb2RlbEFjdGlvbicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21vZGVscy5hZGRNb2RlbCcsIFwiQWRkIE1vZGVsXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiBsYW5ndWFnZU1vZGVsc1NlcnZpY2UuYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwTW9kZWwodmVuZG9yLnZlbmRvciwgZ3JvdXBOYW1lKVxuXHRcdH0pKTtcblx0fVxuXHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRpZDogJ2RlbGV0ZUFjdGlvbicsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMuZGVsZXRlQWN0aW9uJywgJ0RlbGV0ZScpLFxuXHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50cmFzaCksXG5cdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiAnaW5mbycsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtb2RlbHMuZGVsZXRlQ29uZmlybWF0aW9uJywgXCJXb3VsZCB5b3UgbGlrZSB0byBkZWxldGUgezB9P1wiLCBncm91cE5hbWUpXG5cdFx0XHR9KTtcblx0XHRcdGlmICghcmVzdWx0LmNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UucmVtb3ZlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHZlbmRvci52ZW5kb3IsIGdyb3VwTmFtZSk7XG5cdFx0XHR2aWV3TW9kZWwucmVmcmVzaCgpO1xuXHRcdH1cblx0fSkpO1xuXHRyZXR1cm4gYWN0aW9ucztcbn1cblxuY2xhc3MgQWN0aW9uc0NvbHVtblJlbmRlcmVyIGV4dGVuZHMgTW9kZWxzVGFibGVDb2x1bW5SZW5kZXJlcjxJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnYWN0aW9ucyc7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gQWN0aW9uc0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsOiBDaGF0TW9kZWxzVmlld01vZGVsLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9kZWxzLWFjdGlvbnMtY29sdW1uJyk7XG5cdFx0Y29uc3QgcGFyZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBhY3Rpb25CYXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb29sQmFyLFxuXHRcdFx0cGFyZW50LFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGljb246IHRydWUsXG5cdFx0XHRcdGxhYmVsOiBmYWxzZSxcblx0XHRcdFx0bW9yZUljb246IENvZGljb24uZ2Vhcixcblx0XHRcdFx0YW5jaG9yQWxpZ25tZW50UHJvdmlkZXI6ICgpID0+IEFuY2hvckFsaWdubWVudC5SSUdIVFxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRhY3Rpb25CYXIsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJFbGVtZW50KGVudHJ5OiBJVmlld01vZGVsRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdHN1cGVyLnJlbmRlckVsZW1lbnQoZW50cnksIGluZGV4LCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgeyB2ZW5kb3JFbnRyeSB9ID0gZW50cnk7XG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdGlmICh2ZW5kb3JFbnRyeS52ZW5kb3IuY29uZmlndXJhdGlvbikge1xuXHRcdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKC4uLmNyZWF0ZVByb3ZpZGVyR3JvdXBBY3Rpb25zKHRoaXMudmlld01vZGVsLCB2ZW5kb3JFbnRyeS52ZW5kb3IsIHZlbmRvckVudHJ5Lmdyb3VwLm5hbWUsIHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB0aGlzLmRpYWxvZ1NlcnZpY2UpKTtcblx0XHR9IGVsc2UgaWYgKHZlbmRvckVudHJ5LnZlbmRvci5tYW5hZ2VtZW50Q29tbWFuZCkge1xuXHRcdFx0cHJpbWFyeUFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnbWFuYWdlVmVuZG9yJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMubWFuYWdlUHJvdmlkZXInLCAnTWFuYWdlIHswfS4uLicsIHZlbmRvckVudHJ5Lmdyb3VwLm5hbWUpLFxuXHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ2VhciksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodmVuZG9yRW50cnkudmVuZG9yLm1hbmFnZW1lbnRDb21tYW5kISwgdmVuZG9yRW50cnkudmVuZG9yLnZlbmRvcik7XG5cdFx0XHRcdFx0dGhpcy52aWV3TW9kZWwucmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuc2V0QWN0aW9ucyhwcmltYXJ5QWN0aW9ucywgc2Vjb25kYXJ5QWN0aW9ucyk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJHcm91cEVsZW1lbnQoZW50cnk6IElMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyTW9kZWxFbGVtZW50KGVudHJ5OiBJTGFuZ3VhZ2VNb2RlbEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXG5cdFx0Ly8gQXV0byBtb2RlbCBjYW5ub3QgYmUgcGlubmVkXG5cdFx0aWYgKGVudHJ5Lm1vZGVsLm1ldGFkYXRhLmlkICE9PSAnYXV0bycpIHtcblx0XHRcdHByaW1hcnlBY3Rpb25zLnB1c2godGhpcy5jcmVhdGVQaW5BY3Rpb24oZW50cnkubW9kZWwuaWRlbnRpZmllcikpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ0FjdGlvbnMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKGVudHJ5Lm1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdGNvbnN0IHNlY29uZGFyeUFjdGlvbnM6IElBY3Rpb25bXSA9IFsuLi5jb25maWdBY3Rpb25zXTtcblxuXHRcdC8vIE9ubHkgb2ZmZXIgdGhlIEpTT04tYmFzZWQgXCJDb25maWd1cmUuLi5cIiBlbnRyeSBmb3Igbm9uLWRlZmF1bHQgdmVuZG9ycyB0aGF0IGFyZVxuXHRcdC8vIGNvbmZpZ3VyZWQgdmlhIHRoZSBsYW5ndWFnZSBtb2RlbHMgSlNPTiBmaWxlLiBUaGUgZGVmYXVsdCB2ZW5kb3IgKENvcGlsb3QpIGFuZFxuXHRcdC8vIHZlbmRvcnMgd2l0aCBhIGBtYW5hZ2VtZW50Q29tbWFuZGAgYXJlIGNvbmZpZ3VyZWQgZWxzZXdoZXJlLCBzbyB0aGlzIGVudHJ5IHdvdWxkXG5cdFx0Ly8gZG8gbm90aGluZyB1c2VmdWwgZm9yIHRoZWlyIG1vZGVscy5cblx0XHRjb25zdCB2ZW5kb3IgPSBlbnRyeS5tb2RlbC5wcm92aWRlci52ZW5kb3I7XG5cdFx0aWYgKCF2ZW5kb3IuaXNEZWZhdWx0ICYmICF2ZW5kb3IubWFuYWdlbWVudENvbW1hbmQgJiYgKGNvbmZpZ0FjdGlvbnMubGVuZ3RoID4gMCB8fCBlbnRyeS5tb2RlbC5tZXRhZGF0YS5jb25maWd1cmF0aW9uU2NoZW1hKSkge1xuXHRcdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdjb25maWd1cmVNb2RlbCcsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzLmNvbmZpZ3VyZU1vZGVsJywgJ0NvbmZpZ3VyZS4uLicpLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmNvbmZpZ3VyZU1vZGVsKGVudHJ5Lm1vZGVsLmlkZW50aWZpZXIpXG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmFjdGlvbkJhci5zZXRBY3Rpb25zKHByaW1hcnlBY3Rpb25zLCBzZWNvbmRhcnlBY3Rpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUGluQWN0aW9uKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogSUFjdGlvbiB7XG5cdFx0Y29uc3QgaXNQaW5uZWQgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5pc01vZGVsUGlubmVkKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0cmV0dXJuIHRvQWN0aW9uKHtcblx0XHRcdGlkOiBpc1Bpbm5lZCA/IGB1bnBpbi4ke21vZGVsSWRlbnRpZmllcn1gIDogYHBpbi4ke21vZGVsSWRlbnRpZmllcn1gLFxuXHRcdFx0bGFiZWw6IGlzUGlubmVkXG5cdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy51bnBpbk1vZGVsJywgXCJVbnBpbiBNb2RlbFwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMucGluTW9kZWwnLCBcIlBpbiBNb2RlbFwiKSxcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaXNQaW5uZWQgPyBDb2RpY29uLnBpbm5lZCA6IENvZGljb24ucGluKSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNQaW5uZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS51bnBpbk1vZGVsKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UucGluTW9kZWwobW9kZWxJZGVudGlmaWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElQcm92aWRlckNvbHVtblRlbXBsYXRlRGF0YSBleHRlbmRzIElNb2RlbFRhYmxlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgcHJvdmlkZXJFbGVtZW50OiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgUHJvdmlkZXJDb2x1bW5SZW5kZXJlciBleHRlbmRzIE1vZGVsc1RhYmxlQ29sdW1uUmVuZGVyZXI8SVByb3ZpZGVyQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdwcm92aWRlcic7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gUHJvdmlkZXJDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVByb3ZpZGVyQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tb2RlbC1wcm92aWRlcicpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0cHJvdmlkZXJFbGVtZW50LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRlbGVtZW50RGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyVmVuZG9yRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElQcm92aWRlckNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5wcm92aWRlckVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckdyb3VwRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxHcm91cEVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElQcm92aWRlckNvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5wcm92aWRlckVsZW1lbnQudGV4dENvbnRlbnQgPSAnJztcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlck1vZGVsRWxlbWVudChlbnRyeTogSUxhbmd1YWdlTW9kZWxFbnRyeSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJUHJvdmlkZXJDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucHJvdmlkZXJFbGVtZW50LnRleHRDb250ZW50ID0gZ2V0TWFuYWdlTW9kZWxzUHJvdmlkZXJMYWJlbChlbnRyeS5tb2RlbCk7XG5cdH1cbn1cblxuXG5cblxuXG5leHBvcnQgY2xhc3MgQ2hhdE1vZGVsc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIE5VTV9JTlNUQU5DRVM6IG51bWJlciA9IDA7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtQ291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1Db3VudCA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmV2ZW50O1xuXG5cdHByaXZhdGUgc2VhcmNoV2lkZ2V0ITogU3VnZ2VzdEVuYWJsZWRJbnB1dDtcblx0cHJpdmF0ZSBzZWFyY2hBY3Rpb25zQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGFibGUhOiBXb3JrYmVuY2hUYWJsZTxJVmlld01vZGVsRW50cnk+O1xuXHRwcml2YXRlIHRhYmxlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdGFibGVWaWV3cG9ydCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHRhYmxlSW5uZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0YWJsZVNjcm9sbGFibGU6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRhYmxlTWluV2lkdGg6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgYWRkQnV0dG9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYWRkQnV0dG9uITogQnV0dG9uO1xuXHRwcml2YXRlIGRyb3Bkb3duQWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdHByaXZhdGUgZGVmYXVsdEFjY291bnRSZXNvbHZlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHZpZXdNb2RlbDogQ2hhdE1vZGVsc1ZpZXdNb2RlbDtcblx0cHJpdmF0ZSBkZWxheWVkRmlsdGVyaW5nOiBEZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoRm9jdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRhYmxlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5zZWFyY2hGb2N1c0NvbnRleHRLZXkgPSBDT05URVhUX01PREVMU19TRUFSQ0hfRk9DVVMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZGVsYXllZEZpbHRlcmluZyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDIwMCkpO1xuXHRcdHRoaXMudmlld01vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TW9kZWxzVmlld01vZGVsKSk7XG5cdFx0dGhpcy5lbGVtZW50ID0gRE9NLiQoJy5tb2RlbHMtd2lkZ2V0Jyk7XG5cdFx0dGhpcy5jcmVhdGUodGhpcy5lbGVtZW50KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5vbkRpZENoYW5nZURlZmF1bHRBY2NvdW50KCgpID0+IHtcblx0XHRcdHRoaXMuZGVmYXVsdEFjY291bnRSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHR0aGlzLnVwZGF0ZUFkZE1vZGVsc0J1dHRvbigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHRoaXMuZGVmYXVsdEFjY291bnRSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWRkTW9kZWxzQnV0dG9uKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb2FkaW5nUHJvbWlzZSA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKS50aGVuKCgpID0+IHRoaXMudmlld01vZGVsLnJlZnJlc2goKSk7XG5cdFx0dGhpcy5lZGl0b3JQcm9ncmVzc1NlcnZpY2Uuc2hvd1doaWxlKGxvYWRpbmdQcm9taXNlLCAzMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcubW9kZWxzLXNlYXJjaC1hbmQtYnV0dG9uLWNvbnRhaW5lcicpKTtcblxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ1NlYXJjaC5GdWxsVGV4dFNlYXJjaFBsYWNlaG9sZGVyJywgXCJUeXBlIHRvIHNlYXJjaC4uLlwiKTtcblx0XHRjb25zdCBzZWFyY2hDb250YWluZXIgPSBET00uYXBwZW5kKHNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciwgJCgnLm1vZGVscy1zZWFyY2gtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFN1Z2dlc3RFbmFibGVkSW5wdXQsXG5cdFx0XHQnY2hhdE1vZGVsc1dpZGdldC5zZWFyY2hib3gnLFxuXHRcdFx0c2VhcmNoQ29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogWydAJywgJzonXSxcblx0XHRcdFx0cHJvdmlkZVJlc3VsdHM6IChxdWVyeTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXJTdWdnZXN0aW9ucyA9IHRoaXMudmlld01vZGVsLmdldFZlbmRvcnMoKS5tYXAodiA9PiBgQHByb3ZpZGVyOlwiJHt2LmRpc3BsYXlOYW1lfVwiYCk7XG5cdFx0XHRcdFx0Y29uc3QgYWxsU3VnZ2VzdGlvbnMgPSBbXG5cdFx0XHRcdFx0XHQuLi5wcm92aWRlclN1Z2dlc3Rpb25zLFxuXHRcdFx0XHRcdFx0Li4uU0VBUkNIX1NVR0dFU1RJT05TLkNBUEFCSUxJVElFUyxcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdGlmICghcXVlcnkudHJpbSgpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWxsU3VnZ2VzdGlvbnM7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHF1ZXJ5UGFydHMgPSBxdWVyeS5zcGxpdCgvXFxzL2cpO1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RQYXJ0ID0gcXVlcnlQYXJ0c1txdWVyeVBhcnRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHRcdGlmIChsYXN0UGFydC5zdGFydHNXaXRoKCdAcHJvdmlkZXI6JykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBwcm92aWRlclN1Z2dlc3Rpb25zO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobGFzdFBhcnQuc3RhcnRzV2l0aCgnQGNhcGFiaWxpdHk6JykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBTRUFSQ0hfU1VHR0VTVElPTlMuQ0FQQUJJTElUSUVTO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobGFzdFBhcnQuc3RhcnRzV2l0aCgnQCcpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWxsU3VnZ2VzdGlvbnM7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHBsYWNlaG9sZGVyLFxuXHRcdFx0YGNoYXRNb2RlbHNXaWRnZXQ6c2VhcmNoaW5wdXQ6JHtDaGF0TW9kZWxzV2lkZ2V0Lk5VTV9JTlNUQU5DRVMrK31gLFxuXHRcdFx0e1xuXHRcdFx0XHRwbGFjZWhvbGRlclRleHQ6IHBsYWNlaG9sZGVyLFxuXHRcdFx0XHRzdHlsZU92ZXJyaWRlczoge1xuXHRcdFx0XHRcdGlucHV0Qm9yZGVyOiBzZXR0aW5nc1RleHRJbnB1dEJvcmRlclxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2N1c0NvbnRleHRLZXk6IHRoaXMuc2VhcmNoRm9jdXNDb250ZXh0S2V5LFxuXHRcdFx0fSxcblx0XHQpKTtcblxuXHRcdGNvbnN0IGZpbHRlckFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNb2RlbHNGaWx0ZXJBY3Rpb24oKSk7XG5cdFx0Y29uc3QgY2xlYXJTZWFyY2hBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKFxuXHRcdFx0J3dvcmtiZW5jaC5tb2RlbHMuY2xlYXJTZWFyY2gnLFxuXHRcdFx0bG9jYWxpemUoJ2NsZWFyU2VhcmNoJywgXCJDbGVhciBTZWFyY2hcIiksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUocHJlZmVyZW5jZXNDbGVhcklucHV0SWNvbiksXG5cdFx0XHRmYWxzZSxcblx0XHRcdCgpID0+IHRoaXMuY2xlYXJTZWFyY2goKVxuXHRcdCkpO1xuXHRcdGNvbnN0IGNvbGxhcHNlQWxsQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihcblx0XHRcdCd3b3JrYmVuY2gubW9kZWxzLmNvbGxhcHNlQWxsJyxcblx0XHRcdGxvY2FsaXplKCdjb2xsYXBzZUFsbCcsIFwiQ29sbGFwc2UgQWxsXCIpLFxuXHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY29sbGFwc2VBbGwpLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLmNvbGxhcHNlQWxsKCk7XG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0Y29sbGFwc2VBbGxBY3Rpb24uZW5hYmxlZCA9IHRoaXMudmlld01vZGVsLnZpZXdNb2RlbEVudHJpZXMuc29tZShlID0+IGlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkoZSkgfHwgaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3TW9kZWwub25EaWRDaGFuZ2UoKCkgPT4gY29sbGFwc2VBbGxBY3Rpb24uZW5hYmxlZCA9IHRoaXMudmlld01vZGVsLnZpZXdNb2RlbEVudHJpZXMuc29tZShlID0+IGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZSkgfHwgaXNMYW5ndWFnZU1vZGVsR3JvdXBFbnRyeShlKSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0Lm9uSW5wdXREaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y2xlYXJTZWFyY2hBY3Rpb24uZW5hYmxlZCA9ICEhdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKTtcblx0XHRcdHRoaXMuZmlsdGVyTW9kZWxzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zZWFyY2hBY3Rpb25zQ29udGFpbmVyID0gRE9NLmFwcGVuZChzZWFyY2hDb250YWluZXIsICQoJy5tb2RlbHMtc2VhcmNoLWFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IFtjbGVhclNlYXJjaEFjdGlvbiwgY29sbGFwc2VBbGxBY3Rpb24sIGZpbHRlckFjdGlvbl07XG5cdFx0Y29uc3QgdG9vbEJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb29sQmFyKHRoaXMuc2VhcmNoQWN0aW9uc0NvbnRhaW5lciwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gZmlsdGVyQWN0aW9uLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZWxzU2VhcmNoRmlsdGVyRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucywge1xuXHRcdFx0XHRcdFx0Z2V0VmFsdWU6ICgpID0+IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCksXG5cdFx0XHRcdFx0XHRzZXRWYWx1ZTogKHNlYXJjaFZhbHVlKSA9PiB0aGlzLnNlYXJjaChzZWFyY2hWYWx1ZSlcblx0XHRcdFx0XHR9LCB0aGlzLnZpZXdNb2RlbCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiAoKSA9PiB1bmRlZmluZWRcblx0XHR9KSk7XG5cdFx0dG9vbEJhci5zZXRBY3Rpb25zKGFjdGlvbnMpO1xuXG5cdFx0Ly8gQWRkIHBhZGRpbmcgdG8gaW5wdXQgYm94IGZvciB0b29sYmFyXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuaW5wdXRXaWRnZXQuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLnN0eWxlLnBhZGRpbmdSaWdodCA9IGAke0RPTS5nZXRUb3RhbFdpZHRoKHRoaXMuc2VhcmNoQWN0aW9uc0NvbnRhaW5lcikgKyAxMn1weGA7XG5cblx0XHR0aGlzLmFkZEJ1dHRvbkNvbnRhaW5lciA9IERPTS5hcHBlbmQoc2VhcmNoQW5kQnV0dG9uQ29udGFpbmVyLCAkKCcuc2VjdGlvbi10aXRsZS1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IGJ1dHRvbk9wdGlvbnM6IElCdXR0b25PcHRpb25zID0ge1xuXHRcdFx0Li4uZGVmYXVsdEJ1dHRvblN0eWxlcyxcblx0XHRcdHN1cHBvcnRJY29uczogdHJ1ZSxcblx0XHR9O1xuXG5cdFx0dGhpcy5hZGRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuYWRkQnV0dG9uQ29udGFpbmVyLCBidXR0b25PcHRpb25zKSk7XG5cdFx0dGhpcy5hZGRCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uYWRkLmlkfSkgJHtsb2NhbGl6ZSgnbW9kZWxzLmVuYWJsZU1vZGVsUHJvdmlkZXInLCAnQWRkIE1vZGVscycpfWA7XG5cdFx0dGhpcy5hZGRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb2RlbHMtYWRkLW1vZGVsLWJ1dHRvbicpO1xuXHRcdHRoaXMudXBkYXRlQWRkTW9kZWxzQnV0dG9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZGRCdXR0b24ub25EaWRDbGljaygoZSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZHJvcGRvd25BY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuYWRkQnV0dG9uLmVsZW1lbnQsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy5kcm9wZG93bkFjdGlvbnMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRoZSBtYXJrZXRwbGFjZSBidXR0b24gaXMgaGlkZGVuIGluIHRoZSBBZ2VudHMgd2luZG93IHdoZXJlIGluc3RhbGxpbmdcblx0XHQvLyBtb2RlbCBwcm92aWRlciBleHRlbnNpb25zIGlzIG5vdCBzdXBwb3J0ZWQuXG5cdFx0aWYgKCF0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRjb25zdCBicm93c2VNYXJrZXRwbGFjZUJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5hZGRCdXR0b25Db250YWluZXIsIHtcblx0XHRcdFx0Li4uYnV0dG9uT3B0aW9ucyxcblx0XHRcdFx0c2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0fSkpO1xuXHRcdFx0YnJvd3NlTWFya2V0cGxhY2VCdXR0b24ubGFiZWwgPSBgJCgke0NvZGljb24uZXh0ZW5zaW9ucy5pZH0pICR7bG9jYWxpemUoJ21vZGVscy5pbnN0YWxsUHJvdmlkZXJFeHRlbnNpb25zJywgXCJJbnN0YWxsIE1vZGVsIFByb3ZpZGVyc1wiKX1gO1xuXHRcdFx0YnJvd3NlTWFya2V0cGxhY2VCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb2RlbHMtYnJvd3NlLW1hcmtldHBsYWNlLWJ1dHRvbicpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnJvd3NlTWFya2V0cGxhY2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLm9wZW5MYW5ndWFnZU1vZGVsUHJvdmlkZXJFeHRlbnNpb25zU2VhcmNoKCkpKTtcblx0XHR9XG5cblx0XHQvLyBUYWJsZSBjb250YWluZXJcblx0XHR0aGlzLnRhYmxlQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5tb2RlbHMtdGFibGUtY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRhYmxlXG5cdFx0dGhpcy5jcmVhdGVUYWJsZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld01vZGVsLm9uRGlkQ2hhbmdlR3JvdXBpbmcoKCkgPT4gdGhpcy5jcmVhdGVUYWJsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW50aXRsZW1lbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVBZGRNb2RlbHNCdXR0b24oKTtcblx0XHRcdHRoaXMuY3JlYXRlVGFibGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVXNhZ2VCYXNlZEJpbGxpbmcoKCkgPT4gdGhpcy5jcmVhdGVUYWJsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsVmVuZG9ycygoKSA9PiB0aGlzLnVwZGF0ZUFkZE1vZGVsc0J1dHRvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VQaW5uZWRNb2RlbHMoKCkgPT4gdGhpcy52aWV3TW9kZWwucmVmcmVzaCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5vbkRpZENoYW5nZUNvbnRleHQoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShuZXcgU2V0KFsnZ2l0aHViLmNvcGlsb3QuY2xpZW50Qnlva0VuYWJsZWQnXSkpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQWRkTW9kZWxzQnV0dG9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUYWJsZSgpOiB2b2lkIHtcblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMudGFibGVDb250YWluZXIpO1xuXG5cdFx0dGhpcy50YWJsZVZpZXdwb3J0ID0gJCgnLm1vZGVscy10YWJsZS12aWV3cG9ydCcpO1xuXHRcdHRoaXMudGFibGVJbm5lciA9IERPTS5hcHBlbmQodGhpcy50YWJsZVZpZXdwb3J0LCAkKCcubW9kZWxzLXRhYmxlLWlubmVyJykpO1xuXHRcdHRoaXMudGFibGVTY3JvbGxhYmxlID0gdGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZChuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy50YWJsZVZpZXdwb3J0LCB7XG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHRcdHNjcm9sbFlUb1g6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMudGFibGVDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy50YWJsZVNjcm9sbGFibGUuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdGNvbnN0IGd1dHRlckNvbHVtblJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShHdXR0ZXJDb2x1bW5SZW5kZXJlciwgdGhpcy52aWV3TW9kZWwpO1xuXHRcdGNvbnN0IG1vZGVsTmFtZUNvbHVtblJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2RlbE5hbWVDb2x1bW5SZW5kZXJlcik7XG5cdFx0Y29uc3QgY29tYmluZWRDb3N0Q29sdW1uUmVuZGVyZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbWJpbmVkQ29zdENvbHVtblJlbmRlcmVyKTtcblx0XHRjb25zdCB0b2tlbkxpbWl0c0NvbHVtblJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb2tlbkxpbWl0c0NvbHVtblJlbmRlcmVyKTtcblx0XHRjb25zdCBjYXBhYmlsaXRpZXNDb2x1bW5SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2FwYWJpbGl0aWVzQ29sdW1uUmVuZGVyZXIpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb2x1bW5SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWN0aW9uc0NvbHVtblJlbmRlcmVyLCB0aGlzLnZpZXdNb2RlbCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJDb2x1bW5SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvdmlkZXJDb2x1bW5SZW5kZXJlcik7XG5cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKGNhcGFiaWxpdGllc0NvbHVtblJlbmRlcmVyKTtcblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKGNhcGFiaWxpdGllc0NvbHVtblJlbmRlcmVyLm9uRGlkQ2xpY2tDYXBhYmlsaXR5KGNhcGFiaWxpdHkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFF1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKTtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gYEBjYXBhYmlsaXR5OiR7Y2FwYWJpbGl0eX1gO1xuXHRcdFx0Y29uc3QgbmV3UXVlcnkgPSB0b2dnbGVGaWx0ZXIoY3VycmVudFF1ZXJ5LCB7IHF1ZXJ5IH0pO1xuXHRcdFx0dGhpcy5zZWFyY2gobmV3UXVlcnkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGNvbHVtbnMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdHdlaWdodDogMC4wNSxcblx0XHRcdFx0bWluaW11bVdpZHRoOiA2NCxcblx0XHRcdFx0bWF4aW11bVdpZHRoOiA2NCxcblx0XHRcdFx0dGVtcGxhdGVJZDogR3V0dGVyQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdHByb2plY3Qocm93OiBJVmlld01vZGVsRW50cnkpOiBJVmlld01vZGVsRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ21vZGVsTmFtZScsICdOYW1lJyksXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHR3ZWlnaHQ6IDAuMzUsXG5cdFx0XHRcdG1pbmltdW1XaWR0aDogMjAwLFxuXHRcdFx0XHR0ZW1wbGF0ZUlkOiBNb2RlbE5hbWVDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0cHJvamVjdChyb3c6IElWaWV3TW9kZWxFbnRyeSk6IElWaWV3TW9kZWxFbnRyeSB7IHJldHVybiByb3c7IH1cblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Y29uc3QgaXNVQkIgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UucXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nID09PSB0cnVlO1xuXHRcdGNvbHVtbnMucHVzaChcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0b2tlbkxpbWl0cycsICdDb250ZXh0IFNpemUnKSxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdHdlaWdodDogMC4xLFxuXHRcdFx0XHRtaW5pbXVtV2lkdGg6IDE0MCxcblx0XHRcdFx0dGVtcGxhdGVJZDogVG9rZW5MaW1pdHNDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0cHJvamVjdChyb3c6IElWaWV3TW9kZWxFbnRyeSk6IElWaWV3TW9kZWxFbnRyeSB7IHJldHVybiByb3c7IH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2FwYWJpbGl0aWVzJywgJ0NhcGFiaWxpdGllcycpLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0d2VpZ2h0OiAwLjE1LFxuXHRcdFx0XHRtaW5pbXVtV2lkdGg6IDE4MCxcblx0XHRcdFx0dGVtcGxhdGVJZDogQ2FwYWJpbGl0aWVzQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdHByb2plY3Qocm93OiBJVmlld01vZGVsRW50cnkpOiBJVmlld01vZGVsRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogaXNVQkIgPyBsb2NhbGl6ZSgnY29zdCcsICdDb3N0IChDcmVkaXRzIHBlciAxTSBUb2tlbnMpJykgOiBsb2NhbGl6ZSgncHJpY2luZycsICdQcmljaW5nJyksXG5cdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHR3ZWlnaHQ6IGlzVUJCID8gMC4yNCA6IDAuMTUsXG5cdFx0XHRcdG1pbmltdW1XaWR0aDogaXNVQkIgPyAyNDAgOiAyMDAsXG5cdFx0XHRcdHRlbXBsYXRlSWQ6IENvbWJpbmVkQ29zdENvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRwcm9qZWN0KHJvdzogSVZpZXdNb2RlbEVudHJ5KTogSVZpZXdNb2RlbEVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0d2VpZ2h0OiAwLjA1LFxuXHRcdFx0XHRtaW5pbXVtV2lkdGg6IDY0LFxuXHRcdFx0XHRtYXhpbXVtV2lkdGg6IDY0LFxuXHRcdFx0XHR0ZW1wbGF0ZUlkOiBBY3Rpb25zQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdHByb2plY3Qocm93OiBJVmlld01vZGVsRW50cnkpOiBJVmlld01vZGVsRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMudGFibGVNaW5XaWR0aCA9IGNvbHVtbnMucmVkdWNlKChzdW0sIGMpID0+IHN1bSArIGMubWluaW11bVdpZHRoLCAwKTtcblx0XHR0aGlzLnRhYmxlSW5uZXIuc3R5bGUubWluV2lkdGggPSBgJHt0aGlzLnRhYmxlTWluV2lkdGh9cHhgO1xuXG5cdFx0dGhpcy50YWJsZSA9IHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaFRhYmxlLFxuXHRcdFx0J01vZGVsc1dpZGdldCcsXG5cdFx0XHR0aGlzLnRhYmxlSW5uZXIsXG5cdFx0XHRuZXcgRGVsZWdhdGUoKSxcblx0XHRcdGNvbHVtbnMsXG5cdFx0XHRbXG5cdFx0XHRcdGd1dHRlckNvbHVtblJlbmRlcmVyLFxuXHRcdFx0XHRtb2RlbE5hbWVDb2x1bW5SZW5kZXJlcixcblx0XHRcdFx0Y29tYmluZWRDb3N0Q29sdW1uUmVuZGVyZXIsXG5cdFx0XHRcdHRva2VuTGltaXRzQ29sdW1uUmVuZGVyZXIsXG5cdFx0XHRcdGNhcGFiaWxpdGllc0NvbHVtblJlbmRlcmVyLFxuXHRcdFx0XHRhY3Rpb25zQ29sdW1uUmVuZGVyZXIsXG5cdFx0XHRcdHByb3ZpZGVyQ29sdW1uUmVuZGVyZXJcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHsgZ2V0SWQ6IChlOiBJVmlld01vZGVsRW50cnkpID0+IGUuaWQgfSxcblx0XHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZzogZmFsc2UsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGU6IElWaWV3TW9kZWxFbnRyeSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGUuaGlkZGVuXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgndmVuZG9yLmhpZGRlbi5hcmlhTGFiZWwnLCAnezB9IE1vZGVscyAoaGlkZGVuKScsIGUudmVuZG9yRW50cnkuZ3JvdXAubmFtZSlcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCd2ZW5kb3IuYXJpYUxhYmVsJywgJ3swfSBNb2RlbHMnLCBlLnZlbmRvckVudHJ5Lmdyb3VwLm5hbWUpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlLmlkID09PSAndmlzaWJsZScgPyBsb2NhbGl6ZSgndmlzaWJsZS5hcmlhTGFiZWwnLCAnVmlzaWJsZSBNb2RlbHMnKSA6IGxvY2FsaXplKCdoaWRkZW4uYXJpYUxhYmVsJywgJ0hpZGRlbiBNb2RlbHMnKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNTdGF0dXNFbnRyeShlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3N0YXR1cy5hcmlhTGFiZWwnLCAnU3RhdHVzOiB7MH0nLCBlLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgYXJpYUxhYmVscyA9IFtdO1xuXHRcdFx0XHRcdFx0YXJpYUxhYmVscy5wdXNoKGUubW9kZWwuaGlkZGVuXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVsLm5hbWUuaGlkZGVuJywgJ3swfSBmcm9tIHsxfSAoaGlkZGVuKScsIGUubW9kZWwubWV0YWRhdGEubmFtZSwgZ2V0TWFuYWdlTW9kZWxzUHJvdmlkZXJMYWJlbChlLm1vZGVsKSlcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWwubmFtZScsICd7MH0gZnJvbSB7MX0nLCBlLm1vZGVsLm1ldGFkYXRhLm5hbWUsIGdldE1hbmFnZU1vZGVsc1Byb3ZpZGVyTGFiZWwoZS5tb2RlbCkpKTtcblx0XHRcdFx0XHRcdGlmIChlLm1vZGVsLm1ldGFkYXRhLm1heElucHV0VG9rZW5zIHx8IGUubW9kZWwubWV0YWRhdGEubWF4T3V0cHV0VG9rZW5zKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRvdGFsVG9rZW5zID0gKGUubW9kZWwubWV0YWRhdGEubWF4SW5wdXRUb2tlbnMgPz8gMCkgKyAoZS5tb2RlbC5tZXRhZGF0YS5tYXhPdXRwdXRUb2tlbnMgPz8gMCk7XG5cdFx0XHRcdFx0XHRcdGFyaWFMYWJlbHMucHVzaChsb2NhbGl6ZSgnbW9kZWwuY29udGV4dFNpemUudG90YWxUb2tlbnMnLCAnQ29udGV4dCBzaXplOiB7MH0gdG9rZW5zJywgZm9ybWF0VG9rZW5Db3VudCh0b3RhbFRva2VucykpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlLm1vZGVsLm1ldGFkYXRhLmNhcGFiaWxpdGllcykge1xuXHRcdFx0XHRcdFx0XHRhcmlhTGFiZWxzLnB1c2gobG9jYWxpemUoJ21vZGVsLmNhcGFiaWxpdGllcycsICdDYXBhYmlsaXRpZXM6IHswfScsIE9iamVjdC5rZXlzKGUubW9kZWwubWV0YWRhdGEuY2FwYWJpbGl0aWVzKS5qb2luKCcsICcpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBwcmljaW5nVGV4dCA9IGUubW9kZWwubWV0YWRhdGEucHJpY2luZyA/PyAnLSc7XG5cdFx0XHRcdFx0XHRpZiAocHJpY2luZ1RleHQgIT09ICctJykge1xuXHRcdFx0XHRcdFx0XHRhcmlhTGFiZWxzLnB1c2gobG9jYWxpemUoJ3ByaWNpbmcuYXJpYUxhYmVsJywgXCJQcmljaW5nOiB7MH1cIiwgcHJpY2luZ1RleHQpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGFyaWFMYWJlbHMucHVzaChlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2lucHV0Q29zdC5hcmlhTGFiZWwuc2luZ3VsYXInLCBcIklucHV0IGNvc3Q6IHswfSBjcmVkaXQgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdClcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdpbnB1dENvc3QuYXJpYUxhYmVsLnBsdXJhbCcsIFwiSW5wdXQgY29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmlucHV0Q29zdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGUubW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0YXJpYUxhYmVscy5wdXNoKGUubW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0ID09PSAxXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnY2FjaGVDb3N0LmFyaWFMYWJlbC5zaW5ndWxhcicsIFwiQ2FjaGUgcmVhZCBjb3N0OiB7MH0gY3JlZGl0IHBlciAxTSB0b2tlbnNcIiwgZS5tb2RlbC5tZXRhZGF0YS5jYWNoZUNvc3QpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2FjaGVDb3N0LmFyaWFMYWJlbC5wbHVyYWwnLCBcIkNhY2hlIHJlYWQgY29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmNhY2hlQ29zdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGUubW9kZWwubWV0YWRhdGEuY2FjaGVXcml0ZUNvc3QgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRhcmlhTGFiZWxzLnB1c2goZS5tb2RlbC5tZXRhZGF0YS5jYWNoZVdyaXRlQ29zdCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NhY2hlV3JpdGVDb3N0LmFyaWFMYWJlbC5zaW5ndWxhcicsIFwiQ2FjaGUgd3JpdGUgY29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIGUubW9kZWwubWV0YWRhdGEuY2FjaGVXcml0ZUNvc3QpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2FjaGVXcml0ZUNvc3QuYXJpYUxhYmVsLnBsdXJhbCcsIFwiQ2FjaGUgd3JpdGUgY29zdDogezB9IGNyZWRpdHMgcGVyIDFNIHRva2Vuc1wiLCBlLm1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0KSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZS5tb2RlbC5tZXRhZGF0YS5vdXRwdXRDb3N0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0YXJpYUxhYmVscy5wdXNoKGUubW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCA9PT0gMVxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ291dHB1dENvc3QuYXJpYUxhYmVsLnNpbmd1bGFyJywgXCJPdXRwdXQgY29zdDogezB9IGNyZWRpdCBwZXIgMU0gdG9rZW5zXCIsIGUubW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdClcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdvdXRwdXRDb3N0LmFyaWFMYWJlbC5wbHVyYWwnLCBcIk91dHB1dCBjb3N0OiB7MH0gY3JlZGl0cyBwZXIgMU0gdG9rZW5zXCIsIGUubW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGFyaWFMYWJlbHMuam9pbignLiAnKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ21vZGVsc1RhYmxlLmFyaWFMYWJlbCcsICdMYW5ndWFnZSBNb2RlbHMnKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCkpIGFzIFdvcmtiZW5jaFRhYmxlPElWaWV3TW9kZWxFbnRyeT47XG5cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25Db250ZXh0TWVudShlID0+IHtcblx0XHRcdGlmICghZS5lbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy50YWJsZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IHNlbGVjdGVkRW50cmllcyA9IHNlbGVjdGlvbi5ldmVyeShpID0+IGkgIT09IGUuaW5kZXgpID8gW2UuZWxlbWVudF0gOiBzZWxlY3Rpb24ubWFwKGkgPT4gdGhpcy52aWV3TW9kZWwudmlld01vZGVsRW50cmllc1tpXSkuZmlsdGVyKGUgPT4gISFlKTtcblxuXHRcdFx0Ly8gR2V0IG1vZGVsIGVudHJpZXMgZnJvbSBzZWxlY3Rpb24gKGZpbHRlciBvdXQgdmVuZG9yL2dyb3VwL3N0YXR1cyBlbnRyaWVzKVxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbEVudHJpZXMgPSBzZWxlY3RlZEVudHJpZXMuZmlsdGVyKChlbnRyeSk6IGVudHJ5IGlzIElMYW5ndWFnZU1vZGVsRW50cnkgPT5cblx0XHRcdFx0IWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZW50cnkpICYmICFpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGVudHJ5KSAmJiAhaXNTdGF0dXNFbnRyeShlbnRyeSlcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRcdFx0bGV0IGNvbmZpZ3VyZUdyb3VwOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgY29uZmlndXJlVmVuZG9yOiBJTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGVzY3JpcHRvciB8IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKHNlbGVjdGVkTW9kZWxFbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBQaW4vdW5waW4gYWN0aW9uIFx1MjAxNCBzaW5nbGUgYWN0aW9uIGZvciBhbGwgc2VsZWN0ZWQgbW9kZWxzXG5cdFx0XHRcdGNvbnN0IHBpbm5hYmxlRW50cmllcyA9IHNlbGVjdGVkTW9kZWxFbnRyaWVzLmZpbHRlcihlID0+IGUubW9kZWwubWV0YWRhdGEuaWQgIT09ICdhdXRvJyk7XG5cdFx0XHRcdGlmIChwaW5uYWJsZUVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGFsbFBpbm5lZCA9IHBpbm5hYmxlRW50cmllcy5ldmVyeShlID0+IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmlzTW9kZWxQaW5uZWQoZS5tb2RlbC5pZGVudGlmaWVyKSk7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiBhbGxQaW5uZWQgPyAndW5waW5Nb2RlbHMnIDogJ3Bpbk1vZGVscycsXG5cdFx0XHRcdFx0XHRsYWJlbDogYWxsUGlubmVkXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy51bnBpbk1vZGVsJywgXCJVbnBpbiBNb2RlbFwiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMucGluTW9kZWwnLCBcIlBpbiBNb2RlbFwiKSxcblx0XHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoYWxsUGlubmVkID8gQ29kaWNvbi5waW5uZWQgOiBDb2RpY29uLnBpbiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBwaW5uYWJsZUVudHJpZXMpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAoYWxsUGlubmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS51bnBpbk1vZGVsKGVudHJ5Lm1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5waW5Nb2RlbChlbnRyeS5tb2RlbC5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBIaWRlL3Nob3cgYWN0aW9uIFx1MjAxNCBzaW5nbGUgYWN0aW9uIGZvciBhbGwgc2VsZWN0ZWQgbW9kZWxzXG5cdFx0XHRcdGNvbnN0IGFsbEhpZGRlbiA9IHNlbGVjdGVkTW9kZWxFbnRyaWVzLmV2ZXJ5KGUgPT4gZS5tb2RlbC5oaWRkZW4pO1xuXHRcdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdGlkOiBhbGxIaWRkZW4gPyAnc2hvd01vZGVscycgOiAnaGlkZU1vZGVscycsXG5cdFx0XHRcdFx0bGFiZWw6IGFsbEhpZGRlblxuXHRcdFx0XHRcdFx0PyAoc2VsZWN0ZWRNb2RlbEVudHJpZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5zaG93TW9kZWwnLCBcIlNob3cgTW9kZWxcIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLnNob3dNb2RlbHNQbHVyYWwnLCBcIlNob3cgTW9kZWxzXCIpKVxuXHRcdFx0XHRcdFx0OiAoc2VsZWN0ZWRNb2RlbEVudHJpZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5oaWRlTW9kZWwnLCBcIkhpZGUgTW9kZWxcIilcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnbW9kZWxzLmhpZGVNb2RlbHNQbHVyYWwnLCBcIkhpZGUgTW9kZWxzXCIpKSxcblx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGFsbEhpZGRlbiA/IENvZGljb24uZXllQ2xvc2VkIDogQ29kaWNvbi5leWUpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy52aWV3TW9kZWwuc2V0TW9kZWxzSGlkZGVuKHNlbGVjdGVkTW9kZWxFbnRyaWVzLCAhYWxsSGlkZGVuKSxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIFNob3cgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gYWN0aW9ucyBmb3IgYSBzaW5nbGUgbW9kZWxcblx0XHRcdFx0aWYgKHNlbGVjdGVkTW9kZWxFbnRyaWVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ0FjdGlvbnMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRNb2RlbENvbmZpZ3VyYXRpb25BY3Rpb25zKHNlbGVjdGVkTW9kZWxFbnRyaWVzWzBdLm1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdGlmIChjb25maWdBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2goLi4uY29uZmlnQWN0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gU2hvdyBjb25maWd1cmUgYWN0aW9uIGlmIGFsbCBtb2RlbHMgYXJlIGZyb20gdGhlIHNhbWUgZ3JvdXBcblx0XHRcdFx0Y29uZmlndXJlR3JvdXAgPSBzZWxlY3RlZE1vZGVsRW50cmllc1swXS5tb2RlbC5wcm92aWRlci5ncm91cC5uYW1lO1xuXHRcdFx0XHRjb25maWd1cmVWZW5kb3IgPSBzZWxlY3RlZE1vZGVsRW50cmllc1swXS5tb2RlbC5wcm92aWRlci52ZW5kb3I7XG5cdFx0XHRcdGlmIChzZWxlY3RlZE1vZGVsRW50cmllcy5zb21lKGVudHJ5ID0+IGVudHJ5Lm1vZGVsLnByb3ZpZGVyLnZlbmRvci5pc0RlZmF1bHQgfHwgZW50cnkubW9kZWwucHJvdmlkZXIuZ3JvdXAubmFtZSAhPT0gY29uZmlndXJlR3JvdXApKSB7XG5cdFx0XHRcdFx0Y29uZmlndXJlR3JvdXAgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uZmlndXJlVmVuZG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHNlbGVjdGVkRW50cmllcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSBlLmVsZW1lbnQ7XG5cdFx0XHRcdGlmIChpc0xhbmd1YWdlTW9kZWxQcm92aWRlckVudHJ5KGVudHJ5KSkge1xuXHRcdFx0XHRcdGNvbmZpZ3VyZUdyb3VwID0gZW50cnkudmVuZG9yRW50cnkuZ3JvdXAubmFtZTtcblx0XHRcdFx0XHRjb25maWd1cmVWZW5kb3IgPSBlbnRyeS52ZW5kb3JFbnRyeS52ZW5kb3I7XG5cblx0XHRcdFx0XHRhY3Rpb25zLnB1c2godG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6IGVudHJ5LmhpZGRlbiA/ICdzaG93R3JvdXAnIDogJ2hpZGVHcm91cCcsXG5cdFx0XHRcdFx0XHRsYWJlbDogZW50cnkuaGlkZGVuXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ21vZGVscy5zaG93R3JvdXAnLCBcIlNob3cgQWxsIE1vZGVsc1wiKVxuXHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdtb2RlbHMuaGlkZUdyb3VwJywgXCJIaWRlIEFsbCBNb2RlbHNcIiksXG5cdFx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGVudHJ5LmhpZGRlbiA/IENvZGljb24uZXllQ2xvc2VkIDogQ29kaWNvbi5leWUpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnZpZXdNb2RlbC50b2dnbGVHcm91cEhpZGRlbihlbnRyeSksXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maWd1cmVHcm91cCAmJiBjb25maWd1cmVWZW5kb3IpIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBBY3Rpb25zID0gY29uZmlndXJlVmVuZG9yLm1hbmFnZW1lbnRDb21tYW5kXG5cdFx0XHRcdFx0PyBbdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0aWQ6ICdtYW5hZ2VWZW5kb3InLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtb2RlbHMubWFuYWdlUHJvdmlkZXInLCAnTWFuYWdlIHswfS4uLicsIGNvbmZpZ3VyZUdyb3VwKSxcblx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbmZpZ3VyZVZlbmRvci5tYW5hZ2VtZW50Q29tbWFuZCEsIGNvbmZpZ3VyZVZlbmRvci52ZW5kb3IpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnZpZXdNb2RlbC5yZWZyZXNoKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSldXG5cdFx0XHRcdFx0OiBjcmVhdGVQcm92aWRlckdyb3VwQWN0aW9ucyh0aGlzLnZpZXdNb2RlbCwgY29uZmlndXJlVmVuZG9yLCBjb25maWd1cmVHcm91cCwgdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHRoaXMuZGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGlmIChncm91cEFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKC4uLmdyb3VwQWN0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gZS5hbmNob3IsXG5cdFx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9uc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRhYmxlLnNwbGljZSgwLCB0aGlzLnRhYmxlLmxlbmd0aCwgdGhpcy52aWV3TW9kZWwudmlld01vZGVsRW50cmllcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZmlyZSh0aGlzLml0ZW1Db3VudCk7XG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnZpZXdNb2RlbC5vbkRpZENoYW5nZSgoeyBhdCwgcmVtb3ZlZCwgYWRkZWQgfSkgPT4ge1xuXHRcdFx0dGhpcy50YWJsZS5zcGxpY2UoYXQsIHJlbW92ZWQsIGFkZGVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmZpcmUodGhpcy5pdGVtQ291bnQpO1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsLnNlbGVjdGVkRW50cnkpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRFbnRyeUluZGV4ID0gdGhpcy52aWV3TW9kZWwudmlld01vZGVsRW50cmllcy5pbmRleE9mKHRoaXMudmlld01vZGVsLnNlbGVjdGVkRW50cnkpO1xuXHRcdFx0XHR0aGlzLnRhYmxlLnNldEZvY3VzKFtzZWxlY3RlZEVudHJ5SW5kZXhdKTtcblx0XHRcdFx0dGhpcy50YWJsZS5zZXRTZWxlY3Rpb24oW3NlbGVjdGVkRW50cnlJbmRleF0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudGFibGVEaXNwb3NhYmxlcy5hZGQodGhpcy50YWJsZS5vbkRpZE9wZW4oYXN5bmMgKHsgZWxlbWVudCwgYnJvd3NlckV2ZW50IH0pID0+IHtcblx0XHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNTdGF0dXNFbnRyeShlbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNMYW5ndWFnZU1vZGVsUHJvdmlkZXJFbnRyeShlbGVtZW50KSB8fCBpc0xhbmd1YWdlTW9kZWxHcm91cEVudHJ5KGVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMudmlld01vZGVsLnRvZ2dsZUNvbGxhcHNlZChlbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnRhYmxlRGlzcG9zYWJsZXMuYWRkKHRoaXMudGFibGUub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB0aGlzLnZpZXdNb2RlbC5zZWxlY3RlZEVudHJ5ID0gZS5lbGVtZW50c1swXSkpO1xuXG5cdFx0dGhpcy50YWJsZURpc3Bvc2FibGVzLmFkZCh0aGlzLnRhYmxlLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWwuc2hvdWxkUmVmaWx0ZXIoKSkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5maWx0ZXIodGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5lbGVtZW50LmNsaWVudEhlaWdodCwgdGhpcy5lbGVtZW50LmNsaWVudFdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWRkTW9kZWxzQnV0dG9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYWJsZVZlbmRvcnMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzKCkuZmlsdGVyKHZlbmRvciA9PiB2ZW5kb3IubWFuYWdlbWVudENvbW1hbmQgfHwgdmVuZG9yLmNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0Y29uc3QgZW50aXRsZW1lbnQgPSB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQ7XG5cdFx0Y29uc3QgaXNNYW5hZ2VkRW50aXRsZW1lbnQgPSBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkJ1c2luZXNzIHx8IGVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuRW50ZXJwcmlzZTtcblx0XHRjb25zdCBzdXBwb3J0c0FkZGluZ01vZGVscyA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5pc0ludGVybmFsXG5cdFx0XHR8fCB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuY2xpZW50Qnlva0VuYWJsZWRcblx0XHRcdHx8IChlbnRpdGxlbWVudCAhPT0gQ2hhdEVudGl0bGVtZW50LlVua25vd25cblx0XHRcdFx0JiYgZW50aXRsZW1lbnQgIT09IENoYXRFbnRpdGxlbWVudC5BdmFpbGFibGVcblx0XHRcdFx0JiYgIWlzTWFuYWdlZEVudGl0bGVtZW50KTtcblxuXHRcdHRoaXMuZHJvcGRvd25BY3Rpb25zID0gYnVpbGRBZGRNb2RlbHNEcm9wZG93bkFjdGlvbnMoXG5cdFx0XHRjb25maWd1cmFibGVWZW5kb3JzLFxuXHRcdFx0c3VwcG9ydHNBZGRpbmdNb2RlbHMsXG5cdFx0XHR2ZW5kb3IgPT4gdGhpcy5hZGRNb2RlbHNGb3JWZW5kb3IodmVuZG9yKSxcblx0XHRcdHRoaXMuZGVmYXVsdEFjY291bnRSZXNvbHZlZCAmJiB0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5jdXJyZW50RGVmYXVsdEFjY291bnQgPT09IG51bGxcblx0XHRcdFx0PyAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lEKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHQpO1xuXG5cdFx0dGhpcy5hZGRCdXR0b24uZW5hYmxlZCA9IHRoaXMuZHJvcGRvd25BY3Rpb25zLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy5hZGRCdXR0b24uc2V0VGl0bGUoIXN1cHBvcnRzQWRkaW5nTW9kZWxzICYmIGlzTWFuYWdlZEVudGl0bGVtZW50ID8gbG9jYWxpemUoJ21vZGVscy5tYW5hZ2VkQnlPcmdhbml6YXRpb24nLCBcIkFkZGluZyBtb2RlbHMgaXMgbWFuYWdlZCBieSB5b3VyIG9yZ2FuaXphdGlvblwiKSA6ICcnKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3Blbkxhbmd1YWdlTW9kZWxQcm92aWRlckV4dGVuc2lvbnNTZWFyY2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWN0aXZlTW9kYWxFZGl0b3JQYXJ0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydDtcblx0XHRjb25zdCBpc0luTW9kYWxFZGl0b3IgPSAhIWFjdGl2ZU1vZGFsRWRpdG9yUGFydCAmJiB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0UGFydCh0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXApID09PSBhY3RpdmVNb2RhbEVkaXRvclBhcnQ7XG5cdFx0aWYgKGlzSW5Nb2RhbEVkaXRvcikge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDTE9TRV9NT0RBTF9FRElUT1JfQ09NTUFORF9JRCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKGB0YWc6XCIke0xBTkdVQUdFX01PREVMX0NIQVRfUFJPVklERVJfRVhURU5TSU9OX1RBR31cImAsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgZmlsdGVyTW9kZWxzKCk6IHZvaWQge1xuXHRcdHRoaXMuZGVsYXllZEZpbHRlcmluZy50cmlnZ2VyKCgpID0+IHtcblx0XHRcdHRoaXMudmlld01vZGVsLmZpbHRlcih0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkTW9kZWxzRm9yVmVuZG9yKHZlbmRvcjogSUxhbmd1YWdlTW9kZWxQcm92aWRlckRlc2NyaXB0b3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5jb25maWd1cmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodmVuZG9yLnZlbmRvcik7XG5cdFx0YXdhaXQgdGhpcy52aWV3TW9kZWwucmVmcmVzaCgpO1xuXHR9XG5cblx0cHVibGljIGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHdpZHRoID0gd2lkdGggLSAyNDtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5sYXlvdXQobmV3IERPTS5EaW1lbnNpb24od2lkdGggLSB0aGlzLnNlYXJjaEFjdGlvbnNDb250YWluZXIuY2xpZW50V2lkdGggLSB0aGlzLmFkZEJ1dHRvbkNvbnRhaW5lci5jbGllbnRXaWR0aCAtIDgsIDIyKSk7XG5cdFx0Y29uc3QgdGFibGVIZWlnaHQgPSBoZWlnaHQgLSA0MDtcblx0XHR0aGlzLnRhYmxlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RhYmxlSGVpZ2h0fXB4YDtcblx0XHRjb25zdCB0YWJsZVdpZHRoID0gTWF0aC5tYXgod2lkdGgsIHRoaXMudGFibGVNaW5XaWR0aCk7XG5cdFx0dGhpcy50YWJsZS5sYXlvdXQodGFibGVIZWlnaHQsIHRhYmxlV2lkdGgpO1xuXHRcdHRoaXMudGFibGVTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzU2VhcmNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgc2VhcmNoKGZpbHRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKGZpbHRlcik7XG5cdFx0dGhpcy52aWV3TW9kZWwuZmlsdGVyKGZpbHRlcik7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJTZWFyY2goKTogdm9pZCB7XG5cdFx0dGhpcy5mb2N1c1NlYXJjaCgpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKCcnKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld01vZGVsLnNob3VsZFJlZmlsdGVyKCkpIHtcblx0XHRcdHRoaXMudmlld01vZGVsLmZpbHRlcih0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgdG90YWwgbW9kZWwgY291bnQgKGV4Y2x1ZGluZyB2ZW5kb3IvZ3JvdXAvc3RhdHVzIGhlYWRlcnMpLlxuXHQgKi9cblx0Z2V0IGl0ZW1Db3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbC52aWV3TW9kZWxFbnRyaWVzXG5cdFx0XHQuZmlsdGVyKGUgPT4gIWlzTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRW50cnkoZSkgJiYgIWlzTGFuZ3VhZ2VNb2RlbEdyb3VwRW50cnkoZSkgJiYgIWlzU3RhdHVzRW50cnkoZSkpXG5cdFx0XHQubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWZpcmVzIHRoZSBjdXJyZW50IGl0ZW0gY291bnQuIENhbGwgYWZ0ZXIgc3Vic2NyaWJpbmcgdG8gb25EaWRDaGFuZ2VJdGVtQ291bnRcblx0ICogdG8gZW5zdXJlIHRoZSBzdWJzY3JpYmVyIHJlY2VpdmVzIHRoZSBsYXRlc3QgY291bnQuXG5cdCAqL1xuXHRmaXJlSXRlbUNvdW50KCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbUNvdW50LmZpcmUodGhpcy5pdGVtQ291bnQpO1xuXHR9XG5cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxlQUFlO0FBQ3hCLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQThCO0FBQ3ZDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsd0JBQTBELHNDQUFzQztBQUN6RyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFrQixVQUFVLFFBQVEsaUJBQWlCO0FBQ3JELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHFC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
