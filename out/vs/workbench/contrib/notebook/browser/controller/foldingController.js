import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_IS_ACTIVE_EDITOR } from "../../common/notebookContextKeys.js";
import { getNotebookEditorFromEditorPane, CellFoldingState } from "../notebookBrowser.js";
import { FoldingModel } from "../viewModel/foldingModel.js";
import { CellKind } from "../../common/notebookCommon.js";
import { registerNotebookContribution } from "../notebookEditorExtensions.js";
import { registerAction2, Action2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContextKey } from "../../../../../platform/contextkey/common/contextkeys.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { NOTEBOOK_ACTIONS_CATEGORY } from "./coreActions.js";
import { localize, localize2 } from "../../../../../nls.js";
class FoldingController extends Disposable {
  constructor(_notebookEditor) {
    super();
    this._notebookEditor = _notebookEditor;
    this._foldingModel = null;
    this._localStore = this._register(new DisposableStore());
    this._register(this._notebookEditor.onMouseUp((e) => {
      this.onMouseUp(e);
    }));
    this._register(this._notebookEditor.onDidChangeModel(() => {
      this._localStore.clear();
      if (!this._notebookEditor.hasModel()) {
        return;
      }
      this._localStore.add(this._notebookEditor.onDidChangeCellState((e) => {
        if (e.source.editStateChanged && e.cell.cellKind === CellKind.Markup) {
          this._foldingModel?.recompute();
        }
      }));
      this._foldingModel = new FoldingModel();
      this._localStore.add(this._foldingModel);
      this._foldingModel.attachViewModel(this._notebookEditor.getViewModel());
      this._localStore.add(this._foldingModel.onDidFoldingRegionChanged(() => {
        this._updateEditorFoldingRanges();
      }));
    }));
  }
  saveViewState() {
    return this._foldingModel?.getMemento() || [];
  }
  restoreViewState(state) {
    this._foldingModel?.applyMemento(state || []);
    this._updateEditorFoldingRanges();
  }
  setFoldingStateDown(index, state, levels) {
    const doCollapse = state === CellFoldingState.Collapsed;
    const region = this._foldingModel.getRegionAtLine(index + 1);
    const regions = [];
    if (region) {
      if (region.isCollapsed !== doCollapse) {
        regions.push(region);
      }
      if (levels > 1) {
        const regionsInside = this._foldingModel.getRegionsInside(region, (r, level) => r.isCollapsed !== doCollapse && level < levels);
        regions.push(...regionsInside);
      }
    }
    regions.forEach((r) => this._foldingModel.setCollapsed(r.regionIndex, state === CellFoldingState.Collapsed));
    this._updateEditorFoldingRanges();
  }
  setFoldingStateUp(index, state, levels) {
    if (!this._foldingModel) {
      return;
    }
    const regions = this._foldingModel.getAllRegionsAtLine(index + 1, (region, level) => region.isCollapsed !== (state === CellFoldingState.Collapsed) && level <= levels);
    regions.forEach((r) => this._foldingModel.setCollapsed(r.regionIndex, state === CellFoldingState.Collapsed));
    this._updateEditorFoldingRanges();
  }
  _updateEditorFoldingRanges() {
    if (!this._foldingModel) {
      return;
    }
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const vm = this._notebookEditor.getViewModel();
    vm.updateFoldingRanges(this._foldingModel.regions);
    const hiddenRanges = vm.getHiddenRanges();
    this._notebookEditor.setHiddenAreas(hiddenRanges);
  }
  onMouseUp(e) {
    if (!e.event.target) {
      return;
    }
    if (!this._notebookEditor.hasModel()) {
      return;
    }
    const viewModel = this._notebookEditor.getViewModel();
    const target = e.event.target;
    if (target.classList.contains("codicon-notebook-collapsed") || target.classList.contains("codicon-notebook-expanded")) {
      const parent = target.parentElement;
      if (!parent.classList.contains("notebook-folding-indicator")) {
        return;
      }
      const cellViewModel = e.target;
      const modelIndex = viewModel.getCellIndex(cellViewModel);
      const state = viewModel.getFoldingState(modelIndex);
      if (state === CellFoldingState.None) {
        return;
      }
      this.setFoldingStateUp(modelIndex, state === CellFoldingState.Collapsed ? CellFoldingState.Expanded : CellFoldingState.Collapsed, 1);
      this._notebookEditor.focusElement(cellViewModel);
    }
    return;
  }
  recompute() {
    this._foldingModel?.recompute();
  }
}
FoldingController.id = "workbench.notebook.foldingController";
registerNotebookContribution(FoldingController.id, FoldingController);
const NOTEBOOK_FOLD_COMMAND_LABEL = localize("fold.cell", "Fold Cell");
const NOTEBOOK_UNFOLD_COMMAND_LABEL = localize2("unfold.cell", "Unfold Cell");
const FOLDING_COMMAND_ARGS = {
  args: [{
    isOptional: true,
    name: "index",
    description: "The cell index",
    schema: {
      "type": "object",
      "required": ["index", "direction"],
      "properties": {
        "index": {
          "type": "number"
        },
        "direction": {
          "type": "string",
          "enum": ["up", "down"],
          "default": "down"
        },
        "levels": {
          "type": "number",
          "default": 1
        }
      }
    }
  }]
};
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.fold",
      title: localize2("fold.cell", "Fold Cell"),
      category: NOTEBOOK_ACTIONS_CATEGORY,
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketLeft,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketLeft,
          secondary: [KeyCode.LeftArrow]
        },
        secondary: [KeyCode.LeftArrow],
        weight: KeybindingWeight.WorkbenchContrib
      },
      metadata: {
        description: NOTEBOOK_FOLD_COMMAND_LABEL,
        args: FOLDING_COMMAND_ARGS.args
      },
      precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
      f1: true
    });
  }
  async run(accessor, args) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    if (!editor.hasModel()) {
      return;
    }
    const levels = args && args.levels || 1;
    const direction = args && args.direction === "up" ? "up" : "down";
    let index = void 0;
    if (args) {
      index = args.index;
    } else {
      const activeCell = editor.getActiveCell();
      if (!activeCell) {
        return;
      }
      index = editor.getCellIndex(activeCell);
    }
    const controller = editor.getContribution(FoldingController.id);
    if (index !== void 0) {
      const targetCell = index < 0 || index >= editor.getLength() ? void 0 : editor.cellAt(index);
      if (targetCell?.cellKind === CellKind.Code && direction === "down") {
        return;
      }
      if (direction === "up") {
        controller.setFoldingStateUp(index, CellFoldingState.Collapsed, levels);
      } else {
        controller.setFoldingStateDown(index, CellFoldingState.Collapsed, levels);
      }
      const viewIndex = editor.getViewModel().getNearestVisibleCellIndexUpwards(index);
      editor.focusElement(editor.cellAt(viewIndex));
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.unfold",
      title: NOTEBOOK_UNFOLD_COMMAND_LABEL,
      category: NOTEBOOK_ACTIONS_CATEGORY,
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey)),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.BracketRight,
        mac: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.BracketRight,
          secondary: [KeyCode.RightArrow]
        },
        secondary: [KeyCode.RightArrow],
        weight: KeybindingWeight.WorkbenchContrib
      },
      metadata: {
        description: NOTEBOOK_UNFOLD_COMMAND_LABEL,
        args: FOLDING_COMMAND_ARGS.args
      },
      precondition: NOTEBOOK_IS_ACTIVE_EDITOR,
      f1: true
    });
  }
  async run(accessor, args) {
    const editorService = accessor.get(IEditorService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor) {
      return;
    }
    const levels = args && args.levels || 1;
    const direction = args && args.direction === "up" ? "up" : "down";
    let index = void 0;
    if (args) {
      index = args.index;
    } else {
      const activeCell = editor.getActiveCell();
      if (!activeCell) {
        return;
      }
      index = editor.getCellIndex(activeCell);
    }
    const controller = editor.getContribution(FoldingController.id);
    if (index !== void 0) {
      if (direction === "up") {
        controller.setFoldingStateUp(index, CellFoldingState.Expanded, levels);
      } else {
        controller.setFoldingStateDown(index, CellFoldingState.Expanded, levels);
      }
    }
  }
});
export {
  FoldingController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxmb2xkaW5nQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUiB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yTW91c2VFdmVudCwgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLCBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lLCBDZWxsRm9sZGluZ1N0YXRlIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IEZvbGRpbmdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC9mb2xkaW5nTW9kZWwuanMnOyBpbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ2VsbFJhbmdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rUmFuZ2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uL25vdGVib29rRWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJbnB1dEZvY3VzZWRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfQUNUSU9OU19DQVRFR09SWSB9IGZyb20gJy4vY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nUmVnaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9sZGluZy9icm93c2VyL2ZvbGRpbmdSYW5nZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC9ub3RlYm9va1ZpZXdNb2RlbEltcGwuanMnO1xuXG5leHBvcnQgY2xhc3MgRm9sZGluZ0NvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIGlkOiBzdHJpbmcgPSAnd29ya2JlbmNoLm5vdGVib29rLmZvbGRpbmdDb250cm9sbGVyJztcblxuXHRwcml2YXRlIF9mb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NhbFN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0VkaXRvcjogSU5vdGVib29rRWRpdG9yKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rRWRpdG9yLm9uTW91c2VVcChlID0+IHsgdGhpcy5vbk1vdXNlVXAoZSk7IH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25vdGVib29rRWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbG9jYWxTdG9yZS5jbGVhcigpO1xuXG5cdFx0XHRpZiAoIXRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2NhbFN0b3JlLmFkZCh0aGlzLl9ub3RlYm9va0VkaXRvci5vbkRpZENoYW5nZUNlbGxTdGF0ZShlID0+IHtcblx0XHRcdFx0aWYgKGUuc291cmNlLmVkaXRTdGF0ZUNoYW5nZWQgJiYgZS5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdFx0XHR0aGlzLl9mb2xkaW5nTW9kZWw/LnJlY29tcHV0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX2ZvbGRpbmdNb2RlbCA9IG5ldyBGb2xkaW5nTW9kZWwoKTtcblx0XHRcdHRoaXMuX2xvY2FsU3RvcmUuYWRkKHRoaXMuX2ZvbGRpbmdNb2RlbCk7XG5cdFx0XHR0aGlzLl9mb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHRoaXMuX25vdGVib29rRWRpdG9yLmdldFZpZXdNb2RlbCgpKTtcblxuXHRcdFx0dGhpcy5fbG9jYWxTdG9yZS5hZGQodGhpcy5fZm9sZGluZ01vZGVsLm9uRGlkRm9sZGluZ1JlZ2lvbkNoYW5nZWQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVFZGl0b3JGb2xkaW5nUmFuZ2VzKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2F2ZVZpZXdTdGF0ZSgpOiBJQ2VsbFJhbmdlW10ge1xuXHRcdHJldHVybiB0aGlzLl9mb2xkaW5nTW9kZWw/LmdldE1lbWVudG8oKSB8fCBbXTtcblx0fVxuXG5cdHJlc3RvcmVWaWV3U3RhdGUoc3RhdGU6IElDZWxsUmFuZ2VbXSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2ZvbGRpbmdNb2RlbD8uYXBwbHlNZW1lbnRvKHN0YXRlIHx8IFtdKTtcblx0XHR0aGlzLl91cGRhdGVFZGl0b3JGb2xkaW5nUmFuZ2VzKCk7XG5cdH1cblxuXHRzZXRGb2xkaW5nU3RhdGVEb3duKGluZGV4OiBudW1iZXIsIHN0YXRlOiBDZWxsRm9sZGluZ1N0YXRlLCBsZXZlbHM6IG51bWJlcikge1xuXHRcdGNvbnN0IGRvQ29sbGFwc2UgPSBzdGF0ZSA9PT0gQ2VsbEZvbGRpbmdTdGF0ZS5Db2xsYXBzZWQ7XG5cdFx0Y29uc3QgcmVnaW9uID0gdGhpcy5fZm9sZGluZ01vZGVsIS5nZXRSZWdpb25BdExpbmUoaW5kZXggKyAxKTtcblx0XHRjb25zdCByZWdpb25zOiBGb2xkaW5nUmVnaW9uW10gPSBbXTtcblx0XHRpZiAocmVnaW9uKSB7XG5cdFx0XHRpZiAocmVnaW9uLmlzQ29sbGFwc2VkICE9PSBkb0NvbGxhcHNlKSB7XG5cdFx0XHRcdHJlZ2lvbnMucHVzaChyZWdpb24pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxldmVscyA+IDEpIHtcblx0XHRcdFx0Y29uc3QgcmVnaW9uc0luc2lkZSA9IHRoaXMuX2ZvbGRpbmdNb2RlbCEuZ2V0UmVnaW9uc0luc2lkZShyZWdpb24sIChyLCBsZXZlbDogbnVtYmVyKSA9PiByLmlzQ29sbGFwc2VkICE9PSBkb0NvbGxhcHNlICYmIGxldmVsIDwgbGV2ZWxzKTtcblx0XHRcdFx0cmVnaW9ucy5wdXNoKC4uLnJlZ2lvbnNJbnNpZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJlZ2lvbnMuZm9yRWFjaChyID0+IHRoaXMuX2ZvbGRpbmdNb2RlbCEuc2V0Q29sbGFwc2VkKHIucmVnaW9uSW5kZXgsIHN0YXRlID09PSBDZWxsRm9sZGluZ1N0YXRlLkNvbGxhcHNlZCkpO1xuXHRcdHRoaXMuX3VwZGF0ZUVkaXRvckZvbGRpbmdSYW5nZXMoKTtcblx0fVxuXG5cdHNldEZvbGRpbmdTdGF0ZVVwKGluZGV4OiBudW1iZXIsIHN0YXRlOiBDZWxsRm9sZGluZ1N0YXRlLCBsZXZlbHM6IG51bWJlcikge1xuXHRcdGlmICghdGhpcy5fZm9sZGluZ01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVnaW9ucyA9IHRoaXMuX2ZvbGRpbmdNb2RlbC5nZXRBbGxSZWdpb25zQXRMaW5lKGluZGV4ICsgMSwgKHJlZ2lvbiwgbGV2ZWwpID0+IHJlZ2lvbi5pc0NvbGxhcHNlZCAhPT0gKHN0YXRlID09PSBDZWxsRm9sZGluZ1N0YXRlLkNvbGxhcHNlZCkgJiYgbGV2ZWwgPD0gbGV2ZWxzKTtcblx0XHRyZWdpb25zLmZvckVhY2gociA9PiB0aGlzLl9mb2xkaW5nTW9kZWwhLnNldENvbGxhcHNlZChyLnJlZ2lvbkluZGV4LCBzdGF0ZSA9PT0gQ2VsbEZvbGRpbmdTdGF0ZS5Db2xsYXBzZWQpKTtcblx0XHR0aGlzLl91cGRhdGVFZGl0b3JGb2xkaW5nUmFuZ2VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVFZGl0b3JGb2xkaW5nUmFuZ2VzKCkge1xuXHRcdGlmICghdGhpcy5fZm9sZGluZ01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdm0gPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKSBhcyBOb3RlYm9va1ZpZXdNb2RlbDtcblxuXHRcdHZtLnVwZGF0ZUZvbGRpbmdSYW5nZXModGhpcy5fZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdGNvbnN0IGhpZGRlblJhbmdlcyA9IHZtLmdldEhpZGRlblJhbmdlcygpO1xuXHRcdHRoaXMuX25vdGVib29rRWRpdG9yLnNldEhpZGRlbkFyZWFzKGhpZGRlblJhbmdlcyk7XG5cdH1cblxuXHRvbk1vdXNlVXAoZTogSU5vdGVib29rRWRpdG9yTW91c2VFdmVudCkge1xuXHRcdGlmICghZS5ldmVudC50YXJnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX25vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKSBhcyBOb3RlYm9va1ZpZXdNb2RlbDtcblx0XHRjb25zdCB0YXJnZXQgPSBlLmV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblxuXHRcdGlmICh0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2RpY29uLW5vdGVib29rLWNvbGxhcHNlZCcpIHx8IHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ2NvZGljb24tbm90ZWJvb2stZXhwYW5kZWQnKSkge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gdGFyZ2V0LnBhcmVudEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHRcdGlmICghcGFyZW50LmNsYXNzTGlzdC5jb250YWlucygnbm90ZWJvb2stZm9sZGluZy1pbmRpY2F0b3InKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZvbGRpbmcgaWNvblxuXG5cdFx0XHRjb25zdCBjZWxsVmlld01vZGVsID0gZS50YXJnZXQ7XG5cdFx0XHRjb25zdCBtb2RlbEluZGV4ID0gdmlld01vZGVsLmdldENlbGxJbmRleChjZWxsVmlld01vZGVsKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gdmlld01vZGVsLmdldEZvbGRpbmdTdGF0ZShtb2RlbEluZGV4KTtcblxuXHRcdFx0aWYgKHN0YXRlID09PSBDZWxsRm9sZGluZ1N0YXRlLk5vbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldEZvbGRpbmdTdGF0ZVVwKG1vZGVsSW5kZXgsIHN0YXRlID09PSBDZWxsRm9sZGluZ1N0YXRlLkNvbGxhcHNlZCA/IENlbGxGb2xkaW5nU3RhdGUuRXhwYW5kZWQgOiBDZWxsRm9sZGluZ1N0YXRlLkNvbGxhcHNlZCwgMSk7XG5cdFx0XHR0aGlzLl9ub3RlYm9va0VkaXRvci5mb2N1c0VsZW1lbnQoY2VsbFZpZXdNb2RlbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cmVjb21wdXRlKCkge1xuXHRcdHRoaXMuX2ZvbGRpbmdNb2RlbD8ucmVjb21wdXRlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJOb3RlYm9va0NvbnRyaWJ1dGlvbihGb2xkaW5nQ29udHJvbGxlci5pZCwgRm9sZGluZ0NvbnRyb2xsZXIpO1xuXG5cbmNvbnN0IE5PVEVCT09LX0ZPTERfQ09NTUFORF9MQUJFTCA9IGxvY2FsaXplKCdmb2xkLmNlbGwnLCBcIkZvbGQgQ2VsbFwiKTtcbmNvbnN0IE5PVEVCT09LX1VORk9MRF9DT01NQU5EX0xBQkVMID0gbG9jYWxpemUyKCd1bmZvbGQuY2VsbCcsIFwiVW5mb2xkIENlbGxcIik7XG5cbmNvbnN0IEZPTERJTkdfQ09NTUFORF9BUkdTOiBQaWNrPElDb21tYW5kTWV0YWRhdGEsICdhcmdzJz4gPSB7XG5cdGFyZ3M6IFt7XG5cdFx0aXNPcHRpb25hbDogdHJ1ZSxcblx0XHRuYW1lOiAnaW5kZXgnLFxuXHRcdGRlc2NyaXB0aW9uOiAnVGhlIGNlbGwgaW5kZXgnLFxuXHRcdHNjaGVtYToge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdyZXF1aXJlZCc6IFsnaW5kZXgnLCAnZGlyZWN0aW9uJ10sXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2luZGV4Jzoge1xuXHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0J2RpcmVjdGlvbic6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdlbnVtJzogWyd1cCcsICdkb3duJ10sXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnZG93bidcblx0XHRcdFx0fSxcblx0XHRcdFx0J2xldmVscyc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogMVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH1cblx0fV1cbn07XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmZvbGQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9sZC5jZWxsJywgXCJGb2xkIENlbGxcIiksXG5cdFx0XHRjYXRlZ29yeTogTk9URUJPT0tfQUNUSU9OU19DQVRFR09SWSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuQnJhY2tldExlZnQsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuQnJhY2tldExlZnQsXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5MZWZ0QXJyb3ddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlDb2RlLkxlZnRBcnJvd10sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IE5PVEVCT09LX0ZPTERfQ09NTUFORF9MQUJFTCxcblx0XHRcdFx0YXJnczogRk9MRElOR19DT01NQU5EX0FSR1MuYXJnc1xuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogTk9URUJPT0tfSVNfQUNUSVZFX0VESVRPUixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB7IGluZGV4OiBudW1iZXI7IGxldmVsczogbnVtYmVyOyBkaXJlY3Rpb246ICd1cCcgfCAnZG93bicgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxldmVscyA9IGFyZ3MgJiYgYXJncy5sZXZlbHMgfHwgMTtcblx0XHRjb25zdCBkaXJlY3Rpb24gPSBhcmdzICYmIGFyZ3MuZGlyZWN0aW9uID09PSAndXAnID8gJ3VwJyA6ICdkb3duJztcblx0XHRsZXQgaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChhcmdzKSB7XG5cdFx0XHRpbmRleCA9IGFyZ3MuaW5kZXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUNlbGwgPSBlZGl0b3IuZ2V0QWN0aXZlQ2VsbCgpO1xuXHRcdFx0aWYgKCFhY3RpdmVDZWxsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGluZGV4ID0gZWRpdG9yLmdldENlbGxJbmRleChhY3RpdmVDZWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxGb2xkaW5nQ29udHJvbGxlcj4oRm9sZGluZ0NvbnRyb2xsZXIuaWQpO1xuXHRcdGlmIChpbmRleCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCB0YXJnZXRDZWxsID0gKGluZGV4IDwgMCB8fCBpbmRleCA+PSBlZGl0b3IuZ2V0TGVuZ3RoKCkpID8gdW5kZWZpbmVkIDogZWRpdG9yLmNlbGxBdChpbmRleCk7XG5cdFx0XHRpZiAodGFyZ2V0Q2VsbD8uY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUgJiYgZGlyZWN0aW9uID09PSAnZG93bicpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGlyZWN0aW9uID09PSAndXAnKSB7XG5cdFx0XHRcdGNvbnRyb2xsZXIuc2V0Rm9sZGluZ1N0YXRlVXAoaW5kZXgsIENlbGxGb2xkaW5nU3RhdGUuQ29sbGFwc2VkLCBsZXZlbHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udHJvbGxlci5zZXRGb2xkaW5nU3RhdGVEb3duKGluZGV4LCBDZWxsRm9sZGluZ1N0YXRlLkNvbGxhcHNlZCwgbGV2ZWxzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgdmlld0luZGV4ID0gZWRpdG9yLmdldFZpZXdNb2RlbCgpLmdldE5lYXJlc3RWaXNpYmxlQ2VsbEluZGV4VXB3YXJkcyhpbmRleCk7XG5cdFx0XHRlZGl0b3IuZm9jdXNFbGVtZW50KGVkaXRvci5jZWxsQXQodmlld0luZGV4KSk7XG5cdFx0fVxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2sudW5mb2xkJyxcblx0XHRcdHRpdGxlOiBOT1RFQk9PS19VTkZPTERfQ09NTUFORF9MQUJFTCxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIENvbnRleHRLZXlFeHByLm5vdChJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CcmFja2V0UmlnaHQsXG5cdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuQnJhY2tldFJpZ2h0LFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleUNvZGUuUmlnaHRBcnJvd10sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleUNvZGUuUmlnaHRBcnJvd10sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IE5PVEVCT09LX1VORk9MRF9DT01NQU5EX0xBQkVMLFxuXHRcdFx0XHRhcmdzOiBGT0xESU5HX0NPTU1BTkRfQVJHUy5hcmdzXG5cdFx0XHR9LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJncz86IHsgaW5kZXg6IG51bWJlcjsgbGV2ZWxzOiBudW1iZXI7IGRpcmVjdGlvbjogJ3VwJyB8ICdkb3duJyB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsZXZlbHMgPSBhcmdzICYmIGFyZ3MubGV2ZWxzIHx8IDE7XG5cdFx0Y29uc3QgZGlyZWN0aW9uID0gYXJncyAmJiBhcmdzLmRpcmVjdGlvbiA9PT0gJ3VwJyA/ICd1cCcgOiAnZG93bic7XG5cdFx0bGV0IGluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoYXJncykge1xuXHRcdFx0aW5kZXggPSBhcmdzLmluZGV4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhY3RpdmVDZWxsID0gZWRpdG9yLmdldEFjdGl2ZUNlbGwoKTtcblx0XHRcdGlmICghYWN0aXZlQ2VsbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpbmRleCA9IGVkaXRvci5nZXRDZWxsSW5kZXgoYWN0aXZlQ2VsbCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGVkaXRvci5nZXRDb250cmlidXRpb248Rm9sZGluZ0NvbnRyb2xsZXI+KEZvbGRpbmdDb250cm9sbGVyLmlkKTtcblx0XHRpZiAoaW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ3VwJykge1xuXHRcdFx0XHRjb250cm9sbGVyLnNldEZvbGRpbmdTdGF0ZVVwKGluZGV4LCBDZWxsRm9sZGluZ1N0YXRlLkV4cGFuZGVkLCBsZXZlbHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udHJvbGxlci5zZXRGb2xkaW5nU3RhdGVEb3duKGluZGV4LCBDZWxsRm9sZGluZ1N0YXRlLkV4cGFuZGVkLCBsZXZlbHMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMseUJBQXlCLGlDQUFpQztBQUNuRSxTQUFrRixpQ0FBaUMsd0JBQXdCO0FBQzNJLFNBQVMsb0JBQW9CO0FBQWdDLFNBQVMsZ0JBQWdCO0FBRXRGLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsaUJBQWlCLGVBQWU7QUFDekMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxVQUFVLGlCQUFpQjtBQUs3QixNQUFNLDBCQUEwQixXQUFrRDtBQUFBLEVBTXhGLFlBQTZCLGlCQUFrQztBQUM5RCxVQUFNO0FBRHNCO0FBSDdCLFNBQVEsZ0JBQXFDO0FBQzdDLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFLbEUsU0FBSyxVQUFVLEtBQUssZ0JBQWdCLFVBQVUsT0FBSztBQUFFLFdBQUssVUFBVSxDQUFDO0FBQUEsSUFBRyxDQUFDLENBQUM7QUFFMUUsU0FBSyxVQUFVLEtBQUssZ0JBQWdCLGlCQUFpQixNQUFNO0FBQzFELFdBQUssWUFBWSxNQUFNO0FBRXZCLFVBQUksQ0FBQyxLQUFLLGdCQUFnQixTQUFTLEdBQUc7QUFDckM7QUFBQSxNQUNEO0FBRUEsV0FBSyxZQUFZLElBQUksS0FBSyxnQkFBZ0IscUJBQXFCLE9BQUs7QUFDbkUsWUFBSSxFQUFFLE9BQU8sb0JBQW9CLEVBQUUsS0FBSyxhQUFhLFNBQVMsUUFBUTtBQUNyRSxlQUFLLGVBQWUsVUFBVTtBQUFBLFFBQy9CO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixXQUFLLGdCQUFnQixJQUFJLGFBQWE7QUFDdEMsV0FBSyxZQUFZLElBQUksS0FBSyxhQUFhO0FBQ3ZDLFdBQUssY0FBYyxnQkFBZ0IsS0FBSyxnQkFBZ0IsYUFBYSxDQUFDO0FBRXRFLFdBQUssWUFBWSxJQUFJLEtBQUssY0FBYywwQkFBMEIsTUFBTTtBQUN2RSxhQUFLLDJCQUEyQjtBQUFBLE1BQ2pDLENBQUMsQ0FBQztBQUFBLElBQ0gsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsZ0JBQThCO0FBQzdCLFdBQU8sS0FBSyxlQUFlLFdBQVcsS0FBSyxDQUFDO0FBQUEsRUFDN0M7QUFBQSxFQUVBLGlCQUFpQixPQUFpQztBQUNqRCxTQUFLLGVBQWUsYUFBYSxTQUFTLENBQUMsQ0FBQztBQUM1QyxTQUFLLDJCQUEyQjtBQUFBLEVBQ2pDO0FBQUEsRUFFQSxvQkFBb0IsT0FBZSxPQUF5QixRQUFnQjtBQUMzRSxVQUFNLGFBQWEsVUFBVSxpQkFBaUI7QUFDOUMsVUFBTSxTQUFTLEtBQUssY0FBZSxnQkFBZ0IsUUFBUSxDQUFDO0FBQzVELFVBQU0sVUFBMkIsQ0FBQztBQUNsQyxRQUFJLFFBQVE7QUFDWCxVQUFJLE9BQU8sZ0JBQWdCLFlBQVk7QUFDdEMsZ0JBQVEsS0FBSyxNQUFNO0FBQUEsTUFDcEI7QUFDQSxVQUFJLFNBQVMsR0FBRztBQUNmLGNBQU0sZ0JBQWdCLEtBQUssY0FBZSxpQkFBaUIsUUFBUSxDQUFDLEdBQUcsVUFBa0IsRUFBRSxnQkFBZ0IsY0FBYyxRQUFRLE1BQU07QUFDdkksZ0JBQVEsS0FBSyxHQUFHLGFBQWE7QUFBQSxNQUM5QjtBQUFBLElBQ0Q7QUFFQSxZQUFRLFFBQVEsT0FBSyxLQUFLLGNBQWUsYUFBYSxFQUFFLGFBQWEsVUFBVSxpQkFBaUIsU0FBUyxDQUFDO0FBQzFHLFNBQUssMkJBQTJCO0FBQUEsRUFDakM7QUFBQSxFQUVBLGtCQUFrQixPQUFlLE9BQXlCLFFBQWdCO0FBQ3pFLFFBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLEtBQUssY0FBYyxvQkFBb0IsUUFBUSxHQUFHLENBQUMsUUFBUSxVQUFVLE9BQU8saUJBQWlCLFVBQVUsaUJBQWlCLGNBQWMsU0FBUyxNQUFNO0FBQ3JLLFlBQVEsUUFBUSxPQUFLLEtBQUssY0FBZSxhQUFhLEVBQUUsYUFBYSxVQUFVLGlCQUFpQixTQUFTLENBQUM7QUFDMUcsU0FBSywyQkFBMkI7QUFBQSxFQUNqQztBQUFBLEVBRVEsNkJBQTZCO0FBQ3BDLFFBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEI7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssZ0JBQWdCLFNBQVMsR0FBRztBQUNyQztBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssS0FBSyxnQkFBZ0IsYUFBYTtBQUU3QyxPQUFHLG9CQUFvQixLQUFLLGNBQWMsT0FBTztBQUNqRCxVQUFNLGVBQWUsR0FBRyxnQkFBZ0I7QUFDeEMsU0FBSyxnQkFBZ0IsZUFBZSxZQUFZO0FBQUEsRUFDakQ7QUFBQSxFQUVBLFVBQVUsR0FBOEI7QUFDdkMsUUFBSSxDQUFDLEVBQUUsTUFBTSxRQUFRO0FBQ3BCO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLGdCQUFnQixTQUFTLEdBQUc7QUFDckM7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLEtBQUssZ0JBQWdCLGFBQWE7QUFDcEQsVUFBTSxTQUFTLEVBQUUsTUFBTTtBQUV2QixRQUFJLE9BQU8sVUFBVSxTQUFTLDRCQUE0QixLQUFLLE9BQU8sVUFBVSxTQUFTLDJCQUEyQixHQUFHO0FBQ3RILFlBQU0sU0FBUyxPQUFPO0FBRXRCLFVBQUksQ0FBQyxPQUFPLFVBQVUsU0FBUyw0QkFBNEIsR0FBRztBQUM3RDtBQUFBLE1BQ0Q7QUFJQSxZQUFNLGdCQUFnQixFQUFFO0FBQ3hCLFlBQU0sYUFBYSxVQUFVLGFBQWEsYUFBYTtBQUN2RCxZQUFNLFFBQVEsVUFBVSxnQkFBZ0IsVUFBVTtBQUVsRCxVQUFJLFVBQVUsaUJBQWlCLE1BQU07QUFDcEM7QUFBQSxNQUNEO0FBRUEsV0FBSyxrQkFBa0IsWUFBWSxVQUFVLGlCQUFpQixZQUFZLGlCQUFpQixXQUFXLGlCQUFpQixXQUFXLENBQUM7QUFDbkksV0FBSyxnQkFBZ0IsYUFBYSxhQUFhO0FBQUEsSUFDaEQ7QUFFQTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFlBQVk7QUFDWCxTQUFLLGVBQWUsVUFBVTtBQUFBLEVBQy9CO0FBQ0Q7QUE5SGEsa0JBQ0wsS0FBYTtBQStIckIsNkJBQTZCLGtCQUFrQixJQUFJLGlCQUFpQjtBQUdwRSxNQUFNLDhCQUE4QixTQUFTLGFBQWEsV0FBVztBQUNyRSxNQUFNLGdDQUFnQyxVQUFVLGVBQWUsYUFBYTtBQUU1RSxNQUFNLHVCQUF1RDtBQUFBLEVBQzVELE1BQU0sQ0FBQztBQUFBLElBQ04sWUFBWTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sYUFBYTtBQUFBLElBQ2IsUUFBUTtBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsWUFBWSxDQUFDLFNBQVMsV0FBVztBQUFBLE1BQ2pDLGNBQWM7QUFBQSxRQUNiLFNBQVM7QUFBQSxVQUNSLFFBQVE7QUFBQSxRQUNUO0FBQUEsUUFDQSxhQUFhO0FBQUEsVUFDWixRQUFRO0FBQUEsVUFDUixRQUFRLENBQUMsTUFBTSxNQUFNO0FBQUEsVUFDckIsV0FBVztBQUFBLFFBQ1o7QUFBQSxRQUNBLFVBQVU7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLFdBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFDRjtBQUVBLGdCQUFnQixjQUFjLFFBQVE7QUFBQSxFQUNyQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLGFBQWEsV0FBVztBQUFBLE1BQ3pDLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxRQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5QixlQUFlLElBQUksc0JBQXNCLENBQUM7QUFBQSxRQUM1RixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2pELEtBQUs7QUFBQSxVQUNKLFNBQVMsT0FBTyxVQUFVLE9BQU8sTUFBTSxRQUFRO0FBQUEsVUFDL0MsV0FBVyxDQUFDLFFBQVEsU0FBUztBQUFBLFFBQzlCO0FBQUEsUUFDQSxXQUFXLENBQUMsUUFBUSxTQUFTO0FBQUEsUUFDN0IsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2IsTUFBTSxxQkFBcUI7QUFBQSxNQUM1QjtBQUFBLE1BQ0EsY0FBYztBQUFBLE1BQ2QsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixNQUFtRjtBQUN4SCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUVqRCxVQUFNLFNBQVMsZ0NBQWdDLGNBQWMsZ0JBQWdCO0FBQzdFLFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sU0FBUyxRQUFRLEtBQUssVUFBVTtBQUN0QyxVQUFNLFlBQVksUUFBUSxLQUFLLGNBQWMsT0FBTyxPQUFPO0FBQzNELFFBQUksUUFBNEI7QUFFaEMsUUFBSSxNQUFNO0FBQ1QsY0FBUSxLQUFLO0FBQUEsSUFDZCxPQUFPO0FBQ04sWUFBTSxhQUFhLE9BQU8sY0FBYztBQUN4QyxVQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLE1BQ0Q7QUFDQSxjQUFRLE9BQU8sYUFBYSxVQUFVO0FBQUEsSUFDdkM7QUFFQSxVQUFNLGFBQWEsT0FBTyxnQkFBbUMsa0JBQWtCLEVBQUU7QUFDakYsUUFBSSxVQUFVLFFBQVc7QUFDeEIsWUFBTSxhQUFjLFFBQVEsS0FBSyxTQUFTLE9BQU8sVUFBVSxJQUFLLFNBQVksT0FBTyxPQUFPLEtBQUs7QUFDL0YsVUFBSSxZQUFZLGFBQWEsU0FBUyxRQUFRLGNBQWMsUUFBUTtBQUNuRTtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGNBQWMsTUFBTTtBQUN2QixtQkFBVyxrQkFBa0IsT0FBTyxpQkFBaUIsV0FBVyxNQUFNO0FBQUEsTUFDdkUsT0FBTztBQUNOLG1CQUFXLG9CQUFvQixPQUFPLGlCQUFpQixXQUFXLE1BQU07QUFBQSxNQUN6RTtBQUVBLFlBQU0sWUFBWSxPQUFPLGFBQWEsRUFBRSxrQ0FBa0MsS0FBSztBQUMvRSxhQUFPLGFBQWEsT0FBTyxPQUFPLFNBQVMsQ0FBQztBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU87QUFBQSxNQUNQLFVBQVU7QUFBQSxNQUNWLFlBQVk7QUFBQSxRQUNYLE1BQU0sZUFBZSxJQUFJLHlCQUF5QixlQUFlLElBQUksc0JBQXNCLENBQUM7QUFBQSxRQUM1RixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2pELEtBQUs7QUFBQSxVQUNKLFNBQVMsT0FBTyxVQUFVLE9BQU8sTUFBTSxRQUFRO0FBQUEsVUFDL0MsV0FBVyxDQUFDLFFBQVEsVUFBVTtBQUFBLFFBQy9CO0FBQUEsUUFDQSxXQUFXLENBQUMsUUFBUSxVQUFVO0FBQUEsUUFDOUIsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsVUFBVTtBQUFBLFFBQ1QsYUFBYTtBQUFBLFFBQ2IsTUFBTSxxQkFBcUI7QUFBQSxNQUM1QjtBQUFBLE1BQ0EsY0FBYztBQUFBLE1BQ2QsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQU0sSUFBSSxVQUE0QixNQUFtRjtBQUN4SCxVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUVqRCxVQUFNLFNBQVMsZ0NBQWdDLGNBQWMsZ0JBQWdCO0FBQzdFLFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFTLFFBQVEsS0FBSyxVQUFVO0FBQ3RDLFVBQU0sWUFBWSxRQUFRLEtBQUssY0FBYyxPQUFPLE9BQU87QUFDM0QsUUFBSSxRQUE0QjtBQUVoQyxRQUFJLE1BQU07QUFDVCxjQUFRLEtBQUs7QUFBQSxJQUNkLE9BQU87QUFDTixZQUFNLGFBQWEsT0FBTyxjQUFjO0FBQ3hDLFVBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsTUFDRDtBQUNBLGNBQVEsT0FBTyxhQUFhLFVBQVU7QUFBQSxJQUN2QztBQUVBLFVBQU0sYUFBYSxPQUFPLGdCQUFtQyxrQkFBa0IsRUFBRTtBQUNqRixRQUFJLFVBQVUsUUFBVztBQUN4QixVQUFJLGNBQWMsTUFBTTtBQUN2QixtQkFBVyxrQkFBa0IsT0FBTyxpQkFBaUIsVUFBVSxNQUFNO0FBQUEsTUFDdEUsT0FBTztBQUNOLG1CQUFXLG9CQUFvQixPQUFPLGlCQUFpQixVQUFVLE1BQU07QUFBQSxNQUN4RTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
