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
import * as dom from "../../../../base/browser/dom.js";
import { Gesture } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import "./lightBulbWidget.css";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption, ShowLightbulbIconMode } from "../../../common/config/editorOptions.js";
import { GlyphMarginLane, TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { computeIndentLevel } from "../../../common/model/utils.js";
import { autoFixCommandId, quickFixCommandId } from "./codeAction.js";
import * as nls from "../../../../nls.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Range } from "../../../common/core/range.js";
const GUTTER_LIGHTBULB_ICON = registerIcon("gutter-lightbulb", Codicon.lightBulb, nls.localize("gutterLightbulbWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor."));
const GUTTER_LIGHTBULB_AUTO_FIX_ICON = registerIcon("gutter-lightbulb-auto-fix", Codicon.lightbulbAutofix, nls.localize("gutterLightbulbAutoFixWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and a quick fix is available."));
const GUTTER_LIGHTBULB_AIFIX_ICON = registerIcon("gutter-lightbulb-sparkle", Codicon.lightbulbSparkle, nls.localize("gutterLightbulbAIFixWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix is available."));
const GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON = registerIcon("gutter-lightbulb-aifix-auto-fix", Codicon.lightbulbSparkleAutofix, nls.localize("gutterLightbulbAIFixAutoFixWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available."));
const GUTTER_SPARKLE_FILLED_ICON = registerIcon("gutter-lightbulb-sparkle-filled", Codicon.sparkleFilled, nls.localize("gutterLightbulbSparkleFilledWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available."));
var LightBulbState;
((LightBulbState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Hidden"] = 0] = "Hidden";
    Type2[Type2["Showing"] = 1] = "Showing";
  })(Type = LightBulbState2.Type || (LightBulbState2.Type = {}));
  LightBulbState2.Hidden = { type: 0 /* Hidden */ };
  class Showing {
    constructor(actions, trigger, editorPosition, widgetPosition) {
      this.actions = actions;
      this.trigger = trigger;
      this.editorPosition = editorPosition;
      this.widgetPosition = widgetPosition;
      this.type = 1 /* Showing */;
    }
  }
  LightBulbState2.Showing = Showing;
})(LightBulbState || (LightBulbState = {}));
function computeLightBulbInfo(actions, trigger, preferredKbLabel, quickFixKbLabel, forGutter = false) {
  if (actions.validActions.length <= 0) {
    return void 0;
  }
  let icon;
  let autoRun = false;
  if (actions.allAIFixes) {
    icon = forGutter ? GUTTER_SPARKLE_FILLED_ICON : Codicon.sparkleFilled;
    if (actions.validActions.length === 1) {
      autoRun = true;
    }
  } else if (actions.hasAutoFix) {
    if (actions.hasAIFix) {
      icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON : Codicon.lightbulbSparkleAutofix;
    } else {
      icon = forGutter ? GUTTER_LIGHTBULB_AUTO_FIX_ICON : Codicon.lightbulbAutofix;
    }
  } else if (actions.hasAIFix) {
    icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_ICON : Codicon.lightbulbSparkle;
  } else {
    icon = forGutter ? GUTTER_LIGHTBULB_ICON : Codicon.lightBulb;
  }
  let title;
  if (autoRun) {
    title = nls.localize("codeActionAutoRun", "Run: {0}", actions.validActions[0].action.title);
  } else if (actions.hasAutoFix && preferredKbLabel) {
    title = nls.localize("preferredcodeActionWithKb", "Show Code Actions. Preferred Quick Fix Available ({0})", preferredKbLabel);
  } else if (!actions.hasAutoFix && quickFixKbLabel) {
    title = nls.localize("codeActionWithKb", "Show Code Actions ({0})", quickFixKbLabel);
  } else {
    title = nls.localize("codeAction", "Show Code Actions");
  }
  return { actions, trigger, icon, autoRun, title, isGutter: forGutter };
}
let LightBulbWidget = class extends Disposable {
  constructor(_editor, _keybindingService) {
    super();
    this._editor = _editor;
    this._keybindingService = _keybindingService;
    this.onlyWithEmptySelection = false;
    this._onClick = this._register(new Emitter());
    this.onClick = this._onClick.event;
    this._state = observableValue(this, LightBulbState.Hidden);
    this._gutterState = observableValue(this, LightBulbState.Hidden);
    this._combinedInfo = derived(this, (reader) => {
      const gutterState = this._gutterState.read(reader);
      if (gutterState.type === 1 /* Showing */) {
        return LightBulbWidget._computeLightBulbInfo(gutterState, true, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
      }
      const state = this._state.read(reader);
      if (state.type === 1 /* Showing */) {
        return LightBulbWidget._computeLightBulbInfo(state, false, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
      }
      return void 0;
    });
    this.lightBulbInfo = this._combinedInfo;
    this._iconClasses = [];
    this.lightbulbClasses = [
      "codicon-" + GUTTER_LIGHTBULB_ICON.id,
      "codicon-" + GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON.id,
      "codicon-" + GUTTER_LIGHTBULB_AUTO_FIX_ICON.id,
      "codicon-" + GUTTER_LIGHTBULB_AIFIX_ICON.id,
      "codicon-" + GUTTER_SPARKLE_FILLED_ICON.id
    ];
    this._preferredKbLabel = observableValue(this, void 0);
    this._quickFixKbLabel = observableValue(this, void 0);
    this.gutterDecoration = LightBulbWidget.GUTTER_DECORATION;
    this._domNode = dom.$("div.lightBulbWidget");
    this._domNode.role = "listbox";
    this._register(Gesture.ignoreTarget(this._domNode));
    this._editor.addContentWidget(this);
    this._register(this._editor.onDidChangeModelContent((_) => {
      const editorModel = this._editor.getModel();
      const state = this._state.get();
      if (state.type !== 1 /* Showing */ || !editorModel || state.editorPosition.lineNumber >= editorModel.getLineCount()) {
        this.hide();
      }
      const gutterState = this._gutterState.get();
      if (gutterState.type !== 1 /* Showing */ || !editorModel || gutterState.editorPosition.lineNumber >= editorModel.getLineCount()) {
        this.gutterHide();
      }
    }));
    this._register(dom.addStandardDisposableGenericMouseDownListener(this._domNode, (e) => {
      const state = this._state.get();
      if (state.type !== 1 /* Showing */) {
        return;
      }
      this._editor.focus();
      e.preventDefault();
      const { top, height } = dom.getDomNodePagePosition(this._domNode);
      const lineHeight = this._editor.getOption(EditorOption.lineHeight);
      let pad = Math.floor(lineHeight / 3);
      if (state.widgetPosition.position !== null && state.widgetPosition.position.lineNumber < state.editorPosition.lineNumber) {
        pad += lineHeight;
      }
      this._onClick.fire({
        x: e.posx,
        y: top + height + pad,
        actions: state.actions,
        trigger: state.trigger
      });
    }));
    this._register(dom.addDisposableListener(this._domNode, "mouseenter", (e) => {
      if ((e.buttons & 1) !== 1) {
        return;
      }
      this.hide();
    }));
    this._register(Event.runAndSubscribe(this._keybindingService.onDidUpdateKeybindings, () => {
      this._preferredKbLabel.set(this._keybindingService.lookupKeybinding(autoFixCommandId)?.getLabel() ?? void 0, void 0);
      this._quickFixKbLabel.set(this._keybindingService.lookupKeybinding(quickFixCommandId)?.getLabel() ?? void 0, void 0);
    }));
    this._register(autorun((reader) => {
      const info = this._combinedInfo.read(reader);
      this._updateLightBulbTitleAndIcon(info);
      this._updateGutterDecorationOptions(info);
    }));
    this._register(this._editor.onMouseDown(async (e) => {
      if (!e.target.element || !this.lightbulbClasses.some((cls) => e.target.element && e.target.element.classList.contains(cls))) {
        return;
      }
      const gutterState = this._gutterState.get();
      if (gutterState.type !== 1 /* Showing */) {
        return;
      }
      this._editor.focus();
      const { top, height } = dom.getDomNodePagePosition(e.target.element);
      const lineHeight = this._editor.getOption(EditorOption.lineHeight);
      let pad = Math.floor(lineHeight / 3);
      if (gutterState.widgetPosition.position !== null && gutterState.widgetPosition.position.lineNumber < gutterState.editorPosition.lineNumber) {
        pad += lineHeight;
      }
      this._onClick.fire({
        x: e.event.posx,
        y: top + height + pad,
        actions: gutterState.actions,
        trigger: gutterState.trigger
      });
    }));
  }
  static _computeLightBulbInfo(state, forGutter, preferredKbLabel, quickFixKbLabel) {
    if (state.type !== 1 /* Showing */) {
      return void 0;
    }
    return computeLightBulbInfo(state.actions, state.trigger, preferredKbLabel, quickFixKbLabel, forGutter);
  }
  dispose() {
    super.dispose();
    this._editor.removeContentWidget(this);
    if (this._gutterDecorationID) {
      this._removeGutterDecoration(this._gutterDecorationID);
    }
  }
  getId() {
    return "LightBulbWidget";
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    const state = this._state.get();
    return state.type === 1 /* Showing */ ? state.widgetPosition : null;
  }
  update(actions, trigger, atPosition) {
    if (actions.validActions.length <= 0) {
      this.gutterHide();
      return this.hide();
    }
    if (this.onlyWithEmptySelection && !this._editor.getSelection()?.isEmpty()) {
      this.gutterHide();
      return this.hide();
    }
    const hasTextFocus = this._editor.hasTextFocus();
    if (!hasTextFocus) {
      this.gutterHide();
      return this.hide();
    }
    const options = this._editor.getOptions();
    if (options.get(EditorOption.lightbulb).enabled === ShowLightbulbIconMode.Off) {
      this.gutterHide();
      return this.hide();
    }
    const model = this._editor.getModel();
    if (!model) {
      this.gutterHide();
      return this.hide();
    }
    const { lineNumber, column } = model.validatePosition(atPosition);
    const tabSize = model.getOptions().tabSize;
    const fontInfo = this._editor.getOptions().get(EditorOption.fontInfo);
    const lineContent = model.getLineContent(lineNumber);
    const indent = computeIndentLevel(lineContent, tabSize);
    const lineHasSpace = fontInfo.spaceWidth * indent > 22;
    const isFolded = (lineNumber2) => {
      return lineNumber2 > 2 && this._editor.getTopForLineNumber(lineNumber2) === this._editor.getTopForLineNumber(lineNumber2 - 1);
    };
    const currLineDecorations = this._editor.getLineDecorations(lineNumber);
    let hasDecoration = false;
    if (currLineDecorations) {
      for (const decoration of currLineDecorations) {
        const glyphClass = decoration.options.glyphMarginClassName;
        if (glyphClass && !this.lightbulbClasses.some((className) => glyphClass.includes(className))) {
          hasDecoration = true;
          break;
        }
      }
    }
    let effectiveLineNumber = lineNumber;
    let effectiveColumnNumber = 1;
    if (!lineHasSpace) {
      const isLineEmptyOrIndented = (lineNumber2) => {
        const lineContent2 = model.getLineContent(lineNumber2);
        return /^\s*$|^\s+/.test(lineContent2) || lineContent2.length <= effectiveColumnNumber;
      };
      if (lineNumber > 1 && !isFolded(lineNumber - 1)) {
        const lineCount = model.getLineCount();
        const endLine = lineNumber === lineCount;
        const prevLineEmptyOrIndented = lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1);
        const nextLineEmptyOrIndented = !endLine && isLineEmptyOrIndented(lineNumber + 1);
        const currLineEmptyOrIndented = isLineEmptyOrIndented(lineNumber);
        const notEmpty = !nextLineEmptyOrIndented && !prevLineEmptyOrIndented;
        if (!nextLineEmptyOrIndented && !prevLineEmptyOrIndented && !hasDecoration) {
          this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
            position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
            preference: LightBulbWidget._posPref
          }), void 0);
          this.renderGutterLightbub();
          return this.hide();
        } else if (prevLineEmptyOrIndented || endLine || prevLineEmptyOrIndented && !currLineEmptyOrIndented) {
          effectiveLineNumber -= 1;
        } else if (nextLineEmptyOrIndented || notEmpty && currLineEmptyOrIndented) {
          effectiveLineNumber += 1;
        }
      } else if (lineNumber === 1 && (lineNumber === model.getLineCount() || !isLineEmptyOrIndented(lineNumber + 1) && !isLineEmptyOrIndented(lineNumber))) {
        this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
          position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
          preference: LightBulbWidget._posPref
        }), void 0);
        if (hasDecoration) {
          this.gutterHide();
        } else {
          this.renderGutterLightbub();
          return this.hide();
        }
      } else if (lineNumber < model.getLineCount() && !isFolded(lineNumber + 1)) {
        effectiveLineNumber += 1;
      } else if (column * fontInfo.spaceWidth < 22) {
        return this.hide();
      }
      effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;
    }
    this._state.set(new LightBulbState.Showing(actions, trigger, atPosition, {
      position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
      preference: LightBulbWidget._posPref
    }), void 0);
    if (this._gutterDecorationID) {
      this._removeGutterDecoration(this._gutterDecorationID);
      this.gutterHide();
    }
    const validActions = actions.validActions;
    const actionKind = actions.validActions[0].action.kind;
    if (validActions.length !== 1 || !actionKind) {
      this._editor.layoutContentWidget(this);
      return;
    }
    this._editor.layoutContentWidget(this);
  }
  hide() {
    if (this._state.get() === LightBulbState.Hidden) {
      return;
    }
    this._state.set(LightBulbState.Hidden, void 0);
    this._editor.layoutContentWidget(this);
  }
  gutterHide() {
    if (this._gutterState.get() === LightBulbState.Hidden) {
      return;
    }
    if (this._gutterDecorationID) {
      this._removeGutterDecoration(this._gutterDecorationID);
    }
    this._gutterState.set(LightBulbState.Hidden, void 0);
  }
  _updateLightBulbTitleAndIcon(info) {
    this._domNode.classList.remove(...this._iconClasses);
    this._iconClasses = [];
    if (!info || info.isGutter) {
      return;
    }
    this._domNode.title = info.title;
    this._iconClasses = ThemeIcon.asClassNameArray(info.icon);
    this._domNode.classList.add(...this._iconClasses);
  }
  _updateGutterDecorationOptions(info) {
    if (!info || !info.isGutter) {
      return;
    }
    this.gutterDecoration = ModelDecorationOptions.register({
      description: "codicon-gutter-lightbulb-decoration",
      glyphMarginClassName: ThemeIcon.asClassName(info.icon),
      glyphMargin: { position: GlyphMarginLane.Left },
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
  }
  /* Gutter Helper Functions */
  renderGutterLightbub() {
    const selection = this._editor.getSelection();
    if (!selection) {
      return;
    }
    if (this._gutterDecorationID === void 0) {
      this._addGutterDecoration(selection.startLineNumber);
    } else {
      this._updateGutterDecoration(this._gutterDecorationID, selection.startLineNumber);
    }
  }
  _addGutterDecoration(lineNumber) {
    this._editor.changeDecorations((accessor) => {
      this._gutterDecorationID = accessor.addDecoration(new Range(lineNumber, 0, lineNumber, 0), this.gutterDecoration);
    });
  }
  _removeGutterDecoration(decorationId) {
    this._editor.changeDecorations((accessor) => {
      accessor.removeDecoration(decorationId);
      this._gutterDecorationID = void 0;
    });
  }
  _updateGutterDecoration(decorationId, lineNumber) {
    this._editor.changeDecorations((accessor) => {
      accessor.changeDecoration(decorationId, new Range(lineNumber, 0, lineNumber, 0));
      accessor.changeDecorationOptions(decorationId, this.gutterDecoration);
    });
  }
};
LightBulbWidget.GUTTER_DECORATION = ModelDecorationOptions.register({
  description: "codicon-gutter-lightbulb-decoration",
  glyphMarginClassName: ThemeIcon.asClassName(Codicon.lightBulb),
  glyphMargin: { position: GlyphMarginLane.Left },
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
});
LightBulbWidget.ID = "editor.contrib.lightbulbWidget";
LightBulbWidget._posPref = [ContentWidgetPositionPreference.EXACT];
LightBulbWidget = __decorateClass([
  __decorateParam(1, IKeybindingService)
], LightBulbWidget);
export {
  LightBulbWidget,
  computeLightBulbInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvZGVBY3Rpb25cXGJyb3dzZXJcXGxpZ2h0QnVsYldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEdlc3R1cmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0ICcuL2xpZ2h0QnVsYldpZGdldC5jc3MnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uLCBJRWRpdG9yTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIFNob3dMaWdodGJ1bGJJY29uTW9kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBHbHlwaE1hcmdpbkxhbmUsIElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUluZGVudExldmVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3V0aWxzLmpzJztcbmltcG9ydCB7IGF1dG9GaXhDb21tYW5kSWQsIHF1aWNrRml4Q29tbWFuZElkIH0gZnJvbSAnLi9jb2RlQWN0aW9uLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25TZXQsIENvZGVBY3Rpb25UcmlnZ2VyIH0gZnJvbSAnLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuXG5jb25zdCBHVVRURVJfTElHSFRCVUxCX0lDT04gPSByZWdpc3Rlckljb24oJ2d1dHRlci1saWdodGJ1bGInLCBDb2RpY29uLmxpZ2h0QnVsYiwgbmxzLmxvY2FsaXplKCdndXR0ZXJMaWdodGJ1bGJXaWRnZXQnLCAnSWNvbiB3aGljaCBzcGF3bnMgY29kZSBhY3Rpb25zIG1lbnUgZnJvbSB0aGUgZ3V0dGVyIHdoZW4gdGhlcmUgaXMgbm8gc3BhY2UgaW4gdGhlIGVkaXRvci4nKSk7XG5jb25zdCBHVVRURVJfTElHSFRCVUxCX0FVVE9fRklYX0lDT04gPSByZWdpc3Rlckljb24oJ2d1dHRlci1saWdodGJ1bGItYXV0by1maXgnLCBDb2RpY29uLmxpZ2h0YnVsYkF1dG9maXgsIG5scy5sb2NhbGl6ZSgnZ3V0dGVyTGlnaHRidWxiQXV0b0ZpeFdpZGdldCcsICdJY29uIHdoaWNoIHNwYXducyBjb2RlIGFjdGlvbnMgbWVudSBmcm9tIHRoZSBndXR0ZXIgd2hlbiB0aGVyZSBpcyBubyBzcGFjZSBpbiB0aGUgZWRpdG9yIGFuZCBhIHF1aWNrIGZpeCBpcyBhdmFpbGFibGUuJykpO1xuY29uc3QgR1VUVEVSX0xJR0hUQlVMQl9BSUZJWF9JQ09OID0gcmVnaXN0ZXJJY29uKCdndXR0ZXItbGlnaHRidWxiLXNwYXJrbGUnLCBDb2RpY29uLmxpZ2h0YnVsYlNwYXJrbGUsIG5scy5sb2NhbGl6ZSgnZ3V0dGVyTGlnaHRidWxiQUlGaXhXaWRnZXQnLCAnSWNvbiB3aGljaCBzcGF3bnMgY29kZSBhY3Rpb25zIG1lbnUgZnJvbSB0aGUgZ3V0dGVyIHdoZW4gdGhlcmUgaXMgbm8gc3BhY2UgaW4gdGhlIGVkaXRvciBhbmQgYW4gQUkgZml4IGlzIGF2YWlsYWJsZS4nKSk7XG5jb25zdCBHVVRURVJfTElHSFRCVUxCX0FJRklYX0FVVE9fRklYX0lDT04gPSByZWdpc3Rlckljb24oJ2d1dHRlci1saWdodGJ1bGItYWlmaXgtYXV0by1maXgnLCBDb2RpY29uLmxpZ2h0YnVsYlNwYXJrbGVBdXRvZml4LCBubHMubG9jYWxpemUoJ2d1dHRlckxpZ2h0YnVsYkFJRml4QXV0b0ZpeFdpZGdldCcsICdJY29uIHdoaWNoIHNwYXducyBjb2RlIGFjdGlvbnMgbWVudSBmcm9tIHRoZSBndXR0ZXIgd2hlbiB0aGVyZSBpcyBubyBzcGFjZSBpbiB0aGUgZWRpdG9yIGFuZCBhbiBBSSBmaXggYW5kIGEgcXVpY2sgZml4IGlzIGF2YWlsYWJsZS4nKSk7XG5jb25zdCBHVVRURVJfU1BBUktMRV9GSUxMRURfSUNPTiA9IHJlZ2lzdGVySWNvbignZ3V0dGVyLWxpZ2h0YnVsYi1zcGFya2xlLWZpbGxlZCcsIENvZGljb24uc3BhcmtsZUZpbGxlZCwgbmxzLmxvY2FsaXplKCdndXR0ZXJMaWdodGJ1bGJTcGFya2xlRmlsbGVkV2lkZ2V0JywgJ0ljb24gd2hpY2ggc3Bhd25zIGNvZGUgYWN0aW9ucyBtZW51IGZyb20gdGhlIGd1dHRlciB3aGVuIHRoZXJlIGlzIG5vIHNwYWNlIGluIHRoZSBlZGl0b3IgYW5kIGFuIEFJIGZpeCBhbmQgYSBxdWljayBmaXggaXMgYXZhaWxhYmxlLicpKTtcblxuZXhwb3J0IGludGVyZmFjZSBMaWdodEJ1bGJJbmZvIHtcblx0cmVhZG9ubHkgYWN0aW9uczogQ29kZUFjdGlvblNldDtcblx0cmVhZG9ubHkgdHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXI7XG5cdHJlYWRvbmx5IGljb246IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgYXV0b1J1bjogYm9vbGVhbjtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZztcblx0cmVhZG9ubHkgaXNHdXR0ZXI6IGJvb2xlYW47XG59XG5cbm5hbWVzcGFjZSBMaWdodEJ1bGJTdGF0ZSB7XG5cblx0ZXhwb3J0IGNvbnN0IGVudW0gVHlwZSB7XG5cdFx0SGlkZGVuLFxuXHRcdFNob3dpbmcsXG5cdH1cblxuXHRleHBvcnQgY29uc3QgSGlkZGVuID0geyB0eXBlOiBUeXBlLkhpZGRlbiB9IGFzIGNvbnN0O1xuXG5cdGV4cG9ydCBjbGFzcyBTaG93aW5nIHtcblx0XHRyZWFkb25seSB0eXBlID0gVHlwZS5TaG93aW5nO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgYWN0aW9uczogQ29kZUFjdGlvblNldCxcblx0XHRcdHB1YmxpYyByZWFkb25seSB0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlcixcblx0XHRcdHB1YmxpYyByZWFkb25seSBlZGl0b3JQb3NpdGlvbjogSVBvc2l0aW9uLFxuXHRcdFx0cHVibGljIHJlYWRvbmx5IHdpZGdldFBvc2l0aW9uOiBJQ29udGVudFdpZGdldFBvc2l0aW9uLFxuXHRcdCkgeyB9XG5cdH1cblxuXHRleHBvcnQgdHlwZSBTdGF0ZSA9IHR5cGVvZiBIaWRkZW4gfCBTaG93aW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcHV0ZUxpZ2h0QnVsYkluZm8oYWN0aW9uczogQ29kZUFjdGlvblNldCwgdHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIsIHByZWZlcnJlZEtiTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgcXVpY2tGaXhLYkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIGZvckd1dHRlcjogYm9vbGVhbiA9IGZhbHNlKTogTGlnaHRCdWxiSW5mbyB8IHVuZGVmaW5lZCB7XG5cdGlmIChhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPD0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgaWNvbjogVGhlbWVJY29uO1xuXHRsZXQgYXV0b1J1biA9IGZhbHNlO1xuXHRpZiAoYWN0aW9ucy5hbGxBSUZpeGVzKSB7XG5cdFx0aWNvbiA9IGZvckd1dHRlciA/IEdVVFRFUl9TUEFSS0xFX0ZJTExFRF9JQ09OIDogQ29kaWNvbi5zcGFya2xlRmlsbGVkO1xuXHRcdGlmIChhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGF1dG9SdW4gPSB0cnVlO1xuXHRcdH1cblx0fSBlbHNlIGlmIChhY3Rpb25zLmhhc0F1dG9GaXgpIHtcblx0XHRpZiAoYWN0aW9ucy5oYXNBSUZpeCkge1xuXHRcdFx0aWNvbiA9IGZvckd1dHRlciA/IEdVVFRFUl9MSUdIVEJVTEJfQUlGSVhfQVVUT19GSVhfSUNPTiA6IENvZGljb24ubGlnaHRidWxiU3BhcmtsZUF1dG9maXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGljb24gPSBmb3JHdXR0ZXIgPyBHVVRURVJfTElHSFRCVUxCX0FVVE9fRklYX0lDT04gOiBDb2RpY29uLmxpZ2h0YnVsYkF1dG9maXg7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKGFjdGlvbnMuaGFzQUlGaXgpIHtcblx0XHRpY29uID0gZm9yR3V0dGVyID8gR1VUVEVSX0xJR0hUQlVMQl9BSUZJWF9JQ09OIDogQ29kaWNvbi5saWdodGJ1bGJTcGFya2xlO1xuXHR9IGVsc2Uge1xuXHRcdGljb24gPSBmb3JHdXR0ZXIgPyBHVVRURVJfTElHSFRCVUxCX0lDT04gOiBDb2RpY29uLmxpZ2h0QnVsYjtcblx0fVxuXG5cdGxldCB0aXRsZTogc3RyaW5nO1xuXHRpZiAoYXV0b1J1bikge1xuXHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKCdjb2RlQWN0aW9uQXV0b1J1bicsIFwiUnVuOiB7MH1cIiwgYWN0aW9ucy52YWxpZEFjdGlvbnNbMF0uYWN0aW9uLnRpdGxlKTtcblx0fSBlbHNlIGlmIChhY3Rpb25zLmhhc0F1dG9GaXggJiYgcHJlZmVycmVkS2JMYWJlbCkge1xuXHRcdHRpdGxlID0gbmxzLmxvY2FsaXplKCdwcmVmZXJyZWRjb2RlQWN0aW9uV2l0aEtiJywgXCJTaG93IENvZGUgQWN0aW9ucy4gUHJlZmVycmVkIFF1aWNrIEZpeCBBdmFpbGFibGUgKHswfSlcIiwgcHJlZmVycmVkS2JMYWJlbCk7XG5cdH0gZWxzZSBpZiAoIWFjdGlvbnMuaGFzQXV0b0ZpeCAmJiBxdWlja0ZpeEtiTGFiZWwpIHtcblx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSgnY29kZUFjdGlvbldpdGhLYicsIFwiU2hvdyBDb2RlIEFjdGlvbnMgKHswfSlcIiwgcXVpY2tGaXhLYkxhYmVsKTtcblx0fSBlbHNlIHtcblx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSgnY29kZUFjdGlvbicsIFwiU2hvdyBDb2RlIEFjdGlvbnNcIik7XG5cdH1cblxuXHRyZXR1cm4geyBhY3Rpb25zLCB0cmlnZ2VyLCBpY29uLCBhdXRvUnVuLCB0aXRsZSwgaXNHdXR0ZXI6IGZvckd1dHRlciB9O1xufVxuXG5leHBvcnQgY2xhc3MgTGlnaHRCdWxiV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblx0cHJpdmF0ZSBfZ3V0dGVyRGVjb3JhdGlvbklEOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0b25seVdpdGhFbXB0eVNlbGVjdGlvbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEdVVFRFUl9ERUNPUkFUSU9OID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdjb2RpY29uLWd1dHRlci1saWdodGJ1bGItZGVjb3JhdGlvbicsXG5cdFx0Z2x5cGhNYXJnaW5DbGFzc05hbWU6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmxpZ2h0QnVsYiksXG5cdFx0Z2x5cGhNYXJnaW46IHsgcG9zaXRpb246IEdseXBoTWFyZ2luTGFuZS5MZWZ0IH0sXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIubGlnaHRidWxiV2lkZ2V0JztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfcG9zUHJlZiA9IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkVYQUNUXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSB4OiBudW1iZXI7IHJlYWRvbmx5IHk6IG51bWJlcjsgcmVhZG9ubHkgYWN0aW9uczogQ29kZUFjdGlvblNldDsgcmVhZG9ubHkgdHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIgfT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkNsaWNrID0gdGhpcy5fb25DbGljay5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxMaWdodEJ1bGJTdGF0ZS5TdGF0ZT4odGhpcywgTGlnaHRCdWxiU3RhdGUuSGlkZGVuKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3V0dGVyU3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8TGlnaHRCdWxiU3RhdGUuU3RhdGU+KHRoaXMsIExpZ2h0QnVsYlN0YXRlLkhpZGRlbik7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29tYmluZWRJbmZvID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGd1dHRlclN0YXRlID0gdGhpcy5fZ3V0dGVyU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmIChndXR0ZXJTdGF0ZS50eXBlID09PSBMaWdodEJ1bGJTdGF0ZS5UeXBlLlNob3dpbmcpIHtcblx0XHRcdHJldHVybiBMaWdodEJ1bGJXaWRnZXQuX2NvbXB1dGVMaWdodEJ1bGJJbmZvKGd1dHRlclN0YXRlLCB0cnVlLCB0aGlzLl9wcmVmZXJyZWRLYkxhYmVsLnJlYWQocmVhZGVyKSwgdGhpcy5fcXVpY2tGaXhLYkxhYmVsLnJlYWQocmVhZGVyKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGlmIChzdGF0ZS50eXBlID09PSBMaWdodEJ1bGJTdGF0ZS5UeXBlLlNob3dpbmcpIHtcblx0XHRcdHJldHVybiBMaWdodEJ1bGJXaWRnZXQuX2NvbXB1dGVMaWdodEJ1bGJJbmZvKHN0YXRlLCBmYWxzZSwgdGhpcy5fcHJlZmVycmVkS2JMYWJlbC5yZWFkKHJlYWRlciksIHRoaXMuX3F1aWNrRml4S2JMYWJlbC5yZWFkKHJlYWRlcikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGlnaHRCdWxiSW5mbzogSU9ic2VydmFibGU8TGlnaHRCdWxiSW5mbyB8IHVuZGVmaW5lZD4gPSB0aGlzLl9jb21iaW5lZEluZm87XG5cblx0cHJpdmF0ZSBfaWNvbkNsYXNzZXM6IHN0cmluZ1tdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBsaWdodGJ1bGJDbGFzc2VzID0gW1xuXHRcdCdjb2RpY29uLScgKyBHVVRURVJfTElHSFRCVUxCX0lDT04uaWQsXG5cdFx0J2NvZGljb24tJyArIEdVVFRFUl9MSUdIVEJVTEJfQUlGSVhfQVVUT19GSVhfSUNPTi5pZCxcblx0XHQnY29kaWNvbi0nICsgR1VUVEVSX0xJR0hUQlVMQl9BVVRPX0ZJWF9JQ09OLmlkLFxuXHRcdCdjb2RpY29uLScgKyBHVVRURVJfTElHSFRCVUxCX0FJRklYX0lDT04uaWQsXG5cdFx0J2NvZGljb24tJyArIEdVVFRFUl9TUEFSS0xFX0ZJTExFRF9JQ09OLmlkXG5cdF07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJlZmVycmVkS2JMYWJlbCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrRml4S2JMYWJlbCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cblx0cHJpdmF0ZSBndXR0ZXJEZWNvcmF0aW9uOiBNb2RlbERlY29yYXRpb25PcHRpb25zID0gTGlnaHRCdWxiV2lkZ2V0LkdVVFRFUl9ERUNPUkFUSU9OO1xuXG5cdHByaXZhdGUgc3RhdGljIF9jb21wdXRlTGlnaHRCdWxiSW5mbyhzdGF0ZTogTGlnaHRCdWxiU3RhdGUuU3RhdGUsIGZvckd1dHRlcjogYm9vbGVhbiwgcHJlZmVycmVkS2JMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBxdWlja0ZpeEtiTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCk6IExpZ2h0QnVsYkluZm8gfCB1bmRlZmluZWQge1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBMaWdodEJ1bGJTdGF0ZS5UeXBlLlNob3dpbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBjb21wdXRlTGlnaHRCdWxiSW5mbyhzdGF0ZS5hY3Rpb25zLCBzdGF0ZS50cmlnZ2VyLCBwcmVmZXJyZWRLYkxhYmVsLCBxdWlja0ZpeEtiTGFiZWwsIGZvckd1dHRlcik7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvbS4kKCdkaXYubGlnaHRCdWxiV2lkZ2V0Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5yb2xlID0gJ2xpc3Rib3gnO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuaWdub3JlVGFyZ2V0KHRoaXMuX2RvbU5vZGUpKTtcblxuXHRcdHRoaXMuX2VkaXRvci5hZGRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KF8gPT4ge1xuXHRcdFx0Ly8gY2FuY2VsIHdoZW4gdGhlIGxpbmUgaW4gcXVlc3Rpb24gaGFzIGJlZW4gcmVtb3ZlZFxuXHRcdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0XHRpZiAoc3RhdGUudHlwZSAhPT0gTGlnaHRCdWxiU3RhdGUuVHlwZS5TaG93aW5nIHx8ICFlZGl0b3JNb2RlbCB8fCBzdGF0ZS5lZGl0b3JQb3NpdGlvbi5saW5lTnVtYmVyID49IGVkaXRvck1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBndXR0ZXJTdGF0ZSA9IHRoaXMuX2d1dHRlclN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKGd1dHRlclN0YXRlLnR5cGUgIT09IExpZ2h0QnVsYlN0YXRlLlR5cGUuU2hvd2luZyB8fCAhZWRpdG9yTW9kZWwgfHwgZ3V0dGVyU3RhdGUuZWRpdG9yUG9zaXRpb24ubGluZU51bWJlciA+PSBlZGl0b3JNb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHR0aGlzLmd1dHRlckhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsIGUgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRcdGlmIChzdGF0ZS50eXBlICE9PSBMaWdodEJ1bGJTdGF0ZS5UeXBlLlNob3dpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhhdCBmb2N1cyAvIGN1cnNvciBsb2NhdGlvbiBpcyBub3QgbG9zdCB3aGVuIGNsaWNraW5nIHdpZGdldCBpY29uXG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0Ly8gYSBiaXQgb2YgZXh0cmEgd29yayB0byBtYWtlIHN1cmUgdGhlIG1lbnVcblx0XHRcdC8vIGRvZXNuJ3QgY292ZXIgdGhlIGxpbmUtdGV4dFxuXHRcdFx0Y29uc3QgeyB0b3AsIGhlaWdodCB9ID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy5fZG9tTm9kZSk7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cblx0XHRcdGxldCBwYWQgPSBNYXRoLmZsb29yKGxpbmVIZWlnaHQgLyAzKTtcblx0XHRcdGlmIChzdGF0ZS53aWRnZXRQb3NpdGlvbi5wb3NpdGlvbiAhPT0gbnVsbCAmJiBzdGF0ZS53aWRnZXRQb3NpdGlvbi5wb3NpdGlvbi5saW5lTnVtYmVyIDwgc3RhdGUuZWRpdG9yUG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHRwYWQgKz0gbGluZUhlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25DbGljay5maXJlKHtcblx0XHRcdFx0eDogZS5wb3N4LFxuXHRcdFx0XHR5OiB0b3AgKyBoZWlnaHQgKyBwYWQsXG5cdFx0XHRcdGFjdGlvbnM6IHN0YXRlLmFjdGlvbnMsXG5cdFx0XHRcdHRyaWdnZXI6IHN0YXRlLnRyaWdnZXIsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2RvbU5vZGUsICdtb3VzZWVudGVyJywgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGlmICgoZS5idXR0b25zICYgMSkgIT09IDEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gbW91c2UgZW50ZXJzIGxpZ2h0YnVsYiB3aGlsZSB0aGUgcHJpbWFyeS9sZWZ0IGJ1dHRvblxuXHRcdFx0Ly8gaXMgYmVpbmcgcHJlc3NlZCAtPiBoaWRlIHRoZSBsaWdodGJ1bGJcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MsICgpID0+IHtcblx0XHRcdHRoaXMuX3ByZWZlcnJlZEtiTGFiZWwuc2V0KHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYXV0b0ZpeENvbW1hbmRJZCk/LmdldExhYmVsKCkgPz8gdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fcXVpY2tGaXhLYkxhYmVsLnNldCh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHF1aWNrRml4Q29tbWFuZElkKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQXV0b3J1biB0byB1cGRhdGUgdGhlIERPTSBiYXNlZCBvbiBzdGF0ZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX2NvbWJpbmVkSW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl91cGRhdGVMaWdodEJ1bGJUaXRsZUFuZEljb24oaW5mbyk7XG5cdFx0XHR0aGlzLl91cGRhdGVHdXR0ZXJEZWNvcmF0aW9uT3B0aW9ucyhpbmZvKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25Nb3VzZURvd24oYXN5bmMgKGU6IElFZGl0b3JNb3VzZUV2ZW50KSA9PiB7XG5cblx0XHRcdGlmICghZS50YXJnZXQuZWxlbWVudCB8fCAhdGhpcy5saWdodGJ1bGJDbGFzc2VzLnNvbWUoY2xzID0+IGUudGFyZ2V0LmVsZW1lbnQgJiYgZS50YXJnZXQuZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoY2xzKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBndXR0ZXJTdGF0ZSA9IHRoaXMuX2d1dHRlclN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKGd1dHRlclN0YXRlLnR5cGUgIT09IExpZ2h0QnVsYlN0YXRlLlR5cGUuU2hvd2luZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1ha2Ugc3VyZSB0aGF0IGZvY3VzIC8gY3Vyc29yIGxvY2F0aW9uIGlzIG5vdCBsb3N0IHdoZW4gY2xpY2tpbmcgd2lkZ2V0IGljb25cblx0XHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXG5cdFx0XHQvLyBhIGJpdCBvZiBleHRyYSB3b3JrIHRvIG1ha2Ugc3VyZSB0aGUgbWVudVxuXHRcdFx0Ly8gZG9lc24ndCBjb3ZlciB0aGUgbGluZS10ZXh0XG5cdFx0XHRjb25zdCB7IHRvcCwgaGVpZ2h0IH0gPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihlLnRhcmdldC5lbGVtZW50KTtcblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblxuXHRcdFx0bGV0IHBhZCA9IE1hdGguZmxvb3IobGluZUhlaWdodCAvIDMpO1xuXHRcdFx0aWYgKGd1dHRlclN0YXRlLndpZGdldFBvc2l0aW9uLnBvc2l0aW9uICE9PSBudWxsICYmIGd1dHRlclN0YXRlLndpZGdldFBvc2l0aW9uLnBvc2l0aW9uLmxpbmVOdW1iZXIgPCBndXR0ZXJTdGF0ZS5lZGl0b3JQb3NpdGlvbi5saW5lTnVtYmVyKSB7XG5cdFx0XHRcdHBhZCArPSBsaW5lSGVpZ2h0O1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbkNsaWNrLmZpcmUoe1xuXHRcdFx0XHR4OiBlLmV2ZW50LnBvc3gsXG5cdFx0XHRcdHk6IHRvcCArIGhlaWdodCArIHBhZCxcblx0XHRcdFx0YWN0aW9uczogZ3V0dGVyU3RhdGUuYWN0aW9ucyxcblx0XHRcdFx0dHJpZ2dlcjogZ3V0dGVyU3RhdGUudHJpZ2dlcixcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdGlmICh0aGlzLl9ndXR0ZXJEZWNvcmF0aW9uSUQpIHtcblx0XHRcdHRoaXMuX3JlbW92ZUd1dHRlckRlY29yYXRpb24odGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEKTtcblx0XHR9XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnTGlnaHRCdWxiV2lkZ2V0Jztcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0cmV0dXJuIHN0YXRlLnR5cGUgPT09IExpZ2h0QnVsYlN0YXRlLlR5cGUuU2hvd2luZyA/IHN0YXRlLndpZGdldFBvc2l0aW9uIDogbnVsbDtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGUoYWN0aW9uczogQ29kZUFjdGlvblNldCwgdHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIsIGF0UG9zaXRpb246IElQb3NpdGlvbikge1xuXHRcdGlmIChhY3Rpb25zLnZhbGlkQWN0aW9ucy5sZW5ndGggPD0gMCkge1xuXHRcdFx0dGhpcy5ndXR0ZXJIaWRlKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMub25seVdpdGhFbXB0eVNlbGVjdGlvbiAmJiAhdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpPy5pc0VtcHR5KCkpIHtcblx0XHRcdHRoaXMuZ3V0dGVySGlkZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuaGlkZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1RleHRGb2N1cyA9IHRoaXMuX2VkaXRvci5oYXNUZXh0Rm9jdXMoKTtcblx0XHRpZiAoIWhhc1RleHRGb2N1cykge1xuXHRcdFx0dGhpcy5ndXR0ZXJIaWRlKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb25zKCk7XG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saWdodGJ1bGIpLmVuYWJsZWQgPT09IFNob3dMaWdodGJ1bGJJY29uTW9kZS5PZmYpIHtcblx0XHRcdHRoaXMuZ3V0dGVySGlkZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuaGlkZSgpO1xuXHRcdH1cblxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aGlzLmd1dHRlckhpZGUoKTtcblx0XHRcdHJldHVybiB0aGlzLmhpZGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9ID0gbW9kZWwudmFsaWRhdGVQb3NpdGlvbihhdFBvc2l0aW9uKTtcblxuXHRcdGNvbnN0IHRhYlNpemUgPSBtb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZTtcblx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb25zKCkuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0XHRjb25zdCBpbmRlbnQgPSBjb21wdXRlSW5kZW50TGV2ZWwobGluZUNvbnRlbnQsIHRhYlNpemUpO1xuXHRcdGNvbnN0IGxpbmVIYXNTcGFjZSA9IGZvbnRJbmZvLnNwYWNlV2lkdGggKiBpbmRlbnQgPiAyMjtcblx0XHRjb25zdCBpc0ZvbGRlZCA9IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdHJldHVybiBsaW5lTnVtYmVyID4gMiAmJiB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihsaW5lTnVtYmVyKSA9PT0gdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIobGluZU51bWJlciAtIDEpO1xuXHRcdH07XG5cblx0XHQvLyBDaGVjayBmb3IgZ2x5cGggbWFyZ2luIGRlY29yYXRpb25zIG9mIGFueSBraW5kXG5cdFx0Y29uc3QgY3VyckxpbmVEZWNvcmF0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRMaW5lRGVjb3JhdGlvbnMobGluZU51bWJlcik7XG5cdFx0bGV0IGhhc0RlY29yYXRpb24gPSBmYWxzZTtcblx0XHRpZiAoY3VyckxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGN1cnJMaW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgZ2x5cGhDbGFzcyA9IGRlY29yYXRpb24ub3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZTtcblxuXHRcdFx0XHRpZiAoZ2x5cGhDbGFzcyAmJiAhdGhpcy5saWdodGJ1bGJDbGFzc2VzLnNvbWUoY2xhc3NOYW1lID0+IGdseXBoQ2xhc3MuaW5jbHVkZXMoY2xhc3NOYW1lKSkpIHtcblx0XHRcdFx0XHRoYXNEZWNvcmF0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBlZmZlY3RpdmVMaW5lTnVtYmVyID0gbGluZU51bWJlcjtcblx0XHRsZXQgZWZmZWN0aXZlQ29sdW1uTnVtYmVyID0gMTtcblx0XHRpZiAoIWxpbmVIYXNTcGFjZSkge1xuXHRcdFx0Ly8gQ2hlY2tzIGlmIGxpbmUgaXMgZW1wdHkgb3Igc3RhcnRzIHdpdGggYW55IGFtb3VudCBvZiB3aGl0ZXNwYWNlXG5cdFx0XHRjb25zdCBpc0xpbmVFbXB0eU9ySW5kZW50ZWQgPSAobGluZU51bWJlcjogbnVtYmVyKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0XHRcdHJldHVybiAvXlxccyokfF5cXHMrLy50ZXN0KGxpbmVDb250ZW50KSB8fCBsaW5lQ29udGVudC5sZW5ndGggPD0gZWZmZWN0aXZlQ29sdW1uTnVtYmVyO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGxpbmVOdW1iZXIgPiAxICYmICFpc0ZvbGRlZChsaW5lTnVtYmVyIC0gMSkpIHtcblx0XHRcdFx0Y29uc3QgbGluZUNvdW50ID0gbW9kZWwuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRcdGNvbnN0IGVuZExpbmUgPSBsaW5lTnVtYmVyID09PSBsaW5lQ291bnQ7XG5cdFx0XHRcdGNvbnN0IHByZXZMaW5lRW1wdHlPckluZGVudGVkID0gbGluZU51bWJlciA+IDEgJiYgaXNMaW5lRW1wdHlPckluZGVudGVkKGxpbmVOdW1iZXIgLSAxKTtcblx0XHRcdFx0Y29uc3QgbmV4dExpbmVFbXB0eU9ySW5kZW50ZWQgPSAhZW5kTGluZSAmJiBpc0xpbmVFbXB0eU9ySW5kZW50ZWQobGluZU51bWJlciArIDEpO1xuXHRcdFx0XHRjb25zdCBjdXJyTGluZUVtcHR5T3JJbmRlbnRlZCA9IGlzTGluZUVtcHR5T3JJbmRlbnRlZChsaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3Qgbm90RW1wdHkgPSAhbmV4dExpbmVFbXB0eU9ySW5kZW50ZWQgJiYgIXByZXZMaW5lRW1wdHlPckluZGVudGVkO1xuXG5cdFx0XHRcdC8vIGNoZWNrIGFib3ZlIGFuZCBiZWxvdy4gaWYgYm90aCBhcmUgYmxvY2tlZCwgZGlzcGxheSBsaWdodGJ1bGIgaW4gdGhlIGd1dHRlci5cblx0XHRcdFx0aWYgKCFuZXh0TGluZUVtcHR5T3JJbmRlbnRlZCAmJiAhcHJldkxpbmVFbXB0eU9ySW5kZW50ZWQgJiYgIWhhc0RlY29yYXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9ndXR0ZXJTdGF0ZS5zZXQobmV3IExpZ2h0QnVsYlN0YXRlLlNob3dpbmcoYWN0aW9ucywgdHJpZ2dlciwgYXRQb3NpdGlvbiwge1xuXHRcdFx0XHRcdFx0cG9zaXRpb246IHsgbGluZU51bWJlcjogZWZmZWN0aXZlTGluZU51bWJlciwgY29sdW1uOiBlZmZlY3RpdmVDb2x1bW5OdW1iZXIgfSxcblx0XHRcdFx0XHRcdHByZWZlcmVuY2U6IExpZ2h0QnVsYldpZGdldC5fcG9zUHJlZlxuXHRcdFx0XHRcdH0pLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyR3V0dGVyTGlnaHRidWIoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5oaWRlKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocHJldkxpbmVFbXB0eU9ySW5kZW50ZWQgfHwgZW5kTGluZSB8fCAocHJldkxpbmVFbXB0eU9ySW5kZW50ZWQgJiYgIWN1cnJMaW5lRW1wdHlPckluZGVudGVkKSkge1xuXHRcdFx0XHRcdGVmZmVjdGl2ZUxpbmVOdW1iZXIgLT0gMTtcblx0XHRcdFx0fSBlbHNlIGlmIChuZXh0TGluZUVtcHR5T3JJbmRlbnRlZCB8fCAobm90RW1wdHkgJiYgY3VyckxpbmVFbXB0eU9ySW5kZW50ZWQpKSB7XG5cdFx0XHRcdFx0ZWZmZWN0aXZlTGluZU51bWJlciArPSAxO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVOdW1iZXIgPT09IDEgJiYgKGxpbmVOdW1iZXIgPT09IG1vZGVsLmdldExpbmVDb3VudCgpIHx8ICFpc0xpbmVFbXB0eU9ySW5kZW50ZWQobGluZU51bWJlciArIDEpICYmICFpc0xpbmVFbXB0eU9ySW5kZW50ZWQobGluZU51bWJlcikpKSB7XG5cdFx0XHRcdC8vIHNwZWNpYWwgY2hlY2tzIGZvciBmaXJzdCBsaW5lIGJsb2NrZWQgdnMuIG5vdCBibG9ja2VkLlxuXHRcdFx0XHR0aGlzLl9ndXR0ZXJTdGF0ZS5zZXQobmV3IExpZ2h0QnVsYlN0YXRlLlNob3dpbmcoYWN0aW9ucywgdHJpZ2dlciwgYXRQb3NpdGlvbiwge1xuXHRcdFx0XHRcdHBvc2l0aW9uOiB7IGxpbmVOdW1iZXI6IGVmZmVjdGl2ZUxpbmVOdW1iZXIsIGNvbHVtbjogZWZmZWN0aXZlQ29sdW1uTnVtYmVyIH0sXG5cdFx0XHRcdFx0cHJlZmVyZW5jZTogTGlnaHRCdWxiV2lkZ2V0Ll9wb3NQcmVmXG5cdFx0XHRcdH0pLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGlmIChoYXNEZWNvcmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5ndXR0ZXJIaWRlKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJHdXR0ZXJMaWdodGJ1YigpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICgobGluZU51bWJlciA8IG1vZGVsLmdldExpbmVDb3VudCgpKSAmJiAhaXNGb2xkZWQobGluZU51bWJlciArIDEpKSB7XG5cdFx0XHRcdGVmZmVjdGl2ZUxpbmVOdW1iZXIgKz0gMTtcblx0XHRcdH0gZWxzZSBpZiAoY29sdW1uICogZm9udEluZm8uc3BhY2VXaWR0aCA8IDIyKSB7XG5cdFx0XHRcdC8vIGNhbm5vdCBzaG93IGxpZ2h0YnVsYiBhYm92ZS9iZWxvdyBhbmQgc2hvd2luZ1xuXHRcdFx0XHQvLyBpdCBpbmxpbmUgd291bGQgb3ZlcmxheSB0aGUgY3Vyc29yLi4uXG5cdFx0XHRcdHJldHVybiB0aGlzLmhpZGUoKTtcblx0XHRcdH1cblx0XHRcdGVmZmVjdGl2ZUNvbHVtbk51bWJlciA9IC9eXFxTXFxzKiQvLnRlc3QobW9kZWwuZ2V0TGluZUNvbnRlbnQoZWZmZWN0aXZlTGluZU51bWJlcikpID8gMiA6IDE7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGUuc2V0KG5ldyBMaWdodEJ1bGJTdGF0ZS5TaG93aW5nKGFjdGlvbnMsIHRyaWdnZXIsIGF0UG9zaXRpb24sIHtcblx0XHRcdHBvc2l0aW9uOiB7IGxpbmVOdW1iZXI6IGVmZmVjdGl2ZUxpbmVOdW1iZXIsIGNvbHVtbjogZWZmZWN0aXZlQ29sdW1uTnVtYmVyIH0sXG5cdFx0XHRwcmVmZXJlbmNlOiBMaWdodEJ1bGJXaWRnZXQuX3Bvc1ByZWZcblx0XHR9KSwgdW5kZWZpbmVkKTtcblxuXHRcdGlmICh0aGlzLl9ndXR0ZXJEZWNvcmF0aW9uSUQpIHtcblx0XHRcdHRoaXMuX3JlbW92ZUd1dHRlckRlY29yYXRpb24odGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEKTtcblx0XHRcdHRoaXMuZ3V0dGVySGlkZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbGlkQWN0aW9ucyA9IGFjdGlvbnMudmFsaWRBY3Rpb25zO1xuXHRcdGNvbnN0IGFjdGlvbktpbmQgPSBhY3Rpb25zLnZhbGlkQWN0aW9uc1swXS5hY3Rpb24ua2luZDtcblx0XHRpZiAodmFsaWRBY3Rpb25zLmxlbmd0aCAhPT0gMSB8fCAhYWN0aW9uS2luZCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgaGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUuZ2V0KCkgPT09IExpZ2h0QnVsYlN0YXRlLkhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLnNldChMaWdodEJ1bGJTdGF0ZS5IaWRkZW4sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgZ3V0dGVySGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZ3V0dGVyU3RhdGUuZ2V0KCkgPT09IExpZ2h0QnVsYlN0YXRlLkhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9ndXR0ZXJEZWNvcmF0aW9uSUQpIHtcblx0XHRcdHRoaXMuX3JlbW92ZUd1dHRlckRlY29yYXRpb24odGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ndXR0ZXJTdGF0ZS5zZXQoTGlnaHRCdWxiU3RhdGUuSGlkZGVuLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTGlnaHRCdWxiVGl0bGVBbmRJY29uKGluZm86IExpZ2h0QnVsYkluZm8gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoLi4udGhpcy5faWNvbkNsYXNzZXMpO1xuXHRcdHRoaXMuX2ljb25DbGFzc2VzID0gW107XG5cdFx0aWYgKCFpbmZvIHx8IGluZm8uaXNHdXR0ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZG9tTm9kZS50aXRsZSA9IGluZm8udGl0bGU7XG5cdFx0dGhpcy5faWNvbkNsYXNzZXMgPSBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpbmZvLmljb24pO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NMaXN0LmFkZCguLi50aGlzLl9pY29uQ2xhc3Nlcyk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVHdXR0ZXJEZWNvcmF0aW9uT3B0aW9ucyhpbmZvOiBMaWdodEJ1bGJJbmZvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFpbmZvIHx8ICFpbmZvLmlzR3V0dGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ndXR0ZXJEZWNvcmF0aW9uID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ2NvZGljb24tZ3V0dGVyLWxpZ2h0YnVsYi1kZWNvcmF0aW9uJyxcblx0XHRcdGdseXBoTWFyZ2luQ2xhc3NOYW1lOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaW5mby5pY29uKSxcblx0XHRcdGdseXBoTWFyZ2luOiB7IHBvc2l0aW9uOiBHbHlwaE1hcmdpbkxhbmUuTGVmdCB9LFxuXHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0fSk7XG5cdH1cblxuXHQvKiBHdXR0ZXIgSGVscGVyIEZ1bmN0aW9ucyAqL1xuXHRwcml2YXRlIHJlbmRlckd1dHRlckxpZ2h0YnViKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9ndXR0ZXJEZWNvcmF0aW9uSUQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fYWRkR3V0dGVyRGVjb3JhdGlvbihzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdXBkYXRlR3V0dGVyRGVjb3JhdGlvbih0aGlzLl9ndXR0ZXJEZWNvcmF0aW9uSUQsIHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZEd1dHRlckRlY29yYXRpb24obGluZU51bWJlcjogbnVtYmVyKSB7XG5cdFx0dGhpcy5fZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcjogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0dGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihuZXcgUmFuZ2UobGluZU51bWJlciwgMCwgbGluZU51bWJlciwgMCksIHRoaXMuZ3V0dGVyRGVjb3JhdGlvbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uKGRlY29yYXRpb25JZDogc3RyaW5nKSB7XG5cdFx0dGhpcy5fZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcjogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0YWNjZXNzb3IucmVtb3ZlRGVjb3JhdGlvbihkZWNvcmF0aW9uSWQpO1xuXHRcdFx0dGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlR3V0dGVyRGVjb3JhdGlvbihkZWNvcmF0aW9uSWQ6IHN0cmluZywgbGluZU51bWJlcjogbnVtYmVyKSB7XG5cdFx0dGhpcy5fZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcjogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0YWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbihkZWNvcmF0aW9uSWQsIG5ldyBSYW5nZShsaW5lTnVtYmVyLCAwLCBsaW5lTnVtYmVyLCAwKSk7XG5cdFx0XHRhY2Nlc3Nvci5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyhkZWNvcmF0aW9uSWQsIHRoaXMuZ3V0dGVyRGVjb3JhdGlvbik7XG5cdFx0fSk7XG5cdH1cblxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxTQUFzQix1QkFBdUI7QUFDL0QsU0FBUyxpQkFBaUI7QUFDMUIsT0FBTztBQUNQLFNBQVMsdUNBQStHO0FBQ3hILFNBQVMsY0FBYyw2QkFBNkI7QUFFcEQsU0FBUyxpQkFBa0QsOEJBQThCO0FBQ3pGLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCLHlCQUF5QjtBQUVwRCxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMs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S0FBSyxnQkFBZ0I7QUFBQSxJQUNqSCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsd0JBQXdCLGNBQXNCO0FBQ3JELFNBQUssUUFBUSxrQkFBa0IsQ0FBQyxhQUE4QztBQUM3RSxlQUFTLGlCQUFpQixZQUFZO0FBQ3RDLFdBQUssc0JBQXNCO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHdCQUF3QixjQUFzQixZQUFvQjtBQUN6RSxTQUFLLFFBQVEsa0JBQWtCLENBQUMsYUFBOEM7QUFDN0UsZUFBUyxpQkFBaUIsY0FBYyxJQUFJLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxDQUFDO0FBQy9FLGVBQVMsd0JBQXdCLGNBQWMsS0FBSyxnQkFBZ0I7QUFBQSxJQUNyRSxDQUFDO0FBQUEsRUFDRjtBQUdEO0FBOVlhLGdCQUtZLG9CQUFvQix1QkFBdUIsU0FBUztBQUFBLEVBQzNFLGFBQWE7QUFBQSxFQUNiLHNCQUFzQixVQUFVLFlBQVksUUFBUSxTQUFTO0FBQUEsRUFDN0QsYUFBYSxFQUFFLFVBQVUsZ0JBQWdCLEtBQUs7QUFBQSxFQUM5QyxZQUFZLHVCQUF1QjtBQUNwQyxDQUFDO0FBVlcsZ0JBWVcsS0FBSztBQVpoQixnQkFjWSxXQUFXLENBQUMsZ0NBQWdDLEtBQUs7QUFkN0Qsa0JBQU47QUFBQSxFQThESjtBQUFBLEdBOURVOyIsCiAgIm5hbWVzIjogWyJMaWdodEJ1bGJTdGF0ZSIsICJUeXBlIiwgImxpbmVOdW1iZXIiLCAibGluZUNvbnRlbnQiXQp9Cg==
