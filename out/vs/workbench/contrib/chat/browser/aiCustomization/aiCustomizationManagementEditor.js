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
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { RunOnceScheduler, timeout } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { Event } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { autorun } from "../../../../../base/common/observable.js";
import { Orientation, Sizing, SplitView } from "../../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../../base/common/color.js";
import { localize } from "../../../../../nls.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { EditorPane } from "../../../../browser/parts/editor/editorPane.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { WorkbenchList } from "../../../../../platform/list/browser/listService.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { basename, dirname, isEqual } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { AICustomizationManagementEditorInput } from "./aiCustomizationManagementEditorInput.js";
import { aiCustomizationManagementSectionRegistry } from "./aiCustomizationManagementSectionRegistry.js";
import { AICustomizationListWidget } from "./aiCustomizationListWidget.js";
import { IAICustomizationItemsModel, ITEMS_MODEL_SECTIONS } from "./aiCustomizationItemsModel.js";
import { McpListWidget } from "./mcpListWidget.js";
import { PluginListWidget } from "./pluginListWidget.js";
import { ToolsListWidget } from "./toolsListWidget.js";
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE } from "../agentSessions/agentHost/agentHostToolSetEnablementService.js";
import {
  AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID,
  AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY,
  AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY,
  AICustomizationManagementSection,
  CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR,
  CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION,
  CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  CONTENT_MIN_WIDTH
} from "./aiCustomizationManagement.js";
import { agentIcon, instructionsIcon, promptIcon, skillIcon, hookIcon, pluginIcon, toolsIcon } from "./aiCustomizationIcons.js";
import { ChatModelsWidget } from "../chatManagement/chatModelsWidget.js";
import { PromptsType, Target } from "../../common/promptSyntax/promptTypes.js";
import { IPromptsService, PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { AGENT_MD_FILENAME } from "../../common/promptSyntax/config/promptFileLocations.js";
import { getAttributeDefinition, getTarget } from "../../common/promptSyntax/languageProviders/promptFileAttributes.js";
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from "../promptSyntax/newPromptFileActions.js";
import { showConfigureHooksQuickPick } from "../promptSyntax/hookActions.js";
import { resolveWorkspaceTargetDirectory, resolveUserTargetDirectory, CustomizationLocationPicker } from "./customizationCreatorService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { AICustomizationSources, IAICustomizationWorkspaceService } from "../../common/aiCustomizationWorkspaceService.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Button } from "../../../../../base/browser/ui/button/button.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { Checkbox } from "../../../../../base/browser/ui/toggle/toggle.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { createTextBufferFactoryFromSnapshot } from "../../../../../editor/common/model/textModel.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { getSimpleEditorOptions } from "../../../codeEditor/browser/simpleEditorOptions.js";
import { IWorkingCopyService } from "../../../../services/workingCopy/common/workingCopyService.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { FileSystemProviderCapabilities, IFileService } from "../../../../../platform/files/common/files.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { defaultButtonStyles, defaultCheckboxStyles, defaultInputBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { EmbeddedMcpServerDetail } from "./embeddedMcpServerDetail.js";
import { EmbeddedAgentPluginDetail } from "./embeddedAgentPluginDetail.js";
import { EmbeddedExtensionToolsDetail } from "./embeddedExtensionToolsDetail.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { ChatConfiguration } from "../../common/constants.js";
import { AICustomizationWelcomePage } from "./aiCustomizationWelcomePage.js";
import { getCustomizationMigrationTargetType, migrateCustomizations } from "./customizationMigration.js";
import { CUSTOMIZATION_MIGRATION_CATEGORIES, getCustomizationMigrationCategory, getCustomizationMigrationSourceTypes } from "./customizationMigrationCategories.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { showNoFoldersDialog } from "../promptSyntax/pickers/askForPromptSourceFolder.js";
import { isAgentHostTarget } from "../../common/chatSessionsService.js";
const $ = DOM.$;
class SectionItemDelegate {
  getHeight() {
    return 26;
  }
  getTemplateId() {
    return "sectionItem";
  }
}
class SectionItemRenderer {
  constructor(hoverService) {
    this.hoverService = hoverService;
    this.templateId = "sectionItem";
  }
  renderTemplate(container) {
    container.classList.add("section-list-item");
    const icon = DOM.append(container, $(".section-icon"));
    const label = DOM.append(container, $(".section-label"));
    const count = DOM.append(container, $(".section-count"));
    const templateDisposables = new DisposableStore();
    return { container, icon, label, count, templateDisposables };
  }
  renderElement(element, index, templateData) {
    templateData.templateDisposables.clear();
    templateData.icon.className = "section-icon";
    templateData.icon.classList.add(...ThemeIcon.asClassNameArray(element.icon));
    templateData.label.textContent = element.label;
    if (element.count > 0) {
      templateData.count.textContent = String(element.count);
      templateData.count.style.display = "";
    } else {
      templateData.count.textContent = "";
      templateData.count.style.display = "none";
    }
    templateData.templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), templateData.container, element.description));
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
}
let AICustomizationManagementEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService, openerService, commandService, workspaceService, promptsService, textModelService, configurationService, workingCopyService, hoverService, contextViewService, markdownRendererService, modelService, quickInputService, fileService, notificationService, dialogService, harnessService, viewsService, labelService, itemsModel) {
    super(AICustomizationManagementEditor.ID, group, telemetryService, themeService, storageService);
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.openerService = openerService;
    this.commandService = commandService;
    this.workspaceService = workspaceService;
    this.promptsService = promptsService;
    this.textModelService = textModelService;
    this.configurationService = configurationService;
    this.workingCopyService = workingCopyService;
    this.hoverService = hoverService;
    this.contextViewService = contextViewService;
    this.markdownRendererService = markdownRendererService;
    this.modelService = modelService;
    this.quickInputService = quickInputService;
    this.fileService = fileService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.harnessService = harnessService;
    this.viewsService = viewsService;
    this.labelService = labelService;
    this.itemsModel = itemsModel;
    this.contributedSectionContainers = /* @__PURE__ */ new Map();
    this.contributedSectionWidgets = /* @__PURE__ */ new Map();
    this.editorActionButtonInProgress = false;
    this.editorDisplayMode = "preview";
    this.editorModelChangeDisposables = this._register(new DisposableStore());
    this.editorPreviewDisposables = this._register(new DisposableStore());
    this.editorPreviewRenderScheduler = this._register(new RunOnceScheduler(() => {
      if (this.viewMode === "editor" && this.editorDisplayMode === "preview") {
        this.renderCurrentEditorPreview();
      }
    }, 200));
    this.builtinEditingSessions = /* @__PURE__ */ new Map();
    this.currentEditingReadOnly = false;
    this.editorReturnViewMode = "list";
    this.viewMode = "list";
    this.migrationSearchQuery = "";
    this.collapsedCustomizationMigrationGroups = /* @__PURE__ */ new Set();
    this.selectedCustomizationMigrationItems = new ResourceMap();
    this.migrationPageDisposables = this._register(new DisposableStore());
    this.mcpDetailDisposables = this._register(new DisposableStore());
    this.pluginDetailDisposables = this._register(new DisposableStore());
    this.toolsDetailDisposables = this._register(new DisposableStore());
    this.sections = [];
    this.allSections = [];
    this.customizationsByMigrationCategory = /* @__PURE__ */ new Map();
    this.customizationMigrationRefreshSequence = 0;
    this.editorDisposables = this._register(new DisposableStore());
    this._editorContentChanged = false;
    this.migrationShortcuts = /* @__PURE__ */ new Map();
    this.sidebarWidth = 0;
    this.sidebarHeight = 0;
    this.inEditorContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_EDITOR.bindTo(contextKeyService);
    this.sectionContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_SECTION.bindTo(contextKeyService);
    this.harnessContextKey = CONTEXT_AI_CUSTOMIZATION_MANAGEMENT_HARNESS.bindTo(contextKeyService);
    this.updateHarnessLabelPresentation();
    this._register(autorun((reader) => {
      this.workspaceService.activeProjectRoot.read(reader);
      if (this.viewMode === "editor") {
        this.currentEditingProjectRoot = this.workspaceService.getActiveProjectRoot();
      }
    }));
    this._register(toDisposable(() => {
      this.currentModelRef?.dispose();
      this.currentModelRef = void 0;
    }));
    this._register(toDisposable(() => this.disposeBuiltinEditingSessions()));
    const sectionInfo = {
      [AICustomizationManagementSection.Agents]: { label: localize("agents", "Agents"), icon: agentIcon, description: localize("agentsDesc", "Define custom agents with specialized personas, tool access, and instructions for specific tasks.") },
      [AICustomizationManagementSection.Skills]: { label: localize("skills", "Skills"), icon: skillIcon, description: localize("skillsDesc", "Create reusable skill files that provide domain-specific knowledge and workflows.") },
      [AICustomizationManagementSection.Instructions]: { label: localize("instructions", "Instructions"), icon: instructionsIcon, description: localize("instructionsDesc", "Set always-on instructions that guide AI behavior across your workspace or user profile.") },
      [AICustomizationManagementSection.Prompts]: { label: localize("prompts", "Prompts"), icon: promptIcon, description: localize("promptsDesc", "Reusable prompt templates that can be invoked as slash commands.") },
      [AICustomizationManagementSection.Hooks]: { label: localize("hooks", "Hooks"), icon: hookIcon, description: localize("hooksDesc", "Configure automated actions triggered by events like saving files or running tasks.") },
      [AICustomizationManagementSection.McpServers]: { label: localize("mcpServers", "MCP Servers"), icon: Codicon.server, description: localize("mcpServersDesc", "Connect external tool servers that extend AI capabilities with custom tools and data sources.") },
      [AICustomizationManagementSection.Plugins]: { label: localize("plugins", "Plugins"), icon: pluginIcon, description: localize("pluginsDesc", "Install and manage agent plugins that add additional tools, skills, and integrations.") },
      [AICustomizationManagementSection.Models]: { label: localize("models", "Models"), icon: Codicon.vm, description: localize("modelsDesc", "Configure and manage language models available for use.") },
      [AICustomizationManagementSection.Tools]: { label: localize("tools", "Tools"), icon: toolsIcon, description: localize("toolsDesc", "Enable or disable groups of language model tools available to chat.") }
    };
    const activeHarnessId = this.harnessService.activeHarness.get();
    for (const id of this.workspaceService.managementSections) {
      const contribution = aiCustomizationManagementSectionRegistry.get(id, activeHarnessId) ?? aiCustomizationManagementSectionRegistry.getDefault(id);
      const info = contribution ?? sectionInfo[id];
      if (info) {
        this.allSections.push({ id, label: info.label, icon: info.icon, description: info.description, count: 0 });
      }
    }
    this.rebuildVisibleSections();
    const savedSection = this.storageService.get(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);
    if (savedSection && this.sections.some((s) => s.id === savedSection)) {
      this.selectedSection = savedSection;
    } else {
      this.selectedSection = void 0;
    }
  }
  createEditor(parent) {
    this.editorDisposables.clear();
    this.contributedSectionContainers.clear();
    this.contributedSectionWidgets.clear();
    this.container = DOM.append(parent, $(".ai-customization-management-editor"));
    this.createSplitView();
    this.updateStyles();
  }
  createSplitView() {
    this.splitViewContainer = DOM.append(this.container, $(".management-split-view"));
    this.sidebarContainer = $(".management-sidebar");
    this.contentContainer = $(".management-content");
    this.createSidebar();
    this.createContent();
    this.splitView = this.editorDisposables.add(new SplitView(this.splitViewContainer, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    }));
    const savedWidth = this.storageService.getNumber(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, StorageScope.PROFILE, SIDEBAR_DEFAULT_WIDTH);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.sidebarContainer,
      minimumSize: SIDEBAR_MIN_WIDTH,
      maximumSize: SIDEBAR_MAX_WIDTH,
      layout: (width, _, height) => {
        this.sidebarContainer.style.width = `${width}px`;
        if (height !== void 0) {
          this.layoutSidebar(width, height);
        }
      }
    }, savedWidth, void 0, true);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.contentContainer,
      minimumSize: CONTENT_MIN_WIDTH,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        this.contentContainer.style.width = `${width}px`;
        if (height !== void 0) {
          this.listWidget.layout(height - 16, width - 24);
          this.mcpListWidget?.layout(height - 16, width - 24);
          this.pluginListWidget?.layout(height - 16, width - 24);
          this.toolsListWidget?.layout(height - 16, width - 24);
          const modelsFooterHeight = this.modelsFooterElement?.offsetHeight || 80;
          this.modelsWidget?.layout(height - 16 - modelsFooterHeight, width);
          if (this.viewMode === "editor" && this.embeddedEditor && this.embeddedEditorContainer) {
            const { clientWidth, clientHeight } = this.embeddedEditorContainer;
            if (clientWidth > 0 && clientHeight > 0) {
              this.embeddedEditor.layout({ width: clientWidth, height: clientHeight });
            } else if (this.dimension) {
              DOM.getWindow(this.embeddedEditorContainer).requestAnimationFrame(() => {
                if (this.embeddedEditor && this.embeddedEditorContainer) {
                  const { clientWidth: w, clientHeight: h } = this.embeddedEditorContainer;
                  if (w > 0 && h > 0) {
                    this.embeddedEditor.layout({ width: w, height: h });
                  }
                }
              });
            }
          }
        }
      }
    }, Sizing.Distribute, void 0, true);
    this.editorDisposables.add(this.splitView.onDidSashChange(() => {
      const width = this.splitView.getViewSize(0);
      this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SIDEBAR_WIDTH_KEY, width, StorageScope.PROFILE, StorageTarget.USER);
    }));
    this.editorDisposables.add(this.splitView.onDidSashReset(() => {
      const totalWidth = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
      this.splitView.resizeView(0, SIDEBAR_DEFAULT_WIDTH);
      this.splitView.resizeView(1, totalWidth - SIDEBAR_DEFAULT_WIDTH);
    }));
  }
  getActiveHarnessLabel() {
    const label = this.harnessService.getActiveDescriptor().label;
    return label || (this.workspaceService.isSessionsWindow ? "" : localize("localHarnessLabel", "Local"));
  }
  updateHarnessLabelPresentation() {
    const harnessLabel = this.getActiveHarnessLabel();
    AICustomizationManagementEditorInput.getOrCreate().setHarnessLabel(harnessLabel);
    this.welcomePage?.setHarnessLabel(harnessLabel);
  }
  /**
   * Rebuilds the visible sections list based on the active harness's
   * `hiddenSections`. If the current selection falls into a hidden
   * section, the first visible section is selected instead.
   */
  rebuildVisibleSections() {
    const activeId = this.harnessService.activeHarness.get();
    const descriptor = this.harnessService.findHarnessById(activeId);
    const hidden = new Set(descriptor?.hiddenSections ?? []);
    this.sections.length = 0;
    for (const s of this.allSections) {
      const contribution = aiCustomizationManagementSectionRegistry.get(s.id, activeId);
      const contributed = aiCustomizationManagementSectionRegistry.has(s.id);
      if (!hidden.has(s.id) && (!contributed || !!contribution)) {
        this.sections.push(contribution ? { ...s, label: contribution.label, icon: contribution.icon, description: contribution.description } : s);
      }
    }
    if (this.sectionsList) {
      this.sectionsList.splice(0, this.sectionsList.length, this.sections);
      this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
    }
    this.welcomePage?.rebuildCards(new Set(this.sections.map((s) => s.id)));
    if (this.selectedSection !== void 0 && !this.sections.some((s) => s.id === this.selectedSection) && this.sections.length > 0) {
      this.showWelcomePage();
    } else {
      this.ensureSectionsListReflectsActiveSection();
    }
  }
  createSidebar() {
    const sidebarContent = DOM.append(this.sidebarContainer, $(".sidebar-content"));
    this.createSidebarHeader(sidebarContent);
    const sectionsListContainer = this.sectionsListContainer = DOM.append(sidebarContent, $(".sidebar-sections-list"));
    this.sectionsList = this.editorDisposables.add(this.instantiationService.createInstance(
      WorkbenchList,
      "AICustomizationManagementSections",
      sectionsListContainer,
      new SectionItemDelegate(),
      [new SectionItemRenderer(this.hoverService)],
      {
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        horizontalScrolling: false,
        accessibilityProvider: {
          getAriaLabel: (item) => item.count > 0 ? localize("sectionAriaLabelWithCount", "{0}, {1} items", item.label, item.count) : item.label,
          getWidgetAriaLabel: () => localize("sectionsAriaLabel", "Agent Customization Sections")
        },
        openOnSingleClick: true,
        identityProvider: {
          getId: (item) => item.id
        }
      }
    ));
    this.sectionsList.splice(0, this.sectionsList.length, this.sections);
    this.ensureSectionsListReflectsActiveSection();
    this.editorDisposables.add(this.sectionsList.onDidChangeSelection((e) => {
      if (e.elements.length === 0) {
        if (this.selectedSection !== void 0) {
          this.showWelcomePage();
        }
        return;
      }
      this.selectSection(e.elements[0].id);
    }));
    this.editorDisposables.add(autorun((reader) => {
      this.harnessService.availableHarnesses.read(reader);
      const activeId = this.harnessService.activeHarness.read(reader);
      this.harnessContextKey.set(activeId);
      this.updateHomeButtonHarnessPresentation();
      this.rebuildVisibleSections();
      if (this._previousActiveHarnessId !== void 0 && this._previousActiveHarnessId !== activeId) {
        for (const [section, widget] of this.contributedSectionWidgets) {
          this.editorDisposables.delete(widget);
          this.contributedSectionContainers.get(section)?.replaceChildren();
        }
        this.contributedSectionWidgets.clear();
        for (const section of this.sections) {
          this.updateSectionCount(section.id, 0);
        }
      }
      this._previousActiveHarnessId = activeId;
    }));
    this.editorDisposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled)) {
        this.onStructuredPreviewSettingChanged();
      }
      if (CUSTOMIZATION_MIGRATION_CATEGORIES.some((category) => e.affectsConfiguration(category.enablementSetting))) {
        void this.refreshCustomizationMigrationInfo();
      }
    }));
    this.createSidebarMigrationShortcut(sidebarContent);
  }
  layoutSidebar(width, height) {
    this.sidebarWidth = width;
    this.sidebarHeight = height;
    if (!this.sectionsListContainer) {
      return;
    }
    const headerHeight = this.sidebarHeaderContainer?.offsetHeight ?? 0;
    const migrationHeight = this.migrationShortcutContainer?.style.display !== "none" ? this.migrationShortcutContainer?.offsetHeight ?? 0 : 0;
    const availableListHeight = Math.max(0, height - 8 - headerHeight - migrationHeight);
    const listHeight = Math.min(availableListHeight, this.sections.length * 26);
    this.sectionsListContainer.style.height = `${listHeight}px`;
    this.sectionsList.layout(listHeight, width);
  }
  createSidebarHeader(sidebarContent) {
    const headerRow = this.sidebarHeaderContainer = DOM.append(sidebarContent, $(".sidebar-header-row"));
    const homeButton = this.homeButton = DOM.append(headerRow, $("button.sidebar-home-button"));
    homeButton.classList.add("sidebar-harness-home-button");
    homeButton.setAttribute("aria-label", localize("homeButton", "Overview"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), homeButton, localize("homeButtonTooltip", "Back to overview")));
    const homeIcon = this.homeButtonIcon = DOM.append(homeButton, $("span.sidebar-home-icon"));
    homeIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.home));
    homeIcon.setAttribute("aria-hidden", "true");
    const homeLabel = this.homeButtonLabel = DOM.append(homeButton, $("span.sidebar-home-label"));
    homeLabel.textContent = localize("homeButtonLabel", "Overview");
    this.editorDisposables.add(DOM.addDisposableListener(homeButton, "click", () => {
      this.showWelcomePage();
    }));
    this.updateHomeButtonHarnessPresentation();
    this.updateHomeButtonStyle();
  }
  updateHomeButtonStyle() {
    if (!this.homeButtonLabel || !this.homeButton) {
      return;
    }
    this.homeButtonLabel.style.display = "";
    this.homeButton.style.flex = "1";
  }
  updateHomeButtonHarnessPresentation() {
    this.updateHarnessLabelPresentation();
    if (!this.homeButton || !this.homeButtonIcon || !this.homeButtonLabel) {
      return;
    }
    this.homeButtonIcon.className = "sidebar-home-icon";
    this.homeButtonIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.home));
    this.homeButtonLabel.textContent = localize("homeButtonLabel", "Overview");
    this.homeButton.setAttribute("aria-label", localize("homeButton", "Overview"));
    this.homeButton.title = localize("homeButtonTooltip", "Back to overview");
  }
  createSidebarMigrationShortcut(sidebarContent) {
    const container = this.migrationShortcutContainer = DOM.append(sidebarContent, $(".sidebar-migration-shortcut"));
    container.style.display = "none";
    DOM.append(container, $("div.sidebar-migration-separator"));
    for (const category of CUSTOMIZATION_MIGRATION_CATEGORIES) {
      const button = DOM.append(container, $("button.sidebar-migration-button"));
      button.type = "button";
      button.style.display = "none";
      button.setAttribute("aria-label", category.shortcutLabel);
      this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), button, category.shortcutTooltip));
      const icon = DOM.append(button, $("span.sidebar-migration-icon"));
      icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
      icon.setAttribute("aria-hidden", "true");
      const label = DOM.append(button, $("span.sidebar-migration-label"));
      label.textContent = category.shortcutLabel;
      const count = DOM.append(button, $("span.sidebar-migration-count"));
      this.editorDisposables.add(DOM.addDisposableListener(button, "click", () => {
        this.showCustomizationMigrationPage(category.id);
      }));
      this.migrationShortcuts.set(category.id, { button, count });
    }
  }
  createWelcomePage(parent) {
    this.welcomePage = this.editorDisposables.add(new AICustomizationWelcomePage(
      parent,
      this.workspaceService.welcomePageFeatures,
      {
        selectSection: (section) => this.selectSection(section),
        selectSectionWithMarketplace: (section) => this.selectSection(section, { showMarketplace: true }),
        closeEditor: () => {
          if (this.input) {
            this.group.closeEditor(this.input);
          }
        },
        migrateCustomizations: (categoryId) => {
          this.showCustomizationMigrationPage(categoryId);
        },
        prefillChat: async (query, options) => {
          try {
            if (this.workspaceService.isSessionsWindow) {
              const sessionsViewId = "workbench.view.sessions.chat";
              if (options?.newChat) {
                await this.commandService.executeCommand("workbench.action.sessions.newChat");
              }
              const view = await this.viewsService.openView(sessionsViewId, true);
              const chatView = view;
              if (options?.isPartialQuery && chatView?.prefillInput) {
                chatView.prefillInput(query);
              } else if (chatView?.sendQuery) {
                chatView.sendQuery(query);
              }
            } else {
              if (options?.newChat) {
                await this.commandService.executeCommand("workbench.action.chat.newChat");
              }
              await this.commandService.executeCommand("workbench.action.chat.open", { query, isPartialQuery: options?.isPartialQuery ?? false });
            }
          } catch (err) {
            onUnexpectedError(err);
          }
        }
      },
      this.commandService,
      this.workspaceService,
      this.hoverService,
      this.getActiveHarnessLabel()
    ));
    this.welcomePage.rebuildCards(new Set(this.sections.map((s) => s.id)));
    this.welcomePage.setMigrationCategories(this.getMigrationCategorySummaries());
  }
  createBackArrowButton(onClick) {
    const button = $("button.section-back-arrow-button");
    button.type = "button";
    button.setAttribute("aria-label", localize("backToOverview", "Back to overview"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), button, localize("backToOverviewTooltip", "Back to overview")));
    const icon = DOM.append(button, $("span.section-back-arrow-icon"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.arrowLeft));
    icon.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(button, "click", () => {
      if (onClick) {
        onClick();
      } else {
        this.showWelcomePage();
      }
    }));
    return button;
  }
  createCustomizationMigrationContent(contentInner) {
    this.migrationContentContainer = DOM.append(contentInner, $(".prompt-migration-content-container.ai-customization-list-widget"));
    const header = DOM.append(this.migrationContentContainer, $(".section-title-header"));
    const titleRow = DOM.append(header, $(".section-title-row"));
    this.migrationTitleElement = DOM.append(titleRow, $("h2.section-title"));
    this.migrationDescriptionElement = DOM.append(header, $("p.section-title-description"));
    this.migrationBannerContainer = DOM.append(this.migrationContentContainer, $(".customization-migration-banner"));
    this.migrationBannerContainer.style.display = "none";
    const sectionLink = this.migrationLinkElement = DOM.append(this.migrationContentContainer, $("a.section-title-link.migration-learn-more-link"));
    this.editorDisposables.add(DOM.addDisposableListener(sectionLink, "click", (e) => {
      e.preventDefault();
      this.openerService.open(URI.parse(sectionLink.href));
    }));
    const actions = DOM.append(this.migrationContentContainer, $(".list-search-and-button-container.prompt-migration-actions"));
    const searchContainer = DOM.append(actions, $(".list-search-container"));
    this.migrationSearchInput = this.editorDisposables.add(new InputBox(searchContainer, this.contextViewService, {
      placeholder: localize("customizationMigrationSearchPlaceholder", "Type to search..."),
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.editorDisposables.add(this.migrationSearchInput.onDidChange(() => {
      this.migrationSearchQuery = this.migrationSearchInput?.value ?? "";
      this.renderCustomizationMigrationPage();
    }));
    const actionButtonContainer = DOM.append(actions, $(".list-add-button-container"));
    this.migrationMigrateButton = this.editorDisposables.add(new Button(actionButtonContainer, defaultButtonStyles));
    this.migrationMigrateButton.element.classList.add("list-add-button", "prompt-migration-button");
    this.migrationMigrateButton.label = localize("customizationMigrationPageButton", "Migrate");
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.migrationMigrateButton.element, () => this.getActiveMigrationCategory()?.migrateButtonTooltip ?? ""));
    this.editorDisposables.add(this.migrationMigrateButton.onDidClick(() => {
      const category = this.getActiveMigrationCategory();
      if (!category) {
        return;
      }
      const selectedCustomizations = this.getMigrationCandidates(category).filter((customization) => this.isCustomizationSelectedForMigration(customization));
      void this.migrateSelectedCustomizations(category, selectedCustomizations);
    }));
    this.migrationListContainer = $(".prompt-migration-list.list-container");
    this.migrationListScrollable = this.editorDisposables.add(new DomScrollableElement(this.migrationListContainer, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto,
      useShadows: false
    }));
    const migrationListScrollableNode = this.migrationListScrollable.getDomNode();
    migrationListScrollableNode.classList.add("prompt-migration-list-scrollable");
    this.migrationContentContainer.appendChild(migrationListScrollableNode);
    const targetWindow = DOM.getWindow(this.migrationContentContainer);
    const migrationResizeObserver = this.editorDisposables.add(new DOM.DisposableResizeObserver(
      "AICustomizationManagementEditor.promptMigrationListScrollable",
      () => this.migrationListScrollable?.scanDomNode(),
      targetWindow
    ));
    this.editorDisposables.add(migrationResizeObserver.observe(migrationListScrollableNode));
    this.renderCustomizationMigrationPage();
  }
  createContent() {
    const contentInner = DOM.append(this.contentContainer, $(".content-inner"));
    this.createWelcomePage(contentInner);
    this.editorDisposables.add(Event.any(
      this.promptsService.onDidChangeSlashCommands,
      this.promptsService.onDidChangeCustomAgents,
      this.promptsService.onDidChangeInstructions,
      this.promptsService.onDidChangeAgentInstructions
    )(() => {
      void this.refreshCustomizationMigrationInfo();
    }));
    this.editorDisposables.add(autorun((reader) => {
      this.harnessService.activeHarness.read(reader);
      void this.refreshCustomizationMigrationInfo();
    }));
    this.promptsContentContainer = DOM.append(contentInner, $(".prompts-content-container"));
    this.listWidget = this.editorDisposables.add(this.instantiationService.createInstance(AICustomizationListWidget));
    this.promptsContentContainer.appendChild(this.listWidget.element);
    this.createCustomizationMigrationContent(contentInner);
    this.editorDisposables.add(this.listWidget.onDidSelectItem((item) => {
      this.telemetryService.publicLog2("chatCustomizationEditor.itemSelected", {
        section: this.selectedSection ?? "welcome",
        promptType: item.promptType,
        storage: item.source ?? "external"
      });
      const source = item.source;
      const isWorkspaceFile = source === AICustomizationSources.local;
      const isReadOnly = !source || source === AICustomizationSources.extension || source === AICustomizationSources.plugin || source === AICustomizationSources.builtin;
      this.showEmbeddedEditor(item.uri, item.name, item.promptType, source ?? AICustomizationSources.builtin, isWorkspaceFile, isReadOnly);
    }));
    this.editorDisposables.add(this.listWidget.onDidRequestCreate((promptType) => {
      this.createNewItemWithAI(promptType);
    }));
    this.editorDisposables.add(this.listWidget.onDidRequestCreateManual(({ type, target, rootFileName }) => {
      this.createNewItemManual(type, target, rootFileName);
    }));
    const hasSections = new Set(this.workspaceService.managementSections);
    if (hasSections.has(AICustomizationManagementSection.Models)) {
      this.modelsContentContainer = DOM.append(contentInner, $(".models-content-container"));
      const modelsBackBar = DOM.append(this.modelsContentContainer, $(".section-back-bar"));
      modelsBackBar.appendChild(this.createBackArrowButton());
      this.modelsWidget = this.editorDisposables.add(this.instantiationService.createInstance(ChatModelsWidget));
      this.modelsContentContainer.appendChild(this.modelsWidget.element);
      this.modelsFooterElement = DOM.append(this.modelsContentContainer, $(".section-footer"));
      const modelsDescription = DOM.append(this.modelsFooterElement, $("p.section-footer-description"));
      modelsDescription.textContent = localize("modelsDescription", "Browse and manage language models from different providers. Select models for use in chat, code completion, and other AI features.");
      const modelsLink = DOM.append(this.modelsFooterElement, $("a.section-footer-link"));
      modelsLink.textContent = localize("learnMoreModels", "Learn more about language models");
      modelsLink.href = "https://code.visualstudio.com/docs/agent-customization/language-models?referrer=in-product";
      this.editorDisposables.add(DOM.addDisposableListener(modelsLink, "click", (e) => {
        e.preventDefault();
        this.openerService.open(URI.parse(modelsLink.href));
      }));
    }
    if (hasSections.has(AICustomizationManagementSection.McpServers)) {
      this.mcpContentContainer = DOM.append(contentInner, $(".mcp-content-container"));
      this.mcpListWidget = this.editorDisposables.add(this.instantiationService.createInstance(McpListWidget));
      this.mcpListWidget.setCloseCustomizationEditor(async () => {
        if (this.input) {
          await this.group.closeEditor(this.input);
        }
      });
      this.mcpContentContainer.appendChild(this.mcpListWidget.element);
      this.mcpDetailContainer = DOM.append(contentInner, $(".mcp-detail-container"));
      this.createEmbeddedMcpDetail();
      this.editorDisposables.add(this.mcpListWidget.onDidSelectServer((server) => {
        this.showEmbeddedMcpDetail(server);
      }));
      this.editorDisposables.add(this.mcpListWidget.onDidRequestShowPlugin((item) => {
        this.showPluginDetail(item);
      }));
    }
    if (hasSections.has(AICustomizationManagementSection.Plugins)) {
      this.pluginContentContainer = DOM.append(contentInner, $(".plugin-content-container"));
      this.pluginListWidget = this.editorDisposables.add(this.instantiationService.createInstance(PluginListWidget));
      this.pluginContentContainer.appendChild(this.pluginListWidget.element);
      this.pluginDetailContainer = DOM.append(contentInner, $(".plugin-detail-container"));
      this.createEmbeddedPluginDetail();
      this.editorDisposables.add(this.pluginListWidget.onDidSelectPlugin((item) => {
        this.pluginDetailReturnSection = void 0;
        this.showEmbeddedPluginDetail(item);
      }));
    }
    if (hasSections.has(AICustomizationManagementSection.Tools)) {
      this.toolsContentContainer = DOM.append(contentInner, $(".tools-content-container"));
      this.toolsListWidget = this.editorDisposables.add(this.instantiationService.createInstance(ToolsListWidget, AGENT_HOST_COPILOT_CLI_SESSION_TYPE));
      this.toolsContentContainer.appendChild(this.toolsListWidget.element);
      this.toolsDetailContainer = DOM.append(contentInner, $(".tools-detail-container"));
      this.createEmbeddedToolDetail();
      this.editorDisposables.add(this.toolsListWidget.onDidSelectExtension((extension) => {
        this.showEmbeddedToolDetail(extension);
      }));
    }
    for (const section of this.workspaceService.managementSections) {
      if (!aiCustomizationManagementSectionRegistry.has(section)) {
        continue;
      }
      const container = DOM.append(contentInner, $(".contributed-section-container"));
      this.contributedSectionContainers.set(section, container);
    }
    this.editorContentContainer = DOM.append(contentInner, $(".editor-content-container"));
    this.createEmbeddedEditor();
    this.updateContentVisibility();
    this.editorDisposables.add(this.listWidget.onDidChangeItemCount((count) => {
      if (this.isPromptsSection(this.selectedSection)) {
        this.updateSectionCount(this.selectedSection, count);
      }
    }));
    if (this.mcpListWidget) {
      this.editorDisposables.add(this.mcpListWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.McpServers, count);
      }));
      this.mcpListWidget.fireItemCount();
    }
    if (this.pluginListWidget) {
      this.editorDisposables.add(this.pluginListWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.Plugins, count);
      }));
      this.pluginListWidget.fireItemCount();
    }
    if (this.modelsWidget) {
      this.editorDisposables.add(this.modelsWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.Models, count);
      }));
      this.modelsWidget.fireItemCount();
    }
    if (this.toolsListWidget) {
      this.editorDisposables.add(this.toolsListWidget.onDidChangeItemCount((count) => {
        this.updateSectionCount(AICustomizationManagementSection.Tools, count);
      }));
      this.toolsListWidget.fireItemCount();
    }
    for (const section of ITEMS_MODEL_SECTIONS) {
      const observable = this.itemsModel.getCount(section);
      this.editorDisposables.add(autorun((reader) => {
        this.updateSectionCount(section, observable.read(reader));
      }));
    }
    if (this.isPromptsSection(this.selectedSection)) {
      void this.listWidget.setSection(this.selectedSection);
    }
    void this.refreshCustomizationMigrationInfo();
  }
  async refreshCustomizationMigrationInfo() {
    const activeHarnessId = this.harnessService.activeHarness.get();
    const refreshSequence = ++this.customizationMigrationRefreshSequence;
    if (!isAgentHostTarget(activeHarnessId)) {
      this.setCustomizationsToMigrate(/* @__PURE__ */ new Map());
      return;
    }
    try {
      const enabledCategories = this.getEnabledMigrationCategories();
      if (enabledCategories.length === 0) {
        this.setCustomizationsToMigrate(/* @__PURE__ */ new Map());
        return;
      }
      const sourceTypes = getCustomizationMigrationSourceTypes(enabledCategories);
      const customizationsByType = await Promise.all(sourceTypes.map((type) => this.promptsService.listPromptFiles(type, CancellationToken.None)));
      if (refreshSequence !== this.customizationMigrationRefreshSequence || activeHarnessId !== this.harnessService.activeHarness.get()) {
        return;
      }
      const allCustomizations = customizationsByType.flat();
      const candidatesByCategory = /* @__PURE__ */ new Map();
      for (const category of enabledCategories) {
        candidatesByCategory.set(category.id, allCustomizations.filter((customization) => category.isCandidate(customization)));
      }
      this.setCustomizationsToMigrate(candidatesByCategory);
    } catch (error) {
      if (refreshSequence === this.customizationMigrationRefreshSequence) {
        this.setCustomizationsToMigrate(/* @__PURE__ */ new Map());
      }
      onUnexpectedError(error);
    }
  }
  setCustomizationsToMigrate(candidatesByCategory) {
    const previousItems = this.createCustomizationMigrationItemMap(this.getAllMigrationCandidates());
    const selectedItems = new ResourceMap();
    for (const customization of [...candidatesByCategory.values()].flat()) {
      if (!this.hasCustomizationMigrationItem(previousItems, customization) || this.isCustomizationSelectedForMigration(customization)) {
        this.addCustomizationMigrationItem(selectedItems, customization);
      }
    }
    this.selectedCustomizationMigrationItems = selectedItems;
    this.customizationsByMigrationCategory = candidatesByCategory;
    this.refreshCustomizationMigrationUi();
  }
  createCustomizationMigrationItemMap(customizations) {
    const result = new ResourceMap();
    for (const customization of customizations) {
      this.addCustomizationMigrationItem(result, customization);
    }
    return result;
  }
  hasCustomizationMigrationItem(items, customization) {
    return items.get(customization.uri)?.has(customization.storage) === true;
  }
  addCustomizationMigrationItem(items, customization) {
    const storages = items.get(customization.uri) ?? /* @__PURE__ */ new Set();
    storages.add(customization.storage);
    items.set(customization.uri, storages);
  }
  isCustomizationSelectedForMigration(customization) {
    return this.hasCustomizationMigrationItem(this.selectedCustomizationMigrationItems, customization);
  }
  setCustomizationSelectedForMigration(customization, selected) {
    if (selected) {
      this.addCustomizationMigrationItem(this.selectedCustomizationMigrationItems, customization);
      return;
    }
    const storages = this.selectedCustomizationMigrationItems.get(customization.uri);
    storages?.delete(customization.storage);
    if (storages?.size === 0) {
      this.selectedCustomizationMigrationItems.delete(customization.uri);
    }
  }
  getMigrationCandidates(category) {
    if (!this.isMigrationCategoryEnabled(category)) {
      return [];
    }
    return this.customizationsByMigrationCategory.get(category.id) ?? [];
  }
  getAllMigrationCandidates() {
    return [...this.customizationsByMigrationCategory.values()].flat();
  }
  getActiveMigrationCategory() {
    return this.activeMigrationCategoryId ? getCustomizationMigrationCategory(this.activeMigrationCategoryId) : void 0;
  }
  getMigrationCategorySummaries() {
    const harnessLabel = this.getActiveHarnessLabel();
    const summaries = [];
    for (const category of CUSTOMIZATION_MIGRATION_CATEGORIES) {
      const candidates = this.getMigrationCandidates(category);
      if (candidates.length === 0) {
        continue;
      }
      summaries.push({
        id: category.id,
        label: category.cardLabel,
        description: category.getCardDescription(candidates, harnessLabel),
        actionLabel: category.cardActionLabel,
        actionAriaLabel: category.cardActionAriaLabel,
        count: candidates.length
      });
    }
    return summaries;
  }
  refreshCustomizationMigrationUi() {
    this.welcomePage?.setMigrationCategories(this.getMigrationCategorySummaries());
    this.updateSidebarMigrationShortcut();
    this.renderCustomizationMigrationPage();
  }
  updateSidebarMigrationShortcut() {
    if (!this.migrationShortcutContainer) {
      return;
    }
    let hasVisibleShortcut = false;
    for (const category of CUSTOMIZATION_MIGRATION_CATEGORIES) {
      const shortcut = this.migrationShortcuts.get(category.id);
      if (!shortcut) {
        continue;
      }
      const count = this.getMigrationCandidates(category).length;
      if (count === 0) {
        shortcut.button.style.display = "none";
        continue;
      }
      hasVisibleShortcut = true;
      shortcut.button.style.display = "";
      shortcut.count.textContent = String(count);
      shortcut.button.setAttribute("aria-label", category.getShortcutAriaLabel(count));
    }
    this.migrationShortcutContainer.style.display = hasVisibleShortcut ? "" : "none";
    this.layoutSidebar(this.sidebarWidth, this.sidebarHeight);
  }
  async migrateSelectedCustomizations(category, customizations) {
    if (customizations.length === 0 || !this.isMigrationCategoryEnabled(category)) {
      return;
    }
    const confirmation = category.getConfirmation(customizations, this.getActiveHarnessLabel());
    const confirmResult = await this.dialogService.confirm({
      type: "question",
      message: confirmation.message,
      detail: confirmation.detail,
      checkbox: {
        label: confirmation.deleteOriginalsLabel,
        checked: true
      },
      primaryButton: confirmation.primaryButton
    });
    if (!confirmResult.confirmed) {
      return;
    }
    const targetFolders = await this.resolveCustomizationMigrationTargetFolders(customizations);
    if (!targetFolders) {
      return;
    }
    const migrationResult = await migrateCustomizations(
      customizations,
      targetFolders,
      this.fileService,
      onUnexpectedError,
      { deleteOriginalFiles: confirmResult.checkboxChecked !== false }
    );
    const { migratedCount, failedCustomizationFileNames, unsupportedHeaderKeys, migratedCustomizations } = migrationResult;
    if (failedCustomizationFileNames.length > 0) {
      const displayedFileNames = failedCustomizationFileNames.slice(0, 3);
      const hiddenFileCount = failedCustomizationFileNames.length - displayedFileNames.length;
      this.notificationService.error(category.getFailedMessage(displayedFileNames, hiddenFileCount));
    }
    if (migratedCount === 0) {
      if (failedCustomizationFileNames.length === 0) {
        this.notificationService.warn(category.noFilesMigratedMessage);
      }
      return;
    }
    await this.refreshCustomizationMigrationInfo();
    const unsupportedKeysLabel = unsupportedHeaderKeys.join(", ");
    this.notificationService.info(unsupportedKeysLabel.length > 0 && category.getMigratedWithReviewMessage ? category.getMigratedWithReviewMessage(migratedCount, unsupportedKeysLabel) : category.getMigratedMessage(migratedCount));
    void this.revealMigratedCustomizations(migratedCustomizations);
  }
  renderCustomizationMigrationPage() {
    if (!this.migrationListContainer || !this.migrationMigrateButton) {
      return;
    }
    this.migrationPageDisposables.clear();
    DOM.clearNode(this.migrationListContainer);
    const category = this.getActiveMigrationCategory() ?? CUSTOMIZATION_MIGRATION_CATEGORIES[0];
    const candidates = this.getMigrationCandidates(category);
    this.updateCustomizationMigrationPageHeader(category, candidates);
    if (candidates.length === 0) {
      const emptyMessage = DOM.append(this.migrationListContainer, $("p.prompt-migration-empty"));
      emptyMessage.textContent = category.pageEmptyMessage;
      this.migrationMigrateButton.enabled = false;
      this.migrationListScrollable?.scanDomNode();
      return;
    }
    const query = this.migrationSearchQuery.trim().toLowerCase();
    const filteredCustomizations = candidates.filter((customization) => {
      if (!query) {
        return true;
      }
      const displayName = (customization.name ?? basename(customization.uri)).toLowerCase();
      const relativePath = this.labelService.getUriLabel(customization.uri, { relative: true }).toLowerCase();
      return displayName.includes(query) || relativePath.includes(query);
    });
    if (filteredCustomizations.length === 0) {
      const emptyMessage = DOM.append(this.migrationListContainer, $("p.prompt-migration-empty"));
      emptyMessage.textContent = category.searchEmptyMessage;
      this.updateCustomizationMigrationActionState();
      this.migrationListScrollable?.scanDomNode();
      return;
    }
    const openCustomizationInEmbeddedEditor = (customization) => {
      const isWorkspaceFile = customization.storage === PromptsStorage.local;
      void this.showEmbeddedEditor(
        customization.uri,
        customization.name ?? basename(customization.uri),
        customization.type,
        customization.storage,
        isWorkspaceFile
      );
    };
    const renderSelectionCheckbox = (row, customization) => {
      const checkboxContainer = DOM.append(row, $(".item-sync-checkbox.prompt-migration-checkbox"));
      const checkboxTitle = localize("customizationMigrationSelectAriaLabel", "Select {0}", customization.name ?? basename(customization.uri));
      const checkbox = this.migrationPageDisposables.add(new Checkbox(checkboxTitle, this.isCustomizationSelectedForMigration(customization), defaultCheckboxStyles));
      checkboxContainer.replaceChildren(checkbox.domNode);
      this.migrationPageDisposables.add(checkbox.onChange(() => {
        this.setCustomizationSelectedForMigration(customization, checkbox.checked);
        this.updateCustomizationMigrationActionState();
      }));
    };
    const renderItem = (container, customization) => {
      const row = DOM.append(container, $("div.ai-customization-list-item.prompt-migration-item"));
      renderSelectionCheckbox(row, customization);
      const itemLeft = DOM.append(row, $("span.item-left"));
      const displayName = customization.name ?? basename(customization.uri);
      const relativePath = this.labelService.getUriLabel(customization.uri, { relative: true });
      const openButton = this.migrationPageDisposables.add(new Button(itemLeft, {
        ariaLabel: localize("openCustomizationFile", "Open {0}, {1}", displayName, relativePath)
      }));
      openButton.label = displayName;
      DOM.clearNode(openButton.element);
      openButton.element.classList.add("item-text", "prompt-migration-open-button");
      this.migrationPageDisposables.add(openButton.onDidClick(() => openCustomizationInEmbeddedEditor(customization)));
      const itemText = openButton.element;
      const nameRow = DOM.append(itemText, $("span.item-name-row"));
      const nameLabel = DOM.append(nameRow, $("span.item-name.prompt-migration-item-name"));
      nameLabel.textContent = displayName;
      const pathLabel = DOM.append(itemText, $("span.item-description.is-filename.prompt-migration-item-path"));
      pathLabel.textContent = relativePath;
      const itemRight = DOM.append(row, $("span.item-right"));
      const deleteButton = DOM.append(itemRight, $("button.icon-button", {
        type: "button",
        "aria-label": localize("deleteCustomizationFile", "Delete {0}", customization.name ?? basename(customization.uri))
      }));
      deleteButton.classList.add(...ThemeIcon.asClassNameArray(Codicon.trash));
      this.migrationPageDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), deleteButton, localize("deleteCustomizationFileTooltip", "Delete")));
      this.migrationPageDisposables.add(DOM.addDisposableListener(deleteButton, "click", (event) => {
        event.stopPropagation();
        void this.deleteCustomizationFile(customization);
      }));
    };
    const renderGroup = (groupKey, groupLabel, customizations) => {
      if (customizations.length === 0) {
        return;
      }
      const group = DOM.append(this.migrationListContainer, $(".prompt-migration-group"));
      const groupHeader = DOM.append(group, $(".ai-customization-group-header.prompt-migration-group-header"));
      const groupCheckboxContainer = DOM.append(groupHeader, $(".item-sync-checkbox.prompt-migration-group-checkbox"));
      const allInGroupSelected = customizations.every((customization) => this.isCustomizationSelectedForMigration(customization));
      const groupCheckboxAriaLabel = localize("customizationMigrationSelectGroupAriaLabel", "Select all customizations in {0}", groupLabel);
      const groupCheckbox = this.migrationPageDisposables.add(new Checkbox(groupCheckboxAriaLabel, allInGroupSelected, defaultCheckboxStyles));
      groupCheckboxContainer.replaceChildren(groupCheckbox.domNode);
      this.migrationPageDisposables.add(groupCheckbox.onChange(() => {
        for (const customization of customizations) {
          this.setCustomizationSelectedForMigration(customization, groupCheckbox.checked);
        }
        this.renderCustomizationMigrationPage();
      }));
      const groupToggle = DOM.append(groupHeader, $("button.prompt-migration-group-toggle"));
      groupToggle.type = "button";
      const groupId = `prompt-migration-group-${category.id}-${groupKey}`;
      const collapsed = this.collapsedCustomizationMigrationGroups.has(groupId);
      groupToggle.setAttribute("aria-controls", `${groupId}-items`);
      groupToggle.setAttribute("aria-expanded", String(!collapsed));
      const chevron = DOM.append(groupToggle, $("span.group-chevron"));
      chevron.setAttribute("aria-hidden", "true");
      const groupLabelGroup = DOM.append(groupToggle, $(".group-label-group"));
      const label = DOM.append(groupLabelGroup, $("span.group-label"));
      label.textContent = groupLabel;
      const count = DOM.append(groupToggle, $("span.group-count"));
      count.textContent = String(customizations.length);
      const groupItems = DOM.append(group, $(".prompt-migration-group-items"));
      groupItems.id = `${groupId}-items`;
      const setGroupCollapsed = (collapsed2) => {
        groupItems.style.display = collapsed2 ? "none" : "";
        chevron.className = "group-chevron";
        chevron.classList.add(...ThemeIcon.asClassNameArray(collapsed2 ? Codicon.chevronRight : Codicon.chevronDown));
        groupToggle.setAttribute("aria-expanded", String(!collapsed2));
        this.migrationListScrollable?.scanDomNode();
      };
      setGroupCollapsed(collapsed);
      this.migrationPageDisposables.add(DOM.addDisposableListener(groupToggle, "click", () => {
        if (this.collapsedCustomizationMigrationGroups.has(groupId)) {
          this.collapsedCustomizationMigrationGroups.delete(groupId);
          setGroupCollapsed(false);
        } else {
          this.collapsedCustomizationMigrationGroups.add(groupId);
          setGroupCollapsed(true);
        }
      }));
      for (const customization of customizations) {
        renderItem(groupItems, customization);
      }
    };
    const groups = category.group(filteredCustomizations);
    const groupedUris = new ResourceSet();
    for (const group of groups) {
      for (const customization of group.customizations) {
        groupedUris.add(customization.uri);
      }
      renderGroup(group.key, group.label, group.customizations);
    }
    for (const customization of filteredCustomizations.filter((item) => !groupedUris.has(item.uri))) {
      renderItem(this.migrationListContainer, customization);
    }
    this.updateCustomizationMigrationActionState();
    this.migrationListScrollable?.scanDomNode();
  }
  updateCustomizationMigrationPageHeader(category, candidates) {
    if (this.migrationTitleElement) {
      this.migrationTitleElement.textContent = category.pageTitle;
    }
    const banner = candidates.length > 0 ? category.getBanner?.(candidates, this.getActiveHarnessLabel()) : void 0;
    this.renderCustomizationMigrationBanner(banner);
    if (this.migrationDescriptionElement) {
      this.migrationDescriptionElement.textContent = banner ? "" : category.getPageDescription(candidates, this.getActiveHarnessLabel());
      this.migrationDescriptionElement.style.display = banner ? "none" : "";
    }
    if (this.migrationLinkElement) {
      this.migrationLinkElement.textContent = category.pageLinkLabel;
      this.migrationLinkElement.href = category.pageLinkUrl;
    }
  }
  renderCustomizationMigrationBanner(banner) {
    const container = this.migrationBannerContainer;
    if (!container) {
      return;
    }
    DOM.clearNode(container);
    if (!banner) {
      container.style.display = "none";
      return;
    }
    container.style.display = "";
    const icon = DOM.append(container, $("span.customization-migration-banner-icon"));
    icon.classList.add(...ThemeIcon.asClassNameArray(Codicon.warning));
    icon.setAttribute("aria-hidden", "true");
    const content = DOM.append(container, $(".customization-migration-banner-content"));
    DOM.append(content, $("h3.customization-migration-banner-title")).textContent = banner.title;
    DOM.append(content, $("p.customization-migration-banner-message")).textContent = banner.message;
    const consequence = DOM.append(content, $("p.customization-migration-banner-consequence"));
    const consequenceIcon = DOM.append(consequence, $("span.customization-migration-banner-consequence-icon"));
    consequenceIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.sync));
    consequenceIcon.setAttribute("aria-hidden", "true");
    DOM.append(consequence, $("span")).textContent = banner.consequence;
  }
  updateCustomizationMigrationActionState() {
    if (!this.migrationMigrateButton) {
      return;
    }
    const category = this.getActiveMigrationCategory() ?? CUSTOMIZATION_MIGRATION_CATEGORIES[0];
    const selectedCount = this.getMigrationCandidates(category).filter((customization) => this.isCustomizationSelectedForMigration(customization)).length;
    this.migrationMigrateButton.enabled = selectedCount > 0;
    this.migrationMigrateButton.label = selectedCount > 0 ? localize("customizationMigrationPageButtonWithCount", "Migrate ({0})", selectedCount) : localize("customizationMigrationPageButton", "Migrate");
  }
  async deleteCustomizationFile(customization) {
    const fileName = customization.name ?? basename(customization.uri);
    const confirmation = await this.dialogService.confirm({
      message: localize("confirmDeleteCustomizationFile", "Are you sure you want to delete '{0}'?", fileName),
      detail: localize("confirmDeleteDetail", "This action cannot be undone."),
      primaryButton: localize("delete", "Delete"),
      type: "warning"
    });
    if (!confirmation.confirmed) {
      return;
    }
    const useTrash = this.fileService.hasCapability(customization.uri, FileSystemProviderCapabilities.Trash);
    await this.fileService.del(customization.uri, { useTrash });
    if (customization.storage === PromptsStorage.local) {
      const projectRoot = this.workspaceService.getActiveProjectRoot();
      if (projectRoot) {
        await this.workspaceService.deleteFiles(projectRoot, [customization.uri]);
      }
    }
    const updatedCandidates = /* @__PURE__ */ new Map();
    for (const [categoryId, candidates] of this.customizationsByMigrationCategory) {
      updatedCandidates.set(categoryId, candidates.filter((item) => !isEqual(item.uri, customization.uri)));
    }
    this.setCustomizationsToMigrate(updatedCandidates);
  }
  isMigrationCategoryEnabled(category) {
    return this.configurationService.getValue(category.enablementSetting) === true;
  }
  getEnabledMigrationCategories() {
    return CUSTOMIZATION_MIGRATION_CATEGORIES.filter((category) => this.isMigrationCategoryEnabled(category));
  }
  async resolveCustomizationMigrationTargetFolders(customizations) {
    const requiredStorageByTargetType = /* @__PURE__ */ new Map();
    for (const customization of customizations) {
      const targetType = getCustomizationMigrationTargetType(customization);
      const storages = requiredStorageByTargetType.get(targetType) ?? /* @__PURE__ */ new Set();
      storages.add(customization.storage);
      requiredStorageByTargetType.set(targetType, storages);
    }
    const targetFolders = /* @__PURE__ */ new Map();
    for (const [targetType, requiredStorages] of requiredStorageByTargetType) {
      const availableFolders = await this.itemsModel.getActiveItemSource().fetchSourceFolders(targetType);
      const foldersByStorage = /* @__PURE__ */ new Map();
      for (const storage of requiredStorages) {
        const matchingFolders = availableFolders.filter((folder) => folder.source === storage);
        if (matchingFolders.length === 0) {
          this.notificationService.error(this.getMissingMigrationTargetFolderMessage(targetType, storage));
          return void 0;
        }
        const targetFolder = matchingFolders.length === 1 ? matchingFolders[0] : await this.pickCustomizationMigrationTargetFolder(matchingFolders, targetType);
        if (!targetFolder) {
          return void 0;
        }
        foldersByStorage.set(storage, targetFolder);
      }
      targetFolders.set(targetType, foldersByStorage);
    }
    return targetFolders;
  }
  getMissingMigrationTargetFolderMessage(targetType, storage) {
    if (storage === PromptsStorage.local) {
      switch (targetType) {
        case PromptsType.skill:
          return localize("migrationNoWorkspaceSkillFolder", "No workspace skills folder is configured for the active harness.");
        case PromptsType.agent:
          return localize("migrationNoWorkspaceAgentFolder", "No workspace agents folder is configured for the active harness.");
        default:
          return localize("migrationNoWorkspaceInstructionsFolder", "No workspace instructions folder is configured for the active harness.");
      }
    }
    switch (targetType) {
      case PromptsType.skill:
        return localize("migrationNoGlobalSkillFolder", "No global skills folder is configured for the active harness.");
      case PromptsType.agent:
        return localize("migrationNoGlobalAgentFolder", "No global agents folder is configured for the active harness.");
      default:
        return localize("migrationNoGlobalInstructionsFolder", "No global instructions folder is configured for the active harness.");
    }
  }
  async pickCustomizationMigrationTargetFolder(sourceFolders, targetType) {
    const picks = sourceFolders.map((folder) => ({
      label: folder.label,
      description: this.labelService.getUriLabel(folder.uri, { relative: true }),
      folder
    }));
    const selected = await this.quickInputService.pick(picks, {
      canPickMany: false,
      placeHolder: this.getMigrationTargetFolderPlaceholder(targetType),
      matchOnDescription: true
    });
    return selected?.folder;
  }
  getMigrationTargetFolderPlaceholder(targetType) {
    switch (targetType) {
      case PromptsType.skill:
        return localize("migrationPickSkillFolder", "Select a destination folder for migrated skills");
      case PromptsType.agent:
        return localize("migrationPickAgentFolder", "Select a destination folder for migrated agents");
      default:
        return localize("migrationPickInstructionsFolder", "Select a destination folder for migrated instructions");
    }
  }
  async revealMigratedCustomizations(migratedCustomizations) {
    const targetTypes = new Set(migratedCustomizations.map((customization) => customization.type));
    if (targetTypes.size !== 1) {
      this.showWelcomePage();
      return;
    }
    const targetType = targetTypes.values().next().value;
    if (!targetType) {
      return;
    }
    const section = this.getCustomizationSection(targetType);
    const migratedUris = migratedCustomizations.map((customization) => customization.uri);
    this.selectSection(section);
    await this.listWidget.setSection(section);
    if (this.listWidget.revealAndSelectFirstItemByUri(migratedUris)) {
      return;
    }
    this.listWidget.clearSearch();
    if (this.listWidget.revealAndSelectFirstItemByUri(migratedUris)) {
      return;
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      await timeout(100);
      if (this.listWidget.revealAndSelectFirstItemByUri(migratedUris)) {
        return;
      }
    }
  }
  getCustomizationSection(type) {
    switch (type) {
      case PromptsType.agent:
        return AICustomizationManagementSection.Agents;
      case PromptsType.instructions:
        return AICustomizationManagementSection.Instructions;
      case PromptsType.skill:
        return AICustomizationManagementSection.Skills;
      case PromptsType.prompt:
        return AICustomizationManagementSection.Prompts;
      case PromptsType.hook:
        return AICustomizationManagementSection.Hooks;
    }
  }
  isPromptsSection(section) {
    return section === AICustomizationManagementSection.Agents || section === AICustomizationManagementSection.Skills || section === AICustomizationManagementSection.Instructions || section === AICustomizationManagementSection.Prompts || section === AICustomizationManagementSection.Hooks;
  }
  //#region Section Counts
  /**
   * Updates the count for a specific section and re-renders the sidebar.
   */
  updateSectionCount(sectionId, count) {
    const section = this.sections.find((s) => s.id === sectionId);
    if (!section || section.count === count) {
      return;
    }
    section.count = count;
    this.sectionsList.splice(0, this.sectionsList.length, this.sections);
    this.ensureSectionsListReflectsActiveSection();
  }
  //#endregion
  /**
   * Navigates to the welcome page (no section selected).
   */
  showWelcomePage() {
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "migration") {
      this.viewMode = "list";
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    this.selectedSection = void 0;
    this.sectionContextKey.set("");
    this.storageService.remove(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, StorageScope.PROFILE);
    this.welcomePage?.reset();
    this.updateContentVisibility();
    this.ensureSectionsListReflectsActiveSection(void 0);
    this.welcomePage?.focus();
  }
  selectSection(section, options) {
    if (this.selectedSection === section && !options?.showMarketplace) {
      this.ensureSectionsListReflectsActiveSection(section);
      return;
    }
    this.telemetryService.publicLog2("chatCustomizationEditor.sectionChanged", {
      section
    });
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "migration") {
      this.viewMode = "list";
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    this.selectedSection = section;
    this.sectionContextKey.set(section);
    this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, section, StorageScope.PROFILE, StorageTarget.USER);
    this.updateContentVisibility();
    if (this.isPromptsSection(section)) {
      void this.listWidget.setSection(section);
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
    this.ensureSectionsListReflectsActiveSection(section);
    if (options?.showMarketplace) {
      if (section === AICustomizationManagementSection.McpServers) {
        this.mcpListWidget?.showBrowseMarketplace();
      } else if (section === AICustomizationManagementSection.Plugins) {
        this.pluginListWidget?.showBrowseMarketplace();
      }
    }
    if (section === AICustomizationManagementSection.McpServers) {
      this.mcpListWidget?.focusSearch();
    } else if (section === AICustomizationManagementSection.Plugins) {
      this.pluginListWidget?.focusSearch();
    } else if (section === AICustomizationManagementSection.Models && !aiCustomizationManagementSectionRegistry.get(section, this.harnessService.activeHarness.get())) {
      this.modelsWidget?.focusSearch();
    } else if (section === AICustomizationManagementSection.Tools) {
      this.toolsListWidget?.focusSearch();
    } else if (this.contributedSectionContainers.has(section)) {
      this.ensureContributedSectionWidget(section)?.focus?.();
    } else {
      this.listWidget?.focusSearch();
    }
  }
  ensureSectionsListReflectsActiveSection(section = this.selectedSection) {
    if (!this.sectionsList) {
      return;
    }
    if (section === void 0) {
      this.sectionsList.setSelection([]);
      this.sectionsList.setFocus([]);
      return;
    }
    const index = this.sections.findIndex((s) => s.id === section);
    if (index < 0) {
      return;
    }
    const selection = this.sectionsList.getSelection();
    if (selection.length !== 1 || selection[0] !== index) {
      this.sectionsList.setSelection([index]);
    }
    const focus = this.sectionsList.getFocus();
    if (focus.length !== 1 || focus[0] !== index) {
      this.sectionsList.setFocus([index]);
    }
  }
  updateContentVisibility() {
    const isEditorMode = this.viewMode === "editor";
    const isMigrationMode = this.viewMode === "migration";
    const isMcpDetailMode = this.viewMode === "mcpDetail";
    const isPluginDetailMode = this.viewMode === "pluginDetail";
    const isToolsDetailMode = this.viewMode === "toolsDetail";
    const isDetailMode = isMcpDetailMode || isPluginDetailMode || isToolsDetailMode;
    const isWelcome = this.selectedSection === void 0;
    const isPromptsSection = this.selectedSection !== void 0 && this.isPromptsSection(this.selectedSection);
    const isModelsSection = this.selectedSection === AICustomizationManagementSection.Models;
    const isContributedModelsSection = isModelsSection && !!aiCustomizationManagementSectionRegistry.get(AICustomizationManagementSection.Models, this.harnessService.activeHarness.get());
    const isMcpSection = this.selectedSection === AICustomizationManagementSection.McpServers;
    const isPluginsSection = this.selectedSection === AICustomizationManagementSection.Plugins;
    const isToolsSection = this.selectedSection === AICustomizationManagementSection.Tools;
    if (this.welcomePage) {
      this.welcomePage.container.style.display = isWelcome && !isEditorMode && !isMigrationMode && !isDetailMode ? "" : "none";
    }
    if (this.promptsContentContainer) {
      this.promptsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isPromptsSection ? "" : "none";
    }
    if (this.migrationContentContainer) {
      this.migrationContentContainer.style.display = isMigrationMode ? "" : "none";
    }
    if (this.modelsContentContainer) {
      this.modelsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isModelsSection && !isContributedModelsSection ? "" : "none";
    }
    if (this.mcpContentContainer) {
      this.mcpContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isMcpSection ? "" : "none";
    }
    if (this.mcpDetailContainer) {
      this.mcpDetailContainer.style.display = isMcpDetailMode ? "" : "none";
    }
    if (this.pluginContentContainer) {
      this.pluginContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isPluginsSection ? "" : "none";
    }
    if (this.pluginDetailContainer) {
      this.pluginDetailContainer.style.display = isPluginDetailMode ? "" : "none";
    }
    if (this.toolsContentContainer) {
      this.toolsContentContainer.style.display = !isEditorMode && !isMigrationMode && !isDetailMode && isToolsSection ? "" : "none";
    }
    if (this.toolsDetailContainer) {
      this.toolsDetailContainer.style.display = isToolsDetailMode ? "" : "none";
    }
    for (const [section, container] of this.contributedSectionContainers) {
      const visible = !isEditorMode && !isMigrationMode && !isDetailMode && this.selectedSection === section;
      container.style.display = visible ? "" : "none";
      if (visible) {
        this.ensureContributedSectionWidget(section);
      }
    }
    if (this.editorContentContainer) {
      this.editorContentContainer.style.display = isEditorMode ? "" : "none";
    }
    if (isModelsSection && !isContributedModelsSection && this.modelsWidget) {
      this.modelsWidget.render();
      if (this.dimension) {
        this.layout(this.dimension);
      }
    }
  }
  ensureContributedSectionWidget(section) {
    const existing = this.contributedSectionWidgets.get(section);
    if (existing) {
      return existing;
    }
    const contribution = aiCustomizationManagementSectionRegistry.get(section, this.harnessService.activeHarness.get());
    const container = this.contributedSectionContainers.get(section);
    if (!contribution || !container) {
      return void 0;
    }
    const widget = contribution.create(this.instantiationService, container);
    this.contributedSectionWidgets.set(section, widget);
    this.editorDisposables.add(widget);
    if (this.dimension) {
      widget.layout?.(this.dimension);
    }
    return widget;
  }
  /**
   * Creates a new customization using the AI-guided flow.
   */
  async createNewItemWithAI(type) {
    this.telemetryService.publicLog2("chatCustomizationEditor.createItem", {
      section: this.selectedSection ?? "welcome",
      promptType: type,
      creationMode: "ai",
      target: "workspace"
    });
    if (this.input) {
      this.group.closeEditor(this.input);
    }
    await this.workspaceService.generateCustomization(type);
  }
  /**
   * Creates a new prompt file and opens it in the embedded editor.
   */
  async createNewItemManual(type, target, rootFileName) {
    this.telemetryService.publicLog2("chatCustomizationEditor.createItem", {
      section: this.selectedSection ?? "welcome",
      promptType: type,
      creationMode: "manual",
      target: target === "workspace-root" ? "workspace" : target
    });
    if (target === "workspace-root") {
      const projectRoot = this.workspaceService.getActiveProjectRoot();
      if (!projectRoot) {
        return;
      }
      const override2 = this.selectedSection ? this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection) : void 0;
      const fileName = rootFileName ?? override2?.rootFile ?? AGENT_MD_FILENAME;
      const fileUri = URI.joinPath(projectRoot, fileName);
      if (await this.fileService.exists(fileUri)) {
        await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
      } else {
        await this.fileService.createFile(fileUri);
        await this.showEmbeddedEditor(fileUri, fileName, PromptsType.instructions, PromptsStorage.local, true);
      }
      this.listWidget.refresh();
      return;
    }
    if (type === PromptsType.hook) {
      if (this.workspaceService.isSessionsWindow) {
        await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
          openEditor: async (resource) => {
            await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
            return;
          },
          target: Target.GitHubCopilot
        });
      } else {
        await this.instantiationService.invokeFunction(showConfigureHooksQuickPick, {
          openEditor: async (resource) => {
            await this.showEmbeddedEditor(resource, basename(resource), PromptsType.hook, PromptsStorage.local, true);
            return;
          }
        });
      }
      return;
    }
    const sessionResource = this.harnessService.activeSessionResource.get();
    const picker = this.instantiationService.createInstance(CustomizationLocationPicker);
    const targetDir = await picker.resolveTargetDirectoryWithPicker(
      sessionResource,
      type,
      target
    );
    if (targetDir === null) {
      return;
    }
    if (targetDir === void 0) {
      await this.instantiationService.invokeFunction(showNoFoldersDialog, type);
      return;
    }
    const override = this.selectedSection ? this.harnessService.getActiveDescriptor().sectionOverrides?.get(this.selectedSection) : void 0;
    const options = {
      targetFolder: targetDir,
      targetStorage: target === AICustomizationSources.user ? PromptsStorage.user : PromptsStorage.local,
      fileExtension: override?.fileExtension,
      openFile: async (uri) => {
        const isWorkspace = target === AICustomizationSources.local;
        await this.showEmbeddedEditor(uri, basename(uri), type, target, isWorkspace);
        return this.embeddedEditor;
      }
    };
    let commandId;
    switch (type) {
      case PromptsType.prompt:
        commandId = NEW_PROMPT_COMMAND_ID;
        break;
      case PromptsType.instructions:
        commandId = NEW_INSTRUCTIONS_COMMAND_ID;
        break;
      case PromptsType.agent:
        commandId = NEW_AGENT_COMMAND_ID;
        break;
      case PromptsType.skill:
        commandId = NEW_SKILL_COMMAND_ID;
        break;
      default:
        return;
    }
    await this.commandService.executeCommand(commandId, options);
    this.listWidget.refresh();
  }
  updateStyles() {
    this.splitView?.style({ separatorBorder: Color.transparent });
  }
  async setInput(input, options, context, token) {
    this.workspaceService.clearOverrideProjectRoot();
    this.inEditorContextKey.set(true);
    this.sectionContextKey.set(this.selectedSection ?? "");
    input.setSaveHandler(() => this.handleBuiltinSave());
    this.telemetryService.publicLog2("chatCustomizationEditor.opened", {
      section: this.selectedSection ?? "welcome"
    });
    await super.setInput(input, options, context, token);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  clearInput() {
    const input = this.input;
    if (input instanceof AICustomizationManagementEditorInput) {
      input.setSaveHandler(void 0);
      input.setDirty(false);
    }
    this.inEditorContextKey.set(false);
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "migration") {
      this.viewMode = "list";
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    this.workspaceService.clearOverrideProjectRoot();
    this.disposeBuiltinEditingSessions();
    super.clearInput();
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    if (visible && this.dimension) {
      this.layout(this.dimension);
    }
  }
  layout(dimension) {
    this.dimension = dimension;
    if (this.container && this.splitView) {
      this.splitViewContainer.style.height = `${dimension.height}px`;
      this.splitView.layout(dimension.width, dimension.height);
    }
    for (const widget of this.contributedSectionWidgets.values()) {
      widget.layout?.(dimension);
    }
    this.migrationSearchInput?.layout();
    this.migrationListScrollable?.scanDomNode();
  }
  focus() {
    super.focus();
    if (this.viewMode === "editor") {
      if (this.editorDisplayMode === "raw") {
        this.embeddedEditor?.focus();
      } else {
        this.editorModeButton?.focus();
      }
      return;
    }
    if (this.viewMode === "migration") {
      this.migrationSearchInput?.focus();
      return;
    }
    if (this.selectedSection === void 0) {
      this.welcomePage?.focus();
      return;
    }
    if (this.selectedSection === AICustomizationManagementSection.McpServers) {
      this.mcpListWidget?.focusSearch();
    } else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
      this.pluginListWidget?.focusSearch();
    } else if (this.selectedSection === AICustomizationManagementSection.Models && !aiCustomizationManagementSectionRegistry.get(AICustomizationManagementSection.Models, this.harnessService.activeHarness.get())) {
      this.modelsWidget?.focusSearch();
    } else if (this.selectedSection === AICustomizationManagementSection.Tools) {
      this.toolsListWidget?.focusSearch();
    } else if (this.selectedSection && this.contributedSectionContainers.has(this.selectedSection)) {
      this.ensureContributedSectionWidget(this.selectedSection)?.focus?.();
    } else {
      this.listWidget?.focusSearch();
    }
  }
  /**
   * Selects a specific section programmatically.
   */
  selectSectionById(sectionId, options) {
    const index = this.sections.findIndex((s) => s.id === sectionId);
    if (index >= 0) {
      if (this.viewMode === "editor") {
        this.goBackToList();
      }
      if (this.viewMode === "migration") {
        this.viewMode = "list";
      }
      if (this.viewMode === "mcpDetail") {
        this.goBackFromMcpDetail();
      }
      if (this.viewMode === "pluginDetail") {
        this.goBackFromPluginDetail();
      }
      if (this.viewMode === "toolsDetail") {
        this.goBackFromToolDetail();
      }
      this.selectedSection = sectionId;
      this.sectionContextKey.set(sectionId);
      this.storageService.store(AI_CUSTOMIZATION_MANAGEMENT_SELECTED_SECTION_KEY, sectionId, StorageScope.PROFILE, StorageTarget.USER);
      this.updateContentVisibility();
      if (this.isPromptsSection(sectionId)) {
        void this.listWidget.setSection(sectionId);
      }
      if (this.dimension) {
        this.layout(this.dimension);
      }
      this.ensureSectionsListReflectsActiveSection(sectionId);
      if (options?.showMarketplace) {
        if (sectionId === AICustomizationManagementSection.McpServers) {
          this.mcpListWidget?.showBrowseMarketplace();
        } else if (sectionId === AICustomizationManagementSection.Plugins) {
          this.pluginListWidget?.showBrowseMarketplace();
        }
      }
    }
  }
  showCustomizationMigrationPage(categoryId) {
    if (!this.isMigrationCategoryEnabled(getCustomizationMigrationCategory(categoryId))) {
      return;
    }
    if (this.viewMode === "editor") {
      this.goBackToList();
    }
    if (this.viewMode === "mcpDetail") {
      this.goBackFromMcpDetail();
    }
    if (this.viewMode === "pluginDetail") {
      this.goBackFromPluginDetail();
    }
    if (this.viewMode === "toolsDetail") {
      this.goBackFromToolDetail();
    }
    if (this.activeMigrationCategoryId !== categoryId) {
      this.activeMigrationCategoryId = categoryId;
      this.migrationSearchQuery = "";
      if (this.migrationSearchInput) {
        this.migrationSearchInput.value = "";
      }
    }
    this.selectedSection = void 0;
    this.sectionContextKey.set("");
    this.viewMode = "migration";
    this.ensureSectionsListReflectsActiveSection(void 0);
    this.renderCustomizationMigrationPage();
    this.updateContentVisibility();
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  /**
   * Refreshes the list widget.
   */
  refreshList() {
    this.listWidget.refresh();
  }
  /**
   * Scrolls the active list widget so the last item is visible.
   */
  revealLastItem() {
    if (this.selectedSection === AICustomizationManagementSection.McpServers) {
      this.mcpListWidget?.revealLastItem();
    } else if (this.selectedSection === AICustomizationManagementSection.Plugins) {
      this.pluginListWidget?.revealLastItem();
    } else {
      this.listWidget.revealLastItem();
    }
  }
  /**
   * Generates a debug report for the current section.
   */
  async generateDebugReport() {
    return this.listWidget.generateDebugReport();
  }
  //#region Embedded Editor
  createEmbeddedEditor() {
    if (!this.editorContentContainer) {
      return;
    }
    const editorHeader = DOM.append(this.editorContentContainer, $(".editor-header"));
    this.editorActionButton = DOM.append(editorHeader, $("button.editor-back-button"));
    this.editorActionButton.setAttribute("aria-label", localize("backToList", "Back to list"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.editorActionButton, localize("backToListTooltip", "Back to list")));
    this.editorActionButtonIcon = DOM.append(this.editorActionButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}.editor-action-button-icon`));
    this.editorActionButtonIcon.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(this.editorActionButton, "click", () => {
      void this.handleEditorActionButton().catch((error) => {
        console.error("Failed to handle editor back action:", error);
        this.notificationService.error(localize("editorActionButtonFailed", "Failed to finish the prompt action."));
      });
    }));
    const itemInfo = DOM.append(editorHeader, $(".editor-item-info"));
    this.editorItemNameElement = DOM.append(itemInfo, $(".editor-item-name"));
    this.editorItemPathElement = DOM.append(itemInfo, $(".editor-item-path"));
    this.editorModeButton = DOM.append(editorHeader, $("button.editor-mode-button"));
    this.editorModeButton.type = "button";
    this.editorModeButton.setAttribute("aria-pressed", "false");
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.editorModeButton, () => this.getEditorModeButtonTooltip()));
    this.editorDisposables.add(DOM.addDisposableListener(this.editorModeButton, "click", () => {
      this.toggleEditorDisplayMode();
    }));
    this.editorSaveIndicator = DOM.append(editorHeader, $(".editor-save-indicator"));
    this.editorPreviewContainer = DOM.append(this.editorContentContainer, $(".editor-preview-container"));
    this.editorPreviewScrollContainer = DOM.append(this.editorPreviewContainer, $(".editor-preview-scroll-container"));
    this.editorPreviewScrollContainer.setAttribute("role", "region");
    this.editorPreviewScrollContainer.setAttribute("aria-label", localize("customizationPreviewAriaLabel", "Customization preview"));
    this.editorPreviewIssuesContainer = DOM.append(this.editorPreviewScrollContainer, $(".editor-preview-issues"));
    const frontMatterSection = DOM.append(this.editorPreviewScrollContainer, $(".editor-preview-section.editor-preview-frontmatter-section"));
    this.editorPreviewFrontMatterContainer = DOM.append(frontMatterSection, $(".editor-preview-frontmatter-list"));
    const bodySection = DOM.append(this.editorPreviewScrollContainer, $(".editor-preview-section.editor-preview-body-section"));
    this.editorPreviewBodyContainer = DOM.append(bodySection, $(".editor-preview-body-content"));
    this.embeddedEditorContainer = DOM.append(this.editorContentContainer, $(".embedded-editor-container"));
    const overflowWidgetsDomNode = DOM.append(this.editorContentContainer, $(".embedded-editor-overflow-widgets.monaco-editor"));
    this.editorDisposables.add(toDisposable(() => overflowWidgetsDomNode.remove()));
    this.embeddedEditor = this.editorDisposables.add(this.instantiationService.createInstance(
      CodeEditorWidget,
      this.embeddedEditorContainer,
      {
        ...getSimpleEditorOptions(this.configurationService),
        readOnly: false,
        minimap: { enabled: false },
        lineNumbers: "on",
        wordWrap: "on",
        scrollBeyondLastLine: false,
        automaticLayout: false,
        folding: true,
        renderLineHighlight: "all",
        scrollbar: { vertical: "auto", horizontal: "auto" },
        overflowWidgetsDomNode
      },
      { isSimpleWidget: false }
    ));
    this.updateEditorDisplayMode();
  }
  async showEmbeddedEditor(uri, displayName, promptType, source, isWorkspaceFile = false, isReadOnly = false) {
    this.editorReturnViewMode = this.viewMode === "migration" ? "migration" : "list";
    this.currentModelRef?.dispose();
    this.currentModelRef = void 0;
    this.editorModelChangeDisposables.clear();
    this.editorPreviewDisposables.clear();
    this.editorPreviewRenderScheduler.cancel();
    this.currentEditingUri = uri;
    this.currentEditingProjectRoot = isWorkspaceFile ? this.workspaceService.getActiveProjectRoot() : void 0;
    this.currentEditingSource = source;
    this.currentEditingPromptType = promptType;
    this.currentEditingReadOnly = isReadOnly;
    this.editorDisplayMode = this.isStructuredPreviewSupported(promptType) ? "preview" : "raw";
    this.viewMode = "editor";
    this.editorItemNameElement.textContent = displayName;
    this.editorItemPathElement.textContent = basename(uri);
    this._editorContentChanged = false;
    this.resetEditorSaveIndicator();
    this.updateEditorActionButton();
    this.updateEditorDisplayMode();
    this.updateContentVisibility();
    try {
      if (source === AICustomizationSources.builtin && (promptType === PromptsType.prompt || promptType === PromptsType.skill)) {
        const session = await this.getOrCreateBuiltinEditingSession(uri);
        if (!isEqual(this.currentEditingUri, uri)) {
          return;
        }
        this.embeddedEditor.setModel(session.model);
        this.embeddedEditor.updateOptions({ readOnly: false });
        this._editorContentChanged = session.model.getValue() !== session.originalContent;
        this.renderCurrentEditorPreview();
        this.updateEditorActionButton();
        if (this.dimension) {
          this.layout(this.dimension);
        }
        if (this.editorDisplayMode === "raw") {
          this.embeddedEditor.focus();
        } else {
          this.editorModeButton?.focus();
        }
        this.editorModelChangeDisposables.add(session.model.onDidChangeContent(() => {
          this._editorContentChanged = session.model.getValue() !== session.originalContent;
          this.scheduleCurrentEditorPreviewRender();
          this.updateEditorActionButton();
        }));
        return;
      }
      const ref = await this.textModelService.createModelReference(uri);
      if (!isEqual(this.currentEditingUri, uri)) {
        ref.dispose();
        return;
      }
      this.currentModelRef = ref;
      this.embeddedEditor.setModel(ref.object.textEditorModel);
      this.embeddedEditor.updateOptions({ readOnly: isReadOnly });
      this.renderCurrentEditorPreview();
      if (this.dimension) {
        this.layout(this.dimension);
      }
      if (this.editorDisplayMode === "raw") {
        this.embeddedEditor.focus();
      } else {
        this.editorModeButton?.focus();
      }
      this._editorContentChanged = this.workingCopyService.isDirty(uri);
      this.editorModelChangeDisposables.add(ref.object.textEditorModel.onDidChangeContent(() => {
        this._editorContentChanged = true;
        this.scheduleCurrentEditorPreviewRender();
        this.resetEditorSaveIndicator();
      }));
      this.editorModelChangeDisposables.add(this.workingCopyService.onDidSave((e) => {
        if (isEqual(e.workingCopy.resource, uri)) {
          this._editorContentChanged = this.workingCopyService.isDirty(uri);
          this.editorSaveIndicator.className = "editor-save-indicator visible saved";
          this.editorSaveIndicator.classList.add(...ThemeIcon.asClassNameArray(Codicon.check));
          this.editorSaveIndicator.title = localize("saved", "Saved");
          this.editorSaveIndicator.setAttribute("aria-label", localize("saved", "Saved"));
          status(localize("saved", "Saved"));
        }
      }));
    } catch (error) {
      console.error("Failed to load model for embedded editor:", error);
      if (isEqual(this.currentEditingUri, uri)) {
        this.goBackToList();
      }
    }
  }
  goBackToList() {
    const returnViewMode = this.editorReturnViewMode;
    this.editorReturnViewMode = "list";
    const fileUri = this.currentEditingUri;
    const backgroundSaveRequest = this.createExistingCustomizationSaveRequest();
    if (backgroundSaveRequest) {
      this.telemetryService.publicLog2("chatCustomizationEditor.saveItem", {
        promptType: this.currentEditingPromptType ?? "",
        storage: String(this.currentEditingSource ?? ""),
        saveTarget: "existing"
      });
    }
    if (fileUri && this.currentEditingSource === AICustomizationSources.builtin) {
      this.disposeBuiltinEditingSession(fileUri);
    }
    this.currentModelRef?.dispose();
    this.currentModelRef = void 0;
    this.currentEditingUri = void 0;
    this.currentEditingProjectRoot = void 0;
    this.currentEditingSource = void 0;
    this.currentEditingPromptType = void 0;
    this.currentEditingReadOnly = false;
    this.editorDisplayMode = "preview";
    this._editorContentChanged = false;
    this.editorModelChangeDisposables.clear();
    this.editorPreviewRenderScheduler.cancel();
    this.clearEditorPreview();
    this.resetEditorSaveIndicator();
    this.updateEditorActionButton();
    this.updateEditorDisplayMode();
    this.embeddedEditor?.setModel(null);
    this.viewMode = returnViewMode;
    this.updateContentVisibility();
    if (returnViewMode === "migration") {
      this.renderCustomizationMigrationPage();
      void this.refreshCustomizationMigrationInfo();
    } else {
      void this.listWidget?.refresh();
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
    if (returnViewMode === "migration") {
      this.migrationSearchInput?.focus();
    } else {
      this.listWidget?.focusSearch();
    }
    if (backgroundSaveRequest) {
      const saveRequest = backgroundSaveRequest;
      void this.saveExistingCustomization(saveRequest).catch((error) => {
        console.error("Failed to save customization changes on exit:", error);
        this.notificationService.warn(localize("saveCustomizationOnExitFailed", "Could not save changes to {0}.", basename(saveRequest.fileUri)));
      });
    }
  }
  //#endregion
  async getOrCreateBuiltinEditingSession(uri) {
    const key = uri.toString();
    const existing = this.builtinEditingSessions.get(key);
    if (existing && !existing.model.isDisposed()) {
      return existing;
    }
    const ref = await this.textModelService.createModelReference(uri);
    try {
      const session = {
        model: this.modelService.createModel(
          createTextBufferFactoryFromSnapshot(ref.object.textEditorModel.createSnapshot()),
          { languageId: ref.object.textEditorModel.getLanguageId(), onDidChange: Event.None },
          URI.from({ scheme: "ai-customization-builtin", path: uri.path, query: generateUuid() }),
          false
        ),
        originalContent: ref.object.textEditorModel.getValue()
      };
      this.builtinEditingSessions.set(key, session);
      return session;
    } finally {
      ref.dispose();
    }
  }
  createBuiltinPromptSaveRequest(target) {
    const sourceUri = this.currentEditingUri;
    const promptType = this.currentEditingPromptType;
    if (!sourceUri || this.currentEditingSource !== AICustomizationSources.builtin || promptType !== PromptsType.prompt && promptType !== PromptsType.skill || !target.folder || target.target === "cancel") {
      return;
    }
    const session = this.builtinEditingSessions.get(sourceUri.toString());
    if (!session || !this._editorContentChanged) {
      return;
    }
    return {
      target: target.target,
      folder: target.folder,
      sourceUri,
      content: session.model.getValue(),
      promptType,
      projectRoot: target.target === "workspace" ? this.workspaceService.getActiveProjectRoot() : void 0
    };
  }
  createExistingCustomizationSaveRequest() {
    if (!this._editorContentChanged || this.currentEditingSource === AICustomizationSources.builtin || !this.currentEditingUri) {
      return void 0;
    }
    const model = this.currentModelRef?.object.textEditorModel;
    if (!model) {
      return void 0;
    }
    return {
      fileUri: this.currentEditingUri,
      content: model.getValue(),
      projectRoot: this.currentEditingProjectRoot
    };
  }
  async saveBuiltinPromptCopy(request) {
    let targetUri;
    if (request.promptType === PromptsType.skill) {
      const skillFolderName = basename(dirname(request.sourceUri));
      targetUri = URI.joinPath(request.folder, skillFolderName, basename(request.sourceUri));
    } else {
      targetUri = URI.joinPath(request.folder, basename(request.sourceUri));
    }
    await this.fileService.createFolder(dirname(targetUri));
    await this.fileService.writeFile(targetUri, VSBuffer.fromString(request.content));
    if (request.target === "workspace" && request.projectRoot) {
      await this.workspaceService.commitFiles(request.projectRoot, [targetUri]);
    }
  }
  async saveExistingCustomization(request) {
    await this.fileService.writeFile(request.fileUri, VSBuffer.fromString(request.content));
    if (request.projectRoot) {
      await this.workspaceService.commitFiles(request.projectRoot, [request.fileUri]);
    }
  }
  async pickBuiltinPromptSaveTarget() {
    const items = [];
    const promptType = this.currentEditingPromptType ?? PromptsType.prompt;
    const workspaceFolder = resolveWorkspaceTargetDirectory(this.workspaceService, promptType);
    if (workspaceFolder) {
      items.push({
        label: localize("workspaceSaveTarget", "Workspace"),
        description: this.labelService.getUriLabel(workspaceFolder, { relative: true }),
        target: "workspace",
        folder: workspaceFolder
      });
    }
    const userFolder = await resolveUserTargetDirectory(this.promptsService, promptType);
    if (userFolder) {
      items.push({
        label: localize("userSaveTarget", "User"),
        description: this.labelService.getUriLabel(userFolder, { relative: true }),
        target: "user",
        folder: userFolder
      });
    }
    items.push({
      label: localize("cancelSaveTarget", "Cancel"),
      target: "cancel"
    });
    return this.quickInputService.pick(items, {
      canPickMany: false,
      placeHolder: localize("saveBuiltinCopyPlaceholder", "Select Workspace, User, or Cancel"),
      matchOnDescription: true
    });
  }
  async handleEditorActionButton() {
    if (this.editorActionButtonInProgress) {
      return;
    }
    this.editorActionButtonInProgress = true;
    this.updateEditorActionButton();
    let backgroundSaveRequest;
    try {
      if (this.shouldShowBuiltinSaveAction()) {
        const selection = await this.pickBuiltinPromptSaveTarget();
        if (!selection || selection.target === "cancel") {
          return;
        }
        backgroundSaveRequest = this.createBuiltinPromptSaveRequest(selection);
        if (backgroundSaveRequest) {
          this.telemetryService.publicLog2("chatCustomizationEditor.saveItem", {
            promptType: this.currentEditingPromptType ?? "",
            storage: String(this.currentEditingSource ?? ""),
            saveTarget: selection.target
          });
        }
      }
      this.goBackToList();
      if (backgroundSaveRequest) {
        const saveRequest = backgroundSaveRequest;
        void this.saveBuiltinPromptCopy(saveRequest).then(() => {
          void this.listWidget?.refresh();
        }, (error) => {
          console.error("Failed to save built-in override:", error);
          this.notificationService.warn(saveRequest.target === "workspace" ? localize("saveBuiltinCopyFailedWorkspace", "Could not save the override to the workspace.") : localize("saveBuiltinCopyFailedUser", "Could not save the override to your user folder."));
        });
      }
    } finally {
      this.editorActionButtonInProgress = false;
      this.updateEditorActionButton();
    }
  }
  updateEditorActionButton() {
    this.updateInputDirtyState();
    if (!this.editorActionButton || !this.editorActionButtonIcon) {
      return;
    }
    const shouldShowBuiltinSaveAction = this.shouldShowBuiltinSaveAction();
    this.editorActionButtonIcon.className = `codicon codicon-${shouldShowBuiltinSaveAction ? Codicon.save.id : Codicon.arrowLeft.id} editor-action-button-icon`;
    this.editorActionButton.disabled = this.editorActionButtonInProgress;
    this.editorActionButton.setAttribute("aria-label", shouldShowBuiltinSaveAction ? localize("saveBuiltinCopyAndChooseLocation", "Save override") : this.editorReturnViewMode === "migration" ? this.getActiveMigrationCategory()?.backLabel ?? localize("backToCustomizationMigration", "Back to migration") : localize("backToList", "Back to list"));
    this.editorActionButton.title = shouldShowBuiltinSaveAction ? localize("saveBuiltinCopyAndChooseLocationTooltip", "Save override (choose Workspace, User, or Cancel)") : this.editorReturnViewMode === "migration" ? this.getActiveMigrationCategory()?.backLabel ?? localize("backToCustomizationMigration", "Back to migration") : localize("backToList", "Back to list");
  }
  shouldShowBuiltinSaveAction() {
    return this._editorContentChanged && this.currentEditingSource === AICustomizationSources.builtin && (this.currentEditingPromptType === PromptsType.prompt || this.currentEditingPromptType === PromptsType.skill);
  }
  updateInputDirtyState() {
    const input = this.input;
    if (input instanceof AICustomizationManagementEditorInput) {
      input.setDirty(this.shouldShowBuiltinSaveAction());
    }
  }
  async handleBuiltinSave() {
    if (!this.shouldShowBuiltinSaveAction()) {
      return false;
    }
    const target = await this.pickBuiltinPromptSaveTarget();
    if (!target || target.target === "cancel") {
      return false;
    }
    const saveRequest = this.createBuiltinPromptSaveRequest(target);
    if (!saveRequest) {
      return false;
    }
    try {
      await this.saveBuiltinPromptCopy(saveRequest);
      this.telemetryService.publicLog2("chatCustomizationEditor.saveItem", {
        promptType: this.currentEditingPromptType ?? "",
        storage: String(this.currentEditingSource ?? ""),
        saveTarget: target.target
      });
      this._editorContentChanged = false;
      this.updateEditorActionButton();
      return true;
    } catch (error) {
      console.error("Failed to save built-in override:", error);
      this.notificationService.warn(target.target === "workspace" ? localize("saveBuiltinCopyFailedWorkspace", "Could not save the override to the workspace.") : localize("saveBuiltinCopyFailedUser", "Could not save the override to your user folder."));
      return false;
    }
  }
  resetEditorSaveIndicator() {
    this.editorSaveIndicator.className = "editor-save-indicator";
    this.editorSaveIndicator.title = "";
    this.editorSaveIndicator.removeAttribute("aria-label");
  }
  isStructuredPreviewSupported(promptType) {
    if (this.configurationService.getValue(ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled) !== true) {
      return false;
    }
    return promptType === PromptsType.agent || promptType === PromptsType.skill || promptType === PromptsType.instructions || promptType === PromptsType.prompt;
  }
  onStructuredPreviewSettingChanged() {
    if (this.viewMode !== "editor") {
      return;
    }
    const supportsStructuredPreview = this.isStructuredPreviewSupported(this.currentEditingPromptType);
    if (!supportsStructuredPreview) {
      this.editorDisplayMode = "raw";
      this.editorPreviewRenderScheduler.cancel();
      this.clearEditorPreview();
    } else if (this.editorDisplayMode === "preview") {
      this.editorPreviewRenderScheduler.schedule();
    }
    this.updateEditorDisplayMode();
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  getCurrentEditingModel() {
    if (!this.currentEditingUri) {
      return void 0;
    }
    if (this.currentEditingSource === AICustomizationSources.builtin) {
      return this.builtinEditingSessions.get(this.currentEditingUri.toString())?.model;
    }
    return this.currentModelRef?.object.textEditorModel;
  }
  toggleEditorDisplayMode() {
    if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
      return;
    }
    this.editorDisplayMode = this.editorDisplayMode === "preview" ? "raw" : "preview";
    if (this.editorDisplayMode === "preview") {
      this.editorPreviewRenderScheduler.cancel();
      this.renderCurrentEditorPreview();
    }
    this.updateEditorDisplayMode();
    if (this.dimension) {
      this.layout(this.dimension);
    }
    if (this.editorDisplayMode === "raw") {
      this.embeddedEditor?.focus();
    } else {
      this.editorModeButton?.focus();
    }
  }
  updateEditorDisplayMode() {
    const supportsStructuredPreview = this.isStructuredPreviewSupported(this.currentEditingPromptType);
    const showPreview = supportsStructuredPreview && this.editorDisplayMode === "preview";
    if (this.editorModeButton) {
      this.editorModeButton.style.display = supportsStructuredPreview ? "" : "none";
      this.editorModeButton.textContent = this.getEditorModeButtonLabel();
      this.editorModeButton.setAttribute("aria-label", this.getEditorModeButtonTooltip());
      this.editorModeButton.setAttribute("aria-pressed", String(this.editorDisplayMode === "raw"));
      this.editorModeButton.title = this.getEditorModeButtonTooltip();
    }
    if (this.editorPreviewContainer) {
      this.editorPreviewContainer.style.display = showPreview ? "" : "none";
    }
    if (this.embeddedEditorContainer) {
      this.embeddedEditorContainer.style.display = showPreview ? "none" : "";
    }
  }
  getEditorModeButtonLabel() {
    if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
      return "";
    }
    if (this.editorDisplayMode === "raw") {
      return localize("editorPreviewButtonLabel", "Preview");
    }
    return this.canEditCurrentRaw() ? localize("editorEditRawButtonLabel", "Edit") : localize("editorViewRawButtonLabel", "View Raw");
  }
  getEditorModeButtonTooltip() {
    if (!this.isStructuredPreviewSupported(this.currentEditingPromptType)) {
      return "";
    }
    if (this.editorDisplayMode === "raw") {
      return localize("editorPreviewButtonTooltip", "Show structured preview");
    }
    return this.canEditCurrentRaw() ? localize("editorEditRawButtonTooltip", "Edit the raw markdown file") : localize("editorViewRawButtonTooltip", "Show the raw markdown file");
  }
  canEditCurrentRaw() {
    const promptType = this.currentEditingPromptType;
    if (!promptType) {
      return false;
    }
    return this.currentEditingSource === AICustomizationSources.builtin && (promptType === PromptsType.prompt || promptType === PromptsType.skill) || !this.currentEditingReadOnly;
  }
  scheduleCurrentEditorPreviewRender() {
    if (this.editorDisplayMode !== "preview") {
      return;
    }
    this.editorPreviewRenderScheduler.schedule();
  }
  renderCurrentEditorPreview() {
    const model = this.getCurrentEditingModel();
    const promptType = this.currentEditingPromptType;
    if (!model || !promptType || this.editorDisplayMode !== "preview" || !this.isStructuredPreviewSupported(promptType)) {
      this.clearEditorPreview();
      return;
    }
    const parsedPromptFile = this.promptsService.getParsedPromptFile(model);
    this.renderEditorPreview(parsedPromptFile, promptType);
  }
  renderEditorPreview(parsedPromptFile, promptType) {
    if (!this.editorPreviewIssuesContainer || !this.editorPreviewFrontMatterContainer || !this.editorPreviewBodyContainer) {
      return;
    }
    this.editorPreviewDisposables.clear();
    DOM.clearNode(this.editorPreviewIssuesContainer);
    DOM.clearNode(this.editorPreviewFrontMatterContainer);
    DOM.clearNode(this.editorPreviewBodyContainer);
    const target = getTarget(promptType, parsedPromptFile.header ?? parsedPromptFile.uri);
    this.renderPreviewIssues(parsedPromptFile);
    this.renderPreviewFrontMatter(parsedPromptFile, promptType, target);
    this.renderPreviewBody(parsedPromptFile);
  }
  renderPreviewIssues(parsedPromptFile) {
    if (!this.editorPreviewIssuesContainer || !parsedPromptFile.header?.errors.length) {
      return;
    }
    const issuesContainer = DOM.append(this.editorPreviewIssuesContainer, $(".editor-preview-issues-box"));
    DOM.append(issuesContainer, $("div.editor-preview-issues-title")).textContent = localize("previewHeaderIssuesTitle", "Header issues detected");
    DOM.append(issuesContainer, $("div.editor-preview-issues-description")).textContent = localize("previewHeaderIssuesDescription", "Switch to raw view to fix invalid or unsupported metadata entries.");
    const list = DOM.append(issuesContainer, $("ul.editor-preview-issues-list"));
    for (const error of parsedPromptFile.header.errors) {
      DOM.append(list, $("li.editor-preview-issues-item")).textContent = error.message;
    }
  }
  renderPreviewFrontMatter(parsedPromptFile, promptType, target) {
    if (!this.editorPreviewFrontMatterContainer) {
      return;
    }
    const attributes = parsedPromptFile.header?.attributes ?? [];
    if (!attributes.length) {
      DOM.append(this.editorPreviewFrontMatterContainer, $("div.editor-preview-empty-state")).textContent = localize("previewNoFrontMatter", "No metadata found in this file.");
      return;
    }
    for (const attribute of attributes) {
      this.renderPreviewAttribute(attribute, promptType, target);
    }
  }
  renderPreviewAttribute(attribute, promptType, target) {
    if (!this.editorPreviewFrontMatterContainer) {
      return;
    }
    const row = DOM.append(this.editorPreviewFrontMatterContainer, $(".editor-preview-row"));
    const header = DOM.append(row, $(".editor-preview-row-header"));
    DOM.append(header, $("div.editor-preview-row-key")).textContent = attribute.key;
    const helpButton = DOM.append(header, $("button.editor-preview-row-help"));
    helpButton.type = "button";
    helpButton.setAttribute("aria-label", localize("previewFieldHelpAriaLabel", "Show help for '{0}'", attribute.key));
    const helpIcon = DOM.append(helpButton, $("span.editor-preview-row-help-icon"));
    helpIcon.classList.add(...ThemeIcon.asClassNameArray(Codicon.info));
    helpIcon.setAttribute("aria-hidden", "true");
    const description = getAttributeDefinition(attribute.key, promptType, target)?.description ?? localize("previewUnknownFieldDescription", "Custom metadata field `{0}`.", attribute.key);
    const helpHover = this.editorPreviewDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), helpButton, {
      markdown: new MarkdownString(description),
      markdownNotSupportedFallback: description
    }));
    this.editorPreviewDisposables.add(DOM.addDisposableListener(helpButton, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      helpHover.show(true);
    }));
    const valueElement = DOM.append(row, $("div.editor-preview-row-value"));
    const valueText = this.stringifyPreviewValue(attribute.value);
    valueElement.textContent = valueText;
    valueElement.classList.toggle("multiline", valueText.includes("\n"));
  }
  renderPreviewBody(parsedPromptFile) {
    if (!this.editorPreviewBodyContainer) {
      return;
    }
    const bodyContent = parsedPromptFile.body?.getContent() ?? "";
    if (!bodyContent.trim()) {
      DOM.append(this.editorPreviewBodyContainer, $("div.editor-preview-empty-state")).textContent = localize("previewNoBody", "No markdown body found in this file.");
      return;
    }
    const markdown = new MarkdownString(bodyContent, { supportThemeIcons: true });
    markdown.baseUri = parsedPromptFile.uri;
    const renderedMarkdown = this.editorPreviewDisposables.add(this.markdownRendererService.render(markdown));
    this.editorPreviewBodyContainer.appendChild(renderedMarkdown.element);
  }
  stringifyPreviewValue(value) {
    switch (value.type) {
      case "scalar":
        return value.value;
      case "sequence":
        if (value.items.every((item) => item.type === "scalar")) {
          return value.items.map((item) => item.value).join("\n");
        }
        return JSON.stringify(this.toPreviewObject(value), null, 2);
      case "map":
        return JSON.stringify(this.toPreviewObject(value), null, 2);
    }
  }
  toPreviewObject(value) {
    switch (value.type) {
      case "scalar":
        return value.value;
      case "sequence":
        return value.items.map((item) => this.toPreviewObject(item));
      case "map": {
        const entries = {};
        for (const property of value.properties) {
          entries[property.key.value] = this.toPreviewObject(property.value);
        }
        return entries;
      }
    }
  }
  clearEditorPreview() {
    this.editorPreviewRenderScheduler.cancel();
    this.editorPreviewDisposables.clear();
    if (this.editorPreviewIssuesContainer) {
      DOM.clearNode(this.editorPreviewIssuesContainer);
    }
    if (this.editorPreviewFrontMatterContainer) {
      DOM.clearNode(this.editorPreviewFrontMatterContainer);
    }
    if (this.editorPreviewBodyContainer) {
      DOM.clearNode(this.editorPreviewBodyContainer);
    }
  }
  disposeBuiltinEditingSessions() {
    for (const session of this.builtinEditingSessions.values()) {
      session.model.dispose();
    }
    this.builtinEditingSessions.clear();
  }
  disposeBuiltinEditingSession(uri) {
    const key = uri.toString();
    const session = this.builtinEditingSessions.get(key);
    if (!session) {
      return;
    }
    session.model.dispose();
    this.builtinEditingSessions.delete(key);
  }
  //#region Embedded MCP Server Detail
  createEmbeddedMcpDetail() {
    if (!this.mcpDetailContainer) {
      return;
    }
    const detailBody = DOM.append(this.mcpDetailContainer, $(".mcp-detail-editor-container"));
    this.embeddedMcpDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedMcpServerDetail, detailBody));
    const backButton = DOM.append(this.embeddedMcpDetail.leadingSlot, $("button.editor-back-button"));
    backButton.setAttribute("type", "button");
    backButton.setAttribute("aria-label", localize("backToMcpList", "Back to MCP servers"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), backButton, localize("backToMcpListTooltip", "Back to MCP servers")));
    const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
    backIconEl.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(backButton, "click", () => {
      this.goBackFromMcpDetail();
    }));
  }
  async showEmbeddedMcpDetail(server) {
    if (!this.embeddedMcpDetail) {
      return;
    }
    this.viewMode = "mcpDetail";
    this.updateContentVisibility();
    this.mcpDetailDisposables.clear();
    this.embeddedMcpDetail.setInput(server);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  goBackFromMcpDetail() {
    this.mcpDetailDisposables.clear();
    this.embeddedMcpDetail?.clearInput();
    this.viewMode = "list";
    this.updateContentVisibility();
    if (this.dimension) {
      this.layout(this.dimension);
    }
    this.mcpListWidget?.focusSearch();
  }
  //#endregion
  //#region Embedded Plugin Detail
  createEmbeddedPluginDetail() {
    if (!this.pluginDetailContainer) {
      return;
    }
    const detailBody = DOM.append(this.pluginDetailContainer, $(".plugin-detail-editor-container"));
    this.embeddedPluginDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedAgentPluginDetail, detailBody));
    const backButton = DOM.append(this.embeddedPluginDetail.leadingSlot, $("button.editor-back-button"));
    backButton.setAttribute("type", "button");
    backButton.setAttribute("aria-label", localize("backToPluginList", "Back to plugins"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), backButton, localize("backToPluginListTooltip", "Back to plugins")));
    const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
    backIconEl.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(backButton, "click", () => {
      this.goBackFromPluginDetail();
    }));
  }
  async showEmbeddedPluginDetail(item) {
    if (!this.embeddedPluginDetail) {
      return;
    }
    this.viewMode = "pluginDetail";
    this.updateContentVisibility();
    this.pluginDetailDisposables.clear();
    this.embeddedPluginDetail.setInput(item);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  /**
   * Public method to show a plugin detail from any section (e.g. from "Show Plugin" context menu).
   * Saves the current section so the back button returns the user to it.
   */
  async showPluginDetail(item) {
    if (this.selectedSection !== AICustomizationManagementSection.Plugins) {
      this.pluginDetailReturnSection = this.selectedSection ?? AICustomizationManagementSection.Agents;
    }
    await this.showEmbeddedPluginDetail(item);
  }
  goBackFromPluginDetail() {
    this.pluginDetailDisposables.clear();
    this.embeddedPluginDetail?.clearInput();
    const returnSection = this.pluginDetailReturnSection;
    this.pluginDetailReturnSection = void 0;
    if (returnSection) {
      this.viewMode = "list";
      this.updateContentVisibility();
      this.selectSection(returnSection);
    } else {
      this.viewMode = "list";
      this.updateContentVisibility();
      this.pluginListWidget?.focusSearch();
    }
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  //#endregion
  //#region Embedded Tool Extension Detail
  createEmbeddedToolDetail() {
    if (!this.toolsDetailContainer) {
      return;
    }
    const detailBody = DOM.append(this.toolsDetailContainer, $(".tools-detail-editor-container"));
    this.embeddedToolDetail = this.editorDisposables.add(this.instantiationService.createInstance(EmbeddedExtensionToolsDetail, detailBody));
    const backButton = DOM.append(this.embeddedToolDetail.leadingSlot, $("button.editor-back-button"));
    backButton.setAttribute("type", "button");
    backButton.setAttribute("aria-label", localize("backToToolsList", "Back to tools"));
    this.editorDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), backButton, localize("backToToolsListTooltip", "Back to tools")));
    const backIconEl = DOM.append(backButton, $(`.codicon.codicon-${Codicon.arrowLeft.id}`));
    backIconEl.setAttribute("aria-hidden", "true");
    this.editorDisposables.add(DOM.addDisposableListener(backButton, "click", () => {
      this.goBackFromToolDetail();
    }));
  }
  async showEmbeddedToolDetail(extension) {
    if (!this.embeddedToolDetail) {
      return;
    }
    this.viewMode = "toolsDetail";
    this.updateContentVisibility();
    this.toolsDetailDisposables.clear();
    this.embeddedToolDetail.setInput(extension);
    if (this.dimension) {
      this.layout(this.dimension);
    }
  }
  goBackFromToolDetail() {
    this.toolsDetailDisposables.clear();
    this.embeddedToolDetail?.clearInput();
    this.viewMode = "list";
    this.updateContentVisibility();
    if (this.dimension) {
      this.layout(this.dimension);
    }
    this.toolsListWidget?.focusSearch();
  }
  //#endregion
};
AICustomizationManagementEditor.ID = AI_CUSTOMIZATION_MANAGEMENT_EDITOR_ID;
AICustomizationManagementEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IAICustomizationWorkspaceService),
  __decorateParam(9, IPromptsService),
  __decorateParam(10, ITextModelService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IWorkingCopyService),
  __decorateParam(13, IHoverService),
  __decorateParam(14, IContextViewService),
  __decorateParam(15, IMarkdownRendererService),
  __decorateParam(16, IModelService),
  __decorateParam(17, IQuickInputService),
  __decorateParam(18, IFileService),
  __decorateParam(19, INotificationService),
  __decorateParam(20, IDialogService),
  __decorateParam(21, ICustomizationHarnessService),
  __decorateParam(22, IViewsService),
  __decorateParam(23, ILabelService),
  __decorateParam(24, IAICustomizationItemsModel)
], AICustomizationManagementEditor);
export {
  AICustomizationManagementEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmNzcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24sIFNpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSwgSUxpc3RSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9ySW5wdXQgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBhaUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvblJlZ2lzdHJ5LCBJQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25XaWRnZXQgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTGlzdFdpZGdldCB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uTGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCwgSVRFTVNfTU9ERUxfU0VDVElPTlMgfSBmcm9tICcuL2FpQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwuanMnO1xuaW1wb3J0IHsgTWNwTGlzdFdpZGdldCB9IGZyb20gJy4vbWNwTGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBQbHVnaW5MaXN0V2lkZ2V0IH0gZnJvbSAnLi9wbHVnaW5MaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFRvb2xzTGlzdFdpZGdldCB9IGZyb20gJy4vdG9vbHNMaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfQ09QSUxPVF9DTElfU0VTU0lPTl9UWVBFIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7XG5cdEFJX0NVU1RPTUlaQVRJT05fTUFOQUdFTUVOVF9FRElUT1JfSUQsXG5cdEFJX0NVU1RPTUlaQVRJT05fTUFOQUdFTUVOVF9TSURFQkFSX1dJRFRIX0tFWSxcblx0QUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFTEVDVEVEX1NFQ1RJT05fS0VZLFxuXHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbixcblx0QUlDdXN0b21pemF0aW9uU291cmNlLFxuXHRDT05URVhUX0FJX0NVU1RPTUlaQVRJT05fTUFOQUdFTUVOVF9FRElUT1IsXG5cdENPTlRFWFRfQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFQ1RJT04sXG5cdENPTlRFWFRfQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX0hBUk5FU1MsXG5cdFNJREVCQVJfREVGQVVMVF9XSURUSCxcblx0U0lERUJBUl9NSU5fV0lEVEgsXG5cdFNJREVCQVJfTUFYX1dJRFRILFxuXHRDT05URU5UX01JTl9XSURUSCxcbn0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFnZW50SWNvbiwgaW5zdHJ1Y3Rpb25zSWNvbiwgcHJvbXB0SWNvbiwgc2tpbGxJY29uLCBob29rSWNvbiwgcGx1Z2luSWNvbiwgdG9vbHNJY29uIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWxzV2lkZ2V0IH0gZnJvbSAnLi4vY2hhdE1hbmFnZW1lbnQvY2hhdE1vZGVsc1dpZGdldC5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSwgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UsIElQcm9tcHRQYXRoLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGVhZGVyQXR0cmlidXRlLCBJVmFsdWUsIFBhcnNlZFByb21wdEZpbGUgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgQUdFTlRfTURfRklMRU5BTUUgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IGdldEF0dHJpYnV0ZURlZmluaXRpb24sIGdldFRhcmdldCB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvbGFuZ3VhZ2VQcm92aWRlcnMvcHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgSU5ld1Byb21wdE9wdGlvbnMsIE5FV19QUk9NUFRfQ09NTUFORF9JRCwgTkVXX0lOU1RSVUNUSU9OU19DT01NQU5EX0lELCBORVdfQUdFTlRfQ09NTUFORF9JRCwgTkVXX1NLSUxMX0NPTU1BTkRfSUQgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvbmV3UHJvbXB0RmlsZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgc2hvd0NvbmZpZ3VyZUhvb2tzUXVpY2tQaWNrIH0gZnJvbSAnLi4vcHJvbXB0U3ludGF4L2hvb2tBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlc29sdmVXb3Jrc3BhY2VUYXJnZXREaXJlY3RvcnksIHJlc29sdmVVc2VyVGFyZ2V0RGlyZWN0b3J5LCBDdXN0b21pemF0aW9uTG9jYXRpb25QaWNrZXIgfSBmcm9tICcuL2N1c3RvbWl6YXRpb25DcmVhdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uU291cmNlcywgSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0QnVmZmVyRmFjdG9yeUZyb21TbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0Q2hlY2tib3hTdHlsZXMsIGRlZmF1bHRJbnB1dEJveFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTWNwU2VydmVyIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRQbHVnaW5JdGVtIH0gZnJvbSAnLi4vYWdlbnRQbHVnaW5FZGl0b3IvYWdlbnRQbHVnaW5JdGVtcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZE1jcFNlcnZlckRldGFpbCB9IGZyb20gJy4vZW1iZWRkZWRNY3BTZXJ2ZXJEZXRhaWwuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRBZ2VudFBsdWdpbkRldGFpbCB9IGZyb20gJy4vZW1iZWRkZWRBZ2VudFBsdWdpbkRldGFpbC5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZEV4dGVuc2lvblRvb2xzRGV0YWlsIH0gZnJvbSAnLi9lbWJlZGRlZEV4dGVuc2lvblRvb2xzRGV0YWlsLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHR5cGUgSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25XZWxjb21lUGFnZSwgdHlwZSBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5U3VtbWFyeSB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2UuanMnO1xuaW1wb3J0IHsgdHlwZSBDdXN0b21pemF0aW9uTWlncmF0aW9uVGFyZ2V0Rm9sZGVycywgZ2V0Q3VzdG9taXphdGlvbk1pZ3JhdGlvblRhcmdldFR5cGUsIG1pZ3JhdGVDdXN0b21pemF0aW9ucyB9IGZyb20gJy4vY3VzdG9taXphdGlvbk1pZ3JhdGlvbi5qcyc7XG5pbXBvcnQgeyBDVVNUT01JWkFUSU9OX01JR1JBVElPTl9DQVRFR09SSUVTLCBDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCwgZ2V0Q3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5LCBnZXRDdXN0b21pemF0aW9uTWlncmF0aW9uU291cmNlVHlwZXMsIHR5cGUgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25CYW5uZXIsIHR5cGUgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeSB9IGZyb20gJy4vY3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBzaG93Tm9Gb2xkZXJzRGlhbG9nIH0gZnJvbSAnLi4vcHJvbXB0U3ludGF4L3BpY2tlcnMvYXNrRm9yUHJvbXB0U291cmNlRm9sZGVyLmpzJztcbmltcG9ydCB7IGlzQWdlbnRIb3N0VGFyZ2V0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbi8vI3JlZ2lvbiBUZWxlbWV0cnlcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yT3BlbmVkRXZlbnQgPSB7XG5cdHNlY3Rpb246IHN0cmluZztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvck9wZW5lZENsYXNzaWZpY2F0aW9uID0ge1xuXHRzZWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGluaXRpYWxseSBzZWxlY3RlZCBzZWN0aW9uIHdoZW4gdGhlIGVkaXRvciBvcGVucy4nIH07XG5cdG93bmVyOiAnam9zaHNwaWNlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgd2hlbiB0aGUgQWdlbnQgQ3VzdG9taXphdGlvbnMgZWRpdG9yIGlzIG9wZW5lZC4nO1xufTtcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yU2VjdGlvbkNoYW5nZWRFdmVudCA9IHtcblx0c2VjdGlvbjogc3RyaW5nO1xufTtcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yU2VjdGlvbkNoYW5nZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0c2VjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzZWN0aW9uIHRoZSB1c2VyIG5hdmlnYXRlZCB0by4nIH07XG5cdG93bmVyOiAnam9zaHNwaWNlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgc2VjdGlvbiBuYXZpZ2F0aW9uIHdpdGhpbiB0aGUgQWdlbnQgQ3VzdG9taXphdGlvbnMgZWRpdG9yLic7XG59O1xuXG50eXBlIEN1c3RvbWl6YXRpb25FZGl0b3JJdGVtU2VsZWN0ZWRFdmVudCA9IHtcblx0c2VjdGlvbjogc3RyaW5nO1xuXHRwcm9tcHRUeXBlOiBzdHJpbmc7XG5cdHN0b3JhZ2U6IHN0cmluZztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvckl0ZW1TZWxlY3RlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRzZWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGl2ZSBzZWN0aW9uIHdoZW4gdGhlIGl0ZW0gd2FzIHNlbGVjdGVkLicgfTtcblx0cHJvbXB0VHlwZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBwcm9tcHQgdHlwZSBvZiB0aGUgc2VsZWN0ZWQgaXRlbS4nIH07XG5cdHN0b3JhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc3RvcmFnZSBsb2NhdGlvbiBvZiB0aGUgc2VsZWN0ZWQgaXRlbSAobG9jYWwsIHVzZXIsIGV4dGVuc2lvbiwgcGx1Z2luLCBidWlsdGluKS4nIH07XG5cdG93bmVyOiAnam9zaHNwaWNlcic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgaXRlbSBzZWxlY3Rpb24gaW4gdGhlIEFnZW50IEN1c3RvbWl6YXRpb25zIGVkaXRvci4nO1xufTtcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yQ3JlYXRlSXRlbUV2ZW50ID0ge1xuXHRzZWN0aW9uOiBzdHJpbmc7XG5cdHByb21wdFR5cGU6IHN0cmluZztcblx0Y3JlYXRpb25Nb2RlOiAnYWknIHwgJ21hbnVhbCc7XG5cdHRhcmdldDogc3RyaW5nO1xufTtcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yQ3JlYXRlSXRlbUNsYXNzaWZpY2F0aW9uID0ge1xuXHRzZWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGl2ZSBzZWN0aW9uIHdoZW4gdGhlIGl0ZW0gd2FzIGNyZWF0ZWQuJyB9O1xuXHRwcm9tcHRUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHR5cGUgb2YgY3VzdG9taXphdGlvbiBiZWluZyBjcmVhdGVkLicgfTtcblx0Y3JlYXRpb25Nb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgaXRlbSB3YXMgY3JlYXRlZCB2aWEgQUktZ3VpZGVkIGZsb3cgb3IgbWFudWFsIGNyZWF0aW9uLicgfTtcblx0dGFyZ2V0OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHRhcmdldCBzdG9yYWdlIGZvciB0aGUgbmV3IGl0ZW0gKHdvcmtzcGFjZSwgdXNlcikuJyB9O1xuXHRvd25lcjogJ2pvc2hzcGljZXInO1xuXHRjb21tZW50OiAnVHJhY2tzIGN1c3RvbWl6YXRpb24gY3JlYXRpb24gaW4gdGhlIEFnZW50IEN1c3RvbWl6YXRpb25zIGVkaXRvci4nO1xufTtcblxudHlwZSBDdXN0b21pemF0aW9uRWRpdG9yU2F2ZUl0ZW1FdmVudCA9IHtcblx0cHJvbXB0VHlwZTogc3RyaW5nO1xuXHRzdG9yYWdlOiBzdHJpbmc7XG5cdHNhdmVUYXJnZXQ6IHN0cmluZztcbn07XG5cbnR5cGUgQ3VzdG9taXphdGlvbkVkaXRvclNhdmVJdGVtQ2xhc3NpZmljYXRpb24gPSB7XG5cdHByb21wdFR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgdHlwZSBvZiBjdXN0b21pemF0aW9uIGJlaW5nIHNhdmVkLicgfTtcblx0c3RvcmFnZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBvcmlnaW5hbCBzdG9yYWdlIGxvY2F0aW9uIG9mIHRoZSBpdGVtLicgfTtcblx0c2F2ZVRhcmdldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0YXJnZXQgc3RvcmFnZSBmb3IgdGhlIHNhdmUgKHdvcmtzcGFjZSwgdXNlciwgZXhpc3RpbmcpLicgfTtcblx0b3duZXI6ICdqb3Noc3BpY2VyJztcblx0Y29tbWVudDogJ1RyYWNrcyBzYXZlIGFjdGlvbnMgaW4gdGhlIEFnZW50IEN1c3RvbWl6YXRpb25zIGVkaXRvci4nO1xufTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBTaWRlYmFyIFNlY3Rpb24gSXRlbVxuXG5pbnRlcmZhY2UgSVNlY3Rpb25JdGVtIHtcblx0cmVhZG9ubHkgaWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJU2F2ZVRhcmdldFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IHRhcmdldDogJ3dvcmtzcGFjZScgfCAndXNlcicgfCAnY2FuY2VsJztcblx0cmVhZG9ubHkgZm9sZGVyPzogVVJJO1xufVxuXG5pbnRlcmZhY2UgSU1pZ3JhdGlvblRhcmdldFF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGZvbGRlcjogSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXI7XG59XG5cbmludGVyZmFjZSBJQnVpbHRpblByb21wdFNhdmVSZXF1ZXN0IHtcblx0cmVhZG9ubHkgdGFyZ2V0OiAnd29ya3NwYWNlJyB8ICd1c2VyJztcblx0cmVhZG9ubHkgZm9sZGVyOiBVUkk7XG5cdHJlYWRvbmx5IHNvdXJjZVVyaTogVVJJO1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHByb21wdFR5cGU6IFByb21wdHNUeXBlO1xuXHRyZWFkb25seSBwcm9qZWN0Um9vdD86IFVSSTtcbn1cblxuaW50ZXJmYWNlIElFeGlzdGluZ0N1c3RvbWl6YXRpb25TYXZlUmVxdWVzdCB7XG5cdHJlYWRvbmx5IGZpbGVVcmk6IFVSSTtcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9qZWN0Um9vdD86IFVSSTtcbn1cblxuY2xhc3MgU2VjdGlvbkl0ZW1EZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElTZWN0aW9uSXRlbT4ge1xuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjY7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdzZWN0aW9uSXRlbSc7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGNvdW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBTZWN0aW9uSXRlbVJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJU2VjdGlvbkl0ZW0sIElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRyZWFkb25seSB0ZW1wbGF0ZUlkID0gJ3NlY3Rpb25JdGVtJztcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSkgeyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NlY3Rpb24tbGlzdC1pdGVtJyk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2VjdGlvbi1pY29uJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZWN0aW9uLWxhYmVsJykpO1xuXHRcdGNvbnN0IGNvdW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZWN0aW9uLWNvdW50JykpO1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCBpY29uLCBsYWJlbCwgY291bnQsIHRlbXBsYXRlRGlzcG9zYWJsZXMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVNlY3Rpb25JdGVtLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NOYW1lID0gJ3NlY3Rpb24taWNvbic7XG5cdFx0dGVtcGxhdGVEYXRhLmljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShlbGVtZW50Lmljb24pKTtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwudGV4dENvbnRlbnQgPSBlbGVtZW50LmxhYmVsO1xuXHRcdGlmIChlbGVtZW50LmNvdW50ID4gMCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50LnRleHRDb250ZW50ID0gU3RyaW5nKGVsZW1lbnQuY291bnQpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvdW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY291bnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRlbXBsYXRlRGF0YS5jb250YWluZXIsIGVsZW1lbnQuZGVzY3JpcHRpb24pKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTZWN0aW9uSXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLyoqXG4gKiBFZGl0b3IgcGFuZSBmb3IgdGhlIEFJIEN1c3RvbWl6YXRpb25zIE1hbmFnZW1lbnQgRWRpdG9yLlxuICogUHJvdmlkZXMgYSBnbG9iYWwgdmlldyBvZiBhbGwgQUkgY3VzdG9taXphdGlvbnMgd2l0aCBhIHNpZGViYXIgZm9yIG5hdmlnYXRpb25cbiAqIGFuZCBhIGNvbnRlbnQgYXJlYSBzaG93aW5nIGEgc2VhcmNoYWJsZSBsaXN0IG9mIGl0ZW1zLlxuICovXG5leHBvcnQgY2xhc3MgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvciBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9IEFJX0NVU1RPTUlaQVRJT05fTUFOQUdFTUVOVF9FRElUT1JfSUQ7XG5cblx0cHJpdmF0ZSBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzcGxpdFZpZXdDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzcGxpdFZpZXchOiBTcGxpdFZpZXc8bnVtYmVyPjtcblx0cHJpdmF0ZSBzaWRlYmFyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VjdGlvbnNMaXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZWN0aW9uc0xpc3QhOiBXb3JrYmVuY2hMaXN0PElTZWN0aW9uSXRlbT47XG5cdHByaXZhdGUgY29udGVudENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGxpc3RXaWRnZXQhOiBBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0O1xuXHRwcml2YXRlIG1jcExpc3RXaWRnZXQ6IE1jcExpc3RXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcGx1Z2luTGlzdFdpZGdldDogUGx1Z2luTGlzdFdpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RlbHNXaWRnZXQ6IENoYXRNb2RlbHNXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdG9vbHNMaXN0V2lkZ2V0OiBUb29sc0xpc3RXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJvbXB0c0NvbnRlbnRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBtY3BDb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwbHVnaW5Db250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RlbHNDb250ZW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0b29sc0NvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbnRyaWJ1dGVkU2VjdGlvbkNvbnRhaW5lcnMgPSBuZXcgTWFwPEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBIVE1MRWxlbWVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBjb250cmlidXRlZFNlY3Rpb25XaWRnZXRzID0gbmV3IE1hcDxBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgSUFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uV2lkZ2V0PigpO1xuXHRwcml2YXRlIG1vZGVsc0Zvb3RlckVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdC8vIEVtYmVkZGVkIGVkaXRvciBzdGF0ZVxuXHRwcml2YXRlIGVkaXRvckNvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVkaXRvclByZXZpZXdDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVkaXRvclByZXZpZXdTY3JvbGxDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVkaXRvclByZXZpZXdJc3N1ZXNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVkaXRvclByZXZpZXdGcm9udE1hdHRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yUHJldmlld0JvZHlDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVtYmVkZGVkRWRpdG9yQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlbWJlZGRlZEVkaXRvcjogQ29kZUVkaXRvcldpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlZGl0b3JBY3Rpb25CdXR0b24hOiBIVE1MQnV0dG9uRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JBY3Rpb25CdXR0b25JY29uITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZWRpdG9yTW9kZUJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZWRpdG9yQWN0aW9uQnV0dG9uSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRwcml2YXRlIGVkaXRvckRpc3BsYXlNb2RlOiAncHJldmlldycgfCAncmF3JyA9ICdwcmV2aWV3Jztcblx0cHJpdmF0ZSBlZGl0b3JJdGVtTmFtZUVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JJdGVtUGF0aEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBlZGl0b3JTYXZlSW5kaWNhdG9yITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yTW9kZWxDaGFuZ2VEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUHJldmlld0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnZWRpdG9yJyAmJiB0aGlzLmVkaXRvckRpc3BsYXlNb2RlID09PSAncHJldmlldycpIHtcblx0XHRcdHRoaXMucmVuZGVyQ3VycmVudEVkaXRvclByZXZpZXcoKTtcblx0XHR9XG5cdH0sIDIwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgeyBtb2RlbDogSVRleHRNb2RlbDsgb3JpZ2luYWxDb250ZW50OiBzdHJpbmcgfT4oKTtcblx0cHJpdmF0ZSBjdXJyZW50RWRpdGluZ1VyaTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRFZGl0aW5nUHJvamVjdFJvb3Q6IFVSSSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50RWRpdGluZ1NvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZTogUHJvbXB0c1R5cGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VycmVudEVkaXRpbmdSZWFkT25seSA9IGZhbHNlO1xuXHRwcml2YXRlIGVkaXRvclJldHVyblZpZXdNb2RlOiAnbGlzdCcgfCAnbWlncmF0aW9uJyA9ICdsaXN0Jztcblx0cHJpdmF0ZSBjdXJyZW50TW9kZWxSZWY6IElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB2aWV3TW9kZTogJ2xpc3QnIHwgJ21pZ3JhdGlvbicgfCAnZWRpdG9yJyB8ICdtY3BEZXRhaWwnIHwgJ3BsdWdpbkRldGFpbCcgfCAndG9vbHNEZXRhaWwnID0gJ2xpc3QnO1xuXHRwcml2YXRlIG1pZ3JhdGlvbkNvbnRlbnRDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1pZ3JhdGlvbkxpc3RDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlOiBEb21TY3JvbGxhYmxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtaWdyYXRpb25NaWdyYXRlQnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWlncmF0aW9uU2VhcmNoSW5wdXQ6IElucHV0Qm94IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1pZ3JhdGlvblRpdGxlRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWlncmF0aW9uRGVzY3JpcHRpb25FbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtaWdyYXRpb25CYW5uZXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1pZ3JhdGlvbkxpbmtFbGVtZW50OiBIVE1MQW5jaG9yRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtaWdyYXRpb25TZWFyY2hRdWVyeSA9ICcnO1xuXHRwcml2YXRlIGFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5SWQ6IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvbGxhcHNlZEN1c3RvbWl6YXRpb25NaWdyYXRpb25Hcm91cHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBzZWxlY3RlZEN1c3RvbWl6YXRpb25NaWdyYXRpb25JdGVtcyA9IG5ldyBSZXNvdXJjZU1hcDxTZXQ8UHJvbXB0c1N0b3JhZ2U+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Ly8gRW1iZWRkZWQgTUNQIHNlcnZlciBkZXRhaWwgdmlld1xuXHRwcml2YXRlIG1jcERldGFpbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZW1iZWRkZWRNY3BEZXRhaWw6IEVtYmVkZGVkTWNwU2VydmVyRGV0YWlsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1jcERldGFpbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHQvLyBFbWJlZGRlZCBwbHVnaW4gZGV0YWlsIHZpZXdcblx0cHJpdmF0ZSBwbHVnaW5EZXRhaWxDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGVtYmVkZGVkUGx1Z2luRGV0YWlsOiBFbWJlZGRlZEFnZW50UGx1Z2luRGV0YWlsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBsdWdpbkRldGFpbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0LyoqIFNlY3Rpb24gdG8gcmVzdG9yZSB3aGVuIG5hdmlnYXRpbmcgYmFjayBmcm9tIHBsdWdpbiBkZXRhaWwgKHdoZW4gb3BlbmVkIGZyb20gYSBub24tcGx1Z2luIHNlY3Rpb24pLiAqL1xuXHRwcml2YXRlIHBsdWdpbkRldGFpbFJldHVyblNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdC8vIEVtYmVkZGVkIHRvb2wtY29udHJpYnV0aW5nIGV4dGVuc2lvbiBkZXRhaWwgdmlld1xuXHRwcml2YXRlIHRvb2xzRGV0YWlsQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlbWJlZGRlZFRvb2xEZXRhaWw6IEVtYmVkZGVkRXh0ZW5zaW9uVG9vbHNEZXRhaWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9vbHNEZXRhaWxEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBkaW1lbnNpb246IERPTS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2VjdGlvbnM6IElTZWN0aW9uSXRlbVtdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgYWxsU2VjdGlvbnM6IElTZWN0aW9uSXRlbVtdID0gW107XG5cdHByaXZhdGUgc2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHQvLyBXZWxjb21lIHBhZ2Vcblx0cHJpdmF0ZSB3ZWxjb21lUGFnZTogQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VzdG9taXphdGlvbnNCeU1pZ3JhdGlvbkNhdGVnb3J5ID0gbmV3IE1hcDxDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCwgcmVhZG9ubHkgSVByb21wdFBhdGhbXT4oKTtcblx0cHJpdmF0ZSBjdXN0b21pemF0aW9uTWlncmF0aW9uUmVmcmVzaFNlcXVlbmNlID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfZWRpdG9yQ29udGVudENoYW5nZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHJldmlvdXNBY3RpdmVIYXJuZXNzSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNpZGViYXJIZWFkZXJDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhvbWVCdXR0b246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGhvbWVCdXR0b25JY29uOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBob21lQnV0dG9uTGFiZWw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBtaWdyYXRpb25TaG9ydGN1dHMgPSBuZXcgTWFwPEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLCB7IHJlYWRvbmx5IGJ1dHRvbjogSFRNTEJ1dHRvbkVsZW1lbnQ7IHJlYWRvbmx5IGNvdW50OiBIVE1MRWxlbWVudCB9PigpO1xuXHRwcml2YXRlIHNpZGViYXJXaWR0aCA9IDA7XG5cdHByaXZhdGUgc2lkZWJhckhlaWdodCA9IDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbkVkaXRvckNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlY3Rpb25Db250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGhhcm5lc3NDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBoYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwgcHJpdmF0ZSByZWFkb25seSBpdGVtc01vZGVsOiBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCxcblx0KSB7XG5cdFx0c3VwZXIoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5pbkVkaXRvckNvbnRleHRLZXkgPSBDT05URVhUX0FJX0NVU1RPTUlaQVRJT05fTUFOQUdFTUVOVF9FRElUT1IuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlY3Rpb25Db250ZXh0S2V5ID0gQ09OVEVYVF9BSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfU0VDVElPTi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFybmVzc0NvbnRleHRLZXkgPSBDT05URVhUX0FJX0NVU1RPTUlaQVRJT05fTUFOQUdFTUVOVF9IQVJORVNTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy51cGRhdGVIYXJuZXNzTGFiZWxQcmVzZW50YXRpb24oKTtcblxuXHRcdC8vIFRyYWNrIHdvcmtzcGFjZSBjaGFuZ2VzIGZvciBlbWJlZGRlZCBlZGl0b3Jcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UuYWN0aXZlUHJvamVjdFJvb3QucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdlZGl0b3InKSB7XG5cdFx0XHRcdHRoaXMuY3VycmVudEVkaXRpbmdQcm9qZWN0Um9vdCA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRBY3RpdmVQcm9qZWN0Um9vdCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5jdXJyZW50TW9kZWxSZWY/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuY3VycmVudE1vZGVsUmVmID0gdW5kZWZpbmVkO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5kaXNwb3NlQnVpbHRpbkVkaXRpbmdTZXNzaW9ucygpKSk7XG5cblx0XHQvLyBCdWlsZCBzZWN0aW9ucyBmcm9tIHRoZSB3b3Jrc3BhY2Ugc2VydmljZSBjb25maWd1cmF0aW9uXG5cdFx0Y29uc3Qgc2VjdGlvbkluZm86IFJlY29yZDxzdHJpbmcsIHsgbGFiZWw6IHN0cmluZzsgaWNvbjogVGhlbWVJY29uOyBkZXNjcmlwdGlvbjogc3RyaW5nIH0+ID0ge1xuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50c106IHsgbGFiZWw6IGxvY2FsaXplKCdhZ2VudHMnLCBcIkFnZW50c1wiKSwgaWNvbjogYWdlbnRJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50c0Rlc2MnLCBcIkRlZmluZSBjdXN0b20gYWdlbnRzIHdpdGggc3BlY2lhbGl6ZWQgcGVyc29uYXMsIHRvb2wgYWNjZXNzLCBhbmQgaW5zdHJ1Y3Rpb25zIGZvciBzcGVjaWZpYyB0YXNrcy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgnc2tpbGxzJywgXCJTa2lsbHNcIiksIGljb246IHNraWxsSWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdza2lsbHNEZXNjJywgXCJDcmVhdGUgcmV1c2FibGUgc2tpbGwgZmlsZXMgdGhhdCBwcm92aWRlIGRvbWFpbi1zcGVjaWZpYyBrbm93bGVkZ2UgYW5kIHdvcmtmbG93cy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zJywgXCJJbnN0cnVjdGlvbnNcIiksIGljb246IGluc3RydWN0aW9uc0ljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zRGVzYycsIFwiU2V0IGFsd2F5cy1vbiBpbnN0cnVjdGlvbnMgdGhhdCBndWlkZSBBSSBiZWhhdmlvciBhY3Jvc3MgeW91ciB3b3Jrc3BhY2Ugb3IgdXNlciBwcm9maWxlLlwiKSB9LFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgncHJvbXB0cycsIFwiUHJvbXB0c1wiKSwgaWNvbjogcHJvbXB0SWNvbiwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRzRGVzYycsIFwiUmV1c2FibGUgcHJvbXB0IHRlbXBsYXRlcyB0aGF0IGNhbiBiZSBpbnZva2VkIGFzIHNsYXNoIGNvbW1hbmRzLlwiKSB9LFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzXTogeyBsYWJlbDogbG9jYWxpemUoJ2hvb2tzJywgXCJIb29rc1wiKSwgaWNvbjogaG9va0ljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaG9va3NEZXNjJywgXCJDb25maWd1cmUgYXV0b21hdGVkIGFjdGlvbnMgdHJpZ2dlcmVkIGJ5IGV2ZW50cyBsaWtlIHNhdmluZyBmaWxlcyBvciBydW5uaW5nIHRhc2tzLlwiKSB9LFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgnbWNwU2VydmVycycsIFwiTUNQIFNlcnZlcnNcIiksIGljb246IENvZGljb24uc2VydmVyLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcFNlcnZlcnNEZXNjJywgXCJDb25uZWN0IGV4dGVybmFsIHRvb2wgc2VydmVycyB0aGF0IGV4dGVuZCBBSSBjYXBhYmlsaXRpZXMgd2l0aCBjdXN0b20gdG9vbHMgYW5kIGRhdGEgc291cmNlcy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zXTogeyBsYWJlbDogbG9jYWxpemUoJ3BsdWdpbnMnLCBcIlBsdWdpbnNcIiksIGljb246IHBsdWdpbkljb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGx1Z2luc0Rlc2MnLCBcIkluc3RhbGwgYW5kIG1hbmFnZSBhZ2VudCBwbHVnaW5zIHRoYXQgYWRkIGFkZGl0aW9uYWwgdG9vbHMsIHNraWxscywgYW5kIGludGVncmF0aW9ucy5cIikgfSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHNdOiB7IGxhYmVsOiBsb2NhbGl6ZSgnbW9kZWxzJywgXCJNb2RlbHNcIiksIGljb246IENvZGljb24udm0sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbW9kZWxzRGVzYycsIFwiQ29uZmlndXJlIGFuZCBtYW5hZ2UgbGFuZ3VhZ2UgbW9kZWxzIGF2YWlsYWJsZSBmb3IgdXNlLlwiKSB9LFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzXTogeyBsYWJlbDogbG9jYWxpemUoJ3Rvb2xzJywgXCJUb29sc1wiKSwgaWNvbjogdG9vbHNJY29uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2xzRGVzYycsIFwiRW5hYmxlIG9yIGRpc2FibGUgZ3JvdXBzIG9mIGxhbmd1YWdlIG1vZGVsIHRvb2xzIGF2YWlsYWJsZSB0byBjaGF0LlwiKSB9LFxuXHRcdH07XG5cdFx0Y29uc3QgYWN0aXZlSGFybmVzc0lkID0gdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm1hbmFnZW1lbnRTZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgY29udHJpYnV0aW9uID0gYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXQoaWQsIGFjdGl2ZUhhcm5lc3NJZCkgPz8gYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXREZWZhdWx0KGlkKTtcblx0XHRcdGNvbnN0IGluZm8gPSBjb250cmlidXRpb24gPz8gc2VjdGlvbkluZm9baWRdO1xuXHRcdFx0aWYgKGluZm8pIHtcblx0XHRcdFx0dGhpcy5hbGxTZWN0aW9ucy5wdXNoKHsgaWQsIGxhYmVsOiBpbmZvLmxhYmVsLCBpY29uOiBpbmZvLmljb24sIGRlc2NyaXB0aW9uOiBpbmZvLmRlc2NyaXB0aW9uLCBjb3VudDogMCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5yZWJ1aWxkVmlzaWJsZVNlY3Rpb25zKCk7XG5cblx0XHQvLyBSZXN0b3JlIHNlbGVjdGVkIHNlY3Rpb24gZnJvbSBzdG9yYWdlLCBmYWxsaW5nIGJhY2sgdG8gd2VsY29tZSBwYWdlXG5cdFx0Y29uc3Qgc2F2ZWRTZWN0aW9uID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFTEVDVEVEX1NFQ1RJT05fS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHNhdmVkU2VjdGlvbiAmJiB0aGlzLnNlY3Rpb25zLnNvbWUocyA9PiBzLmlkID09PSBzYXZlZFNlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkU2VjdGlvbiA9IHNhdmVkU2VjdGlvbiBhcyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWxlY3RlZFNlY3Rpb24gPSB1bmRlZmluZWQ7IC8vIFNob3cgd2VsY29tZSBwYWdlXG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycy5jbGVhcigpO1xuXHRcdHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uV2lkZ2V0cy5jbGVhcigpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5haS1jdXN0b21pemF0aW9uLW1hbmFnZW1lbnQtZWRpdG9yJykpO1xuXG5cdFx0dGhpcy5jcmVhdGVTcGxpdFZpZXcoKTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTcGxpdFZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5zcGxpdFZpZXdDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcubWFuYWdlbWVudC1zcGxpdC12aWV3JykpO1xuXG5cdFx0dGhpcy5zaWRlYmFyQ29udGFpbmVyID0gJCgnLm1hbmFnZW1lbnQtc2lkZWJhcicpO1xuXHRcdHRoaXMuY29udGVudENvbnRhaW5lciA9ICQoJy5tYW5hZ2VtZW50LWNvbnRlbnQnKTtcblxuXHRcdHRoaXMuY3JlYXRlU2lkZWJhcigpO1xuXHRcdHRoaXMuY3JlYXRlQ29udGVudCgpO1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChuZXcgU3BsaXRWaWV3KHRoaXMuc3BsaXRWaWV3Q29udGFpbmVyLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCxcblx0XHRcdHByb3BvcnRpb25hbExheW91dDogdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzYXZlZFdpZHRoID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXROdW1iZXIoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NJREVCQVJfV0lEVEhfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU0lERUJBUl9ERUZBVUxUX1dJRFRIKTtcblxuXHRcdC8vIFNpZGViYXIgdmlld1xuXHRcdHRoaXMuc3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiB0aGlzLnNpZGViYXJDb250YWluZXIsXG5cdFx0XHRtaW5pbXVtU2l6ZTogU0lERUJBUl9NSU5fV0lEVEgsXG5cdFx0XHRtYXhpbXVtU2l6ZTogU0lERUJBUl9NQVhfV0lEVEgsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMuc2lkZWJhckNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0aWYgKGhlaWdodCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXRTaWRlYmFyKHdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0sIHNhdmVkV2lkdGgsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHQvLyBDb250ZW50IHZpZXdcblx0XHR0aGlzLnNwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogdGhpcy5jb250ZW50Q29udGFpbmVyLFxuXHRcdFx0bWluaW11bVNpemU6IENPTlRFTlRfTUlOX1dJRFRILFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdGxheW91dDogKHdpZHRoLCBfLCBoZWlnaHQpID0+IHtcblx0XHRcdFx0dGhpcy5jb250ZW50Q29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0XHRpZiAoaGVpZ2h0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLmxpc3RXaWRnZXQubGF5b3V0KGhlaWdodCAtIDE2LCB3aWR0aCAtIDI0KTtcblx0XHRcdFx0XHR0aGlzLm1jcExpc3RXaWRnZXQ/LmxheW91dChoZWlnaHQgLSAxNiwgd2lkdGggLSAyNCk7XG5cdFx0XHRcdFx0dGhpcy5wbHVnaW5MaXN0V2lkZ2V0Py5sYXlvdXQoaGVpZ2h0IC0gMTYsIHdpZHRoIC0gMjQpO1xuXHRcdFx0XHRcdHRoaXMudG9vbHNMaXN0V2lkZ2V0Py5sYXlvdXQoaGVpZ2h0IC0gMTYsIHdpZHRoIC0gMjQpO1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsc0Zvb3RlckhlaWdodCA9IHRoaXMubW9kZWxzRm9vdGVyRWxlbWVudD8ub2Zmc2V0SGVpZ2h0IHx8IDgwO1xuXHRcdFx0XHRcdHRoaXMubW9kZWxzV2lkZ2V0Py5sYXlvdXQoaGVpZ2h0IC0gMTYgLSBtb2RlbHNGb290ZXJIZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ2VkaXRvcicgJiYgdGhpcy5lbWJlZGRlZEVkaXRvciAmJiB0aGlzLmVtYmVkZGVkRWRpdG9yQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHQvLyBVc2UgdGhlIGFjdHVhbCByZW5kZXJlZCBzaXplIG9mIHRoZSBlbWJlZGRlZCBlZGl0b3IgY29udGFpbmVyIHNvXG5cdFx0XHRcdFx0XHQvLyB0aGUgTW9uYWNvIGVkaXRvciAoYW5kIGl0cyBzY3JvbGxiYXJzKSBzdGF5IHdpdGhpbiB0aGUgcm91bmRlZFxuXHRcdFx0XHRcdFx0Ly8gcGFuZWwgY2hyb21lIHJlZ2FyZGxlc3Mgb2YgaGVhZGVyL21hcmdpbiBjaGFuZ2VzLiBHdWFyZCBhZ2FpbnN0XG5cdFx0XHRcdFx0XHQvLyB0aGUgY29udGFpbmVyIGJlaW5nIGhpZGRlbiAoY2xpZW50SGVpZ2h0ID09PSAwKTsgcmUtbGF5b3V0IG9uY2Vcblx0XHRcdFx0XHRcdC8vIGl0IGJlY29tZXMgdmlzaWJsZSB0byBhdm9pZCBhIHplcm8taGVpZ2h0IGVkaXRvci5cblx0XHRcdFx0XHRcdGNvbnN0IHsgY2xpZW50V2lkdGgsIGNsaWVudEhlaWdodCB9ID0gdGhpcy5lbWJlZGRlZEVkaXRvckNvbnRhaW5lcjtcblx0XHRcdFx0XHRcdGlmIChjbGllbnRXaWR0aCA+IDAgJiYgY2xpZW50SGVpZ2h0ID4gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yLmxheW91dCh7IHdpZHRoOiBjbGllbnRXaWR0aCwgaGVpZ2h0OiBjbGllbnRIZWlnaHQgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdERPTS5nZXRXaW5kb3codGhpcy5lbWJlZGRlZEVkaXRvckNvbnRhaW5lcikucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodGhpcy5lbWJlZGRlZEVkaXRvciAmJiB0aGlzLmVtYmVkZGVkRWRpdG9yQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjb25zdCB7IGNsaWVudFdpZHRoOiB3LCBjbGllbnRIZWlnaHQ6IGggfSA9IHRoaXMuZW1iZWRkZWRFZGl0b3JDb250YWluZXI7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodyA+IDAgJiYgaCA+IDApIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvci5sYXlvdXQoeyB3aWR0aDogdywgaGVpZ2h0OiBoIH0pO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEVtYmVkZGVkIE1DUC9wbHVnaW4gZGV0YWlsIHBhbmVzIHVzZSBhIHBsYWluIERPTSB3aWRnZXQgdGhhdCBmbG93cyB3aXRoXG5cdFx0XHRcdFx0Ly8gdGhlIGNvbnRhaW5lcjsgbm8gZXhwbGljaXQgbGF5b3V0IGNhbGwgaXMgbmVlZGVkIGhlcmUuXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHQvLyBQZXJzaXN0IHNpZGViYXIgd2lkdGhcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLnNwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgwKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NJREVCQVJfV0lEVEhfS0VZLCB3aWR0aCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzZXQgb24gZG91YmxlLWNsaWNrXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5zcGxpdFZpZXcub25EaWRTYXNoUmVzZXQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG90YWxXaWR0aCA9IHRoaXMuc3BsaXRWaWV3LmdldFZpZXdTaXplKDApICsgdGhpcy5zcGxpdFZpZXcuZ2V0Vmlld1NpemUoMSk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KDAsIFNJREVCQVJfREVGQVVMVF9XSURUSCk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KDEsIHRvdGFsV2lkdGggLSBTSURFQkFSX0RFRkFVTFRfV0lEVEgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWN0aXZlSGFybmVzc0xhYmVsKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmhhcm5lc3NTZXJ2aWNlLmdldEFjdGl2ZURlc2NyaXB0b3IoKS5sYWJlbDtcblx0XHRyZXR1cm4gbGFiZWwgfHwgKHRoaXMud29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93ID8gJycgOiBsb2NhbGl6ZSgnbG9jYWxIYXJuZXNzTGFiZWwnLCBcIkxvY2FsXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSGFybmVzc0xhYmVsUHJlc2VudGF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IGhhcm5lc3NMYWJlbCA9IHRoaXMuZ2V0QWN0aXZlSGFybmVzc0xhYmVsKCk7XG5cdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmdldE9yQ3JlYXRlKCkuc2V0SGFybmVzc0xhYmVsKGhhcm5lc3NMYWJlbCk7XG5cdFx0dGhpcy53ZWxjb21lUGFnZT8uc2V0SGFybmVzc0xhYmVsKGhhcm5lc3NMYWJlbCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVidWlsZHMgdGhlIHZpc2libGUgc2VjdGlvbnMgbGlzdCBiYXNlZCBvbiB0aGUgYWN0aXZlIGhhcm5lc3Mnc1xuXHQgKiBgaGlkZGVuU2VjdGlvbnNgLiBJZiB0aGUgY3VycmVudCBzZWxlY3Rpb24gZmFsbHMgaW50byBhIGhpZGRlblxuXHQgKiBzZWN0aW9uLCB0aGUgZmlyc3QgdmlzaWJsZSBzZWN0aW9uIGlzIHNlbGVjdGVkIGluc3RlYWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYnVpbGRWaXNpYmxlU2VjdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlSWQgPSB0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MuZ2V0KCk7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHRoaXMuaGFybmVzc1NlcnZpY2UuZmluZEhhcm5lc3NCeUlkKGFjdGl2ZUlkKTtcblx0XHRjb25zdCBoaWRkZW4gPSBuZXcgU2V0KGRlc2NyaXB0b3I/LmhpZGRlblNlY3Rpb25zID8/IFtdKTtcblxuXHRcdHRoaXMuc2VjdGlvbnMubGVuZ3RoID0gMDtcblx0XHRmb3IgKGNvbnN0IHMgb2YgdGhpcy5hbGxTZWN0aW9ucykge1xuXHRcdFx0Y29uc3QgY29udHJpYnV0aW9uID0gYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXQocy5pZCwgYWN0aXZlSWQpO1xuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWQgPSBhaUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvblJlZ2lzdHJ5LmhhcyhzLmlkKTtcblx0XHRcdGlmICghaGlkZGVuLmhhcyhzLmlkKSAmJiAoIWNvbnRyaWJ1dGVkIHx8ICEhY29udHJpYnV0aW9uKSkge1xuXHRcdFx0XHR0aGlzLnNlY3Rpb25zLnB1c2goY29udHJpYnV0aW9uID8geyAuLi5zLCBsYWJlbDogY29udHJpYnV0aW9uLmxhYmVsLCBpY29uOiBjb250cmlidXRpb24uaWNvbiwgZGVzY3JpcHRpb246IGNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbiB9IDogcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSBsaXN0IHdpZGdldCBpZiBpdCBleGlzdHNcblx0XHRpZiAodGhpcy5zZWN0aW9uc0xpc3QpIHtcblx0XHRcdHRoaXMuc2VjdGlvbnNMaXN0LnNwbGljZSgwLCB0aGlzLnNlY3Rpb25zTGlzdC5sZW5ndGgsIHRoaXMuc2VjdGlvbnMpO1xuXHRcdFx0dGhpcy5sYXlvdXRTaWRlYmFyKHRoaXMuc2lkZWJhcldpZHRoLCB0aGlzLnNpZGViYXJIZWlnaHQpO1xuXHRcdH1cblxuXHRcdC8vIFJlYnVpbGQgd2VsY29tZSBjYXJkcyB0byByZWZsZWN0IG5ldyB2aXNpYmxlIHNlY3Rpb25zXG5cdFx0dGhpcy53ZWxjb21lUGFnZT8ucmVidWlsZENhcmRzKG5ldyBTZXQodGhpcy5zZWN0aW9ucy5tYXAocyA9PiBzLmlkKSkpO1xuXG5cdFx0Ly8gSWYgdGhlIGN1cnJlbnQgc2VsZWN0aW9uIGlzIGhpZGRlbiwgZmFsbCBiYWNrIHRvIHdlbGNvbWUgcGFnZVxuXHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiAhPT0gdW5kZWZpbmVkICYmICF0aGlzLnNlY3Rpb25zLnNvbWUocyA9PiBzLmlkID09PSB0aGlzLnNlbGVjdGVkU2VjdGlvbikgJiYgdGhpcy5zZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnNob3dXZWxjb21lUGFnZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVuc3VyZVNlY3Rpb25zTGlzdFJlZmxlY3RzQWN0aXZlU2VjdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2lkZWJhcigpOiB2b2lkIHtcblx0XHRjb25zdCBzaWRlYmFyQ29udGVudCA9IERPTS5hcHBlbmQodGhpcy5zaWRlYmFyQ29udGFpbmVyLCAkKCcuc2lkZWJhci1jb250ZW50JykpO1xuXG5cdFx0dGhpcy5jcmVhdGVTaWRlYmFySGVhZGVyKHNpZGViYXJDb250ZW50KTtcblxuXHRcdC8vIE1haW4gc2VjdGlvbnMgbGlzdCBjb250YWluZXIgKHRha2VzIHJlbWFpbmluZyBzcGFjZSlcblx0XHRjb25zdCBzZWN0aW9uc0xpc3RDb250YWluZXIgPSB0aGlzLnNlY3Rpb25zTGlzdENvbnRhaW5lciA9IERPTS5hcHBlbmQoc2lkZWJhckNvbnRlbnQsICQoJy5zaWRlYmFyLXNlY3Rpb25zLWxpc3QnKSk7XG5cblx0XHR0aGlzLnNlY3Rpb25zTGlzdCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hMaXN0PElTZWN0aW9uSXRlbT4sXG5cdFx0XHQnQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25zJyxcblx0XHRcdHNlY3Rpb25zTGlzdENvbnRhaW5lcixcblx0XHRcdG5ldyBTZWN0aW9uSXRlbURlbGVnYXRlKCksXG5cdFx0XHRbbmV3IFNlY3Rpb25JdGVtUmVuZGVyZXIodGhpcy5ob3ZlclNlcnZpY2UpXSxcblx0XHRcdHtcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtOiBJU2VjdGlvbkl0ZW0pID0+IGl0ZW0uY291bnQgPiAwXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdzZWN0aW9uQXJpYUxhYmVsV2l0aENvdW50JywgXCJ7MH0sIHsxfSBpdGVtc1wiLCBpdGVtLmxhYmVsLCBpdGVtLmNvdW50KVxuXHRcdFx0XHRcdFx0OiBpdGVtLmxhYmVsLFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoJ3NlY3Rpb25zQXJpYUxhYmVsJywgXCJBZ2VudCBDdXN0b21pemF0aW9uIFNlY3Rpb25zXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogdHJ1ZSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldElkOiAoaXRlbTogSVNlY3Rpb25JdGVtKSA9PiBpdGVtLmlkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5zZWN0aW9uc0xpc3Quc3BsaWNlKDAsIHRoaXMuc2VjdGlvbnNMaXN0Lmxlbmd0aCwgdGhpcy5zZWN0aW9ucyk7XG5cdFx0dGhpcy5lbnN1cmVTZWN0aW9uc0xpc3RSZWZsZWN0c0FjdGl2ZVNlY3Rpb24oKTtcblxuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuc2VjdGlvbnNMaXN0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuZWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93V2VsY29tZVBhZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlbGVjdFNlY3Rpb24oZS5lbGVtZW50c1swXS5pZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gaGFybmVzcyBjaGFuZ2VzIFx1MjAxNCByZWJ1aWxkIHZpc2libGUgc2VjdGlvbnMgYW5kIHJlZnJlc2ggY291bnRzLlxuXHRcdC8vIEFsc28gdHJhY2sgYXZhaWxhYmxlSGFybmVzc2VzIHRvIGhhbmRsZSBhZ2VudCByZWdpc3RyYXRpb24vdW5yZWdpc3RyYXRpb24uXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5oYXJuZXNzU2VydmljZS5hdmFpbGFibGVIYXJuZXNzZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYWN0aXZlSWQgPSB0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5oYXJuZXNzQ29udGV4dEtleS5zZXQoYWN0aXZlSWQpO1xuXHRcdFx0dGhpcy51cGRhdGVIb21lQnV0dG9uSGFybmVzc1ByZXNlbnRhdGlvbigpO1xuXHRcdFx0dGhpcy5yZWJ1aWxkVmlzaWJsZVNlY3Rpb25zKCk7XG5cdFx0XHQvLyBSZXNldCBjb3VudHMgdG8gemVybyBpbW1lZGlhdGVseSBvbiBoYXJuZXNzIHN3aXRjaCB0byBwcmV2ZW50XG5cdFx0XHQvLyBzdGFsZSBjb3VudHMgZnJvbSB0aGUgcHJldmlvdXMgaGFybmVzcyBmbGFzaGluZyBiZWZvcmUgdGhlIGFzeW5jXG5cdFx0XHQvLyBjb3VudCByZWZyZXNoIGNvbXBsZXRlcy4gT25seSByZXNldCB3aGVuIHRoZSBhY3RpdmUgaGFybmVzc1xuXHRcdFx0Ly8gYWN0dWFsbHkgY2hhbmdlZCB0byBhdm9pZCBmbGlja2VyIG9uIGhhcm5lc3MgcmVnaXN0cmF0aW9uIGV2ZW50cy5cblx0XHRcdGlmICh0aGlzLl9wcmV2aW91c0FjdGl2ZUhhcm5lc3NJZCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuX3ByZXZpb3VzQWN0aXZlSGFybmVzc0lkICE9PSBhY3RpdmVJZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtzZWN0aW9uLCB3aWRnZXRdIG9mIHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uV2lkZ2V0cykge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuZGVsZXRlKHdpZGdldCk7XG5cdFx0XHRcdFx0dGhpcy5jb250cmlidXRlZFNlY3Rpb25Db250YWluZXJzLmdldChzZWN0aW9uKT8ucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5jb250cmlidXRlZFNlY3Rpb25XaWRnZXRzLmNsZWFyKCk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB0aGlzLnNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTZWN0aW9uQ291bnQoc2VjdGlvbi5pZCwgMCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3ByZXZpb3VzQWN0aXZlSGFybmVzc0lkID0gYWN0aXZlSWQ7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNTdHJ1Y3R1cmVkUHJldmlld0VuYWJsZWQpKSB7XG5cdFx0XHRcdHRoaXMub25TdHJ1Y3R1cmVkUHJldmlld1NldHRpbmdDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDYW5kaWRhdGVzIGFyZSBvbmx5IGNvbGxlY3RlZCBmb3IgZW5hYmxlZCBjYXRlZ29yaWVzLCBzbyBlbmFibGluZyBvbmUgbXVzdCByZS1zY2FuLlxuXHRcdFx0aWYgKENVU1RPTUlaQVRJT05fTUlHUkFUSU9OX0NBVEVHT1JJRVMuc29tZShjYXRlZ29yeSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKGNhdGVnb3J5LmVuYWJsZW1lbnRTZXR0aW5nKSkpIHtcblx0XHRcdFx0dm9pZCB0aGlzLnJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uSW5mbygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY3JlYXRlU2lkZWJhck1pZ3JhdGlvblNob3J0Y3V0KHNpZGViYXJDb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0U2lkZWJhcih3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuc2lkZWJhcldpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5zaWRlYmFySGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdGlmICghdGhpcy5zZWN0aW9uc0xpc3RDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTdWJ0cmFjdCBzaWRlYmFyLWNvbnRlbnQgcGFkZGluZyAoNHB4IGVhY2ggc2lkZSA9IDhweCksIHRoZSBmaXhlZCBoZWFkZXIsXG5cdFx0Ly8gYW5kIHRoZSBvcHRpb25hbCBtaWdyYXRpb24gcm93IHNvIHRoZSBzZWN0aW9ucyBsaXN0IG9ubHkgb2NjdXBpZXMgdGhlXG5cdFx0Ly8gc3BhY2UgaXQgbmVlZHMgYW5kIHRoZSBtaWdyYXRpb24gZW50cnkgY2FuIHNpdCBkaXJlY3RseSBiZW5lYXRoIGl0LlxuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMuc2lkZWJhckhlYWRlckNvbnRhaW5lcj8ub2Zmc2V0SGVpZ2h0ID8/IDA7XG5cdFx0Y29uc3QgbWlncmF0aW9uSGVpZ2h0ID0gdGhpcy5taWdyYXRpb25TaG9ydGN1dENvbnRhaW5lcj8uc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnXG5cdFx0XHQ/ICh0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyPy5vZmZzZXRIZWlnaHQgPz8gMClcblx0XHRcdDogMDtcblx0XHRjb25zdCBhdmFpbGFibGVMaXN0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gOCAtIGhlYWRlckhlaWdodCAtIG1pZ3JhdGlvbkhlaWdodCk7XG5cdFx0Y29uc3QgbGlzdEhlaWdodCA9IE1hdGgubWluKGF2YWlsYWJsZUxpc3RIZWlnaHQsIHRoaXMuc2VjdGlvbnMubGVuZ3RoICogMjYpO1xuXHRcdHRoaXMuc2VjdGlvbnNMaXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2xpc3RIZWlnaHR9cHhgO1xuXHRcdHRoaXMuc2VjdGlvbnNMaXN0LmxheW91dChsaXN0SGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNpZGViYXJIZWFkZXIoc2lkZWJhckNvbnRlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaGVhZGVyUm93ID0gdGhpcy5zaWRlYmFySGVhZGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChzaWRlYmFyQ29udGVudCwgJCgnLnNpZGViYXItaGVhZGVyLXJvdycpKTtcblxuXHRcdC8vIEhvbWUvb3ZlcnZpZXcgYnV0dG9uXG5cdFx0Y29uc3QgaG9tZUJ1dHRvbiA9IHRoaXMuaG9tZUJ1dHRvbiA9IERPTS5hcHBlbmQoaGVhZGVyUm93LCAkKCdidXR0b24uc2lkZWJhci1ob21lLWJ1dHRvbicpKTtcblx0XHRob21lQnV0dG9uLmNsYXNzTGlzdC5hZGQoJ3NpZGViYXItaGFybmVzcy1ob21lLWJ1dHRvbicpO1xuXHRcdGhvbWVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2hvbWVCdXR0b24nLCBcIk92ZXJ2aWV3XCIpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBob21lQnV0dG9uLCBsb2NhbGl6ZSgnaG9tZUJ1dHRvblRvb2x0aXAnLCBcIkJhY2sgdG8gb3ZlcnZpZXdcIikpKTtcblx0XHRjb25zdCBob21lSWNvbiA9IHRoaXMuaG9tZUJ1dHRvbkljb24gPSBET00uYXBwZW5kKGhvbWVCdXR0b24sICQoJ3NwYW4uc2lkZWJhci1ob21lLWljb24nKSk7XG5cdFx0aG9tZUljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmhvbWUpKTtcblx0XHRob21lSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBob21lTGFiZWwgPSB0aGlzLmhvbWVCdXR0b25MYWJlbCA9IERPTS5hcHBlbmQoaG9tZUJ1dHRvbiwgJCgnc3Bhbi5zaWRlYmFyLWhvbWUtbGFiZWwnKSk7XG5cdFx0aG9tZUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2hvbWVCdXR0b25MYWJlbCcsIFwiT3ZlcnZpZXdcIik7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihob21lQnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNob3dXZWxjb21lUGFnZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZUhvbWVCdXR0b25IYXJuZXNzUHJlc2VudGF0aW9uKCk7XG5cblx0XHR0aGlzLnVwZGF0ZUhvbWVCdXR0b25TdHlsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVIb21lQnV0dG9uU3R5bGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhvbWVCdXR0b25MYWJlbCB8fCAhdGhpcy5ob21lQnV0dG9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaG9tZUJ1dHRvbkxhYmVsLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLmhvbWVCdXR0b24uc3R5bGUuZmxleCA9ICcxJztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSG9tZUJ1dHRvbkhhcm5lc3NQcmVzZW50YXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVIYXJuZXNzTGFiZWxQcmVzZW50YXRpb24oKTtcblxuXHRcdGlmICghdGhpcy5ob21lQnV0dG9uIHx8ICF0aGlzLmhvbWVCdXR0b25JY29uIHx8ICF0aGlzLmhvbWVCdXR0b25MYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaG9tZUJ1dHRvbkljb24uY2xhc3NOYW1lID0gJ3NpZGViYXItaG9tZS1pY29uJztcblx0XHR0aGlzLmhvbWVCdXR0b25JY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5ob21lKSk7XG5cdFx0dGhpcy5ob21lQnV0dG9uTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnaG9tZUJ1dHRvbkxhYmVsJywgXCJPdmVydmlld1wiKTtcblx0XHR0aGlzLmhvbWVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2hvbWVCdXR0b24nLCBcIk92ZXJ2aWV3XCIpKTtcblx0XHR0aGlzLmhvbWVCdXR0b24udGl0bGUgPSBsb2NhbGl6ZSgnaG9tZUJ1dHRvblRvb2x0aXAnLCBcIkJhY2sgdG8gb3ZlcnZpZXdcIik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNpZGViYXJNaWdyYXRpb25TaG9ydGN1dChzaWRlYmFyQ29udGVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyID0gRE9NLmFwcGVuZChzaWRlYmFyQ29udGVudCwgJCgnLnNpZGViYXItbWlncmF0aW9uLXNob3J0Y3V0JykpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0RE9NLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5zaWRlYmFyLW1pZ3JhdGlvbi1zZXBhcmF0b3InKSk7XG5cblx0XHRmb3IgKGNvbnN0IGNhdGVnb3J5IG9mIENVU1RPTUlaQVRJT05fTUlHUkFUSU9OX0NBVEVHT1JJRVMpIHtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCdidXR0b24uc2lkZWJhci1taWdyYXRpb24tYnV0dG9uJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0YnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRcdGJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGNhdGVnb3J5LnNob3J0Y3V0TGFiZWwpO1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgYnV0dG9uLCBjYXRlZ29yeS5zaG9ydGN1dFRvb2x0aXApKTtcblxuXHRcdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnNpZGViYXItbWlncmF0aW9uLWljb24nKSk7XG5cdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi53YXJuaW5nKSk7XG5cdFx0XHRpY29uLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0XHRjb25zdCBsYWJlbCA9IERPTS5hcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnNpZGViYXItbWlncmF0aW9uLWxhYmVsJykpO1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBjYXRlZ29yeS5zaG9ydGN1dExhYmVsO1xuXG5cdFx0XHRjb25zdCBjb3VudCA9IERPTS5hcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnNpZGViYXItbWlncmF0aW9uLWNvdW50JykpO1xuXG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNob3dDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZShjYXRlZ29yeS5pZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMubWlncmF0aW9uU2hvcnRjdXRzLnNldChjYXRlZ29yeS5pZCwgeyBidXR0b24sIGNvdW50IH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlV2VsY29tZVBhZ2UocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMud2VsY29tZVBhZ2UgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChuZXcgQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2UoXG5cdFx0XHRwYXJlbnQsXG5cdFx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2Uud2VsY29tZVBhZ2VGZWF0dXJlcyxcblx0XHRcdHtcblx0XHRcdFx0c2VsZWN0U2VjdGlvbjogKHNlY3Rpb24pID0+IHRoaXMuc2VsZWN0U2VjdGlvbihzZWN0aW9uKSxcblx0XHRcdFx0c2VsZWN0U2VjdGlvbldpdGhNYXJrZXRwbGFjZTogKHNlY3Rpb24pID0+IHRoaXMuc2VsZWN0U2VjdGlvbihzZWN0aW9uLCB7IHNob3dNYXJrZXRwbGFjZTogdHJ1ZSB9KSxcblx0XHRcdFx0Y2xvc2VFZGl0b3I6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0XHRcdFx0dGhpcy5ncm91cC5jbG9zZUVkaXRvcih0aGlzLmlucHV0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1pZ3JhdGVDdXN0b21pemF0aW9uczogKGNhdGVnb3J5SWQpID0+IHtcblx0XHRcdFx0XHR0aGlzLnNob3dDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZShjYXRlZ29yeUlkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlZmlsbENoYXQ6IGFzeW5jIChxdWVyeSwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnNWaWV3SWQgPSAnd29ya2JlbmNoLnZpZXcuc2Vzc2lvbnMuY2hhdCc7XG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zPy5uZXdDaGF0KSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5zZXNzaW9ucy5uZXdDaGF0Jyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgdmlldyA9IGF3YWl0IHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KHNlc3Npb25zVmlld0lkLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2hhdFZpZXcgPSB2aWV3IGFzIHVua25vd24gYXMgeyBwcmVmaWxsSW5wdXQ/KHRleHQ6IHN0cmluZyk6IHZvaWQ7IHNlbmRRdWVyeT8odGV4dDogc3RyaW5nKTogdm9pZCB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRpZiAob3B0aW9ucz8uaXNQYXJ0aWFsUXVlcnkgJiYgY2hhdFZpZXc/LnByZWZpbGxJbnB1dCkge1xuXHRcdFx0XHRcdFx0XHRcdGNoYXRWaWV3LnByZWZpbGxJbnB1dChxdWVyeSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoY2hhdFZpZXc/LnNlbmRRdWVyeSkge1xuXHRcdFx0XHRcdFx0XHRcdGNoYXRWaWV3LnNlbmRRdWVyeShxdWVyeSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zPy5uZXdDaGF0KSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5ld0NoYXQnKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbicsIHsgcXVlcnksIGlzUGFydGlhbFF1ZXJ5OiBvcHRpb25zPy5pc1BhcnRpYWxRdWVyeSA/PyBmYWxzZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UsXG5cdFx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UsXG5cdFx0XHR0aGlzLmhvdmVyU2VydmljZSxcblx0XHRcdHRoaXMuZ2V0QWN0aXZlSGFybmVzc0xhYmVsKCksXG5cdFx0KSk7XG5cdFx0dGhpcy53ZWxjb21lUGFnZS5yZWJ1aWxkQ2FyZHMobmV3IFNldCh0aGlzLnNlY3Rpb25zLm1hcChzID0+IHMuaWQpKSk7XG5cdFx0dGhpcy53ZWxjb21lUGFnZS5zZXRNaWdyYXRpb25DYXRlZ29yaWVzKHRoaXMuZ2V0TWlncmF0aW9uQ2F0ZWdvcnlTdW1tYXJpZXMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUJhY2tBcnJvd0J1dHRvbihvbkNsaWNrPzogKCkgPT4gdm9pZCk6IEhUTUxCdXR0b25FbGVtZW50IHtcblx0XHRjb25zdCBidXR0b24gPSAkKCdidXR0b24uc2VjdGlvbi1iYWNrLWFycm93LWJ1dHRvbicpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdGJ1dHRvbi50eXBlID0gJ2J1dHRvbic7XG5cdFx0YnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdiYWNrVG9PdmVydmlldycsIFwiQmFjayB0byBvdmVydmlld1wiKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgYnV0dG9uLCBsb2NhbGl6ZSgnYmFja1RvT3ZlcnZpZXdUb29sdGlwJywgXCJCYWNrIHRvIG92ZXJ2aWV3XCIpKSk7XG5cdFx0Y29uc3QgaWNvbiA9IERPTS5hcHBlbmQoYnV0dG9uLCAkKCdzcGFuLnNlY3Rpb24tYmFjay1hcnJvdy1pY29uJykpO1xuXHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmFycm93TGVmdCkpO1xuXHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdGlmIChvbkNsaWNrKSB7XG5cdFx0XHRcdG9uQ2xpY2soKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2hvd1dlbGNvbWVQYWdlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHJldHVybiBidXR0b247XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUN1c3RvbWl6YXRpb25NaWdyYXRpb25Db250ZW50KGNvbnRlbnRJbm5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLm1pZ3JhdGlvbkNvbnRlbnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRlbnRJbm5lciwgJCgnLnByb21wdC1taWdyYXRpb24tY29udGVudC1jb250YWluZXIuYWktY3VzdG9taXphdGlvbi1saXN0LXdpZGdldCcpKTtcblxuXHRcdGNvbnN0IGhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5taWdyYXRpb25Db250ZW50Q29udGFpbmVyLCAkKCcuc2VjdGlvbi10aXRsZS1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGVSb3cgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnLnNlY3Rpb24tdGl0bGUtcm93JykpO1xuXHRcdHRoaXMubWlncmF0aW9uVGl0bGVFbGVtZW50ID0gRE9NLmFwcGVuZCh0aXRsZVJvdywgJCgnaDIuc2VjdGlvbi10aXRsZScpKTtcblx0XHR0aGlzLm1pZ3JhdGlvbkRlc2NyaXB0aW9uRWxlbWVudCA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCdwLnNlY3Rpb24tdGl0bGUtZGVzY3JpcHRpb24nKSk7XG5cblx0XHR0aGlzLm1pZ3JhdGlvbkJhbm5lckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5taWdyYXRpb25Db250ZW50Q29udGFpbmVyLCAkKCcuY3VzdG9taXphdGlvbi1taWdyYXRpb24tYmFubmVyJykpO1xuXHRcdHRoaXMubWlncmF0aW9uQmFubmVyQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHRjb25zdCBzZWN0aW9uTGluayA9IHRoaXMubWlncmF0aW9uTGlua0VsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMubWlncmF0aW9uQ29udGVudENvbnRhaW5lciwgJCgnYS5zZWN0aW9uLXRpdGxlLWxpbmsubWlncmF0aW9uLWxlYXJuLW1vcmUtbGluaycpKSBhcyBIVE1MQW5jaG9yRWxlbWVudDtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHNlY3Rpb25MaW5rLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShzZWN0aW9uTGluay5ocmVmKSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IERPTS5hcHBlbmQodGhpcy5taWdyYXRpb25Db250ZW50Q29udGFpbmVyLCAkKCcubGlzdC1zZWFyY2gtYW5kLWJ1dHRvbi1jb250YWluZXIucHJvbXB0LW1pZ3JhdGlvbi1hY3Rpb25zJykpO1xuXHRcdGNvbnN0IHNlYXJjaENvbnRhaW5lciA9IERPTS5hcHBlbmQoYWN0aW9ucywgJCgnLmxpc3Qtc2VhcmNoLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLm1pZ3JhdGlvblNlYXJjaElucHV0ID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQobmV3IElucHV0Qm94KHNlYXJjaENvbnRhaW5lciwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnY3VzdG9taXphdGlvbk1pZ3JhdGlvblNlYXJjaFBsYWNlaG9sZGVyJywgXCJUeXBlIHRvIHNlYXJjaC4uLlwiKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsXG5cdFx0fSkpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMubWlncmF0aW9uU2VhcmNoSW5wdXQub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5taWdyYXRpb25TZWFyY2hRdWVyeSA9IHRoaXMubWlncmF0aW9uU2VhcmNoSW5wdXQ/LnZhbHVlID8/ICcnO1xuXHRcdFx0dGhpcy5yZW5kZXJDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZSgpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBhY3Rpb25CdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGFjdGlvbnMsICQoJy5saXN0LWFkZC1idXR0b24tY29udGFpbmVyJykpO1xuXHRcdHRoaXMubWlncmF0aW9uTWlncmF0ZUJ1dHRvbiA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b24oYWN0aW9uQnV0dG9uQ29udGFpbmVyLCBkZWZhdWx0QnV0dG9uU3R5bGVzKSk7XG5cdFx0dGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbGlzdC1hZGQtYnV0dG9uJywgJ3Byb21wdC1taWdyYXRpb24tYnV0dG9uJyk7XG5cdFx0dGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2N1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlQnV0dG9uJywgXCJNaWdyYXRlXCIpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMubWlncmF0aW9uTWlncmF0ZUJ1dHRvbi5lbGVtZW50LCAoKSA9PiB0aGlzLmdldEFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5KCk/Lm1pZ3JhdGVCdXR0b25Ub29sdGlwID8/ICcnKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2F0ZWdvcnkgPSB0aGlzLmdldEFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5KCk7XG5cdFx0XHRpZiAoIWNhdGVnb3J5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGVkQ3VzdG9taXphdGlvbnMgPSB0aGlzLmdldE1pZ3JhdGlvbkNhbmRpZGF0ZXMoY2F0ZWdvcnkpXG5cdFx0XHRcdC5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiB0aGlzLmlzQ3VzdG9taXphdGlvblNlbGVjdGVkRm9yTWlncmF0aW9uKGN1c3RvbWl6YXRpb24pKTtcblx0XHRcdHZvaWQgdGhpcy5taWdyYXRlU2VsZWN0ZWRDdXN0b21pemF0aW9ucyhjYXRlZ29yeSwgc2VsZWN0ZWRDdXN0b21pemF0aW9ucyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5taWdyYXRpb25MaXN0Q29udGFpbmVyID0gJCgnLnByb21wdC1taWdyYXRpb24tbGlzdC5saXN0LWNvbnRhaW5lcicpO1xuXHRcdHRoaXMubWlncmF0aW9uTGlzdFNjcm9sbGFibGUgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5taWdyYXRpb25MaXN0Q29udGFpbmVyLCB7XG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkhpZGRlbixcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHR1c2VTaGFkb3dzOiBmYWxzZSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgbWlncmF0aW9uTGlzdFNjcm9sbGFibGVOb2RlID0gdGhpcy5taWdyYXRpb25MaXN0U2Nyb2xsYWJsZS5nZXREb21Ob2RlKCk7XG5cdFx0bWlncmF0aW9uTGlzdFNjcm9sbGFibGVOb2RlLmNsYXNzTGlzdC5hZGQoJ3Byb21wdC1taWdyYXRpb24tbGlzdC1zY3JvbGxhYmxlJyk7XG5cdFx0dGhpcy5taWdyYXRpb25Db250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKG1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlTm9kZSk7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gRE9NLmdldFdpbmRvdyh0aGlzLm1pZ3JhdGlvbkNvbnRlbnRDb250YWluZXIpO1xuXHRcdGNvbnN0IG1pZ3JhdGlvblJlc2l6ZU9ic2VydmVyID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQobmV3IERPTS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoXG5cdFx0XHQnQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5wcm9tcHRNaWdyYXRpb25MaXN0U2Nyb2xsYWJsZScsXG5cdFx0XHQoKSA9PiB0aGlzLm1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpLFxuXHRcdFx0dGFyZ2V0V2luZG93LFxuXHRcdCkpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKG1pZ3JhdGlvblJlc2l6ZU9ic2VydmVyLm9ic2VydmUobWlncmF0aW9uTGlzdFNjcm9sbGFibGVOb2RlKSk7XG5cdFx0dGhpcy5yZW5kZXJDdXN0b21pemF0aW9uTWlncmF0aW9uUGFnZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb250ZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnRJbm5lciA9IERPTS5hcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcuY29udGVudC1pbm5lcicpKTtcblxuXHRcdC8vIFdlbGNvbWUgcGFnZSAoc2hvd24gd2hlbiBubyBzZWN0aW9uIGlzIHNlbGVjdGVkKVxuXHRcdHRoaXMuY3JlYXRlV2VsY29tZVBhZ2UoY29udGVudElubmVyKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkoXG5cdFx0XHR0aGlzLnByb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyxcblx0XHRcdHRoaXMucHJvbXB0c1NlcnZpY2Uub25EaWRDaGFuZ2VDdXN0b21BZ2VudHMsXG5cdFx0XHR0aGlzLnByb21wdHNTZXJ2aWNlLm9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0dGhpcy5wcm9tcHRzU2VydmljZS5vbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zLFxuXHRcdCkoKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLnJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uSW5mbygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MucmVhZChyZWFkZXIpO1xuXHRcdFx0dm9pZCB0aGlzLnJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uSW5mbygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIENvbnRhaW5lciBmb3IgcHJvbXB0cy1iYXNlZCBjb250ZW50IChBZ2VudHMsIFNraWxscywgSW5zdHJ1Y3Rpb25zLCBQcm9tcHRzKVxuXHRcdHRoaXMucHJvbXB0c0NvbnRlbnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRlbnRJbm5lciwgJCgnLnByb21wdHMtY29udGVudC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5saXN0V2lkZ2V0ID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25MaXN0V2lkZ2V0KSk7XG5cdFx0dGhpcy5wcm9tcHRzQ29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmxpc3RXaWRnZXQuZWxlbWVudCk7XG5cdFx0dGhpcy5jcmVhdGVDdXN0b21pemF0aW9uTWlncmF0aW9uQ29udGVudChjb250ZW50SW5uZXIpO1xuXG5cdFx0Ly8gSGFuZGxlIGl0ZW0gc2VsZWN0aW9uXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5saXN0V2lkZ2V0Lm9uRGlkU2VsZWN0SXRlbShpdGVtID0+IHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEN1c3RvbWl6YXRpb25FZGl0b3JJdGVtU2VsZWN0ZWRFdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvckl0ZW1TZWxlY3RlZENsYXNzaWZpY2F0aW9uPignY2hhdEN1c3RvbWl6YXRpb25FZGl0b3IuaXRlbVNlbGVjdGVkJywge1xuXHRcdFx0XHRzZWN0aW9uOiB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/PyAnd2VsY29tZScsXG5cdFx0XHRcdHByb21wdFR5cGU6IGl0ZW0ucHJvbXB0VHlwZSxcblx0XHRcdFx0c3RvcmFnZTogaXRlbS5zb3VyY2UgPz8gJ2V4dGVybmFsJyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc291cmNlID0gaXRlbS5zb3VyY2U7XG5cdFx0XHRjb25zdCBpc1dvcmtzcGFjZUZpbGUgPSBzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWw7XG5cdFx0XHRjb25zdCBpc1JlYWRPbmx5ID0gIXNvdXJjZSB8fCBzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuZXh0ZW5zaW9uIHx8IHNvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4gfHwgc291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW47XG5cdFx0XHR0aGlzLnNob3dFbWJlZGRlZEVkaXRvcihpdGVtLnVyaSwgaXRlbS5uYW1lLCBpdGVtLnByb21wdFR5cGUsIHNvdXJjZSA/PyBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4sIGlzV29ya3NwYWNlRmlsZSwgaXNSZWFkT25seSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGNyZWF0ZSBhY3Rpb25zIC0gQUktZ3VpZGVkIGNyZWF0aW9uXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5saXN0V2lkZ2V0Lm9uRGlkUmVxdWVzdENyZWF0ZShwcm9tcHRUeXBlID0+IHtcblx0XHRcdHRoaXMuY3JlYXRlTmV3SXRlbVdpdGhBSShwcm9tcHRUeXBlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBIYW5kbGUgbWFudWFsIGNyZWF0ZSBhY3Rpb25zIC0gb3BlbiBlZGl0b3IgZGlyZWN0bHlcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmxpc3RXaWRnZXQub25EaWRSZXF1ZXN0Q3JlYXRlTWFudWFsKCh7IHR5cGUsIHRhcmdldCwgcm9vdEZpbGVOYW1lIH0pID0+IHtcblx0XHRcdHRoaXMuY3JlYXRlTmV3SXRlbU1hbnVhbCh0eXBlLCB0YXJnZXQsIHJvb3RGaWxlTmFtZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciBNb2RlbHMgY29udGVudCAob25seSBpbiBzZXNzaW9ucylcblx0XHRjb25zdCBoYXNTZWN0aW9ucyA9IG5ldyBTZXQodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLm1hbmFnZW1lbnRTZWN0aW9ucyk7XG5cdFx0aWYgKGhhc1NlY3Rpb25zLmhhcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHMpKSB7XG5cdFx0XHR0aGlzLm1vZGVsc0NvbnRlbnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRlbnRJbm5lciwgJCgnLm1vZGVscy1jb250ZW50LWNvbnRhaW5lcicpKTtcblx0XHRcdGNvbnN0IG1vZGVsc0JhY2tCYXIgPSBET00uYXBwZW5kKHRoaXMubW9kZWxzQ29udGVudENvbnRhaW5lciwgJCgnLnNlY3Rpb24tYmFjay1iYXInKSk7XG5cdFx0XHRtb2RlbHNCYWNrQmFyLmFwcGVuZENoaWxkKHRoaXMuY3JlYXRlQmFja0Fycm93QnV0dG9uKCkpO1xuXHRcdFx0dGhpcy5tb2RlbHNXaWRnZXQgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2RlbHNXaWRnZXQpKTtcblx0XHRcdHRoaXMubW9kZWxzQ29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLm1vZGVsc1dpZGdldC5lbGVtZW50KTtcblxuXHRcdFx0dGhpcy5tb2RlbHNGb290ZXJFbGVtZW50ID0gRE9NLmFwcGVuZCh0aGlzLm1vZGVsc0NvbnRlbnRDb250YWluZXIsICQoJy5zZWN0aW9uLWZvb3RlcicpKTtcblx0XHRcdGNvbnN0IG1vZGVsc0Rlc2NyaXB0aW9uID0gRE9NLmFwcGVuZCh0aGlzLm1vZGVsc0Zvb3RlckVsZW1lbnQsICQoJ3Auc2VjdGlvbi1mb290ZXItZGVzY3JpcHRpb24nKSk7XG5cdFx0XHRtb2RlbHNEZXNjcmlwdGlvbi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdtb2RlbHNEZXNjcmlwdGlvbicsIFwiQnJvd3NlIGFuZCBtYW5hZ2UgbGFuZ3VhZ2UgbW9kZWxzIGZyb20gZGlmZmVyZW50IHByb3ZpZGVycy4gU2VsZWN0IG1vZGVscyBmb3IgdXNlIGluIGNoYXQsIGNvZGUgY29tcGxldGlvbiwgYW5kIG90aGVyIEFJIGZlYXR1cmVzLlwiKTtcblx0XHRcdGNvbnN0IG1vZGVsc0xpbmsgPSBET00uYXBwZW5kKHRoaXMubW9kZWxzRm9vdGVyRWxlbWVudCwgJCgnYS5zZWN0aW9uLWZvb3Rlci1saW5rJykpIGFzIEhUTUxBbmNob3JFbGVtZW50O1xuXHRcdFx0bW9kZWxzTGluay50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdsZWFybk1vcmVNb2RlbHMnLCBcIkxlYXJuIG1vcmUgYWJvdXQgbGFuZ3VhZ2UgbW9kZWxzXCIpO1xuXHRcdFx0bW9kZWxzTGluay5ocmVmID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvYWdlbnQtY3VzdG9taXphdGlvbi9sYW5ndWFnZS1tb2RlbHM/cmVmZXJyZXI9aW4tcHJvZHVjdCc7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1vZGVsc0xpbmssICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKG1vZGVsc0xpbmsuaHJlZikpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIENvbnRhaW5lciBmb3IgTUNQIGNvbnRlbnRcblx0XHRpZiAoaGFzU2VjdGlvbnMuaGFzKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMpKSB7XG5cdFx0XHR0aGlzLm1jcENvbnRlbnRDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRlbnRJbm5lciwgJCgnLm1jcC1jb250ZW50LWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMubWNwTGlzdFdpZGdldCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwTGlzdFdpZGdldCkpO1xuXHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0LnNldENsb3NlQ3VzdG9taXphdGlvbkVkaXRvcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5ncm91cC5jbG9zZUVkaXRvcih0aGlzLmlucHV0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLm1jcENvbnRlbnRDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5tY3BMaXN0V2lkZ2V0LmVsZW1lbnQpO1xuXG5cdFx0XHQvLyBFbWJlZGRlZCBNQ1Agc2VydmVyIGRldGFpbCB2aWV3XG5cdFx0XHR0aGlzLm1jcERldGFpbENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGVudElubmVyLCAkKCcubWNwLWRldGFpbC1jb250YWluZXInKSk7XG5cdFx0XHR0aGlzLmNyZWF0ZUVtYmVkZGVkTWNwRGV0YWlsKCk7XG5cblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMubWNwTGlzdFdpZGdldC5vbkRpZFNlbGVjdFNlcnZlcihzZXJ2ZXIgPT4ge1xuXHRcdFx0XHR0aGlzLnNob3dFbWJlZGRlZE1jcERldGFpbChzZXJ2ZXIpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLm1jcExpc3RXaWRnZXQub25EaWRSZXF1ZXN0U2hvd1BsdWdpbihpdGVtID0+IHtcblx0XHRcdFx0dGhpcy5zaG93UGx1Z2luRGV0YWlsKGl0ZW0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIENvbnRhaW5lciBmb3IgUGx1Z2lucyBjb250ZW50XG5cdFx0aWYgKGhhc1NlY3Rpb25zLmhhcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zKSkge1xuXHRcdFx0dGhpcy5wbHVnaW5Db250ZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy5wbHVnaW4tY29udGVudC1jb250YWluZXInKSk7XG5cdFx0XHR0aGlzLnBsdWdpbkxpc3RXaWRnZXQgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbkxpc3RXaWRnZXQpKTtcblx0XHRcdHRoaXMucGx1Z2luQ29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnBsdWdpbkxpc3RXaWRnZXQuZWxlbWVudCk7XG5cblx0XHRcdC8vIEVtYmVkZGVkIHBsdWdpbiBkZXRhaWwgdmlld1xuXHRcdFx0dGhpcy5wbHVnaW5EZXRhaWxDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRlbnRJbm5lciwgJCgnLnBsdWdpbi1kZXRhaWwtY29udGFpbmVyJykpO1xuXHRcdFx0dGhpcy5jcmVhdGVFbWJlZGRlZFBsdWdpbkRldGFpbCgpO1xuXG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLnBsdWdpbkxpc3RXaWRnZXQub25EaWRTZWxlY3RQbHVnaW4oaXRlbSA9PiB7XG5cdFx0XHRcdHRoaXMucGx1Z2luRGV0YWlsUmV0dXJuU2VjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5zaG93RW1iZWRkZWRQbHVnaW5EZXRhaWwoaXRlbSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciBUb29scyBjb250ZW50LlxuXHRcdGlmIChoYXNTZWN0aW9ucy5oYXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uVG9vbHMpKSB7XG5cdFx0XHR0aGlzLnRvb2xzQ29udGVudENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGVudElubmVyLCAkKCcudG9vbHMtY29udGVudC1jb250YWluZXInKSk7XG5cdFx0XHQvLyBUb29scyBjdXN0b21pemF0aW9ucyBvbmx5IHRhcmdldCB0aGUgYWdlbnQgaG9zdCAoQ29waWxvdCBDTEkpLCBpbiBib3RoIHdpbmRvd3MuXG5cdFx0XHR0aGlzLnRvb2xzTGlzdFdpZGdldCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVG9vbHNMaXN0V2lkZ2V0LCBBR0VOVF9IT1NUX0NPUElMT1RfQ0xJX1NFU1NJT05fVFlQRSkpO1xuXHRcdFx0dGhpcy50b29sc0NvbnRlbnRDb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy50b29sc0xpc3RXaWRnZXQuZWxlbWVudCk7XG5cblx0XHRcdC8vIEVtYmVkZGVkIHRvb2wtY29udHJpYnV0aW5nIGV4dGVuc2lvbiBkZXRhaWwgdmlld1xuXHRcdFx0dGhpcy50b29sc0RldGFpbENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29udGVudElubmVyLCAkKCcudG9vbHMtZGV0YWlsLWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMuY3JlYXRlRW1iZWRkZWRUb29sRGV0YWlsKCk7XG5cblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMudG9vbHNMaXN0V2lkZ2V0Lm9uRGlkU2VsZWN0RXh0ZW5zaW9uKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRcdHRoaXMuc2hvd0VtYmVkZGVkVG9vbERldGFpbChleHRlbnNpb24pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB0aGlzLndvcmtzcGFjZVNlcnZpY2UubWFuYWdlbWVudFNlY3Rpb25zKSB7XG5cdFx0XHRpZiAoIWFpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uUmVnaXN0cnkuaGFzKHNlY3Rpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy5jb250cmlidXRlZC1zZWN0aW9uLWNvbnRhaW5lcicpKTtcblx0XHRcdHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycy5zZXQoc2VjdGlvbiwgY29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBFbWJlZGRlZCBlZGl0b3IgY29udGFpbmVyXG5cdFx0dGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyID0gRE9NLmFwcGVuZChjb250ZW50SW5uZXIsICQoJy5lZGl0b3ItY29udGVudC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5jcmVhdGVFbWJlZGRlZEVkaXRvcigpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgdmlzaWJpbGl0eSBiYXNlZCBvbiBzZWxlY3RlZCBzZWN0aW9uXG5cdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXG5cdFx0Ly8gV2lyZSB1cCBzZWN0aW9uIGNvdW50IHVwZGF0ZXMgXHUyMDE0IGFjdGl2ZSBwcm9tcHRzIHNlY3Rpb24gZ2V0cyBpdHMgY291bnRcblx0XHQvLyBmcm9tIHRoZSBsaXN0IHdpZGdldDsgYWxsIHByb21wdHMgc2VjdGlvbnMgYXJlIGFsc28gcmVmcmVzaGVkIGZyb21cblx0XHQvLyB0aGUgcHJvbXB0cyBzZXJ2aWNlIG9uIGV2ZXJ5IGNoYW5nZSBldmVudCBmb3IgY29uc2lzdGVuY3kuXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5saXN0V2lkZ2V0Lm9uRGlkQ2hhbmdlSXRlbUNvdW50KGNvdW50ID0+IHtcblx0XHRcdGlmICh0aGlzLmlzUHJvbXB0c1NlY3Rpb24odGhpcy5zZWxlY3RlZFNlY3Rpb24pKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KHRoaXMuc2VsZWN0ZWRTZWN0aW9uLCBjb3VudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmICh0aGlzLm1jcExpc3RXaWRnZXQpIHtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMubWNwTGlzdFdpZGdldC5vbkRpZENoYW5nZUl0ZW1Db3VudChjb3VudCA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsIGNvdW50KTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMubWNwTGlzdFdpZGdldC5maXJlSXRlbUNvdW50KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnBsdWdpbkxpc3RXaWRnZXQpIHtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMucGx1Z2luTGlzdFdpZGdldC5vbkRpZENoYW5nZUl0ZW1Db3VudChjb3VudCA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsIGNvdW50KTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldC5maXJlSXRlbUNvdW50KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1vZGVsc1dpZGdldCkge1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5tb2RlbHNXaWRnZXQub25EaWRDaGFuZ2VJdGVtQ291bnQoY291bnQgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVNlY3Rpb25Db3VudChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHMsIGNvdW50KTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMubW9kZWxzV2lkZ2V0LmZpcmVJdGVtQ291bnQoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudG9vbHNMaXN0V2lkZ2V0KSB7XG5cdFx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLnRvb2xzTGlzdFdpZGdldC5vbkRpZENoYW5nZUl0ZW1Db3VudChjb3VudCA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU2VjdGlvbkNvdW50KEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzLCBjb3VudCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLnRvb2xzTGlzdFdpZGdldC5maXJlSXRlbUNvdW50KCk7XG5cdFx0fVxuXG5cdFx0Ly8gUGVyLXByb21wdHMtc2VjdGlvbiBhdXRvcnVuczogZHJpdmUgc2lkZWJhciBjb3VudHMgZnJvbSB0aGUgaXRlbXMgbW9kZWwsXG5cdFx0Ly8gdGhlIHNhbWUgc291cmNlIHRoZSBlZGl0b3IgbGlzdCB3aWRnZXQgcmVuZGVycyBmcm9tLlxuXHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBJVEVNU19NT0RFTF9TRUNUSU9OUykge1xuXHRcdFx0Y29uc3Qgb2JzZXJ2YWJsZSA9IHRoaXMuaXRlbXNNb2RlbC5nZXRDb3VudChzZWN0aW9uKTtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVTZWN0aW9uQ291bnQoc2VjdGlvbiwgb2JzZXJ2YWJsZS5yZWFkKHJlYWRlcikpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIExvYWQgaXRlbXMgZm9yIHRoZSBpbml0aWFsIHNlY3Rpb25cblx0XHRpZiAodGhpcy5pc1Byb21wdHNTZWN0aW9uKHRoaXMuc2VsZWN0ZWRTZWN0aW9uKSkge1xuXHRcdFx0dm9pZCB0aGlzLmxpc3RXaWRnZXQuc2V0U2VjdGlvbih0aGlzLnNlbGVjdGVkU2VjdGlvbik7XG5cdFx0fVxuXG5cdFx0dm9pZCB0aGlzLnJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uSW5mbygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkluZm8oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWN0aXZlSGFybmVzc0lkID0gdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpO1xuXHRcdGNvbnN0IHJlZnJlc2hTZXF1ZW5jZSA9ICsrdGhpcy5jdXN0b21pemF0aW9uTWlncmF0aW9uUmVmcmVzaFNlcXVlbmNlO1xuXG5cdFx0aWYgKCFpc0FnZW50SG9zdFRhcmdldChhY3RpdmVIYXJuZXNzSWQpKSB7XG5cdFx0XHR0aGlzLnNldEN1c3RvbWl6YXRpb25zVG9NaWdyYXRlKG5ldyBNYXAoKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGVuYWJsZWRDYXRlZ29yaWVzID0gdGhpcy5nZXRFbmFibGVkTWlncmF0aW9uQ2F0ZWdvcmllcygpO1xuXHRcdFx0aWYgKGVuYWJsZWRDYXRlZ29yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLnNldEN1c3RvbWl6YXRpb25zVG9NaWdyYXRlKG5ldyBNYXAoKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc291cmNlVHlwZXMgPSBnZXRDdXN0b21pemF0aW9uTWlncmF0aW9uU291cmNlVHlwZXMoZW5hYmxlZENhdGVnb3JpZXMpO1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbnNCeVR5cGUgPSBhd2FpdCBQcm9taXNlLmFsbChzb3VyY2VUeXBlcy5tYXAodHlwZSA9PiB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyh0eXBlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkpO1xuXHRcdFx0aWYgKHJlZnJlc2hTZXF1ZW5jZSAhPT0gdGhpcy5jdXN0b21pemF0aW9uTWlncmF0aW9uUmVmcmVzaFNlcXVlbmNlIHx8IGFjdGl2ZUhhcm5lc3NJZCAhPT0gdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWxsQ3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9uc0J5VHlwZS5mbGF0KCk7XG5cdFx0XHRjb25zdCBjYW5kaWRhdGVzQnlDYXRlZ29yeSA9IG5ldyBNYXA8Q3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5SWQsIHJlYWRvbmx5IElQcm9tcHRQYXRoW10+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNhdGVnb3J5IG9mIGVuYWJsZWRDYXRlZ29yaWVzKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZXNCeUNhdGVnb3J5LnNldChjYXRlZ29yeS5pZCwgYWxsQ3VzdG9taXphdGlvbnMuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY2F0ZWdvcnkuaXNDYW5kaWRhdGUoY3VzdG9taXphdGlvbikpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2V0Q3VzdG9taXphdGlvbnNUb01pZ3JhdGUoY2FuZGlkYXRlc0J5Q2F0ZWdvcnkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAocmVmcmVzaFNlcXVlbmNlID09PSB0aGlzLmN1c3RvbWl6YXRpb25NaWdyYXRpb25SZWZyZXNoU2VxdWVuY2UpIHtcblx0XHRcdFx0dGhpcy5zZXRDdXN0b21pemF0aW9uc1RvTWlncmF0ZShuZXcgTWFwKCkpO1xuXHRcdFx0fVxuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0Q3VzdG9taXphdGlvbnNUb01pZ3JhdGUoY2FuZGlkYXRlc0J5Q2F0ZWdvcnk6IE1hcDxDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlJZCwgcmVhZG9ubHkgSVByb21wdFBhdGhbXT4pOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91c0l0ZW1zID0gdGhpcy5jcmVhdGVDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbU1hcCh0aGlzLmdldEFsbE1pZ3JhdGlvbkNhbmRpZGF0ZXMoKSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtcyA9IG5ldyBSZXNvdXJjZU1hcDxTZXQ8UHJvbXB0c1N0b3JhZ2U+PigpO1xuXHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBbLi4uY2FuZGlkYXRlc0J5Q2F0ZWdvcnkudmFsdWVzKCldLmZsYXQoKSkge1xuXHRcdFx0aWYgKCF0aGlzLmhhc0N1c3RvbWl6YXRpb25NaWdyYXRpb25JdGVtKHByZXZpb3VzSXRlbXMsIGN1c3RvbWl6YXRpb24pIHx8IHRoaXMuaXNDdXN0b21pemF0aW9uU2VsZWN0ZWRGb3JNaWdyYXRpb24oY3VzdG9taXphdGlvbikpIHtcblx0XHRcdFx0dGhpcy5hZGRDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbShzZWxlY3RlZEl0ZW1zLCBjdXN0b21pemF0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zZWxlY3RlZEN1c3RvbWl6YXRpb25NaWdyYXRpb25JdGVtcyA9IHNlbGVjdGVkSXRlbXM7XG5cdFx0dGhpcy5jdXN0b21pemF0aW9uc0J5TWlncmF0aW9uQ2F0ZWdvcnkgPSBjYW5kaWRhdGVzQnlDYXRlZ29yeTtcblx0XHR0aGlzLnJlZnJlc2hDdXN0b21pemF0aW9uTWlncmF0aW9uVWkoKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkl0ZW1NYXAoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10pOiBSZXNvdXJjZU1hcDxTZXQ8UHJvbXB0c1N0b3JhZ2U+PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFJlc291cmNlTWFwPFNldDxQcm9tcHRzU3RvcmFnZT4+KCk7XG5cdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHR0aGlzLmFkZEN1c3RvbWl6YXRpb25NaWdyYXRpb25JdGVtKHJlc3VsdCwgY3VzdG9taXphdGlvbik7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGhhc0N1c3RvbWl6YXRpb25NaWdyYXRpb25JdGVtKGl0ZW1zOiBSZXNvdXJjZU1hcDxTZXQ8UHJvbXB0c1N0b3JhZ2U+PiwgY3VzdG9taXphdGlvbjogSVByb21wdFBhdGgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXRlbXMuZ2V0KGN1c3RvbWl6YXRpb24udXJpKT8uaGFzKGN1c3RvbWl6YXRpb24uc3RvcmFnZSkgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFkZEN1c3RvbWl6YXRpb25NaWdyYXRpb25JdGVtKGl0ZW1zOiBSZXNvdXJjZU1hcDxTZXQ8UHJvbXB0c1N0b3JhZ2U+PiwgY3VzdG9taXphdGlvbjogSVByb21wdFBhdGgpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yYWdlcyA9IGl0ZW1zLmdldChjdXN0b21pemF0aW9uLnVyaSkgPz8gbmV3IFNldDxQcm9tcHRzU3RvcmFnZT4oKTtcblx0XHRzdG9yYWdlcy5hZGQoY3VzdG9taXphdGlvbi5zdG9yYWdlKTtcblx0XHRpdGVtcy5zZXQoY3VzdG9taXphdGlvbi51cmksIHN0b3JhZ2VzKTtcblx0fVxuXG5cdHByaXZhdGUgaXNDdXN0b21pemF0aW9uU2VsZWN0ZWRGb3JNaWdyYXRpb24oY3VzdG9taXphdGlvbjogSVByb21wdFBhdGgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5oYXNDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbSh0aGlzLnNlbGVjdGVkQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkl0ZW1zLCBjdXN0b21pemF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Q3VzdG9taXphdGlvblNlbGVjdGVkRm9yTWlncmF0aW9uKGN1c3RvbWl6YXRpb246IElQcm9tcHRQYXRoLCBzZWxlY3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChzZWxlY3RlZCkge1xuXHRcdFx0dGhpcy5hZGRDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbSh0aGlzLnNlbGVjdGVkQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkl0ZW1zLCBjdXN0b21pemF0aW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yYWdlcyA9IHRoaXMuc2VsZWN0ZWRDdXN0b21pemF0aW9uTWlncmF0aW9uSXRlbXMuZ2V0KGN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRzdG9yYWdlcz8uZGVsZXRlKGN1c3RvbWl6YXRpb24uc3RvcmFnZSk7XG5cdFx0aWYgKHN0b3JhZ2VzPy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLnNlbGVjdGVkQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkl0ZW1zLmRlbGV0ZShjdXN0b21pemF0aW9uLnVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRNaWdyYXRpb25DYW5kaWRhdGVzKGNhdGVnb3J5OiBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5KTogcmVhZG9ubHkgSVByb21wdFBhdGhbXSB7XG5cdFx0aWYgKCF0aGlzLmlzTWlncmF0aW9uQ2F0ZWdvcnlFbmFibGVkKGNhdGVnb3J5KSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jdXN0b21pemF0aW9uc0J5TWlncmF0aW9uQ2F0ZWdvcnkuZ2V0KGNhdGVnb3J5LmlkKSA/PyBbXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsTWlncmF0aW9uQ2FuZGlkYXRlcygpOiByZWFkb25seSBJUHJvbXB0UGF0aFtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuY3VzdG9taXphdGlvbnNCeU1pZ3JhdGlvbkNhdGVnb3J5LnZhbHVlcygpXS5mbGF0KCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5KCk6IElDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5SWQgPyBnZXRDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnkodGhpcy5hY3RpdmVNaWdyYXRpb25DYXRlZ29yeUlkKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWlncmF0aW9uQ2F0ZWdvcnlTdW1tYXJpZXMoKTogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeVN1bW1hcnlbXSB7XG5cdFx0Y29uc3QgaGFybmVzc0xhYmVsID0gdGhpcy5nZXRBY3RpdmVIYXJuZXNzTGFiZWwoKTtcblx0XHRjb25zdCBzdW1tYXJpZXM6IElDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlTdW1tYXJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNhdGVnb3J5IG9mIENVU1RPTUlaQVRJT05fTUlHUkFUSU9OX0NBVEVHT1JJRVMpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSB0aGlzLmdldE1pZ3JhdGlvbkNhbmRpZGF0ZXMoY2F0ZWdvcnkpO1xuXHRcdFx0aWYgKGNhbmRpZGF0ZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0c3VtbWFyaWVzLnB1c2goe1xuXHRcdFx0XHRpZDogY2F0ZWdvcnkuaWQsXG5cdFx0XHRcdGxhYmVsOiBjYXRlZ29yeS5jYXJkTGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBjYXRlZ29yeS5nZXRDYXJkRGVzY3JpcHRpb24oY2FuZGlkYXRlcywgaGFybmVzc0xhYmVsKSxcblx0XHRcdFx0YWN0aW9uTGFiZWw6IGNhdGVnb3J5LmNhcmRBY3Rpb25MYWJlbCxcblx0XHRcdFx0YWN0aW9uQXJpYUxhYmVsOiBjYXRlZ29yeS5jYXJkQWN0aW9uQXJpYUxhYmVsLFxuXHRcdFx0XHRjb3VudDogY2FuZGlkYXRlcy5sZW5ndGgsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHN1bW1hcmllcztcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaEN1c3RvbWl6YXRpb25NaWdyYXRpb25VaSgpOiB2b2lkIHtcblx0XHR0aGlzLndlbGNvbWVQYWdlPy5zZXRNaWdyYXRpb25DYXRlZ29yaWVzKHRoaXMuZ2V0TWlncmF0aW9uQ2F0ZWdvcnlTdW1tYXJpZXMoKSk7XG5cdFx0dGhpcy51cGRhdGVTaWRlYmFyTWlncmF0aW9uU2hvcnRjdXQoKTtcblx0XHR0aGlzLnJlbmRlckN1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNpZGViYXJNaWdyYXRpb25TaG9ydGN1dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWlncmF0aW9uU2hvcnRjdXRDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgaGFzVmlzaWJsZVNob3J0Y3V0ID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCBjYXRlZ29yeSBvZiBDVVNUT01JWkFUSU9OX01JR1JBVElPTl9DQVRFR09SSUVTKSB7XG5cdFx0XHRjb25zdCBzaG9ydGN1dCA9IHRoaXMubWlncmF0aW9uU2hvcnRjdXRzLmdldChjYXRlZ29yeS5pZCk7XG5cdFx0XHRpZiAoIXNob3J0Y3V0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb3VudCA9IHRoaXMuZ2V0TWlncmF0aW9uQ2FuZGlkYXRlcyhjYXRlZ29yeSkubGVuZ3RoO1xuXHRcdFx0aWYgKGNvdW50ID09PSAwKSB7XG5cdFx0XHRcdHNob3J0Y3V0LmJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aGFzVmlzaWJsZVNob3J0Y3V0ID0gdHJ1ZTtcblx0XHRcdHNob3J0Y3V0LmJ1dHRvbi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRzaG9ydGN1dC5jb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyhjb3VudCk7XG5cdFx0XHRzaG9ydGN1dC5idXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgY2F0ZWdvcnkuZ2V0U2hvcnRjdXRBcmlhTGFiZWwoY291bnQpKTtcblx0XHR9XG5cblx0XHR0aGlzLm1pZ3JhdGlvblNob3J0Y3V0Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBoYXNWaXNpYmxlU2hvcnRjdXQgPyAnJyA6ICdub25lJztcblx0XHR0aGlzLmxheW91dFNpZGViYXIodGhpcy5zaWRlYmFyV2lkdGgsIHRoaXMuc2lkZWJhckhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG1pZ3JhdGVTZWxlY3RlZEN1c3RvbWl6YXRpb25zKGNhdGVnb3J5OiBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5LCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgSVByb21wdFBhdGhbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjdXN0b21pemF0aW9ucy5sZW5ndGggPT09IDAgfHwgIXRoaXMuaXNNaWdyYXRpb25DYXRlZ29yeUVuYWJsZWQoY2F0ZWdvcnkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlybWF0aW9uID0gY2F0ZWdvcnkuZ2V0Q29uZmlybWF0aW9uKGN1c3RvbWl6YXRpb25zLCB0aGlzLmdldEFjdGl2ZUhhcm5lc3NMYWJlbCgpKTtcblx0XHRjb25zdCBjb25maXJtUmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdG1lc3NhZ2U6IGNvbmZpcm1hdGlvbi5tZXNzYWdlLFxuXHRcdFx0ZGV0YWlsOiBjb25maXJtYXRpb24uZGV0YWlsLFxuXHRcdFx0Y2hlY2tib3g6IHtcblx0XHRcdFx0bGFiZWw6IGNvbmZpcm1hdGlvbi5kZWxldGVPcmlnaW5hbHNMYWJlbCxcblx0XHRcdFx0Y2hlY2tlZDogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBjb25maXJtYXRpb24ucHJpbWFyeUJ1dHRvbixcblx0XHR9KTtcblx0XHRpZiAoIWNvbmZpcm1SZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0Rm9sZGVycyA9IGF3YWl0IHRoaXMucmVzb2x2ZUN1c3RvbWl6YXRpb25NaWdyYXRpb25UYXJnZXRGb2xkZXJzKGN1c3RvbWl6YXRpb25zKTtcblx0XHRpZiAoIXRhcmdldEZvbGRlcnMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtaWdyYXRpb25SZXN1bHQgPSBhd2FpdCBtaWdyYXRlQ3VzdG9taXphdGlvbnMoXG5cdFx0XHRjdXN0b21pemF0aW9ucyxcblx0XHRcdHRhcmdldEZvbGRlcnMsXG5cdFx0XHR0aGlzLmZpbGVTZXJ2aWNlLFxuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IsXG5cdFx0XHR7IGRlbGV0ZU9yaWdpbmFsRmlsZXM6IGNvbmZpcm1SZXN1bHQuY2hlY2tib3hDaGVja2VkICE9PSBmYWxzZSB9LFxuXHRcdCk7XG5cdFx0Y29uc3QgeyBtaWdyYXRlZENvdW50LCBmYWlsZWRDdXN0b21pemF0aW9uRmlsZU5hbWVzLCB1bnN1cHBvcnRlZEhlYWRlcktleXMsIG1pZ3JhdGVkQ3VzdG9taXphdGlvbnMgfSA9IG1pZ3JhdGlvblJlc3VsdDtcblxuXHRcdGlmIChmYWlsZWRDdXN0b21pemF0aW9uRmlsZU5hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGRpc3BsYXllZEZpbGVOYW1lcyA9IGZhaWxlZEN1c3RvbWl6YXRpb25GaWxlTmFtZXMuc2xpY2UoMCwgMyk7XG5cdFx0XHRjb25zdCBoaWRkZW5GaWxlQ291bnQgPSBmYWlsZWRDdXN0b21pemF0aW9uRmlsZU5hbWVzLmxlbmd0aCAtIGRpc3BsYXllZEZpbGVOYW1lcy5sZW5ndGg7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoY2F0ZWdvcnkuZ2V0RmFpbGVkTWVzc2FnZShkaXNwbGF5ZWRGaWxlTmFtZXMsIGhpZGRlbkZpbGVDb3VudCkpO1xuXHRcdH1cblxuXHRcdGlmIChtaWdyYXRlZENvdW50ID09PSAwKSB7XG5cdFx0XHRpZiAoZmFpbGVkQ3VzdG9taXphdGlvbkZpbGVOYW1lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4oY2F0ZWdvcnkubm9GaWxlc01pZ3JhdGVkTWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkluZm8oKTtcblxuXHRcdGNvbnN0IHVuc3VwcG9ydGVkS2V5c0xhYmVsID0gdW5zdXBwb3J0ZWRIZWFkZXJLZXlzLmpvaW4oJywgJyk7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8odW5zdXBwb3J0ZWRLZXlzTGFiZWwubGVuZ3RoID4gMCAmJiBjYXRlZ29yeS5nZXRNaWdyYXRlZFdpdGhSZXZpZXdNZXNzYWdlXG5cdFx0XHQ/IGNhdGVnb3J5LmdldE1pZ3JhdGVkV2l0aFJldmlld01lc3NhZ2UobWlncmF0ZWRDb3VudCwgdW5zdXBwb3J0ZWRLZXlzTGFiZWwpXG5cdFx0XHQ6IGNhdGVnb3J5LmdldE1pZ3JhdGVkTWVzc2FnZShtaWdyYXRlZENvdW50KSk7XG5cblx0XHR2b2lkIHRoaXMucmV2ZWFsTWlncmF0ZWRDdXN0b21pemF0aW9ucyhtaWdyYXRlZEN1c3RvbWl6YXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ3VzdG9taXphdGlvbk1pZ3JhdGlvblBhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIgfHwgIXRoaXMubWlncmF0aW9uTWlncmF0ZUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgY2F0ZWdvcnkgPSB0aGlzLmdldEFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5KCkgPz8gQ1VTVE9NSVpBVElPTl9NSUdSQVRJT05fQ0FURUdPUklFU1swXTtcblx0XHRjb25zdCBjYW5kaWRhdGVzID0gdGhpcy5nZXRNaWdyYXRpb25DYW5kaWRhdGVzKGNhdGVnb3J5KTtcblx0XHR0aGlzLnVwZGF0ZUN1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlSGVhZGVyKGNhdGVnb3J5LCBjYW5kaWRhdGVzKTtcblxuXHRcdGlmIChjYW5kaWRhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgZW1wdHlNZXNzYWdlID0gRE9NLmFwcGVuZCh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIsICQoJ3AucHJvbXB0LW1pZ3JhdGlvbi1lbXB0eScpKTtcblx0XHRcdGVtcHR5TWVzc2FnZS50ZXh0Q29udGVudCA9IGNhdGVnb3J5LnBhZ2VFbXB0eU1lc3NhZ2U7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvbk1pZ3JhdGVCdXR0b24uZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5taWdyYXRpb25MaXN0U2Nyb2xsYWJsZT8uc2NhbkRvbU5vZGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBxdWVyeSA9IHRoaXMubWlncmF0aW9uU2VhcmNoUXVlcnkudHJpbSgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgZmlsdGVyZWRDdXN0b21pemF0aW9ucyA9IGNhbmRpZGF0ZXMuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4ge1xuXHRcdFx0aWYgKCFxdWVyeSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gKGN1c3RvbWl6YXRpb24ubmFtZSA/PyBiYXNlbmFtZShjdXN0b21pemF0aW9uLnVyaSkpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCByZWxhdGl2ZVBhdGggPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChjdXN0b21pemF0aW9uLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0cmV0dXJuIGRpc3BsYXlOYW1lLmluY2x1ZGVzKHF1ZXJ5KSB8fCByZWxhdGl2ZVBhdGguaW5jbHVkZXMocXVlcnkpO1xuXHRcdH0pO1xuXHRcdGlmIChmaWx0ZXJlZEN1c3RvbWl6YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgZW1wdHlNZXNzYWdlID0gRE9NLmFwcGVuZCh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIsICQoJ3AucHJvbXB0LW1pZ3JhdGlvbi1lbXB0eScpKTtcblx0XHRcdGVtcHR5TWVzc2FnZS50ZXh0Q29udGVudCA9IGNhdGVnb3J5LnNlYXJjaEVtcHR5TWVzc2FnZTtcblx0XHRcdHRoaXMudXBkYXRlQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkFjdGlvblN0YXRlKCk7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wZW5DdXN0b21pemF0aW9uSW5FbWJlZGRlZEVkaXRvciA9IChjdXN0b21pemF0aW9uOiBJUHJvbXB0UGF0aCk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3QgaXNXb3Jrc3BhY2VGaWxlID0gY3VzdG9taXphdGlvbi5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbDtcblx0XHRcdHZvaWQgdGhpcy5zaG93RW1iZWRkZWRFZGl0b3IoXG5cdFx0XHRcdGN1c3RvbWl6YXRpb24udXJpLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uLm5hbWUgPz8gYmFzZW5hbWUoY3VzdG9taXphdGlvbi51cmkpLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uLnR5cGUsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb24uc3RvcmFnZSxcblx0XHRcdFx0aXNXb3Jrc3BhY2VGaWxlLFxuXHRcdFx0KTtcblx0XHR9O1xuXHRcdGNvbnN0IHJlbmRlclNlbGVjdGlvbkNoZWNrYm94ID0gKHJvdzogSFRNTEVsZW1lbnQsIGN1c3RvbWl6YXRpb246IElQcm9tcHRQYXRoKTogdm9pZCA9PiB7XG5cdFx0XHRjb25zdCBjaGVja2JveENvbnRhaW5lciA9IERPTS5hcHBlbmQocm93LCAkKCcuaXRlbS1zeW5jLWNoZWNrYm94LnByb21wdC1taWdyYXRpb24tY2hlY2tib3gnKSk7XG5cdFx0XHRjb25zdCBjaGVja2JveFRpdGxlID0gbG9jYWxpemUoJ2N1c3RvbWl6YXRpb25NaWdyYXRpb25TZWxlY3RBcmlhTGFiZWwnLCBcIlNlbGVjdCB7MH1cIiwgY3VzdG9taXphdGlvbi5uYW1lID8/IGJhc2VuYW1lKGN1c3RvbWl6YXRpb24udXJpKSk7XG5cdFx0XHRjb25zdCBjaGVja2JveCA9IHRoaXMubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmFkZChuZXcgQ2hlY2tib3goY2hlY2tib3hUaXRsZSwgdGhpcy5pc0N1c3RvbWl6YXRpb25TZWxlY3RlZEZvck1pZ3JhdGlvbihjdXN0b21pemF0aW9uKSwgZGVmYXVsdENoZWNrYm94U3R5bGVzKSk7XG5cdFx0XHRjaGVja2JveENvbnRhaW5lci5yZXBsYWNlQ2hpbGRyZW4oY2hlY2tib3guZG9tTm9kZSk7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcy5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNldEN1c3RvbWl6YXRpb25TZWxlY3RlZEZvck1pZ3JhdGlvbihjdXN0b21pemF0aW9uLCBjaGVja2JveC5jaGVja2VkKTtcblx0XHRcdFx0dGhpcy51cGRhdGVDdXN0b21pemF0aW9uTWlncmF0aW9uQWN0aW9uU3RhdGUoKTtcblx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVuZGVySXRlbSA9IChjb250YWluZXI6IEhUTUxFbGVtZW50LCBjdXN0b21pemF0aW9uOiBJUHJvbXB0UGF0aCk6IHZvaWQgPT4ge1xuXHRcdFx0Y29uc3Qgcm93ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ2Rpdi5haS1jdXN0b21pemF0aW9uLWxpc3QtaXRlbS5wcm9tcHQtbWlncmF0aW9uLWl0ZW0nKSk7XG5cdFx0XHRyZW5kZXJTZWxlY3Rpb25DaGVja2JveChyb3csIGN1c3RvbWl6YXRpb24pO1xuXG5cdFx0XHRjb25zdCBpdGVtTGVmdCA9IERPTS5hcHBlbmQocm93LCAkKCdzcGFuLml0ZW0tbGVmdCcpKTtcblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gY3VzdG9taXphdGlvbi5uYW1lID8/IGJhc2VuYW1lKGN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRcdGNvbnN0IHJlbGF0aXZlUGF0aCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGN1c3RvbWl6YXRpb24udXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3Qgb3BlbkJ1dHRvbiA9IHRoaXMubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKGl0ZW1MZWZ0LCB7XG5cdFx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ29wZW5DdXN0b21pemF0aW9uRmlsZScsIFwiT3BlbiB7MH0sIHsxfVwiLCBkaXNwbGF5TmFtZSwgcmVsYXRpdmVQYXRoKSxcblx0XHRcdH0pKTtcblx0XHRcdG9wZW5CdXR0b24ubGFiZWwgPSBkaXNwbGF5TmFtZTtcblx0XHRcdERPTS5jbGVhck5vZGUob3BlbkJ1dHRvbi5lbGVtZW50KTtcblx0XHRcdG9wZW5CdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpdGVtLXRleHQnLCAncHJvbXB0LW1pZ3JhdGlvbi1vcGVuLWJ1dHRvbicpO1xuXHRcdFx0dGhpcy5taWdyYXRpb25QYWdlRGlzcG9zYWJsZXMuYWRkKG9wZW5CdXR0b24ub25EaWRDbGljaygoKSA9PiBvcGVuQ3VzdG9taXphdGlvbkluRW1iZWRkZWRFZGl0b3IoY3VzdG9taXphdGlvbikpKTtcblx0XHRcdGNvbnN0IGl0ZW1UZXh0ID0gb3BlbkJ1dHRvbi5lbGVtZW50O1xuXHRcdFx0Y29uc3QgbmFtZVJvdyA9IERPTS5hcHBlbmQoaXRlbVRleHQsICQoJ3NwYW4uaXRlbS1uYW1lLXJvdycpKTtcblx0XHRcdGNvbnN0IG5hbWVMYWJlbCA9IERPTS5hcHBlbmQobmFtZVJvdywgJCgnc3Bhbi5pdGVtLW5hbWUucHJvbXB0LW1pZ3JhdGlvbi1pdGVtLW5hbWUnKSk7XG5cdFx0XHRuYW1lTGFiZWwudGV4dENvbnRlbnQgPSBkaXNwbGF5TmFtZTtcblxuXHRcdFx0Y29uc3QgcGF0aExhYmVsID0gRE9NLmFwcGVuZChpdGVtVGV4dCwgJCgnc3Bhbi5pdGVtLWRlc2NyaXB0aW9uLmlzLWZpbGVuYW1lLnByb21wdC1taWdyYXRpb24taXRlbS1wYXRoJykpO1xuXHRcdFx0cGF0aExhYmVsLnRleHRDb250ZW50ID0gcmVsYXRpdmVQYXRoO1xuXG5cdFx0XHRjb25zdCBpdGVtUmlnaHQgPSBET00uYXBwZW5kKHJvdywgJCgnc3Bhbi5pdGVtLXJpZ2h0JykpO1xuXHRcdFx0Y29uc3QgZGVsZXRlQnV0dG9uID0gRE9NLmFwcGVuZChpdGVtUmlnaHQsICQoJ2J1dHRvbi5pY29uLWJ1dHRvbicsIHtcblx0XHRcdFx0dHlwZTogJ2J1dHRvbicsXG5cdFx0XHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2RlbGV0ZUN1c3RvbWl6YXRpb25GaWxlJywgXCJEZWxldGUgezB9XCIsIGN1c3RvbWl6YXRpb24ubmFtZSA/PyBiYXNlbmFtZShjdXN0b21pemF0aW9uLnVyaSkpLFxuXHRcdFx0fSkpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdFx0ZGVsZXRlQnV0dG9uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi50cmFzaCkpO1xuXHRcdFx0dGhpcy5taWdyYXRpb25QYWdlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIGRlbGV0ZUJ1dHRvbiwgbG9jYWxpemUoJ2RlbGV0ZUN1c3RvbWl6YXRpb25GaWxlVG9vbHRpcCcsIFwiRGVsZXRlXCIpKSk7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvblBhZ2VEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkZWxldGVCdXR0b24sICdjbGljaycsIGV2ZW50ID0+IHtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHZvaWQgdGhpcy5kZWxldGVDdXN0b21pemF0aW9uRmlsZShjdXN0b21pemF0aW9uKTtcblx0XHRcdH0pKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVuZGVyR3JvdXAgPSAoZ3JvdXBLZXk6IHN0cmluZywgZ3JvdXBMYWJlbDogc3RyaW5nLCBjdXN0b21pemF0aW9uczogcmVhZG9ubHkgSVByb21wdFBhdGhbXSk6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKGN1c3RvbWl6YXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGdyb3VwID0gRE9NLmFwcGVuZCh0aGlzLm1pZ3JhdGlvbkxpc3RDb250YWluZXIhLCAkKCcucHJvbXB0LW1pZ3JhdGlvbi1ncm91cCcpKTtcblx0XHRcdGNvbnN0IGdyb3VwSGVhZGVyID0gRE9NLmFwcGVuZChncm91cCwgJCgnLmFpLWN1c3RvbWl6YXRpb24tZ3JvdXAtaGVhZGVyLnByb21wdC1taWdyYXRpb24tZ3JvdXAtaGVhZGVyJykpO1xuXHRcdFx0Y29uc3QgZ3JvdXBDaGVja2JveENvbnRhaW5lciA9IERPTS5hcHBlbmQoZ3JvdXBIZWFkZXIsICQoJy5pdGVtLXN5bmMtY2hlY2tib3gucHJvbXB0LW1pZ3JhdGlvbi1ncm91cC1jaGVja2JveCcpKTtcblx0XHRcdGNvbnN0IGFsbEluR3JvdXBTZWxlY3RlZCA9IGN1c3RvbWl6YXRpb25zLmV2ZXJ5KGN1c3RvbWl6YXRpb24gPT4gdGhpcy5pc0N1c3RvbWl6YXRpb25TZWxlY3RlZEZvck1pZ3JhdGlvbihjdXN0b21pemF0aW9uKSk7XG5cdFx0XHRjb25zdCBncm91cENoZWNrYm94QXJpYUxhYmVsID0gbG9jYWxpemUoJ2N1c3RvbWl6YXRpb25NaWdyYXRpb25TZWxlY3RHcm91cEFyaWFMYWJlbCcsIFwiU2VsZWN0IGFsbCBjdXN0b21pemF0aW9ucyBpbiB7MH1cIiwgZ3JvdXBMYWJlbCk7XG5cdFx0XHRjb25zdCBncm91cENoZWNrYm94ID0gdGhpcy5taWdyYXRpb25QYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBDaGVja2JveChncm91cENoZWNrYm94QXJpYUxhYmVsLCBhbGxJbkdyb3VwU2VsZWN0ZWQsIGRlZmF1bHRDaGVja2JveFN0eWxlcykpO1xuXHRcdFx0Z3JvdXBDaGVja2JveENvbnRhaW5lci5yZXBsYWNlQ2hpbGRyZW4oZ3JvdXBDaGVja2JveC5kb21Ob2RlKTtcblx0XHRcdHRoaXMubWlncmF0aW9uUGFnZURpc3Bvc2FibGVzLmFkZChncm91cENoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBjdXN0b21pemF0aW9uIG9mIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRDdXN0b21pemF0aW9uU2VsZWN0ZWRGb3JNaWdyYXRpb24oY3VzdG9taXphdGlvbiwgZ3JvdXBDaGVja2JveC5jaGVja2VkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlbmRlckN1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBncm91cFRvZ2dsZSA9IERPTS5hcHBlbmQoZ3JvdXBIZWFkZXIsICQoJ2J1dHRvbi5wcm9tcHQtbWlncmF0aW9uLWdyb3VwLXRvZ2dsZScpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRcdGdyb3VwVG9nZ2xlLnR5cGUgPSAnYnV0dG9uJztcblx0XHRcdGNvbnN0IGdyb3VwSWQgPSBgcHJvbXB0LW1pZ3JhdGlvbi1ncm91cC0ke2NhdGVnb3J5LmlkfS0ke2dyb3VwS2V5fWA7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLmNvbGxhcHNlZEN1c3RvbWl6YXRpb25NaWdyYXRpb25Hcm91cHMuaGFzKGdyb3VwSWQpO1xuXHRcdFx0Z3JvdXBUb2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLWNvbnRyb2xzJywgYCR7Z3JvdXBJZH0taXRlbXNgKTtcblx0XHRcdGdyb3VwVG9nZ2xlLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghY29sbGFwc2VkKSk7XG5cdFx0XHRjb25zdCBjaGV2cm9uID0gRE9NLmFwcGVuZChncm91cFRvZ2dsZSwgJCgnc3Bhbi5ncm91cC1jaGV2cm9uJykpO1xuXHRcdFx0Y2hldnJvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdGNvbnN0IGdyb3VwTGFiZWxHcm91cCA9IERPTS5hcHBlbmQoZ3JvdXBUb2dnbGUsICQoJy5ncm91cC1sYWJlbC1ncm91cCcpKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gRE9NLmFwcGVuZChncm91cExhYmVsR3JvdXAsICQoJ3NwYW4uZ3JvdXAtbGFiZWwnKSk7XG5cdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGdyb3VwTGFiZWw7XG5cdFx0XHRjb25zdCBjb3VudCA9IERPTS5hcHBlbmQoZ3JvdXBUb2dnbGUsICQoJ3NwYW4uZ3JvdXAtY291bnQnKSk7XG5cdFx0XHRjb3VudC50ZXh0Q29udGVudCA9IFN0cmluZyhjdXN0b21pemF0aW9ucy5sZW5ndGgpO1xuXHRcdFx0Y29uc3QgZ3JvdXBJdGVtcyA9IERPTS5hcHBlbmQoZ3JvdXAsICQoJy5wcm9tcHQtbWlncmF0aW9uLWdyb3VwLWl0ZW1zJykpO1xuXHRcdFx0Z3JvdXBJdGVtcy5pZCA9IGAke2dyb3VwSWR9LWl0ZW1zYDtcblx0XHRcdGNvbnN0IHNldEdyb3VwQ29sbGFwc2VkID0gKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQgPT4ge1xuXHRcdFx0XHRncm91cEl0ZW1zLnN0eWxlLmRpc3BsYXkgPSBjb2xsYXBzZWQgPyAnbm9uZScgOiAnJztcblx0XHRcdFx0Y2hldnJvbi5jbGFzc05hbWUgPSAnZ3JvdXAtY2hldnJvbic7XG5cdFx0XHRcdGNoZXZyb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShjb2xsYXBzZWQgPyBDb2RpY29uLmNoZXZyb25SaWdodCA6IENvZGljb24uY2hldnJvbkRvd24pKTtcblx0XHRcdFx0Z3JvdXBUb2dnbGUuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFjb2xsYXBzZWQpKTtcblx0XHRcdFx0dGhpcy5taWdyYXRpb25MaXN0U2Nyb2xsYWJsZT8uc2NhbkRvbU5vZGUoKTtcblx0XHRcdH07XG5cdFx0XHRzZXRHcm91cENvbGxhcHNlZChjb2xsYXBzZWQpO1xuXHRcdFx0dGhpcy5taWdyYXRpb25QYWdlRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZ3JvdXBUb2dnbGUsICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY29sbGFwc2VkQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkdyb3Vwcy5oYXMoZ3JvdXBJZCkpIHtcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZEN1c3RvbWl6YXRpb25NaWdyYXRpb25Hcm91cHMuZGVsZXRlKGdyb3VwSWQpO1xuXHRcdFx0XHRcdHNldEdyb3VwQ29sbGFwc2VkKGZhbHNlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmNvbGxhcHNlZEN1c3RvbWl6YXRpb25NaWdyYXRpb25Hcm91cHMuYWRkKGdyb3VwSWQpO1xuXHRcdFx0XHRcdHNldEdyb3VwQ29sbGFwc2VkKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBjdXN0b21pemF0aW9ucykge1xuXHRcdFx0XHRyZW5kZXJJdGVtKGdyb3VwSXRlbXMsIGN1c3RvbWl6YXRpb24pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBncm91cHMgPSBjYXRlZ29yeS5ncm91cChmaWx0ZXJlZEN1c3RvbWl6YXRpb25zKTtcblx0XHRjb25zdCBncm91cGVkVXJpcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgZ3JvdXAuY3VzdG9taXphdGlvbnMpIHtcblx0XHRcdFx0Z3JvdXBlZFVyaXMuYWRkKGN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRcdH1cblx0XHRcdHJlbmRlckdyb3VwKGdyb3VwLmtleSwgZ3JvdXAubGFiZWwsIGdyb3VwLmN1c3RvbWl6YXRpb25zKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgZmlsdGVyZWRDdXN0b21pemF0aW9ucy5maWx0ZXIoaXRlbSA9PiAhZ3JvdXBlZFVyaXMuaGFzKGl0ZW0udXJpKSkpIHtcblx0XHRcdHJlbmRlckl0ZW0odGhpcy5taWdyYXRpb25MaXN0Q29udGFpbmVyLCBjdXN0b21pemF0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUN1c3RvbWl6YXRpb25NaWdyYXRpb25BY3Rpb25TdGF0ZSgpO1xuXHRcdHRoaXMubWlncmF0aW9uTGlzdFNjcm9sbGFibGU/LnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUN1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlSGVhZGVyKGNhdGVnb3J5OiBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5LCBjYW5kaWRhdGVzOiByZWFkb25seSBJUHJvbXB0UGF0aFtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWlncmF0aW9uVGl0bGVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvblRpdGxlRWxlbWVudC50ZXh0Q29udGVudCA9IGNhdGVnb3J5LnBhZ2VUaXRsZTtcblx0XHR9XG5cblx0XHQvLyBUaGUgYmFubmVyIGNhcnJpZXMgdGhlIGZ1bGwgZXhwbGFuYXRpb24sIHNvIHRoZSBkZXNjcmlwdGlvbiB3b3VsZCBvbmx5IHJlcGVhdCBpdC5cblx0XHRjb25zdCBiYW5uZXIgPSBjYW5kaWRhdGVzLmxlbmd0aCA+IDAgPyBjYXRlZ29yeS5nZXRCYW5uZXI/LihjYW5kaWRhdGVzLCB0aGlzLmdldEFjdGl2ZUhhcm5lc3NMYWJlbCgpKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLnJlbmRlckN1c3RvbWl6YXRpb25NaWdyYXRpb25CYW5uZXIoYmFubmVyKTtcblx0XHRpZiAodGhpcy5taWdyYXRpb25EZXNjcmlwdGlvbkVsZW1lbnQpIHtcblx0XHRcdHRoaXMubWlncmF0aW9uRGVzY3JpcHRpb25FbGVtZW50LnRleHRDb250ZW50ID0gYmFubmVyID8gJycgOiBjYXRlZ29yeS5nZXRQYWdlRGVzY3JpcHRpb24oY2FuZGlkYXRlcywgdGhpcy5nZXRBY3RpdmVIYXJuZXNzTGFiZWwoKSk7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvbkRlc2NyaXB0aW9uRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gYmFubmVyID8gJ25vbmUnIDogJyc7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubWlncmF0aW9uTGlua0VsZW1lbnQpIHtcblx0XHRcdHRoaXMubWlncmF0aW9uTGlua0VsZW1lbnQudGV4dENvbnRlbnQgPSBjYXRlZ29yeS5wYWdlTGlua0xhYmVsO1xuXHRcdFx0dGhpcy5taWdyYXRpb25MaW5rRWxlbWVudC5ocmVmID0gY2F0ZWdvcnkucGFnZUxpbmtVcmw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDdXN0b21pemF0aW9uTWlncmF0aW9uQmFubmVyKGJhbm5lcjogSUN1c3RvbWl6YXRpb25NaWdyYXRpb25CYW5uZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSB0aGlzLm1pZ3JhdGlvbkJhbm5lckNvbnRhaW5lcjtcblx0XHRpZiAoIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdERPTS5jbGVhck5vZGUoY29udGFpbmVyKTtcblx0XHRpZiAoIWJhbm5lcikge1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRjb25zdCBpY29uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uY3VzdG9taXphdGlvbi1taWdyYXRpb24tYmFubmVyLWljb24nKSk7XG5cdFx0aWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24ud2FybmluZykpO1xuXHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jdXN0b21pemF0aW9uLW1pZ3JhdGlvbi1iYW5uZXItY29udGVudCcpKTtcblx0XHRET00uYXBwZW5kKGNvbnRlbnQsICQoJ2gzLmN1c3RvbWl6YXRpb24tbWlncmF0aW9uLWJhbm5lci10aXRsZScpKS50ZXh0Q29udGVudCA9IGJhbm5lci50aXRsZTtcblx0XHRET00uYXBwZW5kKGNvbnRlbnQsICQoJ3AuY3VzdG9taXphdGlvbi1taWdyYXRpb24tYmFubmVyLW1lc3NhZ2UnKSkudGV4dENvbnRlbnQgPSBiYW5uZXIubWVzc2FnZTtcblxuXHRcdGNvbnN0IGNvbnNlcXVlbmNlID0gRE9NLmFwcGVuZChjb250ZW50LCAkKCdwLmN1c3RvbWl6YXRpb24tbWlncmF0aW9uLWJhbm5lci1jb25zZXF1ZW5jZScpKTtcblx0XHRjb25zdCBjb25zZXF1ZW5jZUljb24gPSBET00uYXBwZW5kKGNvbnNlcXVlbmNlLCAkKCdzcGFuLmN1c3RvbWl6YXRpb24tbWlncmF0aW9uLWJhbm5lci1jb25zZXF1ZW5jZS1pY29uJykpO1xuXHRcdGNvbnNlcXVlbmNlSWNvbi5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uc3luYykpO1xuXHRcdGNvbnNlcXVlbmNlSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRET00uYXBwZW5kKGNvbnNlcXVlbmNlLCAkKCdzcGFuJykpLnRleHRDb250ZW50ID0gYmFubmVyLmNvbnNlcXVlbmNlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDdXN0b21pemF0aW9uTWlncmF0aW9uQWN0aW9uU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pZ3JhdGlvbk1pZ3JhdGVCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2F0ZWdvcnkgPSB0aGlzLmdldEFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5KCkgPz8gQ1VTVE9NSVpBVElPTl9NSUdSQVRJT05fQ0FURUdPUklFU1swXTtcblx0XHRjb25zdCBzZWxlY3RlZENvdW50ID0gdGhpcy5nZXRNaWdyYXRpb25DYW5kaWRhdGVzKGNhdGVnb3J5KS5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiB0aGlzLmlzQ3VzdG9taXphdGlvblNlbGVjdGVkRm9yTWlncmF0aW9uKGN1c3RvbWl6YXRpb24pKS5sZW5ndGg7XG5cdFx0dGhpcy5taWdyYXRpb25NaWdyYXRlQnV0dG9uLmVuYWJsZWQgPSBzZWxlY3RlZENvdW50ID4gMDtcblx0XHR0aGlzLm1pZ3JhdGlvbk1pZ3JhdGVCdXR0b24ubGFiZWwgPSBzZWxlY3RlZENvdW50ID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgnY3VzdG9taXphdGlvbk1pZ3JhdGlvblBhZ2VCdXR0b25XaXRoQ291bnQnLCBcIk1pZ3JhdGUgKHswfSlcIiwgc2VsZWN0ZWRDb3VudClcblx0XHRcdDogbG9jYWxpemUoJ2N1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlQnV0dG9uJywgXCJNaWdyYXRlXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkZWxldGVDdXN0b21pemF0aW9uRmlsZShjdXN0b21pemF0aW9uOiBJUHJvbXB0UGF0aCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVOYW1lID0gY3VzdG9taXphdGlvbi5uYW1lID8/IGJhc2VuYW1lKGN1c3RvbWl6YXRpb24udXJpKTtcblx0XHRjb25zdCBjb25maXJtYXRpb24gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybURlbGV0ZUN1c3RvbWl6YXRpb25GaWxlJywgXCJBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gZGVsZXRlICd7MH0nP1wiLCBmaWxlTmFtZSksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtRGVsZXRlRGV0YWlsJywgXCJUaGlzIGFjdGlvbiBjYW5ub3QgYmUgdW5kb25lLlwiKSxcblx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSxcblx0XHRcdHR5cGU6ICd3YXJuaW5nJyxcblx0XHR9KTtcblxuXHRcdGlmICghY29uZmlybWF0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZVRyYXNoID0gdGhpcy5maWxlU2VydmljZS5oYXNDYXBhYmlsaXR5KGN1c3RvbWl6YXRpb24udXJpLCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuVHJhc2gpO1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGN1c3RvbWl6YXRpb24udXJpLCB7IHVzZVRyYXNoIH0pO1xuXHRcdGlmIChjdXN0b21pemF0aW9uLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsKSB7XG5cdFx0XHRjb25zdCBwcm9qZWN0Um9vdCA9IHRoaXMud29ya3NwYWNlU2VydmljZS5nZXRBY3RpdmVQcm9qZWN0Um9vdCgpO1xuXHRcdFx0aWYgKHByb2plY3RSb290KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlU2VydmljZS5kZWxldGVGaWxlcyhwcm9qZWN0Um9vdCwgW2N1c3RvbWl6YXRpb24udXJpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlZENhbmRpZGF0ZXMgPSBuZXcgTWFwPEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkLCByZWFkb25seSBJUHJvbXB0UGF0aFtdPigpO1xuXHRcdGZvciAoY29uc3QgW2NhdGVnb3J5SWQsIGNhbmRpZGF0ZXNdIG9mIHRoaXMuY3VzdG9taXphdGlvbnNCeU1pZ3JhdGlvbkNhdGVnb3J5KSB7XG5cdFx0XHR1cGRhdGVkQ2FuZGlkYXRlcy5zZXQoY2F0ZWdvcnlJZCwgY2FuZGlkYXRlcy5maWx0ZXIoaXRlbSA9PiAhaXNFcXVhbChpdGVtLnVyaSwgY3VzdG9taXphdGlvbi51cmkpKSk7XG5cdFx0fVxuXHRcdHRoaXMuc2V0Q3VzdG9taXphdGlvbnNUb01pZ3JhdGUodXBkYXRlZENhbmRpZGF0ZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc01pZ3JhdGlvbkNhdGVnb3J5RW5hYmxlZChjYXRlZ29yeTogSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KGNhdGVnb3J5LmVuYWJsZW1lbnRTZXR0aW5nKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RW5hYmxlZE1pZ3JhdGlvbkNhdGVnb3JpZXMoKTogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeVtdIHtcblx0XHRyZXR1cm4gQ1VTVE9NSVpBVElPTl9NSUdSQVRJT05fQ0FURUdPUklFUy5maWx0ZXIoY2F0ZWdvcnkgPT4gdGhpcy5pc01pZ3JhdGlvbkNhdGVnb3J5RW5hYmxlZChjYXRlZ29yeSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlQ3VzdG9taXphdGlvbk1pZ3JhdGlvblRhcmdldEZvbGRlcnMoY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IElQcm9tcHRQYXRoW10pOiBQcm9taXNlPEN1c3RvbWl6YXRpb25NaWdyYXRpb25UYXJnZXRGb2xkZXJzIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVxdWlyZWRTdG9yYWdlQnlUYXJnZXRUeXBlID0gbmV3IE1hcDxQcm9tcHRzVHlwZSwgU2V0PFByb21wdHNTdG9yYWdlPj4oKTtcblx0XHRmb3IgKGNvbnN0IGN1c3RvbWl6YXRpb24gb2YgY3VzdG9taXphdGlvbnMpIHtcblx0XHRcdGNvbnN0IHRhcmdldFR5cGUgPSBnZXRDdXN0b21pemF0aW9uTWlncmF0aW9uVGFyZ2V0VHlwZShjdXN0b21pemF0aW9uKTtcblx0XHRcdGNvbnN0IHN0b3JhZ2VzID0gcmVxdWlyZWRTdG9yYWdlQnlUYXJnZXRUeXBlLmdldCh0YXJnZXRUeXBlKSA/PyBuZXcgU2V0PFByb21wdHNTdG9yYWdlPigpO1xuXHRcdFx0c3RvcmFnZXMuYWRkKGN1c3RvbWl6YXRpb24uc3RvcmFnZSk7XG5cdFx0XHRyZXF1aXJlZFN0b3JhZ2VCeVRhcmdldFR5cGUuc2V0KHRhcmdldFR5cGUsIHN0b3JhZ2VzKTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRGb2xkZXJzID0gbmV3IE1hcDxQcm9tcHRzVHlwZSwgUmVhZG9ubHlNYXA8UHJvbXB0c1N0b3JhZ2UsIElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyPj4oKTtcblx0XHRmb3IgKGNvbnN0IFt0YXJnZXRUeXBlLCByZXF1aXJlZFN0b3JhZ2VzXSBvZiByZXF1aXJlZFN0b3JhZ2VCeVRhcmdldFR5cGUpIHtcblx0XHRcdGNvbnN0IGF2YWlsYWJsZUZvbGRlcnMgPSBhd2FpdCB0aGlzLml0ZW1zTW9kZWwuZ2V0QWN0aXZlSXRlbVNvdXJjZSgpLmZldGNoU291cmNlRm9sZGVycyh0YXJnZXRUeXBlKTtcblx0XHRcdGNvbnN0IGZvbGRlcnNCeVN0b3JhZ2UgPSBuZXcgTWFwPFByb21wdHNTdG9yYWdlLCBJQ3VzdG9taXphdGlvblNvdXJjZUZvbGRlcj4oKTtcblx0XHRcdGZvciAoY29uc3Qgc3RvcmFnZSBvZiByZXF1aXJlZFN0b3JhZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoaW5nRm9sZGVycyA9IGF2YWlsYWJsZUZvbGRlcnMuZmlsdGVyKGZvbGRlciA9PiBmb2xkZXIuc291cmNlID09PSBzdG9yYWdlKTtcblx0XHRcdFx0aWYgKG1hdGNoaW5nRm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IodGhpcy5nZXRNaXNzaW5nTWlncmF0aW9uVGFyZ2V0Rm9sZGVyTWVzc2FnZSh0YXJnZXRUeXBlLCBzdG9yYWdlKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRhcmdldEZvbGRlciA9IG1hdGNoaW5nRm9sZGVycy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHQ/IG1hdGNoaW5nRm9sZGVyc1swXVxuXHRcdFx0XHRcdDogYXdhaXQgdGhpcy5waWNrQ3VzdG9taXphdGlvbk1pZ3JhdGlvblRhcmdldEZvbGRlcihtYXRjaGluZ0ZvbGRlcnMsIHRhcmdldFR5cGUpO1xuXHRcdFx0XHRpZiAoIXRhcmdldEZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9sZGVyc0J5U3RvcmFnZS5zZXQoc3RvcmFnZSwgdGFyZ2V0Rm9sZGVyKTtcblx0XHRcdH1cblx0XHRcdHRhcmdldEZvbGRlcnMuc2V0KHRhcmdldFR5cGUsIGZvbGRlcnNCeVN0b3JhZ2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFyZ2V0Rm9sZGVycztcblx0fVxuXG5cdHByaXZhdGUgZ2V0TWlzc2luZ01pZ3JhdGlvblRhcmdldEZvbGRlck1lc3NhZ2UodGFyZ2V0VHlwZTogUHJvbXB0c1R5cGUsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlKTogc3RyaW5nIHtcblx0XHRpZiAoc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UubG9jYWwpIHtcblx0XHRcdHN3aXRjaCAodGFyZ2V0VHlwZSkge1xuXHRcdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWlncmF0aW9uTm9Xb3Jrc3BhY2VTa2lsbEZvbGRlcicsIFwiTm8gd29ya3NwYWNlIHNraWxscyBmb2xkZXIgaXMgY29uZmlndXJlZCBmb3IgdGhlIGFjdGl2ZSBoYXJuZXNzLlwiKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21pZ3JhdGlvbk5vV29ya3NwYWNlQWdlbnRGb2xkZXInLCBcIk5vIHdvcmtzcGFjZSBhZ2VudHMgZm9sZGVyIGlzIGNvbmZpZ3VyZWQgZm9yIHRoZSBhY3RpdmUgaGFybmVzcy5cIik7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdtaWdyYXRpb25Ob1dvcmtzcGFjZUluc3RydWN0aW9uc0ZvbGRlcicsIFwiTm8gd29ya3NwYWNlIGluc3RydWN0aW9ucyBmb2xkZXIgaXMgY29uZmlndXJlZCBmb3IgdGhlIGFjdGl2ZSBoYXJuZXNzLlwiKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0c3dpdGNoICh0YXJnZXRUeXBlKSB7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21pZ3JhdGlvbk5vR2xvYmFsU2tpbGxGb2xkZXInLCBcIk5vIGdsb2JhbCBza2lsbHMgZm9sZGVyIGlzIGNvbmZpZ3VyZWQgZm9yIHRoZSBhY3RpdmUgaGFybmVzcy5cIik7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21pZ3JhdGlvbk5vR2xvYmFsQWdlbnRGb2xkZXInLCBcIk5vIGdsb2JhbCBhZ2VudHMgZm9sZGVyIGlzIGNvbmZpZ3VyZWQgZm9yIHRoZSBhY3RpdmUgaGFybmVzcy5cIik7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ21pZ3JhdGlvbk5vR2xvYmFsSW5zdHJ1Y3Rpb25zRm9sZGVyJywgXCJObyBnbG9iYWwgaW5zdHJ1Y3Rpb25zIGZvbGRlciBpcyBjb25maWd1cmVkIGZvciB0aGUgYWN0aXZlIGhhcm5lc3MuXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGlja0N1c3RvbWl6YXRpb25NaWdyYXRpb25UYXJnZXRGb2xkZXIoc291cmNlRm9sZGVyczogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25Tb3VyY2VGb2xkZXJbXSwgdGFyZ2V0VHlwZTogUHJvbXB0c1R5cGUpOiBQcm9taXNlPElDdXN0b21pemF0aW9uU291cmNlRm9sZGVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGlja3M6IElNaWdyYXRpb25UYXJnZXRRdWlja1BpY2tJdGVtW10gPSBzb3VyY2VGb2xkZXJzLm1hcChmb2xkZXIgPT4gKHtcblx0XHRcdGxhYmVsOiBmb2xkZXIubGFiZWwsXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZm9sZGVyLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSxcblx0XHRcdGZvbGRlcixcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZWxlY3RlZCA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0Y2FuUGlja01hbnk6IGZhbHNlLFxuXHRcdFx0cGxhY2VIb2xkZXI6IHRoaXMuZ2V0TWlncmF0aW9uVGFyZ2V0Rm9sZGVyUGxhY2Vob2xkZXIodGFyZ2V0VHlwZSksXG5cdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IHRydWUsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIHNlbGVjdGVkPy5mb2xkZXI7XG5cdH1cblxuXHRwcml2YXRlIGdldE1pZ3JhdGlvblRhcmdldEZvbGRlclBsYWNlaG9sZGVyKHRhcmdldFR5cGU6IFByb21wdHNUeXBlKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHRhcmdldFR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWlncmF0aW9uUGlja1NraWxsRm9sZGVyJywgXCJTZWxlY3QgYSBkZXN0aW5hdGlvbiBmb2xkZXIgZm9yIG1pZ3JhdGVkIHNraWxsc1wiKTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWlncmF0aW9uUGlja0FnZW50Rm9sZGVyJywgXCJTZWxlY3QgYSBkZXN0aW5hdGlvbiBmb2xkZXIgZm9yIG1pZ3JhdGVkIGFnZW50c1wiKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnbWlncmF0aW9uUGlja0luc3RydWN0aW9uc0ZvbGRlcicsIFwiU2VsZWN0IGEgZGVzdGluYXRpb24gZm9sZGVyIGZvciBtaWdyYXRlZCBpbnN0cnVjdGlvbnNcIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXZlYWxNaWdyYXRlZEN1c3RvbWl6YXRpb25zKG1pZ3JhdGVkQ3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IHsgdXJpOiBVUkk7IHR5cGU6IFByb21wdHNUeXBlIH1bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhcmdldFR5cGVzID0gbmV3IFNldChtaWdyYXRlZEN1c3RvbWl6YXRpb25zLm1hcChjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24udHlwZSkpO1xuXHRcdGlmICh0YXJnZXRUeXBlcy5zaXplICE9PSAxKSB7XG5cdFx0XHR0aGlzLnNob3dXZWxjb21lUGFnZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFR5cGUgPSB0YXJnZXRUeXBlcy52YWx1ZXMoKS5uZXh0KCkudmFsdWU7XG5cdFx0aWYgKCF0YXJnZXRUeXBlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlY3Rpb24gPSB0aGlzLmdldEN1c3RvbWl6YXRpb25TZWN0aW9uKHRhcmdldFR5cGUpO1xuXHRcdGNvbnN0IG1pZ3JhdGVkVXJpcyA9IG1pZ3JhdGVkQ3VzdG9taXphdGlvbnMubWFwKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi51cmkpO1xuXG5cdFx0dGhpcy5zZWxlY3RTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdGF3YWl0IHRoaXMubGlzdFdpZGdldC5zZXRTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdGlmICh0aGlzLmxpc3RXaWRnZXQucmV2ZWFsQW5kU2VsZWN0Rmlyc3RJdGVtQnlVcmkobWlncmF0ZWRVcmlzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGlzdFdpZGdldC5jbGVhclNlYXJjaCgpO1xuXHRcdGlmICh0aGlzLmxpc3RXaWRnZXQucmV2ZWFsQW5kU2VsZWN0Rmlyc3RJdGVtQnlVcmkobWlncmF0ZWRVcmlzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGF0dGVtcHQgPSAwOyBhdHRlbXB0IDwgMTA7IGF0dGVtcHQrKykge1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMDApO1xuXHRcdFx0aWYgKHRoaXMubGlzdFdpZGdldC5yZXZlYWxBbmRTZWxlY3RGaXJzdEl0ZW1CeVVyaShtaWdyYXRlZFVyaXMpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEN1c3RvbWl6YXRpb25TZWN0aW9uKHR5cGU6IFByb21wdHNUeXBlKTogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24ge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0cmV0dXJuIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zOlxuXHRcdFx0XHRyZXR1cm4gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdFx0cmV0dXJuIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0XHRyZXR1cm4gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0cztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazpcblx0XHRcdFx0cmV0dXJuIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNQcm9tcHRzU2VjdGlvbihzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB8IHVuZGVmaW5lZCk6IHNlY3Rpb24gaXMgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24ge1xuXHRcdHJldHVybiBzZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMgfHxcblx0XHRcdHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyB8fFxuXHRcdFx0c2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zIHx8XG5cdFx0XHRzZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzIHx8XG5cdFx0XHRzZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcztcblx0fVxuXG5cdC8vI3JlZ2lvbiBTZWN0aW9uIENvdW50c1xuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBjb3VudCBmb3IgYSBzcGVjaWZpYyBzZWN0aW9uIGFuZCByZS1yZW5kZXJzIHRoZSBzaWRlYmFyLlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVTZWN0aW9uQ291bnQoc2VjdGlvbklkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiwgY291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSB0aGlzLnNlY3Rpb25zLmZpbmQocyA9PiBzLmlkID09PSBzZWN0aW9uSWQpO1xuXHRcdGlmICghc2VjdGlvbiB8fCBzZWN0aW9uLmNvdW50ID09PSBjb3VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzZWN0aW9uLmNvdW50ID0gY291bnQ7XG5cdFx0Ly8gUmUtc3BsaWNlIHRoZSBzZWN0aW9ucyBsaXN0IHRvIHRyaWdnZXIgcmUtcmVuZGVyXG5cdFx0dGhpcy5zZWN0aW9uc0xpc3Quc3BsaWNlKDAsIHRoaXMuc2VjdGlvbnNMaXN0Lmxlbmd0aCwgdGhpcy5zZWN0aW9ucyk7XG5cdFx0dGhpcy5lbnN1cmVTZWN0aW9uc0xpc3RSZWZsZWN0c0FjdGl2ZVNlY3Rpb24oKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZXMgdG8gdGhlIHdlbGNvbWUgcGFnZSAobm8gc2VjdGlvbiBzZWxlY3RlZCkuXG5cdCAqL1xuXHRwdWJsaWMgc2hvd1dlbGNvbWVQYWdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnZWRpdG9yJykge1xuXHRcdFx0dGhpcy5nb0JhY2tUb0xpc3QoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdtaWdyYXRpb24nKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21jcERldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbU1jcERldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3BsdWdpbkRldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVBsdWdpbkRldGFpbCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ3Rvb2xzRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tVG9vbERldGFpbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VsZWN0ZWRTZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc2VjdGlvbkNvbnRleHRLZXkuc2V0KCcnKTtcblxuXHRcdC8vIENsZWFyIHBlcnNpc3RlZCBzZWN0aW9uIHNvIHdlbGNvbWUgc2hvd3MgbmV4dCB0aW1lXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFTEVDVEVEX1NFQ1RJT05fS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cblx0XHR0aGlzLndlbGNvbWVQYWdlPy5yZXNldCgpO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblx0XHR0aGlzLmVuc3VyZVNlY3Rpb25zTGlzdFJlZmxlY3RzQWN0aXZlU2VjdGlvbih1bmRlZmluZWQpO1xuXHRcdHRoaXMud2VsY29tZVBhZ2U/LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHNlbGVjdFNlY3Rpb24oc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIG9wdGlvbnM/OiB7IHNob3dNYXJrZXRwbGFjZT86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gc2VjdGlvbiAmJiAhb3B0aW9ucz8uc2hvd01hcmtldHBsYWNlKSB7XG5cdFx0XHR0aGlzLmVuc3VyZVNlY3Rpb25zTGlzdFJlZmxlY3RzQWN0aXZlU2VjdGlvbihzZWN0aW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDdXN0b21pemF0aW9uRWRpdG9yU2VjdGlvbkNoYW5nZWRFdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvclNlY3Rpb25DaGFuZ2VkQ2xhc3NpZmljYXRpb24+KCdjaGF0Q3VzdG9taXphdGlvbkVkaXRvci5zZWN0aW9uQ2hhbmdlZCcsIHtcblx0XHRcdHNlY3Rpb24sXG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ2VkaXRvcicpIHtcblx0XHRcdHRoaXMuZ29CYWNrVG9MaXN0KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnbWlncmF0aW9uJykge1xuXHRcdFx0dGhpcy52aWV3TW9kZSA9ICdsaXN0Jztcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdtY3BEZXRhaWwnKSB7XG5cdFx0XHR0aGlzLmdvQmFja0Zyb21NY3BEZXRhaWwoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdwbHVnaW5EZXRhaWwnKSB7XG5cdFx0XHR0aGlzLmdvQmFja0Zyb21QbHVnaW5EZXRhaWwoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICd0b29sc0RldGFpbCcpIHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVRvb2xEZXRhaWwoKTtcblx0XHR9XG5cblx0XHR0aGlzLnNlbGVjdGVkU2VjdGlvbiA9IHNlY3Rpb247XG5cdFx0dGhpcy5zZWN0aW9uQ29udGV4dEtleS5zZXQoc2VjdGlvbik7XG5cblx0XHQvLyBQZXJzaXN0IHNlbGVjdGlvblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQUlfQ1VTVE9NSVpBVElPTl9NQU5BR0VNRU5UX1NFTEVDVEVEX1NFQ1RJT05fS0VZLCBzZWN0aW9uLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdC8vIFVwZGF0ZSBjb250ZW50IHZpc2liaWxpdHlcblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRWaXNpYmlsaXR5KCk7XG5cblx0XHQvLyBMb2FkIGl0ZW1zIGZvciB0aGUgbmV3IHNlY3Rpb24gKG9ubHkgZm9yIHByb21wdHMtYmFzZWQgc2VjdGlvbnMpXG5cdFx0aWYgKHRoaXMuaXNQcm9tcHRzU2VjdGlvbihzZWN0aW9uKSkge1xuXHRcdFx0dm9pZCB0aGlzLmxpc3RXaWRnZXQuc2V0U2VjdGlvbihzZWN0aW9uKTtcblx0XHR9XG5cblx0XHQvLyBSZS1sYXlvdXQgYWZ0ZXIgdmlzaWJpbGl0eSBjaGFuZ2Ugc28gdGhlIG5ld2x5LXZpc2libGUgd2lkZ2V0IGNhblxuXHRcdC8vIG1lYXN1cmUgaXRzIGZsZXgtY29tcHV0ZWQgY29udGFpbmVyIGhlaWdodCBjb3JyZWN0bHkuIFdpdGhvdXQgdGhpcyxcblx0XHQvLyBhIHdpZGdldCB0aGF0IHdhcyBwcmV2aW91c2x5IGhpZGRlbiAob2Zmc2V0SGVpZ2h0ID09PSAwKSBrZWVwcyBpdHNcblx0XHQvLyBzdGFsZSBsaXN0Q29udGFpbmVyIGhlaWdodCBhbmQgY2xpcHMgaXRlbXMgYXQgdGhlIGJvdHRvbS5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLmVuc3VyZVNlY3Rpb25zTGlzdFJlZmxlY3RzQWN0aXZlU2VjdGlvbihzZWN0aW9uKTtcblxuXHRcdC8vIEFjdGl2YXRlIG1hcmtldHBsYWNlIGJyb3dzZSBtb2RlIGlmIHJlcXVlc3RlZFxuXHRcdGlmIChvcHRpb25zPy5zaG93TWFya2V0cGxhY2UpIHtcblx0XHRcdGlmIChzZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzKSB7XG5cdFx0XHRcdHRoaXMubWNwTGlzdFdpZGdldD8uc2hvd0Jyb3dzZU1hcmtldHBsYWNlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMpIHtcblx0XHRcdFx0dGhpcy5wbHVnaW5MaXN0V2lkZ2V0Py5zaG93QnJvd3NlTWFya2V0cGxhY2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBNb3ZlIGZvY3VzIHRvIHRoZSBzZWFyY2ggaW5wdXQgc28ga2V5Ym9hcmQgdXNlcnMgY2FuIGltbWVkaWF0ZWx5XG5cdFx0Ly8gZmlsdGVyIHdpdGhvdXQgZXh0cmEgVGFiIHRyYXZlcnNhbCAocGFyaXR5IHdpdGggbW91c2UtY2xpY2sgZmxvdykuXG5cdFx0aWYgKHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMpIHtcblx0XHRcdHRoaXMubWNwTGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMpIHtcblx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1vZGVscyAmJiAhYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25SZWdpc3RyeS5nZXQoc2VjdGlvbiwgdGhpcy5oYXJuZXNzU2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpKSkge1xuXHRcdFx0dGhpcy5tb2RlbHNXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdFx0fSBlbHNlIGlmIChzZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scykge1xuXHRcdFx0dGhpcy50b29sc0xpc3RXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmNvbnRyaWJ1dGVkU2VjdGlvbkNvbnRhaW5lcnMuaGFzKHNlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLmVuc3VyZUNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldChzZWN0aW9uKT8uZm9jdXM/LigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVTZWN0aW9uc0xpc3RSZWZsZWN0c0FjdGl2ZVNlY3Rpb24oc2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24gfCB1bmRlZmluZWQgPSB0aGlzLnNlbGVjdGVkU2VjdGlvbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zZWN0aW9uc0xpc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2VjdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBXZWxjb21lIHBhZ2UgXHUyMDE0IGRlc2VsZWN0IGFsbFxuXHRcdFx0dGhpcy5zZWN0aW9uc0xpc3Quc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdHRoaXMuc2VjdGlvbnNMaXN0LnNldEZvY3VzKFtdKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuc2VjdGlvbnMuZmluZEluZGV4KHMgPT4gcy5pZCA9PT0gc2VjdGlvbik7XG5cdFx0aWYgKGluZGV4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuc2VjdGlvbnNMaXN0LmdldFNlbGVjdGlvbigpO1xuXHRcdGlmIChzZWxlY3Rpb24ubGVuZ3RoICE9PSAxIHx8IHNlbGVjdGlvblswXSAhPT0gaW5kZXgpIHtcblx0XHRcdHRoaXMuc2VjdGlvbnNMaXN0LnNldFNlbGVjdGlvbihbaW5kZXhdKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1cyA9IHRoaXMuc2VjdGlvbnNMaXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzLmxlbmd0aCAhPT0gMSB8fCBmb2N1c1swXSAhPT0gaW5kZXgpIHtcblx0XHRcdHRoaXMuc2VjdGlvbnNMaXN0LnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNFZGl0b3JNb2RlID0gdGhpcy52aWV3TW9kZSA9PT0gJ2VkaXRvcic7XG5cdFx0Y29uc3QgaXNNaWdyYXRpb25Nb2RlID0gdGhpcy52aWV3TW9kZSA9PT0gJ21pZ3JhdGlvbic7XG5cdFx0Y29uc3QgaXNNY3BEZXRhaWxNb2RlID0gdGhpcy52aWV3TW9kZSA9PT0gJ21jcERldGFpbCc7XG5cdFx0Y29uc3QgaXNQbHVnaW5EZXRhaWxNb2RlID0gdGhpcy52aWV3TW9kZSA9PT0gJ3BsdWdpbkRldGFpbCc7XG5cdFx0Y29uc3QgaXNUb29sc0RldGFpbE1vZGUgPSB0aGlzLnZpZXdNb2RlID09PSAndG9vbHNEZXRhaWwnO1xuXHRcdGNvbnN0IGlzRGV0YWlsTW9kZSA9IGlzTWNwRGV0YWlsTW9kZSB8fCBpc1BsdWdpbkRldGFpbE1vZGUgfHwgaXNUb29sc0RldGFpbE1vZGU7XG5cdFx0Y29uc3QgaXNXZWxjb21lID0gdGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpc1Byb21wdHNTZWN0aW9uID0gdGhpcy5zZWxlY3RlZFNlY3Rpb24gIT09IHVuZGVmaW5lZCAmJiB0aGlzLmlzUHJvbXB0c1NlY3Rpb24odGhpcy5zZWxlY3RlZFNlY3Rpb24pO1xuXHRcdGNvbnN0IGlzTW9kZWxzU2VjdGlvbiA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHM7XG5cdFx0Y29uc3QgaXNDb250cmlidXRlZE1vZGVsc1NlY3Rpb24gPSBpc01vZGVsc1NlY3Rpb24gJiYgISFhaUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvblJlZ2lzdHJ5LmdldChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHMsIHRoaXMuaGFybmVzc1NlcnZpY2UuYWN0aXZlSGFybmVzcy5nZXQoKSk7XG5cdFx0Y29uc3QgaXNNY3BTZWN0aW9uID0gdGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnM7XG5cdFx0Y29uc3QgaXNQbHVnaW5zU2VjdGlvbiA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zO1xuXHRcdGNvbnN0IGlzVG9vbHNTZWN0aW9uID0gdGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzO1xuXG5cdFx0aWYgKHRoaXMud2VsY29tZVBhZ2UpIHtcblx0XHRcdHRoaXMud2VsY29tZVBhZ2UuY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBpc1dlbGNvbWUgJiYgIWlzRWRpdG9yTW9kZSAmJiAhaXNNaWdyYXRpb25Nb2RlICYmICFpc0RldGFpbE1vZGUgPyAnJyA6ICdub25lJztcblx0XHR9XG5cdFx0aWYgKHRoaXMucHJvbXB0c0NvbnRlbnRDb250YWluZXIpIHtcblx0XHRcdHRoaXMucHJvbXB0c0NvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICFpc0VkaXRvck1vZGUgJiYgIWlzTWlncmF0aW9uTW9kZSAmJiAhaXNEZXRhaWxNb2RlICYmIGlzUHJvbXB0c1NlY3Rpb24gPyAnJyA6ICdub25lJztcblx0XHR9XG5cdFx0aWYgKHRoaXMubWlncmF0aW9uQ29udGVudENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5taWdyYXRpb25Db250ZW50Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBpc01pZ3JhdGlvbk1vZGUgPyAnJyA6ICdub25lJztcblx0XHR9XG5cdFx0aWYgKHRoaXMubW9kZWxzQ29udGVudENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5tb2RlbHNDb250ZW50Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAhaXNFZGl0b3JNb2RlICYmICFpc01pZ3JhdGlvbk1vZGUgJiYgIWlzRGV0YWlsTW9kZSAmJiBpc01vZGVsc1NlY3Rpb24gJiYgIWlzQ29udHJpYnV0ZWRNb2RlbHNTZWN0aW9uID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1jcENvbnRlbnRDb250YWluZXIpIHtcblx0XHRcdHRoaXMubWNwQ29udGVudENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gIWlzRWRpdG9yTW9kZSAmJiAhaXNNaWdyYXRpb25Nb2RlICYmICFpc0RldGFpbE1vZGUgJiYgaXNNY3BTZWN0aW9uID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1jcERldGFpbENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5tY3BEZXRhaWxDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IGlzTWNwRGV0YWlsTW9kZSA/ICcnIDogJ25vbmUnO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wbHVnaW5Db250ZW50Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnBsdWdpbkNvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICFpc0VkaXRvck1vZGUgJiYgIWlzTWlncmF0aW9uTW9kZSAmJiAhaXNEZXRhaWxNb2RlICYmIGlzUGx1Z2luc1NlY3Rpb24gPyAnJyA6ICdub25lJztcblx0XHR9XG5cdFx0aWYgKHRoaXMucGx1Z2luRGV0YWlsQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnBsdWdpbkRldGFpbENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gaXNQbHVnaW5EZXRhaWxNb2RlID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRvb2xzQ29udGVudENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy50b29sc0NvbnRlbnRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICFpc0VkaXRvck1vZGUgJiYgIWlzTWlncmF0aW9uTW9kZSAmJiAhaXNEZXRhaWxNb2RlICYmIGlzVG9vbHNTZWN0aW9uID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnRvb2xzRGV0YWlsQ29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRvb2xzRGV0YWlsQ29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBpc1Rvb2xzRGV0YWlsTW9kZSA/ICcnIDogJ25vbmUnO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IFtzZWN0aW9uLCBjb250YWluZXJdIG9mIHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycykge1xuXHRcdFx0Y29uc3QgdmlzaWJsZSA9ICFpc0VkaXRvck1vZGUgJiYgIWlzTWlncmF0aW9uTW9kZSAmJiAhaXNEZXRhaWxNb2RlICYmIHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBzZWN0aW9uO1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2aXNpYmxlID8gJycgOiAnbm9uZSc7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLmVuc3VyZUNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldChzZWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuZWRpdG9yQ29udGVudENvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSBpc0VkaXRvck1vZGUgPyAnJyA6ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBSZW5kZXIgYW5kIGxheW91dCBtb2RlbHMgd2lkZ2V0IHdoZW4gc3dpdGNoaW5nIHRvIGl0XG5cdFx0aWYgKGlzTW9kZWxzU2VjdGlvbiAmJiAhaXNDb250cmlidXRlZE1vZGVsc1NlY3Rpb24gJiYgdGhpcy5tb2RlbHNXaWRnZXQpIHtcblx0XHRcdHRoaXMubW9kZWxzV2lkZ2V0LnJlbmRlcigpO1xuXHRcdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldChzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbik6IElBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbldpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldHMuZ2V0KHNlY3Rpb24pO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHRjb25zdCBjb250cmlidXRpb24gPSBhaUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvblJlZ2lzdHJ5LmdldChzZWN0aW9uLCB0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZUhhcm5lc3MuZ2V0KCkpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycy5nZXQoc2VjdGlvbik7XG5cdFx0aWYgKCFjb250cmlidXRpb24gfHwgIWNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY29udHJpYnV0aW9uLmNyZWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250YWluZXIpO1xuXHRcdHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uV2lkZ2V0cy5zZXQoc2VjdGlvbiwgd2lkZ2V0KTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh3aWRnZXQpO1xuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0d2lkZ2V0LmxheW91dD8uKHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHdpZGdldDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IGN1c3RvbWl6YXRpb24gdXNpbmcgdGhlIEFJLWd1aWRlZCBmbG93LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVOZXdJdGVtV2l0aEFJKHR5cGU6IFByb21wdHNUeXBlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvckNyZWF0ZUl0ZW1FdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvckNyZWF0ZUl0ZW1DbGFzc2lmaWNhdGlvbj4oJ2NoYXRDdXN0b21pemF0aW9uRWRpdG9yLmNyZWF0ZUl0ZW0nLCB7XG5cdFx0XHRzZWN0aW9uOiB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/PyAnd2VsY29tZScsXG5cdFx0XHRwcm9tcHRUeXBlOiB0eXBlLFxuXHRcdFx0Y3JlYXRpb25Nb2RlOiAnYWknLFxuXHRcdFx0dGFyZ2V0OiAnd29ya3NwYWNlJyxcblx0XHR9KTtcblx0XHRpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0dGhpcy5ncm91cC5jbG9zZUVkaXRvcih0aGlzLmlucHV0KTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdlbmVyYXRlQ3VzdG9taXphdGlvbih0eXBlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IHByb21wdCBmaWxlIGFuZCBvcGVucyBpdCBpbiB0aGUgZW1iZWRkZWQgZWRpdG9yLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVOZXdJdGVtTWFudWFsKHR5cGU6IFByb21wdHNUeXBlLCB0YXJnZXQ6ICdsb2NhbCcgfCAndXNlcicgfCAnd29ya3NwYWNlLXJvb3QnLCByb290RmlsZU5hbWU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDdXN0b21pemF0aW9uRWRpdG9yQ3JlYXRlSXRlbUV2ZW50LCBDdXN0b21pemF0aW9uRWRpdG9yQ3JlYXRlSXRlbUNsYXNzaWZpY2F0aW9uPignY2hhdEN1c3RvbWl6YXRpb25FZGl0b3IuY3JlYXRlSXRlbScsIHtcblx0XHRcdHNlY3Rpb246IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID8/ICd3ZWxjb21lJyxcblx0XHRcdHByb21wdFR5cGU6IHR5cGUsXG5cdFx0XHRjcmVhdGlvbk1vZGU6ICdtYW51YWwnLFxuXHRcdFx0dGFyZ2V0OiB0YXJnZXQgPT09ICd3b3Jrc3BhY2Utcm9vdCcgPyAnd29ya3NwYWNlJyA6IHRhcmdldCxcblx0XHR9KTtcblxuXHRcdC8vIEhhbmRsZSB3b3Jrc3BhY2Utcm9vdCBmaWxlcyAoZS5nLiBBR0VOVFMubWQgb3IgQ0xBVURFLm1kIGF0IHByb2plY3Qgcm9vdCkuXG5cdFx0Ly8gcm9vdEZpbGVOYW1lIGlzIHBhc3NlZCBmcm9tIHJvb3RGaWxlU2hvcnRjdXRzOyBmYWxscyBiYWNrIHRvXG5cdFx0Ly8gdGhlIHNlY3Rpb24gb3ZlcnJpZGUncyByb290RmlsZSwgdGhlbiBBR0VOVFMubWQgYXMgdGhlIGRlZmF1bHQuXG5cdFx0aWYgKHRhcmdldCA9PT0gJ3dvcmtzcGFjZS1yb290Jykge1xuXHRcdFx0Y29uc3QgcHJvamVjdFJvb3QgPSB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0QWN0aXZlUHJvamVjdFJvb3QoKTtcblx0XHRcdGlmICghcHJvamVjdFJvb3QpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3ZlcnJpZGUgPSB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/IHRoaXMuaGFybmVzc1NlcnZpY2UuZ2V0QWN0aXZlRGVzY3JpcHRvcigpLnNlY3Rpb25PdmVycmlkZXM/LmdldCh0aGlzLnNlbGVjdGVkU2VjdGlvbikgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBmaWxlTmFtZSA9IHJvb3RGaWxlTmFtZSA/PyBvdmVycmlkZT8ucm9vdEZpbGUgPz8gQUdFTlRfTURfRklMRU5BTUU7XG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmpvaW5QYXRoKHByb2plY3RSb290LCBmaWxlTmFtZSk7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoZmlsZVVyaSkpIHtcblx0XHRcdFx0Ly8gRmlsZSBhbHJlYWR5IGV4aXN0cyBcdTIwMTQganVzdCBvcGVuIGl0XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0VtYmVkZGVkRWRpdG9yKGZpbGVVcmksIGZpbGVOYW1lLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShmaWxlVXJpKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5zaG93RW1iZWRkZWRFZGl0b3IoZmlsZVVyaSwgZmlsZU5hbWUsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuaG9vaykge1xuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdC8vIFNlc3Npb25zOiBzaG93IGhvb2tzIGZpbHRlcmVkIHRvIENvcGlsb3QgQ0xJIChHaXRIdWIgQ29waWxvdCkgaG9vayB0eXBlc1xuXHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHNob3dDb25maWd1cmVIb29rc1F1aWNrUGljaywge1xuXHRcdFx0XHRcdG9wZW5FZGl0b3I6IGFzeW5jIChyZXNvdXJjZSkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93RW1iZWRkZWRFZGl0b3IocmVzb3VyY2UsIGJhc2VuYW1lKHJlc291cmNlKSwgUHJvbXB0c1R5cGUuaG9vaywgUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHRydWUpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dGFyZ2V0OiBUYXJnZXQuR2l0SHViQ29waWxvdCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBDb3JlOiB1c2UgdGhlIGRlZmF1bHQgY29yZSBiZWhhdmlvdXJcblx0XHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihzaG93Q29uZmlndXJlSG9va3NRdWlja1BpY2ssIHtcblx0XHRcdFx0XHRvcGVuRWRpdG9yOiBhc3luYyAocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0VtYmVkZGVkRWRpdG9yKHJlc291cmNlLCBiYXNlbmFtZShyZXNvdXJjZSksIFByb21wdHNUeXBlLmhvb2ssIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0cnVlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmhhcm5lc3NTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZS5nZXQoKTtcblx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1c3RvbWl6YXRpb25Mb2NhdGlvblBpY2tlcik7XG5cdFx0Y29uc3QgdGFyZ2V0RGlyID0gYXdhaXQgcGlja2VyLnJlc29sdmVUYXJnZXREaXJlY3RvcnlXaXRoUGlja2VyKFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0dHlwZSxcblx0XHRcdHRhcmdldCxcblx0XHQpO1xuXHRcdGlmICh0YXJnZXREaXIgPT09IG51bGwpIHtcblx0XHRcdHJldHVybjsgLy8gVXNlciBjYW5jZWxsZWQgdGhlIHBpY2tlclxuXHRcdH1cblxuXHRcdGlmICh0YXJnZXREaXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gdGFyZ2V0RGlyIG1heSBiZSB1bmRlZmluZWQgd2hlbiBubyBtYXRjaGluZyBmb2xkZXIgZXhpc3RzIGZvciB0aGVcblx0XHRcdC8vIHJlcXVlc3RlZCBzdG9yYWdlIHR5cGUgKGUuZy4gc2tpbGxzIGhhdmUgbm8gdXNlci1zdG9yYWdlIGZvbGRlcikuXG5cdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHNob3dOb0ZvbGRlcnNEaWFsb2csIHR5cGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gdGhlIGFjdGl2ZSBoYXJuZXNzIG92ZXJyaWRlcyB0aGUgZmlsZSBleHRlbnNpb24gKGUuZy4gQ2xhdWRlXG5cdFx0Ly8gcnVsZXMgdXNlIC5tZCBpbnN0ZWFkIG9mIC5pbnN0cnVjdGlvbnMubWQpLCBwYXNzIGl0IHRocm91Z2ggc28gdGhlXG5cdFx0Ly8gbmFtZSBwaWNrZXIgYW5kIGZpbGUgY3JlYXRpb24gdXNlIHRoZSBjb3JyZWN0IGV4dGVuc2lvbi5cblx0XHRjb25zdCBvdmVycmlkZSA9IHRoaXMuc2VsZWN0ZWRTZWN0aW9uID8gdGhpcy5oYXJuZXNzU2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCkuc2VjdGlvbk92ZXJyaWRlcz8uZ2V0KHRoaXMuc2VsZWN0ZWRTZWN0aW9uKSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElOZXdQcm9tcHRPcHRpb25zID0ge1xuXHRcdFx0dGFyZ2V0Rm9sZGVyOiB0YXJnZXREaXIsXG5cdFx0XHR0YXJnZXRTdG9yYWdlOiB0YXJnZXQgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMudXNlciA/IFByb21wdHNTdG9yYWdlLnVzZXIgOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdGZpbGVFeHRlbnNpb246IG92ZXJyaWRlPy5maWxlRXh0ZW5zaW9uLFxuXHRcdFx0b3BlbkZpbGU6IGFzeW5jICh1cmkpID0+IHtcblx0XHRcdFx0Y29uc3QgaXNXb3Jrc3BhY2UgPSB0YXJnZXQgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMubG9jYWw7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0VtYmVkZGVkRWRpdG9yKHVyaSwgYmFzZW5hbWUodXJpKSwgdHlwZSwgdGFyZ2V0LCBpc1dvcmtzcGFjZSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLmVtYmVkZGVkRWRpdG9yO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0bGV0IGNvbW1hbmRJZDogc3RyaW5nO1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6IGNvbW1hbmRJZCA9IE5FV19QUk9NUFRfQ09NTUFORF9JRDsgYnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczogY29tbWFuZElkID0gTkVXX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEOyBicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6IGNvbW1hbmRJZCA9IE5FV19BR0VOVF9DT01NQU5EX0lEOyBicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6IGNvbW1hbmRJZCA9IE5FV19TS0lMTF9DT01NQU5EX0lEOyBicmVhaztcblx0XHRcdGRlZmF1bHQ6IHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCwgb3B0aW9ucyk7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHQvLyBUaGUgbW9kYWwgcHJvdmlkZXMgaXRzIG93biBwYW5lbCBjaHJvbWUsIHNvIHRoZSBzcGxpdCB2aWV3IHNlcGFyYXRvclxuXHRcdC8vIGlzIGludGVudGlvbmFsbHkgaGlkZGVuIGhlcmUgcmVnYXJkbGVzcyBvZiB0aGVtZS5cblx0XHR0aGlzLnNwbGl0Vmlldz8uc3R5bGUoeyBzZXBhcmF0b3JCb3JkZXI6IENvbG9yLnRyYW5zcGFyZW50IH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCwgb3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQsIGNvbnRleHQ6IElFZGl0b3JPcGVuQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gT24gKHJlKW9wZW4sIGNsZWFyIGFueSBvdmVycmlkZSBzbyB0aGUgcm9vdCBjb21lcyBmcm9tIHRoZSBkZWZhdWx0IHNvdXJjZVxuXHRcdHRoaXMud29ya3NwYWNlU2VydmljZS5jbGVhck92ZXJyaWRlUHJvamVjdFJvb3QoKTtcblxuXHRcdHRoaXMuaW5FZGl0b3JDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHR0aGlzLnNlY3Rpb25Db250ZXh0S2V5LnNldCh0aGlzLnNlbGVjdGVkU2VjdGlvbiA/PyAnJyk7XG5cblx0XHRpbnB1dC5zZXRTYXZlSGFuZGxlcigoKSA9PiB0aGlzLmhhbmRsZUJ1aWx0aW5TYXZlKCkpO1xuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvck9wZW5lZEV2ZW50LCBDdXN0b21pemF0aW9uRWRpdG9yT3BlbmVkQ2xhc3NpZmljYXRpb24+KCdjaGF0Q3VzdG9taXphdGlvbkVkaXRvci5vcGVuZWQnLCB7XG5cdFx0XHRzZWN0aW9uOiB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/PyAnd2VsY29tZScsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5wdXQ7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0KSB7XG5cdFx0XHRpbnB1dC5zZXRTYXZlSGFuZGxlcih1bmRlZmluZWQpO1xuXHRcdFx0aW5wdXQuc2V0RGlydHkoZmFsc2UpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5FZGl0b3JDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdlZGl0b3InKSB7XG5cdFx0XHR0aGlzLmdvQmFja1RvTGlzdCgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21pZ3JhdGlvbicpIHtcblx0XHRcdHRoaXMudmlld01vZGUgPSAnbGlzdCc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnbWNwRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tTWNwRGV0YWlsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAncGx1Z2luRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tUGx1Z2luRGV0YWlsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAndG9vbHNEZXRhaWwnKSB7XG5cdFx0XHR0aGlzLmdvQmFja0Zyb21Ub29sRGV0YWlsKCk7XG5cdFx0fVxuXHRcdC8vIENsZWFyIHRyYW5zaWVudCBmb2xkZXIgb3ZlcnJpZGUgb24gY2xvc2Vcblx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UuY2xlYXJPdmVycmlkZVByb2plY3RSb290KCk7XG5cdFx0dGhpcy5kaXNwb3NlQnVpbHRpbkVkaXRpbmdTZXNzaW9ucygpO1xuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBzZXRFZGl0b3JWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5zZXRFZGl0b3JWaXNpYmxlKHZpc2libGUpO1xuXHRcdGlmICh2aXNpYmxlICYmIHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuZGltZW5zaW9uID0gZGltZW5zaW9uO1xuXG5cdFx0aWYgKHRoaXMuY29udGFpbmVyICYmIHRoaXMuc3BsaXRWaWV3KSB7XG5cdFx0XHR0aGlzLnNwbGl0Vmlld0NvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb24uaGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuc3BsaXRWaWV3LmxheW91dChkaW1lbnNpb24ud2lkdGgsIGRpbWVuc2lvbi5oZWlnaHQpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLmNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldHMudmFsdWVzKCkpIHtcblx0XHRcdHdpZGdldC5sYXlvdXQ/LihkaW1lbnNpb24pO1xuXHRcdH1cblx0XHR0aGlzLm1pZ3JhdGlvblNlYXJjaElucHV0Py5sYXlvdXQoKTtcblx0XHR0aGlzLm1pZ3JhdGlvbkxpc3RTY3JvbGxhYmxlPy5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ2VkaXRvcicpIHtcblx0XHRcdGlmICh0aGlzLmVkaXRvckRpc3BsYXlNb2RlID09PSAncmF3Jykge1xuXHRcdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yPy5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5lZGl0b3JNb2RlQnV0dG9uPy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ21pZ3JhdGlvbicpIHtcblx0XHRcdHRoaXMubWlncmF0aW9uU2VhcmNoSW5wdXQ/LmZvY3VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLndlbGNvbWVQYWdlPy5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMpIHtcblx0XHRcdHRoaXMubWNwTGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uID09PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zKSB7XG5cdFx0XHR0aGlzLnBsdWdpbkxpc3RXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTW9kZWxzICYmICFhaUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvblJlZ2lzdHJ5LmdldChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Nb2RlbHMsIHRoaXMuaGFybmVzc1NlcnZpY2UuYWN0aXZlSGFybmVzcy5nZXQoKSkpIHtcblx0XHRcdHRoaXMubW9kZWxzV2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzKSB7XG5cdFx0XHR0aGlzLnRvb2xzTGlzdFdpZGdldD8uZm9jdXNTZWFyY2goKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uICYmIHRoaXMuY29udHJpYnV0ZWRTZWN0aW9uQ29udGFpbmVycy5oYXModGhpcy5zZWxlY3RlZFNlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLmVuc3VyZUNvbnRyaWJ1dGVkU2VjdGlvbldpZGdldCh0aGlzLnNlbGVjdGVkU2VjdGlvbik/LmZvY3VzPy4oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTZWxlY3RzIGEgc3BlY2lmaWMgc2VjdGlvbiBwcm9ncmFtbWF0aWNhbGx5LlxuXHQgKi9cblx0cHVibGljIHNlbGVjdFNlY3Rpb25CeUlkKHNlY3Rpb25JZDogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIG9wdGlvbnM/OiB7IHNob3dNYXJrZXRwbGFjZT86IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5zZWN0aW9ucy5maW5kSW5kZXgocyA9PiBzLmlkID09PSBzZWN0aW9uSWQpO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHQvLyBEaXJlY3RseSB1cGRhdGUgc3RhdGUgYW5kIFVJLCBieXBhc3NpbmcgdGhlIGVhcmx5LXJldHVybiBndWFyZCBpbiBzZWxlY3RTZWN0aW9uXG5cdFx0XHQvLyB0byBoYW5kbGUgdGhlIGNhc2Ugd2hlcmUgdGhlIGVkaXRvciBqdXN0IG9wZW5lZCB3aXRoIGEgcGVyc2lzdGVkIHNlY3Rpb24gdGhhdFxuXHRcdFx0Ly8gbWF0Y2hlcyB0aGUgcmVxdWVzdGVkIG9uZSAoY29udGVudCBtaWdodCBub3QgYmUgbG9hZGVkIHlldCkuXG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ2VkaXRvcicpIHtcblx0XHRcdFx0dGhpcy5nb0JhY2tUb0xpc3QoKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnbWlncmF0aW9uJykge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdtY3BEZXRhaWwnKSB7XG5cdFx0XHRcdHRoaXMuZ29CYWNrRnJvbU1jcERldGFpbCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICdwbHVnaW5EZXRhaWwnKSB7XG5cdFx0XHRcdHRoaXMuZ29CYWNrRnJvbVBsdWdpbkRldGFpbCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMudmlld01vZGUgPT09ICd0b29sc0RldGFpbCcpIHtcblx0XHRcdFx0dGhpcy5nb0JhY2tGcm9tVG9vbERldGFpbCgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZWxlY3RlZFNlY3Rpb24gPSBzZWN0aW9uSWQ7XG5cdFx0XHR0aGlzLnNlY3Rpb25Db250ZXh0S2V5LnNldChzZWN0aW9uSWQpO1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBSV9DVVNUT01JWkFUSU9OX01BTkFHRU1FTlRfU0VMRUNURURfU0VDVElPTl9LRVksIHNlY3Rpb25JZCwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRWaXNpYmlsaXR5KCk7XG5cdFx0XHRpZiAodGhpcy5pc1Byb21wdHNTZWN0aW9uKHNlY3Rpb25JZCkpIHtcblx0XHRcdFx0dm9pZCB0aGlzLmxpc3RXaWRnZXQuc2V0U2VjdGlvbihzZWN0aW9uSWQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmUtbGF5b3V0IGFmdGVyIHZpc2liaWxpdHkgY2hhbmdlIHNvIHRoZSBuZXdseS12aXNpYmxlIHdpZGdldFxuXHRcdFx0Ly8gY2FuIG1lYXN1cmUgaXRzIGZsZXgtY29tcHV0ZWQgY29udGFpbmVyIGhlaWdodCBjb3JyZWN0bHkuXG5cdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbnN1cmVTZWN0aW9uc0xpc3RSZWZsZWN0c0FjdGl2ZVNlY3Rpb24oc2VjdGlvbklkKTtcblxuXHRcdFx0Ly8gQWN0aXZhdGUgbWFya2V0cGxhY2UgYnJvd3NlIG1vZGUgaWYgcmVxdWVzdGVkXG5cdFx0XHRpZiAob3B0aW9ucz8uc2hvd01hcmtldHBsYWNlKSB7XG5cdFx0XHRcdGlmIChzZWN0aW9uSWQgPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMpIHtcblx0XHRcdFx0XHR0aGlzLm1jcExpc3RXaWRnZXQ/LnNob3dCcm93c2VNYXJrZXRwbGFjZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNlY3Rpb25JZCA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucykge1xuXHRcdFx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldD8uc2hvd0Jyb3dzZU1hcmtldHBsYWNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2hvd0N1c3RvbWl6YXRpb25NaWdyYXRpb25QYWdlKGNhdGVnb3J5SWQ6IEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeUlkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzTWlncmF0aW9uQ2F0ZWdvcnlFbmFibGVkKGdldEN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeShjYXRlZ29yeUlkKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy52aWV3TW9kZSA9PT0gJ2VkaXRvcicpIHtcblx0XHRcdHRoaXMuZ29CYWNrVG9MaXN0KCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAnbWNwRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tTWNwRGV0YWlsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAncGx1Z2luRGV0YWlsJykge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tUGx1Z2luRGV0YWlsKCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdNb2RlID09PSAndG9vbHNEZXRhaWwnKSB7XG5cdFx0XHR0aGlzLmdvQmFja0Zyb21Ub29sRGV0YWlsKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuYWN0aXZlTWlncmF0aW9uQ2F0ZWdvcnlJZCAhPT0gY2F0ZWdvcnlJZCkge1xuXHRcdFx0dGhpcy5hY3RpdmVNaWdyYXRpb25DYXRlZ29yeUlkID0gY2F0ZWdvcnlJZDtcblx0XHRcdHRoaXMubWlncmF0aW9uU2VhcmNoUXVlcnkgPSAnJztcblx0XHRcdGlmICh0aGlzLm1pZ3JhdGlvblNlYXJjaElucHV0KSB7XG5cdFx0XHRcdHRoaXMubWlncmF0aW9uU2VhcmNoSW5wdXQudmFsdWUgPSAnJztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zZWxlY3RlZFNlY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5zZWN0aW9uQ29udGV4dEtleS5zZXQoJycpO1xuXHRcdHRoaXMudmlld01vZGUgPSAnbWlncmF0aW9uJztcblx0XHR0aGlzLmVuc3VyZVNlY3Rpb25zTGlzdFJlZmxlY3RzQWN0aXZlU2VjdGlvbih1bmRlZmluZWQpO1xuXHRcdHRoaXMucmVuZGVyQ3VzdG9taXphdGlvbk1pZ3JhdGlvblBhZ2UoKTtcblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRWaXNpYmlsaXR5KCk7XG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlZnJlc2hlcyB0aGUgbGlzdCB3aWRnZXQuXG5cdCAqL1xuXHRwdWJsaWMgcmVmcmVzaExpc3QoKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnJlZnJlc2goKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTY3JvbGxzIHRoZSBhY3RpdmUgbGlzdCB3aWRnZXQgc28gdGhlIGxhc3QgaXRlbSBpcyB2aXNpYmxlLlxuXHQgKi9cblx0cHVibGljIHJldmVhbExhc3RJdGVtKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkU2VjdGlvbiA9PT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycykge1xuXHRcdFx0dGhpcy5tY3BMaXN0V2lkZ2V0Py5yZXZlYWxMYXN0SXRlbSgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZFNlY3Rpb24gPT09IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMpIHtcblx0XHRcdHRoaXMucGx1Z2luTGlzdFdpZGdldD8ucmV2ZWFsTGFzdEl0ZW0oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnJldmVhbExhc3RJdGVtKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlcyBhIGRlYnVnIHJlcG9ydCBmb3IgdGhlIGN1cnJlbnQgc2VjdGlvbi5cblx0ICovXG5cdHB1YmxpYyBhc3luYyBnZW5lcmF0ZURlYnVnUmVwb3J0KCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZW5lcmF0ZURlYnVnUmVwb3J0KCk7XG5cdH1cblxuXHQvLyNyZWdpb24gRW1iZWRkZWQgRWRpdG9yXG5cblx0cHJpdmF0ZSBjcmVhdGVFbWJlZGRlZEVkaXRvcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yQ29udGVudENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvckhlYWRlciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyLCAkKCcuZWRpdG9yLWhlYWRlcicpKTtcblxuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uID0gRE9NLmFwcGVuZChlZGl0b3JIZWFkZXIsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2JhY2tUb0xpc3QnLCBcIkJhY2sgdG8gbGlzdFwiKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy5lZGl0b3JBY3Rpb25CdXR0b24sIGxvY2FsaXplKCdiYWNrVG9MaXN0VG9vbHRpcCcsIFwiQmFjayB0byBsaXN0XCIpKSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b25JY29uID0gRE9NLmFwcGVuZCh0aGlzLmVkaXRvckFjdGlvbkJ1dHRvbiwgJChgLmNvZGljb24uY29kaWNvbi0ke0NvZGljb24uYXJyb3dMZWZ0LmlkfS5lZGl0b3ItYWN0aW9uLWJ1dHRvbi1pY29uYCkpO1xuXHRcdHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uSWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuaGFuZGxlRWRpdG9yQWN0aW9uQnV0dG9uKCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gaGFuZGxlIGVkaXRvciBiYWNrIGFjdGlvbjonLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgnZWRpdG9yQWN0aW9uQnV0dG9uRmFpbGVkJywgXCJGYWlsZWQgdG8gZmluaXNoIHRoZSBwcm9tcHQgYWN0aW9uLlwiKSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpdGVtSW5mbyA9IERPTS5hcHBlbmQoZWRpdG9ySGVhZGVyLCAkKCcuZWRpdG9yLWl0ZW0taW5mbycpKTtcblx0XHR0aGlzLmVkaXRvckl0ZW1OYW1lRWxlbWVudCA9IERPTS5hcHBlbmQoaXRlbUluZm8sICQoJy5lZGl0b3ItaXRlbS1uYW1lJykpO1xuXHRcdHRoaXMuZWRpdG9ySXRlbVBhdGhFbGVtZW50ID0gRE9NLmFwcGVuZChpdGVtSW5mbywgJCgnLmVkaXRvci1pdGVtLXBhdGgnKSk7XG5cblx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24gPSBET00uYXBwZW5kKGVkaXRvckhlYWRlciwgJCgnYnV0dG9uLmVkaXRvci1tb2RlLWJ1dHRvbicpKTtcblx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24udHlwZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuZWRpdG9yTW9kZUJ1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsICdmYWxzZScpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMuZWRpdG9yTW9kZUJ1dHRvbiwgKCkgPT4gdGhpcy5nZXRFZGl0b3JNb2RlQnV0dG9uVG9vbHRpcCgpKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVkaXRvck1vZGVCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMudG9nZ2xlRWRpdG9yRGlzcGxheU1vZGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IgPSBET00uYXBwZW5kKGVkaXRvckhlYWRlciwgJCgnLmVkaXRvci1zYXZlLWluZGljYXRvcicpKTtcblxuXHRcdHRoaXMuZWRpdG9yUHJldmlld0NvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyLCAkKCcuZWRpdG9yLXByZXZpZXctY29udGFpbmVyJykpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JQcmV2aWV3Q29udGFpbmVyLCAkKCcuZWRpdG9yLXByZXZpZXctc2Nyb2xsLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmVkaXRvclByZXZpZXdTY3JvbGxDb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JlZ2lvbicpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnY3VzdG9taXphdGlvblByZXZpZXdBcmlhTGFiZWwnLCBcIkN1c3RvbWl6YXRpb24gcHJldmlld1wiKSk7XG5cblx0XHR0aGlzLmVkaXRvclByZXZpZXdJc3N1ZXNDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lciwgJCgnLmVkaXRvci1wcmV2aWV3LWlzc3VlcycpKTtcblxuXHRcdGNvbnN0IGZyb250TWF0dGVyU2VjdGlvbiA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JQcmV2aWV3U2Nyb2xsQ29udGFpbmVyLCAkKCcuZWRpdG9yLXByZXZpZXctc2VjdGlvbi5lZGl0b3ItcHJldmlldy1mcm9udG1hdHRlci1zZWN0aW9uJykpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld0Zyb250TWF0dGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChmcm9udE1hdHRlclNlY3Rpb24sICQoJy5lZGl0b3ItcHJldmlldy1mcm9udG1hdHRlci1saXN0JykpO1xuXG5cdFx0Y29uc3QgYm9keVNlY3Rpb24gPSBET00uYXBwZW5kKHRoaXMuZWRpdG9yUHJldmlld1Njcm9sbENvbnRhaW5lciwgJCgnLmVkaXRvci1wcmV2aWV3LXNlY3Rpb24uZWRpdG9yLXByZXZpZXctYm9keS1zZWN0aW9uJykpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld0JvZHlDb250YWluZXIgPSBET00uYXBwZW5kKGJvZHlTZWN0aW9uLCAkKCcuZWRpdG9yLXByZXZpZXctYm9keS1jb250ZW50JykpO1xuXG5cdFx0dGhpcy5lbWJlZGRlZEVkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JDb250ZW50Q29udGFpbmVyLCAkKCcuZW1iZWRkZWQtZWRpdG9yLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gRE9NLmFwcGVuZCh0aGlzLmVkaXRvckNvbnRlbnRDb250YWluZXIsICQoJy5lbWJlZGRlZC1lZGl0b3Itb3ZlcmZsb3ctd2lkZ2V0cy5tb25hY28tZWRpdG9yJykpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvdmVyZmxvd1dpZGdldHNEb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yID0gdGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHQuLi5nZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0XHRyZWFkT25seTogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdFx0bGluZU51bWJlcnM6ICdvbicgYXMgY29uc3QsXG5cdFx0XHRcdHdvcmRXcmFwOiAnb24nIGFzIGNvbnN0LFxuXHRcdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRcdGF1dG9tYXRpY0xheW91dDogZmFsc2UsXG5cdFx0XHRcdGZvbGRpbmc6IHRydWUsXG5cdFx0XHRcdHJlbmRlckxpbmVIaWdobGlnaHQ6ICdhbGwnIGFzIGNvbnN0LFxuXHRcdFx0XHRzY3JvbGxiYXI6IHsgdmVydGljYWw6ICdhdXRvJyBhcyBjb25zdCwgaG9yaXpvbnRhbDogJ2F1dG8nIGFzIGNvbnN0IH0sXG5cdFx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHR9LFxuXHRcdFx0eyBpc1NpbXBsZVdpZGdldDogZmFsc2UgfVxuXHRcdCkpO1xuXG5cdFx0dGhpcy51cGRhdGVFZGl0b3JEaXNwbGF5TW9kZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93RW1iZWRkZWRFZGl0b3IodXJpOiBVUkksIGRpc3BsYXlOYW1lOiBzdHJpbmcsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgaXNXb3Jrc3BhY2VGaWxlID0gZmFsc2UsIGlzUmVhZE9ubHkgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZWRpdG9yUmV0dXJuVmlld01vZGUgPSB0aGlzLnZpZXdNb2RlID09PSAnbWlncmF0aW9uJyA/ICdtaWdyYXRpb24nIDogJ2xpc3QnO1xuXHRcdHRoaXMuY3VycmVudE1vZGVsUmVmPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jdXJyZW50TW9kZWxSZWYgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5lZGl0b3JNb2RlbENoYW5nZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVkaXRvclByZXZpZXdSZW5kZXJTY2hlZHVsZXIuY2FuY2VsKCk7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1VyaSA9IHVyaTtcblx0XHR0aGlzLmN1cnJlbnRFZGl0aW5nUHJvamVjdFJvb3QgPSBpc1dvcmtzcGFjZUZpbGUgPyB0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID0gc291cmNlO1xuXHRcdHRoaXMuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlID0gcHJvbXB0VHlwZTtcblx0XHR0aGlzLmN1cnJlbnRFZGl0aW5nUmVhZE9ubHkgPSBpc1JlYWRPbmx5O1xuXHRcdHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPSB0aGlzLmlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQocHJvbXB0VHlwZSkgPyAncHJldmlldycgOiAncmF3Jztcblx0XHR0aGlzLnZpZXdNb2RlID0gJ2VkaXRvcic7XG5cblx0XHR0aGlzLmVkaXRvckl0ZW1OYW1lRWxlbWVudC50ZXh0Q29udGVudCA9IGRpc3BsYXlOYW1lO1xuXHRcdHRoaXMuZWRpdG9ySXRlbVBhdGhFbGVtZW50LnRleHRDb250ZW50ID0gYmFzZW5hbWUodXJpKTtcblx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IGZhbHNlO1xuXHRcdHRoaXMucmVzZXRFZGl0b3JTYXZlSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy51cGRhdGVFZGl0b3JBY3Rpb25CdXR0b24oKTtcblx0XHR0aGlzLnVwZGF0ZUVkaXRvckRpc3BsYXlNb2RlKCk7XG5cdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChzb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiAmJiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0IHx8IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRPckNyZWF0ZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbih1cmkpO1xuXG5cdFx0XHRcdGlmICghaXNFcXVhbCh0aGlzLmN1cnJlbnRFZGl0aW5nVXJpLCB1cmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvciEuc2V0TW9kZWwoc2Vzc2lvbi5tb2RlbCk7XG5cdFx0XHRcdHRoaXMuZW1iZWRkZWRFZGl0b3IhLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogZmFsc2UgfSk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvckNvbnRlbnRDaGFuZ2VkID0gc2Vzc2lvbi5tb2RlbC5nZXRWYWx1ZSgpICE9PSBzZXNzaW9uLm9yaWdpbmFsQ29udGVudDtcblx0XHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50RWRpdG9yUHJldmlldygpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbkJ1dHRvbigpO1xuXG5cdFx0XHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpIHtcblx0XHRcdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yIS5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yTW9kZUJ1dHRvbj8uZm9jdXMoKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZWRpdG9yTW9kZWxDaGFuZ2VEaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbi5tb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvckNvbnRlbnRDaGFuZ2VkID0gc2Vzc2lvbi5tb2RlbC5nZXRWYWx1ZSgpICE9PSBzZXNzaW9uLm9yaWdpbmFsQ29udGVudDtcblx0XHRcdFx0XHR0aGlzLnNjaGVkdWxlQ3VycmVudEVkaXRvclByZXZpZXdSZW5kZXIoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbkJ1dHRvbigpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaSk7XG5cblx0XHRcdGlmICghaXNFcXVhbCh0aGlzLmN1cnJlbnRFZGl0aW5nVXJpLCB1cmkpKSB7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjsgLy8gYW5vdGhlciBpdGVtIHdhcyBzZWxlY3RlZCB3aGlsZSBsb2FkaW5nXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY3VycmVudE1vZGVsUmVmID0gcmVmO1xuXHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvciEuc2V0TW9kZWwocmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpO1xuXHRcdFx0dGhpcy5lbWJlZGRlZEVkaXRvciEudXBkYXRlT3B0aW9ucyh7IHJlYWRPbmx5OiBpc1JlYWRPbmx5IH0pO1xuXHRcdFx0dGhpcy5yZW5kZXJDdXJyZW50RWRpdG9yUHJldmlldygpO1xuXG5cdFx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdyYXcnKSB7XG5cdFx0XHRcdHRoaXMuZW1iZWRkZWRFZGl0b3IhLmZvY3VzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24/LmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VkaXRvckNvbnRlbnRDaGFuZ2VkID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UuaXNEaXJ0eSh1cmkpO1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlbENoYW5nZURpc3Bvc2FibGVzLmFkZChyZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuc2NoZWR1bGVDdXJyZW50RWRpdG9yUHJldmlld1JlbmRlcigpO1xuXHRcdFx0XHR0aGlzLnJlc2V0RWRpdG9yU2F2ZUluZGljYXRvcigpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlbENoYW5nZURpc3Bvc2FibGVzLmFkZCh0aGlzLndvcmtpbmdDb3B5U2VydmljZS5vbkRpZFNhdmUoZSA9PiB7XG5cdFx0XHRcdGlmIChpc0VxdWFsKGUud29ya2luZ0NvcHkucmVzb3VyY2UsIHVyaSkpIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkodXJpKTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2VkaXRvci1zYXZlLWluZGljYXRvciB2aXNpYmxlIHNhdmVkJztcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZWNrKSk7XG5cdFx0XHRcdFx0dGhpcy5lZGl0b3JTYXZlSW5kaWNhdG9yLnRpdGxlID0gbG9jYWxpemUoJ3NhdmVkJywgXCJTYXZlZFwiKTtcblx0XHRcdFx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3Iuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3NhdmVkJywgXCJTYXZlZFwiKSk7XG5cdFx0XHRcdFx0c3RhdHVzKGxvY2FsaXplKCdzYXZlZCcsIFwiU2F2ZWRcIikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBsb2FkIG1vZGVsIGZvciBlbWJlZGRlZCBlZGl0b3I6JywgZXJyb3IpO1xuXHRcdFx0aWYgKGlzRXF1YWwodGhpcy5jdXJyZW50RWRpdGluZ1VyaSwgdXJpKSkge1xuXHRcdFx0XHR0aGlzLmdvQmFja1RvTGlzdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ29CYWNrVG9MaXN0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHJldHVyblZpZXdNb2RlID0gdGhpcy5lZGl0b3JSZXR1cm5WaWV3TW9kZTtcblx0XHR0aGlzLmVkaXRvclJldHVyblZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdGNvbnN0IGZpbGVVcmkgPSB0aGlzLmN1cnJlbnRFZGl0aW5nVXJpO1xuXHRcdGNvbnN0IGJhY2tncm91bmRTYXZlUmVxdWVzdCA9IHRoaXMuY3JlYXRlRXhpc3RpbmdDdXN0b21pemF0aW9uU2F2ZVJlcXVlc3QoKTtcblx0XHRpZiAoYmFja2dyb3VuZFNhdmVSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDdXN0b21pemF0aW9uRWRpdG9yU2F2ZUl0ZW1FdmVudCwgQ3VzdG9taXphdGlvbkVkaXRvclNhdmVJdGVtQ2xhc3NpZmljYXRpb24+KCdjaGF0Q3VzdG9taXphdGlvbkVkaXRvci5zYXZlSXRlbScsIHtcblx0XHRcdFx0cHJvbXB0VHlwZTogdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPz8gJycsXG5cdFx0XHRcdHN0b3JhZ2U6IFN0cmluZyh0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID8/ICcnKSxcblx0XHRcdFx0c2F2ZVRhcmdldDogJ2V4aXN0aW5nJyxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoZmlsZVVyaSAmJiB0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pIHtcblx0XHRcdHRoaXMuZGlzcG9zZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbihmaWxlVXJpKTtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRNb2RlbFJlZj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuY3VycmVudE1vZGVsUmVmID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VycmVudEVkaXRpbmdVcmkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1Byb2plY3RSb290ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VycmVudEVkaXRpbmdTb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXJyZW50RWRpdGluZ1JlYWRPbmx5ID0gZmFsc2U7XG5cdFx0dGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9ICdwcmV2aWV3Jztcblx0XHR0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCA9IGZhbHNlO1xuXHRcdHRoaXMuZWRpdG9yTW9kZWxDaGFuZ2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld1JlbmRlclNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLmNsZWFyRWRpdG9yUHJldmlldygpO1xuXHRcdHRoaXMucmVzZXRFZGl0b3JTYXZlSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy51cGRhdGVFZGl0b3JBY3Rpb25CdXR0b24oKTtcblx0XHR0aGlzLnVwZGF0ZUVkaXRvckRpc3BsYXlNb2RlKCk7XG5cdFx0dGhpcy5lbWJlZGRlZEVkaXRvcj8uc2V0TW9kZWwobnVsbCk7XG5cdFx0dGhpcy52aWV3TW9kZSA9IHJldHVyblZpZXdNb2RlO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdGlmIChyZXR1cm5WaWV3TW9kZSA9PT0gJ21pZ3JhdGlvbicpIHtcblx0XHRcdHRoaXMucmVuZGVyQ3VzdG9taXphdGlvbk1pZ3JhdGlvblBhZ2UoKTtcblx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkluZm8oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUmVmcmVzaCB0aGUgbGlzdCB0byBwaWNrIHVwIG5ld2x5IGNyZWF0ZWQvZWRpdGVkIGZpbGVzXG5cdFx0XHR2b2lkIHRoaXMubGlzdFdpZGdldD8ucmVmcmVzaCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblx0XHRpZiAocmV0dXJuVmlld01vZGUgPT09ICdtaWdyYXRpb24nKSB7XG5cdFx0XHR0aGlzLm1pZ3JhdGlvblNlYXJjaElucHV0Py5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGJhY2tncm91bmRTYXZlUmVxdWVzdCkge1xuXHRcdFx0Y29uc3Qgc2F2ZVJlcXVlc3QgPSBiYWNrZ3JvdW5kU2F2ZVJlcXVlc3Q7XG5cdFx0XHR2b2lkIHRoaXMuc2F2ZUV4aXN0aW5nQ3VzdG9taXphdGlvbihzYXZlUmVxdWVzdCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSBjdXN0b21pemF0aW9uIGNoYW5nZXMgb24gZXhpdDonLCBlcnJvcik7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdzYXZlQ3VzdG9taXphdGlvbk9uRXhpdEZhaWxlZCcsIFwiQ291bGQgbm90IHNhdmUgY2hhbmdlcyB0byB7MH0uXCIsIGJhc2VuYW1lKHNhdmVSZXF1ZXN0LmZpbGVVcmkpKSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIGFzeW5jIGdldE9yQ3JlYXRlQnVpbHRpbkVkaXRpbmdTZXNzaW9uKHVyaTogVVJJKTogUHJvbWlzZTx7IG1vZGVsOiBJVGV4dE1vZGVsOyBvcmlnaW5hbENvbnRlbnQ6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3Qga2V5ID0gdXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMuZ2V0KGtleSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5tb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHtcblx0XHRcdFx0bW9kZWw6IHRoaXMubW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKFxuXHRcdFx0XHRcdGNyZWF0ZVRleHRCdWZmZXJGYWN0b3J5RnJvbVNuYXBzaG90KHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLmNyZWF0ZVNuYXBzaG90KCkpLFxuXHRcdFx0XHRcdHsgbGFuZ3VhZ2VJZDogcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9LFxuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiAnYWktY3VzdG9taXphdGlvbi1idWlsdGluJywgcGF0aDogdXJpLnBhdGgsIHF1ZXJ5OiBnZW5lcmF0ZVV1aWQoKSB9KSxcblx0XHRcdFx0XHRmYWxzZVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRvcmlnaW5hbENvbnRlbnQ6IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsLmdldFZhbHVlKCksXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5idWlsdGluRWRpdGluZ1Nlc3Npb25zLnNldChrZXksIHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCdWlsdGluUHJvbXB0U2F2ZVJlcXVlc3QodGFyZ2V0OiBJU2F2ZVRhcmdldFF1aWNrUGlja0l0ZW0pOiBJQnVpbHRpblByb21wdFNhdmVSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSB0aGlzLmN1cnJlbnRFZGl0aW5nVXJpO1xuXHRcdGNvbnN0IHByb21wdFR5cGUgPSB0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZTtcblx0XHRpZiAoIXNvdXJjZVVyaSB8fCB0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlICE9PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4gfHwgKHByb21wdFR5cGUgIT09IFByb21wdHNUeXBlLnByb21wdCAmJiBwcm9tcHRUeXBlICE9PSBQcm9tcHRzVHlwZS5za2lsbCkgfHwgIXRhcmdldC5mb2xkZXIgfHwgdGFyZ2V0LnRhcmdldCA9PT0gJ2NhbmNlbCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5idWlsdGluRWRpdGluZ1Nlc3Npb25zLmdldChzb3VyY2VVcmkudG9TdHJpbmcoKSk7XG5cdFx0aWYgKCFzZXNzaW9uIHx8ICF0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0YXJnZXQ6IHRhcmdldC50YXJnZXQsXG5cdFx0XHRmb2xkZXI6IHRhcmdldC5mb2xkZXIsXG5cdFx0XHRzb3VyY2VVcmksXG5cdFx0XHRjb250ZW50OiBzZXNzaW9uLm1vZGVsLmdldFZhbHVlKCksXG5cdFx0XHRwcm9tcHRUeXBlLFxuXHRcdFx0cHJvamVjdFJvb3Q6IHRhcmdldC50YXJnZXQgPT09ICd3b3Jrc3BhY2UnID8gdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmdldEFjdGl2ZVByb2plY3RSb290KCkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRXhpc3RpbmdDdXN0b21pemF0aW9uU2F2ZVJlcXVlc3QoKTogSUV4aXN0aW5nQ3VzdG9taXphdGlvblNhdmVSZXF1ZXN0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvckNvbnRlbnRDaGFuZ2VkIHx8IHRoaXMuY3VycmVudEVkaXRpbmdTb3VyY2UgPT09IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiB8fCAhdGhpcy5jdXJyZW50RWRpdGluZ1VyaSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY3VycmVudE1vZGVsUmVmPy5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGZpbGVVcmk6IHRoaXMuY3VycmVudEVkaXRpbmdVcmksXG5cdFx0XHRjb250ZW50OiBtb2RlbC5nZXRWYWx1ZSgpLFxuXHRcdFx0cHJvamVjdFJvb3Q6IHRoaXMuY3VycmVudEVkaXRpbmdQcm9qZWN0Um9vdCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlQnVpbHRpblByb21wdENvcHkocmVxdWVzdDogSUJ1aWx0aW5Qcm9tcHRTYXZlUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCB0YXJnZXRVcmk6IFVSSTtcblx0XHRpZiAocmVxdWVzdC5wcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkge1xuXHRcdFx0Ly8gU2tpbGxzIHVzZSB7c2tpbGxOYW1lfS9TS0lMTC5tZCBkaXJlY3Rvcnkgc3RydWN0dXJlXG5cdFx0XHRjb25zdCBza2lsbEZvbGRlck5hbWUgPSBiYXNlbmFtZShkaXJuYW1lKHJlcXVlc3Quc291cmNlVXJpKSk7XG5cdFx0XHR0YXJnZXRVcmkgPSBVUkkuam9pblBhdGgocmVxdWVzdC5mb2xkZXIsIHNraWxsRm9sZGVyTmFtZSwgYmFzZW5hbWUocmVxdWVzdC5zb3VyY2VVcmkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFyZ2V0VXJpID0gVVJJLmpvaW5QYXRoKHJlcXVlc3QuZm9sZGVyLCBiYXNlbmFtZShyZXF1ZXN0LnNvdXJjZVVyaSkpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcihkaXJuYW1lKHRhcmdldFVyaSkpO1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhyZXF1ZXN0LmNvbnRlbnQpKTtcblx0XHRpZiAocmVxdWVzdC50YXJnZXQgPT09ICd3b3Jrc3BhY2UnICYmIHJlcXVlc3QucHJvamVjdFJvb3QpIHtcblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlU2VydmljZS5jb21taXRGaWxlcyhyZXF1ZXN0LnByb2plY3RSb290LCBbdGFyZ2V0VXJpXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlRXhpc3RpbmdDdXN0b21pemF0aW9uKHJlcXVlc3Q6IElFeGlzdGluZ0N1c3RvbWl6YXRpb25TYXZlUmVxdWVzdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHJlcXVlc3QuZmlsZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhyZXF1ZXN0LmNvbnRlbnQpKTtcblx0XHRpZiAocmVxdWVzdC5wcm9qZWN0Um9vdCkge1xuXHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmNvbW1pdEZpbGVzKHJlcXVlc3QucHJvamVjdFJvb3QsIFtyZXF1ZXN0LmZpbGVVcmldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHBpY2tCdWlsdGluUHJvbXB0U2F2ZVRhcmdldCgpOiBQcm9taXNlPElTYXZlVGFyZ2V0UXVpY2tQaWNrSXRlbSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGl0ZW1zOiBJU2F2ZVRhcmdldFF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGNvbnN0IHByb21wdFR5cGUgPSB0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSA/PyBQcm9tcHRzVHlwZS5wcm9tcHQ7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSByZXNvbHZlV29ya3NwYWNlVGFyZ2V0RGlyZWN0b3J5KHRoaXMud29ya3NwYWNlU2VydmljZSwgcHJvbXB0VHlwZSk7XG5cdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnd29ya3NwYWNlU2F2ZVRhcmdldCcsIFwiV29ya3NwYWNlXCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwod29ya3NwYWNlRm9sZGVyLCB7IHJlbGF0aXZlOiB0cnVlIH0pLFxuXHRcdFx0XHR0YXJnZXQ6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRmb2xkZXI6IHdvcmtzcGFjZUZvbGRlcixcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZXJGb2xkZXIgPSBhd2FpdCByZXNvbHZlVXNlclRhcmdldERpcmVjdG9yeSh0aGlzLnByb21wdHNTZXJ2aWNlLCBwcm9tcHRUeXBlKTtcblx0XHRpZiAodXNlckZvbGRlcikge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndXNlclNhdmVUYXJnZXQnLCBcIlVzZXJcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh1c2VyRm9sZGVyLCB7IHJlbGF0aXZlOiB0cnVlIH0pLFxuXHRcdFx0XHR0YXJnZXQ6ICd1c2VyJyxcblx0XHRcdFx0Zm9sZGVyOiB1c2VyRm9sZGVyLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NhbmNlbFNhdmVUYXJnZXQnLCBcIkNhbmNlbFwiKSxcblx0XHRcdHRhcmdldDogJ2NhbmNlbCcsXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRjYW5QaWNrTWFueTogZmFsc2UsXG5cdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3NhdmVCdWlsdGluQ29weVBsYWNlaG9sZGVyJywgXCJTZWxlY3QgV29ya3NwYWNlLCBVc2VyLCBvciBDYW5jZWxcIiksXG5cdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZUVkaXRvckFjdGlvbkJ1dHRvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5lZGl0b3JBY3Rpb25CdXR0b25JblByb2dyZXNzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b25JblByb2dyZXNzID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZUVkaXRvckFjdGlvbkJ1dHRvbigpO1xuXG5cdFx0bGV0IGJhY2tncm91bmRTYXZlUmVxdWVzdDogSUJ1aWx0aW5Qcm9tcHRTYXZlUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0aWYgKHRoaXMuc2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uKCkpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgdGhpcy5waWNrQnVpbHRpblByb21wdFNhdmVUYXJnZXQoKTtcblx0XHRcdFx0aWYgKCFzZWxlY3Rpb24gfHwgc2VsZWN0aW9uLnRhcmdldCA9PT0gJ2NhbmNlbCcpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYWNrZ3JvdW5kU2F2ZVJlcXVlc3QgPSB0aGlzLmNyZWF0ZUJ1aWx0aW5Qcm9tcHRTYXZlUmVxdWVzdChzZWxlY3Rpb24pO1xuXHRcdFx0XHRpZiAoYmFja2dyb3VuZFNhdmVSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvclNhdmVJdGVtRXZlbnQsIEN1c3RvbWl6YXRpb25FZGl0b3JTYXZlSXRlbUNsYXNzaWZpY2F0aW9uPignY2hhdEN1c3RvbWl6YXRpb25FZGl0b3Iuc2F2ZUl0ZW0nLCB7XG5cdFx0XHRcdFx0XHRwcm9tcHRUeXBlOiB0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSA/PyAnJyxcblx0XHRcdFx0XHRcdHN0b3JhZ2U6IFN0cmluZyh0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID8/ICcnKSxcblx0XHRcdFx0XHRcdHNhdmVUYXJnZXQ6IHNlbGVjdGlvbi50YXJnZXQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5nb0JhY2tUb0xpc3QoKTtcblx0XHRcdGlmIChiYWNrZ3JvdW5kU2F2ZVJlcXVlc3QpIHtcblx0XHRcdFx0Y29uc3Qgc2F2ZVJlcXVlc3QgPSBiYWNrZ3JvdW5kU2F2ZVJlcXVlc3Q7XG5cdFx0XHRcdHZvaWQgdGhpcy5zYXZlQnVpbHRpblByb21wdENvcHkoc2F2ZVJlcXVlc3QpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5saXN0V2lkZ2V0Py5yZWZyZXNoKCk7XG5cdFx0XHRcdH0sIGVycm9yID0+IHtcblx0XHRcdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSBidWlsdC1pbiBvdmVycmlkZTonLCBlcnJvcik7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4oc2F2ZVJlcXVlc3QudGFyZ2V0ID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnc2F2ZUJ1aWx0aW5Db3B5RmFpbGVkV29ya3NwYWNlJywgXCJDb3VsZCBub3Qgc2F2ZSB0aGUgb3ZlcnJpZGUgdG8gdGhlIHdvcmtzcGFjZS5cIilcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3NhdmVCdWlsdGluQ29weUZhaWxlZFVzZXInLCBcIkNvdWxkIG5vdCBzYXZlIHRoZSBvdmVycmlkZSB0byB5b3VyIHVzZXIgZm9sZGVyLlwiKSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmVkaXRvckFjdGlvbkJ1dHRvbkluUHJvZ3Jlc3MgPSBmYWxzZTtcblx0XHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uQnV0dG9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JBY3Rpb25CdXR0b24oKTogdm9pZCB7XG5cdFx0dGhpcy51cGRhdGVJbnB1dERpcnR5U3RhdGUoKTtcblxuXHRcdGlmICghdGhpcy5lZGl0b3JBY3Rpb25CdXR0b24gfHwgIXRoaXMuZWRpdG9yQWN0aW9uQnV0dG9uSWNvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3VsZFNob3dCdWlsdGluU2F2ZUFjdGlvbiA9IHRoaXMuc2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uKCk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b25JY29uLmNsYXNzTmFtZSA9IGBjb2RpY29uIGNvZGljb24tJHtzaG91bGRTaG93QnVpbHRpblNhdmVBY3Rpb24gPyBDb2RpY29uLnNhdmUuaWQgOiBDb2RpY29uLmFycm93TGVmdC5pZH0gZWRpdG9yLWFjdGlvbi1idXR0b24taWNvbmA7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b24uZGlzYWJsZWQgPSB0aGlzLmVkaXRvckFjdGlvbkJ1dHRvbkluUHJvZ3Jlc3M7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgc2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uXG5cdFx0XHQ/IGxvY2FsaXplKCdzYXZlQnVpbHRpbkNvcHlBbmRDaG9vc2VMb2NhdGlvbicsIFwiU2F2ZSBvdmVycmlkZVwiKVxuXHRcdFx0OiB0aGlzLmVkaXRvclJldHVyblZpZXdNb2RlID09PSAnbWlncmF0aW9uJ1xuXHRcdFx0XHQ/ICh0aGlzLmdldEFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5KCk/LmJhY2tMYWJlbCA/PyBsb2NhbGl6ZSgnYmFja1RvQ3VzdG9taXphdGlvbk1pZ3JhdGlvbicsIFwiQmFjayB0byBtaWdyYXRpb25cIikpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2JhY2tUb0xpc3QnLCBcIkJhY2sgdG8gbGlzdFwiKSk7XG5cdFx0dGhpcy5lZGl0b3JBY3Rpb25CdXR0b24udGl0bGUgPSBzaG91bGRTaG93QnVpbHRpblNhdmVBY3Rpb25cblx0XHRcdD8gbG9jYWxpemUoJ3NhdmVCdWlsdGluQ29weUFuZENob29zZUxvY2F0aW9uVG9vbHRpcCcsIFwiU2F2ZSBvdmVycmlkZSAoY2hvb3NlIFdvcmtzcGFjZSwgVXNlciwgb3IgQ2FuY2VsKVwiKVxuXHRcdFx0OiB0aGlzLmVkaXRvclJldHVyblZpZXdNb2RlID09PSAnbWlncmF0aW9uJ1xuXHRcdFx0XHQ/ICh0aGlzLmdldEFjdGl2ZU1pZ3JhdGlvbkNhdGVnb3J5KCk/LmJhY2tMYWJlbCA/PyBsb2NhbGl6ZSgnYmFja1RvQ3VzdG9taXphdGlvbk1pZ3JhdGlvbicsIFwiQmFjayB0byBtaWdyYXRpb25cIikpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2JhY2tUb0xpc3QnLCBcIkJhY2sgdG8gbGlzdFwiKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JDb250ZW50Q2hhbmdlZFxuXHRcdFx0JiYgdGhpcy5jdXJyZW50RWRpdGluZ1NvdXJjZSA9PT0gQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluXG5cdFx0XHQmJiAodGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCB8fCB0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dERpcnR5U3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmlucHV0O1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCkge1xuXHRcdFx0aW5wdXQuc2V0RGlydHkodGhpcy5zaG91bGRTaG93QnVpbHRpblNhdmVBY3Rpb24oKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVCdWlsdGluU2F2ZSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIXRoaXMuc2hvdWxkU2hvd0J1aWx0aW5TYXZlQWN0aW9uKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXQgPSBhd2FpdCB0aGlzLnBpY2tCdWlsdGluUHJvbXB0U2F2ZVRhcmdldCgpO1xuXHRcdGlmICghdGFyZ2V0IHx8IHRhcmdldC50YXJnZXQgPT09ICdjYW5jZWwnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZVJlcXVlc3QgPSB0aGlzLmNyZWF0ZUJ1aWx0aW5Qcm9tcHRTYXZlUmVxdWVzdCh0YXJnZXQpO1xuXHRcdGlmICghc2F2ZVJlcXVlc3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5zYXZlQnVpbHRpblByb21wdENvcHkoc2F2ZVJlcXVlc3QpO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q3VzdG9taXphdGlvbkVkaXRvclNhdmVJdGVtRXZlbnQsIEN1c3RvbWl6YXRpb25FZGl0b3JTYXZlSXRlbUNsYXNzaWZpY2F0aW9uPignY2hhdEN1c3RvbWl6YXRpb25FZGl0b3Iuc2F2ZUl0ZW0nLCB7XG5cdFx0XHRcdHByb21wdFR5cGU6IHRoaXMuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlID8/ICcnLFxuXHRcdFx0XHRzdG9yYWdlOiBTdHJpbmcodGhpcy5jdXJyZW50RWRpdGluZ1NvdXJjZSA/PyAnJyksXG5cdFx0XHRcdHNhdmVUYXJnZXQ6IHRhcmdldC50YXJnZXQsXG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpcy5fZWRpdG9yQ29udGVudENoYW5nZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uQnV0dG9uKCk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gc2F2ZSBidWlsdC1pbiBvdmVycmlkZTonLCBlcnJvcik7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uud2Fybih0YXJnZXQudGFyZ2V0ID09PSAnd29ya3NwYWNlJ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdzYXZlQnVpbHRpbkNvcHlGYWlsZWRXb3Jrc3BhY2UnLCBcIkNvdWxkIG5vdCBzYXZlIHRoZSBvdmVycmlkZSB0byB0aGUgd29ya3NwYWNlLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdzYXZlQnVpbHRpbkNvcHlGYWlsZWRVc2VyJywgXCJDb3VsZCBub3Qgc2F2ZSB0aGUgb3ZlcnJpZGUgdG8geW91ciB1c2VyIGZvbGRlci5cIikpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzZXRFZGl0b3JTYXZlSW5kaWNhdG9yKCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yU2F2ZUluZGljYXRvci5jbGFzc05hbWUgPSAnZWRpdG9yLXNhdmUtaW5kaWNhdG9yJztcblx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IudGl0bGUgPSAnJztcblx0XHR0aGlzLmVkaXRvclNhdmVJbmRpY2F0b3IucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdH1cblxuXHRwcml2YXRlIGlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQocHJvbXB0VHlwZTogUHJvbXB0c1R5cGUgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Q3VzdG9taXphdGlvbnNTdHJ1Y3R1cmVkUHJldmlld0VuYWJsZWQpICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudFxuXHRcdFx0fHwgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGxcblx0XHRcdHx8IHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9uc1xuXHRcdFx0fHwgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0O1xuXHR9XG5cblx0cHJpdmF0ZSBvblN0cnVjdHVyZWRQcmV2aWV3U2V0dGluZ0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmlld01vZGUgIT09ICdlZGl0b3InKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN1cHBvcnRzU3RydWN0dXJlZFByZXZpZXcgPSB0aGlzLmlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQodGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUpO1xuXHRcdGlmICghc3VwcG9ydHNTdHJ1Y3R1cmVkUHJldmlldykge1xuXHRcdFx0dGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9ICdyYXcnO1xuXHRcdFx0dGhpcy5lZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5jbGVhckVkaXRvclByZXZpZXcoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdwcmV2aWV3Jykge1xuXHRcdFx0dGhpcy5lZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlRWRpdG9yRGlzcGxheU1vZGUoKTtcblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEN1cnJlbnRFZGl0aW5nTW9kZWwoKTogSVRleHRNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRFZGl0aW5nVXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4pIHtcblx0XHRcdHJldHVybiB0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMuZ2V0KHRoaXMuY3VycmVudEVkaXRpbmdVcmkudG9TdHJpbmcoKSk/Lm1vZGVsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmN1cnJlbnRNb2RlbFJlZj8ub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlRWRpdG9yRGlzcGxheU1vZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzU3RydWN0dXJlZFByZXZpZXdTdXBwb3J0ZWQodGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9IHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdwcmV2aWV3JyA/ICdyYXcnIDogJ3ByZXZpZXcnO1xuXHRcdGlmICh0aGlzLmVkaXRvckRpc3BsYXlNb2RlID09PSAncHJldmlldycpIHtcblx0XHRcdHRoaXMuZWRpdG9yUHJldmlld1JlbmRlclNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdHRoaXMucmVuZGVyQ3VycmVudEVkaXRvclByZXZpZXcoKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUVkaXRvckRpc3BsYXlNb2RlKCk7XG5cdFx0aWYgKHRoaXMuZGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdyYXcnKSB7XG5cdFx0XHR0aGlzLmVtYmVkZGVkRWRpdG9yPy5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JEaXNwbGF5TW9kZSgpOiB2b2lkIHtcblx0XHRjb25zdCBzdXBwb3J0c1N0cnVjdHVyZWRQcmV2aWV3ID0gdGhpcy5pc1N0cnVjdHVyZWRQcmV2aWV3U3VwcG9ydGVkKHRoaXMuY3VycmVudEVkaXRpbmdQcm9tcHRUeXBlKTtcblx0XHRjb25zdCBzaG93UHJldmlldyA9IHN1cHBvcnRzU3RydWN0dXJlZFByZXZpZXcgJiYgdGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3ByZXZpZXcnO1xuXG5cdFx0aWYgKHRoaXMuZWRpdG9yTW9kZUJ1dHRvbikge1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlQnV0dG9uLnN0eWxlLmRpc3BsYXkgPSBzdXBwb3J0c1N0cnVjdHVyZWRQcmV2aWV3ID8gJycgOiAnbm9uZSc7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24udGV4dENvbnRlbnQgPSB0aGlzLmdldEVkaXRvck1vZGVCdXR0b25MYWJlbCgpO1xuXHRcdFx0dGhpcy5lZGl0b3JNb2RlQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuZ2V0RWRpdG9yTW9kZUJ1dHRvblRvb2x0aXAoKSk7XG5cdFx0XHR0aGlzLmVkaXRvck1vZGVCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpKTtcblx0XHRcdHRoaXMuZWRpdG9yTW9kZUJ1dHRvbi50aXRsZSA9IHRoaXMuZ2V0RWRpdG9yTW9kZUJ1dHRvblRvb2x0aXAoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JQcmV2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmVkaXRvclByZXZpZXdDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHNob3dQcmV2aWV3ID8gJycgOiAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZW1iZWRkZWRFZGl0b3JDb250YWluZXIpIHtcblx0XHRcdHRoaXMuZW1iZWRkZWRFZGl0b3JDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHNob3dQcmV2aWV3ID8gJ25vbmUnIDogJyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JNb2RlQnV0dG9uTGFiZWwoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuaXNTdHJ1Y3R1cmVkUHJldmlld1N1cHBvcnRlZCh0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZWRpdG9yUHJldmlld0J1dHRvbkxhYmVsJywgXCJQcmV2aWV3XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNhbkVkaXRDdXJyZW50UmF3KClcblx0XHRcdD8gbG9jYWxpemUoJ2VkaXRvckVkaXRSYXdCdXR0b25MYWJlbCcsIFwiRWRpdFwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZWRpdG9yVmlld1Jhd0J1dHRvbkxhYmVsJywgXCJWaWV3IFJhd1wiKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWRpdG9yTW9kZUJ1dHRvblRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuaXNTdHJ1Y3R1cmVkUHJldmlld1N1cHBvcnRlZCh0aGlzLmN1cnJlbnRFZGl0aW5nUHJvbXB0VHlwZSkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JEaXNwbGF5TW9kZSA9PT0gJ3JhdycpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZWRpdG9yUHJldmlld0J1dHRvblRvb2x0aXAnLCBcIlNob3cgc3RydWN0dXJlZCBwcmV2aWV3XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmNhbkVkaXRDdXJyZW50UmF3KClcblx0XHRcdD8gbG9jYWxpemUoJ2VkaXRvckVkaXRSYXdCdXR0b25Ub29sdGlwJywgXCJFZGl0IHRoZSByYXcgbWFya2Rvd24gZmlsZVwiKVxuXHRcdFx0OiBsb2NhbGl6ZSgnZWRpdG9yVmlld1Jhd0J1dHRvblRvb2x0aXAnLCBcIlNob3cgdGhlIHJhdyBtYXJrZG93biBmaWxlXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjYW5FZGl0Q3VycmVudFJhdygpOiBib29sZWFuIHtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGU7XG5cdFx0aWYgKCFwcm9tcHRUeXBlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICh0aGlzLmN1cnJlbnRFZGl0aW5nU291cmNlID09PSBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4gJiYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCB8fCBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkpXG5cdFx0XHR8fCAhdGhpcy5jdXJyZW50RWRpdGluZ1JlYWRPbmx5O1xuXHR9XG5cblx0cHJpdmF0ZSBzY2hlZHVsZUN1cnJlbnRFZGl0b3JQcmV2aWV3UmVuZGVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVkaXRvckRpc3BsYXlNb2RlICE9PSAncHJldmlldycpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvclByZXZpZXdSZW5kZXJTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ3VycmVudEVkaXRvclByZXZpZXcoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmdldEN1cnJlbnRFZGl0aW5nTW9kZWwoKTtcblx0XHRjb25zdCBwcm9tcHRUeXBlID0gdGhpcy5jdXJyZW50RWRpdGluZ1Byb21wdFR5cGU7XG5cdFx0aWYgKCFtb2RlbCB8fCAhcHJvbXB0VHlwZSB8fCB0aGlzLmVkaXRvckRpc3BsYXlNb2RlICE9PSAncHJldmlldycgfHwgIXRoaXMuaXNTdHJ1Y3R1cmVkUHJldmlld1N1cHBvcnRlZChwcm9tcHRUeXBlKSkge1xuXHRcdFx0dGhpcy5jbGVhckVkaXRvclByZXZpZXcoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJzZWRQcm9tcHRGaWxlID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsKTtcblx0XHR0aGlzLnJlbmRlckVkaXRvclByZXZpZXcocGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVkaXRvclByZXZpZXcocGFyc2VkUHJvbXB0RmlsZTogUGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lciB8fCAhdGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIgfHwgIXRoaXMuZWRpdG9yUHJldmlld0JvZHlDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvclByZXZpZXdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5lZGl0b3JQcmV2aWV3SXNzdWVzQ29udGFpbmVyKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuZWRpdG9yUHJldmlld0Zyb250TWF0dGVyQ29udGFpbmVyKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuZWRpdG9yUHJldmlld0JvZHlDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gZ2V0VGFyZ2V0KHByb21wdFR5cGUsIHBhcnNlZFByb21wdEZpbGUuaGVhZGVyID8/IHBhcnNlZFByb21wdEZpbGUudXJpKTtcblx0XHR0aGlzLnJlbmRlclByZXZpZXdJc3N1ZXMocGFyc2VkUHJvbXB0RmlsZSk7XG5cdFx0dGhpcy5yZW5kZXJQcmV2aWV3RnJvbnRNYXR0ZXIocGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZSwgdGFyZ2V0KTtcblx0XHR0aGlzLnJlbmRlclByZXZpZXdCb2R5KHBhcnNlZFByb21wdEZpbGUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcmV2aWV3SXNzdWVzKHBhcnNlZFByb21wdEZpbGU6IFBhcnNlZFByb21wdEZpbGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lciB8fCAhcGFyc2VkUHJvbXB0RmlsZS5oZWFkZXI/LmVycm9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc3N1ZXNDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lciwgJCgnLmVkaXRvci1wcmV2aWV3LWlzc3Vlcy1ib3gnKSk7XG5cdFx0RE9NLmFwcGVuZChpc3N1ZXNDb250YWluZXIsICQoJ2Rpdi5lZGl0b3ItcHJldmlldy1pc3N1ZXMtdGl0bGUnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJldmlld0hlYWRlcklzc3Vlc1RpdGxlJywgXCJIZWFkZXIgaXNzdWVzIGRldGVjdGVkXCIpO1xuXHRcdERPTS5hcHBlbmQoaXNzdWVzQ29udGFpbmVyLCAkKCdkaXYuZWRpdG9yLXByZXZpZXctaXNzdWVzLWRlc2NyaXB0aW9uJykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3ByZXZpZXdIZWFkZXJJc3N1ZXNEZXNjcmlwdGlvbicsIFwiU3dpdGNoIHRvIHJhdyB2aWV3IHRvIGZpeCBpbnZhbGlkIG9yIHVuc3VwcG9ydGVkIG1ldGFkYXRhIGVudHJpZXMuXCIpO1xuXHRcdGNvbnN0IGxpc3QgPSBET00uYXBwZW5kKGlzc3Vlc0NvbnRhaW5lciwgJCgndWwuZWRpdG9yLXByZXZpZXctaXNzdWVzLWxpc3QnKSk7XG5cdFx0Zm9yIChjb25zdCBlcnJvciBvZiBwYXJzZWRQcm9tcHRGaWxlLmhlYWRlci5lcnJvcnMpIHtcblx0XHRcdERPTS5hcHBlbmQobGlzdCwgJCgnbGkuZWRpdG9yLXByZXZpZXctaXNzdWVzLWl0ZW0nKSkudGV4dENvbnRlbnQgPSBlcnJvci5tZXNzYWdlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUHJldmlld0Zyb250TWF0dGVyKHBhcnNlZFByb21wdEZpbGU6IFBhcnNlZFByb21wdEZpbGUsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB0YXJnZXQ6IFRhcmdldCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhdHRyaWJ1dGVzID0gcGFyc2VkUHJvbXB0RmlsZS5oZWFkZXI/LmF0dHJpYnV0ZXMgPz8gW107XG5cdFx0aWYgKCFhdHRyaWJ1dGVzLmxlbmd0aCkge1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmVkaXRvclByZXZpZXdGcm9udE1hdHRlckNvbnRhaW5lciwgJCgnZGl2LmVkaXRvci1wcmV2aWV3LWVtcHR5LXN0YXRlJykpLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3ByZXZpZXdOb0Zyb250TWF0dGVyJywgXCJObyBtZXRhZGF0YSBmb3VuZCBpbiB0aGlzIGZpbGUuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgYXR0cmlidXRlIG9mIGF0dHJpYnV0ZXMpIHtcblx0XHRcdHRoaXMucmVuZGVyUHJldmlld0F0dHJpYnV0ZShhdHRyaWJ1dGUsIHByb21wdFR5cGUsIHRhcmdldCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcmV2aWV3QXR0cmlidXRlKGF0dHJpYnV0ZTogSUhlYWRlckF0dHJpYnV0ZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHRhcmdldDogVGFyZ2V0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvclByZXZpZXdGcm9udE1hdHRlckNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJvdyA9IERPTS5hcHBlbmQodGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIsICQoJy5lZGl0b3ItcHJldmlldy1yb3cnKSk7XG5cdFx0Y29uc3QgaGVhZGVyID0gRE9NLmFwcGVuZChyb3csICQoJy5lZGl0b3ItcHJldmlldy1yb3ctaGVhZGVyJykpO1xuXHRcdERPTS5hcHBlbmQoaGVhZGVyLCAkKCdkaXYuZWRpdG9yLXByZXZpZXctcm93LWtleScpKS50ZXh0Q29udGVudCA9IGF0dHJpYnV0ZS5rZXk7XG5cblx0XHRjb25zdCBoZWxwQnV0dG9uID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ2J1dHRvbi5lZGl0b3ItcHJldmlldy1yb3ctaGVscCcpKSBhcyBIVE1MQnV0dG9uRWxlbWVudDtcblx0XHRoZWxwQnV0dG9uLnR5cGUgPSAnYnV0dG9uJztcblx0XHRoZWxwQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdwcmV2aWV3RmllbGRIZWxwQXJpYUxhYmVsJywgXCJTaG93IGhlbHAgZm9yICd7MH0nXCIsIGF0dHJpYnV0ZS5rZXkpKTtcblx0XHRjb25zdCBoZWxwSWNvbiA9IERPTS5hcHBlbmQoaGVscEJ1dHRvbiwgJCgnc3Bhbi5lZGl0b3ItcHJldmlldy1yb3ctaGVscC1pY29uJykpO1xuXHRcdGhlbHBJY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5pbmZvKSk7XG5cdFx0aGVscEljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGdldEF0dHJpYnV0ZURlZmluaXRpb24oYXR0cmlidXRlLmtleSwgcHJvbXB0VHlwZSwgdGFyZ2V0KT8uZGVzY3JpcHRpb24gPz8gbG9jYWxpemUoJ3ByZXZpZXdVbmtub3duRmllbGREZXNjcmlwdGlvbicsIFwiQ3VzdG9tIG1ldGFkYXRhIGZpZWxkIGB7MH1gLlwiLCBhdHRyaWJ1dGUua2V5KTtcblx0XHRjb25zdCBoZWxwSG92ZXIgPSB0aGlzLmVkaXRvclByZXZpZXdEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgaGVscEJ1dHRvbiwge1xuXHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhkZXNjcmlwdGlvbiksXG5cdFx0XHRtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBkZXNjcmlwdGlvbixcblx0XHR9KSk7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoaGVscEJ1dHRvbiwgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aGVscEhvdmVyLnNob3codHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdmFsdWVFbGVtZW50ID0gRE9NLmFwcGVuZChyb3csICQoJ2Rpdi5lZGl0b3ItcHJldmlldy1yb3ctdmFsdWUnKSk7XG5cdFx0Y29uc3QgdmFsdWVUZXh0ID0gdGhpcy5zdHJpbmdpZnlQcmV2aWV3VmFsdWUoYXR0cmlidXRlLnZhbHVlKTtcblx0XHR2YWx1ZUVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZVRleHQ7XG5cdFx0dmFsdWVFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ211bHRpbGluZScsIHZhbHVlVGV4dC5pbmNsdWRlcygnXFxuJykpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQcmV2aWV3Qm9keShwYXJzZWRQcm9tcHRGaWxlOiBQYXJzZWRQcm9tcHRGaWxlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvclByZXZpZXdCb2R5Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYm9keUNvbnRlbnQgPSBwYXJzZWRQcm9tcHRGaWxlLmJvZHk/LmdldENvbnRlbnQoKSA/PyAnJztcblx0XHRpZiAoIWJvZHlDb250ZW50LnRyaW0oKSkge1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmVkaXRvclByZXZpZXdCb2R5Q29udGFpbmVyLCAkKCdkaXYuZWRpdG9yLXByZXZpZXctZW1wdHktc3RhdGUnKSkudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncHJldmlld05vQm9keScsIFwiTm8gbWFya2Rvd24gYm9keSBmb3VuZCBpbiB0aGlzIGZpbGUuXCIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKGJvZHlDb250ZW50LCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdG1hcmtkb3duLmJhc2VVcmkgPSBwYXJzZWRQcm9tcHRGaWxlLnVyaTtcblx0XHRjb25zdCByZW5kZXJlZE1hcmtkb3duID0gdGhpcy5lZGl0b3JQcmV2aWV3RGlzcG9zYWJsZXMuYWRkKHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKG1hcmtkb3duKSk7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3Qm9keUNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJlZE1hcmtkb3duLmVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdHJpbmdpZnlQcmV2aWV3VmFsdWUodmFsdWU6IElWYWx1ZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh2YWx1ZS50eXBlKSB7XG5cdFx0XHRjYXNlICdzY2FsYXInOlxuXHRcdFx0XHRyZXR1cm4gdmFsdWUudmFsdWU7XG5cdFx0XHRjYXNlICdzZXF1ZW5jZSc6XG5cdFx0XHRcdGlmICh2YWx1ZS5pdGVtcy5ldmVyeShpdGVtID0+IGl0ZW0udHlwZSA9PT0gJ3NjYWxhcicpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlLml0ZW1zLm1hcChpdGVtID0+IGl0ZW0udmFsdWUpLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh0aGlzLnRvUHJldmlld09iamVjdCh2YWx1ZSksIG51bGwsIDIpO1xuXHRcdFx0Y2FzZSAnbWFwJzpcblx0XHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHRoaXMudG9QcmV2aWV3T2JqZWN0KHZhbHVlKSwgbnVsbCwgMik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b1ByZXZpZXdPYmplY3QodmFsdWU6IElWYWx1ZSk6IHVua25vd24ge1xuXHRcdHN3aXRjaCAodmFsdWUudHlwZSkge1xuXHRcdFx0Y2FzZSAnc2NhbGFyJzpcblx0XHRcdFx0cmV0dXJuIHZhbHVlLnZhbHVlO1xuXHRcdFx0Y2FzZSAnc2VxdWVuY2UnOlxuXHRcdFx0XHRyZXR1cm4gdmFsdWUuaXRlbXMubWFwKGl0ZW0gPT4gdGhpcy50b1ByZXZpZXdPYmplY3QoaXRlbSkpO1xuXHRcdFx0Y2FzZSAnbWFwJzoge1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHZhbHVlLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRlbnRyaWVzW3Byb3BlcnR5LmtleS52YWx1ZV0gPSB0aGlzLnRvUHJldmlld09iamVjdChwcm9wZXJ0eS52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGVudHJpZXM7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckVkaXRvclByZXZpZXcoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JQcmV2aWV3UmVuZGVyU2NoZWR1bGVyLmNhbmNlbCgpO1xuXHRcdHRoaXMuZWRpdG9yUHJldmlld0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuZWRpdG9yUHJldmlld0lzc3Vlc0NvbnRhaW5lcikge1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmVkaXRvclByZXZpZXdJc3N1ZXNDb250YWluZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIpIHtcblx0XHRcdERPTS5jbGVhck5vZGUodGhpcy5lZGl0b3JQcmV2aWV3RnJvbnRNYXR0ZXJDb250YWluZXIpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lZGl0b3JQcmV2aWV3Qm9keUNvbnRhaW5lcikge1xuXHRcdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmVkaXRvclByZXZpZXdCb2R5Q29udGFpbmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRpc3Bvc2VCdWlsdGluRWRpdGluZ1Nlc3Npb25zKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMudmFsdWVzKCkpIHtcblx0XHRcdHNlc3Npb24ubW9kZWwuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgZGlzcG9zZUJ1aWx0aW5FZGl0aW5nU2Vzc2lvbih1cmk6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLmJ1aWx0aW5FZGl0aW5nU2Vzc2lvbnMuZ2V0KGtleSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2Vzc2lvbi5tb2RlbC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5idWlsdGluRWRpdGluZ1Nlc3Npb25zLmRlbGV0ZShrZXkpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEVtYmVkZGVkIE1DUCBTZXJ2ZXIgRGV0YWlsXG5cblx0cHJpdmF0ZSBjcmVhdGVFbWJlZGRlZE1jcERldGFpbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWNwRGV0YWlsQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciB0aGUgY29tcGFjdCBNQ1AgZGV0YWlsIGNvbXBvbmVudFxuXHRcdGNvbnN0IGRldGFpbEJvZHkgPSBET00uYXBwZW5kKHRoaXMubWNwRGV0YWlsQ29udGFpbmVyLCAkKCcubWNwLWRldGFpbC1lZGl0b3ItY29udGFpbmVyJykpO1xuXG5cdFx0dGhpcy5lbWJlZGRlZE1jcERldGFpbCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1iZWRkZWRNY3BTZXJ2ZXJEZXRhaWwsIGRldGFpbEJvZHkpKTtcblxuXHRcdC8vIEJhY2sgYnV0dG9uIHJlbmRlcmVkIGludG8gdGhlIGRldGFpbCdzIGxlYWRpbmcgc2xvdFxuXHRcdGNvbnN0IGJhY2tCdXR0b24gPSBET00uYXBwZW5kKHRoaXMuZW1iZWRkZWRNY3BEZXRhaWwubGVhZGluZ1Nsb3QsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYmFja1RvTWNwTGlzdCcsIFwiQmFjayB0byBNQ1Agc2VydmVyc1wiKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgYmFja0J1dHRvbiwgbG9jYWxpemUoJ2JhY2tUb01jcExpc3RUb29sdGlwJywgXCJCYWNrIHRvIE1DUCBzZXJ2ZXJzXCIpKSk7XG5cdFx0Y29uc3QgYmFja0ljb25FbCA9IERPTS5hcHBlbmQoYmFja0J1dHRvbiwgJChgLmNvZGljb24uY29kaWNvbi0ke0NvZGljb24uYXJyb3dMZWZ0LmlkfWApKTtcblx0XHRiYWNrSWNvbkVsLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYmFja0J1dHRvbiwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5nb0JhY2tGcm9tTWNwRGV0YWlsKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93RW1iZWRkZWRNY3BEZXRhaWwoc2VydmVyOiBJV29ya2JlbmNoTWNwU2VydmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVtYmVkZGVkTWNwRGV0YWlsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3TW9kZSA9ICdtY3BEZXRhaWwnO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdHRoaXMubWNwRGV0YWlsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVtYmVkZGVkTWNwRGV0YWlsLnNldElucHV0KHNlcnZlcik7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdvQmFja0Zyb21NY3BEZXRhaWwoKTogdm9pZCB7XG5cdFx0dGhpcy5tY3BEZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRNY3BEZXRhaWw/LmNsZWFySW5wdXQoKTtcblx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblx0XHR0aGlzLm1jcExpc3RXaWRnZXQ/LmZvY3VzU2VhcmNoKCk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gRW1iZWRkZWQgUGx1Z2luIERldGFpbFxuXG5cdHByaXZhdGUgY3JlYXRlRW1iZWRkZWRQbHVnaW5EZXRhaWwoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnBsdWdpbkRldGFpbENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnRhaW5lciBmb3IgdGhlIGNvbXBhY3QgcGx1Z2luIGRldGFpbCBjb21wb25lbnRcblx0XHRjb25zdCBkZXRhaWxCb2R5ID0gRE9NLmFwcGVuZCh0aGlzLnBsdWdpbkRldGFpbENvbnRhaW5lciwgJCgnLnBsdWdpbi1kZXRhaWwtZWRpdG9yLWNvbnRhaW5lcicpKTtcblxuXHRcdHRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwgPSB0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVtYmVkZGVkQWdlbnRQbHVnaW5EZXRhaWwsIGRldGFpbEJvZHkpKTtcblxuXHRcdC8vIEJhY2sgYnV0dG9uIHJlbmRlcmVkIGludG8gdGhlIGRldGFpbCdzIGxlYWRpbmcgc2xvdFxuXHRcdGNvbnN0IGJhY2tCdXR0b24gPSBET00uYXBwZW5kKHRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwubGVhZGluZ1Nsb3QsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYmFja1RvUGx1Z2luTGlzdCcsIFwiQmFjayB0byBwbHVnaW5zXCIpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBiYWNrQnV0dG9uLCBsb2NhbGl6ZSgnYmFja1RvUGx1Z2luTGlzdFRvb2x0aXAnLCBcIkJhY2sgdG8gcGx1Z2luc1wiKSkpO1xuXHRcdGNvbnN0IGJhY2tJY29uRWwgPSBET00uYXBwZW5kKGJhY2tCdXR0b24sICQoYC5jb2RpY29uLmNvZGljb24tJHtDb2RpY29uLmFycm93TGVmdC5pZH1gKSk7XG5cdFx0YmFja0ljb25FbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJhY2tCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVBsdWdpbkRldGFpbCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0VtYmVkZGVkUGx1Z2luRGV0YWlsKGl0ZW06IElBZ2VudFBsdWdpbkl0ZW0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdNb2RlID0gJ3BsdWdpbkRldGFpbCc7XG5cdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXG5cdFx0dGhpcy5wbHVnaW5EZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRQbHVnaW5EZXRhaWwuc2V0SW5wdXQoaXRlbSk7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHVibGljIG1ldGhvZCB0byBzaG93IGEgcGx1Z2luIGRldGFpbCBmcm9tIGFueSBzZWN0aW9uIChlLmcuIGZyb20gXCJTaG93IFBsdWdpblwiIGNvbnRleHQgbWVudSkuXG5cdCAqIFNhdmVzIHRoZSBjdXJyZW50IHNlY3Rpb24gc28gdGhlIGJhY2sgYnV0dG9uIHJldHVybnMgdGhlIHVzZXIgdG8gaXQuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgc2hvd1BsdWdpbkRldGFpbChpdGVtOiBJQWdlbnRQbHVnaW5JdGVtKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWRTZWN0aW9uICE9PSBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zKSB7XG5cdFx0XHR0aGlzLnBsdWdpbkRldGFpbFJldHVyblNlY3Rpb24gPSB0aGlzLnNlbGVjdGVkU2VjdGlvbiA/PyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHM7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuc2hvd0VtYmVkZGVkUGx1Z2luRGV0YWlsKGl0ZW0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnb0JhY2tGcm9tUGx1Z2luRGV0YWlsKCk6IHZvaWQge1xuXHRcdHRoaXMucGx1Z2luRGV0YWlsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLmVtYmVkZGVkUGx1Z2luRGV0YWlsPy5jbGVhcklucHV0KCk7XG5cblx0XHRjb25zdCByZXR1cm5TZWN0aW9uID0gdGhpcy5wbHVnaW5EZXRhaWxSZXR1cm5TZWN0aW9uO1xuXHRcdHRoaXMucGx1Z2luRGV0YWlsUmV0dXJuU2VjdGlvbiA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChyZXR1cm5TZWN0aW9uKSB7XG5cdFx0XHQvLyBSZXR1cm4gdG8gdGhlIHNlY3Rpb24gdGhlIHVzZXIgd2FzIG9uIGJlZm9yZSBvcGVuaW5nIHRoZSBwbHVnaW4gZGV0YWlsLlxuXHRcdFx0Ly8gc2VsZWN0U2VjdGlvbiBtYXkgZWFybHktcmV0dXJuIHdoZW4gdGhlIHNlY3Rpb24gaGFzbid0IGNoYW5nZWQsIHNvIGFsd2F5c1xuXHRcdFx0Ly8gZW5zdXJlIHZpZXdNb2RlIGFuZCBjb250ZW50IHZpc2liaWxpdHkgYXJlIHVwZGF0ZWQuXG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXHRcdFx0dGhpcy5zZWxlY3RTZWN0aW9uKHJldHVyblNlY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlID0gJ2xpc3QnO1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZW50VmlzaWJpbGl0eSgpO1xuXHRcdFx0dGhpcy5wbHVnaW5MaXN0V2lkZ2V0Py5mb2N1c1NlYXJjaCgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBFbWJlZGRlZCBUb29sIEV4dGVuc2lvbiBEZXRhaWxcblxuXHRwcml2YXRlIGNyZWF0ZUVtYmVkZGVkVG9vbERldGFpbCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudG9vbHNEZXRhaWxDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb250YWluZXIgZm9yIHRoZSBjb21wYWN0IHRvb2wgZXh0ZW5zaW9uIGRldGFpbCBjb21wb25lbnRcblx0XHRjb25zdCBkZXRhaWxCb2R5ID0gRE9NLmFwcGVuZCh0aGlzLnRvb2xzRGV0YWlsQ29udGFpbmVyLCAkKCcudG9vbHMtZGV0YWlsLWVkaXRvci1jb250YWluZXInKSk7XG5cblx0XHR0aGlzLmVtYmVkZGVkVG9vbERldGFpbCA9IHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1iZWRkZWRFeHRlbnNpb25Ub29sc0RldGFpbCwgZGV0YWlsQm9keSkpO1xuXG5cdFx0Ly8gQmFjayBidXR0b24gcmVuZGVyZWQgaW50byB0aGUgZGV0YWlsJ3MgbGVhZGluZyBzbG90XG5cdFx0Y29uc3QgYmFja0J1dHRvbiA9IERPTS5hcHBlbmQodGhpcy5lbWJlZGRlZFRvb2xEZXRhaWwubGVhZGluZ1Nsb3QsICQoJ2J1dHRvbi5lZGl0b3ItYmFjay1idXR0b24nKSk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0YmFja0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYmFja1RvVG9vbHNMaXN0JywgXCJCYWNrIHRvIHRvb2xzXCIpKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBiYWNrQnV0dG9uLCBsb2NhbGl6ZSgnYmFja1RvVG9vbHNMaXN0VG9vbHRpcCcsIFwiQmFjayB0byB0b29sc1wiKSkpO1xuXHRcdGNvbnN0IGJhY2tJY29uRWwgPSBET00uYXBwZW5kKGJhY2tCdXR0b24sICQoYC5jb2RpY29uLmNvZGljb24tJHtDb2RpY29uLmFycm93TGVmdC5pZH1gKSk7XG5cdFx0YmFja0ljb25FbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJhY2tCdXR0b24sICdjbGljaycsICgpID0+IHtcblx0XHRcdHRoaXMuZ29CYWNrRnJvbVRvb2xEZXRhaWwoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dFbWJlZGRlZFRvb2xEZXRhaWwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmVtYmVkZGVkVG9vbERldGFpbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmlld01vZGUgPSAndG9vbHNEZXRhaWwnO1xuXHRcdHRoaXMudXBkYXRlQ29udGVudFZpc2liaWxpdHkoKTtcblxuXHRcdHRoaXMudG9vbHNEZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRUb29sRGV0YWlsLnNldElucHV0KGV4dGVuc2lvbik7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdvQmFja0Zyb21Ub29sRGV0YWlsKCk6IHZvaWQge1xuXHRcdHRoaXMudG9vbHNEZXRhaWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW1iZWRkZWRUb29sRGV0YWlsPy5jbGVhcklucHV0KCk7XG5cdFx0dGhpcy52aWV3TW9kZSA9ICdsaXN0Jztcblx0XHR0aGlzLnVwZGF0ZUNvbnRlbnRWaXNpYmlsaXR5KCk7XG5cblx0XHRpZiAodGhpcy5kaW1lbnNpb24pIHtcblx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHR9XG5cdFx0dGhpcy50b29sc0xpc3RXaWRnZXQ/LmZvY3VzU2Vh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
