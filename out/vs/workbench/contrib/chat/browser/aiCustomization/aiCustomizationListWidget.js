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
import "./media/aiCustomizationManagement.css";
import * as DOM from "../../../../../base/browser/dom.js";
import * as aria from "../../../../../base/browser/ui/aria/aria.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { autorun } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { localize } from "../../../../../nls.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { NotSelectableGroupId } from "../../../../../base/browser/ui/list/list.js";
import { IPromptsService, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, userIcon, workspaceIcon, extensionIcon, pluginIcon, builtinIcon } from "./aiCustomizationIcons.js";
import { AI_CUSTOMIZATION_ITEM_STORAGE_KEY, AI_CUSTOMIZATION_ITEM_TYPE_KEY, AI_CUSTOMIZATION_ITEM_URI_KEY, AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY, AICustomizationManagementItemMenuId, AICustomizationManagementCreateMenuId, AICustomizationManagementSection, AI_CUSTOMIZATION_ITEM_DISABLED_KEY, sectionToPromptType } from "./aiCustomizationManagement.js";
import { IAgentPluginService } from "../../common/plugins/agentPluginService.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { defaultButtonStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { Delayer } from "../../../../../base/common/async.js";
import { IContextMenuService, IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { HighlightedLabel } from "../../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { matchesContiguousSubString } from "../../../../../base/common/filters.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { Button, ButtonWithDropdown } from "../../../../../base/browser/ui/button/button.js";
import { IMenuService, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { createActionViewItem, getContextMenuActions } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { AICustomizationSources, IAICustomizationWorkspaceService } from "../../common/aiCustomizationWorkspaceService.js";
import { Action, Separator } from "../../../../../base/common/actions.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { generateCustomizationDebugReport } from "./aiCustomizationDebugPanel.js";
import { getCustomizationSecondaryText } from "./aiCustomizationListWidgetUtils.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IAICustomizationItemsModel } from "./aiCustomizationItemsModel.js";
import { truncateToFirstLine } from "./aiCustomizationListWidgetUtils.js";
const $ = DOM.$;
const ITEM_HEIGHT = 44;
const GROUP_HEADER_HEIGHT = 36;
const GROUP_HEADER_HEIGHT_WITH_SEPARATOR = 40;
class AICustomizationListDelegate {
  getHeight(element) {
    if (element.type === "group-header") {
      return element.isFirst ? GROUP_HEADER_HEIGHT : GROUP_HEADER_HEIGHT_WITH_SEPARATOR;
    }
    return ITEM_HEIGHT;
  }
  getTemplateId(element) {
    return element.type === "group-header" ? "groupHeader" : "aiCustomizationItem";
  }
}
class GroupHeaderRenderer {
  constructor(hoverService) {
    this.hoverService = hoverService;
    this.templateId = "groupHeader";
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("ai-customization-group-header");
    const chevron = DOM.append(container, $(".group-chevron"));
    const icon = DOM.append(container, $(".group-icon"));
    const labelGroup = DOM.append(container, $(".group-label-group"));
    const label = DOM.append(labelGroup, $(".group-label"));
    const count = DOM.append(container, $(".group-count"));
    const infoIcon = DOM.append(container, $(".group-info"));
    infoIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    return { container, chevron, icon, label, count, infoIcon, disposables, elementDisposables };
  }
  renderElement(element, _index, templateData) {
    templateData.elementDisposables.clear();
    templateData.chevron.className = "group-chevron";
    templateData.chevron.classList.add(...ThemeIcon.asClassNameArray(element.collapsed ? Codicon.chevronRight : Codicon.chevronDown));
    templateData.icon.className = "group-icon";
    templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));
    templateData.label.textContent = element.label;
    templateData.count.textContent = `${element.count}`;
    templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.infoIcon, () => ({
      content: element.description,
      appearance: {
        compact: true,
        skipFadeInAnimation: true
      }
    })));
    templateData.container.classList.toggle("collapsed", element.collapsed);
    templateData.container.classList.toggle("has-previous-group", !element.isFirst);
  }
  disposeTemplate(templateData) {
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
}
function promptTypeToIcon(type) {
  switch (type) {
    case PromptsType.agent:
      return agentIcon;
    case PromptsType.skill:
      return skillIcon;
    case PromptsType.instructions:
      return instructionsIcon;
    case PromptsType.prompt:
      return promptIcon;
    case PromptsType.hook:
      return hookIcon;
    default:
      return promptIcon;
  }
}
function formatDisplayName(name) {
  return name.replace(/\.md$/i, "");
}
let AICustomizationItemRenderer = class {
  constructor(hoverService, labelService, menuService, contextKeyService, instantiationService, agentPluginService) {
    this.hoverService = hoverService;
    this.labelService = labelService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.agentPluginService = agentPluginService;
    this.templateId = "aiCustomizationItem";
    /**
     * Live (non-disposed) templates. Used to keep only the focused row's
     * inline action bar in the document tab order so that Tab from a focused
     * row enters that row's actions exactly once instead of cycling through
     * every row's actions.
     */
    this.templates = /* @__PURE__ */ new Set();
    this.focusedIndex = -1;
  }
  /**
   * Tell the renderer which row index is currently focused in the list.
   * The action bar of that row (and only that row) is made tab-focusable.
   * Pass -1 to clear focus; in that case all action bars are made non-focusable.
   */
  setFocusedIndex(index) {
    this.focusedIndex = index;
    for (const template of this.templates) {
      template.actionBar.setFocusable(index !== -1 && template.currentIndex === index);
    }
  }
  renderTemplate(container) {
    const disposables = new DisposableStore();
    const elementDisposables = new DisposableStore();
    container.classList.add("ai-customization-list-item");
    const leftSection = DOM.append(container, $(".item-left"));
    const typeIcon = DOM.append(leftSection, $(".item-type-icon"));
    const textContainer = DOM.append(leftSection, $(".item-text"));
    const nameRow = DOM.append(textContainer, $(".item-name-row"));
    const nameLabel = disposables.add(new HighlightedLabel(DOM.append(nameRow, $(".item-name"))));
    const badge = DOM.append(nameRow, $(".inline-badge.item-badge"));
    const statusIcon = DOM.append(nameRow, $(".item-status-icon"));
    const description = disposables.add(new HighlightedLabel(DOM.append(textContainer, $(".item-description"))));
    const actionsContainer = DOM.append(container, $(".item-right"));
    const actionBar = disposables.add(new ActionBar(actionsContainer, {
      actionViewItemProvider: createActionViewItem.bind(void 0, this.instantiationService)
    }));
    actionBar.setFocusable(false);
    const template = {
      container,
      actionsContainer,
      actionBar,
      typeIcon,
      nameLabel,
      badge,
      statusIcon,
      description,
      disposables,
      elementDisposables,
      currentIndex: -1
    };
    this.templates.add(template);
    return template;
  }
  renderElement(entry, index, templateData) {
    templateData.elementDisposables.clear();
    templateData.currentIndex = index;
    templateData.actionBar.setFocusable(this.focusedIndex !== -1 && index === this.focusedIndex);
    const element = entry.item;
    templateData.typeIcon.className = "item-type-icon";
    templateData.typeIcon.classList.add(...ThemeIcon.asClassNameArray(element.typeIcon ?? promptTypeToIcon(element.promptType)));
    templateData.elementDisposables.add(this.hoverService.setupDelayedHover(templateData.container, () => {
      let content;
      if (element.isBuiltin) {
        content = `${element.name}
${localize("builtinSource", "Built-in")}`;
      } else if (element.extensionId) {
        content = `${element.name}
${localize("fromExtension", "Extension: {0}", element.extensionId)}`;
      } else {
        const isWorkspaceItem = element.source === AICustomizationSources.local;
        const uriLabel = this.labelService.getUriLabel(element.uri, { relative: isWorkspaceItem });
        content = `${element.name}
${uriLabel}`;
      }
      if (element.badgeTooltip) {
        content += `

${element.badgeTooltip}`;
      }
      const plugin = element.pluginUri && this.agentPluginService.plugins.get().find((p) => isEqual(p.uri, element.pluginUri));
      if (plugin) {
        content += `
${localize("fromPlugin", "Plugin: {0}", plugin.label)}`;
      }
      return {
        content,
        appearance: {
          compact: true,
          skipFadeInAnimation: true
        }
      };
    }));
    templateData.container.classList.toggle("disabled", element.disabled);
    const displayName = element.displayName ?? formatDisplayName(element.name);
    templateData.nameLabel.set(displayName, element.nameMatches);
    if (element.badge) {
      templateData.badge.textContent = element.badge;
      templateData.badge.style.display = "";
      if (element.badgeTooltip) {
        templateData.elementDisposables.add(this.hoverService.setupManagedHover(
          getDefaultHoverDelegate("mouse"),
          templateData.badge,
          element.badgeTooltip
        ));
      }
    } else {
      templateData.badge.textContent = "";
      templateData.badge.style.display = "none";
    }
    if (element.status) {
      templateData.statusIcon.style.display = "";
      templateData.statusIcon.className = "item-status-icon";
      switch (element.status) {
        case "loading":
          templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), "codicon-modifier-spin");
          break;
        case "loaded":
          templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
          break;
        case "degraded":
          templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
          break;
        case "error":
          templateData.statusIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.error));
          break;
      }
      if (element.statusMessage) {
        templateData.elementDisposables.add(this.hoverService.setupManagedHover(
          getDefaultHoverDelegate("mouse"),
          templateData.statusIcon,
          element.statusMessage
        ));
      }
    } else {
      templateData.statusIcon.style.display = "none";
      templateData.statusIcon.className = "item-status-icon";
    }
    const secondaryText = getCustomizationSecondaryText(element.description, element.filename, element.promptType);
    let secondaryTextMatches;
    if (secondaryText && element.description && element.descriptionMatches) {
      if (secondaryText === element.description) {
        secondaryTextMatches = element.descriptionMatches;
      } else {
        const maxLength = secondaryText.length;
        const clampedMatches = element.descriptionMatches.map((match) => {
          if (match.start >= maxLength || match.end <= 0) {
            return void 0;
          }
          const clampedStart = Math.max(0, match.start);
          const clampedEnd = Math.min(match.end, maxLength);
          return clampedEnd > clampedStart ? { start: clampedStart, end: clampedEnd } : void 0;
        }).filter((match) => !!match);
        secondaryTextMatches = clampedMatches.length ? clampedMatches : void 0;
      }
    }
    if (secondaryText) {
      templateData.description.set(secondaryText, secondaryTextMatches);
      templateData.description.element.style.display = "";
      templateData.description.element.classList.toggle("is-filename", !element.description);
    } else {
      templateData.description.set("", void 0);
      templateData.description.element.style.display = "none";
    }
    const context = {
      uri: element.uri.toString(),
      name: element.name,
      promptType: element.promptType,
      source: element.source,
      pluginUri: element.pluginUri?.toString(),
      itemId: element.id
    };
    const overlayPairs = [
      [AI_CUSTOMIZATION_ITEM_TYPE_KEY, element.promptType],
      [AI_CUSTOMIZATION_ITEM_URI_KEY, element.uri.toString()],
      [AI_CUSTOMIZATION_ITEM_DISABLED_KEY, element.disabled]
    ];
    if (element.source) {
      overlayPairs.push([AI_CUSTOMIZATION_ITEM_STORAGE_KEY, element.source]);
    }
    if (element.pluginUri) {
      overlayPairs.push([AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY, element.pluginUri.toString()]);
    }
    const overlay = this.contextKeyService.createOverlay(overlayPairs);
    const menu = templateData.elementDisposables.add(
      this.menuService.createMenu(AICustomizationManagementItemMenuId, overlay)
    );
    const updateActions = () => {
      const actions = menu.getActions({ arg: context, shouldForwardArgs: true });
      const { primary } = getContextMenuActions(actions, "inline");
      templateData.actionBar.clear();
      templateData.actionBar.push(primary, { icon: true, label: false });
    };
    updateActions();
    templateData.elementDisposables.add(menu.onDidChange(updateActions));
    templateData.actionBar.context = context;
  }
  disposeElement(_entry, _index, templateData) {
    templateData.currentIndex = -1;
  }
  disposeTemplate(templateData) {
    this.templates.delete(templateData);
    templateData.elementDisposables.dispose();
    templateData.disposables.dispose();
  }
};
AICustomizationItemRenderer = __decorateClass([
  __decorateParam(0, IHoverService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, IMenuService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IAgentPluginService)
], AICustomizationItemRenderer);
function toItemsModelSection(section) {
  switch (section) {
    case AICustomizationManagementSection.Agents:
    case AICustomizationManagementSection.Skills:
    case AICustomizationManagementSection.Instructions:
    case AICustomizationManagementSection.Prompts:
    case AICustomizationManagementSection.Hooks:
      return section;
    default:
      return void 0;
  }
}
function getCountAnnouncement(section, count, isFiltering) {
  switch (section) {
    case AICustomizationManagementSection.Agents:
      if (isFiltering) {
        if (count === 0) {
          return localize("countAgentsNoResults", "No agents found");
        }
        if (count === 1) {
          return localize("countAgentsOneResult", "1 agent found");
        }
        return localize("countAgentsResults", "{0} agents found", count);
      }
      if (count === 0) {
        return localize("countAgentsNone", "No agents");
      }
      if (count === 1) {
        return localize("countAgentsOne", "1 agent");
      }
      return localize("countAgents", "{0} agents", count);
    case AICustomizationManagementSection.Skills:
      if (isFiltering) {
        if (count === 0) {
          return localize("countSkillsNoResults", "No skills found");
        }
        if (count === 1) {
          return localize("countSkillsOneResult", "1 skill found");
        }
        return localize("countSkillsResults", "{0} skills found", count);
      }
      if (count === 0) {
        return localize("countSkillsNone", "No skills");
      }
      if (count === 1) {
        return localize("countSkillsOne", "1 skill");
      }
      return localize("countSkills", "{0} skills", count);
    case AICustomizationManagementSection.Instructions:
      if (isFiltering) {
        if (count === 0) {
          return localize("countInstructionsNoResults", "No instructions found");
        }
        if (count === 1) {
          return localize("countInstructionsOneResult", "1 instruction file found");
        }
        return localize("countInstructionsResults", "{0} instruction files found", count);
      }
      if (count === 0) {
        return localize("countInstructionsNone", "No instructions");
      }
      if (count === 1) {
        return localize("countInstructionsOne", "1 instruction file");
      }
      return localize("countInstructions", "{0} instruction files", count);
    case AICustomizationManagementSection.Hooks:
      if (isFiltering) {
        if (count === 0) {
          return localize("countHooksNoResults", "No hooks found");
        }
        if (count === 1) {
          return localize("countHooksOneResult", "1 hook found");
        }
        return localize("countHooksResults", "{0} hooks found", count);
      }
      if (count === 0) {
        return localize("countHooksNone", "No hooks");
      }
      if (count === 1) {
        return localize("countHooksOne", "1 hook");
      }
      return localize("countHooks", "{0} hooks", count);
    case AICustomizationManagementSection.Prompts:
    default:
      if (isFiltering) {
        if (count === 0) {
          return localize("countPromptsNoResults", "No prompts found");
        }
        if (count === 1) {
          return localize("countPromptsOneResult", "1 prompt found");
        }
        return localize("countPromptsResults", "{0} prompts found", count);
      }
      if (count === 0) {
        return localize("countPromptsNone", "No prompts");
      }
      if (count === 1) {
        return localize("countPromptsOne", "1 prompt");
      }
      return localize("countPrompts", "{0} prompts", count);
  }
}
let AICustomizationListWidget = class extends Disposable {
  constructor(instantiationService, promptsService, contextViewService, openerService, contextMenuService, menuService, contextKeyService, labelService, workspaceService, clipboardService, hoverService, fileService, telemetryService, harnessService, commandService, itemsModel, agentPluginService) {
    super();
    this.instantiationService = instantiationService;
    this.promptsService = promptsService;
    this.contextViewService = contextViewService;
    this.openerService = openerService;
    this.contextMenuService = contextMenuService;
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.labelService = labelService;
    this.workspaceService = workspaceService;
    this.clipboardService = clipboardService;
    this.hoverService = hoverService;
    this.fileService = fileService;
    this.telemetryService = telemetryService;
    this.harnessService = harnessService;
    this.commandService = commandService;
    this.itemsModel = itemsModel;
    this.agentPluginService = agentPluginService;
    this.currentSection = AICustomizationManagementSection.Agents;
    this.allItems = [];
    this.displayEntries = [];
    this.searchQuery = "";
    this.collapsedGroups = /* @__PURE__ */ new Set();
    this._layoutDeferred = false;
    this.lastLayoutWidth = 0;
    this.lastLayoutHeight = 0;
    this.lastHeaderHeight = 0;
    this.dropdownActionDisposables = this._register(new DisposableStore());
    /** Monotonically increasing counter; guards the post-load announcement against stale calls. */
    this._sectionLoadId = 0;
    this.delayedFilter = new Delayer(200);
    /** Subscription to the items model for the current section; refreshed on setSection. */
    this.currentSectionSubscription = this._register(new MutableDisposable());
    this._onDidSelectItem = this._register(new Emitter());
    this.onDidSelectItem = this._onDidSelectItem.event;
    this._onDidChangeItemCount = this._register(new Emitter());
    this.onDidChangeItemCount = this._onDidChangeItemCount.event;
    this._onDidRequestCreate = this._register(new Emitter());
    this.onDidRequestCreate = this._onDidRequestCreate.event;
    this._onDidRequestCreateManual = this._register(new Emitter());
    this.onDidRequestCreateManual = this._onDidRequestCreateManual.event;
    this.element = $(".ai-customization-list-widget");
    this.create();
    this._register(autorun((reader) => {
      this.workspaceService.activeProjectRoot.read(reader);
      this.updateAddButton();
    }));
    this._register(autorun((reader) => {
      this.harnessService.activeHarness.read(reader);
      this.harnessService.availableHarnesses.read(reader);
      this.updateAddButton();
    }));
  }
  create() {
    this.sectionTitleHeader = DOM.append(this.element, $(".section-title-header"));
    const titleRow = DOM.append(this.sectionTitleHeader, $(".section-title-row"));
    this.sectionTitle = DOM.append(titleRow, $("h2.section-title"));
    this.sectionTitleDescription = DOM.append(this.sectionTitleHeader, $("p.section-title-description"));
    this.sectionTitleDescriptionText = DOM.append(this.sectionTitleDescription, $("span.section-title-description-text"));
    this.sectionTitleDescription.appendChild(document.createTextNode(" "));
    this.sectionLink = DOM.append(this.sectionTitleDescription, $("a.section-title-link"));
    this._register(DOM.addDisposableListener(this.sectionLink, "click", (e) => {
      e.preventDefault();
      const href = this.sectionLink.href;
      if (href) {
        this.openerService.open(URI.parse(href));
      }
    }));
    const targetWindow = DOM.getWindow(this.element);
    const headerObserver = this._register(new DOM.DisposableResizeObserver(
      "AICustomizationListWidget.sectionTitleHeader",
      () => {
        if (this.lastLayoutWidth <= 0 || this.lastLayoutHeight <= 0) {
          return;
        }
        const headerHeight = this.sectionTitleHeader.offsetHeight;
        if (headerHeight === this.lastHeaderHeight) {
          return;
        }
        this.layout(this.lastLayoutHeight, this.lastLayoutWidth);
      },
      targetWindow
    ));
    this._register(headerObserver.observe(this.sectionTitleHeader));
    this.searchAndButtonContainer = DOM.append(this.element, $(".list-search-and-button-container"));
    this.searchContainer = DOM.append(this.searchAndButtonContainer, $(".list-search-container"));
    this.searchInput = this._register(new InputBox(this.searchContainer, this.contextViewService, {
      placeholder: localize("searchPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this._register(this.searchInput.onDidChange(() => {
      this.searchQuery = this.searchInput.value;
      this.delayedFilter.trigger(() => {
        const matchCount = this.filterItems();
        this.announceItemCount(matchCount);
        if (this.searchQuery.trim()) {
          this.telemetryService.publicLog2("chatCustomizationEditor.search", {
            section: this.currentSection,
            resultCount: matchCount
          });
        }
      });
    }));
    this.addButtonContainer = DOM.append(this.searchAndButtonContainer, $(".list-add-button-container"));
    this.addButtonSimple = this._register(new Button(this.addButtonContainer, {
      ...defaultButtonStyles,
      supportIcons: true
    }));
    this.addButtonSimple.element.classList.add("list-add-button");
    this._register(this.addButtonSimple.onDidClick(() => this.executePrimaryCreateAction()));
    this.addButton = this._register(new ButtonWithDropdown(this.addButtonContainer, {
      ...defaultButtonStyles,
      supportIcons: true,
      contextMenuProvider: this.contextMenuService,
      addPrimaryActionToDropdown: false,
      actions: { getActions: () => this.getDropdownActions() }
    }));
    this.addButton.element.classList.add("list-add-button");
    this._register(this.addButton.onDidClick(() => this.executePrimaryCreateAction()));
    this.updateAddButton();
    this.listContainer = DOM.append(this.element, $(".list-container"));
    this.emptyStateContainer = DOM.append(this.element, $(".list-empty-state"));
    const emptyStateHeader = DOM.append(this.emptyStateContainer, $(".empty-state-header"));
    this.emptyStateText = DOM.append(emptyStateHeader, $(".empty-state-text"));
    this.emptyStateSubtext = DOM.append(this.emptyStateContainer, $(".empty-state-subtext"));
    this.emptyStateContainer.style.display = "none";
    const itemRenderer = this.instantiationService.createInstance(AICustomizationItemRenderer);
    this.list = this._register(this.instantiationService.createInstance(
      WorkbenchList,
      "AICustomizationManagementList",
      this.listContainer,
      new AICustomizationListDelegate(),
      [
        new GroupHeaderRenderer(this.hoverService),
        itemRenderer
      ],
      {
        identityProvider: {
          getId: (entry) => entry.type === "group-header" ? entry.id : entry.item.id,
          getGroupId: (entry) => entry.type === "group-header" ? NotSelectableGroupId : 0
        },
        accessibilityProvider: {
          getAriaLabel: (entry) => {
            if (entry.type === "group-header") {
              return localize("groupAriaLabel", "{0}, {1} items, {2}", entry.label, entry.count, entry.collapsed ? localize("collapsed", "collapsed") : localize("expanded", "expanded"));
            }
            const displayName = entry.item.displayName ?? formatDisplayName(entry.item.name);
            const secondaryText = getCustomizationSecondaryText(entry.item.description, entry.item.filename, entry.item.promptType);
            const nameAndDesc = secondaryText ? localize("itemAriaLabel", "{0}. {1}", displayName, secondaryText) : displayName;
            return entry.item.disabled ? localize("itemAriaLabelDisabled", "{0}, disabled", nameAndDesc) : nameAndDesc;
          },
          getWidgetAriaLabel: () => localize("listAriaLabel", "Agent Customizations")
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (entry) => entry.type === "group-header" ? entry.label : entry.item.name
        },
        multipleSelectionSupport: false,
        openOnSingleClick: true
      }
    ));
    this._register(this.list.onDidOpen((e) => {
      if (e.element) {
        if (e.element.type === "group-header") {
          this.toggleGroup(e.element);
        } else {
          this._onDidSelectItem.fire(e.element.item);
        }
      }
    }));
    this._register(this.list.onDidChangeFocus((e) => {
      itemRenderer.setFocusedIndex(e.indexes.length ? e.indexes[0] : -1);
    }));
    this._register(this.list.onDidFocus(() => {
      if (this.list.getFocus().length === 0 && this.displayEntries.length > 0) {
        const firstItemIndex = this.displayEntries.findIndex((e) => e.type !== "group-header");
        if (firstItemIndex >= 0) {
          this.list.setFocus([firstItemIndex]);
        }
      }
    }));
    this._register(this.list.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.fileService.onDidFilesChange((e) => {
      if (e.gotDeleted()) {
        this.refresh();
      }
    }));
    this.updateSectionHeader();
  }
  /**
   * Handles context menu for list items.
   */
  onContextMenu(e) {
    if (!e.element || e.element.type !== "file-item") {
      return;
    }
    const item = e.element.item;
    const context = {
      uri: item.uri.toString(),
      name: item.name,
      promptType: item.promptType,
      source: item.source,
      pluginUri: item.pluginUri?.toString(),
      itemId: item.id
    };
    const overlayPairs = [
      [AI_CUSTOMIZATION_ITEM_TYPE_KEY, item.promptType],
      [AI_CUSTOMIZATION_ITEM_URI_KEY, item.uri.toString()],
      [AI_CUSTOMIZATION_ITEM_DISABLED_KEY, item.disabled]
    ];
    if (item.source) {
      overlayPairs.push([AI_CUSTOMIZATION_ITEM_STORAGE_KEY, item.source]);
    }
    if (item.pluginUri) {
      overlayPairs.push([AI_CUSTOMIZATION_ITEM_PLUGIN_URI_KEY, item.pluginUri.toString()]);
    }
    const overlay = this.contextKeyService.createOverlay(overlayPairs);
    const actions = this.menuService.getMenuActions(AICustomizationManagementItemMenuId, overlay, {
      arg: context,
      shouldForwardArgs: true
    });
    const { secondary } = getContextMenuActions(actions, "inline");
    const copyActions = item.isBuiltin ? [] : [
      new Separator(),
      new Action("copyFullPath", localize("copyFullPath", "Copy Full Path"), void 0, true, async () => {
        await this.clipboardService.writeText(item.uri.fsPath);
      }),
      new Action("copyRelativePath", localize("copyRelativePath", "Copy Relative Path"), void 0, true, async () => {
        const basePath = this.workspaceService.getActiveProjectRoot();
        if (basePath && item.uri.fsPath.startsWith(basePath.fsPath)) {
          const relative = item.uri.fsPath.substring(basePath.fsPath.length + 1);
          await this.clipboardService.writeText(relative);
        } else {
          const relativePath = this.labelService.getUriLabel(item.uri, { relative: true });
          await this.clipboardService.writeText(relativePath);
        }
      })
    ];
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.anchor,
      getActions: () => [...secondary, ...copyActions]
    });
  }
  /**
   * Sets the current section and binds the list to the model's per-section
   * observable. Returns once the initial fetch for the section has resolved
   * so that callers (e.g. tests/fixtures) can rely on rendered output
   * reflecting at least one fetch.
   */
  async setSection(section) {
    const loadId = ++this._sectionLoadId;
    this.currentSection = section;
    this.updateSectionHeader();
    const modelSection = toItemsModelSection(section);
    if (!modelSection) {
      this.currentSectionSubscription.clear();
      this.allItems = [];
      const matchCount = this.filterItems();
      this._onDidChangeItemCount.fire(0);
      this.updateAddButton();
      this.announceItemCount(matchCount);
      return;
    }
    const observable = this.itemsModel.getItems(modelSection);
    this.currentSectionSubscription.value = autorun((reader) => {
      const items = observable.read(reader);
      this.allItems = items;
      this.filterItems();
      this._onDidChangeItemCount.fire(items.length);
    });
    this.updateAddButton();
    await this.itemsModel.whenSectionLoaded(modelSection);
    if (loadId === this._sectionLoadId) {
      this.announceItemCount(this.applySearchFilter(this.allItems).length);
    }
  }
  /**
   * Updates the section header based on the current section.
   */
  updateSectionHeader() {
    let title;
    let description;
    let docsUrl;
    let learnMoreLabel;
    switch (this.currentSection) {
      case AICustomizationManagementSection.Agents:
        title = localize("agents", "Agents");
        description = localize("agentsDescription", "Configure the AI to adopt different personas tailored to specific development tasks. Each agent has its own instructions, tools, and behavior.");
        docsUrl = "https://code.visualstudio.com/docs/agent-customization/custom-agents?referrer=in-product";
        learnMoreLabel = localize("learnMoreAgents", "Learn more about custom agents");
        break;
      case AICustomizationManagementSection.Skills:
        title = localize("skills", "Skills");
        description = localize("skillsDescription", "Folders of instructions, scripts, and resources that Copilot loads when relevant to perform specialized tasks.");
        docsUrl = "https://code.visualstudio.com/docs/agent-customization/agent-skills?referrer=in-product";
        learnMoreLabel = localize("learnMoreSkills", "Learn more about agent skills");
        break;
      case AICustomizationManagementSection.Instructions:
        title = localize("instructions", "Instructions");
        description = localize("instructionsDescription", "Define common guidelines and rules that automatically influence how AI generates code and handles development tasks.");
        docsUrl = "https://code.visualstudio.com/docs/agent-customization/custom-instructions?referrer=in-product";
        learnMoreLabel = localize("learnMoreInstructions", "Learn more about custom instructions");
        break;
      case AICustomizationManagementSection.Hooks:
        title = localize("hooks", "Hooks");
        description = localize("hooksDescription", "Prompts executed at specific points during an agentic lifecycle.");
        docsUrl = "https://code.visualstudio.com/docs/agent-customization/hooks?referrer=in-product";
        learnMoreLabel = localize("learnMoreHooks", "Learn more about hooks");
        break;
      case AICustomizationManagementSection.Prompts:
      default:
        title = localize("prompts", "Prompts");
        description = localize("promptsDescription", "Reusable prompts for common development tasks like generating code, performing reviews, or scaffolding components.");
        docsUrl = "https://code.visualstudio.com/docs/agent-customization/prompt-files?referrer=in-product";
        learnMoreLabel = localize("learnMorePrompts", "Learn more about prompt files");
        break;
    }
    this.sectionTitle.textContent = title;
    this.sectionTitleDescriptionText.textContent = description;
    this.sectionLink.textContent = learnMoreLabel;
    this.sectionLink.href = docsUrl;
  }
  /**
   * Updates the add button by building a unified action list.
   * The first action becomes the primary button; the rest go in the dropdown.
   */
  updateAddButton() {
    const actions = this.buildCreateActions();
    const [primary, ...dropdown] = actions;
    const hasDropdown = dropdown.length > 0;
    this.addButton.element.style.display = hasDropdown ? "" : "none";
    this.addButtonSimple.element.style.display = hasDropdown ? "none" : "";
    if (!primary) {
      this.addButtonSimple.element.style.display = "none";
      this.addButton.element.style.display = "none";
      return;
    }
    if (hasDropdown) {
      this.addButton.label = primary.label;
      this.addButton.enabled = primary.enabled;
      this.addButton.primaryButton.setTitle(primary.tooltip ?? "");
      this.addButton.dropdownButton.setTitle("");
    } else {
      this.addButtonSimple.label = primary.label;
      this.addButtonSimple.enabled = primary.enabled;
      this.addButtonSimple.setTitle(primary.tooltip ?? "");
    }
  }
  /**
   * Builds an ordered list of create actions for the current section.
   * The first entry is the primary button; remaining entries are dropdown items.
   */
  buildCreateActions() {
    const typeLabel = this.getTypeLabel();
    const promptType = sectionToPromptType(this.currentSection);
    const descriptor = this.harnessService.getActiveDescriptor();
    const override = descriptor.sectionOverrides?.get(this.currentSection);
    const hasWorkspace = this.hasActiveWorkspace();
    if (override?.commandId) {
      return [{
        label: `$(${Codicon.add.id}) ${override.label}`,
        enabled: true,
        run: () => {
          this.commandService.executeCommand(override.commandId);
        }
      }];
    }
    const menuActions = this.menuService.getMenuActions(
      AICustomizationManagementCreateMenuId,
      this.contextKeyService,
      { shouldForwardArgs: true }
    );
    const extensionCreateActions = [];
    for (const [, group] of menuActions) {
      for (const menuItem of group) {
        if (menuItem instanceof MenuItemAction) {
          const icon = ThemeIcon.isThemeIcon(menuItem.item.icon) ? menuItem.item.icon.id : Codicon.add.id;
          extensionCreateActions.push({
            label: `$(${icon}) ${typeof menuItem.item.title === "string" ? menuItem.item.title : menuItem.item.title.value}`,
            enabled: menuItem.enabled,
            run: () => {
              menuItem.run();
            }
          });
        }
      }
    }
    if (extensionCreateActions.length > 0) {
      return extensionCreateActions;
    }
    const createTypeLabel = override?.typeLabel ?? typeLabel;
    const actions = [];
    const addedTargets = /* @__PURE__ */ new Set();
    if (override?.rootFile && hasWorkspace) {
      actions.push({
        label: `$(${Codicon.add.id}) ${override.label}`,
        enabled: true,
        run: () => {
          this._onDidRequestCreateManual.fire({ type: promptType, target: "workspace-root" });
        }
      });
      addedTargets.add("workspace-root");
    }
    if (promptType === PromptsType.hook) {
      if (!this.workspaceService.isSessionsWindow && !descriptor.hideGenerateButton) {
        actions.push({
          label: `$(${Codicon.sparkle.id}) Generate ${typeLabel}`,
          enabled: true,
          run: () => {
            this._onDidRequestCreate.fire(promptType);
          }
        });
        if (hasWorkspace) {
          actions.push({
            label: `$(${Codicon.add.id}) ${localize("configureHooks", "Configure Hooks")}`,
            enabled: true,
            run: () => {
              this._onDidRequestCreateManual.fire({ type: promptType, target: "local" });
            }
          });
        }
      } else if (!override?.commandId) {
        actions.push({
          label: `$(${Codicon.add.id}) ${localize("configureHooks", "Configure Hooks")}`,
          enabled: hasWorkspace,
          tooltip: hasWorkspace ? void 0 : localize("configureHooksDisabled", "Open a workspace folder to configure hooks."),
          run: () => {
            this._onDidRequestCreateManual.fire({ type: promptType, target: "local" });
          }
        });
      }
      return actions;
    }
    if (!override?.rootFile) {
      if (!this.workspaceService.isSessionsWindow && !descriptor.hideGenerateButton) {
        actions.push({
          label: `$(${Codicon.sparkle.id}) Generate ${typeLabel}`,
          enabled: true,
          run: () => {
            this._onDidRequestCreate.fire(promptType);
          }
        });
      } else if (hasWorkspace) {
        actions.push({
          label: `$(${Codicon.add.id}) New ${createTypeLabel} (Workspace)`,
          enabled: true,
          run: () => {
            this._onDidRequestCreateManual.fire({ type: promptType, target: "local" });
          }
        });
        addedTargets.add("workspace");
      } else {
        actions.push({
          label: `$(${Codicon.add.id}) New ${createTypeLabel} (User)`,
          enabled: true,
          run: () => {
            this._onDidRequestCreateManual.fire({ type: promptType, target: "user" });
          }
        });
        addedTargets.add("user");
      }
    }
    if (hasWorkspace && !addedTargets.has("workspace")) {
      actions.push({
        label: `$(${Codicon.folder.id}) New ${createTypeLabel} (Workspace)`,
        enabled: true,
        run: () => {
          this._onDidRequestCreateManual.fire({ type: promptType, target: "local" });
        }
      });
    }
    if (!addedTargets.has("user")) {
      actions.push({
        label: `$(${Codicon.account.id}) New ${createTypeLabel} (User)`,
        enabled: true,
        run: () => {
          this._onDidRequestCreateManual.fire({ type: promptType, target: "user" });
        }
      });
    }
    if (hasWorkspace && override?.rootFileShortcuts && !addedTargets.has("workspace-root")) {
      for (const fileName of override.rootFileShortcuts) {
        actions.push({
          label: `$(${Codicon.file.id}) New ${fileName}`,
          enabled: true,
          run: () => {
            this._onDidRequestCreateManual.fire({ type: promptType, target: "workspace-root", rootFileName: fileName });
          }
        });
      }
    }
    return actions;
  }
  /**
   * Gets the dropdown actions for the add button (consumed by ButtonWithDropdown).
   * Returns all actions except the primary (first) from buildCreateActions.
   */
  getDropdownActions() {
    this.dropdownActionDisposables.clear();
    const allActions = this.buildCreateActions();
    return allActions.slice(1).map(
      (a, i) => this.dropdownActionDisposables.add(new Action(`create_${i}`, a.label, void 0, a.enabled, () => a.run()))
    );
  }
  /**
   * Checks if there's an active project root (workspace folder or session repository).
   */
  hasActiveWorkspace() {
    return !!this.workspaceService.getActiveProjectRoot();
  }
  /**
   * Executes the primary create action based on context.
   */
  executePrimaryCreateAction() {
    const actions = this.buildCreateActions();
    if (actions.length > 0 && actions[0].enabled) {
      actions[0].run();
    }
  }
  /**
   * Gets the type label for the current section.
   */
  getTypeLabel() {
    switch (this.currentSection) {
      case AICustomizationManagementSection.Agents:
        return localize("agent", "Agent");
      case AICustomizationManagementSection.Skills:
        return localize("skill", "Skill");
      case AICustomizationManagementSection.Instructions:
        return localize("instructions", "Instructions");
      case AICustomizationManagementSection.Hooks:
        return localize("hook", "Hook");
      case AICustomizationManagementSection.Prompts:
      default:
        return localize("prompt", "Prompt");
    }
  }
  /**
   * Announces the current number of items (after search filtering) to
   * screen readers via an aria status message. Called when the section
   * is loaded and after the search filter changes so assistive technology
   * users hear the count, including "no results".
   */
  announceItemCount(count) {
    const isFiltering = this.searchQuery.trim().length > 0;
    aria.status(getCountAnnouncement(this.currentSection, count, isFiltering));
  }
  /**
   * Refreshes the current section's items.
   *
   * Item discovery is owned by `IAICustomizationItemsModel`. This method
   * pulls the current value from the model and re-renders. Callers do not
   * need to invoke this in response to data change events — the per-section
   * autorun bound in `setSection` already does that.
   */
  refresh() {
    if (this._store.isDisposed) {
      return;
    }
    this.applyItemsFromModel();
    this.updateAddButton();
  }
  applyItemsFromModel() {
    const section = toItemsModelSection(this.currentSection);
    this.allItems = section ? this.itemsModel.getItems(section).get() : [];
    this.filterItems();
    this._onDidChangeItemCount.fire(this.allItems.length);
  }
  /**
   * Computes the item count for a given section without updating the display.
   * Reads from the items model so the count is consistent with what the
   * editor and sidebar render. Returns 0 for sections not modeled here
   * (McpServers / Plugins / Models — those have their own services).
   */
  computeItemCountForSection(section) {
    const modelSection = toItemsModelSection(section);
    return modelSection ? this.itemsModel.getCount(modelSection).get() : 0;
  }
  /**
   * Filters items based on the current search query and builds grouped display entries.
   */
  /**
   * Applies the search query to items, returning matched items with highlight info.
   */
  applySearchFilter(items) {
    if (!this.searchQuery.trim()) {
      return items.map((item) => ({ ...item, nameMatches: void 0, descriptionMatches: void 0 }));
    }
    const query = this.searchQuery.toLowerCase();
    const matched = [];
    for (const item of items) {
      const displayName = item.displayName ?? formatDisplayName(item.name);
      const nameMatches = matchesContiguousSubString(query, displayName);
      const descriptionMatches = item.description ? matchesContiguousSubString(query, item.description) : null;
      const filenameMatches = matchesContiguousSubString(query, item.filename);
      const badgeMatches = item.badge ? matchesContiguousSubString(query, item.badge) : null;
      if (nameMatches || descriptionMatches || filenameMatches || badgeMatches) {
        matched.push({
          ...item,
          nameMatches: nameMatches || void 0,
          descriptionMatches: descriptionMatches || void 0
        });
      }
    }
    return matched;
  }
  /**
   * Builds grouped display entries from items assigned to groups.
   * Empty groups are omitted. Collapsed groups show only their header.
   */
  buildGroupedEntries(groups) {
    for (const group of groups) {
      group.items.sort((a, b) => a.name.localeCompare(b.name));
    }
    this.displayEntries = [];
    let isFirstGroup = true;
    for (const group of groups) {
      if (group.items.length === 0) {
        continue;
      }
      const collapsed = this.collapsedGroups.has(group.groupKey);
      this.displayEntries.push({
        type: "group-header",
        id: `group-${group.groupKey}`,
        groupKey: group.groupKey,
        label: group.label,
        icon: group.icon,
        count: group.items.length,
        isFirst: isFirstGroup,
        description: group.description,
        collapsed
      });
      isFirstGroup = false;
      if (!collapsed) {
        for (const item of group.items) {
          this.displayEntries.push({ type: "file-item", item });
        }
      }
    }
  }
  /**
   * Commits the current displayEntries to the list and updates empty state.
   */
  commitDisplayEntries() {
    this.list.splice(0, this.list.length, this.displayEntries);
    this.updateEmptyState();
  }
  /**
   * Groups normalized list items for display.
   * Groups items by normalized storage/groupKey.
   */
  groupMatchedItems(matchedItems) {
    const groups = this.currentSection === AICustomizationManagementSection.Instructions ? [
      { groupKey: "agent-instructions", label: localize("agentInstructionsGroup", "Agent Instructions"), icon: instructionsIcon, description: localize("agentInstructionsGroupDescription", "Instruction files automatically loaded for all agent interactions (e.g. AGENTS.md, CLAUDE.md, copilot-instructions.md)."), items: [] },
      { groupKey: "context-instructions", label: localize("contextInstructionsGroup", "Included Based on Context"), icon: instructionsIcon, description: localize("contextInstructionsGroupDescription", "Instructions automatically loaded when matching files are part of the context."), items: [] },
      { groupKey: "on-demand-instructions", label: localize("onDemandInstructionsGroup", "Loaded on Demand"), icon: instructionsIcon, description: localize("onDemandInstructionsGroupDescription", "Instructions loaded only when explicitly referenced."), items: [] },
      { groupKey: PromptsStorage.local, label: localize("workspaceGroup", "Workspace"), icon: workspaceIcon, description: localize("workspaceGroupDescription", "Customizations stored as files in your project folder and shared with your team via version control."), items: [] },
      { groupKey: PromptsStorage.user, label: localize("userGroup", "User"), icon: userIcon, description: localize("userGroupDescription", "Customizations stored locally on your machine in a central location. Private to you and available across all projects."), items: [] },
      { groupKey: PromptsStorage.plugin, label: localize("pluginGroup", "Plugins"), icon: pluginIcon, description: localize("pluginGroupDescription", "Read-only customizations provided by installed plugins."), items: [] },
      { groupKey: PromptsStorage.builtIn, label: localize("builtinGroup", "Built-in"), icon: builtinIcon, description: localize("builtinGroupDescription", "Built-in customizations shipped with the application."), items: [] }
    ] : [
      { groupKey: PromptsStorage.local, label: localize("workspaceGroup", "Workspace"), icon: workspaceIcon, description: localize("workspaceGroupDescription", "Customizations stored as files in your project folder and shared with your team via version control."), items: [] },
      { groupKey: PromptsStorage.user, label: localize("userGroup", "User"), icon: userIcon, description: localize("userGroupDescription", "Customizations stored locally on your machine in a central location. Private to you and available across all projects."), items: [] },
      { groupKey: PromptsStorage.plugin, label: localize("pluginGroup", "Plugins"), icon: pluginIcon, description: localize("pluginGroupDescription", "Read-only customizations provided by installed plugins."), items: [] },
      { groupKey: PromptsStorage.extension, label: localize("extensionGroup", "Extensions"), icon: extensionIcon, description: localize("extensionGroupDescription", "Read-only customizations provided by installed extensions."), items: [] },
      { groupKey: PromptsStorage.builtIn, label: localize("builtinGroup", "Built-in"), icon: builtinIcon, description: localize("builtinGroupDescription", "Built-in customizations shipped with the application."), items: [] }
    ];
    for (const item of matchedItems) {
      const key = item.groupKey ?? item.source ?? AICustomizationSources.local;
      let group = groups.find((g) => g.groupKey === key);
      if (!group) {
        let label;
        switch (key) {
          case "remote-host":
            label = localize("remoteHostGroupShort", "Remote");
            break;
          case "remote-client":
            label = localize("remoteClientGroupShort", "Local");
            break;
          default:
            label = formatDisplayName(key);
        }
        group = { groupKey: key, label, icon: Codicon.folder, description: "", items: [] };
        const builtinIdx = groups.findIndex((g) => g.groupKey === PromptsStorage.builtIn);
        if (builtinIdx >= 0) {
          groups.splice(builtinIdx, 0, group);
        } else {
          groups.push(group);
        }
      }
      group.items.push(item);
    }
    this.buildGroupedEntries(groups);
    this.commitDisplayEntries();
  }
  /**
   * Filters items based on the current search query and builds grouped display entries.
   */
  filterItems() {
    const matchedItems = this.applySearchFilter(this.allItems);
    this.groupMatchedItems(matchedItems);
    return matchedItems.length;
  }
  /**
   * Toggles the collapsed state of a group.
   */
  toggleGroup(entry) {
    if (this.collapsedGroups.has(entry.groupKey)) {
      this.collapsedGroups.delete(entry.groupKey);
    } else {
      this.collapsedGroups.add(entry.groupKey);
    }
    this.filterItems();
  }
  updateEmptyState() {
    const hasItems = this.displayEntries.length > 0;
    if (!hasItems) {
      this.emptyStateContainer.style.display = "flex";
      this.listContainer.style.display = "none";
      if (this.searchQuery.trim()) {
        this.emptyStateText.textContent = localize("noMatchingItems", "No items match '{0}'", this.searchQuery);
        this.emptyStateSubtext.textContent = localize("tryDifferentSearch", "Try a different search term");
      } else {
        const emptyInfo = this.getEmptyStateInfo();
        this.emptyStateText.textContent = emptyInfo.title;
        this.emptyStateSubtext.textContent = emptyInfo.description;
      }
    } else {
      this.emptyStateContainer.style.display = "none";
      this.listContainer.style.display = "";
    }
  }
  getEmptyStateInfo() {
    switch (this.currentSection) {
      case AICustomizationManagementSection.Agents:
        return {
          title: localize("noAgents", "No agents yet"),
          description: localize("createFirstAgent", "Create your first custom agent to get started")
        };
      case AICustomizationManagementSection.Skills:
        return {
          title: localize("noSkills", "No skills yet"),
          description: localize("createFirstSkill", "Create your first skill to extend agent capabilities")
        };
      case AICustomizationManagementSection.Instructions:
        return {
          title: localize("noInstructions", "No instructions yet"),
          description: localize("createFirstInstructions", "Add instructions to teach Copilot about your codebase")
        };
      case AICustomizationManagementSection.Hooks:
        return {
          title: localize("noHooks", "No hooks yet"),
          description: localize("createFirstHook", "Create hooks to execute commands at agent lifecycle events")
        };
      case AICustomizationManagementSection.Prompts:
      default:
        return {
          title: localize("noPrompts", "No prompts yet"),
          description: localize("createFirstPrompt", "Create reusable prompts for common tasks")
        };
    }
  }
  /**
   * Sets the search query programmatically.
   */
  setSearchQuery(query) {
    this.searchInput.value = query;
  }
  /**
   * Clears the search query.
   */
  clearSearch() {
    this.searchInput.value = "";
  }
  /**
   * Focuses the search input.
   */
  focusSearch() {
    this.searchInput.focus();
  }
  /**
   * Focuses the list.
   */
  focusList() {
    this.list.domFocus();
    if (this.displayEntries.length > 0) {
      this.list.setFocus([0]);
    }
  }
  /**
   * Scrolls the list so the last item is visible.
   */
  revealLastItem() {
    if (this.displayEntries.length > 0) {
      this.list.reveal(this.displayEntries.length - 1);
    }
  }
  /**
   * Reveals and selects the first list item whose URI matches one of the provided URIs.
   */
  revealAndSelectFirstItemByUri(uris) {
    const entryIndex = this.displayEntries.findIndex((entry) => {
      return entry.type === "file-item" && uris.some((uri) => isEqual(entry.item.uri, uri));
    });
    if (entryIndex < 0) {
      return false;
    }
    this.list.reveal(entryIndex);
    this.list.setFocus([entryIndex]);
    this.list.setSelection([entryIndex]);
    this.list.domFocus();
    return true;
  }
  /**
   * Layouts the widget.
   */
  layout(height, width) {
    this.lastLayoutHeight = height;
    this.lastLayoutWidth = width;
    this.element.style.height = "";
    this.searchInput.layout();
    const searchBarHeight = this.searchAndButtonContainer.offsetHeight;
    if (searchBarHeight === 0 && !this._layoutDeferred) {
      this._layoutDeferred = true;
      DOM.getWindow(this.element).requestAnimationFrame(() => {
        try {
          this.layout(height, width);
        } finally {
          this._layoutDeferred = false;
        }
      });
      return;
    }
    const headerHeight = this.sectionTitleHeader.offsetHeight;
    this.lastHeaderHeight = headerHeight;
    const availableHeight = this.element.clientHeight || height;
    const listHeight = Math.max(0, availableHeight - searchBarHeight - headerHeight);
    this.listContainer.style.height = `${listHeight}px`;
    this.list.layout(listHeight, width);
  }
  /**
   * Gets the total item count (before filtering).
   */
  get itemCount() {
    return this.allItems.length;
  }
  /**
   * Generates a debug report for the current section.
   */
  async generateDebugReport() {
    if (this._store.isDisposed) {
      return "";
    }
    return generateCustomizationDebugReport(
      this.currentSection,
      this.promptsService,
      this.workspaceService,
      { allItems: this.allItems, displayEntries: this.displayEntries },
      this.itemsModel.getActiveItemSource(),
      this.harnessService,
      this.agentPluginService
    );
  }
};
AICustomizationListWidget = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IPromptsService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IMenuService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IAICustomizationWorkspaceService),
  __decorateParam(9, IClipboardService),
  __decorateParam(10, IHoverService),
  __decorateParam(11, IFileService),
  __decorateParam(12, ITelemetryService),
  __decorateParam(13, ICustomizationHarnessService),
  __decorateParam(14, ICommandService),
  __decorateParam(15, IAICustomizationItemsModel),
  __decorateParam(16, IAgentPluginService)
], AICustomizationListWidget);
export {
  AICustomizationListWidget,
  formatDisplayName,
  getCountAnnouncement,
  truncateToFirstLine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGF1dG9ydW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlLCBJTGlzdFJlbmRlcmVyLCBJTGlzdENvbnRleHRNZW51RXZlbnQsIE5vdFNlbGVjdGFibGVHcm91cElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBhZ2VudEljb24sIGluc3RydWN0aW9uc0ljb24sIHByb21wdEljb24sIHNraWxsSWNvbiwgaG9va0ljb24sIHVzZXJJY29uLCB3b3Jrc3BhY2VJY29uLCBleHRlbnNpb25JY29uLCBwbHVnaW5JY29uLCBidWlsdGluSWNvbiB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSWNvbnMuanMnO1xuaW1wb3J0IHsgQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1NUT1JBR0VfS0VZLCBBSV9DVVNUT01JWkFUSU9OX0lURU1fVFlQRV9LRVksIEFJX0NVU1RPTUlaQVRJT05fSVRFTV9VUklfS0VZLCBBSV9DVVNUT01JWkFUSU9OX0lURU1fUExVR0lOX1VSSV9LRVksIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRJdGVtTWVudUlkLCBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q3JlYXRlTWVudUlkLCBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgQUlfQ1VTVE9NSVpBVElPTl9JVEVNX0RJU0FCTEVEX0tFWSwgc2VjdGlvblRvUHJvbXB0VHlwZSB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsdWdpbnMvYWdlbnRQbHVnaW5TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMsIGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcsIElNYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIEJ1dHRvbldpdGhEcm9wZG93biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSwgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0sIGdldENvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvblNvdXJjZXMsIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUN1c3RvbWl6YXRpb25EZWJ1Z1JlcG9ydCB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uRGVidWdQYW5lbC5qcyc7XG5pbXBvcnQgeyBnZXRDdXN0b21pemF0aW9uU2Vjb25kYXJ5VGV4dCB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldFV0aWxzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbSB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uSXRlbVNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCwgSXRlbXNNb2RlbFNlY3Rpb24gfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwuanMnO1xuXG5leHBvcnQgeyB0cnVuY2F0ZVRvRmlyc3RMaW5lIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0VXRpbHMuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbi8vI3JlZ2lvbiBUZWxlbWV0cnlcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yU2VhcmNoRXZlbnQgPSB7XG5cdHNlY3Rpb246IHN0cmluZztcblx0cmVzdWx0Q291bnQ6IG51bWJlcjtcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvclNlYXJjaENsYXNzaWZpY2F0aW9uID0ge1xuXHRzZWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGl2ZSBzZWN0aW9uIHdoZW4gdGhlIHNlYXJjaCB3YXMgcGVyZm9ybWVkLicgfTtcblx0cmVzdWx0Q291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGl0ZW1zIG1hdGNoaW5nIHRoZSBzZWFyY2ggcXVlcnkuJyB9O1xuXHRvd25lcjogJ2pvc2hzcGljZXInO1xuXHRjb21tZW50OiAnVHJhY2tzIHNlYXJjaCB1c2FnZSBpbiB0aGUgQWdlbnQgQ3VzdG9taXphdGlvbnMgZWRpdG9yLic7XG59O1xuXG4vLyNlbmRyZWdpb25cblxuY29uc3QgSVRFTV9IRUlHSFQgPSA0NDtcbmNvbnN0IEdST1VQX0hFQURFUl9IRUlHSFQgPSAzNjtcbmNvbnN0IEdST1VQX0hFQURFUl9IRUlHSFRfV0lUSF9TRVBBUkFUT1IgPSA0MDtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgY29sbGFwc2libGUgZ3JvdXAgaGVhZGVyIGluIHRoZSBsaXN0LlxuICovXG5pbnRlcmZhY2UgSUdyb3VwSGVhZGVyRW50cnkge1xuXHRyZWFkb25seSB0eXBlOiAnZ3JvdXAtaGVhZGVyJztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgZ3JvdXBLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBjb3VudDogbnVtYmVyO1xuXHRyZWFkb25seSBpc0ZpcnN0OiBib29sZWFuO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRjb2xsYXBzZWQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhbiBpbmRpdmlkdWFsIGZpbGUgaXRlbSBpbiB0aGUgbGlzdC5cbiAqL1xuaW50ZXJmYWNlIElGaWxlSXRlbUVudHJ5IHtcblx0cmVhZG9ubHkgdHlwZTogJ2ZpbGUtaXRlbSc7XG5cdHJlYWRvbmx5IGl0ZW06IElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbTtcbn1cblxudHlwZSBJTGlzdEVudHJ5ID0gSUdyb3VwSGVhZGVyRW50cnkgfCBJRmlsZUl0ZW1FbnRyeTtcblxuLyoqXG4gKiBEZWxlZ2F0ZSBmb3IgdGhlIEFJIEN1c3RvbWl6YXRpb24gbGlzdC5cbiAqL1xuY2xhc3MgQUlDdXN0b21pemF0aW9uTGlzdERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SUxpc3RFbnRyeT4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSUxpc3RFbnRyeSk6IG51bWJlciB7XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdHJldHVybiBlbGVtZW50LmlzRmlyc3QgPyBHUk9VUF9IRUFERVJfSEVJR0hUIDogR1JPVVBfSEVBREVSX0hFSUdIVF9XSVRIX1NFUEFSQVRPUjtcblx0XHR9XG5cdFx0cmV0dXJuIElURU1fSEVJR0hUO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJTGlzdEVudHJ5KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZWxlbWVudC50eXBlID09PSAnZ3JvdXAtaGVhZGVyJyA/ICdncm91cEhlYWRlcicgOiAnYWlDdXN0b21pemF0aW9uSXRlbSc7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElBSUN1c3RvbWl6YXRpb25JdGVtVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYWN0aW9uc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGFjdGlvbkJhcjogQWN0aW9uQmFyO1xuXHRyZWFkb25seSB0eXBlSWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5hbWVMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0cmVhZG9ubHkgYmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBzdGF0dXNJY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IEhpZ2hsaWdodGVkTGFiZWw7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHQvKiogSW5kZXggb2YgdGhlIHJvdyBjdXJyZW50bHkgcmVuZGVyZWQgaW50byB0aGlzIHRlbXBsYXRlLCBvciAtMSB3aGVuIHVuYm91bmQuICovXG5cdGN1cnJlbnRJbmRleDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUdyb3VwSGVhZGVyVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hldnJvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvdW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaW5mb0ljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuLyoqXG4gKiBSZW5kZXJlciBmb3IgY29sbGFwc2libGUgZ3JvdXAgaGVhZGVycyAoV29ya3NwYWNlLCBVc2VyLCBFeHRlbnNpb25zKS5cbiAqIE5vdGU6IENsaWNrIGhhbmRsaW5nIGlzIGRvbmUgdmlhIHRoZSBsaXN0J3Mgb25EaWRPcGVuIGV2ZW50LCBub3QgaGVyZS5cbiAqL1xuY2xhc3MgR3JvdXBIZWFkZXJSZW5kZXJlciBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUdyb3VwSGVhZGVyRW50cnksIElHcm91cEhlYWRlclRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2dyb3VwSGVhZGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUdyb3VwSGVhZGVyVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2FpLWN1c3RvbWl6YXRpb24tZ3JvdXAtaGVhZGVyJyk7XG5cblx0XHRjb25zdCBjaGV2cm9uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5ncm91cC1jaGV2cm9uJykpO1xuXHRcdGNvbnN0IGljb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmdyb3VwLWljb24nKSk7XG5cdFx0Y29uc3QgbGFiZWxHcm91cCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuZ3JvdXAtbGFiZWwtZ3JvdXAnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBET00uYXBwZW5kKGxhYmVsR3JvdXAsICQoJy5ncm91cC1sYWJlbCcpKTtcblx0XHRjb25zdCBjb3VudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuZ3JvdXAtY291bnQnKSk7XG5cdFx0Y29uc3QgaW5mb0ljb24gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmdyb3VwLWluZm8nKSk7XG5cdFx0aW5mb0ljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmluZm8pKTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgY2hldnJvbiwgaWNvbiwgbGFiZWwsIGNvdW50LCBpbmZvSWNvbiwgZGlzcG9zYWJsZXMsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJR3JvdXBIZWFkZXJFbnRyeSwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUdyb3VwSGVhZGVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gQ2hldnJvblxuXHRcdHRlbXBsYXRlRGF0YS5jaGV2cm9uLmNsYXNzTmFtZSA9ICdncm91cC1jaGV2cm9uJztcblx0XHR0ZW1wbGF0ZURhdGEuY2hldnJvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGVsZW1lbnQuY29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cblx0XHQvLyBJY29uXG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ2dyb3VwLWljb24nO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoZWxlbWVudC5pY29uKSk7XG5cblx0XHQvLyBMYWJlbCArIGNvdW50XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gZWxlbWVudC5sYWJlbDtcblx0XHR0ZW1wbGF0ZURhdGEuY291bnQudGV4dENvbnRlbnQgPSBgJHtlbGVtZW50LmNvdW50fWA7XG5cblx0XHQvLyBJbmZvIGljb24gaG92ZXJcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZURhdGEuaW5mb0ljb24sICgpID0+ICh7XG5cdFx0XHRjb250ZW50OiBlbGVtZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRjb21wYWN0OiB0cnVlLFxuXHRcdFx0XHRza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlLFxuXHRcdFx0fVxuXHRcdH0pKSk7XG5cblx0XHQvLyBDb2xsYXBzZWQgc3RhdGUgYW5kIHNlcGFyYXRvciBmb3Igbm9uLWZpcnN0IGdyb3Vwc1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgZWxlbWVudC5jb2xsYXBzZWQpO1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLXByZXZpb3VzLWdyb3VwJywgIWVsZW1lbnQuaXNGaXJzdCk7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJR3JvdXBIZWFkZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaWNvbiBmb3IgYSBnaXZlbiBwcm9tcHQgdHlwZS5cbiAqL1xuZnVuY3Rpb24gcHJvbXB0VHlwZVRvSWNvbih0eXBlOiBQcm9tcHRzVHlwZSk6IFRoZW1lSWNvbiB7XG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6IHJldHVybiBhZ2VudEljb247XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDogcmV0dXJuIHNraWxsSWNvbjtcblx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczogcmV0dXJuIGluc3RydWN0aW9uc0ljb247XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6IHJldHVybiBwcm9tcHRJY29uO1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazogcmV0dXJuIGhvb2tJY29uO1xuXHRcdGRlZmF1bHQ6IHJldHVybiBwcm9tcHRJY29uO1xuXHR9XG59XG5cbi8qKlxuICogRm9ybWF0cyBhIG5hbWUgZm9yIGRpc3BsYXkgYnkgc3RyaXBwaW5nIGEgdHJhaWxpbmcgLm1kIGV4dGVuc2lvbi5cbiAqIE5hbWVzIGZyb20gZnJvbnRtYXR0ZXIgaGVhZGVycyBhcmUgc2hvd24gYXMtaXMgdG8gc3RheSBjb25zaXN0ZW50XG4gKiB3aXRoIGhvdyB0aGV5IGFwcGVhciBpbiBhZ2VudCBkcm9wZG93bnMgYW5kIGVycm9yIG1lc3NhZ2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0RGlzcGxheU5hbWUobmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIG5hbWUucmVwbGFjZSgvXFwubWQkL2ksICcnKTtcbn1cblxuLyoqXG4gKiBSZW5kZXJlciBmb3IgQUkgY3VzdG9taXphdGlvbiBsaXN0IGl0ZW1zLlxuICovXG5jbGFzcyBBSUN1c3RvbWl6YXRpb25JdGVtUmVuZGVyZXIgaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElGaWxlSXRlbUVudHJ5LCBJQUlDdXN0b21pemF0aW9uSXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2FpQ3VzdG9taXphdGlvbkl0ZW0nO1xuXG5cdC8qKlxuXHQgKiBMaXZlIChub24tZGlzcG9zZWQpIHRlbXBsYXRlcy4gVXNlZCB0byBrZWVwIG9ubHkgdGhlIGZvY3VzZWQgcm93J3Ncblx0ICogaW5saW5lIGFjdGlvbiBiYXIgaW4gdGhlIGRvY3VtZW50IHRhYiBvcmRlciBzbyB0aGF0IFRhYiBmcm9tIGEgZm9jdXNlZFxuXHQgKiByb3cgZW50ZXJzIHRoYXQgcm93J3MgYWN0aW9ucyBleGFjdGx5IG9uY2UgaW5zdGVhZCBvZiBjeWNsaW5nIHRocm91Z2hcblx0ICogZXZlcnkgcm93J3MgYWN0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgdGVtcGxhdGVzID0gbmV3IFNldDxJQUlDdXN0b21pemF0aW9uSXRlbVRlbXBsYXRlRGF0YT4oKTtcblx0cHJpdmF0ZSBmb2N1c2VkSW5kZXggPSAtMTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0KSB7IH1cblxuXHQvKipcblx0ICogVGVsbCB0aGUgcmVuZGVyZXIgd2hpY2ggcm93IGluZGV4IGlzIGN1cnJlbnRseSBmb2N1c2VkIGluIHRoZSBsaXN0LlxuXHQgKiBUaGUgYWN0aW9uIGJhciBvZiB0aGF0IHJvdyAoYW5kIG9ubHkgdGhhdCByb3cpIGlzIG1hZGUgdGFiLWZvY3VzYWJsZS5cblx0ICogUGFzcyAtMSB0byBjbGVhciBmb2N1czsgaW4gdGhhdCBjYXNlIGFsbCBhY3Rpb24gYmFycyBhcmUgbWFkZSBub24tZm9jdXNhYmxlLlxuXHQgKi9cblx0c2V0Rm9jdXNlZEluZGV4KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmZvY3VzZWRJbmRleCA9IGluZGV4O1xuXHRcdGZvciAoY29uc3QgdGVtcGxhdGUgb2YgdGhpcy50ZW1wbGF0ZXMpIHtcblx0XHRcdC8vIEd1YXJkIGFnYWluc3QgdGhlIC0xID09PSAtMSBjYXNlIHdoZXJlIHVuYm91bmQvcmVjeWNsZWQgdGVtcGxhdGVzXG5cdFx0XHQvLyAod2hvc2UgY3VycmVudEluZGV4IHdhcyByZXNldCBieSBkaXNwb3NlRWxlbWVudCkgd291bGQgb3RoZXJ3aXNlIGJlXG5cdFx0XHQvLyBtYWRlIHRhYi1mb2N1c2FibGUgd2hlbiBubyByb3cgaGFzIGZvY3VzLlxuXHRcdFx0dGVtcGxhdGUuYWN0aW9uQmFyLnNldEZvY3VzYWJsZShpbmRleCAhPT0gLTEgJiYgdGVtcGxhdGUuY3VycmVudEluZGV4ID09PSBpbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElBSUN1c3RvbWl6YXRpb25JdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWktY3VzdG9taXphdGlvbi1saXN0LWl0ZW0nKTtcblxuXHRcdGNvbnN0IGxlZnRTZWN0aW9uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5pdGVtLWxlZnQnKSk7XG5cdFx0Y29uc3QgdHlwZUljb24gPSBET00uYXBwZW5kKGxlZnRTZWN0aW9uLCAkKCcuaXRlbS10eXBlLWljb24nKSk7XG5cdFx0Y29uc3QgdGV4dENvbnRhaW5lciA9IERPTS5hcHBlbmQobGVmdFNlY3Rpb24sICQoJy5pdGVtLXRleHQnKSk7XG5cdFx0Y29uc3QgbmFtZVJvdyA9IERPTS5hcHBlbmQodGV4dENvbnRhaW5lciwgJCgnLml0ZW0tbmFtZS1yb3cnKSk7XG5cdFx0Y29uc3QgbmFtZUxhYmVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBIaWdobGlnaHRlZExhYmVsKERPTS5hcHBlbmQobmFtZVJvdywgJCgnLml0ZW0tbmFtZScpKSkpO1xuXHRcdGNvbnN0IGJhZGdlID0gRE9NLmFwcGVuZChuYW1lUm93LCAkKCcuaW5saW5lLWJhZGdlLml0ZW0tYmFkZ2UnKSk7XG5cdFx0Y29uc3Qgc3RhdHVzSWNvbiA9IERPTS5hcHBlbmQobmFtZVJvdywgJCgnLml0ZW0tc3RhdHVzLWljb24nKSk7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEhpZ2hsaWdodGVkTGFiZWwoRE9NLmFwcGVuZCh0ZXh0Q29udGFpbmVyLCAkKCcuaXRlbS1kZXNjcmlwdGlvbicpKSkpO1xuXG5cdFx0Ly8gUmlnaHQgc2VjdGlvbiBmb3IgYWN0aW9ucyAoaG92ZXItdmlzaWJsZSlcblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5pdGVtLXJpZ2h0JykpO1xuXHRcdGNvbnN0IGFjdGlvbkJhciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uQmFyKGFjdGlvbnNDb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGNyZWF0ZUFjdGlvblZpZXdJdGVtLmJpbmQodW5kZWZpbmVkLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSxcblx0XHR9KSk7XG5cdFx0Ly8gS2VlcCB0aGUgaW5saW5lIGFjdGlvbnMgb3V0IG9mIHRoZSBkb2N1bWVudCB0YWIgb3JkZXIgYnkgZGVmYXVsdC4gT25seSB0aGVcblx0XHQvLyBmb2N1c2VkIHJvdydzIGFjdGlvbiBiYXIgaXMgbWFkZSB0YWItZm9jdXNhYmxlIChzZWUgYHNldEZvY3VzZWRJbmRleGApLFxuXHRcdC8vIHNvIFRhYiBmcm9tIGEgZm9jdXNlZCByb3cgZW50ZXJzIHRoYXQgcm93J3MgYWN0aW9ucyBleGFjdGx5IG9uY2UgaW5zdGVhZFxuXHRcdC8vIG9mIGN5Y2xpbmcgdGhyb3VnaCBldmVyeSByb3cncyBhY3Rpb25zLlxuXHRcdGFjdGlvbkJhci5zZXRGb2N1c2FibGUoZmFsc2UpO1xuXG5cdFx0Y29uc3QgdGVtcGxhdGU6IElBSUN1c3RvbWl6YXRpb25JdGVtVGVtcGxhdGVEYXRhID0ge1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0YWN0aW9uc0NvbnRhaW5lcixcblx0XHRcdGFjdGlvbkJhcixcblx0XHRcdHR5cGVJY29uLFxuXHRcdFx0bmFtZUxhYmVsLFxuXHRcdFx0YmFkZ2UsXG5cdFx0XHRzdGF0dXNJY29uLFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdGVsZW1lbnREaXNwb3NhYmxlcyxcblx0XHRcdGN1cnJlbnRJbmRleDogLTEsXG5cdFx0fTtcblx0XHR0aGlzLnRlbXBsYXRlcy5hZGQodGVtcGxhdGUpO1xuXHRcdHJldHVybiB0ZW1wbGF0ZTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZW50cnk6IElGaWxlSXRlbUVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElBSUN1c3RvbWl6YXRpb25JdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRlbXBsYXRlRGF0YS5jdXJyZW50SW5kZXggPSBpbmRleDtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnNldEZvY3VzYWJsZSh0aGlzLmZvY3VzZWRJbmRleCAhPT0gLTEgJiYgaW5kZXggPT09IHRoaXMuZm9jdXNlZEluZGV4KTtcblx0XHRjb25zdCBlbGVtZW50ID0gZW50cnkuaXRlbTtcblxuXHRcdC8vIFR5cGUgaWNvbjogdXNlIHBlci1pdGVtIG92ZXJyaWRlIG9yIGZhbGwgYmFjayB0byBwcm9tcHQgdHlwZVxuXHRcdHRlbXBsYXRlRGF0YS50eXBlSWNvbi5jbGFzc05hbWUgPSAnaXRlbS10eXBlLWljb24nO1xuXHRcdHRlbXBsYXRlRGF0YS50eXBlSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGVsZW1lbnQudHlwZUljb24gPz8gcHJvbXB0VHlwZVRvSWNvbihlbGVtZW50LnByb21wdFR5cGUpKSk7XG5cblx0XHQvLyBIb3ZlciB0b29sdGlwOiBuYW1lICsgc291cmNlICsgYmFkZ2UgY29udGV4dCArIHBsdWdpbiBzb3VyY2Vcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0ZW1wbGF0ZURhdGEuY29udGFpbmVyLCAoKSA9PiB7XG5cdFx0XHRsZXQgY29udGVudDogc3RyaW5nO1xuXHRcdFx0aWYgKGVsZW1lbnQuaXNCdWlsdGluKSB7XG5cdFx0XHRcdGNvbnRlbnQgPSBgJHtlbGVtZW50Lm5hbWV9XFxuJHtsb2NhbGl6ZSgnYnVpbHRpblNvdXJjZScsIFwiQnVpbHQtaW5cIil9YDtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5leHRlbnNpb25JZCkge1xuXHRcdFx0XHRjb250ZW50ID0gYCR7ZWxlbWVudC5uYW1lfVxcbiR7bG9jYWxpemUoJ2Zyb21FeHRlbnNpb24nLCBcIkV4dGVuc2lvbjogezB9XCIsIGVsZW1lbnQuZXh0ZW5zaW9uSWQpfWA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBpc1dvcmtzcGFjZUl0ZW0gPSBlbGVtZW50LnNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbDtcblx0XHRcdFx0Y29uc3QgdXJpTGFiZWwgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlbGVtZW50LnVyaSwgeyByZWxhdGl2ZTogaXNXb3Jrc3BhY2VJdGVtIH0pO1xuXHRcdFx0XHRjb250ZW50ID0gYCR7ZWxlbWVudC5uYW1lfVxcbiR7dXJpTGFiZWx9YDtcblx0XHRcdH1cblx0XHRcdGlmIChlbGVtZW50LmJhZGdlVG9vbHRpcCkge1xuXHRcdFx0XHRjb250ZW50ICs9IGBcXG5cXG4ke2VsZW1lbnQuYmFkZ2VUb29sdGlwfWA7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwbHVnaW4gPSBlbGVtZW50LnBsdWdpblVyaSAmJiB0aGlzLmFnZW50UGx1Z2luU2VydmljZS5wbHVnaW5zLmdldCgpLmZpbmQocCA9PiBpc0VxdWFsKHAudXJpLCBlbGVtZW50LnBsdWdpblVyaSkpO1xuXHRcdFx0aWYgKHBsdWdpbikge1xuXHRcdFx0XHRjb250ZW50ICs9IGBcXG4ke2xvY2FsaXplKCdmcm9tUGx1Z2luJywgXCJQbHVnaW46IHswfVwiLCBwbHVnaW4ubGFiZWwpfWA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdFx0XHRza2lwRmFkZUluQW5pbWF0aW9uOiB0cnVlLFxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pKTtcblxuXHRcdC8vIEFwcGx5IGRpc2FibGVkIHN0eWxpbmdcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgZWxlbWVudC5kaXNhYmxlZCk7XG5cblx0XHQvLyBOYW1lIHdpdGggaGlnaGxpZ2h0cyBcdTIwMTQgbmFtZU1hdGNoZXMgYXJlIHByZS1jb21wdXRlZCBhZ2FpbnN0IHRoZSBmb3JtYXR0ZWQgZGlzcGxheSBuYW1lXG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBlbGVtZW50LmRpc3BsYXlOYW1lID8/IGZvcm1hdERpc3BsYXlOYW1lKGVsZW1lbnQubmFtZSk7XG5cdFx0dGVtcGxhdGVEYXRhLm5hbWVMYWJlbC5zZXQoZGlzcGxheU5hbWUsIGVsZW1lbnQubmFtZU1hdGNoZXMpO1xuXG5cdFx0Ly8gT3B0aW9uYWwgaW5saW5lIGJhZGdlIChlLmcuIFwiYWx3YXlzIGFkZGVkXCIsIFwiKi50c1wiKVxuXHRcdGlmIChlbGVtZW50LmJhZGdlKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2UudGV4dENvbnRlbnQgPSBlbGVtZW50LmJhZGdlO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdGlmIChlbGVtZW50LmJhZGdlVG9vbHRpcCkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3Zlcihcblx0XHRcdFx0XHRnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSxcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2UsXG5cdFx0XHRcdFx0ZWxlbWVudC5iYWRnZVRvb2x0aXAsXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFkZ2UudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS5iYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIFN0YXR1cyBpY29uIGZvciBleHRlcm5hbCBpdGVtcyB3aXRoIHN5bmMvbG9hZGluZyBzdGF0dXNcblx0XHRpZiAoZWxlbWVudC5zdGF0dXMpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLmNsYXNzTmFtZSA9ICdpdGVtLXN0YXR1cy1pY29uJztcblx0XHRcdHN3aXRjaCAoZWxlbWVudC5zdGF0dXMpIHtcblx0XHRcdFx0Y2FzZSAnbG9hZGluZyc6XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0ljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmxvYWRpbmcpLCAnY29kaWNvbi1tb2RpZmllci1zcGluJyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2xvYWRlZCc6XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0ljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZWNrKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2RlZ3JhZGVkJzpcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ud2FybmluZykpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdlcnJvcic6XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLnN0YXR1c0ljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmVycm9yKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZWxlbWVudC5zdGF0dXNNZXNzYWdlKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKFxuXHRcdFx0XHRcdGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLFxuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLFxuXHRcdFx0XHRcdGVsZW1lbnQuc3RhdHVzTWVzc2FnZSxcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5zdGF0dXNJY29uLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuc3RhdHVzSWNvbi5jbGFzc05hbWUgPSAnaXRlbS1zdGF0dXMtaWNvbic7XG5cdFx0fVxuXG5cdFx0Ly8gSG9va3Mgc2hvdyBzaGVsbCBjb21tYW5kcyBoZXJlLCBzbyBrZWVwIHRoZSBmdWxsIHRleHQgaW5zdGVhZCBvZiB0cnVuY2F0aW5nIHRvIHRoZSBmaXJzdCBzZW50ZW5jZS5cblx0XHRjb25zdCBzZWNvbmRhcnlUZXh0ID0gZ2V0Q3VzdG9taXphdGlvblNlY29uZGFyeVRleHQoZWxlbWVudC5kZXNjcmlwdGlvbiwgZWxlbWVudC5maWxlbmFtZSwgZWxlbWVudC5wcm9tcHRUeXBlKTtcblx0XHRsZXQgc2Vjb25kYXJ5VGV4dE1hdGNoZXM6IElNYXRjaFtdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChzZWNvbmRhcnlUZXh0ICYmIGVsZW1lbnQuZGVzY3JpcHRpb24gJiYgZWxlbWVudC5kZXNjcmlwdGlvbk1hdGNoZXMpIHtcblx0XHRcdGlmIChzZWNvbmRhcnlUZXh0ID09PSBlbGVtZW50LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdC8vIE5vIHRydW5jYXRpb24sIG1hdGNoZXMgY2FuIGJlIHVzZWQgYXMtaXMuXG5cdFx0XHRcdHNlY29uZGFyeVRleHRNYXRjaGVzID0gZWxlbWVudC5kZXNjcmlwdGlvbk1hdGNoZXM7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBEZXNjcmlwdGlvbiB3YXMgdHJ1bmNhdGVkIGZvciBkaXNwbGF5OyBjbGFtcCBtYXRjaGVzIHRvIHRoZSB2aXNpYmxlIHJhbmdlLlxuXHRcdFx0XHRjb25zdCBtYXhMZW5ndGggPSBzZWNvbmRhcnlUZXh0Lmxlbmd0aDtcblx0XHRcdFx0Y29uc3QgY2xhbXBlZE1hdGNoZXMgPSBlbGVtZW50LmRlc2NyaXB0aW9uTWF0Y2hlcy5tYXAobWF0Y2ggPT4ge1xuXHRcdFx0XHRcdC8vIERpc2NhcmQgbWF0Y2hlcyB0aGF0IGFyZSBlbnRpcmVseSBvdXRzaWRlIHRoZSB2aXNpYmxlIHBvcnRpb24uXG5cdFx0XHRcdFx0aWYgKG1hdGNoLnN0YXJ0ID49IG1heExlbmd0aCB8fCBtYXRjaC5lbmQgPD0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgY2xhbXBlZFN0YXJ0ID0gTWF0aC5tYXgoMCwgbWF0Y2guc3RhcnQpO1xuXHRcdFx0XHRcdGNvbnN0IGNsYW1wZWRFbmQgPSBNYXRoLm1pbihtYXRjaC5lbmQsIG1heExlbmd0aCk7XG5cdFx0XHRcdFx0cmV0dXJuIGNsYW1wZWRFbmQgPiBjbGFtcGVkU3RhcnQgPyB7IHN0YXJ0OiBjbGFtcGVkU3RhcnQsIGVuZDogY2xhbXBlZEVuZCB9IDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9KS5maWx0ZXIoKG1hdGNoKTogbWF0Y2ggaXMgSU1hdGNoID0+ICEhbWF0Y2gpO1xuXHRcdFx0XHRzZWNvbmRhcnlUZXh0TWF0Y2hlcyA9IGNsYW1wZWRNYXRjaGVzLmxlbmd0aCA/IGNsYW1wZWRNYXRjaGVzIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoc2Vjb25kYXJ5VGV4dCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLnNldChzZWNvbmRhcnlUZXh0LCBzZWNvbmRhcnlUZXh0TWF0Y2hlcyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHQvLyBTdHlsZSBkaWZmZXJlbnRseSBmb3IgZmlsZW5hbWUgdnMgZGVzY3JpcHRpb25cblx0XHRcdHRlbXBsYXRlRGF0YS5kZXNjcmlwdGlvbi5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2lzLWZpbGVuYW1lJywgIWVsZW1lbnQuZGVzY3JpcHRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGVzY3JpcHRpb24uc2V0KCcnLCB1bmRlZmluZWQpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmRlc2NyaXB0aW9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBJbmxpbmUgYWN0aW9uIGJhciBmcm9tIG1lbnVcblx0XHRjb25zdCBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHtcblx0XHRcdHVyaTogZWxlbWVudC51cmkudG9TdHJpbmcoKSxcblx0XHRcdG5hbWU6IGVsZW1lbnQubmFtZSxcblx0XHRcdHByb21wdFR5cGU6IGVsZW1lbnQucHJvbXB0VHlwZSxcblx0XHRcdHNvdXJjZTogZWxlbWVudC5zb3VyY2UsXG5cdFx0XHRwbHVnaW5Vcmk6IGVsZW1lbnQucGx1Z2luVXJpPy50b1N0cmluZygpLFxuXHRcdFx0aXRlbUlkOiBlbGVtZW50LmlkLFxuXHRcdH07XG5cblx0XHQvLyBDcmVhdGUgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2Ugd2l0aCBpdGVtLXNwZWNpZmljIGtleXMgZm9yIHdoZW4tY2xhdXNlIGZpbHRlcmluZ1xuXHRcdGNvbnN0IG92ZXJsYXlQYWlyczogW3N0cmluZywgc3RyaW5nIHwgYm9vbGVhbl1bXSA9IFtcblx0XHRcdFtBSV9DVVNUT01JWkFUSU9OX0lURU1fVFlQRV9LRVksIGVsZW1lbnQucHJvbXB0VHlwZV0sXG5cdFx0XHRbQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1VSSV9LRVksIGVsZW1lbnQudXJpLnRvU3RyaW5nKCldLFxuXHRcdFx0W0FJX0NVU1RPTUlaQVRJT05fSVRFTV9ESVNBQkxFRF9LRVksIGVsZW1lbnQuZGlzYWJsZWRdLFxuXHRcdF07XG5cdFx0aWYgKGVsZW1lbnQuc291cmNlKSB7XG5cdFx0XHRvdmVybGF5UGFpcnMucHVzaChbQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1NUT1JBR0VfS0VZLCBlbGVtZW50LnNvdXJjZV0pO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudC5wbHVnaW5VcmkpIHtcblx0XHRcdG92ZXJsYXlQYWlycy5wdXNoKFtBSV9DVVNUT01JWkFUSU9OX0lURU1fUExVR0lOX1VSSV9LRVksIGVsZW1lbnQucGx1Z2luVXJpLnRvU3RyaW5nKCldKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3ZlcmxheSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShvdmVybGF5UGFpcnMpO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0dGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRJdGVtTWVudUlkLCBvdmVybGF5KVxuXHRcdCk7XG5cblx0XHRjb25zdCB1cGRhdGVBY3Rpb25zID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IG1lbnUuZ2V0QWN0aW9ucyh7IGFyZzogY29udGV4dCwgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cdFx0XHRjb25zdCB7IHByaW1hcnkgfSA9IGdldENvbnRleHRNZW51QWN0aW9ucyhhY3Rpb25zLCAnaW5saW5lJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLnB1c2gocHJpbWFyeSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0fTtcblx0XHR1cGRhdGVBY3Rpb25zKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobWVudS5vbkRpZENoYW5nZSh1cGRhdGVBY3Rpb25zKSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNvbnRleHQgPSBjb250ZXh0O1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQoX2VudHJ5OiBJRmlsZUl0ZW1FbnRyeSwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFJQ3VzdG9taXphdGlvbkl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudEluZGV4ID0gLTE7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQUlDdXN0b21pemF0aW9uSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMudGVtcGxhdGVzLmRlbGV0ZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBNYXBzIGEgVUkgc2VjdGlvbiB0byB0aGUgaXRlbXMtbW9kZWwgc2VjdGlvbiwgb3IgYHVuZGVmaW5lZGAgaWYgdGhlXG4gKiBzZWN0aW9uIGlzbid0IHNvdXJjZWQgZnJvbSB0aGUgY3VzdG9taXphdGlvbiBoYXJuZXNzIHBpcGVsaW5lIChlLmcuXG4gKiBNQ1AgU2VydmVycywgUGx1Z2lucywgTW9kZWxzIFx1MjAxNCB0aG9zZSBoYXZlIHRoZWlyIG93biBzZXJ2aWNlcykuXG4gKi9cbmZ1bmN0aW9uIHRvSXRlbXNNb2RlbFNlY3Rpb24oc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24pOiBJdGVtc01vZGVsU2VjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAoc2VjdGlvbikge1xuXHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzOlxuXHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzOlxuXHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zOlxuXHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0czpcblx0XHRjYXNlIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzOlxuXHRcdFx0cmV0dXJuIHNlY3Rpb247XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBBUklBIHN0YXR1cyBhbm5vdW5jZW1lbnQgc3RyaW5nIGZvciBhIGdpdmVuIHNlY3Rpb24sIGl0ZW1cbiAqIGNvdW50LCBhbmQgd2hldGhlciBhIHNlYXJjaCBmaWx0ZXIgaXMgYWN0aXZlLiBFeHBvcnRlZCBmb3IgdGVzdGluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldENvdW50QW5ub3VuY2VtZW50KHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBjb3VudDogbnVtYmVyLCBpc0ZpbHRlcmluZzogYm9vbGVhbik6IHN0cmluZyB7XG5cdHN3aXRjaCAoc2VjdGlvbikge1xuXHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzOlxuXHRcdFx0aWYgKGlzRmlsdGVyaW5nKSB7XG5cdFx0XHRcdGlmIChjb3VudCA9PT0gMCkgeyByZXR1cm4gbG9jYWxpemUoJ2NvdW50QWdlbnRzTm9SZXN1bHRzJywgXCJObyBhZ2VudHMgZm91bmRcIik7IH1cblx0XHRcdFx0aWYgKGNvdW50ID09PSAxKSB7IHJldHVybiBsb2NhbGl6ZSgnY291bnRBZ2VudHNPbmVSZXN1bHQnLCBcIjEgYWdlbnQgZm91bmRcIik7IH1cblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb3VudEFnZW50c1Jlc3VsdHMnLCBcInswfSBhZ2VudHMgZm91bmRcIiwgY291bnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvdW50ID09PSAwKSB7IHJldHVybiBsb2NhbGl6ZSgnY291bnRBZ2VudHNOb25lJywgXCJObyBhZ2VudHNcIik7IH1cblx0XHRcdGlmIChjb3VudCA9PT0gMSkgeyByZXR1cm4gbG9jYWxpemUoJ2NvdW50QWdlbnRzT25lJywgXCIxIGFnZW50XCIpOyB9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvdW50QWdlbnRzJywgXCJ7MH0gYWdlbnRzXCIsIGNvdW50KTtcblx0XHRjYXNlIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxsczpcblx0XHRcdGlmIChpc0ZpbHRlcmluZykge1xuXHRcdFx0XHRpZiAoY291bnQgPT09IDApIHsgcmV0dXJuIGxvY2FsaXplKCdjb3VudFNraWxsc05vUmVzdWx0cycsIFwiTm8gc2tpbGxzIGZvdW5kXCIpOyB9XG5cdFx0XHRcdGlmIChjb3VudCA9PT0gMSkgeyByZXR1cm4gbG9jYWxpemUoJ2NvdW50U2tpbGxzT25lUmVzdWx0JywgXCIxIHNraWxsIGZvdW5kXCIpOyB9XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY291bnRTa2lsbHNSZXN1bHRzJywgXCJ7MH0gc2tpbGxzIGZvdW5kXCIsIGNvdW50KTtcblx0XHRcdH1cblx0XHRcdGlmIChjb3VudCA9PT0gMCkgeyByZXR1cm4gbG9jYWxpemUoJ2NvdW50U2tpbGxzTm9uZScsIFwiTm8gc2tpbGxzXCIpOyB9XG5cdFx0XHRpZiAoY291bnQgPT09IDEpIHsgcmV0dXJuIGxvY2FsaXplKCdjb3VudFNraWxsc09uZScsIFwiMSBza2lsbFwiKTsgfVxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb3VudFNraWxscycsIFwiezB9IHNraWxsc1wiLCBjb3VudCk7XG5cdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnM6XG5cdFx0XHRpZiAoaXNGaWx0ZXJpbmcpIHtcblx0XHRcdFx0aWYgKGNvdW50ID09PSAwKSB7IHJldHVybiBsb2NhbGl6ZSgnY291bnRJbnN0cnVjdGlvbnNOb1Jlc3VsdHMnLCBcIk5vIGluc3RydWN0aW9ucyBmb3VuZFwiKTsgfVxuXHRcdFx0XHRpZiAoY291bnQgPT09IDEpIHsgcmV0dXJuIGxvY2FsaXplKCdjb3VudEluc3RydWN0aW9uc09uZVJlc3VsdCcsIFwiMSBpbnN0cnVjdGlvbiBmaWxlIGZvdW5kXCIpOyB9XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY291bnRJbnN0cnVjdGlvbnNSZXN1bHRzJywgXCJ7MH0gaW5zdHJ1Y3Rpb24gZmlsZXMgZm91bmRcIiwgY291bnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNvdW50ID09PSAwKSB7IHJldHVybiBsb2NhbGl6ZSgnY291bnRJbnN0cnVjdGlvbnNOb25lJywgXCJObyBpbnN0cnVjdGlvbnNcIik7IH1cblx0XHRcdGlmIChjb3VudCA9PT0gMSkgeyByZXR1cm4gbG9jYWxpemUoJ2NvdW50SW5zdHJ1Y3Rpb25zT25lJywgXCIxIGluc3RydWN0aW9uIGZpbGVcIik7IH1cblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY291bnRJbnN0cnVjdGlvbnMnLCBcInswfSBpbnN0cnVjdGlvbiBmaWxlc1wiLCBjb3VudCk7XG5cdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rczpcblx0XHRcdGlmIChpc0ZpbHRlcmluZykge1xuXHRcdFx0XHRpZiAoY291bnQgPT09IDApIHsgcmV0dXJuIGxvY2FsaXplKCdjb3VudEhvb2tzTm9SZXN1bHRzJywgXCJObyBob29rcyBmb3VuZFwiKTsgfVxuXHRcdFx0XHRpZiAoY291bnQgPT09IDEpIHsgcmV0dXJuIGxvY2FsaXplKCdjb3VudEhvb2tzT25lUmVzdWx0JywgXCIxIGhvb2sgZm91bmRcIik7IH1cblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb3VudEhvb2tzUmVzdWx0cycsIFwiezB9IGhvb2tzIGZvdW5kXCIsIGNvdW50KTtcblx0XHRcdH1cblx0XHRcdGlmIChjb3VudCA9PT0gMCkgeyByZXR1cm4gbG9jYWxpemUoJ2NvdW50SG9va3NOb25lJywgXCJObyBob29rc1wiKTsgfVxuXHRcdFx0aWYgKGNvdW50ID09PSAxKSB7IHJldHVybiBsb2NhbGl6ZSgnY291bnRIb29rc09uZScsIFwiMSBob29rXCIpOyB9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvdW50SG9va3MnLCBcInswfSBob29rc1wiLCBjb3VudCk7XG5cdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzOlxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRpZiAoaXNGaWx0ZXJpbmcpIHtcblx0XHRcdFx0aWYgKGNvdW50ID09PSAwKSB7IHJldHVybiBsb2NhbGl6ZSgnY291bnRQcm9tcHRzTm9SZXN1bHRzJywgXCJObyBwcm9tcHRzIGZvdW5kXCIpOyB9XG5cdFx0XHRcdGlmIChjb3VudCA9PT0gMSkgeyByZXR1cm4gbG9jYWxpemUoJ2NvdW50UHJvbXB0c09uZVJlc3VsdCcsIFwiMSBwcm9tcHQgZm91bmRcIik7IH1cblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb3VudFByb21wdHNSZXN1bHRzJywgXCJ7MH0gcHJvbXB0cyBmb3VuZFwiLCBjb3VudCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoY291bnQgPT09IDApIHsgcmV0dXJuIGxvY2FsaXplKCdjb3VudFByb21wdHNOb25lJywgXCJObyBwcm9tcHRzXCIpOyB9XG5cdFx0XHRpZiAoY291bnQgPT09IDEpIHsgcmV0dXJuIGxvY2FsaXplKCdjb3VudFByb21wdHNPbmUnLCBcIjEgcHJvbXB0XCIpOyB9XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvdW50UHJvbXB0cycsIFwiezB9IHByb21wdHNcIiwgY291bnQpO1xuXHR9XG59XG5cbi8qKlxuICogQW4gb3JkZXJlZCBjcmVhdGUgYWN0aW9uIGZvciB0aGUgYWRkIGJ1dHRvbi5cbiAqL1xuaW50ZXJmYWNlIElDcmVhdGVBY3Rpb24ge1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBlbmFibGVkOiBib29sZWFuO1xuXHRyZWFkb25seSB0b29sdGlwPzogc3RyaW5nO1xuXHRydW4oKTogdm9pZDtcbn1cblxuLyoqXG4gKiBXaWRnZXQgdGhhdCBkaXNwbGF5cyBhIHNlYXJjaGFibGUgbGlzdCBvZiBBSSBjdXN0b21pemF0aW9uIGl0ZW1zLlxuICovXG5leHBvcnQgY2xhc3MgQUlDdXN0b21pemF0aW9uTGlzdFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgc2VjdGlvblRpdGxlSGVhZGVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VjdGlvblRpdGxlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VjdGlvblRpdGxlRGVzY3JpcHRpb24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWN0aW9uVGl0bGVEZXNjcmlwdGlvblRleHQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWN0aW9uTGluayE6IEhUTUxBbmNob3JFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaElucHV0ITogSW5wdXRCb3g7XG5cdHByaXZhdGUgYWRkQnV0dG9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYWRkQnV0dG9uITogQnV0dG9uV2l0aERyb3Bkb3duO1xuXHRwcml2YXRlIGFkZEJ1dHRvblNpbXBsZSE6IEJ1dHRvbjtcblx0cHJpdmF0ZSBsaXN0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGlzdCE6IFdvcmtiZW5jaExpc3Q8SUxpc3RFbnRyeT47XG5cdHByaXZhdGUgZW1wdHlTdGF0ZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGVtcHR5U3RhdGVUZXh0ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZW1wdHlTdGF0ZVN1YnRleHQhOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIGN1cnJlbnRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cztcblx0cHJpdmF0ZSBhbGxJdGVtczogcmVhZG9ubHkgSUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBkaXNwbGF5RW50cmllczogSUxpc3RFbnRyeVtdID0gW107XG5cdHByaXZhdGUgc2VhcmNoUXVlcnk6IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZEdyb3VwcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIF9sYXlvdXREZWZlcnJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIGxhc3RMYXlvdXRXaWR0aCA9IDA7XG5cdHByaXZhdGUgbGFzdExheW91dEhlaWdodCA9IDA7XG5cdHByaXZhdGUgbGFzdEhlYWRlckhlaWdodCA9IDA7XG5cdHByaXZhdGUgcmVhZG9ubHkgZHJvcGRvd25BY3Rpb25EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0LyoqIE1vbm90b25pY2FsbHkgaW5jcmVhc2luZyBjb3VudGVyOyBndWFyZHMgdGhlIHBvc3QtbG9hZCBhbm5vdW5jZW1lbnQgYWdhaW5zdCBzdGFsZSBjYWxscy4gKi9cblx0cHJpdmF0ZSBfc2VjdGlvbkxvYWRJZCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVkRmlsdGVyID0gbmV3IERlbGF5ZXI8dm9pZD4oMjAwKTtcblxuXHQvKiogU3Vic2NyaXB0aW9uIHRvIHRoZSBpdGVtcyBtb2RlbCBmb3IgdGhlIGN1cnJlbnQgc2VjdGlvbjsgcmVmcmVzaGVkIG9uIHNldFNlY3Rpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgY3VycmVudFNlY3Rpb25TdWJzY3JpcHRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RJdGVtID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3RJdGVtOiBFdmVudDxJQUlDdXN0b21pemF0aW9uTGlzdEl0ZW0+ID0gdGhpcy5fb25EaWRTZWxlY3RJdGVtLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSXRlbUNvdW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtQ291bnQ6IEV2ZW50PG51bWJlcj4gPSB0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RDcmVhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm9tcHRzVHlwZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdENyZWF0ZTogRXZlbnQ8UHJvbXB0c1R5cGU+ID0gdGhpcy5fb25EaWRSZXF1ZXN0Q3JlYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdENyZWF0ZU1hbnVhbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgdHlwZTogUHJvbXB0c1R5cGU7IHRhcmdldDogJ2xvY2FsJyB8ICd1c2VyJyB8ICd3b3Jrc3BhY2Utcm9vdCc7IHJvb3RGaWxlTmFtZT86IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0Q3JlYXRlTWFudWFsOiBFdmVudDx7IHR5cGU6IFByb21wdHNUeXBlOyB0YXJnZXQ6ICdsb2NhbCcgfCAndXNlcicgfCAnd29ya3NwYWNlLXJvb3QnOyByb290RmlsZU5hbWU/OiBzdHJpbmcgfT4gPSB0aGlzLl9vbkRpZFJlcXVlc3RDcmVhdGVNYW51YWwuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBoYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwgcHJpdmF0ZSByZWFkb25seSBpdGVtc01vZGVsOiBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCxcblx0XHRASUFnZW50UGx1Z2luU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50UGx1Z2luU2VydmljZTogSUFnZW50UGx1Z2luU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcuYWktY3VzdG9taXphdGlvbi1saXN0LXdpZGdldCcpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cblx0XHQvLyBSZS1yZW5kZXIgdGhlIGFkZCBidXR0b24gd2hlbiB0aGUgYWN0aXZlIHByb2plY3Qgcm9vdCBvciBoYXJuZXNzIGNoYW5nZXMuXG5cdFx0Ly8gSXRlbSBkaXNjb3ZlcnkgaXRzZWxmIGlzIG93bmVkIGJ5IHRoZSBpdGVtcyBtb2RlbDsgd2UganVzdCByZWJpbmQgdGhlXG5cdFx0Ly8gcGVyLXNlY3Rpb24gc3Vic2NyaXB0aW9uIHNvIHRoZSBVSSBmb2xsb3dzIHdoaWNoZXZlciBoYXJuZXNzIGlzIGFjdGl2ZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UuYWN0aXZlUHJvamVjdFJvb3QucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy51cGRhdGVBZGRCdXR0b24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuaGFybmVzc1NlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudXBkYXRlQWRkQnV0dG9uKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGUoKTogdm9pZCB7XG5cdFx0Ly8gU2VjdGlvbiB0aXRsZSBoZWFkZXIgKHRpdGxlICsgZGVzY3JpcHRpb24gd2l0aCBpbmxpbmUgbGVhcm4gbW9yZSkgYXQgdGhlIHRvcC5cblx0XHR0aGlzLnNlY3Rpb25UaXRsZUhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcuc2VjdGlvbi10aXRsZS1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvblRpdGxlSGVhZGVyLCAkKCcuc2VjdGlvbi10aXRsZS1yb3cnKSk7XG5cdFx0dGhpcy5zZWN0aW9uVGl0bGUgPSBET00uYXBwZW5kKHRpdGxlUm93LCAkKCdoMi5zZWN0aW9uLXRpdGxlJykpO1xuXHRcdHRoaXMuc2VjdGlvblRpdGxlRGVzY3JpcHRpb24gPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvblRpdGxlSGVhZGVyLCAkKCdwLnNlY3Rpb24tdGl0bGUtZGVzY3JpcHRpb24nKSk7XG5cdFx0dGhpcy5zZWN0aW9uVGl0bGVEZXNjcmlwdGlvblRleHQgPSBET00uYXBwZW5kKHRoaXMuc2VjdGlvblRpdGxlRGVzY3JpcHRpb24sICQoJ3NwYW4uc2VjdGlvbi10aXRsZS1kZXNjcmlwdGlvbi10ZXh0JykpO1xuXHRcdC8vIFJlYWwgd2hpdGVzcGFjZSB0ZXh0IG5vZGUgYmV0d2VlbiBkZXNjcmlwdGlvbiBhbmQgbGluayBzbyB0aGUgZ2FwIGNvbGxhcHNlc1xuXHRcdC8vIHdoZW4gdGhlIGxpbmsgd3JhcHMgdG8gYSBuZXcgbGluZSAoYSBDU1MgbWFyZ2luLWxlZnQgd291bGQgcHVzaCBpdCBpbndhcmQpLlxuXHRcdHRoaXMuc2VjdGlvblRpdGxlRGVzY3JpcHRpb24uYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoJyAnKSk7XG5cdFx0dGhpcy5zZWN0aW9uTGluayA9IERPTS5hcHBlbmQodGhpcy5zZWN0aW9uVGl0bGVEZXNjcmlwdGlvbiwgJCgnYS5zZWN0aW9uLXRpdGxlLWxpbmsnKSkgYXMgSFRNTEFuY2hvckVsZW1lbnQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlY3Rpb25MaW5rLCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0Y29uc3QgaHJlZiA9IHRoaXMuc2VjdGlvbkxpbmsuaHJlZjtcblx0XHRcdGlmIChocmVmKSB7XG5cdFx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShocmVmKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtbGF5b3V0IHdoZW4gdGhlIGhlYWRlciBoZWlnaHQgY2hhbmdlcyAoZS5nLiBkZXNjcmlwdGlvbiB3cmFwcyxcblx0XHQvLyBvciBDU1MgYWRqdXN0bWVudHMgYWx0ZXIgcGFkZGluZykgc28gdGhlIGxpc3QncyBhbGxvdHRlZCBoZWlnaHQgc3RheXNcblx0XHQvLyBpbiBzeW5jIHdpdGggdGhlIGFjdHVhbCBvbi1zY3JlZW4gaGVhZGVyIHNpemUuIE9ubHkgcmVsYXlvdXQgd2hlbiB0aGVcblx0XHQvLyBoZWFkZXIgaGVpZ2h0IGFjdHVhbGx5IGNoYW5nZWQgdG8gYXZvaWQgcmVkdW5kYW50IHdvcmsgb24gRFBSIGNoYW5nZXNcblx0XHQvLyBvciB3aWR0aC1vbmx5IHJlc2l6ZXMuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdGNvbnN0IGhlYWRlck9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERPTS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoXG5cdFx0XHQnQUlDdXN0b21pemF0aW9uTGlzdFdpZGdldC5zZWN0aW9uVGl0bGVIZWFkZXInLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5sYXN0TGF5b3V0V2lkdGggPD0gMCB8fCB0aGlzLmxhc3RMYXlvdXRIZWlnaHQgPD0gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBoZWFkZXJIZWlnaHQgPSB0aGlzLnNlY3Rpb25UaXRsZUhlYWRlci5vZmZzZXRIZWlnaHQ7XG5cdFx0XHRcdGlmIChoZWFkZXJIZWlnaHQgPT09IHRoaXMubGFzdEhlYWRlckhlaWdodCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmxhc3RMYXlvdXRIZWlnaHQsIHRoaXMubGFzdExheW91dFdpZHRoKTtcblx0XHRcdH0sXG5cdFx0XHR0YXJnZXRXaW5kb3csXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGVhZGVyT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLnNlY3Rpb25UaXRsZUhlYWRlcikpO1xuXG5cdFx0Ly8gU2VhcmNoIGFuZCBidXR0b24gY29udGFpbmVyXG5cdFx0dGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmxpc3Qtc2VhcmNoLWFuZC1idXR0b24tY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gU2VhcmNoIGNvbnRhaW5lclxuXHRcdHRoaXMuc2VhcmNoQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLnNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3Qtc2VhcmNoLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnNlYXJjaElucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IElucHV0Qm94KHRoaXMuc2VhcmNoQ29udGFpbmVyLCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdzZWFyY2hQbGFjZWhvbGRlcicsIFwiVHlwZSB0byBzZWFyY2guLi5cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoSW5wdXQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hRdWVyeSA9IHRoaXMuc2VhcmNoSW5wdXQudmFsdWU7XG5cdFx0XHR0aGlzLmRlbGF5ZWRGaWx0ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoQ291bnQgPSB0aGlzLmZpbHRlckl0ZW1zKCk7XG5cdFx0XHRcdHRoaXMuYW5ub3VuY2VJdGVtQ291bnQobWF0Y2hDb3VudCk7XG5cdFx0XHRcdGlmICh0aGlzLnNlYXJjaFF1ZXJ5LnRyaW0oKSkge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEN1c3RvbWl6YXRpb25FZGl0b3JTZWFyY2hFdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvclNlYXJjaENsYXNzaWZpY2F0aW9uPignY2hhdEN1c3RvbWl6YXRpb25FZGl0b3Iuc2VhcmNoJywge1xuXHRcdFx0XHRcdFx0c2VjdGlvbjogdGhpcy5jdXJyZW50U2VjdGlvbixcblx0XHRcdFx0XHRcdHJlc3VsdENvdW50OiBtYXRjaENvdW50LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBBZGQgYnV0dG9uIGNvbnRhaW5lciBuZXh0IHRvIHNlYXJjaFxuXHRcdHRoaXMuYWRkQnV0dG9uQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLnNlYXJjaEFuZEJ1dHRvbkNvbnRhaW5lciwgJCgnLmxpc3QtYWRkLWJ1dHRvbi1jb250YWluZXInKSk7XG5cblx0XHQvLyBTaW1wbGUgYnV0dG9uIChmb3Igc2luZ2xlLWFjdGlvbiBjYXNlLCBubyBkcm9wZG93bilcblx0XHR0aGlzLmFkZEJ1dHRvblNpbXBsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5hZGRCdXR0b25Db250YWluZXIsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZGRCdXR0b25TaW1wbGUub25EaWRDbGljaygoKSA9PiB0aGlzLmV4ZWN1dGVQcmltYXJ5Q3JlYXRlQWN0aW9uKCkpKTtcblxuXHRcdC8vIEJ1dHRvbiB3aXRoIGRyb3Bkb3duIChmb3IgbXVsdGktYWN0aW9uIGNhc2UpXG5cdFx0dGhpcy5hZGRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uV2l0aERyb3Bkb3duKHRoaXMuYWRkQnV0dG9uQ29udGFpbmVyLCB7XG5cdFx0XHQuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLFxuXHRcdFx0c3VwcG9ydEljb25zOiB0cnVlLFxuXHRcdFx0Y29udGV4dE1lbnVQcm92aWRlcjogdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRhZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93bjogZmFsc2UsXG5cdFx0XHRhY3Rpb25zOiB7IGdldEFjdGlvbnM6ICgpID0+IHRoaXMuZ2V0RHJvcGRvd25BY3Rpb25zKCkgfSxcblx0XHR9KSk7XG5cdFx0dGhpcy5hZGRCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdsaXN0LWFkZC1idXR0b24nKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFkZEJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuZXhlY3V0ZVByaW1hcnlDcmVhdGVBY3Rpb24oKSkpO1xuXHRcdHRoaXMudXBkYXRlQWRkQnV0dG9uKCk7XG5cblx0XHQvLyBMaXN0IGNvbnRhaW5lclxuXHRcdHRoaXMubGlzdENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lbGVtZW50LCAkKCcubGlzdC1jb250YWluZXInKSk7XG5cblx0XHQvLyBFbXB0eSBzdGF0ZSBjb250YWluZXJcblx0XHR0aGlzLmVtcHR5U3RhdGVDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmxpc3QtZW1wdHktc3RhdGUnKSk7XG5cdFx0Y29uc3QgZW1wdHlTdGF0ZUhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5lbXB0eVN0YXRlQ29udGFpbmVyLCAkKCcuZW1wdHktc3RhdGUtaGVhZGVyJykpO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZVRleHQgPSBET00uYXBwZW5kKGVtcHR5U3RhdGVIZWFkZXIsICQoJy5lbXB0eS1zdGF0ZS10ZXh0JykpO1xuXHRcdHRoaXMuZW1wdHlTdGF0ZVN1YnRleHQgPSBET00uYXBwZW5kKHRoaXMuZW1wdHlTdGF0ZUNvbnRhaW5lciwgJCgnLmVtcHR5LXN0YXRlLXN1YnRleHQnKSk7XG5cdFx0dGhpcy5lbXB0eVN0YXRlQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHQvLyBDcmVhdGUgbGlzdFxuXHRcdGNvbnN0IGl0ZW1SZW5kZXJlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbVJlbmRlcmVyKTtcblx0XHR0aGlzLmxpc3QgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoTGlzdDxJTGlzdEVudHJ5Pixcblx0XHRcdCdBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50TGlzdCcsXG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIsXG5cdFx0XHRuZXcgQUlDdXN0b21pemF0aW9uTGlzdERlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBHcm91cEhlYWRlclJlbmRlcmVyKHRoaXMuaG92ZXJTZXJ2aWNlKSxcblx0XHRcdFx0aXRlbVJlbmRlcmVyLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoZW50cnk6IElMaXN0RW50cnkpID0+IGVudHJ5LnR5cGUgPT09ICdncm91cC1oZWFkZXInID8gZW50cnkuaWQgOiBlbnRyeS5pdGVtLmlkLFxuXHRcdFx0XHRcdGdldEdyb3VwSWQ6IChlbnRyeTogSUxpc3RFbnRyeSkgPT4gZW50cnkudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicgPyBOb3RTZWxlY3RhYmxlR3JvdXBJZCA6IDAsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldEFyaWFMYWJlbDogKGVudHJ5OiBJTGlzdEVudHJ5KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZW50cnkudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdncm91cEFyaWFMYWJlbCcsIFwiezB9LCB7MX0gaXRlbXMsIHsyfVwiLCBlbnRyeS5sYWJlbCwgZW50cnkuY291bnQsIGVudHJ5LmNvbGxhcHNlZCA/IGxvY2FsaXplKCdjb2xsYXBzZWQnLCBcImNvbGxhcHNlZFwiKSA6IGxvY2FsaXplKCdleHBhbmRlZCcsIFwiZXhwYW5kZWRcIikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBlbnRyeS5pdGVtLmRpc3BsYXlOYW1lID8/IGZvcm1hdERpc3BsYXlOYW1lKGVudHJ5Lml0ZW0ubmFtZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWNvbmRhcnlUZXh0ID0gZ2V0Q3VzdG9taXphdGlvblNlY29uZGFyeVRleHQoZW50cnkuaXRlbS5kZXNjcmlwdGlvbiwgZW50cnkuaXRlbS5maWxlbmFtZSwgZW50cnkuaXRlbS5wcm9tcHRUeXBlKTtcblx0XHRcdFx0XHRcdGNvbnN0IG5hbWVBbmREZXNjID0gc2Vjb25kYXJ5VGV4dFxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdpdGVtQXJpYUxhYmVsJywgXCJ7MH0uIHsxfVwiLCBkaXNwbGF5TmFtZSwgc2Vjb25kYXJ5VGV4dClcblx0XHRcdFx0XHRcdFx0OiBkaXNwbGF5TmFtZTtcblx0XHRcdFx0XHRcdHJldHVybiBlbnRyeS5pdGVtLmRpc2FibGVkXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2l0ZW1BcmlhTGFiZWxEaXNhYmxlZCcsIFwiezB9LCBkaXNhYmxlZFwiLCBuYW1lQW5kRGVzYylcblx0XHRcdFx0XHRcdFx0OiBuYW1lQW5kRGVzYztcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ2xpc3RBcmlhTGFiZWwnLCBcIkFnZW50IEN1c3RvbWl6YXRpb25zXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw6IChlbnRyeTogSUxpc3RFbnRyeSkgPT4gZW50cnkudHlwZSA9PT0gJ2dyb3VwLWhlYWRlcicgPyBlbnRyeS5sYWJlbCA6IGVudHJ5Lml0ZW0ubmFtZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0b3Blbk9uU2luZ2xlQ2xpY2s6IHRydWUsXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBIYW5kbGUgaXRlbSBzZWxlY3Rpb24gKHNpbmdsZSBjbGljayBvcGVucyBpdGVtLCBncm91cCBoZWFkZXIgdG9nZ2xlcylcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0XHRpZiAoZS5lbGVtZW50LnR5cGUgPT09ICdncm91cC1oZWFkZXInKSB7XG5cdFx0XHRcdFx0dGhpcy50b2dnbGVHcm91cChlLmVsZW1lbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0SXRlbS5maXJlKGUuZWxlbWVudC5pdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEtlZXAgb25seSB0aGUgZm9jdXNlZCByb3cncyBpbmxpbmUgYWN0aW9uIGJhciBpbiB0aGUgZG9jdW1lbnQgdGFiIG9yZGVyXG5cdFx0Ly8gc28gVGFiIGZyb20gYSBmb2N1c2VkIHJvdyBlbnRlcnMgdGhhdCByb3cncyBhY3Rpb25zIGV4YWN0bHkgb25jZSBpbnN0ZWFkXG5cdFx0Ly8gb2YgY3ljbGluZyB0aHJvdWdoIHRoZSBhY3Rpb24gYmFyIG9mIGV2ZXJ5IHJlbmRlcmVkIHJvdy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdGl0ZW1SZW5kZXJlci5zZXRGb2N1c2VkSW5kZXgoZS5pbmRleGVzLmxlbmd0aCA/IGUuaW5kZXhlc1swXSA6IC0xKTtcblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIHRoZSBsaXN0IGl0c2VsZiByZWNlaXZlcyBET00gZm9jdXMgKGUuZy4gdmlhIFRhYikgYW5kIG5vIHJvdyBpc1xuXHRcdC8vIGZvY3VzZWQgeWV0LCBmb2N1cyB0aGUgZmlyc3Qgc2VsZWN0YWJsZSBpdGVtIChza2lwcGluZyBncm91cCBoZWFkZXJzKVxuXHRcdC8vIHNvIHRoZSBmb2N1cyBpbmRpY2F0b3IgaXMgdmlzaWJsZSBpbnN0ZWFkIG9mIHJlcXVpcmluZyB0aGUgdXNlciB0b1xuXHRcdC8vIHByZXNzIGFuIGFycm93IGtleSBmaXJzdC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3Qub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5saXN0LmdldEZvY3VzKCkubGVuZ3RoID09PSAwICYmIHRoaXMuZGlzcGxheUVudHJpZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBmaXJzdEl0ZW1JbmRleCA9IHRoaXMuZGlzcGxheUVudHJpZXMuZmluZEluZGV4KGUgPT4gZS50eXBlICE9PSAnZ3JvdXAtaGVhZGVyJyk7XG5cdFx0XHRcdGlmIChmaXJzdEl0ZW1JbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5saXN0LnNldEZvY3VzKFtmaXJzdEl0ZW1JbmRleF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGNvbnRleHQgbWVudVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdC5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHQvLyBSZWZyZXNoIG9uIGZpbGUgZGVsZXRpb25zIHNvIHRoZSBsaXN0IHVwZGF0ZXMgYWZ0ZXIgaW5saW5lIGRlbGV0ZSBhY3Rpb25zXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuZ290RGVsZXRlZCgpKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMudXBkYXRlU2VjdGlvbkhlYWRlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgY29udGV4dCBtZW51IGZvciBsaXN0IGl0ZW1zLlxuXHQgKi9cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxJTGlzdEVudHJ5Pik6IHZvaWQge1xuXHRcdGlmICghZS5lbGVtZW50IHx8IGUuZWxlbWVudC50eXBlICE9PSAnZmlsZS1pdGVtJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSBlLmVsZW1lbnQuaXRlbTtcblxuXHRcdC8vIENyZWF0ZSBjb250ZXh0IGZvciB0aGUgbWVudSBhY3Rpb25zXG5cdFx0Y29uc3QgY29udGV4dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG5cdFx0XHR1cmk6IGl0ZW0udXJpLnRvU3RyaW5nKCksXG5cdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRwcm9tcHRUeXBlOiBpdGVtLnByb21wdFR5cGUsXG5cdFx0XHRzb3VyY2U6IGl0ZW0uc291cmNlLFxuXHRcdFx0cGx1Z2luVXJpOiBpdGVtLnBsdWdpblVyaT8udG9TdHJpbmcoKSxcblx0XHRcdGl0ZW1JZDogaXRlbS5pZCxcblx0XHR9O1xuXG5cdFx0Ly8gQ3JlYXRlIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIHdpdGggaXRlbS1zcGVjaWZpYyBrZXlzIGZvciB3aGVuLWNsYXVzZSBmaWx0ZXJpbmdcblx0XHRjb25zdCBvdmVybGF5UGFpcnM6IFtzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW5dW10gPSBbXG5cdFx0XHRbQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1RZUEVfS0VZLCBpdGVtLnByb21wdFR5cGVdLFxuXHRcdFx0W0FJX0NVU1RPTUlaQVRJT05fSVRFTV9VUklfS0VZLCBpdGVtLnVyaS50b1N0cmluZygpXSxcblx0XHRcdFtBSV9DVVNUT01JWkFUSU9OX0lURU1fRElTQUJMRURfS0VZLCBpdGVtLmRpc2FibGVkXSxcblx0XHRdO1xuXHRcdGlmIChpdGVtLnNvdXJjZSkge1xuXHRcdFx0b3ZlcmxheVBhaXJzLnB1c2goW0FJX0NVU1RPTUlaQVRJT05fSVRFTV9TVE9SQUdFX0tFWSwgaXRlbS5zb3VyY2VdKTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0ucGx1Z2luVXJpKSB7XG5cdFx0XHRvdmVybGF5UGFpcnMucHVzaChbQUlfQ1VTVE9NSVpBVElPTl9JVEVNX1BMVUdJTl9VUklfS0VZLCBpdGVtLnBsdWdpblVyaS50b1N0cmluZygpXSk7XG5cdFx0fVxuXHRcdGNvbnN0IG92ZXJsYXkgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkob3ZlcmxheVBhaXJzKTtcblxuXHRcdC8vIEdldCBtZW51IGFjdGlvbnMsIGV4Y2x1ZGluZyBpbmxpbmUgYWN0aW9ucyB0byBhdm9pZCBkdXBsaWNhdGVzXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEl0ZW1NZW51SWQsIG92ZXJsYXksIHtcblx0XHRcdGFyZzogY29udGV4dCxcblx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgeyBzZWNvbmRhcnkgfSA9IGdldENvbnRleHRNZW51QWN0aW9ucyhhY3Rpb25zLCAnaW5saW5lJyk7XG5cblx0XHQvLyBBZGQgY29weSBwYXRoIGFjdGlvbnMgKG5vdCBzaG93biBmb3IgYnVpbHQtaW4gaXRlbXMgd2hlcmUgdGhlIHBhdGggaXMgYW4gaW1wbGVtZW50YXRpb24gZGV0YWlsKVxuXHRcdGNvbnN0IGNvcHlBY3Rpb25zID0gaXRlbS5pc0J1aWx0aW4gPyBbXSA6IFtcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdG5ldyBBY3Rpb24oJ2NvcHlGdWxsUGF0aCcsIGxvY2FsaXplKCdjb3B5RnVsbFBhdGgnLCBcIkNvcHkgRnVsbCBQYXRoXCIpLCB1bmRlZmluZWQsIHRydWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChpdGVtLnVyaS5mc1BhdGgpO1xuXHRcdFx0fSksXG5cdFx0XHRuZXcgQWN0aW9uKCdjb3B5UmVsYXRpdmVQYXRoJywgbG9jYWxpemUoJ2NvcHlSZWxhdGl2ZVBhdGgnLCBcIkNvcHkgUmVsYXRpdmUgUGF0aFwiKSwgdW5kZWZpbmVkLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJhc2VQYXRoID0gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCk7XG5cdFx0XHRcdGlmIChiYXNlUGF0aCAmJiBpdGVtLnVyaS5mc1BhdGguc3RhcnRzV2l0aChiYXNlUGF0aC5mc1BhdGgpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVsYXRpdmUgPSBpdGVtLnVyaS5mc1BhdGguc3Vic3RyaW5nKGJhc2VQYXRoLmZzUGF0aC5sZW5ndGggKyAxKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHJlbGF0aXZlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBGYWxsYmFjayB0byB3b3Jrc3BhY2UtcmVsYXRpdmUgdmlhIGxhYmVsIHNlcnZpY2Vcblx0XHRcdFx0XHRjb25zdCByZWxhdGl2ZVBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChpdGVtLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHJlbGF0aXZlUGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLFxuXHRcdF07XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFsuLi5zZWNvbmRhcnksIC4uLmNvcHlBY3Rpb25zXSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXRzIHRoZSBjdXJyZW50IHNlY3Rpb24gYW5kIGJpbmRzIHRoZSBsaXN0IHRvIHRoZSBtb2RlbCdzIHBlci1zZWN0aW9uXG5cdCAqIG9ic2VydmFibGUuIFJldHVybnMgb25jZSB0aGUgaW5pdGlhbCBmZXRjaCBmb3IgdGhlIHNlY3Rpb24gaGFzIHJlc29sdmVkXG5cdCAqIHNvIHRoYXQgY2FsbGVycyAoZS5nLiB0ZXN0cy9maXh0dXJlcykgY2FuIHJlbHkgb24gcmVuZGVyZWQgb3V0cHV0XG5cdCAqIHJlZmxlY3RpbmcgYXQgbGVhc3Qgb25lIGZldGNoLlxuXHQgKi9cblx0YXN5bmMgc2V0U2VjdGlvbihzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxvYWRJZCA9ICsrdGhpcy5fc2VjdGlvbkxvYWRJZDtcblx0XHR0aGlzLmN1cnJlbnRTZWN0aW9uID0gc2VjdGlvbjtcblx0XHR0aGlzLnVwZGF0ZVNlY3Rpb25IZWFkZXIoKTtcblxuXHRcdGNvbnN0IG1vZGVsU2VjdGlvbiA9IHRvSXRlbXNNb2RlbFNlY3Rpb24oc2VjdGlvbik7XG5cdFx0aWYgKCFtb2RlbFNlY3Rpb24pIHtcblx0XHRcdHRoaXMuY3VycmVudFNlY3Rpb25TdWJzY3JpcHRpb24uY2xlYXIoKTtcblx0XHRcdHRoaXMuYWxsSXRlbXMgPSBbXTtcblx0XHRcdGNvbnN0IG1hdGNoQ291bnQgPSB0aGlzLmZpbHRlckl0ZW1zKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1Db3VudC5maXJlKDApO1xuXHRcdFx0dGhpcy51cGRhdGVBZGRCdXR0b24oKTtcblx0XHRcdHRoaXMuYW5ub3VuY2VJdGVtQ291bnQobWF0Y2hDb3VudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2JzZXJ2YWJsZSA9IHRoaXMuaXRlbXNNb2RlbC5nZXRJdGVtcyhtb2RlbFNlY3Rpb24pO1xuXHRcdHRoaXMuY3VycmVudFNlY3Rpb25TdWJzY3JpcHRpb24udmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IG9ic2VydmFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5hbGxJdGVtcyA9IGl0ZW1zO1xuXHRcdFx0dGhpcy5maWx0ZXJJdGVtcygpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZmlyZShpdGVtcy5sZW5ndGgpO1xuXHRcdH0pO1xuXHRcdHRoaXMudXBkYXRlQWRkQnV0dG9uKCk7XG5cdFx0YXdhaXQgdGhpcy5pdGVtc01vZGVsLndoZW5TZWN0aW9uTG9hZGVkKG1vZGVsU2VjdGlvbik7XG5cdFx0Ly8gT25seSBhbm5vdW5jZSBpZiB0aGlzIGlzIHN0aWxsIHRoZSBtb3N0IHJlY2VudCBzZWN0aW9uIGNoYW5nZTsgYSBuZXdlclxuXHRcdC8vIHNldFNlY3Rpb24oKSBjYWxsIG1heSBoYXZlIGFscmVhZHkgdGFrZW4gb3ZlciBhbmQgd2lsbCBtYWtlIGl0cyBvd25cblx0XHQvLyBhbm5vdW5jZW1lbnQgb25jZSBpdHMgb3duIGxvYWQgcmVzb2x2ZXMuXG5cdFx0aWYgKGxvYWRJZCA9PT0gdGhpcy5fc2VjdGlvbkxvYWRJZCkge1xuXHRcdFx0dGhpcy5hbm5vdW5jZUl0ZW1Db3VudCh0aGlzLmFwcGx5U2VhcmNoRmlsdGVyKHRoaXMuYWxsSXRlbXMpLmxlbmd0aCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIHNlY3Rpb24gaGVhZGVyIGJhc2VkIG9uIHRoZSBjdXJyZW50IHNlY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVNlY3Rpb25IZWFkZXIoKTogdm9pZCB7XG5cdFx0bGV0IHRpdGxlOiBzdHJpbmc7XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0bGV0IGRvY3NVcmw6IHN0cmluZztcblx0XHRsZXQgbGVhcm5Nb3JlTGFiZWw6IHN0cmluZztcblx0XHRzd2l0Y2ggKHRoaXMuY3VycmVudFNlY3Rpb24pIHtcblx0XHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzOlxuXHRcdFx0XHR0aXRsZSA9IGxvY2FsaXplKCdhZ2VudHMnLCBcIkFnZW50c1wiKTtcblx0XHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnYWdlbnRzRGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZSB0aGUgQUkgdG8gYWRvcHQgZGlmZmVyZW50IHBlcnNvbmFzIHRhaWxvcmVkIHRvIHNwZWNpZmljIGRldmVsb3BtZW50IHRhc2tzLiBFYWNoIGFnZW50IGhhcyBpdHMgb3duIGluc3RydWN0aW9ucywgdG9vbHMsIGFuZCBiZWhhdmlvci5cIik7XG5cdFx0XHRcdGRvY3NVcmwgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9hZ2VudC1jdXN0b21pemF0aW9uL2N1c3RvbS1hZ2VudHM/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cdFx0XHRcdGxlYXJuTW9yZUxhYmVsID0gbG9jYWxpemUoJ2xlYXJuTW9yZUFnZW50cycsIFwiTGVhcm4gbW9yZSBhYm91dCBjdXN0b20gYWdlbnRzXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzOlxuXHRcdFx0XHR0aXRsZSA9IGxvY2FsaXplKCdza2lsbHMnLCBcIlNraWxsc1wiKTtcblx0XHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnc2tpbGxzRGVzY3JpcHRpb24nLCBcIkZvbGRlcnMgb2YgaW5zdHJ1Y3Rpb25zLCBzY3JpcHRzLCBhbmQgcmVzb3VyY2VzIHRoYXQgQ29waWxvdCBsb2FkcyB3aGVuIHJlbGV2YW50IHRvIHBlcmZvcm0gc3BlY2lhbGl6ZWQgdGFza3MuXCIpO1xuXHRcdFx0XHRkb2NzVXJsID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvYWdlbnQtY3VzdG9taXphdGlvbi9hZ2VudC1za2lsbHM/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cdFx0XHRcdGxlYXJuTW9yZUxhYmVsID0gbG9jYWxpemUoJ2xlYXJuTW9yZVNraWxscycsIFwiTGVhcm4gbW9yZSBhYm91dCBhZ2VudCBza2lsbHNcIik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnM6XG5cdFx0XHRcdHRpdGxlID0gbG9jYWxpemUoJ2luc3RydWN0aW9ucycsIFwiSW5zdHJ1Y3Rpb25zXCIpO1xuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdpbnN0cnVjdGlvbnNEZXNjcmlwdGlvbicsIFwiRGVmaW5lIGNvbW1vbiBndWlkZWxpbmVzIGFuZCBydWxlcyB0aGF0IGF1dG9tYXRpY2FsbHkgaW5mbHVlbmNlIGhvdyBBSSBnZW5lcmF0ZXMgY29kZSBhbmQgaGFuZGxlcyBkZXZlbG9wbWVudCB0YXNrcy5cIik7XG5cdFx0XHRcdGRvY3NVcmwgPSAnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9hZ2VudC1jdXN0b21pemF0aW9uL2N1c3RvbS1pbnN0cnVjdGlvbnM/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cdFx0XHRcdGxlYXJuTW9yZUxhYmVsID0gbG9jYWxpemUoJ2xlYXJuTW9yZUluc3RydWN0aW9ucycsIFwiTGVhcm4gbW9yZSBhYm91dCBjdXN0b20gaW5zdHJ1Y3Rpb25zXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3M6XG5cdFx0XHRcdHRpdGxlID0gbG9jYWxpemUoJ2hvb2tzJywgXCJIb29rc1wiKTtcblx0XHRcdFx0ZGVzY3JpcHRpb24gPSBsb2NhbGl6ZSgnaG9va3NEZXNjcmlwdGlvbicsIFwiUHJvbXB0cyBleGVjdXRlZCBhdCBzcGVjaWZpYyBwb2ludHMgZHVyaW5nIGFuIGFnZW50aWMgbGlmZWN5Y2xlLlwiKTtcblx0XHRcdFx0ZG9jc1VybCA9ICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2FnZW50LWN1c3RvbWl6YXRpb24vaG9va3M/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cdFx0XHRcdGxlYXJuTW9yZUxhYmVsID0gbG9jYWxpemUoJ2xlYXJuTW9yZUhvb2tzJywgXCJMZWFybiBtb3JlIGFib3V0IGhvb2tzXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0czpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRpdGxlID0gbG9jYWxpemUoJ3Byb21wdHMnLCBcIlByb21wdHNcIik7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3Byb21wdHNEZXNjcmlwdGlvbicsIFwiUmV1c2FibGUgcHJvbXB0cyBmb3IgY29tbW9uIGRldmVsb3BtZW50IHRhc2tzIGxpa2UgZ2VuZXJhdGluZyBjb2RlLCBwZXJmb3JtaW5nIHJldmlld3MsIG9yIHNjYWZmb2xkaW5nIGNvbXBvbmVudHMuXCIpO1xuXHRcdFx0XHRkb2NzVXJsID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvYWdlbnQtY3VzdG9taXphdGlvbi9wcm9tcHQtZmlsZXM/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cdFx0XHRcdGxlYXJuTW9yZUxhYmVsID0gbG9jYWxpemUoJ2xlYXJuTW9yZVByb21wdHMnLCBcIkxlYXJuIG1vcmUgYWJvdXQgcHJvbXB0IGZpbGVzXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0dGhpcy5zZWN0aW9uVGl0bGUudGV4dENvbnRlbnQgPSB0aXRsZTtcblx0XHR0aGlzLnNlY3Rpb25UaXRsZURlc2NyaXB0aW9uVGV4dC50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXHRcdHRoaXMuc2VjdGlvbkxpbmsudGV4dENvbnRlbnQgPSBsZWFybk1vcmVMYWJlbDtcblx0XHR0aGlzLnNlY3Rpb25MaW5rLmhyZWYgPSBkb2NzVXJsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGFkZCBidXR0b24gYnkgYnVpbGRpbmcgYSB1bmlmaWVkIGFjdGlvbiBsaXN0LlxuXHQgKiBUaGUgZmlyc3QgYWN0aW9uIGJlY29tZXMgdGhlIHByaW1hcnkgYnV0dG9uOyB0aGUgcmVzdCBnbyBpbiB0aGUgZHJvcGRvd24uXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZUFkZEJ1dHRvbigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5idWlsZENyZWF0ZUFjdGlvbnMoKTtcblx0XHRjb25zdCBbcHJpbWFyeSwgLi4uZHJvcGRvd25dID0gYWN0aW9ucztcblx0XHRjb25zdCBoYXNEcm9wZG93biA9IGRyb3Bkb3duLmxlbmd0aCA+IDA7XG5cblx0XHQvLyBUb2dnbGUgd2hpY2ggYnV0dG9uIGlzIHZpc2libGVcblx0XHR0aGlzLmFkZEJ1dHRvbi5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBoYXNEcm9wZG93biA/ICcnIDogJ25vbmUnO1xuXHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IGhhc0Ryb3Bkb3duID8gJ25vbmUnIDogJyc7XG5cblx0XHRpZiAoIXByaW1hcnkpIHtcblx0XHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuYWRkQnV0dG9uLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaGFzRHJvcGRvd24pIHtcblx0XHRcdHRoaXMuYWRkQnV0dG9uLmxhYmVsID0gcHJpbWFyeS5sYWJlbDtcblx0XHRcdHRoaXMuYWRkQnV0dG9uLmVuYWJsZWQgPSBwcmltYXJ5LmVuYWJsZWQ7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvbi5wcmltYXJ5QnV0dG9uLnNldFRpdGxlKHByaW1hcnkudG9vbHRpcCA/PyAnJyk7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvbi5kcm9wZG93bkJ1dHRvbi5zZXRUaXRsZSgnJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmxhYmVsID0gcHJpbWFyeS5sYWJlbDtcblx0XHRcdHRoaXMuYWRkQnV0dG9uU2ltcGxlLmVuYWJsZWQgPSBwcmltYXJ5LmVuYWJsZWQ7XG5cdFx0XHR0aGlzLmFkZEJ1dHRvblNpbXBsZS5zZXRUaXRsZShwcmltYXJ5LnRvb2x0aXAgPz8gJycpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgYW4gb3JkZXJlZCBsaXN0IG9mIGNyZWF0ZSBhY3Rpb25zIGZvciB0aGUgY3VycmVudCBzZWN0aW9uLlxuXHQgKiBUaGUgZmlyc3QgZW50cnkgaXMgdGhlIHByaW1hcnkgYnV0dG9uOyByZW1haW5pbmcgZW50cmllcyBhcmUgZHJvcGRvd24gaXRlbXMuXG5cdCAqL1xuXHRwcml2YXRlIGJ1aWxkQ3JlYXRlQWN0aW9ucygpOiBJQ3JlYXRlQWN0aW9uW10ge1xuXHRcdGNvbnN0IHR5cGVMYWJlbCA9IHRoaXMuZ2V0VHlwZUxhYmVsKCk7XG5cdFx0Y29uc3QgcHJvbXB0VHlwZSA9IHNlY3Rpb25Ub1Byb21wdFR5cGUodGhpcy5jdXJyZW50U2VjdGlvbik7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHRoaXMuaGFybmVzc1NlcnZpY2UuZ2V0QWN0aXZlRGVzY3JpcHRvcigpO1xuXHRcdGNvbnN0IG92ZXJyaWRlID0gZGVzY3JpcHRvci5zZWN0aW9uT3ZlcnJpZGVzPy5nZXQodGhpcy5jdXJyZW50U2VjdGlvbik7XG5cdFx0Y29uc3QgaGFzV29ya3NwYWNlID0gdGhpcy5oYXNBY3RpdmVXb3Jrc3BhY2UoKTtcblxuXHRcdC8vIEZ1bGwgY29tbWFuZCBvdmVycmlkZSAoZS5nLiBDbGF1ZGUgaG9va3MpIFx1MjAxNCBzaW5nbGUgYWN0aW9uLCBubyBkcm9wZG93blxuXHRcdGlmIChvdmVycmlkZT8uY29tbWFuZElkKSB7XG5cdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5hZGQuaWR9KSAke292ZXJyaWRlLmxhYmVsfWAsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4geyB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKG92ZXJyaWRlLmNvbW1hbmRJZCEpOyB9LFxuXHRcdFx0fV07XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIG1lbnUtY29udHJpYnV0ZWQgY3JlYXRlIGFjdGlvbnMgZnJvbSBleHRlbnNpb25zLlxuXHRcdC8vIEV4dGVuc2lvbnMgY29udHJpYnV0ZSB0byBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q3JlYXRlTWVudUlkIHdpdGhcblx0XHQvLyB3aGVuLWNsYXVzZXMgdGFyZ2V0aW5nIGNoYXRDdXN0b21pemF0aW9uU2Vzc2lvblR5cGUgYW5kXG5cdFx0Ly8gY2hhdEN1c3RvbWl6YXRpb25TZWN0aW9uIGNvbnRleHQga2V5cy5cblx0XHQvLyBXaGVuIGEgaGFybmVzcyBjb250cmlidXRlcyBjcmVhdGUgYWN0aW9ucywgdGhleSBSRVBMQUNFIHRoZSBidWlsdC1pbiBvbmVzXG5cdFx0Ly8gZm9yIGFsbCBzZWN0aW9uIHR5cGVzLCBpbmNsdWRpbmcgaG9va3MuXG5cdFx0Y29uc3QgbWVudUFjdGlvbnMgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKFxuXHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENyZWF0ZU1lbnVJZCxcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0KTtcblx0XHRjb25zdCBleHRlbnNpb25DcmVhdGVBY3Rpb25zOiBJQ3JlYXRlQWN0aW9uW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFssIGdyb3VwXSBvZiBtZW51QWN0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBtZW51SXRlbSBvZiBncm91cCkge1xuXHRcdFx0XHRpZiAobWVudUl0ZW0gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGljb24gPSBUaGVtZUljb24uaXNUaGVtZUljb24obWVudUl0ZW0uaXRlbS5pY29uKSA/IG1lbnVJdGVtLml0ZW0uaWNvbi5pZCA6IENvZGljb24uYWRkLmlkO1xuXHRcdFx0XHRcdGV4dGVuc2lvbkNyZWF0ZUFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogYCQoJHtpY29ufSkgJHt0eXBlb2YgbWVudUl0ZW0uaXRlbS50aXRsZSA9PT0gJ3N0cmluZycgPyBtZW51SXRlbS5pdGVtLnRpdGxlIDogbWVudUl0ZW0uaXRlbS50aXRsZS52YWx1ZX1gLFxuXHRcdFx0XHRcdFx0ZW5hYmxlZDogbWVudUl0ZW0uZW5hYmxlZCxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4geyBtZW51SXRlbS5ydW4oKTsgfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChleHRlbnNpb25DcmVhdGVBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBleHRlbnNpb25DcmVhdGVBY3Rpb25zO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNyZWF0ZVR5cGVMYWJlbCA9IG92ZXJyaWRlPy50eXBlTGFiZWwgPz8gdHlwZUxhYmVsO1xuXHRcdGNvbnN0IGFjdGlvbnM6IElDcmVhdGVBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGFkZGVkVGFyZ2V0cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Ly8gUm9vdC1maWxlIHByaW1hcnkgYnV0dG9uIChlLmcuIFwiQWRkIENMQVVERS5tZFwiKSBcdTIwMTQgb25seSB3aGVuIHdvcmtzcGFjZSBpcyBvcGVuLlxuXHRcdC8vIFdpdGhvdXQgYSB3b3Jrc3BhY2UsIHVzZXIgY3JlYXRpb24gYmVjb21lcyBwcmltYXJ5IGFuZCByb290RmlsZSBnb2VzIHRvIGRyb3Bkb3duLlxuXHRcdGlmIChvdmVycmlkZT8ucm9vdEZpbGUgJiYgaGFzV29ya3NwYWNlKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogYCQoJHtDb2RpY29uLmFkZC5pZH0pICR7b3ZlcnJpZGUubGFiZWx9YCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7IHRoaXMuX29uRGlkUmVxdWVzdENyZWF0ZU1hbnVhbC5maXJlKHsgdHlwZTogcHJvbXB0VHlwZSwgdGFyZ2V0OiAnd29ya3NwYWNlLXJvb3QnIH0pOyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhZGRlZFRhcmdldHMuYWRkKCd3b3Jrc3BhY2Utcm9vdCcpO1xuXHRcdH1cblxuXHRcdC8vIEhvb2tzIGhhdmUgYSBzaW1wbGlmaWVkIGFjdGlvbiBzZXRcblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuaG9vaykge1xuXHRcdFx0aWYgKCF0aGlzLndvcmtzcGFjZVNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyAmJiAhZGVzY3JpcHRvci5oaWRlR2VuZXJhdGVCdXR0b24pIHtcblx0XHRcdFx0Ly8gQ29yZSBMb2NhbDogR2VuZXJhdGUgaXMgcHJpbWFyeSwgY29uZmlndXJlIGhvb2tzIGluIGRyb3Bkb3duXG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5zcGFya2xlLmlkfSkgR2VuZXJhdGUgJHt0eXBlTGFiZWx9YCxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4geyB0aGlzLl9vbkRpZFJlcXVlc3RDcmVhdGUuZmlyZShwcm9tcHRUeXBlKTsgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChoYXNXb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5hZGQuaWR9KSAke2xvY2FsaXplKCdjb25maWd1cmVIb29rcycsIFwiQ29uZmlndXJlIEhvb2tzXCIpfWAsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7IHRoaXMuX29uRGlkUmVxdWVzdENyZWF0ZU1hbnVhbC5maXJlKHsgdHlwZTogcHJvbXB0VHlwZSwgdGFyZ2V0OiAnbG9jYWwnIH0pOyB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKCFvdmVycmlkZT8uY29tbWFuZElkKSB7XG5cdFx0XHRcdC8vIFNlc3Npb25zIC8gbm9uLWxvY2FsOiBjb25maWd1cmUgaG9va3MgKHZpZXcgKyBjcmVhdGUpXG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5hZGQuaWR9KSAke2xvY2FsaXplKCdjb25maWd1cmVIb29rcycsIFwiQ29uZmlndXJlIEhvb2tzXCIpfWAsXG5cdFx0XHRcdFx0ZW5hYmxlZDogaGFzV29ya3NwYWNlLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGhhc1dvcmtzcGFjZSA/IHVuZGVmaW5lZCA6IGxvY2FsaXplKCdjb25maWd1cmVIb29rc0Rpc2FibGVkJywgXCJPcGVuIGEgd29ya3NwYWNlIGZvbGRlciB0byBjb25maWd1cmUgaG9va3MuXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4geyB0aGlzLl9vbkRpZFJlcXVlc3RDcmVhdGVNYW51YWwuZmlyZSh7IHR5cGU6IHByb21wdFR5cGUsIHRhcmdldDogJ2xvY2FsJyB9KTsgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHR9XG5cblx0XHQvLyBOb24taG9vayBzZWN0aW9uczogYnVpbGQgdGhlIGZ1bGwgYWN0aW9uIGxpc3RcblxuXHRcdGlmICghb3ZlcnJpZGU/LnJvb3RGaWxlKSB7XG5cdFx0XHQvLyBEZXRlcm1pbmUgdGhlIHByaW1hcnkgYWN0aW9uIChmaXJzdCBpbiBsaXN0KVxuXHRcdFx0aWYgKCF0aGlzLndvcmtzcGFjZVNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyAmJiAhZGVzY3JpcHRvci5oaWRlR2VuZXJhdGVCdXR0b24pIHtcblx0XHRcdFx0Ly8gQ29yZSBMb2NhbDogR2VuZXJhdGUgaXMgcHJpbWFyeVxuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBgJCgke0NvZGljb24uc3BhcmtsZS5pZH0pIEdlbmVyYXRlICR7dHlwZUxhYmVsfWAsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRydW46ICgpID0+IHsgdGhpcy5fb25EaWRSZXF1ZXN0Q3JlYXRlLmZpcmUocHJvbXB0VHlwZSk7IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChoYXNXb3Jrc3BhY2UpIHtcblx0XHRcdFx0Ly8gU2Vzc2lvbnMgb3Igbm9uLWxvY2FsIGhhcm5lc3Mgd2l0aCB3b3Jrc3BhY2U6IHdvcmtzcGFjZSBpcyBwcmltYXJ5XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5hZGQuaWR9KSBOZXcgJHtjcmVhdGVUeXBlTGFiZWx9IChXb3Jrc3BhY2UpYCxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4geyB0aGlzLl9vbkRpZFJlcXVlc3RDcmVhdGVNYW51YWwuZmlyZSh7IHR5cGU6IHByb21wdFR5cGUsIHRhcmdldDogJ2xvY2FsJyB9KTsgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFkZGVkVGFyZ2V0cy5hZGQoJ3dvcmtzcGFjZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm8gd29ya3NwYWNlOiB1c2VyIGlzIHByaW1hcnlcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogYCQoJHtDb2RpY29uLmFkZC5pZH0pIE5ldyAke2NyZWF0ZVR5cGVMYWJlbH0gKFVzZXIpYCxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4geyB0aGlzLl9vbkRpZFJlcXVlc3RDcmVhdGVNYW51YWwuZmlyZSh7IHR5cGU6IHByb21wdFR5cGUsIHRhcmdldDogJ3VzZXInIH0pOyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YWRkZWRUYXJnZXRzLmFkZCgndXNlcicpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNlY29uZGFyeSBhY3Rpb25zIChkcm9wZG93bikgXHUyMDE0IG9ubHkgYWRkIGlmIG5vdCBhbHJlYWR5IHByZXNlbnRcblx0XHRpZiAoaGFzV29ya3NwYWNlICYmICFhZGRlZFRhcmdldHMuaGFzKCd3b3Jrc3BhY2UnKSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGAkKCR7Q29kaWNvbi5mb2xkZXIuaWR9KSBOZXcgJHtjcmVhdGVUeXBlTGFiZWx9IChXb3Jrc3BhY2UpYCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7IHRoaXMuX29uRGlkUmVxdWVzdENyZWF0ZU1hbnVhbC5maXJlKHsgdHlwZTogcHJvbXB0VHlwZSwgdGFyZ2V0OiAnbG9jYWwnIH0pOyB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFhZGRlZFRhcmdldHMuaGFzKCd1c2VyJykpIHtcblx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBgJCgke0NvZGljb24uYWNjb3VudC5pZH0pIE5ldyAke2NyZWF0ZVR5cGVMYWJlbH0gKFVzZXIpYCxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7IHRoaXMuX29uRGlkUmVxdWVzdENyZWF0ZU1hbnVhbC5maXJlKHsgdHlwZTogcHJvbXB0VHlwZSwgdGFyZ2V0OiAndXNlcicgfSk7IH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBSb290LWZpbGUgc2hvcnRjdXRzIGZyb20gdGhlIGRlc2NyaXB0b3IgKGUuZy4gXCJOZXcgQUdFTlRTLm1kXCIpXG5cdFx0aWYgKGhhc1dvcmtzcGFjZSAmJiBvdmVycmlkZT8ucm9vdEZpbGVTaG9ydGN1dHMgJiYgIWFkZGVkVGFyZ2V0cy5oYXMoJ3dvcmtzcGFjZS1yb290JykpIHtcblx0XHRcdGZvciAoY29uc3QgZmlsZU5hbWUgb2Ygb3ZlcnJpZGUucm9vdEZpbGVTaG9ydGN1dHMpIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogYCQoJHtDb2RpY29uLmZpbGUuaWR9KSBOZXcgJHtmaWxlTmFtZX1gLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7IHRoaXMuX29uRGlkUmVxdWVzdENyZWF0ZU1hbnVhbC5maXJlKHsgdHlwZTogcHJvbXB0VHlwZSwgdGFyZ2V0OiAnd29ya3NwYWNlLXJvb3QnLCByb290RmlsZU5hbWU6IGZpbGVOYW1lIH0pOyB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBkcm9wZG93biBhY3Rpb25zIGZvciB0aGUgYWRkIGJ1dHRvbiAoY29uc3VtZWQgYnkgQnV0dG9uV2l0aERyb3Bkb3duKS5cblx0ICogUmV0dXJucyBhbGwgYWN0aW9ucyBleGNlcHQgdGhlIHByaW1hcnkgKGZpcnN0KSBmcm9tIGJ1aWxkQ3JlYXRlQWN0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgZ2V0RHJvcGRvd25BY3Rpb25zKCk6IEFjdGlvbltdIHtcblx0XHR0aGlzLmRyb3Bkb3duQWN0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBhbGxBY3Rpb25zID0gdGhpcy5idWlsZENyZWF0ZUFjdGlvbnMoKTtcblx0XHQvLyBTa2lwIHRoZSBmaXJzdCAocHJpbWFyeSkgYWN0aW9uXG5cdFx0cmV0dXJuIGFsbEFjdGlvbnMuc2xpY2UoMSkubWFwKChhLCBpKSA9PlxuXHRcdFx0dGhpcy5kcm9wZG93bkFjdGlvbkRpc3Bvc2FibGVzLmFkZChuZXcgQWN0aW9uKGBjcmVhdGVfJHtpfWAsIGEubGFiZWwsIHVuZGVmaW5lZCwgYS5lbmFibGVkLCAoKSA9PiBhLnJ1bigpKSlcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiB0aGVyZSdzIGFuIGFjdGl2ZSBwcm9qZWN0IHJvb3QgKHdvcmtzcGFjZSBmb2xkZXIgb3Igc2Vzc2lvbiByZXBvc2l0b3J5KS5cblx0ICovXG5cdHByaXZhdGUgaGFzQWN0aXZlV29ya3NwYWNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMud29ya3NwYWNlU2VydmljZS5nZXRBY3RpdmVQcm9qZWN0Um9vdCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4ZWN1dGVzIHRoZSBwcmltYXJ5IGNyZWF0ZSBhY3Rpb24gYmFzZWQgb24gY29udGV4dC5cblx0ICovXG5cdHByaXZhdGUgZXhlY3V0ZVByaW1hcnlDcmVhdGVBY3Rpb24oKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuYnVpbGRDcmVhdGVBY3Rpb25zKCk7XG5cdFx0aWYgKGFjdGlvbnMubGVuZ3RoID4gMCAmJiBhY3Rpb25zWzBdLmVuYWJsZWQpIHtcblx0XHRcdGFjdGlvbnNbMF0ucnVuKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIHR5cGUgbGFiZWwgZm9yIHRoZSBjdXJyZW50IHNlY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGdldFR5cGVMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodGhpcy5jdXJyZW50U2VjdGlvbikge1xuXHRcdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHM6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnQnLCBcIkFnZW50XCIpO1xuXHRcdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHM6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2tpbGwnLCBcIlNraWxsXCIpO1xuXHRcdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnM6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zJywgXCJJbnN0cnVjdGlvbnNcIik7XG5cdFx0XHRjYXNlIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2hvb2snLCBcIkhvb2tcIik7XG5cdFx0XHRjYXNlIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHM6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdCcsIFwiUHJvbXB0XCIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBbm5vdW5jZXMgdGhlIGN1cnJlbnQgbnVtYmVyIG9mIGl0ZW1zIChhZnRlciBzZWFyY2ggZmlsdGVyaW5nKSB0b1xuXHQgKiBzY3JlZW4gcmVhZGVycyB2aWEgYW4gYXJpYSBzdGF0dXMgbWVzc2FnZS4gQ2FsbGVkIHdoZW4gdGhlIHNlY3Rpb25cblx0ICogaXMgbG9hZGVkIGFuZCBhZnRlciB0aGUgc2VhcmNoIGZpbHRlciBjaGFuZ2VzIHNvIGFzc2lzdGl2ZSB0ZWNobm9sb2d5XG5cdCAqIHVzZXJzIGhlYXIgdGhlIGNvdW50LCBpbmNsdWRpbmcgXCJubyByZXN1bHRzXCIuXG5cdCAqL1xuXHRwcml2YXRlIGFubm91bmNlSXRlbUNvdW50KGNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpc0ZpbHRlcmluZyA9IHRoaXMuc2VhcmNoUXVlcnkudHJpbSgpLmxlbmd0aCA+IDA7XG5cdFx0YXJpYS5zdGF0dXMoZ2V0Q291bnRBbm5vdW5jZW1lbnQodGhpcy5jdXJyZW50U2VjdGlvbiwgY291bnQsIGlzRmlsdGVyaW5nKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVmcmVzaGVzIHRoZSBjdXJyZW50IHNlY3Rpb24ncyBpdGVtcy5cblx0ICpcblx0ICogSXRlbSBkaXNjb3ZlcnkgaXMgb3duZWQgYnkgYElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsYC4gVGhpcyBtZXRob2Rcblx0ICogcHVsbHMgdGhlIGN1cnJlbnQgdmFsdWUgZnJvbSB0aGUgbW9kZWwgYW5kIHJlLXJlbmRlcnMuIENhbGxlcnMgZG8gbm90XG5cdCAqIG5lZWQgdG8gaW52b2tlIHRoaXMgaW4gcmVzcG9uc2UgdG8gZGF0YSBjaGFuZ2UgZXZlbnRzIFx1MjAxNCB0aGUgcGVyLXNlY3Rpb25cblx0ICogYXV0b3J1biBib3VuZCBpbiBgc2V0U2VjdGlvbmAgYWxyZWFkeSBkb2VzIHRoYXQuXG5cdCAqL1xuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuYXBwbHlJdGVtc0Zyb21Nb2RlbCgpO1xuXHRcdHRoaXMudXBkYXRlQWRkQnV0dG9uKCk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5SXRlbXNGcm9tTW9kZWwoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IHRvSXRlbXNNb2RlbFNlY3Rpb24odGhpcy5jdXJyZW50U2VjdGlvbik7XG5cdFx0dGhpcy5hbGxJdGVtcyA9IHNlY3Rpb24gPyB0aGlzLml0ZW1zTW9kZWwuZ2V0SXRlbXMoc2VjdGlvbikuZ2V0KCkgOiBbXTtcblx0XHR0aGlzLmZpbHRlckl0ZW1zKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJdGVtQ291bnQuZmlyZSh0aGlzLmFsbEl0ZW1zLmxlbmd0aCk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgdGhlIGl0ZW0gY291bnQgZm9yIGEgZ2l2ZW4gc2VjdGlvbiB3aXRob3V0IHVwZGF0aW5nIHRoZSBkaXNwbGF5LlxuXHQgKiBSZWFkcyBmcm9tIHRoZSBpdGVtcyBtb2RlbCBzbyB0aGUgY291bnQgaXMgY29uc2lzdGVudCB3aXRoIHdoYXQgdGhlXG5cdCAqIGVkaXRvciBhbmQgc2lkZWJhciByZW5kZXIuIFJldHVybnMgMCBmb3Igc2VjdGlvbnMgbm90IG1vZGVsZWQgaGVyZVxuXHQgKiAoTWNwU2VydmVycyAvIFBsdWdpbnMgLyBNb2RlbHMgXHUyMDE0IHRob3NlIGhhdmUgdGhlaXIgb3duIHNlcnZpY2VzKS5cblx0ICovXG5cdGNvbXB1dGVJdGVtQ291bnRGb3JTZWN0aW9uKHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCBtb2RlbFNlY3Rpb24gPSB0b0l0ZW1zTW9kZWxTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdHJldHVybiBtb2RlbFNlY3Rpb24gPyB0aGlzLml0ZW1zTW9kZWwuZ2V0Q291bnQobW9kZWxTZWN0aW9uKS5nZXQoKSA6IDA7XG5cdH1cblxuXHQvKipcblx0ICogRmlsdGVycyBpdGVtcyBiYXNlZCBvbiB0aGUgY3VycmVudCBzZWFyY2ggcXVlcnkgYW5kIGJ1aWxkcyBncm91cGVkIGRpc3BsYXkgZW50cmllcy5cblx0ICovXG5cdC8qKlxuXHQgKiBBcHBsaWVzIHRoZSBzZWFyY2ggcXVlcnkgdG8gaXRlbXMsIHJldHVybmluZyBtYXRjaGVkIGl0ZW1zIHdpdGggaGlnaGxpZ2h0IGluZm8uXG5cdCAqL1xuXHRwcml2YXRlIGFwcGx5U2VhcmNoRmlsdGVyKGl0ZW1zOiByZWFkb25seSBJQUlDdXN0b21pemF0aW9uTGlzdEl0ZW1bXSk6IElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbVtdIHtcblx0XHRpZiAoIXRoaXMuc2VhcmNoUXVlcnkudHJpbSgpKSB7XG5cdFx0XHRyZXR1cm4gaXRlbXMubWFwKGl0ZW0gPT4gKHsgLi4uaXRlbSwgbmFtZU1hdGNoZXM6IHVuZGVmaW5lZCwgZGVzY3JpcHRpb25NYXRjaGVzOiB1bmRlZmluZWQgfSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hRdWVyeS50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IG1hdGNoZWQ6IElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbVtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gaXRlbS5kaXNwbGF5TmFtZSA/PyBmb3JtYXREaXNwbGF5TmFtZShpdGVtLm5hbWUpO1xuXHRcdFx0Y29uc3QgbmFtZU1hdGNoZXMgPSBtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZyhxdWVyeSwgZGlzcGxheU5hbWUpO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25NYXRjaGVzID0gaXRlbS5kZXNjcmlwdGlvbiA/IG1hdGNoZXNDb250aWd1b3VzU3ViU3RyaW5nKHF1ZXJ5LCBpdGVtLmRlc2NyaXB0aW9uKSA6IG51bGw7XG5cdFx0XHRjb25zdCBmaWxlbmFtZU1hdGNoZXMgPSBtYXRjaGVzQ29udGlndW91c1N1YlN0cmluZyhxdWVyeSwgaXRlbS5maWxlbmFtZSk7XG5cdFx0XHRjb25zdCBiYWRnZU1hdGNoZXMgPSBpdGVtLmJhZGdlID8gbWF0Y2hlc0NvbnRpZ3VvdXNTdWJTdHJpbmcocXVlcnksIGl0ZW0uYmFkZ2UpIDogbnVsbDtcblxuXHRcdFx0aWYgKG5hbWVNYXRjaGVzIHx8IGRlc2NyaXB0aW9uTWF0Y2hlcyB8fCBmaWxlbmFtZU1hdGNoZXMgfHwgYmFkZ2VNYXRjaGVzKSB7XG5cdFx0XHRcdG1hdGNoZWQucHVzaCh7XG5cdFx0XHRcdFx0Li4uaXRlbSxcblx0XHRcdFx0XHRuYW1lTWF0Y2hlczogbmFtZU1hdGNoZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uTWF0Y2hlczogZGVzY3JpcHRpb25NYXRjaGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hdGNoZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIGdyb3VwZWQgZGlzcGxheSBlbnRyaWVzIGZyb20gaXRlbXMgYXNzaWduZWQgdG8gZ3JvdXBzLlxuXHQgKiBFbXB0eSBncm91cHMgYXJlIG9taXR0ZWQuIENvbGxhcHNlZCBncm91cHMgc2hvdyBvbmx5IHRoZWlyIGhlYWRlci5cblx0ICovXG5cdHByaXZhdGUgYnVpbGRHcm91cGVkRW50cmllcyhncm91cHM6IHsgZ3JvdXBLZXk6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgaWNvbjogVGhlbWVJY29uOyBkZXNjcmlwdGlvbjogc3RyaW5nOyBpdGVtczogSUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10gfVtdKTogdm9pZCB7XG5cdFx0Ly8gU29ydCBpdGVtcyB3aXRoaW4gZWFjaCBncm91cFxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRncm91cC5pdGVtcy5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKTtcblx0XHR9XG5cblx0XHR0aGlzLmRpc3BsYXlFbnRyaWVzID0gW107XG5cdFx0bGV0IGlzRmlyc3RHcm91cCA9IHRydWU7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGlmIChncm91cC5pdGVtcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhncm91cC5ncm91cEtleSk7XG5cblx0XHRcdHRoaXMuZGlzcGxheUVudHJpZXMucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdncm91cC1oZWFkZXInLFxuXHRcdFx0XHRpZDogYGdyb3VwLSR7Z3JvdXAuZ3JvdXBLZXl9YCxcblx0XHRcdFx0Z3JvdXBLZXk6IGdyb3VwLmdyb3VwS2V5LFxuXHRcdFx0XHRsYWJlbDogZ3JvdXAubGFiZWwsXG5cdFx0XHRcdGljb246IGdyb3VwLmljb24sXG5cdFx0XHRcdGNvdW50OiBncm91cC5pdGVtcy5sZW5ndGgsXG5cdFx0XHRcdGlzRmlyc3Q6IGlzRmlyc3RHcm91cCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGdyb3VwLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRjb2xsYXBzZWQsXG5cdFx0XHR9KTtcblx0XHRcdGlzRmlyc3RHcm91cCA9IGZhbHNlO1xuXG5cdFx0XHRpZiAoIWNvbGxhcHNlZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXAuaXRlbXMpIHtcblx0XHRcdFx0XHR0aGlzLmRpc3BsYXlFbnRyaWVzLnB1c2goeyB0eXBlOiAnZmlsZS1pdGVtJywgaXRlbSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21taXRzIHRoZSBjdXJyZW50IGRpc3BsYXlFbnRyaWVzIHRvIHRoZSBsaXN0IGFuZCB1cGRhdGVzIGVtcHR5IHN0YXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBjb21taXREaXNwbGF5RW50cmllcygpOiB2b2lkIHtcblx0XHR0aGlzLmxpc3Quc3BsaWNlKDAsIHRoaXMubGlzdC5sZW5ndGgsIHRoaXMuZGlzcGxheUVudHJpZXMpO1xuXHRcdHRoaXMudXBkYXRlRW1wdHlTdGF0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdyb3VwcyBub3JtYWxpemVkIGxpc3QgaXRlbXMgZm9yIGRpc3BsYXkuXG5cdCAqIEdyb3VwcyBpdGVtcyBieSBub3JtYWxpemVkIHN0b3JhZ2UvZ3JvdXBLZXkuXG5cdCAqL1xuXHRwcml2YXRlIGdyb3VwTWF0Y2hlZEl0ZW1zKG1hdGNoZWRJdGVtczogSUFJQ3VzdG9taXphdGlvbkxpc3RJdGVtW10pOiB2b2lkIHtcblx0XHQvLyBTdGFuZGFyZCBwcm92aWRlciBsYXlvdXQ6IGdyb3VwIGJ5IGluZmVycmVkIHN0b3JhZ2UvZ3JvdXBLZXkuXG5cdFx0Ly8gSW5zdHJ1Y3Rpb25zIHVzZSBzZW1hbnRpYyBjYXRlZ29yaWVzIChtYXRjaGluZyBjb3JlIHBhdGgpIHNvXG5cdFx0Ly8gdGhhdCBwcm92aWRlci1zdXBwbGllZCBncm91cEtleXMgbGlrZSAnY29udGV4dC1pbnN0cnVjdGlvbnMnXG5cdFx0Ly8gYXJlIHJvdXRlZCB0byB0aGUgY29ycmVjdCBjb2xsYXBzaWJsZSBoZWFkZXIuXG5cdFx0Y29uc3QgZ3JvdXBzOiB7IGdyb3VwS2V5OiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGljb246IFRoZW1lSWNvbjsgZGVzY3JpcHRpb246IHN0cmluZzsgaXRlbXM6IElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbVtdIH1bXSA9XG5cdFx0XHR0aGlzLmN1cnJlbnRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnNcblx0XHRcdFx0PyBbXG5cdFx0XHRcdFx0eyBncm91cEtleTogJ2FnZW50LWluc3RydWN0aW9ucycsIGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRJbnN0cnVjdGlvbnNHcm91cCcsIFwiQWdlbnQgSW5zdHJ1Y3Rpb25zXCIpLCBpY29uOiBpbnN0cnVjdGlvbnNJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SW5zdHJ1Y3Rpb25zR3JvdXBEZXNjcmlwdGlvbicsIFwiSW5zdHJ1Y3Rpb24gZmlsZXMgYXV0b21hdGljYWxseSBsb2FkZWQgZm9yIGFsbCBhZ2VudCBpbnRlcmFjdGlvbnMgKGUuZy4gQUdFTlRTLm1kLCBDTEFVREUubWQsIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kKS5cIiksIGl0ZW1zOiBbXSB9LFxuXHRcdFx0XHRcdHsgZ3JvdXBLZXk6ICdjb250ZXh0LWluc3RydWN0aW9ucycsIGxhYmVsOiBsb2NhbGl6ZSgnY29udGV4dEluc3RydWN0aW9uc0dyb3VwJywgXCJJbmNsdWRlZCBCYXNlZCBvbiBDb250ZXh0XCIpLCBpY29uOiBpbnN0cnVjdGlvbnNJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbnRleHRJbnN0cnVjdGlvbnNHcm91cERlc2NyaXB0aW9uJywgXCJJbnN0cnVjdGlvbnMgYXV0b21hdGljYWxseSBsb2FkZWQgd2hlbiBtYXRjaGluZyBmaWxlcyBhcmUgcGFydCBvZiB0aGUgY29udGV4dC5cIiksIGl0ZW1zOiBbXSB9LFxuXHRcdFx0XHRcdHsgZ3JvdXBLZXk6ICdvbi1kZW1hbmQtaW5zdHJ1Y3Rpb25zJywgbGFiZWw6IGxvY2FsaXplKCdvbkRlbWFuZEluc3RydWN0aW9uc0dyb3VwJywgXCJMb2FkZWQgb24gRGVtYW5kXCIpLCBpY29uOiBpbnN0cnVjdGlvbnNJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ29uRGVtYW5kSW5zdHJ1Y3Rpb25zR3JvdXBEZXNjcmlwdGlvbicsIFwiSW5zdHJ1Y3Rpb25zIGxvYWRlZCBvbmx5IHdoZW4gZXhwbGljaXRseSByZWZlcmVuY2VkLlwiKSwgaXRlbXM6IFtdIH0sXG5cdFx0XHRcdFx0eyBncm91cEtleTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIGxhYmVsOiBsb2NhbGl6ZSgnd29ya3NwYWNlR3JvdXAnLCBcIldvcmtzcGFjZVwiKSwgaWNvbjogd29ya3NwYWNlSWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3Jrc3BhY2VHcm91cERlc2NyaXB0aW9uJywgXCJDdXN0b21pemF0aW9ucyBzdG9yZWQgYXMgZmlsZXMgaW4geW91ciBwcm9qZWN0IGZvbGRlciBhbmQgc2hhcmVkIHdpdGggeW91ciB0ZWFtIHZpYSB2ZXJzaW9uIGNvbnRyb2wuXCIpLCBpdGVtczogW10gfSxcblx0XHRcdFx0XHR7IGdyb3VwS2V5OiBQcm9tcHRzU3RvcmFnZS51c2VyLCBsYWJlbDogbG9jYWxpemUoJ3VzZXJHcm91cCcsIFwiVXNlclwiKSwgaWNvbjogdXNlckljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndXNlckdyb3VwRGVzY3JpcHRpb24nLCBcIkN1c3RvbWl6YXRpb25zIHN0b3JlZCBsb2NhbGx5IG9uIHlvdXIgbWFjaGluZSBpbiBhIGNlbnRyYWwgbG9jYXRpb24uIFByaXZhdGUgdG8geW91IGFuZCBhdmFpbGFibGUgYWNyb3NzIGFsbCBwcm9qZWN0cy5cIiksIGl0ZW1zOiBbXSB9LFxuXHRcdFx0XHRcdHsgZ3JvdXBLZXk6IFByb21wdHNTdG9yYWdlLnBsdWdpbiwgbGFiZWw6IGxvY2FsaXplKCdwbHVnaW5Hcm91cCcsIFwiUGx1Z2luc1wiKSwgaWNvbjogcGx1Z2luSWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdwbHVnaW5Hcm91cERlc2NyaXB0aW9uJywgXCJSZWFkLW9ubHkgY3VzdG9taXphdGlvbnMgcHJvdmlkZWQgYnkgaW5zdGFsbGVkIHBsdWdpbnMuXCIpLCBpdGVtczogW10gfSxcblx0XHRcdFx0XHR7IGdyb3VwS2V5OiBQcm9tcHRzU3RvcmFnZS5idWlsdEluLCBsYWJlbDogbG9jYWxpemUoJ2J1aWx0aW5Hcm91cCcsIFwiQnVpbHQtaW5cIiksIGljb246IGJ1aWx0aW5JY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2J1aWx0aW5Hcm91cERlc2NyaXB0aW9uJywgXCJCdWlsdC1pbiBjdXN0b21pemF0aW9ucyBzaGlwcGVkIHdpdGggdGhlIGFwcGxpY2F0aW9uLlwiKSwgaXRlbXM6IFtdIH0sXG5cdFx0XHRcdF1cblx0XHRcdFx0OiBbXG5cdFx0XHRcdFx0eyBncm91cEtleTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIGxhYmVsOiBsb2NhbGl6ZSgnd29ya3NwYWNlR3JvdXAnLCBcIldvcmtzcGFjZVwiKSwgaWNvbjogd29ya3NwYWNlSWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3Jrc3BhY2VHcm91cERlc2NyaXB0aW9uJywgXCJDdXN0b21pemF0aW9ucyBzdG9yZWQgYXMgZmlsZXMgaW4geW91ciBwcm9qZWN0IGZvbGRlciBhbmQgc2hhcmVkIHdpdGggeW91ciB0ZWFtIHZpYSB2ZXJzaW9uIGNvbnRyb2wuXCIpLCBpdGVtczogW10gfSxcblx0XHRcdFx0XHR7IGdyb3VwS2V5OiBQcm9tcHRzU3RvcmFnZS51c2VyLCBsYWJlbDogbG9jYWxpemUoJ3VzZXJHcm91cCcsIFwiVXNlclwiKSwgaWNvbjogdXNlckljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndXNlckdyb3VwRGVzY3JpcHRpb24nLCBcIkN1c3RvbWl6YXRpb25zIHN0b3JlZCBsb2NhbGx5IG9uIHlvdXIgbWFjaGluZSBpbiBhIGNlbnRyYWwgbG9jYXRpb24uIFByaXZhdGUgdG8geW91IGFuZCBhdmFpbGFibGUgYWNyb3NzIGFsbCBwcm9qZWN0cy5cIiksIGl0ZW1zOiBbXSB9LFxuXHRcdFx0XHRcdHsgZ3JvdXBLZXk6IFByb21wdHNTdG9yYWdlLnBsdWdpbiwgbGFiZWw6IGxvY2FsaXplKCdwbHVnaW5Hcm91cCcsIFwiUGx1Z2luc1wiKSwgaWNvbjogcGx1Z2luSWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdwbHVnaW5Hcm91cERlc2NyaXB0aW9uJywgXCJSZWFkLW9ubHkgY3VzdG9taXphdGlvbnMgcHJvdmlkZWQgYnkgaW5zdGFsbGVkIHBsdWdpbnMuXCIpLCBpdGVtczogW10gfSxcblx0XHRcdFx0XHR7IGdyb3VwS2V5OiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGxhYmVsOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uR3JvdXAnLCBcIkV4dGVuc2lvbnNcIiksIGljb246IGV4dGVuc2lvbkljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXh0ZW5zaW9uR3JvdXBEZXNjcmlwdGlvbicsIFwiUmVhZC1vbmx5IGN1c3RvbWl6YXRpb25zIHByb3ZpZGVkIGJ5IGluc3RhbGxlZCBleHRlbnNpb25zLlwiKSwgaXRlbXM6IFtdIH0sXG5cdFx0XHRcdFx0eyBncm91cEtleTogUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbiwgbGFiZWw6IGxvY2FsaXplKCdidWlsdGluR3JvdXAnLCBcIkJ1aWx0LWluXCIpLCBpY29uOiBidWlsdGluSWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdidWlsdGluR3JvdXBEZXNjcmlwdGlvbicsIFwiQnVpbHQtaW4gY3VzdG9taXphdGlvbnMgc2hpcHBlZCB3aXRoIHRoZSBhcHBsaWNhdGlvbi5cIiksIGl0ZW1zOiBbXSB9LFxuXHRcdFx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIG1hdGNoZWRJdGVtcykge1xuXHRcdFx0Y29uc3Qga2V5ID0gaXRlbS5ncm91cEtleSA/PyBpdGVtLnNvdXJjZSA/PyBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmxvY2FsO1xuXHRcdFx0bGV0IGdyb3VwID0gZ3JvdXBzLmZpbmQoZyA9PiBnLmdyb3VwS2V5ID09PSBrZXkpO1xuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHQvLyBEeW5hbWljYWxseSBjcmVhdGUgYSBncm91cCBmb3IgdW5rbm93biBncm91cEtleXMgZnJvbSBwcm92aWRlcnNcblx0XHRcdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cdFx0XHRcdFx0Y2FzZSAncmVtb3RlLWhvc3QnOlxuXHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgncmVtb3RlSG9zdEdyb3VwU2hvcnQnLCBcIlJlbW90ZVwiKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3JlbW90ZS1jbGllbnQnOlxuXHRcdFx0XHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgncmVtb3RlQ2xpZW50R3JvdXBTaG9ydCcsIFwiTG9jYWxcIik7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0bGFiZWwgPSBmb3JtYXREaXNwbGF5TmFtZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyb3VwID0geyBncm91cEtleToga2V5LCBsYWJlbCwgaWNvbjogQ29kaWNvbi5mb2xkZXIsIGRlc2NyaXB0aW9uOiAnJywgaXRlbXM6IFtdIH07XG5cdFx0XHRcdC8vIEluc2VydCBkeW5hbWljIGdyb3VwcyBiZWZvcmUgdGhlIGJ1aWx0LWluIGdyb3VwIHNvIGl0IGFsd2F5cyBzdGF5cyBsYXN0LlxuXHRcdFx0XHRjb25zdCBidWlsdGluSWR4ID0gZ3JvdXBzLmZpbmRJbmRleChnID0+IGcuZ3JvdXBLZXkgPT09IFByb21wdHNTdG9yYWdlLmJ1aWx0SW4pO1xuXHRcdFx0XHRpZiAoYnVpbHRpbklkeCA+PSAwKSB7XG5cdFx0XHRcdFx0Z3JvdXBzLnNwbGljZShidWlsdGluSWR4LCAwLCBncm91cCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Z3JvdXBzLnB1c2goZ3JvdXApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRncm91cC5pdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdH1cblxuXHRcdHRoaXMuYnVpbGRHcm91cGVkRW50cmllcyhncm91cHMpO1xuXG5cdFx0dGhpcy5jb21taXREaXNwbGF5RW50cmllcygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbHRlcnMgaXRlbXMgYmFzZWQgb24gdGhlIGN1cnJlbnQgc2VhcmNoIHF1ZXJ5IGFuZCBidWlsZHMgZ3JvdXBlZCBkaXNwbGF5IGVudHJpZXMuXG5cdCAqL1xuXHRwcml2YXRlIGZpbHRlckl0ZW1zKCk6IG51bWJlciB7XG5cdFx0Y29uc3QgbWF0Y2hlZEl0ZW1zID0gdGhpcy5hcHBseVNlYXJjaEZpbHRlcih0aGlzLmFsbEl0ZW1zKTtcblx0XHR0aGlzLmdyb3VwTWF0Y2hlZEl0ZW1zKG1hdGNoZWRJdGVtcyk7XG5cblx0XHRyZXR1cm4gbWF0Y2hlZEl0ZW1zLmxlbmd0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSBjb2xsYXBzZWQgc3RhdGUgb2YgYSBncm91cC5cblx0ICovXG5cdHByaXZhdGUgdG9nZ2xlR3JvdXAoZW50cnk6IElHcm91cEhlYWRlckVudHJ5KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29sbGFwc2VkR3JvdXBzLmhhcyhlbnRyeS5ncm91cEtleSkpIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmRlbGV0ZShlbnRyeS5ncm91cEtleSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuY29sbGFwc2VkR3JvdXBzLmFkZChlbnRyeS5ncm91cEtleSk7XG5cdFx0fVxuXHRcdHRoaXMuZmlsdGVySXRlbXMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRW1wdHlTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBoYXNJdGVtcyA9IHRoaXMuZGlzcGxheUVudHJpZXMubGVuZ3RoID4gMDtcblx0XHRpZiAoIWhhc0l0ZW1zKSB7XG5cdFx0XHR0aGlzLmVtcHR5U3RhdGVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdmbGV4Jztcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hRdWVyeS50cmltKCkpIHtcblx0XHRcdFx0Ly8gU2VhcmNoIHdpdGggbm8gcmVzdWx0c1xuXHRcdFx0XHR0aGlzLmVtcHR5U3RhdGVUZXh0LnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vTWF0Y2hpbmdJdGVtcycsIFwiTm8gaXRlbXMgbWF0Y2ggJ3swfSdcIiwgdGhpcy5zZWFyY2hRdWVyeSk7XG5cdFx0XHRcdHRoaXMuZW1wdHlTdGF0ZVN1YnRleHQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndHJ5RGlmZmVyZW50U2VhcmNoJywgXCJUcnkgYSBkaWZmZXJlbnQgc2VhcmNoIHRlcm1cIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBObyBpdGVtcyBhdCBhbGwgLSBzaG93IGVtcHR5IHN0YXRlIHdpdGggY3JlYXRlIGhpbnRcblx0XHRcdFx0Y29uc3QgZW1wdHlJbmZvID0gdGhpcy5nZXRFbXB0eVN0YXRlSW5mbygpO1xuXHRcdFx0XHR0aGlzLmVtcHR5U3RhdGVUZXh0LnRleHRDb250ZW50ID0gZW1wdHlJbmZvLnRpdGxlO1xuXHRcdFx0XHR0aGlzLmVtcHR5U3RhdGVTdWJ0ZXh0LnRleHRDb250ZW50ID0gZW1wdHlJbmZvLmRlc2NyaXB0aW9uO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVtcHR5U3RhdGVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRFbXB0eVN0YXRlSW5mbygpOiB7IHRpdGxlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfSB7XG5cdFx0c3dpdGNoICh0aGlzLmN1cnJlbnRTZWN0aW9uKSB7XG5cdFx0XHRjYXNlIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50czpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vQWdlbnRzJywgXCJObyBhZ2VudHMgeWV0XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY3JlYXRlRmlyc3RBZ2VudCcsIFwiQ3JlYXRlIHlvdXIgZmlyc3QgY3VzdG9tIGFnZW50IHRvIGdldCBzdGFydGVkXCIpLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHM6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub1NraWxscycsIFwiTm8gc2tpbGxzIHlldFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NyZWF0ZUZpcnN0U2tpbGwnLCBcIkNyZWF0ZSB5b3VyIGZpcnN0IHNraWxsIHRvIGV4dGVuZCBhZ2VudCBjYXBhYmlsaXRpZXNcIiksXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9uczpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vSW5zdHJ1Y3Rpb25zJywgXCJObyBpbnN0cnVjdGlvbnMgeWV0XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY3JlYXRlRmlyc3RJbnN0cnVjdGlvbnMnLCBcIkFkZCBpbnN0cnVjdGlvbnMgdG8gdGVhY2ggQ29waWxvdCBhYm91dCB5b3VyIGNvZGViYXNlXCIpLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rczpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vSG9va3MnLCBcIk5vIGhvb2tzIHlldFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NyZWF0ZUZpcnN0SG9vaycsIFwiQ3JlYXRlIGhvb2tzIHRvIGV4ZWN1dGUgY29tbWFuZHMgYXQgYWdlbnQgbGlmZWN5Y2xlIGV2ZW50c1wiKSxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0czpcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub1Byb21wdHMnLCBcIk5vIHByb21wdHMgeWV0XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY3JlYXRlRmlyc3RQcm9tcHQnLCBcIkNyZWF0ZSByZXVzYWJsZSBwcm9tcHRzIGZvciBjb21tb24gdGFza3NcIiksXG5cdFx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIHNlYXJjaCBxdWVyeSBwcm9ncmFtbWF0aWNhbGx5LlxuXHQgKi9cblx0c2V0U2VhcmNoUXVlcnkocXVlcnk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQudmFsdWUgPSBxdWVyeTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhcnMgdGhlIHNlYXJjaCBxdWVyeS5cblx0ICovXG5cdGNsZWFyU2VhcmNoKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoSW5wdXQudmFsdWUgPSAnJztcblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBzZWFyY2ggaW5wdXQuXG5cdCAqL1xuXHRmb2N1c1NlYXJjaCgpOiB2b2lkIHtcblx0XHR0aGlzLnNlYXJjaElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgbGlzdC5cblx0ICovXG5cdGZvY3VzTGlzdCgpOiB2b2lkIHtcblx0XHR0aGlzLmxpc3QuZG9tRm9jdXMoKTtcblx0XHRpZiAodGhpcy5kaXNwbGF5RW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoWzBdKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2Nyb2xscyB0aGUgbGlzdCBzbyB0aGUgbGFzdCBpdGVtIGlzIHZpc2libGUuXG5cdCAqL1xuXHRyZXZlYWxMYXN0SXRlbSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5kaXNwbGF5RW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmxpc3QucmV2ZWFsKHRoaXMuZGlzcGxheUVudHJpZXMubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldmVhbHMgYW5kIHNlbGVjdHMgdGhlIGZpcnN0IGxpc3QgaXRlbSB3aG9zZSBVUkkgbWF0Y2hlcyBvbmUgb2YgdGhlIHByb3ZpZGVkIFVSSXMuXG5cdCAqL1xuXHRyZXZlYWxBbmRTZWxlY3RGaXJzdEl0ZW1CeVVyaSh1cmlzOiByZWFkb25seSBVUklbXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVudHJ5SW5kZXggPSB0aGlzLmRpc3BsYXlFbnRyaWVzLmZpbmRJbmRleChlbnRyeSA9PiB7XG5cdFx0XHRyZXR1cm4gZW50cnkudHlwZSA9PT0gJ2ZpbGUtaXRlbScgJiYgdXJpcy5zb21lKHVyaSA9PiBpc0VxdWFsKGVudHJ5Lml0ZW0udXJpLCB1cmkpKTtcblx0XHR9KTtcblx0XHRpZiAoZW50cnlJbmRleCA8IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLmxpc3QucmV2ZWFsKGVudHJ5SW5kZXgpO1xuXHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbZW50cnlJbmRleF0pO1xuXHRcdHRoaXMubGlzdC5zZXRTZWxlY3Rpb24oW2VudHJ5SW5kZXhdKTtcblx0XHR0aGlzLmxpc3QuZG9tRm9jdXMoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXRzIHRoZSB3aWRnZXQuXG5cdCAqL1xuXHRsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmxhc3RMYXlvdXRIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5sYXN0TGF5b3V0V2lkdGggPSB3aWR0aDtcblx0XHQvLyBVc2UgdGhlIENTUy1jb21wdXRlZCBoZWlnaHQgd2l0aGluIHRoZSBwYWRkZWQgcGFyZW50LlxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHR0aGlzLnNlYXJjaElucHV0LmxheW91dCgpO1xuXG5cdFx0Ly8gTWVhc3VyZSBzaWJsaW5nIGVsZW1lbnRzIHRvIGNhbGN1bGF0ZSB0aGUgcmVtYWluaW5nIHNwYWNlIGZvciB0aGUgbGlzdC5cblx0XHQvLyBXaGVuIG9mZnNldEhlaWdodCByZXR1cm5zIDAgdGhlIGNvbnRhaW5lciBtYXkgaGF2ZSBqdXN0IGJlY29tZSB2aXNpYmxlXG5cdFx0Ly8gYWZ0ZXIgZGlzcGxheTpub25lIGFuZCB0aGUgYnJvd3NlciBoYXNuJ3QgcmVmbG93ZWQgeWV0IFx1MjAxNCBkZWZlciBsYXlvdXRcblx0XHQvLyBvbmNlIHNvIG1lYXN1cmVtZW50cyBhcmUgYWNjdXJhdGUuIE9ubHkgcmV0cnkgb25jZSB0byBhdm9pZCBhbiBlbmRsZXNzXG5cdFx0Ly8gbG9vcCB3aGVuIHRoZSB3aWRnZXQgaXMgY3JlYXRlZCB3aGlsZSBwZXJtYW5lbnRseSBoaWRkZW4uXG5cdFx0Y29uc3Qgc2VhcmNoQmFySGVpZ2h0ID0gdGhpcy5zZWFyY2hBbmRCdXR0b25Db250YWluZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdGlmIChzZWFyY2hCYXJIZWlnaHQgPT09IDAgJiYgIXRoaXMuX2xheW91dERlZmVycmVkKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXREZWZlcnJlZCA9IHRydWU7XG5cdFx0XHRET00uZ2V0V2luZG93KHRoaXMuZWxlbWVudCkucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR0aGlzLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXREZWZlcnJlZCA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGVhZGVySGVpZ2h0ID0gdGhpcy5zZWN0aW9uVGl0bGVIZWFkZXIub2Zmc2V0SGVpZ2h0O1xuXHRcdHRoaXMubGFzdEhlYWRlckhlaWdodCA9IGhlYWRlckhlaWdodDtcblx0XHRjb25zdCBhdmFpbGFibGVIZWlnaHQgPSB0aGlzLmVsZW1lbnQuY2xpZW50SGVpZ2h0IHx8IGhlaWdodDtcblx0XHRjb25zdCBsaXN0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgYXZhaWxhYmxlSGVpZ2h0IC0gc2VhcmNoQmFySGVpZ2h0IC0gaGVhZGVySGVpZ2h0KTtcblxuXHRcdHRoaXMubGlzdENvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtsaXN0SGVpZ2h0fXB4YDtcblx0XHR0aGlzLmxpc3QubGF5b3V0KGxpc3RIZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSB0b3RhbCBpdGVtIGNvdW50IChiZWZvcmUgZmlsdGVyaW5nKS5cblx0ICovXG5cdGdldCBpdGVtQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5hbGxJdGVtcy5sZW5ndGg7XG5cdH1cblxuXHQvKipcblx0ICogR2VuZXJhdGVzIGEgZGVidWcgcmVwb3J0IGZvciB0aGUgY3VycmVudCBzZWN0aW9uLlxuXHQgKi9cblx0YXN5bmMgZ2VuZXJhdGVEZWJ1Z1JlcG9ydCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiBnZW5lcmF0ZUN1c3RvbWl6YXRpb25EZWJ1Z1JlcG9ydChcblx0XHRcdHRoaXMuY3VycmVudFNlY3Rpb24sXG5cdFx0XHR0aGlzLnByb21wdHNTZXJ2aWNlLFxuXHRcdFx0dGhpcy53b3Jrc3BhY2VTZXJ2aWNlLFxuXHRcdFx0eyBhbGxJdGVtczogdGhpcy5hbGxJdGVtcywgZGlzcGxheUVudHJpZXM6IHRoaXMuZGlzcGxheUVudHJpZXMgfSxcblx0XHRcdHRoaXMuaXRlbXNNb2RlbC5nZXRBY3RpdmVJdGVtU291cmNlKCksXG5cdFx0XHR0aGlzLmhhcm5lc3NTZXJ2aWNlLFxuXHRcdFx0dGhpcy5hZ2VudFBsdWdpblNlcnZpY2UsXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7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
