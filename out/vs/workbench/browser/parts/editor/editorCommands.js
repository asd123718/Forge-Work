import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import { extname, isEqual } from "../../../../base/common/resources.js";
import { isNumber, isObject, isString, isUndefined } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorResolution } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight, KeybindingsRegistry } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService, RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen, WorkbenchTreeStickyScrollFocused } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ActiveGroupEditorsByMostRecentlyUsedQuickAccess } from "./editorQuickAccess.js";
import { SideBySideEditor } from "./sideBySideEditor.js";
import { TextDiffEditor } from "./textDiffEditor.js";
import { ActiveEditorCanSplitInGroupContext, ActiveEditorGroupEmptyContext, ActiveEditorGroupLockedContext, ActiveEditorStickyContext, EditorPartModalContext, EditorPartModalMaximizedContext, EditorPartModalNavigationContext, EditorPartModalSidebarContext, IsSessionsWindowContext, MultipleEditorGroupsContext, SideBySideEditorActiveContext, TextCompareEditorActiveContext } from "../../../common/contextkeys.js";
import { CloseDirection, EditorInputCapabilities, EditorsOrder, isDiffEditorInput, isEditorInputWithOptionsAndGroup } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { columnToEditorGroup } from "../../../services/editor/common/editorGroupColumn.js";
import { GroupDirection, GroupLocation, GroupsOrder, IEditorGroupsService, preferredSideBySideGroupDirection } from "../../../services/editor/common/editorGroupsService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IUntitledTextEditorService } from "../../../services/untitled/common/untitledTextEditorService.js";
import { IWorkingCopyEditorService } from "../../../services/workingCopy/common/workingCopyEditorService.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { DIFF_FOCUS_OTHER_SIDE, DIFF_FOCUS_PRIMARY_SIDE, DIFF_FOCUS_SECONDARY_SIDE, registerDiffEditorCommands } from "./diffEditorCommands.js";
import { resolveCommandsContext } from "./editorCommandsContext.js";
import { prepareMoveCopyEditors } from "./editor.js";
const CLOSE_SAVED_EDITORS_COMMAND_ID = "workbench.action.closeUnmodifiedEditors";
const CLOSE_EDITORS_IN_GROUP_COMMAND_ID = "workbench.action.closeEditorsInGroup";
const CLOSE_EDITORS_AND_GROUP_COMMAND_ID = "workbench.action.closeEditorsAndGroup";
const CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID = "workbench.action.closeEditorsToTheRight";
const CLOSE_EDITOR_COMMAND_ID = "workbench.action.closeActiveEditor";
const CLOSE_PINNED_EDITOR_COMMAND_ID = "workbench.action.closeActivePinnedEditor";
const CLOSE_EDITOR_GROUP_COMMAND_ID = "workbench.action.closeGroup";
const CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID = "workbench.action.closeOtherEditors";
const MOVE_ACTIVE_EDITOR_COMMAND_ID = "moveActiveEditor";
const COPY_ACTIVE_EDITOR_COMMAND_ID = "copyActiveEditor";
const LAYOUT_EDITOR_GROUPS_COMMAND_ID = "layoutEditorGroups";
const KEEP_EDITOR_COMMAND_ID = "workbench.action.keepEditor";
const TOGGLE_KEEP_EDITORS_COMMAND_ID = "workbench.action.toggleKeepEditors";
const TOGGLE_LOCK_GROUP_COMMAND_ID = "workbench.action.toggleEditorGroupLock";
const LOCK_GROUP_COMMAND_ID = "workbench.action.lockEditorGroup";
const UNLOCK_GROUP_COMMAND_ID = "workbench.action.unlockEditorGroup";
const SHOW_EDITORS_IN_GROUP = "workbench.action.showEditorsInGroup";
const REOPEN_WITH_COMMAND_ID = "workbench.action.reopenWithEditor";
const REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID = "reopenActiveEditorWith";
const PIN_EDITOR_COMMAND_ID = "workbench.action.pinEditor";
const UNPIN_EDITOR_COMMAND_ID = "workbench.action.unpinEditor";
const SPLIT_EDITOR = "workbench.action.splitEditor";
const SPLIT_EDITOR_UP = "workbench.action.splitEditorUp";
const SPLIT_EDITOR_DOWN = "workbench.action.splitEditorDown";
const SPLIT_EDITOR_LEFT = "workbench.action.splitEditorLeft";
const SPLIT_EDITOR_RIGHT = "workbench.action.splitEditorRight";
const MOVE_EDITOR_INTO_ABOVE_GROUP = "workbench.action.moveEditorToAboveGroup";
const MOVE_EDITOR_INTO_BELOW_GROUP = "workbench.action.moveEditorToBelowGroup";
const MOVE_EDITOR_INTO_LEFT_GROUP = "workbench.action.moveEditorToLeftGroup";
const MOVE_EDITOR_INTO_RIGHT_GROUP = "workbench.action.moveEditorToRightGroup";
const TOGGLE_MAXIMIZE_EDITOR_GROUP = "workbench.action.toggleMaximizeEditorGroup";
const SPLIT_EDITOR_IN_GROUP = "workbench.action.splitEditorInGroup";
const TOGGLE_SPLIT_EDITOR_IN_GROUP = "workbench.action.toggleSplitEditorInGroup";
const JOIN_EDITOR_IN_GROUP = "workbench.action.joinEditorInGroup";
const TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT = "workbench.action.toggleSplitEditorInGroupLayout";
const FOCUS_FIRST_SIDE_EDITOR = "workbench.action.focusFirstSideEditor";
const FOCUS_SECOND_SIDE_EDITOR = "workbench.action.focusSecondSideEditor";
const FOCUS_OTHER_SIDE_EDITOR = "workbench.action.focusOtherSideEditor";
const FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusLeftGroupWithoutWrap";
const FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusRightGroupWithoutWrap";
const FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusAboveGroupWithoutWrap";
const FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID = "workbench.action.focusBelowGroupWithoutWrap";
const OPEN_EDITOR_AT_INDEX_COMMAND_ID = "workbench.action.openEditorAtIndex";
const MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.moveEditorToNewWindow";
const COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.copyEditorToNewWindow";
const MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.moveEditorGroupToNewWindow";
const COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID = "workbench.action.copyEditorGroupToNewWindow";
const NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID = "workbench.action.newEmptyEditorWindow";
const CLOSE_MODAL_EDITOR_COMMAND_ID = "workbench.action.closeModalEditor";
const MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID = "workbench.action.moveModalEditorToMain";
const MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID = "workbench.action.moveModalEditorToWindow";
const TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID = "workbench.action.toggleModalEditorMaximized";
const NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID = "workbench.action.navigateModalEditorPrevious";
const NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID = "workbench.action.navigateModalEditorNext";
const TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID = "workbench.action.toggleModalEditorSidebar";
const API_OPEN_EDITOR_COMMAND_ID = "_workbench.open";
const API_OPEN_DIFF_EDITOR_COMMAND_ID = "_workbench.diff";
const API_OPEN_WITH_EDITOR_COMMAND_ID = "_workbench.openWith";
const EDITOR_CORE_NAVIGATION_COMMANDS = [
  SPLIT_EDITOR,
  CLOSE_EDITOR_COMMAND_ID,
  UNPIN_EDITOR_COMMAND_ID,
  UNLOCK_GROUP_COMMAND_ID,
  TOGGLE_MAXIMIZE_EDITOR_GROUP
];
const isSelectedEditorsMoveCopyArg = function(arg) {
  if (!isObject(arg)) {
    return false;
  }
  if (!isString(arg.to)) {
    return false;
  }
  if (!isUndefined(arg.by) && !isString(arg.by)) {
    return false;
  }
  if (!isUndefined(arg.value) && !isNumber(arg.value)) {
    return false;
  }
  return true;
};
function registerEditorMoveCopyCommand() {
  const moveCopyJSONSchema = {
    "type": "object",
    "required": ["to"],
    "properties": {
      "to": {
        "type": "string",
        "enum": ["left", "right"]
      },
      "by": {
        "type": "string",
        "enum": ["tab", "group"]
      },
      "value": {
        "type": "number"
      }
    }
  };
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: MOVE_ACTIVE_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: EditorContextKeys.editorTextFocus,
    primary: 0,
    handler: (accessor, args) => moveCopySelectedEditors(true, args, accessor),
    metadata: {
      description: localize("editorCommand.activeEditorMove.description", "Move the active editor by tabs or groups"),
      args: [
        {
          name: localize("editorCommand.activeEditorMove.arg.name", "Active editor move argument"),
          description: localize("editorCommand.activeEditorMove.arg.description", "Argument Properties:\n	* 'to': String value providing where to move.\n	* 'by': String value providing the unit for move (by tab or by group).\n	* 'value': Number value providing how many positions or an absolute position to move."),
          constraint: isSelectedEditorsMoveCopyArg,
          schema: moveCopyJSONSchema
        }
      ]
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: COPY_ACTIVE_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: EditorContextKeys.editorTextFocus,
    primary: 0,
    handler: (accessor, args) => moveCopySelectedEditors(false, args, accessor),
    metadata: {
      description: localize("editorCommand.activeEditorCopy.description", "Copy the active editor by groups"),
      args: [
        {
          name: localize("editorCommand.activeEditorCopy.arg.name", "Active editor copy argument"),
          description: localize("editorCommand.activeEditorCopy.arg.description", "Argument Properties:\n	* 'to': String value providing where to copy.\n	* 'value': Number value providing how many positions or an absolute position to copy."),
          constraint: isSelectedEditorsMoveCopyArg,
          schema: moveCopyJSONSchema
        }
      ]
    }
  });
  [
    { id: MOVE_EDITOR_INTO_ABOVE_GROUP, to: "up" },
    { id: MOVE_EDITOR_INTO_BELOW_GROUP, to: "down" },
    { id: MOVE_EDITOR_INTO_LEFT_GROUP, to: "left" },
    { id: MOVE_EDITOR_INTO_RIGHT_GROUP, to: "right" }
  ].forEach(({ id, to }) => {
    CommandsRegistry.registerCommand(id, function(accessor, ...args) {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      if (resolvedContext.groupedEditors.length) {
        moveCopyEditorsToGroup(true, { to, by: "group" }, resolvedContext.groupedEditors[0].group, resolvedContext.groupedEditors[0].editors, accessor);
      }
    });
  });
  function moveCopySelectedEditors(isMove, args = /* @__PURE__ */ Object.create(null), accessor) {
    args.to = args.to || "right";
    args.by = args.by || "tab";
    args.value = typeof args.value === "number" ? args.value : 1;
    const activeGroup = accessor.get(IEditorGroupsService).activeGroup;
    const selectedEditors = activeGroup.selectedEditors;
    if (selectedEditors.length > 0) {
      switch (args.by) {
        case "tab":
          if (isMove) {
            return moveTabs(args, activeGroup, selectedEditors);
          }
          break;
        case "group":
          return moveCopyEditorsToGroup(isMove, args, activeGroup, selectedEditors, accessor);
      }
    }
  }
  function moveTabs(args, group, editors) {
    const to = args.to;
    if (to === "first" || to === "right") {
      editors = [...editors].reverse();
    } else if (to === "position" && (args.value ?? 1) < group.getIndexOfEditor(editors[0])) {
      editors = [...editors].reverse();
    }
    for (const editor of editors) {
      moveTab(args, group, editor);
    }
  }
  function moveTab(args, group, editor) {
    let index = group.getIndexOfEditor(editor);
    switch (args.to) {
      case "first":
        index = 0;
        break;
      case "last":
        index = group.count - 1;
        break;
      case "left":
        index = index - (args.value ?? 1);
        break;
      case "right":
        index = index + (args.value ?? 1);
        break;
      case "center":
        index = Math.round(group.count / 2) - 1;
        break;
      case "position":
        index = (args.value ?? 1) - 1;
        break;
    }
    index = index < 0 ? 0 : index >= group.count ? group.count - 1 : index;
    group.moveEditor(editor, group, { index });
  }
  function moveCopyEditorsToGroup(isMove, args, sourceGroup, editors, accessor) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    let targetGroup;
    switch (args.to) {
      case "left":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.LEFT }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.LEFT);
        }
        break;
      case "right":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.RIGHT }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.RIGHT);
        }
        break;
      case "up":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.UP }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.UP);
        }
        break;
      case "down":
        targetGroup = editorGroupsService.findGroup({ direction: GroupDirection.DOWN }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, GroupDirection.DOWN);
        }
        break;
      case "first":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.FIRST }, sourceGroup);
        break;
      case "last":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.LAST }, sourceGroup);
        break;
      case "previous":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.PREVIOUS }, sourceGroup);
        if (!targetGroup) {
          const oppositeDirection = preferredSideBySideGroupDirection(configurationService) === GroupDirection.RIGHT ? GroupDirection.LEFT : GroupDirection.UP;
          targetGroup = editorGroupsService.addGroup(sourceGroup, oppositeDirection);
        }
        break;
      case "next":
        targetGroup = editorGroupsService.findGroup({ location: GroupLocation.NEXT }, sourceGroup);
        if (!targetGroup) {
          targetGroup = editorGroupsService.addGroup(sourceGroup, preferredSideBySideGroupDirection(configurationService));
        }
        break;
      case "center":
        targetGroup = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)[editorGroupsService.count / 2 - 1];
        break;
      case "position":
        targetGroup = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE)[(args.value ?? 1) - 1];
        break;
    }
    if (targetGroup) {
      const editorsWithOptions = prepareMoveCopyEditors(sourceGroup, editors);
      if (isMove) {
        sourceGroup.moveEditors(editorsWithOptions, targetGroup);
      } else if (sourceGroup.id !== targetGroup.id) {
        sourceGroup.copyEditors(editorsWithOptions, targetGroup);
      }
      targetGroup.focus();
    }
  }
}
function registerEditorGroupsLayoutCommands() {
  function applyEditorLayout(accessor, layout) {
    if (!layout || typeof layout !== "object") {
      return;
    }
    const editorGroupsService = accessor.get(IEditorGroupsService);
    editorGroupsService.applyLayout(layout);
  }
  CommandsRegistry.registerCommand(LAYOUT_EDITOR_GROUPS_COMMAND_ID, (accessor, args) => {
    applyEditorLayout(accessor, args);
  });
  CommandsRegistry.registerCommand({
    id: "vscode.setEditorLayout",
    handler: (accessor, args) => applyEditorLayout(accessor, args),
    metadata: {
      "description": `Set the editor layout. Editor layout is represented as a tree of groups in which the first group is the root group of the layout.
					The orientation of the first group is 0 (horizontal) by default unless specified otherwise. The other orientations are 1 (vertical).
					The orientation of subsequent groups is the opposite of the orientation of the group that contains it.
					Here are some examples: A layout representing 1 row and 2 columns: { orientation: 0, groups: [{}, {}] }.
					A layout representing 3 rows and 1 column: { orientation: 1, groups: [{}, {}, {}] }.
					A layout representing 3 rows and 1 column in which the second row has 2 columns: { orientation: 1, groups: [{}, { groups: [{}, {}] }, {}] }
					`,
      args: [{
        name: "args",
        schema: {
          "type": "object",
          "required": ["groups"],
          "properties": {
            "orientation": {
              "type": "number",
              "default": 0,
              "description": `The orientation of the root group in the layout. 0 for horizontal, 1 for vertical.`,
              "enum": [0, 1],
              "enumDescriptions": [
                localize("editorGroupLayout.horizontal", "Horizontal"),
                localize("editorGroupLayout.vertical", "Vertical")
              ]
            },
            "groups": {
              "$ref": "#/definitions/editorGroupsSchema",
              "default": [{}, {}]
            }
          }
        }
      }]
    }
  });
  CommandsRegistry.registerCommand({
    id: "vscode.getEditorLayout",
    handler: (accessor) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      return editorGroupsService.getLayout();
    },
    metadata: {
      description: "Get Editor Layout",
      args: [],
      returns: "An editor layout object, in the same format as vscode.setEditorLayout"
    }
  });
}
function registerOpenEditorAPICommands() {
  function mixinContext(context, options, column) {
    if (!context) {
      return [options, column];
    }
    return [
      { ...context.editorOptions, ...options ?? /* @__PURE__ */ Object.create(null) },
      context.sideBySide ? SIDE_GROUP : column
    ];
  }
  CommandsRegistry.registerCommand({
    id: "vscode.open",
    handler: (accessor, arg) => {
      accessor.get(ICommandService).executeCommand(API_OPEN_EDITOR_COMMAND_ID, arg);
    },
    metadata: {
      description: "Opens the provided resource in the editor.",
      args: [{ name: "Uri" }]
    }
  });
  CommandsRegistry.registerCommand(API_OPEN_EDITOR_COMMAND_ID, async function(accessor, resourceArg, columnAndOptions, label, context) {
    const editorService = accessor.get(IEditorService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const openerService = accessor.get(IOpenerService);
    const pathService = accessor.get(IPathService);
    const configurationService = accessor.get(IConfigurationService);
    const untitledTextEditorService = accessor.get(IUntitledTextEditorService);
    const resourceOrString = typeof resourceArg === "string" ? resourceArg : URI.from(resourceArg, true);
    const [columnArg, optionsArg] = columnAndOptions ?? [];
    if (optionsArg || typeof columnArg === "number" || matchesScheme(resourceOrString, Schemas.untitled)) {
      const [options, column] = mixinContext(context, optionsArg, columnArg);
      const resource = URI.isUri(resourceOrString) ? resourceOrString : URI.parse(resourceOrString);
      let input;
      if (untitledTextEditorService.isUntitledWithAssociatedResource(resource)) {
        input = { resource: resource.with({ scheme: pathService.defaultUriScheme }), forceUntitled: true, options, label };
      } else {
        input = { resource, options, label };
      }
      await editorService.openEditor(input, columnToEditorGroup(editorGroupsService, configurationService, column));
    } else if (matchesScheme(resourceOrString, Schemas.command)) {
      return;
    } else {
      await openerService.open(resourceOrString, { openToSide: context?.sideBySide, editorOptions: context?.editorOptions });
    }
  });
  CommandsRegistry.registerCommand({
    id: "vscode.diff",
    handler: (accessor, left, right, label) => {
      accessor.get(ICommandService).executeCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, left, right, label);
    },
    metadata: {
      description: "Opens the provided resources in the diff editor to compare their contents.",
      args: [
        { name: "left", description: "Left-hand side resource of the diff editor" },
        { name: "right", description: "Right-hand side resource of the diff editor" },
        { name: "title", description: "Human readable title for the diff editor" }
      ]
    }
  });
  CommandsRegistry.registerCommand(API_OPEN_DIFF_EDITOR_COMMAND_ID, async function(accessor, originalResource, modifiedResource, labelAndOrDescription, columnAndOptions, context) {
    const editorService = accessor.get(IEditorService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    const [columnArg, optionsArg] = columnAndOptions ?? [];
    const [options, column] = mixinContext(context, optionsArg, columnArg);
    let label = void 0;
    let description = void 0;
    if (typeof labelAndOrDescription === "string") {
      label = labelAndOrDescription;
    } else if (labelAndOrDescription) {
      label = labelAndOrDescription.label;
      description = labelAndOrDescription.description;
    }
    await editorService.openEditor({
      original: { resource: URI.from(originalResource, true) },
      modified: { resource: URI.from(modifiedResource, true) },
      label,
      description,
      options
    }, columnToEditorGroup(editorGroupsService, configurationService, column));
  });
  CommandsRegistry.registerCommand(API_OPEN_WITH_EDITOR_COMMAND_ID, async (accessor, resource, id, columnAndOptions) => {
    const editorService = accessor.get(IEditorService);
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const configurationService = accessor.get(IConfigurationService);
    const [columnArg, optionsArg] = columnAndOptions ?? [];
    await editorService.openEditor({ resource: URI.from(resource, true), options: { pinned: true, ...optionsArg, override: id } }, columnToEditorGroup(editorGroupsService, configurationService, columnArg));
  });
  CommandsRegistry.registerCommand({
    id: "vscode.changes",
    handler: (accessor, title, resources) => {
      accessor.get(ICommandService).executeCommand("_workbench.changes", title, resources);
    },
    metadata: {
      description: "Opens a list of resources in the changes editor to compare their contents.",
      args: [
        { name: "title", description: "Human readable title for the diff editor" },
        { name: "resources", description: "List of resources to open in the changes editor" }
      ]
    }
  });
  CommandsRegistry.registerCommand("_workbench.changes", async (accessor, title, resources) => {
    const editorService = accessor.get(IEditorService);
    const editor = [];
    for (const [label, original, modified] of resources) {
      editor.push({
        resource: URI.revive(label),
        original: { resource: URI.revive(original) },
        modified: { resource: URI.revive(modified) }
      });
    }
    await editorService.openEditor({ resources: editor, label: title });
  });
  CommandsRegistry.registerCommand("_workbench.openMultiDiffEditor", async (accessor, options) => {
    const editorService = accessor.get(IEditorService);
    const resources = options.resources?.map((r) => ({ original: { resource: URI.revive(r.originalUri) }, modified: { resource: URI.revive(r.modifiedUri) } }));
    const revealUri = options.reveal?.modifiedUri ? URI.revive(options.reveal.modifiedUri) : void 0;
    const revealResource = revealUri && resources ? resources.find((r) => isEqual(r.modified.resource, revealUri)) : void 0;
    if (options.reveal && !revealResource) {
      console.error("Reveal resource not found");
    }
    const multiDiffEditorOptions = {
      viewState: revealResource ? {
        revealData: {
          resource: {
            original: revealResource.original.resource,
            modified: revealResource.modified.resource
          },
          range: options.reveal?.range
        }
      } : void 0
    };
    await editorService.openEditor({
      multiDiffSource: options.multiDiffSourceUri ? URI.revive(options.multiDiffSourceUri) : void 0,
      resources,
      label: options.title,
      options: multiDiffEditorOptions
    });
  });
}
function registerOpenEditorAtIndexCommands() {
  const openEditorAtIndex = (accessor, editorIndex) => {
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (activeEditorPane && typeof editorIndex === "number") {
      const editor = activeEditorPane.group.getEditorByIndex(editorIndex);
      if (editor) {
        editorService.openEditor(editor);
      }
    }
  };
  CommandsRegistry.registerCommand({
    id: OPEN_EDITOR_AT_INDEX_COMMAND_ID,
    handler: openEditorAtIndex
  });
  for (let i = 0; i < 9; i++) {
    const editorIndex = i;
    const visibleIndex = i + 1;
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: OPEN_EDITOR_AT_INDEX_COMMAND_ID + visibleIndex,
      weight: KeybindingWeight.WorkbenchContrib,
      when: void 0,
      primary: KeyMod.Alt | toKeyCode(visibleIndex),
      mac: { primary: KeyMod.WinCtrl | toKeyCode(visibleIndex) },
      handler: (accessor) => openEditorAtIndex(accessor, editorIndex)
    });
  }
  function toKeyCode(index) {
    switch (index) {
      case 0:
        return KeyCode.Digit0;
      case 1:
        return KeyCode.Digit1;
      case 2:
        return KeyCode.Digit2;
      case 3:
        return KeyCode.Digit3;
      case 4:
        return KeyCode.Digit4;
      case 5:
        return KeyCode.Digit5;
      case 6:
        return KeyCode.Digit6;
      case 7:
        return KeyCode.Digit7;
      case 8:
        return KeyCode.Digit8;
      case 9:
        return KeyCode.Digit9;
    }
    throw new Error("invalid index");
  }
}
function registerFocusEditorGroupAtIndexCommands() {
  for (let groupIndex = 1; groupIndex < 8; groupIndex++) {
    KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: toCommandId(groupIndex),
      weight: KeybindingWeight.WorkbenchContrib,
      when: void 0,
      primary: KeyMod.CtrlCmd | toKeyCode(groupIndex),
      handler: (accessor) => {
        const editorGroupsService = accessor.get(IEditorGroupsService);
        const configurationService = accessor.get(IConfigurationService);
        if (groupIndex > editorGroupsService.count) {
          return;
        }
        const groups = editorGroupsService.getGroups(GroupsOrder.GRID_APPEARANCE);
        if (groups[groupIndex]) {
          return groups[groupIndex].focus();
        }
        const direction = preferredSideBySideGroupDirection(configurationService);
        const lastGroup = editorGroupsService.findGroup({ location: GroupLocation.LAST });
        if (!lastGroup) {
          return;
        }
        const newGroup = editorGroupsService.addGroup(lastGroup, direction);
        newGroup.focus();
      }
    });
  }
  function toCommandId(index) {
    switch (index) {
      case 1:
        return "workbench.action.focusSecondEditorGroup";
      case 2:
        return "workbench.action.focusThirdEditorGroup";
      case 3:
        return "workbench.action.focusFourthEditorGroup";
      case 4:
        return "workbench.action.focusFifthEditorGroup";
      case 5:
        return "workbench.action.focusSixthEditorGroup";
      case 6:
        return "workbench.action.focusSeventhEditorGroup";
      case 7:
        return "workbench.action.focusEighthEditorGroup";
    }
    throw new Error("Invalid index");
  }
  function toKeyCode(index) {
    switch (index) {
      case 1:
        return KeyCode.Digit2;
      case 2:
        return KeyCode.Digit3;
      case 3:
        return KeyCode.Digit4;
      case 4:
        return KeyCode.Digit5;
      case 5:
        return KeyCode.Digit6;
      case 6:
        return KeyCode.Digit7;
      case 7:
        return KeyCode.Digit8;
    }
    throw new Error("Invalid index");
  }
}
function splitEditor(editorGroupsService, direction, resolvedContext) {
  if (!resolvedContext.groupedEditors.length) {
    return;
  }
  const { group, editors } = resolvedContext.groupedEditors[0];
  const preserveFocus = resolvedContext.preserveFocus;
  const newGroup = editorGroupsService.addGroup(group, direction);
  for (const editorToCopy of editors) {
    if (editorToCopy && !editorToCopy.hasCapability(EditorInputCapabilities.Singleton)) {
      group.copyEditor(editorToCopy, newGroup, { preserveFocus });
    }
  }
  newGroup.focus();
}
function registerSplitEditorCommands() {
  [
    { id: SPLIT_EDITOR_UP, direction: GroupDirection.UP },
    { id: SPLIT_EDITOR_DOWN, direction: GroupDirection.DOWN },
    { id: SPLIT_EDITOR_LEFT, direction: GroupDirection.LEFT },
    { id: SPLIT_EDITOR_RIGHT, direction: GroupDirection.RIGHT }
  ].forEach(({ id, direction }) => {
    CommandsRegistry.registerCommand(id, function(accessor, ...args) {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      splitEditor(accessor.get(IEditorGroupsService), direction, resolvedContext);
    });
  });
}
function registerCloseEditorCommands() {
  function closeEditorHandler(accessor, forceCloseStickyEditors, ...args) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    let keepStickyEditors = void 0;
    if (forceCloseStickyEditors) {
      keepStickyEditors = false;
    } else if (args.length) {
      keepStickyEditors = false;
    } else {
      keepStickyEditors = editorGroupsService.partOptions.preventPinnedEditorClose === "keyboard" || editorGroupsService.partOptions.preventPinnedEditorClose === "keyboardAndMouse";
    }
    if (keepStickyEditors) {
      const activeGroup = editorGroupsService.activeGroup;
      const activeEditor = activeGroup.activeEditor;
      if (activeEditor && activeGroup.isSticky(activeEditor)) {
        const nextNonStickyEditorInGroup = activeGroup.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true })[0];
        if (nextNonStickyEditorInGroup) {
          return activeGroup.openEditor(nextNonStickyEditorInGroup);
        }
        const nextNonStickyEditorInAllGroups = editorService.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE, { excludeSticky: true })[0];
        if (nextNonStickyEditorInAllGroups) {
          return Promise.resolve(editorGroupsService.getGroup(nextNonStickyEditorInAllGroups.groupId)?.openEditor(nextNonStickyEditorInAllGroups.editor));
        }
      }
    }
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const preserveFocus = resolvedContext.preserveFocus;
    return Promise.all(resolvedContext.groupedEditors.map(async ({ group, editors }) => {
      const editorsToClose = editors.filter((editor) => !keepStickyEditors || !group.isSticky(editor));
      await group.closeEditors(editorsToClose, { preserveFocus });
    }));
  }
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyMod.CtrlCmd | KeyCode.KeyW,
    win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
    handler: (accessor, ...args) => {
      return closeEditorHandler(accessor, false, ...args);
    }
  });
  CommandsRegistry.registerCommand(CLOSE_PINNED_EDITOR_COMMAND_ID, (accessor, ...args) => {
    return closeEditorHandler(accessor, true, ...args);
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyW),
    handler: (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
        await group.closeAllEditors({ excludeSticky: true });
      }));
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITOR_GROUP_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ContextKeyExpr.and(ActiveEditorGroupEmptyContext, MultipleEditorGroupsContext),
    primary: KeyMod.CtrlCmd | KeyCode.KeyW,
    win: { primary: KeyMod.CtrlCmd | KeyCode.F4, secondary: [KeyMod.CtrlCmd | KeyCode.KeyW] },
    handler: (accessor, ...args) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const commandsContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
      if (commandsContext.groupedEditors.length) {
        editorGroupsService.removeGroup(commandsContext.groupedEditors[0].group);
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_SAVED_EDITORS_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyU),
    handler: (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      return Promise.all(resolvedContext.groupedEditors.map(async ({ group }) => {
        await group.closeEditors({ savedOnly: true, excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
      }));
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyT },
    handler: (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      return Promise.all(resolvedContext.groupedEditors.map(async ({ group, editors }) => {
        const editorsToClose = group.getEditors(EditorsOrder.SEQUENTIAL, { excludeSticky: true }).filter((editor) => !editors.includes(editor));
        for (const editorToKeep of editors) {
          if (editorToKeep) {
            group.pinEditor(editorToKeep);
          }
        }
        await group.closeEditors(editorsToClose, { preserveFocus: resolvedContext.preserveFocus });
      }));
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      if (resolvedContext.groupedEditors.length) {
        const { group, editors } = resolvedContext.groupedEditors[0];
        if (group.activeEditor) {
          group.pinEditor(group.activeEditor);
        }
        await group.closeEditors({ direction: CloseDirection.RIGHT, except: editors[0], excludeSticky: true }, { preserveFocus: resolvedContext.preserveFocus });
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: REOPEN_WITH_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: (accessor, ...args) => {
      return reopenEditorWith(accessor, EditorResolution.PICK, ...args);
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: (accessor, override, ...args) => {
      return reopenEditorWith(accessor, override ?? EditorResolution.PICK, ...args);
    }
  });
  async function reopenEditorWith(accessor, editorOverride, ...args) {
    const editorService = accessor.get(IEditorService);
    const editorResolverService = accessor.get(IEditorResolverService);
    const telemetryService = accessor.get(ITelemetryService);
    const textFileService = accessor.get(ITextFileService);
    const workingCopyService = accessor.get(IWorkingCopyService);
    const workingCopyEditorService = accessor.get(IWorkingCopyEditorService);
    const resolvedContext = resolveCommandsContext(args, editorService, accessor.get(IEditorGroupsService), accessor.get(IListService));
    const editorReplacements = /* @__PURE__ */ new Map();
    for (const { group, editors } of resolvedContext.groupedEditors) {
      for (const editor of editors) {
        const isDiffEditor = isDiffEditorInput(editor);
        const editorToResolve = isDiffEditor ? editor.modified : editor;
        const untypedEditor = isDiffEditor ? editor.toUntyped() : editorToResolve.toUntyped();
        if (!untypedEditor) {
          return;
        }
        untypedEditor.options = { ...editorService.activeEditorPane?.options, override: editorOverride };
        const resolvedEditor = await editorResolverService.resolveEditor(untypedEditor, group);
        if (!isEditorInputWithOptionsAndGroup(resolvedEditor)) {
          return;
        }
        let editorReplacementsInGroup = editorReplacements.get(group);
        if (!editorReplacementsInGroup) {
          editorReplacementsInGroup = [];
          editorReplacements.set(group, editorReplacementsInGroup);
        }
        const resource = editorToResolve.resource;
        let forceReplaceDirty = !!resource && (resource.scheme === Schemas.untitled || textFileService.isDirty(resource));
        if (forceReplaceDirty && editorToResolve.isDirty()) {
          for (const workingCopy of workingCopyService.dirtyWorkingCopies) {
            if (isEqual(workingCopy.resource, resource)) {
              continue;
            }
            if (workingCopyEditorService.findEditor(workingCopy)?.editor === editorToResolve) {
              forceReplaceDirty = false;
              break;
            }
          }
        }
        editorReplacementsInGroup.push({
          editor,
          replacement: resolvedEditor.editor,
          forceReplaceDirty,
          options: resolvedEditor.options
        });
        telemetryService.publicLog2("workbenchEditorReopen", {
          scheme: editorToResolve.resource?.scheme ?? "",
          ext: editorToResolve.resource ? extname(editorToResolve.resource) : "",
          from: editor.editorId ?? "",
          to: resolvedEditor.editor.editorId ?? ""
        });
      }
    }
    for (const [group, replacements] of editorReplacements) {
      await group.replaceEditors(replacements);
      await group.openEditor(replacements[0].replacement);
    }
  }
  CommandsRegistry.registerCommand(CLOSE_EDITORS_AND_GROUP_COMMAND_ID, async (accessor, ...args) => {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
    if (resolvedContext.groupedEditors.length) {
      const { group } = resolvedContext.groupedEditors[0];
      await group.closeAllEditors();
      if (group.count === 0 && editorGroupsService.getGroup(group.id)) {
        editorGroupsService.removeGroup(group);
      }
    }
  });
}
function registerFocusEditorGroupWihoutWrapCommands() {
  const commands = [
    {
      id: FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.LEFT
    },
    {
      id: FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.RIGHT
    },
    {
      id: FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.UP
    },
    {
      id: FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID,
      direction: GroupDirection.DOWN
    }
  ];
  for (const command of commands) {
    CommandsRegistry.registerCommand(command.id, async (accessor) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const group = editorGroupsService.findGroup({ direction: command.direction }, editorGroupsService.activeGroup, false) ?? editorGroupsService.activeGroup;
      group.focus();
    });
  }
}
function registerSplitEditorInGroupCommands() {
  async function splitEditorInGroup(accessor, resolvedContext) {
    const instantiationService = accessor.get(IInstantiationService);
    if (!resolvedContext.groupedEditors.length) {
      return;
    }
    const { group, editors } = resolvedContext.groupedEditors[0];
    const editor = editors[0];
    if (!editor) {
      return;
    }
    await group.replaceEditors([{
      editor,
      replacement: instantiationService.createInstance(SideBySideEditorInput, void 0, void 0, editor, editor),
      forceReplaceDirty: true
    }]);
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: SPLIT_EDITOR_IN_GROUP,
        title: localize2("splitEditorInGroup", "Split Editor in Group"),
        category: Categories.View,
        precondition: ActiveEditorCanSplitInGroupContext,
        f1: true,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          when: ActiveEditorCanSplitInGroupContext,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash)
        }
      });
    }
    run(accessor, ...args) {
      return splitEditorInGroup(accessor, resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService)));
    }
  });
  async function joinEditorInGroup(resolvedContext) {
    if (!resolvedContext.groupedEditors.length) {
      return;
    }
    const { group, editors } = resolvedContext.groupedEditors[0];
    const editor = editors[0];
    if (!editor) {
      return;
    }
    if (!(editor instanceof SideBySideEditorInput)) {
      return;
    }
    let options = void 0;
    const activeEditorPane = group.activeEditorPane;
    if (activeEditorPane instanceof SideBySideEditor && group.activeEditor === editor) {
      for (const pane of [activeEditorPane.getPrimaryEditorPane(), activeEditorPane.getSecondaryEditorPane()]) {
        if (pane?.hasFocus()) {
          options = { viewState: pane.getViewState() };
          break;
        }
      }
    }
    await group.replaceEditors([{
      editor,
      replacement: editor.primary,
      options
    }]);
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: JOIN_EDITOR_IN_GROUP,
        title: localize2("joinEditorInGroup", "Join Editor in Group"),
        category: Categories.View,
        precondition: SideBySideEditorActiveContext,
        f1: true,
        keybinding: {
          weight: KeybindingWeight.WorkbenchContrib,
          when: SideBySideEditorActiveContext,
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash)
        }
      });
    }
    run(accessor, ...args) {
      return joinEditorInGroup(resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService)));
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_SPLIT_EDITOR_IN_GROUP,
        title: localize2("toggleJoinEditorInGroup", "Toggle Split Editor in Group"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(ActiveEditorCanSplitInGroupContext, SideBySideEditorActiveContext),
        f1: true
      });
    }
    async run(accessor, ...args) {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      if (!resolvedContext.groupedEditors.length) {
        return;
      }
      const { editors } = resolvedContext.groupedEditors[0];
      if (editors[0] instanceof SideBySideEditorInput) {
        await joinEditorInGroup(resolvedContext);
      } else if (editors[0]) {
        await splitEditorInGroup(accessor, resolvedContext);
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
        title: localize2("toggleSplitEditorInGroupLayout", "Toggle Layout of Split Editor in Group"),
        category: Categories.View,
        precondition: SideBySideEditorActiveContext,
        f1: true
      });
    }
    async run(accessor) {
      const configurationService = accessor.get(IConfigurationService);
      const currentSetting = configurationService.getValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING);
      let newSetting;
      if (currentSetting !== "horizontal") {
        newSetting = "horizontal";
      } else {
        newSetting = "vertical";
      }
      return configurationService.updateValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING, newSetting);
    }
  });
}
function registerFocusSideEditorsCommands() {
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: FOCUS_FIRST_SIDE_EDITOR,
        title: localize2("focusLeftSideEditor", "Focus First Side in Active Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
        f1: true
      });
    }
    async run(accessor) {
      const editorService = accessor.get(IEditorService);
      const commandService = accessor.get(ICommandService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane instanceof SideBySideEditor) {
        activeEditorPane.getSecondaryEditorPane()?.focus();
      } else if (activeEditorPane instanceof TextDiffEditor) {
        await commandService.executeCommand(DIFF_FOCUS_SECONDARY_SIDE);
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: FOCUS_SECOND_SIDE_EDITOR,
        title: localize2("focusRightSideEditor", "Focus Second Side in Active Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
        f1: true
      });
    }
    async run(accessor) {
      const editorService = accessor.get(IEditorService);
      const commandService = accessor.get(ICommandService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane instanceof SideBySideEditor) {
        activeEditorPane.getPrimaryEditorPane()?.focus();
      } else if (activeEditorPane instanceof TextDiffEditor) {
        await commandService.executeCommand(DIFF_FOCUS_PRIMARY_SIDE);
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: FOCUS_OTHER_SIDE_EDITOR,
        title: localize2("focusOtherSideEditor", "Focus Other Side in Active Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.or(SideBySideEditorActiveContext, TextCompareEditorActiveContext),
        f1: true
      });
    }
    async run(accessor) {
      const editorService = accessor.get(IEditorService);
      const commandService = accessor.get(ICommandService);
      const activeEditorPane = editorService.activeEditorPane;
      if (activeEditorPane instanceof SideBySideEditor) {
        if (activeEditorPane.getPrimaryEditorPane()?.hasFocus()) {
          activeEditorPane.getSecondaryEditorPane()?.focus();
        } else {
          activeEditorPane.getPrimaryEditorPane()?.focus();
        }
      } else if (activeEditorPane instanceof TextDiffEditor) {
        await commandService.executeCommand(DIFF_FOCUS_OTHER_SIDE);
      }
    }
  });
}
function registerOtherEditorCommands() {
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: KEEP_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.Enter),
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      for (const { group, editors } of resolvedContext.groupedEditors) {
        for (const editor of editors) {
          group.pinEditor(editor);
        }
      }
    }
  });
  CommandsRegistry.registerCommand({
    id: TOGGLE_KEEP_EDITORS_COMMAND_ID,
    handler: (accessor) => {
      const configurationService = accessor.get(IConfigurationService);
      const currentSetting = configurationService.getValue("workbench.editor.enablePreview");
      const newSetting = currentSetting !== true;
      configurationService.updateValue("workbench.editor.enablePreview", newSetting);
    }
  });
  function setEditorGroupLock(accessor, locked, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const group = resolvedContext.groupedEditors[0]?.group;
    group?.lock(locked ?? !group.isLocked);
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_LOCK_GROUP_COMMAND_ID,
        title: localize2("toggleEditorGroupLock", "Toggle Editor Group Lock"),
        category: Categories.View,
        f1: true
      });
    }
    async run(accessor, ...args) {
      setEditorGroupLock(accessor, void 0, ...args);
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: LOCK_GROUP_COMMAND_ID,
        title: localize2("lockEditorGroup", "Lock Editor Group"),
        category: Categories.View,
        precondition: ActiveEditorGroupLockedContext.toNegated(),
        f1: true
      });
    }
    async run(accessor, ...args) {
      setEditorGroupLock(accessor, true, ...args);
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: UNLOCK_GROUP_COMMAND_ID,
        title: localize2("unlockEditorGroup", "Unlock Editor Group"),
        precondition: ActiveEditorGroupLockedContext,
        category: Categories.View,
        f1: true
      });
    }
    async run(accessor, ...args) {
      setEditorGroupLock(accessor, false, ...args);
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: PIN_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ActiveEditorStickyContext.toNegated(),
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.Enter),
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      for (const { group, editors } of resolvedContext.groupedEditors) {
        for (const editor of editors) {
          group.stickEditor(editor);
        }
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: UNPIN_EDITOR_COMMAND_ID,
    weight: KeybindingWeight.WorkbenchContrib,
    when: ActiveEditorStickyContext,
    primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.Shift | KeyCode.Enter),
    handler: async (accessor, ...args) => {
      const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
      for (const { group, editors } of resolvedContext.groupedEditors) {
        for (const editor of editors) {
          group.unstickEditor(editor);
        }
      }
    }
  });
  KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: SHOW_EDITORS_IN_GROUP,
    weight: KeybindingWeight.WorkbenchContrib,
    when: void 0,
    primary: void 0,
    handler: (accessor, ...args) => {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      const quickInputService = accessor.get(IQuickInputService);
      const commandsContext = resolveCommandsContext(args, accessor.get(IEditorService), editorGroupsService, accessor.get(IListService));
      const group = commandsContext.groupedEditors[0]?.group;
      if (group) {
        editorGroupsService.activateGroup(group);
      }
      return quickInputService.quickAccess.show(ActiveGroupEditorsByMostRecentlyUsedQuickAccess.PREFIX);
    }
  });
}
function registerModalEditorCommands() {
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
        title: localize2("moveToMainWindow", "Open Modal Editor in Main Window"),
        category: Categories.View,
        f1: true,
        icon: Codicon.openInProduct,
        precondition: EditorPartModalContext,
        menu: {
          id: MenuId.ModalEditorTitle,
          group: "navigation",
          order: 0,
          when: IsSessionsWindowContext.negate()
        }
      });
    }
    async run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          await part.close({ mergeAllEditorsToMainPart: true });
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
        title: localize2("moveModalEditorToWindow", "Open Modal Editor in New Window"),
        category: Categories.View,
        f1: true,
        icon: Codicon.emptyWindow,
        precondition: EditorPartModalContext,
        menu: [{
          id: MenuId.ModalEditorTitleContext,
          group: "1_window",
          order: 0,
          when: IsSessionsWindowContext
        }]
      });
    }
    async run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          const auxiliaryEditorPart = await editorGroupsService.createAuxiliaryEditorPart();
          for (const group of part.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
            group.moveEditors(group.editors.map((editor) => ({ editor, options: { preserveFocus: true } })), auxiliaryEditorPart.activeGroup);
          }
          auxiliaryEditorPart.activeGroup.focus();
          await part.close();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID,
        title: localize2("toggleModalEditorSidebar", "Toggle Modal Editor Sidebar"),
        category: Categories.View,
        f1: true,
        precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalSidebarContext)
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          part.toggleSidebar();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
        title: localize2("toggleModalEditorMaximized", "Maximize Modal Editor"),
        category: Categories.View,
        f1: true,
        precondition: EditorPartModalContext,
        icon: Codicon.screenFull,
        toggled: {
          condition: EditorPartModalMaximizedContext,
          title: localize("restoreModalEditorSize", "Restore Modal Editor")
        },
        menu: {
          id: MenuId.ModalEditorTitle,
          group: "navigation",
          order: 99
        }
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          part.toggleMaximized();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: CLOSE_MODAL_EDITOR_COMMAND_ID,
        title: localize2("closeModalEditor", "Close Modal Editor"),
        category: Categories.View,
        f1: true,
        icon: Codicon.close,
        precondition: EditorPartModalContext,
        keybinding: [{
          primary: KeyCode.Escape,
          weight: KeybindingWeight.WorkbenchContrib + 10,
          // higher when no text editor or list/tree is focused...
          when: ContextKeyExpr.and(EditorContextKeys.focus.toNegated(), RawWorkbenchListFocusContextKey.negate())
        }, {
          primary: KeyCode.Escape,
          weight: KeybindingWeight.EditorContrib - 1,
          // ...lower to prevent accidental close when text editor is focused
          when: EditorContextKeys.focus
        }, {
          primary: KeyCode.Escape,
          // When a list/tree is focused, still close the modal, but yield to the
          // list/tree's own `Escape` features that should close first (the find
          // widget and sticky scroll). The selection is intentionally not cleared
          // first so a single `Escape` closes the modal.
          weight: KeybindingWeight.WorkbenchContrib + 1,
          when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen.negate(), WorkbenchTreeStickyScrollFocused.negate())
        }],
        menu: {
          id: MenuId.ModalEditorTitle,
          group: "navigation",
          order: 100
        }
      });
    }
    async run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          await part.close();
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
        title: localize2("navigateModalEditorPrevious", "Navigate to Previous Item in Modal Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext),
        keybinding: {
          primary: KeyMod.Alt | KeyCode.UpArrow,
          weight: KeybindingWeight.WorkbenchContrib + 10,
          when: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext)
        }
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          const nav = part.navigation;
          if (nav && nav.current > 0) {
            nav.navigate(nav.current - 1);
          }
          break;
        }
      }
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
        title: localize2("navigateModalEditorNext", "Navigate to Next Item in Modal Editor"),
        category: Categories.View,
        precondition: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext),
        keybinding: {
          primary: KeyMod.Alt | KeyCode.DownArrow,
          weight: KeybindingWeight.WorkbenchContrib + 10,
          when: ContextKeyExpr.and(EditorPartModalContext, EditorPartModalNavigationContext)
        }
      });
    }
    run(accessor) {
      const editorGroupsService = accessor.get(IEditorGroupsService);
      for (const part of editorGroupsService.parts) {
        if (isModalEditorPart(part)) {
          const nav = part.navigation;
          if (nav && nav.current < nav.total - 1) {
            nav.navigate(nav.current + 1);
          }
          break;
        }
      }
    }
  });
}
function isModalEditorPart(obj) {
  const part = obj;
  return !!part && typeof part.close === "function" && typeof part.onWillClose === "function" && typeof part.toggleMaximized === "function" && typeof part.maximized === "boolean" && typeof part.updateOptions === "function" && !!part.modalElement && part.windowId === mainWindow.vscodeWindowId;
}
function setup() {
  registerEditorMoveCopyCommand();
  registerEditorGroupsLayoutCommands();
  registerDiffEditorCommands();
  registerOpenEditorAPICommands();
  registerOpenEditorAtIndexCommands();
  registerCloseEditorCommands();
  registerOtherEditorCommands();
  registerSplitEditorInGroupCommands();
  registerFocusSideEditorsCommands();
  registerFocusEditorGroupAtIndexCommands();
  registerSplitEditorCommands();
  registerFocusEditorGroupWihoutWrapCommands();
  registerModalEditorCommands();
}
export {
  API_OPEN_DIFF_EDITOR_COMMAND_ID,
  API_OPEN_EDITOR_COMMAND_ID,
  API_OPEN_WITH_EDITOR_COMMAND_ID,
  CLOSE_EDITORS_AND_GROUP_COMMAND_ID,
  CLOSE_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_EDITORS_TO_THE_RIGHT_COMMAND_ID,
  CLOSE_EDITOR_COMMAND_ID,
  CLOSE_EDITOR_GROUP_COMMAND_ID,
  CLOSE_MODAL_EDITOR_COMMAND_ID,
  CLOSE_OTHER_EDITORS_IN_GROUP_COMMAND_ID,
  CLOSE_PINNED_EDITOR_COMMAND_ID,
  CLOSE_SAVED_EDITORS_COMMAND_ID,
  COPY_ACTIVE_EDITOR_COMMAND_ID,
  COPY_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  COPY_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  EDITOR_CORE_NAVIGATION_COMMANDS,
  FOCUS_ABOVE_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_BELOW_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_FIRST_SIDE_EDITOR,
  FOCUS_LEFT_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_OTHER_SIDE_EDITOR,
  FOCUS_RIGHT_GROUP_WITHOUT_WRAP_COMMAND_ID,
  FOCUS_SECOND_SIDE_EDITOR,
  JOIN_EDITOR_IN_GROUP,
  KEEP_EDITOR_COMMAND_ID,
  LAYOUT_EDITOR_GROUPS_COMMAND_ID,
  LOCK_GROUP_COMMAND_ID,
  MOVE_ACTIVE_EDITOR_COMMAND_ID,
  MOVE_EDITOR_GROUP_INTO_NEW_WINDOW_COMMAND_ID,
  MOVE_EDITOR_INTO_ABOVE_GROUP,
  MOVE_EDITOR_INTO_BELOW_GROUP,
  MOVE_EDITOR_INTO_LEFT_GROUP,
  MOVE_EDITOR_INTO_NEW_WINDOW_COMMAND_ID,
  MOVE_EDITOR_INTO_RIGHT_GROUP,
  MOVE_MODAL_EDITOR_TO_MAIN_COMMAND_ID,
  MOVE_MODAL_EDITOR_TO_WINDOW_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_NEXT_COMMAND_ID,
  NAVIGATE_MODAL_EDITOR_PREVIOUS_COMMAND_ID,
  NEW_EMPTY_EDITOR_WINDOW_COMMAND_ID,
  OPEN_EDITOR_AT_INDEX_COMMAND_ID,
  PIN_EDITOR_COMMAND_ID,
  REOPEN_ACTIVE_EDITOR_WITH_COMMAND_ID,
  REOPEN_WITH_COMMAND_ID,
  SHOW_EDITORS_IN_GROUP,
  SPLIT_EDITOR,
  SPLIT_EDITOR_DOWN,
  SPLIT_EDITOR_IN_GROUP,
  SPLIT_EDITOR_LEFT,
  SPLIT_EDITOR_RIGHT,
  SPLIT_EDITOR_UP,
  TOGGLE_KEEP_EDITORS_COMMAND_ID,
  TOGGLE_LOCK_GROUP_COMMAND_ID,
  TOGGLE_MAXIMIZE_EDITOR_GROUP,
  TOGGLE_MODAL_EDITOR_MAXIMIZED_COMMAND_ID,
  TOGGLE_MODAL_EDITOR_SIDEBAR_COMMAND_ID,
  TOGGLE_SPLIT_EDITOR_IN_GROUP,
  TOGGLE_SPLIT_EDITOR_IN_GROUP_LAYOUT,
  UNLOCK_GROUP_COMMAND_ID,
  UNPIN_EDITOR_COMMAND_ID,
  setup,
  splitEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvckNvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzLCBtYXRjaGVzU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzTnVtYmVyLCBpc09iamVjdCwgaXNTdHJpbmcsIGlzVW5kZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZEhhbmRsZXIsIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvbHV0aW9uLCBJRWRpdG9yT3B0aW9ucywgSVJlc291cmNlRWRpdG9ySW5wdXQsIElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCwgS2V5YmluZGluZ3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBJT3BlbkV2ZW50LCBSYXdXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hUcmVlRmluZE9wZW4sIFdvcmtiZW5jaFRyZWVTdGlja3lTY3JvbGxGb2N1c2VkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEFjdGl2ZUdyb3VwRWRpdG9yc0J5TW9zdFJlY2VudGx5VXNlZFF1aWNrQWNjZXNzIH0gZnJvbSAnLi9lZGl0b3JRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi9zaWRlQnlTaWRlRWRpdG9yLmpzJztcbmltcG9ydCB7IFRleHREaWZmRWRpdG9yIH0gZnJvbSAnLi90ZXh0RGlmZkVkaXRvci5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0LCBBY3RpdmVFZGl0b3JHcm91cEVtcHR5Q29udGV4dCwgQWN0aXZlRWRpdG9yR3JvdXBMb2NrZWRDb250ZXh0LCBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxNYXhpbWl6ZWRDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxOYXZpZ2F0aW9uQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsU2lkZWJhckNvbnRleHQsIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LCBNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQsIFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LCBUZXh0Q29tcGFyZUVkaXRvckFjdGl2ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ2xvc2VEaXJlY3Rpb24sIEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLCBFZGl0b3JzT3JkZXIsIElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCwgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQsIGlzRGlmZkVkaXRvcklucHV0LCBpc0VkaXRvcklucHV0V2l0aE9wdGlvbnNBbmRHcm91cCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3Ivc2lkZUJ5U2lkZUVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvckdyb3VwQ29sdW1uLCBjb2x1bW5Ub0VkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cExheW91dCwgR3JvdXBEaXJlY3Rpb24sIEdyb3VwTG9jYXRpb24sIEdyb3Vwc09yZGVyLCBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlLCBJRWRpdG9yUmVwbGFjZW1lbnQsIElNb2RhbEVkaXRvclBhcnQsIHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVVudGl0bGVkVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91bnRpdGxlZC9jb21tb24vdW50aXRsZWRUZXh0RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBESUZGX0ZPQ1VTX09USEVSX1NJREUsIERJRkZfRk9DVVNfUFJJTUFSWV9TSURFLCBESUZGX0ZPQ1VTX1NFQ09OREFSWV9TSURFLCByZWdpc3RlckRpZmZFZGl0b3JDb21tYW5kcyB9IGZyb20gJy4vZGlmZkVkaXRvckNvbW1hbmRzLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZEVkaXRvckNvbW1hbmRzQ29udGV4dCwgcmVzb2x2ZUNvbW1hbmRzQ29udGV4dCB9IGZyb20gJy4vZWRpdG9yQ29tbWFuZHNDb250ZXh0LmpzJztcbmltcG9ydCB7IHByZXBhcmVNb3ZlQ29weUVkaXRvcnMgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSU11bHRpRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvbXVsdGlEaWZmRWRpdG9yL211bHRpRGlmZkVkaXRvcldpZGdldEltcGwuanMnO1xuXG5leHBvcnQgY29uc3QgQ0xPU0VfU0FWRURfRURJVE9SU19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VVbm1vZGlmaWVkRWRpdG9ycyc7XG5leHBvcnQgY29uc3QgQ0xPU0VfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VFZGl0b3JzSW5Hcm91cCc7XG5leHBvcnQgY29uc3QgQ0xPU0VfRURJVE9SU19BTkRfR1JPVVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlRWRpdG9yc0FuZEdyb3VwJztcbmV4cG9ydCBjb25zdCBDTE9TRV9FRElUT1JTX1RPX1RIRV9SSUdIVF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VFZGl0b3JzVG9UaGVSaWdodCc7XG5leHBvcnQgY29uc3QgQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jbG9zZUFjdGl2ZUVkaXRvcic7XG5leHBvcnQgY29uc3QgQ0xPU0VfUElOTkVEX0VESVRPUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VBY3RpdmVQaW5uZWRFZGl0b3InO1xuZXhwb3J0IGNvbnN0IENMT1NFX0VESVRPUl9HUk9VUF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VHcm91cCc7XG5leHBvcnQgY29uc3QgQ0xPU0VfT1RIRVJfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VPdGhlckVkaXRvcnMnO1xuXG5leHBvcnQgY29uc3QgTU9WRV9BQ1RJVkVfRURJVE9SX0NPTU1BTkRfSUQgPSAnbW92ZUFjdGl2ZUVkaXRvcic7XG5leHBvcnQgY29uc3QgQ09QWV9BQ1RJVkVfRURJVE9SX0NPTU1BTkRfSUQgPSAnY29weUFjdGl2ZUVkaXRvcic7XG5leHBvcnQgY29uc3QgTEFZT1VUX0VESVRPUl9HUk9VUFNfQ09NTUFORF9JRCA9ICdsYXlvdXRFZGl0b3JHcm91cHMnO1xuZXhwb3J0IGNvbnN0IEtFRVBfRURJVE9SX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5rZWVwRWRpdG9yJztcbmV4cG9ydCBjb25zdCBUT0dHTEVfS0VFUF9FRElUT1JTX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVLZWVwRWRpdG9ycyc7XG5leHBvcnQgY29uc3QgVE9HR0xFX0xPQ0tfR1JPVVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUVkaXRvckdyb3VwTG9jayc7XG5leHBvcnQgY29uc3QgTE9DS19HUk9VUF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubG9ja0VkaXRvckdyb3VwJztcbmV4cG9ydCBjb25zdCBVTkxPQ0tfR1JPVVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnVubG9ja0VkaXRvckdyb3VwJztcbmV4cG9ydCBjb25zdCBTSE9XX0VESVRPUlNfSU5fR1JPVVAgPSAnd29ya2JlbmNoLmFjdGlvbi5zaG93RWRpdG9yc0luR3JvdXAnO1xuZXhwb3J0IGNvbnN0IFJFT1BFTl9XSVRIX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5yZW9wZW5XaXRoRWRpdG9yJztcbmV4cG9ydCBjb25zdCBSRU9QRU5fQUNUSVZFX0VESVRPUl9XSVRIX0NPTU1BTkRfSUQgPSAncmVvcGVuQWN0aXZlRWRpdG9yV2l0aCc7XG5cbmV4cG9ydCBjb25zdCBQSU5fRURJVE9SX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5waW5FZGl0b3InO1xuZXhwb3J0IGNvbnN0IFVOUElOX0VESVRPUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24udW5waW5FZGl0b3InO1xuXG5leHBvcnQgY29uc3QgU1BMSVRfRURJVE9SID0gJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3InO1xuZXhwb3J0IGNvbnN0IFNQTElUX0VESVRPUl9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yVXAnO1xuZXhwb3J0IGNvbnN0IFNQTElUX0VESVRPUl9ET1dOID0gJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3JEb3duJztcbmV4cG9ydCBjb25zdCBTUExJVF9FRElUT1JfTEVGVCA9ICd3b3JrYmVuY2guYWN0aW9uLnNwbGl0RWRpdG9yTGVmdCc7XG5leHBvcnQgY29uc3QgU1BMSVRfRURJVE9SX1JJR0hUID0gJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3JSaWdodCc7XG5cbmV4cG9ydCBjb25zdCBNT1ZFX0VESVRPUl9JTlRPX0FCT1ZFX0dST1VQID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZUVkaXRvclRvQWJvdmVHcm91cCc7XG5leHBvcnQgY29uc3QgTU9WRV9FRElUT1JfSU5UT19CRUxPV19HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JUb0JlbG93R3JvdXAnO1xuZXhwb3J0IGNvbnN0IE1PVkVfRURJVE9SX0lOVE9fTEVGVF9HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JUb0xlZnRHcm91cCc7XG5leHBvcnQgY29uc3QgTU9WRV9FRElUT1JfSU5UT19SSUdIVF9HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JUb1JpZ2h0R3JvdXAnO1xuXG5leHBvcnQgY29uc3QgVE9HR0xFX01BWElNSVpFX0VESVRPUl9HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZU1heGltaXplRWRpdG9yR3JvdXAnO1xuXG5leHBvcnQgY29uc3QgU1BMSVRfRURJVE9SX0lOX0dST1VQID0gJ3dvcmtiZW5jaC5hY3Rpb24uc3BsaXRFZGl0b3JJbkdyb3VwJztcbmV4cG9ydCBjb25zdCBUT0dHTEVfU1BMSVRfRURJVE9SX0lOX0dST1VQID0gJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlU3BsaXRFZGl0b3JJbkdyb3VwJztcbmV4cG9ydCBjb25zdCBKT0lOX0VESVRPUl9JTl9HUk9VUCA9ICd3b3JrYmVuY2guYWN0aW9uLmpvaW5FZGl0b3JJbkdyb3VwJztcbmV4cG9ydCBjb25zdCBUT0dHTEVfU1BMSVRfRURJVE9SX0lOX0dST1VQX0xBWU9VVCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZVNwbGl0RWRpdG9ySW5Hcm91cExheW91dCc7XG5cbmV4cG9ydCBjb25zdCBGT0NVU19GSVJTVF9TSURFX0VESVRPUiA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRmlyc3RTaWRlRWRpdG9yJztcbmV4cG9ydCBjb25zdCBGT0NVU19TRUNPTkRfU0lERV9FRElUT1IgPSAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1NlY29uZFNpZGVFZGl0b3InO1xuZXhwb3J0IGNvbnN0IEZPQ1VTX09USEVSX1NJREVfRURJVE9SID0gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNPdGhlclNpZGVFZGl0b3InO1xuXG5leHBvcnQgY29uc3QgRk9DVVNfTEVGVF9HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzTGVmdEdyb3VwV2l0aG91dFdyYXAnO1xuZXhwb3J0IGNvbnN0IEZPQ1VTX1JJR0hUX0dST1VQX1dJVEhPVVRfV1JBUF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNSaWdodEdyb3VwV2l0aG91dFdyYXAnO1xuZXhwb3J0IGNvbnN0IEZPQ1VTX0FCT1ZFX0dST1VQX1dJVEhPVVRfV1JBUF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNBYm92ZUdyb3VwV2l0aG91dFdyYXAnO1xuZXhwb3J0IGNvbnN0IEZPQ1VTX0JFTE9XX0dST1VQX1dJVEhPVVRfV1JBUF9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNCZWxvd0dyb3VwV2l0aG91dFdyYXAnO1xuXG5leHBvcnQgY29uc3QgT1BFTl9FRElUT1JfQVRfSU5ERVhfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5FZGl0b3JBdEluZGV4JztcblxuZXhwb3J0IGNvbnN0IE1PVkVfRURJVE9SX0lOVE9fTkVXX1dJTkRPV19DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24ubW92ZUVkaXRvclRvTmV3V2luZG93JztcbmV4cG9ydCBjb25zdCBDT1BZX0VESVRPUl9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNvcHlFZGl0b3JUb05ld1dpbmRvdyc7XG5cbmV4cG9ydCBjb25zdCBNT1ZFX0VESVRPUl9HUk9VUF9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVFZGl0b3JHcm91cFRvTmV3V2luZG93JztcbmV4cG9ydCBjb25zdCBDT1BZX0VESVRPUl9HUk9VUF9JTlRPX05FV19XSU5ET1dfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNvcHlFZGl0b3JHcm91cFRvTmV3V2luZG93JztcblxuZXhwb3J0IGNvbnN0IE5FV19FTVBUWV9FRElUT1JfV0lORE9XX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5uZXdFbXB0eUVkaXRvcldpbmRvdyc7XG5cbmV4cG9ydCBjb25zdCBDTE9TRV9NT0RBTF9FRElUT1JfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNsb3NlTW9kYWxFZGl0b3InO1xuZXhwb3J0IGNvbnN0IE1PVkVfTU9EQUxfRURJVE9SX1RPX01BSU5fQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm1vdmVNb2RhbEVkaXRvclRvTWFpbic7XG5leHBvcnQgY29uc3QgTU9WRV9NT0RBTF9FRElUT1JfVE9fV0lORE9XX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5tb3ZlTW9kYWxFZGl0b3JUb1dpbmRvdyc7XG5leHBvcnQgY29uc3QgVE9HR0xFX01PREFMX0VESVRPUl9NQVhJTUlaRURfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZU1vZGFsRWRpdG9yTWF4aW1pemVkJztcbmV4cG9ydCBjb25zdCBOQVZJR0FURV9NT0RBTF9FRElUT1JfUFJFVklPVVNfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlTW9kYWxFZGl0b3JQcmV2aW91cyc7XG5leHBvcnQgY29uc3QgTkFWSUdBVEVfTU9EQUxfRURJVE9SX05FWFRfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlTW9kYWxFZGl0b3JOZXh0JztcbmV4cG9ydCBjb25zdCBUT0dHTEVfTU9EQUxfRURJVE9SX1NJREVCQVJfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZU1vZGFsRWRpdG9yU2lkZWJhcic7XG5cbmV4cG9ydCBjb25zdCBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCA9ICdfd29ya2JlbmNoLm9wZW4nO1xuZXhwb3J0IGNvbnN0IEFQSV9PUEVOX0RJRkZfRURJVE9SX0NPTU1BTkRfSUQgPSAnX3dvcmtiZW5jaC5kaWZmJztcbmV4cG9ydCBjb25zdCBBUElfT1BFTl9XSVRIX0VESVRPUl9DT01NQU5EX0lEID0gJ193b3JrYmVuY2gub3BlbldpdGgnO1xuXG5leHBvcnQgY29uc3QgRURJVE9SX0NPUkVfTkFWSUdBVElPTl9DT01NQU5EUyA9IFtcblx0U1BMSVRfRURJVE9SLFxuXHRDTE9TRV9FRElUT1JfQ09NTUFORF9JRCxcblx0VU5QSU5fRURJVE9SX0NPTU1BTkRfSUQsXG5cdFVOTE9DS19HUk9VUF9DT01NQU5EX0lELFxuXHRUT0dHTEVfTUFYSU1JWkVfRURJVE9SX0dST1VQXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzIHtcblx0dG8/OiAnZmlyc3QnIHwgJ2xhc3QnIHwgJ2xlZnQnIHwgJ3JpZ2h0JyB8ICd1cCcgfCAnZG93bicgfCAnY2VudGVyJyB8ICdwb3NpdGlvbicgfCAncHJldmlvdXMnIHwgJ25leHQnO1xuXHRieT86ICd0YWInIHwgJ2dyb3VwJztcblx0dmFsdWU/OiBudW1iZXI7XG59XG5cbmNvbnN0IGlzU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmcgPSBmdW5jdGlvbiAoYXJnOiBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cyk6IGJvb2xlYW4ge1xuXHRpZiAoIWlzT2JqZWN0KGFyZykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoIWlzU3RyaW5nKGFyZy50bykpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoIWlzVW5kZWZpbmVkKGFyZy5ieSkgJiYgIWlzU3RyaW5nKGFyZy5ieSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoIWlzVW5kZWZpbmVkKGFyZy52YWx1ZSkgJiYgIWlzTnVtYmVyKGFyZy52YWx1ZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyRWRpdG9yTW92ZUNvcHlDb21tYW5kKCk6IHZvaWQge1xuXG5cdGNvbnN0IG1vdmVDb3B5SlNPTlNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHQncmVxdWlyZWQnOiBbJ3RvJ10sXG5cdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHQndG8nOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdlbnVtJzogWydsZWZ0JywgJ3JpZ2h0J11cblx0XHRcdH0sXG5cdFx0XHQnYnknOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdCdlbnVtJzogWyd0YWInLCAnZ3JvdXAnXVxuXHRcdFx0fSxcblx0XHRcdCd2YWx1ZSc6IHtcblx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJ1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogTU9WRV9BQ1RJVkVfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdHByaW1hcnk6IDAsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmdzKSA9PiBtb3ZlQ29weVNlbGVjdGVkRWRpdG9ycyh0cnVlLCBhcmdzIGFzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzIHwgdW5kZWZpbmVkLCBhY2Nlc3NvciksXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZWRpdG9yQ29tbWFuZC5hY3RpdmVFZGl0b3JNb3ZlLmRlc2NyaXB0aW9uJywgXCJNb3ZlIHRoZSBhY3RpdmUgZWRpdG9yIGJ5IHRhYnMgb3IgZ3JvdXBzXCIpLFxuXHRcdFx0YXJnczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ2VkaXRvckNvbW1hbmQuYWN0aXZlRWRpdG9yTW92ZS5hcmcubmFtZScsIFwiQWN0aXZlIGVkaXRvciBtb3ZlIGFyZ3VtZW50XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZWRpdG9yQ29tbWFuZC5hY3RpdmVFZGl0b3JNb3ZlLmFyZy5kZXNjcmlwdGlvbicsIFwiQXJndW1lbnQgUHJvcGVydGllczpcXG5cXHQqICd0byc6IFN0cmluZyB2YWx1ZSBwcm92aWRpbmcgd2hlcmUgdG8gbW92ZS5cXG5cXHQqICdieSc6IFN0cmluZyB2YWx1ZSBwcm92aWRpbmcgdGhlIHVuaXQgZm9yIG1vdmUgKGJ5IHRhYiBvciBieSBncm91cCkuXFxuXFx0KiAndmFsdWUnOiBOdW1iZXIgdmFsdWUgcHJvdmlkaW5nIGhvdyBtYW55IHBvc2l0aW9ucyBvciBhbiBhYnNvbHV0ZSBwb3NpdGlvbiB0byBtb3ZlLlwiKSxcblx0XHRcdFx0XHRjb25zdHJhaW50OiBpc1NlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJnLFxuXHRcdFx0XHRcdHNjaGVtYTogbW92ZUNvcHlKU09OU2NoZW1hXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBDT1BZX0FDVElWRV9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0cHJpbWFyeTogMCxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZ3MpID0+IG1vdmVDb3B5U2VsZWN0ZWRFZGl0b3JzKGZhbHNlLCBhcmdzIGFzIFNlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJndW1lbnRzIHwgdW5kZWZpbmVkLCBhY2Nlc3NvciksXG5cdFx0bWV0YWRhdGE6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZWRpdG9yQ29tbWFuZC5hY3RpdmVFZGl0b3JDb3B5LmRlc2NyaXB0aW9uJywgXCJDb3B5IHRoZSBhY3RpdmUgZWRpdG9yIGJ5IGdyb3Vwc1wiKSxcblx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdlZGl0b3JDb21tYW5kLmFjdGl2ZUVkaXRvckNvcHkuYXJnLm5hbWUnLCBcIkFjdGl2ZSBlZGl0b3IgY29weSBhcmd1bWVudFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2VkaXRvckNvbW1hbmQuYWN0aXZlRWRpdG9yQ29weS5hcmcuZGVzY3JpcHRpb24nLCBcIkFyZ3VtZW50IFByb3BlcnRpZXM6XFxuXFx0KiAndG8nOiBTdHJpbmcgdmFsdWUgcHJvdmlkaW5nIHdoZXJlIHRvIGNvcHkuXFxuXFx0KiAndmFsdWUnOiBOdW1iZXIgdmFsdWUgcHJvdmlkaW5nIGhvdyBtYW55IHBvc2l0aW9ucyBvciBhbiBhYnNvbHV0ZSBwb3NpdGlvbiB0byBjb3B5LlwiKSxcblx0XHRcdFx0XHRjb25zdHJhaW50OiBpc1NlbGVjdGVkRWRpdG9yc01vdmVDb3B5QXJnLFxuXHRcdFx0XHRcdHNjaGVtYTogbW92ZUNvcHlKU09OU2NoZW1hXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9XG5cdH0pO1xuXG5cdFtcblx0XHR7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0FCT1ZFX0dST1VQLCB0bzogJ3VwJyBhcyBjb25zdCB9LFxuXHRcdHsgaWQ6IE1PVkVfRURJVE9SX0lOVE9fQkVMT1dfR1JPVVAsIHRvOiAnZG93bicgYXMgY29uc3QgfSxcblx0XHR7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX0xFRlRfR1JPVVAsIHRvOiAnbGVmdCcgYXMgY29uc3QgfSxcblx0XHR7IGlkOiBNT1ZFX0VESVRPUl9JTlRPX1JJR0hUX0dST1VQLCB0bzogJ3JpZ2h0JyBhcyBjb25zdCB9XG5cdF0uZm9yRWFjaCgoeyBpZCwgdG8gfSkgPT4ge1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGlkLCBmdW5jdGlvbiAoYWNjZXNzb3IsIC4uLmFyZ3MpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0aWYgKHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdFx0bW92ZUNvcHlFZGl0b3JzVG9Hcm91cCh0cnVlLCB7IHRvLCBieTogJ2dyb3VwJyB9LCByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF0uZ3JvdXAsIHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXS5lZGl0b3JzLCBhY2Nlc3Nvcik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIG1vdmVDb3B5U2VsZWN0ZWRFZGl0b3JzKGlzTW92ZTogYm9vbGVhbiwgYXJnczogU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMgPSBPYmplY3QuY3JlYXRlKG51bGwpLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGFyZ3MudG8gPSBhcmdzLnRvIHx8ICdyaWdodCc7XG5cdFx0YXJncy5ieSA9IGFyZ3MuYnkgfHwgJ3RhYic7XG5cdFx0YXJncy52YWx1ZSA9IHR5cGVvZiBhcmdzLnZhbHVlID09PSAnbnVtYmVyJyA/IGFyZ3MudmFsdWUgOiAxO1xuXG5cdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLmFjdGl2ZUdyb3VwO1xuXHRcdGNvbnN0IHNlbGVjdGVkRWRpdG9ycyA9IGFjdGl2ZUdyb3VwLnNlbGVjdGVkRWRpdG9ycztcblx0XHRpZiAoc2VsZWN0ZWRFZGl0b3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdHN3aXRjaCAoYXJncy5ieSkge1xuXHRcdFx0XHRjYXNlICd0YWInOlxuXHRcdFx0XHRcdGlmIChpc01vdmUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBtb3ZlVGFicyhhcmdzLCBhY3RpdmVHcm91cCwgc2VsZWN0ZWRFZGl0b3JzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ2dyb3VwJzpcblx0XHRcdFx0XHRyZXR1cm4gbW92ZUNvcHlFZGl0b3JzVG9Hcm91cChpc01vdmUsIGFyZ3MsIGFjdGl2ZUdyb3VwLCBzZWxlY3RlZEVkaXRvcnMsIGFjY2Vzc29yKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBtb3ZlVGFicyhhcmdzOiBTZWxlY3RlZEVkaXRvcnNNb3ZlQ29weUFyZ3VtZW50cywgZ3JvdXA6IElFZGl0b3JHcm91cCwgZWRpdG9yczogRWRpdG9ySW5wdXRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IHRvID0gYXJncy50bztcblx0XHRpZiAodG8gPT09ICdmaXJzdCcgfHwgdG8gPT09ICdyaWdodCcpIHtcblx0XHRcdGVkaXRvcnMgPSBbLi4uZWRpdG9yc10ucmV2ZXJzZSgpO1xuXHRcdH0gZWxzZSBpZiAodG8gPT09ICdwb3NpdGlvbicgJiYgKGFyZ3MudmFsdWUgPz8gMSkgPCBncm91cC5nZXRJbmRleE9mRWRpdG9yKGVkaXRvcnNbMF0pKSB7XG5cdFx0XHRlZGl0b3JzID0gWy4uLmVkaXRvcnNdLnJldmVyc2UoKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cdFx0XHRtb3ZlVGFiKGFyZ3MsIGdyb3VwLCBlZGl0b3IpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIG1vdmVUYWIoYXJnczogU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMsIGdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHRsZXQgaW5kZXggPSBncm91cC5nZXRJbmRleE9mRWRpdG9yKGVkaXRvcik7XG5cdFx0c3dpdGNoIChhcmdzLnRvKSB7XG5cdFx0XHRjYXNlICdmaXJzdCc6XG5cdFx0XHRcdGluZGV4ID0gMDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdsYXN0Jzpcblx0XHRcdFx0aW5kZXggPSBncm91cC5jb3VudCAtIDE7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbGVmdCc6XG5cdFx0XHRcdGluZGV4ID0gaW5kZXggLSAoYXJncy52YWx1ZSA/PyAxKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdyaWdodCc6XG5cdFx0XHRcdGluZGV4ID0gaW5kZXggKyAoYXJncy52YWx1ZSA/PyAxKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdjZW50ZXInOlxuXHRcdFx0XHRpbmRleCA9IE1hdGgucm91bmQoZ3JvdXAuY291bnQgLyAyKSAtIDE7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncG9zaXRpb24nOlxuXHRcdFx0XHRpbmRleCA9IChhcmdzLnZhbHVlID8/IDEpIC0gMTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aW5kZXggPSBpbmRleCA8IDAgPyAwIDogaW5kZXggPj0gZ3JvdXAuY291bnQgPyBncm91cC5jb3VudCAtIDEgOiBpbmRleDtcblx0XHRncm91cC5tb3ZlRWRpdG9yKGVkaXRvciwgZ3JvdXAsIHsgaW5kZXggfSk7XG5cdH1cblxuXHRmdW5jdGlvbiBtb3ZlQ29weUVkaXRvcnNUb0dyb3VwKGlzTW92ZTogYm9vbGVhbiwgYXJnczogU2VsZWN0ZWRFZGl0b3JzTW92ZUNvcHlBcmd1bWVudHMsIHNvdXJjZUdyb3VwOiBJRWRpdG9yR3JvdXAsIGVkaXRvcnM6IEVkaXRvcklucHV0W10sIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGxldCB0YXJnZXRHcm91cDogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkO1xuXG5cdFx0c3dpdGNoIChhcmdzLnRvKSB7XG5cdFx0XHRjYXNlICdsZWZ0Jzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uTEVGVCB9LCBzb3VyY2VHcm91cCk7XG5cdFx0XHRcdGlmICghdGFyZ2V0R3JvdXApIHtcblx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAoc291cmNlR3JvdXAsIEdyb3VwRGlyZWN0aW9uLkxFRlQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncmlnaHQnOlxuXHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZmluZEdyb3VwKHsgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5SSUdIVCB9LCBzb3VyY2VHcm91cCk7XG5cdFx0XHRcdGlmICghdGFyZ2V0R3JvdXApIHtcblx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAoc291cmNlR3JvdXAsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3VwJzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uVVAgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHNvdXJjZUdyb3VwLCBHcm91cERpcmVjdGlvbi5VUCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdkb3duJzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmZpbmRHcm91cCh7IGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uRE9XTiB9LCBzb3VyY2VHcm91cCk7XG5cdFx0XHRcdGlmICghdGFyZ2V0R3JvdXApIHtcblx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAoc291cmNlR3JvdXAsIEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZmlyc3QnOlxuXHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uRklSU1QgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2xhc3QnOlxuXHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uTEFTVCB9LCBzb3VyY2VHcm91cCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncHJldmlvdXMnOlxuXHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uUFJFVklPVVMgfSwgc291cmNlR3JvdXApO1xuXHRcdFx0XHRpZiAoIXRhcmdldEdyb3VwKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3Bwb3NpdGVEaXJlY3Rpb24gPSBwcmVmZXJyZWRTaWRlQnlTaWRlR3JvdXBEaXJlY3Rpb24oY29uZmlndXJhdGlvblNlcnZpY2UpID09PSBHcm91cERpcmVjdGlvbi5SSUdIVCA/IEdyb3VwRGlyZWN0aW9uLkxFRlQgOiBHcm91cERpcmVjdGlvbi5VUDtcblx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAoc291cmNlR3JvdXAsIG9wcG9zaXRlRGlyZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ25leHQnOlxuXHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZmluZEdyb3VwKHsgbG9jYXRpb246IEdyb3VwTG9jYXRpb24uTkVYVCB9LCBzb3VyY2VHcm91cCk7XG5cdFx0XHRcdGlmICghdGFyZ2V0R3JvdXApIHtcblx0XHRcdFx0XHR0YXJnZXRHcm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWRkR3JvdXAoc291cmNlR3JvdXAsIHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbihjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnY2VudGVyJzpcblx0XHRcdFx0dGFyZ2V0R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpWyhlZGl0b3JHcm91cHNTZXJ2aWNlLmNvdW50IC8gMikgLSAxXTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdwb3NpdGlvbic6XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cHMoR3JvdXBzT3JkZXIuR1JJRF9BUFBFQVJBTkNFKVsoYXJncy52YWx1ZSA/PyAxKSAtIDFdO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0R3JvdXApIHtcblx0XHRcdGNvbnN0IGVkaXRvcnNXaXRoT3B0aW9ucyA9IHByZXBhcmVNb3ZlQ29weUVkaXRvcnMoc291cmNlR3JvdXAsIGVkaXRvcnMpO1xuXHRcdFx0aWYgKGlzTW92ZSkge1xuXHRcdFx0XHRzb3VyY2VHcm91cC5tb3ZlRWRpdG9ycyhlZGl0b3JzV2l0aE9wdGlvbnMsIHRhcmdldEdyb3VwKTtcblx0XHRcdH0gZWxzZSBpZiAoc291cmNlR3JvdXAuaWQgIT09IHRhcmdldEdyb3VwLmlkKSB7XG5cdFx0XHRcdHNvdXJjZUdyb3VwLmNvcHlFZGl0b3JzKGVkaXRvcnNXaXRoT3B0aW9ucywgdGFyZ2V0R3JvdXApO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXRHcm91cC5mb2N1cygpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiByZWdpc3RlckVkaXRvckdyb3Vwc0xheW91dENvbW1hbmRzKCk6IHZvaWQge1xuXG5cdGZ1bmN0aW9uIGFwcGx5RWRpdG9yTGF5b3V0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBsYXlvdXQ6IEVkaXRvckdyb3VwTGF5b3V0KTogdm9pZCB7XG5cdFx0aWYgKCFsYXlvdXQgfHwgdHlwZW9mIGxheW91dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRlZGl0b3JHcm91cHNTZXJ2aWNlLmFwcGx5TGF5b3V0KGxheW91dCk7XG5cdH1cblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChMQVlPVVRfRURJVE9SX0dST1VQU19DT01NQU5EX0lELCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IEVkaXRvckdyb3VwTGF5b3V0KSA9PiB7XG5cdFx0YXBwbHlFZGl0b3JMYXlvdXQoYWNjZXNzb3IsIGFyZ3MpO1xuXHR9KTtcblxuXHQvLyBBUEkgQ29tbWFuZHNcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdGlkOiAndnNjb2RlLnNldEVkaXRvckxheW91dCcsXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBFZGl0b3JHcm91cExheW91dCkgPT4gYXBwbHlFZGl0b3JMYXlvdXQoYWNjZXNzb3IsIGFyZ3MpLFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHQnZGVzY3JpcHRpb24nOiBgU2V0IHRoZSBlZGl0b3IgbGF5b3V0LiBFZGl0b3IgbGF5b3V0IGlzIHJlcHJlc2VudGVkIGFzIGEgdHJlZSBvZiBncm91cHMgaW4gd2hpY2ggdGhlIGZpcnN0IGdyb3VwIGlzIHRoZSByb290IGdyb3VwIG9mIHRoZSBsYXlvdXQuXG5cdFx0XHRcdFx0VGhlIG9yaWVudGF0aW9uIG9mIHRoZSBmaXJzdCBncm91cCBpcyAwIChob3Jpem9udGFsKSBieSBkZWZhdWx0IHVubGVzcyBzcGVjaWZpZWQgb3RoZXJ3aXNlLiBUaGUgb3RoZXIgb3JpZW50YXRpb25zIGFyZSAxICh2ZXJ0aWNhbCkuXG5cdFx0XHRcdFx0VGhlIG9yaWVudGF0aW9uIG9mIHN1YnNlcXVlbnQgZ3JvdXBzIGlzIHRoZSBvcHBvc2l0ZSBvZiB0aGUgb3JpZW50YXRpb24gb2YgdGhlIGdyb3VwIHRoYXQgY29udGFpbnMgaXQuXG5cdFx0XHRcdFx0SGVyZSBhcmUgc29tZSBleGFtcGxlczogQSBsYXlvdXQgcmVwcmVzZW50aW5nIDEgcm93IGFuZCAyIGNvbHVtbnM6IHsgb3JpZW50YXRpb246IDAsIGdyb3VwczogW3t9LCB7fV0gfS5cblx0XHRcdFx0XHRBIGxheW91dCByZXByZXNlbnRpbmcgMyByb3dzIGFuZCAxIGNvbHVtbjogeyBvcmllbnRhdGlvbjogMSwgZ3JvdXBzOiBbe30sIHt9LCB7fV0gfS5cblx0XHRcdFx0XHRBIGxheW91dCByZXByZXNlbnRpbmcgMyByb3dzIGFuZCAxIGNvbHVtbiBpbiB3aGljaCB0aGUgc2Vjb25kIHJvdyBoYXMgMiBjb2x1bW5zOiB7IG9yaWVudGF0aW9uOiAxLCBncm91cHM6IFt7fSwgeyBncm91cHM6IFt7fSwge31dIH0sIHt9XSB9XG5cdFx0XHRcdFx0YCxcblx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQncmVxdWlyZWQnOiBbJ2dyb3VwcyddLFxuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J29yaWVudGF0aW9uJzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6IDAsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGBUaGUgb3JpZW50YXRpb24gb2YgdGhlIHJvb3QgZ3JvdXAgaW4gdGhlIGxheW91dC4gMCBmb3IgaG9yaXpvbnRhbCwgMSBmb3IgdmVydGljYWwuYCxcblx0XHRcdFx0XHRcdFx0J2VudW0nOiBbMCwgMV0sXG5cdFx0XHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdlZGl0b3JHcm91cExheW91dC5ob3Jpem9udGFsJywgXCJIb3Jpem9udGFsXCIpLFxuXHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdlZGl0b3JHcm91cExheW91dC52ZXJ0aWNhbCcsIFwiVmVydGljYWxcIilcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnZ3JvdXBzJzoge1xuXHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjL2RlZmluaXRpb25zL2VkaXRvckdyb3Vwc1NjaGVtYScsXG5cdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogW3t9LCB7fV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1dXG5cdFx0fVxuXHR9KTtcblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0aWQ6ICd2c2NvZGUuZ2V0RWRpdG9yTGF5b3V0Jyxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0XHRyZXR1cm4gZWRpdG9yR3JvdXBzU2VydmljZS5nZXRMYXlvdXQoKTtcblx0XHR9LFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ0dldCBFZGl0b3IgTGF5b3V0Jyxcblx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0cmV0dXJuczogJ0FuIGVkaXRvciBsYXlvdXQgb2JqZWN0LCBpbiB0aGUgc2FtZSBmb3JtYXQgYXMgdnNjb2RlLnNldEVkaXRvckxheW91dCdcblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZWdpc3Rlck9wZW5FZGl0b3JBUElDb21tYW5kcygpOiB2b2lkIHtcblxuXHRmdW5jdGlvbiBtaXhpbkNvbnRleHQoY29udGV4dDogSU9wZW5FdmVudDx1bmtub3duPiB8IHVuZGVmaW5lZCwgb3B0aW9uczogSVRleHRFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb2x1bW46IEVkaXRvckdyb3VwQ29sdW1uIHwgdW5kZWZpbmVkKTogW0lUZXh0RWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgRWRpdG9yR3JvdXBDb2x1bW4gfCB1bmRlZmluZWRdIHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybiBbb3B0aW9ucywgY29sdW1uXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gW1xuXHRcdFx0eyAuLi5jb250ZXh0LmVkaXRvck9wdGlvbnMsIC4uLihvcHRpb25zID8/IE9iamVjdC5jcmVhdGUobnVsbCkpIH0sXG5cdFx0XHRjb250ZXh0LnNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogY29sdW1uXG5cdFx0XTtcblx0fVxuXG5cdC8vIHBhcnRpYWwsIHJlbmRlcmVyLXNpZGUgQVBJIGNvbW1hbmQgdG8gb3BlbiBlZGl0b3Igb25seSBzdXBwb3J0aW5nXG5cdC8vIGFyZ3VtZW50cyB0aGF0IGRvIG5vdCBuZWVkIHRvIGJlIGNvbnZlcnRlZCBmcm9tIHRoZSBleHRlbnNpb24gaG9zdFxuXHQvLyBjb21wbGVtZW50cyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzJiMTY0ZWZiMGU2YTVkZTM4MjZiZmY2MjY4M2VhZWFmZTAzMjI4NGYvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RBcGlDb21tYW5kcy50cyNMMzczXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRpZDogJ3ZzY29kZS5vcGVuJyxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGFyZykgPT4ge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoQVBJX09QRU5fRURJVE9SX0NPTU1BTkRfSUQsIGFyZyk7XG5cdFx0fSxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZGVzY3JpcHRpb246ICdPcGVucyB0aGUgcHJvdmlkZWQgcmVzb3VyY2UgaW4gdGhlIGVkaXRvci4nLFxuXHRcdFx0YXJnczogW3sgbmFtZTogJ1VyaScgfV1cblx0XHR9XG5cdH0pO1xuXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lELCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlQXJnOiBVcmlDb21wb25lbnRzIHwgc3RyaW5nLCBjb2x1bW5BbmRPcHRpb25zPzogW0VkaXRvckdyb3VwQ29sdW1uPywgSVRleHRFZGl0b3JPcHRpb25zP10sIGxhYmVsPzogc3RyaW5nLCBjb250ZXh0PzogSU9wZW5FdmVudDx1bmtub3duPikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IG9wZW5lclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU9wZW5lclNlcnZpY2UpO1xuXHRcdGNvbnN0IHBhdGhTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQYXRoU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCB1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVbnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc291cmNlT3JTdHJpbmcgPSB0eXBlb2YgcmVzb3VyY2VBcmcgPT09ICdzdHJpbmcnID8gcmVzb3VyY2VBcmcgOiBVUkkuZnJvbShyZXNvdXJjZUFyZywgdHJ1ZSk7XG5cdFx0Y29uc3QgW2NvbHVtbkFyZywgb3B0aW9uc0FyZ10gPSBjb2x1bW5BbmRPcHRpb25zID8/IFtdO1xuXG5cdFx0Ly8gdXNlIGVkaXRvciBvcHRpb25zIG9yIGVkaXRvciB2aWV3IGNvbHVtbiBvciByZXNvdXJjZSBzY2hlbWVcblx0XHQvLyBhcyBhIGhpbnQgdG8gdXNlIHRoZSBlZGl0b3Igc2VydmljZSBmb3Igb3BlbmluZyBkaXJlY3RseVxuXHRcdGlmIChvcHRpb25zQXJnIHx8IHR5cGVvZiBjb2x1bW5BcmcgPT09ICdudW1iZXInIHx8IG1hdGNoZXNTY2hlbWUocmVzb3VyY2VPclN0cmluZywgU2NoZW1hcy51bnRpdGxlZCkpIHtcblx0XHRcdGNvbnN0IFtvcHRpb25zLCBjb2x1bW5dID0gbWl4aW5Db250ZXh0KGNvbnRleHQsIG9wdGlvbnNBcmcsIGNvbHVtbkFyZyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5pc1VyaShyZXNvdXJjZU9yU3RyaW5nKSA/IHJlc291cmNlT3JTdHJpbmcgOiBVUkkucGFyc2UocmVzb3VyY2VPclN0cmluZyk7XG5cblx0XHRcdGxldCBpbnB1dDogSVJlc291cmNlRWRpdG9ySW5wdXQgfCBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dDtcblx0XHRcdGlmICh1bnRpdGxlZFRleHRFZGl0b3JTZXJ2aWNlLmlzVW50aXRsZWRXaXRoQXNzb2NpYXRlZFJlc291cmNlKHJlc291cmNlKSkge1xuXHRcdFx0XHQvLyBzcGVjaWFsIGNhc2UgZm9yIHVudGl0bGVkOiB3ZSBhcmUgZ2V0dGluZyBhIHJlc291cmNlIHdpdGggbWVhbmluZ2Z1bFxuXHRcdFx0XHQvLyBwYXRoIGZyb20gYW4gZXh0ZW5zaW9uIHRvIHVzZSBmb3IgdGhlIHVudGl0bGVkIGVkaXRvci4gYXMgc3VjaCwgd2Vcblx0XHRcdFx0Ly8gaGF2ZSB0byBhc3N1bWUgaXQgYXMgYW4gYXNzb2NpYXRlZCByZXNvdXJjZSB0byB1c2Ugd2hlbiBzYXZpbmcuIHdlXG5cdFx0XHRcdC8vIGRvIHNvIGJ5IHNldHRpbmcgdGhlIGBmb3JjZVVudGl0bGVkOiB0cnVlYCBhbmQgY2hhbmdpbmcgdGhlIHNjaGVtZVxuXHRcdFx0XHQvLyB0byBhIGZpbGUgYmFzZWQgb25lLiB0aGUgdW50aXRsZWQgZWRpdG9yIHNlcnZpY2UgdGFrZXMgY2FyZSB0b1xuXHRcdFx0XHQvLyBhc3NvY2lhdGUgdGhlIHBhdGggcHJvcGVybHkgdGhlbi5cblx0XHRcdFx0aW5wdXQgPSB7IHJlc291cmNlOiByZXNvdXJjZS53aXRoKHsgc2NoZW1lOiBwYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lIH0pLCBmb3JjZVVudGl0bGVkOiB0cnVlLCBvcHRpb25zLCBsYWJlbCB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gdXNlIGFueSBvdGhlciByZXNvdXJjZSBhcyBpc1xuXHRcdFx0XHRpbnB1dCA9IHsgcmVzb3VyY2UsIG9wdGlvbnMsIGxhYmVsIH07XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgY29sdW1uVG9FZGl0b3JHcm91cChlZGl0b3JHcm91cHNTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29sdW1uKSk7XG5cdFx0fVxuXG5cdFx0Ly8gZG8gbm90IGFsbG93IHRvIGV4ZWN1dGUgY29tbWFuZHMgZnJvbSBoZXJlXG5cdFx0ZWxzZSBpZiAobWF0Y2hlc1NjaGVtZShyZXNvdXJjZU9yU3RyaW5nLCBTY2hlbWFzLmNvbW1hbmQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZmluYWxseSwgZGVsZWdhdGUgdG8gb3BlbmVyIHNlcnZpY2Vcblx0XHRlbHNlIHtcblx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3BlbihyZXNvdXJjZU9yU3RyaW5nLCB7IG9wZW5Ub1NpZGU6IGNvbnRleHQ/LnNpZGVCeVNpZGUsIGVkaXRvck9wdGlvbnM6IGNvbnRleHQ/LmVkaXRvck9wdGlvbnMgfSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBwYXJ0aWFsLCByZW5kZXJlci1zaWRlIEFQSSBjb21tYW5kIHRvIG9wZW4gZGlmZiBlZGl0b3Igb25seSBzdXBwb3J0aW5nXG5cdC8vIGFyZ3VtZW50cyB0aGF0IGRvIG5vdCBuZWVkIHRvIGJlIGNvbnZlcnRlZCBmcm9tIHRoZSBleHRlbnNpb24gaG9zdFxuXHQvLyBjb21wbGVtZW50cyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9ibG9iLzJiMTY0ZWZiMGU2YTVkZTM4MjZiZmY2MjY4M2VhZWFmZTAzMjI4NGYvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RBcGlDb21tYW5kcy50cyNMMzk3XG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRpZDogJ3ZzY29kZS5kaWZmJyxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIGxlZnQsIHJpZ2h0LCBsYWJlbCkgPT4ge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoQVBJX09QRU5fRElGRl9FRElUT1JfQ09NTUFORF9JRCwgbGVmdCwgcmlnaHQsIGxhYmVsKTtcblx0XHR9LFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ09wZW5zIHRoZSBwcm92aWRlZCByZXNvdXJjZXMgaW4gdGhlIGRpZmYgZWRpdG9yIHRvIGNvbXBhcmUgdGhlaXIgY29udGVudHMuJyxcblx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0eyBuYW1lOiAnbGVmdCcsIGRlc2NyaXB0aW9uOiAnTGVmdC1oYW5kIHNpZGUgcmVzb3VyY2Ugb2YgdGhlIGRpZmYgZWRpdG9yJyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdyaWdodCcsIGRlc2NyaXB0aW9uOiAnUmlnaHQtaGFuZCBzaWRlIHJlc291cmNlIG9mIHRoZSBkaWZmIGVkaXRvcicgfSxcblx0XHRcdFx0eyBuYW1lOiAndGl0bGUnLCBkZXNjcmlwdGlvbjogJ0h1bWFuIHJlYWRhYmxlIHRpdGxlIGZvciB0aGUgZGlmZiBlZGl0b3InIH0sXG5cdFx0XHRdXG5cdFx0fVxuXHR9KTtcblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChBUElfT1BFTl9ESUZGX0VESVRPUl9DT01NQU5EX0lELCBhc3luYyBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9yaWdpbmFsUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIG1vZGlmaWVkUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIGxhYmVsQW5kT3JEZXNjcmlwdGlvbj86IHN0cmluZyB8IHsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9LCBjb2x1bW5BbmRPcHRpb25zPzogW0VkaXRvckdyb3VwQ29sdW1uPywgSVRleHRFZGl0b3JPcHRpb25zP10sIGNvbnRleHQ/OiBJT3BlbkV2ZW50PHVua25vd24+KSB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IFtjb2x1bW5BcmcsIG9wdGlvbnNBcmddID0gY29sdW1uQW5kT3B0aW9ucyA/PyBbXTtcblx0XHRjb25zdCBbb3B0aW9ucywgY29sdW1uXSA9IG1peGluQ29udGV4dChjb250ZXh0LCBvcHRpb25zQXJnLCBjb2x1bW5BcmcpO1xuXG5cdFx0bGV0IGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBsYWJlbEFuZE9yRGVzY3JpcHRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRsYWJlbCA9IGxhYmVsQW5kT3JEZXNjcmlwdGlvbjtcblx0XHR9IGVsc2UgaWYgKGxhYmVsQW5kT3JEZXNjcmlwdGlvbikge1xuXHRcdFx0bGFiZWwgPSBsYWJlbEFuZE9yRGVzY3JpcHRpb24ubGFiZWw7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IGxhYmVsQW5kT3JEZXNjcmlwdGlvbi5kZXNjcmlwdGlvbjtcblx0XHR9XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5mcm9tKG9yaWdpbmFsUmVzb3VyY2UsIHRydWUpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZyb20obW9kaWZpZWRSZXNvdXJjZSwgdHJ1ZSkgfSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRvcHRpb25zXG5cdFx0fSwgY29sdW1uVG9FZGl0b3JHcm91cChlZGl0b3JHcm91cHNTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29sdW1uKSk7XG5cdH0pO1xuXG5cdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFQSV9PUEVOX1dJVEhfRURJVE9SX0NPTU1BTkRfSUQsIGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIGlkOiBzdHJpbmcsIGNvbHVtbkFuZE9wdGlvbnM/OiBbRWRpdG9yR3JvdXBDb2x1bW4/LCBJVGV4dEVkaXRvck9wdGlvbnM/XSkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBbY29sdW1uQXJnLCBvcHRpb25zQXJnXSA9IGNvbHVtbkFuZE9wdGlvbnMgPz8gW107XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogVVJJLmZyb20ocmVzb3VyY2UsIHRydWUpLCBvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSwgLi4ub3B0aW9uc0FyZywgb3ZlcnJpZGU6IGlkIH0gfSwgY29sdW1uVG9FZGl0b3JHcm91cChlZGl0b3JHcm91cHNTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29sdW1uQXJnKSk7XG5cdH0pO1xuXG5cdC8vIHBhcnRpYWwsIHJlbmRlcmVyLXNpZGUgQVBJIGNvbW1hbmQgdG8gb3BlbiBkaWZmIGVkaXRvciBvbmx5IHN1cHBvcnRpbmdcblx0Ly8gYXJndW1lbnRzIHRoYXQgZG8gbm90IG5lZWQgdG8gYmUgY29udmVydGVkIGZyb20gdGhlIGV4dGVuc2lvbiBob3N0XG5cdC8vIGNvbXBsZW1lbnRzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvMmIxNjRlZmIwZTZhNWRlMzgyNmJmZjYyNjgzZWFlYWZlMDMyMjg0Zi9zcmMvdnMvd29ya2JlbmNoL2FwaS9jb21tb24vZXh0SG9zdEFwaUNvbW1hbmRzLnRzI0wzOTdcblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdGlkOiAndnNjb2RlLmNoYW5nZXMnLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgdGl0bGU6IHN0cmluZywgcmVzb3VyY2VzOiBbVXJpQ29tcG9uZW50cywgVXJpQ29tcG9uZW50cz8sIFVyaUNvbXBvbmVudHM/XVtdKSA9PiB7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZCgnX3dvcmtiZW5jaC5jaGFuZ2VzJywgdGl0bGUsIHJlc291cmNlcyk7XG5cdFx0fSxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZGVzY3JpcHRpb246ICdPcGVucyBhIGxpc3Qgb2YgcmVzb3VyY2VzIGluIHRoZSBjaGFuZ2VzIGVkaXRvciB0byBjb21wYXJlIHRoZWlyIGNvbnRlbnRzLicsXG5cdFx0XHRhcmdzOiBbXG5cdFx0XHRcdHsgbmFtZTogJ3RpdGxlJywgZGVzY3JpcHRpb246ICdIdW1hbiByZWFkYWJsZSB0aXRsZSBmb3IgdGhlIGRpZmYgZWRpdG9yJyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdyZXNvdXJjZXMnLCBkZXNjcmlwdGlvbjogJ0xpc3Qgb2YgcmVzb3VyY2VzIHRvIG9wZW4gaW4gdGhlIGNoYW5nZXMgZWRpdG9yJyB9XG5cdFx0XHRdXG5cdFx0fVxuXHR9KTtcblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX3dvcmtiZW5jaC5jaGFuZ2VzJywgYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB0aXRsZTogc3RyaW5nLCByZXNvdXJjZXM6IFtVcmlDb21wb25lbnRzLCBVcmlDb21wb25lbnRzPywgVXJpQ29tcG9uZW50cz9dW10pID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGVkaXRvcjogKElSZXNvdXJjZURpZmZFZGl0b3JJbnB1dCAmIHsgcmVzb3VyY2U6IFVSSSB9KVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbbGFiZWwsIG9yaWdpbmFsLCBtb2RpZmllZF0gb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRlZGl0b3IucHVzaCh7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkucmV2aXZlKGxhYmVsKSxcblx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5yZXZpdmUob3JpZ2luYWwpIH0sXG5cdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkucmV2aXZlKG1vZGlmaWVkKSB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2VzOiBlZGl0b3IsIGxhYmVsOiB0aXRsZSB9KTtcblx0fSk7XG5cblx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ193b3JrYmVuY2gub3Blbk11bHRpRGlmZkVkaXRvcicsIGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0aW9uczogT3Blbk11bHRpRmlsZURpZmZFZGl0b3JPcHRpb25zKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCByZXNvdXJjZXMgPSBvcHRpb25zLnJlc291cmNlcz8ubWFwKHIgPT4gKHsgb3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5yZXZpdmUoci5vcmlnaW5hbFVyaSkgfSwgbW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5yZXZpdmUoci5tb2RpZmllZFVyaSkgfSB9KSk7XG5cblx0XHRjb25zdCByZXZlYWxVcmkgPSBvcHRpb25zLnJldmVhbD8ubW9kaWZpZWRVcmkgPyBVUkkucmV2aXZlKG9wdGlvbnMucmV2ZWFsLm1vZGlmaWVkVXJpKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXZlYWxSZXNvdXJjZSA9IHJldmVhbFVyaSAmJiByZXNvdXJjZXMgPyByZXNvdXJjZXMuZmluZChyID0+IGlzRXF1YWwoci5tb2RpZmllZC5yZXNvdXJjZSwgcmV2ZWFsVXJpKSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMucmV2ZWFsICYmICFyZXZlYWxSZXNvdXJjZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcignUmV2ZWFsIHJlc291cmNlIG5vdCBmb3VuZCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG11bHRpRGlmZkVkaXRvck9wdGlvbnM6IElNdWx0aURpZmZFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0dmlld1N0YXRlOiByZXZlYWxSZXNvdXJjZSA/IHtcblx0XHRcdFx0cmV2ZWFsRGF0YToge1xuXHRcdFx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdFx0XHRvcmlnaW5hbDogcmV2ZWFsUmVzb3VyY2Uub3JpZ2luYWwucmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRtb2RpZmllZDogcmV2ZWFsUmVzb3VyY2UubW9kaWZpZWQucmVzb3VyY2UsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyYW5nZTogb3B0aW9ucy5yZXZlYWw/LnJhbmdlLFxuXHRcdFx0XHR9XG5cdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0fTtcblxuXHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRtdWx0aURpZmZTb3VyY2U6IG9wdGlvbnMubXVsdGlEaWZmU291cmNlVXJpID8gVVJJLnJldml2ZShvcHRpb25zLm11bHRpRGlmZlNvdXJjZVVyaSkgOiB1bmRlZmluZWQsXG5cdFx0XHRyZXNvdXJjZXMsXG5cdFx0XHRsYWJlbDogb3B0aW9ucy50aXRsZSxcblx0XHRcdG9wdGlvbnM6IG11bHRpRGlmZkVkaXRvck9wdGlvbnMsXG5cdFx0fSk7XG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgT3Blbk11bHRpRmlsZURpZmZFZGl0b3JPcHRpb25zIHtcblx0dGl0bGU6IHN0cmluZztcblx0bXVsdGlEaWZmU291cmNlVXJpPzogVXJpQ29tcG9uZW50cztcblx0cmVzb3VyY2VzPzogeyBvcmlnaW5hbFVyaTogVXJpQ29tcG9uZW50czsgbW9kaWZpZWRVcmk6IFVyaUNvbXBvbmVudHMgfVtdO1xuXHRyZXZlYWw/OiB7XG5cdFx0bW9kaWZpZWRVcmk6IFVyaUNvbXBvbmVudHM7XG5cdFx0cmFuZ2U/OiBJUmFuZ2U7XG5cdH07XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyT3BlbkVkaXRvckF0SW5kZXhDb21tYW5kcygpOiB2b2lkIHtcblx0Y29uc3Qgb3BlbkVkaXRvckF0SW5kZXg6IElDb21tYW5kSGFuZGxlciA9IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9ySW5kZXg6IHVua25vd24pOiB2b2lkID0+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lICYmIHR5cGVvZiBlZGl0b3JJbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGFjdGl2ZUVkaXRvclBhbmUuZ3JvdXAuZ2V0RWRpdG9yQnlJbmRleChlZGl0b3JJbmRleCk7XG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHQvLyBUaGlzIGNvbW1hbmQgdGFrZXMgaW4gdGhlIGVkaXRvciBpbmRleCBudW1iZXIgdG8gb3BlbiBhcyBhbiBhcmd1bWVudFxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0aWQ6IE9QRU5fRURJVE9SX0FUX0lOREVYX0NPTU1BTkRfSUQsXG5cdFx0aGFuZGxlcjogb3BlbkVkaXRvckF0SW5kZXhcblx0fSk7XG5cblx0Ly8gS2V5YmluZGluZ3MgdG8gZm9jdXMgYSBzcGVjaWZpYyBpbmRleCBpbiB0aGUgdGFiIGZvbGRlciBpZiB0YWJzIGFyZSBlbmFibGVkXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgOTsgaSsrKSB7XG5cdFx0Y29uc3QgZWRpdG9ySW5kZXggPSBpO1xuXHRcdGNvbnN0IHZpc2libGVJbmRleCA9IGkgKyAxO1xuXG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogT1BFTl9FRElUT1JfQVRfSU5ERVhfQ09NTUFORF9JRCArIHZpc2libGVJbmRleCxcblx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IHRvS2V5Q29kZSh2aXNpYmxlSW5kZXgpLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgdG9LZXlDb2RlKHZpc2libGVJbmRleCkgfSxcblx0XHRcdGhhbmRsZXI6IGFjY2Vzc29yID0+IG9wZW5FZGl0b3JBdEluZGV4KGFjY2Vzc29yLCBlZGl0b3JJbmRleClcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvS2V5Q29kZShpbmRleDogbnVtYmVyKTogS2V5Q29kZSB7XG5cdFx0c3dpdGNoIChpbmRleCkge1xuXHRcdFx0Y2FzZSAwOiByZXR1cm4gS2V5Q29kZS5EaWdpdDA7XG5cdFx0XHRjYXNlIDE6IHJldHVybiBLZXlDb2RlLkRpZ2l0MTtcblx0XHRcdGNhc2UgMjogcmV0dXJuIEtleUNvZGUuRGlnaXQyO1xuXHRcdFx0Y2FzZSAzOiByZXR1cm4gS2V5Q29kZS5EaWdpdDM7XG5cdFx0XHRjYXNlIDQ6IHJldHVybiBLZXlDb2RlLkRpZ2l0NDtcblx0XHRcdGNhc2UgNTogcmV0dXJuIEtleUNvZGUuRGlnaXQ1O1xuXHRcdFx0Y2FzZSA2OiByZXR1cm4gS2V5Q29kZS5EaWdpdDY7XG5cdFx0XHRjYXNlIDc6IHJldHVybiBLZXlDb2RlLkRpZ2l0Nztcblx0XHRcdGNhc2UgODogcmV0dXJuIEtleUNvZGUuRGlnaXQ4O1xuXHRcdFx0Y2FzZSA5OiByZXR1cm4gS2V5Q29kZS5EaWdpdDk7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGluZGV4Jyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJGb2N1c0VkaXRvckdyb3VwQXRJbmRleENvbW1hbmRzKCk6IHZvaWQge1xuXG5cdC8vIEtleWJpbmRpbmdzIHRvIGZvY3VzIGEgc3BlY2lmaWMgZ3JvdXAgKDItOCkgaW4gdGhlIGVkaXRvciBhcmVhXG5cdGZvciAobGV0IGdyb3VwSW5kZXggPSAxOyBncm91cEluZGV4IDwgODsgZ3JvdXBJbmRleCsrKSB7XG5cdFx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0XHRpZDogdG9Db21tYW5kSWQoZ3JvdXBJbmRleCksXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgdG9LZXlDb2RlKGdyb3VwSW5kZXgpLFxuXHRcdFx0aGFuZGxlcjogYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBUbyBrZWVwIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IChwcmUtZ3JpZCksIGFsbG93IHRvIGZvY3VzIGEgZ3JvdXBcblx0XHRcdFx0Ly8gdGhhdCBkb2VzIG5vdCBleGlzdCBhcyBsb25nIGFzIGl0IGlzIHRoZSBuZXh0IGdyb3VwIGFmdGVyIHRoZSBsYXN0XG5cdFx0XHRcdC8vIG9wZW5lZCBncm91cC4gT3RoZXJ3aXNlIHdlIHJldHVybi5cblx0XHRcdFx0aWYgKGdyb3VwSW5kZXggPiBlZGl0b3JHcm91cHNTZXJ2aWNlLmNvdW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gR3JvdXAgZXhpc3RzOiBqdXN0IGZvY3VzXG5cdFx0XHRcdGNvbnN0IGdyb3VwcyA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSk7XG5cdFx0XHRcdGlmIChncm91cHNbZ3JvdXBJbmRleF0pIHtcblx0XHRcdFx0XHRyZXR1cm4gZ3JvdXBzW2dyb3VwSW5kZXhdLmZvY3VzKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBHcm91cCBkb2VzIG5vdCBleGlzdDogY3JlYXRlIG5ldyBieSBzcGxpdHRpbmcgdGhlIGFjdGl2ZSBvbmUgb2YgdGhlIGxhc3QgZ3JvdXBcblx0XHRcdFx0Y29uc3QgZGlyZWN0aW9uID0gcHJlZmVycmVkU2lkZUJ5U2lkZUdyb3VwRGlyZWN0aW9uKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgbGFzdEdyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5maW5kR3JvdXAoeyBsb2NhdGlvbjogR3JvdXBMb2NhdGlvbi5MQVNUIH0pO1xuXHRcdFx0XHRpZiAoIWxhc3RHcm91cCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5ld0dyb3VwID0gZWRpdG9yR3JvdXBzU2VydmljZS5hZGRHcm91cChsYXN0R3JvdXAsIGRpcmVjdGlvbik7XG5cblx0XHRcdFx0Ly8gRm9jdXNcblx0XHRcdFx0bmV3R3JvdXAuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvQ29tbWFuZElkKGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAoaW5kZXgpIHtcblx0XHRcdGNhc2UgMTogcmV0dXJuICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzU2Vjb25kRWRpdG9yR3JvdXAnO1xuXHRcdFx0Y2FzZSAyOiByZXR1cm4gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNUaGlyZEVkaXRvckdyb3VwJztcblx0XHRcdGNhc2UgMzogcmV0dXJuICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRm91cnRoRWRpdG9yR3JvdXAnO1xuXHRcdFx0Y2FzZSA0OiByZXR1cm4gJ3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNGaWZ0aEVkaXRvckdyb3VwJztcblx0XHRcdGNhc2UgNTogcmV0dXJuICd3b3JrYmVuY2guYWN0aW9uLmZvY3VzU2l4dGhFZGl0b3JHcm91cCc7XG5cdFx0XHRjYXNlIDY6IHJldHVybiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1NldmVudGhFZGl0b3JHcm91cCc7XG5cdFx0XHRjYXNlIDc6IHJldHVybiAnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0VpZ2h0aEVkaXRvckdyb3VwJztcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgaW5kZXgnKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvS2V5Q29kZShpbmRleDogbnVtYmVyKTogS2V5Q29kZSB7XG5cdFx0c3dpdGNoIChpbmRleCkge1xuXHRcdFx0Y2FzZSAxOiByZXR1cm4gS2V5Q29kZS5EaWdpdDI7XG5cdFx0XHRjYXNlIDI6IHJldHVybiBLZXlDb2RlLkRpZ2l0Mztcblx0XHRcdGNhc2UgMzogcmV0dXJuIEtleUNvZGUuRGlnaXQ0O1xuXHRcdFx0Y2FzZSA0OiByZXR1cm4gS2V5Q29kZS5EaWdpdDU7XG5cdFx0XHRjYXNlIDU6IHJldHVybiBLZXlDb2RlLkRpZ2l0Njtcblx0XHRcdGNhc2UgNjogcmV0dXJuIEtleUNvZGUuRGlnaXQ3O1xuXHRcdFx0Y2FzZSA3OiByZXR1cm4gS2V5Q29kZS5EaWdpdDg7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGluZGV4Jyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNwbGl0RWRpdG9yKGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLCByZXNvbHZlZENvbnRleHQ6IElSZXNvbHZlZEVkaXRvckNvbW1hbmRzQ29udGV4dCk6IHZvaWQge1xuXHRpZiAoIXJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBPbmx5IHN1cHBvcnQgc3BsaXR0aW5nIGZyb20gb25lIHNvdXJjZSBncm91cFxuXHRjb25zdCB7IGdyb3VwLCBlZGl0b3JzIH0gPSByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF07XG5cdGNvbnN0IHByZXNlcnZlRm9jdXMgPSByZXNvbHZlZENvbnRleHQucHJlc2VydmVGb2N1cztcblx0Y29uc3QgbmV3R3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKGdyb3VwLCBkaXJlY3Rpb24pO1xuXG5cdGZvciAoY29uc3QgZWRpdG9yVG9Db3B5IG9mIGVkaXRvcnMpIHtcblxuXHRcdC8vIFNwbGl0IGVkaXRvciAoaWYgaXQgY2FuIGJlIHNwbGl0KVxuXHRcdGlmIChlZGl0b3JUb0NvcHkgJiYgIWVkaXRvclRvQ29weS5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLlNpbmdsZXRvbikpIHtcblx0XHRcdGdyb3VwLmNvcHlFZGl0b3IoZWRpdG9yVG9Db3B5LCBuZXdHcm91cCwgeyBwcmVzZXJ2ZUZvY3VzIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8vIEZvY3VzXG5cdG5ld0dyb3VwLmZvY3VzKCk7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyU3BsaXRFZGl0b3JDb21tYW5kcygpIHtcblx0W1xuXHRcdHsgaWQ6IFNQTElUX0VESVRPUl9VUCwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5VUCB9LFxuXHRcdHsgaWQ6IFNQTElUX0VESVRPUl9ET1dOLCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLkRPV04gfSxcblx0XHR7IGlkOiBTUExJVF9FRElUT1JfTEVGVCwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5MRUZUIH0sXG5cdFx0eyBpZDogU1BMSVRfRURJVE9SX1JJR0hULCBkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLlJJR0hUIH1cblx0XS5mb3JFYWNoKCh7IGlkLCBkaXJlY3Rpb24gfSkgPT4ge1xuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKGlkLCBmdW5jdGlvbiAoYWNjZXNzb3IsIC4uLmFyZ3MpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0c3BsaXRFZGl0b3IoYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgZGlyZWN0aW9uLCByZXNvbHZlZENvbnRleHQpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJDbG9zZUVkaXRvckNvbW1hbmRzKCkge1xuXG5cdC8vIEEgc3BlY2lhbCBoYW5kbGVyIGZvciBcIkNsb3NlIEVkaXRvclwiIGRlcGVuZGluZyBvbiBjb250ZXh0XG5cdC8vIC0ga2V5YmluZGluaW5nOiBkbyBub3QgY2xvc2Ugc3RpY2t5IGVkaXRvcnMsIHJhdGhlciBvcGVuIHRoZSBuZXh0IG5vbi1zdGlja3kgZWRpdG9yXG5cdC8vIC0gbWVudTogYWx3YXlzIGNsb3NlIGVkaXRvciwgZXZlbiBzdGlja3kgb25lc1xuXHRmdW5jdGlvbiBjbG9zZUVkaXRvckhhbmRsZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZvcmNlQ2xvc2VTdGlja3lFZGl0b3JzOiBib29sZWFuLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGxldCBrZWVwU3RpY2t5RWRpdG9yczogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoZm9yY2VDbG9zZVN0aWNreUVkaXRvcnMpIHtcblx0XHRcdGtlZXBTdGlja3lFZGl0b3JzID0gZmFsc2U7IC8vIGV4cGxpY2l0bHkgY2xvc2Ugc3RpY2t5IGVkaXRvcnNcblx0XHR9IGVsc2UgaWYgKGFyZ3MubGVuZ3RoKSB7XG5cdFx0XHRrZWVwU3RpY2t5RWRpdG9ycyA9IGZhbHNlOyAvLyB3ZSBoYXZlIGEgY29udGV4dCwgYXMgc3VjaCB0aGlzIGNvbW1hbmQgd2FzIHVzZWQgZS5nLiBmcm9tIHRoZSB0YWIgY29udGV4dCBtZW51XG5cdFx0fSBlbHNlIHtcblx0XHRcdGtlZXBTdGlja3lFZGl0b3JzID0gZWRpdG9yR3JvdXBzU2VydmljZS5wYXJ0T3B0aW9ucy5wcmV2ZW50UGlubmVkRWRpdG9yQ2xvc2UgPT09ICdrZXlib2FyZCcgfHwgZWRpdG9yR3JvdXBzU2VydmljZS5wYXJ0T3B0aW9ucy5wcmV2ZW50UGlubmVkRWRpdG9yQ2xvc2UgPT09ICdrZXlib2FyZEFuZE1vdXNlJzsgLy8gcmVzcGVjdCBzZXR0aW5nIG90aGVyd2lzZVxuXHRcdH1cblxuXHRcdC8vIFNraXAgb3ZlciBzdGlja3kgZWRpdG9yIGFuZCBzZWxlY3QgbmV4dCBpZiB3ZSBhcmUgY29uZmlndXJlZCB0byBkbyBzb1xuXHRcdGlmIChrZWVwU3RpY2t5RWRpdG9ycykge1xuXHRcdFx0Y29uc3QgYWN0aXZlR3JvdXAgPSBlZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yO1xuXG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yICYmIGFjdGl2ZUdyb3VwLmlzU3RpY2t5KGFjdGl2ZUVkaXRvcikpIHtcblxuXHRcdFx0XHQvLyBPcGVuIG5leHQgcmVjZW50bHkgYWN0aXZlIGluIHNhbWUgZ3JvdXBcblx0XHRcdFx0Y29uc3QgbmV4dE5vblN0aWNreUVkaXRvckluR3JvdXAgPSBhY3RpdmVHcm91cC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSwgeyBleGNsdWRlU3RpY2t5OiB0cnVlIH0pWzBdO1xuXHRcdFx0XHRpZiAobmV4dE5vblN0aWNreUVkaXRvckluR3JvdXApIHtcblx0XHRcdFx0XHRyZXR1cm4gYWN0aXZlR3JvdXAub3BlbkVkaXRvcihuZXh0Tm9uU3RpY2t5RWRpdG9ySW5Hcm91cCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPcGVuIG5leHQgcmVjZW50bHkgYWN0aXZlIGFjcm9zcyBhbGwgZ3JvdXBzXG5cdFx0XHRcdGNvbnN0IG5leHROb25TdGlja3lFZGl0b3JJbkFsbEdyb3VwcyA9IGVkaXRvclNlcnZpY2UuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KVswXTtcblx0XHRcdFx0aWYgKG5leHROb25TdGlja3lFZGl0b3JJbkFsbEdyb3Vwcykge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cChuZXh0Tm9uU3RpY2t5RWRpdG9ySW5BbGxHcm91cHMuZ3JvdXBJZCk/Lm9wZW5FZGl0b3IobmV4dE5vblN0aWNreUVkaXRvckluQWxsR3JvdXBzLmVkaXRvcikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2l0aCBjb250ZXh0OiBwcm9jZWVkIHRvIGNsb3NlIGVkaXRvcnMgYXMgaW5zdHJ1Y3RlZFxuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSByZXNvbHZlZENvbnRleHQucHJlc2VydmVGb2N1cztcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbChyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubWFwKGFzeW5jICh7IGdyb3VwLCBlZGl0b3JzIH0pID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvcnNUb0Nsb3NlID0gZWRpdG9ycy5maWx0ZXIoZWRpdG9yID0+ICFrZWVwU3RpY2t5RWRpdG9ycyB8fCAhZ3JvdXAuaXNTdGlja3koZWRpdG9yKSk7XG5cdFx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoZWRpdG9yc1RvQ2xvc2UsIHsgcHJlc2VydmVGb2N1cyB9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQ0xPU0VfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXLFxuXHRcdHdpbjogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjQsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlXXSB9LFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRyZXR1cm4gY2xvc2VFZGl0b3JIYW5kbGVyKGFjY2Vzc29yLCBmYWxzZSwgLi4uYXJncyk7XG5cdFx0fVxuXHR9KTtcblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChDTE9TRV9QSU5ORURfRURJVE9SX0NPTU1BTkRfSUQsIChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0cmV0dXJuIGNsb3NlRWRpdG9ySGFuZGxlcihhY2Nlc3NvciwgdHJ1ZSAvKiBmb3JjZSBjbG9zZSBwaW5uZWQgZWRpdG9ycyAqLywgLi4uYXJncyk7XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBDTE9TRV9FRElUT1JTX0lOX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleVcpLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubWFwKGFzeW5jICh7IGdyb3VwIH0pID0+IHtcblx0XHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VBbGxFZGl0b3JzKHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBDTE9TRV9FRElUT1JfR1JPVVBfQ09NTUFORF9JRCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yR3JvdXBFbXB0eUNvbnRleHQsIE11bHRpcGxlRWRpdG9yR3JvdXBzQ29udGV4dCksXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVcsXG5cdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5GNCwgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVddIH0sXG5cdFx0aGFuZGxlcjogKGFjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY29tbWFuZHNDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBlZGl0b3JHcm91cHNTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cblx0XHRcdGlmIChjb21tYW5kc0NvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGVkaXRvckdyb3Vwc1NlcnZpY2UucmVtb3ZlR3JvdXAoY29tbWFuZHNDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdLmdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBDTE9TRV9TQVZFRF9FRElUT1JTX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleVUpLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdHJldHVybiBQcm9taXNlLmFsbChyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubWFwKGFzeW5jICh7IGdyb3VwIH0pID0+IHtcblx0XHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgc2F2ZWRPbmx5OiB0cnVlLCBleGNsdWRlU3RpY2t5OiB0cnVlIH0sIHsgcHJlc2VydmVGb2N1czogcmVzb2x2ZWRDb250ZXh0LnByZXNlcnZlRm9jdXMgfSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQ0xPU0VfT1RIRVJfRURJVE9SU19JTl9HUk9VUF9DT01NQU5EX0lELFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHdoZW46IHVuZGVmaW5lZCxcblx0XHRwcmltYXJ5OiB1bmRlZmluZWQsXG5cdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5VCB9LFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5tYXAoYXN5bmMgKHsgZ3JvdXAsIGVkaXRvcnMgfSkgPT4ge1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzVG9DbG9zZSA9IGdyb3VwLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwsIHsgZXhjbHVkZVN0aWNreTogdHJ1ZSB9KS5maWx0ZXIoZWRpdG9yID0+ICFlZGl0b3JzLmluY2x1ZGVzKGVkaXRvcikpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdG9yVG9LZWVwIG9mIGVkaXRvcnMpIHtcblx0XHRcdFx0XHRpZiAoZWRpdG9yVG9LZWVwKSB7XG5cdFx0XHRcdFx0XHRncm91cC5waW5FZGl0b3IoZWRpdG9yVG9LZWVwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCBncm91cC5jbG9zZUVkaXRvcnMoZWRpdG9yc1RvQ2xvc2UsIHsgcHJlc2VydmVGb2N1czogcmVzb2x2ZWRDb250ZXh0LnByZXNlcnZlRm9jdXMgfSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogQ0xPU0VfRURJVE9SU19UT19USEVfUklHSFRfQ09NTUFORF9JRCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0cHJpbWFyeTogdW5kZWZpbmVkLFxuXHRcdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRcdGlmIChyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHsgZ3JvdXAsIGVkaXRvcnMgfSA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXTtcblx0XHRcdFx0aWYgKGdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdGdyb3VwLnBpbkVkaXRvcihncm91cC5hY3RpdmVFZGl0b3IpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgZ3JvdXAuY2xvc2VFZGl0b3JzKHsgZGlyZWN0aW9uOiBDbG9zZURpcmVjdGlvbi5SSUdIVCwgZXhjZXB0OiBlZGl0b3JzWzBdLCBleGNsdWRlU3RpY2t5OiB0cnVlIH0sIHsgcHJlc2VydmVGb2N1czogcmVzb2x2ZWRDb250ZXh0LnByZXNlcnZlRm9jdXMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRLZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogUkVPUEVOX1dJVEhfQ09NTUFORF9JRCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0cHJpbWFyeTogdW5kZWZpbmVkLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRyZXR1cm4gcmVvcGVuRWRpdG9yV2l0aChhY2Nlc3NvciwgRWRpdG9yUmVzb2x1dGlvbi5QSUNLLCAuLi5hcmdzKTtcblx0XHR9XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBSRU9QRU5fQUNUSVZFX0VESVRPUl9XSVRIX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IHVuZGVmaW5lZCxcblx0XHRoYW5kbGVyOiAoYWNjZXNzb3IsIG92ZXJyaWRlPzogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdHJldHVybiByZW9wZW5FZGl0b3JXaXRoKGFjY2Vzc29yLCBvdmVycmlkZSA/PyBFZGl0b3JSZXNvbHV0aW9uLlBJQ0ssIC4uLmFyZ3MpO1xuXHRcdH1cblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVvcGVuRWRpdG9yV2l0aChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yT3ZlcnJpZGU6IHN0cmluZyB8IEVkaXRvclJlc29sdXRpb24sIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclJlc29sdmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRGaWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya2luZ0NvcHlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JraW5nQ29weVNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgZWRpdG9yU2VydmljZSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdGNvbnN0IGVkaXRvclJlcGxhY2VtZW50cyA9IG5ldyBNYXA8SUVkaXRvckdyb3VwLCBJRWRpdG9yUmVwbGFjZW1lbnRbXT4oKTtcblxuXHRcdGZvciAoY29uc3QgeyBncm91cCwgZWRpdG9ycyB9IG9mIHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycykge1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0XHRjb25zdCBpc0RpZmZFZGl0b3IgPSBpc0RpZmZFZGl0b3JJbnB1dChlZGl0b3IpO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JUb1Jlc29sdmUgPSBpc0RpZmZFZGl0b3IgPyBlZGl0b3IubW9kaWZpZWQgOiBlZGl0b3I7XG5cdFx0XHRcdGNvbnN0IHVudHlwZWRFZGl0b3IgPSBpc0RpZmZFZGl0b3IgPyBlZGl0b3IudG9VbnR5cGVkKCkgOiBlZGl0b3JUb1Jlc29sdmUudG9VbnR5cGVkKCk7XG5cdFx0XHRcdGlmICghdW50eXBlZEVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gUmVzb2x2ZXIgY2FuIG9ubHkgcmVzb2x2ZSB1bnR5cGVkIGVkaXRvcnNcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHVudHlwZWRFZGl0b3Iub3B0aW9ucyA9IHsgLi4uZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5vcHRpb25zLCBvdmVycmlkZTogZWRpdG9yT3ZlcnJpZGUgfTtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRFZGl0b3IgPSBhd2FpdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UucmVzb2x2ZUVkaXRvcih1bnR5cGVkRWRpdG9yLCBncm91cCk7XG5cdFx0XHRcdGlmICghaXNFZGl0b3JJbnB1dFdpdGhPcHRpb25zQW5kR3JvdXAocmVzb2x2ZWRFZGl0b3IpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGVkaXRvclJlcGxhY2VtZW50c0luR3JvdXAgPSBlZGl0b3JSZXBsYWNlbWVudHMuZ2V0KGdyb3VwKTtcblx0XHRcdFx0aWYgKCFlZGl0b3JSZXBsYWNlbWVudHNJbkdyb3VwKSB7XG5cdFx0XHRcdFx0ZWRpdG9yUmVwbGFjZW1lbnRzSW5Hcm91cCA9IFtdO1xuXHRcdFx0XHRcdGVkaXRvclJlcGxhY2VtZW50cy5zZXQoZ3JvdXAsIGVkaXRvclJlcGxhY2VtZW50c0luR3JvdXApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRm9yY2UgcmVwbGFjZSB3aGVuIGNsb3NpbmcgdGhlIGVkaXRvciB3aXRob3V0IHNhdmluZyBjYW5ub3Rcblx0XHRcdFx0Ly8gbG9zZSBkYXRhLiBUaGlzIGlzIHRoZSBjYXNlIHdoZW4gdGhlIGRpcnR5IHN0YXRlIGxpdmVzIGluIGFcblx0XHRcdFx0Ly8gd29ya2luZyBjb3B5IHdob3NlIGxpZmV0aW1lIGlzIGluZGVwZW5kZW50IG9mIHRoZSBlZGl0b3I6XG5cdFx0XHRcdC8vIGBUZXh0RmlsZUVkaXRvck1vZGVsYHMgYW5kIGBVbnRpdGxlZFRleHRFZGl0b3JNb2RlbGBzIGFyZVxuXHRcdFx0XHQvLyBrZXB0IGFsaXZlIHdoaWxlIGRpcnR5IGJ5IHRoZWlyIG93bmluZyBzZXJ2aWNlLlxuXHRcdFx0XHQvL1xuXHRcdFx0XHQvLyBUaGlzIHdheSBzd2l0Y2hpbmcgYmV0d2VlbiBhIHRleHQgZWRpdG9yIGFuZCBhIHRleHQtZG9jdW1lbnRcblx0XHRcdFx0Ly8gYmFzZWQgY3VzdG9tIGVkaXRvciAoc3VjaCBhcyB0aGUgTWFya2Rvd24gcHJldmlldykgZm9yIHRoZVxuXHRcdFx0XHQvLyBzYW1lIHJlc291cmNlIGRvZXMgbm90IHRyaWdnZXIgYSBzYXZlIGRpYWxvZy5cblx0XHRcdFx0Ly9cblx0XHRcdFx0Ly8gQ3VzdG9tLWRvY3VtZW50IGN1c3RvbSBlZGl0b3JzIChlLmcuIGhleCBlZGl0b3JzKSBtYWludGFpblxuXHRcdFx0XHQvLyB0aGVpciBkaXJ0eSBzdGF0ZSBpbiBhIHdvcmtpbmcgY29weSB3aG9zZSBsaWZldGltZSBpcyB0aWVkXG5cdFx0XHRcdC8vIHRvIHRoZSBlZGl0b3IgaW5wdXQsIHNvIHdlIG11c3Qgbm90IHNraXAgdGhlIHNhdmUgcHJvbXB0XG5cdFx0XHRcdC8vIGZvciB0aG9zZSBcdTIwMTQgZGV0ZWN0IHRoaXMgYnkgbG9va2luZyBmb3IgYW55IGRpcnR5IHdvcmtpbmdcblx0XHRcdFx0Ly8gY29weSB0aGF0IGJhY2tzIHRoaXMgZWRpdG9yIGF0IGEgZGlmZmVyZW50IHJlc291cmNlLlxuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGVkaXRvclRvUmVzb2x2ZS5yZXNvdXJjZTtcblx0XHRcdFx0bGV0IGZvcmNlUmVwbGFjZURpcnR5ID0gISFyZXNvdXJjZSAmJiAocmVzb3VyY2Uuc2NoZW1lID09PSBTY2hlbWFzLnVudGl0bGVkIHx8IHRleHRGaWxlU2VydmljZS5pc0RpcnR5KHJlc291cmNlKSk7XG5cdFx0XHRcdGlmIChmb3JjZVJlcGxhY2VEaXJ0eSAmJiBlZGl0b3JUb1Jlc29sdmUuaXNEaXJ0eSgpKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB3b3JraW5nQ29weSBvZiB3b3JraW5nQ29weVNlcnZpY2UuZGlydHlXb3JraW5nQ29waWVzKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXNFcXVhbCh3b3JraW5nQ29weS5yZXNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlOyAvLyB3b3JraW5nIGNvcHkgYXQgdGhlIGVkaXRvcidzIG93biByZXNvdXJjZSBpcyB0ZXh0LWJhc2VkIGFuZCBzdXJ2aXZlcyBjbG9zZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZS5maW5kRWRpdG9yKHdvcmtpbmdDb3B5KT8uZWRpdG9yID09PSBlZGl0b3JUb1Jlc29sdmUpIHtcblx0XHRcdFx0XHRcdFx0Zm9yY2VSZXBsYWNlRGlydHkgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZWRpdG9yUmVwbGFjZW1lbnRzSW5Hcm91cC5wdXNoKHtcblx0XHRcdFx0XHRlZGl0b3I6IGVkaXRvcixcblx0XHRcdFx0XHRyZXBsYWNlbWVudDogcmVzb2x2ZWRFZGl0b3IuZWRpdG9yLFxuXHRcdFx0XHRcdGZvcmNlUmVwbGFjZURpcnR5LFxuXHRcdFx0XHRcdG9wdGlvbnM6IHJlc29sdmVkRWRpdG9yLm9wdGlvbnNcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gVGVsZW1ldHJ5XG5cdFx0XHRcdHR5cGUgV29ya2JlbmNoRWRpdG9yUmVvcGVuQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdyZWJvcm5peCc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ0lkZW50aWZ5IGhvdyBhIGRvY3VtZW50IGlzIHJlb3BlbmVkJztcblx0XHRcdFx0XHRzY2hlbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGaWxlIHN5c3RlbSBwcm92aWRlciBzY2hlbWUgZm9yIHRoZSByZXNvdXJjZScgfTtcblx0XHRcdFx0XHRleHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdGaWxlIGV4dGVuc2lvbiBmb3IgdGhlIHJlc291cmNlJyB9O1xuXHRcdFx0XHRcdGZyb206IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZWRpdG9yIHZpZXcgdHlwZSB0aGUgcmVzb3VyY2UgaXMgc3dpdGNoZWQgZnJvbScgfTtcblx0XHRcdFx0XHR0bzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBlZGl0b3IgdmlldyB0eXBlIHRoZSByZXNvdXJjZSBpcyBzd2l0Y2hlZCB0bycgfTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR0eXBlIFdvcmtiZW5jaEVkaXRvclJlb3BlbkV2ZW50ID0ge1xuXHRcdFx0XHRcdHNjaGVtZTogc3RyaW5nO1xuXHRcdFx0XHRcdGV4dDogc3RyaW5nO1xuXHRcdFx0XHRcdGZyb206IHN0cmluZztcblx0XHRcdFx0XHR0bzogc3RyaW5nO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hFZGl0b3JSZW9wZW5FdmVudCwgV29ya2JlbmNoRWRpdG9yUmVvcGVuQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hFZGl0b3JSZW9wZW4nLCB7XG5cdFx0XHRcdFx0c2NoZW1lOiBlZGl0b3JUb1Jlc29sdmUucmVzb3VyY2U/LnNjaGVtZSA/PyAnJyxcblx0XHRcdFx0XHRleHQ6IGVkaXRvclRvUmVzb2x2ZS5yZXNvdXJjZSA/IGV4dG5hbWUoZWRpdG9yVG9SZXNvbHZlLnJlc291cmNlKSA6ICcnLFxuXHRcdFx0XHRcdGZyb206IGVkaXRvci5lZGl0b3JJZCA/PyAnJyxcblx0XHRcdFx0XHR0bzogcmVzb2x2ZWRFZGl0b3IuZWRpdG9yLmVkaXRvcklkID8/ICcnXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlcGxhY2UgZWRpdG9yIHdpdGggcmVzb2x2ZWQgb25lIGFuZCBtYWtlIGFjdGl2ZVxuXHRcdGZvciAoY29uc3QgW2dyb3VwLCByZXBsYWNlbWVudHNdIG9mIGVkaXRvclJlcGxhY2VtZW50cykge1xuXHRcdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMocmVwbGFjZW1lbnRzKTtcblx0XHRcdGF3YWl0IGdyb3VwLm9wZW5FZGl0b3IocmVwbGFjZW1lbnRzWzBdLnJlcGxhY2VtZW50KTtcblx0XHR9XG5cdH1cblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChDTE9TRV9FRElUT1JTX0FORF9HUk9VUF9DT01NQU5EX0lELCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBlZGl0b3JHcm91cHNTZXJ2aWNlLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0aWYgKHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9ycy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHsgZ3JvdXAgfSA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXTtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycygpO1xuXG5cdFx0XHRpZiAoZ3JvdXAuY291bnQgPT09IDAgJiYgZWRpdG9yR3JvdXBzU2VydmljZS5nZXRHcm91cChncm91cC5pZCkgLyogY291bGQgYmUgZ29uZSBieSBub3cgKi8pIHtcblx0XHRcdFx0ZWRpdG9yR3JvdXBzU2VydmljZS5yZW1vdmVHcm91cChncm91cCk7IC8vIG9ubHkgcmVtb3ZlIGdyb3VwIGlmIGl0IGlzIG5vdyBlbXB0eVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyRm9jdXNFZGl0b3JHcm91cFdpaG91dFdyYXBDb21tYW5kcygpOiB2b2lkIHtcblxuXHRjb25zdCBjb21tYW5kcyA9IFtcblx0XHR7XG5cdFx0XHRpZDogRk9DVVNfTEVGVF9HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCxcblx0XHRcdGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uTEVGVFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6IEZPQ1VTX1JJR0hUX0dST1VQX1dJVEhPVVRfV1JBUF9DT01NQU5EX0lELFxuXHRcdFx0ZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5SSUdIVFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aWQ6IEZPQ1VTX0FCT1ZFX0dST1VQX1dJVEhPVVRfV1JBUF9DT01NQU5EX0lELFxuXHRcdFx0ZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbi5VUCxcblx0XHR9LFxuXHRcdHtcblx0XHRcdGlkOiBGT0NVU19CRUxPV19HUk9VUF9XSVRIT1VUX1dSQVBfQ09NTUFORF9JRCxcblx0XHRcdGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24uRE9XTlxuXHRcdH1cblx0XTtcblxuXHRmb3IgKGNvbnN0IGNvbW1hbmQgb2YgY29tbWFuZHMpIHtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChjb21tYW5kLmlkLCBhc3luYyAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBncm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuZmluZEdyb3VwKHsgZGlyZWN0aW9uOiBjb21tYW5kLmRpcmVjdGlvbiB9LCBlZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwLCBmYWxzZSkgPz8gZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cDtcblx0XHRcdGdyb3VwLmZvY3VzKCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJTcGxpdEVkaXRvckluR3JvdXBDb21tYW5kcygpOiB2b2lkIHtcblxuXHRhc3luYyBmdW5jdGlvbiBzcGxpdEVkaXRvckluR3JvdXAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc29sdmVkQ29udGV4dDogSVJlc29sdmVkRWRpdG9yQ29tbWFuZHNDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGlmICghcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZ3JvdXAsIGVkaXRvcnMgfSA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXTtcblx0XHRjb25zdCBlZGl0b3IgPSBlZGl0b3JzWzBdO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3tcblx0XHRcdGVkaXRvcixcblx0XHRcdHJlcGxhY2VtZW50OiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBlZGl0b3IsIGVkaXRvciksXG5cdFx0XHRmb3JjZVJlcGxhY2VEaXJ0eTogdHJ1ZVxuXHRcdH1dKTtcblx0fVxuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogU1BMSVRfRURJVE9SX0lOX0dST1VQLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzcGxpdEVkaXRvckluR3JvdXAnLCAnU3BsaXQgRWRpdG9yIGluIEdyb3VwJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQWN0aXZlRWRpdG9yQ2FuU3BsaXRJbkdyb3VwQ29udGV4dCxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHR3aGVuOiBBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0LFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NsYXNoKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHJldHVybiBzcGxpdEVkaXRvckluR3JvdXAoYWNjZXNzb3IsIHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpKTtcblx0XHR9XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGpvaW5FZGl0b3JJbkdyb3VwKHJlc29sdmVkQ29udGV4dDogSVJlc29sdmVkRWRpdG9yQ29tbWFuZHNDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBncm91cCwgZWRpdG9ycyB9ID0gcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdO1xuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvcnNbMF07XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIShlZGl0b3IgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG9wdGlvbnM6IElFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBncm91cC5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvciAmJiBncm91cC5hY3RpdmVFZGl0b3IgPT09IGVkaXRvcikge1xuXHRcdFx0Zm9yIChjb25zdCBwYW5lIG9mIFthY3RpdmVFZGl0b3JQYW5lLmdldFByaW1hcnlFZGl0b3JQYW5lKCksIGFjdGl2ZUVkaXRvclBhbmUuZ2V0U2Vjb25kYXJ5RWRpdG9yUGFuZSgpXSkge1xuXHRcdFx0XHRpZiAocGFuZT8uaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdG9wdGlvbnMgPSB7IHZpZXdTdGF0ZTogcGFuZS5nZXRWaWV3U3RhdGUoKSB9O1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgZ3JvdXAucmVwbGFjZUVkaXRvcnMoW3tcblx0XHRcdGVkaXRvcixcblx0XHRcdHJlcGxhY2VtZW50OiBlZGl0b3IucHJpbWFyeSxcblx0XHRcdG9wdGlvbnNcblx0XHR9XSk7XG5cdH1cblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IEpPSU5fRURJVE9SX0lOX0dST1VQLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdqb2luRWRpdG9ySW5Hcm91cCcsICdKb2luIEVkaXRvciBpbiBHcm91cCcpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHdoZW46IFNpZGVCeVNpZGVFZGl0b3JBY3RpdmVDb250ZXh0LFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NsYXNoKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHJldHVybiBqb2luRWRpdG9ySW5Hcm91cChyZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKSk7XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IFRPR0dMRV9TUExJVF9FRElUT1JfSU5fR1JPVVAsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZUpvaW5FZGl0b3JJbkdyb3VwJywgJ1RvZ2dsZSBTcGxpdCBFZGl0b3IgaW4gR3JvdXAnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihBY3RpdmVFZGl0b3JDYW5TcGxpdEluR3JvdXBDb250ZXh0LCBTaWRlQnlTaWRlRWRpdG9yQWN0aXZlQ29udGV4dCksXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0aWYgKCFyZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBlZGl0b3JzIH0gPSByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF07XG5cblx0XHRcdGlmIChlZGl0b3JzWzBdIGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRcdGF3YWl0IGpvaW5FZGl0b3JJbkdyb3VwKHJlc29sdmVkQ29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGVkaXRvcnNbMF0pIHtcblx0XHRcdFx0YXdhaXQgc3BsaXRFZGl0b3JJbkdyb3VwKGFjY2Vzc29yLCByZXNvbHZlZENvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBUT0dHTEVfU1BMSVRfRURJVE9SX0lOX0dST1VQX0xBWU9VVCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlU3BsaXRFZGl0b3JJbkdyb3VwTGF5b3V0JywgJ1RvZ2dsZSBMYXlvdXQgb2YgU3BsaXQgRWRpdG9yIGluIEdyb3VwJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY3VycmVudFNldHRpbmcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx1bmtub3duPihTaWRlQnlTaWRlRWRpdG9yLlNJREVfQllfU0lERV9MQVlPVVRfU0VUVElORyk7XG5cblx0XHRcdGxldCBuZXdTZXR0aW5nOiAndmVydGljYWwnIHwgJ2hvcml6b250YWwnO1xuXHRcdFx0aWYgKGN1cnJlbnRTZXR0aW5nICE9PSAnaG9yaXpvbnRhbCcpIHtcblx0XHRcdFx0bmV3U2V0dGluZyA9ICdob3Jpem9udGFsJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG5ld1NldHRpbmcgPSAndmVydGljYWwnO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoU2lkZUJ5U2lkZUVkaXRvci5TSURFX0JZX1NJREVfTEFZT1VUX1NFVFRJTkcsIG5ld1NldHRpbmcpO1xuXHRcdH1cblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyRm9jdXNTaWRlRWRpdG9yc0NvbW1hbmRzKCk6IHZvaWQge1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogRk9DVVNfRklSU1RfU0lERV9FRElUT1IsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ZvY3VzTGVmdFNpZGVFZGl0b3InLCAnRm9jdXMgRmlyc3QgU2lkZSBpbiBBY3RpdmUgRWRpdG9yJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsIFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCksXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3IpIHtcblx0XHRcdFx0YWN0aXZlRWRpdG9yUGFuZS5nZXRTZWNvbmRhcnlFZGl0b3JQYW5lKCk/LmZvY3VzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBUZXh0RGlmZkVkaXRvcikge1xuXHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChESUZGX0ZPQ1VTX1NFQ09OREFSWV9TSURFKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogRk9DVVNfU0VDT05EX1NJREVfRURJVE9SLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c1JpZ2h0U2lkZUVkaXRvcicsICdGb2N1cyBTZWNvbmQgU2lkZSBpbiBBY3RpdmUgRWRpdG9yJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsIFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCksXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3IpIHtcblx0XHRcdFx0YWN0aXZlRWRpdG9yUGFuZS5nZXRQcmltYXJ5RWRpdG9yUGFuZSgpPy5mb2N1cygpO1xuXHRcdFx0fSBlbHNlIGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgVGV4dERpZmZFZGl0b3IpIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRElGRl9GT0NVU19QUklNQVJZX1NJREUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBGT0NVU19PVEhFUl9TSURFX0VESVRPUixcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9jdXNPdGhlclNpZGVFZGl0b3InLCAnRm9jdXMgT3RoZXIgU2lkZSBpbiBBY3RpdmUgRWRpdG9yJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoU2lkZUJ5U2lkZUVkaXRvckFjdGl2ZUNvbnRleHQsIFRleHRDb21wYXJlRWRpdG9yQWN0aXZlQ29udGV4dCksXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3IpIHtcblx0XHRcdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUuZ2V0UHJpbWFyeUVkaXRvclBhbmUoKT8uaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvclBhbmUuZ2V0U2Vjb25kYXJ5RWRpdG9yUGFuZSgpPy5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFjdGl2ZUVkaXRvclBhbmUuZ2V0UHJpbWFyeUVkaXRvclBhbmUoKT8uZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgVGV4dERpZmZFZGl0b3IpIHtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoRElGRl9GT0NVU19PVEhFUl9TSURFKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiByZWdpc3Rlck90aGVyRWRpdG9yQ29tbWFuZHMoKTogdm9pZCB7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IEtFRVBfRURJVE9SX0NPTU1BTkRfSUQsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0d2hlbjogdW5kZWZpbmVkLFxuXHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLkVudGVyKSxcblx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgZ3JvdXAsIGVkaXRvcnMgfSBvZiByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0XHRcdGdyb3VwLnBpbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdFx0aWQ6IFRPR0dMRV9LRUVQX0VESVRPUlNfQ09NTUFORF9JRCxcblx0XHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBjdXJyZW50U2V0dGluZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guZWRpdG9yLmVuYWJsZVByZXZpZXcnKTtcblx0XHRcdGNvbnN0IG5ld1NldHRpbmcgPSBjdXJyZW50U2V0dGluZyAhPT0gdHJ1ZTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCd3b3JrYmVuY2guZWRpdG9yLmVuYWJsZVByZXZpZXcnLCBuZXdTZXR0aW5nKTtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHNldEVkaXRvckdyb3VwTG9jayhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbG9ja2VkOiBib29sZWFuIHwgdW5kZWZpbmVkLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCByZXNvbHZlZENvbnRleHQgPSByZXNvbHZlQ29tbWFuZHNDb250ZXh0KGFyZ3MsIGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSksIGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpKTtcblx0XHRjb25zdCBncm91cCA9IHJlc29sdmVkQ29udGV4dC5ncm91cGVkRWRpdG9yc1swXT8uZ3JvdXA7XG5cdFx0Z3JvdXA/LmxvY2sobG9ja2VkID8/ICFncm91cC5pc0xvY2tlZCk7XG5cdH1cblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IFRPR0dMRV9MT0NLX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZUVkaXRvckdyb3VwTG9jaycsICdUb2dnbGUgRWRpdG9yIEdyb3VwIExvY2snKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0c2V0RWRpdG9yR3JvdXBMb2NrKGFjY2Vzc29yLCB1bmRlZmluZWQsIC4uLmFyZ3MpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBMT0NLX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xvY2tFZGl0b3JHcm91cCcsICdMb2NrIEVkaXRvciBHcm91cCcpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IEFjdGl2ZUVkaXRvckdyb3VwTG9ja2VkQ29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0c2V0RWRpdG9yR3JvdXBMb2NrKGFjY2Vzc29yLCB0cnVlLCAuLi5hcmdzKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogVU5MT0NLX0dST1VQX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3VubG9ja0VkaXRvckdyb3VwJywgJ1VubG9jayBFZGl0b3IgR3JvdXAnKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JHcm91cExvY2tlZENvbnRleHQsXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHNldEVkaXRvckdyb3VwTG9jayhhY2Nlc3NvciwgZmFsc2UsIC4uLmFyZ3MpO1xuXHRcdH1cblx0fSk7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IFBJTl9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyKSxcblx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgZ3JvdXAsIGVkaXRvcnMgfSBvZiByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0XHRcdGdyb3VwLnN0aWNrRWRpdG9yKGVkaXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdGlkOiBVTlBJTl9FRElUT1JfQ09NTUFORF9JRCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiBBY3RpdmVFZGl0b3JTdGlja3lDb250ZXh0LFxuXHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyKSxcblx0XHRoYW5kbGVyOiBhc3luYyAoYWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb250ZXh0ID0gcmVzb2x2ZUNvbW1hbmRzQ29udGV4dChhcmdzLCBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpLCBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKSk7XG5cdFx0XHRmb3IgKGNvbnN0IHsgZ3JvdXAsIGVkaXRvcnMgfSBvZiByZXNvbHZlZENvbnRleHQuZ3JvdXBlZEVkaXRvcnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9ycykge1xuXHRcdFx0XHRcdGdyb3VwLnVuc3RpY2tFZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdFx0aWQ6IFNIT1dfRURJVE9SU19JTl9HUk9VUCxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHR3aGVuOiB1bmRlZmluZWQsXG5cdFx0cHJpbWFyeTogdW5kZWZpbmVkLFxuXHRcdGhhbmRsZXI6IChhY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cblx0XHRcdGNvbnN0IGNvbW1hbmRzQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgZWRpdG9yR3JvdXBzU2VydmljZSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSBjb21tYW5kc0NvbnRleHQuZ3JvdXBlZEVkaXRvcnNbMF0/Lmdyb3VwO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZhdGVHcm91cChncm91cCk7IC8vIHdlIG5lZWQgdGhlIGdyb3VwIHRvIGJlIGFjdGl2ZVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdyhBY3RpdmVHcm91cEVkaXRvcnNCeU1vc3RSZWNlbnRseVVzZWRRdWlja0FjY2Vzcy5QUkVGSVgpO1xuXHRcdH1cblx0fSk7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyTW9kYWxFZGl0b3JDb21tYW5kcygpOiB2b2lkIHtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IE1PVkVfTU9EQUxfRURJVE9SX1RPX01BSU5fQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbW92ZVRvTWFpbldpbmRvdycsICdPcGVuIE1vZGFsIEVkaXRvciBpbiBNYWluIFdpbmRvdycpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5vcGVuSW5Qcm9kdWN0LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IEVkaXRvclBhcnRNb2RhbENvbnRleHQsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk1vZGFsRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0XHR3aGVuOiBJc1Nlc3Npb25zV2luZG93Q29udGV4dC5uZWdhdGUoKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGVkaXRvckdyb3Vwc1NlcnZpY2UucGFydHMpIHtcblx0XHRcdFx0aWYgKGlzTW9kYWxFZGl0b3JQYXJ0KHBhcnQpKSB7XG5cdFx0XHRcdFx0YXdhaXQgcGFydC5jbG9zZSh7IG1lcmdlQWxsRWRpdG9yc1RvTWFpblBhcnQ6IHRydWUgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogTU9WRV9NT0RBTF9FRElUT1JfVE9fV0lORE9XX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21vdmVNb2RhbEVkaXRvclRvV2luZG93JywgJ09wZW4gTW9kYWwgRWRpdG9yIGluIE5ldyBXaW5kb3cnKSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGljb246IENvZGljb24uZW1wdHlXaW5kb3csXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yUGFydE1vZGFsQ29udGV4dCxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLk1vZGFsRWRpdG9yVGl0bGVDb250ZXh0LFxuXHRcdFx0XHRcdGdyb3VwOiAnMV93aW5kb3cnLFxuXHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0XG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGVkaXRvckdyb3Vwc1NlcnZpY2UucGFydHMpIHtcblx0XHRcdFx0aWYgKGlzTW9kYWxFZGl0b3JQYXJ0KHBhcnQpKSB7XG5cdFx0XHRcdFx0Y29uc3QgYXV4aWxpYXJ5RWRpdG9yUGFydCA9IGF3YWl0IGVkaXRvckdyb3Vwc1NlcnZpY2UuY3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydCgpO1xuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBwYXJ0LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSkpIHtcblx0XHRcdFx0XHRcdGdyb3VwLm1vdmVFZGl0b3JzKGdyb3VwLmVkaXRvcnMubWFwKGVkaXRvciA9PiAoeyBlZGl0b3IsIG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9IH0pKSwgYXV4aWxpYXJ5RWRpdG9yUGFydC5hY3RpdmVHcm91cCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YXV4aWxpYXJ5RWRpdG9yUGFydC5hY3RpdmVHcm91cC5mb2N1cygpO1xuXHRcdFx0XHRcdGF3YWl0IHBhcnQuY2xvc2UoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBUT0dHTEVfTU9EQUxfRURJVE9SX1NJREVCQVJfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlTW9kYWxFZGl0b3JTaWRlYmFyJywgJ1RvZ2dsZSBNb2RhbCBFZGl0b3IgU2lkZWJhcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yUGFydE1vZGFsQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsU2lkZWJhckNvbnRleHQpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBlZGl0b3JHcm91cHNTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHRcdGlmIChpc01vZGFsRWRpdG9yUGFydChwYXJ0KSkge1xuXHRcdFx0XHRcdHBhcnQudG9nZ2xlU2lkZWJhcigpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IFRPR0dMRV9NT0RBTF9FRElUT1JfTUFYSU1JWkVEX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3RvZ2dsZU1vZGFsRWRpdG9yTWF4aW1pemVkJywgJ01heGltaXplIE1vZGFsIEVkaXRvcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNjcmVlbkZ1bGwsXG5cdFx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0XHRjb25kaXRpb246IEVkaXRvclBhcnRNb2RhbE1heGltaXplZENvbnRleHQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZXN0b3JlTW9kYWxFZGl0b3JTaXplJywgXCJSZXN0b3JlIE1vZGFsIEVkaXRvclwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Nb2RhbEVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDk5XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBzU2VydmljZS5wYXJ0cykge1xuXHRcdFx0XHRpZiAoaXNNb2RhbEVkaXRvclBhcnQocGFydCkpIHtcblx0XHRcdFx0XHRwYXJ0LnRvZ2dsZU1heGltaXplZCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6IENMT1NFX01PREFMX0VESVRPUl9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZU1vZGFsRWRpdG9yJywgJ0Nsb3NlIE1vZGFsIEVkaXRvcicpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMTAsIC8vIGhpZ2hlciB3aGVuIG5vIHRleHQgZWRpdG9yIG9yIGxpc3QvdHJlZSBpcyBmb2N1c2VkLi4uXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLnRvTmVnYXRlZCgpLCBSYXdXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5Lm5lZ2F0ZSgpKVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgLSAxLCAvLyAuLi5sb3dlciB0byBwcmV2ZW50IGFjY2lkZW50YWwgY2xvc2Ugd2hlbiB0ZXh0IGVkaXRvciBpcyBmb2N1c2VkXG5cdFx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMuZm9jdXNcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdFx0XHRcdC8vIFdoZW4gYSBsaXN0L3RyZWUgaXMgZm9jdXNlZCwgc3RpbGwgY2xvc2UgdGhlIG1vZGFsLCBidXQgeWllbGQgdG8gdGhlXG5cdFx0XHRcdFx0Ly8gbGlzdC90cmVlJ3Mgb3duIGBFc2NhcGVgIGZlYXR1cmVzIHRoYXQgc2hvdWxkIGNsb3NlIGZpcnN0ICh0aGUgZmluZFxuXHRcdFx0XHRcdC8vIHdpZGdldCBhbmQgc3RpY2t5IHNjcm9sbCkuIFRoZSBzZWxlY3Rpb24gaXMgaW50ZW50aW9uYWxseSBub3QgY2xlYXJlZFxuXHRcdFx0XHRcdC8vIGZpcnN0IHNvIGEgc2luZ2xlIGBFc2NhcGVgIGNsb3NlcyB0aGUgbW9kYWwuXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChSYXdXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hUcmVlRmluZE9wZW4ubmVnYXRlKCksIFdvcmtiZW5jaFRyZWVTdGlja3lTY3JvbGxGb2N1c2VkLm5lZ2F0ZSgpKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTW9kYWxFZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxMDBcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBlZGl0b3JHcm91cHNTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHRcdGlmIChpc01vZGFsRWRpdG9yUGFydChwYXJ0KSkge1xuXHRcdFx0XHRcdGF3YWl0IHBhcnQuY2xvc2UoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBOQVZJR0FURV9NT0RBTF9FRElUT1JfUFJFVklPVVNfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbmF2aWdhdGVNb2RhbEVkaXRvclByZXZpb3VzJywgJ05hdmlnYXRlIHRvIFByZXZpb3VzIEl0ZW0gaW4gTW9kYWwgRWRpdG9yJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvclBhcnRNb2RhbENvbnRleHQsIEVkaXRvclBhcnRNb2RhbE5hdmlnYXRpb25Db250ZXh0KSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yUGFydE1vZGFsQ29udGV4dCwgRWRpdG9yUGFydE1vZGFsTmF2aWdhdGlvbkNvbnRleHQpXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZWRpdG9yR3JvdXBzU2VydmljZS5wYXJ0cykge1xuXHRcdFx0XHRpZiAoaXNNb2RhbEVkaXRvclBhcnQocGFydCkpIHtcblx0XHRcdFx0XHRjb25zdCBuYXYgPSBwYXJ0Lm5hdmlnYXRpb247XG5cdFx0XHRcdFx0aWYgKG5hdiAmJiBuYXYuY3VycmVudCA+IDApIHtcblx0XHRcdFx0XHRcdG5hdi5uYXZpZ2F0ZShuYXYuY3VycmVudCAtIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBOQVZJR0FURV9NT0RBTF9FRElUT1JfTkVYVF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCduYXZpZ2F0ZU1vZGFsRWRpdG9yTmV4dCcsICdOYXZpZ2F0ZSB0byBOZXh0IEl0ZW0gaW4gTW9kYWwgRWRpdG9yJyksXG5cdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvclBhcnRNb2RhbENvbnRleHQsIEVkaXRvclBhcnRNb2RhbE5hdmlnYXRpb25Db250ZXh0KSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JQYXJ0TW9kYWxDb250ZXh0LCBFZGl0b3JQYXJ0TW9kYWxOYXZpZ2F0aW9uQ29udGV4dClcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBlZGl0b3JHcm91cHNTZXJ2aWNlLnBhcnRzKSB7XG5cdFx0XHRcdGlmIChpc01vZGFsRWRpdG9yUGFydChwYXJ0KSkge1xuXHRcdFx0XHRcdGNvbnN0IG5hdiA9IHBhcnQubmF2aWdhdGlvbjtcblx0XHRcdFx0XHRpZiAobmF2ICYmIG5hdi5jdXJyZW50IDwgbmF2LnRvdGFsIC0gMSkge1xuXHRcdFx0XHRcdFx0bmF2Lm5hdmlnYXRlKG5hdi5jdXJyZW50ICsgMSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gaXNNb2RhbEVkaXRvclBhcnQob2JqOiB1bmtub3duKTogb2JqIGlzIElNb2RhbEVkaXRvclBhcnQge1xuXHRjb25zdCBwYXJ0ID0gb2JqIGFzIElNb2RhbEVkaXRvclBhcnQgfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuICEhcGFydFxuXHRcdCYmIHR5cGVvZiBwYXJ0LmNsb3NlID09PSAnZnVuY3Rpb24nXG5cdFx0JiYgdHlwZW9mIHBhcnQub25XaWxsQ2xvc2UgPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2YgcGFydC50b2dnbGVNYXhpbWl6ZWQgPT09ICdmdW5jdGlvbidcblx0XHQmJiB0eXBlb2YgcGFydC5tYXhpbWl6ZWQgPT09ICdib29sZWFuJ1xuXHRcdCYmIHR5cGVvZiBwYXJ0LnVwZGF0ZU9wdGlvbnMgPT09ICdmdW5jdGlvbidcblx0XHQmJiAhIXBhcnQubW9kYWxFbGVtZW50XG5cdFx0JiYgcGFydC53aW5kb3dJZCA9PT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldHVwKCk6IHZvaWQge1xuXHRyZWdpc3RlckVkaXRvck1vdmVDb3B5Q29tbWFuZCgpO1xuXHRyZWdpc3RlckVkaXRvckdyb3Vwc0xheW91dENvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyRGlmZkVkaXRvckNvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyT3BlbkVkaXRvckFQSUNvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyT3BlbkVkaXRvckF0SW5kZXhDb21tYW5kcygpO1xuXHRyZWdpc3RlckNsb3NlRWRpdG9yQ29tbWFuZHMoKTtcblx0cmVnaXN0ZXJPdGhlckVkaXRvckNvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyU3BsaXRFZGl0b3JJbkdyb3VwQ29tbWFuZHMoKTtcblx0cmVnaXN0ZXJGb2N1c1NpZGVFZGl0b3JzQ29tbWFuZHMoKTtcblx0cmVnaXN0ZXJGb2N1c0VkaXRvckdyb3VwQXRJbmRleENvbW1hbmRzKCk7XG5cdHJlZ2lzdGVyU3BsaXRFZGl0b3JDb21tYW5kcygpO1xuXHRyZWdpc3RlckZvY3VzRWRpdG9yR3JvdXBXaWhvdXRXcmFwQ29tbWFuZHMoKTtcblx0cmVnaXN0ZXJNb2RhbEVkaXRvckNvbW1hbmRzKCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMsU0FBUyxxQkFBcUI7QUFDdkMsU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyxVQUFVLFVBQVUsVUFBVSxtQkFBbUI7QUFDMUQsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxrQkFBbUMsdUJBQXVCO0FBQ25FLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQWtGO0FBQzNGLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsa0JBQWtCLDJCQUEyQjtBQUN0RCxTQUFTLGNBQTBCLGlDQUFpQyx1QkFBdUIsd0NBQXdDO0FBQ25JLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdURBQXVEO0FBQ2hFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0NBQW9DLCtCQUErQixnQ0FBZ0MsMkJBQTJCLHdCQUF3QixpQ0FBaUMsa0NBQWtDLCtCQUErQix5QkFBeUIsNkJBQTZCLCtCQUErQixzQ0FBc0M7QUFDNVgsU0FBUyxnQkFBZ0IseUJBQXlCLGNBQTBFLG1CQUFtQix3Q0FBd0M7QUFFdkwsU0FBUyw2QkFBNkI7QUFDdEMsU0FB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
