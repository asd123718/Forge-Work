import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as nls from "../../../../nls.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IsWindowsContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { EditorAction, EditorCommand, registerEditorAction, registerEditorCommand } from "../../../browser/editorExtensions.js";
import { ReplaceCommand } from "../../../common/commands/replaceCommand.js";
import { EditorOption, EditorOptions } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { getMapForWordSeparators } from "../../../common/core/wordCharacterClassifier.js";
import { WordNavigationType, WordOperations } from "../../../common/cursor/cursorWordOperations.js";
import { CursorState } from "../../../common/cursorCommon.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
class MoveWordCommand extends EditorCommand {
  constructor(opts) {
    super(opts);
    this._inSelectionMode = opts.inSelectionMode;
    this._wordNavigationType = opts.wordNavigationType;
  }
  runEditorCommand(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
    const model = editor.getModel();
    const selections = editor.getSelections();
    const hasMulticursor = selections.length > 1;
    const result = selections.map((sel) => {
      const inPosition = new Position(sel.positionLineNumber, sel.positionColumn);
      const outPosition = this._move(wordSeparators, model, inPosition, this._wordNavigationType, hasMulticursor);
      return this._moveTo(sel, outPosition, this._inSelectionMode);
    });
    model.pushStackElement();
    editor._getViewModel().setCursorStates("moveWordCommand", CursorChangeReason.Explicit, result.map((r) => CursorState.fromModelSelection(r)));
    if (result.length === 1) {
      const pos = new Position(result[0].positionLineNumber, result[0].positionColumn);
      editor.revealPosition(pos, ScrollType.Smooth);
    }
  }
  _moveTo(from, to, inSelectionMode) {
    if (inSelectionMode) {
      return new Selection(
        from.selectionStartLineNumber,
        from.selectionStartColumn,
        to.lineNumber,
        to.column
      );
    } else {
      return new Selection(
        to.lineNumber,
        to.column,
        to.lineNumber,
        to.column
      );
    }
  }
}
class WordLeftCommand extends MoveWordCommand {
  _move(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
    return WordOperations.moveWordLeft(wordSeparators, model, position, wordNavigationType, hasMulticursor);
  }
}
class WordRightCommand extends MoveWordCommand {
  _move(wordSeparators, model, position, wordNavigationType, hasMulticursor) {
    return WordOperations.moveWordRight(wordSeparators, model, position, wordNavigationType);
  }
}
class CursorWordStartLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartLeft",
      precondition: void 0
    });
  }
}
class CursorWordEndLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndLeft",
      precondition: void 0
    });
  }
}
class CursorWordLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordStartFast,
      id: "cursorWordLeft",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
        mac: { primary: KeyMod.Alt | KeyCode.LeftArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordStartLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartLeftSelect",
      precondition: void 0
    });
  }
}
class CursorWordEndLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndLeftSelect",
      precondition: void 0
    });
  }
}
class CursorWordLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordStartFast,
      id: "cursorWordLeftSelect",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow,
        mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.LeftArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordAccessibilityLeft extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityLeft",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class CursorWordAccessibilityLeftSelect extends WordLeftCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityLeftSelect",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class CursorWordStartRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartRight",
      precondition: void 0
    });
  }
}
class CursorWordEndRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndRight",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
        mac: { primary: KeyMod.Alt | KeyCode.RightArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordRight",
      precondition: void 0
    });
  }
}
class CursorWordStartRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordStart,
      id: "cursorWordStartRightSelect",
      precondition: void 0
    });
  }
}
class CursorWordEndRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordEndRightSelect",
      precondition: void 0,
      kbOpts: {
        kbExpr: ContextKeyExpr.and(EditorContextKeys.textInputFocus, ContextKeyExpr.and(CONTEXT_ACCESSIBILITY_MODE_ENABLED, IsWindowsContext)?.negate()),
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow,
        mac: { primary: KeyMod.Alt | KeyMod.Shift | KeyCode.RightArrow },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class CursorWordRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "cursorWordRightSelect",
      precondition: void 0
    });
  }
}
class CursorWordAccessibilityRight extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: false,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityRight",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class CursorWordAccessibilityRightSelect extends WordRightCommand {
  constructor() {
    super({
      inSelectionMode: true,
      wordNavigationType: WordNavigationType.WordAccessibility,
      id: "cursorWordAccessibilityRightSelect",
      precondition: void 0
    });
  }
  _move(wordCharacterClassifier, model, position, wordNavigationType, hasMulticursor) {
    return super._move(getMapForWordSeparators(EditorOptions.wordSeparators.defaultValue, wordCharacterClassifier.intlSegmenterLocales), model, position, wordNavigationType, hasMulticursor);
  }
}
class DeleteWordCommand extends EditorCommand {
  constructor(opts) {
    super({ canTriggerInlineEdits: true, ...opts });
    this._whitespaceHeuristics = opts.whitespaceHeuristics;
    this._wordNavigationType = opts.wordNavigationType;
  }
  runEditorCommand(accessor, editor, args) {
    const languageConfigurationService = accessor?.get(ILanguageConfigurationService);
    if (!editor.hasModel() || !languageConfigurationService) {
      return;
    }
    const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
    const model = editor.getModel();
    const selections = editor.getSelections();
    const autoClosingBrackets = editor.getOption(EditorOption.autoClosingBrackets);
    const autoClosingQuotes = editor.getOption(EditorOption.autoClosingQuotes);
    const autoClosingPairs = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getAutoClosingPairs();
    const viewModel = editor._getViewModel();
    const commands = selections.map((sel) => {
      const deleteRange = this._delete({
        wordSeparators,
        model,
        selection: sel,
        whitespaceHeuristics: this._whitespaceHeuristics,
        autoClosingDelete: editor.getOption(EditorOption.autoClosingDelete),
        autoClosingBrackets,
        autoClosingQuotes,
        autoClosingPairs,
        autoClosedCharacters: viewModel.getCursorAutoClosedCharacters()
      }, this._wordNavigationType);
      return new ReplaceCommand(deleteRange, "");
    });
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
class DeleteWordLeftCommand extends DeleteWordCommand {
  _delete(ctx, wordNavigationType) {
    const r = WordOperations.deleteWordLeft(ctx, wordNavigationType);
    if (r) {
      return r;
    }
    return new Range(1, 1, 1, 1);
  }
}
class DeleteWordRightCommand extends DeleteWordCommand {
  _delete(ctx, wordNavigationType) {
    const r = WordOperations.deleteWordRight(ctx, wordNavigationType);
    if (r) {
      return r;
    }
    const lineCount = ctx.model.getLineCount();
    const maxColumn = ctx.model.getLineMaxColumn(lineCount);
    return new Range(lineCount, maxColumn, lineCount, maxColumn);
  }
}
class DeleteWordStartLeft extends DeleteWordLeftCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "deleteWordStartLeft",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordEndLeft extends DeleteWordLeftCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "deleteWordEndLeft",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordLeft extends DeleteWordLeftCommand {
  constructor() {
    super({
      whitespaceHeuristics: true,
      wordNavigationType: WordNavigationType.WordStart,
      id: "deleteWordLeft",
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Backspace,
        mac: { primary: KeyMod.Alt | KeyCode.Backspace },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class DeleteWordStartRight extends DeleteWordRightCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordStart,
      id: "deleteWordStartRight",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordEndRight extends DeleteWordRightCommand {
  constructor() {
    super({
      whitespaceHeuristics: false,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "deleteWordEndRight",
      precondition: EditorContextKeys.writable
    });
  }
}
class DeleteWordRight extends DeleteWordRightCommand {
  constructor() {
    super({
      whitespaceHeuristics: true,
      wordNavigationType: WordNavigationType.WordEnd,
      id: "deleteWordRight",
      precondition: EditorContextKeys.writable,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyMod.CtrlCmd | KeyCode.Delete,
        mac: { primary: KeyMod.Alt | KeyCode.Delete },
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
}
class DeleteInsideWord extends EditorAction {
  constructor() {
    super({
      id: "deleteInsideWord",
      precondition: EditorContextKeys.writable,
      label: nls.localize2("deleteInsideWord", "Delete Word"),
      metadata: {
        description: nls.localize2("deleteInsideWord.description", "Delete the word at the cursor"),
        args: [{
          name: "args",
          schema: {
            type: "object",
            properties: {
              "onlyWord": {
                type: "boolean",
                default: false,
                description: nls.localize("deleteInsideWord.args.onlyWord", "Delete only the word and leave surrounding whitespace")
              }
            }
          }
        }]
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const onlyWord = !!(args && typeof args === "object" && args.onlyWord);
    const wordSeparators = getMapForWordSeparators(editor.getOption(EditorOption.wordSeparators), editor.getOption(EditorOption.wordSegmenterLocales));
    const model = editor.getModel();
    const selections = editor.getSelections();
    const commands = selections.map((sel) => {
      const deleteRange = WordOperations.deleteInsideWord(wordSeparators, model, sel, onlyWord);
      return new ReplaceCommand(deleteRange, "");
    });
    editor.pushUndoStop();
    editor.executeCommands(this.id, commands);
    editor.pushUndoStop();
  }
}
registerEditorCommand(new CursorWordStartLeft());
registerEditorCommand(new CursorWordEndLeft());
registerEditorCommand(new CursorWordLeft());
registerEditorCommand(new CursorWordStartLeftSelect());
registerEditorCommand(new CursorWordEndLeftSelect());
registerEditorCommand(new CursorWordLeftSelect());
registerEditorCommand(new CursorWordStartRight());
registerEditorCommand(new CursorWordEndRight());
registerEditorCommand(new CursorWordRight());
registerEditorCommand(new CursorWordStartRightSelect());
registerEditorCommand(new CursorWordEndRightSelect());
registerEditorCommand(new CursorWordRightSelect());
registerEditorCommand(new CursorWordAccessibilityLeft());
registerEditorCommand(new CursorWordAccessibilityLeftSelect());
registerEditorCommand(new CursorWordAccessibilityRight());
registerEditorCommand(new CursorWordAccessibilityRightSelect());
registerEditorCommand(new DeleteWordStartLeft());
registerEditorCommand(new DeleteWordEndLeft());
registerEditorCommand(new DeleteWordLeft());
registerEditorCommand(new DeleteWordStartRight());
registerEditorCommand(new DeleteWordEndRight());
registerEditorCommand(new DeleteWordRight());
registerEditorAction(DeleteInsideWord);
export {
  CursorWordAccessibilityLeft,
  CursorWordAccessibilityLeftSelect,
  CursorWordAccessibilityRight,
  CursorWordAccessibilityRightSelect,
  CursorWordEndLeft,
  CursorWordEndLeftSelect,
  CursorWordEndRight,
  CursorWordEndRightSelect,
  CursorWordLeft,
  CursorWordLeftSelect,
  CursorWordRight,
  CursorWordRightSelect,
  CursorWordStartLeft,
  CursorWordStartLeftSelect,
  CursorWordStartRight,
  CursorWordStartRightSelect,
  DeleteInsideWord,
  DeleteWordCommand,
  DeleteWordEndLeft,
  DeleteWordEndRight,
  DeleteWordLeft,
  DeleteWordLeftCommand,
  DeleteWordRight,
  DeleteWordRightCommand,
  DeleteWordStartLeft,
  DeleteWordStartRight,
  MoveWordCommand,
  WordLeftCommand,
  WordRightCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHdvcmRPcGVyYXRpb25zXFxicm93c2VyXFx3b3JkT3BlcmF0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElzV2luZG93c0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbW1hbmQsIElDb21tYW5kT3B0aW9ucywgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29tbWFuZCwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBSZXBsYWNlQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb21tYW5kcy9yZXBsYWNlQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycywgV29yZENoYXJhY3RlckNsYXNzaWZpZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS93b3JkQ2hhcmFjdGVyQ2xhc3NpZmllci5qcyc7XG5pbXBvcnQgeyBEZWxldGVXb3JkQ29udGV4dCwgV29yZE5hdmlnYXRpb25UeXBlLCBXb3JkT3BlcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3IvY3Vyc29yV29yZE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yQ29tbW9uLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIE1vdmVXb3JkT3B0aW9ucyBleHRlbmRzIElDb21tYW5kT3B0aW9ucyB7XG5cdGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbjtcblx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBNb3ZlV29yZENvbW1hbmQgZXh0ZW5kcyBFZGl0b3JDb21tYW5kIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlO1xuXG5cdGNvbnN0cnVjdG9yKG9wdHM6IE1vdmVXb3JkT3B0aW9ucykge1xuXHRcdHN1cGVyKG9wdHMpO1xuXHRcdHRoaXMuX2luU2VsZWN0aW9uTW9kZSA9IG9wdHMuaW5TZWxlY3Rpb25Nb2RlO1xuXHRcdHRoaXMuX3dvcmROYXZpZ2F0aW9uVHlwZSA9IG9wdHMud29yZE5hdmlnYXRpb25UeXBlO1xuXHR9XG5cblx0cHVibGljIHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmRTZXBhcmF0b3JzID0gZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlcGFyYXRvcnMpLCBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VnbWVudGVyTG9jYWxlcykpO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3QgaGFzTXVsdGljdXJzb3IgPSBzZWxlY3Rpb25zLmxlbmd0aCA+IDE7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2VsZWN0aW9ucy5tYXAoKHNlbCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5Qb3NpdGlvbiA9IG5ldyBQb3NpdGlvbihzZWwucG9zaXRpb25MaW5lTnVtYmVyLCBzZWwucG9zaXRpb25Db2x1bW4pO1xuXHRcdFx0Y29uc3Qgb3V0UG9zaXRpb24gPSB0aGlzLl9tb3ZlKHdvcmRTZXBhcmF0b3JzLCBtb2RlbCwgaW5Qb3NpdGlvbiwgdGhpcy5fd29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW92ZVRvKHNlbCwgb3V0UG9zaXRpb24sIHRoaXMuX2luU2VsZWN0aW9uTW9kZSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0ZWRpdG9yLl9nZXRWaWV3TW9kZWwoKS5zZXRDdXJzb3JTdGF0ZXMoJ21vdmVXb3JkQ29tbWFuZCcsIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCwgcmVzdWx0Lm1hcChyID0+IEN1cnNvclN0YXRlLmZyb21Nb2RlbFNlbGVjdGlvbihyKSkpO1xuXHRcdGlmIChyZXN1bHQubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBwb3MgPSBuZXcgUG9zaXRpb24ocmVzdWx0WzBdLnBvc2l0aW9uTGluZU51bWJlciwgcmVzdWx0WzBdLnBvc2l0aW9uQ29sdW1uKTtcblx0XHRcdGVkaXRvci5yZXZlYWxQb3NpdGlvbihwb3MsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tb3ZlVG8oZnJvbTogU2VsZWN0aW9uLCB0bzogUG9zaXRpb24sIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbik6IFNlbGVjdGlvbiB7XG5cdFx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdFx0Ly8gbW92ZSBqdXN0IHBvc2l0aW9uXG5cdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihcblx0XHRcdFx0ZnJvbS5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdGZyb20uc2VsZWN0aW9uU3RhcnRDb2x1bW4sXG5cdFx0XHRcdHRvLmxpbmVOdW1iZXIsXG5cdFx0XHRcdHRvLmNvbHVtblxuXHRcdFx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gbW92ZSBldmVyeXRoaW5nXG5cdFx0XHRyZXR1cm4gbmV3IFNlbGVjdGlvbihcblx0XHRcdFx0dG8ubGluZU51bWJlcixcblx0XHRcdFx0dG8uY29sdW1uLFxuXHRcdFx0XHR0by5saW5lTnVtYmVyLFxuXHRcdFx0XHR0by5jb2x1bW5cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9tb3ZlKHdvcmRTZXBhcmF0b3JzOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yOiBib29sZWFuKTogUG9zaXRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JkTGVmdENvbW1hbmQgZXh0ZW5kcyBNb3ZlV29yZENvbW1hbmQge1xuXHRwcm90ZWN0ZWQgX21vdmUod29yZFNlcGFyYXRvcnM6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3I6IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIFdvcmRPcGVyYXRpb25zLm1vdmVXb3JkTGVmdCh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29yZFJpZ2h0Q29tbWFuZCBleHRlbmRzIE1vdmVXb3JkQ29tbWFuZCB7XG5cdHByb3RlY3RlZCBfbW92ZSh3b3JkU2VwYXJhdG9yczogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcjogYm9vbGVhbik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gV29yZE9wZXJhdGlvbnMubW92ZVdvcmRSaWdodCh3b3JkU2VwYXJhdG9ycywgbW9kZWwsIHBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkU3RhcnRMZWZ0IGV4dGVuZHMgV29yZExlZnRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiBmYWxzZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZFN0YXJ0TGVmdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkRW5kTGVmdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kLFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkRW5kTGVmdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkTGVmdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnRGYXN0LFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkTGVmdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cywgQ29udGV4dEtleUV4cHIuYW5kKENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQsIElzV2luZG93c0NvbnRleHQpPy5uZWdhdGUoKSksXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5MZWZ0QXJyb3cgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZFN0YXJ0TGVmdFNlbGVjdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZFN0YXJ0TGVmdFNlbGVjdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkRW5kTGVmdFNlbGVjdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRFbmQsXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRFbmRMZWZ0U2VsZWN0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRMZWZ0U2VsZWN0IGV4dGVuZHMgV29yZExlZnRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiB0cnVlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0RmFzdCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZExlZnRTZWxlY3QnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBJc1dpbmRvd3NDb250ZXh0KT8ubmVnYXRlKCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuTGVmdEFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuLy8gQWNjZXNzaWJpbGl0eSBuYXZpZ2F0aW9uIGNvbW1hbmRzIHNob3VsZCBvbmx5IGJlIGVuYWJsZWQgb24gd2luZG93cyBzaW5jZSB0aGV5IGFyZSB0dW5lZCB0byB3aGF0IE5WREEgZXhwZWN0c1xuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkQWNjZXNzaWJpbGl0eSxcblx0XHRcdGlkOiAnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlMZWZ0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX21vdmUod29yZENoYXJhY3RlckNsYXNzaWZpZXI6IFdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLCBtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3I6IGJvb2xlYW4pOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHN1cGVyLl9tb3ZlKGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKEVkaXRvck9wdGlvbnMud29yZFNlcGFyYXRvcnMuZGVmYXVsdFZhbHVlLCB3b3JkQ2hhcmFjdGVyQ2xhc3NpZmllci5pbnRsU2VnbWVudGVyTG9jYWxlcyksIG1vZGVsLCBwb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdFNlbGVjdCBleHRlbmRzIFdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRBY2Nlc3NpYmlsaXR5LFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkQWNjZXNzaWJpbGl0eUxlZnRTZWxlY3QnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfbW92ZSh3b3JkQ2hhcmFjdGVyQ2xhc3NpZmllcjogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcjogYm9vbGVhbik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gc3VwZXIuX21vdmUoZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoRWRpdG9yT3B0aW9ucy53b3JkU2VwYXJhdG9ycy5kZWZhdWx0VmFsdWUsIHdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLmludGxTZWdtZW50ZXJMb2NhbGVzKSwgbW9kZWwsIHBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZFN0YXJ0UmlnaHQgZXh0ZW5kcyBXb3JkUmlnaHRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiBmYWxzZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZFN0YXJ0UmlnaHQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZEVuZFJpZ2h0IGV4dGVuZHMgV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kLFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkRW5kUmlnaHQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsIENvbnRleHRLZXlFeHByLmFuZChDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVELCBJc1dpbmRvd3NDb250ZXh0KT8ubmVnYXRlKCkpLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlJpZ2h0QXJyb3cgfSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZFJpZ2h0IGV4dGVuZHMgV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kLFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkUmlnaHQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZFN0YXJ0UmlnaHRTZWxlY3QgZXh0ZW5kcyBXb3JkUmlnaHRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiB0cnVlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZFN0YXJ0LFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkU3RhcnRSaWdodFNlbGVjdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDdXJzb3JXb3JkRW5kUmlnaHRTZWxlY3QgZXh0ZW5kcyBXb3JkUmlnaHRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aW5TZWxlY3Rpb25Nb2RlOiB0cnVlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCxcblx0XHRcdGlkOiAnY3Vyc29yV29yZEVuZFJpZ2h0U2VsZWN0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLCBDb250ZXh0S2V5RXhwci5hbmQoQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRCwgSXNXaW5kb3dzQ29udGV4dCk/Lm5lZ2F0ZSgpKSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5SaWdodEFycm93IH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvcldvcmRSaWdodFNlbGVjdCBleHRlbmRzIFdvcmRSaWdodENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkRW5kLFxuXHRcdFx0aWQ6ICdjdXJzb3JXb3JkUmlnaHRTZWxlY3QnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodCBleHRlbmRzIFdvcmRSaWdodENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEFjY2Vzc2liaWxpdHksXG5cdFx0XHRpZDogJ2N1cnNvcldvcmRBY2Nlc3NpYmlsaXR5UmlnaHQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfbW92ZSh3b3JkQ2hhcmFjdGVyQ2xhc3NpZmllcjogV29yZENoYXJhY3RlckNsYXNzaWZpZXIsIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLCBoYXNNdWx0aWN1cnNvcjogYm9vbGVhbik6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gc3VwZXIuX21vdmUoZ2V0TWFwRm9yV29yZFNlcGFyYXRvcnMoRWRpdG9yT3B0aW9ucy53b3JkU2VwYXJhdG9ycy5kZWZhdWx0VmFsdWUsIHdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyLmludGxTZWdtZW50ZXJMb2NhbGVzKSwgbW9kZWwsIHBvc2l0aW9uLCB3b3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodFNlbGVjdCBleHRlbmRzIFdvcmRSaWdodENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkQWNjZXNzaWJpbGl0eSxcblx0XHRcdGlkOiAnY3Vyc29yV29yZEFjY2Vzc2liaWxpdHlSaWdodFNlbGVjdCcsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9tb3ZlKHdvcmRDaGFyYWN0ZXJDbGFzc2lmaWVyOiBXb3JkQ2hhcmFjdGVyQ2xhc3NpZmllciwgbW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUsIGhhc011bHRpY3Vyc29yOiBib29sZWFuKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBzdXBlci5fbW92ZShnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyhFZGl0b3JPcHRpb25zLndvcmRTZXBhcmF0b3JzLmRlZmF1bHRWYWx1ZSwgd29yZENoYXJhY3RlckNsYXNzaWZpZXIuaW50bFNlZ21lbnRlckxvY2FsZXMpLCBtb2RlbCwgcG9zaXRpb24sIHdvcmROYXZpZ2F0aW9uVHlwZSwgaGFzTXVsdGljdXJzb3IpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRGVsZXRlV29yZE9wdGlvbnMgZXh0ZW5kcyBJQ29tbWFuZE9wdGlvbnMge1xuXHR3aGl0ZXNwYWNlSGV1cmlzdGljczogYm9vbGVhbjtcblx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGU7XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBEZWxldGVXb3JkQ29tbWFuZCBleHRlbmRzIEVkaXRvckNvbW1hbmQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF93aGl0ZXNwYWNlSGV1cmlzdGljczogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGU7XG5cblx0Y29uc3RydWN0b3Iob3B0czogRGVsZXRlV29yZE9wdGlvbnMpIHtcblx0XHRzdXBlcih7IGNhblRyaWdnZXJJbmxpbmVFZGl0czogdHJ1ZSwgLi4ub3B0cyB9KTtcblx0XHR0aGlzLl93aGl0ZXNwYWNlSGV1cmlzdGljcyA9IG9wdHMud2hpdGVzcGFjZUhldXJpc3RpY3M7XG5cdFx0dGhpcy5fd29yZE5hdmlnYXRpb25UeXBlID0gb3B0cy53b3JkTmF2aWdhdGlvblR5cGU7XG5cdH1cblxuXHRwdWJsaWMgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvcj8uZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkgfHwgIWxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd29yZFNlcGFyYXRvcnMgPSBnZXRNYXBGb3JXb3JkU2VwYXJhdG9ycyhlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycyksIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZWdtZW50ZXJMb2NhbGVzKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRjb25zdCBhdXRvQ2xvc2luZ0JyYWNrZXRzID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdCcmFja2V0cyk7XG5cdFx0Y29uc3QgYXV0b0Nsb3NpbmdRdW90ZXMgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5hdXRvQ2xvc2luZ1F1b3Rlcyk7XG5cdFx0Y29uc3QgYXV0b0Nsb3NpbmdQYWlycyA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKG1vZGVsLmdldExhbmd1YWdlSWQoKSkuZ2V0QXV0b0Nsb3NpbmdQYWlycygpO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cblx0XHRjb25zdCBjb21tYW5kcyA9IHNlbGVjdGlvbnMubWFwKChzZWwpID0+IHtcblx0XHRcdGNvbnN0IGRlbGV0ZVJhbmdlID0gdGhpcy5fZGVsZXRlKHtcblx0XHRcdFx0d29yZFNlcGFyYXRvcnMsXG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRzZWxlY3Rpb246IHNlbCxcblx0XHRcdFx0d2hpdGVzcGFjZUhldXJpc3RpY3M6IHRoaXMuX3doaXRlc3BhY2VIZXVyaXN0aWNzLFxuXHRcdFx0XHRhdXRvQ2xvc2luZ0RlbGV0ZTogZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdEZWxldGUpLFxuXHRcdFx0XHRhdXRvQ2xvc2luZ0JyYWNrZXRzLFxuXHRcdFx0XHRhdXRvQ2xvc2luZ1F1b3Rlcyxcblx0XHRcdFx0YXV0b0Nsb3NpbmdQYWlycyxcblx0XHRcdFx0YXV0b0Nsb3NlZENoYXJhY3RlcnM6IHZpZXdNb2RlbC5nZXRDdXJzb3JBdXRvQ2xvc2VkQ2hhcmFjdGVycygpLFxuXHRcdFx0fSwgdGhpcy5fd29yZE5hdmlnYXRpb25UeXBlKTtcblx0XHRcdHJldHVybiBuZXcgUmVwbGFjZUNvbW1hbmQoZGVsZXRlUmFuZ2UsICcnKTtcblx0XHR9KTtcblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIGNvbW1hbmRzKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2RlbGV0ZShjdHg6IERlbGV0ZVdvcmRDb250ZXh0LCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSk6IFJhbmdlO1xufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlV29yZExlZnRDb21tYW5kIGV4dGVuZHMgRGVsZXRlV29yZENvbW1hbmQge1xuXHRwcm90ZWN0ZWQgX2RlbGV0ZShjdHg6IERlbGV0ZVdvcmRDb250ZXh0LCB3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZSk6IFJhbmdlIHtcblx0XHRjb25zdCByID0gV29yZE9wZXJhdGlvbnMuZGVsZXRlV29yZExlZnQoY3R4LCB3b3JkTmF2aWdhdGlvblR5cGUpO1xuXHRcdGlmIChyKSB7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSYW5nZSgxLCAxLCAxLCAxKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlV29yZFJpZ2h0Q29tbWFuZCBleHRlbmRzIERlbGV0ZVdvcmRDb21tYW5kIHtcblx0cHJvdGVjdGVkIF9kZWxldGUoY3R4OiBEZWxldGVXb3JkQ29udGV4dCwgd29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUpOiBSYW5nZSB7XG5cdFx0Y29uc3QgciA9IFdvcmRPcGVyYXRpb25zLmRlbGV0ZVdvcmRSaWdodChjdHgsIHdvcmROYXZpZ2F0aW9uVHlwZSk7XG5cdFx0aWYgKHIpIHtcblx0XHRcdHJldHVybiByO1xuXHRcdH1cblx0XHRjb25zdCBsaW5lQ291bnQgPSBjdHgubW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0Y29uc3QgbWF4Q29sdW1uID0gY3R4Lm1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUNvdW50KTtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKGxpbmVDb3VudCwgbWF4Q29sdW1uLCBsaW5lQ291bnQsIG1heENvbHVtbik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlbGV0ZVdvcmRTdGFydExlZnQgZXh0ZW5kcyBEZWxldGVXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHR3aGl0ZXNwYWNlSGV1cmlzdGljczogZmFsc2UsXG5cdFx0XHR3b3JkTmF2aWdhdGlvblR5cGU6IFdvcmROYXZpZ2F0aW9uVHlwZS5Xb3JkU3RhcnQsXG5cdFx0XHRpZDogJ2RlbGV0ZVdvcmRTdGFydExlZnQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVXb3JkRW5kTGVmdCBleHRlbmRzIERlbGV0ZVdvcmRMZWZ0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdHdoaXRlc3BhY2VIZXVyaXN0aWNzOiBmYWxzZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRFbmQsXG5cdFx0XHRpZDogJ2RlbGV0ZVdvcmRFbmRMZWZ0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlV29yZExlZnQgZXh0ZW5kcyBEZWxldGVXb3JkTGVmdENvbW1hbmQge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHR3aGl0ZXNwYWNlSGV1cmlzdGljczogdHJ1ZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCxcblx0XHRcdGlkOiAnZGVsZXRlV29yZExlZnQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuQmFja3NwYWNlIH0sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERlbGV0ZVdvcmRTdGFydFJpZ2h0IGV4dGVuZHMgRGVsZXRlV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdHdoaXRlc3BhY2VIZXVyaXN0aWNzOiBmYWxzZSxcblx0XHRcdHdvcmROYXZpZ2F0aW9uVHlwZTogV29yZE5hdmlnYXRpb25UeXBlLldvcmRTdGFydCxcblx0XHRcdGlkOiAnZGVsZXRlV29yZFN0YXJ0UmlnaHQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVXb3JkRW5kUmlnaHQgZXh0ZW5kcyBEZWxldGVXb3JkUmlnaHRDb21tYW5kIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0d2hpdGVzcGFjZUhldXJpc3RpY3M6IGZhbHNlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCxcblx0XHRcdGlkOiAnZGVsZXRlV29yZEVuZFJpZ2h0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGVcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVsZXRlV29yZFJpZ2h0IGV4dGVuZHMgRGVsZXRlV29yZFJpZ2h0Q29tbWFuZCB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdHdoaXRlc3BhY2VIZXVyaXN0aWNzOiB0cnVlLFxuXHRcdFx0d29yZE5hdmlnYXRpb25UeXBlOiBXb3JkTmF2aWdhdGlvblR5cGUuV29yZEVuZCxcblx0XHRcdGlkOiAnZGVsZXRlV29yZFJpZ2h0Jyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRlbGV0ZSxcblx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRlbGV0ZSB9LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWxldGVJbnNpZGVXb3JkIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2RlbGV0ZUluc2lkZVdvcmQnLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdkZWxldGVJbnNpZGVXb3JkJywgXCJEZWxldGUgV29yZFwiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdkZWxldGVJbnNpZGVXb3JkLmRlc2NyaXB0aW9uJywgXCJEZWxldGUgdGhlIHdvcmQgYXQgdGhlIGN1cnNvclwiKSxcblx0XHRcdFx0YXJnczogW3tcblx0XHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0J29ubHlXb3JkJzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWxldGVJbnNpZGVXb3JkLmFyZ3Mub25seVdvcmQnLCBcIkRlbGV0ZSBvbmx5IHRoZSB3b3JkIGFuZCBsZWF2ZSBzdXJyb3VuZGluZyB3aGl0ZXNwYWNlXCIpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHR5cGUgRGVsZXRlSW5zaWRlV29yZEFyZ3MgPSB7IHJlYWRvbmx5IG9ubHlXb3JkPzogYm9vbGVhbiB9O1xuXHRcdGNvbnN0IG9ubHlXb3JkID0gISEoYXJncyAmJiB0eXBlb2YgYXJncyA9PT0gJ29iamVjdCcgJiYgKGFyZ3MgYXMgRGVsZXRlSW5zaWRlV29yZEFyZ3MpLm9ubHlXb3JkKTtcblx0XHRjb25zdCB3b3JkU2VwYXJhdG9ycyA9IGdldE1hcEZvcldvcmRTZXBhcmF0b3JzKGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSwgZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ud29yZFNlZ21lbnRlckxvY2FsZXMpKTtcblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBzZWxlY3Rpb25zLm1hcCgoc2VsKSA9PiB7XG5cdFx0XHRjb25zdCBkZWxldGVSYW5nZSA9IFdvcmRPcGVyYXRpb25zLmRlbGV0ZUluc2lkZVdvcmQod29yZFNlcGFyYXRvcnMsIG1vZGVsLCBzZWwsIG9ubHlXb3JkKTtcblx0XHRcdHJldHVybiBuZXcgUmVwbGFjZUNvbW1hbmQoZGVsZXRlUmFuZ2UsICcnKTtcblx0XHR9KTtcblxuXHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIGNvbW1hbmRzKTtcblx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkU3RhcnRMZWZ0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkRW5kTGVmdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZExlZnQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRTdGFydExlZnRTZWxlY3QoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRFbmRMZWZ0U2VsZWN0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkTGVmdFNlbGVjdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZFN0YXJ0UmlnaHQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRFbmRSaWdodCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZFJpZ2h0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkU3RhcnRSaWdodFNlbGVjdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZEVuZFJpZ2h0U2VsZWN0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkUmlnaHRTZWxlY3QoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvcldvcmRBY2Nlc3NpYmlsaXR5TGVmdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yV29yZEFjY2Vzc2liaWxpdHlMZWZ0U2VsZWN0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eVJpZ2h0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JXb3JkQWNjZXNzaWJpbGl0eVJpZ2h0U2VsZWN0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBEZWxldGVXb3JkU3RhcnRMZWZ0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBEZWxldGVXb3JkRW5kTGVmdCgpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgRGVsZXRlV29yZExlZnQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IERlbGV0ZVdvcmRTdGFydFJpZ2h0KCkpO1xucmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBEZWxldGVXb3JkRW5kUmlnaHQoKSk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IERlbGV0ZVdvcmRSaWdodCgpKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKERlbGV0ZUluc2lkZVdvcmQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLGNBQWM7QUFDaEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsY0FBYyxlQUFnQyxzQkFBc0IsNkJBQStDO0FBQzVILFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYyxxQkFBcUI7QUFDNUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsK0JBQXdEO0FBQ2pFLFNBQTRCLG9CQUFvQixzQkFBc0I7QUFDdEUsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQ0FBcUM7QUFRdkMsTUFBZSx3QkFBd0IsY0FBYztBQUFBLEVBSzNELFlBQVksTUFBdUI7QUFDbEMsVUFBTSxJQUFJO0FBQ1YsU0FBSyxtQkFBbUIsS0FBSztBQUM3QixTQUFLLHNCQUFzQixLQUFLO0FBQUEsRUFDakM7QUFBQSxFQUVPLGlCQUFpQixVQUE0QixRQUFxQixNQUFxQjtBQUM3RixRQUFJLENBQUMsT0FBTyxTQUFTLEdBQUc7QUFDdkI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxpQkFBaUIsd0JBQXdCLE9BQU8sVUFBVSxhQUFhLGNBQWMsR0FBRyxPQUFPLFVBQVUsYUFBYSxvQkFBb0IsQ0FBQztBQUNqSixVQUFNLFFBQVEsT0FBTyxTQUFTO0FBQzlCLFVBQU0sYUFBYSxPQUFPLGNBQWM7QUFDeEMsVUFBTSxpQkFBaUIsV0FBVyxTQUFTO0FBQzNDLFVBQU0sU0FBUyxXQUFXLElBQUksQ0FBQyxRQUFRO0FBQ3RDLFlBQU0sYUFBYSxJQUFJLFNBQVMsSUFBSSxvQkFBb0IsSUFB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
