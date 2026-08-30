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
import "./media/callHierarchy.css";
import * as peekView from "../../../../editor/contrib/peekView/browser/peekView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { CallHierarchyDirection } from "../common/callHierarchy.js";
import { WorkbenchAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import * as callHTree from "./callHierarchyTree.js";
import { localize } from "../../../../nls.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { Range } from "../../../../editor/common/core/range.js";
import { SplitView, Orientation, Sizing } from "../../../../base/browser/ui/splitview/splitview.js";
import { Dimension, isKeyboardEvent } from "../../../../base/browser/dom.js";
import { Event } from "../../../../base/common/event.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { TrackedRangeStickiness, OverviewRulerLane } from "../../../../editor/common/model.js";
import { themeColorFromId, IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Color } from "../../../../base/common/color.js";
import { TreeMouseEventTarget } from "../../../../base/browser/ui/tree/tree.js";
import { MenuId, IMenuService } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
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
    storageService.store("callHierarchyPeekLayout", JSON.stringify(info), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  static retrieve(storageService) {
    const value = storageService.get("callHierarchyPeekLayout", StorageScope.PROFILE, "{}");
    const defaultInfo = { ratio: 0.7, height: 17 };
    try {
      return { ...defaultInfo, ...JSON.parse(value) };
    } catch {
      return defaultInfo;
    }
  }
}
class CallHierarchyTree extends WorkbenchAsyncDataTree {
}
let CallHierarchyTreePeekWidget = class extends peekView.PeekViewWidget {
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
    const menu = this._menuService.createMenu(CallHierarchyTreePeekWidget.TitleMenu, this._contextKeyService);
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
    parent.classList.add("call-hierarchy");
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
      sorter: new callHTree.Sorter(),
      accessibilityProvider: new callHTree.AccessibilityProvider(() => this._direction),
      identityProvider: new callHTree.IdentityProvider(() => this._direction),
      expandOnlyOnTwistieClick: true,
      overrideStyles: {
        listBackground: peekView.peekViewResultsBackground
      }
    };
    this._tree = this._instantiationService.createInstance(
      CallHierarchyTree,
      "CallHierarchyPeek",
      treeContainer,
      new callHTree.VirtualDelegate(),
      [this._instantiationService.createInstance(callHTree.CallRenderer)],
      this._instantiationService.createInstance(callHTree.DataSource, () => this._direction),
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
      description: "call-hierarchy-decoration",
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      className: "call-decoration",
      overviewRuler: {
        color: themeColorFromId(peekView.peekViewEditorMatchHighlight),
        position: OverviewRulerLane.Center
      }
    };
    let previewUri;
    if (this._direction === CallHierarchyDirection.CallsFrom) {
      previewUri = element.parent ? element.parent.item.uri : element.model.root.uri;
    } else {
      previewUri = element.item.uri;
    }
    const value = await this._textModelService.createModelReference(previewUri);
    this._editor.setModel(value.object.textEditorModel);
    const decorations = [];
    let fullRange;
    let locations = element.locations;
    if (!locations) {
      locations = [{ uri: element.item.uri, range: element.item.selectionRange }];
    }
    for (const loc of locations) {
      if (loc.uri.toString() === previewUri.toString()) {
        decorations.push({ range: loc.range, options });
        fullRange = !fullRange ? loc.range : Range.plusRange(loc.range, fullRange);
      }
    }
    if (fullRange) {
      this._editor.revealRangeInCenter(fullRange, ScrollType.Immediate);
      const decorationsCollection = this._editor.createDecorationsCollection(decorations);
      this._previewDisposable.add(toDisposable(() => decorationsCollection.clear()));
    }
    this._previewDisposable.add(value);
    const title = this._direction === CallHierarchyDirection.CallsFrom ? localize("callFrom", "Calls from '{0}'", element.model.root.name) : localize("callsTo", "Callers of '{0}'", element.model.root.name);
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
      this.showMessage(this._direction === CallHierarchyDirection.CallsFrom ? localize("empt.callsFrom", "No calls from '{0}'", model.root.name) : localize("empt.callsTo", "No callers of '{0}'", model.root.name));
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
CallHierarchyTreePeekWidget.TitleMenu = new MenuId("callhierarchy/title");
CallHierarchyTreePeekWidget = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, peekView.IPeekViewService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IMenuService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IInstantiationService)
], CallHierarchyTreePeekWidget);
export {
  CallHierarchyTreePeekWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNhbGxIaWVyYXJjaHlcXGJyb3dzZXJcXGNhbGxIaWVyYXJjaHlQZWVrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NhbGxIaWVyYXJjaHkuY3NzJztcbmltcG9ydCAqIGFzIHBlZWtWaWV3IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BlZWtWaWV3L2Jyb3dzZXIvcGVla1ZpZXcuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FsbEhpZXJhcmNoeURpcmVjdGlvbiwgQ2FsbEhpZXJhcmNoeU1vZGVsIH0gZnJvbSAnLi4vY29tbW9uL2NhbGxIaWVyYXJjaHkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQXN5bmNEYXRhVHJlZSwgSVdvcmtiZW5jaEFzeW5jRGF0YVRyZWVPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCAqIGFzIGNhbGxIVHJlZSBmcm9tICcuL2NhbGxIaWVyYXJjaHlUcmVlLmpzJztcbmltcG9ydCB7IElBc3luY0RhdGFUcmVlVmlld1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYXN5bmNEYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTcGxpdFZpZXcsIE9yaWVudGF0aW9uLCBTaXppbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc3BsaXR2aWV3L3NwbGl0dmlldy5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24sIGlzS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcywgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgT3ZlcnZpZXdSdWxlckxhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IHRoZW1lQ29sb3JGcm9tSWQsIElUaGVtZVNlcnZpY2UsIElDb2xvclRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgVHJlZU1vdXNlRXZlbnRUYXJnZXQsIElUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcblxuY29uc3QgZW51bSBTdGF0ZSB7XG5cdExvYWRpbmcgPSAnbG9hZGluZycsXG5cdE1lc3NhZ2UgPSAnbWVzc2FnZScsXG5cdERhdGEgPSAnZGF0YSdcbn1cblxuY2xhc3MgTGF5b3V0SW5mbyB7XG5cblx0c3RhdGljIHN0b3JlKGluZm86IExheW91dEluZm8sIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiB2b2lkIHtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnY2FsbEhpZXJhcmNoeVBlZWtMYXlvdXQnLCBKU09OLnN0cmluZ2lmeShpbmZvKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRzdGF0aWMgcmV0cmlldmUoc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSk6IExheW91dEluZm8ge1xuXHRcdGNvbnN0IHZhbHVlID0gc3RvcmFnZVNlcnZpY2UuZ2V0KCdjYWxsSGllcmFyY2h5UGVla0xheW91dCcsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAne30nKTtcblx0XHRjb25zdCBkZWZhdWx0SW5mbzogTGF5b3V0SW5mbyA9IHsgcmF0aW86IDAuNywgaGVpZ2h0OiAxNyB9O1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4geyAuLi5kZWZhdWx0SW5mbywgLi4uSlNPTi5wYXJzZSh2YWx1ZSkgfTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBkZWZhdWx0SW5mbztcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmF0aW86IG51bWJlcixcblx0XHRwdWJsaWMgaGVpZ2h0OiBudW1iZXJcblx0KSB7IH1cbn1cblxuY2xhc3MgQ2FsbEhpZXJhcmNoeVRyZWUgZXh0ZW5kcyBXb3JrYmVuY2hBc3luY0RhdGFUcmVlPENhbGxIaWVyYXJjaHlNb2RlbCwgY2FsbEhUcmVlLkNhbGwsIEZ1enp5U2NvcmU+IHsgfVxuXG5leHBvcnQgY2xhc3MgQ2FsbEhpZXJhcmNoeVRyZWVQZWVrV2lkZ2V0IGV4dGVuZHMgcGVla1ZpZXcuUGVla1ZpZXdXaWRnZXQge1xuXG5cdHN0YXRpYyByZWFkb25seSBUaXRsZU1lbnUgPSBuZXcgTWVudUlkKCdjYWxsaGllcmFyY2h5L3RpdGxlJyk7XG5cblx0cHJpdmF0ZSBfcGFyZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX21lc3NhZ2UhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfc3BsaXRWaWV3ITogU3BsaXRWaWV3O1xuXHRwcml2YXRlIF90cmVlITogQ2FsbEhpZXJhcmNoeVRyZWU7XG5cdHByaXZhdGUgX3RyZWVWaWV3U3RhdGVzID0gbmV3IE1hcDxDYWxsSGllcmFyY2h5RGlyZWN0aW9uLCBJQXN5bmNEYXRhVHJlZVZpZXdTdGF0ZT4oKTtcblx0cHJpdmF0ZSBfZWRpdG9yITogRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIF9kaW0hOiBEaW1lbnNpb247XG5cdHByaXZhdGUgX2xheW91dEluZm8hOiBMYXlvdXRJbmZvO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdEaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2hlcmU6IElQb3NpdGlvbixcblx0XHRwcml2YXRlIF9kaXJlY3Rpb246IENhbGxIaWVyYXJjaHlEaXJlY3Rpb24sXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBwZWVrVmlldy5JUGVla1ZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BlZWtWaWV3U2VydmljZTogcGVla1ZpZXcuSVBlZWtWaWV3U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB7IHNob3dGcmFtZTogdHJ1ZSwgc2hvd0Fycm93OiB0cnVlLCBpc1Jlc2l6ZWFibGU6IHRydWUsIGlzQWNjZXNzaWJsZTogdHJ1ZSB9LCBfaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuY3JlYXRlKCk7XG5cdFx0dGhpcy5fcGVla1ZpZXdTZXJ2aWNlLmFkZEV4Y2x1c2l2ZVdpZGdldChlZGl0b3IsIHRoaXMpO1xuXHRcdHRoaXMuX2FwcGx5VGhlbWUodGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhpcy5fYXBwbHlUaGVtZSwgdGhpcykpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9wcmV2aWV3RGlzcG9zYWJsZSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdExheW91dEluZm8uc3RvcmUodGhpcy5fbGF5b3V0SW5mbywgdGhpcy5fc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuX3NwbGl0Vmlldy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fdHJlZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXQgZGlyZWN0aW9uKCk6IENhbGxIaWVyYXJjaHlEaXJlY3Rpb24ge1xuXHRcdHJldHVybiB0aGlzLl9kaXJlY3Rpb247XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVRoZW1lKHRoZW1lOiBJQ29sb3JUaGVtZSkge1xuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdCb3JkZXIpIHx8IENvbG9yLnRyYW5zcGFyZW50O1xuXHRcdHRoaXMuc3R5bGUoe1xuXHRcdFx0YXJyb3dDb2xvcjogYm9yZGVyQ29sb3IsXG5cdFx0XHRmcmFtZUNvbG9yOiBib3JkZXJDb2xvcixcblx0XHRcdGhlYWRlckJhY2tncm91bmRDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdUaXRsZUJhY2tncm91bmQpIHx8IENvbG9yLnRyYW5zcGFyZW50LFxuXHRcdFx0cHJpbWFyeUhlYWRpbmdDb2xvcjogdGhlbWUuZ2V0Q29sb3IocGVla1ZpZXcucGVla1ZpZXdUaXRsZUZvcmVncm91bmQpLFxuXHRcdFx0c2Vjb25kYXJ5SGVhZGluZ0NvbG9yOiB0aGVtZS5nZXRDb2xvcihwZWVrVmlldy5wZWVrVmlld1RpdGxlSW5mb0ZvcmVncm91bmQpXG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2ZpbGxIZWFkKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5fZmlsbEhlYWQoY29udGFpbmVyLCB0cnVlKTtcblxuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLl9tZW51U2VydmljZS5jcmVhdGVNZW51KENhbGxIaWVyYXJjaHlUcmVlUGVla1dpZGdldC5UaXRsZU1lbnUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCB1cGRhdGVUb29sYmFyID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zKG1lbnUuZ2V0QWN0aW9ucygpKTtcblx0XHRcdHRoaXMuX2FjdGlvbmJhcldpZGdldCEuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2FjdGlvbmJhcldpZGdldCEucHVzaChhY3Rpb25zLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblx0XHR9O1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChtZW51KTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQobWVudS5vbkRpZENoYW5nZSh1cGRhdGVUb29sYmFyKSk7XG5cdFx0dXBkYXRlVG9vbGJhcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9maWxsQm9keShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cblx0XHR0aGlzLl9sYXlvdXRJbmZvID0gTGF5b3V0SW5mby5yZXRyaWV2ZSh0aGlzLl9zdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5fZGltID0gbmV3IERpbWVuc2lvbigwLCAwKTtcblxuXHRcdHRoaXMuX3BhcmVudCA9IHBhcmVudDtcblx0XHRwYXJlbnQuY2xhc3NMaXN0LmFkZCgnY2FsbC1oaWVyYXJjaHknKTtcblxuXHRcdGNvbnN0IG1lc3NhZ2UgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRtZXNzYWdlLmNsYXNzTGlzdC5hZGQoJ21lc3NhZ2UnKTtcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQobWVzc2FnZSk7XG5cdFx0dGhpcy5fbWVzc2FnZSA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5fbWVzc2FnZS50YWJJbmRleCA9IDA7XG5cblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgncmVzdWx0cycpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fc3BsaXRWaWV3ID0gbmV3IFNwbGl0Vmlldyhjb250YWluZXIsIHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwgfSk7XG5cblx0XHQvLyBlZGl0b3Igc3R1ZmZcblx0XHRjb25zdCBlZGl0b3JDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRlZGl0b3JDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZWRpdG9yJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVkaXRvckNvbnRhaW5lcik7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiAxNCxcblx0XHRcdFx0aG9yaXpvbnRhbDogJ2F1dG8nLFxuXHRcdFx0XHR1c2VTaGFkb3dzOiB0cnVlLFxuXHRcdFx0XHR2ZXJ0aWNhbEhhc0Fycm93czogZmFsc2UsXG5cdFx0XHRcdGhvcml6b250YWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogZmFsc2Vcblx0XHRcdH0sXG5cdFx0XHRvdmVydmlld1J1bGVyTGFuZXM6IDIsXG5cdFx0XHRmaXhlZE92ZXJmbG93V2lkZ2V0czogdHJ1ZSxcblx0XHRcdG1pbmltYXA6IHtcblx0XHRcdFx0ZW5hYmxlZDogZmFsc2Vcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX2VkaXRvciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdFx0ZWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0ZWRpdG9yT3B0aW9ucyxcblx0XHRcdHt9LFxuXHRcdFx0dGhpcy5lZGl0b3Jcblx0XHQpO1xuXG5cdFx0Ly8gdHJlZSBzdHVmZlxuXHRcdGNvbnN0IHRyZWVDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0cmVlQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3RyZWUnKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodHJlZUNvbnRhaW5lcik7XG5cdFx0Y29uc3Qgb3B0aW9uczogSVdvcmtiZW5jaEFzeW5jRGF0YVRyZWVPcHRpb25zPGNhbGxIVHJlZS5DYWxsLCBGdXp6eVNjb3JlPiA9IHtcblx0XHRcdHNvcnRlcjogbmV3IGNhbGxIVHJlZS5Tb3J0ZXIoKSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IGNhbGxIVHJlZS5BY2Nlc3NpYmlsaXR5UHJvdmlkZXIoKCkgPT4gdGhpcy5fZGlyZWN0aW9uKSxcblx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IG5ldyBjYWxsSFRyZWUuSWRlbnRpdHlQcm92aWRlcigoKSA9PiB0aGlzLl9kaXJlY3Rpb24pLFxuXHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0b3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHBlZWtWaWV3LnBlZWtWaWV3UmVzdWx0c0JhY2tncm91bmRcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3RyZWUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENhbGxIaWVyYXJjaHlUcmVlLFxuXHRcdFx0J0NhbGxIaWVyYXJjaHlQZWVrJyxcblx0XHRcdHRyZWVDb250YWluZXIsXG5cdFx0XHRuZXcgY2FsbEhUcmVlLlZpcnR1YWxEZWxlZ2F0ZSgpLFxuXHRcdFx0W3RoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGNhbGxIVHJlZS5DYWxsUmVuZGVyZXIpXSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGNhbGxIVHJlZS5EYXRhU291cmNlLCAoKSA9PiB0aGlzLl9kaXJlY3Rpb24pLFxuXHRcdFx0b3B0aW9uc1xuXHRcdCk7XG5cblx0XHQvLyBzcGxpdCBzdHVmZlxuXHRcdHRoaXMuX3NwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogZWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0bWluaW11bVNpemU6IDIwMCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuTUFYX1ZBTFVFLFxuXHRcdFx0bGF5b3V0OiAod2lkdGgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2RpbS5oZWlnaHQpIHtcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3IubGF5b3V0KHsgaGVpZ2h0OiB0aGlzLl9kaW0uaGVpZ2h0LCB3aWR0aCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sIFNpemluZy5EaXN0cmlidXRlKTtcblxuXHRcdHRoaXMuX3NwbGl0Vmlldy5hZGRWaWV3KHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0ZWxlbWVudDogdHJlZUNvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiAxMDAsXG5cdFx0XHRtYXhpbXVtU2l6ZTogTnVtYmVyLk1BWF9WQUxVRSxcblx0XHRcdGxheW91dDogKHdpZHRoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9kaW0uaGVpZ2h0KSB7XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5sYXlvdXQodGhpcy5fZGltLmhlaWdodCwgd2lkdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2RpbS53aWR0aCkge1xuXHRcdFx0XHR0aGlzLl9sYXlvdXRJbmZvLnJhdGlvID0gdGhpcy5fc3BsaXRWaWV3LmdldFZpZXdTaXplKDApIC8gdGhpcy5fZGltLndpZHRoO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIHVwZGF0ZSBlZGl0b3Jcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fdHJlZS5vbkRpZENoYW5nZUZvY3VzKHRoaXMuX3VwZGF0ZVByZXZpZXcsIHRoaXMpKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9lZGl0b3Iub25Nb3VzZURvd24oZSA9PiB7XG5cdFx0XHRjb25zdCB7IGV2ZW50LCB0YXJnZXQgfSA9IGU7XG5cdFx0XHRpZiAoZXZlbnQuZGV0YWlsICE9PSAyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IFtmb2N1c10gPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoIWZvY3VzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IGZvY3VzLml0ZW0udXJpLFxuXHRcdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogdGFyZ2V0LnJhbmdlISB9XG5cdFx0XHR9KTtcblxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90cmVlLm9uTW91c2VEYmxDbGljayhlID0+IHtcblx0XHRcdGlmIChlLnRhcmdldCA9PT0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuVHdpc3RpZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IGUuZWxlbWVudC5pdGVtLnVyaSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHNlbGVjdGlvbjogZS5lbGVtZW50Lml0ZW0uc2VsZWN0aW9uUmFuZ2UsIHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90cmVlLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0Y29uc3QgW2VsZW1lbnRdID0gZS5lbGVtZW50cztcblx0XHRcdC8vIGRvbid0IGNsb3NlIG9uIGNsaWNrXG5cdFx0XHRpZiAoZWxlbWVudCAmJiBpc0tleWJvYXJkRXZlbnQoZS5icm93c2VyRXZlbnQpKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdHJlc291cmNlOiBlbGVtZW50Lml0ZW0udXJpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHsgc2VsZWN0aW9uOiBlbGVtZW50Lml0ZW0uc2VsZWN0aW9uUmFuZ2UsIHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVByZXZpZXcoKSB7XG5cdFx0Y29uc3QgW2VsZW1lbnRdID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ByZXZpZXdEaXNwb3NhYmxlLmNsZWFyKCk7XG5cblx0XHQvLyB1cGRhdGU6IGVkaXRvciBhbmQgZWRpdG9yIGhpZ2hsaWdodHNcblx0XHRjb25zdCBvcHRpb25zOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdGRlc2NyaXB0aW9uOiAnY2FsbC1oaWVyYXJjaHktZGVjb3JhdGlvbicsXG5cdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRcdGNsYXNzTmFtZTogJ2NhbGwtZGVjb3JhdGlvbicsXG5cdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKHBlZWtWaWV3LnBlZWtWaWV3RWRpdG9yTWF0Y2hIaWdobGlnaHQpLFxuXHRcdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuQ2VudGVyXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRsZXQgcHJldmlld1VyaTogVVJJO1xuXHRcdGlmICh0aGlzLl9kaXJlY3Rpb24gPT09IENhbGxIaWVyYXJjaHlEaXJlY3Rpb24uQ2FsbHNGcm9tKSB7XG5cdFx0XHQvLyBvdXRnb2luZyBjYWxsczogc2hvdyBjYWxsZXIgYW5kIGhpZ2hsaWdodCBmb2N1c2VkIGNhbGxzXG5cdFx0XHRwcmV2aWV3VXJpID0gZWxlbWVudC5wYXJlbnQgPyBlbGVtZW50LnBhcmVudC5pdGVtLnVyaSA6IGVsZW1lbnQubW9kZWwucm9vdC51cmk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gaW5jb21pbmcgY2FsbHM6IHNob3cgY2FsbGVyIGFuZCBoaWdobGlnaHQgZm9jdXNlZCBjYWxsc1xuXHRcdFx0cHJldmlld1VyaSA9IGVsZW1lbnQuaXRlbS51cmk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCB0aGlzLl90ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHByZXZpZXdVcmkpO1xuXHRcdHRoaXMuX2VkaXRvci5zZXRNb2RlbCh2YWx1ZS5vYmplY3QudGV4dEVkaXRvck1vZGVsKTtcblxuXHRcdC8vIHNldCBkZWNvcmF0aW9ucyBmb3IgY2FsbGVyIHJhbmdlcyAoaWYgaW4gdGhlIHNhbWUgZmlsZSlcblx0XHRjb25zdCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXTtcblx0XHRsZXQgZnVsbFJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxvY2F0aW9ucyA9IGVsZW1lbnQubG9jYXRpb25zO1xuXHRcdGlmICghbG9jYXRpb25zKSB7XG5cdFx0XHRsb2NhdGlvbnMgPSBbeyB1cmk6IGVsZW1lbnQuaXRlbS51cmksIHJhbmdlOiBlbGVtZW50Lml0ZW0uc2VsZWN0aW9uUmFuZ2UgfV07XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbG9jIG9mIGxvY2F0aW9ucykge1xuXHRcdFx0aWYgKGxvYy51cmkudG9TdHJpbmcoKSA9PT0gcHJldmlld1VyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdGRlY29yYXRpb25zLnB1c2goeyByYW5nZTogbG9jLnJhbmdlLCBvcHRpb25zIH0pO1xuXHRcdFx0XHRmdWxsUmFuZ2UgPSAhZnVsbFJhbmdlID8gbG9jLnJhbmdlIDogUmFuZ2UucGx1c1JhbmdlKGxvYy5yYW5nZSwgZnVsbFJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGZ1bGxSYW5nZSkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXIoZnVsbFJhbmdlLCBTY3JvbGxUeXBlLkltbWVkaWF0ZSk7XG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKGRlY29yYXRpb25zKTtcblx0XHRcdHRoaXMuX3ByZXZpZXdEaXNwb3NhYmxlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmNsZWFyKCkpKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJldmlld0Rpc3Bvc2FibGUuYWRkKHZhbHVlKTtcblxuXHRcdC8vIHVwZGF0ZTogdGl0bGVcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuX2RpcmVjdGlvbiA9PT0gQ2FsbEhpZXJhcmNoeURpcmVjdGlvbi5DYWxsc0Zyb21cblx0XHRcdD8gbG9jYWxpemUoJ2NhbGxGcm9tJywgXCJDYWxscyBmcm9tICd7MH0nXCIsIGVsZW1lbnQubW9kZWwucm9vdC5uYW1lKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2FsbHNUbycsIFwiQ2FsbGVycyBvZiAnezB9J1wiLCBlbGVtZW50Lm1vZGVsLnJvb3QubmFtZSk7XG5cdFx0dGhpcy5zZXRUaXRsZSh0aXRsZSk7XG5cdH1cblxuXHRzaG93TG9hZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXJlbnQuZGF0YXNldFsnc3RhdGUnXSA9IFN0YXRlLkxvYWRpbmc7XG5cdFx0dGhpcy5zZXRUaXRsZShsb2NhbGl6ZSgndGl0bGUubG9hZGluZycsIFwiTG9hZGluZy4uLlwiKSk7XG5cdFx0dGhpcy5fc2hvdygpO1xuXHR9XG5cblx0c2hvd01lc3NhZ2UobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcGFyZW50LmRhdGFzZXRbJ3N0YXRlJ10gPSBTdGF0ZS5NZXNzYWdlO1xuXHRcdHRoaXMuc2V0VGl0bGUoJycpO1xuXHRcdHRoaXMuc2V0TWV0YVRpdGxlKCcnKTtcblx0XHR0aGlzLl9tZXNzYWdlLmlubmVyVGV4dCA9IG1lc3NhZ2U7XG5cdFx0dGhpcy5fc2hvdygpO1xuXHRcdHRoaXMuX21lc3NhZ2UuZm9jdXMoKTtcblx0fVxuXG5cdGFzeW5jIHNob3dNb2RlbChtb2RlbDogQ2FsbEhpZXJhcmNoeU1vZGVsKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHR0aGlzLl9zaG93KCk7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5fdHJlZVZpZXdTdGF0ZXMuZ2V0KHRoaXMuX2RpcmVjdGlvbik7XG5cblx0XHRhd2FpdCB0aGlzLl90cmVlLnNldElucHV0KG1vZGVsLCB2aWV3U3RhdGUpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IDxJVHJlZU5vZGU8Y2FsbEhUcmVlLkNhbGwsIEZ1enp5U2NvcmU+PnRoaXMuX3RyZWUuZ2V0Tm9kZShtb2RlbCkuY2hpbGRyZW5bMF07XG5cdFx0YXdhaXQgdGhpcy5fdHJlZS5leHBhbmQocm9vdC5lbGVtZW50KTtcblxuXHRcdGlmIChyb290LmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly9cblx0XHRcdHRoaXMuc2hvd01lc3NhZ2UodGhpcy5fZGlyZWN0aW9uID09PSBDYWxsSGllcmFyY2h5RGlyZWN0aW9uLkNhbGxzRnJvbVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdlbXB0LmNhbGxzRnJvbScsIFwiTm8gY2FsbHMgZnJvbSAnezB9J1wiLCBtb2RlbC5yb290Lm5hbWUpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2VtcHQuY2FsbHNUbycsIFwiTm8gY2FsbGVycyBvZiAnezB9J1wiLCBtb2RlbC5yb290Lm5hbWUpKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9wYXJlbnQuZGF0YXNldFsnc3RhdGUnXSA9IFN0YXRlLkRhdGE7XG5cdFx0XHRpZiAoIXZpZXdTdGF0ZSB8fCB0aGlzLl90cmVlLmdldEZvY3VzKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW3Jvb3QuY2hpbGRyZW5bMF0uZWxlbWVudF0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlUHJldmlldygpO1xuXHRcdH1cblx0fVxuXG5cdGdldE1vZGVsKCk6IENhbGxIaWVyYXJjaHlNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0SW5wdXQoKTtcblx0fVxuXG5cdGdldEZvY3VzZWQoKTogY2FsbEhUcmVlLkNhbGwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLmdldEZvY3VzKClbMF07XG5cdH1cblxuXHRhc3luYyB1cGRhdGVEaXJlY3Rpb24obmV3RGlyZWN0aW9uOiBDYWxsSGllcmFyY2h5RGlyZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl90cmVlLmdldElucHV0KCk7XG5cdFx0aWYgKG1vZGVsICYmIG5ld0RpcmVjdGlvbiAhPT0gdGhpcy5fZGlyZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl90cmVlVmlld1N0YXRlcy5zZXQodGhpcy5fZGlyZWN0aW9uLCB0aGlzLl90cmVlLmdldFZpZXdTdGF0ZSgpKTtcblx0XHRcdHRoaXMuX2RpcmVjdGlvbiA9IG5ld0RpcmVjdGlvbjtcblx0XHRcdGF3YWl0IHRoaXMuc2hvd01vZGVsKG1vZGVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93KCkge1xuXHRcdGlmICghdGhpcy5faXNTaG93aW5nKSB7XG5cdFx0XHR0aGlzLmVkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydCh0aGlzLl93aGVyZS5saW5lTnVtYmVyLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0XHRzdXBlci5zaG93KFJhbmdlLmZyb21Qb3NpdGlvbnModGhpcy5fd2hlcmUpLCB0aGlzLl9sYXlvdXRJbmZvLmhlaWdodCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoOiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5fZGltKSB7XG5cdFx0XHR0aGlzLl9kb0xheW91dEJvZHkodGhpcy5fZGltLmhlaWdodCwgd2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZG9MYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RpbS5oZWlnaHQgIT09IGhlaWdodCB8fCB0aGlzLl9kaW0ud2lkdGggIT09IHdpZHRoKSB7XG5cdFx0XHRzdXBlci5fZG9MYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdFx0dGhpcy5fZGltID0gbmV3IERpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblx0XHRcdHRoaXMuX2xheW91dEluZm8uaGVpZ2h0ID0gdGhpcy5fdmlld1pvbmUgPyB0aGlzLl92aWV3Wm9uZS5oZWlnaHRJbkxpbmVzIDogdGhpcy5fbGF5b3V0SW5mby5oZWlnaHQ7XG5cdFx0XHR0aGlzLl9zcGxpdFZpZXcubGF5b3V0KHdpZHRoKTtcblx0XHRcdHRoaXMuX3NwbGl0Vmlldy5yZXNpemVWaWV3KDAsIHdpZHRoICogdGhpcy5fbGF5b3V0SW5mby5yYXRpbyk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLGNBQWM7QUFFMUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw4QkFBa0Q7QUFDM0QsU0FBUyw4QkFBOEQ7QUFFdkUsWUFBWSxlQUFlO0FBRTNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQWlCLGFBQWE7QUFDOUIsU0FBUyxXQUFXLGFBQWEsY0FBYztBQUMvQyxTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsYUFBYTtBQUN0QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGNBQWMsdUJBQXVCO0FBQzlDLFNBQVMsd0JBQXdFLHlCQUF5QjtBQUMxRyxTQUFTLGtCQUFrQixxQkFBa0M7QUFFN0QsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsNEJBQXVDO0FBRWhELFNBQVMsUUFBUSxvQkFBb0I7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFFeEMsSUFBVyxRQUFYLGtCQUFXQSxXQUFYO0FBQ0MsRUFBQUEs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
