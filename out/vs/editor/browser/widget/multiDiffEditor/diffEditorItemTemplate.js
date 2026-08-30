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
import { addDisposableListener, EventHelper, EventType, h } from "../../../../base/browser/dom.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derived, globalTransaction, observableValue } from "../../../../base/common/observable.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { observableCodeEditor } from "../../observableCodeEditor.js";
import { DiffEditorWidget } from "../diffEditor/diffEditorWidget.js";
import { ActionRunnerWithContext } from "./utils.js";
import { MultiDiffEditorItemLabelKind } from "./workbenchUIElementFactory.js";
class TemplateData {
  constructor(viewModel, deltaScrollVertical) {
    this.viewModel = viewModel;
    this.deltaScrollVertical = deltaScrollVertical;
  }
  getId() {
    return this.viewModel;
  }
}
let DiffEditorItemTemplate = class extends Disposable {
  constructor(_container, _overflowWidgetsDomNode, _workbenchUIElementFactory, _optionsOverride, _instantiationService, _parentContextKeyService) {
    super();
    this._container = _container;
    this._overflowWidgetsDomNode = _overflowWidgetsDomNode;
    this._workbenchUIElementFactory = _workbenchUIElementFactory;
    this._optionsOverride = _optionsOverride;
    this._instantiationService = _instantiationService;
    this._viewModel = observableValue(this, void 0);
    this._collapsed = derived(this, (reader) => this._viewModel.read(reader)?.collapsed.read(reader));
    this._editorContentHeight = observableValue(this, 500);
    this.contentHeight = derived(this, (reader) => {
      const h2 = this._collapsed.read(reader) ? 0 : this._editorContentHeight.read(reader);
      return h2 + this._outerEditorHeight;
    });
    this._modifiedContentWidth = observableValue(this, 0);
    this._modifiedWidth = observableValue(this, 0);
    this._originalContentWidth = observableValue(this, 0);
    this._originalWidth = observableValue(this, 0);
    this.maxScroll = derived(this, (reader) => {
      const scroll1 = this._modifiedContentWidth.read(reader) - this._modifiedWidth.read(reader);
      const scroll2 = this._originalContentWidth.read(reader) - this._originalWidth.read(reader);
      if (scroll1 > scroll2) {
        return { maxScroll: scroll1, width: this._modifiedWidth.read(reader) };
      } else {
        return { maxScroll: scroll2, width: this._originalWidth.read(reader) };
      }
    });
    this._elements = h("div.multiDiffEntry", [
      h("div.header@header", [
        h("div.header-content", [
          h("div.collapse-button@collapseButton"),
          h("div.file-path", [
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            h("div.title.modified.show-file-icons@primaryPath", []),
            h("div.status.deleted@status", ["R"]),
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            h("div.title.original.show-file-icons@secondaryPath", [])
          ]),
          h("div.actions@actions")
        ])
      ]),
      h("div.editorParent", [
        h("div.editorContainer@editor")
      ])
    ]);
    this.editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
      overflowWidgetsDomNode: this._overflowWidgetsDomNode,
      fixedOverflowWidgets: true
    }, {}));
    this.isModifedFocused = observableCodeEditor(this.editor.getModifiedEditor()).isFocused;
    this.isOriginalFocused = observableCodeEditor(this.editor.getOriginalEditor()).isFocused;
    this.isFocused = derived(this, (reader) => this.isModifedFocused.read(reader) || this.isOriginalFocused.read(reader));
    this._resourceLabel = this._workbenchUIElementFactory.createResourceLabel ? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.primaryPath, MultiDiffEditorItemLabelKind.Primary)) : void 0;
    this._resourceLabel2 = this._workbenchUIElementFactory.createResourceLabel ? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.secondaryPath, MultiDiffEditorItemLabelKind.Secondary)) : void 0;
    this._dataStore = this._register(new DisposableStore());
    this._headerHeight = 40;
    this._lastScrollTop = -1;
    this._isSettingScrollTop = false;
    const btn = this._register(new Button(this._elements.collapseButton, {}));
    this._register(autorun((reader) => {
      btn.element.className = "";
      btn.icon = this._collapsed.read(reader) ? Codicon.chevronRight : Codicon.chevronDown;
    }));
    this._register(btn.onDidClick(() => {
      this._viewModel.get()?.collapsed.set(!this._collapsed.get(), void 0);
    }));
    if (this._workbenchUIElementFactory.handleHeaderMiddleClick) {
      this._register(addDisposableListener(this._elements.header, EventType.AUXCLICK, (e) => {
        if (e.button !== 1) {
          return;
        }
        const viewModel = this._viewModel.get();
        const resource = viewModel?.modifiedUri ?? viewModel?.originalUri;
        if (resource && this._workbenchUIElementFactory.handleHeaderMiddleClick?.(resource)) {
          EventHelper.stop(e, true);
        }
      }));
    }
    if (this._workbenchUIElementFactory.headerClickToCollapse) {
      this._elements.header.tabIndex = 0;
      this._elements.header.setAttribute("role", "button");
      this._register(addDisposableListener(this._elements.header, EventType.CLICK, (e) => {
        const target = e.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest(".actions") || target.closest(".collapse-button")) {
          return;
        }
        this._viewModel.get()?.collapsed.set(!this._collapsed.get(), void 0);
      }));
      this._register(addDisposableListener(this._elements.header, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const target = e.target;
          if (target instanceof Element && (target.closest(".actions") || target.closest(".collapse-button"))) {
            return;
          }
          e.preventDefault();
          this._viewModel.get()?.collapsed.set(!this._collapsed.get(), void 0);
        }
      }));
    }
    this._register(autorun((reader) => {
      const collapsed = this._collapsed.read(reader);
      this._elements.editor.style.display = collapsed ? "none" : "block";
      if (this._workbenchUIElementFactory.headerClickToCollapse) {
        this._elements.header.setAttribute("aria-expanded", String(!collapsed));
      }
    }));
    this._register(this.editor.getModifiedEditor().onDidLayoutChange((e) => {
      const width = this.editor.getModifiedEditor().getLayoutInfo().contentWidth;
      this._modifiedWidth.set(width, void 0);
    }));
    this._register(this.editor.getOriginalEditor().onDidLayoutChange((e) => {
      const width = this.editor.getOriginalEditor().getLayoutInfo().contentWidth;
      this._originalWidth.set(width, void 0);
    }));
    this._register(this.editor.onDidContentSizeChange((e) => {
      globalTransaction((tx) => {
        this._editorContentHeight.set(e.contentHeight, tx);
        this._modifiedContentWidth.set(this.editor.getModifiedEditor().getContentWidth(), tx);
        this._originalContentWidth.set(this.editor.getOriginalEditor().getContentWidth(), tx);
      });
    }));
    this._register(this.editor.getOriginalEditor().onDidScrollChange((e) => {
      if (this._isSettingScrollTop) {
        return;
      }
      if (!e.scrollTopChanged || !this._data) {
        return;
      }
      const delta = e.scrollTop - this._lastScrollTop;
      this._data.deltaScrollVertical(delta);
    }));
    this._register(autorun((reader) => {
      const isActive = this._viewModel.read(reader)?.isActive.read(reader);
      this._elements.root.classList.toggle("active", isActive);
    }));
    this._container.appendChild(this._elements.root);
    this._outerEditorHeight = this._headerHeight;
    this._contextKeyService = this._register(_parentContextKeyService.createScoped(this._elements.actions));
    const ctxAllUnchangedRegionsShown = EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown.bindTo(this._contextKeyService);
    this._register(autorun((reader) => {
      ctxAllUnchangedRegionsShown.set(this.editor.allUnchangedRegionsShown.read(reader));
    }));
    const instantiationService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
    this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.actions, MenuId.MultiDiffEditorFileToolbar, {
      actionRunner: this._register(new ActionRunnerWithContext(() => this._viewModel.get()?.modifiedUri ?? this._viewModel.get()?.originalUri)),
      highlightToggledItems: true,
      menuOptions: {
        shouldForwardArgs: true
      },
      toolbarOptions: { primaryGroup: (g) => g.startsWith("navigation") },
      actionViewItemProvider: (action, options) => this._workbenchUIElementFactory.createToolbarActionViewItem?.(action, options) ?? createActionViewItem(instantiationService, action, options)
    }));
  }
  setScrollLeft(left) {
    if (this._modifiedContentWidth.get() - this._modifiedWidth.get() > this._originalContentWidth.get() - this._originalWidth.get()) {
      this.editor.getModifiedEditor().setScrollLeft(left);
    } else {
      this.editor.getOriginalEditor().setScrollLeft(left);
    }
  }
  setData(data) {
    this._data = data;
    const optionsOverride = this._optionsOverride;
    function updateOptions(options) {
      return {
        ...options,
        ...optionsOverride?.get(),
        scrollBeyondLastLine: false,
        hideUnchangedRegions: {
          enabled: true
        },
        scrollbar: {
          vertical: "hidden",
          horizontal: "hidden",
          handleMouseWheel: false,
          useShadows: false
        },
        renderOverviewRuler: false,
        fixedOverflowWidgets: true,
        overviewRulerBorder: false
      };
    }
    if (!data) {
      globalTransaction((tx) => {
        this._viewModel.set(void 0, tx);
        this.editor.setDiffModel(null, tx);
        this._dataStore.clear();
      });
      return;
    }
    const value = data.viewModel.documentDiffItem;
    globalTransaction((tx) => {
      this._resourceLabel?.setUri(data.viewModel.modifiedUri ?? data.viewModel.originalUri, { strikethrough: data.viewModel.modifiedUri === void 0 });
      let isRenamed = false;
      let isDeleted = false;
      let isAdded = false;
      let flag = "";
      if (data.viewModel.modifiedUri && data.viewModel.originalUri && data.viewModel.modifiedUri.path !== data.viewModel.originalUri.path) {
        flag = "R";
        isRenamed = true;
      } else if (!data.viewModel.modifiedUri) {
        flag = "D";
        isDeleted = true;
      } else if (!data.viewModel.originalUri) {
        flag = "A";
        isAdded = true;
      }
      this._elements.status.classList.toggle("renamed", isRenamed);
      this._elements.status.classList.toggle("deleted", isDeleted);
      this._elements.status.classList.toggle("added", isAdded);
      this._elements.status.innerText = flag;
      this._resourceLabel2?.setUri(isRenamed ? data.viewModel.originalUri : void 0, { strikethrough: true });
      this._dataStore.clear();
      this._viewModel.set(data.viewModel, tx);
      this.editor.setDiffModel(data.viewModel.diffEditorViewModelRef, tx);
      this.editor.updateOptions(updateOptions(value.options ?? {}));
    });
    if (value.onOptionsDidChange) {
      this._dataStore.add(value.onOptionsDidChange(() => {
        this.editor.updateOptions(updateOptions(value.options ?? {}));
      }));
    }
    if (optionsOverride) {
      this._dataStore.add(autorun((reader) => {
        optionsOverride.read(reader);
        this.editor.updateOptions(updateOptions(value.options ?? {}));
      }));
    }
    data.viewModel.isAlive.recomputeInitiallyAndOnChange(this._dataStore, (value2) => {
      if (!value2) {
        this.setData(void 0);
      }
    });
    if (data.viewModel.documentDiffItem.contextKeys) {
      for (const [key, value2] of Object.entries(data.viewModel.documentDiffItem.contextKeys)) {
        this._contextKeyService.createKey(key, value2);
      }
    }
  }
  render(verticalRange, width, editorScroll, viewPort) {
    this._elements.root.style.visibility = "visible";
    this._elements.root.style.top = `${verticalRange.start}px`;
    this._elements.root.style.height = `${verticalRange.length}px`;
    this._elements.root.style.width = `${width}px`;
    this._elements.root.style.position = "absolute";
    const maxDelta = verticalRange.length - this._headerHeight;
    const delta = Math.max(0, Math.min(viewPort.start - verticalRange.start, maxDelta));
    this._elements.header.style.transform = `translateY(${delta}px)`;
    globalTransaction((tx) => {
      this.editor.layout({
        width: width - 2 * 8 - 2 * 1,
        height: verticalRange.length - this._outerEditorHeight
      });
    });
    try {
      this._isSettingScrollTop = true;
      this._lastScrollTop = editorScroll;
      this.editor.getOriginalEditor().setScrollTop(editorScroll);
    } finally {
      this._isSettingScrollTop = false;
    }
    this._elements.header.classList.toggle("shadow", delta > 0 || editorScroll > 0);
    this._elements.header.classList.toggle("collapsed", delta === maxDelta);
  }
  hide() {
    this._elements.root.style.top = `-100000px`;
    this._elements.root.style.visibility = "hidden";
  }
};
DiffEditorItemTemplate = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], DiffEditorItemTemplate);
export {
  DiffEditorItemTemplate,
  TemplateData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcbXVsdGlEaWZmRWRpdG9yXFxkaWZmRWRpdG9ySXRlbVRlbXBsYXRlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRIZWxwZXIsIEV2ZW50VHlwZSwgaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBnbG9iYWxUcmFuc2FjdGlvbiwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgdHlwZSBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vZGlmZkVkaXRvci9kaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWwgfSBmcm9tICcuL211bHRpRGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJT2JqZWN0RGF0YSwgSVBvb2xlZE9iamVjdCB9IGZyb20gJy4vb2JqZWN0UG9vbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXJXaXRoQ29udGV4dCB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnksIE11bHRpRGlmZkVkaXRvckl0ZW1MYWJlbEtpbmQgfSBmcm9tICcuL3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVtcGxhdGVEYXRhIGltcGxlbWVudHMgSU9iamVjdERhdGEge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlld01vZGVsOiBEb2N1bWVudERpZmZJdGVtVmlld01vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSBkZWx0YVNjcm9sbFZlcnRpY2FsOiAoZGVsdGE6IG51bWJlcikgPT4gdm9pZCxcblx0KSB7IH1cblxuXG5cdGdldElkKCk6IHVua25vd24ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlmZkVkaXRvckl0ZW1UZW1wbGF0ZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUG9vbGVkT2JqZWN0PFRlbXBsYXRlRGF0YT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGFwc2VkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckNvbnRlbnRIZWlnaHQ7XG5cdHB1YmxpYyByZWFkb25seSBjb250ZW50SGVpZ2h0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkQ29udGVudFdpZHRoO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFdpZHRoO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbENvbnRlbnRXaWR0aDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxXaWR0aDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbWF4U2Nyb2xsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnRzO1xuXG5cdHB1YmxpYyByZWFkb25seSBlZGl0b3I7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpc01vZGlmZWRGb2N1c2VkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzT3JpZ2luYWxGb2N1c2VkO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNGb2N1c2VkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlTGFiZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VMYWJlbDI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3V0ZXJFZGl0b3JIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElTY29wZWRDb250ZXh0S2V5U2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX292ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtiZW5jaFVJRWxlbWVudEZhY3Rvcnk6IElXb3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnNPdmVycmlkZTogSU9ic2VydmFibGU8SURpZmZFZGl0b3JPcHRpb25zPiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBfcGFyZW50Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl92aWV3TW9kZWwgPSBvYnNlcnZhYmxlVmFsdWU8RG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbCB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9jb2xsYXBzZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl92aWV3TW9kZWwucmVhZChyZWFkZXIpPy5jb2xsYXBzZWQucmVhZChyZWFkZXIpKTtcblx0XHR0aGlzLl9lZGl0b3JDb250ZW50SGVpZ2h0ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgNTAwKTtcblx0XHR0aGlzLmNvbnRlbnRIZWlnaHQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBoID0gdGhpcy5fY29sbGFwc2VkLnJlYWQocmVhZGVyKSA/IDAgOiB0aGlzLl9lZGl0b3JDb250ZW50SGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBoICsgdGhpcy5fb3V0ZXJFZGl0b3JIZWlnaHQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5fbW9kaWZpZWRDb250ZW50V2lkdGggPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0XHR0aGlzLl9tb2RpZmllZFdpZHRoID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgMCk7XG5cdFx0dGhpcy5fb3JpZ2luYWxDb250ZW50V2lkdGggPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0XHR0aGlzLl9vcmlnaW5hbFdpZHRoID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgMCk7XG5cdFx0dGhpcy5tYXhTY3JvbGwgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzY3JvbGwxID0gdGhpcy5fbW9kaWZpZWRDb250ZW50V2lkdGgucmVhZChyZWFkZXIpIC0gdGhpcy5fbW9kaWZpZWRXaWR0aC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzY3JvbGwyID0gdGhpcy5fb3JpZ2luYWxDb250ZW50V2lkdGgucmVhZChyZWFkZXIpIC0gdGhpcy5fb3JpZ2luYWxXaWR0aC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc2Nyb2xsMSA+IHNjcm9sbDIpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWF4U2Nyb2xsOiBzY3JvbGwxLCB3aWR0aDogdGhpcy5fbW9kaWZpZWRXaWR0aC5yZWFkKHJlYWRlcikgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7IG1heFNjcm9sbDogc2Nyb2xsMiwgd2lkdGg6IHRoaXMuX29yaWdpbmFsV2lkdGgucmVhZChyZWFkZXIpIH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fZWxlbWVudHMgPSBoKCdkaXYubXVsdGlEaWZmRW50cnknLCBbXG5cdFx0XHRoKCdkaXYuaGVhZGVyQGhlYWRlcicsIFtcblx0XHRcdFx0aCgnZGl2LmhlYWRlci1jb250ZW50JywgW1xuXHRcdFx0XHRcdGgoJ2Rpdi5jb2xsYXBzZS1idXR0b25AY29sbGFwc2VCdXR0b24nKSxcblx0XHRcdFx0XHRoKCdkaXYuZmlsZS1wYXRoJywgW1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdFx0XHRoKCdkaXYudGl0bGUubW9kaWZpZWQuc2hvdy1maWxlLWljb25zQHByaW1hcnlQYXRoJywgW10gYXMgYW55KSxcblx0XHRcdFx0XHRcdGgoJ2Rpdi5zdGF0dXMuZGVsZXRlZEBzdGF0dXMnLCBbJ1InXSksXG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0XHRcdGgoJ2Rpdi50aXRsZS5vcmlnaW5hbC5zaG93LWZpbGUtaWNvbnNAc2Vjb25kYXJ5UGF0aCcsIFtdIGFzIGFueSksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0aCgnZGl2LmFjdGlvbnNAYWN0aW9ucycpLFxuXHRcdFx0XHRdKSxcblx0XHRcdF0pLFxuXG5cdFx0XHRoKCdkaXYuZWRpdG9yUGFyZW50JywgW1xuXHRcdFx0XHRoKCdkaXYuZWRpdG9yQ29udGFpbmVyQGVkaXRvcicpLFxuXHRcdFx0XSlcblx0XHRdKSBhcyBSZWNvcmQ8c3RyaW5nLCBIVE1MRWxlbWVudD47XG5cdFx0dGhpcy5lZGl0b3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9yV2lkZ2V0LCB0aGlzLl9lbGVtZW50cy5lZGl0b3IsIHtcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IHRoaXMuX292ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRmaXhlZE92ZXJmbG93V2lkZ2V0czogdHJ1ZVxuXHRcdH0sIHt9KSk7XG5cdFx0dGhpcy5pc01vZGlmZWRGb2N1c2VkID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5lZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKSkuaXNGb2N1c2VkO1xuXHRcdHRoaXMuaXNPcmlnaW5hbEZvY3VzZWQgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLmVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpKS5pc0ZvY3VzZWQ7XG5cdFx0dGhpcy5pc0ZvY3VzZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLmlzTW9kaWZlZEZvY3VzZWQucmVhZChyZWFkZXIpIHx8IHRoaXMuaXNPcmlnaW5hbEZvY3VzZWQucmVhZChyZWFkZXIpKTtcblx0XHR0aGlzLl9yZXNvdXJjZUxhYmVsID0gdGhpcy5fd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeS5jcmVhdGVSZXNvdXJjZUxhYmVsXG5cdFx0XHQ/IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuY3JlYXRlUmVzb3VyY2VMYWJlbCh0aGlzLl9lbGVtZW50cy5wcmltYXJ5UGF0aCwgTXVsdGlEaWZmRWRpdG9ySXRlbUxhYmVsS2luZC5QcmltYXJ5KSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Jlc291cmNlTGFiZWwyID0gdGhpcy5fd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeS5jcmVhdGVSZXNvdXJjZUxhYmVsXG5cdFx0XHQ/IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuY3JlYXRlUmVzb3VyY2VMYWJlbCh0aGlzLl9lbGVtZW50cy5zZWNvbmRhcnlQYXRoLCBNdWx0aURpZmZFZGl0b3JJdGVtTGFiZWxLaW5kLlNlY29uZGFyeSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kYXRhU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuX2hlYWRlckhlaWdodCA9IDQwO1xuXHRcdHRoaXMuX2xhc3RTY3JvbGxUb3AgPSAtMTtcblx0XHR0aGlzLl9pc1NldHRpbmdTY3JvbGxUb3AgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5fZWxlbWVudHMuY29sbGFwc2VCdXR0b24sIHt9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRidG4uZWxlbWVudC5jbGFzc05hbWUgPSAnJztcblx0XHRcdGJ0bi5pY29uID0gdGhpcy5fY29sbGFwc2VkLnJlYWQocmVhZGVyKSA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5fdmlld01vZGVsLmdldCgpPy5jb2xsYXBzZWQuc2V0KCF0aGlzLl9jb2xsYXBzZWQuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuaGFuZGxlSGVhZGVyTWlkZGxlQ2xpY2spIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50cy5oZWFkZXIsIEV2ZW50VHlwZS5BVVhDTElDSywgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmJ1dHRvbiAhPT0gMSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX3ZpZXdNb2RlbC5nZXQoKTtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB2aWV3TW9kZWw/Lm1vZGlmaWVkVXJpID8/IHZpZXdNb2RlbD8ub3JpZ2luYWxVcmk7XG5cdFx0XHRcdGlmIChyZXNvdXJjZSAmJiB0aGlzLl93b3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LmhhbmRsZUhlYWRlck1pZGRsZUNsaWNrPy4ocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl93b3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LmhlYWRlckNsaWNrVG9Db2xsYXBzZSkge1xuXHRcdFx0Ly8gTWFrZSB0aGUgaGVhZGVyIGNsaWNrYWJsZSB0byB0b2dnbGUgY29sbGFwc2UvZXhwYW5kXG5cdFx0XHR0aGlzLl9lbGVtZW50cy5oZWFkZXIudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuaGVhZGVyLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VsZW1lbnRzLmhlYWRlciwgRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0XHQvLyBEb24ndCB0b2dnbGUgaWYgY2xpY2tpbmcgb24gYWN0aW9ucyBvciB0aGUgY29sbGFwc2UgYnV0dG9uIGl0c2VsZiAoYWxyZWFkeSBoYW5kbGVkKVxuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcblx0XHRcdFx0aWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRhcmdldC5jbG9zZXN0KCcuYWN0aW9ucycpIHx8IHRhcmdldC5jbG9zZXN0KCcuY29sbGFwc2UtYnV0dG9uJykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdmlld01vZGVsLmdldCgpPy5jb2xsYXBzZWQuc2V0KCF0aGlzLl9jb2xsYXBzZWQuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lbGVtZW50cy5oZWFkZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGUpID0+IHtcblx0XHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldDtcblx0XHRcdFx0XHRpZiAodGFyZ2V0IGluc3RhbmNlb2YgRWxlbWVudCAmJiAodGFyZ2V0LmNsb3Nlc3QoJy5hY3Rpb25zJykgfHwgdGFyZ2V0LmNsb3Nlc3QoJy5jb2xsYXBzZS1idXR0b24nKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdHRoaXMuX3ZpZXdNb2RlbC5nZXQoKT8uY29sbGFwc2VkLnNldCghdGhpcy5fY29sbGFwc2VkLmdldCgpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5fY29sbGFwc2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLmVkaXRvci5zdHlsZS5kaXNwbGF5ID0gY29sbGFwc2VkID8gJ25vbmUnIDogJ2Jsb2NrJztcblx0XHRcdGlmICh0aGlzLl93b3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LmhlYWRlckNsaWNrVG9Db2xsYXBzZSkge1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50cy5oZWFkZXIuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgU3RyaW5nKCFjb2xsYXBzZWQpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLm9uRGlkTGF5b3V0Q2hhbmdlKGUgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLmVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLmdldExheW91dEluZm8oKS5jb250ZW50V2lkdGg7XG5cdFx0XHR0aGlzLl9tb2RpZmllZFdpZHRoLnNldCh3aWR0aCwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpLm9uRGlkTGF5b3V0Q2hhbmdlKGUgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLmVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpLmdldExheW91dEluZm8oKS5jb250ZW50V2lkdGg7XG5cdFx0XHR0aGlzLl9vcmlnaW5hbFdpZHRoLnNldCh3aWR0aCwgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENvbnRlbnRTaXplQ2hhbmdlKGUgPT4ge1xuXHRcdFx0Z2xvYmFsVHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JDb250ZW50SGVpZ2h0LnNldChlLmNvbnRlbnRIZWlnaHQsIHR4KTtcblx0XHRcdFx0dGhpcy5fbW9kaWZpZWRDb250ZW50V2lkdGguc2V0KHRoaXMuZWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkuZ2V0Q29udGVudFdpZHRoKCksIHR4KTtcblx0XHRcdFx0dGhpcy5fb3JpZ2luYWxDb250ZW50V2lkdGguc2V0KHRoaXMuZWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkuZ2V0Q29udGVudFdpZHRoKCksIHR4KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkub25EaWRTY3JvbGxDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNTZXR0aW5nU2Nyb2xsVG9wKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFlLnNjcm9sbFRvcENoYW5nZWQgfHwgIXRoaXMuX2RhdGEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVsdGEgPSBlLnNjcm9sbFRvcCAtIHRoaXMuX2xhc3RTY3JvbGxUb3A7XG5cdFx0XHR0aGlzLl9kYXRhLmRlbHRhU2Nyb2xsVmVydGljYWwoZGVsdGEpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gdGhpcy5fdmlld01vZGVsLnJlYWQocmVhZGVyKT8uaXNBY3RpdmUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLCBpc0FjdGl2ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2VsZW1lbnRzLnJvb3QpO1xuXHRcdHRoaXMuX291dGVyRWRpdG9ySGVpZ2h0ID0gdGhpcy5faGVhZGVySGVpZ2h0O1xuXG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihfcGFyZW50Q29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuX2VsZW1lbnRzLmFjdGlvbnMpKTtcblx0XHRjb25zdCBjdHhBbGxVbmNoYW5nZWRSZWdpb25zU2hvd24gPSBFZGl0b3JDb250ZXh0S2V5cy5tdWx0aURpZmZFZGl0b3JJdGVtQWxsVW5jaGFuZ2VkUmVnaW9uc1Nob3duLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y3R4QWxsVW5jaGFuZ2VkUmVnaW9uc1Nob3duLnNldCh0aGlzLmVkaXRvci5hbGxVbmNoYW5nZWRSZWdpb25zU2hvd24ucmVhZChyZWFkZXIpKTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2VdKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLl9lbGVtZW50cy5hY3Rpb25zLCBNZW51SWQuTXVsdGlEaWZmRWRpdG9yRmlsZVRvb2xiYXIsIHtcblx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvblJ1bm5lcldpdGhDb250ZXh0KCgpID0+ICh0aGlzLl92aWV3TW9kZWwuZ2V0KCk/Lm1vZGlmaWVkVXJpID8/IHRoaXMuX3ZpZXdNb2RlbC5nZXQoKT8ub3JpZ2luYWxVcmkpKSksXG5cdFx0XHRoaWdobGlnaHRUb2dnbGVkSXRlbXM6IHRydWUsXG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6IGcgPT4gZy5zdGFydHNXaXRoKCduYXZpZ2F0aW9uJykgfSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuY3JlYXRlVG9vbGJhckFjdGlvblZpZXdJdGVtPy4oYWN0aW9uLCBvcHRpb25zKSA/PyBjcmVhdGVBY3Rpb25WaWV3SXRlbShpbnN0YW50aWF0aW9uU2VydmljZSwgYWN0aW9uLCBvcHRpb25zKSxcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Nyb2xsTGVmdChsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbW9kaWZpZWRDb250ZW50V2lkdGguZ2V0KCkgLSB0aGlzLl9tb2RpZmllZFdpZHRoLmdldCgpID4gdGhpcy5fb3JpZ2luYWxDb250ZW50V2lkdGguZ2V0KCkgLSB0aGlzLl9vcmlnaW5hbFdpZHRoLmdldCgpKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5nZXRNb2RpZmllZEVkaXRvcigpLnNldFNjcm9sbExlZnQobGVmdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkuc2V0U2Nyb2xsTGVmdChsZWZ0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhU3RvcmU7XG5cblx0cHJpdmF0ZSBfZGF0YTogVGVtcGxhdGVEYXRhIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyBzZXREYXRhKGRhdGE6IFRlbXBsYXRlRGF0YSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2RhdGEgPSBkYXRhO1xuXHRcdGNvbnN0IG9wdGlvbnNPdmVycmlkZSA9IHRoaXMuX29wdGlvbnNPdmVycmlkZTtcblx0XHRmdW5jdGlvbiB1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElEaWZmRWRpdG9yT3B0aW9ucyk6IElEaWZmRWRpdG9yT3B0aW9ucyB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHQuLi5vcHRpb25zT3ZlcnJpZGU/LmdldCgpLFxuXHRcdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRcdGhpZGVVbmNoYW5nZWRSZWdpb25zOiB7XG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdFx0dmVydGljYWw6ICdoaWRkZW4nLFxuXHRcdFx0XHRcdGhvcml6b250YWw6ICdoaWRkZW4nLFxuXHRcdFx0XHRcdGhhbmRsZU1vdXNlV2hlZWw6IGZhbHNlLFxuXHRcdFx0XHRcdHVzZVNoYWRvd3M6IGZhbHNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW5kZXJPdmVydmlld1J1bGVyOiBmYWxzZSxcblx0XHRcdFx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IHRydWUsXG5cdFx0XHRcdG92ZXJ2aWV3UnVsZXJCb3JkZXI6IGZhbHNlLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdGdsb2JhbFRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdFx0dGhpcy5fdmlld01vZGVsLnNldCh1bmRlZmluZWQsIHR4KTtcblx0XHRcdFx0dGhpcy5lZGl0b3Iuc2V0RGlmZk1vZGVsKG51bGwsIHR4KTtcblx0XHRcdFx0dGhpcy5fZGF0YVN0b3JlLmNsZWFyKCk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IGRhdGEudmlld01vZGVsLmRvY3VtZW50RGlmZkl0ZW07XG5cblx0XHRnbG9iYWxUcmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9yZXNvdXJjZUxhYmVsPy5zZXRVcmkoZGF0YS52aWV3TW9kZWwubW9kaWZpZWRVcmkgPz8gZGF0YS52aWV3TW9kZWwub3JpZ2luYWxVcmkhLCB7IHN0cmlrZXRocm91Z2g6IGRhdGEudmlld01vZGVsLm1vZGlmaWVkVXJpID09PSB1bmRlZmluZWQgfSk7XG5cblx0XHRcdGxldCBpc1JlbmFtZWQgPSBmYWxzZTtcblx0XHRcdGxldCBpc0RlbGV0ZWQgPSBmYWxzZTtcblx0XHRcdGxldCBpc0FkZGVkID0gZmFsc2U7XG5cdFx0XHRsZXQgZmxhZyA9ICcnO1xuXHRcdFx0aWYgKGRhdGEudmlld01vZGVsLm1vZGlmaWVkVXJpICYmIGRhdGEudmlld01vZGVsLm9yaWdpbmFsVXJpICYmIGRhdGEudmlld01vZGVsLm1vZGlmaWVkVXJpLnBhdGggIT09IGRhdGEudmlld01vZGVsLm9yaWdpbmFsVXJpLnBhdGgpIHtcblx0XHRcdFx0ZmxhZyA9ICdSJztcblx0XHRcdFx0aXNSZW5hbWVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoIWRhdGEudmlld01vZGVsLm1vZGlmaWVkVXJpKSB7XG5cdFx0XHRcdGZsYWcgPSAnRCc7XG5cdFx0XHRcdGlzRGVsZXRlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKCFkYXRhLnZpZXdNb2RlbC5vcmlnaW5hbFVyaSkge1xuXHRcdFx0XHRmbGFnID0gJ0EnO1xuXHRcdFx0XHRpc0FkZGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2VsZW1lbnRzLnN0YXR1cy5jbGFzc0xpc3QudG9nZ2xlKCdyZW5hbWVkJywgaXNSZW5hbWVkKTtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnN0YXR1cy5jbGFzc0xpc3QudG9nZ2xlKCdkZWxldGVkJywgaXNEZWxldGVkKTtcblx0XHRcdHRoaXMuX2VsZW1lbnRzLnN0YXR1cy5jbGFzc0xpc3QudG9nZ2xlKCdhZGRlZCcsIGlzQWRkZWQpO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzLmlubmVyVGV4dCA9IGZsYWc7XG5cblx0XHRcdHRoaXMuX3Jlc291cmNlTGFiZWwyPy5zZXRVcmkoaXNSZW5hbWVkID8gZGF0YS52aWV3TW9kZWwub3JpZ2luYWxVcmkgOiB1bmRlZmluZWQsIHsgc3RyaWtldGhyb3VnaDogdHJ1ZSB9KTtcblxuXHRcdFx0dGhpcy5fZGF0YVN0b3JlLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl92aWV3TW9kZWwuc2V0KGRhdGEudmlld01vZGVsLCB0eCk7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXREaWZmTW9kZWwoZGF0YS52aWV3TW9kZWwuZGlmZkVkaXRvclZpZXdNb2RlbFJlZiwgdHgpO1xuXHRcdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh1cGRhdGVPcHRpb25zKHZhbHVlLm9wdGlvbnMgPz8ge30pKTtcblx0XHR9KTtcblx0XHRpZiAodmFsdWUub25PcHRpb25zRGlkQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLl9kYXRhU3RvcmUuYWRkKHZhbHVlLm9uT3B0aW9uc0RpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnVwZGF0ZU9wdGlvbnModXBkYXRlT3B0aW9ucyh2YWx1ZS5vcHRpb25zID8/IHt9KSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zT3ZlcnJpZGUpIHtcblx0XHRcdHRoaXMuX2RhdGFTdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRvcHRpb25zT3ZlcnJpZGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHVwZGF0ZU9wdGlvbnModmFsdWUub3B0aW9ucyA/PyB7fSkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHRkYXRhLnZpZXdNb2RlbC5pc0FsaXZlLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX2RhdGFTdG9yZSwgdmFsdWUgPT4ge1xuXHRcdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0XHR0aGlzLnNldERhdGEodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChkYXRhLnZpZXdNb2RlbC5kb2N1bWVudERpZmZJdGVtLmNvbnRleHRLZXlzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhLnZpZXdNb2RlbC5kb2N1bWVudERpZmZJdGVtLmNvbnRleHRLZXlzKSkge1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGVhZGVySGVpZ2h0O1xuXG5cdHByaXZhdGUgX2xhc3RTY3JvbGxUb3A7XG5cdHByaXZhdGUgX2lzU2V0dGluZ1Njcm9sbFRvcDtcblxuXHRwdWJsaWMgcmVuZGVyKHZlcnRpY2FsUmFuZ2U6IE9mZnNldFJhbmdlLCB3aWR0aDogbnVtYmVyLCBlZGl0b3JTY3JvbGw6IG51bWJlciwgdmlld1BvcnQ6IE9mZnNldFJhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdHRoaXMuX2VsZW1lbnRzLnJvb3Quc3R5bGUudG9wID0gYCR7dmVydGljYWxSYW5nZS5zdGFydH1weGA7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS5oZWlnaHQgPSBgJHt2ZXJ0aWNhbFJhbmdlLmxlbmd0aH1weGA7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblxuXHRcdC8vIEZvciBzdGlja3kgc2Nyb2xsXG5cdFx0Y29uc3QgbWF4RGVsdGEgPSB2ZXJ0aWNhbFJhbmdlLmxlbmd0aCAtIHRoaXMuX2hlYWRlckhlaWdodDtcblx0XHRjb25zdCBkZWx0YSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHZpZXdQb3J0LnN0YXJ0IC0gdmVydGljYWxSYW5nZS5zdGFydCwgbWF4RGVsdGEpKTtcblx0XHR0aGlzLl9lbGVtZW50cy5oZWFkZXIuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZVkoJHtkZWx0YX1weClgO1xuXG5cdFx0Z2xvYmFsVHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0KHtcblx0XHRcdFx0d2lkdGg6IHdpZHRoIC0gMiAqIDggLSAyICogMSxcblx0XHRcdFx0aGVpZ2h0OiB2ZXJ0aWNhbFJhbmdlLmxlbmd0aCAtIHRoaXMuX291dGVyRWRpdG9ySGVpZ2h0LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2lzU2V0dGluZ1Njcm9sbFRvcCA9IHRydWU7XG5cdFx0XHR0aGlzLl9sYXN0U2Nyb2xsVG9wID0gZWRpdG9yU2Nyb2xsO1xuXHRcdFx0dGhpcy5lZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKS5zZXRTY3JvbGxUb3AoZWRpdG9yU2Nyb2xsKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNTZXR0aW5nU2Nyb2xsVG9wID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWxlbWVudHMuaGVhZGVyLmNsYXNzTGlzdC50b2dnbGUoJ3NoYWRvdycsIGRlbHRhID4gMCB8fCBlZGl0b3JTY3JvbGwgPiAwKTtcblx0XHR0aGlzLl9lbGVtZW50cy5oZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgZGVsdGEgPT09IG1heERlbHRhKTtcblx0fVxuXG5cdHB1YmxpYyBoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VsZW1lbnRzLnJvb3Quc3R5bGUudG9wID0gYC0xMDAwMDBweGA7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7IC8vIFNvbWUgZWRpdG9yIHBhcnRzIGFyZSBzdGlsbCB2aXNpYmxlXG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7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
