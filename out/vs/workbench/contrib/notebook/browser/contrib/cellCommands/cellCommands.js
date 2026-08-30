import { KeyChord, KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Mimes } from "../../../../../../base/common/mime.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../../editor/browser/services/bulkEditService.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext, InputFocusedContextKey } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ResourceNotebookCellEdit } from "../../../../bulkEdit/browser/bulkCellEdits.js";
import { changeCellToKind, computeCellLinesContents, copyCellRange, joinCellsWithSurrounds, joinSelectedCells, moveCellRange } from "../../controller/cellOperations.js";
import { cellExecutionArgs, CellOverflowToolbarGroups, CellToolbarOrder, CELL_TITLE_CELL_GROUP_ID, NotebookCellAction, NotebookMultiCellAction, parseMultiCellExecutionArgs } from "../../controller/coreActions.js";
import { CellFocusMode, EXPAND_CELL_INPUT_COMMAND_ID, EXPAND_CELL_OUTPUT_COMMAND_ID } from "../../notebookBrowser.js";
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_INPUT_COLLAPSED, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_OUTPUT_FOCUSED } from "../../../common/notebookContextKeys.js";
import * as icons from "../../notebookIcons.js";
import { CellEditType, CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
const MOVE_CELL_UP_COMMAND_ID = "notebook.cell.moveUp";
const MOVE_CELL_DOWN_COMMAND_ID = "notebook.cell.moveDown";
const COPY_CELL_UP_COMMAND_ID = "notebook.cell.copyUp";
const COPY_CELL_DOWN_COMMAND_ID = "notebook.cell.copyDown";
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: MOVE_CELL_UP_COMMAND_ID,
        title: localize2("notebookActions.moveCellUp", "Move Cell Up"),
        icon: icons.moveUpIcon,
        keybinding: {
          primary: KeyMod.Alt | KeyCode.UpArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.equals("config.notebook.dragAndDropEnabled", false),
          group: CellOverflowToolbarGroups.Edit,
          order: 14
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return moveCellRange(context, "up");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: MOVE_CELL_DOWN_COMMAND_ID,
        title: localize2("notebookActions.moveCellDown", "Move Cell Down"),
        icon: icons.moveDownIcon,
        keybinding: {
          primary: KeyMod.Alt | KeyCode.DownArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.equals("config.notebook.dragAndDropEnabled", false),
          group: CellOverflowToolbarGroups.Edit,
          order: 14
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return moveCellRange(context, "down");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: COPY_CELL_UP_COMMAND_ID,
        title: localize2("notebookActions.copyCellUp", "Copy Cell Up"),
        keybinding: {
          primary: KeyMod.Alt | KeyMod.Shift | KeyCode.UpArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return copyCellRange(context, "up");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: COPY_CELL_DOWN_COMMAND_ID,
        title: localize2("notebookActions.copyCellDown", "Copy Cell Down"),
        keybinding: {
          primary: KeyMod.Alt | KeyMod.Shift | KeyCode.DownArrow,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, InputFocusedContext.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 13
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    return copyCellRange(context, "down");
  }
});
const SPLIT_CELL_COMMAND_ID = "notebook.cell.split";
const JOIN_SELECTED_CELLS_COMMAND_ID = "notebook.cell.joinSelected";
const JOIN_CELL_ABOVE_COMMAND_ID = "notebook.cell.joinAbove";
const JOIN_CELL_BELOW_COMMAND_ID = "notebook.cell.joinBelow";
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: SPLIT_CELL_COMMAND_ID,
        title: localize2("notebookActions.splitCell", "Split Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_EDITABLE,
            NOTEBOOK_CELL_EDITABLE,
            NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated()
          ),
          order: CellToolbarOrder.SplitCell,
          group: CELL_TITLE_CELL_GROUP_ID
        },
        icon: icons.splitCellIcon,
        keybinding: {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, EditorContextKeys.editorTextFocus),
          primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash),
          weight: KeybindingWeight.WorkbenchContrib
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    if (context.notebookEditor.isReadOnly) {
      return;
    }
    const bulkEditService = accessor.get(IBulkEditService);
    const cell = context.cell;
    const index = context.notebookEditor.getCellIndex(cell);
    const splitPoints = cell.focusMode === CellFocusMode.Container ? [{ lineNumber: 1, column: 1 }] : cell.getSelectionsStartPosition();
    if (splitPoints && splitPoints.length > 0) {
      await cell.resolveTextModel();
      if (!cell.hasModel()) {
        return;
      }
      const newLinesContents = computeCellLinesContents(cell, splitPoints);
      if (newLinesContents) {
        const language = cell.language;
        const kind = cell.cellKind;
        const mime = cell.mime;
        const textModel = await cell.resolveTextModel();
        await bulkEditService.apply(
          [
            new ResourceTextEdit(cell.uri, { range: textModel.getFullModelRange(), text: newLinesContents[0] }),
            new ResourceNotebookCellEdit(
              context.notebookEditor.textModel.uri,
              {
                editType: CellEditType.Replace,
                index: index + 1,
                count: 0,
                cells: newLinesContents.slice(1).map((line) => ({
                  cellKind: kind,
                  language,
                  mime,
                  source: line,
                  outputs: [],
                  metadata: {}
                }))
              }
            )
          ],
          { quotableLabel: "Split Notebook Cell" }
        );
        context.notebookEditor.cellAt(index + 1)?.updateEditState(cell.getEditState(), "splitCell");
      }
    }
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: JOIN_CELL_ABOVE_COMMAND_ID,
        title: localize2("notebookActions.joinCellAbove", "Join With Previous Cell"),
        keybinding: {
          when: NOTEBOOK_EDITOR_FOCUSED,
          primary: KeyMod.WinCtrl | KeyMod.Alt | KeyMod.Shift | KeyCode.KeyJ,
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 10
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const bulkEditService = accessor.get(IBulkEditService);
    return joinCellsWithSurrounds(bulkEditService, context, "above");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: JOIN_CELL_BELOW_COMMAND_ID,
        title: localize2("notebookActions.joinCellBelow", "Join With Next Cell"),
        keybinding: {
          when: NOTEBOOK_EDITOR_FOCUSED,
          primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyJ,
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 11
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const bulkEditService = accessor.get(IBulkEditService);
    return joinCellsWithSurrounds(bulkEditService, context, "below");
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super(
      {
        id: JOIN_SELECTED_CELLS_COMMAND_ID,
        title: localize2("notebookActions.joinSelectedCells", "Join Selected Cells"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE),
          group: CellOverflowToolbarGroups.Edit,
          order: 12
        }
      }
    );
  }
  async runWithContext(accessor, context) {
    const bulkEditService = accessor.get(IBulkEditService);
    const notificationService = accessor.get(INotificationService);
    return joinSelectedCells(bulkEditService, notificationService, context);
  }
});
const CHANGE_CELL_TO_CODE_COMMAND_ID = "notebook.cell.changeToCode";
const CHANGE_CELL_TO_MARKDOWN_COMMAND_ID = "notebook.cell.changeToMarkdown";
registerAction2(class ChangeCellToCodeAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: CHANGE_CELL_TO_CODE_COMMAND_ID,
      title: localize2("notebookActions.changeCellToCode", "Change Cell to Code"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_FOCUSED.toNegated()),
        primary: KeyCode.KeyY,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo("markup")),
      menu: {
        id: MenuId.NotebookCellTitle,
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo("markup")),
        group: CellOverflowToolbarGroups.Edit
      }
    });
  }
  async runWithContext(accessor, context) {
    await changeCellToKind(CellKind.Code, context);
  }
});
registerAction2(class ChangeCellToMarkdownAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: CHANGE_CELL_TO_MARKDOWN_COMMAND_ID,
      title: localize2("notebookActions.changeCellToMarkdown", "Change Cell to Markdown"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_FOCUSED.toNegated()),
        primary: KeyCode.KeyM,
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_CELL_TYPE.isEqualTo("code")),
      menu: {
        id: MenuId.NotebookCellTitle,
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_TYPE.isEqualTo("code")),
        group: CellOverflowToolbarGroups.Edit
      }
    });
  }
  async runWithContext(accessor, context) {
    await changeCellToKind(CellKind.Markup, context, "markdown", Mimes.markdown);
  }
});
const COLLAPSE_CELL_INPUT_COMMAND_ID = "notebook.cell.collapseCellInput";
const COLLAPSE_CELL_OUTPUT_COMMAND_ID = "notebook.cell.collapseCellOutput";
const COLLAPSE_ALL_CELL_INPUTS_COMMAND_ID = "notebook.cell.collapseAllCellInputs";
const EXPAND_ALL_CELL_INPUTS_COMMAND_ID = "notebook.cell.expandAllCellInputs";
const COLLAPSE_ALL_CELL_OUTPUTS_COMMAND_ID = "notebook.cell.collapseAllCellOutputs";
const EXPAND_ALL_CELL_OUTPUTS_COMMAND_ID = "notebook.cell.expandAllCellOutputs";
const TOGGLE_CELL_OUTPUTS_COMMAND_ID = "notebook.cell.toggleOutputs";
const TOGGLE_CELL_OUTPUT_SCROLLING = "notebook.cell.toggleOutputScrolling";
registerAction2(class CollapseCellInputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_CELL_INPUT_COMMAND_ID,
      title: localize2("notebookActions.collapseCellInput", "Collapse Cell Input"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated()),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isInputCollapsed = true;
    } else {
      context.selectedCells.forEach((cell) => cell.isInputCollapsed = true);
    }
  }
});
registerAction2(class ExpandCellInputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_CELL_INPUT_COMMAND_ID,
      title: localize2("notebookActions.expandCellInput", "Expand Cell Input"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_INPUT_COLLAPSED),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyC),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isInputCollapsed = false;
    } else {
      context.selectedCells.forEach((cell) => cell.isInputCollapsed = false);
    }
  }
});
registerAction2(class CollapseCellOutputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_CELL_OUTPUT_COMMAND_ID,
      title: localize2("notebookActions.collapseCellOutput", "Collapse Cell Output"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED.toNegated(), InputFocusedContext.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyT),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isOutputCollapsed = true;
    } else {
      context.selectedCells.forEach((cell) => cell.isOutputCollapsed = true);
    }
  }
});
registerAction2(class ExpandCellOuputAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_CELL_OUTPUT_COMMAND_ID,
      title: localize2("notebookActions.expandCellOutput", "Expand Cell Output"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_OUTPUT_COLLAPSED),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyT),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      context.cell.isOutputCollapsed = false;
    } else {
      context.selectedCells.forEach((cell) => cell.isOutputCollapsed = false);
    }
  }
});
registerAction2(class extends NotebookMultiCellAction {
  constructor() {
    super({
      id: TOGGLE_CELL_OUTPUTS_COMMAND_ID,
      precondition: NOTEBOOK_CELL_LIST_FOCUSED,
      title: localize2("notebookActions.toggleOutputs", "Toggle Outputs"),
      metadata: {
        description: localize("notebookActions.toggleOutputs", "Toggle Outputs"),
        args: cellExecutionArgs
      }
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    let cells = [];
    if (context.ui) {
      cells = [context.cell];
    } else if (context.selectedCells) {
      cells = context.selectedCells;
    }
    for (const cell of cells) {
      cell.isOutputCollapsed = !cell.isOutputCollapsed;
    }
  }
});
registerAction2(class CollapseAllCellInputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_ALL_CELL_INPUTS_COMMAND_ID,
      title: localize2("notebookActions.collapseAllCellInput", "Collapse All Cell Inputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isInputCollapsed = true);
  }
});
registerAction2(class ExpandAllCellInputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_ALL_CELL_INPUTS_COMMAND_ID,
      title: localize2("notebookActions.expandAllCellInput", "Expand All Cell Inputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isInputCollapsed = false);
  }
});
registerAction2(class CollapseAllCellOutputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COLLAPSE_ALL_CELL_OUTPUTS_COMMAND_ID,
      title: localize2("notebookActions.collapseAllCellOutput", "Collapse All Cell Outputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isOutputCollapsed = true);
  }
});
registerAction2(class ExpandAllCellOutputsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXPAND_ALL_CELL_OUTPUTS_COMMAND_ID,
      title: localize2("notebookActions.expandAllCellOutput", "Expand All Cell Outputs"),
      f1: true
    });
  }
  async runWithContext(accessor, context) {
    forEachCell(context.notebookEditor, (cell) => cell.isOutputCollapsed = false);
  }
});
registerAction2(class ToggleCellOutputScrolling extends NotebookMultiCellAction {
  constructor() {
    super({
      id: TOGGLE_CELL_OUTPUT_SCROLLING,
      title: localize2("notebookActions.toggleScrolling", "Toggle Scroll Cell Output"),
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_CELL_LIST_FOCUSED, InputFocusedContext.toNegated(), NOTEBOOK_CELL_HAS_OUTPUTS),
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyY),
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  toggleOutputScrolling(viewModel, globalScrollSetting, collapsed) {
    const cellMetadata = viewModel.model.metadata;
    if (cellMetadata) {
      const currentlyEnabled = cellMetadata["scrollable"] !== void 0 ? cellMetadata["scrollable"] : globalScrollSetting;
      const shouldEnableScrolling = collapsed || !currentlyEnabled;
      cellMetadata["scrollable"] = shouldEnableScrolling;
      viewModel.resetRenderer();
    }
  }
  async runWithContext(accessor, context) {
    const globalScrolling = accessor.get(IConfigurationService).getValue(NotebookSetting.outputScrolling);
    if (context.ui) {
      context.cell.outputsViewModels.forEach((viewModel) => {
        this.toggleOutputScrolling(viewModel, globalScrolling, context.cell.isOutputCollapsed);
      });
      context.cell.isOutputCollapsed = false;
    } else {
      context.selectedCells.forEach((cell) => {
        cell.outputsViewModels.forEach((viewModel) => {
          this.toggleOutputScrolling(viewModel, globalScrolling, cell.isOutputCollapsed);
        });
        cell.isOutputCollapsed = false;
      });
    }
  }
});
function forEachCell(editor, callback) {
  for (let i = 0; i < editor.getLength(); i++) {
    const cell = editor.cellAt(i);
    callback(cell, i);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxjZWxsQ29tbWFuZHNcXGNlbGxDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dCwgSW5wdXRGb2N1c2VkQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2J1bGtFZGl0L2Jyb3dzZXIvYnVsa0NlbGxFZGl0cy5qcyc7XG5pbXBvcnQgeyBjaGFuZ2VDZWxsVG9LaW5kLCBjb21wdXRlQ2VsbExpbmVzQ29udGVudHMsIGNvcHlDZWxsUmFuZ2UsIGpvaW5DZWxsc1dpdGhTdXJyb3VuZHMsIGpvaW5TZWxlY3RlZENlbGxzLCBtb3ZlQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jZWxsT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBjZWxsRXhlY3V0aW9uQXJncywgQ2VsbE92ZXJmbG93VG9vbGJhckdyb3VwcywgQ2VsbFRvb2xiYXJPcmRlciwgQ0VMTF9USVRMRV9DRUxMX0dST1VQX0lELCBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0LCBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCwgTm90ZWJvb2tDZWxsQWN0aW9uLCBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiwgcGFyc2VNdWx0aUNlbGxFeGVjdXRpb25BcmdzIH0gZnJvbSAnLi4vLi4vY29udHJvbGxlci9jb3JlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRm9jdXNNb2RlLCBFWFBBTkRfQ0VMTF9JTlBVVF9DT01NQU5EX0lELCBFWFBBTkRfQ0VMTF9PVVRQVVRfQ09NTUFORF9JRCwgSUNlbGxPdXRwdXRWaWV3TW9kZWwsIElDZWxsVmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfQ0VMTF9FRElUQUJMRSwgTk9URUJPT0tfQ0VMTF9IQVNfT1VUUFVUUywgTk9URUJPT0tfQ0VMTF9JTlBVVF9DT0xMQVBTRUQsIE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBOT1RFQk9PS19DRUxMX09VVFBVVF9DT0xMQVBTRUQsIE5PVEVCT09LX0NFTExfVFlQRSwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUiwgTk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgKiBhcyBpY29ucyBmcm9tICcuLi8uLi9ub3RlYm9va0ljb25zLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcblxuLy8jcmVnaW9uIE1vdmUvQ29weSBjZWxsc1xuY29uc3QgTU9WRV9DRUxMX1VQX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5tb3ZlVXAnO1xuY29uc3QgTU9WRV9DRUxMX0RPV05fQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLm1vdmVEb3duJztcbmNvbnN0IENPUFlfQ0VMTF9VUF9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY29weVVwJztcbmNvbnN0IENPUFlfQ0VMTF9ET1dOX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jb3B5RG93bic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTU9WRV9DRUxMX1VQX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5tb3ZlQ2VsbFVwJywgXCJNb3ZlIENlbGwgVXBcIiksXG5cdFx0XHRcdGljb246IGljb25zLm1vdmVVcEljb24sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2suZHJhZ0FuZERyb3BFbmFibGVkJywgZmFsc2UpLFxuXHRcdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDE0XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0cmV0dXJuIG1vdmVDZWxsUmFuZ2UoY29udGV4dCwgJ3VwJyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IE1PVkVfQ0VMTF9ET1dOX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5tb3ZlQ2VsbERvd24nLCBcIk1vdmUgQ2VsbCBEb3duXCIpLFxuXHRcdFx0XHRpY29uOiBpY29ucy5tb3ZlRG93bkljb24sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBJbnB1dEZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5kcmFnQW5kRHJvcEVuYWJsZWQnLCBmYWxzZSksXG5cdFx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuRWRpdCxcblx0XHRcdFx0XHRvcmRlcjogMTRcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRyZXR1cm4gbW92ZUNlbGxSYW5nZShjb250ZXh0LCAnZG93bicpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBDT1BZX0NFTExfVVBfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmNvcHlDZWxsVXAnLCBcIkNvcHkgQ2VsbCBVcFwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBJbnB1dEZvY3VzZWRDb250ZXh0LnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdHJldHVybiBjb3B5Q2VsbFJhbmdlKGNvbnRleHQsICd1cCcpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBDT1BZX0NFTExfRE9XTl9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuY29weUNlbGxEb3duJywgXCJDb3B5IENlbGwgRG93blwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIElucHV0Rm9jdXNlZENvbnRleHQudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0VESVRBQkxFKSxcblx0XHRcdFx0XHRncm91cDogQ2VsbE92ZXJmbG93VG9vbGJhckdyb3Vwcy5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAxM1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdHJldHVybiBjb3B5Q2VsbFJhbmdlKGNvbnRleHQsICdkb3duJyk7XG5cdH1cbn0pO1xuXG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gSm9pbi9TcGxpdFxuXG5jb25zdCBTUExJVF9DRUxMX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5zcGxpdCc7XG5jb25zdCBKT0lOX1NFTEVDVEVEX0NFTExTX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5qb2luU2VsZWN0ZWQnO1xuY29uc3QgSk9JTl9DRUxMX0FCT1ZFX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5qb2luQWJvdmUnO1xuY29uc3QgSk9JTl9DRUxMX0JFTE9XX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5qb2luQmVsb3cnO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogU1BMSVRfQ0VMTF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuc3BsaXRDZWxsJywgXCJTcGxpdCBDZWxsXCIpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRURJVEFCTEUsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0VESVRBQkxFLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9JTlBVVF9DT0xMQVBTRUQudG9OZWdhdGVkKClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdG9yZGVyOiBDZWxsVG9vbGJhck9yZGVyLlNwbGl0Q2VsbCxcblx0XHRcdFx0XHRncm91cDogQ0VMTF9USVRMRV9DRUxMX0dST1VQX0lEXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGljb246IGljb25zLnNwbGl0Q2VsbEljb24sXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgTk9URUJPT0tfQ0VMTF9FRElUQUJMRSwgRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzKSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJhY2tzbGFzaCksXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0aWYgKGNvbnRleHQubm90ZWJvb2tFZGl0b3IuaXNSZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQnVsa0VkaXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjZWxsID0gY29udGV4dC5jZWxsO1xuXHRcdGNvbnN0IGluZGV4ID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoY2VsbCk7XG5cdFx0Y29uc3Qgc3BsaXRQb2ludHMgPSBjZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5Db250YWluZXIgPyBbeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfV0gOiBjZWxsLmdldFNlbGVjdGlvbnNTdGFydFBvc2l0aW9uKCk7XG5cdFx0aWYgKHNwbGl0UG9pbnRzICYmIHNwbGl0UG9pbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGF3YWl0IGNlbGwucmVzb2x2ZVRleHRNb2RlbCgpO1xuXG5cdFx0XHRpZiAoIWNlbGwuaGFzTW9kZWwoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG5ld0xpbmVzQ29udGVudHMgPSBjb21wdXRlQ2VsbExpbmVzQ29udGVudHMoY2VsbCwgc3BsaXRQb2ludHMpO1xuXHRcdFx0aWYgKG5ld0xpbmVzQ29udGVudHMpIHtcblx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2UgPSBjZWxsLmxhbmd1YWdlO1xuXHRcdFx0XHRjb25zdCBraW5kID0gY2VsbC5jZWxsS2luZDtcblx0XHRcdFx0Y29uc3QgbWltZSA9IGNlbGwubWltZTtcblxuXHRcdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBhd2FpdCBjZWxsLnJlc29sdmVUZXh0TW9kZWwoKTtcblx0XHRcdFx0YXdhaXQgYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdG5ldyBSZXNvdXJjZVRleHRFZGl0KGNlbGwudXJpLCB7IHJhbmdlOiB0ZXh0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdGV4dDogbmV3TGluZXNDb250ZW50c1swXSB9KSxcblx0XHRcdFx0XHRcdG5ldyBSZXNvdXJjZU5vdGVib29rQ2VsbEVkaXQoY29udGV4dC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwudXJpLFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLFxuXHRcdFx0XHRcdFx0XHRcdGluZGV4OiBpbmRleCArIDEsXG5cdFx0XHRcdFx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdFx0XHRcdFx0Y2VsbHM6IG5ld0xpbmVzQ29udGVudHMuc2xpY2UoMSkubWFwKGxpbmUgPT4gKHtcblx0XHRcdFx0XHRcdFx0XHRcdGNlbGxLaW5kOiBraW5kLFxuXHRcdFx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRtaW1lLFxuXHRcdFx0XHRcdFx0XHRcdFx0c291cmNlOiBsaW5lLFxuXHRcdFx0XHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRcdFx0XHRtZXRhZGF0YToge31cblx0XHRcdFx0XHRcdFx0XHR9KSlcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0eyBxdW90YWJsZUxhYmVsOiAnU3BsaXQgTm90ZWJvb2sgQ2VsbCcgfVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGNvbnRleHQubm90ZWJvb2tFZGl0b3IuY2VsbEF0KGluZGV4ICsgMSk/LnVwZGF0ZUVkaXRTdGF0ZShjZWxsLmdldEVkaXRTdGF0ZSgpLCAnc3BsaXRDZWxsJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IEpPSU5fQ0VMTF9BQk9WRV9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuam9pbkNlbGxBYm92ZScsIFwiSm9pbiBXaXRoIFByZXZpb3VzIENlbGxcIiksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3aGVuOiBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUosXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUpLFxuXHRcdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDEwXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdHJldHVybiBqb2luQ2VsbHNXaXRoU3Vycm91bmRzKGJ1bGtFZGl0U2VydmljZSwgY29udGV4dCwgJ2Fib3ZlJyk7XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogSk9JTl9DRUxMX0JFTE9XX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5qb2luQ2VsbEJlbG93JywgXCJKb2luIFdpdGggTmV4dCBDZWxsXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2hlbjogTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlKLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFKSxcblx0XHRcdFx0XHRncm91cDogQ2VsbE92ZXJmbG93VG9vbGJhckdyb3Vwcy5FZGl0LFxuXHRcdFx0XHRcdG9yZGVyOiAxMVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQnVsa0VkaXRTZXJ2aWNlKTtcblx0XHRyZXR1cm4gam9pbkNlbGxzV2l0aFN1cnJvdW5kcyhidWxrRWRpdFNlcnZpY2UsIGNvbnRleHQsICdiZWxvdycpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBKT0lOX1NFTEVDVEVEX0NFTExTX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5qb2luU2VsZWN0ZWRDZWxscycsIFwiSm9pbiBTZWxlY3RlZCBDZWxsc1wiKSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUpLFxuXHRcdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkVkaXQsXG5cdFx0XHRcdFx0b3JkZXI6IDEyXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdHJldHVybiBqb2luU2VsZWN0ZWRDZWxscyhidWxrRWRpdFNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIGNvbnRleHQpO1xuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBDaGFuZ2UgQ2VsbCBUeXBlXG5cbmNvbnN0IENIQU5HRV9DRUxMX1RPX0NPREVfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmNoYW5nZVRvQ29kZSc7XG5jb25zdCBDSEFOR0VfQ0VMTF9UT19NQVJLRE9XTl9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY2hhbmdlVG9NYXJrZG93bic7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDaGFuZ2VDZWxsVG9Db2RlQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ0hBTkdFX0NFTExfVE9fQ09ERV9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmNoYW5nZUNlbGxUb0NvZGUnLCBcIkNoYW5nZSBDZWxsIHRvIENvZGVcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpLCBOT1RFQk9PS19PVVRQVVRfRk9DVVNFRC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuS2V5WSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLCBOT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdtYXJrdXAnKSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdtYXJrdXAnKSksXG5cdFx0XHRcdGdyb3VwOiBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzLkVkaXQsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBjaGFuZ2VDZWxsVG9LaW5kKENlbGxLaW5kLkNvZGUsIGNvbnRleHQpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENoYW5nZUNlbGxUb01hcmtkb3duQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ0hBTkdFX0NFTExfVE9fTUFSS0RPV05fQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5jaGFuZ2VDZWxsVG9NYXJrZG93bicsIFwiQ2hhbmdlIENlbGwgdG8gTWFya2Rvd25cIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpLCBOT1RFQk9PS19PVVRQVVRfRk9DVVNFRC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuS2V5TSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLCBOT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdjb2RlJykpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgTk9URUJPT0tfQ0VMTF9FRElUQUJMRSwgTk9URUJPT0tfQ0VMTF9UWVBFLmlzRXF1YWxUbygnY29kZScpKSxcblx0XHRcdFx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuRWRpdCxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IGNoYW5nZUNlbGxUb0tpbmQoQ2VsbEtpbmQuTWFya3VwLCBjb250ZXh0LCAnbWFya2Rvd24nLCBNaW1lcy5tYXJrZG93bik7XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIENvbGxhcHNlIENlbGxcblxuY29uc3QgQ09MTEFQU0VfQ0VMTF9JTlBVVF9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY29sbGFwc2VDZWxsSW5wdXQnO1xuY29uc3QgQ09MTEFQU0VfQ0VMTF9PVVRQVVRfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmNvbGxhcHNlQ2VsbE91dHB1dCc7XG5jb25zdCBDT0xMQVBTRV9BTExfQ0VMTF9JTlBVVFNfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmNvbGxhcHNlQWxsQ2VsbElucHV0cyc7XG5jb25zdCBFWFBBTkRfQUxMX0NFTExfSU5QVVRTX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5leHBhbmRBbGxDZWxsSW5wdXRzJztcbmNvbnN0IENPTExBUFNFX0FMTF9DRUxMX09VVFBVVFNfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmNvbGxhcHNlQWxsQ2VsbE91dHB1dHMnO1xuY29uc3QgRVhQQU5EX0FMTF9DRUxMX09VVFBVVFNfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmV4cGFuZEFsbENlbGxPdXRwdXRzJztcbmNvbnN0IFRPR0dMRV9DRUxMX09VVFBVVFNfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLnRvZ2dsZU91dHB1dHMnO1xuY29uc3QgVE9HR0xFX0NFTExfT1VUUFVUX1NDUk9MTElORyA9ICdub3RlYm9vay5jZWxsLnRvZ2dsZU91dHB1dFNjcm9sbGluZyc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb2xsYXBzZUNlbGxJbnB1dEFjdGlvbiBleHRlbmRzIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENPTExBUFNFX0NFTExfSU5QVVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5jb2xsYXBzZUNlbGxJbnB1dCcsIFwiQ29sbGFwc2UgQ2VsbCBJbnB1dFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBOT1RFQk9PS19DRUxMX0lOUFVUX0NPTExBUFNFRC50b05lZ2F0ZWQoKSwgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QyksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBwYXJzZUFyZ3MoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gcGFyc2VNdWx0aUNlbGxFeGVjdXRpb25BcmdzKGFjY2Vzc29yLCAuLi5hcmdzKTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0LnVpKSB7XG5cdFx0XHRjb250ZXh0LmNlbGwuaXNJbnB1dENvbGxhcHNlZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRleHQuc2VsZWN0ZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4gY2VsbC5pc0lucHV0Q29sbGFwc2VkID0gdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4cGFuZENlbGxJbnB1dEFjdGlvbiBleHRlbmRzIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVYUEFORF9DRUxMX0lOUFVUX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuZXhwYW5kQ2VsbElucHV0JywgXCJFeHBhbmQgQ2VsbCBJbnB1dFwiKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBOT1RFQk9PS19DRUxMX0lOUFVUX0NPTExBUFNFRCksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QyksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBwYXJzZUFyZ3MoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gcGFyc2VNdWx0aUNlbGxFeGVjdXRpb25BcmdzKGFjY2Vzc29yLCAuLi5hcmdzKTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0LnVpKSB7XG5cdFx0XHRjb250ZXh0LmNlbGwuaXNJbnB1dENvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250ZXh0LnNlbGVjdGVkQ2VsbHMuZm9yRWFjaChjZWxsID0+IGNlbGwuaXNJbnB1dENvbGxhcHNlZCA9IGZhbHNlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29sbGFwc2VDZWxsT3V0cHV0QWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09MTEFQU0VfQ0VMTF9PVVRQVVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5jb2xsYXBzZUNlbGxPdXRwdXQnLCBcIkNvbGxhcHNlIENlbGwgT3V0cHV0XCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfQ0VMTF9MSVNUX0ZPQ1VTRUQsIE5PVEVCT09LX0NFTExfT1VUUFVUX0NPTExBUFNFRC50b05lZ2F0ZWQoKSwgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSwgTk9URUJPT0tfQ0VMTF9IQVNfT1VUUFVUUyksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleVQpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRcdGNvbnRleHQuY2VsbC5pc091dHB1dENvbGxhcHNlZCA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRleHQuc2VsZWN0ZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4gY2VsbC5pc091dHB1dENvbGxhcHNlZCA9IHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFeHBhbmRDZWxsT3VwdXRBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFWFBBTkRfQ0VMTF9PVVRQVVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5leHBhbmRDZWxsT3V0cHV0JywgXCJFeHBhbmQgQ2VsbCBPdXRwdXRcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCwgTk9URUJPT0tfQ0VMTF9PVVRQVVRfQ09MTEFQU0VEKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5VCksXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY29udGV4dC51aSkge1xuXHRcdFx0Y29udGV4dC5jZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRleHQuc2VsZWN0ZWRDZWxscy5mb3JFYWNoKGNlbGwgPT4gY2VsbC5pc091dHB1dENvbGxhcHNlZCA9IGZhbHNlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUT0dHTEVfQ0VMTF9PVVRQVVRTX0NPTU1BTkRfSUQsXG5cdFx0XHRwcmVjb25kaXRpb246IE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLnRvZ2dsZU91dHB1dHMnLCBcIlRvZ2dsZSBPdXRwdXRzXCIpLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMudG9nZ2xlT3V0cHV0cycsIFwiVG9nZ2xlIE91dHB1dHNcIiksXG5cdFx0XHRcdGFyZ3M6IGNlbGxFeGVjdXRpb25BcmdzXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBwYXJzZUFyZ3MoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gcGFyc2VNdWx0aUNlbGxFeGVjdXRpb25BcmdzKGFjY2Vzc29yLCAuLi5hcmdzKTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBjZWxsczogcmVhZG9ubHkgSUNlbGxWaWV3TW9kZWxbXSA9IFtdO1xuXHRcdGlmIChjb250ZXh0LnVpKSB7XG5cdFx0XHRjZWxscyA9IFtjb250ZXh0LmNlbGxdO1xuXHRcdH0gZWxzZSBpZiAoY29udGV4dC5zZWxlY3RlZENlbGxzKSB7XG5cdFx0XHRjZWxscyA9IGNvbnRleHQuc2VsZWN0ZWRDZWxscztcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGNlbGwuaXNPdXRwdXRDb2xsYXBzZWQgPSAhY2VsbC5pc091dHB1dENvbGxhcHNlZDtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29sbGFwc2VBbGxDZWxsSW5wdXRzQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09MTEFQU0VfQUxMX0NFTExfSU5QVVRTX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuY29sbGFwc2VBbGxDZWxsSW5wdXQnLCBcIkNvbGxhcHNlIEFsbCBDZWxsIElucHV0c1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yRWFjaENlbGwoY29udGV4dC5ub3RlYm9va0VkaXRvciwgY2VsbCA9PiBjZWxsLmlzSW5wdXRDb2xsYXBzZWQgPSB0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFeHBhbmRBbGxDZWxsSW5wdXRzQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRVhQQU5EX0FMTF9DRUxMX0lOUFVUU19DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmV4cGFuZEFsbENlbGxJbnB1dCcsIFwiRXhwYW5kIEFsbCBDZWxsIElucHV0c1wiKSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3JFYWNoQ2VsbChjb250ZXh0Lm5vdGVib29rRWRpdG9yLCBjZWxsID0+IGNlbGwuaXNJbnB1dENvbGxhcHNlZCA9IGZhbHNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDb2xsYXBzZUFsbENlbGxPdXRwdXRzQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09MTEFQU0VfQUxMX0NFTExfT1VUUFVUU19DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmNvbGxhcHNlQWxsQ2VsbE91dHB1dCcsIFwiQ29sbGFwc2UgQWxsIENlbGwgT3V0cHV0c1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yRWFjaENlbGwoY29udGV4dC5ub3RlYm9va0VkaXRvciwgY2VsbCA9PiBjZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gdHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhwYW5kQWxsQ2VsbE91dHB1dHNBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFWFBBTkRfQUxMX0NFTExfT1VUUFVUU19DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmV4cGFuZEFsbENlbGxPdXRwdXQnLCBcIkV4cGFuZCBBbGwgQ2VsbCBPdXRwdXRzXCIpLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IElOb3RlYm9va0NlbGxUb29sYmFyQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGZvckVhY2hDZWxsKGNvbnRleHQubm90ZWJvb2tFZGl0b3IsIGNlbGwgPT4gY2VsbC5pc091dHB1dENvbGxhcHNlZCA9IGZhbHNlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVDZWxsT3V0cHV0U2Nyb2xsaW5nIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVE9HR0xFX0NFTExfT1VUUFVUX1NDUk9MTElORyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy50b2dnbGVTY3JvbGxpbmcnLCBcIlRvZ2dsZSBTY3JvbGwgQ2VsbCBPdXRwdXRcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCwgSW5wdXRGb2N1c2VkQ29udGV4dC50b05lZ2F0ZWQoKSwgTk9URUJPT0tfQ0VMTF9IQVNfT1VUUFVUUyksXG5cdFx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleVkpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVPdXRwdXRTY3JvbGxpbmcodmlld01vZGVsOiBJQ2VsbE91dHB1dFZpZXdNb2RlbCwgZ2xvYmFsU2Nyb2xsU2V0dGluZzogYm9vbGVhbiwgY29sbGFwc2VkOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgY2VsbE1ldGFkYXRhID0gdmlld01vZGVsLm1vZGVsLm1ldGFkYXRhO1xuXHRcdC8vIFRPRE86IHdoZW4gaXMgY2VsbE1ldGFkYXRhIHVuZGVmaW5lZD8gSXMgdGhhdCBhIGNhc2Ugd2UgbmVlZCB0byBzdXBwb3J0PyBJdCBpcyBjdXJyZW50bHkgYSByZWFkLW9ubHkgcHJvcGVydHkuXG5cdFx0aWYgKGNlbGxNZXRhZGF0YSkge1xuXHRcdFx0Y29uc3QgY3VycmVudGx5RW5hYmxlZCA9IGNlbGxNZXRhZGF0YVsnc2Nyb2xsYWJsZSddICE9PSB1bmRlZmluZWQgPyBjZWxsTWV0YWRhdGFbJ3Njcm9sbGFibGUnXSA6IGdsb2JhbFNjcm9sbFNldHRpbmc7XG5cdFx0XHRjb25zdCBzaG91bGRFbmFibGVTY3JvbGxpbmcgPSBjb2xsYXBzZWQgfHwgIWN1cnJlbnRseUVuYWJsZWQ7XG5cdFx0XHRjZWxsTWV0YWRhdGFbJ3Njcm9sbGFibGUnXSA9IHNob3VsZEVuYWJsZVNjcm9sbGluZztcblx0XHRcdHZpZXdNb2RlbC5yZXNldFJlbmRlcmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2xvYmFsU2Nyb2xsaW5nID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dFNjcm9sbGluZyk7XG5cdFx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRcdGNvbnRleHQuY2VsbC5vdXRwdXRzVmlld01vZGVscy5mb3JFYWNoKCh2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dGhpcy50b2dnbGVPdXRwdXRTY3JvbGxpbmcodmlld01vZGVsLCBnbG9iYWxTY3JvbGxpbmcsIGNvbnRleHQuY2VsbC5pc091dHB1dENvbGxhcHNlZCk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnRleHQuY2VsbC5pc091dHB1dENvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250ZXh0LnNlbGVjdGVkQ2VsbHMuZm9yRWFjaChjZWxsID0+IHtcblx0XHRcdFx0Y2VsbC5vdXRwdXRzVmlld01vZGVscy5mb3JFYWNoKCh2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0XHR0aGlzLnRvZ2dsZU91dHB1dFNjcm9sbGluZyh2aWV3TW9kZWwsIGdsb2JhbFNjcm9sbGluZywgY2VsbC5pc091dHB1dENvbGxhcHNlZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjZWxsLmlzT3V0cHV0Q29sbGFwc2VkID0gZmFsc2U7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyNlbmRyZWdpb25cblxuZnVuY3Rpb24gZm9yRWFjaENlbGwoZWRpdG9yOiBJTm90ZWJvb2tFZGl0b3IsIGNhbGxiYWNrOiAoY2VsbDogSUNlbGxWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIpID0+IHZvaWQpIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBlZGl0b3IuZ2V0TGVuZ3RoKCk7IGkrKykge1xuXHRcdGNvbnN0IGNlbGwgPSBlZGl0b3IuY2VsbEF0KGkpO1xuXHRcdGNhbGxiYWNrKGNlbGwhLCBpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0Isd0JBQXdCO0FBQ25ELFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxRQUFRLHVCQUF1QjtBQUN4QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQiw4QkFBOEI7QUFFNUQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxrQkFBa0IsMEJBQTBCLGVBQWUsd0JBQXdCLG1CQUFtQixxQkFBcUI7QUFDcEksU0FBUyxtQkFBbUIsMkJBQTJCLGtCQUFrQiwwQkFBa0gsb0JBQW9CLHlCQUF5QixtQ0FBbUM7QUFDM1EsU0FBUyxlQUFlLDhCQUE4QixxQ0FBNEY7QUFDbEosU0FBUyx3QkFBd0IsMkJBQTJCLCtCQUErQiw0QkFBNEIsZ0NBQWdDLG9CQUFvQiwwQkFBMEIseUJBQXlCLDJCQUEyQiwrQkFBK0I7QUFDeFIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsY0FBYyxVQUFVLHVCQUF1QjtBQUN4RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUd0QyxNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLDRCQUE0QjtBQUVsQyxnQkFBZ0IsY0FBYyxtQkFBbUI7QUFBQSxFQUNoRCxjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsUUFDQyxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsOEJBQThCLGNBQWM7QUFBQSxRQUM3RCxNQUFNLE1BQU07QUFBQSxRQUNaLFlBQVk7QUFBQSxVQUNYLFNBQVMsT0FBTyxNQUFNLFFBQVE7QUFBQSxVQUM5QixNQUFNLGVBQWUsSUFBSSx5QkFBeUIsb0JBQW9CLFVBQVUsQ0FBQztBQUFBLFVBQ2pGLFFBQVEsaUJBQWlCO0FBQUEsUUFDMUI7QUFBQSxRQUNBLE1BQU07QUFBQSxVQUNMLElBQUksT0FBTztBQUFBLFVBQ1gsTUFBTSxlQUFlLE9BQU8sc0NBQXNDLEtBQUs7QUFBQSxVQUN2RSxPQUFPLDBCQUEwQjtBQUFBLFVBQ2pDLE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUM7QUFDckYsV0FBTyxjQUFjLFNBQVMsSUFBSTtBQUFBLEVBQ25DO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixjQUFjLG1CQUFtQjtBQUFBLEVBQ2hELGNBQWM7QUFDYjtBQUFBLE1BQ0M7QUFBQSxRQUNDLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxnQ0FBZ0MsZ0JBQWdCO0FBQUEsUUFDakUsTUFBTSxNQUFNO0FBQUEsUUFDWixZQUFZO0FBQUEsVUFDWCxTQUFTLE9BQU8sTUFBTSxRQUFRO0FBQUEsVUFDOUIsTUFBTSxlQUFlLElBQUkseUJBQXlCLG9CQUFvQixVQUFVLENBQUM7QUFBQSxVQUNqRixRQUFRLGlCQUFpQjtBQUFBLFFBQzFCO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZSxPQUFPLHNDQUFzQyxLQUFLO0FBQUEsVUFDdkUsT0FBTywwQkFBMEI7QUFBQSxVQUNqQyxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFDO0FBQ3JGLFdBQU8sY0FBYyxTQUFTLE1BQU07QUFBQSxFQUNyQztBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxtQkFBbUI7QUFBQSxFQUNoRCxjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsUUFDQyxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsOEJBQThCLGNBQWM7QUFBQSxRQUM3RCxZQUFZO0FBQUEsVUFDWCxTQUFTLE9BQU8sTUFBTSxPQUFPLFFBQVEsUUFBUTtBQUFBLFVBQzdDLE1BQU0sZUFBZSxJQUFJLHlCQUF5QixvQkFBb0IsVUFBVSxDQUFDO0FBQUEsVUFDakYsUUFBUSxpQkFBaUI7QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFBQSxJQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFDO0FBQ3JGLFdBQU8sY0FBYyxTQUFTLElBQUk7QUFBQSxFQUNuQztBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxtQkFBbUI7QUFBQSxFQUNoRCxjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsUUFDQyxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsZ0NBQWdDLGdCQUFnQjtBQUFBLFFBQ2pFLFlBQVk7QUFBQSxVQUNYLFNBQVMsT0FBTyxNQUFNLE9BQU8sUUFBUSxRQUFRO0FBQUEsVUFDN0MsTUFBTSxlQUFlLElBQUkseUJBQXlCLG9CQUFvQixVQUFVLENBQUM7QUFBQSxVQUNqRixRQUFRLGlCQUFpQjtBQUFBLFFBQzFCO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5QiwwQkFBMEIsc0JBQXNCO0FBQUEsVUFDbEcsT0FBTywwQkFBMEI7QUFBQSxVQUNqQyxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFDO0FBQ3JGLFdBQU8sY0FBYyxTQUFTLE1BQU07QUFBQSxFQUNyQztBQUNELENBQUM7QUFPRCxNQUFNLHdCQUF3QjtBQUM5QixNQUFNLGlDQUFpQztBQUN2QyxNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLDZCQUE2QjtBQUduQyxnQkFBZ0IsY0FBYyxtQkFBbUI7QUFBQSxFQUNoRCxjQUFjO0FBQ2I7QUFBQSxNQUNDO0FBQUEsUUFDQyxJQUFJO0FBQUEsUUFDSixPQUFPLFVBQVUsNkJBQTZCLFlBQVk7QUFBQSxRQUMxRCxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZTtBQUFBLFlBQ3BCO0FBQUEsWUFDQTtBQUFBLFlBQ0EsOEJBQThCLFVBQVU7QUFBQSxVQUN6QztBQUFBLFVBQ0EsT0FBTyxpQkFBaUI7QUFBQSxVQUN4QixPQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0EsTUFBTSxNQUFNO0FBQUEsUUFDWixZQUFZO0FBQUEsVUFDWCxNQUFNLGVBQWUsSUFBSSx5QkFBeUIsMEJBQTBCLHdCQUF3QixrQkFBa0IsZUFBZTtBQUFBLFVBQ3JJLFNBQVMsU0FBUyxPQUFPLFVBQVUsUUFBUSxNQUFNLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUSxTQUFTO0FBQUEsVUFDbEcsUUFBUSxpQkFBaUI7QUFBQSxRQUMxQjtBQUFBLE1BQ0Q7QUFBQSxJQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFDO0FBQ3JGLFFBQUksUUFBUSxlQUFlLFlBQVk7QUFDdEM7QUFBQSxJQUNEO0FBRUEsVUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxVQUFNLE9BQU8sUUFBUTtBQUNyQixVQUFNLFFBQVEsUUFBUSxlQUFlLGFBQWEsSUFBSTtBQUN0RCxVQUFNLGNBQWMsS0FBSyxjQUFjLGNBQWMsWUFBWSxDQUFDLEVBQUUsWUFBWSxHQUFHLFFBQVEsRUFBRSxDQUFDLElBQUksS0FBSywyQkFBMkI7QUFDbEksUUFBSSxlQUFlLFlBQVksU0FBUyxHQUFHO0FBQzFDLFlBQU0sS0FBSyxpQkFBaUI7QUFFNUIsVUFBSSxDQUFDLEtBQUssU0FBUyxHQUFHO0FBQ3JCO0FBQUEsTUFDRDtBQUVBLFlBQU0sbUJBQW1CLHlCQUF5QixNQUFNLFdBQVc7QUFDbkUsVUFBSSxrQkFBa0I7QUFDckIsY0FBTSxXQUFXLEtBQUs7QUFDdEIsY0FBTSxPQUFPLEtBQUs7QUFDbEIsY0FBTSxPQUFPLEtBQUs7QUFFbEIsY0FBTSxZQUFZLE1BQU0sS0FBSyxpQkFBaUI7QUFDOUMsY0FBTSxnQkFBZ0I7QUFBQSxVQUNyQjtBQUFBLFlBQ0MsSUFBSSxpQkFBaUIsS0FBSyxLQUFLLEVBQUUsT0FBTyxVQUFVLGtCQUFrQixHQUFHLE1BQU0saUJBQWlCLENBQUMsRUFBRSxDQUFDO0FBQUEsWUFDbEcsSUFBSTtBQUFBLGNBQXlCLFFBQVEsZUFBZSxVQUFVO0FBQUEsY0FDN0Q7QUFBQSxnQkFDQyxVQUFVLGFBQWE7QUFBQSxnQkFDdkIsT0FBTyxRQUFRO0FBQUEsZ0JBQ2YsT0FBTztBQUFBLGdCQUNQLE9BQU8saUJBQWlCLE1BQU0sQ0FBQyxFQUFFLElBQUksV0FBUztBQUFBLGtCQUM3QyxVQUFVO0FBQUEsa0JBQ1Y7QUFBQSxrQkFDQTtBQUFBLGtCQUNBLFFBQVE7QUFBQSxrQkFDUixTQUFTLENBQUM7QUFBQSxrQkFDVixVQUFVLENBQUM7QUFBQSxnQkFDWixFQUFFO0FBQUEsY0FDSDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsVUFDQSxFQUFFLGVBQWUsc0JBQXNCO0FBQUEsUUFDeEM7QUFFQSxnQkFBUSxlQUFlLE9BQU8sUUFBUSxDQUFDLEdBQUcsZ0JBQWdCLEtBQUssYUFBYSxHQUFHLFdBQVc7QUFBQSxNQUMzRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUdELGdCQUFnQixjQUFjLG1CQUFtQjtBQUFBLEVBQ2hELGNBQWM7QUFDYjtBQUFBLE1BQ0M7QUFBQSxRQUNDLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxpQ0FBaUMseUJBQXlCO0FBQUEsUUFDM0UsWUFBWTtBQUFBLFVBQ1gsTUFBTTtBQUFBLFVBQ04sU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLE9BQU8sUUFBUSxRQUFRO0FBQUEsVUFDOUQsUUFBUSxpQkFBaUI7QUFBQSxRQUMxQjtBQUFBLFFBQ0EsTUFBTTtBQUFBLFVBQ0wsSUFBSSxPQUFPO0FBQUEsVUFDWCxNQUFNLGVBQWUsSUFBSSx5QkFBeUIsd0JBQXdCO0FBQUEsVUFDMUUsT0FBTywwQkFBMEI7QUFBQSxVQUNqQyxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFDO0FBQ3JGLFVBQU0sa0JBQWtCLFNBQVMsSUFBSSxnQkFBZ0I7QUFDckQsV0FBTyx1QkFBdUIsaUJBQWlCLFNBQVMsT0FBTztBQUFBLEVBQ2hFO0FBQ0QsQ0FBQztBQUdELGdCQUFnQixjQUFjLG1CQUFtQjtBQUFBLEVBQ2hELGNBQWM7QUFDYjtBQUFBLE1BQ0M7QUFBQSxRQUNDLElBQUk7QUFBQSxRQUNKLE9BQU8sVUFBVSxpQ0FBaUMscUJBQXFCO0FBQUEsUUFDdkUsWUFBWTtBQUFBLFVBQ1gsTUFBTTtBQUFBLFVBQ04sU0FBUyxPQUFPLFVBQVUsT0FBTyxNQUFNLFFBQVE7QUFBQSxVQUMvQyxRQUFRLGlCQUFpQjtBQUFBLFFBQzFCO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5Qix3QkFBd0I7QUFBQSxVQUMxRSxPQUFPLDBCQUEwQjtBQUFBLFVBQ2pDLE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUM7QUFDckYsVUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxXQUFPLHVCQUF1QixpQkFBaUIsU0FBUyxPQUFPO0FBQUEsRUFDaEU7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsbUJBQW1CO0FBQUEsRUFDaEQsY0FBYztBQUNiO0FBQUEsTUFDQztBQUFBLFFBQ0MsSUFBSTtBQUFBLFFBQ0osT0FBTyxVQUFVLHFDQUFxQyxxQkFBcUI7QUFBQSxRQUMzRSxNQUFNO0FBQUEsVUFDTCxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5Qix3QkFBd0I7QUFBQSxVQUMxRSxPQUFPLDBCQUEwQjtBQUFBLFVBQ2pDLE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUM7QUFDckYsVUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxVQUFNLHNCQUFzQixTQUFTLElBQUksb0JBQW9CO0FBQzdELFdBQU8sa0JBQWtCLGlCQUFpQixxQkFBcUIsT0FBTztBQUFBLEVBQ3ZFO0FBQ0QsQ0FBQztBQU1ELE1BQU0saUNBQWlDO0FBQ3ZDLE1BQU0scUNBQXFDO0FBRTNDLGdCQUFnQixNQUFNLCtCQUErQix3QkFBd0I7QUFBQSxFQUM1RSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLG9DQUFvQyxxQkFBcUI7QUFBQSxNQUMxRSxZQUFZO0FBQUEsUUFDWCxNQUFNLGVBQWUsSUFBSSx5QkFBeUIsZUFBZSxJQUFJLHNCQUFzQixHQUFHLHdCQUF3QixVQUFVLENBQUM7QUFBQSxRQUNqSSxTQUFTLFFBQVE7QUFBQSxRQUNqQixRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxjQUFjLGVBQWUsSUFBSSwyQkFBMkIsbUJBQW1CLFVBQVUsUUFBUSxDQUFDO0FBQUEsTUFDbEcsTUFBTTtBQUFBLFFBQ0wsSUFBSSxPQUFPO0FBQUEsUUFDWCxNQUFNLGVBQWUsSUFBSSx5QkFBeUIsMEJBQTBCLHdCQUF3QixtQkFBbUIsVUFBVSxRQUFRLENBQUM7QUFBQSxRQUMxSSxPQUFPLDBCQUEwQjtBQUFBLE1BQ2xDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFGO0FBQ3JJLFVBQU0saUJBQWlCLFNBQVMsTUFBTSxPQUFPO0FBQUEsRUFDOUM7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sbUNBQW1DLHdCQUF3QjtBQUFBLEVBQ2hGLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsd0NBQXdDLHlCQUF5QjtBQUFBLE1BQ2xGLFlBQVk7QUFBQSxRQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5QixlQUFlLElBQUksc0JBQXNCLEdBQUcsd0JBQXdCLFVBQVUsQ0FBQztBQUFBLFFBQ2pJLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLGNBQWMsZUFBZSxJQUFJLDJCQUEyQixtQkFBbUIsVUFBVSxNQUFNLENBQUM7QUFBQSxNQUNoRyxNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5QiwwQkFBMEIsd0JBQXdCLG1CQUFtQixVQUFVLE1BQU0sQ0FBQztBQUFBLFFBQ3hJLE9BQU8sMEJBQTBCO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUY7QUFDckksVUFBTSxpQkFBaUIsU0FBUyxRQUFRLFNBQVMsWUFBWSxNQUFNLFFBQVE7QUFBQSxFQUM1RTtBQUNELENBQUM7QUFNRCxNQUFNLGlDQUFpQztBQUN2QyxNQUFNLGtDQUFrQztBQUN4QyxNQUFNLHNDQUFzQztBQUM1QyxNQUFNLG9DQUFvQztBQUMxQyxNQUFNLHVDQUF1QztBQUM3QyxNQUFNLHFDQUFxQztBQUMzQyxNQUFNLGlDQUFpQztBQUN2QyxNQUFNLCtCQUErQjtBQUVyQyxnQkFBZ0IsTUFBTSxnQ0FBZ0Msd0JBQXdCO0FBQUEsRUFDN0UsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxxQ0FBcUMscUJBQXFCO0FBQUEsTUFDM0UsWUFBWTtBQUFBLFFBQ1gsTUFBTSxlQUFlLElBQUksNEJBQTRCLDhCQUE4QixVQUFVLEdBQUcsb0JBQW9CLFVBQVUsQ0FBQztBQUFBLFFBQy9ILFNBQVMsU0FBUyxPQUFPLFVBQVUsUUFBUSxNQUFNLE9BQU8sVUFBVSxRQUFRLElBQUk7QUFBQSxRQUM5RSxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsVUFBVSxhQUErQixNQUFzRDtBQUN2RyxXQUFPLDRCQUE0QixVQUFVLEdBQUcsSUFBSTtBQUFBLEVBQ3JEO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUY7QUFDckksUUFBSSxRQUFRLElBQUk7QUFDZixjQUFRLEtBQUssbUJBQW1CO0FBQUEsSUFDakMsT0FBTztBQUNOLGNBQVEsY0FBYyxRQUFRLFVBQVEsS0FBSyxtQkFBbUIsSUFBSTtBQUFBLElBQ25FO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSw4QkFBOEIsd0JBQXdCO0FBQUEsRUFDM0UsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxtQ0FBbUMsbUJBQW1CO0FBQUEsTUFDdkUsWUFBWTtBQUFBLFFBQ1gsTUFBTSxlQUFlLElBQUksNEJBQTRCLDZCQUE2QjtBQUFBLFFBQ2xGLFNBQVMsU0FBUyxPQUFPLFVBQVUsUUFBUSxNQUFNLE9BQU8sVUFBVSxRQUFRLElBQUk7QUFBQSxRQUM5RSxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsVUFBVSxhQUErQixNQUFzRDtBQUN2RyxXQUFPLDRCQUE0QixVQUFVLEdBQUcsSUFBSTtBQUFBLEVBQ3JEO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUY7QUFDckksUUFBSSxRQUFRLElBQUk7QUFDZixjQUFRLEtBQUssbUJBQW1CO0FBQUEsSUFDakMsT0FBTztBQUNOLGNBQVEsY0FBYyxRQUFRLFVBQVEsS0FBSyxtQkFBbUIsS0FBSztBQUFBLElBQ3BFO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxpQ0FBaUMsd0JBQXdCO0FBQUEsRUFDOUUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxzQ0FBc0Msc0JBQXNCO0FBQUEsTUFDN0UsWUFBWTtBQUFBLFFBQ1gsTUFBTSxlQUFlLElBQUksNEJBQTRCLCtCQUErQixVQUFVLEdBQUcsb0JBQW9CLFVBQVUsR0FBRyx5QkFBeUI7QUFBQSxRQUMzSixTQUFTLFNBQVMsT0FBTyxVQUFVLFFBQVEsTUFBTSxRQUFRLElBQUk7QUFBQSxRQUM3RCxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFGO0FBQ3JJLFFBQUksUUFBUSxJQUFJO0FBQ2YsY0FBUSxLQUFLLG9CQUFvQjtBQUFBLElBQ2xDLE9BQU87QUFDTixjQUFRLGNBQWMsUUFBUSxVQUFRLEtBQUssb0JBQW9CLElBQUk7QUFBQSxJQUNwRTtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sOEJBQThCLHdCQUF3QjtBQUFBLEVBQzNFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsb0NBQW9DLG9CQUFvQjtBQUFBLE1BQ3pFLFlBQVk7QUFBQSxRQUNYLE1BQU0sZUFBZSxJQUFJLDRCQUE0Qiw4QkFBOEI7QUFBQSxRQUNuRixTQUFTLFNBQVMsT0FBTyxVQUFVLFFBQVEsTUFBTSxRQUFRLElBQUk7QUFBQSxRQUM3RCxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFGO0FBQ3JJLFFBQUksUUFBUSxJQUFJO0FBQ2YsY0FBUSxLQUFLLG9CQUFvQjtBQUFBLElBQ2xDLE9BQU87QUFDTixjQUFRLGNBQWMsUUFBUSxVQUFRLEtBQUssb0JBQW9CLEtBQUs7QUFBQSxJQUNyRTtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsd0JBQXdCO0FBQUEsRUFDckQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE9BQU8sVUFBVSxpQ0FBaUMsZ0JBQWdCO0FBQUEsTUFDbEUsVUFBVTtBQUFBLFFBQ1QsYUFBYSxTQUFTLGlDQUFpQyxnQkFBZ0I7QUFBQSxRQUN2RSxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLFVBQVUsYUFBK0IsTUFBc0Q7QUFDdkcsV0FBTyw0QkFBNEIsVUFBVSxHQUFHLElBQUk7QUFBQSxFQUNyRDtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQXFGO0FBQ3JJLFFBQUksUUFBbUMsQ0FBQztBQUN4QyxRQUFJLFFBQVEsSUFBSTtBQUNmLGNBQVEsQ0FBQyxRQUFRLElBQUk7QUFBQSxJQUN0QixXQUFXLFFBQVEsZUFBZTtBQUNqQyxjQUFRLFFBQVE7QUFBQSxJQUNqQjtBQUVBLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFdBQUssb0JBQW9CLENBQUMsS0FBSztBQUFBLElBQ2hDO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxvQ0FBb0Msd0JBQXdCO0FBQUEsRUFDakYsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSx3Q0FBd0MsMEJBQTBCO0FBQUEsTUFDbkYsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxnQkFBWSxRQUFRLGdCQUFnQixVQUFRLEtBQUssbUJBQW1CLElBQUk7QUFBQSxFQUN6RTtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxrQ0FBa0Msd0JBQXdCO0FBQUEsRUFDL0UsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxzQ0FBc0Msd0JBQXdCO0FBQUEsTUFDL0UsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxnQkFBWSxRQUFRLGdCQUFnQixVQUFRLEtBQUssbUJBQW1CLEtBQUs7QUFBQSxFQUMxRTtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxxQ0FBcUMsd0JBQXdCO0FBQUEsRUFDbEYsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSx5Q0FBeUMsMkJBQTJCO0FBQUEsTUFDckYsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxnQkFBWSxRQUFRLGdCQUFnQixVQUFRLEtBQUssb0JBQW9CLElBQUk7QUFBQSxFQUMxRTtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxtQ0FBbUMsd0JBQXdCO0FBQUEsRUFDaEYsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSx1Q0FBdUMseUJBQXlCO0FBQUEsTUFDakYsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxnQkFBWSxRQUFRLGdCQUFnQixVQUFRLEtBQUssb0JBQW9CLEtBQUs7QUFBQSxFQUMzRTtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxrQ0FBa0Msd0JBQXdCO0FBQUEsRUFDL0UsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxtQ0FBbUMsMkJBQTJCO0FBQUEsTUFDL0UsWUFBWTtBQUFBLFFBQ1gsTUFBTSxlQUFlLElBQUksNEJBQTRCLG9CQUFvQixVQUFVLEdBQUcseUJBQXlCO0FBQUEsUUFDL0csU0FBUyxTQUFTLE9BQU8sVUFBVSxRQUFRLE1BQU0sUUFBUSxJQUFJO0FBQUEsUUFDN0QsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHNCQUFzQixXQUFpQyxxQkFBOEIsV0FBb0I7QUFDaEgsVUFBTSxlQUFlLFVBQVUsTUFBTTtBQUVyQyxRQUFJLGNBQWM7QUFDakIsWUFBTSxtQkFBbUIsYUFBYSxZQUFZLE1BQU0sU0FBWSxhQUFhLFlBQVksSUFBSTtBQUNqRyxZQUFNLHdCQUF3QixhQUFhLENBQUM7QUFDNUMsbUJBQWEsWUFBWSxJQUFJO0FBQzdCLGdCQUFVLGNBQWM7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxVQUFNLGtCQUFrQixTQUFTLElBQUkscUJBQXFCLEVBQUUsU0FBa0IsZ0JBQWdCLGVBQWU7QUFDN0csUUFBSSxRQUFRLElBQUk7QUFDZixjQUFRLEtBQUssa0JBQWtCLFFBQVEsQ0FBQyxjQUFjO0FBQ3JELGFBQUssc0JBQXNCLFdBQVcsaUJBQWlCLFFBQVEsS0FBSyxpQkFBaUI7QUFBQSxNQUN0RixDQUFDO0FBQ0QsY0FBUSxLQUFLLG9CQUFvQjtBQUFBLElBQ2xDLE9BQU87QUFDTixjQUFRLGNBQWMsUUFBUSxVQUFRO0FBQ3JDLGFBQUssa0JBQWtCLFFBQVEsQ0FBQyxjQUFjO0FBQzdDLGVBQUssc0JBQXNCLFdBQVcsaUJBQWlCLEtBQUssaUJBQWlCO0FBQUEsUUFDOUUsQ0FBQztBQUNELGFBQUssb0JBQW9CO0FBQUEsTUFDMUIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUlELFNBQVMsWUFBWSxRQUF5QixVQUF5RDtBQUN0RyxXQUFTLElBQUksR0FBRyxJQUFJLE9BQU8sVUFBVSxHQUFHLEtBQUs7QUFDNUMsVUFBTSxPQUFPLE9BQU8sT0FBTyxDQUFDO0FBQzVCLGFBQVMsTUFBTyxDQUFDO0FBQUEsRUFDbEI7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
