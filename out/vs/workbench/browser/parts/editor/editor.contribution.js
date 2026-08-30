import { Registry } from "../../../../platform/registry/common/platform.js";
import { localize, localize2 } from "../../../../nls.js";
import { EditorPaneDescriptor } from "../../editor.js";
import { EditorExtensions } from "../../../common/editor.js";
import {
  TextCompareEditorActiveContext,
  ActiveEditorPinnedContext,
  EditorGroupEditorsCountContext,
  ActiveEditorStickyContext,
  ActiveEditorAvailableEditorIdsContext,
  EditorPartMultipleEditorGroupsContext,
  ActiveEditorDirtyContext,
  ActiveEditorGroupLockedContext,
  ActiveEditorCanSplitInGroupContext,
  SideBySideEditorActiveContext,
  EditorTabsVisibleContext,
  ActiveEditorLastInGroupContext,
  EditorPartMaximizedEditorGroupContext,
  MultipleEditorGroupsContext,
  InEditorZenModeContext,
  IsAuxiliaryWindowContext,
  ActiveCompareEditorCanSwapContext,
  MultipleEditorsSelectedInGroupContext,
  SplitEditorsVertically,
  ActiveEditorCannotCloseContext,
  IsSessionsWindowContext,
  ActiveCustomEditorDiffCanToggleLayoutContext,
  ActiveCustomEditorTextDiffContext,
  EditorPartModalContext
} from "../../../common/contextkeys.js";
import { SideBySideEditorInput, SideBySideEditorInputSerializer } from "../../../common/editor/sideBySideEditorInput.js";
import { TextResourceEditor } from "./textResourceEditor.js";
import { SideBySideEditor } from "./sideBySideEditor.js";
import { DiffEditorInput, DiffEditorInputSerializer } from "../../../common/editor/diffEditorInput.js";
import { UntitledTextEditorInput } from "../../../services/untitled/common/untitledTextEditorInput.js";
import { TextResourceEditorInput } from "../../../common/editor/textResourceEditorInput.js";
import { TextDiffEditor } from "./textDiffEditor.js";
import { BinaryResourceDiffEditor } from "./binaryDiffEditor.js";
import { ChangeEncodingAction, ChangeEOLAction, ChangeLanguageAction, EditorStatusContribution } from "./editorStatus.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { MenuRegistry, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import {
  CloseEditorsInOtherGroupsAction,
  CloseAllEditorsAction,
  MoveGroupLeftAction,
  MoveGroupRightAction,
  SplitEditorAction,
  JoinTwoGroupsAction,
  RevertAndCloseEditorAction,
  NavigateBetweenGroupsAction,
  FocusActiveGroupAction,
  FocusFirstGroupAction,
  ResetGroupSizesAction,
  MinimizeOtherGroupsAction,
  FocusPreviousGroup,
  FocusNextGroup,
  CloseLeftEditorsInGroupAction,
  OpenNextEditor,
  OpenPreviousEditor,
  NavigateBackwardsAction,
  NavigateForwardAction,
  NavigatePreviousAction,
  ReopenClosedEditorAction,
  QuickAccessPreviousRecentlyUsedEditorInGroupAction,
  QuickAccessPreviousEditorFromHistoryAction,
  ShowAllEditorsByAppearanceAction,
  ClearEditorHistoryAction,
  MoveEditorRightInGroupAction,
  OpenNextEditorInGroup,
  OpenPreviousEditorInGroup,
  OpenNextRecentlyUsedEditorAction,
  OpenPreviousRecentlyUsedEditorAction,
  MoveEditorToPreviousGroupAction,
  MoveEditorToNextGroupAction,
  MoveEditorToFirstGroupAction,
  MoveEditorLeftInGroupAction,
  MoveEditorToStartAction,
  MoveEditorToEndAction,
  ClearRecentFilesAction,
  OpenLastEditorInGroup,
  ShowEditorsInActiveGroupByMostRecentlyUsedAction,
  MoveEditorToLastGroupAction,
  OpenFirstEditorInGroup,
  MoveGroupUpAction,
  MoveGroupDownAction,
  FocusLastGroupAction,
  SplitEditorLeftAction,
  SplitEditorRightAction,
  SplitEditorUpAction,
  SplitEditorDownAction,
  MoveEditorToLeftGroupAction,
  MoveEditorToRightGroupAction,
  MoveEditorToAboveGroupAction,
  MoveEditorToBelowGroupAction,
  CloseAllEditorGroupsAction,
  JoinAllGroupsAction,
  FocusLeftGroup,
  FocusAboveGroup,
  FocusRightGroup,
  FocusBelowGroup,
  EditorLayoutSingleAction,
  EditorLayoutTwoColumnsAction,
  EditorLayoutThreeColumnsAction,
  EditorLayoutTwoByTwoGridAction,
  EditorLayoutTwoRowsAction,
  EditorLayoutThreeRowsAction,
  EditorLayoutTwoColumnsBottomAction,
  EditorLayoutTwoRowsRightAction,
  NewEditorGroupLeftAction,
  NewEditorGroupRightAction,
  NewEditorGroupAboveAction,
  NewEditorGroupBelowAction,
  SplitEditorOrthogonalAction,
  CloseEditorInAllGroupsAction,
  NavigateToLastEditLocationAction,
  ToggleGroupSizesAction,
  ShowAllEditorsByMostRecentlyUsedAction,
  QuickAccessPreviousRecentlyUsedEditorAction,
  OpenPreviousRecentlyUsedEditorInGroupAction,
  OpenNextRecentlyUsedEditorInGroupAction,
  QuickAccessLeastRecentlyUsedEditorAction,
  QuickAccessLeastRecentlyUsedEditorInGroupAction,
  ReOpenInTextEditorAction,
  DuplicateGroupDownAction,
  DuplicateGroupLeftAction,
  DuplicateGroupRightAction,
  DuplicateGroupUpAction,
  ToggleEditorTypeAction,
  SplitEditorToAboveGroupAction,
  SplitEditorToBelowGroupAction,
  SplitEditorToFirstGroupAction,
  SplitEditorToLastGroupAction,
  SplitEditorToLeftGroupAction,
  SplitEditorToNextGroupAction,
  SplitEditorToPreviousGroupAction,
  SplitEditorToRightGroupAction,
  NavigateForwardInEditsAction,
  NavigateBackwardsInEditsAction,
  NavigateForwardInNavigationsAction,
  NavigateBackwardsInNavigationsAction,
  NavigatePreviousInNavigationsAction,
  NavigatePreviousInEditsAction,
  NavigateToLastNavigationLocationAction,
  MaximizeGroupHideSidebarAction,
  MoveEditorToNewWindowAction,
  CopyEditorToNewindowAction,
  RestoreEditorsToMainWindowAction,
  ToggleMaximizeEditorGroupAction,
  MinimizeOtherGroupsHideSidebarAction,
  CopyEditorGroupToNewWindowAction,
  MoveEditorGroupToNewWindowAction,
  NewEmptyEditorWindowAction,
  ClearEditorHistoryWithoutConfirmAction
} from "./editorActions.js";
import {
  CLOSE_EDITORS_AND_GROUP_COMMAND_ID,
  CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
  CLOSE_EDITOR_COMMAND_ID,
  CLOSE_EDITOR_GROUP_COMMAND_ID,
  CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_PINNED_EDITOR_COMMAND_ID,
  CLOSE_SAVED_EDITORS_COMMAND_ID,
  KEEP_EDITOR_COMMAND_ID,
  PIN_EDITOR_COMMAND_ID,
  SHOW_EDITORS_IN_GROUP,
  SPLIT_EDITOR_DOWN,
  SPLIT_EDITOR_LEFT,
  SPLIT_EDITOR_RIGHT,
  SPLIT_EDITOR_UP,
  TOGGLE_KEEP_EDITORS_COMMAND_ID,
  UNPIN_EDITOR_COMMAND_ID,
  setup as registerEditorCommands,
  REOPEN_WITH_COMMAND_ID,
  TOGGLE_LOCK_GROUP_COMMAND_ID,
  UNLOCK_GROUP_COMMAND_ID,
  SPLIT_EDITOR_IN_GROUP,
  JOIN_EDITOR_IN_GROUP,
  FOCUS_FIRST_SIDE_EDITOR,
  FOCUS_SECOND_SIDE_EDITOR,
  TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
  LOCK_GROUP_COMMAND_ID,
  SPLIT_EDITOR,
  TOGGLE_MAXIMIZE_EDITOR_GROUP,
  MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID,
  MOVE_EDITOR_INTO_RIGHT_GROUP,
  MOVE_EDITOR_INTO_LEFT_GROUP,
  MOVE_EDITOR_INTO_ABOVE_GROUP,
  MOVE_EDITOR_INTO_BELOW_GROUP
} from "./editorCommands.js";
import { GOTO_NEXT_CHANGE, GOTO_PREVIOUS_CHANGE, TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE, TOGGLE_DIFF_SIDE_BY_SIDE, DIFF_SWAP_SIDES } from "./diffEditorCommands.js";
import { inQuickPickContext, getQuickNavigateHandler } from "../../quickaccess.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorAutoSave } from "./editorAutoSave.js";
import { Extensions as QuickAccessExtensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess, AllEditorsByAppearanceQuickAccess, AllEditorsByMostRecentlyUsedQuickAccess } from "./editorQuickAccess.js";
import { FileAccess } from "../../../../base/common/network.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { UntitledTextEditorInputSerializer, UntitledTextEditorWorkingCopyEditorHandler } from "../../../services/untitled/common/untitledTextEditorHandler.js";
import { DynamicEditorConfigurations } from "./editorConfiguration.js";
import { ConfigureEditorAction, ConfigureEditorTabsAction, EditorActionsDefaultAction, EditorActionsTitleBarAction, HideEditorActionsAction, HideEditorTabsAction, ShowMultipleEditorTabsAction, ShowSingleEditorTabAction, ZenHideEditorTabsAction, ZenShowMultipleEditorTabsAction, ZenShowSingleEditorTabAction } from "../../actions/layoutActions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { getFontSnippets } from "../../../../base/browser/fonts.js";
import { registerEditorFontConfigurations } from "../../../../editor/common/config/editorConfigurationSchema.js";
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    TextResourceEditor,
    TextResourceEditor.ID,
    localize("textEditor", "Text Editor")
  ),
  [
    new SyncDescriptor(UntitledTextEditorInput),
    new SyncDescriptor(TextResourceEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    TextDiffEditor,
    TextDiffEditor.ID,
    localize("textDiffEditor", "Text Diff Editor")
  ),
  [
    new SyncDescriptor(DiffEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    BinaryResourceDiffEditor,
    BinaryResourceDiffEditor.ID,
    localize("binaryDiffEditor", "Binary Diff Editor")
  ),
  [
    new SyncDescriptor(DiffEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    SideBySideEditor,
    SideBySideEditor.ID,
    localize("sideBySideEditor", "Side by Side Editor")
  ),
  [
    new SyncDescriptor(SideBySideEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(UntitledTextEditorInput.ID, UntitledTextEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(SideBySideEditorInput.ID, SideBySideEditorInputSerializer);
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(DiffEditorInput.ID, DiffEditorInputSerializer);
registerWorkbenchContribution2(EditorAutoSave.ID, EditorAutoSave, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(EditorStatusContribution.ID, EditorStatusContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(UntitledTextEditorWorkingCopyEditorHandler.ID, UntitledTextEditorWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(DynamicEditorConfigurations.ID, DynamicEditorConfigurations, WorkbenchPhase.BlockRestore);
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
const editorPickerContextKey = "inEditorsPicker";
const editorPickerContext = ContextKeyExpr.and(inQuickPickContext, ContextKeyExpr.has(editorPickerContextKey));
quickAccessRegistry.registerQuickAccessProvider({
  ctor: ActiveGroupEditorsByMostRecentlyUsedQuickAccess,
  prefix: ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX,
  contextKey: editorPickerContextKey,
  placeholder: localize("editorQuickAccessPlaceholder", "Type the name of an editor to open it."),
  helpEntries: [{ description: localize("activeGroupEditorsByMostRecentlyUsedQuickAccess", "Show Editors in Active Group by Most Recently Used"), commandId: ShowEditorsInActiveGroupByMostRecentlyUsedAction.ID }]
});
quickAccessRegistry.registerQuickAccessProvider({
  ctor: AllEditorsByAppearanceQuickAccess,
  prefix: AllEditorsByAppearanceQuickAccess.PREFIX,
  contextKey: editorPickerContextKey,
  placeholder: localize("editorQuickAccessPlaceholder", "Type the name of an editor to open it."),
  helpEntries: [{ description: localize("allEditorsByAppearanceQuickAccess", "Show All Opened Editors By Appearance"), commandId: ShowAllEditorsByAppearanceAction.ID }]
});
quickAccessRegistry.registerQuickAccessProvider({
  ctor: AllEditorsByMostRecentlyUsedQuickAccess,
  prefix: AllEditorsByMostRecentlyUsedQuickAccess.PREFIX,
  contextKey: editorPickerContextKey,
  placeholder: localize("editorQuickAccessPlaceholder", "Type the name of an editor to open it."),
  helpEntries: [{ description: localize("allEditorsByMostRecentlyUsedQuickAccess", "Show All Opened Editors By Most Recently Used"), commandId: ShowAllEditorsByMostRecentlyUsedAction.ID }]
});
registerAction2(ChangeLanguageAction);
registerAction2(ChangeEOLAction);
registerAction2(ChangeEncodingAction);
registerAction2(NavigateForwardAction);
registerAction2(NavigateBackwardsAction);
registerAction2(OpenNextEditor);
registerAction2(OpenPreviousEditor);
registerAction2(OpenNextEditorInGroup);
registerAction2(OpenPreviousEditorInGroup);
registerAction2(OpenFirstEditorInGroup);
registerAction2(OpenLastEditorInGroup);
registerAction2(OpenNextRecentlyUsedEditorAction);
registerAction2(OpenPreviousRecentlyUsedEditorAction);
registerAction2(OpenNextRecentlyUsedEditorInGroupAction);
registerAction2(OpenPreviousRecentlyUsedEditorInGroupAction);
registerAction2(ReopenClosedEditorAction);
registerAction2(ClearRecentFilesAction);
registerAction2(ShowAllEditorsByAppearanceAction);
registerAction2(ShowAllEditorsByMostRecentlyUsedAction);
registerAction2(ShowEditorsInActiveGroupByMostRecentlyUsedAction);
registerAction2(CloseAllEditorsAction);
registerAction2(CloseAllEditorGroupsAction);
registerAction2(CloseLeftEditorsInGroupAction);
registerAction2(CloseEditorsInOtherGroupsAction);
registerAction2(CloseEditorInAllGroupsAction);
registerAction2(RevertAndCloseEditorAction);
registerAction2(SplitEditorAction);
registerAction2(SplitEditorOrthogonalAction);
registerAction2(SplitEditorLeftAction);
registerAction2(SplitEditorRightAction);
registerAction2(SplitEditorUpAction);
registerAction2(SplitEditorDownAction);
registerAction2(JoinTwoGroupsAction);
registerAction2(JoinAllGroupsAction);
registerAction2(NavigateBetweenGroupsAction);
registerAction2(ResetGroupSizesAction);
registerAction2(ToggleGroupSizesAction);
registerAction2(MaximizeGroupHideSidebarAction);
registerAction2(ToggleMaximizeEditorGroupAction);
registerAction2(MinimizeOtherGroupsAction);
registerAction2(MinimizeOtherGroupsHideSidebarAction);
registerAction2(MoveEditorLeftInGroupAction);
registerAction2(MoveEditorRightInGroupAction);
registerAction2(MoveEditorToStartAction);
registerAction2(MoveEditorToEndAction);
registerAction2(MoveGroupLeftAction);
registerAction2(MoveGroupRightAction);
registerAction2(MoveGroupUpAction);
registerAction2(MoveGroupDownAction);
registerAction2(DuplicateGroupLeftAction);
registerAction2(DuplicateGroupRightAction);
registerAction2(DuplicateGroupUpAction);
registerAction2(DuplicateGroupDownAction);
registerAction2(MoveEditorToPreviousGroupAction);
registerAction2(MoveEditorToNextGroupAction);
registerAction2(MoveEditorToFirstGroupAction);
registerAction2(MoveEditorToLastGroupAction);
registerAction2(MoveEditorToLeftGroupAction);
registerAction2(MoveEditorToRightGroupAction);
registerAction2(MoveEditorToAboveGroupAction);
registerAction2(MoveEditorToBelowGroupAction);
registerAction2(SplitEditorToPreviousGroupAction);
registerAction2(SplitEditorToNextGroupAction);
registerAction2(SplitEditorToFirstGroupAction);
registerAction2(SplitEditorToLastGroupAction);
registerAction2(SplitEditorToLeftGroupAction);
registerAction2(SplitEditorToRightGroupAction);
registerAction2(SplitEditorToAboveGroupAction);
registerAction2(SplitEditorToBelowGroupAction);
registerAction2(FocusActiveGroupAction);
registerAction2(FocusFirstGroupAction);
registerAction2(FocusLastGroupAction);
registerAction2(FocusPreviousGroup);
registerAction2(FocusNextGroup);
registerAction2(FocusLeftGroup);
registerAction2(FocusRightGroup);
registerAction2(FocusAboveGroup);
registerAction2(FocusBelowGroup);
registerAction2(NewEditorGroupLeftAction);
registerAction2(NewEditorGroupRightAction);
registerAction2(NewEditorGroupAboveAction);
registerAction2(NewEditorGroupBelowAction);
registerAction2(NavigatePreviousAction);
registerAction2(NavigateForwardInEditsAction);
registerAction2(NavigateBackwardsInEditsAction);
registerAction2(NavigatePreviousInEditsAction);
registerAction2(NavigateToLastEditLocationAction);
registerAction2(NavigateForwardInNavigationsAction);
registerAction2(NavigateBackwardsInNavigationsAction);
registerAction2(NavigatePreviousInNavigationsAction);
registerAction2(NavigateToLastNavigationLocationAction);
registerAction2(ClearEditorHistoryAction);
registerAction2(ClearEditorHistoryWithoutConfirmAction);
registerAction2(EditorLayoutSingleAction);
registerAction2(EditorLayoutTwoColumnsAction);
registerAction2(EditorLayoutThreeColumnsAction);
registerAction2(EditorLayoutTwoRowsAction);
registerAction2(EditorLayoutThreeRowsAction);
registerAction2(EditorLayoutTwoByTwoGridAction);
registerAction2(EditorLayoutTwoRowsRightAction);
registerAction2(EditorLayoutTwoColumnsBottomAction);
registerAction2(ToggleEditorTypeAction);
registerAction2(ReOpenInTextEditorAction);
registerAction2(QuickAccessPreviousRecentlyUsedEditorAction);
registerAction2(QuickAccessLeastRecentlyUsedEditorAction);
registerAction2(QuickAccessPreviousRecentlyUsedEditorInGroupAction);
registerAction2(QuickAccessLeastRecentlyUsedEditorInGroupAction);
registerAction2(QuickAccessPreviousEditorFromHistoryAction);
registerAction2(MoveEditorToNewWindowAction);
registerAction2(CopyEditorToNewindowAction);
registerAction2(MoveEditorGroupToNewWindowAction);
registerAction2(CopyEditorGroupToNewWindowAction);
registerAction2(RestoreEditorsToMainWindowAction);
registerAction2(NewEmptyEditorWindowAction);
const quickAccessNavigateNextInEditorPickerId = "workbench.action.quickOpenNavigateNextInEditorPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickAccessNavigateNextInEditorPickerId,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickAccessNavigateNextInEditorPickerId, true),
  when: editorPickerContext,
  primary: KeyMod.CtrlCmd | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyCode.Tab }
});
const quickAccessNavigatePreviousInEditorPickerId = "workbench.action.quickOpenNavigatePreviousInEditorPicker";
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: quickAccessNavigatePreviousInEditorPickerId,
  weight: KeybindingWeight.WorkbenchContrib + 50,
  handler: getQuickNavigateHandler(quickAccessNavigatePreviousInEditorPickerId, false),
  when: editorPickerContext,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Tab,
  mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.Tab }
});
registerEditorCommands();
if (isMacintosh) {
  MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
    command: { id: NavigateBackwardsAction.ID, title: NavigateBackwardsAction.LABEL, icon: { dark: FileAccess.asFileUri("vs/workbench/browser/parts/editor/media/back-tb.png") } },
    group: "navigation",
    order: 0
  });
  MenuRegistry.appendMenuItem(MenuId.TouchBarContext, {
    command: { id: NavigateForwardAction.ID, title: NavigateForwardAction.LABEL, icon: { dark: FileAccess.asFileUri("vs/workbench/browser/parts/editor/media/forward-tb.png") } },
    group: "navigation",
    order: 1
  });
}
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: LOCK_GROUP_COMMAND_ID, title: localize("lockGroupAction", "Lock Group"), icon: Codicon.unlock }, group: "navigation", order: 10, when: ContextKeyExpr.and(IsAuxiliaryWindowContext, ActiveEditorGroupLockedContext.toNegated()) });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: UNLOCK_GROUP_COMMAND_ID, title: localize("unlockGroupAction", "Unlock Group"), icon: Codicon.lock, toggled: ContextKeyExpr.true() }, group: "navigation", order: 10, when: ActiveEditorGroupLockedContext });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroup, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize("closeGroupAction", "Close Group"), icon: Codicon.close }, group: "navigation", order: 20, when: ContextKeyExpr.or(IsAuxiliaryWindowContext, EditorPartMultipleEditorGroupsContext) });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_UP, title: localize("splitUp", "Split Up") }, group: "2_split", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize("splitDown", "Split Down") }, group: "2_split", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize("splitLeft", "Split Left") }, group: "2_split", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize("splitRight", "Split Right") }, group: "2_split", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID, title: localize("newWindow", "New Window") }, group: "3_window", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, {
  command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize("toggleLockGroup", "Lock Group"), toggled: ActiveEditorGroupLockedContext },
  group: "4_lock",
  order: 10,
  when: IsAuxiliaryWindowContext.toNegated()
  /* already a primary action for aux windows */
});
MenuRegistry.appendMenuItem(MenuId.EmptyEditorGroupContext, { command: { id: CLOSE_EDITOR_GROUP_COMMAND_ID, title: localize("close", "Close") }, group: "5_close", order: 10, when: MultipleEditorGroupsContext });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_UP, title: localize("splitUp", "Split Up") }, group: "2_split", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_DOWN, title: localize("splitDown", "Split Down") }, group: "2_split", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_LEFT, title: localize("splitLeft", "Split Left") }, group: "2_split", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: SPLIT_EDITOR_RIGHT, title: localize("splitRight", "Split Right") }, group: "2_split", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, title: localize("moveEditorGroupToNewWindow", "Move into New Window") }, group: "3_window", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID, title: localize("copyEditorGroupToNewWindow", "Copy into New Window") }, group: "3_window", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorTabsBarShowTabsSubmenu, title: localize("tabBar", "Tab Bar"), group: "4_config", order: 10, when: InEditorZenModeContext.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: ShowMultipleEditorTabsAction.ID, title: localize("multipleTabs", "Multiple Tabs"), toggled: ContextKeyExpr.equals("config.workbench.editor.showTabs", "multiple") }, group: "1_config", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: ShowSingleEditorTabAction.ID, title: localize("singleTab", "Single Tab"), toggled: ContextKeyExpr.equals("config.workbench.editor.showTabs", "single") }, group: "1_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsSubmenu, { command: { id: HideEditorTabsAction.ID, title: localize("hideTabs", "Hidden"), toggled: ContextKeyExpr.equals("config.workbench.editor.showTabs", "none") }, group: "1_config", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorTabsBarShowTabsZenModeSubmenu, title: localize("tabBar", "Tab Bar"), group: "4_config", order: 10, when: InEditorZenModeContext });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenShowMultipleEditorTabsAction.ID, title: localize("multipleTabs", "Multiple Tabs"), toggled: ContextKeyExpr.equals("config.zenMode.showTabs", "multiple") }, group: "1_config", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenShowSingleEditorTabAction.ID, title: localize("singleTab", "Single Tab"), toggled: ContextKeyExpr.equals("config.zenMode.showTabs", "single") }, group: "1_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarShowTabsZenModeSubmenu, { command: { id: ZenHideEditorTabsAction.ID, title: localize("hideTabs", "Hidden"), toggled: ContextKeyExpr.equals("config.zenMode.showTabs", "none") }, group: "1_config", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { submenu: MenuId.EditorActionsPositionSubmenu, title: localize("editorActionsPosition", "Editor Actions Position"), group: "4_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: EditorActionsDefaultAction.ID, title: localize("tabBar", "Tab Bar"), toggled: ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "default") }, group: "1_config", order: 10, when: ContextKeyExpr.equals("config.workbench.editor.showTabs", "none").negate() });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: EditorActionsTitleBarAction.ID, title: localize("titleBar", "Title Bar"), toggled: ContextKeyExpr.or(ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "titleBar"), ContextKeyExpr.and(ContextKeyExpr.equals("config.workbench.editor.showTabs", "none"), ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "default"))) }, group: "1_config", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorActionsPositionSubmenu, { command: { id: HideEditorActionsAction.ID, title: localize("hidden", "Hidden"), toggled: ContextKeyExpr.equals("config.workbench.editor.editorActionsLocation", "hidden") }, group: "1_config", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorTabsBarContext, { command: { id: ConfigureEditorTabsAction.ID, title: localize("configureTabs", "Configure Tabs") }, group: "9_configure", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: localize("close", "Close") }, group: "1_close", order: 10, when: ActiveEditorCannotCloseContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: localize("closeOthers", "Close Others"), precondition: EditorGroupEditorsCountContext.notEqualsTo("1") }, group: "1_close", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: localize("closeRight", "Close to the Right"), precondition: ContextKeyExpr.and(ActiveEditorLastInGroupContext.toNegated(), MultipleEditorsSelectedInGroupContext.negate()) }, group: "1_close", order: 30, when: EditorTabsVisibleContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize("closeAllSaved", "Close Saved") }, group: "1_close", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize("closeAll", "Close All") }, group: "1_close", order: 50 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: REOPEN_WITH_COMMAND_ID, title: localize("reopenWith", "Reopen Editor With...") }, group: "1_open", order: 10, when: ActiveEditorAvailableEditorIdsContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: KEEP_EDITOR_COMMAND_ID, title: localize("keepOpen", "Keep Open"), precondition: ActiveEditorPinnedContext.toNegated() }, group: "3_preview", order: 10, when: ContextKeyExpr.has("config.workbench.editor.enablePreview") });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: PIN_EDITOR_COMMAND_ID, title: localize("pin", "Pin") }, group: "3_preview", order: 20, when: ActiveEditorStickyContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: localize("unpin", "Unpin") }, group: "3_preview", order: 20, when: ActiveEditorStickyContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR, title: localize("splitRight", "Split Right") }, group: "5_split", order: 10, when: SplitEditorsVertically.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: SPLIT_EDITOR, title: localize("splitDown", "Split Down") }, group: "5_split", order: 10, when: SplitEditorsVertically });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { submenu: MenuId.EditorSplitMoveSubmenu, title: localize("splitAndMoveEditor", "Split & Move"), group: "5_split", order: 15 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, title: localize("moveToNewWindow", "Move into New Window") }, group: "7_new_window", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { command: { id: COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID, title: localize("copyToNewWindow", "Copy into New Window") }, group: "7_new_window", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, { submenu: MenuId.EditorTitleContextShare, title: localize("share", "Share"), group: "11_share", order: -1, when: MultipleEditorsSelectedInGroupContext.negate() });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_UP, title: localize("splitUp", "Split Up") }, group: "1_split", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_DOWN, title: localize("splitDown", "Split Down") }, group: "1_split", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_LEFT, title: localize("splitLeft", "Split Left") }, group: "1_split", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_RIGHT, title: localize("splitRight", "Split Right") }, group: "1_split", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_ABOVE_GROUP, title: localize("moveAbove", "Move Above") }, group: "2_move", order: 10 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_BELOW_GROUP, title: localize("moveBelow", "Move Below") }, group: "2_move", order: 20 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_LEFT_GROUP, title: localize("moveLeft", "Move Left") }, group: "2_move", order: 30 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: MOVE_EDITOR_INTO_RIGHT_GROUP, title: localize("moveRight", "Move Right") }, group: "2_move", order: 40 });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: SPLIT_EDITOR_IN_GROUP, title: localize("splitInGroup", "Split in Group"), precondition: MultipleEditorsSelectedInGroupContext.negate() }, group: "3_split_in_group", order: 10, when: ActiveEditorCanSplitInGroupContext });
MenuRegistry.appendMenuItem(MenuId.EditorSplitMoveSubmenu, { command: { id: JOIN_EDITOR_IN_GROUP, title: localize("joinInGroup", "Join in Group"), precondition: MultipleEditorsSelectedInGroupContext.negate() }, group: "3_split_in_group", order: 10, when: SideBySideEditorActiveContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_DIFF_SIDE_BY_SIDE, title: localize("inlineView", "Inline View"), toggled: ContextKeyExpr.equals("config.diffEditor.renderSideBySide", false) }, group: "1_diff", order: 10, when: ContextKeyExpr.or(ContextKeyExpr.has("isInDiffEditor"), ActiveCustomEditorDiffCanToggleLayoutContext) });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: SHOW_EDITORS_IN_GROUP, title: localize("showOpenedEditors", "Show Opened Editors") },
  group: "3_open",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize("closeAll", "Close All") },
  group: "5_close",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize("closeAllSaved", "Close Saved") },
  group: "5_close",
  order: 20,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: TOGGLE_KEEP_EDITORS_COMMAND_ID, title: localize("togglePreviewMode", "Enable Preview Editors"), toggled: ContextKeyExpr.has("config.workbench.editor.enablePreview") },
  group: "7_settings",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_MAXIMIZE_EDITOR_GROUP, title: localize("maximizeGroup", "Maximize Group") }, group: "8_group_operations", order: 5, when: ContextKeyExpr.and(EditorPartMaximizedEditorGroupContext.negate(), EditorPartMultipleEditorGroupsContext) });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, { command: { id: TOGGLE_MAXIMIZE_EDITOR_GROUP, title: localize("unmaximizeGroup", "Unmaximize Group") }, group: "8_group_operations", order: 5, when: EditorPartMaximizedEditorGroupContext });
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: TOGGLE_LOCK_GROUP_COMMAND_ID, title: localize("lockGroup", "Lock Group"), toggled: ActiveEditorGroupLockedContext },
  group: "8_group_operations",
  order: 10,
  when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), EditorPartModalContext.toNegated())
  /* already a primary action for aux windows, not applicable to modal editor */
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: { id: ConfigureEditorAction.ID, title: localize("configureEditors", "Configure Editors") },
  group: "9_configure",
  order: 10,
  when: EditorPartModalContext.toNegated()
  /* not applicable to modal editor */
});
function appendEditorToolItem(primary, when, order, alternative, precondition, enableInCompactMode, enableInModalMode) {
  const item = {
    command: {
      id: primary.id,
      title: primary.title,
      icon: primary.icon,
      toggled: primary.toggled,
      precondition
    },
    group: "navigation",
    when,
    order
  };
  if (alternative) {
    item.alt = {
      id: alternative.id,
      title: alternative.title,
      icon: alternative.icon
    };
  }
  MenuRegistry.appendMenuItem(MenuId.EditorTitle, item);
  if (enableInCompactMode) {
    MenuRegistry.appendMenuItem(MenuId.CompactWindowEditorTitle, item);
  }
  if (enableInModalMode) {
    MenuRegistry.appendMenuItem(MenuId.ModalEditorEditorTitle, item);
  }
}
const SPLIT_ORDER = 1e5;
const CLOSE_ORDER = 1e6;
appendEditorToolItem(
  {
    id: SPLIT_EDITOR,
    title: localize("splitEditorRight", "Split Editor Right"),
    icon: Codicon.splitHorizontal
  },
  ContextKeyExpr.and(SplitEditorsVertically.negate(), IsSessionsWindowContext.toNegated()),
  SPLIT_ORDER,
  {
    id: SPLIT_EDITOR_DOWN,
    title: localize("splitEditorDown", "Split Editor Down"),
    icon: Codicon.splitVertical
  }
);
appendEditorToolItem(
  {
    id: SPLIT_EDITOR,
    title: localize("splitEditorDown", "Split Editor Down"),
    icon: Codicon.splitVertical
  },
  ContextKeyExpr.and(SplitEditorsVertically, IsSessionsWindowContext.toNegated()),
  SPLIT_ORDER,
  {
    id: SPLIT_EDITOR_RIGHT,
    title: localize("splitEditorRight", "Split Editor Right"),
    icon: Codicon.splitHorizontal
  }
);
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: {
    id: SPLIT_EDITOR,
    title: localize("splitEditorRight", "Split Editor Right"),
    icon: Codicon.splitHorizontal
  },
  group: "4_split",
  order: 10,
  when: ContextKeyExpr.and(IsSessionsWindowContext, SplitEditorsVertically.negate())
});
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: {
    id: SPLIT_EDITOR,
    title: localize("splitEditorDown", "Split Editor Down"),
    icon: Codicon.splitVertical
  },
  group: "4_split",
  order: 10,
  when: ContextKeyExpr.and(IsSessionsWindowContext, SplitEditorsVertically)
});
appendEditorToolItem(
  {
    id: TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
    title: localize("toggleSplitEditorInGroupLayout", "Toggle Layout"),
    icon: Codicon.editorLayout
  },
  SideBySideEditorActiveContext,
  SPLIT_ORDER - 1
  // left to split actions
);
appendEditorToolItem(
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.close
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext.toNegated(), ActiveEditorCannotCloseContext.toNegated()),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: localize("closeAll", "Close All"),
    icon: Codicon.closeAll
  }
);
appendEditorToolItem(
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.closeDirty
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext.toNegated(), ActiveEditorCannotCloseContext.toNegated()),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    title: localize("closeAll", "Close All"),
    icon: Codicon.closeAll
  }
);
appendEditorToolItem(
  {
    id: UNPIN_EDITOR_COMMAND_ID,
    title: localize("unpin", "Unpin"),
    icon: Codicon.pinned
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext.toNegated(), ActiveEditorStickyContext),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.close
  }
);
appendEditorToolItem(
  {
    id: UNPIN_EDITOR_COMMAND_ID,
    title: localize("unpin", "Unpin"),
    icon: Codicon.pinnedDirty
  },
  ContextKeyExpr.and(EditorTabsVisibleContext.toNegated(), ActiveEditorDirtyContext, ActiveEditorStickyContext),
  CLOSE_ORDER,
  {
    id: CLOSE_EDITOR_COMMAND_ID,
    title: localize("close", "Close"),
    icon: Codicon.close
  }
);
appendEditorToolItem(
  {
    id: LOCK_GROUP_COMMAND_ID,
    title: localize("lockEditorGroup", "Lock Group"),
    icon: Codicon.unlock
  },
  ContextKeyExpr.and(IsAuxiliaryWindowContext, ActiveEditorGroupLockedContext.toNegated()),
  CLOSE_ORDER - 1
  // immediately to the left of close action
);
appendEditorToolItem(
  {
    id: UNLOCK_GROUP_COMMAND_ID,
    title: localize("unlockEditorGroup", "Unlock Group"),
    icon: Codicon.lock,
    toggled: ContextKeyExpr.true()
  },
  ActiveEditorGroupLockedContext,
  CLOSE_ORDER - 1
  // immediately to the left of close action
);
const previousChangeIcon = registerIcon("diff-editor-previous-change", Codicon.arrowUp, localize("previousChangeIcon", "Icon for the previous change action in the diff editor."));
appendEditorToolItem(
  {
    id: GOTO_PREVIOUS_CHANGE,
    title: localize("navigate.prev.label", "Previous Change"),
    icon: previousChangeIcon
  },
  TextCompareEditorActiveContext,
  10,
  void 0,
  EditorContextKeys.hasChanges,
  true,
  true
);
const nextChangeIcon = registerIcon("diff-editor-next-change", Codicon.arrowDown, localize("nextChangeIcon", "Icon for the next change action in the diff editor."));
appendEditorToolItem(
  {
    id: GOTO_NEXT_CHANGE,
    title: localize("navigate.next.label", "Next Change"),
    icon: nextChangeIcon
  },
  TextCompareEditorActiveContext,
  11,
  void 0,
  EditorContextKeys.hasChanges,
  true,
  true
);
appendEditorToolItem(
  {
    id: DIFF_SWAP_SIDES,
    title: localize("swapDiffSides", "Swap Left and Right Side"),
    icon: Codicon.arrowSwap
  },
  ContextKeyExpr.and(TextCompareEditorActiveContext, ActiveCompareEditorCanSwapContext),
  15,
  void 0,
  void 0
);
appendEditorToolItem(
  {
    id: ReOpenInTextEditorAction.ID,
    title: localize("reopenAsText", "Reopen as Text"),
    icon: Codicon.fileCode
  },
  ActiveCustomEditorTextDiffContext,
  16,
  void 0,
  void 0,
  void 0,
  true
);
const toggleWhitespace = registerIcon("diff-editor-toggle-whitespace", Codicon.whitespace, localize("toggleWhitespace", "Icon for the toggle whitespace action in the diff editor."));
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
  command: {
    id: TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
    title: localize("ignoreTrimWhitespace.label", "Show Leading/Trailing Whitespace Differences"),
    icon: toggleWhitespace,
    precondition: TextCompareEditorActiveContext,
    toggled: ContextKeyExpr.equals("config.diffEditor.ignoreTrimWhitespace", false)
  },
  group: "navigation",
  when: TextCompareEditorActiveContext,
  order: 20
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: KEEP_EDITOR_COMMAND_ID, title: localize2("keepEditor", "Keep Editor"), category: Categories.View }, when: ContextKeyExpr.has("config.workbench.editor.enablePreview") });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: PIN_EDITOR_COMMAND_ID, title: localize2("pinEditor", "Pin Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: UNPIN_EDITOR_COMMAND_ID, title: localize2("unpinEditor", "Unpin Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITOR_COMMAND_ID, title: localize2("closeEditor", "Close Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_PINNED_EDITOR_COMMAND_ID, title: localize2("closePinnedEditor", "Close Pinned Editor"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID, title: localize2("closeEditorsInGroup", "Close All Editors in Group"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_SAVED_EDITORS_COMMAND_ID, title: localize2("closeSavedEditors", "Close Saved Editors in Group"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID, title: localize2("closeOtherEditors", "Close Other Editors in Group"), category: Categories.View } });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID, title: localize2("closeRightEditors", "Close Editors to the Right in Group"), category: Categories.View }, when: ActiveEditorLastInGroupContext.toNegated() });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: CLOSE_EDITORS_AND_GROUP_COMMAND_ID, title: localize2("closeEditorGroup", "Close Editor Group"), category: Categories.View }, when: MultipleEditorGroupsContext });
MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: REOPEN_WITH_COMMAND_ID, title: localize2("reopenWith", "Reopen Editor With..."), category: Categories.View }, when: ActiveEditorAvailableEditorIdsContext });
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
  group: "1_editor",
  command: {
    id: ReopenClosedEditorAction.ID,
    title: localize({ key: "miReopenClosedEditor", comment: ["&& denotes a mnemonic"] }, "&&Reopen Closed Editor"),
    precondition: ContextKeyExpr.has("canReopenClosedEditor")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarRecentMenu, {
  group: "z_clear",
  command: {
    id: ClearRecentFilesAction.ID,
    title: localize({ key: "miClearRecentOpen", comment: ["&& denotes a mnemonic"] }, "&&Clear Recently Opened...")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarFileMenu, {
  title: localize("miShare", "Share"),
  submenu: MenuId.MenubarShare,
  group: "45_share",
  order: 1,
  when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
  group: "2_appearance",
  title: localize({ key: "miEditorLayout", comment: ["&& denotes a mnemonic"] }, "Editor &&Layout"),
  submenu: MenuId.MenubarLayoutMenu,
  order: 2,
  when: IsSessionsWindowContext.negate()
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_UP,
    title: {
      ...localize2("miSplitEditorUpWithoutMnemonic", "Split Up"),
      mnemonicTitle: localize({ key: "miSplitEditorUp", comment: ["&& denotes a mnemonic"] }, "Split &&Up")
    }
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_DOWN,
    title: {
      ...localize2("miSplitEditorDownWithoutMnemonic", "Split Down"),
      mnemonicTitle: localize({ key: "miSplitEditorDown", comment: ["&& denotes a mnemonic"] }, "Split &&Down")
    }
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_LEFT,
    title: {
      ...localize2("miSplitEditorLeftWithoutMnemonic", "Split Left"),
      mnemonicTitle: localize({ key: "miSplitEditorLeft", comment: ["&& denotes a mnemonic"] }, "Split &&Left")
    }
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "1_split",
  command: {
    id: SPLIT_EDITOR_RIGHT,
    title: {
      ...localize2("miSplitEditorRightWithoutMnemonic", "Split Right"),
      mnemonicTitle: localize({ key: "miSplitEditorRight", comment: ["&& denotes a mnemonic"] }, "Split &&Right")
    }
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "2_split_in_group",
  command: {
    id: SPLIT_EDITOR_IN_GROUP,
    title: {
      ...localize2("miSplitEditorInGroupWithoutMnemonic", "Split in Group"),
      mnemonicTitle: localize({ key: "miSplitEditorInGroup", comment: ["&& denotes a mnemonic"] }, "Split in &&Group")
    }
  },
  when: ActiveEditorCanSplitInGroupContext,
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "2_split_in_group",
  command: {
    id: JOIN_EDITOR_IN_GROUP,
    title: {
      ...localize2("miJoinEditorInGroupWithoutMnemonic", "Join in Group"),
      mnemonicTitle: localize({ key: "miJoinEditorInGroup", comment: ["&& denotes a mnemonic"] }, "Join in &&Group")
    }
  },
  when: SideBySideEditorActiveContext,
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "3_new_window",
  command: {
    id: MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
    title: {
      ...localize2("moveEditorToNewWindow", "Move Editor into New Window"),
      mnemonicTitle: localize({ key: "miMoveEditorToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Move Editor into New Window")
    }
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "3_new_window",
  command: {
    id: COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
    title: {
      ...localize2("copyEditorToNewWindow", "Copy Editor into New Window"),
      mnemonicTitle: localize({ key: "miCopyEditorToNewWindow", comment: ["&& denotes a mnemonic"] }, "&&Copy Editor into New Window")
    }
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutSingleAction.ID,
    title: {
      ...localize2("miSingleColumnEditorLayoutWithoutMnemonic", "Single"),
      mnemonicTitle: localize({ key: "miSingleColumnEditorLayout", comment: ["&& denotes a mnemonic"] }, "&&Single")
    }
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoColumnsAction.ID,
    title: {
      ...localize2("miTwoColumnsEditorLayoutWithoutMnemonic", "Two Columns"),
      mnemonicTitle: localize({ key: "miTwoColumnsEditorLayout", comment: ["&& denotes a mnemonic"] }, "&&Two Columns")
    }
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutThreeColumnsAction.ID,
    title: {
      ...localize2("miThreeColumnsEditorLayoutWithoutMnemonic", "Three Columns"),
      mnemonicTitle: localize({ key: "miThreeColumnsEditorLayout", comment: ["&& denotes a mnemonic"] }, "T&&hree Columns")
    }
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoRowsAction.ID,
    title: {
      ...localize2("miTwoRowsEditorLayoutWithoutMnemonic", "Two Rows"),
      mnemonicTitle: localize({ key: "miTwoRowsEditorLayout", comment: ["&& denotes a mnemonic"] }, "T&&wo Rows")
    }
  },
  order: 5
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutThreeRowsAction.ID,
    title: {
      ...localize2("miThreeRowsEditorLayoutWithoutMnemonic", "Three Rows"),
      mnemonicTitle: localize({ key: "miThreeRowsEditorLayout", comment: ["&& denotes a mnemonic"] }, "Three &&Rows")
    }
  },
  order: 6
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoByTwoGridAction.ID,
    title: {
      ...localize2("miTwoByTwoGridEditorLayoutWithoutMnemonic", "Grid (2x2)"),
      mnemonicTitle: localize({ key: "miTwoByTwoGridEditorLayout", comment: ["&& denotes a mnemonic"] }, "&&Grid (2x2)")
    }
  },
  order: 7
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoRowsRightAction.ID,
    title: {
      ...localize2("miTwoRowsRightEditorLayoutWithoutMnemonic", "Two Rows Right"),
      mnemonicTitle: localize({ key: "miTwoRowsRightEditorLayout", comment: ["&& denotes a mnemonic"] }, "Two R&&ows Right")
    }
  },
  order: 8
});
MenuRegistry.appendMenuItem(MenuId.MenubarLayoutMenu, {
  group: "4_layouts",
  command: {
    id: EditorLayoutTwoColumnsBottomAction.ID,
    title: {
      ...localize2("miTwoColumnsBottomEditorLayoutWithoutMnemonic", "Two Columns Bottom"),
      mnemonicTitle: localize({ key: "miTwoColumnsBottomEditorLayout", comment: ["&& denotes a mnemonic"] }, "Two &&Columns Bottom")
    }
  },
  order: 9
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "1_history_nav",
  command: {
    id: "workbench.action.navigateToLastEditLocation",
    title: localize({ key: "miLastEditLocation", comment: ["&& denotes a mnemonic"] }, "&&Last Edit Location"),
    precondition: ContextKeyExpr.has("canNavigateToLastEditLocation")
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "1_sideBySide",
  command: {
    id: FOCUS_FIRST_SIDE_EDITOR,
    title: localize({ key: "miFirstSideEditor", comment: ["&& denotes a mnemonic"] }, "&&First Side in Editor")
  },
  when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "1_sideBySide",
  command: {
    id: FOCUS_SECOND_SIDE_EDITOR,
    title: localize({ key: "miSecondSideEditor", comment: ["&& denotes a mnemonic"] }, "&&Second Side in Editor")
  },
  when: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "2_any",
  command: {
    id: "workbench.action.nextEditor",
    title: localize({ key: "miNextEditor", comment: ["&& denotes a mnemonic"] }, "&&Next Editor")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "2_any",
  command: {
    id: "workbench.action.previousEditor",
    title: localize({ key: "miPreviousEditor", comment: ["&& denotes a mnemonic"] }, "&&Previous Editor")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "3_any_used",
  command: {
    id: "workbench.action.openNextRecentlyUsedEditor",
    title: localize({ key: "miNextRecentlyUsedEditor", comment: ["&& denotes a mnemonic"] }, "&&Next Used Editor")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "3_any_used",
  command: {
    id: "workbench.action.openPreviousRecentlyUsedEditor",
    title: localize({ key: "miPreviousRecentlyUsedEditor", comment: ["&& denotes a mnemonic"] }, "&&Previous Used Editor")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "4_group",
  command: {
    id: "workbench.action.nextEditorInGroup",
    title: localize({ key: "miNextEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Next Editor in Group")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "4_group",
  command: {
    id: "workbench.action.previousEditorInGroup",
    title: localize({ key: "miPreviousEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Previous Editor in Group")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "5_group_used",
  command: {
    id: "workbench.action.openNextRecentlyUsedEditorInGroup",
    title: localize({ key: "miNextUsedEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Next Used Editor in Group")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchEditorMenu, {
  group: "5_group_used",
  command: {
    id: "workbench.action.openPreviousRecentlyUsedEditorInGroup",
    title: localize({ key: "miPreviousUsedEditorInGroup", comment: ["&& denotes a mnemonic"] }, "&&Previous Used Editor in Group")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "2_editor_nav",
  title: localize({ key: "miSwitchEditor", comment: ["&& denotes a mnemonic"] }, "Switch &&Editor"),
  submenu: MenuId.MenubarSwitchEditorMenu,
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusFirstEditorGroup",
    title: localize({ key: "miFocusFirstGroup", comment: ["&& denotes a mnemonic"] }, "Group &&1")
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusSecondEditorGroup",
    title: localize({ key: "miFocusSecondGroup", comment: ["&& denotes a mnemonic"] }, "Group &&2")
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusThirdEditorGroup",
    title: localize({ key: "miFocusThirdGroup", comment: ["&& denotes a mnemonic"] }, "Group &&3"),
    precondition: MultipleEditorGroupsContext
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusFourthEditorGroup",
    title: localize({ key: "miFocusFourthGroup", comment: ["&& denotes a mnemonic"] }, "Group &&4"),
    precondition: MultipleEditorGroupsContext
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "1_focus_index",
  command: {
    id: "workbench.action.focusFifthEditorGroup",
    title: localize({ key: "miFocusFifthGroup", comment: ["&& denotes a mnemonic"] }, "Group &&5"),
    precondition: MultipleEditorGroupsContext
  },
  order: 5
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "2_next_prev",
  command: {
    id: "workbench.action.focusNextGroup",
    title: localize({ key: "miNextGroup", comment: ["&& denotes a mnemonic"] }, "&&Next Group"),
    precondition: MultipleEditorGroupsContext
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "2_next_prev",
  command: {
    id: "workbench.action.focusPreviousGroup",
    title: localize({ key: "miPreviousGroup", comment: ["&& denotes a mnemonic"] }, "&&Previous Group"),
    precondition: MultipleEditorGroupsContext
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusLeftGroup",
    title: localize({ key: "miFocusLeftGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Left"),
    precondition: MultipleEditorGroupsContext
  },
  order: 1
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusRightGroup",
    title: localize({ key: "miFocusRightGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Right"),
    precondition: MultipleEditorGroupsContext
  },
  order: 2
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusAboveGroup",
    title: localize({ key: "miFocusAboveGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Above"),
    precondition: MultipleEditorGroupsContext
  },
  order: 3
});
MenuRegistry.appendMenuItem(MenuId.MenubarSwitchGroupMenu, {
  group: "3_directional",
  command: {
    id: "workbench.action.focusBelowGroup",
    title: localize({ key: "miFocusBelowGroup", comment: ["&& denotes a mnemonic"] }, "Group &&Below"),
    precondition: MultipleEditorGroupsContext
  },
  order: 4
});
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "2_editor_nav",
  title: localize({ key: "miSwitchGroup", comment: ["&& denotes a mnemonic"] }, "Switch &&Group"),
  submenu: MenuId.MenubarSwitchGroupMenu,
  order: 2
});
registerEditorFontConfigurations(getFontSnippets);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvci5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lUmVnaXN0cnksIEVkaXRvclBhbmVEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JGYWN0b3J5UmVnaXN0cnksIEVkaXRvckV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7XG5cdFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCwgQWN0aXZlRWRpdG9yUGlubmVkQ29udGV4dCwgRWRpdG9yR3JvdXBFZGl0b3JzQ291bnRDb250ZXh0LCBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LCBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0LFxuXHRFZGl0b3JQYXJ0TXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LCBBY3RpdmVFZGl0b3JEaXJ0eUNvbnRleHQsIEFjdGl2ZUVkaXRvckdyb3VwTG9ja2VkQ29udGV4dCwgQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCwgU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsXG5cdEVkaXRvclRhYnNWaXNpYmxlQ29udGV4dCwgQWN0aXZlRWRpdG9yTGFzdEluR3JvdXBDb250ZXh0LCBFZGl0b3JQYXJ0TWF4aW1pemVkRWRpdG9yR3JvdXBDb250ZXh0LCBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQsIEluRWRpdG9yWmVuTW9kZUNvbnRleHQsXG5cdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgQWN0aXZlQ29tcGFyZUVkaXRvckNhblN3YXBDb250ZXh0LCBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0LCBTcGxpdEVkaXRvcnNWZXJ0aWNhbGx5LCBBY3RpdmVFZGl0b3JDYW5ub3RDbG9zZUNvbnRleHQsXG5cdElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBBY3RpdmVDdXN0b21FZGl0b3JEaWZmQ2FuVG9nZ2xlTGF5b3V0Q29udGV4dCwgQWN0aXZlQ3VzdG9tRWRpdG9yVGV4dERpZmZDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0XG59IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIFNpZGVCeVNpZGVFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBUZXh0UmVzb3VyY2VFZGl0b3IgfSBmcm9tICcuL3RleHRSZXNvdXJjZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi9zaWRlQnlTaWRlRWRpdG9yLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCwgRGlmZkVkaXRvcklucHV0U2VyaWFsaXplciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFVudGl0bGVkVGV4dEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdW50aXRsZWQvY29tbW9uL3VudGl0bGVkVGV4dEVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci90ZXh0UmVzb3VyY2VFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBUZXh0RGlmZkVkaXRvciB9IGZyb20gJy4vdGV4dERpZmZFZGl0b3IuanMnO1xuaW1wb3J0IHsgQmluYXJ5UmVzb3VyY2VEaWZmRWRpdG9yIH0gZnJvbSAnLi9iaW5hcnlEaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IENoYW5nZUVuY29kaW5nQWN0aW9uLCBDaGFuZ2VFT0xBY3Rpb24sIENoYW5nZUxhbmd1YWdlQWN0aW9uLCBFZGl0b3JTdGF0dXNDb250cmlidXRpb24gfSBmcm9tICcuL2VkaXRvclN0YXR1cy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgTWVudUlkLCBJTWVudUl0ZW0sIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQge1xuXHRDbG9zZUVkaXRvcnNJbk90aGVyR3JvdXBzQWN0aW9uLCBDbG9zZUFsbEVkaXRvcnNBY3Rpb24sIE1vdmVHcm91cExlZnRBY3Rpb24sIE1vdmVHcm91cFJpZ2h0QWN0aW9uLCBTcGxpdEVkaXRvckFjdGlvbiwgSm9pblR3b0dyb3Vwc0FjdGlvbiwgUmV2ZXJ0QW5kQ2xvc2VFZGl0b3JBY3Rpb24sXG5cdE5hdmlnYXRlQmV0d2Vlbkdyb3Vwc0FjdGlvbiwgRm9jdXNBY3RpdmVHcm91cEFjdGlvbiwgRm9jdXNGaXJzdEdyb3VwQWN0aW9uLCBSZXNldEdyb3VwU2l6ZXNBY3Rpb24sIE1pbmltaXplT3RoZXJHcm91cHNBY3Rpb24sIEZvY3VzUHJldmlvdXNHcm91cCwgRm9jdXNOZXh0R3JvdXAsXG5cdENsb3NlTGVmdEVkaXRvcnNJbkdyb3VwQWN0aW9uLCBPcGVuTmV4dEVkaXRvciwgT3BlblByZXZpb3VzRWRpdG9yLCBOYXZpZ2F0ZUJhY2t3YXJkc0FjdGlvbiwgTmF2aWdhdGVGb3J3YXJkQWN0aW9uLCBOYXZpZ2F0ZVByZXZpb3VzQWN0aW9uLCBSZW9wZW5DbG9zZWRFZGl0b3JBY3Rpb24sXG5cdFF1aWNrQWNjZXNzUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uLCBRdWlja0FjY2Vzc1ByZXZpb3VzRWRpdG9yRnJvbUhpc3RvcnlBY3Rpb24sIFNob3dBbGxFZGl0b3JzQnlBcHBlYXJhbmNlQWN0aW9uLCBDbGVhckVkaXRvckhpc3RvcnlBY3Rpb24sIE1vdmVFZGl0b3JSaWdodEluR3JvdXBBY3Rpb24sIE9wZW5OZXh0RWRpdG9ySW5Hcm91cCxcblx0T3BlblByZXZpb3VzRWRpdG9ySW5Hcm91cCwgT3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3JBY3Rpb24sIE9wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckFjdGlvbiwgTW92ZUVkaXRvclRvUHJldmlvdXNHcm91cEFjdGlvbixcblx0TW92ZUVkaXRvclRvTmV4dEdyb3VwQWN0aW9uLCBNb3ZlRWRpdG9yVG9GaXJzdEdyb3VwQWN0aW9uLCBNb3ZlRWRpdG9yTGVmdEluR3JvdXBBY3Rpb24sIE1vdmVFZGl0b3JUb1N0YXJ0QWN0aW9uLCBNb3ZlRWRpdG9yVG9FbmRBY3Rpb24sIENsZWFyUmVjZW50RmlsZXNBY3Rpb24sIE9wZW5MYXN0RWRpdG9ySW5Hcm91cCxcblx0U2hvd0VkaXRvcnNJbkFjdGl2ZUdyb3VwQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uLCBNb3ZlRWRpdG9yVG9MYXN0R3JvdXBBY3Rpb24sIE9wZW5GaXJzdEVkaXRvckluR3JvdXAsIE1vdmVHcm91cFVwQWN0aW9uLCBNb3ZlR3JvdXBEb3duQWN0aW9uLCBGb2N1c0xhc3RHcm91cEFjdGlvbiwgU3BsaXRFZGl0b3JMZWZ0QWN0aW9uLCBTcGxpdEVkaXRvclJpZ2h0QWN0aW9uLFxuXHRTcGxpdEVkaXRvclVwQWN0aW9uLCBTcGxpdEVkaXRvckRvd25BY3Rpb24sIE1vdmVFZGl0b3JUb0xlZnRHcm91cEFjdGlvbiwgTW92ZUVkaXRvclRvUmlnaHRHcm91cEFjdGlvbiwgTW92ZUVkaXRvclRvQWJvdmVHcm91cEFjdGlvbiwgTW92ZUVkaXRvclRvQmVsb3dHcm91cEFjdGlvbiwgQ2xvc2VBbGxFZGl0b3JHcm91cHNBY3Rpb24sXG5cdEpvaW5BbGxHcm91cHNBY3Rpb24sIEZvY3VzTGVmdEdyb3VwLCBGb2N1c0Fib3ZlR3JvdXAsIEZvY3VzUmlnaHRHcm91cCwgRm9jdXNCZWxvd0dyb3VwLCBFZGl0b3JMYXlvdXRTaW5nbGVBY3Rpb24sIEVkaXRvckxheW91dFR3b0NvbHVtbnNBY3Rpb24sIEVkaXRvckxheW91dFRocmVlQ29sdW1uc0FjdGlvbiwgRWRpdG9yTGF5b3V0VHdvQnlUd29HcmlkQWN0aW9uLFxuXHRFZGl0b3JMYXlvdXRUd29Sb3dzQWN0aW9uLCBFZGl0b3JMYXlvdXRUaHJlZVJvd3NBY3Rpb24sIEVkaXRvckxheW91dFR3b0NvbHVtbnNCb3R0b21BY3Rpb24sIEVkaXRvckxheW91dFR3b1Jvd3NSaWdodEFjdGlvbiwgTmV3RWRpdG9yR3JvdXBMZWZ0QWN0aW9uLCBOZXdFZGl0b3JHcm91cFJpZ2h0QWN0aW9uLFxuXHROZXdFZGl0b3JHcm91cEFib3ZlQWN0aW9uLCBOZXdFZGl0b3JHcm91cEJlbG93QWN0aW9uLCBTcGxpdEVkaXRvck9ydGhvZ29uYWxBY3Rpb24sIENsb3NlRWRpdG9ySW5BbGxHcm91cHNBY3Rpb24sIE5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uQWN0aW9uLCBUb2dnbGVHcm91cFNpemVzQWN0aW9uLCBTaG93QWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZEFjdGlvbixcblx0UXVpY2tBY2Nlc3NQcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckFjdGlvbiwgT3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cEFjdGlvbiwgT3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uLCBRdWlja0FjY2Vzc0xlYXN0UmVjZW50bHlVc2VkRWRpdG9yQWN0aW9uLCBRdWlja0FjY2Vzc0xlYXN0UmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cEFjdGlvbixcblx0UmVPcGVuSW5UZXh0RWRpdG9yQWN0aW9uLCBEdXBsaWNhdGVHcm91cERvd25BY3Rpb24sIER1cGxpY2F0ZUdyb3VwTGVmdEFjdGlvbiwgRHVwbGljYXRlR3JvdXBSaWdodEFjdGlvbiwgRHVwbGljYXRlR3JvdXBVcEFjdGlvbiwgVG9nZ2xlRWRpdG9yVHlwZUFjdGlvbiwgU3BsaXRFZGl0b3JUb0Fib3ZlR3JvdXBBY3Rpb24sIFNwbGl0RWRpdG9yVG9CZWxvd0dyb3VwQWN0aW9uLFxuXHRTcGxpdEVkaXRvclRvRmlyc3RHcm91cEFjdGlvbiwgU3BsaXRFZGl0b3JUb0xhc3RHcm91cEFjdGlvbiwgU3BsaXRFZGl0b3JUb0xlZnRHcm91cEFjdGlvbiwgU3BsaXRFZGl0b3JUb05leHRHcm91cEFjdGlvbiwgU3BsaXRFZGl0b3JUb1ByZXZpb3VzR3JvdXBBY3Rpb24sIFNwbGl0RWRpdG9yVG9SaWdodEdyb3VwQWN0aW9uLCBOYXZpZ2F0ZUZvcndhcmRJbkVkaXRzQWN0aW9uLFxuXHROYXZpZ2F0ZUJhY2t3YXJkc0luRWRpdHNBY3Rpb24sIE5hdmlnYXRlRm9yd2FyZEluTmF2aWdhdGlvbnNBY3Rpb24sIE5hdmlnYXRlQmFja3dhcmRzSW5OYXZpZ2F0aW9uc0FjdGlvbiwgTmF2aWdhdGVQcmV2aW91c0luTmF2aWdhdGlvbnNBY3Rpb24sIE5hdmlnYXRlUHJldmlvdXNJbkVkaXRzQWN0aW9uLCBOYXZpZ2F0ZVRvTGFzdE5hdmlnYXRpb25Mb2NhdGlvbkFjdGlvbixcblx0TWF4aW1pemVHcm91cEhpZGVTaWRlYmFyQWN0aW9uLCBNb3ZlRWRpdG9yVG9OZXdXaW5kb3dBY3Rpb24sIENvcHlFZGl0b3JUb05ld2luZG93QWN0aW9uLCBSZXN0b3JlRWRpdG9yc1RvTWFpbldpbmRvd0FjdGlvbiwgVG9nZ2xlTWF4aW1pemVFZGl0b3JHcm91cEFjdGlvbiwgTWluaW1pemVPdGhlckdyb3Vwc0hpZGVTaWRlYmFyQWN0aW9uLCBDb3B5RWRpdG9yR3JvdXBUb05ld1dpbmRvd0FjdGlvbixcblx0TW92ZUVkaXRvckdyb3VwVG9OZXdXaW5kb3dBY3Rpb24sIE5ld0VtcHR5RWRpdG9yV2luZG93QWN0aW9uLFxuXHRDbGVhckVkaXRvckhpc3RvcnlXaXRob3V0Q29uZmlybUFjdGlvblxufSBmcm9tICcuL2VkaXRvckFjdGlvbnMuanMnO1xuaW1wb3J0IHtcblx0Q0xPU0VfRURJVE9SU19BTkRfR1JPVVBfQ09NTUFORF9JRCwgQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELCBDTE9TRV9FRElUT1JTX1RPX1RIRV9SSUdIVF9DT01NQU5EX0lELCBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCwgQ0xPU0VfRURJVE9SX0dST1VQX0NPTU1BTkRfSUQsIENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCxcblx0Q0xPU0VfUElOTkVEX0VESVRPUl9DT01NQU5EX0lELCBDTE9TRV9TQVZFRF9FRElUT1JTX0NPTU1BTkRfSUQsIEtFRVBfRURJVE9SX0NPTU1BTkRfSUQsIFBJTl9FRElUT1JfQ09NTUFORF9JRCwgU0hPV19FRElUT1JTX0lOX0dST1VQLCBTUExJVF9FRElUT1JfRE9XTiwgU1BMSVRfRURJVE9SX0xFRlQsXG5cdFNQTElUX0VESVRPUl9SSUdIVCwgU1BMSVRfRURJVE9SX1VQLCBUT0dHTEVfS0VFUF9FRElUT1JTX0NPTU1BTkRfSUQsIFVOUElOX0VESVRPUl9DT01NQU5EX0lELCBzZXR1cCBhcyByZWdpc3RlckVkaXRvckNvbW1hbmRzLCBSRU9QRU5fV0lUSF9DT01NQU5EX0lELFxuXHRUT0dHTEVfTE9DS19HUk9VUF9DT01NQU5EX0lELCBVTkxPQ0tfR1JPVVBfQ09NTUFORF9JRCwgU1BMSVRfRURJVE9SX0lOX0dST1VQLCBKT0lOX0VESVRPUl9JTl9HUk9VUCwgRk9DVVNfRklSU1RfU0lERV9FRElUT1IsIEZPQ1VTX1NFQ09ORF9TSURFX0VESVRPUiwgVE9HR0xFX1NQTElUX0VESVRPUl9JTl9HUk9VUF9MQVlPVVQsIExPQ0tfR1JPVVBfQ09NTUFORF9JRCxcblx0U1BMSVRfRURJVE9SLCBUT0dHTEVfTUFYSU1JWkVfRURJVE9SX0dST1VQLCBNT1ZFX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCwgQ09QWV9FRElUT1JfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQsIE1PVkVfRURJVE9SX0dST1VQX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELCBDT1BZX0VESVRPUl9HUk9VUF9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCxcblx0TkVXX0VNUFRZX0VESVRPUl9XSU5ET1dfQ09NTUFORF9JRCwgTU9WRV9FRElUT1JfSU5UT19SSUdIVF9HUk9VUCwgTU9WRV9FRElUT1JfSU5UT19MRUZUX0dST1VQLCBNT1ZFX0VESVRPUl9JTlRPX0FCT1ZFX0dST1VQLCBNT1ZFX0VESVRPUl9JTlRPX0JFTE9XX0dST1VQXG59IGZyb20gJy4vZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgR09UT19ORVhUX0NIQU5HRSwgR09UT19QUkVWSU9VU19DSEFOR0UsIFRPR0dMRV9ESUZGX0lHTk9SRV9UUklNX1dISVRFU1BBQ0UsIFRPR0dMRV9ESUZGX1NJREVfQllfU0lERSwgRElGRl9TV0FQX1NJREVTIH0gZnJvbSAnLi9kaWZmRWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgaW5RdWlja1BpY2tDb250ZXh0LCBnZXRRdWlja05hdmlnYXRlSGFuZGxlciB9IGZyb20gJy4uLy4uL3F1aWNrYWNjZXNzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQXV0b1NhdmUgfSBmcm9tICcuL2VkaXRvckF1dG9TYXZlLmpzJztcbmltcG9ydCB7IElRdWlja0FjY2Vzc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFF1aWNrQWNjZXNzRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IEFjdGl2ZUdyb3VwRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLCBBbGxFZGl0b3JzQnlBcHBlYXJhbmNlUXVpY2tBY2Nlc3MsIEFsbEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2VzcyB9IGZyb20gJy4vZWRpdG9yUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXRTZXJpYWxpemVyLCBVbnRpdGxlZFRleHRFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9ySGFuZGxlci5qcyc7XG5pbXBvcnQgeyBEeW5hbWljRWRpdG9yQ29uZmlndXJhdGlvbnMgfSBmcm9tICcuL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlRWRpdG9yQWN0aW9uLCBDb25maWd1cmVFZGl0b3JUYWJzQWN0aW9uLCBFZGl0b3JBY3Rpb25zRGVmYXVsdEFjdGlvbiwgRWRpdG9yQWN0aW9uc1RpdGxlQmFyQWN0aW9uLCBIaWRlRWRpdG9yQWN0aW9uc0FjdGlvbiwgSGlkZUVkaXRvclRhYnNBY3Rpb24sIFNob3dNdWx0aXBsZUVkaXRvclRhYnNBY3Rpb24sIFNob3dTaW5nbGVFZGl0b3JUYWJBY3Rpb24sIFplbkhpZGVFZGl0b3JUYWJzQWN0aW9uLCBaZW5TaG93TXVsdGlwbGVFZGl0b3JUYWJzQWN0aW9uLCBaZW5TaG93U2luZ2xlRWRpdG9yVGFiQWN0aW9uIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9sYXlvdXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IGdldEZvbnRTbmlwcGV0cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb250cy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckVkaXRvckZvbnRDb25maWd1cmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEuanMnO1xuXG4vLyNyZWdpb24gRWRpdG9yIFJlZ2lzdHJhdGlvbnNcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRUZXh0UmVzb3VyY2VFZGl0b3IsXG5cdFx0VGV4dFJlc291cmNlRWRpdG9yLklELFxuXHRcdGxvY2FsaXplKCd0ZXh0RWRpdG9yJywgXCJUZXh0IEVkaXRvclwiKSxcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihVbnRpdGxlZFRleHRFZGl0b3JJbnB1dCksXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKFRleHRSZXNvdXJjZUVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdFRleHREaWZmRWRpdG9yLFxuXHRcdFRleHREaWZmRWRpdG9yLklELFxuXHRcdGxvY2FsaXplKCd0ZXh0RGlmZkVkaXRvcicsIFwiVGV4dCBEaWZmIEVkaXRvclwiKVxuXHQpLFxuXHRbXG5cdFx0bmV3IFN5bmNEZXNjcmlwdG9yKERpZmZFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuUmVnaXN0cnkuYXM8SUVkaXRvclBhbmVSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JQYW5lKS5yZWdpc3RlckVkaXRvclBhbmUoXG5cdEVkaXRvclBhbmVEZXNjcmlwdG9yLmNyZWF0ZShcblx0XHRCaW5hcnlSZXNvdXJjZURpZmZFZGl0b3IsXG5cdFx0QmluYXJ5UmVzb3VyY2VEaWZmRWRpdG9yLklELFxuXHRcdGxvY2FsaXplKCdiaW5hcnlEaWZmRWRpdG9yJywgXCJCaW5hcnkgRGlmZiBFZGl0b3JcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihEaWZmRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0U2lkZUJ5U2lkZUVkaXRvcixcblx0XHRTaWRlQnlTaWRlRWRpdG9yLklELFxuXHRcdGxvY2FsaXplKCdzaWRlQnlTaWRlRWRpdG9yJywgXCJTaWRlIGJ5IFNpZGUgRWRpdG9yXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoU2lkZUJ5U2lkZUVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihVbnRpdGxlZFRleHRFZGl0b3JJbnB1dC5JRCwgVW50aXRsZWRUZXh0RWRpdG9ySW5wdXRTZXJpYWxpemVyKTtcblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSkucmVnaXN0ZXJFZGl0b3JTZXJpYWxpemVyKFNpZGVCeVNpZGVFZGl0b3JJbnB1dC5JRCwgU2lkZUJ5U2lkZUVkaXRvcklucHV0U2VyaWFsaXplcik7XG5SZWdpc3RyeS5hczxJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvckZhY3RvcnkpLnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihEaWZmRWRpdG9ySW5wdXQuSUQsIERpZmZFZGl0b3JJbnB1dFNlcmlhbGl6ZXIpO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIFdvcmtiZW5jaCBDb250cmlidXRpb25zXG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihFZGl0b3JBdXRvU2F2ZS5JRCwgRWRpdG9yQXV0b1NhdmUsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRWRpdG9yU3RhdHVzQ29udHJpYnV0aW9uLklELCBFZGl0b3JTdGF0dXNDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoVW50aXRsZWRUZXh0RWRpdG9yV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyLklELCBVbnRpdGxlZFRleHRFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRHluYW1pY0VkaXRvckNvbmZpZ3VyYXRpb25zLklELCBEeW5hbWljRWRpdG9yQ29uZmlndXJhdGlvbnMsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gUXVpY2sgQWNjZXNzXG5cbmNvbnN0IHF1aWNrQWNjZXNzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJUXVpY2tBY2Nlc3NSZWdpc3RyeT4oUXVpY2tBY2Nlc3NFeHRlbnNpb25zLlF1aWNrYWNjZXNzKTtcbmNvbnN0IGVkaXRvclBpY2tlckNvbnRleHRLZXkgPSAnaW5FZGl0b3JzUGlja2VyJztcbmNvbnN0IGVkaXRvclBpY2tlckNvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoaW5RdWlja1BpY2tDb250ZXh0LCBDb250ZXh0S2V5RXhwci5oYXMoZWRpdG9yUGlja2VyQ29udGV4dEtleSkpO1xuXG5xdWlja0FjY2Vzc1JlZ2lzdHJ5LnJlZ2lzdGVyUXVpY2tBY2Nlc3NQcm92aWRlcih7XG5cdGN0b3I6IEFjdGl2ZUdyb3VwRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLFxuXHRwcmVmaXg6IEFjdGl2ZUdyb3VwRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLlBSRUZJWCxcblx0Y29udGV4dEtleTogZWRpdG9yUGlja2VyQ29udGV4dEtleSxcblx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdlZGl0b3JRdWlja0FjY2Vzc1BsYWNlaG9sZGVyJywgXCJUeXBlIHRoZSBuYW1lIG9mIGFuIGVkaXRvciB0byBvcGVuIGl0LlwiKSxcblx0aGVscEVudHJpZXM6IFt7IGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWN0aXZlR3JvdXBFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkUXVpY2tBY2Nlc3MnLCBcIlNob3cgRWRpdG9ycyBpbiBBY3RpdmUgR3JvdXAgYnkgTW9zdCBSZWNlbnRseSBVc2VkXCIpLCBjb21tYW5kSWQ6IFNob3dFZGl0b3JzSW5BY3RpdmVHcm91cEJ5TW9zdFJlY2VudGx5VXNlZEFjdGlvbi5JRCB9XVxufSk7XG5cbnF1aWNrQWNjZXNzUmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHtcblx0Y3RvcjogQWxsRWRpdG9yc0J5QXBwZWFyYW5jZVF1aWNrQWNjZXNzLFxuXHRwcmVmaXg6IEFsbEVkaXRvcnNCeUFwcGVhcmFuY2VRdWlja0FjY2Vzcy5QUkVGSVgsXG5cdGNvbnRleHRLZXk6IGVkaXRvclBpY2tlckNvbnRleHRLZXksXG5cdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnZWRpdG9yUXVpY2tBY2Nlc3NQbGFjZWhvbGRlcicsIFwiVHlwZSB0aGUgbmFtZSBvZiBhbiBlZGl0b3IgdG8gb3BlbiBpdC5cIiksXG5cdGhlbHBFbnRyaWVzOiBbeyBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FsbEVkaXRvcnNCeUFwcGVhcmFuY2VRdWlja0FjY2VzcycsIFwiU2hvdyBBbGwgT3BlbmVkIEVkaXRvcnMgQnkgQXBwZWFyYW5jZVwiKSwgY29tbWFuZElkOiBTaG93QWxsRWRpdG9yc0J5QXBwZWFyYW5jZUFjdGlvbi5JRCB9XVxufSk7XG5cbnF1aWNrQWNjZXNzUmVnaXN0cnkucmVnaXN0ZXJRdWlja0FjY2Vzc1Byb3ZpZGVyKHtcblx0Y3RvcjogQWxsRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzLFxuXHRwcmVmaXg6IEFsbEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2Vzcy5QUkVGSVgsXG5cdGNvbnRleHRLZXk6IGVkaXRvclBpY2tlckNvbnRleHRLZXksXG5cdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnZWRpdG9yUXVpY2tBY2Nlc3NQbGFjZWhvbGRlcicsIFwiVHlwZSB0aGUgbmFtZSBvZiBhbiBlZGl0b3IgdG8gb3BlbiBpdC5cIiksXG5cdGhlbHBFbnRyaWVzOiBbeyBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FsbEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2VzcycsIFwiU2hvdyBBbGwgT3BlbmVkIEVkaXRvcnMgQnkgTW9zdCBSZWNlbnRseSBVc2VkXCIpLCBjb21tYW5kSWQ6IFNob3dBbGxFZGl0b3JzQnlNb3N0UmVjZW50bHlVc2VkQWN0aW9uLklEIH1dXG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBBY3Rpb25zICYgQ29tbWFuZHNcblxucmVnaXN0ZXJBY3Rpb24yKENoYW5nZUxhbmd1YWdlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDaGFuZ2VFT0xBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENoYW5nZUVuY29kaW5nQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlRm9yd2FyZEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVCYWNrd2FyZHNBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoT3Blbk5leHRFZGl0b3IpO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5QcmV2aW91c0VkaXRvcik7XG5yZWdpc3RlckFjdGlvbjIoT3Blbk5leHRFZGl0b3JJbkdyb3VwKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuUHJldmlvdXNFZGl0b3JJbkdyb3VwKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuRmlyc3RFZGl0b3JJbkdyb3VwKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuTGFzdEVkaXRvckluR3JvdXApO1xuXG5yZWdpc3RlckFjdGlvbjIoT3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3JBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoT3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihPcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKFJlb3BlbkNsb3NlZEVkaXRvckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2xlYXJSZWNlbnRGaWxlc0FjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihTaG93QWxsRWRpdG9yc0J5QXBwZWFyYW5jZUFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU2hvd0FsbEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNob3dFZGl0b3JzSW5BY3RpdmVHcm91cEJ5TW9zdFJlY2VudGx5VXNlZEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihDbG9zZUFsbEVkaXRvcnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENsb3NlQWxsRWRpdG9yR3JvdXBzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbG9zZUxlZnRFZGl0b3JzSW5Hcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2xvc2VFZGl0b3JzSW5PdGhlckdyb3Vwc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2xvc2VFZGl0b3JJbkFsbEdyb3Vwc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUmV2ZXJ0QW5kQ2xvc2VFZGl0b3JBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yT3J0aG9nb25hbEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihTcGxpdEVkaXRvckxlZnRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yUmlnaHRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yVXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yRG93bkFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihKb2luVHdvR3JvdXBzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihKb2luQWxsR3JvdXBzQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlQmV0d2Vlbkdyb3Vwc0FjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihSZXNldEdyb3VwU2l6ZXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUdyb3VwU2l6ZXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1heGltaXplR3JvdXBIaWRlU2lkZWJhckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlTWF4aW1pemVFZGl0b3JHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTWluaW1pemVPdGhlckdyb3Vwc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTWluaW1pemVPdGhlckdyb3Vwc0hpZGVTaWRlYmFyQWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKE1vdmVFZGl0b3JMZWZ0SW5Hcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclJpZ2h0SW5Hcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvU3RhcnRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1vdmVFZGl0b3JUb0VuZEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihNb3ZlR3JvdXBMZWZ0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlR3JvdXBSaWdodEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUdyb3VwVXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1vdmVHcm91cERvd25BY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoRHVwbGljYXRlR3JvdXBMZWZ0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihEdXBsaWNhdGVHcm91cFJpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihEdXBsaWNhdGVHcm91cFVwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihEdXBsaWNhdGVHcm91cERvd25BY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvUHJldmlvdXNHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvTmV4dEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9GaXJzdEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihNb3ZlRWRpdG9yVG9MYXN0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE1vdmVFZGl0b3JUb0xlZnRHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvUmlnaHRHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvQWJvdmVHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvQmVsb3dHcm91cEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihTcGxpdEVkaXRvclRvUHJldmlvdXNHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JUb05leHRHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JUb0ZpcnN0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yVG9MYXN0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yVG9MZWZ0R3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNwbGl0RWRpdG9yVG9SaWdodEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihTcGxpdEVkaXRvclRvQWJvdmVHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoU3BsaXRFZGl0b3JUb0JlbG93R3JvdXBBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoRm9jdXNBY3RpdmVHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNGaXJzdEdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c0xhc3RHcm91cEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNQcmV2aW91c0dyb3VwKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c05leHRHcm91cCk7XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNMZWZ0R3JvdXApO1xucmVnaXN0ZXJBY3Rpb24yKEZvY3VzUmlnaHRHcm91cCk7XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNBYm92ZUdyb3VwKTtcbnJlZ2lzdGVyQWN0aW9uMihGb2N1c0JlbG93R3JvdXApO1xuXG5yZWdpc3RlckFjdGlvbjIoTmV3RWRpdG9yR3JvdXBMZWZ0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOZXdFZGl0b3JHcm91cFJpZ2h0QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOZXdFZGl0b3JHcm91cEFib3ZlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOZXdFZGl0b3JHcm91cEJlbG93QWN0aW9uKTtcblxucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlUHJldmlvdXNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlRm9yd2FyZEluRWRpdHNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlQmFja3dhcmRzSW5FZGl0c0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmF2aWdhdGVQcmV2aW91c0luRWRpdHNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOYXZpZ2F0ZUZvcndhcmRJbk5hdmlnYXRpb25zQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOYXZpZ2F0ZUJhY2t3YXJkc0luTmF2aWdhdGlvbnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE5hdmlnYXRlUHJldmlvdXNJbk5hdmlnYXRpb25zQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihOYXZpZ2F0ZVRvTGFzdE5hdmlnYXRpb25Mb2NhdGlvbkFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoQ2xlYXJFZGl0b3JIaXN0b3J5QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDbGVhckVkaXRvckhpc3RvcnlXaXRob3V0Q29uZmlybUFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihFZGl0b3JMYXlvdXRTaW5nbGVBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckxheW91dFR3b0NvbHVtbnNBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckxheW91dFRocmVlQ29sdW1uc0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yTGF5b3V0VHdvUm93c0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yTGF5b3V0VGhyZWVSb3dzQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihFZGl0b3JMYXlvdXRUd29CeVR3b0dyaWRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKEVkaXRvckxheW91dFR3b1Jvd3NSaWdodEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRWRpdG9yTGF5b3V0VHdvQ29sdW1uc0JvdHRvbUFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihUb2dnbGVFZGl0b3JUeXBlQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZU9wZW5JblRleHRFZGl0b3JBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoUXVpY2tBY2Nlc3NQcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUXVpY2tBY2Nlc3NMZWFzdFJlY2VudGx5VXNlZEVkaXRvckFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUXVpY2tBY2Nlc3NQcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckluR3JvdXBBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFF1aWNrQWNjZXNzTGVhc3RSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihRdWlja0FjY2Vzc1ByZXZpb3VzRWRpdG9yRnJvbUhpc3RvcnlBY3Rpb24pO1xuXG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvclRvTmV3V2luZG93QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihDb3B5RWRpdG9yVG9OZXdpbmRvd0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTW92ZUVkaXRvckdyb3VwVG9OZXdXaW5kb3dBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKENvcHlFZGl0b3JHcm91cFRvTmV3V2luZG93QWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihSZXN0b3JlRWRpdG9yc1RvTWFpbldpbmRvd0FjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoTmV3RW1wdHlFZGl0b3JXaW5kb3dBY3Rpb24pO1xuXG5jb25zdCBxdWlja0FjY2Vzc05hdmlnYXRlTmV4dEluRWRpdG9yUGlja2VySWQgPSAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5OYXZpZ2F0ZU5leHRJbkVkaXRvclBpY2tlcic7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IHF1aWNrQWNjZXNzTmF2aWdhdGVOZXh0SW5FZGl0b3JQaWNrZXJJZCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCxcblx0aGFuZGxlcjogZ2V0UXVpY2tOYXZpZ2F0ZUhhbmRsZXIocXVpY2tBY2Nlc3NOYXZpZ2F0ZU5leHRJbkVkaXRvclBpY2tlcklkLCB0cnVlKSxcblx0d2hlbjogZWRpdG9yUGlja2VyQ29udGV4dCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlRhYixcblx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5UYWIgfVxufSk7XG5cbmNvbnN0IHF1aWNrQWNjZXNzTmF2aWdhdGVQcmV2aW91c0luRWRpdG9yUGlja2VySWQgPSAnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5OYXZpZ2F0ZVByZXZpb3VzSW5FZGl0b3JQaWNrZXInO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBxdWlja0FjY2Vzc05hdmlnYXRlUHJldmlvdXNJbkVkaXRvclBpY2tlcklkLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRoYW5kbGVyOiBnZXRRdWlja05hdmlnYXRlSGFuZGxlcihxdWlja0FjY2Vzc05hdmlnYXRlUHJldmlvdXNJbkVkaXRvclBpY2tlcklkLCBmYWxzZSksXG5cdHdoZW46IGVkaXRvclBpY2tlckNvbnRleHQsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIsXG5cdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiIH1cbn0pO1xuXG5yZWdpc3RlckVkaXRvckNvbW1hbmRzKCk7XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gTWVudXNcblxuLy8gbWFjT1M6IFRvdWNoYmFyXG5pZiAoaXNNYWNpbnRvc2gpIHtcblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Ub3VjaEJhckNvbnRleHQsIHtcblx0XHRjb21tYW5kOiB7IGlkOiBOYXZpZ2F0ZUJhY2t3YXJkc0FjdGlvbi5JRCwgdGl0bGU6IE5hdmlnYXRlQmFja3dhcmRzQWN0aW9uLkxBQkVMLCBpY29uOiB7IGRhcms6IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy9lZGl0b3IvbWVkaWEvYmFjay10Yi5wbmcnKSB9IH0sXG5cdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRvcmRlcjogMFxuXHR9KTtcblxuXHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlRvdWNoQmFyQ29udGV4dCwge1xuXHRcdGNvbW1hbmQ6IHsgaWQ6IE5hdmlnYXRlRm9yd2FyZEFjdGlvbi5JRCwgdGl0bGU6IE5hdmlnYXRlRm9yd2FyZEFjdGlvbi5MQUJFTCwgaWNvbjogeyBkYXJrOiBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL2Jyb3dzZXIvcGFydHMvZWRpdG9yL21lZGlhL2ZvcndhcmQtdGIucG5nJykgfSB9LFxuXHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0b3JkZXI6IDFcblx0fSk7XG59XG5cbi8vIEVtcHR5IEVkaXRvciBHcm91cCBUb29sYmFyXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVtcHR5RWRpdG9yR3JvdXAsIHsgY29tbWFuZDogeyBpZDogTE9DS19HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2xvY2tHcm91cEFjdGlvbicsIFwiTG9jayBHcm91cFwiKSwgaWNvbjogQ29kaWNvbi51bmxvY2sgfSwgZ3JvdXA6ICduYXZpZ2F0aW9uJywgb3JkZXI6IDEwLCB3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQudG9OZWdhdGVkKCkpIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwLCB7IGNvbW1hbmQ6IHsgaWQ6IFVOTE9DS19HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ3VubG9ja0dyb3VwQWN0aW9uJywgXCJVbmxvY2sgR3JvdXBcIiksIGljb246IENvZGljb24ubG9jaywgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIudHJ1ZSgpIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAxMCwgd2hlbjogQWN0aXZlRWRpdG9yR3JvdXBMb2NrZWRDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwLCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUl9HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlR3JvdXBBY3Rpb24nLCBcIkNsb3NlIEdyb3VwXCIpLCBpY29uOiBDb2RpY29uLmNsb3NlIH0sIGdyb3VwOiAnbmF2aWdhdGlvbicsIG9yZGVyOiAyMCwgd2hlbjogQ29udGV4dEtleUV4cHIub3IoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBFZGl0b3JQYXJ0TXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0KSB9KTtcblxuLy8gRW1wdHkgRWRpdG9yIEdyb3VwIENvbnRleHQgTWVudVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfVVAsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRVcCcsIFwiU3BsaXQgVXBcIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDEwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfRE9XTiwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdERvd24nLCBcIlNwbGl0IERvd25cIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfTEVGVCwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdExlZnQnLCBcIlNwbGl0IExlZnRcIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDMwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfUklHSFQsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRSaWdodCcsIFwiU3BsaXQgUmlnaHRcIikgfSwgZ3JvdXA6ICcyX3NwbGl0Jywgb3JkZXI6IDQwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBORVdfRU1QVFlfRURJVE9SX1dJTkRPV19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ25ld1dpbmRvdycsIFwiTmV3IFdpbmRvd1wiKSB9LCBncm91cDogJzNfd2luZG93Jywgb3JkZXI6IDEwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FbXB0eUVkaXRvckdyb3VwQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBUT0dHTEVfTE9DS19HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ3RvZ2dsZUxvY2tHcm91cCcsIFwiTG9jayBHcm91cFwiKSwgdG9nZ2xlZDogQWN0aXZlRWRpdG9yR3JvdXBMb2NrZWRDb250ZXh0IH0sIGdyb3VwOiAnNF9sb2NrJywgb3JkZXI6IDEwLCB3aGVuOiBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCkgLyogYWxyZWFkeSBhIHByaW1hcnkgYWN0aW9uIGZvciBhdXggd2luZG93cyAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRW1wdHlFZGl0b3JHcm91cENvbnRleHQsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlXCIpIH0sIGdyb3VwOiAnNV9jbG9zZScsIG9yZGVyOiAxMCwgd2hlbjogTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0IH0pO1xuXG4vLyBFZGl0b3IgVGFiIENvbnRhaW5lciBDb250ZXh0IE1lbnVcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX1VQLCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0VXAnLCBcIlNwbGl0IFVwXCIpIH0sIGdyb3VwOiAnMl9zcGxpdCcsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX0RPV04sIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXREb3duJywgXCJTcGxpdCBEb3duXCIpIH0sIGdyb3VwOiAnMl9zcGxpdCcsIG9yZGVyOiAyMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX0xFRlQsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRMZWZ0JywgXCJTcGxpdCBMZWZ0XCIpIH0sIGdyb3VwOiAnMl9zcGxpdCcsIG9yZGVyOiAzMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX1JJR0hULCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0UmlnaHQnLCBcIlNwbGl0IFJpZ2h0XCIpIH0sIGdyb3VwOiAnMl9zcGxpdCcsIG9yZGVyOiA0MCB9KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9HUk9VUF9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdtb3ZlRWRpdG9yR3JvdXBUb05ld1dpbmRvdycsIFwiTW92ZSBpbnRvIE5ldyBXaW5kb3dcIikgfSwgZ3JvdXA6ICczX3dpbmRvdycsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogQ09QWV9FRElUT1JfR1JPVVBfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnY29weUVkaXRvckdyb3VwVG9OZXdXaW5kb3cnLCBcIkNvcHkgaW50byBOZXcgV2luZG93XCIpIH0sIGdyb3VwOiAnM193aW5kb3cnLCBvcmRlcjogMjAgfSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgc3VibWVudTogTWVudUlkLkVkaXRvclRhYnNCYXJTaG93VGFic1N1Ym1lbnUsIHRpdGxlOiBsb2NhbGl6ZSgndGFiQmFyJywgXCJUYWIgQmFyXCIpLCBncm91cDogJzRfY29uZmlnJywgb3JkZXI6IDEwLCB3aGVuOiBJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyU2hvd1RhYnNTdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IFNob3dNdWx0aXBsZUVkaXRvclRhYnNBY3Rpb24uSUQsIHRpdGxlOiBsb2NhbGl6ZSgnbXVsdGlwbGVUYWJzJywgXCJNdWx0aXBsZSBUYWJzXCIpLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLnNob3dUYWJzJywgJ211bHRpcGxlJykgfSwgZ3JvdXA6ICcxX2NvbmZpZycsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhclNob3dUYWJzU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBTaG93U2luZ2xlRWRpdG9yVGFiQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ3NpbmdsZVRhYicsIFwiU2luZ2xlIFRhYlwiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5zaG93VGFicycsICdzaW5nbGUnKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyU2hvd1RhYnNTdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IEhpZGVFZGl0b3JUYWJzQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ2hpZGVUYWJzJywgXCJIaWRkZW5cIiksIHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5lZGl0b3Iuc2hvd1RhYnMnLCAnbm9uZScpIH0sIGdyb3VwOiAnMV9jb25maWcnLCBvcmRlcjogMzAgfSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsIHsgc3VibWVudTogTWVudUlkLkVkaXRvclRhYnNCYXJTaG93VGFic1plbk1vZGVTdWJtZW51LCB0aXRsZTogbG9jYWxpemUoJ3RhYkJhcicsIFwiVGFiIEJhclwiKSwgZ3JvdXA6ICc0X2NvbmZpZycsIG9yZGVyOiAxMCwgd2hlbjogSW5FZGl0b3JaZW5Nb2RlQ29udGV4dCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGFic0JhclNob3dUYWJzWmVuTW9kZVN1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogWmVuU2hvd011bHRpcGxlRWRpdG9yVGFic0FjdGlvbi5JRCwgdGl0bGU6IGxvY2FsaXplKCdtdWx0aXBsZVRhYnMnLCBcIk11bHRpcGxlIFRhYnNcIiksIHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLnplbk1vZGUuc2hvd1RhYnMnLCAnbXVsdGlwbGUnKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDEwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyU2hvd1RhYnNaZW5Nb2RlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBaZW5TaG93U2luZ2xlRWRpdG9yVGFiQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ3NpbmdsZVRhYicsIFwiU2luZ2xlIFRhYlwiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuemVuTW9kZS5zaG93VGFicycsICdzaW5nbGUnKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyU2hvd1RhYnNaZW5Nb2RlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBaZW5IaWRlRWRpdG9yVGFic0FjdGlvbi5JRCwgdGl0bGU6IGxvY2FsaXplKCdoaWRlVGFicycsIFwiSGlkZGVuXCIpLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy56ZW5Nb2RlLnNob3dUYWJzJywgJ25vbmUnKSB9LCBncm91cDogJzFfY29uZmlnJywgb3JkZXI6IDMwIH0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRhYnNCYXJDb250ZXh0LCB7IHN1Ym1lbnU6IE1lbnVJZC5FZGl0b3JBY3Rpb25zUG9zaXRpb25TdWJtZW51LCB0aXRsZTogbG9jYWxpemUoJ2VkaXRvckFjdGlvbnNQb3NpdGlvbicsIFwiRWRpdG9yIEFjdGlvbnMgUG9zaXRpb25cIiksIGdyb3VwOiAnNF9jb25maWcnLCBvcmRlcjogMjAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvckFjdGlvbnNQb3NpdGlvblN1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogRWRpdG9yQWN0aW9uc0RlZmF1bHRBY3Rpb24uSUQsIHRpdGxlOiBsb2NhbGl6ZSgndGFiQmFyJywgXCJUYWIgQmFyXCIpLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLmVkaXRvckFjdGlvbnNMb2NhdGlvbicsICdkZWZhdWx0JykgfSwgZ3JvdXA6ICcxX2NvbmZpZycsIG9yZGVyOiAxMCwgd2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5zaG93VGFicycsICdub25lJykubmVnYXRlKCkgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvckFjdGlvbnNQb3NpdGlvblN1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogRWRpdG9yQWN0aW9uc1RpdGxlQmFyQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ3RpdGxlQmFyJywgXCJUaXRsZSBCYXJcIiksIHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLndvcmtiZW5jaC5lZGl0b3IuZWRpdG9yQWN0aW9uc0xvY2F0aW9uJywgJ3RpdGxlQmFyJyksIENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy53b3JrYmVuY2guZWRpdG9yLnNob3dUYWJzJywgJ25vbmUnKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5lZGl0b3JBY3Rpb25zTG9jYXRpb24nLCAnZGVmYXVsdCcpKSkgfSwgZ3JvdXA6ICcxX2NvbmZpZycsIG9yZGVyOiAyMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQWN0aW9uc1Bvc2l0aW9uU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBIaWRlRWRpdG9yQWN0aW9uc0FjdGlvbi5JRCwgdGl0bGU6IGxvY2FsaXplKCdoaWRkZW4nLCBcIkhpZGRlblwiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5lZGl0b3JBY3Rpb25zTG9jYXRpb24nLCAnaGlkZGVuJykgfSwgZ3JvdXA6ICcxX2NvbmZpZycsIG9yZGVyOiAzMCB9KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUYWJzQmFyQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBDb25maWd1cmVFZGl0b3JUYWJzQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ2NvbmZpZ3VyZVRhYnMnLCBcIkNvbmZpZ3VyZSBUYWJzXCIpIH0sIGdyb3VwOiAnOV9jb25maWd1cmUnLCBvcmRlcjogMTAgfSk7XG5cbi8vIEVkaXRvciBUaXRsZSBDb250ZXh0IE1lbnVcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlJywgXCJDbG9zZVwiKSB9LCBncm91cDogJzFfY2xvc2UnLCBvcmRlcjogMTAsIHdoZW46IEFjdGl2ZUVkaXRvckNhbm5vdENsb3NlQ29udGV4dC50b05lZ2F0ZWQoKSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjbG9zZU90aGVycycsIFwiQ2xvc2UgT3RoZXJzXCIpLCBwcmVjb25kaXRpb246IEVkaXRvckdyb3VwRWRpdG9yc0NvdW50Q29udGV4dC5ub3RFcXVhbHNUbygnMScpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiAyMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUlNfVE9fVEhFX1JJR0hUX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VSaWdodCcsIFwiQ2xvc2UgdG8gdGhlIFJpZ2h0XCIpLCBwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JMYXN0SW5Hcm91cENvbnRleHQudG9OZWdhdGVkKCksIE11bHRpcGxlRWRpdG9yc1NlbGVjdGVkSW5Hcm91cENvbnRleHQubmVnYXRlKCkpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiAzMCwgd2hlbjogRWRpdG9yVGFic1Zpc2libGVDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQWxsU2F2ZWQnLCBcIkNsb3NlIFNhdmVkXCIpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiA0MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjbG9zZUFsbCcsIFwiQ2xvc2UgQWxsXCIpIH0sIGdyb3VwOiAnMV9jbG9zZScsIG9yZGVyOiA1MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFJFT1BFTl9XSVRIX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgncmVvcGVuV2l0aCcsIFwiUmVvcGVuIEVkaXRvciBXaXRoLi4uXCIpIH0sIGdyb3VwOiAnMV9vcGVuJywgb3JkZXI6IDEwLCB3aGVuOiBBY3RpdmVFZGl0b3JBdmFpbGFibGVFZGl0b3JJZHNDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogS0VFUF9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdrZWVwT3BlbicsIFwiS2VlcCBPcGVuXCIpLCBwcmVjb25kaXRpb246IEFjdGl2ZUVkaXRvclBpbm5lZENvbnRleHQudG9OZWdhdGVkKCkgfSwgZ3JvdXA6ICczX3ByZXZpZXcnLCBvcmRlcjogMTAsIHdoZW46IENvbnRleHRLZXlFeHByLmhhcygnY29uZmlnLndvcmtiZW5jaC5lZGl0b3IuZW5hYmxlUHJldmlldycpIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogUElOX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ3BpbicsIFwiUGluXCIpIH0sIGdyb3VwOiAnM19wcmV2aWV3Jywgb3JkZXI6IDIwLCB3aGVuOiBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LnRvTmVnYXRlZCgpIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogVU5QSU5fRURJVE9SX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgndW5waW4nLCBcIlVucGluXCIpIH0sIGdyb3VwOiAnM19wcmV2aWV3Jywgb3JkZXI6IDIwLCB3aGVuOiBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SLCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0UmlnaHQnLCBcIlNwbGl0IFJpZ2h0XCIpIH0sIGdyb3VwOiAnNV9zcGxpdCcsIG9yZGVyOiAxMCwgd2hlbjogU3BsaXRFZGl0b3JzVmVydGljYWxseS5uZWdhdGUoKSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUiwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdERvd24nLCBcIlNwbGl0IERvd25cIikgfSwgZ3JvdXA6ICc1X3NwbGl0Jywgb3JkZXI6IDEwLCB3aGVuOiBTcGxpdEVkaXRvcnNWZXJ0aWNhbGx5IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgc3VibWVudTogTWVudUlkLkVkaXRvclNwbGl0TW92ZVN1Ym1lbnUsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRBbmRNb3ZlRWRpdG9yJywgXCJTcGxpdCAmIE1vdmVcIiksIGdyb3VwOiAnNV9zcGxpdCcsIG9yZGVyOiAxNSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LCB7IGNvbW1hbmQ6IHsgaWQ6IE1PVkVfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ21vdmVUb05ld1dpbmRvdycsIFwiTW92ZSBpbnRvIE5ldyBXaW5kb3dcIikgfSwgZ3JvdXA6ICc3X25ld193aW5kb3cnLCBvcmRlcjogMTAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dCwgeyBjb21tYW5kOiB7IGlkOiBDT1BZX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCdjb3B5VG9OZXdXaW5kb3cnLCBcIkNvcHkgaW50byBOZXcgV2luZG93XCIpIH0sIGdyb3VwOiAnN19uZXdfd2luZG93Jywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZUNvbnRleHQsIHsgc3VibWVudTogTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dFNoYXJlLCB0aXRsZTogbG9jYWxpemUoJ3NoYXJlJywgXCJTaGFyZVwiKSwgZ3JvdXA6ICcxMV9zaGFyZScsIG9yZGVyOiAtMSwgd2hlbjogTXVsdGlwbGVFZGl0b3JzU2VsZWN0ZWRJbkdyb3VwQ29udGV4dC5uZWdhdGUoKSB9KTtcblxuLy8gRWRpdG9yIFRpdGxlIENvbnRleHQgTWVudTogU3BsaXQgJiBNb3ZlIEVkaXRvciBTdWJtZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclNwbGl0TW92ZVN1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX1VQLCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0VXAnLCBcIlNwbGl0IFVwXCIpIH0sIGdyb3VwOiAnMV9zcGxpdCcsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfRE9XTiwgdGl0bGU6IGxvY2FsaXplKCdzcGxpdERvd24nLCBcIlNwbGl0IERvd25cIikgfSwgZ3JvdXA6ICcxX3NwbGl0Jywgb3JkZXI6IDIwIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JTcGxpdE1vdmVTdWJtZW51LCB7IGNvbW1hbmQ6IHsgaWQ6IFNQTElUX0VESVRPUl9MRUZULCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0TGVmdCcsIFwiU3BsaXQgTGVmdFwiKSB9LCBncm91cDogJzFfc3BsaXQnLCBvcmRlcjogMzAgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclNwbGl0TW92ZVN1Ym1lbnUsIHsgY29tbWFuZDogeyBpZDogU1BMSVRfRURJVE9SX1JJR0hULCB0aXRsZTogbG9jYWxpemUoJ3NwbGl0UmlnaHQnLCBcIlNwbGl0IFJpZ2h0XCIpIH0sIGdyb3VwOiAnMV9zcGxpdCcsIG9yZGVyOiA0MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0FCT1ZFX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ21vdmVBYm92ZScsIFwiTW92ZSBBYm92ZVwiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiAxMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0JFTE9XX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ21vdmVCZWxvdycsIFwiTW92ZSBCZWxvd1wiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiAyMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0xFRlRfR1JPVVAsIHRpdGxlOiBsb2NhbGl6ZSgnbW92ZUxlZnQnLCBcIk1vdmUgTGVmdFwiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiAzMCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX1JJR0hUX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ21vdmVSaWdodCcsIFwiTW92ZSBSaWdodFwiKSB9LCBncm91cDogJzJfbW92ZScsIG9yZGVyOiA0MCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBTUExJVF9FRElUT1JfSU5fR1JPVVAsIHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRJbkdyb3VwJywgXCJTcGxpdCBpbiBHcm91cFwiKSwgcHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0Lm5lZ2F0ZSgpIH0sIGdyb3VwOiAnM19zcGxpdF9pbl9ncm91cCcsIG9yZGVyOiAxMCwgd2hlbjogQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yU3BsaXRNb3ZlU3VibWVudSwgeyBjb21tYW5kOiB7IGlkOiBKT0lOX0VESVRPUl9JTl9HUk9VUCwgdGl0bGU6IGxvY2FsaXplKCdqb2luSW5Hcm91cCcsIFwiSm9pbiBpbiBHcm91cFwiKSwgcHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvcnNTZWxlY3RlZEluR3JvdXBDb250ZXh0Lm5lZ2F0ZSgpIH0sIGdyb3VwOiAnM19zcGxpdF9pbl9ncm91cCcsIG9yZGVyOiAxMCwgd2hlbjogU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQgfSk7XG5cbi8vIEVkaXRvciBUaXRsZSBNZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9ESUZGX1NJREVfQllfU0lERSwgdGl0bGU6IGxvY2FsaXplKCdpbmxpbmVWaWV3JywgXCJJbmxpbmUgVmlld1wiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuZGlmZkVkaXRvci5yZW5kZXJTaWRlQnlTaWRlJywgZmFsc2UpIH0sIGdyb3VwOiAnMV9kaWZmJywgb3JkZXI6IDEwLCB3aGVuOiBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5oYXMoJ2lzSW5EaWZmRWRpdG9yJyksIEFjdGl2ZUN1c3RvbUVkaXRvckRpZmZDYW5Ub2dnbGVMYXlvdXRDb250ZXh0KSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogU0hPV19FRElUT1JTX0lOX0dST1VQLCB0aXRsZTogbG9jYWxpemUoJ3Nob3dPcGVuZWRFZGl0b3JzJywgXCJTaG93IE9wZW5lZCBFZGl0b3JzXCIpIH0sIGdyb3VwOiAnM19vcGVuJywgb3JkZXI6IDEwLCB3aGVuOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LnRvTmVnYXRlZCgpIC8qIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQWxsJywgXCJDbG9zZSBBbGxcIikgfSwgZ3JvdXA6ICc1X2Nsb3NlJywgb3JkZXI6IDEwLCB3aGVuOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LnRvTmVnYXRlZCgpIC8qIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUoJ2Nsb3NlQWxsU2F2ZWQnLCBcIkNsb3NlIFNhdmVkXCIpIH0sIGdyb3VwOiAnNV9jbG9zZScsIG9yZGVyOiAyMCwgd2hlbjogRWRpdG9yUGFydE1vZGFsQ29udGV4dC50b05lZ2F0ZWQoKSAvKiBub3QgYXBwbGljYWJsZSB0byBtb2RhbCBlZGl0b3IgKi8gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9LRUVQX0VESVRPUlNfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplKCd0b2dnbGVQcmV2aWV3TW9kZScsIFwiRW5hYmxlIFByZXZpZXcgRWRpdG9yc1wiKSwgdG9nZ2xlZDogQ29udGV4dEtleUV4cHIuaGFzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5lbmFibGVQcmV2aWV3JykgfSwgZ3JvdXA6ICc3X3NldHRpbmdzJywgb3JkZXI6IDEwLCB3aGVuOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LnRvTmVnYXRlZCgpIC8qIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogVE9HR0xFX01BWElNSVpFX0VESVRPUl9HUk9VUCwgdGl0bGU6IGxvY2FsaXplKCdtYXhpbWl6ZUdyb3VwJywgXCJNYXhpbWl6ZSBHcm91cFwiKSB9LCBncm91cDogJzhfZ3JvdXBfb3BlcmF0aW9ucycsIG9yZGVyOiA1LCB3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yUGFydE1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dC5uZWdhdGUoKSwgRWRpdG9yUGFydE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCkgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9NQVhJTUlaRV9FRElUT1JfR1JPVVAsIHRpdGxlOiBsb2NhbGl6ZSgndW5tYXhpbWl6ZUdyb3VwJywgXCJVbm1heGltaXplIEdyb3VwXCIpIH0sIGdyb3VwOiAnOF9ncm91cF9vcGVyYXRpb25zJywgb3JkZXI6IDUsIHdoZW46IEVkaXRvclBhcnRNYXhpbWl6ZWRFZGl0b3JHcm91cENvbnRleHQgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvclRpdGxlLCB7IGNvbW1hbmQ6IHsgaWQ6IFRPR0dMRV9MT0NLX0dST1VQX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZSgnbG9ja0dyb3VwJywgXCJMb2NrIEdyb3VwXCIpLCB0b2dnbGVkOiBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQgfSwgZ3JvdXA6ICc4X2dyb3VwX29wZXJhdGlvbnMnLCBvcmRlcjogMTAsIHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQudG9OZWdhdGVkKCksIEVkaXRvclBhcnRNb2RhbENvbnRleHQudG9OZWdhdGVkKCkpIC8qIGFscmVhZHkgYSBwcmltYXJ5IGFjdGlvbiBmb3IgYXV4IHdpbmRvd3MsIG5vdCBhcHBsaWNhYmxlIHRvIG1vZGFsIGVkaXRvciAqLyB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHsgY29tbWFuZDogeyBpZDogQ29uZmlndXJlRWRpdG9yQWN0aW9uLklELCB0aXRsZTogbG9jYWxpemUoJ2NvbmZpZ3VyZUVkaXRvcnMnLCBcIkNvbmZpZ3VyZSBFZGl0b3JzXCIpIH0sIGdyb3VwOiAnOV9jb25maWd1cmUnLCBvcmRlcjogMTAsIHdoZW46IEVkaXRvclBhcnRNb2RhbENvbnRleHQudG9OZWdhdGVkKCkgLyogbm90IGFwcGxpY2FibGUgdG8gbW9kYWwgZWRpdG9yICovIH0pO1xuXG5mdW5jdGlvbiBhcHBlbmRFZGl0b3JUb29sSXRlbShwcmltYXJ5OiBJQ29tbWFuZEFjdGlvbiwgd2hlbjogQ29udGV4dEtleUV4cHJlc3Npb24gfCB1bmRlZmluZWQsIG9yZGVyOiBudW1iZXIsIGFsdGVybmF0aXZlPzogSUNvbW1hbmRBY3Rpb24sIHByZWNvbmRpdGlvbj86IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCBlbmFibGVJbkNvbXBhY3RNb2RlPzogYm9vbGVhbiwgZW5hYmxlSW5Nb2RhbE1vZGU/OiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IGl0ZW06IElNZW51SXRlbSA9IHtcblx0XHRjb21tYW5kOiB7XG5cdFx0XHRpZDogcHJpbWFyeS5pZCxcblx0XHRcdHRpdGxlOiBwcmltYXJ5LnRpdGxlLFxuXHRcdFx0aWNvbjogcHJpbWFyeS5pY29uLFxuXHRcdFx0dG9nZ2xlZDogcHJpbWFyeS50b2dnbGVkLFxuXHRcdFx0cHJlY29uZGl0aW9uXG5cdFx0fSxcblx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdHdoZW4sXG5cdFx0b3JkZXJcblx0fTtcblxuXHRpZiAoYWx0ZXJuYXRpdmUpIHtcblx0XHRpdGVtLmFsdCA9IHtcblx0XHRcdGlkOiBhbHRlcm5hdGl2ZS5pZCxcblx0XHRcdHRpdGxlOiBhbHRlcm5hdGl2ZS50aXRsZSxcblx0XHRcdGljb246IGFsdGVybmF0aXZlLmljb25cblx0XHR9O1xuXHR9XG5cblx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZSwgaXRlbSk7XG5cdGlmIChlbmFibGVJbkNvbXBhY3RNb2RlKSB7XG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGUsIGl0ZW0pO1xuXHR9XG5cdGlmIChlbmFibGVJbk1vZGFsTW9kZSkge1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTW9kYWxFZGl0b3JFZGl0b3JUaXRsZSwgaXRlbSk7XG5cdH1cbn1cblxuY29uc3QgU1BMSVRfT1JERVIgPSAxMDAwMDA7ICAvLyB0b3dhcmRzIHRoZSBlbmRcbmNvbnN0IENMT1NFX09SREVSID0gMTAwMDAwMDsgLy8gdG93YXJkcyB0aGUgZmFyIGVuZFxuXG4vLyBFZGl0b3IgVGl0bGUgTWVudTogU3BsaXQgRWRpdG9yXG4vLyBJbiB0aGUgYWdlbnRzIHdpbmRvdyB0aGUgc3BsaXQgZWRpdG9yIGFjdGlvbiBpcyBtb3ZlZCBpbnRvIHRoZSBvdmVyZmxvdyAoLi4uKVxuLy8gbWVudSAoc2VlIGJlbG93KSByYXRoZXIgdGhhbiBiZWluZyBzaG93biBhcyBhIHByaW1hcnkgdG9vbGJhciBpY29uLlxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogU1BMSVRfRURJVE9SLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JSaWdodCcsIFwiU3BsaXQgRWRpdG9yIFJpZ2h0XCIpLFxuXHRcdGljb246IENvZGljb24uc3BsaXRIb3Jpem9udGFsXG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChTcGxpdEVkaXRvcnNWZXJ0aWNhbGx5Lm5lZ2F0ZSgpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFNQTElUX09SREVSLFxuXHR7XG5cdFx0aWQ6IFNQTElUX0VESVRPUl9ET1dOLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JEb3duJywgXCJTcGxpdCBFZGl0b3IgRG93blwiKSxcblx0XHRpY29uOiBDb2RpY29uLnNwbGl0VmVydGljYWxcblx0fVxuKTtcblxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogU1BMSVRfRURJVE9SLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JEb3duJywgXCJTcGxpdCBFZGl0b3IgRG93blwiKSxcblx0XHRpY29uOiBDb2RpY29uLnNwbGl0VmVydGljYWxcblx0fSxcblx0Q29udGV4dEtleUV4cHIuYW5kKFNwbGl0RWRpdG9yc1ZlcnRpY2FsbHksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0U1BMSVRfT1JERVIsXG5cdHtcblx0XHRpZDogU1BMSVRfRURJVE9SX1JJR0hULFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3BsaXRFZGl0b3JSaWdodCcsIFwiU3BsaXQgRWRpdG9yIFJpZ2h0XCIpLFxuXHRcdGljb246IENvZGljb24uc3BsaXRIb3Jpem9udGFsXG5cdH1cbik7XG5cbi8vIEFnZW50cyB3aW5kb3c6IHNob3cgU3BsaXQgRWRpdG9yIGluIHRoZSBlZGl0b3IgdGl0bGUgb3ZlcmZsb3cgKC4uLikgbWVudVxuLy8gaW5zdGVhZCBvZiBhcyBhIHByaW1hcnkgdG9vbGJhciBpY29uLiBNaXJyb3IgdGhlIG9yaWVudGF0aW9uIGhhbmRsaW5nIG9mIHRoZVxuLy8gcHJpbWFyeSB0b29sYmFyIGl0ZW1zIHNvIHRoZSBsYWJlbC9pY29uIG1hdGNoIHRoZSBjb25maWd1cmVkIHNwbGl0IGRpcmVjdGlvbi5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTUExJVF9FRElUT1IsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdzcGxpdEVkaXRvclJpZ2h0JywgXCJTcGxpdCBFZGl0b3IgUmlnaHRcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5zcGxpdEhvcml6b250YWxcblx0fSxcblx0Z3JvdXA6ICc0X3NwbGl0Jyxcblx0b3JkZXI6IDEwLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQsIFNwbGl0RWRpdG9yc1ZlcnRpY2FsbHkubmVnYXRlKCkpXG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yVGl0bGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTUExJVF9FRElUT1IsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdzcGxpdEVkaXRvckRvd24nLCBcIlNwbGl0IEVkaXRvciBEb3duXCIpLFxuXHRcdGljb246IENvZGljb24uc3BsaXRWZXJ0aWNhbFxuXHR9LFxuXHRncm91cDogJzRfc3BsaXQnLFxuXHRvcmRlcjogMTAsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgU3BsaXRFZGl0b3JzVmVydGljYWxseSlcbn0pO1xuXG4vLyBTaWRlIGJ5IHNpZGU6IGxheW91dFxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogVE9HR0xFX1NQTElUX0VESVRPUl9JTl9HUk9VUF9MQVlPVVQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd0b2dnbGVTcGxpdEVkaXRvckluR3JvdXBMYXlvdXQnLCBcIlRvZ2dsZSBMYXlvdXRcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5lZGl0b3JMYXlvdXRcblx0fSxcblx0U2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsXG5cdFNQTElUX09SREVSIC0gMSwgLy8gbGVmdCB0byBzcGxpdCBhY3Rpb25zXG4pO1xuXG4vLyBFZGl0b3IgVGl0bGUgTWVudTogQ2xvc2UgKHRhYnMgZGlzYWJsZWQsIG5vcm1hbCBlZGl0b3IpXG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBDTE9TRV9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2Nsb3NlJywgXCJDbG9zZVwiKSxcblx0XHRpY29uOiBDb2RpY29uLmNsb3NlXG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCksIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dC50b05lZ2F0ZWQoKSwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dC50b05lZ2F0ZWQoKSwgQWN0aXZlRWRpdG9yQ2Fubm90Q2xvc2VDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0Q0xPU0VfT1JERVIsXG5cdHtcblx0XHRpZDogQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VBbGwnLCBcIkNsb3NlIEFsbFwiKSxcblx0XHRpY29uOiBDb2RpY29uLmNsb3NlQWxsXG5cdH1cbik7XG5cbi8vIEVkaXRvciBUaXRsZSBNZW51OiBDbG9zZSAodGFicyBkaXNhYmxlZCwgZGlydHkgZWRpdG9yKVxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5jbG9zZURpcnR5XG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCksIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dCwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dC50b05lZ2F0ZWQoKSwgQWN0aXZlRWRpdG9yQ2Fubm90Q2xvc2VDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0Q0xPU0VfT1JERVIsXG5cdHtcblx0XHRpZDogQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2VBbGwnLCBcIkNsb3NlIEFsbFwiKSxcblx0XHRpY29uOiBDb2RpY29uLmNsb3NlQWxsXG5cdH1cbik7XG5cbi8vIEVkaXRvciBUaXRsZSBNZW51OiBDbG9zZSAodGFicyBkaXNhYmxlZCwgc3RpY2t5IGVkaXRvcilcbmFwcGVuZEVkaXRvclRvb2xJdGVtKFxuXHR7XG5cdFx0aWQ6IFVOUElOX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgndW5waW4nLCBcIlVucGluXCIpLFxuXHRcdGljb246IENvZGljb24ucGlubmVkXG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCksIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dC50b05lZ2F0ZWQoKSwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dCksXG5cdENMT1NFX09SREVSLFxuXHR7XG5cdFx0aWQ6IENMT1NFX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlXCIpLFxuXHRcdGljb246IENvZGljb24uY2xvc2Vcblx0fVxuKTtcblxuLy8gRWRpdG9yIFRpdGxlIE1lbnU6IENsb3NlICh0YWJzIGRpc2FibGVkLCBkaXJ0eSAmIHN0aWNreSBlZGl0b3IpXG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBVTlBJTl9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3VucGluJywgXCJVbnBpblwiKSxcblx0XHRpY29uOiBDb2RpY29uLnBpbm5lZERpcnR5XG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCksIEFjdGl2ZUVkaXRvckRpcnR5Q29udGV4dCwgQWN0aXZlRWRpdG9yU3RpY2t5Q29udGV4dCksXG5cdENMT1NFX09SREVSLFxuXHR7XG5cdFx0aWQ6IENMT1NFX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xvc2UnLCBcIkNsb3NlXCIpLFxuXHRcdGljb246IENvZGljb24uY2xvc2Vcblx0fVxuKTtcblxuLy8gTG9jayBHcm91cDogb25seSBvbiBhdXhpbGlhcnkgd2luZG93IGFuZCB3aGVuIGdyb3VwIGlzIHVubG9ja2VkXG5hcHBlbmRFZGl0b3JUb29sSXRlbShcblx0e1xuXHRcdGlkOiBMT0NLX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdsb2NrRWRpdG9yR3JvdXAnLCBcIkxvY2sgR3JvdXBcIiksXG5cdFx0aWNvbjogQ29kaWNvbi51bmxvY2tcblx0fSxcblx0Q29udGV4dEtleUV4cHIuYW5kKElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCwgQWN0aXZlRWRpdG9yR3JvdXBMb2NrZWRDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0Q0xPU0VfT1JERVIgLSAxLCAvLyBpbW1lZGlhdGVseSB0byB0aGUgbGVmdCBvZiBjbG9zZSBhY3Rpb25cbik7XG5cbi8vIFVubG9jayBHcm91cDogb25seSB3aGVuIGdyb3VwIGlzIGxvY2tlZFxuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogVU5MT0NLX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd1bmxvY2tFZGl0b3JHcm91cCcsIFwiVW5sb2NrIEdyb3VwXCIpLFxuXHRcdGljb246IENvZGljb24ubG9jayxcblx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci50cnVlKClcblx0fSxcblx0QWN0aXZlRWRpdG9yR3JvdXBMb2NrZWRDb250ZXh0LFxuXHRDTE9TRV9PUkRFUiAtIDEsIC8vIGltbWVkaWF0ZWx5IHRvIHRoZSBsZWZ0IG9mIGNsb3NlIGFjdGlvblxuKTtcblxuLy8gRGlmZiBFZGl0b3IgVGl0bGUgTWVudTogUHJldmlvdXMgQ2hhbmdlXG5jb25zdCBwcmV2aW91c0NoYW5nZUljb24gPSByZWdpc3Rlckljb24oJ2RpZmYtZWRpdG9yLXByZXZpb3VzLWNoYW5nZScsIENvZGljb24uYXJyb3dVcCwgbG9jYWxpemUoJ3ByZXZpb3VzQ2hhbmdlSWNvbicsICdJY29uIGZvciB0aGUgcHJldmlvdXMgY2hhbmdlIGFjdGlvbiBpbiB0aGUgZGlmZiBlZGl0b3IuJykpO1xuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogR09UT19QUkVWSU9VU19DSEFOR0UsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCduYXZpZ2F0ZS5wcmV2LmxhYmVsJywgXCJQcmV2aW91cyBDaGFuZ2VcIiksXG5cdFx0aWNvbjogcHJldmlvdXNDaGFuZ2VJY29uXG5cdH0sXG5cdFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCxcblx0MTAsXG5cdHVuZGVmaW5lZCxcblx0RWRpdG9yQ29udGV4dEtleXMuaGFzQ2hhbmdlcyxcblx0dHJ1ZSxcblx0dHJ1ZVxuKTtcblxuLy8gRGlmZiBFZGl0b3IgVGl0bGUgTWVudTogTmV4dCBDaGFuZ2VcbmNvbnN0IG5leHRDaGFuZ2VJY29uID0gcmVnaXN0ZXJJY29uKCdkaWZmLWVkaXRvci1uZXh0LWNoYW5nZScsIENvZGljb24uYXJyb3dEb3duLCBsb2NhbGl6ZSgnbmV4dENoYW5nZUljb24nLCAnSWNvbiBmb3IgdGhlIG5leHQgY2hhbmdlIGFjdGlvbiBpbiB0aGUgZGlmZiBlZGl0b3IuJykpO1xuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogR09UT19ORVhUX0NIQU5HRSxcblx0XHR0aXRsZTogbG9jYWxpemUoJ25hdmlnYXRlLm5leHQubGFiZWwnLCBcIk5leHQgQ2hhbmdlXCIpLFxuXHRcdGljb246IG5leHRDaGFuZ2VJY29uXG5cdH0sXG5cdFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCxcblx0MTEsXG5cdHVuZGVmaW5lZCxcblx0RWRpdG9yQ29udGV4dEtleXMuaGFzQ2hhbmdlcyxcblx0dHJ1ZSxcblx0dHJ1ZVxuKTtcblxuLy8gRGlmZiBFZGl0b3IgVGl0bGUgTWVudTogU3dhcCBTaWRlc1xuYXBwZW5kRWRpdG9yVG9vbEl0ZW0oXG5cdHtcblx0XHRpZDogRElGRl9TV0FQX1NJREVTLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3dhcERpZmZTaWRlcycsIFwiU3dhcCBMZWZ0IGFuZCBSaWdodCBTaWRlXCIpLFxuXHRcdGljb246IENvZGljb24uYXJyb3dTd2FwXG5cdH0sXG5cdENvbnRleHRLZXlFeHByLmFuZChUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQsIEFjdGl2ZUNvbXBhcmVFZGl0b3JDYW5Td2FwQ29udGV4dCksXG5cdDE1LFxuXHR1bmRlZmluZWQsXG5cdHVuZGVmaW5lZFxuKTtcblxuLy8gQ3VzdG9tIFRleHQgRGlmZiBFZGl0b3IgVGl0bGUgTWVudTogUmVvcGVuIGFzIFRleHRcbmFwcGVuZEVkaXRvclRvb2xJdGVtKFxuXHR7XG5cdFx0aWQ6IFJlT3BlbkluVGV4dEVkaXRvckFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ3Jlb3BlbkFzVGV4dCcsIFwiUmVvcGVuIGFzIFRleHRcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5maWxlQ29kZVxuXHR9LFxuXHRBY3RpdmVDdXN0b21FZGl0b3JUZXh0RGlmZkNvbnRleHQsXG5cdDE2LFxuXHR1bmRlZmluZWQsXG5cdHVuZGVmaW5lZCxcblx0dW5kZWZpbmVkLFxuXHR0cnVlXG4pO1xuXG5jb25zdCB0b2dnbGVXaGl0ZXNwYWNlID0gcmVnaXN0ZXJJY29uKCdkaWZmLWVkaXRvci10b2dnbGUtd2hpdGVzcGFjZScsIENvZGljb24ud2hpdGVzcGFjZSwgbG9jYWxpemUoJ3RvZ2dsZVdoaXRlc3BhY2UnLCAnSWNvbiBmb3IgdGhlIHRvZ2dsZSB3aGl0ZXNwYWNlIGFjdGlvbiBpbiB0aGUgZGlmZiBlZGl0b3IuJykpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JUaXRsZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFRPR0dMRV9ESUZGX0lHTk9SRV9UUklNX1dISVRFU1BBQ0UsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdpZ25vcmVUcmltV2hpdGVzcGFjZS5sYWJlbCcsIFwiU2hvdyBMZWFkaW5nL1RyYWlsaW5nIFdoaXRlc3BhY2UgRGlmZmVyZW5jZXNcIiksXG5cdFx0aWNvbjogdG9nZ2xlV2hpdGVzcGFjZSxcblx0XHRwcmVjb25kaXRpb246IFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCxcblx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5kaWZmRWRpdG9yLmlnbm9yZVRyaW1XaGl0ZXNwYWNlJywgZmFsc2UpLFxuXHR9LFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHR3aGVuOiBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQsXG5cdG9yZGVyOiAyMCxcbn0pO1xuXG4vLyBFZGl0b3IgQ29tbWFuZHMgZm9yIENvbW1hbmQgUGFsZXR0ZVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBLRUVQX0VESVRPUl9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdrZWVwRWRpdG9yJywgJ0tlZXAgRWRpdG9yJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSwgd2hlbjogQ29udGV4dEtleUV4cHIuaGFzKCdjb25maWcud29ya2JlbmNoLmVkaXRvci5lbmFibGVQcmV2aWV3JykgfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IFBJTl9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMigncGluRWRpdG9yJywgJ1BpbiBFZGl0b3InKSwgY2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyB9IH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBVTlBJTl9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMigndW5waW5FZGl0b3InLCAnVW5waW4gRWRpdG9yJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlRWRpdG9yJywgJ0Nsb3NlIEVkaXRvcicpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX1BJTk5FRF9FRElUT1JfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMignY2xvc2VQaW5uZWRFZGl0b3InLCAnQ2xvc2UgUGlubmVkIEVkaXRvcicpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMignY2xvc2VFZGl0b3JzSW5Hcm91cCcsICdDbG9zZSBBbGwgRWRpdG9ycyBpbiBHcm91cCcpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX1NBVkVEX0VESVRPUlNfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMignY2xvc2VTYXZlZEVkaXRvcnMnLCAnQ2xvc2UgU2F2ZWQgRWRpdG9ycyBpbiBHcm91cCcpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX09USEVSX0VESVRPUlNfSU5fR1JPVVBfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMignY2xvc2VPdGhlckVkaXRvcnMnLCAnQ2xvc2UgT3RoZXIgRWRpdG9ycyBpbiBHcm91cCcpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0gfSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHsgaWQ6IENMT1NFX0VESVRPUlNfVE9fVEhFX1JJR0hUX0NPTU1BTkRfSUQsIHRpdGxlOiBsb2NhbGl6ZTIoJ2Nsb3NlUmlnaHRFZGl0b3JzJywgJ0Nsb3NlIEVkaXRvcnMgdG8gdGhlIFJpZ2h0IGluIEdyb3VwJyksIGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcgfSwgd2hlbjogQWN0aXZlRWRpdG9yTGFzdEluR3JvdXBDb250ZXh0LnRvTmVnYXRlZCgpIH0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwgeyBjb21tYW5kOiB7IGlkOiBDTE9TRV9FRElUT1JTX0FORF9HUk9VUF9DT01NQU5EX0lELCB0aXRsZTogbG9jYWxpemUyKCdjbG9zZUVkaXRvckdyb3VwJywgJ0Nsb3NlIEVkaXRvciBHcm91cCcpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0sIHdoZW46IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCB9KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHsgY29tbWFuZDogeyBpZDogUkVPUEVOX1dJVEhfQ09NTUFORF9JRCwgdGl0bGU6IGxvY2FsaXplMigncmVvcGVuV2l0aCcsIFwiUmVvcGVuIEVkaXRvciBXaXRoLi4uXCIpLCBjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3IH0sIHdoZW46IEFjdGl2ZUVkaXRvckF2YWlsYWJsZUVkaXRvcklkc0NvbnRleHQgfSk7XG5cbi8vIEZpbGUgbWVudVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyUmVjZW50TWVudSwge1xuXHRncm91cDogJzFfZWRpdG9yJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBSZW9wZW5DbG9zZWRFZGl0b3JBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlSZW9wZW5DbG9zZWRFZGl0b3InLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZW9wZW4gQ2xvc2VkIEVkaXRvclwiKSxcblx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmhhcygnY2FuUmVvcGVuQ2xvc2VkRWRpdG9yJylcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJSZWNlbnRNZW51LCB7XG5cdGdyb3VwOiAnel9jbGVhcicsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogQ2xlYXJSZWNlbnRGaWxlc0FjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUNsZWFyUmVjZW50T3BlbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNsZWFyIFJlY2VudGx5IE9wZW5lZC4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckZpbGVNZW51LCB7XG5cdHRpdGxlOiBsb2NhbGl6ZSgnbWlTaGFyZScsIFwiU2hhcmVcIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5NZW51YmFyU2hhcmUsXG5cdGdyb3VwOiAnNDVfc2hhcmUnLFxuXHRvcmRlcjogMSxcblx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcbn0pO1xuXG4vLyBMYXlvdXQgbWVudVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyVmlld01lbnUsIHtcblx0Z3JvdXA6ICcyX2FwcGVhcmFuY2UnLFxuXHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUVkaXRvckxheW91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJFZGl0b3IgJiZMYXlvdXRcIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSxcblx0b3JkZXI6IDIsXG5cdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzFfc3BsaXQnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNQTElUX0VESVRPUl9VUCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVNwbGl0RWRpdG9yVXBXaXRob3V0TW5lbW9uaWMnLCBcIlNwbGl0IFVwXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNwbGl0RWRpdG9yVXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU3BsaXQgJiZVcFwiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzFfc3BsaXQnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFNQTElUX0VESVRPUl9ET1dOLFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pU3BsaXRFZGl0b3JEb3duV2l0aG91dE1uZW1vbmljJywgXCJTcGxpdCBEb3duXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNwbGl0RWRpdG9yRG93bicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTcGxpdCAmJkRvd25cIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICcxX3NwbGl0Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBTUExJVF9FRElUT1JfTEVGVCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVNwbGl0RWRpdG9yTGVmdFdpdGhvdXRNbmVtb25pYycsIFwiU3BsaXQgTGVmdFwiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTcGxpdEVkaXRvckxlZnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU3BsaXQgJiZMZWZ0XCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDNcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnMV9zcGxpdCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU1BMSVRfRURJVE9SX1JJR0hULFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pU3BsaXRFZGl0b3JSaWdodFdpdGhvdXRNbmVtb25pYycsIFwiU3BsaXQgUmlnaHRcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU3BsaXRFZGl0b3JSaWdodCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJTcGxpdCAmJlJpZ2h0XCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnMl9zcGxpdF9pbl9ncm91cCcsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU1BMSVRfRURJVE9SX0lOX0dST1VQLFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pU3BsaXRFZGl0b3JJbkdyb3VwV2l0aG91dE1uZW1vbmljJywgXCJTcGxpdCBpbiBHcm91cFwiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTcGxpdEVkaXRvckluR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU3BsaXQgaW4gJiZHcm91cFwiKSxcblx0XHR9XG5cdH0sXG5cdHdoZW46IEFjdGl2ZUVkaXRvckNhblNwbGl0SW5Hcm91cENvbnRleHQsXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzJfc3BsaXRfaW5fZ3JvdXAnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEpPSU5fRURJVE9SX0lOX0dST1VQLFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pSm9pbkVkaXRvckluR3JvdXBXaXRob3V0TW5lbW9uaWMnLCBcIkpvaW4gaW4gR3JvdXBcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pSm9pbkVkaXRvckluR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiSm9pbiBpbiAmJkdyb3VwXCIpLFxuXHRcdH1cblx0fSxcblx0d2hlbjogU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzNfbmV3X3dpbmRvdycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogTU9WRV9FRElUT1JfSU5UT19ORVdfV0lORE9XX0NPTU1BTkRfSUQsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbW92ZUVkaXRvclRvTmV3V2luZG93JywgXCJNb3ZlIEVkaXRvciBpbnRvIE5ldyBXaW5kb3dcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTW92ZUVkaXRvclRvTmV3V2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTW92ZSBFZGl0b3IgaW50byBOZXcgV2luZG93XCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnM19uZXdfd2luZG93Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDT1BZX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdjb3B5RWRpdG9yVG9OZXdXaW5kb3cnLCBcIkNvcHkgRWRpdG9yIGludG8gTmV3IFdpbmRvd1wiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlDb3B5RWRpdG9yVG9OZXdXaW5kb3cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb3B5IEVkaXRvciBpbnRvIE5ldyBXaW5kb3dcIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICc0X2xheW91dHMnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEVkaXRvckxheW91dFNpbmdsZUFjdGlvbi5JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVNpbmdsZUNvbHVtbkVkaXRvckxheW91dFdpdGhvdXRNbmVtb25pYycsIFwiU2luZ2xlXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVNpbmdsZUNvbHVtbkVkaXRvckxheW91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNpbmdsZVwiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzRfbGF5b3V0cycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRWRpdG9yTGF5b3V0VHdvQ29sdW1uc0FjdGlvbi5JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVR3b0NvbHVtbnNFZGl0b3JMYXlvdXRXaXRob3V0TW5lbW9uaWMnLCBcIlR3byBDb2x1bW5zXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVR3b0NvbHVtbnNFZGl0b3JMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUd28gQ29sdW1uc1wiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiAzXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzRfbGF5b3V0cycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRWRpdG9yTGF5b3V0VGhyZWVDb2x1bW5zQWN0aW9uLklELFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pVGhyZWVDb2x1bW5zRWRpdG9yTGF5b3V0V2l0aG91dE1uZW1vbmljJywgXCJUaHJlZSBDb2x1bW5zXCIpLFxuXHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVRocmVlQ29sdW1uc0VkaXRvckxheW91dCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJUJiZocmVlIENvbHVtbnNcIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogNFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICc0X2xheW91dHMnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEVkaXRvckxheW91dFR3b1Jvd3NBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlUd29Sb3dzRWRpdG9yTGF5b3V0V2l0aG91dE1uZW1vbmljJywgXCJUd28gUm93c1wiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUd29Sb3dzRWRpdG9yTGF5b3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlQmJndvIFJvd3NcIiksXG5cdFx0fVxuXHR9LFxuXHRvcmRlcjogNVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckxheW91dE1lbnUsIHtcblx0Z3JvdXA6ICc0X2xheW91dHMnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEVkaXRvckxheW91dFRocmVlUm93c0FjdGlvbi5JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVRocmVlUm93c0VkaXRvckxheW91dFdpdGhvdXRNbmVtb25pYycsIFwiVGhyZWUgUm93c1wiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUaHJlZVJvd3NFZGl0b3JMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVGhyZWUgJiZSb3dzXCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDZcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJMYXlvdXRNZW51LCB7XG5cdGdyb3VwOiAnNF9sYXlvdXRzJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBFZGl0b3JMYXlvdXRUd29CeVR3b0dyaWRBY3Rpb24uSUQsXG5cdFx0dGl0bGU6IHtcblx0XHRcdC4uLmxvY2FsaXplMignbWlUd29CeVR3b0dyaWRFZGl0b3JMYXlvdXRXaXRob3V0TW5lbW9uaWMnLCBcIkdyaWQgKDJ4MilcIiksXG5cdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVHdvQnlUd29HcmlkRWRpdG9yTGF5b3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmR3JpZCAoMngyKVwiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiA3XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzRfbGF5b3V0cycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRWRpdG9yTGF5b3V0VHdvUm93c1JpZ2h0QWN0aW9uLklELFxuXHRcdHRpdGxlOiB7XG5cdFx0XHQuLi5sb2NhbGl6ZTIoJ21pVHdvUm93c1JpZ2h0RWRpdG9yTGF5b3V0V2l0aG91dE1uZW1vbmljJywgXCJUd28gUm93cyBSaWdodFwiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUd29Sb3dzUmlnaHRFZGl0b3JMYXlvdXQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiVHdvIFImJm93cyBSaWdodFwiKSxcblx0XHR9XG5cdH0sXG5cdG9yZGVyOiA4XG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyTGF5b3V0TWVudSwge1xuXHRncm91cDogJzRfbGF5b3V0cycsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRWRpdG9yTGF5b3V0VHdvQ29sdW1uc0JvdHRvbUFjdGlvbi5JRCxcblx0XHR0aXRsZToge1xuXHRcdFx0Li4ubG9jYWxpemUyKCdtaVR3b0NvbHVtbnNCb3R0b21FZGl0b3JMYXlvdXRXaXRob3V0TW5lbW9uaWMnLCBcIlR3byBDb2x1bW5zIEJvdHRvbVwiKSxcblx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUd29Db2x1bW5zQm90dG9tRWRpdG9yTGF5b3V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlR3byAmJkNvbHVtbnMgQm90dG9tXCIpLFxuXHRcdH1cblx0fSxcblx0b3JkZXI6IDlcbn0pO1xuXG4vLyBNYWluIE1lbnUgQmFyIENvbnRyaWJ1dGlvbnM6XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckdvTWVudSwge1xuXHRncm91cDogJzFfaGlzdG9yeV9uYXYnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uJyxcblx0XHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUxhc3RFZGl0TG9jYXRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZMYXN0IEVkaXQgTG9jYXRpb25cIiksXG5cdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5oYXMoJ2Nhbk5hdmlnYXRlVG9MYXN0RWRpdExvY2F0aW9uJylcblx0fSxcblx0b3JkZXI6IDNcbn0pO1xuXG4vLyBTd2l0Y2ggRWRpdG9yXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsIHtcblx0Z3JvdXA6ICcxX3NpZGVCeVNpZGUnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IEZPQ1VTX0ZJUlNUX1NJREVfRURJVE9SLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRmlyc3RTaWRlRWRpdG9yJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRmlyc3QgU2lkZSBpbiBFZGl0b3JcIilcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsIFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCksXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzFfc2lkZUJ5U2lkZScsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogRk9DVVNfU0VDT05EX1NJREVfRURJVE9SLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pU2Vjb25kU2lkZUVkaXRvcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlNlY29uZCBTaWRlIGluIEVkaXRvclwiKVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCwgVGV4dENvbXBhcmVFZGl0b3JBY3RpdmVDb250ZXh0KSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hFZGl0b3JNZW51LCB7XG5cdGdyb3VwOiAnMl9hbnknLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm5leHRFZGl0b3InLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTmV4dEVkaXRvcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk5leHQgRWRpdG9yXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzJfYW55Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5wcmV2aW91c0VkaXRvcicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlQcmV2aW91c0VkaXRvcicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlByZXZpb3VzIEVkaXRvclwiKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsIHtcblx0Z3JvdXA6ICczX2FueV91c2VkJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvcicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlOZXh0UmVjZW50bHlVc2VkRWRpdG9yJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTmV4dCBVc2VkIEVkaXRvclwiKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsIHtcblx0Z3JvdXA6ICczX2FueV91c2VkJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pUHJldmlvdXNSZWNlbnRseVVzZWRFZGl0b3InLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZQcmV2aW91cyBVc2VkIEVkaXRvclwiKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsIHtcblx0Z3JvdXA6ICc0X2dyb3VwJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5uZXh0RWRpdG9ySW5Hcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlOZXh0RWRpdG9ySW5Hcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJk5leHQgRWRpdG9yIGluIEdyb3VwXCIpXG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoRWRpdG9yTWVudSwge1xuXHRncm91cDogJzRfZ3JvdXAnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnByZXZpb3VzRWRpdG9ySW5Hcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlQcmV2aW91c0VkaXRvckluR3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZQcmV2aW91cyBFZGl0b3IgaW4gR3JvdXBcIilcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hFZGl0b3JNZW51LCB7XG5cdGdyb3VwOiAnNV9ncm91cF91c2VkJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuTmV4dFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pTmV4dFVzZWRFZGl0b3JJbkdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmTmV4dCBVc2VkIEVkaXRvciBpbiBHcm91cFwiKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsIHtcblx0Z3JvdXA6ICc1X2dyb3VwX3VzZWQnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pUHJldmlvdXNVc2VkRWRpdG9ySW5Hcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlByZXZpb3VzIFVzZWQgRWRpdG9yIGluIEdyb3VwXCIpXG5cdH0sXG5cdG9yZGVyOiAyXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyR29NZW51LCB7XG5cdGdyb3VwOiAnMl9lZGl0b3JfbmF2Jyxcblx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlTd2l0Y2hFZGl0b3InLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiU3dpdGNoICYmRWRpdG9yXCIpLFxuXHRzdWJtZW51OiBNZW51SWQuTWVudWJhclN3aXRjaEVkaXRvck1lbnUsXG5cdG9yZGVyOiAxXG59KTtcblxuLy8gU3dpdGNoIEdyb3VwXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICcxX2ZvY3VzX2luZGV4Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0ZpcnN0RWRpdG9yR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNGaXJzdEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmMVwiKVxuXHR9LFxuXHRvcmRlcjogMVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzFfZm9jdXNfaW5kZXgnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzU2Vjb25kRWRpdG9yR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNTZWNvbmRHcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHcm91cCAmJjJcIilcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICcxX2ZvY3VzX2luZGV4Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1RoaXJkRWRpdG9yR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNUaGlyZEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmM1wiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogM1xufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzFfZm9jdXNfaW5kZXgnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRm91cnRoRWRpdG9yR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNGb3VydGhHcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHcm91cCAmJjRcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICcxX2ZvY3VzX2luZGV4Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0ZpZnRoRWRpdG9yR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNGaWZ0aEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmNVwiKSxcblx0XHRwcmVjb25kaXRpb246IE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dFxuXHR9LFxuXHRvcmRlcjogNVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSwge1xuXHRncm91cDogJzJfbmV4dF9wcmV2Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c05leHRHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlOZXh0R3JvdXAnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZOZXh0IEdyb3VwXCIpLFxuXHRcdHByZWNvbmRpdGlvbjogTXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0XG5cdH0sXG5cdG9yZGVyOiAxXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyU3dpdGNoR3JvdXBNZW51LCB7XG5cdGdyb3VwOiAnMl9uZXh0X3ByZXYnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzUHJldmlvdXNHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlQcmV2aW91c0dyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUHJldmlvdXMgR3JvdXBcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICczX2RpcmVjdGlvbmFsJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0xlZnRHcm91cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlGb2N1c0xlZnRHcm91cCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHcm91cCAmJkxlZnRcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDFcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICczX2RpcmVjdGlvbmFsJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1JpZ2h0R3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNSaWdodEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmUmlnaHRcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICczX2RpcmVjdGlvbmFsJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0Fib3ZlR3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNBYm92ZUdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmQWJvdmVcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDNcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJTd2l0Y2hHcm91cE1lbnUsIHtcblx0Z3JvdXA6ICczX2RpcmVjdGlvbmFsJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0JlbG93R3JvdXAnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pRm9jdXNCZWxvd0dyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdyb3VwICYmQmVsb3dcIiksXG5cdFx0cHJlY29uZGl0aW9uOiBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHRcblx0fSxcblx0b3JkZXI6IDRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJHb01lbnUsIHtcblx0Z3JvdXA6ICcyX2VkaXRvcl9uYXYnLFxuXHR0aXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaVN3aXRjaEdyb3VwJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlN3aXRjaCAmJkdyb3VwXCIpLFxuXHRzdWJtZW51OiBNZW51SWQuTWVudWJhclN3aXRjaEdyb3VwTWVudSxcblx0b3JkZXI6IDJcbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuXG5yZWdpc3RlckVkaXRvckZvbnRDb25maWd1cmF0aW9ucyhnZXRGb250U25pcHBldHMpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUE4Qiw0QkFBNEI7QUFDMUQsU0FBaUMsd0JBQXdCO0FBQ3pEO0FBQUEsRUFDQztBQUFBLEVBQWdDO0FBQUEsRUFBMkI7QUFBQSxFQUFnQztBQUFBLEVBQTJCO0FBQUEsRUFDdEg7QUFBQSxFQUF1QztBQUFBLEVBQTBCO0FBQUEsRUFBZ0M7QUFBQSxFQUFvQztBQUFBLEVBQ3JJO0FBQUEsRUFBMEI7QUFBQSxFQUFnQztBQUFBLEVBQXVDO0FBQUEsRUFBNkI7QUFBQSxFQUM5SDtBQUFBLEVBQTBCO0FBQUEsRUFBbUM7QUFBQSxFQUF1QztBQUFBLEVBQXdCO0FBQUEsRUFDNUg7QUFBQSxFQUF5QjtBQUFBLEVBQThDO0FBQUEsRUFBbUM7QUFBQSxPQUNwRztBQUNQLFNBQVMsdUJBQXVCLHVDQUF1QztBQUN2RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQixpQ0FBaUM7QUFDM0QsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxzQkFBc0IsaUJBQWlCLHNCQUFzQixnQ0FBZ0M7QUFDdEcsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjLFFBQW1CLHVCQUF1QjtB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
