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
var __decorateParam = (index2, decorator) => (target, key) => decorator(target, key, index2);
import { localize } from "../../../../nls.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import * as resources from "../../../../base/common/resources.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { index } from "../../../../base/common/arrays.js";
import { isProposedApiEnabled } from "../../extensions/common/extensions.js";
import { Extensions as ExtensionFeaturesExtensions } from "../../extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { platform } from "../../../../base/common/process.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
const apiMenus = [
  {
    key: "commandPalette",
    id: MenuId.CommandPalette,
    description: localize("menus.commandPalette", "The Command Palette"),
    supportsSubmenus: false
  },
  {
    key: "touchBar",
    id: MenuId.TouchBarContext,
    description: localize("menus.touchBar", "The touch bar (macOS only)"),
    supportsSubmenus: false
  },
  {
    key: "editor/title",
    id: MenuId.EditorTitle,
    description: localize("menus.editorTitle", "The editor title menu")
  },
  {
    key: "modalEditor/editorTitle",
    id: MenuId.ModalEditorEditorTitle,
    description: localize("menus.modalEditorEditorTitle", "The editor title menu in the modal editor")
  },
  {
    key: "editor/title/run",
    id: MenuId.EditorTitleRun,
    description: localize("menus.editorTitleRun", "Run submenu inside the editor title menu")
  },
  {
    key: "editor/context",
    id: MenuId.EditorContext,
    description: localize("menus.editorContext", "The editor context menu")
  },
  {
    key: "editor/context/copy",
    id: MenuId.EditorContextCopy,
    description: localize("menus.editorContextCopyAs", "'Copy as' submenu in the editor context menu")
  },
  {
    key: "editor/context/share",
    id: MenuId.EditorContextShare,
    description: localize("menus.editorContextShare", "'Share' submenu in the editor context menu"),
    proposed: "contribShareMenu"
  },
  {
    key: "explorer/context",
    id: MenuId.ExplorerContext,
    description: localize("menus.explorerContext", "The file explorer context menu")
  },
  {
    key: "explorer/context/share",
    id: MenuId.ExplorerContextShare,
    description: localize("menus.explorerContextShare", "'Share' submenu in the file explorer context menu"),
    proposed: "contribShareMenu"
  },
  {
    key: "editor/title/context",
    id: MenuId.EditorTitleContext,
    description: localize("menus.editorTabContext", "The editor tabs context menu")
  },
  {
    key: "editor/title/context/share",
    id: MenuId.EditorTitleContextShare,
    description: localize("menus.editorTitleContextShare", "'Share' submenu inside the editor title context menu"),
    proposed: "contribShareMenu"
  },
  {
    key: "debug/callstack/context",
    id: MenuId.DebugCallStackContext,
    description: localize("menus.debugCallstackContext", "The debug callstack view context menu")
  },
  {
    key: "debug/variables/context",
    id: MenuId.DebugVariablesContext,
    description: localize("menus.debugVariablesContext", "The debug variables view context menu")
  },
  {
    key: "debug/watch/context",
    id: MenuId.DebugWatchContext,
    description: localize("menus.debugWatchContext", "The debug watch view context menu")
  },
  {
    key: "debug/toolBar",
    id: MenuId.DebugToolBar,
    description: localize("menus.debugToolBar", "The debug toolbar menu")
  },
  {
    key: "debug/createConfiguration",
    id: MenuId.DebugCreateConfiguration,
    proposed: "contribDebugCreateConfiguration",
    description: localize("menus.debugCreateConfiguation", "The debug create configuration menu")
  },
  {
    key: "notebook/variables/context",
    id: MenuId.NotebookVariablesContext,
    description: localize("menus.notebookVariablesContext", "The notebook variables view context menu")
  },
  {
    key: "menuBar/home",
    id: MenuId.MenubarHomeMenu,
    description: localize("menus.home", "The home indicator context menu (web only)"),
    proposed: "contribMenuBarHome",
    supportsSubmenus: false
  },
  {
    key: "menuBar/edit/copy",
    id: MenuId.MenubarCopy,
    description: localize("menus.opy", "'Copy as' submenu in the top level Edit menu")
  },
  {
    key: "chat/input/status",
    id: MenuId.ChatInputStatus,
    description: localize("menus.chatInputStatus", "The status indicator area at the rightmost end of the toolbar shown beneath the chat input"),
    supportsSubmenus: false
  },
  {
    key: "scm/title",
    id: MenuId.SCMTitle,
    description: localize("menus.scmTitle", "The Source Control title menu")
  },
  {
    key: "scm/sourceControl",
    id: MenuId.SCMSourceControl,
    description: localize("menus.scmSourceControl", "The Source Control menu")
  },
  {
    key: "scm/repositories/title",
    id: MenuId.SCMSourceControlTitle,
    description: localize("menus.scmSourceControlTitle", "The Source Control Repositories title menu"),
    proposed: "contribSourceControlTitleMenu"
  },
  {
    key: "scm/repository",
    id: MenuId.SCMSourceControlInline,
    description: localize("menus.scmSourceControlInline", "The Source Control repository menu")
  },
  {
    key: "scm/resourceState/context",
    id: MenuId.SCMResourceContext,
    description: localize("menus.resourceStateContext", "The Source Control resource state context menu")
  },
  {
    key: "scm/resourceFolder/context",
    id: MenuId.SCMResourceFolderContext,
    description: localize("menus.resourceFolderContext", "The Source Control resource folder context menu")
  },
  {
    key: "scm/resourceGroup/context",
    id: MenuId.SCMResourceGroupContext,
    description: localize("menus.resourceGroupContext", "The Source Control resource group context menu")
  },
  {
    key: "scm/change/title",
    id: MenuId.SCMChangeContext,
    description: localize("menus.changeTitle", "The Source Control inline change menu")
  },
  {
    key: "scm/inputBox",
    id: MenuId.SCMInputBox,
    description: localize("menus.input", "The Source Control input box menu"),
    proposed: "contribSourceControlInputBoxMenu"
  },
  {
    key: "scm/history/title",
    id: MenuId.SCMHistoryTitle,
    description: localize("menus.scmHistoryTitle", "The Source Control History title menu"),
    proposed: "contribSourceControlHistoryTitleMenu"
  },
  {
    key: "scm/historyItem/context",
    id: MenuId.SCMHistoryItemContext,
    description: localize("menus.historyItemContext", "The Source Control history item context menu"),
    proposed: "contribSourceControlHistoryItemMenu"
  },
  {
    key: "scm/historyItemRef/context",
    id: MenuId.SCMHistoryItemRefContext,
    description: localize("menus.historyItemRefContext", "The Source Control history item reference context menu"),
    proposed: "contribSourceControlHistoryItemMenu"
  },
  {
    key: "scm/artifactGroup/context",
    id: MenuId.SCMArtifactGroupContext,
    description: localize("menus.artifactGroupContext", "The Source Control artifact group context menu"),
    proposed: "contribSourceControlArtifactGroupMenu"
  },
  {
    key: "scm/artifact/context",
    id: MenuId.SCMArtifactContext,
    description: localize("menus.artifactContext", "The Source Control artifact context menu"),
    proposed: "contribSourceControlArtifactMenu"
  },
  {
    key: "statusBar/remoteIndicator",
    id: MenuId.StatusBarRemoteIndicatorMenu,
    description: localize("menus.statusBarRemoteIndicator", "The remote indicator menu in the status bar"),
    supportsSubmenus: false
  },
  {
    key: "terminal/context",
    id: MenuId.TerminalInstanceContext,
    description: localize("menus.terminalContext", "The terminal context menu")
  },
  {
    key: "terminal/title/context",
    id: MenuId.TerminalTabContext,
    description: localize("menus.terminalTabContext", "The terminal tabs context menu")
  },
  {
    key: "view/title",
    id: MenuId.ViewTitle,
    description: localize("view.viewTitle", "The contributed view title menu")
  },
  {
    key: "viewContainer/title",
    id: MenuId.ViewContainerTitle,
    description: localize("view.containerTitle", "The contributed view container title menu"),
    proposed: "contribViewContainerTitle"
  },
  {
    key: "view/item/context",
    id: MenuId.ViewItemContext,
    description: localize("view.itemContext", "The contributed view item context menu")
  },
  {
    key: "comments/comment/editorActions",
    id: MenuId.CommentEditorActions,
    description: localize("commentThread.editorActions", "The contributed comment editor actions"),
    proposed: "contribCommentEditorActionsMenu"
  },
  {
    key: "comments/commentThread/title",
    id: MenuId.CommentThreadTitle,
    description: localize("commentThread.title", "The contributed comment thread title menu")
  },
  {
    key: "comments/commentThread/context",
    id: MenuId.CommentThreadActions,
    description: localize("commentThread.actions", "The contributed comment thread context menu, rendered as buttons below the comment editor"),
    supportsSubmenus: false
  },
  {
    key: "comments/commentThread/additionalActions",
    id: MenuId.CommentThreadAdditionalActions,
    description: localize("commentThread.actions", "The contributed comment thread context menu, rendered as buttons below the comment editor"),
    supportsSubmenus: true,
    proposed: "contribCommentThreadAdditionalMenu"
  },
  {
    key: "comments/commentThread/title/context",
    id: MenuId.CommentThreadTitleContext,
    description: localize("commentThread.titleContext", "The contributed comment thread title's peek context menu, rendered as a right click menu on the comment thread's peek title."),
    proposed: "contribCommentPeekContext"
  },
  {
    key: "comments/comment/title",
    id: MenuId.CommentTitle,
    description: localize("comment.title", "The contributed comment title menu")
  },
  {
    key: "comments/comment/context",
    id: MenuId.CommentActions,
    description: localize("comment.actions", "The contributed comment context menu, rendered as buttons below the comment editor"),
    supportsSubmenus: false
  },
  {
    key: "comments/commentThread/comment/context",
    id: MenuId.CommentThreadCommentContext,
    description: localize("comment.commentContext", "The contributed comment context menu, rendered as a right click menu on the an individual comment in the comment thread's peek view."),
    proposed: "contribCommentPeekContext"
  },
  {
    key: "commentsView/commentThread/context",
    id: MenuId.CommentsViewThreadActions,
    description: localize("commentsView.threadActions", "The contributed comment thread context menu in the comments view"),
    proposed: "contribCommentsViewThreadMenus"
  },
  {
    key: "notebook/toolbar",
    id: MenuId.NotebookToolbar,
    description: localize("notebook.toolbar", "The contributed notebook toolbar menu")
  },
  {
    key: "notebook/kernelSource",
    id: MenuId.NotebookKernelSource,
    description: localize("notebook.kernelSource", "The contributed notebook kernel sources menu"),
    proposed: "notebookKernelSource"
  },
  {
    key: "notebook/cell/title",
    id: MenuId.NotebookCellTitle,
    description: localize("notebook.cell.title", "The contributed notebook cell title menu")
  },
  {
    key: "notebook/cell/execute",
    id: MenuId.NotebookCellExecute,
    description: localize("notebook.cell.execute", "The contributed notebook cell execution menu")
  },
  {
    key: "interactive/toolbar",
    id: MenuId.InteractiveToolbar,
    description: localize("interactive.toolbar", "The contributed interactive toolbar menu")
  },
  {
    key: "interactive/cell/title",
    id: MenuId.InteractiveCellTitle,
    description: localize("interactive.cell.title", "The contributed interactive cell title menu")
  },
  {
    key: "issue/reporter",
    id: MenuId.IssueReporter,
    description: localize("issue.reporter", "The contributed issue reporter menu")
  },
  {
    key: "testing/item/context",
    id: MenuId.TestItem,
    description: localize("testing.item.context", "The contributed test item menu")
  },
  {
    key: "testing/item/gutter",
    id: MenuId.TestItemGutter,
    description: localize("testing.item.gutter.title", "The menu for a gutter decoration for a test item")
  },
  {
    key: "testing/profiles/context",
    id: MenuId.TestProfilesContext,
    description: localize("testing.profiles.context.title", "The menu for configuring testing profiles.")
  },
  {
    key: "testing/item/result",
    id: MenuId.TestPeekElement,
    description: localize("testing.item.result.title", "The menu for an item in the Test Results view or peek.")
  },
  {
    key: "testing/message/context",
    id: MenuId.TestMessageContext,
    description: localize("testing.message.context.title", "A prominent button overlaying editor content where the message is displayed")
  },
  {
    key: "testing/message/content",
    id: MenuId.TestMessageContent,
    description: localize("testing.message.content.title", "Context menu for the message in the results tree")
  },
  {
    key: "extension/context",
    id: MenuId.ExtensionContext,
    description: localize("menus.extensionContext", "The extension context menu")
  },
  {
    key: "timeline/title",
    id: MenuId.TimelineTitle,
    description: localize("view.timelineTitle", "The Timeline view title menu")
  },
  {
    key: "timeline/item/context",
    id: MenuId.TimelineItemContext,
    description: localize("view.timelineContext", "The Timeline view item context menu")
  },
  {
    key: "ports/item/context",
    id: MenuId.TunnelContext,
    description: localize("view.tunnelContext", "The Ports view item context menu")
  },
  {
    key: "ports/item/origin/inline",
    id: MenuId.TunnelOriginInline,
    description: localize("view.tunnelOriginInline", "The Ports view item origin inline menu")
  },
  {
    key: "ports/item/port/inline",
    id: MenuId.TunnelPortInline,
    description: localize("view.tunnelPortInline", "The Ports view item port inline menu")
  },
  {
    key: "file/newFile",
    id: MenuId.NewFile,
    description: localize("file.newFile", "The 'New File...' quick pick, shown on welcome page and File menu."),
    supportsSubmenus: false
  },
  {
    key: "webview/context",
    id: MenuId.WebviewContext,
    description: localize("webview.context", "The webview context menu")
  },
  {
    key: "file/share",
    id: MenuId.MenubarShare,
    description: localize("menus.share", "Share submenu shown in the top level File menu."),
    proposed: "contribShareMenu"
  },
  {
    key: "editor/inlineCompletions/actions",
    id: MenuId.InlineCompletionsActions,
    description: localize("inlineCompletions.actions", "The actions shown when hovering on an inline completion"),
    supportsSubmenus: false,
    proposed: "inlineCompletionsAdditions"
  },
  {
    key: "editor/content",
    id: MenuId.EditorContent,
    description: localize("merge.toolbar", "The prominent button in an editor, overlays its content"),
    proposed: "contribEditorContentMenu"
  },
  {
    key: "editor/lineNumber/context",
    id: MenuId.EditorLineNumberContext,
    description: localize("editorLineNumberContext", "The contributed editor line number context menu")
  },
  {
    key: "mergeEditor/result/title",
    id: MenuId.MergeInputResultToolbar,
    description: localize("menus.mergeEditorResult", "The result toolbar of the merge editor"),
    proposed: "contribMergeEditorMenus"
  },
  {
    key: "multiDiffEditor/content",
    id: MenuId.MultiDiffEditorContent,
    description: localize("menus.multiDiffEditorContent", "A prominent button overlaying the multi diff editor"),
    proposed: "contribEditorContentMenu"
  },
  {
    key: "multiDiffEditor/resource/title",
    id: MenuId.MultiDiffEditorFileToolbar,
    description: localize("menus.multiDiffEditorResource", "The resource toolbar in the multi diff editor"),
    proposed: "contribMultiDiffEditorMenus"
  },
  {
    key: "diffEditor/gutter/hunk",
    id: MenuId.DiffEditorHunkToolbar,
    description: localize("menus.diffEditorGutterToolBarMenus", "The gutter toolbar in the diff editor"),
    proposed: "contribDiffEditorGutterToolBarMenus"
  },
  {
    key: "diffEditor/gutter/selection",
    id: MenuId.DiffEditorSelectionToolbar,
    description: localize("menus.diffEditorGutterToolBarMenus", "The gutter toolbar in the diff editor"),
    proposed: "contribDiffEditorGutterToolBarMenus"
  },
  {
    key: "searchPanel/aiResults/commands",
    id: MenuId.SearchActionMenu,
    description: localize("searchPanel.aiResultsCommands", "The commands that will contribute to the menu rendered as buttons next to the AI search title")
  },
  {
    key: "editor/context/chat",
    id: MenuId.ChatTextEditorMenu,
    description: localize("menus.chatTextEditor", "The Chat submenu in the text editor context menu."),
    supportsSubmenus: false,
    proposed: "chatParticipantPrivate"
  },
  {
    key: "chat/input/editing/sessionToolbar",
    id: MenuId.ChatEditingSessionChangesToolbar,
    description: localize("menus.chatEditingSessionChangesToolbar", "The Chat Editing widget toolbar menu for session changes."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "chat/input/editing/sessionTitleToolbar",
    id: MenuId.ChatEditingSessionTitleToolbar,
    description: localize("menus.chatEditingSessionTitleToolbar", "The Chat Editing widget toolbar menu for session title."),
    proposed: "chatSessionsProvider"
  },
  {
    // TODO: rename this to something like: `chatSessions/item/inline`
    key: "chat/chatSessions",
    id: MenuId.AgentSessionsContext,
    description: localize("menus.chatSessions", "The Chat Sessions menu."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chatSessions/item/context",
    id: MenuId.SessionItemContextMenu,
    description: localize("menus.chatSessionsItemContext", "The context menu for items in the Sessions window's session list."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chatSessions/newSession",
    id: MenuId.AgentSessionsCreateSubMenu,
    description: localize("menus.chatSessionsNewSession", "Menu for new chat sessions."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chat/multiDiff/context",
    id: MenuId.ChatMultiDiffContext,
    description: localize("menus.chatMultiDiffContext", "The Chat Multi-Diff context menu."),
    supportsSubmenus: false,
    proposed: "chatSessionsProvider"
  },
  {
    key: "chat/customizations/create",
    id: MenuId.for("AICustomizationManagementCreate"),
    description: localize("menus.chatCustomizationsCreate", "The create button in the Chat Customizations management editor."),
    supportsSubmenus: false,
    proposed: "chatSessionCustomizationProvider"
  },
  {
    key: "chat/customizations/item",
    id: MenuId.for("AICustomizationManagementEditorItem"),
    description: localize("menus.chatCustomizationsItem", "The item context menu in the Chat Customizations management editor, including inline actions."),
    supportsSubmenus: false,
    proposed: "chatSessionCustomizationProvider"
  },
  {
    key: "chat/editor/inlineGutter",
    id: MenuId.ChatEditorInlineMenu,
    description: localize("menus.chatEditorInlineGutter", "The inline gutter menu in the chat editor."),
    supportsSubmenus: false,
    proposed: "contribChatEditorInlineGutterMenu"
  },
  {
    key: "chat/contextUsage/actions",
    id: MenuId.ChatContextUsageActions,
    description: localize("menus.chatContextUsageActions", "Actions in the chat context usage details popup."),
    proposed: "chatParticipantAdditions"
  },
  {
    key: "chat/newSession",
    id: MenuId.ChatNewMenu,
    description: localize("menus.chatNewSession", "The Chat new session menu."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "agents/changes/actions",
    id: MenuId.AgentsChangesToolbar,
    description: localize("menus.agentsChangesToolbar", "The Changes view toolbar of the agents window."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "agents/changes/actions/primary",
    id: MenuId.AgentsChangesPrimaryActionSubMenu,
    description: localize("menus.agentsChangesPrimaryActionSubMenu", "The Changes view toolbar primary action submenu in the agents window."),
    proposed: "chatSessionsProvider"
  },
  {
    key: "agents/change/inline",
    id: MenuId.AgentsChangeInlineToolbar,
    description: localize("menus.agentsChangeInline", "The Changes view inline menu in the agents window."),
    proposed: "chatSessionsProvider"
  }
];
var schema;
((schema2) => {
  function isMenuItem(item) {
    return typeof item.command === "string";
  }
  schema2.isMenuItem = isMenuItem;
  function isValidMenuItem(item, collector) {
    if (typeof item.command !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "command"));
      return false;
    }
    if (item.alt && typeof item.alt !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "alt"));
      return false;
    }
    if (item.when && typeof item.when !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
      return false;
    }
    if (item.group && typeof item.group !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "group"));
      return false;
    }
    return true;
  }
  schema2.isValidMenuItem = isValidMenuItem;
  function isValidSubmenuItem(item, collector) {
    if (typeof item.submenu !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "submenu"));
      return false;
    }
    if (item.when && typeof item.when !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "when"));
      return false;
    }
    if (item.group && typeof item.group !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "group"));
      return false;
    }
    return true;
  }
  schema2.isValidSubmenuItem = isValidSubmenuItem;
  function isValidItems(items, collector) {
    if (!Array.isArray(items)) {
      collector.error(localize("requirearray", "submenu items must be an array"));
      return false;
    }
    for (const item of items) {
      if (isMenuItem(item)) {
        if (!isValidMenuItem(item, collector)) {
          return false;
        }
      } else {
        if (!isValidSubmenuItem(item, collector)) {
          return false;
        }
      }
    }
    return true;
  }
  schema2.isValidItems = isValidItems;
  function isValidSubmenu(submenu2, collector) {
    if (typeof submenu2 !== "object") {
      collector.error(localize("require", "submenu items must be an object"));
      return false;
    }
    if (typeof submenu2.id !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "id"));
      return false;
    }
    if (typeof submenu2.label !== "string") {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "label"));
      return false;
    }
    return true;
  }
  schema2.isValidSubmenu = isValidSubmenu;
  const menuItem = {
    type: "object",
    required: ["command"],
    properties: {
      command: {
        description: localize("vscode.extension.contributes.menuItem.command", "Identifier of the command to execute. The command must be declared in the 'commands'-section"),
        type: "string"
      },
      alt: {
        description: localize("vscode.extension.contributes.menuItem.alt", "Identifier of an alternative command to execute. The command must be declared in the 'commands'-section"),
        type: "string"
      },
      when: {
        description: localize("vscode.extension.contributes.menuItem.when", "Condition which must be true to show this item"),
        type: "string"
      },
      group: {
        description: localize("vscode.extension.contributes.menuItem.group", "Group into which this item belongs"),
        type: "string"
      }
    }
  };
  const submenuItem = {
    type: "object",
    required: ["submenu"],
    properties: {
      submenu: {
        description: localize("vscode.extension.contributes.menuItem.submenu", "Identifier of the submenu to display in this item."),
        type: "string"
      },
      when: {
        description: localize("vscode.extension.contributes.menuItem.when", "Condition which must be true to show this item"),
        type: "string"
      },
      group: {
        description: localize("vscode.extension.contributes.menuItem.group", "Group into which this item belongs"),
        type: "string"
      }
    }
  };
  const submenu = {
    type: "object",
    required: ["id", "label"],
    properties: {
      id: {
        description: localize("vscode.extension.contributes.submenu.id", "Identifier of the menu to display as a submenu."),
        type: "string"
      },
      label: {
        description: localize("vscode.extension.contributes.submenu.label", "The label of the menu item which leads to this submenu."),
        type: "string"
      },
      icon: {
        description: localize({ key: "vscode.extension.contributes.submenu.icon", comment: ['do not translate or change "\\$(zap)", \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the submenu in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like "\\$(zap)"'),
        anyOf: [
          {
            type: "string"
          },
          {
            type: "object",
            properties: {
              light: {
                description: localize("vscode.extension.contributes.submenu.icon.light", "Icon path when a light theme is used"),
                type: "string"
              },
              dark: {
                description: localize("vscode.extension.contributes.submenu.icon.dark", "Icon path when a dark theme is used"),
                type: "string"
              }
            }
          }
        ]
      }
    }
  };
  schema2.menusContribution = {
    description: localize("vscode.extension.contributes.menus", "Contributes menu items to the editor"),
    type: "object",
    properties: index(apiMenus, (menu) => menu.key, (menu) => ({
      markdownDescription: menu.proposed ? localize("proposed", 'Proposed API, requires `enabledApiProposal: ["{0}"]` - {1}', menu.proposed, menu.description) : menu.description,
      type: "array",
      items: menu.supportsSubmenus === false ? menuItem : { oneOf: [menuItem, submenuItem] }
    })),
    additionalProperties: {
      description: "Submenu",
      type: "array",
      items: { oneOf: [menuItem, submenuItem] }
    }
  };
  schema2.submenusContribution = {
    description: localize("vscode.extension.contributes.submenus", "Contributes submenu items to the editor"),
    type: "array",
    items: submenu
  };
  function isValidCommand(command, collector) {
    if (!command) {
      collector.error(localize("nonempty", "expected non-empty value."));
      return false;
    }
    if (isFalsyOrWhitespace(command.command)) {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", "command"));
      return false;
    }
    if (!isValidLocalizedString(command.title, collector, "title")) {
      return false;
    }
    if (command.shortTitle && !isValidLocalizedString(command.shortTitle, collector, "shortTitle")) {
      return false;
    }
    if (command.enablement && typeof command.enablement !== "string") {
      collector.error(localize("optstring", "property `{0}` can be omitted or must be of type `string`", "precondition"));
      return false;
    }
    if (command.category && !isValidLocalizedString(command.category, collector, "category")) {
      return false;
    }
    if (!isValidIcon(command.icon, collector)) {
      return false;
    }
    return true;
  }
  schema2.isValidCommand = isValidCommand;
  function isValidIcon(icon, collector) {
    if (typeof icon === "undefined") {
      return true;
    }
    if (typeof icon === "string") {
      return true;
    } else if (typeof icon.dark === "string" && typeof icon.light === "string") {
      return true;
    }
    collector.error(localize("opticon", "property `icon` can be omitted or must be either a string or a literal like `{dark, light}`"));
    return false;
  }
  function isValidLocalizedString(localized, collector, propertyName) {
    if (typeof localized === "undefined") {
      collector.error(localize("requireStringOrObject", "property `{0}` is mandatory and must be of type `string` or `object`", propertyName));
      return false;
    } else if (typeof localized === "string" && isFalsyOrWhitespace(localized)) {
      collector.error(localize("requirestring", "property `{0}` is mandatory and must be of type `string`", propertyName));
      return false;
    } else if (typeof localized !== "string" && (isFalsyOrWhitespace(localized.original) || isFalsyOrWhitespace(localized.value))) {
      collector.error(localize("requirestrings", "properties `{0}` and `{1}` are mandatory and must be of type `string`", `${propertyName}.value`, `${propertyName}.original`));
      return false;
    }
    return true;
  }
  const commandType = {
    type: "object",
    required: ["command", "title"],
    properties: {
      command: {
        description: localize("vscode.extension.contributes.commandType.command", "Identifier of the command to execute"),
        type: "string"
      },
      title: {
        description: localize("vscode.extension.contributes.commandType.title", "Title by which the command is represented in the UI"),
        type: "string"
      },
      shortTitle: {
        markdownDescription: localize("vscode.extension.contributes.commandType.shortTitle", "(Optional) Short title by which the command is represented in the UI. Menus pick either `title` or `shortTitle` depending on the context in which they show commands."),
        type: "string"
      },
      category: {
        description: localize("vscode.extension.contributes.commandType.category", "(Optional) Category string by which the command is grouped in the UI"),
        type: "string"
      },
      enablement: {
        description: localize("vscode.extension.contributes.commandType.precondition", "(Optional) Condition which must be true to enable the command in the UI (menu and keybindings). Does not prevent executing the command by other means, like the `executeCommand`-api."),
        type: "string"
      },
      icon: {
        description: localize({ key: "vscode.extension.contributes.commandType.icon", comment: ['do not translate or change "\\$(zap)", \\ in front of $ is important.'] }, '(Optional) Icon which is used to represent the command in the UI. Either a file path, an object with file paths for dark and light themes, or a theme icon references, like "\\$(zap)"'),
        anyOf: [
          {
            type: "string"
          },
          {
            type: "object",
            properties: {
              light: {
                description: localize("vscode.extension.contributes.commandType.icon.light", "Icon path when a light theme is used"),
                type: "string"
              },
              dark: {
                description: localize("vscode.extension.contributes.commandType.icon.dark", "Icon path when a dark theme is used"),
                type: "string"
              }
            }
          }
        ]
      }
    }
  };
  schema2.commandsContribution = {
    description: localize("vscode.extension.contributes.commands", "Contributes commands to the command palette."),
    oneOf: [
      commandType,
      {
        type: "array",
        items: commandType
      }
    ]
  };
})(schema || (schema = {}));
const _commandRegistrations = new DisposableStore();
const commandsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "commands",
  jsonSchema: schema.commandsContribution,
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.command) {
        yield `onCommand:${contrib.command}`;
      }
    }
  }
});
commandsExtensionPoint.setHandler((extensions) => {
  function handleCommand(userFriendlyCommand, extension) {
    if (!schema.isValidCommand(userFriendlyCommand, extension.collector)) {
      return;
    }
    const { icon, enablement, category, title, shortTitle, command } = userFriendlyCommand;
    let absoluteIcon;
    if (icon) {
      if (typeof icon === "string") {
        absoluteIcon = ThemeIcon.fromString(icon) ?? { dark: resources.joinPath(extension.description.extensionLocation, icon), light: resources.joinPath(extension.description.extensionLocation, icon) };
      } else {
        absoluteIcon = {
          dark: resources.joinPath(extension.description.extensionLocation, icon.dark),
          light: resources.joinPath(extension.description.extensionLocation, icon.light)
        };
      }
    }
    const existingCmd = MenuRegistry.getCommand(command);
    if (existingCmd) {
      if (existingCmd.source) {
        extension.collector.info(localize("dup1", "Command `{0}` already registered by {1} ({2})", userFriendlyCommand.command, existingCmd.source.title, existingCmd.source.id));
      } else {
        extension.collector.info(localize("dup0", "Command `{0}` already registered", userFriendlyCommand.command));
      }
    }
    _commandRegistrations.add(MenuRegistry.addCommand({
      id: command,
      title,
      source: { id: extension.description.identifier.value, title: extension.description.displayName ?? extension.description.name },
      shortTitle,
      tooltip: title,
      category,
      precondition: ContextKeyExpr.deserialize(enablement),
      icon: absoluteIcon
    }));
  }
  _commandRegistrations.clear();
  for (const extension of extensions) {
    const { value } = extension;
    if (Array.isArray(value)) {
      for (const command of value) {
        handleCommand(command, extension);
      }
    } else {
      handleCommand(value, extension);
    }
  }
});
const _submenus = /* @__PURE__ */ new Map();
const submenusExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "submenus",
  jsonSchema: schema.submenusContribution
});
submenusExtensionPoint.setHandler((extensions) => {
  _submenus.clear();
  for (const extension of extensions) {
    const { value, collector } = extension;
    for (const [, submenuInfo] of Object.entries(value)) {
      if (!schema.isValidSubmenu(submenuInfo, collector)) {
        continue;
      }
      if (!submenuInfo.id) {
        collector.warn(localize("submenuId.invalid.id", "`{0}` is not a valid submenu identifier", submenuInfo.id));
        continue;
      }
      if (_submenus.has(submenuInfo.id)) {
        collector.info(localize("submenuId.duplicate.id", "The `{0}` submenu was already previously registered.", submenuInfo.id));
        continue;
      }
      if (!submenuInfo.label) {
        collector.warn(localize("submenuId.invalid.label", "`{0}` is not a valid submenu label", submenuInfo.label));
        continue;
      }
      let absoluteIcon;
      if (submenuInfo.icon) {
        if (typeof submenuInfo.icon === "string") {
          absoluteIcon = ThemeIcon.fromString(submenuInfo.icon) || { dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon) };
        } else {
          absoluteIcon = {
            dark: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.dark),
            light: resources.joinPath(extension.description.extensionLocation, submenuInfo.icon.light)
          };
        }
      }
      const item = {
        id: MenuId.for(`api:${submenuInfo.id}`),
        label: submenuInfo.label,
        icon: absoluteIcon
      };
      _submenus.set(submenuInfo.id, item);
    }
  }
});
const _apiMenusByKey = new Map(apiMenus.map((menu) => [menu.key, menu]));
const _menuRegistrations = new DisposableStore();
const _submenuMenuItems = /* @__PURE__ */ new Map();
const menusExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "menus",
  jsonSchema: schema.menusContribution,
  deps: [submenusExtensionPoint]
});
menusExtensionPoint.setHandler((extensions) => {
  _menuRegistrations.clear();
  _submenuMenuItems.clear();
  for (const extension of extensions) {
    const { value, collector } = extension;
    for (const entry of Object.entries(value)) {
      if (!schema.isValidItems(entry[1], collector)) {
        continue;
      }
      let menu = _apiMenusByKey.get(entry[0]);
      if (!menu) {
        const submenu = _submenus.get(entry[0]);
        if (submenu) {
          menu = {
            key: entry[0],
            id: submenu.id,
            description: ""
          };
        }
      }
      if (!menu) {
        continue;
      }
      if (menu.proposed && !isProposedApiEnabled(extension.description, menu.proposed)) {
        collector.error(localize("proposedAPI.invalid", `{0} is a proposed menu identifier. It requires 'package.json#enabledApiProposals: ["{1}"]' and is only available when running out of dev or with the following command line switch: --enable-proposed-api {2}`, entry[0], menu.proposed, extension.description.identifier.value));
        continue;
      }
      for (const menuItem of entry[1]) {
        let item;
        if (schema.isMenuItem(menuItem)) {
          const command = MenuRegistry.getCommand(menuItem.command);
          const alt = menuItem.alt && MenuRegistry.getCommand(menuItem.alt) || void 0;
          if (!command) {
            collector.error(localize("missing.command", "Menu item references a command `{0}` which is not defined in the 'commands' section.", menuItem.command));
            continue;
          }
          if (menuItem.alt && !alt) {
            collector.warn(localize("missing.altCommand", "Menu item references an alt-command `{0}` which is not defined in the 'commands' section.", menuItem.alt));
          }
          if (menuItem.command === menuItem.alt) {
            collector.info(localize("dupe.command", "Menu item references the same command as default and alt-command"));
          }
          item = { command, alt, group: void 0, order: void 0, when: void 0 };
        } else {
          if (menu.supportsSubmenus === false) {
            collector.error(localize("unsupported.submenureference", "Menu item references a submenu for a menu which doesn't have submenu support."));
            continue;
          }
          const submenu = _submenus.get(menuItem.submenu);
          if (!submenu) {
            collector.error(localize("missing.submenu", "Menu item references a submenu `{0}` which is not defined in the 'submenus' section.", menuItem.submenu));
            continue;
          }
          let submenuRegistrations = _submenuMenuItems.get(menu.id.id);
          if (!submenuRegistrations) {
            submenuRegistrations = /* @__PURE__ */ new Set();
            _submenuMenuItems.set(menu.id.id, submenuRegistrations);
          }
          if (submenuRegistrations.has(submenu.id.id)) {
            collector.warn(localize("submenuItem.duplicate", "The `{0}` submenu was already contributed to the `{1}` menu.", menuItem.submenu, entry[0]));
            continue;
          }
          submenuRegistrations.add(submenu.id.id);
          item = { submenu: submenu.id, icon: submenu.icon, title: submenu.label, group: void 0, order: void 0, when: void 0 };
        }
        if (menuItem.group) {
          const idx = menuItem.group.lastIndexOf("@");
          if (idx > 0) {
            item.group = menuItem.group.substr(0, idx);
            item.order = Number(menuItem.group.substr(idx + 1)) || void 0;
          } else {
            item.group = menuItem.group;
          }
        }
        if (menu.id === MenuId.ViewContainerTitle && !menuItem.when?.includes("viewContainer == workbench.view.debug")) {
          collector.error(localize("viewContainerTitle.when", "The {0} menu contribution must check {1} in its {2} clause.", "`viewContainer/title`", "`viewContainer == workbench.view.debug`", '"when"'));
          continue;
        }
        item.when = ContextKeyExpr.deserialize(menuItem.when);
        _menuRegistrations.add(MenuRegistry.appendMenuItem(menu.id, item));
      }
    }
  }
});
let CommandsTableRenderer = class extends Disposable {
  constructor(_keybindingService) {
    super();
    this._keybindingService = _keybindingService;
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.commands;
  }
  render(manifest) {
    const rawCommands = manifest.contributes?.commands || [];
    const commands = rawCommands.map((c) => ({
      id: c.command,
      title: c.title,
      keybindings: [],
      menus: []
    }));
    const byId = index(commands, (c) => c.id);
    const menus = manifest.contributes?.menus || {};
    const implicitlyOnCommandPalette = index(commands, (c) => c.id);
    if (menus["commandPalette"]) {
      for (const command of menus["commandPalette"]) {
        delete implicitlyOnCommandPalette[command.command];
      }
    }
    if (Object.keys(implicitlyOnCommandPalette).length) {
      if (!menus["commandPalette"]) {
        menus["commandPalette"] = [];
      }
      for (const command in implicitlyOnCommandPalette) {
        menus["commandPalette"].push({ command });
      }
    }
    for (const context in menus) {
      for (const menu of menus[context]) {
        if (menu.when === "false") {
          continue;
        }
        if (menu.command) {
          let command = byId[menu.command];
          if (command) {
            if (!command.menus.includes(context)) {
              command.menus.push(context);
            }
          } else {
            command = { id: menu.command, title: "", keybindings: [], menus: [context] };
            byId[command.id] = command;
            commands.push(command);
          }
        }
      }
    }
    const rawKeybindings = manifest.contributes?.keybindings ? Array.isArray(manifest.contributes.keybindings) ? manifest.contributes.keybindings : [manifest.contributes.keybindings] : [];
    rawKeybindings.forEach((rawKeybinding) => {
      const keybinding = this.resolveKeybinding(rawKeybinding);
      if (!keybinding) {
        return;
      }
      let command = byId[rawKeybinding.command];
      if (command) {
        command.keybindings.push(keybinding);
      } else {
        command = { id: rawKeybinding.command, title: "", keybindings: [keybinding], menus: [] };
        byId[command.id] = command;
        commands.push(command);
      }
    });
    if (!commands.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("command name", "ID"),
      localize("command title", "Title"),
      localize("keyboard shortcuts", "Keyboard Shortcuts"),
      localize("menuContexts", "Menu Contexts")
    ];
    const rows = commands.sort((a, b) => a.id.localeCompare(b.id)).map((command) => {
      return [
        new MarkdownString().appendMarkdown(`\`${command.id}\``),
        typeof command.title === "string" ? command.title : command.title.value,
        command.keybindings,
        new MarkdownString().appendMarkdown(`${command.menus.sort((a, b) => a.localeCompare(b)).map((menu) => `\`${menu}\``).join("&nbsp;")}`)
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
  resolveKeybinding(rawKeyBinding) {
    let key;
    switch (platform) {
      case "win32":
        key = rawKeyBinding.win;
        break;
      case "linux":
        key = rawKeyBinding.linux;
        break;
      case "darwin":
        key = rawKeyBinding.mac;
        break;
    }
    return this._keybindingService.resolveUserBinding(key ?? rawKeyBinding.key)[0];
  }
};
CommandsTableRenderer = __decorateClass([
  __decorateParam(0, IKeybindingService)
], CommandsTableRenderer);
Registry.as(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "commands",
  label: localize("commands", "Commands"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(CommandsTableRenderer)
});
export {
  commandsExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhY3Rpb25zXFxjb21tb25cXG1lbnVzRXh0ZW5zaW9uUG9pbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUG9pbnRVc2VyLCBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yLCBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCBJTWVudUl0ZW0sIElTdWJtZW51SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgaW5kZXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSwgRXh0ZW5zaW9ucyBhcyBFeHRlbnNpb25GZWF0dXJlc0V4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QsIElLZXlCaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IHBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQXBpUHJvcG9zYWxOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc0FwaVByb3Bvc2Fscy5qcyc7XG5cbmludGVyZmFjZSBJQVBJTWVudSB7XG5cdHJlYWRvbmx5IGtleTogc3RyaW5nO1xuXHRyZWFkb25seSBpZDogTWVudUlkO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9wb3NlZD86IEFwaVByb3Bvc2FsTmFtZTtcblx0cmVhZG9ubHkgc3VwcG9ydHNTdWJtZW51cz86IGJvb2xlYW47IC8vIGRlZmF1bHRzIHRvIHRydWVcbn1cblxuY29uc3QgYXBpTWVudXM6IElBUElNZW51W10gPSBbXG5cdHtcblx0XHRrZXk6ICdjb21tYW5kUGFsZXR0ZScsXG5cdFx0aWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmNvbW1hbmRQYWxldHRlJywgXCJUaGUgQ29tbWFuZCBQYWxldHRlXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd0b3VjaEJhcicsXG5cdFx0aWQ6IE1lbnVJZC5Ub3VjaEJhckNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy50b3VjaEJhcicsIFwiVGhlIHRvdWNoIGJhciAobWFjT1Mgb25seSlcIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2Vcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmVkaXRvclRpdGxlJywgXCJUaGUgZWRpdG9yIHRpdGxlIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ21vZGFsRWRpdG9yL2VkaXRvclRpdGxlJyxcblx0XHRpZDogTWVudUlkLk1vZGFsRWRpdG9yRWRpdG9yVGl0bGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5tb2RhbEVkaXRvckVkaXRvclRpdGxlJywgXCJUaGUgZWRpdG9yIHRpdGxlIG1lbnUgaW4gdGhlIG1vZGFsIGVkaXRvclwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZWRpdG9yL3RpdGxlL3J1bicsXG5cdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZVJ1bixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmVkaXRvclRpdGxlUnVuJywgXCJSdW4gc3VibWVudSBpbnNpZGUgdGhlIGVkaXRvciB0aXRsZSBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZWRpdG9yQ29udGV4dCcsIFwiVGhlIGVkaXRvciBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci9jb250ZXh0L2NvcHknLFxuXHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dENvcHksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5lZGl0b3JDb250ZXh0Q29weUFzJywgXCInQ29weSBhcycgc3VibWVudSBpbiB0aGUgZWRpdG9yIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZWRpdG9yL2NvbnRleHQvc2hhcmUnLFxuXHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dFNoYXJlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZWRpdG9yQ29udGV4dFNoYXJlJywgXCInU2hhcmUnIHN1Ym1lbnUgaW4gdGhlIGVkaXRvciBjb250ZXh0IG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU2hhcmVNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZXhwbG9yZXIvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5leHBsb3JlckNvbnRleHQnLCBcIlRoZSBmaWxlIGV4cGxvcmVyIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZXhwbG9yZXIvY29udGV4dC9zaGFyZScsXG5cdFx0aWQ6IE1lbnVJZC5FeHBsb3JlckNvbnRleHRTaGFyZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmV4cGxvcmVyQ29udGV4dFNoYXJlJywgXCInU2hhcmUnIHN1Ym1lbnUgaW4gdGhlIGZpbGUgZXhwbG9yZXIgY29udGV4dCBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYlNoYXJlTWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci90aXRsZS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmVkaXRvclRhYkNvbnRleHQnLCBcIlRoZSBlZGl0b3IgdGFicyBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci90aXRsZS9jb250ZXh0L3NoYXJlJyxcblx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dFNoYXJlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZWRpdG9yVGl0bGVDb250ZXh0U2hhcmUnLCBcIidTaGFyZScgc3VibWVudSBpbnNpZGUgdGhlIGVkaXRvciB0aXRsZSBjb250ZXh0IG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU2hhcmVNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZGVidWcvY2FsbHN0YWNrL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuRGVidWdDYWxsU3RhY2tDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuZGVidWdDYWxsc3RhY2tDb250ZXh0JywgXCJUaGUgZGVidWcgY2FsbHN0YWNrIHZpZXcgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdkZWJ1Zy92YXJpYWJsZXMvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5EZWJ1Z1ZhcmlhYmxlc0NvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5kZWJ1Z1ZhcmlhYmxlc0NvbnRleHQnLCBcIlRoZSBkZWJ1ZyB2YXJpYWJsZXMgdmlldyBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2RlYnVnL3dhdGNoL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuRGVidWdXYXRjaENvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5kZWJ1Z1dhdGNoQ29udGV4dCcsIFwiVGhlIGRlYnVnIHdhdGNoIHZpZXcgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdkZWJ1Zy90b29sQmFyJyxcblx0XHRpZDogTWVudUlkLkRlYnVnVG9vbEJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmRlYnVnVG9vbEJhcicsIFwiVGhlIGRlYnVnIHRvb2xiYXIgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZGVidWcvY3JlYXRlQ29uZmlndXJhdGlvbicsXG5cdFx0aWQ6IE1lbnVJZC5EZWJ1Z0NyZWF0ZUNvbmZpZ3VyYXRpb24sXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliRGVidWdDcmVhdGVDb25maWd1cmF0aW9uJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmRlYnVnQ3JlYXRlQ29uZmlndWF0aW9uJywgXCJUaGUgZGVidWcgY3JlYXRlIGNvbmZpZ3VyYXRpb24gbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnbm90ZWJvb2svdmFyaWFibGVzL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuTm90ZWJvb2tWYXJpYWJsZXNDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMubm90ZWJvb2tWYXJpYWJsZXNDb250ZXh0JywgXCJUaGUgbm90ZWJvb2sgdmFyaWFibGVzIHZpZXcgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdtZW51QmFyL2hvbWUnLFxuXHRcdGlkOiBNZW51SWQuTWVudWJhckhvbWVNZW51LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuaG9tZScsIFwiVGhlIGhvbWUgaW5kaWNhdG9yIGNvbnRleHQgbWVudSAod2ViIG9ubHkpXCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYk1lbnVCYXJIb21lJyxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnbWVudUJhci9lZGl0L2NvcHknLFxuXHRcdGlkOiBNZW51SWQuTWVudWJhckNvcHksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5vcHknLCBcIidDb3B5IGFzJyBzdWJtZW51IGluIHRoZSB0b3AgbGV2ZWwgRWRpdCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0L2lucHV0L3N0YXR1cycsXG5cdFx0aWQ6IE1lbnVJZC5DaGF0SW5wdXRTdGF0dXMsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0SW5wdXRTdGF0dXMnLCBcIlRoZSBzdGF0dXMgaW5kaWNhdG9yIGFyZWEgYXQgdGhlIHJpZ2h0bW9zdCBlbmQgb2YgdGhlIHRvb2xiYXIgc2hvd24gYmVuZWF0aCB0aGUgY2hhdCBpbnB1dFwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL3RpdGxlJyxcblx0XHRpZDogTWVudUlkLlNDTVRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuc2NtVGl0bGUnLCBcIlRoZSBTb3VyY2UgQ29udHJvbCB0aXRsZSBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzY20vc291cmNlQ29udHJvbCcsXG5cdFx0aWQ6IE1lbnVJZC5TQ01Tb3VyY2VDb250cm9sLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuc2NtU291cmNlQ29udHJvbCcsIFwiVGhlIFNvdXJjZSBDb250cm9sIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9yZXBvc2l0b3JpZXMvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuU0NNU291cmNlQ29udHJvbFRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuc2NtU291cmNlQ29udHJvbFRpdGxlJywgXCJUaGUgU291cmNlIENvbnRyb2wgUmVwb3NpdG9yaWVzIHRpdGxlIG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU291cmNlQ29udHJvbFRpdGxlTWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9yZXBvc2l0b3J5Jyxcblx0XHRpZDogTWVudUlkLlNDTVNvdXJjZUNvbnRyb2xJbmxpbmUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5zY21Tb3VyY2VDb250cm9sSW5saW5lJywgXCJUaGUgU291cmNlIENvbnRyb2wgcmVwb3NpdG9yeSBtZW51XCIpLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL3Jlc291cmNlU3RhdGUvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5TQ01SZXNvdXJjZUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5yZXNvdXJjZVN0YXRlQ29udGV4dCcsIFwiVGhlIFNvdXJjZSBDb250cm9sIHJlc291cmNlIHN0YXRlIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL3Jlc291cmNlRm9sZGVyL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU0NNUmVzb3VyY2VGb2xkZXJDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMucmVzb3VyY2VGb2xkZXJDb250ZXh0JywgXCJUaGUgU291cmNlIENvbnRyb2wgcmVzb3VyY2UgZm9sZGVyIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL3Jlc291cmNlR3JvdXAvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5TQ01SZXNvdXJjZUdyb3VwQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnJlc291cmNlR3JvdXBDb250ZXh0JywgXCJUaGUgU291cmNlIENvbnRyb2wgcmVzb3VyY2UgZ3JvdXAgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzY20vY2hhbmdlL3RpdGxlJyxcblx0XHRpZDogTWVudUlkLlNDTUNoYW5nZUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGFuZ2VUaXRsZScsIFwiVGhlIFNvdXJjZSBDb250cm9sIGlubGluZSBjaGFuZ2UgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL2lucHV0Qm94Jyxcblx0XHRpZDogTWVudUlkLlNDTUlucHV0Qm94LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuaW5wdXQnLCBcIlRoZSBTb3VyY2UgQ29udHJvbCBpbnB1dCBib3ggbWVudVwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJTb3VyY2VDb250cm9sSW5wdXRCb3hNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL2hpc3RvcnkvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuU0NNSGlzdG9yeVRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuc2NtSGlzdG9yeVRpdGxlJywgXCJUaGUgU291cmNlIENvbnRyb2wgSGlzdG9yeSB0aXRsZSBtZW51XCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYlNvdXJjZUNvbnRyb2xIaXN0b3J5VGl0bGVNZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL2hpc3RvcnlJdGVtL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU0NNSGlzdG9yeUl0ZW1Db250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuaGlzdG9yeUl0ZW1Db250ZXh0JywgXCJUaGUgU291cmNlIENvbnRyb2wgaGlzdG9yeSBpdGVtIGNvbnRleHQgbWVudVwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJTb3VyY2VDb250cm9sSGlzdG9yeUl0ZW1NZW51J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnc2NtL2hpc3RvcnlJdGVtUmVmL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU0NNSGlzdG9yeUl0ZW1SZWZDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuaGlzdG9yeUl0ZW1SZWZDb250ZXh0JywgXCJUaGUgU291cmNlIENvbnRyb2wgaGlzdG9yeSBpdGVtIHJlZmVyZW5jZSBjb250ZXh0IG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU291cmNlQ29udHJvbEhpc3RvcnlJdGVtTWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ3NjbS9hcnRpZmFjdEdyb3VwL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU0NNQXJ0aWZhY3RHcm91cENvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5hcnRpZmFjdEdyb3VwQ29udGV4dCcsIFwiVGhlIFNvdXJjZSBDb250cm9sIGFydGlmYWN0IGdyb3VwIGNvbnRleHQgbWVudVwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJTb3VyY2VDb250cm9sQXJ0aWZhY3RHcm91cE1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdzY20vYXJ0aWZhY3QvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5TQ01BcnRpZmFjdENvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5hcnRpZmFjdENvbnRleHQnLCBcIlRoZSBTb3VyY2UgQ29udHJvbCBhcnRpZmFjdCBjb250ZXh0IG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliU291cmNlQ29udHJvbEFydGlmYWN0TWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ3N0YXR1c0Jhci9yZW1vdGVJbmRpY2F0b3InLFxuXHRcdGlkOiBNZW51SWQuU3RhdHVzQmFyUmVtb3RlSW5kaWNhdG9yTWVudSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnN0YXR1c0JhclJlbW90ZUluZGljYXRvcicsIFwiVGhlIHJlbW90ZSBpbmRpY2F0b3IgbWVudSBpbiB0aGUgc3RhdHVzIGJhclwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGVybWluYWwvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbEluc3RhbmNlQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnRlcm1pbmFsQ29udGV4dCcsIFwiVGhlIHRlcm1pbmFsIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGVybWluYWwvdGl0bGUvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5UZXJtaW5hbFRhYkNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy50ZXJtaW5hbFRhYkNvbnRleHQnLCBcIlRoZSB0ZXJtaW5hbCB0YWJzIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndmlldy90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3LnZpZXdUaXRsZScsIFwiVGhlIGNvbnRyaWJ1dGVkIHZpZXcgdGl0bGUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndmlld0NvbnRhaW5lci90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3LmNvbnRhaW5lclRpdGxlJywgXCJUaGUgY29udHJpYnV0ZWQgdmlldyBjb250YWluZXIgdGl0bGUgbWVudVwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJWaWV3Q29udGFpbmVyVGl0bGUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd2aWV3L2l0ZW0vY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3Lml0ZW1Db250ZXh0JywgXCJUaGUgY29udHJpYnV0ZWQgdmlldyBpdGVtIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHMvY29tbWVudC9lZGl0b3JBY3Rpb25zJyxcblx0XHRpZDogTWVudUlkLkNvbW1lbnRFZGl0b3JBY3Rpb25zLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29tbWVudFRocmVhZC5lZGl0b3JBY3Rpb25zJywgXCJUaGUgY29udHJpYnV0ZWQgY29tbWVudCBlZGl0b3IgYWN0aW9uc1wiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJDb21tZW50RWRpdG9yQWN0aW9uc01lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjb21tZW50cy9jb21tZW50VGhyZWFkL3RpdGxlJyxcblx0XHRpZDogTWVudUlkLkNvbW1lbnRUaHJlYWRUaXRsZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbW1lbnRUaHJlYWQudGl0bGUnLCBcIlRoZSBjb250cmlidXRlZCBjb21tZW50IHRocmVhZCB0aXRsZSBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjb21tZW50cy9jb21tZW50VGhyZWFkL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuQ29tbWVudFRocmVhZEFjdGlvbnMsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb21tZW50VGhyZWFkLmFjdGlvbnMnLCBcIlRoZSBjb250cmlidXRlZCBjb21tZW50IHRocmVhZCBjb250ZXh0IG1lbnUsIHJlbmRlcmVkIGFzIGJ1dHRvbnMgYmVsb3cgdGhlIGNvbW1lbnQgZWRpdG9yXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjb21tZW50cy9jb21tZW50VGhyZWFkL2FkZGl0aW9uYWxBY3Rpb25zJyxcblx0XHRpZDogTWVudUlkLkNvbW1lbnRUaHJlYWRBZGRpdGlvbmFsQWN0aW9ucyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbW1lbnRUaHJlYWQuYWN0aW9ucycsIFwiVGhlIGNvbnRyaWJ1dGVkIGNvbW1lbnQgdGhyZWFkIGNvbnRleHQgbWVudSwgcmVuZGVyZWQgYXMgYnV0dG9ucyBiZWxvdyB0aGUgY29tbWVudCBlZGl0b3JcIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogdHJ1ZSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJDb21tZW50VGhyZWFkQWRkaXRpb25hbE1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjb21tZW50cy9jb21tZW50VGhyZWFkL3RpdGxlL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuQ29tbWVudFRocmVhZFRpdGxlQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbW1lbnRUaHJlYWQudGl0bGVDb250ZXh0JywgXCJUaGUgY29udHJpYnV0ZWQgY29tbWVudCB0aHJlYWQgdGl0bGUncyBwZWVrIGNvbnRleHQgbWVudSwgcmVuZGVyZWQgYXMgYSByaWdodCBjbGljayBtZW51IG9uIHRoZSBjb21tZW50IHRocmVhZCdzIHBlZWsgdGl0bGUuXCIpLFxuXHRcdHByb3Bvc2VkOiAnY29udHJpYkNvbW1lbnRQZWVrQ29udGV4dCdcblx0fSxcblx0e1xuXHRcdGtleTogJ2NvbW1lbnRzL2NvbW1lbnQvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuQ29tbWVudFRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29tbWVudC50aXRsZScsIFwiVGhlIGNvbnRyaWJ1dGVkIGNvbW1lbnQgdGl0bGUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHMvY29tbWVudC9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLkNvbW1lbnRBY3Rpb25zLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29tbWVudC5hY3Rpb25zJywgXCJUaGUgY29udHJpYnV0ZWQgY29tbWVudCBjb250ZXh0IG1lbnUsIHJlbmRlcmVkIGFzIGJ1dHRvbnMgYmVsb3cgdGhlIGNvbW1lbnQgZWRpdG9yXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjb21tZW50cy9jb21tZW50VGhyZWFkL2NvbW1lbnQvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5Db21tZW50VGhyZWFkQ29tbWVudENvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjb21tZW50LmNvbW1lbnRDb250ZXh0JywgXCJUaGUgY29udHJpYnV0ZWQgY29tbWVudCBjb250ZXh0IG1lbnUsIHJlbmRlcmVkIGFzIGEgcmlnaHQgY2xpY2sgbWVudSBvbiB0aGUgYW4gaW5kaXZpZHVhbCBjb21tZW50IGluIHRoZSBjb21tZW50IHRocmVhZCdzIHBlZWsgdmlldy5cIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliQ29tbWVudFBlZWtDb250ZXh0J1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY29tbWVudHNWaWV3L2NvbW1lbnRUaHJlYWQvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5Db21tZW50c1ZpZXdUaHJlYWRBY3Rpb25zLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29tbWVudHNWaWV3LnRocmVhZEFjdGlvbnMnLCBcIlRoZSBjb250cmlidXRlZCBjb21tZW50IHRocmVhZCBjb250ZXh0IG1lbnUgaW4gdGhlIGNvbW1lbnRzIHZpZXdcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliQ29tbWVudHNWaWV3VGhyZWFkTWVudXMnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdub3RlYm9vay90b29sYmFyJyxcblx0XHRpZDogTWVudUlkLk5vdGVib29rVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25vdGVib29rLnRvb2xiYXInLCBcIlRoZSBjb250cmlidXRlZCBub3RlYm9vayB0b29sYmFyIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ25vdGVib29rL2tlcm5lbFNvdXJjZScsXG5cdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0tlcm5lbFNvdXJjZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25vdGVib29rLmtlcm5lbFNvdXJjZScsIFwiVGhlIGNvbnRyaWJ1dGVkIG5vdGVib29rIGtlcm5lbCBzb3VyY2VzIG1lbnVcIiksXG5cdFx0cHJvcG9zZWQ6ICdub3RlYm9va0tlcm5lbFNvdXJjZSdcblx0fSxcblx0e1xuXHRcdGtleTogJ25vdGVib29rL2NlbGwvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay5jZWxsLnRpdGxlJywgXCJUaGUgY29udHJpYnV0ZWQgbm90ZWJvb2sgY2VsbCB0aXRsZSBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdub3RlYm9vay9jZWxsL2V4ZWN1dGUnLFxuXHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsRXhlY3V0ZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25vdGVib29rLmNlbGwuZXhlY3V0ZScsIFwiVGhlIGNvbnRyaWJ1dGVkIG5vdGVib29rIGNlbGwgZXhlY3V0aW9uIG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ2ludGVyYWN0aXZlL3Rvb2xiYXInLFxuXHRcdGlkOiBNZW51SWQuSW50ZXJhY3RpdmVUb29sYmFyLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaW50ZXJhY3RpdmUudG9vbGJhcicsIFwiVGhlIGNvbnRyaWJ1dGVkIGludGVyYWN0aXZlIHRvb2xiYXIgbWVudVwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ2ludGVyYWN0aXZlL2NlbGwvdGl0bGUnLFxuXHRcdGlkOiBNZW51SWQuSW50ZXJhY3RpdmVDZWxsVGl0bGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbnRlcmFjdGl2ZS5jZWxsLnRpdGxlJywgXCJUaGUgY29udHJpYnV0ZWQgaW50ZXJhY3RpdmUgY2VsbCB0aXRsZSBtZW51XCIpLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnaXNzdWUvcmVwb3J0ZXInLFxuXHRcdGlkOiBNZW51SWQuSXNzdWVSZXBvcnRlcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2lzc3VlLnJlcG9ydGVyJywgXCJUaGUgY29udHJpYnV0ZWQgaXNzdWUgcmVwb3J0ZXIgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGVzdGluZy9pdGVtL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuVGVzdEl0ZW0sXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLml0ZW0uY29udGV4dCcsIFwiVGhlIGNvbnRyaWJ1dGVkIHRlc3QgaXRlbSBtZW51XCIpLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAndGVzdGluZy9pdGVtL2d1dHRlcicsXG5cdFx0aWQ6IE1lbnVJZC5UZXN0SXRlbUd1dHRlcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuaXRlbS5ndXR0ZXIudGl0bGUnLCBcIlRoZSBtZW51IGZvciBhIGd1dHRlciBkZWNvcmF0aW9uIGZvciBhIHRlc3QgaXRlbVwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ3Rlc3RpbmcvcHJvZmlsZXMvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5UZXN0UHJvZmlsZXNDb250ZXh0LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5wcm9maWxlcy5jb250ZXh0LnRpdGxlJywgXCJUaGUgbWVudSBmb3IgY29uZmlndXJpbmcgdGVzdGluZyBwcm9maWxlcy5cIiksXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd0ZXN0aW5nL2l0ZW0vcmVzdWx0Jyxcblx0XHRpZDogTWVudUlkLlRlc3RQZWVrRWxlbWVudCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuaXRlbS5yZXN1bHQudGl0bGUnLCBcIlRoZSBtZW51IGZvciBhbiBpdGVtIGluIHRoZSBUZXN0IFJlc3VsdHMgdmlldyBvciBwZWVrLlwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ3Rlc3RpbmcvbWVzc2FnZS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlRlc3RNZXNzYWdlQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcubWVzc2FnZS5jb250ZXh0LnRpdGxlJywgXCJBIHByb21pbmVudCBidXR0b24gb3ZlcmxheWluZyBlZGl0b3IgY29udGVudCB3aGVyZSB0aGUgbWVzc2FnZSBpcyBkaXNwbGF5ZWRcIiksXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd0ZXN0aW5nL21lc3NhZ2UvY29udGVudCcsXG5cdFx0aWQ6IE1lbnVJZC5UZXN0TWVzc2FnZUNvbnRlbnQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLm1lc3NhZ2UuY29udGVudC50aXRsZScsIFwiQ29udGV4dCBtZW51IGZvciB0aGUgbWVzc2FnZSBpbiB0aGUgcmVzdWx0cyB0cmVlXCIpLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZXh0ZW5zaW9uL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuRXh0ZW5zaW9uQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmV4dGVuc2lvbkNvbnRleHQnLCBcIlRoZSBleHRlbnNpb24gY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd0aW1lbGluZS90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5UaW1lbGluZVRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlldy50aW1lbGluZVRpdGxlJywgXCJUaGUgVGltZWxpbmUgdmlldyB0aXRsZSBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICd0aW1lbGluZS9pdGVtL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuVGltZWxpbmVJdGVtQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZpZXcudGltZWxpbmVDb250ZXh0JywgXCJUaGUgVGltZWxpbmUgdmlldyBpdGVtIGNvbnRleHQgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAncG9ydHMvaXRlbS9jb250ZXh0Jyxcblx0XHRpZDogTWVudUlkLlR1bm5lbENvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3LnR1bm5lbENvbnRleHQnLCBcIlRoZSBQb3J0cyB2aWV3IGl0ZW0gY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdwb3J0cy9pdGVtL29yaWdpbi9pbmxpbmUnLFxuXHRcdGlkOiBNZW51SWQuVHVubmVsT3JpZ2luSW5saW5lLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmlldy50dW5uZWxPcmlnaW5JbmxpbmUnLCBcIlRoZSBQb3J0cyB2aWV3IGl0ZW0gb3JpZ2luIGlubGluZSBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdwb3J0cy9pdGVtL3BvcnQvaW5saW5lJyxcblx0XHRpZDogTWVudUlkLlR1bm5lbFBvcnRJbmxpbmUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2aWV3LnR1bm5lbFBvcnRJbmxpbmUnLCBcIlRoZSBQb3J0cyB2aWV3IGl0ZW0gcG9ydCBpbmxpbmUgbWVudVwiKVxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnZmlsZS9uZXdGaWxlJyxcblx0XHRpZDogTWVudUlkLk5ld0ZpbGUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdmaWxlLm5ld0ZpbGUnLCBcIlRoZSAnTmV3IEZpbGUuLi4nIHF1aWNrIHBpY2ssIHNob3duIG9uIHdlbGNvbWUgcGFnZSBhbmQgRmlsZSBtZW51LlwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZSxcblx0fSxcblx0e1xuXHRcdGtleTogJ3dlYnZpZXcvY29udGV4dCcsXG5cdFx0aWQ6IE1lbnVJZC5XZWJ2aWV3Q29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dlYnZpZXcuY29udGV4dCcsIFwiVGhlIHdlYnZpZXcgY29udGV4dCBtZW51XCIpXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdmaWxlL3NoYXJlJyxcblx0XHRpZDogTWVudUlkLk1lbnViYXJTaGFyZSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLnNoYXJlJywgXCJTaGFyZSBzdWJtZW51IHNob3duIGluIHRoZSB0b3AgbGV2ZWwgRmlsZSBtZW51LlwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJTaGFyZU1lbnUnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvaW5saW5lQ29tcGxldGlvbnMvYWN0aW9ucycsXG5cdFx0aWQ6IE1lbnVJZC5JbmxpbmVDb21wbGV0aW9uc0FjdGlvbnMsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdpbmxpbmVDb21wbGV0aW9ucy5hY3Rpb25zJywgXCJUaGUgYWN0aW9ucyBzaG93biB3aGVuIGhvdmVyaW5nIG9uIGFuIGlubGluZSBjb21wbGV0aW9uXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlLFxuXHRcdHByb3Bvc2VkOiAnaW5saW5lQ29tcGxldGlvbnNBZGRpdGlvbnMnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdlZGl0b3IvY29udGVudCcsXG5cdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZW50LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVyZ2UudG9vbGJhcicsIFwiVGhlIHByb21pbmVudCBidXR0b24gaW4gYW4gZWRpdG9yLCBvdmVybGF5cyBpdHMgY29udGVudFwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJFZGl0b3JDb250ZW50TWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci9saW5lTnVtYmVyL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuRWRpdG9yTGluZU51bWJlckNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlZGl0b3JMaW5lTnVtYmVyQ29udGV4dCcsIFwiVGhlIGNvbnRyaWJ1dGVkIGVkaXRvciBsaW5lIG51bWJlciBjb250ZXh0IG1lbnVcIilcblx0fSxcblx0e1xuXHRcdGtleTogJ21lcmdlRWRpdG9yL3Jlc3VsdC90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5NZXJnZUlucHV0UmVzdWx0VG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLm1lcmdlRWRpdG9yUmVzdWx0JywgXCJUaGUgcmVzdWx0IHRvb2xiYXIgb2YgdGhlIG1lcmdlIGVkaXRvclwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJNZXJnZUVkaXRvck1lbnVzJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnbXVsdGlEaWZmRWRpdG9yL2NvbnRlbnQnLFxuXHRcdGlkOiBNZW51SWQuTXVsdGlEaWZmRWRpdG9yQ29udGVudCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLm11bHRpRGlmZkVkaXRvckNvbnRlbnQnLCBcIkEgcHJvbWluZW50IGJ1dHRvbiBvdmVybGF5aW5nIHRoZSBtdWx0aSBkaWZmIGVkaXRvclwiKSxcblx0XHRwcm9wb3NlZDogJ2NvbnRyaWJFZGl0b3JDb250ZW50TWVudSdcblx0fSxcblx0e1xuXHRcdGtleTogJ211bHRpRGlmZkVkaXRvci9yZXNvdXJjZS90aXRsZScsXG5cdFx0aWQ6IE1lbnVJZC5NdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLm11bHRpRGlmZkVkaXRvclJlc291cmNlJywgXCJUaGUgcmVzb3VyY2UgdG9vbGJhciBpbiB0aGUgbXVsdGkgZGlmZiBlZGl0b3JcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliTXVsdGlEaWZmRWRpdG9yTWVudXMnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdkaWZmRWRpdG9yL2d1dHRlci9odW5rJyxcblx0XHRpZDogTWVudUlkLkRpZmZFZGl0b3JIdW5rVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmRpZmZFZGl0b3JHdXR0ZXJUb29sQmFyTWVudXMnLCBcIlRoZSBndXR0ZXIgdG9vbGJhciBpbiB0aGUgZGlmZiBlZGl0b3JcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliRGlmZkVkaXRvckd1dHRlclRvb2xCYXJNZW51cydcblx0fSxcblx0e1xuXHRcdGtleTogJ2RpZmZFZGl0b3IvZ3V0dGVyL3NlbGVjdGlvbicsXG5cdFx0aWQ6IE1lbnVJZC5EaWZmRWRpdG9yU2VsZWN0aW9uVG9vbGJhcixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmRpZmZFZGl0b3JHdXR0ZXJUb29sQmFyTWVudXMnLCBcIlRoZSBndXR0ZXIgdG9vbGJhciBpbiB0aGUgZGlmZiBlZGl0b3JcIiksXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliRGlmZkVkaXRvckd1dHRlclRvb2xCYXJNZW51cydcblx0fSxcblx0e1xuXHRcdGtleTogJ3NlYXJjaFBhbmVsL2FpUmVzdWx0cy9jb21tYW5kcycsXG5cdFx0aWQ6IE1lbnVJZC5TZWFyY2hBY3Rpb25NZW51LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2VhcmNoUGFuZWwuYWlSZXN1bHRzQ29tbWFuZHMnLCBcIlRoZSBjb21tYW5kcyB0aGF0IHdpbGwgY29udHJpYnV0ZSB0byB0aGUgbWVudSByZW5kZXJlZCBhcyBidXR0b25zIG5leHQgdG8gdGhlIEFJIHNlYXJjaCB0aXRsZVwiKSxcblx0fSxcblx0e1xuXHRcdGtleTogJ2VkaXRvci9jb250ZXh0L2NoYXQnLFxuXHRcdGlkOiBNZW51SWQuQ2hhdFRleHRFZGl0b3JNZW51LFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdFRleHRFZGl0b3InLCBcIlRoZSBDaGF0IHN1Ym1lbnUgaW4gdGhlIHRleHQgZWRpdG9yIGNvbnRleHQgbWVudS5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdFx0cHJvcG9zZWQ6ICdjaGF0UGFydGljaXBhbnRQcml2YXRlJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC9pbnB1dC9lZGl0aW5nL3Nlc3Npb25Ub29sYmFyJyxcblx0XHRpZDogTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNUb29sYmFyLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc1Rvb2xiYXInLCBcIlRoZSBDaGF0IEVkaXRpbmcgd2lkZ2V0IHRvb2xiYXIgbWVudSBmb3Igc2Vzc2lvbiBjaGFuZ2VzLlwiKSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC9pbnB1dC9lZGl0aW5nL3Nlc3Npb25UaXRsZVRvb2xiYXInLFxuXHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRpbmdTZXNzaW9uVGl0bGVUb29sYmFyLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuY2hhdEVkaXRpbmdTZXNzaW9uVGl0bGVUb29sYmFyJywgXCJUaGUgQ2hhdCBFZGl0aW5nIHdpZGdldCB0b29sYmFyIG1lbnUgZm9yIHNlc3Npb24gdGl0bGUuXCIpLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFNlc3Npb25zUHJvdmlkZXInXG5cdH0sXG5cdHtcblx0XHQvLyBUT0RPOiByZW5hbWUgdGhpcyB0byBzb21ldGhpbmcgbGlrZTogYGNoYXRTZXNzaW9ucy9pdGVtL2lubGluZWBcblx0XHRrZXk6ICdjaGF0L2NoYXRTZXNzaW9ucycsXG5cdFx0aWQ6IE1lbnVJZC5BZ2VudFNlc3Npb25zQ29udGV4dCxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmNoYXRTZXNzaW9ucycsIFwiVGhlIENoYXQgU2Vzc2lvbnMgbWVudS5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbnNQcm92aWRlcidcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXRTZXNzaW9ucy9pdGVtL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuU2Vzc2lvbkl0ZW1Db250ZXh0TWVudSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmNoYXRTZXNzaW9uc0l0ZW1Db250ZXh0JywgXCJUaGUgY29udGV4dCBtZW51IGZvciBpdGVtcyBpbiB0aGUgU2Vzc2lvbnMgd2luZG93J3Mgc2Vzc2lvbiBsaXN0LlwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdFNlc3Npb25zL25ld1Nlc3Npb24nLFxuXHRcdGlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc0NyZWF0ZVN1Yk1lbnUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0U2Vzc2lvbnNOZXdTZXNzaW9uJywgXCJNZW51IGZvciBuZXcgY2hhdCBzZXNzaW9ucy5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbnNQcm92aWRlcidcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQvbXVsdGlEaWZmL2NvbnRleHQnLFxuXHRcdGlkOiBNZW51SWQuQ2hhdE11bHRpRGlmZkNvbnRleHQsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0TXVsdGlEaWZmQ29udGV4dCcsIFwiVGhlIENoYXQgTXVsdGktRGlmZiBjb250ZXh0IG1lbnUuXCIpLFxuXHRcdHN1cHBvcnRzU3VibWVudXM6IGZhbHNlLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFNlc3Npb25zUHJvdmlkZXInLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC9jdXN0b21pemF0aW9ucy9jcmVhdGUnLFxuXHRcdGlkOiBNZW51SWQuZm9yKCdBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q3JlYXRlJyksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0Q3VzdG9taXphdGlvbnNDcmVhdGUnLCBcIlRoZSBjcmVhdGUgYnV0dG9uIGluIHRoZSBDaGF0IEN1c3RvbWl6YXRpb25zIG1hbmFnZW1lbnQgZWRpdG9yLlwiKSxcblx0XHRzdXBwb3J0c1N1Ym1lbnVzOiBmYWxzZSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uQ3VzdG9taXphdGlvblByb3ZpZGVyJyxcblx0fSxcblx0e1xuXHRcdGtleTogJ2NoYXQvY3VzdG9taXphdGlvbnMvaXRlbScsXG5cdFx0aWQ6IE1lbnVJZC5mb3IoJ0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJdGVtJyksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0Q3VzdG9taXphdGlvbnNJdGVtJywgXCJUaGUgaXRlbSBjb250ZXh0IG1lbnUgaW4gdGhlIENoYXQgQ3VzdG9taXphdGlvbnMgbWFuYWdlbWVudCBlZGl0b3IsIGluY2x1ZGluZyBpbmxpbmUgYWN0aW9ucy5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25Qcm92aWRlcicsXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0L2VkaXRvci9pbmxpbmVHdXR0ZXInLFxuXHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZU1lbnUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0RWRpdG9ySW5saW5lR3V0dGVyJywgXCJUaGUgaW5saW5lIGd1dHRlciBtZW51IGluIHRoZSBjaGF0IGVkaXRvci5cIiksXG5cdFx0c3VwcG9ydHNTdWJtZW51czogZmFsc2UsXG5cdFx0cHJvcG9zZWQ6ICdjb250cmliQ2hhdEVkaXRvcklubGluZUd1dHRlck1lbnUnLFxuXHR9LFxuXHR7XG5cdFx0a2V5OiAnY2hhdC9jb250ZXh0VXNhZ2UvYWN0aW9ucycsXG5cdFx0aWQ6IE1lbnVJZC5DaGF0Q29udGV4dFVzYWdlQWN0aW9ucyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmNoYXRDb250ZXh0VXNhZ2VBY3Rpb25zJywgXCJBY3Rpb25zIGluIHRoZSBjaGF0IGNvbnRleHQgdXNhZ2UgZGV0YWlscyBwb3B1cC5cIiksXG5cdFx0cHJvcG9zZWQ6ICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdjaGF0L25ld1Nlc3Npb24nLFxuXHRcdGlkOiBNZW51SWQuQ2hhdE5ld01lbnUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5jaGF0TmV3U2Vzc2lvbicsIFwiVGhlIENoYXQgbmV3IHNlc3Npb24gbWVudS5cIiksXG5cdFx0cHJvcG9zZWQ6ICdjaGF0U2Vzc2lvbnNQcm92aWRlcidcblx0fSxcblx0e1xuXHRcdGtleTogJ2FnZW50cy9jaGFuZ2VzL2FjdGlvbnMnLFxuXHRcdGlkOiBNZW51SWQuQWdlbnRzQ2hhbmdlc1Rvb2xiYXIsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdtZW51cy5hZ2VudHNDaGFuZ2VzVG9vbGJhcicsIFwiVGhlIENoYW5nZXMgdmlldyB0b29sYmFyIG9mIHRoZSBhZ2VudHMgd2luZG93LlwiKSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJ1xuXHR9LFxuXHR7XG5cdFx0a2V5OiAnYWdlbnRzL2NoYW5nZXMvYWN0aW9ucy9wcmltYXJ5Jyxcblx0XHRpZDogTWVudUlkLkFnZW50c0NoYW5nZXNQcmltYXJ5QWN0aW9uU3ViTWVudSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ21lbnVzLmFnZW50c0NoYW5nZXNQcmltYXJ5QWN0aW9uU3ViTWVudScsIFwiVGhlIENoYW5nZXMgdmlldyB0b29sYmFyIHByaW1hcnkgYWN0aW9uIHN1Ym1lbnUgaW4gdGhlIGFnZW50cyB3aW5kb3cuXCIpLFxuXHRcdHByb3Bvc2VkOiAnY2hhdFNlc3Npb25zUHJvdmlkZXInXG5cdH0sXG5cdHtcblx0XHRrZXk6ICdhZ2VudHMvY2hhbmdlL2lubGluZScsXG5cdFx0aWQ6IE1lbnVJZC5BZ2VudHNDaGFuZ2VJbmxpbmVUb29sYmFyLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbWVudXMuYWdlbnRzQ2hhbmdlSW5saW5lJywgXCJUaGUgQ2hhbmdlcyB2aWV3IGlubGluZSBtZW51IGluIHRoZSBhZ2VudHMgd2luZG93LlwiKSxcblx0XHRwcm9wb3NlZDogJ2NoYXRTZXNzaW9uc1Byb3ZpZGVyJ1xuXHR9LFxuXTtcblxubmFtZXNwYWNlIHNjaGVtYSB7XG5cblx0Ly8gLS0tIG1lbnVzLCBzdWJtZW51cyBjb250cmlidXRpb24gcG9pbnRcblxuXHRleHBvcnQgaW50ZXJmYWNlIElVc2VyRnJpZW5kbHlNZW51SXRlbSB7XG5cdFx0Y29tbWFuZDogc3RyaW5nO1xuXHRcdGFsdD86IHN0cmluZztcblx0XHR3aGVuPzogc3RyaW5nO1xuXHRcdGdyb3VwPzogc3RyaW5nO1xuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJVXNlckZyaWVuZGx5U3VibWVudUl0ZW0ge1xuXHRcdHN1Ym1lbnU6IHN0cmluZztcblx0XHR3aGVuPzogc3RyaW5nO1xuXHRcdGdyb3VwPzogc3RyaW5nO1xuXHR9XG5cblx0ZXhwb3J0IGludGVyZmFjZSBJVXNlckZyaWVuZGx5U3VibWVudSB7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRsYWJlbDogc3RyaW5nO1xuXHRcdGljb24/OiBJVXNlckZyaWVuZGx5SWNvbjtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc01lbnVJdGVtKGl0ZW06IElVc2VyRnJpZW5kbHlNZW51SXRlbSB8IElVc2VyRnJpZW5kbHlTdWJtZW51SXRlbSk6IGl0ZW0gaXMgSVVzZXJGcmllbmRseU1lbnVJdGVtIHtcblx0XHRyZXR1cm4gdHlwZW9mIChpdGVtIGFzIElVc2VyRnJpZW5kbHlNZW51SXRlbSkuY29tbWFuZCA9PT0gJ3N0cmluZyc7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gaXNWYWxpZE1lbnVJdGVtKGl0ZW06IElVc2VyRnJpZW5kbHlNZW51SXRlbSwgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiBpdGVtLmNvbW1hbmQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdjb21tYW5kJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoaXRlbS5hbHQgJiYgdHlwZW9mIGl0ZW0uYWx0ICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnYWx0JykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoaXRlbS53aGVuICYmIHR5cGVvZiBpdGVtLndoZW4gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICd3aGVuJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoaXRlbS5ncm91cCAmJiB0eXBlb2YgaXRlbS5ncm91cCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2dyb3VwJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWRTdWJtZW51SXRlbShpdGVtOiBJVXNlckZyaWVuZGx5U3VibWVudUl0ZW0sIGNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3Rvcik6IGJvb2xlYW4ge1xuXHRcdGlmICh0eXBlb2YgaXRlbS5zdWJtZW51ICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdyZXF1aXJlc3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnc3VibWVudScpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0ud2hlbiAmJiB0eXBlb2YgaXRlbS53aGVuICE9PSAnc3RyaW5nJykge1xuXHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdvcHRzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIG9yIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnd2hlbicpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGl0ZW0uZ3JvdXAgJiYgdHlwZW9mIGl0ZW0uZ3JvdXAgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdHN0cmluZycsIFwicHJvcGVydHkgYHswfWAgY2FuIGJlIG9taXR0ZWQgb3IgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdncm91cCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpc1ZhbGlkSXRlbXMoaXRlbXM6IChJVXNlckZyaWVuZGx5TWVudUl0ZW0gfCBJVXNlckZyaWVuZGx5U3VibWVudUl0ZW0pW10sIGNvbGxlY3RvcjogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3Rvcik6IGJvb2xlYW4ge1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShpdGVtcykpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZWFycmF5JywgXCJzdWJtZW51IGl0ZW1zIG11c3QgYmUgYW4gYXJyYXlcIikpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0aWYgKGlzTWVudUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0aWYgKCFpc1ZhbGlkTWVudUl0ZW0oaXRlbSwgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCFpc1ZhbGlkU3VibWVudUl0ZW0oaXRlbSwgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWRTdWJtZW51KHN1Ym1lbnU6IElVc2VyRnJpZW5kbHlTdWJtZW51LCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIHN1Ym1lbnUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmUnLCBcInN1Ym1lbnUgaXRlbXMgbXVzdCBiZSBhbiBvYmplY3RcIikpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygc3VibWVudS5pZCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZXN0cmluZycsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2lkJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHN1Ym1lbnUubGFiZWwgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdsYWJlbCcpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IG1lbnVJdGVtOiBJSlNPTlNjaGVtYSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubWVudUl0ZW0uY29tbWFuZCcsICdJZGVudGlmaWVyIG9mIHRoZSBjb21tYW5kIHRvIGV4ZWN1dGUuIFRoZSBjb21tYW5kIG11c3QgYmUgZGVjbGFyZWQgaW4gdGhlIFxcJ2NvbW1hbmRzXFwnLXNlY3Rpb24nKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHRhbHQ6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVJdGVtLmFsdCcsICdJZGVudGlmaWVyIG9mIGFuIGFsdGVybmF0aXZlIGNvbW1hbmQgdG8gZXhlY3V0ZS4gVGhlIGNvbW1hbmQgbXVzdCBiZSBkZWNsYXJlZCBpbiB0aGUgXFwnY29tbWFuZHNcXCctc2VjdGlvbicpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdHdoZW46IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVJdGVtLndoZW4nLCAnQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBzaG93IHRoaXMgaXRlbScpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tZW51SXRlbS5ncm91cCcsICdHcm91cCBpbnRvIHdoaWNoIHRoaXMgaXRlbSBiZWxvbmdzJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IHN1Ym1lbnVJdGVtOiBJSlNPTlNjaGVtYSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRyZXF1aXJlZDogWydzdWJtZW51J10sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0c3VibWVudToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubWVudUl0ZW0uc3VibWVudScsICdJZGVudGlmaWVyIG9mIHRoZSBzdWJtZW51IHRvIGRpc3BsYXkgaW4gdGhpcyBpdGVtLicpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdHdoZW46IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1lbnVJdGVtLndoZW4nLCAnQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBzaG93IHRoaXMgaXRlbScpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdGdyb3VwOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tZW51SXRlbS5ncm91cCcsICdHcm91cCBpbnRvIHdoaWNoIHRoaXMgaXRlbSBiZWxvbmdzJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IHN1Ym1lbnU6IElKU09OU2NoZW1hID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHJlcXVpcmVkOiBbJ2lkJywgJ2xhYmVsJ10sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0aWQ6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnN1Ym1lbnUuaWQnLCAnSWRlbnRpZmllciBvZiB0aGUgbWVudSB0byBkaXNwbGF5IGFzIGEgc3VibWVudS4nKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuc3VibWVudS5sYWJlbCcsICdUaGUgbGFiZWwgb2YgdGhlIG1lbnUgaXRlbSB3aGljaCBsZWFkcyB0byB0aGlzIHN1Ym1lbnUuJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoeyBrZXk6ICd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnN1Ym1lbnUuaWNvbicsIGNvbW1lbnQ6IFsnZG8gbm90IHRyYW5zbGF0ZSBvciBjaGFuZ2UgXCJcXFxcJCh6YXApXCIsIFxcXFwgaW4gZnJvbnQgb2YgJCBpcyBpbXBvcnRhbnQuJ10gfSwgJyhPcHRpb25hbCkgSWNvbiB3aGljaCBpcyB1c2VkIHRvIHJlcHJlc2VudCB0aGUgc3VibWVudSBpbiB0aGUgVUkuIEVpdGhlciBhIGZpbGUgcGF0aCwgYW4gb2JqZWN0IHdpdGggZmlsZSBwYXRocyBmb3IgZGFyayBhbmQgbGlnaHQgdGhlbWVzLCBvciBhIHRoZW1lIGljb24gcmVmZXJlbmNlcywgbGlrZSBcIlxcXFwkKHphcClcIicpLFxuXHRcdFx0XHRhbnlPZjogW3tcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0bGlnaHQ6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnN1Ym1lbnUuaWNvbi5saWdodCcsICdJY29uIHBhdGggd2hlbiBhIGxpZ2h0IHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkYXJrOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zdWJtZW51Lmljb24uZGFyaycsICdJY29uIHBhdGggd2hlbiBhIGRhcmsgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IG1lbnVzQ29udHJpYnV0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubWVudXMnLCBcIkNvbnRyaWJ1dGVzIG1lbnUgaXRlbXMgdG8gdGhlIGVkaXRvclwiKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiBpbmRleChhcGlNZW51cywgbWVudSA9PiBtZW51LmtleSwgbWVudSA9PiAoe1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbWVudS5wcm9wb3NlZCA/IGxvY2FsaXplKCdwcm9wb3NlZCcsIFwiUHJvcG9zZWQgQVBJLCByZXF1aXJlcyBgZW5hYmxlZEFwaVByb3Bvc2FsOiBbXFxcInswfVxcXCJdYCAtIHsxfVwiLCBtZW51LnByb3Bvc2VkLCBtZW51LmRlc2NyaXB0aW9uKSA6IG1lbnUuZGVzY3JpcHRpb24sXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IG1lbnUuc3VwcG9ydHNTdWJtZW51cyA9PT0gZmFsc2UgPyBtZW51SXRlbSA6IHsgb25lT2Y6IFttZW51SXRlbSwgc3VibWVudUl0ZW1dIH1cblx0XHR9KSksXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiAnU3VibWVudScsXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgb25lT2Y6IFttZW51SXRlbSwgc3VibWVudUl0ZW1dIH1cblx0XHR9XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IHN1Ym1lbnVzQ29udHJpYnV0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuc3VibWVudXMnLCBcIkNvbnRyaWJ1dGVzIHN1Ym1lbnUgaXRlbXMgdG8gdGhlIGVkaXRvclwiKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiBzdWJtZW51XG5cdH07XG5cblx0Ly8gLS0tIGNvbW1hbmRzIGNvbnRyaWJ1dGlvbiBwb2ludFxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSVVzZXJGcmllbmRseUNvbW1hbmQge1xuXHRcdGNvbW1hbmQ6IHN0cmluZztcblx0XHR0aXRsZTogc3RyaW5nIHwgSUxvY2FsaXplZFN0cmluZztcblx0XHRzaG9ydFRpdGxlPzogc3RyaW5nIHwgSUxvY2FsaXplZFN0cmluZztcblx0XHRlbmFibGVtZW50Pzogc3RyaW5nO1xuXHRcdGNhdGVnb3J5Pzogc3RyaW5nIHwgSUxvY2FsaXplZFN0cmluZztcblx0XHRpY29uPzogSVVzZXJGcmllbmRseUljb247XG5cdH1cblxuXHRleHBvcnQgdHlwZSBJVXNlckZyaWVuZGx5SWNvbiA9IHN0cmluZyB8IHsgbGlnaHQ6IHN0cmluZzsgZGFyazogc3RyaW5nIH07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzVmFsaWRDb21tYW5kKGNvbW1hbmQ6IElVc2VyRnJpZW5kbHlDb21tYW5kLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiBib29sZWFuIHtcblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnbm9uZW1wdHknLCBcImV4cGVjdGVkIG5vbi1lbXB0eSB2YWx1ZS5cIikpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShjb21tYW5kLmNvbW1hbmQpKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVzdHJpbmcnLCBcInByb3BlcnR5IGB7MH1gIGlzIG1hbmRhdG9yeSBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdjb21tYW5kJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWlzVmFsaWRMb2NhbGl6ZWRTdHJpbmcoY29tbWFuZC50aXRsZSwgY29sbGVjdG9yLCAndGl0bGUnKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY29tbWFuZC5zaG9ydFRpdGxlICYmICFpc1ZhbGlkTG9jYWxpemVkU3RyaW5nKGNvbW1hbmQuc2hvcnRUaXRsZSwgY29sbGVjdG9yLCAnc2hvcnRUaXRsZScpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjb21tYW5kLmVuYWJsZW1lbnQgJiYgdHlwZW9mIGNvbW1hbmQuZW5hYmxlbWVudCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnb3B0c3RyaW5nJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ3ByZWNvbmRpdGlvbicpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNvbW1hbmQuY2F0ZWdvcnkgJiYgIWlzVmFsaWRMb2NhbGl6ZWRTdHJpbmcoY29tbWFuZC5jYXRlZ29yeSwgY29sbGVjdG9yLCAnY2F0ZWdvcnknKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIWlzVmFsaWRJY29uKGNvbW1hbmQuaWNvbiwgY29sbGVjdG9yKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzVmFsaWRJY29uKGljb246IElVc2VyRnJpZW5kbHlJY29uIHwgdW5kZWZpbmVkLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IpOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIGljb24gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBpY29uID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgaWNvbi5kYXJrID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgaWNvbi5saWdodCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ29wdGljb24nLCBcInByb3BlcnR5IGBpY29uYCBjYW4gYmUgb21pdHRlZCBvciBtdXN0IGJlIGVpdGhlciBhIHN0cmluZyBvciBhIGxpdGVyYWwgbGlrZSBge2RhcmssIGxpZ2h0fWBcIikpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzVmFsaWRMb2NhbGl6ZWRTdHJpbmcobG9jYWxpemVkOiBzdHJpbmcgfCBJTG9jYWxpemVkU3RyaW5nLCBjb2xsZWN0b3I6IEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IsIHByb3BlcnR5TmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHR5cGVvZiBsb2NhbGl6ZWQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3JlcXVpcmVTdHJpbmdPck9iamVjdCcsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2Agb3IgYG9iamVjdGBcIiwgcHJvcGVydHlOYW1lKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgbG9jYWxpemVkID09PSAnc3RyaW5nJyAmJiBpc0ZhbHN5T3JXaGl0ZXNwYWNlKGxvY2FsaXplZCkpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZXN0cmluZycsIFwicHJvcGVydHkgYHswfWAgaXMgbWFuZGF0b3J5IGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgcHJvcGVydHlOYW1lKSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgbG9jYWxpemVkICE9PSAnc3RyaW5nJyAmJiAoaXNGYWxzeU9yV2hpdGVzcGFjZShsb2NhbGl6ZWQub3JpZ2luYWwpIHx8IGlzRmFsc3lPcldoaXRlc3BhY2UobG9jYWxpemVkLnZhbHVlKSkpIHtcblx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncmVxdWlyZXN0cmluZ3MnLCBcInByb3BlcnRpZXMgYHswfWAgYW5kIGB7MX1gIGFyZSBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCBgJHtwcm9wZXJ0eU5hbWV9LnZhbHVlYCwgYCR7cHJvcGVydHlOYW1lfS5vcmlnaW5hbGApKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IGNvbW1hbmRUeXBlOiBJSlNPTlNjaGVtYSA9IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRyZXF1aXJlZDogWydjb21tYW5kJywgJ3RpdGxlJ10sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29tbWFuZFR5cGUuY29tbWFuZCcsICdJZGVudGlmaWVyIG9mIHRoZSBjb21tYW5kIHRvIGV4ZWN1dGUnKSxcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29tbWFuZFR5cGUudGl0bGUnLCAnVGl0bGUgYnkgd2hpY2ggdGhlIGNvbW1hbmQgaXMgcmVwcmVzZW50ZWQgaW4gdGhlIFVJJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0c2hvcnRUaXRsZToge1xuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb21tYW5kVHlwZS5zaG9ydFRpdGxlJywgJyhPcHRpb25hbCkgU2hvcnQgdGl0bGUgYnkgd2hpY2ggdGhlIGNvbW1hbmQgaXMgcmVwcmVzZW50ZWQgaW4gdGhlIFVJLiBNZW51cyBwaWNrIGVpdGhlciBgdGl0bGVgIG9yIGBzaG9ydFRpdGxlYCBkZXBlbmRpbmcgb24gdGhlIGNvbnRleHQgaW4gd2hpY2ggdGhleSBzaG93IGNvbW1hbmRzLicpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb21tYW5kVHlwZS5jYXRlZ29yeScsICcoT3B0aW9uYWwpIENhdGVnb3J5IHN0cmluZyBieSB3aGljaCB0aGUgY29tbWFuZCBpcyBncm91cGVkIGluIHRoZSBVSScpLFxuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdGVuYWJsZW1lbnQ6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbW1hbmRUeXBlLnByZWNvbmRpdGlvbicsICcoT3B0aW9uYWwpIENvbmRpdGlvbiB3aGljaCBtdXN0IGJlIHRydWUgdG8gZW5hYmxlIHRoZSBjb21tYW5kIGluIHRoZSBVSSAobWVudSBhbmQga2V5YmluZGluZ3MpLiBEb2VzIG5vdCBwcmV2ZW50IGV4ZWN1dGluZyB0aGUgY29tbWFuZCBieSBvdGhlciBtZWFucywgbGlrZSB0aGUgYGV4ZWN1dGVDb21tYW5kYC1hcGkuJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoeyBrZXk6ICd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbW1hbmRUeXBlLmljb24nLCBjb21tZW50OiBbJ2RvIG5vdCB0cmFuc2xhdGUgb3IgY2hhbmdlIFwiXFxcXCQoemFwKVwiLCBcXFxcIGluIGZyb250IG9mICQgaXMgaW1wb3J0YW50LiddIH0sICcoT3B0aW9uYWwpIEljb24gd2hpY2ggaXMgdXNlZCB0byByZXByZXNlbnQgdGhlIGNvbW1hbmQgaW4gdGhlIFVJLiBFaXRoZXIgYSBmaWxlIHBhdGgsIGFuIG9iamVjdCB3aXRoIGZpbGUgcGF0aHMgZm9yIGRhcmsgYW5kIGxpZ2h0IHRoZW1lcywgb3IgYSB0aGVtZSBpY29uIHJlZmVyZW5jZXMsIGxpa2UgXCJcXFxcJCh6YXApXCInKSxcblx0XHRcdFx0YW55T2Y6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGxpZ2h0OiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5jb21tYW5kVHlwZS5pY29uLmxpZ2h0JywgJ0ljb24gcGF0aCB3aGVuIGEgbGlnaHQgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRhcms6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmNvbW1hbmRUeXBlLmljb24uZGFyaycsICdJY29uIHBhdGggd2hlbiBhIGRhcmsgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IGNvbW1hbmRzQ29udHJpYnV0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuY29tbWFuZHMnLCBcIkNvbnRyaWJ1dGVzIGNvbW1hbmRzIHRvIHRoZSBjb21tYW5kIHBhbGV0dGUuXCIpLFxuXHRcdG9uZU9mOiBbXG5cdFx0XHRjb21tYW5kVHlwZSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IGNvbW1hbmRUeXBlXG5cdFx0XHR9XG5cdFx0XVxuXHR9O1xufVxuXG5jb25zdCBfY29tbWFuZFJlZ2lzdHJhdGlvbnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cbmV4cG9ydCBjb25zdCBjb21tYW5kc0V4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8c2NoZW1hLklVc2VyRnJpZW5kbHlDb21tYW5kIHwgc2NoZW1hLklVc2VyRnJpZW5kbHlDb21tYW5kW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjb21tYW5kcycsXG5cdGpzb25TY2hlbWE6IHNjaGVtYS5jb21tYW5kc0NvbnRyaWJ1dGlvbixcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChjb250cmliczogcmVhZG9ubHkgc2NoZW1hLklVc2VyRnJpZW5kbHlDb21tYW5kW10pIHtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgY29udHJpYnMpIHtcblx0XHRcdGlmIChjb250cmliLmNvbW1hbmQpIHtcblx0XHRcdFx0eWllbGQgYG9uQ29tbWFuZDoke2NvbnRyaWIuY29tbWFuZH1gO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmNvbW1hbmRzRXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHtcblxuXHRmdW5jdGlvbiBoYW5kbGVDb21tYW5kKHVzZXJGcmllbmRseUNvbW1hbmQ6IHNjaGVtYS5JVXNlckZyaWVuZGx5Q29tbWFuZCwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uUG9pbnRVc2VyPHVua25vd24+KSB7XG5cblx0XHRpZiAoIXNjaGVtYS5pc1ZhbGlkQ29tbWFuZCh1c2VyRnJpZW5kbHlDb21tYW5kLCBleHRlbnNpb24uY29sbGVjdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgaWNvbiwgZW5hYmxlbWVudCwgY2F0ZWdvcnksIHRpdGxlLCBzaG9ydFRpdGxlLCBjb21tYW5kIH0gPSB1c2VyRnJpZW5kbHlDb21tYW5kO1xuXG5cdFx0bGV0IGFic29sdXRlSWNvbjogeyBkYXJrOiBVUkk7IGxpZ2h0PzogVVJJIH0gfCBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGljb24pIHtcblx0XHRcdGlmICh0eXBlb2YgaWNvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0YWJzb2x1dGVJY29uID0gVGhlbWVJY29uLmZyb21TdHJpbmcoaWNvbikgPz8geyBkYXJrOiByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBpY29uKSwgbGlnaHQ6IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGljb24pIH07XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFic29sdXRlSWNvbiA9IHtcblx0XHRcdFx0XHRkYXJrOiByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBpY29uLmRhcmspLFxuXHRcdFx0XHRcdGxpZ2h0OiByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBpY29uLmxpZ2h0KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4aXN0aW5nQ21kID0gTWVudVJlZ2lzdHJ5LmdldENvbW1hbmQoY29tbWFuZCk7XG5cdFx0aWYgKGV4aXN0aW5nQ21kKSB7XG5cdFx0XHRpZiAoZXhpc3RpbmdDbWQuc291cmNlKSB7XG5cdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuaW5mbyhsb2NhbGl6ZSgnZHVwMScsIFwiQ29tbWFuZCBgezB9YCBhbHJlYWR5IHJlZ2lzdGVyZWQgYnkgezF9ICh7Mn0pXCIsIHVzZXJGcmllbmRseUNvbW1hbmQuY29tbWFuZCwgZXhpc3RpbmdDbWQuc291cmNlLnRpdGxlLCBleGlzdGluZ0NtZC5zb3VyY2UuaWQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuaW5mbyhsb2NhbGl6ZSgnZHVwMCcsIFwiQ29tbWFuZCBgezB9YCBhbHJlYWR5IHJlZ2lzdGVyZWRcIiwgdXNlckZyaWVuZGx5Q29tbWFuZC5jb21tYW5kKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdF9jb21tYW5kUmVnaXN0cmF0aW9ucy5hZGQoTWVudVJlZ2lzdHJ5LmFkZENvbW1hbmQoe1xuXHRcdFx0aWQ6IGNvbW1hbmQsXG5cdFx0XHR0aXRsZSxcblx0XHRcdHNvdXJjZTogeyBpZDogZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIHRpdGxlOiBleHRlbnNpb24uZGVzY3JpcHRpb24uZGlzcGxheU5hbWUgPz8gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLm5hbWUgfSxcblx0XHRcdHNob3J0VGl0bGUsXG5cdFx0XHR0b29sdGlwOiB0aXRsZSxcblx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShlbmFibGVtZW50KSxcblx0XHRcdGljb246IGFic29sdXRlSWNvblxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIHJlbW92ZSBhbGwgcHJldmlvdXMgY29tbWFuZCByZWdpc3RyYXRpb25zXG5cdF9jb21tYW5kUmVnaXN0cmF0aW9ucy5jbGVhcigpO1xuXG5cdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRjb25zdCB7IHZhbHVlIH0gPSBleHRlbnNpb247XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgdmFsdWUpIHtcblx0XHRcdFx0aGFuZGxlQ29tbWFuZChjb21tYW5kLCBleHRlbnNpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRoYW5kbGVDb21tYW5kKHZhbHVlLCBleHRlbnNpb24pO1xuXHRcdH1cblx0fVxufSk7XG5cbmludGVyZmFjZSBJUmVnaXN0ZXJlZFN1Ym1lbnUge1xuXHRyZWFkb25seSBpZDogTWVudUlkO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpY29uPzogeyBkYXJrOiBVUkk7IGxpZ2h0PzogVVJJIH0gfCBUaGVtZUljb247XG59XG5cbmNvbnN0IF9zdWJtZW51cyA9IG5ldyBNYXA8c3RyaW5nLCBJUmVnaXN0ZXJlZFN1Ym1lbnU+KCk7XG5cbmNvbnN0IHN1Ym1lbnVzRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxzY2hlbWEuSVVzZXJGcmllbmRseVN1Ym1lbnVbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ3N1Ym1lbnVzJyxcblx0anNvblNjaGVtYTogc2NoZW1hLnN1Ym1lbnVzQ29udHJpYnV0aW9uXG59KTtcblxuc3VibWVudXNFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKGV4dGVuc2lvbnMgPT4ge1xuXG5cdF9zdWJtZW51cy5jbGVhcigpO1xuXG5cdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRjb25zdCB7IHZhbHVlLCBjb2xsZWN0b3IgfSA9IGV4dGVuc2lvbjtcblxuXHRcdGZvciAoY29uc3QgWywgc3VibWVudUluZm9dIG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlKSkge1xuXG5cdFx0XHRpZiAoIXNjaGVtYS5pc1ZhbGlkU3VibWVudShzdWJtZW51SW5mbywgY29sbGVjdG9yKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzdWJtZW51SW5mby5pZCkge1xuXHRcdFx0XHRjb2xsZWN0b3Iud2Fybihsb2NhbGl6ZSgnc3VibWVudUlkLmludmFsaWQuaWQnLCBcImB7MH1gIGlzIG5vdCBhIHZhbGlkIHN1Ym1lbnUgaWRlbnRpZmllclwiLCBzdWJtZW51SW5mby5pZCkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChfc3VibWVudXMuaGFzKHN1Ym1lbnVJbmZvLmlkKSkge1xuXHRcdFx0XHRjb2xsZWN0b3IuaW5mbyhsb2NhbGl6ZSgnc3VibWVudUlkLmR1cGxpY2F0ZS5pZCcsIFwiVGhlIGB7MH1gIHN1Ym1lbnUgd2FzIGFscmVhZHkgcHJldmlvdXNseSByZWdpc3RlcmVkLlwiLCBzdWJtZW51SW5mby5pZCkpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghc3VibWVudUluZm8ubGFiZWwpIHtcblx0XHRcdFx0Y29sbGVjdG9yLndhcm4obG9jYWxpemUoJ3N1Ym1lbnVJZC5pbnZhbGlkLmxhYmVsJywgXCJgezB9YCBpcyBub3QgYSB2YWxpZCBzdWJtZW51IGxhYmVsXCIsIHN1Ym1lbnVJbmZvLmxhYmVsKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgYWJzb2x1dGVJY29uOiB7IGRhcms6IFVSSTsgbGlnaHQ/OiBVUkkgfSB8IFRoZW1lSWNvbiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzdWJtZW51SW5mby5pY29uKSB7XG5cdFx0XHRcdGlmICh0eXBlb2Ygc3VibWVudUluZm8uaWNvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRhYnNvbHV0ZUljb24gPSBUaGVtZUljb24uZnJvbVN0cmluZyhzdWJtZW51SW5mby5pY29uKSB8fCB7IGRhcms6IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIHN1Ym1lbnVJbmZvLmljb24pIH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YWJzb2x1dGVJY29uID0ge1xuXHRcdFx0XHRcdFx0ZGFyazogcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgc3VibWVudUluZm8uaWNvbi5kYXJrKSxcblx0XHRcdFx0XHRcdGxpZ2h0OiByZXNvdXJjZXMuam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBzdWJtZW51SW5mby5pY29uLmxpZ2h0KVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbTogSVJlZ2lzdGVyZWRTdWJtZW51ID0ge1xuXHRcdFx0XHRpZDogTWVudUlkLmZvcihgYXBpOiR7c3VibWVudUluZm8uaWR9YCksXG5cdFx0XHRcdGxhYmVsOiBzdWJtZW51SW5mby5sYWJlbCxcblx0XHRcdFx0aWNvbjogYWJzb2x1dGVJY29uXG5cdFx0XHR9O1xuXG5cdFx0XHRfc3VibWVudXMuc2V0KHN1Ym1lbnVJbmZvLmlkLCBpdGVtKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5jb25zdCBfYXBpTWVudXNCeUtleSA9IG5ldyBNYXAoYXBpTWVudXMubWFwKG1lbnUgPT4gKFttZW51LmtleSwgbWVudV0pKSk7XG5jb25zdCBfbWVudVJlZ2lzdHJhdGlvbnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5jb25zdCBfc3VibWVudU1lbnVJdGVtcyA9IG5ldyBNYXA8c3RyaW5nIC8qIG1lbnUgaWQgKi8sIFNldDxzdHJpbmcgLyogc3VibWVudSBpZCAqLz4+KCk7XG5cbmNvbnN0IG1lbnVzRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDx7IFtsb2M6IHN0cmluZ106IChzY2hlbWEuSVVzZXJGcmllbmRseU1lbnVJdGVtIHwgc2NoZW1hLklVc2VyRnJpZW5kbHlTdWJtZW51SXRlbSlbXSB9Pih7XG5cdGV4dGVuc2lvblBvaW50OiAnbWVudXMnLFxuXHRqc29uU2NoZW1hOiBzY2hlbWEubWVudXNDb250cmlidXRpb24sXG5cdGRlcHM6IFtzdWJtZW51c0V4dGVuc2lvblBvaW50XVxufSk7XG5cbm1lbnVzRXh0ZW5zaW9uUG9pbnQuc2V0SGFuZGxlcihleHRlbnNpb25zID0+IHtcblxuXHQvLyByZW1vdmUgYWxsIHByZXZpb3VzIG1lbnUgcmVnaXN0cmF0aW9uc1xuXHRfbWVudVJlZ2lzdHJhdGlvbnMuY2xlYXIoKTtcblx0X3N1Ym1lbnVNZW51SXRlbXMuY2xlYXIoKTtcblxuXHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0Y29uc3QgeyB2YWx1ZSwgY29sbGVjdG9yIH0gPSBleHRlbnNpb247XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIE9iamVjdC5lbnRyaWVzKHZhbHVlKSkge1xuXHRcdFx0aWYgKCFzY2hlbWEuaXNWYWxpZEl0ZW1zKGVudHJ5WzFdLCBjb2xsZWN0b3IpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgbWVudSA9IF9hcGlNZW51c0J5S2V5LmdldChlbnRyeVswXSk7XG5cblx0XHRcdGlmICghbWVudSkge1xuXHRcdFx0XHRjb25zdCBzdWJtZW51ID0gX3N1Ym1lbnVzLmdldChlbnRyeVswXSk7XG5cblx0XHRcdFx0aWYgKHN1Ym1lbnUpIHtcblx0XHRcdFx0XHRtZW51ID0ge1xuXHRcdFx0XHRcdFx0a2V5OiBlbnRyeVswXSxcblx0XHRcdFx0XHRcdGlkOiBzdWJtZW51LmlkLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICcnXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW1lbnUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtZW51LnByb3Bvc2VkICYmICFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sIG1lbnUucHJvcG9zZWQpKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgncHJvcG9zZWRBUEkuaW52YWxpZCcsIFwiezB9IGlzIGEgcHJvcG9zZWQgbWVudSBpZGVudGlmaWVyLiBJdCByZXF1aXJlcyAncGFja2FnZS5qc29uI2VuYWJsZWRBcGlQcm9wb3NhbHM6IFtcXFwiezF9XFxcIl0nIGFuZCBpcyBvbmx5IGF2YWlsYWJsZSB3aGVuIHJ1bm5pbmcgb3V0IG9mIGRldiBvciB3aXRoIHRoZSBmb2xsb3dpbmcgY29tbWFuZCBsaW5lIHN3aXRjaDogLS1lbmFibGUtcHJvcG9zZWQtYXBpIHsyfVwiLCBlbnRyeVswXSwgbWVudS5wcm9wb3NlZCwgZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgbWVudUl0ZW0gb2YgZW50cnlbMV0pIHtcblx0XHRcdFx0bGV0IGl0ZW06IElNZW51SXRlbSB8IElTdWJtZW51SXRlbTtcblxuXHRcdFx0XHRpZiAoc2NoZW1hLmlzTWVudUl0ZW0obWVudUl0ZW0pKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IE1lbnVSZWdpc3RyeS5nZXRDb21tYW5kKG1lbnVJdGVtLmNvbW1hbmQpO1xuXHRcdFx0XHRcdGNvbnN0IGFsdCA9IG1lbnVJdGVtLmFsdCAmJiBNZW51UmVnaXN0cnkuZ2V0Q29tbWFuZChtZW51SXRlbS5hbHQpIHx8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRcdGlmICghY29tbWFuZCkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdtaXNzaW5nLmNvbW1hbmQnLCBcIk1lbnUgaXRlbSByZWZlcmVuY2VzIGEgY29tbWFuZCBgezB9YCB3aGljaCBpcyBub3QgZGVmaW5lZCBpbiB0aGUgJ2NvbW1hbmRzJyBzZWN0aW9uLlwiLCBtZW51SXRlbS5jb21tYW5kKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1lbnVJdGVtLmFsdCAmJiAhYWx0KSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3Iud2Fybihsb2NhbGl6ZSgnbWlzc2luZy5hbHRDb21tYW5kJywgXCJNZW51IGl0ZW0gcmVmZXJlbmNlcyBhbiBhbHQtY29tbWFuZCBgezB9YCB3aGljaCBpcyBub3QgZGVmaW5lZCBpbiB0aGUgJ2NvbW1hbmRzJyBzZWN0aW9uLlwiLCBtZW51SXRlbS5hbHQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1lbnVJdGVtLmNvbW1hbmQgPT09IG1lbnVJdGVtLmFsdCkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmluZm8obG9jYWxpemUoJ2R1cGUuY29tbWFuZCcsIFwiTWVudSBpdGVtIHJlZmVyZW5jZXMgdGhlIHNhbWUgY29tbWFuZCBhcyBkZWZhdWx0IGFuZCBhbHQtY29tbWFuZFwiKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aXRlbSA9IHsgY29tbWFuZCwgYWx0LCBncm91cDogdW5kZWZpbmVkLCBvcmRlcjogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAobWVudS5zdXBwb3J0c1N1Ym1lbnVzID09PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCd1bnN1cHBvcnRlZC5zdWJtZW51cmVmZXJlbmNlJywgXCJNZW51IGl0ZW0gcmVmZXJlbmNlcyBhIHN1Ym1lbnUgZm9yIGEgbWVudSB3aGljaCBkb2Vzbid0IGhhdmUgc3VibWVudSBzdXBwb3J0LlwiKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBzdWJtZW51ID0gX3N1Ym1lbnVzLmdldChtZW51SXRlbS5zdWJtZW51KTtcblxuXHRcdFx0XHRcdGlmICghc3VibWVudSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKGxvY2FsaXplKCdtaXNzaW5nLnN1Ym1lbnUnLCBcIk1lbnUgaXRlbSByZWZlcmVuY2VzIGEgc3VibWVudSBgezB9YCB3aGljaCBpcyBub3QgZGVmaW5lZCBpbiB0aGUgJ3N1Ym1lbnVzJyBzZWN0aW9uLlwiLCBtZW51SXRlbS5zdWJtZW51KSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgc3VibWVudVJlZ2lzdHJhdGlvbnMgPSBfc3VibWVudU1lbnVJdGVtcy5nZXQobWVudS5pZC5pZCk7XG5cblx0XHRcdFx0XHRpZiAoIXN1Ym1lbnVSZWdpc3RyYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRzdWJtZW51UmVnaXN0cmF0aW9ucyA9IG5ldyBTZXQoKTtcblx0XHRcdFx0XHRcdF9zdWJtZW51TWVudUl0ZW1zLnNldChtZW51LmlkLmlkLCBzdWJtZW51UmVnaXN0cmF0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHN1Ym1lbnVSZWdpc3RyYXRpb25zLmhhcyhzdWJtZW51LmlkLmlkKSkge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obG9jYWxpemUoJ3N1Ym1lbnVJdGVtLmR1cGxpY2F0ZScsIFwiVGhlIGB7MH1gIHN1Ym1lbnUgd2FzIGFscmVhZHkgY29udHJpYnV0ZWQgdG8gdGhlIGB7MX1gIG1lbnUuXCIsIG1lbnVJdGVtLnN1Ym1lbnUsIGVudHJ5WzBdKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRzdWJtZW51UmVnaXN0cmF0aW9ucy5hZGQoc3VibWVudS5pZC5pZCk7XG5cblx0XHRcdFx0XHRpdGVtID0geyBzdWJtZW51OiBzdWJtZW51LmlkLCBpY29uOiBzdWJtZW51Lmljb24sIHRpdGxlOiBzdWJtZW51LmxhYmVsLCBncm91cDogdW5kZWZpbmVkLCBvcmRlcjogdW5kZWZpbmVkLCB3aGVuOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtZW51SXRlbS5ncm91cCkge1xuXHRcdFx0XHRcdGNvbnN0IGlkeCA9IG1lbnVJdGVtLmdyb3VwLmxhc3RJbmRleE9mKCdAJyk7XG5cdFx0XHRcdFx0aWYgKGlkeCA+IDApIHtcblx0XHRcdFx0XHRcdGl0ZW0uZ3JvdXAgPSBtZW51SXRlbS5ncm91cC5zdWJzdHIoMCwgaWR4KTtcblx0XHRcdFx0XHRcdGl0ZW0ub3JkZXIgPSBOdW1iZXIobWVudUl0ZW0uZ3JvdXAuc3Vic3RyKGlkeCArIDEpKSB8fCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGl0ZW0uZ3JvdXAgPSBtZW51SXRlbS5ncm91cDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWVudS5pZCA9PT0gTWVudUlkLlZpZXdDb250YWluZXJUaXRsZSAmJiAhbWVudUl0ZW0ud2hlbj8uaW5jbHVkZXMoJ3ZpZXdDb250YWluZXIgPT0gd29ya2JlbmNoLnZpZXcuZGVidWcnKSkge1xuXHRcdFx0XHRcdC8vIE5vdCBhIHBlcmZlY3QgY2hlY2sgYnV0IGVub3VnaCB0byBjb21tdW5pY2F0ZSB0aGF0IHRoaXMgcHJvcG9zZWQgZXh0ZW5zaW9uIHBvaW50IGlzIGN1cnJlbnRseSBvbmx5IGZvciB0aGUgZGVidWcgdmlldyBjb250YWluZXJcblx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ3ZpZXdDb250YWluZXJUaXRsZS53aGVuJywgXCJUaGUgezB9IG1lbnUgY29udHJpYnV0aW9uIG11c3QgY2hlY2sgezF9IGluIGl0cyB7Mn0gY2xhdXNlLlwiLCAnYHZpZXdDb250YWluZXIvdGl0bGVgJywgJ2B2aWV3Q29udGFpbmVyID09IHdvcmtiZW5jaC52aWV3LmRlYnVnYCcsICdcIndoZW5cIicpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGl0ZW0ud2hlbiA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKG1lbnVJdGVtLndoZW4pO1xuXHRcdFx0XHRfbWVudVJlZ2lzdHJhdGlvbnMuYWRkKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51LmlkLCBpdGVtKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuY2xhc3MgQ29tbWFuZHNUYWJsZVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlXG5cdCkgeyBzdXBlcigpOyB9XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8uY29tbWFuZHM7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IHJhd0NvbW1hbmRzID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbW1hbmRzIHx8IFtdO1xuXHRcdGNvbnN0IGNvbW1hbmRzID0gcmF3Q29tbWFuZHMubWFwKGMgPT4gKHtcblx0XHRcdGlkOiBjLmNvbW1hbmQsXG5cdFx0XHR0aXRsZTogYy50aXRsZSxcblx0XHRcdGtleWJpbmRpbmdzOiBbXSBhcyBSZXNvbHZlZEtleWJpbmRpbmdbXSxcblx0XHRcdG1lbnVzOiBbXSBhcyBzdHJpbmdbXVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGJ5SWQgPSBpbmRleChjb21tYW5kcywgYyA9PiBjLmlkKTtcblxuXHRcdGNvbnN0IG1lbnVzID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/Lm1lbnVzIHx8IHt9O1xuXG5cdFx0Ly8gQWRkIHRvIGNvbW1hbmRQYWxldHRlIGFycmF5IGFueSBjb21tYW5kcyBub3QgZXhwbGljaXRseSBjb250cmlidXRlZCB0byBpdFxuXHRcdGNvbnN0IGltcGxpY2l0bHlPbkNvbW1hbmRQYWxldHRlID0gaW5kZXgoY29tbWFuZHMsIGMgPT4gYy5pZCk7XG5cdFx0aWYgKG1lbnVzWydjb21tYW5kUGFsZXR0ZSddKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgbWVudXNbJ2NvbW1hbmRQYWxldHRlJ10pIHtcblx0XHRcdFx0ZGVsZXRlIGltcGxpY2l0bHlPbkNvbW1hbmRQYWxldHRlW2NvbW1hbmQuY29tbWFuZF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKE9iamVjdC5rZXlzKGltcGxpY2l0bHlPbkNvbW1hbmRQYWxldHRlKS5sZW5ndGgpIHtcblx0XHRcdGlmICghbWVudXNbJ2NvbW1hbmRQYWxldHRlJ10pIHtcblx0XHRcdFx0bWVudXNbJ2NvbW1hbmRQYWxldHRlJ10gPSBbXTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgY29tbWFuZCBpbiBpbXBsaWNpdGx5T25Db21tYW5kUGFsZXR0ZSkge1xuXHRcdFx0XHRtZW51c1snY29tbWFuZFBhbGV0dGUnXS5wdXNoKHsgY29tbWFuZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNvbnRleHQgaW4gbWVudXMpIHtcblx0XHRcdGZvciAoY29uc3QgbWVudSBvZiBtZW51c1tjb250ZXh0XSkge1xuXG5cdFx0XHRcdC8vIFRoaXMgdHlwaWNhbGx5IGhhcHBlbnMgZm9yIHRoZSBjb21tYW5kUGFsZXR0ZSBjb250ZXh0XG5cdFx0XHRcdGlmIChtZW51LndoZW4gPT09ICdmYWxzZScpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobWVudS5jb21tYW5kKSB7XG5cdFx0XHRcdFx0bGV0IGNvbW1hbmQgPSBieUlkW21lbnUuY29tbWFuZF07XG5cdFx0XHRcdFx0aWYgKGNvbW1hbmQpIHtcblx0XHRcdFx0XHRcdGlmICghY29tbWFuZC5tZW51cy5pbmNsdWRlcyhjb250ZXh0KSkge1xuXHRcdFx0XHRcdFx0XHRjb21tYW5kLm1lbnVzLnB1c2goY29udGV4dCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbW1hbmQgPSB7IGlkOiBtZW51LmNvbW1hbmQsIHRpdGxlOiAnJywga2V5YmluZGluZ3M6IFtdLCBtZW51czogW2NvbnRleHRdIH07XG5cdFx0XHRcdFx0XHRieUlkW2NvbW1hbmQuaWRdID0gY29tbWFuZDtcblx0XHRcdFx0XHRcdGNvbW1hbmRzLnB1c2goY29tbWFuZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF3S2V5YmluZGluZ3MgPSBtYW5pZmVzdC5jb250cmlidXRlcz8ua2V5YmluZGluZ3MgPyAoQXJyYXkuaXNBcnJheShtYW5pZmVzdC5jb250cmlidXRlcy5rZXliaW5kaW5ncykgPyBtYW5pZmVzdC5jb250cmlidXRlcy5rZXliaW5kaW5ncyA6IFttYW5pZmVzdC5jb250cmlidXRlcy5rZXliaW5kaW5nc10pIDogW107XG5cblx0XHRyYXdLZXliaW5kaW5ncy5mb3JFYWNoKHJhd0tleWJpbmRpbmcgPT4ge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMucmVzb2x2ZUtleWJpbmRpbmcocmF3S2V5YmluZGluZyk7XG5cblx0XHRcdGlmICgha2V5YmluZGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjb21tYW5kID0gYnlJZFtyYXdLZXliaW5kaW5nLmNvbW1hbmRdO1xuXG5cdFx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0XHRjb21tYW5kLmtleWJpbmRpbmdzLnB1c2goa2V5YmluZGluZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb21tYW5kID0geyBpZDogcmF3S2V5YmluZGluZy5jb21tYW5kLCB0aXRsZTogJycsIGtleWJpbmRpbmdzOiBba2V5YmluZGluZ10sIG1lbnVzOiBbXSB9O1xuXHRcdFx0XHRieUlkW2NvbW1hbmQuaWRdID0gY29tbWFuZDtcblx0XHRcdFx0Y29tbWFuZHMucHVzaChjb21tYW5kKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghY29tbWFuZHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB7IGhlYWRlcnM6IFtdLCByb3dzOiBbXSB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0gW1xuXHRcdFx0bG9jYWxpemUoJ2NvbW1hbmQgbmFtZScsIFwiSURcIiksXG5cdFx0XHRsb2NhbGl6ZSgnY29tbWFuZCB0aXRsZScsIFwiVGl0bGVcIiksXG5cdFx0XHRsb2NhbGl6ZSgna2V5Ym9hcmQgc2hvcnRjdXRzJywgXCJLZXlib2FyZCBTaG9ydGN1dHNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnbWVudUNvbnRleHRzJywgXCJNZW51IENvbnRleHRzXCIpXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IGNvbW1hbmRzLnNvcnQoKGEsIGIpID0+IGEuaWQubG9jYWxlQ29tcGFyZShiLmlkKSlcblx0XHRcdC5tYXAoY29tbWFuZCA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oYFxcYCR7Y29tbWFuZC5pZH1cXGBgKSxcblx0XHRcdFx0XHR0eXBlb2YgY29tbWFuZC50aXRsZSA9PT0gJ3N0cmluZycgPyBjb21tYW5kLnRpdGxlIDogY29tbWFuZC50aXRsZS52YWx1ZSxcblx0XHRcdFx0XHRjb21tYW5kLmtleWJpbmRpbmdzLFxuXHRcdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGAke2NvbW1hbmQubWVudXMuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKS5tYXAobWVudSA9PiBgXFxgJHttZW51fVxcYGApLmpvaW4oJyZuYnNwOycpfWApLFxuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUtleWJpbmRpbmcocmF3S2V5QmluZGluZzogSUtleUJpbmRpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGxldCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdHN3aXRjaCAocGxhdGZvcm0pIHtcblx0XHRcdGNhc2UgJ3dpbjMyJzoga2V5ID0gcmF3S2V5QmluZGluZy53aW47IGJyZWFrO1xuXHRcdFx0Y2FzZSAnbGludXgnOiBrZXkgPSByYXdLZXlCaW5kaW5nLmxpbnV4OyBicmVhaztcblx0XHRcdGNhc2UgJ2Rhcndpbic6IGtleSA9IHJhd0tleUJpbmRpbmcubWFjOyBicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UucmVzb2x2ZVVzZXJCaW5kaW5nKGtleSA/PyByYXdLZXlCaW5kaW5nLmtleSlbMF07XG5cdH1cblxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9uRmVhdHVyZXNFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnY29tbWFuZHMnLFxuXHRsYWJlbDogbG9jYWxpemUoJ2NvbW1hbmRzJywgXCJDb21tYW5kc1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZSxcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihDb21tYW5kc1RhYmxlUmVuZGVyZXIpLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFlBQVksZUFBZTtBQUUzQixTQUF5RCwwQkFBMEI7QUFDbkYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxRQUFRLG9CQUE2QztBQUU5RCxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDRCQUE0QjtBQUVyQyxTQUEwRyxjQUFjLG1DQUFtQztBQUUzSixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLDBCQUEwQjtBQVduQyxNQUFNLFdBQXVCO0FBQUEsRUFDNUI7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHdCQUF3QixxQkFBcUI7QUFBQSxJQUNuRSxrQkFBa0I7QUFBQSxFQUNuQjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGtCQUFrQiw0QkFBNEI7QUFBQSxJQUNwRSxrQkFBa0I7QUFBQSxFQUNuQjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHFCQUFxQix1QkFBdUI7QUFBQSxFQUNuRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGdDQUFnQywyQ0FBMkM7QUFBQSxFQUNsRztBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHdCQUF3QiwwQ0FBMEM7QUFBQSxFQUN6RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHVCQUF1Qix5QkFBeUI7QUFBQSxFQUN2RTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDZCQUE2Qiw4Q0FBOEM7QUFBQSxFQUNsRztBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDRCQUE0Qiw0Q0FBNEM7QUFBQSxJQUM5RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5QixnQ0FBZ0M7QUFBQSxFQUNoRjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDhCQUE4QixtREFBbUQ7QUFBQSxJQUN2RyxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDBCQUEwQiw4QkFBOEI7QUFBQSxFQUMvRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGlDQUFpQyxzREFBc0Q7QUFBQSxJQUM3RyxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLCtCQUErQix1Q0FBdUM7QUFBQSxFQUM3RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLCtCQUErQix1Q0FBdUM7QUFBQSxFQUM3RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDJCQUEyQixtQ0FBbUM7QUFBQSxFQUNyRjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHNCQUFzQix3QkFBd0I7QUFBQSxFQUNyRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsVUFBVTtBQUFBLElBQ1YsYUFBYSxTQUFTLGlDQUFpQyxxQ0FBcUM7QUFBQSxFQUM3RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGtDQUFrQywwQ0FBMEM7QUFBQSxFQUNuRztBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGNBQWMsNENBQTRDO0FBQUEsSUFDaEYsVUFBVTtBQUFBLElBQ1Ysa0JBQWtCO0FBQUEsRUFDbkI7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxhQUFhLDhDQUE4QztBQUFBLEVBQ2xGO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMseUJBQXlCLDRGQUE0RjtBQUFBLElBQzNJLGtCQUFrQjtBQUFBLEVBQ25CO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsa0JBQWtCLCtCQUErQjtBQUFBLEVBQ3hFO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsMEJBQTBCLHlCQUF5QjtBQUFBLEVBQzFFO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsK0JBQStCLDRDQUE0QztBQUFBLElBQ2pHLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsZ0NBQWdDLG9DQUFvQztBQUFBLEVBQzNGO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsOEJBQThCLGdEQUFnRDtBQUFBLEVBQ3JHO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsK0JBQStCLGlEQUFpRDtBQUFBLEVBQ3ZHO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsOEJBQThCLGdEQUFnRDtBQUFBLEVBQ3JHO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMscUJBQXFCLHVDQUF1QztBQUFBLEVBQ25GO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsZUFBZSxtQ0FBbUM7QUFBQSxJQUN4RSxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5Qix1Q0FBdUM7QUFBQSxJQUN0RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDRCQUE0Qiw4Q0FBOEM7QUFBQSxJQUNoRyxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLCtCQUErQix3REFBd0Q7QUFBQSxJQUM3RyxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDhCQUE4QixnREFBZ0Q7QUFBQSxJQUNwRyxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5QiwwQ0FBMEM7QUFBQSxJQUN6RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGtDQUFrQyw2Q0FBNkM7QUFBQSxJQUNyRyxrQkFBa0I7QUFBQSxFQUNuQjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5QiwyQkFBMkI7QUFBQSxFQUMzRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDRCQUE0QixnQ0FBZ0M7QUFBQSxFQUNuRjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGtCQUFrQixpQ0FBaUM7QUFBQSxFQUMxRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHVCQUF1QiwyQ0FBMkM7QUFBQSxJQUN4RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLG9CQUFvQix3Q0FBd0M7QUFBQSxFQUNuRjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLCtCQUErQix3Q0FBd0M7QUFBQSxJQUM3RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHVCQUF1QiwyQ0FBMkM7QUFBQSxFQUN6RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5QiwyRkFBMkY7QUFBQSxJQUMxSSxrQkFBa0I7QUFBQSxFQUNuQjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5QiwyRkFBMkY7QUFBQSxJQUMxSSxrQkFBa0I7QUFBQSxJQUNsQixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDhCQUE4Qiw4SEFBOEg7QUFBQSxJQUNsTCxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGlCQUFpQixvQ0FBb0M7QUFBQSxFQUM1RTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLG1CQUFtQixvRkFBb0Y7QUFBQSxJQUM3SCxrQkFBa0I7QUFBQSxFQUNuQjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDBCQUEwQixzSUFBc0k7QUFBQSxJQUN0TCxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDhCQUE4QixrRUFBa0U7QUFBQSxJQUN0SCxVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLG9CQUFvQix1Q0FBdUM7QUFBQSxFQUNsRjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5Qiw4Q0FBOEM7QUFBQSxJQUM3RixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHVCQUF1QiwwQ0FBMEM7QUFBQSxFQUN4RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5Qiw4Q0FBOEM7QUFBQSxFQUM5RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHVCQUF1QiwwQ0FBMEM7QUFBQSxFQUN4RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDBCQUEwQiw2Q0FBNkM7QUFBQSxFQUM5RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGtCQUFrQixxQ0FBcUM7QUFBQSxFQUM5RTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHdCQUF3QixnQ0FBZ0M7QUFBQSxFQUMvRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDZCQUE2QixrREFBa0Q7QUFBQSxFQUN0RztBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGtDQUFrQyw0Q0FBNEM7QUFBQSxFQUNyRztBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDZCQUE2Qix3REFBd0Q7QUFBQSxFQUM1RztBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGlDQUFpQyw2RUFBNkU7QUFBQSxFQUNySTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGlDQUFpQyxrREFBa0Q7QUFBQSxFQUMxRztBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDBCQUEwQiw0QkFBNEI7QUFBQSxFQUM3RTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHNCQUFzQiw4QkFBOEI7QUFBQSxFQUMzRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHdCQUF3QixxQ0FBcUM7QUFBQSxFQUNwRjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHNCQUFzQixrQ0FBa0M7QUFBQSxFQUMvRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDJCQUEyQix3Q0FBd0M7QUFBQSxFQUMxRjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHlCQUF5QixzQ0FBc0M7QUFBQSxFQUN0RjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGdCQUFnQixvRUFBb0U7QUFBQSxJQUMxRyxrQkFBa0I7QUFBQSxFQUNuQjtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLG1CQUFtQiwwQkFBMEI7QUFBQSxFQUNwRTtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGVBQWUsaURBQWlEO0FBQUEsSUFDdEYsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyw2QkFBNkIseURBQXlEO0FBQUEsSUFDNUcsa0JBQWtCO0FBQUEsSUFDbEIsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxpQkFBaUIseURBQXlEO0FBQUEsSUFDaEcsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUywyQkFBMkIsaURBQWlEO0FBQUEsRUFDbkc7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUywyQkFBMkIsd0NBQXdDO0FBQUEsSUFDekYsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxnQ0FBZ0MscURBQXFEO0FBQUEsSUFDM0csVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxpQ0FBaUMsK0NBQStDO0FBQUEsSUFDdEcsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxzQ0FBc0MsdUNBQXVDO0FBQUEsSUFDbkcsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxzQ0FBc0MsdUNBQXVDO0FBQUEsSUFDbkcsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyxpQ0FBaUMsK0ZBQStGO0FBQUEsRUFDdko7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyx3QkFBd0IsbURBQW1EO0FBQUEsSUFDakcsa0JBQWtCO0FBQUEsSUFDbEIsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUywwQ0FBMEMsMkRBQTJEO0FBQUEsSUFDM0gsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU87QUFBQSxJQUNYLGFBQWEsU0FBUyx3Q0FBd0MseURBQXlEO0FBQUEsSUFDdkgsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUE7QUFBQSxJQUVDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLHNCQUFzQix5QkFBeUI7QUFBQSxJQUNyRSxrQkFBa0I7QUFBQSxJQUNsQixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGlDQUFpQyxtRUFBbUU7QUFBQSxJQUMxSCxrQkFBa0I7QUFBQSxJQUNsQixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLGdDQUFnQyw2QkFBNkI7QUFBQSxJQUNuRixrQkFBa0I7QUFBQSxJQUNsQixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTztBQUFBLElBQ1gsYUFBYSxTQUFTLDhCQUE4QixtQ0FBbUM7QUFBQSxJQUN2RixrQkFBa0I7QUFBQSxJQUNsQixVQUFVO0FBQUEsRUFDWDtBQUFBLEVBQ0E7QUFBQSxJQUNDLEtBQUs7QUFBQSxJQUNMLElBQUksT0FBTyxJQUFJLGlDQUFpQztBQUFBLElBQ2hELGFBQWEsU0FBUyxrQ0FBa0MsaUVBQWlFO0FBQUEsSUFDekgsa0JBQWtCO0FBQUEsSUFDbEIsVUFBVTtBQUFBLEVBQ1g7QUFBQSxFQUNBO0FBQUEsSUFDQyxLQUFLO0FBQUEsSUFDTCxJQUFJLE9BQU8sSUFBSSxxQ0FBcUM7QUFBQSxJQUNwRCxhQUFhLFNBQVMsZ0NBQWdDLCtGQUErRjtBQUFBLElBQ3JKLGtCQUFrQjtBQUFBLElBQ2xCLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsZ0NBQWdDLDRDQUE0QztBQUFBLElBQ2xHLGtCQUFrQjtBQUFBLElBQ2xCLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsaUNBQWlDLGtEQUFrRDtBQUFBLElBQ3pHLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsd0JBQXdCLDRCQUE0QjtBQUFBLElBQzFFLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsOEJBQThCLGdEQUFnRDtBQUFBLElBQ3BHLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsMkNBQTJDLHVFQUF1RTtBQUFBLElBQ3hJLFVBQVU7QUFBQSxFQUNYO0FBQUEsRUFDQTtBQUFBLElBQ0MsS0FBSztBQUFBLElBQ0wsSUFBSSxPQUFPO0FBQUEsSUFDWCxhQUFhLFNBQVMsNEJBQTRCLG9EQUFvRDtBQUFBLElBQ3RHLFVBQVU7QUFBQSxFQUNYO0FBQ0Q7QUFFQSxJQUFVO0FBQUEsQ0FBVixDQUFVQSxZQUFWO0FBdUJRLFdBQVMsV0FBVyxNQUF1RjtBQUNqSCxXQUFPLE9BQVEsS0FBK0IsWUFBWTtBQUFBLEVBQzNEO0FBRk8sRUFBQUEsUUFBUztBQUlULFdBQVMsZ0JBQWdCLE1BQTZCLFdBQStDO0FBQzNHLFFBQUksT0FBTyxLQUFLLFlBQVksVUFBVTtBQUNyQyxnQkFBVSxNQUFNLFNBQVMsaUJBQWlCLDREQUE0RCxTQUFTLENBQUM7QUFDaEgsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssT0FBTyxPQUFPLEtBQUssUUFBUSxVQUFVO0FBQzdDLGdCQUFVLE1BQU0sU0FBUyxhQUFhLDZEQUE2RCxLQUFLLENBQUM7QUFDekcsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssUUFBUSxPQUFPLEtBQUssU0FBUyxVQUFVO0FBQy9DLGdCQUFVLE1BQU0sU0FBUyxhQUFhLDZEQUE2RCxNQUFNLENBQUM7QUFDMUcsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssU0FBUyxPQUFPLEtBQUssVUFBVSxVQUFVO0FBQ2pELGdCQUFVLE1BQU0sU0FBUyxhQUFhLDZEQUE2RCxPQUFPLENBQUM7QUFDM0csYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQW5CTyxFQUFBQSxRQUFTO0FBcUJULFdBQVMsbUJBQW1CLE1BQWdDLFdBQStDO0FBQ2pILFFBQUksT0FBTyxLQUFLLFlBQVksVUFBVTtBQUNyQyxnQkFBVSxNQUFNLFNBQVMsaUJBQWlCLDREQUE0RCxTQUFTLENBQUM7QUFDaEgsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssUUFBUSxPQUFPLEtBQUssU0FBUyxVQUFVO0FBQy9DLGdCQUFVLE1BQU0sU0FBUyxhQUFhLDZEQUE2RCxNQUFNLENBQUM7QUFDMUcsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLEtBQUssU0FBUyxPQUFPLEtBQUssVUFBVSxVQUFVO0FBQ2pELGdCQUFVLE1BQU0sU0FBUyxhQUFhLDZEQUE2RCxPQUFPLENBQUM7QUFDM0csYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQWZPLEVBQUFBLFFBQVM7QUFpQlQsV0FBUyxhQUFhLE9BQTZELFdBQStDO0FBQ3hJLFFBQUksQ0FBQyxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQzFCLGdCQUFVLE1BQU0sU0FBUyxnQkFBZ0IsZ0NBQWdDLENBQUM7QUFDMUUsYUFBTztBQUFBLElBQ1I7QUFFQSxlQUFXLFFBQVEsT0FBTztBQUN6QixVQUFJLFdBQVcsSUFBSSxHQUFHO0FBQ3JCLFlBQUksQ0FBQyxnQkFBZ0IsTUFBTSxTQUFTLEdBQUc7QUFDdEMsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxPQUFPO0FBQ04sWUFBSSxDQUFDLG1CQUFtQixNQUFNLFNBQVMsR0FBRztBQUN6QyxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBbkJPLEVBQUFBLFFBQVM7QUFxQlQsV0FBUyxlQUFlQyxVQUErQixXQUErQztBQUM1RyxRQUFJLE9BQU9BLGFBQVksVUFBVTtBQUNoQyxnQkFBVSxNQUFNLFNBQVMsV0FBVyxpQ0FBaUMsQ0FBQztBQUN0RSxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksT0FBT0EsU0FBUSxPQUFPLFVBQVU7QUFDbkMsZ0JBQVUsTUFBTSxTQUFTLGlCQUFpQiw0REFBNEQsSUFBSSxDQUFDO0FBQzNHLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxPQUFPQSxTQUFRLFVBQVUsVUFBVTtBQUN0QyxnQkFBVSxNQUFNLFNBQVMsaUJBQWlCLDREQUE0RCxPQUFPLENBQUM7QUFDOUcsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQWhCTyxFQUFBRCxRQUFTO0FBa0JoQixRQUFNLFdBQXdCO0FBQUEsSUFDN0IsTUFBTTtBQUFBLElBQ04sVUFBVSxDQUFDLFNBQVM7QUFBQSxJQUNwQixZQUFZO0FBQUEsTUFDWCxTQUFTO0FBQUEsUUFDUixhQUFhLFNBQVMsaURBQWlELDhGQUFnRztBQUFBLFFBQ3ZLLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxLQUFLO0FBQUEsUUFDSixhQUFhLFNBQVMsNkNBQTZDLHlHQUEyRztBQUFBLFFBQzlLLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDTCxhQUFhLFNBQVMsOENBQThDLGdEQUFnRDtBQUFBLFFBQ3BILE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxPQUFPO0FBQUEsUUFDTixhQUFhLFNBQVMsK0NBQStDLG9DQUFvQztBQUFBLFFBQ3pHLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxRQUFNLGNBQTJCO0FBQUEsSUFDaEMsTUFBTTtBQUFBLElBQ04sVUFBVSxDQUFDLFNBQVM7QUFBQSxJQUNwQixZQUFZO0FBQUEsTUFDWCxTQUFTO0FBQUEsUUFDUixhQUFhLFNBQVMsaURBQWlELG9EQUFvRDtBQUFBLFFBQzNILE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDTCxhQUFhLFNBQVMsOENBQThDLGdEQUFnRDtBQUFBLFFBQ3BILE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxPQUFPO0FBQUEsUUFDTixhQUFhLFNBQVMsK0NBQStDLG9DQUFvQztBQUFBLFFBQ3pHLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxRQUFNLFVBQXVCO0FBQUEsSUFDNUIsTUFBTTtBQUFBLElBQ04sVUFBVSxDQUFDLE1BQU0sT0FBTztBQUFBLElBQ3hCLFlBQVk7QUFBQSxNQUNYLElBQUk7QUFBQSxRQUNILGFBQWEsU0FBUywyQ0FBMkMsaURBQWlEO0FBQUEsUUFDbEgsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOLGFBQWEsU0FBUyw4Q0FBOEMseURBQXlEO0FBQUEsUUFDN0gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNMLGFBQWEsU0FBUyxFQUFFLEtBQUssNkNBQTZDLFNBQVMsQ0FBQyx1RUFBdUUsRUFBRSxHQUFHLHdMQUF3TDtBQUFBLFFBQ3hWLE9BQU87QUFBQSxVQUFDO0FBQUEsWUFDUCxNQUFNO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLFlBQVk7QUFBQSxjQUNYLE9BQU87QUFBQSxnQkFDTixhQUFhLFNBQVMsbURBQW1ELHNDQUFzQztBQUFBLGdCQUMvRyxNQUFNO0FBQUEsY0FDUDtBQUFBLGNBQ0EsTUFBTTtBQUFBLGdCQUNMLGFBQWEsU0FBUyxrREFBa0QscUNBQXFDO0FBQUEsZ0JBQzdHLE1BQU07QUFBQSxjQUNQO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRU8sRUFBTUEsUUFBQSxvQkFBaUM7QUFBQSxJQUM3QyxhQUFhLFNBQVMsc0NBQXNDLHNDQUFzQztBQUFBLElBQ2xHLE1BQU07QUFBQSxJQUNOLFlBQVksTUFBTSxVQUFVLFVBQVEsS0FBSyxLQUFLLFdBQVM7QUFBQSxNQUN0RCxxQkFBcUIsS0FBSyxXQUFXLFNBQVMsWUFBWSw4REFBZ0UsS0FBSyxVQUFVLEtBQUssV0FBVyxJQUFJLEtBQUs7QUFBQSxNQUNsSyxNQUFNO0FBQUEsTUFDTixPQUFPLEtBQUsscUJBQXFCLFFBQVEsV0FBVyxFQUFFLE9BQU8sQ0FBQyxVQUFVLFdBQVcsRUFBRTtBQUFBLElBQ3RGLEVBQUU7QUFBQSxJQUNGLHNCQUFzQjtBQUFBLE1BQ3JCLGFBQWE7QUFBQSxNQUNiLE1BQU07QUFBQSxNQUNOLE9BQU8sRUFBRSxPQUFPLENBQUMsVUFBVSxXQUFXLEVBQUU7QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFFTyxFQUFNQSxRQUFBLHVCQUFvQztBQUFBLElBQ2hELGFBQWEsU0FBUyx5Q0FBeUMseUNBQXlDO0FBQUEsSUFDeEcsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLEVBQ1I7QUFlTyxXQUFTLGVBQWUsU0FBK0IsV0FBK0M7QUFDNUcsUUFBSSxDQUFDLFNBQVM7QUFDYixnQkFBVSxNQUFNLFNBQVMsWUFBWSwyQkFBMkIsQ0FBQztBQUNqRSxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksb0JBQW9CLFFBQVEsT0FBTyxHQUFHO0FBQ3pDLGdCQUFVLE1BQU0sU0FBUyxpQkFBaUIsNERBQTRELFNBQVMsQ0FBQztBQUNoSCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyx1QkFBdUIsUUFBUSxPQUFPLFdBQVcsT0FBTyxHQUFHO0FBQy9ELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxRQUFRLGNBQWMsQ0FBQyx1QkFBdUIsUUFBUSxZQUFZLFdBQVcsWUFBWSxHQUFHO0FBQy9GLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxRQUFRLGNBQWMsT0FBTyxRQUFRLGVBQWUsVUFBVTtBQUNqRSxnQkFBVSxNQUFNLFNBQVMsYUFBYSw2REFBNkQsY0FBYyxDQUFDO0FBQ2xILGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxRQUFRLFlBQVksQ0FBQyx1QkFBdUIsUUFBUSxVQUFVLFdBQVcsVUFBVSxHQUFHO0FBQ3pGLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLFlBQVksUUFBUSxNQUFNLFNBQVMsR0FBRztBQUMxQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBMUJPLEVBQUFBLFFBQVM7QUE0QmhCLFdBQVMsWUFBWSxNQUFxQyxXQUErQztBQUN4RyxRQUFJLE9BQU8sU0FBUyxhQUFhO0FBQ2hDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUM3QixhQUFPO0FBQUEsSUFDUixXQUFXLE9BQU8sS0FBSyxTQUFTLFlBQVksT0FBTyxLQUFLLFVBQVUsVUFBVTtBQUMzRSxhQUFPO0FBQUEsSUFDUjtBQUNBLGNBQVUsTUFBTSxTQUFTLFdBQVcsNkZBQTZGLENBQUM7QUFDbEksV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLHVCQUF1QixXQUFzQyxXQUFzQyxjQUErQjtBQUMxSSxRQUFJLE9BQU8sY0FBYyxhQUFhO0FBQ3JDLGdCQUFVLE1BQU0sU0FBUyx5QkFBeUIsd0VBQXdFLFlBQVksQ0FBQztBQUN2SSxhQUFPO0FBQUEsSUFDUixXQUFXLE9BQU8sY0FBYyxZQUFZLG9CQUFvQixTQUFTLEdBQUc7QUFDM0UsZ0JBQVUsTUFBTSxTQUFTLGlCQUFpQiw0REFBNEQsWUFBWSxDQUFDO0FBQ25ILGFBQU87QUFBQSxJQUNSLFdBQVcsT0FBTyxjQUFjLGFBQWEsb0JBQW9CLFVBQVUsUUFBUSxLQUFLLG9CQUFvQixVQUFVLEtBQUssSUFBSTtBQUM5SCxnQkFBVSxNQUFNLFNBQVMsa0JBQWtCLHlFQUF5RSxHQUFHLFlBQVksVUFBVSxHQUFHLFlBQVksV0FBVyxDQUFDO0FBQ3hLLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLGNBQTJCO0FBQUEsSUFDaEMsTUFBTTtBQUFBLElBQ04sVUFBVSxDQUFDLFdBQVcsT0FBTztBQUFBLElBQzdCLFlBQVk7QUFBQSxNQUNYLFNBQVM7QUFBQSxRQUNSLGFBQWEsU0FBUyxvREFBb0Qsc0NBQXNDO0FBQUEsUUFDaEgsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOLGFBQWEsU0FBUyxrREFBa0QscURBQXFEO0FBQUEsUUFDN0gsTUFBTTtBQUFBLE1BQ1A7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNYLHFCQUFxQixTQUFTLHVEQUF1RCx1S0FBdUs7QUFBQSxRQUM1UCxNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsYUFBYSxTQUFTLHFEQUFxRCxzRUFBc0U7QUFBQSxRQUNqSixNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1gsYUFBYSxTQUFTLHlEQUF5RCx1TEFBdUw7QUFBQSxRQUN0USxNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EsTUFBTTtBQUFBLFFBQ0wsYUFBYSxTQUFTLEVBQUUsS0FBSyxpREFBaUQsU0FBUyxDQUFDLHVFQUF1RSxFQUFFLEdBQUcsd0xBQXdMO0FBQUEsUUFDNVYsT0FBTztBQUFBLFVBQUM7QUFBQSxZQUNQLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQTtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sWUFBWTtBQUFBLGNBQ1gsT0FBTztBQUFBLGdCQUNOLGFBQWEsU0FBUyx1REFBdUQsc0NBQXNDO0FBQUEsZ0JBQ25ILE1BQU07QUFBQSxjQUNQO0FBQUEsY0FDQSxNQUFNO0FBQUEsZ0JBQ0wsYUFBYSxTQUFTLHNEQUFzRCxxQ0FBcUM7QUFBQSxnQkFDakgsTUFBTTtBQUFBLGNBQ1A7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFTyxFQUFNQSxRQUFBLHVCQUFvQztBQUFBLElBQ2hELGFBQWEsU0FBUyx5Q0FBeUMsOENBQThDO0FBQUEsSUFDN0csT0FBTztBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsR0FyVVM7QUF3VVYsTUFBTSx3QkFBd0IsSUFBSSxnQkFBZ0I7QUFFM0MsTUFBTSx5QkFBeUIsbUJBQW1CLHVCQUFvRjtBQUFBLEVBQzVJLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVksT0FBTztBQUFBLEVBQ25CLDJCQUEyQixXQUFXLFVBQWtEO0FBQ3ZGLGVBQVcsV0FBVyxVQUFVO0FBQy9CLFVBQUksUUFBUSxTQUFTO0FBQ3BCLGNBQU0sYUFBYSxRQUFRLE9BQU87QUFBQSxNQUNuQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELHVCQUF1QixXQUFXLGdCQUFjO0FBRS9DLFdBQVMsY0FBYyxxQkFBa0QsV0FBeUM7QUFFakgsUUFBSSxDQUFDLE9BQU8sZUFBZSxxQkFBcUIsVUFBVSxTQUFTLEdBQUc7QUFDckU7QUFBQSxJQUNEO0FBRUEsVUFBTSxFQUFFLE1BQU0sWUFBWSxVQUFVLE9BQU8sWUFBWSxRQUFRLElBQUk7QUFFbkUsUUFBSTtBQUNKLFFBQUksTUFBTTtBQUNULFVBQUksT0FBTyxTQUFTLFVBQVU7QUFDN0IsdUJBQWUsVUFBVSxXQUFXLElBQUksS0FBSyxFQUFFLE1BQU0sVUFBVSxTQUFTLFVBQVUsWUFBWSxtQkFBbUIsSUFBSSxHQUFHLE9BQU8sVUFBVSxTQUFTLFVBQVUsWUFBWSxtQkFBbUIsSUFBSSxFQUFFO0FBQUEsTUFFbE0sT0FBTztBQUNOLHVCQUFlO0FBQUEsVUFDZCxNQUFNLFVBQVUsU0FBUyxVQUFVLFlBQVksbUJBQW1CLEtBQUssSUFBSTtBQUFBLFVBQzNFLE9BQU8sVUFBVSxTQUFTLFVBQVUsWUFBWSxtQkFBbUIsS0FBSyxLQUFLO0FBQUEsUUFDOUU7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sY0FBYyxhQUFhLFdBQVcsT0FBTztBQUNuRCxRQUFJLGFBQWE7QUFDaEIsVUFBSSxZQUFZLFFBQVE7QUFDdkIsa0JBQVUsVUFBVSxLQUFLLFNBQVMsUUFBUSxpREFBaUQsb0JBQW9CLFNBQVMsWUFBWSxPQUFPLE9BQU8sWUFBWSxPQUFPLEVBQUUsQ0FBQztBQUFBLE1BQ3pLLE9BQU87QUFDTixrQkFBVSxVQUFVLEtBQUssU0FBUyxRQUFRLG9DQUFvQyxvQkFBb0IsT0FBTyxDQUFDO0FBQUEsTUFDM0c7QUFBQSxJQUNEO0FBQ0EsMEJBQXNCLElBQUksYUFBYSxXQUFXO0FBQUEsTUFDakQsSUFBSTtBQUFBLE1BQ0o7QUFBQSxNQUNBLFFBQVEsRUFBRSxJQUFJLFVBQVUsWUFBWSxXQUFXLE9BQU8sT0FBTyxVQUFVLFlBQVksZUFBZSxVQUFVLFlBQVksS0FBSztBQUFBLE1BQzdIO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0EsY0FBYyxlQUFlLFlBQVksVUFBVTtBQUFBLE1BQ25ELE1BQU07QUFBQSxJQUNQLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFHQSx3QkFBc0IsTUFBTTtBQUU1QixhQUFXLGFBQWEsWUFBWTtBQUNuQyxVQUFNLEVBQUUsTUFBTSxJQUFJO0FBQ2xCLFFBQUksTUFBTSxRQUFRLEtBQUssR0FBRztBQUN6QixpQkFBVyxXQUFXLE9BQU87QUFDNUIsc0JBQWMsU0FBUyxTQUFTO0FBQUEsTUFDakM7QUFBQSxJQUNELE9BQU87QUFDTixvQkFBYyxPQUFPLFNBQVM7QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBUUQsTUFBTSxZQUFZLG9CQUFJLElBQWdDO0FBRXRELE1BQU0seUJBQXlCLG1CQUFtQix1QkFBc0Q7QUFBQSxFQUN2RyxnQkFBZ0I7QUFBQSxFQUNoQixZQUFZLE9BQU87QUFDcEIsQ0FBQztBQUVELHVCQUF1QixXQUFXLGdCQUFjO0FBRS9DLFlBQVUsTUFBTTtBQUVoQixhQUFXLGFBQWEsWUFBWTtBQUNuQyxVQUFNLEVBQUUsT0FBTyxVQUFVLElBQUk7QUFFN0IsZUFBVyxDQUFDLEVBQUUsV0FBVyxLQUFLLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFFcEQsVUFBSSxDQUFDLE9BQU8sZUFBZSxhQUFhLFNBQVMsR0FBRztBQUNuRDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLENBQUMsWUFBWSxJQUFJO0FBQ3BCLGtCQUFVLEtBQUssU0FBUyx3QkFBd0IsMkNBQTJDLFlBQVksRUFBRSxDQUFDO0FBQzFHO0FBQUEsTUFDRDtBQUNBLFVBQUksVUFBVSxJQUFJLFlBQVksRUFBRSxHQUFHO0FBQ2xDLGtCQUFVLEtBQUssU0FBUywwQkFBMEIsd0RBQXdELFlBQVksRUFBRSxDQUFDO0FBQ3pIO0FBQUEsTUFDRDtBQUNBLFVBQUksQ0FBQyxZQUFZLE9BQU87QUFDdkIsa0JBQVUsS0FBSyxTQUFTLDJCQUEyQixzQ0FBc0MsWUFBWSxLQUFLLENBQUM7QUFDM0c7QUFBQSxNQUNEO0FBRUEsVUFBSTtBQUNKLFVBQUksWUFBWSxNQUFNO0FBQ3JCLFlBQUksT0FBTyxZQUFZLFNBQVMsVUFBVTtBQUN6Qyx5QkFBZSxVQUFVLFdBQVcsWUFBWSxJQUFJLEtBQUssRUFBRSxNQUFNLFVBQVUsU0FBUyxVQUFVLFlBQVksbUJBQW1CLFlBQVksSUFBSSxFQUFFO0FBQUEsUUFDaEosT0FBTztBQUNOLHlCQUFlO0FBQUEsWUFDZCxNQUFNLFVBQVUsU0FBUyxVQUFVLFlBQVksbUJBQW1CLFlBQVksS0FBSyxJQUFJO0FBQUEsWUFDdkYsT0FBTyxVQUFVLFNBQVMsVUFBVSxZQUFZLG1CQUFtQixZQUFZLEtBQUssS0FBSztBQUFBLFVBQzFGO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLE9BQTJCO0FBQUEsUUFDaEMsSUFBSSxPQUFPLElBQUksT0FBTyxZQUFZLEVBQUUsRUFBRTtBQUFBLFFBQ3RDLE9BQU8sWUFBWTtBQUFBLFFBQ25CLE1BQU07QUFBQSxNQUNQO0FBRUEsZ0JBQVUsSUFBSSxZQUFZLElBQUksSUFBSTtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxNQUFNLGlCQUFpQixJQUFJLElBQUksU0FBUyxJQUFJLFVBQVMsQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFFLENBQUM7QUFDdkUsTUFBTSxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDL0MsTUFBTSxvQkFBb0Isb0JBQUksSUFBd0Q7QUFFdEYsTUFBTSxzQkFBc0IsbUJBQW1CLHVCQUE4RztBQUFBLEVBQzVKLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVksT0FBTztBQUFBLEVBQ25CLE1BQU0sQ0FBQyxzQkFBc0I7QUFDOUIsQ0FBQztBQUVELG9CQUFvQixXQUFXLGdCQUFjO0FBRzVDLHFCQUFtQixNQUFNO0FBQ3pCLG9CQUFrQixNQUFNO0FBRXhCLGFBQVcsYUFBYSxZQUFZO0FBQ25DLFVBQU0sRUFBRSxPQUFPLFVBQVUsSUFBSTtBQUU3QixlQUFXLFNBQVMsT0FBTyxRQUFRLEtBQUssR0FBRztBQUMxQyxVQUFJLENBQUMsT0FBTyxhQUFhLE1BQU0sQ0FBQyxHQUFHLFNBQVMsR0FBRztBQUM5QztBQUFBLE1BQ0Q7QUFFQSxVQUFJLE9BQU8sZUFBZSxJQUFJLE1BQU0sQ0FBQyxDQUFDO0FBRXRDLFVBQUksQ0FBQyxNQUFNO0FBQ1YsY0FBTSxVQUFVLFVBQVUsSUFBSSxNQUFNLENBQUMsQ0FBQztBQUV0QyxZQUFJLFNBQVM7QUFDWixpQkFBTztBQUFBLFlBQ04sS0FBSyxNQUFNLENBQUM7QUFBQSxZQUNaLElBQUksUUFBUTtBQUFBLFlBQ1osYUFBYTtBQUFBLFVBQ2Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxNQUFNO0FBQ1Y7QUFBQSxNQUNEO0FBRUEsVUFBSSxLQUFLLFlBQVksQ0FBQyxxQkFBcUIsVUFBVSxhQUFhLEtBQUssUUFBUSxHQUFHO0FBQ2pGLGtCQUFVLE1BQU0sU0FBUyx1QkFBdUIsaU5BQW1OLE1BQU0sQ0FBQyxHQUFHLEtBQUssVUFBVSxVQUFVLFlBQVksV0FBVyxLQUFLLENBQUM7QUFDblU7QUFBQSxNQUNEO0FBRUEsaUJBQVcsWUFBWSxNQUFNLENBQUMsR0FBRztBQUNoQyxZQUFJO0FBRUosWUFBSSxPQUFPLFdBQVcsUUFBUSxHQUFHO0FBQ2hDLGdCQUFNLFVBQVUsYUFBYSxXQUFXLFNBQVMsT0FBTztBQUN4RCxnQkFBTSxNQUFNLFNBQVMsT0FBTyxhQUFhLFdBQVcsU0FBUyxHQUFHLEtBQUs7QUFFckUsY0FBSSxDQUFDLFNBQVM7QUFDYixzQkFBVSxNQUFNLFNBQVMsbUJBQW1CLHdGQUF3RixTQUFTLE9BQU8sQ0FBQztBQUNySjtBQUFBLFVBQ0Q7QUFDQSxjQUFJLFNBQVMsT0FBTyxDQUFDLEtBQUs7QUFDekIsc0JBQVUsS0FBSyxTQUFTLHNCQUFzQiw2RkFBNkYsU0FBUyxHQUFHLENBQUM7QUFBQSxVQUN6SjtBQUNBLGNBQUksU0FBUyxZQUFZLFNBQVMsS0FBSztBQUN0QyxzQkFBVSxLQUFLLFNBQVMsZ0JBQWdCLGtFQUFrRSxDQUFDO0FBQUEsVUFDNUc7QUFFQSxpQkFBTyxFQUFFLFNBQVMsS0FBSyxPQUFPLFFBQVcsT0FBTyxRQUFXLE1BQU0sT0FBVTtBQUFBLFFBQzVFLE9BQU87QUFDTixjQUFJLEtBQUsscUJBQXFCLE9BQU87QUFDcEMsc0JBQVUsTUFBTSxTQUFTLGdDQUFnQywrRUFBK0UsQ0FBQztBQUN6STtBQUFBLFVBQ0Q7QUFFQSxnQkFBTSxVQUFVLFVBQVUsSUFBSSxTQUFTLE9BQU87QUFFOUMsY0FBSSxDQUFDLFNBQVM7QUFDYixzQkFBVSxNQUFNLFNBQVMsbUJBQW1CLHdGQUF3RixTQUFTLE9BQU8sQ0FBQztBQUNySjtBQUFBLFVBQ0Q7QUFFQSxjQUFJLHVCQUF1QixrQkFBa0IsSUFBSSxLQUFLLEdBQUcsRUFBRTtBQUUzRCxjQUFJLENBQUMsc0JBQXNCO0FBQzFCLG1DQUF1QixvQkFBSSxJQUFJO0FBQy9CLDhCQUFrQixJQUFJLEtBQUssR0FBRyxJQUFJLG9CQUFvQjtBQUFBLFVBQ3ZEO0FBRUEsY0FBSSxxQkFBcUIsSUFBSSxRQUFRLEdBQUcsRUFBRSxHQUFHO0FBQzVDLHNCQUFVLEtBQUssU0FBUyx5QkFBeUIsZ0VBQWdFLFNBQVMsU0FBUyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQzVJO0FBQUEsVUFDRDtBQUVBLCtCQUFxQixJQUFJLFFBQVEsR0FBRyxFQUFFO0FBRXRDLGlCQUFPLEVBQUUsU0FBUyxRQUFRLElBQUksTUFBTSxRQUFRLE1BQU0sT0FBTyxRQUFRLE9BQU8sT0FBTyxRQUFXLE9BQU8sUUFBVyxNQUFNLE9BQVU7QUFBQSxRQUM3SDtBQUVBLFlBQUksU0FBUyxPQUFPO0FBQ25CLGdCQUFNLE1BQU0sU0FBUyxNQUFNLFlBQVksR0FBRztBQUMxQyxjQUFJLE1BQU0sR0FBRztBQUNaLGlCQUFLLFFBQVEsU0FBUyxNQUFNLE9BQU8sR0FBRyxHQUFHO0FBQ3pDLGlCQUFLLFFBQVEsT0FBTyxTQUFTLE1BQU0sT0FBTyxNQUFNLENBQUMsQ0FBQyxLQUFLO0FBQUEsVUFDeEQsT0FBTztBQUNOLGlCQUFLLFFBQVEsU0FBUztBQUFBLFVBQ3ZCO0FBQUEsUUFDRDtBQUVBLFlBQUksS0FBSyxPQUFPLE9BQU8sc0JBQXNCLENBQUMsU0FBUyxNQUFNLFNBQVMsdUNBQXVDLEdBQUc7QUFFL0csb0JBQVUsTUFBTSxTQUFTLDJCQUEyQiwrREFBK0QseUJBQXlCLDJDQUEyQyxRQUFRLENBQUM7QUFDaE07QUFBQSxRQUNEO0FBRUEsYUFBSyxPQUFPLGVBQWUsWUFBWSxTQUFTLElBQUk7QUFDcEQsMkJBQW1CLElBQUksYUFBYSxlQUFlLEtBQUssSUFBSSxJQUFJLENBQUM7QUFBQSxNQUNsRTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELElBQU0sd0JBQU4sY0FBb0MsV0FBcUQ7QUFBQSxFQUl4RixZQUNzQyxvQkFDcEM7QUFBRSxVQUFNO0FBRDRCO0FBSHRDLFNBQVMsT0FBTztBQUFBLEVBSUg7QUFBQSxFQUViLGFBQWEsVUFBdUM7QUFDbkQsV0FBTyxDQUFDLENBQUMsU0FBUyxhQUFhO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE9BQU8sVUFBeUQ7QUFDL0QsVUFBTSxjQUFjLFNBQVMsYUFBYSxZQUFZLENBQUM7QUFDdkQsVUFBTSxXQUFXLFlBQVksSUFBSSxRQUFNO0FBQUEsTUFDdEMsSUFBSSxFQUFFO0FBQUEsTUFDTixPQUFPLEVBQUU7QUFBQSxNQUNULGFBQWEsQ0FBQztBQUFBLE1BQ2QsT0FBTyxDQUFDO0FBQUEsSUFDVCxFQUFFO0FBRUYsVUFBTSxPQUFPLE1BQU0sVUFBVSxPQUFLLEVBQUUsRUFBRTtBQUV0QyxVQUFNLFFBQVEsU0FBUyxhQUFhLFNBQVMsQ0FBQztBQUc5QyxVQUFNLDZCQUE2QixNQUFNLFVBQVUsT0FBSyxFQUFFLEVBQUU7QUFDNUQsUUFBSSxNQUFNLGdCQUFnQixHQUFHO0FBQzVCLGlCQUFXLFdBQVcsTUFBTSxnQkFBZ0IsR0FBRztBQUM5QyxlQUFPLDJCQUEyQixRQUFRLE9BQU87QUFBQSxNQUNsRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLE9BQU8sS0FBSywwQkFBMEIsRUFBRSxRQUFRO0FBQ25ELFVBQUksQ0FBQyxNQUFNLGdCQUFnQixHQUFHO0FBQzdCLGNBQU0sZ0JBQWdCLElBQUksQ0FBQztBQUFBLE1BQzVCO0FBQ0EsaUJBQVcsV0FBVyw0QkFBNEI7QUFDakQsY0FBTSxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBRUEsZUFBVyxXQUFXLE9BQU87QUFDNUIsaUJBQVcsUUFBUSxNQUFNLE9BQU8sR0FBRztBQUdsQyxZQUFJLEtBQUssU0FBUyxTQUFTO0FBQzFCO0FBQUEsUUFDRDtBQUNBLFlBQUksS0FBSyxTQUFTO0FBQ2pCLGNBQUksVUFBVSxLQUFLLEtBQUssT0FBTztBQUMvQixjQUFJLFNBQVM7QUFDWixnQkFBSSxDQUFDLFFBQVEsTUFBTSxTQUFTLE9BQU8sR0FBRztBQUNyQyxzQkFBUSxNQUFNLEtBQUssT0FBTztBQUFBLFlBQzNCO0FBQUEsVUFDRCxPQUFPO0FBQ04sc0JBQVUsRUFBRSxJQUFJLEtBQUssU0FBUyxPQUFPLElBQUksYUFBYSxDQUFDLEdBQUcsT0FBTyxDQUFDLE9BQU8sRUFBRTtBQUMzRSxpQkFBSyxRQUFRLEVBQUUsSUFBSTtBQUNuQixxQkFBUyxLQUFLLE9BQU87QUFBQSxVQUN0QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0saUJBQWlCLFNBQVMsYUFBYSxjQUFlLE1BQU0sUUFBUSxTQUFTLFlBQVksV0FBVyxJQUFJLFNBQVMsWUFBWSxjQUFjLENBQUMsU0FBUyxZQUFZLFdBQVcsSUFBSyxDQUFDO0FBRXhMLG1CQUFlLFFBQVEsbUJBQWlCO0FBQ3ZDLFlBQU0sYUFBYSxLQUFLLGtCQUFrQixhQUFhO0FBRXZELFVBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsTUFDRDtBQUVBLFVBQUksVUFBVSxLQUFLLGNBQWMsT0FBTztBQUV4QyxVQUFJLFNBQVM7QUFDWixnQkFBUSxZQUFZLEtBQUssVUFBVTtBQUFBLE1BQ3BDLE9BQU87QUFDTixrQkFBVSxFQUFFLElBQUksY0FBYyxTQUFTLE9BQU8sSUFBSSxhQUFhLENBQUMsVUFBVSxHQUFHLE9BQU8sQ0FBQyxFQUFFO0FBQ3ZGLGFBQUssUUFBUSxFQUFFLElBQUk7QUFDbkIsaUJBQVMsS0FBSyxPQUFPO0FBQUEsTUFDdEI7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLENBQUMsU0FBUyxRQUFRO0FBQ3JCLGFBQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxJQUM5RDtBQUVBLFVBQU0sVUFBVTtBQUFBLE1BQ2YsU0FBUyxnQkFBZ0IsSUFBSTtBQUFBLE1BQzdCLFNBQVMsaUJBQWlCLE9BQU87QUFBQSxNQUNqQyxTQUFTLHNCQUFzQixvQkFBb0I7QUFBQSxNQUNuRCxTQUFTLGdCQUFnQixlQUFlO0FBQUEsSUFDekM7QUFFQSxVQUFNLE9BQXFCLFNBQVMsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLEdBQUcsY0FBYyxFQUFFLEVBQUUsQ0FBQyxFQUN6RSxJQUFJLGFBQVc7QUFDZixhQUFPO0FBQUEsUUFDTixJQUFJLGVBQWUsRUFBRSxlQUFlLEtBQUssUUFBUSxFQUFFLElBQUk7QUFBQSxRQUN2RCxPQUFPLFFBQVEsVUFBVSxXQUFXLFFBQVEsUUFBUSxRQUFRLE1BQU07QUFBQSxRQUNsRSxRQUFRO0FBQUEsUUFDUixJQUFJLGVBQWUsRUFBRSxlQUFlLEdBQUcsUUFBUSxNQUFNLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQyxFQUFFLElBQUksVUFBUSxLQUFLLElBQUksSUFBSSxFQUFFLEtBQUssUUFBUSxDQUFDLEVBQUU7QUFBQSxNQUNwSTtBQUFBLElBQ0QsQ0FBQztBQUVGLFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFrQixlQUE0RDtBQUNyRixRQUFJO0FBRUosWUFBUSxVQUFVO0FBQUEsTUFDakIsS0FBSztBQUFTLGNBQU0sY0FBYztBQUFLO0FBQUEsTUFDdkMsS0FBSztBQUFTLGNBQU0sY0FBYztBQUFPO0FBQUEsTUFDekMsS0FBSztBQUFVLGNBQU0sY0FBYztBQUFLO0FBQUEsSUFDekM7QUFFQSxXQUFPLEtBQUssbUJBQW1CLG1CQUFtQixPQUFPLGNBQWMsR0FBRyxFQUFFLENBQUM7QUFBQSxFQUM5RTtBQUVEO0FBOUhNLHdCQUFOO0FBQUEsRUFLRztBQUFBLEdBTEc7QUFnSU4sU0FBUyxHQUErQiw0QkFBNEIseUJBQXlCLEVBQUUseUJBQXlCO0FBQUEsRUFDdkgsSUFBSTtBQUFBLEVBQ0osT0FBTyxTQUFTLFlBQVksVUFBVTtBQUFBLEVBQ3RDLFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxFQUNaO0FBQUEsRUFDQSxVQUFVLElBQUksZUFBZSxxQkFBcUI7QUFDbkQsQ0FBQzsiLAogICJuYW1lcyI6IFsic2NoZW1hIiwgInN1Ym1lbnUiXQp9Cg==
