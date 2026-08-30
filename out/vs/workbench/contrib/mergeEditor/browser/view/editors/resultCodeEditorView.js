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
import { reset } from "../../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../../base/browser/ui/actionbar/actionbar.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { CompareResult } from "../../../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../../../base/common/errors.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived } from "../../../../../../base/common/observable.js";
import { MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { localize } from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { MergeEditorLineRange } from "../../model/lineRange.js";
import { applyObservableDecorations, join } from "../../utils.js";
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from "../colors.js";
import { EditorGutter } from "../editorGutter.js";
import { ctxIsMergeResultEditor } from "../../../common/mergeEditor.js";
import { CodeEditorView, createSelectionsAutorun, TitleMenu } from "./codeEditorView.js";
let ResultCodeEditorView = class extends CodeEditorView {
  constructor(viewModel, instantiationService, _labelService, configurationService) {
    super(instantiationService, viewModel, configurationService);
    this._labelService = _labelService;
    this.decorations = derived(this, (reader) => {
      const viewModel = this.viewModel.read(reader);
      if (!viewModel) {
        return [];
      }
      const model = viewModel.model;
      const textModel = model.resultTextModel;
      const result = new Array();
      const baseRangeWithStoreAndTouchingDiffs = join(
        model.modifiedBaseRanges.read(reader),
        model.baseResultDiffs.read(reader),
        (baseRange, diff) => baseRange.baseRange.intersectsOrTouches(diff.inputRange) ? CompareResult.neitherLessOrGreaterThan : MergeEditorLineRange.compareByStart(
          baseRange.baseRange,
          diff.inputRange
        )
      );
      const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);
      const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
      for (const m of baseRangeWithStoreAndTouchingDiffs) {
        const modifiedBaseRange = m.left;
        if (modifiedBaseRange) {
          const blockClassNames = ["merge-editor-block"];
          let blockPadding = [0, 0, 0, 0];
          const isHandled = model.isHandled(modifiedBaseRange).read(reader);
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
          blockClassNames.push("result");
          if (!modifiedBaseRange.isConflicting && !showNonConflictingChanges && isHandled) {
            continue;
          }
          const range = model.getLineRangeInResult(modifiedBaseRange.baseRange, reader);
          result.push({
            range: range.toInclusiveRangeOrEmpty(),
            options: {
              showIfCollapsed: true,
              blockClassName: blockClassNames.join(" "),
              blockPadding,
              blockIsAfterEnd: range.startLineNumber > textModel.getLineCount(),
              description: "Result Diff",
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
        }
        if (!modifiedBaseRange || modifiedBaseRange.isConflicting) {
          for (const diff of m.rights) {
            const range = diff.outputRange.toInclusiveRange();
            if (range) {
              result.push({
                range,
                options: {
                  className: `merge-editor-diff result`,
                  description: "Merge Editor",
                  isWholeLine: true
                }
              });
            }
            if (diff.rangeMappings) {
              for (const d of diff.rangeMappings) {
                result.push({
                  range: d.outputRange,
                  options: {
                    className: `merge-editor-diff-word result`,
                    description: "Merge Editor"
                  }
                });
              }
            }
          }
        }
      }
      return result;
    });
    this.editor.invokeWithinContext((accessor) => {
      const contextKeyService = accessor.get(IContextKeyService);
      const isMergeResultEditor = ctxIsMergeResultEditor.bindTo(contextKeyService);
      isMergeResultEditor.set(true);
      this._register(toDisposable(() => isMergeResultEditor.reset()));
    });
    this.htmlElements.gutterDiv.style.width = "5px";
    this.htmlElements.root.classList.add(`result`);
    this._register(
      autorunWithStore((reader, store) => {
        if (this.checkboxesVisible.read(reader)) {
          store.add(new EditorGutter(this.editor, this.htmlElements.gutterDiv, {
            getIntersectingGutterItems: (range, reader2) => [],
            createView: (item, target) => {
              throw new BugIndicatingError();
            }
          }));
        }
      })
    );
    this._register(autorun((reader) => {
      const vm = this.viewModel.read(reader);
      if (!vm) {
        return;
      }
      this.editor.setModel(vm.model.resultTextModel);
      reset(this.htmlElements.title, ...renderLabelWithIcons(localize("result", "Result")));
      reset(this.htmlElements.description, ...renderLabelWithIcons(this._labelService.getUriLabel(vm.model.resultTextModel.uri, { relative: true })));
    }));
    const remainingConflictsActionBar = this._register(new ActionBar(this.htmlElements.detail));
    this._register(autorun((reader) => {
      const vm = this.viewModel.read(reader);
      if (!vm) {
        return;
      }
      const model = vm.model;
      if (!model) {
        return;
      }
      const count = model.unhandledConflictsCount.read(reader);
      const text = count === 1 ? localize(
        "mergeEditor.remainingConflicts",
        "{0} Conflict Remaining",
        count
      ) : localize(
        "mergeEditor.remainingConflict",
        "{0} Conflicts Remaining ",
        count
      );
      remainingConflictsActionBar.clear();
      remainingConflictsActionBar.push({
        class: void 0,
        enabled: count > 0,
        id: "nextConflict",
        label: text,
        run() {
          vm.model.telemetry.reportConflictCounterClicked();
          vm.goToNextModifiedBaseRange((m) => !model.isHandled(m).read(void 0));
        },
        tooltip: count > 0 ? localize("goToNextConflict", "Go to next conflict") : localize("allConflictHandled", "All conflicts handled, the merge can be completed now.")
      });
    }));
    this._register(applyObservableDecorations(this.editor, this.decorations));
    this._register(
      createSelectionsAutorun(
        this,
        (baseRange, viewModel2) => viewModel2.model.translateBaseRangeToResult(baseRange)
      )
    );
    this._register(
      instantiationService.createInstance(
        TitleMenu,
        MenuId.MergeInputResultToolbar,
        this.htmlElements.toolbar
      )
    );
  }
};
ResultCodeEditorView = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IConfigurationService)
], ResultCodeEditorView);
export {
  ResultCodeEditorView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFxlZGl0b3JzXFxyZXN1bHRDb2RlRWRpdG9yVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlc2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBDb21wYXJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1bldpdGhTdG9yZSwgZGVyaXZlZCwgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgTWluaW1hcFBvc2l0aW9uLCBPdmVydmlld1J1bGVyTGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vbW9kZWwvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IGFwcGx5T2JzZXJ2YWJsZURlY29yYXRpb25zLCBqb2luIH0gZnJvbSAnLi4vLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciwgdW5oYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIH0gZnJvbSAnLi4vY29sb3JzLmpzJztcbmltcG9ydCB7IEVkaXRvckd1dHRlciB9IGZyb20gJy4uL2VkaXRvckd1dHRlci5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBjdHhJc01lcmdlUmVzdWx0RWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21lcmdlRWRpdG9yLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JWaWV3LCBjcmVhdGVTZWxlY3Rpb25zQXV0b3J1biwgVGl0bGVNZW51IH0gZnJvbSAnLi9jb2RlRWRpdG9yVmlldy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZXN1bHRDb2RlRWRpdG9yVmlldyBleHRlbmRzIENvZGVFZGl0b3JWaWV3IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0dmlld01vZGVsOiBJT2JzZXJ2YWJsZTxNZXJnZUVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB2aWV3TW9kZWwsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4ge1xuXHRcdFx0Y29uc3QgY29udGV4dEtleVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGlzTWVyZ2VSZXN1bHRFZGl0b3IgPSBjdHhJc01lcmdlUmVzdWx0RWRpdG9yLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRpc01lcmdlUmVzdWx0RWRpdG9yLnNldCh0cnVlKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiBpc01lcmdlUmVzdWx0RWRpdG9yLnJlc2V0KCkpKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuaHRtbEVsZW1lbnRzLmd1dHRlckRpdi5zdHlsZS53aWR0aCA9ICc1cHgnO1xuXHRcdHRoaXMuaHRtbEVsZW1lbnRzLnJvb3QuY2xhc3NMaXN0LmFkZChgcmVzdWx0YCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgY2hlY2tib3hlcyAqL1xuXHRcdFx0XHRpZiAodGhpcy5jaGVja2JveGVzVmlzaWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQobmV3IEVkaXRvckd1dHRlcih0aGlzLmVkaXRvciwgdGhpcy5odG1sRWxlbWVudHMuZ3V0dGVyRGl2LCB7XG5cdFx0XHRcdFx0XHRnZXRJbnRlcnNlY3RpbmdHdXR0ZXJJdGVtczogKHJhbmdlLCByZWFkZXIpID0+IFtdLFxuXHRcdFx0XHRcdFx0Y3JlYXRlVmlldzogKGl0ZW0sIHRhcmdldCkgPT4geyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7IH0sXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBsYWJlbHMgJiB0ZXh0IG1vZGVsICovXG5cdFx0XHRjb25zdCB2bSA9IHRoaXMudmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghdm0pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0TW9kZWwodm0ubW9kZWwucmVzdWx0VGV4dE1vZGVsKTtcblx0XHRcdHJlc2V0KHRoaXMuaHRtbEVsZW1lbnRzLnRpdGxlLCAuLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhsb2NhbGl6ZSgncmVzdWx0JywgJ1Jlc3VsdCcpKSk7XG5cdFx0XHRyZXNldCh0aGlzLmh0bWxFbGVtZW50cy5kZXNjcmlwdGlvbiwgLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnModGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHZtLm1vZGVsLnJlc3VsdFRleHRNb2RlbC51cmksIHsgcmVsYXRpdmU6IHRydWUgfSkpKTtcblx0XHR9KSk7XG5cblxuXHRcdGNvbnN0IHJlbWFpbmluZ0NvbmZsaWN0c0FjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodGhpcy5odG1sRWxlbWVudHMuZGV0YWlsKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSByZW1haW5pbmdDb25mbGljdHMgbGFiZWwgKi9cblx0XHRcdGNvbnN0IHZtID0gdGhpcy52aWV3TW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCF2bSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gdm0ubW9kZWw7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwudW5oYW5kbGVkQ29uZmxpY3RzQ291bnQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCB0ZXh0ID0gY291bnQgPT09IDFcblx0XHRcdFx0PyBsb2NhbGl6ZShcblx0XHRcdFx0XHQnbWVyZ2VFZGl0b3IucmVtYWluaW5nQ29uZmxpY3RzJyxcblx0XHRcdFx0XHQnezB9IENvbmZsaWN0IFJlbWFpbmluZycsXG5cdFx0XHRcdFx0Y291bnRcblx0XHRcdFx0KVxuXHRcdFx0XHQ6IGxvY2FsaXplKFxuXHRcdFx0XHRcdCdtZXJnZUVkaXRvci5yZW1haW5pbmdDb25mbGljdCcsXG5cdFx0XHRcdFx0J3swfSBDb25mbGljdHMgUmVtYWluaW5nICcsXG5cdFx0XHRcdFx0Y291bnRcblx0XHRcdFx0KTtcblxuXHRcdFx0cmVtYWluaW5nQ29uZmxpY3RzQWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0XHRyZW1haW5pbmdDb25mbGljdHNBY3Rpb25CYXIucHVzaCh7XG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IGNvdW50ID4gMCxcblx0XHRcdFx0aWQ6ICduZXh0Q29uZmxpY3QnLFxuXHRcdFx0XHRsYWJlbDogdGV4dCxcblx0XHRcdFx0cnVuKCkge1xuXHRcdFx0XHRcdHZtLm1vZGVsLnRlbGVtZXRyeS5yZXBvcnRDb25mbGljdENvdW50ZXJDbGlja2VkKCk7XG5cdFx0XHRcdFx0dm0uZ29Ub05leHRNb2RpZmllZEJhc2VSYW5nZShtID0+ICFtb2RlbC5pc0hhbmRsZWQobSkucmVhZCh1bmRlZmluZWQpKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbHRpcDogY291bnQgPiAwXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZ29Ub05leHRDb25mbGljdCcsICdHbyB0byBuZXh0IGNvbmZsaWN0Jylcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhbGxDb25mbGljdEhhbmRsZWQnLCAnQWxsIGNvbmZsaWN0cyBoYW5kbGVkLCB0aGUgbWVyZ2UgY2FuIGJlIGNvbXBsZXRlZCBub3cuJyksXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGx5T2JzZXJ2YWJsZURlY29yYXRpb25zKHRoaXMuZWRpdG9yLCB0aGlzLmRlY29yYXRpb25zKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGNyZWF0ZVNlbGVjdGlvbnNBdXRvcnVuKHRoaXMsIChiYXNlUmFuZ2UsIHZpZXdNb2RlbCkgPT5cblx0XHRcdFx0dmlld01vZGVsLm1vZGVsLnRyYW5zbGF0ZUJhc2VSYW5nZVRvUmVzdWx0KGJhc2VSYW5nZSlcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0VGl0bGVNZW51LFxuXHRcdFx0XHRNZW51SWQuTWVyZ2VJbnB1dFJlc3VsdFRvb2xiYXIsXG5cdFx0XHRcdHRoaXMuaHRtbEVsZW1lbnRzLnRvb2xiYXJcblx0XHRcdClcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9ucyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB2aWV3TW9kZWwubW9kZWw7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gbW9kZWwucmVzdWx0VGV4dE1vZGVsO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBBcnJheTxJTW9kZWxEZWx0YURlY29yYXRpb24+KCk7XG5cblx0XHRjb25zdCBiYXNlUmFuZ2VXaXRoU3RvcmVBbmRUb3VjaGluZ0RpZmZzID0gam9pbihcblx0XHRcdG1vZGVsLm1vZGlmaWVkQmFzZVJhbmdlcy5yZWFkKHJlYWRlciksXG5cdFx0XHRtb2RlbC5iYXNlUmVzdWx0RGlmZnMucmVhZChyZWFkZXIpLFxuXHRcdFx0KGJhc2VSYW5nZSwgZGlmZikgPT4gYmFzZVJhbmdlLmJhc2VSYW5nZS5pbnRlcnNlY3RzT3JUb3VjaGVzKGRpZmYuaW5wdXRSYW5nZSlcblx0XHRcdFx0PyBDb21wYXJlUmVzdWx0Lm5laXRoZXJMZXNzT3JHcmVhdGVyVGhhblxuXHRcdFx0XHQ6IE1lcmdlRWRpdG9yTGluZVJhbmdlLmNvbXBhcmVCeVN0YXJ0KFxuXHRcdFx0XHRcdGJhc2VSYW5nZS5iYXNlUmFuZ2UsXG5cdFx0XHRcdFx0ZGlmZi5pbnB1dFJhbmdlXG5cdFx0XHRcdClcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UgPSB2aWV3TW9kZWwuYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UucmVhZChyZWFkZXIpO1xuXG5cdFx0Y29uc3Qgc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcyA9IHZpZXdNb2RlbC5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLnJlYWQocmVhZGVyKTtcblxuXHRcdGZvciAoY29uc3QgbSBvZiBiYXNlUmFuZ2VXaXRoU3RvcmVBbmRUb3VjaGluZ0RpZmZzKSB7XG5cdFx0XHRjb25zdCBtb2RpZmllZEJhc2VSYW5nZSA9IG0ubGVmdDtcblxuXHRcdFx0aWYgKG1vZGlmaWVkQmFzZVJhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGJsb2NrQ2xhc3NOYW1lcyA9IFsnbWVyZ2UtZWRpdG9yLWJsb2NrJ107XG5cdFx0XHRcdGxldCBibG9ja1BhZGRpbmc6IFt0b3A6IG51bWJlciwgcmlnaHQ6IG51bWJlciwgYm90dG9tOiBudW1iZXIsIGxlZnQ6IG51bWJlcl0gPSBbMCwgMCwgMCwgMF07XG5cdFx0XHRcdGNvbnN0IGlzSGFuZGxlZCA9IG1vZGVsLmlzSGFuZGxlZChtb2RpZmllZEJhc2VSYW5nZSkucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoaXNIYW5kbGVkKSB7XG5cdFx0XHRcdFx0YmxvY2tDbGFzc05hbWVzLnB1c2goJ2hhbmRsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kaWZpZWRCYXNlUmFuZ2UgPT09IGFjdGl2ZU1vZGlmaWVkQmFzZVJhbmdlKSB7XG5cdFx0XHRcdFx0YmxvY2tDbGFzc05hbWVzLnB1c2goJ2ZvY3VzZWQnKTtcblx0XHRcdFx0XHRibG9ja1BhZGRpbmcgPSBbMCwgMiwgMCwgMl07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcpIHtcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgnY29uZmxpY3RpbmcnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRibG9ja0NsYXNzTmFtZXMucHVzaCgncmVzdWx0Jyk7XG5cblx0XHRcdFx0aWYgKCFtb2RpZmllZEJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nICYmICFzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzICYmIGlzSGFuZGxlZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBtb2RlbC5nZXRMaW5lUmFuZ2VJblJlc3VsdChtb2RpZmllZEJhc2VSYW5nZS5iYXNlUmFuZ2UsIHJlYWRlcik7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRyYW5nZTogcmFuZ2UudG9JbmNsdXNpdmVSYW5nZU9yRW1wdHkoKSxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZTogYmxvY2tDbGFzc05hbWVzLmpvaW4oJyAnKSxcblx0XHRcdFx0XHRcdGJsb2NrUGFkZGluZyxcblx0XHRcdFx0XHRcdGJsb2NrSXNBZnRlckVuZDogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gdGV4dE1vZGVsLmdldExpbmVDb3VudCgpLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSZXN1bHQgRGlmZicsXG5cdFx0XHRcdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBNaW5pbWFwUG9zaXRpb24uR3V0dGVyLFxuXHRcdFx0XHRcdFx0XHRjb2xvcjogeyBpZDogaXNIYW5kbGVkID8gaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciA6IHVuaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IG1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcgPyB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiBPdmVydmlld1J1bGVyTGFuZS5DZW50ZXIsXG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB7IGlkOiBpc0hhbmRsZWQgPyBoYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIDogdW5oYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIH0sXG5cdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFtb2RpZmllZEJhc2VSYW5nZSB8fCBtb2RpZmllZEJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiBtLnJpZ2h0cykge1xuXHRcdFx0XHRcdGNvbnN0IHJhbmdlID0gZGlmZi5vdXRwdXRSYW5nZS50b0luY2x1c2l2ZVJhbmdlKCk7XG5cdFx0XHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiBgbWVyZ2UtZWRpdG9yLWRpZmYgcmVzdWx0YCxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lcmdlIEVkaXRvcicsXG5cdFx0XHRcdFx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWUsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChkaWZmLnJhbmdlTWFwcGluZ3MpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZCBvZiBkaWZmLnJhbmdlTWFwcGluZ3MpIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdHJhbmdlOiBkLm91dHB1dFJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzTmFtZTogYG1lcmdlLWVkaXRvci1kaWZmLXdvcmQgcmVzdWx0YCxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWVyZ2UgRWRpdG9yJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxTQUFTLGtCQUFrQixlQUE0QjtBQUNoRSxTQUFnQyxpQkFBaUIseUJBQXlCO0FBQzFFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDRCQUE0QixZQUFZO0FBQ2pELFNBQVMsMENBQTBDLGtEQUFrRDtBQUNyRyxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGdCQUFnQix5QkFBeUIsaUJBQWlCO0FBRTVELElBQU0sdUJB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QVUsUUFBUSxDQUFDLENBQUM7QUFDcEYsWUFBTSxLQUFLLGFBQWEsYUFBYSxHQUFHLHFCQUFxQixLQUFLLGNBQWMsWUFBWSxHQUFHLE1BQU0sZ0JBQWdCLEtBQUssRUFBRSxVQUFVLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUMvSSxDQUFDLENBQUM7QUFHRixVQUFNLDhCQUE4QixLQUFLLFVBQVUsSUFBSSxVQUFVLEtBQUssYUFBYSxNQUFNLENBQUM7QUFFMUYsU0FBSyxVQUFVLFFBQVEsWUFBVTtBQUVoQyxZQUFNLEtBQUssS0FBSyxVQUFVLEtBQUssTUFBTTtBQUNyQyxVQUFJLENBQUMsSUFBSTtBQUNSO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxHQUFHO0FBQ2pCLFVBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxNQUNEO0FBQ0EsWUFBTSxRQUFRLE1BQU0sd0JBQXdCLEtBQUssTUFBTTtBQUV2RCxZQUFNLE9BQU8sVUFBVSxJQUNwQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsSUFDRTtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFRCxrQ0FBNEIsTUFBTTtBQUNsQyxrQ0FBNEIsS0FBSztBQUFBLFFBQ2hDLE9BQU87QUFBQSxRQUNQLFNBQVMsUUFBUTtBQUFBLFFBQ2pCLElBQUk7QUFBQSxRQUNKLE9BQU87QUFBQSxRQUNQLE1BQU07QUFDTCxhQUFHLE1BQU0sVUFBVSw2QkFBNkI7QUFDaEQsYUFBRywwQkFBMEIsT0FBSyxDQUFDLE1BQU0sVUFBVSxDQUFDLEVBQUUsS0FBSyxNQUFTLENBQUM7QUFBQSxRQUN0RTtBQUFBLFFBQ0EsU0FBUyxRQUFRLElBQ2QsU0FBUyxvQkFBb0IscUJBQXFCLElBQ2xELFNBQVMsc0JBQXNCLHdEQUF3RDtBQUFBLE1BQzNGLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUdGLFNBQUssVUFBVSwyQkFBMkIsS0FBSyxRQUFRLEtBQUssV0FBVyxDQUFDO0FBRXhFLFNBQUs7QUFBQSxNQUNKO0FBQUEsUUFBd0I7QUFBQSxRQUFNLENBQUMsV0FBV0MsZUFDekNBLFdBQVUsTUFBTSwyQkFBMkIsU0FBUztBQUFBLE1BQ3JEO0FBQUEsSUFDRDtBQUVBLFNBQUs7QUFBQSxNQUNKLHFCQUFxQjtBQUFBLFFBQ3BCO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxLQUFLLGFBQWE7QUFBQSxNQUNuQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBb0dEO0FBMU1hLHVCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FMVTsiLAogICJuYW1lcyI6IFsicmVhZGVyIiwgInZpZXdNb2RlbCJdCn0K
