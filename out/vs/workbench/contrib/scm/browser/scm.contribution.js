import { localize, localize2 } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { registerWorkbenchContribution2, Extensions as WorkbenchExtensions, WorkbenchPhase } from "../../../common/contributions.js";
import { VIEWLET_ID, ISCMService, VIEW_PANE_ID, ISCMViewService, REPOSITORIES_VIEW_PANE_ID, HISTORY_VIEW_PANE_ID } from "../common/scm.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { MenuRegistry, MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { SCMActiveResourceContextKeyController, SCMActiveRepositoryController } from "./activity.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ViewContainerLocation, Extensions as ViewContainerExtensions } from "../../../common/views.js";
import { SCMViewPaneContainer } from "./scmViewPaneContainer.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ModesRegistry } from "../../../../editor/common/languages/modesRegistry.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ContextKeys, SCMViewPane } from "./scmViewPane.js";
import { RepositoryPicker } from "./scmViewService.js";
import { SCMRepositoriesViewPane } from "./scmRepositoriesViewPane.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Context as SuggestContext } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { InlineCompletionContextKeys } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionContextKeys.js";
import { MANAGE_TRUST_COMMAND_ID, WorkspaceTrustContext } from "../../workspace/common/workspace.js";
import { getActiveElement, isActiveElement } from "../../../../base/browser/dom.js";
import { SCMWorkingSetController } from "./workingSet.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { IListService, WorkbenchList } from "../../../../platform/list/browser/listService.js";
import { isSCMRepository } from "./util.js";
import { SCMHistoryViewPane } from "./scmHistoryViewPane.js";
import { RemoteNameContext, ResourceContextKey } from "../../../common/contextkeys.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { SCMAccessibilityHelp } from "./scmAccessibilityHelp.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { SCMHistoryItemContextContribution } from "./scmHistoryChatContext.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from "../../chat/browser/actions/chatActions.js";
import { SCMInputContextKeys } from "./scmInput.js";
import product from "../../../../platform/product/common/product.js";
ModesRegistry.registerLanguage({
  id: "scminput",
  extensions: [],
  aliases: [],
  // hide from language selector
  mimetypes: ["text/x-scm-input"]
});
const sourceControlViewIcon = registerIcon("source-control-view-icon", Codicon.sourceControl, localize("sourceControlViewIcon", "View icon of the Source Control view."));
const viewContainer = Registry.as(ViewContainerExtensions.ViewContainersRegistry).registerViewContainer({
  id: VIEWLET_ID,
  title: localize2("source control", "Source Control"),
  ctorDescriptor: new SyncDescriptor(SCMViewPaneContainer),
  storageId: "workbench.scm.views.state",
  icon: sourceControlViewIcon,
  alwaysUseContainerInfo: true,
  order: 2,
  hideIfEmpty: true
}, ViewContainerLocation.Sidebar, { doNotRegisterOpenCommand: true });
const viewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
const containerTitle = localize("source control view", "Source Control");
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
  content: localize("no open repo", "No source control providers registered."),
  when: "default"
});
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
  content: localize("no open repo in an untrusted workspace", "None of the registered source control providers work in Restricted Mode."),
  when: ContextKeyExpr.and(ContextKeyExpr.equals("scm.providerCount", 0), WorkspaceTrustContext.IsEnabled, WorkspaceTrustContext.IsTrusted.toNegated())
});
viewsRegistry.registerViewWelcomeContent(VIEW_PANE_ID, {
  content: `[${localize("manageWorkspaceTrustAction", "Manage Workspace Trust")}](command:${MANAGE_TRUST_COMMAND_ID})`,
  when: ContextKeyExpr.and(ContextKeyExpr.equals("scm.providerCount", 0), WorkspaceTrustContext.IsEnabled, WorkspaceTrustContext.IsTrusted.toNegated())
});
viewsRegistry.registerViewWelcomeContent(HISTORY_VIEW_PANE_ID, {
  content: localize("no history items", "The selected source control provider does not have any source control history items."),
  when: ContextKeys.SCMHistoryItemCount.isEqualTo(0)
});
viewsRegistry.registerViews([{
  id: REPOSITORIES_VIEW_PANE_ID,
  containerTitle,
  name: localize2("scmRepositories", "Repositories"),
  singleViewPaneContainerTitle: localize("source control repositories", "Source Control Repositories"),
  ctorDescriptor: new SyncDescriptor(SCMRepositoriesViewPane),
  canToggleVisibility: true,
  hideByDefault: true,
  canMoveView: true,
  weight: 20,
  order: 0,
  when: ContextKeyExpr.and(ContextKeyExpr.has("scm.providerCount"), ContextKeyExpr.notEquals("scm.providerCount", 0)),
  // readonly when = ContextKeyExpr.or(ContextKeyExpr.equals('config.scm.alwaysShowProviders', true), ContextKeyExpr.and(ContextKeyExpr.notEquals('scm.providerCount', 0), ContextKeyExpr.notEquals('scm.providerCount', 1)));
  containerIcon: sourceControlViewIcon
}], viewContainer);
viewsRegistry.registerViews([{
  id: VIEW_PANE_ID,
  containerTitle,
  name: localize2("scmChanges", "Changes"),
  singleViewPaneContainerTitle: containerTitle,
  ctorDescriptor: new SyncDescriptor(SCMViewPane),
  canToggleVisibility: true,
  canMoveView: true,
  weight: 40,
  order: 1,
  containerIcon: sourceControlViewIcon,
  openCommandActionDescriptor: {
    id: viewContainer.id,
    mnemonicTitle: localize({ key: "miViewSCM", comment: ["&& denotes a mnemonic"] }, "Source &&Control"),
    keybindings: {
      primary: 0,
      win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
      linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyG },
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyG }
    },
    order: 2
  }
}], viewContainer);
viewsRegistry.registerViews([{
  id: HISTORY_VIEW_PANE_ID,
  containerTitle,
  name: localize2("scmGraph", "Graph"),
  singleViewPaneContainerTitle: localize("source control graph", "Source Control Graph"),
  ctorDescriptor: new SyncDescriptor(SCMHistoryViewPane),
  canToggleVisibility: true,
  canMoveView: true,
  weight: 40,
  order: 2,
  when: ContextKeyExpr.and(
    ContextKeyExpr.has("scm.historyProviderCount"),
    ContextKeyExpr.notEquals("scm.historyProviderCount", 0)
  ),
  containerIcon: sourceControlViewIcon
}], viewContainer);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SCMActiveRepositoryController, LifecyclePhase.Restored);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SCMActiveResourceContextKeyController, LifecyclePhase.Restored);
registerWorkbenchContribution2(
  SCMWorkingSetController.ID,
  SCMWorkingSetController,
  WorkbenchPhase.AfterRestored
);
registerWorkbenchContribution2(
  SCMHistoryItemContextContribution.ID,
  SCMHistoryItemContextContribution,
  WorkbenchPhase.AfterRestored
);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "scm",
  order: 5,
  title: localize("scmConfigurationTitle", "Source Control"),
  type: "object",
  scope: ConfigurationScope.RESOURCE,
  properties: {
    "scm.diffDecorations": {
      type: "string",
      enum: ["all", "gutter", "overview", "minimap", "none"],
      enumDescriptions: [
        localize("scm.diffDecorations.all", "Show the diff decorations in all available locations."),
        localize("scm.diffDecorations.gutter", "Show the diff decorations only in the editor gutter."),
        localize("scm.diffDecorations.overviewRuler", "Show the diff decorations only in the overview ruler."),
        localize("scm.diffDecorations.minimap", "Show the diff decorations only in the minimap."),
        localize("scm.diffDecorations.none", "Do not show the diff decorations.")
      ],
      default: "all",
      description: localize("diffDecorations", "Controls diff decorations in the editor.")
    },
    "scm.diffDecorationsGutterWidth": {
      type: "number",
      enum: [1, 2, 3, 4, 5],
      default: 3,
      description: localize("diffGutterWidth", "Controls the width(px) of diff decorations in gutter (added & modified).")
    },
    "scm.diffDecorationsGutterVisibility": {
      type: "string",
      enum: ["always", "hover"],
      enumDescriptions: [
        localize("scm.diffDecorationsGutterVisibility.always", "Show the diff decorator in the gutter at all times."),
        localize("scm.diffDecorationsGutterVisibility.hover", "Show the diff decorator in the gutter only on hover.")
      ],
      description: localize("scm.diffDecorationsGutterVisibility", "Controls the visibility of the Source Control diff decorator in the gutter."),
      default: "always"
    },
    "scm.diffDecorationsGutterAction": {
      type: "string",
      enum: ["diff", "none"],
      enumDescriptions: [
        localize("scm.diffDecorationsGutterAction.diff", "Show the inline diff Peek view on click."),
        localize("scm.diffDecorationsGutterAction.none", "Do nothing.")
      ],
      description: localize("scm.diffDecorationsGutterAction", "Controls the behavior of Source Control diff gutter decorations."),
      default: "diff"
    },
    "scm.diffDecorationsGutterPattern": {
      type: "object",
      description: localize("diffGutterPattern", "Controls whether a pattern is used for the diff decorations in gutter."),
      additionalProperties: false,
      properties: {
        "added": {
          type: "boolean",
          description: localize("diffGutterPatternAdded", "Use pattern for the diff decorations in gutter for added lines.")
        },
        "modified": {
          type: "boolean",
          description: localize("diffGutterPatternModifed", "Use pattern for the diff decorations in gutter for modified lines.")
        }
      },
      default: {
        "added": false,
        "modified": true
      }
    },
    "scm.diffDecorationsIgnoreTrimWhitespace": {
      type: "string",
      enum: ["true", "false", "inherit"],
      enumDescriptions: [
        localize("scm.diffDecorationsIgnoreTrimWhitespace.true", "Ignore leading and trailing whitespace."),
        localize("scm.diffDecorationsIgnoreTrimWhitespace.false", "Do not ignore leading and trailing whitespace."),
        localize("scm.diffDecorationsIgnoreTrimWhitespace.inherit", "Inherit from `diffEditor.ignoreTrimWhitespace`.")
      ],
      description: localize("diffDecorationsIgnoreTrimWhitespace", "Controls whether leading and trailing whitespace is ignored in Source Control diff gutter decorations."),
      default: "false"
    },
    "scm.alwaysShowActions": {
      type: "boolean",
      description: localize("alwaysShowActions", "Controls whether inline actions are always visible in the Source Control view."),
      default: false
    },
    "scm.countBadge": {
      type: "string",
      enum: ["all", "focused", "off"],
      enumDescriptions: [
        localize("scm.countBadge.all", "Show the sum of all Source Control Provider count badges."),
        localize("scm.countBadge.focused", "Show the count badge of the focused Source Control Provider."),
        localize("scm.countBadge.off", "Disable the Source Control count badge.")
      ],
      description: localize("scm.countBadge", "Controls the count badge on the Source Control icon on the Activity Bar."),
      default: "all"
    },
    "scm.providerCountBadge": {
      type: "string",
      enum: ["hidden", "auto", "visible"],
      enumDescriptions: [
        localize("scm.providerCountBadge.hidden", "Hide Source Control Provider count badges."),
        localize("scm.providerCountBadge.auto", "Only show count badge for Source Control Provider when non-zero."),
        localize("scm.providerCountBadge.visible", "Show Source Control Provider count badges.")
      ],
      markdownDescription: localize("scm.providerCountBadge", "Controls the count badges on Source Control Provider headers. These headers appear in the Source Control view when there is more than one provider or when the {0} setting is enabled, and in the Source Control Repositories view.", "`#scm.alwaysShowRepositories#`"),
      default: "hidden"
    },
    "scm.defaultViewMode": {
      type: "string",
      enum: ["tree", "list"],
      enumDescriptions: [
        localize("scm.defaultViewMode.tree", "Show the repository changes as a tree."),
        localize("scm.defaultViewMode.list", "Show the repository changes as a list.")
      ],
      description: localize("scm.defaultViewMode", "Controls the default Source Control repository view mode."),
      default: "list"
    },
    "scm.defaultViewSortKey": {
      type: "string",
      enum: ["name", "path", "status"],
      enumDescriptions: [
        localize("scm.defaultViewSortKey.name", "Sort the repository changes by file name."),
        localize("scm.defaultViewSortKey.path", "Sort the repository changes by path."),
        localize("scm.defaultViewSortKey.status", "Sort the repository changes by Source Control status.")
      ],
      description: localize("scm.defaultViewSortKey", "Controls the default Source Control repository changes sort order when viewed as a list."),
      default: "path"
    },
    "scm.autoReveal": {
      type: "boolean",
      description: localize("autoReveal", "Controls whether the Source Control view should automatically reveal and select files when opening them."),
      default: true
    },
    "scm.inputFontFamily": {
      type: "string",
      markdownDescription: localize("inputFontFamily", "Controls the font for the input message. Use `default` for the workbench user interface font family, `editor` for the `#editor.fontFamily#`'s value, or a custom font family."),
      default: "default"
    },
    "scm.inputFontSize": {
      type: "number",
      markdownDescription: localize("inputFontSize", "Controls the font size for the input message in pixels."),
      default: 13
    },
    "scm.inputMaxLineCount": {
      type: "number",
      markdownDescription: localize("inputMaxLines", "Controls the maximum number of lines that the input will auto-grow to."),
      minimum: 1,
      maximum: 50,
      default: 10
    },
    "scm.inputMinLineCount": {
      type: "number",
      markdownDescription: localize("inputMinLines", "Controls the minimum number of lines that the input will auto-grow from."),
      minimum: 1,
      maximum: 50,
      default: 1
    },
    "scm.alwaysShowRepositories": {
      type: "boolean",
      markdownDescription: localize("alwaysShowRepository", "Controls whether repositories should always be visible in the Source Control view."),
      default: false
    },
    "scm.repositories.sortOrder": {
      type: "string",
      enum: ["discovery time", "name", "path"],
      enumDescriptions: [
        localize("scm.repositoriesSortOrder.discoveryTime", "Repositories in the Source Control Repositories view are sorted by discovery time. Repositories in the Source Control view are sorted in the order that they were selected."),
        localize("scm.repositoriesSortOrder.name", "Repositories in the Source Control Repositories and Source Control views are sorted by repository name."),
        localize("scm.repositoriesSortOrder.path", "Repositories in the Source Control Repositories and Source Control views are sorted by repository path.")
      ],
      description: localize("repositoriesSortOrder", "Controls the sort order of the repositories in the source control repositories view."),
      default: "discovery time"
    },
    "scm.repositories.visible": {
      type: "number",
      description: localize("providersVisible", "Controls how many repositories are visible in the Source Control Repositories section. Set to 0, to be able to manually resize the view."),
      default: 10
    },
    "scm.repositories.selectionMode": {
      type: "string",
      enum: ["multiple", "single"],
      enumDescriptions: [
        localize("scm.repositories.selectionMode.multiple", "Multiple repositories can be selected at the same time."),
        localize("scm.repositories.selectionMode.single", "Only one repository can be selected at a time.")
      ],
      description: localize("scm.repositories.selectionMode", "Controls the selection mode of the repositories in the Source Control Repositories view."),
      default: "multiple"
    },
    "scm.repositories.explorer": {
      type: "boolean",
      markdownDescription: localize("scm.repositories.explorer", "Controls whether to show repository artifacts in the Source Control Repositories view. This feature is experimental and only works when {0} is set to `{1}`.", "`#scm.repositories.selectionMode#`", "single"),
      default: false,
      tags: ["experimental"]
    },
    "scm.showActionButton": {
      type: "boolean",
      markdownDescription: localize("showActionButton", "Controls whether an action button can be shown in the Source Control view."),
      default: true
    },
    "scm.showInputActionButton": {
      type: "boolean",
      markdownDescription: localize("showInputActionButton", "Controls whether an action button can be shown in the Source Control input."),
      default: true
    },
    "scm.workingSets.enabled": {
      type: "boolean",
      description: localize("scm.workingSets.enabled", "Controls whether to store editor working sets when switching between source control history item groups."),
      default: false
    },
    "scm.workingSets.default": {
      type: "string",
      enum: ["empty", "current"],
      enumDescriptions: [
        localize("scm.workingSets.default.empty", "Use an empty working set when switching to a source control history item group that does not have a working set."),
        localize("scm.workingSets.default.current", "Use the current working set when switching to a source control history item group that does not have a working set.")
      ],
      description: localize("scm.workingSets.default", "Controls the default working set to use when switching to a source control history item group that does not have a working set."),
      default: "current"
    },
    "scm.compactFolders": {
      type: "boolean",
      description: localize("scm.compactFolders", "Controls whether the Source Control view should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element."),
      default: true
    },
    "scm.graph.pageOnScroll": {
      type: "boolean",
      description: localize("scm.graph.pageOnScroll", "Controls whether the Source Control Graph view will load the next page of items when you scroll to the end of the list."),
      default: true
    },
    "scm.graph.pageSize": {
      type: "number",
      description: localize("scm.graph.pageSize", "The number of items to show in the Source Control Graph view by default and when loading more items."),
      minimum: 1,
      maximum: 1e3,
      default: 50
    },
    "scm.graph.badges": {
      type: "string",
      enum: ["all", "filter"],
      enumDescriptions: [
        localize("scm.graph.badges.all", "Show badges of all history item groups in the Source Control Graph view."),
        localize("scm.graph.badges.filter", "Show only the badges of history item groups used as a filter in the Source Control Graph view.")
      ],
      description: localize("scm.graph.badges", "Controls which badges are shown in the Source Control Graph view. The badges are shown on the right side of the graph indicating the names of history item groups."),
      default: "filter"
    },
    "scm.graph.showIncomingChanges": {
      type: "boolean",
      description: localize("scm.graph.showIncomingChanges", "Controls whether to show incoming changes in the Source Control Graph view."),
      default: true
    },
    "scm.graph.showOutgoingChanges": {
      type: "boolean",
      description: localize("scm.graph.showOutgoingChanges", "Controls whether to show outgoing changes in the Source Control Graph view."),
      default: true
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "scm.acceptInput",
  metadata: { description: localize("scm accept", "Source Control: Accept Input"), args: [] },
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.has("scmRepository"),
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  handler: (accessor) => {
    const contextKeyService = accessor.get(IContextKeyService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    if (!repositoryId) {
      return Promise.resolve(null);
    }
    const scmService = accessor.get(ISCMService);
    const repository = scmService.getRepository(repositoryId);
    if (!repository?.provider.acceptInputCommand) {
      return Promise.resolve(null);
    }
    const id = repository.provider.acceptInputCommand.id;
    const args = repository.provider.acceptInputCommand.arguments;
    const commandService = accessor.get(ICommandService);
    return commandService.executeCommand(id, ...args || []);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "scm.clearValidation",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(
    ContextKeyExpr.has("scmRepository"),
    SCMInputContextKeys.SCMInputHasValidationMessage
  ),
  primary: KeyCode.Escape,
  handler: async (accessor) => {
    const scmViewService = accessor.get(ISCMViewService);
    scmViewService.activeRepository.get()?.repository.input.clearValidation();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "scm.clearInput",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(
    ContextKeyExpr.has("scmRepository"),
    SuggestContext.Visible.toNegated(),
    InlineCompletionContextKeys.inlineSuggestionVisible.toNegated(),
    SCMInputContextKeys.SCMInputHasValidationMessage.toNegated(),
    EditorContextKeys.hasNonEmptySelection.toNegated()
  ),
  primary: KeyCode.Escape,
  handler: async (accessor) => {
    const scmService = accessor.get(ISCMService);
    const contextKeyService = accessor.get(IContextKeyService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    const repository = repositoryId ? scmService.getRepository(repositoryId) : void 0;
    repository?.input.setValue("", true);
  }
});
const viewNextCommitCommand = {
  description: { description: localize("scm view next commit", "Source Control: View Next Commit"), args: [] },
  weight: KeybindingWeight.WorkbenchContrib,
  handler: (accessor) => {
    const contextKeyService = accessor.get(IContextKeyService);
    const scmService = accessor.get(ISCMService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    const repository = repositoryId ? scmService.getRepository(repositoryId) : void 0;
    repository?.input.showNextHistoryValue();
  }
};
const viewPreviousCommitCommand = {
  description: { description: localize("scm view previous commit", "Source Control: View Previous Commit"), args: [] },
  weight: KeybindingWeight.WorkbenchContrib,
  handler: (accessor) => {
    const contextKeyService = accessor.get(IContextKeyService);
    const scmService = accessor.get(ISCMService);
    const context = contextKeyService.getContext(getActiveElement());
    const repositoryId = context.getValue("scmRepository");
    const repository = repositoryId ? scmService.getRepository(repositoryId) : void 0;
    repository?.input.showPreviousHistoryValue();
  }
};
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewNextCommitCommand,
  id: "scm.viewNextCommit",
  when: ContextKeyExpr.and(ContextKeyExpr.has("scmRepository"), ContextKeyExpr.has("scmInputIsInLastPosition"), SuggestContext.Visible.toNegated()),
  primary: KeyCode.DownArrow
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewPreviousCommitCommand,
  id: "scm.viewPreviousCommit",
  when: ContextKeyExpr.and(ContextKeyExpr.has("scmRepository"), ContextKeyExpr.has("scmInputIsInFirstPosition"), SuggestContext.Visible.toNegated()),
  primary: KeyCode.UpArrow
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewNextCommitCommand,
  id: "scm.forceViewNextCommit",
  when: ContextKeyExpr.has("scmRepository"),
  primary: KeyMod.Alt | KeyCode.DownArrow
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  ...viewPreviousCommitCommand,
  id: "scm.forceViewPreviousCommit",
  when: ContextKeyExpr.has("scmRepository"),
  primary: KeyMod.Alt | KeyCode.UpArrow
});
CommandsRegistry.registerCommand("scm.openInIntegratedTerminal", async (accessor, ...providers) => {
  if (!providers || providers.length === 0) {
    return;
  }
  const commandService = accessor.get(ICommandService);
  const listService = accessor.get(IListService);
  let provider = providers.length === 1 ? providers[0] : void 0;
  if (!provider) {
    const list = listService.lastFocusedList;
    const element = list?.getHTMLElement();
    if (list instanceof WorkbenchList && element && isActiveElement(element)) {
      const [index] = list.getFocus();
      const focusedElement = list.element(index);
      if (isSCMRepository(focusedElement)) {
        provider = focusedElement.provider;
      }
    }
  }
  if (!provider?.rootUri) {
    return;
  }
  await commandService.executeCommand("openInIntegratedTerminal", provider.rootUri);
});
CommandsRegistry.registerCommand("scm.openInTerminal", async (accessor, provider) => {
  if (!provider || !provider.rootUri) {
    return;
  }
  const commandService = accessor.get(ICommandService);
  await commandService.executeCommand("openInTerminal", provider.rootUri);
});
CommandsRegistry.registerCommand("scm.setActiveProvider", async (accessor) => {
  const instantiationService = accessor.get(IInstantiationService);
  const scmViewService = accessor.get(ISCMViewService);
  const placeHolder = localize("scmActiveRepositoryPlaceHolder", "Select the active repository, type to filter all repositories");
  const autoQuickItemDescription = localize("scmActiveRepositoryAutoDescription", "The active repository is updated based on active editor");
  const repositoryPicker = instantiationService.createInstance(RepositoryPicker, placeHolder, autoQuickItemDescription);
  const result = await repositoryPicker.pickRepository();
  if (result?.repository) {
    const repository = result.repository !== "auto" ? result.repository : void 0;
    scmViewService.pinActiveRepository(repository);
  }
});
MenuRegistry.appendMenuItem(MenuId.SCMSourceControl, {
  group: "99_terminal",
  command: {
    id: "scm.openInTerminal",
    title: localize("open in external terminal", "Open in External Terminal")
  },
  when: ContextKeyExpr.and(
    RemoteNameContext.isEqualTo(""),
    ContextKeyExpr.equals("scmProviderHasRootUri", true),
    ContextKeyExpr.or(
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "external"),
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "both")
    )
  )
});
MenuRegistry.appendMenuItem(MenuId.SCMSourceControl, {
  group: "99_terminal",
  command: {
    id: "scm.openInIntegratedTerminal",
    title: localize("open in integrated terminal", "Open in Integrated Terminal")
  },
  when: ContextKeyExpr.and(
    ContextKeyExpr.equals("scmProviderHasRootUri", true),
    ContextKeyExpr.or(
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "integrated"),
      ContextKeyExpr.equals("config.terminal.sourceControlRepositoriesKind", "both")
    )
  )
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusPreviousInput",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeys.RepositoryVisibilityCount.notEqualsTo(0),
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusPreviousInput();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusNextInput",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeys.RepositoryVisibilityCount.notEqualsTo(0),
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusNextInput();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusPreviousResourceGroup",
  weight: KeybindingWeight.WorkbenchContrib,
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusPreviousResourceGroup();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "workbench.scm.action.focusNextResourceGroup",
  weight: KeybindingWeight.WorkbenchContrib,
  handler: async (accessor) => {
    const viewsService = accessor.get(IViewsService);
    const scmView = await viewsService.openView(VIEW_PANE_ID);
    if (scmView) {
      scmView.focusNextResourceGroup();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "scm.editor.triggerSetup",
      title: localize("scmEditorResolveMergeConflict", "Resolve Conflicts with AI"),
      icon: Codicon.chatSparkle,
      f1: false,
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ChatContextKeys.Setup.hidden.negate(),
          ChatContextKeys.Setup.disabledInWorkspace.negate(),
          ChatContextKeys.Setup.completed.negate(),
          ContextKeyExpr.in(ResourceContextKey.Resource.key, "git.mergeChanges"),
          ContextKeyExpr.equals("git.activeResourceHasMergeConflicts", true)
        )
      }
    });
  }
  async run(accessor, ...args) {
    const commandService = accessor.get(ICommandService);
    const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
    if (!result) {
      return;
    }
    const command = product.defaultChatAgent?.resolveMergeConflictsCommand;
    if (!command) {
      return;
    }
    await commandService.executeCommand(command, ...args);
  }
});
AccessibleViewRegistry.register(new SCMAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNjbVxcYnJvd3Nlclxcc2NtLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yLCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCwgSVNDTVNlcnZpY2UsIFZJRVdfUEFORV9JRCwgSVNDTVByb3ZpZGVyLCBJU0NNVmlld1NlcnZpY2UsIFJFUE9TSVRPUklFU19WSUVXX1BBTkVfSUQsIEhJU1RPUllfVklFV19QQU5FX0lEIH0gZnJvbSAnLi4vY29tbW9uL3NjbS5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBNZW51UmVnaXN0cnksIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTQ01BY3RpdmVSZXNvdXJjZUNvbnRleHRLZXlDb250cm9sbGVyLCBTQ01BY3RpdmVSZXBvc2l0b3J5Q29udHJvbGxlciB9IGZyb20gJy4vYWN0aXZpdHkuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBDb25maWd1cmF0aW9uU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlLCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIEV4dGVuc2lvbnMgYXMgVmlld0NvbnRhaW5lckV4dGVuc2lvbnMsIElWaWV3c1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFNDTVZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi9zY21WaWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IE1vZGVzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlzLCBTQ01WaWV3UGFuZSB9IGZyb20gJy4vc2NtVmlld1BhbmUuanMnO1xuaW1wb3J0IHsgUmVwb3NpdG9yeVBpY2tlciB9IGZyb20gJy4vc2NtVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU0NNUmVwb3NpdG9yaWVzVmlld1BhbmUgfSBmcm9tICcuL3NjbVJlcG9zaXRvcmllc1ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dCBhcyBTdWdnZXN0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0LmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTUFOQUdFX1RSVVNUX0NPTU1BTkRfSUQsIFdvcmtzcGFjZVRydXN0Q29udGV4dCB9IGZyb20gJy4uLy4uL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZUVsZW1lbnQsIGlzQWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU0NNV29ya2luZ1NldENvbnRyb2xsZXIgfSBmcm9tICcuL3dvcmtpbmdTZXQuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzU0NNUmVwb3NpdG9yeSB9IGZyb20gJy4vdXRpbC5qcyc7XG5pbXBvcnQgeyBTQ01IaXN0b3J5Vmlld1BhbmUgfSBmcm9tICcuL3NjbUhpc3RvcnlWaWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBSZW1vdGVOYW1lQ29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEFjY2Vzc2libGVWaWV3UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBTQ01BY2Nlc3NpYmlsaXR5SGVscCB9IGZyb20gJy4vc2NtQWNjZXNzaWJpbGl0eUhlbHAuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IFNDTUhpc3RvcnlJdGVtQ29udGV4dENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vc2NtSGlzdG9yeUNoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENIQVRfU0VUVVBfU1VQUE9SVF9BTk9OWU1PVVNfQUNUSU9OX0lEIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgU0NNSW5wdXRDb250ZXh0S2V5cyB9IGZyb20gJy4vc2NtSW5wdXQuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5cbk1vZGVzUmVnaXN0cnkucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdGlkOiAnc2NtaW5wdXQnLFxuXHRleHRlbnNpb25zOiBbXSxcblx0YWxpYXNlczogW10sIC8vIGhpZGUgZnJvbSBsYW5ndWFnZSBzZWxlY3RvclxuXHRtaW1ldHlwZXM6IFsndGV4dC94LXNjbS1pbnB1dCddXG59KTtcblxuY29uc3Qgc291cmNlQ29udHJvbFZpZXdJY29uID0gcmVnaXN0ZXJJY29uKCdzb3VyY2UtY29udHJvbC12aWV3LWljb24nLCBDb2RpY29uLnNvdXJjZUNvbnRyb2wsIGxvY2FsaXplKCdzb3VyY2VDb250cm9sVmlld0ljb24nLCAnVmlldyBpY29uIG9mIHRoZSBTb3VyY2UgQ29udHJvbCB2aWV3LicpKTtcblxuY29uc3Qgdmlld0NvbnRhaW5lciA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KS5yZWdpc3RlclZpZXdDb250YWluZXIoe1xuXHRpZDogVklFV0xFVF9JRCxcblx0dGl0bGU6IGxvY2FsaXplMignc291cmNlIGNvbnRyb2wnLCAnU291cmNlIENvbnRyb2wnKSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTQ01WaWV3UGFuZUNvbnRhaW5lciksXG5cdHN0b3JhZ2VJZDogJ3dvcmtiZW5jaC5zY20udmlld3Muc3RhdGUnLFxuXHRpY29uOiBzb3VyY2VDb250cm9sVmlld0ljb24sXG5cdGFsd2F5c1VzZUNvbnRhaW5lckluZm86IHRydWUsXG5cdG9yZGVyOiAyLFxuXHRoaWRlSWZFbXB0eTogdHJ1ZSxcbn0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCB7IGRvTm90UmVnaXN0ZXJPcGVuQ29tbWFuZDogdHJ1ZSB9KTtcblxuY29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcbmNvbnN0IGNvbnRhaW5lclRpdGxlID0gbG9jYWxpemUoJ3NvdXJjZSBjb250cm9sIHZpZXcnLCBcIlNvdXJjZSBDb250cm9sXCIpO1xuXG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KFZJRVdfUEFORV9JRCwge1xuXHRjb250ZW50OiBsb2NhbGl6ZSgnbm8gb3BlbiByZXBvJywgXCJObyBzb3VyY2UgY29udHJvbCBwcm92aWRlcnMgcmVnaXN0ZXJlZC5cIiksXG5cdHdoZW46ICdkZWZhdWx0J1xufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoVklFV19QQU5FX0lELCB7XG5cdGNvbnRlbnQ6IGxvY2FsaXplKCdubyBvcGVuIHJlcG8gaW4gYW4gdW50cnVzdGVkIHdvcmtzcGFjZScsIFwiTm9uZSBvZiB0aGUgcmVnaXN0ZXJlZCBzb3VyY2UgY29udHJvbCBwcm92aWRlcnMgd29yayBpbiBSZXN0cmljdGVkIE1vZGUuXCIpLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdzY20ucHJvdmlkZXJDb3VudCcsIDApLCBXb3Jrc3BhY2VUcnVzdENvbnRleHQuSXNFbmFibGVkLCBXb3Jrc3BhY2VUcnVzdENvbnRleHQuSXNUcnVzdGVkLnRvTmVnYXRlZCgpKVxufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoVklFV19QQU5FX0lELCB7XG5cdGNvbnRlbnQ6IGBbJHtsb2NhbGl6ZSgnbWFuYWdlV29ya3NwYWNlVHJ1c3RBY3Rpb24nLCBcIk1hbmFnZSBXb3Jrc3BhY2UgVHJ1c3RcIil9XShjb21tYW5kOiR7TUFOQUdFX1RSVVNUX0NPTU1BTkRfSUR9KWAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3NjbS5wcm92aWRlckNvdW50JywgMCksIFdvcmtzcGFjZVRydXN0Q29udGV4dC5Jc0VuYWJsZWQsIFdvcmtzcGFjZVRydXN0Q29udGV4dC5Jc1RydXN0ZWQudG9OZWdhdGVkKCkpXG59KTtcblxudmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdXZWxjb21lQ29udGVudChISVNUT1JZX1ZJRVdfUEFORV9JRCwge1xuXHRjb250ZW50OiBsb2NhbGl6ZSgnbm8gaGlzdG9yeSBpdGVtcycsIFwiVGhlIHNlbGVjdGVkIHNvdXJjZSBjb250cm9sIHByb3ZpZGVyIGRvZXMgbm90IGhhdmUgYW55IHNvdXJjZSBjb250cm9sIGhpc3RvcnkgaXRlbXMuXCIpLFxuXHR3aGVuOiBDb250ZXh0S2V5cy5TQ01IaXN0b3J5SXRlbUNvdW50LmlzRXF1YWxUbygwKVxufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbe1xuXHRpZDogUkVQT1NJVE9SSUVTX1ZJRVdfUEFORV9JRCxcblx0Y29udGFpbmVyVGl0bGUsXG5cdG5hbWU6IGxvY2FsaXplMignc2NtUmVwb3NpdG9yaWVzJywgXCJSZXBvc2l0b3JpZXNcIiksXG5cdHNpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU6IGxvY2FsaXplKCdzb3VyY2UgY29udHJvbCByZXBvc2l0b3JpZXMnLCBcIlNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllc1wiKSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTQ01SZXBvc2l0b3JpZXNWaWV3UGFuZSksXG5cdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdGhpZGVCeURlZmF1bHQ6IHRydWUsXG5cdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHR3ZWlnaHQ6IDIwLFxuXHRvcmRlcjogMCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmhhcygnc2NtLnByb3ZpZGVyQ291bnQnKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKCdzY20ucHJvdmlkZXJDb3VudCcsIDApKSxcblx0Ly8gcmVhZG9ubHkgd2hlbiA9IENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnNjbS5hbHdheXNTaG93UHJvdmlkZXJzJywgdHJ1ZSksIENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ3NjbS5wcm92aWRlckNvdW50JywgMCksIENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnc2NtLnByb3ZpZGVyQ291bnQnLCAxKSkpO1xuXHRjb250YWluZXJJY29uOiBzb3VyY2VDb250cm9sVmlld0ljb25cbn1dLCB2aWV3Q29udGFpbmVyKTtcblxudmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt7XG5cdGlkOiBWSUVXX1BBTkVfSUQsXG5cdGNvbnRhaW5lclRpdGxlLFxuXHRuYW1lOiBsb2NhbGl6ZTIoJ3NjbUNoYW5nZXMnLCAnQ2hhbmdlcycpLFxuXHRzaW5nbGVWaWV3UGFuZUNvbnRhaW5lclRpdGxlOiBjb250YWluZXJUaXRsZSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihTQ01WaWV3UGFuZSksXG5cdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHR3ZWlnaHQ6IDQwLFxuXHRvcmRlcjogMSxcblx0Y29udGFpbmVySWNvbjogc291cmNlQ29udHJvbFZpZXdJY29uLFxuXHRvcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I6IHtcblx0XHRpZDogdmlld0NvbnRhaW5lci5pZCxcblx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVmlld1NDTScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTb3VyY2UgJiZDb250cm9sXCIpLFxuXHRcdGtleWJpbmRpbmdzOiB7XG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlHIH0sXG5cdFx0XHRsaW51eDogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5RyB9LFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlHIH0sXG5cdFx0fSxcblx0XHRvcmRlcjogMixcblx0fVxufV0sIHZpZXdDb250YWluZXIpO1xuXG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3tcblx0aWQ6IEhJU1RPUllfVklFV19QQU5FX0lELFxuXHRjb250YWluZXJUaXRsZSxcblx0bmFtZTogbG9jYWxpemUyKCdzY21HcmFwaCcsIFwiR3JhcGhcIiksXG5cdHNpbmdsZVZpZXdQYW5lQ29udGFpbmVyVGl0bGU6IGxvY2FsaXplKCdzb3VyY2UgY29udHJvbCBncmFwaCcsIFwiU291cmNlIENvbnRyb2wgR3JhcGhcIiksXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoU0NNSGlzdG9yeVZpZXdQYW5lKSxcblx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdHdlaWdodDogNDAsXG5cdG9yZGVyOiAyLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q29udGV4dEtleUV4cHIuaGFzKCdzY20uaGlzdG9yeVByb3ZpZGVyQ291bnQnKSxcblx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ3NjbS5oaXN0b3J5UHJvdmlkZXJDb3VudCcsIDApLFxuXHQpLFxuXHRjb250YWluZXJJY29uOiBzb3VyY2VDb250cm9sVmlld0ljb25cbn1dLCB2aWV3Q29udGFpbmVyKTtcblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpXG5cdC5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihTQ01BY3RpdmVSZXBvc2l0b3J5Q29udHJvbGxlciwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaClcblx0LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFNDTUFjdGl2ZVJlc291cmNlQ29udGV4dEtleUNvbnRyb2xsZXIsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFxuXHRTQ01Xb3JraW5nU2V0Q29udHJvbGxlci5JRCxcblx0U0NNV29ya2luZ1NldENvbnRyb2xsZXIsXG5cdFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWRcbik7XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihcblx0U0NNSGlzdG9yeUl0ZW1Db250ZXh0Q29udHJpYnV0aW9uLklELFxuXHRTQ01IaXN0b3J5SXRlbUNvbnRleHRDb250cmlidXRpb24sXG5cdFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWRcbik7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnc2NtJyxcblx0b3JkZXI6IDUsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnc2NtQ29uZmlndXJhdGlvblRpdGxlJywgXCJTb3VyY2UgQ29udHJvbFwiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnc2NtLmRpZmZEZWNvcmF0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydhbGwnLCAnZ3V0dGVyJywgJ292ZXJ2aWV3JywgJ21pbmltYXAnLCAnbm9uZSddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9ucy5hbGwnLCBcIlNob3cgdGhlIGRpZmYgZGVjb3JhdGlvbnMgaW4gYWxsIGF2YWlsYWJsZSBsb2NhdGlvbnMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9ucy5ndXR0ZXInLCBcIlNob3cgdGhlIGRpZmYgZGVjb3JhdGlvbnMgb25seSBpbiB0aGUgZWRpdG9yIGd1dHRlci5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZGlmZkRlY29yYXRpb25zLm92ZXJ2aWV3UnVsZXInLCBcIlNob3cgdGhlIGRpZmYgZGVjb3JhdGlvbnMgb25seSBpbiB0aGUgb3ZlcnZpZXcgcnVsZXIuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9ucy5taW5pbWFwJywgXCJTaG93IHRoZSBkaWZmIGRlY29yYXRpb25zIG9ubHkgaW4gdGhlIG1pbmltYXAuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9ucy5ub25lJywgXCJEbyBub3Qgc2hvdyB0aGUgZGlmZiBkZWNvcmF0aW9ucy5cIilcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnYWxsJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGlmZkRlY29yYXRpb25zJywgXCJDb250cm9scyBkaWZmIGRlY29yYXRpb25zIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0fSxcblx0XHQnc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlcldpZHRoJzoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRlbnVtOiBbMSwgMiwgMywgNCwgNV0sXG5cdFx0XHRkZWZhdWx0OiAzLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaWZmR3V0dGVyV2lkdGgnLCBcIkNvbnRyb2xzIHRoZSB3aWR0aChweCkgb2YgZGlmZiBkZWNvcmF0aW9ucyBpbiBndXR0ZXIgKGFkZGVkICYgbW9kaWZpZWQpLlwiKVxuXHRcdH0sXG5cdFx0J3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJWaXNpYmlsaXR5Jzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdob3ZlciddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlclZpc2liaWxpdHkuYWx3YXlzJywgXCJTaG93IHRoZSBkaWZmIGRlY29yYXRvciBpbiB0aGUgZ3V0dGVyIGF0IGFsbCB0aW1lcy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyVmlzaWJpbGl0eS5ob3ZlcicsIFwiU2hvdyB0aGUgZGlmZiBkZWNvcmF0b3IgaW4gdGhlIGd1dHRlciBvbmx5IG9uIGhvdmVyLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlclZpc2liaWxpdHknLCBcIkNvbnRyb2xzIHRoZSB2aXNpYmlsaXR5IG9mIHRoZSBTb3VyY2UgQ29udHJvbCBkaWZmIGRlY29yYXRvciBpbiB0aGUgZ3V0dGVyLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdhbHdheXMnXG5cdFx0fSxcblx0XHQnc2NtLmRpZmZEZWNvcmF0aW9uc0d1dHRlckFjdGlvbic6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydkaWZmJywgJ25vbmUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJBY3Rpb24uZGlmZicsIFwiU2hvdyB0aGUgaW5saW5lIGRpZmYgUGVlayB2aWV3IG9uIGNsaWNrLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJBY3Rpb24ubm9uZScsIFwiRG8gbm90aGluZy5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbS5kaWZmRGVjb3JhdGlvbnNHdXR0ZXJBY3Rpb24nLCBcIkNvbnRyb2xzIHRoZSBiZWhhdmlvciBvZiBTb3VyY2UgQ29udHJvbCBkaWZmIGd1dHRlciBkZWNvcmF0aW9ucy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnZGlmZidcblx0XHR9LFxuXHRcdCdzY20uZGlmZkRlY29yYXRpb25zR3V0dGVyUGF0dGVybic6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaWZmR3V0dGVyUGF0dGVybicsIFwiQ29udHJvbHMgd2hldGhlciBhIHBhdHRlcm4gaXMgdXNlZCBmb3IgdGhlIGRpZmYgZGVjb3JhdGlvbnMgaW4gZ3V0dGVyLlwiKSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0J2FkZGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RpZmZHdXR0ZXJQYXR0ZXJuQWRkZWQnLCBcIlVzZSBwYXR0ZXJuIGZvciB0aGUgZGlmZiBkZWNvcmF0aW9ucyBpbiBndXR0ZXIgZm9yIGFkZGVkIGxpbmVzLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J21vZGlmaWVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RpZmZHdXR0ZXJQYXR0ZXJuTW9kaWZlZCcsIFwiVXNlIHBhdHRlcm4gZm9yIHRoZSBkaWZmIGRlY29yYXRpb25zIGluIGd1dHRlciBmb3IgbW9kaWZpZWQgbGluZXMuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J2FkZGVkJzogZmFsc2UsXG5cdFx0XHRcdCdtb2RpZmllZCc6IHRydWVcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdzY20uZGlmZkRlY29yYXRpb25zSWdub3JlVHJpbVdoaXRlc3BhY2UnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsndHJ1ZScsICdmYWxzZScsICdpbmhlcml0J10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uZGlmZkRlY29yYXRpb25zSWdub3JlVHJpbVdoaXRlc3BhY2UudHJ1ZScsIFwiSWdub3JlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9uc0lnbm9yZVRyaW1XaGl0ZXNwYWNlLmZhbHNlJywgXCJEbyBub3QgaWdub3JlIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHdoaXRlc3BhY2UuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRpZmZEZWNvcmF0aW9uc0lnbm9yZVRyaW1XaGl0ZXNwYWNlLmluaGVyaXQnLCBcIkluaGVyaXQgZnJvbSBgZGlmZkVkaXRvci5pZ25vcmVUcmltV2hpdGVzcGFjZWAuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdkaWZmRGVjb3JhdGlvbnNJZ25vcmVUcmltV2hpdGVzcGFjZScsIFwiQ29udHJvbHMgd2hldGhlciBsZWFkaW5nIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlIGlzIGlnbm9yZWQgaW4gU291cmNlIENvbnRyb2wgZGlmZiBndXR0ZXIgZGVjb3JhdGlvbnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2ZhbHNlJ1xuXHRcdH0sXG5cdFx0J3NjbS5hbHdheXNTaG93QWN0aW9ucyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWx3YXlzU2hvd0FjdGlvbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgaW5saW5lIGFjdGlvbnMgYXJlIGFsd2F5cyB2aXNpYmxlIGluIHRoZSBTb3VyY2UgQ29udHJvbCB2aWV3LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHQnc2NtLmNvdW50QmFkZ2UnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWxsJywgJ2ZvY3VzZWQnLCAnb2ZmJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzY20uY291bnRCYWRnZS5hbGwnLCBcIlNob3cgdGhlIHN1bSBvZiBhbGwgU291cmNlIENvbnRyb2wgUHJvdmlkZXIgY291bnQgYmFkZ2VzLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5jb3VudEJhZGdlLmZvY3VzZWQnLCBcIlNob3cgdGhlIGNvdW50IGJhZGdlIG9mIHRoZSBmb2N1c2VkIFNvdXJjZSBDb250cm9sIFByb3ZpZGVyLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5jb3VudEJhZGdlLm9mZicsIFwiRGlzYWJsZSB0aGUgU291cmNlIENvbnRyb2wgY291bnQgYmFkZ2UuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uY291bnRCYWRnZScsIFwiQ29udHJvbHMgdGhlIGNvdW50IGJhZGdlIG9uIHRoZSBTb3VyY2UgQ29udHJvbCBpY29uIG9uIHRoZSBBY3Rpdml0eSBCYXIuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2FsbCdcblx0XHR9LFxuXHRcdCdzY20ucHJvdmlkZXJDb3VudEJhZGdlJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2hpZGRlbicsICdhdXRvJywgJ3Zpc2libGUnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5wcm92aWRlckNvdW50QmFkZ2UuaGlkZGVuJywgXCJIaWRlIFNvdXJjZSBDb250cm9sIFByb3ZpZGVyIGNvdW50IGJhZGdlcy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ucHJvdmlkZXJDb3VudEJhZGdlLmF1dG8nLCBcIk9ubHkgc2hvdyBjb3VudCBiYWRnZSBmb3IgU291cmNlIENvbnRyb2wgUHJvdmlkZXIgd2hlbiBub24temVyby5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ucHJvdmlkZXJDb3VudEJhZGdlLnZpc2libGUnLCBcIlNob3cgU291cmNlIENvbnRyb2wgUHJvdmlkZXIgY291bnQgYmFkZ2VzLlwiKVxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20ucHJvdmlkZXJDb3VudEJhZGdlJywgXCJDb250cm9scyB0aGUgY291bnQgYmFkZ2VzIG9uIFNvdXJjZSBDb250cm9sIFByb3ZpZGVyIGhlYWRlcnMuIFRoZXNlIGhlYWRlcnMgYXBwZWFyIGluIHRoZSBTb3VyY2UgQ29udHJvbCB2aWV3IHdoZW4gdGhlcmUgaXMgbW9yZSB0aGFuIG9uZSBwcm92aWRlciBvciB3aGVuIHRoZSB7MH0gc2V0dGluZyBpcyBlbmFibGVkLCBhbmQgaW4gdGhlIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllcyB2aWV3LlwiLCAnXFxgI3NjbS5hbHdheXNTaG93UmVwb3NpdG9yaWVzI1xcYCcpLFxuXHRcdFx0ZGVmYXVsdDogJ2hpZGRlbidcblx0XHR9LFxuXHRcdCdzY20uZGVmYXVsdFZpZXdNb2RlJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3RyZWUnLCAnbGlzdCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRlZmF1bHRWaWV3TW9kZS50cmVlJywgXCJTaG93IHRoZSByZXBvc2l0b3J5IGNoYW5nZXMgYXMgYSB0cmVlLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kZWZhdWx0Vmlld01vZGUubGlzdCcsIFwiU2hvdyB0aGUgcmVwb3NpdG9yeSBjaGFuZ2VzIGFzIGEgbGlzdC5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbS5kZWZhdWx0Vmlld01vZGUnLCBcIkNvbnRyb2xzIHRoZSBkZWZhdWx0IFNvdXJjZSBDb250cm9sIHJlcG9zaXRvcnkgdmlldyBtb2RlLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdsaXN0J1xuXHRcdH0sXG5cdFx0J3NjbS5kZWZhdWx0Vmlld1NvcnRLZXknOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnbmFtZScsICdwYXRoJywgJ3N0YXR1cyddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRlZmF1bHRWaWV3U29ydEtleS5uYW1lJywgXCJTb3J0IHRoZSByZXBvc2l0b3J5IGNoYW5nZXMgYnkgZmlsZSBuYW1lLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5kZWZhdWx0Vmlld1NvcnRLZXkucGF0aCcsIFwiU29ydCB0aGUgcmVwb3NpdG9yeSBjaGFuZ2VzIGJ5IHBhdGguXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmRlZmF1bHRWaWV3U29ydEtleS5zdGF0dXMnLCBcIlNvcnQgdGhlIHJlcG9zaXRvcnkgY2hhbmdlcyBieSBTb3VyY2UgQ29udHJvbCBzdGF0dXMuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uZGVmYXVsdFZpZXdTb3J0S2V5JywgXCJDb250cm9scyB0aGUgZGVmYXVsdCBTb3VyY2UgQ29udHJvbCByZXBvc2l0b3J5IGNoYW5nZXMgc29ydCBvcmRlciB3aGVuIHZpZXdlZCBhcyBhIGxpc3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ3BhdGgnXG5cdFx0fSxcblx0XHQnc2NtLmF1dG9SZXZlYWwnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F1dG9SZXZlYWwnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIFNvdXJjZSBDb250cm9sIHZpZXcgc2hvdWxkIGF1dG9tYXRpY2FsbHkgcmV2ZWFsIGFuZCBzZWxlY3QgZmlsZXMgd2hlbiBvcGVuaW5nIHRoZW0uXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0J3NjbS5pbnB1dEZvbnRGYW1pbHknOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnB1dEZvbnRGYW1pbHknLCBcIkNvbnRyb2xzIHRoZSBmb250IGZvciB0aGUgaW5wdXQgbWVzc2FnZS4gVXNlIGBkZWZhdWx0YCBmb3IgdGhlIHdvcmtiZW5jaCB1c2VyIGludGVyZmFjZSBmb250IGZhbWlseSwgYGVkaXRvcmAgZm9yIHRoZSBgI2VkaXRvci5mb250RmFtaWx5I2AncyB2YWx1ZSwgb3IgYSBjdXN0b20gZm9udCBmYW1pbHkuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2RlZmF1bHQnXG5cdFx0fSxcblx0XHQnc2NtLmlucHV0Rm9udFNpemUnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnB1dEZvbnRTaXplJywgXCJDb250cm9scyB0aGUgZm9udCBzaXplIGZvciB0aGUgaW5wdXQgbWVzc2FnZSBpbiBwaXhlbHMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogMTNcblx0XHR9LFxuXHRcdCdzY20uaW5wdXRNYXhMaW5lQ291bnQnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnB1dE1heExpbmVzJywgXCJDb250cm9scyB0aGUgbWF4aW11bSBudW1iZXIgb2YgbGluZXMgdGhhdCB0aGUgaW5wdXQgd2lsbCBhdXRvLWdyb3cgdG8uXCIpLFxuXHRcdFx0bWluaW11bTogMSxcblx0XHRcdG1heGltdW06IDUwLFxuXHRcdFx0ZGVmYXVsdDogMTBcblx0XHR9LFxuXHRcdCdzY20uaW5wdXRNaW5MaW5lQ291bnQnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnB1dE1pbkxpbmVzJywgXCJDb250cm9scyB0aGUgbWluaW11bSBudW1iZXIgb2YgbGluZXMgdGhhdCB0aGUgaW5wdXQgd2lsbCBhdXRvLWdyb3cgZnJvbS5cIiksXG5cdFx0XHRtaW5pbXVtOiAxLFxuXHRcdFx0bWF4aW11bTogNTAsXG5cdFx0XHRkZWZhdWx0OiAxXG5cdFx0fSxcblx0XHQnc2NtLmFsd2F5c1Nob3dSZXBvc2l0b3JpZXMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWx3YXlzU2hvd1JlcG9zaXRvcnknLCBcIkNvbnRyb2xzIHdoZXRoZXIgcmVwb3NpdG9yaWVzIHNob3VsZCBhbHdheXMgYmUgdmlzaWJsZSBpbiB0aGUgU291cmNlIENvbnRyb2wgdmlldy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdH0sXG5cdFx0J3NjbS5yZXBvc2l0b3JpZXMuc29ydE9yZGVyJzoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Rpc2NvdmVyeSB0aW1lJywgJ25hbWUnLCAncGF0aCddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLnJlcG9zaXRvcmllc1NvcnRPcmRlci5kaXNjb3ZlcnlUaW1lJywgXCJSZXBvc2l0b3JpZXMgaW4gdGhlIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllcyB2aWV3IGFyZSBzb3J0ZWQgYnkgZGlzY292ZXJ5IHRpbWUuIFJlcG9zaXRvcmllcyBpbiB0aGUgU291cmNlIENvbnRyb2wgdmlldyBhcmUgc29ydGVkIGluIHRoZSBvcmRlciB0aGF0IHRoZXkgd2VyZSBzZWxlY3RlZC5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ucmVwb3NpdG9yaWVzU29ydE9yZGVyLm5hbWUnLCBcIlJlcG9zaXRvcmllcyBpbiB0aGUgU291cmNlIENvbnRyb2wgUmVwb3NpdG9yaWVzIGFuZCBTb3VyY2UgQ29udHJvbCB2aWV3cyBhcmUgc29ydGVkIGJ5IHJlcG9zaXRvcnkgbmFtZS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ucmVwb3NpdG9yaWVzU29ydE9yZGVyLnBhdGgnLCBcIlJlcG9zaXRvcmllcyBpbiB0aGUgU291cmNlIENvbnRyb2wgUmVwb3NpdG9yaWVzIGFuZCBTb3VyY2UgQ29udHJvbCB2aWV3cyBhcmUgc29ydGVkIGJ5IHJlcG9zaXRvcnkgcGF0aC5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlcG9zaXRvcmllc1NvcnRPcmRlcicsIFwiQ29udHJvbHMgdGhlIHNvcnQgb3JkZXIgb2YgdGhlIHJlcG9zaXRvcmllcyBpbiB0aGUgc291cmNlIGNvbnRyb2wgcmVwb3NpdG9yaWVzIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2Rpc2NvdmVyeSB0aW1lJ1xuXHRcdH0sXG5cdFx0J3NjbS5yZXBvc2l0b3JpZXMudmlzaWJsZSc6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm92aWRlcnNWaXNpYmxlJywgXCJDb250cm9scyBob3cgbWFueSByZXBvc2l0b3JpZXMgYXJlIHZpc2libGUgaW4gdGhlIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllcyBzZWN0aW9uLiBTZXQgdG8gMCwgdG8gYmUgYWJsZSB0byBtYW51YWxseSByZXNpemUgdGhlIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogMTBcblx0XHR9LFxuXHRcdCdzY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnbXVsdGlwbGUnLCAnc2luZ2xlJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUubXVsdGlwbGUnLCBcIk11bHRpcGxlIHJlcG9zaXRvcmllcyBjYW4gYmUgc2VsZWN0ZWQgYXQgdGhlIHNhbWUgdGltZS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUuc2luZ2xlJywgXCJPbmx5IG9uZSByZXBvc2l0b3J5IGNhbiBiZSBzZWxlY3RlZCBhdCBhIHRpbWUuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUnLCBcIkNvbnRyb2xzIHRoZSBzZWxlY3Rpb24gbW9kZSBvZiB0aGUgcmVwb3NpdG9yaWVzIGluIHRoZSBTb3VyY2UgQ29udHJvbCBSZXBvc2l0b3JpZXMgdmlldy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnbXVsdGlwbGUnXG5cdFx0fSxcblx0XHQnc2NtLnJlcG9zaXRvcmllcy5leHBsb3Jlcic6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20ucmVwb3NpdG9yaWVzLmV4cGxvcmVyJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgcmVwb3NpdG9yeSBhcnRpZmFjdHMgaW4gdGhlIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllcyB2aWV3LiBUaGlzIGZlYXR1cmUgaXMgZXhwZXJpbWVudGFsIGFuZCBvbmx5IHdvcmtzIHdoZW4gezB9IGlzIHNldCB0byBgezF9YC5cIiwgJ1xcYCNzY20ucmVwb3NpdG9yaWVzLnNlbGVjdGlvbk1vZGUjXFxgJywgJ3NpbmdsZScpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddXG5cdFx0fSxcblx0XHQnc2NtLnNob3dBY3Rpb25CdXR0b24nOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2hvd0FjdGlvbkJ1dHRvbicsIFwiQ29udHJvbHMgd2hldGhlciBhbiBhY3Rpb24gYnV0dG9uIGNhbiBiZSBzaG93biBpbiB0aGUgU291cmNlIENvbnRyb2wgdmlldy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnc2NtLnNob3dJbnB1dEFjdGlvbkJ1dHRvbic6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdzaG93SW5wdXRBY3Rpb25CdXR0b24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgYW4gYWN0aW9uIGJ1dHRvbiBjYW4gYmUgc2hvd24gaW4gdGhlIFNvdXJjZSBDb250cm9sIGlucHV0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzY20ud29ya2luZ1NldHMuZW5hYmxlZCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLndvcmtpbmdTZXRzLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gc3RvcmUgZWRpdG9yIHdvcmtpbmcgc2V0cyB3aGVuIHN3aXRjaGluZyBiZXR3ZWVuIHNvdXJjZSBjb250cm9sIGhpc3RvcnkgaXRlbSBncm91cHMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdCdzY20ud29ya2luZ1NldHMuZGVmYXVsdCc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydlbXB0eScsICdjdXJyZW50J10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdzY20ud29ya2luZ1NldHMuZGVmYXVsdC5lbXB0eScsIFwiVXNlIGFuIGVtcHR5IHdvcmtpbmcgc2V0IHdoZW4gc3dpdGNoaW5nIHRvIGEgc291cmNlIGNvbnRyb2wgaGlzdG9yeSBpdGVtIGdyb3VwIHRoYXQgZG9lcyBub3QgaGF2ZSBhIHdvcmtpbmcgc2V0LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS53b3JraW5nU2V0cy5kZWZhdWx0LmN1cnJlbnQnLCBcIlVzZSB0aGUgY3VycmVudCB3b3JraW5nIHNldCB3aGVuIHN3aXRjaGluZyB0byBhIHNvdXJjZSBjb250cm9sIGhpc3RvcnkgaXRlbSBncm91cCB0aGF0IGRvZXMgbm90IGhhdmUgYSB3b3JraW5nIHNldC5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbS53b3JraW5nU2V0cy5kZWZhdWx0JywgXCJDb250cm9scyB0aGUgZGVmYXVsdCB3b3JraW5nIHNldCB0byB1c2Ugd2hlbiBzd2l0Y2hpbmcgdG8gYSBzb3VyY2UgY29udHJvbCBoaXN0b3J5IGl0ZW0gZ3JvdXAgdGhhdCBkb2VzIG5vdCBoYXZlIGEgd29ya2luZyBzZXQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJ2N1cnJlbnQnXG5cdFx0fSxcblx0XHQnc2NtLmNvbXBhY3RGb2xkZXJzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uY29tcGFjdEZvbGRlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIFNvdXJjZSBDb250cm9sIHZpZXcgc2hvdWxkIHJlbmRlciBmb2xkZXJzIGluIGEgY29tcGFjdCBmb3JtLiBJbiBzdWNoIGEgZm9ybSwgc2luZ2xlIGNoaWxkIGZvbGRlcnMgd2lsbCBiZSBjb21wcmVzc2VkIGluIGEgY29tYmluZWQgdHJlZSBlbGVtZW50LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzY20uZ3JhcGgucGFnZU9uU2Nyb2xsJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uZ3JhcGgucGFnZU9uU2Nyb2xsJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3IHdpbGwgbG9hZCB0aGUgbmV4dCBwYWdlIG9mIGl0ZW1zIHdoZW4geW91IHNjcm9sbCB0byB0aGUgZW5kIG9mIHRoZSBsaXN0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdCdzY20uZ3JhcGgucGFnZVNpemUnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtLmdyYXBoLnBhZ2VTaXplJywgXCJUaGUgbnVtYmVyIG9mIGl0ZW1zIHRvIHNob3cgaW4gdGhlIFNvdXJjZSBDb250cm9sIEdyYXBoIHZpZXcgYnkgZGVmYXVsdCBhbmQgd2hlbiBsb2FkaW5nIG1vcmUgaXRlbXMuXCIpLFxuXHRcdFx0bWluaW11bTogMSxcblx0XHRcdG1heGltdW06IDEwMDAsXG5cdFx0XHRkZWZhdWx0OiA1MFxuXHRcdH0sXG5cdFx0J3NjbS5ncmFwaC5iYWRnZXMnOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWxsJywgJ2ZpbHRlciddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnc2NtLmdyYXBoLmJhZGdlcy5hbGwnLCBcIlNob3cgYmFkZ2VzIG9mIGFsbCBoaXN0b3J5IGl0ZW0gZ3JvdXBzIGluIHRoZSBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3LlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3NjbS5ncmFwaC5iYWRnZXMuZmlsdGVyJywgXCJTaG93IG9ubHkgdGhlIGJhZGdlcyBvZiBoaXN0b3J5IGl0ZW0gZ3JvdXBzIHVzZWQgYXMgYSBmaWx0ZXIgaW4gdGhlIFNvdXJjZSBDb250cm9sIEdyYXBoIHZpZXcuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uZ3JhcGguYmFkZ2VzJywgXCJDb250cm9scyB3aGljaCBiYWRnZXMgYXJlIHNob3duIGluIHRoZSBTb3VyY2UgQ29udHJvbCBHcmFwaCB2aWV3LiBUaGUgYmFkZ2VzIGFyZSBzaG93biBvbiB0aGUgcmlnaHQgc2lkZSBvZiB0aGUgZ3JhcGggaW5kaWNhdGluZyB0aGUgbmFtZXMgb2YgaGlzdG9yeSBpdGVtIGdyb3Vwcy5cIiksXG5cdFx0XHRkZWZhdWx0OiAnZmlsdGVyJ1xuXHRcdH0sXG5cdFx0J3NjbS5ncmFwaC5zaG93SW5jb21pbmdDaGFuZ2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uZ3JhcGguc2hvd0luY29taW5nQ2hhbmdlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IGluY29taW5nIGNoYW5nZXMgaW4gdGhlIFNvdXJjZSBDb250cm9sIEdyYXBoIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0J3NjbS5ncmFwaC5zaG93T3V0Z29pbmdDaGFuZ2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY20uZ3JhcGguc2hvd091dGdvaW5nQ2hhbmdlcycsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IG91dGdvaW5nIGNoYW5nZXMgaW4gdGhlIFNvdXJjZSBDb250cm9sIEdyYXBoIHZpZXcuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ3NjbS5hY2NlcHRJbnB1dCcsXG5cdG1ldGFkYXRhOiB7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtIGFjY2VwdCcsIFwiU291cmNlIENvbnRyb2w6IEFjY2VwdCBJbnB1dFwiKSwgYXJnczogW10gfSxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmhhcygnc2NtUmVwb3NpdG9yeScpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHQgPSBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0KGdldEFjdGl2ZUVsZW1lbnQoKSk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeUlkID0gY29udGV4dC5nZXRWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdzY21SZXBvc2l0b3J5Jyk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnlJZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBzY21TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTQ01TZXJ2aWNlKTtcblx0XHRjb25zdCByZXBvc2l0b3J5ID0gc2NtU2VydmljZS5nZXRSZXBvc2l0b3J5KHJlcG9zaXRvcnlJZCk7XG5cblx0XHRpZiAoIXJlcG9zaXRvcnk/LnByb3ZpZGVyLmFjY2VwdElucHV0Q29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBpZCA9IHJlcG9zaXRvcnkucHJvdmlkZXIuYWNjZXB0SW5wdXRDb21tYW5kLmlkO1xuXHRcdGNvbnN0IGFyZ3MgPSByZXBvc2l0b3J5LnByb3ZpZGVyLmFjY2VwdElucHV0Q29tbWFuZC5hcmd1bWVudHM7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChpZCwgLi4uKGFyZ3MgfHwgW10pKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ3NjbS5jbGVhclZhbGlkYXRpb24nLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENvbnRleHRLZXlFeHByLmhhcygnc2NtUmVwb3NpdG9yeScpLFxuXHRcdFNDTUlucHV0Q29udGV4dEtleXMuU0NNSW5wdXRIYXNWYWxpZGF0aW9uTWVzc2FnZSksXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCBzY21WaWV3U2VydmljZSA9IGFjY2Vzc29yLmdldChJU0NNVmlld1NlcnZpY2UpO1xuXHRcdHNjbVZpZXdTZXJ2aWNlLmFjdGl2ZVJlcG9zaXRvcnkuZ2V0KCk/LnJlcG9zaXRvcnkuaW5wdXQuY2xlYXJWYWxpZGF0aW9uKCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdzY20uY2xlYXJJbnB1dCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q29udGV4dEtleUV4cHIuaGFzKCdzY21SZXBvc2l0b3J5JyksXG5cdFx0U3VnZ2VzdENvbnRleHQuVmlzaWJsZS50b05lZ2F0ZWQoKSxcblx0XHRJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5saW5lU3VnZ2VzdGlvblZpc2libGUudG9OZWdhdGVkKCksXG5cdFx0U0NNSW5wdXRDb250ZXh0S2V5cy5TQ01JbnB1dEhhc1ZhbGlkYXRpb25NZXNzYWdlLnRvTmVnYXRlZCgpLFxuXHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLnRvTmVnYXRlZCgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHNjbVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNDTVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChnZXRBY3RpdmVFbGVtZW50KCkpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlJZCA9IGNvbnRleHQuZ2V0VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignc2NtUmVwb3NpdG9yeScpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSByZXBvc2l0b3J5SWQgPyBzY21TZXJ2aWNlLmdldFJlcG9zaXRvcnkocmVwb3NpdG9yeUlkKSA6IHVuZGVmaW5lZDtcblx0XHRyZXBvc2l0b3J5Py5pbnB1dC5zZXRWYWx1ZSgnJywgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5jb25zdCB2aWV3TmV4dENvbW1pdENvbW1hbmQgPSB7XG5cdGRlc2NyaXB0aW9uOiB7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NtIHZpZXcgbmV4dCBjb21taXQnLCBcIlNvdXJjZSBDb250cm9sOiBWaWV3IE5leHQgQ29tbWl0XCIpLCBhcmdzOiBbXSB9LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzY21TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTQ01TZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChnZXRBY3RpdmVFbGVtZW50KCkpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlJZCA9IGNvbnRleHQuZ2V0VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignc2NtUmVwb3NpdG9yeScpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSByZXBvc2l0b3J5SWQgPyBzY21TZXJ2aWNlLmdldFJlcG9zaXRvcnkocmVwb3NpdG9yeUlkKSA6IHVuZGVmaW5lZDtcblx0XHRyZXBvc2l0b3J5Py5pbnB1dC5zaG93TmV4dEhpc3RvcnlWYWx1ZSgpO1xuXHR9XG59O1xuXG5jb25zdCB2aWV3UHJldmlvdXNDb21taXRDb21tYW5kID0ge1xuXHRkZXNjcmlwdGlvbjogeyBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NjbSB2aWV3IHByZXZpb3VzIGNvbW1pdCcsIFwiU291cmNlIENvbnRyb2w6IFZpZXcgUHJldmlvdXMgQ29tbWl0XCIpLCBhcmdzOiBbXSB9LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBzY21TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTQ01TZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0ID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dChnZXRBY3RpdmVFbGVtZW50KCkpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlJZCA9IGNvbnRleHQuZ2V0VmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignc2NtUmVwb3NpdG9yeScpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSByZXBvc2l0b3J5SWQgPyBzY21TZXJ2aWNlLmdldFJlcG9zaXRvcnkocmVwb3NpdG9yeUlkKSA6IHVuZGVmaW5lZDtcblx0XHRyZXBvc2l0b3J5Py5pbnB1dC5zaG93UHJldmlvdXNIaXN0b3J5VmFsdWUoKTtcblx0fVxufTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdC4uLnZpZXdOZXh0Q29tbWl0Q29tbWFuZCxcblx0aWQ6ICdzY20udmlld05leHRDb21taXQnLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuaGFzKCdzY21SZXBvc2l0b3J5JyksIENvbnRleHRLZXlFeHByLmhhcygnc2NtSW5wdXRJc0luTGFzdFBvc2l0aW9uJyksIFN1Z2dlc3RDb250ZXh0LlZpc2libGUudG9OZWdhdGVkKCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvd1xufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHQuLi52aWV3UHJldmlvdXNDb21taXRDb21tYW5kLFxuXHRpZDogJ3NjbS52aWV3UHJldmlvdXNDb21taXQnLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuaGFzKCdzY21SZXBvc2l0b3J5JyksIENvbnRleHRLZXlFeHByLmhhcygnc2NtSW5wdXRJc0luRmlyc3RQb3NpdGlvbicpLCBTdWdnZXN0Q29udGV4dC5WaXNpYmxlLnRvTmVnYXRlZCgpKSxcblx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdC4uLnZpZXdOZXh0Q29tbWl0Q29tbWFuZCxcblx0aWQ6ICdzY20uZm9yY2VWaWV3TmV4dENvbW1pdCcsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmhhcygnc2NtUmVwb3NpdG9yeScpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3dcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0Li4udmlld1ByZXZpb3VzQ29tbWl0Q29tbWFuZCxcblx0aWQ6ICdzY20uZm9yY2VWaWV3UHJldmlvdXNDb21taXQnLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoJ3NjbVJlcG9zaXRvcnknKSxcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvd1xufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdzY20ub3BlbkluSW50ZWdyYXRlZFRlcm1pbmFsJywgYXN5bmMgKGFjY2Vzc29yLCAuLi5wcm92aWRlcnM6IElTQ01Qcm92aWRlcltdKSA9PiB7XG5cdGlmICghcHJvdmlkZXJzIHx8IHByb3ZpZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRjb25zdCBsaXN0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXG5cdGxldCBwcm92aWRlciA9IHByb3ZpZGVycy5sZW5ndGggPT09IDEgPyBwcm92aWRlcnNbMF0gOiB1bmRlZmluZWQ7XG5cblx0aWYgKCFwcm92aWRlcikge1xuXHRcdGNvbnN0IGxpc3QgPSBsaXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGxpc3Q/LmdldEhUTUxFbGVtZW50KCk7XG5cblx0XHRpZiAobGlzdCBpbnN0YW5jZW9mIFdvcmtiZW5jaExpc3QgJiYgZWxlbWVudCAmJiBpc0FjdGl2ZUVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IFtpbmRleF0gPSBsaXN0LmdldEZvY3VzKCk7XG5cdFx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IGxpc3QuZWxlbWVudChpbmRleCk7XG5cblx0XHRcdC8vIFNvdXJjZSBDb250cm9sIFJlcG9zaXRvcmllc1xuXHRcdFx0aWYgKGlzU0NNUmVwb3NpdG9yeShmb2N1c2VkRWxlbWVudCkpIHtcblx0XHRcdFx0cHJvdmlkZXIgPSBmb2N1c2VkRWxlbWVudC5wcm92aWRlcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoIXByb3ZpZGVyPy5yb290VXJpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ29wZW5JbkludGVncmF0ZWRUZXJtaW5hbCcsIHByb3ZpZGVyLnJvb3RVcmkpO1xufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdzY20ub3BlbkluVGVybWluYWwnLCBhc3luYyAoYWNjZXNzb3IsIHByb3ZpZGVyOiBJU0NNUHJvdmlkZXIpID0+IHtcblx0aWYgKCFwcm92aWRlciB8fCAhcHJvdmlkZXIucm9vdFVyaSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdvcGVuSW5UZXJtaW5hbCcsIHByb3ZpZGVyLnJvb3RVcmkpO1xufSk7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdzY20uc2V0QWN0aXZlUHJvdmlkZXInLCBhc3luYyAoYWNjZXNzb3IpID0+IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0Y29uc3Qgc2NtVmlld1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVNDTVZpZXdTZXJ2aWNlKTtcblxuXHRjb25zdCBwbGFjZUhvbGRlciA9IGxvY2FsaXplKCdzY21BY3RpdmVSZXBvc2l0b3J5UGxhY2VIb2xkZXInLCBcIlNlbGVjdCB0aGUgYWN0aXZlIHJlcG9zaXRvcnksIHR5cGUgdG8gZmlsdGVyIGFsbCByZXBvc2l0b3JpZXNcIik7XG5cdGNvbnN0IGF1dG9RdWlja0l0ZW1EZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdzY21BY3RpdmVSZXBvc2l0b3J5QXV0b0Rlc2NyaXB0aW9uJywgXCJUaGUgYWN0aXZlIHJlcG9zaXRvcnkgaXMgdXBkYXRlZCBiYXNlZCBvbiBhY3RpdmUgZWRpdG9yXCIpO1xuXHRjb25zdCByZXBvc2l0b3J5UGlja2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVwb3NpdG9yeVBpY2tlciwgcGxhY2VIb2xkZXIsIGF1dG9RdWlja0l0ZW1EZXNjcmlwdGlvbik7XG5cblx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVwb3NpdG9yeVBpY2tlci5waWNrUmVwb3NpdG9yeSgpO1xuXHRpZiAocmVzdWx0Py5yZXBvc2l0b3J5KSB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeSA9IHJlc3VsdC5yZXBvc2l0b3J5ICE9PSAnYXV0bycgPyByZXN1bHQucmVwb3NpdG9yeSA6IHVuZGVmaW5lZDtcblx0XHRzY21WaWV3U2VydmljZS5waW5BY3RpdmVSZXBvc2l0b3J5KHJlcG9zaXRvcnkpO1xuXHR9XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5TQ01Tb3VyY2VDb250cm9sLCB7XG5cdGdyb3VwOiAnOTlfdGVybWluYWwnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICdzY20ub3BlbkluVGVybWluYWwnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnb3BlbiBpbiBleHRlcm5hbCB0ZXJtaW5hbCcsIFwiT3BlbiBpbiBFeHRlcm5hbCBUZXJtaW5hbFwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0UmVtb3RlTmFtZUNvbnRleHQuaXNFcXVhbFRvKCcnKSxcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3NjbVByb3ZpZGVySGFzUm9vdFVyaScsIHRydWUpLFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcudGVybWluYWwuc291cmNlQ29udHJvbFJlcG9zaXRvcmllc0tpbmQnLCAnZXh0ZXJuYWwnKSxcblx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnRlcm1pbmFsLnNvdXJjZUNvbnRyb2xSZXBvc2l0b3JpZXNLaW5kJywgJ2JvdGgnKSkpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5TQ01Tb3VyY2VDb250cm9sLCB7XG5cdGdyb3VwOiAnOTlfdGVybWluYWwnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICdzY20ub3BlbkluSW50ZWdyYXRlZFRlcm1pbmFsJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ29wZW4gaW4gaW50ZWdyYXRlZCB0ZXJtaW5hbCcsIFwiT3BlbiBpbiBJbnRlZ3JhdGVkIFRlcm1pbmFsXCIpXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3NjbVByb3ZpZGVySGFzUm9vdFVyaScsIHRydWUpLFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcudGVybWluYWwuc291cmNlQ29udHJvbFJlcG9zaXRvcmllc0tpbmQnLCAnaW50ZWdyYXRlZCcpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcudGVybWluYWwuc291cmNlQ29udHJvbFJlcG9zaXRvcmllc0tpbmQnLCAnYm90aCcpKSlcbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICd3b3JrYmVuY2guc2NtLmFjdGlvbi5mb2N1c1ByZXZpb3VzSW5wdXQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleXMuUmVwb3NpdG9yeVZpc2liaWxpdHlDb3VudC5ub3RFcXVhbHNUbygwKSxcblx0aGFuZGxlcjogYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBzY21WaWV3ID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3PFNDTVZpZXdQYW5lPihWSUVXX1BBTkVfSUQpO1xuXHRcdGlmIChzY21WaWV3KSB7XG5cdFx0XHRzY21WaWV3LmZvY3VzUHJldmlvdXNJbnB1dCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmZvY3VzTmV4dElucHV0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlzLlJlcG9zaXRvcnlWaXNpYmlsaXR5Q291bnQubm90RXF1YWxzVG8oMCksXG5cdGhhbmRsZXI6IGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3Qgc2NtVmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldzxTQ01WaWV3UGFuZT4oVklFV19QQU5FX0lEKTtcblx0XHRpZiAoc2NtVmlldykge1xuXHRcdFx0c2NtVmlldy5mb2N1c05leHRJbnB1dCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmZvY3VzUHJldmlvdXNSZXNvdXJjZUdyb3VwJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdGhhbmRsZXI6IGFzeW5jIGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0Y29uc3Qgc2NtVmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldzxTQ01WaWV3UGFuZT4oVklFV19QQU5FX0lEKTtcblx0XHRpZiAoc2NtVmlldykge1xuXHRcdFx0c2NtVmlldy5mb2N1c1ByZXZpb3VzUmVzb3VyY2VHcm91cCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ3dvcmtiZW5jaC5zY20uYWN0aW9uLmZvY3VzTmV4dFJlc291cmNlR3JvdXAnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0aGFuZGxlcjogYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKTtcblx0XHRjb25zdCBzY21WaWV3ID0gYXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3PFNDTVZpZXdQYW5lPihWSUVXX1BBTkVfSUQpO1xuXHRcdGlmIChzY21WaWV3KSB7XG5cdFx0XHRzY21WaWV3LmZvY3VzTmV4dFJlc291cmNlR3JvdXAoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdzY20uZWRpdG9yLnRyaWdnZXJTZXR1cCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3NjbUVkaXRvclJlc29sdmVNZXJnZUNvbmZsaWN0JywgXCJSZXNvbHZlIENvbmZsaWN0cyB3aXRoIEFJXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZW50LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZS5uZWdhdGUoKSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuY29tcGxldGVkLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmluKFJlc291cmNlQ29udGV4dEtleS5SZXNvdXJjZS5rZXksICdnaXQubWVyZ2VDaGFuZ2VzJyksXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdnaXQuYWN0aXZlUmVzb3VyY2VIYXNNZXJnZUNvbmZsaWN0cycsIHRydWUpXG5cdFx0XHRcdClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfU1VQUE9SVF9BTk9OWU1PVVNfQUNUSU9OX0lEKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmQgPSBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnJlc29sdmVNZXJnZUNvbmZsaWN0c0NvbW1hbmQ7XG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCwgLi4uYXJncyk7XG5cdH1cbn0pO1xuXG5BY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LnJlZ2lzdGVyKG5ldyBTQ01BY2Nlc3NpYmlsaXR5SGVscCgpKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBMEMsZ0NBQWdDLGNBQWMscUJBQXFCLHNCQUFzQjtBQUNuSSxTQUFTLFlBQVksYUFBYSxjQUE0QixpQkFBaUIsMkJBQTJCLDRCQUE0QjtBQUN0SSxTQUFTLFFBQVEsZUFBZTtBQUNoQyxTQUFTLGNBQWMsUUFBUSxpQkFBaUIsZUFBZTtBQUMvRCxTQUFTLHVDQUF1QyxxQ0FBcUM7QUFDckYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBaUMsY0FBYyx5QkFBeUIsMEJBQTBCO0FBQ2xHLFNBQVMsb0JBQW9CLHNCQUFzQjtBQUNuRCxTQUFTLGtCQUFrQix1QkFBdUI7QUFDbEQsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQWtDLHVCQUF1QixjQUFjLCtCQUErQztBQUN0SCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtC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
