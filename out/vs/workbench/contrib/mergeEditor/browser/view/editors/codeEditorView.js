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
import { h } from "../../../../../../base/browser/dom.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent } from "../../../../../../base/common/observable.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Selection } from "../../../../../../editor/common/core/selection.js";
import { CodeLensContribution } from "../../../../../../editor/contrib/codelens/browser/codelensController.js";
import { FoldingController } from "../../../../../../editor/contrib/folding/browser/folding.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { DEFAULT_EDITOR_MAX_DIMENSIONS, DEFAULT_EDITOR_MIN_DIMENSIONS } from "../../../../../browser/parts/editor/editor.js";
import { setStyle } from "../../utils.js";
import { observableConfigValue } from "../../../../../../platform/observable/common/platformObservableUtils.js";
class CodeEditorView extends Disposable {
  constructor(instantiationService, viewModel, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.viewModel = viewModel;
    this.configurationService = configurationService;
    this.model = this.viewModel.map((m) => (
      /** @description model */
      m?.model
    ));
    this.htmlElements = h("div.code-view", [
      h("div.header@header", [
        h("span.title@title"),
        h("span.description@description"),
        h("span.detail@detail"),
        h("span.toolbar@toolbar")
      ]),
      h("div.container", [
        h("div.gutter@gutterDiv"),
        h("div@editor")
      ])
    ]);
    this._onDidViewChange = this._register(new Emitter());
    this.view = {
      element: this.htmlElements.root,
      minimumWidth: DEFAULT_EDITOR_MIN_DIMENSIONS.width,
      maximumWidth: DEFAULT_EDITOR_MAX_DIMENSIONS.width,
      minimumHeight: DEFAULT_EDITOR_MIN_DIMENSIONS.height,
      maximumHeight: DEFAULT_EDITOR_MAX_DIMENSIONS.height,
      onDidChange: this._onDidViewChange.event,
      layout: (width, height, top, left) => {
        setStyle(this.htmlElements.root, { width, height, top, left });
        this.editor.layout({
          width: width - this.htmlElements.gutterDiv.clientWidth,
          height: height - this.htmlElements.header.clientHeight
        });
      }
      // preferredWidth?: number | undefined;
      // preferredHeight?: number | undefined;
      // priority?: LayoutPriority | undefined;
      // snap?: boolean | undefined;
    };
    this.checkboxesVisible = observableConfigValue("mergeEditor.showCheckboxes", false, this.configurationService);
    this.showDeletionMarkers = observableConfigValue("mergeEditor.showDeletionMarkers", true, this.configurationService);
    this.useSimplifiedDecorations = observableConfigValue("mergeEditor.useSimplifiedDecorations", false, this.configurationService);
    this.editor = this.instantiationService.createInstance(
      CodeEditorWidget,
      this.htmlElements.editor,
      {},
      {
        contributions: this.getEditorContributions()
      }
    );
    this.isFocused = observableFromEvent(
      this,
      Event.any(this.editor.onDidBlurEditorWidget, this.editor.onDidFocusEditorWidget),
      () => (
        /** @description editor.hasWidgetFocus */
        this.editor.hasWidgetFocus()
      )
    );
    this.cursorPosition = observableFromEvent(
      this,
      this.editor.onDidChangeCursorPosition,
      () => (
        /** @description editor.getPosition */
        this.editor.getPosition()
      )
    );
    this.selection = observableFromEvent(
      this,
      this.editor.onDidChangeCursorSelection,
      () => (
        /** @description editor.getSelections */
        this.editor.getSelections()
      )
    );
    this.cursorLineNumber = this.cursorPosition.map((p) => (
      /** @description cursorPosition.lineNumber */
      p?.lineNumber
    ));
  }
  updateOptions(newOptions) {
    this.editor.updateOptions(newOptions);
  }
  getEditorContributions() {
    return EditorExtensionsRegistry.getEditorContributions().filter((c) => c.id !== FoldingController.ID && c.id !== CodeLensContribution.ID);
  }
}
function createSelectionsAutorun(codeEditorView, translateRange) {
  const selections = derived((reader) => {
    const viewModel = codeEditorView.viewModel.read(reader);
    if (!viewModel) {
      return [];
    }
    const baseRange = viewModel.selectionInBase.read(reader);
    if (!baseRange || baseRange.sourceEditor === codeEditorView) {
      return [];
    }
    return baseRange.rangesInBase.map((r) => translateRange(r, viewModel));
  });
  return autorun((reader) => {
    const ranges = selections.read(reader);
    if (ranges.length === 0) {
      return;
    }
    codeEditorView.editor.setSelections(ranges.map((r) => new Selection(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)));
  });
}
let TitleMenu = class extends Disposable {
  constructor(menuId, targetHtmlElement, instantiationService) {
    super();
    const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, targetHtmlElement, menuId, {
      menuOptions: { renderShortTitle: true },
      toolbarOptions: { primaryGroup: (g) => g === "primary" }
    });
    this._store.add(toolbar);
  }
};
TitleMenu = __decorateClass([
  __decorateParam(2, IInstantiationService)
], TitleMenu);
export {
  CodeEditorView,
  TitleMenu,
  createSelectionsAutorun
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFxicm93c2VyXFx2aWV3XFxlZGl0b3JzXFxjb2RlRWRpdG9yVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElWaWV3LCBJVmlld1NpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIGF1dG9ydW4sIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSwgSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlTGVuc0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVsZW5zL2Jyb3dzZXIvY29kZWxlbnNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEZvbGRpbmdDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZm9sZGluZy9icm93c2VyL2ZvbGRpbmcuanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9NQVhfRElNRU5TSU9OUywgREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3IuanMnO1xuaW1wb3J0IHsgc2V0U3R5bGUgfSBmcm9tICcuLi8uLi91dGlscy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvclZpZXdNb2RlbCB9IGZyb20gJy4uL3ZpZXdNb2RlbC5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBDb2RlRWRpdG9yVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBtb2RlbDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgaHRtbEVsZW1lbnRzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVmlld0NoYW5nZTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgdmlldzogSVZpZXc7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGNoZWNrYm94ZXNWaXNpYmxlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgc2hvd0RlbGV0aW9uTWFya2Vycztcblx0cHJvdGVjdGVkIHJlYWRvbmx5IHVzZVNpbXBsaWZpZWREZWNvcmF0aW9ucztcblxuXHRwdWJsaWMgcmVhZG9ubHkgZWRpdG9yO1xuXG5cdHB1YmxpYyB1cGRhdGVPcHRpb25zKG5ld09wdGlvbnM6IFJlYWRvbmx5PElFZGl0b3JPcHRpb25zPik6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLnVwZGF0ZU9wdGlvbnMobmV3T3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNGb2N1c2VkO1xuXG5cdHB1YmxpYyByZWFkb25seSBjdXJzb3JQb3NpdGlvbjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2VsZWN0aW9uO1xuXG5cdHB1YmxpYyByZWFkb25seSBjdXJzb3JMaW5lTnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlld01vZGVsOiBJT2JzZXJ2YWJsZTx1bmRlZmluZWQgfCBNZXJnZUVkaXRvclZpZXdNb2RlbD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMubW9kZWwgPSB0aGlzLnZpZXdNb2RlbC5tYXAobSA9PiAvKiogQGRlc2NyaXB0aW9uIG1vZGVsICovIG0/Lm1vZGVsKTtcblx0XHR0aGlzLmh0bWxFbGVtZW50cyA9IGgoJ2Rpdi5jb2RlLXZpZXcnLCBbXG5cdFx0XHRoKCdkaXYuaGVhZGVyQGhlYWRlcicsIFtcblx0XHRcdFx0aCgnc3Bhbi50aXRsZUB0aXRsZScpLFxuXHRcdFx0XHRoKCdzcGFuLmRlc2NyaXB0aW9uQGRlc2NyaXB0aW9uJyksXG5cdFx0XHRcdGgoJ3NwYW4uZGV0YWlsQGRldGFpbCcpLFxuXHRcdFx0XHRoKCdzcGFuLnRvb2xiYXJAdG9vbGJhcicpLFxuXHRcdFx0XSksXG5cdFx0XHRoKCdkaXYuY29udGFpbmVyJywgW1xuXHRcdFx0XHRoKCdkaXYuZ3V0dGVyQGd1dHRlckRpdicpLFxuXHRcdFx0XHRoKCdkaXZAZWRpdG9yJyksXG5cdFx0XHRdKSxcblx0XHRdKTtcblx0XHR0aGlzLl9vbkRpZFZpZXdDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVmlld1NpemUgfCB1bmRlZmluZWQ+KCkpO1xuXHRcdHRoaXMudmlldyA9IHtcblx0XHRcdGVsZW1lbnQ6IHRoaXMuaHRtbEVsZW1lbnRzLnJvb3QsXG5cdFx0XHRtaW5pbXVtV2lkdGg6IERFRkFVTFRfRURJVE9SX01JTl9ESU1FTlNJT05TLndpZHRoLFxuXHRcdFx0bWF4aW11bVdpZHRoOiBERUZBVUxUX0VESVRPUl9NQVhfRElNRU5TSU9OUy53aWR0aCxcblx0XHRcdG1pbmltdW1IZWlnaHQ6IERFRkFVTFRfRURJVE9SX01JTl9ESU1FTlNJT05TLmhlaWdodCxcblx0XHRcdG1heGltdW1IZWlnaHQ6IERFRkFVTFRfRURJVE9SX01BWF9ESU1FTlNJT05TLmhlaWdodCxcblx0XHRcdG9uRGlkQ2hhbmdlOiB0aGlzLl9vbkRpZFZpZXdDaGFuZ2UuZXZlbnQsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRzZXRTdHlsZSh0aGlzLmh0bWxFbGVtZW50cy5yb290LCB7IHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCB9KTtcblx0XHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0KHtcblx0XHRcdFx0XHR3aWR0aDogd2lkdGggLSB0aGlzLmh0bWxFbGVtZW50cy5ndXR0ZXJEaXYuY2xpZW50V2lkdGgsXG5cdFx0XHRcdFx0aGVpZ2h0OiBoZWlnaHQgLSB0aGlzLmh0bWxFbGVtZW50cy5oZWFkZXIuY2xpZW50SGVpZ2h0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdC8vIHByZWZlcnJlZFdpZHRoPzogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0Ly8gcHJlZmVycmVkSGVpZ2h0PzogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0Ly8gcHJpb3JpdHk/OiBMYXlvdXRQcmlvcml0eSB8IHVuZGVmaW5lZDtcblx0XHRcdC8vIHNuYXA/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0dGhpcy5jaGVja2JveGVzVmlzaWJsZSA9IG9ic2VydmFibGVDb25maWdWYWx1ZTxib29sZWFuPignbWVyZ2VFZGl0b3Iuc2hvd0NoZWNrYm94ZXMnLCBmYWxzZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5zaG93RGVsZXRpb25NYXJrZXJzID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPGJvb2xlYW4+KCdtZXJnZUVkaXRvci5zaG93RGVsZXRpb25NYXJrZXJzJywgdHJ1ZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy51c2VTaW1wbGlmaWVkRGVjb3JhdGlvbnMgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWU8Ym9vbGVhbj4oJ21lcmdlRWRpdG9yLnVzZVNpbXBsaWZpZWREZWNvcmF0aW9ucycsIGZhbHNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmVkaXRvciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0dGhpcy5odG1sRWxlbWVudHMuZWRpdG9yLFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRyaWJ1dGlvbnM6IHRoaXMuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpLFxuXHRcdFx0fVxuXHRcdCk7XG5cdFx0dGhpcy5pc0ZvY3VzZWQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHRFdmVudC5hbnkodGhpcy5lZGl0b3Iub25EaWRCbHVyRWRpdG9yV2lkZ2V0LCB0aGlzLmVkaXRvci5vbkRpZEZvY3VzRWRpdG9yV2lkZ2V0KSxcblx0XHRcdCgpID0+IC8qKiBAZGVzY3JpcHRpb24gZWRpdG9yLmhhc1dpZGdldEZvY3VzICovIHRoaXMuZWRpdG9yLmhhc1dpZGdldEZvY3VzKClcblx0XHQpO1xuXHRcdHRoaXMuY3Vyc29yUG9zaXRpb24gPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLmVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uLFxuXHRcdFx0KCkgPT4gLyoqIEBkZXNjcmlwdGlvbiBlZGl0b3IuZ2V0UG9zaXRpb24gKi8gdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKVxuXHRcdCk7XG5cdFx0dGhpcy5zZWxlY3Rpb24gPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLmVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbixcblx0XHRcdCgpID0+IC8qKiBAZGVzY3JpcHRpb24gZWRpdG9yLmdldFNlbGVjdGlvbnMgKi8gdGhpcy5lZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0KTtcblx0XHR0aGlzLmN1cnNvckxpbmVOdW1iZXIgPSB0aGlzLmN1cnNvclBvc2l0aW9uLm1hcChwID0+IC8qKiBAZGVzY3JpcHRpb24gY3Vyc29yUG9zaXRpb24ubGluZU51bWJlciAqLyBwPy5saW5lTnVtYmVyKTtcblxuXHR9XG5cblx0cHJvdGVjdGVkIGdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKTogSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uW10ge1xuXHRcdHJldHVybiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpLmZpbHRlcihjID0+IGMuaWQgIT09IEZvbGRpbmdDb250cm9sbGVyLklEICYmIGMuaWQgIT09IENvZGVMZW5zQ29udHJpYnV0aW9uLklEKTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlU2VsZWN0aW9uc0F1dG9ydW4oXG5cdGNvZGVFZGl0b3JWaWV3OiBDb2RlRWRpdG9yVmlldyxcblx0dHJhbnNsYXRlUmFuZ2U6IChiYXNlUmFuZ2U6IFJhbmdlLCB2aWV3TW9kZWw6IE1lcmdlRWRpdG9yVmlld01vZGVsKSA9PiBSYW5nZVxuKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBzZWxlY3Rpb25zID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdC8qKiBAZGVzY3JpcHRpb24gc2VsZWN0aW9ucyAqL1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IGNvZGVFZGl0b3JWaWV3LnZpZXdNb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgYmFzZVJhbmdlID0gdmlld01vZGVsLnNlbGVjdGlvbkluQmFzZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFiYXNlUmFuZ2UgfHwgYmFzZVJhbmdlLnNvdXJjZUVkaXRvciA9PT0gY29kZUVkaXRvclZpZXcpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGJhc2VSYW5nZS5yYW5nZXNJbkJhc2UubWFwKHIgPT4gdHJhbnNsYXRlUmFuZ2Uociwgdmlld01vZGVsKSk7XG5cdH0pO1xuXG5cdHJldHVybiBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0LyoqIEBkZXNjcmlwdGlvbiBzZXQgc2VsZWN0aW9ucyAqL1xuXHRcdGNvbnN0IHJhbmdlcyA9IHNlbGVjdGlvbnMucmVhZChyZWFkZXIpO1xuXHRcdGlmIChyYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvZGVFZGl0b3JWaWV3LmVkaXRvci5zZXRTZWxlY3Rpb25zKHJhbmdlcy5tYXAociA9PiBuZXcgU2VsZWN0aW9uKHIuc3RhcnRMaW5lTnVtYmVyLCByLnN0YXJ0Q29sdW1uLCByLmVuZExpbmVOdW1iZXIsIHIuZW5kQ29sdW1uKSkpO1xuXHR9KTtcbn1cblxuZXhwb3J0IGNsYXNzIFRpdGxlTWVudSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRtZW51SWQ6IE1lbnVJZCxcblx0XHR0YXJnZXRIdG1sRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0YXJnZXRIdG1sRWxlbWVudCwgbWVudUlkLCB7XG5cdFx0XHRtZW51T3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0sXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6IChnKSA9PiBnID09PSAncHJpbWFyeScgfVxuXHRcdH0pO1xuXHRcdHRoaXMuX3N0b3JlLmFkZCh0b29sYmFyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVM7QUFFbEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxrQkFBK0I7QUFDeEMsU0FBc0IsU0FBUyxTQUFTLDJCQUEyQjtBQUNuRSxTQUFTLGdDQUFnRTtBQUN6RSxTQUFTLHdCQUF3QjtBQUdqQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUdyQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQixxQ0FBcUM7QUFDN0UsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFHL0IsTUFBZSx1QkFBdUIsV0FBVztBQUFBLEVBMkJ2RCxZQUNrQixzQkFDRCxXQUNDLHNCQUNoQjtBQUNELFVBQU07QUFKVztBQUNEO0FBQ0M7QUFHakIsU0FBSyxRQUFRLEtBQUssVUFBVSxJQUFJO0FBQUE7QUFBQSxNQUErQixHQUFHO0FBQUEsS0FBSztBQUN2RSxTQUFLLGVBQWUsRUFBRSxpQkFBaUI7QUFBQSxNQUN0QyxFQUFFLHFCQUFxQjtBQUFB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
