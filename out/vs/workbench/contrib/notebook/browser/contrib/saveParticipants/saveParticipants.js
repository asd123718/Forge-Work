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
import { HierarchicalKind } from "../../../../../../base/common/hierarchicalKind.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { IBulkEditService, ResourceTextEdit } from "../../../../../../editor/browser/services/bulkEditService.js";
import { trimTrailingWhitespace } from "../../../../../../editor/common/commands/trimTrailingWhitespaceCommand.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CodeActionTriggerType } from "../../../../../../editor/common/languages.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from "../../../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../../../../../editor/contrib/codeAction/common/types.js";
import { FormattingMode, getDocumentFormattingEditsWithSelectedProvider } from "../../../../../../editor/contrib/format/browser/format.js";
import { SnippetController2 } from "../../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { localize } from "../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { Extensions as WorkbenchContributionsExtensions } from "../../../../../common/contributions.js";
import { SaveReason } from "../../../../../common/editor.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import { CellKind, NotebookSetting } from "../../../common/notebookCommon.js";
import { NotebookFileWorkingCopyModel } from "../../../common/notebookEditorModel.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IWorkingCopyFileService } from "../../../../../services/workingCopy/common/workingCopyFileService.js";
import { NotebookMultiCursorController, NotebookMultiCursorState } from "../multicursor/notebookMulticursor.js";
class NotebookSaveParticipant {
  constructor(_editorService) {
    this._editorService = _editorService;
  }
  canParticipate() {
    const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
    const controller = editor?.getContribution(NotebookMultiCursorController.id);
    if (!controller) {
      return true;
    }
    return controller.getState() !== NotebookMultiCursorState.Editing;
  }
}
let FormatOnSaveParticipant = class {
  constructor(editorWorkerService, languageFeaturesService, instantiationService, textModelService, bulkEditService, configurationService) {
    this.editorWorkerService = editorWorkerService;
    this.languageFeaturesService = languageFeaturesService;
    this.instantiationService = instantiationService;
    this.textModelService = textModelService;
    this.bulkEditService = bulkEditService;
    this.configurationService = configurationService;
  }
  async participate(workingCopy, context, progress, token) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    }
    const enabled = this.configurationService.getValue(NotebookSetting.formatOnSave);
    if (!enabled) {
      return void 0;
    }
    progress.report({ message: localize("notebookFormatSave.formatting", "Formatting") });
    const notebook = workingCopy.model.notebookModel;
    const formatApplied = await this.instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, progress, token);
    const disposable = new DisposableStore();
    try {
      if (!formatApplied) {
        const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
          const ref = await this.textModelService.createModelReference(cell.uri);
          disposable.add(ref);
          const model = ref.object.textEditorModel;
          const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
            this.editorWorkerService,
            this.languageFeaturesService,
            model,
            FormattingMode.Silent,
            token
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
          { label: localize("formatNotebook", "Format Notebook"), code: "undoredo.formatNotebook" }
        );
      }
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
FormatOnSaveParticipant = __decorateClass([
  __decorateParam(0, IEditorWorkerService),
  __decorateParam(1, ILanguageFeaturesService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IBulkEditService),
  __decorateParam(5, IConfigurationService)
], FormatOnSaveParticipant);
let TrimWhitespaceParticipant = class extends NotebookSaveParticipant {
  constructor(configurationService, editorService, textModelService, bulkEditService) {
    super(editorService);
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.textModelService = textModelService;
    this.bulkEditService = bulkEditService;
  }
  async participate(workingCopy, context, progress, _token) {
    const trimTrailingWhitespaceOption = this.configurationService.getValue("files.trimTrailingWhitespace");
    const trimInRegexAndStrings = this.configurationService.getValue("files.trimTrailingWhitespaceInRegexAndStrings");
    if (trimTrailingWhitespaceOption && this.canParticipate()) {
      await this.doTrimTrailingWhitespace(workingCopy, context.reason === SaveReason.AUTO, trimInRegexAndStrings, progress);
    }
  }
  async doTrimTrailingWhitespace(workingCopy, isAutoSaved, trimInRegexesAndStrings, progress) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    const disposable = new DisposableStore();
    const notebook = workingCopy.model.notebookModel;
    const activeCellEditor = getActiveCellCodeEditor(this.editorService);
    let cursors = [];
    let prevSelection = [];
    try {
      const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
        if (cell.cellKind !== CellKind.Code) {
          return [];
        }
        const ref = await this.textModelService.createModelReference(cell.uri);
        disposable.add(ref);
        const model = ref.object.textEditorModel;
        const isActiveCell = activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString();
        if (isActiveCell) {
          prevSelection = activeCellEditor.getSelections() ?? [];
          if (isAutoSaved) {
            cursors = prevSelection.map((s) => s.getPosition());
            const snippetsRange = SnippetController2.get(activeCellEditor)?.getSessionEnclosingRange();
            if (snippetsRange) {
              for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
                cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
              }
            }
          }
        }
        const ops = trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings);
        if (!ops.length) {
          return [];
        }
        return ops.map((op) => new ResourceTextEdit(model.uri, { ...op, text: op.text || "" }, model.getVersionId()));
      }));
      const filteredEdits = allCellEdits.flat().filter((edit) => edit !== void 0);
      await this.bulkEditService.apply(filteredEdits, { label: localize("trimNotebookWhitespace", "Notebook Trim Trailing Whitespace"), code: "undoredo.notebookTrimTrailingWhitespace" });
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
TrimWhitespaceParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IBulkEditService)
], TrimWhitespaceParticipant);
let TrimFinalNewLinesParticipant = class extends NotebookSaveParticipant {
  constructor(configurationService, editorService, bulkEditService) {
    super(editorService);
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.bulkEditService = bulkEditService;
  }
  async participate(workingCopy, context, progress, _token) {
    if (this.configurationService.getValue("files.trimFinalNewlines") && this.canParticipate()) {
      await this.doTrimFinalNewLines(workingCopy, context.reason === SaveReason.AUTO, progress);
    }
  }
  /**
   * returns 0 if the entire file is empty
   */
  findLastNonEmptyLine(textBuffer) {
    for (let lineNumber = textBuffer.getLineCount(); lineNumber >= 1; lineNumber--) {
      const lineLength = textBuffer.getLineLength(lineNumber);
      if (lineLength) {
        return lineNumber;
      }
    }
    return 0;
  }
  async doTrimFinalNewLines(workingCopy, isAutoSaved, progress) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    const disposable = new DisposableStore();
    const notebook = workingCopy.model.notebookModel;
    const activeCellEditor = getActiveCellCodeEditor(this.editorService);
    try {
      const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
        if (cell.cellKind !== CellKind.Code) {
          return;
        }
        let cannotTouchLineNumber = 0;
        const isActiveCell = activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString();
        if (isAutoSaved && isActiveCell) {
          const selections = activeCellEditor.getSelections() ?? [];
          for (const sel of selections) {
            cannotTouchLineNumber = Math.max(cannotTouchLineNumber, sel.selectionStartLineNumber);
          }
        }
        const textBuffer = cell.textBuffer;
        const lastNonEmptyLine = this.findLastNonEmptyLine(textBuffer);
        const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
        if (deleteFromLineNumber > textBuffer.getLineCount()) {
          return;
        }
        const deletionRange = new Range(deleteFromLineNumber, 1, textBuffer.getLineCount(), textBuffer.getLineLastNonWhitespaceColumn(textBuffer.getLineCount()));
        if (deletionRange.isEmpty()) {
          return;
        }
        return new ResourceTextEdit(cell.uri, { range: deletionRange, text: "" }, cell.textModel?.getVersionId());
      }));
      const filteredEdits = allCellEdits.flat().filter((edit) => edit !== void 0);
      await this.bulkEditService.apply(filteredEdits, { label: localize("trimNotebookNewlines", "Trim Final New Lines"), code: "undoredo.trimFinalNewLines" });
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
TrimFinalNewLinesParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IBulkEditService)
], TrimFinalNewLinesParticipant);
let InsertFinalNewLineParticipant = class extends NotebookSaveParticipant {
  constructor(configurationService, bulkEditService, editorService) {
    super(editorService);
    this.configurationService = configurationService;
    this.bulkEditService = bulkEditService;
    this.editorService = editorService;
  }
  async participate(workingCopy, context, progress, _token) {
    if (this.configurationService.getValue(NotebookSetting.insertFinalNewline) && this.canParticipate()) {
      await this.doInsertFinalNewLine(workingCopy, context.reason === SaveReason.AUTO, progress);
    }
  }
  async doInsertFinalNewLine(workingCopy, isAutoSaved, progress) {
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    const disposable = new DisposableStore();
    const notebook = workingCopy.model.notebookModel;
    const activeCellEditor = getActiveCellCodeEditor(this.editorService);
    let selections;
    if (activeCellEditor) {
      selections = activeCellEditor.getSelections() ?? [];
    }
    try {
      const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
        if (cell.cellKind !== CellKind.Code) {
          return;
        }
        const lineCount = cell.textBuffer.getLineCount();
        const lastLineIsEmptyOrWhitespace = cell.textBuffer.getLineFirstNonWhitespaceColumn(lineCount) === 0;
        if (!lineCount || lastLineIsEmptyOrWhitespace) {
          return;
        }
        return new ResourceTextEdit(cell.uri, { range: new Range(lineCount + 1, cell.textBuffer.getLineLength(lineCount), lineCount + 1, cell.textBuffer.getLineLength(lineCount)), text: cell.textBuffer.getEOL() }, cell.textModel?.getVersionId());
      }));
      const filteredEdits = allCellEdits.filter((edit) => edit !== void 0);
      await this.bulkEditService.apply(filteredEdits, { label: localize("insertFinalNewLine", "Insert Final New Line"), code: "undoredo.insertFinalNewLine" });
      if (activeCellEditor && selections) {
        activeCellEditor.setSelections(selections);
      }
    } finally {
      progress.report({ increment: 100 });
      disposable.dispose();
    }
  }
};
InsertFinalNewLineParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IBulkEditService),
  __decorateParam(2, IEditorService)
], InsertFinalNewLineParticipant);
let CodeActionOnSaveParticipant = class {
  constructor(configurationService, logService, workspaceTrustManagementService, textModelService, instantiationService) {
    this.configurationService = configurationService;
    this.logService = logService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.textModelService = textModelService;
    this.instantiationService = instantiationService;
  }
  async participate(workingCopy, context, progress, token) {
    const isTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
    if (!isTrusted) {
      return;
    }
    if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
      return;
    }
    let saveTrigger = "";
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    } else if (context.reason === SaveReason.EXPLICIT) {
      saveTrigger = "explicit";
    } else {
      return void 0;
    }
    const notebookModel = workingCopy.model.notebookModel;
    const setting = this.configurationService.getValue(NotebookSetting.codeActionsOnSave);
    const settingItems = Array.isArray(setting) ? setting : Object.keys(setting).filter((x) => setting[x]);
    const allCodeActions = this.createCodeActionsOnSave(settingItems);
    const excludedActions = allCodeActions.filter((x) => setting[x.value] === "never" || setting[x.value] === false);
    const includedActions = allCodeActions.filter((x) => setting[x.value] === saveTrigger || setting[x.value] === true);
    const editorCodeActionsOnSave = includedActions.filter((x) => !CodeActionKind.Notebook.contains(x));
    const notebookCodeActionsOnSave = includedActions.filter((x) => CodeActionKind.Notebook.contains(x));
    if (notebookCodeActionsOnSave.length) {
      const nbDisposable = new DisposableStore();
      progress.report({ message: localize("notebookSaveParticipants.notebookCodeActions", "Running 'Notebook' code actions") });
      try {
        const cell = notebookModel.cells[0];
        const ref = await this.textModelService.createModelReference(cell.uri);
        nbDisposable.add(ref);
        const textEditorModel = ref.object.textEditorModel;
        await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, notebookCodeActionsOnSave, excludedActions, progress, token);
      } catch {
        this.logService.error("Failed to apply notebook code action on save");
      } finally {
        progress.report({ increment: 100 });
        nbDisposable.dispose();
      }
    }
    if (editorCodeActionsOnSave.length) {
      if (!Array.isArray(setting)) {
        editorCodeActionsOnSave.sort((a, b) => {
          if (CodeActionKind.SourceFixAll.contains(a)) {
            if (CodeActionKind.SourceFixAll.contains(b)) {
              return 0;
            }
            return -1;
          }
          if (CodeActionKind.SourceFixAll.contains(b)) {
            return 1;
          }
          return 0;
        });
      }
      const cellDisposable = new DisposableStore();
      progress.report({ message: localize("notebookSaveParticipants.cellCodeActions", "Running 'Cell' code actions") });
      try {
        await Promise.all(notebookModel.cells.map(async (cell) => {
          const ref = await this.textModelService.createModelReference(cell.uri);
          cellDisposable.add(ref);
          const textEditorModel = ref.object.textEditorModel;
          await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, editorCodeActionsOnSave, excludedActions, progress, token);
        }));
      } catch {
        this.logService.error("Failed to apply code action on save");
      } finally {
        progress.report({ increment: 100 });
        cellDisposable.dispose();
      }
    }
  }
  createCodeActionsOnSave(settingItems) {
    const kinds = settingItems.map((x) => new HierarchicalKind(x));
    return kinds.filter((kind) => {
      return kinds.every((otherKind) => otherKind.equals(kind) || !otherKind.contains(kind));
    });
  }
};
CodeActionOnSaveParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, ITextModelService),
  __decorateParam(4, IInstantiationService)
], CodeActionOnSaveParticipant);
class CodeActionParticipantUtils {
  static async checkAndRunFormatCodeAction(accessor, notebookModel, progress, token) {
    const instantiationService = accessor.get(IInstantiationService);
    const textModelService = accessor.get(ITextModelService);
    const logService = accessor.get(ILogService);
    const configurationService = accessor.get(IConfigurationService);
    const formatDisposable = new DisposableStore();
    let formatResult = false;
    progress.report({ message: localize("notebookSaveParticipants.formatCodeActions", "Running 'Format' code actions") });
    try {
      const cell = notebookModel.cells[0];
      const ref = await textModelService.createModelReference(cell.uri);
      formatDisposable.add(ref);
      const textEditorModel = ref.object.textEditorModel;
      const defaultFormatterExtId = configurationService.getValue(NotebookSetting.defaultFormatter);
      formatResult = await instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveFormatCodeAction, textEditorModel, new HierarchicalKind("notebook.format"), [], defaultFormatterExtId, progress, token);
    } catch {
      logService.error("Failed to apply notebook format action on save");
    } finally {
      progress.report({ increment: 100 });
      formatDisposable.dispose();
    }
    return formatResult;
  }
  static async applyOnSaveGenericCodeActions(accessor, model, codeActionsOnSave, excludes, progress, token) {
    const instantiationService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const logService = accessor.get(ILogService);
    const getActionProgress = new class {
      constructor() {
        this._names = /* @__PURE__ */ new Set();
      }
      _report() {
        progress.report({
          message: localize(
            { key: "codeaction.get2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
            "Getting code actions from '{0}' ([configure]({1})).",
            [...this._names].map((name) => `'${name}'`).join(", "),
            "command:workbench.action.openSettings?%5B%22notebook.codeActionsOnSave%22%5D"
          )
        });
      }
      report(provider) {
        if (provider.displayName && !this._names.has(provider.displayName)) {
          this._names.add(provider.displayName);
          this._report();
        }
      }
    }();
    for (const codeActionKind of codeActionsOnSave) {
      const actionsToRun = await CodeActionParticipantUtils.getActionsToRun(model, codeActionKind, excludes, languageFeaturesService, getActionProgress, token);
      if (token.isCancellationRequested) {
        actionsToRun.dispose();
        return;
      }
      try {
        for (const action of actionsToRun.validActions) {
          const codeActionEdits = action.action.edit?.edits;
          let breakFlag = false;
          if (!action.action.kind?.startsWith("notebook")) {
            for (const edit of codeActionEdits ?? []) {
              const workspaceTextEdit = edit;
              if (workspaceTextEdit.resource && isEqual(workspaceTextEdit.resource, model.uri)) {
                continue;
              } else {
                breakFlag = true;
                break;
              }
            }
          }
          if (breakFlag) {
            logService.warn("Failed to apply code action on save, applied to multiple resources.");
            continue;
          }
          progress.report({ message: localize("codeAction.apply", "Applying code action '{0}'.", action.action.title) });
          await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
          if (token.isCancellationRequested) {
            return;
          }
        }
      } catch {
      } finally {
        actionsToRun.dispose();
      }
    }
  }
  static async applyOnSaveFormatCodeAction(accessor, model, formatCodeActionOnSave, excludes, extensionId, progress, token) {
    const instantiationService = accessor.get(IInstantiationService);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const logService = accessor.get(ILogService);
    const getActionProgress = new class {
      constructor() {
        this._names = /* @__PURE__ */ new Set();
      }
      _report() {
        progress.report({
          message: localize(
            { key: "codeaction.get2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
            "Getting code actions from '{0}' ([configure]({1})).",
            [...this._names].map((name) => `'${name}'`).join(", "),
            "command:workbench.action.openSettings?%5B%22notebook.defaultFormatter%22%5D"
          )
        });
      }
      report(provider) {
        if (provider.displayName && !this._names.has(provider.displayName)) {
          this._names.add(provider.displayName);
          this._report();
        }
      }
    }();
    const providedActions = await CodeActionParticipantUtils.getActionsToRun(model, formatCodeActionOnSave, excludes, languageFeaturesService, getActionProgress, token);
    if (providedActions.validActions.length > 1 && !extensionId) {
      logService.warn("More than one format code action is provided, the 0th one will be used. A default can be specified via `notebook.defaultFormatter` in your settings.");
    }
    if (token.isCancellationRequested) {
      providedActions.dispose();
      return false;
    }
    try {
      const action = extensionId ? providedActions.validActions.find((action2) => action2.provider?.extensionId === extensionId) : providedActions.validActions[0];
      if (!action) {
        return false;
      }
      progress.report({ message: localize("codeAction.apply", "Applying code action '{0}'.", action.action.title) });
      await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
      if (token.isCancellationRequested) {
        return false;
      }
    } catch {
      logService.error("Failed to apply notebook format code action on save");
      return false;
    } finally {
      providedActions.dispose();
    }
    return true;
  }
  // @Yoyokrazy this could likely be modified to leverage the extensionID, therefore not getting actions from providers unnecessarily -- future work
  static getActionsToRun(model, codeActionKind, excludes, languageFeaturesService, progress, token) {
    return getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
      type: CodeActionTriggerType.Invoke,
      triggerAction: CodeActionTriggerSource.OnSave,
      filter: { include: codeActionKind, excludes, includeSourceActions: true }
    }, progress, token);
  }
}
function getActiveCellCodeEditor(editorService) {
  const activePane = editorService.activeEditorPane;
  const notebookEditor = getNotebookEditorFromEditorPane(activePane);
  const activeCodeEditor = notebookEditor?.activeCodeEditor;
  return activeCodeEditor;
}
let SaveParticipantsContribution = class extends Disposable {
  constructor(instantiationService, workingCopyFileService) {
    super();
    this.instantiationService = instantiationService;
    this.workingCopyFileService = workingCopyFileService;
    this.registerSaveParticipants();
  }
  registerSaveParticipants() {
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimWhitespaceParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(InsertFinalNewLineParticipant)));
    this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));
  }
};
SaveParticipantsContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkingCopyFileService)
], SaveParticipantsContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
export {
  CodeActionParticipantUtils,
  NotebookSaveParticipant,
  SaveParticipantsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxzYXZlUGFydGljaXBhbnRzXFxzYXZlUGFydGljaXBhbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElCdWxrRWRpdFNlcnZpY2UsIFJlc291cmNlRWRpdCwgUmVzb3VyY2VUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2J1bGtFZGl0U2VydmljZS5qcyc7XG5pbXBvcnQgeyB0cmltVHJhaWxpbmdXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb21tYW5kcy90cmltVHJhaWxpbmdXaGl0ZXNwYWNlQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25Qcm92aWRlciwgQ29kZUFjdGlvblRyaWdnZXJUeXBlLCBJV29ya3NwYWNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJUmVhZG9ubHlUZXh0QnVmZmVyLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV29ya2VyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFwcGx5Q29kZUFjdGlvblJlYXNvbiwgYXBwbHlDb2RlQWN0aW9uLCBnZXRDb2RlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25JdGVtLCBDb2RlQWN0aW9uS2luZCwgQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBGb3JtYXR0aW5nTW9kZSwgZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNXaXRoU2VsZWN0ZWRQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Zvcm1hdC9icm93c2VyL2Zvcm1hdC5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU3RlcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hDb250cmlidXRpb25zRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRWRpdG9yTW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5LCBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vc3RvcmVkRmlsZVdvcmtpbmdDb3B5LmpzJztcbmltcG9ydCB7IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQsIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0LCBJV29ya2luZ0NvcHlGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weUZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rTXVsdGlDdXJzb3JDb250cm9sbGVyLCBOb3RlYm9va011bHRpQ3Vyc29yU3RhdGUgfSBmcm9tICcuLi9tdWx0aWN1cnNvci9ub3RlYm9va011bHRpY3Vyc29yLmpzJztcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIE5vdGVib29rU2F2ZVBhcnRpY2lwYW50IGltcGxlbWVudHMgSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHsgfVxuXHRhYnN0cmFjdCBwYXJ0aWNpcGF0ZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBjb250ZXh0OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPjtcblxuXHRwcm90ZWN0ZWQgY2FuUGFydGljaXBhdGUoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZWRpdG9yID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBlZGl0b3I/LmdldENvbnRyaWJ1dGlvbjxOb3RlYm9va011bHRpQ3Vyc29yQ29udHJvbGxlcj4oTm90ZWJvb2tNdWx0aUN1cnNvckNvbnRyb2xsZXIuaWQpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRyb2xsZXIuZ2V0U3RhdGUoKSAhPT0gTm90ZWJvb2tNdWx0aUN1cnNvclN0YXRlLkVkaXRpbmc7XG5cdH1cbn1cblxuY2xhc3MgRm9ybWF0T25TYXZlUGFydGljaXBhbnQgaW1wbGVtZW50cyBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JXb3JrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yV29ya2VyU2VydmljZTogSUVkaXRvcldvcmtlclNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBidWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcGFydGljaXBhdGUod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgY29udGV4dDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghd29ya2luZ0NvcHkubW9kZWwgfHwgISh3b3JraW5nQ29weS5tb2RlbCBpbnN0YW5jZW9mIE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVhc29uID09PSBTYXZlUmVhc29uLkFVVE8pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLmZvcm1hdE9uU2F2ZSk7XG5cdFx0aWYgKCFlbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnbm90ZWJvb2tGb3JtYXRTYXZlLmZvcm1hdHRpbmcnLCBcIkZvcm1hdHRpbmdcIikgfSk7XG5cblx0XHRjb25zdCBub3RlYm9vayA9IHdvcmtpbmdDb3B5Lm1vZGVsLm5vdGVib29rTW9kZWw7XG5cdFx0Y29uc3QgZm9ybWF0QXBwbGllZDogYm9vbGVhbiA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oQ29kZUFjdGlvblBhcnRpY2lwYW50VXRpbHMuY2hlY2tBbmRSdW5Gb3JtYXRDb2RlQWN0aW9uLCBub3RlYm9vaywgcHJvZ3Jlc3MsIHRva2VuKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghZm9ybWF0QXBwbGllZCkge1xuXHRcdFx0XHRjb25zdCBhbGxDZWxsRWRpdHMgPSBhd2FpdCBQcm9taXNlLmFsbChub3RlYm9vay5jZWxscy5tYXAoYXN5bmMgY2VsbCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNlbGwudXJpKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmFkZChyZWYpO1xuXG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0XHRcdGNvbnN0IGZvcm1hdEVkaXRzID0gYXdhaXQgZ2V0RG9jdW1lbnRGb3JtYXR0aW5nRWRpdHNXaXRoU2VsZWN0ZWRQcm92aWRlcihcblx0XHRcdFx0XHRcdHRoaXMuZWRpdG9yV29ya2VyU2VydmljZSxcblx0XHRcdFx0XHRcdHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdEZvcm1hdHRpbmdNb2RlLlNpbGVudCxcblx0XHRcdFx0XHRcdHRva2VuXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGNvbnN0IGVkaXRzOiBSZXNvdXJjZVRleHRFZGl0W10gPSBbXTtcblxuXHRcdFx0XHRcdGlmIChmb3JtYXRFZGl0cykge1xuXHRcdFx0XHRcdFx0ZWRpdHMucHVzaCguLi5mb3JtYXRFZGl0cy5tYXAoZWRpdCA9PiBuZXcgUmVzb3VyY2VUZXh0RWRpdChtb2RlbC51cmksIGVkaXQsIG1vZGVsLmdldFZlcnNpb25JZCgpKSkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVkaXRzO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMuYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KC8qIGVkaXQgKi9hbGxDZWxsRWRpdHMuZmxhdCgpLCB7IGxhYmVsOiBsb2NhbGl6ZSgnZm9ybWF0Tm90ZWJvb2snLCBcIkZvcm1hdCBOb3RlYm9va1wiKSwgY29kZTogJ3VuZG9yZWRvLmZvcm1hdE5vdGVib29rJywgfSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IGluY3JlbWVudDogMTAwIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRyaW1XaGl0ZXNwYWNlUGFydGljaXBhbnQgZXh0ZW5kcyBOb3RlYm9va1NhdmVQYXJ0aWNpcGFudCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElCdWxrRWRpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBidWxrRWRpdFNlcnZpY2U6IElCdWxrRWRpdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvclNlcnZpY2UpO1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgY29udGV4dDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0cmltVHJhaWxpbmdXaGl0ZXNwYWNlT3B0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZScpO1xuXHRcdGNvbnN0IHRyaW1JblJlZ2V4QW5kU3RyaW5ncyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2ZpbGVzLnRyaW1UcmFpbGluZ1doaXRlc3BhY2VJblJlZ2V4QW5kU3RyaW5ncycpO1xuXHRcdGlmICh0cmltVHJhaWxpbmdXaGl0ZXNwYWNlT3B0aW9uICYmIHRoaXMuY2FuUGFydGljaXBhdGUoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kb1RyaW1UcmFpbGluZ1doaXRlc3BhY2Uod29ya2luZ0NvcHksIGNvbnRleHQucmVhc29uID09PSBTYXZlUmVhc29uLkFVVE8sIHRyaW1JblJlZ2V4QW5kU3RyaW5ncywgcHJvZ3Jlc3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9UcmltVHJhaWxpbmdXaGl0ZXNwYWNlKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4sIGlzQXV0b1NhdmVkOiBib29sZWFuLCB0cmltSW5SZWdleGVzQW5kU3RyaW5nczogYm9vbGVhbiwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPikge1xuXHRcdGlmICghd29ya2luZ0NvcHkubW9kZWwgfHwgISh3b3JraW5nQ29weS5tb2RlbCBpbnN0YW5jZW9mIE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBub3RlYm9vayA9IHdvcmtpbmdDb3B5Lm1vZGVsLm5vdGVib29rTW9kZWw7XG5cdFx0Y29uc3QgYWN0aXZlQ2VsbEVkaXRvciA9IGdldEFjdGl2ZUNlbGxDb2RlRWRpdG9yKHRoaXMuZWRpdG9yU2VydmljZSk7XG5cblx0XHRsZXQgY3Vyc29yczogUG9zaXRpb25bXSA9IFtdO1xuXHRcdGxldCBwcmV2U2VsZWN0aW9uOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhbGxDZWxsRWRpdHMgPSBhd2FpdCBQcm9taXNlLmFsbChub3RlYm9vay5jZWxscy5tYXAoYXN5bmMgKGNlbGwpID0+IHtcblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgIT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY2VsbC51cmkpO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmFkZChyZWYpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXG5cdFx0XHRcdGNvbnN0IGlzQWN0aXZlQ2VsbCA9IChhY3RpdmVDZWxsRWRpdG9yICYmIGNlbGwudXJpLnRvU3RyaW5nKCkgPT09IGFjdGl2ZUNlbGxFZGl0b3IuZ2V0TW9kZWwoKT8udXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRpZiAoaXNBY3RpdmVDZWxsKSB7XG5cdFx0XHRcdFx0cHJldlNlbGVjdGlvbiA9IGFjdGl2ZUNlbGxFZGl0b3IuZ2V0U2VsZWN0aW9ucygpID8/IFtdO1xuXHRcdFx0XHRcdGlmIChpc0F1dG9TYXZlZCkge1xuXHRcdFx0XHRcdFx0Y3Vyc29ycyA9IHByZXZTZWxlY3Rpb24ubWFwKHMgPT4gcy5nZXRQb3NpdGlvbigpKTsgLy8gZ2V0IGluaXRpYWwgY3Vyc29yIHBvc2l0aW9uc1xuXHRcdFx0XHRcdFx0Y29uc3Qgc25pcHBldHNSYW5nZSA9IFNuaXBwZXRDb250cm9sbGVyMi5nZXQoYWN0aXZlQ2VsbEVkaXRvcik/LmdldFNlc3Npb25FbmNsb3NpbmdSYW5nZSgpO1xuXHRcdFx0XHRcdFx0aWYgKHNuaXBwZXRzUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHNuaXBwZXRzUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyIDw9IHNuaXBwZXRzUmFuZ2UuZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y3Vyc29ycy5wdXNoKG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBvcHMgPSB0cmltVHJhaWxpbmdXaGl0ZXNwYWNlKG1vZGVsLCBjdXJzb3JzLCB0cmltSW5SZWdleGVzQW5kU3RyaW5ncyk7XG5cdFx0XHRcdGlmICghb3BzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTsgLy8gTm90aGluZyB0byBkb1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG9wcy5tYXAob3AgPT4gbmV3IFJlc291cmNlVGV4dEVkaXQobW9kZWwudXJpLCB7IC4uLm9wLCB0ZXh0OiBvcC50ZXh0IHx8ICcnIH0sIG1vZGVsLmdldFZlcnNpb25JZCgpKSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGZpbHRlcmVkRWRpdHMgPSBhbGxDZWxsRWRpdHMuZmxhdCgpLmZpbHRlcihlZGl0ID0+IGVkaXQgIT09IHVuZGVmaW5lZCkgYXMgUmVzb3VyY2VFZGl0W107XG5cdFx0XHRhd2FpdCB0aGlzLmJ1bGtFZGl0U2VydmljZS5hcHBseShmaWx0ZXJlZEVkaXRzLCB7IGxhYmVsOiBsb2NhbGl6ZSgndHJpbU5vdGVib29rV2hpdGVzcGFjZScsIFwiTm90ZWJvb2sgVHJpbSBUcmFpbGluZyBXaGl0ZXNwYWNlXCIpLCBjb2RlOiAndW5kb3JlZG8ubm90ZWJvb2tUcmltVHJhaWxpbmdXaGl0ZXNwYWNlJyB9KTtcblxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBpbmNyZW1lbnQ6IDEwMCB9KTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUcmltRmluYWxOZXdMaW5lc1BhcnRpY2lwYW50IGV4dGVuZHMgTm90ZWJvb2tTYXZlUGFydGljaXBhbnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQnVsa0VkaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3JTZXJ2aWNlKTtcblx0fVxuXG5cblx0YXN5bmMgcGFydGljaXBhdGUod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgY29udGV4dDogSVN0b3JlZEZpbGVXb3JraW5nQ29weVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignZmlsZXMudHJpbUZpbmFsTmV3bGluZXMnKSAmJiB0aGlzLmNhblBhcnRpY2lwYXRlKCkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZG9UcmltRmluYWxOZXdMaW5lcyh3b3JraW5nQ29weSwgY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTywgcHJvZ3Jlc3MpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiByZXR1cm5zIDAgaWYgdGhlIGVudGlyZSBmaWxlIGlzIGVtcHR5XG5cdCAqL1xuXHRwcml2YXRlIGZpbmRMYXN0Tm9uRW1wdHlMaW5lKHRleHRCdWZmZXI6IElSZWFkb25seVRleHRCdWZmZXIpOiBudW1iZXIge1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSB0ZXh0QnVmZmVyLmdldExpbmVDb3VudCgpOyBsaW5lTnVtYmVyID49IDE7IGxpbmVOdW1iZXItLSkge1xuXHRcdFx0Y29uc3QgbGluZUxlbmd0aCA9IHRleHRCdWZmZXIuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKTtcblx0XHRcdGlmIChsaW5lTGVuZ3RoKSB7XG5cdFx0XHRcdC8vIHRoaXMgbGluZSBoYXMgY29udGVudFxuXHRcdFx0XHRyZXR1cm4gbGluZU51bWJlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gbm8gbGluZSBoYXMgY29udGVudFxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1RyaW1GaW5hbE5ld0xpbmVzKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4sIGlzQXV0b1NhdmVkOiBib29sZWFuLCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF3b3JraW5nQ29weS5tb2RlbCB8fCAhKHdvcmtpbmdDb3B5Lm1vZGVsIGluc3RhbmNlb2YgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG5vdGVib29rID0gd29ya2luZ0NvcHkubW9kZWwubm90ZWJvb2tNb2RlbDtcblx0XHRjb25zdCBhY3RpdmVDZWxsRWRpdG9yID0gZ2V0QWN0aXZlQ2VsbENvZGVFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhbGxDZWxsRWRpdHMgPSBhd2FpdCBQcm9taXNlLmFsbChub3RlYm9vay5jZWxscy5tYXAoYXN5bmMgKGNlbGwpID0+IHtcblx0XHRcdFx0aWYgKGNlbGwuY2VsbEtpbmQgIT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBhdXRvc2F2ZSAtLSBkb24ndCB0cmltIGV2ZXJ5IHRyYWlsaW5nIGxpbmUsIGp1c3QgdXAgdG8gdGhlIGN1cnNvciBsaW5lXG5cdFx0XHRcdGxldCBjYW5ub3RUb3VjaExpbmVOdW1iZXIgPSAwO1xuXHRcdFx0XHRjb25zdCBpc0FjdGl2ZUNlbGwgPSAoYWN0aXZlQ2VsbEVkaXRvciAmJiBjZWxsLnVyaS50b1N0cmluZygpID09PSBhY3RpdmVDZWxsRWRpdG9yLmdldE1vZGVsKCk/LnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKGlzQXV0b1NhdmVkICYmIGlzQWN0aXZlQ2VsbCkge1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBhY3RpdmVDZWxsRWRpdG9yLmdldFNlbGVjdGlvbnMoKSA/PyBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNlbCBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRjYW5ub3RUb3VjaExpbmVOdW1iZXIgPSBNYXRoLm1heChjYW5ub3RUb3VjaExpbmVOdW1iZXIsIHNlbC5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRleHRCdWZmZXIgPSBjZWxsLnRleHRCdWZmZXI7XG5cdFx0XHRcdGNvbnN0IGxhc3ROb25FbXB0eUxpbmUgPSB0aGlzLmZpbmRMYXN0Tm9uRW1wdHlMaW5lKHRleHRCdWZmZXIpO1xuXHRcdFx0XHRjb25zdCBkZWxldGVGcm9tTGluZU51bWJlciA9IE1hdGgubWF4KGxhc3ROb25FbXB0eUxpbmUgKyAxLCBjYW5ub3RUb3VjaExpbmVOdW1iZXIgKyAxKTtcblx0XHRcdFx0aWYgKGRlbGV0ZUZyb21MaW5lTnVtYmVyID4gdGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRlbGV0aW9uUmFuZ2UgPSBuZXcgUmFuZ2UoZGVsZXRlRnJvbUxpbmVOdW1iZXIsIDEsIHRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCksIHRleHRCdWZmZXIuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHRleHRCdWZmZXIuZ2V0TGluZUNvdW50KCkpKTtcblx0XHRcdFx0aWYgKGRlbGV0aW9uUmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gY3JlYXRlIHRoZSBlZGl0IHRvIGRlbGV0ZSBhbGwgbGluZXMgaW4gZGVsZXRpb25SYW5nZVxuXHRcdFx0XHRyZXR1cm4gbmV3IFJlc291cmNlVGV4dEVkaXQoY2VsbC51cmksIHsgcmFuZ2U6IGRlbGV0aW9uUmFuZ2UsIHRleHQ6ICcnIH0sIGNlbGwudGV4dE1vZGVsPy5nZXRWZXJzaW9uSWQoKSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGZpbHRlcmVkRWRpdHMgPSBhbGxDZWxsRWRpdHMuZmxhdCgpLmZpbHRlcihlZGl0ID0+IGVkaXQgIT09IHVuZGVmaW5lZCkgYXMgUmVzb3VyY2VFZGl0W107XG5cdFx0XHRhd2FpdCB0aGlzLmJ1bGtFZGl0U2VydmljZS5hcHBseShmaWx0ZXJlZEVkaXRzLCB7IGxhYmVsOiBsb2NhbGl6ZSgndHJpbU5vdGVib29rTmV3bGluZXMnLCBcIlRyaW0gRmluYWwgTmV3IExpbmVzXCIpLCBjb2RlOiAndW5kb3JlZG8udHJpbUZpbmFsTmV3TGluZXMnIH0pO1xuXG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IGluY3JlbWVudDogMTAwIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEluc2VydEZpbmFsTmV3TGluZVBhcnRpY2lwYW50IGV4dGVuZHMgTm90ZWJvb2tTYXZlUGFydGljaXBhbnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQnVsa0VkaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3JTZXJ2aWNlKTtcblx0fVxuXG5cdGFzeW5jIHBhcnRpY2lwYXRlKHdvcmtpbmdDb3B5OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5PElTdG9yZWRGaWxlV29ya2luZ0NvcHlNb2RlbD4sIGNvbnRleHQ6IElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnRDb250ZXh0LCBwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gd2FpdGluZyBvbiBub3RlYm9vay1zcGVjaWZpYyBvdmVycmlkZSBiZWZvcmUgdGhpcyBmZWF0dXJlIGNhbiBzeW5jIHdpdGggJ2ZpbGVzLmluc2VydEZpbmFsTmV3bGluZSdcblx0XHQvLyBpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZmlsZXMuaW5zZXJ0RmluYWxOZXdsaW5lJykpIHtcblxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5pbnNlcnRGaW5hbE5ld2xpbmUpICYmIHRoaXMuY2FuUGFydGljaXBhdGUoKSkge1xuXHRcdFx0YXdhaXQgdGhpcy5kb0luc2VydEZpbmFsTmV3TGluZSh3b3JraW5nQ29weSwgY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTywgcHJvZ3Jlc3MpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9JbnNlcnRGaW5hbE5ld0xpbmUod29ya2luZ0NvcHk6IElTdG9yZWRGaWxlV29ya2luZ0NvcHk8SVN0b3JlZEZpbGVXb3JraW5nQ29weU1vZGVsPiwgaXNBdXRvU2F2ZWQ6IGJvb2xlYW4sIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXdvcmtpbmdDb3B5Lm1vZGVsIHx8ICEod29ya2luZ0NvcHkubW9kZWwgaW5zdGFuY2VvZiBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSB3b3JraW5nQ29weS5tb2RlbC5ub3RlYm9va01vZGVsO1xuXG5cdFx0Ly8gZ2V0IGluaXRpYWwgY3Vyc29yIHBvc2l0aW9uc1xuXHRcdGNvbnN0IGFjdGl2ZUNlbGxFZGl0b3IgPSBnZXRBY3RpdmVDZWxsQ29kZUVkaXRvcih0aGlzLmVkaXRvclNlcnZpY2UpO1xuXHRcdGxldCBzZWxlY3Rpb25zO1xuXHRcdGlmIChhY3RpdmVDZWxsRWRpdG9yKSB7XG5cdFx0XHRzZWxlY3Rpb25zID0gYWN0aXZlQ2VsbEVkaXRvci5nZXRTZWxlY3Rpb25zKCkgPz8gW107XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFsbENlbGxFZGl0cyA9IGF3YWl0IFByb21pc2UuYWxsKG5vdGVib29rLmNlbGxzLm1hcChhc3luYyAoY2VsbCkgPT4ge1xuXHRcdFx0XHRpZiAoY2VsbC5jZWxsS2luZCAhPT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IGNlbGwudGV4dEJ1ZmZlci5nZXRMaW5lQ291bnQoKTtcblx0XHRcdFx0Y29uc3QgbGFzdExpbmVJc0VtcHR5T3JXaGl0ZXNwYWNlID0gY2VsbC50ZXh0QnVmZmVyLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZUNvdW50KSA9PT0gMDtcblxuXHRcdFx0XHRpZiAoIWxpbmVDb3VudCB8fCBsYXN0TGluZUlzRW1wdHlPcldoaXRlc3BhY2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbmV3IFJlc291cmNlVGV4dEVkaXQoY2VsbC51cmksIHsgcmFuZ2U6IG5ldyBSYW5nZShsaW5lQ291bnQgKyAxLCBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUxlbmd0aChsaW5lQ291bnQpLCBsaW5lQ291bnQgKyAxLCBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZUxlbmd0aChsaW5lQ291bnQpKSwgdGV4dDogY2VsbC50ZXh0QnVmZmVyLmdldEVPTCgpIH0sIGNlbGwudGV4dE1vZGVsPy5nZXRWZXJzaW9uSWQoKSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IGZpbHRlcmVkRWRpdHMgPSBhbGxDZWxsRWRpdHMuZmlsdGVyKGVkaXQgPT4gZWRpdCAhPT0gdW5kZWZpbmVkKSBhcyBSZXNvdXJjZUVkaXRbXTtcblx0XHRcdGF3YWl0IHRoaXMuYnVsa0VkaXRTZXJ2aWNlLmFwcGx5KGZpbHRlcmVkRWRpdHMsIHsgbGFiZWw6IGxvY2FsaXplKCdpbnNlcnRGaW5hbE5ld0xpbmUnLCBcIkluc2VydCBGaW5hbCBOZXcgTGluZVwiKSwgY29kZTogJ3VuZG9yZWRvLmluc2VydEZpbmFsTmV3TGluZScgfSk7XG5cblx0XHRcdC8vIHNldCBjdXJzb3IgYmFjayB0byBpbml0aWFsIHBvc2l0aW9uIGFmdGVyIGluc2VydGluZyBmaW5hbCBuZXcgbGluZVxuXHRcdFx0aWYgKGFjdGl2ZUNlbGxFZGl0b3IgJiYgc2VsZWN0aW9ucykge1xuXHRcdFx0XHRhY3RpdmVDZWxsRWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IGluY3JlbWVudDogMTAwIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIENvZGVBY3Rpb25PblNhdmVQYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElTdG9yZWRGaWxlV29ya2luZ0NvcHlTYXZlUGFydGljaXBhbnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZSh3b3JraW5nQ29weTogSVN0b3JlZEZpbGVXb3JraW5nQ29weTxJU3RvcmVkRmlsZVdvcmtpbmdDb3B5TW9kZWw+LCBjb250ZXh0OiBJU3RvcmVkRmlsZVdvcmtpbmdDb3B5U2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgcHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaXNUcnVzdGVkID0gdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpO1xuXHRcdGlmICghaXNUcnVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF3b3JraW5nQ29weS5tb2RlbCB8fCAhKHdvcmtpbmdDb3B5Lm1vZGVsIGluc3RhbmNlb2YgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgc2F2ZVRyaWdnZXIgPSAnJztcblx0XHRpZiAoY29udGV4dC5yZWFzb24gPT09IFNhdmVSZWFzb24uQVVUTykge1xuXHRcdFx0Ly8gY3VycmVudGx5IHRoaXMgd29uJ3QgaGFwcGVuLCBhcyB2cy9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbi50cyBMIzEwNCBmaWx0ZXJzIG91dCBjb2RlYWN0aW9ucyBvbiBhdXRvc2F2ZS4gSnVzdCBmdXR1cmUtcHJvb2Zpbmdcblx0XHRcdC8vID8gbm90ZWJvb2sgQ29kZUFjdGlvbnMgb24gYXV0b3NhdmUgc2VlbXMgZGFuZ2Vyb3VzIChwZXJmLXdpc2UpXG5cdFx0XHQvLyBzYXZlVHJpZ2dlciA9ICdhbHdheXMnOyAvLyBUT0RPQFlveW9rcmF6eSwgc3VwcG9ydCBkdXJpbmcgZGVidFxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKGNvbnRleHQucmVhc29uID09PSBTYXZlUmVhc29uLkVYUExJQ0lUKSB7XG5cdFx0XHRzYXZlVHJpZ2dlciA9ICdleHBsaWNpdCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFx0U2F2ZVJlYXNvbi5GT0NVU19DSEFOR0UsIFdJTkRPV19DSEFOR0UgbmVlZCB0byBiZSBhZGRyZXNzZWQgd2hlbiBhdXRvc2F2ZXMgYXJlIGVuYWJsZWRcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm90ZWJvb2tNb2RlbCA9IHdvcmtpbmdDb3B5Lm1vZGVsLm5vdGVib29rTW9kZWw7XG5cblx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtraW5kOiBzdHJpbmddOiBzdHJpbmcgfCBib29sZWFuIH0+KE5vdGVib29rU2V0dGluZy5jb2RlQWN0aW9uc09uU2F2ZSk7XG5cdFx0Y29uc3Qgc2V0dGluZ0l0ZW1zOiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkoc2V0dGluZylcblx0XHRcdD8gc2V0dGluZ1xuXHRcdFx0OiBPYmplY3Qua2V5cyhzZXR0aW5nKS5maWx0ZXIoeCA9PiBzZXR0aW5nW3hdKTtcblxuXHRcdGNvbnN0IGFsbENvZGVBY3Rpb25zID0gdGhpcy5jcmVhdGVDb2RlQWN0aW9uc09uU2F2ZShzZXR0aW5nSXRlbXMpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkQWN0aW9ucyA9IGFsbENvZGVBY3Rpb25zXG5cdFx0XHQuZmlsdGVyKHggPT4gc2V0dGluZ1t4LnZhbHVlXSA9PT0gJ25ldmVyJyB8fCBzZXR0aW5nW3gudmFsdWVdID09PSBmYWxzZSk7XG5cdFx0Y29uc3QgaW5jbHVkZWRBY3Rpb25zID0gYWxsQ29kZUFjdGlvbnNcblx0XHRcdC5maWx0ZXIoeCA9PiBzZXR0aW5nW3gudmFsdWVdID09PSBzYXZlVHJpZ2dlciB8fCBzZXR0aW5nW3gudmFsdWVdID09PSB0cnVlKTtcblxuXHRcdGNvbnN0IGVkaXRvckNvZGVBY3Rpb25zT25TYXZlID0gaW5jbHVkZWRBY3Rpb25zLmZpbHRlcih4ID0+ICFDb2RlQWN0aW9uS2luZC5Ob3RlYm9vay5jb250YWlucyh4KSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tDb2RlQWN0aW9uc09uU2F2ZSA9IGluY2x1ZGVkQWN0aW9ucy5maWx0ZXIoeCA9PiBDb2RlQWN0aW9uS2luZC5Ob3RlYm9vay5jb250YWlucyh4KSk7XG5cblx0XHQvLyBydW4gbm90ZWJvb2sgY29kZSBhY3Rpb25zXG5cdFx0aWYgKG5vdGVib29rQ29kZUFjdGlvbnNPblNhdmUubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBuYkRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnbm90ZWJvb2tTYXZlUGFydGljaXBhbnRzLm5vdGVib29rQ29kZUFjdGlvbnMnLCBcIlJ1bm5pbmcgJ05vdGVib29rJyBjb2RlIGFjdGlvbnNcIikgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gbm90ZWJvb2tNb2RlbC5jZWxsc1swXTtcblx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGNlbGwudXJpKTtcblx0XHRcdFx0bmJEaXNwb3NhYmxlLmFkZChyZWYpO1xuXG5cdFx0XHRcdGNvbnN0IHRleHRFZGl0b3JNb2RlbCA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXG5cdFx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oQ29kZUFjdGlvblBhcnRpY2lwYW50VXRpbHMuYXBwbHlPblNhdmVHZW5lcmljQ29kZUFjdGlvbnMsIHRleHRFZGl0b3JNb2RlbCwgbm90ZWJvb2tDb2RlQWN0aW9uc09uU2F2ZSwgZXhjbHVkZWRBY3Rpb25zLCBwcm9ncmVzcywgdG9rZW4pO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIGFwcGx5IG5vdGVib29rIGNvZGUgYWN0aW9uIG9uIHNhdmUnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IGluY3JlbWVudDogMTAwIH0pO1xuXHRcdFx0XHRuYkRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHJ1biBjZWxsIGxldmVsIGNvZGUgYWN0aW9uc1xuXHRcdGlmIChlZGl0b3JDb2RlQWN0aW9uc09uU2F2ZS5sZW5ndGgpIHtcblx0XHRcdC8vIHByaW9yaXRpemUgYHNvdXJjZS5maXhBbGxgIGNvZGUgYWN0aW9uc1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHNldHRpbmcpKSB7XG5cdFx0XHRcdGVkaXRvckNvZGVBY3Rpb25zT25TYXZlLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0XHRpZiAoQ29kZUFjdGlvbktpbmQuU291cmNlRml4QWxsLmNvbnRhaW5zKGEpKSB7XG5cdFx0XHRcdFx0XHRpZiAoQ29kZUFjdGlvbktpbmQuU291cmNlRml4QWxsLmNvbnRhaW5zKGIpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoQ29kZUFjdGlvbktpbmQuU291cmNlRml4QWxsLmNvbnRhaW5zKGIpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjZWxsRGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdub3RlYm9va1NhdmVQYXJ0aWNpcGFudHMuY2VsbENvZGVBY3Rpb25zJywgXCJSdW5uaW5nICdDZWxsJyBjb2RlIGFjdGlvbnNcIikgfSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChub3RlYm9va01vZGVsLmNlbGxzLm1hcChhc3luYyBjZWxsID0+IHtcblx0XHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoY2VsbC51cmkpO1xuXHRcdFx0XHRcdGNlbGxEaXNwb3NhYmxlLmFkZChyZWYpO1xuXG5cdFx0XHRcdFx0Y29uc3QgdGV4dEVkaXRvck1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKENvZGVBY3Rpb25QYXJ0aWNpcGFudFV0aWxzLmFwcGx5T25TYXZlR2VuZXJpY0NvZGVBY3Rpb25zLCB0ZXh0RWRpdG9yTW9kZWwsIGVkaXRvckNvZGVBY3Rpb25zT25TYXZlLCBleGNsdWRlZEFjdGlvbnMsIHByb2dyZXNzLCB0b2tlbik7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBhcHBseSBjb2RlIGFjdGlvbiBvbiBzYXZlJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoeyBpbmNyZW1lbnQ6IDEwMCB9KTtcblx0XHRcdFx0Y2VsbERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29kZUFjdGlvbnNPblNhdmUoc2V0dGluZ0l0ZW1zOiByZWFkb25seSBzdHJpbmdbXSk6IEhpZXJhcmNoaWNhbEtpbmRbXSB7XG5cdFx0Y29uc3Qga2luZHMgPSBzZXR0aW5nSXRlbXMubWFwKHggPT4gbmV3IEhpZXJhcmNoaWNhbEtpbmQoeCkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHN1YnNldHNcblx0XHRyZXR1cm4ga2luZHMuZmlsdGVyKGtpbmQgPT4ge1xuXHRcdFx0cmV0dXJuIGtpbmRzLmV2ZXJ5KG90aGVyS2luZCA9PiBvdGhlcktpbmQuZXF1YWxzKGtpbmQpIHx8ICFvdGhlcktpbmQuY29udGFpbnMoa2luZCkpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDb2RlQWN0aW9uUGFydGljaXBhbnRVdGlscyB7XG5cblx0c3RhdGljIGFzeW5jIGNoZWNrQW5kUnVuRm9ybWF0Q29kZUFjdGlvbihcblx0XHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0XHRub3RlYm9va01vZGVsOiBOb3RlYm9va1RleHRNb2RlbCxcblx0XHRwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJTG9nU2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZm9ybWF0RGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgZm9ybWF0UmVzdWx0OiBib29sZWFuID0gZmFsc2U7XG5cdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ25vdGVib29rU2F2ZVBhcnRpY2lwYW50cy5mb3JtYXRDb2RlQWN0aW9ucycsIFwiUnVubmluZyAnRm9ybWF0JyBjb2RlIGFjdGlvbnNcIikgfSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNlbGwgPSBub3RlYm9va01vZGVsLmNlbGxzWzBdO1xuXHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShjZWxsLnVyaSk7XG5cdFx0XHRmb3JtYXREaXNwb3NhYmxlLmFkZChyZWYpO1xuXHRcdFx0Y29uc3QgdGV4dEVkaXRvck1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRGb3JtYXR0ZXJFeHRJZCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oTm90ZWJvb2tTZXR0aW5nLmRlZmF1bHRGb3JtYXR0ZXIpO1xuXHRcdFx0Zm9ybWF0UmVzdWx0ID0gYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oQ29kZUFjdGlvblBhcnRpY2lwYW50VXRpbHMuYXBwbHlPblNhdmVGb3JtYXRDb2RlQWN0aW9uLCB0ZXh0RWRpdG9yTW9kZWwsIG5ldyBIaWVyYXJjaGljYWxLaW5kKCdub3RlYm9vay5mb3JtYXQnKSwgW10sIGRlZmF1bHRGb3JtYXR0ZXJFeHRJZCwgcHJvZ3Jlc3MsIHRva2VuKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBhcHBseSBub3RlYm9vayBmb3JtYXQgYWN0aW9uIG9uIHNhdmUnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgaW5jcmVtZW50OiAxMDAgfSk7XG5cdFx0XHRmb3JtYXREaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZvcm1hdFJlc3VsdDtcblx0fVxuXG5cdHN0YXRpYyBhc3luYyBhcHBseU9uU2F2ZUdlbmVyaWNDb2RlQWN0aW9ucyhcblx0XHRhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcixcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRjb2RlQWN0aW9uc09uU2F2ZTogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdLFxuXHRcdGV4Y2x1ZGVzOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10sXG5cdFx0cHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZ2V0QWN0aW9uUHJvZ3Jlc3MgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJUHJvZ3Jlc3M8Q29kZUFjdGlvblByb3ZpZGVyPiB7XG5cdFx0XHRwcml2YXRlIF9uYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0cHJpdmF0ZSBfcmVwb3J0KCk6IHZvaWQge1xuXHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdjb2RlYWN0aW9uLmdldDInLCBjb21tZW50OiBbJ1tjb25maWd1cmVdKHsxfSkgaXMgYSBsaW5rLiBPbmx5IHRyYW5zbGF0ZSBgY29uZmlndXJlYC4gRG8gbm90IGNoYW5nZSBicmFja2V0cyBhbmQgcGFyZW50aGVzZXMgb3IgezF9J10gfSxcblx0XHRcdFx0XHRcdFwiR2V0dGluZyBjb2RlIGFjdGlvbnMgZnJvbSAnezB9JyAoW2NvbmZpZ3VyZV0oezF9KSkuXCIsXG5cdFx0XHRcdFx0XHRbLi4udGhpcy5fbmFtZXNdLm1hcChuYW1lID0+IGAnJHtuYW1lfSdgKS5qb2luKCcsICcpLFxuXHRcdFx0XHRcdFx0J2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIybm90ZWJvb2suY29kZUFjdGlvbnNPblNhdmUlMjIlNUQnXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJlcG9ydChwcm92aWRlcjogQ29kZUFjdGlvblByb3ZpZGVyKSB7XG5cdFx0XHRcdGlmIChwcm92aWRlci5kaXNwbGF5TmFtZSAmJiAhdGhpcy5fbmFtZXMuaGFzKHByb3ZpZGVyLmRpc3BsYXlOYW1lKSkge1xuXHRcdFx0XHRcdHRoaXMuX25hbWVzLmFkZChwcm92aWRlci5kaXNwbGF5TmFtZSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3J0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBjb2RlQWN0aW9uS2luZCBvZiBjb2RlQWN0aW9uc09uU2F2ZSkge1xuXHRcdFx0Y29uc3QgYWN0aW9uc1RvUnVuID0gYXdhaXQgQ29kZUFjdGlvblBhcnRpY2lwYW50VXRpbHMuZ2V0QWN0aW9uc1RvUnVuKG1vZGVsLCBjb2RlQWN0aW9uS2luZCwgZXhjbHVkZXMsIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBnZXRBY3Rpb25Qcm9ncmVzcywgdG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdGFjdGlvbnNUb1J1bi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9uc1RvUnVuLnZhbGlkQWN0aW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IGNvZGVBY3Rpb25FZGl0cyA9IGFjdGlvbi5hY3Rpb24uZWRpdD8uZWRpdHM7XG5cdFx0XHRcdFx0bGV0IGJyZWFrRmxhZyA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmICghYWN0aW9uLmFjdGlvbi5raW5kPy5zdGFydHNXaXRoKCdub3RlYm9vaycpKSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgY29kZUFjdGlvbkVkaXRzID8/IFtdKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZVRleHRFZGl0ID0gZWRpdCBhcyBJV29ya3NwYWNlVGV4dEVkaXQ7XG5cdFx0XHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VUZXh0RWRpdC5yZXNvdXJjZSAmJiBpc0VxdWFsKHdvcmtzcGFjZVRleHRFZGl0LnJlc291cmNlLCBtb2RlbC51cmkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gZXJyb3IgLT4gYXBwbGllZCB0byBtdWx0aXBsZSByZXNvdXJjZXNcblx0XHRcdFx0XHRcdFx0XHRicmVha0ZsYWcgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChicmVha0ZsYWcpIHtcblx0XHRcdFx0XHRcdGxvZ1NlcnZpY2Uud2FybignRmFpbGVkIHRvIGFwcGx5IGNvZGUgYWN0aW9uIG9uIHNhdmUsIGFwcGxpZWQgdG8gbXVsdGlwbGUgcmVzb3VyY2VzLicpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IGxvY2FsaXplKCdjb2RlQWN0aW9uLmFwcGx5JywgXCJBcHBseWluZyBjb2RlIGFjdGlvbiAnezB9Jy5cIiwgYWN0aW9uLmFjdGlvbi50aXRsZSkgfSk7XG5cdFx0XHRcdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXBwbHlDb2RlQWN0aW9uLCBhY3Rpb24sIEFwcGx5Q29kZUFjdGlvblJlYXNvbi5PblNhdmUsIHt9LCB0b2tlbik7XG5cdFx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gRmFpbHVyZSB0byBhcHBseSBhIGNvZGUgYWN0aW9uIHNob3VsZCBub3QgYmxvY2sgb3RoZXIgb24gc2F2ZSBhY3Rpb25zXG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRhY3Rpb25zVG9SdW4uZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHN0YXRpYyBhc3luYyBhcHBseU9uU2F2ZUZvcm1hdENvZGVBY3Rpb24oXG5cdFx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdFx0bW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0Zm9ybWF0Q29kZUFjdGlvbk9uU2F2ZTogSGllcmFyY2hpY2FsS2luZCxcblx0XHRleGNsdWRlczogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdLFxuXHRcdGV4dGVuc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJvZ3Jlc3M6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZ2V0QWN0aW9uUHJvZ3Jlc3MgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJUHJvZ3Jlc3M8Q29kZUFjdGlvblByb3ZpZGVyPiB7XG5cdFx0XHRwcml2YXRlIF9uYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0cHJpdmF0ZSBfcmVwb3J0KCk6IHZvaWQge1xuXHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdjb2RlYWN0aW9uLmdldDInLCBjb21tZW50OiBbJ1tjb25maWd1cmVdKHsxfSkgaXMgYSBsaW5rLiBPbmx5IHRyYW5zbGF0ZSBgY29uZmlndXJlYC4gRG8gbm90IGNoYW5nZSBicmFja2V0cyBhbmQgcGFyZW50aGVzZXMgb3IgezF9J10gfSxcblx0XHRcdFx0XHRcdFwiR2V0dGluZyBjb2RlIGFjdGlvbnMgZnJvbSAnezB9JyAoW2NvbmZpZ3VyZV0oezF9KSkuXCIsXG5cdFx0XHRcdFx0XHRbLi4udGhpcy5fbmFtZXNdLm1hcChuYW1lID0+IGAnJHtuYW1lfSdgKS5qb2luKCcsICcpLFxuXHRcdFx0XHRcdFx0J2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JTVCJTIybm90ZWJvb2suZGVmYXVsdEZvcm1hdHRlciUyMiU1RCdcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmVwb3J0KHByb3ZpZGVyOiBDb2RlQWN0aW9uUHJvdmlkZXIpIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLmRpc3BsYXlOYW1lICYmICF0aGlzLl9uYW1lcy5oYXMocHJvdmlkZXIuZGlzcGxheU5hbWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbmFtZXMuYWRkKHByb3ZpZGVyLmRpc3BsYXlOYW1lKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvcnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwcm92aWRlZEFjdGlvbnMgPSBhd2FpdCBDb2RlQWN0aW9uUGFydGljaXBhbnRVdGlscy5nZXRBY3Rpb25zVG9SdW4obW9kZWwsIGZvcm1hdENvZGVBY3Rpb25PblNhdmUsIGV4Y2x1ZGVzLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSwgZ2V0QWN0aW9uUHJvZ3Jlc3MsIHRva2VuKTtcblx0XHQvLyB3YXJuIHRoZSB1c2VyIGlmIHRoZXJlIGFyZSBtb3JlIHRoYW4gb25lIHByb3ZpZGVkIGZvcm1hdCBhY3Rpb24sIGFuZCB0aGVyZSBpcyBubyBzcGVjaWZpZWQgZGVmYXVsdEZvcm1hdHRlclxuXHRcdGlmIChwcm92aWRlZEFjdGlvbnMudmFsaWRBY3Rpb25zLmxlbmd0aCA+IDEgJiYgIWV4dGVuc2lvbklkKSB7XG5cdFx0XHRsb2dTZXJ2aWNlLndhcm4oJ01vcmUgdGhhbiBvbmUgZm9ybWF0IGNvZGUgYWN0aW9uIGlzIHByb3ZpZGVkLCB0aGUgMHRoIG9uZSB3aWxsIGJlIHVzZWQuIEEgZGVmYXVsdCBjYW4gYmUgc3BlY2lmaWVkIHZpYSBgbm90ZWJvb2suZGVmYXVsdEZvcm1hdHRlcmAgaW4geW91ciBzZXR0aW5ncy4nKTtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHByb3ZpZGVkQWN0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFjdGlvbjogQ29kZUFjdGlvbkl0ZW0gfCB1bmRlZmluZWQgPSBleHRlbnNpb25JZCA/IHByb3ZpZGVkQWN0aW9ucy52YWxpZEFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLnByb3ZpZGVyPy5leHRlbnNpb25JZCA9PT0gZXh0ZW5zaW9uSWQpIDogcHJvdmlkZWRBY3Rpb25zLnZhbGlkQWN0aW9uc1swXTtcblx0XHRcdGlmICghYWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ2NvZGVBY3Rpb24uYXBwbHknLCBcIkFwcGx5aW5nIGNvZGUgYWN0aW9uICd7MH0nLlwiLCBhY3Rpb24uYWN0aW9uLnRpdGxlKSB9KTtcblx0XHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFwcGx5Q29kZUFjdGlvbiwgYWN0aW9uLCBBcHBseUNvZGVBY3Rpb25SZWFzb24uT25TYXZlLCB7fSwgdG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBhcHBseSBub3RlYm9vayBmb3JtYXQgY29kZSBhY3Rpb24gb24gc2F2ZScpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRwcm92aWRlZEFjdGlvbnMuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIEBZb3lva3JhenkgdGhpcyBjb3VsZCBsaWtlbHkgYmUgbW9kaWZpZWQgdG8gbGV2ZXJhZ2UgdGhlIGV4dGVuc2lvbklELCB0aGVyZWZvcmUgbm90IGdldHRpbmcgYWN0aW9ucyBmcm9tIHByb3ZpZGVycyB1bm5lY2Vzc2FyaWx5IC0tIGZ1dHVyZSB3b3JrXG5cdHN0YXRpYyBnZXRBY3Rpb25zVG9SdW4obW9kZWw6IElUZXh0TW9kZWwsIGNvZGVBY3Rpb25LaW5kOiBIaWVyYXJjaGljYWxLaW5kLCBleGNsdWRlczogcmVhZG9ubHkgSGllcmFyY2hpY2FsS2luZFtdLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBwcm9ncmVzczogSVByb2dyZXNzPENvZGVBY3Rpb25Qcm92aWRlcj4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdHJldHVybiBnZXRDb2RlQWN0aW9ucyhsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlQWN0aW9uUHJvdmlkZXIsIG1vZGVsLCBtb2RlbC5nZXRGdWxsTW9kZWxSYW5nZSgpLCB7XG5cdFx0XHR0eXBlOiBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlLFxuXHRcdFx0dHJpZ2dlckFjdGlvbjogQ29kZUFjdGlvblRyaWdnZXJTb3VyY2UuT25TYXZlLFxuXHRcdFx0ZmlsdGVyOiB7IGluY2x1ZGU6IGNvZGVBY3Rpb25LaW5kLCBleGNsdWRlczogZXhjbHVkZXMsIGluY2x1ZGVTb3VyY2VBY3Rpb25zOiB0cnVlIH0sXG5cdFx0fSwgcHJvZ3Jlc3MsIHRva2VuKTtcblx0fVxuXG59XG5cbmZ1bmN0aW9uIGdldEFjdGl2ZUNlbGxDb2RlRWRpdG9yKGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlKTogSUNvZGVFZGl0b3IgfCB1bmRlZmluZWQge1xuXHRjb25zdCBhY3RpdmVQYW5lID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lO1xuXHRjb25zdCBub3RlYm9va0VkaXRvciA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUoYWN0aXZlUGFuZSk7XG5cdGNvbnN0IGFjdGl2ZUNvZGVFZGl0b3IgPSBub3RlYm9va0VkaXRvcj8uYWN0aXZlQ29kZUVkaXRvcjtcblx0cmV0dXJuIGFjdGl2ZUNvZGVFZGl0b3I7XG59XG5cbmV4cG9ydCBjbGFzcyBTYXZlUGFydGljaXBhbnRzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weUZpbGVTZXJ2aWNlOiBJV29ya2luZ0NvcHlGaWxlU2VydmljZSkge1xuXG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlZ2lzdGVyU2F2ZVBhcnRpY2lwYW50cygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNhdmVQYXJ0aWNpcGFudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyaW1XaGl0ZXNwYWNlUGFydGljaXBhbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVBY3Rpb25PblNhdmVQYXJ0aWNpcGFudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtpbmdDb3B5RmlsZVNlcnZpY2UuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9ybWF0T25TYXZlUGFydGljaXBhbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3JraW5nQ29weUZpbGVTZXJ2aWNlLmFkZFNhdmVQYXJ0aWNpcGFudCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc2VydEZpbmFsTmV3TGluZVBhcnRpY2lwYW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya2luZ0NvcHlGaWxlU2VydmljZS5hZGRTYXZlUGFydGljaXBhbnQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmltRmluYWxOZXdMaW5lc1BhcnRpY2lwYW50KSkpO1xuXHR9XG59XG5cbmNvbnN0IHdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaENvbnRyaWJ1dGlvbnNFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oU2F2ZVBhcnRpY2lwYW50c0NvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZUFBZTtBQUV4QixTQUFTLGtCQUFnQyx3QkFBd0I7QUFDakUsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBRXRCLFNBQTZCLDZCQUFpRDtBQUU5RSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QixpQkFBaUIsc0JBQXNCO0FBQ3ZFLFNBQXlCLGdCQUFnQiwrQkFBK0I7QUFDeEUsU0FBUyxnQkFBZ0Isc0RBQXNEO0FBQy9FLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0NB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
