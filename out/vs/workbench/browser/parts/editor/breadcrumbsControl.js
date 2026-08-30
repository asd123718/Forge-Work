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
import * as dom from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { BreadcrumbsItem, BreadcrumbsWidget } from "../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js";
import { applyDragImage } from "../../../../base/browser/ui/dnd/dnd.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { timeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { combinedDisposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { basename } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { OutlineElement } from "../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService, IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { fillInSymbolsDragData, LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IListService, WorkbenchAsyncDataTree, WorkbenchDataTree, WorkbenchListFocusContextKey } from "../../../../platform/list/browser/listService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { defaultBreadcrumbsWidgetStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { hiddenEditorTypesSettingId, IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IOutlineService, OutlineTarget } from "../../../services/outline/browser/outline.js";
import { DraggedEditorIdentifier, fillEditorsDragData } from "../../dnd.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../labels.js";
import { BreadcrumbsConfig, IBreadcrumbsService } from "./breadcrumbs.js";
import { BreadcrumbsModel, FileElement, OutlineElement2 } from "./breadcrumbsModel.js";
import { BreadcrumbsFilePicker, BreadcrumbsOutlinePicker } from "./breadcrumbsPicker.js";
import { createEditorTypeActions, editorTypeDisplayLabel, getAvailableEditorTypes } from "./editorTypePicker.js";
import "./media/breadcrumbscontrol.css";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
let OutlineItem = class extends BreadcrumbsItem {
  constructor(model, element, options, _instantiationService) {
    super();
    this.model = model;
    this.element = element;
    this.options = options;
    this._instantiationService = _instantiationService;
    this._disposables = new DisposableStore();
  }
  dispose() {
    this._disposables.dispose();
  }
  equals(other) {
    if (!(other instanceof OutlineItem)) {
      return false;
    }
    return this.element.element === other.element.element && this.options.showFileIcons === other.options.showFileIcons && this.options.showSymbolIcons === other.options.showSymbolIcons;
  }
  render(container) {
    const { element, outline } = this.element;
    if (element === outline) {
      const element2 = dom.$("span", void 0, "\u2026");
      container.appendChild(element2);
      return;
    }
    const templateId = outline.config.delegate.getTemplateId(element);
    const renderer = outline.config.renderers.find((renderer2) => renderer2.templateId === templateId);
    if (!renderer) {
      container.textContent = "<<NO RENDERER>>";
      return;
    }
    const template = renderer.renderTemplate(container);
    renderer.renderElement({
      element,
      children: [],
      depth: 0,
      visibleChildrenCount: 0,
      visibleChildIndex: 0,
      collapsible: false,
      collapsed: false,
      visible: true,
      filterData: void 0
    }, 0, template, void 0);
    if (!this.options.showSymbolIcons) {
      dom.hide(template.iconClass);
    }
    this._disposables.add(toDisposable(() => {
      renderer.disposeTemplate(template);
    }));
    if (element instanceof OutlineElement && outline.uri) {
      this._disposables.add(this._instantiationService.invokeFunction((accessor) => createBreadcrumbDndObserver(accessor, container, element.symbol.name, { symbol: element.symbol, uri: outline.uri }, this.model, this.options.dragEditor)));
    }
  }
};
OutlineItem = __decorateClass([
  __decorateParam(3, IInstantiationService)
], OutlineItem);
let FileItem = class extends BreadcrumbsItem {
  constructor(model, element, options, _labels, _hoverDelegate, _instantiationService) {
    super();
    this.model = model;
    this.element = element;
    this.options = options;
    this._labels = _labels;
    this._hoverDelegate = _hoverDelegate;
    this._instantiationService = _instantiationService;
    this._disposables = new DisposableStore();
  }
  dispose() {
    this._disposables.dispose();
  }
  equals(other) {
    if (!(other instanceof FileItem)) {
      return false;
    }
    return this.element.equals(other.element) && this.options.showFileIcons === other.options.showFileIcons && this.options.showSymbolIcons === other.options.showSymbolIcons;
  }
  render(container) {
    const label = this._labels.create(container, { hoverDelegate: this._hoverDelegate });
    const options = {
      hidePath: true,
      hideIcon: this.element.kind === FileKind.FOLDER || !this.options.showFileIcons,
      fileKind: this.element.kind,
      fileDecorations: { colors: this.options.showDecorationColors, badges: false }
    };
    if (this.element.label) {
      label.setResource({ resource: this.element.uri, name: this.element.label }, { ...options, forceLabel: true });
    } else {
      label.setFile(this.element.uri, options);
    }
    container.classList.add(FileKind[this.element.kind].toLowerCase());
    this._disposables.add(label);
    this._disposables.add(this._instantiationService.invokeFunction((accessor) => createBreadcrumbDndObserver(accessor, container, basename(this.element.uri), this.element.uri, this.model, this.options.dragEditor)));
  }
};
FileItem = __decorateClass([
  __decorateParam(5, IInstantiationService)
], FileItem);
function createBreadcrumbDndObserver(accessor, container, label, item, model, dragEditor) {
  const instantiationService = accessor.get(IInstantiationService);
  container.draggable = true;
  return new dom.DragAndDropObserver(container, {
    onDragStart: (event) => {
      if (!event.dataTransfer) {
        return;
      }
      event.dataTransfer.effectAllowed = "copyMove";
      instantiationService.invokeFunction((accessor2) => {
        if (URI.isUri(item)) {
          fillEditorsDragData(accessor2, [item], event);
        } else {
          fillEditorsDragData(accessor2, [{ resource: item.uri, selection: item.symbol.range }], event);
          fillInSymbolsDragData([{
            name: item.symbol.name,
            fsPath: item.uri.fsPath,
            range: item.symbol.range,
            kind: item.symbol.kind
          }], event);
        }
        if (dragEditor && model.editor?.input) {
          const editorTransfer = LocalSelectionTransfer.getInstance();
          editorTransfer.setData([new DraggedEditorIdentifier({ editor: model.editor.input, groupId: model.editor.group.id })], DraggedEditorIdentifier.prototype);
        }
      });
      applyDragImage(event, container, label);
    }
  });
}
const separatorIcon = registerIcon("breadcrumb-separator", Codicon.chevronRight, localize("separatorIcon", "Icon for the separator in the breadcrumbs."));
let BreadcrumbsControl = class {
  constructor(container, _options, _editorGroup, _contextKeyService, _contextViewService, _contextMenuService, _instantiationService, _quickInputService, _fileService, _editorService, _editorResolverService, _commandService, _labelService, _configurationService, _hoverService, breadcrumbsService) {
    this._options = _options;
    this._editorGroup = _editorGroup;
    this._contextKeyService = _contextKeyService;
    this._contextViewService = _contextViewService;
    this._contextMenuService = _contextMenuService;
    this._instantiationService = _instantiationService;
    this._quickInputService = _quickInputService;
    this._fileService = _fileService;
    this._editorService = _editorService;
    this._editorResolverService = _editorResolverService;
    this._commandService = _commandService;
    this._labelService = _labelService;
    this._configurationService = _configurationService;
    this._hoverService = _hoverService;
    this._disposables = new DisposableStore();
    this._editorTypeDisposables = this._disposables.add(new DisposableStore());
    this._breadcrumbsDisposables = new DisposableStore();
    this._model = new MutableDisposable();
    this._breadcrumbsPickerShowing = false;
    this._onDidVisibilityChange = this._disposables.add(new Emitter());
    this.domNode = document.createElement("div");
    this.domNode.classList.add("breadcrumbs-control");
    this.domNode.classList.toggle("with-editor-type", !!_options.showEditorTypePicker);
    dom.append(container, this.domNode);
    this._cfUseQuickPick = BreadcrumbsConfig.UseQuickPick.bindTo(_configurationService);
    this._cfShowIcons = BreadcrumbsConfig.Icons.bindTo(_configurationService);
    this._cfShowEditorType = BreadcrumbsConfig.ShowEditorType.bindTo(_configurationService);
    this._cfTitleScrollbarSizing = BreadcrumbsConfig.TitleScrollbarSizing.bindTo(_configurationService);
    this._cfTitleScrollbarVisibility = BreadcrumbsConfig.TitleScrollbarVisibility.bindTo(_configurationService);
    this._labels = this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
    const sizing = this._cfTitleScrollbarSizing.getValue() ?? "default";
    const styles = _options.widgetStyles ?? defaultBreadcrumbsWidgetStyles;
    const visibility = this._cfTitleScrollbarVisibility?.getValue() ?? "auto";
    this._widget = new BreadcrumbsWidget(
      this.domNode,
      BreadcrumbsControl.SCROLLBAR_SIZES[sizing],
      BreadcrumbsControl.SCROLLBAR_VISIBILITY[visibility],
      separatorIcon,
      styles
    );
    this._widget.onDidSelectItem(this._onSelectEvent, this, this._disposables);
    this._widget.onDidFocusItem(this._onFocusEvent, this, this._disposables);
    this._widget.onDidChangeFocus(this._updateCkBreadcrumbsActive, this, this._disposables);
    if (this._options.showEditorTypePicker) {
      this._disposables.add(this._cfShowEditorType.onDidChange(() => this._updateEditorTypeControl()));
      this._disposables.add(_configurationService.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(hiddenEditorTypesSettingId)) {
          this._updateEditorTypeControl();
        }
      }));
    }
    this._ckBreadcrumbsPossible = BreadcrumbsControl.CK_BreadcrumbsPossible.bindTo(this._contextKeyService);
    this._ckBreadcrumbsVisible = BreadcrumbsControl.CK_BreadcrumbsVisible.bindTo(this._contextKeyService);
    this._ckBreadcrumbsActive = BreadcrumbsControl.CK_BreadcrumbsActive.bindTo(this._contextKeyService);
    this._ckBreadcrumbsHasSymbols = BreadcrumbsControl.CK_BreadcrumbsHasSymbols.bindTo(this._contextKeyService);
    this._hoverDelegate = getDefaultHoverDelegate("mouse");
    this._disposables.add(breadcrumbsService.register(this._editorGroup.id, this._widget));
    this.hide();
  }
  get onDidVisibilityChange() {
    return this._onDidVisibilityChange.event;
  }
  dispose() {
    this._disposables.dispose();
    this._breadcrumbsDisposables.dispose();
    this._model.dispose();
    this._ckBreadcrumbsPossible.reset();
    this._ckBreadcrumbsVisible.reset();
    this._ckBreadcrumbsActive.reset();
    this._ckBreadcrumbsHasSymbols.reset();
    this._cfUseQuickPick.dispose();
    this._cfShowIcons.dispose();
    this._cfShowEditorType.dispose();
    this._cfTitleScrollbarSizing.dispose();
    this._cfTitleScrollbarVisibility.dispose();
    this._widget.dispose();
    this._labels.dispose();
    this.domNode.remove();
  }
  get model() {
    return this._model.value;
  }
  layout(dim) {
    if (dim) {
      this._lastLayoutDimension = dim;
    }
    if (dim && this._editorTypeNode) {
      const editorTypeWidth = this._editorTypeNode.offsetWidth;
      dim = new dom.Dimension(Math.max(0, dim.width - editorTypeWidth), dim.height);
    }
    this._widget.layout(dim);
  }
  isHidden() {
    return this.domNode.classList.contains("hidden");
  }
  hide() {
    const wasHidden = this.isHidden();
    this._breadcrumbsDisposables.clear();
    this._ckBreadcrumbsVisible.set(false);
    this._ckBreadcrumbsHasSymbols.set(false);
    this.domNode.classList.toggle("hidden", true);
    this._hideEditorTypeControl();
    if (!wasHidden) {
      this._onDidVisibilityChange.fire();
    }
  }
  show() {
    const wasHidden = this.isHidden();
    this._ckBreadcrumbsVisible.set(true);
    this.domNode.classList.toggle("hidden", false);
    if (wasHidden) {
      this._onDidVisibilityChange.fire();
    }
  }
  revealLast() {
    this._widget.revealLast();
  }
  update() {
    this._breadcrumbsDisposables.clear();
    const canonicalUri = EditorResourceAccessor.getCanonicalUri(this._editorGroup.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const originalUri = EditorResourceAccessor.getOriginalUri(this._editorGroup.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const uri = originalUri ?? canonicalUri;
    const wasHidden = this.isHidden();
    if (!uri || !this._fileService.hasProvider(uri)) {
      this._ckBreadcrumbsPossible.set(false);
      this._ckBreadcrumbsHasSymbols.set(false);
      if (!wasHidden) {
        this.hide();
        return true;
      } else {
        return false;
      }
    }
    this.show();
    this._ckBreadcrumbsPossible.set(true);
    this._updateEditorTypeControl();
    const model = this._instantiationService.createInstance(
      BreadcrumbsModel,
      uri,
      this._editorGroup.activeEditorPane
    );
    this._model.value = model;
    this.domNode.classList.toggle("backslash-path", this._labelService.getSeparator(uri.scheme, uri.authority) === "\\");
    const updateBreadcrumbs = () => {
      this.domNode.classList.toggle("relative-path", model.isRelative());
      const showIcons = this._cfShowIcons.getValue();
      const options = {
        ...this._options,
        showFileIcons: this._options.showFileIcons && showIcons,
        showSymbolIcons: this._options.showSymbolIcons && showIcons
      };
      const elements = model.getElements();
      this._ckBreadcrumbsHasSymbols.set(elements.some((element) => !(element instanceof FileElement)));
      const items = elements.map((element) => element instanceof FileElement ? this._instantiationService.createInstance(FileItem, model, element, options, this._labels, this._hoverDelegate) : this._instantiationService.createInstance(OutlineItem, model, element, options));
      if (items.length === 0) {
        this._widget.setEnabled(false);
        this._widget.setItems([new class extends BreadcrumbsItem {
          render(container) {
            container.textContent = localize("empty", "no elements");
          }
          equals(other) {
            return other === this;
          }
          dispose() {
          }
        }()]);
      } else {
        this._widget.setEnabled(true);
        this._widget.setItems(items);
        this._widget.reveal(items[items.length - 1]);
      }
    };
    const listener = model.onDidUpdate(updateBreadcrumbs);
    const configListener = this._cfShowIcons.onDidChange(updateBreadcrumbs);
    updateBreadcrumbs();
    this._breadcrumbsDisposables.clear();
    this._breadcrumbsDisposables.add(listener);
    this._breadcrumbsDisposables.add(toDisposable(() => this._model.clear()));
    this._breadcrumbsDisposables.add(configListener);
    this._breadcrumbsDisposables.add(toDisposable(() => this._widget.setItems([])));
    const updateScrollbarSizing = () => {
      const sizing = this._cfTitleScrollbarSizing.getValue() ?? "default";
      const visibility = this._cfTitleScrollbarVisibility?.getValue() ?? "auto";
      this._widget.setHorizontalScrollbarSize(BreadcrumbsControl.SCROLLBAR_SIZES[sizing]);
      this._widget.setHorizontalScrollbarVisibility(BreadcrumbsControl.SCROLLBAR_VISIBILITY[visibility]);
    };
    updateScrollbarSizing();
    const updateScrollbarSizeListener = this._cfTitleScrollbarSizing.onDidChange(updateScrollbarSizing);
    const updateScrollbarVisibilityListener = this._cfTitleScrollbarVisibility.onDidChange(updateScrollbarSizing);
    this._breadcrumbsDisposables.add(updateScrollbarSizeListener);
    this._breadcrumbsDisposables.add(updateScrollbarVisibilityListener);
    this._breadcrumbsDisposables.add({
      dispose: () => {
        if (this._breadcrumbsPickerShowing) {
          this._contextViewService.hideContextView({ source: this });
        }
      }
    });
    return wasHidden !== this.isHidden();
  }
  _updateEditorTypeControl() {
    const previousWidth = this._editorTypeNode?.offsetWidth ?? 0;
    const available = this._options.showEditorTypePicker && this._cfShowEditorType.getValue() ? this._getAvailableEditorTypes() : void 0;
    if (!available) {
      this._hideEditorTypeControl();
    } else {
      const { label: editorTypeLabel, hover: editorTypeHover } = this._createEditorTypeControl();
      const current = available.editors.find((editor) => editor.id === available.currentId);
      const label = current ? editorTypeDisplayLabel(current, available.isDiffEditor) : available.currentId;
      editorTypeLabel.textContent = label;
      editorTypeHover.update(localize("editorType.hover", "Editor: {0}", label));
    }
    const currentWidth = this._editorTypeNode?.offsetWidth ?? 0;
    if (this._lastLayoutDimension && currentWidth !== previousWidth) {
      this.layout(this._lastLayoutDimension);
    }
  }
  _getAvailableEditorTypes() {
    return getAvailableEditorTypes(
      this._editorGroup.activeEditor,
      this._editorResolverService,
      this._configurationService.getValue(hiddenEditorTypesSettingId)
    );
  }
  _createEditorTypeControl() {
    if (this._editorTypeNode && this._editorTypeLabel && this._editorTypeHover) {
      return { label: this._editorTypeLabel, hover: this._editorTypeHover };
    }
    this._editorTypeNode = document.createElement("div");
    this._editorTypeNode.classList.add("breadcrumbs-editor-type");
    this._editorTypeNode.setAttribute("role", "button");
    this._editorTypeLabel = document.createElement("span");
    this._editorTypeLabel.classList.add("label");
    this._editorTypeNode.appendChild(this._editorTypeLabel);
    const editorTypeChevron = document.createElement("span");
    editorTypeChevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    this._editorTypeNode.appendChild(editorTypeChevron);
    dom.append(this.domNode, this._editorTypeNode);
    this._editorTypeHover = this._editorTypeDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this._editorTypeNode, ""));
    this._editorTypeDisposables.add(dom.addDisposableListener(this._editorTypeNode, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._showEditorTypePicker();
    }));
    return { label: this._editorTypeLabel, hover: this._editorTypeHover };
  }
  _hideEditorTypeControl() {
    this._editorTypeDisposables.clear();
    this._editorTypeNode?.remove();
    this._editorTypeNode = void 0;
    this._editorTypeLabel = void 0;
    this._editorTypeHover = void 0;
  }
  _showEditorTypePicker() {
    const editorTypeNode = this._editorTypeNode;
    if (!editorTypeNode) {
      return;
    }
    const available = this._getAvailableEditorTypes();
    if (!available) {
      return;
    }
    const actions = createEditorTypeActions(available, this._editorResolverService, this._commandService, this._editorService);
    this._contextMenuService.showContextMenu({
      getAnchor: () => editorTypeNode,
      getActions: () => actions
    });
  }
  _onFocusEvent(event) {
    if (event.item && this._breadcrumbsPickerShowing) {
      this._breadcrumbsPickerIgnoreOnceItem = void 0;
      this._widget.setSelection(event.item);
    }
  }
  _onSelectEvent(event) {
    if (!event.item) {
      return;
    }
    if (event.item === this._breadcrumbsPickerIgnoreOnceItem) {
      this._breadcrumbsPickerIgnoreOnceItem = void 0;
      this._widget.setFocused(void 0);
      this._widget.setSelection(void 0);
      return;
    }
    const { element } = event.item;
    this._editorGroup.focus();
    const group = this._getEditorGroup(event.payload);
    if (group !== void 0) {
      this._widget.setFocused(void 0);
      this._widget.setSelection(void 0);
      this._revealInEditor(event, element, group);
      return;
    }
    if (this._cfUseQuickPick.getValue()) {
      this._widget.setFocused(void 0);
      this._widget.setSelection(void 0);
      this._quickInputService.quickAccess.show(element instanceof OutlineElement2 ? "@" : "");
      return;
    }
    let picker;
    let pickerAnchor;
    this._contextViewService.showContextView({
      render: (parent) => {
        if (event.item instanceof FileItem) {
          picker = this._instantiationService.createInstance(BreadcrumbsFilePicker, parent, event.item.model.resource);
        } else if (event.item instanceof OutlineItem) {
          picker = this._instantiationService.createInstance(BreadcrumbsOutlinePicker, parent, event.item.model.resource);
        }
        const selectListener = picker.onWillPickElement(() => this._contextViewService.hideContextView({ source: this, didPick: true }));
        const zoomListener = PixelRatio.getInstance(dom.getWindow(this.domNode)).onDidChange(() => this._contextViewService.hideContextView({ source: this }));
        const focusTracker = dom.trackFocus(parent);
        const blurListener = focusTracker.onDidBlur(() => {
          this._breadcrumbsPickerIgnoreOnceItem = this._widget.isDOMFocused() ? event.item : void 0;
          this._contextViewService.hideContextView({ source: this });
        });
        this._breadcrumbsPickerShowing = true;
        this._updateCkBreadcrumbsActive();
        return combinedDisposable(
          picker,
          selectListener,
          zoomListener,
          focusTracker,
          blurListener
        );
      },
      getAnchor: () => {
        if (!pickerAnchor) {
          const window = dom.getWindow(this.domNode);
          const maxInnerWidth = window.innerWidth - 8;
          let maxHeight = Math.min(window.innerHeight * 0.7, 300);
          const pickerWidth = Math.min(maxInnerWidth, Math.max(240, maxInnerWidth / 4.17));
          const pickerArrowSize = 8;
          let pickerArrowOffset;
          const data = dom.getDomNodePagePosition(event.node);
          const y = data.top + data.height + pickerArrowSize;
          if (y + maxHeight >= window.innerHeight) {
            maxHeight = window.innerHeight - y - 30;
          }
          let x = data.left;
          if (x + pickerWidth >= maxInnerWidth) {
            x = maxInnerWidth - pickerWidth;
          }
          if (event.payload instanceof StandardMouseEvent) {
            const maxPickerArrowOffset = pickerWidth - 2 * pickerArrowSize;
            pickerArrowOffset = event.payload.posx - x;
            if (pickerArrowOffset > maxPickerArrowOffset) {
              x = Math.min(maxInnerWidth - pickerWidth, x + pickerArrowOffset - maxPickerArrowOffset);
              pickerArrowOffset = maxPickerArrowOffset;
            }
          } else {
            pickerArrowOffset = data.left + data.width * 0.3 - x;
          }
          picker.show(element, maxHeight, pickerWidth, pickerArrowSize, Math.max(0, pickerArrowOffset));
          pickerAnchor = { x, y };
        }
        return pickerAnchor;
      },
      onHide: (data) => {
        if (!data?.didPick) {
          picker.restoreViewState();
        }
        this._breadcrumbsPickerShowing = false;
        this._updateCkBreadcrumbsActive();
        if (data?.source === this) {
          this._widget.setFocused(void 0);
          this._widget.setSelection(void 0);
        }
        picker.dispose();
      }
    });
  }
  _updateCkBreadcrumbsActive() {
    const value = this._widget.isDOMFocused() || this._breadcrumbsPickerShowing;
    this._ckBreadcrumbsActive.set(value);
  }
  async _revealInEditor(event, element, group, pinned = false) {
    if (element instanceof FileElement) {
      if (element.kind === FileKind.FILE) {
        await this._editorService.openEditor({ resource: element.uri, options: { pinned } }, group);
      } else {
        const items = this._widget.getItems();
        const idx = items.indexOf(event.item);
        this._widget.setFocused(items[idx + 1]);
        this._widget.setSelection(items[idx + 1], BreadcrumbsControl.Payload_Pick);
      }
    } else {
      element.outline.reveal(element, { pinned }, group === SIDE_GROUP, false);
    }
  }
  _getEditorGroup(data) {
    if (data === BreadcrumbsControl.Payload_RevealAside) {
      return SIDE_GROUP;
    } else if (data === BreadcrumbsControl.Payload_Reveal) {
      return ACTIVE_GROUP;
    } else {
      return void 0;
    }
  }
};
BreadcrumbsControl.HEIGHT = 22;
BreadcrumbsControl.SCROLLBAR_SIZES = {
  default: 3,
  large: 8
};
BreadcrumbsControl.SCROLLBAR_VISIBILITY = {
  auto: ScrollbarVisibility.Auto,
  visible: ScrollbarVisibility.Visible,
  hidden: ScrollbarVisibility.Hidden
};
BreadcrumbsControl.Payload_Reveal = {};
BreadcrumbsControl.Payload_RevealAside = {};
BreadcrumbsControl.Payload_Pick = {};
BreadcrumbsControl.CK_BreadcrumbsPossible = new RawContextKey("breadcrumbsPossible", false, localize("breadcrumbsPossible", "Whether the editor can show breadcrumbs"));
BreadcrumbsControl.CK_BreadcrumbsVisible = new RawContextKey("breadcrumbsVisible", false, localize("breadcrumbsVisible", "Whether breadcrumbs are currently visible"));
BreadcrumbsControl.CK_BreadcrumbsActive = new RawContextKey("breadcrumbsActive", false, localize("breadcrumbsActive", "Whether breadcrumbs have focus"));
BreadcrumbsControl.CK_BreadcrumbsHasSymbols = new RawContextKey("breadcrumbsHasSymbols", false, localize("breadcrumbsHasSymbols", "Whether breadcrumbs contain symbol items"));
BreadcrumbsControl = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IQuickInputService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IEditorResolverService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IBreadcrumbsService)
], BreadcrumbsControl);
let BreadcrumbsControlFactory = class {
  constructor(_container, _editorGroup, _options, configurationService, _instantiationService, fileService) {
    this._container = _container;
    this._editorGroup = _editorGroup;
    this._options = _options;
    this._instantiationService = _instantiationService;
    this._disposables = new DisposableStore();
    this._controlDisposables = new DisposableStore();
    this._onDidEnablementChange = this._disposables.add(new Emitter());
    this._onDidVisibilityChange = this._disposables.add(new Emitter());
    const config = this._disposables.add(BreadcrumbsConfig.IsEnabled.bindTo(configurationService));
    const isEnabled = () => config.getValue() && this._editorGroup.groupsView.partOptions.showBreadcrumbs !== false;
    const updateControl = () => {
      const enabled = isEnabled();
      if (!enabled && this._control) {
        this._controlDisposables.clear();
        this._control = void 0;
        this._onDidEnablementChange.fire();
      } else if (enabled && !this._control) {
        this._control = this.createControl();
        this._control.update();
        this._onDidEnablementChange.fire();
      }
    };
    this._disposables.add(config.onDidChange(updateControl));
    this._disposables.add(this._editorGroup.groupsView.onDidChangeEditorPartOptions((e) => {
      if (e.oldPartOptions.showBreadcrumbs !== e.newPartOptions.showBreadcrumbs) {
        updateControl();
      }
    }));
    if (isEnabled()) {
      this._control = this.createControl();
    }
    this._disposables.add(fileService.onDidChangeFileSystemProviderRegistrations((e) => {
      if (this._control?.model && this._control.model.resource.scheme !== e.scheme) {
        return;
      }
      if (this._control?.update()) {
        this._onDidEnablementChange.fire();
      }
    }));
  }
  get control() {
    return this._control;
  }
  get onDidEnablementChange() {
    return this._onDidEnablementChange.event;
  }
  get onDidVisibilityChange() {
    return this._onDidVisibilityChange.event;
  }
  createControl() {
    const control = this._controlDisposables.add(this._instantiationService.createInstance(BreadcrumbsControl, this._container, this._options, this._editorGroup));
    this._controlDisposables.add(control.onDidVisibilityChange(() => this._onDidVisibilityChange.fire()));
    return control;
  }
  dispose() {
    this._disposables.dispose();
    this._controlDisposables.dispose();
  }
};
BreadcrumbsControlFactory = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IFileService)
], BreadcrumbsControlFactory);
registerAction2(class ToggleBreadcrumb extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.toggle",
      title: localize2("cmd.toggle", "Toggle Breadcrumbs"),
      shortTitle: localize2("cmd.toggle.short", "Breadcrumbs"),
      category: Categories.View,
      toggled: {
        condition: ContextKeyExpr.equals("config.breadcrumbs.enabled", true),
        title: localize("cmd.toggle2", "Breadcrumbs"),
        mnemonicTitle: localize({ key: "miBreadcrumbs2", comment: ["&& denotes a mnemonic"] }, "&&Breadcrumbs")
      },
      menu: [
        { id: MenuId.CommandPalette },
        { id: MenuId.MenubarAppearanceMenu, group: "4_editor", order: 2 },
        { id: MenuId.NotebookToolbar, group: "notebookLayout", order: 2 },
        { id: MenuId.StickyScrollContext },
        { id: MenuId.NotebookStickyScrollContext, group: "notebookView", order: 2 },
        { id: MenuId.NotebookToolbarContext, group: "notebookView", order: 2 }
      ]
    });
  }
  run(accessor) {
    const config = accessor.get(IConfigurationService);
    const breadCrumbsConfig = BreadcrumbsConfig.IsEnabled.bindTo(config);
    const value = breadCrumbsConfig.getValue();
    breadCrumbsConfig.updateValue(!value);
    breadCrumbsConfig.dispose();
  }
});
function focusAndSelectHandler(accessor, select) {
  const groups = accessor.get(IEditorGroupsService);
  const breadcrumbs = accessor.get(IBreadcrumbsService);
  const widget = breadcrumbs.getWidget(groups.activeGroup.id);
  if (widget) {
    const item = widget.getItems().at(-1);
    widget.setFocused(item);
    if (select) {
      widget.setSelection(item, BreadcrumbsControl.Payload_Pick);
    }
  }
}
registerAction2(class FocusAndSelectBreadcrumbs extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.focusAndSelect",
      title: localize2("cmd.focusAndSelect", "Focus and Select Breadcrumbs"),
      precondition: BreadcrumbsControl.CK_BreadcrumbsVisible,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period,
        when: BreadcrumbsControl.CK_BreadcrumbsPossible
      },
      f1: true
    });
  }
  run(accessor, ...args) {
    focusAndSelectHandler(accessor, true);
  }
});
registerAction2(class FocusBreadcrumbs extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.focus",
      title: localize2("cmd.focus", "Focus Breadcrumbs"),
      precondition: BreadcrumbsControl.CK_BreadcrumbsVisible,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Semicolon,
        when: BreadcrumbsControl.CK_BreadcrumbsPossible
      },
      f1: true
    });
  }
  run(accessor, ...args) {
    focusAndSelectHandler(accessor, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.toggleToOn",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period,
  when: ContextKeyExpr.not("config.breadcrumbs.enabled"),
  handler: async (accessor) => {
    const instant = accessor.get(IInstantiationService);
    const config = accessor.get(IConfigurationService);
    const isEnabled = BreadcrumbsConfig.IsEnabled.bindTo(config);
    if (!isEnabled.getValue()) {
      await isEnabled.updateValue(true);
      await timeout(50);
    }
    isEnabled.dispose();
    return instant.invokeFunction(focusAndSelectHandler, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusNext",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.RightArrow,
  secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow],
  mac: {
    primary: KeyCode.RightArrow,
    secondary: [KeyMod.Alt | KeyCode.RightArrow]
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusNext();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusPrevious",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.LeftArrow,
  secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow],
  mac: {
    primary: KeyCode.LeftArrow,
    secondary: [KeyMod.Alt | KeyCode.LeftArrow]
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusPrev();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusNextWithPicker",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.RightArrow
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusNext();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusPreviousWithPicker",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.LeftArrow
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusPrev();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.selectFocused",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.Enter,
  secondary: [KeyCode.DownArrow],
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.setSelection(widget.getFocused(), BreadcrumbsControl.Payload_Pick);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.revealFocused",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.Space,
  secondary: [KeyMod.CtrlCmd | KeyCode.Enter],
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.setSelection(widget.getFocused(), BreadcrumbsControl.Payload_Reveal);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.selectEditor",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  primary: KeyCode.Escape,
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.setFocused(void 0);
    widget.setSelection(void 0);
    groups.activeGroup.activeEditorPane?.focus();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.revealFocusedFromTreeAside",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
  handler(accessor) {
    const editors = accessor.get(IEditorService);
    const lists = accessor.get(IListService);
    const tree = lists.lastFocusedList;
    if (!(tree instanceof WorkbenchDataTree) && !(tree instanceof WorkbenchAsyncDataTree)) {
      return;
    }
    const element = tree.getFocus()[0];
    if (URI.isUri(element?.resource)) {
      return editors.openEditor({
        resource: element.resource,
        options: { pinned: true }
      }, SIDE_GROUP);
    }
    const input = tree.getInput();
    if (input && typeof input.outlineKind === "string") {
      return input.reveal(element, {
        pinned: true,
        preserveFocus: false
      }, true, false);
    }
  }
});
registerAction2(class CopyBreadcrumbPath extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.copyPath",
      title: localize2("cmd.copyPath", "Copy Breadcrumbs Path"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsHasSymbols),
      f1: true,
      menu: [{
        id: MenuId.EditorTitleContext,
        group: "1_cutcopypaste",
        order: 100,
        when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsPossible, BreadcrumbsControl.CK_BreadcrumbsHasSymbols)
      }]
    });
  }
  async run(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const clipboardService = accessor.get(IClipboardService);
    const configurationService = accessor.get(IConfigurationService);
    const outlineService = accessor.get(IOutlineService);
    if (!groups.activeGroup.activeEditorPane) {
      return;
    }
    const outline = await outlineService.createOutline(groups.activeGroup.activeEditorPane, OutlineTarget.Breadcrumbs, CancellationToken.None);
    if (!outline) {
      return;
    }
    const elements = outline.config.breadcrumbsDataSource.getBreadcrumbElements();
    const labels = elements.map((item) => item.label).filter(Boolean);
    outline.dispose();
    if (labels.length === 0) {
      return;
    }
    const resource = groups.activeGroup.activeEditorPane.input.resource;
    const config = BreadcrumbsConfig.SymbolPathSeparator.bindTo(configurationService);
    const separator = config.getValue(resource && { resource }) ?? ".";
    config.dispose();
    const path = labels.join(separator);
    await clipboardService.writeText(path);
  }
});
export {
  BreadcrumbsControl,
  BreadcrumbsControlFactory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGJyZWFkY3J1bWJzQ29udHJvbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IFBpeGVsUmF0aW8gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvcGl4ZWxSYXRpby5qcyc7XG5pbXBvcnQgeyBCcmVhZGNydW1ic0l0ZW0sIEJyZWFkY3J1bWJzV2lkZ2V0LCBJQnJlYWRjcnVtYnNJdGVtRXZlbnQsIElCcmVhZGNydW1ic1dpZGdldFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9icmVhZGNydW1icy9icmVhZGNydW1ic1dpZGdldC5qcyc7XG5pbXBvcnQgeyBhcHBseURyYWdJbWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kbmQvZG5kLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudFN5bWJvbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IE91dGxpbmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZG9jdW1lbnRTeW1ib2xzL2Jyb3dzZXIvb3V0bGluZU1vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UsIElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGZpbGxJblN5bWJvbHNEcmFnRGF0YSwgTG9jYWxTZWxlY3Rpb25UcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBXb3JrYmVuY2hBc3luY0RhdGFUcmVlLCBXb3JrYmVuY2hEYXRhVHJlZSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCcmVhZGNydW1ic1dpZGdldFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElFZGl0b3JQYXJ0T3B0aW9ucywgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGlkZGVuRWRpdG9yVHlwZXNTZXR0aW5nSWQsIElFZGl0b3JSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIEFDVElWRV9HUk9VUF9UWVBFLCBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCwgU0lERV9HUk9VUF9UWVBFIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPdXRsaW5lLCBJT3V0bGluZVNlcnZpY2UsIE91dGxpbmVUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9vdXRsaW5lL2Jyb3dzZXIvb3V0bGluZS5qcyc7XG5pbXBvcnQgeyBEcmFnZ2VkRWRpdG9ySWRlbnRpZmllciwgZmlsbEVkaXRvcnNEcmFnRGF0YSB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0xBQkVMU19DT05UQUlORVIsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vbGFiZWxzLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzQ29uZmlnLCBJQnJlYWRjcnVtYnNTZXJ2aWNlIH0gZnJvbSAnLi9icmVhZGNydW1icy5qcyc7XG5pbXBvcnQgeyBCcmVhZGNydW1ic01vZGVsLCBGaWxlRWxlbWVudCwgT3V0bGluZUVsZW1lbnQyIH0gZnJvbSAnLi9icmVhZGNydW1ic01vZGVsLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzRmlsZVBpY2tlciwgQnJlYWRjcnVtYnNPdXRsaW5lUGlja2VyIH0gZnJvbSAnLi9icmVhZGNydW1ic1BpY2tlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBWaWV3IH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlRWRpdG9yVHlwZUFjdGlvbnMsIGVkaXRvclR5cGVEaXNwbGF5TGFiZWwsIGdldEF2YWlsYWJsZUVkaXRvclR5cGVzLCBJQXZhaWxhYmxlRWRpdG9yVHlwZXMgfSBmcm9tICcuL2VkaXRvclR5cGVQaWNrZXIuanMnO1xuaW1wb3J0ICcuL21lZGlhL2JyZWFkY3J1bWJzY29udHJvbC5jc3MnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuXG5jbGFzcyBPdXRsaW5lSXRlbSBleHRlbmRzIEJyZWFkY3J1bWJzSXRlbSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbW9kZWw6IEJyZWFkY3J1bWJzTW9kZWwsXG5cdFx0cmVhZG9ubHkgZWxlbWVudDogT3V0bGluZUVsZW1lbnQyLFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IElCcmVhZGNydW1ic0NvbnRyb2xPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IEluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBCcmVhZGNydW1ic0l0ZW0pOiBib29sZWFuIHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIE91dGxpbmVJdGVtKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50LmVsZW1lbnQgPT09IG90aGVyLmVsZW1lbnQuZWxlbWVudCAmJlxuXHRcdFx0dGhpcy5vcHRpb25zLnNob3dGaWxlSWNvbnMgPT09IG90aGVyLm9wdGlvbnMuc2hvd0ZpbGVJY29ucyAmJlxuXHRcdFx0dGhpcy5vcHRpb25zLnNob3dTeW1ib2xJY29ucyA9PT0gb3RoZXIub3B0aW9ucy5zaG93U3ltYm9sSWNvbnM7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZWxlbWVudCwgb3V0bGluZSB9ID0gdGhpcy5lbGVtZW50O1xuXG5cdFx0aWYgKGVsZW1lbnQgPT09IG91dGxpbmUpIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBkb20uJCgnc3BhbicsIHVuZGVmaW5lZCwgJ1x1MjAyNicpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRlbXBsYXRlSWQgPSBvdXRsaW5lLmNvbmZpZy5kZWxlZ2F0ZS5nZXRUZW1wbGF0ZUlkKGVsZW1lbnQpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gb3V0bGluZS5jb25maWcucmVuZGVyZXJzLmZpbmQocmVuZGVyZXIgPT4gcmVuZGVyZXIudGVtcGxhdGVJZCA9PT0gdGVtcGxhdGVJZCk7XG5cdFx0aWYgKCFyZW5kZXJlcikge1xuXHRcdFx0Y29udGFpbmVyLnRleHRDb250ZW50ID0gJzw8Tk8gUkVOREVSRVI+Pic7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVtcGxhdGUgPSByZW5kZXJlci5yZW5kZXJUZW1wbGF0ZShjb250YWluZXIpO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQoe1xuXHRcdFx0ZWxlbWVudCxcblx0XHRcdGNoaWxkcmVuOiBbXSxcblx0XHRcdGRlcHRoOiAwLFxuXHRcdFx0dmlzaWJsZUNoaWxkcmVuQ291bnQ6IDAsXG5cdFx0XHR2aXNpYmxlQ2hpbGRJbmRleDogMCxcblx0XHRcdGNvbGxhcHNpYmxlOiBmYWxzZSxcblx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHR2aXNpYmxlOiB0cnVlLFxuXHRcdFx0ZmlsdGVyRGF0YTogdW5kZWZpbmVkXG5cdFx0fSwgMCwgdGVtcGxhdGUsIHVuZGVmaW5lZCk7XG5cblx0XHRpZiAoIXRoaXMub3B0aW9ucy5zaG93U3ltYm9sSWNvbnMpIHtcblx0XHRcdGRvbS5oaWRlKHRlbXBsYXRlLmljb25DbGFzcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7IHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZSk7IH0pKTtcblxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgT3V0bGluZUVsZW1lbnQgJiYgb3V0bGluZS51cmkpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjcmVhdGVCcmVhZGNydW1iRG5kT2JzZXJ2ZXIoYWNjZXNzb3IsIGNvbnRhaW5lciwgZWxlbWVudC5zeW1ib2wubmFtZSwgeyBzeW1ib2w6IGVsZW1lbnQuc3ltYm9sLCB1cmk6IG91dGxpbmUudXJpISB9LCB0aGlzLm1vZGVsLCB0aGlzLm9wdGlvbnMuZHJhZ0VkaXRvcikpKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgRmlsZUl0ZW0gZXh0ZW5kcyBCcmVhZGNydW1ic0l0ZW0ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG1vZGVsOiBCcmVhZGNydW1ic01vZGVsLFxuXHRcdHJlYWRvbmx5IGVsZW1lbnQ6IEZpbGVFbGVtZW50LFxuXHRcdHJlYWRvbmx5IG9wdGlvbnM6IElCcmVhZGNydW1ic0NvbnRyb2xPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGVxdWFscyhvdGhlcjogQnJlYWRjcnVtYnNJdGVtKTogYm9vbGVhbiB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBGaWxlSXRlbSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuICh0aGlzLmVsZW1lbnQuZXF1YWxzKG90aGVyLmVsZW1lbnQpICYmXG5cdFx0XHR0aGlzLm9wdGlvbnMuc2hvd0ZpbGVJY29ucyA9PT0gb3RoZXIub3B0aW9ucy5zaG93RmlsZUljb25zICYmXG5cdFx0XHR0aGlzLm9wdGlvbnMuc2hvd1N5bWJvbEljb25zID09PSBvdGhlci5vcHRpb25zLnNob3dTeW1ib2xJY29ucyk7XG5cblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gZmlsZS9mb2xkZXJcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX2xhYmVscy5jcmVhdGUoY29udGFpbmVyLCB7IGhvdmVyRGVsZWdhdGU6IHRoaXMuX2hvdmVyRGVsZWdhdGUgfSk7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdGhpZGVQYXRoOiB0cnVlLFxuXHRcdFx0aGlkZUljb246IHRoaXMuZWxlbWVudC5raW5kID09PSBGaWxlS2luZC5GT0xERVIgfHwgIXRoaXMub3B0aW9ucy5zaG93RmlsZUljb25zLFxuXHRcdFx0ZmlsZUtpbmQ6IHRoaXMuZWxlbWVudC5raW5kLFxuXHRcdFx0ZmlsZURlY29yYXRpb25zOiB7IGNvbG9yczogdGhpcy5vcHRpb25zLnNob3dEZWNvcmF0aW9uQ29sb3JzLCBiYWRnZXM6IGZhbHNlIH0sXG5cdFx0fTtcblx0XHRpZiAodGhpcy5lbGVtZW50LmxhYmVsKSB7XG5cdFx0XHRsYWJlbC5zZXRSZXNvdXJjZSh7IHJlc291cmNlOiB0aGlzLmVsZW1lbnQudXJpLCBuYW1lOiB0aGlzLmVsZW1lbnQubGFiZWwgfSwgeyAuLi5vcHRpb25zLCBmb3JjZUxhYmVsOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYWJlbC5zZXRGaWxlKHRoaXMuZWxlbWVudC51cmksIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChGaWxlS2luZFt0aGlzLmVsZW1lbnQua2luZF0udG9Mb3dlckNhc2UoKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGxhYmVsKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjcmVhdGVCcmVhZGNydW1iRG5kT2JzZXJ2ZXIoYWNjZXNzb3IsIGNvbnRhaW5lciwgYmFzZW5hbWUodGhpcy5lbGVtZW50LnVyaSksIHRoaXMuZWxlbWVudC51cmksIHRoaXMubW9kZWwsIHRoaXMub3B0aW9ucy5kcmFnRWRpdG9yKSkpO1xuXHR9XG59XG5cblxuZnVuY3Rpb24gY3JlYXRlQnJlYWRjcnVtYkRuZE9ic2VydmVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBpdGVtOiBVUkkgfCB7IHN5bWJvbDogRG9jdW1lbnRTeW1ib2w7IHVyaTogVVJJIH0sIG1vZGVsOiBCcmVhZGNydW1ic01vZGVsLCBkcmFnRWRpdG9yOiBib29sZWFuKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnRhaW5lci5kcmFnZ2FibGUgPSB0cnVlO1xuXG5cdHJldHVybiBuZXcgZG9tLkRyYWdBbmREcm9wT2JzZXJ2ZXIoY29udGFpbmVyLCB7XG5cdFx0b25EcmFnU3RhcnQ6IGV2ZW50ID0+IHtcblx0XHRcdGlmICghZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IGRhdGEgdHJhbnNmZXJcblx0XHRcdGV2ZW50LmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ2NvcHlNb3ZlJztcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKGl0ZW0pKSB7XG5cdFx0XHRcdFx0ZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvciwgW2l0ZW1dLCBldmVudCk7XG5cdFx0XHRcdH0gZWxzZSB7IC8vIFN5bWJvbFxuXHRcdFx0XHRcdGZpbGxFZGl0b3JzRHJhZ0RhdGEoYWNjZXNzb3IsIFt7IHJlc291cmNlOiBpdGVtLnVyaSwgc2VsZWN0aW9uOiBpdGVtLnN5bWJvbC5yYW5nZSB9XSwgZXZlbnQpO1xuXG5cdFx0XHRcdFx0ZmlsbEluU3ltYm9sc0RyYWdEYXRhKFt7XG5cdFx0XHRcdFx0XHRuYW1lOiBpdGVtLnN5bWJvbC5uYW1lLFxuXHRcdFx0XHRcdFx0ZnNQYXRoOiBpdGVtLnVyaS5mc1BhdGgsXG5cdFx0XHRcdFx0XHRyYW5nZTogaXRlbS5zeW1ib2wucmFuZ2UsXG5cdFx0XHRcdFx0XHRraW5kOiBpdGVtLnN5bWJvbC5raW5kXG5cdFx0XHRcdFx0fV0sIGV2ZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChkcmFnRWRpdG9yICYmIG1vZGVsLmVkaXRvcj8uaW5wdXQpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvcklkZW50aWZpZXI+KCk7XG5cdFx0XHRcdFx0ZWRpdG9yVHJhbnNmZXIuc2V0RGF0YShbbmV3IERyYWdnZWRFZGl0b3JJZGVudGlmaWVyKHsgZWRpdG9yOiBtb2RlbC5lZGl0b3IuaW5wdXQsIGdyb3VwSWQ6IG1vZGVsLmVkaXRvci5ncm91cC5pZCB9KV0sIERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhcHBseURyYWdJbWFnZShldmVudCwgY29udGFpbmVyLCBsYWJlbCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJlYWRjcnVtYnNDb250cm9sT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNob3dGaWxlSWNvbnM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dTeW1ib2xJY29uczogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0RlY29yYXRpb25Db2xvcnM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dQbGFjZWhvbGRlcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZHJhZ0VkaXRvcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgd2lkZ2V0U3R5bGVzPzogSUJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzO1xuXHQvKipcblx0ICogV2hldGhlciB0byBzaG93IGEgZHJvcGRvd24gb24gdGhlIHJpZ2h0LWhhbmQgc2lkZSB0aGF0IGxldHMgdGhlIHVzZXIgc3dpdGNoIGJldHdlZW4gdGhlIGVkaXRvcnNcblx0ICogdGhhdCBjYW4gb3BlbiB0aGUgYWN0aXZlIHJlc291cmNlIChlLmcuIFRleHQgRWRpdG9yIHZzLiBNYXJrZG93biBQcmV2aWV3KS4gT25seSBtYWtlcyBzZW5zZSBmb3Jcblx0ICogdGhlIGRlZGljYXRlZCBicmVhZGNydW1icyBiYXIgYmVsb3cgdGFicywgbm90IHRoZSBpbmxpbmUgc2luZ2xlLXRhYiBicmVhZGNydW1icy5cblx0ICovXG5cdHJlYWRvbmx5IHNob3dFZGl0b3JUeXBlUGlja2VyPzogYm9vbGVhbjtcbn1cblxuY29uc3Qgc2VwYXJhdG9ySWNvbiA9IHJlZ2lzdGVySWNvbignYnJlYWRjcnVtYi1zZXBhcmF0b3InLCBDb2RpY29uLmNoZXZyb25SaWdodCwgbG9jYWxpemUoJ3NlcGFyYXRvckljb24nLCAnSWNvbiBmb3IgdGhlIHNlcGFyYXRvciBpbiB0aGUgYnJlYWRjcnVtYnMuJykpO1xuXG5leHBvcnQgY2xhc3MgQnJlYWRjcnVtYnNDb250cm9sIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSEVJR0hUID0gMjI7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0NST0xMQkFSX1NJWkVTID0ge1xuXHRcdGRlZmF1bHQ6IDMsXG5cdFx0bGFyZ2U6IDhcblx0fTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTQ1JPTExCQVJfVklTSUJJTElUWSA9IHtcblx0XHRhdXRvOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0dmlzaWJsZTogU2Nyb2xsYmFyVmlzaWJpbGl0eS5WaXNpYmxlLFxuXHRcdGhpZGRlbjogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW5cblx0fTtcblxuXHRzdGF0aWMgcmVhZG9ubHkgUGF5bG9hZF9SZXZlYWwgPSB7fTtcblx0c3RhdGljIHJlYWRvbmx5IFBheWxvYWRfUmV2ZWFsQXNpZGUgPSB7fTtcblx0c3RhdGljIHJlYWRvbmx5IFBheWxvYWRfUGljayA9IHt9O1xuXG5cdHN0YXRpYyByZWFkb25seSBDS19CcmVhZGNydW1ic1Bvc3NpYmxlID0gbmV3IFJhd0NvbnRleHRLZXkoJ2JyZWFkY3J1bWJzUG9zc2libGUnLCBmYWxzZSwgbG9jYWxpemUoJ2JyZWFkY3J1bWJzUG9zc2libGUnLCBcIldoZXRoZXIgdGhlIGVkaXRvciBjYW4gc2hvdyBicmVhZGNydW1ic1wiKSk7XG5cdHN0YXRpYyByZWFkb25seSBDS19CcmVhZGNydW1ic1Zpc2libGUgPSBuZXcgUmF3Q29udGV4dEtleSgnYnJlYWRjcnVtYnNWaXNpYmxlJywgZmFsc2UsIGxvY2FsaXplKCdicmVhZGNydW1ic1Zpc2libGUnLCBcIldoZXRoZXIgYnJlYWRjcnVtYnMgYXJlIGN1cnJlbnRseSB2aXNpYmxlXCIpKTtcblx0c3RhdGljIHJlYWRvbmx5IENLX0JyZWFkY3J1bWJzQWN0aXZlID0gbmV3IFJhd0NvbnRleHRLZXkoJ2JyZWFkY3J1bWJzQWN0aXZlJywgZmFsc2UsIGxvY2FsaXplKCdicmVhZGNydW1ic0FjdGl2ZScsIFwiV2hldGhlciBicmVhZGNydW1icyBoYXZlIGZvY3VzXCIpKTtcblx0c3RhdGljIHJlYWRvbmx5IENLX0JyZWFkY3J1bWJzSGFzU3ltYm9scyA9IG5ldyBSYXdDb250ZXh0S2V5KCdicmVhZGNydW1ic0hhc1N5bWJvbHMnLCBmYWxzZSwgbG9jYWxpemUoJ2JyZWFkY3J1bWJzSGFzU3ltYm9scycsIFwiV2hldGhlciBicmVhZGNydW1icyBjb250YWluIHN5bWJvbCBpdGVtc1wiKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2tCcmVhZGNydW1ic1Bvc3NpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2tCcmVhZGNydW1ic1Zpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ja0JyZWFkY3J1bWJzQWN0aXZlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2tCcmVhZGNydW1ic0hhc1N5bWJvbHM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NmVXNlUXVpY2tQaWNrOiBCcmVhZGNydW1ic0NvbmZpZzxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2ZTaG93SWNvbnM6IEJyZWFkY3J1bWJzQ29uZmlnPGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jZlNob3dFZGl0b3JUeXBlOiBCcmVhZGNydW1ic0NvbmZpZzxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2ZUaXRsZVNjcm9sbGJhclNpemluZzogQnJlYWRjcnVtYnNDb25maWc8SUVkaXRvclBhcnRPcHRpb25zWyd0aXRsZVNjcm9sbGJhclNpemluZyddPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2ZUaXRsZVNjcm9sbGJhclZpc2liaWxpdHk6IEJyZWFkY3J1bWJzQ29uZmlnPElFZGl0b3JQYXJ0T3B0aW9uc1sndGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5J10+O1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IEJyZWFkY3J1bWJzV2lkZ2V0O1xuXHRwcml2YXRlIF9lZGl0b3JUeXBlTm9kZTogSFRNTERpdkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2VkaXRvclR5cGVMYWJlbDogSFRNTFNwYW5FbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lZGl0b3JUeXBlSG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RMYXlvdXREaW1lbnNpb246IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclR5cGVEaXNwb3NhYmxlcyA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9icmVhZGNydW1ic0Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbHM6IFJlc291cmNlTGFiZWxzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbCA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxCcmVhZGNydW1ic01vZGVsPigpO1xuXHRwcml2YXRlIF9icmVhZGNydW1ic1BpY2tlclNob3dpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYnJlYWRjcnVtYnNQaWNrZXJJZ25vcmVPbmNlSXRlbTogQnJlYWRjcnVtYnNJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkVmlzaWJpbGl0eUNoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkVmlzaWJpbGl0eUNoYW5nZS5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUJyZWFkY3J1bWJzQ29udHJvbE9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXA6IElFZGl0b3JHcm91cFZpZXcsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElCcmVhZGNydW1ic1NlcnZpY2UgYnJlYWRjcnVtYnNTZXJ2aWNlOiBJQnJlYWRjcnVtYnNTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdicmVhZGNydW1icy1jb250cm9sJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3dpdGgtZWRpdG9yLXR5cGUnLCAhIV9vcHRpb25zLnNob3dFZGl0b3JUeXBlUGlja2VyKTtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgdGhpcy5kb21Ob2RlKTtcblxuXHRcdHRoaXMuX2NmVXNlUXVpY2tQaWNrID0gQnJlYWRjcnVtYnNDb25maWcuVXNlUXVpY2tQaWNrLmJpbmRUbyhfY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX2NmU2hvd0ljb25zID0gQnJlYWRjcnVtYnNDb25maWcuSWNvbnMuYmluZFRvKF9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fY2ZTaG93RWRpdG9yVHlwZSA9IEJyZWFkY3J1bWJzQ29uZmlnLlNob3dFZGl0b3JUeXBlLmJpbmRUbyhfY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJTaXppbmcgPSBCcmVhZGNydW1ic0NvbmZpZy5UaXRsZVNjcm9sbGJhclNpemluZy5iaW5kVG8oX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLl9jZlRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eSA9IEJyZWFkY3J1bWJzQ29uZmlnLlRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eS5iaW5kVG8oX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2xhYmVscyA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpO1xuXG5cdFx0Y29uc3Qgc2l6aW5nID0gdGhpcy5fY2ZUaXRsZVNjcm9sbGJhclNpemluZy5nZXRWYWx1ZSgpID8/ICdkZWZhdWx0Jztcblx0XHRjb25zdCBzdHlsZXMgPSBfb3B0aW9ucy53aWRnZXRTdHlsZXMgPz8gZGVmYXVsdEJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzO1xuXHRcdGNvbnN0IHZpc2liaWxpdHkgPSB0aGlzLl9jZlRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eT8uZ2V0VmFsdWUoKSA/PyAnYXV0byc7XG5cblx0XHR0aGlzLl93aWRnZXQgPSBuZXcgQnJlYWRjcnVtYnNXaWRnZXQoXG5cdFx0XHR0aGlzLmRvbU5vZGUsXG5cdFx0XHRCcmVhZGNydW1ic0NvbnRyb2wuU0NST0xMQkFSX1NJWkVTW3NpemluZ10sXG5cdFx0XHRCcmVhZGNydW1ic0NvbnRyb2wuU0NST0xMQkFSX1ZJU0lCSUxJVFlbdmlzaWJpbGl0eV0sXG5cdFx0XHRzZXBhcmF0b3JJY29uLFxuXHRcdFx0c3R5bGVzXG5cdFx0KTtcblx0XHR0aGlzLl93aWRnZXQub25EaWRTZWxlY3RJdGVtKHRoaXMuX29uU2VsZWN0RXZlbnQsIHRoaXMsIHRoaXMuX2Rpc3Bvc2FibGVzKTtcblx0XHR0aGlzLl93aWRnZXQub25EaWRGb2N1c0l0ZW0odGhpcy5fb25Gb2N1c0V2ZW50LCB0aGlzLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fd2lkZ2V0Lm9uRGlkQ2hhbmdlRm9jdXModGhpcy5fdXBkYXRlQ2tCcmVhZGNydW1ic0FjdGl2ZSwgdGhpcywgdGhpcy5fZGlzcG9zYWJsZXMpO1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuc2hvd0VkaXRvclR5cGVQaWNrZXIpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jZlNob3dFZGl0b3JUeXBlLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3VwZGF0ZUVkaXRvclR5cGVDb250cm9sKCkpKTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChfY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGV2ZW50ID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKGhpZGRlbkVkaXRvclR5cGVzU2V0dGluZ0lkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUVkaXRvclR5cGVDb250cm9sKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzUG9zc2libGUgPSBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNQb3NzaWJsZS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNWaXNpYmxlID0gQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzVmlzaWJsZS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNBY3RpdmUgPSBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNBY3RpdmUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzSGFzU3ltYm9scyA9IEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0hhc1N5bWJvbHMuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX2hvdmVyRGVsZWdhdGUgPSBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChicmVhZGNydW1ic1NlcnZpY2UucmVnaXN0ZXIodGhpcy5fZWRpdG9yR3JvdXAuaWQsIHRoaXMuX3dpZGdldCkpO1xuXHRcdHRoaXMuaGlkZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbW9kZWwuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNQb3NzaWJsZS5yZXNldCgpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNWaXNpYmxlLnJlc2V0KCk7XG5cdFx0dGhpcy5fY2tCcmVhZGNydW1ic0FjdGl2ZS5yZXNldCgpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNIYXNTeW1ib2xzLnJlc2V0KCk7XG5cdFx0dGhpcy5fY2ZVc2VRdWlja1BpY2suZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NmU2hvd0ljb25zLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jZlNob3dFZGl0b3JUeXBlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jZlRpdGxlU2Nyb2xsYmFyU2l6aW5nLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jZlRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fd2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9sYWJlbHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZG9tTm9kZS5yZW1vdmUoKTtcblx0fVxuXG5cdGdldCBtb2RlbCgpOiBCcmVhZGNydW1ic01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwudmFsdWU7XG5cdH1cblxuXHRsYXlvdXQoZGltOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGRpbSkge1xuXHRcdFx0dGhpcy5fbGFzdExheW91dERpbWVuc2lvbiA9IGRpbTtcblx0XHR9XG5cdFx0Ly8gV2hlbiB0aGUgZWRpdG9yIHR5cGUgZHJvcGRvd24gaXMgdmlzaWJsZSBpdCBvY2N1cGllcyBzcGFjZSBvbiB0aGUgcmlnaHQsIHNvIHNocmluayB0aGVcblx0XHQvLyBicmVhZGNydW1icyB3aWRnZXQgYWNjb3JkaW5nbHkgdG8gYXZvaWQgaXQgcmVuZGVyaW5nIGJlaGluZCB0aGUgZHJvcGRvd24uXG5cdFx0aWYgKGRpbSAmJiB0aGlzLl9lZGl0b3JUeXBlTm9kZSkge1xuXHRcdFx0Y29uc3QgZWRpdG9yVHlwZVdpZHRoID0gdGhpcy5fZWRpdG9yVHlwZU5vZGUub2Zmc2V0V2lkdGg7XG5cdFx0XHRkaW0gPSBuZXcgZG9tLkRpbWVuc2lvbihNYXRoLm1heCgwLCBkaW0ud2lkdGggLSBlZGl0b3JUeXBlV2lkdGgpLCBkaW0uaGVpZ2h0KTtcblx0XHR9XG5cdFx0dGhpcy5fd2lkZ2V0LmxheW91dChkaW0pO1xuXHR9XG5cblx0aXNIaWRkZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuY29udGFpbnMoJ2hpZGRlbicpO1xuXHR9XG5cblx0aGlkZSgpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNIaWRkZW4gPSB0aGlzLmlzSGlkZGVuKCk7XG5cblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2tCcmVhZGNydW1ic1Zpc2libGUuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzSGFzU3ltYm9scy5zZXQoZmFsc2UpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCB0cnVlKTtcblx0XHR0aGlzLl9oaWRlRWRpdG9yVHlwZUNvbnRyb2woKTtcblxuXHRcdGlmICghd2FzSGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFZpc2liaWxpdHlDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvdygpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNIaWRkZW4gPSB0aGlzLmlzSGlkZGVuKCk7XG5cblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzVmlzaWJsZS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIGZhbHNlKTtcblxuXHRcdGlmICh3YXNIaWRkZW4pIHtcblx0XHRcdHRoaXMuX29uRGlkVmlzaWJpbGl0eUNoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cmV2ZWFsTGFzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQucmV2ZWFsTGFzdCgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2JyZWFkY3J1bWJzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIGhvbm9yIGRpZmYgZWRpdG9ycyBhbmQgc3VjaFxuXHRcdGNvbnN0IGNhbm9uaWNhbFVyaSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKHRoaXMuX2VkaXRvckdyb3VwLmFjdGl2ZUVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaSh0aGlzLl9lZGl0b3JHcm91cC5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRjb25zdCB1cmkgPSBvcmlnaW5hbFVyaSA/PyBjYW5vbmljYWxVcmk7XG5cdFx0Y29uc3Qgd2FzSGlkZGVuID0gdGhpcy5pc0hpZGRlbigpO1xuXG5cdFx0aWYgKCF1cmkgfHwgIXRoaXMuX2ZpbGVTZXJ2aWNlLmhhc1Byb3ZpZGVyKHVyaSkpIHtcblx0XHRcdC8vIGNsZWFudXAgYW5kIHJldHVybiB3aGVuIHRoZXJlIGlzIG5vIGlucHV0IG9yIHdoZW5cblx0XHRcdC8vIHdlIGNhbm5vdCBoYW5kbGUgdGhpcyBpbnB1dFxuXHRcdFx0dGhpcy5fY2tCcmVhZGNydW1ic1Bvc3NpYmxlLnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzSGFzU3ltYm9scy5zZXQoZmFsc2UpO1xuXHRcdFx0aWYgKCF3YXNIaWRkZW4pIHtcblx0XHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuc2hvdygpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNQb3NzaWJsZS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fdXBkYXRlRWRpdG9yVHlwZUNvbnRyb2woKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJlYWRjcnVtYnNNb2RlbCxcblx0XHRcdHVyaSxcblx0XHRcdHRoaXMuX2VkaXRvckdyb3VwLmFjdGl2ZUVkaXRvclBhbmVcblx0XHQpO1xuXHRcdHRoaXMuX21vZGVsLnZhbHVlID0gbW9kZWw7XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnYmFja3NsYXNoLXBhdGgnLCB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0U2VwYXJhdG9yKHVyaS5zY2hlbWUsIHVyaS5hdXRob3JpdHkpID09PSAnXFxcXCcpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQnJlYWRjcnVtYnMgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgncmVsYXRpdmUtcGF0aCcsIG1vZGVsLmlzUmVsYXRpdmUoKSk7XG5cdFx0XHRjb25zdCBzaG93SWNvbnMgPSB0aGlzLl9jZlNob3dJY29ucy5nZXRWYWx1ZSgpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogSUJyZWFkY3J1bWJzQ29udHJvbE9wdGlvbnMgPSB7XG5cdFx0XHRcdC4uLnRoaXMuX29wdGlvbnMsXG5cdFx0XHRcdHNob3dGaWxlSWNvbnM6IHRoaXMuX29wdGlvbnMuc2hvd0ZpbGVJY29ucyAmJiBzaG93SWNvbnMsXG5cdFx0XHRcdHNob3dTeW1ib2xJY29uczogdGhpcy5fb3B0aW9ucy5zaG93U3ltYm9sSWNvbnMgJiYgc2hvd0ljb25zXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSBtb2RlbC5nZXRFbGVtZW50cygpO1xuXHRcdFx0dGhpcy5fY2tCcmVhZGNydW1ic0hhc1N5bWJvbHMuc2V0KGVsZW1lbnRzLnNvbWUoZWxlbWVudCA9PiAhKGVsZW1lbnQgaW5zdGFuY2VvZiBGaWxlRWxlbWVudCkpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gZWxlbWVudCBpbnN0YW5jZW9mIEZpbGVFbGVtZW50XG5cdFx0XHRcdD8gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUl0ZW0sIG1vZGVsLCBlbGVtZW50LCBvcHRpb25zLCB0aGlzLl9sYWJlbHMsIHRoaXMuX2hvdmVyRGVsZWdhdGUpXG5cdFx0XHRcdDogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3V0bGluZUl0ZW0sIG1vZGVsLCBlbGVtZW50LCBvcHRpb25zKSk7XG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRFbmFibGVkKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldEl0ZW1zKFtuZXcgY2xhc3MgZXh0ZW5kcyBCcmVhZGNydW1ic0l0ZW0ge1xuXHRcdFx0XHRcdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRjb250YWluZXIudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZW1wdHknLCBcIm5vIGVsZW1lbnRzXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlcXVhbHMob3RoZXI6IEJyZWFkY3J1bWJzSXRlbSk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG90aGVyID09PSB0aGlzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0RW5hYmxlZCh0cnVlKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldEl0ZW1zKGl0ZW1zKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnJldmVhbChpdGVtc1tpdGVtcy5sZW5ndGggLSAxXSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IG1vZGVsLm9uRGlkVXBkYXRlKHVwZGF0ZUJyZWFkY3J1bWJzKTtcblx0XHRjb25zdCBjb25maWdMaXN0ZW5lciA9IHRoaXMuX2NmU2hvd0ljb25zLm9uRGlkQ2hhbmdlKHVwZGF0ZUJyZWFkY3J1bWJzKTtcblx0XHR1cGRhdGVCcmVhZGNydW1icygpO1xuXHRcdHRoaXMuX2JyZWFkY3J1bWJzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmFkZChsaXN0ZW5lcik7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX21vZGVsLmNsZWFyKCkpKTtcblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmFkZChjb25maWdMaXN0ZW5lcik7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3dpZGdldC5zZXRJdGVtcyhbXSkpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVNjcm9sbGJhclNpemluZyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHNpemluZyA9IHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJTaXppbmcuZ2V0VmFsdWUoKSA/PyAnZGVmYXVsdCc7XG5cdFx0XHRjb25zdCB2aXNpYmlsaXR5ID0gdGhpcy5fY2ZUaXRsZVNjcm9sbGJhclZpc2liaWxpdHk/LmdldFZhbHVlKCkgPz8gJ2F1dG8nO1xuXG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0SG9yaXpvbnRhbFNjcm9sbGJhclNpemUoQnJlYWRjcnVtYnNDb250cm9sLlNDUk9MTEJBUl9TSVpFU1tzaXppbmddKTtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRIb3Jpem9udGFsU2Nyb2xsYmFyVmlzaWJpbGl0eShCcmVhZGNydW1ic0NvbnRyb2wuU0NST0xMQkFSX1ZJU0lCSUxJVFlbdmlzaWJpbGl0eV0pO1xuXHRcdH07XG5cdFx0dXBkYXRlU2Nyb2xsYmFyU2l6aW5nKCk7XG5cdFx0Y29uc3QgdXBkYXRlU2Nyb2xsYmFyU2l6ZUxpc3RlbmVyID0gdGhpcy5fY2ZUaXRsZVNjcm9sbGJhclNpemluZy5vbkRpZENoYW5nZSh1cGRhdGVTY3JvbGxiYXJTaXppbmcpO1xuXHRcdGNvbnN0IHVwZGF0ZVNjcm9sbGJhclZpc2liaWxpdHlMaXN0ZW5lciA9IHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5Lm9uRGlkQ2hhbmdlKHVwZGF0ZVNjcm9sbGJhclNpemluZyk7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQodXBkYXRlU2Nyb2xsYmFyU2l6ZUxpc3RlbmVyKTtcblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmFkZCh1cGRhdGVTY3JvbGxiYXJWaXNpYmlsaXR5TGlzdGVuZXIpO1xuXG5cdFx0Ly8gY2xvc2UgcGlja2VyIG9uIGhpZGUvdXBkYXRlXG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fYnJlYWRjcnVtYnNQaWNrZXJTaG93aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0Vmlldyh7IHNvdXJjZTogdGhpcyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHdhc0hpZGRlbiAhPT0gdGhpcy5pc0hpZGRlbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRWRpdG9yVHlwZUNvbnRyb2woKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNXaWR0aCA9IHRoaXMuX2VkaXRvclR5cGVOb2RlPy5vZmZzZXRXaWR0aCA/PyAwO1xuXG5cdFx0Y29uc3QgYXZhaWxhYmxlID0gKHRoaXMuX29wdGlvbnMuc2hvd0VkaXRvclR5cGVQaWNrZXIgJiYgdGhpcy5fY2ZTaG93RWRpdG9yVHlwZS5nZXRWYWx1ZSgpKSA/IHRoaXMuX2dldEF2YWlsYWJsZUVkaXRvclR5cGVzKCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFhdmFpbGFibGUpIHtcblx0XHRcdHRoaXMuX2hpZGVFZGl0b3JUeXBlQ29udHJvbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB7IGxhYmVsOiBlZGl0b3JUeXBlTGFiZWwsIGhvdmVyOiBlZGl0b3JUeXBlSG92ZXIgfSA9IHRoaXMuX2NyZWF0ZUVkaXRvclR5cGVDb250cm9sKCk7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gYXZhaWxhYmxlLmVkaXRvcnMuZmluZChlZGl0b3IgPT4gZWRpdG9yLmlkID09PSBhdmFpbGFibGUuY3VycmVudElkKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gY3VycmVudCA/IGVkaXRvclR5cGVEaXNwbGF5TGFiZWwoY3VycmVudCwgYXZhaWxhYmxlLmlzRGlmZkVkaXRvcikgOiBhdmFpbGFibGUuY3VycmVudElkO1xuXHRcdFx0ZWRpdG9yVHlwZUxhYmVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0XHRlZGl0b3JUeXBlSG92ZXIudXBkYXRlKGxvY2FsaXplKCdlZGl0b3JUeXBlLmhvdmVyJywgXCJFZGl0b3I6IHswfVwiLCBsYWJlbCkpO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBkcm9wZG93biB3aWR0aCBtYXkgaGF2ZSBjaGFuZ2VkIChkaWZmZXJlbnQgZWRpdG9yIGxhYmVsIG9yIHZpc2liaWxpdHkgdG9nZ2xlZCkuIFNpbmNlIHRoZVxuXHRcdC8vIGJyZWFkY3J1bWJzIHdpZGdldCB1c2VzIGFuIGV4cGxpY2l0IHBpeGVsIHdpZHRoIHRoYXQgcmVzZXJ2ZXMgcm9vbSBmb3IgdGhlIGRyb3Bkb3duLCByZS1ydW4gdGhlXG5cdFx0Ly8gbGF5b3V0IHNvIHRoZSB3aWRnZXQgc2hyaW5rcy9ncm93cyB0byBtYXRjaCB0aGUgbmV3IGRyb3Bkb3duIHdpZHRoLlxuXHRcdGNvbnN0IGN1cnJlbnRXaWR0aCA9IHRoaXMuX2VkaXRvclR5cGVOb2RlPy5vZmZzZXRXaWR0aCA/PyAwO1xuXHRcdGlmICh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9uICYmIGN1cnJlbnRXaWR0aCAhPT0gcHJldmlvdXNXaWR0aCkge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fbGFzdExheW91dERpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QXZhaWxhYmxlRWRpdG9yVHlwZXMoKTogSUF2YWlsYWJsZUVkaXRvclR5cGVzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZ2V0QXZhaWxhYmxlRWRpdG9yVHlwZXMoXG5cdFx0XHR0aGlzLl9lZGl0b3JHcm91cC5hY3RpdmVFZGl0b3IsXG5cdFx0XHR0aGlzLl9lZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxyZWFkb25seSBzdHJpbmdbXT4oaGlkZGVuRWRpdG9yVHlwZXNTZXR0aW5nSWQpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUVkaXRvclR5cGVDb250cm9sKCk6IHsgbGFiZWw6IEhUTUxTcGFuRWxlbWVudDsgaG92ZXI6IElNYW5hZ2VkSG92ZXIgfSB7XG5cdFx0aWYgKHRoaXMuX2VkaXRvclR5cGVOb2RlICYmIHRoaXMuX2VkaXRvclR5cGVMYWJlbCAmJiB0aGlzLl9lZGl0b3JUeXBlSG92ZXIpIHtcblx0XHRcdHJldHVybiB7IGxhYmVsOiB0aGlzLl9lZGl0b3JUeXBlTGFiZWwsIGhvdmVyOiB0aGlzLl9lZGl0b3JUeXBlSG92ZXIgfTtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0b3JUeXBlTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVOb2RlLmNsYXNzTGlzdC5hZGQoJ2JyZWFkY3J1bWJzLWVkaXRvci10eXBlJyk7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHR0aGlzLl9lZGl0b3JUeXBlTGFiZWwuY2xhc3NMaXN0LmFkZCgnbGFiZWwnKTtcblx0XHR0aGlzLl9lZGl0b3JUeXBlTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9lZGl0b3JUeXBlTGFiZWwpO1xuXHRcdGNvbnN0IGVkaXRvclR5cGVDaGV2cm9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGVkaXRvclR5cGVDaGV2cm9uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGV2cm9uRG93bikpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVOb2RlLmFwcGVuZENoaWxkKGVkaXRvclR5cGVDaGV2cm9uKTtcblx0XHRkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgdGhpcy5fZWRpdG9yVHlwZU5vZGUpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVIb3ZlciA9IHRoaXMuX2VkaXRvclR5cGVEaXNwb3NhYmxlcy5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLl9lZGl0b3JUeXBlTm9kZSwgJycpKTtcblx0XHR0aGlzLl9lZGl0b3JUeXBlRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWRpdG9yVHlwZU5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9zaG93RWRpdG9yVHlwZVBpY2tlcigpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4geyBsYWJlbDogdGhpcy5fZWRpdG9yVHlwZUxhYmVsLCBob3ZlcjogdGhpcy5fZWRpdG9yVHlwZUhvdmVyIH07XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlRWRpdG9yVHlwZUNvbnRyb2woKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZU5vZGU/LnJlbW92ZSgpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVOb2RlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVMYWJlbCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9lZGl0b3JUeXBlSG92ZXIgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93RWRpdG9yVHlwZVBpY2tlcigpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3JUeXBlTm9kZSA9IHRoaXMuX2VkaXRvclR5cGVOb2RlO1xuXHRcdGlmICghZWRpdG9yVHlwZU5vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXZhaWxhYmxlID0gdGhpcy5fZ2V0QXZhaWxhYmxlRWRpdG9yVHlwZXMoKTtcblx0XHRpZiAoIWF2YWlsYWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhY3Rpb25zID0gY3JlYXRlRWRpdG9yVHlwZUFjdGlvbnMoYXZhaWxhYmxlLCB0aGlzLl9lZGl0b3JSZXNvbHZlclNlcnZpY2UsIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLCB0aGlzLl9lZGl0b3JTZXJ2aWNlKTtcblx0XHR0aGlzLl9jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZWRpdG9yVHlwZU5vZGUsXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkZvY3VzRXZlbnQoZXZlbnQ6IElCcmVhZGNydW1ic0l0ZW1FdmVudCk6IHZvaWQge1xuXHRcdGlmIChldmVudC5pdGVtICYmIHRoaXMuX2JyZWFkY3J1bWJzUGlja2VyU2hvd2luZykge1xuXHRcdFx0dGhpcy5fYnJlYWRjcnVtYnNQaWNrZXJJZ25vcmVPbmNlSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRTZWxlY3Rpb24oZXZlbnQuaXRlbSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25TZWxlY3RFdmVudChldmVudDogSUJyZWFkY3J1bWJzSXRlbUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCFldmVudC5pdGVtKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50Lml0ZW0gPT09IHRoaXMuX2JyZWFkY3J1bWJzUGlja2VySWdub3JlT25jZUl0ZW0pIHtcblx0XHRcdHRoaXMuX2JyZWFkY3J1bWJzUGlja2VySWdub3JlT25jZUl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0Rm9jdXNlZCh1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgZWxlbWVudCB9ID0gZXZlbnQuaXRlbSBhcyBGaWxlSXRlbSB8IE91dGxpbmVJdGVtO1xuXHRcdHRoaXMuX2VkaXRvckdyb3VwLmZvY3VzKCk7XG5cblx0XHRjb25zdCBncm91cCA9IHRoaXMuX2dldEVkaXRvckdyb3VwKGV2ZW50LnBheWxvYWQpO1xuXHRcdGlmIChncm91cCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyByZXZlYWwgdGhlIGl0ZW1cblx0XHRcdHRoaXMuX3dpZGdldC5zZXRGb2N1c2VkKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0U2VsZWN0aW9uKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLl9yZXZlYWxJbkVkaXRvcihldmVudCwgZWxlbWVudCwgZ3JvdXApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jZlVzZVF1aWNrUGljay5nZXRWYWx1ZSgpKSB7XG5cdFx0XHQvLyB1c2luZyBxdWljayBwaWNrXG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0Rm9jdXNlZCh1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdyhlbGVtZW50IGluc3RhbmNlb2YgT3V0bGluZUVsZW1lbnQyID8gJ0AnIDogJycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIHNob3cgcGlja2VyXG5cdFx0bGV0IHBpY2tlcjogQnJlYWRjcnVtYnNGaWxlUGlja2VyIHwgQnJlYWRjcnVtYnNPdXRsaW5lUGlja2VyO1xuXHRcdGxldCBwaWNrZXJBbmNob3I6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfTtcblxuXHRcdGludGVyZmFjZSBJSGlkZURhdGEgeyBkaWRQaWNrPzogYm9vbGVhbjsgc291cmNlPzogQnJlYWRjcnVtYnNDb250cm9sIH1cblxuXHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5zaG93Q29udGV4dFZpZXcoe1xuXHRcdFx0cmVuZGVyOiAocGFyZW50OiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQuaXRlbSBpbnN0YW5jZW9mIEZpbGVJdGVtKSB7XG5cdFx0XHRcdFx0cGlja2VyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJlYWRjcnVtYnNGaWxlUGlja2VyLCBwYXJlbnQsIGV2ZW50Lml0ZW0ubW9kZWwucmVzb3VyY2UpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50Lml0ZW0gaW5zdGFuY2VvZiBPdXRsaW5lSXRlbSkge1xuXHRcdFx0XHRcdHBpY2tlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyZWFkY3J1bWJzT3V0bGluZVBpY2tlciwgcGFyZW50LCBldmVudC5pdGVtLm1vZGVsLnJlc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlbGVjdExpc3RlbmVyID0gcGlja2VyLm9uV2lsbFBpY2tFbGVtZW50KCgpID0+IHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoeyBzb3VyY2U6IHRoaXMsIGRpZFBpY2s6IHRydWUgfSkpO1xuXHRcdFx0XHRjb25zdCB6b29tTGlzdGVuZXIgPSBQaXhlbFJhdGlvLmdldEluc3RhbmNlKGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKSkub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0Vmlldyh7IHNvdXJjZTogdGhpcyB9KSk7XG5cblx0XHRcdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gZG9tLnRyYWNrRm9jdXMocGFyZW50KTtcblx0XHRcdFx0Y29uc3QgYmx1ckxpc3RlbmVyID0gZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fYnJlYWRjcnVtYnNQaWNrZXJJZ25vcmVPbmNlSXRlbSA9IHRoaXMuX3dpZGdldC5pc0RPTUZvY3VzZWQoKSA/IGV2ZW50Lml0ZW0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0Vmlldyh7IHNvdXJjZTogdGhpcyB9KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5fYnJlYWRjcnVtYnNQaWNrZXJTaG93aW5nID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQ2tCcmVhZGNydW1ic0FjdGl2ZSgpO1xuXG5cdFx0XHRcdHJldHVybiBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHRcdFx0cGlja2VyLFxuXHRcdFx0XHRcdHNlbGVjdExpc3RlbmVyLFxuXHRcdFx0XHRcdHpvb21MaXN0ZW5lcixcblx0XHRcdFx0XHRmb2N1c1RyYWNrZXIsXG5cdFx0XHRcdFx0Ymx1ckxpc3RlbmVyXG5cdFx0XHRcdCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB7XG5cdFx0XHRcdGlmICghcGlja2VyQW5jaG9yKSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0XHRcdGNvbnN0IG1heElubmVyV2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCAtIDggLyphIGxpdHRsZSBsZXNzIHRoZSBmdWxsIHdpZGdldCovO1xuXHRcdFx0XHRcdGxldCBtYXhIZWlnaHQgPSBNYXRoLm1pbih3aW5kb3cuaW5uZXJIZWlnaHQgKiAwLjcsIDMwMCk7XG5cblx0XHRcdFx0XHRjb25zdCBwaWNrZXJXaWR0aCA9IE1hdGgubWluKG1heElubmVyV2lkdGgsIE1hdGgubWF4KDI0MCwgbWF4SW5uZXJXaWR0aCAvIDQuMTcpKTtcblx0XHRcdFx0XHRjb25zdCBwaWNrZXJBcnJvd1NpemUgPSA4O1xuXHRcdFx0XHRcdGxldCBwaWNrZXJBcnJvd09mZnNldDogbnVtYmVyO1xuXG5cdFx0XHRcdFx0Y29uc3QgZGF0YSA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKGV2ZW50Lm5vZGUpO1xuXHRcdFx0XHRcdGNvbnN0IHkgPSBkYXRhLnRvcCArIGRhdGEuaGVpZ2h0ICsgcGlja2VyQXJyb3dTaXplO1xuXHRcdFx0XHRcdGlmICh5ICsgbWF4SGVpZ2h0ID49IHdpbmRvdy5pbm5lckhlaWdodCkge1xuXHRcdFx0XHRcdFx0bWF4SGVpZ2h0ID0gd2luZG93LmlubmVySGVpZ2h0IC0geSAtIDMwIC8qIHJvb20gZm9yIHNoYWRvdyBhbmQgc3RhdHVzIGJhciovO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgeCA9IGRhdGEubGVmdDtcblx0XHRcdFx0XHRpZiAoeCArIHBpY2tlcldpZHRoID49IG1heElubmVyV2lkdGgpIHtcblx0XHRcdFx0XHRcdHggPSBtYXhJbm5lcldpZHRoIC0gcGlja2VyV2lkdGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChldmVudC5wYXlsb2FkIGluc3RhbmNlb2YgU3RhbmRhcmRNb3VzZUV2ZW50KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtYXhQaWNrZXJBcnJvd09mZnNldCA9IHBpY2tlcldpZHRoIC0gMiAqIHBpY2tlckFycm93U2l6ZTtcblx0XHRcdFx0XHRcdHBpY2tlckFycm93T2Zmc2V0ID0gZXZlbnQucGF5bG9hZC5wb3N4IC0geDtcblx0XHRcdFx0XHRcdGlmIChwaWNrZXJBcnJvd09mZnNldCA+IG1heFBpY2tlckFycm93T2Zmc2V0KSB7XG5cdFx0XHRcdFx0XHRcdHggPSBNYXRoLm1pbihtYXhJbm5lcldpZHRoIC0gcGlja2VyV2lkdGgsIHggKyBwaWNrZXJBcnJvd09mZnNldCAtIG1heFBpY2tlckFycm93T2Zmc2V0KTtcblx0XHRcdFx0XHRcdFx0cGlja2VyQXJyb3dPZmZzZXQgPSBtYXhQaWNrZXJBcnJvd09mZnNldDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cGlja2VyQXJyb3dPZmZzZXQgPSAoZGF0YS5sZWZ0ICsgKGRhdGEud2lkdGggKiAwLjMpKSAtIHg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHBpY2tlci5zaG93KGVsZW1lbnQsIG1heEhlaWdodCwgcGlja2VyV2lkdGgsIHBpY2tlckFycm93U2l6ZSwgTWF0aC5tYXgoMCwgcGlja2VyQXJyb3dPZmZzZXQpKTtcblx0XHRcdFx0XHRwaWNrZXJBbmNob3IgPSB7IHgsIHkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcGlja2VyQW5jaG9yO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKGRhdGE/OiBJSGlkZURhdGEpID0+IHtcblx0XHRcdFx0aWYgKCFkYXRhPy5kaWRQaWNrKSB7XG5cdFx0XHRcdFx0cGlja2VyLnJlc3RvcmVWaWV3U3RhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9icmVhZGNydW1ic1BpY2tlclNob3dpbmcgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQ2tCcmVhZGNydW1ic0FjdGl2ZSgpO1xuXHRcdFx0XHRpZiAoZGF0YT8uc291cmNlID09PSB0aGlzKSB7XG5cdFx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldEZvY3VzZWQodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0U2VsZWN0aW9uKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGlja2VyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUNrQnJlYWRjcnVtYnNBY3RpdmUoKTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl93aWRnZXQuaXNET01Gb2N1c2VkKCkgfHwgdGhpcy5fYnJlYWRjcnVtYnNQaWNrZXJTaG93aW5nO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNBY3RpdmUuc2V0KHZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JldmVhbEluRWRpdG9yKGV2ZW50OiBJQnJlYWRjcnVtYnNJdGVtRXZlbnQsIGVsZW1lbnQ6IEZpbGVFbGVtZW50IHwgT3V0bGluZUVsZW1lbnQyLCBncm91cDogU0lERV9HUk9VUF9UWVBFIHwgQUNUSVZFX0dST1VQX1RZUEUgfCB1bmRlZmluZWQsIHBpbm5lZDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEZpbGVFbGVtZW50KSB7XG5cdFx0XHRpZiAoZWxlbWVudC5raW5kID09PSBGaWxlS2luZC5GSUxFKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBlbGVtZW50LnVyaSwgb3B0aW9uczogeyBwaW5uZWQgfSB9LCBncm91cCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBzaG93IG5leHQgcGlja2VyXG5cdFx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5fd2lkZ2V0LmdldEl0ZW1zKCk7XG5cdFx0XHRcdGNvbnN0IGlkeCA9IGl0ZW1zLmluZGV4T2YoZXZlbnQuaXRlbSk7XG5cdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRGb2N1c2VkKGl0ZW1zW2lkeCArIDFdKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldFNlbGVjdGlvbihpdGVtc1tpZHggKyAxXSwgQnJlYWRjcnVtYnNDb250cm9sLlBheWxvYWRfUGljayk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVsZW1lbnQub3V0bGluZS5yZXZlYWwoZWxlbWVudCwgeyBwaW5uZWQgfSwgZ3JvdXAgPT09IFNJREVfR1JPVVAsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JHcm91cChkYXRhOiB1bmtub3duKTogU0lERV9HUk9VUF9UWVBFIHwgQUNUSVZFX0dST1VQX1RZUEUgfCB1bmRlZmluZWQge1xuXHRcdGlmIChkYXRhID09PSBCcmVhZGNydW1ic0NvbnRyb2wuUGF5bG9hZF9SZXZlYWxBc2lkZSkge1xuXHRcdFx0cmV0dXJuIFNJREVfR1JPVVA7XG5cdFx0fSBlbHNlIGlmIChkYXRhID09PSBCcmVhZGNydW1ic0NvbnRyb2wuUGF5bG9hZF9SZXZlYWwpIHtcblx0XHRcdHJldHVybiBBQ1RJVkVfR1JPVVA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBCcmVhZGNydW1ic0NvbnRyb2xGYWN0b3J5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJvbERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgX2NvbnRyb2w6IEJyZWFkY3J1bWJzQ29udHJvbCB8IHVuZGVmaW5lZDtcblx0Z2V0IGNvbnRyb2woKSB7IHJldHVybiB0aGlzLl9jb250cm9sOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmFibGVtZW50Q2hhbmdlID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRFbmFibGVtZW50Q2hhbmdlKCkgeyByZXR1cm4gdGhpcy5fb25EaWRFbmFibGVtZW50Q2hhbmdlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRWaXNpYmlsaXR5Q2hhbmdlKCkgeyByZXR1cm4gdGhpcy5fb25EaWRWaXNpYmlsaXR5Q2hhbmdlLmV2ZW50OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JHcm91cDogSUVkaXRvckdyb3VwVmlldyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQnJlYWRjcnVtYnNDb250cm9sT3B0aW9ucyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKEJyZWFkY3J1bWJzQ29uZmlnLklzRW5hYmxlZC5iaW5kVG8oY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCBpc0VuYWJsZWQgPSAoKSA9PiBjb25maWcuZ2V0VmFsdWUoKSAmJiB0aGlzLl9lZGl0b3JHcm91cC5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnNob3dCcmVhZGNydW1icyAhPT0gZmFsc2U7XG5cdFx0Y29uc3QgdXBkYXRlQ29udHJvbCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGVuYWJsZWQgPSBpc0VuYWJsZWQoKTtcblx0XHRcdGlmICghZW5hYmxlZCAmJiB0aGlzLl9jb250cm9sKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2xEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl9jb250cm9sID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEVuYWJsZW1lbnRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fSBlbHNlIGlmIChlbmFibGVkICYmICF0aGlzLl9jb250cm9sKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2wgPSB0aGlzLmNyZWF0ZUNvbnRyb2woKTtcblx0XHRcdFx0dGhpcy5fY29udHJvbC51cGRhdGUoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRFbmFibGVtZW50Q2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGNvbmZpZy5vbkRpZENoYW5nZSh1cGRhdGVDb250cm9sKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvckdyb3VwLmdyb3Vwc1ZpZXcub25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyhlID0+IHtcblx0XHRcdGlmIChlLm9sZFBhcnRPcHRpb25zLnNob3dCcmVhZGNydW1icyAhPT0gZS5uZXdQYXJ0T3B0aW9ucy5zaG93QnJlYWRjcnVtYnMpIHtcblx0XHRcdFx0dXBkYXRlQ29udHJvbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChpc0VuYWJsZWQoKSkge1xuXHRcdFx0dGhpcy5fY29udHJvbCA9IHRoaXMuY3JlYXRlQ29udHJvbCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5vbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnMoZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY29udHJvbD8ubW9kZWwgJiYgdGhpcy5fY29udHJvbC5tb2RlbC5yZXNvdXJjZS5zY2hlbWUgIT09IGUuc2NoZW1lKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBpZiB0aGUgc2NoZW1lIG9mIHRoZSBicmVhZGNydW1icyByZXNvdXJjZSBpcyBub3QgYWZmZWN0ZWRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2NvbnRyb2w/LnVwZGF0ZSgpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkRW5hYmxlbWVudENoYW5nZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb250cm9sKCk6IEJyZWFkY3J1bWJzQ29udHJvbCB7XG5cdFx0Y29uc3QgY29udHJvbCA9IHRoaXMuX2NvbnRyb2xEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJlYWRjcnVtYnNDb250cm9sLCB0aGlzLl9jb250YWluZXIsIHRoaXMuX29wdGlvbnMsIHRoaXMuX2VkaXRvckdyb3VwKSk7XG5cdFx0dGhpcy5fY29udHJvbERpc3Bvc2FibGVzLmFkZChjb250cm9sLm9uRGlkVmlzaWJpbGl0eUNoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZFZpc2liaWxpdHlDaGFuZ2UuZmlyZSgpKSk7XG5cblx0XHRyZXR1cm4gY29udHJvbDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NvbnRyb2xEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8jcmVnaW9uIGNvbW1hbmRzXG5cbi8vIHRvZ2dsZSBjb21tYW5kXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlQnJlYWRjcnVtYiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYnJlYWRjcnVtYnMudG9nZ2xlJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NtZC50b2dnbGUnLCBcIlRvZ2dsZSBCcmVhZGNydW1ic1wiKSxcblx0XHRcdHNob3J0VGl0bGU6IGxvY2FsaXplMignY21kLnRvZ2dsZS5zaG9ydCcsIFwiQnJlYWRjcnVtYnNcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmJyZWFkY3J1bWJzLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjbWQudG9nZ2xlMicsIFwiQnJlYWRjcnVtYnNcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlCcmVhZGNydW1iczInLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZCcmVhZGNydW1ic1wiKVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0eyBpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlIH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5NZW51YmFyQXBwZWFyYW5jZU1lbnUsIGdyb3VwOiAnNF9lZGl0b3InLCBvcmRlcjogMiB9LFxuXHRcdFx0XHR7IGlkOiBNZW51SWQuTm90ZWJvb2tUb29sYmFyLCBncm91cDogJ25vdGVib29rTGF5b3V0Jywgb3JkZXI6IDIgfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLlN0aWNreVNjcm9sbENvbnRleHQgfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLk5vdGVib29rU3RpY2t5U2Nyb2xsQ29udGV4dCwgZ3JvdXA6ICdub3RlYm9va1ZpZXcnLCBvcmRlcjogMiB9LFxuXHRcdFx0XHR7IGlkOiBNZW51SWQuTm90ZWJvb2tUb29sYmFyQ29udGV4dCwgZ3JvdXA6ICdub3RlYm9va1ZpZXcnLCBvcmRlcjogMiB9XG5cdFx0XHRdXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWcgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBicmVhZENydW1ic0NvbmZpZyA9IEJyZWFkY3J1bWJzQ29uZmlnLklzRW5hYmxlZC5iaW5kVG8oY29uZmlnKTtcblx0XHRjb25zdCB2YWx1ZSA9IGJyZWFkQ3J1bWJzQ29uZmlnLmdldFZhbHVlKCk7XG5cdFx0YnJlYWRDcnVtYnNDb25maWcudXBkYXRlVmFsdWUoIXZhbHVlKTtcblx0XHRicmVhZENydW1ic0NvbmZpZy5kaXNwb3NlKCk7XG5cdH1cblxufSk7XG5cbi8vIGZvY3VzL2ZvY3VzLWFuZC1zZWxlY3RcbmZ1bmN0aW9uIGZvY3VzQW5kU2VsZWN0SGFuZGxlcihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2VsZWN0OiBib29sZWFuKTogdm9pZCB7XG5cdC8vIGZpbmQgd2lkZ2V0IGFuZCBmb2N1cy9zZWxlY3Rcblx0Y29uc3QgZ3JvdXBzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0Y29uc3QgYnJlYWRjcnVtYnMgPSBhY2Nlc3Nvci5nZXQoSUJyZWFkY3J1bWJzU2VydmljZSk7XG5cdGNvbnN0IHdpZGdldCA9IGJyZWFkY3J1bWJzLmdldFdpZGdldChncm91cHMuYWN0aXZlR3JvdXAuaWQpO1xuXHRpZiAod2lkZ2V0KSB7XG5cdFx0Y29uc3QgaXRlbSA9IHdpZGdldC5nZXRJdGVtcygpLmF0KC0xKTtcblx0XHR3aWRnZXQuc2V0Rm9jdXNlZChpdGVtKTtcblx0XHRpZiAoc2VsZWN0KSB7XG5cdFx0XHR3aWRnZXQuc2V0U2VsZWN0aW9uKGl0ZW0sIEJyZWFkY3J1bWJzQ29udHJvbC5QYXlsb2FkX1BpY2spO1xuXHRcdH1cblx0fVxufVxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEZvY3VzQW5kU2VsZWN0QnJlYWRjcnVtYnMgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdicmVhZGNydW1icy5mb2N1c0FuZFNlbGVjdCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbWQuZm9jdXNBbmRTZWxlY3QnLCBcIkZvY3VzIGFuZCBTZWxlY3QgQnJlYWRjcnVtYnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuUGVyaW9kLFxuXHRcdFx0XHR3aGVuOiBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNQb3NzaWJsZSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Zm9jdXNBbmRTZWxlY3RIYW5kbGVyKGFjY2Vzc29yLCB0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c0JyZWFkY3J1bWJzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYnJlYWRjcnVtYnMuZm9jdXMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY21kLmZvY3VzJywgXCJGb2N1cyBCcmVhZGNydW1ic1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzVmlzaWJsZSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5TZW1pY29sb24sXG5cdFx0XHRcdHdoZW46IEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Bvc3NpYmxlLFxuXHRcdFx0fSxcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRmb2N1c0FuZFNlbGVjdEhhbmRsZXIoYWNjZXNzb3IsIGZhbHNlKTtcblx0fVxufSk7XG5cbi8vIHRoaXMgY29tbWFuZHMgaXMgb25seSBlbmFibGVkIHdoZW4gYnJlYWRjcnVtYnMgYXJlXG4vLyBkaXNhYmxlZCB3aGljaCBpdCB0aGVuIGVuYWJsZXMgYW5kIGZvY3VzZXNcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2JyZWFkY3J1bWJzLnRvZ2dsZVRvT24nLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlBlcmlvZCxcblx0d2hlbjogQ29udGV4dEtleUV4cHIubm90KCdjb25maWcuYnJlYWRjcnVtYnMuZW5hYmxlZCcpLFxuXHRoYW5kbGVyOiBhc3luYyBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudCA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdC8vIGNoZWNrIGlmIGVuYWJsZWQgYW5kIGlmZiBub3QgZW5hYmxlXG5cdFx0Y29uc3QgaXNFbmFibGVkID0gQnJlYWRjcnVtYnNDb25maWcuSXNFbmFibGVkLmJpbmRUbyhjb25maWcpO1xuXHRcdGlmICghaXNFbmFibGVkLmdldFZhbHVlKCkpIHtcblx0XHRcdGF3YWl0IGlzRW5hYmxlZC51cGRhdGVWYWx1ZSh0cnVlKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTApOyAvLyBoYWNreSAtIHRoZSB3aWRnZXQgbWlnaHQgbm90IGJlIHJlYWR5IHlldC4uLlxuXHRcdH1cblx0XHRpc0VuYWJsZWQuZGlzcG9zZSgpO1xuXHRcdHJldHVybiBpbnN0YW50Lmludm9rZUZ1bmN0aW9uKGZvY3VzQW5kU2VsZWN0SGFuZGxlciwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG4vLyBuYXZpZ2F0aW9uXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy5mb2N1c05leHQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q29kZS5SaWdodEFycm93LFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUmlnaHRBcnJvd10sXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQWx0IHwgS2V5Q29kZS5SaWdodEFycm93XSxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0FjdGl2ZSksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHRjb25zdCBncm91cHMgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGJyZWFkY3J1bWJzID0gYWNjZXNzb3IuZ2V0KElCcmVhZGNydW1ic1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGJyZWFkY3J1bWJzLmdldFdpZGdldChncm91cHMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZGdldC5mb2N1c05leHQoKTtcblx0fVxufSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy5mb2N1c1ByZXZpb3VzJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTGVmdEFycm93XSxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93XSxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0FjdGl2ZSksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHRjb25zdCBncm91cHMgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGJyZWFkY3J1bWJzID0gYWNjZXNzb3IuZ2V0KElCcmVhZGNydW1ic1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGJyZWFkY3J1bWJzLmdldFdpZGdldChncm91cHMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZGdldC5mb2N1c1ByZXYoKTtcblx0fVxufSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy5mb2N1c05leHRXaXRoUGlja2VyJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0FjdGl2ZSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHRjb25zdCBncm91cHMgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGJyZWFkY3J1bWJzID0gYWNjZXNzb3IuZ2V0KElCcmVhZGNydW1ic1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGJyZWFkY3J1bWJzLmdldFdpZGdldChncm91cHMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZGdldC5mb2N1c05leHQoKTtcblx0fVxufSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy5mb2N1c1ByZXZpb3VzV2l0aFBpY2tlcicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuTGVmdEFycm93LFxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzVmlzaWJsZSwgQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzQWN0aXZlLCBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5KSxcblx0aGFuZGxlcihhY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGdyb3VwcyA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgYnJlYWRjcnVtYnMgPSBhY2Nlc3Nvci5nZXQoSUJyZWFkY3J1bWJzU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYnJlYWRjcnVtYnMuZ2V0V2lkZ2V0KGdyb3Vwcy5hY3RpdmVHcm91cC5pZCk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2lkZ2V0LmZvY3VzUHJldigpO1xuXHR9XG59KTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2JyZWFkY3J1bWJzLnNlbGVjdEZvY3VzZWQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0c2Vjb25kYXJ5OiBbS2V5Q29kZS5Eb3duQXJyb3ddLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzVmlzaWJsZSwgQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzQWN0aXZlKSxcblx0aGFuZGxlcihhY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGdyb3VwcyA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgYnJlYWRjcnVtYnMgPSBhY2Nlc3Nvci5nZXQoSUJyZWFkY3J1bWJzU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYnJlYWRjcnVtYnMuZ2V0V2lkZ2V0KGdyb3Vwcy5hY3RpdmVHcm91cC5pZCk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2lkZ2V0LnNldFNlbGVjdGlvbih3aWRnZXQuZ2V0Rm9jdXNlZCgpLCBCcmVhZGNydW1ic0NvbnRyb2wuUGF5bG9hZF9QaWNrKTtcblx0fVxufSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy5yZXZlYWxGb2N1c2VkJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNvZGUuU3BhY2UsXG5cdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcl0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNWaXNpYmxlLCBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNBY3RpdmUpLFxuXHRoYW5kbGVyKGFjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBicmVhZGNydW1icyA9IGFjY2Vzc29yLmdldChJQnJlYWRjcnVtYnNTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBicmVhZGNydW1icy5nZXRXaWRnZXQoZ3JvdXBzLmFjdGl2ZUdyb3VwLmlkKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR3aWRnZXQuc2V0U2VsZWN0aW9uKHdpZGdldC5nZXRGb2N1c2VkKCksIEJyZWFkY3J1bWJzQ29udHJvbC5QYXlsb2FkX1JldmVhbCk7XG5cdH1cbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnYnJlYWRjcnVtYnMuc2VsZWN0RWRpdG9yJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyAxLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0FjdGl2ZSksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHRjb25zdCBncm91cHMgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGJyZWFkY3J1bWJzID0gYWNjZXNzb3IuZ2V0KElCcmVhZGNydW1ic1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGJyZWFkY3J1bWJzLmdldFdpZGdldChncm91cHMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZGdldC5zZXRGb2N1c2VkKHVuZGVmaW5lZCk7XG5cdFx0d2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdGdyb3Vwcy5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3JQYW5lPy5mb2N1cygpO1xuXHR9XG59KTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2JyZWFkY3J1bWJzLnJldmVhbEZvY3VzZWRGcm9tVHJlZUFzaWRlJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlcixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0FjdGl2ZSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHRjb25zdCBlZGl0b3JzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBsaXN0cyA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdHJlZSA9IGxpc3RzLmxhc3RGb2N1c2VkTGlzdDtcblx0XHRpZiAoISh0cmVlIGluc3RhbmNlb2YgV29ya2JlbmNoRGF0YVRyZWUpICYmICEodHJlZSBpbnN0YW5jZW9mIFdvcmtiZW5jaEFzeW5jRGF0YVRyZWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IDxJRmlsZVN0YXQgfCB1bmtub3duPnRyZWUuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdGlmIChVUkkuaXNVcmkoKDxJRmlsZVN0YXQ+ZWxlbWVudCk/LnJlc291cmNlKSkge1xuXHRcdFx0Ly8gSUZpbGVTdGF0OiBvcGVuIGZpbGUgaW4gZWRpdG9yXG5cdFx0XHRyZXR1cm4gZWRpdG9ycy5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6ICg8SUZpbGVTdGF0PmVsZW1lbnQpLnJlc291cmNlLFxuXHRcdFx0XHRvcHRpb25zOiB7IHBpbm5lZDogdHJ1ZSB9XG5cdFx0XHR9LCBTSURFX0dST1VQKTtcblx0XHR9XG5cblx0XHQvLyBJT3V0bGluZTogY2hlY2sgaWYgdGhpcyB0aGUgb3V0bGluZSBhbmQgaWZmIHNvIHJldmVhbCBlbGVtZW50XG5cdFx0Y29uc3QgaW5wdXQgPSB0cmVlLmdldElucHV0KCk7XG5cdFx0aWYgKGlucHV0ICYmIHR5cGVvZiAoPElPdXRsaW5lPHVua25vd24+PmlucHV0KS5vdXRsaW5lS2luZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiAoPElPdXRsaW5lPHVua25vd24+PmlucHV0KS5yZXZlYWwoZWxlbWVudCwge1xuXHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdHByZXNlcnZlRm9jdXM6IGZhbHNlXG5cdFx0XHR9LCB0cnVlLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG59KTtcbi8vI2VuZHJlZ2lvblxuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29weUJyZWFkY3J1bWJQYXRoIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYnJlYWRjcnVtYnMuY29weVBhdGgnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY21kLmNvcHlQYXRoJywgXCJDb3B5IEJyZWFkY3J1bWJzIFBhdGhcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzVmlzaWJsZSwgQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzSGFzU3ltYm9scyksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51SWQuRWRpdG9yVGl0bGVDb250ZXh0LFxuXHRcdFx0XHRncm91cDogJzFfY3V0Y29weXBhc3RlJyxcblx0XHRcdFx0b3JkZXI6IDEwMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Bvc3NpYmxlLCBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNIYXNTeW1ib2xzKVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBncm91cHMgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgb3V0bGluZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU91dGxpbmVTZXJ2aWNlKTtcblxuXHRcdGlmICghZ3JvdXBzLmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvclBhbmUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdXRsaW5lID0gYXdhaXQgb3V0bGluZVNlcnZpY2UuY3JlYXRlT3V0bGluZShncm91cHMuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZSwgT3V0bGluZVRhcmdldC5CcmVhZGNydW1icywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFvdXRsaW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudHMgPSBvdXRsaW5lLmNvbmZpZy5icmVhZGNydW1ic0RhdGFTb3VyY2UuZ2V0QnJlYWRjcnVtYkVsZW1lbnRzKCk7XG5cdFx0Y29uc3QgbGFiZWxzID0gZWxlbWVudHMubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCkuZmlsdGVyKEJvb2xlYW4pO1xuXG5cdFx0b3V0bGluZS5kaXNwb3NlKCk7XG5cblx0XHRpZiAobGFiZWxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdldCBzZXBhcmF0b3Igd2l0aCBsYW5ndWFnZSBvdmVycmlkZSBzdXBwb3J0XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBncm91cHMuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZS5pbnB1dC5yZXNvdXJjZTtcblx0XHRjb25zdCBjb25maWcgPSBCcmVhZGNydW1ic0NvbmZpZy5TeW1ib2xQYXRoU2VwYXJhdG9yLmJpbmRUbyhjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgc2VwYXJhdG9yID0gY29uZmlnLmdldFZhbHVlKHJlc291cmNlICYmIHsgcmVzb3VyY2UgfSkgPz8gJy4nO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBwYXRoID0gbGFiZWxzLmpvaW4oc2VwYXJhdG9yKTtcblx0XHRhd2FpdCBjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChwYXRoKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQix5QkFBMEU7QUFDcEcsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxvQkFBb0IsaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDbEcsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBRXBCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyxxQkFBcUIsMkJBQTJCO0FBQ3pELFNBQVMsdUJBQXVCLDhCQUE4QjtBQUM5RCxTQUFTLFVBQVUsb0JBQStCO0FBQ2xELFNBQVMsNkJBQStDO0FBRXhELFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGNBQWMsd0JBQXdCLG1CQUFtQixvQ0FBb0M7QUFDdEcsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxvQkFBb0I7QUFDN0IsU0FB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
