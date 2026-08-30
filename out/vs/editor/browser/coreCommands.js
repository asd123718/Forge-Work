import * as nls from "../../nls.js";
import { isFirefox } from "../../base/browser/browser.js";
import { KeyCode, KeyMod } from "../../base/common/keyCodes.js";
import * as types from "../../base/common/types.js";
import { status } from "../../base/browser/ui/aria/aria.js";
import { Command, EditorCommand, registerEditorCommand, UndoCommand, RedoCommand, SelectAllCommand } from "./editorExtensions.js";
import { ICodeEditorService } from "./services/codeEditorService.js";
import { ColumnSelection } from "../common/cursor/cursorColumnSelection.js";
import { CursorState, EditOperationType } from "../common/cursorCommon.js";
import { DeleteOperations } from "../common/cursor/cursorDeleteOperations.js";
import { CursorChangeReason } from "../common/cursorEvents.js";
import { CursorMove as CursorMove_, CursorMoveCommands } from "../common/cursor/cursorMoveCommands.js";
import { TypeOperations } from "../common/cursor/cursorTypeOperations.js";
import { Position } from "../common/core/position.js";
import { Range } from "../common/core/range.js";
import { Handler, ScrollType } from "../common/editorCommon.js";
import { EditorContextKeys } from "../common/editorContextKeys.js";
import { VerticalRevealType } from "../common/viewEvents.js";
import { ContextKeyExpr } from "../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight, KeybindingsRegistry } from "../../platform/keybinding/common/keybindingsRegistry.js";
import { EditorOption } from "../common/config/editorOptions.js";
import { getActiveElement, isEditableElement } from "../../base/browser/dom.js";
import { EnterOperation } from "../common/cursor/cursorTypeEditOperations.js";
import { TextEditorSelectionSource } from "../../platform/editor/common/editor.js";
const CORE_WEIGHT = KeybindingWeight.EditorCore;
class CoreEditorCommand extends EditorCommand {
  runEditorCommand(accessor, editor, args) {
    const viewModel = editor._getViewModel();
    if (!viewModel) {
      return;
    }
    this.runCoreEditorCommand(viewModel, args || {});
  }
}
var EditorScroll_;
((EditorScroll_2) => {
  const isEditorScrollArgs = function(arg) {
    if (!types.isObject(arg)) {
      return false;
    }
    const scrollArg = arg;
    if (!types.isString(scrollArg.to)) {
      return false;
    }
    if (!types.isUndefined(scrollArg.by) && !types.isString(scrollArg.by)) {
      return false;
    }
    if (!types.isUndefined(scrollArg.value) && !types.isNumber(scrollArg.value)) {
      return false;
    }
    if (!types.isUndefined(scrollArg.revealCursor) && !types.isBoolean(scrollArg.revealCursor)) {
      return false;
    }
    return true;
  };
  EditorScroll_2.metadata = {
    description: "Scroll editor in the given direction",
    args: [
      {
        name: "Editor scroll argument object",
        description: `Property-value pairs that can be passed through this argument:
					* 'to': A mandatory direction value.
						\`\`\`
						'up', 'down'
						\`\`\`
					* 'by': Unit to move. Default is computed based on 'to' value.
						\`\`\`
						'line', 'wrappedLine', 'page', 'halfPage', 'editor'
						\`\`\`
					* 'value': Number of units to move. Default is '1'.
					* 'revealCursor': If 'true' reveals the cursor if it is outside view port.
				`,
        constraint: isEditorScrollArgs,
        schema: {
          "type": "object",
          "required": ["to"],
          "properties": {
            "to": {
              "type": "string",
              "enum": ["up", "down"]
            },
            "by": {
              "type": "string",
              "enum": ["line", "wrappedLine", "page", "halfPage", "editor"]
            },
            "value": {
              "type": "number",
              "default": 1
            },
            "revealCursor": {
              "type": "boolean"
            }
          }
        }
      }
    ]
  };
  EditorScroll_2.RawDirection = {
    Up: "up",
    Right: "right",
    Down: "down",
    Left: "left"
  };
  EditorScroll_2.RawUnit = {
    Line: "line",
    WrappedLine: "wrappedLine",
    Page: "page",
    HalfPage: "halfPage",
    Editor: "editor",
    Column: "column"
  };
  function parse(args) {
    let direction;
    switch (args.to) {
      case EditorScroll_2.RawDirection.Up:
        direction = 1 /* Up */;
        break;
      case EditorScroll_2.RawDirection.Right:
        direction = 2 /* Right */;
        break;
      case EditorScroll_2.RawDirection.Down:
        direction = 3 /* Down */;
        break;
      case EditorScroll_2.RawDirection.Left:
        direction = 4 /* Left */;
        break;
      default:
        return null;
    }
    let unit;
    switch (args.by) {
      case EditorScroll_2.RawUnit.Line:
        unit = 1 /* Line */;
        break;
      case EditorScroll_2.RawUnit.WrappedLine:
        unit = 2 /* WrappedLine */;
        break;
      case EditorScroll_2.RawUnit.Page:
        unit = 3 /* Page */;
        break;
      case EditorScroll_2.RawUnit.HalfPage:
        unit = 4 /* HalfPage */;
        break;
      case EditorScroll_2.RawUnit.Editor:
        unit = 5 /* Editor */;
        break;
      case EditorScroll_2.RawUnit.Column:
        unit = 6 /* Column */;
        break;
      default:
        unit = 2 /* WrappedLine */;
    }
    const value = Math.floor(args.value || 1);
    const revealCursor = !!args.revealCursor;
    return {
      direction,
      unit,
      value,
      revealCursor,
      select: !!args.select
    };
  }
  EditorScroll_2.parse = parse;
  let Direction;
  ((Direction2) => {
    Direction2[Direction2["Up"] = 1] = "Up";
    Direction2[Direction2["Right"] = 2] = "Right";
    Direction2[Direction2["Down"] = 3] = "Down";
    Direction2[Direction2["Left"] = 4] = "Left";
  })(Direction = EditorScroll_2.Direction || (EditorScroll_2.Direction = {}));
  let Unit;
  ((Unit2) => {
    Unit2[Unit2["Line"] = 1] = "Line";
    Unit2[Unit2["WrappedLine"] = 2] = "WrappedLine";
    Unit2[Unit2["Page"] = 3] = "Page";
    Unit2[Unit2["HalfPage"] = 4] = "HalfPage";
    Unit2[Unit2["Editor"] = 5] = "Editor";
    Unit2[Unit2["Column"] = 6] = "Column";
  })(Unit = EditorScroll_2.Unit || (EditorScroll_2.Unit = {}));
})(EditorScroll_ || (EditorScroll_ = {}));
var RevealLine_;
((RevealLine_2) => {
  const isRevealLineArgs = function(arg) {
    if (!types.isObject(arg)) {
      return false;
    }
    const reveaLineArg = arg;
    if (!types.isNumber(reveaLineArg.lineNumber) && !types.isString(reveaLineArg.lineNumber)) {
      return false;
    }
    if (!types.isUndefined(reveaLineArg.at) && !types.isString(reveaLineArg.at)) {
      return false;
    }
    return true;
  };
  RevealLine_2.metadata = {
    description: "Reveal the given line at the given logical position",
    args: [
      {
        name: "Reveal line argument object",
        description: `Property-value pairs that can be passed through this argument:
					* 'lineNumber': A mandatory line number value.
					* 'at': Logical position at which line has to be revealed.
						\`\`\`
						'top', 'center', 'bottom'
						\`\`\`
				`,
        constraint: isRevealLineArgs,
        schema: {
          "type": "object",
          "required": ["lineNumber"],
          "properties": {
            "lineNumber": {
              "type": ["number", "string"]
            },
            "at": {
              "type": "string",
              "enum": ["top", "center", "bottom"]
            }
          }
        }
      }
    ]
  };
  RevealLine_2.RawAtArgument = {
    Top: "top",
    Center: "center",
    Bottom: "bottom"
  };
})(RevealLine_ || (RevealLine_ = {}));
class EditorOrNativeTextInputCommand {
  constructor(target) {
    target.addImplementation(1e4, "code-editor", (accessor, args) => {
      const focusedEditor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
      if (focusedEditor && focusedEditor.hasTextFocus()) {
        return this._runEditorCommand(accessor, focusedEditor, args);
      }
      return false;
    });
    target.addImplementation(1e3, "generic-dom-input-textarea", (accessor, args) => {
      const activeElement = getActiveElement();
      if (activeElement && isEditableElement(activeElement)) {
        this.runDOMCommand(activeElement);
        return true;
      }
      return false;
    });
    target.addImplementation(0, "generic-dom", (accessor, args) => {
      const activeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor();
      if (activeEditor) {
        activeEditor.focus();
        return this._runEditorCommand(accessor, activeEditor, args);
      }
      return false;
    });
  }
  _runEditorCommand(accessor, editor, args) {
    const result = this.runEditorCommand(accessor, editor, args);
    if (result) {
      return result;
    }
    return true;
  }
}
var NavigationCommandRevealType = /* @__PURE__ */ ((NavigationCommandRevealType2) => {
  NavigationCommandRevealType2[NavigationCommandRevealType2["Regular"] = 0] = "Regular";
  NavigationCommandRevealType2[NavigationCommandRevealType2["Minimal"] = 1] = "Minimal";
  NavigationCommandRevealType2[NavigationCommandRevealType2["None"] = 2] = "None";
  return NavigationCommandRevealType2;
})(NavigationCommandRevealType || {});
var CoreNavigationCommands;
((CoreNavigationCommands2) => {
  class BaseMoveToCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.position) {
        return;
      }
      viewModel.model.pushStackElement();
      const cursorStateChanged = viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        [
          CursorMoveCommands.moveTo(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position, args.viewPosition)
        ]
      );
      if (cursorStateChanged && args.revealType !== 2 /* None */) {
        viewModel.revealAllCursors(args.source, true, true);
      }
    }
  }
  CoreNavigationCommands2.MoveTo = registerEditorCommand(new BaseMoveToCommand({
    id: "_moveTo",
    inSelectionMode: false,
    precondition: void 0
  }));
  CoreNavigationCommands2.MoveToSelect = registerEditorCommand(new BaseMoveToCommand({
    id: "_moveToSelect",
    inSelectionMode: true,
    precondition: void 0
  }));
  class ColumnSelectCommand extends CoreEditorCommand {
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      const result = this._getColumnSelectResult(viewModel, viewModel.getPrimaryCursorState(), viewModel.getCursorColumnSelectData(), args);
      if (result === null) {
        return;
      }
      viewModel.setCursorStates(args.source, CursorChangeReason.Explicit, result.viewStates.map((viewState) => CursorState.fromViewState(viewState)));
      viewModel.setCursorColumnSelectData({
        isReal: true,
        fromViewLineNumber: result.fromLineNumber,
        fromViewVisualColumn: result.fromVisualColumn,
        toViewLineNumber: result.toLineNumber,
        toViewVisualColumn: result.toVisualColumn
      });
      if (result.reversed) {
        viewModel.revealTopMostCursor(args.source);
      } else {
        viewModel.revealBottomMostCursor(args.source);
      }
    }
  }
  CoreNavigationCommands2.ColumnSelect = registerEditorCommand(new class extends ColumnSelectCommand {
    constructor() {
      super({
        id: "columnSelect",
        precondition: void 0
      });
    }
    _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
      if (typeof args.position === "undefined" || typeof args.viewPosition === "undefined" || typeof args.mouseColumn === "undefined") {
        return null;
      }
      const validatedPosition = viewModel.model.validatePosition(args.position);
      const validatedViewPosition = viewModel.coordinatesConverter.validateViewPosition(new Position(args.viewPosition.lineNumber, args.viewPosition.column), validatedPosition);
      const fromViewLineNumber = args.doColumnSelect ? prevColumnSelectData.fromViewLineNumber : validatedViewPosition.lineNumber;
      const fromViewVisualColumn = args.doColumnSelect ? prevColumnSelectData.fromViewVisualColumn : args.mouseColumn - 1;
      return ColumnSelection.columnSelect(viewModel.cursorConfig, viewModel, fromViewLineNumber, fromViewVisualColumn, validatedViewPosition.lineNumber, args.mouseColumn - 1);
    }
  }());
  CoreNavigationCommands2.CursorColumnSelectLeft = registerEditorCommand(new class extends ColumnSelectCommand {
    constructor() {
      super({
        id: "cursorColumnSelectLeft",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.LeftArrow,
          linux: { primary: 0 }
        }
      });
    }
    _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
      return ColumnSelection.columnSelectLeft(viewModel.cursorConfig, viewModel, prevColumnSelectData);
    }
  }());
  CoreNavigationCommands2.CursorColumnSelectRight = registerEditorCommand(new class extends ColumnSelectCommand {
    constructor() {
      super({
        id: "cursorColumnSelectRight",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.RightArrow,
          linux: { primary: 0 }
        }
      });
    }
    _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
      return ColumnSelection.columnSelectRight(viewModel.cursorConfig, viewModel, prevColumnSelectData);
    }
  }());
  class ColumnSelectUpCommand extends ColumnSelectCommand {
    constructor(opts) {
      super(opts);
      this._isPaged = opts.isPaged;
    }
    _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
      return ColumnSelection.columnSelectUp(viewModel.cursorConfig, viewModel, prevColumnSelectData, this._isPaged);
    }
  }
  CoreNavigationCommands2.CursorColumnSelectUp = registerEditorCommand(new ColumnSelectUpCommand({
    isPaged: false,
    id: "cursorColumnSelectUp",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
      linux: { primary: 0 }
    }
  }));
  CoreNavigationCommands2.CursorColumnSelectPageUp = registerEditorCommand(new ColumnSelectUpCommand({
    isPaged: true,
    id: "cursorColumnSelectPageUp",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageUp,
      linux: { primary: 0 }
    }
  }));
  class ColumnSelectDownCommand extends ColumnSelectCommand {
    constructor(opts) {
      super(opts);
      this._isPaged = opts.isPaged;
    }
    _getColumnSelectResult(viewModel, primary, prevColumnSelectData, args) {
      return ColumnSelection.columnSelectDown(viewModel.cursorConfig, viewModel, prevColumnSelectData, this._isPaged);
    }
  }
  CoreNavigationCommands2.CursorColumnSelectDown = registerEditorCommand(new ColumnSelectDownCommand({
    isPaged: false,
    id: "cursorColumnSelectDown",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
      linux: { primary: 0 }
    }
  }));
  CoreNavigationCommands2.CursorColumnSelectPageDown = registerEditorCommand(new ColumnSelectDownCommand({
    isPaged: true,
    id: "cursorColumnSelectPageDown",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.PageDown,
      linux: { primary: 0 }
    }
  }));
  class CursorMoveImpl extends CoreEditorCommand {
    constructor() {
      super({
        id: "cursorMove",
        precondition: void 0,
        metadata: CursorMove_.metadata
      });
    }
    runCoreEditorCommand(viewModel, args) {
      const parsed = CursorMove_.parse(args);
      if (!parsed) {
        return;
      }
      this._runCursorMove(viewModel, args.source, parsed);
    }
    _runCursorMove(viewModel, source, args) {
      const effectiveSource = args.noHistory ? TextEditorSelectionSource.PROGRAMMATIC : source;
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        effectiveSource,
        CursorChangeReason.Explicit,
        CursorMoveImpl._move(viewModel, viewModel.getCursorStates(), args)
      );
      viewModel.revealAllCursors(effectiveSource, true);
    }
    static _move(viewModel, cursors, args) {
      const inSelectionMode = args.select;
      const value = args.value;
      switch (args.direction) {
        case CursorMove_.Direction.Left:
        case CursorMove_.Direction.Right:
        case CursorMove_.Direction.Up:
        case CursorMove_.Direction.Down:
        case CursorMove_.Direction.PrevBlankLine:
        case CursorMove_.Direction.NextBlankLine:
        case CursorMove_.Direction.WrappedLineStart:
        case CursorMove_.Direction.WrappedLineFirstNonWhitespaceCharacter:
        case CursorMove_.Direction.WrappedLineColumnCenter:
        case CursorMove_.Direction.WrappedLineEnd:
        case CursorMove_.Direction.WrappedLineLastNonWhitespaceCharacter:
          return CursorMoveCommands.simpleMove(viewModel, cursors, args.direction, inSelectionMode, value, args.unit);
        case CursorMove_.Direction.ViewPortTop:
        case CursorMove_.Direction.ViewPortBottom:
        case CursorMove_.Direction.ViewPortCenter:
        case CursorMove_.Direction.ViewPortIfOutside:
          return CursorMoveCommands.viewportMove(viewModel, cursors, args.direction, inSelectionMode, value);
        default:
          return null;
      }
    }
  }
  CoreNavigationCommands2.CursorMoveImpl = CursorMoveImpl;
  CoreNavigationCommands2.CursorMove = registerEditorCommand(new CursorMoveImpl());
  let Constants;
  ((Constants2) => {
    Constants2[Constants2["PAGE_SIZE_MARKER"] = -1] = "PAGE_SIZE_MARKER";
  })(Constants || (Constants = {}));
  class CursorMoveBasedCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._staticArgs = opts.args;
    }
    runCoreEditorCommand(viewModel, dynamicArgs) {
      let args = this._staticArgs;
      if (this._staticArgs.value === -1 /* PAGE_SIZE_MARKER */) {
        args = {
          direction: this._staticArgs.direction,
          unit: this._staticArgs.unit,
          select: this._staticArgs.select,
          value: dynamicArgs.pageSize || viewModel.cursorConfig.pageSize
        };
      }
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        dynamicArgs.source,
        CursorChangeReason.Explicit,
        CursorMoveCommands.simpleMove(viewModel, viewModel.getCursorStates(), args.direction, args.select, args.value, args.unit)
      );
      viewModel.revealAllCursors(dynamicArgs.source, true);
    }
  }
  CoreNavigationCommands2.CursorLeft = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Left,
      unit: CursorMove_.Unit.None,
      select: false,
      value: 1
    },
    id: "cursorLeft",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.LeftArrow,
      mac: { primary: KeyCode.LeftArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyB] }
    }
  }));
  CoreNavigationCommands2.CursorLeftSelect = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Left,
      unit: CursorMove_.Unit.None,
      select: true,
      value: 1
    },
    id: "cursorLeftSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.LeftArrow
    }
  }));
  CoreNavigationCommands2.CursorRight = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Right,
      unit: CursorMove_.Unit.None,
      select: false,
      value: 1
    },
    id: "cursorRight",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.RightArrow,
      mac: { primary: KeyCode.RightArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyF] }
    }
  }));
  CoreNavigationCommands2.CursorRightSelect = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Right,
      unit: CursorMove_.Unit.None,
      select: true,
      value: 1
    },
    id: "cursorRightSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.RightArrow
    }
  }));
  CoreNavigationCommands2.CursorUp = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Up,
      unit: CursorMove_.Unit.WrappedLine,
      select: false,
      value: 1
    },
    id: "cursorUp",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.UpArrow,
      mac: { primary: KeyCode.UpArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyP] }
    }
  }));
  CoreNavigationCommands2.CursorUpSelect = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Up,
      unit: CursorMove_.Unit.WrappedLine,
      select: true,
      value: 1
    },
    id: "cursorUpSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.UpArrow,
      secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow],
      mac: { primary: KeyMod.Shift | KeyCode.UpArrow },
      linux: { primary: KeyMod.Shift | KeyCode.UpArrow }
    }
  }));
  CoreNavigationCommands2.CursorPageUp = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Up,
      unit: CursorMove_.Unit.WrappedLine,
      select: false,
      value: -1 /* PAGE_SIZE_MARKER */
    },
    id: "cursorPageUp",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.PageUp
    }
  }));
  CoreNavigationCommands2.CursorPageUpSelect = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Up,
      unit: CursorMove_.Unit.WrappedLine,
      select: true,
      value: -1 /* PAGE_SIZE_MARKER */
    },
    id: "cursorPageUpSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.PageUp
    }
  }));
  CoreNavigationCommands2.CursorDown = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Down,
      unit: CursorMove_.Unit.WrappedLine,
      select: false,
      value: 1
    },
    id: "cursorDown",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.DownArrow,
      mac: { primary: KeyCode.DownArrow, secondary: [KeyMod.WinCtrl | KeyCode.KeyN] }
    }
  }));
  CoreNavigationCommands2.CursorDownSelect = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Down,
      unit: CursorMove_.Unit.WrappedLine,
      select: true,
      value: 1
    },
    id: "cursorDownSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.DownArrow,
      secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow],
      mac: { primary: KeyMod.Shift | KeyCode.DownArrow },
      linux: { primary: KeyMod.Shift | KeyCode.DownArrow }
    }
  }));
  CoreNavigationCommands2.CursorPageDown = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Down,
      unit: CursorMove_.Unit.WrappedLine,
      select: false,
      value: -1 /* PAGE_SIZE_MARKER */
    },
    id: "cursorPageDown",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.PageDown
    }
  }));
  CoreNavigationCommands2.CursorPageDownSelect = registerEditorCommand(new CursorMoveBasedCommand({
    args: {
      direction: CursorMove_.Direction.Down,
      unit: CursorMove_.Unit.WrappedLine,
      select: true,
      value: -1 /* PAGE_SIZE_MARKER */
    },
    id: "cursorPageDownSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.PageDown
    }
  }));
  CoreNavigationCommands2.CreateCursor = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "createCursor",
        precondition: void 0
      });
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.position) {
        return;
      }
      let newState;
      if (args.wholeLine) {
        newState = CursorMoveCommands.line(viewModel, viewModel.getPrimaryCursorState(), false, args.position, args.viewPosition);
      } else {
        newState = CursorMoveCommands.moveTo(viewModel, viewModel.getPrimaryCursorState(), false, args.position, args.viewPosition);
      }
      const states = viewModel.getCursorStates();
      if (states.length > 1) {
        const newModelPosition = newState.modelState ? newState.modelState.position : null;
        const newViewPosition = newState.viewState ? newState.viewState.position : null;
        for (let i = 0, len = states.length; i < len; i++) {
          const state = states[i];
          if (newModelPosition && !state.modelState.selection.containsPosition(newModelPosition)) {
            continue;
          }
          if (newViewPosition && !state.viewState.selection.containsPosition(newViewPosition)) {
            continue;
          }
          states.splice(i, 1);
          viewModel.model.pushStackElement();
          viewModel.setCursorStates(
            args.source,
            CursorChangeReason.Explicit,
            states
          );
          return;
        }
      }
      states.push(newState);
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        states
      );
    }
  }());
  CoreNavigationCommands2.LastCursorMoveToSelect = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "_lastCursorMoveToSelect",
        precondition: void 0
      });
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.position) {
        return;
      }
      const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();
      const states = viewModel.getCursorStates();
      const newStates = states.slice(0);
      newStates[lastAddedCursorIndex] = CursorMoveCommands.moveTo(viewModel, states[lastAddedCursorIndex], true, args.position, args.viewPosition);
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        newStates
      );
    }
  }());
  class HomeCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        CursorMoveCommands.moveToBeginningOfLine(viewModel, viewModel.getCursorStates(), this._inSelectionMode)
      );
      viewModel.revealAllCursors(args.source, true);
    }
  }
  CoreNavigationCommands2.CursorHome = registerEditorCommand(new HomeCommand({
    inSelectionMode: false,
    id: "cursorHome",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.Home,
      mac: { primary: KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow] }
    }
  }));
  CoreNavigationCommands2.CursorHomeSelect = registerEditorCommand(new HomeCommand({
    inSelectionMode: true,
    id: "cursorHomeSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.Home,
      mac: { primary: KeyMod.Shift | KeyCode.Home, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.LeftArrow] }
    }
  }));
  class LineStartCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        this._exec(viewModel.getCursorStates())
      );
      viewModel.revealAllCursors(args.source, true);
    }
    _exec(cursors) {
      const result = [];
      for (let i = 0, len = cursors.length; i < len; i++) {
        const cursor = cursors[i];
        const lineNumber = cursor.modelState.position.lineNumber;
        result[i] = CursorState.fromModelState(cursor.modelState.move(this._inSelectionMode, lineNumber, 1, 0));
      }
      return result;
    }
  }
  CoreNavigationCommands2.CursorLineStart = registerEditorCommand(new LineStartCommand({
    inSelectionMode: false,
    id: "cursorLineStart",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: 0,
      mac: { primary: KeyMod.WinCtrl | KeyCode.KeyA }
    }
  }));
  CoreNavigationCommands2.CursorLineStartSelect = registerEditorCommand(new LineStartCommand({
    inSelectionMode: true,
    id: "cursorLineStartSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: 0,
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyA }
    }
  }));
  class EndCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        CursorMoveCommands.moveToEndOfLine(viewModel, viewModel.getCursorStates(), this._inSelectionMode, args.sticky || false)
      );
      viewModel.revealAllCursors(args.source, true);
    }
  }
  CoreNavigationCommands2.CursorEnd = registerEditorCommand(new EndCommand({
    inSelectionMode: false,
    id: "cursorEnd",
    precondition: void 0,
    kbOpts: {
      args: { sticky: false },
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyCode.End,
      mac: { primary: KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow] }
    },
    metadata: {
      description: `Go to End`,
      args: [{
        name: "args",
        schema: {
          type: "object",
          properties: {
            "sticky": {
              description: nls.localize("stickydesc", "Stick to the end even when going to longer lines"),
              type: "boolean",
              default: false
            }
          }
        }
      }]
    }
  }));
  CoreNavigationCommands2.CursorEndSelect = registerEditorCommand(new EndCommand({
    inSelectionMode: true,
    id: "cursorEndSelect",
    precondition: void 0,
    kbOpts: {
      args: { sticky: false },
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.Shift | KeyCode.End,
      mac: { primary: KeyMod.Shift | KeyCode.End, secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.RightArrow] }
    },
    metadata: {
      description: `Select to End`,
      args: [{
        name: "args",
        schema: {
          type: "object",
          properties: {
            "sticky": {
              description: nls.localize("stickydesc", "Stick to the end even when going to longer lines"),
              type: "boolean",
              default: false
            }
          }
        }
      }]
    }
  }));
  class LineEndCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        this._exec(viewModel, viewModel.getCursorStates())
      );
      viewModel.revealAllCursors(args.source, true);
    }
    _exec(viewModel, cursors) {
      const result = [];
      for (let i = 0, len = cursors.length; i < len; i++) {
        const cursor = cursors[i];
        const lineNumber = cursor.modelState.position.lineNumber;
        const maxColumn = viewModel.model.getLineMaxColumn(lineNumber);
        result[i] = CursorState.fromModelState(cursor.modelState.move(this._inSelectionMode, lineNumber, maxColumn, 0));
      }
      return result;
    }
  }
  CoreNavigationCommands2.CursorLineEnd = registerEditorCommand(new LineEndCommand({
    inSelectionMode: false,
    id: "cursorLineEnd",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: 0,
      mac: { primary: KeyMod.WinCtrl | KeyCode.KeyE }
    }
  }));
  CoreNavigationCommands2.CursorLineEndSelect = registerEditorCommand(new LineEndCommand({
    inSelectionMode: true,
    id: "cursorLineEndSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: 0,
      mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyE }
    }
  }));
  class TopCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        CursorMoveCommands.moveToBeginningOfBuffer(viewModel, viewModel.getCursorStates(), this._inSelectionMode)
      );
      viewModel.revealAllCursors(args.source, true);
    }
  }
  CoreNavigationCommands2.CursorTop = registerEditorCommand(new TopCommand({
    inSelectionMode: false,
    id: "cursorTop",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyCode.Home,
      mac: { primary: KeyMod.CtrlCmd | KeyCode.UpArrow }
    }
  }));
  CoreNavigationCommands2.CursorTopSelect = registerEditorCommand(new TopCommand({
    inSelectionMode: true,
    id: "cursorTopSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Home,
      mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow }
    }
  }));
  class BottomCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        CursorMoveCommands.moveToEndOfBuffer(viewModel, viewModel.getCursorStates(), this._inSelectionMode)
      );
      viewModel.revealAllCursors(args.source, true);
    }
  }
  CoreNavigationCommands2.CursorBottom = registerEditorCommand(new BottomCommand({
    inSelectionMode: false,
    id: "cursorBottom",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyCode.End,
      mac: { primary: KeyMod.CtrlCmd | KeyCode.DownArrow }
    }
  }));
  CoreNavigationCommands2.CursorBottomSelect = registerEditorCommand(new BottomCommand({
    inSelectionMode: true,
    id: "cursorBottomSelect",
    precondition: void 0,
    kbOpts: {
      weight: CORE_WEIGHT,
      kbExpr: EditorContextKeys.textInputFocus,
      primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.End,
      mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.DownArrow }
    }
  }));
  class EditorScrollImpl extends CoreEditorCommand {
    constructor() {
      super({
        id: "editorScroll",
        precondition: void 0,
        metadata: EditorScroll_.metadata
      });
    }
    determineScrollMethod(args) {
      const horizontalUnits = [6 /* Column */];
      const verticalUnits = [
        1 /* Line */,
        2 /* WrappedLine */,
        3 /* Page */,
        4 /* HalfPage */,
        5 /* Editor */
      ];
      const horizontalDirections = [4 /* Left */, 2 /* Right */];
      const verticalDirections = [1 /* Up */, 3 /* Down */];
      if (horizontalUnits.includes(args.unit) && horizontalDirections.includes(args.direction)) {
        return this._runHorizontalEditorScroll.bind(this);
      }
      if (verticalUnits.includes(args.unit) && verticalDirections.includes(args.direction)) {
        return this._runVerticalEditorScroll.bind(this);
      }
      return null;
    }
    runCoreEditorCommand(viewModel, args) {
      const parsed = EditorScroll_.parse(args);
      if (!parsed) {
        return;
      }
      const runEditorScroll = this.determineScrollMethod(parsed);
      if (!runEditorScroll) {
        return;
      }
      runEditorScroll(viewModel, args.source, parsed);
    }
    _runVerticalEditorScroll(viewModel, source, args) {
      const desiredScrollTop = this._computeDesiredScrollTop(viewModel, args);
      if (args.revealCursor) {
        const desiredVisibleViewRange = viewModel.getCompletelyVisibleViewRangeAtScrollTop(desiredScrollTop);
        const paddedRange = viewModel.getViewRangeWithCursorPadding(desiredVisibleViewRange);
        viewModel.setCursorStates(
          source,
          CursorChangeReason.Explicit,
          [
            CursorMoveCommands.findPositionInViewportIfOutside(viewModel, viewModel.getPrimaryCursorState(), paddedRange, args.select)
          ]
        );
      }
      viewModel.viewLayout.setScrollPosition({ scrollTop: desiredScrollTop }, ScrollType.Smooth);
    }
    _computeDesiredScrollTop(viewModel, args) {
      if (args.unit === 1 /* Line */) {
        const futureViewport = viewModel.viewLayout.getFutureViewport();
        const visibleViewRange = viewModel.getCompletelyVisibleViewRangeAtScrollTop(futureViewport.top);
        const visibleModelRange = viewModel.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
        let desiredTopModelLineNumber;
        if (args.direction === 1 /* Up */) {
          desiredTopModelLineNumber = Math.max(1, visibleModelRange.startLineNumber - args.value);
        } else {
          desiredTopModelLineNumber = Math.min(viewModel.model.getLineCount(), visibleModelRange.startLineNumber + args.value);
        }
        const viewPosition = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(desiredTopModelLineNumber, 1));
        return viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
      }
      if (args.unit === 5 /* Editor */) {
        let desiredTopModelLineNumber = 0;
        if (args.direction === 3 /* Down */) {
          desiredTopModelLineNumber = viewModel.model.getLineCount() - viewModel.cursorConfig.pageSize;
        }
        return viewModel.viewLayout.getVerticalOffsetForLineNumber(desiredTopModelLineNumber);
      }
      let noOfLines;
      if (args.unit === 3 /* Page */) {
        noOfLines = viewModel.cursorConfig.pageSize * args.value;
      } else if (args.unit === 4 /* HalfPage */) {
        noOfLines = Math.round(viewModel.cursorConfig.pageSize / 2) * args.value;
      } else {
        noOfLines = args.value;
      }
      const deltaLines = (args.direction === 1 /* Up */ ? -1 : 1) * noOfLines;
      return viewModel.viewLayout.getCurrentScrollTop() + deltaLines * viewModel.cursorConfig.lineHeight;
    }
    _runHorizontalEditorScroll(viewModel, source, args) {
      const desiredScrollLeft = this._computeDesiredScrollLeft(viewModel, args);
      viewModel.viewLayout.setScrollPosition({ scrollLeft: desiredScrollLeft }, ScrollType.Smooth);
    }
    _computeDesiredScrollLeft(viewModel, args) {
      const deltaColumns = (args.direction === 4 /* Left */ ? -1 : 1) * args.value;
      return viewModel.viewLayout.getCurrentScrollLeft() + deltaColumns * viewModel.cursorConfig.typicalHalfwidthCharacterWidth;
    }
  }
  CoreNavigationCommands2.EditorScrollImpl = EditorScrollImpl;
  CoreNavigationCommands2.EditorScroll = registerEditorCommand(new EditorScrollImpl());
  CoreNavigationCommands2.ScrollLineUp = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollLineUp",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
          mac: { primary: KeyMod.WinCtrl | KeyCode.PageUp }
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Up,
        by: EditorScroll_.RawUnit.WrappedLine,
        value: 1,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  CoreNavigationCommands2.ScrollPageUp = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollPageUp",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyMod.CtrlCmd | KeyCode.PageUp,
          win: { primary: KeyMod.Alt | KeyCode.PageUp },
          linux: { primary: KeyMod.Alt | KeyCode.PageUp }
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Up,
        by: EditorScroll_.RawUnit.Page,
        value: 1,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  CoreNavigationCommands2.ScrollEditorTop = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollEditorTop",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Up,
        by: EditorScroll_.RawUnit.Editor,
        value: 1,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  CoreNavigationCommands2.ScrollLineDown = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollLineDown",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
          mac: { primary: KeyMod.WinCtrl | KeyCode.PageDown }
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Down,
        by: EditorScroll_.RawUnit.WrappedLine,
        value: 1,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  CoreNavigationCommands2.ScrollPageDown = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollPageDown",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyMod.CtrlCmd | KeyCode.PageDown,
          win: { primary: KeyMod.Alt | KeyCode.PageDown },
          linux: { primary: KeyMod.Alt | KeyCode.PageDown }
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Down,
        by: EditorScroll_.RawUnit.Page,
        value: 1,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  CoreNavigationCommands2.ScrollEditorBottom = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollEditorBottom",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Down,
        by: EditorScroll_.RawUnit.Editor,
        value: 1,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  CoreNavigationCommands2.ScrollLeft = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollLeft",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Left,
        by: EditorScroll_.RawUnit.Column,
        value: 2,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  CoreNavigationCommands2.ScrollRight = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "scrollRight",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      CoreNavigationCommands2.EditorScroll.runCoreEditorCommand(viewModel, {
        to: EditorScroll_.RawDirection.Right,
        by: EditorScroll_.RawUnit.Column,
        value: 2,
        revealCursor: false,
        select: false,
        source: args.source
      });
    }
  }());
  class WordCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.position) {
        return;
      }
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        [
          CursorMoveCommands.word(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position)
        ]
      );
      if (args.revealType !== 2 /* None */) {
        viewModel.revealAllCursors(args.source, true, true);
      }
    }
  }
  CoreNavigationCommands2.WordSelect = registerEditorCommand(new WordCommand({
    inSelectionMode: false,
    id: "_wordSelect",
    precondition: void 0
  }));
  CoreNavigationCommands2.WordSelectDrag = registerEditorCommand(new WordCommand({
    inSelectionMode: true,
    id: "_wordSelectDrag",
    precondition: void 0
  }));
  CoreNavigationCommands2.LastCursorWordSelect = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "lastCursorWordSelect",
        precondition: void 0
      });
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.position) {
        return;
      }
      const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();
      const states = viewModel.getCursorStates();
      const newStates = states.slice(0);
      const lastAddedState = states[lastAddedCursorIndex];
      newStates[lastAddedCursorIndex] = CursorMoveCommands.word(viewModel, lastAddedState, lastAddedState.modelState.hasSelection(), args.position);
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        newStates
      );
    }
  }());
  class LineCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.position) {
        return;
      }
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        [
          CursorMoveCommands.line(viewModel, viewModel.getPrimaryCursorState(), this._inSelectionMode, args.position, args.viewPosition)
        ]
      );
      if (args.revealType !== 2 /* None */) {
        viewModel.revealAllCursors(args.source, false, true);
      }
    }
  }
  CoreNavigationCommands2.LineSelect = registerEditorCommand(new LineCommand({
    inSelectionMode: false,
    id: "_lineSelect",
    precondition: void 0
  }));
  CoreNavigationCommands2.LineSelectDrag = registerEditorCommand(new LineCommand({
    inSelectionMode: true,
    id: "_lineSelectDrag",
    precondition: void 0
  }));
  class LastCursorLineCommand extends CoreEditorCommand {
    constructor(opts) {
      super(opts);
      this._inSelectionMode = opts.inSelectionMode;
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.position) {
        return;
      }
      const lastAddedCursorIndex = viewModel.getLastAddedCursorIndex();
      const states = viewModel.getCursorStates();
      const newStates = states.slice(0);
      newStates[lastAddedCursorIndex] = CursorMoveCommands.line(viewModel, states[lastAddedCursorIndex], this._inSelectionMode, args.position, args.viewPosition);
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        newStates
      );
    }
  }
  CoreNavigationCommands2.LastCursorLineSelect = registerEditorCommand(new LastCursorLineCommand({
    inSelectionMode: false,
    id: "lastCursorLineSelect",
    precondition: void 0
  }));
  CoreNavigationCommands2.LastCursorLineSelectDrag = registerEditorCommand(new LastCursorLineCommand({
    inSelectionMode: true,
    id: "lastCursorLineSelectDrag",
    precondition: void 0
  }));
  CoreNavigationCommands2.CancelSelection = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "cancelSelection",
        precondition: EditorContextKeys.hasNonEmptySelection,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyCode.Escape,
          secondary: [KeyMod.Shift | KeyCode.Escape]
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        [
          CursorMoveCommands.cancelSelection(viewModel, viewModel.getPrimaryCursorState())
        ]
      );
      viewModel.revealAllCursors(args.source, true);
    }
  }());
  CoreNavigationCommands2.RemoveSecondaryCursors = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "removeSecondaryCursors",
        precondition: EditorContextKeys.hasMultipleSelections,
        kbOpts: {
          weight: CORE_WEIGHT + 1,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyCode.Escape,
          secondary: [KeyMod.Shift | KeyCode.Escape]
        }
      });
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        [
          viewModel.getPrimaryCursorState()
        ]
      );
      viewModel.revealAllCursors(args.source, true);
      status(nls.localize("removedCursor", "Removed secondary cursors"));
    }
  }());
  CoreNavigationCommands2.RevealLine = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "revealLine",
        precondition: void 0,
        metadata: RevealLine_.metadata
      });
    }
    runCoreEditorCommand(viewModel, args) {
      const revealLineArg = args;
      const lineNumberArg = revealLineArg.lineNumber || 0;
      let lineNumber = typeof lineNumberArg === "number" ? lineNumberArg + 1 : parseInt(lineNumberArg) + 1;
      if (lineNumber < 1) {
        lineNumber = 1;
      }
      const lineCount = viewModel.model.getLineCount();
      if (lineNumber > lineCount) {
        lineNumber = lineCount;
      }
      const range = new Range(
        lineNumber,
        1,
        lineNumber,
        viewModel.model.getLineMaxColumn(lineNumber)
      );
      let revealAt = VerticalRevealType.Simple;
      if (revealLineArg.at) {
        switch (revealLineArg.at) {
          case RevealLine_.RawAtArgument.Top:
            revealAt = VerticalRevealType.Top;
            break;
          case RevealLine_.RawAtArgument.Center:
            revealAt = VerticalRevealType.Center;
            break;
          case RevealLine_.RawAtArgument.Bottom:
            revealAt = VerticalRevealType.Bottom;
            break;
          default:
            break;
        }
      }
      const viewRange = viewModel.coordinatesConverter.convertModelRangeToViewRange(range);
      viewModel.revealRange(args.source, false, viewRange, revealAt, ScrollType.Smooth);
    }
  }());
  CoreNavigationCommands2.SelectAll = new class extends EditorOrNativeTextInputCommand {
    constructor() {
      super(SelectAllCommand);
    }
    runDOMCommand(activeElement) {
      if (isFirefox) {
        activeElement.focus();
        activeElement.select();
      }
      activeElement.ownerDocument.execCommand("selectAll");
    }
    runEditorCommand(accessor, editor, args) {
      const viewModel = editor._getViewModel();
      if (!viewModel) {
        return;
      }
      this.runCoreEditorCommand(viewModel, args);
    }
    runCoreEditorCommand(viewModel, args) {
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        "keyboard",
        CursorChangeReason.Explicit,
        [
          CursorMoveCommands.selectAll(viewModel, viewModel.getPrimaryCursorState())
        ]
      );
    }
  }();
  CoreNavigationCommands2.SetSelection = registerEditorCommand(new class extends CoreEditorCommand {
    constructor() {
      super({
        id: "setSelection",
        precondition: void 0
      });
    }
    runCoreEditorCommand(viewModel, args) {
      if (!args.selection) {
        return;
      }
      viewModel.model.pushStackElement();
      viewModel.setCursorStates(
        args.source,
        CursorChangeReason.Explicit,
        [
          CursorState.fromModelSelection(args.selection)
        ]
      );
    }
  }());
})(CoreNavigationCommands || (CoreNavigationCommands = {}));
const columnSelectionCondition = ContextKeyExpr.and(
  EditorContextKeys.textInputFocus,
  EditorContextKeys.columnSelection
);
function registerColumnSelection(id, keybinding) {
  KeybindingsRegistry.registerKeybindingRule({
    id,
    primary: keybinding,
    when: columnSelectionCondition,
    weight: CORE_WEIGHT + 1
  });
}
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectLeft.id, KeyMod.Shift | KeyCode.LeftArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectRight.id, KeyMod.Shift | KeyCode.RightArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectUp.id, KeyMod.Shift | KeyCode.UpArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectPageUp.id, KeyMod.Shift | KeyCode.PageUp);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectDown.id, KeyMod.Shift | KeyCode.DownArrow);
registerColumnSelection(CoreNavigationCommands.CursorColumnSelectPageDown.id, KeyMod.Shift | KeyCode.PageDown);
function registerCommand(command) {
  command.register();
  return command;
}
var CoreEditingCommands;
((CoreEditingCommands2) => {
  class CoreEditingCommand extends EditorCommand {
    runEditorCommand(accessor, editor, args) {
      const viewModel = editor._getViewModel();
      if (!viewModel) {
        return;
      }
      this.runCoreEditingCommand(editor, viewModel, args || {});
    }
  }
  CoreEditingCommands2.CoreEditingCommand = CoreEditingCommand;
  CoreEditingCommands2.LineBreakInsert = registerEditorCommand(new class extends CoreEditingCommand {
    constructor() {
      super({
        id: "lineBreakInsert",
        precondition: EditorContextKeys.writable,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: 0,
          mac: { primary: KeyMod.WinCtrl | KeyCode.KeyO }
        }
      });
    }
    runCoreEditingCommand(editor, viewModel, args) {
      editor.pushUndoStop();
      editor.executeCommands(this.id, EnterOperation.lineBreakInsert(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map((s) => s.modelState.selection)));
    }
  }());
  CoreEditingCommands2.Outdent = registerEditorCommand(new class extends CoreEditingCommand {
    constructor() {
      super({
        id: "outdent",
        precondition: EditorContextKeys.writable,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: ContextKeyExpr.and(
            EditorContextKeys.editorTextFocus,
            EditorContextKeys.tabDoesNotMoveFocus
          ),
          primary: KeyMod.Shift | KeyCode.Tab
        }
      });
    }
    runCoreEditingCommand(editor, viewModel, args) {
      editor.pushUndoStop();
      editor.executeCommands(this.id, TypeOperations.outdent(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map((s) => s.modelState.selection)));
      editor.pushUndoStop();
    }
  }());
  CoreEditingCommands2.Tab = registerEditorCommand(new class extends CoreEditingCommand {
    constructor() {
      super({
        id: "tab",
        precondition: EditorContextKeys.writable,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: ContextKeyExpr.and(
            EditorContextKeys.editorTextFocus,
            EditorContextKeys.tabDoesNotMoveFocus
          ),
          primary: KeyCode.Tab
        }
      });
    }
    runCoreEditingCommand(editor, viewModel, args) {
      editor.pushUndoStop();
      editor.executeCommands(this.id, TypeOperations.tab(viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map((s) => s.modelState.selection)));
      editor.pushUndoStop();
    }
  }());
  CoreEditingCommands2.DeleteLeft = registerEditorCommand(new class extends CoreEditingCommand {
    constructor() {
      super({
        id: "deleteLeft",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyCode.Backspace,
          secondary: [KeyMod.Shift | KeyCode.Backspace],
          mac: { primary: KeyCode.Backspace, secondary: [KeyMod.Shift | KeyCode.Backspace, KeyMod.WinCtrl | KeyCode.KeyH, KeyMod.WinCtrl | KeyCode.Backspace] }
        }
      });
    }
    runCoreEditingCommand(editor, viewModel, args) {
      const [shouldPushStackElementBefore, commands] = DeleteOperations.deleteLeft(viewModel.getPrevEditOperationType(), viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map((s) => s.modelState.selection), viewModel.getCursorAutoClosedCharacters());
      if (shouldPushStackElementBefore) {
        editor.pushUndoStop();
      }
      editor.executeCommands(this.id, commands);
      viewModel.setPrevEditOperationType(EditOperationType.DeletingLeft);
    }
  }());
  CoreEditingCommands2.DeleteRight = registerEditorCommand(new class extends CoreEditingCommand {
    constructor() {
      super({
        id: "deleteRight",
        precondition: void 0,
        kbOpts: {
          weight: CORE_WEIGHT,
          kbExpr: EditorContextKeys.textInputFocus,
          primary: KeyCode.Delete,
          mac: { primary: KeyCode.Delete, secondary: [KeyMod.WinCtrl | KeyCode.KeyD, KeyMod.WinCtrl | KeyCode.Delete] }
        }
      });
    }
    runCoreEditingCommand(editor, viewModel, args) {
      const [shouldPushStackElementBefore, commands] = DeleteOperations.deleteRight(viewModel.getPrevEditOperationType(), viewModel.cursorConfig, viewModel.model, viewModel.getCursorStates().map((s) => s.modelState.selection));
      if (shouldPushStackElementBefore) {
        editor.pushUndoStop();
      }
      editor.executeCommands(this.id, commands);
      viewModel.setPrevEditOperationType(EditOperationType.DeletingRight);
    }
  }());
  CoreEditingCommands2.Undo = new class extends EditorOrNativeTextInputCommand {
    constructor() {
      super(UndoCommand);
    }
    runDOMCommand(activeElement) {
      activeElement.ownerDocument.execCommand("undo");
    }
    runEditorCommand(accessor, editor, args) {
      if (!editor.hasModel() || editor.getOption(EditorOption.readOnly) === true) {
        return;
      }
      return editor.getModel().undo();
    }
  }();
  CoreEditingCommands2.Redo = new class extends EditorOrNativeTextInputCommand {
    constructor() {
      super(RedoCommand);
    }
    runDOMCommand(activeElement) {
      activeElement.ownerDocument.execCommand("redo");
    }
    runEditorCommand(accessor, editor, args) {
      if (!editor.hasModel() || editor.getOption(EditorOption.readOnly) === true) {
        return;
      }
      return editor.getModel().redo();
    }
  }();
})(CoreEditingCommands || (CoreEditingCommands = {}));
class EditorHandlerCommand extends Command {
  constructor(id, handlerId, metadata) {
    super({
      id,
      precondition: void 0,
      metadata
    });
    this._handlerId = handlerId;
  }
  runCommand(accessor, args) {
    const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (!editor) {
      return;
    }
    editor.trigger("keyboard", this._handlerId, args);
  }
}
function registerOverwritableCommand(handlerId, metadata) {
  registerCommand(new EditorHandlerCommand("default:" + handlerId, handlerId));
  registerCommand(new EditorHandlerCommand(handlerId, handlerId, metadata));
}
registerOverwritableCommand(Handler.Type, {
  description: `Type`,
  args: [{
    name: "args",
    schema: {
      "type": "object",
      "required": ["text"],
      "properties": {
        "text": {
          "type": "string"
        }
      }
    }
  }]
});
registerOverwritableCommand(Handler.ReplacePreviousChar);
registerOverwritableCommand(Handler.CompositionType);
registerOverwritableCommand(Handler.CompositionStart);
registerOverwritableCommand(Handler.CompositionEnd);
registerOverwritableCommand(Handler.Paste);
registerOverwritableCommand(Handler.Cut);
export {
  CoreEditingCommands,
  CoreEditorCommand,
  CoreNavigationCommands,
  EditorScroll_,
  NavigationCommandRevealType,
  RevealLine_
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXGNvcmVDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaXNGaXJlZm94IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDb21tYW5kLCBFZGl0b3JDb21tYW5kLCBJQ29tbWFuZE9wdGlvbnMsIHJlZ2lzdGVyRWRpdG9yQ29tbWFuZCwgTXVsdGlDb21tYW5kLCBVbmRvQ29tbWFuZCwgUmVkb0NvbW1hbmQsIFNlbGVjdEFsbENvbW1hbmQgfSBmcm9tICcuL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2x1bW5TZWxlY3Rpb24sIElDb2x1bW5TZWxlY3RSZXN1bHQgfSBmcm9tICcuLi9jb21tb24vY3Vyc29yL2N1cnNvckNvbHVtblNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDdXJzb3JTdGF0ZSwgRWRpdE9wZXJhdGlvblR5cGUsIElDb2x1bW5TZWxlY3REYXRhLCBQYXJ0aWFsQ3Vyc29yU3RhdGUgfSBmcm9tICcuLi9jb21tb24vY3Vyc29yQ29tbW9uLmpzJztcbmltcG9ydCB7IERlbGV0ZU9wZXJhdGlvbnMgfSBmcm9tICcuLi9jb21tb24vY3Vyc29yL2N1cnNvckRlbGV0ZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JNb3ZlIGFzIEN1cnNvck1vdmVfLCBDdXJzb3JNb3ZlQ29tbWFuZHMgfSBmcm9tICcuLi9jb21tb24vY3Vyc29yL2N1cnNvck1vdmVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUeXBlT3BlcmF0aW9ucyB9IGZyb20gJy4uL2NvbW1vbi9jdXJzb3IvY3Vyc29yVHlwZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSGFuZGxlciwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgVmVydGljYWxSZXZlYWxUeXBlIH0gZnJvbSAnLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRNZXRhZGF0YSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCwgS2V5YmluZGluZ3NSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24gfSBmcm9tICcuLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgZ2V0QWN0aXZlRWxlbWVudCwgaXNFZGl0YWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVudGVyT3BlcmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2N1cnNvci9jdXJzb3JUeXBlRWRpdE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgVGV4dEVkaXRvclNlbGVjdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcblxuY29uc3QgQ09SRV9XRUlHSFQgPSBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvcmU7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBDb3JlRWRpdG9yQ29tbWFuZDxUPiBleHRlbmRzIEVkaXRvckNvbW1hbmQge1xuXHRwdWJsaWMgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJncz86IFBhcnRpYWw8VD4gfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gZWRpdG9yLl9nZXRWaWV3TW9kZWwoKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0Ly8gdGhlIGVkaXRvciBoYXMgbm8gdmlldyA9PiBoYXMgbm8gY3Vyc29yc1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgYXJncyB8fCB7fSk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgcnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPFQ+KTogdm9pZDtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBFZGl0b3JTY3JvbGxfIHtcblxuXHRjb25zdCBpc0VkaXRvclNjcm9sbEFyZ3MgPSBmdW5jdGlvbiAoYXJnOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0eXBlcy5pc09iamVjdChhcmcpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Nyb2xsQXJnOiBSYXdBcmd1bWVudHMgPSBhcmcgYXMgUmF3QXJndW1lbnRzO1xuXG5cdFx0aWYgKCF0eXBlcy5pc1N0cmluZyhzY3JvbGxBcmcudG8pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChzY3JvbGxBcmcuYnkpICYmICF0eXBlcy5pc1N0cmluZyhzY3JvbGxBcmcuYnkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChzY3JvbGxBcmcudmFsdWUpICYmICF0eXBlcy5pc051bWJlcihzY3JvbGxBcmcudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCF0eXBlcy5pc1VuZGVmaW5lZChzY3JvbGxBcmcucmV2ZWFsQ3Vyc29yKSAmJiAhdHlwZXMuaXNCb29sZWFuKHNjcm9sbEFyZy5yZXZlYWxDdXJzb3IpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH07XG5cblx0ZXhwb3J0IGNvbnN0IG1ldGFkYXRhOiBJQ29tbWFuZE1ldGFkYXRhID0ge1xuXHRcdGRlc2NyaXB0aW9uOiAnU2Nyb2xsIGVkaXRvciBpbiB0aGUgZ2l2ZW4gZGlyZWN0aW9uJyxcblx0XHRhcmdzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdFZGl0b3Igc2Nyb2xsIGFyZ3VtZW50IG9iamVjdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgUHJvcGVydHktdmFsdWUgcGFpcnMgdGhhdCBjYW4gYmUgcGFzc2VkIHRocm91Z2ggdGhpcyBhcmd1bWVudDpcblx0XHRcdFx0XHQqICd0byc6IEEgbWFuZGF0b3J5IGRpcmVjdGlvbiB2YWx1ZS5cblx0XHRcdFx0XHRcdFxcYFxcYFxcYFxuXHRcdFx0XHRcdFx0J3VwJywgJ2Rvd24nXG5cdFx0XHRcdFx0XHRcXGBcXGBcXGBcblx0XHRcdFx0XHQqICdieSc6IFVuaXQgdG8gbW92ZS4gRGVmYXVsdCBpcyBjb21wdXRlZCBiYXNlZCBvbiAndG8nIHZhbHVlLlxuXHRcdFx0XHRcdFx0XFxgXFxgXFxgXG5cdFx0XHRcdFx0XHQnbGluZScsICd3cmFwcGVkTGluZScsICdwYWdlJywgJ2hhbGZQYWdlJywgJ2VkaXRvcidcblx0XHRcdFx0XHRcdFxcYFxcYFxcYFxuXHRcdFx0XHRcdCogJ3ZhbHVlJzogTnVtYmVyIG9mIHVuaXRzIHRvIG1vdmUuIERlZmF1bHQgaXMgJzEnLlxuXHRcdFx0XHRcdCogJ3JldmVhbEN1cnNvcic6IElmICd0cnVlJyByZXZlYWxzIHRoZSBjdXJzb3IgaWYgaXQgaXMgb3V0c2lkZSB2aWV3IHBvcnQuXG5cdFx0XHRcdGAsXG5cdFx0XHRcdGNvbnN0cmFpbnQ6IGlzRWRpdG9yU2Nyb2xsQXJncyxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQncmVxdWlyZWQnOiBbJ3RvJ10sXG5cdFx0XHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdFx0XHQndG8nOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdCdlbnVtJzogWyd1cCcsICdkb3duJ11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnYnknOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdCdlbnVtJzogWydsaW5lJywgJ3dyYXBwZWRMaW5lJywgJ3BhZ2UnLCAnaGFsZlBhZ2UnLCAnZWRpdG9yJ11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQndmFsdWUnOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdCdkZWZhdWx0JzogMVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdyZXZlYWxDdXJzb3InOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fTtcblxuXHQvKipcblx0ICogRGlyZWN0aW9ucyBpbiB0aGUgdmlldyBmb3IgZWRpdG9yIHNjcm9sbCBjb21tYW5kLlxuXHQgKi9cblx0ZXhwb3J0IGNvbnN0IFJhd0RpcmVjdGlvbiA9IHtcblx0XHRVcDogJ3VwJyxcblx0XHRSaWdodDogJ3JpZ2h0Jyxcblx0XHREb3duOiAnZG93bicsXG5cdFx0TGVmdDogJ2xlZnQnXG5cdH07XG5cblx0LyoqXG5cdCAqIFVuaXRzIGZvciBlZGl0b3Igc2Nyb2xsICdieScgYXJndW1lbnRcblx0ICovXG5cdGV4cG9ydCBjb25zdCBSYXdVbml0ID0ge1xuXHRcdExpbmU6ICdsaW5lJyxcblx0XHRXcmFwcGVkTGluZTogJ3dyYXBwZWRMaW5lJyxcblx0XHRQYWdlOiAncGFnZScsXG5cdFx0SGFsZlBhZ2U6ICdoYWxmUGFnZScsXG5cdFx0RWRpdG9yOiAnZWRpdG9yJyxcblx0XHRDb2x1bW46ICdjb2x1bW4nXG5cdH07XG5cblx0LyoqXG5cdCAqIEFyZ3VtZW50cyBmb3IgZWRpdG9yIHNjcm9sbCBjb21tYW5kXG5cdCAqL1xuXHRleHBvcnQgaW50ZXJmYWNlIFJhd0FyZ3VtZW50cyB7XG5cdFx0dG86IHN0cmluZztcblx0XHRieT86IHN0cmluZztcblx0XHR2YWx1ZT86IG51bWJlcjtcblx0XHRyZXZlYWxDdXJzb3I/OiBib29sZWFuO1xuXHRcdHNlbGVjdD86IGJvb2xlYW47XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcGFyc2UoYXJnczogUGFydGlhbDxSYXdBcmd1bWVudHM+KTogUGFyc2VkQXJndW1lbnRzIHwgbnVsbCB7XG5cdFx0bGV0IGRpcmVjdGlvbjogRGlyZWN0aW9uO1xuXHRcdHN3aXRjaCAoYXJncy50bykge1xuXHRcdFx0Y2FzZSBSYXdEaXJlY3Rpb24uVXA6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5VcDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd0RpcmVjdGlvbi5SaWdodDpcblx0XHRcdFx0ZGlyZWN0aW9uID0gRGlyZWN0aW9uLlJpZ2h0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLkRvd246XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5Eb3duO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3RGlyZWN0aW9uLkxlZnQ6XG5cdFx0XHRcdGRpcmVjdGlvbiA9IERpcmVjdGlvbi5MZWZ0O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdC8vIElsbGVnYWwgYXJndW1lbnRzXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCB1bml0OiBVbml0O1xuXHRcdHN3aXRjaCAoYXJncy5ieSkge1xuXHRcdFx0Y2FzZSBSYXdVbml0LkxpbmU6XG5cdFx0XHRcdHVuaXQgPSBVbml0LkxpbmU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSYXdVbml0LldyYXBwZWRMaW5lOlxuXHRcdFx0XHR1bml0ID0gVW5pdC5XcmFwcGVkTGluZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd1VuaXQuUGFnZTpcblx0XHRcdFx0dW5pdCA9IFVuaXQuUGFnZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd1VuaXQuSGFsZlBhZ2U6XG5cdFx0XHRcdHVuaXQgPSBVbml0LkhhbGZQYWdlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUmF3VW5pdC5FZGl0b3I6XG5cdFx0XHRcdHVuaXQgPSBVbml0LkVkaXRvcjtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJhd1VuaXQuQ29sdW1uOlxuXHRcdFx0XHR1bml0ID0gVW5pdC5Db2x1bW47XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dW5pdCA9IFVuaXQuV3JhcHBlZExpbmU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSBNYXRoLmZsb29yKGFyZ3MudmFsdWUgfHwgMSk7XG5cdFx0Y29uc3QgcmV2ZWFsQ3Vyc29yID0gISFhcmdzLnJldmVhbEN1cnNvcjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXJlY3Rpb246IGRpcmVjdGlvbixcblx0XHRcdHVuaXQ6IHVuaXQsXG5cdFx0XHR2YWx1ZTogdmFsdWUsXG5cdFx0XHRyZXZlYWxDdXJzb3I6IHJldmVhbEN1cnNvcixcblx0XHRcdHNlbGVjdDogKCEhYXJncy5zZWxlY3QpXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgUGFyc2VkQXJndW1lbnRzIHtcblx0XHRkaXJlY3Rpb246IERpcmVjdGlvbjtcblx0XHR1bml0OiBVbml0O1xuXHRcdHZhbHVlOiBudW1iZXI7XG5cdFx0cmV2ZWFsQ3Vyc29yOiBib29sZWFuO1xuXHRcdHNlbGVjdDogYm9vbGVhbjtcblx0fVxuXG5cblx0ZXhwb3J0IGNvbnN0IGVudW0gRGlyZWN0aW9uIHtcblx0XHRVcCA9IDEsXG5cdFx0UmlnaHQgPSAyLFxuXHRcdERvd24gPSAzLFxuXHRcdExlZnQgPSA0XG5cdH1cblxuXHRleHBvcnQgY29uc3QgZW51bSBVbml0IHtcblx0XHRMaW5lID0gMSxcblx0XHRXcmFwcGVkTGluZSA9IDIsXG5cdFx0UGFnZSA9IDMsXG5cdFx0SGFsZlBhZ2UgPSA0LFxuXHRcdEVkaXRvciA9IDUsXG5cdFx0Q29sdW1uID0gNlxuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUmV2ZWFsTGluZV8ge1xuXG5cdGNvbnN0IGlzUmV2ZWFsTGluZUFyZ3MgPSBmdW5jdGlvbiAoYXJnOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0eXBlcy5pc09iamVjdChhcmcpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmV2ZWFMaW5lQXJnOiBSYXdBcmd1bWVudHMgPSBhcmcgYXMgUmF3QXJndW1lbnRzO1xuXG5cdFx0aWYgKCF0eXBlcy5pc051bWJlcihyZXZlYUxpbmVBcmcubGluZU51bWJlcikgJiYgIXR5cGVzLmlzU3RyaW5nKHJldmVhTGluZUFyZy5saW5lTnVtYmVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdHlwZXMuaXNVbmRlZmluZWQocmV2ZWFMaW5lQXJnLmF0KSAmJiAhdHlwZXMuaXNTdHJpbmcocmV2ZWFMaW5lQXJnLmF0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBtZXRhZGF0YTogSUNvbW1hbmRNZXRhZGF0YSA9IHtcblx0XHRkZXNjcmlwdGlvbjogJ1JldmVhbCB0aGUgZ2l2ZW4gbGluZSBhdCB0aGUgZ2l2ZW4gbG9naWNhbCBwb3NpdGlvbicsXG5cdFx0YXJnczogW1xuXHRcdFx0e1xuXHRcdFx0XHRuYW1lOiAnUmV2ZWFsIGxpbmUgYXJndW1lbnQgb2JqZWN0Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGBQcm9wZXJ0eS12YWx1ZSBwYWlycyB0aGF0IGNhbiBiZSBwYXNzZWQgdGhyb3VnaCB0aGlzIGFyZ3VtZW50OlxuXHRcdFx0XHRcdCogJ2xpbmVOdW1iZXInOiBBIG1hbmRhdG9yeSBsaW5lIG51bWJlciB2YWx1ZS5cblx0XHRcdFx0XHQqICdhdCc6IExvZ2ljYWwgcG9zaXRpb24gYXQgd2hpY2ggbGluZSBoYXMgdG8gYmUgcmV2ZWFsZWQuXG5cdFx0XHRcdFx0XHRcXGBcXGBcXGBcblx0XHRcdFx0XHRcdCd0b3AnLCAnY2VudGVyJywgJ2JvdHRvbSdcblx0XHRcdFx0XHRcdFxcYFxcYFxcYFxuXHRcdFx0XHRgLFxuXHRcdFx0XHRjb25zdHJhaW50OiBpc1JldmVhbExpbmVBcmdzLFxuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0XHRcdCdyZXF1aXJlZCc6IFsnbGluZU51bWJlciddLFxuXHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0J2xpbmVOdW1iZXInOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogWydudW1iZXInLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2F0Jzoge1xuXHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHQnZW51bSc6IFsndG9wJywgJ2NlbnRlcicsICdib3R0b20nXVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdF1cblx0fTtcblxuXHQvKipcblx0ICogQXJndW1lbnRzIGZvciByZXZlYWwgbGluZSBjb21tYW5kXG5cdCAqL1xuXHRleHBvcnQgaW50ZXJmYWNlIFJhd0FyZ3VtZW50cyB7XG5cdFx0bGluZU51bWJlcj86IG51bWJlciB8IHN0cmluZztcblx0XHRhdD86IHN0cmluZztcblx0fVxuXG5cdC8qKlxuXHQgKiBWYWx1ZXMgZm9yIHJldmVhbCBsaW5lICdhdCcgYXJndW1lbnRcblx0ICovXG5cdGV4cG9ydCBjb25zdCBSYXdBdEFyZ3VtZW50ID0ge1xuXHRcdFRvcDogJ3RvcCcsXG5cdFx0Q2VudGVyOiAnY2VudGVyJyxcblx0XHRCb3R0b206ICdib3R0b20nXG5cdH07XG59XG5cbmFic3RyYWN0IGNsYXNzIEVkaXRvck9yTmF0aXZlVGV4dElucHV0Q29tbWFuZCB7XG5cblx0Y29uc3RydWN0b3IodGFyZ2V0OiBNdWx0aUNvbW1hbmQpIHtcblx0XHQvLyAxLiBoYW5kbGUgY2FzZSB3aGVuIGZvY3VzIGlzIGluIGVkaXRvci5cblx0XHR0YXJnZXQuYWRkSW1wbGVtZW50YXRpb24oMTAwMDAsICdjb2RlLWVkaXRvcicsIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYXJnczogdW5rbm93bikgPT4ge1xuXHRcdFx0Ly8gT25seSBpZiBlZGl0b3IgdGV4dCBmb2N1cyAoaS5lLiBub3QgaWYgZWRpdG9yIGhhcyB3aWRnZXQgZm9jdXMpLlxuXHRcdFx0Y29uc3QgZm9jdXNlZEVkaXRvciA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpLmdldEZvY3VzZWRDb2RlRWRpdG9yKCk7XG5cdFx0XHRpZiAoZm9jdXNlZEVkaXRvciAmJiBmb2N1c2VkRWRpdG9yLmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBmb2N1c2VkRWRpdG9yLCBhcmdzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblxuXHRcdC8vIDIuIGhhbmRsZSBjYXNlIHdoZW4gZm9jdXMgaXMgaW4gc29tZSBvdGhlciBgaW5wdXRgIC8gYHRleHRhcmVhYC5cblx0XHR0YXJnZXQuYWRkSW1wbGVtZW50YXRpb24oMTAwMCwgJ2dlbmVyaWMtZG9tLWlucHV0LXRleHRhcmVhJywgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHQvLyBPbmx5IGlmIGZvY3VzZWQgb24gYW4gZWxlbWVudCB0aGF0IGFsbG93cyBmb3IgZW50ZXJpbmcgdGV4dFxuXHRcdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IGdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRcdGlmIChhY3RpdmVFbGVtZW50ICYmIGlzRWRpdGFibGVFbGVtZW50KGFjdGl2ZUVsZW1lbnQpKSB7XG5cdFx0XHRcdHRoaXMucnVuRE9NQ29tbWFuZChhY3RpdmVFbGVtZW50KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSk7XG5cblx0XHQvLyAzLiAoZGVmYXVsdCkgaGFuZGxlIGNhc2Ugd2hlbiBmb2N1cyBpcyBzb21ld2hlcmUgZWxzZS5cblx0XHR0YXJnZXQuYWRkSW1wbGVtZW50YXRpb24oMCwgJ2dlbmVyaWMtZG9tJywgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKSA9PiB7XG5cdFx0XHQvLyBSZWRpcmVjdGluZyB0byBhY3RpdmUgZWRpdG9yXG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRcdGFjdGl2ZUVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgYWN0aXZlRWRpdG9yLCBhcmdzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBfcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciB8IG51bGwsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IHVua25vd24pOiBib29sZWFuIHwgUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBlZGl0b3IsIGFyZ3MpO1xuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGFic3RyYWN0IHJ1bkRPTUNvbW1hbmQoYWN0aXZlRWxlbWVudDogRWxlbWVudCk6IHZvaWQ7XG5cdHB1YmxpYyBhYnN0cmFjdCBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yIHwgbnVsbCwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBOYXZpZ2F0aW9uQ29tbWFuZFJldmVhbFR5cGUge1xuXHQvKipcblx0ICogRG8gcmVndWxhciByZXZlYWxpbmcuXG5cdCAqL1xuXHRSZWd1bGFyID0gMCxcblx0LyoqXG5cdCAqIERvIG9ubHkgbWluaW1hbCByZXZlYWxpbmcuXG5cdCAqL1xuXHRNaW5pbWFsID0gMSxcblx0LyoqXG5cdCAqIERvIG5vdCByZXZlYWwgdGhlIHBvc2l0aW9uLlxuXHQgKi9cblx0Tm9uZSA9IDJcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDb3JlTmF2aWdhdGlvbkNvbW1hbmRzIHtcblxuXHRleHBvcnQgaW50ZXJmYWNlIEJhc2VDb21tYW5kT3B0aW9ucyB7XG5cdFx0c291cmNlPzogJ21vdXNlJyB8ICdrZXlib2FyZCcgfCBzdHJpbmc7XG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIE1vdmVDb21tYW5kT3B0aW9ucyBleHRlbmRzIEJhc2VDb21tYW5kT3B0aW9ucyB7XG5cdFx0cG9zaXRpb246IElQb3NpdGlvbjtcblx0XHR2aWV3UG9zaXRpb24/OiBJUG9zaXRpb247XG5cdFx0cmV2ZWFsVHlwZTogTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlO1xuXHR9XG5cblx0Y2xhc3MgQmFzZU1vdmVUb0NvbW1hbmQgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+IHtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luU2VsZWN0aW9uTW9kZTogYm9vbGVhbjtcblxuXHRcdGNvbnN0cnVjdG9yKG9wdHM6IElDb21tYW5kT3B0aW9ucyAmIHsgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuIH0pIHtcblx0XHRcdHN1cGVyKG9wdHMpO1xuXHRcdFx0dGhpcy5faW5TZWxlY3Rpb25Nb2RlID0gb3B0cy5pblNlbGVjdGlvbk1vZGU7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxNb3ZlQ29tbWFuZE9wdGlvbnM+KTogdm9pZCB7XG5cdFx0XHRpZiAoIWFyZ3MucG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdGNvbnN0IGN1cnNvclN0YXRlQ2hhbmdlZCA9IHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRDdXJzb3JNb3ZlQ29tbWFuZHMubW92ZVRvKHZpZXdNb2RlbCwgdmlld01vZGVsLmdldFByaW1hcnlDdXJzb3JTdGF0ZSgpLCB0aGlzLl9pblNlbGVjdGlvbk1vZGUsIGFyZ3MucG9zaXRpb24sIGFyZ3Mudmlld1Bvc2l0aW9uKVxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGN1cnNvclN0YXRlQ2hhbmdlZCAmJiBhcmdzLnJldmVhbFR5cGUgIT09IE5hdmlnYXRpb25Db21tYW5kUmV2ZWFsVHlwZS5Ob25lKSB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXZlYWxBbGxDdXJzb3JzKGFyZ3Muc291cmNlLCB0cnVlLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgTW92ZVRvOiBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBCYXNlTW92ZVRvQ29tbWFuZCh7XG5cdFx0aWQ6ICdfbW92ZVRvJyxcblx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgTW92ZVRvU2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBCYXNlTW92ZVRvQ29tbWFuZCh7XG5cdFx0aWQ6ICdfbW92ZVRvU2VsZWN0Jyxcblx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0fSkpO1xuXG5cdGFic3RyYWN0IGNsYXNzIENvbHVtblNlbGVjdENvbW1hbmQ8VCBleHRlbmRzIEJhc2VDb21tYW5kT3B0aW9ucyA9IEJhc2VDb21tYW5kT3B0aW9ucz4gZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxUPiB7XG5cdFx0cHVibGljIHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxUPik6IHZvaWQge1xuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2dldENvbHVtblNlbGVjdFJlc3VsdCh2aWV3TW9kZWwsIHZpZXdNb2RlbC5nZXRQcmltYXJ5Q3Vyc29yU3RhdGUoKSwgdmlld01vZGVsLmdldEN1cnNvckNvbHVtblNlbGVjdERhdGEoKSwgYXJncyk7XG5cdFx0XHRpZiAocmVzdWx0ID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIGludmFsaWQgYXJndW1lbnRzXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoYXJncy5zb3VyY2UsIEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCwgcmVzdWx0LnZpZXdTdGF0ZXMubWFwKCh2aWV3U3RhdGUpID0+IEN1cnNvclN0YXRlLmZyb21WaWV3U3RhdGUodmlld1N0YXRlKSkpO1xuXHRcdFx0dmlld01vZGVsLnNldEN1cnNvckNvbHVtblNlbGVjdERhdGEoe1xuXHRcdFx0XHRpc1JlYWw6IHRydWUsXG5cdFx0XHRcdGZyb21WaWV3TGluZU51bWJlcjogcmVzdWx0LmZyb21MaW5lTnVtYmVyLFxuXHRcdFx0XHRmcm9tVmlld1Zpc3VhbENvbHVtbjogcmVzdWx0LmZyb21WaXN1YWxDb2x1bW4sXG5cdFx0XHRcdHRvVmlld0xpbmVOdW1iZXI6IHJlc3VsdC50b0xpbmVOdW1iZXIsXG5cdFx0XHRcdHRvVmlld1Zpc3VhbENvbHVtbjogcmVzdWx0LnRvVmlzdWFsQ29sdW1uXG5cdFx0XHR9KTtcblx0XHRcdGlmIChyZXN1bHQucmV2ZXJzZWQpIHtcblx0XHRcdFx0dmlld01vZGVsLnJldmVhbFRvcE1vc3RDdXJzb3IoYXJncy5zb3VyY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmlld01vZGVsLnJldmVhbEJvdHRvbU1vc3RDdXJzb3IoYXJncy5zb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0Q29sdW1uU2VsZWN0UmVzdWx0KHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgcHJpbWFyeTogQ3Vyc29yU3RhdGUsIHByZXZDb2x1bW5TZWxlY3REYXRhOiBJQ29sdW1uU2VsZWN0RGF0YSwgYXJnczogUGFydGlhbDxUPik6IElDb2x1bW5TZWxlY3RSZXN1bHQgfCBudWxsO1xuXG5cdH1cblxuXHRleHBvcnQgaW50ZXJmYWNlIENvbHVtblNlbGVjdENvbW1hbmRPcHRpb25zIGV4dGVuZHMgQmFzZUNvbW1hbmRPcHRpb25zIHtcblx0XHRwb3NpdGlvbjogSVBvc2l0aW9uO1xuXHRcdHZpZXdQb3NpdGlvbjogSVBvc2l0aW9uO1xuXHRcdG1vdXNlQ29sdW1uOiBudW1iZXI7XG5cdFx0ZG9Db2x1bW5TZWxlY3Q6IGJvb2xlYW47XG5cdH1cblxuXHRleHBvcnQgY29uc3QgQ29sdW1uU2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxDb2x1bW5TZWxlY3RDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IGNsYXNzIGV4dGVuZHMgQ29sdW1uU2VsZWN0Q29tbWFuZDxDb2x1bW5TZWxlY3RDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2NvbHVtblNlbGVjdCcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwcm90ZWN0ZWQgX2dldENvbHVtblNlbGVjdFJlc3VsdCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIHByaW1hcnk6IEN1cnNvclN0YXRlLCBwcmV2Q29sdW1uU2VsZWN0RGF0YTogSUNvbHVtblNlbGVjdERhdGEsIGFyZ3M6IFBhcnRpYWw8Q29sdW1uU2VsZWN0Q29tbWFuZE9wdGlvbnM+KTogSUNvbHVtblNlbGVjdFJlc3VsdCB8IG51bGwge1xuXHRcdFx0aWYgKHR5cGVvZiBhcmdzLnBvc2l0aW9uID09PSAndW5kZWZpbmVkJyB8fCB0eXBlb2YgYXJncy52aWV3UG9zaXRpb24gPT09ICd1bmRlZmluZWQnIHx8IHR5cGVvZiBhcmdzLm1vdXNlQ29sdW1uID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdC8vIHZhbGlkYXRlIGBhcmdzYFxuXHRcdFx0Y29uc3QgdmFsaWRhdGVkUG9zaXRpb24gPSB2aWV3TW9kZWwubW9kZWwudmFsaWRhdGVQb3NpdGlvbihhcmdzLnBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IHZhbGlkYXRlZFZpZXdQb3NpdGlvbiA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci52YWxpZGF0ZVZpZXdQb3NpdGlvbihuZXcgUG9zaXRpb24oYXJncy52aWV3UG9zaXRpb24ubGluZU51bWJlciwgYXJncy52aWV3UG9zaXRpb24uY29sdW1uKSwgdmFsaWRhdGVkUG9zaXRpb24pO1xuXG5cdFx0XHRjb25zdCBmcm9tVmlld0xpbmVOdW1iZXIgPSBhcmdzLmRvQ29sdW1uU2VsZWN0ID8gcHJldkNvbHVtblNlbGVjdERhdGEuZnJvbVZpZXdMaW5lTnVtYmVyIDogdmFsaWRhdGVkVmlld1Bvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBmcm9tVmlld1Zpc3VhbENvbHVtbiA9IGFyZ3MuZG9Db2x1bW5TZWxlY3QgPyBwcmV2Q29sdW1uU2VsZWN0RGF0YS5mcm9tVmlld1Zpc3VhbENvbHVtbiA6IGFyZ3MubW91c2VDb2x1bW4gLSAxO1xuXHRcdFx0cmV0dXJuIENvbHVtblNlbGVjdGlvbi5jb2x1bW5TZWxlY3Qodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBmcm9tVmlld0xpbmVOdW1iZXIsIGZyb21WaWV3VmlzdWFsQ29sdW1uLCB2YWxpZGF0ZWRWaWV3UG9zaXRpb24ubGluZU51bWJlciwgYXJncy5tb3VzZUNvbHVtbiAtIDEpO1xuXHRcdH1cblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IEN1cnNvckNvbHVtblNlbGVjdExlZnQ6IENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IGNsYXNzIGV4dGVuZHMgQ29sdW1uU2VsZWN0Q29tbWFuZCB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnY3Vyc29yQ29sdW1uU2VsZWN0TGVmdCcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogMCB9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBfZ2V0Q29sdW1uU2VsZWN0UmVzdWx0KHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgcHJpbWFyeTogQ3Vyc29yU3RhdGUsIHByZXZDb2x1bW5TZWxlY3REYXRhOiBJQ29sdW1uU2VsZWN0RGF0YSwgYXJnczogUGFydGlhbDxCYXNlQ29tbWFuZE9wdGlvbnM+KTogSUNvbHVtblNlbGVjdFJlc3VsdCB7XG5cdFx0XHRyZXR1cm4gQ29sdW1uU2VsZWN0aW9uLmNvbHVtblNlbGVjdExlZnQodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBwcmV2Q29sdW1uU2VsZWN0RGF0YSk7XG5cdFx0fVxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQ6IENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IGNsYXNzIGV4dGVuZHMgQ29sdW1uU2VsZWN0Q29tbWFuZCB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnY3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQnLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdFx0XHRsaW51eDogeyBwcmltYXJ5OiAwIH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIF9nZXRDb2x1bW5TZWxlY3RSZXN1bHQodmlld01vZGVsOiBJVmlld01vZGVsLCBwcmltYXJ5OiBDdXJzb3JTdGF0ZSwgcHJldkNvbHVtblNlbGVjdERhdGE6IElDb2x1bW5TZWxlY3REYXRhLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucz4pOiBJQ29sdW1uU2VsZWN0UmVzdWx0IHtcblx0XHRcdHJldHVybiBDb2x1bW5TZWxlY3Rpb24uY29sdW1uU2VsZWN0UmlnaHQodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLCBwcmV2Q29sdW1uU2VsZWN0RGF0YSk7XG5cdFx0fVxuXHR9KTtcblxuXHRjbGFzcyBDb2x1bW5TZWxlY3RVcENvbW1hbmQgZXh0ZW5kcyBDb2x1bW5TZWxlY3RDb21tYW5kIHtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzUGFnZWQ6IGJvb2xlYW47XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGlzUGFnZWQ6IGJvb2xlYW4gfSkge1xuXHRcdFx0c3VwZXIob3B0cyk7XG5cdFx0XHR0aGlzLl9pc1BhZ2VkID0gb3B0cy5pc1BhZ2VkO1xuXHRcdH1cblxuXHRcdHByb3RlY3RlZCBfZ2V0Q29sdW1uU2VsZWN0UmVzdWx0KHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgcHJpbWFyeTogQ3Vyc29yU3RhdGUsIHByZXZDb2x1bW5TZWxlY3REYXRhOiBJQ29sdW1uU2VsZWN0RGF0YSwgYXJnczogUGFydGlhbDxCYXNlQ29tbWFuZE9wdGlvbnM+KTogSUNvbHVtblNlbGVjdFJlc3VsdCB7XG5cdFx0XHRyZXR1cm4gQ29sdW1uU2VsZWN0aW9uLmNvbHVtblNlbGVjdFVwKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbCwgcHJldkNvbHVtblNlbGVjdERhdGEsIHRoaXMuX2lzUGFnZWQpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JDb2x1bW5TZWxlY3RVcDogQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ29sdW1uU2VsZWN0VXBDb21tYW5kKHtcblx0XHRpc1BhZ2VkOiBmYWxzZSxcblx0XHRpZDogJ2N1cnNvckNvbHVtblNlbGVjdFVwJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogMCB9XG5cdFx0fVxuXHR9KSk7XG5cblx0ZXhwb3J0IGNvbnN0IEN1cnNvckNvbHVtblNlbGVjdFBhZ2VVcDogQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ29sdW1uU2VsZWN0VXBDb21tYW5kKHtcblx0XHRpc1BhZ2VkOiB0cnVlLFxuXHRcdGlkOiAnY3Vyc29yQ29sdW1uU2VsZWN0UGFnZVVwJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRsaW51eDogeyBwcmltYXJ5OiAwIH1cblx0XHR9XG5cdH0pKTtcblxuXHRjbGFzcyBDb2x1bW5TZWxlY3REb3duQ29tbWFuZCBleHRlbmRzIENvbHVtblNlbGVjdENvbW1hbmQge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaXNQYWdlZDogYm9vbGVhbjtcblxuXHRcdGNvbnN0cnVjdG9yKG9wdHM6IElDb21tYW5kT3B0aW9ucyAmIHsgaXNQYWdlZDogYm9vbGVhbiB9KSB7XG5cdFx0XHRzdXBlcihvcHRzKTtcblx0XHRcdHRoaXMuX2lzUGFnZWQgPSBvcHRzLmlzUGFnZWQ7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIF9nZXRDb2x1bW5TZWxlY3RSZXN1bHQodmlld01vZGVsOiBJVmlld01vZGVsLCBwcmltYXJ5OiBDdXJzb3JTdGF0ZSwgcHJldkNvbHVtblNlbGVjdERhdGE6IElDb2x1bW5TZWxlY3REYXRhLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucz4pOiBJQ29sdW1uU2VsZWN0UmVzdWx0IHtcblx0XHRcdHJldHVybiBDb2x1bW5TZWxlY3Rpb24uY29sdW1uU2VsZWN0RG93bih2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwsIHByZXZDb2x1bW5TZWxlY3REYXRhLCB0aGlzLl9pc1BhZ2VkKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yQ29sdW1uU2VsZWN0RG93bjogQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ29sdW1uU2VsZWN0RG93bkNvbW1hbmQoe1xuXHRcdGlzUGFnZWQ6IGZhbHNlLFxuXHRcdGlkOiAnY3Vyc29yQ29sdW1uU2VsZWN0RG93bicsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0a2JPcHRzOiB7XG5cdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogMCB9XG5cdFx0fVxuXHR9KSk7XG5cblx0ZXhwb3J0IGNvbnN0IEN1cnNvckNvbHVtblNlbGVjdFBhZ2VEb3duOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDb2x1bW5TZWxlY3REb3duQ29tbWFuZCh7XG5cdFx0aXNQYWdlZDogdHJ1ZSxcblx0XHRpZDogJ2N1cnNvckNvbHVtblNlbGVjdFBhZ2VEb3duJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5QYWdlRG93bixcblx0XHRcdGxpbnV4OiB7IHByaW1hcnk6IDAgfVxuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCBjbGFzcyBDdXJzb3JNb3ZlSW1wbCBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEN1cnNvck1vdmVfLlJhd0FyZ3VtZW50cz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2N1cnNvck1vdmUnLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0bWV0YWRhdGE6IEN1cnNvck1vdmVfLm1ldGFkYXRhXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucyAmIEN1cnNvck1vdmVfLlJhd0FyZ3VtZW50cz4pOiB2b2lkIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEN1cnNvck1vdmVfLnBhcnNlKGFyZ3MpO1xuXHRcdFx0aWYgKCFwYXJzZWQpIHtcblx0XHRcdFx0Ly8gaWxsZWdhbCBhcmd1bWVudHNcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcnVuQ3Vyc29yTW92ZSh2aWV3TW9kZWwsIGFyZ3Muc291cmNlLCBwYXJzZWQpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX3J1bkN1cnNvck1vdmUodmlld01vZGVsOiBJVmlld01vZGVsLCBzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGFyZ3M6IEN1cnNvck1vdmVfLlBhcnNlZEFyZ3VtZW50cyk6IHZvaWQge1xuXHRcdFx0Ly8gSWYgbm9IaXN0b3J5IGlzIHRydWUsIHVzZSBQUk9HUkFNTUFUSUMgc291cmNlIHRvIHByZXZlbnQgYWRkaW5nIHRvIG5hdmlnYXRpb24gaGlzdG9yeVxuXHRcdFx0Y29uc3QgZWZmZWN0aXZlU291cmNlID0gYXJncy5ub0hpc3RvcnkgPyBUZXh0RWRpdG9yU2VsZWN0aW9uU291cmNlLlBST0dSQU1NQVRJQyA6IHNvdXJjZTtcblxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGVmZmVjdGl2ZVNvdXJjZSxcblx0XHRcdFx0Q3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0LFxuXHRcdFx0XHRDdXJzb3JNb3ZlSW1wbC5fbW92ZSh2aWV3TW9kZWwsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSwgYXJncylcblx0XHRcdCk7XG5cdFx0XHR2aWV3TW9kZWwucmV2ZWFsQWxsQ3Vyc29ycyhlZmZlY3RpdmVTb3VyY2UsIHRydWUpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgc3RhdGljIF9tb3ZlKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgY3Vyc29yczogQ3Vyc29yU3RhdGVbXSwgYXJnczogQ3Vyc29yTW92ZV8uUGFyc2VkQXJndW1lbnRzKTogUGFydGlhbEN1cnNvclN0YXRlW10gfCBudWxsIHtcblx0XHRcdGNvbnN0IGluU2VsZWN0aW9uTW9kZSA9IGFyZ3Muc2VsZWN0O1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBhcmdzLnZhbHVlO1xuXG5cdFx0XHRzd2l0Y2ggKGFyZ3MuZGlyZWN0aW9uKSB7XG5cdFx0XHRcdGNhc2UgQ3Vyc29yTW92ZV8uRGlyZWN0aW9uLkxlZnQ6XG5cdFx0XHRcdGNhc2UgQ3Vyc29yTW92ZV8uRGlyZWN0aW9uLlJpZ2h0OlxuXHRcdFx0XHRjYXNlIEN1cnNvck1vdmVfLkRpcmVjdGlvbi5VcDpcblx0XHRcdFx0Y2FzZSBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uRG93bjpcblx0XHRcdFx0Y2FzZSBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uUHJldkJsYW5rTGluZTpcblx0XHRcdFx0Y2FzZSBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uTmV4dEJsYW5rTGluZTpcblx0XHRcdFx0Y2FzZSBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uV3JhcHBlZExpbmVTdGFydDpcblx0XHRcdFx0Y2FzZSBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uV3JhcHBlZExpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXI6XG5cdFx0XHRcdGNhc2UgQ3Vyc29yTW92ZV8uRGlyZWN0aW9uLldyYXBwZWRMaW5lQ29sdW1uQ2VudGVyOlxuXHRcdFx0XHRjYXNlIEN1cnNvck1vdmVfLkRpcmVjdGlvbi5XcmFwcGVkTGluZUVuZDpcblx0XHRcdFx0Y2FzZSBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uV3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcjpcblx0XHRcdFx0XHRyZXR1cm4gQ3Vyc29yTW92ZUNvbW1hbmRzLnNpbXBsZU1vdmUodmlld01vZGVsLCBjdXJzb3JzLCBhcmdzLmRpcmVjdGlvbiwgaW5TZWxlY3Rpb25Nb2RlLCB2YWx1ZSwgYXJncy51bml0KTtcblxuXHRcdFx0XHRjYXNlIEN1cnNvck1vdmVfLkRpcmVjdGlvbi5WaWV3UG9ydFRvcDpcblx0XHRcdFx0Y2FzZSBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uVmlld1BvcnRCb3R0b206XG5cdFx0XHRcdGNhc2UgQ3Vyc29yTW92ZV8uRGlyZWN0aW9uLlZpZXdQb3J0Q2VudGVyOlxuXHRcdFx0XHRjYXNlIEN1cnNvck1vdmVfLkRpcmVjdGlvbi5WaWV3UG9ydElmT3V0c2lkZTpcblx0XHRcdFx0XHRyZXR1cm4gQ3Vyc29yTW92ZUNvbW1hbmRzLnZpZXdwb3J0TW92ZSh2aWV3TW9kZWwsIGN1cnNvcnMsIGFyZ3MuZGlyZWN0aW9uLCBpblNlbGVjdGlvbk1vZGUsIHZhbHVlKTtcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yTW92ZTogQ3Vyc29yTW92ZUltcGwgPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvck1vdmVJbXBsKCkpO1xuXG5cdGNvbnN0IGVudW0gQ29uc3RhbnRzIHtcblx0XHRQQUdFX1NJWkVfTUFSS0VSID0gLTFcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgQ3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zIGV4dGVuZHMgQmFzZUNvbW1hbmRPcHRpb25zIHtcblx0XHRwYWdlU2l6ZT86IG51bWJlcjtcblx0fVxuXG5cdGNsYXNzIEN1cnNvck1vdmVCYXNlZENvbW1hbmQgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxDdXJzb3JNb3ZlQ29tbWFuZE9wdGlvbnM+IHtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRpY0FyZ3M6IEN1cnNvck1vdmVfLlNpbXBsZU1vdmVBcmd1bWVudHM7XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGFyZ3M6IEN1cnNvck1vdmVfLlNpbXBsZU1vdmVBcmd1bWVudHMgfSkge1xuXHRcdFx0c3VwZXIob3B0cyk7XG5cdFx0XHR0aGlzLl9zdGF0aWNBcmdzID0gb3B0cy5hcmdzO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGR5bmFtaWNBcmdzOiBQYXJ0aWFsPEN1cnNvck1vdmVDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdGxldCBhcmdzID0gdGhpcy5fc3RhdGljQXJncztcblx0XHRcdGlmICh0aGlzLl9zdGF0aWNBcmdzLnZhbHVlID09PSBDb25zdGFudHMuUEFHRV9TSVpFX01BUktFUikge1xuXHRcdFx0XHQvLyAtMSBpcyBhIG1hcmtlciBmb3IgcGFnZSBzaXplXG5cdFx0XHRcdGFyZ3MgPSB7XG5cdFx0XHRcdFx0ZGlyZWN0aW9uOiB0aGlzLl9zdGF0aWNBcmdzLmRpcmVjdGlvbixcblx0XHRcdFx0XHR1bml0OiB0aGlzLl9zdGF0aWNBcmdzLnVuaXQsXG5cdFx0XHRcdFx0c2VsZWN0OiB0aGlzLl9zdGF0aWNBcmdzLnNlbGVjdCxcblx0XHRcdFx0XHR2YWx1ZTogZHluYW1pY0FyZ3MucGFnZVNpemUgfHwgdmlld01vZGVsLmN1cnNvckNvbmZpZy5wYWdlU2l6ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHR2aWV3TW9kZWwubW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhcblx0XHRcdFx0ZHluYW1pY0FyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdEN1cnNvck1vdmVDb21tYW5kcy5zaW1wbGVNb3ZlKHZpZXdNb2RlbCwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpLCBhcmdzLmRpcmVjdGlvbiwgYXJncy5zZWxlY3QsIGFyZ3MudmFsdWUsIGFyZ3MudW5pdClcblx0XHRcdCk7XG5cdFx0XHR2aWV3TW9kZWwucmV2ZWFsQWxsQ3Vyc29ycyhkeW5hbWljQXJncy5zb3VyY2UsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JMZWZ0OiBDb3JlRWRpdG9yQ29tbWFuZDxDdXJzb3JNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JNb3ZlQmFzZWRDb21tYW5kKHtcblx0XHRhcmdzOiB7XG5cdFx0XHRkaXJlY3Rpb246IEN1cnNvck1vdmVfLkRpcmVjdGlvbi5MZWZ0LFxuXHRcdFx0dW5pdDogQ3Vyc29yTW92ZV8uVW5pdC5Ob25lLFxuXHRcdFx0c2VsZWN0OiBmYWxzZSxcblx0XHRcdHZhbHVlOiAxXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvckxlZnQnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdyxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdywgc2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleUJdIH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yTGVmdFNlbGVjdDogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uTGVmdCxcblx0XHRcdHVuaXQ6IEN1cnNvck1vdmVfLlVuaXQuTm9uZSxcblx0XHRcdHNlbGVjdDogdHJ1ZSxcblx0XHRcdHZhbHVlOiAxXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvckxlZnRTZWxlY3QnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkxlZnRBcnJvd1xuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JSaWdodDogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uUmlnaHQsXG5cdFx0XHR1bml0OiBDdXJzb3JNb3ZlXy5Vbml0Lk5vbmUsXG5cdFx0XHRzZWxlY3Q6IGZhbHNlLFxuXHRcdFx0dmFsdWU6IDFcblx0XHR9LFxuXHRcdGlkOiAnY3Vyc29yUmlnaHQnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5SaWdodEFycm93LCBzZWNvbmRhcnk6IFtLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5Rl0gfVxuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JSaWdodFNlbGVjdDogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uUmlnaHQsXG5cdFx0XHR1bml0OiBDdXJzb3JNb3ZlXy5Vbml0Lk5vbmUsXG5cdFx0XHRzZWxlY3Q6IHRydWUsXG5cdFx0XHR2YWx1ZTogMVxuXHRcdH0sXG5cdFx0aWQ6ICdjdXJzb3JSaWdodFNlbGVjdCcsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0a2JPcHRzOiB7XG5cdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUmlnaHRBcnJvd1xuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JVcDogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uVXAsXG5cdFx0XHR1bml0OiBDdXJzb3JNb3ZlXy5Vbml0LldyYXBwZWRMaW5lLFxuXHRcdFx0c2VsZWN0OiBmYWxzZSxcblx0XHRcdHZhbHVlOiAxXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvclVwJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdywgc2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleVBdIH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yVXBTZWxlY3Q6IENvcmVFZGl0b3JDb21tYW5kPEN1cnNvck1vdmVDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvck1vdmVCYXNlZENvbW1hbmQoe1xuXHRcdGFyZ3M6IHtcblx0XHRcdGRpcmVjdGlvbjogQ3Vyc29yTW92ZV8uRGlyZWN0aW9uLlVwLFxuXHRcdFx0dW5pdDogQ3Vyc29yTW92ZV8uVW5pdC5XcmFwcGVkTGluZSxcblx0XHRcdHNlbGVjdDogdHJ1ZSxcblx0XHRcdHZhbHVlOiAxXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvclVwU2VsZWN0Jyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlVwQXJyb3ddLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvdyB9LFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93IH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yUGFnZVVwOiBDb3JlRWRpdG9yQ29tbWFuZDxDdXJzb3JNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBDdXJzb3JNb3ZlQmFzZWRDb21tYW5kKHtcblx0XHRhcmdzOiB7XG5cdFx0XHRkaXJlY3Rpb246IEN1cnNvck1vdmVfLkRpcmVjdGlvbi5VcCxcblx0XHRcdHVuaXQ6IEN1cnNvck1vdmVfLlVuaXQuV3JhcHBlZExpbmUsXG5cdFx0XHRzZWxlY3Q6IGZhbHNlLFxuXHRcdFx0dmFsdWU6IENvbnN0YW50cy5QQUdFX1NJWkVfTUFSS0VSXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvclBhZ2VVcCcsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0a2JPcHRzOiB7XG5cdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZVVwXG5cdFx0fVxuXHR9KSk7XG5cblx0ZXhwb3J0IGNvbnN0IEN1cnNvclBhZ2VVcFNlbGVjdDogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uVXAsXG5cdFx0XHR1bml0OiBDdXJzb3JNb3ZlXy5Vbml0LldyYXBwZWRMaW5lLFxuXHRcdFx0c2VsZWN0OiB0cnVlLFxuXHRcdFx0dmFsdWU6IENvbnN0YW50cy5QQUdFX1NJWkVfTUFSS0VSXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvclBhZ2VVcFNlbGVjdCcsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0a2JPcHRzOiB7XG5cdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUGFnZVVwXG5cdFx0fVxuXHR9KSk7XG5cblx0ZXhwb3J0IGNvbnN0IEN1cnNvckRvd246IENvcmVFZGl0b3JDb21tYW5kPEN1cnNvck1vdmVDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEN1cnNvck1vdmVCYXNlZENvbW1hbmQoe1xuXHRcdGFyZ3M6IHtcblx0XHRcdGRpcmVjdGlvbjogQ3Vyc29yTW92ZV8uRGlyZWN0aW9uLkRvd24sXG5cdFx0XHR1bml0OiBDdXJzb3JNb3ZlXy5Vbml0LldyYXBwZWRMaW5lLFxuXHRcdFx0c2VsZWN0OiBmYWxzZSxcblx0XHRcdHZhbHVlOiAxXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvckRvd24nLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdywgc2Vjb25kYXJ5OiBbS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLktleU5dIH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yRG93blNlbGVjdDogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uRG93bixcblx0XHRcdHVuaXQ6IEN1cnNvck1vdmVfLlVuaXQuV3JhcHBlZExpbmUsXG5cdFx0XHRzZWxlY3Q6IHRydWUsXG5cdFx0XHR2YWx1ZTogMVxuXHRcdH0sXG5cdFx0aWQ6ICdjdXJzb3JEb3duU2VsZWN0Jyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRG93bkFycm93XSxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyB9LFxuXHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3cgfVxuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JQYWdlRG93bjogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uRG93bixcblx0XHRcdHVuaXQ6IEN1cnNvck1vdmVfLlVuaXQuV3JhcHBlZExpbmUsXG5cdFx0XHRzZWxlY3Q6IGZhbHNlLFxuXHRcdFx0dmFsdWU6IENvbnN0YW50cy5QQUdFX1NJWkVfTUFSS0VSXG5cdFx0fSxcblx0XHRpZDogJ2N1cnNvclBhZ2VEb3duJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5Q29kZS5QYWdlRG93blxuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JQYWdlRG93blNlbGVjdDogQ29yZUVkaXRvckNvbW1hbmQ8Q3Vyc29yTW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ3Vyc29yTW92ZUJhc2VkQ29tbWFuZCh7XG5cdFx0YXJnczoge1xuXHRcdFx0ZGlyZWN0aW9uOiBDdXJzb3JNb3ZlXy5EaXJlY3Rpb24uRG93bixcblx0XHRcdHVuaXQ6IEN1cnNvck1vdmVfLlVuaXQuV3JhcHBlZExpbmUsXG5cdFx0XHRzZWxlY3Q6IHRydWUsXG5cdFx0XHR2YWx1ZTogQ29uc3RhbnRzLlBBR0VfU0laRV9NQVJLRVJcblx0XHR9LFxuXHRcdGlkOiAnY3Vyc29yUGFnZURvd25TZWxlY3QnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlBhZ2VEb3duXG5cdFx0fVxuXHR9KSk7XG5cblx0ZXhwb3J0IGludGVyZmFjZSBDcmVhdGVDdXJzb3JDb21tYW5kT3B0aW9ucyBleHRlbmRzIE1vdmVDb21tYW5kT3B0aW9ucyB7XG5cdFx0d2hvbGVMaW5lPzogYm9vbGVhbjtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBDcmVhdGVDdXJzb3I6IENvcmVFZGl0b3JDb21tYW5kPENyZWF0ZUN1cnNvckNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxDcmVhdGVDdXJzb3JDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2NyZWF0ZUN1cnNvcicsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPENyZWF0ZUN1cnNvckNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0aWYgKCFhcmdzLnBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxldCBuZXdTdGF0ZTogUGFydGlhbEN1cnNvclN0YXRlO1xuXHRcdFx0aWYgKGFyZ3Mud2hvbGVMaW5lKSB7XG5cdFx0XHRcdG5ld1N0YXRlID0gQ3Vyc29yTW92ZUNvbW1hbmRzLmxpbmUodmlld01vZGVsLCB2aWV3TW9kZWwuZ2V0UHJpbWFyeUN1cnNvclN0YXRlKCksIGZhbHNlLCBhcmdzLnBvc2l0aW9uLCBhcmdzLnZpZXdQb3NpdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRuZXdTdGF0ZSA9IEN1cnNvck1vdmVDb21tYW5kcy5tb3ZlVG8odmlld01vZGVsLCB2aWV3TW9kZWwuZ2V0UHJpbWFyeUN1cnNvclN0YXRlKCksIGZhbHNlLCBhcmdzLnBvc2l0aW9uLCBhcmdzLnZpZXdQb3NpdGlvbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlczogUGFydGlhbEN1cnNvclN0YXRlW10gPSB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCk7XG5cblx0XHRcdC8vIENoZWNrIGlmIHdlIHNob3VsZCByZW1vdmUgYSBjdXJzb3IgKHNvcnQgb2YgbGlrZSBhIHRvZ2dsZSlcblx0XHRcdGlmIChzdGF0ZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBuZXdNb2RlbFBvc2l0aW9uID0gKG5ld1N0YXRlLm1vZGVsU3RhdGUgPyBuZXdTdGF0ZS5tb2RlbFN0YXRlLnBvc2l0aW9uIDogbnVsbCk7XG5cdFx0XHRcdGNvbnN0IG5ld1ZpZXdQb3NpdGlvbiA9IChuZXdTdGF0ZS52aWV3U3RhdGUgPyBuZXdTdGF0ZS52aWV3U3RhdGUucG9zaXRpb24gOiBudWxsKTtcblxuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc3RhdGVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZXNbaV07XG5cblx0XHRcdFx0XHRpZiAobmV3TW9kZWxQb3NpdGlvbiAmJiAhc3RhdGUubW9kZWxTdGF0ZSEuc2VsZWN0aW9uLmNvbnRhaW5zUG9zaXRpb24obmV3TW9kZWxQb3NpdGlvbikpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChuZXdWaWV3UG9zaXRpb24gJiYgIXN0YXRlLnZpZXdTdGF0ZSEuc2VsZWN0aW9uLmNvbnRhaW5zUG9zaXRpb24obmV3Vmlld1Bvc2l0aW9uKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gPT4gUmVtb3ZlIHRoZSBjdXJzb3Jcblx0XHRcdFx0XHRzdGF0ZXMuc3BsaWNlKGksIDEpO1xuXG5cdFx0XHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdFx0XHR2aWV3TW9kZWwuc2V0Q3Vyc29yU3RhdGVzKFxuXHRcdFx0XHRcdFx0YXJncy5zb3VyY2UsXG5cdFx0XHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdFx0XHRzdGF0ZXNcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyA9PiBBZGQgdGhlIG5ldyBjdXJzb3Jcblx0XHRcdHN0YXRlcy5wdXNoKG5ld1N0YXRlKTtcblxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdHN0YXRlc1xuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBMYXN0Q3Vyc29yTW92ZVRvU2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPE1vdmVDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ19sYXN0Q3Vyc29yTW92ZVRvU2VsZWN0Jyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8TW92ZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0aWYgKCFhcmdzLnBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhc3RBZGRlZEN1cnNvckluZGV4ID0gdmlld01vZGVsLmdldExhc3RBZGRlZEN1cnNvckluZGV4KCk7XG5cblx0XHRcdGNvbnN0IHN0YXRlcyA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHRcdGNvbnN0IG5ld1N0YXRlczogUGFydGlhbEN1cnNvclN0YXRlW10gPSBzdGF0ZXMuc2xpY2UoMCk7XG5cdFx0XHRuZXdTdGF0ZXNbbGFzdEFkZGVkQ3Vyc29ySW5kZXhdID0gQ3Vyc29yTW92ZUNvbW1hbmRzLm1vdmVUbyh2aWV3TW9kZWwsIHN0YXRlc1tsYXN0QWRkZWRDdXJzb3JJbmRleF0sIHRydWUsIGFyZ3MucG9zaXRpb24sIGFyZ3Mudmlld1Bvc2l0aW9uKTtcblxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdG5ld1N0YXRlc1xuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdGNsYXNzIEhvbWVDb21tYW5kIGV4dGVuZHMgQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiB7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB9KSB7XG5cdFx0XHRzdXBlcihvcHRzKTtcblx0XHRcdHRoaXMuX2luU2VsZWN0aW9uTW9kZSA9IG9wdHMuaW5TZWxlY3Rpb25Nb2RlO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8QmFzZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdEN1cnNvck1vdmVDb21tYW5kcy5tb3ZlVG9CZWdpbm5pbmdPZkxpbmUodmlld01vZGVsLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCksIHRoaXMuX2luU2VsZWN0aW9uTW9kZSlcblx0XHRcdCk7XG5cdFx0XHR2aWV3TW9kZWwucmV2ZWFsQWxsQ3Vyc29ycyhhcmdzLnNvdXJjZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IEN1cnNvckhvbWU6IENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEhvbWVDb21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdGlkOiAnY3Vyc29ySG9tZScsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0a2JPcHRzOiB7XG5cdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdHByaW1hcnk6IEtleUNvZGUuSG9tZSxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlDb2RlLkhvbWUsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3ddIH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29ySG9tZVNlbGVjdDogQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgSG9tZUNvbW1hbmQoe1xuXHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRpZDogJ2N1cnNvckhvbWVTZWxlY3QnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkhvbWUsXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Ib21lLCBzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuTGVmdEFycm93XSB9XG5cdFx0fVxuXHR9KSk7XG5cblx0Y2xhc3MgTGluZVN0YXJ0Q29tbWFuZCBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4ge1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuO1xuXG5cdFx0Y29uc3RydWN0b3Iob3B0czogSUNvbW1hbmRPcHRpb25zICYgeyBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gfSkge1xuXHRcdFx0c3VwZXIob3B0cyk7XG5cdFx0XHR0aGlzLl9pblNlbGVjdGlvbk1vZGUgPSBvcHRzLmluU2VsZWN0aW9uTW9kZTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdHZpZXdNb2RlbC5tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0Q3Vyc29yU3RhdGVzKFxuXHRcdFx0XHRhcmdzLnNvdXJjZSxcblx0XHRcdFx0Q3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0LFxuXHRcdFx0XHR0aGlzLl9leGVjKHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSlcblx0XHRcdCk7XG5cdFx0XHR2aWV3TW9kZWwucmV2ZWFsQWxsQ3Vyc29ycyhhcmdzLnNvdXJjZSwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfZXhlYyhjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGN1cnNvci5tb2RlbFN0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRcdHJlc3VsdFtpXSA9IEN1cnNvclN0YXRlLmZyb21Nb2RlbFN0YXRlKGN1cnNvci5tb2RlbFN0YXRlLm1vdmUodGhpcy5faW5TZWxlY3Rpb25Nb2RlLCBsaW5lTnVtYmVyLCAxLCAwKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JMaW5lU3RhcnQ6IENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IExpbmVTdGFydENvbW1hbmQoe1xuXHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0aWQ6ICdjdXJzb3JMaW5lU3RhcnQnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlBIH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yTGluZVN0YXJ0U2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBMaW5lU3RhcnRDb21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0aWQ6ICdjdXJzb3JMaW5lU3RhcnRTZWxlY3QnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlBIH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgaW50ZXJmYWNlIEVuZENvbW1hbmRPcHRpb25zIGV4dGVuZHMgQmFzZUNvbW1hbmRPcHRpb25zIHtcblx0XHRzdGlja3k/OiBib29sZWFuO1xuXHR9XG5cblx0Y2xhc3MgRW5kQ29tbWFuZCBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEVuZENvbW1hbmRPcHRpb25zPiB7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB9KSB7XG5cdFx0XHRzdXBlcihvcHRzKTtcblx0XHRcdHRoaXMuX2luU2VsZWN0aW9uTW9kZSA9IG9wdHMuaW5TZWxlY3Rpb25Nb2RlO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8RW5kQ29tbWFuZE9wdGlvbnM+KTogdm9pZCB7XG5cdFx0XHR2aWV3TW9kZWwubW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhcblx0XHRcdFx0YXJncy5zb3VyY2UsXG5cdFx0XHRcdEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCxcblx0XHRcdFx0Q3Vyc29yTW92ZUNvbW1hbmRzLm1vdmVUb0VuZE9mTGluZSh2aWV3TW9kZWwsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSwgdGhpcy5faW5TZWxlY3Rpb25Nb2RlLCBhcmdzLnN0aWNreSB8fCBmYWxzZSlcblx0XHRcdCk7XG5cdFx0XHR2aWV3TW9kZWwucmV2ZWFsQWxsQ3Vyc29ycyhhcmdzLnNvdXJjZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IEN1cnNvckVuZDogQ29yZUVkaXRvckNvbW1hbmQ8RW5kQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBFbmRDb21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdGlkOiAnY3Vyc29yRW5kJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdGFyZ3M6IHsgc3RpY2t5OiBmYWxzZSB9LFxuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVuZCxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlDb2RlLkVuZCwgc2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3ddIH1cblx0XHR9LFxuXHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogYEdvIHRvIEVuZGAsXG5cdFx0XHRhcmdzOiBbe1xuXHRcdFx0XHRuYW1lOiAnYXJncycsXG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdCdzdGlja3knOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N0aWNreWRlc2MnLCBcIlN0aWNrIHRvIHRoZSBlbmQgZXZlbiB3aGVuIGdvaW5nIHRvIGxvbmdlciBsaW5lc1wiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fV1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yRW5kU2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxFbmRDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEVuZENvbW1hbmQoe1xuXHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRpZDogJ2N1cnNvckVuZFNlbGVjdCcsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0a2JPcHRzOiB7XG5cdFx0XHRhcmdzOiB7IHN0aWNreTogZmFsc2UgfSxcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbmQsXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbmQsIHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5SaWdodEFycm93XSB9XG5cdFx0fSxcblx0XHRtZXRhZGF0YToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGBTZWxlY3QgdG8gRW5kYCxcblx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdG5hbWU6ICdhcmdzJyxcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0J3N0aWNreSc6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3RpY2t5ZGVzYycsIFwiU3RpY2sgdG8gdGhlIGVuZCBldmVuIHdoZW4gZ29pbmcgdG8gbG9uZ2VyIGxpbmVzXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XVxuXHRcdH1cblx0fSkpO1xuXG5cdGNsYXNzIExpbmVFbmRDb21tYW5kIGV4dGVuZHMgQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiB7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB9KSB7XG5cdFx0XHRzdXBlcihvcHRzKTtcblx0XHRcdHRoaXMuX2luU2VsZWN0aW9uTW9kZSA9IG9wdHMuaW5TZWxlY3Rpb25Nb2RlO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8QmFzZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdHRoaXMuX2V4ZWModmlld01vZGVsLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkpXG5cdFx0XHQpO1xuXHRcdFx0dmlld01vZGVsLnJldmVhbEFsbEN1cnNvcnMoYXJncy5zb3VyY2UsIHRydWUpO1xuXHRcdH1cblxuXHRcdHByaXZhdGUgX2V4ZWModmlld01vZGVsOiBJVmlld01vZGVsLCBjdXJzb3JzOiBDdXJzb3JTdGF0ZVtdKTogUGFydGlhbEN1cnNvclN0YXRlW10ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGN1cnNvcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgY3Vyc29yID0gY3Vyc29yc1tpXTtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGN1cnNvci5tb2RlbFN0YXRlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnN0IG1heENvbHVtbiA9IHZpZXdNb2RlbC5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRyZXN1bHRbaV0gPSBDdXJzb3JTdGF0ZS5mcm9tTW9kZWxTdGF0ZShjdXJzb3IubW9kZWxTdGF0ZS5tb3ZlKHRoaXMuX2luU2VsZWN0aW9uTW9kZSwgbGluZU51bWJlciwgbWF4Q29sdW1uLCAwKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JMaW5lRW5kOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBMaW5lRW5kQ29tbWFuZCh7XG5cdFx0aW5TZWxlY3Rpb25Nb2RlOiBmYWxzZSxcblx0XHRpZDogJ2N1cnNvckxpbmVFbmQnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlFIH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yTGluZUVuZFNlbGVjdDogQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgTGluZUVuZENvbW1hbmQoe1xuXHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRpZDogJ2N1cnNvckxpbmVFbmRTZWxlY3QnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlFIH1cblx0XHR9XG5cdH0pKTtcblxuXHRjbGFzcyBUb3BDb21tYW5kIGV4dGVuZHMgQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiB7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB9KSB7XG5cdFx0XHRzdXBlcihvcHRzKTtcblx0XHRcdHRoaXMuX2luU2VsZWN0aW9uTW9kZSA9IG9wdHMuaW5TZWxlY3Rpb25Nb2RlO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8QmFzZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdEN1cnNvck1vdmVDb21tYW5kcy5tb3ZlVG9CZWdpbm5pbmdPZkJ1ZmZlcih2aWV3TW9kZWwsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSwgdGhpcy5faW5TZWxlY3Rpb25Nb2RlKVxuXHRcdFx0KTtcblx0XHRcdHZpZXdNb2RlbC5yZXZlYWxBbGxDdXJzb3JzKGFyZ3Muc291cmNlLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yVG9wOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBUb3BDb21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdGlkOiAnY3Vyc29yVG9wJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkhvbWUsXG5cdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3cgfVxuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCBjb25zdCBDdXJzb3JUb3BTZWxlY3Q6IENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IFRvcENvbW1hbmQoe1xuXHRcdGluU2VsZWN0aW9uTW9kZTogdHJ1ZSxcblx0XHRpZDogJ2N1cnNvclRvcFNlbGVjdCcsXG5cdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0a2JPcHRzOiB7XG5cdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Ib21lLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5VcEFycm93IH1cblx0XHR9XG5cdH0pKTtcblxuXHRjbGFzcyBCb3R0b21Db21tYW5kIGV4dGVuZHMgQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiB7XG5cblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB9KSB7XG5cdFx0XHRzdXBlcihvcHRzKTtcblx0XHRcdHRoaXMuX2luU2VsZWN0aW9uTW9kZSA9IG9wdHMuaW5TZWxlY3Rpb25Nb2RlO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8QmFzZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdEN1cnNvck1vdmVDb21tYW5kcy5tb3ZlVG9FbmRPZkJ1ZmZlcih2aWV3TW9kZWwsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKSwgdGhpcy5faW5TZWxlY3Rpb25Nb2RlKVxuXHRcdFx0KTtcblx0XHRcdHZpZXdNb2RlbC5yZXZlYWxBbGxDdXJzb3JzKGFyZ3Muc291cmNlLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yQm90dG9tOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBCb3R0b21Db21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdGlkOiAnY3Vyc29yQm90dG9tJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRrYk9wdHM6IHtcblx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVuZCxcblx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93IH1cblx0XHR9XG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ3Vyc29yQm90dG9tU2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBCb3R0b21Db21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0aWQ6ICdjdXJzb3JCb3R0b21TZWxlY3QnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdGtiT3B0czoge1xuXHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRW5kLFxuXHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Eb3duQXJyb3cgfVxuXHRcdH1cblx0fSkpO1xuXG5cdGV4cG9ydCB0eXBlIEVkaXRvclNjcm9sbENvbW1hbmRPcHRpb25zID0gRWRpdG9yU2Nyb2xsXy5SYXdBcmd1bWVudHMgJiBCYXNlQ29tbWFuZE9wdGlvbnM7XG5cblx0ZXhwb3J0IGNsYXNzIEVkaXRvclNjcm9sbEltcGwgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxFZGl0b3JTY3JvbGxDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2VkaXRvclNjcm9sbCcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRtZXRhZGF0YTogRWRpdG9yU2Nyb2xsXy5tZXRhZGF0YVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZGV0ZXJtaW5lU2Nyb2xsTWV0aG9kKGFyZ3M6IEVkaXRvclNjcm9sbF8uUGFyc2VkQXJndW1lbnRzKSB7XG5cdFx0XHRjb25zdCBob3Jpem9udGFsVW5pdHMgPSBbRWRpdG9yU2Nyb2xsXy5Vbml0LkNvbHVtbl07XG5cdFx0XHRjb25zdCB2ZXJ0aWNhbFVuaXRzID0gW1xuXHRcdFx0XHRFZGl0b3JTY3JvbGxfLlVuaXQuTGluZSxcblx0XHRcdFx0RWRpdG9yU2Nyb2xsXy5Vbml0LldyYXBwZWRMaW5lLFxuXHRcdFx0XHRFZGl0b3JTY3JvbGxfLlVuaXQuUGFnZSxcblx0XHRcdFx0RWRpdG9yU2Nyb2xsXy5Vbml0LkhhbGZQYWdlLFxuXHRcdFx0XHRFZGl0b3JTY3JvbGxfLlVuaXQuRWRpdG9yXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbERpcmVjdGlvbnMgPSBbRWRpdG9yU2Nyb2xsXy5EaXJlY3Rpb24uTGVmdCwgRWRpdG9yU2Nyb2xsXy5EaXJlY3Rpb24uUmlnaHRdO1xuXHRcdFx0Y29uc3QgdmVydGljYWxEaXJlY3Rpb25zID0gW0VkaXRvclNjcm9sbF8uRGlyZWN0aW9uLlVwLCBFZGl0b3JTY3JvbGxfLkRpcmVjdGlvbi5Eb3duXTtcblxuXHRcdFx0aWYgKGhvcml6b250YWxVbml0cy5pbmNsdWRlcyhhcmdzLnVuaXQpICYmIGhvcml6b250YWxEaXJlY3Rpb25zLmluY2x1ZGVzKGFyZ3MuZGlyZWN0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcnVuSG9yaXpvbnRhbEVkaXRvclNjcm9sbC5iaW5kKHRoaXMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZlcnRpY2FsVW5pdHMuaW5jbHVkZXMoYXJncy51bml0KSAmJiB2ZXJ0aWNhbERpcmVjdGlvbnMuaW5jbHVkZXMoYXJncy5kaXJlY3Rpb24pKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9ydW5WZXJ0aWNhbEVkaXRvclNjcm9sbC5iaW5kKHRoaXMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxFZGl0b3JTY3JvbGxDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEVkaXRvclNjcm9sbF8ucGFyc2UoYXJncyk7XG5cdFx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0XHQvLyBpbGxlZ2FsIGFyZ3VtZW50c1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBydW5FZGl0b3JTY3JvbGwgPSB0aGlzLmRldGVybWluZVNjcm9sbE1ldGhvZChwYXJzZWQpO1xuXHRcdFx0aWYgKCFydW5FZGl0b3JTY3JvbGwpIHtcblx0XHRcdFx0Ly8gSW5jb21wYXRpYmxlIHVuaXQgYW5kIGRpcmVjdGlvblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRydW5FZGl0b3JTY3JvbGwodmlld01vZGVsLCBhcmdzLnNvdXJjZSwgcGFyc2VkKTtcblx0XHR9XG5cblx0XHRfcnVuVmVydGljYWxFZGl0b3JTY3JvbGwodmlld01vZGVsOiBJVmlld01vZGVsLCBzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGFyZ3M6IEVkaXRvclNjcm9sbF8uUGFyc2VkQXJndW1lbnRzKTogdm9pZCB7XG5cblx0XHRcdGNvbnN0IGRlc2lyZWRTY3JvbGxUb3AgPSB0aGlzLl9jb21wdXRlRGVzaXJlZFNjcm9sbFRvcCh2aWV3TW9kZWwsIGFyZ3MpO1xuXG5cdFx0XHRpZiAoYXJncy5yZXZlYWxDdXJzb3IpIHtcblx0XHRcdFx0Ly8gbXVzdCBlbnN1cmUgY3Vyc29yIGlzIGluIG5ldyB2aXNpYmxlIHJhbmdlXG5cdFx0XHRcdGNvbnN0IGRlc2lyZWRWaXNpYmxlVmlld1JhbmdlID0gdmlld01vZGVsLmdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlQXRTY3JvbGxUb3AoZGVzaXJlZFNjcm9sbFRvcCk7XG5cdFx0XHRcdGNvbnN0IHBhZGRlZFJhbmdlID0gdmlld01vZGVsLmdldFZpZXdSYW5nZVdpdGhDdXJzb3JQYWRkaW5nKGRlc2lyZWRWaXNpYmxlVmlld1JhbmdlKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0Q3Vyc29yU3RhdGVzKFxuXHRcdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0Q3Vyc29yTW92ZUNvbW1hbmRzLmZpbmRQb3NpdGlvbkluVmlld3BvcnRJZk91dHNpZGUodmlld01vZGVsLCB2aWV3TW9kZWwuZ2V0UHJpbWFyeUN1cnNvclN0YXRlKCksIHBhZGRlZFJhbmdlLCBhcmdzLnNlbGVjdClcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdHZpZXdNb2RlbC52aWV3TGF5b3V0LnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBkZXNpcmVkU2Nyb2xsVG9wIH0sIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHR9XG5cblx0XHRwcml2YXRlIF9jb21wdXRlRGVzaXJlZFNjcm9sbFRvcCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IEVkaXRvclNjcm9sbF8uUGFyc2VkQXJndW1lbnRzKTogbnVtYmVyIHtcblxuXHRcdFx0aWYgKGFyZ3MudW5pdCA9PT0gRWRpdG9yU2Nyb2xsXy5Vbml0LkxpbmUpIHtcblx0XHRcdFx0Ly8gc2Nyb2xsaW5nIGJ5IG1vZGVsIGxpbmVzXG5cdFx0XHRcdGNvbnN0IGZ1dHVyZVZpZXdwb3J0ID0gdmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0RnV0dXJlVmlld3BvcnQoKTtcblx0XHRcdFx0Y29uc3QgdmlzaWJsZVZpZXdSYW5nZSA9IHZpZXdNb2RlbC5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZUF0U2Nyb2xsVG9wKGZ1dHVyZVZpZXdwb3J0LnRvcCk7XG5cdFx0XHRcdGNvbnN0IHZpc2libGVNb2RlbFJhbmdlID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UmFuZ2VUb01vZGVsUmFuZ2UodmlzaWJsZVZpZXdSYW5nZSk7XG5cblx0XHRcdFx0bGV0IGRlc2lyZWRUb3BNb2RlbExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRcdFx0aWYgKGFyZ3MuZGlyZWN0aW9uID09PSBFZGl0b3JTY3JvbGxfLkRpcmVjdGlvbi5VcCkge1xuXHRcdFx0XHRcdC8vIG11c3QgZ28geCBtb2RlbCBsaW5lcyB1cFxuXHRcdFx0XHRcdGRlc2lyZWRUb3BNb2RlbExpbmVOdW1iZXIgPSBNYXRoLm1heCgxLCB2aXNpYmxlTW9kZWxSYW5nZS5zdGFydExpbmVOdW1iZXIgLSBhcmdzLnZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBtdXN0IGdvIHggbW9kZWwgbGluZXMgZG93blxuXHRcdFx0XHRcdGRlc2lyZWRUb3BNb2RlbExpbmVOdW1iZXIgPSBNYXRoLm1pbih2aWV3TW9kZWwubW9kZWwuZ2V0TGluZUNvdW50KCksIHZpc2libGVNb2RlbFJhbmdlLnN0YXJ0TGluZU51bWJlciArIGFyZ3MudmFsdWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obmV3IFBvc2l0aW9uKGRlc2lyZWRUb3BNb2RlbExpbmVOdW1iZXIsIDEpKTtcblx0XHRcdFx0cmV0dXJuIHZpZXdNb2RlbC52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcih2aWV3UG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhcmdzLnVuaXQgPT09IEVkaXRvclNjcm9sbF8uVW5pdC5FZGl0b3IpIHtcblx0XHRcdFx0bGV0IGRlc2lyZWRUb3BNb2RlbExpbmVOdW1iZXIgPSAwO1xuXHRcdFx0XHRpZiAoYXJncy5kaXJlY3Rpb24gPT09IEVkaXRvclNjcm9sbF8uRGlyZWN0aW9uLkRvd24pIHtcblx0XHRcdFx0XHRkZXNpcmVkVG9wTW9kZWxMaW5lTnVtYmVyID0gdmlld01vZGVsLm1vZGVsLmdldExpbmVDb3VudCgpIC0gdmlld01vZGVsLmN1cnNvckNvbmZpZy5wYWdlU2l6ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKGRlc2lyZWRUb3BNb2RlbExpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgbm9PZkxpbmVzOiBudW1iZXI7XG5cdFx0XHRpZiAoYXJncy51bml0ID09PSBFZGl0b3JTY3JvbGxfLlVuaXQuUGFnZSkge1xuXHRcdFx0XHRub09mTGluZXMgPSB2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLnBhZ2VTaXplICogYXJncy52YWx1ZTtcblx0XHRcdH0gZWxzZSBpZiAoYXJncy51bml0ID09PSBFZGl0b3JTY3JvbGxfLlVuaXQuSGFsZlBhZ2UpIHtcblx0XHRcdFx0bm9PZkxpbmVzID0gTWF0aC5yb3VuZCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLnBhZ2VTaXplIC8gMikgKiBhcmdzLnZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bm9PZkxpbmVzID0gYXJncy52YWx1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlbHRhTGluZXMgPSAoYXJncy5kaXJlY3Rpb24gPT09IEVkaXRvclNjcm9sbF8uRGlyZWN0aW9uLlVwID8gLTEgOiAxKSAqIG5vT2ZMaW5lcztcblx0XHRcdHJldHVybiB2aWV3TW9kZWwudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkgKyBkZWx0YUxpbmVzICogdmlld01vZGVsLmN1cnNvckNvbmZpZy5saW5lSGVpZ2h0O1xuXHRcdH1cblxuXHRcdF9ydW5Ib3Jpem9udGFsRWRpdG9yU2Nyb2xsKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBhcmdzOiBFZGl0b3JTY3JvbGxfLlBhcnNlZEFyZ3VtZW50cyk6IHZvaWQge1xuXHRcdFx0Y29uc3QgZGVzaXJlZFNjcm9sbExlZnQgPSB0aGlzLl9jb21wdXRlRGVzaXJlZFNjcm9sbExlZnQodmlld01vZGVsLCBhcmdzKTtcblx0XHRcdHZpZXdNb2RlbC52aWV3TGF5b3V0LnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsTGVmdDogZGVzaXJlZFNjcm9sbExlZnQgfSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdH1cblxuXHRcdF9jb21wdXRlRGVzaXJlZFNjcm9sbExlZnQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBFZGl0b3JTY3JvbGxfLlBhcnNlZEFyZ3VtZW50cykge1xuXHRcdFx0Y29uc3QgZGVsdGFDb2x1bW5zID0gKGFyZ3MuZGlyZWN0aW9uID09PSBFZGl0b3JTY3JvbGxfLkRpcmVjdGlvbi5MZWZ0ID8gLTEgOiAxKSAqIGFyZ3MudmFsdWU7XG5cdFx0XHRyZXR1cm4gdmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbExlZnQoKSArIGRlbHRhQ29sdW1ucyAqIHZpZXdNb2RlbC5jdXJzb3JDb25maWcudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBFZGl0b3JTY3JvbGw6IEVkaXRvclNjcm9sbEltcGwgPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEVkaXRvclNjcm9sbEltcGwoKSk7XG5cblx0ZXhwb3J0IGNvbnN0IFNjcm9sbExpbmVVcDogQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+IHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICdzY3JvbGxMaW5lVXAnLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuUGFnZVVwIH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdEVkaXRvclNjcm9sbC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdFx0dG86IEVkaXRvclNjcm9sbF8uUmF3RGlyZWN0aW9uLlVwLFxuXHRcdFx0XHRieTogRWRpdG9yU2Nyb2xsXy5SYXdVbml0LldyYXBwZWRMaW5lLFxuXHRcdFx0XHR2YWx1ZTogMSxcblx0XHRcdFx0cmV2ZWFsQ3Vyc29yOiBmYWxzZSxcblx0XHRcdFx0c2VsZWN0OiBmYWxzZSxcblx0XHRcdFx0c291cmNlOiBhcmdzLnNvdXJjZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgU2Nyb2xsUGFnZVVwOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3Njcm9sbFBhZ2VVcCcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlBhZ2VVcCxcblx0XHRcdFx0XHR3aW46IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuUGFnZVVwIH0sXG5cdFx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuUGFnZVVwIH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdEVkaXRvclNjcm9sbC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdFx0dG86IEVkaXRvclNjcm9sbF8uUmF3RGlyZWN0aW9uLlVwLFxuXHRcdFx0XHRieTogRWRpdG9yU2Nyb2xsXy5SYXdVbml0LlBhZ2UsXG5cdFx0XHRcdHZhbHVlOiAxLFxuXHRcdFx0XHRyZXZlYWxDdXJzb3I6IGZhbHNlLFxuXHRcdFx0XHRzZWxlY3Q6IGZhbHNlLFxuXHRcdFx0XHRzb3VyY2U6IGFyZ3Muc291cmNlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBTY3JvbGxFZGl0b3JUb3A6IENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IGNsYXNzIGV4dGVuZHMgQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnc2Nyb2xsRWRpdG9yVG9wJyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdEVkaXRvclNjcm9sbC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdFx0dG86IEVkaXRvclNjcm9sbF8uUmF3RGlyZWN0aW9uLlVwLFxuXHRcdFx0XHRieTogRWRpdG9yU2Nyb2xsXy5SYXdVbml0LkVkaXRvcixcblx0XHRcdFx0dmFsdWU6IDEsXG5cdFx0XHRcdHJldmVhbEN1cnNvcjogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdDogZmFsc2UsXG5cdFx0XHRcdHNvdXJjZTogYXJncy5zb3VyY2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IFNjcm9sbExpbmVEb3duOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3Njcm9sbExpbmVEb3duJyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRcdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuUGFnZURvd24gfVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8QmFzZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0RWRpdG9yU2Nyb2xsLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge1xuXHRcdFx0XHR0bzogRWRpdG9yU2Nyb2xsXy5SYXdEaXJlY3Rpb24uRG93bixcblx0XHRcdFx0Ynk6IEVkaXRvclNjcm9sbF8uUmF3VW5pdC5XcmFwcGVkTGluZSxcblx0XHRcdFx0dmFsdWU6IDEsXG5cdFx0XHRcdHJldmVhbEN1cnNvcjogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdDogZmFsc2UsXG5cdFx0XHRcdHNvdXJjZTogYXJncy5zb3VyY2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IFNjcm9sbFBhZ2VEb3duOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3Njcm9sbFBhZ2VEb3duJyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUGFnZURvd24sXG5cdFx0XHRcdFx0d2luOiB7IHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlBhZ2VEb3duIH0sXG5cdFx0XHRcdFx0bGludXg6IHsgcHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuUGFnZURvd24gfVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8QmFzZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0RWRpdG9yU2Nyb2xsLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge1xuXHRcdFx0XHR0bzogRWRpdG9yU2Nyb2xsXy5SYXdEaXJlY3Rpb24uRG93bixcblx0XHRcdFx0Ynk6IEVkaXRvclNjcm9sbF8uUmF3VW5pdC5QYWdlLFxuXHRcdFx0XHR2YWx1ZTogMSxcblx0XHRcdFx0cmV2ZWFsQ3Vyc29yOiBmYWxzZSxcblx0XHRcdFx0c2VsZWN0OiBmYWxzZSxcblx0XHRcdFx0c291cmNlOiBhcmdzLnNvdXJjZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgU2Nyb2xsRWRpdG9yQm90dG9tOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3Njcm9sbEVkaXRvckJvdHRvbScsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxCYXNlQ29tbWFuZE9wdGlvbnM+KTogdm9pZCB7XG5cdFx0XHRFZGl0b3JTY3JvbGwucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRcdHRvOiBFZGl0b3JTY3JvbGxfLlJhd0RpcmVjdGlvbi5Eb3duLFxuXHRcdFx0XHRieTogRWRpdG9yU2Nyb2xsXy5SYXdVbml0LkVkaXRvcixcblx0XHRcdFx0dmFsdWU6IDEsXG5cdFx0XHRcdHJldmVhbEN1cnNvcjogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdDogZmFsc2UsXG5cdFx0XHRcdHNvdXJjZTogYXJncy5zb3VyY2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IFNjcm9sbExlZnQ6IENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IGNsYXNzIGV4dGVuZHMgQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnc2Nyb2xsTGVmdCcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxCYXNlQ29tbWFuZE9wdGlvbnM+KTogdm9pZCB7XG5cdFx0XHRFZGl0b3JTY3JvbGwucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRcdHRvOiBFZGl0b3JTY3JvbGxfLlJhd0RpcmVjdGlvbi5MZWZ0LFxuXHRcdFx0XHRieTogRWRpdG9yU2Nyb2xsXy5SYXdVbml0LkNvbHVtbixcblx0XHRcdFx0dmFsdWU6IDIsXG5cdFx0XHRcdHJldmVhbEN1cnNvcjogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdDogZmFsc2UsXG5cdFx0XHRcdHNvdXJjZTogYXJncy5zb3VyY2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IFNjcm9sbFJpZ2h0OiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3Njcm9sbFJpZ2h0Jyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPEJhc2VDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdEVkaXRvclNjcm9sbC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdFx0dG86IEVkaXRvclNjcm9sbF8uUmF3RGlyZWN0aW9uLlJpZ2h0LFxuXHRcdFx0XHRieTogRWRpdG9yU2Nyb2xsXy5SYXdVbml0LkNvbHVtbixcblx0XHRcdFx0dmFsdWU6IDIsXG5cdFx0XHRcdHJldmVhbEN1cnNvcjogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdDogZmFsc2UsXG5cdFx0XHRcdHNvdXJjZTogYXJncy5zb3VyY2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0Y2xhc3MgV29yZENvbW1hbmQgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+IHtcblxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luU2VsZWN0aW9uTW9kZTogYm9vbGVhbjtcblxuXHRcdGNvbnN0cnVjdG9yKG9wdHM6IElDb21tYW5kT3B0aW9ucyAmIHsgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuIH0pIHtcblx0XHRcdHN1cGVyKG9wdHMpO1xuXHRcdFx0dGhpcy5faW5TZWxlY3Rpb25Nb2RlID0gb3B0cy5pblNlbGVjdGlvbk1vZGU7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxNb3ZlQ29tbWFuZE9wdGlvbnM+KTogdm9pZCB7XG5cdFx0XHRpZiAoIWFyZ3MucG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRDdXJzb3JNb3ZlQ29tbWFuZHMud29yZCh2aWV3TW9kZWwsIHZpZXdNb2RlbC5nZXRQcmltYXJ5Q3Vyc29yU3RhdGUoKSwgdGhpcy5faW5TZWxlY3Rpb25Nb2RlLCBhcmdzLnBvc2l0aW9uKVxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGFyZ3MucmV2ZWFsVHlwZSAhPT0gTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlLk5vbmUpIHtcblx0XHRcdFx0dmlld01vZGVsLnJldmVhbEFsbEN1cnNvcnMoYXJncy5zb3VyY2UsIHRydWUsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGV4cG9ydCBjb25zdCBXb3JkU2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBXb3JkQ29tbWFuZCh7XG5cdFx0aW5TZWxlY3Rpb25Nb2RlOiBmYWxzZSxcblx0XHRpZDogJ193b3JkU2VsZWN0Jyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHR9KSk7XG5cblx0ZXhwb3J0IGNvbnN0IFdvcmRTZWxlY3REcmFnOiBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBXb3JkQ29tbWFuZCh7XG5cdFx0aW5TZWxlY3Rpb25Nb2RlOiB0cnVlLFxuXHRcdGlkOiAnX3dvcmRTZWxlY3REcmFnJyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHR9KSk7XG5cblx0ZXhwb3J0IGNvbnN0IExhc3RDdXJzb3JXb3JkU2VsZWN0OiBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPE1vdmVDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2xhc3RDdXJzb3JXb3JkU2VsZWN0Jyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWRcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8TW92ZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0aWYgKCFhcmdzLnBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhc3RBZGRlZEN1cnNvckluZGV4ID0gdmlld01vZGVsLmdldExhc3RBZGRlZEN1cnNvckluZGV4KCk7XG5cblx0XHRcdGNvbnN0IHN0YXRlcyA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHRcdGNvbnN0IG5ld1N0YXRlczogUGFydGlhbEN1cnNvclN0YXRlW10gPSBzdGF0ZXMuc2xpY2UoMCk7XG5cdFx0XHRjb25zdCBsYXN0QWRkZWRTdGF0ZSA9IHN0YXRlc1tsYXN0QWRkZWRDdXJzb3JJbmRleF07XG5cdFx0XHRuZXdTdGF0ZXNbbGFzdEFkZGVkQ3Vyc29ySW5kZXhdID0gQ3Vyc29yTW92ZUNvbW1hbmRzLndvcmQodmlld01vZGVsLCBsYXN0QWRkZWRTdGF0ZSwgbGFzdEFkZGVkU3RhdGUubW9kZWxTdGF0ZS5oYXNTZWxlY3Rpb24oKSwgYXJncy5wb3NpdGlvbik7XG5cblx0XHRcdHZpZXdNb2RlbC5tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0Q3Vyc29yU3RhdGVzKFxuXHRcdFx0XHRhcmdzLnNvdXJjZSxcblx0XHRcdFx0Q3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0LFxuXHRcdFx0XHRuZXdTdGF0ZXNcblx0XHRcdCk7XG5cdFx0fVxuXHR9KTtcblxuXHRjbGFzcyBMaW5lQ29tbWFuZCBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPE1vdmVDb21tYW5kT3B0aW9ucz4ge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luU2VsZWN0aW9uTW9kZTogYm9vbGVhbjtcblxuXHRcdGNvbnN0cnVjdG9yKG9wdHM6IElDb21tYW5kT3B0aW9ucyAmIHsgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuIH0pIHtcblx0XHRcdHN1cGVyKG9wdHMpO1xuXHRcdFx0dGhpcy5faW5TZWxlY3Rpb25Nb2RlID0gb3B0cy5pblNlbGVjdGlvbk1vZGU7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxNb3ZlQ29tbWFuZE9wdGlvbnM+KTogdm9pZCB7XG5cdFx0XHRpZiAoIWFyZ3MucG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRDdXJzb3JNb3ZlQ29tbWFuZHMubGluZSh2aWV3TW9kZWwsIHZpZXdNb2RlbC5nZXRQcmltYXJ5Q3Vyc29yU3RhdGUoKSwgdGhpcy5faW5TZWxlY3Rpb25Nb2RlLCBhcmdzLnBvc2l0aW9uLCBhcmdzLnZpZXdQb3NpdGlvbilcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHRcdGlmIChhcmdzLnJldmVhbFR5cGUgIT09IE5hdmlnYXRpb25Db21tYW5kUmV2ZWFsVHlwZS5Ob25lKSB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXZlYWxBbGxDdXJzb3JzKGFyZ3Muc291cmNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IExpbmVTZWxlY3Q6IENvcmVFZGl0b3JDb21tYW5kPE1vdmVDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IExpbmVDb21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IGZhbHNlLFxuXHRcdGlkOiAnX2xpbmVTZWxlY3QnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgTGluZVNlbGVjdERyYWc6IENvcmVFZGl0b3JDb21tYW5kPE1vdmVDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IExpbmVDb21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0aWQ6ICdfbGluZVNlbGVjdERyYWcnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdH0pKTtcblxuXHRjbGFzcyBMYXN0Q3Vyc29yTGluZUNvbW1hbmQgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxNb3ZlQ29tbWFuZE9wdGlvbnM+IHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9pblNlbGVjdGlvbk1vZGU6IGJvb2xlYW47XG5cblx0XHRjb25zdHJ1Y3RvcihvcHRzOiBJQ29tbWFuZE9wdGlvbnMgJiB7IGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiB9KSB7XG5cdFx0XHRzdXBlcihvcHRzKTtcblx0XHRcdHRoaXMuX2luU2VsZWN0aW9uTW9kZSA9IG9wdHMuaW5TZWxlY3Rpb25Nb2RlO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8TW92ZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0aWYgKCFhcmdzLnBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxhc3RBZGRlZEN1cnNvckluZGV4ID0gdmlld01vZGVsLmdldExhc3RBZGRlZEN1cnNvckluZGV4KCk7XG5cblx0XHRcdGNvbnN0IHN0YXRlcyA9IHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKTtcblx0XHRcdGNvbnN0IG5ld1N0YXRlczogUGFydGlhbEN1cnNvclN0YXRlW10gPSBzdGF0ZXMuc2xpY2UoMCk7XG5cdFx0XHRuZXdTdGF0ZXNbbGFzdEFkZGVkQ3Vyc29ySW5kZXhdID0gQ3Vyc29yTW92ZUNvbW1hbmRzLmxpbmUodmlld01vZGVsLCBzdGF0ZXNbbGFzdEFkZGVkQ3Vyc29ySW5kZXhdLCB0aGlzLl9pblNlbGVjdGlvbk1vZGUsIGFyZ3MucG9zaXRpb24sIGFyZ3Mudmlld1Bvc2l0aW9uKTtcblxuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdG5ld1N0YXRlc1xuXHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgY29uc3QgTGFzdEN1cnNvckxpbmVTZWxlY3Q6IENvcmVFZGl0b3JDb21tYW5kPE1vdmVDb21tYW5kT3B0aW9ucz4gPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IExhc3RDdXJzb3JMaW5lQ29tbWFuZCh7XG5cdFx0aW5TZWxlY3Rpb25Nb2RlOiBmYWxzZSxcblx0XHRpZDogJ2xhc3RDdXJzb3JMaW5lU2VsZWN0Jyxcblx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHR9KSk7XG5cblx0ZXhwb3J0IGNvbnN0IExhc3RDdXJzb3JMaW5lU2VsZWN0RHJhZzogQ29yZUVkaXRvckNvbW1hbmQ8TW92ZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgTGFzdEN1cnNvckxpbmVDb21tYW5kKHtcblx0XHRpblNlbGVjdGlvbk1vZGU6IHRydWUsXG5cdFx0aWQ6ICdsYXN0Q3Vyc29yTGluZVNlbGVjdERyYWcnLFxuXHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdH0pKTtcblxuXHRleHBvcnQgY29uc3QgQ2FuY2VsU2VsZWN0aW9uOiBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPEJhc2VDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2NhbmNlbFNlbGVjdGlvbicsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24sXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZV1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogUGFydGlhbDxCYXNlQ29tbWFuZE9wdGlvbnM+KTogdm9pZCB7XG5cdFx0XHR2aWV3TW9kZWwubW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhcblx0XHRcdFx0YXJncy5zb3VyY2UsXG5cdFx0XHRcdEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdEN1cnNvck1vdmVDb21tYW5kcy5jYW5jZWxTZWxlY3Rpb24odmlld01vZGVsLCB2aWV3TW9kZWwuZ2V0UHJpbWFyeUN1cnNvclN0YXRlKCkpXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0XHR2aWV3TW9kZWwucmV2ZWFsQWxsQ3Vyc29ycyhhcmdzLnNvdXJjZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgUmVtb3ZlU2Vjb25kYXJ5Q3Vyc29yczogQ29yZUVkaXRvckNvbW1hbmQ8QmFzZUNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxCYXNlQ29tbWFuZE9wdGlvbnM+IHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICdyZW1vdmVTZWNvbmRhcnlDdXJzb3JzJyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5oYXNNdWx0aXBsZVNlbGVjdGlvbnMsXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQgKyAxLFxuXHRcdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMudGV4dElucHV0Rm9jdXMsXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdFx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Fc2NhcGVdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IFBhcnRpYWw8QmFzZUNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0dmlld01vZGVsLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRDdXJzb3JTdGF0ZXMoXG5cdFx0XHRcdGFyZ3Muc291cmNlLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR2aWV3TW9kZWwuZ2V0UHJpbWFyeUN1cnNvclN0YXRlKClcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHRcdHZpZXdNb2RlbC5yZXZlYWxBbGxDdXJzb3JzKGFyZ3Muc291cmNlLCB0cnVlKTtcblx0XHRcdHN0YXR1cyhubHMubG9jYWxpemUoJ3JlbW92ZWRDdXJzb3InLCBcIlJlbW92ZWQgc2Vjb25kYXJ5IGN1cnNvcnNcIikpO1xuXHRcdH1cblx0fSk7XG5cblx0ZXhwb3J0IHR5cGUgUmV2ZWFsTGluZUNvbW1hbmRPcHRpb25zID0gUmV2ZWFsTGluZV8uUmF3QXJndW1lbnRzICYgQmFzZUNvbW1hbmRPcHRpb25zO1xuXG5cdGV4cG9ydCBjb25zdCBSZXZlYWxMaW5lOiBDb3JlRWRpdG9yQ29tbWFuZDxSZXZlYWxMaW5lQ29tbWFuZE9wdGlvbnM+ID0gcmVnaXN0ZXJFZGl0b3JDb21tYW5kKG5ldyBjbGFzcyBleHRlbmRzIENvcmVFZGl0b3JDb21tYW5kPFJldmVhbExpbmVDb21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3JldmVhbExpbmUnLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0bWV0YWRhdGE6IFJldmVhbExpbmVfLm1ldGFkYXRhXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPFJldmVhbExpbmVDb21tYW5kT3B0aW9ucz4pOiB2b2lkIHtcblx0XHRcdGNvbnN0IHJldmVhbExpbmVBcmcgPSBhcmdzO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlckFyZyA9IHJldmVhbExpbmVBcmcubGluZU51bWJlciB8fCAwO1xuXHRcdFx0bGV0IGxpbmVOdW1iZXIgPSB0eXBlb2YgbGluZU51bWJlckFyZyA9PT0gJ251bWJlcicgPyAobGluZU51bWJlckFyZyArIDEpIDogKHBhcnNlSW50KGxpbmVOdW1iZXJBcmcpICsgMSk7XG5cdFx0XHRpZiAobGluZU51bWJlciA8IDEpIHtcblx0XHRcdFx0bGluZU51bWJlciA9IDE7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lQ291bnQgPSB2aWV3TW9kZWwubW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRpZiAobGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0XHRsaW5lTnVtYmVyID0gbGluZUNvdW50O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShcblx0XHRcdFx0bGluZU51bWJlciwgMSxcblx0XHRcdFx0bGluZU51bWJlciwgdmlld01vZGVsLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcilcblx0XHRcdCk7XG5cblx0XHRcdGxldCByZXZlYWxBdCA9IFZlcnRpY2FsUmV2ZWFsVHlwZS5TaW1wbGU7XG5cdFx0XHRpZiAocmV2ZWFsTGluZUFyZy5hdCkge1xuXHRcdFx0XHRzd2l0Y2ggKHJldmVhbExpbmVBcmcuYXQpIHtcblx0XHRcdFx0XHRjYXNlIFJldmVhbExpbmVfLlJhd0F0QXJndW1lbnQuVG9wOlxuXHRcdFx0XHRcdFx0cmV2ZWFsQXQgPSBWZXJ0aWNhbFJldmVhbFR5cGUuVG9wO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBSZXZlYWxMaW5lXy5SYXdBdEFyZ3VtZW50LkNlbnRlcjpcblx0XHRcdFx0XHRcdHJldmVhbEF0ID0gVmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcjtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUmV2ZWFsTGluZV8uUmF3QXRBcmd1bWVudC5Cb3R0b206XG5cdFx0XHRcdFx0XHRyZXZlYWxBdCA9IFZlcnRpY2FsUmV2ZWFsVHlwZS5Cb3R0b207XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgdmlld1JhbmdlID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UocmFuZ2UpO1xuXG5cdFx0XHR2aWV3TW9kZWwucmV2ZWFsUmFuZ2UoYXJncy5zb3VyY2UsIGZhbHNlLCB2aWV3UmFuZ2UsIHJldmVhbEF0LCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0fVxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgU2VsZWN0QWxsID0gbmV3IGNsYXNzIGV4dGVuZHMgRWRpdG9yT3JOYXRpdmVUZXh0SW5wdXRDb21tYW5kIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKFNlbGVjdEFsbENvbW1hbmQpO1xuXHRcdH1cblx0XHRwdWJsaWMgcnVuRE9NQ29tbWFuZChhY3RpdmVFbGVtZW50OiBFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRpZiAoaXNGaXJlZm94KSB7XG5cdFx0XHRcdCg8SFRNTElucHV0RWxlbWVudD5hY3RpdmVFbGVtZW50KS5mb2N1cygpO1xuXHRcdFx0XHQoPEhUTUxJbnB1dEVsZW1lbnQ+YWN0aXZlRWxlbWVudCkuc2VsZWN0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGFjdGl2ZUVsZW1lbnQub3duZXJEb2N1bWVudC5leGVjQ29tbWFuZCgnc2VsZWN0QWxsJyk7XG5cdFx0fVxuXHRcdHB1YmxpYyBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXHRcdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdFx0Ly8gdGhlIGVkaXRvciBoYXMgbm8gdmlldyA9PiBoYXMgbm8gY3Vyc29yc1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgYXJncyk7XG5cdFx0fVxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IHVua25vd24pOiB2b2lkIHtcblx0XHRcdHZpZXdNb2RlbC5tb2RlbC5wdXNoU3RhY2tFbGVtZW50KCk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0Q3Vyc29yU3RhdGVzKFxuXHRcdFx0XHQna2V5Ym9hcmQnLFxuXHRcdFx0XHRDdXJzb3JDaGFuZ2VSZWFzb24uRXhwbGljaXQsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRDdXJzb3JNb3ZlQ29tbWFuZHMuc2VsZWN0QWxsKHZpZXdNb2RlbCwgdmlld01vZGVsLmdldFByaW1hcnlDdXJzb3JTdGF0ZSgpKVxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH1cblx0fSgpO1xuXG5cdGV4cG9ydCBpbnRlcmZhY2UgU2V0U2VsZWN0aW9uQ29tbWFuZE9wdGlvbnMgZXh0ZW5kcyBCYXNlQ29tbWFuZE9wdGlvbnMge1xuXHRcdHNlbGVjdGlvbjogSVNlbGVjdGlvbjtcblx0fVxuXG5cdGV4cG9ydCBjb25zdCBTZXRTZWxlY3Rpb246IENvcmVFZGl0b3JDb21tYW5kPFNldFNlbGVjdGlvbkNvbW1hbmRPcHRpb25zPiA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBDb3JlRWRpdG9yQ29tbWFuZDxTZXRTZWxlY3Rpb25Db21tYW5kT3B0aW9ucz4ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3NldFNlbGVjdGlvbicsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiBQYXJ0aWFsPFNldFNlbGVjdGlvbkNvbW1hbmRPcHRpb25zPik6IHZvaWQge1xuXHRcdFx0aWYgKCFhcmdzLnNlbGVjdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR2aWV3TW9kZWwubW9kZWwucHVzaFN0YWNrRWxlbWVudCgpO1xuXHRcdFx0dmlld01vZGVsLnNldEN1cnNvclN0YXRlcyhcblx0XHRcdFx0YXJncy5zb3VyY2UsXG5cdFx0XHRcdEN1cnNvckNoYW5nZVJlYXNvbi5FeHBsaWNpdCxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdEN1cnNvclN0YXRlLmZyb21Nb2RlbFNlbGVjdGlvbihhcmdzLnNlbGVjdGlvbilcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xufVxuXG5jb25zdCBjb2x1bW5TZWxlY3Rpb25Db25kaXRpb24gPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRFZGl0b3JDb250ZXh0S2V5cy5jb2x1bW5TZWxlY3Rpb25cbik7XG5mdW5jdGlvbiByZWdpc3RlckNvbHVtblNlbGVjdGlvbihpZDogc3RyaW5nLCBrZXliaW5kaW5nOiBudW1iZXIpOiB2b2lkIHtcblx0S2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlcktleWJpbmRpbmdSdWxlKHtcblx0XHRpZDogaWQsXG5cdFx0cHJpbWFyeToga2V5YmluZGluZyxcblx0XHR3aGVuOiBjb2x1bW5TZWxlY3Rpb25Db25kaXRpb24sXG5cdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCArIDFcblx0fSk7XG59XG5cbnJlZ2lzdGVyQ29sdW1uU2VsZWN0aW9uKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0TGVmdC5pZCwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5MZWZ0QXJyb3cpO1xucmVnaXN0ZXJDb2x1bW5TZWxlY3Rpb24oQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5pZCwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5SaWdodEFycm93KTtcbnJlZ2lzdGVyQ29sdW1uU2VsZWN0aW9uKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0VXAuaWQsIEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVXBBcnJvdyk7XG5yZWdpc3RlckNvbHVtblNlbGVjdGlvbihDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFBhZ2VVcC5pZCwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5QYWdlVXApO1xucmVnaXN0ZXJDb2x1bW5TZWxlY3Rpb24oQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3REb3duLmlkLCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyk7XG5yZWdpc3RlckNvbHVtblNlbGVjdGlvbihDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFBhZ2VEb3duLmlkLCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlBhZ2VEb3duKTtcblxuZnVuY3Rpb24gcmVnaXN0ZXJDb21tYW5kPFQgZXh0ZW5kcyBDb21tYW5kPihjb21tYW5kOiBUKTogVCB7XG5cdGNvbW1hbmQucmVnaXN0ZXIoKTtcblx0cmV0dXJuIGNvbW1hbmQ7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29yZUVkaXRpbmdDb21tYW5kcyB7XG5cblx0ZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvcmVFZGl0aW5nQ29tbWFuZCBleHRlbmRzIEVkaXRvckNvbW1hbmQge1xuXHRcdHB1YmxpYyBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXHRcdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdFx0Ly8gdGhlIGVkaXRvciBoYXMgbm8gdmlldyA9PiBoYXMgbm8gY3Vyc29yc1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJ1bkNvcmVFZGl0aW5nQ29tbWFuZChlZGl0b3IsIHZpZXdNb2RlbCwgYXJncyB8fCB7fSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIGFic3RyYWN0IHJ1bkNvcmVFZGl0aW5nQ29tbWFuZChlZGl0b3I6IElDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IHVua25vd24pOiB2b2lkO1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IExpbmVCcmVha0luc2VydDogRWRpdG9yQ29tbWFuZCA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBDb3JlRWRpdGluZ0NvbW1hbmQge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2xpbmVCcmVha0luc2VydCcsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMud3JpdGFibGUsXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0XHRwcmltYXJ5OiAwLFxuXHRcdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5TyB9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdGluZ0NvbW1hbmQoZWRpdG9yOiBJQ29kZUVkaXRvciwgdmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIEVudGVyT3BlcmF0aW9uLmxpbmVCcmVha0luc2VydCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCB2aWV3TW9kZWwubW9kZWwsIHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKS5tYXAocyA9PiBzLm1vZGVsU3RhdGUuc2VsZWN0aW9uKSkpO1xuXHRcdH1cblx0fSk7XG5cblx0ZXhwb3J0IGNvbnN0IE91dGRlbnQ6IEVkaXRvckNvbW1hbmQgPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IGNsYXNzIGV4dGVuZHMgQ29yZUVkaXRpbmdDb21tYW5kIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICdvdXRkZW50Jyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSxcblx0XHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdFx0XHRrYkV4cHI6IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0XHRcdEVkaXRvckNvbnRleHRLZXlzLnRhYkRvZXNOb3RNb3ZlRm9jdXNcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdGluZ0NvbW1hbmQoZWRpdG9yOiBJQ29kZUVkaXRvciwgdmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIFR5cGVPcGVyYXRpb25zLm91dGRlbnQodmlld01vZGVsLmN1cnNvckNvbmZpZywgdmlld01vZGVsLm1vZGVsLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKCkubWFwKHMgPT4gcy5tb2RlbFN0YXRlLnNlbGVjdGlvbikpKTtcblx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBUYWI6IEVkaXRvckNvbW1hbmQgPSByZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IGNsYXNzIGV4dGVuZHMgQ29yZUVkaXRpbmdDb21tYW5kIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd0YWInLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLndyaXRhYmxlLFxuXHRcdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0XHR3ZWlnaHQ6IENPUkVfV0VJR0hULFxuXHRcdFx0XHRcdGtiRXhwcjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRcdFx0RWRpdG9yQ29udGV4dEtleXMudGFiRG9lc05vdE1vdmVGb2N1c1xuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5UYWJcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cHVibGljIHJ1bkNvcmVFZGl0aW5nQ29tbWFuZChlZGl0b3I6IElDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IElWaWV3TW9kZWwsIGFyZ3M6IHVua25vd24pOiB2b2lkIHtcblx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5pZCwgVHlwZU9wZXJhdGlvbnMudGFiKHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpLm1hcChzID0+IHMubW9kZWxTdGF0ZS5zZWxlY3Rpb24pKSk7XG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRleHBvcnQgY29uc3QgRGVsZXRlTGVmdDogRWRpdG9yQ29tbWFuZCA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBDb3JlRWRpdGluZ0NvbW1hbmQge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2RlbGV0ZUxlZnQnLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdFx0d2VpZ2h0OiBDT1JFX1dFSUdIVCxcblx0XHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuQmFja3NwYWNlLFxuXHRcdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NwYWNlXSxcblx0XHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5CYWNrc3BhY2UsIHNlY29uZGFyeTogW0tleU1vZC5TaGlmdCB8IEtleUNvZGUuQmFja3NwYWNlLCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5SCwgS2V5TW9kLldpbkN0cmwgfCBLZXlDb2RlLkJhY2tzcGFjZV0gfVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwdWJsaWMgcnVuQ29yZUVkaXRpbmdDb21tYW5kKGVkaXRvcjogSUNvZGVFZGl0b3IsIHZpZXdNb2RlbDogSVZpZXdNb2RlbCwgYXJnczogdW5rbm93bik6IHZvaWQge1xuXHRcdFx0Y29uc3QgW3Nob3VsZFB1c2hTdGFja0VsZW1lbnRCZWZvcmUsIGNvbW1hbmRzXSA9IERlbGV0ZU9wZXJhdGlvbnMuZGVsZXRlTGVmdCh2aWV3TW9kZWwuZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCksIHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpLm1hcChzID0+IHMubW9kZWxTdGF0ZS5zZWxlY3Rpb24pLCB2aWV3TW9kZWwuZ2V0Q3Vyc29yQXV0b0Nsb3NlZENoYXJhY3RlcnMoKSk7XG5cdFx0XHRpZiAoc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZSkge1xuXHRcdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHR9XG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUNvbW1hbmRzKHRoaXMuaWQsIGNvbW1hbmRzKTtcblx0XHRcdHZpZXdNb2RlbC5zZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUoRWRpdE9wZXJhdGlvblR5cGUuRGVsZXRpbmdMZWZ0KTtcblx0XHR9XG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBEZWxldGVSaWdodDogRWRpdG9yQ29tbWFuZCA9IHJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgY2xhc3MgZXh0ZW5kcyBDb3JlRWRpdGluZ0NvbW1hbmQge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ2RlbGV0ZVJpZ2h0Jyxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRcdHdlaWdodDogQ09SRV9XRUlHSFQsXG5cdFx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cyxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRlbGV0ZSxcblx0XHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5Q29kZS5EZWxldGUsIHNlY29uZGFyeTogW0tleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5LZXlELCBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuRGVsZXRlXSB9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHB1YmxpYyBydW5Db3JlRWRpdGluZ0NvbW1hbmQoZWRpdG9yOiBJQ29kZUVkaXRvciwgdmlld01vZGVsOiBJVmlld01vZGVsLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0XHRjb25zdCBbc2hvdWxkUHVzaFN0YWNrRWxlbWVudEJlZm9yZSwgY29tbWFuZHNdID0gRGVsZXRlT3BlcmF0aW9ucy5kZWxldGVSaWdodCh2aWV3TW9kZWwuZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCksIHZpZXdNb2RlbC5jdXJzb3JDb25maWcsIHZpZXdNb2RlbC5tb2RlbCwgdmlld01vZGVsLmdldEN1cnNvclN0YXRlcygpLm1hcChzID0+IHMubW9kZWxTdGF0ZS5zZWxlY3Rpb24pKTtcblx0XHRcdGlmIChzaG91bGRQdXNoU3RhY2tFbGVtZW50QmVmb3JlKSB7XG5cdFx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblx0XHRcdH1cblx0XHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHModGhpcy5pZCwgY29tbWFuZHMpO1xuXHRcdFx0dmlld01vZGVsLnNldFByZXZFZGl0T3BlcmF0aW9uVHlwZShFZGl0T3BlcmF0aW9uVHlwZS5EZWxldGluZ1JpZ2h0KTtcblx0XHR9XG5cdH0pO1xuXG5cdGV4cG9ydCBjb25zdCBVbmRvID0gbmV3IGNsYXNzIGV4dGVuZHMgRWRpdG9yT3JOYXRpdmVUZXh0SW5wdXRDb21tYW5kIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKFVuZG9Db21tYW5kKTtcblx0XHR9XG5cdFx0cHVibGljIHJ1bkRPTUNvbW1hbmQoYWN0aXZlRWxlbWVudDogRWxlbWVudCk6IHZvaWQge1xuXHRcdFx0YWN0aXZlRWxlbWVudC5vd25lckRvY3VtZW50LmV4ZWNDb21tYW5kKCd1bmRvJyk7XG5cdFx0fVxuXHRcdHB1YmxpYyBydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzOiB1bmtub3duKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSB8fCBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZWFkT25seSkgPT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVkaXRvci5nZXRNb2RlbCgpLnVuZG8oKTtcblx0XHR9XG5cdH0oKTtcblxuXHRleHBvcnQgY29uc3QgUmVkbyA9IG5ldyBjbGFzcyBleHRlbmRzIEVkaXRvck9yTmF0aXZlVGV4dElucHV0Q29tbWFuZCB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcihSZWRvQ29tbWFuZCk7XG5cdFx0fVxuXHRcdHB1YmxpYyBydW5ET01Db21tYW5kKGFjdGl2ZUVsZW1lbnQ6IEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdGFjdGl2ZUVsZW1lbnQub3duZXJEb2N1bWVudC5leGVjQ29tbWFuZCgncmVkbycpO1xuXHRcdH1cblx0XHRwdWJsaWMgcnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQgfCBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkgfHwgZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ucmVhZE9ubHkpID09PSB0cnVlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBlZGl0b3IuZ2V0TW9kZWwoKS5yZWRvKCk7XG5cdFx0fVxuXHR9KCk7XG59XG5cbi8qKlxuICogQSBjb21tYW5kIHRoYXQgd2lsbCBpbnZva2UgYSBjb21tYW5kIG9uIHRoZSBmb2N1c2VkIGVkaXRvci5cbiAqL1xuY2xhc3MgRWRpdG9ySGFuZGxlckNvbW1hbmQgZXh0ZW5kcyBDb21tYW5kIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oYW5kbGVySWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBoYW5kbGVySWQ6IHN0cmluZywgbWV0YWRhdGE/OiBJQ29tbWFuZE1ldGFkYXRhKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IGlkLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRtZXRhZGF0YVxuXHRcdH0pO1xuXHRcdHRoaXMuX2hhbmRsZXJJZCA9IGhhbmRsZXJJZDtcblx0fVxuXG5cdHB1YmxpYyBydW5Db21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgZWRpdG9yID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIHRoaXMuX2hhbmRsZXJJZCwgYXJncyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJPdmVyd3JpdGFibGVDb21tYW5kKGhhbmRsZXJJZDogc3RyaW5nLCBtZXRhZGF0YT86IElDb21tYW5kTWV0YWRhdGEpOiB2b2lkIHtcblx0cmVnaXN0ZXJDb21tYW5kKG5ldyBFZGl0b3JIYW5kbGVyQ29tbWFuZCgnZGVmYXVsdDonICsgaGFuZGxlcklkLCBoYW5kbGVySWQpKTtcblx0cmVnaXN0ZXJDb21tYW5kKG5ldyBFZGl0b3JIYW5kbGVyQ29tbWFuZChoYW5kbGVySWQsIGhhbmRsZXJJZCwgbWV0YWRhdGEpKTtcbn1cblxucmVnaXN0ZXJPdmVyd3JpdGFibGVDb21tYW5kKEhhbmRsZXIuVHlwZSwge1xuXHRkZXNjcmlwdGlvbjogYFR5cGVgLFxuXHRhcmdzOiBbe1xuXHRcdG5hbWU6ICdhcmdzJyxcblx0XHRzY2hlbWE6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQncmVxdWlyZWQnOiBbJ3RleHQnXSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQndGV4dCc6IHtcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fVxuXHR9XVxufSk7XG5yZWdpc3Rlck92ZXJ3cml0YWJsZUNvbW1hbmQoSGFuZGxlci5SZXBsYWNlUHJldmlvdXNDaGFyKTtcbnJlZ2lzdGVyT3ZlcndyaXRhYmxlQ29tbWFuZChIYW5kbGVyLkNvbXBvc2l0aW9uVHlwZSk7XG5yZWdpc3Rlck92ZXJ3cml0YWJsZUNvbW1hbmQoSGFuZGxlci5Db21wb3NpdGlvblN0YXJ0KTtcbnJlZ2lzdGVyT3ZlcndyaXRhYmxlQ29tbWFuZChIYW5kbGVyLkNvbXBvc2l0aW9uRW5kKTtcbnJlZ2lzdGVyT3ZlcndyaXRhYmxlQ29tbWFuZChIYW5kbGVyLlBhc3RlKTtcbnJlZ2lzdGVyT3ZlcndyaXRhYmxlQ29tbWFuZChIYW5kbGVyLkN1dCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsY0FBYztBQUV2QixTQUFTLFNBQVMsZUFBZ0MsdUJBQXFDLGFBQWEsYUFBYSx3QkFBd0I7QUFDekksU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBNEM7QUFDckQsU0FBUyxhQUFhLHlCQUFnRTtBQUN0RixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGNBQWMsYUFBYSwwQkFBMEI7QUFDOUQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFNB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QjtBQUFBLEVBRU8sV0FBVyxVQUE0QixNQUFxQjtBQUNsRSxVQUFNLFNBQVMsU0FBUyxJQUFJLGtCQUFrQixFQUFFLHFCQUFxQjtBQUNyRSxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUVBLFdBQU8sUUFBUSxZQUFZLEtBQUssWUFBWSxJQUFJO0FBQUEsRUFDakQ7QUFDRDtBQUVBLFNBQVMsNEJBQTRCLFdBQW1CLFVBQW1DO0FBQzFGLGtCQUFnQixJQUFJLHFCQUFxQixhQUFhLFdBQVcsU0FBUyxDQUFDO0FBQzNFLGtCQUFnQixJQUFJLHFCQUFxQixXQUFXLFdBQVcsUUFBUSxDQUFDO0FBQ3pFO0FBRUEsNEJBQTRCLFFBQVEsTUFBTTtBQUFBLEVBQ3pDLGFBQWE7QUFBQSxFQUNiLE1BQU0sQ0FBQztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sUUFBUTtBQUFBLE1BQ1AsUUFBUTtBQUFBLE1BQ1IsWUFBWSxDQUFDLE1BQU07QUFBQSxNQUNuQixjQUFjO0FBQUEsUUFDYixRQUFRO0FBQUEsVUFDUCxRQUFRO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQztBQUNELDRCQUE0QixRQUFRLG1CQUFtQjtBQUN2RCw0QkFBNEIsUUFBUSxlQUFlO0FBQ25ELDRCQUE0QixRQUFRLGdCQUFnQjtBQUNwRCw0QkFBNEIsUUFBUSxjQUFjO0FBQ2xELDRCQUE0QixRQUFRLEtBQUs7QUFDekMsNEJBQTRCLFFBQVEsR0FBRzsiLAogICJuYW1lcyI6IFsiRWRpdG9yU2Nyb2xsXyIsICJEaXJlY3Rpb24iLCAiVW5pdCIsICJSZXZlYWxMaW5lXyIsICJOYXZpZ2F0aW9uQ29tbWFuZFJldmVhbFR5cGUiLCAiQ29yZU5hdmlnYXRpb25Db21tYW5kcyIsICJDb25zdGFudHMiLCAiQ29yZUVkaXRpbmdDb21tYW5kcyJdCn0K
