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
import { EventType, addDisposableListener, h } from "../../../../../base/browser/dom.js";
import { ActionsOrientation } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, derivedDisposable, derivedWithSetter, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { LineRange, LineRangeSet } from "../../../../common/core/ranges/lineRange.js";
import { OffsetRange } from "../../../../common/core/ranges/offsetRange.js";
import { Range } from "../../../../common/core/range.js";
import { TextEdit } from "../../../../common/core/edits/textEdit.js";
import { DetailedLineRangeMapping } from "../../../../common/diff/rangeMapping.js";
import { TextModelText } from "../../../../common/model/textModelText.js";
import { ActionRunnerWithContext } from "../../multiDiffEditor/utils.js";
import { DiffEditorSash } from "../components/diffEditorSash.js";
import { appendRemoveOnDispose, applyStyle, prependRemoveOnDispose } from "../utils.js";
import { EditorGutter } from "../utils/editorGutter.js";
const emptyArr = [];
const width = 35;
let DiffEditorGutter = class extends Disposable {
  constructor(diffEditorRoot, _diffModel, _editors, _options, _sashLayout, _boundarySashes, _instantiationService, _contextKeyService, _menuService) {
    super();
    this._diffModel = _diffModel;
    this._editors = _editors;
    this._options = _options;
    this._sashLayout = _sashLayout;
    this._boundarySashes = _boundarySashes;
    this._instantiationService = _instantiationService;
    this._contextKeyService = _contextKeyService;
    this._menuService = _menuService;
    this._menu = this._register(this._menuService.createMenu(MenuId.DiffEditorHunkToolbar, this._contextKeyService));
    this._actions = observableFromEvent(this, this._menu.onDidChange, () => this._menu.getActions());
    this._hasActions = this._actions.map((a) => a.length > 0);
    this._showSash = derived(this, (reader) => this._options.renderSideBySide.read(reader) && this._hasActions.read(reader));
    this.width = derived(this, (reader) => this._hasActions.read(reader) ? width : 0);
    this.elements = h("div.gutter@gutter", { style: { position: "absolute", height: "100%", width: width + "px" } }, []);
    this._currentDiff = derived(this, (reader) => {
      const model = this._diffModel.read(reader);
      if (!model) {
        return void 0;
      }
      const mappings = model.diff.read(reader)?.mappings;
      const cursorPosition = this._editors.modifiedCursor.read(reader);
      if (!cursorPosition) {
        return void 0;
      }
      return mappings?.find((m) => m.lineRangeMapping.modified.contains(cursorPosition.lineNumber));
    });
    this._selectedDiffs = derived(this, (reader) => {
      const model = this._diffModel.read(reader);
      const diff = model?.diff.read(reader);
      if (!diff) {
        return emptyArr;
      }
      const selections = this._editors.modifiedSelections.read(reader);
      if (selections.every((s) => s.isEmpty())) {
        return emptyArr;
      }
      const selectedLineNumbers = new LineRangeSet(selections.map((s) => LineRange.fromRangeInclusive(s)));
      const selectedMappings = diff.mappings.filter(
        (m) => m.lineRangeMapping.innerChanges && selectedLineNumbers.intersects(m.lineRangeMapping.modified)
      );
      const result = selectedMappings.map((mapping) => ({
        mapping,
        rangeMappings: mapping.lineRangeMapping.innerChanges.filter(
          (c) => selections.some((s) => Range.areIntersecting(c.modifiedRange, s))
        )
      }));
      if (result.length === 0 || result.every((r) => r.rangeMappings.length === 0)) {
        return emptyArr;
      }
      return result;
    });
    this._register(prependRemoveOnDispose(diffEditorRoot, this.elements.root));
    this._register(addDisposableListener(this.elements.root, "click", () => {
      this._editors.modified.focus();
    }));
    this._register(applyStyle(this.elements.root, { display: this._hasActions.map((a) => a ? "block" : "none") }));
    derivedDisposable(this, (reader) => {
      const showSash = this._showSash.read(reader);
      return !showSash ? void 0 : new DiffEditorSash(
        diffEditorRoot,
        this._sashLayout.dimensions,
        this._options.enableSplitViewResizing,
        this._boundarySashes,
        derivedWithSetter(
          this,
          (reader2) => this._sashLayout.sashLeft.read(reader2) - width,
          (v, tx) => this._sashLayout.sashLeft.set(v + width, tx)
        ),
        () => this._sashLayout.resetSash()
      );
    }).recomputeInitiallyAndOnChange(this._store);
    const gutterItems = derived(this, (reader) => {
      const model = this._diffModel.read(reader);
      if (!model) {
        return [];
      }
      const diffs = model.diff.read(reader);
      if (!diffs) {
        return [];
      }
      const selection = this._selectedDiffs.read(reader);
      if (selection.length > 0) {
        const m = DetailedLineRangeMapping.fromRangeMappings(selection.flatMap((s) => s.rangeMappings));
        return [
          new DiffGutterItem(
            m,
            true,
            MenuId.DiffEditorSelectionToolbar,
            void 0,
            model.model.original.uri,
            model.model.modified.uri
          )
        ];
      }
      const currentDiff = this._currentDiff.read(reader);
      return diffs.mappings.map((m) => new DiffGutterItem(
        m.lineRangeMapping.withInnerChangesFromLineRanges(),
        m.lineRangeMapping === currentDiff?.lineRangeMapping,
        MenuId.DiffEditorHunkToolbar,
        void 0,
        model.model.original.uri,
        model.model.modified.uri
      ));
    });
    this._register(new EditorGutter(this._editors.modified, this.elements.root, {
      getIntersectingGutterItems: (range, reader) => gutterItems.read(reader),
      createView: (item, target) => {
        return this._instantiationService.createInstance(DiffToolBar, item, target, this);
      }
    }));
    this._register(addDisposableListener(this.elements.gutter, EventType.MOUSE_WHEEL, (e) => {
      if (this._editors.modified.getOption(EditorOption.scrollbar).handleMouseWheel) {
        this._editors.modified.delegateScrollFromMouseWheelEvent(e);
      }
    }, { passive: false }));
  }
  computeStagedValue(mapping) {
    const c = mapping.innerChanges ?? [];
    const modified = new TextModelText(this._editors.modifiedModel.get());
    const original = new TextModelText(this._editors.original.getModel());
    const edit = new TextEdit(c.map((c2) => c2.toTextEdit(modified)));
    const value = edit.apply(original);
    return value;
  }
  layout(left) {
    this.elements.gutter.style.left = left + "px";
  }
};
DiffEditorGutter = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IMenuService)
], DiffEditorGutter);
class DiffGutterItem {
  constructor(mapping, showAlways, menuId, rangeOverride, originalUri, modifiedUri) {
    this.mapping = mapping;
    this.showAlways = showAlways;
    this.menuId = menuId;
    this.rangeOverride = rangeOverride;
    this.originalUri = originalUri;
    this.modifiedUri = modifiedUri;
  }
  get id() {
    return this.mapping.modified.toString();
  }
  get range() {
    return this.rangeOverride ?? this.mapping.modified;
  }
}
let DiffToolBar = class extends Disposable {
  constructor(_item, target, gutter, instantiationService) {
    super();
    this._item = _item;
    this._elements = h("div.gutterItem", { style: { height: "20px", width: "34px" } }, [
      h("div.background@background", {}, []),
      h("div.buttons@buttons", {}, [])
    ]);
    this._showAlways = this._item.map(this, (item) => item.showAlways);
    this._menuId = this._item.map(this, (item) => item.menuId);
    this._isSmall = observableValue(this, false);
    this._lastItemRange = void 0;
    this._lastViewRange = void 0;
    const hoverDelegate = this._register(instantiationService.createInstance(
      WorkbenchHoverDelegate,
      "element",
      { instantHover: true },
      { position: { hoverPosition: HoverPosition.RIGHT } }
    ));
    this._register(appendRemoveOnDispose(target, this._elements.root));
    this._register(autorun((reader) => {
      const showAlways = this._showAlways.read(reader);
      this._elements.root.classList.toggle("noTransition", true);
      this._elements.root.classList.toggle("showAlways", showAlways);
      setTimeout(() => {
        this._elements.root.classList.toggle("noTransition", false);
      }, 0);
    }));
    this._register(autorunWithStore((reader, store) => {
      this._elements.buttons.replaceChildren();
      const i = store.add(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.buttons, this._menuId.read(reader), {
        orientation: ActionsOrientation.VERTICAL,
        hoverDelegate,
        toolbarOptions: {
          primaryGroup: (g) => g.startsWith("primary")
        },
        overflowBehavior: { maxItems: this._isSmall.read(reader) ? 1 : 3 },
        hiddenItemStrategy: HiddenItemStrategy.Ignore,
        actionRunner: store.add(new ActionRunnerWithContext(() => {
          const item = this._item.read(void 0);
          const mapping = item.mapping;
          return {
            mapping,
            originalWithModifiedChanges: gutter.computeStagedValue(mapping),
            originalUri: item.originalUri,
            modifiedUri: item.modifiedUri
          };
        })),
        menuOptions: {
          shouldForwardArgs: true
        }
      }));
      store.add(i.onDidChangeMenuItems(() => {
        if (this._lastItemRange) {
          this.layout(this._lastItemRange, this._lastViewRange);
        }
      }));
    }));
  }
  layout(itemRange, viewRange) {
    this._lastItemRange = itemRange;
    this._lastViewRange = viewRange;
    let itemHeight = this._elements.buttons.clientHeight;
    this._isSmall.set(this._item.get().mapping.original.startLineNumber === 1 && itemRange.length < 30, void 0);
    itemHeight = this._elements.buttons.clientHeight;
    const middleHeight = itemRange.length / 2 - itemHeight / 2;
    const margin = itemHeight;
    let effectiveCheckboxTop = itemRange.start + middleHeight;
    const preferredViewPortRange = OffsetRange.tryCreate(
      margin,
      viewRange.endExclusive - margin - itemHeight
    );
    const preferredParentRange = OffsetRange.tryCreate(
      itemRange.start + margin,
      itemRange.endExclusive - itemHeight - margin
    );
    if (preferredParentRange && preferredViewPortRange && preferredParentRange.start < preferredParentRange.endExclusive) {
      effectiveCheckboxTop = preferredViewPortRange.clip(effectiveCheckboxTop);
      effectiveCheckboxTop = preferredParentRange.clip(effectiveCheckboxTop);
    }
    this._elements.buttons.style.top = `${effectiveCheckboxTop - itemRange.start}px`;
  }
};
DiffToolBar = __decorateClass([
  __decorateParam(3, IInstantiationService)
], DiffToolBar);
export {
  DiffEditorGutter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcZGlmZkVkaXRvclxcZmVhdHVyZXNcXGd1dHRlckZlYXR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudFR5cGUsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbnNPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUJvdW5kYXJ5U2FzaGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Nhc2gvc2FzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkLCBkZXJpdmVkRGlzcG9zYWJsZSwgZGVyaXZlZFdpdGhTZXR0ZXIsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEhpZGRlbkl0ZW1TdHJhdGVneSwgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UsIExpbmVSYW5nZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxUZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbFRleHQuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyV2l0aENvbnRleHQgfSBmcm9tICcuLi8uLi9tdWx0aURpZmZFZGl0b3IvdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckVkaXRvcnMgfSBmcm9tICcuLi9jb21wb25lbnRzL2RpZmZFZGl0b3JFZGl0b3JzLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JTYXNoLCBTYXNoTGF5b3V0IH0gZnJvbSAnLi4vY29tcG9uZW50cy9kaWZmRWRpdG9yU2FzaC5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uL2RpZmZFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JWaWV3TW9kZWwgfSBmcm9tICcuLi9kaWZmRWRpdG9yVmlld01vZGVsLmpzJztcbmltcG9ydCB7IGFwcGVuZFJlbW92ZU9uRGlzcG9zZSwgYXBwbHlTdHlsZSwgcHJlcGVuZFJlbW92ZU9uRGlzcG9zZSB9IGZyb20gJy4uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvckd1dHRlciwgSUd1dHRlckl0ZW1JbmZvLCBJR3V0dGVySXRlbVZpZXcgfSBmcm9tICcuLi91dGlscy9lZGl0b3JHdXR0ZXIuanMnO1xuXG5jb25zdCBlbXB0eUFycjogbmV2ZXJbXSA9IFtdO1xuY29uc3Qgd2lkdGggPSAzNTtcblxuZXhwb3J0IGNsYXNzIERpZmZFZGl0b3JHdXR0ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbWVudTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aW9ucztcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzQWN0aW9ucztcblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd1Nhc2g7XG5cblx0cHVibGljIHJlYWRvbmx5IHdpZHRoO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudHM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZGlmZkVkaXRvclJvb3Q6IEhUTUxEaXZFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZNb2RlbDogSU9ic2VydmFibGU8RGlmZkVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yczogRGlmZkVkaXRvckVkaXRvcnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogRGlmZkVkaXRvck9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2FzaExheW91dDogU2FzaExheW91dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ib3VuZGFyeVNhc2hlczogSU9ic2VydmFibGU8SUJvdW5kYXJ5U2FzaGVzIHwgdW5kZWZpbmVkPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9tZW51ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fbWVudVNlcnZpY2UuY3JlYXRlTWVudShNZW51SWQuRGlmZkVkaXRvckh1bmtUb29sYmFyLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX2FjdGlvbnMgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX21lbnUub25EaWRDaGFuZ2UsICgpID0+IHRoaXMuX21lbnUuZ2V0QWN0aW9ucygpKTtcblx0XHR0aGlzLl9oYXNBY3Rpb25zID0gdGhpcy5fYWN0aW9ucy5tYXAoYSA9PiBhLmxlbmd0aCA+IDApO1xuXHRcdHRoaXMuX3Nob3dTYXNoID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fb3B0aW9ucy5yZW5kZXJTaWRlQnlTaWRlLnJlYWQocmVhZGVyKSAmJiB0aGlzLl9oYXNBY3Rpb25zLnJlYWQocmVhZGVyKSk7XG5cdFx0dGhpcy53aWR0aCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuX2hhc0FjdGlvbnMucmVhZChyZWFkZXIpID8gd2lkdGggOiAwKTtcblx0XHR0aGlzLmVsZW1lbnRzID0gaCgnZGl2Lmd1dHRlckBndXR0ZXInLCB7IHN0eWxlOiB7IHBvc2l0aW9uOiAnYWJzb2x1dGUnLCBoZWlnaHQ6ICcxMDAlJywgd2lkdGg6IHdpZHRoICsgJ3B4JyB9IH0sIFtdKTtcblx0XHR0aGlzLl9jdXJyZW50RGlmZiA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWFwcGluZ3MgPSBtb2RlbC5kaWZmLnJlYWQocmVhZGVyKT8ubWFwcGluZ3M7XG5cblx0XHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZEN1cnNvci5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWN1cnNvclBvc2l0aW9uKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0cmV0dXJuIG1hcHBpbmdzPy5maW5kKG0gPT4gbS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmNvbnRhaW5zKGN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIpKTtcblx0XHR9KTtcblx0XHR0aGlzLl9zZWxlY3RlZERpZmZzID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIHNlbGVjdGVkRGlmZnMgKi9cblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRpZmYgPSBtb2RlbD8uZGlmZi5yZWFkKHJlYWRlcik7XG5cdFx0XHQvLyBSZXR1cm4gYGVtcHR5QXJyYCBiZWNhdXNlIGl0IGlzIGEgY29uc3RhbnQuIFtdIGlzIGFsd2F5cyBhIG5ldyBhcnJheSBhbmQgd291bGQgdHJpZ2dlciBhIGNoYW5nZS5cblx0XHRcdGlmICghZGlmZikgeyByZXR1cm4gZW1wdHlBcnI7IH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvcnMubW9kaWZpZWRTZWxlY3Rpb25zLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChzZWxlY3Rpb25zLmV2ZXJ5KHMgPT4gcy5pc0VtcHR5KCkpKSB7IHJldHVybiBlbXB0eUFycjsgfVxuXG5cdFx0XHRjb25zdCBzZWxlY3RlZExpbmVOdW1iZXJzID0gbmV3IExpbmVSYW5nZVNldChzZWxlY3Rpb25zLm1hcChzID0+IExpbmVSYW5nZS5mcm9tUmFuZ2VJbmNsdXNpdmUocykpKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRNYXBwaW5ncyA9IGRpZmYubWFwcGluZ3MuZmlsdGVyKG0gPT5cblx0XHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLmlubmVyQ2hhbmdlcyAmJiBzZWxlY3RlZExpbmVOdW1iZXJzLmludGVyc2VjdHMobS5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkKVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlbGVjdGVkTWFwcGluZ3MubWFwKG1hcHBpbmcgPT4gKHtcblx0XHRcdFx0bWFwcGluZyxcblx0XHRcdFx0cmFuZ2VNYXBwaW5nczogbWFwcGluZy5saW5lUmFuZ2VNYXBwaW5nLmlubmVyQ2hhbmdlcyEuZmlsdGVyKFxuXHRcdFx0XHRcdGMgPT4gc2VsZWN0aW9ucy5zb21lKHMgPT4gUmFuZ2UuYXJlSW50ZXJzZWN0aW5nKGMubW9kaWZpZWRSYW5nZSwgcykpXG5cdFx0XHRcdClcblx0XHRcdH0pKTtcblx0XHRcdGlmIChyZXN1bHQubGVuZ3RoID09PSAwIHx8IHJlc3VsdC5ldmVyeShyID0+IHIucmFuZ2VNYXBwaW5ncy5sZW5ndGggPT09IDApKSB7IHJldHVybiBlbXB0eUFycjsgfVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHByZXBlbmRSZW1vdmVPbkRpc3Bvc2UoZGlmZkVkaXRvclJvb3QsIHRoaXMuZWxlbWVudHMucm9vdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudHMucm9vdCwgJ2NsaWNrJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGx5U3R5bGUodGhpcy5lbGVtZW50cy5yb290LCB7IGRpc3BsYXk6IHRoaXMuX2hhc0FjdGlvbnMubWFwKGEgPT4gYSA/ICdibG9jaycgOiAnbm9uZScpIH0pKTtcblxuXHRcdGRlcml2ZWREaXNwb3NhYmxlKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzaG93U2FzaCA9IHRoaXMuX3Nob3dTYXNoLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiAhc2hvd1Nhc2ggPyB1bmRlZmluZWQgOiBuZXcgRGlmZkVkaXRvclNhc2goXG5cdFx0XHRcdGRpZmZFZGl0b3JSb290LFxuXHRcdFx0XHR0aGlzLl9zYXNoTGF5b3V0LmRpbWVuc2lvbnMsXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMuZW5hYmxlU3BsaXRWaWV3UmVzaXppbmcsXG5cdFx0XHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzLFxuXHRcdFx0XHRkZXJpdmVkV2l0aFNldHRlcihcblx0XHRcdFx0XHR0aGlzLCByZWFkZXIgPT4gdGhpcy5fc2FzaExheW91dC5zYXNoTGVmdC5yZWFkKHJlYWRlcikgLSB3aWR0aCxcblx0XHRcdFx0XHQodiwgdHgpID0+IHRoaXMuX3Nhc2hMYXlvdXQuc2FzaExlZnQuc2V0KHYgKyB3aWR0aCwgdHgpXG5cdFx0XHRcdCksXG5cdFx0XHRcdCgpID0+IHRoaXMuX3Nhc2hMYXlvdXQucmVzZXRTYXNoKCksXG5cdFx0XHQpO1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IGd1dHRlckl0ZW1zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaWZmcyA9IG1vZGVsLmRpZmYucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFkaWZmcykgeyByZXR1cm4gW107IH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fc2VsZWN0ZWREaWZmcy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc2VsZWN0aW9uLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgbSA9IERldGFpbGVkTGluZVJhbmdlTWFwcGluZy5mcm9tUmFuZ2VNYXBwaW5ncyhzZWxlY3Rpb24uZmxhdE1hcChzID0+IHMucmFuZ2VNYXBwaW5ncykpO1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG5ldyBEaWZmR3V0dGVySXRlbShcblx0XHRcdFx0XHRcdG0sXG5cdFx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFx0TWVudUlkLkRpZmZFZGl0b3JTZWxlY3Rpb25Ub29sYmFyLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bW9kZWwubW9kZWwub3JpZ2luYWwudXJpLFxuXHRcdFx0XHRcdFx0bW9kZWwubW9kZWwubW9kaWZpZWQudXJpLFxuXHRcdFx0XHRcdCldO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50RGlmZiA9IHRoaXMuX2N1cnJlbnREaWZmLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0cmV0dXJuIGRpZmZzLm1hcHBpbmdzLm1hcChtID0+IG5ldyBEaWZmR3V0dGVySXRlbShcblx0XHRcdFx0bS5saW5lUmFuZ2VNYXBwaW5nLndpdGhJbm5lckNoYW5nZXNGcm9tTGluZVJhbmdlcygpLFxuXHRcdFx0XHRtLmxpbmVSYW5nZU1hcHBpbmcgPT09IGN1cnJlbnREaWZmPy5saW5lUmFuZ2VNYXBwaW5nLFxuXHRcdFx0XHRNZW51SWQuRGlmZkVkaXRvckh1bmtUb29sYmFyLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsLm1vZGVsLm9yaWdpbmFsLnVyaSxcblx0XHRcdFx0bW9kZWwubW9kZWwubW9kaWZpZWQudXJpLFxuXHRcdFx0KSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRWRpdG9yR3V0dGVyPERpZmZHdXR0ZXJJdGVtPih0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLCB0aGlzLmVsZW1lbnRzLnJvb3QsIHtcblx0XHRcdGdldEludGVyc2VjdGluZ0d1dHRlckl0ZW1zOiAocmFuZ2UsIHJlYWRlcikgPT4gZ3V0dGVySXRlbXMucmVhZChyZWFkZXIpLFxuXHRcdFx0Y3JlYXRlVmlldzogKGl0ZW0sIHRhcmdldCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZlRvb2xCYXIsIGl0ZW0sIHRhcmdldCwgdGhpcyk7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsZW1lbnRzLmd1dHRlciwgRXZlbnRUeXBlLk1PVVNFX1dIRUVMLCAoZTogSU1vdXNlV2hlZWxFdmVudCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zY3JvbGxiYXIpLmhhbmRsZU1vdXNlV2hlZWwpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5kZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoZSk7XG5cdFx0XHR9XG5cdFx0fSwgeyBwYXNzaXZlOiBmYWxzZSB9KSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZVN0YWdlZFZhbHVlKG1hcHBpbmc6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYyA9IG1hcHBpbmcuaW5uZXJDaGFuZ2VzID8/IFtdO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gbmV3IFRleHRNb2RlbFRleHQodGhpcy5fZWRpdG9ycy5tb2RpZmllZE1vZGVsLmdldCgpISk7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBuZXcgVGV4dE1vZGVsVGV4dCh0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldE1vZGVsKCkhKTtcblxuXHRcdGNvbnN0IGVkaXQgPSBuZXcgVGV4dEVkaXQoYy5tYXAoYyA9PiBjLnRvVGV4dEVkaXQobW9kaWZpZWQpKSk7XG5cdFx0Y29uc3QgdmFsdWUgPSBlZGl0LmFwcGx5KG9yaWdpbmFsKTtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50RGlmZjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3RlZERpZmZzO1xuXG5cdGxheW91dChsZWZ0OiBudW1iZXIpIHtcblx0XHR0aGlzLmVsZW1lbnRzLmd1dHRlci5zdHlsZS5sZWZ0ID0gbGVmdCArICdweCc7XG5cdH1cbn1cblxuY2xhc3MgRGlmZkd1dHRlckl0ZW0gaW1wbGVtZW50cyBJR3V0dGVySXRlbUluZm8ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWFwcGluZzogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBzaG93QWx3YXlzOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBtZW51SWQ6IE1lbnVJZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZ2VPdmVycmlkZTogTGluZVJhbmdlIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBvcmlnaW5hbFVyaTogVVJJLFxuXHRcdHB1YmxpYyByZWFkb25seSBtb2RpZmllZFVyaTogVVJJLFxuXHQpIHtcblx0fVxuXHRnZXQgaWQoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMubWFwcGluZy5tb2RpZmllZC50b1N0cmluZygpOyB9XG5cdGdldCByYW5nZSgpOiBMaW5lUmFuZ2UgeyByZXR1cm4gdGhpcy5yYW5nZU92ZXJyaWRlID8/IHRoaXMubWFwcGluZy5tb2RpZmllZDsgfVxufVxuXG5cbmNsYXNzIERpZmZUb29sQmFyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElHdXR0ZXJJdGVtVmlldyB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnRzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dBbHdheXM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21lbnVJZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc1NtYWxsO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW06IElPYnNlcnZhYmxlPERpZmZHdXR0ZXJJdGVtPixcblx0XHR0YXJnZXQ6IEhUTUxFbGVtZW50LFxuXHRcdGd1dHRlcjogRGlmZkVkaXRvckd1dHRlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9lbGVtZW50cyA9IGgoJ2Rpdi5ndXR0ZXJJdGVtJywgeyBzdHlsZTogeyBoZWlnaHQ6ICcyMHB4Jywgd2lkdGg6ICczNHB4JyB9IH0sIFtcblx0XHRcdGgoJ2Rpdi5iYWNrZ3JvdW5kQGJhY2tncm91bmQnLCB7fSwgW10pLFxuXHRcdFx0aCgnZGl2LmJ1dHRvbnNAYnV0dG9ucycsIHt9LCBbXSksXG5cdFx0XSk7XG5cdFx0dGhpcy5fc2hvd0Fsd2F5cyA9IHRoaXMuX2l0ZW0ubWFwKHRoaXMsIGl0ZW0gPT4gaXRlbS5zaG93QWx3YXlzKTtcblx0XHR0aGlzLl9tZW51SWQgPSB0aGlzLl9pdGVtLm1hcCh0aGlzLCBpdGVtID0+IGl0ZW0ubWVudUlkKTtcblx0XHR0aGlzLl9pc1NtYWxsID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0XHR0aGlzLl9sYXN0SXRlbVJhbmdlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xhc3RWaWV3UmFuZ2UgPSB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hIb3ZlckRlbGVnYXRlLFxuXHRcdFx0J2VsZW1lbnQnLFxuXHRcdFx0eyBpbnN0YW50SG92ZXI6IHRydWUgfSxcblx0XHRcdHsgcG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5SSUdIVCB9IH1cblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGVuZFJlbW92ZU9uRGlzcG9zZSh0YXJnZXQsIHRoaXMuX2VsZW1lbnRzLnJvb3QpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gdXBkYXRlIHNob3dBbHdheXMgKi9cblx0XHRcdGNvbnN0IHNob3dBbHdheXMgPSB0aGlzLl9zaG93QWx3YXlzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnJvb3QuY2xhc3NMaXN0LnRvZ2dsZSgnbm9UcmFuc2l0aW9uJywgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5yb290LmNsYXNzTGlzdC50b2dnbGUoJ3Nob3dBbHdheXMnLCBzaG93QWx3YXlzKTtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50cy5yb290LmNsYXNzTGlzdC50b2dnbGUoJ25vVHJhbnNpdGlvbicsIGZhbHNlKTtcblx0XHRcdH0sIDApO1xuXHRcdH0pKTtcblxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuYnV0dG9ucy5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdGNvbnN0IGkgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRoaXMuX2VsZW1lbnRzLmJ1dHRvbnMsIHRoaXMuX21lbnVJZC5yZWFkKHJlYWRlciksIHtcblx0XHRcdFx0b3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbi5WRVJUSUNBTCxcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0XHRwcmltYXJ5R3JvdXA6IGcgPT4gZy5zdGFydHNXaXRoKCdwcmltYXJ5JyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG92ZXJmbG93QmVoYXZpb3I6IHsgbWF4SXRlbXM6IHRoaXMuX2lzU21hbGwucmVhZChyZWFkZXIpID8gMSA6IDMgfSxcblx0XHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuSWdub3JlLFxuXHRcdFx0XHRhY3Rpb25SdW5uZXI6IHN0b3JlLmFkZChuZXcgQWN0aW9uUnVubmVyV2l0aENvbnRleHQoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW0gPSB0aGlzLl9pdGVtLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRjb25zdCBtYXBwaW5nID0gaXRlbS5tYXBwaW5nO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRtYXBwaW5nLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxXaXRoTW9kaWZpZWRDaGFuZ2VzOiBndXR0ZXIuY29tcHV0ZVN0YWdlZFZhbHVlKG1hcHBpbmcpLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6IGl0ZW0ub3JpZ2luYWxVcmksXG5cdFx0XHRcdFx0XHRtb2RpZmllZFVyaTogaXRlbS5tb2RpZmllZFVyaSxcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBEaWZmRWRpdG9yU2VsZWN0aW9uSHVua1Rvb2xiYXJDb250ZXh0O1xuXHRcdFx0XHR9KSksXG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRzdG9yZS5hZGQoaS5vbkRpZENoYW5nZU1lbnVJdGVtcygoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9sYXN0SXRlbVJhbmdlKSB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fbGFzdEl0ZW1SYW5nZSwgdGhpcy5fbGFzdFZpZXdSYW5nZSEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGFzdEl0ZW1SYW5nZTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RWaWV3UmFuZ2U6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdGxheW91dChpdGVtUmFuZ2U6IE9mZnNldFJhbmdlLCB2aWV3UmFuZ2U6IE9mZnNldFJhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdEl0ZW1SYW5nZSA9IGl0ZW1SYW5nZTtcblx0XHR0aGlzLl9sYXN0Vmlld1JhbmdlID0gdmlld1JhbmdlO1xuXG5cdFx0bGV0IGl0ZW1IZWlnaHQgPSB0aGlzLl9lbGVtZW50cy5idXR0b25zLmNsaWVudEhlaWdodDtcblx0XHR0aGlzLl9pc1NtYWxsLnNldCh0aGlzLl9pdGVtLmdldCgpLm1hcHBpbmcub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyID09PSAxICYmIGl0ZW1SYW5nZS5sZW5ndGggPCAzMCwgdW5kZWZpbmVkKTtcblx0XHQvLyBJdGVtIG1pZ2h0IGhhdmUgY2hhbmdlZFxuXHRcdGl0ZW1IZWlnaHQgPSB0aGlzLl9lbGVtZW50cy5idXR0b25zLmNsaWVudEhlaWdodDtcblxuXHRcdGNvbnN0IG1pZGRsZUhlaWdodCA9IGl0ZW1SYW5nZS5sZW5ndGggLyAyIC0gaXRlbUhlaWdodCAvIDI7XG5cblx0XHRjb25zdCBtYXJnaW4gPSBpdGVtSGVpZ2h0O1xuXG5cdFx0bGV0IGVmZmVjdGl2ZUNoZWNrYm94VG9wID0gaXRlbVJhbmdlLnN0YXJ0ICsgbWlkZGxlSGVpZ2h0O1xuXG5cdFx0Y29uc3QgcHJlZmVycmVkVmlld1BvcnRSYW5nZSA9IE9mZnNldFJhbmdlLnRyeUNyZWF0ZShcblx0XHRcdG1hcmdpbixcblx0XHRcdHZpZXdSYW5nZS5lbmRFeGNsdXNpdmUgLSBtYXJnaW4gLSBpdGVtSGVpZ2h0XG5cdFx0KTtcblxuXHRcdGNvbnN0IHByZWZlcnJlZFBhcmVudFJhbmdlID0gT2Zmc2V0UmFuZ2UudHJ5Q3JlYXRlKFxuXHRcdFx0aXRlbVJhbmdlLnN0YXJ0ICsgbWFyZ2luLFxuXHRcdFx0aXRlbVJhbmdlLmVuZEV4Y2x1c2l2ZSAtIGl0ZW1IZWlnaHQgLSBtYXJnaW5cblx0XHQpO1xuXG5cdFx0aWYgKHByZWZlcnJlZFBhcmVudFJhbmdlICYmIHByZWZlcnJlZFZpZXdQb3J0UmFuZ2UgJiYgcHJlZmVycmVkUGFyZW50UmFuZ2Uuc3RhcnQgPCBwcmVmZXJyZWRQYXJlbnRSYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdGVmZmVjdGl2ZUNoZWNrYm94VG9wID0gcHJlZmVycmVkVmlld1BvcnRSYW5nZS5jbGlwKGVmZmVjdGl2ZUNoZWNrYm94VG9wKTtcblx0XHRcdGVmZmVjdGl2ZUNoZWNrYm94VG9wID0gcHJlZmVycmVkUGFyZW50UmFuZ2UuY2xpcChlZmZlY3RpdmVDaGVja2JveFRvcCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWxlbWVudHMuYnV0dG9ucy5zdHlsZS50b3AgPSBgJHtlZmZlY3RpdmVDaGVja2JveFRvcCAtIGl0ZW1SYW5nZS5zdGFydH1weGA7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEaWZmRWRpdG9yU2VsZWN0aW9uSHVua1Rvb2xiYXJDb250ZXh0IHtcblx0bWFwcGluZzogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgb3JpZ2luYWwgdGV4dCB3aXRoIHRoZSBzZWxlY3RlZCBtb2RpZmllZCBjaGFuZ2VzIGFwcGxpZWQuXG5cdCovXG5cdG9yaWdpbmFsV2l0aE1vZGlmaWVkQ2hhbmdlczogc3RyaW5nO1xuXG5cdG1vZGlmaWVkVXJpOiBVUkk7XG5cdG9yaWdpbmFsVXJpOiBVUkk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVyx1QkFBdUIsU0FBUztBQUVwRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGtCQUFrQjtBQUMzQixTQUFzQixTQUFTLGtCQUFrQixTQUFTLG1CQUFtQixtQkFBbUIscUJBQXFCLHVCQUF1QjtBQUU1SSxTQUFTLG9CQUFvQiw0QkFBNEI7QUFDekQsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUywwQkFBMEI7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QUFBLFFBQ0Esa0JBQWtCLEVBQUUsVUFBVSxLQUFLLFNBQVMsS0FBSyxNQUFNLElBQUksSUFBSSxFQUFFO0FBQUEsUUFDakUsb0JBQW9CLG1CQUFtQjtBQUFBLFFBQ3ZDLGNBQWMsTUFBTSxJQUFJLElBQUksd0JBQXdCLE1BQU07QUFDekQsZ0JBQU0sT0FBTyxLQUFLLE1BQU0sS0FBSyxNQUFTO0FBQ3RDLGdCQUFNLFVBQVUsS0FBSztBQUNyQixpQkFBTztBQUFBLFlBQ047QUFBQSxZQUNBLDZCQUE2QixPQUFPLG1CQUFtQixPQUFPO0FBQUEsWUFDOUQsYUFBYSxLQUFLO0FBQUEsWUFDbEIsYUFBYSxLQUFLO0FBQUEsVUFDbkI7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLFFBQ0YsYUFBYTtBQUFBLFVBQ1osbUJBQW1CO0FBQUEsUUFDcEI7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLFlBQU0sSUFBSSxFQUFFLHFCQUFxQixNQUFNO0FBQ3RDLFlBQUksS0FBSyxnQkFBZ0I7QUFDeEIsZUFBSyxPQUFPLEtBQUssZ0JBQWdCLEtBQUssY0FBZTtBQUFBLFFBQ3REO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNILENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUtBLE9BQU8sV0FBd0IsV0FBOEI7QUFDNUQsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyxpQkFBaUI7QUFFdEIsUUFBSSxhQUFhLEtBQUssVUFBVSxRQUFRO0FBQ3hDLFNBQUssU0FBUyxJQUFJLEtBQUssTUFBTSxJQUFJLEVBQUUsUUFBUSxTQUFTLG9CQUFvQixLQUFLLFVBQVUsU0FBUyxJQUFJLE1BQVM7QUFFN0csaUJBQWEsS0FBSyxVQUFVLFFBQVE7QUFFcEMsVUFBTSxlQUFlLFVBQVUsU0FBUyxJQUFJLGFBQWE7QUFFekQsVUFBTSxTQUFTO0FBRWYsUUFBSSx1QkFBdUIsVUFBVSxRQUFRO0FBRTdDLFVBQU0seUJBQXlCLFlBQVk7QUFBQSxNQUMxQztBQUFBLE1BQ0EsVUFBVSxlQUFlLFNBQVM7QUFBQSxJQUNuQztBQUVBLFVBQU0sdUJBQXVCLFlBQVk7QUFBQSxNQUN4QyxVQUFVLFFBQVE7QUFBQSxNQUNsQixVQUFVLGVBQWUsYUFBYTtBQUFBLElBQ3ZDO0FBRUEsUUFBSSx3QkFBd0IsMEJBQTBCLHFCQUFxQixRQUFRLHFCQUFxQixjQUFjO0FBQ3JILDZCQUF1Qix1QkFBdUIsS0FBSyxvQkFBb0I7QUFDdkUsNkJBQXVCLHFCQUFxQixLQUFLLG9CQUFvQjtBQUFBLElBQ3RFO0FBRUEsU0FBSyxVQUFVLFFBQVEsTUFBTSxNQUFNLEdBQUcsdUJBQXVCLFVBQVUsS0FBSztBQUFBLEVBQzdFO0FBQ0Q7QUFoSE0sY0FBTjtBQUFBLEVBWUc7QUFBQSxHQVpHOyIsCiAgIm5hbWVzIjogWyJyZWFkZXIiLCAiYyJdCn0K
