import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { getNotebookEditorFromEditorPane, cellRangeToViewCells } from "../notebookBrowser.js";
import { INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_KERNEL_COUNT, NOTEBOOK_KERNEL_SOURCE_COUNT, REPL_NOTEBOOK_IS_ACTIVE_EDITOR } from "../../common/notebookContextKeys.js";
import { isICellRange } from "../../common/notebookRange.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { isEditorCommandsContext } from "../../../../common/editor.js";
import { INotebookEditorService } from "../services/notebookEditorService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { MarshalledId } from "../../../../../base/common/marshallingIds.js";
import { isEqual } from "../../../../../base/common/resources.js";
const SELECT_KERNEL_ID = "_notebook.selectKernel";
const NOTEBOOK_ACTIONS_CATEGORY = localize2("notebookActions.category", "Notebook");
const CELL_TITLE_CELL_GROUP_ID = "inline/cell";
const CELL_TITLE_OUTPUT_GROUP_ID = "inline/output";
const NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT = KeybindingWeight.EditorContrib;
const NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT = KeybindingWeight.WorkbenchContrib + 1;
var CellToolbarOrder = /* @__PURE__ */ ((CellToolbarOrder2) => {
  CellToolbarOrder2[CellToolbarOrder2["RunSection"] = 0] = "RunSection";
  CellToolbarOrder2[CellToolbarOrder2["EditCell"] = 1] = "EditCell";
  CellToolbarOrder2[CellToolbarOrder2["ExecuteAboveCells"] = 2] = "ExecuteAboveCells";
  CellToolbarOrder2[CellToolbarOrder2["ExecuteCellAndBelow"] = 3] = "ExecuteCellAndBelow";
  CellToolbarOrder2[CellToolbarOrder2["SaveCell"] = 4] = "SaveCell";
  CellToolbarOrder2[CellToolbarOrder2["SplitCell"] = 5] = "SplitCell";
  CellToolbarOrder2[CellToolbarOrder2["ClearCellOutput"] = 6] = "ClearCellOutput";
  return CellToolbarOrder2;
})(CellToolbarOrder || {});
var CellOverflowToolbarGroups = /* @__PURE__ */ ((CellOverflowToolbarGroups2) => {
  CellOverflowToolbarGroups2["Copy"] = "1_copy";
  CellOverflowToolbarGroups2["Insert"] = "2_insert";
  CellOverflowToolbarGroups2["Edit"] = "3_edit";
  CellOverflowToolbarGroups2["Share"] = "4_share";
  return CellOverflowToolbarGroups2;
})(CellOverflowToolbarGroups || {});
function getContextFromActiveEditor(editorService) {
  const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
  if (!editor || !editor.hasModel()) {
    return;
  }
  const activeCell = editor.getActiveCell();
  const selectedCells = editor.getSelectionViewModels();
  return {
    cell: activeCell,
    selectedCells,
    notebookEditor: editor
  };
}
function getWidgetFromUri(accessor, uri) {
  const notebookEditorService = accessor.get(INotebookEditorService);
  const widget = notebookEditorService.listNotebookEditors().find((widget2) => widget2.hasModel() && widget2.textModel.uri.toString() === uri.toString());
  if (widget && widget.hasModel()) {
    return widget;
  }
  return void 0;
}
function getContextFromUri(accessor, context) {
  const uri = URI.revive(context);
  if (uri) {
    const widget = getWidgetFromUri(accessor, uri);
    if (widget) {
      return {
        notebookEditor: widget
      };
    }
  }
  return void 0;
}
function findTargetCellEditor(context, targetCell) {
  let foundEditor = void 0;
  for (const [, codeEditor] of context.notebookEditor.codeEditors) {
    if (isEqual(codeEditor.getModel()?.uri, targetCell.uri)) {
      foundEditor = codeEditor;
      break;
    }
  }
  return foundEditor;
}
class NotebookAction extends Action2 {
  constructor(desc) {
    if (desc.f1 !== false) {
      desc.f1 = false;
      const f1Menu = {
        id: MenuId.CommandPalette,
        when: ContextKeyExpr.or(NOTEBOOK_IS_ACTIVE_EDITOR, INTERACTIVE_WINDOW_IS_ACTIVE_EDITOR, REPL_NOTEBOOK_IS_ACTIVE_EDITOR)
      };
      if (!desc.menu) {
        desc.menu = [];
      } else if (!Array.isArray(desc.menu)) {
        desc.menu = [desc.menu];
      }
      desc.menu = [
        ...desc.menu,
        f1Menu
      ];
    }
    desc.category = NOTEBOOK_ACTIONS_CATEGORY;
    super(desc);
  }
  async run(accessor, context, ...additionalArgs) {
    sendEntryTelemetry(accessor, this.desc.id, context);
    if (!this.isNotebookActionContext(context)) {
      context = this.getEditorContextFromArgsOrActive(accessor, context, ...additionalArgs);
      if (!context) {
        return;
      }
    }
    return this.runWithContext(accessor, context);
  }
  isNotebookActionContext(context) {
    return !!context && !!context.notebookEditor;
  }
  getEditorContextFromArgsOrActive(accessor, context, ...additionalArgs) {
    return getContextFromActiveEditor(accessor.get(IEditorService));
  }
}
class NotebookMultiCellAction extends Action2 {
  constructor(desc) {
    if (desc.f1 !== false) {
      desc.f1 = false;
      const f1Menu = {
        id: MenuId.CommandPalette,
        when: NOTEBOOK_IS_ACTIVE_EDITOR
      };
      if (!desc.menu) {
        desc.menu = [];
      } else if (!Array.isArray(desc.menu)) {
        desc.menu = [desc.menu];
      }
      desc.menu = [
        ...desc.menu,
        f1Menu
      ];
    }
    desc.category = NOTEBOOK_ACTIONS_CATEGORY;
    super(desc);
  }
  parseArgs(accessor, ...args) {
    return void 0;
  }
  /**
   * The action/command args are resolved in following order
   * `run(accessor, cellToolbarContext)` from cell toolbar
   * `run(accessor, ...args)` from command service with arguments
   * `run(accessor, undefined)` from keyboard shortcuts, command palatte, etc
   */
  async run(accessor, ...additionalArgs) {
    const context = additionalArgs[0];
    sendEntryTelemetry(accessor, this.desc.id, context);
    const isFromCellToolbar = isCellToolbarContext(context);
    if (isFromCellToolbar) {
      return this.runWithContext(accessor, context);
    }
    const parsedArgs = this.parseArgs(accessor, ...additionalArgs);
    if (parsedArgs) {
      return this.runWithContext(accessor, parsedArgs);
    }
    const editor = getEditorFromArgsOrActivePane(accessor);
    if (editor) {
      const selectedCellRange = editor.getSelections().length === 0 ? [editor.getFocus()] : editor.getSelections();
      return this.runWithContext(accessor, {
        ui: false,
        notebookEditor: editor,
        selectedCells: cellRangeToViewCells(editor, selectedCellRange)
      });
    }
  }
}
class NotebookCellAction extends NotebookAction {
  isCellActionContext(context) {
    return !!context && !!context.notebookEditor && !!context.cell;
  }
  getCellContextFromArgs(accessor, context, ...additionalArgs) {
    return void 0;
  }
  async run(accessor, context, ...additionalArgs) {
    sendEntryTelemetry(accessor, this.desc.id, context);
    if (this.isCellActionContext(context)) {
      return this.runWithContext(accessor, context);
    }
    const contextFromArgs = this.getCellContextFromArgs(accessor, context, ...additionalArgs);
    if (contextFromArgs) {
      return this.runWithContext(accessor, contextFromArgs);
    }
    const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);
    if (this.isCellActionContext(activeEditorContext)) {
      return this.runWithContext(accessor, activeEditorContext);
    }
  }
}
const executeNotebookCondition = ContextKeyExpr.or(ContextKeyExpr.greater(NOTEBOOK_KERNEL_COUNT.key, 0), ContextKeyExpr.greater(NOTEBOOK_KERNEL_SOURCE_COUNT.key, 0));
function sendEntryTelemetry(accessor, id, context) {
  if (context) {
    const telemetryService = accessor.get(ITelemetryService);
    if (context.source) {
      telemetryService.publicLog2("workbenchActionExecuted", { id, from: context.source });
    } else if (URI.isUri(context)) {
      telemetryService.publicLog2("workbenchActionExecuted", { id, from: "cellEditorContextMenu" });
    } else if (context && "from" in context && context.from === "cellContainer") {
      telemetryService.publicLog2("workbenchActionExecuted", { id, from: "cellContainer" });
    } else {
      const from = isCellToolbarContext(context) ? "cellToolbar" : isEditorCommandsContext(context) ? "editorToolbar" : "other";
      telemetryService.publicLog2("workbenchActionExecuted", { id, from });
    }
  }
}
function isCellToolbarContext(context) {
  return !!context && !!context.notebookEditor && context.$mid === MarshalledId.NotebookCellActionContext;
}
function isMultiCellArgs(arg) {
  if (arg === void 0) {
    return false;
  }
  const ranges = arg.ranges;
  if (!ranges) {
    return false;
  }
  if (!Array.isArray(ranges) || ranges.some((range) => !isICellRange(range))) {
    return false;
  }
  if (arg.document) {
    const uri = URI.revive(arg.document);
    if (!uri) {
      return false;
    }
  }
  return true;
}
function getEditorFromArgsOrActivePane(accessor, context) {
  const editorFromUri = getContextFromUri(accessor, context)?.notebookEditor;
  if (editorFromUri) {
    return editorFromUri;
  }
  const editor = getNotebookEditorFromEditorPane(accessor.get(IEditorService).activeEditorPane);
  if (!editor || !editor.hasModel()) {
    return;
  }
  return editor;
}
function parseMultiCellExecutionArgs(accessor, ...args) {
  const firstArg = args[0];
  if (isMultiCellArgs(firstArg)) {
    const editor = getEditorFromArgsOrActivePane(accessor, firstArg.document);
    if (!editor) {
      return;
    }
    const ranges = firstArg.ranges;
    const selectedCells = ranges.map((range) => editor.getCellsInRange(range).slice(0)).flat();
    const autoReveal = firstArg.autoReveal;
    return {
      ui: false,
      notebookEditor: editor,
      selectedCells,
      autoReveal
    };
  }
  if (isICellRange(firstArg)) {
    const secondArg = args[1];
    const editor = getEditorFromArgsOrActivePane(accessor, secondArg);
    if (!editor) {
      return;
    }
    return {
      ui: false,
      notebookEditor: editor,
      selectedCells: editor.getCellsInRange(firstArg)
    };
  }
  const context = getContextFromActiveEditor(accessor.get(IEditorService));
  return context ? {
    ui: false,
    notebookEditor: context.notebookEditor,
    selectedCells: context.selectedCells ?? [],
    cell: context.cell
  } : void 0;
}
const cellExecutionArgs = [
  {
    isOptional: true,
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
        },
        "autoReveal": {
          "type": "boolean",
          "description": "Whether the cell should be revealed into view automatically"
        }
      }
    }
  }
];
MenuRegistry.appendMenuItem(MenuId.NotebookCellTitle, {
  submenu: MenuId.NotebookCellInsert,
  title: localize("notebookMenu.insertCell", "Insert Cell"),
  group: "2_insert" /* Insert */,
  when: NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true)
});
MenuRegistry.appendMenuItem(MenuId.EditorContext, {
  submenu: MenuId.NotebookCellTitle,
  title: localize("notebookMenu.cellTitle", "Notebook Cell"),
  group: "2_insert" /* Insert */,
  when: NOTEBOOK_EDITOR_FOCUSED
});
MenuRegistry.appendMenuItem(MenuId.NotebookCellTitle, {
  title: localize("miShare", "Share"),
  submenu: MenuId.EditorContextShare,
  group: "4_share" /* Share */
});
export {
  CELL_TITLE_CELL_GROUP_ID,
  CELL_TITLE_OUTPUT_GROUP_ID,
  CellOverflowToolbarGroups,
  CellToolbarOrder,
  NOTEBOOK_ACTIONS_CATEGORY,
  NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT,
  NOTEBOOK_OUTPUT_WEBVIEW_ACTION_WEIGHT,
  NotebookAction,
  NotebookCellAction,
  NotebookMultiCellAction,
  SELECT_KERNEL_ID,
  cellExecutionArgs,
  executeNotebookCondition,
  findTargetCellEditor,
  getContextFromActiveEditor,
  getContextFromUri,
  getEditorFromArgsOrActivePane,
  parseMultiCellExecutionArgs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxjb3JlQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgTWVudUlkLCBNZW51UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lLCBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIElDZWxsVmlld01vZGVsLCBjZWxsUmFuZ2VUb1ZpZXdDZWxscywgSUNlbGxPdXRwdXRWaWV3TW9kZWwgfSBmcm9tICcuLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSU5URVJBQ1RJVkVfV0lORE9XX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX0tFUk5FTF9DT1VOVCwgTk9URUJPT0tfS0VSTkVMX1NPVVJDRV9DT1VOVCwgUkVQTF9OT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSwgaXNJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNFZGl0b3JDb21tYW5kc0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUeXBlQ29uc3RyYWludCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5cbi8vIEtlcm5lbCBDb21tYW5kXG5leHBvcnQgY29uc3QgU0VMRUNUX0tFUk5FTF9JRCA9ICdfbm90ZWJvb2suc2VsZWN0S2VybmVsJztcbmV4cG9ydCBjb25zdCBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZID0gbG9jYWxpemUyKCdub3RlYm9va0FjdGlvbnMuY2F0ZWdvcnknLCAnTm90ZWJvb2snKTtcblxuZXhwb3J0IGNvbnN0IENFTExfVElUTEVfQ0VMTF9HUk9VUF9JRCA9ICdpbmxpbmUvY2VsbCc7XG5leHBvcnQgY29uc3QgQ0VMTF9USVRMRV9PVVRQVVRfR1JPVVBfSUQgPSAnaW5saW5lL291dHB1dCc7XG5cbmV4cG9ydCBjb25zdCBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQgPSBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWI7IC8vIHNtYWxsZXIgdGhhbiBTdWdnZXN0IFdpZGdldCwgZXRjXG5leHBvcnQgY29uc3QgTk9URUJPT0tfT1VUUFVUX1dFQlZJRVdfQUNUSU9OX1dFSUdIVCA9IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDE7IC8vIGhpZ2hlciB0aGFuIFdvcmtiZW5jaCBjb250cmlidXRpb24gKHN1Y2ggYXMgTm90ZWJvb2sgTGlzdCBWaWV3KSwgZXRjXG5cbmV4cG9ydCBjb25zdCBlbnVtIENlbGxUb29sYmFyT3JkZXIge1xuXHRSdW5TZWN0aW9uLFxuXHRFZGl0Q2VsbCxcblx0RXhlY3V0ZUFib3ZlQ2VsbHMsXG5cdEV4ZWN1dGVDZWxsQW5kQmVsb3csXG5cdFNhdmVDZWxsLFxuXHRTcGxpdENlbGwsXG5cdENsZWFyQ2VsbE91dHB1dFxufVxuXG5leHBvcnQgY29uc3QgZW51bSBDZWxsT3ZlcmZsb3dUb29sYmFyR3JvdXBzIHtcblx0Q29weSA9ICcxX2NvcHknLFxuXHRJbnNlcnQgPSAnMl9pbnNlcnQnLFxuXHRFZGl0ID0gJzNfZWRpdCcsXG5cdFNoYXJlID0gJzRfc2hhcmUnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IGNlbGw/OiBJQ2VsbFZpZXdNb2RlbDtcblx0cmVhZG9ubHkgbm90ZWJvb2tFZGl0b3I6IElBY3RpdmVOb3RlYm9va0VkaXRvcjtcblx0cmVhZG9ubHkgdWk/OiBib29sZWFuO1xuXHRyZWFkb25seSBzZWxlY3RlZENlbGxzPzogcmVhZG9ubHkgSUNlbGxWaWV3TW9kZWxbXTtcblx0cmVhZG9ubHkgYXV0b1JldmVhbD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0IGV4dGVuZHMgSU5vdGVib29rQWN0aW9uQ29udGV4dCB7XG5cdHJlYWRvbmx5IHVpOiB0cnVlO1xuXHRyZWFkb25seSBjZWxsOiBJQ2VsbFZpZXdNb2RlbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCBleHRlbmRzIElOb3RlYm9va0FjdGlvbkNvbnRleHQge1xuXHRyZWFkb25seSB1aTogZmFsc2U7XG5cdHJlYWRvbmx5IHNlbGVjdGVkQ2VsbHM6IHJlYWRvbmx5IElDZWxsVmlld01vZGVsW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQgZXh0ZW5kcyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0IHtcblx0Y2VsbDogSUNlbGxWaWV3TW9kZWw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rT3V0cHV0QWN0aW9uQ29udGV4dCBleHRlbmRzIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0IHtcblx0b3V0cHV0Vmlld01vZGVsOiBJQ2VsbE91dHB1dFZpZXdNb2RlbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRleHRGcm9tQWN0aXZlRWRpdG9yKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKTogSU5vdGVib29rQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGVkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0aWYgKCFlZGl0b3IgfHwgIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgYWN0aXZlQ2VsbCA9IGVkaXRvci5nZXRBY3RpdmVDZWxsKCk7XG5cdGNvbnN0IHNlbGVjdGVkQ2VsbHMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uVmlld01vZGVscygpO1xuXHRyZXR1cm4ge1xuXHRcdGNlbGw6IGFjdGl2ZUNlbGwsXG5cdFx0c2VsZWN0ZWRDZWxscyxcblx0XHRub3RlYm9va0VkaXRvcjogZWRpdG9yXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFdpZGdldEZyb21VcmkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHVyaTogVVJJKSB7XG5cdGNvbnN0IG5vdGVib29rRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3Qgd2lkZ2V0ID0gbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmxpc3ROb3RlYm9va0VkaXRvcnMoKS5maW5kKHdpZGdldCA9PiB3aWRnZXQuaGFzTW9kZWwoKSAmJiB3aWRnZXQudGV4dE1vZGVsLnVyaS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSk7XG5cblx0aWYgKHdpZGdldCAmJiB3aWRnZXQuaGFzTW9kZWwoKSkge1xuXHRcdHJldHVybiB3aWRnZXQ7XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGV4dEZyb21VcmkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBhbnkpIHtcblx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShjb250ZXh0KTtcblxuXHRpZiAodXJpKSB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gZ2V0V2lkZ2V0RnJvbVVyaShhY2Nlc3NvciwgdXJpKTtcblxuXHRcdGlmICh3aWRnZXQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG5vdGVib29rRWRpdG9yOiB3aWRnZXQsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kVGFyZ2V0Q2VsbEVkaXRvcihjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCwgdGFyZ2V0Q2VsbDogSUNlbGxWaWV3TW9kZWwpIHtcblx0bGV0IGZvdW5kRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBbLCBjb2RlRWRpdG9yXSBvZiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmNvZGVFZGl0b3JzKSB7XG5cdFx0aWYgKGlzRXF1YWwoY29kZUVkaXRvci5nZXRNb2RlbCgpPy51cmksIHRhcmdldENlbGwudXJpKSkge1xuXHRcdFx0Zm91bmRFZGl0b3IgPSBjb2RlRWRpdG9yO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGZvdW5kRWRpdG9yO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTm90ZWJvb2tBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoZGVzYzogSUFjdGlvbjJPcHRpb25zKSB7XG5cdFx0aWYgKGRlc2MuZjEgIT09IGZhbHNlKSB7XG5cdFx0XHRkZXNjLmYxID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmMU1lbnUgPSB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIElOVEVSQUNUSVZFX1dJTkRPV19JU19BQ1RJVkVfRURJVE9SLCBSRVBMX05PVEVCT09LX0lTX0FDVElWRV9FRElUT1IpXG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoIWRlc2MubWVudSkge1xuXHRcdFx0XHRkZXNjLm1lbnUgPSBbXTtcblx0XHRcdH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoZGVzYy5tZW51KSkge1xuXHRcdFx0XHRkZXNjLm1lbnUgPSBbZGVzYy5tZW51XTtcblx0XHRcdH1cblxuXHRcdFx0ZGVzYy5tZW51ID0gW1xuXHRcdFx0XHQuLi5kZXNjLm1lbnUsXG5cdFx0XHRcdGYxTWVudVxuXHRcdFx0XTtcblx0XHR9XG5cblx0XHRkZXNjLmNhdGVnb3J5ID0gTk9URUJPT0tfQUNUSU9OU19DQVRFR09SWTtcblxuXHRcdHN1cGVyKGRlc2MpO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogYW55LCAuLi5hZGRpdGlvbmFsQXJnczogYW55W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzZW5kRW50cnlUZWxlbWV0cnkoYWNjZXNzb3IsIHRoaXMuZGVzYy5pZCwgY29udGV4dCk7XG5cblx0XHRpZiAoIXRoaXMuaXNOb3RlYm9va0FjdGlvbkNvbnRleHQoY29udGV4dCkpIHtcblx0XHRcdGNvbnRleHQgPSB0aGlzLmdldEVkaXRvckNvbnRleHRGcm9tQXJnc09yQWN0aXZlKGFjY2Vzc29yLCBjb250ZXh0LCAuLi5hZGRpdGlvbmFsQXJncyk7XG5cdFx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJ1bldpdGhDb250ZXh0KGFjY2Vzc29yLCBjb250ZXh0KTtcblx0fVxuXG5cdGFic3RyYWN0IHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPjtcblxuXHRwcml2YXRlIGlzTm90ZWJvb2tBY3Rpb25Db250ZXh0KGNvbnRleHQ/OiB1bmtub3duKTogY29udGV4dCBpcyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0IHtcblx0XHRyZXR1cm4gISFjb250ZXh0ICYmICEhKGNvbnRleHQgYXMgSU5vdGVib29rQWN0aW9uQ29udGV4dCkubm90ZWJvb2tFZGl0b3I7XG5cdH1cblxuXHRnZXRFZGl0b3JDb250ZXh0RnJvbUFyZ3NPckFjdGl2ZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IGFueSwgLi4uYWRkaXRpb25hbEFyZ3M6IGFueVtdKTogSU5vdGVib29rQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldENvbnRleHRGcm9tQWN0aXZlRWRpdG9yKGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkpO1xuXHR9XG59XG5cbi8vIHRvZG9AcmVib3JuaXgsIHJlcGxhY2UgTm90ZWJvb2tBY3Rpb24gd2l0aCB0aGlzXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoZGVzYzogSUFjdGlvbjJPcHRpb25zKSB7XG5cdFx0aWYgKGRlc2MuZjEgIT09IGZhbHNlKSB7XG5cdFx0XHRkZXNjLmYxID0gZmFsc2U7XG5cdFx0XHRjb25zdCBmMU1lbnUgPSB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsXG5cdFx0XHRcdHdoZW46IE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1Jcblx0XHRcdH07XG5cblx0XHRcdGlmICghZGVzYy5tZW51KSB7XG5cdFx0XHRcdGRlc2MubWVudSA9IFtdO1xuXHRcdFx0fSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShkZXNjLm1lbnUpKSB7XG5cdFx0XHRcdGRlc2MubWVudSA9IFtkZXNjLm1lbnVdO1xuXHRcdFx0fVxuXG5cdFx0XHRkZXNjLm1lbnUgPSBbXG5cdFx0XHRcdC4uLmRlc2MubWVudSxcblx0XHRcdFx0ZjFNZW51XG5cdFx0XHRdO1xuXHRcdH1cblxuXHRcdGRlc2MuY2F0ZWdvcnkgPSBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZO1xuXG5cdFx0c3VwZXIoZGVzYyk7XG5cdH1cblxuXHRwYXJzZUFyZ3MoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YWJzdHJhY3QgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgSU5vdGVib29rQ2VsbFRvb2xiYXJBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogVGhlIGFjdGlvbi9jb21tYW5kIGFyZ3MgYXJlIHJlc29sdmVkIGluIGZvbGxvd2luZyBvcmRlclxuXHQgKiBgcnVuKGFjY2Vzc29yLCBjZWxsVG9vbGJhckNvbnRleHQpYCBmcm9tIGNlbGwgdG9vbGJhclxuXHQgKiBgcnVuKGFjY2Vzc29yLCAuLi5hcmdzKWAgZnJvbSBjb21tYW5kIHNlcnZpY2Ugd2l0aCBhcmd1bWVudHNcblx0ICogYHJ1bihhY2Nlc3NvciwgdW5kZWZpbmVkKWAgZnJvbSBrZXlib2FyZCBzaG9ydGN1dHMsIGNvbW1hbmQgcGFsYXR0ZSwgZXRjXG5cdCAqL1xuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFkZGl0aW9uYWxBcmdzOiBhbnlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbnRleHQgPSBhZGRpdGlvbmFsQXJnc1swXTtcblxuXHRcdHNlbmRFbnRyeVRlbGVtZXRyeShhY2Nlc3NvciwgdGhpcy5kZXNjLmlkLCBjb250ZXh0KTtcblxuXHRcdGNvbnN0IGlzRnJvbUNlbGxUb29sYmFyID0gaXNDZWxsVG9vbGJhckNvbnRleHQoY29udGV4dCk7XG5cdFx0aWYgKGlzRnJvbUNlbGxUb29sYmFyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ydW5XaXRoQ29udGV4dChhY2Nlc3NvciwgY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0Ly8gaGFuZGxlIHBhcnNlZCBhcmdzXG5cdFx0Y29uc3QgcGFyc2VkQXJncyA9IHRoaXMucGFyc2VBcmdzKGFjY2Vzc29yLCAuLi5hZGRpdGlvbmFsQXJncyk7XG5cdFx0aWYgKHBhcnNlZEFyZ3MpIHtcblx0XHRcdHJldHVybiB0aGlzLnJ1bldpdGhDb250ZXh0KGFjY2Vzc29yLCBwYXJzZWRBcmdzKTtcblx0XHR9XG5cblx0XHQvLyBubyBwYXJzZWQgYXJncywgdHJ5IGhhbmRsZSBhY3RpdmUgZWRpdG9yXG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yRnJvbUFyZ3NPckFjdGl2ZVBhbmUoYWNjZXNzb3IpO1xuXHRcdGlmIChlZGl0b3IpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkQ2VsbFJhbmdlOiBJQ2VsbFJhbmdlW10gPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLmxlbmd0aCA9PT0gMCA/IFtlZGl0b3IuZ2V0Rm9jdXMoKV0gOiBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXG5cblx0XHRcdHJldHVybiB0aGlzLnJ1bldpdGhDb250ZXh0KGFjY2Vzc29yLCB7XG5cdFx0XHRcdHVpOiBmYWxzZSxcblx0XHRcdFx0bm90ZWJvb2tFZGl0b3I6IGVkaXRvcixcblx0XHRcdFx0c2VsZWN0ZWRDZWxsczogY2VsbFJhbmdlVG9WaWV3Q2VsbHMoZWRpdG9yLCBzZWxlY3RlZENlbGxSYW5nZSlcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgTm90ZWJvb2tDZWxsQWN0aW9uPFQgPSBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dD4gZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdHByb3RlY3RlZCBpc0NlbGxBY3Rpb25Db250ZXh0KGNvbnRleHQ/OiB1bmtub3duKTogY29udGV4dCBpcyBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCB7XG5cdFx0cmV0dXJuICEhY29udGV4dCAmJiAhIShjb250ZXh0IGFzIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KS5ub3RlYm9va0VkaXRvciAmJiAhIShjb250ZXh0IGFzIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KS5jZWxsO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldENlbGxDb250ZXh0RnJvbUFyZ3MoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBULCAuLi5hZGRpdGlvbmFsQXJnczogYW55W10pOiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0LCAuLi5hZGRpdGlvbmFsQXJnczogYW55W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzZW5kRW50cnlUZWxlbWV0cnkoYWNjZXNzb3IsIHRoaXMuZGVzYy5pZCwgY29udGV4dCk7XG5cblx0XHRpZiAodGhpcy5pc0NlbGxBY3Rpb25Db250ZXh0KGNvbnRleHQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ydW5XaXRoQ29udGV4dChhY2Nlc3NvciwgY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGV4dEZyb21BcmdzID0gdGhpcy5nZXRDZWxsQ29udGV4dEZyb21BcmdzKGFjY2Vzc29yLCBjb250ZXh0LCAuLi5hZGRpdGlvbmFsQXJncyk7XG5cblx0XHRpZiAoY29udGV4dEZyb21BcmdzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ydW5XaXRoQ29udGV4dChhY2Nlc3NvciwgY29udGV4dEZyb21BcmdzKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDb250ZXh0ID0gdGhpcy5nZXRFZGl0b3JDb250ZXh0RnJvbUFyZ3NPckFjdGl2ZShhY2Nlc3Nvcik7XG5cdFx0aWYgKHRoaXMuaXNDZWxsQWN0aW9uQ29udGV4dChhY3RpdmVFZGl0b3JDb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucnVuV2l0aENvbnRleHQoYWNjZXNzb3IsIGFjdGl2ZUVkaXRvckNvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdGFic3RyYWN0IG92ZXJyaWRlIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjb25zdCBleGVjdXRlTm90ZWJvb2tDb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5vcihDb250ZXh0S2V5RXhwci5ncmVhdGVyKE5PVEVCT09LX0tFUk5FTF9DT1VOVC5rZXksIDApLCBDb250ZXh0S2V5RXhwci5ncmVhdGVyKE5PVEVCT09LX0tFUk5FTF9TT1VSQ0VfQ09VTlQua2V5LCAwKSk7XG5cbmludGVyZmFjZSBJTXVsdGlDZWxsQXJncyB7XG5cdHJhbmdlczogSUNlbGxSYW5nZVtdO1xuXHRkb2N1bWVudD86IFVSSTtcblx0YXV0b1JldmVhbD86IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIHNlbmRFbnRyeVRlbGVtZXRyeShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaWQ6IHN0cmluZywgY29udGV4dD86IGFueSkge1xuXHRpZiAoY29udGV4dCkge1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGlmIChjb250ZXh0LnNvdXJjZSkge1xuXHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGlkLCBmcm9tOiBjb250ZXh0LnNvdXJjZSB9KTtcblx0XHR9IGVsc2UgaWYgKFVSSS5pc1VyaShjb250ZXh0KSkge1xuXHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IGlkLCBmcm9tOiAnY2VsbEVkaXRvckNvbnRleHRNZW51JyB9KTtcblx0XHR9IGVsc2UgaWYgKGNvbnRleHQgJiYgJ2Zyb20nIGluIGNvbnRleHQgJiYgY29udGV4dC5mcm9tID09PSAnY2VsbENvbnRhaW5lcicpIHtcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBpZCwgZnJvbTogJ2NlbGxDb250YWluZXInIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBmcm9tID0gaXNDZWxsVG9vbGJhckNvbnRleHQoY29udGV4dCkgPyAnY2VsbFRvb2xiYXInIDogKGlzRWRpdG9yQ29tbWFuZHNDb250ZXh0KGNvbnRleHQpID8gJ2VkaXRvclRvb2xiYXInIDogJ290aGVyJyk7XG5cdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogaWQsIGZyb206IGZyb20gfSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzQ2VsbFRvb2xiYXJDb250ZXh0KGNvbnRleHQ/OiB1bmtub3duKTogY29udGV4dCBpcyBJTm90ZWJvb2tDZWxsVG9vbGJhckFjdGlvbkNvbnRleHQge1xuXHRyZXR1cm4gISFjb250ZXh0ICYmICEhKGNvbnRleHQgYXMgSU5vdGVib29rQWN0aW9uQ29udGV4dCkubm90ZWJvb2tFZGl0b3IgJiYgKGNvbnRleHQgYXMgSU5vdGVib29rQWN0aW9uQ29udGV4dCAmIHsgJG1pZDogTWFyc2hhbGxlZElkIH0pLiRtaWQgPT09IE1hcnNoYWxsZWRJZC5Ob3RlYm9va0NlbGxBY3Rpb25Db250ZXh0O1xufVxuXG5mdW5jdGlvbiBpc011bHRpQ2VsbEFyZ3MoYXJnOiB1bmtub3duKTogYXJnIGlzIElNdWx0aUNlbGxBcmdzIHtcblx0aWYgKGFyZyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IHJhbmdlcyA9IChhcmcgYXMgSU11bHRpQ2VsbEFyZ3MpLnJhbmdlcztcblx0aWYgKCFyYW5nZXMpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoIUFycmF5LmlzQXJyYXkocmFuZ2VzKSB8fCByYW5nZXMuc29tZShyYW5nZSA9PiAhaXNJQ2VsbFJhbmdlKHJhbmdlKSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoKGFyZyBhcyBJTXVsdGlDZWxsQXJncykuZG9jdW1lbnQpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKChhcmcgYXMgSU11bHRpQ2VsbEFyZ3MpLmRvY3VtZW50KTtcblxuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZGl0b3JGcm9tQXJnc09yQWN0aXZlUGFuZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IFVyaUNvbXBvbmVudHMpOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRjb25zdCBlZGl0b3JGcm9tVXJpID0gZ2V0Q29udGV4dEZyb21VcmkoYWNjZXNzb3IsIGNvbnRleHQpPy5ub3RlYm9va0VkaXRvcjtcblxuXHRpZiAoZWRpdG9yRnJvbVVyaSkge1xuXHRcdHJldHVybiBlZGl0b3JGcm9tVXJpO1xuXHR9XG5cblx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRpZiAoIWVkaXRvciB8fCAhZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZXR1cm4gZWRpdG9yO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VNdWx0aUNlbGxFeGVjdXRpb25BcmdzKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiBhbnlbXSk6IElOb3RlYm9va0NvbW1hbmRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZmlyc3RBcmcgPSBhcmdzWzBdO1xuXG5cdGlmIChpc011bHRpQ2VsbEFyZ3MoZmlyc3RBcmcpKSB7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0RWRpdG9yRnJvbUFyZ3NPckFjdGl2ZVBhbmUoYWNjZXNzb3IsIGZpcnN0QXJnLmRvY3VtZW50KTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlcyA9IGZpcnN0QXJnLnJhbmdlcztcblx0XHRjb25zdCBzZWxlY3RlZENlbGxzID0gcmFuZ2VzLm1hcChyYW5nZSA9PiBlZGl0b3IuZ2V0Q2VsbHNJblJhbmdlKHJhbmdlKS5zbGljZSgwKSkuZmxhdCgpO1xuXHRcdGNvbnN0IGF1dG9SZXZlYWwgPSBmaXJzdEFyZy5hdXRvUmV2ZWFsO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1aTogZmFsc2UsXG5cdFx0XHRub3RlYm9va0VkaXRvcjogZWRpdG9yLFxuXHRcdFx0c2VsZWN0ZWRDZWxscyxcblx0XHRcdGF1dG9SZXZlYWxcblx0XHR9O1xuXHR9XG5cblx0Ly8gaGFuZGxlIGxlZ2FjeSBhcmd1bWVudHNcblx0aWYgKGlzSUNlbGxSYW5nZShmaXJzdEFyZykpIHtcblx0XHQvLyBjZWxsUmFuZ2UsIGRvY3VtZW50XG5cdFx0Y29uc3Qgc2Vjb25kQXJnID0gYXJnc1sxXTtcblx0XHRjb25zdCBlZGl0b3IgPSBnZXRFZGl0b3JGcm9tQXJnc09yQWN0aXZlUGFuZShhY2Nlc3Nvciwgc2Vjb25kQXJnKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR1aTogZmFsc2UsXG5cdFx0XHRub3RlYm9va0VkaXRvcjogZWRpdG9yLFxuXHRcdFx0c2VsZWN0ZWRDZWxsczogZWRpdG9yLmdldENlbGxzSW5SYW5nZShmaXJzdEFyZylcblx0XHR9O1xuXHR9XG5cblx0Ly8gbGV0J3MganVzdCBleGVjdXRlIHRoZSBhY3RpdmUgY2VsbFxuXHRjb25zdCBjb250ZXh0ID0gZ2V0Q29udGV4dEZyb21BY3RpdmVFZGl0b3IoYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSk7XG5cdHJldHVybiBjb250ZXh0ID8ge1xuXHRcdHVpOiBmYWxzZSxcblx0XHRub3RlYm9va0VkaXRvcjogY29udGV4dC5ub3RlYm9va0VkaXRvcixcblx0XHRzZWxlY3RlZENlbGxzOiBjb250ZXh0LnNlbGVjdGVkQ2VsbHMgPz8gW10sXG5cdFx0Y2VsbDogY29udGV4dC5jZWxsXG5cdH0gOiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjb25zdCBjZWxsRXhlY3V0aW9uQXJnczogUmVhZG9ubHlBcnJheTx7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaXNPcHRpb25hbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBjb25zdHJhaW50PzogVHlwZUNvbnN0cmFpbnQ7XG5cdHJlYWRvbmx5IHNjaGVtYT86IElKU09OU2NoZW1hO1xufT4gPSBbXG5cdFx0e1xuXHRcdFx0aXNPcHRpb25hbDogdHJ1ZSxcblx0XHRcdG5hbWU6ICdvcHRpb25zJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIGNlbGwgcmFuZ2Ugb3B0aW9ucycsXG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0J3JlcXVpcmVkJzogWydyYW5nZXMnXSxcblx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0J3Jhbmdlcyc6IHtcblx0XHRcdFx0XHRcdCd0eXBlJzogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdCdyZXF1aXJlZCc6IFsnc3RhcnQnLCAnZW5kJ10sXG5cdFx0XHRcdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQnc3RhcnQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcidcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHQnZW5kJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInXG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnZG9jdW1lbnQnOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogJ1RoZSBkb2N1bWVudCB1cmknLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J2F1dG9SZXZlYWwnOiB7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6ICdXaGV0aGVyIHRoZSBjZWxsIHNob3VsZCBiZSByZXZlYWxlZCBpbnRvIHZpZXcgYXV0b21hdGljYWxseSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdF07XG5cblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSwge1xuXHRzdWJtZW51OiBNZW51SWQuTm90ZWJvb2tDZWxsSW5zZXJ0LFxuXHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rTWVudS5pbnNlcnRDZWxsJywgXCJJbnNlcnQgQ2VsbFwiKSxcblx0Z3JvdXA6IENlbGxPdmVyZmxvd1Rvb2xiYXJHcm91cHMuSW5zZXJ0LFxuXHR3aGVuOiBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUuaXNFcXVhbFRvKHRydWUpXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCB7XG5cdHN1Ym1lbnU6IE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSxcblx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va01lbnUuY2VsbFRpdGxlJywgXCJOb3RlYm9vayBDZWxsXCIpLFxuXHRncm91cDogQ2VsbE92ZXJmbG93VG9vbGJhckdyb3Vwcy5JbnNlcnQsXG5cdHdoZW46IE5PVEVCT09LX0VESVRPUl9GT0NVU0VEXG59KTtcblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Ob3RlYm9va0NlbGxUaXRsZSwge1xuXHR0aXRsZTogbG9jYWxpemUoJ21pU2hhcmUnLCBcIlNoYXJlXCIpLFxuXHRzdWJtZW51OiBNZW51SWQuRWRpdG9yQ29udGV4dFNoYXJlLFxuXHRncm91cDogQ2VsbE92ZXJmbG93VG9vbGJhckdyb3Vwcy5TaGFyZVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUEwQixRQUFRLG9CQUFvQjtBQUMvRCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlDQUF3RSw0QkFBa0Q7QUFDbkksU0FBUyxxQ0FBcUMsMEJBQTBCLHlCQUF5QiwyQkFBMkIsdUJBQXVCLDhCQUE4QixzQ0FBc0M7QUFDdk4sU0FBcUIsb0JBQW9CO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMseUJBQXlCO0FBSWxDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsZUFBZTtBQUdqQixNQUFNLG1CQUFtQjtBQUN6QixNQUFNLDRCQUE0QixVQUFVLDRCQUE0QixVQUFVO0FBRWxGLE1BQU0sMkJBQTJCO0FBQ2pDLE1BQU0sNkJBQTZCO0FBRW5DLE1BQU0sdUNBQXVDLGlCQUFpQjtBQUM5RCxNQUFNLHdDQUF3QyxpQkFBaUIsbUJBQW1CO0FBRWxGLElBQVcsbUJBQVgsa0JBQVdBLHNCQUFYO0FBQ04sRUFBQUEsb0NBQUE7QUFDQSxFQUFBQSxvQ0FBQTtBQUNBLEVBQUFBLG9DQUFBO0FBQ0EsRUFBQUEsb0NBQUE7QUFDQSxFQUFBQSxvQ0FBQTtBQUNB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
