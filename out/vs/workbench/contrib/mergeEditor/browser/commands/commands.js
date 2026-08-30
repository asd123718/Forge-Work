import { Codicon } from "../../../../../base/common/codicons.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { MergeEditorInputData } from "../mergeEditorInput.js";
import { MergeEditor } from "../view/mergeEditor.js";
import { ctxIsMergeEditor, ctxMergeEditorLayout, ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop, ctxMergeEditorShowNonConflictingChanges, StorageCloseWithConflicts } from "../../common/mergeEditor.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { transaction } from "../../../../../base/common/observable.js";
import { ModifiedBaseRangeStateKind } from "../model/modifiedBaseRange.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
class MergeEditorAction extends Action2 {
  constructor(desc) {
    super(desc);
  }
  run(accessor) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      const vm = activeEditorPane.viewModel.get();
      if (!vm) {
        return;
      }
      this.runWithViewModel(vm, accessor);
    }
  }
}
class MergeEditorAction2 extends Action2 {
  constructor(desc) {
    super(desc);
  }
  run(accessor, ...args) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      const vm = activeEditorPane.viewModel.get();
      if (!vm) {
        return;
      }
      return this.runWithMergeEditor({
        viewModel: vm,
        inputModel: activeEditorPane.inputModel.get(),
        input: activeEditorPane.input,
        editorIdentifier: {
          editor: activeEditorPane.input,
          groupId: activeEditorPane.group.id
        }
      }, accessor, ...args);
    }
  }
}
class OpenMergeEditor extends Action2 {
  constructor() {
    super({
      id: "_open.mergeEditor",
      title: localize2("title", "Open Merge Editor")
    });
  }
  run(accessor, ...args) {
    const validatedArgs = IRelaxedOpenArgs.validate(args[0]);
    const input = {
      base: { resource: validatedArgs.base },
      input1: { resource: validatedArgs.input1.uri, label: validatedArgs.input1.title, description: validatedArgs.input1.description, detail: validatedArgs.input1.detail },
      input2: { resource: validatedArgs.input2.uri, label: validatedArgs.input2.title, description: validatedArgs.input2.description, detail: validatedArgs.input2.detail },
      result: { resource: validatedArgs.output },
      options: { preserveFocus: true }
    };
    accessor.get(IEditorService).openEditor(input);
  }
}
var IRelaxedOpenArgs;
((IRelaxedOpenArgs2) => {
  function validate(obj) {
    if (!obj || typeof obj !== "object") {
      throw new TypeError("invalid argument");
    }
    const o = obj;
    const base = toUri(o.base);
    const output = toUri(o.output);
    const input1 = toInputData(o.input1);
    const input2 = toInputData(o.input2);
    return { base, input1, input2, output };
  }
  IRelaxedOpenArgs2.validate = validate;
  function toInputData(obj) {
    if (typeof obj === "string") {
      return new MergeEditorInputData(URI.parse(obj, true), void 0, void 0, void 0);
    }
    if (!obj || typeof obj !== "object") {
      throw new TypeError("invalid argument");
    }
    if (isUriComponents(obj)) {
      return new MergeEditorInputData(URI.revive(obj), void 0, void 0, void 0);
    }
    const o = obj;
    const title = o.title;
    const uri = toUri(o.uri);
    const detail = o.detail;
    const description = o.description;
    return new MergeEditorInputData(uri, title, detail, description);
  }
  function toUri(obj) {
    if (typeof obj === "string") {
      return URI.parse(obj, true);
    } else if (obj && typeof obj === "object") {
      return URI.revive(obj);
    }
    throw new TypeError("invalid argument");
  }
  function isUriComponents(obj) {
    if (!obj || typeof obj !== "object") {
      return false;
    }
    const o = obj;
    return typeof o.scheme === "string" && typeof o.authority === "string" && typeof o.path === "string" && typeof o.query === "string" && typeof o.fragment === "string";
  }
})(IRelaxedOpenArgs || (IRelaxedOpenArgs = {}));
class SetMixedLayout extends Action2 {
  constructor() {
    super({
      id: "merge.mixedLayout",
      title: localize2("layout.mixed", "Mixed Layout"),
      toggled: ctxMergeEditorLayout.isEqualTo("mixed"),
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ctxIsMergeEditor,
          group: "1_merge",
          order: 9
        }
      ],
      precondition: ctxIsMergeEditor
    });
  }
  run(accessor) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      activeEditorPane.setLayoutKind("mixed");
    }
  }
}
class SetColumnLayout extends Action2 {
  constructor() {
    super({
      id: "merge.columnLayout",
      title: localize2("layout.column", "Column Layout"),
      toggled: ctxMergeEditorLayout.isEqualTo("columns"),
      menu: [{
        id: MenuId.EditorTitle,
        when: ctxIsMergeEditor,
        group: "1_merge",
        order: 10
      }],
      precondition: ctxIsMergeEditor
    });
  }
  run(accessor) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      activeEditorPane.setLayoutKind("columns");
    }
  }
}
class ShowNonConflictingChanges extends Action2 {
  constructor() {
    super({
      id: "merge.showNonConflictingChanges",
      title: localize2("showNonConflictingChanges", "Show Non-Conflicting Changes"),
      toggled: ctxMergeEditorShowNonConflictingChanges.isEqualTo(true),
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ctxIsMergeEditor,
          group: "3_merge",
          order: 9
        }
      ],
      precondition: ctxIsMergeEditor
    });
  }
  run(accessor) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      activeEditorPane.toggleShowNonConflictingChanges();
    }
  }
}
class ShowHideBase extends Action2 {
  constructor() {
    super({
      id: "merge.showBase",
      title: localize2("layout.showBase", "Show Base"),
      toggled: ctxMergeEditorShowBase.isEqualTo(true),
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ctxIsMergeEditor, ctxMergeEditorLayout.isEqualTo("columns")),
          group: "2_merge",
          order: 9
        }
      ]
    });
  }
  run(accessor) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      activeEditorPane.toggleBase();
    }
  }
}
class ShowHideTopBase extends Action2 {
  constructor() {
    super({
      id: "merge.showBaseTop",
      title: localize2("layout.showBaseTop", "Show Base Top"),
      toggled: ContextKeyExpr.and(ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop),
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ctxIsMergeEditor, ctxMergeEditorLayout.isEqualTo("mixed")),
          group: "2_merge",
          order: 10
        }
      ]
    });
  }
  run(accessor) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      activeEditorPane.toggleShowBaseTop();
    }
  }
}
class ShowHideCenterBase extends Action2 {
  constructor() {
    super({
      id: "merge.showBaseCenter",
      title: localize2("layout.showBaseCenter", "Show Base Center"),
      toggled: ContextKeyExpr.and(ctxMergeEditorShowBase, ctxMergeEditorShowBaseAtTop.negate()),
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(ctxIsMergeEditor, ctxMergeEditorLayout.isEqualTo("mixed")),
          group: "2_merge",
          order: 11
        }
      ]
    });
  }
  run(accessor) {
    const { activeEditorPane } = accessor.get(IEditorService);
    if (activeEditorPane instanceof MergeEditor) {
      activeEditorPane.toggleShowBaseCenter();
    }
  }
}
const mergeEditorCategory = localize2("mergeEditor", "Merge Editor");
class OpenResultResource extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.openResult",
      icon: Codicon.goToFile,
      title: localize2("openfile", "Open File"),
      category: mergeEditorCategory,
      menu: [{
        id: MenuId.EditorTitle,
        when: ctxIsMergeEditor,
        group: "navigation",
        order: 1
      }],
      precondition: ctxIsMergeEditor
    });
  }
  runWithViewModel(viewModel, accessor) {
    const editorService = accessor.get(IEditorService);
    editorService.openEditor({ resource: viewModel.model.resultTextModel.uri });
  }
}
class GoToNextUnhandledConflict extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.goToNextUnhandledConflict",
      category: mergeEditorCategory,
      title: localize2("merge.goToNextUnhandledConflict", "Go to Next Unhandled Conflict"),
      icon: Codicon.arrowDown,
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ctxIsMergeEditor,
          group: "navigation",
          order: 3
        }
      ],
      f1: true,
      precondition: ctxIsMergeEditor
    });
  }
  runWithViewModel(viewModel) {
    viewModel.model.telemetry.reportNavigationToNextConflict();
    viewModel.goToNextModifiedBaseRange((r) => !viewModel.model.isHandled(r).get());
  }
}
class GoToPreviousUnhandledConflict extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.goToPreviousUnhandledConflict",
      category: mergeEditorCategory,
      title: localize2("merge.goToPreviousUnhandledConflict", "Go to Previous Unhandled Conflict"),
      icon: Codicon.arrowUp,
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ctxIsMergeEditor,
          group: "navigation",
          order: 2
        }
      ],
      f1: true,
      precondition: ctxIsMergeEditor
    });
  }
  runWithViewModel(viewModel) {
    viewModel.model.telemetry.reportNavigationToPreviousConflict();
    viewModel.goToPreviousModifiedBaseRange((r) => !viewModel.model.isHandled(r).get());
  }
}
class ToggleActiveConflictInput1 extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.toggleActiveConflictInput1",
      category: mergeEditorCategory,
      title: localize2("merge.toggleCurrentConflictFromLeft", "Toggle Current Conflict from Left"),
      f1: true,
      precondition: ctxIsMergeEditor
    });
  }
  runWithViewModel(viewModel) {
    viewModel.toggleActiveConflict(1);
  }
}
class ToggleActiveConflictInput2 extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.toggleActiveConflictInput2",
      category: mergeEditorCategory,
      title: localize2("merge.toggleCurrentConflictFromRight", "Toggle Current Conflict from Right"),
      f1: true,
      precondition: ctxIsMergeEditor
    });
  }
  runWithViewModel(viewModel) {
    viewModel.toggleActiveConflict(2);
  }
}
class CompareInput1WithBaseCommand extends MergeEditorAction {
  constructor() {
    super({
      id: "mergeEditor.compareInput1WithBase",
      category: mergeEditorCategory,
      title: localize2("mergeEditor.compareInput1WithBase", "Compare Input 1 With Base"),
      shortTitle: localize("mergeEditor.compareWithBase", "Compare With Base"),
      f1: true,
      precondition: ctxIsMergeEditor,
      menu: { id: MenuId.MergeInput1Toolbar, group: "primary" },
      icon: Codicon.compareChanges
    });
  }
  runWithViewModel(viewModel, accessor) {
    const editorService = accessor.get(IEditorService);
    mergeEditorCompare(viewModel, editorService, 1);
  }
}
class CompareInput2WithBaseCommand extends MergeEditorAction {
  constructor() {
    super({
      id: "mergeEditor.compareInput2WithBase",
      category: mergeEditorCategory,
      title: localize2("mergeEditor.compareInput2WithBase", "Compare Input 2 With Base"),
      shortTitle: localize("mergeEditor.compareWithBase", "Compare With Base"),
      f1: true,
      precondition: ctxIsMergeEditor,
      menu: { id: MenuId.MergeInput2Toolbar, group: "primary" },
      icon: Codicon.compareChanges
    });
  }
  runWithViewModel(viewModel, accessor) {
    const editorService = accessor.get(IEditorService);
    mergeEditorCompare(viewModel, editorService, 2);
  }
}
async function mergeEditorCompare(viewModel, editorService, inputNumber) {
  editorService.openEditor(editorService.activeEditor, { pinned: true });
  const model = viewModel.model;
  const base = model.base;
  const input = inputNumber === 1 ? viewModel.inputCodeEditorView1.editor : viewModel.inputCodeEditorView2.editor;
  const lineNumber = input.getPosition().lineNumber;
  await editorService.openEditor({
    original: { resource: base.uri },
    modified: { resource: input.getModel().uri },
    options: {
      selection: {
        startLineNumber: lineNumber,
        startColumn: 1
      },
      revealIfOpened: true,
      revealIfVisible: true
    }
  });
}
class OpenBaseFile extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.openBaseEditor",
      category: mergeEditorCategory,
      title: localize2("merge.openBaseEditor", "Open Base File"),
      f1: true,
      precondition: ctxIsMergeEditor
    });
  }
  runWithViewModel(viewModel, accessor) {
    const openerService = accessor.get(IOpenerService);
    openerService.open(viewModel.model.base.uri);
  }
}
class AcceptAllInput1 extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.acceptAllInput1",
      category: mergeEditorCategory,
      title: localize2("merge.acceptAllInput1", "Accept All Incoming Changes from Left"),
      f1: true,
      precondition: ctxIsMergeEditor,
      menu: { id: MenuId.MergeInput1Toolbar, group: "primary" },
      icon: Codicon.checkAll
    });
  }
  runWithViewModel(viewModel) {
    viewModel.acceptAll(1);
  }
}
class AcceptAllInput2 extends MergeEditorAction {
  constructor() {
    super({
      id: "merge.acceptAllInput2",
      category: mergeEditorCategory,
      title: localize2("merge.acceptAllInput2", "Accept All Current Changes from Right"),
      f1: true,
      precondition: ctxIsMergeEditor,
      menu: { id: MenuId.MergeInput2Toolbar, group: "primary" },
      icon: Codicon.checkAll
    });
  }
  runWithViewModel(viewModel) {
    viewModel.acceptAll(2);
  }
}
class ResetToBaseAndAutoMergeCommand extends MergeEditorAction {
  constructor() {
    super({
      id: "mergeEditor.resetResultToBaseAndAutoMerge",
      category: mergeEditorCategory,
      title: localize2("mergeEditor.resetResultToBaseAndAutoMerge", "Reset Result"),
      shortTitle: localize("mergeEditor.resetResultToBaseAndAutoMerge.short", "Reset"),
      f1: true,
      precondition: ctxIsMergeEditor,
      menu: { id: MenuId.MergeInputResultToolbar, group: "primary" },
      icon: Codicon.discard
    });
  }
  runWithViewModel(viewModel, accessor) {
    viewModel.model.reset();
  }
}
class ResetCloseWithConflictsChoice extends Action2 {
  constructor() {
    super({
      id: "mergeEditor.resetCloseWithConflictsChoice",
      category: mergeEditorCategory,
      title: localize2("mergeEditor.resetChoice", "Reset Choice for 'Close with Conflicts'"),
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IStorageService).remove(StorageCloseWithConflicts, StorageScope.PROFILE);
  }
}
class AcceptAllCombination extends MergeEditorAction2 {
  constructor() {
    super({
      id: "mergeEditor.acceptAllCombination",
      category: mergeEditorCategory,
      title: localize2("mergeEditor.acceptAllCombination", "Accept All Combination"),
      f1: true
    });
  }
  runWithMergeEditor(context, accessor, ...args) {
    const { viewModel } = context;
    const modifiedBaseRanges = viewModel.model.modifiedBaseRanges.get();
    const model = viewModel.model;
    transaction((tx) => {
      for (const m of modifiedBaseRanges) {
        const state = model.getState(m).get();
        if (state.kind !== ModifiedBaseRangeStateKind.unrecognized && !state.isInputIncluded(1) && (!state.isInputIncluded(2) || !viewModel.shouldUseAppendInsteadOfAccept.get()) && m.canBeCombined) {
          model.setState(
            m,
            state.withInputValue(1, true).withInputValue(2, true, true),
            true,
            tx
          );
          model.telemetry.reportSmartCombinationInvoked(state.includesInput(2));
        }
      }
    });
    return { success: true };
  }
}
class AcceptMerge extends MergeEditorAction2 {
  constructor() {
    super({
      id: "mergeEditor.acceptMerge",
      category: mergeEditorCategory,
      title: localize2("mergeEditor.acceptMerge", "Complete Merge"),
      f1: true,
      precondition: ctxIsMergeEditor,
      keybinding: [
        {
          primary: KeyMod.CtrlCmd | KeyCode.Enter,
          weight: KeybindingWeight.EditorContrib,
          when: ctxIsMergeEditor
        }
      ]
    });
  }
  async runWithMergeEditor({ inputModel, editorIdentifier, viewModel }, accessor) {
    const dialogService = accessor.get(IDialogService);
    const editorService = accessor.get(IEditorService);
    if (viewModel.model.unhandledConflictsCount.get() > 0) {
      const { confirmed } = await dialogService.confirm({
        message: localize("mergeEditor.acceptMerge.unhandledConflicts.message", "Do you want to complete the merge of {0}?", basename(inputModel.resultUri)),
        detail: localize("mergeEditor.acceptMerge.unhandledConflicts.detail", "The file contains unhandled conflicts."),
        primaryButton: localize({ key: "mergeEditor.acceptMerge.unhandledConflicts.accept", comment: ["&& denotes a mnemonic"] }, "&&Complete with Conflicts")
      });
      if (!confirmed) {
        return {
          successful: false
        };
      }
    }
    await inputModel.accept();
    await editorService.closeEditor(editorIdentifier);
    return {
      successful: true
    };
  }
}
class ToggleBetweenInputs extends MergeEditorAction2 {
  constructor() {
    super({
      id: "mergeEditor.toggleBetweenInputs",
      category: mergeEditorCategory,
      title: localize2("mergeEditor.toggleBetweenInputs", "Toggle Between Merge Editor Inputs"),
      f1: true,
      precondition: ctxIsMergeEditor,
      keybinding: [
        {
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyT,
          // Override reopen closed editor
          weight: KeybindingWeight.WorkbenchContrib + 10,
          when: ctxIsMergeEditor
        }
      ]
    });
  }
  runWithMergeEditor({ viewModel }, accessor) {
    const input1IsFocused = viewModel.inputCodeEditorView1.editor.hasWidgetFocus();
    if (input1IsFocused) {
      viewModel.inputCodeEditorView2.editor.focus();
    } else {
      viewModel.inputCodeEditorView1.editor.focus();
    }
  }
}
export {
  AcceptAllCombination,
  AcceptAllInput1,
  AcceptAllInput2,
  AcceptMerge,
  CompareInput1WithBaseCommand,
  CompareInput2WithBaseCommand,
  GoToNextUnhandledConflict,
  GoToPreviousUnhandledConflict,
  OpenBaseFile,
  OpenMergeEditor,
  OpenResultResource,
  ResetCloseWithConflictsChoice,
  ResetToBaseAndAutoMergeCommand,
  SetColumnLayout,
  SetMixedLayout,
  ShowHideBase,
  ShowHideCenterBase,
  ShowHideTopBase,
  ShowNonConflictingChanges,
  ToggleActiveConflictInput1,
  ToggleActiveConflictInput2,
  ToggleBetweenInputs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFxjb21tYW5kc1xcY29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElBY3Rpb24yT3B0aW9ucywgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JJZGVudGlmaWVyLCBJUmVzb3VyY2VNZXJnZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvcklucHV0LCBNZXJnZUVkaXRvcklucHV0RGF0YSB9IGZyb20gJy4uL21lcmdlRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSU1lcmdlRWRpdG9ySW5wdXRNb2RlbCB9IGZyb20gJy4uL21lcmdlRWRpdG9ySW5wdXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvciB9IGZyb20gJy4uL3ZpZXcvbWVyZ2VFZGl0b3IuanMnO1xuaW1wb3J0IHsgTWVyZ2VFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi92aWV3L3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBjdHhJc01lcmdlRWRpdG9yLCBjdHhNZXJnZUVkaXRvckxheW91dCwgY3R4TWVyZ2VFZGl0b3JTaG93QmFzZSwgY3R4TWVyZ2VFZGl0b3JTaG93QmFzZUF0VG9wLCBjdHhNZXJnZUVkaXRvclNob3dOb25Db25mbGljdGluZ0NoYW5nZXMsIFN0b3JhZ2VDbG9zZVdpdGhDb25mbGljdHMgfSBmcm9tICcuLi8uLi9jb21tb24vbWVyZ2VFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kIH0gZnJvbSAnLi4vbW9kZWwvbW9kaWZpZWRCYXNlUmFuZ2UuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuXG5hYnN0cmFjdCBjbGFzcyBNZXJnZUVkaXRvckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcihkZXNjOiBSZWFkb25seTxJQWN0aW9uMk9wdGlvbnM+KSB7XG5cdFx0c3VwZXIoZGVzYyk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB7IGFjdGl2ZUVkaXRvclBhbmUgfSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcikge1xuXHRcdFx0Y29uc3Qgdm0gPSBhY3RpdmVFZGl0b3JQYW5lLnZpZXdNb2RlbC5nZXQoKTtcblx0XHRcdGlmICghdm0pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5ydW5XaXRoVmlld01vZGVsKHZtLCBhY2Nlc3Nvcik7XG5cdFx0fVxuXHR9XG5cblx0YWJzdHJhY3QgcnVuV2l0aFZpZXdNb2RlbCh2aWV3TW9kZWw6IE1lcmdlRWRpdG9yVmlld01vZGVsLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBNZXJnZUVkaXRvckFjdGlvbjJBcmdzIHtcblx0aW5wdXRNb2RlbDogSU1lcmdlRWRpdG9ySW5wdXRNb2RlbDtcblx0dmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbDtcblx0aW5wdXQ6IE1lcmdlRWRpdG9ySW5wdXQ7XG5cdGVkaXRvcklkZW50aWZpZXI6IElFZGl0b3JJZGVudGlmaWVyO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBNZXJnZUVkaXRvckFjdGlvbjIgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoZGVzYzogUmVhZG9ubHk8SUFjdGlvbjJPcHRpb25zPikge1xuXHRcdHN1cGVyKGRlc2MpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCB7IGFjdGl2ZUVkaXRvclBhbmUgfSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcikge1xuXHRcdFx0Y29uc3Qgdm0gPSBhY3RpdmVFZGl0b3JQYW5lLnZpZXdNb2RlbC5nZXQoKTtcblx0XHRcdGlmICghdm0pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdHJldHVybiB0aGlzLnJ1bldpdGhNZXJnZUVkaXRvcih7XG5cdFx0XHRcdHZpZXdNb2RlbDogdm0sXG5cdFx0XHRcdGlucHV0TW9kZWw6IGFjdGl2ZUVkaXRvclBhbmUuaW5wdXRNb2RlbC5nZXQoKSEsXG5cdFx0XHRcdGlucHV0OiBhY3RpdmVFZGl0b3JQYW5lLmlucHV0IGFzIE1lcmdlRWRpdG9ySW5wdXQsXG5cdFx0XHRcdGVkaXRvcklkZW50aWZpZXI6IHtcblx0XHRcdFx0XHRlZGl0b3I6IGFjdGl2ZUVkaXRvclBhbmUuaW5wdXQsXG5cdFx0XHRcdFx0Z3JvdXBJZDogYWN0aXZlRWRpdG9yUGFuZS5ncm91cC5pZCxcblx0XHRcdFx0fVxuXHRcdFx0fSwgYWNjZXNzb3IsIC4uLmFyZ3MpIGFzIGFueTtcblx0XHR9XG5cdH1cblxuXHRhYnN0cmFjdCBydW5XaXRoTWVyZ2VFZGl0b3IoY29udGV4dDogTWVyZ2VFZGl0b3JBY3Rpb24yQXJncywgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHVua25vd247XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuTWVyZ2VFZGl0b3IgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdfb3Blbi5tZXJnZUVkaXRvcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0aXRsZScsICdPcGVuIE1lcmdlIEVkaXRvcicpLFxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsaWRhdGVkQXJncyA9IElSZWxheGVkT3BlbkFyZ3MudmFsaWRhdGUoYXJnc1swXSk7XG5cblx0XHRjb25zdCBpbnB1dDogSVJlc291cmNlTWVyZ2VFZGl0b3JJbnB1dCA9IHtcblx0XHRcdGJhc2U6IHsgcmVzb3VyY2U6IHZhbGlkYXRlZEFyZ3MuYmFzZSB9LFxuXHRcdFx0aW5wdXQxOiB7IHJlc291cmNlOiB2YWxpZGF0ZWRBcmdzLmlucHV0MS51cmksIGxhYmVsOiB2YWxpZGF0ZWRBcmdzLmlucHV0MS50aXRsZSwgZGVzY3JpcHRpb246IHZhbGlkYXRlZEFyZ3MuaW5wdXQxLmRlc2NyaXB0aW9uLCBkZXRhaWw6IHZhbGlkYXRlZEFyZ3MuaW5wdXQxLmRldGFpbCB9LFxuXHRcdFx0aW5wdXQyOiB7IHJlc291cmNlOiB2YWxpZGF0ZWRBcmdzLmlucHV0Mi51cmksIGxhYmVsOiB2YWxpZGF0ZWRBcmdzLmlucHV0Mi50aXRsZSwgZGVzY3JpcHRpb246IHZhbGlkYXRlZEFyZ3MuaW5wdXQyLmRlc2NyaXB0aW9uLCBkZXRhaWw6IHZhbGlkYXRlZEFyZ3MuaW5wdXQyLmRldGFpbCB9LFxuXHRcdFx0cmVzdWx0OiB7IHJlc291cmNlOiB2YWxpZGF0ZWRBcmdzLm91dHB1dCB9LFxuXHRcdFx0b3B0aW9uczogeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH1cblx0XHR9O1xuXHRcdGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkub3BlbkVkaXRvcihpbnB1dCk7XG5cdH1cbn1cblxubmFtZXNwYWNlIElSZWxheGVkT3BlbkFyZ3Mge1xuXHRleHBvcnQgZnVuY3Rpb24gdmFsaWRhdGUob2JqOiB1bmtub3duKToge1xuXHRcdGJhc2U6IFVSSTtcblx0XHRpbnB1dDE6IE1lcmdlRWRpdG9ySW5wdXREYXRhO1xuXHRcdGlucHV0MjogTWVyZ2VFZGl0b3JJbnB1dERhdGE7XG5cdFx0b3V0cHV0OiBVUkk7XG5cdH0ge1xuXHRcdGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSB7XG5cdFx0XHR0aHJvdyBuZXcgVHlwZUVycm9yKCdpbnZhbGlkIGFyZ3VtZW50Jyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbyA9IG9iaiBhcyBJUmVsYXhlZE9wZW5BcmdzO1xuXHRcdGNvbnN0IGJhc2UgPSB0b1VyaShvLmJhc2UpO1xuXHRcdGNvbnN0IG91dHB1dCA9IHRvVXJpKG8ub3V0cHV0KTtcblx0XHRjb25zdCBpbnB1dDEgPSB0b0lucHV0RGF0YShvLmlucHV0MSk7XG5cdFx0Y29uc3QgaW5wdXQyID0gdG9JbnB1dERhdGEoby5pbnB1dDIpO1xuXHRcdHJldHVybiB7IGJhc2UsIGlucHV0MSwgaW5wdXQyLCBvdXRwdXQgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvSW5wdXREYXRhKG9iajogdW5rbm93bik6IE1lcmdlRWRpdG9ySW5wdXREYXRhIHtcblx0XHRpZiAodHlwZW9mIG9iaiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBuZXcgTWVyZ2VFZGl0b3JJbnB1dERhdGEoVVJJLnBhcnNlKG9iaiwgdHJ1ZSksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignaW52YWxpZCBhcmd1bWVudCcpO1xuXHRcdH1cblxuXHRcdGlmIChpc1VyaUNvbXBvbmVudHMob2JqKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBNZXJnZUVkaXRvcklucHV0RGF0YShVUkkucmV2aXZlKG9iaiksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG8gPSBvYmogYXMgSVJlbGF4ZWRJbnB1dERhdGE7XG5cdFx0Y29uc3QgdGl0bGUgPSBvLnRpdGxlO1xuXHRcdGNvbnN0IHVyaSA9IHRvVXJpKG8udXJpKTtcblx0XHRjb25zdCBkZXRhaWwgPSBvLmRldGFpbDtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IG8uZGVzY3JpcHRpb247XG5cdFx0cmV0dXJuIG5ldyBNZXJnZUVkaXRvcklucHV0RGF0YSh1cmksIHRpdGxlLCBkZXRhaWwsIGRlc2NyaXB0aW9uKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRvVXJpKG9iajogdW5rbm93bik6IFVSSSB7XG5cdFx0aWYgKHR5cGVvZiBvYmogPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gVVJJLnBhcnNlKG9iaiwgdHJ1ZSk7XG5cdFx0fSBlbHNlIGlmIChvYmogJiYgdHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBVUkkucmV2aXZlKDxVcmlDb21wb25lbnRzPm9iaik7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBUeXBlRXJyb3IoJ2ludmFsaWQgYXJndW1lbnQnKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGlzVXJpQ29tcG9uZW50cyhvYmo6IHVua25vd24pOiBvYmogaXMgVXJpQ29tcG9uZW50cyB7XG5cdFx0aWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgbyA9IG9iaiBhcyBVcmlDb21wb25lbnRzO1xuXHRcdHJldHVybiB0eXBlb2Ygby5zY2hlbWUgPT09ICdzdHJpbmcnXG5cdFx0XHQmJiB0eXBlb2Ygby5hdXRob3JpdHkgPT09ICdzdHJpbmcnXG5cdFx0XHQmJiB0eXBlb2Ygby5wYXRoID09PSAnc3RyaW5nJ1xuXHRcdFx0JiYgdHlwZW9mIG8ucXVlcnkgPT09ICdzdHJpbmcnXG5cdFx0XHQmJiB0eXBlb2Ygby5mcmFnbWVudCA9PT0gJ3N0cmluZyc7XG5cdH1cbn1cblxudHlwZSBJUmVsYXhlZElucHV0RGF0YSA9IHsgdXJpOiBVcmlDb21wb25lbnRzOyB0aXRsZT86IHN0cmluZzsgZGV0YWlsPzogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZyB9O1xuXG50eXBlIElSZWxheGVkT3BlbkFyZ3MgPSB7XG5cdGJhc2U6IFVyaUNvbXBvbmVudHMgfCBzdHJpbmc7XG5cdGlucHV0MTogSVJlbGF4ZWRJbnB1dERhdGEgfCBzdHJpbmc7XG5cdGlucHV0MjogSVJlbGF4ZWRJbnB1dERhdGEgfCBzdHJpbmc7XG5cdG91dHB1dDogVXJpQ29tcG9uZW50cyB8IHN0cmluZztcbn07XG5cbmV4cG9ydCBjbGFzcyBTZXRNaXhlZExheW91dCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlLm1peGVkTGF5b3V0Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xheW91dC5taXhlZCcsIFwiTWl4ZWQgTGF5b3V0XCIpLFxuXHRcdFx0dG9nZ2xlZDogY3R4TWVyZ2VFZGl0b3JMYXlvdXQuaXNFcXVhbFRvKCdtaXhlZCcpLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdFx0XHRcdGdyb3VwOiAnMV9tZXJnZScsXG5cdFx0XHRcdFx0b3JkZXI6IDksXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBhY3RpdmVFZGl0b3JQYW5lIH0gPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGlmIChhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgTWVyZ2VFZGl0b3IpIHtcblx0XHRcdGFjdGl2ZUVkaXRvclBhbmUuc2V0TGF5b3V0S2luZCgnbWl4ZWQnKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldENvbHVtbkxheW91dCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlLmNvbHVtbkxheW91dCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdsYXlvdXQuY29sdW1uJywgJ0NvbHVtbiBMYXlvdXQnKSxcblx0XHRcdHRvZ2dsZWQ6IGN0eE1lcmdlRWRpdG9yTGF5b3V0LmlzRXF1YWxUbygnY29sdW1ucycpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0d2hlbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHRcdFx0Z3JvdXA6ICcxX21lcmdlJyxcblx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0fV0sXG5cdFx0XHRwcmVjb25kaXRpb246IGN0eElzTWVyZ2VFZGl0b3IsXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB7IGFjdGl2ZUVkaXRvclBhbmUgfSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcikge1xuXHRcdFx0YWN0aXZlRWRpdG9yUGFuZS5zZXRMYXlvdXRLaW5kKCdjb2x1bW5zJyk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2Uuc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzJywgXCJTaG93IE5vbi1Db25mbGljdGluZyBDaGFuZ2VzXCIpLFxuXHRcdFx0dG9nZ2xlZDogY3R4TWVyZ2VFZGl0b3JTaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLmlzRXF1YWxUbyh0cnVlKSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHRcdFx0XHRncm91cDogJzNfbWVyZ2UnLFxuXHRcdFx0XHRcdG9yZGVyOiA5LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHsgYWN0aXZlRWRpdG9yUGFuZSB9ID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIE1lcmdlRWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVFZGl0b3JQYW5lLnRvZ2dsZVNob3dOb25Db25mbGljdGluZ0NoYW5nZXMoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dIaWRlQmFzZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlLnNob3dCYXNlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xheW91dC5zaG93QmFzZScsIFwiU2hvdyBCYXNlXCIpLFxuXHRcdFx0dG9nZ2xlZDogY3R4TWVyZ2VFZGl0b3JTaG93QmFzZS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChjdHhJc01lcmdlRWRpdG9yLCBjdHhNZXJnZUVkaXRvckxheW91dC5pc0VxdWFsVG8oJ2NvbHVtbnMnKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICcyX21lcmdlJyxcblx0XHRcdFx0XHRvcmRlcjogOSxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHsgYWN0aXZlRWRpdG9yUGFuZSB9ID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIE1lcmdlRWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVFZGl0b3JQYW5lLnRvZ2dsZUJhc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNob3dIaWRlVG9wQmFzZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlLnNob3dCYXNlVG9wJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2xheW91dC5zaG93QmFzZVRvcCcsIFwiU2hvdyBCYXNlIFRvcFwiKSxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmFuZChjdHhNZXJnZUVkaXRvclNob3dCYXNlLCBjdHhNZXJnZUVkaXRvclNob3dCYXNlQXRUb3ApLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoY3R4SXNNZXJnZUVkaXRvciwgY3R4TWVyZ2VFZGl0b3JMYXlvdXQuaXNFcXVhbFRvKCdtaXhlZCcpKSxcblx0XHRcdFx0XHRncm91cDogJzJfbWVyZ2UnLFxuXHRcdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCB7IGFjdGl2ZUVkaXRvclBhbmUgfSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBNZXJnZUVkaXRvcikge1xuXHRcdFx0YWN0aXZlRWRpdG9yUGFuZS50b2dnbGVTaG93QmFzZVRvcCgpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd0hpZGVDZW50ZXJCYXNlIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2Uuc2hvd0Jhc2VDZW50ZXInLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbGF5b3V0LnNob3dCYXNlQ2VudGVyJywgXCJTaG93IEJhc2UgQ2VudGVyXCIpLFxuXHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuYW5kKGN0eE1lcmdlRWRpdG9yU2hvd0Jhc2UsIGN0eE1lcmdlRWRpdG9yU2hvd0Jhc2VBdFRvcC5uZWdhdGUoKSksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChjdHhJc01lcmdlRWRpdG9yLCBjdHhNZXJnZUVkaXRvckxheW91dC5pc0VxdWFsVG8oJ21peGVkJykpLFxuXHRcdFx0XHRcdGdyb3VwOiAnMl9tZXJnZScsXG5cdFx0XHRcdFx0b3JkZXI6IDExLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IHsgYWN0aXZlRWRpdG9yUGFuZSB9ID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIE1lcmdlRWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVFZGl0b3JQYW5lLnRvZ2dsZVNob3dCYXNlQ2VudGVyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNvbnN0IG1lcmdlRWRpdG9yQ2F0ZWdvcnk6IElMb2NhbGl6ZWRTdHJpbmcgPSBsb2NhbGl6ZTIoJ21lcmdlRWRpdG9yJywgXCJNZXJnZSBFZGl0b3JcIik7XG5cbmV4cG9ydCBjbGFzcyBPcGVuUmVzdWx0UmVzb3VyY2UgZXh0ZW5kcyBNZXJnZUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2Uub3BlblJlc3VsdCcsXG5cdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignb3BlbmZpbGUnLCBcIk9wZW4gRmlsZVwiKSxcblx0XHRcdGNhdGVnb3J5OiBtZXJnZUVkaXRvckNhdGVnb3J5LFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0d2hlbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9XSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bldpdGhWaWV3TW9kZWwodmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbCwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdmlld01vZGVsLm1vZGVsLnJlc3VsdFRleHRNb2RlbC51cmkgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEdvVG9OZXh0VW5oYW5kbGVkQ29uZmxpY3QgZXh0ZW5kcyBNZXJnZUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2UuZ29Ub05leHRVbmhhbmRsZWRDb25mbGljdCcsXG5cdFx0XHRjYXRlZ29yeTogbWVyZ2VFZGl0b3JDYXRlZ29yeSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21lcmdlLmdvVG9OZXh0VW5oYW5kbGVkQ29uZmxpY3QnLCBcIkdvIHRvIE5leHQgVW5oYW5kbGVkIENvbmZsaWN0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd0Rvd24sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IGN0eElzTWVyZ2VFZGl0b3IsXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogM1xuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuV2l0aFZpZXdNb2RlbCh2aWV3TW9kZWw6IE1lcmdlRWRpdG9yVmlld01vZGVsKTogdm9pZCB7XG5cdFx0dmlld01vZGVsLm1vZGVsLnRlbGVtZXRyeS5yZXBvcnROYXZpZ2F0aW9uVG9OZXh0Q29uZmxpY3QoKTtcblx0XHR2aWV3TW9kZWwuZ29Ub05leHRNb2RpZmllZEJhc2VSYW5nZShyID0+ICF2aWV3TW9kZWwubW9kZWwuaXNIYW5kbGVkKHIpLmdldCgpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR29Ub1ByZXZpb3VzVW5oYW5kbGVkQ29uZmxpY3QgZXh0ZW5kcyBNZXJnZUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2UuZ29Ub1ByZXZpb3VzVW5oYW5kbGVkQ29uZmxpY3QnLFxuXHRcdFx0Y2F0ZWdvcnk6IG1lcmdlRWRpdG9yQ2F0ZWdvcnksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtZXJnZS5nb1RvUHJldmlvdXNVbmhhbmRsZWRDb25mbGljdCcsIFwiR28gdG8gUHJldmlvdXMgVW5oYW5kbGVkIENvbmZsaWN0XCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1VwLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bldpdGhWaWV3TW9kZWwodmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdHZpZXdNb2RlbC5tb2RlbC50ZWxlbWV0cnkucmVwb3J0TmF2aWdhdGlvblRvUHJldmlvdXNDb25mbGljdCgpO1xuXHRcdHZpZXdNb2RlbC5nb1RvUHJldmlvdXNNb2RpZmllZEJhc2VSYW5nZShyID0+ICF2aWV3TW9kZWwubW9kZWwuaXNIYW5kbGVkKHIpLmdldCgpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlQWN0aXZlQ29uZmxpY3RJbnB1dDEgZXh0ZW5kcyBNZXJnZUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2UudG9nZ2xlQWN0aXZlQ29uZmxpY3RJbnB1dDEnLFxuXHRcdFx0Y2F0ZWdvcnk6IG1lcmdlRWRpdG9yQ2F0ZWdvcnksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtZXJnZS50b2dnbGVDdXJyZW50Q29uZmxpY3RGcm9tTGVmdCcsIFwiVG9nZ2xlIEN1cnJlbnQgQ29uZmxpY3QgZnJvbSBMZWZ0XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IGN0eElzTWVyZ2VFZGl0b3IsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5XaXRoVmlld01vZGVsKHZpZXdNb2RlbDogTWVyZ2VFZGl0b3JWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHR2aWV3TW9kZWwudG9nZ2xlQWN0aXZlQ29uZmxpY3QoMSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUFjdGl2ZUNvbmZsaWN0SW5wdXQyIGV4dGVuZHMgTWVyZ2VFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlLnRvZ2dsZUFjdGl2ZUNvbmZsaWN0SW5wdXQyJyxcblx0XHRcdGNhdGVnb3J5OiBtZXJnZUVkaXRvckNhdGVnb3J5LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWVyZ2UudG9nZ2xlQ3VycmVudENvbmZsaWN0RnJvbVJpZ2h0JywgXCJUb2dnbGUgQ3VycmVudCBDb25mbGljdCBmcm9tIFJpZ2h0XCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IGN0eElzTWVyZ2VFZGl0b3IsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5XaXRoVmlld01vZGVsKHZpZXdNb2RlbDogTWVyZ2VFZGl0b3JWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHR2aWV3TW9kZWwudG9nZ2xlQWN0aXZlQ29uZmxpY3QoMik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbXBhcmVJbnB1dDFXaXRoQmFzZUNvbW1hbmQgZXh0ZW5kcyBNZXJnZUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2VFZGl0b3IuY29tcGFyZUlucHV0MVdpdGhCYXNlJyxcblx0XHRcdGNhdGVnb3J5OiBtZXJnZUVkaXRvckNhdGVnb3J5LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWVyZ2VFZGl0b3IuY29tcGFyZUlucHV0MVdpdGhCYXNlJywgXCJDb21wYXJlIElucHV0IDEgV2l0aCBCYXNlXCIpLFxuXHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUoJ21lcmdlRWRpdG9yLmNvbXBhcmVXaXRoQmFzZScsICdDb21wYXJlIFdpdGggQmFzZScpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IGN0eElzTWVyZ2VFZGl0b3IsXG5cdFx0XHRtZW51OiB7IGlkOiBNZW51SWQuTWVyZ2VJbnB1dDFUb29sYmFyLCBncm91cDogJ3ByaW1hcnknIH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLmNvbXBhcmVDaGFuZ2VzLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuV2l0aFZpZXdNb2RlbCh2aWV3TW9kZWw6IE1lcmdlRWRpdG9yVmlld01vZGVsLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdG1lcmdlRWRpdG9yQ29tcGFyZSh2aWV3TW9kZWwsIGVkaXRvclNlcnZpY2UsIDEpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wYXJlSW5wdXQyV2l0aEJhc2VDb21tYW5kIGV4dGVuZHMgTWVyZ2VFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlRWRpdG9yLmNvbXBhcmVJbnB1dDJXaXRoQmFzZScsXG5cdFx0XHRjYXRlZ29yeTogbWVyZ2VFZGl0b3JDYXRlZ29yeSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21lcmdlRWRpdG9yLmNvbXBhcmVJbnB1dDJXaXRoQmFzZScsIFwiQ29tcGFyZSBJbnB1dCAyIFdpdGggQmFzZVwiKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplKCdtZXJnZUVkaXRvci5jb21wYXJlV2l0aEJhc2UnLCAnQ29tcGFyZSBXaXRoIEJhc2UnKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdFx0bWVudTogeyBpZDogTWVudUlkLk1lcmdlSW5wdXQyVG9vbGJhciwgZ3JvdXA6ICdwcmltYXJ5JyB9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb21wYXJlQ2hhbmdlcyxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bldpdGhWaWV3TW9kZWwodmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbCwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRtZXJnZUVkaXRvckNvbXBhcmUodmlld01vZGVsLCBlZGl0b3JTZXJ2aWNlLCAyKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBtZXJnZUVkaXRvckNvbXBhcmUodmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbCwgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsIGlucHV0TnVtYmVyOiAxIHwgMikge1xuXG5cdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciEsIHsgcGlubmVkOiB0cnVlIH0pO1xuXG5cdGNvbnN0IG1vZGVsID0gdmlld01vZGVsLm1vZGVsO1xuXHRjb25zdCBiYXNlID0gbW9kZWwuYmFzZTtcblx0Y29uc3QgaW5wdXQgPSBpbnB1dE51bWJlciA9PT0gMSA/IHZpZXdNb2RlbC5pbnB1dENvZGVFZGl0b3JWaWV3MS5lZGl0b3IgOiB2aWV3TW9kZWwuaW5wdXRDb2RlRWRpdG9yVmlldzIuZWRpdG9yO1xuXG5cdGNvbnN0IGxpbmVOdW1iZXIgPSBpbnB1dC5nZXRQb3NpdGlvbigpIS5saW5lTnVtYmVyO1xuXHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBiYXNlLnVyaSB9LFxuXHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBpbnB1dC5nZXRNb2RlbCgpIS51cmkgfSxcblx0XHRvcHRpb25zOiB7XG5cdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLFxuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdH0sXG5cdFx0XHRyZXZlYWxJZk9wZW5lZDogdHJ1ZSxcblx0XHRcdHJldmVhbElmVmlzaWJsZTogdHJ1ZSxcblx0XHR9IHNhdGlzZmllcyBJVGV4dEVkaXRvck9wdGlvbnNcblx0fSk7XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuQmFzZUZpbGUgZXh0ZW5kcyBNZXJnZUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2Uub3BlbkJhc2VFZGl0b3InLFxuXHRcdFx0Y2F0ZWdvcnk6IG1lcmdlRWRpdG9yQ2F0ZWdvcnksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtZXJnZS5vcGVuQmFzZUVkaXRvcicsIFwiT3BlbiBCYXNlIEZpbGVcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bldpdGhWaWV3TW9kZWwodmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbCwgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBvcGVuZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPcGVuZXJTZXJ2aWNlKTtcblx0XHRvcGVuZXJTZXJ2aWNlLm9wZW4odmlld01vZGVsLm1vZGVsLmJhc2UudXJpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWNjZXB0QWxsSW5wdXQxIGV4dGVuZHMgTWVyZ2VFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlLmFjY2VwdEFsbElucHV0MScsXG5cdFx0XHRjYXRlZ29yeTogbWVyZ2VFZGl0b3JDYXRlZ29yeSxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21lcmdlLmFjY2VwdEFsbElucHV0MScsIFwiQWNjZXB0IEFsbCBJbmNvbWluZyBDaGFuZ2VzIGZyb20gTGVmdFwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdFx0bWVudTogeyBpZDogTWVudUlkLk1lcmdlSW5wdXQxVG9vbGJhciwgZ3JvdXA6ICdwcmltYXJ5JyB9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVja0FsbCxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bldpdGhWaWV3TW9kZWwodmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdHZpZXdNb2RlbC5hY2NlcHRBbGwoMSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFjY2VwdEFsbElucHV0MiBleHRlbmRzIE1lcmdlRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdtZXJnZS5hY2NlcHRBbGxJbnB1dDInLFxuXHRcdFx0Y2F0ZWdvcnk6IG1lcmdlRWRpdG9yQ2F0ZWdvcnksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtZXJnZS5hY2NlcHRBbGxJbnB1dDInLCBcIkFjY2VwdCBBbGwgQ3VycmVudCBDaGFuZ2VzIGZyb20gUmlnaHRcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVJZC5NZXJnZUlucHV0MlRvb2xiYXIsIGdyb3VwOiAncHJpbWFyeScgfSxcblx0XHRcdGljb246IENvZGljb24uY2hlY2tBbGwsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5XaXRoVmlld01vZGVsKHZpZXdNb2RlbDogTWVyZ2VFZGl0b3JWaWV3TW9kZWwpOiB2b2lkIHtcblx0XHR2aWV3TW9kZWwuYWNjZXB0QWxsKDIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNldFRvQmFzZUFuZEF1dG9NZXJnZUNvbW1hbmQgZXh0ZW5kcyBNZXJnZUVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2VFZGl0b3IucmVzZXRSZXN1bHRUb0Jhc2VBbmRBdXRvTWVyZ2UnLFxuXHRcdFx0Y2F0ZWdvcnk6IG1lcmdlRWRpdG9yQ2F0ZWdvcnksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtZXJnZUVkaXRvci5yZXNldFJlc3VsdFRvQmFzZUFuZEF1dG9NZXJnZScsIFwiUmVzZXQgUmVzdWx0XCIpLFxuXHRcdFx0c2hvcnRUaXRsZTogbG9jYWxpemUoJ21lcmdlRWRpdG9yLnJlc2V0UmVzdWx0VG9CYXNlQW5kQXV0b01lcmdlLnNob3J0JywgJ1Jlc2V0JyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHRcdG1lbnU6IHsgaWQ6IE1lbnVJZC5NZXJnZUlucHV0UmVzdWx0VG9vbGJhciwgZ3JvdXA6ICdwcmltYXJ5JyB9LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5kaXNjYXJkLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuV2l0aFZpZXdNb2RlbCh2aWV3TW9kZWw6IE1lcmdlRWRpdG9yVmlld01vZGVsLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdHZpZXdNb2RlbC5tb2RlbC5yZXNldCgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBSZXNldENsb3NlV2l0aENvbmZsaWN0c0Nob2ljZSBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ21lcmdlRWRpdG9yLnJlc2V0Q2xvc2VXaXRoQ29uZmxpY3RzQ2hvaWNlJyxcblx0XHRcdGNhdGVnb3J5OiBtZXJnZUVkaXRvckNhdGVnb3J5LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWVyZ2VFZGl0b3IucmVzZXRDaG9pY2UnLCBcIlJlc2V0IENob2ljZSBmb3IgXFwnQ2xvc2Ugd2l0aCBDb25mbGljdHNcXCdcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVN0b3JhZ2VTZXJ2aWNlKS5yZW1vdmUoU3RvcmFnZUNsb3NlV2l0aENvbmZsaWN0cywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBY2NlcHRBbGxDb21iaW5hdGlvbiBleHRlbmRzIE1lcmdlRWRpdG9yQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2VFZGl0b3IuYWNjZXB0QWxsQ29tYmluYXRpb24nLFxuXHRcdFx0Y2F0ZWdvcnk6IG1lcmdlRWRpdG9yQ2F0ZWdvcnksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtZXJnZUVkaXRvci5hY2NlcHRBbGxDb21iaW5hdGlvbicsIFwiQWNjZXB0IEFsbCBDb21iaW5hdGlvblwiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuV2l0aE1lcmdlRWRpdG9yKGNvbnRleHQ6IE1lcmdlRWRpdG9yQWN0aW9uMkFyZ3MsIGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCB7IHZpZXdNb2RlbCB9ID0gY29udGV4dDtcblx0XHRjb25zdCBtb2RpZmllZEJhc2VSYW5nZXMgPSB2aWV3TW9kZWwubW9kZWwubW9kaWZpZWRCYXNlUmFuZ2VzLmdldCgpO1xuXHRcdGNvbnN0IG1vZGVsID0gdmlld01vZGVsLm1vZGVsO1xuXHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBtIG9mIG1vZGlmaWVkQmFzZVJhbmdlcykge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IG1vZGVsLmdldFN0YXRlKG0pLmdldCgpO1xuXHRcdFx0XHRpZiAoc3RhdGUua2luZCAhPT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkICYmICFzdGF0ZS5pc0lucHV0SW5jbHVkZWQoMSkgJiYgKCFzdGF0ZS5pc0lucHV0SW5jbHVkZWQoMikgfHwgIXZpZXdNb2RlbC5zaG91bGRVc2VBcHBlbmRJbnN0ZWFkT2ZBY2NlcHQuZ2V0KCkpICYmIG0uY2FuQmVDb21iaW5lZCkge1xuXHRcdFx0XHRcdG1vZGVsLnNldFN0YXRlKFxuXHRcdFx0XHRcdFx0bSxcblx0XHRcdFx0XHRcdHN0YXRlXG5cdFx0XHRcdFx0XHRcdC53aXRoSW5wdXRWYWx1ZSgxLCB0cnVlKVxuXHRcdFx0XHRcdFx0XHQud2l0aElucHV0VmFsdWUoMiwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0dHhcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdG1vZGVsLnRlbGVtZXRyeS5yZXBvcnRTbWFydENvbWJpbmF0aW9uSW52b2tlZChzdGF0ZS5pbmNsdWRlc0lucHV0KDIpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUgfTtcblxuXHR9XG59XG5cbi8vIHRoaXMgaXMgYW4gQVBJIGNvbW1hbmRcbmV4cG9ydCBjbGFzcyBBY2NlcHRNZXJnZSBleHRlbmRzIE1lcmdlRWRpdG9yQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbWVyZ2VFZGl0b3IuYWNjZXB0TWVyZ2UnLFxuXHRcdFx0Y2F0ZWdvcnk6IG1lcmdlRWRpdG9yQ2F0ZWdvcnksXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtZXJnZUVkaXRvci5hY2NlcHRNZXJnZScsIFwiQ29tcGxldGUgTWVyZ2VcIiksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogY3R4SXNNZXJnZUVkaXRvcixcblx0XHRcdGtleWJpbmRpbmc6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0XHR3aGVuOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW5XaXRoTWVyZ2VFZGl0b3IoeyBpbnB1dE1vZGVsLCBlZGl0b3JJZGVudGlmaWVyLCB2aWV3TW9kZWwgfTogTWVyZ2VFZGl0b3JBY3Rpb24yQXJncywgYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpIHtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdGlmICh2aWV3TW9kZWwubW9kZWwudW5oYW5kbGVkQ29uZmxpY3RzQ291bnQuZ2V0KCkgPiAwKSB7XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ21lcmdlRWRpdG9yLmFjY2VwdE1lcmdlLnVuaGFuZGxlZENvbmZsaWN0cy5tZXNzYWdlJywgXCJEbyB5b3Ugd2FudCB0byBjb21wbGV0ZSB0aGUgbWVyZ2Ugb2YgezB9P1wiLCBiYXNlbmFtZShpbnB1dE1vZGVsLnJlc3VsdFVyaSkpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdtZXJnZUVkaXRvci5hY2NlcHRNZXJnZS51bmhhbmRsZWRDb25mbGljdHMuZGV0YWlsJywgXCJUaGUgZmlsZSBjb250YWlucyB1bmhhbmRsZWQgY29uZmxpY3RzLlwiKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdtZXJnZUVkaXRvci5hY2NlcHRNZXJnZS51bmhhbmRsZWRDb25mbGljdHMuYWNjZXB0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQ29tcGxldGUgd2l0aCBDb25mbGljdHNcIilcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Y2Nlc3NmdWw6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgaW5wdXRNb2RlbC5hY2NlcHQoKTtcblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLmNsb3NlRWRpdG9yKGVkaXRvcklkZW50aWZpZXIpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN1Y2Nlc3NmdWw6IHRydWVcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBUb2dnbGVCZXR3ZWVuSW5wdXRzIGV4dGVuZHMgTWVyZ2VFZGl0b3JBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdtZXJnZUVkaXRvci50b2dnbGVCZXR3ZWVuSW5wdXRzJyxcblx0XHRcdGNhdGVnb3J5OiBtZXJnZUVkaXRvckNhdGVnb3J5LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbWVyZ2VFZGl0b3IudG9nZ2xlQmV0d2VlbklucHV0cycsIFwiVG9nZ2xlIEJldHdlZW4gTWVyZ2UgRWRpdG9yIElucHV0c1wiKSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBjdHhJc01lcmdlRWRpdG9yLFxuXHRcdFx0a2V5YmluZGluZzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVQsXG5cdFx0XHRcdFx0Ly8gT3ZlcnJpZGUgcmVvcGVuIGNsb3NlZCBlZGl0b3Jcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwLFxuXHRcdFx0XHRcdHdoZW46IGN0eElzTWVyZ2VFZGl0b3IsXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bldpdGhNZXJnZUVkaXRvcih7IHZpZXdNb2RlbCB9OiBNZXJnZUVkaXRvckFjdGlvbjJBcmdzLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGlucHV0MUlzRm9jdXNlZCA9IHZpZXdNb2RlbC5pbnB1dENvZGVFZGl0b3JWaWV3MS5lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKTtcblxuXHRcdC8vIFRvZ2dsZSBmb2N1cyBiZXR3ZWVuIGlucHV0c1xuXHRcdGlmIChpbnB1dDFJc0ZvY3VzZWQpIHtcblx0XHRcdHZpZXdNb2RlbC5pbnB1dENvZGVFZGl0b3JWaWV3Mi5lZGl0b3IuZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmlld01vZGVsLmlucHV0Q29kZUVkaXRvclZpZXcxLmVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxVQUFVLGlCQUFpQjtBQUVwQyxTQUFTLFNBQTBCLGNBQWM7QUFDakQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsb0JBQW9CO0FBRTlDLFNBQTJCLDRCQUE0QjtBQUV2RCxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLGtCQUFrQixzQkFBc0Isd0JBQXdCLDZCQUE2Qix5Q0FBeUMsaUNBQWlDO0FBQ2hMLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsd0JBQXdCO0FBRWpDLE1BQWUsMEJBQTBCLFFBQVE7QUFBQSxFQUNoRCxZQUFZLE1BQWlDO0FBQzVDLFVBQU0sSUFBSTtBQUFBLEVBQ1g7QUFBQSxFQUVBLElBQUksVUFBa0M7QUFDckMsVUFBTSxFQUFFLGlCQUFpQixJQUFJLFNBQVMsSUFBSSxjQUFjO0FBQ3hELFFBQUksNEJBQTRCLGFBQWE7QUFDNUMsWUFBTSxLQUFLLGlCQUFpQixVQUFVLElBQUk7QUFDMUMsVUFBSSxDQUFDLElBQUk7QUFDUjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLGlCQUFpQixJQUFJLFFBQVE7QUFBQSxJQUNuQztBQUFBLEVBQ0Q7QUFHRDtBQVNBLE1BQWUsMkJBQTJCLFFBQVE7QUFBQSxFQUNqRCxZQUFZLE1BQWlDO0FBQzVDLFVBQU0sSUFBSTtBQUFBLEVBQ1g7QUFBQSxFQUVTLElBQUksYUFBK0IsTUFBdUI7QUFDbEUsVUFBTSxFQUFFLGlCQUFpQixJQUFJLFNBQVMsSUFBSSxjQUFjO0FBQ3hELFFBQUksNEJBQTRCLGFBQWE7QUFDNUMsWUFBTSxLQUFLLGlCQUFpQixVQUFVLElBQUk7QUFDMUMsVUFBSSxDQUFDLElBQUk7QUFDUjtBQUFBLE1BQ0Q7QUFHQSxhQUFPLEtBQUssbUJBQW1CO0FBQUEsUUFDOUIsV0FBVztBQUFBLFFBQ1gsWUFBWSxpQkFBaUIsV0FBVyxJQUFJO0FBQUEsUUFDNUMsT0FBTyxpQkFBaUI7QUFBQSxRQUN4QixrQkFBa0I7QUFBQSxVQUNqQixRQUFRLGlCQUFpQjtBQUFBLFVBQ3pCLFNBQVMsaUJBQWlCLE1BQU07QUFBQSxRQUNqQztBQUFBLE1BQ0QsR0FBRyxVQUFVLEdBQUcsSUFBSTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUdEO0FBRU8sTUFBTSx3QkFBd0IsUUFBUTtBQUFBLEVBQzVDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsU0FBUyxtQkFBbUI7QUFBQSxJQUM5QyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsSUFBSSxhQUErQixNQUF1QjtBQUN6RCxVQUFNLGdCQUFnQixpQkFBaUIsU0FBUyxLQUFLLENBQUMsQ0FBQztBQUV2RCxVQUFNLFFBQW1DO0FBQUEsTUFDeEMsTUFBTSxFQUFFLFVBQVUsY0FBYyxLQUFLO0FBQUEsTUFDckMsUUFBUSxFQUFFLFVBQVUsY0FBYyxPQUFPLEtBQUssT0FBTyxjQUFjLE9BQU8sT0FBTyxhQUFhLGNBQWMsT0FBTyxhQUFhLFFBQVEsY0FBYyxPQUFPLE9BQU87QUFBQSxNQUNwSyxRQUFRLEVBQUUsVUFBVSxjQUFjLE9BQU8sS0FBSyxPQUFPLGNBQWMsT0FBTyxPQUFPLGFBQWEsY0FBYyxPQUFPLGFBQWEsUUFBUSxjQUFjLE9BQU8sT0FBTztBQUFBLE1BQ3BLLFFBQVEsRUFBRSxVQUFVLGNBQWMsT0FBTztBQUFBLE1BQ3pDLFNBQVMsRUFBRSxlQUFlLEtBQUs7QUFBQSxJQUNoQztBQUNBLGFBQVMsSUFBSSxjQUFjLEVBQUUsV0FBVyxLQUFLO0FBQUEsRUFDOUM7QUFDRDtBQUVBLElBQVU7QUFBQSxDQUFWLENBQVVBLHNCQUFWO0FBQ1EsV0FBUyxTQUFTLEtBS3ZCO0FBQ0QsUUFBSSxDQUFDLE9BQU8sT0FBTyxRQUFRLFVBQVU7QUFDcEMsWUFBTSxJQUFJLFVBQVUsa0JBQWtCO0FBQUEsSUFDdkM7QUFFQSxVQUFNLElBQUk7QUFDVixVQUFNLE9BQU8sTUFBTSxFQUFFLElBQUk7QUFDekIsVUFBTSxTQUFTLE1BQU0sRUFBRSxNQUFNO0FBQzdCLFVBQU0sU0FBUyxZQUFZLEVBQUUsTUFBTTtBQUNuQyxVQUFNLFNBQVMsWUFBWSxFQUFFLE1BQU07QUFDbkMsV0FBTyxFQUFFLE1BQU0sUUFBUSxRQUFRLE9BQU87QUFBQSxFQUN2QztBQWhCTyxFQUFBQSxrQkFBUztBQWtCaEIsV0FBUyxZQUFZLEtBQW9DO0FBQ3hELFFBQUksT0FBTyxRQUFRLFVBQVU7QUFDNUIsYUFBTyxJQUFJLHFCQUFxQixJQUFJLE1BQU0sS0FBSyxJQUFJLEdBQUcsUUFBVyxRQUFXLE1BQVM7QUFBQSxJQUN0RjtBQUNBLFFBQUksQ0FBQyxPQUFPLE9BQU8sUUFBUSxVQUFVO0FBQ3BDLFlBQU0sSUFBSSxVQUFVLGtCQUFrQjtBQUFBLElBQ3ZDO0FBRUEsUUFBSSxnQkFBZ0IsR0FBRyxHQUFHO0FBQ3pCLGFBQU8sSUFBSSxxQkFBcUIsSUFBSSxPQUFPLEdBQUcsR0FBRyxRQUFXLFFBQVcsTUFBUztBQUFBLElBQ2pGO0FBRUEsVUFBTSxJQUFJO0FBQ1YsVUFBTSxRQUFRLEVBQUU7QUFDaEIsVUFBTSxNQUFNLE1BQU0sRUFBRSxHQUFHO0FBQ3ZCLFVBQU0sU0FBUyxFQUFFO0FBQ2pCLFVBQU0sY0FBYyxFQUFFO0FBQ3RCLFdBQU8sSUFBSSxxQkFBcUIsS0FBSyxPQUFPLFFBQVEsV0FBVztBQUFBLEVBQ2hFO0FBRUEsV0FBUyxNQUFNLEtBQW1CO0FBQ2pDLFFBQUksT0FBTyxRQUFRLFVBQVU7QUFDNUIsYUFBTyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBQUEsSUFDM0IsV0FBVyxPQUFPLE9BQU8sUUFBUSxVQUFVO0FBQzFDLGFBQU8sSUFBSSxPQUFzQixHQUFHO0FBQUEsSUFDckM7QUFDQSxVQUFNLElBQUksVUFBVSxrQkFBa0I7QUFBQSxFQUN2QztBQUVBLFdBQVMsZ0JBQWdCLEtBQW9DO0FBQzVELFFBQUksQ0FBQyxPQUFPLE9BQU8sUUFBUSxVQUFVO0FBQ3BDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxJQUFJO0FBQ1YsV0FBTyxPQUFPLEVBQUUsV0FBVyxZQUN2QixPQUFPLEVBQUUsY0FBYyxZQUN2QixPQUFPLEVBQUUsU0FBUyxZQUNsQixPQUFPLEVBQUUsVUFBVSxZQUNuQixPQUFPLEVBQUUsYUFBYTtBQUFBLEVBQzNCO0FBQUEsR0ExRFM7QUFzRUgsTUFBTSx1QkFBdUIsUUFBUTtBQUFBLEVBQzNDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsZ0JBQWdCLGNBQWM7QUFBQSxNQUMvQyxTQUFTLHFCQUFxQixVQUFVLE9BQU87QUFBQSxNQUMvQyxNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sRUFBRSxpQkFBaUIsSUFBSSxTQUFTLElBQUksY0FBYztBQUN4RCxRQUFJLDRCQUE0QixhQUFhO0FBQzVDLHVCQUFpQixjQUFjLE9BQU87QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sd0JBQXdCLFFBQVE7QUFBQSxFQUM1QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLGlCQUFpQixlQUFlO0FBQUEsTUFDakQsU0FBUyxxQkFBcUIsVUFBVSxTQUFTO0FBQUEsTUFDakQsTUFBTSxDQUFDO0FBQUEsUUFDTixJQUFJLE9BQU87QUFBQSxRQUNYLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxNQUNELGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sRUFBRSxpQkFBaUIsSUFBSSxTQUFTLElBQUksY0FBYztBQUN4RCxRQUFJLDRCQUE0QixhQUFhO0FBQzVDLHVCQUFpQixjQUFjLFNBQVM7QUFBQSxJQUN6QztBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sa0NBQWtDLFFBQVE7QUFBQSxFQUN0RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLDZCQUE2Qiw4QkFBOEI7QUFBQSxNQUM1RSxTQUFTLHdDQUF3QyxVQUFVLElBQUk7QUFBQSxNQUMvRCxNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sRUFBRSxpQkFBaUIsSUFBSSxTQUFTLElBQUksY0FBYztBQUN4RCxRQUFJLDRCQUE0QixhQUFhO0FBQzVDLHVCQUFpQixnQ0FBZ0M7QUFBQSxJQUNsRDtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0scUJBQXFCLFFBQVE7QUFBQSxFQUN6QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLG1CQUFtQixXQUFXO0FBQUEsTUFDL0MsU0FBUyx1QkFBdUIsVUFBVSxJQUFJO0FBQUEsTUFDOUMsTUFBTTtBQUFBLFFBQ0w7QUFBQSxVQUNDLElBQUksT0FBTztBQUFBLFVBQ1gsTUFBTSxlQUFlLElBQUksa0JBQWtCLHFCQUFxQixVQUFVLFNBQVMsQ0FBQztBQUFBLFVBQ3BGLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLElBQUksVUFBa0M7QUFDckMsVUFBTSxFQUFFLGlCQUFpQixJQUFJLFNBQVMsSUFBSSxjQUFjO0FBQ3hELFFBQUksNEJBQTRCLGFBQWE7QUFDNUMsdUJBQWlCLFdBQVc7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sd0JBQXdCLFFBQVE7QUFBQSxFQUM1QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHNCQUFzQixlQUFlO0FBQUEsTUFDdEQsU0FBUyxlQUFlLElBQUksd0JBQXdCLDJCQUEyQjtBQUFBLE1BQy9FLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZSxJQUFJLGtCQUFrQixxQkFBcUIsVUFBVSxPQUFPLENBQUM7QUFBQSxVQUNsRixPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sRUFBRSxpQkFBaUIsSUFBSSxTQUFTLElBQUksY0FBYztBQUN4RCxRQUFJLDRCQUE0QixhQUFhO0FBQzVDLHVCQUFpQixrQkFBa0I7QUFBQSxJQUNwQztBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sMkJBQTJCLFFBQVE7QUFBQSxFQUMvQyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHlCQUF5QixrQkFBa0I7QUFBQSxNQUM1RCxTQUFTLGVBQWUsSUFBSSx3QkFBd0IsNEJBQTRCLE9BQU8sQ0FBQztBQUFBLE1BQ3hGLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU0sZUFBZSxJQUFJLGtCQUFrQixxQkFBcUIsVUFBVSxPQUFPLENBQUM7QUFBQSxVQUNsRixPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sRUFBRSxpQkFBaUIsSUFBSSxTQUFTLElBQUksY0FBYztBQUN4RCxRQUFJLDRCQUE0QixhQUFhO0FBQzVDLHVCQUFpQixxQkFBcUI7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sc0JBQXdDLFVBQVUsZUFBZSxjQUFjO0FBRTlFLE1BQU0sMkJBQTJCLGtCQUFrQjtBQUFBLEVBQ3pELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixNQUFNLFFBQVE7QUFBQSxNQUNkLE9BQU8sVUFBVSxZQUFZLFdBQVc7QUFBQSxNQUN4QyxVQUFVO0FBQUEsTUFDVixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLE1BQ0QsY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLGlCQUFpQixXQUFpQyxVQUFrQztBQUM1RixVQUFNLGdCQUFnQixTQUFTLElBQUksY0FBYztBQUNqRCxrQkFBYyxXQUFXLEVBQUUsVUFBVSxVQUFVLE1BQU0sZ0JBQWdCLElBQUksQ0FBQztBQUFBLEVBQzNFO0FBQ0Q7QUFFTyxNQUFNLGtDQUFrQyxrQkFBa0I7QUFBQSxFQUNoRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLE1BQ1YsT0FBTyxVQUFVLG1DQUFtQywrQkFBK0I7QUFBQSxNQUNuRixNQUFNLFFBQVE7QUFBQSxNQUNkLE1BQU07QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLE9BQU87QUFBQSxVQUNYLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLGlCQUFpQixXQUF1QztBQUNoRSxjQUFVLE1BQU0sVUFBVSwrQkFBK0I7QUFDekQsY0FBVSwwQkFBMEIsT0FBSyxDQUFDLFVBQVUsTUFBTSxVQUFVLENBQUMsRUFBRSxJQUFJLENBQUM7QUFBQSxFQUM3RTtBQUNEO0FBRU8sTUFBTSxzQ0FBc0Msa0JBQWtCO0FBQUEsRUFDcEUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWLE9BQU8sVUFBVSx1Q0FBdUMsbUNBQW1DO0FBQUEsTUFDM0YsTUFBTSxRQUFRO0FBQUEsTUFDZCxNQUFNO0FBQUEsUUFDTDtBQUFBLFVBQ0MsSUFBSSxPQUFPO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxpQkFBaUIsV0FBdUM7QUFDaEUsY0FBVSxNQUFNLFVBQVUsbUNBQW1DO0FBQzdELGNBQVUsOEJBQThCLE9BQUssQ0FBQyxVQUFVLE1BQU0sVUFBVSxDQUFDLEVBQUUsSUFBSSxDQUFDO0FBQUEsRUFDakY7QUFDRDtBQUVPLE1BQU0sbUNBQW1DLGtCQUFrQjtBQUFBLEVBQ2pFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsTUFDVixPQUFPLFVBQVUsdUNBQXVDLG1DQUFtQztBQUFBLE1BQzNGLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxpQkFBaUIsV0FBdUM7QUFDaEUsY0FBVSxxQkFBcUIsQ0FBQztBQUFBLEVBQ2pDO0FBQ0Q7QUFFTyxNQUFNLG1DQUFtQyxrQkFBa0I7QUFBQSxFQUNqRSxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLE1BQ1YsT0FBTyxVQUFVLHdDQUF3QyxvQ0FBb0M7QUFBQSxNQUM3RixJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsaUJBQWlCLFdBQXVDO0FBQ2hFLGNBQVUscUJBQXFCLENBQUM7QUFBQSxFQUNqQztBQUNEO0FBRU8sTUFBTSxxQ0FBcUMsa0JBQWtCO0FBQUEsRUFDbkUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWLE9BQU8sVUFBVSxxQ0FBcUMsMkJBQTJCO0FBQUEsTUFDakYsWUFBWSxTQUFTLCtCQUErQixtQkFBbUI7QUFBQSxNQUN2RSxJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxNQUFNLEVBQUUsSUFBSSxPQUFPLG9CQUFvQixPQUFPLFVBQVU7QUFBQSxNQUN4RCxNQUFNLFFBQVE7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxpQkFBaUIsV0FBaUMsVUFBa0M7QUFDNUYsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsdUJBQW1CLFdBQVcsZUFBZSxDQUFDO0FBQUEsRUFDL0M7QUFDRDtBQUVPLE1BQU0scUNBQXFDLGtCQUFrQjtBQUFBLEVBQ25FLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsTUFDVixPQUFPLFVBQVUscUNBQXFDLDJCQUEyQjtBQUFBLE1BQ2pGLFlBQVksU0FBUywrQkFBK0IsbUJBQW1CO0FBQUEsTUFDdkUsSUFBSTtBQUFBLE1BQ0osY0FBYztBQUFBLE1BQ2QsTUFBTSxFQUFFLElBQUksT0FBTyxvQkFBb0IsT0FBTyxVQUFVO0FBQUEsTUFDeEQsTUFBTSxRQUFRO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsaUJBQWlCLFdBQWlDLFVBQWtDO0FBQzVGLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELHVCQUFtQixXQUFXLGVBQWUsQ0FBQztBQUFBLEVBQy9DO0FBQ0Q7QUFFQSxlQUFlLG1CQUFtQixXQUFpQyxlQUErQixhQUFvQjtBQUVySCxnQkFBYyxXQUFXLGNBQWMsY0FBZSxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBRXRFLFFBQU0sUUFBUSxVQUFVO0FBQ3hCLFFBQU0sT0FBTyxNQUFNO0FBQ25CLFFBQU0sUUFBUSxnQkFBZ0IsSUFBSSxVQUFVLHFCQUFxQixTQUFTLFVBQVUscUJBQXFCO0FBRXpHLFFBQU0sYUFBYSxNQUFNLFlBQVksRUFBRztBQUN4QyxRQUFNLGNBQWMsV0FBVztBQUFBLElBQzlCLFVBQVUsRUFBRSxVQUFVLEtBQUssSUFBSTtBQUFBLElBQy9CLFVBQVUsRUFBRSxVQUFVLE1BQU0sU0FBUyxFQUFHLElBQUk7QUFBQSxJQUM1QyxTQUFTO0FBQUEsTUFDUixXQUFXO0FBQUEsUUFDVixpQkFBaUI7QUFBQSxRQUNqQixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsZ0JBQWdCO0FBQUEsTUFDaEIsaUJBQWlCO0FBQUEsSUFDbEI7QUFBQSxFQUNELENBQUM7QUFDRjtBQUVPLE1BQU0scUJBQXFCLGtCQUFrQjtBQUFBLEVBQ25ELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsTUFDVixPQUFPLFVBQVUsd0JBQXdCLGdCQUFnQjtBQUFBLE1BQ3pELElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxpQkFBaUIsV0FBaUMsVUFBa0M7QUFDNUYsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsa0JBQWMsS0FBSyxVQUFVLE1BQU0sS0FBSyxHQUFHO0FBQUEsRUFDNUM7QUFDRDtBQUVPLE1BQU0sd0JBQXdCLGtCQUFrQjtBQUFBLEVBQ3RELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsTUFDVixPQUFPLFVBQVUseUJBQXlCLHVDQUF1QztBQUFBLE1BQ2pGLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE1BQU0sRUFBRSxJQUFJLE9BQU8sb0JBQW9CLE9BQU8sVUFBVTtBQUFBLE1BQ3hELE1BQU0sUUFBUTtBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLGlCQUFpQixXQUF1QztBQUNoRSxjQUFVLFVBQVUsQ0FBQztBQUFBLEVBQ3RCO0FBQ0Q7QUFFTyxNQUFNLHdCQUF3QixrQkFBa0I7QUFBQSxFQUN0RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLE1BQ1YsT0FBTyxVQUFVLHlCQUF5Qix1Q0FBdUM7QUFBQSxNQUNqRixJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxNQUFNLEVBQUUsSUFBSSxPQUFPLG9CQUFvQixPQUFPLFVBQVU7QUFBQSxNQUN4RCxNQUFNLFFBQVE7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUyxpQkFBaUIsV0FBdUM7QUFDaEUsY0FBVSxVQUFVLENBQUM7QUFBQSxFQUN0QjtBQUNEO0FBRU8sTUFBTSx1Q0FBdUMsa0JBQWtCO0FBQUEsRUFDckUsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWLE9BQU8sVUFBVSw2Q0FBNkMsY0FBYztBQUFBLE1BQzVFLFlBQVksU0FBUyxtREFBbUQsT0FBTztBQUFBLE1BQy9FLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLE1BQU0sRUFBRSxJQUFJLE9BQU8seUJBQXlCLE9BQU8sVUFBVTtBQUFBLE1BQzdELE1BQU0sUUFBUTtBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLGlCQUFpQixXQUFpQyxVQUFrQztBQUM1RixjQUFVLE1BQU0sTUFBTTtBQUFBLEVBQ3ZCO0FBQ0Q7QUFFTyxNQUFNLHNDQUFzQyxRQUFRO0FBQUEsRUFDMUQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWLE9BQU8sVUFBVSwyQkFBMkIseUNBQTJDO0FBQUEsTUFDdkYsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUNBLElBQUksVUFBa0M7QUFDckMsYUFBUyxJQUFJLGVBQWUsRUFBRSxPQUFPLDJCQUEyQixhQUFhLE9BQU87QUFBQSxFQUNyRjtBQUNEO0FBRU8sTUFBTSw2QkFBNkIsbUJBQW1CO0FBQUEsRUFDNUQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLFVBQVU7QUFBQSxNQUNWLE9BQU8sVUFBVSxvQ0FBb0Msd0JBQXdCO0FBQUEsTUFDN0UsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLG1CQUFtQixTQUFpQyxhQUErQixNQUFpQjtBQUM1RyxVQUFNLEVBQUUsVUFBVSxJQUFJO0FBQ3RCLFVBQU0scUJBQXFCLFVBQVUsTUFBTSxtQkFBbUIsSUFBSTtBQUNsRSxVQUFNLFFBQVEsVUFBVTtBQUN4QixnQkFBWSxDQUFDLE9BQU87QUFDbkIsaUJBQVcsS0FBSyxvQkFBb0I7QUFDbkMsY0FBTSxRQUFRLE1BQU0sU0FBUyxDQUFDLEVBQUUsSUFBSTtBQUNwQyxZQUFJLE1BQU0sU0FBUywyQkFBMkIsZ0JBQWdCLENBQUMsTUFBTSxnQkFBZ0IsQ0FBQyxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsQ0FBQyxLQUFLLENBQUMsVUFBVSwrQkFBK0IsSUFBSSxNQUFNLEVBQUUsZUFBZTtBQUM3TCxnQkFBTTtBQUFBLFlBQ0w7QUFBQSxZQUNBLE1BQ0UsZUFBZSxHQUFHLElBQUksRUFDdEIsZUFBZSxHQUFHLE1BQU0sSUFBSTtBQUFBLFlBQzlCO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxVQUFVLDhCQUE4QixNQUFNLGNBQWMsQ0FBQyxDQUFDO0FBQUEsUUFDckU7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxFQUFFLFNBQVMsS0FBSztBQUFBLEVBRXhCO0FBQ0Q7QUFHTyxNQUFNLG9CQUFvQixtQkFBbUI7QUFBQSxFQUNuRCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osVUFBVTtBQUFBLE1BQ1YsT0FBTyxVQUFVLDJCQUEyQixnQkFBZ0I7QUFBQSxNQUM1RCxJQUFJO0FBQUEsTUFDSixjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsUUFDWDtBQUFBLFVBQ0MsU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLFVBQ2xDLFFBQVEsaUJBQWlCO0FBQUEsVUFDekIsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBZSxtQkFBbUIsRUFBRSxZQUFZLGtCQUFrQixVQUFVLEdBQTJCLFVBQTRCO0FBQ2xJLFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBQ2pELFVBQU0sZ0JBQWdCLFNBQVMsSUFBSSxjQUFjO0FBRWpELFFBQUksVUFBVSxNQUFNLHdCQUF3QixJQUFJLElBQUksR0FBRztBQUN0RCxZQUFNLEVBQUUsVUFBVSxJQUFJLE1BQU0sY0FBYyxRQUFRO0FBQUEsUUFDakQsU0FBUyxTQUFTLHNEQUFzRCw2Q0FBNkMsU0FBUyxXQUFXLFNBQVMsQ0FBQztBQUFBLFFBQ25KLFFBQVEsU0FBUyxxREFBcUQsd0NBQXdDO0FBQUEsUUFDOUcsZUFBZSxTQUFTLEVBQUUsS0FBSyxxREFBcUQsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsMkJBQTJCO0FBQUEsTUFDdEosQ0FBQztBQUVELFVBQUksQ0FBQyxXQUFXO0FBQ2YsZUFBTztBQUFBLFVBQ04sWUFBWTtBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxPQUFPO0FBQ3hCLFVBQU0sY0FBYyxZQUFZLGdCQUFnQjtBQUVoRCxXQUFPO0FBQUEsTUFDTixZQUFZO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFDRDtBQUVPLE1BQU0sNEJBQTRCLG1CQUFtQjtBQUFBLEVBQzNELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixVQUFVO0FBQUEsTUFDVixPQUFPLFVBQVUsbUNBQW1DLG9DQUFvQztBQUFBLE1BQ3hGLElBQUk7QUFBQSxNQUNKLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxRQUNYO0FBQUEsVUFDQyxTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBO0FBQUEsVUFFakQsUUFBUSxpQkFBaUIsbUJBQW1CO0FBQUEsVUFDNUMsTUFBTTtBQUFBLFFBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVMsbUJBQW1CLEVBQUUsVUFBVSxHQUEyQixVQUE0QjtBQUM5RixVQUFNLGtCQUFrQixVQUFVLHFCQUFxQixPQUFPLGVBQWU7QUFHN0UsUUFBSSxpQkFBaUI7QUFDcEIsZ0JBQVUscUJBQXFCLE9BQU8sTUFBTTtBQUFBLElBQzdDLE9BQU87QUFDTixnQkFBVSxxQkFBcUIsT0FBTyxNQUFNO0FBQUEsSUFDN0M7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIklSZWxheGVkT3BlbkFyZ3MiXQp9Cg==
