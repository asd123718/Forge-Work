import { Iterable } from "../../../../../base/common/iterator.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { localize, localize2 } from "../../../../../nls.js";
import { MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDebugService } from "../../../debug/common/debug.js";
import { CTX_INLINE_CHAT_FOCUSED } from "../../../inlineChat/common/inlineChat.js";
import { insertCell } from "./cellOperations.js";
import { CELL_TITLE_CELL_GROUP_ID, CellToolbarOrder, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NotebookAction, NotebookCellAction, NotebookMultiCellAction, cellExecutionArgs, getContextFromActiveEditor, getContextFromUri, parseMultiCellExecutionArgs } from "./coreActions.js";
import { CellEditState, CellFocusMode, EXECUTE_CELL_COMMAND_ID, ScrollToRevealBehavior } from "../notebookBrowser.js";
import * as icons from "../notebookIcons.js";
import { CellKind, CellUri, NotebookSetting } from "../../common/notebookCommon.js";
import { NOTEBOOK_CELL_EXECUTING, NOTEBOOK_CELL_EXECUTION_STATE, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_TYPE, NOTEBOOK_HAS_RUNNING_CELL, NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT, NOTEBOOK_LAST_CELL_FAILED, NOTEBOOK_MISSING_KERNEL_EXTENSION } from "../../common/notebookContextKeys.js";
import { NotebookEditorInput } from "../../common/notebookEditorInput.js";
import { INotebookExecutionStateService } from "../../common/notebookExecutionStateService.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { CodeCellViewModel } from "../viewModel/codeCellViewModel.js";
const EXECUTE_NOTEBOOK_COMMAND_ID = "notebook.execute";
const CANCEL_NOTEBOOK_COMMAND_ID = "notebook.cancelExecution";
const INTERRUPT_NOTEBOOK_COMMAND_ID = "notebook.interruptExecution";
const CANCEL_CELL_COMMAND_ID = "notebook.cell.cancelExecution";
const EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID = "notebook.cell.executeAndFocusContainer";
const EXECUTE_CELL_SELECT_BELOW = "notebook.cell.executeAndSelectBelow";
const EXECUTE_CELL_INSERT_BELOW = "notebook.cell.executeAndInsertBelow";
const EXECUTE_CELL_AND_BELOW = "notebook.cell.executeCellAndBelow";
const EXECUTE_CELLS_ABOVE = "notebook.cell.executeCellsAbove";
const RENDER_ALL_MARKDOWN_CELLS = "notebook.renderAllMarkdownCells";
const REVEAL_RUNNING_CELL = "notebook.revealRunningCell";
const REVEAL_LAST_FAILED_CELL = "notebook.revealLastFailedCell";
const executeCondition = ContextKeyExpr.and(
  NOTEBOOK_CELL_TYPE.isEqualTo("code"),
  ContextKeyExpr.or(
    ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0),
    ContextKeyExpr.greater(NOTEBOOK_KERNEL_SOURCE_COUNT.key, 0),
    NOTEBOOK_MISSING_KERNEL_EXTENSION
  )
);
const executeThisCellCondition = ContextKeyExpr.and(
  executeCondition,
  NOTEBOOK_CELL_EXECUTING.toNegated()
);
const executeSectionCondition = ContextKeyExpr.and(
  NOTEBOOK_CELL_TYPE.isEqualTo("markup")
);
function renderAllMarkdownCells(context) {
  for (let i = 0; i < context.notebookEditor.getLength(); i++) {
    const cell = context.notebookEditor.cellAt(i);
    if (cell.cellKind === CellKind.Markup) {
      cell.updateEditState(CellEditState.Preview, "renderAllMarkdownCells");
    }
  }
}
async function runCell(editorGroupsService, context, editorService) {
  const group = editorGroupsService.activeGroup;
  if (group) {
    if (group.activeEditor) {
      group.pinEditor(group.activeEditor);
    }
  }
  if (context.autoReveal && (context.cell || context.selectedCells?.length) && editorService) {
    editorService.openEditor({ resource: context.notebookEditor.textModel.uri, options: { revealIfOpened: true } });
  }
  if (context.ui && context.cell) {
    if (context.autoReveal) {
      handleAutoReveal(context.cell, context.notebookEditor);
    }
    await context.notebookEditor.executeNotebookCells(Iterable.single(context.cell));
  } else if (context.selectedCells?.length || context.cell) {
    const selectedCells = context.selectedCells?.length ? context.selectedCells : [context.cell];
    const firstCell = selectedCells[0];
    if (firstCell && context.autoReveal) {
      handleAutoReveal(firstCell, context.notebookEditor);
    }
    await context.notebookEditor.executeNotebookCells(selectedCells);
  }
  let foundEditor = void 0;
  for (const [, codeEditor] of context.notebookEditor.codeEditors) {
    if (isEqual(codeEditor.getModel()?.uri, (context.cell ?? context.selectedCells?.[0])?.uri)) {
      foundEditor = codeEditor;
      break;
    }
  }
  if (!foundEditor) {
    return;
  }
}
const SMART_VIEWPORT_TOP_REVEAL_PADDING = 20;
const SMART_VIEWPORT_BOTTOM_REVEAL_PADDING = 60;
function handleAutoReveal(cell, notebookEditor) {
  notebookEditor.focusNotebookCell(cell, "container", { skipReveal: true });
  if (cell.cellKind === CellKind.Markup) {
    const cellIndex = notebookEditor.getCellIndex(cell);
    notebookEditor.revealCellRangeInView({ start: cellIndex, end: cellIndex + 1 });
    return;
  }
  if (!(cell instanceof CodeCellViewModel)) {
    return;
  }
  const cellEditorScrollTop = notebookEditor.getAbsoluteTopOfElement(cell);
  const cellEditorScrollBottom = cellEditorScrollTop + cell.layoutInfo.outputContainerOffset;
  const cellOutputHeight = cell.layoutInfo.outputTotalHeight;
  const cellOutputScrollBottom = notebookEditor.getAbsoluteBottomOfElement(cell);
  const viewportHeight = notebookEditor.getLayoutInfo().height;
  const viewportHeight34 = viewportHeight * 0.34;
  const viewportHeight66 = viewportHeight * 0.66;
  const totalHeight = cell.layoutInfo.totalHeight;
  const isFullyVisible = cellEditorScrollTop >= notebookEditor.scrollTop && cellOutputScrollBottom <= notebookEditor.scrollBottom;
  const isEditorBottomVisible = cellEditorScrollBottom - 25 >= notebookEditor.scrollTop && cellEditorScrollBottom + 25 <= notebookEditor.scrollBottom;
  const revealWithTopPadding = (position) => {
    notebookEditor.setScrollTop(position - SMART_VIEWPORT_TOP_REVEAL_PADDING);
  };
  const revealWithNoPadding = (position) => {
    notebookEditor.setScrollTop(position);
  };
  const revealWithBottomPadding = (position) => {
    notebookEditor.setScrollTop(position + SMART_VIEWPORT_BOTTOM_REVEAL_PADDING);
  };
  if (isFullyVisible) {
    return;
  }
  if (totalHeight <= viewportHeight && !isEditorBottomVisible) {
    revealWithTopPadding(cellEditorScrollTop);
    return;
  }
  if (totalHeight > viewportHeight && !isEditorBottomVisible) {
    if (cellOutputHeight > 0 && cellOutputHeight >= viewportHeight66) {
      revealWithNoPadding(cellEditorScrollBottom - viewportHeight34);
    } else if (cellOutputHeight > 0) {
      revealWithBottomPadding(cellOutputScrollBottom - viewportHeight);
    } else {
      revealWithNoPadding(cellEditorScrollBottom - viewportHeight66);
    }
  }
}
registerAction2(class RenderAllMarkdownCellsAction extends NotebookAction {
  constructor() {
    super({
      id: RENDER_ALL_MARKDOWN_CELLS,
      title: localize("notebookActions.renderMarkdown", "Render All Markdown Cells")
    });
  }
  async runWithContext(accessor, context) {
    renderAllMarkdownCells(context);
  }
});
registerAction2(class ExecuteNotebookAction extends NotebookAction {
  constructor() {
    super({
      id: EXECUTE_NOTEBOOK_COMMAND_ID,
      title: localize("notebookActions.executeNotebook", "Run All"),
      icon: icons.executeAllIcon,
      metadata: {
        description: localize("notebookActions.executeNotebook", "Run All"),
        args: [
          {
            name: "uri",
            description: "The document uri"
          }
        ]
      },
      menu: [
        {
          id: MenuId.EditorTitle,
          order: -1,
          group: "navigation",
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            ContextKeyExpr.or(NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(), NOTEBOOK_HAS_SOMETHING_RUNNING.toNegated()),
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true)
          )
        },
        {
          id: MenuId.NotebookToolbar,
          order: -1,
          group: "navigation/execute",
          when: ContextKeyExpr.and(
            ContextKeyExpr.or(
              NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(),
              NOTEBOOK_HAS_SOMETHING_RUNNING.toNegated()
            ),
            ContextKeyExpr.and(NOTEBOOK_HAS_SOMETHING_RUNNING, NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated())?.negate(),
            ContextKeyExpr.equals("config.notebook.globalToolbar", true)
          )
        }
      ]
    });
  }
  getEditorContextFromArgsOrActive(accessor, context) {
    return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
  }
  async runWithContext(accessor, context) {
    renderAllMarkdownCells(context);
    const editorService = accessor.get(IEditorService);
    const editor = editorService.findEditors({
      resource: context.notebookEditor.textModel.uri,
      typeId: NotebookEditorInput.ID,
      editorId: context.notebookEditor.textModel.viewType
    }).at(0);
    const editorGroupService = accessor.get(IEditorGroupsService);
    if (editor) {
      const group = editorGroupService.getGroup(editor.groupId);
      group?.pinEditor(editor.editor);
    }
    return context.notebookEditor.executeNotebookCells();
  }
});
registerAction2(class ExecuteCell extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXECUTE_CELL_COMMAND_ID,
      precondition: executeThisCellCondition,
      title: localize("notebookActions.execute", "Execute Cell"),
      keybinding: {
        when: NOTEBOOK_CELL_LIST_FOCUSED,
        primary: KeyMod.WinCtrl | KeyCode.Enter,
        win: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
        },
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      },
      menu: {
        id: MenuId.NotebookCellExecutePrimary,
        when: executeThisCellCondition,
        group: "inline"
      },
      metadata: {
        description: localize("notebookActions.execute", "Execute Cell"),
        args: cellExecutionArgs
      },
      icon: icons.executeIcon
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    if (context.ui) {
      await context.notebookEditor.focusNotebookCell(context.cell, "container", { skipReveal: true });
    }
    await runCell(editorGroupsService, context, editorService);
  }
});
registerAction2(class ExecuteAboveCells extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXECUTE_CELLS_ABOVE,
      precondition: executeCondition,
      title: localize("notebookActions.executeAbove", "Execute Above Cells"),
      menu: [
        {
          id: MenuId.NotebookCellExecute,
          when: ContextKeyExpr.and(
            executeCondition,
            ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, true)
          )
        },
        {
          id: MenuId.NotebookCellTitle,
          order: CellToolbarOrder.ExecuteAboveCells,
          group: CELL_TITLE_CELL_GROUP_ID,
          when: ContextKeyExpr.and(
            executeCondition,
            ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, false)
          )
        }
      ],
      icon: icons.executeAboveIcon
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    let endCellIdx = void 0;
    if (context.ui) {
      endCellIdx = context.notebookEditor.getCellIndex(context.cell);
      await context.notebookEditor.focusNotebookCell(context.cell, "container", { skipReveal: true });
    } else {
      endCellIdx = Math.min(...context.selectedCells.map((cell) => context.notebookEditor.getCellIndex(cell)));
    }
    if (typeof endCellIdx === "number") {
      const range = { start: 0, end: endCellIdx };
      const cells = context.notebookEditor.getCellsInRange(range);
      context.notebookEditor.executeNotebookCells(cells);
    }
  }
});
registerAction2(class ExecuteCellAndBelow extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXECUTE_CELL_AND_BELOW,
      precondition: executeCondition,
      title: localize("notebookActions.executeBelow", "Execute Cell and Below"),
      menu: [
        {
          id: MenuId.NotebookCellExecute,
          when: ContextKeyExpr.and(
            executeCondition,
            ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, true)
          )
        },
        {
          id: MenuId.NotebookCellTitle,
          order: CellToolbarOrder.ExecuteCellAndBelow,
          group: CELL_TITLE_CELL_GROUP_ID,
          when: ContextKeyExpr.and(
            executeCondition,
            ContextKeyExpr.equals(`config.${NotebookSetting.consolidatedRunButton}`, false)
          )
        }
      ],
      icon: icons.executeBelowIcon
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    let startCellIdx = void 0;
    if (context.ui) {
      startCellIdx = context.notebookEditor.getCellIndex(context.cell);
      await context.notebookEditor.focusNotebookCell(context.cell, "container", { skipReveal: true });
    } else {
      startCellIdx = Math.min(...context.selectedCells.map((cell) => context.notebookEditor.getCellIndex(cell)));
    }
    if (typeof startCellIdx === "number") {
      const range = { start: startCellIdx, end: context.notebookEditor.getLength() };
      const cells = context.notebookEditor.getCellsInRange(range);
      context.notebookEditor.executeNotebookCells(cells);
    }
  }
});
registerAction2(class ExecuteCellFocusContainer extends NotebookMultiCellAction {
  constructor() {
    super({
      id: EXECUTE_CELL_FOCUS_CONTAINER_COMMAND_ID,
      precondition: executeThisCellCondition,
      title: localize("notebookActions.executeAndFocusContainer", "Execute Cell and Focus Container"),
      metadata: {
        description: localize("notebookActions.executeAndFocusContainer", "Execute Cell and Focus Container"),
        args: cellExecutionArgs
      },
      icon: icons.executeIcon
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    if (context.ui) {
      await context.notebookEditor.focusNotebookCell(context.cell, "container", { skipReveal: true });
    } else {
      const firstCell = context.selectedCells[0];
      if (firstCell) {
        await context.notebookEditor.focusNotebookCell(firstCell, "container", { skipReveal: true });
      }
    }
    await runCell(editorGroupsService, context, editorService);
  }
});
const cellCancelCondition = ContextKeyExpr.or(
  ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, "executing"),
  ContextKeyExpr.equals(NOTEBOOK_CELL_EXECUTION_STATE.key, "pending")
);
registerAction2(class CancelExecuteCell extends NotebookMultiCellAction {
  constructor() {
    super({
      id: CANCEL_CELL_COMMAND_ID,
      precondition: cellCancelCondition,
      title: localize("notebookActions.cancel", "Stop Cell Execution"),
      icon: icons.stopIcon,
      menu: {
        id: MenuId.NotebookCellExecutePrimary,
        when: cellCancelCondition,
        group: "inline"
      },
      metadata: {
        description: localize("notebookActions.cancel", "Stop Cell Execution"),
        args: [
          {
            name: "options",
            description: "The cell range options",
            schema: {
              "type": "object",
              "required": ["ranges"],
              "properties": {
                "ranges": {
                  "type": "array",
                  items: [
                    {
                      "type": "object",
                      "required": ["start", "end"],
                      "properties": {
                        "start": {
                          "type": "number"
                        },
                        "end": {
                          "type": "number"
                        }
                      }
                    }
                  ]
                },
                "document": {
                  "type": "object",
                  "description": "The document uri"
                }
              }
            }
          }
        ]
      }
    });
  }
  parseArgs(accessor, ...args) {
    return parseMultiCellExecutionArgs(accessor, ...args);
  }
  async runWithContext(accessor, context) {
    if (context.ui) {
      await context.notebookEditor.focusNotebookCell(context.cell, "container", { skipReveal: true });
      return context.notebookEditor.cancelNotebookCells(Iterable.single(context.cell));
    } else {
      return context.notebookEditor.cancelNotebookCells(context.selectedCells);
    }
  }
});
registerAction2(class ExecuteCellSelectBelow extends NotebookCellAction {
  constructor() {
    super({
      id: EXECUTE_CELL_SELECT_BELOW,
      precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo("markup")),
      title: localize("notebookActions.executeAndSelectBelow", "Execute Notebook Cell and Select Below"),
      keybinding: {
        when: ContextKeyExpr.and(
          NOTEBOOK_CELL_LIST_FOCUSED,
          CTX_INLINE_CHAT_FOCUSED.negate()
        ),
        primary: KeyMod.Shift | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    const idx = context.notebookEditor.getCellIndex(context.cell);
    if (typeof idx !== "number") {
      return;
    }
    const languageService = accessor.get(ILanguageService);
    const config = accessor.get(IConfigurationService);
    const scrollBehavior = config.getValue(NotebookSetting.scrollToRevealCell);
    let focusOptions;
    if (scrollBehavior === "none") {
      focusOptions = { skipReveal: true };
    } else {
      focusOptions = {
        revealBehavior: scrollBehavior === "fullCell" ? ScrollToRevealBehavior.fullCell : ScrollToRevealBehavior.firstLine
      };
    }
    if (context.cell.cellKind === CellKind.Markup) {
      const nextCell = context.notebookEditor.cellAt(idx + 1);
      context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_SELECT_BELOW);
      if (nextCell) {
        await context.notebookEditor.focusNotebookCell(nextCell, "container", focusOptions);
      } else {
        const newCell = insertCell(languageService, context.notebookEditor, idx, CellKind.Markup, "below");
        if (newCell) {
          await context.notebookEditor.focusNotebookCell(newCell, "editor", focusOptions);
        }
      }
      return;
    } else {
      const nextCell = context.notebookEditor.cellAt(idx + 1);
      if (nextCell) {
        await context.notebookEditor.focusNotebookCell(nextCell, "container", focusOptions);
      } else {
        const newCell = insertCell(languageService, context.notebookEditor, idx, CellKind.Code, "below");
        if (newCell) {
          await context.notebookEditor.focusNotebookCell(newCell, "editor", focusOptions);
        }
      }
      return runCell(editorGroupsService, context, editorService);
    }
  }
});
registerAction2(class ExecuteCellInsertBelow extends NotebookCellAction {
  constructor() {
    super({
      id: EXECUTE_CELL_INSERT_BELOW,
      precondition: ContextKeyExpr.or(executeThisCellCondition, NOTEBOOK_CELL_TYPE.isEqualTo("markup")),
      title: localize("notebookActions.executeAndInsertBelow", "Execute Notebook Cell and Insert Below"),
      keybinding: {
        when: NOTEBOOK_CELL_LIST_FOCUSED,
        primary: KeyMod.Alt | KeyCode.Enter,
        weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
      }
    });
  }
  async runWithContext(accessor, context) {
    const editorGroupsService = accessor.get(IEditorGroupsService);
    const editorService = accessor.get(IEditorService);
    const idx = context.notebookEditor.getCellIndex(context.cell);
    const languageService = accessor.get(ILanguageService);
    const newFocusMode = context.cell.focusMode === CellFocusMode.Editor ? "editor" : "container";
    const newCell = insertCell(languageService, context.notebookEditor, idx, context.cell.cellKind, "below");
    if (newCell) {
      await context.notebookEditor.focusNotebookCell(newCell, newFocusMode);
    }
    if (context.cell.cellKind === CellKind.Markup) {
      context.cell.updateEditState(CellEditState.Preview, EXECUTE_CELL_INSERT_BELOW);
    } else {
      runCell(editorGroupsService, context, editorService);
    }
  }
});
class CancelNotebook extends NotebookAction {
  getEditorContextFromArgsOrActive(accessor, context) {
    return getContextFromUri(accessor, context) ?? getContextFromActiveEditor(accessor.get(IEditorService));
  }
  async runWithContext(accessor, context) {
    return context.notebookEditor.cancelNotebookCells();
  }
}
registerAction2(class CancelAllNotebook extends CancelNotebook {
  constructor() {
    super({
      id: CANCEL_NOTEBOOK_COMMAND_ID,
      title: localize2("notebookActions.cancelNotebook", "Stop Execution"),
      icon: icons.stopIcon,
      menu: [
        {
          id: MenuId.EditorTitle,
          order: -1,
          group: "navigation",
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_HAS_SOMETHING_RUNNING,
            NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(),
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true)
          )
        },
        {
          id: MenuId.NotebookToolbar,
          order: -1,
          group: "navigation/execute",
          when: ContextKeyExpr.and(
            NOTEBOOK_HAS_SOMETHING_RUNNING,
            NOTEBOOK_INTERRUPTIBLE_KERNEL.toNegated(),
            ContextKeyExpr.equals("config.notebook.globalToolbar", true)
          )
        }
      ]
    });
  }
});
registerAction2(class InterruptNotebook extends CancelNotebook {
  constructor() {
    super({
      id: INTERRUPT_NOTEBOOK_COMMAND_ID,
      title: localize2("notebookActions.interruptNotebook", "Interrupt"),
      precondition: ContextKeyExpr.and(
        NOTEBOOK_HAS_SOMETHING_RUNNING,
        NOTEBOOK_INTERRUPTIBLE_KERNEL
      ),
      icon: icons.stopIcon,
      menu: [
        {
          id: MenuId.EditorTitle,
          order: -1,
          group: "navigation",
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_HAS_SOMETHING_RUNNING,
            NOTEBOOK_INTERRUPTIBLE_KERNEL,
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true)
          )
        },
        {
          id: MenuId.NotebookToolbar,
          order: -1,
          group: "navigation/execute",
          when: ContextKeyExpr.and(
            NOTEBOOK_HAS_SOMETHING_RUNNING,
            NOTEBOOK_INTERRUPTIBLE_KERNEL,
            ContextKeyExpr.equals("config.notebook.globalToolbar", true)
          )
        },
        {
          id: MenuId.InteractiveToolbar,
          group: "navigation/execute"
        }
      ]
    });
  }
});
MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
  title: localize("revealRunningCellShort", "Go To"),
  submenu: MenuId.NotebookCellExecuteGoTo,
  group: "navigation/execute",
  order: 20,
  icon: ThemeIcon.modify(icons.executingStateIcon, "spin")
});
registerAction2(class RevealRunningCellAction extends NotebookAction {
  constructor() {
    super({
      id: REVEAL_RUNNING_CELL,
      title: localize("revealRunningCell", "Go to Running Cell"),
      tooltip: localize("revealRunningCell", "Go to Running Cell"),
      shortTitle: localize("revealRunningCell", "Go to Running Cell"),
      precondition: NOTEBOOK_HAS_RUNNING_CELL,
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_HAS_RUNNING_CELL,
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true)
          ),
          group: "navigation",
          order: 0
        },
        {
          id: MenuId.NotebookCellExecuteGoTo,
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_HAS_RUNNING_CELL,
            ContextKeyExpr.equals("config.notebook.globalToolbar", true)
          ),
          group: "navigation/execute",
          order: 20
        },
        {
          id: MenuId.InteractiveToolbar,
          when: ContextKeyExpr.and(
            NOTEBOOK_HAS_RUNNING_CELL,
            ContextKeyExpr.equals("activeEditor", "workbench.editor.interactive")
          ),
          group: "navigation",
          order: 10
        }
      ],
      icon: ThemeIcon.modify(icons.executingStateIcon, "spin")
    });
  }
  async runWithContext(accessor, context) {
    const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
    const notebook = context.notebookEditor.textModel.uri;
    const executingCells = notebookExecutionStateService.getCellExecutionsForNotebook(notebook);
    if (executingCells[0]) {
      const topStackFrameCell = this.findCellAtTopFrame(accessor, notebook);
      const focusHandle = topStackFrameCell ?? executingCells[0].cellHandle;
      const cell = context.notebookEditor.getCellByHandle(focusHandle);
      if (cell) {
        context.notebookEditor.focusNotebookCell(cell, "container");
      }
    }
  }
  findCellAtTopFrame(accessor, notebook) {
    const debugService = accessor.get(IDebugService);
    for (const session of debugService.getModel().getSessions()) {
      for (const thread of session.getAllThreads()) {
        const sf = thread.getTopStackFrame();
        if (sf) {
          const parsed = CellUri.parse(sf.source.uri);
          if (parsed && parsed.notebook.toString() === notebook.toString()) {
            return parsed.handle;
          }
        }
      }
    }
    return void 0;
  }
});
registerAction2(class RevealLastFailedCellAction extends NotebookAction {
  constructor() {
    super({
      id: REVEAL_LAST_FAILED_CELL,
      title: localize("revealLastFailedCell", "Go to Most Recently Failed Cell"),
      tooltip: localize("revealLastFailedCell", "Go to Most Recently Failed Cell"),
      shortTitle: localize("revealLastFailedCellShort", "Go to Most Recently Failed Cell"),
      precondition: NOTEBOOK_LAST_CELL_FAILED,
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_LAST_CELL_FAILED,
            NOTEBOOK_HAS_RUNNING_CELL.toNegated(),
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true)
          ),
          group: "navigation",
          order: 0
        },
        {
          id: MenuId.NotebookCellExecuteGoTo,
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            NOTEBOOK_LAST_CELL_FAILED,
            NOTEBOOK_HAS_RUNNING_CELL.toNegated(),
            ContextKeyExpr.equals("config.notebook.globalToolbar", true)
          ),
          group: "navigation/execute",
          order: 20
        }
      ],
      icon: icons.errorStateIcon
    });
  }
  async runWithContext(accessor, context) {
    const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
    const notebook = context.notebookEditor.textModel.uri;
    const lastFailedCellHandle = notebookExecutionStateService.getLastFailedCellForNotebook(notebook);
    if (lastFailedCellHandle !== void 0) {
      const lastFailedCell = context.notebookEditor.getCellByHandle(lastFailedCellHandle);
      if (lastFailedCell) {
        context.notebookEditor.focusNotebookCell(lastFailedCell, "container");
      }
    }
  }
});
export {
  executeCondition,
  executeSectionCondition,
  executeThisCellCondition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxleGVjdXRlQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IENUWF9JTkxJTkVfQ0hBVF9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ2hhdC9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBpbnNlcnRDZWxsIH0gZnJvbSAnLi9jZWxsT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDRUxMX1RJVExFX0NFTExfR1JPVVBfSUQsIENlbGxUb29sYmFyT3JkZXIsIElOb3RlYm9va0FjdGlvbkNvbnRleHQsIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0LCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQsIElOb3RlYm9va0NvbW1hbmRDb250ZXh0LCBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQsIE5vdGVib29rQWN0aW9uLCBOb3RlYm9va0NlbGxBY3Rpb24sIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uLCBjZWxsRXhlY3V0aW9uQXJncywgZ2V0Q29udGV4dEZyb21BY3RpdmVFZGl0b3IsIGdldENvbnRleHRGcm9tVXJpLCBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MgfSBmcm9tICcuL2NvcmVBY3Rpb25zLmpzJztcbmltcG9ydCB7IENlbGxFZGl0U3RhdGUsIENlbGxGb2N1c01vZGUsIEVYRUNVVEVfQ0VMTF9DT01NQU5EX0lELCBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIElDZWxsVmlld01vZGVsLCBJRm9jdXNOb3RlYm9va0NlbGxPcHRpb25zLCBTY3JvbGxUb1JldmVhbEJlaGF2aW9yIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4uL25vdGVib29rSWNvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIENlbGxVcmksIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19DRUxMX0VYRUNVVElORywgTk9URUJPT0tfQ0VMTF9FWEVDVVRJT05fU1RBVEUsIE5PVEVCT09LX0NFTExfTElTVF9GT0NVU0VELCBOT1RFQk9PS19DRUxMX1RZUEUsIE5PVEVCT09LX0hBU19SVU5OSU5HX0NFTEwsIE5PVEVCT09LX0hBU19TT01FVEhJTkdfUlVOTklORywgTk9URUJPT0tfSU5URVJSVVBUSUJMRV9LRVJORUwsIE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX0tFUk5FTF9DT1VOVCwgTk9URUJPT0tfS0VSTkVMX1NPVVJDRV9DT1VOVCwgTk9URUJPT0tfTEFTVF9DRUxMX0ZBSUxFRCwgTk9URUJPT0tfTUlTU0lOR19LRVJORUxfRVhURU5TSU9OIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC9jb2RlQ2VsbFZpZXdNb2RlbC5qcyc7XG5cbmNvbnN0IEVYRUNVVEVfTk9URUJPT0tfQ09NTUFORF9JRCA9ICdub3RlYm9vay5leGVjdXRlJztcbmNvbnN0IENBTkNFTF9OT1RFQk9PS19DT01NQU5EX0lEID0gJ25vdGVib29rLmNhbmNlbEV4ZWN1dGlvbic7XG5jb25zdCBJTlRFUlJVUFRfTk9URUJPT0tfQ09NTUFORF9JRCA9ICdub3RlYm9vay5pbnRlcnJ1cHRFeGVjdXRpb24nO1xuY29uc3QgQ0FOQ0VMX0NFTExfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmNhbmNlbEV4ZWN1dGlvbic7XG5jb25zdCBFWEVDVVRFX0NFTExfRk9DVVNfQ09OVEFJTkVSX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5leGVjdXRlQW5kRm9jdXNDb250YWluZXInO1xuY29uc3QgRVhFQ1VURV9DRUxMX1NFTEVDVF9CRUxPVyA9ICdub3RlYm9vay5jZWxsLmV4ZWN1dGVBbmRTZWxlY3RCZWxvdyc7XG5jb25zdCBFWEVDVVRFX0NFTExfSU5TRVJUX0JFTE9XID0gJ25vdGVib29rLmNlbGwuZXhlY3V0ZUFuZEluc2VydEJlbG93JztcbmNvbnN0IEVYRUNVVEVfQ0VMTF9BTkRfQkVMT1cgPSAnbm90ZWJvb2suY2VsbC5leGVjdXRlQ2VsbEFuZEJlbG93JztcbmNvbnN0IEVYRUNVVEVfQ0VMTFNfQUJPVkUgPSAnbm90ZWJvb2suY2VsbC5leGVjdXRlQ2VsbHNBYm92ZSc7XG5jb25zdCBSRU5ERVJfQUxMX01BUktET1dOX0NFTExTID0gJ25vdGVib29rLnJlbmRlckFsbE1hcmtkb3duQ2VsbHMnO1xuY29uc3QgUkVWRUFMX1JVTk5JTkdfQ0VMTCA9ICdub3RlYm9vay5yZXZlYWxSdW5uaW5nQ2VsbCc7XG5jb25zdCBSRVZFQUxfTEFTVF9GQUlMRURfQ0VMTCA9ICdub3RlYm9vay5yZXZlYWxMYXN0RmFpbGVkQ2VsbCc7XG5cbi8vIElmIHRoaXMgY2hhbmdlcywgdXBkYXRlIGdldENvZGVDZWxsRXhlY3V0aW9uQ29udGV4dEtleVNlcnZpY2UgdG8gbWF0Y2hcbmV4cG9ydCBjb25zdCBleGVjdXRlQ29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHROT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdjb2RlJyksXG5cdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdENvbnRleHRLZXlFeHByLmdyZWF0ZXIoTk9URUJPT0tfS0VSTkVMX0NPVU5ULmtleSwgMCksXG5cdFx0Q29udGV4dEtleUV4cHIuZ3JlYXRlcihOT1RFQk9PS19LRVJORUxfU09VUkNFX0NPVU5ULmtleSwgMCksXG5cdFx0Tk9URUJPT0tfTUlTU0lOR19LRVJORUxfRVhURU5TSU9OXG5cdCkpO1xuXG5leHBvcnQgY29uc3QgZXhlY3V0ZVRoaXNDZWxsQ29uZGl0aW9uID0gQ29udGV4dEtleUV4cHIuYW5kKFxuXHRleGVjdXRlQ29uZGl0aW9uLFxuXHROT1RFQk9PS19DRUxMX0VYRUNVVElORy50b05lZ2F0ZWQoKSk7XG5cbmV4cG9ydCBjb25zdCBleGVjdXRlU2VjdGlvbkNvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0Tk9URUJPT0tfQ0VMTF9UWVBFLmlzRXF1YWxUbygnbWFya3VwJyksXG4pO1xuXG5mdW5jdGlvbiByZW5kZXJBbGxNYXJrZG93bkNlbGxzKGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiB2b2lkIHtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldExlbmd0aCgpOyBpKyspIHtcblx0XHRjb25zdCBjZWxsID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5jZWxsQXQoaSk7XG5cblx0XHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLlByZXZpZXcsICdyZW5kZXJBbGxNYXJrZG93bkNlbGxzJyk7XG5cdFx0fVxuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJ1bkNlbGwoZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQsIGVkaXRvclNlcnZpY2U/OiBJRWRpdG9yU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBncm91cCA9IGVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXA7XG5cblx0aWYgKGdyb3VwKSB7XG5cdFx0aWYgKGdyb3VwLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0Z3JvdXAucGluRWRpdG9yKGdyb3VwLmFjdGl2ZUVkaXRvcik7XG5cdFx0fVxuXHR9XG5cblx0Ly8gSWYgYXV0by1yZXZlYWwgaXMgZW5hYmxlZCwgZW5zdXJlIHRoZSBub3RlYm9vayBlZGl0b3IgaXMgdmlzaWJsZSBiZWZvcmUgcmV2ZWFsaW5nIGNlbGxzXG5cdGlmIChjb250ZXh0LmF1dG9SZXZlYWwgJiYgKGNvbnRleHQuY2VsbCB8fCBjb250ZXh0LnNlbGVjdGVkQ2VsbHM/Lmxlbmd0aCkgJiYgZWRpdG9yU2VydmljZSkge1xuXHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLnRleHRNb2RlbC51cmksIG9wdGlvbnM6IHsgcmV2ZWFsSWZPcGVuZWQ6IHRydWUgfSB9KTtcblx0fVxuXG5cdGlmIChjb250ZXh0LnVpICYmIGNvbnRleHQuY2VsbCkge1xuXHRcdGlmIChjb250ZXh0LmF1dG9SZXZlYWwpIHtcblx0XHRcdGhhbmRsZUF1dG9SZXZlYWwoY29udGV4dC5jZWxsLCBjb250ZXh0Lm5vdGVib29rRWRpdG9yKTtcblx0XHR9XG5cdFx0YXdhaXQgY29udGV4dC5ub3RlYm9va0VkaXRvci5leGVjdXRlTm90ZWJvb2tDZWxscyhJdGVyYWJsZS5zaW5nbGUoY29udGV4dC5jZWxsKSk7XG5cdH0gZWxzZSBpZiAoY29udGV4dC5zZWxlY3RlZENlbGxzPy5sZW5ndGggfHwgY29udGV4dC5jZWxsKSB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRDZWxscyA9IGNvbnRleHQuc2VsZWN0ZWRDZWxscz8ubGVuZ3RoID8gY29udGV4dC5zZWxlY3RlZENlbGxzIDogW2NvbnRleHQuY2VsbCFdO1xuXHRcdGNvbnN0IGZpcnN0Q2VsbCA9IHNlbGVjdGVkQ2VsbHNbMF07XG5cblx0XHRpZiAoZmlyc3RDZWxsICYmIGNvbnRleHQuYXV0b1JldmVhbCkge1xuXHRcdFx0aGFuZGxlQXV0b1JldmVhbChmaXJzdENlbGwsIGNvbnRleHQubm90ZWJvb2tFZGl0b3IpO1xuXHRcdH1cblx0XHRhd2FpdCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmV4ZWN1dGVOb3RlYm9va0NlbGxzKHNlbGVjdGVkQ2VsbHMpO1xuXHR9XG5cblx0bGV0IGZvdW5kRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBbLCBjb2RlRWRpdG9yXSBvZiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmNvZGVFZGl0b3JzKSB7XG5cdFx0aWYgKGlzRXF1YWwoY29kZUVkaXRvci5nZXRNb2RlbCgpPy51cmksIChjb250ZXh0LmNlbGwgPz8gY29udGV4dC5zZWxlY3RlZENlbGxzPy5bMF0pPy51cmkpKSB7XG5cdFx0XHRmb3VuZEVkaXRvciA9IGNvZGVFZGl0b3I7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRpZiAoIWZvdW5kRWRpdG9yKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cbmNvbnN0IFNNQVJUX1ZJRVdQT1JUX1RPUF9SRVZFQUxfUEFERElORyA9IDIwOyAvLyBlbm91Z2ggdG8gbm90IGN1dCBvZmYgdG9wIG9mIGNlbGwgdG9vbGJhclxuY29uc3QgU01BUlRfVklFV1BPUlRfQk9UVE9NX1JFVkVBTF9QQURESU5HID0gNjA7IC8vIGVub3VnaCB0byBzaG93IGZ1bGwgYm90dG9tIG9mIG91dHB1dCBlbGVtZW50ICsgdGlueSBidWZmZXIgYmVsb3cgdGhhdCB2ZXJ0aWNhbCBiYXJcbmZ1bmN0aW9uIGhhbmRsZUF1dG9SZXZlYWwoY2VsbDogSUNlbGxWaWV3TW9kZWwsIG5vdGVib29rRWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IpOiB2b2lkIHtcblx0Ly8gYWx3YXlzIGZvY3VzIHRoZSBjb250YWluZXIsIGJsdWUgYmFyIGlzIGEgZ29vZCB2aXN1YWwgYWlkIGluIHRyYWNraW5nIHdoYXQncyBoYXBwZW5pbmdcblx0bm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY2VsbCwgJ2NvbnRhaW5lcicsIHsgc2tpcFJldmVhbDogdHJ1ZSB9KTtcblxuXHQvLyBIYW5kbGUgbWFya3VwIGNlbGxzIHdpdGggc2ltcGxlIHJldmVhbFxuXHRpZiAoY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0Y29uc3QgY2VsbEluZGV4ID0gbm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGNlbGwpO1xuXHRcdG5vdGVib29rRWRpdG9yLnJldmVhbENlbGxSYW5nZUluVmlldyh7IHN0YXJ0OiBjZWxsSW5kZXgsIGVuZDogY2VsbEluZGV4ICsgMSB9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBFbnN1cmUgd2UncmUgd29ya2luZyB3aXRoIGEgY29kZSBjZWxsIC0gd2UgbmVlZCB0aGUgQ29kZUNlbGxWaWV3TW9kZWwgdHlwZSBmb3IgYWNjZXNzaW5nIGxheW91dCBwcm9wZXJ0aWVzIGxpa2Ugb3V0cHV0VG90YWxIZWlnaHRcblx0aWYgKCEoY2VsbCBpbnN0YW5jZW9mIENvZGVDZWxsVmlld01vZGVsKSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIEdldCBhbGwgZGltZW5zaW9uc1xuXHRjb25zdCBjZWxsRWRpdG9yU2Nyb2xsVG9wID0gbm90ZWJvb2tFZGl0b3IuZ2V0QWJzb2x1dGVUb3BPZkVsZW1lbnQoY2VsbCk7XG5cdGNvbnN0IGNlbGxFZGl0b3JTY3JvbGxCb3R0b20gPSBjZWxsRWRpdG9yU2Nyb2xsVG9wICsgY2VsbC5sYXlvdXRJbmZvLm91dHB1dENvbnRhaW5lck9mZnNldDtcblxuXHRjb25zdCBjZWxsT3V0cHV0SGVpZ2h0ID0gY2VsbC5sYXlvdXRJbmZvLm91dHB1dFRvdGFsSGVpZ2h0O1xuXHRjb25zdCBjZWxsT3V0cHV0U2Nyb2xsQm90dG9tID0gbm90ZWJvb2tFZGl0b3IuZ2V0QWJzb2x1dGVCb3R0b21PZkVsZW1lbnQoY2VsbCk7XG5cblx0Y29uc3Qgdmlld3BvcnRIZWlnaHQgPSBub3RlYm9va0VkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0O1xuXHRjb25zdCB2aWV3cG9ydEhlaWdodDM0ID0gdmlld3BvcnRIZWlnaHQgKiAwLjM0O1xuXHRjb25zdCB2aWV3cG9ydEhlaWdodDY2ID0gdmlld3BvcnRIZWlnaHQgKiAwLjY2O1xuXG5cdGNvbnN0IHRvdGFsSGVpZ2h0ID0gY2VsbC5sYXlvdXRJbmZvLnRvdGFsSGVpZ2h0O1xuXG5cdGNvbnN0IGlzRnVsbHlWaXNpYmxlID0gY2VsbEVkaXRvclNjcm9sbFRvcCA+PSBub3RlYm9va0VkaXRvci5zY3JvbGxUb3AgJiYgY2VsbE91dHB1dFNjcm9sbEJvdHRvbSA8PSBub3RlYm9va0VkaXRvci5zY3JvbGxCb3R0b207XG5cdGNvbnN0IGlzRWRpdG9yQm90dG9tVmlzaWJsZSA9ICgoY2VsbEVkaXRvclNjcm9sbEJvdHRvbSAtIDI1IC8qIHBhZGRpbmcgZm9yIHRoZSBjZWxsIHN0YXR1cyBiYXIgKi8pID49IG5vdGVib29rRWRpdG9yLnNjcm9sbFRvcCkgJiZcblx0XHQoKGNlbGxFZGl0b3JTY3JvbGxCb3R0b20gKyAyNSAvKiBwYWRkaW5nIHRvIHNlZSBhIHNsaXZlciBvZiB0aGUgYmVnaW5uaW5nIG9mIG91dHB1dHMgKi8pIDw9IG5vdGVib29rRWRpdG9yLnNjcm9sbEJvdHRvbSk7XG5cblx0Ly8gQ29tbW9uIHNjcm9sbGluZyBmdW5jdGlvbnNcblx0Y29uc3QgcmV2ZWFsV2l0aFRvcFBhZGRpbmcgPSAocG9zaXRpb246IG51bWJlcikgPT4geyBub3RlYm9va0VkaXRvci5zZXRTY3JvbGxUb3AocG9zaXRpb24gLSBTTUFSVF9WSUVXUE9SVF9UT1BfUkVWRUFMX1BBRERJTkcpOyB9O1xuXHRjb25zdCByZXZlYWxXaXRoTm9QYWRkaW5nID0gKHBvc2l0aW9uOiBudW1iZXIpID0+IHsgbm90ZWJvb2tFZGl0b3Iuc2V0U2Nyb2xsVG9wKHBvc2l0aW9uKTsgfTtcblx0Y29uc3QgcmV2ZWFsV2l0aEJvdHRvbVBhZGRpbmcgPSAocG9zaXRpb246IG51bWJlcikgPT4geyBub3RlYm9va0VkaXRvci5zZXRTY3JvbGxUb3AocG9zaXRpb24gKyBTTUFSVF9WSUVXUE9SVF9CT1RUT01fUkVWRUFMX1BBRERJTkcpOyB9O1xuXG5cdC8vIENBU0UgMDogVG90YWwgaXMgYWxyZWFkeSB2aXNpYmxlXG5cdGlmIChpc0Z1bGx5VmlzaWJsZSkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIENBU0UgMTogVG90YWwgZml0cyB3aXRoaW4gdmlld3BvcnRcblx0aWYgKHRvdGFsSGVpZ2h0IDw9IHZpZXdwb3J0SGVpZ2h0ICYmICFpc0VkaXRvckJvdHRvbVZpc2libGUpIHtcblx0XHRyZXZlYWxXaXRoVG9wUGFkZGluZyhjZWxsRWRpdG9yU2Nyb2xsVG9wKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBDQVNFIDI6IFRvdGFsIGRvZXNuJ3QgZml0IGluIHRoZSB2aWV3cG9ydFxuXHRpZiAodG90YWxIZWlnaHQgPiB2aWV3cG9ydEhlaWdodCAmJiAhaXNFZGl0b3JCb3R0b21WaXNpYmxlKSB7XG5cdFx0aWYgKGNlbGxPdXRwdXRIZWlnaHQgPiAwICYmIGNlbGxPdXRwdXRIZWlnaHQgPj0gdmlld3BvcnRIZWlnaHQ2Nikge1xuXHRcdFx0Ly8gaGFzIGxhcmdlIG91dHB1dHMgLS0gU2hvdyAzNCUgZWRpdG9yLCA2NiUgb3V0cHV0XG5cdFx0XHRyZXZlYWxXaXRoTm9QYWRkaW5nKGNlbGxFZGl0b3JTY3JvbGxCb3R0b20gLSB2aWV3cG9ydEhlaWdodDM0KTtcblx0XHR9IGVsc2UgaWYgKGNlbGxPdXRwdXRIZWlnaHQgPiAwKSB7XG5cdFx0XHQvLyBoYXMgc21hbGwgb3V0cHV0cyAtLSBTaG93IG91dHB1dCBhdCB2aWV3cG9ydCBib3R0b21cblx0XHRcdHJldmVhbFdpdGhCb3R0b21QYWRkaW5nKGNlbGxPdXRwdXRTY3JvbGxCb3R0b20gLSB2aWV3cG9ydEhlaWdodCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE5vIG91dHB1dHMsIGp1c3QgYmlnIGNlbGwgLS0gcHV0IGVkaXRvciBib3R0b20gQCAyLzMgb2Ygdmlld3BvcnQgaGVpZ2h0XG5cdFx0XHRyZXZlYWxXaXRoTm9QYWRkaW5nKGNlbGxFZGl0b3JTY3JvbGxCb3R0b20gLSB2aWV3cG9ydEhlaWdodDY2KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlbmRlckFsbE1hcmtkb3duQ2VsbHNBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSRU5ERVJfQUxMX01BUktET1dOX0NFTExTLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMucmVuZGVyTWFya2Rvd24nLCBcIlJlbmRlciBBbGwgTWFya2Rvd24gQ2VsbHNcIiksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJlbmRlckFsbE1hcmtkb3duQ2VsbHMoY29udGV4dCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhlY3V0ZU5vdGVib29rQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRVhFQ1VURV9OT1RFQk9PS19DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuZXhlY3V0ZU5vdGVib29rJywgXCJSdW4gQWxsXCIpLFxuXHRcdFx0aWNvbjogaWNvbnMuZXhlY3V0ZUFsbEljb24sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5leGVjdXRlTm90ZWJvb2snLCBcIlJ1biBBbGxcIiksXG5cdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRuYW1lOiAndXJpJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIGRvY3VtZW50IHVyaSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdG9yZGVyOiAtMSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihOT1RFQk9PS19JTlRFUlJVUFRJQkxFX0tFUk5FTC50b05lZ2F0ZWQoKSwgTk9URUJPT0tfSEFTX1NPTUVUSElOR19SVU5OSU5HLnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLm5vdGVib29rLmdsb2JhbFRvb2xiYXInLCB0cnVlKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tUb29sYmFyLFxuXHRcdFx0XHRcdG9yZGVyOiAtMSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24vZXhlY3V0ZScsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0lOVEVSUlVQVElCTEVfS0VSTkVMLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19IQVNfU09NRVRISU5HX1JVTk5JTkcudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0hBU19TT01FVEhJTkdfUlVOTklORywgTk9URUJPT0tfSU5URVJSVVBUSUJMRV9LRVJORUwudG9OZWdhdGVkKCkpPy5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLmdsb2JhbFRvb2xiYXInLCB0cnVlKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0RWRpdG9yQ29udGV4dEZyb21BcmdzT3JBY3RpdmUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBVcmlDb21wb25lbnRzKTogSU5vdGVib29rQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldENvbnRleHRGcm9tVXJpKGFjY2Vzc29yLCBjb250ZXh0KSA/PyBnZXRDb250ZXh0RnJvbUFjdGl2ZUVkaXRvcihhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpKTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmVuZGVyQWxsTWFya2Rvd25DZWxscyhjb250ZXh0KTtcblxuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvclNlcnZpY2UuZmluZEVkaXRvcnMoe1xuXHRcdFx0cmVzb3VyY2U6IGNvbnRleHQubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsLnVyaSxcblx0XHRcdHR5cGVJZDogTm90ZWJvb2tFZGl0b3JJbnB1dC5JRCxcblx0XHRcdGVkaXRvcklkOiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLnRleHRNb2RlbC52aWV3VHlwZVxuXHRcdH0pLmF0KDApO1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRjb25zdCBncm91cCA9IGVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChlZGl0b3IuZ3JvdXBJZCk7XG5cdFx0XHRncm91cD8ucGluRWRpdG9yKGVkaXRvci5lZGl0b3IpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmV4ZWN1dGVOb3RlYm9va0NlbGxzKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhlY3V0ZUNlbGwgZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFWEVDVVRFX0NFTExfQ09NTUFORF9JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogZXhlY3V0ZVRoaXNDZWxsQ29uZGl0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuZXhlY3V0ZScsIFwiRXhlY3V0ZSBDZWxsXCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3aW46IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkVudGVyXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGVQcmltYXJ5LFxuXHRcdFx0XHR3aGVuOiBleGVjdXRlVGhpc0NlbGxDb25kaXRpb24sXG5cdFx0XHRcdGdyb3VwOiAnaW5saW5lJ1xuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmV4ZWN1dGUnLCBcIkV4ZWN1dGUgQ2VsbFwiKSxcblx0XHRcdFx0YXJnczogY2VsbEV4ZWN1dGlvbkFyZ3Ncblx0XHRcdH0sXG5cdFx0XHRpY29uOiBpY29ucy5leGVjdXRlSWNvblxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcGFyc2VBcmdzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHBhcnNlTXVsdGlDZWxsRXhlY3V0aW9uQXJncyhhY2Nlc3NvciwgLi4uYXJncyk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JHcm91cHNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGlmIChjb250ZXh0LnVpKSB7XG5cdFx0XHRhd2FpdCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGNvbnRleHQuY2VsbCwgJ2NvbnRhaW5lcicsIHsgc2tpcFJldmVhbDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHRhd2FpdCBydW5DZWxsKGVkaXRvckdyb3Vwc1NlcnZpY2UsIGNvbnRleHQsIGVkaXRvclNlcnZpY2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4ZWN1dGVBYm92ZUNlbGxzIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRVhFQ1VURV9DRUxMU19BQk9WRSxcblx0XHRcdHByZWNvbmRpdGlvbjogZXhlY3V0ZUNvbmRpdGlvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmV4ZWN1dGVBYm92ZScsIFwiRXhlY3V0ZSBBYm92ZSBDZWxsc1wiKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsRXhlY3V0ZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRleGVjdXRlQ29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkUnVuQnV0dG9ufWAsIHRydWUpKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0XHRcdFx0XHRvcmRlcjogQ2VsbFRvb2xiYXJPcmRlci5FeGVjdXRlQWJvdmVDZWxscyxcblx0XHRcdFx0XHRncm91cDogQ0VMTF9USVRMRV9DRUxMX0dST1VQX0lELFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdGV4ZWN1dGVDb25kaXRpb24sXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRSdW5CdXR0b259YCwgZmFsc2UpKVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0aWNvbjogaWNvbnMuZXhlY3V0ZUFib3ZlSWNvblxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcGFyc2VBcmdzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHBhcnNlTXVsdGlDZWxsRXhlY3V0aW9uQXJncyhhY2Nlc3NvciwgLi4uYXJncyk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZW5kQ2VsbElkeDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZXh0LnVpKSB7XG5cdFx0XHRlbmRDZWxsSWR4ID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoY29udGV4dC5jZWxsKTtcblx0XHRcdGF3YWl0IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY29udGV4dC5jZWxsLCAnY29udGFpbmVyJywgeyBza2lwUmV2ZWFsOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbmRDZWxsSWR4ID0gTWF0aC5taW4oLi4uY29udGV4dC5zZWxlY3RlZENlbGxzLm1hcChjZWxsID0+IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGNlbGwpKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBlbmRDZWxsSWR4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB7IHN0YXJ0OiAwLCBlbmQ6IGVuZENlbGxJZHggfTtcblx0XHRcdGNvbnN0IGNlbGxzID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRDZWxsc0luUmFuZ2UocmFuZ2UpO1xuXHRcdFx0Y29udGV4dC5ub3RlYm9va0VkaXRvci5leGVjdXRlTm90ZWJvb2tDZWxscyhjZWxscyk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4ZWN1dGVDZWxsQW5kQmVsb3cgZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFWEVDVVRFX0NFTExfQU5EX0JFTE9XLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBleGVjdXRlQ29uZGl0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuZXhlY3V0ZUJlbG93JywgXCJFeGVjdXRlIENlbGwgYW5kIEJlbG93XCIpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxFeGVjdXRlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdGV4ZWN1dGVDb25kaXRpb24sXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRSdW5CdXR0b259YCwgdHJ1ZSkpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHRcdG9yZGVyOiBDZWxsVG9vbGJhck9yZGVyLkV4ZWN1dGVDZWxsQW5kQmVsb3csXG5cdFx0XHRcdFx0Z3JvdXA6IENFTExfVElUTEVfQ0VMTF9HUk9VUF9JRCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRleGVjdXRlQ29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkUnVuQnV0dG9ufWAsIGZhbHNlKSlcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGljb246IGljb25zLmV4ZWN1dGVCZWxvd0ljb25cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHBhcnNlQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHN0YXJ0Q2VsbElkeDogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChjb250ZXh0LnVpKSB7XG5cdFx0XHRzdGFydENlbGxJZHggPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChjb250ZXh0LmNlbGwpO1xuXHRcdFx0YXdhaXQgY29udGV4dC5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChjb250ZXh0LmNlbGwsICdjb250YWluZXInLCB7IHNraXBSZXZlYWw6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXJ0Q2VsbElkeCA9IE1hdGgubWluKC4uLmNvbnRleHQuc2VsZWN0ZWRDZWxscy5tYXAoY2VsbCA9PiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldENlbGxJbmRleChjZWxsKSkpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygc3RhcnRDZWxsSWR4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSB7IHN0YXJ0OiBzdGFydENlbGxJZHgsIGVuZDogY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRMZW5ndGgoKSB9O1xuXHRcdFx0Y29uc3QgY2VsbHMgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldENlbGxzSW5SYW5nZShyYW5nZSk7XG5cdFx0XHRjb250ZXh0Lm5vdGVib29rRWRpdG9yLmV4ZWN1dGVOb3RlYm9va0NlbGxzKGNlbGxzKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhlY3V0ZUNlbGxGb2N1c0NvbnRhaW5lciBleHRlbmRzIE5vdGVib29rTXVsdGlDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEVYRUNVVEVfQ0VMTF9GT0NVU19DT05UQUlORVJfQ09NTUFORF9JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogZXhlY3V0ZVRoaXNDZWxsQ29uZGl0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuZXhlY3V0ZUFuZEZvY3VzQ29udGFpbmVyJywgXCJFeGVjdXRlIENlbGwgYW5kIEZvY3VzIENvbnRhaW5lclwiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmV4ZWN1dGVBbmRGb2N1c0NvbnRhaW5lcicsIFwiRXhlY3V0ZSBDZWxsIGFuZCBGb2N1cyBDb250YWluZXJcIiksXG5cdFx0XHRcdGFyZ3M6IGNlbGxFeGVjdXRpb25BcmdzXG5cdFx0XHR9LFxuXHRcdFx0aWNvbjogaWNvbnMuZXhlY3V0ZUljb25cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHBhcnNlQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRpZiAoY29udGV4dC51aSkge1xuXHRcdFx0YXdhaXQgY29udGV4dC5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChjb250ZXh0LmNlbGwsICdjb250YWluZXInLCB7IHNraXBSZXZlYWw6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGZpcnN0Q2VsbCA9IGNvbnRleHQuc2VsZWN0ZWRDZWxsc1swXTtcblxuXHRcdFx0aWYgKGZpcnN0Q2VsbCkge1xuXHRcdFx0XHRhd2FpdCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGZpcnN0Q2VsbCwgJ2NvbnRhaW5lcicsIHsgc2tpcFJldmVhbDogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCBydW5DZWxsKGVkaXRvckdyb3Vwc1NlcnZpY2UsIGNvbnRleHQsIGVkaXRvclNlcnZpY2UpO1xuXHR9XG59KTtcblxuY29uc3QgY2VsbENhbmNlbENvbmRpdGlvbiA9IENvbnRleHRLZXlFeHByLm9yKFxuXHRDb250ZXh0S2V5RXhwci5lcXVhbHMoTk9URUJPT0tfQ0VMTF9FWEVDVVRJT05fU1RBVEUua2V5LCAnZXhlY3V0aW5nJyksXG5cdENvbnRleHRLZXlFeHByLmVxdWFscyhOT1RFQk9PS19DRUxMX0VYRUNVVElPTl9TVEFURS5rZXksICdwZW5kaW5nJyksXG4pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2FuY2VsRXhlY3V0ZUNlbGwgZXh0ZW5kcyBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDQU5DRUxfQ0VMTF9DT01NQU5EX0lELFxuXHRcdFx0cHJlY29uZGl0aW9uOiBjZWxsQ2FuY2VsQ29uZGl0aW9uLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuY2FuY2VsJywgXCJTdG9wIENlbGwgRXhlY3V0aW9uXCIpLFxuXHRcdFx0aWNvbjogaWNvbnMuc3RvcEljb24sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsRXhlY3V0ZVByaW1hcnksXG5cdFx0XHRcdHdoZW46IGNlbGxDYW5jZWxDb25kaXRpb24sXG5cdFx0XHRcdGdyb3VwOiAnaW5saW5lJ1xuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmNhbmNlbCcsIFwiU3RvcCBDZWxsIEV4ZWN1dGlvblwiKSxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdvcHRpb25zJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIGNlbGwgcmFuZ2Ugb3B0aW9ucycsXG5cdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0J3JlcXVpcmVkJzogWydyYW5nZXMnXSxcblx0XHRcdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3Jhbmdlcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdCdyZXF1aXJlZCc6IFsnc3RhcnQnLCAnZW5kJ10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnc3RhcnQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcidcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQnZW5kJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHQnZG9jdW1lbnQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSBkb2N1bWVudCB1cmknLFxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHBhcnNlQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogSU5vdGVib29rQ29tbWFuZENvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwYXJzZU11bHRpQ2VsbEV4ZWN1dGlvbkFyZ3MoYWNjZXNzb3IsIC4uLmFyZ3MpO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbnRleHQudWkpIHtcblx0XHRcdGF3YWl0IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY29udGV4dC5jZWxsLCAnY29udGFpbmVyJywgeyBza2lwUmV2ZWFsOiB0cnVlIH0pO1xuXHRcdFx0cmV0dXJuIGNvbnRleHQubm90ZWJvb2tFZGl0b3IuY2FuY2VsTm90ZWJvb2tDZWxscyhJdGVyYWJsZS5zaW5nbGUoY29udGV4dC5jZWxsKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmNhbmNlbE5vdGVib29rQ2VsbHMoY29udGV4dC5zZWxlY3RlZENlbGxzKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRXhlY3V0ZUNlbGxTZWxlY3RCZWxvdyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBFWEVDVVRFX0NFTExfU0VMRUNUX0JFTE9XLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihleGVjdXRlVGhpc0NlbGxDb25kaXRpb24sIE5PVEVCT09LX0NFTExfVFlQRS5pc0VxdWFsVG8oJ21hcmt1cCcpKSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmV4ZWN1dGVBbmRTZWxlY3RCZWxvdycsIFwiRXhlY3V0ZSBOb3RlYm9vayBDZWxsIGFuZCBTZWxlY3QgQmVsb3dcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCxcblx0XHRcdFx0XHRDVFhfSU5MSU5FX0NIQVRfRk9DVVNFRC5uZWdhdGUoKVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvckdyb3Vwc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGlkeCA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEluZGV4KGNvbnRleHQuY2VsbCk7XG5cdFx0aWYgKHR5cGVvZiBpZHggIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNjcm9sbEJlaGF2aW9yID0gY29uZmlnLmdldFZhbHVlKE5vdGVib29rU2V0dGluZy5zY3JvbGxUb1JldmVhbENlbGwpO1xuXHRcdGxldCBmb2N1c09wdGlvbnM6IElGb2N1c05vdGVib29rQ2VsbE9wdGlvbnM7XG5cdFx0aWYgKHNjcm9sbEJlaGF2aW9yID09PSAnbm9uZScpIHtcblx0XHRcdGZvY3VzT3B0aW9ucyA9IHsgc2tpcFJldmVhbDogdHJ1ZSB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb2N1c09wdGlvbnMgPSB7XG5cdFx0XHRcdHJldmVhbEJlaGF2aW9yOiBzY3JvbGxCZWhhdmlvciA9PT0gJ2Z1bGxDZWxsJyA/IFNjcm9sbFRvUmV2ZWFsQmVoYXZpb3IuZnVsbENlbGwgOiBTY3JvbGxUb1JldmVhbEJlaGF2aW9yLmZpcnN0TGluZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdGNvbnN0IG5leHRDZWxsID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5jZWxsQXQoaWR4ICsgMSk7XG5cdFx0XHRjb250ZXh0LmNlbGwudXBkYXRlRWRpdFN0YXRlKENlbGxFZGl0U3RhdGUuUHJldmlldywgRVhFQ1VURV9DRUxMX1NFTEVDVF9CRUxPVyk7XG5cdFx0XHRpZiAobmV4dENlbGwpIHtcblx0XHRcdFx0YXdhaXQgY29udGV4dC5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChuZXh0Q2VsbCwgJ2NvbnRhaW5lcicsIGZvY3VzT3B0aW9ucyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdDZWxsID0gaW5zZXJ0Q2VsbChsYW5ndWFnZVNlcnZpY2UsIGNvbnRleHQubm90ZWJvb2tFZGl0b3IsIGlkeCwgQ2VsbEtpbmQuTWFya3VwLCAnYmVsb3cnKTtcblxuXHRcdFx0XHRpZiAobmV3Q2VsbCkge1xuXHRcdFx0XHRcdGF3YWl0IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwobmV3Q2VsbCwgJ2VkaXRvcicsIGZvY3VzT3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbmV4dENlbGwgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmNlbGxBdChpZHggKyAxKTtcblx0XHRcdGlmIChuZXh0Q2VsbCkge1xuXHRcdFx0XHRhd2FpdCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKG5leHRDZWxsLCAnY29udGFpbmVyJywgZm9jdXNPcHRpb25zKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG5ld0NlbGwgPSBpbnNlcnRDZWxsKGxhbmd1YWdlU2VydmljZSwgY29udGV4dC5ub3RlYm9va0VkaXRvciwgaWR4LCBDZWxsS2luZC5Db2RlLCAnYmVsb3cnKTtcblxuXHRcdFx0XHRpZiAobmV3Q2VsbCkge1xuXHRcdFx0XHRcdGF3YWl0IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwobmV3Q2VsbCwgJ2VkaXRvcicsIGZvY3VzT3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJ1bkNlbGwoZWRpdG9yR3JvdXBzU2VydmljZSwgY29udGV4dCwgZWRpdG9yU2VydmljZSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEV4ZWN1dGVDZWxsSW5zZXJ0QmVsb3cgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRVhFQ1VURV9DRUxMX0lOU0VSVF9CRUxPVyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoZXhlY3V0ZVRoaXNDZWxsQ29uZGl0aW9uLCBOT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdtYXJrdXAnKSksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5leGVjdXRlQW5kSW5zZXJ0QmVsb3cnLCBcIkV4ZWN1dGUgTm90ZWJvb2sgQ2VsbCBhbmQgSW5zZXJ0IEJlbG93XCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yR3JvdXBzU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgaWR4ID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoY29udGV4dC5jZWxsKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0Y29uc3QgbmV3Rm9jdXNNb2RlID0gY29udGV4dC5jZWxsLmZvY3VzTW9kZSA9PT0gQ2VsbEZvY3VzTW9kZS5FZGl0b3IgPyAnZWRpdG9yJyA6ICdjb250YWluZXInO1xuXG5cdFx0Y29uc3QgbmV3Q2VsbCA9IGluc2VydENlbGwobGFuZ3VhZ2VTZXJ2aWNlLCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLCBpZHgsIGNvbnRleHQuY2VsbC5jZWxsS2luZCwgJ2JlbG93Jyk7XG5cdFx0aWYgKG5ld0NlbGwpIHtcblx0XHRcdGF3YWl0IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwobmV3Q2VsbCwgbmV3Rm9jdXNNb2RlKTtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dC5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdGNvbnRleHQuY2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCBFWEVDVVRFX0NFTExfSU5TRVJUX0JFTE9XKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cnVuQ2VsbChlZGl0b3JHcm91cHNTZXJ2aWNlLCBjb250ZXh0LCBlZGl0b3JTZXJ2aWNlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5jbGFzcyBDYW5jZWxOb3RlYm9vayBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0b3ZlcnJpZGUgZ2V0RWRpdG9yQ29udGV4dEZyb21BcmdzT3JBY3RpdmUoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBVcmlDb21wb25lbnRzKTogSU5vdGVib29rQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldENvbnRleHRGcm9tVXJpKGFjY2Vzc29yLCBjb250ZXh0KSA/PyBnZXRDb250ZXh0RnJvbUFjdGl2ZUVkaXRvcihhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpKTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIGNvbnRleHQubm90ZWJvb2tFZGl0b3IuY2FuY2VsTm90ZWJvb2tDZWxscygpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBDYW5jZWxBbGxOb3RlYm9vayBleHRlbmRzIENhbmNlbE5vdGVib29rIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENBTkNFTF9OT1RFQk9PS19DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2tBY3Rpb25zLmNhbmNlbE5vdGVib29rJywgXCJTdG9wIEV4ZWN1dGlvblwiKSxcblx0XHRcdGljb246IGljb25zLnN0b3BJY29uLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRvcmRlcjogLTEsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfSEFTX1NPTUVUSElOR19SVU5OSU5HLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfSU5URVJSVVBUSUJMRV9LRVJORUwudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5nbG9iYWxUb29sYmFyJywgdHJ1ZSlcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rVG9vbGJhcixcblx0XHRcdFx0XHRvcmRlcjogLTEsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uL2V4ZWN1dGUnLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0hBU19TT01FVEhJTkdfUlVOTklORyxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0lOVEVSUlVQVElCTEVfS0VSTkVMLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgSW50ZXJydXB0Tm90ZWJvb2sgZXh0ZW5kcyBDYW5jZWxOb3RlYm9vayB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBJTlRFUlJVUFRfTk9URUJPT0tfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rQWN0aW9ucy5pbnRlcnJ1cHROb3RlYm9vaycsIFwiSW50ZXJydXB0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdE5PVEVCT09LX0hBU19TT01FVEhJTkdfUlVOTklORyxcblx0XHRcdFx0Tk9URUJPT0tfSU5URVJSVVBUSUJMRV9LRVJORUxcblx0XHRcdCksXG5cdFx0XHRpY29uOiBpY29ucy5zdG9wSWNvbixcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdFx0XHRcdE5PVEVCT09LX0hBU19TT01FVEhJTkdfUlVOTklORyxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0lOVEVSUlVQVElCTEVfS0VSTkVMLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va1Rvb2xiYXIsXG5cdFx0XHRcdFx0b3JkZXI6IC0xLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbi9leGVjdXRlJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19IQVNfU09NRVRISU5HX1JVTk5JTkcsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19JTlRFUlJVUFRJQkxFX0tFUk5FTCxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLmdsb2JhbFRvb2xiYXInLCB0cnVlKVxuXHRcdFx0XHRcdClcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuSW50ZXJhY3RpdmVUb29sYmFyLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbi9leGVjdXRlJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTm90ZWJvb2tUb29sYmFyLCB7XG5cdHRpdGxlOiBsb2NhbGl6ZSgncmV2ZWFsUnVubmluZ0NlbGxTaG9ydCcsIFwiR28gVG9cIiksXG5cdHN1Ym1lbnU6IE1lbnVJZC5Ob3RlYm9va0NlbGxFeGVjdXRlR29Ubyxcblx0Z3JvdXA6ICduYXZpZ2F0aW9uL2V4ZWN1dGUnLFxuXHRvcmRlcjogMjAsXG5cdGljb246IFRoZW1lSWNvbi5tb2RpZnkoaWNvbnMuZXhlY3V0aW5nU3RhdGVJY29uLCAnc3BpbicpXG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJldmVhbFJ1bm5pbmdDZWxsQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUkVWRUFMX1JVTk5JTkdfQ0VMTCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgncmV2ZWFsUnVubmluZ0NlbGwnLCBcIkdvIHRvIFJ1bm5pbmcgQ2VsbFwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdyZXZlYWxSdW5uaW5nQ2VsbCcsIFwiR28gdG8gUnVubmluZyBDZWxsXCIpLFxuXHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUoJ3JldmVhbFJ1bm5pbmdDZWxsJywgXCJHbyB0byBSdW5uaW5nIENlbGxcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IE5PVEVCT09LX0hBU19SVU5OSU5HX0NFTEwsXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19IQVNfUlVOTklOR19DRUxMLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbEV4ZWN1dGVHb1RvLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19IQVNfUlVOTklOR19DRUxMLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24vZXhlY3V0ZScsXG5cdFx0XHRcdFx0b3JkZXI6IDIwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkludGVyYWN0aXZlVG9vbGJhcixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19IQVNfUlVOTklOR19DRUxMLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCAnd29ya2JlbmNoLmVkaXRvci5pbnRlcmFjdGl2ZScpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0aWNvbjogVGhlbWVJY29uLm1vZGlmeShpY29ucy5leGVjdXRpbmdTdGF0ZUljb24sICdzcGluJylcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RlYm9vayA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsLnVyaTtcblx0XHRjb25zdCBleGVjdXRpbmdDZWxscyA9IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb25zRm9yTm90ZWJvb2sobm90ZWJvb2spO1xuXHRcdGlmIChleGVjdXRpbmdDZWxsc1swXSkge1xuXHRcdFx0Y29uc3QgdG9wU3RhY2tGcmFtZUNlbGwgPSB0aGlzLmZpbmRDZWxsQXRUb3BGcmFtZShhY2Nlc3Nvciwgbm90ZWJvb2spO1xuXHRcdFx0Y29uc3QgZm9jdXNIYW5kbGUgPSB0b3BTdGFja0ZyYW1lQ2VsbCA/PyBleGVjdXRpbmdDZWxsc1swXS5jZWxsSGFuZGxlO1xuXHRcdFx0Y29uc3QgY2VsbCA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKGZvY3VzSGFuZGxlKTtcblx0XHRcdGlmIChjZWxsKSB7XG5cdFx0XHRcdGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY2VsbCwgJ2NvbnRhaW5lcicpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmluZENlbGxBdFRvcEZyYW1lKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBub3RlYm9vazogVVJJKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkZWJ1Z1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlYnVnU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldFNlc3Npb25zKCkpIHtcblx0XHRcdGZvciAoY29uc3QgdGhyZWFkIG9mIHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpKSB7XG5cdFx0XHRcdGNvbnN0IHNmID0gdGhyZWFkLmdldFRvcFN0YWNrRnJhbWUoKTtcblx0XHRcdFx0aWYgKHNmKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkID0gQ2VsbFVyaS5wYXJzZShzZi5zb3VyY2UudXJpKTtcblx0XHRcdFx0XHRpZiAocGFyc2VkICYmIHBhcnNlZC5ub3RlYm9vay50b1N0cmluZygpID09PSBub3RlYm9vay50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGFyc2VkLmhhbmRsZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJldmVhbExhc3RGYWlsZWRDZWxsQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUkVWRUFMX0xBU1RfRkFJTEVEX0NFTEwsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JldmVhbExhc3RGYWlsZWRDZWxsJywgXCJHbyB0byBNb3N0IFJlY2VudGx5IEZhaWxlZCBDZWxsXCIpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3JldmVhbExhc3RGYWlsZWRDZWxsJywgXCJHbyB0byBNb3N0IFJlY2VudGx5IEZhaWxlZCBDZWxsXCIpLFxuXHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUoJ3JldmVhbExhc3RGYWlsZWRDZWxsU2hvcnQnLCBcIkdvIHRvIE1vc3QgUmVjZW50bHkgRmFpbGVkIENlbGxcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IE5PVEVCT09LX0xBU1RfQ0VMTF9GQUlMRUQsXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19MQVNUX0NFTExfRkFJTEVELFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfSEFTX1JVTk5JTkdfQ0VMTC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLm5vdGVib29rLmdsb2JhbFRvb2xiYXInLCB0cnVlKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxFeGVjdXRlR29Ubyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfTEFTVF9DRUxMX0ZBSUxFRCxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0hBU19SVU5OSU5HX0NFTEwudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5nbG9iYWxUb29sYmFyJywgdHJ1ZSlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbi9leGVjdXRlJyxcblx0XHRcdFx0XHRvcmRlcjogMjBcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRpY29uOiBpY29ucy5lcnJvclN0YXRlSWNvbixcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblx0XHRjb25zdCBub3RlYm9vayA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsLnVyaTtcblx0XHRjb25zdCBsYXN0RmFpbGVkQ2VsbEhhbmRsZSA9IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldExhc3RGYWlsZWRDZWxsRm9yTm90ZWJvb2sobm90ZWJvb2spO1xuXHRcdGlmIChsYXN0RmFpbGVkQ2VsbEhhbmRsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBsYXN0RmFpbGVkQ2VsbCA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuZ2V0Q2VsbEJ5SGFuZGxlKGxhc3RGYWlsZWRDZWxsSGFuZGxlKTtcblx0XHRcdGlmIChsYXN0RmFpbGVkQ2VsbCkge1xuXHRcdFx0XHRjb250ZXh0Lm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGxhc3RGYWlsZWRDZWxsLCAnY29udGFpbmVyJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUcxQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsUUFBUSxjQUFjLHVCQUF1QjtBQUN0RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDBCQUEwQixrQkFBa0ksc0NBQXNDLGdCQUFnQixvQkFBb0IseUJBQXlCLG1CQUFtQiw0QkFBNEIsbUJBQW1CLG1DQUFtQztBQUM3VyxTQUFTLGVBQWUsZUFBZSx5QkFBMkYsOEJBQThCO0FBQ2hLLFlBQVksV0FBVztBQUN2QixTQUFTLFVBQVUsU0FBUyx1QkFBdUI7QUFDbkQsU0FBUyx5QkFBeUIsK0JBQStCLDRCQUE0QixvQkFBb0IsMkJBQTJCLGdDQUFnQywrQkFBK0IsMkJBQTJCLHVCQUF1Qiw4QkFBOEIsMkJBQTJCLHlDQUF5QztBQUMvVixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLDhCQUE4QjtBQUNwQyxNQUFNLDZCQUE2QjtBQUNuQyxNQUFNLGdDQUFnQztBQUN0QyxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLDBDQUEwQztBQUNoRCxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLHlCQUF5QjtBQUMvQixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLHNCQUFzQjtBQUM1QixNQUFNLDBCQUEwQjtBQUd6QixNQUFNLG1CQUFtQixlQUFlO0FBQUEsRUFDOUMsbUJBQW1CLFVBQVUsTUFBTTtBQUFBLEVBQ25DLGVBQWU7QUFBQSxJQUNkLGVBQWUsUUFBUSxzQkFBc0IsS0FBSyxDQUFDO0FBQUEsSUFDbkQsZUFBZSxRQUFRLDZCQUE2QixLQUFLLENBQUM7QUFBQSxJQUMxRDtBQUFBLEVBQ0Q7QUFBQztBQUVLLE1BQU0sMkJBQTJCLGVBQWU7QUFBQSxFQUN0RDtBQUFBLEVBQ0Esd0JBQXdCLFVBQVU7QUFBQztBQUU3QixNQUFNLDBCQUEwQixlQUFlO0FBQUEsRUFDckQsbUJBQW1CLFVBQVUsUUFBUTtBQUN0QztBQUVBLFNBQVMsdUJBQXVCLFNBQXVDO0FBQ3RFLFdBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxlQUFlLFVBQVUsR0FBRyxLQUFLO0FBQzVELFVBQU0sT0FBTyxRQUFRLGVBQWUsT0FBTyxDQUFDO0FBRTVDLFFBQUksS0FBSyxhQUFhLFNBQVMsUUFBUTtBQUN0QyxXQUFLLGdCQUFnQixjQUFjLFNBQVMsd0JBQXdCO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxlQUFlLFFBQVEscUJBQTJDLFNBQWlDLGVBQStDO0FBQ2pKLFFBQU0sUUFBUSxvQkFBb0I7QUFFbEMsTUFBSSxPQUFPO0FBQ1YsUUFBSSxNQUFNLGNBQWM7QUFDdkIsWUFBTSxVQUFVLE1BQU0sWUFBWTtBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUdBLE1BQUksUUFBUSxlQUFlLFFBQVEsUUFBUSxRQUFRLGVBQWUsV0FBVyxlQUFlO0FBQzNGLGtCQUFjLFdBQVcsRUFBRSxVQUFVLFFBQVEsZUFBZSxVQUFVLEtBQUssU0FBUyxFQUFFLGdCQUFnQixLQUFLLEVBQUUsQ0FBQztBQUFBLEVBQy9HO0FBRUEsTUFBSSxRQUFRLE1BQU0sUUFBUSxNQUFNO0FBQy9CLFFBQUksUUFBUSxZQUFZO0FBQ3ZCLHVCQUFpQixRQUFRLE1BQU0sUUFBUSxjQUFjO0FBQUEsSUFDdEQ7QUFDQSxVQUFNLFFBQVEsZUFBZSxxQkFBcUIsU0FBUyxPQUFPLFFBQVEsSUFBSSxDQUFDO0FBQUEsRUFDaEYsV0FBVyxRQUFRLGVBQWUsVUFBVSxRQUFRLE1BQU07QUFDekQsVUFBTSxnQkFBZ0IsUUFBUSxlQUFlLFNBQVMsUUFBUSxnQkFBZ0IsQ0FBQyxRQUFRLElBQUs7QUFDNUYsVUFBTSxZQUFZLGNBQWMsQ0FBQztBQUVqQyxRQUFJLGFBQWEsUUFBUSxZQUFZO0FBQ3BDLHVCQUFpQixXQUFXLFFBQVEsY0FBYztBQUFBLElBQ25EO0FBQ0EsVUFBTSxRQUFRLGVBQWUscUJBQXFCLGFBQWE7QUFBQSxFQUNoRTtBQUVBLE1BQUksY0FBdUM7QUFDM0MsYUFBVyxDQUFDLEVBQUUsVUFBVSxLQUFLLFFBQVEsZUFBZSxhQUFhO0FBQ2hFLFFBQUksUUFBUSxXQUFXLFNBQVMsR0FBRyxNQUFNLFFBQVEsUUFBUSxRQUFRLGdCQUFnQixDQUFDLElBQUksR0FBRyxHQUFHO0FBQzNGLG9CQUFjO0FBQ2Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLE1BQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSxvQ0FBb0M7QUFDMUMsTUFBTSx1Q0FBdUM7QUFDN0MsU0FBUyxpQkFBaUIsTUFBc0IsZ0JBQTZDO0FBRTVGLGlCQUFlLGtCQUFrQixNQUFNLGFBQWEsRUFBRSxZQUFZLEtBQUssQ0FBQztBQUd4RSxNQUFJLEtBQUssYUFBYSxTQUFTLFFBQVE7QUFDdEMsVUFBTSxZQUFZLGVBQWUsYUFBYSxJQUFJO0FBQ2xELG1CQUFlLHNCQUFzQixFQUFFLE9BQU8sV0FBVyxLQUFLLFlBQVksRUFBRSxDQUFDO0FBQzdFO0FBQUEsRUFDRDtBQUdBLE1BQUksRUFBRSxnQkFBZ0Isb0JBQW9CO0FBQ3pDO0FBQUEsRUFDRDtBQUdBLFFBQU0sc0JBQXNCLGVBQWUsd0JBQXdCLElBQUk7QUFDdkUsUUFBTSx5QkFBeUIsc0JBQXNCLEtBQUssV0FBVztBQUVyRSxRQUFNLG1CQUFtQixLQUFLLFdBQVc7QUFDekMsUUFBTSx5QkFBeUIsZUFBZSwyQkFBMkIsSUFBSTtBQUU3RSxRQUFNLGlCQUFpQixlQUFlLGNBQWMsRUFBRTtBQUN0RCxRQUFNLG1CQUFtQixpQkFBaUI7QUFDMUMsUUFBTSxtQkFBbUIsaUJBQWlCO0FBRTFDLFFBQU0sY0FBYyxLQUFLLFdBQVc7QUFFcEMsUUFBTSxpQkFBaUIsdUJBQXVCLGVBQWUsYUFBYSwwQkFBMEIsZUFBZTtBQUNuSCxRQUFNLHdCQUEwQix5QkFBeUIsTUFBNkMsZUFBZSxhQUNsSCx5QkFBeUIsTUFBaUUsZUFBZTtBQUc1RyxRQUFNLHVCQUF1QixDQUFDLGFBQXFCO0FBQUUsbUJBQWUsYUFBYSxXQUFXLGlDQUFpQztBQUFBLEVBQUc7QUFDaEksUUFBTSxzQkFBc0IsQ0FBQyxhQUFxQjtBQUFFLG1CQUFlLGFBQWEsUUFBUTtBQUFBLEVBQUc7QUFDM0YsUUFBTSwwQkFBMEIsQ0FBQyxhQUFxQjtBQUFFLG1CQUFlLGFBQWEsV0FBVyxvQ0FBb0M7QUFBQSxFQUFHO0FBR3RJLE1BQUksZ0JBQWdCO0FBQ25CO0FBQUEsRUFDRDtBQUdBLE1BQUksZUFBZSxrQkFBa0IsQ0FBQyx1QkFBdUI7QUFDNUQseUJBQXFCLG1CQUFtQjtBQUN4QztBQUFBLEVBQ0Q7QUFHQSxNQUFJLGNBQWMsa0JBQWtCLENBQUMsdUJBQXVCO0FBQzNELFFBQUksbUJBQW1CLEtBQUssb0JBQW9CLGtCQUFrQjtBQUVqRSwwQkFBb0IseUJBQXlCLGdCQUFnQjtBQUFBLElBQzlELFdBQVcsbUJBQW1CLEdBQUc7QUFFaEMsOEJBQXdCLHlCQUF5QixjQUFjO0FBQUEsSUFDaEUsT0FBTztBQUVOLDBCQUFvQix5QkFBeUIsZ0JBQWdCO0FBQUEsSUFDOUQ7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxnQkFBZ0IsTUFBTSxxQ0FBcUMsZUFBZTtBQUFBLEVBQ3pFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsa0NBQWtDLDJCQUEyQjtBQUFBLElBQzlFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBZ0Q7QUFDaEcsMkJBQXVCLE9BQU87QUFBQSxFQUMvQjtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSw4QkFBOEIsZUFBZTtBQUFBLEVBQ2xFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsbUNBQW1DLFNBQVM7QUFBQSxNQUM1RCxNQUFNLE1BQU07QUFBQSxNQUNaLFVBQVU7QUFBQSxRQUNULGFBQWEsU0FBUyxtQ0FBbUMsU0FBUztBQUFBLFFBQ2xFLE1BQU07QUFBQSxVQUNMO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixhQUFhO0FBQUEsVUFDZDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsVUFDUCxNQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLFlBQ0EsZUFBZSxHQUFHLDhCQUE4QixVQUFVLEdBQUcsK0JBQStCLFVBQVUsQ0FBQztBQUFBLFlBQ3ZHLGVBQWUsVUFBVSxpQ0FBaUMsSUFBSTtBQUFBLFVBQy9EO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlO0FBQUEsWUFDcEIsZUFBZTtBQUFBLGNBQ2QsOEJBQThCLFVBQVU7QUFBQSxjQUN4QywrQkFBK0IsVUFBVTtBQUFBLFlBQzFDO0FBQUEsWUFDQSxlQUFlLElBQUksZ0NBQWdDLDhCQUE4QixVQUFVLENBQUMsR0FBRyxPQUFPO0FBQUEsWUFDdEcsZUFBZSxPQUFPLGlDQUFpQyxJQUFJO0FBQUEsVUFDNUQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLGlDQUFpQyxVQUE0QixTQUE2RDtBQUNsSSxXQUFPLGtCQUFrQixVQUFVLE9BQU8sS0FBSywyQkFBMkIsU0FBUyxJQUFJLGNBQWMsQ0FBQztBQUFBLEVBQ3ZHO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBZ0Q7QUFDaEcsMkJBQXVCLE9BQU87QUFFOUIsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxTQUFTLGNBQWMsWUFBWTtBQUFBLE1BQ3hDLFVBQVUsUUFBUSxlQUFlLFVBQVU7QUFBQSxNQUMzQyxRQUFRLG9CQUFvQjtBQUFBLE1BQzVCLFVBQVUsUUFBUSxlQUFlLFVBQVU7QUFBQSxJQUM1QyxDQUFDLEVBQUUsR0FBRyxDQUFDO0FBQ1AsVUFBTSxxQkFBcUIsU0FBUyxJQUFJLG9CQUFvQjtBQUU1RCxRQUFJLFFBQVE7QUFDWCxZQUFNLFFBQVEsbUJBQW1CLFNBQVMsT0FBTyxPQUFPO0FBQ3hELGFBQU8sVUFBVSxPQUFPLE1BQU07QUFBQSxJQUMvQjtBQUVBLFdBQU8sUUFBUSxlQUFlLHFCQUFxQjtBQUFBLEVBQ3BEO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixNQUFNLG9CQUFvQix3QkFBd0I7QUFBQSxFQUNqRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsT0FBTyxTQUFTLDJCQUEyQixjQUFjO0FBQUEsTUFDekQsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLFFBQ04sU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLFFBQ2xDLEtBQUs7QUFBQSxVQUNKLFNBQVMsT0FBTyxVQUFVLE9BQU8sTUFBTSxRQUFRO0FBQUEsUUFDaEQ7QUFBQSxRQUNBLFFBQVE7QUFBQSxNQUNUO0FBQUEsTUFDQSxNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDVCxhQUFhLFNBQVMsMkJBQTJCLGNBQWM7QUFBQSxRQUMvRCxNQUFNO0FBQUEsTUFDUDtBQUFBLE1BQ0EsTUFBTSxNQUFNO0FBQUEsSUFDYixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsVUFBVSxhQUErQixNQUFzRDtBQUN2RyxXQUFPLDRCQUE0QixVQUFVLEdBQUcsSUFBSTtBQUFBLEVBQ3JEO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUY7QUFDckksVUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUVqRCxRQUFJLFFBQVEsSUFBSTtBQUNmLFlBQU0sUUFBUSxlQUFlLGtCQUFrQixRQUFRLE1BQU0sYUFBYSxFQUFFLFlBQVksS0FBSyxDQUFDO0FBQUEsSUFDL0Y7QUFFQSxVQUFNLFFBQVEscUJBQXFCLFNBQVMsYUFBYTtBQUFBLEVBQzFEO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixNQUFNLDBCQUEwQix3QkFBd0I7QUFBQSxFQUN2RSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsT0FBTyxTQUFTLGdDQUFnQyxxQkFBcUI7QUFBQSxNQUNyRSxNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxNQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLFlBQ0EsZUFBZSxPQUFPLFVBQVUsZ0JBQWdCLHFCQUFxQixJQUFJLElBQUk7QUFBQSxVQUFDO0FBQUEsUUFDaEY7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU8saUJBQWlCO0FBQUEsVUFDeEIsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxZQUNBLGVBQWUsT0FBTyxVQUFVLGdCQUFnQixxQkFBcUIsSUFBSSxLQUFLO0FBQUEsVUFBQztBQUFBLFFBQ2pGO0FBQUEsTUFDRDtBQUFBLE1BQ0EsTUFBTSxNQUFNO0FBQUEsSUFDYixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsVUFBVSxhQUErQixNQUFzRDtBQUN2RyxXQUFPLDRCQUE0QixVQUFVLEdBQUcsSUFBSTtBQUFBLEVBQ3JEO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBcUY7QUFDckksUUFBSSxhQUFpQztBQUNyQyxRQUFJLFFBQVEsSUFBSTtBQUNmLG1CQUFhLFFBQVEsZUFBZSxhQUFhLFFBQVEsSUFBSTtBQUM3RCxZQUFNLFFBQVEsZUFBZSxrQkFBa0IsUUFBUSxNQUFNLGFBQWEsRUFBRSxZQUFZLEtBQUssQ0FBQztBQUFBLElBQy9GLE9BQU87QUFDTixtQkFBYSxLQUFLLElBQUksR0FBRyxRQUFRLGNBQWMsSUFBSSxVQUFRLFFBQVEsZUFBZSxhQUFhLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFDdEc7QUFFQSxRQUFJLE9BQU8sZUFBZSxVQUFVO0FBQ25DLFlBQU0sUUFBUSxFQUFFLE9BQU8sR0FBRyxLQUFLLFdBQVc7QUFDMUMsWUFBTSxRQUFRLFFBQVEsZUFBZSxnQkFBZ0IsS0FBSztBQUMxRCxjQUFRLGVBQWUscUJBQXFCLEtBQUs7QUFBQSxJQUNsRDtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sNEJBQTRCLHdCQUF3QjtBQUFBLEVBQ3pFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxPQUFPLFNBQVMsZ0NBQWdDLHdCQUF3QjtBQUFBLE1BQ3hFLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZTtBQUFBLFlBQ3BCO0FBQUEsWUFDQSxlQUFlLE9BQU8sVUFBVSxnQkFBZ0IscUJBQXFCLElBQUksSUFBSTtBQUFBLFVBQUM7QUFBQSxRQUNoRjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTyxpQkFBaUI7QUFBQSxVQUN4QixPQUFPO0FBQUEsVUFDUCxNQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLFlBQ0EsZUFBZSxPQUFPLFVBQVUsZ0JBQWdCLHFCQUFxQixJQUFJLEtBQUs7QUFBQSxVQUFDO0FBQUEsUUFDakY7QUFBQSxNQUNEO0FBQUEsTUFDQSxNQUFNLE1BQU07QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxVQUFVLGFBQStCLE1BQXNEO0FBQ3ZHLFdBQU8sNEJBQTRCLFVBQVUsR0FBRyxJQUFJO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxRQUFJLGVBQW1DO0FBQ3ZDLFFBQUksUUFBUSxJQUFJO0FBQ2YscUJBQWUsUUFBUSxlQUFlLGFBQWEsUUFBUSxJQUFJO0FBQy9ELFlBQU0sUUFBUSxlQUFlLGtCQUFrQixRQUFRLE1BQU0sYUFBYSxFQUFFLFlBQVksS0FBSyxDQUFDO0FBQUEsSUFDL0YsT0FBTztBQUNOLHFCQUFlLEtBQUssSUFBSSxHQUFHLFFBQVEsY0FBYyxJQUFJLFVBQVEsUUFBUSxlQUFlLGFBQWEsSUFBSSxDQUFDLENBQUM7QUFBQSxJQUN4RztBQUVBLFFBQUksT0FBTyxpQkFBaUIsVUFBVTtBQUNyQyxZQUFNLFFBQVEsRUFBRSxPQUFPLGNBQWMsS0FBSyxRQUFRLGVBQWUsVUFBVSxFQUFFO0FBQzdFLFlBQU0sUUFBUSxRQUFRLGVBQWUsZ0JBQWdCLEtBQUs7QUFDMUQsY0FBUSxlQUFlLHFCQUFxQixLQUFLO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixNQUFNLGtDQUFrQyx3QkFBd0I7QUFBQSxFQUMvRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsT0FBTyxTQUFTLDRDQUE0QyxrQ0FBa0M7QUFBQSxNQUM5RixVQUFVO0FBQUEsUUFDVCxhQUFhLFNBQVMsNENBQTRDLGtDQUFrQztBQUFBLFFBQ3BHLE1BQU07QUFBQSxNQUNQO0FBQUEsTUFDQSxNQUFNLE1BQU07QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxVQUFVLGFBQStCLE1BQXNEO0FBQ3ZHLFdBQU8sNEJBQTRCLFVBQVUsR0FBRyxJQUFJO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxVQUFNLHNCQUFzQixTQUFTLElBQUksb0JBQW9CO0FBQzdELFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBRWpELFFBQUksUUFBUSxJQUFJO0FBQ2YsWUFBTSxRQUFRLGVBQWUsa0JBQWtCLFFBQVEsTUFBTSxhQUFhLEVBQUUsWUFBWSxLQUFLLENBQUM7QUFBQSxJQUMvRixPQUFPO0FBQ04sWUFBTSxZQUFZLFFBQVEsY0FBYyxDQUFDO0FBRXpDLFVBQUksV0FBVztBQUNkLGNBQU0sUUFBUSxlQUFlLGtCQUFrQixXQUFXLGFBQWEsRUFBRSxZQUFZLEtBQUssQ0FBQztBQUFBLE1BQzVGO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxxQkFBcUIsU0FBUyxhQUFhO0FBQUEsRUFDMUQ7QUFDRCxDQUFDO0FBRUQsTUFBTSxzQkFBc0IsZUFBZTtBQUFBLEVBQzFDLGVBQWUsT0FBTyw4QkFBOEIsS0FBSyxXQUFXO0FBQUEsRUFDcEUsZUFBZSxPQUFPLDhCQUE4QixLQUFLLFNBQVM7QUFDbkU7QUFFQSxnQkFBZ0IsTUFBTSwwQkFBMEIsd0JBQXdCO0FBQUEsRUFDdkUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE9BQU8sU0FBUywwQkFBMEIscUJBQXFCO0FBQUEsTUFDL0QsTUFBTSxNQUFNO0FBQUEsTUFDWixNQUFNO0FBQUEsUUFDTCxJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDVCxhQUFhLFNBQVMsMEJBQTBCLHFCQUFxQjtBQUFBLFFBQ3JFLE1BQU07QUFBQSxVQUNMO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixhQUFhO0FBQUEsWUFDYixRQUFRO0FBQUEsY0FDUCxRQUFRO0FBQUEsY0FDUixZQUFZLENBQUMsUUFBUTtBQUFBLGNBQ3JCLGNBQWM7QUFBQSxnQkFDYixVQUFVO0FBQUEsa0JBQ1QsUUFBUTtBQUFBLGtCQUNSLE9BQU87QUFBQSxvQkFDTjtBQUFBLHNCQUNDLFFBQVE7QUFBQSxzQkFDUixZQUFZLENBQUMsU0FBUyxLQUFLO0FBQUEsc0JBQzNCLGNBQWM7QUFBQSx3QkFDYixTQUFTO0FBQUEsMEJBQ1IsUUFBUTtBQUFBLHdCQUNUO0FBQUEsd0JBQ0EsT0FBTztBQUFBLDBCQUNOLFFBQVE7QUFBQSx3QkFDVDtBQUFBLHNCQUNEO0FBQUEsb0JBQ0Q7QUFBQSxrQkFDRDtBQUFBLGdCQUNEO0FBQUEsZ0JBQ0EsWUFBWTtBQUFBLGtCQUNYLFFBQVE7QUFBQSxrQkFDUixlQUFlO0FBQUEsZ0JBQ2hCO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxVQUFVLGFBQStCLE1BQXNEO0FBQ3ZHLFdBQU8sNEJBQTRCLFVBQVUsR0FBRyxJQUFJO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFxRjtBQUNySSxRQUFJLFFBQVEsSUFBSTtBQUNmLFlBQU0sUUFBUSxlQUFlLGtCQUFrQixRQUFRLE1BQU0sYUFBYSxFQUFFLFlBQVksS0FBSyxDQUFDO0FBQzlGLGFBQU8sUUFBUSxlQUFlLG9CQUFvQixTQUFTLE9BQU8sUUFBUSxJQUFJLENBQUM7QUFBQSxJQUNoRixPQUFPO0FBQ04sYUFBTyxRQUFRLGVBQWUsb0JBQW9CLFFBQVEsYUFBYTtBQUFBLElBQ3hFO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSwrQkFBK0IsbUJBQW1CO0FBQUEsRUFDdkUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLGNBQWMsZUFBZSxHQUFHLDBCQUEwQixtQkFBbUIsVUFBVSxRQUFRLENBQUM7QUFBQSxNQUNoRyxPQUFPLFNBQVMseUNBQXlDLHdDQUF3QztBQUFBLE1BQ2pHLFlBQVk7QUFBQSxRQUNYLE1BQU0sZUFBZTtBQUFBLFVBQ3BCO0FBQUEsVUFDQSx3QkFBd0IsT0FBTztBQUFBLFFBQ2hDO0FBQUEsUUFDQSxTQUFTLE9BQU8sUUFBUSxRQUFRO0FBQUEsUUFDaEMsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBb0Q7QUFDcEcsVUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLE1BQU0sUUFBUSxlQUFlLGFBQWEsUUFBUSxJQUFJO0FBQzVELFFBQUksT0FBTyxRQUFRLFVBQVU7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUVyRCxVQUFNLFNBQVMsU0FBUyxJQUFJLHFCQUFxQjtBQUNqRCxVQUFNLGlCQUFpQixPQUFPLFNBQVMsZ0JBQWdCLGtCQUFrQjtBQUN6RSxRQUFJO0FBQ0osUUFBSSxtQkFBbUIsUUFBUTtBQUM5QixxQkFBZSxFQUFFLFlBQVksS0FBSztBQUFBLElBQ25DLE9BQU87QUFDTixxQkFBZTtBQUFBLFFBQ2QsZ0JBQWdCLG1CQUFtQixhQUFhLHVCQUF1QixXQUFXLHVCQUF1QjtBQUFBLE1BQzFHO0FBQUEsSUFDRDtBQUVBLFFBQUksUUFBUSxLQUFLLGFBQWEsU0FBUyxRQUFRO0FBQzlDLFlBQU0sV0FBVyxRQUFRLGVBQWUsT0FBTyxNQUFNLENBQUM7QUFDdEQsY0FBUSxLQUFLLGdCQUFnQixjQUFjLFNBQVMseUJBQXlCO0FBQzdFLFVBQUksVUFBVTtBQUNiLGNBQU0sUUFBUSxlQUFlLGtCQUFrQixVQUFVLGFBQWEsWUFBWTtBQUFBLE1BQ25GLE9BQU87QUFDTixjQUFNLFVBQVUsV0FBVyxpQkFBaUIsUUFBUSxnQkFBZ0IsS0FBSyxTQUFTLFFBQVEsT0FBTztBQUVqRyxZQUFJLFNBQVM7QUFDWixnQkFBTSxRQUFRLGVBQWUsa0JBQWtCLFNBQVMsVUFBVSxZQUFZO0FBQUEsUUFDL0U7QUFBQSxNQUNEO0FBQ0E7QUFBQSxJQUNELE9BQU87QUFDTixZQUFNLFdBQVcsUUFBUSxlQUFlLE9BQU8sTUFBTSxDQUFDO0FBQ3RELFVBQUksVUFBVTtBQUNiLGNBQU0sUUFBUSxlQUFlLGtCQUFrQixVQUFVLGFBQWEsWUFBWTtBQUFBLE1BQ25GLE9BQU87QUFDTixjQUFNLFVBQVUsV0FBVyxpQkFBaUIsUUFBUSxnQkFBZ0IsS0FBSyxTQUFTLE1BQU0sT0FBTztBQUUvRixZQUFJLFNBQVM7QUFDWixnQkFBTSxRQUFRLGVBQWUsa0JBQWtCLFNBQVMsVUFBVSxZQUFZO0FBQUEsUUFDL0U7QUFBQSxNQUNEO0FBRUEsYUFBTyxRQUFRLHFCQUFxQixTQUFTLGFBQWE7QUFBQSxJQUMzRDtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sK0JBQStCLG1CQUFtQjtBQUFBLEVBQ3ZFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixjQUFjLGVBQWUsR0FBRywwQkFBMEIsbUJBQW1CLFVBQVUsUUFBUSxDQUFDO0FBQUEsTUFDaEcsT0FBTyxTQUFTLHlDQUF5Qyx3Q0FBd0M7QUFBQSxNQUNqRyxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsUUFDTixTQUFTLE9BQU8sTUFBTSxRQUFRO0FBQUEsUUFDOUIsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLGVBQWUsVUFBNEIsU0FBb0Q7QUFDcEcsVUFBTSxzQkFBc0IsU0FBUyxJQUFJLG9CQUFvQjtBQUM3RCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxVQUFNLE1BQU0sUUFBUSxlQUFlLGFBQWEsUUFBUSxJQUFJO0FBQzVELFVBQU0sa0JBQWtCLFNBQVMsSUFBSSxnQkFBZ0I7QUFDckQsVUFBTSxlQUFlLFFBQVEsS0FBSyxjQUFjLGNBQWMsU0FBUyxXQUFXO0FBRWxGLFVBQU0sVUFBVSxXQUFXLGlCQUFpQixRQUFRLGdCQUFnQixLQUFLLFFBQVEsS0FBSyxVQUFVLE9BQU87QUFDdkcsUUFBSSxTQUFTO0FBQ1osWUFBTSxRQUFRLGVBQWUsa0JBQWtCLFNBQVMsWUFBWTtBQUFBLElBQ3JFO0FBRUEsUUFBSSxRQUFRLEtBQUssYUFBYSxTQUFTLFFBQVE7QUFDOUMsY0FBUSxLQUFLLGdCQUFnQixjQUFjLFNBQVMseUJBQXlCO0FBQUEsSUFDOUUsT0FBTztBQUNOLGNBQVEscUJBQXFCLFNBQVMsYUFBYTtBQUFBLElBQ3BEO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxNQUFNLHVCQUF1QixlQUFlO0FBQUEsRUFDbEMsaUNBQWlDLFVBQTRCLFNBQTZEO0FBQ2xJLFdBQU8sa0JBQWtCLFVBQVUsT0FBTyxLQUFLLDJCQUEyQixTQUFTLElBQUksY0FBYyxDQUFDO0FBQUEsRUFDdkc7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFnRDtBQUNoRyxXQUFPLFFBQVEsZUFBZSxvQkFBb0I7QUFBQSxFQUNuRDtBQUNEO0FBRUEsZ0JBQWdCLE1BQU0sMEJBQTBCLGVBQWU7QUFBQSxFQUM5RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLGtDQUFrQyxnQkFBZ0I7QUFBQSxNQUNuRSxNQUFNLE1BQU07QUFBQSxNQUNaLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxVQUNQLE1BQU0sZUFBZTtBQUFBLFlBQ3BCO0FBQUEsWUFDQTtBQUFBLFlBQ0EsOEJBQThCLFVBQVU7QUFBQSxZQUN4QyxlQUFlLFVBQVUsaUNBQWlDLElBQUk7QUFBQSxVQUMvRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxVQUNQLE1BQU0sZUFBZTtBQUFBLFlBQ3BCO0FBQUEsWUFDQSw4QkFBOEIsVUFBVTtBQUFBLFlBQ3hDLGVBQWUsT0FBTyxpQ0FBaUMsSUFBSTtBQUFBLFVBQzVEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0QsQ0FBQztBQUVELGdCQUFnQixNQUFNLDBCQUEwQixlQUFlO0FBQUEsRUFDOUQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxxQ0FBcUMsV0FBVztBQUFBLE1BQ2pFLGNBQWMsZUFBZTtBQUFBLFFBQzVCO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLE1BQU0sTUFBTTtBQUFBLE1BQ1osTUFBTTtBQUFBLFFBQ0w7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFVBQ1AsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0EsZUFBZSxVQUFVLGlDQUFpQyxJQUFJO0FBQUEsVUFDL0Q7QUFBQSxRQUNEO0FBQUEsUUFDQTtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsVUFDUCxNQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLFlBQ0E7QUFBQSxZQUNBLGVBQWUsT0FBTyxpQ0FBaUMsSUFBSTtBQUFBLFVBQzVEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsT0FBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNELENBQUM7QUFHRCxhQUFhLGVBQWUsT0FBTyxpQkFBaUI7QUFBQSxFQUNuRCxPQUFPLFNBQVMsMEJBQTBCLE9BQU87QUFBQSxFQUNqRCxTQUFTLE9BQU87QUFBQSxFQUNoQixPQUFPO0FBQUEsRUFDUCxPQUFPO0FBQUEsRUFDUCxNQUFNLFVBQVUsT0FBTyxNQUFNLG9CQUFvQixNQUFNO0FBQ3hELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSxnQ0FBZ0MsZUFBZTtBQUFBLEVBQ3BFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMscUJBQXFCLG9CQUFvQjtBQUFBLE1BQ3pELFNBQVMsU0FBUyxxQkFBcUIsb0JBQW9CO0FBQUEsTUFDM0QsWUFBWSxTQUFTLHFCQUFxQixvQkFBb0I7QUFBQSxNQUM5RCxjQUFjO0FBQUEsTUFDZCxNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxNQUFNLGVBQWU7QUFBQSxZQUNwQjtBQUFBLFlBQ0E7QUFBQSxZQUNBLGVBQWUsVUFBVSxpQ0FBaUMsSUFBSTtBQUFBLFVBQy9EO0FBQUEsVUFDQSxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxZQUNBO0FBQUEsWUFDQSxlQUFlLE9BQU8saUNBQWlDLElBQUk7QUFBQSxVQUM1RDtBQUFBLFVBQ0EsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFFBQ1I7QUFBQSxRQUNBO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZTtBQUFBLFlBQ3BCO0FBQUEsWUFDQSxlQUFlLE9BQU8sZ0JBQWdCLDhCQUE4QjtBQUFBLFVBQ3JFO0FBQUEsVUFDQSxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLE1BQU0sVUFBVSxPQUFPLE1BQU0sb0JBQW9CLE1BQU07QUFBQSxJQUN4RCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxlQUFlLFVBQTRCLFNBQWdEO0FBQ2hHLFVBQU0sZ0NBQWdDLFNBQVMsSUFBSSw4QkFBOEI7QUFDakYsVUFBTSxXQUFXLFFBQVEsZUFBZSxVQUFVO0FBQ2xELFVBQU0saUJBQWlCLDhCQUE4Qiw2QkFBNkIsUUFBUTtBQUMxRixRQUFJLGVBQWUsQ0FBQyxHQUFHO0FBQ3RCLFlBQU0sb0JBQW9CLEtBQUssbUJBQW1CLFVBQVUsUUFBUTtBQUNwRSxZQUFNLGNBQWMscUJBQXFCLGVBQWUsQ0FBQyxFQUFFO0FBQzNELFlBQU0sT0FBTyxRQUFRLGVBQWUsZ0JBQWdCLFdBQVc7QUFDL0QsVUFBSSxNQUFNO0FBQ1QsZ0JBQVEsZUFBZSxrQkFBa0IsTUFBTSxXQUFXO0FBQUEsTUFDM0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsbUJBQW1CLFVBQTRCLFVBQW1DO0FBQ3pGLFVBQU0sZUFBZSxTQUFTLElBQUksYUFBYTtBQUMvQyxlQUFXLFdBQVcsYUFBYSxTQUFTLEVBQUUsWUFBWSxHQUFHO0FBQzVELGlCQUFXLFVBQVUsUUFBUSxjQUFjLEdBQUc7QUFDN0MsY0FBTSxLQUFLLE9BQU8saUJBQWlCO0FBQ25DLFlBQUksSUFBSTtBQUNQLGdCQUFNLFNBQVMsUUFBUSxNQUFNLEdBQUcsT0FBTyxHQUFHO0FBQzFDLGNBQUksVUFBVSxPQUFPLFNBQVMsU0FBUyxNQUFNLFNBQVMsU0FBUyxHQUFHO0FBQ2pFLG1CQUFPLE9BQU87QUFBQSxVQUNmO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLE1BQU0sbUNBQW1DLGVBQWU7QUFBQSxFQUN2RSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLHdCQUF3QixpQ0FBaUM7QUFBQSxNQUN6RSxTQUFTLFNBQVMsd0JBQXdCLGlDQUFpQztBQUFBLE1BQzNFLFlBQVksU0FBUyw2QkFBNkIsaUNBQWlDO0FBQUEsTUFDbkYsY0FBYztBQUFBLE1BQ2QsTUFBTTtBQUFBLFFBQ0w7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxZQUNBO0FBQUEsWUFDQSwwQkFBMEIsVUFBVTtBQUFBLFlBQ3BDLGVBQWUsVUFBVSxpQ0FBaUMsSUFBSTtBQUFBLFVBQy9EO0FBQUEsVUFDQSxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsTUFBTSxlQUFlO0FBQUEsWUFDcEI7QUFBQSxZQUNBO0FBQUEsWUFDQSwwQkFBMEIsVUFBVTtBQUFBLFlBQ3BDLGVBQWUsT0FBTyxpQ0FBaUMsSUFBSTtBQUFBLFVBQzVEO0FBQUEsVUFDQSxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLE1BQU0sTUFBTTtBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sZUFBZSxVQUE0QixTQUFnRDtBQUNoRyxVQUFNLGdDQUFnQyxTQUFTLElBQUksOEJBQThCO0FBQ2pGLFVBQU0sV0FBVyxRQUFRLGVBQWUsVUFBVTtBQUNsRCxVQUFNLHVCQUF1Qiw4QkFBOEIsNkJBQTZCLFFBQVE7QUFDaEcsUUFBSSx5QkFBeUIsUUFBVztBQUN2QyxZQUFNLGlCQUFpQixRQUFRLGVBQWUsZ0JBQWdCLG9CQUFvQjtBQUNsRixVQUFJLGdCQUFnQjtBQUNuQixnQkFBUSxlQUFlLGtCQUFrQixnQkFBZ0IsV0FBVztBQUFBLE1BQ3JFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
