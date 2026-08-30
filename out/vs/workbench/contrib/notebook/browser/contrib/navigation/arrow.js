import { timeout } from "../../../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../../../platform/accessibility/common/accessibility.js";
import { Action2, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { Extensions as ConfigurationExtensions } from "../../../../../../platform/configuration/common/configurationRegistry.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContextKey, IsWindowsContext } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { InlineChatController } from "../../../../inlineChat/browser/inlineChatController.js";
import { NotebookAction, NotebookCellAction, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, findTargetCellEditor } from "../../controller/coreActions.js";
import { CellEditState } from "../../notebookBrowser.js";
import { CellKind, NOTEBOOK_EDITOR_CURSOR_BOUNDARY, NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY } from "../../../common/notebookCommon.js";
import { NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NOTEBOOK_CURSOR_NAVIGATION_MODE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED, NOTEBOOK_CELL_EDITOR_FOCUSED, IS_COMPOSITE_NOTEBOOK, NOTEBOOK_OR_COMPOSITE_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
const NOTEBOOK_FOCUS_TOP = "notebook.focusTop";
const NOTEBOOK_FOCUS_BOTTOM = "notebook.focusBottom";
const NOTEBOOK_FOCUS_PREVIOUS_EDITOR = "notebook.focusPreviousEditor";
const NOTEBOOK_FOCUS_NEXT_EDITOR = "notebook.focusNextEditor";
const FOCUS_IN_OUTPUT_COMMAND_ID = "notebook.cell.focusInOutput";
const FOCUS_OUT_OUTPUT_COMMAND_ID = "notebook.cell.focusOutOutput";
const CENTER_ACTIVE_CELL = "notebook.centerActiveCell";
const NOTEBOOK_CURSOR_PAGEUP_COMMAND_ID = "notebook.cell.cursorPageUp";
const NOTEBOOK_CURSOR_PAGEUP_SELECT_COMMAND_ID = "notebook.cell.cursorPageUpSelect";
const NOTEBOOK_CURSOR_PAGEDOWN_COMMAND_ID = "notebook.cell.cursorPageDown";
const NOTEBOOK_CURSOR_PAGEDOWN_SELECT_COMMAND_ID = "notebook.cell.cursorPageDownSelect";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.cell.nullAction",
      title: localize("notebook.cell.webviewHandledEvents", "Keypresses that should be handled by the focused element in the cell output."),
      keybinding: [{
        when: NOTEBOOK_OUTPUT_INPUT_FOCUSED,
        primary: KeyCode.DownArrow,
        weight: KeybindingWeight.WorkbenchContrib + 1
      }, {
        when: NOTEBOOK_OUTPUT_INPUT_FOCUSED,
        primary: KeyCode.UpArrow,
        weight: KeybindingWeight.WorkbenchContrib + 1
      }],
      f1: false
    });
  }
  run() {
    return;
  }
});
registerAction2(class FocusNextCellAction extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_NEXT_EDITOR,
      title: localize("cursorMoveDown", "Focus Next Cell Editor"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              ContextKeyExpr.has(InputFocusedContextKey),
              EditorContextKeys.editorTextFocus,
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("top"),
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("none"),
              ContextKeyExpr.or(
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("end"),
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("both")
              )
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.DownArrow,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
          // code cell keybinding, focus inside editor: lower weight to not override suggest widget
        },
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              NOTEBOOK_CELL_TYPE.isEqualTo("markup"),
              NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.isEqualTo(false),
              NOTEBOOK_CURSOR_NAVIGATION_MODE
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.DownArrow,
          weight: KeybindingWeight.WorkbenchContrib
          // markdown keybinding, focus on list: higher weight to override list.focusDown
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED),
          primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
          mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow },
          weight: KeybindingWeight.WorkbenchContrib
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_CELL_EDITOR_FOCUSED, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
          primary: KeyMod.CtrlCmd | KeyCode.PageDown,
          mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp },
          weight: KeybindingWeight.WorkbenchContrib + 1
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    const idx = editor.getCellIndex(activeCell);
    if (typeof idx !== "number") {
      return;
    }
    if (idx >= editor.getLength() - 1) {
      return;
    }
    const focusEditorLine = activeCell.textBuffer.getLineCount();
    const targetCell = context.cell ?? context.selectedCells?.[0];
    const foundEditor = targetCell ? findTargetCellEditor(context, targetCell) : void 0;
    if (foundEditor && foundEditor.hasTextFocus() && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === focusEditorLine) {
      InlineChatController.get(foundEditor)?.focus();
    } else {
      const newCell = editor.cellAt(idx + 1);
      const newFocusMode = newCell.cellKind === CellKind.Markup && newCell.getEditState() === CellEditState.Preview ? "container" : "editor";
      await editor.focusNotebookCell(newCell, newFocusMode, { focusEditorLine: 1 });
    }
  }
});
registerAction2(class FocusPreviousCellAction extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_PREVIOUS_EDITOR,
      title: localize("cursorMoveUp", "Focus Previous Cell Editor"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              ContextKeyExpr.has(InputFocusedContextKey),
              EditorContextKeys.editorTextFocus,
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("bottom"),
              NOTEBOOK_EDITOR_CURSOR_BOUNDARY.notEqualsTo("none"),
              ContextKeyExpr.or(
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("start"),
                NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY.isEqualTo("both")
              )
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.UpArrow,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
          // code cell keybinding, focus inside editor: lower weight to not override suggest widget
        },
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate(),
            ContextKeyExpr.equals("config.notebook.navigation.allowNavigateToSurroundingCells", true),
            ContextKeyExpr.and(
              NOTEBOOK_CELL_TYPE.isEqualTo("markup"),
              NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.isEqualTo(false),
              NOTEBOOK_CURSOR_NAVIGATION_MODE
            ),
            EditorContextKeys.isEmbeddedDiffEditor.negate()
          ),
          primary: KeyCode.UpArrow,
          weight: KeybindingWeight.WorkbenchContrib
          // markdown keybinding, focus on list: higher weight to override list.focusDown
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_CELL_EDITOR_FOCUSED, CONTEXT_ACCESSIBILITY_MODE_ENABLED),
          primary: KeyMod.CtrlCmd | KeyCode.PageUp,
          mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp },
          weight: KeybindingWeight.WorkbenchContrib + 1
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    const idx = editor.getCellIndex(activeCell);
    if (typeof idx !== "number") {
      return;
    }
    if (idx < 1 || editor.getLength() === 0) {
      return;
    }
    const newCell = editor.cellAt(idx - 1);
    const newFocusMode = newCell.cellKind === CellKind.Markup && newCell.getEditState() === CellEditState.Preview ? "container" : "editor";
    const focusEditorLine = newCell.textBuffer.getLineCount();
    await editor.focusNotebookCell(newCell, newFocusMode, { focusEditorLine });
    const foundEditor = findTargetCellEditor(context, newCell);
    if (foundEditor && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === focusEditorLine) {
      InlineChatController.get(foundEditor)?.focus();
    }
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_TOP,
      title: localize("focusFirstCell", "Focus First Cell"),
      keybinding: [
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.Home,
          weight: KeybindingWeight.WorkbenchContrib
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow },
          weight: KeybindingWeight.WorkbenchContrib
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    if (editor.getLength() === 0) {
      return;
    }
    const firstCell = editor.cellAt(0);
    await editor.focusNotebookCell(firstCell, "container");
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super({
      id: NOTEBOOK_FOCUS_BOTTOM,
      title: localize("focusLastCell", "Focus Last Cell"),
      keybinding: [
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          primary: KeyMod.CtrlCmd | KeyCode.End,
          mac: void 0,
          weight: KeybindingWeight.WorkbenchContrib
        },
        {
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
          mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow },
          weight: KeybindingWeight.WorkbenchContrib
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    if (!editor.hasModel() || editor.getLength() === 0) {
      return;
    }
    const lastIdx = editor.getLength() - 1;
    const lastVisibleIdx = editor.getPreviousVisibleCellIndex(lastIdx);
    if (lastVisibleIdx) {
      const cell = editor.cellAt(lastVisibleIdx);
      await editor.focusNotebookCell(cell, "container");
    }
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: FOCUS_IN_OUTPUT_COMMAND_ID,
      title: localize2("focusOutput", "Focus In Active Cell Output"),
      f1: true,
      keybinding: [{
        when: ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK.negate(), IsWindowsContext, NOTEBOOK_CELL_HAS_OUTPUTS),
        primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
        weight: KeybindingWeight.WorkbenchContrib
      }, {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow,
        mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.DownArrow },
        weight: KeybindingWeight.WorkbenchContrib
      }],
      precondition: NOTEBOOK_OR_COMPOSITE_IS_ACTIVE_EDITOR
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    return timeout(0).then(() => editor.focusNotebookCell(activeCell, "output"));
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: FOCUS_OUT_OUTPUT_COMMAND_ID,
      title: localize("focusOutputOut", "Focus Out Active Cell Output"),
      keybinding: {
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow,
        mac: { primary: KeyMod.WinCtrl | KeyMod.CtrlCmd | KeyCode.UpArrow },
        weight: KeybindingWeight.WorkbenchContrib
      },
      precondition: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_OUTPUT_FOCUSED)
    });
  }
  async runWithContext(accessor, context) {
    const editor = context.notebookEditor;
    const activeCell = context.cell;
    await editor.focusNotebookCell(activeCell, "editor");
  }
});
registerAction2(class CenterActiveCellAction extends NotebookCellAction {
  constructor() {
    super({
      id: CENTER_ACTIVE_CELL,
      title: localize("notebookActions.centerActiveCell", "Center Active Cell"),
      keybinding: {
        when: NOTEBOOK_EDITOR_FOCUSED,
        primary: KeyMod.CtrlCmd | KeyCode.KeyL,
        mac: {
          primary: KeyMod.WinCtrl | KeyCode.KeyL
        },
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    return context.notebookEditor.revealInCenter(context.cell);
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEUP_COMMAND_ID,
      title: localize("cursorPageUp", "Cell Cursor Page Up"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus
          ),
          primary: KeyCode.PageUp,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageUp").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEUP_SELECT_COMMAND_ID,
      title: localize("cursorPageUpSelect", "Cell Cursor Page Up Select"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus,
            NOTEBOOK_OUTPUT_FOCUSED.negate()
            // Webview handles Shift+PageUp for selection of output contents
          ),
          primary: KeyMod.Shift | KeyCode.PageUp,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageUpSelect").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEDOWN_COMMAND_ID,
      title: localize("cursorPageDown", "Cell Cursor Page Down"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus
          ),
          primary: KeyCode.PageDown,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageDown").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
registerAction2(class extends NotebookCellAction {
  constructor() {
    super({
      id: NOTEBOOK_CURSOR_PAGEDOWN_SELECT_COMMAND_ID,
      title: localize("cursorPageDownSelect", "Cell Cursor Page Down Select"),
      keybinding: [
        {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            ContextKeyExpr.has(InputFocusedContextKey),
            EditorContextKeys.editorTextFocus,
            NOTEBOOK_OUTPUT_FOCUSED.negate()
            // Webview handles Shift+PageDown for selection of output contents
          ),
          primary: KeyMod.Shift | KeyCode.PageDown,
          weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT
        }
      ]
    });
  }
  async runWithContext(accessor, context) {
    EditorExtensionsRegistry.getEditorCommand("cursorPageDownSelect").runCommand(accessor, { pageSize: getPageSize(context) });
  }
});
function getPageSize(context) {
  const editor = context.notebookEditor;
  const layoutInfo = editor.getViewModel().layoutInfo;
  const lineHeight = layoutInfo?.fontInfo.lineHeight || 17;
  return Math.max(1, Math.floor((layoutInfo?.height || 0) / lineHeight) - 2);
}
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "notebook",
  order: 100,
  type: "object",
  "properties": {
    "notebook.navigation.allowNavigateToSurroundingCells": {
      type: "boolean",
      default: true,
      markdownDescription: localize("notebook.navigation.allowNavigateToSurroundingCells", "When enabled cursor can navigate to the next/previous cell when the current cursor in the cell editor is at the first/last line.")
    }
  }
});
export {
  CENTER_ACTIVE_CELL
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxuYXZpZ2F0aW9uXFxhcnJvdy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElucHV0Rm9jdXNlZENvbnRleHRLZXksIElzV2luZG93c0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDaGF0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0LCBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCwgTm90ZWJvb2tBY3Rpb24sIE5vdGVib29rQ2VsbEFjdGlvbiwgTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hULCBmaW5kVGFyZ2V0Q2VsbEVkaXRvciB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRTdGF0ZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCwgTk9URUJPT0tfRURJVE9SX0NVUlNPUl9CT1VOREFSWSwgTk9URUJPT0tfRURJVE9SX0NVUlNPUl9MSU5FX0JPVU5EQVJZIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NFTExfSEFTX09VVFBVVFMsIE5PVEVCT09LX0NFTExfTUFSS0RPV05fRURJVF9NT0RFLCBOT1RFQk9PS19DRUxMX1RZUEUsIE5PVEVCT09LX0NVUlNPUl9OQVZJR0FUSU9OX01PREUsIE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBOT1RFQk9PS19PVVRQVVRfSU5QVVRfRk9DVVNFRCwgTk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQsIE5PVEVCT09LX0NFTExfRURJVE9SX0ZPQ1VTRUQsIElTX0NPTVBPU0lURV9OT1RFQk9PSywgTk9URUJPT0tfT1JfQ09NUE9TSVRFX0lTX0FDVElWRV9FRElUT1IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5cbmNvbnN0IE5PVEVCT09LX0ZPQ1VTX1RPUCA9ICdub3RlYm9vay5mb2N1c1RvcCc7XG5jb25zdCBOT1RFQk9PS19GT0NVU19CT1RUT00gPSAnbm90ZWJvb2suZm9jdXNCb3R0b20nO1xuY29uc3QgTk9URUJPT0tfRk9DVVNfUFJFVklPVVNfRURJVE9SID0gJ25vdGVib29rLmZvY3VzUHJldmlvdXNFZGl0b3InO1xuY29uc3QgTk9URUJPT0tfRk9DVVNfTkVYVF9FRElUT1IgPSAnbm90ZWJvb2suZm9jdXNOZXh0RWRpdG9yJztcbmNvbnN0IEZPQ1VTX0lOX09VVFBVVF9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuZm9jdXNJbk91dHB1dCc7XG5jb25zdCBGT0NVU19PVVRfT1VUUFVUX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5mb2N1c091dE91dHB1dCc7XG5leHBvcnQgY29uc3QgQ0VOVEVSX0FDVElWRV9DRUxMID0gJ25vdGVib29rLmNlbnRlckFjdGl2ZUNlbGwnO1xuY29uc3QgTk9URUJPT0tfQ1VSU09SX1BBR0VVUF9DT01NQU5EX0lEID0gJ25vdGVib29rLmNlbGwuY3Vyc29yUGFnZVVwJztcbmNvbnN0IE5PVEVCT09LX0NVUlNPUl9QQUdFVVBfU0VMRUNUX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jdXJzb3JQYWdlVXBTZWxlY3QnO1xuY29uc3QgTk9URUJPT0tfQ1VSU09SX1BBR0VET1dOX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jdXJzb3JQYWdlRG93bic7XG5jb25zdCBOT1RFQk9PS19DVVJTT1JfUEFHRURPV05fU0VMRUNUX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jdXJzb3JQYWdlRG93blNlbGVjdCc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmNlbGwubnVsbEFjdGlvbicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rLmNlbGwud2Vidmlld0hhbmRsZWRFdmVudHMnLCBcIktleXByZXNzZXMgdGhhdCBzaG91bGQgYmUgaGFuZGxlZCBieSB0aGUgZm9jdXNlZCBlbGVtZW50IGluIHRoZSBjZWxsIG91dHB1dC5cIiksXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHR3aGVuOiBOT1RFQk9PS19PVVRQVVRfSU5QVVRfRk9DVVNFRCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMVxuXHRcdFx0fSwge1xuXHRcdFx0XHR3aGVuOiBOT1RFQk9PS19PVVRQVVRfSU5QVVRfRk9DVVNFRCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDFcblx0XHRcdH1dLFxuXHRcdFx0ZjE6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oKSB7XG5cdFx0Ly8gbm9vcCwgdGhlc2UgYXJlIGhhbmRsZWQgYnkgdGhlIG91dHB1dCB3ZWJ2aWV3XG5cdFx0cmV0dXJuO1xuXHR9XG5cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNOZXh0Q2VsbEFjdGlvbiBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBOT1RFQk9PS19GT0NVU19ORVhUX0VESVRPUixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY3Vyc29yTW92ZURvd24nLCAnRm9jdXMgTmV4dCBDZWxsIEVkaXRvcicpLFxuXHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0XHRDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2submF2aWdhdGlvbi5hbGxvd05hdmlnYXRlVG9TdXJyb3VuZGluZ0NlbGxzJywgdHJ1ZSksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSxcblx0XHRcdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCd0b3AnKSxcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0NVUlNPUl9CT1VOREFSWS5ub3RFcXVhbHNUbygnbm9uZScpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfQ1VSU09SX0xJTkVfQk9VTkRBUlkuaXNFcXVhbFRvKCdlbmQnKSxcblx0XHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfQ1VSU09SX0xJTkVfQk9VTkRBUlkuaXNFcXVhbFRvKCdib3RoJylcblx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmlzRW1iZWRkZWREaWZmRWRpdG9yLm5lZ2F0ZSgpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVCwgLy8gY29kZSBjZWxsIGtleWJpbmRpbmcsIGZvY3VzIGluc2lkZSBlZGl0b3I6IGxvd2VyIHdlaWdodCB0byBub3Qgb3ZlcnJpZGUgc3VnZ2VzdCB3aWRnZXRcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRcdFx0XHRcdFx0Q09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm5hdmlnYXRpb24uYWxsb3dOYXZpZ2F0ZVRvU3Vycm91bmRpbmdDZWxscycsIHRydWUpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdtYXJrdXAnKSxcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9NQVJLRE9XTl9FRElUX01PREUuaXNFcXVhbFRvKGZhbHNlKSxcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfQ1VSU09SX05BVklHQVRJT05fTU9ERSksXG5cdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0VtYmVkZGVkRGlmZkVkaXRvci5uZWdhdGUoKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsIC8vIG1hcmtkb3duIGtleWJpbmRpbmcsIGZvY3VzIG9uIGxpc3Q6IGhpZ2hlciB3ZWlnaHQgdG8gb3ZlcnJpZGUgbGlzdC5mb2N1c0Rvd25cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvdywgfSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0NFTExfRURJVE9SX0ZPQ1VTRUQsIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlRG93bixcblx0XHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLlBhZ2VVcCwgfSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDFcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IGNvbnRleHQuY2VsbDtcblxuXHRcdGNvbnN0IGlkeCA9IGVkaXRvci5nZXRDZWxsSW5kZXgoYWN0aXZlQ2VsbCk7XG5cdFx0aWYgKHR5cGVvZiBpZHggIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlkeCA+PSBlZGl0b3IuZ2V0TGVuZ3RoKCkgLSAxKSB7XG5cdFx0XHQvLyBsYXN0IG9uZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzRWRpdG9yTGluZSA9IGFjdGl2ZUNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCB0YXJnZXRDZWxsID0gKGNvbnRleHQuY2VsbCA/PyBjb250ZXh0LnNlbGVjdGVkQ2VsbHM/LlswXSk7XG5cdFx0Y29uc3QgZm91bmRFZGl0b3I6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkID0gdGFyZ2V0Q2VsbCA/IGZpbmRUYXJnZXRDZWxsRWRpdG9yKGNvbnRleHQsIHRhcmdldENlbGwpIDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGZvdW5kRWRpdG9yICYmIGZvdW5kRWRpdG9yLmhhc1RleHRGb2N1cygpICYmIElubGluZUNoYXRDb250cm9sbGVyLmdldChmb3VuZEVkaXRvcik/LmdldFdpZGdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXIgPT09IGZvY3VzRWRpdG9yTGluZSkge1xuXHRcdFx0SW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGZvdW5kRWRpdG9yKT8uZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbmV3Q2VsbCA9IGVkaXRvci5jZWxsQXQoaWR4ICsgMSk7XG5cdFx0XHRjb25zdCBuZXdGb2N1c01vZGUgPSBuZXdDZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgbmV3Q2VsbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3ID8gJ2NvbnRhaW5lcicgOiAnZWRpdG9yJztcblx0XHRcdGF3YWl0IGVkaXRvci5mb2N1c05vdGVib29rQ2VsbChuZXdDZWxsLCBuZXdGb2N1c01vZGUsIHsgZm9jdXNFZGl0b3JMaW5lOiAxIH0pO1xuXHRcdH1cblx0fVxufSk7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzUHJldmlvdXNDZWxsQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0ZPQ1VTX1BSRVZJT1VTX0VESVRPUixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY3Vyc29yTW92ZVVwJywgJ0ZvY3VzIFByZXZpb3VzIENlbGwgRWRpdG9yJyksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5uYXZpZ2F0aW9uLmFsbG93TmF2aWdhdGVUb1N1cnJvdW5kaW5nQ2VsbHMnLCB0cnVlKSxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKElucHV0Rm9jdXNlZENvbnRleHRLZXkpLFxuXHRcdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9DVVJTT1JfQk9VTkRBUlkubm90RXF1YWxzVG8oJ2JvdHRvbScpLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfQ1VSU09SX0JPVU5EQVJZLm5vdEVxdWFsc1RvKCdub25lJyksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9DVVJTT1JfTElORV9CT1VOREFSWS5pc0VxdWFsVG8oJ3N0YXJ0JyksXG5cdFx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0NVUlNPUl9MSU5FX0JPVU5EQVJZLmlzRXF1YWxUbygnYm90aCcpXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5pc0VtYmVkZGVkRGlmZkVkaXRvci5uZWdhdGUoKVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hULCAvLyBjb2RlIGNlbGwga2V5YmluZGluZywgZm9jdXMgaW5zaWRlIGVkaXRvcjogbG93ZXIgd2VpZ2h0IHRvIG5vdCBvdmVycmlkZSBzdWdnZXN0IHdpZGdldFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0XHRDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcubm90ZWJvb2submF2aWdhdGlvbi5hbGxvd05hdmlnYXRlVG9TdXJyb3VuZGluZ0NlbGxzJywgdHJ1ZSksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfVFlQRS5pc0VxdWFsVG8oJ21hcmt1cCcpLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX01BUktET1dOX0VESVRfTU9ERS5pc0VxdWFsVG8oZmFsc2UpLFxuXHRcdFx0XHRcdFx0XHROT1RFQk9PS19DVVJTT1JfTkFWSUdBVElPTl9NT0RFXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuaXNFbWJlZGRlZERpZmZFZGl0b3IubmVnYXRlKClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiwgLy8gbWFya2Rvd24ga2V5YmluZGluZywgZm9jdXMgb24gbGlzdDogaGlnaGVyIHdlaWdodCB0byBvdmVycmlkZSBsaXN0LmZvY3VzRG93blxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0NFTExfRURJVE9SX0ZPQ1VTRUQsIENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5QYWdlVXAsIH0sXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0XHRjb25zdCBhY3RpdmVDZWxsID0gY29udGV4dC5jZWxsO1xuXG5cdFx0Y29uc3QgaWR4ID0gZWRpdG9yLmdldENlbGxJbmRleChhY3RpdmVDZWxsKTtcblx0XHRpZiAodHlwZW9mIGlkeCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaWR4IDwgMSB8fCBlZGl0b3IuZ2V0TGVuZ3RoKCkgPT09IDApIHtcblx0XHRcdC8vIHdlIGRvbid0IGRvIGxvb3Bcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdDZWxsID0gZWRpdG9yLmNlbGxBdChpZHggLSAxKTtcblx0XHRjb25zdCBuZXdGb2N1c01vZGUgPSBuZXdDZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXAgJiYgbmV3Q2VsbC5nZXRFZGl0U3RhdGUoKSA9PT0gQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3ID8gJ2NvbnRhaW5lcicgOiAnZWRpdG9yJztcblx0XHRjb25zdCBmb2N1c0VkaXRvckxpbmUgPSBuZXdDZWxsLnRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCk7XG5cdFx0YXdhaXQgZWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKG5ld0NlbGwsIG5ld0ZvY3VzTW9kZSwgeyBmb2N1c0VkaXRvckxpbmU6IGZvY3VzRWRpdG9yTGluZSB9KTtcblxuXHRcdGNvbnN0IGZvdW5kRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCA9IGZpbmRUYXJnZXRDZWxsRWRpdG9yKGNvbnRleHQsIG5ld0NlbGwpO1xuXG5cdFx0aWYgKGZvdW5kRWRpdG9yICYmIElubGluZUNoYXRDb250cm9sbGVyLmdldChmb3VuZEVkaXRvcik/LmdldFdpZGdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXIgPT09IGZvY3VzRWRpdG9yTGluZSkge1xuXHRcdFx0SW5saW5lQ2hhdENvbnRyb2xsZXIuZ2V0KGZvdW5kRWRpdG9yKT8uZm9jdXMoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0ZPQ1VTX1RPUCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZm9jdXNGaXJzdENlbGwnLCAnRm9jdXMgRmlyc3QgQ2VsbCcpLFxuXHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSkpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Ib21lLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIENvbnRleHRLZXlFeHByLm5vdChJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSksXG5cdFx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93IH0sXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0XHRpZiAoZWRpdG9yLmdldExlbmd0aCgpID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlyc3RDZWxsID0gZWRpdG9yLmNlbGxBdCgwKTtcblx0XHRhd2FpdCBlZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoZmlyc3RDZWxsLCAnY29udGFpbmVyJyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBOT1RFQk9PS19GT0NVU19CT1RUT00sXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZvY3VzTGFzdENlbGwnLCAnRm9jdXMgTGFzdCBDZWxsJyksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIENvbnRleHRLZXlFeHByLm5vdChJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVuZCxcblx0XHRcdFx0XHRtYWM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSkpLFxuXHRcdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93IH0sXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvcjtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpIHx8IGVkaXRvci5nZXRMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RJZHggPSBlZGl0b3IuZ2V0TGVuZ3RoKCkgLSAxO1xuXHRcdGNvbnN0IGxhc3RWaXNpYmxlSWR4ID0gZWRpdG9yLmdldFByZXZpb3VzVmlzaWJsZUNlbGxJbmRleChsYXN0SWR4KTtcblx0XHRpZiAobGFzdFZpc2libGVJZHgpIHtcblx0XHRcdGNvbnN0IGNlbGwgPSBlZGl0b3IuY2VsbEF0KGxhc3RWaXNpYmxlSWR4KTtcblx0XHRcdGF3YWl0IGVkaXRvci5mb2N1c05vdGVib29rQ2VsbChjZWxsLCAnY29udGFpbmVyJyk7XG5cdFx0fVxuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRk9DVVNfSU5fT1VUUFVUX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdmb2N1c091dHB1dCcsICdGb2N1cyBJbiBBY3RpdmUgQ2VsbCBPdXRwdXQnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElTX0NPTVBPU0lURV9OT1RFQk9PSy5uZWdhdGUoKSwgSXNXaW5kb3dzQ29udGV4dCwgTk9URUJPT0tfQ0VMTF9IQVNfT1VUUFVUUyksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3csIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XSxcblx0XHRcdHByZWNvbmRpdGlvbjogTk9URUJPT0tfT1JfQ09NUE9TSVRFX0lTX0FDVElWRV9FRElUT1Jcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IGNvbnRleHQuY2VsbDtcblx0XHRyZXR1cm4gdGltZW91dCgwKS50aGVuKCgpID0+IGVkaXRvci5mb2N1c05vdGVib29rQ2VsbChhY3RpdmVDZWxsLCAnb3V0cHV0JykpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEZPQ1VTX09VVF9PVVRQVVRfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZm9jdXNPdXRwdXRPdXQnLCAnRm9jdXMgT3V0IEFjdGl2ZSBDZWxsIE91dHB1dCcpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3csIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX09VVFBVVF9GT0NVU0VEKSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IGNvbnRleHQuY2VsbDtcblx0XHRhd2FpdCBlZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoYWN0aXZlQ2VsbCwgJ2VkaXRvcicpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENlbnRlckFjdGl2ZUNlbGxBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ0VOVEVSX0FDVElWRV9DRUxMLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuY2VudGVyQWN0aXZlQ2VsbCcsIFwiQ2VudGVyIEFjdGl2ZSBDZWxsXCIpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUwsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlMLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLnJldmVhbEluQ2VudGVyKGNvbnRleHQuY2VsbCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTk9URUJPT0tfQ1VSU09SX1BBR0VVUF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjdXJzb3JQYWdlVXAnLCBcIkNlbGwgQ3Vyc29yIFBhZ2UgVXBcIiksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZVVwLFxuXHRcdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb21tYW5kKCdjdXJzb3JQYWdlVXAnKS5ydW5Db21tYW5kKGFjY2Vzc29yLCB7IHBhZ2VTaXplOiBnZXRQYWdlU2l6ZShjb250ZXh0KSB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBOT1RFQk9PS19DVVJTT1JfUEFHRVVQX1NFTEVDVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjdXJzb3JQYWdlVXBTZWxlY3QnLCBcIkNlbGwgQ3Vyc29yIFBhZ2UgVXAgU2VsZWN0XCIpLFxuXHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksXG5cdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19PVVRQVVRfRk9DVVNFRC5uZWdhdGUoKSwgLy8gV2VidmlldyBoYW5kbGVzIFNoaWZ0K1BhZ2VVcCBmb3Igc2VsZWN0aW9uIG9mIG91dHB1dCBjb250ZW50c1xuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0RWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbW1hbmQoJ2N1cnNvclBhZ2VVcFNlbGVjdCcpLnJ1bkNvbW1hbmQoYWNjZXNzb3IsIHsgcGFnZVNpemU6IGdldFBhZ2VTaXplKGNvbnRleHQpIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0NVUlNPUl9QQUdFRE9XTl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjdXJzb3JQYWdlRG93bicsIFwiQ2VsbCBDdXJzb3IgUGFnZSBEb3duXCIpLFxuXHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5oYXMoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksXG5cdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdFx0XHRcdHdlaWdodDogTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hUXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb21tYW5kKCdjdXJzb3JQYWdlRG93bicpLnJ1bkNvbW1hbmQoYWNjZXNzb3IsIHsgcGFnZVNpemU6IGdldFBhZ2VTaXplKGNvbnRleHQpIH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE5PVEVCT09LX0NVUlNPUl9QQUdFRE9XTl9TRUxFQ1RfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY3Vyc29yUGFnZURvd25TZWxlY3QnLCBcIkNlbGwgQ3Vyc29yIFBhZ2UgRG93biBTZWxlY3RcIiksXG5cdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmhhcyhJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0XHRcdE5PVEVCT09LX09VVFBVVF9GT0NVU0VELm5lZ2F0ZSgpLCAvLyBXZWJ2aWV3IGhhbmRsZXMgU2hpZnQrUGFnZURvd24gZm9yIHNlbGVjdGlvbiBvZiBvdXRwdXQgY29udGVudHNcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUGFnZURvd24sXG5cdFx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFRcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0RWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbW1hbmQoJ2N1cnNvclBhZ2VEb3duU2VsZWN0JykucnVuQ29tbWFuZChhY2Nlc3NvciwgeyBwYWdlU2l6ZTogZ2V0UGFnZVNpemUoY29udGV4dCkgfSk7XG5cdH1cbn0pO1xuXG5cbmZ1bmN0aW9uIGdldFBhZ2VTaXplKGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KSB7XG5cdGNvbnN0IGVkaXRvciA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdGNvbnN0IGxheW91dEluZm8gPSBlZGl0b3IuZ2V0Vmlld01vZGVsKCkubGF5b3V0SW5mbztcblx0Y29uc3QgbGluZUhlaWdodCA9IGxheW91dEluZm8/LmZvbnRJbmZvLmxpbmVIZWlnaHQgfHwgMTc7XG5cdHJldHVybiBNYXRoLm1heCgxLCBNYXRoLmZsb29yKChsYXlvdXRJbmZvPy5oZWlnaHQgfHwgMCkgLyBsaW5lSGVpZ2h0KSAtIDIpO1xufVxuXG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnbm90ZWJvb2snLFxuXHRvcmRlcjogMTAwLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0J25vdGVib29rLm5hdmlnYXRpb24uYWxsb3dOYXZpZ2F0ZVRvU3Vycm91bmRpbmdDZWxscyc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm90ZWJvb2submF2aWdhdGlvbi5hbGxvd05hdmlnYXRlVG9TdXJyb3VuZGluZ0NlbGxzJywgXCJXaGVuIGVuYWJsZWQgY3Vyc29yIGNhbiBuYXZpZ2F0ZSB0byB0aGUgbmV4dC9wcmV2aW91cyBjZWxsIHdoZW4gdGhlIGN1cnJlbnQgY3Vyc29yIGluIHRoZSBjZWxsIGVkaXRvciBpcyBhdCB0aGUgZmlyc3QvbGFzdCBsaW5lLlwiKVxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGNBQWM7QUFFaEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsY0FBYywrQkFBdUQ7QUFDOUUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx3QkFBd0Isd0JBQXdCO0FBRXpELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQTZELGdCQUFnQixvQkFBb0Isc0NBQXNDLDRCQUE0QjtBQUNuSyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFVBQVUsaUNBQWlDLDRDQUE0QztBQUNoRyxTQUFTLDJC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
