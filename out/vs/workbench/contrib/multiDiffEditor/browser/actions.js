import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { localize2 } from "../../../../nls.js";
import { Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IListService } from "../../../../platform/list/browser/listService.js";
import { resolveCommandsContext } from "../../../browser/parts/editor/editorCommandsContext.js";
import { MultiDiffEditor } from "./multiDiffEditor.js";
import { MultiDiffEditorInput } from "./multiDiffEditorInput.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ActiveEditorContext, IsSessionsWindowContext } from "../../../common/contextkeys.js";
class GoToFileAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.goToFile",
      title: localize2("goToFile", "Open File"),
      icon: Codicon.goToFile,
      precondition: ActiveEditorContext.isEqualTo(MultiDiffEditor.ID),
      menu: {
        when: ActiveEditorContext.isEqualTo(MultiDiffEditor.ID),
        id: MenuId.MultiDiffEditorFileToolbar,
        order: 22,
        group: "navigation"
      }
    });
  }
  async run(accessor, ...args) {
    const uri = args[0];
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    let selections = void 0;
    if (!(activeEditorPane instanceof MultiDiffEditor)) {
      return;
    }
    const editor = activeEditorPane.tryGetCodeEditor(uri);
    if (editor) {
      selections = editor.editor.getSelections() ?? void 0;
    }
    let targetUri = uri;
    const item = activeEditorPane.findDocumentDiffItem(uri);
    if (item && item.goToFileUri) {
      targetUri = item.goToFileUri;
    }
    await editorService.openEditor({
      label: item?.goToFileEditorTitle,
      resource: targetUri,
      options: {
        selection: selections?.[0],
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
      }
    });
  }
}
class GoToNextChangeAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.goToNextChange",
      title: localize2("goToNextChange", "Go to Next Change"),
      icon: Codicon.arrowDown,
      precondition: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
      menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
        group: "navigation",
        order: 2
      })),
      keybinding: {
        primary: KeyMod.Alt | KeyCode.F5,
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID)
      },
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof MultiDiffEditor)) {
      return;
    }
    activeEditorPane.goToNextChange();
  }
}
class GoToPreviousChangeAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.goToPreviousChange",
      title: localize2("goToPreviousChange", "Go to Previous Change"),
      icon: Codicon.arrowUp,
      precondition: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
      menu: [MenuId.EditorTitle, MenuId.CompactWindowEditorTitle].map((id) => ({
        id,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID),
        group: "navigation",
        order: 1
      })),
      keybinding: {
        primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F5,
        weight: KeybindingWeight.EditorContrib,
        when: ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID)
      },
      f1: true
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof MultiDiffEditor)) {
      return;
    }
    activeEditorPane.goToPreviousChange();
  }
}
class CollapseAllAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.collapseAll",
      title: localize2("collapseAllDiffs", "Collapse All Diffs"),
      icon: Codicon.collapseAll,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed")),
      menu: [
        // In the agents window this action lives in the editor title overflow (...) menu instead of as a primary toolbar icon.
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed"), IsSessionsWindowContext.toNegated()),
          group: "navigation",
          order: 100
        },
        // The compact window editor title has no overflow menu, so keep the primary toolbar icon there.
        {
          id: MenuId.CompactWindowEditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed")),
          group: "navigation",
          order: 100
        },
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.not("multiDiffEditorAllCollapsed"), IsSessionsWindowContext),
          group: "4_collapse",
          order: 10
        }
      ],
      f1: true
    });
  }
  async run(accessor, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const groupContext = resolvedContext.groupedEditors[0];
    if (!groupContext) {
      return;
    }
    const editor = groupContext.editors[0];
    if (editor instanceof MultiDiffEditorInput) {
      const viewModel = await editor.getViewModel();
      viewModel.collapseAll();
    }
  }
}
class ExpandAllAction extends Action2 {
  constructor() {
    super({
      id: "multiDiffEditor.expandAll",
      title: localize2("ExpandAllDiffs", "Expand All Diffs"),
      icon: Codicon.expandAll,
      precondition: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed")),
      menu: [
        // In the agents window this action lives in the editor title overflow (...) menu instead of as a primary toolbar icon.
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed"), IsSessionsWindowContext.toNegated()),
          group: "navigation",
          order: 100
        },
        // The compact window editor title has no overflow menu, so keep the primary toolbar icon there.
        {
          id: MenuId.CompactWindowEditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed")),
          group: "navigation",
          order: 100
        },
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ContextKeyExpr.equals("activeEditor", MultiDiffEditor.ID), ContextKeyExpr.has("multiDiffEditorAllCollapsed"), IsSessionsWindowContext),
          group: "4_collapse",
          order: 10
        }
      ],
      f1: true
    });
  }
  async run(accessor, ...args) {
    const resolvedContext = resolveCommandsContext(args, accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IListService));
    const groupContext = resolvedContext.groupedEditors[0];
    if (!groupContext) {
      return;
    }
    const editor = groupContext.editors[0];
    if (editor instanceof MultiDiffEditorInput) {
      const viewModel = await editor.getViewModel();
      viewModel.expandAll();
    }
  }
}
export {
  CollapseAllAction,
  ExpandAllAction,
  GoToFileAction,
  GoToNextChangeAction,
  GoToPreviousChangeAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG11bHRpRGlmZkVkaXRvclxcYnJvd3NlclxcYWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JPcHRpb25zLCBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQ29tbWFuZHNDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHNDb250ZXh0LmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvciB9IGZyb20gJy4vbXVsdGlEaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IE11bHRpRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi9tdWx0aURpZmZFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBHb1RvRmlsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ211bHRpRGlmZkVkaXRvci5nb1RvRmlsZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdnb1RvRmlsZScsICdPcGVuIEZpbGUnKSxcblx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRwcmVjb25kaXRpb246IEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE11bHRpRGlmZkVkaXRvci5JRCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdHdoZW46IEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE11bHRpRGlmZkVkaXRvci5JRCksXG5cdFx0XHRcdGlkOiBNZW51SWQuTXVsdGlEaWZmRWRpdG9yRmlsZVRvb2xiYXIsXG5cdFx0XHRcdG9yZGVyOiAyMixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVyaSA9IGFyZ3NbMF0gYXMgVVJJO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0bGV0IHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICghKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gYWN0aXZlRWRpdG9yUGFuZS50cnlHZXRDb2RlRWRpdG9yKHVyaSk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0c2VsZWN0aW9ucyA9IGVkaXRvci5lZGl0b3IuZ2V0U2VsZWN0aW9ucygpID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgdGFyZ2V0VXJpID0gdXJpO1xuXHRcdGNvbnN0IGl0ZW0gPSBhY3RpdmVFZGl0b3JQYW5lLmZpbmREb2N1bWVudERpZmZJdGVtKHVyaSk7XG5cdFx0aWYgKGl0ZW0gJiYgaXRlbS5nb1RvRmlsZVVyaSkge1xuXHRcdFx0dGFyZ2V0VXJpID0gaXRlbS5nb1RvRmlsZVVyaTtcblx0XHR9XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0bGFiZWw6IGl0ZW0/LmdvVG9GaWxlRWRpdG9yVGl0bGUsXG5cdFx0XHRyZXNvdXJjZTogdGFyZ2V0VXJpLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRzZWxlY3Rpb246IHNlbGVjdGlvbnM/LlswXSxcblx0XHRcdFx0c2VsZWN0aW9uUmV2ZWFsVHlwZTogVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQsXG5cdFx0XHR9IHNhdGlzZmllcyBJVGV4dEVkaXRvck9wdGlvbnMsXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdvVG9OZXh0Q2hhbmdlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbXVsdGlEaWZmRWRpdG9yLmdvVG9OZXh0Q2hhbmdlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dvVG9OZXh0Q2hhbmdlJywgJ0dvIHRvIE5leHQgQ2hhbmdlJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93RG93bixcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0bWVudTogW01lbnVJZC5FZGl0b3JUaXRsZSwgTWVudUlkLkNvbXBhY3RXaW5kb3dFZGl0b3JUaXRsZV0ubWFwKGlkID0+ICh7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9KSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkY1LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblxuXHRcdGlmICghKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWN0aXZlRWRpdG9yUGFuZS5nb1RvTmV4dENoYW5nZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBHb1RvUHJldmlvdXNDaGFuZ2VBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdtdWx0aURpZmZFZGl0b3IuZ29Ub1ByZXZpb3VzQ2hhbmdlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dvVG9QcmV2aW91c0NoYW5nZScsICdHbyB0byBQcmV2aW91cyBDaGFuZ2UnKSxcblx0XHRcdGljb246IENvZGljb24uYXJyb3dVcCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0bWVudTogW01lbnVJZC5FZGl0b3JUaXRsZSwgTWVudUlkLkNvbXBhY3RXaW5kb3dFZGl0b3JUaXRsZV0ubWFwKGlkID0+ICh7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9KSksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkY1LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblxuXHRcdGlmICghKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBNdWx0aURpZmZFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YWN0aXZlRWRpdG9yUGFuZS5nb1RvUHJldmlvdXNDaGFuZ2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29sbGFwc2VBbGxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdtdWx0aURpZmZFZGl0b3IuY29sbGFwc2VBbGwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY29sbGFwc2VBbGxEaWZmcycsICdDb2xsYXBzZSBBbGwgRGlmZnMnKSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLm5vdCgnbXVsdGlEaWZmRWRpdG9yQWxsQ29sbGFwc2VkJykpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHQvLyBJbiB0aGUgYWdlbnRzIHdpbmRvdyB0aGlzIGFjdGlvbiBsaXZlcyBpbiB0aGUgZWRpdG9yIHRpdGxlIG92ZXJmbG93ICguLi4pIG1lbnUgaW5zdGVhZCBvZiBhcyBhIHByaW1hcnkgdG9vbGJhciBpY29uLlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5ub3QoJ211bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZCcpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMTAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFRoZSBjb21wYWN0IHdpbmRvdyBlZGl0b3IgdGl0bGUgaGFzIG5vIG92ZXJmbG93IG1lbnUsIHNvIGtlZXAgdGhlIHByaW1hcnkgdG9vbGJhciBpY29uIHRoZXJlLlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSwgQ29udGV4dEtleUV4cHIubm90KCdtdWx0aURpZmZFZGl0b3JBbGxDb2xsYXBzZWQnKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMTAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLm5vdCgnbXVsdGlEaWZmRWRpdG9yQWxsQ29sbGFwc2VkJyksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0KSxcblx0XHRcdFx0XHRncm91cDogJzRfY29sbGFwc2UnLFxuXHRcdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBDb250ZXh0ID0gcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdO1xuXHRcdGlmICghZ3JvdXBDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gZ3JvdXBDb250ZXh0LmVkaXRvcnNbMF07XG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBhd2FpdCBlZGl0b3IuZ2V0Vmlld01vZGVsKCk7XG5cdFx0XHR2aWV3TW9kZWwuY29sbGFwc2VBbGwoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4cGFuZEFsbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ211bHRpRGlmZkVkaXRvci5leHBhbmRBbGwnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignRXhwYW5kQWxsRGlmZnMnLCAnRXhwYW5kIEFsbCBEaWZmcycpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5leHBhbmRBbGwsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLmhhcygnbXVsdGlEaWZmRWRpdG9yQWxsQ29sbGFwc2VkJykpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHQvLyBJbiB0aGUgYWdlbnRzIHdpbmRvdyB0aGlzIGFjdGlvbiBsaXZlcyBpbiB0aGUgZWRpdG9yIHRpdGxlIG92ZXJmbG93ICguLi4pIG1lbnUgaW5zdGVhZCBvZiBhcyBhIHByaW1hcnkgdG9vbGJhciBpY29uLlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBNdWx0aURpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5oYXMoJ211bHRpRGlmZkVkaXRvckFsbENvbGxhcHNlZCcpLCBJc1Nlc3Npb25zV2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMTAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIFRoZSBjb21wYWN0IHdpbmRvdyBlZGl0b3IgdGl0bGUgaGFzIG5vIG92ZXJmbG93IG1lbnUsIHNvIGtlZXAgdGhlIHByaW1hcnkgdG9vbGJhciBpY29uIHRoZXJlLlxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Db21wYWN0V2luZG93RWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygnYWN0aXZlRWRpdG9yJywgTXVsdGlEaWZmRWRpdG9yLklEKSwgQ29udGV4dEtleUV4cHIuaGFzKCdtdWx0aURpZmZFZGl0b3JBbGxDb2xsYXBzZWQnKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMTAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2FjdGl2ZUVkaXRvcicsIE11bHRpRGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLmhhcygnbXVsdGlEaWZmRWRpdG9yQWxsQ29sbGFwc2VkJyksIElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0KSxcblx0XHRcdFx0XHRncm91cDogJzRfY29sbGFwc2UnLFxuXHRcdFx0XHRcdG9yZGVyOiAxMFxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkQ29udGV4dCA9IHJlc29sdmVDb21tYW5kc0NvbnRleHQoYXJncywgYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKSwgYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkpO1xuXG5cdFx0Y29uc3QgZ3JvdXBDb250ZXh0ID0gcmVzb2x2ZWRDb250ZXh0Lmdyb3VwZWRFZGl0b3JzWzBdO1xuXHRcdGlmICghZ3JvdXBDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gZ3JvdXBDb250ZXh0LmVkaXRvcnNbMF07XG5cdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIE11bHRpRGlmZkVkaXRvcklucHV0KSB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBhd2FpdCBlZGl0b3IuZ2V0Vmlld01vZGVsKCk7XG5cdFx0XHR2aWV3TW9kZWwuZXhwYW5kQWxsKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGNBQWM7QUFHaEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBNkIscUNBQXFDO0FBRWxFLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJB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
