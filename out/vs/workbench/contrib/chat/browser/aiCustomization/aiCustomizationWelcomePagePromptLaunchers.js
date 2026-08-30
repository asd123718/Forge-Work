import "./media/aiCustomizationWelcomePromptLaunchers.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { DomScrollableElement } from "../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../../base/common/scrollable.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { AICustomizationManagementSection } from "./aiCustomizationManagement.js";
import { agentIcon, instructionsIcon, pluginIcon, skillIcon, hookIcon, toolsIcon } from "./aiCustomizationIcons.js";
import { PromptsType } from "../../common/promptSyntax/promptTypes.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID, CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID } from "../actions/configureVoiceInstructionsAction.js";
const $ = DOM.$;
class PromptLaunchersAICustomizationWelcomePage extends Disposable {
  constructor(parent, welcomePageFeatures, callbacks, commandService, workspaceService, hoverService, harnessLabel) {
    super();
    this.welcomePageFeatures = welcomePageFeatures;
    this.callbacks = callbacks;
    this.commandService = commandService;
    this.workspaceService = workspaceService;
    this.hoverService = hoverService;
    this.harnessLabel = harnessLabel;
    this.cardDisposables = this._register(new DisposableStore());
    this.visibleSectionIds = /* @__PURE__ */ new Set();
    this.migrationCategories = [];
    this.categoryDescriptions = [
      {
        id: AICustomizationManagementSection.Agents,
        label: localize("agents", "Agents"),
        icon: agentIcon,
        description: localize("agentsDesc", "Define custom agents with specialized personas, tool access, and instructions for specific tasks."),
        promptType: PromptsType.agent
      },
      {
        id: AICustomizationManagementSection.Skills,
        label: localize("skills", "Skills"),
        icon: skillIcon,
        description: localize("skillsDesc", "Create reusable skill files that provide domain-specific knowledge and workflows."),
        promptType: PromptsType.skill
      },
      {
        id: AICustomizationManagementSection.Instructions,
        label: localize("instructions", "Instructions"),
        icon: instructionsIcon,
        description: localize("instructionsDesc", "Set always-on instructions that guide AI behavior across your workspace or user profile."),
        promptType: PromptsType.instructions
      },
      {
        id: AICustomizationManagementSection.Hooks,
        label: localize("hooks", "Hooks"),
        icon: hookIcon,
        description: localize("hooksDesc", "Configure automated actions triggered by events like saving files or running tasks."),
        promptType: PromptsType.hook
      },
      {
        id: AICustomizationManagementSection.McpServers,
        label: localize("mcpServers", "MCP Servers"),
        icon: Codicon.server,
        description: localize("mcpServersDesc", "Connect external tool servers that extend AI capabilities with custom tools and data sources.")
      },
      {
        id: AICustomizationManagementSection.Plugins,
        label: localize("plugins", "Plugins"),
        icon: pluginIcon,
        description: localize("pluginsDesc", "Install and manage agent plugins that add additional tools, skills, and integrations.")
      },
      {
        id: AICustomizationManagementSection.Tools,
        label: localize("tools", "Tools"),
        icon: toolsIcon,
        description: localize("toolsDesc", "Enable or disable the tools available to chat.")
      }
    ];
    this.standaloneCustomizations = [
      {
        label: localize("voiceModeInstructions", "Voice Mode Instructions"),
        icon: Codicon.voiceMode,
        description: localize("voiceModeInstructionsDesc", "Customize Voice Mode behavior and terminology with voice.md."),
        commandId: CONFIGURE_VOICE_INSTRUCTIONS_ACTION_ID
      },
      {
        label: localize("dictationInstructions", "Dictation Instructions"),
        icon: Codicon.mic,
        description: localize("dictationInstructionsDesc", "Customize Dictation terminology and transcript formatting with dictation.md."),
        commandId: CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID
      }
    ];
    this.container = $(".welcome-prompts-content-container");
    this.scrollable = this._register(new DomScrollableElement(this.container, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto,
      useShadows: false
    }));
    const scrollableNode = this.scrollable.getDomNode();
    scrollableNode.classList.add("welcome-prompts-scrollable");
    parent.appendChild(scrollableNode);
    const resizeObserver = this._register(new DOM.DisposableResizeObserver("AICustomizationWelcomePagePromptLaunchers.scrollable", () => this.scrollable.scanDomNode()));
    this._register(resizeObserver.observe(scrollableNode));
    const welcomeInner = DOM.append(this.container, $(".welcome-prompts-inner"));
    this.heading = DOM.append(welcomeInner, $("h2.welcome-prompts-heading"));
    this.updateHeading();
    const subtitle = DOM.append(welcomeInner, $("p.welcome-prompts-subtitle"));
    subtitle.textContent = localize("welcomeSubtitle", "Tailor how agents work in your projects. Configure workspace customizations for the entire team, or create personal ones that follow you across projects.");
    if (this.welcomePageFeatures?.showGettingStartedBanner !== false) {
      const gettingStarted = DOM.append(welcomeInner, $(".welcome-prompts-primary"));
      const header = DOM.append(gettingStarted, $(".welcome-prompts-section-label"));
      const icon = DOM.append(header, $("span.welcome-prompts-section-label-icon.codicon.codicon-sparkle"));
      icon.setAttribute("aria-hidden", "true");
      const title = DOM.append(header, $("span"));
      title.textContent = localize("gettingStartedTitle", "Customize Your Agent");
      const description = DOM.append(gettingStarted, $("p.welcome-prompts-input-helper"));
      description.textContent = localize("gettingStartedDesc", "Describe your preferences and conventions to draft agents, skills, and instructions.");
      const inputRow = DOM.append(gettingStarted, $(".welcome-prompts-input-row"));
      this.inputRow = inputRow;
      this.inputElement = DOM.append(inputRow, $("input.welcome-prompts-input"));
      this.inputElement.type = "text";
      this.inputElement.placeholder = localize("workflowInputPlaceholder", "Prefer concise commits, thorough reviews, and tested code...");
      this.inputElement.setAttribute("aria-label", localize("workflowInputAriaLabel", "Describe your preferences to customize your agent"));
      const submitBtn = DOM.append(inputRow, $("button.welcome-prompts-input-submit"));
      this.submitBtn = submitBtn;
      submitBtn.setAttribute("aria-label", localize("workflowSubmitAriaLabel", "Customize agent"));
      this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), submitBtn, localize("workflowSubmitTooltip", "Open in Chat")));
      const chevron = DOM.append(submitBtn, $("span.codicon.codicon-arrow-up"));
      chevron.setAttribute("aria-hidden", "true");
      const updateSubmitState = () => {
        const hasValue = !!this.inputElement?.value?.trim();
        submitBtn.disabled = !hasValue;
        submitBtn.classList.toggle("welcome-prompts-input-submit-disabled", !hasValue);
      };
      const submit = () => {
        const value = this.inputElement?.value?.trim();
        if (!value) {
          return;
        }
        let query;
        if (this.workspaceService.isSessionsWindow) {
          query = `Generate agent customizations. ${value}`;
        } else {
          query = `/init ${value}`;
        }
        if (this.inputElement) {
          this.inputElement.value = "";
        }
        updateSubmitState();
        inputRow.classList.add("sent");
        submitBtn.style.display = "none";
        if (this.sentLabel) {
          this.sentLabel.remove();
        }
        this.sentLabel = DOM.append(inputRow, $("span.welcome-prompts-sent-label"));
        this.sentLabel.textContent = localize("sentToChat", "Sent to chat \u2713");
        this.callbacks.prefillChat(query, { isPartialQuery: false, newChat: true });
      };
      this._register(DOM.addDisposableListener(submitBtn, "click", (e) => {
        e.stopPropagation();
        submit();
      }));
      this._register(DOM.addDisposableListener(this.inputElement, "keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }));
      this._register(DOM.addDisposableListener(this.inputElement, "input", () => {
        updateSubmitState();
        this._clearSentState();
      }));
      updateSubmitState();
    }
    this.cardsContainer = DOM.append(welcomeInner, $(".welcome-prompts-cards"));
  }
  _clearSentState() {
    if (this.sentLabel) {
      this.sentLabel.remove();
      this.sentLabel = void 0;
    }
    if (this.submitBtn) {
      this.submitBtn.style.display = "";
    }
    if (this.inputRow) {
      this.inputRow.classList.remove("sent");
    }
  }
  reset() {
    this._clearSentState();
  }
  rebuildCards(visibleSectionIds) {
    if (!this.cardsContainer) {
      return;
    }
    this.visibleSectionIds = new Set(visibleSectionIds);
    this.cardDisposables.clear();
    DOM.clearNode(this.cardsContainer);
    this.firstCard = void 0;
    for (const category of this.categoryDescriptions) {
      if (!visibleSectionIds.has(category.id)) {
        continue;
      }
      const card = DOM.append(this.cardsContainer, $(".welcome-prompts-card"));
      card.setAttribute("tabindex", "0");
      card.setAttribute("role", "button");
      if (!this.firstCard) {
        this.firstCard = card;
      }
      const cardHeader = DOM.append(card, $(".welcome-prompts-card-header"));
      const iconEl = DOM.append(cardHeader, $(".welcome-prompts-card-icon"));
      iconEl.classList.add(...ThemeIcon.asClassNameArray(category.icon));
      const labelEl = DOM.append(cardHeader, $("span.welcome-prompts-card-label"));
      labelEl.textContent = category.label;
      const descEl = DOM.append(card, $("p.welcome-prompts-card-description"));
      descEl.textContent = category.description;
      const footer = DOM.append(card, $(".welcome-prompts-card-footer"));
      if (category.promptType) {
        const generateBtn = DOM.append(footer, $("button.welcome-prompts-card-action"));
        generateBtn.textContent = localize("new", "New...");
        generateBtn.setAttribute("aria-label", localize("newCategoryAriaLabel", "New {0}...", category.label));
        this.cardDisposables.add(DOM.addDisposableListener(generateBtn, "click", (e) => {
          e.stopPropagation();
          this.callbacks.closeEditor();
          if (this.workspaceService.isSessionsWindow) {
            const typeLabel = category.label.toLowerCase().replace(/s$/, "");
            this.callbacks.prefillChat(`Create me a custom ${typeLabel} that `, { isPartialQuery: true, newChat: true });
          } else {
            this.workspaceService.generateCustomization(category.promptType);
          }
        }));
      } else {
        const browseBtn = DOM.append(footer, $("button.welcome-prompts-card-action"));
        browseBtn.textContent = localize("browse", "Browse...");
        browseBtn.setAttribute("aria-label", localize("browseCategoryAriaLabel", "Browse {0}...", category.label));
        this.cardDisposables.add(DOM.addDisposableListener(browseBtn, "click", (e) => {
          e.stopPropagation();
          this.callbacks.selectSectionWithMarketplace(category.id);
        }));
      }
      this.cardDisposables.add(DOM.addDisposableListener(card, "click", () => {
        this.callbacks.selectSection(category.id);
      }));
      this.cardDisposables.add(DOM.addDisposableListener(card, "keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.callbacks.selectSection(category.id);
        }
      }));
    }
    if (!this.workspaceService.isSessionsWindow) {
      for (const customization of this.standaloneCustomizations) {
        this.renderStandaloneCustomization(customization);
      }
    }
    for (const category of this.migrationCategories) {
      this.renderCustomizationMigrationCard(category);
    }
    this.scrollable.scanDomNode();
  }
  renderStandaloneCustomization(customization) {
    if (!this.cardsContainer) {
      return;
    }
    const card = DOM.append(this.cardsContainer, $(".welcome-prompts-card"));
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");
    if (!this.firstCard) {
      this.firstCard = card;
    }
    const cardHeader = DOM.append(card, $(".welcome-prompts-card-header"));
    const iconEl = DOM.append(cardHeader, $(".welcome-prompts-card-icon"));
    iconEl.classList.add(...ThemeIcon.asClassNameArray(customization.icon));
    const labelEl = DOM.append(cardHeader, $("span.welcome-prompts-card-label"));
    labelEl.textContent = customization.label;
    const descEl = DOM.append(card, $("p.welcome-prompts-card-description"));
    descEl.textContent = customization.description;
    const footer = DOM.append(card, $(".welcome-prompts-card-footer"));
    const configureButton = DOM.append(footer, $("button.welcome-prompts-card-action"));
    configureButton.textContent = localize("configure", "Configure...");
    configureButton.setAttribute("aria-label", localize("configureCategoryAriaLabel", "Configure {0}...", customization.label));
    const configure = () => {
      void this.commandService.executeCommand(customization.commandId);
    };
    this.cardDisposables.add(DOM.addDisposableListener(configureButton, "click", (e) => {
      e.stopPropagation();
      configure();
    }));
    this.cardDisposables.add(DOM.addDisposableListener(card, "click", configure));
    this.cardDisposables.add(DOM.addDisposableListener(card, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        configure();
      }
    }));
  }
  setMigrationCategories(categories) {
    const didChange = categories.length !== this.migrationCategories.length || categories.some((category, index) => {
      const previous = this.migrationCategories[index];
      return previous.id !== category.id || previous.count !== category.count || previous.description !== category.description;
    });
    this.migrationCategories = categories;
    if (didChange) {
      this.rebuildCards(this.visibleSectionIds);
    }
  }
  setHarnessLabel(label) {
    if (this.harnessLabel === label) {
      return;
    }
    this.harnessLabel = label;
    this.updateHeading();
  }
  updateHeading() {
    if (this.heading) {
      this.heading.textContent = localize("welcomeHeadingWithHarness", "Agent Customizations for {0}", this.harnessLabel);
    }
  }
  renderCustomizationMigrationCard(category) {
    if (!this.cardsContainer) {
      return;
    }
    const migrationCard = DOM.append(this.cardsContainer, $(".welcome-prompts-card.welcome-prompts-migration-card"));
    const cardHeader = DOM.append(migrationCard, $(".welcome-prompts-card-header"));
    const iconEl = DOM.append(cardHeader, $(".welcome-prompts-card-icon"));
    iconEl.classList.add(...ThemeIcon.asClassNameArray(Codicon.sync));
    const labelEl = DOM.append(cardHeader, $("span.welcome-prompts-card-label"));
    labelEl.textContent = category.label;
    const descEl = DOM.append(migrationCard, $("p.welcome-prompts-card-description"));
    descEl.textContent = category.description;
    const footer = DOM.append(migrationCard, $(".welcome-prompts-card-footer"));
    const migrateBtn = DOM.append(footer, $("button.welcome-prompts-card-action"));
    migrateBtn.textContent = category.actionLabel;
    migrateBtn.setAttribute("aria-label", category.actionAriaLabel);
    if (!this.firstCard) {
      this.firstCard = migrateBtn;
    }
    this.cardDisposables.add(DOM.addDisposableListener(migrateBtn, "click", () => this.callbacks.migrateCustomizations(category.id)));
  }
  focus() {
    if (this.inputElement) {
      this.inputElement.focus();
      return;
    }
    this.firstCard?.focus();
  }
}
export {
  PromptLaunchersAICustomizationWelcomePage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2VQcm9tcHRMYXVuY2hlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWlDdXN0b21pemF0aW9uV2VsY29tZVByb21wdExhdW5jaGVycy5jc3MnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB0eXBlIHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IGFnZW50SWNvbiwgaW5zdHJ1Y3Rpb25zSWNvbiwgcGx1Z2luSWNvbiwgc2tpbGxJY29uLCBob29rSWNvbiwgdG9vbHNJY29uIH0gZnJvbSAnLi9haUN1c3RvbWl6YXRpb25JY29ucy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwgSVdlbGNvbWVQYWdlRmVhdHVyZXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2VJbXBsZW1lbnRhdGlvbiwgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeVN1bW1hcnksIElXZWxjb21lUGFnZUNhbGxiYWNrcyB9IGZyb20gJy4vYWlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2UuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgQ09ORklHVVJFX0RJQ1RBVElPTl9JTlNUUlVDVElPTlNfQUNUSU9OX0lELCBDT05GSUdVUkVfVk9JQ0VfSU5TVFJVQ1RJT05TX0FDVElPTl9JRCB9IGZyb20gJy4uL2FjdGlvbnMvY29uZmlndXJlVm9pY2VJbnN0cnVjdGlvbnNBY3Rpb24uanMnO1xuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmludGVyZmFjZSBJUHJvbXB0TGF1bmNoZXJzQ2F0ZWdvcnlEZXNjcmlwdGlvbiB7XG5cdHJlYWRvbmx5IGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbjtcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogVGhlbWVJY29uO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9tcHRUeXBlPzogUHJvbXB0c1R5cGU7XG59XG5cbmludGVyZmFjZSBJU3RhbmRhbG9uZUN1c3RvbWl6YXRpb25EZXNjcmlwdGlvbiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZztcblx0cmVhZG9ubHkgY29tbWFuZElkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBQcm9tcHRMYXVuY2hlcnNBSUN1c3RvbWl6YXRpb25XZWxjb21lUGFnZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQUlDdXN0b21pemF0aW9uV2VsY29tZVBhZ2VJbXBsZW1lbnRhdGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYXJkRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Nyb2xsYWJsZTogRG9tU2Nyb2xsYWJsZUVsZW1lbnQ7XG5cdHByaXZhdGUgY2FyZHNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGZpcnN0Q2FyZDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVhZGluZzogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaW5wdXRFbGVtZW50OiBIVE1MSW5wdXRFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZpc2libGVTZWN0aW9uSWRzID0gbmV3IFNldDxBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbj4oKTtcblxuXHRwcml2YXRlIHNlbnRMYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3VibWl0QnRuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBpbnB1dFJvdzogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWlncmF0aW9uQ2F0ZWdvcmllczogcmVhZG9ubHkgSUN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXRlZ29yeVN1bW1hcnlbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2F0ZWdvcnlEZXNjcmlwdGlvbnM6IElQcm9tcHRMYXVuY2hlcnNDYXRlZ29yeURlc2NyaXB0aW9uW10gPSBbXG5cdFx0e1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRzJywgXCJBZ2VudHNcIiksXG5cdFx0XHRpY29uOiBhZ2VudEljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50c0Rlc2MnLCBcIkRlZmluZSBjdXN0b20gYWdlbnRzIHdpdGggc3BlY2lhbGl6ZWQgcGVyc29uYXMsIHRvb2wgYWNjZXNzLCBhbmQgaW5zdHJ1Y3Rpb25zIGZvciBzcGVjaWZpYyB0YXNrcy5cIiksXG5cdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3NraWxscycsIFwiU2tpbGxzXCIpLFxuXHRcdFx0aWNvbjogc2tpbGxJY29uLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdza2lsbHNEZXNjJywgXCJDcmVhdGUgcmV1c2FibGUgc2tpbGwgZmlsZXMgdGhhdCBwcm92aWRlIGRvbWFpbi1zcGVjaWZpYyBrbm93bGVkZ2UgYW5kIHdvcmtmbG93cy5cIiksXG5cdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RydWN0aW9ucycsIFwiSW5zdHJ1Y3Rpb25zXCIpLFxuXHRcdFx0aWNvbjogaW5zdHJ1Y3Rpb25zSWNvbixcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zRGVzYycsIFwiU2V0IGFsd2F5cy1vbiBpbnN0cnVjdGlvbnMgdGhhdCBndWlkZSBBSSBiZWhhdmlvciBhY3Jvc3MgeW91ciB3b3Jrc3BhY2Ugb3IgdXNlciBwcm9maWxlLlwiKSxcblx0XHRcdHByb21wdFR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaG9va3MnLCBcIkhvb2tzXCIpLFxuXHRcdFx0aWNvbjogaG9va0ljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2hvb2tzRGVzYycsIFwiQ29uZmlndXJlIGF1dG9tYXRlZCBhY3Rpb25zIHRyaWdnZXJlZCBieSBldmVudHMgbGlrZSBzYXZpbmcgZmlsZXMgb3IgcnVubmluZyB0YXNrcy5cIiksXG5cdFx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZS5ob29rLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ21jcFNlcnZlcnMnLCBcIk1DUCBTZXJ2ZXJzXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zZXJ2ZXIsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21jcFNlcnZlcnNEZXNjJywgXCJDb25uZWN0IGV4dGVybmFsIHRvb2wgc2VydmVycyB0aGF0IGV4dGVuZCBBSSBjYXBhYmlsaXRpZXMgd2l0aCBjdXN0b20gdG9vbHMgYW5kIGRhdGEgc291cmNlcy5cIiksXG5cdFx0fSxcblx0XHR7XG5cdFx0XHRpZDogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGx1Z2lucycsIFwiUGx1Z2luc1wiKSxcblx0XHRcdGljb246IHBsdWdpbkljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3BsdWdpbnNEZXNjJywgXCJJbnN0YWxsIGFuZCBtYW5hZ2UgYWdlbnQgcGx1Z2lucyB0aGF0IGFkZCBhZGRpdGlvbmFsIHRvb2xzLCBza2lsbHMsIGFuZCBpbnRlZ3JhdGlvbnMuXCIpLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlRvb2xzLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCd0b29scycsIFwiVG9vbHNcIiksXG5cdFx0XHRpY29uOiB0b29sc0ljb24sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2xzRGVzYycsIFwiRW5hYmxlIG9yIGRpc2FibGUgdGhlIHRvb2xzIGF2YWlsYWJsZSB0byBjaGF0LlwiKSxcblx0XHR9LFxuXHRdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RhbmRhbG9uZUN1c3RvbWl6YXRpb25zOiBJU3RhbmRhbG9uZUN1c3RvbWl6YXRpb25EZXNjcmlwdGlvbltdID0gW1xuXHRcdHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlSW5zdHJ1Y3Rpb25zJywgXCJWb2ljZSBNb2RlIEluc3RydWN0aW9uc1wiKSxcblx0XHRcdGljb246IENvZGljb24udm9pY2VNb2RlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2b2ljZU1vZGVJbnN0cnVjdGlvbnNEZXNjJywgXCJDdXN0b21pemUgVm9pY2UgTW9kZSBiZWhhdmlvciBhbmQgdGVybWlub2xvZ3kgd2l0aCB2b2ljZS5tZC5cIiksXG5cdFx0XHRjb21tYW5kSWQ6IENPTkZJR1VSRV9WT0lDRV9JTlNUUlVDVElPTlNfQUNUSU9OX0lELFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaWN0YXRpb25JbnN0cnVjdGlvbnMnLCBcIkRpY3RhdGlvbiBJbnN0cnVjdGlvbnNcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLm1pYyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGljdGF0aW9uSW5zdHJ1Y3Rpb25zRGVzYycsIFwiQ3VzdG9taXplIERpY3RhdGlvbiB0ZXJtaW5vbG9neSBhbmQgdHJhbnNjcmlwdCBmb3JtYXR0aW5nIHdpdGggZGljdGF0aW9uLm1kLlwiKSxcblx0XHRcdGNvbW1hbmRJZDogQ09ORklHVVJFX0RJQ1RBVElPTl9JTlNUUlVDVElPTlNfQUNUSU9OX0lELFxuXHRcdH0sXG5cdF07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdlbGNvbWVQYWdlRmVhdHVyZXM6IElXZWxjb21lUGFnZUZlYXR1cmVzIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY2FsbGJhY2tzOiBJV2VsY29tZVBhZ2VDYWxsYmFja3MsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlU2VydmljZTogSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBoYXJuZXNzTGFiZWw6IHN0cmluZyxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gJCgnLndlbGNvbWUtcHJvbXB0cy1jb250ZW50LWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0aGlzLmNvbnRhaW5lciwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IHNjcm9sbGFibGVOb2RlID0gdGhpcy5zY3JvbGxhYmxlLmdldERvbU5vZGUoKTtcblx0XHRzY3JvbGxhYmxlTm9kZS5jbGFzc0xpc3QuYWRkKCd3ZWxjb21lLXByb21wdHMtc2Nyb2xsYWJsZScpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChzY3JvbGxhYmxlTm9kZSk7XG5cblx0XHQvLyBSZS1zY2FuIHdoZW5ldmVyIHRoZSB3cmFwcGVyIGNoYW5nZXMgc2l6ZSBzbyB0aGUgc2Nyb2xsYmFyIHJlZmxlY3RzXG5cdFx0Ly8gdGhlIGN1cnJlbnQgb3ZlcmZsb3cgc3RhdGUuIHJlYnVpbGRDYXJkcygpIHNjYW5zIGFmdGVyIGNvbnRlbnQgY2hhbmdlcy5cblx0XHRjb25zdCByZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBET00uRGlzcG9zYWJsZVJlc2l6ZU9ic2VydmVyKCdBSUN1c3RvbWl6YXRpb25XZWxjb21lUGFnZVByb21wdExhdW5jaGVycy5zY3JvbGxhYmxlJywgKCkgPT4gdGhpcy5zY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNpemVPYnNlcnZlci5vYnNlcnZlKHNjcm9sbGFibGVOb2RlKSk7XG5cblx0XHRjb25zdCB3ZWxjb21lSW5uZXIgPSBET00uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWlubmVyJykpO1xuXG5cdFx0dGhpcy5oZWFkaW5nID0gRE9NLmFwcGVuZCh3ZWxjb21lSW5uZXIsICQoJ2gyLndlbGNvbWUtcHJvbXB0cy1oZWFkaW5nJykpO1xuXHRcdHRoaXMudXBkYXRlSGVhZGluZygpO1xuXG5cdFx0Y29uc3Qgc3VidGl0bGUgPSBET00uYXBwZW5kKHdlbGNvbWVJbm5lciwgJCgncC53ZWxjb21lLXByb21wdHMtc3VidGl0bGUnKSk7XG5cdFx0c3VidGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnd2VsY29tZVN1YnRpdGxlJywgXCJUYWlsb3IgaG93IGFnZW50cyB3b3JrIGluIHlvdXIgcHJvamVjdHMuIENvbmZpZ3VyZSB3b3Jrc3BhY2UgY3VzdG9taXphdGlvbnMgZm9yIHRoZSBlbnRpcmUgdGVhbSwgb3IgY3JlYXRlIHBlcnNvbmFsIG9uZXMgdGhhdCBmb2xsb3cgeW91IGFjcm9zcyBwcm9qZWN0cy5cIik7XG5cblx0XHRpZiAodGhpcy53ZWxjb21lUGFnZUZlYXR1cmVzPy5zaG93R2V0dGluZ1N0YXJ0ZWRCYW5uZXIgIT09IGZhbHNlKSB7XG5cdFx0XHRjb25zdCBnZXR0aW5nU3RhcnRlZCA9IERPTS5hcHBlbmQod2VsY29tZUlubmVyLCAkKCcud2VsY29tZS1wcm9tcHRzLXByaW1hcnknKSk7XG5cdFx0XHRjb25zdCBoZWFkZXIgPSBET00uYXBwZW5kKGdldHRpbmdTdGFydGVkLCAkKCcud2VsY29tZS1wcm9tcHRzLXNlY3Rpb24tbGFiZWwnKSk7XG5cdFx0XHRjb25zdCBpY29uID0gRE9NLmFwcGVuZChoZWFkZXIsICQoJ3NwYW4ud2VsY29tZS1wcm9tcHRzLXNlY3Rpb24tbGFiZWwtaWNvbi5jb2RpY29uLmNvZGljb24tc3BhcmtsZScpKTtcblx0XHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHRjb25zdCB0aXRsZSA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCdzcGFuJykpO1xuXHRcdFx0dGl0bGUudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWRUaXRsZScsIFwiQ3VzdG9taXplIFlvdXIgQWdlbnRcIik7XG5cblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gRE9NLmFwcGVuZChnZXR0aW5nU3RhcnRlZCwgJCgncC53ZWxjb21lLXByb21wdHMtaW5wdXQtaGVscGVyJykpO1xuXHRcdFx0ZGVzY3JpcHRpb24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWREZXNjJywgXCJEZXNjcmliZSB5b3VyIHByZWZlcmVuY2VzIGFuZCBjb252ZW50aW9ucyB0byBkcmFmdCBhZ2VudHMsIHNraWxscywgYW5kIGluc3RydWN0aW9ucy5cIik7XG5cblx0XHRcdGNvbnN0IGlucHV0Um93ID0gRE9NLmFwcGVuZChnZXR0aW5nU3RhcnRlZCwgJCgnLndlbGNvbWUtcHJvbXB0cy1pbnB1dC1yb3cnKSk7XG5cdFx0XHR0aGlzLmlucHV0Um93ID0gaW5wdXRSb3c7XG5cdFx0XHR0aGlzLmlucHV0RWxlbWVudCA9IERPTS5hcHBlbmQoaW5wdXRSb3csICQoJ2lucHV0LndlbGNvbWUtcHJvbXB0cy1pbnB1dCcpKSBhcyBIVE1MSW5wdXRFbGVtZW50O1xuXHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQudHlwZSA9ICd0ZXh0Jztcblx0XHRcdHRoaXMuaW5wdXRFbGVtZW50LnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3dvcmtmbG93SW5wdXRQbGFjZWhvbGRlcicsIFwiUHJlZmVyIGNvbmNpc2UgY29tbWl0cywgdGhvcm91Z2ggcmV2aWV3cywgYW5kIHRlc3RlZCBjb2RlLi4uXCIpO1xuXHRcdFx0dGhpcy5pbnB1dEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ3dvcmtmbG93SW5wdXRBcmlhTGFiZWwnLCBcIkRlc2NyaWJlIHlvdXIgcHJlZmVyZW5jZXMgdG8gY3VzdG9taXplIHlvdXIgYWdlbnRcIikpO1xuXG5cdFx0XHRjb25zdCBzdWJtaXRCdG4gPSBET00uYXBwZW5kKGlucHV0Um93LCAkKCdidXR0b24ud2VsY29tZS1wcm9tcHRzLWlucHV0LXN1Ym1pdCcpKTtcblx0XHRcdHRoaXMuc3VibWl0QnRuID0gc3VibWl0QnRuO1xuXHRcdFx0c3VibWl0QnRuLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCd3b3JrZmxvd1N1Ym1pdEFyaWFMYWJlbCcsIFwiQ3VzdG9taXplIGFnZW50XCIpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHN1Ym1pdEJ0biwgbG9jYWxpemUoJ3dvcmtmbG93U3VibWl0VG9vbHRpcCcsIFwiT3BlbiBpbiBDaGF0XCIpKSk7XG5cdFx0XHRjb25zdCBjaGV2cm9uID0gRE9NLmFwcGVuZChzdWJtaXRCdG4sICQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWFycm93LXVwJykpO1xuXHRcdFx0Y2hldnJvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlU3VibWl0U3RhdGUgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGhhc1ZhbHVlID0gISEodGhpcy5pbnB1dEVsZW1lbnQ/LnZhbHVlPy50cmltKCkpO1xuXHRcdFx0XHQoc3VibWl0QnRuIGFzIEhUTUxCdXR0b25FbGVtZW50KS5kaXNhYmxlZCA9ICFoYXNWYWx1ZTtcblx0XHRcdFx0c3VibWl0QnRuLmNsYXNzTGlzdC50b2dnbGUoJ3dlbGNvbWUtcHJvbXB0cy1pbnB1dC1zdWJtaXQtZGlzYWJsZWQnLCAhaGFzVmFsdWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc3VibWl0ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuaW5wdXRFbGVtZW50Py52YWx1ZT8udHJpbSgpO1xuXHRcdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBxdWVyeTogc3RyaW5nO1xuXHRcdFx0XHRpZiAodGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0XHRxdWVyeSA9IGBHZW5lcmF0ZSBhZ2VudCBjdXN0b21pemF0aW9ucy4gJHt2YWx1ZX1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHF1ZXJ5ID0gYC9pbml0ICR7dmFsdWV9YDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNob3cgY29uZmlybWF0aW9uIGltbWVkaWF0ZWx5IFx1MjAxNCBiZWZvcmUgcHJlZmlsbENoYXQgc28gaXQncyB2aXNpYmxlXG5cdFx0XHRcdC8vIGV2ZW4gaWYgcHJlZmlsbENoYXQgbmF2aWdhdGVzIGZvY3VzIGF3YXkgZnJvbSB0aGlzIGVkaXRvclxuXHRcdFx0XHRpZiAodGhpcy5pbnB1dEVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLmlucHV0RWxlbWVudC52YWx1ZSA9ICcnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVwZGF0ZVN1Ym1pdFN0YXRlKCk7XG5cdFx0XHRcdGlucHV0Um93LmNsYXNzTGlzdC5hZGQoJ3NlbnQnKTtcblx0XHRcdFx0c3VibWl0QnRuLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdGlmICh0aGlzLnNlbnRMYWJlbCkge1xuXHRcdFx0XHRcdHRoaXMuc2VudExhYmVsLnJlbW92ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc2VudExhYmVsID0gRE9NLmFwcGVuZChpbnB1dFJvdywgJCgnc3Bhbi53ZWxjb21lLXByb21wdHMtc2VudC1sYWJlbCcpKTtcblx0XHRcdFx0dGhpcy5zZW50TGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnc2VudFRvQ2hhdCcsIFwiU2VudCB0byBjaGF0IFxcdTI3MTNcIik7XG5cblx0XHRcdFx0dGhpcy5jYWxsYmFja3MucHJlZmlsbENoYXQocXVlcnksIHsgaXNQYXJ0aWFsUXVlcnk6IGZhbHNlLCBuZXdDaGF0OiB0cnVlIH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzdWJtaXRCdG4sICdjbGljaycsIGUgPT4geyBlLnN0b3BQcm9wYWdhdGlvbigpOyBzdWJtaXQoKTsgfSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmlucHV0RWxlbWVudCwgJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0c3VibWl0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pbnB1dEVsZW1lbnQsICdpbnB1dCcsICgpID0+IHtcblx0XHRcdFx0dXBkYXRlU3VibWl0U3RhdGUoKTtcblx0XHRcdFx0Ly8gVHlwaW5nIHJlc3RvcmVzIHRoZSBpbnB1dCByb3cgZnJvbSBzZW50IHN0YXRlXG5cdFx0XHRcdHRoaXMuX2NsZWFyU2VudFN0YXRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR1cGRhdGVTdWJtaXRTdGF0ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FyZHNDb250YWluZXIgPSBET00uYXBwZW5kKHdlbGNvbWVJbm5lciwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkcycpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyU2VudFN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlbnRMYWJlbCkge1xuXHRcdFx0dGhpcy5zZW50TGFiZWwucmVtb3ZlKCk7XG5cdFx0XHR0aGlzLnNlbnRMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuc3VibWl0QnRuKSB7XG5cdFx0XHR0aGlzLnN1Ym1pdEJ0bi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlucHV0Um93KSB7XG5cdFx0XHR0aGlzLmlucHV0Um93LmNsYXNzTGlzdC5yZW1vdmUoJ3NlbnQnKTtcblx0XHR9XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jbGVhclNlbnRTdGF0ZSgpO1xuXHR9XG5cblx0cmVidWlsZENhcmRzKHZpc2libGVTZWN0aW9uSWRzOiBSZWFkb25seVNldDxBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbj4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2FyZHNDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy52aXNpYmxlU2VjdGlvbklkcyA9IG5ldyBTZXQodmlzaWJsZVNlY3Rpb25JZHMpO1xuXG5cdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRET00uY2xlYXJOb2RlKHRoaXMuY2FyZHNDb250YWluZXIpO1xuXHRcdHRoaXMuZmlyc3RDYXJkID0gdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBjYXRlZ29yeSBvZiB0aGlzLmNhdGVnb3J5RGVzY3JpcHRpb25zKSB7XG5cdFx0XHRpZiAoIXZpc2libGVTZWN0aW9uSWRzLmhhcyhjYXRlZ29yeS5pZCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNhcmQgPSBET00uYXBwZW5kKHRoaXMuY2FyZHNDb250YWluZXIsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZCcpKTtcblx0XHRcdGNhcmQuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cdFx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdGlmICghdGhpcy5maXJzdENhcmQpIHtcblx0XHRcdFx0dGhpcy5maXJzdENhcmQgPSBjYXJkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjYXJkSGVhZGVyID0gRE9NLmFwcGVuZChjYXJkLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtaGVhZGVyJykpO1xuXHRcdFx0Y29uc3QgaWNvbkVsID0gRE9NLmFwcGVuZChjYXJkSGVhZGVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtaWNvbicpKTtcblx0XHRcdGljb25FbC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGNhdGVnb3J5Lmljb24pKTtcblx0XHRcdGNvbnN0IGxhYmVsRWwgPSBET00uYXBwZW5kKGNhcmRIZWFkZXIsICQoJ3NwYW4ud2VsY29tZS1wcm9tcHRzLWNhcmQtbGFiZWwnKSk7XG5cdFx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gY2F0ZWdvcnkubGFiZWw7XG5cblx0XHRcdGNvbnN0IGRlc2NFbCA9IERPTS5hcHBlbmQoY2FyZCwgJCgncC53ZWxjb21lLXByb21wdHMtY2FyZC1kZXNjcmlwdGlvbicpKTtcblx0XHRcdGRlc2NFbC50ZXh0Q29udGVudCA9IGNhdGVnb3J5LmRlc2NyaXB0aW9uO1xuXG5cdFx0XHRjb25zdCBmb290ZXIgPSBET00uYXBwZW5kKGNhcmQsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZC1mb290ZXInKSk7XG5cdFx0XHRpZiAoY2F0ZWdvcnkucHJvbXB0VHlwZSkge1xuXHRcdFx0XHRjb25zdCBnZW5lcmF0ZUJ0biA9IERPTS5hcHBlbmQoZm9vdGVyLCAkKCdidXR0b24ud2VsY29tZS1wcm9tcHRzLWNhcmQtYWN0aW9uJykpO1xuXHRcdFx0XHRnZW5lcmF0ZUJ0bi50ZXh0Q29udGVudCA9IGxvY2FsaXplKCduZXcnLCBcIk5ldy4uLlwiKTtcblx0XHRcdFx0Z2VuZXJhdGVCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ25ld0NhdGVnb3J5QXJpYUxhYmVsJywgXCJOZXcgezB9Li4uXCIsIGNhdGVnb3J5LmxhYmVsKSk7XG5cdFx0XHRcdHRoaXMuY2FyZERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdlbmVyYXRlQnRuLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuY2FsbGJhY2tzLmNsb3NlRWRpdG9yKCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMud29ya3NwYWNlU2VydmljZS5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0eXBlTGFiZWwgPSBjYXRlZ29yeS5sYWJlbC50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL3MkLywgJycpO1xuXHRcdFx0XHRcdFx0dGhpcy5jYWxsYmFja3MucHJlZmlsbENoYXQoYENyZWF0ZSBtZSBhIGN1c3RvbSAke3R5cGVMYWJlbH0gdGhhdCBgLCB7IGlzUGFydGlhbFF1ZXJ5OiB0cnVlLCBuZXdDaGF0OiB0cnVlIH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLndvcmtzcGFjZVNlcnZpY2UuZ2VuZXJhdGVDdXN0b21pemF0aW9uKGNhdGVnb3J5LnByb21wdFR5cGUhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGJyb3dzZUJ0biA9IERPTS5hcHBlbmQoZm9vdGVyLCAkKCdidXR0b24ud2VsY29tZS1wcm9tcHRzLWNhcmQtYWN0aW9uJykpO1xuXHRcdFx0XHRicm93c2VCdG4udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYnJvd3NlJywgXCJCcm93c2UuLi5cIik7XG5cdFx0XHRcdGJyb3dzZUJ0bi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYnJvd3NlQ2F0ZWdvcnlBcmlhTGFiZWwnLCBcIkJyb3dzZSB7MH0uLi5cIiwgY2F0ZWdvcnkubGFiZWwpKTtcblx0XHRcdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnJvd3NlQnRuLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRcdHRoaXMuY2FsbGJhY2tzLnNlbGVjdFNlY3Rpb25XaXRoTWFya2V0cGxhY2UoY2F0ZWdvcnkuaWQpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY2FyZERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNhcmQsICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0dGhpcy5jYWxsYmFja3Muc2VsZWN0U2VjdGlvbihjYXRlZ29yeS5pZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmNhcmREaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjYXJkLCAna2V5ZG93bicsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5zZWxlY3RTZWN0aW9uKGNhdGVnb3J5LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiB0aGlzLnN0YW5kYWxvbmVDdXN0b21pemF0aW9ucykge1xuXHRcdFx0XHR0aGlzLnJlbmRlclN0YW5kYWxvbmVDdXN0b21pemF0aW9uKGN1c3RvbWl6YXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2F0ZWdvcnkgb2YgdGhpcy5taWdyYXRpb25DYXRlZ29yaWVzKSB7XG5cdFx0XHR0aGlzLnJlbmRlckN1c3RvbWl6YXRpb25NaWdyYXRpb25DYXJkKGNhdGVnb3J5KTtcblx0XHR9XG5cblx0XHQvLyBDb250ZW50IGNoYW5nZWQgXHUyMDE0IHJlY29tcHV0ZSBzY3JvbGwgZGltZW5zaW9ucy5cblx0XHR0aGlzLnNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyU3RhbmRhbG9uZUN1c3RvbWl6YXRpb24oY3VzdG9taXphdGlvbjogSVN0YW5kYWxvbmVDdXN0b21pemF0aW9uRGVzY3JpcHRpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY2FyZHNDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYXJkID0gRE9NLmFwcGVuZCh0aGlzLmNhcmRzQ29udGFpbmVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQnKSk7XG5cdFx0Y2FyZC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJzAnKTtcblx0XHRjYXJkLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRpZiAoIXRoaXMuZmlyc3RDYXJkKSB7XG5cdFx0XHR0aGlzLmZpcnN0Q2FyZCA9IGNhcmQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FyZEhlYWRlciA9IERPTS5hcHBlbmQoY2FyZCwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkLWhlYWRlcicpKTtcblx0XHRjb25zdCBpY29uRWwgPSBET00uYXBwZW5kKGNhcmRIZWFkZXIsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZC1pY29uJykpO1xuXHRcdGljb25FbC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KGN1c3RvbWl6YXRpb24uaWNvbikpO1xuXHRcdGNvbnN0IGxhYmVsRWwgPSBET00uYXBwZW5kKGNhcmRIZWFkZXIsICQoJ3NwYW4ud2VsY29tZS1wcm9tcHRzLWNhcmQtbGFiZWwnKSk7XG5cdFx0bGFiZWxFbC50ZXh0Q29udGVudCA9IGN1c3RvbWl6YXRpb24ubGFiZWw7XG5cblx0XHRjb25zdCBkZXNjRWwgPSBET00uYXBwZW5kKGNhcmQsICQoJ3Aud2VsY29tZS1wcm9tcHRzLWNhcmQtZGVzY3JpcHRpb24nKSk7XG5cdFx0ZGVzY0VsLnRleHRDb250ZW50ID0gY3VzdG9taXphdGlvbi5kZXNjcmlwdGlvbjtcblxuXHRcdGNvbnN0IGZvb3RlciA9IERPTS5hcHBlbmQoY2FyZCwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkLWZvb3RlcicpKTtcblx0XHRjb25zdCBjb25maWd1cmVCdXR0b24gPSBET00uYXBwZW5kKGZvb3RlciwgJCgnYnV0dG9uLndlbGNvbWUtcHJvbXB0cy1jYXJkLWFjdGlvbicpKTtcblx0XHRjb25maWd1cmVCdXR0b24udGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnY29uZmlndXJlJywgXCJDb25maWd1cmUuLi5cIik7XG5cdFx0Y29uZmlndXJlQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdjb25maWd1cmVDYXRlZ29yeUFyaWFMYWJlbCcsIFwiQ29uZmlndXJlIHswfS4uLlwiLCBjdXN0b21pemF0aW9uLmxhYmVsKSk7XG5cblx0XHRjb25zdCBjb25maWd1cmUgPSAoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY3VzdG9taXphdGlvbi5jb21tYW5kSWQpO1xuXHRcdH07XG5cdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY29uZmlndXJlQnV0dG9uLCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRjb25maWd1cmUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FyZCwgJ2NsaWNrJywgY29uZmlndXJlKSk7XG5cdFx0dGhpcy5jYXJkRGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2FyZCwgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0Y29uZmlndXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0TWlncmF0aW9uQ2F0ZWdvcmllcyhjYXRlZ29yaWVzOiByZWFkb25seSBJQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhdGVnb3J5U3VtbWFyeVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlkQ2hhbmdlID0gY2F0ZWdvcmllcy5sZW5ndGggIT09IHRoaXMubWlncmF0aW9uQ2F0ZWdvcmllcy5sZW5ndGhcblx0XHRcdHx8IGNhdGVnb3JpZXMuc29tZSgoY2F0ZWdvcnksIGluZGV4KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5taWdyYXRpb25DYXRlZ29yaWVzW2luZGV4XTtcblx0XHRcdFx0cmV0dXJuIHByZXZpb3VzLmlkICE9PSBjYXRlZ29yeS5pZFxuXHRcdFx0XHRcdHx8IHByZXZpb3VzLmNvdW50ICE9PSBjYXRlZ29yeS5jb3VudFxuXHRcdFx0XHRcdHx8IHByZXZpb3VzLmRlc2NyaXB0aW9uICE9PSBjYXRlZ29yeS5kZXNjcmlwdGlvbjtcblx0XHRcdH0pO1xuXHRcdHRoaXMubWlncmF0aW9uQ2F0ZWdvcmllcyA9IGNhdGVnb3JpZXM7XG5cdFx0aWYgKGRpZENoYW5nZSkge1xuXHRcdFx0dGhpcy5yZWJ1aWxkQ2FyZHModGhpcy52aXNpYmxlU2VjdGlvbklkcyk7XG5cdFx0fVxuXHR9XG5cblx0c2V0SGFybmVzc0xhYmVsKGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXJuZXNzTGFiZWwgPT09IGxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaGFybmVzc0xhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy51cGRhdGVIZWFkaW5nKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUhlYWRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaGVhZGluZykge1xuXHRcdFx0dGhpcy5oZWFkaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3dlbGNvbWVIZWFkaW5nV2l0aEhhcm5lc3MnLCBcIkFnZW50IEN1c3RvbWl6YXRpb25zIGZvciB7MH1cIiwgdGhpcy5oYXJuZXNzTGFiZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ3VzdG9taXphdGlvbk1pZ3JhdGlvbkNhcmQoY2F0ZWdvcnk6IElDdXN0b21pemF0aW9uTWlncmF0aW9uQ2F0ZWdvcnlTdW1tYXJ5KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNhcmRzQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWlncmF0aW9uQ2FyZCA9IERPTS5hcHBlbmQodGhpcy5jYXJkc0NvbnRhaW5lciwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkLndlbGNvbWUtcHJvbXB0cy1taWdyYXRpb24tY2FyZCcpKTtcblxuXHRcdGNvbnN0IGNhcmRIZWFkZXIgPSBET00uYXBwZW5kKG1pZ3JhdGlvbkNhcmQsICQoJy53ZWxjb21lLXByb21wdHMtY2FyZC1oZWFkZXInKSk7XG5cdFx0Y29uc3QgaWNvbkVsID0gRE9NLmFwcGVuZChjYXJkSGVhZGVyLCAkKCcud2VsY29tZS1wcm9tcHRzLWNhcmQtaWNvbicpKTtcblx0XHRpY29uRWwuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnN5bmMpKTtcblx0XHRjb25zdCBsYWJlbEVsID0gRE9NLmFwcGVuZChjYXJkSGVhZGVyLCAkKCdzcGFuLndlbGNvbWUtcHJvbXB0cy1jYXJkLWxhYmVsJykpO1xuXHRcdGxhYmVsRWwudGV4dENvbnRlbnQgPSBjYXRlZ29yeS5sYWJlbDtcblxuXHRcdGNvbnN0IGRlc2NFbCA9IERPTS5hcHBlbmQobWlncmF0aW9uQ2FyZCwgJCgncC53ZWxjb21lLXByb21wdHMtY2FyZC1kZXNjcmlwdGlvbicpKTtcblx0XHRkZXNjRWwudGV4dENvbnRlbnQgPSBjYXRlZ29yeS5kZXNjcmlwdGlvbjtcblxuXHRcdGNvbnN0IGZvb3RlciA9IERPTS5hcHBlbmQobWlncmF0aW9uQ2FyZCwgJCgnLndlbGNvbWUtcHJvbXB0cy1jYXJkLWZvb3RlcicpKTtcblx0XHRjb25zdCBtaWdyYXRlQnRuID0gRE9NLmFwcGVuZChmb290ZXIsICQoJ2J1dHRvbi53ZWxjb21lLXByb21wdHMtY2FyZC1hY3Rpb24nKSk7XG5cdFx0bWlncmF0ZUJ0bi50ZXh0Q29udGVudCA9IGNhdGVnb3J5LmFjdGlvbkxhYmVsO1xuXHRcdG1pZ3JhdGVCdG4uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgY2F0ZWdvcnkuYWN0aW9uQXJpYUxhYmVsKTtcblx0XHRpZiAoIXRoaXMuZmlyc3RDYXJkKSB7XG5cdFx0XHR0aGlzLmZpcnN0Q2FyZCA9IG1pZ3JhdGVCdG47XG5cdFx0fVxuXHRcdHRoaXMuY2FyZERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1pZ3JhdGVCdG4sICdjbGljaycsICgpID0+IHRoaXMuY2FsbGJhY2tzLm1pZ3JhdGVDdXN0b21pemF0aW9ucyhjYXRlZ29yeS5pZCkpKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdC8vIFByZWZlciB0aGUgcHJvbXB0IGlucHV0IHNvIHNjcmVlbiByZWFkZXIgLyBrZXlib2FyZCB1c2VycyBsYW5kIG9uIGEgbWVhbmluZ2Z1bFxuXHRcdC8vIGNvbnRyb2wuIElmIHRoZSBpbnB1dCBpc24ndCByZW5kZXJlZCAoZS5nLiB3aGVuIHRoZSBnZXR0aW5nLXN0YXJ0ZWQgYmFubmVyIGlzXG5cdFx0Ly8gZGlzYWJsZWQpLCBmYWxsIGJhY2sgdG8gdGhlIGZpcnN0IGZvY3VzYWJsZSBjYXJkIHNvIGZvY3VzIHN0YXlzIGluc2lkZSB0aGVcblx0XHQvLyB3ZWxjb21lIHBhZ2UgcmF0aGVyIHRoYW4gZXNjYXBpbmcgdG8gdGhlIHN1cnJvdW5kaW5nIHdvcmtiZW5jaCBlZGl0b3IuXG5cdFx0aWYgKHRoaXMuaW5wdXRFbGVtZW50KSB7XG5cdFx0XHR0aGlzLmlucHV0RWxlbWVudC5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmZpcnN0Q2FyZD8uZm9jdXMoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUV4QixTQUFTLHdDQUF3QztBQUNqRCxTQUFTLFdBQVcsa0JBQWtCLFlBQVksV0FBVyxVQUFVLGlCQUFpQjtBQUV4RixTQUFTLG1CQUFtQjtBQUc1QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRDQUE0Qyw4Q0FBOEM7QUFFbkcsTUFBTSxJQUFJLElBQUk7QUFpQlAsTUFBTSxrREFBa0QsV0FBZ0U7QUFBQSxFQWlGOUgsWUFDQyxRQUNpQixxQkFDQSxXQUNBLGdCQUNBLGtCQUNBLGNBQ1QsY0FDUDtBQUNELFVBQU07QUFQVztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ1Q7QUF0RlQsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBUXZFLFNBQVEsb0JBQW9CLG9CQUFJLElBQXNDO0FBS3RFLFNBQVEsc0JBQXlFLENBQUM7QUFFbEYs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
