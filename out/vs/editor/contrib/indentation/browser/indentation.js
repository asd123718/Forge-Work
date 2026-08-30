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
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import * as nls from "../../../../nls.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { ShiftCommand } from "../../../common/commands/shiftCommand.js";
import { EditorAutoIndentStrategy, EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { getGoodIndentForLine, getIndentMetadata } from "../../../common/languages/autoIndent.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { IndentConsts } from "../../../common/languages/supports/indentRules.js";
import { IModelService } from "../../../common/services/model.js";
import { getStandardTokenTypeAtPosition } from "../../../common/tokens/lineTokens.js";
import { getReindentEditOperations } from "../common/indentation.js";
import * as indentUtils from "../common/indentUtils.js";
const _IndentationToSpacesAction = class _IndentationToSpacesAction extends EditorAction {
  constructor() {
    super({
      id: _IndentationToSpacesAction.ID,
      label: nls.localize2("indentationToSpaces", "Convert Indentation to Spaces"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("indentationToSpacesDescription", "Convert the tab indentation to spaces.")
      }
    });
  }
  run(accessor, editor) {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const modelOpts = model.getOptions();
    const selection = editor.getSelection();
    if (!selection) {
      return;
    }
    const command = new IndentationToSpacesCommand(selection, modelOpts.tabSize);
    editor.pushUndoStop();
    editor.executeCommands(this.id, [command]);
    editor.pushUndoStop();
    model.updateOptions({
      insertSpaces: true
    });
  }
};
_IndentationToSpacesAction.ID = "editor.action.indentationToSpaces";
let IndentationToSpacesAction = _IndentationToSpacesAction;
const _IndentationToTabsAction = class _IndentationToTabsAction extends EditorAction {
  constructor() {
    super({
      id: _IndentationToTabsAction.ID,
      label: nls.localize2("indentationToTabs", "Convert Indentation to Tabs"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("indentationToTabsDescription", "Convert the spaces indentation to tabs.")
      }
    });
  }
  run(accessor, editor) {
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const modelOpts = model.getOptions();
    const selection = editor.getSelection();
    if (!selection) {
      return;
    }
    const command = new IndentationToTabsCommand(selection, modelOpts.tabSize);
    editor.pushUndoStop();
    editor.executeCommands(this.id, [command]);
    editor.pushUndoStop();
    model.updateOptions({
      insertSpaces: false
    });
  }
};
_IndentationToTabsAction.ID = "editor.action.indentationToTabs";
let IndentationToTabsAction = _IndentationToTabsAction;
class ChangeIndentationSizeAction extends EditorAction {
  constructor(insertSpaces, displaySizeOnly, opts) {
    super(opts);
    this.insertSpaces = insertSpaces;
    this.displaySizeOnly = displaySizeOnly;
  }
  run(accessor, editor) {
    const quickInputService = accessor.get(IQuickInputService);
    const modelService = accessor.get(IModelService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const creationOpts = modelService.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
    const modelOpts = model.getOptions();
    const picks = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
      id: n.toString(),
      label: n.toString(),
      // add description for tabSize value set in the configuration
      description: n === creationOpts.tabSize && n === modelOpts.tabSize ? nls.localize("configuredTabSize", "Configured Tab Size") : n === creationOpts.tabSize ? nls.localize("defaultTabSize", "Default Tab Size") : n === modelOpts.tabSize ? nls.localize("currentTabSize", "Current Tab Size") : void 0
    }));
    const autoFocusIndex = Math.min(model.getOptions().tabSize - 1, 7);
    setTimeout(
      () => {
        quickInputService.pick(picks, { placeHolder: nls.localize({ key: "selectTabWidth", comment: ["Tab corresponds to the tab key"] }, "Select Tab Size for Current File"), activeItem: picks[autoFocusIndex] }).then((pick) => {
          if (pick) {
            if (model && !model.isDisposed()) {
              const pickedVal = parseInt(pick.label, 10);
              if (this.displaySizeOnly) {
                model.updateOptions({
                  tabSize: pickedVal
                });
              } else {
                model.updateOptions({
                  tabSize: pickedVal,
                  indentSize: pickedVal,
                  insertSpaces: this.insertSpaces
                });
              }
            }
          }
        });
      },
      50
      /* quick input is sensitive to being opened so soon after another */
    );
  }
}
const _IndentUsingTabs = class _IndentUsingTabs extends ChangeIndentationSizeAction {
  constructor() {
    super(false, false, {
      id: _IndentUsingTabs.ID,
      label: nls.localize2("indentUsingTabs", "Indent Using Tabs"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("indentUsingTabsDescription", "Use indentation with tabs.")
      }
    });
  }
};
_IndentUsingTabs.ID = "editor.action.indentUsingTabs";
let IndentUsingTabs = _IndentUsingTabs;
const _IndentUsingSpaces = class _IndentUsingSpaces extends ChangeIndentationSizeAction {
  constructor() {
    super(true, false, {
      id: _IndentUsingSpaces.ID,
      label: nls.localize2("indentUsingSpaces", "Indent Using Spaces"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("indentUsingSpacesDescription", "Use indentation with spaces.")
      }
    });
  }
};
_IndentUsingSpaces.ID = "editor.action.indentUsingSpaces";
let IndentUsingSpaces = _IndentUsingSpaces;
const _ChangeTabDisplaySize = class _ChangeTabDisplaySize extends ChangeIndentationSizeAction {
  constructor() {
    super(true, true, {
      id: _ChangeTabDisplaySize.ID,
      label: nls.localize2("changeTabDisplaySize", "Change Tab Display Size"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("changeTabDisplaySizeDescription", "Change the space size equivalent of the tab.")
      }
    });
  }
};
_ChangeTabDisplaySize.ID = "editor.action.changeTabDisplaySize";
let ChangeTabDisplaySize = _ChangeTabDisplaySize;
const _DetectIndentation = class _DetectIndentation extends EditorAction {
  constructor() {
    super({
      id: _DetectIndentation.ID,
      label: nls.localize2("detectIndentation", "Detect Indentation from Content"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("detectIndentationDescription", "Detect the indentation from content.")
      }
    });
  }
  run(accessor, editor) {
    const modelService = accessor.get(IModelService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const creationOpts = modelService.getCreationOptions(model.getLanguageId(), model.uri, model.isForSimpleWidget);
    model.detectIndentation(creationOpts.insertSpaces, creationOpts.tabSize);
  }
};
_DetectIndentation.ID = "editor.action.detectIndentation";
let DetectIndentation = _DetectIndentation;
class ReindentLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.reindentlines",
      label: nls.localize2("editor.reindentlines", "Reindent Lines"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("editor.reindentlinesDescription", "Reindent the lines of the editor.")
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const edits = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    if (edits.length > 0) {
      editor.pushUndoStop();
      editor.executeEdits(this.id, edits);
      editor.pushUndoStop();
    }
  }
}
class ReindentSelectedLinesAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.reindentselectedlines",
      label: nls.localize2("editor.reindentselectedlines", "Reindent Selected Lines"),
      precondition: EditorContextKeys.writable,
      metadata: {
        description: nls.localize2("editor.reindentselectedlinesDescription", "Reindent the selected lines of the editor.")
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor) {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const selections = editor.getSelections();
    if (selections === null) {
      return;
    }
    const edits = [];
    for (const selection of selections) {
      let startLineNumber = selection.startLineNumber;
      let endLineNumber = selection.endLineNumber;
      if (startLineNumber !== endLineNumber && selection.endColumn === 1) {
        endLineNumber--;
      }
      if (startLineNumber === 1) {
        if (startLineNumber === endLineNumber) {
          continue;
        }
      } else {
        startLineNumber--;
      }
      const editOperations = getReindentEditOperations(model, languageConfigurationService, startLineNumber, endLineNumber);
      edits.push(...editOperations);
    }
    if (edits.length > 0) {
      editor.pushUndoStop();
      editor.executeEdits(this.id, edits);
      editor.pushUndoStop();
    }
  }
}
class AutoIndentOnPasteCommand {
  constructor(edits, initialSelection) {
    this._initialSelection = initialSelection;
    this._edits = [];
    this._selectionId = null;
    for (const edit of edits) {
      if (edit.range && typeof edit.text === "string") {
        this._edits.push(edit);
      }
    }
  }
  getEditOperations(model, builder) {
    for (const edit of this._edits) {
      builder.addEditOperation(Range.lift(edit.range), edit.text);
    }
    let selectionIsSet = false;
    if (Array.isArray(this._edits) && this._edits.length === 1 && this._initialSelection.isEmpty()) {
      if (this._edits[0].range.startColumn === this._initialSelection.endColumn && this._edits[0].range.startLineNumber === this._initialSelection.endLineNumber) {
        selectionIsSet = true;
        this._selectionId = builder.trackSelection(this._initialSelection, true);
      } else if (this._edits[0].range.endColumn === this._initialSelection.startColumn && this._edits[0].range.endLineNumber === this._initialSelection.startLineNumber) {
        selectionIsSet = true;
        this._selectionId = builder.trackSelection(this._initialSelection, false);
      }
    }
    if (!selectionIsSet) {
      this._selectionId = builder.trackSelection(this._initialSelection);
    }
  }
  computeCursorState(model, helper) {
    return helper.getTrackedSelection(this._selectionId);
  }
}
let AutoIndentOnPaste = class {
  constructor(editor, _languageConfigurationService) {
    this.editor = editor;
    this._languageConfigurationService = _languageConfigurationService;
    this.callOnDispose = new DisposableStore();
    this.callOnModel = new DisposableStore();
    this.callOnDispose.add(editor.onDidChangeConfiguration(() => this.update()));
    this.callOnDispose.add(editor.onDidChangeModel(() => this.update()));
    this.callOnDispose.add(editor.onDidChangeModelLanguage(() => this.update()));
  }
  update() {
    this.callOnModel.clear();
    if (!this.editor.getOption(EditorOption.autoIndentOnPaste) || this.editor.getOption(EditorOption.autoIndent) < EditorAutoIndentStrategy.Full) {
      return;
    }
    if (!this.editor.hasModel()) {
      return;
    }
    this.callOnModel.add(this.editor.onDidPaste(({ range }) => {
      this.trigger(range);
    }));
  }
  trigger(range) {
    const selections = this.editor.getSelections();
    if (selections === null || selections.length > 1) {
      return;
    }
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    const containsOnlyWhitespace = this.rangeContainsOnlyWhitespaceCharacters(model, range);
    if (containsOnlyWhitespace) {
      return;
    }
    if (!this.editor.getOption(EditorOption.autoIndentOnPasteWithinString) && isStartOrEndInString(model, range)) {
      return;
    }
    if (!model.tokenization.isCheapToTokenize(range.getStartPosition().lineNumber)) {
      return;
    }
    const autoIndent = this.editor.getOption(EditorOption.autoIndent);
    const { tabSize, indentSize, insertSpaces } = model.getOptions();
    const textEdits = [];
    const indentConverter = {
      shiftIndent: (indentation) => {
        return ShiftCommand.shiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      },
      unshiftIndent: (indentation) => {
        return ShiftCommand.unshiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
      }
    };
    let startLineNumber = range.startLineNumber;
    let firstLineText = model.getLineContent(startLineNumber);
    if (!/\S/.test(firstLineText.substring(0, range.startColumn - 1))) {
      const indentOfFirstLine = getGoodIndentForLine(autoIndent, model, model.getLanguageId(), startLineNumber, indentConverter, this._languageConfigurationService);
      if (indentOfFirstLine !== null) {
        const oldIndentation = strings.getLeadingWhitespace(firstLineText);
        const newSpaceCnt = indentUtils.getSpaceCnt(indentOfFirstLine, tabSize);
        const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
        if (newSpaceCnt !== oldSpaceCnt) {
          const newIndent = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
          textEdits.push({
            range: new Range(startLineNumber, 1, startLineNumber, oldIndentation.length + 1),
            text: newIndent
          });
          firstLineText = newIndent + firstLineText.substring(oldIndentation.length);
        } else {
          const indentMetadata = getIndentMetadata(model, startLineNumber, this._languageConfigurationService);
          if (indentMetadata === 0 || indentMetadata === IndentConsts.UNINDENT_MASK) {
            return;
          }
        }
      }
    }
    const firstLineNumber = startLineNumber;
    while (startLineNumber < range.endLineNumber) {
      if (!/\S/.test(model.getLineContent(startLineNumber + 1))) {
        startLineNumber++;
        continue;
      }
      break;
    }
    if (startLineNumber !== range.endLineNumber) {
      const virtualModel = {
        tokenization: {
          getLineTokens: (lineNumber) => {
            return model.tokenization.getLineTokens(lineNumber);
          },
          getLanguageId: () => {
            return model.getLanguageId();
          },
          getLanguageIdAtPosition: (lineNumber, column) => {
            return model.getLanguageIdAtPosition(lineNumber, column);
          }
        },
        getLineContent: (lineNumber) => {
          if (lineNumber === firstLineNumber) {
            return firstLineText;
          } else {
            return model.getLineContent(lineNumber);
          }
        }
      };
      const indentOfSecondLine = getGoodIndentForLine(autoIndent, virtualModel, model.getLanguageId(), startLineNumber + 1, indentConverter, this._languageConfigurationService);
      if (indentOfSecondLine !== null) {
        const newSpaceCntOfSecondLine = indentUtils.getSpaceCnt(indentOfSecondLine, tabSize);
        const oldSpaceCntOfSecondLine = indentUtils.getSpaceCnt(strings.getLeadingWhitespace(model.getLineContent(startLineNumber + 1)), tabSize);
        if (newSpaceCntOfSecondLine !== oldSpaceCntOfSecondLine) {
          const spaceCntOffset = newSpaceCntOfSecondLine - oldSpaceCntOfSecondLine;
          for (let i = startLineNumber + 1; i <= range.endLineNumber; i++) {
            const lineContent = model.getLineContent(i);
            const originalIndent = strings.getLeadingWhitespace(lineContent);
            const originalSpacesCnt = indentUtils.getSpaceCnt(originalIndent, tabSize);
            const newSpacesCnt = originalSpacesCnt + spaceCntOffset;
            const newIndent = indentUtils.generateIndent(newSpacesCnt, tabSize, insertSpaces);
            if (newIndent !== originalIndent) {
              textEdits.push({
                range: new Range(i, 1, i, originalIndent.length + 1),
                text: newIndent
              });
            }
          }
        }
      }
    }
    if (textEdits.length > 0) {
      this.editor.pushUndoStop();
      const cmd = new AutoIndentOnPasteCommand(textEdits, this.editor.getSelection());
      this.editor.executeCommand("autoIndentOnPaste", cmd);
      this.editor.pushUndoStop();
    }
  }
  rangeContainsOnlyWhitespaceCharacters(model, range) {
    const lineContainsOnlyWhitespace = (content) => {
      return content.trim().length === 0;
    };
    let containsOnlyWhitespace = true;
    if (range.startLineNumber === range.endLineNumber) {
      const lineContent = model.getLineContent(range.startLineNumber);
      const linePart = lineContent.substring(range.startColumn - 1, range.endColumn - 1);
      containsOnlyWhitespace = lineContainsOnlyWhitespace(linePart);
    } else {
      for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
        const lineContent = model.getLineContent(i);
        if (i === range.startLineNumber) {
          const linePart = lineContent.substring(range.startColumn - 1);
          containsOnlyWhitespace = lineContainsOnlyWhitespace(linePart);
        } else if (i === range.endLineNumber) {
          const linePart = lineContent.substring(0, range.endColumn - 1);
          containsOnlyWhitespace = lineContainsOnlyWhitespace(linePart);
        } else {
          containsOnlyWhitespace = model.getLineFirstNonWhitespaceColumn(i) === 0;
        }
        if (!containsOnlyWhitespace) {
          break;
        }
      }
    }
    return containsOnlyWhitespace;
  }
  dispose() {
    this.callOnDispose.dispose();
    this.callOnModel.dispose();
  }
};
AutoIndentOnPaste.ID = "editor.contrib.autoIndentOnPaste";
AutoIndentOnPaste = __decorateClass([
  __decorateParam(1, ILanguageConfigurationService)
], AutoIndentOnPaste);
function isStartOrEndInString(model, range) {
  const isPositionInString = (position) => {
    const tokenType = getStandardTokenTypeAtPosition(model, position);
    return tokenType === StandardTokenType.String;
  };
  return isPositionInString(range.getStartPosition()) || isPositionInString(range.getEndPosition());
}
function getIndentationEditOperations(model, builder, tabSize, tabsToSpaces) {
  if (model.getLineCount() === 1 && model.getLineMaxColumn(1) === 1) {
    return;
  }
  let spaces = "";
  for (let i = 0; i < tabSize; i++) {
    spaces += " ";
  }
  const spacesRegExp = new RegExp(spaces, "gi");
  for (let lineNumber = 1, lineCount = model.getLineCount(); lineNumber <= lineCount; lineNumber++) {
    let lastIndentationColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
    if (lastIndentationColumn === 0) {
      lastIndentationColumn = model.getLineMaxColumn(lineNumber);
    }
    if (lastIndentationColumn === 1) {
      continue;
    }
    const originalIndentationRange = new Range(lineNumber, 1, lineNumber, lastIndentationColumn);
    const originalIndentation = model.getValueInRange(originalIndentationRange);
    const newIndentation = tabsToSpaces ? originalIndentation.replace(/\t/ig, spaces) : originalIndentation.replace(spacesRegExp, "	");
    builder.addEditOperation(originalIndentationRange, newIndentation);
  }
}
class IndentationToSpacesCommand {
  constructor(selection, tabSize) {
    this.selection = selection;
    this.tabSize = tabSize;
    this.selectionId = null;
  }
  getEditOperations(model, builder) {
    this.selectionId = builder.trackSelection(this.selection);
    getIndentationEditOperations(model, builder, this.tabSize, true);
  }
  computeCursorState(model, helper) {
    return helper.getTrackedSelection(this.selectionId);
  }
}
class IndentationToTabsCommand {
  constructor(selection, tabSize) {
    this.selection = selection;
    this.tabSize = tabSize;
    this.selectionId = null;
  }
  getEditOperations(model, builder) {
    this.selectionId = builder.trackSelection(this.selection);
    getIndentationEditOperations(model, builder, this.tabSize, false);
  }
  computeCursorState(model, helper) {
    return helper.getTrackedSelection(this.selectionId);
  }
}
registerEditorContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorAction(IndentationToSpacesAction);
registerEditorAction(IndentationToTabsAction);
registerEditorAction(IndentUsingTabs);
registerEditorAction(IndentUsingSpaces);
registerEditorAction(ChangeTabDisplaySize);
registerEditorAction(DetectIndentation);
registerEditorAction(ReindentLinesAction);
registerEditorAction(ReindentSelectedLinesAction);
export {
  AutoIndentOnPaste,
  AutoIndentOnPasteCommand,
  ChangeIndentationSizeAction,
  ChangeTabDisplaySize,
  DetectIndentation,
  IndentUsingSpaces,
  IndentUsingTabs,
  IndentationToSpacesAction,
  IndentationToSpacesCommand,
  IndentationToTabsAction,
  IndentationToTabsCommand,
  ReindentLinesAction,
  ReindentSelectedLinesAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGluZGVudGF0aW9uXFxicm93c2VyXFxpbmRlbnRhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgSUFjdGlvbk9wdGlvbnMsIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTaGlmdENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29tbWFuZHMvc2hpZnRDb21tYW5kLmpzJztcbmltcG9ydCB7IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSwgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmQsIElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSwgSUVkaXRPcGVyYXRpb25CdWlsZGVyLCBJRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBnZXRHb29kSW5kZW50Rm9yTGluZSwgZ2V0SW5kZW50TWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2F1dG9JbmRlbnQuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEluZGVudENvbnN0cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvaW5kZW50UnVsZXMuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lU2VxdWVuY2UsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRTdGFuZGFyZFRva2VuVHlwZUF0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9pbmRlbnRhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBpbmRlbnRVdGlscyBmcm9tICcuLi9jb21tb24vaW5kZW50VXRpbHMuanMnO1xuXG5leHBvcnQgY2xhc3MgSW5kZW50YXRpb25Ub1NwYWNlc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmFjdGlvbi5pbmRlbnRhdGlvblRvU3BhY2VzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogSW5kZW50YXRpb25Ub1NwYWNlc0FjdGlvbi5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdpbmRlbnRhdGlvblRvU3BhY2VzJywgXCJDb252ZXJ0IEluZGVudGF0aW9uIHRvIFNwYWNlc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignaW5kZW50YXRpb25Ub1NwYWNlc0Rlc2NyaXB0aW9uJywgXCJDb252ZXJ0IHRoZSB0YWIgaW5kZW50YXRpb24gdG8gc3BhY2VzLlwiKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxPcHRzID0gbW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kID0gbmV3IEluZGVudGF0aW9uVG9TcGFjZXNDb21tYW5kKHNlbGVjdGlvbiwgbW9kZWxPcHRzLnRhYlNpemUpO1xuXG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5pZCwgW2NvbW1hbmRdKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cblx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdGluc2VydFNwYWNlczogdHJ1ZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmRlbnRhdGlvblRvVGFic0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmFjdGlvbi5pbmRlbnRhdGlvblRvVGFicyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEluZGVudGF0aW9uVG9UYWJzQWN0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2luZGVudGF0aW9uVG9UYWJzJywgXCJDb252ZXJ0IEluZGVudGF0aW9uIHRvIFRhYnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2luZGVudGF0aW9uVG9UYWJzRGVzY3JpcHRpb24nLCBcIkNvbnZlcnQgdGhlIHNwYWNlcyBpbmRlbnRhdGlvbiB0byB0YWJzLlwiKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWxPcHRzID0gbW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb21tYW5kID0gbmV3IEluZGVudGF0aW9uVG9UYWJzQ29tbWFuZChzZWxlY3Rpb24sIG1vZGVsT3B0cy50YWJTaXplKTtcblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIFtjb21tYW5kXSk7XG5cdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXG5cdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYW5nZUluZGVudGF0aW9uU2l6ZUFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBpbnNlcnRTcGFjZXM6IGJvb2xlYW4sIHByaXZhdGUgcmVhZG9ubHkgZGlzcGxheVNpemVPbmx5OiBib29sZWFuLCBvcHRzOiBJQWN0aW9uT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdHMpO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3JlYXRpb25PcHRzID0gbW9kZWxTZXJ2aWNlLmdldENyZWF0aW9uT3B0aW9ucyhtb2RlbC5nZXRMYW5ndWFnZUlkKCksIG1vZGVsLnVyaSwgbW9kZWwuaXNGb3JTaW1wbGVXaWRnZXQpO1xuXHRcdGNvbnN0IG1vZGVsT3B0cyA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBwaWNrcyA9IFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4XS5tYXAobiA9PiAoe1xuXHRcdFx0aWQ6IG4udG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsOiBuLnRvU3RyaW5nKCksXG5cdFx0XHQvLyBhZGQgZGVzY3JpcHRpb24gZm9yIHRhYlNpemUgdmFsdWUgc2V0IGluIHRoZSBjb25maWd1cmF0aW9uXG5cdFx0XHRkZXNjcmlwdGlvbjogKFxuXHRcdFx0XHRuID09PSBjcmVhdGlvbk9wdHMudGFiU2l6ZSAmJiBuID09PSBtb2RlbE9wdHMudGFiU2l6ZVxuXHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdjb25maWd1cmVkVGFiU2l6ZScsIFwiQ29uZmlndXJlZCBUYWIgU2l6ZVwiKVxuXHRcdFx0XHRcdDogbiA9PT0gY3JlYXRpb25PcHRzLnRhYlNpemVcblx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdkZWZhdWx0VGFiU2l6ZScsIFwiRGVmYXVsdCBUYWIgU2l6ZVwiKVxuXHRcdFx0XHRcdFx0OiBuID09PSBtb2RlbE9wdHMudGFiU2l6ZVxuXHRcdFx0XHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgnY3VycmVudFRhYlNpemUnLCBcIkN1cnJlbnQgVGFiIFNpemVcIilcblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWRcblx0XHRcdClcblx0XHR9KSk7XG5cblx0XHQvLyBhdXRvIGZvY3VzIHRoZSB0YWJTaXplIHNldCBmb3IgdGhlIGN1cnJlbnQgZWRpdG9yXG5cdFx0Y29uc3QgYXV0b0ZvY3VzSW5kZXggPSBNYXRoLm1pbihtb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZSAtIDEsIDcpO1xuXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRxdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoeyBrZXk6ICdzZWxlY3RUYWJXaWR0aCcsIGNvbW1lbnQ6IFsnVGFiIGNvcnJlc3BvbmRzIHRvIHRoZSB0YWIga2V5J10gfSwgXCJTZWxlY3QgVGFiIFNpemUgZm9yIEN1cnJlbnQgRmlsZVwiKSwgYWN0aXZlSXRlbTogcGlja3NbYXV0b0ZvY3VzSW5kZXhdIH0pLnRoZW4ocGljayA9PiB7XG5cdFx0XHRcdGlmIChwaWNrKSB7XG5cdFx0XHRcdFx0aWYgKG1vZGVsICYmICFtb2RlbC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBpY2tlZFZhbCA9IHBhcnNlSW50KHBpY2subGFiZWwsIDEwKTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmRpc3BsYXlTaXplT25seSkge1xuXHRcdFx0XHRcdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRcdFx0XHR0YWJTaXplOiBwaWNrZWRWYWxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRtb2RlbC51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRcdFx0XHR0YWJTaXplOiBwaWNrZWRWYWwsXG5cdFx0XHRcdFx0XHRcdFx0aW5kZW50U2l6ZTogcGlja2VkVmFsLFxuXHRcdFx0XHRcdFx0XHRcdGluc2VydFNwYWNlczogdGhpcy5pbnNlcnRTcGFjZXNcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9LCA1MC8qIHF1aWNrIGlucHV0IGlzIHNlbnNpdGl2ZSB0byBiZWluZyBvcGVuZWQgc28gc29vbiBhZnRlciBhbm90aGVyICovKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5kZW50VXNpbmdUYWJzIGV4dGVuZHMgQ2hhbmdlSW5kZW50YXRpb25TaXplQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uaW5kZW50VXNpbmdUYWJzJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihmYWxzZSwgZmFsc2UsIHtcblx0XHRcdGlkOiBJbmRlbnRVc2luZ1RhYnMuSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignaW5kZW50VXNpbmdUYWJzJywgXCJJbmRlbnQgVXNpbmcgVGFic1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2luZGVudFVzaW5nVGFic0Rlc2NyaXB0aW9uJywgXCJVc2UgaW5kZW50YXRpb24gd2l0aCB0YWJzLlwiKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5kZW50VXNpbmdTcGFjZXMgZXh0ZW5kcyBDaGFuZ2VJbmRlbnRhdGlvblNpemVBY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmFjdGlvbi5pbmRlbnRVc2luZ1NwYWNlcyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIodHJ1ZSwgZmFsc2UsIHtcblx0XHRcdGlkOiBJbmRlbnRVc2luZ1NwYWNlcy5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdpbmRlbnRVc2luZ1NwYWNlcycsIFwiSW5kZW50IFVzaW5nIFNwYWNlc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2luZGVudFVzaW5nU3BhY2VzRGVzY3JpcHRpb24nLCBcIlVzZSBpbmRlbnRhdGlvbiB3aXRoIHNwYWNlcy5cIiksXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYW5nZVRhYkRpc3BsYXlTaXplIGV4dGVuZHMgQ2hhbmdlSW5kZW50YXRpb25TaXplQWN0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5hY3Rpb24uY2hhbmdlVGFiRGlzcGxheVNpemUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHRydWUsIHRydWUsIHtcblx0XHRcdGlkOiBDaGFuZ2VUYWJEaXNwbGF5U2l6ZS5JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdjaGFuZ2VUYWJEaXNwbGF5U2l6ZScsIFwiQ2hhbmdlIFRhYiBEaXNwbGF5IFNpemVcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdjaGFuZ2VUYWJEaXNwbGF5U2l6ZURlc2NyaXB0aW9uJywgXCJDaGFuZ2UgdGhlIHNwYWNlIHNpemUgZXF1aXZhbGVudCBvZiB0aGUgdGFiLlwiKSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGV0ZWN0SW5kZW50YXRpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmFjdGlvbi5kZXRlY3RJbmRlbnRhdGlvbic7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IERldGVjdEluZGVudGF0aW9uLklELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2RldGVjdEluZGVudGF0aW9uJywgXCJEZXRlY3QgSW5kZW50YXRpb24gZnJvbSBDb250ZW50XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignZGV0ZWN0SW5kZW50YXRpb25EZXNjcmlwdGlvbicsIFwiRGV0ZWN0IHRoZSBpbmRlbnRhdGlvbiBmcm9tIGNvbnRlbnQuXCIpLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTW9kZWxTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNyZWF0aW9uT3B0cyA9IG1vZGVsU2VydmljZS5nZXRDcmVhdGlvbk9wdGlvbnMobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBtb2RlbC51cmksIG1vZGVsLmlzRm9yU2ltcGxlV2lkZ2V0KTtcblx0XHRtb2RlbC5kZXRlY3RJbmRlbnRhdGlvbihjcmVhdGlvbk9wdHMuaW5zZXJ0U3BhY2VzLCBjcmVhdGlvbk9wdHMudGFiU2l6ZSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlaW5kZW50TGluZXNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ucmVpbmRlbnRsaW5lcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignZWRpdG9yLnJlaW5kZW50bGluZXMnLCBcIlJlaW5kZW50IExpbmVzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdlZGl0b3IucmVpbmRlbnRsaW5lc0Rlc2NyaXB0aW9uJywgXCJSZWluZGVudCB0aGUgbGluZXMgb2YgdGhlIGVkaXRvci5cIiksXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVkaXRzID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGlmIChlZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKHRoaXMuaWQsIGVkaXRzKTtcblx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlaW5kZW50U2VsZWN0ZWRMaW5lc0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5yZWluZGVudHNlbGVjdGVkbGluZXMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ2VkaXRvci5yZWluZGVudHNlbGVjdGVkbGluZXMnLCBcIlJlaW5kZW50IFNlbGVjdGVkIExpbmVzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdlZGl0b3IucmVpbmRlbnRzZWxlY3RlZGxpbmVzRGVzY3JpcHRpb24nLCBcIlJlaW5kZW50IHRoZSBzZWxlY3RlZCBsaW5lcyBvZiB0aGUgZWRpdG9yLlwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoc2VsZWN0aW9ucyA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHNlbGVjdGlvbiBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGxldCBlbmRMaW5lTnVtYmVyID0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgIT09IGVuZExpbmVOdW1iZXIgJiYgc2VsZWN0aW9uLmVuZENvbHVtbiA9PT0gMSkge1xuXHRcdFx0XHRlbmRMaW5lTnVtYmVyLS07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgPT09IDEpIHtcblx0XHRcdFx0aWYgKHN0YXJ0TGluZU51bWJlciA9PT0gZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXItLTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdE9wZXJhdGlvbnMgPSBnZXRSZWluZGVudEVkaXRPcGVyYXRpb25zKG1vZGVsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIpO1xuXHRcdFx0ZWRpdHMucHVzaCguLi5lZGl0T3BlcmF0aW9ucyk7XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRcdGVkaXRvci5leGVjdXRlRWRpdHModGhpcy5pZCwgZWRpdHMpO1xuXHRcdFx0ZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXV0b0luZGVudE9uUGFzdGVDb21tYW5kIGltcGxlbWVudHMgSUNvbW1hbmQge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRzOiB7IHJhbmdlOiBJUmFuZ2U7IHRleHQ6IHN0cmluZzsgZW9sPzogRW5kT2ZMaW5lU2VxdWVuY2UgfVtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxTZWxlY3Rpb246IFNlbGVjdGlvbjtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uSWQ6IHN0cmluZyB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IoZWRpdHM6IFRleHRFZGl0W10sIGluaXRpYWxTZWxlY3Rpb246IFNlbGVjdGlvbikge1xuXHRcdHRoaXMuX2luaXRpYWxTZWxlY3Rpb24gPSBpbml0aWFsU2VsZWN0aW9uO1xuXHRcdHRoaXMuX2VkaXRzID0gW107XG5cdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBudWxsO1xuXG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIGVkaXRzKSB7XG5cdFx0XHRpZiAoZWRpdC5yYW5nZSAmJiB0eXBlb2YgZWRpdC50ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aGlzLl9lZGl0cy5wdXNoKGVkaXQgYXMgeyByYW5nZTogSVJhbmdlOyB0ZXh0OiBzdHJpbmc7IGVvbD86IEVuZE9mTGluZVNlcXVlbmNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMuX2VkaXRzKSB7XG5cdFx0XHRidWlsZGVyLmFkZEVkaXRPcGVyYXRpb24oUmFuZ2UubGlmdChlZGl0LnJhbmdlKSwgZWRpdC50ZXh0KTtcblx0XHR9XG5cblx0XHRsZXQgc2VsZWN0aW9uSXNTZXQgPSBmYWxzZTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh0aGlzLl9lZGl0cykgJiYgdGhpcy5fZWRpdHMubGVuZ3RoID09PSAxICYmIHRoaXMuX2luaXRpYWxTZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRpZiAodGhpcy5fZWRpdHNbMF0ucmFuZ2Uuc3RhcnRDb2x1bW4gPT09IHRoaXMuX2luaXRpYWxTZWxlY3Rpb24uZW5kQ29sdW1uICYmXG5cdFx0XHRcdHRoaXMuX2VkaXRzWzBdLnJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gdGhpcy5faW5pdGlhbFNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHNlbGVjdGlvbklzU2V0ID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHRoaXMuX2luaXRpYWxTZWxlY3Rpb24sIHRydWUpO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9lZGl0c1swXS5yYW5nZS5lbmRDb2x1bW4gPT09IHRoaXMuX2luaXRpYWxTZWxlY3Rpb24uc3RhcnRDb2x1bW4gJiZcblx0XHRcdFx0dGhpcy5fZWRpdHNbMF0ucmFuZ2UuZW5kTGluZU51bWJlciA9PT0gdGhpcy5faW5pdGlhbFNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0c2VsZWN0aW9uSXNTZXQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24odGhpcy5faW5pdGlhbFNlbGVjdGlvbiwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghc2VsZWN0aW9uSXNTZXQpIHtcblx0XHRcdHRoaXMuX3NlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbih0aGlzLl9pbml0aWFsU2VsZWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0cmV0dXJuIGhlbHBlci5nZXRUcmFja2VkU2VsZWN0aW9uKHRoaXMuX3NlbGVjdGlvbklkISk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9JbmRlbnRPblBhc3RlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIuYXV0b0luZGVudE9uUGFzdGUnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FsbE9uRGlzcG9zZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBjYWxsT25Nb2RlbCA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXG5cdFx0dGhpcy5jYWxsT25EaXNwb3NlLmFkZChlZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLmNhbGxPbkRpc3Bvc2UuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLmNhbGxPbkRpc3Bvc2UuYWRkKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBjbGVhbiB1cFxuXHRcdHRoaXMuY2FsbE9uTW9kZWwuY2xlYXIoKTtcblxuXHRcdC8vIHdlIGFyZSBkaXNhYmxlZFxuXHRcdGlmICghdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hdXRvSW5kZW50T25QYXN0ZSkgfHwgdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hdXRvSW5kZW50KSA8IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gbm8gbW9kZWxcblx0XHRpZiAoIXRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNhbGxPbk1vZGVsLmFkZCh0aGlzLmVkaXRvci5vbkRpZFBhc3RlKCh7IHJhbmdlIH0pID0+IHtcblx0XHRcdHRoaXMudHJpZ2dlcihyYW5nZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIHRyaWdnZXIocmFuZ2U6IFJhbmdlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoc2VsZWN0aW9ucyA9PT0gbnVsbCB8fCBzZWxlY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250YWluc09ubHlXaGl0ZXNwYWNlID0gdGhpcy5yYW5nZUNvbnRhaW5zT25seVdoaXRlc3BhY2VDaGFyYWN0ZXJzKG1vZGVsLCByYW5nZSk7XG5cdFx0aWYgKGNvbnRhaW5zT25seVdoaXRlc3BhY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmF1dG9JbmRlbnRPblBhc3RlV2l0aGluU3RyaW5nKSAmJiBpc1N0YXJ0T3JFbmRJblN0cmluZyhtb2RlbCwgcmFuZ2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghbW9kZWwudG9rZW5pemF0aW9uLmlzQ2hlYXBUb1Rva2VuaXplKHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKS5saW5lTnVtYmVyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhdXRvSW5kZW50ID0gdGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hdXRvSW5kZW50KTtcblx0XHRjb25zdCB7IHRhYlNpemUsIGluZGVudFNpemUsIGluc2VydFNwYWNlcyB9ID0gbW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdGNvbnN0IHRleHRFZGl0czogVGV4dEVkaXRbXSA9IFtdO1xuXG5cdFx0Y29uc3QgaW5kZW50Q29udmVydGVyID0ge1xuXHRcdFx0c2hpZnRJbmRlbnQ6IChpbmRlbnRhdGlvbjogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHJldHVybiBTaGlmdENvbW1hbmQuc2hpZnRJbmRlbnQoaW5kZW50YXRpb24sIGluZGVudGF0aW9uLmxlbmd0aCArIDEsIHRhYlNpemUsIGluZGVudFNpemUsIGluc2VydFNwYWNlcyk7XG5cdFx0XHR9LFxuXHRcdFx0dW5zaGlmdEluZGVudDogKGluZGVudGF0aW9uOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0cmV0dXJuIFNoaWZ0Q29tbWFuZC51bnNoaWZ0SW5kZW50KGluZGVudGF0aW9uLCBpbmRlbnRhdGlvbi5sZW5ndGggKyAxLCB0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXG5cdFx0bGV0IGZpcnN0TGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIpO1xuXHRcdGlmICghL1xcUy8udGVzdChmaXJzdExpbmVUZXh0LnN1YnN0cmluZygwLCByYW5nZS5zdGFydENvbHVtbiAtIDEpKSkge1xuXHRcdFx0Y29uc3QgaW5kZW50T2ZGaXJzdExpbmUgPSBnZXRHb29kSW5kZW50Rm9yTGluZShhdXRvSW5kZW50LCBtb2RlbCwgbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCBzdGFydExpbmVOdW1iZXIsIGluZGVudENvbnZlcnRlciwgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRcdGlmIChpbmRlbnRPZkZpcnN0TGluZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRjb25zdCBvbGRJbmRlbnRhdGlvbiA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UoZmlyc3RMaW5lVGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1NwYWNlQ250ID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQoaW5kZW50T2ZGaXJzdExpbmUsIHRhYlNpemUpO1xuXHRcdFx0XHRjb25zdCBvbGRTcGFjZUNudCA9IGluZGVudFV0aWxzLmdldFNwYWNlQ250KG9sZEluZGVudGF0aW9uLCB0YWJTaXplKTtcblxuXHRcdFx0XHRpZiAobmV3U3BhY2VDbnQgIT09IG9sZFNwYWNlQ250KSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV3SW5kZW50ID0gaW5kZW50VXRpbHMuZ2VuZXJhdGVJbmRlbnQobmV3U3BhY2VDbnQsIHRhYlNpemUsIGluc2VydFNwYWNlcyk7XG5cdFx0XHRcdFx0dGV4dEVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIDEsIHN0YXJ0TGluZU51bWJlciwgb2xkSW5kZW50YXRpb24ubGVuZ3RoICsgMSksXG5cdFx0XHRcdFx0XHR0ZXh0OiBuZXdJbmRlbnRcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRmaXJzdExpbmVUZXh0ID0gbmV3SW5kZW50ICsgZmlyc3RMaW5lVGV4dC5zdWJzdHJpbmcob2xkSW5kZW50YXRpb24ubGVuZ3RoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBpbmRlbnRNZXRhZGF0YSA9IGdldEluZGVudE1ldGFkYXRhKG1vZGVsLCBzdGFydExpbmVOdW1iZXIsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRcdFx0aWYgKGluZGVudE1ldGFkYXRhID09PSAwIHx8IGluZGVudE1ldGFkYXRhID09PSBJbmRlbnRDb25zdHMuVU5JTkRFTlRfTUFTSykge1xuXHRcdFx0XHRcdFx0Ly8gd2UgcGFzdGUgY29udGVudCBpbnRvIGEgbGluZSB3aGVyZSBvbmx5IGNvbnRhaW5zIHdoaXRlc3BhY2VzXG5cdFx0XHRcdFx0XHQvLyBhZnRlciBwYXN0aW5nLCB0aGUgaW5kZW50YXRpb24gb2YgdGhlIGZpcnN0IGxpbmUgaXMgYWxyZWFkeSBjb3JyZWN0XG5cdFx0XHRcdFx0XHQvLyB0aGUgZmlyc3QgbGluZSBkb2Vzbid0IG1hdGNoIGFueSBpbmRlbnRhdGlvbiBydWxlXG5cdFx0XHRcdFx0XHQvLyB0aGVuIG5vLW9wLlxuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZpcnN0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblxuXHRcdC8vIGlnbm9yZSBlbXB0eSBvciBpZ25vcmVkIGxpbmVzXG5cdFx0d2hpbGUgKHN0YXJ0TGluZU51bWJlciA8IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGlmICghL1xcUy8udGVzdChtb2RlbC5nZXRMaW5lQ29udGVudChzdGFydExpbmVOdW1iZXIgKyAxKSkpIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyKys7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciAhPT0gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0Y29uc3QgdmlydHVhbE1vZGVsID0ge1xuXHRcdFx0XHR0b2tlbml6YXRpb246IHtcblx0XHRcdFx0XHRnZXRMaW5lVG9rZW5zOiAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRMYW5ndWFnZUlkOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb246IChsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRMaW5lQ29udGVudDogKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBmaXJzdExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmaXJzdExpbmVUZXh0O1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaW5kZW50T2ZTZWNvbmRMaW5lID0gZ2V0R29vZEluZGVudEZvckxpbmUoYXV0b0luZGVudCwgdmlydHVhbE1vZGVsLCBtb2RlbC5nZXRMYW5ndWFnZUlkKCksIHN0YXJ0TGluZU51bWJlciArIDEsIGluZGVudENvbnZlcnRlciwgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRpZiAoaW5kZW50T2ZTZWNvbmRMaW5lICE9PSBudWxsKSB7XG5cdFx0XHRcdGNvbnN0IG5ld1NwYWNlQ250T2ZTZWNvbmRMaW5lID0gaW5kZW50VXRpbHMuZ2V0U3BhY2VDbnQoaW5kZW50T2ZTZWNvbmRMaW5lLCB0YWJTaXplKTtcblx0XHRcdFx0Y29uc3Qgb2xkU3BhY2VDbnRPZlNlY29uZExpbmUgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KHN0YXJ0TGluZU51bWJlciArIDEpKSwgdGFiU2l6ZSk7XG5cblx0XHRcdFx0aWYgKG5ld1NwYWNlQ250T2ZTZWNvbmRMaW5lICE9PSBvbGRTcGFjZUNudE9mU2Vjb25kTGluZSkge1xuXHRcdFx0XHRcdGNvbnN0IHNwYWNlQ250T2Zmc2V0ID0gbmV3U3BhY2VDbnRPZlNlY29uZExpbmUgLSBvbGRTcGFjZUNudE9mU2Vjb25kTGluZTtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gc3RhcnRMaW5lTnVtYmVyICsgMTsgaSA8PSByYW5nZS5lbmRMaW5lTnVtYmVyOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoaSk7XG5cdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbEluZGVudCA9IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobGluZUNvbnRlbnQpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxTcGFjZXNDbnQgPSBpbmRlbnRVdGlscy5nZXRTcGFjZUNudChvcmlnaW5hbEluZGVudCwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdTcGFjZXNDbnQgPSBvcmlnaW5hbFNwYWNlc0NudCArIHNwYWNlQ250T2Zmc2V0O1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV3SW5kZW50ID0gaW5kZW50VXRpbHMuZ2VuZXJhdGVJbmRlbnQobmV3U3BhY2VzQ250LCB0YWJTaXplLCBpbnNlcnRTcGFjZXMpO1xuXG5cdFx0XHRcdFx0XHRpZiAobmV3SW5kZW50ICE9PSBvcmlnaW5hbEluZGVudCkge1xuXHRcdFx0XHRcdFx0XHR0ZXh0RWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShpLCAxLCBpLCBvcmlnaW5hbEluZGVudC5sZW5ndGggKyAxKSxcblx0XHRcdFx0XHRcdFx0XHR0ZXh0OiBuZXdJbmRlbnRcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRleHRFZGl0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRcdGNvbnN0IGNtZCA9IG5ldyBBdXRvSW5kZW50T25QYXN0ZUNvbW1hbmQodGV4dEVkaXRzLCB0aGlzLmVkaXRvci5nZXRTZWxlY3Rpb24oKSEpO1xuXHRcdFx0dGhpcy5lZGl0b3IuZXhlY3V0ZUNvbW1hbmQoJ2F1dG9JbmRlbnRPblBhc3RlJywgY21kKTtcblx0XHRcdHRoaXMuZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmFuZ2VDb250YWluc09ubHlXaGl0ZXNwYWNlQ2hhcmFjdGVycyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbGluZUNvbnRhaW5zT25seVdoaXRlc3BhY2UgPSAoY29udGVudDogc3RyaW5nKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRyZXR1cm4gY29udGVudC50cmltKCkubGVuZ3RoID09PSAwO1xuXHRcdH07XG5cdFx0bGV0IGNvbnRhaW5zT25seVdoaXRlc3BhY2U6IGJvb2xlYW4gPSB0cnVlO1xuXHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxpbmVQYXJ0ID0gbGluZUNvbnRlbnQuc3Vic3RyaW5nKHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSwgcmFuZ2UuZW5kQ29sdW1uIC0gMSk7XG5cdFx0XHRjb250YWluc09ubHlXaGl0ZXNwYWNlID0gbGluZUNvbnRhaW5zT25seVdoaXRlc3BhY2UobGluZVBhcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGxldCBpID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyOyBpIDw9IHJhbmdlLmVuZExpbmVOdW1iZXI7IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGkpO1xuXHRcdFx0XHRpZiAoaSA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZVBhcnQgPSBsaW5lQ29udGVudC5zdWJzdHJpbmcocmFuZ2Uuc3RhcnRDb2x1bW4gLSAxKTtcblx0XHRcdFx0XHRjb250YWluc09ubHlXaGl0ZXNwYWNlID0gbGluZUNvbnRhaW5zT25seVdoaXRlc3BhY2UobGluZVBhcnQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGkgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRjb25zdCBsaW5lUGFydCA9IGxpbmVDb250ZW50LnN1YnN0cmluZygwLCByYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdFx0XHRjb250YWluc09ubHlXaGl0ZXNwYWNlID0gbGluZUNvbnRhaW5zT25seVdoaXRlc3BhY2UobGluZVBhcnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnRhaW5zT25seVdoaXRlc3BhY2UgPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGkpID09PSAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghY29udGFpbnNPbmx5V2hpdGVzcGFjZSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjb250YWluc09ubHlXaGl0ZXNwYWNlO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jYWxsT25EaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmNhbGxPbk1vZGVsLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1N0YXJ0T3JFbmRJblN0cmluZyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlKTogYm9vbGVhbiB7XG5cdGNvbnN0IGlzUG9zaXRpb25JblN0cmluZyA9IChwb3NpdGlvbjogUG9zaXRpb24pOiBib29sZWFuID0+IHtcblx0XHRjb25zdCB0b2tlblR5cGUgPSBnZXRTdGFuZGFyZFRva2VuVHlwZUF0UG9zaXRpb24obW9kZWwsIHBvc2l0aW9uKTtcblx0XHRyZXR1cm4gdG9rZW5UeXBlID09PSBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmc7XG5cdH07XG5cdHJldHVybiBpc1Bvc2l0aW9uSW5TdHJpbmcocmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKSB8fCBpc1Bvc2l0aW9uSW5TdHJpbmcocmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSk7XG59XG5cbmZ1bmN0aW9uIGdldEluZGVudGF0aW9uRWRpdE9wZXJhdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIGJ1aWxkZXI6IElFZGl0T3BlcmF0aW9uQnVpbGRlciwgdGFiU2l6ZTogbnVtYmVyLCB0YWJzVG9TcGFjZXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0aWYgKG1vZGVsLmdldExpbmVDb3VudCgpID09PSAxICYmIG1vZGVsLmdldExpbmVNYXhDb2x1bW4oMSkgPT09IDEpIHtcblx0XHQvLyBNb2RlbCBpcyBlbXB0eVxuXHRcdHJldHVybjtcblx0fVxuXG5cdGxldCBzcGFjZXMgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0YWJTaXplOyBpKyspIHtcblx0XHRzcGFjZXMgKz0gJyAnO1xuXHR9XG5cblx0Y29uc3Qgc3BhY2VzUmVnRXhwID0gbmV3IFJlZ0V4cChzcGFjZXMsICdnaScpO1xuXG5cdGZvciAobGV0IGxpbmVOdW1iZXIgPSAxLCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTsgbGluZU51bWJlciA8PSBsaW5lQ291bnQ7IGxpbmVOdW1iZXIrKykge1xuXHRcdGxldCBsYXN0SW5kZW50YXRpb25Db2x1bW4gPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdGlmIChsYXN0SW5kZW50YXRpb25Db2x1bW4gPT09IDApIHtcblx0XHRcdGxhc3RJbmRlbnRhdGlvbkNvbHVtbiA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0fVxuXG5cdFx0aWYgKGxhc3RJbmRlbnRhdGlvbkNvbHVtbiA9PT0gMSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3JpZ2luYWxJbmRlbnRhdGlvblJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIDEsIGxpbmVOdW1iZXIsIGxhc3RJbmRlbnRhdGlvbkNvbHVtbik7XG5cdFx0Y29uc3Qgb3JpZ2luYWxJbmRlbnRhdGlvbiA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShvcmlnaW5hbEluZGVudGF0aW9uUmFuZ2UpO1xuXHRcdGNvbnN0IG5ld0luZGVudGF0aW9uID0gKFxuXHRcdFx0dGFic1RvU3BhY2VzXG5cdFx0XHRcdD8gb3JpZ2luYWxJbmRlbnRhdGlvbi5yZXBsYWNlKC9cXHQvaWcsIHNwYWNlcylcblx0XHRcdFx0OiBvcmlnaW5hbEluZGVudGF0aW9uLnJlcGxhY2Uoc3BhY2VzUmVnRXhwLCAnXFx0Jylcblx0XHQpO1xuXG5cdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG9yaWdpbmFsSW5kZW50YXRpb25SYW5nZSwgbmV3SW5kZW50YXRpb24pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmRlbnRhdGlvblRvU3BhY2VzQ29tbWFuZCBpbXBsZW1lbnRzIElDb21tYW5kIHtcblxuXHRwcml2YXRlIHNlbGVjdGlvbklkOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHNlbGVjdGlvbjogU2VsZWN0aW9uLCBwcml2YXRlIHRhYlNpemU6IG51bWJlcikgeyB9XG5cblx0cHVibGljIGdldEVkaXRPcGVyYXRpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCBidWlsZGVyOiBJRWRpdE9wZXJhdGlvbkJ1aWxkZXIpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdGlvbklkID0gYnVpbGRlci50cmFja1NlbGVjdGlvbih0aGlzLnNlbGVjdGlvbik7XG5cdFx0Z2V0SW5kZW50YXRpb25FZGl0T3BlcmF0aW9ucyhtb2RlbCwgYnVpbGRlciwgdGhpcy50YWJTaXplLCB0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlQ3Vyc29yU3RhdGUobW9kZWw6IElUZXh0TW9kZWwsIGhlbHBlcjogSUN1cnNvclN0YXRlQ29tcHV0ZXJEYXRhKTogU2VsZWN0aW9uIHtcblx0XHRyZXR1cm4gaGVscGVyLmdldFRyYWNrZWRTZWxlY3Rpb24odGhpcy5zZWxlY3Rpb25JZCEpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbmRlbnRhdGlvblRvVGFic0NvbW1hbmQgaW1wbGVtZW50cyBJQ29tbWFuZCB7XG5cblx0cHJpdmF0ZSBzZWxlY3Rpb25JZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBzZWxlY3Rpb246IFNlbGVjdGlvbiwgcHJpdmF0ZSB0YWJTaXplOiBudW1iZXIpIHsgfVxuXG5cdHB1YmxpYyBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3Rpb25JZCA9IGJ1aWxkZXIudHJhY2tTZWxlY3Rpb24odGhpcy5zZWxlY3Rpb24pO1xuXHRcdGdldEluZGVudGF0aW9uRWRpdE9wZXJhdGlvbnMobW9kZWwsIGJ1aWxkZXIsIHRoaXMudGFiU2l6ZSwgZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGVDdXJzb3JTdGF0ZShtb2RlbDogSVRleHRNb2RlbCwgaGVscGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlckRhdGEpOiBTZWxlY3Rpb24ge1xuXHRcdHJldHVybiBoZWxwZXIuZ2V0VHJhY2tlZFNlbGVjdGlvbih0aGlzLnNlbGVjdGlvbklkISk7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oQXV0b0luZGVudE9uUGFzdGUuSUQsIEF1dG9JbmRlbnRPblBhc3RlLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkJlZm9yZUZpcnN0SW50ZXJhY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5kZW50YXRpb25Ub1NwYWNlc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbmRlbnRhdGlvblRvVGFic0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihJbmRlbnRVc2luZ1RhYnMpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oSW5kZW50VXNpbmdTcGFjZXMpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oQ2hhbmdlVGFiRGlzcGxheVNpemUpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oRGV0ZWN0SW5kZW50YXRpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUmVpbmRlbnRMaW5lc0FjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihSZWluZGVudFNlbGVjdGVkTGluZXNBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxZQUFZLGFBQWE7QUFDekIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsY0FBYyxpQ0FBaUQsc0JBQXNCLGtDQUFvRDtBQUNsSixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUEwQixvQkFBb0I7QUFHdkQsU0FBaUIsYUFBYTtBQUc5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHNCQUFzQix5QkFBeUI7QUFDeEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxpQ0FBaUM7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
