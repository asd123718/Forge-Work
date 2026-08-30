var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { localize, localize2 } from "../../../../../../nls.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { KeyCode, KeyMod } from "../../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { EditorAction, registerEditorAction } from "../../../../../../editor/browser/editorExtensions.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../../editor/browser/services/bulkEditService.js";
import { EditorContextKeys } from "../../../../../../editor/common/editorContextKeys.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { FormattingMode, formatDocumentWithSelectedProvider, getDocumentFormattingEditsWithSelectedProvider } from "../../../../../../editor/contrib/format/browser/format.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Progress } from "../../../../../../platform/progress/common/progress.js";
import { NOTEBOOK_ACTIONS_CATEGORY } from "../../controller/coreActions.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { INotebookExecutionService } from "../../../common/notebookExecutionService.js";
import { NotebookSetting } from "../../../common/notebookCommon.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchContributionsExtensions } from "../../../../../common/contributions.js";
import { INotebookService } from "../../../common/notebookService.js";
import { CodeActionParticipantUtils } from "../saveParticipants/saveParticipants.js";
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "notebook.format",
      title: localize2("format.title", "Format Notebook"),
      category: NOTEBOOK_ACTIONS_CATEGORY,
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE),
      keybinding: {
        when: EditorContextKeys.editorTextFocus.toNegated(),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI },
        weight: KeybindingWeight.WorkbenchContrib
      },
      f1: true,
      menu: {
        id: MenuId.EditorContext,
        when: ContextKeyExpr.and(EditorContextKeys.inCompositeEditor, EditorContextKeys.hasDocumentFormattingProvider),
        group: "1_modification",
        order: 1.3
      }
    });
  }
  async run(accessor) {
    const editorService = accessor.get(IEditorService);
    const textModelService = accessor.get(ITextModelService);
    const editorWorkerService = accessor.get(IEditorWorkerService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const bulkEditService = accessor.get(IBulkEditService);
    const instantiationService = accessor.get(IInstantiationService);
    const editor = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!editor || !editor.hasModel()) {
      return;
    }
    const notebook = editor.textModel;
    const formatApplied = await instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, Progress.None, CancellationToken.None);
    const disposable = new DisposableStore();
    try {
      if (!formatApplied) {
        const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
          const ref = await textModelService.createModelReference(cell.uri);
          disposable.add(ref);
          const model = ref.object.textEditorModel;
          const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
            editorWorkerService,
            languageFeaturesService,
            model,
            FormattingMode.Explicit,
            CancellationToken.None
          );
          const edits = [];
          if (formatEdits) {
            for (const edit of formatEdits) {
              edits.push(new ResourceTextEdit(model.uri, edit, model.getVersionId()));
            }
            return edits;
          }
          return [];
        }));
        await bulkEditService.apply(
          /* edit */
          allCellEdits.flat(),
          { label: localize("label", "Format Notebook"), code: "undoredo.formatNotebook" }
        );
      }
    } finally {
      disposable.dispose();
    }
  }
});
registerEditorAction(class FormatCellAction extends EditorAction {
  constructor() {
    super({
      id: "notebook.formatCell",
      label: localize2("formatCell.label", "Format Cell"),
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, EditorContextKeys.inCompositeEditor, EditorContextKeys.writable, EditorContextKeys.hasDocumentFormattingProvider),
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.editorTextFocus),
        primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyF,
        linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI },
        weight: KeybindingWeight.EditorContrib
      },
      contextMenuOpts: {
        group: "1_modification",
        order: 1.301
      }
    });
  }
  async run(accessor, editor) {
    if (editor.hasModel()) {
      const instaService = accessor.get(IInstantiationService);
      await instaService.invokeFunction(formatDocumentWithSelectedProvider, editor, FormattingMode.Explicit, Progress.None, CancellationToken.None, true);
    }
  }
});
let FormatOnCellExecutionParticipant = class {
  constructor(bulkEditService, languageFeaturesService, textModelService, editorWorkerService, configurationService, _notebookService) {
    this.bulkEditService = bulkEditService;
    this.languageFeaturesService = languageFeaturesService;
    this.textModelService = textModelService;
    this.editorWorkerService = editorWorkerService;
    this.configurationService = configurationService;
    this._notebookService = _notebookService;
  }
  async onWillExecuteCell(executions) {
    const enabled = this.configurationService.getValue(NotebookSetting.formatOnCellExecution);
    if (!enabled) {
      return;
    }
    const disposable = new DisposableStore();
    try {
      const allCellEdits = await Promise.all(executions.map(async (cellExecution) => {
        const nbModel = this._notebookService.getNotebookTextModel(cellExecution.notebook);
        if (!nbModel) {
          return [];
        }
        let activeCell;
        for (const cell of nbModel.cells) {
          if (cell.handle === cellExecution.cellHandle) {
            activeCell = cell;
            break;
          }
        }
        if (!activeCell) {
          return [];
        }
        const ref = await this.textModelService.createModelReference(activeCell.uri);
        disposable.add(ref);
        const model = ref.object.textEditorModel;
        const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
          this.editorWorkerService,
          this.languageFeaturesService,
          model,
          FormattingMode.Silent,
          CancellationToken.None
        );
        const edits = [];
        if (formatEdits) {
          edits.push(...formatEdits.map((edit) => new ResourceTextEdit(model.uri, edit, model.getVersionId())));
          return edits;
        }
        return [];
      }));
      await this.bulkEditService.apply(
        /* edit */
        allCellEdits.flat(),
        { label: localize("formatCells.label", "Format Cells"), code: "undoredo.notebooks.onWillExecuteFormat" }
      );
    } finally {
      disposable.dispose();
    }
  }
};
FormatOnCellExecutionParticipant = __decorateClass([
  __decorateParam(0, IBulkEditService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IEditorWorkerService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, INotebookService)
], FormatOnCellExecutionParticipant);
let CellExecutionParticipantsContribution = class extends Disposable {
  constructor(instantiationService, notebookExecutionService) {
    super();
    this.instantiationService = instantiationService;
    this.notebookExecutionService = notebookExecutionService;
    this.registerKernelExecutionParticipants();
  }
  registerKernelExecutionParticipants() {
    this._register(this.notebookExecutionService.registerExecutionParticipant(this.instantiationService.createInstance(FormatOnCellExecutionParticipant)));
  }
};
CellExecutionParticipantsContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, INotebookExecutionService)
], CellExecutionParticipantsContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(CellExecutionParticipantsContribution, LifecyclePhase.Restored);
export {
  CellExecutionParticipantsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxmb3JtYXRcXGZvcm1hdHRpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUJ1bGtFZGl0U2VydmljZSwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nTW9kZSwgZm9ybWF0RG9jdW1lbnRXaXRoU2VsZWN0ZWRQcm92aWRlciwgZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNXaXRoU2VsZWN0ZWRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgTk9URUJPT0tfQUNUSU9OU19DQVRFR09SWSB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsRXhlY3V0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDZWxsRXhlY3V0aW9uUGFydGljaXBhbnQsIElOb3RlYm9va0V4ZWN1dGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hDb250cmlidXRpb25zRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25QYXJ0aWNpcGFudFV0aWxzIH0gZnJvbSAnLi4vc2F2ZVBhcnRpY2lwYW50cy9zYXZlUGFydGljaXBhbnRzLmpzJztcblxuLy8gZm9ybWF0IG5vdGVib29rXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5mb3JtYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9ybWF0LnRpdGxlJywgJ0Zvcm1hdCBOb3RlYm9vaycpLFxuXHRcdFx0Y2F0ZWdvcnk6IE5PVEVCT09LX0FDVElPTlNfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMudG9OZWdhdGVkKCksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUYsXG5cdFx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlJIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yQ29udGV4dCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmluQ29tcG9zaXRlRWRpdG9yLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlciksXG5cdFx0XHRcdGdyb3VwOiAnMV9tb2RpZmljYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMS4zXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXh0TW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JXb3JrZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGJ1bGtFZGl0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQnVsa0VkaXRTZXJ2aWNlKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGlmICghZWRpdG9yIHx8ICFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vdGVib29rID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdGNvbnN0IGZvcm1hdEFwcGxpZWQ6IGJvb2xlYW4gPSBhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihDb2RlQWN0aW9uUGFydGljaXBhbnRVdGlscy5jaGVja0FuZFJ1bkZvcm1hdENvZGVBY3Rpb24sIG5vdGVib29rLCBQcm9ncmVzcy5Ob25lLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghZm9ybWF0QXBwbGllZCkge1xuXHRcdFx0XHRjb25zdCBhbGxDZWxsRWRpdHMgPSBhd2FpdCBQcm9taXNlLmFsbChub3RlYm9vay5jZWxscy5tYXAoYXN5bmMgY2VsbCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjZWxsLnVyaSk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5hZGQocmVmKTtcblxuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdFx0XHRjb25zdCBmb3JtYXRFZGl0cyA9IGF3YWl0IGdldERvY3VtZW50Rm9ybWF0dGluZ0VkaXRzV2l0aFNlbGVjdGVkUHJvdmlkZXIoXG5cdFx0XHRcdFx0XHRlZGl0b3JXb3JrZXJTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdEZvcm1hdHRpbmdNb2RlLkV4cGxpY2l0LFxuXHRcdFx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHRjb25zdCBlZGl0czogUmVzb3VyY2VUZXh0RWRpdFtdID0gW107XG5cblx0XHRcdFx0XHRpZiAoZm9ybWF0RWRpdHMpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBmb3JtYXRFZGl0cykge1xuXHRcdFx0XHRcdFx0XHRlZGl0cy5wdXNoKG5ldyBSZXNvdXJjZVRleHRFZGl0KG1vZGVsLnVyaSwgZWRpdCwgbW9kZWwuZ2V0VmVyc2lvbklkKCkpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGVkaXRzO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGF3YWl0IGJ1bGtFZGl0U2VydmljZS5hcHBseSgvKiBlZGl0ICovYWxsQ2VsbEVkaXRzLmZsYXQoKSwgeyBsYWJlbDogbG9jYWxpemUoJ2xhYmVsJywgXCJGb3JtYXQgTm90ZWJvb2tcIiksIGNvZGU6ICd1bmRvcmVkby5mb3JtYXROb3RlYm9vaycsIH0pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyBmb3JtYXQgY2VsbFxucmVnaXN0ZXJFZGl0b3JBY3Rpb24oY2xhc3MgRm9ybWF0Q2VsbEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2suZm9ybWF0Q2VsbCcsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUyKCdmb3JtYXRDZWxsLmxhYmVsJywgXCJGb3JtYXQgQ2VsbFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX0VESVRPUl9FRElUQUJMRSwgRWRpdG9yQ29udGV4dEtleXMuaW5Db21wb3NpdGVFZGl0b3IsIEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLCBFZGl0b3JDb250ZXh0S2V5cy5oYXNEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlciksXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuS2V5Rixcblx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUkgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRjb250ZXh0TWVudU9wdHM6IHtcblx0XHRcdFx0Z3JvdXA6ICcxX21vZGlmaWNhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLjMwMVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdGF3YWl0IGluc3RhU2VydmljZS5pbnZva2VGdW5jdGlvbihmb3JtYXREb2N1bWVudFdpdGhTZWxlY3RlZFByb3ZpZGVyLCBlZGl0b3IsIEZvcm1hdHRpbmdNb2RlLkV4cGxpY2l0LCBQcm9ncmVzcy5Ob25lLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCB0cnVlKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5jbGFzcyBGb3JtYXRPbkNlbGxFeGVjdXRpb25QYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElDZWxsRXhlY3V0aW9uUGFydGljaXBhbnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUJ1bGtFZGl0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGJ1bGtFZGl0U2VydmljZTogSUJ1bGtFZGl0U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUVkaXRvcldvcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JXb3JrZXJTZXJ2aWNlOiBJRWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgb25XaWxsRXhlY3V0ZUNlbGwoZXhlY3V0aW9uczogSU5vdGVib29rQ2VsbEV4ZWN1dGlvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuZm9ybWF0T25DZWxsRXhlY3V0aW9uKTtcblx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhbGxDZWxsRWRpdHMgPSBhd2FpdCBQcm9taXNlLmFsbChleGVjdXRpb25zLm1hcChhc3luYyBjZWxsRXhlY3V0aW9uID0+IHtcblx0XHRcdFx0Y29uc3QgbmJNb2RlbCA9IHRoaXMuX25vdGVib29rU2VydmljZS5nZXROb3RlYm9va1RleHRNb2RlbChjZWxsRXhlY3V0aW9uLm5vdGVib29rKTtcblx0XHRcdFx0aWYgKCFuYk1vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBhY3RpdmVDZWxsO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgbmJNb2RlbC5jZWxscykge1xuXHRcdFx0XHRcdGlmIChjZWxsLmhhbmRsZSA9PT0gY2VsbEV4ZWN1dGlvbi5jZWxsSGFuZGxlKSB7XG5cdFx0XHRcdFx0XHRhY3RpdmVDZWxsID0gY2VsbDtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWFjdGl2ZUNlbGwpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoYWN0aXZlQ2VsbC51cmkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmFkZChyZWYpO1xuXG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdFx0Y29uc3QgZm9ybWF0RWRpdHMgPSBhd2FpdCBnZXREb2N1bWVudEZvcm1hdHRpbmdFZGl0c1dpdGhTZWxlY3RlZFByb3ZpZGVyKFxuXHRcdFx0XHRcdHRoaXMuZWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRcdFx0XHR0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRcdEZvcm1hdHRpbmdNb2RlLlNpbGVudCxcblx0XHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0Y29uc3QgZWRpdHM6IFJlc291cmNlVGV4dEVkaXRbXSA9IFtdO1xuXG5cdFx0XHRcdGlmIChmb3JtYXRFZGl0cykge1xuXHRcdFx0XHRcdGVkaXRzLnB1c2goLi4uZm9ybWF0RWRpdHMubWFwKGVkaXQgPT4gbmV3IFJlc291cmNlVGV4dEVkaXQobW9kZWwudXJpLCBlZGl0LCBtb2RlbC5nZXRWZXJzaW9uSWQoKSkpKTtcblx0XHRcdFx0XHRyZXR1cm4gZWRpdHM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IHRoaXMuYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KC8qIGVkaXQgKi9hbGxDZWxsRWRpdHMuZmxhdCgpLCB7IGxhYmVsOiBsb2NhbGl6ZSgnZm9ybWF0Q2VsbHMubGFiZWwnLCBcIkZvcm1hdCBDZWxsc1wiKSwgY29kZTogJ3VuZG9yZWRvLm5vdGVib29rcy5vbldpbGxFeGVjdXRlRm9ybWF0JywgfSk7XG5cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDZWxsRXhlY3V0aW9uUGFydGljaXBhbnRzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rRXhlY3V0aW9uU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJLZXJuZWxFeGVjdXRpb25QYXJ0aWNpcGFudHMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJLZXJuZWxFeGVjdXRpb25QYXJ0aWNpcGFudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2UucmVnaXN0ZXJFeGVjdXRpb25QYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZvcm1hdE9uQ2VsbEV4ZWN1dGlvblBhcnRpY2lwYW50KSkpO1xuXHR9XG59XG5cbmNvbnN0IHdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaENvbnRyaWJ1dGlvbnNFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oQ2VsbEV4ZWN1dGlvblBhcnRpY2lwYW50c0NvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSx1QkFBdUI7QUFFNUMsU0FBUyxjQUFjLDRCQUE0QjtBQUNuRCxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0Isb0NBQW9DLHNEQUFzRDtBQUNuSCxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUywwQkFBMEIsaUNBQWlDO0FBQ3BFLFNBQVMsc0JBQXNCO0FBRS9CLFNBQW9DLGlDQUFpQztBQUNyRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFrRSxjQUFjLHdDQUF3QztBQUN4SCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQztBQUczQyxnQkFBZ0IsY0FBYyxRQUFRO0FBQUEsRUFDckMsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxnQkFBZ0IsaUJBQWlCO0FBQUEsTUFDbEQsVUFBVTtBQUFBLE1BQ1YsY0FBYyxlQUFlLElBQUksMkJBQTJCLHdCQUF3QjtBQUFBLE1BQ3BGLFlBQVk7QUFBQSxRQUNYLE1BQU0sa0JBQWtCLGdCQUFnQixVQUFVO0FBQUEsUUFDbEQsU0FBUyxPQUFPLFFBQVEsT0FBTyxNQUFNLFFBQVE7QUFBQSxRQUM3QyxPQUFPLEVBQUUsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVEsS0FBSztBQUFBLFFBQy9ELFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxRQUNMLElBQUksT0FBTztBQUFBLFFBQ1gsTUFBTSxlQUFlLElBQUksa0JBQWtCLG1CQUFtQixrQkFBa0IsNkJBQTZCO0FBQUEsUUFDN0csT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsVUFBTSxnQkFBZ0IsU0FBUyxJQUFJLGNBQWM7QUFDakQsVUFBTSxtQkFBbUIsU0FBUyxJQUFJLGlCQUFpQjtBQUN2RCxVQUFNLHNCQUFzQixTQUFTLElBQUksb0JBQW9CO0FBQzdELFVBQU0sMEJBQTBCLFNBQVMsSUFBSSx3QkFBd0I7QUFDckUsVUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxVQUFNLHVCQUF1QixTQUFTLElBQUkscUJBQXFCO0FBRS9ELFVBQU0sU0FBUyxnQ0FBZ0MsY0FBYyxnQkFBZ0I7QUFDN0UsUUFBSSxDQUFDLFVBQVUsQ0FBQyxPQUFPLFNBQVMsR0FBRztBQUNsQztBQUFBLElBQ0Q7QUFFQSxVQUFNLFdBQVcsT0FBTztBQUV4QixVQUFNLGdCQUF5QixNQUFNLHFCQUFxQixlQUFlLDJCQUEyQiw2QkFBNkIsVUFBVSxTQUFTLE1BQU0sa0JBQWtCLElBQUk7QUFFaEwsVUFBTSxhQUFhLElBQUksZ0JBQWdCO0FBQ3ZDLFFBQUk7QUFDSCxVQUFJLENBQUMsZUFBZTtBQUNuQixjQUFNLGVBQWUsTUFBTSxRQUFRLElBQUksU0FBUyxNQUFNLElBQUksT0FBTSxTQUFRO0FBQ3ZFLGdCQUFNLE1BQU0sTUFBTSxpQkFBaUIscUJBQXFCLEtBQUssR0FBRztBQUNoRSxxQkFBVyxJQUFJLEdBQUc7QUFFbEIsZ0JBQU0sUUFBUSxJQUFJLE9BQU87QUFFekIsZ0JBQU0sY0FBYyxNQUFNO0FBQUEsWUFDekI7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0EsZUFBZTtBQUFBLFlBQ2Ysa0JBQWtCO0FBQUEsVUFDbkI7QUFFQSxnQkFBTSxRQUE0QixDQUFDO0FBRW5DLGNBQUksYUFBYTtBQUNoQix1QkFBVyxRQUFRLGFBQWE7QUFDL0Isb0JBQU0sS0FBSyxJQUFJLGlCQUFpQixNQUFNLEtBQUssTUFBTSxNQUFNLGFBQWEsQ0FBQyxDQUFDO0FBQUEsWUFDdkU7QUFFQSxtQkFBTztBQUFBLFVBQ1I7QUFFQSxpQkFBTyxDQUFDO0FBQUEsUUFDVCxDQUFDLENBQUM7QUFFRixjQUFNLGdCQUFnQjtBQUFBO0FBQUEsVUFBZ0IsYUFBYSxLQUFLO0FBQUEsVUFBRyxFQUFFLE9BQU8sU0FBUyxTQUFTLGlCQUFpQixHQUFHLE1BQU0sMEJBQTJCO0FBQUEsUUFBQztBQUFBLE1BQzdJO0FBQUEsSUFDRCxVQUFFO0FBQ0QsaUJBQVcsUUFBUTtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNELENBQUM7QUFHRCxxQkFBcUIsTUFBTSx5QkFBeUIsYUFBYTtBQUFBLEVBQ2hFLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsb0JBQW9CLGFBQWE7QUFBQSxNQUNsRCxjQUFjLGVBQWUsSUFBSSwyQkFBMkIsMEJBQTBCLGtCQUFrQixtQkFBbUIsa0JBQWtCLFVBQVUsa0JBQWtCLDZCQUE2QjtBQUFBLE1BQ3RNLFFBQVE7QUFBQSxRQUNQLFFBQVEsZUFBZSxJQUFJLGtCQUFrQixlQUFlO0FBQUEsUUFDNUQsU0FBUyxPQUFPLFFBQVEsT0FBTyxNQUFNLFFBQVE7QUFBQSxRQUM3QyxPQUFPLEVBQUUsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVEsS0FBSztBQUFBLFFBQy9ELFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLFFBQ2hCLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxJQUFJLFVBQTRCLFFBQW9DO0FBQ3pFLFFBQUksT0FBTyxTQUFTLEdBQUc7QUFDdEIsWUFBTSxlQUFlLFNBQVMsSUFBSSxxQkFBcUI7QUFDdkQsWUFBTSxhQUFhLGVBQWUsb0NBQW9DLFFBQVEsZUFBZSxVQUFVLFNBQVMsTUFBTSxrQkFBa0IsTUFBTSxJQUFJO0FBQUEsSUFDbko7QUFBQSxFQUNEO0FBQ0QsQ0FBQztBQUVELElBQU0sbUNBQU4sTUFBNEU7QUFBQSxFQUMzRSxZQUNvQyxpQkFDUSx5QkFDUCxrQkFDRyxxQkFDQyxzQkFDTCxrQkFDbEM7QUFOa0M7QUFDUTtBQUNQO0FBQ0c7QUFDQztBQUNMO0FBQUEsRUFFcEM7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLFlBQXFEO0FBRTVFLFVBQU0sVUFBVSxLQUFLLHFCQUFxQixTQUFrQixnQkFBZ0IscUJBQXFCO0FBQ2pHLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLElBQUksZ0JBQWdCO0FBQ3ZDLFFBQUk7QUFDSCxZQUFNLGVBQWUsTUFBTSxRQUFRLElBQUksV0FBVyxJQUFJLE9BQU0sa0JBQWlCO0FBQzVFLGNBQU0sVUFBVSxLQUFLLGlCQUFpQixxQkFBcUIsY0FBYyxRQUFRO0FBQ2pGLFlBQUksQ0FBQyxTQUFTO0FBQ2IsaUJBQU8sQ0FBQztBQUFBLFFBQ1Q7QUFDQSxZQUFJO0FBQ0osbUJBQVcsUUFBUSxRQUFRLE9BQU87QUFDakMsY0FBSSxLQUFLLFdBQVcsY0FBYyxZQUFZO0FBQzdDLHlCQUFhO0FBQ2I7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLFlBQUksQ0FBQyxZQUFZO0FBQ2hCLGlCQUFPLENBQUM7QUFBQSxRQUNUO0FBRUEsY0FBTSxNQUFNLE1BQU0sS0FBSyxpQkFBaUIscUJBQXFCLFdBQVcsR0FBRztBQUMzRSxtQkFBVyxJQUFJLEdBQUc7QUFFbEIsY0FBTSxRQUFRLElBQUksT0FBTztBQUV6QixjQUFNLGNBQWMsTUFBTTtBQUFBLFVBQ3pCLEtBQUs7QUFBQSxVQUNMLEtBQUs7QUFBQSxVQUNMO0FBQUEsVUFDQSxlQUFlO0FBQUEsVUFDZixrQkFBa0I7QUFBQSxRQUNuQjtBQUVBLGNBQU0sUUFBNEIsQ0FBQztBQUVuQyxZQUFJLGFBQWE7QUFDaEIsZ0JBQU0sS0FBSyxHQUFHLFlBQVksSUFBSSxVQUFRLElBQUksaUJBQWlCLE1BQU0sS0FBSyxNQUFNLE1BQU0sYUFBYSxDQUFDLENBQUMsQ0FBQztBQUNsRyxpQkFBTztBQUFBLFFBQ1I7QUFFQSxlQUFPLENBQUM7QUFBQSxNQUNULENBQUMsQ0FBQztBQUVGLFlBQU0sS0FBSyxnQkFBZ0I7QUFBQTtBQUFBLFFBQWdCLGFBQWEsS0FBSztBQUFBLFFBQUcsRUFBRSxPQUFPLFNBQVMscUJBQXFCLGNBQWMsR0FBRyxNQUFNLHlDQUEwQztBQUFBLE1BQUM7QUFBQSxJQUUxSyxVQUFFO0FBQ0QsaUJBQVcsUUFBUTtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUNEO0FBakVNLG1DQUFOO0FBQUEsRUFFRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQRztBQW1FQyxJQUFNLHdDQUFOLGNBQW9ELFdBQTZDO0FBQUEsRUFDdkcsWUFDeUMsc0JBQ0ksMEJBQzNDO0FBQ0QsVUFBTTtBQUhrQztBQUNJO0FBRzVDLFNBQUssb0NBQW9DO0FBQUEsRUFDMUM7QUFBQSxFQUVRLHNDQUE0QztBQUNuRCxTQUFLLFVBQVUsS0FBSyx5QkFBeUIsNkJBQTZCLEtBQUsscUJBQXFCLGVBQWUsZ0NBQWdDLENBQUMsQ0FBQztBQUFBLEVBQ3RKO0FBQ0Q7QUFaYSx3Q0FBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsR0FIVTtBQWNiLE1BQU0saUNBQWlDLFNBQVMsR0FBb0MsaUNBQWlDLFNBQVM7QUFDOUgsK0JBQStCLDhCQUE4Qix1Q0FBdUMsZUFBZSxRQUFROyIsCiAgIm5hbWVzIjogW10KfQo=
