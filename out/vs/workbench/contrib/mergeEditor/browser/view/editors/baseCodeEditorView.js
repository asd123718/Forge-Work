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
import { h, reset } from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { BugIndicatingError } from "../../../../../../base/common/errors.js";
import { autorun, autorunWithStore, derived } from "../../../../../../base/common/observable.js";
import { MinimapPosition, OverviewRulerLane } from "../../../../../../editor/common/model.js";
import { localize } from "../../../../../../nls.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { applyObservableDecorations } from "../../utils.js";
import { handledConflictMinimapOverViewRulerColor, unhandledConflictMinimapOverViewRulerColor } from "../colors.js";
import { EditorGutter } from "../editorGutter.js";
import { CodeEditorView, TitleMenu, createSelectionsAutorun } from "./codeEditorView.js";
let BaseCodeEditorView = class extends CodeEditorView {
  constructor(viewModel, instantiationService, configurationService) {
    super(instantiationService, viewModel, configurationService);
    this.decorations = derived(this, (reader) => {
      const viewModel = this.viewModel.read(reader);
      if (!viewModel) {
        return [];
      }
      const model = viewModel.model;
      const textModel = model.base;
      const activeModifiedBaseRange = viewModel.activeModifiedBaseRange.read(reader);
      const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
      const showDeletionMarkers = this.showDeletionMarkers.read(reader);
      const result = [];
      for (const modifiedBaseRange of model.modifiedBaseRanges.read(reader)) {
        const range = modifiedBaseRange.baseRange;
        if (!range) {
          continue;
        }
        const isHandled = model.isHandled(modifiedBaseRange).read(reader);
        if (!modifiedBaseRange.isConflicting && isHandled && !showNonConflictingChanges) {
          continue;
        }
        const blockClassNames = ["merge-editor-block"];
        let blockPadding = [0, 0, 0, 0];
        if (isHandled) {
          blockClassNames.push("handled");
        }
        if (modifiedBaseRange === activeModifiedBaseRange) {
          blockClassNames.push("focused");
          blockPadding = [0, 2, 0, 2];
        }
        blockClassNames.push("base");
        const inputToDiffAgainst = viewModel.baseShowDiffAgainst.read(reader);
        if (inputToDiffAgainst) {
          for (const diff of modifiedBaseRange.getInputDiffs(inputToDiffAgainst)) {
            const range2 = diff.inputRange.toInclusiveRange();
            if (range2) {
              result.push({
                range: range2,
                options: {
                  className: `merge-editor-diff base`,
                  description: "Merge Editor",
                  isWholeLine: true
                }
              });
            }
            for (const diff2 of diff.rangeMappings) {
              if (showDeletionMarkers || !diff2.inputRange.isEmpty()) {
                result.push({
                  range: diff2.inputRange,
                  options: {
                    className: diff2.inputRange.isEmpty() ? `merge-editor-diff-empty-word base` : `merge-editor-diff-word base`,
                    description: "Merge Editor",
                    showIfCollapsed: true
                  }
                });
              }
            }
          }
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
      }
      return result;
    });
    this._register(
      createSelectionsAutorun(this, (baseRange, viewModel2) => baseRange)
    );
    this._register(
      instantiationService.createInstance(TitleMenu, MenuId.MergeBaseToolbar, this.htmlElements.title)
    );
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
    this._register(
      autorun((reader) => {
        const vm = this.viewModel.read(reader);
        if (!vm) {
          return;
        }
        this.editor.setModel(vm.model.base);
        reset(this.htmlElements.title, ...renderLabelWithIcons(localize("base", "Base")));
        const baseShowDiffAgainst = vm.baseShowDiffAgainst.read(reader);
        let node = void 0;
        if (baseShowDiffAgainst) {
          const label = localize("compareWith", "Comparing with {0}", baseShowDiffAgainst === 1 ? vm.model.input1.title : vm.model.input2.title);
          const tooltip = localize("compareWithTooltip", "Differences are highlighted with a background color.");
          node = h("span", { title: tooltip }, [label]).root;
        }
        reset(this.htmlElements.description, ...node ? [node] : []);
      })
    );
    this._register(applyObservableDecorations(this.editor, this.decorations));
  }
};
BaseCodeEditorView = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IConfigurationService)
], BaseCodeEditorView);
export {
  BaseCodeEditorView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFxlZGl0b3JzXFxiYXNlQ29kZUVkaXRvclZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBoLCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmVuZGVyTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIE1pbmltYXBQb3NpdGlvbiwgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGFwcGx5T2JzZXJ2YWJsZURlY29yYXRpb25zIH0gZnJvbSAnLi4vLi4vdXRpbHMuanMnO1xuaW1wb3J0IHsgaGFuZGxlZENvbmZsaWN0TWluaW1hcE92ZXJWaWV3UnVsZXJDb2xvciwgdW5oYW5kbGVkQ29uZmxpY3RNaW5pbWFwT3ZlclZpZXdSdWxlckNvbG9yIH0gZnJvbSAnLi4vY29sb3JzLmpzJztcbmltcG9ydCB7IEVkaXRvckd1dHRlciB9IGZyb20gJy4uL2VkaXRvckd1dHRlci5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yVmlldywgVGl0bGVNZW51LCBjcmVhdGVTZWxlY3Rpb25zQXV0b3J1biB9IGZyb20gJy4vY29kZUVkaXRvclZpZXcuanMnO1xuXG5leHBvcnQgY2xhc3MgQmFzZUNvZGVFZGl0b3JWaWV3IGV4dGVuZHMgQ29kZUVkaXRvclZpZXcge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHR2aWV3TW9kZWw6IElPYnNlcnZhYmxlPE1lcmdlRWRpdG9yVmlld01vZGVsIHwgdW5kZWZpbmVkPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpbnN0YW50aWF0aW9uU2VydmljZSwgdmlld01vZGVsLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGNyZWF0ZVNlbGVjdGlvbnNBdXRvcnVuKHRoaXMsIChiYXNlUmFuZ2UsIHZpZXdNb2RlbCkgPT4gYmFzZVJhbmdlKVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRpdGxlTWVudSwgTWVudUlkLk1lcmdlQmFzZVRvb2xiYXIsIHRoaXMuaHRtbEVsZW1lbnRzLnRpdGxlKVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgY2hlY2tib3hlcyAqL1xuXHRcdFx0XHRpZiAodGhpcy5jaGVja2JveGVzVmlzaWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQobmV3IEVkaXRvckd1dHRlcih0aGlzLmVkaXRvciwgdGhpcy5odG1sRWxlbWVudHMuZ3V0dGVyRGl2LCB7XG5cdFx0XHRcdFx0XHRnZXRJbnRlcnNlY3RpbmdHdXR0ZXJJdGVtczogKHJhbmdlLCByZWFkZXIpID0+IFtdLFxuXHRcdFx0XHRcdFx0Y3JlYXRlVmlldzogKGl0ZW0sIHRhcmdldCkgPT4geyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCk7IH0sXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgbGFiZWxzICYgdGV4dCBtb2RlbCAqL1xuXHRcdFx0XHRjb25zdCB2bSA9IHRoaXMudmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCF2bSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmVkaXRvci5zZXRNb2RlbCh2bS5tb2RlbC5iYXNlKTtcblx0XHRcdFx0cmVzZXQodGhpcy5odG1sRWxlbWVudHMudGl0bGUsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGxvY2FsaXplKCdiYXNlJywgJ0Jhc2UnKSkpO1xuXG5cdFx0XHRcdGNvbnN0IGJhc2VTaG93RGlmZkFnYWluc3QgPSB2bS5iYXNlU2hvd0RpZmZBZ2FpbnN0LnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRsZXQgbm9kZTogTm9kZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKGJhc2VTaG93RGlmZkFnYWluc3QpIHtcblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGxvY2FsaXplKCdjb21wYXJlV2l0aCcsICdDb21wYXJpbmcgd2l0aCB7MH0nLCBiYXNlU2hvd0RpZmZBZ2FpbnN0ID09PSAxID8gdm0ubW9kZWwuaW5wdXQxLnRpdGxlIDogdm0ubW9kZWwuaW5wdXQyLnRpdGxlKTtcblx0XHRcdFx0XHRjb25zdCB0b29sdGlwID0gbG9jYWxpemUoJ2NvbXBhcmVXaXRoVG9vbHRpcCcsICdEaWZmZXJlbmNlcyBhcmUgaGlnaGxpZ2h0ZWQgd2l0aCBhIGJhY2tncm91bmQgY29sb3IuJyk7XG5cdFx0XHRcdFx0bm9kZSA9IGgoJ3NwYW4nLCB7IHRpdGxlOiB0b29sdGlwIH0sIFtsYWJlbF0pLnJvb3Q7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzZXQodGhpcy5odG1sRWxlbWVudHMuZGVzY3JpcHRpb24sIC4uLihub2RlID8gW25vZGVdIDogW10pKTtcblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGx5T2JzZXJ2YWJsZURlY29yYXRpb25zKHRoaXMuZWRpdG9yLCB0aGlzLmRlY29yYXRpb25zKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlY29yYXRpb25zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMudmlld01vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHZpZXdNb2RlbC5tb2RlbDtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBtb2RlbC5iYXNlO1xuXG5cdFx0Y29uc3QgYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UgPSB2aWV3TW9kZWwuYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHNob3dOb25Db25mbGljdGluZ0NoYW5nZXMgPSB2aWV3TW9kZWwuc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgc2hvd0RlbGV0aW9uTWFya2VycyA9IHRoaXMuc2hvd0RlbGV0aW9uTWFya2Vycy5yZWFkKHJlYWRlcik7XG5cblx0XHRjb25zdCByZXN1bHQ6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBtb2RpZmllZEJhc2VSYW5nZSBvZiBtb2RlbC5tb2RpZmllZEJhc2VSYW5nZXMucmVhZChyZWFkZXIpKSB7XG5cblx0XHRcdGNvbnN0IHJhbmdlID0gbW9kaWZpZWRCYXNlUmFuZ2UuYmFzZVJhbmdlO1xuXHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNIYW5kbGVkID0gbW9kZWwuaXNIYW5kbGVkKG1vZGlmaWVkQmFzZVJhbmdlKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcgJiYgaXNIYW5kbGVkICYmICFzaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBibG9ja0NsYXNzTmFtZXMgPSBbJ21lcmdlLWVkaXRvci1ibG9jayddO1xuXHRcdFx0bGV0IGJsb2NrUGFkZGluZzogW3RvcDogbnVtYmVyLCByaWdodDogbnVtYmVyLCBib3R0b206IG51bWJlciwgbGVmdDogbnVtYmVyXSA9IFswLCAwLCAwLCAwXTtcblx0XHRcdGlmIChpc0hhbmRsZWQpIHtcblx0XHRcdFx0YmxvY2tDbGFzc05hbWVzLnB1c2goJ2hhbmRsZWQnKTtcblx0XHRcdH1cblx0XHRcdGlmIChtb2RpZmllZEJhc2VSYW5nZSA9PT0gYWN0aXZlTW9kaWZpZWRCYXNlUmFuZ2UpIHtcblx0XHRcdFx0YmxvY2tDbGFzc05hbWVzLnB1c2goJ2ZvY3VzZWQnKTtcblx0XHRcdFx0YmxvY2tQYWRkaW5nID0gWzAsIDIsIDAsIDJdO1xuXHRcdFx0fVxuXHRcdFx0YmxvY2tDbGFzc05hbWVzLnB1c2goJ2Jhc2UnKTtcblxuXHRcdFx0Y29uc3QgaW5wdXRUb0RpZmZBZ2FpbnN0ID0gdmlld01vZGVsLmJhc2VTaG93RGlmZkFnYWluc3QucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAoaW5wdXRUb0RpZmZBZ2FpbnN0KSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZGlmZiBvZiBtb2RpZmllZEJhc2VSYW5nZS5nZXRJbnB1dERpZmZzKGlucHV0VG9EaWZmQWdhaW5zdCkpIHtcblx0XHRcdFx0XHRjb25zdCByYW5nZSA9IGRpZmYuaW5wdXRSYW5nZS50b0luY2x1c2l2ZVJhbmdlKCk7XG5cdFx0XHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y2xhc3NOYW1lOiBgbWVyZ2UtZWRpdG9yLWRpZmYgYmFzZWAsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdNZXJnZSBFZGl0b3InLFxuXHRcdFx0XHRcdFx0XHRcdGlzV2hvbGVMaW5lOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRpZmYyIG9mIGRpZmYucmFuZ2VNYXBwaW5ncykge1xuXHRcdFx0XHRcdFx0aWYgKHNob3dEZWxldGlvbk1hcmtlcnMgfHwgIWRpZmYyLmlucHV0UmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRyYW5nZTogZGlmZjIuaW5wdXRSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRjbGFzc05hbWU6IGRpZmYyLmlucHV0UmFuZ2UuaXNFbXB0eSgpID8gYG1lcmdlLWVkaXRvci1kaWZmLWVtcHR5LXdvcmQgYmFzZWAgOiBgbWVyZ2UtZWRpdG9yLWRpZmYtd29yZCBiYXNlYCxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnTWVyZ2UgRWRpdG9yJyxcblx0XHRcdFx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRyYW5nZTogcmFuZ2UudG9JbmNsdXNpdmVSYW5nZU9yRW1wdHkoKSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRibG9ja0NsYXNzTmFtZTogYmxvY2tDbGFzc05hbWVzLmpvaW4oJyAnKSxcblx0XHRcdFx0XHRibG9ja1BhZGRpbmcsXG5cdFx0XHRcdFx0YmxvY2tJc0FmdGVyRW5kOiByYW5nZS5zdGFydExpbmVOdW1iZXIgPiB0ZXh0TW9kZWwuZ2V0TGluZUNvdW50KCksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdNZXJnZSBFZGl0b3InLFxuXHRcdFx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBNaW5pbWFwUG9zaXRpb24uR3V0dGVyLFxuXHRcdFx0XHRcdFx0Y29sb3I6IHsgaWQ6IGlzSGFuZGxlZCA/IGhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgOiB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG92ZXJ2aWV3UnVsZXI6IG1vZGlmaWVkQmFzZVJhbmdlLmlzQ29uZmxpY3RpbmcgPyB7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuQ2VudGVyLFxuXHRcdFx0XHRcdFx0Y29sb3I6IHsgaWQ6IGlzSGFuZGxlZCA/IGhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgOiB1bmhhbmRsZWRDb25mbGljdE1pbmltYXBPdmVyVmlld1J1bGVyQ29sb3IgfSxcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFHLGFBQWE7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBc0IsU0FBUyxrQkFBa0IsZUFBZTtBQUNoRSxTQUFnQyxpQkFBaUIseUJBQXlCO0FBQzFFLFNB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LDJDQUEyQztBQUFBLFlBQ2hIO0FBQUEsWUFDQSxlQUFlLGtCQUFrQixnQkFBZ0I7QUFBQSxjQUNoRCxVQUFVLGtCQUFrQjtBQUFBLGNBQzVCLE9BQU8sRUFBRSxJQUFJLFlBQVksMkNBQTJDLDJDQUEyQztBQUFBLFlBQ2hILElBQUk7QUFBQSxVQUNMO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFwSUEsU0FBSztBQUFBLE1BQ0osd0JBQXdCLE1BQU0sQ0FBQyxXQUFXQyxlQUFjLFNBQVM7QUFBQSxJQUNsRTtBQUVBLFNBQUs7QUFBQSxNQUNKLHFCQUFxQixlQUFlLFdBQVcsT0FBTyxrQkFBa0IsS0FBSyxhQUFhLEtBQUs7QUFBQSxJQUNoRztBQUVBLFNBQUs7QUFBQSxNQUNKLGlCQUFpQixDQUFDLFFBQVEsVUFBVTtBQUVuQyxZQUFJLEtBQUssa0JBQWtCLEtBQUssTUFBTSxHQUFHO0FBQ3hDLGdCQUFNLElBQUksSUFBSSxhQUFhLEtBQUssUUFBUSxLQUFLLGFBQWEsV0FBVztBQUFBLFlBQ3BFLDRCQUE0QixDQUFDLE9BQU9DLFlBQVcsQ0FBQztBQUFBLFlBQ2hELFlBQVksQ0FBQyxNQUFNLFdBQVc7QUFBRSxvQkFBTSxJQUFJLG1CQUFtQjtBQUFBLFlBQUc7QUFBQSxVQUNqRSxDQUFDLENBQUM7QUFBQSxRQUNIO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLFNBQUs7QUFBQSxNQUNKLFFBQVEsWUFBVTtBQUVqQixjQUFNLEtBQUssS0FBSyxVQUFVLEtBQUssTUFBTTtBQUNyQyxZQUFJLENBQUMsSUFBSTtBQUNSO0FBQUEsUUFDRDtBQUNBLGFBQUssT0FBTyxTQUFTLEdBQUcsTUFBTSxJQUFJO0FBQ2xDLGNBQU0sS0FBSyxhQUFhLE9BQU8sR0FBRyxxQkFBcUIsU0FBUyxRQUFRLE1BQU0sQ0FBQyxDQUFDO0FBRWhGLGNBQU0sc0JBQXNCLEdBQUcsb0JBQW9CLEtBQUssTUFBTTtBQUU5RCxZQUFJLE9BQXlCO0FBQzdCLFlBQUkscUJBQXFCO0FBQ3hCLGdCQUFNLFFBQVEsU0FBUyxlQUFlLHNCQUFzQix3QkFBd0IsSUFBSSxHQUFHLE1BQU0sT0FBTyxRQUFRLEdBQUcsTUFBTSxPQUFPLEtBQUs7QUFDckksZ0JBQU0sVUFBVSxTQUFTLHNCQUFzQixzREFBc0Q7QUFDckcsaUJBQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxRQUFRLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRTtBQUFBLFFBQy9DO0FBQ0EsY0FBTSxLQUFLLGFBQWEsYUFBYSxHQUFJLE9BQU8sQ0FBQyxJQUFJLElBQUksQ0FBQyxDQUFFO0FBQUEsTUFDN0QsQ0FBQztBQUFBLElBQ0Y7QUFFQSxTQUFLLFVBQVUsMkJBQTJCLEtBQUssUUFBUSxLQUFLLFdBQVcsQ0FBQztBQUFBLEVBQ3pFO0FBMEZEO0FBN0lhLHFCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogWyJyYW5nZSIsICJ2aWV3TW9kZWwiLCAicmVhZGVyIl0KfQo=
