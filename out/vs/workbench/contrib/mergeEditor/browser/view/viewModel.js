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
import { findLast } from "../../../../../base/common/arraysFind.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { derived, derivedObservableWithWritableCache, observableValue, transaction } from "../../../../../base/common/observable.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../../editor/common/editorCommon.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { MergeEditorLineRange } from "../model/lineRange.js";
import { observableConfigValue } from "../../../../../platform/observable/common/platformObservableUtils.js";
let MergeEditorViewModel = class extends Disposable {
  constructor(model, inputCodeEditorView1, inputCodeEditorView2, resultCodeEditorView, baseCodeEditorView, showNonConflictingChanges, configurationService, notificationService) {
    super();
    this.model = model;
    this.inputCodeEditorView1 = inputCodeEditorView1;
    this.inputCodeEditorView2 = inputCodeEditorView2;
    this.resultCodeEditorView = resultCodeEditorView;
    this.baseCodeEditorView = baseCodeEditorView;
    this.showNonConflictingChanges = showNonConflictingChanges;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.manuallySetActiveModifiedBaseRange = observableValue(this, { range: void 0, counter: 0 });
    this.attachedHistory = this._register(new AttachedHistory(this.model.resultTextModel));
    this.shouldUseAppendInsteadOfAccept = observableConfigValue(
      "mergeEditor.shouldUseAppendInsteadOfAccept",
      false,
      this.configurationService
    );
    this.counter = 0;
    this.lastFocusedEditor = derivedObservableWithWritableCache(this, (reader, lastValue) => {
      const editors = [
        this.inputCodeEditorView1,
        this.inputCodeEditorView2,
        this.resultCodeEditorView,
        this.baseCodeEditorView.read(reader)
      ];
      const view = editors.find((e) => e && e.isFocused.read(reader));
      return view ? { view, counter: this.counter++ } : lastValue || { view: void 0, counter: this.counter++ };
    });
    this.baseShowDiffAgainst = derived(this, (reader) => {
      const lastFocusedEditor = this.lastFocusedEditor.read(reader);
      if (lastFocusedEditor.view === this.inputCodeEditorView1) {
        return 1;
      } else if (lastFocusedEditor.view === this.inputCodeEditorView2) {
        return 2;
      }
      return void 0;
    });
    this.focusedEditorType = derived(this, (reader) => {
      const lastFocusedEditor = this.lastFocusedEditor.read(reader);
      if (!lastFocusedEditor.view) {
        return void 0;
      }
      if (lastFocusedEditor.view === this.inputCodeEditorView1) {
        return "input1";
      } else if (lastFocusedEditor.view === this.inputCodeEditorView2) {
        return "input2";
      } else if (lastFocusedEditor.view === this.resultCodeEditorView) {
        return "result";
      } else if (lastFocusedEditor.view === this.baseCodeEditorView.read(reader)) {
        return "base";
      }
      return void 0;
    });
    this.selectionInBase = derived(this, (reader) => {
      const sourceEditor = this.lastFocusedEditor.read(reader).view;
      if (!sourceEditor) {
        return void 0;
      }
      const selections = sourceEditor.selection.read(reader) || [];
      const rangesInBase = selections.map((selection) => {
        if (sourceEditor === this.inputCodeEditorView1) {
          return this.model.translateInputRangeToBase(1, selection);
        } else if (sourceEditor === this.inputCodeEditorView2) {
          return this.model.translateInputRangeToBase(2, selection);
        } else if (sourceEditor === this.resultCodeEditorView) {
          return this.model.translateResultRangeToBase(selection);
        } else if (sourceEditor === this.baseCodeEditorView.read(reader)) {
          return selection;
        } else {
          return selection;
        }
      });
      return {
        rangesInBase,
        sourceEditor
      };
    });
    this.activeModifiedBaseRange = derived(
      this,
      (reader) => {
        const focusedEditor = this.lastFocusedEditor.read(reader);
        const manualRange = this.manuallySetActiveModifiedBaseRange.read(reader);
        if (manualRange.counter > focusedEditor.counter) {
          return manualRange.range;
        }
        if (!focusedEditor.view) {
          return;
        }
        const cursorLineNumber = focusedEditor.view.cursorLineNumber.read(reader);
        if (!cursorLineNumber) {
          return void 0;
        }
        const modifiedBaseRanges = this.model.modifiedBaseRanges.read(reader);
        return modifiedBaseRanges.find((r) => {
          const range = this.getRangeOfModifiedBaseRange(focusedEditor.view, r, reader);
          return range.isEmpty ? range.startLineNumber === cursorLineNumber : range.contains(cursorLineNumber);
        });
      }
    );
    this._register(resultCodeEditorView.editor.onDidChangeModelContent((e) => {
      if (this.model.isApplyingEditInResult || e.isRedoing || e.isUndoing) {
        return;
      }
      const baseRangeStates = [];
      for (const change of e.changes) {
        const rangeInBase = this.model.translateResultRangeToBase(Range.lift(change.range));
        const baseRanges = this.model.findModifiedBaseRangesInRange(MergeEditorLineRange.fromLength(rangeInBase.startLineNumber, rangeInBase.endLineNumber - rangeInBase.startLineNumber));
        if (baseRanges.length === 1) {
          const isHandled = this.model.isHandled(baseRanges[0]).get();
          if (!isHandled) {
            baseRangeStates.push(baseRanges[0]);
          }
        }
      }
      if (baseRangeStates.length === 0) {
        return;
      }
      const element = {
        model: this.model,
        redo() {
          transaction((tx) => {
            for (const r of baseRangeStates) {
              this.model.setHandled(r, true, tx);
            }
          });
        },
        undo() {
          transaction((tx) => {
            for (const r of baseRangeStates) {
              this.model.setHandled(r, false, tx);
            }
          });
        }
      };
      this.attachedHistory.pushAttachedHistoryElement(element);
      element.redo();
    }));
  }
  getRangeOfModifiedBaseRange(editor, modifiedBaseRange, reader) {
    if (editor === this.resultCodeEditorView) {
      return this.model.getLineRangeInResult(modifiedBaseRange.baseRange, reader);
    } else if (editor === this.baseCodeEditorView.get()) {
      return modifiedBaseRange.baseRange;
    } else {
      const input = editor === this.inputCodeEditorView1 ? 1 : 2;
      return modifiedBaseRange.getInputRange(input);
    }
  }
  setActiveModifiedBaseRange(range, tx) {
    this.manuallySetActiveModifiedBaseRange.set({ range, counter: this.counter++ }, tx);
  }
  setState(baseRange, state, tx, inputNumber) {
    this.manuallySetActiveModifiedBaseRange.set({ range: baseRange, counter: this.counter++ }, tx);
    this.model.setState(baseRange, state, inputNumber, tx);
    this.lastFocusedEditor.clearCache(tx);
  }
  goToConflict(getModifiedBaseRange) {
    let editor = this.lastFocusedEditor.get().view;
    if (!editor) {
      editor = this.resultCodeEditorView;
    }
    const curLineNumber = editor.editor.getPosition()?.lineNumber;
    if (curLineNumber === void 0) {
      return;
    }
    const modifiedBaseRange = getModifiedBaseRange(editor, curLineNumber);
    if (modifiedBaseRange) {
      const range = this.getRangeOfModifiedBaseRange(editor, modifiedBaseRange, void 0);
      editor.editor.focus();
      let startLineNumber = range.startLineNumber;
      let endLineNumberExclusive = range.endLineNumberExclusive;
      if (range.startLineNumber > editor.editor.getModel().getLineCount()) {
        transaction((tx) => {
          this.setActiveModifiedBaseRange(modifiedBaseRange, tx);
        });
        startLineNumber = endLineNumberExclusive = editor.editor.getModel().getLineCount();
      }
      editor.editor.setPosition({
        lineNumber: startLineNumber,
        column: editor.editor.getModel().getLineFirstNonWhitespaceColumn(startLineNumber)
      });
      editor.editor.revealLinesNearTop(startLineNumber, endLineNumberExclusive, ScrollType.Smooth);
    }
  }
  goToNextModifiedBaseRange(predicate) {
    this.goToConflict(
      (e, l) => this.model.modifiedBaseRanges.get().find(
        (r) => predicate(r) && this.getRangeOfModifiedBaseRange(e, r, void 0).startLineNumber > l
      ) || this.model.modifiedBaseRanges.get().find((r) => predicate(r))
    );
  }
  goToPreviousModifiedBaseRange(predicate) {
    this.goToConflict(
      (e, l) => findLast(
        this.model.modifiedBaseRanges.get(),
        (r) => predicate(r) && this.getRangeOfModifiedBaseRange(e, r, void 0).endLineNumberExclusive < l
      ) || findLast(
        this.model.modifiedBaseRanges.get(),
        (r) => predicate(r)
      )
    );
  }
  toggleActiveConflict(inputNumber) {
    const activeModifiedBaseRange = this.activeModifiedBaseRange.get();
    if (!activeModifiedBaseRange) {
      this.notificationService.error(localize("noConflictMessage", "There is currently no conflict focused that can be toggled."));
      return;
    }
    transaction((tx) => {
      this.setState(
        activeModifiedBaseRange,
        this.model.getState(activeModifiedBaseRange).get().toggle(inputNumber),
        tx,
        inputNumber
      );
    });
  }
  acceptAll(inputNumber) {
    transaction((tx) => {
      for (const range of this.model.modifiedBaseRanges.get()) {
        this.setState(
          range,
          this.model.getState(range).get().withInputValue(inputNumber, true),
          tx,
          inputNumber
        );
      }
    });
  }
};
MergeEditorViewModel = __decorateClass([
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, INotificationService)
], MergeEditorViewModel);
class AttachedHistory extends Disposable {
  constructor(model) {
    super();
    this.model = model;
    this.attachedHistory = [];
    this.previousAltId = this.model.getAlternativeVersionId();
    this._register(model.onDidChangeContent((e) => {
      const currentAltId = model.getAlternativeVersionId();
      if (e.isRedoing) {
        for (const item of this.attachedHistory) {
          if (this.previousAltId < item.altId && item.altId <= currentAltId) {
            item.element.redo();
          }
        }
      } else if (e.isUndoing) {
        for (let i = this.attachedHistory.length - 1; i >= 0; i--) {
          const item = this.attachedHistory[i];
          if (currentAltId < item.altId && item.altId <= this.previousAltId) {
            item.element.undo();
          }
        }
      } else {
        while (this.attachedHistory.length > 0 && this.attachedHistory[this.attachedHistory.length - 1].altId > this.previousAltId) {
          this.attachedHistory.pop();
        }
      }
      this.previousAltId = currentAltId;
    }));
  }
  /**
   * Pushes an history item that is tied to the last text edit (or an extension of it).
   * When the last text edit is undone/redone, so is is this history item.
   */
  pushAttachedHistoryElement(element) {
    this.attachedHistory.push({ altId: this.model.getAlternativeVersionId(), element });
  }
}
export {
  MergeEditorViewModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFx2aWV3TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhXcml0YWJsZUNhY2hlLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yTGluZVJhbmdlIH0gZnJvbSAnLi4vbW9kZWwvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yTW9kZWwgfSBmcm9tICcuLi9tb2RlbC9tZXJnZUVkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IElucHV0TnVtYmVyLCBNb2RpZmllZEJhc2VSYW5nZSwgTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSB9IGZyb20gJy4uL21vZGVsL21vZGlmaWVkQmFzZVJhbmdlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb25maWdWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL29ic2VydmFibGUvY29tbW9uL3BsYXRmb3JtT2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IEJhc2VDb2RlRWRpdG9yVmlldyB9IGZyb20gJy4vZWRpdG9ycy9iYXNlQ29kZUVkaXRvclZpZXcuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclZpZXcgfSBmcm9tICcuL2VkaXRvcnMvY29kZUVkaXRvclZpZXcuanMnO1xuaW1wb3J0IHsgSW5wdXRDb2RlRWRpdG9yVmlldyB9IGZyb20gJy4vZWRpdG9ycy9pbnB1dENvZGVFZGl0b3JWaWV3LmpzJztcbmltcG9ydCB7IFJlc3VsdENvZGVFZGl0b3JWaWV3IH0gZnJvbSAnLi9lZGl0b3JzL3Jlc3VsdENvZGVFZGl0b3JWaWV3LmpzJztcblxuZXhwb3J0IGNsYXNzIE1lcmdlRWRpdG9yVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWFudWFsbHlTZXRBY3RpdmVNb2RpZmllZEJhc2VSYW5nZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGF0dGFjaGVkSGlzdG9yeTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWw6IE1lcmdlRWRpdG9yTW9kZWwsXG5cdFx0cHVibGljIHJlYWRvbmx5IGlucHV0Q29kZUVkaXRvclZpZXcxOiBJbnB1dENvZGVFZGl0b3JWaWV3LFxuXHRcdHB1YmxpYyByZWFkb25seSBpbnB1dENvZGVFZGl0b3JWaWV3MjogSW5wdXRDb2RlRWRpdG9yVmlldyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVzdWx0Q29kZUVkaXRvclZpZXc6IFJlc3VsdENvZGVFZGl0b3JWaWV3LFxuXHRcdHB1YmxpYyByZWFkb25seSBiYXNlQ29kZUVkaXRvclZpZXc6IElPYnNlcnZhYmxlPEJhc2VDb2RlRWRpdG9yVmlldyB8IHVuZGVmaW5lZD4sXG5cdFx0cHVibGljIHJlYWRvbmx5IHNob3dOb25Db25mbGljdGluZ0NoYW5nZXM6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubWFudWFsbHlTZXRBY3RpdmVNb2RpZmllZEJhc2VSYW5nZSA9IG9ic2VydmFibGVWYWx1ZTxcblx0XHRcdHsgcmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlIHwgdW5kZWZpbmVkOyBjb3VudGVyOiBudW1iZXIgfVxuXHRcdD4odGhpcywgeyByYW5nZTogdW5kZWZpbmVkLCBjb3VudGVyOiAwIH0pO1xuXHRcdHRoaXMuYXR0YWNoZWRIaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEF0dGFjaGVkSGlzdG9yeSh0aGlzLm1vZGVsLnJlc3VsdFRleHRNb2RlbCkpO1xuXHRcdHRoaXMuc2hvdWxkVXNlQXBwZW5kSW5zdGVhZE9mQWNjZXB0ID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPGJvb2xlYW4+KFxuXHRcdFx0J21lcmdlRWRpdG9yLnNob3VsZFVzZUFwcGVuZEluc3RlYWRPZkFjY2VwdCcsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0KTtcblx0XHR0aGlzLmNvdW50ZXIgPSAwO1xuXHRcdHRoaXMubGFzdEZvY3VzZWRFZGl0b3IgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhXcml0YWJsZUNhY2hlPFxuXHRcdFx0eyB2aWV3OiBDb2RlRWRpdG9yVmlldyB8IHVuZGVmaW5lZDsgY291bnRlcjogbnVtYmVyIH1cblx0XHQ+KHRoaXMsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0Y29uc3QgZWRpdG9ycyA9IFtcblx0XHRcdFx0dGhpcy5pbnB1dENvZGVFZGl0b3JWaWV3MSxcblx0XHRcdFx0dGhpcy5pbnB1dENvZGVFZGl0b3JWaWV3Mixcblx0XHRcdFx0dGhpcy5yZXN1bHRDb2RlRWRpdG9yVmlldyxcblx0XHRcdFx0dGhpcy5iYXNlQ29kZUVkaXRvclZpZXcucmVhZChyZWFkZXIpLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHZpZXcgPSBlZGl0b3JzLmZpbmQoKGUpID0+IGUgJiYgZS5pc0ZvY3VzZWQucmVhZChyZWFkZXIpKTtcblx0XHRcdHJldHVybiB2aWV3ID8geyB2aWV3LCBjb3VudGVyOiB0aGlzLmNvdW50ZXIrKyB9IDogbGFzdFZhbHVlIHx8IHsgdmlldzogdW5kZWZpbmVkLCBjb3VudGVyOiB0aGlzLmNvdW50ZXIrKyB9O1xuXHRcdH0pO1xuXHRcdHRoaXMuYmFzZVNob3dEaWZmQWdhaW5zdCA9IGRlcml2ZWQ8MSB8IDIgfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsYXN0Rm9jdXNlZEVkaXRvciA9IHRoaXMubGFzdEZvY3VzZWRFZGl0b3IucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGxhc3RGb2N1c2VkRWRpdG9yLnZpZXcgPT09IHRoaXMuaW5wdXRDb2RlRWRpdG9yVmlldzEpIHtcblx0XHRcdFx0cmV0dXJuIDE7XG5cdFx0XHR9IGVsc2UgaWYgKGxhc3RGb2N1c2VkRWRpdG9yLnZpZXcgPT09IHRoaXMuaW5wdXRDb2RlRWRpdG9yVmlldzIpIHtcblx0XHRcdFx0cmV0dXJuIDI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdHRoaXMuZm9jdXNlZEVkaXRvclR5cGUgPSBkZXJpdmVkPE1lcmdlRWRpdG9yVHlwZSB8IHVuZGVmaW5lZD4odGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxhc3RGb2N1c2VkRWRpdG9yID0gdGhpcy5sYXN0Rm9jdXNlZEVkaXRvci5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGlmICghbGFzdEZvY3VzZWRFZGl0b3Iudmlldykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobGFzdEZvY3VzZWRFZGl0b3IudmlldyA9PT0gdGhpcy5pbnB1dENvZGVFZGl0b3JWaWV3MSkge1xuXHRcdFx0XHRyZXR1cm4gJ2lucHV0MSc7XG5cdFx0XHR9IGVsc2UgaWYgKGxhc3RGb2N1c2VkRWRpdG9yLnZpZXcgPT09IHRoaXMuaW5wdXRDb2RlRWRpdG9yVmlldzIpIHtcblx0XHRcdFx0cmV0dXJuICdpbnB1dDInO1xuXHRcdFx0fSBlbHNlIGlmIChsYXN0Rm9jdXNlZEVkaXRvci52aWV3ID09PSB0aGlzLnJlc3VsdENvZGVFZGl0b3JWaWV3KSB7XG5cdFx0XHRcdHJldHVybiAncmVzdWx0Jztcblx0XHRcdH0gZWxzZSBpZiAobGFzdEZvY3VzZWRFZGl0b3IudmlldyA9PT0gdGhpcy5iYXNlQ29kZUVkaXRvclZpZXcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiAnYmFzZSc7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5zZWxlY3Rpb25JbkJhc2UgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2VFZGl0b3IgPSB0aGlzLmxhc3RGb2N1c2VkRWRpdG9yLnJlYWQocmVhZGVyKS52aWV3O1xuXHRcdFx0aWYgKCFzb3VyY2VFZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBzb3VyY2VFZGl0b3Iuc2VsZWN0aW9uLnJlYWQocmVhZGVyKSB8fCBbXTtcblxuXHRcdFx0Y29uc3QgcmFuZ2VzSW5CYXNlID0gc2VsZWN0aW9ucy5tYXAoKHNlbGVjdGlvbikgPT4ge1xuXHRcdFx0XHRpZiAoc291cmNlRWRpdG9yID09PSB0aGlzLmlucHV0Q29kZUVkaXRvclZpZXcxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZWwudHJhbnNsYXRlSW5wdXRSYW5nZVRvQmFzZSgxLCBzZWxlY3Rpb24pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNvdXJjZUVkaXRvciA9PT0gdGhpcy5pbnB1dENvZGVFZGl0b3JWaWV3Mikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsLnRyYW5zbGF0ZUlucHV0UmFuZ2VUb0Jhc2UoMiwgc2VsZWN0aW9uKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzb3VyY2VFZGl0b3IgPT09IHRoaXMucmVzdWx0Q29kZUVkaXRvclZpZXcpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC50cmFuc2xhdGVSZXN1bHRSYW5nZVRvQmFzZShzZWxlY3Rpb24pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHNvdXJjZUVkaXRvciA9PT0gdGhpcy5iYXNlQ29kZUVkaXRvclZpZXcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNlbGVjdGlvbjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2VzSW5CYXNlLFxuXHRcdFx0XHRzb3VyY2VFZGl0b3Jcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5hY3RpdmVNb2RpZmllZEJhc2VSYW5nZSA9IGRlcml2ZWQodGhpcyxcblx0XHRcdChyZWFkZXIpID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSAqL1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkRWRpdG9yID0gdGhpcy5sYXN0Rm9jdXNlZEVkaXRvci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IG1hbnVhbFJhbmdlID0gdGhpcy5tYW51YWxseVNldEFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKG1hbnVhbFJhbmdlLmNvdW50ZXIgPiBmb2N1c2VkRWRpdG9yLmNvdW50ZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gbWFudWFsUmFuZ2UucmFuZ2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWZvY3VzZWRFZGl0b3Iudmlldykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjdXJzb3JMaW5lTnVtYmVyID0gZm9jdXNlZEVkaXRvci52aWV3LmN1cnNvckxpbmVOdW1iZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWN1cnNvckxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRCYXNlUmFuZ2VzID0gdGhpcy5tb2RlbC5tb2RpZmllZEJhc2VSYW5nZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRCYXNlUmFuZ2VzLmZpbmQoKHIpID0+IHtcblx0XHRcdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuZ2V0UmFuZ2VPZk1vZGlmaWVkQmFzZVJhbmdlKGZvY3VzZWRFZGl0b3IudmlldyEsIHIsIHJlYWRlcik7XG5cdFx0XHRcdFx0cmV0dXJuIHJhbmdlLmlzRW1wdHlcblx0XHRcdFx0XHRcdD8gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBjdXJzb3JMaW5lTnVtYmVyXG5cdFx0XHRcdFx0XHQ6IHJhbmdlLmNvbnRhaW5zKGN1cnNvckxpbmVOdW1iZXIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzdWx0Q29kZUVkaXRvclZpZXcuZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMubW9kZWwuaXNBcHBseWluZ0VkaXRJblJlc3VsdCB8fCBlLmlzUmVkb2luZyB8fCBlLmlzVW5kb2luZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGJhc2VSYW5nZVN0YXRlczogTW9kaWZpZWRCYXNlUmFuZ2VbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBlLmNoYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgcmFuZ2VJbkJhc2UgPSB0aGlzLm1vZGVsLnRyYW5zbGF0ZVJlc3VsdFJhbmdlVG9CYXNlKFJhbmdlLmxpZnQoY2hhbmdlLnJhbmdlKSk7XG5cdFx0XHRcdGNvbnN0IGJhc2VSYW5nZXMgPSB0aGlzLm1vZGVsLmZpbmRNb2RpZmllZEJhc2VSYW5nZXNJblJhbmdlKE1lcmdlRWRpdG9yTGluZVJhbmdlLmZyb21MZW5ndGgocmFuZ2VJbkJhc2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZUluQmFzZS5lbmRMaW5lTnVtYmVyIC0gcmFuZ2VJbkJhc2Uuc3RhcnRMaW5lTnVtYmVyKSk7XG5cdFx0XHRcdGlmIChiYXNlUmFuZ2VzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IGlzSGFuZGxlZCA9IHRoaXMubW9kZWwuaXNIYW5kbGVkKGJhc2VSYW5nZXNbMF0pLmdldCgpO1xuXHRcdFx0XHRcdGlmICghaXNIYW5kbGVkKSB7XG5cdFx0XHRcdFx0XHRiYXNlUmFuZ2VTdGF0ZXMucHVzaChiYXNlUmFuZ2VzWzBdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGJhc2VSYW5nZVN0YXRlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbGVtZW50ID0ge1xuXHRcdFx0XHRtb2RlbDogdGhpcy5tb2RlbCxcblx0XHRcdFx0cmVkbygpIHtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIE1hcmsgY29uZmxpY3RzIHRvdWNoZWQgYnkgbWFudWFsIGVkaXRzIGFzIGhhbmRsZWQgKi9cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiBiYXNlUmFuZ2VTdGF0ZXMpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5tb2RlbC5zZXRIYW5kbGVkKHIsIHRydWUsIHR4KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0dW5kbygpIHtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIE1hcmsgY29uZmxpY3RzIHRvdWNoZWQgYnkgbWFudWFsIGVkaXRzIGFzIGhhbmRsZWQgKi9cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgciBvZiBiYXNlUmFuZ2VTdGF0ZXMpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5tb2RlbC5zZXRIYW5kbGVkKHIsIGZhbHNlLCB0eCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5hdHRhY2hlZEhpc3RvcnkucHVzaEF0dGFjaGVkSGlzdG9yeUVsZW1lbnQoZWxlbWVudCk7XG5cdFx0XHRlbGVtZW50LnJlZG8oKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgc2hvdWxkVXNlQXBwZW5kSW5zdGVhZE9mQWNjZXB0O1xuXG5cdHByaXZhdGUgY291bnRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBsYXN0Rm9jdXNlZEVkaXRvcjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgYmFzZVNob3dEaWZmQWdhaW5zdDtcblxuXHQvKipcblx0ICogUmV0dXJucyBhbiBvYnNlcnZhYmxlIHRoYXQgdHJhY2tzIHdoaWNoIGVkaXRvciB0eXBlIGlzIGN1cnJlbnRseSBmb2N1c2VkXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgZm9jdXNlZEVkaXRvclR5cGU7XG5cblx0cHVibGljIHJlYWRvbmx5IHNlbGVjdGlvbkluQmFzZTtcblxuXHRwcml2YXRlIGdldFJhbmdlT2ZNb2RpZmllZEJhc2VSYW5nZShlZGl0b3I6IENvZGVFZGl0b3JWaWV3LCBtb2RpZmllZEJhc2VSYW5nZTogTW9kaWZpZWRCYXNlUmFuZ2UsIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IE1lcmdlRWRpdG9yTGluZVJhbmdlIHtcblx0XHRpZiAoZWRpdG9yID09PSB0aGlzLnJlc3VsdENvZGVFZGl0b3JWaWV3KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXRMaW5lUmFuZ2VJblJlc3VsdChtb2RpZmllZEJhc2VSYW5nZS5iYXNlUmFuZ2UsIHJlYWRlcik7XG5cdFx0fSBlbHNlIGlmIChlZGl0b3IgPT09IHRoaXMuYmFzZUNvZGVFZGl0b3JWaWV3LmdldCgpKSB7XG5cdFx0XHRyZXR1cm4gbW9kaWZpZWRCYXNlUmFuZ2UuYmFzZVJhbmdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGVkaXRvciA9PT0gdGhpcy5pbnB1dENvZGVFZGl0b3JWaWV3MSA/IDEgOiAyO1xuXHRcdFx0cmV0dXJuIG1vZGlmaWVkQmFzZVJhbmdlLmdldElucHV0UmFuZ2UoaW5wdXQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZTtcblxuXHRwdWJsaWMgc2V0QWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UocmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlIHwgdW5kZWZpbmVkLCB0eDogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5tYW51YWxseVNldEFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlLnNldCh7IHJhbmdlLCBjb3VudGVyOiB0aGlzLmNvdW50ZXIrKyB9LCB0eCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U3RhdGUoXG5cdFx0YmFzZVJhbmdlOiBNb2RpZmllZEJhc2VSYW5nZSxcblx0XHRzdGF0ZTogTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZSxcblx0XHR0eDogSVRyYW5zYWN0aW9uLFxuXHRcdGlucHV0TnVtYmVyOiBJbnB1dE51bWJlcixcblx0KTogdm9pZCB7XG5cdFx0dGhpcy5tYW51YWxseVNldEFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlLnNldCh7IHJhbmdlOiBiYXNlUmFuZ2UsIGNvdW50ZXI6IHRoaXMuY291bnRlcisrIH0sIHR4KTtcblx0XHR0aGlzLm1vZGVsLnNldFN0YXRlKGJhc2VSYW5nZSwgc3RhdGUsIGlucHV0TnVtYmVyLCB0eCk7XG5cdFx0dGhpcy5sYXN0Rm9jdXNlZEVkaXRvci5jbGVhckNhY2hlKHR4KTtcblx0fVxuXG5cdHByaXZhdGUgZ29Ub0NvbmZsaWN0KGdldE1vZGlmaWVkQmFzZVJhbmdlOiAoZWRpdG9yOiBDb2RlRWRpdG9yVmlldywgY3VyTGluZU51bWJlcjogbnVtYmVyKSA9PiBNb2RpZmllZEJhc2VSYW5nZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGxldCBlZGl0b3IgPSB0aGlzLmxhc3RGb2N1c2VkRWRpdG9yLmdldCgpLnZpZXc7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdGVkaXRvciA9IHRoaXMucmVzdWx0Q29kZUVkaXRvclZpZXc7XG5cdFx0fVxuXHRcdGNvbnN0IGN1ckxpbmVOdW1iZXIgPSBlZGl0b3IuZWRpdG9yLmdldFBvc2l0aW9uKCk/LmxpbmVOdW1iZXI7XG5cdFx0aWYgKGN1ckxpbmVOdW1iZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RpZmllZEJhc2VSYW5nZSA9IGdldE1vZGlmaWVkQmFzZVJhbmdlKGVkaXRvciwgY3VyTGluZU51bWJlcik7XG5cdFx0aWYgKG1vZGlmaWVkQmFzZVJhbmdlKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuZ2V0UmFuZ2VPZk1vZGlmaWVkQmFzZVJhbmdlKGVkaXRvciwgbW9kaWZpZWRCYXNlUmFuZ2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRlZGl0b3IuZWRpdG9yLmZvY3VzKCk7XG5cblx0XHRcdGxldCBzdGFydExpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRsZXQgZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA9IHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7XG5cdFx0XHRpZiAocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gZWRpdG9yLmVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5zZXRBY3RpdmVNb2RpZmllZEJhc2VSYW5nZShtb2RpZmllZEJhc2VSYW5nZSwgdHgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlckV4Y2x1c2l2ZSA9IGVkaXRvci5lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvci5lZGl0b3Iuc2V0UG9zaXRpb24oe1xuXHRcdFx0XHRsaW5lTnVtYmVyOiBzdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdGNvbHVtbjogZWRpdG9yLmVkaXRvci5nZXRNb2RlbCgpIS5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHN0YXJ0TGluZU51bWJlciksXG5cdFx0XHR9KTtcblx0XHRcdGVkaXRvci5lZGl0b3IucmV2ZWFsTGluZXNOZWFyVG9wKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlckV4Y2x1c2l2ZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnb1RvTmV4dE1vZGlmaWVkQmFzZVJhbmdlKHByZWRpY2F0ZTogKG06IE1vZGlmaWVkQmFzZVJhbmdlKSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5nb1RvQ29uZmxpY3QoXG5cdFx0XHQoZSwgbCkgPT5cblx0XHRcdFx0dGhpcy5tb2RlbC5tb2RpZmllZEJhc2VSYW5nZXNcblx0XHRcdFx0XHQuZ2V0KClcblx0XHRcdFx0XHQuZmluZChcblx0XHRcdFx0XHRcdChyKSA9PlxuXHRcdFx0XHRcdFx0XHRwcmVkaWNhdGUocikgJiZcblx0XHRcdFx0XHRcdFx0dGhpcy5nZXRSYW5nZU9mTW9kaWZpZWRCYXNlUmFuZ2UoZSwgciwgdW5kZWZpbmVkKS5zdGFydExpbmVOdW1iZXIgPiBsXG5cdFx0XHRcdFx0KSB8fFxuXHRcdFx0XHR0aGlzLm1vZGVsLm1vZGlmaWVkQmFzZVJhbmdlc1xuXHRcdFx0XHRcdC5nZXQoKVxuXHRcdFx0XHRcdC5maW5kKChyKSA9PiBwcmVkaWNhdGUocikpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnb1RvUHJldmlvdXNNb2RpZmllZEJhc2VSYW5nZShwcmVkaWNhdGU6IChtOiBNb2RpZmllZEJhc2VSYW5nZSkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuZ29Ub0NvbmZsaWN0KFxuXHRcdFx0KGUsIGwpID0+XG5cdFx0XHRcdGZpbmRMYXN0KFxuXHRcdFx0XHRcdHRoaXMubW9kZWwubW9kaWZpZWRCYXNlUmFuZ2VzLmdldCgpLFxuXHRcdFx0XHRcdChyKSA9PlxuXHRcdFx0XHRcdFx0cHJlZGljYXRlKHIpICYmXG5cdFx0XHRcdFx0XHR0aGlzLmdldFJhbmdlT2ZNb2RpZmllZEJhc2VSYW5nZShlLCByLCB1bmRlZmluZWQpLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgPCBsXG5cdFx0XHRcdCkgfHxcblx0XHRcdFx0ZmluZExhc3QoXG5cdFx0XHRcdFx0dGhpcy5tb2RlbC5tb2RpZmllZEJhc2VSYW5nZXMuZ2V0KCksXG5cdFx0XHRcdFx0KHIpID0+IHByZWRpY2F0ZShyKVxuXHRcdFx0XHQpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB0b2dnbGVBY3RpdmVDb25mbGljdChpbnB1dE51bWJlcjogMSB8IDIpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSA9IHRoaXMuYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UuZ2V0KCk7XG5cdFx0aWYgKCFhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdub0NvbmZsaWN0TWVzc2FnZScsIFwiVGhlcmUgaXMgY3VycmVudGx5IG5vIGNvbmZsaWN0IGZvY3VzZWQgdGhhdCBjYW4gYmUgdG9nZ2xlZC5cIikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFRvZ2dsZSBBY3RpdmUgQ29uZmxpY3QgKi9cblx0XHRcdHRoaXMuc2V0U3RhdGUoXG5cdFx0XHRcdGFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlLFxuXHRcdFx0XHR0aGlzLm1vZGVsLmdldFN0YXRlKGFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlKS5nZXQoKS50b2dnbGUoaW5wdXROdW1iZXIpLFxuXHRcdFx0XHR0eCxcblx0XHRcdFx0aW5wdXROdW1iZXIsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdEFsbChpbnB1dE51bWJlcjogMSB8IDIpOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFRvZ2dsZSBBY3RpdmUgQ29uZmxpY3QgKi9cblx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgdGhpcy5tb2RlbC5tb2RpZmllZEJhc2VSYW5nZXMuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5zZXRTdGF0ZShcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHR0aGlzLm1vZGVsLmdldFN0YXRlKHJhbmdlKS5nZXQoKS53aXRoSW5wdXRWYWx1ZShpbnB1dE51bWJlciwgdHJ1ZSksXG5cdFx0XHRcdFx0dHgsXG5cdFx0XHRcdFx0aW5wdXROdW1iZXJcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBBdHRhY2hlZEhpc3RvcnkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBhdHRhY2hlZEhpc3Rvcnk6IHsgZWxlbWVudDogSUF0dGFjaGVkSGlzdG9yeUVsZW1lbnQ7IGFsdElkOiBudW1iZXIgfVtdO1xuXHRwcml2YXRlIHByZXZpb3VzQWx0SWQ6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmF0dGFjaGVkSGlzdG9yeSA9IFtdO1xuXHRcdHRoaXMucHJldmlvdXNBbHRJZCA9IHRoaXMubW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEFsdElkID0gbW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTtcblxuXHRcdFx0aWYgKGUuaXNSZWRvaW5nKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLmF0dGFjaGVkSGlzdG9yeSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLnByZXZpb3VzQWx0SWQgPCBpdGVtLmFsdElkICYmIGl0ZW0uYWx0SWQgPD0gY3VycmVudEFsdElkKSB7XG5cdFx0XHRcdFx0XHRpdGVtLmVsZW1lbnQucmVkbygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChlLmlzVW5kb2luZykge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gdGhpcy5hdHRhY2hlZEhpc3RvcnkubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gdGhpcy5hdHRhY2hlZEhpc3RvcnlbaV07XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRBbHRJZCA8IGl0ZW0uYWx0SWQgJiYgaXRlbS5hbHRJZCA8PSB0aGlzLnByZXZpb3VzQWx0SWQpIHtcblx0XHRcdFx0XHRcdGl0ZW0uZWxlbWVudC51bmRvKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFRoZSB1c2VyIGRlc3Ryb3llZCB0aGUgcmVkbyBzdGFjayBieSBwZXJmb3JtaW5nIGEgbm9uIHJlZG8vdW5kbyBvcGVyYXRpb24uXG5cdFx0XHRcdC8vIFRodXMgd2UgYWxzbyBuZWVkIHRvIHJlbW92ZSBhbGwgaGlzdG9yeSBlbGVtZW50cyBhZnRlciB0aGUgbGFzdCB2ZXJzaW9uIGlkLlxuXHRcdFx0XHR3aGlsZSAoXG5cdFx0XHRcdFx0dGhpcy5hdHRhY2hlZEhpc3RvcnkubGVuZ3RoID4gMFxuXHRcdFx0XHRcdCYmIHRoaXMuYXR0YWNoZWRIaXN0b3J5W3RoaXMuYXR0YWNoZWRIaXN0b3J5Lmxlbmd0aCAtIDFdIS5hbHRJZCA+IHRoaXMucHJldmlvdXNBbHRJZFxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHR0aGlzLmF0dGFjaGVkSGlzdG9yeS5wb3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnByZXZpb3VzQWx0SWQgPSBjdXJyZW50QWx0SWQ7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFB1c2hlcyBhbiBoaXN0b3J5IGl0ZW0gdGhhdCBpcyB0aWVkIHRvIHRoZSBsYXN0IHRleHQgZWRpdCAob3IgYW4gZXh0ZW5zaW9uIG9mIGl0KS5cblx0ICogV2hlbiB0aGUgbGFzdCB0ZXh0IGVkaXQgaXMgdW5kb25lL3JlZG9uZSwgc28gaXMgaXMgdGhpcyBoaXN0b3J5IGl0ZW0uXG5cdCAqL1xuXHRwdWJsaWMgcHVzaEF0dGFjaGVkSGlzdG9yeUVsZW1lbnQoZWxlbWVudDogSUF0dGFjaGVkSGlzdG9yeUVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmF0dGFjaGVkSGlzdG9yeS5wdXNoKHsgYWx0SWQ6IHRoaXMubW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKSwgZWxlbWVudCB9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUF0dGFjaGVkSGlzdG9yeUVsZW1lbnQge1xuXHR1bmRvKCk6IHZvaWQ7XG5cdHJlZG8oKTogdm9pZDtcbn1cblxuZXhwb3J0IHR5cGUgTWVyZ2VFZGl0b3JUeXBlID0gJ2lucHV0MScgfCAnaW5wdXQyJyB8ICdyZXN1bHQnIHwgJ2Jhc2UnO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsb0NBQXdFLGlCQUFpQixtQkFBbUI7QUFDOUgsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsNkJBQTZCO0FBTS9CLElBQU0sdUJBQU4sY0FBbUMsV0FBVztBQUFBLEVBS3BELFlBQ2lCLE9BQ0Esc0JBQ0Esc0JB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
