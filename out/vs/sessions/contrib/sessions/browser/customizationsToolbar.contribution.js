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
import "../../../browser/media/sidebarActionButton.css";
import "./media/customizationsToolbar.css";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../workbench/common/contributions.js";
import { AICustomizationManagementEditor } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js";
import { AICustomizationManagementEditorInput } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js";
import { IAICustomizationItemsModel } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js";
import { IMcpService } from "../../../../workbench/contrib/mcp/common/mcpTypes.js";
import { ILanguageModelToolsService } from "../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { AGENT_HOST_COPILOT_CLI_SESSION_TYPE, countEnabledCustomizationTools, IAgentHostToolSetEnablementService } from "../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostToolSetEnablementService.js";
import { Menus } from "../../../browser/menus.js";
import { agentIcon, instructionsIcon, mcpServerIcon, pluginIcon, skillIcon, hookIcon, toolsIcon } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationIcons.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { $, append } from "../../../../base/browser/dom.js";
import { autorun } from "../../../../base/common/observable.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../../workbench/services/editor/common/editorService.js";
import { AICustomizationManagementSection } from "../../../../workbench/contrib/chat/common/aiCustomizationWorkspaceService.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ICustomizationHarnessService } from "../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionType } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
function customizationSectionVisibleKey(section) {
  return `sessionsCustomizationSectionVisible.${section}`;
}
const CUSTOMIZATION_OVERVIEW_ITEM = {
  id: "sessions.customization.overview",
  label: localize("overview", "Overview"),
  icon: Codicon.home
};
const CUSTOMIZATION_ITEMS = [
  {
    id: "sessions.customization.agents",
    label: localize("agents", "Agents"),
    icon: agentIcon,
    section: AICustomizationManagementSection.Agents,
    modelSection: AICustomizationManagementSection.Agents
  },
  {
    id: "sessions.customization.skills",
    label: localize("skills", "Skills"),
    icon: skillIcon,
    section: AICustomizationManagementSection.Skills,
    modelSection: AICustomizationManagementSection.Skills
  },
  {
    id: "sessions.customization.instructions",
    label: localize("instructions", "Instructions"),
    icon: instructionsIcon,
    section: AICustomizationManagementSection.Instructions,
    modelSection: AICustomizationManagementSection.Instructions
  },
  {
    id: "sessions.customization.hooks",
    label: localize("hooks", "Hooks"),
    icon: hookIcon,
    section: AICustomizationManagementSection.Hooks,
    modelSection: AICustomizationManagementSection.Hooks
  },
  {
    id: "sessions.customization.mcpServers",
    label: localize("mcpServers", "MCP Servers"),
    icon: mcpServerIcon,
    section: AICustomizationManagementSection.McpServers,
    isMcp: true
  },
  {
    id: "sessions.customization.plugins",
    label: localize("plugins", "Plugins"),
    icon: pluginIcon,
    section: AICustomizationManagementSection.Plugins,
    isPlugins: true
  },
  {
    id: "sessions.customization.tools",
    label: localize("tools", "Tools"),
    icon: toolsIcon,
    section: AICustomizationManagementSection.Tools,
    isTools: true
  },
  {
    id: "sessions.customization.harnessSettings",
    label: localize("harnessSettings", "Codex"),
    icon: Codicon.openai,
    section: AICustomizationManagementSection.HarnessSettings
  }
];
async function openCustomizationOverviewPage(editorService, harnessService, sessionsService) {
  const sessionResource = sessionsService.activeSession.get()?.resource;
  if (sessionResource) {
    harnessService.setActiveSession(sessionResource);
  }
  const input = AICustomizationManagementEditorInput.getOrCreate();
  const pane = await editorService.openEditor(input, { pinned: true });
  if (pane instanceof AICustomizationManagementEditor) {
    pane.showWelcomePage();
  }
}
async function openCustomizationSectionPage(editorService, harnessService, sessionsService, section) {
  const sessionResource = sessionsService.activeSession.get()?.resource;
  if (sessionResource) {
    harnessService.setActiveSession(sessionResource);
  }
  const input = AICustomizationManagementEditorInput.getOrCreate();
  const pane = await editorService.openEditor(input, { pinned: true });
  if (pane instanceof AICustomizationManagementEditor) {
    pane.selectSectionById(section);
  }
}
let CustomizationLinkViewItem = class extends ActionViewItem {
  constructor(action, options, _config, _itemsModel, _mcpService, _toolsService, _toolEnablementService) {
    super(void 0, action, { ...options, icon: false, label: false });
    this._config = _config;
    this._itemsModel = _itemsModel;
    this._mcpService = _mcpService;
    this._toolsService = _toolsService;
    this._toolEnablementService = _toolEnablementService;
    this._viewItemDisposables = this._register(new DisposableStore());
  }
  getTooltip() {
    return void 0;
  }
  render(container) {
    super.render(container);
    container.classList.add("customization-link-widget", "sidebar-action");
    const buttonContainer = append(container, $(".customization-link-button-container"));
    this._button = this._viewItemDisposables.add(new Button(buttonContainer, {
      ...defaultButtonStyles,
      secondary: true,
      title: false,
      supportIcons: true,
      buttonSecondaryBackground: "transparent",
      buttonSecondaryHoverBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryBorder: void 0
    }));
    this._button.element.classList.add("customization-link-button", "sidebar-action-button");
    this._button.label = `$(${this._config.icon.id}) ${this._config.label}`;
    this._viewItemDisposables.add(this._button.onDidClick(() => {
      this._action.run();
    }));
    this._countContainer = append(this._button.element, $("span.customization-link-counts"));
    this._viewItemDisposables.add(autorun((reader) => {
      const count = this._readCount(reader);
      if (this._countContainer) {
        this._renderTotalCount(this._countContainer, count);
      }
    }));
  }
  _readCount(reader) {
    if (this._config.modelSection) {
      return this._itemsModel.getCount(this._config.modelSection).read(reader);
    }
    if (this._config.isMcp) {
      return this._mcpService.servers.read(reader).length;
    }
    if (this._config.isPlugins) {
      return this._itemsModel.getPluginCount().read(reader);
    }
    if (this._config.isTools) {
      const state = this._toolEnablementService.observe(AGENT_HOST_COPILOT_CLI_SESSION_TYPE).read(reader);
      const toolSets = this._toolsService.toolSets.read(reader);
      return countEnabledCustomizationTools(toolSets, state, reader);
    }
    return 0;
  }
  _renderTotalCount(container, count) {
    container.textContent = "";
    container.classList.toggle("hidden", count === 0);
    if (count > 0) {
      const badge = append(container, $("span.source-count-badge"));
      const num = append(badge, $("span.source-count-num"));
      num.textContent = `${count}`;
    }
  }
};
CustomizationLinkViewItem = __decorateClass([
  __decorateParam(3, IAICustomizationItemsModel),
  __decorateParam(4, IMcpService),
  __decorateParam(5, ILanguageModelToolsService),
  __decorateParam(6, IAgentHostToolSetEnablementService)
], CustomizationLinkViewItem);
let CustomizationsToolbarContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, harnessService, contextKeyService) {
    super();
    const visibilityKeys = /* @__PURE__ */ new Map();
    for (const config of CUSTOMIZATION_ITEMS) {
      if (!config.section) {
        continue;
      }
      const key = new RawContextKey(customizationSectionVisibleKey(config.section), true).bindTo(contextKeyService);
      visibilityKeys.set(config.section, key);
    }
    this._register(autorun((reader) => {
      const activeHarness = harnessService.activeHarness.read(reader);
      harnessService.availableHarnesses.read(reader);
      const descriptor = harnessService.getActiveDescriptor();
      const hidden = new Set(descriptor.hiddenSections ?? []);
      for (const config of CUSTOMIZATION_ITEMS) {
        if (!config.section) {
          continue;
        }
        const supported = config.section !== AICustomizationManagementSection.HarnessSettings || activeHarness === SessionType.AgentHostCodex;
        visibilityKeys.get(config.section).set(!hidden.has(config.section) && supported);
      }
    }));
    this._register(actionViewItemService.register(Menus.SidebarCustomizations, CUSTOMIZATION_OVERVIEW_ITEM.id, (action, options) => {
      return instantiationService.createInstance(CustomizationLinkViewItem, action, options, CUSTOMIZATION_OVERVIEW_ITEM);
    }, void 0));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: CUSTOMIZATION_OVERVIEW_ITEM.id,
          title: CUSTOMIZATION_OVERVIEW_ITEM.label,
          menu: {
            id: Menus.SidebarCustomizations,
            group: "navigation",
            order: 0,
            when: ChatContextKeys.enabled
          }
        });
      }
      async run(accessor) {
        await openCustomizationOverviewPage(
          accessor.get(IEditorService),
          accessor.get(ICustomizationHarnessService),
          accessor.get(ISessionsService)
        );
      }
    }));
    for (const [index, config] of CUSTOMIZATION_ITEMS.entries()) {
      if (!config.section) {
        continue;
      }
      const section = config.section;
      this._register(actionViewItemService.register(Menus.SidebarCustomizations, config.id, (action, options) => {
        return instantiationService.createInstance(CustomizationLinkViewItem, action, options, config);
      }, void 0));
      const sectionVisibleWhen = ContextKeyExpr.has(customizationSectionVisibleKey(section));
      const combinedWhen = config.when ? ContextKeyExpr.and(ChatContextKeys.enabled, sectionVisibleWhen, config.when) : ContextKeyExpr.and(ChatContextKeys.enabled, sectionVisibleWhen);
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: config.id,
            title: config.label,
            menu: {
              id: Menus.SidebarCustomizations,
              group: "navigation",
              order: index + 1,
              when: combinedWhen
            }
          });
        }
        async run(accessor) {
          const editorService = accessor.get(IEditorService);
          const harnessService2 = accessor.get(ICustomizationHarnessService);
          const sessionsService = accessor.get(ISessionsService);
          await openCustomizationSectionPage(editorService, harnessService2, sessionsService, section);
        }
      }));
    }
  }
};
CustomizationsToolbarContribution.ID = "workbench.contrib.sessionsCustomizationsToolbar";
CustomizationsToolbarContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ICustomizationHarnessService),
  __decorateParam(3, IContextKeyService)
], CustomizationsToolbarContribution);
registerWorkbenchContribution2(CustomizationsToolbarContribution.ID, CustomizationsToolbarContribution, WorkbenchPhase.AfterRestored);
function findHarnessIdForSession(session, harnessService) {
  if (!session) {
    return void 0;
  }
  const schemeId = session.resource.scheme;
  if (harnessService.findHarnessById(schemeId)) {
    return schemeId;
  }
  if (harnessService.findHarnessById(session.sessionType)) {
    return session.sessionType;
  }
  return void 0;
}
let ActiveSessionHarnessSyncContribution = class extends Disposable {
  constructor(sessionsService, harnessService) {
    super();
    this._register(autorun((reader) => {
      const session = sessionsService.activeSession.read(reader);
      if (!session) {
        return;
      }
      harnessService.availableHarnesses.read(reader);
      harnessService.setActiveSession(session.resource);
    }));
  }
};
ActiveSessionHarnessSyncContribution.ID = "workbench.contrib.sessionsActiveHarnessSync";
ActiveSessionHarnessSyncContribution = __decorateClass([
  __decorateParam(0, ISessionsService),
  __decorateParam(1, ICustomizationHarnessService)
], ActiveSessionHarnessSyncContribution);
registerWorkbenchContribution2(ActiveSessionHarnessSyncContribution.ID, ActiveSessionHarnessSyncContribution, WorkbenchPhase.AfterRestored);
export {
  ActiveSessionHarnessSyncContribution,
  CUSTOMIZATION_ITEMS,
  CustomizationLinkViewItem,
  CustomizationsToolbarContribution,
  findHarnessIdForSession,
  openCustomizationOverviewPage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXGN1c3RvbWl6YXRpb25zVG9vbGJhci5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uLy4uLy4uL2Jyb3dzZXIvbWVkaWEvc2lkZWJhckFjdGlvbkJ1dHRvbi5jc3MnO1xuaW1wb3J0ICcuL21lZGlhL2N1c3RvbWl6YXRpb25zVG9vbGJhci5jc3MnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBXb3JrYmVuY2hQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLCBJdGVtc01vZGVsU2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfQ09QSUxPVF9DTElfU0VTU0lPTl9UWVBFLCBjb3VudEVuYWJsZWRDdXN0b21pemF0aW9uVG9vbHMsIElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0VG9vbFNldEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBhZ2VudEljb24sIGluc3RydWN0aW9uc0ljb24sIG1jcFNlcnZlckljb24sIHBsdWdpbkljb24sIHNraWxsSWNvbiwgaG9va0ljb24sIHRvb2xzSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uSWNvbnMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVmlld0l0ZW0sIElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgJCwgYXBwZW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDdXN0b21pemF0aW9uSXRlbUNvbmZpZyB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgc2VjdGlvbj86IHR5cGVvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbltrZXlvZiB0eXBlb2YgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25dO1xuXHQvKiogSWYgc2V0LCBjb3VudCBjb21lcyBmcm9tIGBJQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC5nZXRDb3VudChtb2RlbFNlY3Rpb24pYC4gKi9cblx0cmVhZG9ubHkgbW9kZWxTZWN0aW9uPzogSXRlbXNNb2RlbFNlY3Rpb247XG5cdHJlYWRvbmx5IGlzTWNwPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNQbHVnaW5zPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNUb29scz86IGJvb2xlYW47XG5cdC8qKiBBZGRpdGlvbmFsIGB3aGVuYCBjbGF1c2UgYmV5b25kIHRoZSBzdGFuZGFyZCBoYXJuZXNzLXZpc2liaWxpdHkgZ2F0ZS4gKi9cblx0cmVhZG9ubHkgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xufVxuXG4vKipcbiAqIFBlci1zZWN0aW9uIGNvbnRleHQga2V5IGluZGljYXRpbmcgd2hldGhlciB0aGUgYWN0aXZlIGhhcm5lc3MgZXhwb3Nlc1xuICogdGhlIHNlY3Rpb24gaW4gdGhlIHNpZGViYXIgY3VzdG9taXphdGlvbnMgdG9vbGJhci4gRHJpdmVuIGJ5XG4gKiBgSUhhcm5lc3NEZXNjcmlwdG9yLmhpZGRlblNlY3Rpb25zYCBhbmQgY29uc3VtZWQgdmlhIHRoZSBtZW51IGB3aGVuYFxuICogY2xhdXNlIHJlZ2lzdGVyZWQgYWxvbmdzaWRlIGVhY2ggY3VzdG9taXphdGlvbiBhY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGN1c3RvbWl6YXRpb25TZWN0aW9uVmlzaWJsZUtleShzZWN0aW9uOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gYHNlc3Npb25zQ3VzdG9taXphdGlvblNlY3Rpb25WaXNpYmxlLiR7c2VjdGlvbn1gO1xufVxuXG5jb25zdCBDVVNUT01JWkFUSU9OX09WRVJWSUVXX0lURU06IElDdXN0b21pemF0aW9uSXRlbUNvbmZpZyA9IHtcblx0aWQ6ICdzZXNzaW9ucy5jdXN0b21pemF0aW9uLm92ZXJ2aWV3Jyxcblx0bGFiZWw6IGxvY2FsaXplKCdvdmVydmlldycsIFwiT3ZlcnZpZXdcIiksXG5cdGljb246IENvZGljb24uaG9tZSxcbn07XG5cbmV4cG9ydCBjb25zdCBDVVNUT01JWkFUSU9OX0lURU1TOiBJQ3VzdG9taXphdGlvbkl0ZW1Db25maWdbXSA9IFtcblx0e1xuXHRcdGlkOiAnc2Vzc2lvbnMuY3VzdG9taXphdGlvbi5hZ2VudHMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWdlbnRzJywgXCJBZ2VudHNcIiksXG5cdFx0aWNvbjogYWdlbnRJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRtb2RlbFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0fSxcblx0e1xuXHRcdGlkOiAnc2Vzc2lvbnMuY3VzdG9taXphdGlvbi5za2lsbHMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2tpbGxzJywgXCJTa2lsbHNcIiksXG5cdFx0aWNvbjogc2tpbGxJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0XHRtb2RlbFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0fSxcblx0e1xuXHRcdGlkOiAnc2Vzc2lvbnMuY3VzdG9taXphdGlvbi5pbnN0cnVjdGlvbnMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdHJ1Y3Rpb25zJywgXCJJbnN0cnVjdGlvbnNcIiksXG5cdFx0aWNvbjogaW5zdHJ1Y3Rpb25zSWNvbixcblx0XHRzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0bW9kZWxTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24uaG9va3MnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnaG9va3MnLCBcIkhvb2tzXCIpLFxuXHRcdGljb246IGhvb2tJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLFxuXHRcdG1vZGVsU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3MsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24ubWNwU2VydmVycycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdtY3BTZXJ2ZXJzJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRpY29uOiBtY3BTZXJ2ZXJJY29uLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0aXNNY3A6IHRydWUsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24ucGx1Z2lucycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdwbHVnaW5zJywgXCJQbHVnaW5zXCIpLFxuXHRcdGljb246IHBsdWdpbkljb24sXG5cdFx0c2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRpc1BsdWdpbnM6IHRydWUsXG5cdH0sXG5cdHtcblx0XHRpZDogJ3Nlc3Npb25zLmN1c3RvbWl6YXRpb24udG9vbHMnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgndG9vbHMnLCBcIlRvb2xzXCIpLFxuXHRcdGljb246IHRvb2xzSWNvbixcblx0XHRzZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ub29scyxcblx0XHRpc1Rvb2xzOiB0cnVlLFxuXHR9LFxuXHR7XG5cdFx0aWQ6ICdzZXNzaW9ucy5jdXN0b21pemF0aW9uLmhhcm5lc3NTZXR0aW5ncycsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCdoYXJuZXNzU2V0dGluZ3MnLCBcIkNvZGV4XCIpLFxuXHRcdGljb246IENvZGljb24ub3BlbmFpLFxuXHRcdHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhhcm5lc3NTZXR0aW5ncyxcblx0fSxcbl07XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBvcGVuQ3VzdG9taXphdGlvbk92ZXJ2aWV3UGFnZShlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2U7XG5cdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRoYXJuZXNzU2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRjb25zdCBpbnB1dCA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpO1xuXHRjb25zdCBwYW5lID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0aWYgKHBhbmUgaW5zdGFuY2VvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yKSB7XG5cdFx0cGFuZS5zaG93V2VsY29tZVBhZ2UoKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBvcGVuQ3VzdG9taXphdGlvblNlY3Rpb25QYWdlKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLCBoYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlOiBJU2Vzc2lvbnNTZXJ2aWNlLCBzZWN0aW9uOiB0eXBlb2YgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25ba2V5b2YgdHlwZW9mIEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uXSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ucmVzb3VyY2U7XG5cdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRoYXJuZXNzU2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRjb25zdCBpbnB1dCA9IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5nZXRPckNyZWF0ZSgpO1xuXHRjb25zdCBwYW5lID0gYXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0aWYgKHBhbmUgaW5zdGFuY2VvZiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yKSB7XG5cdFx0cGFuZS5zZWxlY3RTZWN0aW9uQnlJZChzZWN0aW9uKTtcblx0fVxufVxuXG4vKipcbiAqIEN1c3RvbSBBY3Rpb25WaWV3SXRlbSBmb3IgZWFjaCBjdXN0b21pemF0aW9uIGxpbmsgaW4gdGhlIHRvb2xiYXIuXG4gKiBSZW5kZXJzIGljb24gKyBsYWJlbCArIGEgc2luZ2xlIGNvdW50IGJhZGdlIGRyaXZlbiBieSB0aGUgc2FtZVxuICogb2JzZXJ2YWJsZXMgdGhhdCBmZWVkIHRoZSBjdXN0b21pemF0aW9ucyBlZGl0b3IgXHUyMDE0IHNvIHRoZSBiYWRnZSBhbHdheXNcbiAqIG1hdGNoZXMgdGhlIGVkaXRvcidzIGNvdW50IGV4YWN0bHkuXG4gKi9cbmV4cG9ydCBjbGFzcyBDdXN0b21pemF0aW9uTGlua1ZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdJdGVtRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHJpdmF0ZSBfYnV0dG9uOiBCdXR0b24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NvdW50Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0b3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlnOiBJQ3VzdG9taXphdGlvbkl0ZW1Db25maWcsXG5cdFx0QElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zTW9kZWw6IElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLFxuXHRcdEBJTWNwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tY3BTZXJ2aWNlOiBJTWNwU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUFnZW50SG9zdFRvb2xTZXRFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90b29sRW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RUb29sU2V0RW5hYmxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGljb246IGZhbHNlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0dGhpcy5fdmlld0l0ZW1EaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjdXN0b21pemF0aW9uLWxpbmstd2lkZ2V0JywgJ3NpZGViYXItYWN0aW9uJyk7XG5cblx0XHQvLyBCdXR0b24gKGxlZnQpIC0gdXNlcyBzdXBwb3J0SWNvbnMgdG8gcmVuZGVyIGNvZGljb24gaW4gbGFiZWxcblx0XHRjb25zdCBidXR0b25Db250YWluZXIgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcuY3VzdG9taXphdGlvbi1saW5rLWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fYnV0dG9uID0gdGhpcy5fdmlld0l0ZW1EaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihidXR0b25Db250YWluZXIsIHtcblx0XHRcdC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHR0aXRsZTogZmFsc2UsXG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kOiAndHJhbnNwYXJlbnQnLFxuXHRcdFx0YnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25TZWNvbmRhcnlCb3JkZXI6IHVuZGVmaW5lZCxcblx0XHR9KSk7XG5cdFx0dGhpcy5fYnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY3VzdG9taXphdGlvbi1saW5rLWJ1dHRvbicsICdzaWRlYmFyLWFjdGlvbi1idXR0b24nKTtcblx0XHR0aGlzLl9idXR0b24ubGFiZWwgPSBgJCgke3RoaXMuX2NvbmZpZy5pY29uLmlkfSkgJHt0aGlzLl9jb25maWcubGFiZWx9YDtcblxuXHRcdHRoaXMuX3ZpZXdJdGVtRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2J1dHRvbi5vbkRpZENsaWNrKCgpID0+IHtcblx0XHRcdHRoaXMuX2FjdGlvbi5ydW4oKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDb3VudCBjb250YWluZXIgKGluc2lkZSBidXR0b24sIGZsb2F0aW5nIHJpZ2h0KVxuXHRcdHRoaXMuX2NvdW50Q29udGFpbmVyID0gYXBwZW5kKHRoaXMuX2J1dHRvbi5lbGVtZW50LCAkKCdzcGFuLmN1c3RvbWl6YXRpb24tbGluay1jb3VudHMnKSk7XG5cblx0XHR0aGlzLl92aWV3SXRlbURpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb3VudCA9IHRoaXMuX3JlYWRDb3VudChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMuX2NvdW50Q29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlclRvdGFsQ291bnQodGhpcy5fY291bnRDb250YWluZXIsIGNvdW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQ291bnQocmVhZGVyOiBQYXJhbWV0ZXJzPFBhcmFtZXRlcnM8dHlwZW9mIGF1dG9ydW4+WzBdPlswXSk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZy5tb2RlbFNlY3Rpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLl9pdGVtc01vZGVsLmdldENvdW50KHRoaXMuX2NvbmZpZy5tb2RlbFNlY3Rpb24pLnJlYWQocmVhZGVyKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbmZpZy5pc01jcCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21jcFNlcnZpY2Uuc2VydmVycy5yZWFkKHJlYWRlcikubGVuZ3RoO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29uZmlnLmlzUGx1Z2lucykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2l0ZW1zTW9kZWwuZ2V0UGx1Z2luQ291bnQoKS5yZWFkKHJlYWRlcik7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25maWcuaXNUb29scykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl90b29sRW5hYmxlbWVudFNlcnZpY2Uub2JzZXJ2ZShBR0VOVF9IT1NUX0NPUElMT1RfQ0xJX1NFU1NJT05fVFlQRSkucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgdG9vbFNldHMgPSB0aGlzLl90b29sc1NlcnZpY2UudG9vbFNldHMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGNvdW50RW5hYmxlZEN1c3RvbWl6YXRpb25Ub29scyh0b29sU2V0cywgc3RhdGUsIHJlYWRlcik7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyVG90YWxDb3VudChjb250YWluZXI6IEhUTUxFbGVtZW50LCBjb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLnRleHRDb250ZW50ID0gJyc7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIGNvdW50ID09PSAwKTtcblx0XHRpZiAoY291bnQgPiAwKSB7XG5cdFx0XHRjb25zdCBiYWRnZSA9IGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uc291cmNlLWNvdW50LWJhZGdlJykpO1xuXHRcdFx0Y29uc3QgbnVtID0gYXBwZW5kKGJhZGdlLCAkKCdzcGFuLnNvdXJjZS1jb3VudC1udW0nKSk7XG5cdFx0XHRudW0udGV4dENvbnRlbnQgPSBgJHtjb3VudH1gO1xuXHRcdH1cblx0fVxufVxuXG4vLyAtLS0gUmVnaXN0ZXIgYWN0aW9ucyBhbmQgdmlldyBpdGVtcyAtLS0gLy9cblxuZXhwb3J0IGNsYXNzIEN1c3RvbWl6YXRpb25zVG9vbGJhckNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuc2Vzc2lvbnNDdXN0b21pemF0aW9uc1Rvb2xiYXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gUGVyLXNlY3Rpb24gdmlzaWJpbGl0eSBjb250ZXh0IGtleXMsIGtlcHQgaW4gc3luYyB3aXRoIHRoZSBhY3RpdmVcblx0XHQvLyBoYXJuZXNzJ3MgYGhpZGRlblNlY3Rpb25zYC4gRWFjaCBjdXN0b21pemF0aW9uIGFjdGlvbidzIG1lbnUgZW50cnlcblx0XHQvLyBpcyBnYXRlZCBvbiBpdHMga2V5IHNvIHRoYXQgaGFybmVzc2VzIChlLmcuIENsYXVkZSwgQUhQKSB3aGljaFxuXHRcdC8vIGRvbid0IHN1cHBvcnQgYSBjdXN0b21pemF0aW9uIHR5cGUgZG9uJ3Qgc3VyZmFjZSBpdHMgcm93LlxuXHRcdGNvbnN0IHZpc2liaWxpdHlLZXlzID0gbmV3IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PGJvb2xlYW4+PigpO1xuXHRcdGZvciAoY29uc3QgY29uZmlnIG9mIENVU1RPTUlaQVRJT05fSVRFTVMpIHtcblx0XHRcdGlmICghY29uZmlnLnNlY3Rpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihjdXN0b21pemF0aW9uU2VjdGlvblZpc2libGVLZXkoY29uZmlnLnNlY3Rpb24pLCB0cnVlKS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0dmlzaWJpbGl0eUtleXMuc2V0KGNvbmZpZy5zZWN0aW9uLCBrZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVIYXJuZXNzID0gaGFybmVzc1NlcnZpY2UuYWN0aXZlSGFybmVzcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRoYXJuZXNzU2VydmljZS5hdmFpbGFibGVIYXJuZXNzZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRvciA9IGhhcm5lc3NTZXJ2aWNlLmdldEFjdGl2ZURlc2NyaXB0b3IoKTtcblx0XHRcdGNvbnN0IGhpZGRlbiA9IG5ldyBTZXQoZGVzY3JpcHRvci5oaWRkZW5TZWN0aW9ucyA/PyBbXSk7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbmZpZyBvZiBDVVNUT01JWkFUSU9OX0lURU1TKSB7XG5cdFx0XHRcdGlmICghY29uZmlnLnNlY3Rpb24pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdXBwb3J0ZWQgPSBjb25maWcuc2VjdGlvbiAhPT0gQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSGFybmVzc1NldHRpbmdzIHx8IGFjdGl2ZUhhcm5lc3MgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvZGV4O1xuXHRcdFx0XHR2aXNpYmlsaXR5S2V5cy5nZXQoY29uZmlnLnNlY3Rpb24pIS5zZXQoIWhpZGRlbi5oYXMoY29uZmlnLnNlY3Rpb24pICYmIHN1cHBvcnRlZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLlNpZGViYXJDdXN0b21pemF0aW9ucywgQ1VTVE9NSVpBVElPTl9PVkVSVklFV19JVEVNLmlkLCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ3VzdG9taXphdGlvbkxpbmtWaWV3SXRlbSwgYWN0aW9uLCBvcHRpb25zLCBDVVNUT01JWkFUSU9OX09WRVJWSUVXX0lURU0pO1xuXHRcdH0sIHVuZGVmaW5lZCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBDVVNUT01JWkFUSU9OX09WRVJWSUVXX0lURU0uaWQsXG5cdFx0XHRcdFx0dGl0bGU6IENVU1RPTUlaQVRJT05fT1ZFUlZJRVdfSVRFTS5sYWJlbCxcblx0XHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0XHRpZDogTWVudXMuU2lkZWJhckN1c3RvbWl6YXRpb25zLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRhd2FpdCBvcGVuQ3VzdG9taXphdGlvbk92ZXJ2aWV3UGFnZShcblx0XHRcdFx0XHRhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLFxuXHRcdFx0XHRcdGFjY2Vzc29yLmdldChJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlKSxcblx0XHRcdFx0XHRhY2Nlc3Nvci5nZXQoSVNlc3Npb25zU2VydmljZSksXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Zm9yIChjb25zdCBbaW5kZXgsIGNvbmZpZ10gb2YgQ1VTVE9NSVpBVElPTl9JVEVNUy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmICghY29uZmlnLnNlY3Rpb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gY29uZmlnLnNlY3Rpb247XG5cdFx0XHQvLyBSZWdpc3RlciB0aGUgY3VzdG9tIEFjdGlvblZpZXdJdGVtIGZvciB0aGlzIGFjdGlvblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVzLlNpZGViYXJDdXN0b21pemF0aW9ucywgY29uZmlnLmlkLCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXN0b21pemF0aW9uTGlua1ZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMsIGNvbmZpZyk7XG5cdFx0XHR9LCB1bmRlZmluZWQpKTtcblxuXHRcdFx0Y29uc3Qgc2VjdGlvblZpc2libGVXaGVuID0gQ29udGV4dEtleUV4cHIuaGFzKGN1c3RvbWl6YXRpb25TZWN0aW9uVmlzaWJsZUtleShzZWN0aW9uKSk7XG5cdFx0XHRjb25zdCBjb21iaW5lZFdoZW4gPSBjb25maWcud2hlblxuXHRcdFx0XHQ/IENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuZW5hYmxlZCwgc2VjdGlvblZpc2libGVXaGVuLCBjb25maWcud2hlbilcblx0XHRcdFx0OiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsIHNlY3Rpb25WaXNpYmxlV2hlbik7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIHRoZSBhY3Rpb24gd2l0aCBtZW51IGl0ZW1cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogY29uZmlnLmlkLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGNvbmZpZy5sYWJlbCxcblx0XHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IE1lbnVzLlNpZGViYXJDdXN0b21pemF0aW9ucyxcblx0XHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IGluZGV4ICsgMSxcblx0XHRcdFx0XHRcdFx0d2hlbjogY29tYmluZWRXaGVuLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGhhcm5lc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25zU2VydmljZSA9IGFjY2Vzc29yLmdldChJU2Vzc2lvbnNTZXJ2aWNlKTtcblx0XHRcdFx0XHRhd2FpdCBvcGVuQ3VzdG9taXphdGlvblNlY3Rpb25QYWdlKGVkaXRvclNlcnZpY2UsIGhhcm5lc3NTZXJ2aWNlLCBzZXNzaW9uc1NlcnZpY2UsIHNlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihDdXN0b21pemF0aW9uc1Rvb2xiYXJDb250cmlidXRpb24uSUQsIEN1c3RvbWl6YXRpb25zVG9vbGJhckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbi8qKlxuICogUmV0dXJucyB0aGUgaGFybmVzcyBpZCB0aGF0IG1hdGNoZXMgYSBnaXZlbiBzZXNzaW9uLCBvciBgdW5kZWZpbmVkYCBpZiBub1xuICogaGFybmVzcyBpcyByZWdpc3RlcmVkIGZvciBpdC5cbiAqXG4gKiBUaGUgc2Vzc2lvbidzIGByZXNvdXJjZS5zY2hlbWVgIGlzIHRoZSBwZXItaG9zdCBoYXJuZXNzIGlkIChlLmcuIGxvY2FsIEFIUFxuICogdXNlcyBgYWdlbnQtaG9zdC0ke3Byb3ZpZGVyfWAgYW5kIHJlbW90ZSBBSFAgdXNlcyBgcmVtb3RlLSR7YXV0aG9yaXR5fS0ke3Byb3ZpZGVyfWApLFxuICogd2hpbGUge0BsaW5rIElTZXNzaW9uLnNlc3Npb25UeXBlfSBpcyB0aGUgYWdlbnQgcHJvdmlkZXIgbmFtZSBzaGFyZWQgYWNyb3NzXG4gKiBob3N0cyAoZS5nLiBgY29waWxvdGNsaWApLiBMb29rdXAgdGhlcmVmb3JlIHByZWZlcnMgdGhlIHJlc291cmNlIHNjaGVtZSBzb1xuICogdGhhdCBhbiBBSFAgcmVtb3RlIHNlc3Npb24gc2VsZWN0cyBpdHMgcmVtb3RlIGhhcm5lc3MgcmF0aGVyIHRoYW4gdGhlIGxvY2FsXG4gKiBoYXJuZXNzIHdpdGggdGhlIHNhbWUgYHNlc3Npb25UeXBlYC4gVGhlIGBzZXNzaW9uVHlwZWAgaXMga2VwdCBhcyBhIGZhbGxiYWNrXG4gKiBmb3IgaGFybmVzc2VzIHdob3NlIGlkIG1hdGNoZXMgaXQgZGlyZWN0bHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaW5kSGFybmVzc0lkRm9yU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXNlc3Npb24pIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHNjaGVtZUlkID0gc2Vzc2lvbi5yZXNvdXJjZS5zY2hlbWU7XG5cdGlmIChoYXJuZXNzU2VydmljZS5maW5kSGFybmVzc0J5SWQoc2NoZW1lSWQpKSB7XG5cdFx0cmV0dXJuIHNjaGVtZUlkO1xuXHR9XG5cdGlmIChoYXJuZXNzU2VydmljZS5maW5kSGFybmVzc0J5SWQoc2Vzc2lvbi5zZXNzaW9uVHlwZSkpIHtcblx0XHRyZXR1cm4gc2Vzc2lvbi5zZXNzaW9uVHlwZTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEtlZXBzIHRoZSBhY3RpdmUgY3VzdG9taXphdGlvbiBoYXJuZXNzIGluIHN5bmMgd2l0aCB0aGUgY3VycmVudGx5IGFjdGl2ZVxuICogc2Vzc2lvbi4gVGhpcyBkcml2ZXMgdGhlIGN1c3RvbWl6YXRpb25zIHNpZGViYXIgKGNvdW50cywgZmlsdGVyaW5nKSBhbmQgdGhlXG4gKiBjdXN0b21pemF0aW9ucyBlZGl0b3Igc28gdGhleSByZWZsZWN0IHRoZSBoYXJuZXNzIHRoYXQgbWF0Y2hlcyB0aGUgc2Vzc2lvblxuICogdGhlIHVzZXIgaXMgaW50ZXJhY3Rpbmcgd2l0aC5cbiAqXG4gKiBUaGlzIGNvdmVycyB0d28gY2FzZXMgaWRlbnRpY2FsbHk6XG4gKiAgLSBvcGVuaW5nIC8gbmF2aWdhdGluZyBpbnRvIGFuIGV4aXN0aW5nIHNlc3Npb25cbiAqICAtIHNlbGVjdGluZyBcIk5ldyBzZXNzaW9uIGluIHt3b3Jrc3BhY2V9XCIgKHdoaWNoIHNldHMgYSBwZW5kaW5nIGFjdGl2ZVxuICogICAgc2Vzc2lvbiBiZWZvcmUgdGhlIHVzZXIgaGFzIHNlbnQgdGhlIGZpcnN0IHJlcXVlc3QpXG4gKi9cbmV4cG9ydCBjbGFzcyBBY3RpdmVTZXNzaW9uSGFybmVzc1N5bmNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNlc3Npb25zQWN0aXZlSGFybmVzc1N5bmMnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2Vzc2lvbnNTZXJ2aWNlIHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBoYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmUtcmVhZCBhdmFpbGFibGUgaGFybmVzc2VzIHNvIHdlIHJlLXJ1biB3aGVuIGFuIGV4dGVybmFsIGhhcm5lc3Ncblx0XHRcdC8vIChlLmcuIGFnZW50IGhvc3QsIENMSSkgcmVnaXN0ZXJzIGFzeW5jaHJvbm91c2x5IGFmdGVyIHRoZSBzZXNzaW9uXG5cdFx0XHQvLyBoYXMgYWxyZWFkeSBiZWVuIHNlbGVjdGVkLlxuXHRcdFx0aGFybmVzc1NlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdGhhcm5lc3NTZXJ2aWNlLnNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihBY3RpdmVTZXNzaW9uSGFybmVzc1N5bmNDb250cmlidXRpb24uSUQsIEFjdGl2ZVNlc3Npb25IYXJuZXNzU3luY0NvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBdUI7QUFFNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLHVCQUF1QjtBQUN6QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdCQUFtRCxvQkFBb0IscUJBQXFCO0FBQ3JHLFNBQVMsNkJBQStDO0FBQ3hELFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw0Q0FBNEM7QUFDckQsU0FBUyxrQ0FBcUQ7QUFDOUQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxxQ0FBcUMsZ0NBQWdDLDBDQUEwQztBQUN4SCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUFXLGtCQUFrQixlQUFlLFlBQVksV0FBVyxVQUFVLGlCQUFpQjtBQUN2RyxTQUFTLHNCQUFrRDtBQUUzRCxTQUFTLEdBQUcsY0FBYztBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsb0NBQW9DO0FBRTdDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CO0FBc0I1QixTQUFTLCtCQUErQixTQUF5QjtBQUNoRSxTQUFPLHVDQUF1QyxPQUFPO0FBQ3REO0FBRUEsTUFBTSw4QkFBd0Q7QUFBQSxFQUM3RCxJQUFJO0FBQUEsRUFDSixPQUFPLFNBQVMsWUFBWSxVQUFVO0FBQUEsRUFDdEMsTUFBTSxRQUFRO0FBQ2Y7QUFFTyxNQUFNLHNCQUFrRDtBQUFBLEVBQzlEO0FBQUEsSUFDQyxJQUFJ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
