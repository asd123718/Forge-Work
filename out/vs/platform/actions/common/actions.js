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
import { SubmenuAction } from "../../../base/common/actions.js";
import { MicrotaskEmitter } from "../../../base/common/event.js";
import { DisposableStore, dispose, markAsSingleton, toDisposable } from "../../../base/common/lifecycle.js";
import { LinkedList } from "../../../base/common/linkedList.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { CommandsRegistry, ICommandService } from "../../commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../contextkey/common/contextkey.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { KeybindingsRegistry } from "../../keybinding/common/keybindingsRegistry.js";
function isIMenuItem(item) {
  return item.command !== void 0;
}
function isISubmenuItem(item) {
  return item.submenu !== void 0;
}
const _MenuId = class _MenuId {
  /**
   * Create or reuse a `MenuId` with the given identifier
   */
  static for(identifier) {
    return _MenuId._instances.get(identifier) ?? new _MenuId(identifier);
  }
  /**
   * Create a new `MenuId` with the unique identifier. Will throw if a menu
   * with the identifier already exists, use `MenuId.for(ident)` or a unique
   * identifier
   */
  constructor(identifier) {
    if (_MenuId._instances.has(identifier)) {
      throw new TypeError(`MenuId with identifier '${identifier}' already exists. Use MenuId.for(ident) or a unique identifier`);
    }
    _MenuId._instances.set(identifier, this);
    this.id = identifier;
  }
};
_MenuId._instances = /* @__PURE__ */ new Map();
_MenuId.CommandPalette = new _MenuId("CommandPalette");
_MenuId.DebugBreakpointsContext = new _MenuId("DebugBreakpointsContext");
_MenuId.DebugCallStackContext = new _MenuId("DebugCallStackContext");
_MenuId.DebugConsoleContext = new _MenuId("DebugConsoleContext");
_MenuId.DebugVariablesContext = new _MenuId("DebugVariablesContext");
_MenuId.NotebookVariablesContext = new _MenuId("NotebookVariablesContext");
_MenuId.DebugHoverContext = new _MenuId("DebugHoverContext");
_MenuId.DebugWatchContext = new _MenuId("DebugWatchContext");
_MenuId.DebugToolBar = new _MenuId("DebugToolBar");
_MenuId.DebugToolBarStop = new _MenuId("DebugToolBarStop");
_MenuId.DebugDisassemblyContext = new _MenuId("DebugDisassemblyContext");
_MenuId.DebugCallStackToolbar = new _MenuId("DebugCallStackToolbar");
_MenuId.DebugCreateConfiguration = new _MenuId("DebugCreateConfiguration");
_MenuId.DebugScopesContext = new _MenuId("DebugScopesContext");
_MenuId.EditorContext = new _MenuId("EditorContext");
_MenuId.SimpleEditorContext = new _MenuId("SimpleEditorContext");
_MenuId.EditorContent = new _MenuId("EditorContent");
_MenuId.EditorLineNumberContext = new _MenuId("EditorLineNumberContext");
_MenuId.EditorContextCopy = new _MenuId("EditorContextCopy");
_MenuId.EditorContextPeek = new _MenuId("EditorContextPeek");
_MenuId.EditorContextShare = new _MenuId("EditorContextShare");
_MenuId.EditorTitle = new _MenuId("EditorTitle");
_MenuId.EditorTitleLayout = new _MenuId("EditorTitleLayout");
_MenuId.ModalEditorTitle = new _MenuId("ModalEditorTitle");
_MenuId.ModalEditorTitleContext = new _MenuId("ModalEditorTitleContext");
_MenuId.ModalEditorEditorTitle = new _MenuId("ModalEditorEditorTitle");
_MenuId.CompactWindowEditorTitle = new _MenuId("CompactWindowEditorTitle");
_MenuId.EditorTitleRun = new _MenuId("EditorTitleRun");
_MenuId.EditorTitleContext = new _MenuId("EditorTitleContext");
_MenuId.EditorTitleContextShare = new _MenuId("EditorTitleContextShare");
_MenuId.EmptyEditorGroup = new _MenuId("EmptyEditorGroup");
_MenuId.EmptyEditorGroupContext = new _MenuId("EmptyEditorGroupContext");
_MenuId.EditorGroupWatermarkToolbar = new _MenuId("EditorGroupWatermarkToolbar");
_MenuId.EditorTabsBarContext = new _MenuId("EditorTabsBarContext");
_MenuId.EditorTabsBarShowTabsSubmenu = new _MenuId("EditorTabsBarShowTabsSubmenu");
_MenuId.EditorTabsBarShowTabsZenModeSubmenu = new _MenuId("EditorTabsBarShowTabsZenModeSubmenu");
_MenuId.EditorActionsPositionSubmenu = new _MenuId("EditorActionsPositionSubmenu");
_MenuId.EditorRenderWhitespaceSubmenu = new _MenuId("EditorRenderWhitespaceSubmenu");
_MenuId.EditorSplitMoveSubmenu = new _MenuId("EditorSplitMoveSubmenu");
_MenuId.ExplorerContext = new _MenuId("ExplorerContext");
_MenuId.ExplorerContextShare = new _MenuId("ExplorerContextShare");
_MenuId.ExtensionContext = new _MenuId("ExtensionContext");
_MenuId.ExtensionEditorContextMenu = new _MenuId("ExtensionEditorContextMenu");
_MenuId.GlobalActivity = new _MenuId("GlobalActivity");
_MenuId.CommandCenter = new _MenuId("CommandCenter");
_MenuId.CommandCenterCenter = new _MenuId("CommandCenterCenter");
_MenuId.LayoutControlMenuSubmenu = new _MenuId("LayoutControlMenuSubmenu");
_MenuId.LayoutControlMenu = new _MenuId("LayoutControlMenu");
_MenuId.MenubarMainMenu = new _MenuId("MenubarMainMenu");
_MenuId.MenubarAppearanceMenu = new _MenuId("MenubarAppearanceMenu");
_MenuId.MenubarDebugMenu = new _MenuId("MenubarDebugMenu");
_MenuId.MenubarEditMenu = new _MenuId("MenubarEditMenu");
_MenuId.MenubarCopy = new _MenuId("MenubarCopy");
_MenuId.MenubarFileMenu = new _MenuId("MenubarFileMenu");
_MenuId.MenubarGoMenu = new _MenuId("MenubarGoMenu");
_MenuId.MenubarHelpMenu = new _MenuId("MenubarHelpMenu");
_MenuId.MenubarLayoutMenu = new _MenuId("MenubarLayoutMenu");
_MenuId.MenubarNewBreakpointMenu = new _MenuId("MenubarNewBreakpointMenu");
_MenuId.PanelAlignmentMenu = new _MenuId("PanelAlignmentMenu");
_MenuId.PanelPositionMenu = new _MenuId("PanelPositionMenu");
_MenuId.ActivityBarPositionMenu = new _MenuId("ActivityBarPositionMenu");
_MenuId.NotificationsCenterPositionMenu = new _MenuId("NotificationsCenterPositionMenu");
_MenuId.MenubarPreferencesMenu = new _MenuId("MenubarPreferencesMenu");
_MenuId.MenubarRecentMenu = new _MenuId("MenubarRecentMenu");
_MenuId.MenubarSelectionMenu = new _MenuId("MenubarSelectionMenu");
_MenuId.MenubarShare = new _MenuId("MenubarShare");
_MenuId.MenubarSwitchEditorMenu = new _MenuId("MenubarSwitchEditorMenu");
_MenuId.MenubarSwitchGroupMenu = new _MenuId("MenubarSwitchGroupMenu");
_MenuId.MenubarTerminalMenu = new _MenuId("MenubarTerminalMenu");
_MenuId.MenubarTerminalSuggestStatusMenu = new _MenuId("MenubarTerminalSuggestStatusMenu");
_MenuId.MenubarViewMenu = new _MenuId("MenubarViewMenu");
_MenuId.MenubarHomeMenu = new _MenuId("MenubarHomeMenu");
_MenuId.OpenEditorsContext = new _MenuId("OpenEditorsContext");
_MenuId.OpenEditorsContextShare = new _MenuId("OpenEditorsContextShare");
_MenuId.ProblemsPanelContext = new _MenuId("ProblemsPanelContext");
_MenuId.SCMInputBox = new _MenuId("SCMInputBox");
_MenuId.SCMChangeContext = new _MenuId("SCMChangeContext");
_MenuId.SCMResourceContext = new _MenuId("SCMResourceContext");
_MenuId.SCMResourceContextShare = new _MenuId("SCMResourceContextShare");
_MenuId.SCMResourceFolderContext = new _MenuId("SCMResourceFolderContext");
_MenuId.SCMResourceGroupContext = new _MenuId("SCMResourceGroupContext");
_MenuId.SCMSourceControl = new _MenuId("SCMSourceControl");
_MenuId.SCMSourceControlInline = new _MenuId("SCMSourceControlInline");
_MenuId.SCMSourceControlTitle = new _MenuId("SCMSourceControlTitle");
_MenuId.SCMHistoryTitle = new _MenuId("SCMHistoryTitle");
_MenuId.SCMHistoryItemContext = new _MenuId("SCMHistoryItemContext");
_MenuId.SCMHistoryItemChangeContext = new _MenuId("SCMHistoryItemChangeContext");
_MenuId.SCMHistoryItemRefContext = new _MenuId("SCMHistoryItemRefContext");
_MenuId.SCMArtifactGroupContext = new _MenuId("SCMArtifactGroupContext");
_MenuId.SCMArtifactContext = new _MenuId("SCMArtifactContext");
_MenuId.SCMQuickDiffDecorations = new _MenuId("SCMQuickDiffDecorations");
_MenuId.SCMTitle = new _MenuId("SCMTitle");
_MenuId.SearchContext = new _MenuId("SearchContext");
_MenuId.SearchActionMenu = new _MenuId("SearchActionContext");
_MenuId.StatusBarWindowIndicatorMenu = new _MenuId("StatusBarWindowIndicatorMenu");
_MenuId.StatusBarRemoteIndicatorMenu = new _MenuId("StatusBarRemoteIndicatorMenu");
_MenuId.StickyScrollContext = new _MenuId("StickyScrollContext");
_MenuId.TestItem = new _MenuId("TestItem");
_MenuId.TestItemGutter = new _MenuId("TestItemGutter");
_MenuId.TestProfilesContext = new _MenuId("TestProfilesContext");
_MenuId.TestMessageContext = new _MenuId("TestMessageContext");
_MenuId.TestMessageContent = new _MenuId("TestMessageContent");
_MenuId.TestPeekElement = new _MenuId("TestPeekElement");
_MenuId.TestPeekTitle = new _MenuId("TestPeekTitle");
_MenuId.TestCallStack = new _MenuId("TestCallStack");
_MenuId.TestCoverageFilterItem = new _MenuId("TestCoverageFilterItem");
_MenuId.TouchBarContext = new _MenuId("TouchBarContext");
_MenuId.TitleBar = new _MenuId("TitleBar");
_MenuId.TitleBarAdjacentCenter = new _MenuId("TitleBarAdjacentCenter");
_MenuId.TitleBarUpdate = new _MenuId("TitleBarUpdate");
_MenuId.TitleBarContext = new _MenuId("TitleBarContext");
_MenuId.TitleBarTitleContext = new _MenuId("TitleBarTitleContext");
_MenuId.TunnelContext = new _MenuId("TunnelContext");
_MenuId.TunnelPrivacy = new _MenuId("TunnelPrivacy");
_MenuId.TunnelProtocol = new _MenuId("TunnelProtocol");
_MenuId.TunnelPortInline = new _MenuId("TunnelInline");
_MenuId.TunnelTitle = new _MenuId("TunnelTitle");
_MenuId.TunnelLocalAddressInline = new _MenuId("TunnelLocalAddressInline");
_MenuId.TunnelOriginInline = new _MenuId("TunnelOriginInline");
_MenuId.ViewItemContext = new _MenuId("ViewItemContext");
_MenuId.ViewContainerTitle = new _MenuId("ViewContainerTitle");
_MenuId.ViewContainerTitleContext = new _MenuId("ViewContainerTitleContext");
_MenuId.ViewTitle = new _MenuId("ViewTitle");
_MenuId.ViewTitleContext = new _MenuId("ViewTitleContext");
_MenuId.CommentEditorActions = new _MenuId("CommentEditorActions");
_MenuId.CommentThreadTitle = new _MenuId("CommentThreadTitle");
_MenuId.CommentThreadActions = new _MenuId("CommentThreadActions");
_MenuId.CommentThreadAdditionalActions = new _MenuId("CommentThreadAdditionalActions");
_MenuId.CommentThreadTitleContext = new _MenuId("CommentThreadTitleContext");
_MenuId.CommentThreadCommentContext = new _MenuId("CommentThreadCommentContext");
_MenuId.CommentTitle = new _MenuId("CommentTitle");
_MenuId.CommentActions = new _MenuId("CommentActions");
_MenuId.CommentsViewThreadActions = new _MenuId("CommentsViewThreadActions");
_MenuId.InteractiveToolbar = new _MenuId("InteractiveToolbar");
_MenuId.InteractiveCellTitle = new _MenuId("InteractiveCellTitle");
_MenuId.InteractiveCellDelete = new _MenuId("InteractiveCellDelete");
_MenuId.InteractiveCellExecute = new _MenuId("InteractiveCellExecute");
_MenuId.InteractiveInputExecute = new _MenuId("InteractiveInputExecute");
_MenuId.InteractiveInputConfig = new _MenuId("InteractiveInputConfig");
_MenuId.ReplInputExecute = new _MenuId("ReplInputExecute");
_MenuId.IssueReporter = new _MenuId("IssueReporter");
_MenuId.NotebookToolbar = new _MenuId("NotebookToolbar");
_MenuId.NotebookToolbarContext = new _MenuId("NotebookToolbarContext");
_MenuId.NotebookStickyScrollContext = new _MenuId("NotebookStickyScrollContext");
_MenuId.NotebookCellTitle = new _MenuId("NotebookCellTitle");
_MenuId.NotebookCellDelete = new _MenuId("NotebookCellDelete");
_MenuId.NotebookCellInsert = new _MenuId("NotebookCellInsert");
_MenuId.NotebookCellBetween = new _MenuId("NotebookCellBetween");
_MenuId.NotebookCellListTop = new _MenuId("NotebookCellTop");
_MenuId.NotebookCellExecute = new _MenuId("NotebookCellExecute");
_MenuId.NotebookCellExecuteGoTo = new _MenuId("NotebookCellExecuteGoTo");
_MenuId.NotebookCellExecutePrimary = new _MenuId("NotebookCellExecutePrimary");
_MenuId.NotebookDiffCellInputTitle = new _MenuId("NotebookDiffCellInputTitle");
_MenuId.NotebookDiffDocumentMetadata = new _MenuId("NotebookDiffDocumentMetadata");
_MenuId.NotebookDiffCellMetadataTitle = new _MenuId("NotebookDiffCellMetadataTitle");
_MenuId.NotebookDiffCellOutputsTitle = new _MenuId("NotebookDiffCellOutputsTitle");
_MenuId.NotebookOutputToolbar = new _MenuId("NotebookOutputToolbar");
_MenuId.NotebookOutlineFilter = new _MenuId("NotebookOutlineFilter");
_MenuId.NotebookOutlineActionMenu = new _MenuId("NotebookOutlineActionMenu");
_MenuId.NotebookEditorLayoutConfigure = new _MenuId("NotebookEditorLayoutConfigure");
_MenuId.NotebookKernelSource = new _MenuId("NotebookKernelSource");
_MenuId.BulkEditTitle = new _MenuId("BulkEditTitle");
_MenuId.BulkEditContext = new _MenuId("BulkEditContext");
_MenuId.TimelineItemContext = new _MenuId("TimelineItemContext");
_MenuId.TimelineTitle = new _MenuId("TimelineTitle");
_MenuId.TimelineTitleContext = new _MenuId("TimelineTitleContext");
_MenuId.TimelineFilterSubMenu = new _MenuId("TimelineFilterSubMenu");
_MenuId.AccountsContext = new _MenuId("AccountsContext");
_MenuId.SidebarTitle = new _MenuId("SidebarTitle");
_MenuId.PanelTitle = new _MenuId("PanelTitle");
_MenuId.AuxiliaryBarTitle = new _MenuId("AuxiliaryBarTitle");
_MenuId.TerminalInstanceContext = new _MenuId("TerminalInstanceContext");
_MenuId.TerminalEditorInstanceContext = new _MenuId("TerminalEditorInstanceContext");
_MenuId.TerminalNewDropdownContext = new _MenuId("TerminalNewDropdownContext");
_MenuId.TerminalTabContext = new _MenuId("TerminalTabContext");
_MenuId.TerminalTabEmptyAreaContext = new _MenuId("TerminalTabEmptyAreaContext");
_MenuId.TerminalStickyScrollContext = new _MenuId("TerminalStickyScrollContext");
_MenuId.WebviewContext = new _MenuId("WebviewContext");
_MenuId.InlineCompletionsActions = new _MenuId("InlineCompletionsActions");
_MenuId.InlineEditsActions = new _MenuId("InlineEditsActions");
_MenuId.NewFile = new _MenuId("NewFile");
_MenuId.MergeInput1Toolbar = new _MenuId("MergeToolbar1Toolbar");
_MenuId.MergeInput2Toolbar = new _MenuId("MergeToolbar2Toolbar");
_MenuId.MergeBaseToolbar = new _MenuId("MergeBaseToolbar");
_MenuId.MergeInputResultToolbar = new _MenuId("MergeToolbarResultToolbar");
_MenuId.InlineSuggestionToolbar = new _MenuId("InlineSuggestionToolbar");
_MenuId.InlineEditToolbar = new _MenuId("InlineEditToolbar");
_MenuId.ChatContext = new _MenuId("ChatContext");
_MenuId.ChatCodeBlock = new _MenuId("ChatCodeblock");
_MenuId.ChatCompareBlock = new _MenuId("ChatCompareBlock");
_MenuId.ChatMessageTitle = new _MenuId("ChatMessageTitle");
_MenuId.ChatWelcomeContext = new _MenuId("ChatWelcomeContext");
_MenuId.ChatMessageFooter = new _MenuId("ChatMessageFooter");
_MenuId.ChatSubagentContent = new _MenuId("ChatSubagentContent");
_MenuId.ChatExecute = new _MenuId("ChatExecute");
_MenuId.ChatExecuteQueue = new _MenuId("ChatExecuteQueue");
_MenuId.ChatInput = new _MenuId("ChatInput");
_MenuId.ChatInputSecondary = new _MenuId("ChatInputSecondary");
_MenuId.ChatInputStatus = new _MenuId("ChatInputStatus");
_MenuId.ChatInputSide = new _MenuId("ChatInputSide");
_MenuId.AutomationsDialogInput = new _MenuId("AutomationsDialogInput");
_MenuId.ChatModePicker = new _MenuId("ChatModePicker");
_MenuId.ChatEditingWidgetToolbar = new _MenuId("ChatEditingWidgetToolbar");
_MenuId.ChatEditingSessionChangesToolbar = new _MenuId("ChatEditingSessionChangesToolbar");
_MenuId.ChatEditingSessionTitleToolbar = new _MenuId("ChatEditingSessionTitleToolbar");
_MenuId.ChatEditingSessionChangesVersionsSubmenu = new _MenuId("ChatEditingSessionChangesVersionsSubmenu");
_MenuId.ChatEditingSessionChangesFileHeaderToolbar = new _MenuId("ChatEditingSessionChangesFileHeaderToolbar");
_MenuId.ChatEditingSessionChangesFileHeaderRightToolbar = new _MenuId("ChatEditingSessionChangesFileHeaderRightToolbar");
_MenuId.ChatEditingEditorContent = new _MenuId("ChatEditingEditorContent");
_MenuId.ChatEditingEditorHunk = new _MenuId("ChatEditingEditorHunk");
_MenuId.ChatEditingDeletedNotebookCell = new _MenuId("ChatEditingDeletedNotebookCell");
_MenuId.ChatInputAttachmentToolbar = new _MenuId("ChatInputAttachmentToolbar");
_MenuId.ChatEditingWidgetModifiedFilesToolbar = new _MenuId("ChatEditingWidgetModifiedFilesToolbar");
_MenuId.ChatInputResourceAttachmentContext = new _MenuId("ChatInputResourceAttachmentContext");
_MenuId.ChatInputSymbolAttachmentContext = new _MenuId("ChatInputSymbolAttachmentContext");
_MenuId.ChatInlineResourceAnchorContext = new _MenuId("ChatInlineResourceAnchorContext");
_MenuId.ChatInlineSymbolAnchorContext = new _MenuId("ChatInlineSymbolAnchorContext");
_MenuId.ChatMessageCheckpoint = new _MenuId("ChatMessageCheckpoint");
_MenuId.ChatMessageRestoreCheckpoint = new _MenuId("ChatMessageRestoreCheckpoint");
_MenuId.ChatNewMenu = new _MenuId("ChatNewMenu");
_MenuId.ChatEditingCodeBlockContext = new _MenuId("ChatEditingCodeBlockContext");
_MenuId.ChatTitleBarMenu = new _MenuId("ChatTitleBarMenu");
_MenuId.ChatAttachmentsContext = new _MenuId("ChatAttachmentsContext");
_MenuId.ChatTipContext = new _MenuId("ChatTipContext");
_MenuId.ChatTipToolbar = new _MenuId("ChatTipToolbar");
_MenuId.ChatToolOutputResourceToolbar = new _MenuId("ChatToolOutputResourceToolbar");
_MenuId.ChatTextEditorMenu = new _MenuId("ChatTextEditorMenu");
_MenuId.ChatToolOutputResourceContext = new _MenuId("ChatToolOutputResourceContext");
_MenuId.ChatMultiDiffContext = new _MenuId("ChatMultiDiffContext");
_MenuId.ChatConfirmationMenu = new _MenuId("ChatConfirmationMenu");
_MenuId.ChatEditorInlineMenu = new _MenuId("ChatEditorInlineGutter");
_MenuId.ChatEditorInlineExecute = new _MenuId("ChatEditorInputExecute");
_MenuId.ChatEditorInlineInputSide = new _MenuId("ChatEditorInputSide");
_MenuId.InlineChatEditorAffordance = new _MenuId("InlineChatEditorAffordance");
_MenuId.AccessibleView = new _MenuId("AccessibleView");
_MenuId.MultiDiffEditorContent = new _MenuId("MultiDiffEditorContent");
_MenuId.MultiDiffEditorFileToolbar = new _MenuId("MultiDiffEditorFileToolbar");
_MenuId.DiffEditorHunkToolbar = new _MenuId("DiffEditorHunkToolbar");
_MenuId.DiffEditorSelectionToolbar = new _MenuId("DiffEditorSelectionToolbar");
_MenuId.BrowserNavigationToolbar = new _MenuId("BrowserNavigationToolbar");
_MenuId.BrowserActionsToolbar = new _MenuId("BrowserActionsToolbar");
_MenuId.BrowserChatActionsMenu = new _MenuId("BrowserChatActionsMenu");
_MenuId.BrowserEmulationToolbar = new _MenuId("BrowserEmulationToolbar");
_MenuId.AgentSessionsViewerFilterSubMenu = new _MenuId("AgentSessionsViewerFilterSubMenu");
_MenuId.AgentSessionsContext = new _MenuId("AgentSessionsContext");
_MenuId.AgentSessionSectionContext = new _MenuId("AgentSessionSectionContext");
_MenuId.AgentSessionsCreateSubMenu = new _MenuId("AgentSessionsCreateSubMenu");
_MenuId.AgentSessionsToolbar = new _MenuId("AgentSessionsToolbar");
_MenuId.AgentSessionItemToolbar = new _MenuId("AgentSessionItemToolbar");
_MenuId.AgentSessionSectionToolbar = new _MenuId("AgentSessionSectionToolbar");
_MenuId.SessionItemContextMenu = new _MenuId("SessionItemContextMenu");
_MenuId.SessionHeaderContext = new _MenuId("SessionsSessionHeaderContext");
_MenuId.AgentsTitleBarControlMenu = new _MenuId("AgentsTitleBarControlMenu");
_MenuId.AgentsChangesToolbar = new _MenuId("AgentsChangesToolbar");
_MenuId.AgentsChangesPrimaryActionSubMenu = new _MenuId("AgentsChangesPrimaryActionSubMenu");
_MenuId.AgentsChangeInlineToolbar = new _MenuId("AgentsChangeInlineToolbar");
_MenuId.ChatViewSessionTitleNavigationToolbar = new _MenuId("ChatViewSessionTitleNavigationToolbar");
_MenuId.ChatViewSessionTitleToolbar = new _MenuId("ChatViewSessionTitleToolbar");
_MenuId.ChatContextUsageActions = new _MenuId("ChatContextUsageActions");
_MenuId.MarkerHoverStatusBar = new _MenuId("MarkerHoverParticipant.StatusBar");
let MenuId = _MenuId;
const IMenuService = createDecorator("menuService");
const _MenuRegistryChangeEvent = class _MenuRegistryChangeEvent {
  constructor(id) {
    this.id = id;
    this.has = (candidate) => candidate === id;
  }
  static for(id) {
    let value = this._all.get(id);
    if (!value) {
      value = new _MenuRegistryChangeEvent(id);
      this._all.set(id, value);
    }
    return value;
  }
  static merge(events) {
    const ids = /* @__PURE__ */ new Set();
    for (const item of events) {
      if (item instanceof _MenuRegistryChangeEvent) {
        ids.add(item.id);
      }
    }
    return ids;
  }
};
_MenuRegistryChangeEvent._all = /* @__PURE__ */ new Map();
let MenuRegistryChangeEvent = _MenuRegistryChangeEvent;
const MenuRegistry = new class {
  constructor() {
    this._commands = /* @__PURE__ */ new Map();
    this._menuItems = /* @__PURE__ */ new Map();
    this._onDidChangeMenu = new MicrotaskEmitter({
      merge: MenuRegistryChangeEvent.merge
    });
    this.onDidChangeMenu = this._onDidChangeMenu.event;
  }
  addCommand(command) {
    this._commands.set(command.id, command);
    this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));
    return markAsSingleton(toDisposable(() => {
      if (this._commands.delete(command.id)) {
        this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(MenuId.CommandPalette));
      }
    }));
  }
  getCommand(id) {
    return this._commands.get(id);
  }
  getCommands() {
    const map = /* @__PURE__ */ new Map();
    this._commands.forEach((value, key) => map.set(key, value));
    return map;
  }
  appendMenuItem(id, item) {
    let list = this._menuItems.get(id);
    if (!list) {
      list = new LinkedList();
      this._menuItems.set(id, list);
    }
    const rm = list.push(item);
    this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(id));
    return markAsSingleton(toDisposable(() => {
      rm();
      this._onDidChangeMenu.fire(MenuRegistryChangeEvent.for(id));
    }));
  }
  appendMenuItems(items) {
    const result = new DisposableStore();
    for (const { id, item } of items) {
      result.add(this.appendMenuItem(id, item));
    }
    return result;
  }
  getMenuItems(id) {
    let result;
    if (this._menuItems.has(id)) {
      result = [...this._menuItems.get(id)];
    } else {
      result = [];
    }
    if (id === MenuId.CommandPalette) {
      this._appendImplicitItems(result);
    }
    return result;
  }
  _appendImplicitItems(result) {
    const set = /* @__PURE__ */ new Set();
    for (const item of result) {
      if (isIMenuItem(item)) {
        set.add(item.command.id);
        if (item.alt) {
          set.add(item.alt.id);
        }
      }
    }
    this._commands.forEach((command, id) => {
      if (!set.has(id)) {
        result.push({ command });
      }
    });
  }
}();
class SubmenuItemAction extends SubmenuAction {
  constructor(item, hideActions, actions) {
    super(`submenuitem.${item.submenu.id}`, typeof item.title === "string" ? item.title : item.title.value, actions, "submenu");
    this.item = item;
    this.hideActions = hideActions;
  }
}
let MenuItemAction = class {
  constructor(item, alt, options, hideActions, menuKeybinding, contextKeyService, _commandService) {
    this.hideActions = hideActions;
    this.menuKeybinding = menuKeybinding;
    this._commandService = _commandService;
    this.id = item.id;
    this.label = MenuItemAction.label(item, options);
    this.tooltip = (typeof item.tooltip === "string" ? item.tooltip : item.tooltip?.value) ?? "";
    this.enabled = !item.precondition || contextKeyService.contextMatchesRules(item.precondition);
    this.checked = void 0;
    let icon;
    if (item.toggled) {
      const toggled = item.toggled.condition ? item.toggled : { condition: item.toggled };
      this.checked = contextKeyService.contextMatchesRules(toggled.condition);
      if (this.checked && toggled.tooltip) {
        this.tooltip = typeof toggled.tooltip === "string" ? toggled.tooltip : toggled.tooltip.value;
      }
      if (this.checked && ThemeIcon.isThemeIcon(toggled.icon)) {
        icon = toggled.icon;
      }
      if (this.checked && toggled.title) {
        this.label = typeof toggled.title === "string" ? toggled.title : toggled.title.value;
      }
    }
    if (!icon) {
      icon = ThemeIcon.isThemeIcon(item.icon) ? item.icon : void 0;
    }
    this.item = item;
    this.alt = alt ? new MenuItemAction(alt, void 0, options, hideActions, void 0, contextKeyService, _commandService) : void 0;
    this._options = options;
    this.class = icon && ThemeIcon.asClassName(icon);
  }
  static label(action, options) {
    return options?.renderShortTitle && action.shortTitle ? typeof action.shortTitle === "string" ? action.shortTitle : action.shortTitle.value : typeof action.title === "string" ? action.title : action.title.value;
  }
  run(...args) {
    let runArgs = [];
    if (this._options?.args) {
      runArgs = [...runArgs, ...this._options.args];
    } else if (this._options?.arg) {
      runArgs = [...runArgs, this._options.arg];
    }
    if (this._options?.shouldForwardArgs) {
      runArgs = [...runArgs, ...args];
    }
    return this._commandService.executeCommand(this.id, ...runArgs);
  }
};
MenuItemAction = __decorateClass([
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ICommandService)
], MenuItemAction);
class Action2 {
  constructor(desc) {
    this.desc = desc;
  }
}
function registerAction2(ctor) {
  const disposables = [];
  const action = new ctor();
  const { f1, menu, keybinding, ...command } = action.desc;
  if (CommandsRegistry.getCommand(command.id)) {
    throw new Error(`Cannot register two commands with the same id: ${command.id}`);
  }
  disposables.push(CommandsRegistry.registerCommand({
    id: command.id,
    handler: (accessor, ...args) => action.run(accessor, ...args),
    metadata: command.metadata ?? { description: action.desc.title }
  }));
  if (Array.isArray(menu)) {
    for (const item of menu) {
      disposables.push(MenuRegistry.appendMenuItem(item.id, { command: { ...command, precondition: item.precondition === null ? void 0 : command.precondition }, ...item }));
    }
  } else if (menu) {
    disposables.push(MenuRegistry.appendMenuItem(menu.id, { command: { ...command, precondition: menu.precondition === null ? void 0 : command.precondition }, ...menu }));
  }
  if (f1) {
    disposables.push(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command, when: command.precondition }));
    disposables.push(MenuRegistry.addCommand(command));
  }
  if (Array.isArray(keybinding)) {
    for (const item of keybinding) {
      disposables.push(KeybindingsRegistry.registerKeybindingRule({
        ...item,
        id: command.id,
        when: command.precondition ? ContextKeyExpr.and(command.precondition, item.when) : item.when
      }));
    }
  } else if (keybinding) {
    disposables.push(KeybindingsRegistry.registerKeybindingRule({
      ...keybinding,
      id: command.id,
      when: command.precondition ? ContextKeyExpr.and(command.precondition, keybinding.when) : keybinding.when
    }));
  }
  return {
    dispose() {
      dispose(disposables);
    }
  };
}
export {
  Action2,
  IMenuService,
  MenuId,
  MenuItemAction,
  MenuRegistry,
  SubmenuItemAction,
  isIMenuItem,
  isISubmenuItem,
  registerAction2
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uc1xcY29tbW9uXFxhY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUFjdGlvbiwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIE1pY3JvdGFza0VtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIElEaXNwb3NhYmxlLCBtYXJrQXNTaW5nbGV0b24sIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMaW5rZWRMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlua2VkTGlzdC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRBY3Rpb24sIElDb21tYW5kQWN0aW9uVGl0bGUsIEljb24sIElMb2NhbGl6ZWRTdHJpbmcgfSBmcm9tICcuLi8uLi9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1J1bGUsIEtleWJpbmRpbmdzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJTWVudUl0ZW0ge1xuXHRjb21tYW5kOiBJQ29tbWFuZEFjdGlvbjtcblx0YWx0PzogSUNvbW1hbmRBY3Rpb247XG5cdC8qKlxuXHQgKiBNZW51IGl0ZW0gaXMgaGlkZGVuIGlmIHRoaXMgZXhwcmVzc2lvbiByZXR1cm5zIGZhbHNlLlxuXHQgKi9cblx0d2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRncm91cD86ICduYXZpZ2F0aW9uJyB8IHN0cmluZztcblx0b3JkZXI/OiBudW1iZXI7XG5cdGlzSGlkZGVuQnlEZWZhdWx0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3VibWVudUl0ZW0ge1xuXHR0aXRsZTogc3RyaW5nIHwgSUNvbW1hbmRBY3Rpb25UaXRsZTtcblx0c3VibWVudTogTWVudUlkO1xuXHRpY29uPzogSWNvbjtcblx0d2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uO1xuXHRncm91cD86ICduYXZpZ2F0aW9uJyB8IHN0cmluZztcblx0b3JkZXI/OiBudW1iZXI7XG5cdGlzU2VsZWN0aW9uPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEEgc3BsaXQgYnV0dG9uIHNob3dzIHRoZSBmaXJzdCBhY3Rpb25cblx0ICogYXMgcHJpbWFyeSBhY3Rpb24gYW5kIHRoZSByZXN0IG9mIHRoZVxuXHQgKiBhY3Rpb25zIGluIGEgZHJvcGRvd24uXG5cdCAqXG5cdCAqIFVzZSBgdG9nZ2xlUHJpbWFyeUFjdGlvbmAgdG8gcHJvbW90ZVxuXHQgKiB0aGUgYWN0aW9uIHRoYXQgd2FzIGxhc3QgdXNlZCB0byBiZVxuXHQgKiB0aGUgcHJpbWFyeSBhY3Rpb24gYW5kIHJlbWVtYmVyIHRoYXRcblx0ICogY2hvaWNlLlxuXHQgKi9cblx0aXNTcGxpdEJ1dHRvbj86IGJvb2xlYW4gfCB7XG5cdFx0LyoqXG5cdFx0ICogV2lsbCB1cGRhdGUgdGhlIHByaW1hcnkgYWN0aW9uIGJhc2VkXG5cdFx0ICogb24gdGhlIGFjdGlvbiB0aGF0IHdhcyBsYXN0IHJ1bi5cblx0XHQgKi9cblx0XHR0b2dnbGVQcmltYXJ5QWN0aW9uOiB0cnVlO1xuXHRcdC8qKlxuXHRcdCAqIFJlc3RyaWN0cyB3aGljaCBzdWJtZW51IGNvbW1hbmRzIGNhbiBiZWNvbWUgdGhlIHByaW1hcnkgYWN0aW9uLlxuXHRcdCAqIFJ1bm5pbmcgYW4gZWxpZ2libGUgY29tbWFuZCBvdXRzaWRlIHRoZSBzdWJtZW51IGFsc28gdXBkYXRlcyB0aGUgcHJpbWFyeSBhY3Rpb24uXG5cdFx0ICovXG5cdFx0cHJpbWFyeUFjdGlvbklkcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJTWVudUl0ZW0oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSU1lbnVJdGVtIHtcblx0cmV0dXJuIChpdGVtIGFzIElNZW51SXRlbSkuY29tbWFuZCAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNJU3VibWVudUl0ZW0oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSVN1Ym1lbnVJdGVtIHtcblx0cmV0dXJuIChpdGVtIGFzIElTdWJtZW51SXRlbSkuc3VibWVudSAhPT0gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgTWVudUlkIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfaW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIE1lbnVJZD4oKTtcblxuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWFuZFBhbGV0dGUgPSBuZXcgTWVudUlkKCdDb21tYW5kUGFsZXR0ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdCcmVha3BvaW50c0NvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z0JyZWFrcG9pbnRzQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdDYWxsU3RhY2tDb250ZXh0ID0gbmV3IE1lbnVJZCgnRGVidWdDYWxsU3RhY2tDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBEZWJ1Z0NvbnNvbGVDb250ZXh0ID0gbmV3IE1lbnVJZCgnRGVidWdDb25zb2xlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdWYXJpYWJsZXNDb250ZXh0ID0gbmV3IE1lbnVJZCgnRGVidWdWYXJpYWJsZXNDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va1ZhcmlhYmxlc0NvbnRleHQgPSBuZXcgTWVudUlkKCdOb3RlYm9va1ZhcmlhYmxlc0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IERlYnVnSG92ZXJDb250ZXh0ID0gbmV3IE1lbnVJZCgnRGVidWdIb3ZlckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IERlYnVnV2F0Y2hDb250ZXh0ID0gbmV3IE1lbnVJZCgnRGVidWdXYXRjaENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IERlYnVnVG9vbEJhciA9IG5ldyBNZW51SWQoJ0RlYnVnVG9vbEJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdUb29sQmFyU3RvcCA9IG5ldyBNZW51SWQoJ0RlYnVnVG9vbEJhclN0b3AnKTtcblx0c3RhdGljIHJlYWRvbmx5IERlYnVnRGlzYXNzZW1ibHlDb250ZXh0ID0gbmV3IE1lbnVJZCgnRGVidWdEaXNhc3NlbWJseUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IERlYnVnQ2FsbFN0YWNrVG9vbGJhciA9IG5ldyBNZW51SWQoJ0RlYnVnQ2FsbFN0YWNrVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGVidWdDcmVhdGVDb25maWd1cmF0aW9uID0gbmV3IE1lbnVJZCgnRGVidWdDcmVhdGVDb25maWd1cmF0aW9uJyk7XG5cdHN0YXRpYyByZWFkb25seSBEZWJ1Z1Njb3Blc0NvbnRleHQgPSBuZXcgTWVudUlkKCdEZWJ1Z1Njb3Blc0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvckNvbnRleHQgPSBuZXcgTWVudUlkKCdFZGl0b3JDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTaW1wbGVFZGl0b3JDb250ZXh0ID0gbmV3IE1lbnVJZCgnU2ltcGxlRWRpdG9yQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yQ29udGVudCA9IG5ldyBNZW51SWQoJ0VkaXRvckNvbnRlbnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvckxpbmVOdW1iZXJDb250ZXh0ID0gbmV3IE1lbnVJZCgnRWRpdG9yTGluZU51bWJlckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvckNvbnRleHRDb3B5ID0gbmV3IE1lbnVJZCgnRWRpdG9yQ29udGV4dENvcHknKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvckNvbnRleHRQZWVrID0gbmV3IE1lbnVJZCgnRWRpdG9yQ29udGV4dFBlZWsnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvckNvbnRleHRTaGFyZSA9IG5ldyBNZW51SWQoJ0VkaXRvckNvbnRleHRTaGFyZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGl0bGUgPSBuZXcgTWVudUlkKCdFZGl0b3JUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGl0bGVMYXlvdXQgPSBuZXcgTWVudUlkKCdFZGl0b3JUaXRsZUxheW91dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTW9kYWxFZGl0b3JUaXRsZSA9IG5ldyBNZW51SWQoJ01vZGFsRWRpdG9yVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1vZGFsRWRpdG9yVGl0bGVDb250ZXh0ID0gbmV3IE1lbnVJZCgnTW9kYWxFZGl0b3JUaXRsZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1vZGFsRWRpdG9yRWRpdG9yVGl0bGUgPSBuZXcgTWVudUlkKCdNb2RhbEVkaXRvckVkaXRvclRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBDb21wYWN0V2luZG93RWRpdG9yVGl0bGUgPSBuZXcgTWVudUlkKCdDb21wYWN0V2luZG93RWRpdG9yVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvclRpdGxlUnVuID0gbmV3IE1lbnVJZCgnRWRpdG9yVGl0bGVSdW4nKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvclRpdGxlQ29udGV4dCA9IG5ldyBNZW51SWQoJ0VkaXRvclRpdGxlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGl0bGVDb250ZXh0U2hhcmUgPSBuZXcgTWVudUlkKCdFZGl0b3JUaXRsZUNvbnRleHRTaGFyZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRW1wdHlFZGl0b3JHcm91cCA9IG5ldyBNZW51SWQoJ0VtcHR5RWRpdG9yR3JvdXAnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVtcHR5RWRpdG9yR3JvdXBDb250ZXh0ID0gbmV3IE1lbnVJZCgnRW1wdHlFZGl0b3JHcm91cENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvckdyb3VwV2F0ZXJtYXJrVG9vbGJhciA9IG5ldyBNZW51SWQoJ0VkaXRvckdyb3VwV2F0ZXJtYXJrVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGFic0JhckNvbnRleHQgPSBuZXcgTWVudUlkKCdFZGl0b3JUYWJzQmFyQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRWRpdG9yVGFic0JhclNob3dUYWJzU3VibWVudSA9IG5ldyBNZW51SWQoJ0VkaXRvclRhYnNCYXJTaG93VGFic1N1Ym1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvclRhYnNCYXJTaG93VGFic1plbk1vZGVTdWJtZW51ID0gbmV3IE1lbnVJZCgnRWRpdG9yVGFic0JhclNob3dUYWJzWmVuTW9kZVN1Ym1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEVkaXRvckFjdGlvbnNQb3NpdGlvblN1Ym1lbnUgPSBuZXcgTWVudUlkKCdFZGl0b3JBY3Rpb25zUG9zaXRpb25TdWJtZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JSZW5kZXJXaGl0ZXNwYWNlU3VibWVudSA9IG5ldyBNZW51SWQoJ0VkaXRvclJlbmRlcldoaXRlc3BhY2VTdWJtZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFZGl0b3JTcGxpdE1vdmVTdWJtZW51ID0gbmV3IE1lbnVJZCgnRWRpdG9yU3BsaXRNb3ZlU3VibWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRXhwbG9yZXJDb250ZXh0ID0gbmV3IE1lbnVJZCgnRXhwbG9yZXJDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBFeHBsb3JlckNvbnRleHRTaGFyZSA9IG5ldyBNZW51SWQoJ0V4cGxvcmVyQ29udGV4dFNoYXJlJyk7XG5cdHN0YXRpYyByZWFkb25seSBFeHRlbnNpb25Db250ZXh0ID0gbmV3IE1lbnVJZCgnRXh0ZW5zaW9uQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRXh0ZW5zaW9uRWRpdG9yQ29udGV4dE1lbnUgPSBuZXcgTWVudUlkKCdFeHRlbnNpb25FZGl0b3JDb250ZXh0TWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgR2xvYmFsQWN0aXZpdHkgPSBuZXcgTWVudUlkKCdHbG9iYWxBY3Rpdml0eScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWFuZENlbnRlciA9IG5ldyBNZW51SWQoJ0NvbW1hbmRDZW50ZXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbW1hbmRDZW50ZXJDZW50ZXIgPSBuZXcgTWVudUlkKCdDb21tYW5kQ2VudGVyQ2VudGVyJyk7XG5cdHN0YXRpYyByZWFkb25seSBMYXlvdXRDb250cm9sTWVudVN1Ym1lbnUgPSBuZXcgTWVudUlkKCdMYXlvdXRDb250cm9sTWVudVN1Ym1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IExheW91dENvbnRyb2xNZW51ID0gbmV3IE1lbnVJZCgnTGF5b3V0Q29udHJvbE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJNYWluTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJNYWluTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhckFwcGVhcmFuY2VNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhckFwcGVhcmFuY2VNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyRGVidWdNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhckRlYnVnTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhckVkaXRNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhckVkaXRNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyQ29weSA9IG5ldyBNZW51SWQoJ01lbnViYXJDb3B5Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyRmlsZU1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyRmlsZU1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJHb01lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyR29NZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFySGVscE1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFySGVscE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJMYXlvdXRNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhckxheW91dE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJOZXdCcmVha3BvaW50TWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJOZXdCcmVha3BvaW50TWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgUGFuZWxBbGlnbm1lbnRNZW51ID0gbmV3IE1lbnVJZCgnUGFuZWxBbGlnbm1lbnRNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBQYW5lbFBvc2l0aW9uTWVudSA9IG5ldyBNZW51SWQoJ1BhbmVsUG9zaXRpb25NZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBBY3Rpdml0eUJhclBvc2l0aW9uTWVudSA9IG5ldyBNZW51SWQoJ0FjdGl2aXR5QmFyUG9zaXRpb25NZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RpZmljYXRpb25zQ2VudGVyUG9zaXRpb25NZW51ID0gbmV3IE1lbnVJZCgnTm90aWZpY2F0aW9uc0NlbnRlclBvc2l0aW9uTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhclByZWZlcmVuY2VzTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJQcmVmZXJlbmNlc01lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJSZWNlbnRNZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhclJlY2VudE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJTZWxlY3Rpb25NZW51ID0gbmV3IE1lbnVJZCgnTWVudWJhclNlbGVjdGlvbk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJTaGFyZSA9IG5ldyBNZW51SWQoJ01lbnViYXJTaGFyZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhclN3aXRjaEVkaXRvck1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyU3dpdGNoRWRpdG9yTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVudWJhclN3aXRjaEdyb3VwTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJTd2l0Y2hHcm91cE1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJUZXJtaW5hbE1lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyVGVybWluYWxNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyVGVybWluYWxTdWdnZXN0U3RhdHVzTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJUZXJtaW5hbFN1Z2dlc3RTdGF0dXNNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNZW51YmFyVmlld01lbnUgPSBuZXcgTWVudUlkKCdNZW51YmFyVmlld01lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lbnViYXJIb21lTWVudSA9IG5ldyBNZW51SWQoJ01lbnViYXJIb21lTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgT3BlbkVkaXRvcnNDb250ZXh0ID0gbmV3IE1lbnVJZCgnT3BlbkVkaXRvcnNDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBPcGVuRWRpdG9yc0NvbnRleHRTaGFyZSA9IG5ldyBNZW51SWQoJ09wZW5FZGl0b3JzQ29udGV4dFNoYXJlJyk7XG5cdHN0YXRpYyByZWFkb25seSBQcm9ibGVtc1BhbmVsQ29udGV4dCA9IG5ldyBNZW51SWQoJ1Byb2JsZW1zUGFuZWxDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01JbnB1dEJveCA9IG5ldyBNZW51SWQoJ1NDTUlucHV0Qm94Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01DaGFuZ2VDb250ZXh0ID0gbmV3IE1lbnVJZCgnU0NNQ2hhbmdlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNUmVzb3VyY2VDb250ZXh0ID0gbmV3IE1lbnVJZCgnU0NNUmVzb3VyY2VDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01SZXNvdXJjZUNvbnRleHRTaGFyZSA9IG5ldyBNZW51SWQoJ1NDTVJlc291cmNlQ29udGV4dFNoYXJlJyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01SZXNvdXJjZUZvbGRlckNvbnRleHQgPSBuZXcgTWVudUlkKCdTQ01SZXNvdXJjZUZvbGRlckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTVJlc291cmNlR3JvdXBDb250ZXh0ID0gbmV3IE1lbnVJZCgnU0NNUmVzb3VyY2VHcm91cENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTVNvdXJjZUNvbnRyb2wgPSBuZXcgTWVudUlkKCdTQ01Tb3VyY2VDb250cm9sJyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01Tb3VyY2VDb250cm9sSW5saW5lID0gbmV3IE1lbnVJZCgnU0NNU291cmNlQ29udHJvbElubGluZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNU291cmNlQ29udHJvbFRpdGxlID0gbmV3IE1lbnVJZCgnU0NNU291cmNlQ29udHJvbFRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01IaXN0b3J5VGl0bGUgPSBuZXcgTWVudUlkKCdTQ01IaXN0b3J5VGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTUhpc3RvcnlJdGVtQ29udGV4dCA9IG5ldyBNZW51SWQoJ1NDTUhpc3RvcnlJdGVtQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VDb250ZXh0ID0gbmV3IE1lbnVJZCgnU0NNSGlzdG9yeUl0ZW1DaGFuZ2VDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTQ01IaXN0b3J5SXRlbVJlZkNvbnRleHQgPSBuZXcgTWVudUlkKCdTQ01IaXN0b3J5SXRlbVJlZkNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTUFydGlmYWN0R3JvdXBDb250ZXh0ID0gbmV3IE1lbnVJZCgnU0NNQXJ0aWZhY3RHcm91cENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNDTUFydGlmYWN0Q29udGV4dCA9IG5ldyBNZW51SWQoJ1NDTUFydGlmYWN0Q29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNUXVpY2tEaWZmRGVjb3JhdGlvbnMgPSBuZXcgTWVudUlkKCdTQ01RdWlja0RpZmZEZWNvcmF0aW9ucycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU0NNVGl0bGUgPSBuZXcgTWVudUlkKCdTQ01UaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU2VhcmNoQ29udGV4dCA9IG5ldyBNZW51SWQoJ1NlYXJjaENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNlYXJjaEFjdGlvbk1lbnUgPSBuZXcgTWVudUlkKCdTZWFyY2hBY3Rpb25Db250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTdGF0dXNCYXJXaW5kb3dJbmRpY2F0b3JNZW51ID0gbmV3IE1lbnVJZCgnU3RhdHVzQmFyV2luZG93SW5kaWNhdG9yTWVudScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgU3RhdHVzQmFyUmVtb3RlSW5kaWNhdG9yTWVudSA9IG5ldyBNZW51SWQoJ1N0YXR1c0JhclJlbW90ZUluZGljYXRvck1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFN0aWNreVNjcm9sbENvbnRleHQgPSBuZXcgTWVudUlkKCdTdGlja3lTY3JvbGxDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0SXRlbSA9IG5ldyBNZW51SWQoJ1Rlc3RJdGVtJyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0SXRlbUd1dHRlciA9IG5ldyBNZW51SWQoJ1Rlc3RJdGVtR3V0dGVyJyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0UHJvZmlsZXNDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGVzdFByb2ZpbGVzQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVzdE1lc3NhZ2VDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGVzdE1lc3NhZ2VDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0TWVzc2FnZUNvbnRlbnQgPSBuZXcgTWVudUlkKCdUZXN0TWVzc2FnZUNvbnRlbnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlc3RQZWVrRWxlbWVudCA9IG5ldyBNZW51SWQoJ1Rlc3RQZWVrRWxlbWVudCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVzdFBlZWtUaXRsZSA9IG5ldyBNZW51SWQoJ1Rlc3RQZWVrVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlc3RDYWxsU3RhY2sgPSBuZXcgTWVudUlkKCdUZXN0Q2FsbFN0YWNrJyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0Q292ZXJhZ2VGaWx0ZXJJdGVtID0gbmV3IE1lbnVJZCgnVGVzdENvdmVyYWdlRmlsdGVySXRlbScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVG91Y2hCYXJDb250ZXh0ID0gbmV3IE1lbnVJZCgnVG91Y2hCYXJDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUaXRsZUJhciA9IG5ldyBNZW51SWQoJ1RpdGxlQmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBUaXRsZUJhckFkamFjZW50Q2VudGVyID0gbmV3IE1lbnVJZCgnVGl0bGVCYXJBZGphY2VudENlbnRlcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGl0bGVCYXJVcGRhdGUgPSBuZXcgTWVudUlkKCdUaXRsZUJhclVwZGF0ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGl0bGVCYXJDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGl0bGVCYXJDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUaXRsZUJhclRpdGxlQ29udGV4dCA9IG5ldyBNZW51SWQoJ1RpdGxlQmFyVGl0bGVDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUdW5uZWxDb250ZXh0ID0gbmV3IE1lbnVJZCgnVHVubmVsQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHVubmVsUHJpdmFjeSA9IG5ldyBNZW51SWQoJ1R1bm5lbFByaXZhY3knKTtcblx0c3RhdGljIHJlYWRvbmx5IFR1bm5lbFByb3RvY29sID0gbmV3IE1lbnVJZCgnVHVubmVsUHJvdG9jb2wnKTtcblx0c3RhdGljIHJlYWRvbmx5IFR1bm5lbFBvcnRJbmxpbmUgPSBuZXcgTWVudUlkKCdUdW5uZWxJbmxpbmUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFR1bm5lbFRpdGxlID0gbmV3IE1lbnVJZCgnVHVubmVsVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFR1bm5lbExvY2FsQWRkcmVzc0lubGluZSA9IG5ldyBNZW51SWQoJ1R1bm5lbExvY2FsQWRkcmVzc0lubGluZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHVubmVsT3JpZ2luSW5saW5lID0gbmV3IE1lbnVJZCgnVHVubmVsT3JpZ2luSW5saW5lJyk7XG5cdHN0YXRpYyByZWFkb25seSBWaWV3SXRlbUNvbnRleHQgPSBuZXcgTWVudUlkKCdWaWV3SXRlbUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFZpZXdDb250YWluZXJUaXRsZSA9IG5ldyBNZW51SWQoJ1ZpZXdDb250YWluZXJUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVmlld0NvbnRhaW5lclRpdGxlQ29udGV4dCA9IG5ldyBNZW51SWQoJ1ZpZXdDb250YWluZXJUaXRsZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFZpZXdUaXRsZSA9IG5ldyBNZW51SWQoJ1ZpZXdUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVmlld1RpdGxlQ29udGV4dCA9IG5ldyBNZW51SWQoJ1ZpZXdUaXRsZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbW1lbnRFZGl0b3JBY3Rpb25zID0gbmV3IE1lbnVJZCgnQ29tbWVudEVkaXRvckFjdGlvbnMnKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbW1lbnRUaHJlYWRUaXRsZSA9IG5ldyBNZW51SWQoJ0NvbW1lbnRUaHJlYWRUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWVudFRocmVhZEFjdGlvbnMgPSBuZXcgTWVudUlkKCdDb21tZW50VGhyZWFkQWN0aW9ucycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWVudFRocmVhZEFkZGl0aW9uYWxBY3Rpb25zID0gbmV3IE1lbnVJZCgnQ29tbWVudFRocmVhZEFkZGl0aW9uYWxBY3Rpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBDb21tZW50VGhyZWFkVGl0bGVDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ29tbWVudFRocmVhZFRpdGxlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ29tbWVudFRocmVhZENvbW1lbnRDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ29tbWVudFRocmVhZENvbW1lbnRDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDb21tZW50VGl0bGUgPSBuZXcgTWVudUlkKCdDb21tZW50VGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbW1lbnRBY3Rpb25zID0gbmV3IE1lbnVJZCgnQ29tbWVudEFjdGlvbnMnKTtcblx0c3RhdGljIHJlYWRvbmx5IENvbW1lbnRzVmlld1RocmVhZEFjdGlvbnMgPSBuZXcgTWVudUlkKCdDb21tZW50c1ZpZXdUaHJlYWRBY3Rpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBJbnRlcmFjdGl2ZVRvb2xiYXIgPSBuZXcgTWVudUlkKCdJbnRlcmFjdGl2ZVRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IEludGVyYWN0aXZlQ2VsbFRpdGxlID0gbmV3IE1lbnVJZCgnSW50ZXJhY3RpdmVDZWxsVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEludGVyYWN0aXZlQ2VsbERlbGV0ZSA9IG5ldyBNZW51SWQoJ0ludGVyYWN0aXZlQ2VsbERlbGV0ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW50ZXJhY3RpdmVDZWxsRXhlY3V0ZSA9IG5ldyBNZW51SWQoJ0ludGVyYWN0aXZlQ2VsbEV4ZWN1dGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEludGVyYWN0aXZlSW5wdXRFeGVjdXRlID0gbmV3IE1lbnVJZCgnSW50ZXJhY3RpdmVJbnB1dEV4ZWN1dGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEludGVyYWN0aXZlSW5wdXRDb25maWcgPSBuZXcgTWVudUlkKCdJbnRlcmFjdGl2ZUlucHV0Q29uZmlnJyk7XG5cdHN0YXRpYyByZWFkb25seSBSZXBsSW5wdXRFeGVjdXRlID0gbmV3IE1lbnVJZCgnUmVwbElucHV0RXhlY3V0ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSXNzdWVSZXBvcnRlciA9IG5ldyBNZW51SWQoJ0lzc3VlUmVwb3J0ZXInKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rVG9vbGJhciA9IG5ldyBNZW51SWQoJ05vdGVib29rVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tUb29sYmFyQ29udGV4dCA9IG5ldyBNZW51SWQoJ05vdGVib29rVG9vbGJhckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rU3RpY2t5U2Nyb2xsQ29udGV4dCA9IG5ldyBNZW51SWQoJ05vdGVib29rU3RpY2t5U2Nyb2xsQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tDZWxsVGl0bGUgPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tDZWxsRGVsZXRlID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tDZWxsRGVsZXRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0NlbGxJbnNlcnQgPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxJbnNlcnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rQ2VsbEJldHdlZW4gPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxCZXR3ZWVuJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0NlbGxMaXN0VG9wID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tDZWxsVG9wJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va0NlbGxFeGVjdXRlID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tDZWxsRXhlY3V0ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tDZWxsRXhlY3V0ZUdvVG8gPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxFeGVjdXRlR29UbycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tDZWxsRXhlY3V0ZVByaW1hcnkgPSBuZXcgTWVudUlkKCdOb3RlYm9va0NlbGxFeGVjdXRlUHJpbWFyeScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tEaWZmQ2VsbElucHV0VGl0bGUgPSBuZXcgTWVudUlkKCdOb3RlYm9va0RpZmZDZWxsSW5wdXRUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tEaWZmRG9jdW1lbnRNZXRhZGF0YSA9IG5ldyBNZW51SWQoJ05vdGVib29rRGlmZkRvY3VtZW50TWV0YWRhdGEnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rRGlmZkNlbGxNZXRhZGF0YVRpdGxlID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tEaWZmQ2VsbE1ldGFkYXRhVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rRGlmZkNlbGxPdXRwdXRzVGl0bGUgPSBuZXcgTWVudUlkKCdOb3RlYm9va0RpZmZDZWxsT3V0cHV0c1RpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBOb3RlYm9va091dHB1dFRvb2xiYXIgPSBuZXcgTWVudUlkKCdOb3RlYm9va091dHB1dFRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rT3V0bGluZUZpbHRlciA9IG5ldyBNZW51SWQoJ05vdGVib29rT3V0bGluZUZpbHRlcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTm90ZWJvb2tPdXRsaW5lQWN0aW9uTWVudSA9IG5ldyBNZW51SWQoJ05vdGVib29rT3V0bGluZUFjdGlvbk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rRWRpdG9yTGF5b3V0Q29uZmlndXJlID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tFZGl0b3JMYXlvdXRDb25maWd1cmUnKTtcblx0c3RhdGljIHJlYWRvbmx5IE5vdGVib29rS2VybmVsU291cmNlID0gbmV3IE1lbnVJZCgnTm90ZWJvb2tLZXJuZWxTb3VyY2UnKTtcblx0c3RhdGljIHJlYWRvbmx5IEJ1bGtFZGl0VGl0bGUgPSBuZXcgTWVudUlkKCdCdWxrRWRpdFRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBCdWxrRWRpdENvbnRleHQgPSBuZXcgTWVudUlkKCdCdWxrRWRpdENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRpbWVsaW5lSXRlbUNvbnRleHQgPSBuZXcgTWVudUlkKCdUaW1lbGluZUl0ZW1Db250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUaW1lbGluZVRpdGxlID0gbmV3IE1lbnVJZCgnVGltZWxpbmVUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGltZWxpbmVUaXRsZUNvbnRleHQgPSBuZXcgTWVudUlkKCdUaW1lbGluZVRpdGxlQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGltZWxpbmVGaWx0ZXJTdWJNZW51ID0gbmV3IE1lbnVJZCgnVGltZWxpbmVGaWx0ZXJTdWJNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBBY2NvdW50c0NvbnRleHQgPSBuZXcgTWVudUlkKCdBY2NvdW50c0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFNpZGViYXJUaXRsZSA9IG5ldyBNZW51SWQoJ1NpZGViYXJUaXRsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgUGFuZWxUaXRsZSA9IG5ldyBNZW51SWQoJ1BhbmVsVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEF1eGlsaWFyeUJhclRpdGxlID0gbmV3IE1lbnVJZCgnQXV4aWxpYXJ5QmFyVGl0bGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlcm1pbmFsSW5zdGFuY2VDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGVybWluYWxJbnN0YW5jZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlcm1pbmFsRWRpdG9ySW5zdGFuY2VDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGVybWluYWxFZGl0b3JJbnN0YW5jZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlcm1pbmFsTmV3RHJvcGRvd25Db250ZXh0ID0gbmV3IE1lbnVJZCgnVGVybWluYWxOZXdEcm9wZG93bkNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFRlcm1pbmFsVGFiQ29udGV4dCA9IG5ldyBNZW51SWQoJ1Rlcm1pbmFsVGFiQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgVGVybWluYWxUYWJFbXB0eUFyZWFDb250ZXh0ID0gbmV3IE1lbnVJZCgnVGVybWluYWxUYWJFbXB0eUFyZWFDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBUZXJtaW5hbFN0aWNreVNjcm9sbENvbnRleHQgPSBuZXcgTWVudUlkKCdUZXJtaW5hbFN0aWNreVNjcm9sbENvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IFdlYnZpZXdDb250ZXh0ID0gbmV3IE1lbnVJZCgnV2Vidmlld0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IElubGluZUNvbXBsZXRpb25zQWN0aW9ucyA9IG5ldyBNZW51SWQoJ0lubGluZUNvbXBsZXRpb25zQWN0aW9ucycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW5saW5lRWRpdHNBY3Rpb25zID0gbmV3IE1lbnVJZCgnSW5saW5lRWRpdHNBY3Rpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBOZXdGaWxlID0gbmV3IE1lbnVJZCgnTmV3RmlsZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVyZ2VJbnB1dDFUb29sYmFyID0gbmV3IE1lbnVJZCgnTWVyZ2VUb29sYmFyMVRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IE1lcmdlSW5wdXQyVG9vbGJhciA9IG5ldyBNZW51SWQoJ01lcmdlVG9vbGJhcjJUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBNZXJnZUJhc2VUb29sYmFyID0gbmV3IE1lbnVJZCgnTWVyZ2VCYXNlVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTWVyZ2VJbnB1dFJlc3VsdFRvb2xiYXIgPSBuZXcgTWVudUlkKCdNZXJnZVRvb2xiYXJSZXN1bHRUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBJbmxpbmVTdWdnZXN0aW9uVG9vbGJhciA9IG5ldyBNZW51SWQoJ0lubGluZVN1Z2dlc3Rpb25Ub29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBJbmxpbmVFZGl0VG9vbGJhciA9IG5ldyBNZW51SWQoJ0lubGluZUVkaXRUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0Q29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0Q29kZUJsb2NrID0gbmV3IE1lbnVJZCgnQ2hhdENvZGVibG9jaycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdENvbXBhcmVCbG9jayA9IG5ldyBNZW51SWQoJ0NoYXRDb21wYXJlQmxvY2snKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRNZXNzYWdlVGl0bGUgPSBuZXcgTWVudUlkKCdDaGF0TWVzc2FnZVRpdGxlJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0V2VsY29tZUNvbnRleHQgPSBuZXcgTWVudUlkKCdDaGF0V2VsY29tZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRNZXNzYWdlRm9vdGVyID0gbmV3IE1lbnVJZCgnQ2hhdE1lc3NhZ2VGb290ZXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRTdWJhZ2VudENvbnRlbnQgPSBuZXcgTWVudUlkKCdDaGF0U3ViYWdlbnRDb250ZW50Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RXhlY3V0ZSA9IG5ldyBNZW51SWQoJ0NoYXRFeGVjdXRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RXhlY3V0ZVF1ZXVlID0gbmV3IE1lbnVJZCgnQ2hhdEV4ZWN1dGVRdWV1ZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdElucHV0ID0gbmV3IE1lbnVJZCgnQ2hhdElucHV0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0SW5wdXRTZWNvbmRhcnkgPSBuZXcgTWVudUlkKCdDaGF0SW5wdXRTZWNvbmRhcnknKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRJbnB1dFN0YXR1cyA9IG5ldyBNZW51SWQoJ0NoYXRJbnB1dFN0YXR1cycpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdElucHV0U2lkZSA9IG5ldyBNZW51SWQoJ0NoYXRJbnB1dFNpZGUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEF1dG9tYXRpb25zRGlhbG9nSW5wdXQgPSBuZXcgTWVudUlkKCdBdXRvbWF0aW9uc0RpYWxvZ0lucHV0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0TW9kZVBpY2tlciA9IG5ldyBNZW51SWQoJ0NoYXRNb2RlUGlja2VyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdGluZ1dpZGdldFRvb2xiYXIgPSBuZXcgTWVudUlkKCdDaGF0RWRpdGluZ1dpZGdldFRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNUb29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc1Rvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0aW5nU2Vzc2lvblRpdGxlVG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nU2Vzc2lvblRpdGxlVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc1ZlcnNpb25zU3VibWVudSA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNWZXJzaW9uc1N1Ym1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNGaWxlSGVhZGVyVG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNGaWxlSGVhZGVyVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdTZXNzaW9uQ2hhbmdlc0ZpbGVIZWFkZXJSaWdodFRvb2xiYXIgPSBuZXcgTWVudUlkKCdDaGF0RWRpdGluZ1Nlc3Npb25DaGFuZ2VzRmlsZUhlYWRlclJpZ2h0VG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdFZGl0b3JDb250ZW50ID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRpbmdFZGl0b3JDb250ZW50Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdGluZ0VkaXRvckh1bmsgPSBuZXcgTWVudUlkKCdDaGF0RWRpdGluZ0VkaXRvckh1bmsnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0aW5nRGVsZXRlZE5vdGVib29rQ2VsbCA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nRGVsZXRlZE5vdGVib29rQ2VsbCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdElucHV0QXR0YWNobWVudFRvb2xiYXIgPSBuZXcgTWVudUlkKCdDaGF0SW5wdXRBdHRhY2htZW50VG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRpbmdXaWRnZXRNb2RpZmllZEZpbGVzVG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nV2lkZ2V0TW9kaWZpZWRGaWxlc1Rvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRJbnB1dFJlc291cmNlQXR0YWNobWVudENvbnRleHQgPSBuZXcgTWVudUlkKCdDaGF0SW5wdXRSZXNvdXJjZUF0dGFjaG1lbnRDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0SW5wdXRTeW1ib2xBdHRhY2htZW50Q29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRJbnB1dFN5bWJvbEF0dGFjaG1lbnRDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0SW5saW5lUmVzb3VyY2VBbmNob3JDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ2hhdElubGluZVJlc291cmNlQW5jaG9yQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdElubGluZVN5bWJvbEFuY2hvckNvbnRleHQgPSBuZXcgTWVudUlkKCdDaGF0SW5saW5lU3ltYm9sQW5jaG9yQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdE1lc3NhZ2VDaGVja3BvaW50OiBNZW51SWQgPSBuZXcgTWVudUlkKCdDaGF0TWVzc2FnZUNoZWNrcG9pbnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRNZXNzYWdlUmVzdG9yZUNoZWNrcG9pbnQ6IE1lbnVJZCA9IG5ldyBNZW51SWQoJ0NoYXRNZXNzYWdlUmVzdG9yZUNoZWNrcG9pbnQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXROZXdNZW51ID0gbmV3IE1lbnVJZCgnQ2hhdE5ld01lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0aW5nQ29kZUJsb2NrQ29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRFZGl0aW5nQ29kZUJsb2NrQ29udGV4dCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdFRpdGxlQmFyTWVudSA9IG5ldyBNZW51SWQoJ0NoYXRUaXRsZUJhck1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRBdHRhY2htZW50c0NvbnRleHQgPSBuZXcgTWVudUlkKCdDaGF0QXR0YWNobWVudHNDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0VGlwQ29udGV4dCA9IG5ldyBNZW51SWQoJ0NoYXRUaXBDb250ZXh0Jyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0VGlwVG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRUaXBUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0VG9vbE91dHB1dFJlc291cmNlVG9vbGJhciA9IG5ldyBNZW51SWQoJ0NoYXRUb29sT3V0cHV0UmVzb3VyY2VUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0VGV4dEVkaXRvck1lbnUgPSBuZXcgTWVudUlkKCdDaGF0VGV4dEVkaXRvck1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRUb29sT3V0cHV0UmVzb3VyY2VDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ2hhdFRvb2xPdXRwdXRSZXNvdXJjZUNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRNdWx0aURpZmZDb250ZXh0ID0gbmV3IE1lbnVJZCgnQ2hhdE11bHRpRGlmZkNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRDb25maXJtYXRpb25NZW51ID0gbmV3IE1lbnVJZCgnQ2hhdENvbmZpcm1hdGlvbk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IENoYXRFZGl0b3JJbmxpbmVNZW51ID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRvcklubGluZUd1dHRlcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdEVkaXRvcklubGluZUV4ZWN1dGUgPSBuZXcgTWVudUlkKCdDaGF0RWRpdG9ySW5wdXRFeGVjdXRlJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0RWRpdG9ySW5saW5lSW5wdXRTaWRlID0gbmV3IE1lbnVJZCgnQ2hhdEVkaXRvcklucHV0U2lkZScpO1xuXHRzdGF0aWMgcmVhZG9ubHkgSW5saW5lQ2hhdEVkaXRvckFmZm9yZGFuY2UgPSBuZXcgTWVudUlkKCdJbmxpbmVDaGF0RWRpdG9yQWZmb3JkYW5jZScpO1xuXG5cdHN0YXRpYyByZWFkb25seSBBY2Nlc3NpYmxlVmlldyA9IG5ldyBNZW51SWQoJ0FjY2Vzc2libGVWaWV3Jyk7XG5cdHN0YXRpYyByZWFkb25seSBNdWx0aURpZmZFZGl0b3JDb250ZW50ID0gbmV3IE1lbnVJZCgnTXVsdGlEaWZmRWRpdG9yQ29udGVudCcpO1xuXHRzdGF0aWMgcmVhZG9ubHkgTXVsdGlEaWZmRWRpdG9yRmlsZVRvb2xiYXIgPSBuZXcgTWVudUlkKCdNdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgRGlmZkVkaXRvckh1bmtUb29sYmFyID0gbmV3IE1lbnVJZCgnRGlmZkVkaXRvckh1bmtUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBEaWZmRWRpdG9yU2VsZWN0aW9uVG9vbGJhciA9IG5ldyBNZW51SWQoJ0RpZmZFZGl0b3JTZWxlY3Rpb25Ub29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBCcm93c2VyTmF2aWdhdGlvblRvb2xiYXIgPSBuZXcgTWVudUlkKCdCcm93c2VyTmF2aWdhdGlvblRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IEJyb3dzZXJBY3Rpb25zVG9vbGJhciA9IG5ldyBNZW51SWQoJ0Jyb3dzZXJBY3Rpb25zVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQnJvd3NlckNoYXRBY3Rpb25zTWVudSA9IG5ldyBNZW51SWQoJ0Jyb3dzZXJDaGF0QWN0aW9uc01lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEJyb3dzZXJFbXVsYXRpb25Ub29sYmFyID0gbmV3IE1lbnVJZCgnQnJvd3NlckVtdWxhdGlvblRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50U2Vzc2lvbnNWaWV3ZXJGaWx0ZXJTdWJNZW51ID0gbmV3IE1lbnVJZCgnQWdlbnRTZXNzaW9uc1ZpZXdlckZpbHRlclN1Yk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50U2Vzc2lvbnNDb250ZXh0ID0gbmV3IE1lbnVJZCgnQWdlbnRTZXNzaW9uc0NvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50U2Vzc2lvblNlY3Rpb25Db250ZXh0ID0gbmV3IE1lbnVJZCgnQWdlbnRTZXNzaW9uU2VjdGlvbkNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50U2Vzc2lvbnNDcmVhdGVTdWJNZW51ID0gbmV3IE1lbnVJZCgnQWdlbnRTZXNzaW9uc0NyZWF0ZVN1Yk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50U2Vzc2lvbnNUb29sYmFyID0gbmV3IE1lbnVJZCgnQWdlbnRTZXNzaW9uc1Rvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50U2Vzc2lvbkl0ZW1Ub29sYmFyID0gbmV3IE1lbnVJZCgnQWdlbnRTZXNzaW9uSXRlbVRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50U2Vzc2lvblNlY3Rpb25Ub29sYmFyID0gbmV3IE1lbnVJZCgnQWdlbnRTZXNzaW9uU2VjdGlvblRvb2xiYXInKTtcblx0c3RhdGljIHJlYWRvbmx5IFNlc3Npb25JdGVtQ29udGV4dE1lbnUgPSBuZXcgTWVudUlkKCdTZXNzaW9uSXRlbUNvbnRleHRNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBTZXNzaW9uSGVhZGVyQ29udGV4dCA9IG5ldyBNZW51SWQoJ1Nlc3Npb25zU2Vzc2lvbkhlYWRlckNvbnRleHQnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50c1RpdGxlQmFyQ29udHJvbE1lbnUgPSBuZXcgTWVudUlkKCdBZ2VudHNUaXRsZUJhckNvbnRyb2xNZW51Jyk7XG5cdHN0YXRpYyByZWFkb25seSBBZ2VudHNDaGFuZ2VzVG9vbGJhciA9IG5ldyBNZW51SWQoJ0FnZW50c0NoYW5nZXNUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBBZ2VudHNDaGFuZ2VzUHJpbWFyeUFjdGlvblN1Yk1lbnUgPSBuZXcgTWVudUlkKCdBZ2VudHNDaGFuZ2VzUHJpbWFyeUFjdGlvblN1Yk1lbnUnKTtcblx0c3RhdGljIHJlYWRvbmx5IEFnZW50c0NoYW5nZUlubGluZVRvb2xiYXIgPSBuZXcgTWVudUlkKCdBZ2VudHNDaGFuZ2VJbmxpbmVUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0Vmlld1Nlc3Npb25UaXRsZU5hdmlnYXRpb25Ub29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdFZpZXdTZXNzaW9uVGl0bGVOYXZpZ2F0aW9uVG9vbGJhcicpO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ2hhdFZpZXdTZXNzaW9uVGl0bGVUb29sYmFyID0gbmV3IE1lbnVJZCgnQ2hhdFZpZXdTZXNzaW9uVGl0bGVUb29sYmFyJyk7XG5cdHN0YXRpYyByZWFkb25seSBDaGF0Q29udGV4dFVzYWdlQWN0aW9ucyA9IG5ldyBNZW51SWQoJ0NoYXRDb250ZXh0VXNhZ2VBY3Rpb25zJyk7XG5cdHN0YXRpYyByZWFkb25seSBNYXJrZXJIb3ZlclN0YXR1c0JhciA9IG5ldyBNZW51SWQoJ01hcmtlckhvdmVyUGFydGljaXBhbnQuU3RhdHVzQmFyJyk7XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBvciByZXVzZSBhIGBNZW51SWRgIHdpdGggdGhlIGdpdmVuIGlkZW50aWZpZXJcblx0ICovXG5cdHN0YXRpYyBmb3IoaWRlbnRpZmllcjogc3RyaW5nKTogTWVudUlkIHtcblx0XHRyZXR1cm4gTWVudUlkLl9pbnN0YW5jZXMuZ2V0KGlkZW50aWZpZXIpID8/IG5ldyBNZW51SWQoaWRlbnRpZmllcik7XG5cdH1cblxuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgYE1lbnVJZGAgd2l0aCB0aGUgdW5pcXVlIGlkZW50aWZpZXIuIFdpbGwgdGhyb3cgaWYgYSBtZW51XG5cdCAqIHdpdGggdGhlIGlkZW50aWZpZXIgYWxyZWFkeSBleGlzdHMsIHVzZSBgTWVudUlkLmZvcihpZGVudClgIG9yIGEgdW5pcXVlXG5cdCAqIGlkZW50aWZpZXJcblx0ICovXG5cdGNvbnN0cnVjdG9yKGlkZW50aWZpZXI6IHN0cmluZykge1xuXHRcdGlmIChNZW51SWQuX2luc3RhbmNlcy5oYXMoaWRlbnRpZmllcikpIHtcblx0XHRcdHRocm93IG5ldyBUeXBlRXJyb3IoYE1lbnVJZCB3aXRoIGlkZW50aWZpZXIgJyR7aWRlbnRpZmllcn0nIGFscmVhZHkgZXhpc3RzLiBVc2UgTWVudUlkLmZvcihpZGVudCkgb3IgYSB1bmlxdWUgaWRlbnRpZmllcmApO1xuXHRcdH1cblx0XHRNZW51SWQuX2luc3RhbmNlcy5zZXQoaWRlbnRpZmllciwgdGhpcyk7XG5cdFx0dGhpcy5pZCA9IGlkZW50aWZpZXI7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVudUFjdGlvbk9wdGlvbnMge1xuXHRhcmc/OiB1bmtub3duO1xuXHRhcmdzPzogdW5rbm93bltdO1xuXHRzaG91bGRGb3J3YXJkQXJncz86IGJvb2xlYW47XG5cdHJlbmRlclNob3J0VGl0bGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51Q2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBtZW51OiBJTWVudTtcblx0cmVhZG9ubHkgaXNTdHJ1Y3R1cmFsQ2hhbmdlOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1RvZ2dsZUNoYW5nZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNFbmFibGVtZW50Q2hhbmdlOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51IGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8SU1lbnVDaGFuZ2VFdmVudD47XG5cdGdldEFjdGlvbnMob3B0aW9ucz86IElNZW51QWN0aW9uT3B0aW9ucyk6IFtzdHJpbmcsIEFycmF5PE1lbnVJdGVtQWN0aW9uIHwgU3VibWVudUl0ZW1BY3Rpb24+XVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51RGF0YSB7XG5cdGNvbnRleHRzOiBSZWFkb25seVNldDxzdHJpbmc+O1xuXHRhY3Rpb25zOiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXTtcbn1cblxuZXhwb3J0IGNvbnN0IElNZW51U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJTWVudVNlcnZpY2U+KCdtZW51U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51Q3JlYXRlT3B0aW9ucyB7XG5cdGVtaXRFdmVudHNGb3JTdWJtZW51Q2hhbmdlcz86IGJvb2xlYW47XG5cdGV2ZW50RGVib3VuY2VEZWxheT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWVudVNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQ29uc2lkZXIgdXNpbmcgZ2V0TWVudUFjdGlvbnMgaWYgeW91IGRvbid0IG5lZWQgdG8gbGlzdGVuIHRvIGV2ZW50cy5cblx0ICpcblx0ICogQ3JlYXRlIGEgbmV3IG1lbnUgZm9yIHRoZSBnaXZlbiBtZW51IGlkZW50aWZpZXIuIEEgbWVudSBzZW5kcyBldmVudHMgd2hlbiBpdCdzIGVudHJpZXNcblx0ICogaGF2ZSBjaGFuZ2VkIChwbGFjZW1lbnQsIGVuYWJsZW1lbnQsIGNoZWNrZWQtc3RhdGUpLiBCeSBkZWZhdWx0IGl0IGRvZXMgbm90IHNlbmQgZXZlbnRzIGZvclxuXHQgKiBzdWJtZW51IGVudHJpZXMuIFRoYXQgaXMgbW9yZSBleHBlbnNpdmUgYW5kIG11c3QgYmUgZXhwbGljaXRseSBlbmFibGVkIHdpdGggdGhlXG5cdCAqIGBlbWl0RXZlbnRzRm9yU3VibWVudUNoYW5nZXNgIGZsYWcuXG5cdCAqL1xuXHRjcmVhdGVNZW51KGlkOiBNZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIG9wdGlvbnM/OiBJTWVudUNyZWF0ZU9wdGlvbnMpOiBJTWVudTtcblxuXHQvKipcblx0ICogQ3JlYXRlcyBhIG5ldyBtZW51LCBnZXRzIHRoZSBhY3Rpb25zLCBhbmQgdGhlbiBkaXNwb3NlcyBvZiB0aGUgbWVudS5cblx0ICovXG5cdGdldE1lbnVBY3Rpb25zKGlkOiBNZW51SWQsIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIG9wdGlvbnM/OiBJTWVudUFjdGlvbk9wdGlvbnMpOiBbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXTtcblxuXHQvKipcblx0ICogR2V0cyB0aGUgbmFtZXMgb2YgdGhlIGNvbnRleHRzIHRoYXQgdGhpcyBtZW51IGxpc3RlbnMgb24uXG5cdCAqL1xuXHRnZXRNZW51Q29udGV4dHMoaWQ6IE1lbnVJZCk6IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cblx0LyoqXG5cdCAqIFJlc2V0ICoqYWxsKiogbWVudSBpdGVtIGhpZGRlbiBzdGF0ZXMuXG5cdCAqL1xuXHRyZXNldEhpZGRlblN0YXRlcygpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZXNldCB0aGUgbWVudSdzIGhpZGRlbiBzdGF0ZXMuXG5cdCAqL1xuXHRyZXNldEhpZGRlblN0YXRlcyhtZW51SWRzOiByZWFkb25seSBNZW51SWRbXSB8IHVuZGVmaW5lZCk6IHZvaWQ7XG59XG5cbnR5cGUgSUNvbW1hbmRzTWFwID0gTWFwPHN0cmluZywgSUNvbW1hbmRBY3Rpb24+O1xuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51UmVnaXN0cnlDaGFuZ2VFdmVudCB7XG5cdGhhcyhpZDogTWVudUlkKTogYm9vbGVhbjtcbn1cblxuY2xhc3MgTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQge1xuXG5cdHByaXZhdGUgc3RhdGljIF9hbGwgPSBuZXcgTWFwPE1lbnVJZCwgTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQ+KCk7XG5cblx0c3RhdGljIGZvcihpZDogTWVudUlkKTogTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQge1xuXHRcdGxldCB2YWx1ZSA9IHRoaXMuX2FsbC5nZXQoaWQpO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHZhbHVlID0gbmV3IE1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50KGlkKTtcblx0XHRcdHRoaXMuX2FsbC5zZXQoaWQsIHZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0c3RhdGljIG1lcmdlKGV2ZW50czogSU1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50W10pOiBJTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQge1xuXHRcdGNvbnN0IGlkcyA9IG5ldyBTZXQ8TWVudUlkPigpO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBldmVudHMpIHtcblx0XHRcdGlmIChpdGVtIGluc3RhbmNlb2YgTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQpIHtcblx0XHRcdFx0aWRzLmFkZChpdGVtLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGlkcztcblx0fVxuXG5cdHJlYWRvbmx5IGhhczogKGlkOiBNZW51SWQpID0+IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGlkOiBNZW51SWQpIHtcblx0XHR0aGlzLmhhcyA9IGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUgPT09IGlkO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lbnVSZWdpc3RyeSB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWVudTogRXZlbnQ8SU1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50Pjtcblx0YWRkQ29tbWFuZCh1c2VyQ29tbWFuZDogSUNvbW1hbmRBY3Rpb24pOiBJRGlzcG9zYWJsZTtcblx0Z2V0Q29tbWFuZChpZDogc3RyaW5nKTogSUNvbW1hbmRBY3Rpb24gfCB1bmRlZmluZWQ7XG5cdGdldENvbW1hbmRzKCk6IElDb21tYW5kc01hcDtcblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIGBhcHBlbmRNZW51SXRlbWAgb3IgbW9zdCBsaWtlbHkgdXNlIGByZWdpc3RlckFjdGlvbjJgIGluc3RlYWQuIFRoZXJlIHNob3VsZCBiZSBubyBzdHJvbmdcblx0ICogcmVhc29uIHRvIHVzZSB0aGlzIGRpcmVjdGx5LlxuXHQgKi9cblx0YXBwZW5kTWVudUl0ZW1zKGl0ZW1zOiBJdGVyYWJsZTx7IGlkOiBNZW51SWQ7IGl0ZW06IElNZW51SXRlbSB8IElTdWJtZW51SXRlbSB9Pik6IElEaXNwb3NhYmxlO1xuXHRhcHBlbmRNZW51SXRlbShtZW51OiBNZW51SWQsIGl0ZW06IElNZW51SXRlbSB8IElTdWJtZW51SXRlbSk6IElEaXNwb3NhYmxlO1xuXHRnZXRNZW51SXRlbXMobG9jOiBNZW51SWQpOiBBcnJheTxJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0+O1xufVxuXG5leHBvcnQgY29uc3QgTWVudVJlZ2lzdHJ5OiBJTWVudVJlZ2lzdHJ5ID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSU1lbnVSZWdpc3RyeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZHMgPSBuZXcgTWFwPHN0cmluZywgSUNvbW1hbmRBY3Rpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnVJdGVtcyA9IG5ldyBNYXA8TWVudUlkLCBMaW5rZWRMaXN0PElNZW51SXRlbSB8IElTdWJtZW51SXRlbT4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTWVudSA9IG5ldyBNaWNyb3Rhc2tFbWl0dGVyPElNZW51UmVnaXN0cnlDaGFuZ2VFdmVudD4oe1xuXHRcdG1lcmdlOiBNZW51UmVnaXN0cnlDaGFuZ2VFdmVudC5tZXJnZVxuXHR9KTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZU1lbnU6IEV2ZW50PElNZW51UmVnaXN0cnlDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZU1lbnUuZXZlbnQ7XG5cblx0YWRkQ29tbWFuZChjb21tYW5kOiBJQ29tbWFuZEFjdGlvbik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9jb21tYW5kcy5zZXQoY29tbWFuZC5pZCwgY29tbWFuZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNZW51LmZpcmUoTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQuZm9yKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSkpO1xuXG5cdFx0cmV0dXJuIG1hcmtBc1NpbmdsZXRvbih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1hbmRzLmRlbGV0ZShjb21tYW5kLmlkKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1lbnUuZmlyZShNZW51UmVnaXN0cnlDaGFuZ2VFdmVudC5mb3IoTWVudUlkLkNvbW1hbmRQYWxldHRlKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0Q29tbWFuZChpZDogc3RyaW5nKTogSUNvbW1hbmRBY3Rpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb21tYW5kcy5nZXQoaWQpO1xuXHR9XG5cblx0Z2V0Q29tbWFuZHMoKTogSUNvbW1hbmRzTWFwIHtcblx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgSUNvbW1hbmRBY3Rpb24+KCk7XG5cdFx0dGhpcy5fY29tbWFuZHMuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4gbWFwLnNldChrZXksIHZhbHVlKSk7XG5cdFx0cmV0dXJuIG1hcDtcblx0fVxuXG5cdGFwcGVuZE1lbnVJdGVtKGlkOiBNZW51SWQsIGl0ZW06IElNZW51SXRlbSB8IElTdWJtZW51SXRlbSk6IElEaXNwb3NhYmxlIHtcblx0XHRsZXQgbGlzdCA9IHRoaXMuX21lbnVJdGVtcy5nZXQoaWQpO1xuXHRcdGlmICghbGlzdCkge1xuXHRcdFx0bGlzdCA9IG5ldyBMaW5rZWRMaXN0KCk7XG5cdFx0XHR0aGlzLl9tZW51SXRlbXMuc2V0KGlkLCBsaXN0KTtcblx0XHR9XG5cdFx0Y29uc3Qgcm0gPSBsaXN0LnB1c2goaXRlbSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNZW51LmZpcmUoTWVudVJlZ2lzdHJ5Q2hhbmdlRXZlbnQuZm9yKGlkKSk7XG5cdFx0cmV0dXJuIG1hcmtBc1NpbmdsZXRvbih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0cm0oKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTWVudS5maXJlKE1lbnVSZWdpc3RyeUNoYW5nZUV2ZW50LmZvcihpZCkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGFwcGVuZE1lbnVJdGVtcyhpdGVtczogSXRlcmFibGU8eyBpZDogTWVudUlkOyBpdGVtOiBJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0gfT4pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGZvciAoY29uc3QgeyBpZCwgaXRlbSB9IG9mIGl0ZW1zKSB7XG5cdFx0XHRyZXN1bHQuYWRkKHRoaXMuYXBwZW5kTWVudUl0ZW0oaWQsIGl0ZW0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldE1lbnVJdGVtcyhpZDogTWVudUlkKTogQXJyYXk8SU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtPiB7XG5cdFx0bGV0IHJlc3VsdDogQXJyYXk8SU1lbnVJdGVtIHwgSVN1Ym1lbnVJdGVtPjtcblx0XHRpZiAodGhpcy5fbWVudUl0ZW1zLmhhcyhpZCkpIHtcblx0XHRcdHJlc3VsdCA9IFsuLi50aGlzLl9tZW51SXRlbXMuZ2V0KGlkKSFdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXN1bHQgPSBbXTtcblx0XHR9XG5cdFx0aWYgKGlkID09PSBNZW51SWQuQ29tbWFuZFBhbGV0dGUpIHtcblx0XHRcdC8vIENvbW1hbmRQYWxldHRlIGlzIHNwZWNpYWwgYmVjYXVzZSBpdCBzaG93c1xuXHRcdFx0Ly8gYWxsIGNvbW1hbmRzIGJ5IGRlZmF1bHRcblx0XHRcdHRoaXMuX2FwcGVuZEltcGxpY2l0SXRlbXMocmVzdWx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGVuZEltcGxpY2l0SXRlbXMocmVzdWx0OiBBcnJheTxJTWVudUl0ZW0gfCBJU3VibWVudUl0ZW0+KSB7XG5cdFx0Y29uc3Qgc2V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVzdWx0KSB7XG5cdFx0XHRpZiAoaXNJTWVudUl0ZW0oaXRlbSkpIHtcblx0XHRcdFx0c2V0LmFkZChpdGVtLmNvbW1hbmQuaWQpO1xuXHRcdFx0XHRpZiAoaXRlbS5hbHQpIHtcblx0XHRcdFx0XHRzZXQuYWRkKGl0ZW0uYWx0LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9jb21tYW5kcy5mb3JFYWNoKChjb21tYW5kLCBpZCkgPT4ge1xuXHRcdFx0aWYgKCFzZXQuaGFzKGlkKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IGNvbW1hbmQgfSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn07XG5cbmV4cG9ydCBjbGFzcyBTdWJtZW51SXRlbUFjdGlvbiBleHRlbmRzIFN1Ym1lbnVBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGl0ZW06IElTdWJtZW51SXRlbSxcblx0XHRyZWFkb25seSBoaWRlQWN0aW9uczogSU1lbnVJdGVtSGlkZSB8IHVuZGVmaW5lZCxcblx0XHRhY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10sXG5cdCkge1xuXHRcdHN1cGVyKGBzdWJtZW51aXRlbS4ke2l0ZW0uc3VibWVudS5pZH1gLCB0eXBlb2YgaXRlbS50aXRsZSA9PT0gJ3N0cmluZycgPyBpdGVtLnRpdGxlIDogaXRlbS50aXRsZS52YWx1ZSwgYWN0aW9ucywgJ3N1Ym1lbnUnKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNZW51SXRlbUhpZGUge1xuXHRyZWFkb25seSBpc0hpZGRlbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGlkZTogSUFjdGlvbjtcblx0cmVhZG9ubHkgdG9nZ2xlOiBJQWN0aW9uO1xufVxuXG4vLyBpbXBsZW1lbnRzIElBY3Rpb24sIGRvZXMgTk9UIGV4dGVuZCBBY3Rpb24sIHNvIHRoYXQgbm8gb25lXG4vLyBzdWJzY3JpYmVzIHRvIGV2ZW50cyBvZiBBY3Rpb24gb3IgbW9kaWZpZWQgcHJvcGVydGllc1xuZXhwb3J0IGNsYXNzIE1lbnVJdGVtQWN0aW9uIGltcGxlbWVudHMgSUFjdGlvbiB7XG5cblx0c3RhdGljIGxhYmVsKGFjdGlvbjogSUNvbW1hbmRBY3Rpb24sIG9wdGlvbnM/OiBJTWVudUFjdGlvbk9wdGlvbnMpOiBzdHJpbmcge1xuXHRcdHJldHVybiBvcHRpb25zPy5yZW5kZXJTaG9ydFRpdGxlICYmIGFjdGlvbi5zaG9ydFRpdGxlXG5cdFx0XHQ/ICh0eXBlb2YgYWN0aW9uLnNob3J0VGl0bGUgPT09ICdzdHJpbmcnID8gYWN0aW9uLnNob3J0VGl0bGUgOiBhY3Rpb24uc2hvcnRUaXRsZS52YWx1ZSlcblx0XHRcdDogKHR5cGVvZiBhY3Rpb24udGl0bGUgPT09ICdzdHJpbmcnID8gYWN0aW9uLnRpdGxlIDogYWN0aW9uLnRpdGxlLnZhbHVlKTtcblx0fVxuXG5cdHJlYWRvbmx5IGl0ZW06IElDb21tYW5kQWN0aW9uO1xuXHRyZWFkb25seSBhbHQ6IE1lbnVJdGVtQWN0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IElNZW51QWN0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sdGlwOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNsYXNzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGVuYWJsZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNoZWNrZWQ/OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGl0ZW06IElDb21tYW5kQWN0aW9uLFxuXHRcdGFsdDogSUNvbW1hbmRBY3Rpb24gfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogSU1lbnVBY3Rpb25PcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGhpZGVBY3Rpb25zOiBJTWVudUl0ZW1IaWRlIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IG1lbnVLZXliaW5kaW5nOiBJQWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5pZCA9IGl0ZW0uaWQ7XG5cdFx0dGhpcy5sYWJlbCA9IE1lbnVJdGVtQWN0aW9uLmxhYmVsKGl0ZW0sIG9wdGlvbnMpO1xuXHRcdHRoaXMudG9vbHRpcCA9ICh0eXBlb2YgaXRlbS50b29sdGlwID09PSAnc3RyaW5nJyA/IGl0ZW0udG9vbHRpcCA6IGl0ZW0udG9vbHRpcD8udmFsdWUpID8/ICcnO1xuXHRcdHRoaXMuZW5hYmxlZCA9ICFpdGVtLnByZWNvbmRpdGlvbiB8fCBjb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKGl0ZW0ucHJlY29uZGl0aW9uKTtcblx0XHR0aGlzLmNoZWNrZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRsZXQgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGl0ZW0udG9nZ2xlZCkge1xuXHRcdFx0Y29uc3QgdG9nZ2xlZCA9ICgoaXRlbS50b2dnbGVkIGFzIHsgY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB9KS5jb25kaXRpb24gPyBpdGVtLnRvZ2dsZWQgOiB7IGNvbmRpdGlvbjogaXRlbS50b2dnbGVkIH0pIGFzIHtcblx0XHRcdFx0Y29uZGl0aW9uOiBDb250ZXh0S2V5RXhwcmVzc2lvbjsgaWNvbj86IEljb247IHRvb2x0aXA/OiBzdHJpbmcgfCBJTG9jYWxpemVkU3RyaW5nOyB0aXRsZT86IHN0cmluZyB8IElMb2NhbGl6ZWRTdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5jaGVja2VkID0gY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh0b2dnbGVkLmNvbmRpdGlvbik7XG5cdFx0XHRpZiAodGhpcy5jaGVja2VkICYmIHRvZ2dsZWQudG9vbHRpcCkge1xuXHRcdFx0XHR0aGlzLnRvb2x0aXAgPSB0eXBlb2YgdG9nZ2xlZC50b29sdGlwID09PSAnc3RyaW5nJyA/IHRvZ2dsZWQudG9vbHRpcCA6IHRvZ2dsZWQudG9vbHRpcC52YWx1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuY2hlY2tlZCAmJiBUaGVtZUljb24uaXNUaGVtZUljb24odG9nZ2xlZC5pY29uKSkge1xuXHRcdFx0XHRpY29uID0gdG9nZ2xlZC5pY29uO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5jaGVja2VkICYmIHRvZ2dsZWQudGl0bGUpIHtcblx0XHRcdFx0dGhpcy5sYWJlbCA9IHR5cGVvZiB0b2dnbGVkLnRpdGxlID09PSAnc3RyaW5nJyA/IHRvZ2dsZWQudGl0bGUgOiB0b2dnbGVkLnRpdGxlLnZhbHVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaWNvbikge1xuXHRcdFx0aWNvbiA9IFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpdGVtLmljb24pID8gaXRlbS5pY29uIDogdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRoaXMuaXRlbSA9IGl0ZW07XG5cdFx0dGhpcy5hbHQgPSBhbHQgPyBuZXcgTWVudUl0ZW1BY3Rpb24oYWx0LCB1bmRlZmluZWQsIG9wdGlvbnMsIGhpZGVBY3Rpb25zLCB1bmRlZmluZWQsIGNvbnRleHRLZXlTZXJ2aWNlLCBfY29tbWFuZFNlcnZpY2UpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMuY2xhc3MgPSBpY29uICYmIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uKTtcblxuXHR9XG5cblx0cnVuKC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBydW5BcmdzOiB1bmtub3duW10gPSBbXTtcblxuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5hcmdzKSB7XG5cdFx0XHRydW5BcmdzID0gWy4uLnJ1bkFyZ3MsIC4uLnRoaXMuX29wdGlvbnMuYXJnc107XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9vcHRpb25zPy5hcmcpIHtcblx0XHRcdHJ1bkFyZ3MgPSBbLi4ucnVuQXJncywgdGhpcy5fb3B0aW9ucy5hcmddO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5zaG91bGRGb3J3YXJkQXJncykge1xuXHRcdFx0cnVuQXJncyA9IFsuLi5ydW5BcmdzLCAuLi5hcmdzXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQodGhpcy5pZCwgLi4ucnVuQXJncyk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIC0tLSBJQWN0aW9uMlxuXG50eXBlIE9uZU9yTjxUPiA9IFQgfCBUW107XG5cbmludGVyZmFjZSBJQWN0aW9uMkNvbW1vbk9wdGlvbnMgZXh0ZW5kcyBJQ29tbWFuZEFjdGlvbiB7XG5cdC8qKlxuXHQgKiBPbmUgb3IgbWFueSBtZW51IGl0ZW1zLlxuXHQgKi9cblx0bWVudT86IE9uZU9yTjx7IGlkOiBNZW51SWQ7IHByZWNvbmRpdGlvbj86IG51bGwgfSAmIE9taXQ8SU1lbnVJdGVtLCAnY29tbWFuZCc+PjtcblxuXHQvKipcblx0ICogT25lIGtleWJpbmRpbmcuXG5cdCAqL1xuXHRrZXliaW5kaW5nPzogT25lT3JOPE9taXQ8SUtleWJpbmRpbmdSdWxlLCAnaWQnPj47XG59XG5cbmludGVyZmFjZSBJQmFzZUFjdGlvbjJPcHRpb25zIGV4dGVuZHMgSUFjdGlvbjJDb21tb25PcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhpcyB0eXBlIGlzIHVzZWQgd2hlbiBhbiBhY3Rpb24gaXMgbm90IGdvaW5nIHRvIHNob3cgdXAgaW4gdGhlIGNvbW1hbmQgcGFsZXR0ZS5cblx0ICogSW4gdGhhdCBjYXNlLCBpdCdzIGFibGUgdG8gdXNlIGEgc3RyaW5nIGZvciB0aGUgYHRpdGxlYCBhbmQgYGNhdGVnb3J5YCBwcm9wZXJ0aWVzLlxuXHQgKi9cblx0ZjE/OiBmYWxzZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tbWFuZFBhbGV0dGVPcHRpb25zIGV4dGVuZHMgSUFjdGlvbjJDb21tb25PcHRpb25zIHtcblxuXHQvKipcblx0ICogVGhlIHRpdGxlIG9mIHRoZSBjb21tYW5kIHRoYXQgd2lsbCBiZSBkaXNwbGF5ZWQgaW4gdGhlIGNvbW1hbmQgcGFsZXR0ZSBhZnRlciB0aGUgY2F0ZWdvcnkuXG5cdCAqICBUaGlzIG92ZXJyaWRlcyB7QGxpbmsgSUNvbW1hbmRBY3Rpb24udGl0bGV9IHRvIGVuc3VyZSBhIHN0cmluZyBpc24ndCB1c2VkIHNvIHRoYXQgdGhlIHRpdGxlXG5cdCAqICBpbmNsdWRlcyB0aGUgbG9jYWxpemVkIHZhbHVlIGFuZCB0aGUgb3JpZ2luYWwgdmFsdWUgZm9yIHVzZXJzIHVzaW5nIGxhbmd1YWdlIHBhY2tzLlxuXHQgKi9cblx0dGl0bGU6IElDb21tYW5kQWN0aW9uVGl0bGU7XG5cblx0LyoqXG5cdCAqIFRoZSBjYXRlZ29yeSBvZiB0aGUgY29tbWFuZCB0aGF0IHdpbGwgYmUgZGlzcGxheWVkIGluIHRoZSBjb21tYW5kIHBhbGV0dGUgYmVmb3JlIHRoZSB0aXRsZSBzdWZmaXhlZC5cblx0ICogd2l0aCBhIGNvbG9uIFRoaXMgb3ZlcnJpZGVzIHtAbGluayBJQ29tbWFuZEFjdGlvbi50aXRsZX0gdG8gZW5zdXJlIGEgc3RyaW5nIGlzbid0IHVzZWQgc28gdGhhdFxuXHQgKiB0aGUgdGl0bGUgaW5jbHVkZXMgdGhlIGxvY2FsaXplZCB2YWx1ZSBhbmQgdGhlIG9yaWdpbmFsIHZhbHVlIGZvciB1c2VycyB1c2luZyBsYW5ndWFnZSBwYWNrcy5cblx0ICovXG5cdGNhdGVnb3J5Pzoga2V5b2YgdHlwZW9mIENhdGVnb3JpZXMgfCBJTG9jYWxpemVkU3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBTaG9ydGhhbmQgdG8gYWRkIHRoaXMgY29tbWFuZCB0byB0aGUgY29tbWFuZCBwYWxldHRlLiBOb3RlOiB0aGlzIGlzIG5vdCB0aGUgb25seSB3YXkgdG8gZGVjbGFyZSB0aGF0XG5cdCAqIGEgY29tbWFuZCBzaG91bGQgYmUgaW4gdGhlIGNvbW1hbmQgcGFsZXR0ZS4uLiBob3dldmVyLCBlbmZvcmNpbmcgSUxvY2FsaXplZFN0cmluZyBpbiB0aGUgb3RoZXIgc2NlbmFyaW9zXG5cdCAqIGlzIG11Y2ggbW9yZSBjaGFsbGVuZ2luZyBhbmQgdGhpcyBnZXRzIHVzIG1vc3Qgb2YgdGhlIHdheSB0aGVyZS5cblx0ICovXG5cdGYxOiB0cnVlO1xufVxuXG5leHBvcnQgdHlwZSBJQWN0aW9uMk9wdGlvbnMgPSBJQ29tbWFuZFBhbGV0dGVPcHRpb25zIHwgSUJhc2VBY3Rpb24yT3B0aW9ucztcblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uMkYxUmVxdWlyZWRPcHRpb25zIHtcblx0dGl0bGU6IElDb21tYW5kQWN0aW9uVGl0bGU7XG5cdGNhdGVnb3J5Pzoga2V5b2YgdHlwZW9mIENhdGVnb3JpZXMgfCBJTG9jYWxpemVkU3RyaW5nO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IGRlc2M6IFJlYWRvbmx5PElBY3Rpb24yT3B0aW9ucz4pIHsgfVxuXHRhYnN0cmFjdCBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckFjdGlvbjIoY3RvcjogeyBuZXcoKTogQWN0aW9uMiB9KTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdOyAvLyBub3QgdXNpbmcgYERpc3Bvc2FibGVTdG9yZWAgdG8gcmVkdWNlIHN0YXJ0dXAgcGVyZiBjb3N0XG5cdGNvbnN0IGFjdGlvbiA9IG5ldyBjdG9yKCk7XG5cblx0Y29uc3QgeyBmMSwgbWVudSwga2V5YmluZGluZywgLi4uY29tbWFuZCB9ID0gYWN0aW9uLmRlc2M7XG5cblx0aWYgKENvbW1hbmRzUmVnaXN0cnkuZ2V0Q29tbWFuZChjb21tYW5kLmlkKSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlZ2lzdGVyIHR3byBjb21tYW5kcyB3aXRoIHRoZSBzYW1lIGlkOiAke2NvbW1hbmQuaWR9YCk7XG5cdH1cblxuXHQvLyBjb21tYW5kXG5cdGRpc3Bvc2FibGVzLnB1c2goQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdGlkOiBjb21tYW5kLmlkLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJncykgPT4gYWN0aW9uLnJ1bihhY2Nlc3NvciwgLi4uYXJncyksXG5cdFx0bWV0YWRhdGE6IGNvbW1hbmQubWV0YWRhdGEgPz8geyBkZXNjcmlwdGlvbjogYWN0aW9uLmRlc2MudGl0bGUgfVxuXHR9KSk7XG5cblx0Ly8gbWVudVxuXHRpZiAoQXJyYXkuaXNBcnJheShtZW51KSkge1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBtZW51KSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5wdXNoKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShpdGVtLmlkLCB7IGNvbW1hbmQ6IHsgLi4uY29tbWFuZCwgcHJlY29uZGl0aW9uOiBpdGVtLnByZWNvbmRpdGlvbiA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IGNvbW1hbmQucHJlY29uZGl0aW9uIH0sIC4uLml0ZW0gfSkpO1xuXHRcdH1cblxuXHR9IGVsc2UgaWYgKG1lbnUpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShtZW51LmlkLCB7IGNvbW1hbmQ6IHsgLi4uY29tbWFuZCwgcHJlY29uZGl0aW9uOiBtZW51LnByZWNvbmRpdGlvbiA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IGNvbW1hbmQucHJlY29uZGl0aW9uIH0sIC4uLm1lbnUgfSkpO1xuXHR9XG5cdGlmIChmMSkge1xuXHRcdGRpc3Bvc2FibGVzLnB1c2goTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kLCB3aGVuOiBjb21tYW5kLnByZWNvbmRpdGlvbiB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaChNZW51UmVnaXN0cnkuYWRkQ29tbWFuZChjb21tYW5kKSk7XG5cdH1cblxuXHQvLyBrZXliaW5kaW5nXG5cdGlmIChBcnJheS5pc0FycmF5KGtleWJpbmRpbmcpKSB7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGtleWJpbmRpbmcpIHtcblx0XHRcdGRpc3Bvc2FibGVzLnB1c2goS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0XHRcdFx0Li4uaXRlbSxcblx0XHRcdFx0aWQ6IGNvbW1hbmQuaWQsXG5cdFx0XHRcdHdoZW46IGNvbW1hbmQucHJlY29uZGl0aW9uID8gQ29udGV4dEtleUV4cHIuYW5kKGNvbW1hbmQucHJlY29uZGl0aW9uLCBpdGVtLndoZW4pIDogaXRlbS53aGVuXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKGtleWJpbmRpbmcpIHtcblx0XHRkaXNwb3NhYmxlcy5wdXNoKEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHQuLi5rZXliaW5kaW5nLFxuXHRcdFx0aWQ6IGNvbW1hbmQuaWQsXG5cdFx0XHR3aGVuOiBjb21tYW5kLnByZWNvbmRpdGlvbiA/IENvbnRleHRLZXlFeHByLmFuZChjb21tYW5kLnByZWNvbmRpdGlvbiwga2V5YmluZGluZy53aGVuKSA6IGtleWJpbmRpbmcud2hlblxuXHRcdH0pKTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0ZGlzcG9zZSgpIHtcblx0XHRcdGRpc3Bvc2UoZGlzcG9zYWJsZXMpO1xuXHRcdH1cblx0fTtcbn1cbi8vI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFrQixxQkFBcUI7QUFDdkMsU0FBZ0Isd0JBQXdCO0FBQ3hDLFNBQVMsaUJBQWlCLFNBQXNCLGlCQUFpQixvQkFBb0I7QUFDckYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUI7QUFHMUIsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMsZ0JBQXNDLDBCQUEwQjtBQUN6RSxTQUFTLHVCQUF5QztBQUNsRCxTQUEwQiwyQkFBMkI7QUE4QzlDLFNBQVMsWUFBWSxNQUFrQztBQUM3RCxTQUFRLEtBQW1CLFlBQVk7QUFDeEM7QUFFTyxTQUFTLGVBQWUsTUFBcUM7QUFDbkUsU0FBUSxLQUFzQixZQUFZO0FBQzNDO0FBRU8sTUFBTSxVQUFOLE1BQU0sUUFBTztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBNlFuQixPQUFPLElBQUksWUFBNEI7QUFDdEMsV0FBTyxRQUFPLFdBQVcs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
