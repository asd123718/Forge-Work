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
import { addDisposableListener, EventType, h, reset } from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Toggle } from "../../../../../../base/browser/ui/toggle/toggle.js";
import { Action, Separator } from "../../../../../../base/common/actions.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { clamp } from "../../../../../../base/common/numbers.js";
import { autorun, autorunOpts, derived, derivedOpts, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { noBreakWhitespace } from "../../../../../../base/common/strings.js";
import { isDefined } from "../../../../../../base/common/types.js";
import { MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { localize } from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { defaultToggleStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { InputState } from "../../model/modifiedBaseRange.js";
import { applyObservableDecorations, setFields } from "../../utils.js";
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from "../colors.js";
import { EditorGutter } from "../editorGutter.js";
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from "./codeEditorView.js";
let InputCodeEditorView = class extends CodeEditorView {
  constructor(inputNumber, viewModel, instantiationService, contextMenuService, configurationService) {
    super(instantiationService, viewModel, configurationService);
    this.inputNumber = inputNumber;
    this.otherInputNumber = this.inputNumber === 1 ? 2 : 1;
    this.modifiedBaseRangeGutterItemInfos = derivedOpts({ debugName: `input${this.inputNumber}.modifiedBaseRangeGutterItemInfos` }, (reader) => {
      const viewModel2 = this.viewModel.read(reader);
      if (!viewModel2) {
        return [];
      }
      const model = viewModel2.model;
      const inputNumber2 = this.inputNumber;
      const showNonConflictingChanges = viewModel2.showNonConflictingChanges.read(reader);
      return model.modifiedBaseRanges.read(reader).filter((r) => r.getInputDiffs(this.inputNumber).length > 0 && (showNonConflictingChanges || r.isConflicting || !model.isHandled(r).read(reader))).map((baseRange, idx) => new ModifiedBaseRangeGutterItemModel(idx.toString(), baseRange, inputNumber2, viewModel2));
    });
    this.decorations = derivedOpts({ debugName: `input${this.inputNumber}.decorations` }, (reader) => {
      const viewModel2 = this.viewModel.read(reader);
      if (!viewModel2) {
        return [];
      }
      const model = viewModel2.model;
      const textModel = (this.inputNumber === 1 ? model.input1 : model.input2).textModel;
      const activeModifiedBaseRange = viewModel2.activeModifiedBaseRange.read(reader);
      const result = new Array();
      const showNonConflictingChanges = viewModel2.showNonConflictingChanges.read(reader);
      const showDeletionMarkers = this.showDeletionMarkers.read(reader);
      const diffWithThis = viewModel2.baseCodeEditorView.read(reader) !== void 0 && viewModel2.baseShowDiffAgainst.read(reader) === this.inputNumber;
      const useSimplifiedDecorations = !diffWithThis && this.useSimplifiedDecorations.read(reader);
      for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {
        const range = modifiedBaseRange.getInputRange(this.inputNumber);
        if (!range) {
          continue;
        }
        const blockClassNames = ["merge-editor-block"];
        let blockPadding = [0, 0, 0, 0];
        const isHandled = model.isInputHandled(modifiedBaseRange, this.inputNumber).read(reader);
        if (isHandled) {
          blockClassNames.push("handled");
        }
        if (modifiedBaseRange === activeModifiedBaseRange) {
          blockClassNames.push("focused");
          blockPadding = [0, 2, 0, 2];
        }
        if (modifiedBaseRange.isConflicting) {
          blockClassNames.push("conflicting");
        }
        const inputClassName = this.inputNumber === 1 ? "input i1" : "input i2";
        blockClassNames.push(inputClassName);
        if (!modifiedBaseRange.isConflicting && !showNonConflictingChanges && isHandled) {
          continue;
        }
        if (useSimplifiedDecorations && !isHandled) {
          blockClassNames.push("use-simplified-decorations");
        }
        result.push({
          range: range.toInclusiveRangeOrEmpty(),
          options: {
            showIfCollapsed: true,
            blockClassName: blockClassNames.join(" "),
            blockPadding,
            blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
            description: "Merge Editor",
            minimap: {
              position: MinimapPosition.Gutter,
              color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor }
            },
            overviewRuler: modifiedBaseRange.isConflicting ? {
              position: OverviewRulerLane.Center,
              color: { id: isHandled ? handledConflictMinimapOverViewRulerColor : unhandledConflictMinimapOverViewRulerColor }
            } : void 0
          }
        });
        if (!useSimplifiedDecorations && (modifiedBaseRange.isConflicting || !model.isHandled(modifiedBaseRange).read(reader))) {
          const inputDiffs = modifiedBaseRange.getInputDiffs(this.inputNumber);
          for (const diff of inputDiffs) {
            const range2 = diff.outputRange.toInclusiveRange();
            if (range2) {
              result.push({
                range: range2,
                options: {
                  className: `merge-editor-diff ${inputClassName}`,
                  description: "Merge Editor",
                  isWholeLine: true
                }
              });
            }
            if (diff.rangeMappings) {
              for (const d of diff.rangeMappings) {
                if (showDeletionMarkers || !d.outputRange.isEmpty()) {
                  result.push({
                    range: d.outputRange,
                    options: {
                      className: d.outputRange.isEmpty() ? `merge-editor-diff-empty-word ${inputClassName}` : `merge-editor-diff-word ${inputClassName}`,
                      description: "Merge Editor",
                      showIfCollapsed: true
                    }
                  });
                }
              }
            }
          }
        }
      }
      return result;
    });
    this.htmlElements.root.classList.add(`input`);
    this._register(
      new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
        getIntersectingGutterItems: (range, reader) => {
          if (this.checkboxesVisible.read(reader)) {
            return this.modifiedBaseRangeGutterItemInfos.read(reader);
          } else {
            return [];
          }
        },
        createView: (item, target) => new MergeConflictGutterItemView(item, target, contextMenuService)
      })
    );
    this._register(
      createSelectionsAutorun(
        this,
        (baseRange, viewModel2) => viewModel2.model.translateBaseRangeToInput(this.inputNumber, baseRange)
      )
    );
    this._register(
      instantiationService.createInstance(
        TitleMenu,
        inputNumber === 1 ? MenuId.MergeInput1Toolbar : MenuId.MergeInput2Toolbar,
        this.htmlElements.toolbar
      )
    );
    this._register(autorunOpts({ debugName: `input${this.inputNumber}: update labels & text model` }, (reader) => {
      const vm = this.viewModel.read(reader);
      if (!vm) {
        return;
      }
      this.editor.setModel(this.inputNumber === 1 ? vm.model.input1.textModel : vm.model.input2.textModel);
      const title = this.inputNumber === 1 ? vm.model.input1.title || localize("input1", "Input 1") : vm.model.input2.title || localize("input2", "Input 2");
      const description = this.inputNumber === 1 ? vm.model.input1.description : vm.model.input2.description;
      const detail = this.inputNumber === 1 ? vm.model.input1.detail : vm.model.input2.detail;
      reset(this.htmlElements.title, ...renderLabelWithIcons(title));
      reset(this.htmlElements.description, ...description ? renderLabelWithIcons(description) : []);
      reset(this.htmlElements.detail, ...detail ? renderLabelWithIcons(detail) : []);
    }));
    this._register(applyObservableDecorations(this.editor, this.decorations));
  }
};
InputCodeEditorView = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService)
], InputCodeEditorView);
class ModifiedBaseRangeGutterItemModel {
  constructor(id, baseRange, inputNumber, viewModel) {
    this.id = id;
    this.baseRange = baseRange;
    this.inputNumber = inputNumber;
    this.viewModel = viewModel;
    this.model = this.viewModel.model;
    this.range = this.baseRange.getInputRange(this.inputNumber);
    this.enabled = this.model.isUpToDate;
    this.toggleState = derived(this, (reader) => {
      const input = this.model.getState(this.baseRange).read(reader).getInput(this.inputNumber);
      return input === InputState.second && !this.baseRange.isOrderRelevant ? InputState.first : input;
    });
    this.state = derived(this, (reader) => {
      const active = this.viewModel.activeModifiedBaseRange.read(reader);
      if (!this.model.hasBaseRange(this.baseRange)) {
        return { handled: false, focused: false };
      }
      return {
        handled: this.model.isHandled(this.baseRange).read(reader),
        focused: this.baseRange === active
      };
    });
  }
  setState(value, tx) {
    this.viewModel.setState(
      this.baseRange,
      this.model.getState(this.baseRange).get().withInputValue(this.inputNumber, value),
      tx,
      this.inputNumber
    );
  }
  toggleBothSides() {
    transaction((tx) => {
      const state = this.model.getState(this.baseRange).get();
      this.model.setState(
        this.baseRange,
        state.toggle(this.inputNumber).toggle(this.inputNumber === 1 ? 2 : 1),
        true,
        tx
      );
    });
  }
  getContextMenuActions() {
    const state = this.model.getState(this.baseRange).get();
    const handled = this.model.isHandled(this.baseRange).get();
    const update = (newState) => {
      transaction((tx) => {
        return this.viewModel.setState(this.baseRange, newState, tx, this.inputNumber);
      });
    };
    function action(id, label, targetState, checked) {
      const action2 = new Action(id, label, void 0, true, () => {
        update(targetState);
      });
      action2.checked = checked;
      return action2;
    }
    const both = state.includesInput1 && state.includesInput2;
    return [
      this.baseRange.input1Diffs.length > 0 ? action(
        "mergeEditor.acceptInput1",
        localize("mergeEditor.accept", "Accept {0}", this.model.input1.title),
        state.toggle(1),
        state.includesInput1
      ) : void 0,
      this.baseRange.input2Diffs.length > 0 ? action(
        "mergeEditor.acceptInput2",
        localize("mergeEditor.accept", "Accept {0}", this.model.input2.title),
        state.toggle(2),
        state.includesInput2
      ) : void 0,
      this.baseRange.isConflicting ? setFields(
        action(
          "mergeEditor.acceptBoth",
          localize(
            "mergeEditor.acceptBoth",
            "Accept Both"
          ),
          state.withInputValue(1, !both).withInputValue(2, !both),
          both
        ),
        { enabled: this.baseRange.canBeCombined }
      ) : void 0,
      new Separator(),
      this.baseRange.isConflicting ? setFields(
        action(
          "mergeEditor.swap",
          localize("mergeEditor.swap", "Swap"),
          state.swap(),
          false
        ),
        { enabled: !state.kind && (!both || this.baseRange.isOrderRelevant) }
      ) : void 0,
      setFields(
        new Action(
          "mergeEditor.markAsHandled",
          localize("mergeEditor.markAsHandled", "Mark as Handled"),
          void 0,
          true,
          () => {
            transaction((tx) => {
              this.model.setHandled(this.baseRange, !handled, tx);
            });
          }
        ),
        { checked: handled }
      )
    ].filter(isDefined);
  }
}
class MergeConflictGutterItemView extends Disposable {
  constructor(item, target, contextMenuService) {
    super();
    this.isMultiLine = observableValue(this, false);
    this.item = observableValue(this, item);
    const checkBox = new Toggle({
      isChecked: false,
      title: "",
      icon: Codicon.check,
      ...defaultToggleStyles
    });
    checkBox.domNode.classList.add("accept-conflict-group");
    this._register(
      addDisposableListener(checkBox.domNode, EventType.MOUSE_DOWN, (e) => {
        const item2 = this.item.get();
        if (!item2) {
          return;
        }
        if (e.button === /* Right */
        2) {
          e.stopPropagation();
          e.preventDefault();
          contextMenuService.showContextMenu({
            getAnchor: () => checkBox.domNode,
            getActions: () => item2.getContextMenuActions()
          });
        } else if (e.button === /* Middle */
        1) {
          e.stopPropagation();
          e.preventDefault();
          item2.toggleBothSides();
        }
      })
    );
    this._register(
      autorun((reader) => {
        const item2 = this.item.read(reader);
        const value = item2.toggleState.read(reader);
        const iconMap = {
          [InputState.excluded]: { icon: void 0, checked: false, title: localize("accept.excluded", "Accept") },
          [InputState.unrecognized]: { icon: Codicon.circleFilled, checked: false, title: localize("accept.conflicting", "Accept (result is dirty)") },
          [InputState.first]: { icon: Codicon.check, checked: true, title: localize("accept.first", "Undo accept") },
          [InputState.second]: { icon: Codicon.checkAll, checked: true, title: localize("accept.second", "Undo accept (currently second)") }
        };
        const state = iconMap[value];
        checkBox.setIcon(state.icon);
        checkBox.checked = state.checked;
        checkBox.setTitle(state.title);
        if (!item2.enabled.read(reader)) {
          checkBox.disable();
        } else {
          checkBox.enable();
        }
      })
    );
    this._register(autorun((reader) => {
      const state = this.item.read(reader).state.read(reader);
      const classNames = [
        "merge-accept-gutter-marker",
        state.handled && "handled",
        state.focused && "focused",
        this.isMultiLine.read(reader) ? "multi-line" : "single-line"
      ];
      target.className = classNames.filter((c) => typeof c === "string").join(" ");
    }));
    this._register(checkBox.onChange(() => {
      transaction((tx) => {
        this.item.get().setState(checkBox.checked, tx);
      });
    }));
    target.appendChild(h("div.background", [noBreakWhitespace]).root);
    target.appendChild(
      this.checkboxDiv = h("div.checkbox", [h("div.checkbox-background", [checkBox.domNode])]).root
    );
  }
  layout(top, height, viewTop, viewHeight) {
    const checkboxHeight = this.checkboxDiv.clientHeight;
    const middleHeight = height / 2 - checkboxHeight / 2;
    const margin = checkboxHeight;
    let effectiveCheckboxTop = top + middleHeight;
    const preferredViewPortRange = [
      margin,
      viewTop + viewHeight - margin - checkboxHeight
    ];
    const preferredParentRange = [
      top + margin,
      top + height - checkboxHeight - margin
    ];
    if (preferredParentRange[0] < preferredParentRange[1]) {
      effectiveCheckboxTop = clamp(effectiveCheckboxTop, preferredViewPortRange[0], preferredViewPortRange[1]);
      effectiveCheckboxTop = clamp(effectiveCheckboxTop, preferredParentRange[0], preferredParentRange[1]);
    }
    this.checkboxDiv.style.top = `${effectiveCheckboxTop - top}px`;
    transaction((tx) => {
      this.isMultiLine.set(height > 30, tx);
    });
  }
  update(baseRange) {
    transaction((tx) => {
      this.item.set(baseRange, tx);
    });
  }
}
export {
  InputCodeEditorView,
  MergeConflictGutterItemView,
  ModifiedBaseRangeGutterItemModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFxlZGl0b3JzXFxpbnB1dENvZGVFZGl0b3JWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGgsIHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBUb2dnbGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGF1dG9ydW5PcHRzLCBkZXJpdmVkLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIElUcmFuc2FjdGlvbiwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbm9CcmVha1doaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIE1pbmltYXBQb3NpdGlvbiwgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGRlZmF1bHRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSW5wdXRTdGF0ZSwgTW9kaWZpZWRCYXNlUmFuZ2UsIE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUgfSBmcm9tICcuLi8uLi9tb2RlbC9tb2RpZmllZEJhc2VSYW5nZS5qcyc7XG5pbXBvcnQgeyBhcHBseU9ic2VydmFibGVEZWNvcmF0aW9ucywgc2V0RmllbGRzIH0gZnJvbSAnLi4vLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciwgdW5oYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIH0gZnJvbSAnLi4vY29sb3JzLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi4vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRvckd1dHRlciwgSUd1dHRlckl0ZW1JbmZvLCBJR3V0dGVySXRlbVZpZXcgfSBmcm9tICcuLi9lZGl0b3JHdXR0ZXIuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvclZpZXcsIGNyZWF0ZVNlbGVjdGlvbnNBdXRvcnVuLCBUaXRsZU1lbnUgfSBmcm9tICcuL2NvZGVFZGl0b3JWaWV3LmpzJztcblxuZXhwb3J0IGNsYXNzIElucHV0Q29kZUVkaXRvclZpZXcgZXh0ZW5kcyBDb2RlRWRpdG9yVmlldyB7XG5cdHB1YmxpYyByZWFkb25seSBvdGhlcklucHV0TnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBpbnB1dE51bWJlcjogMSB8IDIsXG5cdFx0dmlld01vZGVsOiBJT2JzZXJ2YWJsZTxNZXJnZUVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB2aWV3TW9kZWwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLm90aGVySW5wdXROdW1iZXIgPSB0aGlzLmlucHV0TnVtYmVyID09PSAxID8gMiA6IDE7XG5cdFx0dGhpcy5tb2RpZmllZEJhc2VSYW5nZUd1dHRlckl0ZW1JbmZvcyA9IGRlcml2ZWRPcHRzKHsgZGVidWdOYW1lOiBgaW5wdXQke3RoaXMuaW5wdXROdW1iZXJ9Lm1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbUluZm9zYCB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy52aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF2aWV3TW9kZWwpIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRjb25zdCBtb2RlbCA9IHZpZXdNb2RlbC5tb2RlbDtcblx0XHRcdGNvbnN0IGlucHV0TnVtYmVyID0gdGhpcy5pbnB1dE51bWJlcjtcblxuXHRcdFx0Y29uc3Qgc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcyA9IHZpZXdNb2RlbC5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0cmV0dXJuIG1vZGVsLm1vZGlmaWVkQmFzZVJhbmdlcy5yZWFkKHJlYWRlcilcblx0XHRcdFx0LmZpbHRlcigocikgPT4gci5nZXRJbnB1dERpZmZzKHRoaXMuaW5wdXROdW1iZXIpLmxlbmd0aCA+IDAgJiYgKHNob3dOb25Db25mbGljdGluZ0NoYW5nZXMgfHwgci5pc0NvbmZsaWN0aW5nIHx8ICFtb2RlbC5pc0hhbmRsZWQocikucmVhZChyZWFkZXIpKSlcblx0XHRcdFx0Lm1hcCgoYmFzZVJhbmdlLCBpZHgpID0+IG5ldyBNb2RpZmllZEJhc2VSYW5nZUd1dHRlckl0ZW1Nb2RlbChpZHgudG9TdHJpbmcoKSwgYmFzZVJhbmdlLCBpbnB1dE51bWJlciwgdmlld01vZGVsKSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IGRlcml2ZWRPcHRzKHsgZGVidWdOYW1lOiBgaW5wdXQke3RoaXMuaW5wdXROdW1iZXJ9LmRlY29yYXRpb25zYCB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy52aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWwgPSB2aWV3TW9kZWwubW9kZWw7XG5cdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSAodGhpcy5pbnB1dE51bWJlciA9PT0gMSA/IG1vZGVsLmlucHV0MSA6IG1vZGVsLmlucHV0MikudGV4dE1vZGVsO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVNb2RpZmllZEJhc2VSYW5nZSA9IHZpZXdNb2RlbC5hY3RpdmVNb2RpZmllZEJhc2VSYW5nZS5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBBcnJheTxJTW9kZWxEZWx0YURlY29yYXRpb24+KCk7XG5cblx0XHRcdGNvbnN0IHNob3dOb25Db25mbGljdGluZ0NoYW5nZXMgPSB2aWV3TW9kZWwuc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzaG93RGVsZXRpb25NYXJrZXJzID0gdGhpcy5zaG93RGVsZXRpb25NYXJrZXJzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRpZmZXaXRoVGhpcyA9IHZpZXdNb2RlbC5iYXNlQ29kZUVkaXRvclZpZXcucmVhZChyZWFkZXIpICE9PSB1bmRlZmluZWQgJiYgdmlld01vZGVsLmJhc2VTaG93RGlmZkFnYWluc3QucmVhZChyZWFkZXIpID09PSB0aGlzLmlucHV0TnVtYmVyO1xuXHRcdFx0Y29uc3QgdXNlU2ltcGxpZmllZERlY29yYXRpb25zID0gIWRpZmZXaXRoVGhpcyAmJiB0aGlzLnVzZVNpbXBsaWZpZWREZWNvcmF0aW9ucy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGZvciAoY29uc3QgbW9kaWZpZWRCYXNlUmFuZ2Ugb2YgbW9kZWwubW9kaWZpZWRCYXNlUmFuZ2VzLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IG1vZGlmaWVkQmFzZVJhbmdlLmdldElucHV0UmFuZ2UodGhpcy5pbnB1dE51bWJlcik7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGJsb2NrQ2xhc3NOYW1lcyA9IFsnbWVyZ2UtZWRpdG9yLWJsb2NrJ107XG5cdFx0XHRcdGxldCBibG9ja1BhZGRpbmc6IFt0b3A6IG51bWJlciwgcmlnaHQ6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIGxlZnQ6IG51bWJlcl0gPSBbMCwgMCwgMCwgMF07XG5cdFx0XHRcdGNvbnN0IGlzSGFuZGxlZCA9IG1vZGVsLmlzSW5wdXRIYW5kbGVkKG1vZGlmaWVkQmFzZVJhbmdlLCB0aGlzLmlucHV0TnVtYmVyKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChpc0hhbmRsZWQpIHtcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnaGFuZGxlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RpZmllZEJhc2VSYW5nZSA9PT0gYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UpIHtcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnZm9jdXNlZCcpO1xuXHRcdFx0XHRcdGJsb2NrUGFkZGluZyA9IFswLCAyLCAwLCAyXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kaWZpZWRCYXNlUmFuZ2UuaXNDb25mbGljdGluZykge1xuXHRcdFx0XHRcdGJsb2NrQ2xhc3NOYW1lcy5wdXNoKCdjb25mbGljdGluZycpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGlucHV0Q2xhc3NOYW1lID0gdGhpcy5pbnB1dE51bWJlciA9PT0gMSA/ICdpbnB1dCBpMScgOiAnaW5wdXQgaTInO1xuXHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaChpbnB1dENsYXNzTmFtZSk7XG5cblx0XHRcdFx0aWYgKCFtb2RpZmllZEJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nICYmICFzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzICYmIGlzSGFuZGxlZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHVzZVNpbXBsaWZpZWREZWNvcmF0aW9ucyAmJiAhaXNIYW5kbGVkKSB7XG5cdFx0XHRcdFx0YmxvY2tDbGFzc05hbWVzLnB1c2goJ3VzZS1zaW1wbGlmaWVkLWRlY29yYXRpb25zJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0cmFuZ2U6IHJhbmdlLnRvSW5jbHVzaXZlUmFuZ2VPckVtcHR5KCksXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0YmxvY2tDbGFzc05hbWU6IGJsb2NrQ2xhc3NOYW1lcy5qb2luKCcgJyksXG5cdFx0XHRcdFx0XHRibG9ja1BhZGRpbmcsXG5cdFx0XHRcdFx0XHRibG9ja0lzQWZ0ZXJFbmQ6IHJhbmdlLnN0YXJ0TGluZU51bWJlciA+IHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWVyZ2UgRWRpdG9yJyxcblx0XHRcdFx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IE1pbmltYXBQb3NpdGlvbi5HdXR0ZXIsXG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB7IGlkOiBpc0hhbmRsZWQgPyBoYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIDogdW5oYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b3ZlcnZpZXdSdWxlcjogbW9kaWZpZWRCYXNlUmFuZ2UuaXNDb25mbGljdGluZyA/IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlcixcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHsgaWQ6IGlzSGFuZGxlZCA/IGhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgOiB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSxcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmICghdXNlU2ltcGxpZmllZERlY29yYXRpb25zICYmIChtb2RpZmllZEJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nIHx8ICFtb2RlbC5pc0hhbmRsZWQobW9kaWZpZWRCYXNlUmFuZ2UpLnJlYWQocmVhZGVyKSkpIHtcblx0XHRcdFx0XHRjb25zdCBpbnB1dERpZmZzID0gbW9kaWZpZWRCYXNlUmFuZ2UuZ2V0SW5wdXREaWZmcyh0aGlzLmlucHV0TnVtYmVyKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRpZmYgb2YgaW5wdXREaWZmcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBkaWZmLm91dHB1dFJhbmdlLnRvSW5jbHVzaXZlUmFuZ2UoKTtcblx0XHRcdFx0XHRcdGlmIChyYW5nZSkge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiBgbWVyZ2UtZWRpdG9yLWRpZmYgJHtpbnB1dENsYXNzTmFtZX1gLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdNZXJnZSBFZGl0b3InLFxuXHRcdFx0XHRcdFx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGRpZmYucmFuZ2VNYXBwaW5ncykge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGQgb2YgZGlmZi5yYW5nZU1hcHBpbmdzKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHNob3dEZWxldGlvbk1hcmtlcnMgfHwgIWQub3V0cHV0UmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJhbmdlOiBkLm91dHB1dFJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiBkLm91dHB1dFJhbmdlLmlzRW1wdHkoKSA/IGBtZXJnZS1lZGl0b3ItZGlmZi1lbXB0eS13b3JkICR7aW5wdXRDbGFzc05hbWV9YCA6IGBtZXJnZS1lZGl0b3ItZGlmZi13b3JkICR7aW5wdXRDbGFzc05hbWV9YCxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lcmdlIEVkaXRvcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cblx0XHR0aGlzLmh0bWxFbGVtZW50cy5yb290LmNsYXNzTGlzdC5hZGQoYGlucHV0YCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdG5ldyBFZGl0b3JHdXR0ZXIodGhpcy5lZGl0b3IsIHRoaXMuaHRtbEVsZW1lbnRzLmd1dHRlckRpdiwge1xuXHRcdFx0XHRnZXRJbnRlcnNlY3RpbmdHdXR0ZXJJdGVtczogKHJhbmdlLCByZWFkZXIpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5jaGVja2JveGVzVmlzaWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLm1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbUluZm9zLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y3JlYXRlVmlldzogKGl0ZW0sIHRhcmdldCkgPT4gbmV3IE1lcmdlQ29uZmxpY3RHdXR0ZXJJdGVtVmlldyhpdGVtLCB0YXJnZXQsIGNvbnRleHRNZW51U2VydmljZSksXG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGNyZWF0ZVNlbGVjdGlvbnNBdXRvcnVuKHRoaXMsIChiYXNlUmFuZ2UsIHZpZXdNb2RlbCkgPT5cblx0XHRcdFx0dmlld01vZGVsLm1vZGVsLnRyYW5zbGF0ZUJhc2VSYW5nZVRvSW5wdXQodGhpcy5pbnB1dE51bWJlciwgYmFzZVJhbmdlKVxuXHRcdFx0KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRUaXRsZU1lbnUsXG5cdFx0XHRcdGlucHV0TnVtYmVyID09PSAxID8gTWVudUlkLk1lcmdlSW5wdXQxVG9vbGJhciA6IE1lbnVJZC5NZXJnZUlucHV0MlRvb2xiYXIsXG5cdFx0XHRcdHRoaXMuaHRtbEVsZW1lbnRzLnRvb2xiYXJcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bk9wdHMoeyBkZWJ1Z05hbWU6IGBpbnB1dCR7dGhpcy5pbnB1dE51bWJlcn06IHVwZGF0ZSBsYWJlbHMgJiB0ZXh0IG1vZGVsYCB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgdm0gPSB0aGlzLnZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXZtKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0TW9kZWwodGhpcy5pbnB1dE51bWJlciA9PT0gMSA/IHZtLm1vZGVsLmlucHV0MS50ZXh0TW9kZWwgOiB2bS5tb2RlbC5pbnB1dDIudGV4dE1vZGVsKTtcblxuXHRcdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmlucHV0TnVtYmVyID09PSAxXG5cdFx0XHRcdD8gdm0ubW9kZWwuaW5wdXQxLnRpdGxlIHx8IGxvY2FsaXplKCdpbnB1dDEnLCAnSW5wdXQgMScpXG5cdFx0XHRcdDogdm0ubW9kZWwuaW5wdXQyLnRpdGxlIHx8IGxvY2FsaXplKCdpbnB1dDInLCAnSW5wdXQgMicpO1xuXG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMuaW5wdXROdW1iZXIgPT09IDFcblx0XHRcdFx0PyB2bS5tb2RlbC5pbnB1dDEuZGVzY3JpcHRpb25cblx0XHRcdFx0OiB2bS5tb2RlbC5pbnB1dDIuZGVzY3JpcHRpb247XG5cblx0XHRcdGNvbnN0IGRldGFpbCA9IHRoaXMuaW5wdXROdW1iZXIgPT09IDFcblx0XHRcdFx0PyB2bS5tb2RlbC5pbnB1dDEuZGV0YWlsXG5cdFx0XHRcdDogdm0ubW9kZWwuaW5wdXQyLmRldGFpbDtcblxuXHRcdFx0cmVzZXQodGhpcy5odG1sRWxlbWVudHMudGl0bGUsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKHRpdGxlKSk7XG5cdFx0XHRyZXNldCh0aGlzLmh0bWxFbGVtZW50cy5kZXNjcmlwdGlvbiwgLi4uKGRlc2NyaXB0aW9uID8gcmVuZGVyTGFiZWxXaXRoSWNvbnMoZGVzY3JpcHRpb24pIDogW10pKTtcblx0XHRcdHJlc2V0KHRoaXMuaHRtbEVsZW1lbnRzLmRldGFpbCwgLi4uKGRldGFpbCA/IHJlbmRlckxhYmVsV2l0aEljb25zKGRldGFpbCkgOiBbXSkpO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlPYnNlcnZhYmxlRGVjb3JhdGlvbnModGhpcy5lZGl0b3IsIHRoaXMuZGVjb3JhdGlvbnMpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kaWZpZWRCYXNlUmFuZ2VHdXR0ZXJJdGVtSW5mb3M7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9ucztcbn1cblxuZXhwb3J0IGNsYXNzIE1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbU1vZGVsIGltcGxlbWVudHMgSUd1dHRlckl0ZW1JbmZvIHtcblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDtcblx0cHVibGljIHJlYWRvbmx5IHJhbmdlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYmFzZVJhbmdlOiBNb2RpZmllZEJhc2VSYW5nZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlucHV0TnVtYmVyOiAxIHwgMixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlbDogTWVyZ2VFZGl0b3JWaWV3TW9kZWxcblx0KSB7XG5cdFx0dGhpcy5tb2RlbCA9IHRoaXMudmlld01vZGVsLm1vZGVsO1xuXHRcdHRoaXMucmFuZ2UgPSB0aGlzLmJhc2VSYW5nZS5nZXRJbnB1dFJhbmdlKHRoaXMuaW5wdXROdW1iZXIpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMubW9kZWwuaXNVcFRvRGF0ZTtcblx0XHR0aGlzLnRvZ2dsZVN0YXRlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSB0aGlzLm1vZGVsXG5cdFx0XHRcdC5nZXRTdGF0ZSh0aGlzLmJhc2VSYW5nZSlcblx0XHRcdFx0LnJlYWQocmVhZGVyKVxuXHRcdFx0XHQuZ2V0SW5wdXQodGhpcy5pbnB1dE51bWJlcik7XG5cdFx0XHRyZXR1cm4gaW5wdXQgPT09IElucHV0U3RhdGUuc2Vjb25kICYmICF0aGlzLmJhc2VSYW5nZS5pc09yZGVyUmVsZXZhbnRcblx0XHRcdFx0PyBJbnB1dFN0YXRlLmZpcnN0XG5cdFx0XHRcdDogaW5wdXQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5zdGF0ZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMudmlld01vZGVsLmFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghdGhpcy5tb2RlbC5oYXNCYXNlUmFuZ2UodGhpcy5iYXNlUmFuZ2UpKSB7XG5cdFx0XHRcdHJldHVybiB7IGhhbmRsZWQ6IGZhbHNlLCBmb2N1c2VkOiBmYWxzZSB9OyAvLyBJbnZhbGlkIHN0YXRlLCBzaG91bGQgb25seSBiZSBvYnNlcnZlZCB0ZW1wb3JhcmlseVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aGFuZGxlZDogdGhpcy5tb2RlbC5pc0hhbmRsZWQodGhpcy5iYXNlUmFuZ2UpLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0Zm9jdXNlZDogdGhpcy5iYXNlUmFuZ2UgPT09IGFjdGl2ZSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgZW5hYmxlZDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdG9nZ2xlU3RhdGU6IElPYnNlcnZhYmxlPElucHV0U3RhdGU+O1xuXG5cdHB1YmxpYyByZWFkb25seSBzdGF0ZTogSU9ic2VydmFibGU8eyBoYW5kbGVkOiBib29sZWFuOyBmb2N1c2VkOiBib29sZWFuIH0+O1xuXG5cdHB1YmxpYyBzZXRTdGF0ZSh2YWx1ZTogYm9vbGVhbiwgdHg6IElUcmFuc2FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsLnNldFN0YXRlKFxuXHRcdFx0dGhpcy5iYXNlUmFuZ2UsXG5cdFx0XHR0aGlzLm1vZGVsXG5cdFx0XHRcdC5nZXRTdGF0ZSh0aGlzLmJhc2VSYW5nZSlcblx0XHRcdFx0LmdldCgpXG5cdFx0XHRcdC53aXRoSW5wdXRWYWx1ZSh0aGlzLmlucHV0TnVtYmVyLCB2YWx1ZSksXG5cdFx0XHR0eCxcblx0XHRcdHRoaXMuaW5wdXROdW1iZXJcblx0XHQpO1xuXHR9XG5cdHB1YmxpYyB0b2dnbGVCb3RoU2lkZXMoKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBDb250ZXh0IE1lbnU6IHRvZ2dsZSBib3RoIHNpZGVzICovXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubW9kZWxcblx0XHRcdFx0LmdldFN0YXRlKHRoaXMuYmFzZVJhbmdlKVxuXHRcdFx0XHQuZ2V0KCk7XG5cdFx0XHR0aGlzLm1vZGVsLnNldFN0YXRlKFxuXHRcdFx0XHR0aGlzLmJhc2VSYW5nZSxcblx0XHRcdFx0c3RhdGVcblx0XHRcdFx0XHQudG9nZ2xlKHRoaXMuaW5wdXROdW1iZXIpXG5cdFx0XHRcdFx0LnRvZ2dsZSh0aGlzLmlucHV0TnVtYmVyID09PSAxID8gMiA6IDEpLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHR0eFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZXh0TWVudUFjdGlvbnMoKTogcmVhZG9ubHkgSUFjdGlvbltdIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubW9kZWwuZ2V0U3RhdGUodGhpcy5iYXNlUmFuZ2UpLmdldCgpO1xuXHRcdGNvbnN0IGhhbmRsZWQgPSB0aGlzLm1vZGVsLmlzSGFuZGxlZCh0aGlzLmJhc2VSYW5nZSkuZ2V0KCk7XG5cblx0XHRjb25zdCB1cGRhdGUgPSAobmV3U3RhdGU6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUpID0+IHtcblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBDb250ZXh0IE1lbnU6IFVwZGF0ZSBCYXNlIFJhbmdlIFN0YXRlICovXG5cdFx0XHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbC5zZXRTdGF0ZSh0aGlzLmJhc2VSYW5nZSwgbmV3U3RhdGUsIHR4LCB0aGlzLmlucHV0TnVtYmVyKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRmdW5jdGlvbiBhY3Rpb24oaWQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgdGFyZ2V0U3RhdGU6IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGUsIGNoZWNrZWQ6IGJvb2xlYW4pIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBBY3Rpb24oaWQsIGxhYmVsLCB1bmRlZmluZWQsIHRydWUsICgpID0+IHtcblx0XHRcdFx0dXBkYXRlKHRhcmdldFN0YXRlKTtcblx0XHRcdH0pO1xuXHRcdFx0YWN0aW9uLmNoZWNrZWQgPSBjaGVja2VkO1xuXHRcdFx0cmV0dXJuIGFjdGlvbjtcblx0XHR9XG5cdFx0Y29uc3QgYm90aCA9IHN0YXRlLmluY2x1ZGVzSW5wdXQxICYmIHN0YXRlLmluY2x1ZGVzSW5wdXQyO1xuXG5cdFx0cmV0dXJuIFtcblx0XHRcdHRoaXMuYmFzZVJhbmdlLmlucHV0MURpZmZzLmxlbmd0aCA+IDBcblx0XHRcdFx0PyBhY3Rpb24oXG5cdFx0XHRcdFx0J21lcmdlRWRpdG9yLmFjY2VwdElucHV0MScsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ21lcmdlRWRpdG9yLmFjY2VwdCcsICdBY2NlcHQgezB9JywgdGhpcy5tb2RlbC5pbnB1dDEudGl0bGUpLFxuXHRcdFx0XHRcdHN0YXRlLnRvZ2dsZSgxKSxcblx0XHRcdFx0XHRzdGF0ZS5pbmNsdWRlc0lucHV0MVxuXHRcdFx0XHQpXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5iYXNlUmFuZ2UuaW5wdXQyRGlmZnMubGVuZ3RoID4gMFxuXHRcdFx0XHQ/IGFjdGlvbihcblx0XHRcdFx0XHQnbWVyZ2VFZGl0b3IuYWNjZXB0SW5wdXQyJyxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnbWVyZ2VFZGl0b3IuYWNjZXB0JywgJ0FjY2VwdCB7MH0nLCB0aGlzLm1vZGVsLmlucHV0Mi50aXRsZSksXG5cdFx0XHRcdFx0c3RhdGUudG9nZ2xlKDIpLFxuXHRcdFx0XHRcdHN0YXRlLmluY2x1ZGVzSW5wdXQyXG5cdFx0XHRcdClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHR0aGlzLmJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nXG5cdFx0XHRcdD8gc2V0RmllbGRzKFxuXHRcdFx0XHRcdGFjdGlvbihcblx0XHRcdFx0XHRcdCdtZXJnZUVkaXRvci5hY2NlcHRCb3RoJyxcblx0XHRcdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHQnbWVyZ2VFZGl0b3IuYWNjZXB0Qm90aCcsXG5cdFx0XHRcdFx0XHRcdCdBY2NlcHQgQm90aCdcblx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRzdGF0ZS53aXRoSW5wdXRWYWx1ZSgxLCAhYm90aCkud2l0aElucHV0VmFsdWUoMiwgIWJvdGgpLFxuXHRcdFx0XHRcdFx0Ym90aFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0eyBlbmFibGVkOiB0aGlzLmJhc2VSYW5nZS5jYW5CZUNvbWJpbmVkIH1cblx0XHRcdFx0KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdHRoaXMuYmFzZVJhbmdlLmlzQ29uZmxpY3Rpbmdcblx0XHRcdFx0PyBzZXRGaWVsZHMoXG5cdFx0XHRcdFx0YWN0aW9uKFxuXHRcdFx0XHRcdFx0J21lcmdlRWRpdG9yLnN3YXAnLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ21lcmdlRWRpdG9yLnN3YXAnLCAnU3dhcCcpLFxuXHRcdFx0XHRcdFx0c3RhdGUuc3dhcCgpLFxuXHRcdFx0XHRcdFx0ZmFsc2Vcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdHsgZW5hYmxlZDogIXN0YXRlLmtpbmQgJiYgKCFib3RoIHx8IHRoaXMuYmFzZVJhbmdlLmlzT3JkZXJSZWxldmFudCkgfVxuXHRcdFx0XHQpXG5cdFx0XHRcdDogdW5kZWZpbmVkLFxuXG5cdFx0XHRzZXRGaWVsZHMoXG5cdFx0XHRcdG5ldyBBY3Rpb24oXG5cdFx0XHRcdFx0J21lcmdlRWRpdG9yLm1hcmtBc0hhbmRsZWQnLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdtZXJnZUVkaXRvci5tYXJrQXNIYW5kbGVkJywgJ01hcmsgYXMgSGFuZGxlZCcpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIENvbnRleHQgTWVudTogTWFyayBhcyBoYW5kbGVkICovXG5cdFx0XHRcdFx0XHRcdHRoaXMubW9kZWwuc2V0SGFuZGxlZCh0aGlzLmJhc2VSYW5nZSwgIWhhbmRsZWQsIHR4KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0KSxcblx0XHRcdFx0eyBjaGVja2VkOiBoYW5kbGVkIH1cblx0XHRcdCksXG5cdFx0XS5maWx0ZXIoaXNEZWZpbmVkKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWVyZ2VDb25mbGljdEd1dHRlckl0ZW1WaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElHdXR0ZXJJdGVtVmlldzxNb2RpZmllZEJhc2VSYW5nZUd1dHRlckl0ZW1Nb2RlbD4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IGl0ZW06IElTZXR0YWJsZU9ic2VydmFibGU8TW9kaWZpZWRCYXNlUmFuZ2VHdXR0ZXJJdGVtTW9kZWw+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hlY2tib3hEaXY6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzTXVsdGlMaW5lID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpdGVtOiBNb2RpZmllZEJhc2VSYW5nZUd1dHRlckl0ZW1Nb2RlbCxcblx0XHR0YXJnZXQ6IEhUTUxFbGVtZW50LFxuXHRcdGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuaXRlbSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBpdGVtKTtcblxuXHRcdGNvbnN0IGNoZWNrQm94ID0gbmV3IFRvZ2dsZSh7XG5cdFx0XHRpc0NoZWNrZWQ6IGZhbHNlLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdC4uLmRlZmF1bHRUb2dnbGVTdHlsZXNcblx0XHR9KTtcblx0XHRjaGVja0JveC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2FjY2VwdC1jb25mbGljdC1ncm91cCcpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2hlY2tCb3guZG9tTm9kZSwgRXZlbnRUeXBlLk1PVVNFX0RPV04sIChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLml0ZW0uZ2V0KCk7XG5cdFx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gLyogUmlnaHQgKi8gMikge1xuXHRcdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXG5cdFx0XHRcdFx0Y29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IGNoZWNrQm94LmRvbU5vZGUsXG5cdFx0XHRcdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBpdGVtLmdldENvbnRleHRNZW51QWN0aW9ucygpLFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5idXR0b24gPT09IC8qIE1pZGRsZSAqLyAxKSB7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0XHRpdGVtLnRvZ2dsZUJvdGhTaWRlcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBVcGRhdGUgQ2hlY2tib3ggKi9cblx0XHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuaXRlbS5yZWFkKHJlYWRlcikhO1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGl0ZW0udG9nZ2xlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBpY29uTWFwOiBSZWNvcmQ8SW5wdXRTdGF0ZSwgeyBpY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7IGNoZWNrZWQ6IGJvb2xlYW47IHRpdGxlOiBzdHJpbmcgfT4gPSB7XG5cdFx0XHRcdFx0W0lucHV0U3RhdGUuZXhjbHVkZWRdOiB7IGljb246IHVuZGVmaW5lZCwgY2hlY2tlZDogZmFsc2UsIHRpdGxlOiBsb2NhbGl6ZSgnYWNjZXB0LmV4Y2x1ZGVkJywgXCJBY2NlcHRcIikgfSxcblx0XHRcdFx0XHRbSW5wdXRTdGF0ZS51bnJlY29nbml6ZWRdOiB7IGljb246IENvZGljb24uY2lyY2xlRmlsbGVkLCBjaGVja2VkOiBmYWxzZSwgdGl0bGU6IGxvY2FsaXplKCdhY2NlcHQuY29uZmxpY3RpbmcnLCBcIkFjY2VwdCAocmVzdWx0IGlzIGRpcnR5KVwiKSB9LFxuXHRcdFx0XHRcdFtJbnB1dFN0YXRlLmZpcnN0XTogeyBpY29uOiBDb2RpY29uLmNoZWNrLCBjaGVja2VkOiB0cnVlLCB0aXRsZTogbG9jYWxpemUoJ2FjY2VwdC5maXJzdCcsIFwiVW5kbyBhY2NlcHRcIikgfSxcblx0XHRcdFx0XHRbSW5wdXRTdGF0ZS5zZWNvbmRdOiB7IGljb246IENvZGljb24uY2hlY2tBbGwsIGNoZWNrZWQ6IHRydWUsIHRpdGxlOiBsb2NhbGl6ZSgnYWNjZXB0LnNlY29uZCcsIFwiVW5kbyBhY2NlcHQgKGN1cnJlbnRseSBzZWNvbmQpXCIpIH0sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gaWNvbk1hcFt2YWx1ZV07XG5cdFx0XHRcdGNoZWNrQm94LnNldEljb24oc3RhdGUuaWNvbik7XG5cdFx0XHRcdGNoZWNrQm94LmNoZWNrZWQgPSBzdGF0ZS5jaGVja2VkO1xuXHRcdFx0XHRjaGVja0JveC5zZXRUaXRsZShzdGF0ZS50aXRsZSk7XG5cblx0XHRcdFx0aWYgKCFpdGVtLmVuYWJsZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0Y2hlY2tCb3guZGlzYWJsZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNoZWNrQm94LmVuYWJsZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIFVwZGF0ZSBDaGVja2JveCBDU1MgQ2xhc3NOYW1lcyAqL1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLml0ZW0ucmVhZChyZWFkZXIpLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGNsYXNzTmFtZXMgPSBbXG5cdFx0XHRcdCdtZXJnZS1hY2NlcHQtZ3V0dGVyLW1hcmtlcicsXG5cdFx0XHRcdHN0YXRlLmhhbmRsZWQgJiYgJ2hhbmRsZWQnLFxuXHRcdFx0XHRzdGF0ZS5mb2N1c2VkICYmICdmb2N1c2VkJyxcblx0XHRcdFx0dGhpcy5pc011bHRpTGluZS5yZWFkKHJlYWRlcikgPyAnbXVsdGktbGluZScgOiAnc2luZ2xlLWxpbmUnLFxuXHRcdFx0XTtcblx0XHRcdHRhcmdldC5jbGFzc05hbWUgPSBjbGFzc05hbWVzLmZpbHRlcihjID0+IHR5cGVvZiBjID09PSAnc3RyaW5nJykuam9pbignICcpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoZWNrQm94Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBIYW5kbGUgQ2hlY2tib3ggQ2hhbmdlICovXG5cdFx0XHRcdHRoaXMuaXRlbS5nZXQoKSEuc2V0U3RhdGUoY2hlY2tCb3guY2hlY2tlZCwgdHgpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGFyZ2V0LmFwcGVuZENoaWxkKGgoJ2Rpdi5iYWNrZ3JvdW5kJywgW25vQnJlYWtXaGl0ZXNwYWNlXSkucm9vdCk7XG5cdFx0dGFyZ2V0LmFwcGVuZENoaWxkKFxuXHRcdFx0dGhpcy5jaGVja2JveERpdiA9IGgoJ2Rpdi5jaGVja2JveCcsIFtoKCdkaXYuY2hlY2tib3gtYmFja2dyb3VuZCcsIFtjaGVja0JveC5kb21Ob2RlXSldKS5yb290XG5cdFx0KTtcblx0fVxuXG5cdGxheW91dCh0b3A6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHZpZXdUb3A6IG51bWJlciwgdmlld0hlaWdodDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hlY2tib3hIZWlnaHQgPSB0aGlzLmNoZWNrYm94RGl2LmNsaWVudEhlaWdodDtcblx0XHRjb25zdCBtaWRkbGVIZWlnaHQgPSBoZWlnaHQgLyAyIC0gY2hlY2tib3hIZWlnaHQgLyAyO1xuXG5cdFx0Y29uc3QgbWFyZ2luID0gY2hlY2tib3hIZWlnaHQ7XG5cblx0XHRsZXQgZWZmZWN0aXZlQ2hlY2tib3hUb3AgPSB0b3AgKyBtaWRkbGVIZWlnaHQ7XG5cblx0XHRjb25zdCBwcmVmZXJyZWRWaWV3UG9ydFJhbmdlID0gW1xuXHRcdFx0bWFyZ2luLFxuXHRcdFx0dmlld1RvcCArIHZpZXdIZWlnaHQgLSBtYXJnaW4gLSBjaGVja2JveEhlaWdodFxuXHRcdF07XG5cblx0XHRjb25zdCBwcmVmZXJyZWRQYXJlbnRSYW5nZSA9IFtcblx0XHRcdHRvcCArIG1hcmdpbixcblx0XHRcdHRvcCArIGhlaWdodCAtIGNoZWNrYm94SGVpZ2h0IC0gbWFyZ2luXG5cdFx0XTtcblxuXHRcdGlmIChwcmVmZXJyZWRQYXJlbnRSYW5nZVswXSA8IHByZWZlcnJlZFBhcmVudFJhbmdlWzFdKSB7XG5cdFx0XHRlZmZlY3RpdmVDaGVja2JveFRvcCA9IGNsYW1wKGVmZmVjdGl2ZUNoZWNrYm94VG9wLCBwcmVmZXJyZWRWaWV3UG9ydFJhbmdlWzBdLCBwcmVmZXJyZWRWaWV3UG9ydFJhbmdlWzFdKTtcblx0XHRcdGVmZmVjdGl2ZUNoZWNrYm94VG9wID0gY2xhbXAoZWZmZWN0aXZlQ2hlY2tib3hUb3AsIHByZWZlcnJlZFBhcmVudFJhbmdlWzBdLCBwcmVmZXJyZWRQYXJlbnRSYW5nZVsxXSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaGVja2JveERpdi5zdHlsZS50b3AgPSBgJHtlZmZlY3RpdmVDaGVja2JveFRvcCAtIHRvcH1weGA7XG5cblx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gTWVyZ2VDb25mbGljdEd1dHRlckl0ZW1WaWV3OiBVcGRhdGUgSXMgTXVsdGkgTGluZSAqL1xuXHRcdFx0dGhpcy5pc011bHRpTGluZS5zZXQoaGVpZ2h0ID4gMzAsIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdHVwZGF0ZShiYXNlUmFuZ2U6IE1vZGlmaWVkQmFzZVJhbmdlR3V0dGVySXRlbU1vZGVsKTogdm9pZCB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBNZXJnZUNvbmZsaWN0R3V0dGVySXRlbVZpZXc6IFVwZGF0aW5nIG5ldyBiYXNlIHJhbmdlICovXG5cdFx0XHR0aGlzLml0ZW0uc2V0KGJhc2VSYW5nZSwgdHgpO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsdUJBQXVCLFdBQVcsR0FBRyxhQUFhO0FBQzNELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsY0FBYztBQUN2QixTQUFTLFFBQWlCLGlCQUFpQjtBQUMzQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsU0FBUyxhQUFhLFNBQVMsYUFBNkQsaUJBQWlCLG1CQUFtQjtBQUN6SSxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFnQyxpQkFBaUIseUJBQXlCO0FBQzFFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGtCQUE2RDtBQUN0RSxTQUFTLDRCQUE0QixpQkFBaUI7QUFDdEQsU0FBUywwQ0FBMEMsa0RBQWtEO0FBRXJHLFNBQVMsb0JBQXNEO0FBQy9ELFNBQVMsZ0JBQWdCLHlCQUF5QixpQkFBaUI7QUFFNUQsSUFBTSxzQkFBTixjQUFrQyxlQUFlO0FBQUEsRUFHdkQsWUFDaUIsYUFDaEIsV0FDdUIsc0JBQ0Ysb0JBQ0Usc0JBQ3RCO0FBQ0QsVUFBTSxzQkFBc0IsV0FBVyxvQkFBb0I7QUFOM0M7QUFPaEIsU0FBSyxtQkFBbUIsS0FBSyxnQkFBZ0IsSUFBSSxJQUFJO0FBQ3JELFNBQUssbUNBQW1DLFlBQVksRUFBRSxXQUFXLFFBQVEsS0FBSyxXQUFXLG9DQUFvQyxHQUFHLFlBQVU7QUFDekksWUFBTUEsYUFBWSxLQUFLLFVBQVUsS0FBSyxN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QUFLLE9BQU8sTUFBTSxRQUFRLEVBQUUsS0FBSyxHQUFHO0FBQUEsSUFDMUUsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLFNBQVMsU0FBUyxNQUFNO0FBQ3RDLGtCQUFZLFFBQU07QUFFakIsYUFBSyxLQUFLLElBQUksRUFBRyxTQUFTLFNBQVMsU0FBUyxFQUFFO0FBQUEsTUFDL0MsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBRUYsV0FBTyxZQUFZLEVBQUUsa0JBQWtCLENBQUMsaUJBQWlCLENBQUMsRUFBRSxJQUFJO0FBQ2hFLFdBQU87QUFBQSxNQUNOLEtBQUssY0FBYyxFQUFFLGdCQUFnQixDQUFDLEVBQUUsMkJBQTJCLENBQUMsU0FBUyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUU7QUFBQSxJQUMxRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQU8sS0FBYSxRQUFnQixTQUFpQixZQUEwQjtBQUM5RSxVQUFNLGlCQUFpQixLQUFLLFlBQVk7QUFDeEMsVUFBTSxlQUFlLFNBQVMsSUFBSSxpQkFBaUI7QUFFbkQsVUFBTSxTQUFTO0FBRWYsUUFBSSx1QkFBdUIsTUFBTTtBQUVqQyxVQUFNLHlCQUF5QjtBQUFBLE1BQzlCO0FBQUEsTUFDQSxVQUFVLGFBQWEsU0FBUztBQUFBLElBQ2pDO0FBRUEsVUFBTSx1QkFBdUI7QUFBQSxNQUM1QixNQUFNO0FBQUEsTUFDTixNQUFNLFNBQVMsaUJBQWlCO0FBQUEsSUFDakM7QUFFQSxRQUFJLHFCQUFxQixDQUFDLElBQUkscUJBQXFCLENBQUMsR0FBRztBQUN0RCw2QkFBdUIsTUFBTSxzQkFBc0IsdUJBQXVCLENBQUMsR0FBRyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3ZHLDZCQUF1QixNQUFNLHNCQUFzQixxQkFBcUIsQ0FBQyxHQUFHLHFCQUFxQixDQUFDLENBQUM7QUFBQSxJQUNwRztBQUVBLFNBQUssWUFBWSxNQUFNLE1BQU0sR0FBRyx1QkFBdUIsR0FBRztBQUUxRCxnQkFBWSxDQUFDLE9BQU87QUFFbkIsV0FBSyxZQUFZLElBQUksU0FBUyxJQUFJLEVBQUU7QUFBQSxJQUNyQyxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsT0FBTyxXQUFtRDtBQUN6RCxnQkFBWSxRQUFNO0FBRWpCLFdBQUssS0FBSyxJQUFJLFdBQVcsRUFBRTtBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGO0FBQ0Q7IiwKICAibmFtZXMiOiBbInZpZXdNb2RlbCIsICJpbnB1dE51bWJlciIsICJyYW5nZSIsICJhY3Rpb24iLCAiaXRlbSJdCn0K
