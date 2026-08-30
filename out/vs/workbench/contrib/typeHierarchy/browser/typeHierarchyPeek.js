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
import "./media/typeHierarchy.css";
import { Dimension, isKeyboardEvent } from "../../../../base/browser/dom.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { TreeMouseEventTarget } from "../../../../base/browser/ui/tree/tree.js";
import { Color } from "../../../../base/common/color.js";
import { Event } from "../../../../base/common/event.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Range } from "../../../../editor/common/core/range.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { TrackedRangeStickiness, OverviewRulerLane } from "../../../../editor/common/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as peekView from "../../../../editor/contrib/peekView/browser/peekView.js";
import { localize } from "../../../../nls.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IThemeService, themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import * as typeHTree from "./typeHierarchyTree.js";
import { TypeHierarchyDirection } from "../common/typeHierarchy.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
var State = /* @__PURE__ */ ((State2) => {
  State2["Loading"] = "loading";
  State2["Message"] = "message";
  State2["Data"] = "data";
  return State2;
})(State || {});
class LayoutInfo {
  constructor(ratio, height) {
    this.ratio = ratio;
    this.height = height;
  }
  static store(info, storageService) {
    storageService.store("typeHierarchyPeekLayout", JSON.stringify(info), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  static retrieve(storageService) {
    const value = storageService.get("typeHierarchyPeekLayout", StorageScope.PROFILE, "{}");
    const defaultInfo = { ratio: 0.7, height: 17 };
    try {
      return { ...defaultInfo, ...JSON.parse(value) };
    } catch {
      return defaultInfo;
    }
  }
}
class TypeHierarchyTree extends WorkbenchAsyncDataTree {
}
let TypeHierarchyTreePeekWidget = class extends peekView.PeekViewWidget {
  constructor(editor, _where, _direction, themeService, _peekViewService, _editorService, _textModelService, _storageService, _menuService, _contextKeyService, _instantiationService) {
    super(editor, { showFrame: true, showArrow: true, isResizeable: true, isAccessible: true }, _instantiationService);
    this._where = _where;
    this._direction = _direction;
    this._peekViewService = _peekViewService;
    this._editorService = _editorService;
    this._textModelService = _textModelService;
    this._storageService = _storageService;
    this._menuService = _menuService;
    this._contextKeyService = _contextKeyService;
    this._instantiationService = _instantiationService;
    this._treeViewStates = /* @__PURE__ */ new Map();
    this._previewDisposable = new DisposableStore();
    this.create();
    this._peekViewService.addExclusiveWidget(editor, this);
    this._applyTheme(themeService.getColorTheme());
    this._disposables.add(themeService.onDidColorThemeChange(this._applyTheme, this));
    this._disposables.add(this._previewDisposable);
  }
  dispose() {
    LayoutInfo.store(this._layoutInfo, this._storageService);
    this._splitView.dispose();
    this._tree.dispose();
    this._editor.dispose();
    super.dispose();
  }
  get direction() {
    return this._direction;
  }
  _applyTheme(theme) {
    const borderColor = theme.getColor(peekView.peekViewBorder) || Color.transparent;
    this.style({
      arrowColor: borderColor,
      frameColor: borderColor,
      headerBackgroundColor: theme.getColor(peekView.peekViewTitleBackground) || Color.transparent,
      primaryHeadingColor: theme.getColor(peekView.peekViewTitleForeground),
      secondaryHeadingColor: theme.getColor(peekView.peekViewTitleInfoForeground)
    });
  }
  _fillHead(container) {
    super._fillHead(container, true);
    const menu = this._menuService.createMenu(TypeHierarchyTreePeekWidget.TitleMenu, this._contextKeyService);
    const updateToolbar = () => {
      const actions = getFlatActionBarActions(menu.getActions());
      this._actionbarWidget.clear();
      this._actionbarWidget.push(actions, { label: false, icon: true });
    };
    this._disposables.add(menu);
    this._disposables.add(menu.onDidChange(updateToolbar));
    updateToolbar();
  }
  _fillBody(parent) {
    this._layoutInfo = LayoutInfo.retrieve(this._storageService);
    this._dim = new Dimension(0, 0);
    this._parent = parent;
    parent.classList.add("type-hierarchy");
    const message = document.createElement("div");
    message.classList.add("message");
    parent.appendChild(message);
    this._message = message;
    this._message.tabIndex = 0;
    const container = document.createElement("div");
    container.classList.add("results");
    parent.appendChild(container);
    this._splitView = new SplitView(container, { orientation: Orientation.HORIZONTAL });
    const editorContainer = document.createElement("div");
    editorContainer.classList.add("editor");
    container.appendChild(editorContainer);
    const editorOptions = {
      scrollBeyondLastLine: false,
      scrollbar: {
        verticalScrollbarSize: 14,
        horizontal: "auto",
        useShadows: true,
        verticalHasArrows: false,
        horizontalHasArrows: false,
        alwaysConsumeMouseWheel: false
      },
      overviewRulerLanes: 2,
      fixedOverflowWidgets: true,
      minimap: {
        enabled: false
      }
    };
    this._editor = this._instantiationService.createInstance(
      EmbeddedCodeEditorWidget,
      editorContainer,
      editorOptions,
      {},
      this.editor
    );
    const treeContainer = document.createElement("div");
    treeContainer.classList.add("tree");
    container.appendChild(treeContainer);
    const options = {
      sorter: new typeHTree.Sorter(),
      accessibilityProvider: new typeHTree.AccessibilityProvider(() => this._direction),
      identityProvider: new typeHTree.IdentityProvider(() => this._direction),
      expandOnlyOnTwistieClick: true,
      overrideStyles: {
        listBackground: peekView.peekViewResultsBackground
      }
    };
    this._tree = this._instantiationService.createInstance(
      TypeHierarchyTree,
      "TypeHierarchyPeek",
      treeContainer,
      new typeHTree.VirtualDelegate(),
      [this._instantiationService.createInstance(typeHTree.TypeRenderer)],
      this._instantiationService.createInstance(typeHTree.DataSource, () => this._direction),
      options
    );
    this._splitView.addView({
      onDidChange: Event.None,
      element: editorContainer,
      minimumSize: 200,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        if (this._dim.height) {
          this._editor.layout({ height: this._dim.height, width });
        }
      }
    }, Sizing.Distribute);
    this._splitView.addView({
      onDidChange: Event.None,
      element: treeContainer,
      minimumSize: 100,
      maximumSize: Number.MAX_VALUE,
      layout: (width) => {
        if (this._dim.height) {
          this._tree.layout(this._dim.height, width);
        }
      }
    }, Sizing.Distribute);
    this._disposables.add(this._splitView.onDidSashChange(() => {
      if (this._dim.width) {
        this._layoutInfo.ratio = this._splitView.getViewSize(0) / this._dim.width;
      }
    }));
    this._disposables.add(this._tree.onDidChangeFocus(this._updatePreview, this));
    this._disposables.add(this._editor.onMouseDown((e) => {
      const { event, target } = e;
      if (event.detail !== 2) {
        return;
      }
      const [focus] = this._tree.getFocus();
      if (!focus) {
        return;
      }
      this.dispose();
      this._editorService.openEditor({
        resource: focus.item.uri,
        options: { selection: target.range }
      });
    }));
    this._disposables.add(this._tree.onMouseDblClick((e) => {
      if (e.target === TreeMouseEventTarget.Twistie) {
        return;
      }
      if (e.element) {
        this.dispose();
        this._editorService.openEditor({
          resource: e.element.item.uri,
          options: { selection: e.element.item.selectionRange, pinned: true }
        });
      }
    }));
    this._disposables.add(this._tree.onDidChangeSelection((e) => {
      const [element] = e.elements;
      if (element && isKeyboardEvent(e.browserEvent)) {
        this.dispose();
        this._editorService.openEditor({
          resource: element.item.uri,
          options: { selection: element.item.selectionRange, pinned: true }
        });
      }
    }));
  }
  async _updatePreview() {
    const [element] = this._tree.getFocus();
    if (!element) {
      return;
    }
    this._previewDisposable.clear();
    const options = {
      description: "type-hierarchy-decoration",
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      className: "type-decoration",
      overviewRuler: {
        color: themeColorFromId(peekView.peekViewEditorMatchHighlight),
        position: OverviewRulerLane.Center
      }
    };
    let previewUri;
    if (this._direction === TypeHierarchyDirection.Supertypes) {
      previewUri = element.parent ? element.parent.item.uri : element.model.root.uri;
    } else {
      previewUri = element.item.uri;
    }
    const value = await this._textModelService.createModelReference(previewUri);
    this._editor.setModel(value.object.textEditorModel);
    const decorations = [];
    let fullRange;
    const loc = { uri: element.item.uri, range: element.item.selectionRange };
    if (loc.uri.toString() === previewUri.toString()) {
      decorations.push({ range: loc.range, options });
      fullRange = !fullRange ? loc.range : Range.plusRange(loc.range, fullRange);
    }
    if (fullRange) {
      this._editor.revealRangeInCenter(fullRange, ScrollType.Immediate);
      const decorationsCollection = this._editor.createDecorationsCollection(decorations);
      this._previewDisposable.add(toDisposable(() => decorationsCollection.clear()));
    }
    this._previewDisposable.add(value);
    const title = this._direction === TypeHierarchyDirection.Supertypes ? localize("supertypes", "Supertypes of '{0}'", element.model.root.name) : localize("subtypes", "Subtypes of '{0}'", element.model.root.name);
    this.setTitle(title);
  }
  showLoading() {
    this._parent.dataset["state"] = "loading" /* Loading */;
    this.setTitle(localize("title.loading", "Loading..."));
    this._show();
  }
  showMessage(message) {
    this._parent.dataset["state"] = "message" /* Message */;
    this.setTitle("");
    this.setMetaTitle("");
    this._message.innerText = message;
    this._show();
    this._message.focus();
  }
  async showModel(model) {
    this._show();
    const viewState = this._treeViewStates.get(this._direction);
    await this._tree.setInput(model, viewState);
    const root = this._tree.getNode(model).children[0];
    await this._tree.expand(root.element);
    if (root.children.length === 0) {
      this.showMessage(this._direction === TypeHierarchyDirection.Supertypes ? localize("empt.supertypes", "No supertypes of '{0}'", model.root.name) : localize("empt.subtypes", "No subtypes of '{0}'", model.root.name));
    } else {
      this._parent.dataset["state"] = "data" /* Data */;
      if (!viewState || this._tree.getFocus().length === 0) {
        this._tree.setFocus([root.children[0].element]);
      }
      this._tree.domFocus();
      this._updatePreview();
    }
  }
  getModel() {
    return this._tree.getInput();
  }
  getFocused() {
    return this._tree.getFocus()[0];
  }
  async updateDirection(newDirection) {
    const model = this._tree.getInput();
    if (model && newDirection !== this._direction) {
      this._treeViewStates.set(this._direction, this._tree.getViewState());
      this._direction = newDirection;
      await this.showModel(model);
    }
  }
  _show() {
    if (!this._isShowing) {
      this.editor.revealLineInCenterIfOutsideViewport(this._where.lineNumber, ScrollType.Smooth);
      super.show(Range.fromPositions(this._where), this._layoutInfo.height);
    }
  }
  _onWidth(width) {
    if (this._dim) {
      this._doLayoutBody(this._dim.height, width);
    }
  }
  _doLayoutBody(height, width) {
    if (this._dim.height !== height || this._dim.width !== width) {
      super._doLayoutBody(height, width);
      this._dim = new Dimension(width, height);
      this._layoutInfo.height = this._viewZone ? this._viewZone.heightInLines : this._layoutInfo.height;
      this._splitView.layout(width);
      this._splitView.resizeView(0, width * this._layoutInfo.ratio);
    }
  }
};
TypeHierarchyTreePeekWidget.TitleMenu = new MenuId("typehierarchy/title");
TypeHierarchyTreePeekWidget = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, peekView.IPeekViewService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService)
], TypeHierarchyTreePeekWidget);
export {
  TypeHierarchyTreePeekWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHR5cGVIaWVyYXJjaHlcXGJyb3dzZXJcXHR5cGVIaWVyYXJjaHlQZWVrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3R5cGVIaWVyYXJjaHkuY3NzJztcbmltcG9ydCB7IERpbWVuc2lvbiwgaXNLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiwgU2l6aW5nLCBTcGxpdFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgSVRyZWVOb2RlLCBUcmVlTW91c2VFdmVudFRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MsIElNb2RlbERlbHRhRGVjb3JhdGlvbiwgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgcGVla1ZpZXcgZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9ucywgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUsIElUaGVtZVNlcnZpY2UsIHRoZW1lQ29sb3JGcm9tSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCAqIGFzIHR5cGVIVHJlZSBmcm9tICcuL3R5cGVIaWVyYXJjaHlUcmVlLmpzJztcbmltcG9ydCB7IFR5cGVIaWVyYXJjaHlEaXJlY3Rpb24sIFR5cGVIaWVyYXJjaHlNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi90eXBlSGllcmFyY2h5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcblxuLy8gVG9kbzogY29waWVkIGZyb20gY2FsbCBoaWVyYXJjaHksIHRvIGV4dHJhY3RcbmNvbnN0IGVudW0gU3RhdGUge1xuXHRMb2FkaW5nID0gJ2xvYWRpbmcnLFxuXHRNZXNzYWdlID0gJ21lc3NhZ2UnLFxuXHREYXRhID0gJ2RhdGEnXG59XG5cbmNsYXNzIExheW91dEluZm8ge1xuXG5cdHN0YXRpYyBzdG9yZShpbmZvOiBMYXlvdXRJbmZvLCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKTogdm9pZCB7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3R5cGVIaWVyYXJjaHlQZWVrTGF5b3V0JywgSlNPTi5zdHJpbmdpZnkoaW5mbyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0c3RhdGljIHJldHJpZXZlKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiBMYXlvdXRJbmZvIHtcblx0XHRjb25zdCB2YWx1ZSA9IHN0b3JhZ2VTZXJ2aWNlLmdldCgndHlwZUhpZXJhcmNoeVBlZWtMYXlvdXQnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgJ3t9Jyk7XG5cdFx0Y29uc3QgZGVmYXVsdEluZm86IExheW91dEluZm8gPSB7IHJhdGlvOiAwLjcsIGhlaWdodDogMTcgfTtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHsgLi4uZGVmYXVsdEluZm8sIC4uLkpTT04ucGFyc2UodmFsdWUpIH07XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZGVmYXVsdEluZm87XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJhdGlvOiBudW1iZXIsXG5cdFx0cHVibGljIGhlaWdodDogbnVtYmVyXG5cdCkgeyB9XG59XG5cbmNsYXNzIFR5cGVIaWVyYXJjaHlUcmVlIGV4dGVuZHMgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxUeXBlSGllcmFyY2h5TW9kZWwsIHR5cGVIVHJlZS5UeXBlLCBGdXp6eVNjb3JlPiB7IH1cblxuZXhwb3J0IGNsYXNzIFR5cGVIaWVyYXJjaHlUcmVlUGVla1dpZGdldCBleHRlbmRzIHBlZWtWaWV3LlBlZWtWaWV3V2lkZ2V0IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVGl0bGVNZW51ID0gbmV3IE1lbnVJZCgndHlwZWhpZXJhcmNoeS90aXRsZScpO1xuXG5cdHByaXZhdGUgX3BhcmVudCE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9tZXNzYWdlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3NwbGl0VmlldyE6IFNwbGl0Vmlldztcblx0cHJpdmF0ZSBfdHJlZSE6IFR5cGVIaWVyYXJjaHlUcmVlO1xuXHRwcml2YXRlIF90cmVlVmlld1N0YXRlcyA9IG5ldyBNYXA8VHlwZUhpZXJhcmNoeURpcmVjdGlvbiwgSUFzeW5jRGF0YVRyZWVWaWV3U3RhdGU+KCk7XG5cdHByaXZhdGUgX2VkaXRvciE6IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSBfZGltITogRGltZW5zaW9uO1xuXHRwcml2YXRlIF9sYXlvdXRJbmZvITogTGF5b3V0SW5mbztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aWV3RGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3doZXJlOiBJUG9zaXRpb24sXG5cdFx0cHJpdmF0ZSBfZGlyZWN0aW9uOiBUeXBlSGllcmFyY2h5RGlyZWN0aW9uLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRAcGVla1ZpZXcuSVBlZWtWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wZWVrVmlld1NlcnZpY2U6IHBlZWtWaWV3LklQZWVrVmlld1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0TW9kZWxTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGVkaXRvciwgeyBzaG93RnJhbWU6IHRydWUsIHNob3dBcnJvdzogdHJ1ZSwgaXNSZXNpemVhYmxlOiB0cnVlLCBpc0FjY2Vzc2libGU6IHRydWUgfSwgX2luc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmNyZWF0ZSgpO1xuXHRcdHRoaXMuX3BlZWtWaWV3U2VydmljZS5hZGRFeGNsdXNpdmVXaWRnZXQoZWRpdG9yLCB0aGlzKTtcblx0XHR0aGlzLl9hcHBseVRoZW1lKHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHRoaXMuX2FwcGx5VGhlbWUsIHRoaXMpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fcHJldmlld0Rpc3Bvc2FibGUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRMYXlvdXRJbmZvLnN0b3JlKHRoaXMuX2xheW91dEluZm8sIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLl9zcGxpdFZpZXcuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3RyZWUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VkaXRvci5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Z2V0IGRpcmVjdGlvbigpOiBUeXBlSGllcmFyY2h5RGlyZWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fZGlyZWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlUaGVtZSh0aGVtZTogSUNvbG9yVGhlbWUpIHtcblx0XHRjb25zdCBib3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3LnBlZWtWaWV3Qm9yZGVyKSB8fCBDb2xvci50cmFuc3BhcmVudDtcblx0XHR0aGlzLnN0eWxlKHtcblx0XHRcdGFycm93Q29sb3I6IGJvcmRlckNvbG9yLFxuXHRcdFx0ZnJhbWVDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRoZWFkZXJCYWNrZ3JvdW5kQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3LnBlZWtWaWV3VGl0bGVCYWNrZ3JvdW5kKSB8fCBDb2xvci50cmFuc3BhcmVudCxcblx0XHRcdHByaW1hcnlIZWFkaW5nQ29sb3I6IHRoZW1lLmdldENvbG9yKHBlZWtWaWV3LnBlZWtWaWV3VGl0bGVGb3JlZ3JvdW5kKSxcblx0XHRcdHNlY29uZGFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdUaXRsZUluZm9Gb3JlZ3JvdW5kKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9maWxsSGVhZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIuX2ZpbGxIZWFkKGNvbnRhaW5lciwgdHJ1ZSk7XG5cblx0XHRjb25zdCBtZW51ID0gdGhpcy5fbWVudVNlcnZpY2UuY3JlYXRlTWVudShUeXBlSGllcmFyY2h5VHJlZVBlZWtXaWRnZXQuVGl0bGVNZW51LCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgdXBkYXRlVG9vbGJhciA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRGbGF0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoKSk7XG5cdFx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQhLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hY3Rpb25iYXJXaWRnZXQhLnB1c2goYWN0aW9ucywgeyBsYWJlbDogZmFsc2UsIGljb246IHRydWUgfSk7XG5cdFx0fTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobWVudSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UodXBkYXRlVG9vbGJhcikpO1xuXHRcdHVwZGF0ZVRvb2xiYXIoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZmlsbEJvZHkocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0dGhpcy5fbGF5b3V0SW5mbyA9IExheW91dEluZm8ucmV0cmlldmUodGhpcy5fc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX2RpbSA9IG5ldyBEaW1lbnNpb24oMCwgMCk7XG5cblx0XHR0aGlzLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ3R5cGUtaGllcmFyY2h5Jyk7XG5cblx0XHRjb25zdCBtZXNzYWdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bWVzc2FnZS5jbGFzc0xpc3QuYWRkKCdtZXNzYWdlJyk7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKG1lc3NhZ2UpO1xuXHRcdHRoaXMuX21lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuX21lc3NhZ2UudGFiSW5kZXggPSAwO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Jlc3VsdHMnKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3NwbGl0VmlldyA9IG5ldyBTcGxpdFZpZXcoY29udGFpbmVyLCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIH0pO1xuXG5cdFx0Ly8gZWRpdG9yIHN0dWZmXG5cdFx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2VkaXRvcicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlZGl0b3JDb250YWluZXIpO1xuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0c2Nyb2xsYmFyOiB7XG5cdFx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogMTQsXG5cdFx0XHRcdGhvcml6b250YWw6ICdhdXRvJyxcblx0XHRcdFx0dXNlU2hhZG93czogdHJ1ZSxcblx0XHRcdFx0dmVydGljYWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0XHRob3Jpem9udGFsSGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGZhbHNlXG5cdFx0XHR9LFxuXHRcdFx0b3ZlcnZpZXdSdWxlckxhbmVzOiAyLFxuXHRcdFx0Zml4ZWRPdmVyZmxvd1dpZGdldHM6IHRydWUsXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IGZhbHNlXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9lZGl0b3IgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCxcblx0XHRcdGVkaXRvckNvbnRhaW5lcixcblx0XHRcdGVkaXRvck9wdGlvbnMsXG5cdFx0XHR7fSxcblx0XHRcdHRoaXMuZWRpdG9yXG5cdFx0KTtcblxuXHRcdC8vIHRyZWUgc3R1ZmZcblx0XHRjb25zdCB0cmVlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dHJlZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0cmVlJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRyZWVDb250YWluZXIpO1xuXHRcdGNvbnN0IG9wdGlvbnM6IElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9uczx0eXBlSFRyZWUuVHlwZSwgRnV6enlTY29yZT4gPSB7XG5cdFx0XHRzb3J0ZXI6IG5ldyB0eXBlSFRyZWUuU29ydGVyKCksXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyB0eXBlSFRyZWUuQWNjZXNzaWJpbGl0eVByb3ZpZGVyKCgpID0+IHRoaXMuX2RpcmVjdGlvbiksXG5cdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBuZXcgdHlwZUhUcmVlLklkZW50aXR5UHJvdmlkZXIoKCkgPT4gdGhpcy5fZGlyZWN0aW9uKSxcblx0XHRcdGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogdHJ1ZSxcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB7XG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBwZWVrVmlldy5wZWVrVmlld1Jlc3VsdHNCYWNrZ3JvdW5kXG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl90cmVlID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRUeXBlSGllcmFyY2h5VHJlZSxcblx0XHRcdCdUeXBlSGllcmFyY2h5UGVlaycsXG5cdFx0XHR0cmVlQ29udGFpbmVyLFxuXHRcdFx0bmV3IHR5cGVIVHJlZS5WaXJ0dWFsRGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZSh0eXBlSFRyZWUuVHlwZVJlbmRlcmVyKV0sXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZSh0eXBlSFRyZWUuRGF0YVNvdXJjZSwgKCkgPT4gdGhpcy5fZGlyZWN0aW9uKSxcblx0XHRcdG9wdGlvbnNcblx0XHQpO1xuXG5cdFx0Ly8gc3BsaXQgc3R1ZmZcblx0XHR0aGlzLl9zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IGVkaXRvckNvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiAyMDAsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLk1BWF9WQUxVRSxcblx0XHRcdGxheW91dDogKHdpZHRoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9kaW0uaGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9yLmxheW91dCh7IGhlaWdodDogdGhpcy5fZGltLmhlaWdodCwgd2lkdGggfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cblx0XHR0aGlzLl9zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IHRyZWVDb250YWluZXIsXG5cdFx0XHRtaW5pbXVtU2l6ZTogMTAwLFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5NQVhfVkFMVUUsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fZGltLmhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUubGF5b3V0KHRoaXMuX2RpbS5oZWlnaHQsIHdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIFNpemluZy5EaXN0cmlidXRlKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9zcGxpdFZpZXcub25EaWRTYXNoQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9kaW0ud2lkdGgpIHtcblx0XHRcdFx0dGhpcy5fbGF5b3V0SW5mby5yYXRpbyA9IHRoaXMuX3NwbGl0Vmlldy5nZXRWaWV3U2l6ZSgwKSAvIHRoaXMuX2RpbS53aWR0aDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyB1cGRhdGUgZWRpdG9yXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VGb2N1cyh0aGlzLl91cGRhdGVQcmV2aWV3LCB0aGlzKSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uTW91c2VEb3duKGUgPT4ge1xuXHRcdFx0Y29uc3QgeyBldmVudCwgdGFyZ2V0IH0gPSBlO1xuXHRcdFx0aWYgKGV2ZW50LmRldGFpbCAhPT0gMikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBbZm9jdXNdID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKCFmb2N1cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiBmb2N1cy5pdGVtLnVyaSxcblx0XHRcdFx0b3B0aW9uczogeyBzZWxlY3Rpb246IHRhcmdldC5yYW5nZSEgfVxuXHRcdFx0fSk7XG5cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbk1vdXNlRGJsQ2xpY2soZSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQgPT09IFRyZWVNb3VzZUV2ZW50VGFyZ2V0LlR3aXN0aWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBlLmVsZW1lbnQuaXRlbS51cmksXG5cdFx0XHRcdFx0b3B0aW9uczogeyBzZWxlY3Rpb246IGUuZWxlbWVudC5pdGVtLnNlbGVjdGlvblJhbmdlLCBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IFtlbGVtZW50XSA9IGUuZWxlbWVudHM7XG5cdFx0XHQvLyBkb24ndCBjbG9zZSBvbiBjbGlja1xuXHRcdFx0aWYgKGVsZW1lbnQgJiYgaXNLZXlib2FyZEV2ZW50KGUuYnJvd3NlckV2ZW50KSkge1xuXHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogZWxlbWVudC5pdGVtLnVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogZWxlbWVudC5pdGVtLnNlbGVjdGlvblJhbmdlLCBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVQcmV2aWV3KCkge1xuXHRcdGNvbnN0IFtlbGVtZW50XSA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoIWVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wcmV2aWV3RGlzcG9zYWJsZS5jbGVhcigpO1xuXG5cdFx0Ly8gdXBkYXRlOiBlZGl0b3IgYW5kIGVkaXRvciBoaWdobGlnaHRzXG5cdFx0Y29uc3Qgb3B0aW9uczogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ3R5cGUtaGllcmFyY2h5LWRlY29yYXRpb24nLFxuXHRcdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0XHRjbGFzc05hbWU6ICd0eXBlLWRlY29yYXRpb24nLFxuXHRcdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChwZWVrVmlldy5wZWVrVmlld0VkaXRvck1hdGNoSGlnaGxpZ2h0KSxcblx0XHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlclxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0bGV0IHByZXZpZXdVcmk6IFVSSTtcblx0XHRpZiAodGhpcy5fZGlyZWN0aW9uID09PSBUeXBlSGllcmFyY2h5RGlyZWN0aW9uLlN1cGVydHlwZXMpIHtcblx0XHRcdC8vIHN1cGVydHlwZXM6IHNob3cgc3VwZXIgdHlwZXMgYW5kIGhpZ2hsaWdodCBmb2N1c2VkIHR5cGVcblx0XHRcdHByZXZpZXdVcmkgPSBlbGVtZW50LnBhcmVudCA/IGVsZW1lbnQucGFyZW50Lml0ZW0udXJpIDogZWxlbWVudC5tb2RlbC5yb290LnVyaTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gc3VidHlwZXM6IHNob3cgc3ViIHR5cGVzIGFuZCBoaWdobGlnaHQgZm9jdXNlZCB0eXBlXG5cdFx0XHRwcmV2aWV3VXJpID0gZWxlbWVudC5pdGVtLnVyaTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHRoaXMuX3RleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocHJldmlld1VyaSk7XG5cdFx0dGhpcy5fZWRpdG9yLnNldE1vZGVsKHZhbHVlLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwpO1xuXG5cdFx0Ly8gc2V0IGRlY29yYXRpb25zIGZvciB0eXBlIHJhbmdlc1xuXHRcdGNvbnN0IGRlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGxldCBmdWxsUmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBsb2MgPSB7IHVyaTogZWxlbWVudC5pdGVtLnVyaSwgcmFuZ2U6IGVsZW1lbnQuaXRlbS5zZWxlY3Rpb25SYW5nZSB9O1xuXHRcdGlmIChsb2MudXJpLnRvU3RyaW5nKCkgPT09IHByZXZpZXdVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7IHJhbmdlOiBsb2MucmFuZ2UsIG9wdGlvbnMgfSk7XG5cdFx0XHRmdWxsUmFuZ2UgPSAhZnVsbFJhbmdlID8gbG9jLnJhbmdlIDogUmFuZ2UucGx1c1JhbmdlKGxvYy5yYW5nZSwgZnVsbFJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKGZ1bGxSYW5nZSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXIoZnVsbFJhbmdlLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKGRlY29yYXRpb25zKTtcblx0XHRcdHRoaXMuX3ByZXZpZXdEaXNwb3NhYmxlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmNsZWFyKCkpKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJldmlld0Rpc3Bvc2FibGUuYWRkKHZhbHVlKTtcblxuXHRcdC8vIHVwZGF0ZTogdGl0bGVcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuX2RpcmVjdGlvbiA9PT0gVHlwZUhpZXJhcmNoeURpcmVjdGlvbi5TdXBlcnR5cGVzXG5cdFx0XHQ/IGxvY2FsaXplKCdzdXBlcnR5cGVzJywgXCJTdXBlcnR5cGVzIG9mICd7MH0nXCIsIGVsZW1lbnQubW9kZWwucm9vdC5uYW1lKVxuXHRcdFx0OiBsb2NhbGl6ZSgnc3VidHlwZXMnLCBcIlN1YnR5cGVzIG9mICd7MH0nXCIsIGVsZW1lbnQubW9kZWwucm9vdC5uYW1lKTtcblx0XHR0aGlzLnNldFRpdGxlKHRpdGxlKTtcblx0fVxuXG5cdHNob3dMb2FkaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BhcmVudC5kYXRhc2V0WydzdGF0ZSddID0gU3RhdGUuTG9hZGluZztcblx0XHR0aGlzLnNldFRpdGxlKGxvY2FsaXplKCd0aXRsZS5sb2FkaW5nJywgXCJMb2FkaW5nLi4uXCIpKTtcblx0XHR0aGlzLl9zaG93KCk7XG5cdH1cblxuXHRzaG93TWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXJlbnQuZGF0YXNldFsnc3RhdGUnXSA9IFN0YXRlLk1lc3NhZ2U7XG5cdFx0dGhpcy5zZXRUaXRsZSgnJyk7XG5cdFx0dGhpcy5zZXRNZXRhVGl0bGUoJycpO1xuXHRcdHRoaXMuX21lc3NhZ2UuaW5uZXJUZXh0ID0gbWVzc2FnZTtcblx0XHR0aGlzLl9zaG93KCk7XG5cdFx0dGhpcy5fbWVzc2FnZS5mb2N1cygpO1xuXHR9XG5cblx0YXN5bmMgc2hvd01vZGVsKG1vZGVsOiBUeXBlSGllcmFyY2h5TW9kZWwpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdHRoaXMuX3Nob3coKTtcblx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLl90cmVlVmlld1N0YXRlcy5nZXQodGhpcy5fZGlyZWN0aW9uKTtcblxuXHRcdGF3YWl0IHRoaXMuX3RyZWUuc2V0SW5wdXQobW9kZWwsIHZpZXdTdGF0ZSk7XG5cblx0XHRjb25zdCByb290ID0gPElUcmVlTm9kZTx0eXBlSFRyZWUuVHlwZSwgRnV6enlTY29yZT4+dGhpcy5fdHJlZS5nZXROb2RlKG1vZGVsKS5jaGlsZHJlblswXTtcblx0XHRhd2FpdCB0aGlzLl90cmVlLmV4cGFuZChyb290LmVsZW1lbnQpO1xuXG5cdFx0aWYgKHJvb3QuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnNob3dNZXNzYWdlKHRoaXMuX2RpcmVjdGlvbiA9PT0gVHlwZUhpZXJhcmNoeURpcmVjdGlvbi5TdXBlcnR5cGVzXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2VtcHQuc3VwZXJ0eXBlcycsIFwiTm8gc3VwZXJ0eXBlcyBvZiAnezB9J1wiLCBtb2RlbC5yb290Lm5hbWUpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2VtcHQuc3VidHlwZXMnLCBcIk5vIHN1YnR5cGVzIG9mICd7MH0nXCIsIG1vZGVsLnJvb3QubmFtZSkpO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3BhcmVudC5kYXRhc2V0WydzdGF0ZSddID0gU3RhdGUuRGF0YTtcblx0XHRcdGlmICghdmlld1N0YXRlIHx8IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fdHJlZS5zZXRGb2N1cyhbcm9vdC5jaGlsZHJlblswXS5lbGVtZW50XSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVQcmV2aWV3KCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TW9kZWwoKTogVHlwZUhpZXJhcmNoeU1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5nZXRJbnB1dCgpO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZCgpOiB0eXBlSFRyZWUuVHlwZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKVswXTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZURpcmVjdGlvbihuZXdEaXJlY3Rpb246IFR5cGVIaWVyYXJjaHlEaXJlY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3RyZWUuZ2V0SW5wdXQoKTtcblx0XHRpZiAobW9kZWwgJiYgbmV3RGlyZWN0aW9uICE9PSB0aGlzLl9kaXJlY3Rpb24pIHtcblx0XHRcdHRoaXMuX3RyZWVWaWV3U3RhdGVzLnNldCh0aGlzLl9kaXJlY3Rpb24sIHRoaXMuX3RyZWUuZ2V0Vmlld1N0YXRlKCkpO1xuXHRcdFx0dGhpcy5fZGlyZWN0aW9uID0gbmV3RGlyZWN0aW9uO1xuXHRcdFx0YXdhaXQgdGhpcy5zaG93TW9kZWwobW9kZWwpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3coKSB7XG5cdFx0aWYgKCF0aGlzLl9pc1Nob3dpbmcpIHtcblx0XHRcdHRoaXMuZWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHRoaXMuX3doZXJlLmxpbmVOdW1iZXIsIFNjcm9sbFR5cGUuU21vb3RoKTtcblx0XHRcdHN1cGVyLnNob3coUmFuZ2UuZnJvbVBvc2l0aW9ucyh0aGlzLl93aGVyZSksIHRoaXMuX2xheW91dEluZm8uaGVpZ2h0KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX29uV2lkdGgod2lkdGg6IG51bWJlcikge1xuXHRcdGlmICh0aGlzLl9kaW0pIHtcblx0XHRcdHRoaXMuX2RvTGF5b3V0Qm9keSh0aGlzLl9kaW0uaGVpZ2h0LCB3aWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9kb0xheW91dEJvZHkoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGltLmhlaWdodCAhPT0gaGVpZ2h0IHx8IHRoaXMuX2RpbS53aWR0aCAhPT0gd2lkdGgpIHtcblx0XHRcdHN1cGVyLl9kb0xheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHR0aGlzLl9kaW0gPSBuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpO1xuXHRcdFx0dGhpcy5fbGF5b3V0SW5mby5oZWlnaHQgPSB0aGlzLl92aWV3Wm9uZSA/IHRoaXMuX3ZpZXdab25lLmhlaWdodEluTGluZXMgOiB0aGlzLl9sYXlvdXRJbmZvLmhlaWdodDtcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5sYXlvdXQod2lkdGgpO1xuXHRcdFx0dGhpcy5fc3BsaXRWaWV3LnJlc2l6ZVZpZXcoMCwgd2lkdGggKiB0aGlzLl9sYXlvdXRJbmZvLnJhdGlvKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsV0FBVyx1QkFBdUI7QUFDM0MsU0FBUyxhQUFhLFFBQVEsaUJBQWlCO0FBRS9DLFNBQW9CLDRCQUE0QjtBQUNoRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUc5QyxTQUFTLGdDQUFnQztBQUd6QyxTQUFpQixhQUFhO0FBQzlCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQWtDLHdCQUErQyx5QkFBeUI7QUFDMUcsU0FBUyx5QkFBeUI7QUFDbEMsWUFBWSxjQUFjO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsY0FBYyxjQUFjO0FBQ3JDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXlDLDhCQUE4QjtBQUN2RSxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFzQixlQUFlLHdCQUF3QjtBQUM3RCxZQUFZLGVBQWU7QUFDM0IsU0FBUyw4QkFBa0Q7QUFDM0QsU0FBUyxzQkFBc0I7QUFHL0IsSUFBVyxRQUFYLGtCQUFXQSxXQUFYO0FBQ0MsRUFBQUEsT0FBQSxhQUFVO0FBQ1YsRUFBQUEsT0FBQSxhQUFVO0FBQ1YsRUFBQUEsT0FBQSxVQUFPO0FBSEcsU0FBQUE7QUFBQSxHQUFBO0FBTVgsTUFBTSxXQUFXO0FBQUEsRUFn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
