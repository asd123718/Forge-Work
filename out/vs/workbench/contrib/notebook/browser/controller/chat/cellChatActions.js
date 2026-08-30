import { Codicon } from "../../../../../../base/common/codicons.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { localize, localize2 } from "../../../../../../nls.js";
import { MenuId, MenuRegistry, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContextKey } from "../../../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { CTX_INLINE_CHAT_REQUEST_IN_PROGRESS, CTX_INLINE_CHAT_VISIBLE } from "../../../../inlineChat/common/inlineChat.js";
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from "./notebookChatContext.js";
import { NotebookAction, getContextFromActiveEditor, getEditorFromArgsOrActivePane } from "../coreActions.js";
import { insertNewCell } from "../insertCellActions.js";
import { CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED } from "../../../common/notebookContextKeys.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { ChatContextKeys } from "../../../../chat/common/actions/chatContextKeys.js";
import { InlineChatController } from "../../../../inlineChat/browser/inlineChatController.js";
import { EditorAction2 } from "../../../../../../editor/browser/editorExtensions.js";
async function startChat(accessor, context, index, input, autoSend, source) {
  const configurationService = accessor.get(IConfigurationService);
  const commandService = accessor.get(ICommandService);
  if (configurationService.getValue(NotebookSetting.cellGenerate) || configurationService.getValue(NotebookSetting.cellChat)) {
    const activeCell = context.notebookEditor.getActiveCell();
    const targetCell = activeCell?.getTextLength() === 0 && source !== "insertToolbar" ? activeCell : await insertNewCell(accessor, context, CellKind.Code, "below", true);
    if (targetCell) {
      targetCell.enableAutoLanguageDetection();
      await context.notebookEditor.revealFirstLineIfOutsideViewport(targetCell);
      const codeEditor = context.notebookEditor.codeEditors.find((ce) => ce[0] === targetCell)?.[1];
      if (codeEditor) {
        codeEditor.focus();
        commandService.executeCommand("inlineChat.start");
      }
    }
  }
}
registerAction2(class extends NotebookAction {
  constructor() {
    super(
      {
        id: "notebook.cell.chat.start",
        title: {
          value: "$(sparkle) " + localize("notebookActions.menu.insertCodeCellWithChat", "Generate"),
          original: "$(sparkle) Generate"
        },
        tooltip: localize("notebookActions.menu.insertCodeCellWithChat.tooltip", "Start Chat to Generate Code"),
        metadata: {
          description: localize("notebookActions.menu.insertCodeCellWithChat.tooltip", "Start Chat to Generate Code"),
          args: [
            {
              name: "args",
              schema: {
                type: "object",
                required: ["index"],
                properties: {
                  "index": {
                    type: "number"
                  },
                  "input": {
                    type: "string"
                  },
                  "autoSend": {
                    type: "boolean"
                  }
                }
              }
            }
          ]
        },
        f1: false,
        keybinding: {
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_FOCUSED,
            NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
            ContextKeyExpr.not(InputFocusedContextKey),
            CTX_NOTEBOOK_CHAT_HAS_AGENT,
            ContextKeyExpr.or(
              ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
              ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
            )
          ),
          weight: KeybindingWeight.WorkbenchContrib,
          primary: KeyMod.CtrlCmd | KeyCode.KeyI,
          secondary: [KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyI)]
        },
        menu: [
          {
            id: MenuId.NotebookCellBetween,
            group: "inline",
            order: -1,
            when: ContextKeyExpr.and(
              NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
              CTX_NOTEBOOK_CHAT_HAS_AGENT,
              ContextKeyExpr.or(
                ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
                ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
              )
            )
          }
        ]
      }
    );
  }
  getEditorContextFromArgsOrActive(accessor, ...args) {
    const [firstArg] = args;
    if (!firstArg) {
      const notebookEditor2 = getEditorFromArgsOrActivePane(accessor);
      if (!notebookEditor2) {
        return void 0;
      }
      const activeCell = notebookEditor2.getActiveCell();
      if (!activeCell) {
        return void 0;
      }
      return {
        cell: activeCell,
        notebookEditor: notebookEditor2,
        input: void 0,
        autoSend: void 0
      };
    }
    if (typeof firstArg !== "object" || typeof firstArg.index !== "number") {
      return void 0;
    }
    const notebookEditor = getEditorFromArgsOrActivePane(accessor);
    if (!notebookEditor) {
      return void 0;
    }
    const cell = firstArg.index <= 0 ? void 0 : notebookEditor.cellAt(firstArg.index - 1);
    return {
      cell,
      notebookEditor,
      input: firstArg.input,
      autoSend: firstArg.autoSend
    };
  }
  async runWithContext(accessor, context) {
    const index = Math.max(0, context.cell ? context.notebookEditor.getCellIndex(context.cell) + 1 : 0);
    await startChat(accessor, context, index, context.input, context.autoSend, context.source);
  }
});
registerAction2(class extends NotebookAction {
  constructor() {
    super(
      {
        id: "notebook.cell.chat.startAtTop",
        title: {
          value: "$(sparkle) " + localize("notebookActions.menu.insertCodeCellWithChat", "Generate"),
          original: "$(sparkle) Generate"
        },
        tooltip: localize("notebookActions.menu.insertCodeCellWithChat.tooltip", "Start Chat to Generate Code"),
        f1: false,
        menu: [
          {
            id: MenuId.NotebookCellListTop,
            group: "inline",
            order: -1,
            when: ContextKeyExpr.and(
              NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
              CTX_NOTEBOOK_CHAT_HAS_AGENT,
              ContextKeyExpr.or(
                ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
                ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
              )
            )
          }
        ]
      }
    );
  }
  async runWithContext(accessor, context) {
    await startChat(accessor, context, 0, "", false);
  }
});
MenuRegistry.appendMenuItem(MenuId.NotebookToolbar, {
  command: {
    id: "notebook.cell.chat.start",
    icon: Codicon.sparkle,
    title: localize("notebookActions.menu.insertCode.ontoolbar", "Generate"),
    tooltip: localize("notebookActions.menu.insertCode.tooltip", "Start Chat to Generate Code")
  },
  order: -10,
  group: "navigation/add",
  when: ContextKeyExpr.and(
    NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
    ContextKeyExpr.notEquals("config.notebook.insertToolbarLocation", "betweenCells"),
    ContextKeyExpr.notEquals("config.notebook.insertToolbarLocation", "hidden"),
    CTX_NOTEBOOK_CHAT_HAS_AGENT,
    ContextKeyExpr.or(
      ContextKeyExpr.equals(`config.${NotebookSetting.cellChat}`, true),
      ContextKeyExpr.equals(`config.${NotebookSetting.cellGenerate}`, true)
    )
  )
});
class AcceptChangesAndRun extends EditorAction2 {
  constructor() {
    super({
      id: "notebook.inlineChat.acceptChangesAndRun",
      title: localize2("notebook.apply1", "Accept and Run"),
      shortTitle: localize("notebook.apply2", "Accept & Run"),
      tooltip: localize("notebook.apply3", "Accept the changes and run the cell"),
      icon: Codicon.check,
      f1: true,
      precondition: ContextKeyExpr.and(
        NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
        CTX_INLINE_CHAT_VISIBLE
      ),
      keybinding: void 0,
      menu: [{
        id: MenuId.ChatEditorInlineExecute,
        group: "0_main",
        order: 2,
        when: ContextKeyExpr.and(
          NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
          ChatContextKeys.inputHasText.toNegated(),
          CTX_INLINE_CHAT_REQUEST_IN_PROGRESS.toNegated()
        )
      }]
    });
  }
  runEditorCommand(accessor, codeEditor) {
    const editor = getContextFromActiveEditor(accessor.get(IEditorService));
    const ctrl = InlineChatController.get(codeEditor);
    if (!editor || !ctrl) {
      return;
    }
    const matchedCell = editor.notebookEditor.codeEditors.find((e) => e[1] === codeEditor);
    const cell = matchedCell?.[0];
    if (!cell) {
      return;
    }
    ctrl.acceptSession();
    return editor.notebookEditor.executeNotebookCells(Iterable.single(cell));
  }
}
registerAction2(AcceptChangesAndRun);
export {
  AcceptChangesAndRun
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxjaGF0XFxjZWxsQ2hhdEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElucHV0Rm9jdXNlZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDVFhfSU5MSU5FX0NIQVRfUkVRVUVTVF9JTl9QUk9HUkVTUywgQ1RYX0lOTElORV9DSEFUX1ZJU0lCTEUgfSBmcm9tICcuLi8uLi8uLi8uLi9pbmxpbmVDaGF0L2NvbW1vbi9pbmxpbmVDaGF0LmpzJztcbmltcG9ydCB7IENUWF9OT1RFQk9PS19DSEFUX0hBU19BR0VOVCB9IGZyb20gJy4vbm90ZWJvb2tDaGF0Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tBY3Rpb25Db250ZXh0LCBOb3RlYm9va0FjdGlvbiwgZ2V0Q29udGV4dEZyb21BY3RpdmVFZGl0b3IsIGdldEVkaXRvckZyb21BcmdzT3JBY3RpdmVQYW5lIH0gZnJvbSAnLi4vY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgaW5zZXJ0TmV3Q2VsbCB9IGZyb20gJy4uL2luc2VydENlbGxBY3Rpb25zLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBOb3RlYm9va1NldHRpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElubGluZUNoYXRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcblxuaW50ZXJmYWNlIElJbnNlcnRDZWxsV2l0aENoYXRBcmdzIGV4dGVuZHMgSU5vdGVib29rQWN0aW9uQ29udGV4dCB7XG5cdGlucHV0Pzogc3RyaW5nO1xuXHRhdXRvU2VuZD86IGJvb2xlYW47XG5cdHNvdXJjZT86IHN0cmluZztcbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RhcnRDaGF0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tBY3Rpb25Db250ZXh0LCBpbmRleDogbnVtYmVyLCBpbnB1dD86IHN0cmluZywgYXV0b1NlbmQ/OiBib29sZWFuLCBzb3VyY2U/OiBzdHJpbmcpIHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblxuXHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLmNlbGxHZW5lcmF0ZSkgfHwgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLmNlbGxDaGF0KSkge1xuXHRcdGNvbnN0IGFjdGl2ZUNlbGwgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKTtcblx0XHRjb25zdCB0YXJnZXRDZWxsID0gYWN0aXZlQ2VsbD8uZ2V0VGV4dExlbmd0aCgpID09PSAwICYmIHNvdXJjZSAhPT0gJ2luc2VydFRvb2xiYXInID8gYWN0aXZlQ2VsbCA6IChhd2FpdCBpbnNlcnROZXdDZWxsKGFjY2Vzc29yLCBjb250ZXh0LCBDZWxsS2luZC5Db2RlLCAnYmVsb3cnLCB0cnVlKSk7XG5cblx0XHRpZiAodGFyZ2V0Q2VsbCkge1xuXHRcdFx0dGFyZ2V0Q2VsbC5lbmFibGVBdXRvTGFuZ3VhZ2VEZXRlY3Rpb24oKTtcblx0XHRcdGF3YWl0IGNvbnRleHQubm90ZWJvb2tFZGl0b3IucmV2ZWFsRmlyc3RMaW5lSWZPdXRzaWRlVmlld3BvcnQodGFyZ2V0Q2VsbCk7XG5cdFx0XHRjb25zdCBjb2RlRWRpdG9yID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5jb2RlRWRpdG9ycy5maW5kKGNlID0+IGNlWzBdID09PSB0YXJnZXRDZWxsKT8uWzFdO1xuXHRcdFx0aWYgKGNvZGVFZGl0b3IpIHtcblx0XHRcdFx0Y29kZUVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnaW5saW5lQ2hhdC5zdGFydCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ25vdGVib29rLmNlbGwuY2hhdC5zdGFydCcsXG5cdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0dmFsdWU6ICckKHNwYXJrbGUpICcgKyBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLm1lbnUuaW5zZXJ0Q29kZUNlbGxXaXRoQ2hhdCcsIFwiR2VuZXJhdGVcIiksXG5cdFx0XHRcdFx0b3JpZ2luYWw6ICckKHNwYXJrbGUpIEdlbmVyYXRlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5tZW51Lmluc2VydENvZGVDZWxsV2l0aENoYXQudG9vbHRpcCcsIFwiU3RhcnQgQ2hhdCB0byBHZW5lcmF0ZSBDb2RlXCIpLFxuXHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLm1lbnUuaW5zZXJ0Q29kZUNlbGxXaXRoQ2hhdC50b29sdGlwJywgXCJTdGFydCBDaGF0IHRvIEdlbmVyYXRlIENvZGVcIiksXG5cdFx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2luZGV4J10sXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J2luZGV4Jzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdCdpbnB1dCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHQnYXV0b1NlbmQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsXG5cdFx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRURJVEFCTEUuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpLFxuXHRcdFx0XHRcdFx0Q1RYX05PVEVCT09LX0NIQVRfSEFTX0FHRU5ULFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7Tm90ZWJvb2tTZXR0aW5nLmNlbGxDaGF0fWAsIHRydWUpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jZWxsR2VuZXJhdGV9YCwgdHJ1ZSlcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlDb2RlLktleUkpXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsQmV0d2Vlbixcblx0XHRcdFx0XHRcdGdyb3VwOiAnaW5saW5lJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAtMSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0VESVRBQkxFLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0XHRcdFx0Q1RYX05PVEVCT09LX0NIQVRfSEFTX0FHRU5ULFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jZWxsQ2hhdH1gLCB0cnVlKSxcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jZWxsR2VuZXJhdGV9YCwgdHJ1ZSlcblx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRFZGl0b3JDb250ZXh0RnJvbUFyZ3NPckFjdGl2ZShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogYW55W10pOiBJSW5zZXJ0Q2VsbFdpdGhDaGF0QXJncyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgW2ZpcnN0QXJnXSA9IGFyZ3M7XG5cdFx0aWYgKCFmaXJzdEFyZykge1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3IgPSBnZXRFZGl0b3JGcm9tQXJnc09yQWN0aXZlUGFuZShhY2Nlc3Nvcik7XG5cdFx0XHRpZiAoIW5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGl2ZUNlbGwgPSBub3RlYm9va0VkaXRvci5nZXRBY3RpdmVDZWxsKCk7XG5cdFx0XHRpZiAoIWFjdGl2ZUNlbGwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y2VsbDogYWN0aXZlQ2VsbCxcblx0XHRcdFx0bm90ZWJvb2tFZGl0b3IsXG5cdFx0XHRcdGlucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdGF1dG9TZW5kOiB1bmRlZmluZWRcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBmaXJzdEFyZyAhPT0gJ29iamVjdCcgfHwgdHlwZW9mIGZpcnN0QXJnLmluZGV4ICE9PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IGdldEVkaXRvckZyb21BcmdzT3JBY3RpdmVQYW5lKGFjY2Vzc29yKTtcblx0XHRpZiAoIW5vdGVib29rRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGwgPSBmaXJzdEFyZy5pbmRleCA8PSAwID8gdW5kZWZpbmVkIDogbm90ZWJvb2tFZGl0b3IuY2VsbEF0KGZpcnN0QXJnLmluZGV4IC0gMSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2VsbCxcblx0XHRcdG5vdGVib29rRWRpdG9yLFxuXHRcdFx0aW5wdXQ6IGZpcnN0QXJnLmlucHV0LFxuXHRcdFx0YXV0b1NlbmQ6IGZpcnN0QXJnLmF1dG9TZW5kXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJSW5zZXJ0Q2VsbFdpdGhDaGF0QXJncykge1xuXHRcdGNvbnN0IGluZGV4ID0gTWF0aC5tYXgoMCwgY29udGV4dC5jZWxsID8gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoY29udGV4dC5jZWxsKSArIDEgOiAwKTtcblx0XHRhd2FpdCBzdGFydENoYXQoYWNjZXNzb3IsIGNvbnRleHQsIGluZGV4LCBjb250ZXh0LmlucHV0LCBjb250ZXh0LmF1dG9TZW5kLCBjb250ZXh0LnNvdXJjZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ25vdGVib29rLmNlbGwuY2hhdC5zdGFydEF0VG9wJyxcblx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHR2YWx1ZTogJyQoc3BhcmtsZSkgJyArIGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMubWVudS5pbnNlcnRDb2RlQ2VsbFdpdGhDaGF0JywgXCJHZW5lcmF0ZVwiKSxcblx0XHRcdFx0XHRvcmlnaW5hbDogJyQoc3BhcmtsZSkgR2VuZXJhdGUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLm1lbnUuaW5zZXJ0Q29kZUNlbGxXaXRoQ2hhdC50b29sdGlwJywgXCJTdGFydCBDaGF0IHRvIEdlbmVyYXRlIENvZGVcIiksXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0bWVudTogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsTGlzdFRvcCxcblx0XHRcdFx0XHRcdGdyb3VwOiAnaW5saW5lJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAtMSxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfRURJVE9SX0VESVRBQkxFLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdFx0XHRcdFx0Q1RYX05PVEVCT09LX0NIQVRfSEFTX0FHRU5ULFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jZWxsQ2hhdH1gLCB0cnVlKSxcblx0XHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jZWxsR2VuZXJhdGV9YCwgdHJ1ZSlcblx0XHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpIHtcblx0XHRhd2FpdCBzdGFydENoYXQoYWNjZXNzb3IsIGNvbnRleHQsIDAsICcnLCBmYWxzZSk7XG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk5vdGVib29rVG9vbGJhciwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICdub3RlYm9vay5jZWxsLmNoYXQuc3RhcnQnLFxuXHRcdGljb246IENvZGljb24uc3BhcmtsZSxcblx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5tZW51Lmluc2VydENvZGUub250b29sYmFyJywgXCJHZW5lcmF0ZVwiKSxcblx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLm1lbnUuaW5zZXJ0Q29kZS50b29sdGlwJywgXCJTdGFydCBDaGF0IHRvIEdlbmVyYXRlIENvZGVcIilcblx0fSxcblx0b3JkZXI6IC0xMCxcblx0Z3JvdXA6ICduYXZpZ2F0aW9uL2FkZCcsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHROT1RFQk9PS19FRElUT1JfRURJVEFCTEUuaXNFcXVhbFRvKHRydWUpLFxuXHRcdENvbnRleHRLZXlFeHByLm5vdEVxdWFscygnY29uZmlnLm5vdGVib29rLmluc2VydFRvb2xiYXJMb2NhdGlvbicsICdiZXR3ZWVuQ2VsbHMnKSxcblx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5pbnNlcnRUb29sYmFyTG9jYXRpb24nLCAnaGlkZGVuJyksXG5cdFx0Q1RYX05PVEVCT09LX0NIQVRfSEFTX0FHRU5ULFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKGBjb25maWcuJHtOb3RlYm9va1NldHRpbmcuY2VsbENoYXR9YCwgdHJ1ZSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5jZWxsR2VuZXJhdGV9YCwgdHJ1ZSlcblx0XHQpXG5cdClcbn0pO1xuXG5leHBvcnQgY2xhc3MgQWNjZXB0Q2hhbmdlc0FuZFJ1biBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2suaW5saW5lQ2hhdC5hY2NlcHRDaGFuZ2VzQW5kUnVuJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rLmFwcGx5MScsIFwiQWNjZXB0IGFuZCBSdW5cIiksXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2suYXBwbHkyJywgJ0FjY2VwdCAmIFJ1bicpLFxuXHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ25vdGVib29rLmFwcGx5MycsICdBY2NlcHQgdGhlIGNoYW5nZXMgYW5kIHJ1biB0aGUgY2VsbCcpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdE5PVEVCT09LX0VESVRPUl9FRElUQUJMRS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdENUWF9JTkxJTkVfQ0hBVF9WSVNJQkxFLFxuXHRcdFx0KSxcblx0XHRcdGtleWJpbmRpbmc6IHVuZGVmaW5lZCxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEVkaXRvcklubGluZUV4ZWN1dGUsXG5cdFx0XHRcdGdyb3VwOiAnMF9tYWluJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRURJVEFCTEUuaXNFcXVhbFRvKHRydWUpLFxuXHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1RleHQudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0Q1RYX0lOTElORV9DSEFUX1JFUVVFU1RfSU5fUFJPR1JFU1MudG9OZWdhdGVkKClcblx0XHRcdFx0KVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvZGVFZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Q29udGV4dEZyb21BY3RpdmVFZGl0b3IoYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgY3RybCA9IElubGluZUNoYXRDb250cm9sbGVyLmdldChjb2RlRWRpdG9yKTtcblxuXHRcdGlmICghZWRpdG9yIHx8ICFjdHJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hlZENlbGwgPSBlZGl0b3Iubm90ZWJvb2tFZGl0b3IuY29kZUVkaXRvcnMuZmluZChlID0+IGVbMV0gPT09IGNvZGVFZGl0b3IpO1xuXHRcdGNvbnN0IGNlbGwgPSBtYXRjaGVkQ2VsbD8uWzBdO1xuXG5cdFx0aWYgKCFjZWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y3RybC5hY2NlcHRTZXNzaW9uKCk7XG5cdFx0cmV0dXJuIGVkaXRvci5ub3RlYm9va0VkaXRvci5leGVjdXRlTm90ZWJvb2tDZWxscyhJdGVyYWJsZS5zaW5nbGUoY2VsbCkpO1xuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoQWNjZXB0Q2hhbmdlc0FuZFJ1bik7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxVQUFVLFNBQVMsY0FBYztBQUMxQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsUUFBUSxjQUFjLHVCQUF1QjtBQUN0RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFDQUFxQywrQkFBK0I7QUFDN0UsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBaUMsZ0JBQWdCLDRCQUE0QixxQ0FBcUM7QUFDbEgsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxVQUFVLHVCQUF1QjtBQUMxQyxTQUFTLDBCQUEwQiwrQkFBK0I7QUFDbEUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFROUIsZUFBZSxVQUFVLFVBQTRCLFNBQWlDLE9BQWUsT0FBZ0IsVUFBb0IsUUFBaUI7QUFDekosUUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUMvRCxRQUFNLGlCQUFpQixTQUFTLElBQUksZUFBZTtBQUVuRCxNQUFJLHFCQUFxQixTQUFrQixnQkFBZ0IsWUFBWSxLQUFLLHFCQUFxQixTQUFrQixnQkFBZ0IsUUFBUSxHQUFHO0FBQzdJLFVBQU0sYUFBYSxRQUFRLGVBQWUsY0FBYztBQUN4RCxVQUFNLGFBQWEsWUFBWSxjQUFjLE1BQU0sS0FBSyxXQUFXLGtCQUFrQixhQUFjLE1BQU0sY0FBYyxVQUFVLFNBQVMs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
