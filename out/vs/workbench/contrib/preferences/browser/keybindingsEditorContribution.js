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
import * as nls from "../../../../nls.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Range } from "../../../../editor/common/core/range.js";
import { registerEditorContribution, EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { SmartSnippetInserter } from "../common/smartSnippetInserter.js";
import { DefineKeybindingOverlayWidget } from "./keybindingWidgets.js";
import { parseTree } from "../../../../base/common/json.js";
import { WindowsNativeResolvedKeybinding } from "../../../services/keybinding/common/windowsKeyboardMapper.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { overviewRulerInfo, overviewRulerError } from "../../../../editor/common/core/editorColorRegistry.js";
import { TrackedRangeStickiness, OverviewRulerLane } from "../../../../editor/common/model.js";
import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { DEFINE_KEYBINDING_EDITOR_CONTRIB_ID } from "../../../services/preferences/common/preferences.js";
const NLS_KB_LAYOUT_ERROR_MESSAGE = nls.localize("defineKeybinding.kbLayoutErrorMessage", "You won't be able to produce this key combination under your current keyboard layout.");
let DefineKeybindingEditorContribution = class extends Disposable {
  constructor(_editor, _instantiationService, _userDataProfileService) {
    super();
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._userDataProfileService = _userDataProfileService;
    this._keybindingDecorationRenderer = this._register(new MutableDisposable());
    this._defineWidget = this._register(this._instantiationService.createInstance(DefineKeybindingOverlayWidget, this._editor));
    this._register(this._editor.onDidChangeModel((e) => this._update()));
    this._update();
  }
  _update() {
    this._keybindingDecorationRenderer.value = isInterestingEditorModel(this._editor, this._userDataProfileService) ? this._instantiationService.createInstance(KeybindingEditorDecorationsRenderer, this._editor) : void 0;
  }
  showDefineKeybindingWidget() {
    if (isInterestingEditorModel(this._editor, this._userDataProfileService)) {
      this._defineWidget.start().then((keybinding) => this._onAccepted(keybinding));
    }
  }
  _onAccepted(keybinding) {
    this._editor.focus();
    if (keybinding && this._editor.hasModel()) {
      const regexp = new RegExp(/\\/g);
      const backslash = regexp.test(keybinding);
      if (backslash) {
        keybinding = keybinding.slice(0, -1) + "\\\\";
      }
      let snippetText = [
        "{",
        '	"key": ' + JSON.stringify(keybinding) + ",",
        '	"command": "${1:commandId}",',
        '	"when": "${2:editorTextFocus}"',
        "}$0"
      ].join("\n");
      const smartInsertInfo = SmartSnippetInserter.insertSnippet(this._editor.getModel(), this._editor.getPosition());
      snippetText = smartInsertInfo.prepend + snippetText + smartInsertInfo.append;
      this._editor.setPosition(smartInsertInfo.position);
      SnippetController2.get(this._editor)?.insert(snippetText, { overwriteBefore: 0, overwriteAfter: 0 });
    }
  }
};
DefineKeybindingEditorContribution = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUserDataProfileService)
], DefineKeybindingEditorContribution);
let KeybindingEditorDecorationsRenderer = class extends Disposable {
  constructor(_editor, _keybindingService) {
    super();
    this._editor = _editor;
    this._keybindingService = _keybindingService;
    this._dec = this._editor.createDecorationsCollection();
    this._updateDecorations = this._register(new RunOnceScheduler(() => this._updateDecorationsNow(), 500));
    const model = assertReturnsDefined(this._editor.getModel());
    this._register(model.onDidChangeContent(() => this._updateDecorations.schedule()));
    this._register(this._keybindingService.onDidUpdateKeybindings(() => this._updateDecorations.schedule()));
    this._register({
      dispose: () => {
        this._dec.clear();
        this._updateDecorations.cancel();
      }
    });
    this._updateDecorations.schedule();
  }
  _updateDecorationsNow() {
    const model = assertReturnsDefined(this._editor.getModel());
    const newDecorations = [];
    const root = parseTree(model.getValue());
    if (root && Array.isArray(root.children)) {
      for (let i = 0, len = root.children.length; i < len; i++) {
        const entry = root.children[i];
        const dec = this._getDecorationForEntry(model, entry);
        if (dec !== null) {
          newDecorations.push(dec);
        }
      }
    }
    this._dec.set(newDecorations);
  }
  _getDecorationForEntry(model, entry) {
    if (!Array.isArray(entry.children)) {
      return null;
    }
    for (let i = 0, len = entry.children.length; i < len; i++) {
      const prop = entry.children[i];
      if (prop.type !== "property") {
        continue;
      }
      if (!Array.isArray(prop.children) || prop.children.length !== 2) {
        continue;
      }
      const key = prop.children[0];
      if (key.value !== "key") {
        continue;
      }
      const value = prop.children[1];
      if (value.type !== "string") {
        continue;
      }
      const resolvedKeybindings = this._keybindingService.resolveUserBinding(value.value);
      if (resolvedKeybindings.length === 0) {
        return this._createDecoration(true, null, null, model, value);
      }
      const resolvedKeybinding = resolvedKeybindings[0];
      let usLabel = null;
      if (resolvedKeybinding instanceof WindowsNativeResolvedKeybinding) {
        usLabel = resolvedKeybinding.getUSLabel();
      }
      if (!resolvedKeybinding.isWYSIWYG()) {
        const uiLabel = resolvedKeybinding.getLabel();
        if (typeof uiLabel === "string" && value.value.toLowerCase() === uiLabel.toLowerCase()) {
          return null;
        }
        return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
      }
      if (/abnt_|oem_/.test(value.value)) {
        return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
      }
      const expectedUserSettingsLabel = resolvedKeybinding.getUserSettingsLabel();
      if (typeof expectedUserSettingsLabel === "string" && !KeybindingEditorDecorationsRenderer._userSettingsFuzzyEquals(value.value, expectedUserSettingsLabel)) {
        return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
      }
      return null;
    }
    return null;
  }
  static _userSettingsFuzzyEquals(a, b) {
    a = a.trim().toLowerCase();
    b = b.trim().toLowerCase();
    if (a === b) {
      return true;
    }
    const aKeybinding = KeybindingParser.parseKeybinding(a);
    const bKeybinding = KeybindingParser.parseKeybinding(b);
    if (aKeybinding === null && bKeybinding === null) {
      return true;
    }
    if (!aKeybinding || !bKeybinding) {
      return false;
    }
    return aKeybinding.equals(bKeybinding);
  }
  _createDecoration(isError, uiLabel, usLabel, model, keyNode) {
    let msg;
    let className;
    let overviewRulerColor;
    if (isError) {
      msg = new MarkdownString().appendText(NLS_KB_LAYOUT_ERROR_MESSAGE);
      className = "keybindingError";
      overviewRulerColor = themeColorFromId(overviewRulerError);
    } else {
      if (usLabel && uiLabel !== usLabel) {
        msg = new MarkdownString(
          nls.localize({
            key: "defineKeybinding.kbLayoutLocalAndUSMessage",
            comment: [
              "Please translate maintaining the stars (*) around the placeholders such that they will be rendered in bold.",
              "The placeholders will contain a keyboard combination e.g. Ctrl+Shift+/"
            ]
          }, "**{0}** for your current keyboard layout (**{1}** for US standard).", uiLabel, usLabel)
        );
      } else {
        msg = new MarkdownString(
          nls.localize({
            key: "defineKeybinding.kbLayoutLocalMessage",
            comment: [
              "Please translate maintaining the stars (*) around the placeholder such that it will be rendered in bold.",
              "The placeholder will contain a keyboard combination e.g. Ctrl+Shift+/"
            ]
          }, "**{0}** for your current keyboard layout.", uiLabel)
        );
      }
      className = "keybindingInfo";
      overviewRulerColor = themeColorFromId(overviewRulerInfo);
    }
    const startPosition = model.getPositionAt(keyNode.offset);
    const endPosition = model.getPositionAt(keyNode.offset + keyNode.length);
    const range = new Range(
      startPosition.lineNumber,
      startPosition.column,
      endPosition.lineNumber,
      endPosition.column
    );
    return {
      range,
      options: {
        description: "keybindings-widget",
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        className,
        hoverMessage: msg,
        overviewRuler: {
          color: overviewRulerColor,
          position: OverviewRulerLane.Right
        }
      }
    };
  }
};
KeybindingEditorDecorationsRenderer = __decorateClass([
  __decorateParam(1, IKeybindingService)
], KeybindingEditorDecorationsRenderer);
function isInterestingEditorModel(editor, userDataProfileService) {
  const model = editor.getModel();
  if (!model) {
    return false;
  }
  return isEqual(model.uri, userDataProfileService.currentProfile.keybindingsResource);
}
registerEditorContribution(DEFINE_KEYBINDING_EDITOR_CONTRIB_ID, DefineKeybindingEditorContribution, EditorContributionInstantiation.AfterFirstRender);
export {
  KeybindingEditorDecorationsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxrZXliaW5kaW5nc0VkaXRvckNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBTbWFydFNuaXBwZXRJbnNlcnRlciB9IGZyb20gJy4uL2NvbW1vbi9zbWFydFNuaXBwZXRJbnNlcnRlci5qcyc7XG5pbXBvcnQgeyBEZWZpbmVLZXliaW5kaW5nT3ZlcmxheVdpZGdldCB9IGZyb20gJy4va2V5YmluZGluZ1dpZGdldHMuanMnO1xuaW1wb3J0IHsgcGFyc2VUcmVlLCBOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBXaW5kb3dzTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMva2V5YmluZGluZy9jb21tb24vd2luZG93c0tleWJvYXJkTWFwcGVyLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgb3ZlcnZpZXdSdWxlckluZm8sIG92ZXJ2aWV3UnVsZXJFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgSVRleHRNb2RlbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcywgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5nUGFyc2VyLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IERFRklORV9LRVlCSU5ESU5HX0VESVRPUl9DT05UUklCX0lELCBJRGVmaW5lS2V5YmluZGluZ0VkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuXG5jb25zdCBOTFNfS0JfTEFZT1VUX0VSUk9SX01FU1NBR0UgPSBubHMubG9jYWxpemUoJ2RlZmluZUtleWJpbmRpbmcua2JMYXlvdXRFcnJvck1lc3NhZ2UnLCBcIllvdSB3b24ndCBiZSBhYmxlIHRvIHByb2R1Y2UgdGhpcyBrZXkgY29tYmluYXRpb24gdW5kZXIgeW91ciBjdXJyZW50IGtleWJvYXJkIGxheW91dC5cIik7XG5cbmNsYXNzIERlZmluZUtleWJpbmRpbmdFZGl0b3JDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURlZmluZUtleWJpbmRpbmdFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdEZWNvcmF0aW9uUmVuZGVyZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8S2V5YmluZGluZ0VkaXRvckRlY29yYXRpb25zUmVuZGVyZXI+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmluZVdpZGdldDogRGVmaW5lS2V5YmluZGluZ092ZXJsYXlXaWRnZXQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9kZWZpbmVXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWZpbmVLZXliaW5kaW5nT3ZlcmxheVdpZGdldCwgdGhpcy5fZWRpdG9yKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoZSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2tleWJpbmRpbmdEZWNvcmF0aW9uUmVuZGVyZXIudmFsdWUgPSBpc0ludGVyZXN0aW5nRWRpdG9yTW9kZWwodGhpcy5fZWRpdG9yLCB0aGlzLl91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlKVxuXHRcdFx0Ly8gRGVjb3JhdGlvbnMgYXJlIHNob3duIGZvciB0aGUgZGVmYXVsdCBrZXliaW5kaW5ncy5qc29uICoqYW5kKiogZm9yIHRoZSB1c2VyIGtleWJpbmRpbmdzLmpzb25cblx0XHRcdD8gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5YmluZGluZ0VkaXRvckRlY29yYXRpb25zUmVuZGVyZXIsIHRoaXMuX2VkaXRvcilcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9XG5cblx0c2hvd0RlZmluZUtleWJpbmRpbmdXaWRnZXQoKTogdm9pZCB7XG5cdFx0aWYgKGlzSW50ZXJlc3RpbmdFZGl0b3JNb2RlbCh0aGlzLl9lZGl0b3IsIHRoaXMuX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UpKSB7XG5cdFx0XHR0aGlzLl9kZWZpbmVXaWRnZXQuc3RhcnQoKS50aGVuKGtleWJpbmRpbmcgPT4gdGhpcy5fb25BY2NlcHRlZChrZXliaW5kaW5nKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25BY2NlcHRlZChrZXliaW5kaW5nOiBzdHJpbmcgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0aWYgKGtleWJpbmRpbmcgJiYgdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdGNvbnN0IHJlZ2V4cCA9IG5ldyBSZWdFeHAoL1xcXFwvZyk7XG5cdFx0XHRjb25zdCBiYWNrc2xhc2ggPSByZWdleHAudGVzdChrZXliaW5kaW5nKTtcblx0XHRcdGlmIChiYWNrc2xhc2gpIHtcblx0XHRcdFx0a2V5YmluZGluZyA9IGtleWJpbmRpbmcuc2xpY2UoMCwgLTEpICsgJ1xcXFxcXFxcJztcblx0XHRcdH1cblx0XHRcdGxldCBzbmlwcGV0VGV4dCA9IFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnXFx0XCJrZXlcIjogJyArIEpTT04uc3RyaW5naWZ5KGtleWJpbmRpbmcpICsgJywnLFxuXHRcdFx0XHQnXFx0XCJjb21tYW5kXCI6IFwiJHsxOmNvbW1hbmRJZH1cIiwnLFxuXHRcdFx0XHQnXFx0XCJ3aGVuXCI6IFwiJHsyOmVkaXRvclRleHRGb2N1c31cIicsXG5cdFx0XHRcdCd9JDAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBzbWFydEluc2VydEluZm8gPSBTbWFydFNuaXBwZXRJbnNlcnRlci5pbnNlcnRTbmlwcGV0KHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLCB0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSk7XG5cdFx0XHRzbmlwcGV0VGV4dCA9IHNtYXJ0SW5zZXJ0SW5mby5wcmVwZW5kICsgc25pcHBldFRleHQgKyBzbWFydEluc2VydEluZm8uYXBwZW5kO1xuXHRcdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKHNtYXJ0SW5zZXJ0SW5mby5wb3NpdGlvbik7XG5cblx0XHRcdFNuaXBwZXRDb250cm9sbGVyMi5nZXQodGhpcy5fZWRpdG9yKT8uaW5zZXJ0KHNuaXBwZXRUZXh0LCB7IG92ZXJ3cml0ZUJlZm9yZTogMCwgb3ZlcndyaXRlQWZ0ZXI6IDAgfSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBLZXliaW5kaW5nRWRpdG9yRGVjb3JhdGlvbnNSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3VwZGF0ZURlY29yYXRpb25zOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZGVjID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXG5cdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl91cGRhdGVEZWNvcmF0aW9uc05vdygpLCA1MDApKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fZWRpdG9yLmdldE1vZGVsKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLl91cGRhdGVEZWNvcmF0aW9ucy5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fa2V5YmluZGluZ1NlcnZpY2Uub25EaWRVcGRhdGVLZXliaW5kaW5ncygoKSA9PiB0aGlzLl91cGRhdGVEZWNvcmF0aW9ucy5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9kZWMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMuY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMuc2NoZWR1bGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURlY29yYXRpb25zTm93KCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5fZWRpdG9yLmdldE1vZGVsKCkpO1xuXG5cdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cblx0XHRjb25zdCByb290ID0gcGFyc2VUcmVlKG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdGlmIChyb290ICYmIEFycmF5LmlzQXJyYXkocm9vdC5jaGlsZHJlbikpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSByb290LmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcm9vdC5jaGlsZHJlbltpXTtcblx0XHRcdFx0Y29uc3QgZGVjID0gdGhpcy5fZ2V0RGVjb3JhdGlvbkZvckVudHJ5KG1vZGVsLCBlbnRyeSk7XG5cdFx0XHRcdGlmIChkZWMgIT09IG51bGwpIHtcblx0XHRcdFx0XHRuZXdEZWNvcmF0aW9ucy5wdXNoKGRlYyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9kZWMuc2V0KG5ld0RlY29yYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERlY29yYXRpb25Gb3JFbnRyeShtb2RlbDogSVRleHRNb2RlbCwgZW50cnk6IE5vZGUpOiBJTW9kZWxEZWx0YURlY29yYXRpb24gfCBudWxsIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZW50cnkuY2hpbGRyZW4pKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGVudHJ5LmNoaWxkcmVuLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBwcm9wID0gZW50cnkuY2hpbGRyZW5baV07XG5cdFx0XHRpZiAocHJvcC50eXBlICE9PSAncHJvcGVydHknKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHByb3AuY2hpbGRyZW4pIHx8IHByb3AuY2hpbGRyZW4ubGVuZ3RoICE9PSAyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2V5ID0gcHJvcC5jaGlsZHJlblswXTtcblx0XHRcdGlmIChrZXkudmFsdWUgIT09ICdrZXknKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFsdWUgPSBwcm9wLmNoaWxkcmVuWzFdO1xuXHRcdFx0aWYgKHZhbHVlLnR5cGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNvbHZlZEtleWJpbmRpbmdzID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UucmVzb2x2ZVVzZXJCaW5kaW5nKHZhbHVlLnZhbHVlKTtcblx0XHRcdGlmIChyZXNvbHZlZEtleWJpbmRpbmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGVjb3JhdGlvbih0cnVlLCBudWxsLCBudWxsLCBtb2RlbCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5nID0gcmVzb2x2ZWRLZXliaW5kaW5nc1swXTtcblx0XHRcdGxldCB1c0xhYmVsOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdGlmIChyZXNvbHZlZEtleWJpbmRpbmcgaW5zdGFuY2VvZiBXaW5kb3dzTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nKSB7XG5cdFx0XHRcdHVzTGFiZWwgPSByZXNvbHZlZEtleWJpbmRpbmcuZ2V0VVNMYWJlbCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZXNvbHZlZEtleWJpbmRpbmcuaXNXWVNJV1lHKCkpIHtcblx0XHRcdFx0Y29uc3QgdWlMYWJlbCA9IHJlc29sdmVkS2V5YmluZGluZy5nZXRMYWJlbCgpO1xuXHRcdFx0XHRpZiAodHlwZW9mIHVpTGFiZWwgPT09ICdzdHJpbmcnICYmIHZhbHVlLnZhbHVlLnRvTG93ZXJDYXNlKCkgPT09IHVpTGFiZWwudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0XHRcdC8vIGNvaW5jaWRlbnRhbGx5LCB0aGlzIGlzIGFjdHVhbGx5IFdZU0lXWUdcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGVjb3JhdGlvbihmYWxzZSwgcmVzb2x2ZWRLZXliaW5kaW5nLmdldExhYmVsKCksIHVzTGFiZWwsIG1vZGVsLCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoL2FibnRffG9lbV8vLnRlc3QodmFsdWUudmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVEZWNvcmF0aW9uKGZhbHNlLCByZXNvbHZlZEtleWJpbmRpbmcuZ2V0TGFiZWwoKSwgdXNMYWJlbCwgbW9kZWwsIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4cGVjdGVkVXNlclNldHRpbmdzTGFiZWwgPSByZXNvbHZlZEtleWJpbmRpbmcuZ2V0VXNlclNldHRpbmdzTGFiZWwoKTtcblx0XHRcdGlmICh0eXBlb2YgZXhwZWN0ZWRVc2VyU2V0dGluZ3NMYWJlbCA9PT0gJ3N0cmluZycgJiYgIUtleWJpbmRpbmdFZGl0b3JEZWNvcmF0aW9uc1JlbmRlcmVyLl91c2VyU2V0dGluZ3NGdXp6eUVxdWFscyh2YWx1ZS52YWx1ZSwgZXhwZWN0ZWRVc2VyU2V0dGluZ3NMYWJlbCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURlY29yYXRpb24oZmFsc2UsIHJlc29sdmVkS2V5YmluZGluZy5nZXRMYWJlbCgpLCB1c0xhYmVsLCBtb2RlbCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0c3RhdGljIF91c2VyU2V0dGluZ3NGdXp6eUVxdWFscyhhOiBzdHJpbmcsIGI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGEgPSBhLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXHRcdGIgPSBiLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0aWYgKGEgPT09IGIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFLZXliaW5kaW5nID0gS2V5YmluZGluZ1BhcnNlci5wYXJzZUtleWJpbmRpbmcoYSk7XG5cdFx0Y29uc3QgYktleWJpbmRpbmcgPSBLZXliaW5kaW5nUGFyc2VyLnBhcnNlS2V5YmluZGluZyhiKTtcblx0XHRpZiAoYUtleWJpbmRpbmcgPT09IG51bGwgJiYgYktleWJpbmRpbmcgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWFLZXliaW5kaW5nIHx8ICFiS2V5YmluZGluZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYUtleWJpbmRpbmcuZXF1YWxzKGJLZXliaW5kaW5nKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZURlY29yYXRpb24oaXNFcnJvcjogYm9vbGVhbiwgdWlMYWJlbDogc3RyaW5nIHwgbnVsbCwgdXNMYWJlbDogc3RyaW5nIHwgbnVsbCwgbW9kZWw6IElUZXh0TW9kZWwsIGtleU5vZGU6IE5vZGUpOiBJTW9kZWxEZWx0YURlY29yYXRpb24ge1xuXHRcdGxldCBtc2c6IE1hcmtkb3duU3RyaW5nO1xuXHRcdGxldCBjbGFzc05hbWU6IHN0cmluZztcblx0XHRsZXQgb3ZlcnZpZXdSdWxlckNvbG9yOiBUaGVtZUNvbG9yO1xuXG5cdFx0aWYgKGlzRXJyb3IpIHtcblx0XHRcdC8vIHRoaXMgaXMgdGhlIGVycm9yIGNhc2Vcblx0XHRcdG1zZyA9IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZFRleHQoTkxTX0tCX0xBWU9VVF9FUlJPUl9NRVNTQUdFKTtcblx0XHRcdGNsYXNzTmFtZSA9ICdrZXliaW5kaW5nRXJyb3InO1xuXHRcdFx0b3ZlcnZpZXdSdWxlckNvbG9yID0gdGhlbWVDb2xvckZyb21JZChvdmVydmlld1J1bGVyRXJyb3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyB0aGlzIGlzIHRoZSBpbmZvIGNhc2Vcblx0XHRcdGlmICh1c0xhYmVsICYmIHVpTGFiZWwgIT09IHVzTGFiZWwpIHtcblx0XHRcdFx0bXNnID0gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRrZXk6ICdkZWZpbmVLZXliaW5kaW5nLmtiTGF5b3V0TG9jYWxBbmRVU01lc3NhZ2UnLFxuXHRcdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0XHQnUGxlYXNlIHRyYW5zbGF0ZSBtYWludGFpbmluZyB0aGUgc3RhcnMgKCopIGFyb3VuZCB0aGUgcGxhY2Vob2xkZXJzIHN1Y2ggdGhhdCB0aGV5IHdpbGwgYmUgcmVuZGVyZWQgaW4gYm9sZC4nLFxuXHRcdFx0XHRcdFx0XHQnVGhlIHBsYWNlaG9sZGVycyB3aWxsIGNvbnRhaW4gYSBrZXlib2FyZCBjb21iaW5hdGlvbiBlLmcuIEN0cmwrU2hpZnQrLydcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9LCBcIioqezB9KiogZm9yIHlvdXIgY3VycmVudCBrZXlib2FyZCBsYXlvdXQgKCoqezF9KiogZm9yIFVTIHN0YW5kYXJkKS5cIiwgdWlMYWJlbCwgdXNMYWJlbClcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1zZyA9IG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0XHRubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0a2V5OiAnZGVmaW5lS2V5YmluZGluZy5rYkxheW91dExvY2FsTWVzc2FnZScsXG5cdFx0XHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0XHRcdCdQbGVhc2UgdHJhbnNsYXRlIG1haW50YWluaW5nIHRoZSBzdGFycyAoKikgYXJvdW5kIHRoZSBwbGFjZWhvbGRlciBzdWNoIHRoYXQgaXQgd2lsbCBiZSByZW5kZXJlZCBpbiBib2xkLicsXG5cdFx0XHRcdFx0XHRcdCdUaGUgcGxhY2Vob2xkZXIgd2lsbCBjb250YWluIGEga2V5Ym9hcmQgY29tYmluYXRpb24gZS5nLiBDdHJsK1NoaWZ0Ky8nXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSwgXCIqKnswfSoqIGZvciB5b3VyIGN1cnJlbnQga2V5Ym9hcmQgbGF5b3V0LlwiLCB1aUxhYmVsKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0Y2xhc3NOYW1lID0gJ2tleWJpbmRpbmdJbmZvJztcblx0XHRcdG92ZXJ2aWV3UnVsZXJDb2xvciA9IHRoZW1lQ29sb3JGcm9tSWQob3ZlcnZpZXdSdWxlckluZm8pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KGtleU5vZGUub2Zmc2V0KTtcblx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQoa2V5Tm9kZS5vZmZzZXQgKyBrZXlOb2RlLmxlbmd0aCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UoXG5cdFx0XHRzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uLFxuXHRcdFx0ZW5kUG9zaXRpb24ubGluZU51bWJlciwgZW5kUG9zaXRpb24uY29sdW1uXG5cdFx0KTtcblxuXHRcdC8vIGljb24gKyBoaWdobGlnaHQgKyBtZXNzYWdlIGRlY29yYXRpb25cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ2tleWJpbmRpbmdzLXdpZGdldCcsXG5cdFx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdFx0XHRjbGFzc05hbWU6IGNsYXNzTmFtZSxcblx0XHRcdFx0aG92ZXJNZXNzYWdlOiBtc2csXG5cdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0XHRjb2xvcjogb3ZlcnZpZXdSdWxlckNvbG9yLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5SaWdodFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG59XG5cbmZ1bmN0aW9uIGlzSW50ZXJlc3RpbmdFZGl0b3JNb2RlbChlZGl0b3I6IElDb2RlRWRpdG9yLCB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSk6IGJvb2xlYW4ge1xuXHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRpZiAoIW1vZGVsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBpc0VxdWFsKG1vZGVsLnVyaSwgdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5rZXliaW5kaW5nc1Jlc291cmNlKTtcbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oREVGSU5FX0tFWUJJTkRJTkdfRURJVE9SX0NPTlRSSUJfSUQsIERlZmluZUtleWJpbmRpbmdFZGl0b3JDb250cmlidXRpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQWZ0ZXJGaXJzdFJlbmRlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYTtBQUN0QixTQUFTLDRCQUE0Qix1Q0FBdUM7QUFFNUUsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQkFBdUI7QUFDaEMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxtQkFBbUIsMEJBQTBCO0FBQ3RELFNBQTRDLHdCQUF3Qix5QkFBeUI7QUFDN0YsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMkNBQWdGO0FBR3pGLE1BQU0sOEJBQThCLElBQUksU0FBUyx5Q0FBeUMs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
