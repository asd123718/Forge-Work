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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { createCommandUri } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { trimTrailingWhitespace } from "../../../../editor/common/commands/trimTrailingWhitespaceCommand.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { CodeActionTriggerType } from "../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind, CodeActionTriggerSource } from "../../../../editor/contrib/codeAction/common/types.js";
import { FormattingMode, formatDocumentRangesWithSelectedProvider, formatDocumentWithSelectedProvider } from "../../../../editor/contrib/format/browser/format.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Progress } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchContributionsExtensions } from "../../../common/contributions.js";
import { SaveReason } from "../../../common/editor.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { getModifiedRanges } from "../../format/browser/formatModified.js";
let TrimWhitespaceParticipant = class {
  constructor(configurationService, codeEditorService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
  }
  async participate(model, context) {
    if (!model.textEditorModel) {
      return;
    }
    const trimTrailingWhitespaceOption = this.configurationService.getValue("files.trimTrailingWhitespace", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource });
    const trimInRegexAndStrings = this.configurationService.getValue("files.trimTrailingWhitespaceInRegexAndStrings", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource });
    if (trimTrailingWhitespaceOption) {
      this.doTrimTrailingWhitespace(model.textEditorModel, context.reason === SaveReason.AUTO, trimInRegexAndStrings);
    }
  }
  doTrimTrailingWhitespace(model, isAutoSaved, trimInRegexesAndStrings) {
    let prevSelection = [];
    let cursors = [];
    const editor = findEditor(model, this.codeEditorService);
    if (editor) {
      prevSelection = editor.getSelections();
      if (isAutoSaved) {
        cursors = prevSelection.map((s) => s.getPosition());
        const snippetsRange = SnippetController2.get(editor)?.getSessionEnclosingRange();
        if (snippetsRange) {
          for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
            cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
          }
        }
      }
    }
    const ops = trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings);
    if (!ops.length) {
      return;
    }
    model.pushEditOperations(prevSelection, ops, (_edits) => prevSelection);
  }
};
TrimWhitespaceParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService)
], TrimWhitespaceParticipant);
function findEditor(model, codeEditorService) {
  let candidate = null;
  if (model.isAttachedToEditor()) {
    for (const editor of codeEditorService.listCodeEditors()) {
      if (editor.hasModel() && editor.getModel() === model) {
        if (editor.hasTextFocus()) {
          return editor;
        }
        candidate = editor;
      }
    }
  }
  return candidate;
}
let FinalNewLineParticipant = class {
  constructor(configurationService, codeEditorService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
  }
  async participate(model, context) {
    if (!model.textEditorModel) {
      return;
    }
    if (this.configurationService.getValue("files.insertFinalNewline", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource })) {
      this.doInsertFinalNewLine(model.textEditorModel);
    }
  }
  doInsertFinalNewLine(model) {
    const lineCount = model.getLineCount();
    const lastLine = model.getLineContent(lineCount);
    const lastLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(lastLine) === -1;
    if (!lineCount || lastLineIsEmptyOrWhitespace) {
      return;
    }
    const edits = [EditOperation.insert(new Position(lineCount, model.getLineMaxColumn(lineCount)), model.getEOL())];
    const editor = findEditor(model, this.codeEditorService);
    if (editor) {
      editor.executeEdits("insertFinalNewLine", edits, editor.getSelections());
    } else {
      model.pushEditOperations([], edits, () => null);
    }
  }
};
FinalNewLineParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService)
], FinalNewLineParticipant);
let TrimFinalNewLinesParticipant = class {
  constructor(configurationService, codeEditorService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
  }
  async participate(model, context) {
    if (!model.textEditorModel) {
      return;
    }
    if (this.configurationService.getValue("files.trimFinalNewlines", { overrideIdentifier: model.textEditorModel.getLanguageId(), resource: model.resource })) {
      this.doTrimFinalNewLines(model.textEditorModel, context.reason === SaveReason.AUTO);
    }
  }
  /**
   * returns 0 if the entire file is empty
   */
  findLastNonEmptyLine(model) {
    for (let lineNumber = model.getLineCount(); lineNumber >= 1; lineNumber--) {
      const lineLength = model.getLineLength(lineNumber);
      if (lineLength > 0) {
        return lineNumber;
      }
    }
    return 0;
  }
  doTrimFinalNewLines(model, isAutoSaved) {
    const lineCount = model.getLineCount();
    if (lineCount === 1) {
      return;
    }
    let prevSelection = [];
    let cannotTouchLineNumber = 0;
    const editor = findEditor(model, this.codeEditorService);
    if (editor) {
      prevSelection = editor.getSelections();
      if (isAutoSaved) {
        for (let i = 0, len = prevSelection.length; i < len; i++) {
          const positionLineNumber = prevSelection[i].positionLineNumber;
          if (positionLineNumber > cannotTouchLineNumber) {
            cannotTouchLineNumber = positionLineNumber;
          }
        }
      }
    }
    const lastNonEmptyLine = this.findLastNonEmptyLine(model);
    const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
    const deletionRange = model.validateRange(new Range(deleteFromLineNumber, 1, lineCount, model.getLineMaxColumn(lineCount)));
    if (deletionRange.isEmpty()) {
      return;
    }
    model.pushEditOperations(prevSelection, [EditOperation.delete(deletionRange)], (_edits) => prevSelection);
    editor?.setSelections(prevSelection);
  }
};
TrimFinalNewLinesParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService)
], TrimFinalNewLinesParticipant);
let FormatOnSaveParticipant = class {
  constructor(configurationService, codeEditorService, instantiationService) {
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
    this.instantiationService = instantiationService;
  }
  async participate(model, context, progress, token) {
    if (!model.textEditorModel) {
      return;
    }
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    }
    const textEditorModel = model.textEditorModel;
    const overrides = { overrideIdentifier: textEditorModel.getLanguageId(), resource: textEditorModel.uri };
    const nestedProgress = new Progress((provider) => {
      progress.report({
        message: localize(
          { key: "formatting2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
          "Running '{0}' Formatter ([configure]({1})).",
          provider.displayName || provider.extensionId && provider.extensionId.value || "???",
          createCommandUri("workbench.action.openSettings", "editor.formatOnSave").toString()
        )
      });
    });
    const enabled = this.configurationService.getValue("editor.formatOnSave", overrides);
    if (!enabled) {
      return void 0;
    }
    const editorOrModel = findEditor(textEditorModel, this.codeEditorService) || textEditorModel;
    const mode = this.configurationService.getValue("editor.formatOnSaveMode", overrides);
    if (mode === "file") {
      await this.instantiationService.invokeFunction(formatDocumentWithSelectedProvider, editorOrModel, FormattingMode.Silent, nestedProgress, token);
    } else {
      const ranges = await this.instantiationService.invokeFunction(getModifiedRanges, isCodeEditor(editorOrModel) ? editorOrModel.getModel() : editorOrModel);
      if (ranges === null && mode === "modificationsIfAvailable") {
        await this.instantiationService.invokeFunction(formatDocumentWithSelectedProvider, editorOrModel, FormattingMode.Silent, nestedProgress, token);
      } else if (ranges) {
        await this.instantiationService.invokeFunction(formatDocumentRangesWithSelectedProvider, editorOrModel, ranges, FormattingMode.Silent, nestedProgress, token, false);
      }
    }
  }
};
FormatOnSaveParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IInstantiationService)
], FormatOnSaveParticipant);
let CodeActionOnSaveParticipant = class extends Disposable {
  constructor(configurationService, instantiationService, languageFeaturesService, hostService, editorService, codeEditorService) {
    super();
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.languageFeaturesService = languageFeaturesService;
    this.hostService = hostService;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this._register(this.hostService.onDidChangeFocus(() => {
      this.triggerCodeActionsCommand();
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this.triggerCodeActionsCommand();
    }));
  }
  async triggerCodeActionsCommand() {
    if (this.configurationService.getValue("editor.codeActions.triggerOnFocusChange") && this.configurationService.getValue("files.autoSave") === "afterDelay") {
      const model = this.codeEditorService.getActiveCodeEditor()?.getModel();
      if (!model) {
        return void 0;
      }
      const settingsOverrides = { overrideIdentifier: model.getLanguageId(), resource: model.uri };
      const setting = this.configurationService.getValue("editor.codeActionsOnSave", settingsOverrides);
      if (!setting) {
        return void 0;
      }
      if (Array.isArray(setting)) {
        return void 0;
      }
      const settingItems = Object.keys(setting).filter((x) => setting[x] && setting[x] === "always" && CodeActionKind.Source.contains(new HierarchicalKind(x)));
      const cancellationTokenSource = new CancellationTokenSource();
      const codeActionKindList = [];
      for (const item of settingItems) {
        codeActionKindList.push(new HierarchicalKind(item));
      }
      await this.applyOnSaveActions(model, codeActionKindList, [], Progress.None, cancellationTokenSource.token);
    }
  }
  async participate(model, context, progress, token) {
    if (!model.textEditorModel) {
      return;
    }
    const textEditorModel = model.textEditorModel;
    const settingsOverrides = { overrideIdentifier: textEditorModel.getLanguageId(), resource: textEditorModel.uri };
    const setting = this.configurationService.getValue("editor.codeActionsOnSave", settingsOverrides);
    if (!setting) {
      return void 0;
    }
    if (context.reason === SaveReason.AUTO) {
      return void 0;
    }
    if (context.reason !== SaveReason.EXPLICIT && Array.isArray(setting)) {
      return void 0;
    }
    const settingItems = Array.isArray(setting) ? setting : Object.keys(setting).filter((x) => setting[x] && setting[x] !== "never");
    const codeActionsOnSave = this.createCodeActionsOnSave(settingItems);
    if (!Array.isArray(setting)) {
      codeActionsOnSave.sort((a, b) => {
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
    if (!codeActionsOnSave.length) {
      return void 0;
    }
    const excludedActions = Array.isArray(setting) ? [] : Object.keys(setting).filter((x) => setting[x] === "never" || false).map((x) => new HierarchicalKind(x));
    progress.report({ message: localize("codeaction", "Quick Fixes") });
    const filteredSaveList = Array.isArray(setting) ? codeActionsOnSave : codeActionsOnSave.filter((x) => setting[x.value] === "always" || (setting[x.value] === "explicit" || setting[x.value] === true) && context.reason === SaveReason.EXPLICIT);
    await this.applyOnSaveActions(textEditorModel, filteredSaveList, excludedActions, progress, token);
  }
  createCodeActionsOnSave(settingItems) {
    const kinds = settingItems.map((x) => new HierarchicalKind(x));
    return kinds.filter((kind) => {
      return kinds.every((otherKind) => otherKind.equals(kind) || !otherKind.contains(kind));
    });
  }
  async applyOnSaveActions(model, codeActionsOnSave, excludes, progress, token) {
    const getActionProgress = new class {
      constructor() {
        this._names = /* @__PURE__ */ new Set();
      }
      _report() {
        progress.report({
          message: localize(
            { key: "codeaction.get2", comment: ["[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}"] },
            "Getting code actions from {0} ([configure]({1})).",
            [...this._names].map((name) => `'${name}'`).join(", "),
            createCommandUri("workbench.action.openSettings", "editor.codeActionsOnSave").toString()
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
      const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludes, getActionProgress, token);
      if (token.isCancellationRequested) {
        actionsToRun.dispose();
        return;
      }
      try {
        for (const action of actionsToRun.validActions) {
          progress.report({ message: localize("codeAction.apply", "Applying code action '{0}'.", action.action.title) });
          await this.instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
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
  getActionsToRun(model, codeActionKind, excludes, progress, token) {
    return getCodeActions(this.languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
      type: CodeActionTriggerType.Auto,
      triggerAction: CodeActionTriggerSource.OnSave,
      filter: { include: codeActionKind, excludes, includeSourceActions: true }
    }, progress, token);
  }
};
CodeActionOnSaveParticipant = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, IHostService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, ICodeEditorService)
], CodeActionOnSaveParticipant);
let SaveParticipantsContribution = class extends Disposable {
  constructor(instantiationService, textFileService) {
    super();
    this.instantiationService = instantiationService;
    this.textFileService = textFileService;
    this.registerSaveParticipants();
  }
  registerSaveParticipants() {
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(TrimWhitespaceParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(FinalNewLineParticipant)));
    this._register(this.textFileService.files.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));
  }
};
SaveParticipantsContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITextFileService)
], SaveParticipantsContribution);
const workbenchContributionsRegistry = Registry.as(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
export {
  FinalNewLineParticipant,
  SaveParticipantsContribution,
  TrimFinalNewLinesParticipant,
  TrimWhitespaceParticipant
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXHNhdmVQYXJ0aWNpcGFudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29tbWFuZFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yLCBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRyaW1UcmFpbGluZ1doaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbW1hbmRzL3RyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25Qcm92aWRlciwgQ29kZUFjdGlvblRyaWdnZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IEFwcGx5Q29kZUFjdGlvblJlYXNvbiwgYXBwbHlDb2RlQWN0aW9uLCBnZXRDb2RlQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25LaW5kLCBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IEZvcm1hdHRpbmdNb2RlLCBmb3JtYXREb2N1bWVudFJhbmdlc1dpdGhTZWxlY3RlZFByb3ZpZGVyLCBmb3JtYXREb2N1bWVudFdpdGhTZWxlY3RlZFByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9ybWF0L2Jyb3dzZXIvZm9ybWF0LmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU3RlcCwgUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hDb250cmlidXRpb25zRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlRWRpdG9yTW9kZWwsIElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCwgSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50Q29udGV4dCwgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0TW9kaWZpZWRSYW5nZXMgfSBmcm9tICcuLi8uLi9mb3JtYXQvYnJvd3Nlci9mb3JtYXRNb2RpZmllZC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUcmltV2hpdGVzcGFjZVBhcnRpY2lwYW50IGltcGxlbWVudHMgSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZVxuXHQpIHtcblx0XHQvLyBOb3RoaW5nXG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZShtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwsIGNvbnRleHQ6IElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIW1vZGVsLnRleHRFZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyaW1UcmFpbGluZ1doaXRlc3BhY2VPcHRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdmaWxlcy50cmltVHJhaWxpbmdXaGl0ZXNwYWNlJywgeyBvdmVycmlkZUlkZW50aWZpZXI6IG1vZGVsLnRleHRFZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHJlc291cmNlOiBtb2RlbC5yZXNvdXJjZSB9KTtcblx0XHRjb25zdCB0cmltSW5SZWdleEFuZFN0cmluZ3MgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdmaWxlcy50cmltVHJhaWxpbmdXaGl0ZXNwYWNlSW5SZWdleEFuZFN0cmluZ3MnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSwgcmVzb3VyY2U6IG1vZGVsLnJlc291cmNlIH0pO1xuXHRcdGlmICh0cmltVHJhaWxpbmdXaGl0ZXNwYWNlT3B0aW9uKSB7XG5cdFx0XHR0aGlzLmRvVHJpbVRyYWlsaW5nV2hpdGVzcGFjZShtb2RlbC50ZXh0RWRpdG9yTW9kZWwsIGNvbnRleHQucmVhc29uID09PSBTYXZlUmVhc29uLkFVVE8sIHRyaW1JblJlZ2V4QW5kU3RyaW5ncyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1RyaW1UcmFpbGluZ1doaXRlc3BhY2UobW9kZWw6IElUZXh0TW9kZWwsIGlzQXV0b1NhdmVkOiBib29sZWFuLCB0cmltSW5SZWdleGVzQW5kU3RyaW5nczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBwcmV2U2VsZWN0aW9uOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGxldCBjdXJzb3JzOiBQb3NpdGlvbltdID0gW107XG5cblx0XHRjb25zdCBlZGl0b3IgPSBmaW5kRWRpdG9yKG1vZGVsLCB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHQvLyBGaW5kIGBwcmV2U2VsZWN0aW9uYCBpbiBhbnkgY2FzZSBkbyBlbnN1cmUgYSBnb29kIHVuZG8gc3RhY2sgd2hlbiBwdXNoaW5nIHRoZSBlZGl0XG5cdFx0XHQvLyBDb2xsZWN0IGFjdGl2ZSBjdXJzb3JzIGluIGBjdXJzb3JzYCBvbmx5IGlmIGBpc0F1dG9TYXZlZGAgdG8gYXZvaWQgaGF2aW5nIHRoZSBjdXJzb3JzIGp1bXBcblx0XHRcdHByZXZTZWxlY3Rpb24gPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdFx0aWYgKGlzQXV0b1NhdmVkKSB7XG5cdFx0XHRcdGN1cnNvcnMgPSBwcmV2U2VsZWN0aW9uLm1hcChzID0+IHMuZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHRcdGNvbnN0IHNuaXBwZXRzUmFuZ2UgPSBTbmlwcGV0Q29udHJvbGxlcjIuZ2V0KGVkaXRvcik/LmdldFNlc3Npb25FbmNsb3NpbmdSYW5nZSgpO1xuXHRcdFx0XHRpZiAoc25pcHBldHNSYW5nZSkge1xuXHRcdFx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBzbmlwcGV0c1JhbmdlLnN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSBzbmlwcGV0c1JhbmdlLmVuZExpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRcdFx0Y3Vyc29ycy5wdXNoKG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BzID0gdHJpbVRyYWlsaW5nV2hpdGVzcGFjZShtb2RlbCwgY3Vyc29ycywgdHJpbUluUmVnZXhlc0FuZFN0cmluZ3MpO1xuXHRcdGlmICghb3BzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuOyAvLyBOb3RoaW5nIHRvIGRvXG5cdFx0fVxuXG5cdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKHByZXZTZWxlY3Rpb24sIG9wcywgKF9lZGl0cykgPT4gcHJldlNlbGVjdGlvbik7XG5cdH1cbn1cblxuZnVuY3Rpb24gZmluZEVkaXRvcihtb2RlbDogSVRleHRNb2RlbCwgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSk6IElBY3RpdmVDb2RlRWRpdG9yIHwgbnVsbCB7XG5cdGxldCBjYW5kaWRhdGU6IElBY3RpdmVDb2RlRWRpdG9yIHwgbnVsbCA9IG51bGw7XG5cblx0aWYgKG1vZGVsLmlzQXR0YWNoZWRUb0VkaXRvcigpKSB7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkpIHtcblx0XHRcdGlmIChlZGl0b3IuaGFzTW9kZWwoKSAmJiBlZGl0b3IuZ2V0TW9kZWwoKSA9PT0gbW9kZWwpIHtcblx0XHRcdFx0aWYgKGVkaXRvci5oYXNUZXh0Rm9jdXMoKSkge1xuXHRcdFx0XHRcdHJldHVybiBlZGl0b3I7IC8vIGZhdm91ciBmb2N1c2VkIGVkaXRvciBpZiB0aGVyZSBhcmUgbXVsdGlwbGVcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNhbmRpZGF0ZSA9IGVkaXRvcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gY2FuZGlkYXRlO1xufVxuXG5leHBvcnQgY2xhc3MgRmluYWxOZXdMaW5lUGFydGljaXBhbnQgaW1wbGVtZW50cyBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlXG5cdCkge1xuXHRcdC8vIE5vdGhpbmdcblx0fVxuXG5cdGFzeW5jIHBhcnRpY2lwYXRlKG1vZGVsOiBJVGV4dEZpbGVFZGl0b3JNb2RlbCwgY29udGV4dDogSVRleHRGaWxlU2F2ZVBhcnRpY2lwYW50Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbW9kZWwudGV4dEVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2ZpbGVzLmluc2VydEZpbmFsTmV3bGluZScsIHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCByZXNvdXJjZTogbW9kZWwucmVzb3VyY2UgfSkpIHtcblx0XHRcdHRoaXMuZG9JbnNlcnRGaW5hbE5ld0xpbmUobW9kZWwudGV4dEVkaXRvck1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvSW5zZXJ0RmluYWxOZXdMaW5lKG1vZGVsOiBJVGV4dE1vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgbGFzdExpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lQ291bnQpO1xuXHRcdGNvbnN0IGxhc3RMaW5lSXNFbXB0eU9yV2hpdGVzcGFjZSA9IHN0cmluZ3MubGFzdE5vbldoaXRlc3BhY2VJbmRleChsYXN0TGluZSkgPT09IC0xO1xuXG5cdFx0aWYgKCFsaW5lQ291bnQgfHwgbGFzdExpbmVJc0VtcHR5T3JXaGl0ZXNwYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdHMgPSBbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKGxpbmVDb3VudCwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lQ291bnQpKSwgbW9kZWwuZ2V0RU9MKCkpXTtcblx0XHRjb25zdCBlZGl0b3IgPSBmaW5kRWRpdG9yKG1vZGVsLCB0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCdpbnNlcnRGaW5hbE5ld0xpbmUnLCBlZGl0cywgZWRpdG9yLmdldFNlbGVjdGlvbnMoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhbXSwgZWRpdHMsICgpID0+IG51bGwpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHJpbUZpbmFsTmV3TGluZXNQYXJ0aWNpcGFudCBpbXBsZW1lbnRzIElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gTm90aGluZ1xuXHR9XG5cblx0YXN5bmMgcGFydGljaXBhdGUobW9kZWw6IElUZXh0RmlsZUVkaXRvck1vZGVsLCBjb250ZXh0OiBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFtb2RlbC50ZXh0RWRpdG9yTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZmlsZXMudHJpbUZpbmFsTmV3bGluZXMnLCB7IG92ZXJyaWRlSWRlbnRpZmllcjogbW9kZWwudGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSwgcmVzb3VyY2U6IG1vZGVsLnJlc291cmNlIH0pKSB7XG5cdFx0XHR0aGlzLmRvVHJpbUZpbmFsTmV3TGluZXMobW9kZWwudGV4dEVkaXRvck1vZGVsLCBjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogcmV0dXJucyAwIGlmIHRoZSBlbnRpcmUgZmlsZSBpcyBlbXB0eVxuXHQgKi9cblx0cHJpdmF0ZSBmaW5kTGFzdE5vbkVtcHR5TGluZShtb2RlbDogSVRleHRNb2RlbCk6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IG1vZGVsLmdldExpbmVDb3VudCgpOyBsaW5lTnVtYmVyID49IDE7IGxpbmVOdW1iZXItLSkge1xuXHRcdFx0Y29uc3QgbGluZUxlbmd0aCA9IG1vZGVsLmdldExpbmVMZW5ndGgobGluZU51bWJlcik7XG5cdFx0XHRpZiAobGluZUxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gdGhpcyBsaW5lIGhhcyBjb250ZW50XG5cdFx0XHRcdHJldHVybiBsaW5lTnVtYmVyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBubyBsaW5lIGhhcyBjb250ZW50XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwcml2YXRlIGRvVHJpbUZpbmFsTmV3TGluZXMobW9kZWw6IElUZXh0TW9kZWwsIGlzQXV0b1NhdmVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cblx0XHQvLyBEbyBub3QgaW5zZXJ0IG5ldyBsaW5lIGlmIGZpbGUgZG9lcyBub3QgZW5kIHdpdGggbmV3IGxpbmVcblx0XHRpZiAobGluZUNvdW50ID09PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHByZXZTZWxlY3Rpb246IFNlbGVjdGlvbltdID0gW107XG5cdFx0bGV0IGNhbm5vdFRvdWNoTGluZU51bWJlciA9IDA7XG5cdFx0Y29uc3QgZWRpdG9yID0gZmluZEVkaXRvcihtb2RlbCwgdGhpcy5jb2RlRWRpdG9yU2VydmljZSk7XG5cdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0cHJldlNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0XHRpZiAoaXNBdXRvU2F2ZWQpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHByZXZTZWxlY3Rpb24ubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBwb3NpdGlvbkxpbmVOdW1iZXIgPSBwcmV2U2VsZWN0aW9uW2ldLnBvc2l0aW9uTGluZU51bWJlcjtcblx0XHRcdFx0XHRpZiAocG9zaXRpb25MaW5lTnVtYmVyID4gY2Fubm90VG91Y2hMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRjYW5ub3RUb3VjaExpbmVOdW1iZXIgPSBwb3NpdGlvbkxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdE5vbkVtcHR5TGluZSA9IHRoaXMuZmluZExhc3ROb25FbXB0eUxpbmUobW9kZWwpO1xuXHRcdGNvbnN0IGRlbGV0ZUZyb21MaW5lTnVtYmVyID0gTWF0aC5tYXgobGFzdE5vbkVtcHR5TGluZSArIDEsIGNhbm5vdFRvdWNoTGluZU51bWJlciArIDEpO1xuXHRcdGNvbnN0IGRlbGV0aW9uUmFuZ2UgPSBtb2RlbC52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZShkZWxldGVGcm9tTGluZU51bWJlciwgMSwgbGluZUNvdW50LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVDb3VudCkpKTtcblxuXHRcdGlmIChkZWxldGlvblJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhwcmV2U2VsZWN0aW9uLCBbRWRpdE9wZXJhdGlvbi5kZWxldGUoZGVsZXRpb25SYW5nZSldLCBfZWRpdHMgPT4gcHJldlNlbGVjdGlvbik7XG5cblx0XHRlZGl0b3I/LnNldFNlbGVjdGlvbnMocHJldlNlbGVjdGlvbik7XG5cdH1cbn1cblxuY2xhc3MgRm9ybWF0T25TYXZlUGFydGljaXBhbnQgaW1wbGVtZW50cyBJVGV4dEZpbGVTYXZlUGFydGljaXBhbnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHQvLyBOb3RoaW5nXG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZShtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwsIGNvbnRleHQ6IElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbW9kZWwudGV4dEVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0LnJlYXNvbiA9PT0gU2F2ZVJlYXNvbi5BVVRPKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRleHRFZGl0b3JNb2RlbCA9IG1vZGVsLnRleHRFZGl0b3JNb2RlbDtcblx0XHRjb25zdCBvdmVycmlkZXMgPSB7IG92ZXJyaWRlSWRlbnRpZmllcjogdGV4dEVkaXRvck1vZGVsLmdldExhbmd1YWdlSWQoKSwgcmVzb3VyY2U6IHRleHRFZGl0b3JNb2RlbC51cmkgfTtcblxuXHRcdGNvbnN0IG5lc3RlZFByb2dyZXNzID0gbmV3IFByb2dyZXNzPHsgZGlzcGxheU5hbWU/OiBzdHJpbmc7IGV4dGVuc2lvbklkPzogRXh0ZW5zaW9uSWRlbnRpZmllciB9Pihwcm92aWRlciA9PiB7XG5cdFx0XHRwcm9ncmVzcy5yZXBvcnQoe1xuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZShcblx0XHRcdFx0XHR7IGtleTogJ2Zvcm1hdHRpbmcyJywgY29tbWVudDogWydbY29uZmlndXJlXSh7MX0pIGlzIGEgbGluay4gT25seSB0cmFuc2xhdGUgYGNvbmZpZ3VyZWAuIERvIG5vdCBjaGFuZ2UgYnJhY2tldHMgYW5kIHBhcmVudGhlc2VzIG9yIHsxfSddIH0sXG5cdFx0XHRcdFx0XCJSdW5uaW5nICd7MH0nIEZvcm1hdHRlciAoW2NvbmZpZ3VyZV0oezF9KSkuXCIsXG5cdFx0XHRcdFx0cHJvdmlkZXIuZGlzcGxheU5hbWUgfHwgcHJvdmlkZXIuZXh0ZW5zaW9uSWQgJiYgcHJvdmlkZXIuZXh0ZW5zaW9uSWQudmFsdWUgfHwgJz8/PycsXG5cdFx0XHRcdFx0Y3JlYXRlQ29tbWFuZFVyaSgnd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnLCAnZWRpdG9yLmZvcm1hdE9uU2F2ZScpLnRvU3RyaW5nKCksXG5cdFx0XHRcdClcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5mb3JtYXRPblNhdmUnLCBvdmVycmlkZXMpO1xuXHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBlZGl0b3JPck1vZGVsID0gZmluZEVkaXRvcih0ZXh0RWRpdG9yTW9kZWwsIHRoaXMuY29kZUVkaXRvclNlcnZpY2UpIHx8IHRleHRFZGl0b3JNb2RlbDtcblx0XHRjb25zdCBtb2RlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZmlsZScgfCAnbW9kaWZpY2F0aW9ucycgfCAnbW9kaWZpY2F0aW9uc0lmQXZhaWxhYmxlJz4oJ2VkaXRvci5mb3JtYXRPblNhdmVNb2RlJywgb3ZlcnJpZGVzKTtcblxuXHRcdGlmIChtb2RlID09PSAnZmlsZScpIHtcblx0XHRcdGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZm9ybWF0RG9jdW1lbnRXaXRoU2VsZWN0ZWRQcm92aWRlciwgZWRpdG9yT3JNb2RlbCwgRm9ybWF0dGluZ01vZGUuU2lsZW50LCBuZXN0ZWRQcm9ncmVzcywgdG9rZW4pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJhbmdlcyA9IGF3YWl0IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0TW9kaWZpZWRSYW5nZXMsIGlzQ29kZUVkaXRvcihlZGl0b3JPck1vZGVsKSA/IGVkaXRvck9yTW9kZWwuZ2V0TW9kZWwoKSA6IGVkaXRvck9yTW9kZWwpO1xuXHRcdFx0aWYgKHJhbmdlcyA9PT0gbnVsbCAmJiBtb2RlID09PSAnbW9kaWZpY2F0aW9uc0lmQXZhaWxhYmxlJykge1xuXHRcdFx0XHQvLyBubyBTQ00sIGZhbGxiYWNrIHRvIGZvcm1hdHRpbmcgdGhlIHdob2xlIGZpbGUgaWZmIHdhbnRlZFxuXHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZvcm1hdERvY3VtZW50V2l0aFNlbGVjdGVkUHJvdmlkZXIsIGVkaXRvck9yTW9kZWwsIEZvcm1hdHRpbmdNb2RlLlNpbGVudCwgbmVzdGVkUHJvZ3Jlc3MsIHRva2VuKTtcblxuXHRcdFx0fSBlbHNlIGlmIChyYW5nZXMpIHtcblx0XHRcdFx0Ly8gZm9ybWF0dGVkIG1vZGlmaWVkIHJhbmdlc1xuXHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZvcm1hdERvY3VtZW50UmFuZ2VzV2l0aFNlbGVjdGVkUHJvdmlkZXIsIGVkaXRvck9yTW9kZWwsIHJhbmdlcywgRm9ybWF0dGluZ01vZGUuU2lsZW50LCBuZXN0ZWRQcm9ncmVzcywgdG9rZW4sIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgQ29kZUFjdGlvbk9uU2F2ZVBhcnRpY2lwYW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb2RlRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoKCkgPT4geyB0aGlzLnRyaWdnZXJDb2RlQWN0aW9uc0NvbW1hbmQoKTsgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7IHRoaXMudHJpZ2dlckNvZGVBY3Rpb25zQ29tbWFuZCgpOyB9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHRyaWdnZXJDb2RlQWN0aW9uc0NvbW1hbmQoKSB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2VkaXRvci5jb2RlQWN0aW9ucy50cmlnZ2VyT25Gb2N1c0NoYW5nZScpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignZmlsZXMuYXV0b1NhdmUnKSA9PT0gJ2FmdGVyRGVsYXknKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpPy5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXR0aW5nc092ZXJyaWRlcyA9IHsgb3ZlcnJpZGVJZGVudGlmaWVyOiBtb2RlbC5nZXRMYW5ndWFnZUlkKCksIHJlc291cmNlOiBtb2RlbC51cmkgfTtcblx0XHRcdGNvbnN0IHNldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgW2tpbmQ6IHN0cmluZ106IHN0cmluZyB8IGJvb2xlYW4gfSB8IHN0cmluZ1tdPignZWRpdG9yLmNvZGVBY3Rpb25zT25TYXZlJywgc2V0dGluZ3NPdmVycmlkZXMpO1xuXG5cdFx0XHRpZiAoIXNldHRpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoc2V0dGluZykpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2V0dGluZ0l0ZW1zOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKHNldHRpbmcpLmZpbHRlcih4ID0+IHNldHRpbmdbeF0gJiYgc2V0dGluZ1t4XSA9PT0gJ2Fsd2F5cycgJiYgQ29kZUFjdGlvbktpbmQuU291cmNlLmNvbnRhaW5zKG5ldyBIaWVyYXJjaGljYWxLaW5kKHgpKSk7XG5cblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRcdGNvbnN0IGNvZGVBY3Rpb25LaW5kTGlzdCA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHNldHRpbmdJdGVtcykge1xuXHRcdFx0XHRjb2RlQWN0aW9uS2luZExpc3QucHVzaChuZXcgSGllcmFyY2hpY2FsS2luZChpdGVtKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHJ1biBjb2RlIGFjdGlvbnMgYmFzZWQgb24gd2hhdCBpcyBmb3VuZCBmcm9tIHNldHRpbmcgPT09ICdhbHdheXMnLCBubyBleGNsdXNpb25zLlxuXHRcdFx0YXdhaXQgdGhpcy5hcHBseU9uU2F2ZUFjdGlvbnMobW9kZWwsIGNvZGVBY3Rpb25LaW5kTGlzdCwgW10sIFByb2dyZXNzLk5vbmUsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBwYXJ0aWNpcGF0ZShtb2RlbDogSVRleHRGaWxlRWRpdG9yTW9kZWwsIGNvbnRleHQ6IElUZXh0RmlsZVNhdmVQYXJ0aWNpcGFudENvbnRleHQsIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbW9kZWwudGV4dEVkaXRvck1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dEVkaXRvck1vZGVsID0gbW9kZWwudGV4dEVkaXRvck1vZGVsO1xuXHRcdGNvbnN0IHNldHRpbmdzT3ZlcnJpZGVzID0geyBvdmVycmlkZUlkZW50aWZpZXI6IHRleHRFZGl0b3JNb2RlbC5nZXRMYW5ndWFnZUlkKCksIHJlc291cmNlOiB0ZXh0RWRpdG9yTW9kZWwudXJpIH07XG5cblx0XHQvLyBDb252ZXJ0IGJvb2xlYW4gdmFsdWVzIHRvIHN0cmluZ3Ncblx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtraW5kOiBzdHJpbmddOiBzdHJpbmcgfCBib29sZWFuIH0gfCBzdHJpbmdbXT4oJ2VkaXRvci5jb2RlQWN0aW9uc09uU2F2ZScsIHNldHRpbmdzT3ZlcnJpZGVzKTtcblx0XHRpZiAoIXNldHRpbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVhc29uID09PSBTYXZlUmVhc29uLkFVVE8pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnRleHQucmVhc29uICE9PSBTYXZlUmVhc29uLkVYUExJQ0lUICYmIEFycmF5LmlzQXJyYXkoc2V0dGluZykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2V0dGluZ0l0ZW1zOiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkoc2V0dGluZylcblx0XHRcdD8gc2V0dGluZ1xuXHRcdFx0OiBPYmplY3Qua2V5cyhzZXR0aW5nKS5maWx0ZXIoeCA9PiBzZXR0aW5nW3hdICYmIHNldHRpbmdbeF0gIT09ICduZXZlcicpO1xuXG5cdFx0Y29uc3QgY29kZUFjdGlvbnNPblNhdmUgPSB0aGlzLmNyZWF0ZUNvZGVBY3Rpb25zT25TYXZlKHNldHRpbmdJdGVtcyk7XG5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc2V0dGluZykpIHtcblx0XHRcdGNvZGVBY3Rpb25zT25TYXZlLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0aWYgKENvZGVBY3Rpb25LaW5kLlNvdXJjZUZpeEFsbC5jb250YWlucyhhKSkge1xuXHRcdFx0XHRcdGlmIChDb2RlQWN0aW9uS2luZC5Tb3VyY2VGaXhBbGwuY29udGFpbnMoYikpIHtcblx0XHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gLTE7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKENvZGVBY3Rpb25LaW5kLlNvdXJjZUZpeEFsbC5jb250YWlucyhiKSkge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFjb2RlQWN0aW9uc09uU2F2ZS5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGV4Y2x1ZGVkQWN0aW9ucyA9IEFycmF5LmlzQXJyYXkoc2V0dGluZylcblx0XHRcdD8gW11cblx0XHRcdDogT2JqZWN0LmtleXMoc2V0dGluZylcblx0XHRcdFx0LmZpbHRlcih4ID0+IHNldHRpbmdbeF0gPT09ICduZXZlcicgfHwgZmFsc2UpXG5cdFx0XHRcdC5tYXAoeCA9PiBuZXcgSGllcmFyY2hpY2FsS2luZCh4KSk7XG5cblx0XHRwcm9ncmVzcy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnY29kZWFjdGlvbicsIFwiUXVpY2sgRml4ZXNcIikgfSk7XG5cblx0XHRjb25zdCBmaWx0ZXJlZFNhdmVMaXN0ID0gQXJyYXkuaXNBcnJheShzZXR0aW5nKSA/IGNvZGVBY3Rpb25zT25TYXZlIDogY29kZUFjdGlvbnNPblNhdmUuZmlsdGVyKHggPT4gc2V0dGluZ1t4LnZhbHVlXSA9PT0gJ2Fsd2F5cycgfHwgKChzZXR0aW5nW3gudmFsdWVdID09PSAnZXhwbGljaXQnIHx8IHNldHRpbmdbeC52YWx1ZV0gPT09IHRydWUpICYmIGNvbnRleHQucmVhc29uID09PSBTYXZlUmVhc29uLkVYUExJQ0lUKSk7XG5cblx0XHRhd2FpdCB0aGlzLmFwcGx5T25TYXZlQWN0aW9ucyh0ZXh0RWRpdG9yTW9kZWwsIGZpbHRlcmVkU2F2ZUxpc3QsIGV4Y2x1ZGVkQWN0aW9ucywgcHJvZ3Jlc3MsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29kZUFjdGlvbnNPblNhdmUoc2V0dGluZ0l0ZW1zOiByZWFkb25seSBzdHJpbmdbXSk6IEhpZXJhcmNoaWNhbEtpbmRbXSB7XG5cdFx0Y29uc3Qga2luZHMgPSBzZXR0aW5nSXRlbXMubWFwKHggPT4gbmV3IEhpZXJhcmNoaWNhbEtpbmQoeCkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHN1YnNldHNcblx0XHRyZXR1cm4ga2luZHMuZmlsdGVyKGtpbmQgPT4ge1xuXHRcdFx0cmV0dXJuIGtpbmRzLmV2ZXJ5KG90aGVyS2luZCA9PiBvdGhlcktpbmQuZXF1YWxzKGtpbmQpIHx8ICFvdGhlcktpbmQuY29udGFpbnMoa2luZCkpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhcHBseU9uU2F2ZUFjdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGNvZGVBY3Rpb25zT25TYXZlOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10sIGV4Y2x1ZGVzOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10sIHByb2dyZXNzOiBJUHJvZ3Jlc3M8SVByb2dyZXNzU3RlcD4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Y29uc3QgZ2V0QWN0aW9uUHJvZ3Jlc3MgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJUHJvZ3Jlc3M8Q29kZUFjdGlvblByb3ZpZGVyPiB7XG5cdFx0XHRwcml2YXRlIF9uYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0cHJpdmF0ZSBfcmVwb3J0KCk6IHZvaWQge1xuXHRcdFx0XHRwcm9ncmVzcy5yZXBvcnQoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdjb2RlYWN0aW9uLmdldDInLCBjb21tZW50OiBbJ1tjb25maWd1cmVdKHsxfSkgaXMgYSBsaW5rLiBPbmx5IHRyYW5zbGF0ZSBgY29uZmlndXJlYC4gRG8gbm90IGNoYW5nZSBicmFja2V0cyBhbmQgcGFyZW50aGVzZXMgb3IgezF9J10gfSxcblx0XHRcdFx0XHRcdFwiR2V0dGluZyBjb2RlIGFjdGlvbnMgZnJvbSB7MH0gKFtjb25maWd1cmVdKHsxfSkpLlwiLFxuXHRcdFx0XHRcdFx0Wy4uLnRoaXMuX25hbWVzXS5tYXAobmFtZSA9PiBgJyR7bmFtZX0nYCkuam9pbignLCAnKSxcblx0XHRcdFx0XHRcdGNyZWF0ZUNvbW1hbmRVcmkoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgJ2VkaXRvci5jb2RlQWN0aW9uc09uU2F2ZScpLnRvU3RyaW5nKClcblx0XHRcdFx0XHQpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmVwb3J0KHByb3ZpZGVyOiBDb2RlQWN0aW9uUHJvdmlkZXIpIHtcblx0XHRcdFx0aWYgKHByb3ZpZGVyLmRpc3BsYXlOYW1lICYmICF0aGlzLl9uYW1lcy5oYXMocHJvdmlkZXIuZGlzcGxheU5hbWUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbmFtZXMuYWRkKHByb3ZpZGVyLmRpc3BsYXlOYW1lKTtcblx0XHRcdFx0XHR0aGlzLl9yZXBvcnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IGNvZGVBY3Rpb25LaW5kIG9mIGNvZGVBY3Rpb25zT25TYXZlKSB7XG5cdFx0XHRjb25zdCBhY3Rpb25zVG9SdW4gPSBhd2FpdCB0aGlzLmdldEFjdGlvbnNUb1J1bihtb2RlbCwgY29kZUFjdGlvbktpbmQsIGV4Y2x1ZGVzLCBnZXRBY3Rpb25Qcm9ncmVzcywgdG9rZW4pO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0YWN0aW9uc1RvUnVuLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zVG9SdW4udmFsaWRBY3Rpb25zKSB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3MucmVwb3J0KHsgbWVzc2FnZTogbG9jYWxpemUoJ2NvZGVBY3Rpb24uYXBwbHknLCBcIkFwcGx5aW5nIGNvZGUgYWN0aW9uICd7MH0nLlwiLCBhY3Rpb24uYWN0aW9uLnRpdGxlKSB9KTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFwcGx5Q29kZUFjdGlvbiwgYWN0aW9uLCBBcHBseUNvZGVBY3Rpb25SZWFzb24uT25TYXZlLCB7fSwgdG9rZW4pO1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIEZhaWx1cmUgdG8gYXBwbHkgYSBjb2RlIGFjdGlvbiBzaG91bGQgbm90IGJsb2NrIG90aGVyIG9uIHNhdmUgYWN0aW9uc1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YWN0aW9uc1RvUnVuLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnNUb1J1bihtb2RlbDogSVRleHRNb2RlbCwgY29kZUFjdGlvbktpbmQ6IEhpZXJhcmNoaWNhbEtpbmQsIGV4Y2x1ZGVzOiByZWFkb25seSBIaWVyYXJjaGljYWxLaW5kW10sIHByb2dyZXNzOiBJUHJvZ3Jlc3M8Q29kZUFjdGlvblByb3ZpZGVyPiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0cmV0dXJuIGdldENvZGVBY3Rpb25zKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLCBtb2RlbCwgbW9kZWwuZ2V0RnVsbE1vZGVsUmFuZ2UoKSwge1xuXHRcdFx0dHlwZTogQ29kZUFjdGlvblRyaWdnZXJUeXBlLkF1dG8sXG5cdFx0XHR0cmlnZ2VyQWN0aW9uOiBDb2RlQWN0aW9uVHJpZ2dlclNvdXJjZS5PblNhdmUsXG5cdFx0XHRmaWx0ZXI6IHsgaW5jbHVkZTogY29kZUFjdGlvbktpbmQsIGV4Y2x1ZGVzOiBleGNsdWRlcywgaW5jbHVkZVNvdXJjZUFjdGlvbnM6IHRydWUgfSxcblx0XHR9LCBwcm9ncmVzcywgdG9rZW4pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTYXZlUGFydGljaXBhbnRzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyU2F2ZVBhcnRpY2lwYW50cygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNhdmVQYXJ0aWNpcGFudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJpbVdoaXRlc3BhY2VQYXJ0aWNpcGFudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRleHRGaWxlU2VydmljZS5maWxlcy5hZGRTYXZlUGFydGljaXBhbnQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlQWN0aW9uT25TYXZlUGFydGljaXBhbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRm9ybWF0T25TYXZlUGFydGljaXBhbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmluYWxOZXdMaW5lUGFydGljaXBhbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50ZXh0RmlsZVNlcnZpY2UuZmlsZXMuYWRkU2F2ZVBhcnRpY2lwYW50KHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVHJpbUZpbmFsTmV3TGluZXNQYXJ0aWNpcGFudCkpKTtcblx0fVxufVxuXG5jb25zdCB3b3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hDb250cmlidXRpb25zRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpO1xud29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFNhdmVQYXJ0aWNpcGFudHNDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQWtC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
