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
import { localize, localize2 } from "../../../../nls.js";
import { GettingStartedInputSerializer, GettingStartedPage, inWelcomeContext } from "./gettingStarted.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorExtensions } from "../../../common/editor.js";
import { MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IWalkthroughsService } from "./gettingStartedService.js";
import { GettingStartedInput } from "./gettingStartedInput.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { isLinux, isMacintosh, isWindows, OperatingSystem as OS } from "../../../../base/common/platform.js";
import { IExtensionManagementServerService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { StartupPageEditorResolverContribution, StartupPageRunnerContribution } from "./startupPage.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { GettingStartedAccessibleView } from "./gettingStartedAccessibleView.js";
import { AgentSessionsWelcomePage } from "../../welcomeAgentSessions/browser/agentSessionsWelcome.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import * as icons from "./gettingStartedIcons.js";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openWalkthrough",
      title: localize2("miWelcome", "Welcome"),
      category: Categories.Help,
      f1: true,
      menu: {
        id: MenuId.MenubarHelpMenu,
        group: "1_welcome",
        order: 1
      },
      metadata: {
        description: localize2("minWelcomeDescription", "Opens a Walkthrough to help you get started in VS Code.")
      }
    });
  }
  run(accessor, walkthroughID, optionsOrToSide) {
    const editorService = accessor.get(IEditorService);
    const commandService = accessor.get(ICommandService);
    const configurationService = accessor.get(IConfigurationService);
    const chatEntitlementService = accessor.get(IChatEntitlementService);
    const toSide = typeof optionsOrToSide === "object" ? optionsOrToSide.toSide : optionsOrToSide;
    const inactive = typeof optionsOrToSide === "object" ? optionsOrToSide.inactive : false;
    const activeEditor = editorService.activeEditor;
    if (!walkthroughID && !chatEntitlementService.sentiment.hidden && configurationService.getValue("workbench.startupEditor") === "agentSessionsWelcomePage") {
      commandService.executeCommand(AgentSessionsWelcomePage.COMMAND_ID);
      return;
    } else {
      if (walkthroughID) {
        const selectedCategory = typeof walkthroughID === "string" ? walkthroughID : walkthroughID.category;
        let selectedStep;
        if (typeof walkthroughID === "object" && "category" in walkthroughID && "step" in walkthroughID) {
          selectedStep = `${walkthroughID.category}#${walkthroughID.step}`;
        } else {
          selectedStep = void 0;
        }
        if (selectedStep && activeEditor instanceof GettingStartedInput && activeEditor.selectedCategory === selectedCategory) {
          activeEditor.showWelcome = false;
          commandService.executeCommand("walkthroughs.selectStep", selectedStep);
          return;
        }
        let options;
        if (selectedCategory) {
          options = { selectedCategory, selectedStep, showWelcome: false, preserveFocus: toSide ?? false, inactive };
        } else {
          options = { selectedCategory, selectedStep, showWelcome: true, preserveFocus: toSide ?? false, inactive };
        }
        editorService.openEditor({
          resource: GettingStartedInput.RESOURCE,
          options
        }, toSide ? SIDE_GROUP : void 0);
      } else {
        editorService.openEditor({
          resource: GettingStartedInput.RESOURCE,
          options: { preserveFocus: toSide ?? false, inactive }
        }, toSide ? SIDE_GROUP : void 0);
      }
    }
  }
});
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(GettingStartedInput.ID, GettingStartedInputSerializer);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    GettingStartedPage,
    GettingStartedPage.ID,
    localize("welcome", "Welcome")
  ),
  [
    new SyncDescriptor(GettingStartedInput)
  ]
);
const category = localize2("welcome", "Welcome");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.goBack",
      title: localize2("welcome.goBack", "Go Back"),
      category,
      keybinding: {
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.Escape,
        when: inWelcomeContext
      },
      precondition: ContextKeyExpr.equals("activeEditor", "gettingStartedPage"),
      f1: true
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const editorPane = editorService.activeEditorPane;
    if (editorPane instanceof GettingStartedPage) {
      editorPane.escape();
    }
  }
});
CommandsRegistry.registerCommand({
  id: "walkthroughs.selectStep",
  handler: (accessor, stepID) => {
    const editorService = accessor.get(IEditorService);
    const editorPane = editorService.activeEditorPane;
    if (editorPane instanceof GettingStartedPage) {
      editorPane.selectStepLoose(stepID);
    } else {
      console.error("Cannot run walkthroughs.selectStep outside of walkthrough context");
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.markStepComplete",
      title: localize("welcome.markStepComplete", "Mark Step Complete"),
      category
    });
  }
  run(accessor, arg) {
    if (!arg) {
      return;
    }
    const gettingStartedService = accessor.get(IWalkthroughsService);
    gettingStartedService.progressStep(arg);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.markStepIncomplete",
      title: localize("welcome.markStepInomplete", "Mark Step Incomplete"),
      category
    });
  }
  run(accessor, arg) {
    if (!arg) {
      return;
    }
    const gettingStartedService = accessor.get(IWalkthroughsService);
    gettingStartedService.deprogressStep(arg);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.showAllWalkthroughs",
      title: localize2("welcome.showAllWalkthroughs", "Open Walkthrough..."),
      category,
      f1: true,
      menu: {
        id: MenuId.MenubarHelpMenu,
        group: "1_welcome",
        order: 3
      }
    });
  }
  async getQuickPickItems(contextService, gettingStartedService) {
    const categories = await gettingStartedService.getWalkthroughs();
    return categories.filter((c) => contextService.contextMatchesRules(c.when)).map((x) => ({
      id: x.id,
      label: x.title,
      detail: x.description,
      description: x.source
    }));
  }
  async run(accessor) {
    const commandService = accessor.get(ICommandService);
    const contextService = accessor.get(IContextKeyService);
    const quickInputService = accessor.get(IQuickInputService);
    const gettingStartedService = accessor.get(IWalkthroughsService);
    const extensionService = accessor.get(IExtensionService);
    const disposables = new DisposableStore();
    const quickPick = disposables.add(quickInputService.createQuickPick());
    quickPick.canSelectMany = false;
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.placeholder = localize("pickWalkthroughs", "Select a walkthrough to open");
    quickPick.items = await this.getQuickPickItems(contextService, gettingStartedService);
    quickPick.busy = true;
    disposables.add(quickPick.onDidAccept(() => {
      const selection = quickPick.selectedItems[0];
      if (selection) {
        commandService.executeCommand("workbench.action.openWalkthrough", selection.id);
      }
      quickPick.hide();
    }));
    disposables.add(quickPick.onDidHide(() => disposables.dispose()));
    await extensionService.whenInstalledExtensionsRegistered();
    disposables.add(gettingStartedService.onDidAddWalkthrough(async () => {
      quickPick.items = await this.getQuickPickItems(contextService, gettingStartedService);
    }));
    quickPick.show();
    quickPick.busy = false;
  }
});
CommandsRegistry.registerCommand({
  id: "welcome.newWorkspaceChat",
  handler: (accessor, stepID) => {
    const commandService = accessor.get(ICommandService);
    commandService.executeCommand("workbench.action.chat.open", { mode: "agent", query: "#new ", isPartialQuery: true });
  }
});
const WorkspacePlatform = new RawContextKey("workspacePlatform", void 0, localize("workspacePlatform", "The platform of the current workspace, which in remote or serverless contexts may be different from the platform of the UI"));
let WorkspacePlatformContribution = class {
  constructor(extensionManagementServerService, remoteAgentService, contextService) {
    this.extensionManagementServerService = extensionManagementServerService;
    this.remoteAgentService = remoteAgentService;
    this.contextService = contextService;
    this.remoteAgentService.getEnvironment().then((env) => {
      const remoteOS = env?.os;
      const remotePlatform = remoteOS === OS.Macintosh ? "mac" : remoteOS === OS.Windows ? "windows" : remoteOS === OS.Linux ? "linux" : void 0;
      if (remotePlatform) {
        WorkspacePlatform.bindTo(this.contextService).set(remotePlatform);
      } else if (this.extensionManagementServerService.localExtensionManagementServer) {
        if (isMacintosh) {
          WorkspacePlatform.bindTo(this.contextService).set("mac");
        } else if (isLinux) {
          WorkspacePlatform.bindTo(this.contextService).set("linux");
        } else if (isWindows) {
          WorkspacePlatform.bindTo(this.contextService).set("windows");
        }
      } else if (this.extensionManagementServerService.webExtensionManagementServer) {
        WorkspacePlatform.bindTo(this.contextService).set("webworker");
      } else {
        console.error("Error: Unable to detect workspace platform");
      }
    });
  }
};
WorkspacePlatformContribution.ID = "workbench.contrib.workspacePlatform";
WorkspacePlatformContribution = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, IContextKeyService)
], WorkspacePlatformContribution);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  ...workbenchConfigurationNodeBase,
  properties: {
    "workbench.welcomePage.walkthroughs.openOnInstall": {
      scope: ConfigurationScope.MACHINE,
      type: "boolean",
      default: true,
      description: localize("workbench.welcomePage.walkthroughs.openOnInstall", "When enabled, an extension's walkthrough will open upon install of the extension.")
    },
    "workbench.startupEditor": {
      "scope": ConfigurationScope.RESOURCE,
      "type": "string",
      "enum": ["none", "welcomePage", "readme", "newUntitledFile", "welcomePageInEmptyWorkbench", "terminal", "agentSessionsWelcomePage"],
      "enumDescriptions": [
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.none" }, "Start without an editor."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.welcomePage" }, "Open the Welcome page, with content to aid in getting started with VS Code and extensions."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.readme" }, "Open the README when opening a folder that contains one, fallback to 'welcomePage' otherwise. Note: This is only observed as a global configuration, it will be ignored if set in a workspace or folder configuration."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.newUntitledFile" }, "Open a new untitled text file (only applies when opening an empty window)."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.welcomePageInEmptyWorkbench" }, "Open the Welcome page when opening an empty workbench."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.terminal" }, "Open a new terminal in the editor area."),
        localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "workbench.startupEditor.agentSessionsWelcomePage" }, "Open the Agent Sessions Welcome page. Will override the workbench secondary side bar visibility settings.")
      ],
      "default": "welcomePage",
      "description": localize("workbench.startupEditor", "Controls which editor is shown at startup, if none are restored from the previous session."),
      "experiment": { mode: "auto" },
      agentsWindow: { default: "none", readOnly: true }
    },
    "workbench.welcomePage.preferReducedMotion": {
      scope: ConfigurationScope.APPLICATION,
      type: "boolean",
      default: false,
      deprecationMessage: localize("deprecationMessage", "Deprecated, use the global `workbench.reduceMotion`."),
      description: localize("workbench.welcomePage.preferReducedMotion", "When enabled, reduce motion in welcome page.")
    },
    "workbench.welcomePage.experimentalOnboarding": {
      scope: ConfigurationScope.APPLICATION,
      type: "boolean",
      default: true,
      tags: ["experimental"],
      description: localize("workbench.welcomePage.experimentalOnboarding", "When enabled, show the new onboarding experience instead of the classic walkthrough on first launch."),
      experiment: {
        mode: "auto"
      }
    }
  }
});
registerWorkbenchContribution2(WorkspacePlatformContribution.ID, WorkspacePlatformContribution, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(StartupPageEditorResolverContribution.ID, StartupPageEditorResolverContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(StartupPageRunnerContribution.ID, StartupPageRunnerContribution, WorkbenchPhase.AfterRestored);
AccessibleViewRegistry.register(new GettingStartedAccessibleView());
export {
  WorkspacePlatform,
  icons
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHdlbGNvbWVHZXR0aW5nU3RhcnRlZFxcYnJvd3NlclxcZ2V0dGluZ1N0YXJ0ZWQuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBHZXR0aW5nU3RhcnRlZElucHV0U2VyaWFsaXplciwgR2V0dGluZ1N0YXJ0ZWRQYWdlLCBpbldlbGNvbWVDb250ZXh0IH0gZnJvbSAnLi9nZXR0aW5nU3RhcnRlZC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiwgQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmVEZXNjcmlwdG9yLCBJRWRpdG9yUGFuZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJV2Fsa3Rocm91Z2hzU2VydmljZSB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdldHRpbmdTdGFydGVkRWRpdG9yT3B0aW9ucywgR2V0dGluZ1N0YXJ0ZWRJbnB1dCB9IGZyb20gJy4vZ2V0dGluZ1N0YXJ0ZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc01hY2ludG9zaCwgaXNXaW5kb3dzLCBPcGVyYXRpbmdTeXN0ZW0gYXMgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTdGFydHVwUGFnZUVkaXRvclJlc29sdmVyQ29udHJpYnV0aW9uLCBTdGFydHVwUGFnZVJ1bm5lckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4vc3RhcnR1cFBhZ2UuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEdldHRpbmdTdGFydGVkQWNjZXNzaWJsZVZpZXcgfSBmcm9tICcuL2dldHRpbmdTdGFydGVkQWNjZXNzaWJsZVZpZXcuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlIH0gZnJvbSAnLi4vLi4vd2VsY29tZUFnZW50U2Vzc2lvbnMvYnJvd3Nlci9hZ2VudFNlc3Npb25zV2VsY29tZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuXG5leHBvcnQgKiBhcyBpY29ucyBmcm9tICcuL2dldHRpbmdTdGFydGVkSWNvbnMuanMnO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5XYWxrdGhyb3VnaCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtaVdlbGNvbWUnLCAnV2VsY29tZScpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuSGVscCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk1lbnViYXJIZWxwTWVudSxcblx0XHRcdFx0Z3JvdXA6ICcxX3dlbGNvbWUnLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUyKCdtaW5XZWxjb21lRGVzY3JpcHRpb24nLCAnT3BlbnMgYSBXYWxrdGhyb3VnaCB0byBoZWxwIHlvdSBnZXQgc3RhcnRlZCBpbiBWUyBDb2RlLicpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKFxuXHRcdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRcdHdhbGt0aHJvdWdoSUQ6IHN0cmluZyB8IHsgY2F0ZWdvcnk6IHN0cmluZzsgc3RlcDogc3RyaW5nIH0gfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uc09yVG9TaWRlOiB7IHRvU2lkZT86IGJvb2xlYW47IGluYWN0aXZlPzogYm9vbGVhbiB9IHwgYm9vbGVhbiB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhdEVudGl0bGVtZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdEVudGl0bGVtZW50U2VydmljZSk7XG5cblx0XHRjb25zdCB0b1NpZGUgPSB0eXBlb2Ygb3B0aW9uc09yVG9TaWRlID09PSAnb2JqZWN0JyA/IG9wdGlvbnNPclRvU2lkZS50b1NpZGUgOiBvcHRpb25zT3JUb1NpZGU7XG5cdFx0Y29uc3QgaW5hY3RpdmUgPSB0eXBlb2Ygb3B0aW9uc09yVG9TaWRlID09PSAnb2JqZWN0JyA/IG9wdGlvbnNPclRvU2lkZS5pbmFjdGl2ZSA6IGZhbHNlO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXG5cdFx0Ly8gSWYgbm8gc3BlY2lmaWMgd2Fsa3Rocm91Z2ggaXMgcmVxdWVzdGVkIGFuZCBhZ2VudCBzZXNzaW9ucyB3ZWxjb21lIGlzIHByZWZlcnJlZCwgb3BlbiB0aGF0IGluc3RlYWRcblx0XHRpZiAoIXdhbGt0aHJvdWdoSUQgJiYgIWNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmhpZGRlbiAmJiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcicpID09PSAnYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJykge1xuXHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlLkNPTU1BTkRfSUQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAod2Fsa3Rocm91Z2hJRCkge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZENhdGVnb3J5ID0gdHlwZW9mIHdhbGt0aHJvdWdoSUQgPT09ICdzdHJpbmcnID8gd2Fsa3Rocm91Z2hJRCA6IHdhbGt0aHJvdWdoSUQuY2F0ZWdvcnk7XG5cdFx0XHRcdGxldCBzZWxlY3RlZFN0ZXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHR5cGVvZiB3YWxrdGhyb3VnaElEID09PSAnb2JqZWN0JyAmJiAnY2F0ZWdvcnknIGluIHdhbGt0aHJvdWdoSUQgJiYgJ3N0ZXAnIGluIHdhbGt0aHJvdWdoSUQpIHtcblx0XHRcdFx0XHRzZWxlY3RlZFN0ZXAgPSBgJHt3YWxrdGhyb3VnaElELmNhdGVnb3J5fSMke3dhbGt0aHJvdWdoSUQuc3RlcH1gO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNlbGVjdGVkU3RlcCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHRoZSB3YWxrdGhyb3VnaCBpcyBhbHJlYWR5IG9wZW4ganVzdCByZXZlYWwgdGhlIHN0ZXBcblx0XHRcdFx0aWYgKHNlbGVjdGVkU3RlcCAmJiBhY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBHZXR0aW5nU3RhcnRlZElucHV0ICYmIGFjdGl2ZUVkaXRvci5zZWxlY3RlZENhdGVnb3J5ID09PSBzZWxlY3RlZENhdGVnb3J5KSB7XG5cdFx0XHRcdFx0YWN0aXZlRWRpdG9yLnNob3dXZWxjb21lID0gZmFsc2U7XG5cdFx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dhbGt0aHJvdWdocy5zZWxlY3RTdGVwJywgc2VsZWN0ZWRTdGVwKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgb3B0aW9uczogR2V0dGluZ1N0YXJ0ZWRFZGl0b3JPcHRpb25zO1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWRDYXRlZ29yeSkge1xuXHRcdFx0XHRcdC8vIE90aGVyd2lzZSBvcGVuIHRoZSB3YWxrdGhyb3VnaCBlZGl0b3Igd2l0aCB0aGUgc2VsZWN0ZWQgY2F0ZWdvcnkgYW5kIHN0ZXBcblx0XHRcdFx0XHRvcHRpb25zID0geyBzZWxlY3RlZENhdGVnb3J5LCBzZWxlY3RlZFN0ZXAsIHNob3dXZWxjb21lOiBmYWxzZSwgcHJlc2VydmVGb2N1czogdG9TaWRlID8/IGZhbHNlLCBpbmFjdGl2ZSB9O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE9wZW4gV2VsY29tZSBwYWdlXG5cdFx0XHRcdFx0b3B0aW9ucyA9IHsgc2VsZWN0ZWRDYXRlZ29yeSwgc2VsZWN0ZWRTdGVwLCBzaG93V2VsY29tZTogdHJ1ZSwgcHJlc2VydmVGb2N1czogdG9TaWRlID8/IGZhbHNlLCBpbmFjdGl2ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IEdldHRpbmdTdGFydGVkSW5wdXQuUkVTT1VSQ0UsXG5cdFx0XHRcdFx0b3B0aW9uc1xuXHRcdFx0XHR9LCB0b1NpZGUgPyBTSURFX0dST1VQIDogdW5kZWZpbmVkKTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogR2V0dGluZ1N0YXJ0ZWRJbnB1dC5SRVNPVVJDRSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHByZXNlcnZlRm9jdXM6IHRvU2lkZSA/PyBmYWxzZSwgaW5hY3RpdmUgfVxuXHRcdFx0XHR9LCB0b1NpZGUgPyBTSURFX0dST1VQIDogdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihHZXR0aW5nU3RhcnRlZElucHV0LklELCBHZXR0aW5nU3RhcnRlZElucHV0U2VyaWFsaXplcik7XG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdEdldHRpbmdTdGFydGVkUGFnZSxcblx0XHRHZXR0aW5nU3RhcnRlZFBhZ2UuSUQsXG5cdFx0bG9jYWxpemUoJ3dlbGNvbWUnLCBcIldlbGNvbWVcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihHZXR0aW5nU3RhcnRlZElucHV0KVxuXHRdXG4pO1xuXG5jb25zdCBjYXRlZ29yeSA9IGxvY2FsaXplMignd2VsY29tZScsIFwiV2VsY29tZVwiKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd2VsY29tZS5nb0JhY2snLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd2VsY29tZS5nb0JhY2snLCAnR28gQmFjaycpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0d2hlbjogaW5XZWxjb21lQ29udGV4dFxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCAnZ2V0dGluZ1N0YXJ0ZWRQYWdlJyksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEdldHRpbmdTdGFydGVkUGFnZSkge1xuXHRcdFx0ZWRpdG9yUGFuZS5lc2NhcGUoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnd2Fsa3Rocm91Z2hzLnNlbGVjdFN0ZXAnLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IsIHN0ZXBJRDogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoZWRpdG9yUGFuZSBpbnN0YW5jZW9mIEdldHRpbmdTdGFydGVkUGFnZSkge1xuXHRcdFx0ZWRpdG9yUGFuZS5zZWxlY3RTdGVwTG9vc2Uoc3RlcElEKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5lcnJvcignQ2Fubm90IHJ1biB3YWxrdGhyb3VnaHMuc2VsZWN0U3RlcCBvdXRzaWRlIG9mIHdhbGt0aHJvdWdoIGNvbnRleHQnKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3ZWxjb21lLm1hcmtTdGVwQ29tcGxldGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3ZWxjb21lLm1hcmtTdGVwQ29tcGxldGUnLCBcIk1hcmsgU3RlcCBDb21wbGV0ZVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc6IHN0cmluZykge1xuXHRcdGlmICghYXJnKSB7IHJldHVybjsgfVxuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkU2VydmljZSA9IGFjY2Vzc29yLmdldChJV2Fsa3Rocm91Z2hzU2VydmljZSk7XG5cdFx0Z2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLnByb2dyZXNzU3RlcChhcmcpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd2VsY29tZS5tYXJrU3RlcEluY29tcGxldGUnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCd3ZWxjb21lLm1hcmtTdGVwSW5vbXBsZXRlJywgXCJNYXJrIFN0ZXAgSW5jb21wbGV0ZVwiKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmc6IHN0cmluZykge1xuXHRcdGlmICghYXJnKSB7IHJldHVybjsgfVxuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkU2VydmljZSA9IGFjY2Vzc29yLmdldChJV2Fsa3Rocm91Z2hzU2VydmljZSk7XG5cdFx0Z2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLmRlcHJvZ3Jlc3NTdGVwKGFyZyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3ZWxjb21lLnNob3dBbGxXYWxrdGhyb3VnaHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignd2VsY29tZS5zaG93QWxsV2Fsa3Rocm91Z2hzJywgJ09wZW4gV2Fsa3Rocm91Z2guLi4nKSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckhlbHBNZW51LFxuXHRcdFx0XHRncm91cDogJzFfd2VsY29tZScsXG5cdFx0XHRcdG9yZGVyOiAzLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UXVpY2tQaWNrSXRlbXMoXG5cdFx0Y29udGV4dFNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRnZXR0aW5nU3RhcnRlZFNlcnZpY2U6IElXYWxrdGhyb3VnaHNTZXJ2aWNlXG5cdCk6IFByb21pc2U8SVF1aWNrUGlja0l0ZW1bXT4ge1xuXHRcdGNvbnN0IGNhdGVnb3JpZXMgPSBhd2FpdCBnZXR0aW5nU3RhcnRlZFNlcnZpY2UuZ2V0V2Fsa3Rocm91Z2hzKCk7XG5cdFx0cmV0dXJuIGNhdGVnb3JpZXNcblx0XHRcdC5maWx0ZXIoYyA9PiBjb250ZXh0U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGMud2hlbikpXG5cdFx0XHQubWFwKHggPT4gKHtcblx0XHRcdFx0aWQ6IHguaWQsXG5cdFx0XHRcdGxhYmVsOiB4LnRpdGxlLFxuXHRcdFx0XHRkZXRhaWw6IHguZGVzY3JpcHRpb24sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB4LnNvdXJjZSxcblx0XHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGdldHRpbmdTdGFydGVkU2VydmljZSA9IGFjY2Vzc29yLmdldChJV2Fsa3Rocm91Z2hzU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBxdWlja1BpY2sgPSBkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrKCkpO1xuXHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gZmFsc2U7XG5cdFx0cXVpY2tQaWNrLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLm1hdGNoT25EZXRhaWwgPSB0cnVlO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdwaWNrV2Fsa3Rocm91Z2hzJywgJ1NlbGVjdCBhIHdhbGt0aHJvdWdoIHRvIG9wZW4nKTtcblx0XHRxdWlja1BpY2suaXRlbXMgPSBhd2FpdCB0aGlzLmdldFF1aWNrUGlja0l0ZW1zKGNvbnRleHRTZXJ2aWNlLCBnZXR0aW5nU3RhcnRlZFNlcnZpY2UpO1xuXHRcdHF1aWNrUGljay5idXN5ID0gdHJ1ZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHF1aWNrUGljay5zZWxlY3RlZEl0ZW1zWzBdO1xuXHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuV2Fsa3Rocm91Z2gnLCBzZWxlY3Rpb24uaWQpO1xuXHRcdFx0fVxuXHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEhpZGUoKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cdFx0YXdhaXQgZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlLm9uRGlkQWRkV2Fsa3Rocm91Z2goYXN5bmMgKCkgPT4ge1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gYXdhaXQgdGhpcy5nZXRRdWlja1BpY2tJdGVtcyhjb250ZXh0U2VydmljZSwgZ2V0dGluZ1N0YXJ0ZWRTZXJ2aWNlKTtcblx0XHR9KSk7XG5cdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHRxdWlja1BpY2suYnVzeSA9IGZhbHNlO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ3dlbGNvbWUubmV3V29ya3NwYWNlQ2hhdCcsXG5cdGhhbmRsZXI6IChhY2Nlc3Nvciwgc3RlcElEOiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbicsIHsgbW9kZTogJ2FnZW50JywgcXVlcnk6ICcjbmV3ICcsIGlzUGFydGlhbFF1ZXJ5OiB0cnVlIH0pO1xuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IFdvcmtzcGFjZVBsYXRmb3JtID0gbmV3IFJhd0NvbnRleHRLZXk8J21hYycgfCAnbGludXgnIHwgJ3dpbmRvd3MnIHwgJ3dlYndvcmtlcicgfCB1bmRlZmluZWQ+KCd3b3Jrc3BhY2VQbGF0Zm9ybScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3dvcmtzcGFjZVBsYXRmb3JtJywgXCJUaGUgcGxhdGZvcm0gb2YgdGhlIGN1cnJlbnQgd29ya3NwYWNlLCB3aGljaCBpbiByZW1vdGUgb3Igc2VydmVybGVzcyBjb250ZXh0cyBtYXkgYmUgZGlmZmVyZW50IGZyb20gdGhlIHBsYXRmb3JtIG9mIHRoZSBVSVwiKSk7XG5jbGFzcyBXb3Jrc3BhY2VQbGF0Zm9ybUNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLndvcmtzcGFjZVBsYXRmb3JtJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKS50aGVuKGVudiA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVPUyA9IGVudj8ub3M7XG5cblx0XHRcdGNvbnN0IHJlbW90ZVBsYXRmb3JtID0gcmVtb3RlT1MgPT09IE9TLk1hY2ludG9zaCA/ICdtYWMnXG5cdFx0XHRcdDogcmVtb3RlT1MgPT09IE9TLldpbmRvd3MgPyAnd2luZG93cydcblx0XHRcdFx0XHQ6IHJlbW90ZU9TID09PSBPUy5MaW51eCA/ICdsaW51eCdcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAocmVtb3RlUGxhdGZvcm0pIHtcblx0XHRcdFx0V29ya3NwYWNlUGxhdGZvcm0uYmluZFRvKHRoaXMuY29udGV4dFNlcnZpY2UpLnNldChyZW1vdGVQbGF0Zm9ybSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRcdFdvcmtzcGFjZVBsYXRmb3JtLmJpbmRUbyh0aGlzLmNvbnRleHRTZXJ2aWNlKS5zZXQoJ21hYycpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzTGludXgpIHtcblx0XHRcdFx0XHRXb3Jrc3BhY2VQbGF0Zm9ybS5iaW5kVG8odGhpcy5jb250ZXh0U2VydmljZSkuc2V0KCdsaW51eCcpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzV2luZG93cykge1xuXHRcdFx0XHRcdFdvcmtzcGFjZVBsYXRmb3JtLmJpbmRUbyh0aGlzLmNvbnRleHRTZXJ2aWNlKS5zZXQoJ3dpbmRvd3MnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0V29ya3NwYWNlUGxhdGZvcm0uYmluZFRvKHRoaXMuY29udGV4dFNlcnZpY2UpLnNldCgnd2Vid29ya2VyJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvcjogVW5hYmxlIHRvIGRldGVjdCB3b3Jrc3BhY2UgcGxhdGZvcm0nKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQuLi53b3JrYmVuY2hDb25maWd1cmF0aW9uTm9kZUJhc2UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnd29ya2JlbmNoLndlbGNvbWVQYWdlLndhbGt0aHJvdWdocy5vcGVuT25JbnN0YWxsJzoge1xuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnd29ya2JlbmNoLndlbGNvbWVQYWdlLndhbGt0aHJvdWdocy5vcGVuT25JbnN0YWxsJywgXCJXaGVuIGVuYWJsZWQsIGFuIGV4dGVuc2lvbidzIHdhbGt0aHJvdWdoIHdpbGwgb3BlbiB1cG9uIGluc3RhbGwgb2YgdGhlIGV4dGVuc2lvbi5cIilcblx0XHR9LFxuXHRcdCd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcic6IHtcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRSxcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQnZW51bSc6IFsnbm9uZScsICd3ZWxjb21lUGFnZScsICdyZWFkbWUnLCAnbmV3VW50aXRsZWRGaWxlJywgJ3dlbGNvbWVQYWdlSW5FbXB0eVdvcmtiZW5jaCcsICd0ZXJtaW5hbCcsICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnXSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yLm5vbmUnIH0sIFwiU3RhcnQgd2l0aG91dCBhbiBlZGl0b3IuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ3dvcmtiZW5jaC5zdGFydHVwRWRpdG9yLndlbGNvbWVQYWdlJyB9LCBcIk9wZW4gdGhlIFdlbGNvbWUgcGFnZSwgd2l0aCBjb250ZW50IHRvIGFpZCBpbiBnZXR0aW5nIHN0YXJ0ZWQgd2l0aCBWUyBDb2RlIGFuZCBleHRlbnNpb25zLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICd3b3JrYmVuY2guc3RhcnR1cEVkaXRvci5yZWFkbWUnIH0sIFwiT3BlbiB0aGUgUkVBRE1FIHdoZW4gb3BlbmluZyBhIGZvbGRlciB0aGF0IGNvbnRhaW5zIG9uZSwgZmFsbGJhY2sgdG8gJ3dlbGNvbWVQYWdlJyBvdGhlcndpc2UuIE5vdGU6IFRoaXMgaXMgb25seSBvYnNlcnZlZCBhcyBhIGdsb2JhbCBjb25maWd1cmF0aW9uLCBpdCB3aWxsIGJlIGlnbm9yZWQgaWYgc2V0IGluIGEgd29ya3NwYWNlIG9yIGZvbGRlciBjb25maWd1cmF0aW9uLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICd3b3JrYmVuY2guc3RhcnR1cEVkaXRvci5uZXdVbnRpdGxlZEZpbGUnIH0sIFwiT3BlbiBhIG5ldyB1bnRpdGxlZCB0ZXh0IGZpbGUgKG9ubHkgYXBwbGllcyB3aGVuIG9wZW5pbmcgYW4gZW1wdHkgd2luZG93KS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3Iud2VsY29tZVBhZ2VJbkVtcHR5V29ya2JlbmNoJyB9LCBcIk9wZW4gdGhlIFdlbGNvbWUgcGFnZSB3aGVuIG9wZW5pbmcgYW4gZW1wdHkgd29ya2JlbmNoLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICd3b3JrYmVuY2guc3RhcnR1cEVkaXRvci50ZXJtaW5hbCcgfSwgXCJPcGVuIGEgbmV3IHRlcm1pbmFsIGluIHRoZSBlZGl0b3IgYXJlYS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKHsgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBmb3IgYSBzZXR0aW5nLiBWYWx1ZXMgc3Vycm91bmRlZCBieSBzaW5nbGUgcXVvdGVzIGFyZSBub3QgdG8gYmUgdHJhbnNsYXRlZC4nXSwga2V5OiAnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3IuYWdlbnRTZXNzaW9uc1dlbGNvbWVQYWdlJyB9LCBcIk9wZW4gdGhlIEFnZW50IFNlc3Npb25zIFdlbGNvbWUgcGFnZS4gV2lsbCBvdmVycmlkZSB0aGUgd29ya2JlbmNoIHNlY29uZGFyeSBzaWRlIGJhciB2aXNpYmlsaXR5IHNldHRpbmdzLlwiKSxcblx0XHRcdF0sXG5cdFx0XHQnZGVmYXVsdCc6ICd3ZWxjb21lUGFnZScsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnd29ya2JlbmNoLnN0YXJ0dXBFZGl0b3InLCBcIkNvbnRyb2xzIHdoaWNoIGVkaXRvciBpcyBzaG93biBhdCBzdGFydHVwLCBpZiBub25lIGFyZSByZXN0b3JlZCBmcm9tIHRoZSBwcmV2aW91cyBzZXNzaW9uLlwiKSxcblx0XHRcdCdleHBlcmltZW50JzogeyBtb2RlOiAnYXV0bycgfSxcblx0XHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiAnbm9uZScsIHJlYWRPbmx5OiB0cnVlIH0sXG5cdFx0fSxcblx0XHQnd29ya2JlbmNoLndlbGNvbWVQYWdlLnByZWZlclJlZHVjZWRNb3Rpb24nOiB7XG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdkZXByZWNhdGlvbk1lc3NhZ2UnLCBcIkRlcHJlY2F0ZWQsIHVzZSB0aGUgZ2xvYmFsIGB3b3JrYmVuY2gucmVkdWNlTW90aW9uYC5cIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtiZW5jaC53ZWxjb21lUGFnZS5wcmVmZXJSZWR1Y2VkTW90aW9uJywgXCJXaGVuIGVuYWJsZWQsIHJlZHVjZSBtb3Rpb24gaW4gd2VsY29tZSBwYWdlLlwiKVxuXHRcdH0sXG5cdFx0J3dvcmtiZW5jaC53ZWxjb21lUGFnZS5leHBlcmltZW50YWxPbmJvYXJkaW5nJzoge1xuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3JrYmVuY2gud2VsY29tZVBhZ2UuZXhwZXJpbWVudGFsT25ib2FyZGluZycsIFwiV2hlbiBlbmFibGVkLCBzaG93IHRoZSBuZXcgb25ib2FyZGluZyBleHBlcmllbmNlIGluc3RlYWQgb2YgdGhlIGNsYXNzaWMgd2Fsa3Rocm91Z2ggb24gZmlyc3QgbGF1bmNoLlwiKSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFdvcmtzcGFjZVBsYXRmb3JtQ29udHJpYnV0aW9uLklELCBXb3Jrc3BhY2VQbGF0Zm9ybUNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoU3RhcnR1cFBhZ2VFZGl0b3JSZXNvbHZlckNvbnRyaWJ1dGlvbi5JRCwgU3RhcnR1cFBhZ2VFZGl0b3JSZXNvbHZlckNvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlKTtcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihTdGFydHVwUGFnZVJ1bm5lckNvbnRyaWJ1dGlvbi5JRCwgU3RhcnR1cFBhZ2VSdW5uZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lz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QUFBQSxRQUM5TCxTQUFTLEVBQUUsU0FBUyxDQUFDLHFHQUFxRyxHQUFHLEtBQUssc0NBQXNDLEdBQUcsNEZBQTRGO0FBQUEsUUFDdlEsU0FBUyxFQUFFLFNBQVMsQ0FBQyxxR0FBcUcsR0FBRyxLQUFLLGlDQUFpQyxHQUFHLHdOQUF3TjtBQUFBLFFBQzlYLFNBQVMsRUFBRSxTQUFTLENBQUMscUdBQXFHLEdBQUcsS0FBSywwQ0FBMEMsR0FBRyw0RUFBNEU7QUFBQSxRQUMzUCxTQUFTLEVBQUUsU0FBUyxDQUFDLHFHQUFxRyxHQUFHLEtBQUssc0RBQXNELEdBQUcsd0RBQXdEO0FBQUEsUUFDblAsU0FBUyxFQUFFLFNBQVMsQ0FBQyxxR0FBcUcsR0FBRyxLQUFLLG1DQUFtQyxHQUFHLHlDQUF5QztBQUFBLFFBQ2pOLFNBQVMsRUFBRSxTQUFTLENBQUMscUdBQXFHLEdBQUcsS0FBSyxtREFBbUQsR0FBRywyR0FBMkc7QUFBQSxNQUNwUztBQUFBLE1BQ0EsV0FBVztBQUFBLE1BQ1gsZUFBZSxTQUFTLDJCQUEyQiw0RkFBNEY7QUFBQSxNQUMvSSxjQUFjLEVBQUUsTUFBTSxPQUFPO0FBQUEsTUFDN0IsY0FBYyxFQUFFLFNBQVMsUUFBUSxVQUFVLEtBQUs7QUFBQSxJQUNqRDtBQUFBLElBQ0EsNkNBQTZDO0FBQUEsTUFDNUMsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxvQkFBb0IsU0FBUyxzQkFBc0Isc0RBQXNEO0FBQUEsTUFDekcsYUFBYSxTQUFTLDZDQUE2Qyw4Q0FBOEM7QUFBQSxJQUNsSDtBQUFBLElBQ0EsZ0RBQWdEO0FBQUEsTUFDL0MsT0FBTyxtQkFBbUI7QUFBQSxNQUMxQixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNLENBQUMsY0FBYztBQUFBLE1BQ3JCLGFBQWEsU0FBUyxnREFBZ0Qsc0dBQXNHO0FBQUEsTUFDNUssWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCwrQkFBK0IsOEJBQThCLElBQUksK0JBQStCLGVBQWUsYUFBYTtBQUM1SCwrQkFBK0Isc0NBQXNDLElBQUksdUNBQXVDLGVBQWUsWUFBWTtBQUMzSSwrQkFBK0IsOEJBQThCLElBQUksK0JBQStCLGVBQWUsYUFBYTtBQUU1SCx1QkFBdUIsU0FBUyxJQUFJLDZCQUE2QixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
