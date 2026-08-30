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
import "./media/browser.css";
import { localize, localize2 } from "../../../../nls.js";
import { $ } from "../../../../base/browser/dom.js";
import { ContextKeyExpr, RawContextKey, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { BrowserEditorInput } from "../common/browserEditorInput.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { getZoomFactor, onDidChangeZoomLevel } from "../../../../base/browser/browser.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ILayoutService } from "../../../../platform/layout/browser/layoutService.js";
const CONTEXT_BROWSER_FOCUSED = new RawContextKey("browserFocused", true, localize("browser.editorFocused", "Whether the browser editor is focused"));
const CONTEXT_BROWSER_HAS_URL = new RawContextKey("browserHasUrl", false, localize("browser.hasUrl", "Whether the browser has a URL loaded"));
const CONTEXT_BROWSER_HAS_ERROR = new RawContextKey("browserHasError", false, localize("browser.hasError", "Whether the browser has a load error"));
const BROWSER_EDITOR_ACTIVE = ContextKeyExpr.equals("activeEditor", BrowserEditorInput.EDITOR_ID);
const BrowserActionCategory = localize2("browserCategory", "Browser");
var BrowserActionGroup = /* @__PURE__ */ ((BrowserActionGroup2) => {
  BrowserActionGroup2["Tabs"] = "1_tabs";
  BrowserActionGroup2["Zoom"] = "2_zoom";
  BrowserActionGroup2["Tools"] = "3_tools";
  BrowserActionGroup2["Data"] = "4_data";
  BrowserActionGroup2["Settings"] = "5_settings";
  return BrowserActionGroup2;
})(BrowserActionGroup || {});
const originalHtmlElementFocus = HTMLElement.prototype.focus;
class BrowserEditorContribution extends Disposable {
  constructor(editor) {
    super();
    this.editor = editor;
    this._modelStore = this._register(new DisposableStore());
    /**
     * Fires when {@link getActionViewItem} may return a different result.
     */
    this.onDidChangeActionViewItems = Event.None;
    this._register(editor.onDidChangeModel(({ model, isNew }) => {
      this._modelStore.clear();
      if (model) {
        this.onModelAttached(model, this._modelStore, isNew);
      } else {
        this.onModelDetached();
      }
    }));
  }
  /**
   * Called whenever the editor model changes to update state.
   */
  onModelAttached(_model, _store, _isNew) {
  }
  /**
   * Called when the model is cleared to reset state.
   */
  onModelDetached() {
  }
  /**
   * Called when an input is attached but no model exists yet. Use to render
   * placeholder UI from the input's metadata (e.g. show the URL in the navbar)
   * while the model resolves. Only fires when the input has no preloaded model;
   * after the model resolves, {@link onModelAttached} takes over.
   */
  prerenderInput(_input) {
  }
  /**
   * Widgets contributed by this feature. Each widget declares its target
   * {@link BrowserWidgetLocation}; the editor groups widgets by location
   * and stacks them in {@link IBrowserEditorWidget.order} order.
   */
  get widgets() {
    return [];
  }
  /**
   * Optional renderers for the URL displayed in the navbar. Each renderer is
   * given the URL and a container; the first to return `true` claims the
   * render. If none claim it, the navbar falls back to plain text. Used to
   * decorate URLs for special conditions (e.g. red strikethrough on the
   * `https:` prefix when a certificate error is active).
   */
  get urlRenderers() {
    return [];
  }
  /**
   * Optional URL bar suggestion providers (open tabs, history, favorites,
   * search engines, ...). The navbar invokes each provider in sorted order
   * when the URL picker opens or its value changes, and renders the merged
   * suggestions below the built-in "Go to" entry.
   */
  get urlSuggestionProviders() {
    return [];
  }
  /**
   * Optional action providers for buttons rendered in the URL picker chrome.
   * The navbar collects buttons from each provider when the picker opens
   * and refreshes them when a provider fires {@link IBrowserUrlPickerActionProvider.onDidChange}.
   */
  get urlPickerActionProviders() {
    return [];
  }
  /**
   * Creates a custom action view item, or returns `undefined` to use the default.
   */
  getActionViewItem(_action, _options, _instantiationService) {
    return void 0;
  }
  /**
   * Called when the editor is laid out with a new dimension.
   */
  onPaneResized(_width) {
  }
  /**
   * Called after the browser container has been laid out and its bounds
   * pushed to the model. Contributions can use this to react to position
   * changes (e.g. recompute overlay overlap), unlike {@link onPaneResized} which
   * only fires on pane dimension changes.
   */
  afterContainerLayout() {
  }
  /**
   * Called when the editor pane's visibility changes (e.g. tab switched).
   * Contributions that drive page rendering use this to pause/resume work.
   */
  onPaneVisibilityChanged(_visible) {
  }
  /**
   * Called when the editor wants focus. Contributions are tried in
   * registration order; the first to return `true` claims the focus. The
   * renderer-providing contribution typically handles this when a page is
   * loaded; the navbar handles it as a fallback by focusing the URL input.
   */
  tryFocus() {
    return false;
  }
  /**
   * Called once after the editor's browser container DOM has been created
   * and all toolbar widgets have been mounted. Use for any setup that needs
   * the editor's DOM to exist or needs to read sibling contributions (e.g.
   * the navbar pulls pre/post-URL widgets from other features here).
   */
  onContainerCreated(_container) {
  }
  /**
   * Optional contributions to how the browser container is sized and
   * positioned within the editor's wrapper. Multiple contributions are
   * supported: padding is taken as the max across all contributors (so each
   * contributor's reservation is honoured without double-counting);
   * `compute` callbacks are chained in priority order (lower {@link
   * IContainerLayoutOverride.priority} runs first), each receiving the
   * previous result so contributions can stack (e.g. device emulation sizes
   * and centers the viewport, then pixel-snap aligns it).
   */
  beforeContainerLayout() {
    return void 0;
  }
}
var BrowserWidgetLocation = /* @__PURE__ */ ((BrowserWidgetLocation2) => {
  BrowserWidgetLocation2["PreUrl"] = "preUrl";
  BrowserWidgetLocation2["PostUrl"] = "postUrl";
  BrowserWidgetLocation2["Toolbar"] = "toolbar";
  BrowserWidgetLocation2["ContentArea"] = "contentArea";
  return BrowserWidgetLocation2;
})(BrowserWidgetLocation || {});
let BrowserEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService, layoutService) {
    super(BrowserEditorInput.EDITOR_ID, group, telemetryService, themeService, storageService);
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.layoutService = layoutService;
    this._contributionInstances = /* @__PURE__ */ new Map();
    this._onDidChangeModel = this._register(new Emitter());
    this.onDidChangeModel = this._onDidChangeModel.event;
    this._inputDisposables = this._register(new DisposableStore());
    this._currentPadding = { top: 0, right: 0, bottom: 0, left: 0 };
  }
  static registerContribution(ctor) {
    BrowserEditor._contributions.push(ctor);
  }
  getContribution(ctor) {
    return this._contributionInstances.get(ctor);
  }
  /** All instantiated contributions in registration order. */
  getContributions() {
    return this._contributionInstances.values();
  }
  get model() {
    return this._model;
  }
  get browserContainer() {
    return this._browserContainer;
  }
  get input() {
    return super.input;
  }
  createEditor(parent) {
    const contextKeyService = this._register(this.contextKeyService.createScoped(parent));
    this._hasUrlContext = CONTEXT_BROWSER_HAS_URL.bindTo(contextKeyService);
    this._hasErrorContext = CONTEXT_BROWSER_HAS_ERROR.bindTo(contextKeyService);
    CONTEXT_BROWSER_FOCUSED.bindTo(contextKeyService);
    const scopedInstantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, contextKeyService])
    ));
    for (const ctor of BrowserEditor._contributions) {
      const instance = this._register(scopedInstantiationService.createInstance(ctor, this));
      this._contributionInstances.set(ctor, instance);
    }
    const root = $(".browser-root");
    root.tabIndex = -1;
    parent.appendChild(root);
    const widgetsByLocation = /* @__PURE__ */ new Map();
    for (const contribution of this._contributionInstances.values()) {
      for (const widget of contribution.widgets) {
        let bucket = widgetsByLocation.get(widget.location);
        if (!bucket) {
          bucket = [];
          widgetsByLocation.set(widget.location, bucket);
        }
        bucket.push(widget);
      }
    }
    for (const bucket of widgetsByLocation.values()) {
      bucket.sort((a, b) => a.order - b.order);
    }
    const widgetsAt = (location) => widgetsByLocation.get(location) ?? [];
    for (const widget of widgetsAt("toolbar" /* Toolbar */)) {
      root.appendChild(widget.element);
    }
    this._browserContainerWrapper = $(".browser-container-wrapper");
    this._browserContainerWrapper.style.setProperty("--zoom-factor", String(getZoomFactor(this.window)));
    root.appendChild(this._browserContainerWrapper);
    this._browserContainer = $(".browser-container");
    this._browserContainer.tabIndex = 0;
    this._browserContainerWrapper.appendChild(this._browserContainer);
    for (const contribution of this._contributionInstances.values()) {
      contribution.onContainerCreated(this._browserContainer);
    }
    const placeholderContents = $(".browser-placeholder-contents");
    this._browserContainer.appendChild(placeholderContents);
    for (const widget of widgetsAt("contentArea" /* ContentArea */)) {
      placeholderContents.appendChild(widget.element);
    }
  }
  focus() {
    for (const c of this._contributionInstances.values()) {
      if (c.tryFocus()) {
        return;
      }
    }
    this.ensureBrowserFocus();
  }
  async setInput(input, options, context, token) {
    await super.setInput(input, options, context, token);
    if (token.isCancellationRequested) {
      return;
    }
    this._inputDisposables.clear();
    let model = input.model;
    const isNew = !model;
    if (!model) {
      this._hasUrlContext.set(!!input.url);
      this._hasErrorContext.set(false);
      for (const c of this._contributionInstances.values()) {
        c.prerenderInput(input);
      }
      model = await input.resolve();
    }
    if (token.isCancellationRequested || this.input !== input) {
      return;
    }
    this._model = model;
    this._onDidChangeModel.fire({ model, isNew });
    this._hasUrlContext.set(!!model.url);
    this._hasErrorContext.set(!!model.error);
    this._inputDisposables.add(this._model.onWillDispose(() => {
      if (this._model === model) {
        this._model = void 0;
        this._onDidChangeModel.fire({ model: void 0, isNew: false });
      }
    }));
    this._inputDisposables.add(this._model.onWillNavigate(() => {
      this.group.pinEditor(this.input);
      this.ensureBrowserFocus();
    }));
    this._inputDisposables.add(this._model.onDidNavigate(() => {
      this.group.pinEditor(this.input);
      this._hasUrlContext.set(!!model.url);
    }));
    this._inputDisposables.add(this._model.onDidChangeLoadingState(() => {
      this._hasErrorContext.set(!!model.error);
    }));
    this._inputDisposables.add(model.onDidChangeFocus(({ focused }) => {
      if (focused) {
        this._onDidFocus?.fire();
        this.ensureBrowserFocus();
      }
    }));
    this._inputDisposables.add(onDidChangeZoomLevel((targetWindowId) => {
      if (targetWindowId === this.window.vscodeWindowId) {
        this._browserContainerWrapper.style.setProperty("--zoom-factor", String(getZoomFactor(this.window)));
        this.layoutBrowserContainer();
      }
    }));
    this.layout();
  }
  setEditorVisible(visible) {
    for (const c of this._contributionInstances.values()) {
      c.onPaneVisibilityChanged(visible);
    }
  }
  /**
   * Make the browser container the active element without moving focus from the browser view.
   */
  ensureBrowserFocus() {
    originalHtmlElementFocus.call(this._browserContainer);
    this.window.document.getSelection()?.removeAllRanges();
  }
  /**
   * Close this editor tab (i.e. the editor input owning the current page).
   */
  closeTab() {
    this.group?.closeEditor(this.input);
  }
  layout(dimension, _position) {
    if (dimension) {
      for (const contribution of this._contributionInstances.values()) {
        contribution.onPaneResized(dimension.width);
      }
    }
    const whenContainerStylesLoaded = this.layoutService.whenContainerStylesLoaded(this.window);
    if (whenContainerStylesLoaded) {
      whenContainerStylesLoaded.then(() => this.layoutBrowserContainer());
    } else {
      this.layoutBrowserContainer();
    }
  }
  /**
   * Recompute the layout of the browser container and push the resulting
   * bounds + emulation to the renderer. Should generally only be called
   * via {@link layout} so the container is fully styled first.
   */
  layoutBrowserContainer(retries = 2) {
    if (!this._model) {
      return;
    }
    const overrides = [];
    for (const c of this._contributionInstances.values()) {
      const o = c.beforeContainerLayout();
      if (o) {
        overrides.push(o);
      }
    }
    const padding = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const o of overrides) {
      padding.top = Math.max(padding.top, o.padding?.top ?? 0);
      padding.right = Math.max(padding.right, o.padding?.right ?? 0);
      padding.bottom = Math.max(padding.bottom, o.padding?.bottom ?? 0);
      padding.left = Math.max(padding.left, o.padding?.left ?? 0);
    }
    this._currentPadding = padding;
    const wrapperRect = this._browserContainerWrapper.getBoundingClientRect();
    if ((wrapperRect.width === 0 || wrapperRect.height === 0) && retries > 0) {
      this.window.requestAnimationFrame(() => this.layoutBrowserContainer(retries - 1));
      return;
    }
    const paneWidth = Math.max(0, wrapperRect.width - padding.left - padding.right);
    const paneHeight = Math.max(0, wrapperRect.height - padding.top - padding.bottom);
    const pane = {
      width: paneWidth,
      height: paneHeight,
      originX: wrapperRect.left + padding.left,
      originY: wrapperRect.top + padding.top
    };
    const sorted = overrides.slice().sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    let layout = { width: paneWidth, height: paneHeight, top: 0, left: 0 };
    for (const o of sorted) {
      const next = o.compute?.(layout, pane);
      if (next) {
        layout = next;
      }
    }
    const left = padding.left + (layout.left ?? 0);
    const top = padding.top + (layout.top ?? 0);
    this._browserContainer.style.width = `${layout.width}px`;
    this._browserContainer.style.height = `${layout.height}px`;
    this._browserContainer.style.left = `${left}px`;
    this._browserContainer.style.top = `${top}px`;
    const cornerRadius = parseFloat(this.window.getComputedStyle(this._browserContainer).borderTopLeftRadius ?? "0");
    void this._model.layout({
      windowId: this.group.windowId,
      x: wrapperRect.left + left,
      y: wrapperRect.top + top,
      width: layout.width,
      height: layout.height,
      zoomFactor: getZoomFactor(this.window),
      cornerRadius,
      emulation: layout.emulation
    });
    for (const c of this._contributionInstances.values()) {
      c.afterContainerLayout();
    }
  }
  /**
   * Wrapper content-area size in CSS px — the area available to layout
   * contributions after their aggregated padding is applied.
   */
  get paneSize() {
    const r = this._browserContainerWrapper.getBoundingClientRect();
    const p = this._currentPadding;
    return {
      width: Math.max(0, r.width - p.left - p.right),
      height: Math.max(0, r.height - p.top - p.bottom)
    };
  }
  clearInput() {
    this._inputDisposables.clear();
    if (this._model) {
      this._model = void 0;
      this._onDidChangeModel.fire({ model: void 0, isNew: false });
    }
    this._hasUrlContext.reset();
    this._hasErrorContext.reset();
    super.clearInput();
  }
};
// -- Contribution registry --------------------------------------------
BrowserEditor._contributions = [];
BrowserEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ILayoutService)
], BrowserEditor);
export {
  BROWSER_EDITOR_ACTIVE,
  BrowserActionCategory,
  BrowserActionGroup,
  BrowserEditor,
  BrowserEditorContribution,
  BrowserWidgetLocation,
  CONTEXT_BROWSER_FOCUSED,
  CONTEXT_BROWSER_HAS_ERROR,
  CONTEXT_BROWSER_HAS_URL
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxicm93c2VyRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2Jyb3dzZXIuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBJRG9tUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgUmF3Q29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIElDb25zdHJ1Y3RvclNpZ25hdHVyZSwgQnJhbmRlZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclBhbmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRWRpdG9ySW5wdXQgfSBmcm9tICcuLi9jb21tb24vYnJvd3NlckVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBnZXRab29tRmFjdG9yLCBvbkRpZENoYW5nZVpvb21MZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuXG5leHBvcnQgY29uc3QgQ09OVEVYVF9CUk9XU0VSX0ZPQ1VTRUQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYnJvd3NlckZvY3VzZWQnLCB0cnVlLCBsb2NhbGl6ZSgnYnJvd3Nlci5lZGl0b3JGb2N1c2VkJywgXCJXaGV0aGVyIHRoZSBicm93c2VyIGVkaXRvciBpcyBmb2N1c2VkXCIpKTtcbmV4cG9ydCBjb25zdCBDT05URVhUX0JST1dTRVJfSEFTX1VSTCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdicm93c2VySGFzVXJsJywgZmFsc2UsIGxvY2FsaXplKCdicm93c2VyLmhhc1VybCcsIFwiV2hldGhlciB0aGUgYnJvd3NlciBoYXMgYSBVUkwgbG9hZGVkXCIpKTtcbmV4cG9ydCBjb25zdCBDT05URVhUX0JST1dTRVJfSEFTX0VSUk9SID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2Jyb3dzZXJIYXNFcnJvcicsIGZhbHNlLCBsb2NhbGl6ZSgnYnJvd3Nlci5oYXNFcnJvcicsIFwiV2hldGhlciB0aGUgYnJvd3NlciBoYXMgYSBsb2FkIGVycm9yXCIpKTtcblxuLyoqIENvbnRleHQga2V5IGV4cHJlc3Npb24gbWF0Y2hpbmcgd2hlbiB0aGUgYnJvd3NlciBlZGl0b3IgaXMgdGhlIGFjdGl2ZSBlZGl0b3IuICovXG5leHBvcnQgY29uc3QgQlJPV1NFUl9FRElUT1JfQUNUSVZFID0gQ29udGV4dEtleUV4cHIuZXF1YWxzKCdhY3RpdmVFZGl0b3InLCBCcm93c2VyRWRpdG9ySW5wdXQuRURJVE9SX0lEKTtcblxuLyoqIExvY2FsaXplZCBcIkJyb3dzZXJcIiBjYXRlZ29yeSBmb3IgY29tbWFuZCBwYWxldHRlIGdyb3VwaW5nLiAqL1xuZXhwb3J0IGNvbnN0IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSA9IGxvY2FsaXplMignYnJvd3NlckNhdGVnb3J5JywgXCJCcm93c2VyXCIpO1xuXG4vKiogTWVudSBncm91cHMgdXNlZCBieSBicm93c2VyLWVkaXRvciBhY3Rpb25zLiAqL1xuZXhwb3J0IGVudW0gQnJvd3NlckFjdGlvbkdyb3VwIHtcblx0VGFicyA9ICcxX3RhYnMnLFxuXHRab29tID0gJzJfem9vbScsXG5cdFRvb2xzID0gJzNfdG9vbHMnLFxuXHREYXRhID0gJzRfZGF0YScsXG5cdFNldHRpbmdzID0gJzVfc2V0dGluZ3MnXG59XG5cbi8qKlxuICogR2V0IHRoZSBvcmlnaW5hbCBpbXBsZW1lbnRhdGlvbiBvZiBIVE1MRWxlbWVudCBmb2N1cyAod2l0aG91dCB3aW5kb3cgYXV0by1mb2N1c2luZylcbiAqIGJlZm9yZSBpdCBnZXRzIG92ZXJyaWRkZW4gYnkgdGhlIHdvcmtiZW5jaC5cbiAqL1xuY29uc3Qgb3JpZ2luYWxIdG1sRWxlbWVudEZvY3VzID0gSFRNTEVsZW1lbnQucHJvdG90eXBlLmZvY3VzO1xuXG5cbi8qKlxuICogQmFzZSBjbGFzcyBmb3IgYnJvd3NlciBlZGl0b3Igc2VydmljZXMgdGhhdCB0cmFjayB0aGUgbW9kZWwgbGlmZWN5Y2xlLlxuICpcbiAqIFN1YmNsYXNzZXMgaW1wbGVtZW50IHtAbGluayBvbk1vZGVsQXR0YWNoZWR9IHdoaWNoIGlzIGNhbGxlZCB3aGVuZXZlciBhIG5ldyBtb2RlbCBpcyBzZXQuXG4gKiBBIHtAbGluayBEaXNwb3NhYmxlU3RvcmV9IGlzIHByb3ZpZGVkIHRoYXQgaXMgYXV0b21hdGljYWxseSBjbGVhcmVkIHdoZW4gdGhlIG1vZGVsXG4gKiBjaGFuZ2VzIG9yIHRoZSBlZGl0b3IgaW5wdXQgaXMgY2xlYXJlZC5cbiAqL1xuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IocHJvdGVjdGVkIHJlYWRvbmx5IGVkaXRvcjogQnJvd3NlckVkaXRvcikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKHsgbW9kZWwsIGlzTmV3IH0pID0+IHtcblx0XHRcdHRoaXMuX21vZGVsU3RvcmUuY2xlYXIoKTtcblx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHR0aGlzLm9uTW9kZWxBdHRhY2hlZChtb2RlbCwgdGhpcy5fbW9kZWxTdG9yZSwgaXNOZXcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5vbk1vZGVsRGV0YWNoZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW5ldmVyIHRoZSBlZGl0b3IgbW9kZWwgY2hhbmdlcyB0byB1cGRhdGUgc3RhdGUuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgb25Nb2RlbEF0dGFjaGVkKF9tb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwsIF9zdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBfaXNOZXc6IGJvb2xlYW4pOiB2b2lkIHsgfVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgbW9kZWwgaXMgY2xlYXJlZCB0byByZXNldCBzdGF0ZS5cblx0ICovXG5cdG9uTW9kZWxEZXRhY2hlZCgpOiB2b2lkIHsgfVxuXG5cdC8qKlxuXHQgKiBDYWxsZWQgd2hlbiBhbiBpbnB1dCBpcyBhdHRhY2hlZCBidXQgbm8gbW9kZWwgZXhpc3RzIHlldC4gVXNlIHRvIHJlbmRlclxuXHQgKiBwbGFjZWhvbGRlciBVSSBmcm9tIHRoZSBpbnB1dCdzIG1ldGFkYXRhIChlLmcuIHNob3cgdGhlIFVSTCBpbiB0aGUgbmF2YmFyKVxuXHQgKiB3aGlsZSB0aGUgbW9kZWwgcmVzb2x2ZXMuIE9ubHkgZmlyZXMgd2hlbiB0aGUgaW5wdXQgaGFzIG5vIHByZWxvYWRlZCBtb2RlbDtcblx0ICogYWZ0ZXIgdGhlIG1vZGVsIHJlc29sdmVzLCB7QGxpbmsgb25Nb2RlbEF0dGFjaGVkfSB0YWtlcyBvdmVyLlxuXHQgKi9cblx0cHJlcmVuZGVySW5wdXQoX2lucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQpOiB2b2lkIHsgfVxuXG5cdC8qKlxuXHQgKiBXaWRnZXRzIGNvbnRyaWJ1dGVkIGJ5IHRoaXMgZmVhdHVyZS4gRWFjaCB3aWRnZXQgZGVjbGFyZXMgaXRzIHRhcmdldFxuXHQgKiB7QGxpbmsgQnJvd3NlcldpZGdldExvY2F0aW9ufTsgdGhlIGVkaXRvciBncm91cHMgd2lkZ2V0cyBieSBsb2NhdGlvblxuXHQgKiBhbmQgc3RhY2tzIHRoZW0gaW4ge0BsaW5rIElCcm93c2VyRWRpdG9yV2lkZ2V0Lm9yZGVyfSBvcmRlci5cblx0ICovXG5cdGdldCB3aWRnZXRzKCk6IHJlYWRvbmx5IElCcm93c2VyRWRpdG9yV2lkZ2V0W10geyByZXR1cm4gW107IH1cblxuXHQvKipcblx0ICogT3B0aW9uYWwgcmVuZGVyZXJzIGZvciB0aGUgVVJMIGRpc3BsYXllZCBpbiB0aGUgbmF2YmFyLiBFYWNoIHJlbmRlcmVyIGlzXG5cdCAqIGdpdmVuIHRoZSBVUkwgYW5kIGEgY29udGFpbmVyOyB0aGUgZmlyc3QgdG8gcmV0dXJuIGB0cnVlYCBjbGFpbXMgdGhlXG5cdCAqIHJlbmRlci4gSWYgbm9uZSBjbGFpbSBpdCwgdGhlIG5hdmJhciBmYWxscyBiYWNrIHRvIHBsYWluIHRleHQuIFVzZWQgdG9cblx0ICogZGVjb3JhdGUgVVJMcyBmb3Igc3BlY2lhbCBjb25kaXRpb25zIChlLmcuIHJlZCBzdHJpa2V0aHJvdWdoIG9uIHRoZVxuXHQgKiBgaHR0cHM6YCBwcmVmaXggd2hlbiBhIGNlcnRpZmljYXRlIGVycm9yIGlzIGFjdGl2ZSkuXG5cdCAqL1xuXHRnZXQgdXJsUmVuZGVyZXJzKCk6IHJlYWRvbmx5IElCcm93c2VyVXJsUmVuZGVyZXJbXSB7IHJldHVybiBbXTsgfVxuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBVUkwgYmFyIHN1Z2dlc3Rpb24gcHJvdmlkZXJzIChvcGVuIHRhYnMsIGhpc3RvcnksIGZhdm9yaXRlcyxcblx0ICogc2VhcmNoIGVuZ2luZXMsIC4uLikuIFRoZSBuYXZiYXIgaW52b2tlcyBlYWNoIHByb3ZpZGVyIGluIHNvcnRlZCBvcmRlclxuXHQgKiB3aGVuIHRoZSBVUkwgcGlja2VyIG9wZW5zIG9yIGl0cyB2YWx1ZSBjaGFuZ2VzLCBhbmQgcmVuZGVycyB0aGUgbWVyZ2VkXG5cdCAqIHN1Z2dlc3Rpb25zIGJlbG93IHRoZSBidWlsdC1pbiBcIkdvIHRvXCIgZW50cnkuXG5cdCAqL1xuXHRnZXQgdXJsU3VnZ2VzdGlvblByb3ZpZGVycygpOiByZWFkb25seSBJQnJvd3NlclVybFN1Z2dlc3Rpb25Qcm92aWRlcltdIHsgcmV0dXJuIFtdOyB9XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGFjdGlvbiBwcm92aWRlcnMgZm9yIGJ1dHRvbnMgcmVuZGVyZWQgaW4gdGhlIFVSTCBwaWNrZXIgY2hyb21lLlxuXHQgKiBUaGUgbmF2YmFyIGNvbGxlY3RzIGJ1dHRvbnMgZnJvbSBlYWNoIHByb3ZpZGVyIHdoZW4gdGhlIHBpY2tlciBvcGVuc1xuXHQgKiBhbmQgcmVmcmVzaGVzIHRoZW0gd2hlbiBhIHByb3ZpZGVyIGZpcmVzIHtAbGluayBJQnJvd3NlclVybFBpY2tlckFjdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlfS5cblx0ICovXG5cdGdldCB1cmxQaWNrZXJBY3Rpb25Qcm92aWRlcnMoKTogcmVhZG9ubHkgSUJyb3dzZXJVcmxQaWNrZXJBY3Rpb25Qcm92aWRlcltdIHsgcmV0dXJuIFtdOyB9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBjdXN0b20gYWN0aW9uIHZpZXcgaXRlbSwgb3IgcmV0dXJucyBgdW5kZWZpbmVkYCB0byB1c2UgdGhlIGRlZmF1bHQuXG5cdCAqL1xuXHRnZXRBY3Rpb25WaWV3SXRlbShfYWN0aW9uOiBJQWN0aW9uLCBfb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucywgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4ge0BsaW5rIGdldEFjdGlvblZpZXdJdGVtfSBtYXkgcmV0dXJuIGEgZGlmZmVyZW50IHJlc3VsdC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aW9uVmlld0l0ZW1zOiBFdmVudDx2b2lkPiA9IEV2ZW50Lk5vbmU7XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSBlZGl0b3IgaXMgbGFpZCBvdXQgd2l0aCBhIG5ldyBkaW1lbnNpb24uXG5cdCAqL1xuXHRvblBhbmVSZXNpemVkKF93aWR0aDogbnVtYmVyKTogdm9pZCB7IH1cblxuXHQvKipcblx0ICogQ2FsbGVkIGFmdGVyIHRoZSBicm93c2VyIGNvbnRhaW5lciBoYXMgYmVlbiBsYWlkIG91dCBhbmQgaXRzIGJvdW5kc1xuXHQgKiBwdXNoZWQgdG8gdGhlIG1vZGVsLiBDb250cmlidXRpb25zIGNhbiB1c2UgdGhpcyB0byByZWFjdCB0byBwb3NpdGlvblxuXHQgKiBjaGFuZ2VzIChlLmcuIHJlY29tcHV0ZSBvdmVybGF5IG92ZXJsYXApLCB1bmxpa2Uge0BsaW5rIG9uUGFuZVJlc2l6ZWR9IHdoaWNoXG5cdCAqIG9ubHkgZmlyZXMgb24gcGFuZSBkaW1lbnNpb24gY2hhbmdlcy5cblx0ICovXG5cdGFmdGVyQ29udGFpbmVyTGF5b3V0KCk6IHZvaWQgeyB9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSBlZGl0b3IgcGFuZSdzIHZpc2liaWxpdHkgY2hhbmdlcyAoZS5nLiB0YWIgc3dpdGNoZWQpLlxuXHQgKiBDb250cmlidXRpb25zIHRoYXQgZHJpdmUgcGFnZSByZW5kZXJpbmcgdXNlIHRoaXMgdG8gcGF1c2UvcmVzdW1lIHdvcmsuXG5cdCAqL1xuXHRvblBhbmVWaXNpYmlsaXR5Q2hhbmdlZChfdmlzaWJsZTogYm9vbGVhbik6IHZvaWQgeyB9XG5cblx0LyoqXG5cdCAqIENhbGxlZCB3aGVuIHRoZSBlZGl0b3Igd2FudHMgZm9jdXMuIENvbnRyaWJ1dGlvbnMgYXJlIHRyaWVkIGluXG5cdCAqIHJlZ2lzdHJhdGlvbiBvcmRlcjsgdGhlIGZpcnN0IHRvIHJldHVybiBgdHJ1ZWAgY2xhaW1zIHRoZSBmb2N1cy4gVGhlXG5cdCAqIHJlbmRlcmVyLXByb3ZpZGluZyBjb250cmlidXRpb24gdHlwaWNhbGx5IGhhbmRsZXMgdGhpcyB3aGVuIGEgcGFnZSBpc1xuXHQgKiBsb2FkZWQ7IHRoZSBuYXZiYXIgaGFuZGxlcyBpdCBhcyBhIGZhbGxiYWNrIGJ5IGZvY3VzaW5nIHRoZSBVUkwgaW5wdXQuXG5cdCAqL1xuXHR0cnlGb2N1cygpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cblx0LyoqXG5cdCAqIENhbGxlZCBvbmNlIGFmdGVyIHRoZSBlZGl0b3IncyBicm93c2VyIGNvbnRhaW5lciBET00gaGFzIGJlZW4gY3JlYXRlZFxuXHQgKiBhbmQgYWxsIHRvb2xiYXIgd2lkZ2V0cyBoYXZlIGJlZW4gbW91bnRlZC4gVXNlIGZvciBhbnkgc2V0dXAgdGhhdCBuZWVkc1xuXHQgKiB0aGUgZWRpdG9yJ3MgRE9NIHRvIGV4aXN0IG9yIG5lZWRzIHRvIHJlYWQgc2libGluZyBjb250cmlidXRpb25zIChlLmcuXG5cdCAqIHRoZSBuYXZiYXIgcHVsbHMgcHJlL3Bvc3QtVVJMIHdpZGdldHMgZnJvbSBvdGhlciBmZWF0dXJlcyBoZXJlKS5cblx0ICovXG5cdG9uQ29udGFpbmVyQ3JlYXRlZChfY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQgeyB9XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNvbnRyaWJ1dGlvbnMgdG8gaG93IHRoZSBicm93c2VyIGNvbnRhaW5lciBpcyBzaXplZCBhbmRcblx0ICogcG9zaXRpb25lZCB3aXRoaW4gdGhlIGVkaXRvcidzIHdyYXBwZXIuIE11bHRpcGxlIGNvbnRyaWJ1dGlvbnMgYXJlXG5cdCAqIHN1cHBvcnRlZDogcGFkZGluZyBpcyB0YWtlbiBhcyB0aGUgbWF4IGFjcm9zcyBhbGwgY29udHJpYnV0b3JzIChzbyBlYWNoXG5cdCAqIGNvbnRyaWJ1dG9yJ3MgcmVzZXJ2YXRpb24gaXMgaG9ub3VyZWQgd2l0aG91dCBkb3VibGUtY291bnRpbmcpO1xuXHQgKiBgY29tcHV0ZWAgY2FsbGJhY2tzIGFyZSBjaGFpbmVkIGluIHByaW9yaXR5IG9yZGVyIChsb3dlciB7QGxpbmtcblx0ICogSUNvbnRhaW5lckxheW91dE92ZXJyaWRlLnByaW9yaXR5fSBydW5zIGZpcnN0KSwgZWFjaCByZWNlaXZpbmcgdGhlXG5cdCAqIHByZXZpb3VzIHJlc3VsdCBzbyBjb250cmlidXRpb25zIGNhbiBzdGFjayAoZS5nLiBkZXZpY2UgZW11bGF0aW9uIHNpemVzXG5cdCAqIGFuZCBjZW50ZXJzIHRoZSB2aWV3cG9ydCwgdGhlbiBwaXhlbC1zbmFwIGFsaWducyBpdCkuXG5cdCAqL1xuXHRiZWZvcmVDb250YWluZXJMYXlvdXQoKTogSUNvbnRhaW5lckxheW91dE92ZXJyaWRlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG4vKiogQ3VzdG9taXphdGlvbiByZXR1cm5lZCBieSB7QGxpbmsgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbi5iZWZvcmVDb250YWluZXJMYXlvdXR9LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29udGFpbmVyTGF5b3V0T3ZlcnJpZGUge1xuXHQvKipcblx0ICogV3JhcHBlciBwYWRkaW5nIChDU1MgcHgpIHJlc2VydmVkIGJ5IHRoaXMgY29udHJpYnV0aW9uIFx1MjAxNCBlLmcuIGZvclxuXHQgKiB3aWRnZXRzIHRoYXQgc2l0IG91dHNpZGUgdGhlIGNvbnRhaW5lciAocmVzaXplIHNhc2hlcyksIG9yIGEgYmFzZWxpbmVcblx0ICogdmlzdWFsIG1hcmdpbi4gVGhlIGVkaXRvciB0YWtlcyB0aGUgcGVyLXNpZGUgbWF4IGFjcm9zcyBhbGxcblx0ICogY29udHJpYnV0b3JzIGFuZCBzdWJ0cmFjdHMgdGhlIHJlc3VsdCBmcm9tIHRoZSB3cmFwcGVyIGJlZm9yZSBwYXNzaW5nXG5cdCAqIHRoZSBwYW5lIGluZm8gdG8ge0BsaW5rIGNvbXB1dGV9LiBEZWZhdWx0IDAgcGVyIHNpZGUuXG5cdCAqL1xuXHRyZWFkb25seSBwYWRkaW5nPzoge1xuXHRcdHRvcD86IG51bWJlcjtcblx0XHRyaWdodD86IG51bWJlcjtcblx0XHRib3R0b20/OiBudW1iZXI7XG5cdFx0bGVmdD86IG51bWJlcjtcblx0fTtcblx0LyoqXG5cdCAqIFRyYW5zZm9ybSB0aGUgbGF5b3V0LiBDYWxsZWQgaW4gcHJpb3JpdHkgb3JkZXIgKGxvd2VyIHJ1bnMgZmlyc3QpOyBlYWNoXG5cdCAqIGNhbGwgcmVjZWl2ZXMgdGhlIHJlc3VsdCBvZiB0aGUgcHJldmlvdXMgY29tcHV0ZSBwbHVzIHBhbmUgaW5mb1xuXHQgKiAoYXZhaWxhYmxlIHNpemUgYW5kIHRoZSBhYnNvbHV0ZSBzY3JlZW4gb3JpZ2luIG9mIGxheW91dC1zcGFjZSAoMCwwKSkuXG5cdCAqIFRoZSBpbml0aWFsIGlucHV0IGlzIGB7IHdpZHRoOiBwYW5lLndpZHRoLCBoZWlnaHQ6IHBhbmUuaGVpZ2h0LCB0b3A6IDAsXG5cdCAqIGxlZnQ6IDAgfWAgd2l0aCBubyBlbXVsYXRpb24gXHUyMDE0IGB0b3BgL2BsZWZ0YCBhcmUgbG9jYWwgY29vcmRpbmF0ZXNcblx0ICogcmVsYXRpdmUgdG8gdGhlIHRvcC1sZWZ0IG9mIHRoZSBhdmFpbGFibGUgYXJlYS4gVGhlIHBhbmUgb3JpZ2luIGxldHNcblx0ICogY29udHJpYnV0aW9ucyByZWFzb24gYWJvdXQgYWJzb2x1dGUgcGl4ZWwgYWxpZ25tZW50IChlLmcuIHNuYXAgdG9cblx0ICogcGh5c2ljYWwgcGl4ZWxzKSBhbmQgY29udmVydCBiYWNrIHRvIGxvY2FsIGNvb3Jkcy4gUmV0dXJuaW5nXG5cdCAqIGB1bmRlZmluZWRgIGxlYXZlcyB0aGUgY3VycmVudCBsYXlvdXQgdW5jaGFuZ2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgY29tcHV0ZT86IChjdXJyZW50OiBJQ29udGFpbmVyTGF5b3V0LCBwYW5lOiBJQ29udGFpbmVyTGF5b3V0UGFuZSkgPT4gSUNvbnRhaW5lckxheW91dCB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIFByaW9yaXR5IGZvciB7QGxpbmsgY29tcHV0ZX0uIExvd2VyIG51bWJlcnMgcnVuIGVhcmxpZXIgc28gbGF0ZXJcblx0ICogY29udHJpYnV0aW9ucyBjYW4gcmVmaW5lIHRoZSByZXN1bHQgKGUuZy4gZW11bGF0aW9uIHJ1bnMgYXQgcHJpb3JpdHkgMFxuXHQgKiB0byBzaXplL3Bvc2l0aW9uIHRoZSB2aWV3cG9ydDsgcGl4ZWwtc25hcCBydW5zIGF0IHByaW9yaXR5IDEwMDAgdG9cblx0ICogYWxpZ24pLiBEZWZhdWx0IDAuXG5cdCAqL1xuXHRyZWFkb25seSBwcmlvcml0eT86IG51bWJlcjtcbn1cblxuLyoqIFBhbmUgaW5mbyBwYXNzZWQgdG8ge0BsaW5rIElDb250YWluZXJMYXlvdXRPdmVycmlkZS5jb21wdXRlfS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRhaW5lckxheW91dFBhbmUge1xuXHQvKiogQXZhaWxhYmxlIHdpZHRoIGFmdGVyIGFnZ3JlZ2F0ZWQgcGFkZGluZyBpcyBhcHBsaWVkIChDU1MgcHgpLiAqL1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xuXHQvKiogQXZhaWxhYmxlIGhlaWdodCBhZnRlciBhZ2dyZWdhdGVkIHBhZGRpbmcgaXMgYXBwbGllZCAoQ1NTIHB4KS4gKi9cblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG5cdC8qKiBBYnNvbHV0ZSBzY3JlZW4geCBvZiBsYXlvdXQtc3BhY2UgKDAsIDApLiAqL1xuXHRyZWFkb25seSBvcmlnaW5YOiBudW1iZXI7XG5cdC8qKiBBYnNvbHV0ZSBzY3JlZW4geSBvZiBsYXlvdXQtc3BhY2UgKDAsIDApLiAqL1xuXHRyZWFkb25seSBvcmlnaW5ZOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRhaW5lckxheW91dCB7XG5cdHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xuXHQvKiogTG9jYWwgcG9zaXRpb24gd2l0aGluIHRoZSB3cmFwcGVyIChDU1MgcHgpLiBEZWZhdWx0cyB0byAwLiAqL1xuXHRyZWFkb25seSB0b3A/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxlZnQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVtdWxhdGlvbj86IHtcblx0XHRyZWFkb25seSBzY2FsZTogbnVtYmVyO1xuXHR9O1xufVxuXG4vKiogV2hlcmUgYSBjb250cmlidXRlZCB3aWRnZXQgbW91bnRzIHdpdGhpbiB0aGUgYnJvd3NlciBlZGl0b3IuICovXG5leHBvcnQgY29uc3QgZW51bSBCcm93c2VyV2lkZ2V0TG9jYXRpb24ge1xuXHQvKiogSW5zaWRlIHRoZSBuYXZiYXIsIGJlZm9yZSB0aGUgVVJMIGlucHV0IChlLmcuIHNpdGUvc2VjdXJpdHkgaW5kaWNhdG9ycykuICovXG5cdFByZVVybCA9ICdwcmVVcmwnLFxuXHQvKiogSW5zaWRlIHRoZSBuYXZiYXIsIGFmdGVyIHRoZSBVUkwgaW5wdXQgKGUuZy4gem9vbSBwaWxsLCBzaGFyZSB0b2dnbGUpLiAqL1xuXHRQb3N0VXJsID0gJ3Bvc3RVcmwnLFxuXHQvKiogQmV0d2VlbiB0aGUgbmF2YmFyIGFuZCB0aGUgYnJvd3NlciBjb250YWluZXIgKGUuZy4gZmluZCAvIGVtdWxhdGlvbiB0b29sYmFycykuICovXG5cdFRvb2xiYXIgPSAndG9vbGJhcicsXG5cdC8qKiBJbnNpZGUgdGhlIGJyb3dzZXIgY29udGFpbmVyIChwbGFjZWhvbGRlciBzY3JlZW5zaG90LCBlcnJvciBvdmVybGF5LCBldGMuKS4gKi9cblx0Q29udGVudEFyZWEgPSAnY29udGVudEFyZWEnLFxufVxuXG4vKipcbiAqIEEgd2lkZ2V0IGNvbnRyaWJ1dGVkIGJ5IGEge0BsaW5rIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb259LiBUaGUgZWRpdG9yXG4gKiBncm91cHMgd2lkZ2V0cyBieSB7QGxpbmsgbG9jYXRpb259IGFuZCBtb3VudHMgZWFjaCBncm91cCBzb3J0ZWQgYnlcbiAqIHtAbGluayBvcmRlcn0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJFZGl0b3JXaWRnZXQge1xuXHRyZWFkb25seSBsb2NhdGlvbjogQnJvd3NlcldpZGdldExvY2F0aW9uO1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0LyoqIFN0YWNraW5nIG9yZGVyIHdpdGhpbiB0aGUgbG9jYXRpb24uIExvd2VyIG51bWJlcnMgcmVuZGVyIGZpcnN0LiAqL1xuXHRyZWFkb25seSBvcmRlcjogbnVtYmVyO1xufVxuXG4vKipcbiAqIEN1c3RvbWl6ZXMgaG93IHRoZSBVUkwgaXMgcmVuZGVyZWQgaW50byB0aGUgbmF2YmFyJ3MgVVJMIGRpc3BsYXkgZWxlbWVudC5cbiAqIFRoZSBuYXZiYXIgaXRlcmF0ZXMgY29udHJpYnV0ZWQgcmVuZGVyZXJzIGluIHJlZ2lzdHJhdGlvbiBvcmRlcjsgdGhlIGZpcnN0XG4gKiBvbmUgdG8gcmV0dXJuIGB0cnVlYCBmcm9tIHtAbGluayByZW5kZXJ9IGNsYWltcyB0aGUgcmVuZGVyLiBJZiBubyByZW5kZXJlclxuICogY2xhaW1zIGl0LCB0aGUgbmF2YmFyIGZhbGxzIGJhY2sgdG8gcGxhaW4gdGV4dC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclVybFJlbmRlcmVyIHtcblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgVVJMIGludG8gdGhlIGdpdmVuIChhbHJlYWR5LWVtcHRpZWQpIGNvbnRhaW5lci4gUmV0dXJuIHRydWUgaWZcblx0ICogdGhlIFVSTCB3YXMgcmVuZGVyZWQ7IGZhbHNlIHRvIGZhbGwgdGhyb3VnaCB0byBzdWJzZXF1ZW50IHJlbmRlcmVycy5cblx0ICovXG5cdHJlbmRlcih1cmw6IHN0cmluZywgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIHtAbGluayByZW5kZXJ9IHdvdWxkIHByb2R1Y2UgYSBkaWZmZXJlbnQgcmVzdWx0IGZvciB0aGUgc2FtZVxuXHQgKiBVUkwgKGUuZy4gdW5kZXJseWluZyBzdGF0ZSBjaGFuZ2VkKS4gVGhlIG5hdmJhciByZS1yZW5kZXJzIG9uIHRoaXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG59XG5cbi8qKlxuICogQSBzaW5nbGUgVVJMIGJhciBzdWdnZXN0aW9uLiBTdWdnZXN0aW9ucyBhcmUgcHJvZHVjZWQgYnlcbiAqIHtAbGluayBJQnJvd3NlclVybFN1Z2dlc3Rpb25Qcm92aWRlcn1zIGNvbnRyaWJ1dGVkIHZpYVxuICoge0BsaW5rIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24udXJsU3VnZ2VzdGlvblByb3ZpZGVyc30uIFdoZW4gdGhlIHVzZXJcbiAqIHBpY2tzIGEgc3VnZ2VzdGlvbiB0aGUgbmF2YmFyIGludm9rZXMge0BsaW5rIGFwcGx5fSwgcGFzc2luZyB0aGUgYWN0aXZlXG4gKiB7QGxpbmsgQnJvd3NlckVkaXRvcklucHV0fSBzbyB0aGUgc3VnZ2VzdGlvbiBjYW4gZGVjaWRlIHdoYXQgdG8gZG8gd2l0aCBpdFxuICogKG5hdmlnYXRlLCBzd2FwIHRvIGEgZGlmZmVyZW50IHRhYiwgZXRjLikuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJVcmxTdWdnZXN0aW9uIHtcblx0LyoqIFN0YWJsZSBpZGVudGlmaWVyIHVzZWQgYXMgdGhlIHBpY2tlciBpdGVtIGlkLiAqL1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHQvKiogTGFiZWwgc2hvd24gaW4gdGhlIHN1Z2dlc3Rpb24gbGlzdC4gKi9cblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0LyoqIE9wdGlvbmFsIHNlY29uZGFyeSBkZXNjcmlwdGlvbiAoZS5nLiBob3N0LCBkYXRlLCBzb3VyY2UpLiAqL1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0LyoqIE9wdGlvbmFsIGxlYWRpbmcgaWNvbiAoY29kaWNvbikuICovXG5cdHJlYWRvbmx5IGljb24/OiBUaGVtZUljb247XG5cdC8qKiBPcHRpb25hbCBsZWFkaW5nIGljb24gKGltYWdlLCBlLmcuIGZhdmljb24pLiBUYWtlcyBwcmVjZWRlbmNlIG92ZXIge0BsaW5rIGljb259LiAqL1xuXHRyZWFkb25seSBpY29uUGF0aD86IHsgZGFyazogVVJJOyBsaWdodD86IFVSSSB9O1xuXHQvKipcblx0ICogT3B0aW9uYWwgcGVyLWl0ZW0gYWN0aW9ucyByZW5kZXJlZCBhcyBpbmxpbmUgYnV0dG9ucyBvbiB0aGVcblx0ICogc3VnZ2VzdGlvbidzIHJvdyAoZS5nLiBhIGRlbGV0ZSBidXR0b24gb24gYSBmYXZvcml0ZSBzdWdnZXN0aW9uKS5cblx0ICovXG5cdHJlYWRvbmx5IGFjdGlvbnM/OiByZWFkb25seSBJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb25bXTtcblx0LyoqXG5cdCAqIEludm9rZWQgd2hlbiB0aGUgc3VnZ2VzdGlvbiBpcyBhY2NlcHRlZC4gUmVjZWl2ZXMgdGhlIGlucHV0IHRoYXQgb3duc1xuXHQgKiB0aGUgVVJMIGJhciBzbyB0aGUgc3VnZ2VzdGlvbiBjYW4gYWN0IG9uIGl0cyBlZGl0b3IgKGUuZy4gc3dhcCB0aGVcblx0ICogZWRpdG9yJ3MgaW5wdXQgZm9yIGEgZGlmZmVyZW50IHRhYiwgb3IgbG9hZCBhIFVSTCBpbnRvIGl0cyBtb2RlbCkuXG5cdCAqL1xuXHRhcHBseShpbnB1dDogQnJvd3NlckVkaXRvcklucHV0KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbi8qKlxuICogQSBwZXItaXRlbSBidXR0b24gcmVuZGVyZWQgaW5saW5lIG9uIGEgc3VnZ2VzdGlvbidzIHJvdyAoZS5nLiBhIGRlbGV0ZVxuICogYnV0dG9uIG9uIGEgZmF2b3JpdGUpLiBFeHRlbmRzIHtAbGluayBJUXVpY2tJbnB1dEJ1dHRvbn0gc28gdmlzdWFsXG4gKiBwcm9wZXJ0aWVzIGFyZSBjb25maWd1cmVkIHRoZSBzYW1lIHdheSBhcyBhbnkgb3RoZXIgcGlja2VyIGJ1dHRvbjsgYWRkc1xuICogYW4ge0BsaW5rIGlkfSBmb3IgaWRlbnRpZmljYXRpb24gYW5kIGEge0BsaW5rIHJ1bn0gY2FsbGJhY2sgdGhhdCByZWNlaXZlc1xuICogdGhlIGFjdGl2ZSB7QGxpbmsgQnJvd3NlckVkaXRvcklucHV0fSBzbyB0aGUgYWN0aW9uIGNhbiBvcGVyYXRlIG9uIHRoZVxuICogZWRpdG9yIGl0IHdhcyB0cmlnZ2VyZWQgZnJvbS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24gZXh0ZW5kcyBJUXVpY2tJbnB1dEJ1dHRvbiB7XG5cdC8qKiBTdGFibGUgaWQgKHVzZWZ1bCBmb3IgdGVsZW1ldHJ5L2RlYnVnZ2luZykuICovXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdC8qKiBJbnZva2VkIHdoZW4gdGhlIHVzZXIgYWN0aXZhdGVzIHRoZSBwZXItaXRlbSBidXR0b24uICovXG5cdHJ1bihpbnB1dDogQnJvd3NlckVkaXRvcklucHV0KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbi8qKiBDb250ZXh0IHBhc3NlZCB0byBwcm92aWRlcnMgd2hlbiBzdWdnZXN0aW9ucyBhcmUgcmVxdWVzdGVkLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQnJvd3NlclVybFN1Z2dlc3Rpb25Db250ZXh0IHtcblx0LyoqIEN1cnJlbnQgVVJMIGJhciB0ZXh0IChtYXkgYmUgZW1wdHkpLiAqL1xuXHRyZWFkb25seSB0ZXh0OiBzdHJpbmc7XG5cdC8qKiBUaGUgaW5wdXQgdGhhdCBvd25zIHRoZSBVUkwgYmFyIHJlcXVlc3Rpbmcgc3VnZ2VzdGlvbnMuICovXG5cdHJlYWRvbmx5IGlucHV0OiBCcm93c2VyRWRpdG9ySW5wdXQ7XG59XG5cbi8qKlxuICogQSBzb3VyY2Ugb2YgVVJMIGJhciBzdWdnZXN0aW9ucyAob3BlbiB0YWJzLCBoaXN0b3J5LCBmYXZvcml0ZXMsIHNlYXJjaFxuICogZW5naW5lcywgLi4uKS4gQ29udHJpYnV0aW9ucyByZXR1cm4gcHJvdmlkZXJzIHZpYVxuICoge0BsaW5rIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24udXJsU3VnZ2VzdGlvblByb3ZpZGVyc30uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJVcmxTdWdnZXN0aW9uUHJvdmlkZXIge1xuXHQvKipcblx0ICogT3B0aW9uYWwgZ3JvdXAgbGFiZWwgcmVuZGVyZWQgYXMgYSBzZXBhcmF0b3IgYWJvdmUgdGhpcyBwcm92aWRlcidzXG5cdCAqIHN1Z2dlc3Rpb25zIChvbmx5IHNob3duIHdoZW4gdGhlIHByb3ZpZGVyIHJldHVybnMgYXQgbGVhc3Qgb25lIGl0ZW0pLlxuXHQgKi9cblx0cmVhZG9ubHkgbGFiZWw/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBncm91cCBkZXNjcmlwdGlvbiByZW5kZXJlZCBuZXh0IHRvIHRoZSBzZXBhcmF0b3IgbGFiZWxcblx0ICogKGUuZy4gXCJTZWxlY3QgYSB0YWIgdG8gc3dpdGNoXCIpLiBPbmx5IHNob3duIHdoZW4ge0BsaW5rIGxhYmVsfSBpcyBzZXQuXG5cdCAqL1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0LyoqIFNvcnQgb3JkZXIgYmV0d2VlbiBwcm92aWRlcnMuIExvd2VyIHJ1bnMgZmlyc3QuIERlZmF1bHRzIHRvIDAuICovXG5cdHJlYWRvbmx5IG9yZGVyPzogbnVtYmVyO1xuXHQvKipcblx0ICogT3B0aW9uYWwgYnV0dG9ucyByZW5kZXJlZCBpbmxpbmUgb24gdGhlIGdyb3VwJ3Mgc2VwYXJhdG9yIHJvdy4gT25seVxuXHQgKiBzaG93biB3aGVuIHRoZSBwcm92aWRlciByZXR1cm5zIGF0IGxlYXN0IG9uZSBzdWdnZXN0aW9uLiBVc2UgdGhlc2UgZm9yXG5cdCAqIGNvbW1hbmRzIHRoYXQgb3BlcmF0ZSBvbiB0aGUgd2hvbGUgZ3JvdXAgKGUuZy4gYSBcIm1hbmFnZVwiIHBpY2tlcikuXG5cdCAqL1xuXHRyZWFkb25seSBhY3Rpb25zPzogcmVhZG9ubHkgSUJyb3dzZXJVcmxTdWdnZXN0aW9uQWN0aW9uW107XG5cdC8qKlxuXHQgKiBGaXJlcyB3aGVuIHRoZSBzZXQgb2Ygc3VnZ2VzdGlvbnMgb3IgYW55IHN1Z2dlc3Rpb24ncyBzdGF0ZSBoYXMgY2hhbmdlZC5cblx0ICogVGhlIG5hdmJhciByZS1yZXF1ZXN0cyBzdWdnZXN0aW9ucyB3aGVuIHRoaXMgZmlyZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZT86IEV2ZW50PHZvaWQ+O1xuXHRnZXRTdWdnZXN0aW9ucyhjb250ZXh0OiBJQnJvd3NlclVybFN1Z2dlc3Rpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElCcm93c2VyVXJsU3VnZ2VzdGlvbltdPjtcbn1cblxuLyoqXG4gKiBBIGJ1dHRvbiByZW5kZXJlZCBpbiB0aGUgVVJMIHBpY2tlciBjaHJvbWUuXG4gKiBFeHRlbmRzIHtAbGluayBJUXVpY2tJbnB1dEJ1dHRvbn0gc28gdmlzdWFsIHByb3BlcnRpZXMgKGljb24sIHRvb2x0aXAsXG4gKiB0b2dnbGUgc3RhdGUsIGxvY2F0aW9uKSBhcmUgY29uZmlndXJlZCB0aGUgc2FtZSB3YXkgYXMgYW55IG90aGVyIHBpY2tlclxuICogYnV0dG9uOyBhZGRzIGFuIHtAbGluayBpZH0gZm9yIGlkZW50aWZpY2F0aW9uIGFuZCBhIHtAbGluayBydW59IGNhbGxiYWNrXG4gKiB0aGF0IHJlY2VpdmVzIHRoZSBhY3RpdmUge0BsaW5rIEJyb3dzZXJFZGl0b3JJbnB1dH0gc28gdGhlIGFjdGlvbiBjYW5cbiAqIG9wZXJhdGUgb24gdGhlIGVkaXRvciBpdCB3YXMgdHJpZ2dlcmVkIGZyb20uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJVcmxQaWNrZXJBY3Rpb24gZXh0ZW5kcyBJUXVpY2tJbnB1dEJ1dHRvbiB7XG5cdC8qKiBTdGFibGUgaWQgKHVzZWZ1bCBmb3IgdGVsZW1ldHJ5L2RlYnVnZ2luZykuICovXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdC8qKiBJbnZva2VkIHdoZW4gdGhlIHVzZXIgYWN0aXZhdGVzIHRoZSBidXR0b24uICovXG5cdHJ1bihpbnB1dDogQnJvd3NlckVkaXRvcklucHV0KTogdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbi8qKlxuICogQSBzb3VyY2Ugb2YgVVJMIHBpY2tlciBjaHJvbWUgYWN0aW9ucy4gUHJvdmlkZXJzIGFyZSBxdWVyaWVkIG9uY2Ugd2hlbiB0aGVcbiAqIHBpY2tlciBvcGVuczsgaWYgYSBwcm92aWRlcidzIGFjdGlvbnMgb3IgdGhlaXIgc3RhdGUgY2hhbmdlIHdoaWxlIHRoZVxuICogcGlja2VyIGlzIG9wZW4sIGZpcmUge0BsaW5rIG9uRGlkQ2hhbmdlfSB0byBoYXZlIHRoZSBuYXZiYXIgcmVidWlsZCB0aGVcbiAqIGJ1dHRvbiBsaXN0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElCcm93c2VyVXJsUGlja2VyQWN0aW9uUHJvdmlkZXIge1xuXHQvKiogRmlyZXMgd2hlbiB0aGUgYWN0aW9uIHNldCBvciBhbnkgYWN0aW9uJ3MgdmlzdWFsIHN0YXRlIGNoYW5nZXMuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlPzogRXZlbnQ8dm9pZD47XG5cdC8qKiBTb3J0IG9yZGVyIGJldHdlZW4gcHJvdmlkZXJzLiBMb3dlciBydW5zIGZpcnN0LiBEZWZhdWx0cyB0byAwLiAqL1xuXHRyZWFkb25seSBvcmRlcj86IG51bWJlcjtcblx0Z2V0QWN0aW9ucyhpbnB1dDogQnJvd3NlckVkaXRvcklucHV0KTogcmVhZG9ubHkgSUJyb3dzZXJVcmxQaWNrZXJBY3Rpb25bXTtcbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJFZGl0b3IgZXh0ZW5kcyBFZGl0b3JQYW5lIHtcblxuXHQvLyAtLSBDb250cmlidXRpb24gcmVnaXN0cnkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfY29udHJpYnV0aW9uczogSUNvbnN0cnVjdG9yU2lnbmF0dXJlPEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sIFtCcm93c2VyRWRpdG9yXT5bXSA9IFtdO1xuXHRzdGF0aWMgcmVnaXN0ZXJDb250cmlidXRpb248U2VydmljZXMgZXh0ZW5kcyBCcmFuZGVkU2VydmljZVtdPihjdG9yOiB7IG5ldyhlZGl0b3I6IEJyb3dzZXJFZGl0b3IsIC4uLnNlcnZpY2VzOiBTZXJ2aWNlcyk6IEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24gfSk6IHZvaWQge1xuXHRcdEJyb3dzZXJFZGl0b3IuX2NvbnRyaWJ1dGlvbnMucHVzaChjdG9yIGFzIElDb25zdHJ1Y3RvclNpZ25hdHVyZTxCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uLCBbQnJvd3NlckVkaXRvcl0+KTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyaWJ1dGlvbkluc3RhbmNlcyA9IG5ldyBNYXA8SUNvbnN0cnVjdG9yU2lnbmF0dXJlPEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sIFtCcm93c2VyRWRpdG9yXT4sIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24+KCk7XG5cdGdldENvbnRyaWJ1dGlvbjxUIGV4dGVuZHMgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiwgU2VydmljZXMgZXh0ZW5kcyBCcmFuZGVkU2VydmljZVtdPihjdG9yOiB7IG5ldyhlZGl0b3I6IEJyb3dzZXJFZGl0b3IsIC4uLnNlcnZpY2VzOiBTZXJ2aWNlcyk6IFQgfSk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb250cmlidXRpb25JbnN0YW5jZXMuZ2V0KGN0b3IgYXMgSUNvbnN0cnVjdG9yU2lnbmF0dXJlPEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24sIFtCcm93c2VyRWRpdG9yXT4pIGFzIFQgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogQWxsIGluc3RhbnRpYXRlZCBjb250cmlidXRpb25zIGluIHJlZ2lzdHJhdGlvbiBvcmRlci4gKi9cblx0Z2V0Q29udHJpYnV0aW9ucygpOiBJdGVyYWJsZTxCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRyaWJ1dGlvbkluc3RhbmNlcy52YWx1ZXMoKTtcblx0fVxuXG5cdC8vIC0tIE1vZGVsIGxpZmVjeWNsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9tb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdGdldCBtb2RlbCgpOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9tb2RlbDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8e1xuXHRcdG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpc05ldzogYm9vbGVhbjtcblx0fT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWwgPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsLmV2ZW50O1xuXG5cdC8vIC0tIFN0YXRlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9icm93c2VyQ29udGFpbmVyV3JhcHBlciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9icm93c2VyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdGdldCBicm93c2VyQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMuX2Jyb3dzZXJDb250YWluZXI7IH1cblxuXHRwcml2YXRlIF9oYXNVcmxDb250ZXh0ITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX2hhc0Vycm9yQ29udGV4dCE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9jdXJyZW50UGFkZGluZzogeyB0b3A6IG51bWJlcjsgcmlnaHQ6IG51bWJlcjsgYm90dG9tOiBudW1iZXI7IGxlZnQ6IG51bWJlciB9ID0geyB0b3A6IDAsIHJpZ2h0OiAwLCBib3R0b206IDAsIGxlZnQ6IDAgfTtcblxuXHRvdmVycmlkZSBnZXQgaW5wdXQoKTogQnJvd3NlckVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHN1cGVyLmlucHV0IGFzIEJyb3dzZXJFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEJyb3dzZXJFZGl0b3JJbnB1dC5FRElUT1JfSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIENyZWF0ZSBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSBmb3IgdGhpcyBlZGl0b3IgaW5zdGFuY2Vcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHBhcmVudCkpO1xuXG5cdFx0dGhpcy5faGFzVXJsQ29udGV4dCA9IENPTlRFWFRfQlJPV1NFUl9IQVNfVVJMLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzRXJyb3JDb250ZXh0ID0gQ09OVEVYVF9CUk9XU0VSX0hBU19FUlJPUi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gQ3VycmVudGx5IHRoaXMgaXMgYWx3YXlzIHRydWUgc2luY2UgaXQgaXMgc2NvcGVkIHRvIHRoZSBlZGl0b3IgY29udGFpbmVyXG5cdFx0Q09OVEVYVF9CUk9XU0VSX0ZPQ1VTRUQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIENyZWF0ZSBhIHNjb3BlZCBpbnN0YW50aWF0aW9uIHNlcnZpY2Ugc28gY29udHJpYnV0aW9ucyBnZXQgdGhlIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlXG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlXSlcblx0XHQpKTtcblxuXHRcdC8vIEluc3RhbnRpYXRlIGFsbCByZWdpc3RlcmVkIGNvbnRyaWJ1dGlvbnNcblx0XHRmb3IgKGNvbnN0IGN0b3Igb2YgQnJvd3NlckVkaXRvci5fY29udHJpYnV0aW9ucykge1xuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShjdG9yLCB0aGlzKSk7XG5cdFx0XHR0aGlzLl9jb250cmlidXRpb25JbnN0YW5jZXMuc2V0KGN0b3IsIGluc3RhbmNlKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgcm9vdCBjb250YWluZXJcblx0XHRjb25zdCByb290ID0gJCgnLmJyb3dzZXItcm9vdCcpO1xuXHRcdHJvb3QudGFiSW5kZXggPSAtMTsgLy8gQ2xpY2sgZm9jdXNhYmxlIChmb3Iga2Igc2hvcnRjdXRzKSwgYnV0IG5vdCBpbiB0YWIgb3JkZXJcblx0XHRwYXJlbnQuYXBwZW5kQ2hpbGQocm9vdCk7XG5cblx0XHQvLyBDb2xsZWN0IHdpZGdldHMgZnJvbSBhbGwgY29udHJpYnV0aW9ucywgZ3JvdXBlZCBieSBsb2NhdGlvbi5cblx0XHRjb25zdCB3aWRnZXRzQnlMb2NhdGlvbiA9IG5ldyBNYXA8QnJvd3NlcldpZGdldExvY2F0aW9uLCBJQnJvd3NlckVkaXRvcldpZGdldFtdPigpO1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbkluc3RhbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgY29udHJpYnV0aW9uLndpZGdldHMpIHtcblx0XHRcdFx0bGV0IGJ1Y2tldCA9IHdpZGdldHNCeUxvY2F0aW9uLmdldCh3aWRnZXQubG9jYXRpb24pO1xuXHRcdFx0XHRpZiAoIWJ1Y2tldCkge1xuXHRcdFx0XHRcdGJ1Y2tldCA9IFtdO1xuXHRcdFx0XHRcdHdpZGdldHNCeUxvY2F0aW9uLnNldCh3aWRnZXQubG9jYXRpb24sIGJ1Y2tldCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnVja2V0LnB1c2god2lkZ2V0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBidWNrZXQgb2Ygd2lkZ2V0c0J5TG9jYXRpb24udmFsdWVzKCkpIHtcblx0XHRcdGJ1Y2tldC5zb3J0KChhLCBiKSA9PiBhLm9yZGVyIC0gYi5vcmRlcik7XG5cdFx0fVxuXHRcdGNvbnN0IHdpZGdldHNBdCA9IChsb2NhdGlvbjogQnJvd3NlcldpZGdldExvY2F0aW9uKTogcmVhZG9ubHkgSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSA9PlxuXHRcdFx0d2lkZ2V0c0J5TG9jYXRpb24uZ2V0KGxvY2F0aW9uKSA/PyBbXTtcblxuXHRcdC8vIFRvb2xiYXIgd2lkZ2V0cyBcdTIwMTQgc3RhY2tlZCBhdCB0aGUgdG9wIG9mIHRoZSBlZGl0b3IuIFRoZSBuYXZiYXIgaXMgdGhlXG5cdFx0Ly8gZmlyc3QgdG9vbGJhciB3aWRnZXQgKG9yZGVyIDApOyBmaW5kL2VtdWxhdGlvbi9ldGMgZm9sbG93IGluIG9yZGVyLlxuXHRcdGZvciAoY29uc3Qgd2lkZ2V0IG9mIHdpZGdldHNBdChCcm93c2VyV2lkZ2V0TG9jYXRpb24uVG9vbGJhcikpIHtcblx0XHRcdHJvb3QuYXBwZW5kQ2hpbGQod2lkZ2V0LmVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBicm93c2VyIGNvbnRhaW5lciB3cmFwcGVyIChmbGV4IGl0ZW0gdGhhdCBmaWxscyByZW1haW5pbmcgc3BhY2UpXG5cdFx0dGhpcy5fYnJvd3NlckNvbnRhaW5lcldyYXBwZXIgPSAkKCcuYnJvd3Nlci1jb250YWluZXItd3JhcHBlcicpO1xuXHRcdHRoaXMuX2Jyb3dzZXJDb250YWluZXJXcmFwcGVyLnN0eWxlLnNldFByb3BlcnR5KCctLXpvb20tZmFjdG9yJywgU3RyaW5nKGdldFpvb21GYWN0b3IodGhpcy53aW5kb3cpKSk7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZCh0aGlzLl9icm93c2VyQ29udGFpbmVyV3JhcHBlcik7XG5cblx0XHQvLyBDcmVhdGUgYnJvd3NlciBjb250YWluZXIgKHN0dWIgZWxlbWVudCBmb3IgcG9zaXRpb25pbmcpXG5cdFx0dGhpcy5fYnJvd3NlckNvbnRhaW5lciA9ICQoJy5icm93c2VyLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX2Jyb3dzZXJDb250YWluZXIudGFiSW5kZXggPSAwOyAvLyBtYWtlIGZvY3VzYWJsZVxuXHRcdHRoaXMuX2Jyb3dzZXJDb250YWluZXJXcmFwcGVyLmFwcGVuZENoaWxkKHRoaXMuX2Jyb3dzZXJDb250YWluZXIpO1xuXG5cdFx0Ly8gTm90aWZ5IGNvbnRyaWJ1dGlvbnMgdGhhdCB0aGUgY29udGFpbmVyIERPTSBpcyByZWFkeS5cblx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiB0aGlzLl9jb250cmlidXRpb25JbnN0YW5jZXMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnRyaWJ1dGlvbi5vbkNvbnRhaW5lckNyZWF0ZWQodGhpcy5fYnJvd3NlckNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0Ly8gV3JhcHBlciBhcm91bmQgcGxhY2Vob2xkZXIgY29udGVudHMgZm9yIGJvcmRlciByYWRpdXMgY2xpcHBpbmcuIEhvbGRzXG5cdFx0Ly8gY29udHJpYnV0aW9uLXByb3ZpZGVkIGNvbnRlbnQgYXJlYSB3aWRnZXRzICh3ZWxjb21lIHBsYWNlaG9sZGVyLFxuXHRcdC8vIHBsYWNlaG9sZGVyIHNjcmVlbnNob3QsIG92ZXJsYXktcGF1c2UsIGVycm9yIG92ZXJsYXksIC4uLikuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXJDb250ZW50cyA9ICQoJy5icm93c2VyLXBsYWNlaG9sZGVyLWNvbnRlbnRzJyk7XG5cdFx0dGhpcy5fYnJvd3NlckNvbnRhaW5lci5hcHBlbmRDaGlsZChwbGFjZWhvbGRlckNvbnRlbnRzKTtcblxuXHRcdC8vIENvbnRhaW5lciB3aWRnZXRzIFx1MjAxNCBzdGFja2VkIGluc2lkZSB0aGUgcGxhY2Vob2xkZXIgYXJlYS5cblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB3aWRnZXRzQXQoQnJvd3NlcldpZGdldExvY2F0aW9uLkNvbnRlbnRBcmVhKSkge1xuXHRcdFx0cGxhY2Vob2xkZXJDb250ZW50cy5hcHBlbmRDaGlsZCh3aWRnZXQuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBjIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbkluc3RhbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGMudHJ5Rm9jdXMoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEZhbGxiYWNrIHdoZW4gbm8gY29udHJpYnV0aW9uIGNsYWltZWQgZm9jdXMgKGUuZy4gdGVzdHMpLlxuXHRcdHRoaXMuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBzZXRJbnB1dChpbnB1dDogQnJvd3NlckVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lucHV0RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGxldCBtb2RlbCA9IGlucHV0Lm1vZGVsO1xuXHRcdGNvbnN0IGlzTmV3ID0gIW1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRoaXMuX2hhc1VybENvbnRleHQuc2V0KCEhaW5wdXQudXJsKTtcblx0XHRcdHRoaXMuX2hhc0Vycm9yQ29udGV4dC5zZXQoZmFsc2UpO1xuXG5cdFx0XHQvLyBMZXQgY29udHJpYnV0aW9ucyByZW5kZXIgcGxhY2Vob2xkZXIgVUkgZnJvbSB0aGUgaW5wdXQncyBtZXRhZGF0YVxuXHRcdFx0Ly8gKGUuZy4gVVJMLCB0aXRsZSkgd2hpbGUgdGhlIG1vZGVsIGlzIGxvYWRpbmcuXG5cdFx0XHRmb3IgKGNvbnN0IGMgb2YgdGhpcy5fY29udHJpYnV0aW9uSW5zdGFuY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGMucHJlcmVuZGVySW5wdXQoaW5wdXQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBicm93c2VyIHZpZXcgbW9kZWwgZnJvbSB0aGUgaW5wdXRcblx0XHRcdG1vZGVsID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLmlucHV0ICE9PSBpbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5maXJlKHsgbW9kZWwsIGlzTmV3IH0pO1xuXG5cdFx0dGhpcy5faGFzVXJsQ29udGV4dC5zZXQoISFtb2RlbC51cmwpO1xuXHRcdHRoaXMuX2hhc0Vycm9yQ29udGV4dC5zZXQoISFtb2RlbC5lcnJvcik7XG5cblx0XHQvLyBXaGVuIGNsb3NpbmcgYSB0YWIsIHRoZSBtb2RlbCBnZXRzIGRpc3Bvc2VkIGJlZm9yZSB0aGUgZWRpdG9yIGlucHV0IGlzIGNsZWFyZWQuXG5cdFx0Ly8gU28gd2UgbWFrZSBzdXJlIHdlIGRvbid0IGtlZXAgYSByZWZlcmVuY2UgdG8gdGhlIGRpc3Bvc2VkIG1vZGVsLlxuXHRcdHRoaXMuX2lucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMuX21vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsID09PSBtb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9tb2RlbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5maXJlKHsgbW9kZWw6IHVuZGVmaW5lZCwgaXNOZXc6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2lucHV0RGlzcG9zYWJsZXMuYWRkKHRoaXMuX21vZGVsLm9uV2lsbE5hdmlnYXRlKCgpID0+IHtcblx0XHRcdHRoaXMuZ3JvdXAucGluRWRpdG9yKHRoaXMuaW5wdXQpOyAvLyBwaW4gZWRpdG9yIG9uIG5hdmlnYXRpb25cblx0XHRcdHRoaXMuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5faW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy5fbW9kZWwub25EaWROYXZpZ2F0ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmdyb3VwLnBpbkVkaXRvcih0aGlzLmlucHV0KTsgLy8gcGluIGVkaXRvciBvbiBuYXZpZ2F0aW9uXG5cdFx0XHR0aGlzLl9oYXNVcmxDb250ZXh0LnNldCghIW1vZGVsLnVybCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5faW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VMb2FkaW5nU3RhdGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5faGFzRXJyb3JDb250ZXh0LnNldCghIW1vZGVsLmVycm9yKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9pbnB1dERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZUZvY3VzKCh7IGZvY3VzZWQgfSkgPT4ge1xuXHRcdFx0Ly8gV2hlbiB0aGUgdmlldyBnZXRzIGZvY3VzZWQsIG1ha2Ugc3VyZSB0aGUgZWRpdG9yIHJlcG9ydHMgdGhhdCBpdCBoYXMgZm9jdXMsXG5cdFx0XHQvLyBidXQgZm9jdXMgaXMgcmVtb3ZlZCBmcm9tIHRoZSB3b3JrYmVuY2guXG5cdFx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZvY3VzPy5maXJlKCk7XG5cdFx0XHRcdHRoaXMuZW5zdXJlQnJvd3NlckZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciB3b3JrYmVuY2ggem9vbSBsZXZlbCBjaGFuZ2VzIGFuZCB1cGRhdGUgYnJvd3NlciB2aWV3IHBsYWNlaG9sZGVyIHNjcmVlbnNob3QncyB6b29tIGZhY3RvclxuXHRcdHRoaXMuX2lucHV0RGlzcG9zYWJsZXMuYWRkKG9uRGlkQ2hhbmdlWm9vbUxldmVsKHRhcmdldFdpbmRvd0lkID0+IHtcblx0XHRcdGlmICh0YXJnZXRXaW5kb3dJZCA9PT0gdGhpcy53aW5kb3cudnNjb2RlV2luZG93SWQpIHtcblx0XHRcdFx0Ly8gVXBkYXRlIENTUyB2YXJpYWJsZSBmb3Igc2l6ZSBjYWxjdWxhdGlvbnNcblx0XHRcdFx0dGhpcy5fYnJvd3NlckNvbnRhaW5lcldyYXBwZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tem9vbS1mYWN0b3InLCBTdHJpbmcoZ2V0Wm9vbUZhY3Rvcih0aGlzLndpbmRvdykpKTtcblx0XHRcdFx0Ly8gUmUtcHVzaCBjb250YWluZXIgYm91bmRzIGFuZCBlbXVsYXRpb246IHpvb20tZmFjdG9yIGFmZmVjdHNcblx0XHRcdFx0Ly8gYm90aCB0aGUgc2NyZWVuLXB4IGNvbnZlcnNpb24gaW4gbWFpbiBhbmQgdGhlIENocm9taXVtXG5cdFx0XHRcdC8vIGVtdWxhdGlvbiBzY2FsZSAoc28gdGhlIGVtdWxhdGVkIHZpZXdwb3J0IGZpbGxzIHRoZSBXQ1YpLlxuXHRcdFx0XHR0aGlzLmxheW91dEJyb3dzZXJDb250YWluZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmxheW91dCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldEVkaXRvclZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgYyBvZiB0aGlzLl9jb250cmlidXRpb25JbnN0YW5jZXMudmFsdWVzKCkpIHtcblx0XHRcdGMub25QYW5lVmlzaWJpbGl0eUNoYW5nZWQodmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1ha2UgdGhlIGJyb3dzZXIgY29udGFpbmVyIHRoZSBhY3RpdmUgZWxlbWVudCB3aXRob3V0IG1vdmluZyBmb2N1cyBmcm9tIHRoZSBicm93c2VyIHZpZXcuXG5cdCAqL1xuXHRlbnN1cmVCcm93c2VyRm9jdXMoKTogdm9pZCB7XG5cdFx0b3JpZ2luYWxIdG1sRWxlbWVudEZvY3VzLmNhbGwodGhpcy5fYnJvd3NlckNvbnRhaW5lcik7XG5cdFx0dGhpcy53aW5kb3cuZG9jdW1lbnQuZ2V0U2VsZWN0aW9uKCk/LnJlbW92ZUFsbFJhbmdlcygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsb3NlIHRoaXMgZWRpdG9yIHRhYiAoaS5lLiB0aGUgZWRpdG9yIGlucHV0IG93bmluZyB0aGUgY3VycmVudCBwYWdlKS5cblx0ICovXG5cdGNsb3NlVGFiKCk6IHZvaWQge1xuXHRcdHRoaXMuZ3JvdXA/LmNsb3NlRWRpdG9yKHRoaXMuaW5wdXQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGRpbWVuc2lvbj86IERpbWVuc2lvbiwgX3Bvc2l0aW9uPzogSURvbVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0aWYgKGRpbWVuc2lvbikge1xuXHRcdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgdGhpcy5fY29udHJpYnV0aW9uSW5zdGFuY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNvbnRyaWJ1dGlvbi5vblBhbmVSZXNpemVkKGRpbWVuc2lvbi53aWR0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCA9IHRoaXMubGF5b3V0U2VydmljZS53aGVuQ29udGFpbmVyU3R5bGVzTG9hZGVkKHRoaXMud2luZG93KTtcblx0XHRpZiAod2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZCkge1xuXHRcdFx0Ly8gSW4gZmxvYXRpbmcgd2luZG93cywgd2UgbmVlZCB0byBlbnN1cmUgdGhhdCB0aGVcblx0XHRcdC8vIGNvbnRhaW5lciBpcyByZWFkeSBmb3IgdXMgdG8gY29tcHV0ZSBjZXJ0YWluXG5cdFx0XHQvLyBsYXlvdXQgcmVsYXRlZCBwcm9wZXJ0aWVzLlxuXHRcdFx0d2hlbkNvbnRhaW5lclN0eWxlc0xvYWRlZC50aGVuKCgpID0+IHRoaXMubGF5b3V0QnJvd3NlckNvbnRhaW5lcigpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYXlvdXRCcm93c2VyQ29udGFpbmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29tcHV0ZSB0aGUgbGF5b3V0IG9mIHRoZSBicm93c2VyIGNvbnRhaW5lciBhbmQgcHVzaCB0aGUgcmVzdWx0aW5nXG5cdCAqIGJvdW5kcyArIGVtdWxhdGlvbiB0byB0aGUgcmVuZGVyZXIuIFNob3VsZCBnZW5lcmFsbHkgb25seSBiZSBjYWxsZWRcblx0ICogdmlhIHtAbGluayBsYXlvdXR9IHNvIHRoZSBjb250YWluZXIgaXMgZnVsbHkgc3R5bGVkIGZpcnN0LlxuXHQgKi9cblx0bGF5b3V0QnJvd3NlckNvbnRhaW5lcihyZXRyaWVzID0gMik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdmVycmlkZXM6IElDb250YWluZXJMYXlvdXRPdmVycmlkZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBjIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbkluc3RhbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgbyA9IGMuYmVmb3JlQ29udGFpbmVyTGF5b3V0KCk7XG5cdFx0XHRpZiAobykge1xuXHRcdFx0XHRvdmVycmlkZXMucHVzaChvKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUYWtlIHRoZSBwZXItc2lkZSBtYXggb2YgcGFkZGluZyBjb250cmlidXRpb25zIHNvIGVhY2ggcmVzZXJ2YXRpb24gaXNcblx0XHQvLyBob25vdXJlZCB3aXRob3V0IGRvdWJsZS1jb3VudGluZyBvdmVybGFwcGluZyB3aWRnZXRzLlxuXHRcdGNvbnN0IHBhZGRpbmcgPSB7IHRvcDogMCwgcmlnaHQ6IDAsIGJvdHRvbTogMCwgbGVmdDogMCB9O1xuXHRcdGZvciAoY29uc3QgbyBvZiBvdmVycmlkZXMpIHtcblx0XHRcdHBhZGRpbmcudG9wID0gTWF0aC5tYXgocGFkZGluZy50b3AsIG8ucGFkZGluZz8udG9wID8/IDApO1xuXHRcdFx0cGFkZGluZy5yaWdodCA9IE1hdGgubWF4KHBhZGRpbmcucmlnaHQsIG8ucGFkZGluZz8ucmlnaHQgPz8gMCk7XG5cdFx0XHRwYWRkaW5nLmJvdHRvbSA9IE1hdGgubWF4KHBhZGRpbmcuYm90dG9tLCBvLnBhZGRpbmc/LmJvdHRvbSA/PyAwKTtcblx0XHRcdHBhZGRpbmcubGVmdCA9IE1hdGgubWF4KHBhZGRpbmcubGVmdCwgby5wYWRkaW5nPy5sZWZ0ID8/IDApO1xuXHRcdH1cblx0XHR0aGlzLl9jdXJyZW50UGFkZGluZyA9IHBhZGRpbmc7XG5cblx0XHRjb25zdCB3cmFwcGVyUmVjdCA9IHRoaXMuX2Jyb3dzZXJDb250YWluZXJXcmFwcGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGlmICgod3JhcHBlclJlY3Qud2lkdGggPT09IDAgfHwgd3JhcHBlclJlY3QuaGVpZ2h0ID09PSAwKSAmJiByZXRyaWVzID4gMCkge1xuXHRcdFx0Ly8gV3JhcHBlciBub3QgbWVhc3VyZWQgeWV0OyByZXRyeSBvbiB0aGUgbmV4dCBmcmFtZS5cblx0XHRcdHRoaXMud2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB0aGlzLmxheW91dEJyb3dzZXJDb250YWluZXIocmV0cmllcyAtIDEpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDaGFpbiBjb21wdXRlIGNhbGxiYWNrcyBpbiBwcmlvcml0eSBvcmRlciBvdmVyIHRoZSBhcmVhIGF2YWlsYWJsZVxuXHRcdC8vIGFmdGVyIHBhZGRpbmcuIGxheW91dC50b3AvbGVmdCBhcmUgbG9jYWwgdG8gdGhlIGF2YWlsYWJsZSBhcmVhOyBwYW5lXG5cdFx0Ly8gaW5mbyBhbHNvIGNhcnJpZXMgdGhlIGFic29sdXRlIHNjcmVlbiBvcmlnaW4gc28gY29udHJpYnV0aW9ucyBjYW5cblx0XHQvLyByZWFzb24gYWJvdXQgcGl4ZWwgYWxpZ25tZW50LlxuXHRcdGNvbnN0IHBhbmVXaWR0aCA9IE1hdGgubWF4KDAsIHdyYXBwZXJSZWN0LndpZHRoIC0gcGFkZGluZy5sZWZ0IC0gcGFkZGluZy5yaWdodCk7XG5cdFx0Y29uc3QgcGFuZUhlaWdodCA9IE1hdGgubWF4KDAsIHdyYXBwZXJSZWN0LmhlaWdodCAtIHBhZGRpbmcudG9wIC0gcGFkZGluZy5ib3R0b20pO1xuXHRcdGNvbnN0IHBhbmU6IElDb250YWluZXJMYXlvdXRQYW5lID0ge1xuXHRcdFx0d2lkdGg6IHBhbmVXaWR0aCxcblx0XHRcdGhlaWdodDogcGFuZUhlaWdodCxcblx0XHRcdG9yaWdpblg6IHdyYXBwZXJSZWN0LmxlZnQgKyBwYWRkaW5nLmxlZnQsXG5cdFx0XHRvcmlnaW5ZOiB3cmFwcGVyUmVjdC50b3AgKyBwYWRkaW5nLnRvcCxcblx0XHR9O1xuXHRcdGNvbnN0IHNvcnRlZCA9IG92ZXJyaWRlcy5zbGljZSgpLnNvcnQoKGEsIGIpID0+IChhLnByaW9yaXR5ID8/IDApIC0gKGIucHJpb3JpdHkgPz8gMCkpO1xuXHRcdGxldCBsYXlvdXQ6IElDb250YWluZXJMYXlvdXQgPSB7IHdpZHRoOiBwYW5lV2lkdGgsIGhlaWdodDogcGFuZUhlaWdodCwgdG9wOiAwLCBsZWZ0OiAwIH07XG5cdFx0Zm9yIChjb25zdCBvIG9mIHNvcnRlZCkge1xuXHRcdFx0Y29uc3QgbmV4dCA9IG8uY29tcHV0ZT8uKGxheW91dCwgcGFuZSk7XG5cdFx0XHRpZiAobmV4dCkge1xuXHRcdFx0XHRsYXlvdXQgPSBuZXh0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxlZnQgPSBwYWRkaW5nLmxlZnQgKyAobGF5b3V0LmxlZnQgPz8gMCk7XG5cdFx0Y29uc3QgdG9wID0gcGFkZGluZy50b3AgKyAobGF5b3V0LnRvcCA/PyAwKTtcblxuXHRcdHRoaXMuX2Jyb3dzZXJDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtsYXlvdXQud2lkdGh9cHhgO1xuXHRcdHRoaXMuX2Jyb3dzZXJDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7bGF5b3V0LmhlaWdodH1weGA7XG5cdFx0dGhpcy5fYnJvd3NlckNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gYCR7bGVmdH1weGA7XG5cdFx0dGhpcy5fYnJvd3NlckNvbnRhaW5lci5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXG5cdFx0Y29uc3QgY29ybmVyUmFkaXVzID0gcGFyc2VGbG9hdCh0aGlzLndpbmRvdy5nZXRDb21wdXRlZFN0eWxlKHRoaXMuX2Jyb3dzZXJDb250YWluZXIpLmJvcmRlclRvcExlZnRSYWRpdXMgPz8gJzAnKTtcblx0XHR2b2lkIHRoaXMuX21vZGVsLmxheW91dCh7XG5cdFx0XHR3aW5kb3dJZDogdGhpcy5ncm91cC53aW5kb3dJZCxcblx0XHRcdHg6IHdyYXBwZXJSZWN0LmxlZnQgKyBsZWZ0LFxuXHRcdFx0eTogd3JhcHBlclJlY3QudG9wICsgdG9wLFxuXHRcdFx0d2lkdGg6IGxheW91dC53aWR0aCxcblx0XHRcdGhlaWdodDogbGF5b3V0LmhlaWdodCxcblx0XHRcdHpvb21GYWN0b3I6IGdldFpvb21GYWN0b3IodGhpcy53aW5kb3cpLFxuXHRcdFx0Y29ybmVyUmFkaXVzLFxuXHRcdFx0ZW11bGF0aW9uOiBsYXlvdXQuZW11bGF0aW9uLFxuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBjIG9mIHRoaXMuX2NvbnRyaWJ1dGlvbkluc3RhbmNlcy52YWx1ZXMoKSkge1xuXHRcdFx0Yy5hZnRlckNvbnRhaW5lckxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXcmFwcGVyIGNvbnRlbnQtYXJlYSBzaXplIGluIENTUyBweCBcdTIwMTQgdGhlIGFyZWEgYXZhaWxhYmxlIHRvIGxheW91dFxuXHQgKiBjb250cmlidXRpb25zIGFmdGVyIHRoZWlyIGFnZ3JlZ2F0ZWQgcGFkZGluZyBpcyBhcHBsaWVkLlxuXHQgKi9cblx0Z2V0IHBhbmVTaXplKCk6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgciA9IHRoaXMuX2Jyb3dzZXJDb250YWluZXJXcmFwcGVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHAgPSB0aGlzLl9jdXJyZW50UGFkZGluZztcblx0XHRyZXR1cm4ge1xuXHRcdFx0d2lkdGg6IE1hdGgubWF4KDAsIHIud2lkdGggLSBwLmxlZnQgLSBwLnJpZ2h0KSxcblx0XHRcdGhlaWdodDogTWF0aC5tYXgoMCwgci5oZWlnaHQgLSBwLnRvcCAtIHAuYm90dG9tKSxcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAodGhpcy5fbW9kZWwpIHtcblx0XHRcdHRoaXMuX21vZGVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbC5maXJlKHsgbW9kZWw6IHVuZGVmaW5lZCwgaXNOZXc6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hhc1VybENvbnRleHQucmVzZXQoKTtcblx0XHR0aGlzLl9oYXNFcnJvckNvbnRleHQucmVzZXQoKTtcblxuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQWtDO0FBRTNDLFNBQVMsZ0JBQTZCLGVBQWUsMEJBQTBCO0FBQy9FLFNBQVMsNkJBQW9FO0FBQzdFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsMEJBQTBCO0FBS25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBR2hDLFNBQVMsZUFBZSw0QkFBNEI7QUFDcEQsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHNCQUFzQjtBQUt4QixNQUFNLDBCQUEwQixJQUFJLGNBQXVCLGtCQUFrQixNQUFNLFNBQVMseUJBQXlCLHVDQUF1QyxDQUFDO0FBQzdKLE1BQU0sMEJBQTBCLElBQUksY0FBdUIsaUJBQWlCLE9BQU8sU0FBUyxrQkFBa0Isc0NBQXNDLENBQUM7QUFDckosTUFBTSw0QkFBNEIsSUFBSSxjQUF1Qixt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QVEsT0FBTyxRQUFRO0FBQzVDLFVBQU0sTUFBTSxRQUFRLE9BQU8sT0FBTyxPQUFPO0FBRXpDLFNBQUssa0JBQWtCLE1BQU0sUUFBUSxHQUFHLE9BQU8sS0FBSztBQUNwRCxTQUFLLGtCQUFrQixNQUFNLFNBQVMsR0FBRyxPQUFPLE1BQU07QUFDdEQsU0FBSyxrQkFBa0IsTUFBTSxPQUFPLEdBQUcsSUFBSTtBQUMzQyxTQUFLLGtCQUFrQixNQUFNLE1BQU0sR0FBRyxHQUFHO0FBRXpDLFVBQU0sZUFBZSxXQUFXLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxpQkFBaUIsRUFBRSx1QkFBdUIsR0FBRztBQUMvRyxTQUFLLEtBQUssT0FBTyxPQUFPO0FBQUEsTUFDdkIsVUFBVSxLQUFLLE1BQU07QUFBQSxNQUNyQixHQUFHLFlBQVksT0FBTztBQUFBLE1BQ3RCLEdBQUcsWUFBWSxNQUFNO0FBQUEsTUFDckIsT0FBTyxPQUFPO0FBQUEsTUFDZCxRQUFRLE9BQU87QUFBQSxNQUNmLFlBQVksY0FBYyxLQUFLLE1BQU07QUFBQSxNQUNyQztBQUFBLE1BQ0EsV0FBVyxPQUFPO0FBQUEsSUFDbkIsQ0FBQztBQUVELGVBQVcsS0FBSyxLQUFLLHVCQUF1QixPQUFPLEdBQUc7QUFDckQsUUFBRSxxQkFBcUI7QUFBQSxJQUN4QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsSUFBSSxXQUE4QztBQUNqRCxVQUFNLElBQUksS0FBSyx5QkFBeUIsc0JBQXNCO0FBQzlELFVBQU0sSUFBSSxLQUFLO0FBQ2YsV0FBTztBQUFBLE1BQ04sT0FBTyxLQUFLLElBQUksR0FBRyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsS0FBSztBQUFBLE1BQzdDLFFBQVEsS0FBSyxJQUFJLEdBQUcsRUFBRSxTQUFTLEVBQUUsTUFBTSxFQUFFLE1BQU07QUFBQSxJQUNoRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLGFBQW1CO0FBQzNCLFNBQUssa0JBQWtCLE1BQU07QUFFN0IsUUFBSSxLQUFLLFFBQVE7QUFDaEIsV0FBSyxTQUFTO0FBQ2QsV0FBSyxrQkFBa0IsS0FBSyxFQUFFLE9BQU8sUUFBVyxPQUFPLE1BQU0sQ0FBQztBQUFBLElBQy9EO0FBRUEsU0FBSyxlQUFlLE1BQU07QUFDMUIsU0FBSyxpQkFBaUIsTUFBTTtBQUU1QixVQUFNLFdBQVc7QUFBQSxFQUNsQjtBQUNEO0FBQUE7QUFsWGEsY0FJWSxpQkFBc0YsQ0FBQztBQUpuRyxnQkFBTjtBQUFBLEVBNkNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxEVTsiLAogICJuYW1lcyI6IFsiQnJvd3NlckFjdGlvbkdyb3VwIiwgIkJyb3dzZXJXaWRnZXRMb2NhdGlvbiJdCn0K
