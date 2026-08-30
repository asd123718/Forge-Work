import { IBulkEditService, ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ActiveEditorContext } from "../../../../common/contextkeys.js";
import { SideBySideDiffElementViewModel } from "./diffElementViewModel.js";
import { NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY, NOTEBOOK_DIFF_CELL_INPUT, NOTEBOOK_DIFF_CELL_PROPERTY, NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED, NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS, NOTEBOOK_DIFF_ITEM_DIFF_STATE, NOTEBOOK_DIFF_ITEM_KIND, NOTEBOOK_DIFF_METADATA, NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN } from "./notebookDiffEditorBrowser.js";
import { NotebookTextDiffEditor } from "./notebookDiffEditor.js";
import { nextChangeIcon, openAsTextIcon, previousChangeIcon, renderOutputIcon, revertIcon, toggleWhitespace } from "../notebookIcons.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../../common/editor.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { CellEditType, NOTEBOOK_DIFF_EDITOR_ID } from "../../common/notebookCommon.js";
import { ITextResourceConfigurationService } from "../../../../../editor/common/services/textResourceConfiguration.js";
import { NotebookMultiTextDiffEditor } from "./notebookMultiDiffEditor.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { TextEditorSelectionRevealType } from "../../../../../platform/editor/common/editor.js";
import product from "../../../../../platform/product/common/product.js";
import { ctxHasEditorModification, ctxHasRequestInProgress } from "../../../chat/browser/chatEditing/chatEditingEditorContextKeys.js";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.diff.openFile",
      icon: Codicon.goToFile,
      title: localize2("notebook.diff.openFile", "Open File"),
      precondition: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
      menu: [{
        id: MenuId.EditorTitle,
        group: "navigation",
        when: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID))
      }]
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const activeEditor = editorService.activeEditorPane;
    if (!activeEditor) {
      return;
    }
    if (activeEditor instanceof NotebookTextDiffEditor || activeEditor instanceof NotebookMultiTextDiffEditor) {
      const diffEditorInput = activeEditor.input;
      const resource = diffEditorInput.modified.resource;
      await editorService.openEditor({ resource });
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.diff.cell.toggleCollapseUnchangedRegions",
      title: localize2("notebook.diff.cell.toggleCollapseUnchangedRegions", "Toggle Collapse Unchanged Regions"),
      icon: Codicon.map,
      toggled: ContextKeyExpr.has("config.diffEditor.hideUnchangedRegions.enabled"),
      precondition: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID),
      menu: {
        id: MenuId.EditorTitle,
        group: "navigation",
        when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
      }
    });
  }
  run(accessor, ...args) {
    const configurationService = accessor.get(IConfigurationService);
    const newValue = !configurationService.getValue("diffEditor.hideUnchangedRegions.enabled");
    configurationService.updateValue("diffEditor.hideUnchangedRegions.enabled", newValue);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.diff.switchToText",
      icon: openAsTextIcon,
      title: localize2("notebook.diff.switchToText", "Open Text Diff Editor"),
      precondition: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
      menu: [{
        id: MenuId.EditorTitle,
        group: "navigation",
        when: ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID))
      }]
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const activeEditor = editorService.activeEditorPane;
    if (!activeEditor) {
      return;
    }
    if (activeEditor instanceof NotebookTextDiffEditor || activeEditor instanceof NotebookMultiTextDiffEditor) {
      const diffEditorInput = activeEditor.input;
      await editorService.openEditor(
        {
          original: { resource: diffEditorInput.original.resource },
          modified: { resource: diffEditorInput.resource },
          label: diffEditorInput.getName(),
          options: {
            preserveFocus: false,
            override: DEFAULT_EDITOR_ASSOCIATION.id
          }
        }
      );
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.diffEditor.showUnchangedCells",
      title: localize2("showUnchangedCells", "Show Unchanged Cells"),
      icon: Codicon.unfold,
      precondition: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key)),
      menu: {
        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key), ContextKeyExpr.equals(NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN.key, true)),
        id: MenuId.EditorTitle,
        order: 22,
        group: "navigation"
      }
    });
  }
  run(accessor, ...args) {
    const activeEditor = accessor.get(IEditorService).activeEditorPane;
    if (!activeEditor) {
      return;
    }
    if (activeEditor instanceof NotebookMultiTextDiffEditor) {
      activeEditor.showUnchanged();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.diffEditor.hideUnchangedCells",
      title: localize2("hideUnchangedCells", "Hide Unchanged Cells"),
      icon: Codicon.fold,
      precondition: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key)),
      menu: {
        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.has(NOTEBOOK_DIFF_HAS_UNCHANGED_CELLS.key), ContextKeyExpr.equals(NOTEBOOK_DIFF_UNCHANGED_CELLS_HIDDEN.key, false)),
        id: MenuId.EditorTitle,
        order: 22,
        group: "navigation"
      }
    });
  }
  run(accessor, ...args) {
    const activeEditor = accessor.get(IEditorService).activeEditorPane;
    if (!activeEditor) {
      return;
    }
    if (activeEditor instanceof NotebookMultiTextDiffEditor) {
      activeEditor.hideUnchanged();
    }
  }
});
registerAction2(class GoToFileAction extends Action2 {
  constructor() {
    super({
      id: "notebook.diffEditor.2.goToCell",
      title: localize2("goToCell", "Go To Cell"),
      icon: Codicon.goToFile,
      menu: {
        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, "Cell"), ContextKeyExpr.notEquals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, "delete")),
        id: MenuId.MultiDiffEditorFileToolbar,
        order: 0,
        group: "navigation"
      }
    });
  }
  async run(accessor, ...args) {
    const uri = args[0];
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
      return;
    }
    await editorService.openEditor({
      resource: uri,
      options: {
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
      }
    });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.revertMetadata",
        title: localize("notebook.diff.revertMetadata", "Revert Notebook Metadata"),
        icon: revertIcon,
        f1: false,
        menu: {
          id: MenuId.NotebookDiffDocumentMetadata,
          when: NOTEBOOK_DIFF_METADATA
        },
        precondition: NOTEBOOK_DIFF_METADATA
      }
    );
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof NotebookTextDiffEditor)) {
      return;
    }
    context.modifiedDocumentTextModel.applyEdits([{
      editType: CellEditType.DocumentMetadata,
      metadata: context.originalMetadata.metadata
    }], true, void 0, () => void 0, void 0, true);
  }
});
const revertInput = localize("notebook.diff.cell.revertInput", "Revert Input");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.diffEditor.2.cell.revertInput",
      title: revertInput,
      icon: revertIcon,
      menu: {
        when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, "Cell"), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, "modified")),
        id: MenuId.MultiDiffEditorFileToolbar,
        order: 2,
        group: "navigation"
      }
    });
  }
  async run(accessor, ...args) {
    const uri = args[0];
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
      return;
    }
    const item = activeEditorPane.getDiffElementViewModel(uri);
    if (item && item instanceof SideBySideDiffElementViewModel) {
      const modified = item.modified;
      const original = item.original;
      if (!original || !modified) {
        return;
      }
      const bulkEditService = accessor.get(IBulkEditService);
      await bulkEditService.apply([
        new ResourceTextEdit(modified.uri, { range: modified.textModel.getFullModelRange(), text: original.textModel.getValue() })
      ], { quotableLabel: "Revert Notebook Cell Content Change" });
    }
  }
});
const revertOutputs = localize("notebook.diff.cell.revertOutputs", "Revert Outputs");
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diffEditor.2.cell.revertOutputs",
        title: revertOutputs,
        icon: revertIcon,
        f1: false,
        menu: {
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, "Output"), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, "modified")),
          id: MenuId.MultiDiffEditorFileToolbar,
          order: 2,
          group: "navigation"
        }
      }
    );
  }
  async run(accessor, ...args) {
    const uri = args[0];
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
      return;
    }
    const item = activeEditorPane.getDiffElementViewModel(uri);
    if (item && item instanceof SideBySideDiffElementViewModel) {
      const original = item.original;
      const modifiedCellIndex = item.modifiedDocument.cells.findIndex((cell) => cell.handle === item.modified.handle);
      if (modifiedCellIndex === -1) {
        return;
      }
      item.mainDocumentTextModel.applyEdits([{
        editType: CellEditType.Output,
        index: modifiedCellIndex,
        outputs: original.outputs
      }], true, void 0, () => void 0, void 0, true);
    }
  }
});
const revertMetadata = localize("notebook.diff.cell.revertMetadata", "Revert Metadata");
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diffEditor.2.cell.revertMetadata",
        title: revertMetadata,
        icon: revertIcon,
        f1: false,
        menu: {
          when: ContextKeyExpr.and(ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_KIND.key, "Metadata"), ContextKeyExpr.equals(NOTEBOOK_DIFF_ITEM_DIFF_STATE.key, "modified")),
          id: MenuId.MultiDiffEditorFileToolbar,
          order: 2,
          group: "navigation"
        }
      }
    );
  }
  async run(accessor, ...args) {
    const uri = args[0];
    const editorService = accessor.get(IEditorService);
    const activeEditorPane = editorService.activeEditorPane;
    if (!(activeEditorPane instanceof NotebookMultiTextDiffEditor)) {
      return;
    }
    const item = activeEditorPane.getDiffElementViewModel(uri);
    if (item && item instanceof SideBySideDiffElementViewModel) {
      const original = item.original;
      const modifiedCellIndex = item.modifiedDocument.cells.findIndex((cell) => cell.handle === item.modified.handle);
      if (modifiedCellIndex === -1) {
        return;
      }
      item.mainDocumentTextModel.applyEdits([{
        editType: CellEditType.Metadata,
        index: modifiedCellIndex,
        metadata: original.metadata
      }], true, void 0, () => void 0, void 0, true);
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.cell.revertMetadata",
        title: revertMetadata,
        icon: revertIcon,
        f1: false,
        menu: {
          id: MenuId.NotebookDiffCellMetadataTitle,
          when: NOTEBOOK_DIFF_CELL_PROPERTY
        },
        precondition: NOTEBOOK_DIFF_CELL_PROPERTY
      }
    );
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    if (!(context instanceof SideBySideDiffElementViewModel)) {
      return;
    }
    const original = context.original;
    const modified = context.modified;
    const modifiedCellIndex = context.mainDocumentTextModel.cells.indexOf(modified.textModel);
    if (modifiedCellIndex === -1) {
      return;
    }
    const rawEdits = [{ editType: CellEditType.Metadata, index: modifiedCellIndex, metadata: original.metadata }];
    if (context.original.language && context.modified.language !== context.original.language) {
      rawEdits.push({ editType: CellEditType.CellLanguage, index: modifiedCellIndex, language: context.original.language });
    }
    context.modifiedDocument.applyEdits(rawEdits, true, void 0, () => void 0, void 0, true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.cell.switchOutputRenderingStyleToText",
        title: localize("notebook.diff.cell.switchOutputRenderingStyleToText", "Switch Output Rendering"),
        icon: renderOutputIcon,
        f1: false,
        menu: {
          id: MenuId.NotebookDiffCellOutputsTitle,
          when: NOTEBOOK_DIFF_CELL_PROPERTY_EXPANDED
        }
      }
    );
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    context.renderOutput = !context.renderOutput;
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.cell.revertOutputs",
        title: localize("notebook.diff.cell.revertOutputs", "Revert Outputs"),
        icon: revertIcon,
        f1: false,
        menu: {
          id: MenuId.NotebookDiffCellOutputsTitle,
          when: NOTEBOOK_DIFF_CELL_PROPERTY
        },
        precondition: NOTEBOOK_DIFF_CELL_PROPERTY
      }
    );
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    if (!(context instanceof SideBySideDiffElementViewModel)) {
      return;
    }
    const original = context.original;
    const modified = context.modified;
    const modifiedCellIndex = context.mainDocumentTextModel.cells.indexOf(modified.textModel);
    if (modifiedCellIndex === -1) {
      return;
    }
    context.mainDocumentTextModel.applyEdits([{
      editType: CellEditType.Output,
      index: modifiedCellIndex,
      outputs: original.outputs
    }], true, void 0, () => void 0, void 0, true);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.toggle.diff.cell.ignoreTrimWhitespace",
        title: localize("ignoreTrimWhitespace.label", "Show Leading/Trailing Whitespace Differences"),
        icon: toggleWhitespace,
        f1: false,
        menu: {
          id: MenuId.NotebookDiffCellInputTitle,
          when: NOTEBOOK_DIFF_CELL_INPUT,
          order: 1
        },
        precondition: NOTEBOOK_DIFF_CELL_INPUT,
        toggled: ContextKeyExpr.equals(NOTEBOOK_DIFF_CELL_IGNORE_WHITESPACE_KEY, false)
      }
    );
  }
  run(accessor, context) {
    const cell = context;
    if (!cell?.modified) {
      return;
    }
    const uri = cell.modified.uri;
    const configService = accessor.get(ITextResourceConfigurationService);
    const key = "diffEditor.ignoreTrimWhitespace";
    const val = configService.getValue(uri, key);
    configService.updateValue(uri, key, !val);
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.cell.revertInput",
        title: revertInput,
        icon: revertIcon,
        f1: false,
        menu: {
          id: MenuId.NotebookDiffCellInputTitle,
          when: NOTEBOOK_DIFF_CELL_INPUT,
          order: 2
        },
        precondition: NOTEBOOK_DIFF_CELL_INPUT
      }
    );
  }
  run(accessor, context) {
    if (!context) {
      return;
    }
    const original = context.original;
    const modified = context.modified;
    if (!original || !modified) {
      return;
    }
    const bulkEditService = accessor.get(IBulkEditService);
    return bulkEditService.apply([
      new ResourceTextEdit(modified.uri, { range: modified.textModel.getFullModelRange(), text: original.textModel.getValue() })
    ], { quotableLabel: "Revert Notebook Cell Content Change" });
  }
});
class ToggleRenderAction extends Action2 {
  constructor(id, title, precondition, toggled, order, toggleOutputs, toggleMetadata) {
    super({
      id,
      title,
      precondition,
      menu: [{
        id: MenuId.EditorTitle,
        group: "notebook",
        when: precondition,
        order
      }],
      toggled
    });
    this.toggleOutputs = toggleOutputs;
    this.toggleMetadata = toggleMetadata;
  }
  async run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    if (this.toggleOutputs !== void 0) {
      const oldValue = configurationService.getValue("notebook.diff.ignoreOutputs");
      configurationService.updateValue("notebook.diff.ignoreOutputs", !oldValue);
    }
    if (this.toggleMetadata !== void 0) {
      const oldValue = configurationService.getValue("notebook.diff.ignoreMetadata");
      configurationService.updateValue("notebook.diff.ignoreMetadata", !oldValue);
    }
  }
}
registerAction2(class extends ToggleRenderAction {
  constructor() {
    super(
      "notebook.diff.showOutputs",
      localize2("notebook.diff.showOutputs", "Show Outputs Differences"),
      ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
      ContextKeyExpr.notEquals("config.notebook.diff.ignoreOutputs", true),
      2,
      true,
      void 0
    );
  }
});
registerAction2(class extends ToggleRenderAction {
  constructor() {
    super(
      "notebook.diff.showMetadata",
      localize2("notebook.diff.showMetadata", "Show Metadata Differences"),
      ContextKeyExpr.or(ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID), ActiveEditorContext.isEqualTo(NotebookMultiTextDiffEditor.ID)),
      ContextKeyExpr.notEquals("config.notebook.diff.ignoreMetadata", true),
      1,
      void 0,
      true
    );
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.action.previous",
        title: localize("notebook.diff.action.previous.title", "Show Previous Change"),
        icon: previousChangeIcon,
        f1: false,
        keybinding: {
          primary: KeyMod.Shift | KeyMod.Alt | KeyCode.F3,
          weight: KeybindingWeight.WorkbenchContrib,
          when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
        },
        menu: {
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
        }
      }
    );
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    if (editorService.activeEditorPane?.getId() !== NOTEBOOK_DIFF_EDITOR_ID) {
      return;
    }
    const editor = editorService.activeEditorPane.getControl();
    editor?.previousChange();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.action.next",
        title: localize("notebook.diff.action.next.title", "Show Next Change"),
        icon: nextChangeIcon,
        f1: false,
        keybinding: {
          primary: KeyMod.Alt | KeyCode.F3,
          weight: KeybindingWeight.WorkbenchContrib,
          when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
        },
        menu: {
          id: MenuId.EditorTitle,
          group: "navigation",
          when: ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID)
        }
      }
    );
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    if (editorService.activeEditorPane?.getId() !== NOTEBOOK_DIFF_EDITOR_ID) {
      return;
    }
    const editor = editorService.activeEditorPane.getControl();
    editor?.nextChange();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super(
      {
        id: "notebook.diff.inline.toggle",
        title: localize("notebook.diff.inline.toggle.title", "Toggle Inline View"),
        menu: {
          id: MenuId.EditorTitle,
          group: "1_diff",
          order: 10,
          when: ContextKeyExpr.and(
            ActiveEditorContext.isEqualTo(NotebookTextDiffEditor.ID),
            ContextKeyExpr.equals("config.notebook.diff.experimental.toggleInline", true),
            ctxHasEditorModification.negate(),
            ctxHasRequestInProgress.negate()
          )
        }
      }
    );
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    if (editorService.activeEditorPane?.getId() !== NOTEBOOK_DIFF_EDITOR_ID) {
      return;
    }
    const editor = editorService.activeEditorPane.getControl();
    editor?.toggleInlineView();
  }
});
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "notebook",
  order: 100,
  type: "object",
  "properties": {
    "notebook.diff.ignoreMetadata": {
      type: "boolean",
      default: false,
      markdownDescription: localize("notebook.diff.ignoreMetadata", "Hide Metadata Differences")
    },
    "notebook.diff.ignoreOutputs": {
      type: "boolean",
      default: false,
      markdownDescription: localize("notebook.diff.ignoreOutputs", "Hide Outputs Differences")
    },
    "notebook.diff.experimental.toggleInline": {
      type: "boolean",
      default: typeof product.quality === "string" && product.quality !== "stable",
      // only enable as default in insiders
      markdownDescription: localize("notebook.diff.toggleInline", "Enable the command to toggle the experimental notebook inline diff editor.")
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxkaWZmXFxub3RlYm9va0RpZmZBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBDb250ZXh0S2V5RXhwcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBEaWZmRWxlbWVudENlbGxWaWV3TW9kZWxCYXNlLCBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFWaWV3TW9kZWwsIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCB9IGZyb20gJy4vZGlmZkVsZW1lbnRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rVGV4dERpZmZFZGl0b3IsIE5PVEVCT09LX0RJRkZfQ0VMTF9JR05PUkVfV0hJVEVTUEFDRV9LRVksIE5PVEVCT09LX0RJRkZfQ0VMTF9JTlBVVCwgTk9URUJPT0tfRElGRl9DRUxMX1BST1BFUlRZLCBOT1RFQk9PS19ESUZGX0NFTExfUFJPUEVSVFlfRVhQQU5ERUQsIE5PVEVCT09LX0RJRkZfSEFTX1VOQ0hBTkdFRF9DRUxMUywgTk9URUJPT0tfRElGRl9JVEVNX0RJRkZfU1RBVEUsIE5PVEVCT09LX0RJRkZfSVRFTV9LSU5ELCBOT1RFQk9PS19ESUZGX01FVEFEQVRBLCBOT1RFQk9PS19ESUZGX1VOQ0hBTkdFRF9DRUxMU19ISURERU4gfSBmcm9tICcuL25vdGVib29rRGlmZkVkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0RGlmZkVkaXRvciB9IGZyb20gJy4vbm90ZWJvb2tEaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rRGlmZkVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IG5leHRDaGFuZ2VJY29uLCBvcGVuQXNUZXh0SWNvbiwgcHJldmlvdXNDaGFuZ2VJY29uLCByZW5kZXJPdXRwdXRJY29uLCByZXZlcnRJY29uLCB0b2dnbGVXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb21tYW5kQWN0aW9uVGl0bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBJQ2VsbEVkaXRPcGVyYXRpb24sIE5PVEVCT09LX0RJRkZfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va011bHRpVGV4dERpZmZFZGl0b3IgfSBmcm9tICcuL25vdGVib29rTXVsdGlEaWZmRWRpdG9yLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSwgdHlwZSBJVGV4dEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbiwgY3R4SGFzUmVxdWVzdEluUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdFZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5cbi8vIEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKFNlYXJjaEVkaXRvckNvbnN0YW50cy5TZWFyY2hFZGl0b3JJRClcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZi5vcGVuRmlsZScsXG5cdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignbm90ZWJvb2suZGlmZi5vcGVuRmlsZScsICdPcGVuIEZpbGUnKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIub3IoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tUZXh0RGlmZkVkaXRvci5JRCksIEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvci5JRCkpLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tUZXh0RGlmZkVkaXRvci5JRCksIEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvci5JRCkpLFxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICghYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBOb3RlYm9va1RleHREaWZmRWRpdG9yIHx8IGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvcikge1xuXHRcdFx0Y29uc3QgZGlmZkVkaXRvcklucHV0ID0gYWN0aXZlRWRpdG9yLmlucHV0IGFzIE5vdGVib29rRGlmZkVkaXRvcklucHV0O1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBkaWZmRWRpdG9ySW5wdXQubW9kaWZpZWQucmVzb3VyY2U7XG5cdFx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSB9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5kaWZmLmNlbGwudG9nZ2xlQ29sbGFwc2VVbmNoYW5nZWRSZWdpb25zJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rLmRpZmYuY2VsbC50b2dnbGVDb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnMnLCAnVG9nZ2xlIENvbGxhcHNlIFVuY2hhbmdlZCBSZWdpb25zJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLm1hcCxcblx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmhhcygnY29uZmlnLmRpZmZFZGl0b3IuaGlkZVVuY2hhbmdlZFJlZ2lvbnMuZW5hYmxlZCcpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va1RleHREaWZmRWRpdG9yLklEKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0d2hlbjogQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tUZXh0RGlmZkVkaXRvci5JRCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG5ld1ZhbHVlID0gIWNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdkaWZmRWRpdG9yLmhpZGVVbmNoYW5nZWRSZWdpb25zLmVuYWJsZWQnKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnZGlmZkVkaXRvci5oaWRlVW5jaGFuZ2VkUmVnaW9ucy5lbmFibGVkJywgbmV3VmFsdWUpO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5kaWZmLnN3aXRjaFRvVGV4dCcsXG5cdFx0XHRpY29uOiBvcGVuQXNUZXh0SWNvbixcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ25vdGVib29rLmRpZmYuc3dpdGNoVG9UZXh0JywgJ09wZW4gVGV4dCBEaWZmIEVkaXRvcicpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va1RleHREaWZmRWRpdG9yLklEKSwgQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yLklEKSksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va1RleHREaWZmRWRpdG9yLklEKSwgQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yLklEKSksXG5cdFx0XHR9XVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIE5vdGVib29rVGV4dERpZmZFZGl0b3IgfHwgYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBkaWZmRWRpdG9ySW5wdXQgPSBhY3RpdmVFZGl0b3IuaW5wdXQgYXMgTm90ZWJvb2tEaWZmRWRpdG9ySW5wdXQ7XG5cblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBkaWZmRWRpdG9ySW5wdXQub3JpZ2luYWwucmVzb3VyY2UgfSxcblx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogZGlmZkVkaXRvcklucHV0LnJlc291cmNlIH0sXG5cdFx0XHRcdFx0bGFiZWw6IGRpZmZFZGl0b3JJbnB1dC5nZXROYW1lKCksXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogZmFsc2UsXG5cdFx0XHRcdFx0XHRvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdH1cblx0fVxufSk7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZkVkaXRvci5zaG93VW5jaGFuZ2VkQ2VsbHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignc2hvd1VuY2hhbmdlZENlbGxzJywgJ1Nob3cgVW5jaGFuZ2VkIENlbGxzJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLnVuZm9sZCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLmhhcyhOT1RFQk9PS19ESUZGX0hBU19VTkNIQU5HRURfQ0VMTFMua2V5KSksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va011bHRpVGV4dERpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5oYXMoTk9URUJPT0tfRElGRl9IQVNfVU5DSEFOR0VEX0NFTExTLmtleSksIENvbnRleHRLZXlFeHByLmVxdWFscyhOT1RFQk9PS19ESUZGX1VOQ0hBTkdFRF9DRUxMU19ISURERU4ua2V5LCB0cnVlKSksXG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdG9yZGVyOiAyMixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVFZGl0b3Iuc2hvd1VuY2hhbmdlZCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmRpZmZFZGl0b3IuaGlkZVVuY2hhbmdlZENlbGxzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2hpZGVVbmNoYW5nZWRDZWxscycsICdIaWRlIFVuY2hhbmdlZCBDZWxscycpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yLklEKSwgQ29udGV4dEtleUV4cHIuaGFzKE5PVEVCT09LX0RJRkZfSEFTX1VOQ0hBTkdFRF9DRUxMUy5rZXkpKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLmhhcyhOT1RFQk9PS19ESUZGX0hBU19VTkNIQU5HRURfQ0VMTFMua2V5KSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKE5PVEVCT09LX0RJRkZfVU5DSEFOR0VEX0NFTExTX0hJRERFTi5rZXksIGZhbHNlKSksXG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdG9yZGVyOiAyMixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoIWFjdGl2ZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yKSB7XG5cdFx0XHRhY3RpdmVFZGl0b3IuaGlkZVVuY2hhbmdlZCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBHb1RvRmlsZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmRpZmZFZGl0b3IuMi5nb1RvQ2VsbCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdnb1RvQ2VsbCcsICdHbyBUbyBDZWxsJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLmdvVG9GaWxlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yLklEKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKE5PVEVCT09LX0RJRkZfSVRFTV9LSU5ELmtleSwgJ0NlbGwnKSwgQ29udGV4dEtleUV4cHIubm90RXF1YWxzKE5PVEVCT09LX0RJRkZfSVRFTV9ESUZGX1NUQVRFLmtleSwgJ2RlbGV0ZScpKSxcblx0XHRcdFx0aWQ6IE1lbnVJZC5NdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhcixcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBhcmdzWzBdIGFzIFVSSTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICghKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBOb3RlYm9va011bHRpVGV4dERpZmZFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiB1cmksXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSVRleHRFZGl0b3JPcHRpb25zLFxuXHRcdH0pO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZi5yZXZlcnRNZXRhZGF0YScsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2suZGlmZi5yZXZlcnRNZXRhZGF0YScsIFwiUmV2ZXJ0IE5vdGVib29rIE1ldGFkYXRhXCIpLFxuXHRcdFx0XHRpY29uOiByZXZlcnRJY29uLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rRGlmZkRvY3VtZW50TWV0YWRhdGEsXG5cdFx0XHRcdFx0d2hlbjogTk9URUJPT0tfRElGRl9NRVRBREFUQSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBOT1RFQk9PS19ESUZGX01FVEFEQVRBXG5cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YVZpZXdNb2RlbCkge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvclBhbmUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmU7XG5cdFx0aWYgKCEoYWN0aXZlRWRpdG9yUGFuZSBpbnN0YW5jZW9mIE5vdGVib29rVGV4dERpZmZFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29udGV4dC5tb2RpZmllZERvY3VtZW50VGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuRG9jdW1lbnRNZXRhZGF0YSxcblx0XHRcdG1ldGFkYXRhOiBjb250ZXh0Lm9yaWdpbmFsTWV0YWRhdGEubWV0YWRhdGEsXG5cdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHR9XG59KTtcblxuY29uc3QgcmV2ZXJ0SW5wdXQgPSBsb2NhbGl6ZSgnbm90ZWJvb2suZGlmZi5jZWxsLnJldmVydElucHV0JywgXCJSZXZlcnQgSW5wdXRcIik7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ25vdGVib29rLmRpZmZFZGl0b3IuMi5jZWxsLnJldmVydElucHV0Jyxcblx0XHRcdHRpdGxlOiByZXZlcnRJbnB1dCxcblx0XHRcdGljb246IHJldmVydEljb24sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va011bHRpVGV4dERpZmZFZGl0b3IuSUQpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoTk9URUJPT0tfRElGRl9JVEVNX0tJTkQua2V5LCAnQ2VsbCcpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoTk9URUJPT0tfRElGRl9JVEVNX0RJRkZfU1RBVEUua2V5LCAnbW9kaWZpZWQnKSksXG5cdFx0XHRcdGlkOiBNZW51SWQuTXVsdGlEaWZmRWRpdG9yRmlsZVRvb2xiYXIsXG5cdFx0XHRcdG9yZGVyOiAyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXJpID0gYXJnc1swXSBhcyBVUkk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yUGFuZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZTtcblx0XHRpZiAoIShhY3RpdmVFZGl0b3JQYW5lIGluc3RhbmNlb2YgTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSBhY3RpdmVFZGl0b3JQYW5lLmdldERpZmZFbGVtZW50Vmlld01vZGVsKHVyaSk7XG5cdFx0aWYgKGl0ZW0gJiYgaXRlbSBpbnN0YW5jZW9mIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCkge1xuXHRcdFx0Y29uc3QgbW9kaWZpZWQgPSBpdGVtLm1vZGlmaWVkO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBpdGVtLm9yaWdpbmFsO1xuXG5cdFx0XHRpZiAoIW9yaWdpbmFsIHx8ICFtb2RpZmllZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQnVsa0VkaXRTZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGJ1bGtFZGl0U2VydmljZS5hcHBseShbXG5cdFx0XHRcdG5ldyBSZXNvdXJjZVRleHRFZGl0KG1vZGlmaWVkLnVyaSwgeyByYW5nZTogbW9kaWZpZWQudGV4dE1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksIHRleHQ6IG9yaWdpbmFsLnRleHRNb2RlbC5nZXRWYWx1ZSgpIH0pLFxuXHRcdFx0XSwgeyBxdW90YWJsZUxhYmVsOiAnUmV2ZXJ0IE5vdGVib29rIENlbGwgQ29udGVudCBDaGFuZ2UnIH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbmNvbnN0IHJldmVydE91dHB1dHMgPSBsb2NhbGl6ZSgnbm90ZWJvb2suZGlmZi5jZWxsLnJldmVydE91dHB1dHMnLCBcIlJldmVydCBPdXRwdXRzXCIpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZkVkaXRvci4yLmNlbGwucmV2ZXJ0T3V0cHV0cycsXG5cdFx0XHRcdHRpdGxlOiByZXZlcnRPdXRwdXRzLFxuXHRcdFx0XHRpY29uOiByZXZlcnRJY29uLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yLklEKSwgQ29udGV4dEtleUV4cHIuZXF1YWxzKE5PVEVCT09LX0RJRkZfSVRFTV9LSU5ELmtleSwgJ091dHB1dCcpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoTk9URUJPT0tfRElGRl9JVEVNX0RJRkZfU1RBVEUua2V5LCAnbW9kaWZpZWQnKSksXG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5NdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhcixcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBhcmdzWzBdIGFzIFVSSTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICghKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBOb3RlYm9va011bHRpVGV4dERpZmZFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IGFjdGl2ZUVkaXRvclBhbmUuZ2V0RGlmZkVsZW1lbnRWaWV3TW9kZWwodXJpKTtcblx0XHRpZiAoaXRlbSAmJiBpdGVtIGluc3RhbmNlb2YgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IGl0ZW0ub3JpZ2luYWw7XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkQ2VsbEluZGV4ID0gaXRlbS5tb2RpZmllZERvY3VtZW50LmNlbGxzLmZpbmRJbmRleChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBpdGVtLm1vZGlmaWVkLmhhbmRsZSk7XG5cdFx0XHRpZiAobW9kaWZpZWRDZWxsSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aXRlbS5tYWluRG9jdW1lbnRUZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXg6IG1vZGlmaWVkQ2VsbEluZGV4LCBvdXRwdXRzOiBvcmlnaW5hbC5vdXRwdXRzXG5cdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgcmV2ZXJ0TWV0YWRhdGEgPSBsb2NhbGl6ZSgnbm90ZWJvb2suZGlmZi5jZWxsLnJldmVydE1ldGFkYXRhJywgXCJSZXZlcnQgTWV0YWRhdGFcIik7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdub3RlYm9vay5kaWZmRWRpdG9yLjIuY2VsbC5yZXZlcnRNZXRhZGF0YScsXG5cdFx0XHRcdHRpdGxlOiByZXZlcnRNZXRhZGF0YSxcblx0XHRcdFx0aWNvbjogcmV2ZXJ0SWNvbixcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvci5JRCksIENvbnRleHRLZXlFeHByLmVxdWFscyhOT1RFQk9PS19ESUZGX0lURU1fS0lORC5rZXksICdNZXRhZGF0YScpLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoTk9URUJPT0tfRElGRl9JVEVNX0RJRkZfU1RBVEUua2V5LCAnbW9kaWZpZWQnKSksXG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5NdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhcixcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB1cmkgPSBhcmdzWzBdIGFzIFVSSTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRcdGlmICghKGFjdGl2ZUVkaXRvclBhbmUgaW5zdGFuY2VvZiBOb3RlYm9va011bHRpVGV4dERpZmZFZGl0b3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbSA9IGFjdGl2ZUVkaXRvclBhbmUuZ2V0RGlmZkVsZW1lbnRWaWV3TW9kZWwodXJpKTtcblx0XHRpZiAoaXRlbSAmJiBpdGVtIGluc3RhbmNlb2YgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKSB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IGl0ZW0ub3JpZ2luYWw7XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkQ2VsbEluZGV4ID0gaXRlbS5tb2RpZmllZERvY3VtZW50LmNlbGxzLmZpbmRJbmRleChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBpdGVtLm1vZGlmaWVkLmhhbmRsZSk7XG5cdFx0XHRpZiAobW9kaWZpZWRDZWxsSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aXRlbS5tYWluRG9jdW1lbnRUZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogbW9kaWZpZWRDZWxsSW5kZXgsIG1ldGFkYXRhOiBvcmlnaW5hbC5tZXRhZGF0YVxuXHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdH1cblx0fVxufSk7XG5cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ25vdGVib29rLmRpZmYuY2VsbC5yZXZlcnRNZXRhZGF0YScsXG5cdFx0XHRcdHRpdGxlOiByZXZlcnRNZXRhZGF0YSxcblx0XHRcdFx0aWNvbjogcmV2ZXJ0SWNvbixcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0RpZmZDZWxsTWV0YWRhdGFUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBOT1RFQk9PS19ESUZGX0NFTExfUFJPUEVSVFlcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBOT1RFQk9PS19ESUZGX0NFTExfUFJPUEVSVFlcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UpIHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIShjb250ZXh0IGluc3RhbmNlb2YgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsID0gY29udGV4dC5vcmlnaW5hbDtcblx0XHRjb25zdCBtb2RpZmllZCA9IGNvbnRleHQubW9kaWZpZWQ7XG5cblx0XHRjb25zdCBtb2RpZmllZENlbGxJbmRleCA9IGNvbnRleHQubWFpbkRvY3VtZW50VGV4dE1vZGVsLmNlbGxzLmluZGV4T2YobW9kaWZpZWQudGV4dE1vZGVsKTtcblx0XHRpZiAobW9kaWZpZWRDZWxsSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF3RWRpdHM6IElDZWxsRWRpdE9wZXJhdGlvbltdID0gW3sgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSwgaW5kZXg6IG1vZGlmaWVkQ2VsbEluZGV4LCBtZXRhZGF0YTogb3JpZ2luYWwubWV0YWRhdGEgfV07XG5cdFx0aWYgKGNvbnRleHQub3JpZ2luYWwubGFuZ3VhZ2UgJiYgY29udGV4dC5tb2RpZmllZC5sYW5ndWFnZSAhPT0gY29udGV4dC5vcmlnaW5hbC5sYW5ndWFnZSkge1xuXHRcdFx0cmF3RWRpdHMucHVzaCh7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuQ2VsbExhbmd1YWdlLCBpbmRleDogbW9kaWZpZWRDZWxsSW5kZXgsIGxhbmd1YWdlOiBjb250ZXh0Lm9yaWdpbmFsLmxhbmd1YWdlIH0pO1xuXHRcdH1cblxuXHRcdGNvbnRleHQubW9kaWZpZWREb2N1bWVudC5hcHBseUVkaXRzKHJhd0VkaXRzLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0fVxufSk7XG5cbi8vIHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuLy8gXHRjb25zdHJ1Y3RvcigpIHtcbi8vIFx0XHRzdXBlcihcbi8vIFx0XHRcdHtcbi8vIFx0XHRcdFx0aWQ6ICdub3RlYm9vay5kaWZmLmNlbGwuc3dpdGNoT3V0cHV0UmVuZGVyaW5nU3R5bGUnLFxuLy8gXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rLmRpZmYuY2VsbC5zd2l0Y2hPdXRwdXRSZW5kZXJpbmdTdHlsZScsIFwiU3dpdGNoIE91dHB1dHMgUmVuZGVyaW5nXCIpLFxuLy8gXHRcdFx0XHRpY29uOiByZW5kZXJPdXRwdXRJY29uLFxuLy8gXHRcdFx0XHRmMTogZmFsc2UsXG4vLyBcdFx0XHRcdG1lbnU6IHtcbi8vIFx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rRGlmZkNlbGxPdXRwdXRzVGl0bGVcbi8vIFx0XHRcdFx0fVxuLy8gXHRcdFx0fVxuLy8gXHRcdCk7XG4vLyBcdH1cbi8vIFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0PzogRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlKSB7XG4vLyBcdFx0aWYgKCFjb250ZXh0KSB7XG4vLyBcdFx0XHRyZXR1cm47XG4vLyBcdFx0fVxuXG4vLyBcdFx0Y29udGV4dC5yZW5kZXJPdXRwdXQgPSB0cnVlO1xuLy8gXHR9XG4vLyB9KTtcblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZi5jZWxsLnN3aXRjaE91dHB1dFJlbmRlcmluZ1N0eWxlVG9UZXh0Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9vay5kaWZmLmNlbGwuc3dpdGNoT3V0cHV0UmVuZGVyaW5nU3R5bGVUb1RleHQnLCBcIlN3aXRjaCBPdXRwdXQgUmVuZGVyaW5nXCIpLFxuXHRcdFx0XHRpY29uOiByZW5kZXJPdXRwdXRJY29uLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rRGlmZkNlbGxPdXRwdXRzVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogTk9URUJPT0tfRElGRl9DRUxMX1BST1BFUlRZX0VYUEFOREVEXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UpIHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb250ZXh0LnJlbmRlck91dHB1dCA9ICFjb250ZXh0LnJlbmRlck91dHB1dDtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdub3RlYm9vay5kaWZmLmNlbGwucmV2ZXJ0T3V0cHV0cycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2suZGlmZi5jZWxsLnJldmVydE91dHB1dHMnLCBcIlJldmVydCBPdXRwdXRzXCIpLFxuXHRcdFx0XHRpY29uOiByZXZlcnRJY29uLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rRGlmZkNlbGxPdXRwdXRzVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogTk9URUJPT0tfRElGRl9DRUxMX1BST1BFUlRZXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogTk9URUJPT0tfRElGRl9DRUxMX1BST1BFUlRZXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBEaWZmRWxlbWVudENlbGxWaWV3TW9kZWxCYXNlKSB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCEoY29udGV4dCBpbnN0YW5jZW9mIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcmlnaW5hbCA9IGNvbnRleHQub3JpZ2luYWw7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBjb250ZXh0Lm1vZGlmaWVkO1xuXG5cdFx0Y29uc3QgbW9kaWZpZWRDZWxsSW5kZXggPSBjb250ZXh0Lm1haW5Eb2N1bWVudFRleHRNb2RlbC5jZWxscy5pbmRleE9mKG1vZGlmaWVkLnRleHRNb2RlbCk7XG5cdFx0aWYgKG1vZGlmaWVkQ2VsbEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnRleHQubWFpbkRvY3VtZW50VGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LCBpbmRleDogbW9kaWZpZWRDZWxsSW5kZXgsIG91dHB1dHM6IG9yaWdpbmFsLm91dHB1dHNcblx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdub3RlYm9vay50b2dnbGUuZGlmZi5jZWxsLmlnbm9yZVRyaW1XaGl0ZXNwYWNlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpZ25vcmVUcmltV2hpdGVzcGFjZS5sYWJlbCcsIFwiU2hvdyBMZWFkaW5nL1RyYWlsaW5nIFdoaXRlc3BhY2UgRGlmZmVyZW5jZXNcIiksXG5cdFx0XHRcdGljb246IHRvZ2dsZVdoaXRlc3BhY2UsXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tEaWZmQ2VsbElucHV0VGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogTk9URUJPT0tfRElGRl9DRUxMX0lOUFVULFxuXHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IE5PVEVCT09LX0RJRkZfQ0VMTF9JTlBVVCxcblx0XHRcdFx0dG9nZ2xlZDogQ29udGV4dEtleUV4cHIuZXF1YWxzKE5PVEVCT09LX0RJRkZfQ0VMTF9JR05PUkVfV0hJVEVTUEFDRV9LRVksIGZhbHNlKSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IERpZmZFbGVtZW50Q2VsbFZpZXdNb2RlbEJhc2UpIHtcblx0XHRjb25zdCBjZWxsID0gY29udGV4dDtcblx0XHRpZiAoIWNlbGw/Lm1vZGlmaWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHVyaSA9IGNlbGwubW9kaWZpZWQudXJpO1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBrZXkgPSAnZGlmZkVkaXRvci5pZ25vcmVUcmltV2hpdGVzcGFjZSc7XG5cdFx0Y29uc3QgdmFsID0gY29uZmlnU2VydmljZS5nZXRWYWx1ZSh1cmksIGtleSk7XG5cdFx0Y29uZmlnU2VydmljZS51cGRhdGVWYWx1ZSh1cmksIGtleSwgIXZhbCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZi5jZWxsLnJldmVydElucHV0Jyxcblx0XHRcdFx0dGl0bGU6IHJldmVydElucHV0LFxuXHRcdFx0XHRpY29uOiByZXZlcnRJY29uLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rRGlmZkNlbGxJbnB1dFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IE5PVEVCT09LX0RJRkZfQ0VMTF9JTlBVVCxcblx0XHRcdFx0XHRvcmRlcjogMlxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IE5PVEVCT09LX0RJRkZfQ0VMTF9JTlBVVFxuXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ/OiBEaWZmRWxlbWVudENlbGxWaWV3TW9kZWxCYXNlKSB7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBjb250ZXh0Lm9yaWdpbmFsO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gY29udGV4dC5tb2RpZmllZDtcblxuXHRcdGlmICghb3JpZ2luYWwgfHwgIW1vZGlmaWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnVsa0VkaXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElCdWxrRWRpdFNlcnZpY2UpO1xuXHRcdHJldHVybiBidWxrRWRpdFNlcnZpY2UuYXBwbHkoW1xuXHRcdFx0bmV3IFJlc291cmNlVGV4dEVkaXQobW9kaWZpZWQudXJpLCB7IHJhbmdlOiBtb2RpZmllZC50ZXh0TW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwgdGV4dDogb3JpZ2luYWwudGV4dE1vZGVsLmdldFZhbHVlKCkgfSksXG5cdFx0XSwgeyBxdW90YWJsZUxhYmVsOiAnUmV2ZXJ0IE5vdGVib29rIENlbGwgQ29udGVudCBDaGFuZ2UnIH0pO1xuXHR9XG59KTtcblxuY2xhc3MgVG9nZ2xlUmVuZGVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcgfCBJQ29tbWFuZEFjdGlvblRpdGxlLCBwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByZXNzaW9uIHwgdW5kZWZpbmVkLCB0b2dnbGVkOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCwgb3JkZXI6IG51bWJlciwgcHJpdmF0ZSByZWFkb25seSB0b2dnbGVPdXRwdXRzPzogYm9vbGVhbiwgcHJpdmF0ZSByZWFkb25seSB0b2dnbGVNZXRhZGF0YT86IGJvb2xlYW4pIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogaWQsXG5cdFx0XHR0aXRsZSxcblx0XHRcdHByZWNvbmRpdGlvbjogcHJlY29uZGl0aW9uLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0Z3JvdXA6ICdub3RlYm9vaycsXG5cdFx0XHRcdHdoZW46IHByZWNvbmRpdGlvbixcblx0XHRcdFx0b3JkZXI6IG9yZGVyLFxuXHRcdFx0fV0sXG5cdFx0XHR0b2dnbGVkOiB0b2dnbGVkXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKHRoaXMudG9nZ2xlT3V0cHV0cyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBvbGRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdub3RlYm9vay5kaWZmLmlnbm9yZU91dHB1dHMnKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdub3RlYm9vay5kaWZmLmlnbm9yZU91dHB1dHMnLCAhb2xkVmFsdWUpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRvZ2dsZU1ldGFkYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IG9sZFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ25vdGVib29rLmRpZmYuaWdub3JlTWV0YWRhdGEnKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCdub3RlYm9vay5kaWZmLmlnbm9yZU1ldGFkYXRhJywgIW9sZFZhbHVlKTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgVG9nZ2xlUmVuZGVyQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoJ25vdGVib29rLmRpZmYuc2hvd091dHB1dHMnLFxuXHRcdFx0bG9jYWxpemUyKCdub3RlYm9vay5kaWZmLnNob3dPdXRwdXRzJywgJ1Nob3cgT3V0cHV0cyBEaWZmZXJlbmNlcycpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIub3IoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tUZXh0RGlmZkVkaXRvci5JRCksIEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvci5JRCkpLFxuXHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2suZGlmZi5pZ25vcmVPdXRwdXRzJywgdHJ1ZSksXG5cdFx0XHQyLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHVuZGVmaW5lZFxuXHRcdCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBUb2dnbGVSZW5kZXJBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcignbm90ZWJvb2suZGlmZi5zaG93TWV0YWRhdGEnLFxuXHRcdFx0bG9jYWxpemUyKCdub3RlYm9vay5kaWZmLnNob3dNZXRhZGF0YScsICdTaG93IE1ldGFkYXRhIERpZmZlcmVuY2VzJyksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va1RleHREaWZmRWRpdG9yLklEKSwgQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tNdWx0aVRleHREaWZmRWRpdG9yLklEKSksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5kaWZmLmlnbm9yZU1ldGFkYXRhJywgdHJ1ZSksXG5cdFx0XHQxLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dHJ1ZVxuXHRcdCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZi5hY3Rpb24ucHJldmlvdXMnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rLmRpZmYuYWN0aW9uLnByZXZpb3VzLnRpdGxlJywgXCJTaG93IFByZXZpb3VzIENoYW5nZVwiKSxcblx0XHRcdFx0aWNvbjogcHJldmlvdXNDaGFuZ2VJY29uLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMyxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHR3aGVuOiBBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va1RleHREaWZmRWRpdG9yLklEKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdHdoZW46IEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rVGV4dERpZmZFZGl0b3IuSUQpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRJZCgpICE9PSBOT1RFQk9PS19ESUZGX0VESVRPUl9JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5nZXRDb250cm9sKCkgYXMgSU5vdGVib29rVGV4dERpZmZFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdFx0ZWRpdG9yPy5wcmV2aW91c0NoYW5nZSgpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ25vdGVib29rLmRpZmYuYWN0aW9uLm5leHQnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rLmRpZmYuYWN0aW9uLm5leHQudGl0bGUnLCBcIlNob3cgTmV4dCBDaGFuZ2VcIiksXG5cdFx0XHRcdGljb246IG5leHRDaGFuZ2VJY29uLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5GMyxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0XHR3aGVuOiBBY3RpdmVFZGl0b3JDb250ZXh0LmlzRXF1YWxUbyhOb3RlYm9va1RleHREaWZmRWRpdG9yLklEKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdHdoZW46IEFjdGl2ZUVkaXRvckNvbnRleHQuaXNFcXVhbFRvKE5vdGVib29rVGV4dERpZmZFZGl0b3IuSUQpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRJZCgpICE9PSBOT1RFQk9PS19ESUZGX0VESVRPUl9JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5nZXRDb250cm9sKCkgYXMgSU5vdGVib29rVGV4dERpZmZFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdFx0ZWRpdG9yPy5uZXh0Q2hhbmdlKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbm90ZWJvb2suZGlmZi5pbmxpbmUudG9nZ2xlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9vay5kaWZmLmlubGluZS50b2dnbGUudGl0bGUnLCBcIlRvZ2dsZSBJbmxpbmUgVmlld1wiKSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGUsXG5cdFx0XHRcdFx0Z3JvdXA6ICcxX2RpZmYnLFxuXHRcdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oTm90ZWJvb2tUZXh0RGlmZkVkaXRvci5JRCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5kaWZmLmV4cGVyaW1lbnRhbC50b2dnbGVJbmxpbmUnLCB0cnVlKSxcblx0XHRcdFx0XHRcdGN0eEhhc0VkaXRvck1vZGlmaWNhdGlvbi5uZWdhdGUoKSwgY3R4SGFzUmVxdWVzdEluUHJvZ3Jlc3MubmVnYXRlKCkpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRJZCgpICE9PSBOT1RFQk9PS19ESUZGX0VESVRPUl9JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvciA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZS5nZXRDb250cm9sKCkgYXMgSU5vdGVib29rVGV4dERpZmZFZGl0b3IgfCB1bmRlZmluZWQ7XG5cdFx0ZWRpdG9yPy50b2dnbGVJbmxpbmVWaWV3KCk7XG5cdH1cbn0pO1xuXG5cblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHtcblx0aWQ6ICdub3RlYm9vaycsXG5cdG9yZGVyOiAxMDAsXG5cdHR5cGU6ICdvYmplY3QnLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHQnbm90ZWJvb2suZGlmZi5pZ25vcmVNZXRhZGF0YSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ25vdGVib29rLmRpZmYuaWdub3JlTWV0YWRhdGEnLCBcIkhpZGUgTWV0YWRhdGEgRGlmZmVyZW5jZXNcIilcblx0XHR9LFxuXHRcdCdub3RlYm9vay5kaWZmLmlnbm9yZU91dHB1dHMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay5kaWZmLmlnbm9yZU91dHB1dHMnLCBcIkhpZGUgT3V0cHV0cyBEaWZmZXJlbmNlc1wiKVxuXHRcdH0sXG5cdFx0J25vdGVib29rLmRpZmYuZXhwZXJpbWVudGFsLnRvZ2dsZUlubGluZSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHR5cGVvZiBwcm9kdWN0LnF1YWxpdHkgPT09ICdzdHJpbmcnICYmIHByb2R1Y3QucXVhbGl0eSAhPT0gJ3N0YWJsZScsIC8vIG9ubHkgZW5hYmxlIGFzIGRlZmF1bHQgaW4gaW5zaWRlcnNcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdub3RlYm9vay5kaWZmLnRvZ2dsZUlubGluZScsIFwiRW5hYmxlIHRoZSBjb21tYW5kIHRvIHRvZ2dsZSB0aGUgZXhwZXJpbWVudGFsIG5vdGVib29rIGlubGluZSBkaWZmIGVkaXRvci5cIilcblx0XHR9LFxuXHR9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
