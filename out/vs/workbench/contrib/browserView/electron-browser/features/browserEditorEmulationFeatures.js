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
import { $, addDisposableListener, EventType, getWindow } from "../../../../../base/browser/dom.js";
import { ActionBar } from "../../../../../base/browser/ui/actionbar/actionbar.js";
import { Orientation, OrthogonalEdge, Sash, SashState } from "../../../../../base/browser/ui/sash/sash.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { InputBox } from "../../../../../base/browser/ui/inputbox/inputBox.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { Action } from "../../../../../base/common/actions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IHoverService, WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { defaultInputBoxStyles, defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { BrowserEditor, BrowserEditorContribution, BrowserWidgetLocation, BROWSER_EDITOR_ACTIVE, BrowserActionCategory, BrowserActionGroup } from "../browserEditor.js";
const CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE = new RawContextKey(
  "browserEmulationToolbarVisible",
  false,
  localize("browser.emulationToolbarVisible", "Whether the browser emulation toolbar is visible")
);
const CONTEXT_BROWSER_EMULATION_IS_MOBILE = new RawContextKey(
  "browserEmulationIsMobile",
  false,
  localize("browser.emulationIsMobile", "Whether the browser emulation is in mobile mode")
);
const CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT = new RawContextKey(
  "browserEmulationHasUserAgent",
  false,
  localize("browser.emulationHasUserAgent", "Whether the browser emulation has a custom user agent")
);
const lastSettings = {
  device: void 0,
  scale: void 0
};
let BrowserEmulationToolbar = class extends Disposable {
  constructor(_feature, actionsContainer, hoverDelegate, contextViewService, hoverService) {
    super();
    this._feature = _feature;
    this._suppressChange = false;
    this._autoFitScale = 1;
    this.element = $(".browser-emulation-toolbar");
    this.element.style.display = "none";
    this._groupWrapper = $(".browser-emulation-toolbar-groups");
    this.element.appendChild(this._groupWrapper);
    const dimensions = this._appendGroup("dimensions");
    const dimensionsLabel = $("span.browser-emulation-toolbar-label");
    dimensionsLabel.textContent = localize("browser.device.dimensionsLabel", "Dimensions:");
    dimensions.appendChild(dimensionsLabel);
    this._widthInput = this._createNumberInput(dimensions, contextViewService, localize("browser.device.widthAriaLabel", "Viewport width"), 1, 9999);
    const swapDimensionsLabel = localize("browser.device.swapDimensionsTitle", "Swap Dimensions");
    this._swapDimensionsAction = this._register(new Action(
      "browser.device.swapDimensions",
      swapDimensionsLabel,
      ThemeIcon.asClassName(Codicon.arrowSwap),
      false,
      async () => this._feature.swapDimensions()
    ));
    const swapDimensionsBar = this._register(new ActionBar(dimensions, { hoverDelegate }));
    swapDimensionsBar.push(this._swapDimensionsAction, { icon: true, label: false });
    this._heightInput = this._createNumberInput(dimensions, contextViewService, localize("browser.device.heightAriaLabel", "Viewport height"), 1, 9999);
    const dprGroup = this._appendGroup("dpr");
    const dprLabel = $("span.browser-emulation-toolbar-label");
    dprLabel.textContent = localize("browser.device.dprLabel", "DPR:");
    this._register(hoverService.setupManagedHover(hoverDelegate, dprLabel, localize("browser.device.dprTitle", "Device pixel ratio (blank = system default)")));
    dprGroup.appendChild(dprLabel);
    this._dprInput = this._createNumberInput(dprGroup, contextViewService, localize("browser.device.dprAriaLabel", "Device pixel ratio"), 0, 8, "decimal");
    const zoomGroup = this._appendGroup("zoom");
    const zoomLabel = $("span.browser-emulation-toolbar-label");
    zoomLabel.textContent = localize("browser.device.scaleLabel", "Scale:");
    zoomGroup.appendChild(zoomLabel);
    this._zoom = this._register(new SelectBox(
      this._buildZoomOptions(),
      BrowserEmulationToolbar.AUTO_INDEX,
      contextViewService,
      defaultSelectBoxStyles,
      { ariaLabel: localize("browser.device.zoomAriaLabel", "Zoom factor") }
    ));
    this._zoom.render(zoomGroup);
    this.element.appendChild($(".browser-emulation-toolbar-spacer"));
    this.element.appendChild(actionsContainer);
    this._registerEvents();
  }
  _registerEvents() {
    const commitDims = () => this._onDimensionInput();
    const onEnterDims = (e) => {
      if (e.keyCode === KeyCode.Enter) {
        this._onDimensionInput();
      }
    };
    this._register(addDisposableListener(this._widthInput.inputElement, EventType.CHANGE, commitDims));
    this._register(addDisposableListener(this._heightInput.inputElement, EventType.CHANGE, commitDims));
    this._register(addDisposableListener(this._widthInput.inputElement, EventType.KEY_DOWN, onEnterDims));
    this._register(addDisposableListener(this._heightInput.inputElement, EventType.KEY_DOWN, onEnterDims));
    this._register(addDisposableListener(this._dprInput.inputElement, EventType.CHANGE, () => this._onDprInput()));
    this._register(addDisposableListener(this._dprInput.inputElement, EventType.KEY_DOWN, (e) => {
      if (e.keyCode === KeyCode.Enter) {
        this._onDprInput();
      }
    }));
    this._register(this._zoom.onDidSelect((e) => {
      const model = this._feature.model;
      if (this._suppressChange || !model?.device) {
        return;
      }
      const scale = e.index === BrowserEmulationToolbar.AUTO_INDEX ? void 0 : BrowserEmulationToolbar.ZOOM_PRESETS[e.index - 1];
      if (scale === this._feature.scale) {
        return;
      }
      this._feature.setScale(scale);
    }));
  }
  get isVisible() {
    return this.element.style.display !== "none";
  }
  show() {
    this.element.style.display = "";
  }
  hide() {
    this.element.style.display = "none";
  }
  setAutoFitScale(scale) {
    if (this._autoFitScale === scale) {
      return;
    }
    const oldPercent = Math.round(this._autoFitScale * 100);
    this._autoFitScale = scale;
    const newPercent = Math.round(scale * 100);
    if (oldPercent !== newPercent) {
      const wasSuppressed = this._suppressChange;
      this._suppressChange = true;
      try {
        this._zoom.setOptions(this._buildZoomOptions(), this._currentZoomIndex());
      } finally {
        this._suppressChange = wasSuppressed;
      }
    }
  }
  refresh() {
    this._writeInputs(this._feature.model?.device);
    this._updateZoom();
  }
  _writeInputs(device) {
    const width = device?.width;
    const height = device?.height;
    this._suppressChange = true;
    try {
      this._widthInput.value = width ? String(width) : "";
      this._heightInput.value = height ? String(height) : "";
      this._dprInput.value = device?.deviceScaleFactor ? String(device.deviceScaleFactor) : "";
    } finally {
      this._suppressChange = false;
    }
    this._swapDimensionsAction.enabled = !!width || !!height;
  }
  _appendGroup(name) {
    const group = $(`.browser-emulation-toolbar-group.browser-emulation-toolbar-${name}`);
    this._groupWrapper.appendChild(group);
    return group;
  }
  _buildZoomOptions() {
    return [
      { text: localize("browser.device.zoomAuto", "Auto ({0}%)", Math.round(this._autoFitScale * 100)) },
      ...BrowserEmulationToolbar.ZOOM_PRESETS.map((z) => ({ text: `${Math.round(z * 100)}%` }))
    ];
  }
  _currentZoomIndex() {
    const scale = this._feature.scale;
    if (scale === void 0) {
      return BrowserEmulationToolbar.AUTO_INDEX;
    }
    const idx = BrowserEmulationToolbar.ZOOM_PRESETS.findIndex((p) => Math.abs(p - scale) < 5e-3);
    return idx >= 0 ? idx + 1 : BrowserEmulationToolbar.AUTO_INDEX;
  }
  _updateZoom() {
    const wasSuppressed = this._suppressChange;
    this._suppressChange = true;
    try {
      this._zoom.select(this._currentZoomIndex());
      this._zoom.setEnabled(!!this._feature.model?.device);
    } finally {
      this._suppressChange = wasSuppressed;
    }
  }
  _onDimensionInput() {
    const model = this._feature.model;
    if (this._suppressChange || !model?.device) {
      return;
    }
    const parse = (raw) => {
      const trimmed = raw.trim();
      if (trimmed === "") {
        return void 0;
      }
      const n = Math.floor(Number(trimmed));
      if (!n || n <= 0) {
        return void 0;
      }
      return Math.max(1, Math.min(9999, n));
    };
    const width = parse(this._widthInput.value);
    const height = parse(this._heightInput.value);
    const device = model.device;
    if (device.width === width && device.height === height) {
      return;
    }
    void model.setDevice({ ...device, width, height });
  }
  _onDprInput() {
    const model = this._feature.model;
    if (this._suppressChange || !model?.device) {
      return;
    }
    const device = model.device;
    const raw = this._dprInput.value.trim();
    const next = raw === "" ? void 0 : Math.max(0, Math.min(8, Number(raw) || 0)) || void 0;
    if (device.deviceScaleFactor === next) {
      return;
    }
    void model.setDevice({ ...device, deviceScaleFactor: next });
  }
  _createNumberInput(parent, contextViewService, ariaLabel, min, max, inputMode = "numeric") {
    const container = $(".browser-emulation-toolbar-input");
    parent.appendChild(container);
    const input = this._register(new InputBox(container, contextViewService, {
      type: "number",
      ariaLabel,
      placeholder: localize("browser.device.inputPlaceholderAuto", "auto"),
      inputBoxStyles: defaultInputBoxStyles
    }));
    input.inputElement.min = String(min);
    input.inputElement.max = String(max);
    input.inputElement.inputMode = inputMode;
    if (inputMode === "decimal") {
      input.inputElement.step = "0.5";
    }
    return input;
  }
};
BrowserEmulationToolbar.ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];
BrowserEmulationToolbar.AUTO_INDEX = 0;
BrowserEmulationToolbar = __decorateClass([
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IHoverService)
], BrowserEmulationToolbar);
let BrowserEditorEmulationSupport = class extends BrowserEditorContribution {
  constructor(editor, contextKeyService, instantiationService) {
    super(editor);
    /** Scale Auto-fit would produce for the current device + pane. Drives the toolbar's "Auto (X%)" label. */
    this._autoFitScale = 1;
    this._onDidChangeScale = this._register(new Emitter());
    this._onDidChangeAutoFitScale = this._register(new Emitter());
    this._toolbarVisible = CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE.bindTo(contextKeyService);
    this._isMobile = CONTEXT_BROWSER_EMULATION_IS_MOBILE.bindTo(contextKeyService);
    this._hasUserAgent = CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT.bindTo(contextKeyService);
    const actionsContainer = $(".browser-emulation-toolbar-actions");
    const hoverDelegate = this._register(instantiationService.createInstance(
      WorkbenchHoverDelegate,
      "element",
      void 0,
      { position: { hoverPosition: HoverPosition.ABOVE } }
    ));
    const actionsToolbar = this._register(instantiationService.createInstance(
      MenuWorkbenchToolBar,
      actionsContainer,
      MenuId.BrowserEmulationToolbar,
      {
        hoverDelegate,
        highlightToggledItems: true,
        toolbarOptions: { primaryGroup: () => true },
        menuOptions: { shouldForwardArgs: true }
      }
    ));
    actionsToolbar.context = editor;
    this._toolbar = this._register(instantiationService.createInstance(BrowserEmulationToolbar, this, actionsContainer, hoverDelegate));
    this._register(this._onDidChangeScale.event(() => {
      this._toolbar.refresh();
      this.editor.layoutBrowserContainer();
    }));
    this._register(this._onDidChangeAutoFitScale.event((scale) => this._toolbar.setAutoFitScale(scale)));
  }
  // -- BrowserEditorContribution hooks ------------------------------------
  get widgets() {
    return [{ location: BrowserWidgetLocation.Toolbar, element: this._toolbar.element, order: 0 }];
  }
  onContainerCreated(container) {
    this._createResizeSashes(container);
    const observer = new (getWindow(container)).ResizeObserver(() => {
      this._eastSash?.layout();
      this._southSash?.layout();
    });
    observer.observe(container);
    this._register({ dispose: () => observer.disconnect() });
  }
  beforeContainerLayout() {
    if (!this.editor.model?.device) {
      return void 0;
    }
    return {
      // Reserve space for the east + south resize sashes that sit just outside the container.
      padding: { right: 16, bottom: 16 },
      compute: (_current, pane) => this._computeLayout(pane.width, pane.height),
      priority: 0
    };
  }
  _computeLayout(paneWidth, paneHeight) {
    const device = this.editor.model?.device;
    const width = device?.width;
    const height = device?.height;
    const fitScale = paneWidth > 0 && paneHeight > 0 ? Math.min(width ? paneWidth / width : 1, height ? paneHeight / height : 1, 1) : 1;
    if (this._autoFitScale !== fitScale) {
      this._autoFitScale = fitScale;
      this._onDidChangeAutoFitScale.fire(fitScale);
    }
    const scale = this._scale ?? fitScale;
    const layoutWidth = width ? Math.min(width * scale, paneWidth) : paneWidth;
    const layoutHeight = height ? Math.min(height * scale, paneHeight) : paneHeight;
    return {
      width: layoutWidth,
      height: layoutHeight,
      // Center the device within the available pane (the sash reservation
      // is already accounted for via padding).
      left: Math.max(0, (paneWidth - layoutWidth) / 2),
      top: Math.max(0, (paneHeight - layoutHeight) / 2),
      emulation: { scale }
    };
  }
  onModelAttached(model, store) {
    this._toolbar.refresh();
    this._syncContextKeys(model.device);
    this._updateSashState();
    this._setToolbarVisible(!!model.device);
    store.add(model.onDidChangeDevice((device) => {
      this._updateSashState();
      if (!device && this._scale !== void 0) {
        this.setScale(void 0);
      }
      if (device) {
        lastSettings.device = device;
      }
      this._toolbar.refresh();
      this._syncContextKeys(device);
      this._setToolbarVisible(!!device);
      this.editor.layoutBrowserContainer();
    }));
  }
  onModelDetached() {
    this._scale = void 0;
    this._toolbar.refresh();
    this._syncContextKeys(void 0);
    this._setToolbarVisible(false);
  }
  // -- Public API consumed by toolbar + actions --------------------------
  /** Current renderer-side scale; undefined = auto-fit. */
  get scale() {
    return this._scale;
  }
  /** Convenience accessor for the toolbar — proxies the editor's model. */
  get model() {
    return this.editor.model;
  }
  setScale(scale) {
    if (this._scale === scale) {
      return;
    }
    lastSettings.scale = scale;
    this._scale = scale;
    this._onDidChangeScale.fire(scale);
  }
  get isVisible() {
    return this._toolbar.isVisible;
  }
  /**
   * Toggle the toolbar. Entering toolbar mode engages device emulation
   * (responsive viewport, default device); exiting disables it.
   */
  setVisible(visible) {
    if (visible === this._toolbar.isVisible) {
      return;
    }
    const model = this.editor.model;
    if (visible) {
      if (model && !model.device) {
        void model.setDevice({ ...lastSettings.device });
        this.setScale(lastSettings.scale);
      }
      this._setToolbarVisible(true);
    } else {
      void model?.setDevice(void 0);
      this._setToolbarVisible(false);
    }
  }
  /** Apply a preset onto the current emulation, preserving the current scale. */
  applyPreset(preset) {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    void model.setDevice(preset.device ?? {});
  }
  /** Reset all device + scale overrides to defaults while keeping emulation engaged. */
  resetAll() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    void model.setDevice({});
    this.setScale(void 0);
  }
  /** Set the user agent on the current device. Empty / undefined = default. Engages emulation if not already active. */
  setUserAgent(userAgent) {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    const next = userAgent ? userAgent : void 0;
    const device = model.device;
    if (device?.userAgent === next) {
      return;
    }
    void model.setDevice({ ...device ?? {}, userAgent: next });
  }
  /** The current device's user agent, if any. */
  get userAgent() {
    return this.editor.model?.device?.userAgent;
  }
  /** Swap the current viewport's width and height. No-op without any fixed dim. */
  swapDimensions() {
    const model = this.editor.model;
    const device = model?.device;
    if (!model || !device || !device.width && !device.height) {
      return;
    }
    void model.setDevice({ ...device, width: device.height, height: device.width });
  }
  /** Flip the mobile flag on the current device (drives touch + pointer media). Engages emulation if not already active. */
  toggleMobile() {
    const model = this.editor.model;
    if (!model) {
      return;
    }
    const device = model.device;
    void model.setDevice({ ...device ?? {}, mobile: !device?.mobile });
  }
  // -- Internal helpers ---------------------------------------------------
  _syncContextKeys(device) {
    this._isMobile.set(!!device?.mobile);
    this._hasUserAgent.set(!!device?.userAgent);
  }
  _setToolbarVisible(visible) {
    if (visible === this._toolbar.isVisible) {
      return;
    }
    if (visible) {
      this._toolbar.show();
    } else {
      this._toolbar.hide();
    }
    this._toolbarVisible.set(visible);
    this.editor.layoutBrowserContainer();
  }
  _updateSashState() {
    const state = this.editor.model?.device ? SashState.Enabled : SashState.Disabled;
    if (this._eastSash) {
      this._eastSash.state = state;
    }
    if (this._southSash) {
      this._southSash.state = state;
    }
  }
  /**
   * Create east + south resize sashes (with an auto-managed south-east corner)
   * that drag the container to set explicit device dimensions. The container is
   * centered in the wrapper, so a pointer delta of N px equals 2*N px of growth.
   */
  _createResizeSashes(container) {
    const SASH_OFFSET = 6;
    const eastSash = this._register(new Sash(container, {
      getVerticalSashLeft: () => container.clientWidth + SASH_OFFSET,
      getVerticalSashTop: () => 0,
      getVerticalSashHeight: () => container.clientHeight
    }, { orientation: Orientation.VERTICAL, orthogonalEdge: OrthogonalEdge.South }));
    const southSash = this._register(new Sash(container, {
      getHorizontalSashTop: () => container.clientHeight + SASH_OFFSET,
      getHorizontalSashLeft: () => 0,
      getHorizontalSashWidth: () => container.clientWidth
    }, { orientation: Orientation.HORIZONTAL, orthogonalEdge: OrthogonalEdge.East }));
    southSash.orthogonalEndSash = eastSash;
    eastSash.orthogonalEndSash = southSash;
    this._eastSash = eastSash;
    this._southSash = southSash;
    this._updateSashState();
    let drag;
    const onStart = () => {
      const model = this.editor.model;
      if (!model || !model.device) {
        return;
      }
      const device = model.device;
      container.classList.add("browser-container--dragging");
      const pane = this.editor.paneSize;
      const containerRect = container.getBoundingClientRect();
      const fitScale = pane.width > 0 && pane.height > 0 ? Math.min(device.width ? pane.width / device.width : 1, device.height ? pane.height / device.height : 1, 1) : 1;
      const startScale = this._scale ?? fitScale;
      drag = {
        startContainerW: containerRect.width,
        startContainerH: containerRect.height,
        scale: Math.max(0.01, startScale),
        paneW: pane.width,
        paneH: pane.height
      };
    };
    const onChange = (axis, evt) => {
      if (!drag) {
        return;
      }
      const device = this.editor.model?.device ?? {};
      if (axis === "x") {
        const w = Math.max(50, Math.min(drag.paneW, drag.startContainerW + (evt.currentX - evt.startX) * 2));
        void this.editor.model?.setDevice({ ...device, width: Math.max(50, Math.round(w / drag.scale)) });
      } else {
        const h = Math.max(50, Math.min(drag.paneH, drag.startContainerH + (evt.currentY - evt.startY) * 2));
        void this.editor.model?.setDevice({ ...device, height: Math.max(50, Math.round(h / drag.scale)) });
      }
    };
    const onEnd = () => {
      if (!drag) {
        return;
      }
      container.classList.remove("browser-container--dragging");
      drag = void 0;
    };
    this._register(eastSash.onDidStart(onStart));
    this._register(southSash.onDidStart(onStart));
    this._register(eastSash.onDidChange((evt) => onChange("x", evt)));
    this._register(southSash.onDidChange((evt) => onChange("y", evt)));
    this._register(eastSash.onDidEnd(onEnd));
    this._register(southSash.onDidEnd(onEnd));
    this._register(eastSash.onDidReset(() => this._resetAxis("x")));
    this._register(southSash.onDidReset(() => this._resetAxis("y")));
  }
  _resetAxis(axis) {
    const model = this.editor.model;
    if (!model?.device) {
      return;
    }
    const device = model.device;
    void model.setDevice(axis === "x" ? { ...device, width: void 0 } : { ...device, height: void 0 });
  }
};
BrowserEditorEmulationSupport = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IInstantiationService)
], BrowserEditorEmulationSupport);
BrowserEditor.registerContribution(BrowserEditorEmulationSupport);
const _ToggleBrowserEmulationAction = class _ToggleBrowserEmulationAction extends Action2 {
  constructor() {
    super({
      id: _ToggleBrowserEmulationAction.ID,
      title: localize2("browser.toggleDeviceEmulation", "Device Emulation"),
      category: BrowserActionCategory,
      icon: Codicon.deviceMobile,
      f1: true,
      toggled: CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE,
      precondition: BROWSER_EDITOR_ACTIVE,
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Tools,
        order: 3,
        isHiddenByDefault: true
      }
    });
  }
  run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      const support = browserEditor.getContribution(BrowserEditorEmulationSupport);
      support?.setVisible(!support.isVisible);
    }
  }
};
_ToggleBrowserEmulationAction.ID = "workbench.action.browser.toggleDeviceEmulation";
let ToggleBrowserEmulationAction = _ToggleBrowserEmulationAction;
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
  command: {
    id: ToggleBrowserEmulationAction.ID,
    title: localize("browser.emulationToolbar.close", "Close"),
    icon: Codicon.close
  },
  order: 100
});
const _ToggleBrowserMobileEmulationAction = class _ToggleBrowserMobileEmulationAction extends Action2 {
  constructor() {
    super({
      id: _ToggleBrowserMobileEmulationAction.ID,
      title: localize2("browser.toggleMobileEmulation", "Toggle Mobile Emulation"),
      category: BrowserActionCategory,
      icon: Codicon.deviceMobile,
      f1: true,
      toggled: CONTEXT_BROWSER_EMULATION_IS_MOBILE,
      precondition: BROWSER_EDITOR_ACTIVE
    });
  }
  run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserEditorEmulationSupport)?.toggleMobile();
    }
  }
};
_ToggleBrowserMobileEmulationAction.ID = "workbench.action.browser.toggleMobileEmulation";
let ToggleBrowserMobileEmulationAction = _ToggleBrowserMobileEmulationAction;
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
  command: {
    id: ToggleBrowserMobileEmulationAction.ID,
    title: localize("browser.emulationToolbar.mobile", "Mobile Emulation"),
    icon: Codicon.deviceMobile,
    toggled: CONTEXT_BROWSER_EMULATION_IS_MOBILE
  },
  order: 20
});
const DEFAULT_BROWSER_DEVICE_PRESETS = [
  {
    name: "iPhone 15 Pro",
    device: { width: 393, height: 852, mobile: true, deviceScaleFactor: 3, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
  },
  {
    name: "iPhone SE",
    device: { width: 375, height: 667, mobile: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
  },
  {
    name: "Pixel 8",
    device: { width: 412, height: 915, mobile: true, deviceScaleFactor: 2.625, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36" }
  },
  {
    name: "iPad Mini",
    device: { width: 768, height: 1024, mobile: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
  }
];
const _PickBrowserDevicePresetAction = class _PickBrowserDevicePresetAction extends Action2 {
  constructor() {
    super({
      id: _PickBrowserDevicePresetAction.ID,
      title: localize2("browser.pickDevicePreset", "Emulate Device..."),
      category: BrowserActionCategory,
      icon: Codicon.library,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (!(browserEditor instanceof BrowserEditor)) {
      return;
    }
    const support = browserEditor.getContribution(BrowserEditorEmulationSupport);
    if (!support) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const items = DEFAULT_BROWSER_DEVICE_PRESETS.map((p) => ({
      label: p.name,
      description: p.device?.width && p.device?.height ? `${p.device.width}\xD7${p.device.height}${p.device?.mobile ? ` \u2022 ${localize("browser.devicePresets.mobileTag", "mobile")}` : ""}` : void 0,
      preset: p
    }));
    const picked = await quickInputService.pick(items, {
      placeHolder: localize("browser.devicePresets.placeholder", "Select a device preset"),
      matchOnDescription: true
    });
    if (picked) {
      support.applyPreset(picked.preset);
    }
  }
};
_PickBrowserDevicePresetAction.ID = "workbench.action.browser.pickDevicePreset";
let PickBrowserDevicePresetAction = _PickBrowserDevicePresetAction;
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
  command: {
    id: PickBrowserDevicePresetAction.ID,
    title: localize("browser.emulationToolbar.presets", "Apply Preset..."),
    icon: Codicon.library
  },
  order: 5
});
const _SetBrowserUserAgentAction = class _SetBrowserUserAgentAction extends Action2 {
  constructor() {
    super({
      id: _SetBrowserUserAgentAction.ID,
      title: localize2("browser.setUserAgent", "Emulate User Agent..."),
      category: BrowserActionCategory,
      icon: Codicon.tag,
      f1: true,
      toggled: CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT,
      precondition: BROWSER_EDITOR_ACTIVE
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (!(browserEditor instanceof BrowserEditor)) {
      return;
    }
    const support = browserEditor.getContribution(BrowserEditorEmulationSupport);
    if (!support) {
      return;
    }
    const quickInputService = accessor.get(IQuickInputService);
    const value = await quickInputService.input({
      prompt: localize("browser.userAgent.prompt", "User agent string (leave empty for VS Code default)"),
      value: support.userAgent ?? ""
    });
    if (value === void 0) {
      return;
    }
    support.setUserAgent(value.trim() || void 0);
  }
};
_SetBrowserUserAgentAction.ID = "workbench.action.browser.setUserAgent";
let SetBrowserUserAgentAction = _SetBrowserUserAgentAction;
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
  command: {
    id: SetBrowserUserAgentAction.ID,
    title: localize("browser.emulationToolbar.userAgent", "Set User Agent..."),
    icon: Codicon.tag,
    toggled: CONTEXT_BROWSER_EMULATION_HAS_USER_AGENT
  },
  order: 6
});
const _ResetBrowserEmulationAction = class _ResetBrowserEmulationAction extends Action2 {
  constructor() {
    super({
      id: _ResetBrowserEmulationAction.ID,
      title: localize2("browser.resetEmulation", "Reset Emulation"),
      category: BrowserActionCategory,
      icon: Codicon.discard,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_EMULATION_TOOLBAR_VISIBLE)
    });
  }
  run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserEditorEmulationSupport)?.resetAll();
    }
  }
};
_ResetBrowserEmulationAction.ID = "workbench.action.browser.resetEmulation";
let ResetBrowserEmulationAction = _ResetBrowserEmulationAction;
MenuRegistry.appendMenuItem(MenuId.BrowserEmulationToolbar, {
  command: {
    id: ResetBrowserEmulationAction.ID,
    title: localize("browser.emulationToolbar.reset", "Reset"),
    icon: Codicon.discard
  },
  order: 90
});
registerAction2(ToggleBrowserEmulationAction);
registerAction2(PickBrowserDevicePresetAction);
registerAction2(SetBrowserUserAgentAction);
registerAction2(ToggleBrowserMobileEmulationAction);
registerAction2(ResetBrowserEmulationAction);
export {
  BrowserEditorEmulationSupport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFxmZWF0dXJlc1xcYnJvd3NlckVkaXRvckVtdWxhdGlvbkZlYXR1cmVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGdldFdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBJU2FzaEV2ZW50LCBPcmllbnRhdGlvbiwgT3J0aG9nb25hbEVkZ2UsIFNhc2gsIFNhc2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJbnB1dEJveCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBTZWxlY3RCb3ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VsZWN0Qm94L3NlbGVjdEJveC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElCcm93c2VyRGV2aWNlUHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSwgV29ya2JlbmNoSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsIGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUJyb3dzZXJWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvciwgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiwgQnJvd3NlcldpZGdldExvY2F0aW9uLCBJQnJvd3NlckVkaXRvcldpZGdldCwgSUNvbnRhaW5lckxheW91dCwgSUNvbnRhaW5lckxheW91dE92ZXJyaWRlLCBCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIEJyb3dzZXJBY3Rpb25DYXRlZ29yeSwgQnJvd3NlckFjdGlvbkdyb3VwIH0gZnJvbSAnLi4vYnJvd3NlckVkaXRvci5qcyc7XG5cbmNvbnN0IENPTlRFWFRfQlJPV1NFUl9FTVVMQVRJT05fVE9PTEJBUl9WSVNJQkxFID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oXG5cdCdicm93c2VyRW11bGF0aW9uVG9vbGJhclZpc2libGUnLFxuXHRmYWxzZSxcblx0bG9jYWxpemUoJ2Jyb3dzZXIuZW11bGF0aW9uVG9vbGJhclZpc2libGUnLCBcIldoZXRoZXIgdGhlIGJyb3dzZXIgZW11bGF0aW9uIHRvb2xiYXIgaXMgdmlzaWJsZVwiKVxuKTtcblxuY29uc3QgQ09OVEVYVF9CUk9XU0VSX0VNVUxBVElPTl9JU19NT0JJTEUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihcblx0J2Jyb3dzZXJFbXVsYXRpb25Jc01vYmlsZScsXG5cdGZhbHNlLFxuXHRsb2NhbGl6ZSgnYnJvd3Nlci5lbXVsYXRpb25Jc01vYmlsZScsIFwiV2hldGhlciB0aGUgYnJvd3NlciBlbXVsYXRpb24gaXMgaW4gbW9iaWxlIG1vZGVcIilcbik7XG5cbmNvbnN0IENPTlRFWFRfQlJPV1NFUl9FTVVMQVRJT05fSEFTX1VTRVJfQUdFTlQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihcblx0J2Jyb3dzZXJFbXVsYXRpb25IYXNVc2VyQWdlbnQnLFxuXHRmYWxzZSxcblx0bG9jYWxpemUoJ2Jyb3dzZXIuZW11bGF0aW9uSGFzVXNlckFnZW50JywgXCJXaGV0aGVyIHRoZSBicm93c2VyIGVtdWxhdGlvbiBoYXMgYSBjdXN0b20gdXNlciBhZ2VudFwiKVxuKTtcblxuLyoqXG4gKiBBIG5hbWVkIGRldmljZSBwcmVzZXQuIEFwcGx5aW5nIGEgcHJlc2V0IHN0YW1wcyBpdHMgYGRldmljZWAgKGluY2x1ZGluZ1xuICogYW55IGVtYmVkZGVkIHZpZXdwb3J0IHdpZHRoL2hlaWdodCkgb250byB0aGUgYWN0aXZlIGRldmljZSBwcm9maWxlLCB3aGlsZVxuICogcHJlc2VydmluZyB0aGUgdXNlcidzIGN1cnJlbnQgc2NhbGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUJyb3dzZXJEZXZpY2VQcmVzZXQge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRldmljZT86IElCcm93c2VyRGV2aWNlUHJvZmlsZTtcbn1cblxuLyoqXG4gKiBLZWVwIHRyYWNrIG9mIHRoZSBsYXN0IHVzZWQgZGV2aWNlICsgc2NhbGUgc28gd2UgY2FuIHJlc3RvcmUgdGhlbSB3aGVuIHRoZVxuICogdG9vbGJhciBpcyByZW9wZW5lZC4gTm90ZSB0aGlzIGlzbid0IChjdXJyZW50bHkpIHBlcnNpc3RlZCBpbiBzdG9yYWdlLlxuICovXG5jb25zdCBsYXN0U2V0dGluZ3MgPSB7XG5cdGRldmljZTogdW5kZWZpbmVkIGFzIElCcm93c2VyRGV2aWNlUHJvZmlsZSB8IHVuZGVmaW5lZCxcblx0c2NhbGU6IHVuZGVmaW5lZCBhcyBudW1iZXIgfCB1bmRlZmluZWQsXG59O1xuXG4vKipcbiAqIFRvb2xiYXIgc2hvd24gYWJvdmUgdGhlIGJyb3dzZXIgdmlld3BvcnQgd2l0aCBkZXZpY2UgZW11bGF0aW9uIGNvbnRyb2xzXG4gKiAoZGltZW5zaW9ucywgRFBSLCB6b29tLCBhbmQgYW4gYWN0aW9uIHRvb2xiYXIgZm9yIHByZXNldHMgLyBVQSAvIG1vYmlsZSAvIGNsb3NlKS5cbiAqL1xuY2xhc3MgQnJvd3NlckVtdWxhdGlvblRvb2xiYXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBXcmFwcGVyOiBIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aWR0aElucHV0OiBJbnB1dEJveDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGVpZ2h0SW5wdXQ6IElucHV0Qm94O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zd2FwRGltZW5zaW9uc0FjdGlvbjogQWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kcHJJbnB1dDogSW5wdXRCb3g7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3pvb206IFNlbGVjdEJveDtcblxuXHRwcml2YXRlIF9zdXBwcmVzc0NoYW5nZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9hdXRvRml0U2NhbGUgPSAxO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFpPT01fUFJFU0VUUyA9IFswLjUsIDAuNzUsIDEsIDEuMjUsIDEuNSwgMl07XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEFVVE9fSU5ERVggPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2ZlYXR1cmU6IEJyb3dzZXJFZGl0b3JFbXVsYXRpb25TdXBwb3J0LFxuXHRcdGFjdGlvbnNDb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSAkKCcuYnJvd3Nlci1lbXVsYXRpb24tdG9vbGJhcicpO1xuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0dGhpcy5fZ3JvdXBXcmFwcGVyID0gJCgnLmJyb3dzZXItZW11bGF0aW9uLXRvb2xiYXItZ3JvdXBzJyk7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX2dyb3VwV3JhcHBlcik7XG5cblx0XHRjb25zdCBkaW1lbnNpb25zID0gdGhpcy5fYXBwZW5kR3JvdXAoJ2RpbWVuc2lvbnMnKTtcblx0XHRjb25zdCBkaW1lbnNpb25zTGFiZWwgPSAkKCdzcGFuLmJyb3dzZXItZW11bGF0aW9uLXRvb2xiYXItbGFiZWwnKTtcblx0XHRkaW1lbnNpb25zTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnYnJvd3Nlci5kZXZpY2UuZGltZW5zaW9uc0xhYmVsJywgXCJEaW1lbnNpb25zOlwiKTtcblx0XHRkaW1lbnNpb25zLmFwcGVuZENoaWxkKGRpbWVuc2lvbnNMYWJlbCk7XG5cdFx0dGhpcy5fd2lkdGhJbnB1dCA9IHRoaXMuX2NyZWF0ZU51bWJlcklucHV0KGRpbWVuc2lvbnMsIGNvbnRleHRWaWV3U2VydmljZSwgbG9jYWxpemUoJ2Jyb3dzZXIuZGV2aWNlLndpZHRoQXJpYUxhYmVsJywgXCJWaWV3cG9ydCB3aWR0aFwiKSwgMSwgOTk5OSk7XG5cblx0XHRjb25zdCBzd2FwRGltZW5zaW9uc0xhYmVsID0gbG9jYWxpemUoJ2Jyb3dzZXIuZGV2aWNlLnN3YXBEaW1lbnNpb25zVGl0bGUnLCBcIlN3YXAgRGltZW5zaW9uc1wiKTtcblx0XHR0aGlzLl9zd2FwRGltZW5zaW9uc0FjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oXG5cdFx0XHQnYnJvd3Nlci5kZXZpY2Uuc3dhcERpbWVuc2lvbnMnLFxuXHRcdFx0c3dhcERpbWVuc2lvbnNMYWJlbCxcblx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmFycm93U3dhcCksXG5cdFx0XHRmYWxzZSxcblx0XHRcdGFzeW5jICgpID0+IHRoaXMuX2ZlYXR1cmUuc3dhcERpbWVuc2lvbnMoKVxuXHRcdCkpO1xuXHRcdGNvbnN0IHN3YXBEaW1lbnNpb25zQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihkaW1lbnNpb25zLCB7IGhvdmVyRGVsZWdhdGUgfSkpO1xuXHRcdHN3YXBEaW1lbnNpb25zQmFyLnB1c2godGhpcy5fc3dhcERpbWVuc2lvbnNBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5faGVpZ2h0SW5wdXQgPSB0aGlzLl9jcmVhdGVOdW1iZXJJbnB1dChkaW1lbnNpb25zLCBjb250ZXh0Vmlld1NlcnZpY2UsIGxvY2FsaXplKCdicm93c2VyLmRldmljZS5oZWlnaHRBcmlhTGFiZWwnLCBcIlZpZXdwb3J0IGhlaWdodFwiKSwgMSwgOTk5OSk7XG5cblx0XHQvLyBEUFIgb3ZlcnJpZGUuIEJsYW5rIC8gMCA9IHN5c3RlbSBEUFIuXG5cdFx0Y29uc3QgZHByR3JvdXAgPSB0aGlzLl9hcHBlbmRHcm91cCgnZHByJyk7XG5cdFx0Y29uc3QgZHByTGFiZWwgPSAkKCdzcGFuLmJyb3dzZXItZW11bGF0aW9uLXRvb2xiYXItbGFiZWwnKTtcblx0XHRkcHJMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdicm93c2VyLmRldmljZS5kcHJMYWJlbCcsIFwiRFBSOlwiKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZSwgZHByTGFiZWwsIGxvY2FsaXplKCdicm93c2VyLmRldmljZS5kcHJUaXRsZScsIFwiRGV2aWNlIHBpeGVsIHJhdGlvIChibGFuayA9IHN5c3RlbSBkZWZhdWx0KVwiKSkpO1xuXHRcdGRwckdyb3VwLmFwcGVuZENoaWxkKGRwckxhYmVsKTtcblx0XHR0aGlzLl9kcHJJbnB1dCA9IHRoaXMuX2NyZWF0ZU51bWJlcklucHV0KGRwckdyb3VwLCBjb250ZXh0Vmlld1NlcnZpY2UsIGxvY2FsaXplKCdicm93c2VyLmRldmljZS5kcHJBcmlhTGFiZWwnLCBcIkRldmljZSBwaXhlbCByYXRpb1wiKSwgMCwgOCwgJ2RlY2ltYWwnKTtcblxuXHRcdGNvbnN0IHpvb21Hcm91cCA9IHRoaXMuX2FwcGVuZEdyb3VwKCd6b29tJyk7XG5cdFx0Y29uc3Qgem9vbUxhYmVsID0gJCgnc3Bhbi5icm93c2VyLWVtdWxhdGlvbi10b29sYmFyLWxhYmVsJyk7XG5cdFx0em9vbUxhYmVsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2Jyb3dzZXIuZGV2aWNlLnNjYWxlTGFiZWwnLCBcIlNjYWxlOlwiKTtcblx0XHR6b29tR3JvdXAuYXBwZW5kQ2hpbGQoem9vbUxhYmVsKTtcblx0XHR0aGlzLl96b29tID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNlbGVjdEJveChcblx0XHRcdHRoaXMuX2J1aWxkWm9vbU9wdGlvbnMoKSxcblx0XHRcdEJyb3dzZXJFbXVsYXRpb25Ub29sYmFyLkFVVE9fSU5ERVgsXG5cdFx0XHRjb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHRkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLFxuXHRcdFx0eyBhcmlhTGFiZWw6IGxvY2FsaXplKCdicm93c2VyLmRldmljZS56b29tQXJpYUxhYmVsJywgXCJab29tIGZhY3RvclwiKSB9XG5cdFx0KSk7XG5cdFx0dGhpcy5fem9vbS5yZW5kZXIoem9vbUdyb3VwKTtcblxuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCcuYnJvd3Nlci1lbXVsYXRpb24tdG9vbGJhci1zcGFjZXInKSk7XG5cblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoYWN0aW9uc0NvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlckV2ZW50cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJFdmVudHMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbWl0RGltcyA9ICgpID0+IHRoaXMuX29uRGltZW5zaW9uSW5wdXQoKTtcblx0XHRjb25zdCBvbkVudGVyRGltcyA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdHRoaXMuX29uRGltZW5zaW9uSW5wdXQoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl93aWR0aElucHV0LmlucHV0RWxlbWVudCwgRXZlbnRUeXBlLkNIQU5HRSwgY29tbWl0RGltcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9oZWlnaHRJbnB1dC5pbnB1dEVsZW1lbnQsIEV2ZW50VHlwZS5DSEFOR0UsIGNvbW1pdERpbXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fd2lkdGhJbnB1dC5pbnB1dEVsZW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgb25FbnRlckRpbXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faGVpZ2h0SW5wdXQuaW5wdXRFbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIG9uRW50ZXJEaW1zKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZHBySW5wdXQuaW5wdXRFbGVtZW50LCBFdmVudFR5cGUuQ0hBTkdFLCAoKSA9PiB0aGlzLl9vbkRwcklucHV0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZHBySW5wdXQuaW5wdXRFbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdHRoaXMuX29uRHBySW5wdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl96b29tLm9uRGlkU2VsZWN0KGUgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9mZWF0dXJlLm1vZGVsO1xuXHRcdFx0aWYgKHRoaXMuX3N1cHByZXNzQ2hhbmdlIHx8ICFtb2RlbD8uZGV2aWNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNjYWxlID0gZS5pbmRleCA9PT0gQnJvd3NlckVtdWxhdGlvblRvb2xiYXIuQVVUT19JTkRFWFxuXHRcdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0XHQ6IEJyb3dzZXJFbXVsYXRpb25Ub29sYmFyLlpPT01fUFJFU0VUU1tlLmluZGV4IC0gMV07XG5cdFx0XHRpZiAoc2NhbGUgPT09IHRoaXMuX2ZlYXR1cmUuc2NhbGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZmVhdHVyZS5zZXRTY2FsZShzY2FsZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdH1cblxuXHRzZXRBdXRvRml0U2NhbGUoc2NhbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hdXRvRml0U2NhbGUgPT09IHNjYWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9sZFBlcmNlbnQgPSBNYXRoLnJvdW5kKHRoaXMuX2F1dG9GaXRTY2FsZSAqIDEwMCk7XG5cdFx0dGhpcy5fYXV0b0ZpdFNjYWxlID0gc2NhbGU7XG5cdFx0Y29uc3QgbmV3UGVyY2VudCA9IE1hdGgucm91bmQoc2NhbGUgKiAxMDApO1xuXHRcdGlmIChvbGRQZXJjZW50ICE9PSBuZXdQZXJjZW50KSB7XG5cdFx0XHQvLyBzZXRPcHRpb25zIHJlYnVpbGRzIDxzZWxlY3Q+OyBrZWVwIGl0IHJhcmUgdG8gYXZvaWQgZm9jdXMgbG9zcy5cblx0XHRcdGNvbnN0IHdhc1N1cHByZXNzZWQgPSB0aGlzLl9zdXBwcmVzc0NoYW5nZTtcblx0XHRcdHRoaXMuX3N1cHByZXNzQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3pvb20uc2V0T3B0aW9ucyh0aGlzLl9idWlsZFpvb21PcHRpb25zKCksIHRoaXMuX2N1cnJlbnRab29tSW5kZXgoKSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9zdXBwcmVzc0NoYW5nZSA9IHdhc1N1cHByZXNzZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVmcmVzaCgpOiB2b2lkIHtcblx0XHR0aGlzLl93cml0ZUlucHV0cyh0aGlzLl9mZWF0dXJlLm1vZGVsPy5kZXZpY2UpO1xuXHRcdHRoaXMuX3VwZGF0ZVpvb20oKTtcblx0fVxuXG5cdHByaXZhdGUgX3dyaXRlSW5wdXRzKGRldmljZTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkdGggPSBkZXZpY2U/LndpZHRoO1xuXHRcdGNvbnN0IGhlaWdodCA9IGRldmljZT8uaGVpZ2h0O1xuXHRcdHRoaXMuX3N1cHByZXNzQ2hhbmdlID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fd2lkdGhJbnB1dC52YWx1ZSA9IHdpZHRoID8gU3RyaW5nKHdpZHRoKSA6ICcnO1xuXHRcdFx0dGhpcy5faGVpZ2h0SW5wdXQudmFsdWUgPSBoZWlnaHQgPyBTdHJpbmcoaGVpZ2h0KSA6ICcnO1xuXHRcdFx0dGhpcy5fZHBySW5wdXQudmFsdWUgPSBkZXZpY2U/LmRldmljZVNjYWxlRmFjdG9yID8gU3RyaW5nKGRldmljZS5kZXZpY2VTY2FsZUZhY3RvcikgOiAnJztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3VwcHJlc3NDaGFuZ2UgPSBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fc3dhcERpbWVuc2lvbnNBY3Rpb24uZW5hYmxlZCA9ICEhd2lkdGggfHwgISFoZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBlbmRHcm91cChuYW1lOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgZ3JvdXAgPSAkKGAuYnJvd3Nlci1lbXVsYXRpb24tdG9vbGJhci1ncm91cC5icm93c2VyLWVtdWxhdGlvbi10b29sYmFyLSR7bmFtZX1gKTtcblx0XHR0aGlzLl9ncm91cFdyYXBwZXIuYXBwZW5kQ2hpbGQoZ3JvdXApO1xuXHRcdHJldHVybiBncm91cDtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkWm9vbU9wdGlvbnMoKTogeyB0ZXh0OiBzdHJpbmcgfVtdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0eyB0ZXh0OiBsb2NhbGl6ZSgnYnJvd3Nlci5kZXZpY2Uuem9vbUF1dG8nLCBcIkF1dG8gKHswfSUpXCIsIE1hdGgucm91bmQodGhpcy5fYXV0b0ZpdFNjYWxlICogMTAwKSkgfSxcblx0XHRcdC4uLkJyb3dzZXJFbXVsYXRpb25Ub29sYmFyLlpPT01fUFJFU0VUUy5tYXAoeiA9PiAoeyB0ZXh0OiBgJHtNYXRoLnJvdW5kKHogKiAxMDApfSVgIH0pKSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3VycmVudFpvb21JbmRleCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHNjYWxlID0gdGhpcy5fZmVhdHVyZS5zY2FsZTtcblx0XHRpZiAoc2NhbGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIEJyb3dzZXJFbXVsYXRpb25Ub29sYmFyLkFVVE9fSU5ERVg7XG5cdFx0fVxuXHRcdGNvbnN0IGlkeCA9IEJyb3dzZXJFbXVsYXRpb25Ub29sYmFyLlpPT01fUFJFU0VUUy5maW5kSW5kZXgocCA9PiBNYXRoLmFicyhwIC0gc2NhbGUpIDwgMC4wMDUpO1xuXHRcdHJldHVybiBpZHggPj0gMCA/IGlkeCArIDEgOiBCcm93c2VyRW11bGF0aW9uVG9vbGJhci5BVVRPX0lOREVYO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlWm9vbSgpOiB2b2lkIHtcblx0XHRjb25zdCB3YXNTdXBwcmVzc2VkID0gdGhpcy5fc3VwcHJlc3NDaGFuZ2U7XG5cdFx0dGhpcy5fc3VwcHJlc3NDaGFuZ2UgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl96b29tLnNlbGVjdCh0aGlzLl9jdXJyZW50Wm9vbUluZGV4KCkpO1xuXHRcdFx0dGhpcy5fem9vbS5zZXRFbmFibGVkKCEhdGhpcy5fZmVhdHVyZS5tb2RlbD8uZGV2aWNlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3VwcHJlc3NDaGFuZ2UgPSB3YXNTdXBwcmVzc2VkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uRGltZW5zaW9uSW5wdXQoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9mZWF0dXJlLm1vZGVsO1xuXHRcdGlmICh0aGlzLl9zdXBwcmVzc0NoYW5nZSB8fCAhbW9kZWw/LmRldmljZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZSA9IChyYXc6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCB0cmltbWVkID0gcmF3LnRyaW0oKTtcblx0XHRcdGlmICh0cmltbWVkID09PSAnJykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbiA9IE1hdGguZmxvb3IoTnVtYmVyKHRyaW1tZWQpKTtcblx0XHRcdGlmICghbiB8fCBuIDw9IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBNYXRoLm1heCgxLCBNYXRoLm1pbig5OTk5LCBuKSk7XG5cdFx0fTtcblx0XHRjb25zdCB3aWR0aCA9IHBhcnNlKHRoaXMuX3dpZHRoSW5wdXQudmFsdWUpO1xuXHRcdGNvbnN0IGhlaWdodCA9IHBhcnNlKHRoaXMuX2hlaWdodElucHV0LnZhbHVlKTtcblx0XHRjb25zdCBkZXZpY2UgPSBtb2RlbC5kZXZpY2U7XG5cdFx0aWYgKGRldmljZS53aWR0aCA9PT0gd2lkdGggJiYgZGV2aWNlLmhlaWdodCA9PT0gaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZvaWQgbW9kZWwuc2V0RGV2aWNlKHsgLi4uZGV2aWNlLCB3aWR0aCwgaGVpZ2h0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EcHJJbnB1dCgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2ZlYXR1cmUubW9kZWw7XG5cdFx0aWYgKHRoaXMuX3N1cHByZXNzQ2hhbmdlIHx8ICFtb2RlbD8uZGV2aWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRldmljZSA9IG1vZGVsLmRldmljZTtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9kcHJJbnB1dC52YWx1ZS50cmltKCk7XG5cdFx0Y29uc3QgbmV4dCA9IHJhdyA9PT0gJycgPyB1bmRlZmluZWQgOiBNYXRoLm1heCgwLCBNYXRoLm1pbig4LCBOdW1iZXIocmF3KSB8fCAwKSkgfHwgdW5kZWZpbmVkO1xuXHRcdGlmIChkZXZpY2UuZGV2aWNlU2NhbGVGYWN0b3IgPT09IG5leHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dm9pZCBtb2RlbC5zZXREZXZpY2UoeyAuLi5kZXZpY2UsIGRldmljZVNjYWxlRmFjdG9yOiBuZXh0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTnVtYmVySW5wdXQocGFyZW50OiBIVE1MRWxlbWVudCwgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLCBhcmlhTGFiZWw6IHN0cmluZywgbWluOiBudW1iZXIsIG1heDogbnVtYmVyLCBpbnB1dE1vZGU6ICdudW1lcmljJyB8ICdkZWNpbWFsJyA9ICdudW1lcmljJyk6IElucHV0Qm94IHtcblx0XHRjb25zdCBjb250YWluZXIgPSAkKCcuYnJvd3Nlci1lbXVsYXRpb24tdG9vbGJhci1pbnB1dCcpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IElucHV0Qm94KGNvbnRhaW5lciwgY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGFyaWFMYWJlbCxcblx0XHRcdHBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnYnJvd3Nlci5kZXZpY2UuaW5wdXRQbGFjZWhvbGRlckF1dG8nLCBcImF1dG9cIiksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZGVmYXVsdElucHV0Qm94U3R5bGVzLFxuXHRcdH0pKTtcblx0XHRpbnB1dC5pbnB1dEVsZW1lbnQubWluID0gU3RyaW5nKG1pbik7XG5cdFx0aW5wdXQuaW5wdXRFbGVtZW50Lm1heCA9IFN0cmluZyhtYXgpO1xuXHRcdGlucHV0LmlucHV0RWxlbWVudC5pbnB1dE1vZGUgPSBpbnB1dE1vZGU7XG5cdFx0aWYgKGlucHV0TW9kZSA9PT0gJ2RlY2ltYWwnKSB7XG5cdFx0XHRpbnB1dC5pbnB1dEVsZW1lbnQuc3RlcCA9ICcwLjUnO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cbn1cblxuLyoqXG4gKiBFZGl0b3IgY29udHJpYnV0aW9uIHRoYXQgb3ducyB0aGUgZGV2aWNlIHRvb2xiYXIsIHRoZSByZW5kZXJlci1zaWRlIHNjYWxlXG4gKiBmb3IgdGhlIGVtdWxhdGVkIHZpZXdwb3J0LCBhbmQgdGhlIHJlc2l6ZSBzYXNoZXMgdGhhdCBkcml2ZSB2aWV3cG9ydCBzaXplXG4gKiBpbnRlcmFjdGl2ZWx5IChjb21taXR0ZWQgb250byB7QGxpbmsgSUJyb3dzZXJWaWV3TW9kZWwuZGV2aWNlfSkuIEFsc29cbiAqIGltcGxlbWVudHMge0BsaW5rIGNvbXB1dGVDb250YWluZXJMYXlvdXR9IHNvIHRoZSBlZGl0b3IgZGVsZWdhdGVzIGNvbnRhaW5lclxuICogc2l6aW5nIHRvIHRoaXMgY29udHJpYnV0aW9uIHdoZW5ldmVyIGRldmljZSBlbXVsYXRpb24gaXMgZW5nYWdlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIEJyb3dzZXJFZGl0b3JFbXVsYXRpb25TdXBwb3J0IGV4dGVuZHMgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbGJhcjogQnJvd3NlckVtdWxhdGlvblRvb2xiYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xiYXJWaXNpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNNb2JpbGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNVc2VyQWdlbnQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdC8qKiBDb21taXR0ZWQgcmVuZGVyZXItc2lkZSBzY2FsZTsgdW5kZWZpbmVkID0gYXV0by1maXQuIE5vdCBwZXJzaXN0ZWQgaW4gdGhlIGRldmljZSBtb2RlbCAocmlkZXMgb24gdGhlIGxheW91dCBjYWxsKS4gKi9cblx0cHJpdmF0ZSBfc2NhbGU6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0LyoqIFNjYWxlIEF1dG8tZml0IHdvdWxkIHByb2R1Y2UgZm9yIHRoZSBjdXJyZW50IGRldmljZSArIHBhbmUuIERyaXZlcyB0aGUgdG9vbGJhcidzIFwiQXV0byAoWCUpXCIgbGFiZWwuICovXG5cdHByaXZhdGUgX2F1dG9GaXRTY2FsZSA9IDE7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTY2FsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXV0b0ZpdFNjYWxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblxuXHRwcml2YXRlIF9lYXN0U2FzaDogU2FzaCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc291dGhTYXNoOiBTYXNoIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogQnJvd3NlckVkaXRvcixcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IpO1xuXHRcdHRoaXMuX3Rvb2xiYXJWaXNpYmxlID0gQ09OVEVYVF9CUk9XU0VSX0VNVUxBVElPTl9UT09MQkFSX1ZJU0lCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9pc01vYmlsZSA9IENPTlRFWFRfQlJPV1NFUl9FTVVMQVRJT05fSVNfTU9CSUxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzVXNlckFnZW50ID0gQ09OVEVYVF9CUk9XU0VSX0VNVUxBVElPTl9IQVNfVVNFUl9BR0VOVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc0NvbnRhaW5lciA9ICQoJy5icm93c2VyLWVtdWxhdGlvbi10b29sYmFyLWFjdGlvbnMnKTtcblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hIb3ZlckRlbGVnYXRlLFxuXHRcdFx0J2VsZW1lbnQnLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0eyBwb3NpdGlvbjogeyBob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkFCT1ZFIH0gfVxuXHRcdCkpO1xuXHRcdGNvbnN0IGFjdGlvbnNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRNZW51V29ya2JlbmNoVG9vbEJhcixcblx0XHRcdGFjdGlvbnNDb250YWluZXIsXG5cdFx0XHRNZW51SWQuQnJvd3NlckVtdWxhdGlvblRvb2xiYXIsXG5cdFx0XHR7XG5cdFx0XHRcdGhvdmVyRGVsZWdhdGUsXG5cdFx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0YWN0aW9uc1Rvb2xiYXIuY29udGV4dCA9IGVkaXRvcjtcblxuXHRcdHRoaXMuX3Rvb2xiYXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcm93c2VyRW11bGF0aW9uVG9vbGJhciwgdGhpcywgYWN0aW9uc0NvbnRhaW5lciwgaG92ZXJEZWxlZ2F0ZSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gb3VyIG93biBzY2FsZSBzdGF0ZTogcmVmcmVzaCB0aGUgdG9vbGJhciwgc3luYyBjb250ZXh0IGtleXMsIGFuZCByZWxheW91dC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZENoYW5nZVNjYWxlLmV2ZW50KCgpID0+IHtcblx0XHRcdHRoaXMuX3Rvb2xiYXIucmVmcmVzaCgpO1xuXHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0QnJvd3NlckNvbnRhaW5lcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9vbkRpZENoYW5nZUF1dG9GaXRTY2FsZS5ldmVudChzY2FsZSA9PiB0aGlzLl90b29sYmFyLnNldEF1dG9GaXRTY2FsZShzY2FsZSkpKTtcblx0fVxuXG5cdC8vIC0tIEJyb3dzZXJFZGl0b3JDb250cmlidXRpb24gaG9va3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0b3ZlcnJpZGUgZ2V0IHdpZGdldHMoKTogcmVhZG9ubHkgSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSB7XG5cdFx0cmV0dXJuIFt7IGxvY2F0aW9uOiBCcm93c2VyV2lkZ2V0TG9jYXRpb24uVG9vbGJhciwgZWxlbWVudDogdGhpcy5fdG9vbGJhci5lbGVtZW50LCBvcmRlcjogMCB9XTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uQ29udGFpbmVyQ3JlYXRlZChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fY3JlYXRlUmVzaXplU2FzaGVzKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBvYnNlcnZlciA9IG5ldyAoZ2V0V2luZG93KGNvbnRhaW5lcikuUmVzaXplT2JzZXJ2ZXIpKCgpID0+IHtcblx0XHRcdHRoaXMuX2Vhc3RTYXNoPy5sYXlvdXQoKTtcblx0XHRcdHRoaXMuX3NvdXRoU2FzaD8ubGF5b3V0KCk7XG5cdFx0fSk7XG5cdFx0b2JzZXJ2ZXIub2JzZXJ2ZShjb250YWluZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHsgZGlzcG9zZTogKCkgPT4gb2JzZXJ2ZXIuZGlzY29ubmVjdCgpIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYmVmb3JlQ29udGFpbmVyTGF5b3V0KCk6IElDb250YWluZXJMYXlvdXRPdmVycmlkZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5tb2RlbD8uZGV2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Ly8gUmVzZXJ2ZSBzcGFjZSBmb3IgdGhlIGVhc3QgKyBzb3V0aCByZXNpemUgc2FzaGVzIHRoYXQgc2l0IGp1c3Qgb3V0c2lkZSB0aGUgY29udGFpbmVyLlxuXHRcdFx0cGFkZGluZzogeyByaWdodDogMTYsIGJvdHRvbTogMTYgfSxcblx0XHRcdGNvbXB1dGU6IChfY3VycmVudCwgcGFuZSkgPT4gdGhpcy5fY29tcHV0ZUxheW91dChwYW5lLndpZHRoLCBwYW5lLmhlaWdodCksXG5cdFx0XHRwcmlvcml0eTogMFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlTGF5b3V0KHBhbmVXaWR0aDogbnVtYmVyLCBwYW5lSGVpZ2h0OiBudW1iZXIpOiBJQ29udGFpbmVyTGF5b3V0IHtcblx0XHRjb25zdCBkZXZpY2UgPSB0aGlzLmVkaXRvci5tb2RlbD8uZGV2aWNlO1xuXHRcdGNvbnN0IHdpZHRoID0gZGV2aWNlPy53aWR0aDtcblx0XHRjb25zdCBoZWlnaHQgPSBkZXZpY2U/LmhlaWdodDtcblx0XHRjb25zdCBmaXRTY2FsZSA9IHBhbmVXaWR0aCA+IDAgJiYgcGFuZUhlaWdodCA+IDBcblx0XHRcdD8gTWF0aC5taW4od2lkdGggPyBwYW5lV2lkdGggLyB3aWR0aCA6IDEsIGhlaWdodCA/IHBhbmVIZWlnaHQgLyBoZWlnaHQgOiAxLCAxKVxuXHRcdFx0OiAxO1xuXHRcdGlmICh0aGlzLl9hdXRvRml0U2NhbGUgIT09IGZpdFNjYWxlKSB7XG5cdFx0XHR0aGlzLl9hdXRvRml0U2NhbGUgPSBmaXRTY2FsZTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXV0b0ZpdFNjYWxlLmZpcmUoZml0U2NhbGUpO1xuXHRcdH1cblx0XHRjb25zdCBzY2FsZSA9IHRoaXMuX3NjYWxlID8/IGZpdFNjYWxlO1xuXHRcdGNvbnN0IGxheW91dFdpZHRoID0gd2lkdGggPyBNYXRoLm1pbih3aWR0aCAqIHNjYWxlLCBwYW5lV2lkdGgpIDogcGFuZVdpZHRoO1xuXHRcdGNvbnN0IGxheW91dEhlaWdodCA9IGhlaWdodCA/IE1hdGgubWluKGhlaWdodCAqIHNjYWxlLCBwYW5lSGVpZ2h0KSA6IHBhbmVIZWlnaHQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpZHRoOiBsYXlvdXRXaWR0aCxcblx0XHRcdGhlaWdodDogbGF5b3V0SGVpZ2h0LFxuXHRcdFx0Ly8gQ2VudGVyIHRoZSBkZXZpY2Ugd2l0aGluIHRoZSBhdmFpbGFibGUgcGFuZSAodGhlIHNhc2ggcmVzZXJ2YXRpb25cblx0XHRcdC8vIGlzIGFscmVhZHkgYWNjb3VudGVkIGZvciB2aWEgcGFkZGluZykuXG5cdFx0XHRsZWZ0OiBNYXRoLm1heCgwLCAocGFuZVdpZHRoIC0gbGF5b3V0V2lkdGgpIC8gMiksXG5cdFx0XHR0b3A6IE1hdGgubWF4KDAsIChwYW5lSGVpZ2h0IC0gbGF5b3V0SGVpZ2h0KSAvIDIpLFxuXHRcdFx0ZW11bGF0aW9uOiB7IHNjYWxlIH0sXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbk1vZGVsQXR0YWNoZWQobW9kZWw6IElCcm93c2VyVmlld01vZGVsLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0dGhpcy5fdG9vbGJhci5yZWZyZXNoKCk7XG5cdFx0dGhpcy5fc3luY0NvbnRleHRLZXlzKG1vZGVsLmRldmljZSk7XG5cdFx0dGhpcy5fdXBkYXRlU2FzaFN0YXRlKCk7XG5cdFx0dGhpcy5fc2V0VG9vbGJhclZpc2libGUoISFtb2RlbC5kZXZpY2UpO1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZENoYW5nZURldmljZShkZXZpY2UgPT4ge1xuXHRcdFx0dGhpcy5fdXBkYXRlU2FzaFN0YXRlKCk7XG5cdFx0XHQvLyBUdXJuaW5nIGVtdWxhdGlvbiBvZmYgZGlzY2FyZHMgYW55IGluLXByb2dyZXNzIHNjYWxlIG92ZXJyaWRlIHNvXG5cdFx0XHQvLyByZW9wZW5pbmcgdGhlIHRvb2xiYXIgc3RhcnRzIGNsZWFuLlxuXHRcdFx0aWYgKCFkZXZpY2UgJiYgdGhpcy5fc2NhbGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnNldFNjYWxlKHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZGV2aWNlKSB7XG5cdFx0XHRcdGxhc3RTZXR0aW5ncy5kZXZpY2UgPSBkZXZpY2U7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90b29sYmFyLnJlZnJlc2goKTtcblx0XHRcdHRoaXMuX3N5bmNDb250ZXh0S2V5cyhkZXZpY2UpO1xuXHRcdFx0dGhpcy5fc2V0VG9vbGJhclZpc2libGUoISFkZXZpY2UpO1xuXHRcdFx0dGhpcy5lZGl0b3IubGF5b3V0QnJvd3NlckNvbnRhaW5lcigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uTW9kZWxEZXRhY2hlZCgpOiB2b2lkIHtcblx0XHQvLyBFZGl0b3IgaW5wdXQgaXMgYmVpbmcgY2xlYXJlZCBcdTIwMTQgZHJvcCByZW5kZXJlci1zaWRlIHN0YXRlIHNvIGEgZnJlc2hseVxuXHRcdC8vIHJlb3BlbmVkIGlucHV0IHN0YXJ0cyB3aXRob3V0IHN0YWxlIHZpZXdwb3J0IG92ZXJyaWRlcy5cblx0XHR0aGlzLl9zY2FsZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90b29sYmFyLnJlZnJlc2goKTtcblx0XHR0aGlzLl9zeW5jQ29udGV4dEtleXModW5kZWZpbmVkKTtcblx0XHR0aGlzLl9zZXRUb29sYmFyVmlzaWJsZShmYWxzZSk7XG5cdH1cblxuXHQvLyAtLSBQdWJsaWMgQVBJIGNvbnN1bWVkIGJ5IHRvb2xiYXIgKyBhY3Rpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqIEN1cnJlbnQgcmVuZGVyZXItc2lkZSBzY2FsZTsgdW5kZWZpbmVkID0gYXV0by1maXQuICovXG5cdGdldCBzY2FsZSgpOiBudW1iZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fc2NhbGU7IH1cblx0LyoqIENvbnZlbmllbmNlIGFjY2Vzc29yIGZvciB0aGUgdG9vbGJhciBcdTIwMTQgcHJveGllcyB0aGUgZWRpdG9yJ3MgbW9kZWwuICovXG5cdGdldCBtb2RlbCgpOiBJQnJvd3NlclZpZXdNb2RlbCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLmVkaXRvci5tb2RlbDsgfVxuXG5cdHNldFNjYWxlKHNjYWxlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc2NhbGUgPT09IHNjYWxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxhc3RTZXR0aW5ncy5zY2FsZSA9IHNjYWxlO1xuXHRcdHRoaXMuX3NjYWxlID0gc2NhbGU7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTY2FsZS5maXJlKHNjYWxlKTtcblx0fVxuXG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rvb2xiYXIuaXNWaXNpYmxlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRvZ2dsZSB0aGUgdG9vbGJhci4gRW50ZXJpbmcgdG9vbGJhciBtb2RlIGVuZ2FnZXMgZGV2aWNlIGVtdWxhdGlvblxuXHQgKiAocmVzcG9uc2l2ZSB2aWV3cG9ydCwgZGVmYXVsdCBkZXZpY2UpOyBleGl0aW5nIGRpc2FibGVzIGl0LlxuXHQgKi9cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUgPT09IHRoaXMuX3Rvb2xiYXIuaXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdGlmIChtb2RlbCAmJiAhbW9kZWwuZGV2aWNlKSB7XG5cdFx0XHRcdHZvaWQgbW9kZWwuc2V0RGV2aWNlKHsgLi4ubGFzdFNldHRpbmdzLmRldmljZSB9KTtcblx0XHRcdFx0dGhpcy5zZXRTY2FsZShsYXN0U2V0dGluZ3Muc2NhbGUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2V0VG9vbGJhclZpc2libGUodHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZvaWQgbW9kZWw/LnNldERldmljZSh1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fc2V0VG9vbGJhclZpc2libGUoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBBcHBseSBhIHByZXNldCBvbnRvIHRoZSBjdXJyZW50IGVtdWxhdGlvbiwgcHJlc2VydmluZyB0aGUgY3VycmVudCBzY2FsZS4gKi9cblx0YXBwbHlQcmVzZXQocHJlc2V0OiBJQnJvd3NlckRldmljZVByZXNldCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2b2lkIG1vZGVsLnNldERldmljZShwcmVzZXQuZGV2aWNlID8/IHt9KTtcblx0fVxuXG5cdC8qKiBSZXNldCBhbGwgZGV2aWNlICsgc2NhbGUgb3ZlcnJpZGVzIHRvIGRlZmF1bHRzIHdoaWxlIGtlZXBpbmcgZW11bGF0aW9uIGVuZ2FnZWQuICovXG5cdHJlc2V0QWxsKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2b2lkIG1vZGVsLnNldERldmljZSh7fSk7XG5cdFx0dGhpcy5zZXRTY2FsZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqIFNldCB0aGUgdXNlciBhZ2VudCBvbiB0aGUgY3VycmVudCBkZXZpY2UuIEVtcHR5IC8gdW5kZWZpbmVkID0gZGVmYXVsdC4gRW5nYWdlcyBlbXVsYXRpb24gaWYgbm90IGFscmVhZHkgYWN0aXZlLiAqL1xuXHRzZXRVc2VyQWdlbnQodXNlckFnZW50OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLm1vZGVsO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dCA9IHVzZXJBZ2VudCA/IHVzZXJBZ2VudCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkZXZpY2UgPSBtb2RlbC5kZXZpY2U7XG5cdFx0aWYgKGRldmljZT8udXNlckFnZW50ID09PSBuZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZvaWQgbW9kZWwuc2V0RGV2aWNlKHsgLi4uKGRldmljZSA/PyB7fSksIHVzZXJBZ2VudDogbmV4dCB9KTtcblx0fVxuXG5cdC8qKiBUaGUgY3VycmVudCBkZXZpY2UncyB1c2VyIGFnZW50LCBpZiBhbnkuICovXG5cdGdldCB1c2VyQWdlbnQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3IubW9kZWw/LmRldmljZT8udXNlckFnZW50O1xuXHR9XG5cblx0LyoqIFN3YXAgdGhlIGN1cnJlbnQgdmlld3BvcnQncyB3aWR0aCBhbmQgaGVpZ2h0LiBOby1vcCB3aXRob3V0IGFueSBmaXhlZCBkaW0uICovXG5cdHN3YXBEaW1lbnNpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IubW9kZWw7XG5cdFx0Y29uc3QgZGV2aWNlID0gbW9kZWw/LmRldmljZTtcblx0XHRpZiAoIW1vZGVsIHx8ICFkZXZpY2UgfHwgKCFkZXZpY2Uud2lkdGggJiYgIWRldmljZS5oZWlnaHQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZvaWQgbW9kZWwuc2V0RGV2aWNlKHsgLi4uZGV2aWNlLCB3aWR0aDogZGV2aWNlLmhlaWdodCwgaGVpZ2h0OiBkZXZpY2Uud2lkdGggfSk7XG5cdH1cblxuXHQvKiogRmxpcCB0aGUgbW9iaWxlIGZsYWcgb24gdGhlIGN1cnJlbnQgZGV2aWNlIChkcml2ZXMgdG91Y2ggKyBwb2ludGVyIG1lZGlhKS4gRW5nYWdlcyBlbXVsYXRpb24gaWYgbm90IGFscmVhZHkgYWN0aXZlLiAqL1xuXHR0b2dnbGVNb2JpbGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5tb2RlbDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRldmljZSA9IG1vZGVsLmRldmljZTtcblx0XHR2b2lkIG1vZGVsLnNldERldmljZSh7IC4uLihkZXZpY2UgPz8ge30pLCBtb2JpbGU6ICFkZXZpY2U/Lm1vYmlsZSB9KTtcblx0fVxuXG5cdC8vIC0tIEludGVybmFsIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfc3luY0NvbnRleHRLZXlzKGRldmljZTogSUJyb3dzZXJEZXZpY2VQcm9maWxlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5faXNNb2JpbGUuc2V0KCEhZGV2aWNlPy5tb2JpbGUpO1xuXHRcdHRoaXMuX2hhc1VzZXJBZ2VudC5zZXQoISFkZXZpY2U/LnVzZXJBZ2VudCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRUb29sYmFyVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUgPT09IHRoaXMuX3Rvb2xiYXIuaXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHR0aGlzLl90b29sYmFyLnNob3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fdG9vbGJhci5oaWRlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Rvb2xiYXJWaXNpYmxlLnNldCh2aXNpYmxlKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRCcm93c2VyQ29udGFpbmVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVTYXNoU3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmVkaXRvci5tb2RlbD8uZGV2aWNlID8gU2FzaFN0YXRlLkVuYWJsZWQgOiBTYXNoU3RhdGUuRGlzYWJsZWQ7XG5cdFx0aWYgKHRoaXMuX2Vhc3RTYXNoKSB7XG5cdFx0XHR0aGlzLl9lYXN0U2FzaC5zdGF0ZSA9IHN0YXRlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc291dGhTYXNoKSB7XG5cdFx0XHR0aGlzLl9zb3V0aFNhc2guc3RhdGUgPSBzdGF0ZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGVhc3QgKyBzb3V0aCByZXNpemUgc2FzaGVzICh3aXRoIGFuIGF1dG8tbWFuYWdlZCBzb3V0aC1lYXN0IGNvcm5lcilcblx0ICogdGhhdCBkcmFnIHRoZSBjb250YWluZXIgdG8gc2V0IGV4cGxpY2l0IGRldmljZSBkaW1lbnNpb25zLiBUaGUgY29udGFpbmVyIGlzXG5cdCAqIGNlbnRlcmVkIGluIHRoZSB3cmFwcGVyLCBzbyBhIHBvaW50ZXIgZGVsdGEgb2YgTiBweCBlcXVhbHMgMipOIHB4IG9mIGdyb3d0aC5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZVJlc2l6ZVNhc2hlcyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgU0FTSF9PRkZTRVQgPSA2O1xuXHRcdGNvbnN0IGVhc3RTYXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IFNhc2goY29udGFpbmVyLCB7XG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hMZWZ0OiAoKSA9PiBjb250YWluZXIuY2xpZW50V2lkdGggKyBTQVNIX09GRlNFVCxcblx0XHRcdGdldFZlcnRpY2FsU2FzaFRvcDogKCkgPT4gMCxcblx0XHRcdGdldFZlcnRpY2FsU2FzaEhlaWdodDogKCkgPT4gY29udGFpbmVyLmNsaWVudEhlaWdodCxcblx0XHR9LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCwgb3J0aG9nb25hbEVkZ2U6IE9ydGhvZ29uYWxFZGdlLlNvdXRoIH0pKTtcblx0XHRjb25zdCBzb3V0aFNhc2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgU2FzaChjb250YWluZXIsIHtcblx0XHRcdGdldEhvcml6b250YWxTYXNoVG9wOiAoKSA9PiBjb250YWluZXIuY2xpZW50SGVpZ2h0ICsgU0FTSF9PRkZTRVQsXG5cdFx0XHRnZXRIb3Jpem9udGFsU2FzaExlZnQ6ICgpID0+IDAsXG5cdFx0XHRnZXRIb3Jpem9udGFsU2FzaFdpZHRoOiAoKSA9PiBjb250YWluZXIuY2xpZW50V2lkdGgsXG5cdFx0fSwgeyBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uSE9SSVpPTlRBTCwgb3J0aG9nb25hbEVkZ2U6IE9ydGhvZ29uYWxFZGdlLkVhc3QgfSkpO1xuXHRcdHNvdXRoU2FzaC5vcnRob2dvbmFsRW5kU2FzaCA9IGVhc3RTYXNoO1xuXHRcdGVhc3RTYXNoLm9ydGhvZ29uYWxFbmRTYXNoID0gc291dGhTYXNoO1xuXHRcdHRoaXMuX2Vhc3RTYXNoID0gZWFzdFNhc2g7XG5cdFx0dGhpcy5fc291dGhTYXNoID0gc291dGhTYXNoO1xuXHRcdHRoaXMuX3VwZGF0ZVNhc2hTdGF0ZSgpO1xuXG5cdFx0dHlwZSBEcmFnU3RhdGUgPSB7XG5cdFx0XHRyZWFkb25seSBzdGFydENvbnRhaW5lclc6IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IHN0YXJ0Q29udGFpbmVySDogbnVtYmVyO1xuXHRcdFx0cmVhZG9ubHkgc2NhbGU6IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IHBhbmVXOiBudW1iZXI7XG5cdFx0XHRyZWFkb25seSBwYW5lSDogbnVtYmVyO1xuXHRcdH07XG5cdFx0bGV0IGRyYWc6IERyYWdTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG9uU3RhcnQgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLm1vZGVsO1xuXHRcdFx0aWYgKCFtb2RlbCB8fCAhbW9kZWwuZGV2aWNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRldmljZSA9IG1vZGVsLmRldmljZTtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdicm93c2VyLWNvbnRhaW5lci0tZHJhZ2dpbmcnKTtcblx0XHRcdGNvbnN0IHBhbmUgPSB0aGlzLmVkaXRvci5wYW5lU2l6ZTtcblx0XHRcdGNvbnN0IGNvbnRhaW5lclJlY3QgPSBjb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHQvLyBNaXJyb3IgY29tcHV0ZUNvbnRhaW5lckxheW91dCdzIGZpdC1zY2FsZSBtYXRoIHRvIGRlcml2ZSBzdGFydGluZyBzY2FsZS5cblx0XHRcdGNvbnN0IGZpdFNjYWxlID0gcGFuZS53aWR0aCA+IDAgJiYgcGFuZS5oZWlnaHQgPiAwXG5cdFx0XHRcdD8gTWF0aC5taW4oZGV2aWNlLndpZHRoID8gcGFuZS53aWR0aCAvIGRldmljZS53aWR0aCA6IDEsIGRldmljZS5oZWlnaHQgPyBwYW5lLmhlaWdodCAvIGRldmljZS5oZWlnaHQgOiAxLCAxKVxuXHRcdFx0XHQ6IDE7XG5cdFx0XHRjb25zdCBzdGFydFNjYWxlID0gdGhpcy5fc2NhbGUgPz8gZml0U2NhbGU7XG5cdFx0XHRkcmFnID0ge1xuXHRcdFx0XHRzdGFydENvbnRhaW5lclc6IGNvbnRhaW5lclJlY3Qud2lkdGgsXG5cdFx0XHRcdHN0YXJ0Q29udGFpbmVySDogY29udGFpbmVyUmVjdC5oZWlnaHQsXG5cdFx0XHRcdHNjYWxlOiBNYXRoLm1heCgwLjAxLCBzdGFydFNjYWxlKSxcblx0XHRcdFx0cGFuZVc6IHBhbmUud2lkdGgsXG5cdFx0XHRcdHBhbmVIOiBwYW5lLmhlaWdodCxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IG9uQ2hhbmdlID0gKGF4aXM6ICd4JyB8ICd5JywgZXZ0OiBJU2FzaEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIWRyYWcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGV2aWNlID0gdGhpcy5lZGl0b3IubW9kZWw/LmRldmljZSA/PyB7fTtcblx0XHRcdGlmIChheGlzID09PSAneCcpIHtcblx0XHRcdFx0Y29uc3QgdyA9IE1hdGgubWF4KDUwLCBNYXRoLm1pbihkcmFnLnBhbmVXLCBkcmFnLnN0YXJ0Q29udGFpbmVyVyArIChldnQuY3VycmVudFggLSBldnQuc3RhcnRYKSAqIDIpKTtcblx0XHRcdFx0dm9pZCB0aGlzLmVkaXRvci5tb2RlbD8uc2V0RGV2aWNlKHsgLi4uZGV2aWNlLCB3aWR0aDogTWF0aC5tYXgoNTAsIE1hdGgucm91bmQodyAvIGRyYWcuc2NhbGUpKSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGggPSBNYXRoLm1heCg1MCwgTWF0aC5taW4oZHJhZy5wYW5lSCwgZHJhZy5zdGFydENvbnRhaW5lckggKyAoZXZ0LmN1cnJlbnRZIC0gZXZ0LnN0YXJ0WSkgKiAyKSk7XG5cdFx0XHRcdHZvaWQgdGhpcy5lZGl0b3IubW9kZWw/LnNldERldmljZSh7IC4uLmRldmljZSwgaGVpZ2h0OiBNYXRoLm1heCg1MCwgTWF0aC5yb3VuZChoIC8gZHJhZy5zY2FsZSkpIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBvbkVuZCA9ICgpID0+IHtcblx0XHRcdGlmICghZHJhZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnYnJvd3Nlci1jb250YWluZXItLWRyYWdnaW5nJyk7XG5cdFx0XHRkcmFnID0gdW5kZWZpbmVkO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlYXN0U2FzaC5vbkRpZFN0YXJ0KG9uU3RhcnQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihzb3V0aFNhc2gub25EaWRTdGFydChvblN0YXJ0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWFzdFNhc2gub25EaWRDaGFuZ2UoZXZ0ID0+IG9uQ2hhbmdlKCd4JywgZXZ0KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNvdXRoU2FzaC5vbkRpZENoYW5nZShldnQgPT4gb25DaGFuZ2UoJ3knLCBldnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWFzdFNhc2gub25EaWRFbmQob25FbmQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihzb3V0aFNhc2gub25EaWRFbmQob25FbmQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlYXN0U2FzaC5vbkRpZFJlc2V0KCgpID0+IHRoaXMuX3Jlc2V0QXhpcygneCcpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc291dGhTYXNoLm9uRGlkUmVzZXQoKCkgPT4gdGhpcy5fcmVzZXRBeGlzKCd5JykpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0QXhpcyhheGlzOiAneCcgfCAneScpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLm1vZGVsO1xuXHRcdGlmICghbW9kZWw/LmRldmljZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZXZpY2UgPSBtb2RlbC5kZXZpY2U7XG5cdFx0dm9pZCBtb2RlbC5zZXREZXZpY2UoYXhpcyA9PT0gJ3gnXG5cdFx0XHQ/IHsgLi4uZGV2aWNlLCB3aWR0aDogdW5kZWZpbmVkIH1cblx0XHRcdDogeyAuLi5kZXZpY2UsIGhlaWdodDogdW5kZWZpbmVkIH0pO1xuXHR9XG59XG5cbkJyb3dzZXJFZGl0b3IucmVnaXN0ZXJDb250cmlidXRpb24oQnJvd3NlckVkaXRvckVtdWxhdGlvblN1cHBvcnQpO1xuXG4vKipcbiAqIFRvZ2dsZSB0aGUgZW11bGF0aW9uIHRvb2xiYXIgKGVuZ2FnZXMgb3IgZGlzYWJsZXMgZGV2aWNlIGVtdWxhdGlvbikuXG4gKi9cbmNsYXNzIFRvZ2dsZUJyb3dzZXJFbXVsYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYnJvd3Nlci50b2dnbGVEZXZpY2VFbXVsYXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVCcm93c2VyRW11bGF0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci50b2dnbGVEZXZpY2VFbXVsYXRpb24nLCAnRGV2aWNlIEVtdWxhdGlvbicpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uZGV2aWNlTW9iaWxlLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR0b2dnbGVkOiBDT05URVhUX0JST1dTRVJfRU1VTEFUSU9OX1RPT0xCQVJfVklTSUJMRSxcblx0XHRcdHByZWNvbmRpdGlvbjogQlJPV1NFUl9FRElUT1JfQUNUSVZFLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJBY3Rpb25zVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6IEJyb3dzZXJBY3Rpb25Hcm91cC5Ub29scyxcblx0XHRcdFx0b3JkZXI6IDMsXG5cdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IHZvaWQge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0Y29uc3Qgc3VwcG9ydCA9IGJyb3dzZXJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uKEJyb3dzZXJFZGl0b3JFbXVsYXRpb25TdXBwb3J0KTtcblx0XHRcdHN1cHBvcnQ/LnNldFZpc2libGUoIXN1cHBvcnQuaXNWaXNpYmxlKTtcblx0XHR9XG5cdH1cbn1cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQnJvd3NlckVtdWxhdGlvblRvb2xiYXIsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUb2dnbGVCcm93c2VyRW11bGF0aW9uQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYnJvd3Nlci5lbXVsYXRpb25Ub29sYmFyLmNsb3NlJywgXCJDbG9zZVwiKSxcblx0XHRpY29uOiBDb2RpY29uLmNsb3NlLFxuXHR9LFxuXHRvcmRlcjogMTAwLFxufSk7XG5cbmNsYXNzIFRvZ2dsZUJyb3dzZXJNb2JpbGVFbXVsYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYnJvd3Nlci50b2dnbGVNb2JpbGVFbXVsYXRpb24nO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUb2dnbGVCcm93c2VyTW9iaWxlRW11bGF0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci50b2dnbGVNb2JpbGVFbXVsYXRpb24nLCAnVG9nZ2xlIE1vYmlsZSBFbXVsYXRpb24nKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmRldmljZU1vYmlsZSxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0dG9nZ2xlZDogQ09OVEVYVF9CUk9XU0VSX0VNVUxBVElPTl9JU19NT0JJTEUsXG5cdFx0XHRwcmVjb25kaXRpb246IEJST1dTRVJfRURJVE9SX0FDVElWRSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IHZvaWQge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YnJvd3NlckVkaXRvci5nZXRDb250cmlidXRpb24oQnJvd3NlckVkaXRvckVtdWxhdGlvblN1cHBvcnQpPy50b2dnbGVNb2JpbGUoKTtcblx0XHR9XG5cdH1cbn1cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQnJvd3NlckVtdWxhdGlvblRvb2xiYXIsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUb2dnbGVCcm93c2VyTW9iaWxlRW11bGF0aW9uQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYnJvd3Nlci5lbXVsYXRpb25Ub29sYmFyLm1vYmlsZScsIFwiTW9iaWxlIEVtdWxhdGlvblwiKSxcblx0XHRpY29uOiBDb2RpY29uLmRldmljZU1vYmlsZSxcblx0XHR0b2dnbGVkOiBDT05URVhUX0JST1dTRVJfRU1VTEFUSU9OX0lTX01PQklMRSxcblx0fSxcblx0b3JkZXI6IDIwLFxufSk7XG5cbmNvbnN0IERFRkFVTFRfQlJPV1NFUl9ERVZJQ0VfUFJFU0VUUzogcmVhZG9ubHkgSUJyb3dzZXJEZXZpY2VQcmVzZXRbXSA9IFtcblx0e1xuXHRcdG5hbWU6ICdpUGhvbmUgMTUgUHJvJyxcblx0XHRkZXZpY2U6IHsgd2lkdGg6IDM5MywgaGVpZ2h0OiA4NTIsIG1vYmlsZTogdHJ1ZSwgZGV2aWNlU2NhbGVGYWN0b3I6IDMsIHVzZXJBZ2VudDogJ01vemlsbGEvNS4wIChpUGhvbmU7IENQVSBpUGhvbmUgT1MgMTdfMCBsaWtlIE1hYyBPUyBYKSBBcHBsZVdlYktpdC82MDUuMS4xNSAoS0hUTUwsIGxpa2UgR2Vja28pIFZlcnNpb24vMTcuMCBNb2JpbGUvMTVFMTQ4IFNhZmFyaS82MDQuMScgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdpUGhvbmUgU0UnLFxuXHRcdGRldmljZTogeyB3aWR0aDogMzc1LCBoZWlnaHQ6IDY2NywgbW9iaWxlOiB0cnVlLCBkZXZpY2VTY2FsZUZhY3RvcjogMiwgdXNlckFnZW50OiAnTW96aWxsYS81LjAgKGlQaG9uZTsgQ1BVIGlQaG9uZSBPUyAxN18wIGxpa2UgTWFjIE9TIFgpIEFwcGxlV2ViS2l0LzYwNS4xLjE1IChLSFRNTCwgbGlrZSBHZWNrbykgVmVyc2lvbi8xNy4wIE1vYmlsZS8xNUUxNDggU2FmYXJpLzYwNC4xJyB9LFxuXHR9LFxuXHR7XG5cdFx0bmFtZTogJ1BpeGVsIDgnLFxuXHRcdGRldmljZTogeyB3aWR0aDogNDEyLCBoZWlnaHQ6IDkxNSwgbW9iaWxlOiB0cnVlLCBkZXZpY2VTY2FsZUZhY3RvcjogMi42MjUsIHVzZXJBZ2VudDogJ01vemlsbGEvNS4wIChMaW51eDsgQW5kcm9pZCAxNDsgUGl4ZWwgOCkgQXBwbGVXZWJLaXQvNTM3LjM2IChLSFRNTCwgbGlrZSBHZWNrbykgQ2hyb21lLzEyNC4wLjAuMCBNb2JpbGUgU2FmYXJpLzUzNy4zNicgfSxcblx0fSxcblx0e1xuXHRcdG5hbWU6ICdpUGFkIE1pbmknLFxuXHRcdGRldmljZTogeyB3aWR0aDogNzY4LCBoZWlnaHQ6IDEwMjQsIG1vYmlsZTogdHJ1ZSwgZGV2aWNlU2NhbGVGYWN0b3I6IDIsIHVzZXJBZ2VudDogJ01vemlsbGEvNS4wIChpUGFkOyBDUFUgT1MgMTdfMCBsaWtlIE1hYyBPUyBYKSBBcHBsZVdlYktpdC82MDUuMS4xNSAoS0hUTUwsIGxpa2UgR2Vja28pIFZlcnNpb24vMTcuMCBNb2JpbGUvMTVFMTQ4IFNhZmFyaS82MDQuMScgfSxcblx0fSxcbl07XG5cbmNsYXNzIFBpY2tCcm93c2VyRGV2aWNlUHJlc2V0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmJyb3dzZXIucGlja0RldmljZVByZXNldCc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFBpY2tCcm93c2VyRGV2aWNlUHJlc2V0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5waWNrRGV2aWNlUHJlc2V0JywgJ0VtdWxhdGUgRGV2aWNlLi4uJyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5saWJyYXJ5LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEJST1dTRVJfRURJVE9SX0FDVElWRSxcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdXBwb3J0ID0gYnJvd3NlckVkaXRvci5nZXRDb250cmlidXRpb24oQnJvd3NlckVkaXRvckVtdWxhdGlvblN1cHBvcnQpO1xuXHRcdGlmICghc3VwcG9ydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0dHlwZSBQcmVzZXRJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IHByZXNldDogSUJyb3dzZXJEZXZpY2VQcmVzZXQgfTtcblx0XHRjb25zdCBpdGVtczogUHJlc2V0SXRlbVtdID0gREVGQVVMVF9CUk9XU0VSX0RFVklDRV9QUkVTRVRTLm1hcChwID0+ICh7XG5cdFx0XHRsYWJlbDogcC5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHAuZGV2aWNlPy53aWR0aCAmJiBwLmRldmljZT8uaGVpZ2h0XG5cdFx0XHRcdD8gYCR7cC5kZXZpY2Uud2lkdGh9XFx1MDBENyR7cC5kZXZpY2UuaGVpZ2h0fSR7cC5kZXZpY2U/Lm1vYmlsZSA/IGAgXFx1MjAyMiAke2xvY2FsaXplKCdicm93c2VyLmRldmljZVByZXNldHMubW9iaWxlVGFnJywgXCJtb2JpbGVcIil9YCA6ICcnfWBcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRwcmVzZXQ6IHAsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcGlja2VkID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhpdGVtcywge1xuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdicm93c2VyLmRldmljZVByZXNldHMucGxhY2Vob2xkZXInLCBcIlNlbGVjdCBhIGRldmljZSBwcmVzZXRcIiksXG5cdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IHRydWUsXG5cdFx0fSk7XG5cdFx0aWYgKHBpY2tlZCkge1xuXHRcdFx0c3VwcG9ydC5hcHBseVByZXNldChwaWNrZWQucHJlc2V0KTtcblx0XHR9XG5cdH1cbn1cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQnJvd3NlckVtdWxhdGlvblRvb2xiYXIsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBQaWNrQnJvd3NlckRldmljZVByZXNldEFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2Jyb3dzZXIuZW11bGF0aW9uVG9vbGJhci5wcmVzZXRzJywgXCJBcHBseSBQcmVzZXQuLi5cIiksXG5cdFx0aWNvbjogQ29kaWNvbi5saWJyYXJ5LFxuXHR9LFxuXHRvcmRlcjogNSxcbn0pO1xuXG5jbGFzcyBTZXRCcm93c2VyVXNlckFnZW50QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmJyb3dzZXIuc2V0VXNlckFnZW50JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU2V0QnJvd3NlclVzZXJBZ2VudEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuc2V0VXNlckFnZW50JywgJ0VtdWxhdGUgVXNlciBBZ2VudC4uLicpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24udGFnLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHR0b2dnbGVkOiBDT05URVhUX0JST1dTRVJfRU1VTEFUSU9OX0hBU19VU0VSX0FHRU5ULFxuXHRcdFx0cHJlY29uZGl0aW9uOiBCUk9XU0VSX0VESVRPUl9BQ1RJVkUsXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3VwcG9ydCA9IGJyb3dzZXJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uKEJyb3dzZXJFZGl0b3JFbXVsYXRpb25TdXBwb3J0KTtcblx0XHRpZiAoIXN1cHBvcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCB2YWx1ZSA9IGF3YWl0IHF1aWNrSW5wdXRTZXJ2aWNlLmlucHV0KHtcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ2Jyb3dzZXIudXNlckFnZW50LnByb21wdCcsIFwiVXNlciBhZ2VudCBzdHJpbmcgKGxlYXZlIGVtcHR5IGZvciBWUyBDb2RlIGRlZmF1bHQpXCIpLFxuXHRcdFx0dmFsdWU6IHN1cHBvcnQudXNlckFnZW50ID8/ICcnLFxuXHRcdH0pO1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN1cHBvcnQuc2V0VXNlckFnZW50KHZhbHVlLnRyaW0oKSB8fCB1bmRlZmluZWQpO1xuXHR9XG59XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkJyb3dzZXJFbXVsYXRpb25Ub29sYmFyLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogU2V0QnJvd3NlclVzZXJBZ2VudEFjdGlvbi5JRCxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2Jyb3dzZXIuZW11bGF0aW9uVG9vbGJhci51c2VyQWdlbnQnLCBcIlNldCBVc2VyIEFnZW50Li4uXCIpLFxuXHRcdGljb246IENvZGljb24udGFnLFxuXHRcdHRvZ2dsZWQ6IENPTlRFWFRfQlJPV1NFUl9FTVVMQVRJT05fSEFTX1VTRVJfQUdFTlQsXG5cdH0sXG5cdG9yZGVyOiA2LFxufSk7XG5cbmNsYXNzIFJlc2V0QnJvd3NlckVtdWxhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5icm93c2VyLnJlc2V0RW11bGF0aW9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUmVzZXRCcm93c2VyRW11bGF0aW9uQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5yZXNldEVtdWxhdGlvbicsICdSZXNldCBFbXVsYXRpb24nKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmRpc2NhcmQsXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJST1dTRVJfRURJVE9SX0FDVElWRSwgQ09OVEVYVF9CUk9XU0VSX0VNVUxBVElPTl9UT09MQkFSX1ZJU0lCTEUpLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogdm9pZCB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRicm93c2VyRWRpdG9yLmdldENvbnRyaWJ1dGlvbihCcm93c2VyRWRpdG9yRW11bGF0aW9uU3VwcG9ydCk/LnJlc2V0QWxsKCk7XG5cdFx0fVxuXHR9XG59XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkJyb3dzZXJFbXVsYXRpb25Ub29sYmFyLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogUmVzZXRCcm93c2VyRW11bGF0aW9uQWN0aW9uLklELFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYnJvd3Nlci5lbXVsYXRpb25Ub29sYmFyLnJlc2V0JywgXCJSZXNldFwiKSxcblx0XHRpY29uOiBDb2RpY29uLmRpc2NhcmQsXG5cdH0sXG5cdG9yZGVyOiA5MCxcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoVG9nZ2xlQnJvd3NlckVtdWxhdGlvbkFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoUGlja0Jyb3dzZXJEZXZpY2VQcmVzZXRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFNldEJyb3dzZXJVc2VyQWdlbnRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFRvZ2dsZUJyb3dzZXJNb2JpbGVFbXVsYXRpb25BY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlc2V0QnJvd3NlckVtdWxhdGlvbkFjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsR0FBRyx1QkFBdUIsV0FBVyxpQkFBaUI7QUFDL0QsU0FBUyxpQkFBaUI7QUFFMUIsU0FBcUIsYUFBYSxnQkFBZ0IsTUFBTSxpQkFBaUI7QUFDekUsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQW1DO0FBQzVDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFFL0QsU0FBUyxnQkFBNkIsb0JBQW9CLHFCQUFxQjtBQUMvRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWUsOEJBQThCO0FBQ3RELFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsMEJBQTBDO0FBQ25ELFNBQVMsdUJBQXVCLDhCQUE4QjtBQUM5RCxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGVBQWUsMkJBQTJCLHVCQUF5Rix1QkFBdUIsdUJBQXVCLDBCQUEwQjtBQUVwTixNQUFNLDRDQUE0QyxJQUFJO0FBQUEsRUFDckQ7QUFBQSxFQUNBO0FBQUEsRUFDQSxTQUFTLG1DQUFtQyxrREFBa0Q7QUFDL0Y7QUFFQSxNQUFNLHNDQUFz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
