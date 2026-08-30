import { $, h, isInShadowDOM, reset } from "../../../../../base/browser/dom.js";
import { createStyleSheet } from "../../../../../base/browser/domStylesheets.js";
import { renderLabelWithIcons } from "../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { hash } from "../../../../../base/common/hash.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun, derived, transaction } from "../../../../../base/common/observable.js";
import { EditorOption } from "../../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../../editor/common/config/fontInfo.js";
import { localize } from "../../../../../nls.js";
import { ModifiedBaseRangeState, ModifiedBaseRangeStateKind } from "../model/modifiedBaseRange.js";
import { FixedZoneWidget } from "./fixedZoneWidget.js";
class ConflictActionsFactory extends Disposable {
  constructor(_editor) {
    super();
    this._editor = _editor;
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.codeLensFontSize) || e.hasChanged(EditorOption.codeLensFontFamily)) {
        this._updateLensStyle();
      }
    }));
    this._styleClassName = "_conflictActionsFactory_" + hash(this._editor.getId()).toString(16);
    this._styleElement = createStyleSheet(
      isInShadowDOM(this._editor.getContainerDomNode()) ? this._editor.getContainerDomNode() : void 0,
      void 0,
      this._store
    );
    this._updateLensStyle();
  }
  _updateLensStyle() {
    const { codeLensHeight, fontSize } = this._getLayoutInfo();
    const fontFamily = this._editor.getOption(EditorOption.codeLensFontFamily);
    const editorFontInfo = this._editor.getOption(EditorOption.fontInfo);
    const fontFamilyVar = `--codelens-font-family${this._styleClassName}`;
    const fontFeaturesVar = `--codelens-font-features${this._styleClassName}`;
    let newStyle = `
		.${this._styleClassName} { line-height: ${codeLensHeight}px; font-size: ${fontSize}px; padding-right: ${Math.round(fontSize * 0.5)}px; font-feature-settings: var(${fontFeaturesVar}) }
		.monaco-workbench .${this._styleClassName} span.codicon { line-height: ${codeLensHeight}px; font-size: ${fontSize}px; }
		`;
    if (fontFamily) {
      newStyle += `${this._styleClassName} { font-family: var(${fontFamilyVar}), ${EDITOR_FONT_DEFAULTS.fontFamily}}`;
    }
    this._styleElement.textContent = newStyle;
    this._editor.getContainerDomNode().style?.setProperty(fontFamilyVar, fontFamily ?? "inherit");
    this._editor.getContainerDomNode().style?.setProperty(fontFeaturesVar, editorFontInfo.fontFeatureSettings);
  }
  _getLayoutInfo() {
    const lineHeightFactor = Math.max(1.3, this._editor.getOption(EditorOption.lineHeight) / this._editor.getOption(EditorOption.fontSize));
    let fontSize = this._editor.getOption(EditorOption.codeLensFontSize);
    if (!fontSize || fontSize < 5) {
      fontSize = this._editor.getOption(EditorOption.fontSize) * 0.9 | 0;
    }
    return {
      fontSize,
      codeLensHeight: fontSize * lineHeightFactor | 0
    };
  }
  createWidget(viewZoneChangeAccessor, lineNumber, items, viewZoneIdsToCleanUp) {
    const layoutInfo = this._getLayoutInfo();
    return new ActionsContentWidget(
      this._editor,
      viewZoneChangeAccessor,
      lineNumber,
      layoutInfo.codeLensHeight + 2,
      this._styleClassName,
      items,
      viewZoneIdsToCleanUp
    );
  }
}
class ActionsSource {
  constructor(viewModel, modifiedBaseRange) {
    this.viewModel = viewModel;
    this.modifiedBaseRange = modifiedBaseRange;
    this.itemsInput1 = this.getItemsInput(1);
    this.itemsInput2 = this.getItemsInput(2);
    this.resultItems = derived(this, (reader) => {
      const viewModel = this.viewModel;
      const modifiedBaseRange = this.modifiedBaseRange;
      const state = viewModel.model.getState(modifiedBaseRange).read(reader);
      const model = viewModel.model;
      const result = [];
      if (state.kind === ModifiedBaseRangeStateKind.unrecognized) {
        result.push({
          text: localize("manualResolution", "Manual Resolution"),
          tooltip: localize("manualResolutionTooltip", "This conflict has been resolved manually.")
        });
      } else if (state.kind === ModifiedBaseRangeStateKind.base) {
        result.push({
          text: localize("noChangesAccepted", "No Changes Accepted"),
          tooltip: localize(
            "noChangesAcceptedTooltip",
            "The current resolution of this conflict equals the common ancestor of both the right and left changes."
          )
        });
      } else {
        const labels = [];
        if (state.includesInput1) {
          labels.push(model.input1.title);
        }
        if (state.includesInput2) {
          labels.push(model.input2.title);
        }
        if (state.kind === ModifiedBaseRangeStateKind.both && state.firstInput === 2) {
          labels.reverse();
        }
        result.push({
          text: `${labels.join(" + ")}`
        });
      }
      const stateToggles = [];
      if (state.includesInput1) {
        stateToggles.push(
          command(
            localize("remove", "Remove {0}", model.input1.title),
            async () => {
              transaction((tx) => {
                model.setState(
                  modifiedBaseRange,
                  state.withInputValue(1, false),
                  true,
                  tx
                );
                model.telemetry.reportRemoveInvoked(1, state.includesInput(2));
              });
            },
            localize("removeTooltip", "Remove {0} from the result document.", model.input1.title)
          )
        );
      }
      if (state.includesInput2) {
        stateToggles.push(
          command(
            localize("remove", "Remove {0}", model.input2.title),
            async () => {
              transaction((tx) => {
                model.setState(
                  modifiedBaseRange,
                  state.withInputValue(2, false),
                  true,
                  tx
                );
                model.telemetry.reportRemoveInvoked(2, state.includesInput(1));
              });
            },
            localize("removeTooltip", "Remove {0} from the result document.", model.input2.title)
          )
        );
      }
      if (state.kind === ModifiedBaseRangeStateKind.both && state.firstInput === 2) {
        stateToggles.reverse();
      }
      result.push(...stateToggles);
      if (state.kind === ModifiedBaseRangeStateKind.unrecognized) {
        result.push(
          command(
            localize("resetToBase", "Reset to base"),
            async () => {
              transaction((tx) => {
                model.setState(
                  modifiedBaseRange,
                  ModifiedBaseRangeState.base,
                  true,
                  tx
                );
                model.telemetry.reportResetToBaseInvoked();
              });
            },
            localize("resetToBaseTooltip", "Reset this conflict to the common ancestor of both the right and left changes.")
          )
        );
      }
      return result;
    });
    this.isEmpty = derived(this, (reader) => {
      return this.itemsInput1.read(reader).length + this.itemsInput2.read(reader).length + this.resultItems.read(reader).length === 0;
    });
    this.inputIsEmpty = derived(this, (reader) => {
      return this.itemsInput1.read(reader).length + this.itemsInput2.read(reader).length === 0;
    });
  }
  getItemsInput(inputNumber) {
    return derived((reader) => {
      const viewModel = this.viewModel;
      const modifiedBaseRange = this.modifiedBaseRange;
      if (!viewModel.model.hasBaseRange(modifiedBaseRange)) {
        return [];
      }
      const state = viewModel.model.getState(modifiedBaseRange).read(reader);
      const handled = viewModel.model.isHandled(modifiedBaseRange).read(reader);
      const model = viewModel.model;
      const result = [];
      const inputData = inputNumber === 1 ? viewModel.model.input1 : viewModel.model.input2;
      const showNonConflictingChanges = viewModel.showNonConflictingChanges.read(reader);
      if (!modifiedBaseRange.isConflicting && handled && !showNonConflictingChanges) {
        return [];
      }
      const otherInputNumber = inputNumber === 1 ? 2 : 1;
      if (state.kind !== ModifiedBaseRangeStateKind.unrecognized && !state.isInputIncluded(inputNumber)) {
        if (!state.isInputIncluded(otherInputNumber) || !this.viewModel.shouldUseAppendInsteadOfAccept.read(reader)) {
          result.push(
            command(localize("accept", "Accept {0}", inputData.title), async () => {
              transaction((tx) => {
                model.setState(
                  modifiedBaseRange,
                  state.withInputValue(inputNumber, true, false),
                  inputNumber,
                  tx
                );
                model.telemetry.reportAcceptInvoked(inputNumber, state.includesInput(otherInputNumber));
              });
            }, localize("acceptTooltip", "Accept {0} in the result document.", inputData.title))
          );
          if (modifiedBaseRange.canBeCombined) {
            const commandName = modifiedBaseRange.isOrderRelevant ? localize("acceptBoth0First", "Accept Combination ({0} First)", inputData.title) : localize("acceptBoth", "Accept Combination");
            result.push(
              command(commandName, async () => {
                transaction((tx) => {
                  model.setState(
                    modifiedBaseRange,
                    ModifiedBaseRangeState.base.withInputValue(inputNumber, true).withInputValue(otherInputNumber, true, true),
                    true,
                    tx
                  );
                  model.telemetry.reportSmartCombinationInvoked(state.includesInput(otherInputNumber));
                });
              }, localize("acceptBothTooltip", "Accept an automatic combination of both sides in the result document."))
            );
          }
        } else {
          result.push(
            command(localize("append", "Append {0}", inputData.title), async () => {
              transaction((tx) => {
                model.setState(
                  modifiedBaseRange,
                  state.withInputValue(inputNumber, true, false),
                  inputNumber,
                  tx
                );
                model.telemetry.reportAcceptInvoked(inputNumber, state.includesInput(otherInputNumber));
              });
            }, localize("appendTooltip", "Append {0} to the result document.", inputData.title))
          );
          if (modifiedBaseRange.canBeCombined) {
            result.push(
              command(localize("combine", "Accept Combination", inputData.title), async () => {
                transaction((tx) => {
                  model.setState(
                    modifiedBaseRange,
                    state.withInputValue(inputNumber, true, true),
                    inputNumber,
                    tx
                  );
                  model.telemetry.reportSmartCombinationInvoked(state.includesInput(otherInputNumber));
                });
              }, localize("acceptBothTooltip", "Accept an automatic combination of both sides in the result document."))
            );
          }
        }
        if (!model.isInputHandled(modifiedBaseRange, inputNumber).read(reader)) {
          result.push(
            command(
              localize("ignore", "Ignore"),
              async () => {
                transaction((tx) => {
                  model.setInputHandled(modifiedBaseRange, inputNumber, true, tx);
                });
              },
              localize("markAsHandledTooltip", "Don't take this side of the conflict.")
            )
          );
        }
      }
      return result;
    });
  }
}
function command(title, action, tooltip) {
  return {
    text: title,
    action,
    tooltip
  };
}
class ActionsContentWidget extends FixedZoneWidget {
  constructor(editor, viewZoneAccessor, afterLineNumber, height, className, items, viewZoneIdsToCleanUp) {
    super(editor, viewZoneAccessor, afterLineNumber, height, viewZoneIdsToCleanUp);
    this._domNode = h("div.merge-editor-conflict-actions").root;
    this.widgetDomNode.appendChild(this._domNode);
    this._domNode.classList.add(className);
    this._register(autorun((reader) => {
      const i = items.read(reader);
      this.setState(i);
    }));
  }
  setState(items) {
    const children = [];
    let isFirst = true;
    for (const item of items) {
      if (isFirst) {
        isFirst = false;
      } else {
        children.push($("span", void 0, "\xA0|\xA0"));
      }
      const title = renderLabelWithIcons(item.text);
      if (item.action) {
        children.push($("a", { title: item.tooltip, role: "button", onclick: () => item.action() }, ...title));
      } else {
        children.push($("span", { title: item.tooltip }, ...title));
      }
    }
    reset(this._domNode, ...children);
  }
}
export {
  ActionsSource,
  ConflictActionsFactory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFxjb25mbGljdEFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBoLCBpc0luU2hhZG93RE9NLCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJVmlld1pvbmVDaGFuZ2VBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRk9OVF9ERUZBVUxUUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1vZGlmaWVkQmFzZVJhbmdlLCBNb2RpZmllZEJhc2VSYW5nZVN0YXRlLCBNb2RpZmllZEJhc2VSYW5nZVN0YXRlS2luZCB9IGZyb20gJy4uL21vZGVsL21vZGlmaWVkQmFzZVJhbmdlLmpzJztcbmltcG9ydCB7IEZpeGVkWm9uZVdpZGdldCB9IGZyb20gJy4vZml4ZWRab25lV2lkZ2V0LmpzJztcbmltcG9ydCB7IE1lcmdlRWRpdG9yVmlld01vZGVsIH0gZnJvbSAnLi92aWV3TW9kZWwuanMnO1xuXG5leHBvcnQgY2xhc3MgQ29uZmxpY3RBY3Rpb25zRmFjdG9yeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZUNsYXNzTmFtZTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZUVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb250SW5mbykgfHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5jb2RlTGVuc0ZvbnRTaXplKSB8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udEZhbWlseSkpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlTGVuc1N0eWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fc3R5bGVDbGFzc05hbWUgPSAnX2NvbmZsaWN0QWN0aW9uc0ZhY3RvcnlfJyArIGhhc2godGhpcy5fZWRpdG9yLmdldElkKCkpLnRvU3RyaW5nKDE2KTtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQgPSBjcmVhdGVTdHlsZVNoZWV0KFxuXHRcdFx0aXNJblNoYWRvd0RPTSh0aGlzLl9lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpKVxuXHRcdFx0XHQ/IHRoaXMuX2VkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKClcblx0XHRcdFx0OiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmVcblx0XHQpO1xuXG5cdFx0dGhpcy5fdXBkYXRlTGVuc1N0eWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVMZW5zU3R5bGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBjb2RlTGVuc0hlaWdodCwgZm9udFNpemUgfSA9IHRoaXMuX2dldExheW91dEluZm8oKTtcblx0XHRjb25zdCBmb250RmFtaWx5ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uY29kZUxlbnNGb250RmFtaWx5KTtcblx0XHRjb25zdCBlZGl0b3JGb250SW5mbyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblxuXHRcdGNvbnN0IGZvbnRGYW1pbHlWYXIgPSBgLS1jb2RlbGVucy1mb250LWZhbWlseSR7dGhpcy5fc3R5bGVDbGFzc05hbWV9YDtcblx0XHRjb25zdCBmb250RmVhdHVyZXNWYXIgPSBgLS1jb2RlbGVucy1mb250LWZlYXR1cmVzJHt0aGlzLl9zdHlsZUNsYXNzTmFtZX1gO1xuXG5cdFx0bGV0IG5ld1N0eWxlID0gYFxuXHRcdC4ke3RoaXMuX3N0eWxlQ2xhc3NOYW1lfSB7IGxpbmUtaGVpZ2h0OiAke2NvZGVMZW5zSGVpZ2h0fXB4OyBmb250LXNpemU6ICR7Zm9udFNpemV9cHg7IHBhZGRpbmctcmlnaHQ6ICR7TWF0aC5yb3VuZChmb250U2l6ZSAqIDAuNSl9cHg7IGZvbnQtZmVhdHVyZS1zZXR0aW5nczogdmFyKCR7Zm9udEZlYXR1cmVzVmFyfSkgfVxuXHRcdC5tb25hY28td29ya2JlbmNoIC4ke3RoaXMuX3N0eWxlQ2xhc3NOYW1lfSBzcGFuLmNvZGljb24geyBsaW5lLWhlaWdodDogJHtjb2RlTGVuc0hlaWdodH1weDsgZm9udC1zaXplOiAke2ZvbnRTaXplfXB4OyB9XG5cdFx0YDtcblx0XHRpZiAoZm9udEZhbWlseSkge1xuXHRcdFx0bmV3U3R5bGUgKz0gYCR7dGhpcy5fc3R5bGVDbGFzc05hbWV9IHsgZm9udC1mYW1pbHk6IHZhcigke2ZvbnRGYW1pbHlWYXJ9KSwgJHtFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5fX1gO1xuXHRcdH1cblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQudGV4dENvbnRlbnQgPSBuZXdTdHlsZTtcblx0XHR0aGlzLl9lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLnN0eWxlPy5zZXRQcm9wZXJ0eShmb250RmFtaWx5VmFyLCBmb250RmFtaWx5ID8/ICdpbmhlcml0Jyk7XG5cdFx0dGhpcy5fZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKS5zdHlsZT8uc2V0UHJvcGVydHkoZm9udEZlYXR1cmVzVmFyLCBlZGl0b3JGb250SW5mby5mb250RmVhdHVyZVNldHRpbmdzKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldExheW91dEluZm8oKSB7XG5cdFx0Y29uc3QgbGluZUhlaWdodEZhY3RvciA9IE1hdGgubWF4KDEuMywgdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgLyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSkpO1xuXHRcdGxldCBmb250U2l6ZSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmNvZGVMZW5zRm9udFNpemUpO1xuXHRcdGlmICghZm9udFNpemUgfHwgZm9udFNpemUgPCA1KSB7XG5cdFx0XHRmb250U2l6ZSA9ICh0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSkgKiAuOSkgfCAwO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9udFNpemUsXG5cdFx0XHRjb2RlTGVuc0hlaWdodDogKGZvbnRTaXplICogbGluZUhlaWdodEZhY3RvcikgfCAwLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlV2lkZ2V0KHZpZXdab25lQ2hhbmdlQWNjZXNzb3I6IElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yLCBsaW5lTnVtYmVyOiBudW1iZXIsIGl0ZW1zOiBJT2JzZXJ2YWJsZTxJQ29udGVudFdpZGdldEFjdGlvbltdPiwgdmlld1pvbmVJZHNUb0NsZWFuVXA6IHN0cmluZ1tdKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9nZXRMYXlvdXRJbmZvKCk7XG5cdFx0cmV0dXJuIG5ldyBBY3Rpb25zQ29udGVudFdpZGdldChcblx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdHZpZXdab25lQ2hhbmdlQWNjZXNzb3IsXG5cdFx0XHRsaW5lTnVtYmVyLFxuXHRcdFx0bGF5b3V0SW5mby5jb2RlTGVuc0hlaWdodCArIDIsXG5cdFx0XHR0aGlzLl9zdHlsZUNsYXNzTmFtZSxcblx0XHRcdGl0ZW1zLFxuXHRcdFx0dmlld1pvbmVJZHNUb0NsZWFuVXAsXG5cdFx0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQWN0aW9uc1NvdXJjZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsOiBNZXJnZUVkaXRvclZpZXdNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGlmaWVkQmFzZVJhbmdlOiBNb2RpZmllZEJhc2VSYW5nZSxcblx0KSB7XG5cdH1cblxuXHRwcml2YXRlIGdldEl0ZW1zSW5wdXQoaW5wdXROdW1iZXI6IDEgfCAyKTogSU9ic2VydmFibGU8SUNvbnRlbnRXaWRnZXRBY3Rpb25bXT4ge1xuXHRcdHJldHVybiBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIGl0ZW1zICovXG5cdFx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbDtcblx0XHRcdGNvbnN0IG1vZGlmaWVkQmFzZVJhbmdlID0gdGhpcy5tb2RpZmllZEJhc2VSYW5nZTtcblxuXHRcdFx0aWYgKCF2aWV3TW9kZWwubW9kZWwuaGFzQmFzZVJhbmdlKG1vZGlmaWVkQmFzZVJhbmdlKSkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gdmlld01vZGVsLm1vZGVsLmdldFN0YXRlKG1vZGlmaWVkQmFzZVJhbmdlKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBoYW5kbGVkID0gdmlld01vZGVsLm1vZGVsLmlzSGFuZGxlZChtb2RpZmllZEJhc2VSYW5nZSkucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB2aWV3TW9kZWwubW9kZWw7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSUNvbnRlbnRXaWRnZXRBY3Rpb25bXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBpbnB1dERhdGEgPSBpbnB1dE51bWJlciA9PT0gMSA/IHZpZXdNb2RlbC5tb2RlbC5pbnB1dDEgOiB2aWV3TW9kZWwubW9kZWwuaW5wdXQyO1xuXHRcdFx0Y29uc3Qgc2hvd05vbkNvbmZsaWN0aW5nQ2hhbmdlcyA9IHZpZXdNb2RlbC5zaG93Tm9uQ29uZmxpY3RpbmdDaGFuZ2VzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0aWYgKCFtb2RpZmllZEJhc2VSYW5nZS5pc0NvbmZsaWN0aW5nICYmIGhhbmRsZWQgJiYgIXNob3dOb25Db25mbGljdGluZ0NoYW5nZXMpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvdGhlcklucHV0TnVtYmVyID0gaW5wdXROdW1iZXIgPT09IDEgPyAyIDogMTtcblxuXHRcdFx0aWYgKHN0YXRlLmtpbmQgIT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLnVucmVjb2duaXplZCAmJiAhc3RhdGUuaXNJbnB1dEluY2x1ZGVkKGlucHV0TnVtYmVyKSkge1xuXHRcdFx0XHRpZiAoIXN0YXRlLmlzSW5wdXRJbmNsdWRlZChvdGhlcklucHV0TnVtYmVyKSB8fCAhdGhpcy52aWV3TW9kZWwuc2hvdWxkVXNlQXBwZW5kSW5zdGVhZE9mQWNjZXB0LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFxuXHRcdFx0XHRcdFx0Y29tbWFuZChsb2NhbGl6ZSgnYWNjZXB0JywgXCJBY2NlcHQgezB9XCIsIGlucHV0RGF0YS50aXRsZSksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0bW9kZWwuc2V0U3RhdGUoXG5cdFx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZEJhc2VSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXRlLndpdGhJbnB1dFZhbHVlKGlucHV0TnVtYmVyLCB0cnVlLCBmYWxzZSksXG5cdFx0XHRcdFx0XHRcdFx0XHRpbnB1dE51bWJlcixcblx0XHRcdFx0XHRcdFx0XHRcdHR4XG5cdFx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0XHRtb2RlbC50ZWxlbWV0cnkucmVwb3J0QWNjZXB0SW52b2tlZChpbnB1dE51bWJlciwgc3RhdGUuaW5jbHVkZXNJbnB1dChvdGhlcklucHV0TnVtYmVyKSk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSwgbG9jYWxpemUoJ2FjY2VwdFRvb2x0aXAnLCBcIkFjY2VwdCB7MH0gaW4gdGhlIHJlc3VsdCBkb2N1bWVudC5cIiwgaW5wdXREYXRhLnRpdGxlKSlcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0aWYgKG1vZGlmaWVkQmFzZVJhbmdlLmNhbkJlQ29tYmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbW1hbmROYW1lID0gbW9kaWZpZWRCYXNlUmFuZ2UuaXNPcmRlclJlbGV2YW50XG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FjY2VwdEJvdGgwRmlyc3QnLCBcIkFjY2VwdCBDb21iaW5hdGlvbiAoezB9IEZpcnN0KVwiLCBpbnB1dERhdGEudGl0bGUpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2FjY2VwdEJvdGgnLCBcIkFjY2VwdCBDb21iaW5hdGlvblwiKTtcblxuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQoY29tbWFuZE5hbWUsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0cmFuc2FjdGlvbigodHgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZGVsLnNldFN0YXRlKFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZEJhc2VSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0TW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZS5iYXNlXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0LndpdGhJbnB1dFZhbHVlKGlucHV0TnVtYmVyLCB0cnVlKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdC53aXRoSW5wdXRWYWx1ZShvdGhlcklucHV0TnVtYmVyLCB0cnVlLCB0cnVlKSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHhcblx0XHRcdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRtb2RlbC50ZWxlbWV0cnkucmVwb3J0U21hcnRDb21iaW5hdGlvbkludm9rZWQoc3RhdGUuaW5jbHVkZXNJbnB1dChvdGhlcklucHV0TnVtYmVyKSk7XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH0sIGxvY2FsaXplKCdhY2NlcHRCb3RoVG9vbHRpcCcsIFwiQWNjZXB0IGFuIGF1dG9tYXRpYyBjb21iaW5hdGlvbiBvZiBib3RoIHNpZGVzIGluIHRoZSByZXN1bHQgZG9jdW1lbnQuXCIpKSxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKFxuXHRcdFx0XHRcdFx0Y29tbWFuZChsb2NhbGl6ZSgnYXBwZW5kJywgXCJBcHBlbmQgezB9XCIsIGlucHV0RGF0YS50aXRsZSksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0bW9kZWwuc2V0U3RhdGUoXG5cdFx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZEJhc2VSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXRlLndpdGhJbnB1dFZhbHVlKGlucHV0TnVtYmVyLCB0cnVlLCBmYWxzZSksXG5cdFx0XHRcdFx0XHRcdFx0XHRpbnB1dE51bWJlcixcblx0XHRcdFx0XHRcdFx0XHRcdHR4XG5cdFx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0XHRtb2RlbC50ZWxlbWV0cnkucmVwb3J0QWNjZXB0SW52b2tlZChpbnB1dE51bWJlciwgc3RhdGUuaW5jbHVkZXNJbnB1dChvdGhlcklucHV0TnVtYmVyKSk7XG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSwgbG9jYWxpemUoJ2FwcGVuZFRvb2x0aXAnLCBcIkFwcGVuZCB7MH0gdG8gdGhlIHJlc3VsdCBkb2N1bWVudC5cIiwgaW5wdXREYXRhLnRpdGxlKSlcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0aWYgKG1vZGlmaWVkQmFzZVJhbmdlLmNhbkJlQ29tYmluZWQpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kKGxvY2FsaXplKCdjb21iaW5lJywgXCJBY2NlcHQgQ29tYmluYXRpb25cIiwgaW5wdXREYXRhLnRpdGxlKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0bW9kZWwuc2V0U3RhdGUoXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1vZGlmaWVkQmFzZVJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzdGF0ZS53aXRoSW5wdXRWYWx1ZShpbnB1dE51bWJlciwgdHJ1ZSwgdHJ1ZSksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlucHV0TnVtYmVyLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eFxuXHRcdFx0XHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdFx0XHRcdG1vZGVsLnRlbGVtZXRyeS5yZXBvcnRTbWFydENvbWJpbmF0aW9uSW52b2tlZChzdGF0ZS5pbmNsdWRlc0lucHV0KG90aGVySW5wdXROdW1iZXIpKTtcblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fSwgbG9jYWxpemUoJ2FjY2VwdEJvdGhUb29sdGlwJywgXCJBY2NlcHQgYW4gYXV0b21hdGljIGNvbWJpbmF0aW9uIG9mIGJvdGggc2lkZXMgaW4gdGhlIHJlc3VsdCBkb2N1bWVudC5cIikpLFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIW1vZGVsLmlzSW5wdXRIYW5kbGVkKG1vZGlmaWVkQmFzZVJhbmdlLCBpbnB1dE51bWJlcikucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goXG5cdFx0XHRcdFx0XHRjb21tYW5kKFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgnaWdub3JlJywgJ0lnbm9yZScpLFxuXHRcdFx0XHRcdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRtb2RlbC5zZXRJbnB1dEhhbmRsZWQobW9kaWZpZWRCYXNlUmFuZ2UsIGlucHV0TnVtYmVyLCB0cnVlLCB0eCk7XG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdtYXJrQXNIYW5kbGVkVG9vbHRpcCcsIFwiRG9uJ3QgdGFrZSB0aGlzIHNpZGUgb2YgdGhlIGNvbmZsaWN0LlwiKVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBpdGVtc0lucHV0MSA9IHRoaXMuZ2V0SXRlbXNJbnB1dCgxKTtcblx0cHVibGljIHJlYWRvbmx5IGl0ZW1zSW5wdXQyID0gdGhpcy5nZXRJdGVtc0lucHV0KDIpO1xuXG5cdHB1YmxpYyByZWFkb25seSByZXN1bHRJdGVtcyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbDtcblx0XHRjb25zdCBtb2RpZmllZEJhc2VSYW5nZSA9IHRoaXMubW9kaWZpZWRCYXNlUmFuZ2U7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHZpZXdNb2RlbC5tb2RlbC5nZXRTdGF0ZShtb2RpZmllZEJhc2VSYW5nZSkucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IG1vZGVsID0gdmlld01vZGVsLm1vZGVsO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJQ29udGVudFdpZGdldEFjdGlvbltdID0gW107XG5cblx0XHRpZiAoc3RhdGUua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHRleHQ6IGxvY2FsaXplKCdtYW51YWxSZXNvbHV0aW9uJywgXCJNYW51YWwgUmVzb2x1dGlvblwiKSxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ21hbnVhbFJlc29sdXRpb25Ub29sdGlwJywgXCJUaGlzIGNvbmZsaWN0IGhhcyBiZWVuIHJlc29sdmVkIG1hbnVhbGx5LlwiKSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoc3RhdGUua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQuYmFzZSkge1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHR0ZXh0OiBsb2NhbGl6ZSgnbm9DaGFuZ2VzQWNjZXB0ZWQnLCAnTm8gQ2hhbmdlcyBBY2NlcHRlZCcpLFxuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZShcblx0XHRcdFx0XHQnbm9DaGFuZ2VzQWNjZXB0ZWRUb29sdGlwJyxcblx0XHRcdFx0XHQnVGhlIGN1cnJlbnQgcmVzb2x1dGlvbiBvZiB0aGlzIGNvbmZsaWN0IGVxdWFscyB0aGUgY29tbW9uIGFuY2VzdG9yIG9mIGJvdGggdGhlIHJpZ2h0IGFuZCBsZWZ0IGNoYW5nZXMuJ1xuXHRcdFx0XHQpLFxuXHRcdFx0fSk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gW107XG5cdFx0XHRpZiAoc3RhdGUuaW5jbHVkZXNJbnB1dDEpIHtcblx0XHRcdFx0bGFiZWxzLnB1c2gobW9kZWwuaW5wdXQxLnRpdGxlKTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS5pbmNsdWRlc0lucHV0Mikge1xuXHRcdFx0XHRsYWJlbHMucHVzaChtb2RlbC5pbnB1dDIudGl0bGUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmJvdGggJiYgc3RhdGUuZmlyc3RJbnB1dCA9PT0gMikge1xuXHRcdFx0XHRsYWJlbHMucmV2ZXJzZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHR0ZXh0OiBgJHtsYWJlbHMuam9pbignICsgJyl9YFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGVUb2dnbGVzOiBJQ29udGVudFdpZGdldEFjdGlvbltdID0gW107XG5cdFx0aWYgKHN0YXRlLmluY2x1ZGVzSW5wdXQxKSB7XG5cdFx0XHRzdGF0ZVRvZ2dsZXMucHVzaChcblx0XHRcdFx0Y29tbWFuZChcblx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3ZlJywgJ1JlbW92ZSB7MH0nLCBtb2RlbC5pbnB1dDEudGl0bGUpLFxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRtb2RlbC5zZXRTdGF0ZShcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZEJhc2VSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRzdGF0ZS53aXRoSW5wdXRWYWx1ZSgxLCBmYWxzZSksXG5cdFx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHR0eFxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRtb2RlbC50ZWxlbWV0cnkucmVwb3J0UmVtb3ZlSW52b2tlZCgxLCBzdGF0ZS5pbmNsdWRlc0lucHV0KDIpKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3JlbW92ZVRvb2x0aXAnLCAnUmVtb3ZlIHswfSBmcm9tIHRoZSByZXN1bHQgZG9jdW1lbnQuJywgbW9kZWwuaW5wdXQxLnRpdGxlKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoc3RhdGUuaW5jbHVkZXNJbnB1dDIpIHtcblx0XHRcdHN0YXRlVG9nZ2xlcy5wdXNoKFxuXHRcdFx0XHRjb21tYW5kKFxuXHRcdFx0XHRcdGxvY2FsaXplKCdyZW1vdmUnLCAnUmVtb3ZlIHswfScsIG1vZGVsLmlucHV0Mi50aXRsZSksXG5cdFx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHRcdFx0XHRcdG1vZGVsLnNldFN0YXRlKFxuXHRcdFx0XHRcdFx0XHRcdG1vZGlmaWVkQmFzZVJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdHN0YXRlLndpdGhJbnB1dFZhbHVlKDIsIGZhbHNlKSxcblx0XHRcdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdHR4XG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdG1vZGVsLnRlbGVtZXRyeS5yZXBvcnRSZW1vdmVJbnZva2VkKDIsIHN0YXRlLmluY2x1ZGVzSW5wdXQoMSkpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgncmVtb3ZlVG9vbHRpcCcsICdSZW1vdmUgezB9IGZyb20gdGhlIHJlc3VsdCBkb2N1bWVudC4nLCBtb2RlbC5pbnB1dDIudGl0bGUpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmIChcblx0XHRcdHN0YXRlLmtpbmQgPT09IE1vZGlmaWVkQmFzZVJhbmdlU3RhdGVLaW5kLmJvdGggJiZcblx0XHRcdHN0YXRlLmZpcnN0SW5wdXQgPT09IDJcblx0XHQpIHtcblx0XHRcdHN0YXRlVG9nZ2xlcy5yZXZlcnNlKCk7XG5cdFx0fVxuXHRcdHJlc3VsdC5wdXNoKC4uLnN0YXRlVG9nZ2xlcyk7XG5cblx0XHRpZiAoc3RhdGUua2luZCA9PT0gTW9kaWZpZWRCYXNlUmFuZ2VTdGF0ZUtpbmQudW5yZWNvZ25pemVkKSB7XG5cdFx0XHRyZXN1bHQucHVzaChcblx0XHRcdFx0Y29tbWFuZChcblx0XHRcdFx0XHRsb2NhbGl6ZSgncmVzZXRUb0Jhc2UnLCAnUmVzZXQgdG8gYmFzZScpLFxuXHRcdFx0XHRcdGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRtb2RlbC5zZXRTdGF0ZShcblx0XHRcdFx0XHRcdFx0XHRtb2RpZmllZEJhc2VSYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRNb2RpZmllZEJhc2VSYW5nZVN0YXRlLmJhc2UsXG5cdFx0XHRcdFx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHR0eFxuXHRcdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0XHRtb2RlbC50ZWxlbWV0cnkucmVwb3J0UmVzZXRUb0Jhc2VJbnZva2VkKCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGxvY2FsaXplKCdyZXNldFRvQmFzZVRvb2x0aXAnLCAnUmVzZXQgdGhpcyBjb25mbGljdCB0byB0aGUgY29tbW9uIGFuY2VzdG9yIG9mIGJvdGggdGhlIHJpZ2h0IGFuZCBsZWZ0IGNoYW5nZXMuJylcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNFbXB0eSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRyZXR1cm4gdGhpcy5pdGVtc0lucHV0MS5yZWFkKHJlYWRlcikubGVuZ3RoICsgdGhpcy5pdGVtc0lucHV0Mi5yZWFkKHJlYWRlcikubGVuZ3RoICsgdGhpcy5yZXN1bHRJdGVtcy5yZWFkKHJlYWRlcikubGVuZ3RoID09PSAwO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaW5wdXRJc0VtcHR5ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdHJldHVybiB0aGlzLml0ZW1zSW5wdXQxLnJlYWQocmVhZGVyKS5sZW5ndGggKyB0aGlzLml0ZW1zSW5wdXQyLnJlYWQocmVhZGVyKS5sZW5ndGggPT09IDA7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjb21tYW5kKHRpdGxlOiBzdHJpbmcsIGFjdGlvbjogKCkgPT4gUHJvbWlzZTx2b2lkPiwgdG9vbHRpcD86IHN0cmluZyk6IElDb250ZW50V2lkZ2V0QWN0aW9uIHtcblx0cmV0dXJuIHtcblx0XHR0ZXh0OiB0aXRsZSxcblx0XHRhY3Rpb24sXG5cdFx0dG9vbHRpcCxcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29udGVudFdpZGdldEFjdGlvbiB7XG5cdHRleHQ6IHN0cmluZztcblx0dG9vbHRpcD86IHN0cmluZztcblx0YWN0aW9uPzogKCkgPT4gUHJvbWlzZTx2b2lkPjtcbn1cblxuY2xhc3MgQWN0aW9uc0NvbnRlbnRXaWRnZXQgZXh0ZW5kcyBGaXhlZFpvbmVXaWRnZXQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlID0gaCgnZGl2Lm1lcmdlLWVkaXRvci1jb25mbGljdC1hY3Rpb25zJykucm9vdDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHZpZXdab25lQWNjZXNzb3I6IElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yLFxuXHRcdGFmdGVyTGluZU51bWJlcjogbnVtYmVyLFxuXHRcdGhlaWdodDogbnVtYmVyLFxuXG5cdFx0Y2xhc3NOYW1lOiBzdHJpbmcsXG5cdFx0aXRlbXM6IElPYnNlcnZhYmxlPElDb250ZW50V2lkZ2V0QWN0aW9uW10+LFxuXHRcdHZpZXdab25lSWRzVG9DbGVhblVwOiBzdHJpbmdbXSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB2aWV3Wm9uZUFjY2Vzc29yLCBhZnRlckxpbmVOdW1iZXIsIGhlaWdodCwgdmlld1pvbmVJZHNUb0NsZWFuVXApO1xuXG5cdFx0dGhpcy53aWRnZXREb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2RvbU5vZGUpO1xuXG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBjb21tYW5kcyAqL1xuXHRcdFx0Y29uc3QgaSA9IGl0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuc2V0U3RhdGUoaSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdGF0ZShpdGVtczogSUNvbnRlbnRXaWRnZXRBY3Rpb25bXSkge1xuXHRcdGNvbnN0IGNoaWxkcmVuOiBIVE1MRWxlbWVudFtdID0gW107XG5cdFx0bGV0IGlzRmlyc3QgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0aWYgKGlzRmlyc3QpIHtcblx0XHRcdFx0aXNGaXJzdCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCgkKCdzcGFuJywgdW5kZWZpbmVkLCAnXFx1MDBhMHxcXHUwMGEwJykpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGl0bGUgPSByZW5kZXJMYWJlbFdpdGhJY29ucyhpdGVtLnRleHQpO1xuXG5cdFx0XHRpZiAoaXRlbS5hY3Rpb24pIHtcblx0XHRcdFx0Y2hpbGRyZW4ucHVzaCgkKCdhJywgeyB0aXRsZTogaXRlbS50b29sdGlwLCByb2xlOiAnYnV0dG9uJywgb25jbGljazogKCkgPT4gaXRlbS5hY3Rpb24hKCkgfSwgLi4udGl0bGUpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNoaWxkcmVuLnB1c2goJCgnc3BhbicsIHsgdGl0bGU6IGl0ZW0udG9vbHRpcCB9LCAuLi50aXRsZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJlc2V0KHRoaXMuX2RvbU5vZGUsIC4uLmNoaWxkcmVuKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxHQUFHLEdBQUcsZUFBZSxhQUFhO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsWUFBWTtBQUNyQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLFNBQVMsU0FBc0IsbUJBQW1CO0FBRTNELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLHdCQUF3QixrQ0FBa0M7QUFD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
