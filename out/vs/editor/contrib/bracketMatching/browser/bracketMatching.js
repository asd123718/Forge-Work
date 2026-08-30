import { RunOnceScheduler } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import "./bracketMatching.css";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { OverviewRulerLane, TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import * as nls from "../../../../nls.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant, themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { editorBracketMatchForeground } from "../../../common/core/editorColorRegistry.js";
const overviewRulerBracketMatchForeground = registerColor("editorOverviewRuler.bracketMatchForeground", "#A0A0A0", nls.localize("overviewRulerBracketMatchForeground", "Overview ruler marker color for matching brackets."));
class JumpToBracketAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.jumpToBracket",
      label: nls.localize2("smartSelect.jumpBracket", "Go to Bracket"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    BracketMatchingController.get(editor)?.jumpToBracket();
  }
}
class SelectToBracketAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.selectToBracket",
      label: nls.localize2("smartSelect.selectToBracket", "Select to Bracket"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("smartSelect.selectToBracketDescription", "Select the text inside and including the brackets or curly braces"),
        args: [{
          name: "args",
          schema: {
            type: "object",
            properties: {
              "selectBrackets": {
                type: "boolean",
                default: true
              }
            }
          }
        }]
      }
    });
  }
  run(accessor, editor, args) {
    let selectBrackets = true;
    if (args && args.selectBrackets === false) {
      selectBrackets = false;
    }
    BracketMatchingController.get(editor)?.selectToBracket(selectBrackets);
  }
}
class RemoveBracketsAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.removeBrackets",
      label: nls.localize2("smartSelect.removeBrackets", "Remove Brackets"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor) {
    BracketMatchingController.get(editor)?.removeBrackets(this.id);
  }
}
class BracketsData {
  constructor(position, brackets, options) {
    this.position = position;
    this.brackets = brackets;
    this.options = options;
  }
}
const _BracketMatchingController = class _BracketMatchingController extends Disposable {
  static get(editor) {
    return editor.getContribution(_BracketMatchingController.ID);
  }
  constructor(editor) {
    super();
    this._editor = editor;
    this._lastBracketsData = [];
    this._lastVersionId = 0;
    this._decorations = this._editor.createDecorationsCollection();
    this._updateBracketsSoon = this._register(new RunOnceScheduler(() => this._updateBrackets(), 50));
    this._matchBrackets = this._editor.getOption(EditorOption.matchBrackets);
    this._updateBracketsSoon.schedule();
    this._register(editor.onDidChangeCursorPosition((e) => {
      if (this._matchBrackets === "never") {
        return;
      }
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeModelContent((e) => {
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeModel((e) => {
      this._lastBracketsData = [];
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeModelLanguageConfiguration((e) => {
      this._lastBracketsData = [];
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.matchBrackets)) {
        this._matchBrackets = this._editor.getOption(EditorOption.matchBrackets);
        this._decorations.clear();
        this._lastBracketsData = [];
        this._lastVersionId = 0;
        this._updateBracketsSoon.schedule();
      }
    }));
    this._register(editor.onDidBlurEditorWidget(() => {
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidFocusEditorWidget(() => {
      this._updateBracketsSoon.schedule();
    }));
  }
  jumpToBracket() {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const newSelections = this._editor.getSelections().map((selection) => {
      const position = selection.getStartPosition();
      const brackets = model.bracketPairs.matchBracket(position);
      let newCursorPosition = null;
      if (brackets) {
        if (brackets[0].containsPosition(position) && !brackets[1].containsPosition(position)) {
          newCursorPosition = brackets[1].getStartPosition();
        } else if (brackets[1].containsPosition(position)) {
          newCursorPosition = brackets[0].getStartPosition();
        }
      } else {
        const enclosingBrackets = model.bracketPairs.findEnclosingBrackets(position);
        if (enclosingBrackets) {
          newCursorPosition = enclosingBrackets[1].getStartPosition();
        } else {
          const nextBracket = model.bracketPairs.findNextBracket(position);
          if (nextBracket && nextBracket.range) {
            newCursorPosition = nextBracket.range.getStartPosition();
          }
        }
      }
      if (newCursorPosition) {
        return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
      }
      return new Selection(position.lineNumber, position.column, position.lineNumber, position.column);
    });
    this._editor.setSelections(newSelections);
    this._editor.revealRange(newSelections[0]);
  }
  selectToBracket(selectBrackets) {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const newSelections = [];
    this._editor.getSelections().forEach((selection) => {
      const position = selection.getStartPosition();
      let brackets = model.bracketPairs.matchBracket(position);
      if (!brackets) {
        brackets = model.bracketPairs.findEnclosingBrackets(position);
        if (!brackets) {
          const nextBracket = model.bracketPairs.findNextBracket(position);
          if (nextBracket && nextBracket.range) {
            brackets = model.bracketPairs.matchBracket(nextBracket.range.getStartPosition());
          }
        }
      }
      let selectFrom = null;
      let selectTo = null;
      if (brackets) {
        brackets.sort(Range.compareRangesUsingStarts);
        const [open, close] = brackets;
        selectFrom = selectBrackets ? open.getStartPosition() : open.getEndPosition();
        selectTo = selectBrackets ? close.getEndPosition() : close.getStartPosition();
        if (close.containsPosition(position)) {
          const tmp = selectFrom;
          selectFrom = selectTo;
          selectTo = tmp;
        }
      }
      if (selectFrom && selectTo) {
        newSelections.push(new Selection(selectFrom.lineNumber, selectFrom.column, selectTo.lineNumber, selectTo.column));
      }
    });
    if (newSelections.length > 0) {
      this._editor.setSelections(newSelections);
      this._editor.revealRange(newSelections[0]);
    }
  }
  removeBrackets(editSource) {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    this._editor.getSelections().forEach((selection) => {
      const position = selection.getPosition();
      let brackets = model.bracketPairs.matchBracket(position);
      if (!brackets) {
        brackets = model.bracketPairs.findEnclosingBrackets(position);
      }
      if (brackets) {
        this._editor.pushUndoStop();
        this._editor.executeEdits(
          editSource,
          [
            { range: brackets[0], text: "" },
            { range: brackets[1], text: "" }
          ]
        );
        this._editor.pushUndoStop();
      }
    });
  }
  _updateBrackets() {
    if (this._matchBrackets === "never") {
      return;
    }
    this._recomputeBrackets();
    const newDecorations = [];
    let newDecorationsLen = 0;
    for (const bracketData of this._lastBracketsData) {
      const brackets = bracketData.brackets;
      if (brackets) {
        newDecorations[newDecorationsLen++] = { range: brackets[0], options: bracketData.options };
        newDecorations[newDecorationsLen++] = { range: brackets[1], options: bracketData.options };
      }
    }
    this._decorations.set(newDecorations);
  }
  _recomputeBrackets() {
    if (!this._editor.hasModel() || !this._editor.hasWidgetFocus()) {
      this._lastBracketsData = [];
      this._lastVersionId = 0;
      return;
    }
    const selections = this._editor.getSelections();
    if (selections.length > 100) {
      this._lastBracketsData = [];
      this._lastVersionId = 0;
      return;
    }
    const model = this._editor.getModel();
    const versionId = model.getVersionId();
    let previousData = [];
    if (this._lastVersionId === versionId) {
      previousData = this._lastBracketsData;
    }
    const positions = [];
    let positionsLen = 0;
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      if (selection.isEmpty()) {
        positions[positionsLen++] = selection.getStartPosition();
      }
    }
    if (positions.length > 1) {
      positions.sort(Position.compare);
    }
    const newData = [];
    let newDataLen = 0;
    let previousIndex = 0;
    const previousLen = previousData.length;
    for (let i = 0, len = positions.length; i < len; i++) {
      const position = positions[i];
      while (previousIndex < previousLen && previousData[previousIndex].position.isBefore(position)) {
        previousIndex++;
      }
      if (previousIndex < previousLen && previousData[previousIndex].position.equals(position)) {
        newData[newDataLen++] = previousData[previousIndex];
      } else {
        let brackets = model.bracketPairs.matchBracket(
          position,
          20
          /* give at most 20ms to compute */
        );
        let options = _BracketMatchingController._DECORATION_OPTIONS_WITH_OVERVIEW_RULER;
        if (!brackets && this._matchBrackets === "always") {
          brackets = model.bracketPairs.findEnclosingBrackets(
            position,
            20
            /* give at most 20ms to compute */
          );
          options = _BracketMatchingController._DECORATION_OPTIONS_WITHOUT_OVERVIEW_RULER;
        }
        newData[newDataLen++] = new BracketsData(position, brackets, options);
      }
    }
    this._lastBracketsData = newData;
    this._lastVersionId = versionId;
  }
};
_BracketMatchingController.ID = "editor.contrib.bracketMatchingController";
_BracketMatchingController._DECORATION_OPTIONS_WITH_OVERVIEW_RULER = ModelDecorationOptions.register({
  description: "bracket-match-overview",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  className: "bracket-match",
  inlineClassName: "bracket-match-inline",
  overviewRuler: {
    color: themeColorFromId(overviewRulerBracketMatchForeground),
    position: OverviewRulerLane.Center
  }
});
_BracketMatchingController._DECORATION_OPTIONS_WITHOUT_OVERVIEW_RULER = ModelDecorationOptions.register({
  description: "bracket-match-no-overview",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  className: "bracket-match",
  inlineClassName: "bracket-match-inline"
});
let BracketMatchingController = _BracketMatchingController;
registerEditorContribution(BracketMatchingController.ID, BracketMatchingController, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(SelectToBracketAction);
registerEditorAction(JumpToBracketAction);
registerEditorAction(RemoveBracketsAction);
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "5_infile_nav",
  command: {
    id: "editor.action.jumpToBracket",
    title: nls.localize({ key: "miGoToBracket", comment: ["&& denotes a mnemonic"] }, "Go to &&Bracket")
  },
  order: 2
});
registerThemingParticipant((theme, collector) => {
  const bracketMatchForeground = theme.getColor(editorBracketMatchForeground);
  if (bracketMatchForeground) {
    collector.addRule(`.monaco-editor .bracket-match-inline { color: ${bracketMatchForeground} !important; }`);
  }
});
export {
  BracketMatchingController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGJyYWNrZXRNYXRjaGluZ1xcYnJvd3NlclxcYnJhY2tldE1hdGNoaW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICcuL2JyYWNrZXRNYXRjaGluZy5jc3MnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBPdmVydmlld1J1bGVyTGFuZSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQsIHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVkaXRvckJyYWNrZXRNYXRjaEZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcblxuY29uc3Qgb3ZlcnZpZXdSdWxlckJyYWNrZXRNYXRjaEZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3JPdmVydmlld1J1bGVyLmJyYWNrZXRNYXRjaEZvcmVncm91bmQnLCAnI0EwQTBBMCcsIG5scy5sb2NhbGl6ZSgnb3ZlcnZpZXdSdWxlckJyYWNrZXRNYXRjaEZvcmVncm91bmQnLCAnT3ZlcnZpZXcgcnVsZXIgbWFya2VyIGNvbG9yIGZvciBtYXRjaGluZyBicmFja2V0cy4nKSk7XG5cbmNsYXNzIEp1bXBUb0JyYWNrZXRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uanVtcFRvQnJhY2tldCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc21hcnRTZWxlY3QuanVtcEJyYWNrZXQnLCBcIkdvIHRvIEJyYWNrZXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkJhY2tzbGFzaCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyLmdldChlZGl0b3IpPy5qdW1wVG9CcmFja2V0KCk7XG5cdH1cbn1cblxuY2xhc3MgU2VsZWN0VG9CcmFja2V0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnNlbGVjdFRvQnJhY2tldCcsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc21hcnRTZWxlY3Quc2VsZWN0VG9CcmFja2V0JywgXCJTZWxlY3QgdG8gQnJhY2tldFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3NtYXJ0U2VsZWN0LnNlbGVjdFRvQnJhY2tldERlc2NyaXB0aW9uJywgXCJTZWxlY3QgdGhlIHRleHQgaW5zaWRlIGFuZCBpbmNsdWRpbmcgdGhlIGJyYWNrZXRzIG9yIGN1cmx5IGJyYWNlc1wiKSxcblx0XHRcdFx0YXJnczogW3tcblx0XHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0J3NlbGVjdEJyYWNrZXRzJzoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogYW55KTogdm9pZCB7XG5cdFx0bGV0IHNlbGVjdEJyYWNrZXRzID0gdHJ1ZTtcblx0XHRpZiAoYXJncyAmJiBhcmdzLnNlbGVjdEJyYWNrZXRzID09PSBmYWxzZSkge1xuXHRcdFx0c2VsZWN0QnJhY2tldHMgPSBmYWxzZTtcblx0XHR9XG5cdFx0QnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uc2VsZWN0VG9CcmFja2V0KHNlbGVjdEJyYWNrZXRzKTtcblx0fVxufVxuXG5jbGFzcyBSZW1vdmVCcmFja2V0c0FjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5yZW1vdmVCcmFja2V0cycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignc21hcnRTZWxlY3QucmVtb3ZlQnJhY2tldHMnLCBcIlJlbW92ZSBCcmFja2V0c1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkJhY2tzcGFjZSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRjYW5UcmlnZ2VySW5saW5lRWRpdHM6IHRydWUsXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0QnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5nZXQoZWRpdG9yKT8ucmVtb3ZlQnJhY2tldHModGhpcy5pZCk7XG5cdH1cbn1cblxudHlwZSBCcmFja2V0cyA9IFtSYW5nZSwgUmFuZ2VdO1xuXG5jbGFzcyBCcmFja2V0c0RhdGEge1xuXHRwdWJsaWMgcmVhZG9ubHkgcG9zaXRpb246IFBvc2l0aW9uO1xuXHRwdWJsaWMgcmVhZG9ubHkgYnJhY2tldHM6IEJyYWNrZXRzIHwgbnVsbDtcblx0cHVibGljIHJlYWRvbmx5IG9wdGlvbnM6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cblx0Y29uc3RydWN0b3IocG9zaXRpb246IFBvc2l0aW9uLCBicmFja2V0czogQnJhY2tldHMgfCBudWxsLCBvcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zKSB7XG5cdFx0dGhpcy5wb3NpdGlvbiA9IHBvc2l0aW9uO1xuXHRcdHRoaXMuYnJhY2tldHMgPSBicmFja2V0cztcblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmJyYWNrZXRNYXRjaGluZ0NvbnRyb2xsZXInO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248QnJhY2tldE1hdGNoaW5nQ29udHJvbGxlcj4oQnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXG5cdHByaXZhdGUgX2xhc3RCcmFja2V0c0RhdGE6IEJyYWNrZXRzRGF0YVtdO1xuXHRwcml2YXRlIF9sYXN0VmVyc2lvbklkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVCcmFja2V0c1Nvb246IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByaXZhdGUgX21hdGNoQnJhY2tldHM6ICduZXZlcicgfCAnbmVhcicgfCAnYWx3YXlzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX2xhc3RCcmFja2V0c0RhdGEgPSBbXTtcblx0XHR0aGlzLl9sYXN0VmVyc2lvbklkID0gMDtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl91cGRhdGVCcmFja2V0cygpLCA1MCkpO1xuXHRcdHRoaXMuX21hdGNoQnJhY2tldHMgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5tYXRjaEJyYWNrZXRzKTtcblxuXHRcdHRoaXMuX3VwZGF0ZUJyYWNrZXRzU29vbi5zY2hlZHVsZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKChlKSA9PiB7XG5cblx0XHRcdGlmICh0aGlzLl9tYXRjaEJyYWNrZXRzID09PSAnbmV2ZXInKSB7XG5cdFx0XHRcdC8vIEVhcmx5IGV4aXQgaWYgbm90aGluZyBuZWVkcyB0byBiZSBkb25lIVxuXHRcdFx0XHQvLyBMZWF2ZSBzb21lIGZvcm0gb2YgZWFybHkgZXhpdCBjaGVjayBoZXJlIGlmIHlvdSB3aXNoIHRvIGNvbnRpbnVlIGJlaW5nIGEgY3Vyc29yIHBvc2l0aW9uIGNoYW5nZSBsaXN0ZW5lciA7KVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3VwZGF0ZUJyYWNrZXRzU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUJyYWNrZXRzU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoZSkgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdEJyYWNrZXRzRGF0YSA9IFtdO1xuXHRcdFx0dGhpcy5fdXBkYXRlQnJhY2tldHNTb29uLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9sYXN0QnJhY2tldHNEYXRhID0gW107XG5cdFx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24uc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubWF0Y2hCcmFja2V0cykpIHtcblx0XHRcdFx0dGhpcy5fbWF0Y2hCcmFja2V0cyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLm1hdGNoQnJhY2tldHMpO1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9sYXN0QnJhY2tldHNEYXRhID0gW107XG5cdFx0XHRcdHRoaXMuX2xhc3RWZXJzaW9uSWQgPSAwO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24uc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUJyYWNrZXRzU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUJyYWNrZXRzU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBqdW1wVG9CcmFja2V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IG5ld1NlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpLm1hcChzZWxlY3Rpb24gPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXG5cdFx0XHQvLyBmaW5kIG1hdGNoaW5nIGJyYWNrZXRzIGlmIHBvc2l0aW9uIGlzIG9uIGEgYnJhY2tldFxuXHRcdFx0Y29uc3QgYnJhY2tldHMgPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KHBvc2l0aW9uKTtcblx0XHRcdGxldCBuZXdDdXJzb3JQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsID0gbnVsbDtcblx0XHRcdGlmIChicmFja2V0cykge1xuXHRcdFx0XHRpZiAoYnJhY2tldHNbMF0uY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikgJiYgIWJyYWNrZXRzWzFdLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0bmV3Q3Vyc29yUG9zaXRpb24gPSBicmFja2V0c1sxXS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYnJhY2tldHNbMV0uY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0XHRuZXdDdXJzb3JQb3NpdGlvbiA9IGJyYWNrZXRzWzBdLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gZmluZCB0aGUgZW5jbG9zaW5nIGJyYWNrZXRzIGlmIHRoZSBwb3NpdGlvbiBpc24ndCBvbiBhIG1hdGNoaW5nIGJyYWNrZXRcblx0XHRcdFx0Y29uc3QgZW5jbG9zaW5nQnJhY2tldHMgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZEVuY2xvc2luZ0JyYWNrZXRzKHBvc2l0aW9uKTtcblx0XHRcdFx0aWYgKGVuY2xvc2luZ0JyYWNrZXRzKSB7XG5cdFx0XHRcdFx0bmV3Q3Vyc29yUG9zaXRpb24gPSBlbmNsb3NpbmdCcmFja2V0c1sxXS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gbm8gZW5jbG9zaW5nIGJyYWNrZXRzLCB0cnkgdGhlIHZlcnkgZmlyc3QgbmV4dCBicmFja2V0XG5cdFx0XHRcdFx0Y29uc3QgbmV4dEJyYWNrZXQgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZE5leHRCcmFja2V0KHBvc2l0aW9uKTtcblx0XHRcdFx0XHRpZiAobmV4dEJyYWNrZXQgJiYgbmV4dEJyYWNrZXQucmFuZ2UpIHtcblx0XHRcdFx0XHRcdG5ld0N1cnNvclBvc2l0aW9uID0gbmV4dEJyYWNrZXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV3Q3Vyc29yUG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24obmV3Q3Vyc29yUG9zaXRpb24ubGluZU51bWJlciwgbmV3Q3Vyc29yUG9zaXRpb24uY29sdW1uLCBuZXdDdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyLCBuZXdDdXJzb3JQb3NpdGlvbi5jb2x1bW4pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBTZWxlY3Rpb24ocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fZWRpdG9yLnNldFNlbGVjdGlvbnMobmV3U2VsZWN0aW9ucyk7XG5cdFx0dGhpcy5fZWRpdG9yLnJldmVhbFJhbmdlKG5ld1NlbGVjdGlvbnNbMF0pO1xuXHR9XG5cblx0cHVibGljIHNlbGVjdFRvQnJhY2tldChzZWxlY3RCcmFja2V0czogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IG5ld1NlbGVjdGlvbnM6IFNlbGVjdGlvbltdID0gW107XG5cblx0XHR0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpLmZvckVhY2goc2VsZWN0aW9uID0+IHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdGxldCBicmFja2V0cyA9IG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQocG9zaXRpb24pO1xuXG5cdFx0XHRpZiAoIWJyYWNrZXRzKSB7XG5cdFx0XHRcdGJyYWNrZXRzID0gbW9kZWwuYnJhY2tldFBhaXJzLmZpbmRFbmNsb3NpbmdCcmFja2V0cyhwb3NpdGlvbik7XG5cdFx0XHRcdGlmICghYnJhY2tldHMpIHtcblx0XHRcdFx0XHRjb25zdCBuZXh0QnJhY2tldCA9IG1vZGVsLmJyYWNrZXRQYWlycy5maW5kTmV4dEJyYWNrZXQocG9zaXRpb24pO1xuXHRcdFx0XHRcdGlmIChuZXh0QnJhY2tldCAmJiBuZXh0QnJhY2tldC5yYW5nZSkge1xuXHRcdFx0XHRcdFx0YnJhY2tldHMgPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KG5leHRCcmFja2V0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGxldCBzZWxlY3RGcm9tOiBQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXHRcdFx0bGV0IHNlbGVjdFRvOiBQb3NpdGlvbiB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRpZiAoYnJhY2tldHMpIHtcblx0XHRcdFx0YnJhY2tldHMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRcdFx0XHRjb25zdCBbb3BlbiwgY2xvc2VdID0gYnJhY2tldHM7XG5cdFx0XHRcdHNlbGVjdEZyb20gPSBzZWxlY3RCcmFja2V0cyA/IG9wZW4uZ2V0U3RhcnRQb3NpdGlvbigpIDogb3Blbi5nZXRFbmRQb3NpdGlvbigpO1xuXHRcdFx0XHRzZWxlY3RUbyA9IHNlbGVjdEJyYWNrZXRzID8gY2xvc2UuZ2V0RW5kUG9zaXRpb24oKSA6IGNsb3NlLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0XHRpZiAoY2xvc2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0XHQvLyBzZWxlY3QgYmFja3dhcmRzIGlmIHRoZSBjdXJzb3Igd2FzIG9uIHRoZSBjbG9zaW5nIGJyYWNrZXRcblx0XHRcdFx0XHRjb25zdCB0bXAgPSBzZWxlY3RGcm9tO1xuXHRcdFx0XHRcdHNlbGVjdEZyb20gPSBzZWxlY3RUbztcblx0XHRcdFx0XHRzZWxlY3RUbyA9IHRtcDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2VsZWN0RnJvbSAmJiBzZWxlY3RUbykge1xuXHRcdFx0XHRuZXdTZWxlY3Rpb25zLnB1c2gobmV3IFNlbGVjdGlvbihzZWxlY3RGcm9tLmxpbmVOdW1iZXIsIHNlbGVjdEZyb20uY29sdW1uLCBzZWxlY3RUby5saW5lTnVtYmVyLCBzZWxlY3RUby5jb2x1bW4pKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChuZXdTZWxlY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb25zKG5ld1NlbGVjdGlvbnMpO1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFJhbmdlKG5ld1NlbGVjdGlvbnNbMF0pO1xuXHRcdH1cblx0fVxuXHRwdWJsaWMgcmVtb3ZlQnJhY2tldHMoZWRpdFNvdXJjZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCkuZm9yRWFjaCgoc2VsZWN0aW9uKSA9PiB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRQb3NpdGlvbigpO1xuXG5cdFx0XHRsZXQgYnJhY2tldHMgPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KHBvc2l0aW9uKTtcblx0XHRcdGlmICghYnJhY2tldHMpIHtcblx0XHRcdFx0YnJhY2tldHMgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZEVuY2xvc2luZ0JyYWNrZXRzKHBvc2l0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmIChicmFja2V0cykge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvci5leGVjdXRlRWRpdHMoXG5cdFx0XHRcdFx0ZWRpdFNvdXJjZSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7IHJhbmdlOiBicmFja2V0c1swXSwgdGV4dDogJycgfSxcblx0XHRcdFx0XHRcdHsgcmFuZ2U6IGJyYWNrZXRzWzFdLCB0ZXh0OiAnJyB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfREVDT1JBVElPTl9PUFRJT05TX1dJVEhfT1ZFUlZJRVdfUlVMRVIgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ2JyYWNrZXQtbWF0Y2gtb3ZlcnZpZXcnLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdGNsYXNzTmFtZTogJ2JyYWNrZXQtbWF0Y2gnLFxuXHRcdGlubGluZUNsYXNzTmFtZTogJ2JyYWNrZXQtbWF0Y2gtaW5saW5lJyxcblx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChvdmVydmlld1J1bGVyQnJhY2tldE1hdGNoRm9yZWdyb3VuZCksXG5cdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuQ2VudGVyXG5cdFx0fVxuXHR9KTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfREVDT1JBVElPTl9PUFRJT05TX1dJVEhPVVRfT1ZFUlZJRVdfUlVMRVIgPSBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHtcblx0XHRkZXNjcmlwdGlvbjogJ2JyYWNrZXQtbWF0Y2gtbm8tb3ZlcnZpZXcnLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdGNsYXNzTmFtZTogJ2JyYWNrZXQtbWF0Y2gnLFxuXHRcdGlubGluZUNsYXNzTmFtZTogJ2JyYWNrZXQtbWF0Y2gtaW5saW5lJ1xuXHR9KTtcblxuXHRwcml2YXRlIF91cGRhdGVCcmFja2V0cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbWF0Y2hCcmFja2V0cyA9PT0gJ25ldmVyJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvbXB1dGVCcmFja2V0cygpO1xuXG5cdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0bGV0IG5ld0RlY29yYXRpb25zTGVuID0gMDtcblx0XHRmb3IgKGNvbnN0IGJyYWNrZXREYXRhIG9mIHRoaXMuX2xhc3RCcmFja2V0c0RhdGEpIHtcblx0XHRcdGNvbnN0IGJyYWNrZXRzID0gYnJhY2tldERhdGEuYnJhY2tldHM7XG5cdFx0XHRpZiAoYnJhY2tldHMpIHtcblx0XHRcdFx0bmV3RGVjb3JhdGlvbnNbbmV3RGVjb3JhdGlvbnNMZW4rK10gPSB7IHJhbmdlOiBicmFja2V0c1swXSwgb3B0aW9uczogYnJhY2tldERhdGEub3B0aW9ucyB9O1xuXHRcdFx0XHRuZXdEZWNvcmF0aW9uc1tuZXdEZWNvcmF0aW9uc0xlbisrXSA9IHsgcmFuZ2U6IGJyYWNrZXRzWzFdLCBvcHRpb25zOiBicmFja2V0RGF0YS5vcHRpb25zIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMuc2V0KG5ld0RlY29yYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29tcHV0ZUJyYWNrZXRzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgIXRoaXMuX2VkaXRvci5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHQvLyBubyBtb2RlbCBvciBubyBmb2N1cyA9PiBubyBicmFja2V0cyFcblx0XHRcdHRoaXMuX2xhc3RCcmFja2V0c0RhdGEgPSBbXTtcblx0XHRcdHRoaXMuX2xhc3RWZXJzaW9uSWQgPSAwO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmIChzZWxlY3Rpb25zLmxlbmd0aCA+IDEwMCkge1xuXHRcdFx0Ly8gbm8gYnJhY2tldCBtYXRjaGluZyBmb3IgaGlnaCBudW1iZXJzIG9mIHNlbGVjdGlvbnNcblx0XHRcdHRoaXMuX2xhc3RCcmFja2V0c0RhdGEgPSBbXTtcblx0XHRcdHRoaXMuX2xhc3RWZXJzaW9uSWQgPSAwO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gbW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0bGV0IHByZXZpb3VzRGF0YTogQnJhY2tldHNEYXRhW10gPSBbXTtcblx0XHRpZiAodGhpcy5fbGFzdFZlcnNpb25JZCA9PT0gdmVyc2lvbklkKSB7XG5cdFx0XHQvLyB1c2UgdGhlIHByZXZpb3VzIGRhdGEgb25seSBpZiB0aGUgbW9kZWwgaXMgYXQgdGhlIHNhbWUgdmVyc2lvbiBpZFxuXHRcdFx0cHJldmlvdXNEYXRhID0gdGhpcy5fbGFzdEJyYWNrZXRzRGF0YTtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbnM6IFBvc2l0aW9uW10gPSBbXTtcblx0XHRsZXQgcG9zaXRpb25zTGVuID0gMDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gc2VsZWN0aW9uc1tpXTtcblxuXHRcdFx0aWYgKHNlbGVjdGlvbi5pc0VtcHR5KCkpIHtcblx0XHRcdFx0Ly8gd2lsbCBicmFja2V0IG1hdGNoIGEgY3Vyc29yIG9ubHkgaWYgdGhlIHNlbGVjdGlvbiBpcyBjb2xsYXBzZWRcblx0XHRcdFx0cG9zaXRpb25zW3Bvc2l0aW9uc0xlbisrXSA9IHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gc29ydCBwb3NpdGlvbnMgZm9yIGBwcmV2aW91c0RhdGFgIGNhY2hlIGhpdHNcblx0XHRpZiAocG9zaXRpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdHBvc2l0aW9ucy5zb3J0KFBvc2l0aW9uLmNvbXBhcmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld0RhdGE6IEJyYWNrZXRzRGF0YVtdID0gW107XG5cdFx0bGV0IG5ld0RhdGFMZW4gPSAwO1xuXHRcdGxldCBwcmV2aW91c0luZGV4ID0gMDtcblx0XHRjb25zdCBwcmV2aW91c0xlbiA9IHByZXZpb3VzRGF0YS5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHBvc2l0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBwb3NpdGlvbnNbaV07XG5cblx0XHRcdHdoaWxlIChwcmV2aW91c0luZGV4IDwgcHJldmlvdXNMZW4gJiYgcHJldmlvdXNEYXRhW3ByZXZpb3VzSW5kZXhdLnBvc2l0aW9uLmlzQmVmb3JlKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRwcmV2aW91c0luZGV4Kys7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcmV2aW91c0luZGV4IDwgcHJldmlvdXNMZW4gJiYgcHJldmlvdXNEYXRhW3ByZXZpb3VzSW5kZXhdLnBvc2l0aW9uLmVxdWFscyhwb3NpdGlvbikpIHtcblx0XHRcdFx0bmV3RGF0YVtuZXdEYXRhTGVuKytdID0gcHJldmlvdXNEYXRhW3ByZXZpb3VzSW5kZXhdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGJyYWNrZXRzID0gbW9kZWwuYnJhY2tldFBhaXJzLm1hdGNoQnJhY2tldChwb3NpdGlvbiwgMjAgLyogZ2l2ZSBhdCBtb3N0IDIwbXMgdG8gY29tcHV0ZSAqLyk7XG5cdFx0XHRcdGxldCBvcHRpb25zID0gQnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5fREVDT1JBVElPTl9PUFRJT05TX1dJVEhfT1ZFUlZJRVdfUlVMRVI7XG5cdFx0XHRcdGlmICghYnJhY2tldHMgJiYgdGhpcy5fbWF0Y2hCcmFja2V0cyA9PT0gJ2Fsd2F5cycpIHtcblx0XHRcdFx0XHRicmFja2V0cyA9IG1vZGVsLmJyYWNrZXRQYWlycy5maW5kRW5jbG9zaW5nQnJhY2tldHMocG9zaXRpb24sIDIwIC8qIGdpdmUgYXQgbW9zdCAyMG1zIHRvIGNvbXB1dGUgKi8pO1xuXHRcdFx0XHRcdG9wdGlvbnMgPSBCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyLl9ERUNPUkFUSU9OX09QVElPTlNfV0lUSE9VVF9PVkVSVklFV19SVUxFUjtcblx0XHRcdFx0fVxuXHRcdFx0XHRuZXdEYXRhW25ld0RhdGFMZW4rK10gPSBuZXcgQnJhY2tldHNEYXRhKHBvc2l0aW9uLCBicmFja2V0cywgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGFzdEJyYWNrZXRzRGF0YSA9IG5ld0RhdGE7XG5cdFx0dGhpcy5fbGFzdFZlcnNpb25JZCA9IHZlcnNpb25JZDtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbihCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyLklELCBCcmFja2V0TWF0Y2hpbmdDb250cm9sbGVyLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oU2VsZWN0VG9CcmFja2V0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEp1bXBUb0JyYWNrZXRBY3Rpb24pO1xucmVnaXN0ZXJFZGl0b3JBY3Rpb24oUmVtb3ZlQnJhY2tldHNBY3Rpb24pO1xuXG4vLyBHbyB0byBtZW51XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJHb01lbnUsIHtcblx0Z3JvdXA6ICc1X2luZmlsZV9uYXYnLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmp1bXBUb0JyYWNrZXQnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaUdvVG9CcmFja2V0JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIkdvIHRvICYmQnJhY2tldFwiKVxuXHR9LFxuXHRvcmRlcjogMlxufSk7XG5cbi8vIFRoZW1pbmcgcGFydGljaXBhbnQgdG8gZW5zdXJlIGJyYWNrZXQtbWF0Y2ggY29sb3Igb3ZlcnJpZGVzIGJyYWNrZXQgcGFpciBjb2xvcml6YXRpb25cbnJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50KCh0aGVtZSwgY29sbGVjdG9yKSA9PiB7XG5cdGNvbnN0IGJyYWNrZXRNYXRjaEZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JCcmFja2V0TWF0Y2hGb3JlZ3JvdW5kKTtcblx0aWYgKGJyYWNrZXRNYXRjaEZvcmVncm91bmQpIHtcblx0XHQvLyBVc2UgaGlnaGVyIHNwZWNpZmljaXR5IHRvIG92ZXJyaWRlIGJyYWNrZXQgcGFpciBjb2xvcml6YXRpb25cblx0XHQvLyBBcHBseSBjb2xvciB0byBpbmxpbmUgY2xhc3MgdG8gYXZvaWQgbGF5b3V0IGp1bXBzXG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC5icmFja2V0LW1hdGNoLWlubGluZSB7IGNvbG9yOiAke2JyYWNrZXRNYXRjaEZvcmVncm91bmR9ICFpbXBvcnRhbnQ7IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGtCQUFrQjtBQUMzQixPQUFPO0FBRVAsU0FBUyxjQUFjLGlDQUFpQyxzQkFBc0Isa0NBQW9EO0FBQ2xJLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFnQyxtQkFBbUIsOEJBQThCO0FBQ2pGLFNBQVMsOEJBQThCO0FBQ3ZDLFlBQVksU0FBUztBQUNyQixTQUFTLFFBQVEsb0JBQW9CO0FBQ3JDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCLHdCQUF3QjtBQUM3RCxTQUFTLG9DQUFvQztBQUU3QyxNQUFNLHND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
