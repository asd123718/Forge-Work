import * as nls from "../../../../../nls.js";
import { EmmetEditorAction } from "../emmetActions.js";
import { registerEditorAction } from "../../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
class ExpandAbbreviationAction extends EmmetEditorAction {
  constructor() {
    super({
      id: "editor.emmet.action.expandAbbreviation",
      label: nls.localize2("expandAbbreviationAction", "Emmet: Expand Abbreviation"),
      precondition: EditorContextKeys.writable,
      actionName: "expand_abbreviation",
      kbOpts: {
        primary: KeyCode.Tab,
        kbExpr: ContextKeyExpr.and(
          EditorContextKeys.editorTextFocus,
          EditorContextKeys.tabDoesNotMoveFocus,
          ContextKeyExpr.has("config.emmet.triggerExpansionOnTab")
        ),
        weight: KeybindingWeight.EditorContrib
      },
      menuOpts: {
        menuId: MenuId.MenubarEditMenu,
        group: "5_insert",
        title: nls.localize({ key: "miEmmetExpandAbbreviation", comment: ["&& denotes a mnemonic"] }, "Emmet: E&&xpand Abbreviation"),
        order: 3,
        when: IsSessionsWindowContext.negate()
      }
    });
  }
}
registerEditorAction(ExpandAbbreviationAction);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGVtbWV0XFxicm93c2VyXFxhY3Rpb25zXFxleHBhbmRBYmJyZXZpYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFbW1ldEVkaXRvckFjdGlvbiB9IGZyb20gJy4uL2VtbWV0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckVkaXRvckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5cbmNsYXNzIEV4cGFuZEFiYnJldmlhdGlvbkFjdGlvbiBleHRlbmRzIEVtbWV0RWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5lbW1ldC5hY3Rpb24uZXhwYW5kQWJicmV2aWF0aW9uJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdleHBhbmRBYmJyZXZpYXRpb25BY3Rpb24nLCBcIkVtbWV0OiBFeHBhbmQgQWJicmV2aWF0aW9uXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGFjdGlvbk5hbWU6ICdleHBhbmRfYWJicmV2aWF0aW9uJyxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlRhYixcblx0XHRcdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLnRhYkRvZXNOb3RNb3ZlRm9jdXMsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCdjb25maWcuZW1tZXQudHJpZ2dlckV4cGFuc2lvbk9uVGFiJylcblx0XHRcdFx0KSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZW51T3B0czoge1xuXHRcdFx0XHRtZW51SWQ6IE1lbnVJZC5NZW51YmFyRWRpdE1lbnUsXG5cdFx0XHRcdGdyb3VwOiAnNV9pbnNlcnQnLFxuXHRcdFx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlFbW1ldEV4cGFuZEFiYnJldmlhdGlvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJFbW1ldDogRSYmeHBhbmQgQWJicmV2aWF0aW9uXCIpLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0d2hlbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKClcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEV4cGFuZEFiYnJldmlhdGlvbkFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsY0FBYztBQUV2QixNQUFNLGlDQUFpQyxrQkFBa0I7QUFBQSxFQUV4RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsNEJBQTRCLDRCQUE0QjtBQUFBLE1BQzdFLGNBQWMsa0JBQWtCO0FBQUEsTUFDaEMsWUFBWTtBQUFBLE1BQ1osUUFBUTtBQUFBLFFBQ1AsU0FBUyxRQUFRO0FBQUEsUUFDakIsUUFBUSxlQUFlO0FBQUEsVUFDdEIsa0JBQWtCO0FBQUEsVUFDbEIsa0JBQWtCO0FBQUEsVUFDbEIsZUFBZSxJQUFJLG9DQUFvQztBQUFBLFFBQ3hEO0FBQUEsUUFDQSxRQUFRLGlCQUFpQjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDVCxRQUFRLE9BQU87QUFBQSxRQUNmLE9BQU87QUFBQSxRQUNQLE9BQU8sSUFBSSxTQUFTLEVBQUUsS0FBSyw2QkFBNkIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsOEJBQThCO0FBQUEsUUFDNUgsT0FBTztBQUFBLFFBQ1AsTUFBTSx3QkFBd0IsT0FBTztBQUFBLE1BQ3RDO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFFRjtBQUNEO0FBRUEscUJBQXFCLHdCQUF3QjsiLAogICJuYW1lcyI6IFtdCn0K
