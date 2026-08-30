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
import "./media/aiCustomizationTreeView.css";
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { basename, dirname } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import { createActionViewItem, getContextMenuActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ViewPane } from "../../../../workbench/browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../../workbench/common/views.js";
import { IPromptsService, PromptsStorage } from "../../../../workbench/contrib/chat/common/promptSyntax/service/promptsService.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { PromptsType } from "../../../../workbench/contrib/chat/common/promptSyntax/promptTypes.js";
import { agentIcon, extensionIcon, instructionsIcon, mcpServerIcon, pluginIcon, promptIcon, skillIcon, userIcon, workspaceIcon, builtinIcon } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js";
import { AICustomizationItemMenuId } from "./aiCustomizationTreeView.js";
import { AICustomizationManagementSection } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { AICustomizationManagementEditorInput } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js";
import { AICustomizationManagementEditor } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { AICustomizationSources, IAICustomizationWorkspaceService } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
const AICustomizationIsEmptyContextKey = new RawContextKey("aiCustomization.isEmpty", true);
const AICustomizationItemTypeContextKey = new RawContextKey("aiCustomizationItemType", "");
const AICustomizationItemDisabledContextKey = new RawContextKey("aiCustomizationItemDisabled", false);
const AICustomizationItemStorageContextKey = new RawContextKey("aiCustomizationItemStorage", "");
const ROOT_ELEMENT = /* @__PURE__ */ Symbol("root");
class AICustomizationTreeDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(element) {
    switch (element.type) {
      case "category":
      case "link":
        return "category";
      case "group":
        return "group";
      case "file":
        return "file";
    }
  }
}
class AICustomizationCategoryRenderer {
  constructor() {
    this.templateId = "category";
  }
  renderTemplate(container) {
    const element = dom.append(container, dom.$(".ai-customization-category"));
    const icon = dom.append(element, dom.$(".icon"));
    const label = dom.append(element, dom.$(".label"));
    return { container: element, icon, label };
  }
  renderElement(node, _index, templateData) {
    templateData.icon.className = "icon";
    templateData.icon.classList.add(...ThemeIcon.asClassNameArray(node.element.icon));
    templateData.label.textContent = node.element.label;
  }
  disposeTemplate(_templateData) {
  }
}
class AICustomizationGroupRenderer {
  constructor() {
    this.templateId = "group";
  }
  renderTemplate(container) {
    const element = dom.append(container, dom.$(".ai-customization-group-header"));
    const label = dom.append(element, dom.$(".label"));
    return { container: element, label };
  }
  renderElement(node, _index, templateData) {
    templateData.label.textContent = node.element.label;
  }
  disposeTemplate(_templateData) {
  }
}
class AICustomizationFileRenderer {
  constructor(menuService, contextKeyService, instantiationService) {
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.templateId = "file";
  }
  renderTemplate(container) {
    const element = dom.append(container, dom.$(".ai-customization-tree-item"));
    const icon = dom.append(element, dom.$(".icon"));
    const name = dom.append(element, dom.$(".name"));
    const actionsContainer = dom.append(element, dom.$(".actions"));
    const templateDisposables = new DisposableStore();
    const actionBar = templateDisposables.add(new ActionBar(actionsContainer, {
      actionViewItemProvider: createActionViewItem.bind(void 0, this.instantiationService)
    }));
    return { container: element, icon, name, actionBar, elementDisposables: new DisposableStore(), templateDisposables };
  }
  renderElement(node, _index, templateData) {
    const item = node.element;
    templateData.elementDisposables.clear();
    let icon;
    switch (item.promptType) {
      case PromptsType.agent:
        icon = agentIcon;
        break;
      case PromptsType.skill:
        icon = skillIcon;
        break;
      case PromptsType.instructions:
        icon = instructionsIcon;
        break;
      case PromptsType.prompt:
      default:
        icon = promptIcon;
        break;
    }
    templateData.icon.className = "icon";
    templateData.icon.classList.add(...ThemeIcon.asClassNameArray(icon));
    templateData.name.textContent = item.name;
    templateData.container.classList.toggle("disabled", item.disabled);
    const tooltip = item.description ? `${item.name} - ${item.description}` : item.name;
    templateData.container.title = tooltip;
    const context = {
      uri: item.uri.toString(),
      name: item.name,
      promptType: item.promptType,
      storage: item.storage
    };
    const overlay = this.contextKeyService.createOverlay([
      [AICustomizationItemTypeContextKey.key, item.promptType],
      [AICustomizationItemDisabledContextKey.key, item.disabled],
      [AICustomizationItemStorageContextKey.key, item.storage]
    ]);
    const menu = templateData.elementDisposables.add(
      this.menuService.createMenu(AICustomizationItemMenuId, overlay)
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
  disposeElement(_node, _index, templateData) {
    templateData.elementDisposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
    templateData.elementDisposables.dispose();
  }
}
class UnifiedAICustomizationDataSource {
  constructor(promptsService, logService, onItemCountChanged) {
    this.promptsService = promptsService;
    this.logService = logService;
    this.onItemCountChanged = onItemCountChanged;
    this.cache = /* @__PURE__ */ new Map();
    this.totalItemCount = 0;
  }
  /**
   * Clears the cache. Should be called when the view refreshes.
   */
  clearCache() {
    this.cache.clear();
    this.totalItemCount = 0;
  }
  hasChildren(element) {
    if (element === ROOT_ELEMENT) {
      return true;
    }
    if (element.type === "link") {
      return false;
    }
    return element.type === "category" || element.type === "group";
  }
  async getChildren(element) {
    try {
      if (element === ROOT_ELEMENT) {
        return this.getTypeCategories();
      }
      if (element.type === "category") {
        return this.getStorageGroups(element.promptType);
      }
      if (element.type === "group") {
        return this.getFilesForStorageAndType(element.storage, element.promptType);
      }
      return [];
    } catch (error) {
      this.logService.error("[AICustomization] Error fetching tree children:", error);
      return [];
    }
  }
  getTypeCategories() {
    const items = [
      {
        type: "category",
        id: "category-agents",
        label: localize("customAgents", "Custom Agents"),
        promptType: PromptsType.agent,
        icon: agentIcon
      },
      {
        type: "category",
        id: "category-skills",
        label: localize("skills", "Skills"),
        promptType: PromptsType.skill,
        icon: skillIcon
      },
      {
        type: "category",
        id: "category-instructions",
        label: localize("instructions", "Instructions"),
        promptType: PromptsType.instructions,
        icon: instructionsIcon
      }
    ];
    items.push(
      {
        type: "link",
        id: "link-mcp-servers",
        label: localize("mcpServers", "MCP Servers"),
        icon: mcpServerIcon,
        section: AICustomizationManagementSection.McpServers
      }
    );
    return items;
  }
  /**
   * Fetches and caches data for a prompt type, returning storage groups with items.
   */
  async getStorageGroups(promptType) {
    const groups = [];
    let cached = this.cache.get(promptType);
    if (!cached) {
      cached = {};
      this.cache.set(promptType, cached);
    }
    if (promptType === PromptsType.skill) {
      if (!cached.skills) {
        const skills = await this.promptsService.findAgentSkills(CancellationToken.None);
        cached.skills = skills || [];
        this.totalItemCount += cached.skills.length;
        this.onItemCountChanged(this.totalItemCount);
      }
      const workspaceSkills = cached.skills.filter((s) => s.storage === PromptsStorage.local);
      const userSkills = cached.skills.filter((s) => s.storage === PromptsStorage.user);
      const extensionSkills = cached.skills.filter((s) => s.storage === PromptsStorage.extension);
      const builtinSkills = cached.skills.filter((s) => s.storage === PromptsStorage.builtIn);
      if (workspaceSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.local, workspaceSkills.length));
      }
      if (userSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.user, userSkills.length));
      }
      if (extensionSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.extension, extensionSkills.length));
      }
      if (builtinSkills.length > 0) {
        groups.push(this.createGroupItem(promptType, AICustomizationSources.builtin, builtinSkills.length));
      }
      return groups;
    }
    if (!cached.files) {
      const allItems = [...await this.promptsService.listPromptFiles(promptType, CancellationToken.None)];
      if (promptType === PromptsType.instructions) {
        const existingUris = new ResourceSet(allItems.map((item) => item.uri));
        const agentInstructions = await this.promptsService.listAgentInstructions(CancellationToken.None);
        for (const file of agentInstructions) {
          if (!existingUris.has(file.uri)) {
            allItems.push({ uri: file.uri, storage: PromptsStorage.local, type: PromptsType.instructions });
          }
        }
      }
      const workspaceItems2 = allItems.filter((item) => item.storage === PromptsStorage.local);
      const userItems2 = allItems.filter((item) => item.storage === PromptsStorage.user);
      const extensionItems2 = allItems.filter((item) => item.storage === PromptsStorage.extension);
      const builtinItems2 = allItems.filter((item) => item.storage === PromptsStorage.builtIn);
      cached.files = /* @__PURE__ */ new Map([
        [PromptsStorage.local, workspaceItems2],
        [PromptsStorage.user, userItems2],
        [PromptsStorage.extension, extensionItems2],
        [PromptsStorage.builtIn, builtinItems2]
      ]);
      const itemCount = allItems.length;
      this.totalItemCount += itemCount;
      this.onItemCountChanged(this.totalItemCount);
    }
    const workspaceItems = cached.files.get(PromptsStorage.local) || [];
    const userItems = cached.files.get(PromptsStorage.user) || [];
    const extensionItems = cached.files.get(PromptsStorage.extension) || [];
    const builtinItems = cached.files.get(PromptsStorage.builtIn) || [];
    if (workspaceItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.local, workspaceItems.length));
    }
    if (userItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.user, userItems.length));
    }
    if (extensionItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.extension, extensionItems.length));
    }
    if (builtinItems.length > 0) {
      groups.push(this.createGroupItem(promptType, PromptsStorage.builtIn, builtinItems.length));
    }
    return groups;
  }
  /**
   * Creates a group item with consistent structure.
   */
  createGroupItem(promptType, storage, count) {
    const storageLabels = {
      [AICustomizationSources.local]: localize("workspaceWithCount", "Workspace ({0})", count),
      [AICustomizationSources.user]: localize("userWithCount", "User ({0})", count),
      [AICustomizationSources.extension]: localize("extensionsWithCount", "Extensions ({0})", count),
      [AICustomizationSources.plugin]: localize("pluginsWithCount", "Plugins ({0})", count),
      [AICustomizationSources.builtin]: localize("builtinWithCount", "Built-in ({0})", count)
    };
    const storageIcons = {
      [AICustomizationSources.local]: workspaceIcon,
      [AICustomizationSources.user]: userIcon,
      [AICustomizationSources.extension]: extensionIcon,
      [AICustomizationSources.plugin]: pluginIcon,
      [AICustomizationSources.builtin]: builtinIcon
    };
    const storageSuffixes = {
      [AICustomizationSources.local]: "workspace",
      [AICustomizationSources.user]: "user",
      [AICustomizationSources.extension]: "extensions",
      [AICustomizationSources.plugin]: "plugins",
      [AICustomizationSources.builtin]: "builtin"
    };
    return {
      type: "group",
      id: `group-${promptType}-${storageSuffixes[storage]}`,
      label: storageLabels[storage],
      storage,
      promptType,
      icon: storageIcons[storage]
    };
  }
  /**
   * Returns files for a specific storage/type combination from cache.
   * getStorageGroups must be called first to populate the cache.
   */
  async getFilesForStorageAndType(storage, promptType) {
    const cached = this.cache.get(promptType);
    const disabledUris = this.promptsService.getDisabledPromptFiles(promptType);
    if (promptType === PromptsType.skill) {
      const skills = cached?.skills || [];
      const filtered = skills.filter((skill) => skill.storage === storage);
      const seenUris = /* @__PURE__ */ new Set();
      const result = filtered.map((skill) => {
        seenUris.add(skill.uri.toString());
        const skillName = skill.name || basename(dirname(skill.uri)) || basename(skill.uri);
        return {
          type: "file",
          id: skill.uri.toString(),
          uri: skill.uri,
          name: skillName,
          description: skill.description,
          storage: skill.storage,
          promptType,
          disabled: disabledUris.has(skill.uri)
        };
      });
      if (disabledUris.size > 0) {
        const allSkillFiles = await this.promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None);
        for (const file of allSkillFiles) {
          if (file.storage === storage && !seenUris.has(file.uri.toString()) && disabledUris.has(file.uri)) {
            result.push({
              type: "file",
              id: file.uri.toString(),
              uri: file.uri,
              name: file.name || basename(dirname(file.uri)) || basename(file.uri),
              description: file.description,
              storage: file.storage,
              promptType,
              disabled: true
            });
          }
        }
      }
      return result;
    }
    const items = [...cached?.files?.get(storage) || []];
    return items.map((item) => ({
      type: "file",
      id: item.uri.toString(),
      uri: item.uri,
      name: item.name || basename(item.uri),
      description: item.description,
      storage: item.storage,
      promptType,
      disabled: disabledUris.has(item.uri)
    }));
  }
}
let AICustomizationViewPane = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, promptsService, editorService, menuService, logService, workspaceContextService, workspaceService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.promptsService = promptsService;
    this.editorService = editorService;
    this.menuService = menuService;
    this.logService = logService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceService = workspaceService;
    this.treeDisposables = this._register(new DisposableStore());
    this.isEmptyContextKey = AICustomizationIsEmptyContextKey.bindTo(contextKeyService);
    this.itemTypeContextKey = AICustomizationItemTypeContextKey.bindTo(contextKeyService);
    this.itemDisabledContextKey = AICustomizationItemDisabledContextKey.bindTo(contextKeyService);
    this.itemStorageContextKey = AICustomizationItemStorageContextKey.bindTo(contextKeyService);
    this._register(this.promptsService.onDidChangeCustomAgents(() => this.refresh()));
    this._register(this.promptsService.onDidChangeSlashCommands(() => this.refresh()));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this.refresh()));
    this._register(autorun((reader) => {
      this.workspaceService.activeProjectRoot.read(reader);
      this.refresh();
    }));
  }
  renderBody(container) {
    super.renderBody(container);
    container.classList.add("ai-customization-view");
    this.treeContainer = dom.append(container, dom.$(".tree-container"));
    this.createTree();
  }
  createTree() {
    if (!this.treeContainer) {
      return;
    }
    this.dataSource = new UnifiedAICustomizationDataSource(
      this.promptsService,
      this.logService,
      (count) => this.isEmptyContextKey.set(count === 0)
    );
    this.tree = this.treeDisposables.add(this.instantiationService.createInstance(
      WorkbenchAsyncDataTree,
      "AICustomization",
      this.treeContainer,
      new AICustomizationTreeDelegate(),
      [
        new AICustomizationCategoryRenderer(),
        new AICustomizationGroupRenderer(),
        new AICustomizationFileRenderer(this.menuService, this.contextKeyService, this.instantiationService)
      ],
      this.dataSource,
      {
        identityProvider: {
          getId: (element) => element.id
        },
        accessibilityProvider: {
          getAriaLabel: (element) => {
            if (element.type === "category" || element.type === "link") {
              return element.label;
            }
            if (element.type === "group") {
              return element.label;
            }
            const nameAndDesc = element.description ? localize("fileAriaLabel", "{0}, {1}", element.name, element.description) : element.name;
            return element.disabled ? localize("fileAriaLabelDisabled", "{0}, disabled", nameAndDesc) : nameAndDesc;
          },
          getWidgetAriaLabel: () => localize("aiCustomizationTree", "Chat Customization Items")
        },
        keyboardNavigationLabelProvider: {
          getKeyboardNavigationLabel: (element) => {
            if (element.type === "file") {
              return element.name;
            }
            return element.label;
          }
        }
      }
    ));
    this.treeDisposables.add(this.tree.onDidOpen(async (e) => {
      if (e.element && e.element.type === "file") {
        this.editorService.openEditor({
          resource: e.element.uri
        });
      } else if (e.element && e.element.type === "link") {
        const input = AICustomizationManagementEditorInput.getOrCreate();
        const editor = await this.editorService.openEditor(input, { pinned: true });
        if (editor instanceof AICustomizationManagementEditor) {
          editor.selectSectionById(e.element.section);
        }
      }
    }));
    this.treeDisposables.add(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    void this.tree.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
  }
  async autoExpandCategories() {
    if (!this.tree) {
      return;
    }
    const rootNode = this.tree.getNode(ROOT_ELEMENT);
    for (const child of rootNode.children) {
      if (child.element !== ROOT_ELEMENT) {
        await this.tree.expand(child.element);
      }
    }
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree?.layout(height, width);
  }
  refresh() {
    this.dataSource?.clearCache();
    this.isEmptyContextKey.set(true);
    void this.tree?.setInput(ROOT_ELEMENT).then(() => this.autoExpandCategories());
  }
  collapseAll() {
    this.tree?.collapseAll();
  }
  expandAll() {
    this.tree?.expandAll();
  }
  onContextMenu(e) {
    if (!e.element || e.element.type !== "file") {
      return;
    }
    const element = e.element;
    this.itemTypeContextKey.set(element.promptType);
    this.itemDisabledContextKey.set(element.disabled);
    this.itemStorageContextKey.set(element.storage);
    const context = {
      uri: element.uri.toString(),
      name: element.name,
      promptType: element.promptType,
      disabled: element.disabled
    };
    const menu = this.menuService.getMenuActions(AICustomizationItemMenuId, this.contextKeyService, { arg: context, shouldForwardArgs: true });
    const { secondary } = getContextMenuActions(menu, "inline");
    if (secondary.length > 0) {
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => secondary,
        getActionsContext: () => context,
        onHide: () => {
          this.itemTypeContextKey.reset();
          this.itemDisabledContextKey.reset();
          this.itemStorageContextKey.reset();
        }
      });
    }
  }
};
AICustomizationViewPane.ID = "aiCustomization.view";
AICustomizationViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IPromptsService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IMenuService),
  __decorateParam(13, ILogService),
  __decorateParam(14, IWorkspaceContextService),
  __decorateParam(15, IAICustomizationWorkspaceService)
], AICustomizationViewPane);
export {
  AICustomizationIsEmptyContextKey,
  AICustomizationItemDisabledContextKey,
  AICustomizationItemStorageContextKey,
  AICustomizationItemTypeContextKey,
  AICustomizationViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcYWlDdXN0b21pemF0aW9uVHJlZVZpZXdcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblRyZWVWaWV3Vmlld3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWlDdXN0b21pemF0aW9uVHJlZVZpZXcuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFjdGlvblZpZXdJdGVtLCBnZXRDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdQYW5lT3B0aW9ucywgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlLCBJQWdlbnRTa2lsbCwgSVByb21wdFBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBhZ2VudEljb24sIGV4dGVuc2lvbkljb24sIGluc3RydWN0aW9uc0ljb24sIG1jcFNlcnZlckljb24sIHBsdWdpbkljb24sIHByb21wdEljb24sIHNraWxsSWNvbiwgdXNlckljb24sIHdvcmtzcGFjZUljb24sIGJ1aWx0aW5JY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25JdGVtTWVudUlkIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25UcmVlVmlldy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFTb3VyY2UsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciwgSVRyZWVDb250ZXh0TWVudUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBGdXp6eVNjb3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uU291cmNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLCBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuXG4vLyNyZWdpb24gQ29udGV4dCBLZXlzXG5cbi8qKlxuICogQ29udGV4dCBrZXkgaW5kaWNhdGluZyB3aGV0aGVyIHRoZSBBSSBDdXN0b21pemF0aW9uIHZpZXcgaGFzIG5vIGl0ZW1zLlxuICovXG5leHBvcnQgY29uc3QgQUlDdXN0b21pemF0aW9uSXNFbXB0eUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWlDdXN0b21pemF0aW9uLmlzRW1wdHknLCB0cnVlKTtcblxuLyoqXG4gKiBDb250ZXh0IGtleSBmb3IgdGhlIGN1cnJlbnQgaXRlbSdzIHByb21wdCB0eXBlIGluIGNvbnRleHQgbWVudXMuXG4gKi9cbmV4cG9ydCBjb25zdCBBSUN1c3RvbWl6YXRpb25JdGVtVHlwZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdhaUN1c3RvbWl6YXRpb25JdGVtVHlwZScsICcnKTtcblxuLyoqXG4gKiBDb250ZXh0IGtleSBpbmRpY2F0aW5nIHdoZXRoZXIgdGhlIGN1cnJlbnQgaXRlbSBpcyBkaXNhYmxlZC5cbiAqL1xuZXhwb3J0IGNvbnN0IEFJQ3VzdG9taXphdGlvbkl0ZW1EaXNhYmxlZENvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWlDdXN0b21pemF0aW9uSXRlbURpc2FibGVkJywgZmFsc2UpO1xuXG4vKipcbiAqIENvbnRleHQga2V5IGZvciB0aGUgY3VycmVudCBpdGVtJ3Mgc3RvcmFnZSB0eXBlIGluIGNvbnRleHQgbWVudXMuXG4gKi9cbmV4cG9ydCBjb25zdCBBSUN1c3RvbWl6YXRpb25JdGVtU3RvcmFnZUNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxzdHJpbmc+KCdhaUN1c3RvbWl6YXRpb25JdGVtU3RvcmFnZScsICcnKTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBUcmVlIEl0ZW0gVHlwZXNcblxuLyoqXG4gKiBSb290IGVsZW1lbnQgbWFya2VyIGZvciB0aGUgdHJlZS5cbiAqL1xuY29uc3QgUk9PVF9FTEVNRU5UID0gU3ltYm9sKCdyb290Jyk7XG50eXBlIFJvb3RFbGVtZW50ID0gdHlwZW9mIFJPT1RfRUxFTUVOVDtcblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgdHlwZSBjYXRlZ29yeSBpbiB0aGUgdHJlZSAoZS5nLiwgXCJDdXN0b20gQWdlbnRzXCIsIFwiU2tpbGxzXCIpLlxuICovXG5pbnRlcmZhY2UgSUFJQ3VzdG9taXphdGlvblR5cGVJdGVtIHtcblx0cmVhZG9ubHkgdHlwZTogJ2NhdGVnb3J5Jztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGU7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgc3RvcmFnZSBncm91cCBoZWFkZXIgaW4gdGhlIHRyZWUgKGUuZy4sIFwiV29ya3NwYWNlXCIsIFwiVXNlclwiLCBcIkV4dGVuc2lvbnNcIikuXG4gKi9cbmludGVyZmFjZSBJQUlDdXN0b21pemF0aW9uR3JvdXBJdGVtIHtcblx0cmVhZG9ubHkgdHlwZTogJ2dyb3VwJztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgc3RvcmFnZTogQUlDdXN0b21pemF0aW9uU291cmNlO1xuXHRyZWFkb25seSBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZTtcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gaW5kaXZpZHVhbCBBSSBjdXN0b21pemF0aW9uIGl0ZW0gKGFnZW50LCBza2lsbCwgaW5zdHJ1Y3Rpb24sIG9yIHByb21wdCkuXG4gKi9cbmludGVyZmFjZSBJQUlDdXN0b21pemF0aW9uRmlsZUl0ZW0ge1xuXHRyZWFkb25seSB0eXBlOiAnZmlsZSc7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdG9yYWdlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2U7XG5cdHJlYWRvbmx5IHByb21wdFR5cGU6IFByb21wdHNUeXBlO1xuXHRyZWFkb25seSBkaXNhYmxlZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgbGluayBpdGVtIHRoYXQgbmF2aWdhdGVzIHRvIHRoZSBtYW5hZ2VtZW50IGVkaXRvci5cbiAqL1xuaW50ZXJmYWNlIElBSUN1c3RvbWl6YXRpb25MaW5rSXRlbSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdsaW5rJztcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbjtcbn1cblxudHlwZSBBSUN1c3RvbWl6YXRpb25UcmVlSXRlbSA9IElBSUN1c3RvbWl6YXRpb25UeXBlSXRlbSB8IElBSUN1c3RvbWl6YXRpb25Hcm91cEl0ZW0gfCBJQUlDdXN0b21pemF0aW9uRmlsZUl0ZW0gfCBJQUlDdXN0b21pemF0aW9uTGlua0l0ZW07XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gVHJlZSBJbmZyYXN0cnVjdHVyZVxuXG5jbGFzcyBBSUN1c3RvbWl6YXRpb25UcmVlRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxBSUN1c3RvbWl6YXRpb25UcmVlSXRlbT4ge1xuXHRnZXRIZWlnaHQoX2VsZW1lbnQ6IEFJQ3VzdG9taXphdGlvblRyZWVJdGVtKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IEFJQ3VzdG9taXphdGlvblRyZWVJdGVtKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKGVsZW1lbnQudHlwZSkge1xuXHRcdFx0Y2FzZSAnY2F0ZWdvcnknOlxuXHRcdFx0Y2FzZSAnbGluayc6XG5cdFx0XHRcdHJldHVybiAnY2F0ZWdvcnknO1xuXHRcdFx0Y2FzZSAnZ3JvdXAnOlxuXHRcdFx0XHRyZXR1cm4gJ2dyb3VwJztcblx0XHRcdGNhc2UgJ2ZpbGUnOlxuXHRcdFx0XHRyZXR1cm4gJ2ZpbGUnO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSUNhdGVnb3J5VGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElHcm91cFRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGxhYmVsOiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElGaWxlVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaWNvbjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG5hbWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcblx0cmVhZG9ubHkgZWxlbWVudERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgQUlDdXN0b21pemF0aW9uQ2F0ZWdvcnlSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8SUFJQ3VzdG9taXphdGlvblR5cGVJdGVtIHwgSUFJQ3VzdG9taXphdGlvbkxpbmtJdGVtLCBGdXp6eVNjb3JlLCBJQ2F0ZWdvcnlUZW1wbGF0ZURhdGE+IHtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdjYXRlZ29yeSc7XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDYXRlZ29yeVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmFpLWN1c3RvbWl6YXRpb24tY2F0ZWdvcnknKSk7XG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQoZWxlbWVudCwgZG9tLiQoJy5pY29uJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChlbGVtZW50LCBkb20uJCgnLmxhYmVsJykpO1xuXHRcdHJldHVybiB7IGNvbnRhaW5lcjogZWxlbWVudCwgaWNvbiwgbGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElBSUN1c3RvbWl6YXRpb25UeXBlSXRlbSB8IElBSUN1c3RvbWl6YXRpb25MaW5rSXRlbSwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDYXRlZ29yeVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9ICdpY29uJztcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KG5vZGUuZWxlbWVudC5pY29uKSk7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnRleHRDb250ZW50ID0gbm9kZS5lbGVtZW50LmxhYmVsO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKF90ZW1wbGF0ZURhdGE6IElDYXRlZ29yeVRlbXBsYXRlRGF0YSk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIEFJQ3VzdG9taXphdGlvbkdyb3VwUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElBSUN1c3RvbWl6YXRpb25Hcm91cEl0ZW0sIEZ1enp5U2NvcmUsIElHcm91cFRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ2dyb3VwJztcblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUdyb3VwVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuYWktY3VzdG9taXphdGlvbi1ncm91cC1oZWFkZXInKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGVsZW1lbnQsIGRvbS4kKCcubGFiZWwnKSk7XG5cdFx0cmV0dXJuIHsgY29udGFpbmVyOiBlbGVtZW50LCBsYWJlbCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8SUFJQ3VzdG9taXphdGlvbkdyb3VwSXRlbSwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElHcm91cFRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC50ZXh0Q29udGVudCA9IG5vZGUuZWxlbWVudC5sYWJlbDtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShfdGVtcGxhdGVEYXRhOiBJR3JvdXBUZW1wbGF0ZURhdGEpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBBSUN1c3RvbWl6YXRpb25GaWxlUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPElBSUN1c3RvbWl6YXRpb25GaWxlSXRlbSwgRnV6enlTY29yZSwgSUZpbGVUZW1wbGF0ZURhdGE+IHtcblx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdmaWxlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZpbGVUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5haS1jdXN0b21pemF0aW9uLXRyZWUtaXRlbScpKTtcblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChlbGVtZW50LCBkb20uJCgnLmljb24nKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGRvbS5hcHBlbmQoZWxlbWVudCwgZG9tLiQoJy5uYW1lJykpO1xuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSBkb20uYXBwZW5kKGVsZW1lbnQsIGRvbS4kKCcuYWN0aW9ucycpKTtcblxuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvbkJhcihhY3Rpb25zQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBjcmVhdGVBY3Rpb25WaWV3SXRlbS5iaW5kKHVuZGVmaW5lZCwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSksXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHsgY29udGFpbmVyOiBlbGVtZW50LCBpY29uLCBuYW1lLCBhY3Rpb25CYXIsIGVsZW1lbnREaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLCB0ZW1wbGF0ZURpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJQUlDdXN0b21pemF0aW9uRmlsZUl0ZW0sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRmlsZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGl0ZW0gPSBub2RlLmVsZW1lbnQ7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gU2V0IGljb24gYmFzZWQgb24gcHJvbXB0IHR5cGVcblx0XHRsZXQgaWNvbjogVGhlbWVJY29uO1xuXHRcdHN3aXRjaCAoaXRlbS5wcm9tcHRUeXBlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0XHRpY29uID0gYWdlbnRJY29uO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRcdGljb24gPSBza2lsbEljb247XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRcdGljb24gPSBpbnN0cnVjdGlvbnNJY29uO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0aWNvbiA9IHByb21wdEljb247XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9ICdpY29uJztcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGljb24pKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5uYW1lLnRleHRDb250ZW50ID0gaXRlbS5uYW1lO1xuXG5cdFx0Ly8gQXBwbHkgZGlzYWJsZWQgc3R5bGluZ1xuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBpdGVtLmRpc2FibGVkKTtcblxuXHRcdC8vIFNldCB0b29sdGlwIHdpdGggbmFtZSBhbmQgZGVzY3JpcHRpb25cblx0XHRjb25zdCB0b29sdGlwID0gaXRlbS5kZXNjcmlwdGlvbiA/IGAke2l0ZW0ubmFtZX0gLSAke2l0ZW0uZGVzY3JpcHRpb259YCA6IGl0ZW0ubmFtZTtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnRpdGxlID0gdG9vbHRpcDtcblxuXHRcdC8vIEJ1aWxkIGNvbnRleHQgZm9yIG1lbnUgYWN0aW9uc1xuXHRcdGNvbnN0IGNvbnRleHQgPSB7XG5cdFx0XHR1cmk6IGl0ZW0udXJpLnRvU3RyaW5nKCksXG5cdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRwcm9tcHRUeXBlOiBpdGVtLnByb21wdFR5cGUsXG5cdFx0XHRzdG9yYWdlOiBpdGVtLnN0b3JhZ2UsXG5cdFx0fTtcblxuXHRcdC8vIENyZWF0ZSBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSB3aXRoIGl0ZW0gdHlwZSBmb3Igd2hlbi1jbGF1c2UgZmlsdGVyaW5nXG5cdFx0Y29uc3Qgb3ZlcmxheSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uSXRlbVR5cGVDb250ZXh0S2V5LmtleSwgaXRlbS5wcm9tcHRUeXBlXSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25JdGVtRGlzYWJsZWRDb250ZXh0S2V5LmtleSwgaXRlbS5kaXNhYmxlZF0sXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uSXRlbVN0b3JhZ2VDb250ZXh0S2V5LmtleSwgaXRlbS5zdG9yYWdlXSxcblx0XHRdKTtcblxuXHRcdC8vIENyZWF0ZSBtZW51IGFuZCBleHRyYWN0IGlubGluZSBhY3Rpb25zXG5cdFx0Y29uc3QgbWVudSA9IHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0dGhpcy5tZW51U2VydmljZS5jcmVhdGVNZW51KEFJQ3VzdG9taXphdGlvbkl0ZW1NZW51SWQsIG92ZXJsYXkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHVwZGF0ZUFjdGlvbnMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gbWVudS5nZXRBY3Rpb25zKHsgYXJnOiBjb250ZXh0LCBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHsgcHJpbWFyeSB9ID0gZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGFjdGlvbnMsICdpbmxpbmUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChwcmltYXJ5LCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR9O1xuXHRcdHVwZGF0ZUFjdGlvbnMoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChtZW51Lm9uRGlkQ2hhbmdlKHVwZGF0ZUFjdGlvbnMpKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuY29udGV4dCA9IGNvbnRleHQ7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfbm9kZTogSVRyZWVOb2RlPElBSUN1c3RvbWl6YXRpb25GaWxlSXRlbSwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWxlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBDYWNoZWQgZGF0YSBmb3IgYSBzcGVjaWZpYyBwcm9tcHQgdHlwZS5cbiAqL1xuaW50ZXJmYWNlIElDYWNoZWRUeXBlRGF0YSB7XG5cdHNraWxscz86IElBZ2VudFNraWxsW107XG5cdGZpbGVzPzogTWFwPHN0cmluZywgcmVhZG9ubHkgSVByb21wdFBhdGhbXT47XG59XG5cbi8qKlxuICogRGF0YSBzb3VyY2UgZm9yIHRoZSBBSSBDdXN0b21pemF0aW9uIHRyZWUgd2l0aCBlZmZpY2llbnQgY2FjaGluZy5cbiAqIENhY2hlcyBkYXRhIHBlci10eXBlIHRvIGF2b2lkIHJlZHVuZGFudCBmZXRjaGVzIHdoZW4gZXhwYW5kaW5nIGdyb3Vwcy5cbiAqL1xuY2xhc3MgVW5pZmllZEFJQ3VzdG9taXphdGlvbkRhdGFTb3VyY2UgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPFJvb3RFbGVtZW50LCBBSUN1c3RvbWl6YXRpb25UcmVlSXRlbT4ge1xuXHRwcml2YXRlIGNhY2hlID0gbmV3IE1hcDxQcm9tcHRzVHlwZSwgSUNhY2hlZFR5cGVEYXRhPigpO1xuXHRwcml2YXRlIHRvdGFsSXRlbUNvdW50ID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uSXRlbUNvdW50Q2hhbmdlZDogKGNvdW50OiBudW1iZXIpID0+IHZvaWQsXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIENsZWFycyB0aGUgY2FjaGUuIFNob3VsZCBiZSBjYWxsZWQgd2hlbiB0aGUgdmlldyByZWZyZXNoZXMuXG5cdCAqL1xuXHRjbGVhckNhY2hlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FjaGUuY2xlYXIoKTtcblx0XHR0aGlzLnRvdGFsSXRlbUNvdW50ID0gMDtcblx0fVxuXG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IFJvb3RFbGVtZW50IHwgQUlDdXN0b21pemF0aW9uVHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRpZiAoZWxlbWVudCA9PT0gUk9PVF9FTEVNRU5UKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQudHlwZSA9PT0gJ2xpbmsnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50LnR5cGUgPT09ICdjYXRlZ29yeScgfHwgZWxlbWVudC50eXBlID09PSAnZ3JvdXAnO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudDogUm9vdEVsZW1lbnQgfCBBSUN1c3RvbWl6YXRpb25UcmVlSXRlbSk6IFByb21pc2U8QUlDdXN0b21pemF0aW9uVHJlZUl0ZW1bXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoZWxlbWVudCA9PT0gUk9PVF9FTEVNRU5UKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFR5cGVDYXRlZ29yaWVzKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdjYXRlZ29yeScpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0U3RvcmFnZUdyb3VwcyhlbGVtZW50LnByb21wdFR5cGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnZ3JvdXAnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldEZpbGVzRm9yU3RvcmFnZUFuZFR5cGUoZWxlbWVudC5zdG9yYWdlLCBlbGVtZW50LnByb21wdFR5cGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0FJQ3VzdG9taXphdGlvbl0gRXJyb3IgZmV0Y2hpbmcgdHJlZSBjaGlsZHJlbjonLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRUeXBlQ2F0ZWdvcmllcygpOiAoSUFJQ3VzdG9taXphdGlvblR5cGVJdGVtIHwgSUFJQ3VzdG9taXphdGlvbkxpbmtJdGVtKVtdIHtcblx0XHRjb25zdCBpdGVtczogKElBSUN1c3RvbWl6YXRpb25UeXBlSXRlbSB8IElBSUN1c3RvbWl6YXRpb25MaW5rSXRlbSlbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2NhdGVnb3J5Jyxcblx0XHRcdFx0aWQ6ICdjYXRlZ29yeS1hZ2VudHMnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2N1c3RvbUFnZW50cycsIFwiQ3VzdG9tIEFnZW50c1wiKSxcblx0XHRcdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsXG5cdFx0XHRcdGljb246IGFnZW50SWNvbixcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdjYXRlZ29yeScsXG5cdFx0XHRcdGlkOiAnY2F0ZWdvcnktc2tpbGxzJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdza2lsbHMnLCBcIlNraWxsc1wiKSxcblx0XHRcdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHRcdGljb246IHNraWxsSWNvbixcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdjYXRlZ29yeScsXG5cdFx0XHRcdGlkOiAnY2F0ZWdvcnktaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnN0cnVjdGlvbnMnLCBcIkluc3RydWN0aW9uc1wiKSxcblx0XHRcdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRpY29uOiBpbnN0cnVjdGlvbnNJY29uLFxuXHRcdFx0fSxcblx0XHRdO1xuXHRcdGl0ZW1zLnB1c2goXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdsaW5rJyxcblx0XHRcdFx0aWQ6ICdsaW5rLW1jcC1zZXJ2ZXJzJyxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BTZXJ2ZXJzJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRcdFx0aWNvbjogbWNwU2VydmVySWNvbixcblx0XHRcdFx0c2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycyxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHQvKipcblx0ICogRmV0Y2hlcyBhbmQgY2FjaGVzIGRhdGEgZm9yIGEgcHJvbXB0IHR5cGUsIHJldHVybmluZyBzdG9yYWdlIGdyb3VwcyB3aXRoIGl0ZW1zLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRTdG9yYWdlR3JvdXBzKHByb21wdFR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTxJQUlDdXN0b21pemF0aW9uR3JvdXBJdGVtW10+IHtcblx0XHRjb25zdCBncm91cHM6IElBSUN1c3RvbWl6YXRpb25Hcm91cEl0ZW1bXSA9IFtdO1xuXG5cdFx0Ly8gQ2hlY2sgY2FjaGUgZmlyc3Rcblx0XHRsZXQgY2FjaGVkID0gdGhpcy5jYWNoZS5nZXQocHJvbXB0VHlwZSk7XG5cdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdGNhY2hlZCA9IHt9O1xuXHRcdFx0dGhpcy5jYWNoZS5zZXQocHJvbXB0VHlwZSwgY2FjaGVkKTtcblx0XHR9XG5cblx0XHQvLyBGb3Igc2tpbGxzLCB1c2UgZmluZEFnZW50U2tpbGxzIHdoaWNoIGhhcyB0aGUgcHJvcGVyIG5hbWVzIGZyb20gZnJvbnRtYXR0ZXJcblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdGlmICghY2FjaGVkLnNraWxscykge1xuXHRcdFx0XHRjb25zdCBza2lsbHMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmZpbmRBZ2VudFNraWxscyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Y2FjaGVkLnNraWxscyA9IHNraWxscyB8fCBbXTtcblx0XHRcdFx0dGhpcy50b3RhbEl0ZW1Db3VudCArPSBjYWNoZWQuc2tpbGxzLmxlbmd0aDtcblx0XHRcdFx0dGhpcy5vbkl0ZW1Db3VudENoYW5nZWQodGhpcy50b3RhbEl0ZW1Db3VudCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZVNraWxscyA9IGNhY2hlZC5za2lsbHMuZmlsdGVyKHMgPT4gcy5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0XHRjb25zdCB1c2VyU2tpbGxzID0gY2FjaGVkLnNraWxscy5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uU2tpbGxzID0gY2FjaGVkLnNraWxscy5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCBidWlsdGluU2tpbGxzID0gY2FjaGVkLnNraWxscy5maWx0ZXIocyA9PiBzLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmJ1aWx0SW4pO1xuXG5cdFx0XHRpZiAod29ya3NwYWNlU2tpbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbCwgd29ya3NwYWNlU2tpbGxzLmxlbmd0aCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVzZXJTa2lsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRncm91cHMucHVzaCh0aGlzLmNyZWF0ZUdyb3VwSXRlbShwcm9tcHRUeXBlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXIsIHVzZXJTa2lsbHMubGVuZ3RoKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uU2tpbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb24sIGV4dGVuc2lvblNraWxscy5sZW5ndGgpKTtcblx0XHRcdH1cblx0XHRcdGlmIChidWlsdGluU2tpbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluLCBidWlsdGluU2tpbGxzLmxlbmd0aCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gZ3JvdXBzO1xuXHRcdH1cblxuXHRcdC8vIEZvciBvdGhlciB0eXBlcywgZmV0Y2ggb25jZSBhbmQgY2FjaGUgZ3JvdXBlZCBieSBzdG9yYWdlXG5cdFx0aWYgKCFjYWNoZWQuZmlsZXMpIHtcblx0XHRcdGNvbnN0IGFsbEl0ZW1zOiBJUHJvbXB0UGF0aFtdID0gWy4uLmF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKHByb21wdFR5cGUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpXTtcblxuXHRcdFx0Ly8gRm9yIGluc3RydWN0aW9ucywgYWxzbyBpbmNsdWRlIGFnZW50IGluc3RydWN0aW9ucyAoQUdFTlRTLm1kLCBjb3BpbG90LWluc3RydWN0aW9ucy5tZCwgQ0xBVURFLm1kLCBldGMuKVxuXHRcdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ1VyaXMgPSBuZXcgUmVzb3VyY2VTZXQoYWxsSXRlbXMubWFwKGl0ZW0gPT4gaXRlbS51cmkpKTtcblx0XHRcdFx0Y29uc3QgYWdlbnRJbnN0cnVjdGlvbnMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGFnZW50SW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRcdFx0aWYgKCFleGlzdGluZ1VyaXMuaGFzKGZpbGUudXJpKSkge1xuXHRcdFx0XHRcdFx0YWxsSXRlbXMucHVzaCh7IHVyaTogZmlsZS51cmksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdvcmtzcGFjZUl0ZW1zID0gYWxsSXRlbXMuZmlsdGVyKGl0ZW0gPT4gaXRlbS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCk7XG5cdFx0XHRjb25zdCB1c2VySXRlbXMgPSBhbGxJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSXRlbXMgPSBhbGxJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbik7XG5cdFx0XHRjb25zdCBidWlsdGluSXRlbXMgPSBhbGxJdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmJ1aWx0SW4pO1xuXG5cdFx0XHRjYWNoZWQuZmlsZXMgPSBuZXcgTWFwPHN0cmluZywgcmVhZG9ubHkgSVByb21wdFBhdGhbXT4oW1xuXHRcdFx0XHRbUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHdvcmtzcGFjZUl0ZW1zXSxcblx0XHRcdFx0W1Byb21wdHNTdG9yYWdlLnVzZXIsIHVzZXJJdGVtc10sXG5cdFx0XHRcdFtQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGV4dGVuc2lvbkl0ZW1zXSxcblx0XHRcdFx0W1Byb21wdHNTdG9yYWdlLmJ1aWx0SW4sIGJ1aWx0aW5JdGVtc10sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgaXRlbUNvdW50ID0gYWxsSXRlbXMubGVuZ3RoO1xuXHRcdFx0dGhpcy50b3RhbEl0ZW1Db3VudCArPSBpdGVtQ291bnQ7XG5cdFx0XHR0aGlzLm9uSXRlbUNvdW50Q2hhbmdlZCh0aGlzLnRvdGFsSXRlbUNvdW50KTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VJdGVtcyA9IGNhY2hlZC5maWxlcyEuZ2V0KFByb21wdHNTdG9yYWdlLmxvY2FsKSB8fCBbXTtcblx0XHRjb25zdCB1c2VySXRlbXMgPSBjYWNoZWQuZmlsZXMhLmdldChQcm9tcHRzU3RvcmFnZS51c2VyKSB8fCBbXTtcblx0XHRjb25zdCBleHRlbnNpb25JdGVtcyA9IGNhY2hlZC5maWxlcyEuZ2V0KFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbikgfHwgW107XG5cdFx0Y29uc3QgYnVpbHRpbkl0ZW1zID0gY2FjaGVkLmZpbGVzIS5nZXQoUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbikgfHwgW107XG5cblx0XHRpZiAod29ya3NwYWNlSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHdvcmtzcGFjZUl0ZW1zLmxlbmd0aCkpO1xuXHRcdH1cblx0XHRpZiAodXNlckl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGdyb3Vwcy5wdXNoKHRoaXMuY3JlYXRlR3JvdXBJdGVtKHByb21wdFR5cGUsIFByb21wdHNTdG9yYWdlLnVzZXIsIHVzZXJJdGVtcy5sZW5ndGgpKTtcblx0XHR9XG5cdFx0aWYgKGV4dGVuc2lvbkl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGdyb3Vwcy5wdXNoKHRoaXMuY3JlYXRlR3JvdXBJdGVtKHByb21wdFR5cGUsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgZXh0ZW5zaW9uSXRlbXMubGVuZ3RoKSk7XG5cdFx0fVxuXHRcdGlmIChidWlsdGluSXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Z3JvdXBzLnB1c2godGhpcy5jcmVhdGVHcm91cEl0ZW0ocHJvbXB0VHlwZSwgUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbiwgYnVpbHRpbkl0ZW1zLmxlbmd0aCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cHM7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIGdyb3VwIGl0ZW0gd2l0aCBjb25zaXN0ZW50IHN0cnVjdHVyZS5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlR3JvdXBJdGVtKHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBzdG9yYWdlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIGNvdW50OiBudW1iZXIpOiBJQUlDdXN0b21pemF0aW9uR3JvdXBJdGVtIHtcblx0XHRjb25zdCBzdG9yYWdlTGFiZWxzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWxdOiBsb2NhbGl6ZSgnd29ya3NwYWNlV2l0aENvdW50JywgXCJXb3Jrc3BhY2UgKHswfSlcIiwgY291bnQpLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMudXNlcl06IGxvY2FsaXplKCd1c2VyV2l0aENvdW50JywgXCJVc2VyICh7MH0pXCIsIGNvdW50KSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmV4dGVuc2lvbl06IGxvY2FsaXplKCdleHRlbnNpb25zV2l0aENvdW50JywgXCJFeHRlbnNpb25zICh7MH0pXCIsIGNvdW50KSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbl06IGxvY2FsaXplKCdwbHVnaW5zV2l0aENvdW50JywgXCJQbHVnaW5zICh7MH0pXCIsIGNvdW50KSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW5dOiBsb2NhbGl6ZSgnYnVpbHRpbldpdGhDb3VudCcsIFwiQnVpbHQtaW4gKHswfSlcIiwgY291bnQpLFxuXHRcdH07XG5cblx0XHRjb25zdCBzdG9yYWdlSWNvbnM6IFJlY29yZDxzdHJpbmcsIFRoZW1lSWNvbj4gPSB7XG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5sb2NhbF06IHdvcmtzcGFjZUljb24sXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy51c2VyXTogdXNlckljb24sXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb25dOiBleHRlbnNpb25JY29uLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luXTogcGx1Z2luSWNvbixcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW5dOiBidWlsdGluSWNvbixcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmFnZVN1ZmZpeGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0W0FJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWxdOiAnd29ya3NwYWNlJyxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnVzZXJdOiAndXNlcicsXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5leHRlbnNpb25dOiAnZXh0ZW5zaW9ucycsXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW5dOiAncGx1Z2lucycsXG5cdFx0XHRbQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluXTogJ2J1aWx0aW4nLFxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2dyb3VwJyxcblx0XHRcdGlkOiBgZ3JvdXAtJHtwcm9tcHRUeXBlfS0ke3N0b3JhZ2VTdWZmaXhlc1tzdG9yYWdlXX1gLFxuXHRcdFx0bGFiZWw6IHN0b3JhZ2VMYWJlbHNbc3RvcmFnZV0sXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0cHJvbXB0VHlwZSxcblx0XHRcdGljb246IHN0b3JhZ2VJY29uc1tzdG9yYWdlXSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgZmlsZXMgZm9yIGEgc3BlY2lmaWMgc3RvcmFnZS90eXBlIGNvbWJpbmF0aW9uIGZyb20gY2FjaGUuXG5cdCAqIGdldFN0b3JhZ2VHcm91cHMgbXVzdCBiZSBjYWxsZWQgZmlyc3QgdG8gcG9wdWxhdGUgdGhlIGNhY2hlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBnZXRGaWxlc0ZvclN0b3JhZ2VBbmRUeXBlKHN0b3JhZ2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPElBSUN1c3RvbWl6YXRpb25GaWxlSXRlbVtdPiB7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jYWNoZS5nZXQocHJvbXB0VHlwZSk7XG5cdFx0Y29uc3QgZGlzYWJsZWRVcmlzID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXREaXNhYmxlZFByb21wdEZpbGVzKHByb21wdFR5cGUpO1xuXG5cdFx0Ly8gRm9yIHNraWxscywgdXNlIHRoZSBjYWNoZWQgc2tpbGxzIGRhdGEgYW5kIG1lcmdlIGluIGRpc2FibGVkIHNraWxsc1xuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkge1xuXHRcdFx0Y29uc3Qgc2tpbGxzID0gY2FjaGVkPy5za2lsbHMgfHwgW107XG5cdFx0XHRjb25zdCBmaWx0ZXJlZCA9IHNraWxscy5maWx0ZXIoc2tpbGwgPT4gc2tpbGwuc3RvcmFnZSA9PT0gc3RvcmFnZSk7XG5cdFx0XHRjb25zdCBzZWVuVXJpcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJQUlDdXN0b21pemF0aW9uRmlsZUl0ZW1bXSA9IGZpbHRlcmVkXG5cdFx0XHRcdC5tYXAoc2tpbGwgPT4ge1xuXHRcdFx0XHRcdHNlZW5VcmlzLmFkZChza2lsbC51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Ly8gVXNlIHNraWxsIG5hbWUgZnJvbSBmcm9udG1hdHRlciwgb3IgZmFsbGJhY2sgdG8gcGFyZW50IGZvbGRlciBuYW1lXG5cdFx0XHRcdFx0Y29uc3Qgc2tpbGxOYW1lID0gc2tpbGwubmFtZSB8fCBiYXNlbmFtZShkaXJuYW1lKHNraWxsLnVyaSkpIHx8IGJhc2VuYW1lKHNraWxsLnVyaSk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHR5cGU6ICdmaWxlJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdGlkOiBza2lsbC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdHVyaTogc2tpbGwudXJpLFxuXHRcdFx0XHRcdFx0bmFtZTogc2tpbGxOYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHNraWxsLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogc2tpbGwuc3RvcmFnZSxcblx0XHRcdFx0XHRcdHByb21wdFR5cGUsXG5cdFx0XHRcdFx0XHRkaXNhYmxlZDogZGlzYWJsZWRVcmlzLmhhcyhza2lsbC51cmkpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHQvLyBJbmNsdWRlIGRpc2FibGVkIHNraWxscyBub3QgYWxyZWFkeSBpbiB0aGUgZW5hYmxlZCBsaXN0XG5cdFx0XHRpZiAoZGlzYWJsZWRVcmlzLnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGFsbFNraWxsRmlsZXMgPSBhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5za2lsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBhbGxTa2lsbEZpbGVzKSB7XG5cdFx0XHRcdFx0aWYgKGZpbGUuc3RvcmFnZSA9PT0gc3RvcmFnZSAmJiAhc2VlblVyaXMuaGFzKGZpbGUudXJpLnRvU3RyaW5nKCkpICYmIGRpc2FibGVkVXJpcy5oYXMoZmlsZS51cmkpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdmaWxlJyBhcyBjb25zdCxcblx0XHRcdFx0XHRcdFx0aWQ6IGZpbGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRcdHVyaTogZmlsZS51cmksXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGZpbGUubmFtZSB8fCBiYXNlbmFtZShkaXJuYW1lKGZpbGUudXJpKSkgfHwgYmFzZW5hbWUoZmlsZS51cmkpLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZmlsZS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0c3RvcmFnZTogZmlsZS5zdG9yYWdlLFxuXHRcdFx0XHRcdFx0XHRwcm9tcHRUeXBlLFxuXHRcdFx0XHRcdFx0XHRkaXNhYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdC8vIFVzZSBjYWNoZWQgZmlsZXMgZGF0YSAoYWxyZWFkeSBmZXRjaGVkIGluIGdldFN0b3JhZ2VHcm91cHMpXG5cdFx0Y29uc3QgaXRlbXMgPSBbLi4uKGNhY2hlZD8uZmlsZXM/LmdldChzdG9yYWdlKSB8fCBbXSldO1xuXHRcdHJldHVybiBpdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0dHlwZTogJ2ZpbGUnIGFzIGNvbnN0LFxuXHRcdFx0aWQ6IGl0ZW0udXJpLnRvU3RyaW5nKCksXG5cdFx0XHR1cmk6IGl0ZW0udXJpLFxuXHRcdFx0bmFtZTogaXRlbS5uYW1lIHx8IGJhc2VuYW1lKGl0ZW0udXJpKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0c3RvcmFnZTogaXRlbS5zdG9yYWdlLFxuXHRcdFx0cHJvbXB0VHlwZSxcblx0XHRcdGRpc2FibGVkOiBkaXNhYmxlZFVyaXMuaGFzKGl0ZW0udXJpKSxcblx0XHR9KSk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBVbmlmaWVkIFZpZXcgUGFuZVxuXG4vKipcbiAqIFVuaWZpZWQgdmlldyBwYW5lIGZvciBhbGwgQUkgQ3VzdG9taXphdGlvbiBpdGVtcyAoYWdlbnRzLCBza2lsbHMsIGluc3RydWN0aW9ucywgcHJvbXB0cykuXG4gKi9cbmV4cG9ydCBjbGFzcyBBSUN1c3RvbWl6YXRpb25WaWV3UGFuZSBleHRlbmRzIFZpZXdQYW5lIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2FpQ3VzdG9taXphdGlvbi52aWV3JztcblxuXHRwcml2YXRlIHRyZWU6IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8Um9vdEVsZW1lbnQsIEFJQ3VzdG9taXphdGlvblRyZWVJdGVtLCBGdXp6eVNjb3JlPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkYXRhU291cmNlOiBVbmlmaWVkQUlDdXN0b21pemF0aW9uRGF0YVNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmVlQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdC8vIENvbnRleHQga2V5cyBmb3IgY29udHJvbGxpbmcgbWVudSB2aXNpYmlsaXR5IGFuZCB3ZWxjb21lIGNvbnRlbnRcblx0cHJpdmF0ZSByZWFkb25seSBpc0VtcHR5Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgaXRlbVR5cGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1EaXNhYmxlZENvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW1TdG9yYWdlQ29udGV4dEtleTogSUNvbnRleHRLZXk8c3RyaW5nPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVNlcnZpY2U6IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblxuXHRcdC8vIEluaXRpYWxpemUgY29udGV4dCBrZXlzXG5cdFx0dGhpcy5pc0VtcHR5Q29udGV4dEtleSA9IEFJQ3VzdG9taXphdGlvbklzRW1wdHlDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pdGVtVHlwZUNvbnRleHRLZXkgPSBBSUN1c3RvbWl6YXRpb25JdGVtVHlwZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLml0ZW1EaXNhYmxlZENvbnRleHRLZXkgPSBBSUN1c3RvbWl6YXRpb25JdGVtRGlzYWJsZWRDb250ZXh0S2V5LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pdGVtU3RvcmFnZUNvbnRleHRLZXkgPSBBSUN1c3RvbWl6YXRpb25JdGVtU3RvcmFnZUNvbnRleHRLZXkuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIFN1YnNjcmliZSB0byBwcm9tcHQgc2VydmljZSBldmVudHMgdG8gcmVmcmVzaCB0cmVlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbUFnZW50cygoKSA9PiB0aGlzLnJlZnJlc2goKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKCgpID0+IHRoaXMucmVmcmVzaCgpKSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gd29ya3NwYWNlIGZvbGRlciBjaGFuZ2VzIHRvIHJlZnJlc2ggdHJlZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMucmVmcmVzaCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmFjdGl2ZVByb2plY3RSb290LnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH0pKTtcblxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdhaS1jdXN0b21pemF0aW9uLXZpZXcnKTtcblx0XHR0aGlzLnRyZWVDb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy50cmVlLWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMuY3JlYXRlVHJlZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmVlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy50cmVlQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGRhdGEgc291cmNlIHdpdGggY2FsbGJhY2sgZm9yIHRyYWNraW5nIGl0ZW0gY291bnRcblx0XHR0aGlzLmRhdGFTb3VyY2UgPSBuZXcgVW5pZmllZEFJQ3VzdG9taXphdGlvbkRhdGFTb3VyY2UoXG5cdFx0XHR0aGlzLnByb21wdHNTZXJ2aWNlLFxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLFxuXHRcdFx0KGNvdW50KSA9PiB0aGlzLmlzRW1wdHlDb250ZXh0S2V5LnNldChjb3VudCA9PT0gMCksXG5cdFx0KTtcblxuXHRcdHRoaXMudHJlZSA9IHRoaXMudHJlZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoQXN5bmNEYXRhVHJlZTxSb290RWxlbWVudCwgQUlDdXN0b21pemF0aW9uVHJlZUl0ZW0sIEZ1enp5U2NvcmU+LFxuXHRcdFx0J0FJQ3VzdG9taXphdGlvbicsXG5cdFx0XHR0aGlzLnRyZWVDb250YWluZXIsXG5cdFx0XHRuZXcgQUlDdXN0b21pemF0aW9uVHJlZURlbGVnYXRlKCksXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBBSUN1c3RvbWl6YXRpb25DYXRlZ29yeVJlbmRlcmVyKCksXG5cdFx0XHRcdG5ldyBBSUN1c3RvbWl6YXRpb25Hcm91cFJlbmRlcmVyKCksXG5cdFx0XHRcdG5ldyBBSUN1c3RvbWl6YXRpb25GaWxlUmVuZGVyZXIodGhpcy5tZW51U2VydmljZSwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSksXG5cdFx0XHRdLFxuXHRcdFx0dGhpcy5kYXRhU291cmNlLFxuXHRcdFx0e1xuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0SWQ6IChlbGVtZW50OiBBSUN1c3RvbWl6YXRpb25UcmVlSXRlbSkgPT4gZWxlbWVudC5pZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsOiAoZWxlbWVudDogQUlDdXN0b21pemF0aW9uVHJlZUl0ZW0pID0+IHtcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LnR5cGUgPT09ICdjYXRlZ29yeScgfHwgZWxlbWVudC50eXBlID09PSAnbGluaycpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnZ3JvdXAnKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmxhYmVsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gRm9yIGZpbGVzLCBpbmNsdWRlIGRlc2NyaXB0aW9uIGFuZCBkaXNhYmxlZCBzdGF0ZVxuXHRcdFx0XHRcdFx0Y29uc3QgbmFtZUFuZERlc2MgPSBlbGVtZW50LmRlc2NyaXB0aW9uXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2ZpbGVBcmlhTGFiZWwnLCBcInswfSwgezF9XCIsIGVsZW1lbnQubmFtZSwgZWxlbWVudC5kZXNjcmlwdGlvbilcblx0XHRcdFx0XHRcdFx0OiBlbGVtZW50Lm5hbWU7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5kaXNhYmxlZFxuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdmaWxlQXJpYUxhYmVsRGlzYWJsZWQnLCBcInswfSwgZGlzYWJsZWRcIiwgbmFtZUFuZERlc2MpXG5cdFx0XHRcdFx0XHRcdDogbmFtZUFuZERlc2M7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdhaUN1c3RvbWl6YXRpb25UcmVlJywgXCJDaGF0IEN1c3RvbWl6YXRpb24gSXRlbXNcIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDogKGVsZW1lbnQ6IEFJQ3VzdG9taXphdGlvblRyZWVJdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC50eXBlID09PSAnZmlsZScpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubmFtZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmxhYmVsO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHQvLyBIYW5kbGUgZG91YmxlLWNsaWNrIHRvIG9wZW4gZmlsZSBvciBuYXZpZ2F0ZSB0byBzZWN0aW9uXG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbkRpZE9wZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50ICYmIGUuZWxlbWVudC50eXBlID09PSAnZmlsZScpIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBlLmVsZW1lbnQudXJpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50ICYmIGUuZWxlbWVudC50eXBlID09PSAnbGluaycpIHtcblx0XHRcdFx0Y29uc3QgaW5wdXQgPSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQuZ2V0T3JDcmVhdGUoKTtcblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoaW5wdXQsIHsgcGlubmVkOiB0cnVlIH0pO1xuXHRcdFx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcikge1xuXHRcdFx0XHRcdGVkaXRvci5zZWxlY3RTZWN0aW9uQnlJZChlLmVsZW1lbnQuc2VjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgY29udGV4dCBtZW51XG5cdFx0dGhpcy50cmVlRGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cblx0XHQvLyBJbml0aWFsIGxvYWQgYW5kIGF1dG8tZXhwYW5kIGNhdGVnb3J5IG5vZGVzXG5cdFx0dm9pZCB0aGlzLnRyZWUuc2V0SW5wdXQoUk9PVF9FTEVNRU5UKS50aGVuKCgpID0+IHRoaXMuYXV0b0V4cGFuZENhdGVnb3JpZXMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGF1dG9FeHBhbmRDYXRlZ29yaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy50cmVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIEF1dG8tZXhwYW5kIGFsbCBjYXRlZ29yeSBub2RlcyB0byBzaG93IHN0b3JhZ2UgZ3JvdXBzXG5cdFx0Y29uc3Qgcm9vdE5vZGUgPSB0aGlzLnRyZWUuZ2V0Tm9kZShST09UX0VMRU1FTlQpO1xuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygcm9vdE5vZGUuY2hpbGRyZW4pIHtcblx0XHRcdGlmIChjaGlsZC5lbGVtZW50ICE9PSBST09UX0VMRU1FTlQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZChjaGlsZC5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlPy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwdWJsaWMgcmVmcmVzaCgpOiB2b2lkIHtcblx0XHQvLyBDbGVhciB0aGUgY2FjaGUgYmVmb3JlIHJlZnJlc2hpbmdcblx0XHR0aGlzLmRhdGFTb3VyY2U/LmNsZWFyQ2FjaGUoKTtcblx0XHR0aGlzLmlzRW1wdHlDb250ZXh0S2V5LnNldCh0cnVlKTsgLy8gUmVzZXQgdW50aWwgd2Uga25vdyB0aGUgY291bnRcblx0XHR2b2lkIHRoaXMudHJlZT8uc2V0SW5wdXQoUk9PVF9FTEVNRU5UKS50aGVuKCgpID0+IHRoaXMuYXV0b0V4cGFuZENhdGVnb3JpZXMoKSk7XG5cdH1cblxuXHRwdWJsaWMgY29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlPy5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0cHVibGljIGV4cGFuZEFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWU/LmV4cGFuZEFsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxBSUN1c3RvbWl6YXRpb25UcmVlSXRlbSB8IG51bGw+KTogdm9pZCB7XG5cdFx0Ly8gT25seSBzaG93IGNvbnRleHQgbWVudSBmb3IgZmlsZSBpdGVtc1xuXHRcdGlmICghZS5lbGVtZW50IHx8IGUuZWxlbWVudC50eXBlICE9PSAnZmlsZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXG5cdFx0Ly8gU2V0IGNvbnRleHQga2V5cyBmb3IgdGhlIGl0ZW0gc28gbWVudSBpdGVtcyBjYW4gdXNlIGB3aGVuYCBjbGF1c2VzXG5cdFx0dGhpcy5pdGVtVHlwZUNvbnRleHRLZXkuc2V0KGVsZW1lbnQucHJvbXB0VHlwZSk7XG5cdFx0dGhpcy5pdGVtRGlzYWJsZWRDb250ZXh0S2V5LnNldChlbGVtZW50LmRpc2FibGVkKTtcblx0XHR0aGlzLml0ZW1TdG9yYWdlQ29udGV4dEtleS5zZXQoZWxlbWVudC5zdG9yYWdlKTtcblxuXHRcdC8vIEdldCBtZW51IGFjdGlvbnMgZnJvbSB0aGUgbWVudSBzZXJ2aWNlXG5cdFx0Y29uc3QgY29udGV4dCA9IHtcblx0XHRcdHVyaTogZWxlbWVudC51cmkudG9TdHJpbmcoKSxcblx0XHRcdG5hbWU6IGVsZW1lbnQubmFtZSxcblx0XHRcdHByb21wdFR5cGU6IGVsZW1lbnQucHJvbXB0VHlwZSxcblx0XHRcdGRpc2FibGVkOiBlbGVtZW50LmRpc2FibGVkLFxuXHRcdH07XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoQUlDdXN0b21pemF0aW9uSXRlbU1lbnVJZCwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgeyBhcmc6IGNvbnRleHQsIHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0pO1xuXHRcdGNvbnN0IHsgc2Vjb25kYXJ5IH0gPSBnZXRDb250ZXh0TWVudUFjdGlvbnMobWVudSwgJ2lubGluZScpO1xuXG5cdFx0Ly8gU2hvdyB0aGUgY29udGV4dCBtZW51XG5cdFx0aWYgKHNlY29uZGFyeS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGUuYW5jaG9yLFxuXHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBzZWNvbmRhcnksXG5cdFx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBjb250ZXh0LFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0XHQvLyBDbGVhciB0aGUgY29udGV4dCBrZXlzIHdoZW4gbWVudSBjbG9zZXNcblx0XHRcdFx0XHR0aGlzLml0ZW1UeXBlQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0XHRcdHRoaXMuaXRlbURpc2FibGVkQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdFx0XHRcdHRoaXMuaXRlbVN0b3JhZ2VDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNB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
