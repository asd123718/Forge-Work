import { KeyChord, KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { URI } from "../../../../../base/common/uri.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { CommandExecutor } from "../../../../../editor/common/cursor/cursor.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../../editor/common/languages/languageConfigurationRegistry.js";
import { TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { getIconClasses } from "../../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { LineCommentCommand, Type } from "../../../../../editor/contrib/comment/browser/lineCommentCommand.js";
import { localize, localize2 } from "../../../../../nls.js";
import { MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { InputFocusedContext, InputFocusedContextKey } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { InlineChatController } from "../../../inlineChat/browser/inlineChatController.js";
import { CTX_INLINE_CHAT_FOCUSED } from "../../../inlineChat/common/inlineChat.js";
import { changeCellToKind, runDeleteAction } from "./cellOperations.js";
import { CELL_TITLE_CELL_GROUP_ID, CELL_TITLE_OUTPUT_GROUP_ID, CellToolbarOrder, NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT, NotebookAction, NotebookCellAction, NotebookMultiCellAction, executeNotebookCondition, findTargetCellEditor } from "./coreActions.js";
import { NotebookChangeTabDisplaySize, NotebookIndentUsingSpaces, NotebookIndentUsingTabs, NotebookIndentationToSpacesAction, NotebookIndentationToTabsAction } from "./notebookIndentationActions.js";
import { CHANGE_CELL_LANGUAGE, CellEditState, DETECT_CELL_LANGUAGE, QUIT_EDIT_CELL_COMMAND_ID, getNotebookEditorFromEditorPane } from "../notebookBrowser.js";
import * as icons from "../notebookIcons.js";
import { CellEditType, CellKind, NotebookCellExecutionState, NotebookSetting } from "../../common/notebookCommon.js";
import { NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_IS_FIRST_OUTPUT, NOTEBOOK_CELL_LIST_FOCUSED, NOTEBOOK_CELL_MARKDOWN_EDIT_MODE, NOTEBOOK_CELL_TYPE, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_HAS_OUTPUTS, NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_OUTPUT_FOCUSED, NOTEBOOK_OUTPUT_INPUT_FOCUSED, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON } from "../../common/notebookContextKeys.js";
import { INotebookExecutionStateService } from "../../common/notebookExecutionStateService.js";
import { INotebookKernelService } from "../../common/notebookKernelService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ILanguageDetectionService } from "../../../../services/languageDetection/common/languageDetectionWorkerService.js";
import { NotebookInlineVariablesController } from "../contrib/notebookVariables/notebookInlineVariables.js";
const CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID = "notebook.clearAllCellsOutputs";
const EDIT_CELL_COMMAND_ID = "notebook.cell.edit";
const DELETE_CELL_COMMAND_ID = "notebook.cell.delete";
const QUIT_EDIT_ALL_CELLS_COMMAND_ID = "notebook.quitEditAllCells";
const CLEAR_CELL_OUTPUTS_COMMAND_ID = "notebook.cell.clearOutputs";
const SELECT_NOTEBOOK_INDENTATION_ID = "notebook.selectIndentation";
const COMMENT_SELECTED_CELLS_ID = "notebook.commentSelectedCells";
registerAction2(class EditCellAction extends NotebookCellAction {
  constructor() {
    super(
      {
        id: EDIT_CELL_COMMAND_ID,
        title: localize("notebookActions.editCell", "Edit Cell"),
        keybinding: {
          when: ContextKeyExpr.and(
            NOTEBOOK_CELL_LIST_FOCUSED,
            ContextKeyExpr.not(InputFocusedContextKey),
            EditorContextKeys.hoverFocused.toNegated(),
            NOTEBOOK_OUTPUT_INPUT_FOCUSED.toNegated()
          ),
          primary: KeyCode.Enter,
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(
            NOTEBOOK_EDITOR_EDITABLE.isEqualTo(true),
            NOTEBOOK_CELL_TYPE.isEqualTo("markup"),
            NOTEBOOK_CELL_MARKDOWN_EDIT_MODE.toNegated(),
            NOTEBOOK_CELL_EDITABLE
          ),
          order: CellToolbarOrder.EditCell,
          group: CELL_TITLE_CELL_GROUP_ID
        },
        icon: icons.editIcon
      }
    );
  }
  async runWithContext(accessor, context) {
    if (!context.notebookEditor.hasModel()) {
      return;
    }
    await context.notebookEditor.focusNotebookCell(context.cell, "editor");
    const foundEditor = context.cell ? findTargetCellEditor(context, context.cell) : void 0;
    if (foundEditor && foundEditor.hasTextFocus() && InlineChatController.get(foundEditor)?.getWidgetPosition()?.lineNumber === foundEditor.getPosition()?.lineNumber) {
      InlineChatController.get(foundEditor)?.focus();
    }
  }
});
const quitEditCondition = ContextKeyExpr.and(
  NOTEBOOK_EDITOR_FOCUSED,
  InputFocusedContext,
  CTX_INLINE_CHAT_FOCUSED.toNegated()
);
registerAction2(class QuitEditCellAction extends NotebookCellAction {
  constructor() {
    super(
      {
        id: QUIT_EDIT_CELL_COMMAND_ID,
        title: localize("notebookActions.quitEdit", "Stop Editing Cell"),
        menu: {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(
            NOTEBOOK_CELL_TYPE.isEqualTo("markup"),
            NOTEBOOK_CELL_MARKDOWN_EDIT_MODE,
            NOTEBOOK_CELL_EDITABLE
          ),
          order: CellToolbarOrder.SaveCell,
          group: CELL_TITLE_CELL_GROUP_ID
        },
        icon: icons.stopEditIcon,
        keybinding: [
          {
            when: ContextKeyExpr.and(
              quitEditCondition,
              EditorContextKeys.hoverVisible.toNegated(),
              EditorContextKeys.hasNonEmptySelection.toNegated(),
              EditorContextKeys.hasMultipleSelections.toNegated()
            ),
            primary: KeyCode.Escape,
            weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
          },
          {
            when: ContextKeyExpr.and(
              NOTEBOOK_EDITOR_FOCUSED,
              NOTEBOOK_OUTPUT_FOCUSED
            ),
            primary: KeyCode.Escape,
            weight: KeybindingWeight.WorkbenchContrib + 5
          },
          {
            when: ContextKeyExpr.and(
              quitEditCondition,
              NOTEBOOK_CELL_TYPE.isEqualTo("markup")
            ),
            primary: KeyMod.WinCtrl | KeyCode.Enter,
            win: {
              primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter
            },
            weight: NOTEBOOK_EDITOR_WIDGET_ACTION_WEIGHT - 5
          }
        ]
      }
    );
  }
  async runWithContext(accessor, context) {
    if (context.cell.cellKind === CellKind.Markup) {
      context.cell.updateEditState(CellEditState.Preview, QUIT_EDIT_CELL_COMMAND_ID);
    }
    await context.notebookEditor.focusNotebookCell(context.cell, "container", { skipReveal: true });
  }
});
registerAction2(class QuitEditAllCellsAction extends NotebookAction {
  constructor() {
    super(
      {
        id: QUIT_EDIT_ALL_CELLS_COMMAND_ID,
        title: localize("notebookActions.quitEditAllCells", "Stop Editing All Cells")
      }
    );
  }
  async runWithContext(accessor, context) {
    if (!context.notebookEditor.hasModel()) {
      return;
    }
    const viewModel = context.notebookEditor.getViewModel();
    if (!viewModel) {
      return;
    }
    const activeCell = context.notebookEditor.getActiveCell();
    const editingCells = viewModel.viewCells.filter(
      (cell) => cell.cellKind === CellKind.Markup && cell.getEditState() === CellEditState.Editing
    );
    editingCells.forEach((cell) => {
      cell.updateEditState(CellEditState.Preview, QUIT_EDIT_ALL_CELLS_COMMAND_ID);
    });
    if (activeCell) {
      await context.notebookEditor.focusNotebookCell(activeCell, "container", { skipReveal: true });
    }
  }
});
registerAction2(class DeleteCellAction extends NotebookCellAction {
  constructor() {
    super(
      {
        id: DELETE_CELL_COMMAND_ID,
        title: localize("notebookActions.deleteCell", "Delete Cell"),
        keybinding: {
          primary: KeyCode.Delete,
          mac: {
            primary: KeyMod.CtrlCmd | KeyCode.Backspace
          },
          when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_OUTPUT_INPUT_FOCUSED.toNegated()),
          weight: KeybindingWeight.WorkbenchContrib
        },
        menu: [
          {
            id: MenuId.NotebookCellDelete,
            when: NOTEBOOK_EDITOR_EDITABLE,
            group: CELL_TITLE_CELL_GROUP_ID
          },
          {
            id: MenuId.InteractiveCellDelete,
            group: CELL_TITLE_CELL_GROUP_ID
          }
        ],
        icon: icons.deleteCellIcon
      }
    );
  }
  async runWithContext(accessor, context) {
    if (!context.notebookEditor.hasModel()) {
      return;
    }
    let confirmation;
    const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
    const runState = notebookExecutionStateService.getCellExecution(context.cell.uri)?.state;
    const configService = accessor.get(IConfigurationService);
    if (runState === NotebookCellExecutionState.Executing && configService.getValue(NotebookSetting.confirmDeleteRunningCell)) {
      const dialogService = accessor.get(IDialogService);
      const primaryButton = localize("confirmDeleteButton", "Delete");
      confirmation = await dialogService.confirm({
        type: "question",
        message: localize("confirmDeleteButtonMessage", "This cell is running, are you sure you want to delete it?"),
        primaryButton,
        checkbox: {
          label: localize("doNotAskAgain", "Do not ask me again")
        }
      });
    } else {
      confirmation = { confirmed: true };
    }
    if (!confirmation.confirmed) {
      return;
    }
    if (confirmation.checkboxChecked === true) {
      await configService.updateValue(NotebookSetting.confirmDeleteRunningCell, false);
    }
    runDeleteAction(context.notebookEditor, context.cell);
  }
});
registerAction2(class ClearCellOutputsAction extends NotebookCellAction {
  constructor() {
    super({
      id: CLEAR_CELL_OUTPUTS_COMMAND_ID,
      title: localize("clearCellOutputs", "Clear Cell Outputs"),
      menu: [
        {
          id: MenuId.NotebookCellTitle,
          when: ContextKeyExpr.and(NOTEBOOK_CELL_TYPE.isEqualTo("code"), executeNotebookCondition, NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON.toNegated()),
          order: CellToolbarOrder.ClearCellOutput,
          group: CELL_TITLE_OUTPUT_GROUP_ID
        },
        {
          id: MenuId.NotebookOutputToolbar,
          when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE, NOTEBOOK_CELL_IS_FIRST_OUTPUT, NOTEBOOK_USE_CONSOLIDATED_OUTPUT_BUTTON)
        }
      ],
      keybinding: {
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, ContextKeyExpr.not(InputFocusedContextKey), NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
        primary: KeyMod.Alt | KeyCode.Delete,
        weight: KeybindingWeight.WorkbenchContrib
      },
      icon: icons.clearIcon
    });
  }
  async runWithContext(accessor, context) {
    const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
    const editor = context.notebookEditor;
    if (!editor.hasModel() || !editor.textModel.length) {
      return;
    }
    const cell = context.cell;
    const index = editor.textModel.cells.indexOf(cell.model);
    if (index < 0) {
      return;
    }
    const computeUndoRedo = !editor.isReadOnly;
    editor.textModel.applyEdits([{ editType: CellEditType.Output, index, outputs: [] }], true, void 0, () => void 0, void 0, computeUndoRedo);
    const runState = notebookExecutionStateService.getCellExecution(context.cell.uri)?.state;
    if (runState !== NotebookCellExecutionState.Executing) {
      context.notebookEditor.textModel.applyEdits([{
        editType: CellEditType.PartialInternalMetadata,
        index,
        internalMetadata: {
          runStartTime: null,
          runStartTimeAdjustment: null,
          runEndTime: null,
          executionOrder: null,
          lastRunSuccess: null
        }
      }], true, void 0, () => void 0, void 0, computeUndoRedo);
    }
  }
});
registerAction2(class ClearAllCellOutputsAction extends NotebookAction {
  constructor() {
    super({
      id: CLEAR_ALL_CELLS_OUTPUTS_COMMAND_ID,
      title: localize("clearAllCellsOutputs", "Clear All Outputs"),
      precondition: NOTEBOOK_HAS_OUTPUTS,
      menu: [
        {
          id: MenuId.EditorTitle,
          when: ContextKeyExpr.and(
            NOTEBOOK_IS_ACTIVE_EDITOR,
            ContextKeyExpr.notEquals("config.notebook.globalToolbar", true)
          ),
          group: "navigation",
          order: 0
        },
        {
          id: MenuId.NotebookToolbar,
          when: ContextKeyExpr.and(
            executeNotebookCondition,
            ContextKeyExpr.equals("config.notebook.globalToolbar", true)
          ),
          group: "navigation/execute",
          order: 10
        }
      ],
      icon: icons.clearIcon
    });
  }
  async runWithContext(accessor, context) {
    const notebookExecutionStateService = accessor.get(INotebookExecutionStateService);
    const editor = context.notebookEditor;
    if (!editor.hasModel() || !editor.textModel.length) {
      return;
    }
    const computeUndoRedo = !editor.isReadOnly;
    editor.textModel.applyEdits(
      editor.textModel.cells.map((cell, index) => ({
        editType: CellEditType.Output,
        index,
        outputs: []
      })),
      true,
      void 0,
      () => void 0,
      void 0,
      computeUndoRedo
    );
    const clearExecutionMetadataEdits = editor.textModel.cells.map((cell, index) => {
      const runState = notebookExecutionStateService.getCellExecution(cell.uri)?.state;
      if (runState !== NotebookCellExecutionState.Executing) {
        return {
          editType: CellEditType.PartialInternalMetadata,
          index,
          internalMetadata: {
            runStartTime: null,
            runStartTimeAdjustment: null,
            runEndTime: null,
            executionOrder: null,
            lastRunSuccess: null
          }
        };
      } else {
        return void 0;
      }
    }).filter((edit) => !!edit);
    if (clearExecutionMetadataEdits.length) {
      context.notebookEditor.textModel.applyEdits(clearExecutionMetadataEdits, true, void 0, () => void 0, void 0, computeUndoRedo);
    }
    const controller = editor.getContribution(NotebookInlineVariablesController.id);
    controller.clearNotebookInlineDecorations();
  }
});
registerAction2(class ChangeCellLanguageAction extends NotebookCellAction {
  constructor() {
    super({
      id: CHANGE_CELL_LANGUAGE,
      title: localize("changeLanguage", "Change Cell Language"),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyM),
        when: ContextKeyExpr.and(NOTEBOOK_EDITOR_FOCUSED, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE)
      },
      metadata: {
        description: localize("changeLanguage", "Change Cell Language"),
        args: [
          {
            name: "range",
            description: "The cell range",
            schema: {
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
          },
          {
            name: "language",
            description: "The target cell language",
            schema: {
              "type": "string"
            }
          }
        ]
      }
    });
  }
  getCellContextFromArgs(accessor, context, ...additionalArgs) {
    if (!context || typeof context.start !== "number" || typeof context.end !== "number" || context.start >= context.end) {
      return;
    }
    const language = additionalArgs.length && typeof additionalArgs[0] === "string" ? additionalArgs[0] : void 0;
    const activeEditorContext = this.getEditorContextFromArgsOrActive(accessor);
    if (!activeEditorContext || !activeEditorContext.notebookEditor.hasModel() || context.start >= activeEditorContext.notebookEditor.getLength()) {
      return;
    }
    return {
      notebookEditor: activeEditorContext.notebookEditor,
      cell: activeEditorContext.notebookEditor.cellAt(context.start),
      language
    };
  }
  async runWithContext(accessor, context) {
    if (context.language) {
      await this.setLanguage(context, context.language);
    } else {
      await this.showLanguagePicker(accessor, context);
    }
  }
  async showLanguagePicker(accessor, context) {
    const topItems = [];
    const mainItems = [];
    const languageService = accessor.get(ILanguageService);
    const modelService = accessor.get(IModelService);
    const quickInputService = accessor.get(IQuickInputService);
    const languageDetectionService = accessor.get(ILanguageDetectionService);
    const kernelService = accessor.get(INotebookKernelService);
    let languages = context.notebookEditor.activeKernel?.supportedLanguages;
    if (!languages) {
      const matchResult = kernelService.getMatchingKernel(context.notebookEditor.textModel);
      const allSupportedLanguages = matchResult.all.flatMap((kernel) => kernel.supportedLanguages);
      languages = allSupportedLanguages.length > 0 ? allSupportedLanguages : languageService.getRegisteredLanguageIds();
    }
    const providerLanguages = /* @__PURE__ */ new Set([
      ...languages,
      "markdown"
    ]);
    providerLanguages.forEach((languageId2) => {
      let description;
      if (context.cell.cellKind === CellKind.Markup ? languageId2 === "markdown" : languageId2 === context.cell.language) {
        description = localize("languageDescription", "({0}) - Current Language", languageId2);
      } else {
        description = localize("languageDescriptionConfigured", "({0})", languageId2);
      }
      const languageName = languageService.getLanguageName(languageId2);
      if (!languageName) {
        return;
      }
      const item = {
        label: languageName,
        iconClasses: getIconClasses(modelService, languageService, this.getFakeResource(languageName, languageService)),
        description,
        languageId: languageId2
      };
      if (languageId2 === "markdown" || languageId2 === context.cell.language) {
        topItems.push(item);
      } else {
        mainItems.push(item);
      }
    });
    mainItems.sort((a, b) => {
      return a.description.localeCompare(b.description);
    });
    const autoDetectMode = {
      label: localize("autoDetect", "Auto Detect")
    };
    const picks = [
      autoDetectMode,
      { type: "separator", label: localize("languagesPicks", "languages (identifier)") },
      ...topItems,
      { type: "separator" },
      ...mainItems
    ];
    const selection = await quickInputService.pick(picks, { placeHolder: localize("pickLanguageToConfigure", "Select Language Mode") });
    const languageId = selection === autoDetectMode ? await languageDetectionService.detectLanguage(context.cell.uri) : selection?.languageId;
    if (languageId) {
      await this.setLanguage(context, languageId);
    }
  }
  async setLanguage(context, languageId) {
    await setCellToLanguage(languageId, context);
  }
  /**
   * Copied from editorStatus.ts
   */
  getFakeResource(lang, languageService) {
    let fakeResource;
    const languageId = languageService.getLanguageIdByLanguageName(lang);
    if (languageId) {
      const extensions = languageService.getExtensions(languageId);
      if (extensions.length) {
        fakeResource = URI.file(extensions[0]);
      } else {
        const filenames = languageService.getFilenames(languageId);
        if (filenames.length) {
          fakeResource = URI.file(filenames[0]);
        }
      }
    }
    return fakeResource;
  }
});
registerAction2(class DetectCellLanguageAction extends NotebookCellAction {
  constructor() {
    super({
      id: DETECT_CELL_LANGUAGE,
      title: localize2("detectLanguage", "Accept Detected Language for Cell"),
      f1: true,
      precondition: ContextKeyExpr.and(NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE),
      keybinding: { primary: KeyCode.KeyD | KeyMod.Alt | KeyMod.Shift, weight: KeybindingWeight.WorkbenchContrib }
    });
  }
  async runWithContext(accessor, context) {
    const languageDetectionService = accessor.get(ILanguageDetectionService);
    const notificationService = accessor.get(INotificationService);
    const kernelService = accessor.get(INotebookKernelService);
    const kernel = kernelService.getSelectedOrSuggestedKernel(context.notebookEditor.textModel);
    const providerLanguages = [...kernel?.supportedLanguages ?? []];
    providerLanguages.push("markdown");
    const detection = await languageDetectionService.detectLanguage(context.cell.uri, providerLanguages);
    if (detection) {
      setCellToLanguage(detection, context);
    } else {
      notificationService.warn(localize("noDetection", "Unable to detect cell language"));
    }
  }
});
async function setCellToLanguage(languageId, context) {
  if (languageId === "markdown" && context.cell?.language !== "markdown") {
    const idx = context.notebookEditor.getCellIndex(context.cell);
    await changeCellToKind(CellKind.Markup, { cell: context.cell, notebookEditor: context.notebookEditor, ui: true }, "markdown", Mimes.markdown);
    const newCell = context.notebookEditor.cellAt(idx);
    if (newCell) {
      await context.notebookEditor.focusNotebookCell(newCell, "editor");
    }
  } else if (languageId !== "markdown" && context.cell?.cellKind === CellKind.Markup) {
    await changeCellToKind(CellKind.Code, { cell: context.cell, notebookEditor: context.notebookEditor, ui: true }, languageId);
  } else {
    const index = context.notebookEditor.textModel.cells.indexOf(context.cell.model);
    context.notebookEditor.textModel.applyEdits(
      [{ editType: CellEditType.CellLanguage, index, language: languageId }],
      true,
      void 0,
      () => void 0,
      void 0,
      !context.notebookEditor.isReadOnly
    );
  }
}
registerAction2(class SelectNotebookIndentation extends NotebookAction {
  constructor() {
    super({
      id: SELECT_NOTEBOOK_INDENTATION_ID,
      title: localize2("selectNotebookIndentation", "Select Indentation"),
      f1: true,
      precondition: ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, NOTEBOOK_EDITOR_EDITABLE, NOTEBOOK_CELL_EDITABLE)
    });
  }
  async runWithContext(accessor, context) {
    await this.showNotebookIndentationPicker(accessor, context);
  }
  async showNotebookIndentationPicker(accessor, context) {
    const quickInputService = accessor.get(IQuickInputService);
    const editorService = accessor.get(IEditorService);
    const instantiationService = accessor.get(IInstantiationService);
    const activeNotebook = getNotebookEditorFromEditorPane(editorService.activeEditorPane);
    if (!activeNotebook || activeNotebook.isDisposed) {
      return quickInputService.pick([{ label: localize("noNotebookEditor", "No notebook editor active at this time") }]);
    }
    if (activeNotebook.isReadOnly) {
      return quickInputService.pick([{ label: localize("noWritableCodeEditor", "The active notebook editor is read-only.") }]);
    }
    const picks = [
      new NotebookIndentUsingTabs(),
      // indent using tabs
      new NotebookIndentUsingSpaces(),
      // indent using spaces
      new NotebookChangeTabDisplaySize(),
      // change tab size
      new NotebookIndentationToTabsAction(),
      // convert indentation to tabs
      new NotebookIndentationToSpacesAction()
      // convert indentation to spaces
    ].map((item) => {
      return {
        id: item.desc.id,
        label: item.desc.title.toString(),
        run: () => {
          instantiationService.invokeFunction(item.run);
        }
      };
    });
    picks.splice(3, 0, { type: "separator", label: localize("indentConvert", "convert file") });
    picks.unshift({ type: "separator", label: localize("indentView", "change view") });
    const action = await quickInputService.pick(picks, { placeHolder: localize("pickAction", "Select Action"), matchOnDetail: true });
    if (!action) {
      return;
    }
    action.run();
    context.notebookEditor.focus();
    return;
  }
});
registerAction2(class CommentSelectedCellsAction extends NotebookMultiCellAction {
  constructor() {
    super({
      id: COMMENT_SELECTED_CELLS_ID,
      title: localize("commentSelectedCells", "Comment Selected Cells"),
      keybinding: {
        when: ContextKeyExpr.and(
          NOTEBOOK_EDITOR_FOCUSED,
          NOTEBOOK_EDITOR_EDITABLE,
          ContextKeyExpr.not(InputFocusedContextKey)
        ),
        primary: KeyMod.CtrlCmd | KeyCode.Slash,
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async runWithContext(accessor, context) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    context.selectedCells.forEach(async (cellViewModel) => {
      const textModel = await cellViewModel.resolveTextModel();
      const commentsOptions = cellViewModel.commentOptions;
      const cellCommentCommand = new LineCommentCommand(
        languageConfigurationService,
        new Selection(1, 1, textModel.getLineCount(), textModel.getLineMaxColumn(textModel.getLineCount())),
        // comment the entire cell
        textModel.getOptions().tabSize,
        Type.Toggle,
        commentsOptions.insertSpace ?? true,
        commentsOptions.ignoreEmptyLines ?? true,
        false
      );
      const cellEditorSelections = cellViewModel.getSelections();
      const initialTrackedRangesIDs = cellEditorSelections.map((selection) => {
        return textModel._setTrackedRange(null, selection, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
      });
      CommandExecutor.executeCommands(textModel, cellEditorSelections, [cellCommentCommand]);
      const newTrackedSelections = initialTrackedRangesIDs.map((i) => {
        return textModel._getTrackedRange(i);
      }).filter((r) => !!r).map((range) => {
        return new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
      });
      cellViewModel.setSelections(newTrackedSelections ?? []);
    });
  }
});
export {
  CLEAR_CELL_OUTPUTS_COMMAND_ID,
  COMMENT_SELECTED_CELLS_ID,
  SELECT_NOTEBOOK_INDENTATION_ID
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxlZGl0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNob3JkLCBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IENvbW1hbmRFeGVjdXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yL2N1cnNvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IExpbmVDb21tZW50Q29tbWFuZCwgVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvbW1lbnQvYnJvd3Nlci9saW5lQ29tbWVudENvbW1hbmQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dCwgSW5wdXRGb2N1c2VkQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElDb25maXJtYXRpb25SZXN1bHQsIElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElubGluZUNoYXRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ2hhdC9icm93c2VyL2lubGluZUNoYXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENUWF9JTkxJTkVfQ0hBVF9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vLi4vaW5saW5lQ2hhdC9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBjaGFuZ2VDZWxsVG9LaW5kLCBydW5EZWxldGVBY3Rpb24gfSBmcm9tICcuL2NlbGxPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IENFTExfVElUTEVfQ0VMTF9HUk9VUF9JRCwgQ0VMTF9USVRMRV9PVVRQVVRfR1JPVVBfSUQsIENlbGxUb29sYmFyT3JkZXIsIElOb3RlYm9va0FjdGlvbkNvbnRleHQsIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0LCBJTm90ZWJvb2tDb21tYW5kQ29udGV4dCwgTk9URUJPT0tfRURJVE9SX1dJREdFVF9BQ1RJT05fV0VJR0hULCBOb3RlYm9va0FjdGlvbiwgTm90ZWJvb2tDZWxsQWN0aW9uLCBOb3RlYm9va011bHRpQ2VsbEFjdGlvbiwgZXhlY3V0ZU5vdGVib29rQ29uZGl0aW9uLCBmaW5kVGFyZ2V0Q2VsbEVkaXRvciB9IGZyb20gJy4vY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDaGFuZ2VUYWJEaXNwbGF5U2l6ZSwgTm90ZWJvb2tJbmRlbnRVc2luZ1NwYWNlcywgTm90ZWJvb2tJbmRlbnRVc2luZ1RhYnMsIE5vdGVib29rSW5kZW50YXRpb25Ub1NwYWNlc0FjdGlvbiwgTm90ZWJvb2tJbmRlbnRhdGlvblRvVGFic0FjdGlvbiB9IGZyb20gJy4vbm90ZWJvb2tJbmRlbnRhdGlvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ0hBTkdFX0NFTExfTEFOR1VBR0UsIENlbGxFZGl0U3RhdGUsIERFVEVDVF9DRUxMX0xBTkdVQUdFLCBRVUlUX0VESVRfQ0VMTF9DT01NQU5EX0lELCBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lIH0gZnJvbSAnLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCAqIGFzIGljb25zIGZyb20gJy4uL25vdGVib29rSWNvbnMuanMnO1xuaW1wb3J0IHsgQ2VsbEVkaXRUeXBlLCBDZWxsS2luZCwgSUNlbGxFZGl0T3BlcmF0aW9uLCBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSwgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IE5PVEVCT09LX0NFTExfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfSEFTX09VVFBVVFMsIE5PVEVCT09LX0NFTExfSVNfRklSU1RfT1VUUFVULCBOT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCwgTk9URUJPT0tfQ0VMTF9NQVJLRE9XTl9FRElUX01PREUsIE5PVEVCT09LX0NFTExfVFlQRSwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfSEFTX09VVFBVVFMsIE5PVEVCT09LX0lTX0FDVElWRV9FRElUT1IsIE5PVEVCT09LX09VVFBVVF9GT0NVU0VELCBOT1RFQk9PS19PVVRQVVRfSU5QVVRfRk9DVVNFRCwgTk9URUJPT0tfVVNFX0NPTlNPTElEQVRFRF9PVVRQVVRfQlVUVE9OIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0tlcm5lbFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDZWxsUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGFuZ3VhZ2VEZXRlY3Rpb24vY29tbW9uL2xhbmd1YWdlRGV0ZWN0aW9uV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0lubGluZVZhcmlhYmxlc0NvbnRyb2xsZXIgfSBmcm9tICcuLi9jb250cmliL25vdGVib29rVmFyaWFibGVzL25vdGVib29rSW5saW5lVmFyaWFibGVzLmpzJztcblxuY29uc3QgQ0xFQVJfQUxMX0NFTExTX09VVFBVVFNfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jbGVhckFsbENlbGxzT3V0cHV0cyc7XG5jb25zdCBFRElUX0NFTExfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmVkaXQnO1xuY29uc3QgREVMRVRFX0NFTExfQ09NTUFORF9JRCA9ICdub3RlYm9vay5jZWxsLmRlbGV0ZSc7XG5jb25zdCBRVUlUX0VESVRfQUxMX0NFTExTX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2sucXVpdEVkaXRBbGxDZWxscyc7XG5leHBvcnQgY29uc3QgQ0xFQVJfQ0VMTF9PVVRQVVRTX0NPTU1BTkRfSUQgPSAnbm90ZWJvb2suY2VsbC5jbGVhck91dHB1dHMnO1xuZXhwb3J0IGNvbnN0IFNFTEVDVF9OT1RFQk9PS19JTkRFTlRBVElPTl9JRCA9ICdub3RlYm9vay5zZWxlY3RJbmRlbnRhdGlvbic7XG5leHBvcnQgY29uc3QgQ09NTUVOVF9TRUxFQ1RFRF9DRUxMU19JRCA9ICdub3RlYm9vay5jb21tZW50U2VsZWN0ZWRDZWxscyc7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBFZGl0Q2VsbEFjdGlvbiBleHRlbmRzIE5vdGVib29rQ2VsbEFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogRURJVF9DRUxMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLmVkaXRDZWxsJywgXCJFZGl0IENlbGxcIiksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX0xJU1RfRk9DVVNFRCxcblx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm5vdChJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX09VVFBVVF9JTlBVVF9GT0NVU0VELnRvTmVnYXRlZCgpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdE5PVEVCT09LX0VESVRPUl9FRElUQUJMRS5pc0VxdWFsVG8odHJ1ZSksXG5cdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdtYXJrdXAnKSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfTUFSS0RPV05fRURJVF9NT0RFLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9FRElUQUJMRSksXG5cdFx0XHRcdFx0b3JkZXI6IENlbGxUb29sYmFyT3JkZXIuRWRpdENlbGwsXG5cdFx0XHRcdFx0Z3JvdXA6IENFTExfVElUTEVfQ0VMTF9HUk9VUF9JRFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpY29uOiBpY29ucy5lZGl0SWNvbixcblx0XHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFjb250ZXh0Lm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGNvbnRleHQuY2VsbCwgJ2VkaXRvcicpO1xuXHRcdGNvbnN0IGZvdW5kRWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCA9IGNvbnRleHQuY2VsbCA/IGZpbmRUYXJnZXRDZWxsRWRpdG9yKGNvbnRleHQsIGNvbnRleHQuY2VsbCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvdW5kRWRpdG9yICYmIGZvdW5kRWRpdG9yLmhhc1RleHRGb2N1cygpICYmIElubGluZUNoYXRDb250cm9sbGVyLmdldChmb3VuZEVkaXRvcik/LmdldFdpZGdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXIgPT09IGZvdW5kRWRpdG9yLmdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXIpIHtcblx0XHRcdElubGluZUNoYXRDb250cm9sbGVyLmdldChmb3VuZEVkaXRvcik/LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgcXVpdEVkaXRDb25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdE5PVEVCT09LX0VESVRPUl9GT0NVU0VELFxuXHRJbnB1dEZvY3VzZWRDb250ZXh0LFxuXHRDVFhfSU5MSU5FX0NIQVRfRk9DVVNFRC50b05lZ2F0ZWQoKVxuKTtcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBRdWl0RWRpdENlbGxBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFFVSVRfRURJVF9DRUxMX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbm90ZWJvb2tBY3Rpb25zLnF1aXRFZGl0JywgXCJTdG9wIEVkaXRpbmcgQ2VsbFwiKSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tDZWxsVGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Tk9URUJPT0tfQ0VMTF9UWVBFLmlzRXF1YWxUbygnbWFya3VwJyksXG5cdFx0XHRcdFx0XHROT1RFQk9PS19DRUxMX01BUktET1dOX0VESVRfTU9ERSxcblx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfRURJVEFCTEUpLFxuXHRcdFx0XHRcdG9yZGVyOiBDZWxsVG9vbGJhck9yZGVyLlNhdmVDZWxsLFxuXHRcdFx0XHRcdGdyb3VwOiBDRUxMX1RJVExFX0NFTExfR1JPVVBfSURcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjogaWNvbnMuc3RvcEVkaXRJY29uLFxuXHRcdFx0XHRrZXliaW5kaW5nOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKHF1aXRFZGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5ob3ZlclZpc2libGUudG9OZWdhdGVkKCksXG5cdFx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmhhc05vbkVtcHR5U2VsZWN0aW9uLnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZVNlbGVjdGlvbnMudG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IE5PVEVCT09LX0VESVRPUl9XSURHRVRfQUNUSU9OX1dFSUdIVCAtIDVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHRcdFx0Tk9URUJPT0tfT1VUUFVUX0ZPQ1VTRUQpLFxuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0cXVpdEVkaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0XHRcdE5PVEVCT09LX0NFTExfVFlQRS5pc0VxdWFsVG8oJ21hcmt1cCcpKSxcblx0XHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0XHRcdHdpbjoge1xuXHRcdFx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkVudGVyXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBOT1RFQk9PS19FRElUT1JfV0lER0VUX0FDVElPTl9XRUlHSFQgLSA1XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpIHtcblx0XHRpZiAoY29udGV4dC5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdGNvbnRleHQuY2VsbC51cGRhdGVFZGl0U3RhdGUoQ2VsbEVkaXRTdGF0ZS5QcmV2aWV3LCBRVUlUX0VESVRfQ0VMTF9DT01NQU5EX0lEKTtcblx0XHR9XG5cblx0XHRhd2FpdCBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmZvY3VzTm90ZWJvb2tDZWxsKGNvbnRleHQuY2VsbCwgJ2NvbnRhaW5lcicsIHsgc2tpcFJldmVhbDogdHJ1ZSB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBRdWl0RWRpdEFsbENlbGxzQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IFFVSVRfRURJVF9BTExfQ0VMTFNfQ09NTUFORF9JRCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMucXVpdEVkaXRBbGxDZWxscycsIFwiU3RvcCBFZGl0aW5nIEFsbCBDZWxsc1wiKVxuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQWN0aW9uQ29udGV4dCkge1xuXHRcdGlmICghY29udGV4dC5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld01vZGVsID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRWaWV3TW9kZWwoKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUNlbGwgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKTtcblxuXHRcdGNvbnN0IGVkaXRpbmdDZWxscyA9IHZpZXdNb2RlbC52aWV3Q2VsbHMuZmlsdGVyKGNlbGwgPT5cblx0XHRcdGNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBjZWxsLmdldEVkaXRTdGF0ZSgpID09PSBDZWxsRWRpdFN0YXRlLkVkaXRpbmdcblx0XHQpO1xuXG5cdFx0ZWRpdGluZ0NlbGxzLmZvckVhY2goY2VsbCA9PiB7XG5cdFx0XHRjZWxsLnVwZGF0ZUVkaXRTdGF0ZShDZWxsRWRpdFN0YXRlLlByZXZpZXcsIFFVSVRfRURJVF9BTExfQ0VMTFNfQ09NTUFORF9JRCk7XG5cdFx0fSk7XG5cblx0XHRpZiAoYWN0aXZlQ2VsbCkge1xuXHRcdFx0YXdhaXQgY29udGV4dC5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChhY3RpdmVDZWxsLCAnY29udGFpbmVyJywgeyBza2lwUmV2ZWFsOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEZWxldGVDZWxsQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBERUxFVEVfQ0VMTF9DT01NQU5EX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ25vdGVib29rQWN0aW9ucy5kZWxldGVDZWxsJywgXCJEZWxldGUgQ2VsbFwiKSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuRGVsZXRlLFxuXHRcdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJhY2tzcGFjZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKE5PVEVCT09LX0VESVRPUl9GT0NVU0VELCBDb250ZXh0S2V5RXhwci5ub3QoSW5wdXRGb2N1c2VkQ29udGV4dEtleSksIE5PVEVCT09LX09VVFBVVF9JTlBVVF9GT0NVU0VELnRvTmVnYXRlZCgpKSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va0NlbGxEZWxldGUsXG5cdFx0XHRcdFx0XHR3aGVuOiBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsXG5cdFx0XHRcdFx0XHRncm91cDogQ0VMTF9USVRMRV9DRUxMX0dST1VQX0lEXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkludGVyYWN0aXZlQ2VsbERlbGV0ZSxcblx0XHRcdFx0XHRcdGdyb3VwOiBDRUxMX1RJVExFX0NFTExfR1JPVVBfSURcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGljb246IGljb25zLmRlbGV0ZUNlbGxJY29uXG5cdFx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJTm90ZWJvb2tDZWxsQWN0aW9uQ29udGV4dCkge1xuXHRcdGlmICghY29udGV4dC5ub3RlYm9va0VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNvbmZpcm1hdGlvbjogSUNvbmZpcm1hdGlvblJlc3VsdDtcblx0XHRjb25zdCBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHJ1blN0YXRlID0gbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbihjb250ZXh0LmNlbGwudXJpKT8uc3RhdGU7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKHJ1blN0YXRlID09PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcgJiYgY29uZmlnU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcuY29uZmlybURlbGV0ZVJ1bm5pbmdDZWxsKSkge1xuXHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRjb25zdCBwcmltYXJ5QnV0dG9uID0gbG9jYWxpemUoJ2NvbmZpcm1EZWxldGVCdXR0b24nLCBcIkRlbGV0ZVwiKTtcblxuXHRcdFx0Y29uZmlybWF0aW9uID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NvbmZpcm1EZWxldGVCdXR0b25NZXNzYWdlJywgXCJUaGlzIGNlbGwgaXMgcnVubmluZywgYXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGRlbGV0ZSBpdD9cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IHByaW1hcnlCdXR0b24sXG5cdFx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkb05vdEFza0FnYWluJywgXCJEbyBub3QgYXNrIG1lIGFnYWluXCIpXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbmZpcm1hdGlvbiA9IHsgY29uZmlybWVkOiB0cnVlIH07XG5cdFx0fVxuXG5cdFx0aWYgKCFjb25maXJtYXRpb24uY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNvbmZpcm1hdGlvbi5jaGVja2JveENoZWNrZWQgPT09IHRydWUpIHtcblx0XHRcdGF3YWl0IGNvbmZpZ1NlcnZpY2UudXBkYXRlVmFsdWUoTm90ZWJvb2tTZXR0aW5nLmNvbmZpcm1EZWxldGVSdW5uaW5nQ2VsbCwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdHJ1bkRlbGV0ZUFjdGlvbihjb250ZXh0Lm5vdGVib29rRWRpdG9yLCBjb250ZXh0LmNlbGwpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENsZWFyQ2VsbE91dHB1dHNBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ0xFQVJfQ0VMTF9PVVRQVVRTX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NsZWFyQ2VsbE91dHB1dHMnLCAnQ2xlYXIgQ2VsbCBPdXRwdXRzJyksXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rQ2VsbFRpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19DRUxMX1RZUEUuaXNFcXVhbFRvKCdjb2RlJyksIGV4ZWN1dGVOb3RlYm9va0NvbmRpdGlvbiwgTk9URUJPT0tfQ0VMTF9IQVNfT1VUUFVUUywgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0VESVRBQkxFLCBOT1RFQk9PS19VU0VfQ09OU09MSURBVEVEX09VVFBVVF9CVVRUT04udG9OZWdhdGVkKCkpLFxuXHRcdFx0XHRcdG9yZGVyOiBDZWxsVG9vbGJhck9yZGVyLkNsZWFyQ2VsbE91dHB1dCxcblx0XHRcdFx0XHRncm91cDogQ0VMTF9USVRMRV9PVVRQVVRfR1JPVVBfSURcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tPdXRwdXRUb29sYmFyLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19DRUxMX0hBU19PVVRQVVRTLCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfSVNfRklSU1RfT1VUUFVULCBOT1RFQk9PS19VU0VfQ09OU09MSURBVEVEX09VVFBVVF9CVVRUT04pXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoTk9URUJPT0tfRURJVE9SX0ZPQ1VTRUQsIENvbnRleHRLZXlFeHByLm5vdChJbnB1dEZvY3VzZWRDb250ZXh0S2V5KSwgTk9URUJPT0tfQ0VMTF9IQVNfT1VUUFVUUywgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0VESVRBQkxFKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRGVsZXRlLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdGljb246IGljb25zLmNsZWFySWNvblxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3IgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkgfHwgIWVkaXRvci50ZXh0TW9kZWwubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2VsbCA9IGNvbnRleHQuY2VsbDtcblx0XHRjb25zdCBpbmRleCA9IGVkaXRvci50ZXh0TW9kZWwuY2VsbHMuaW5kZXhPZihjZWxsLm1vZGVsKTtcblxuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wdXRlVW5kb1JlZG8gPSAhZWRpdG9yLmlzUmVhZE9ubHk7XG5cdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LCBpbmRleCwgb3V0cHV0czogW10gfV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbXB1dGVVbmRvUmVkbyk7XG5cblx0XHRjb25zdCBydW5TdGF0ZSA9IG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24oY29udGV4dC5jZWxsLnVyaSk/LnN0YXRlO1xuXHRcdGlmIChydW5TdGF0ZSAhPT0gTm90ZWJvb2tDZWxsRXhlY3V0aW9uU3RhdGUuRXhlY3V0aW5nKSB7XG5cdFx0XHRjb250ZXh0Lm5vdGVib29rRWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUGFydGlhbEludGVybmFsTWV0YWRhdGEsIGluZGV4LCBpbnRlcm5hbE1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0cnVuU3RhcnRUaW1lOiBudWxsLFxuXHRcdFx0XHRcdHJ1blN0YXJ0VGltZUFkanVzdG1lbnQ6IG51bGwsXG5cdFx0XHRcdFx0cnVuRW5kVGltZTogbnVsbCxcblx0XHRcdFx0XHRleGVjdXRpb25PcmRlcjogbnVsbCxcblx0XHRcdFx0XHRsYXN0UnVuU3VjY2VzczogbnVsbFxuXHRcdFx0XHR9XG5cdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY29tcHV0ZVVuZG9SZWRvKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2xlYXJBbGxDZWxsT3V0cHV0c0FjdGlvbiBleHRlbmRzIE5vdGVib29rQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENMRUFSX0FMTF9DRUxMU19PVVRQVVRTX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NsZWFyQWxsQ2VsbHNPdXRwdXRzJywgJ0NsZWFyIEFsbCBPdXRwdXRzJyksXG5cdFx0XHRwcmVjb25kaXRpb246IE5PVEVCT09LX0hBU19PVVRQVVRTLFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JUaXRsZSxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHROT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90RXF1YWxzKCdjb25maWcubm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsIHRydWUpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdG9yZGVyOiAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rVG9vbGJhcixcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRleGVjdXRlTm90ZWJvb2tDb25kaXRpb24sXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5nbG9iYWxUb29sYmFyJywgdHJ1ZSlcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbi9leGVjdXRlJyxcblx0XHRcdFx0XHRvcmRlcjogMTBcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGljb246IGljb25zLmNsZWFySWNvblxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3I7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSB8fCAhZWRpdG9yLnRleHRNb2RlbC5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wdXRlVW5kb1JlZG8gPSAhZWRpdG9yLmlzUmVhZE9ubHk7XG5cdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFxuXHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5jZWxscy5tYXAoKGNlbGwsIGluZGV4KSA9PiAoe1xuXHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXgsIG91dHB1dHM6IFtdXG5cdFx0XHR9KSksIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbXB1dGVVbmRvUmVkbyk7XG5cblx0XHRjb25zdCBjbGVhckV4ZWN1dGlvbk1ldGFkYXRhRWRpdHMgPSBlZGl0b3IudGV4dE1vZGVsLmNlbGxzLm1hcCgoY2VsbCwgaW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IHJ1blN0YXRlID0gbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbihjZWxsLnVyaSk/LnN0YXRlO1xuXHRcdFx0aWYgKHJ1blN0YXRlICE9PSBOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhLCBpbmRleCwgaW50ZXJuYWxNZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0cnVuU3RhcnRUaW1lOiBudWxsLFxuXHRcdFx0XHRcdFx0cnVuU3RhcnRUaW1lQWRqdXN0bWVudDogbnVsbCxcblx0XHRcdFx0XHRcdHJ1bkVuZFRpbWU6IG51bGwsXG5cdFx0XHRcdFx0XHRleGVjdXRpb25PcmRlcjogbnVsbCxcblx0XHRcdFx0XHRcdGxhc3RSdW5TdWNjZXNzOiBudWxsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KS5maWx0ZXIoZWRpdCA9PiAhIWVkaXQpIGFzIElDZWxsRWRpdE9wZXJhdGlvbltdO1xuXHRcdGlmIChjbGVhckV4ZWN1dGlvbk1ldGFkYXRhRWRpdHMubGVuZ3RoKSB7XG5cdFx0XHRjb250ZXh0Lm5vdGVib29rRWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKGNsZWFyRXhlY3V0aW9uTWV0YWRhdGFFZGl0cywgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY29tcHV0ZVVuZG9SZWRvKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxOb3RlYm9va0lubGluZVZhcmlhYmxlc0NvbnRyb2xsZXI+KE5vdGVib29rSW5saW5lVmFyaWFibGVzQ29udHJvbGxlci5pZCk7XG5cdFx0Y29udHJvbGxlci5jbGVhck5vdGVib29rSW5saW5lRGVjb3JhdGlvbnMoKTtcblx0fVxufSk7XG5cbmludGVyZmFjZSBJTGFuZ3VhZ2VQaWNrSW5wdXQgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGxhbmd1YWdlSWQ6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElDaGFuZ2VDZWxsQ29udGV4dCBleHRlbmRzIElOb3RlYm9va0NlbGxBY3Rpb25Db250ZXh0IHtcblx0Ly8gVE9ET0ByZWJvcm5peCA6IGBjZWxsc2Bcblx0Ly8gcmFuZ2U6IElDZWxsUmFuZ2U7XG5cdGxhbmd1YWdlPzogc3RyaW5nO1xufVxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ2hhbmdlQ2VsbExhbmd1YWdlQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tDZWxsQWN0aW9uPElDZWxsUmFuZ2U+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENIQU5HRV9DRUxMX0xBTkdVQUdFLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGFuZ2VMYW5ndWFnZScsICdDaGFuZ2UgQ2VsbCBMYW5ndWFnZScpLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5TSksXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRk9DVVNFRCwgTk9URUJPT0tfRURJVE9SX0VESVRBQkxFLCBOT1RFQk9PS19DRUxMX0VESVRBQkxFKVxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhbmdlTGFuZ3VhZ2UnLCAnQ2hhbmdlIENlbGwgTGFuZ3VhZ2UnKSxcblx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG5hbWU6ICdyYW5nZScsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RoZSBjZWxsIHJhbmdlJyxcblx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHQncmVxdWlyZWQnOiBbJ3N0YXJ0JywgJ2VuZCddLFxuXHRcdFx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdFx0XHQnc3RhcnQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHQnZW5kJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bmFtZTogJ2xhbmd1YWdlJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIHRhcmdldCBjZWxsIGxhbmd1YWdlJyxcblx0XHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0Q2VsbENvbnRleHRGcm9tQXJncyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dD86IElDZWxsUmFuZ2UsIC4uLmFkZGl0aW9uYWxBcmdzOiBhbnlbXSk6IElDaGFuZ2VDZWxsQ29udGV4dCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFjb250ZXh0IHx8IHR5cGVvZiBjb250ZXh0LnN0YXJ0ICE9PSAnbnVtYmVyJyB8fCB0eXBlb2YgY29udGV4dC5lbmQgIT09ICdudW1iZXInIHx8IGNvbnRleHQuc3RhcnQgPj0gY29udGV4dC5lbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZSA9IGFkZGl0aW9uYWxBcmdzLmxlbmd0aCAmJiB0eXBlb2YgYWRkaXRpb25hbEFyZ3NbMF0gPT09ICdzdHJpbmcnID8gYWRkaXRpb25hbEFyZ3NbMF0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yQ29udGV4dCA9IHRoaXMuZ2V0RWRpdG9yQ29udGV4dEZyb21BcmdzT3JBY3RpdmUoYWNjZXNzb3IpO1xuXG5cdFx0aWYgKCFhY3RpdmVFZGl0b3JDb250ZXh0IHx8ICFhY3RpdmVFZGl0b3JDb250ZXh0Lm5vdGVib29rRWRpdG9yLmhhc01vZGVsKCkgfHwgY29udGV4dC5zdGFydCA+PSBhY3RpdmVFZGl0b3JDb250ZXh0Lm5vdGVib29rRWRpdG9yLmdldExlbmd0aCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVE9ET0ByZWJvcm5peCwgc3VwcG9ydCBtdWx0aXBsZSBjZWxsc1xuXHRcdHJldHVybiB7XG5cdFx0XHRub3RlYm9va0VkaXRvcjogYWN0aXZlRWRpdG9yQ29udGV4dC5ub3RlYm9va0VkaXRvcixcblx0XHRcdGNlbGw6IGFjdGl2ZUVkaXRvckNvbnRleHQubm90ZWJvb2tFZGl0b3IuY2VsbEF0KGNvbnRleHQuc3RhcnQpISxcblx0XHRcdGxhbmd1YWdlXG5cdFx0fTtcblx0fVxuXG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDaGFuZ2VDZWxsQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChjb250ZXh0Lmxhbmd1YWdlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNldExhbmd1YWdlKGNvbnRleHQsIGNvbnRleHQubGFuZ3VhZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNob3dMYW5ndWFnZVBpY2tlcihhY2Nlc3NvciwgY29udGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93TGFuZ3VhZ2VQaWNrZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDaGFuZ2VDZWxsQ29udGV4dCkge1xuXHRcdGNvbnN0IHRvcEl0ZW1zOiBJTGFuZ3VhZ2VQaWNrSW5wdXRbXSA9IFtdO1xuXHRcdGNvbnN0IG1haW5JdGVtczogSUxhbmd1YWdlUGlja0lucHV0W10gPSBbXTtcblxuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBtb2RlbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU1vZGVsU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZURldGVjdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qga2VybmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlKTtcblxuXHRcdGxldCBsYW5ndWFnZXMgPSBjb250ZXh0Lm5vdGVib29rRWRpdG9yLmFjdGl2ZUtlcm5lbD8uc3VwcG9ydGVkTGFuZ3VhZ2VzO1xuXHRcdGlmICghbGFuZ3VhZ2VzKSB7XG5cdFx0XHRjb25zdCBtYXRjaFJlc3VsdCA9IGtlcm5lbFNlcnZpY2UuZ2V0TWF0Y2hpbmdLZXJuZWwoY29udGV4dC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwpO1xuXHRcdFx0Y29uc3QgYWxsU3VwcG9ydGVkTGFuZ3VhZ2VzID0gbWF0Y2hSZXN1bHQuYWxsLmZsYXRNYXAoa2VybmVsID0+IGtlcm5lbC5zdXBwb3J0ZWRMYW5ndWFnZXMpO1xuXHRcdFx0bGFuZ3VhZ2VzID0gYWxsU3VwcG9ydGVkTGFuZ3VhZ2VzLmxlbmd0aCA+IDAgPyBhbGxTdXBwb3J0ZWRMYW5ndWFnZXMgOiBsYW5ndWFnZVNlcnZpY2UuZ2V0UmVnaXN0ZXJlZExhbmd1YWdlSWRzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXJMYW5ndWFnZXMgPSBuZXcgU2V0KFtcblx0XHRcdC4uLmxhbmd1YWdlcyxcblx0XHRcdCdtYXJrZG93bidcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyTGFuZ3VhZ2VzLmZvckVhY2gobGFuZ3VhZ2VJZCA9PiB7XG5cdFx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZztcblx0XHRcdGlmIChjb250ZXh0LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCA/IChsYW5ndWFnZUlkID09PSAnbWFya2Rvd24nKSA6IChsYW5ndWFnZUlkID09PSBjb250ZXh0LmNlbGwubGFuZ3VhZ2UpKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2xhbmd1YWdlRGVzY3JpcHRpb24nLCBcIih7MH0pIC0gQ3VycmVudCBMYW5ndWFnZVwiLCBsYW5ndWFnZUlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2xhbmd1YWdlRGVzY3JpcHRpb25Db25maWd1cmVkJywgXCIoezB9KVwiLCBsYW5ndWFnZUlkKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VOYW1lID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZUlkKTtcblx0XHRcdGlmICghbGFuZ3VhZ2VOYW1lKSB7XG5cdFx0XHRcdC8vIE5vdGVib29rIGhhcyB1bnJlY29nbml6ZWQgbGFuZ3VhZ2Vcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtOiBJTGFuZ3VhZ2VQaWNrSW5wdXQgPSB7XG5cdFx0XHRcdGxhYmVsOiBsYW5ndWFnZU5hbWUsXG5cdFx0XHRcdGljb25DbGFzc2VzOiBnZXRJY29uQ2xhc3Nlcyhtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgdGhpcy5nZXRGYWtlUmVzb3VyY2UobGFuZ3VhZ2VOYW1lLCBsYW5ndWFnZVNlcnZpY2UpKSxcblx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdGxhbmd1YWdlSWRcblx0XHRcdH07XG5cblx0XHRcdGlmIChsYW5ndWFnZUlkID09PSAnbWFya2Rvd24nIHx8IGxhbmd1YWdlSWQgPT09IGNvbnRleHQuY2VsbC5sYW5ndWFnZSkge1xuXHRcdFx0XHR0b3BJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bWFpbkl0ZW1zLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRtYWluSXRlbXMuc29ydCgoYSwgYikgPT4ge1xuXHRcdFx0cmV0dXJuIGEuZGVzY3JpcHRpb24ubG9jYWxlQ29tcGFyZShiLmRlc2NyaXB0aW9uKTtcblx0XHR9KTtcblxuXHRcdC8vIE9mZmVyIHRvIFwiQXV0byBEZXRlY3RcIlxuXHRcdGNvbnN0IGF1dG9EZXRlY3RNb2RlOiBJUXVpY2tQaWNrSXRlbSA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0b0RldGVjdCcsIFwiQXV0byBEZXRlY3RcIilcblx0XHR9O1xuXG5cdFx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0lucHV0W10gPSBbXG5cdFx0XHRhdXRvRGV0ZWN0TW9kZSxcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnbGFuZ3VhZ2VzUGlja3MnLCBcImxhbmd1YWdlcyAoaWRlbnRpZmllcilcIikgfSxcblx0XHRcdC4uLnRvcEl0ZW1zLFxuXHRcdFx0eyB0eXBlOiAnc2VwYXJhdG9yJyB9LFxuXHRcdFx0Li4ubWFpbkl0ZW1zXG5cdFx0XTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrTGFuZ3VhZ2VUb0NvbmZpZ3VyZScsIFwiU2VsZWN0IExhbmd1YWdlIE1vZGVcIikgfSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHNlbGVjdGlvbiA9PT0gYXV0b0RldGVjdE1vZGVcblx0XHRcdD8gYXdhaXQgbGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlLmRldGVjdExhbmd1YWdlKGNvbnRleHQuY2VsbC51cmkpXG5cdFx0XHQ6IChzZWxlY3Rpb24gYXMgSUxhbmd1YWdlUGlja0lucHV0KT8ubGFuZ3VhZ2VJZDtcblxuXHRcdGlmIChsYW5ndWFnZUlkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnNldExhbmd1YWdlKGNvbnRleHQsIGxhbmd1YWdlSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2V0TGFuZ3VhZ2UoY29udGV4dDogSUNoYW5nZUNlbGxDb250ZXh0LCBsYW5ndWFnZUlkOiBzdHJpbmcpIHtcblx0XHRhd2FpdCBzZXRDZWxsVG9MYW5ndWFnZShsYW5ndWFnZUlkLCBjb250ZXh0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb3BpZWQgZnJvbSBlZGl0b3JTdGF0dXMudHNcblx0ICovXG5cdHByaXZhdGUgZ2V0RmFrZVJlc291cmNlKGxhbmc6IHN0cmluZywgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgZmFrZVJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBsYW5ndWFnZUlkID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlSWRCeUxhbmd1YWdlTmFtZShsYW5nKTtcblx0XHRpZiAobGFuZ3VhZ2VJZCkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGxhbmd1YWdlU2VydmljZS5nZXRFeHRlbnNpb25zKGxhbmd1YWdlSWQpO1xuXHRcdFx0aWYgKGV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGZha2VSZXNvdXJjZSA9IFVSSS5maWxlKGV4dGVuc2lvbnNbMF0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZmlsZW5hbWVzID0gbGFuZ3VhZ2VTZXJ2aWNlLmdldEZpbGVuYW1lcyhsYW5ndWFnZUlkKTtcblx0XHRcdFx0aWYgKGZpbGVuYW1lcy5sZW5ndGgpIHtcblx0XHRcdFx0XHRmYWtlUmVzb3VyY2UgPSBVUkkuZmlsZShmaWxlbmFtZXNbMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZha2VSZXNvdXJjZTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBEZXRlY3RDZWxsTGFuZ3VhZ2VBY3Rpb24gZXh0ZW5kcyBOb3RlYm9va0NlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogREVURUNUX0NFTExfTEFOR1VBR0UsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdkZXRlY3RMYW5ndWFnZScsIFwiQWNjZXB0IERldGVjdGVkIExhbmd1YWdlIGZvciBDZWxsXCIpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfRURJVEFCTEUpLFxuXHRcdFx0a2V5YmluZGluZzogeyBwcmltYXJ5OiBLZXlDb2RlLktleUQgfCBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0LCB3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiB9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ2VsbEFjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYW5ndWFnZURldGVjdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qga2VybmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBrZXJuZWwgPSBrZXJuZWxTZXJ2aWNlLmdldFNlbGVjdGVkT3JTdWdnZXN0ZWRLZXJuZWwoY29udGV4dC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwpO1xuXHRcdGNvbnN0IHByb3ZpZGVyTGFuZ3VhZ2VzID0gWy4uLmtlcm5lbD8uc3VwcG9ydGVkTGFuZ3VhZ2VzID8/IFtdXTtcblx0XHRwcm92aWRlckxhbmd1YWdlcy5wdXNoKCdtYXJrZG93bicpO1xuXHRcdGNvbnN0IGRldGVjdGlvbiA9IGF3YWl0IGxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZS5kZXRlY3RMYW5ndWFnZShjb250ZXh0LmNlbGwudXJpLCBwcm92aWRlckxhbmd1YWdlcyk7XG5cdFx0aWYgKGRldGVjdGlvbikge1xuXHRcdFx0c2V0Q2VsbFRvTGFuZ3VhZ2UoZGV0ZWN0aW9uLCBjb250ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS53YXJuKGxvY2FsaXplKCdub0RldGVjdGlvbicsIFwiVW5hYmxlIHRvIGRldGVjdCBjZWxsIGxhbmd1YWdlXCIpKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5hc3luYyBmdW5jdGlvbiBzZXRDZWxsVG9MYW5ndWFnZShsYW5ndWFnZUlkOiBzdHJpbmcsIGNvbnRleHQ6IElDaGFuZ2VDZWxsQ29udGV4dCkge1xuXHRpZiAobGFuZ3VhZ2VJZCA9PT0gJ21hcmtkb3duJyAmJiBjb250ZXh0LmNlbGw/Lmxhbmd1YWdlICE9PSAnbWFya2Rvd24nKSB7XG5cdFx0Y29uc3QgaWR4ID0gY29udGV4dC5ub3RlYm9va0VkaXRvci5nZXRDZWxsSW5kZXgoY29udGV4dC5jZWxsKTtcblx0XHRhd2FpdCBjaGFuZ2VDZWxsVG9LaW5kKENlbGxLaW5kLk1hcmt1cCwgeyBjZWxsOiBjb250ZXh0LmNlbGwsIG5vdGVib29rRWRpdG9yOiBjb250ZXh0Lm5vdGVib29rRWRpdG9yLCB1aTogdHJ1ZSB9LCAnbWFya2Rvd24nLCBNaW1lcy5tYXJrZG93bik7XG5cdFx0Y29uc3QgbmV3Q2VsbCA9IGNvbnRleHQubm90ZWJvb2tFZGl0b3IuY2VsbEF0KGlkeCk7XG5cblx0XHRpZiAobmV3Q2VsbCkge1xuXHRcdFx0YXdhaXQgY29udGV4dC5ub3RlYm9va0VkaXRvci5mb2N1c05vdGVib29rQ2VsbChuZXdDZWxsLCAnZWRpdG9yJyk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKGxhbmd1YWdlSWQgIT09ICdtYXJrZG93bicgJiYgY29udGV4dC5jZWxsPy5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuTWFya3VwKSB7XG5cdFx0YXdhaXQgY2hhbmdlQ2VsbFRvS2luZChDZWxsS2luZC5Db2RlLCB7IGNlbGw6IGNvbnRleHQuY2VsbCwgbm90ZWJvb2tFZGl0b3I6IGNvbnRleHQubm90ZWJvb2tFZGl0b3IsIHVpOiB0cnVlIH0sIGxhbmd1YWdlSWQpO1xuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IGluZGV4ID0gY29udGV4dC5ub3RlYm9va0VkaXRvci50ZXh0TW9kZWwuY2VsbHMuaW5kZXhPZihjb250ZXh0LmNlbGwubW9kZWwpO1xuXHRcdGNvbnRleHQubm90ZWJvb2tFZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoXG5cdFx0XHRbeyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLkNlbGxMYW5ndWFnZSwgaW5kZXgsIGxhbmd1YWdlOiBsYW5ndWFnZUlkIH1dLFxuXHRcdFx0dHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgIWNvbnRleHQubm90ZWJvb2tFZGl0b3IuaXNSZWFkT25seVxuXHRcdCk7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNlbGVjdE5vdGVib29rSW5kZW50YXRpb24gZXh0ZW5kcyBOb3RlYm9va0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTRUxFQ1RfTk9URUJPT0tfSU5ERU5UQVRJT05fSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzZWxlY3ROb3RlYm9va0luZGVudGF0aW9uJywgJ1NlbGVjdCBJbmRlbnRhdGlvbicpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SLCBOT1RFQk9PS19FRElUT1JfRURJVEFCTEUsIE5PVEVCT09LX0NFTExfRURJVEFCTEUpLFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnNob3dOb3RlYm9va0luZGVudGF0aW9uUGlja2VyKGFjY2Vzc29yLCBjb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd05vdGVib29rSW5kZW50YXRpb25QaWNrZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElOb3RlYm9va0FjdGlvbkNvbnRleHQpIHtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBhY3RpdmVOb3RlYm9vayA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lKTtcblx0XHRpZiAoIWFjdGl2ZU5vdGVib29rIHx8IGFjdGl2ZU5vdGVib29rLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm9Ob3RlYm9va0VkaXRvcicsIFwiTm8gbm90ZWJvb2sgZWRpdG9yIGFjdGl2ZSBhdCB0aGlzIHRpbWVcIikgfV0pO1xuXHRcdH1cblxuXHRcdGlmIChhY3RpdmVOb3RlYm9vay5pc1JlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm4gcXVpY2tJbnB1dFNlcnZpY2UucGljayhbeyBsYWJlbDogbG9jYWxpemUoJ25vV3JpdGFibGVDb2RlRWRpdG9yJywgXCJUaGUgYWN0aXZlIG5vdGVib29rIGVkaXRvciBpcyByZWFkLW9ubHkuXCIpIH1dKTtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrczogUXVpY2tQaWNrSW5wdXQ8SVF1aWNrUGlja0l0ZW0gJiB7IHJ1bigpOiB2b2lkIH0+W10gPSBbXG5cdFx0XHRuZXcgTm90ZWJvb2tJbmRlbnRVc2luZ1RhYnMoKSwgLy8gaW5kZW50IHVzaW5nIHRhYnNcblx0XHRcdG5ldyBOb3RlYm9va0luZGVudFVzaW5nU3BhY2VzKCksIC8vIGluZGVudCB1c2luZyBzcGFjZXNcblx0XHRcdG5ldyBOb3RlYm9va0NoYW5nZVRhYkRpc3BsYXlTaXplKCksIC8vIGNoYW5nZSB0YWIgc2l6ZVxuXHRcdFx0bmV3IE5vdGVib29rSW5kZW50YXRpb25Ub1RhYnNBY3Rpb24oKSwgLy8gY29udmVydCBpbmRlbnRhdGlvbiB0byB0YWJzXG5cdFx0XHRuZXcgTm90ZWJvb2tJbmRlbnRhdGlvblRvU3BhY2VzQWN0aW9uKCkgLy8gY29udmVydCBpbmRlbnRhdGlvbiB0byBzcGFjZXNcblx0XHRdLm1hcChpdGVtID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBpdGVtLmRlc2MuaWQsXG5cdFx0XHRcdGxhYmVsOiBpdGVtLmRlc2MudGl0bGUudG9TdHJpbmcoKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oaXRlbS5ydW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0cGlja3Muc3BsaWNlKDMsIDAsIHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnaW5kZW50Q29udmVydCcsIFwiY29udmVydCBmaWxlXCIpIH0pO1xuXHRcdHBpY2tzLnVuc2hpZnQoeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdpbmRlbnRWaWV3JywgXCJjaGFuZ2Ugdmlld1wiKSB9KTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2socGlja3MsIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdwaWNrQWN0aW9uJywgXCJTZWxlY3QgQWN0aW9uXCIpLCBtYXRjaE9uRGV0YWlsOiB0cnVlIH0pO1xuXHRcdGlmICghYWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFjdGlvbi5ydW4oKTtcblx0XHRjb250ZXh0Lm5vdGVib29rRWRpdG9yLmZvY3VzKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbW1lbnRTZWxlY3RlZENlbGxzQWN0aW9uIGV4dGVuZHMgTm90ZWJvb2tNdWx0aUNlbGxBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ09NTUVOVF9TRUxFQ1RFRF9DRUxMU19JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29tbWVudFNlbGVjdGVkQ2VsbHMnLCBcIkNvbW1lbnQgU2VsZWN0ZWQgQ2VsbHNcIiksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRk9DVVNFRCxcblx0XHRcdFx0XHROT1RFQk9PS19FRElUT1JfRURJVEFCTEUsXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2xhc2gsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSU5vdGVib29rQ29tbWFuZENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnRleHQuc2VsZWN0ZWRDZWxscy5mb3JFYWNoKGFzeW5jIGNlbGxWaWV3TW9kZWwgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gYXdhaXQgY2VsbFZpZXdNb2RlbC5yZXNvbHZlVGV4dE1vZGVsKCk7XG5cblx0XHRcdGNvbnN0IGNvbW1lbnRzT3B0aW9ucyA9IGNlbGxWaWV3TW9kZWwuY29tbWVudE9wdGlvbnM7XG5cdFx0XHRjb25zdCBjZWxsQ29tbWVudENvbW1hbmQgPSBuZXcgTGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSwgdGV4dE1vZGVsLmdldExpbmVNYXhDb2x1bW4odGV4dE1vZGVsLmdldExpbmVDb3VudCgpKSksIC8vIGNvbW1lbnQgdGhlIGVudGlyZSBjZWxsXG5cdFx0XHRcdHRleHRNb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZSxcblx0XHRcdFx0VHlwZS5Ub2dnbGUsXG5cdFx0XHRcdGNvbW1lbnRzT3B0aW9ucy5pbnNlcnRTcGFjZSA/PyB0cnVlLFxuXHRcdFx0XHRjb21tZW50c09wdGlvbnMuaWdub3JlRW1wdHlMaW5lcyA/PyB0cnVlLFxuXHRcdFx0XHRmYWxzZVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gc3RvcmUgYW55IHNlbGVjdGlvbnMgdGhhdCBhcmUgaW4gdGhlIGNlbGwsIGFsbG93cyB0aGVtIHRvIGJlIHNoaWZ0ZWQgYnkgY29tbWVudHMgYW5kIHByZXNlcnZlZFxuXHRcdFx0Y29uc3QgY2VsbEVkaXRvclNlbGVjdGlvbnMgPSBjZWxsVmlld01vZGVsLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdGNvbnN0IGluaXRpYWxUcmFja2VkUmFuZ2VzSURzOiBzdHJpbmdbXSA9IGNlbGxFZGl0b3JTZWxlY3Rpb25zLm1hcChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGV4dE1vZGVsLl9zZXRUcmFja2VkUmFuZ2UobnVsbCwgc2VsZWN0aW9uLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Q29tbWFuZEV4ZWN1dG9yLmV4ZWN1dGVDb21tYW5kcyh0ZXh0TW9kZWwsIGNlbGxFZGl0b3JTZWxlY3Rpb25zLCBbY2VsbENvbW1lbnRDb21tYW5kXSk7XG5cblx0XHRcdGNvbnN0IG5ld1RyYWNrZWRTZWxlY3Rpb25zID0gaW5pdGlhbFRyYWNrZWRSYW5nZXNJRHMubWFwKGkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGV4dE1vZGVsLl9nZXRUcmFja2VkUmFuZ2UoaSk7XG5cdFx0XHR9KS5maWx0ZXIociA9PiAhIXIpLm1hcCgocmFuZ2UsKSA9PiB7XG5cdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4sIHJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlLmVuZENvbHVtbik7XG5cdFx0XHR9KTtcblx0XHRcdGNlbGxWaWV3TW9kZWwuc2V0U2VsZWN0aW9ucyhuZXdUcmFja2VkU2VsZWN0aW9ucyA/PyBbXSk7XG5cdFx0fSk7IC8vIGVuZCBvZiBjZWxscyBmb3JFYWNoXG5cdH1cblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFVBQVUsU0FBUyxjQUFjO0FBQzFDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFFcEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxvQkFBb0IsWUFBWTtBQUN6QyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsUUFBUSx1QkFBdUI7QUFDeEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUIsOEJBQThCO0FBQzVELFNBQThCLHNCQUFzQjtBQUNwRCxTQUFTLDZCQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwRDtBQUNuRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGtCQUFrQix1QkFBdUI7QUFDbEQsU0FBUywwQkFBMEIsNEJBQTRCLGtCQUErRixzQ0FBc0MsZ0JBQWdCLG9CQUFvQix5QkFBeUIsMEJBQTBCLDRCQUE0QjtBQUN2VCxTQUFTLDhCQUE4QiwyQkFBMkIseUJBQXlC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
