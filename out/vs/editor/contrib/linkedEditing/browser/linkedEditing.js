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
import * as arrays from "../../../../base/common/arrays.js";
import { Delayer, first } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Color } from "../../../../base/common/color.js";
import { isCancellationError, onUnexpectedError, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as strings from "../../../../base/common/strings.js";
import { URI } from "../../../../base/common/uri.js";
import { EditorAction, EditorCommand, EditorContributionInstantiation, registerEditorAction, registerEditorCommand, registerEditorContribution, registerModelAndPositionCommand } from "../../../browser/editorExtensions.js";
import { ICodeEditorService } from "../../../browser/services/codeEditorService.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import * as nls from "../../../../nls.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import "./linkedEditing.css";
const CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE = new RawContextKey("LinkedEditingInputVisible", false);
const DECORATION_CLASS_NAME = "linked-editing-decoration";
let LinkedEditingContribution = class extends Disposable {
  constructor(editor, contextKeyService, languageFeaturesService, languageConfigurationService, languageFeatureDebounceService) {
    super();
    this.languageConfigurationService = languageConfigurationService;
    // The one at index 0 is the reference one
    this._syncRangesToken = 0;
    this._localToDispose = this._register(new DisposableStore());
    this._editor = editor;
    this._providers = languageFeaturesService.linkedEditingRangeProvider;
    this._enabled = false;
    this._visibleContextKey = CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE.bindTo(contextKeyService);
    this._debounceInformation = languageFeatureDebounceService.for(this._providers, "Linked Editing", { max: 200 });
    this._currentDecorations = this._editor.createDecorationsCollection();
    this._languageWordPattern = null;
    this._currentWordPattern = null;
    this._ignoreChangeEvent = false;
    this._localToDispose = this._register(new DisposableStore());
    this._rangeUpdateTriggerPromise = null;
    this._rangeSyncTriggerPromise = null;
    this._currentRequestCts = null;
    this._currentRequestPosition = null;
    this._currentRequestModelVersion = null;
    this._register(this._editor.onDidChangeModel(() => this.reinitialize(true)));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.linkedEditing) || e.hasChanged(EditorOption.renameOnType)) {
        this.reinitialize(false);
      }
    }));
    this._register(this._providers.onDidChange(() => this.reinitialize(false)));
    this._register(this._editor.onDidChangeModelLanguage(() => this.reinitialize(true)));
    this.reinitialize(true);
  }
  static get(editor) {
    return editor.getContribution(LinkedEditingContribution.ID);
  }
  reinitialize(forceRefresh) {
    const model = this._editor.getModel();
    const isEnabled = model !== null && (this._editor.getOption(EditorOption.linkedEditing) || this._editor.getOption(EditorOption.renameOnType)) && this._providers.has(model);
    if (isEnabled === this._enabled && !forceRefresh) {
      return;
    }
    this._enabled = isEnabled;
    this.clearRanges();
    this._localToDispose.clear();
    if (!isEnabled || model === null) {
      return;
    }
    this._localToDispose.add(
      Event.runAndSubscribe(
        model.onDidChangeLanguageConfiguration,
        () => {
          this._languageWordPattern = this.languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).getWordDefinition();
        }
      )
    );
    const rangeUpdateScheduler = new Delayer(this._debounceInformation.get(model));
    const triggerRangeUpdate = () => {
      this._rangeUpdateTriggerPromise = rangeUpdateScheduler.trigger(() => this.updateRanges(), this._debounceDuration ?? this._debounceInformation.get(model));
    };
    const rangeSyncScheduler = new Delayer(0);
    const triggerRangeSync = (token) => {
      this._rangeSyncTriggerPromise = rangeSyncScheduler.trigger(() => this._syncRanges(token));
    };
    this._localToDispose.add(this._editor.onDidChangeCursorPosition(() => {
      triggerRangeUpdate();
    }));
    this._localToDispose.add(this._editor.onDidChangeModelContent((e) => {
      if (!this._ignoreChangeEvent) {
        if (this._currentDecorations.length > 0) {
          const referenceRange = this._currentDecorations.getRange(0);
          if (referenceRange && e.changes.every((c) => referenceRange.intersectRanges(c.range))) {
            triggerRangeSync(this._syncRangesToken);
            return;
          }
        }
      }
      triggerRangeUpdate();
    }));
    this._localToDispose.add({
      dispose: () => {
        rangeUpdateScheduler.dispose();
        rangeSyncScheduler.dispose();
      }
    });
    this.updateRanges();
  }
  _syncRanges(token) {
    if (!this._editor.hasModel() || token !== this._syncRangesToken || this._currentDecorations.length === 0) {
      return;
    }
    const model = this._editor.getModel();
    const referenceRange = this._currentDecorations.getRange(0);
    if (!referenceRange || referenceRange.startLineNumber !== referenceRange.endLineNumber) {
      return this.clearRanges();
    }
    const referenceValue = model.getValueInRange(referenceRange);
    if (this._currentWordPattern) {
      const match = referenceValue.match(this._currentWordPattern);
      const matchLength = match ? match[0].length : 0;
      if (matchLength !== referenceValue.length) {
        return this.clearRanges();
      }
    }
    const edits = [];
    for (let i = 1, len = this._currentDecorations.length; i < len; i++) {
      const mirrorRange = this._currentDecorations.getRange(i);
      if (!mirrorRange) {
        continue;
      }
      if (mirrorRange.startLineNumber !== mirrorRange.endLineNumber) {
        edits.push({
          range: mirrorRange,
          text: referenceValue
        });
      } else {
        let oldValue = model.getValueInRange(mirrorRange);
        let newValue = referenceValue;
        let rangeStartColumn = mirrorRange.startColumn;
        let rangeEndColumn = mirrorRange.endColumn;
        const commonPrefixLength = strings.commonPrefixLength(oldValue, newValue);
        rangeStartColumn += commonPrefixLength;
        oldValue = oldValue.substr(commonPrefixLength);
        newValue = newValue.substr(commonPrefixLength);
        const commonSuffixLength = strings.commonSuffixLength(oldValue, newValue);
        rangeEndColumn -= commonSuffixLength;
        oldValue = oldValue.substr(0, oldValue.length - commonSuffixLength);
        newValue = newValue.substr(0, newValue.length - commonSuffixLength);
        if (rangeStartColumn !== rangeEndColumn || newValue.length !== 0) {
          edits.push({
            range: new Range(mirrorRange.startLineNumber, rangeStartColumn, mirrorRange.endLineNumber, rangeEndColumn),
            text: newValue
          });
        }
      }
    }
    if (edits.length === 0) {
      return;
    }
    try {
      this._editor.popUndoStop();
      this._ignoreChangeEvent = true;
      const prevEditOperationType = this._editor._getViewModel().getPrevEditOperationType();
      this._editor.executeEdits("linkedEditing", edits);
      this._editor._getViewModel().setPrevEditOperationType(prevEditOperationType);
    } finally {
      this._ignoreChangeEvent = false;
    }
  }
  dispose() {
    this.clearRanges();
    super.dispose();
  }
  clearRanges() {
    this._visibleContextKey.set(false);
    this._currentDecorations.clear();
    if (this._currentRequestCts) {
      this._currentRequestCts.cancel();
      this._currentRequestCts = null;
      this._currentRequestPosition = null;
    }
  }
  get currentUpdateTriggerPromise() {
    return this._rangeUpdateTriggerPromise || Promise.resolve();
  }
  get currentSyncTriggerPromise() {
    return this._rangeSyncTriggerPromise || Promise.resolve();
  }
  async updateRanges(force = false) {
    if (!this._editor.hasModel()) {
      this.clearRanges();
      return;
    }
    const position = this._editor.getPosition();
    if (!this._enabled && !force || this._editor.getSelections().length > 1) {
      this.clearRanges();
      return;
    }
    const model = this._editor.getModel();
    const modelVersionId = model.getVersionId();
    if (this._currentRequestPosition && this._currentRequestModelVersion === modelVersionId) {
      if (position.equals(this._currentRequestPosition)) {
        return;
      }
      if (this._currentDecorations.length > 0) {
        const range = this._currentDecorations.getRange(0);
        if (range && range.containsPosition(position)) {
          return;
        }
      }
    }
    if (!this._currentRequestPosition?.equals(position)) {
      const currentRange = this._currentDecorations.getRange(0);
      if (!currentRange?.containsPosition(position)) {
        this.clearRanges();
      }
    }
    this._currentRequestPosition = position;
    this._currentRequestModelVersion = modelVersionId;
    const currentRequestCts = this._currentRequestCts = new CancellationTokenSource();
    try {
      const sw = new StopWatch(false);
      const response = await getLinkedEditingRanges(this._providers, model, position, currentRequestCts.token);
      this._debounceInformation.update(model, sw.elapsed());
      if (currentRequestCts !== this._currentRequestCts) {
        return;
      }
      this._currentRequestCts = null;
      if (modelVersionId !== model.getVersionId()) {
        return;
      }
      let ranges = [];
      if (response?.ranges) {
        ranges = response.ranges;
      }
      this._currentWordPattern = response?.wordPattern || this._languageWordPattern;
      let foundReferenceRange = false;
      for (let i = 0, len = ranges.length; i < len; i++) {
        if (Range.containsPosition(ranges[i], position)) {
          foundReferenceRange = true;
          if (i !== 0) {
            const referenceRange = ranges[i];
            ranges.splice(i, 1);
            ranges.unshift(referenceRange);
          }
          break;
        }
      }
      if (!foundReferenceRange) {
        this.clearRanges();
        return;
      }
      const decorations = ranges.map((range) => ({ range, options: LinkedEditingContribution.DECORATION }));
      this._visibleContextKey.set(true);
      this._currentDecorations.set(decorations);
      this._syncRangesToken++;
    } catch (err) {
      if (!isCancellationError(err)) {
        onUnexpectedError(err);
      }
      if (this._currentRequestCts === currentRequestCts || !this._currentRequestCts) {
        this.clearRanges();
      }
    }
  }
  // for testing
  setDebounceDuration(timeInMS) {
    this._debounceDuration = timeInMS;
  }
  // private printDecorators(model: ITextModel) {
  // 	return this._currentDecorations.map(d => {
  // 		const range = model.getDecorationRange(d);
  // 		if (range) {
  // 			return this.printRange(range);
  // 		}
  // 		return 'invalid';
  // 	}).join(',');
  // }
  // private printChanges(changes: IModelContentChange[]) {
  // 	return changes.map(c => {
  // 		return `${this.printRange(c.range)} - ${c.text}`;
  // 	}
  // 	).join(',');
  // }
  // private printRange(range: IRange) {
  // 	return `${range.startLineNumber},${range.startColumn}/${range.endLineNumber},${range.endColumn}`;
  // }
};
LinkedEditingContribution.ID = "editor.contrib.linkedEditing";
LinkedEditingContribution.DECORATION = ModelDecorationOptions.register({
  description: "linked-editing",
  stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
  className: DECORATION_CLASS_NAME
});
LinkedEditingContribution = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ILanguageConfigurationService),
  __decorateParam(4, ILanguageFeatureDebounceService)
], LinkedEditingContribution);
class LinkedEditingAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.linkedEditing",
      label: nls.localize2("linkedEditing.label", "Start Linked Editing"),
      precondition: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasRenameProvider),
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.F2,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  runCommand(accessor, args) {
    const editorService = accessor.get(ICodeEditorService);
    const [uri, pos] = Array.isArray(args) && args || [void 0, void 0];
    if (URI.isUri(uri) && Position.isIPosition(pos)) {
      return editorService.openCodeEditor({ resource: uri }, editorService.getActiveCodeEditor()).then((editor) => {
        if (!editor) {
          return;
        }
        editor.setPosition(pos);
        editor.invokeWithinContext((accessor2) => {
          this.reportTelemetry(accessor2, editor);
          return this.run(accessor2, editor);
        });
      }, onUnexpectedError);
    }
    return super.runCommand(accessor, args);
  }
  run(_accessor, editor) {
    const controller = LinkedEditingContribution.get(editor);
    if (controller) {
      return Promise.resolve(controller.updateRanges(true));
    }
    return Promise.resolve();
  }
}
const LinkedEditingCommand = EditorCommand.bindToContribution(LinkedEditingContribution.get);
registerEditorCommand(new LinkedEditingCommand({
  id: "cancelLinkedEditingInput",
  precondition: CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE,
  handler: (x) => x.clearRanges(),
  kbOpts: {
    kbExpr: EditorContextKeys.editorTextFocus,
    weight: KeybindingWeight.EditorContrib + 99,
    primary: KeyCode.Escape,
    secondary: [KeyMod.Shift | KeyCode.Escape]
  }
}));
function getLinkedEditingRanges(providers, model, position, token) {
  const orderedByScore = providers.ordered(model);
  return first(orderedByScore.map((provider) => async () => {
    try {
      return await provider.provideLinkedEditingRanges(model, position, token);
    } catch (e) {
      onUnexpectedExternalError(e);
      return void 0;
    }
  }), (result) => !!result && arrays.isNonEmptyArray(result?.ranges));
}
const editorLinkedEditingBackground = registerColor("editor.linkedEditingBackground", { dark: Color.fromHex("#f00").transparent(0.3), light: Color.fromHex("#f00").transparent(0.3), hcDark: Color.fromHex("#f00").transparent(0.3), hcLight: Color.white }, nls.localize("editorLinkedEditingBackground", "Background color when the editor auto renames on type."));
registerModelAndPositionCommand("_executeLinkedEditingProvider", (_accessor, model, position) => {
  const { linkedEditingRangeProvider } = _accessor.get(ILanguageFeaturesService);
  return getLinkedEditingRanges(linkedEditingRangeProvider, model, position, CancellationToken.None);
});
registerEditorContribution(LinkedEditingContribution.ID, LinkedEditingContribution, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(LinkedEditingAction);
export {
  CONTEXT_ONTYPE_RENAME_INPUT_VISIBLE,
  LinkedEditingAction,
  LinkedEditingContribution,
  editorLinkedEditingBackground
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmtlZEVkaXRpbmdcXGJyb3dzZXJcXGxpbmtlZEVkaXRpbmcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIGZpcnN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciwgb25VbmV4cGVjdGVkRXJyb3IsIG9uVW5leHBlY3RlZEV4dGVybmFsRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24sIEVkaXRvckNvbW1hbmQsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24sIHJlZ2lzdGVyRWRpdG9yQWN0aW9uLCByZWdpc3RlckVkaXRvckNvbW1hbmQsIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCByZWdpc3Rlck1vZGVsQW5kUG9zaXRpb25Db21tYW5kLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IExpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyLCBMaW5rZWRFZGl0aW5nUmFuZ2VzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24sIElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCAnLi9saW5rZWRFZGl0aW5nLmNzcyc7XG5cbmV4cG9ydCBjb25zdCBDT05URVhUX09OVFlQRV9SRU5BTUVfSU5QVVRfVklTSUJMRSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdMaW5rZWRFZGl0aW5nSW5wdXRWaXNpYmxlJywgZmFsc2UpO1xuXG5jb25zdCBERUNPUkFUSU9OX0NMQVNTX05BTUUgPSAnbGlua2VkLWVkaXRpbmctZGVjb3JhdGlvbic7XG5cbmV4cG9ydCBjbGFzcyBMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIubGlua2VkRWRpdGluZyc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVDT1JBVElPTiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAnbGlua2VkLWVkaXRpbmcnLFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuQWx3YXlzR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRjbGFzc05hbWU6IERFQ09SQVRJT05fQ0xBU1NfTkFNRVxuXHR9KTtcblxuXHRzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248TGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbj4oTGlua2VkRWRpdGluZ0NvbnRyaWJ1dGlvbi5JRCk7XG5cdH1cblxuXHRwcml2YXRlIF9kZWJvdW5jZUR1cmF0aW9uOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcj47XG5cdHByaXZhdGUgX2VuYWJsZWQ6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWJvdW5jZUluZm9ybWF0aW9uOiBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb247XG5cblx0cHJpdmF0ZSBfcmFuZ2VVcGRhdGVUcmlnZ2VyUHJvbWlzZTogUHJvbWlzZTx1bmtub3duPiB8IG51bGw7XG5cdHByaXZhdGUgX3JhbmdlU3luY1RyaWdnZXJQcm9taXNlOiBQcm9taXNlPHVua25vd24+IHwgbnVsbDtcblxuXHRwcml2YXRlIF9jdXJyZW50UmVxdWVzdEN0czogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCBudWxsO1xuXHRwcml2YXRlIF9jdXJyZW50UmVxdWVzdFBvc2l0aW9uOiBQb3NpdGlvbiB8IG51bGw7XG5cdHByaXZhdGUgX2N1cnJlbnRSZXF1ZXN0TW9kZWxWZXJzaW9uOiBudW1iZXIgfCBudWxsO1xuXG5cdHByaXZhdGUgX2N1cnJlbnREZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjsgLy8gVGhlIG9uZSBhdCBpbmRleCAwIGlzIHRoZSByZWZlcmVuY2Ugb25lXG5cdHByaXZhdGUgX3N5bmNSYW5nZXNUb2tlbjogbnVtYmVyID0gMDtcblxuXHRwcml2YXRlIF9sYW5ndWFnZVdvcmRQYXR0ZXJuOiBSZWdFeHAgfCBudWxsO1xuXHRwcml2YXRlIF9jdXJyZW50V29yZFBhdHRlcm46IFJlZ0V4cCB8IG51bGw7XG5cdHByaXZhdGUgX2lnbm9yZUNoYW5nZUV2ZW50OiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsVG9EaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX3Byb3ZpZGVycyA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyO1xuXHRcdHRoaXMuX2VuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLl92aXNpYmxlQ29udGV4dEtleSA9IENPTlRFWFRfT05UWVBFX1JFTkFNRV9JTlBVVF9WSVNJQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbiA9IGxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZS5mb3IodGhpcy5fcHJvdmlkZXJzLCAnTGlua2VkIEVkaXRpbmcnLCB7IG1heDogMjAwIH0pO1xuXG5cdFx0dGhpcy5fY3VycmVudERlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX2xhbmd1YWdlV29yZFBhdHRlcm4gPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnRXb3JkUGF0dGVybiA9IG51bGw7XG5cdFx0dGhpcy5faWdub3JlQ2hhbmdlRXZlbnQgPSBmYWxzZTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHR0aGlzLl9yYW5nZVVwZGF0ZVRyaWdnZXJQcm9taXNlID0gbnVsbDtcblx0XHR0aGlzLl9yYW5nZVN5bmNUcmlnZ2VyUHJvbWlzZSA9IG51bGw7XG5cblx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdEN0cyA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFJlcXVlc3RQb3NpdGlvbiA9IG51bGw7XG5cdFx0dGhpcy5fY3VycmVudFJlcXVlc3RNb2RlbFZlcnNpb24gPSBudWxsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4gdGhpcy5yZWluaXRpYWxpemUodHJ1ZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5rZWRFZGl0aW5nKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnJlbmFtZU9uVHlwZSkpIHtcblx0XHRcdFx0dGhpcy5yZWluaXRpYWxpemUoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9wcm92aWRlcnMub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5yZWluaXRpYWxpemUoZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoKSA9PiB0aGlzLnJlaW5pdGlhbGl6ZSh0cnVlKSkpO1xuXG5cdFx0dGhpcy5yZWluaXRpYWxpemUodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlaW5pdGlhbGl6ZShmb3JjZVJlZnJlc2g6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGlzRW5hYmxlZCA9IG1vZGVsICE9PSBudWxsICYmICh0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5rZWRFZGl0aW5nKSB8fCB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5yZW5hbWVPblR5cGUpKSAmJiB0aGlzLl9wcm92aWRlcnMuaGFzKG1vZGVsKTtcblx0XHRpZiAoaXNFbmFibGVkID09PSB0aGlzLl9lbmFibGVkICYmICFmb3JjZVJlZnJlc2gpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbmFibGVkID0gaXNFbmFibGVkO1xuXG5cdFx0dGhpcy5jbGVhclJhbmdlcygpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmNsZWFyKCk7XG5cblx0XHRpZiAoIWlzRW5hYmxlZCB8fCBtb2RlbCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZChcblx0XHRcdEV2ZW50LnJ1bkFuZFN1YnNjcmliZShcblx0XHRcdFx0bW9kZWwub25EaWRDaGFuZ2VMYW5ndWFnZUNvbmZpZ3VyYXRpb24sXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sYW5ndWFnZVdvcmRQYXR0ZXJuID0gdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihtb2RlbC5nZXRMYW5ndWFnZUlkKCkpLmdldFdvcmREZWZpbml0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdClcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmFuZ2VVcGRhdGVTY2hlZHVsZXIgPSBuZXcgRGVsYXllcih0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLmdldChtb2RlbCkpO1xuXHRcdGNvbnN0IHRyaWdnZXJSYW5nZVVwZGF0ZSA9ICgpID0+IHtcblx0XHRcdHRoaXMuX3JhbmdlVXBkYXRlVHJpZ2dlclByb21pc2UgPSByYW5nZVVwZGF0ZVNjaGVkdWxlci50cmlnZ2VyKCgpID0+IHRoaXMudXBkYXRlUmFuZ2VzKCksIHRoaXMuX2RlYm91bmNlRHVyYXRpb24gPz8gdGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi5nZXQobW9kZWwpKTtcblx0XHR9O1xuXHRcdGNvbnN0IHJhbmdlU3luY1NjaGVkdWxlciA9IG5ldyBEZWxheWVyKDApO1xuXHRcdGNvbnN0IHRyaWdnZXJSYW5nZVN5bmMgPSAodG9rZW46IG51bWJlcikgPT4ge1xuXHRcdFx0dGhpcy5fcmFuZ2VTeW5jVHJpZ2dlclByb21pc2UgPSByYW5nZVN5bmNTY2hlZHVsZXIudHJpZ2dlcigoKSA9PiB0aGlzLl9zeW5jUmFuZ2VzKHRva2VuKSk7XG5cdFx0fTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKCkgPT4ge1xuXHRcdFx0dHJpZ2dlclJhbmdlVXBkYXRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsVG9EaXNwb3NlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKGUpID0+IHtcblx0XHRcdGlmICghdGhpcy5faWdub3JlQ2hhbmdlRXZlbnQpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlUmFuZ2UgPSB0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMuZ2V0UmFuZ2UoMCk7XG5cdFx0XHRcdFx0aWYgKHJlZmVyZW5jZVJhbmdlICYmIGUuY2hhbmdlcy5ldmVyeShjID0+IHJlZmVyZW5jZVJhbmdlLmludGVyc2VjdFJhbmdlcyhjLnJhbmdlKSkpIHtcblx0XHRcdFx0XHRcdHRyaWdnZXJSYW5nZVN5bmModGhpcy5fc3luY1Jhbmdlc1Rva2VuKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRyaWdnZXJSYW5nZVVwZGF0ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9sb2NhbFRvRGlzcG9zZS5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRyYW5nZVVwZGF0ZVNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0XHRcdHJhbmdlU3luY1NjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy51cGRhdGVSYW5nZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3N5bmNSYW5nZXModG9rZW46IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIGRlbGF5ZWQgaW52b2NhdGlvbiwgbWFrZSBzdXJlIHdlJ3JlIHN0aWxsIG9uXG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSB8fCB0b2tlbiAhPT0gdGhpcy5fc3luY1Jhbmdlc1Rva2VuIHx8IHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIG5vdGhpbmcgdG8gZG9cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHJlZmVyZW5jZVJhbmdlID0gdGhpcy5fY3VycmVudERlY29yYXRpb25zLmdldFJhbmdlKDApO1xuXG5cdFx0aWYgKCFyZWZlcmVuY2VSYW5nZSB8fCByZWZlcmVuY2VSYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHJlZmVyZW5jZVJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLmNsZWFyUmFuZ2VzKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVmZXJlbmNlVmFsdWUgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocmVmZXJlbmNlUmFuZ2UpO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50V29yZFBhdHRlcm4pIHtcblx0XHRcdGNvbnN0IG1hdGNoID0gcmVmZXJlbmNlVmFsdWUubWF0Y2godGhpcy5fY3VycmVudFdvcmRQYXR0ZXJuKTtcblx0XHRcdGNvbnN0IG1hdGNoTGVuZ3RoID0gbWF0Y2ggPyBtYXRjaFswXS5sZW5ndGggOiAwO1xuXHRcdFx0aWYgKG1hdGNoTGVuZ3RoICE9PSByZWZlcmVuY2VWYWx1ZS5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuY2xlYXJSYW5nZXMoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAxLCBsZW4gPSB0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IG1pcnJvclJhbmdlID0gdGhpcy5fY3VycmVudERlY29yYXRpb25zLmdldFJhbmdlKGkpO1xuXHRcdFx0aWYgKCFtaXJyb3JSYW5nZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChtaXJyb3JSYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IG1pcnJvclJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0ZWRpdHMucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2U6IG1pcnJvclJhbmdlLFxuXHRcdFx0XHRcdHRleHQ6IHJlZmVyZW5jZVZhbHVlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IG9sZFZhbHVlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG1pcnJvclJhbmdlKTtcblx0XHRcdFx0bGV0IG5ld1ZhbHVlID0gcmVmZXJlbmNlVmFsdWU7XG5cdFx0XHRcdGxldCByYW5nZVN0YXJ0Q29sdW1uID0gbWlycm9yUmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0XHRcdGxldCByYW5nZUVuZENvbHVtbiA9IG1pcnJvclJhbmdlLmVuZENvbHVtbjtcblxuXHRcdFx0XHRjb25zdCBjb21tb25QcmVmaXhMZW5ndGggPSBzdHJpbmdzLmNvbW1vblByZWZpeExlbmd0aChvbGRWYWx1ZSwgbmV3VmFsdWUpO1xuXHRcdFx0XHRyYW5nZVN0YXJ0Q29sdW1uICs9IGNvbW1vblByZWZpeExlbmd0aDtcblx0XHRcdFx0b2xkVmFsdWUgPSBvbGRWYWx1ZS5zdWJzdHIoY29tbW9uUHJlZml4TGVuZ3RoKTtcblx0XHRcdFx0bmV3VmFsdWUgPSBuZXdWYWx1ZS5zdWJzdHIoY29tbW9uUHJlZml4TGVuZ3RoKTtcblxuXHRcdFx0XHRjb25zdCBjb21tb25TdWZmaXhMZW5ndGggPSBzdHJpbmdzLmNvbW1vblN1ZmZpeExlbmd0aChvbGRWYWx1ZSwgbmV3VmFsdWUpO1xuXHRcdFx0XHRyYW5nZUVuZENvbHVtbiAtPSBjb21tb25TdWZmaXhMZW5ndGg7XG5cdFx0XHRcdG9sZFZhbHVlID0gb2xkVmFsdWUuc3Vic3RyKDAsIG9sZFZhbHVlLmxlbmd0aCAtIGNvbW1vblN1ZmZpeExlbmd0aCk7XG5cdFx0XHRcdG5ld1ZhbHVlID0gbmV3VmFsdWUuc3Vic3RyKDAsIG5ld1ZhbHVlLmxlbmd0aCAtIGNvbW1vblN1ZmZpeExlbmd0aCk7XG5cblx0XHRcdFx0aWYgKHJhbmdlU3RhcnRDb2x1bW4gIT09IHJhbmdlRW5kQ29sdW1uIHx8IG5ld1ZhbHVlLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRcdGVkaXRzLnB1c2goe1xuXHRcdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShtaXJyb3JSYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlU3RhcnRDb2x1bW4sIG1pcnJvclJhbmdlLmVuZExpbmVOdW1iZXIsIHJhbmdlRW5kQ29sdW1uKSxcblx0XHRcdFx0XHRcdHRleHQ6IG5ld1ZhbHVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2VkaXRvci5wb3BVbmRvU3RvcCgpO1xuXHRcdFx0dGhpcy5faWdub3JlQ2hhbmdlRXZlbnQgPSB0cnVlO1xuXHRcdFx0Y29uc3QgcHJldkVkaXRPcGVyYXRpb25UeXBlID0gdGhpcy5fZWRpdG9yLl9nZXRWaWV3TW9kZWwoKS5nZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUoKTtcblx0XHRcdHRoaXMuX2VkaXRvci5leGVjdXRlRWRpdHMoJ2xpbmtlZEVkaXRpbmcnLCBlZGl0cyk7XG5cdFx0XHR0aGlzLl9lZGl0b3IuX2dldFZpZXdNb2RlbCgpLnNldFByZXZFZGl0T3BlcmF0aW9uVHlwZShwcmV2RWRpdE9wZXJhdGlvblR5cGUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pZ25vcmVDaGFuZ2VFdmVudCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2xlYXJSYW5nZXMoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJSYW5nZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlzaWJsZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5fY3VycmVudFJlcXVlc3RDdHMpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0Q3RzLmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fY3VycmVudFJlcXVlc3RDdHMgPSBudWxsO1xuXHRcdFx0dGhpcy5fY3VycmVudFJlcXVlc3RQb3NpdGlvbiA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBjdXJyZW50VXBkYXRlVHJpZ2dlclByb21pc2UoKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JhbmdlVXBkYXRlVHJpZ2dlclByb21pc2UgfHwgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGN1cnJlbnRTeW5jVHJpZ2dlclByb21pc2UoKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JhbmdlU3luY1RyaWdnZXJQcm9taXNlIHx8IFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHVwZGF0ZVJhbmdlcyhmb3JjZSA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0dGhpcy5jbGVhclJhbmdlcygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkICYmICFmb3JjZSB8fCB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpLmxlbmd0aCA+IDEpIHtcblx0XHRcdC8vIGRpc2FibGVkIG9yIG11bHRpY3Vyc29yXG5cdFx0XHR0aGlzLmNsZWFyUmFuZ2VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBtb2RlbFZlcnNpb25JZCA9IG1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50UmVxdWVzdFBvc2l0aW9uICYmIHRoaXMuX2N1cnJlbnRSZXF1ZXN0TW9kZWxWZXJzaW9uID09PSBtb2RlbFZlcnNpb25JZCkge1xuXHRcdFx0aWYgKHBvc2l0aW9uLmVxdWFscyh0aGlzLl9jdXJyZW50UmVxdWVzdFBvc2l0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHNhbWUgcG9zaXRpb25cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuX2N1cnJlbnREZWNvcmF0aW9ucy5nZXRSYW5nZSgwKTtcblx0XHRcdFx0aWYgKHJhbmdlICYmIHJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBqdXN0IG1vdmluZyBpbnNpZGUgdGhlIGV4aXN0aW5nIHByaW1hcnkgcmFuZ2Vcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY3VycmVudFJlcXVlc3RQb3NpdGlvbj8uZXF1YWxzKHBvc2l0aW9uKSkge1xuXHRcdFx0Ly8gR2V0IHRoZSBjdXJyZW50IHJhbmdlIG9mIHRoZSBmaXJzdCBkZWNvcmF0aW9uIChyZWZlcmVuY2UgcmFuZ2UpXG5cdFx0XHRjb25zdCBjdXJyZW50UmFuZ2UgPSB0aGlzLl9jdXJyZW50RGVjb3JhdGlvbnMuZ2V0UmFuZ2UoMCk7XG5cdFx0XHQvLyBJZiB0aGVyZSBpcyBubyBjdXJyZW50IHJhbmdlIG9yIHRoZSBjdXJyZW50IHJhbmdlIGRvZXMgbm90IGNvbnRhaW4gdGhlIG5ldyBwb3NpdGlvbiwgY2xlYXIgdGhlIHJhbmdlc1xuXHRcdFx0aWYgKCFjdXJyZW50UmFuZ2U/LmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdC8vIENsZWFyIGV4aXN0aW5nIGRlY29yYXRpb25zIHdoaWxlIHdlIGNvbXB1dGUgbmV3IG9uZXNcblx0XHRcdFx0dGhpcy5jbGVhclJhbmdlcygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2N1cnJlbnRSZXF1ZXN0UG9zaXRpb24gPSBwb3NpdGlvbjtcblx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdE1vZGVsVmVyc2lvbiA9IG1vZGVsVmVyc2lvbklkO1xuXG5cdFx0Y29uc3QgY3VycmVudFJlcXVlc3RDdHMgPSB0aGlzLl9jdXJyZW50UmVxdWVzdEN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goZmFsc2UpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXRMaW5rZWRFZGl0aW5nUmFuZ2VzKHRoaXMuX3Byb3ZpZGVycywgbW9kZWwsIHBvc2l0aW9uLCBjdXJyZW50UmVxdWVzdEN0cy50b2tlbik7XG5cdFx0XHR0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLnVwZGF0ZShtb2RlbCwgc3cuZWxhcHNlZCgpKTtcblx0XHRcdGlmIChjdXJyZW50UmVxdWVzdEN0cyAhPT0gdGhpcy5fY3VycmVudFJlcXVlc3RDdHMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY3VycmVudFJlcXVlc3RDdHMgPSBudWxsO1xuXHRcdFx0aWYgKG1vZGVsVmVyc2lvbklkICE9PSBtb2RlbC5nZXRWZXJzaW9uSWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCByYW5nZXM6IElSYW5nZVtdID0gW107XG5cdFx0XHRpZiAocmVzcG9uc2U/LnJhbmdlcykge1xuXHRcdFx0XHRyYW5nZXMgPSByZXNwb25zZS5yYW5nZXM7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRXb3JkUGF0dGVybiA9IHJlc3BvbnNlPy53b3JkUGF0dGVybiB8fCB0aGlzLl9sYW5ndWFnZVdvcmRQYXR0ZXJuO1xuXG5cdFx0XHRsZXQgZm91bmRSZWZlcmVuY2VSYW5nZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRpZiAoUmFuZ2UuY29udGFpbnNQb3NpdGlvbihyYW5nZXNbaV0sIHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdGZvdW5kUmVmZXJlbmNlUmFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdGlmIChpICE9PSAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZWZlcmVuY2VSYW5nZSA9IHJhbmdlc1tpXTtcblx0XHRcdFx0XHRcdHJhbmdlcy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRyYW5nZXMudW5zaGlmdChyZWZlcmVuY2VSYW5nZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZm91bmRSZWZlcmVuY2VSYW5nZSkge1xuXHRcdFx0XHQvLyBDYW5ub3QgZG8gbGlua2VkIGVkaXRpbmcgaWYgdGhlIHJhbmdlcyBhcmUgbm90IHdoZXJlIHRoZSBjdXJzb3IgaXMuLi5cblx0XHRcdFx0dGhpcy5jbGVhclJhbmdlcygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IHJhbmdlcy5tYXAocmFuZ2UgPT4gKHsgcmFuZ2U6IHJhbmdlLCBvcHRpb25zOiBMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLkRFQ09SQVRJT04gfSkpO1xuXHRcdFx0dGhpcy5fdmlzaWJsZUNvbnRleHRLZXkuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fY3VycmVudERlY29yYXRpb25zLnNldChkZWNvcmF0aW9ucyk7XG5cdFx0XHR0aGlzLl9zeW5jUmFuZ2VzVG9rZW4rKzsgLy8gY2FuY2VsIGFueSBwZW5kaW5nIHN5bmNSYW5nZXMgY2FsbFxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50UmVxdWVzdEN0cyA9PT0gY3VycmVudFJlcXVlc3RDdHMgfHwgIXRoaXMuX2N1cnJlbnRSZXF1ZXN0Q3RzKSB7XG5cdFx0XHRcdC8vIHN0b3AgaWYgd2UgYXJlIHN0aWxsIHRoZSBsYXRlc3QgcmVxdWVzdFxuXHRcdFx0XHR0aGlzLmNsZWFyUmFuZ2VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxuXHQvLyBmb3IgdGVzdGluZ1xuXHRwdWJsaWMgc2V0RGVib3VuY2VEdXJhdGlvbih0aW1lSW5NUzogbnVtYmVyKSB7XG5cdFx0dGhpcy5fZGVib3VuY2VEdXJhdGlvbiA9IHRpbWVJbk1TO1xuXHR9XG5cblx0Ly8gcHJpdmF0ZSBwcmludERlY29yYXRvcnMobW9kZWw6IElUZXh0TW9kZWwpIHtcblx0Ly8gXHRyZXR1cm4gdGhpcy5fY3VycmVudERlY29yYXRpb25zLm1hcChkID0+IHtcblx0Ly8gXHRcdGNvbnN0IHJhbmdlID0gbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGQpO1xuXHQvLyBcdFx0aWYgKHJhbmdlKSB7XG5cdC8vIFx0XHRcdHJldHVybiB0aGlzLnByaW50UmFuZ2UocmFuZ2UpO1xuXHQvLyBcdFx0fVxuXHQvLyBcdFx0cmV0dXJuICdpbnZhbGlkJztcblx0Ly8gXHR9KS5qb2luKCcsJyk7XG5cdC8vIH1cblxuXHQvLyBwcml2YXRlIHByaW50Q2hhbmdlcyhjaGFuZ2VzOiBJTW9kZWxDb250ZW50Q2hhbmdlW10pIHtcblx0Ly8gXHRyZXR1cm4gY2hhbmdlcy5tYXAoYyA9PiB7XG5cdC8vIFx0XHRyZXR1cm4gYCR7dGhpcy5wcmludFJhbmdlKGMucmFuZ2UpfSAtICR7Yy50ZXh0fWA7XG5cdC8vIFx0fVxuXHQvLyBcdCkuam9pbignLCcpO1xuXHQvLyB9XG5cblx0Ly8gcHJpdmF0ZSBwcmludFJhbmdlKHJhbmdlOiBJUmFuZ2UpIHtcblx0Ly8gXHRyZXR1cm4gYCR7cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyfSwke3JhbmdlLnN0YXJ0Q29sdW1ufS8ke3JhbmdlLmVuZExpbmVOdW1iZXJ9LCR7cmFuZ2UuZW5kQ29sdW1ufWA7XG5cdC8vIH1cbn1cblxuZXhwb3J0IGNsYXNzIExpbmtlZEVkaXRpbmdBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ubGlua2VkRWRpdGluZycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignbGlua2VkRWRpdGluZy5sYWJlbCcsIFwiU3RhcnQgTGlua2VkIEVkaXRpbmdcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZSwgRWRpdG9yQ29udGV4dEtleXMuaGFzUmVuYW1lUHJvdmlkZXIpLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuRjIsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5Db21tYW5kKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBhcmdzOiBbVVJJLCBJUG9zaXRpb25dKTogdm9pZCB8IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBbdXJpLCBwb3NdID0gQXJyYXkuaXNBcnJheShhcmdzKSAmJiBhcmdzIHx8IFt1bmRlZmluZWQsIHVuZGVmaW5lZF07XG5cblx0XHRpZiAoVVJJLmlzVXJpKHVyaSkgJiYgUG9zaXRpb24uaXNJUG9zaXRpb24ocG9zKSkge1xuXHRcdFx0cmV0dXJuIGVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3IoeyByZXNvdXJjZTogdXJpIH0sIGVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpKS50aGVuKGVkaXRvciA9PiB7XG5cdFx0XHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihwb3MpO1xuXHRcdFx0XHRlZGl0b3IuaW52b2tlV2l0aGluQ29udGV4dChhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5yZXBvcnRUZWxlbWV0cnkoYWNjZXNzb3IsIGVkaXRvcik7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucnVuKGFjY2Vzc29yLCBlZGl0b3IpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sIG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIucnVuQ29tbWFuZChhY2Nlc3NvciwgYXJncyk7XG5cdH1cblxuXHRydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IExpbmtlZEVkaXRpbmdDb250cmlidXRpb24uZ2V0KGVkaXRvcik7XG5cdFx0aWYgKGNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoY29udHJvbGxlci51cGRhdGVSYW5nZXModHJ1ZSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuY29uc3QgTGlua2VkRWRpdGluZ0NvbW1hbmQgPSBFZGl0b3JDb21tYW5kLmJpbmRUb0NvbnRyaWJ1dGlvbjxMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uPihMaW5rZWRFZGl0aW5nQ29udHJpYnV0aW9uLmdldCk7XG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IExpbmtlZEVkaXRpbmdDb21tYW5kKHtcblx0aWQ6ICdjYW5jZWxMaW5rZWRFZGl0aW5nSW5wdXQnLFxuXHRwcmVjb25kaXRpb246IENPTlRFWFRfT05UWVBFX1JFTkFNRV9JTlBVVF9WSVNJQkxFLFxuXHRoYW5kbGVyOiB4ID0+IHguY2xlYXJSYW5nZXMoKSxcblx0a2JPcHRzOiB7XG5cdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIgKyA5OSxcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkVzY2FwZV1cblx0fVxufSkpO1xuXG5cbmZ1bmN0aW9uIGdldExpbmtlZEVkaXRpbmdSYW5nZXMocHJvdmlkZXJzOiBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxMaW5rZWRFZGl0aW5nUmFuZ2VQcm92aWRlcj4sIG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8TGlua2VkRWRpdGluZ1JhbmdlcyB8IHVuZGVmaW5lZCB8IG51bGw+IHtcblx0Y29uc3Qgb3JkZXJlZEJ5U2NvcmUgPSBwcm92aWRlcnMub3JkZXJlZChtb2RlbCk7XG5cblx0Ly8gaW4gb3JkZXIgb2Ygc2NvcmUgYXNrIHRoZSBsaW5rZWQgZWRpdGluZyByYW5nZSBwcm92aWRlclxuXHQvLyB1bnRpbCBzb21lb25lIHJlc3BvbnNlIHdpdGggYSBnb29kIHJlc3VsdFxuXHQvLyAoZ29vZCA9IG5vdCBudWxsKVxuXHRyZXR1cm4gZmlyc3Q8TGlua2VkRWRpdGluZ1JhbmdlcyB8IHVuZGVmaW5lZCB8IG51bGw+KG9yZGVyZWRCeVNjb3JlLm1hcChwcm92aWRlciA9PiBhc3luYyAoKSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwcm92aWRlci5wcm92aWRlTGlua2VkRWRpdGluZ1Jhbmdlcyhtb2RlbCwgcG9zaXRpb24sIHRva2VuKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yKGUpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH0pLCByZXN1bHQgPT4gISFyZXN1bHQgJiYgYXJyYXlzLmlzTm9uRW1wdHlBcnJheShyZXN1bHQ/LnJhbmdlcykpO1xufVxuXG5leHBvcnQgY29uc3QgZWRpdG9yTGlua2VkRWRpdGluZ0JhY2tncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IubGlua2VkRWRpdGluZ0JhY2tncm91bmQnLCB7IGRhcms6IENvbG9yLmZyb21IZXgoJyNmMDAnKS50cmFuc3BhcmVudCgwLjMpLCBsaWdodDogQ29sb3IuZnJvbUhleCgnI2YwMCcpLnRyYW5zcGFyZW50KDAuMyksIGhjRGFyazogQ29sb3IuZnJvbUhleCgnI2YwMCcpLnRyYW5zcGFyZW50KDAuMyksIGhjTGlnaHQ6IENvbG9yLndoaXRlIH0sIG5scy5sb2NhbGl6ZSgnZWRpdG9yTGlua2VkRWRpdGluZ0JhY2tncm91bmQnLCAnQmFja2dyb3VuZCBjb2xvciB3aGVuIHRoZSBlZGl0b3IgYXV0byByZW5hbWVzIG9uIHR5cGUuJykpO1xuXG5yZWdpc3Rlck1vZGVsQW5kUG9zaXRpb25Db21tYW5kKCdfZXhlY3V0ZUxpbmtlZEVkaXRpbmdQcm92aWRlcicsIChfYWNjZXNzb3IsIG1vZGVsLCBwb3NpdGlvbikgPT4ge1xuXHRjb25zdCB7IGxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyIH0gPSBfYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdHJldHVybiBnZXRMaW5rZWRFZGl0aW5nUmFuZ2VzKGxpbmtlZEVkaXRpbmdSYW5nZVByb3ZpZGVyLCBtb2RlbCwgcG9zaXRpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xufSk7XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKExpbmtlZEVkaXRpbmdDb250cmlidXRpb24uSUQsIExpbmtlZEVkaXRpbmdDb250cmlidXRpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uQWZ0ZXJGaXJzdFJlbmRlcik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihMaW5rZWRFZGl0aW5nQWN0aW9uKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBcUIsbUJBQW1CLGlDQUFpQztBQUNsRixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxZQUFZLGFBQWE7QUFDekIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsY0FBYyxlQUFlLGlDQUFpQyxzQkFBc0IsdUJBQXVCLDRCQUE0Qix1Q0FBeUQ7QUFDek0sU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQWlCLGFBQWE7QUFFOUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBNEMsOEJBQThCO0FBQzFFLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMscUNBQXFDO0FBQzlDLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUE2QixvQkFBb0IscUJBQXFCO0FBQy9FLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBRzlCLFNBQXNDLHVDQUF1QztBQUM3RSxTQUFTLGlCQUFpQjtBQUMxQixPQUFP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
