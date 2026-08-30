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
import * as dom from "../../base/browser/dom.js";
import { createFastDomNode } from "../../base/browser/fastDomNode.js";
import { inputLatency } from "../../base/browser/performance.js";
import { BugIndicatingError, onUnexpectedError } from "../../base/common/errors.js";
import { Disposable, DisposableStore } from "../../base/common/lifecycle.js";
import { PointerHandlerLastRenderData } from "./controller/mouseTarget.js";
import { PointerHandler } from "./controller/pointerHandler.js";
import { RenderingContext } from "./view/renderingContext.js";
import { ViewController } from "./view/viewController.js";
import { ContentViewOverlays, MarginViewOverlays } from "./view/viewOverlays.js";
import { PartFingerprint, PartFingerprints } from "./view/viewPart.js";
import { ViewUserInputEvents } from "./view/viewUserInputEvents.js";
import { BlockDecorations } from "./viewParts/blockDecorations/blockDecorations.js";
import { ViewContentWidgets } from "./viewParts/contentWidgets/contentWidgets.js";
import { CurrentLineHighlightOverlay, CurrentLineMarginHighlightOverlay } from "./viewParts/currentLineHighlight/currentLineHighlight.js";
import { DecorationsOverlay } from "./viewParts/decorations/decorations.js";
import { EditorScrollbar } from "./viewParts/editorScrollbar/editorScrollbar.js";
import { GlyphMarginWidgets } from "./viewParts/glyphMargin/glyphMargin.js";
import { IndentGuidesOverlay } from "./viewParts/indentGuides/indentGuides.js";
import { LineNumbersOverlay } from "./viewParts/lineNumbers/lineNumbers.js";
import { ViewLines } from "./viewParts/viewLines/viewLines.js";
import { LinesDecorationsOverlay } from "./viewParts/linesDecorations/linesDecorations.js";
import { Margin } from "./viewParts/margin/margin.js";
import { MarginViewLineDecorationsOverlay } from "./viewParts/marginDecorations/marginDecorations.js";
import { Minimap } from "./viewParts/minimap/minimap.js";
import { ViewOverlayWidgets } from "./viewParts/overlayWidgets/overlayWidgets.js";
import { DecorationsOverviewRuler } from "./viewParts/overviewRuler/decorationsOverviewRuler.js";
import { OverviewRuler } from "./viewParts/overviewRuler/overviewRuler.js";
import { Rulers } from "./viewParts/rulers/rulers.js";
import { ScrollDecorationViewPart } from "./viewParts/scrollDecoration/scrollDecoration.js";
import { SelectionsOverlay } from "./viewParts/selections/selections.js";
import { ViewCursors } from "./viewParts/viewCursors/viewCursors.js";
import { ViewZones } from "./viewParts/viewZones/viewZones.js";
import { WhitespaceOverlay } from "./viewParts/whitespace/whitespace.js";
import { EditorOption } from "../common/config/editorOptions.js";
import { Position } from "../common/core/position.js";
import { Range } from "../common/core/range.js";
import { Selection } from "../common/core/selection.js";
import { ScrollType } from "../common/editorCommon.js";
import { GlyphMarginLane } from "../common/model.js";
import { ViewEventHandler } from "../common/viewEventHandler.js";
import { ViewportData } from "../common/viewLayout/viewLinesViewportData.js";
import { ViewContext } from "../common/viewModel/viewContext.js";
import { IInstantiationService } from "../../platform/instantiation/common/instantiation.js";
import { getThemeTypeSelector } from "../../platform/theme/common/themeService.js";
import { ViewGpuContext } from "./gpu/viewGpuContext.js";
import { ViewLinesGpu } from "./viewParts/viewLinesGpu/viewLinesGpu.js";
import { TextAreaEditContext } from "./controller/editContext/textArea/textAreaEditContext.js";
import { NativeEditContext } from "./controller/editContext/native/nativeEditContext.js";
import { RulersGpu } from "./viewParts/rulersGpu/rulersGpu.js";
import { GpuMarkOverlay } from "./viewParts/gpuMark/gpuMark.js";
import { Emitter } from "../../base/common/event.js";
import { IUserInteractionService } from "../../platform/userInteraction/browser/userInteractionService.js";
let View = class extends ViewEventHandler {
  constructor(editorContainer, ownerID, commandDelegate, configuration, colorTheme, model, userInputEvents, overflowWidgetsDomNode, _instantiationService, _userInteractionService) {
    super();
    this._instantiationService = _instantiationService;
    this._userInteractionService = _userInteractionService;
    this._editContextClipboardListeners = new DisposableStore();
    // Clipboard events relayed from editContext
    this._onWillCopy = this._register(new Emitter());
    this.onWillCopy = this._onWillCopy.event;
    this._onWillCut = this._register(new Emitter());
    this.onWillCut = this._onWillCut.event;
    this._onWillPaste = this._register(new Emitter());
    this.onWillPaste = this._onWillPaste.event;
    // Actual mutable state
    this._shouldRecomputeGlyphMarginLanes = false;
    this._ownerID = ownerID;
    this._widgetFocusTracker = this._register(
      new CodeEditorWidgetFocusTracker(editorContainer, overflowWidgetsDomNode, this._userInteractionService)
    );
    this._register(this._widgetFocusTracker.onChange(() => {
      this._context.viewModel.setHasWidgetFocus(this._widgetFocusTracker.hasFocus());
    }));
    this._selections = [new Selection(1, 1, 1, 1)];
    this._renderAnimationFrame = null;
    this._overflowGuardContainer = createFastDomNode(document.createElement("div"));
    PartFingerprints.write(this._overflowGuardContainer, PartFingerprint.OverflowGuard);
    this._overflowGuardContainer.setClassName("overflow-guard");
    this._viewController = new ViewController(configuration, model, userInputEvents, commandDelegate);
    this._context = new ViewContext(configuration, colorTheme, model);
    this._context.addEventHandler(this);
    this._viewParts = [];
    this._editContextEnabled = this._context.configuration.options.get(EditorOption.effectiveEditContext);
    this._accessibilitySupport = this._context.configuration.options.get(EditorOption.accessibilitySupport);
    this._editContext = this._instantiateEditContext();
    this._connectEditContextClipboardEvents();
    this._viewParts.push(this._editContext);
    this._linesContent = createFastDomNode(document.createElement("div"));
    this._linesContent.setClassName("lines-content monaco-editor-background");
    this._linesContent.setPosition("absolute");
    this.domNode = createFastDomNode(document.createElement("div"));
    this.domNode.setClassName(this._getEditorClassName());
    this.domNode.setAttribute("role", "code");
    if (this._context.configuration.options.get(EditorOption.experimentalGpuAcceleration) === "on") {
      this._viewGpuContext = this._instantiationService.createInstance(ViewGpuContext, this._context);
    }
    this._scrollbar = new EditorScrollbar(this._context, this._linesContent, this.domNode, this._overflowGuardContainer);
    this._viewParts.push(this._scrollbar);
    this._viewLines = new ViewLines(this._context, this._viewGpuContext, this._linesContent);
    if (this._viewGpuContext) {
      this._viewLinesGpu = this._instantiationService.createInstance(ViewLinesGpu, this._context, this._viewGpuContext);
    }
    this._viewZones = new ViewZones(this._context);
    this._viewParts.push(this._viewZones);
    const decorationsOverviewRuler = new DecorationsOverviewRuler(this._context);
    this._viewParts.push(decorationsOverviewRuler);
    const scrollDecoration = new ScrollDecorationViewPart(this._context);
    this._viewParts.push(scrollDecoration);
    const contentViewOverlays = new ContentViewOverlays(this._context);
    this._viewParts.push(contentViewOverlays);
    contentViewOverlays.addDynamicOverlay(new CurrentLineHighlightOverlay(this._context));
    contentViewOverlays.addDynamicOverlay(new SelectionsOverlay(this._context));
    contentViewOverlays.addDynamicOverlay(new IndentGuidesOverlay(this._context));
    contentViewOverlays.addDynamicOverlay(new DecorationsOverlay(this._context));
    contentViewOverlays.addDynamicOverlay(new WhitespaceOverlay(this._context));
    const marginViewOverlays = new MarginViewOverlays(this._context);
    this._viewParts.push(marginViewOverlays);
    marginViewOverlays.addDynamicOverlay(new CurrentLineMarginHighlightOverlay(this._context));
    marginViewOverlays.addDynamicOverlay(new MarginViewLineDecorationsOverlay(this._context));
    marginViewOverlays.addDynamicOverlay(new LinesDecorationsOverlay(this._context));
    marginViewOverlays.addDynamicOverlay(new LineNumbersOverlay(this._context));
    if (this._viewGpuContext) {
      marginViewOverlays.addDynamicOverlay(new GpuMarkOverlay(this._context, this._viewGpuContext));
    }
    this._glyphMarginWidgets = new GlyphMarginWidgets(this._context);
    this._viewParts.push(this._glyphMarginWidgets);
    const margin = new Margin(this._context);
    margin.getDomNode().appendChild(this._viewZones.marginDomNode);
    margin.getDomNode().appendChild(marginViewOverlays.getDomNode());
    margin.getDomNode().appendChild(this._glyphMarginWidgets.domNode);
    this._viewParts.push(margin);
    this._contentWidgets = new ViewContentWidgets(this._context, this.domNode);
    this._viewParts.push(this._contentWidgets);
    this._viewCursors = new ViewCursors(this._context);
    this._viewParts.push(this._viewCursors);
    this._overlayWidgets = new ViewOverlayWidgets(this._context, this.domNode);
    this._viewParts.push(this._overlayWidgets);
    const rulers = this._viewGpuContext ? new RulersGpu(this._context, this._viewGpuContext) : new Rulers(this._context);
    this._viewParts.push(rulers);
    const blockOutline = new BlockDecorations(this._context);
    this._viewParts.push(blockOutline);
    const minimap = new Minimap(this._context);
    this._viewParts.push(minimap);
    if (decorationsOverviewRuler) {
      const overviewRulerData = this._scrollbar.getOverviewRulerLayoutInfo();
      overviewRulerData.parent.insertBefore(decorationsOverviewRuler.getDomNode(), overviewRulerData.insertBefore);
    }
    this._linesContent.appendChild(contentViewOverlays.getDomNode());
    if ("domNode" in rulers) {
      this._linesContent.appendChild(rulers.domNode);
    }
    this._linesContent.appendChild(this._viewZones.domNode);
    this._linesContent.appendChild(this._viewLines.getDomNode());
    this._linesContent.appendChild(this._contentWidgets.domNode);
    this._linesContent.appendChild(this._viewCursors.getDomNode());
    this._overflowGuardContainer.appendChild(margin.getDomNode());
    this._overflowGuardContainer.appendChild(this._scrollbar.getDomNode());
    if (this._viewGpuContext) {
      this._overflowGuardContainer.appendChild(this._viewGpuContext.canvas);
    }
    this._overflowGuardContainer.appendChild(scrollDecoration.getDomNode());
    this._overflowGuardContainer.appendChild(this._overlayWidgets.getDomNode());
    this._overflowGuardContainer.appendChild(minimap.getDomNode());
    this._overflowGuardContainer.appendChild(blockOutline.domNode);
    this.domNode.appendChild(this._overflowGuardContainer);
    if (overflowWidgetsDomNode) {
      overflowWidgetsDomNode.appendChild(this._contentWidgets.overflowingContentWidgetsDomNode.domNode);
      overflowWidgetsDomNode.appendChild(this._overlayWidgets.overflowingOverlayWidgetsDomNode.domNode);
    } else {
      this.domNode.appendChild(this._contentWidgets.overflowingContentWidgetsDomNode);
      this.domNode.appendChild(this._overlayWidgets.overflowingOverlayWidgetsDomNode);
    }
    this._applyLayout();
    this._pointerHandler = this._register(new PointerHandler(this._context, this._viewController, this._createPointerHandlerHelper()));
  }
  _instantiateEditContext() {
    const usingExperimentalEditContext = this._context.configuration.options.get(EditorOption.effectiveEditContext);
    if (usingExperimentalEditContext) {
      return this._instantiationService.createInstance(NativeEditContext, this._ownerID, this._context, this._overflowGuardContainer, this._viewController, this._createTextAreaHandlerHelper());
    } else {
      return this._instantiationService.createInstance(TextAreaEditContext, this._ownerID, this._context, this._overflowGuardContainer, this._viewController, this._createTextAreaHandlerHelper());
    }
  }
  _updateEditContext() {
    const editContextEnabled = this._context.configuration.options.get(EditorOption.effectiveEditContext);
    const accessibilitySupport = this._context.configuration.options.get(EditorOption.accessibilitySupport);
    if (this._editContextEnabled === editContextEnabled && this._accessibilitySupport === accessibilitySupport) {
      return;
    }
    this._editContextEnabled = editContextEnabled;
    this._accessibilitySupport = accessibilitySupport;
    const isEditContextFocused = this._editContext.isFocused();
    const indexOfEditContext = this._viewParts.indexOf(this._editContext);
    this._editContext.dispose();
    this._editContext = this._instantiateEditContext();
    this._connectEditContextClipboardEvents();
    if (isEditContextFocused) {
      this._editContext.focus();
    }
    if (indexOfEditContext !== -1) {
      this._viewParts.splice(indexOfEditContext, 1, this._editContext);
    }
  }
  _connectEditContextClipboardEvents() {
    this._editContextClipboardListeners.clear();
    this._editContextClipboardListeners.add(this._editContext.onWillCopy((e) => this._onWillCopy.fire(e)));
    this._editContextClipboardListeners.add(this._editContext.onWillCut((e) => this._onWillCut.fire(e)));
    this._editContextClipboardListeners.add(this._editContext.onWillPaste((e) => this._onWillPaste.fire(e)));
  }
  _computeGlyphMarginLanes() {
    const model = this._context.viewModel.model;
    const laneModel = this._context.viewModel.glyphLanes;
    let glyphs = [];
    let maxLineNumber = 0;
    glyphs = glyphs.concat(model.getAllMarginDecorations().map((decoration) => {
      const lane = decoration.options.glyphMargin?.position ?? GlyphMarginLane.Center;
      maxLineNumber = Math.max(maxLineNumber, decoration.range.endLineNumber);
      return { range: decoration.range, lane, persist: decoration.options.glyphMargin?.persistLane };
    }));
    glyphs = glyphs.concat(this._glyphMarginWidgets.getWidgets().map((widget) => {
      const range = model.validateRange(widget.preference.range);
      maxLineNumber = Math.max(maxLineNumber, range.endLineNumber);
      return { range, lane: widget.preference.lane };
    }));
    glyphs.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
    laneModel.reset(maxLineNumber);
    for (const glyph of glyphs) {
      laneModel.push(glyph.lane, glyph.range, glyph.persist);
    }
    return laneModel;
  }
  _createPointerHandlerHelper() {
    return {
      viewDomNode: this.domNode.domNode,
      linesContentDomNode: this._linesContent.domNode,
      viewLinesDomNode: this._viewLines.getDomNode().domNode,
      viewLinesGpu: this._viewLinesGpu,
      focusTextArea: () => {
        this.focus();
      },
      dispatchTextAreaEvent: (event) => {
        this._editContext.domNode.domNode.dispatchEvent(event);
      },
      getLastRenderData: () => {
        const lastViewCursorsRenderData = this._viewCursors.getLastRenderData() || [];
        const lastTextareaPosition = this._editContext.getLastRenderData();
        return new PointerHandlerLastRenderData(lastViewCursorsRenderData, lastTextareaPosition);
      },
      renderNow: () => {
        this.render(true, false);
      },
      shouldSuppressMouseDownOnViewZone: (viewZoneId) => {
        return this._viewZones.shouldSuppressMouseDownOnViewZone(viewZoneId);
      },
      shouldSuppressMouseDownOnWidget: (widgetId) => {
        return this._contentWidgets.shouldSuppressMouseDownOnWidget(widgetId);
      },
      getPositionFromDOMInfo: (spanNode, offset) => {
        this._flushAccumulatedAndRenderNow();
        return this._viewLines.getPositionFromDOMInfo(spanNode, offset);
      },
      visibleRangeForPosition: (lineNumber, column) => {
        this._flushAccumulatedAndRenderNow();
        const position = new Position(lineNumber, column);
        return this._viewLines.visibleRangeForPosition(position) ?? this._viewLinesGpu?.visibleRangeForPosition(position) ?? null;
      },
      getLineWidth: (lineNumber) => {
        this._flushAccumulatedAndRenderNow();
        if (this._viewLinesGpu) {
          const result = this._viewLinesGpu.getLineWidth(lineNumber);
          if (result !== void 0) {
            return result;
          }
        }
        return this._viewLines.getLineWidth(lineNumber);
      }
    };
  }
  _createTextAreaHandlerHelper() {
    return {
      visibleRangeForPosition: (position) => {
        this._flushAccumulatedAndRenderNow();
        return this._viewLines.visibleRangeForPosition(position);
      },
      linesVisibleRangesForRange: (range, includeNewLines) => {
        this._flushAccumulatedAndRenderNow();
        return this._viewLines.linesVisibleRangesForRange(range, includeNewLines);
      }
    };
  }
  _applyLayout() {
    const options = this._context.configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    this.domNode.setWidth(layoutInfo.width);
    this.domNode.setHeight(layoutInfo.height);
    this._overflowGuardContainer.setWidth(layoutInfo.width);
    this._overflowGuardContainer.setHeight(layoutInfo.height);
    this._linesContent.setWidth(16777216);
    this._linesContent.setHeight(16777216);
  }
  _getEditorClassName() {
    const focused = this._editContext.isFocused() ? " focused" : "";
    return this._context.configuration.options.get(EditorOption.editorClassName) + " " + getThemeTypeSelector(this._context.theme.type) + focused;
  }
  // --- begin event handlers
  handleEvents(events) {
    super.handleEvents(events);
    this._scheduleRender();
  }
  onConfigurationChanged(e) {
    this.domNode.setClassName(this._getEditorClassName());
    this._updateEditContext();
    this._applyLayout();
    return false;
  }
  onCursorStateChanged(e) {
    this._selections = e.selections;
    return false;
  }
  onDecorationsChanged(e) {
    if (e.affectsGlyphMargin) {
      this._shouldRecomputeGlyphMarginLanes = true;
    }
    return false;
  }
  onFocusChanged(e) {
    this.domNode.setClassName(this._getEditorClassName());
    return false;
  }
  onThemeChanged(e) {
    this._context.theme.update(e.theme);
    this.domNode.setClassName(this._getEditorClassName());
    return false;
  }
  // --- end event handlers
  dispose() {
    if (this._renderAnimationFrame !== null) {
      this._renderAnimationFrame.dispose();
      this._renderAnimationFrame = null;
    }
    this._editContextClipboardListeners.dispose();
    this._contentWidgets.overflowingContentWidgetsDomNode.domNode.remove();
    this._overlayWidgets.overflowingOverlayWidgetsDomNode.domNode.remove();
    this._context.removeEventHandler(this);
    this._viewGpuContext?.dispose();
    this._viewLines.dispose();
    this._viewLinesGpu?.dispose();
    for (const viewPart of this._viewParts) {
      viewPart.dispose();
    }
    super.dispose();
  }
  _scheduleRender() {
    if (this._store.isDisposed) {
      throw new BugIndicatingError();
    }
    if (this._renderAnimationFrame === null) {
      if (this._editContext instanceof NativeEditContext) {
        this._editContext.setEditContextOnDomNode();
      }
      const rendering = this._createCoordinatedRendering();
      this._renderAnimationFrame = EditorRenderingCoordinator.INSTANCE.scheduleCoordinatedRendering({
        window: dom.getWindow(this.domNode?.domNode),
        prepareRenderText: () => {
          if (this._store.isDisposed) {
            throw new BugIndicatingError();
          }
          try {
            return rendering.prepareRenderText();
          } finally {
            this._renderAnimationFrame = null;
          }
        },
        renderText: (viewportData) => {
          if (this._store.isDisposed) {
            throw new BugIndicatingError();
          }
          return rendering.renderText(viewportData);
        },
        prepareRender: (viewParts, ctx) => {
          if (this._store.isDisposed) {
            throw new BugIndicatingError();
          }
          return rendering.prepareRender(viewParts, ctx);
        },
        render: (viewParts, ctx) => {
          if (this._store.isDisposed) {
            throw new BugIndicatingError();
          }
          return rendering.render(viewParts, ctx);
        }
      });
    }
  }
  _flushAccumulatedAndRenderNow() {
    const rendering = this._createCoordinatedRendering();
    const viewportData = safeInvokeNoArg(() => rendering.prepareRenderText());
    if (!viewportData) {
      return;
    }
    const data = safeInvokeNoArg(() => rendering.renderText(viewportData));
    if (!data) {
      return;
    }
    const [viewParts, ctx] = data;
    safeInvokeNoArg(() => rendering.prepareRender(viewParts, ctx));
    safeInvokeNoArg(() => rendering.render(viewParts, ctx));
  }
  _getViewPartsToRender() {
    const result = [];
    let resultLen = 0;
    for (const viewPart of this._viewParts) {
      if (viewPart.shouldRender()) {
        result[resultLen++] = viewPart;
      }
    }
    return result;
  }
  _createCoordinatedRendering() {
    return {
      prepareRenderText: () => {
        if (this._shouldRecomputeGlyphMarginLanes) {
          this._shouldRecomputeGlyphMarginLanes = false;
          const model = this._computeGlyphMarginLanes();
          this._context.configuration.setGlyphMarginDecorationLaneCount(model.requiredLanes);
        }
        inputLatency.onRenderStart();
        if (!this.domNode.domNode.isConnected) {
          return null;
        }
        const viewPartsToRender = this._getViewPartsToRender();
        const viewLinesShouldRender = this._viewLines.shouldRender();
        if (!viewLinesShouldRender && viewPartsToRender.length === 0) {
          return null;
        }
        const partialViewportData = this._context.viewLayout.getLinesViewportData();
        this._context.viewModel.setViewport(partialViewportData.startLineNumber, partialViewportData.endLineNumber, partialViewportData.centeredLineNumber);
        const viewportData = new ViewportData(
          this._selections,
          partialViewportData,
          this._context.viewLayout.getWhitespaceViewportData(),
          this._context.viewModel
        );
        for (const viewPart of this._viewParts) {
          if (viewPart.shouldRender()) {
            viewPart.onBeforeRender(viewportData);
          }
        }
        return viewportData;
      },
      renderText: (viewportData) => {
        if (this._viewLines.shouldRender()) {
          this._viewLines.renderText(viewportData);
          this._viewLines.onDidRender();
        }
        if (this._viewLinesGpu?.shouldRender()) {
          this._viewLinesGpu.renderText(viewportData);
          this._viewLinesGpu.onDidRender();
        }
        const viewPartsToRender = this._getViewPartsToRender();
        return [viewPartsToRender, new RenderingContext(this._context.viewLayout, viewportData, this._viewLines, this._viewLinesGpu)];
      },
      prepareRender: (viewPartsToRender, ctx) => {
        for (const viewPart of viewPartsToRender) {
          viewPart.prepareRender(ctx);
        }
      },
      render: (viewPartsToRender, ctx) => {
        for (const viewPart of viewPartsToRender) {
          viewPart.render(ctx);
          viewPart.onDidRender();
        }
      }
    };
  }
  // --- BEGIN CodeEditor helpers
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this._scrollbar.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this._scrollbar.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  restoreState(scrollPosition) {
    this._context.viewModel.viewLayout.setScrollPosition({
      scrollTop: scrollPosition.scrollTop,
      scrollLeft: scrollPosition.scrollLeft
    }, ScrollType.Immediate);
    this._context.viewModel.visibleLinesStabilized();
  }
  getOffsetForColumn(modelLineNumber, modelColumn) {
    const modelPosition = this._context.viewModel.model.validatePosition({
      lineNumber: modelLineNumber,
      column: modelColumn
    });
    const viewPosition = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
    this._flushAccumulatedAndRenderNow();
    const visibleRange = this._viewLines.visibleRangeForPosition(new Position(viewPosition.lineNumber, viewPosition.column));
    if (!visibleRange) {
      return -1;
    }
    return visibleRange.left;
  }
  getLineWidth(modelLineNumber) {
    const model = this._context.viewModel.model;
    const viewLine = this._context.viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelLineNumber, model.getLineMaxColumn(modelLineNumber))).lineNumber;
    this._flushAccumulatedAndRenderNow();
    const width = this._viewLines.getLineWidth(viewLine);
    return width;
  }
  resetLineWidthCaches() {
    this._viewLines.resetLineWidthCaches();
  }
  getTargetAtClientPoint(clientX, clientY) {
    const mouseTarget = this._pointerHandler.getTargetAtClientPoint(clientX, clientY);
    if (!mouseTarget) {
      return null;
    }
    return ViewUserInputEvents.convertViewToModelMouseTarget(mouseTarget, this._context.viewModel.coordinatesConverter);
  }
  createOverviewRuler(cssClassName) {
    return new OverviewRuler(this._context, cssClassName);
  }
  change(callback) {
    this._viewZones.changeViewZones(callback);
    this._scheduleRender();
  }
  render(now, everything) {
    if (everything) {
      this._viewLines.forceShouldRender();
      for (const viewPart of this._viewParts) {
        viewPart.forceShouldRender();
      }
    }
    if (now) {
      this._flushAccumulatedAndRenderNow();
    } else {
      this._scheduleRender();
    }
  }
  writeScreenReaderContent(reason) {
    this._editContext.writeScreenReaderContent(reason);
  }
  focus() {
    this._editContext.focus();
  }
  isFocused() {
    return this._editContext.isFocused();
  }
  isWidgetFocused() {
    return this._widgetFocusTracker.hasFocus();
  }
  refreshFocusState() {
    this._editContext.refreshFocusState();
    this._widgetFocusTracker.refreshState();
  }
  setAriaOptions(options) {
    this._editContext.setAriaOptions(options);
  }
  addContentWidget(widgetData) {
    this._contentWidgets.addWidget(widgetData.widget);
    this.layoutContentWidget(widgetData);
    this._scheduleRender();
  }
  layoutContentWidget(widgetData) {
    this._contentWidgets.setWidgetPosition(
      widgetData.widget,
      widgetData.position?.position ?? null,
      widgetData.position?.secondaryPosition ?? null,
      widgetData.position?.preference ?? null,
      widgetData.position?.positionAffinity ?? null
    );
    if (this._contentWidgets.shouldRender()) {
      this._scheduleRender();
    }
  }
  removeContentWidget(widgetData) {
    this._contentWidgets.removeWidget(widgetData.widget);
    this._scheduleRender();
  }
  addOverlayWidget(widgetData) {
    this._overlayWidgets.addWidget(widgetData.widget);
    this.layoutOverlayWidget(widgetData);
    this._scheduleRender();
  }
  layoutOverlayWidget(widgetData) {
    const shouldRender = this._overlayWidgets.setWidgetPosition(widgetData.widget, widgetData.position);
    if (shouldRender) {
      this._scheduleRender();
    }
  }
  removeOverlayWidget(widgetData) {
    this._overlayWidgets.removeWidget(widgetData.widget);
    this._scheduleRender();
  }
  addGlyphMarginWidget(widgetData) {
    this._glyphMarginWidgets.addWidget(widgetData.widget);
    this._shouldRecomputeGlyphMarginLanes = true;
    this._scheduleRender();
  }
  layoutGlyphMarginWidget(widgetData) {
    const newPreference = widgetData.position;
    const shouldRender = this._glyphMarginWidgets.setWidgetPosition(widgetData.widget, newPreference);
    if (shouldRender) {
      this._shouldRecomputeGlyphMarginLanes = true;
      this._scheduleRender();
    }
  }
  removeGlyphMarginWidget(widgetData) {
    this._glyphMarginWidgets.removeWidget(widgetData.widget);
    this._shouldRecomputeGlyphMarginLanes = true;
    this._scheduleRender();
  }
  // --- END CodeEditor helpers
};
View = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IUserInteractionService)
], View);
function safeInvokeNoArg(func) {
  try {
    return func();
  } catch (e) {
    onUnexpectedError(e);
    return null;
  }
}
const _EditorRenderingCoordinator = class _EditorRenderingCoordinator {
  constructor() {
    this._coordinatedRenderings = [];
    this._animationFrameRunners = /* @__PURE__ */ new Map();
  }
  scheduleCoordinatedRendering(rendering) {
    this._coordinatedRenderings.push(rendering);
    this._scheduleRender(rendering.window);
    return {
      dispose: () => {
        const renderingIndex = this._coordinatedRenderings.indexOf(rendering);
        if (renderingIndex === -1) {
          return;
        }
        this._coordinatedRenderings.splice(renderingIndex, 1);
        if (this._coordinatedRenderings.length === 0) {
          for (const [_, disposable] of this._animationFrameRunners) {
            disposable.dispose();
          }
          this._animationFrameRunners.clear();
        }
      }
    };
  }
  _scheduleRender(window) {
    if (!this._animationFrameRunners.has(window)) {
      const runner = () => {
        this._animationFrameRunners.delete(window);
        this._onRenderScheduled();
      };
      this._animationFrameRunners.set(window, dom.runAtThisOrScheduleAtNextAnimationFrame(window, runner, 100));
    }
  }
  _onRenderScheduled() {
    const coordinatedRenderings = this._coordinatedRenderings.slice(0);
    this._coordinatedRenderings = [];
    const viewportDatas = [];
    for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
      const rendering = coordinatedRenderings[i];
      viewportDatas[i] = safeInvokeNoArg(() => rendering.prepareRenderText());
    }
    const datas = [];
    for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
      const rendering = coordinatedRenderings[i];
      const viewportData = viewportDatas[i];
      if (!viewportData) {
        datas[i] = null;
        continue;
      }
      datas[i] = safeInvokeNoArg(() => rendering.renderText(viewportData));
    }
    for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
      const rendering = coordinatedRenderings[i];
      const data = datas[i];
      if (!data) {
        continue;
      }
      const [viewParts, ctx] = data;
      safeInvokeNoArg(() => rendering.prepareRender(viewParts, ctx));
    }
    for (let i = 0, len = coordinatedRenderings.length; i < len; i++) {
      const rendering = coordinatedRenderings[i];
      const data = datas[i];
      if (!data) {
        continue;
      }
      const [viewParts, ctx] = data;
      safeInvokeNoArg(() => rendering.render(viewParts, ctx));
    }
  }
};
_EditorRenderingCoordinator.INSTANCE = new _EditorRenderingCoordinator();
let EditorRenderingCoordinator = _EditorRenderingCoordinator;
class CodeEditorWidgetFocusTracker extends Disposable {
  constructor(domElement, overflowWidgetsDomNode, userInteractionService) {
    super();
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this._hadFocus = void 0;
    this._hasDomElementFocus = false;
    this._domFocusTracker = this._register(userInteractionService.createDomFocusTracker(domElement));
    this._overflowWidgetsDomNodeHasFocus = false;
    this._register(this._domFocusTracker.onDidFocus(() => {
      this._hasDomElementFocus = true;
      this._update();
    }));
    this._register(this._domFocusTracker.onDidBlur(() => {
      this._hasDomElementFocus = false;
      this._update();
    }));
    if (overflowWidgetsDomNode) {
      this._overflowWidgetsDomNode = this._register(userInteractionService.createDomFocusTracker(overflowWidgetsDomNode));
      this._register(this._overflowWidgetsDomNode.onDidFocus(() => {
        this._overflowWidgetsDomNodeHasFocus = true;
        this._update();
      }));
      this._register(this._overflowWidgetsDomNode.onDidBlur(() => {
        this._overflowWidgetsDomNodeHasFocus = false;
        this._update();
      }));
    }
  }
  _update() {
    const focused = this._hasDomElementFocus || this._overflowWidgetsDomNodeHasFocus;
    if (this._hadFocus !== focused) {
      this._hadFocus = focused;
      this._onChange.fire(void 0);
    }
  }
  hasFocus() {
    return this._hadFocus ?? false;
  }
  refreshState() {
    this._domFocusTracker.refreshState();
    this._overflowWidgetsDomNode?.refreshState?.();
  }
}
export {
  View
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBGYXN0RG9tTm9kZSwgY3JlYXRlRmFzdERvbU5vZGUgfSBmcm9tICcuLi8uLi9iYXNlL2Jyb3dzZXIvZmFzdERvbU5vZGUuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IGlucHV0TGF0ZW5jeSB9IGZyb20gJy4uLy4uL2Jhc2UvYnJvd3Nlci9wZXJmb3JtYW5jZS5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVBvaW50ZXJIYW5kbGVySGVscGVyIH0gZnJvbSAnLi9jb250cm9sbGVyL21vdXNlSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBQb2ludGVySGFuZGxlckxhc3RSZW5kZXJEYXRhIH0gZnJvbSAnLi9jb250cm9sbGVyL21vdXNlVGFyZ2V0LmpzJztcbmltcG9ydCB7IFBvaW50ZXJIYW5kbGVyIH0gZnJvbSAnLi9jb250cm9sbGVyL3BvaW50ZXJIYW5kbGVyLmpzJztcbmltcG9ydCB7IElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uLCBJRWRpdG9yQXJpYU9wdGlvbnMsIElHbHlwaE1hcmdpbldpZGdldCwgSUdseXBoTWFyZ2luV2lkZ2V0UG9zaXRpb24sIElNb3VzZVRhcmdldCwgSU92ZXJsYXlXaWRnZXQsIElPdmVybGF5V2lkZ2V0UG9zaXRpb24sIElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yIH0gZnJvbSAnLi9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IExpbmVWaXNpYmxlUmFuZ2VzLCBSZW5kZXJpbmdDb250ZXh0LCBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCB9IGZyb20gJy4vdmlldy9yZW5kZXJpbmdDb250ZXh0LmpzJztcbmltcG9ydCB7IElDb21tYW5kRGVsZWdhdGUsIFZpZXdDb250cm9sbGVyIH0gZnJvbSAnLi92aWV3L3ZpZXdDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENvbnRlbnRWaWV3T3ZlcmxheXMsIE1hcmdpblZpZXdPdmVybGF5cyB9IGZyb20gJy4vdmlldy92aWV3T3ZlcmxheXMuanMnO1xuaW1wb3J0IHsgUGFydEZpbmdlcnByaW50LCBQYXJ0RmluZ2VycHJpbnRzLCBWaWV3UGFydCB9IGZyb20gJy4vdmlldy92aWV3UGFydC5qcyc7XG5pbXBvcnQgeyBWaWV3VXNlcklucHV0RXZlbnRzIH0gZnJvbSAnLi92aWV3L3ZpZXdVc2VySW5wdXRFdmVudHMuanMnO1xuaW1wb3J0IHsgQmxvY2tEZWNvcmF0aW9ucyB9IGZyb20gJy4vdmlld1BhcnRzL2Jsb2NrRGVjb3JhdGlvbnMvYmxvY2tEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGVudFdpZGdldHMgfSBmcm9tICcuL3ZpZXdQYXJ0cy9jb250ZW50V2lkZ2V0cy9jb250ZW50V2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBDdXJyZW50TGluZUhpZ2hsaWdodE92ZXJsYXksIEN1cnJlbnRMaW5lTWFyZ2luSGlnaGxpZ2h0T3ZlcmxheSB9IGZyb20gJy4vdmlld1BhcnRzL2N1cnJlbnRMaW5lSGlnaGxpZ2h0L2N1cnJlbnRMaW5lSGlnaGxpZ2h0LmpzJztcbmltcG9ydCB7IERlY29yYXRpb25zT3ZlcmxheSB9IGZyb20gJy4vdmlld1BhcnRzL2RlY29yYXRpb25zL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvclNjcm9sbGJhciB9IGZyb20gJy4vdmlld1BhcnRzL2VkaXRvclNjcm9sbGJhci9lZGl0b3JTY3JvbGxiYXIuanMnO1xuaW1wb3J0IHsgR2x5cGhNYXJnaW5XaWRnZXRzIH0gZnJvbSAnLi92aWV3UGFydHMvZ2x5cGhNYXJnaW4vZ2x5cGhNYXJnaW4uanMnO1xuaW1wb3J0IHsgSW5kZW50R3VpZGVzT3ZlcmxheSB9IGZyb20gJy4vdmlld1BhcnRzL2luZGVudEd1aWRlcy9pbmRlbnRHdWlkZXMuanMnO1xuaW1wb3J0IHsgTGluZU51bWJlcnNPdmVybGF5IH0gZnJvbSAnLi92aWV3UGFydHMvbGluZU51bWJlcnMvbGluZU51bWJlcnMuanMnO1xuaW1wb3J0IHsgVmlld0xpbmVzIH0gZnJvbSAnLi92aWV3UGFydHMvdmlld0xpbmVzL3ZpZXdMaW5lcy5qcyc7XG5pbXBvcnQgeyBMaW5lc0RlY29yYXRpb25zT3ZlcmxheSB9IGZyb20gJy4vdmlld1BhcnRzL2xpbmVzRGVjb3JhdGlvbnMvbGluZXNEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJnaW4gfSBmcm9tICcuL3ZpZXdQYXJ0cy9tYXJnaW4vbWFyZ2luLmpzJztcbmltcG9ydCB7IE1hcmdpblZpZXdMaW5lRGVjb3JhdGlvbnNPdmVybGF5IH0gZnJvbSAnLi92aWV3UGFydHMvbWFyZ2luRGVjb3JhdGlvbnMvbWFyZ2luRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgTWluaW1hcCB9IGZyb20gJy4vdmlld1BhcnRzL21pbmltYXAvbWluaW1hcC5qcyc7XG5pbXBvcnQgeyBWaWV3T3ZlcmxheVdpZGdldHMgfSBmcm9tICcuL3ZpZXdQYXJ0cy9vdmVybGF5V2lkZ2V0cy9vdmVybGF5V2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBEZWNvcmF0aW9uc092ZXJ2aWV3UnVsZXIgfSBmcm9tICcuL3ZpZXdQYXJ0cy9vdmVydmlld1J1bGVyL2RlY29yYXRpb25zT3ZlcnZpZXdSdWxlci5qcyc7XG5pbXBvcnQgeyBPdmVydmlld1J1bGVyIH0gZnJvbSAnLi92aWV3UGFydHMvb3ZlcnZpZXdSdWxlci9vdmVydmlld1J1bGVyLmpzJztcbmltcG9ydCB7IFJ1bGVycyB9IGZyb20gJy4vdmlld1BhcnRzL3J1bGVycy9ydWxlcnMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsRGVjb3JhdGlvblZpZXdQYXJ0IH0gZnJvbSAnLi92aWV3UGFydHMvc2Nyb2xsRGVjb3JhdGlvbi9zY3JvbGxEZWNvcmF0aW9uLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbnNPdmVybGF5IH0gZnJvbSAnLi92aWV3UGFydHMvc2VsZWN0aW9ucy9zZWxlY3Rpb25zLmpzJztcbmltcG9ydCB7IFZpZXdDdXJzb3JzIH0gZnJvbSAnLi92aWV3UGFydHMvdmlld0N1cnNvcnMvdmlld0N1cnNvcnMuanMnO1xuaW1wb3J0IHsgVmlld1pvbmVzIH0gZnJvbSAnLi92aWV3UGFydHMvdmlld1pvbmVzL3ZpZXdab25lcy5qcyc7XG5pbXBvcnQgeyBXaGl0ZXNwYWNlT3ZlcmxheSB9IGZyb20gJy4vdmlld1BhcnRzL3doaXRlc3BhY2Uvd2hpdGVzcGFjZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBHbHlwaE1hcmdpbkxhbmUsIElHbHlwaE1hcmdpbkxhbmVzTW9kZWwgfSBmcm9tICcuLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVmlld0V2ZW50SGFuZGxlciB9IGZyb20gJy4uL2NvbW1vbi92aWV3RXZlbnRIYW5kbGVyLmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgVmlld3BvcnREYXRhIH0gZnJvbSAnLi4vY29tbW9uL3ZpZXdMYXlvdXQvdmlld0xpbmVzVmlld3BvcnREYXRhLmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDb2xvclRoZW1lLCBnZXRUaGVtZVR5cGVTZWxlY3RvciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld0dwdUNvbnRleHQgfSBmcm9tICcuL2dwdS92aWV3R3B1Q29udGV4dC5qcyc7XG5pbXBvcnQgeyBWaWV3TGluZXNHcHUgfSBmcm9tICcuL3ZpZXdQYXJ0cy92aWV3TGluZXNHcHUvdmlld0xpbmVzR3B1LmpzJztcbmltcG9ydCB7IEFic3RyYWN0RWRpdENvbnRleHQgfSBmcm9tICcuL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvZWRpdENvbnRleHQuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZENvcHlFdmVudCwgSUNsaXBib2FyZFBhc3RlRXZlbnQgfSBmcm9tICcuL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvY2xpcGJvYXJkVXRpbHMuanMnO1xuaW1wb3J0IHsgSVZpc2libGVSYW5nZVByb3ZpZGVyLCBUZXh0QXJlYUVkaXRDb250ZXh0IH0gZnJvbSAnLi9jb250cm9sbGVyL2VkaXRDb250ZXh0L3RleHRBcmVhL3RleHRBcmVhRWRpdENvbnRleHQuanMnO1xuaW1wb3J0IHsgTmF0aXZlRWRpdENvbnRleHQgfSBmcm9tICcuL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvbmF0aXZlL25hdGl2ZUVkaXRDb250ZXh0LmpzJztcbmltcG9ydCB7IFJ1bGVyc0dwdSB9IGZyb20gJy4vdmlld1BhcnRzL3J1bGVyc0dwdS9ydWxlcnNHcHUuanMnO1xuaW1wb3J0IHsgR3B1TWFya092ZXJsYXkgfSBmcm9tICcuL3ZpZXdQYXJ0cy9ncHVNYXJrL2dwdU1hcmsuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVN1cHBvcnQgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS91c2VySW50ZXJhY3Rpb24vYnJvd3Nlci91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmpzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZW50V2lkZ2V0RGF0YSB7XG5cdHdpZGdldDogSUNvbnRlbnRXaWRnZXQ7XG5cdHBvc2l0aW9uOiBJQ29udGVudFdpZGdldFBvc2l0aW9uIHwgbnVsbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3ZlcmxheVdpZGdldERhdGEge1xuXHR3aWRnZXQ6IElPdmVybGF5V2lkZ2V0O1xuXHRwb3NpdGlvbjogSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUdseXBoTWFyZ2luV2lkZ2V0RGF0YSB7XG5cdHdpZGdldDogSUdseXBoTWFyZ2luV2lkZ2V0O1xuXHRwb3NpdGlvbjogSUdseXBoTWFyZ2luV2lkZ2V0UG9zaXRpb247XG59XG5cbmV4cG9ydCBjbGFzcyBWaWV3IGV4dGVuZHMgVmlld0V2ZW50SGFuZGxlciB7XG5cblx0cHJpdmF0ZSBfd2lkZ2V0Rm9jdXNUcmFja2VyOiBDb2RlRWRpdG9yV2lkZ2V0Rm9jdXNUcmFja2VyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Njcm9sbGJhcjogRWRpdG9yU2Nyb2xsYmFyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBWaWV3Q29udGV4dDtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld0dwdUNvbnRleHQ/OiBWaWV3R3B1Q29udGV4dDtcblx0cHJpdmF0ZSBfc2VsZWN0aW9uczogU2VsZWN0aW9uW107XG5cblx0Ly8gVGhlIHZpZXcgbGluZXNcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld0xpbmVzOiBWaWV3TGluZXM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdMaW5lc0dwdT86IFZpZXdMaW5lc0dwdTtcblxuXHQvLyBUaGVzZSBhcmUgcGFydHMsIGJ1dCB3ZSBtdXN0IGRvIHNvbWUgQVBJIHJlbGF0ZWQgY2FsbHMgb24gdGhlbSwgc28gd2Uga2VlcCBhIHJlZmVyZW5jZVxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3Wm9uZXM6IFZpZXdab25lcztcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudFdpZGdldHM6IFZpZXdDb250ZW50V2lkZ2V0cztcblx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcmxheVdpZGdldHM6IFZpZXdPdmVybGF5V2lkZ2V0cztcblx0cHJpdmF0ZSByZWFkb25seSBfZ2x5cGhNYXJnaW5XaWRnZXRzOiBHbHlwaE1hcmdpbldpZGdldHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdDdXJzb3JzOiBWaWV3Q3Vyc29ycztcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld1BhcnRzOiBWaWV3UGFydFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3Q29udHJvbGxlcjogVmlld0NvbnRyb2xsZXI7XG5cblx0cHJpdmF0ZSBfZWRpdENvbnRleHRFbmFibGVkOiBib29sZWFuO1xuXHRwcml2YXRlIF9hY2Nlc3NpYmlsaXR5U3VwcG9ydDogQWNjZXNzaWJpbGl0eVN1cHBvcnQ7XG5cdHByaXZhdGUgX2VkaXRDb250ZXh0OiBBYnN0cmFjdEVkaXRDb250ZXh0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0Q29udGV4dENsaXBib2FyZExpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcG9pbnRlckhhbmRsZXI6IFBvaW50ZXJIYW5kbGVyO1xuXG5cdC8vIENsaXBib2FyZCBldmVudHMgcmVsYXllZCBmcm9tIGVkaXRDb250ZXh0XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbENvcHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2xpcGJvYXJkQ29weUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbENvcHk6IEV2ZW50PElDbGlwYm9hcmRDb3B5RXZlbnQ+ID0gdGhpcy5fb25XaWxsQ29weS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxDdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2xpcGJvYXJkQ29weUV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uV2lsbEN1dDogRXZlbnQ8SUNsaXBib2FyZENvcHlFdmVudD4gPSB0aGlzLl9vbldpbGxDdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsUGFzdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2xpcGJvYXJkUGFzdGVFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxQYXN0ZTogRXZlbnQ8SUNsaXBib2FyZFBhc3RlRXZlbnQ+ID0gdGhpcy5fb25XaWxsUGFzdGUuZXZlbnQ7XG5cblx0Ly8gRG9tIG5vZGVzXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVzQ29udGVudDogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdmVyZmxvd0d1YXJkQ29udGFpbmVyOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cblx0Ly8gQWN0dWFsIG11dGFibGUgc3RhdGVcblx0cHJpdmF0ZSBfc2hvdWxkUmVjb21wdXRlR2x5cGhNYXJnaW5MYW5lczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9yZW5kZXJBbmltYXRpb25GcmFtZTogSURpc3Bvc2FibGUgfCBudWxsO1xuXHRwcml2YXRlIF9vd25lcklEOiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yQ29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRvd25lcklEOiBzdHJpbmcsXG5cdFx0Y29tbWFuZERlbGVnYXRlOiBJQ29tbWFuZERlbGVnYXRlLFxuXHRcdGNvbmZpZ3VyYXRpb246IElFZGl0b3JDb25maWd1cmF0aW9uLFxuXHRcdGNvbG9yVGhlbWU6IElDb2xvclRoZW1lLFxuXHRcdG1vZGVsOiBJVmlld01vZGVsLFxuXHRcdHVzZXJJbnB1dEV2ZW50czogVmlld1VzZXJJbnB1dEV2ZW50cyxcblx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJJbnRlcmFjdGlvblNlcnZpY2U6IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX293bmVySUQgPSBvd25lcklEO1xuXG5cdFx0dGhpcy5fd2lkZ2V0Rm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRuZXcgQ29kZUVkaXRvcldpZGdldEZvY3VzVHJhY2tlcihlZGl0b3JDb250YWluZXIsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsIHRoaXMuX3VzZXJJbnRlcmFjdGlvblNlcnZpY2UpXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl93aWRnZXRGb2N1c1RyYWNrZXIub25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwuc2V0SGFzV2lkZ2V0Rm9jdXModGhpcy5fd2lkZ2V0Rm9jdXNUcmFja2VyLmhhc0ZvY3VzKCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3NlbGVjdGlvbnMgPSBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV07XG5cdFx0dGhpcy5fcmVuZGVyQW5pbWF0aW9uRnJhbWUgPSBudWxsO1xuXG5cdFx0dGhpcy5fb3ZlcmZsb3dHdWFyZENvbnRhaW5lciA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRQYXJ0RmluZ2VycHJpbnRzLndyaXRlKHRoaXMuX292ZXJmbG93R3VhcmRDb250YWluZXIsIFBhcnRGaW5nZXJwcmludC5PdmVyZmxvd0d1YXJkKTtcblx0XHR0aGlzLl9vdmVyZmxvd0d1YXJkQ29udGFpbmVyLnNldENsYXNzTmFtZSgnb3ZlcmZsb3ctZ3VhcmQnKTtcblxuXHRcdHRoaXMuX3ZpZXdDb250cm9sbGVyID0gbmV3IFZpZXdDb250cm9sbGVyKGNvbmZpZ3VyYXRpb24sIG1vZGVsLCB1c2VySW5wdXRFdmVudHMsIGNvbW1hbmREZWxlZ2F0ZSk7XG5cblx0XHQvLyBUaGUgdmlldyBjb250ZXh0IGlzIHBhc3NlZCBvbiB0byBtb3N0IGNsYXNzZXMgKGJhc2ljYWxseSB0byByZWR1Y2UgcGFyYW0uIGNvdW50cyBpbiBjdG9ycylcblx0XHR0aGlzLl9jb250ZXh0ID0gbmV3IFZpZXdDb250ZXh0KGNvbmZpZ3VyYXRpb24sIGNvbG9yVGhlbWUsIG1vZGVsKTtcblxuXHRcdC8vIEVuc3VyZSB0aGUgdmlldyBpcyB0aGUgZmlyc3QgZXZlbnQgaGFuZGxlciBpbiBvcmRlciB0byB1cGRhdGUgdGhlIGxheW91dFxuXHRcdHRoaXMuX2NvbnRleHQuYWRkRXZlbnRIYW5kbGVyKHRoaXMpO1xuXG5cdFx0dGhpcy5fdmlld1BhcnRzID0gW107XG5cblx0XHQvLyBLZXlib2FyZCBoYW5kbGVyXG5cdFx0dGhpcy5fZWRpdENvbnRleHRFbmFibGVkID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5lZmZlY3RpdmVFZGl0Q29udGV4dCk7XG5cdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlTdXBwb3J0KTtcblx0XHR0aGlzLl9lZGl0Q29udGV4dCA9IHRoaXMuX2luc3RhbnRpYXRlRWRpdENvbnRleHQoKTtcblx0XHR0aGlzLl9jb25uZWN0RWRpdENvbnRleHRDbGlwYm9hcmRFdmVudHMoKTtcblxuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKHRoaXMuX2VkaXRDb250ZXh0KTtcblxuXHRcdC8vIFRoZXNlIHR3byBkb20gbm9kZXMgbXVzdCBiZSBjb25zdHJ1Y3RlZCB1cCBmcm9udCwgc2luY2UgcmVmZXJlbmNlcyBhcmUgbmVlZGVkIGluIHRoZSBsYXlvdXQgcHJvdmlkZXIgKHNjcm9sbGluZyAmIGNvLilcblx0XHR0aGlzLl9saW5lc0NvbnRlbnQgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0dGhpcy5fbGluZXNDb250ZW50LnNldENsYXNzTmFtZSgnbGluZXMtY29udGVudCcgKyAnIG1vbmFjby1lZGl0b3ItYmFja2dyb3VuZCcpO1xuXHRcdHRoaXMuX2xpbmVzQ29udGVudC5zZXRQb3NpdGlvbignYWJzb2x1dGUnKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHR0aGlzLmRvbU5vZGUuc2V0Q2xhc3NOYW1lKHRoaXMuX2dldEVkaXRvckNsYXNzTmFtZSgpKTtcblx0XHQvLyBTZXQgcm9sZSAnY29kZScgZm9yIGJldHRlciBzY3JlZW4gcmVhZGVyIHN1cHBvcnQgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzkzNDM4XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdjb2RlJyk7XG5cblx0XHRpZiAodGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5leHBlcmltZW50YWxHcHVBY2NlbGVyYXRpb24pID09PSAnb24nKSB7XG5cdFx0XHR0aGlzLl92aWV3R3B1Q29udGV4dCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZpZXdHcHVDb250ZXh0LCB0aGlzLl9jb250ZXh0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9zY3JvbGxiYXIgPSBuZXcgRWRpdG9yU2Nyb2xsYmFyKHRoaXMuX2NvbnRleHQsIHRoaXMuX2xpbmVzQ29udGVudCwgdGhpcy5kb21Ob2RlLCB0aGlzLl9vdmVyZmxvd0d1YXJkQ29udGFpbmVyKTtcblx0XHR0aGlzLl92aWV3UGFydHMucHVzaCh0aGlzLl9zY3JvbGxiYXIpO1xuXG5cdFx0Ly8gVmlldyBMaW5lc1xuXHRcdHRoaXMuX3ZpZXdMaW5lcyA9IG5ldyBWaWV3TGluZXModGhpcy5fY29udGV4dCwgdGhpcy5fdmlld0dwdUNvbnRleHQsIHRoaXMuX2xpbmVzQ29udGVudCk7XG5cdFx0aWYgKHRoaXMuX3ZpZXdHcHVDb250ZXh0KSB7XG5cdFx0XHR0aGlzLl92aWV3TGluZXNHcHUgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3TGluZXNHcHUsIHRoaXMuX2NvbnRleHQsIHRoaXMuX3ZpZXdHcHVDb250ZXh0KTtcblx0XHR9XG5cblx0XHQvLyBWaWV3IFpvbmVzXG5cdFx0dGhpcy5fdmlld1pvbmVzID0gbmV3IFZpZXdab25lcyh0aGlzLl9jb250ZXh0KTtcblx0XHR0aGlzLl92aWV3UGFydHMucHVzaCh0aGlzLl92aWV3Wm9uZXMpO1xuXG5cdFx0Ly8gRGVjb3JhdGlvbnMgb3ZlcnZpZXcgcnVsZXJcblx0XHRjb25zdCBkZWNvcmF0aW9uc092ZXJ2aWV3UnVsZXIgPSBuZXcgRGVjb3JhdGlvbnNPdmVydmlld1J1bGVyKHRoaXMuX2NvbnRleHQpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKGRlY29yYXRpb25zT3ZlcnZpZXdSdWxlcik7XG5cblxuXHRcdGNvbnN0IHNjcm9sbERlY29yYXRpb24gPSBuZXcgU2Nyb2xsRGVjb3JhdGlvblZpZXdQYXJ0KHRoaXMuX2NvbnRleHQpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKHNjcm9sbERlY29yYXRpb24pO1xuXG5cdFx0Y29uc3QgY29udGVudFZpZXdPdmVybGF5cyA9IG5ldyBDb250ZW50Vmlld092ZXJsYXlzKHRoaXMuX2NvbnRleHQpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKGNvbnRlbnRWaWV3T3ZlcmxheXMpO1xuXHRcdGNvbnRlbnRWaWV3T3ZlcmxheXMuYWRkRHluYW1pY092ZXJsYXkobmV3IEN1cnJlbnRMaW5lSGlnaGxpZ2h0T3ZlcmxheSh0aGlzLl9jb250ZXh0KSk7XG5cdFx0Y29udGVudFZpZXdPdmVybGF5cy5hZGREeW5hbWljT3ZlcmxheShuZXcgU2VsZWN0aW9uc092ZXJsYXkodGhpcy5fY29udGV4dCkpO1xuXHRcdGNvbnRlbnRWaWV3T3ZlcmxheXMuYWRkRHluYW1pY092ZXJsYXkobmV3IEluZGVudEd1aWRlc092ZXJsYXkodGhpcy5fY29udGV4dCkpO1xuXHRcdGNvbnRlbnRWaWV3T3ZlcmxheXMuYWRkRHluYW1pY092ZXJsYXkobmV3IERlY29yYXRpb25zT3ZlcmxheSh0aGlzLl9jb250ZXh0KSk7XG5cdFx0Y29udGVudFZpZXdPdmVybGF5cy5hZGREeW5hbWljT3ZlcmxheShuZXcgV2hpdGVzcGFjZU92ZXJsYXkodGhpcy5fY29udGV4dCkpO1xuXG5cdFx0Y29uc3QgbWFyZ2luVmlld092ZXJsYXlzID0gbmV3IE1hcmdpblZpZXdPdmVybGF5cyh0aGlzLl9jb250ZXh0KTtcblx0XHR0aGlzLl92aWV3UGFydHMucHVzaChtYXJnaW5WaWV3T3ZlcmxheXMpO1xuXHRcdG1hcmdpblZpZXdPdmVybGF5cy5hZGREeW5hbWljT3ZlcmxheShuZXcgQ3VycmVudExpbmVNYXJnaW5IaWdobGlnaHRPdmVybGF5KHRoaXMuX2NvbnRleHQpKTtcblx0XHRtYXJnaW5WaWV3T3ZlcmxheXMuYWRkRHluYW1pY092ZXJsYXkobmV3IE1hcmdpblZpZXdMaW5lRGVjb3JhdGlvbnNPdmVybGF5KHRoaXMuX2NvbnRleHQpKTtcblx0XHRtYXJnaW5WaWV3T3ZlcmxheXMuYWRkRHluYW1pY092ZXJsYXkobmV3IExpbmVzRGVjb3JhdGlvbnNPdmVybGF5KHRoaXMuX2NvbnRleHQpKTtcblx0XHRtYXJnaW5WaWV3T3ZlcmxheXMuYWRkRHluYW1pY092ZXJsYXkobmV3IExpbmVOdW1iZXJzT3ZlcmxheSh0aGlzLl9jb250ZXh0KSk7XG5cdFx0aWYgKHRoaXMuX3ZpZXdHcHVDb250ZXh0KSB7XG5cdFx0XHRtYXJnaW5WaWV3T3ZlcmxheXMuYWRkRHluYW1pY092ZXJsYXkobmV3IEdwdU1hcmtPdmVybGF5KHRoaXMuX2NvbnRleHQsIHRoaXMuX3ZpZXdHcHVDb250ZXh0KSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2x5cGggbWFyZ2luIHdpZGdldHNcblx0XHR0aGlzLl9nbHlwaE1hcmdpbldpZGdldHMgPSBuZXcgR2x5cGhNYXJnaW5XaWRnZXRzKHRoaXMuX2NvbnRleHQpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKHRoaXMuX2dseXBoTWFyZ2luV2lkZ2V0cyk7XG5cblx0XHRjb25zdCBtYXJnaW4gPSBuZXcgTWFyZ2luKHRoaXMuX2NvbnRleHQpO1xuXHRcdG1hcmdpbi5nZXREb21Ob2RlKCkuYXBwZW5kQ2hpbGQodGhpcy5fdmlld1pvbmVzLm1hcmdpbkRvbU5vZGUpO1xuXHRcdG1hcmdpbi5nZXREb21Ob2RlKCkuYXBwZW5kQ2hpbGQobWFyZ2luVmlld092ZXJsYXlzLmdldERvbU5vZGUoKSk7XG5cdFx0bWFyZ2luLmdldERvbU5vZGUoKS5hcHBlbmRDaGlsZCh0aGlzLl9nbHlwaE1hcmdpbldpZGdldHMuZG9tTm9kZSk7XG5cdFx0dGhpcy5fdmlld1BhcnRzLnB1c2gobWFyZ2luKTtcblxuXHRcdC8vIENvbnRlbnQgd2lkZ2V0c1xuXHRcdHRoaXMuX2NvbnRlbnRXaWRnZXRzID0gbmV3IFZpZXdDb250ZW50V2lkZ2V0cyh0aGlzLl9jb250ZXh0LCB0aGlzLmRvbU5vZGUpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKHRoaXMuX2NvbnRlbnRXaWRnZXRzKTtcblxuXHRcdHRoaXMuX3ZpZXdDdXJzb3JzID0gbmV3IFZpZXdDdXJzb3JzKHRoaXMuX2NvbnRleHQpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKHRoaXMuX3ZpZXdDdXJzb3JzKTtcblxuXHRcdC8vIE92ZXJsYXkgd2lkZ2V0c1xuXHRcdHRoaXMuX292ZXJsYXlXaWRnZXRzID0gbmV3IFZpZXdPdmVybGF5V2lkZ2V0cyh0aGlzLl9jb250ZXh0LCB0aGlzLmRvbU5vZGUpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKHRoaXMuX292ZXJsYXlXaWRnZXRzKTtcblxuXHRcdGNvbnN0IHJ1bGVycyA9IHRoaXMuX3ZpZXdHcHVDb250ZXh0XG5cdFx0XHQ/IG5ldyBSdWxlcnNHcHUodGhpcy5fY29udGV4dCwgdGhpcy5fdmlld0dwdUNvbnRleHQpXG5cdFx0XHQ6IG5ldyBSdWxlcnModGhpcy5fY29udGV4dCk7XG5cdFx0dGhpcy5fdmlld1BhcnRzLnB1c2gocnVsZXJzKTtcblxuXHRcdGNvbnN0IGJsb2NrT3V0bGluZSA9IG5ldyBCbG9ja0RlY29yYXRpb25zKHRoaXMuX2NvbnRleHQpO1xuXHRcdHRoaXMuX3ZpZXdQYXJ0cy5wdXNoKGJsb2NrT3V0bGluZSk7XG5cblx0XHRjb25zdCBtaW5pbWFwID0gbmV3IE1pbmltYXAodGhpcy5fY29udGV4dCk7XG5cdFx0dGhpcy5fdmlld1BhcnRzLnB1c2gobWluaW1hcCk7XG5cblx0XHQvLyAtLS0tLS0tLS0tLS0tLSBXaXJlIGRvbSBub2RlcyB1cFxuXG5cdFx0aWYgKGRlY29yYXRpb25zT3ZlcnZpZXdSdWxlcikge1xuXHRcdFx0Y29uc3Qgb3ZlcnZpZXdSdWxlckRhdGEgPSB0aGlzLl9zY3JvbGxiYXIuZ2V0T3ZlcnZpZXdSdWxlckxheW91dEluZm8oKTtcblx0XHRcdG92ZXJ2aWV3UnVsZXJEYXRhLnBhcmVudC5pbnNlcnRCZWZvcmUoZGVjb3JhdGlvbnNPdmVydmlld1J1bGVyLmdldERvbU5vZGUoKSwgb3ZlcnZpZXdSdWxlckRhdGEuaW5zZXJ0QmVmb3JlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9saW5lc0NvbnRlbnQuYXBwZW5kQ2hpbGQoY29udGVudFZpZXdPdmVybGF5cy5nZXREb21Ob2RlKCkpO1xuXHRcdGlmICgnZG9tTm9kZScgaW4gcnVsZXJzKSB7XG5cdFx0XHR0aGlzLl9saW5lc0NvbnRlbnQuYXBwZW5kQ2hpbGQocnVsZXJzLmRvbU5vZGUpO1xuXHRcdH1cblx0XHR0aGlzLl9saW5lc0NvbnRlbnQuYXBwZW5kQ2hpbGQodGhpcy5fdmlld1pvbmVzLmRvbU5vZGUpO1xuXHRcdHRoaXMuX2xpbmVzQ29udGVudC5hcHBlbmRDaGlsZCh0aGlzLl92aWV3TGluZXMuZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLl9saW5lc0NvbnRlbnQuYXBwZW5kQ2hpbGQodGhpcy5fY29udGVudFdpZGdldHMuZG9tTm9kZSk7XG5cdFx0dGhpcy5fbGluZXNDb250ZW50LmFwcGVuZENoaWxkKHRoaXMuX3ZpZXdDdXJzb3JzLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fb3ZlcmZsb3dHdWFyZENvbnRhaW5lci5hcHBlbmRDaGlsZChtYXJnaW4uZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLl9vdmVyZmxvd0d1YXJkQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3Njcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXHRcdGlmICh0aGlzLl92aWV3R3B1Q29udGV4dCkge1xuXHRcdFx0dGhpcy5fb3ZlcmZsb3dHdWFyZENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl92aWV3R3B1Q29udGV4dC5jYW52YXMpO1xuXHRcdH1cblx0XHR0aGlzLl9vdmVyZmxvd0d1YXJkQ29udGFpbmVyLmFwcGVuZENoaWxkKHNjcm9sbERlY29yYXRpb24uZ2V0RG9tTm9kZSgpKTtcblx0XHR0aGlzLl9vdmVyZmxvd0d1YXJkQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX292ZXJsYXlXaWRnZXRzLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fb3ZlcmZsb3dHdWFyZENvbnRhaW5lci5hcHBlbmRDaGlsZChtaW5pbWFwLmdldERvbU5vZGUoKSk7XG5cdFx0dGhpcy5fb3ZlcmZsb3dHdWFyZENvbnRhaW5lci5hcHBlbmRDaGlsZChibG9ja091dGxpbmUuZG9tTm9kZSk7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX292ZXJmbG93R3VhcmRDb250YWluZXIpO1xuXG5cdFx0aWYgKG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUpIHtcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fY29udGVudFdpZGdldHMub3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0c0RvbU5vZGUuZG9tTm9kZSk7XG5cdFx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX292ZXJsYXlXaWRnZXRzLm92ZXJmbG93aW5nT3ZlcmxheVdpZGdldHNEb21Ob2RlLmRvbU5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fY29udGVudFdpZGdldHMub3ZlcmZsb3dpbmdDb250ZW50V2lkZ2V0c0RvbU5vZGUpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX292ZXJsYXlXaWRnZXRzLm92ZXJmbG93aW5nT3ZlcmxheVdpZGdldHNEb21Ob2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9hcHBseUxheW91dCgpO1xuXG5cdFx0Ly8gUG9pbnRlciBoYW5kbGVyXG5cdFx0dGhpcy5fcG9pbnRlckhhbmRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUG9pbnRlckhhbmRsZXIodGhpcy5fY29udGV4dCwgdGhpcy5fdmlld0NvbnRyb2xsZXIsIHRoaXMuX2NyZWF0ZVBvaW50ZXJIYW5kbGVySGVscGVyKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2luc3RhbnRpYXRlRWRpdENvbnRleHQoKTogQWJzdHJhY3RFZGl0Q29udGV4dCB7XG5cdFx0Y29uc3QgdXNpbmdFeHBlcmltZW50YWxFZGl0Q29udGV4dCA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZWZmZWN0aXZlRWRpdENvbnRleHQpO1xuXHRcdGlmICh1c2luZ0V4cGVyaW1lbnRhbEVkaXRDb250ZXh0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmF0aXZlRWRpdENvbnRleHQsIHRoaXMuX293bmVySUQsIHRoaXMuX2NvbnRleHQsIHRoaXMuX292ZXJmbG93R3VhcmRDb250YWluZXIsIHRoaXMuX3ZpZXdDb250cm9sbGVyLCB0aGlzLl9jcmVhdGVUZXh0QXJlYUhhbmRsZXJIZWxwZXIoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0QXJlYUVkaXRDb250ZXh0LCB0aGlzLl9vd25lcklELCB0aGlzLl9jb250ZXh0LCB0aGlzLl9vdmVyZmxvd0d1YXJkQ29udGFpbmVyLCB0aGlzLl92aWV3Q29udHJvbGxlciwgdGhpcy5fY3JlYXRlVGV4dEFyZWFIYW5kbGVySGVscGVyKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUVkaXRDb250ZXh0KCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRDb250ZXh0RW5hYmxlZCA9IHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZWZmZWN0aXZlRWRpdENvbnRleHQpO1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTdXBwb3J0ID0gdGhpcy5fY29udGV4dC5jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCk7XG5cdFx0aWYgKHRoaXMuX2VkaXRDb250ZXh0RW5hYmxlZCA9PT0gZWRpdENvbnRleHRFbmFibGVkICYmIHRoaXMuX2FjY2Vzc2liaWxpdHlTdXBwb3J0ID09PSBhY2Nlc3NpYmlsaXR5U3VwcG9ydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9lZGl0Q29udGV4dEVuYWJsZWQgPSBlZGl0Q29udGV4dEVuYWJsZWQ7XG5cdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSBhY2Nlc3NpYmlsaXR5U3VwcG9ydDtcblx0XHRjb25zdCBpc0VkaXRDb250ZXh0Rm9jdXNlZCA9IHRoaXMuX2VkaXRDb250ZXh0LmlzRm9jdXNlZCgpO1xuXHRcdGNvbnN0IGluZGV4T2ZFZGl0Q29udGV4dCA9IHRoaXMuX3ZpZXdQYXJ0cy5pbmRleE9mKHRoaXMuX2VkaXRDb250ZXh0KTtcblx0XHR0aGlzLl9lZGl0Q29udGV4dC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZWRpdENvbnRleHQgPSB0aGlzLl9pbnN0YW50aWF0ZUVkaXRDb250ZXh0KCk7XG5cdFx0dGhpcy5fY29ubmVjdEVkaXRDb250ZXh0Q2xpcGJvYXJkRXZlbnRzKCk7XG5cdFx0aWYgKGlzRWRpdENvbnRleHRGb2N1c2VkKSB7XG5cdFx0XHR0aGlzLl9lZGl0Q29udGV4dC5mb2N1cygpO1xuXHRcdH1cblx0XHRpZiAoaW5kZXhPZkVkaXRDb250ZXh0ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5fdmlld1BhcnRzLnNwbGljZShpbmRleE9mRWRpdENvbnRleHQsIDEsIHRoaXMuX2VkaXRDb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb25uZWN0RWRpdENvbnRleHRDbGlwYm9hcmRFdmVudHMoKTogdm9pZCB7XG5cdFx0Ly8gRGlzcG9zZSBvbGQgbGlzdGVuZXJzXG5cdFx0dGhpcy5fZWRpdENvbnRleHRDbGlwYm9hcmRMaXN0ZW5lcnMuY2xlYXIoKTtcblxuXHRcdC8vIENvbm5lY3QgdG8gY3VycmVudCBlZGl0IGNvbnRleHQncyBjbGlwYm9hcmQgZXZlbnRzXG5cdFx0dGhpcy5fZWRpdENvbnRleHRDbGlwYm9hcmRMaXN0ZW5lcnMuYWRkKHRoaXMuX2VkaXRDb250ZXh0Lm9uV2lsbENvcHkoZSA9PiB0aGlzLl9vbldpbGxDb3B5LmZpcmUoZSkpKTtcblx0XHR0aGlzLl9lZGl0Q29udGV4dENsaXBib2FyZExpc3RlbmVycy5hZGQodGhpcy5fZWRpdENvbnRleHQub25XaWxsQ3V0KGUgPT4gdGhpcy5fb25XaWxsQ3V0LmZpcmUoZSkpKTtcblx0XHR0aGlzLl9lZGl0Q29udGV4dENsaXBib2FyZExpc3RlbmVycy5hZGQodGhpcy5fZWRpdENvbnRleHQub25XaWxsUGFzdGUoZSA9PiB0aGlzLl9vbldpbGxQYXN0ZS5maXJlKGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlR2x5cGhNYXJnaW5MYW5lcygpOiBJR2x5cGhNYXJnaW5MYW5lc01vZGVsIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLm1vZGVsO1xuXHRcdGNvbnN0IGxhbmVNb2RlbCA9IHRoaXMuX2NvbnRleHQudmlld01vZGVsLmdseXBoTGFuZXM7XG5cdFx0dHlwZSBHbHlwaCA9IHsgcmFuZ2U6IFJhbmdlOyBsYW5lOiBHbHlwaE1hcmdpbkxhbmU7IHBlcnNpc3Q/OiBib29sZWFuIH07XG5cdFx0bGV0IGdseXBoczogR2x5cGhbXSA9IFtdO1xuXHRcdGxldCBtYXhMaW5lTnVtYmVyID0gMDtcblxuXHRcdC8vIEFkZCBhbGwgbWFyZ2luIGRlY29yYXRpb25zXG5cdFx0Z2x5cGhzID0gZ2x5cGhzLmNvbmNhdChtb2RlbC5nZXRBbGxNYXJnaW5EZWNvcmF0aW9ucygpLm1hcCgoZGVjb3JhdGlvbikgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZSA9IGRlY29yYXRpb24ub3B0aW9ucy5nbHlwaE1hcmdpbj8ucG9zaXRpb24gPz8gR2x5cGhNYXJnaW5MYW5lLkNlbnRlcjtcblx0XHRcdG1heExpbmVOdW1iZXIgPSBNYXRoLm1heChtYXhMaW5lTnVtYmVyLCBkZWNvcmF0aW9uLnJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0cmV0dXJuIHsgcmFuZ2U6IGRlY29yYXRpb24ucmFuZ2UsIGxhbmUsIHBlcnNpc3Q6IGRlY29yYXRpb24ub3B0aW9ucy5nbHlwaE1hcmdpbj8ucGVyc2lzdExhbmUgfTtcblx0XHR9KSk7XG5cblx0XHQvLyBBZGQgYWxsIGdseXBoIG1hcmdpbiB3aWRnZXRzXG5cdFx0Z2x5cGhzID0gZ2x5cGhzLmNvbmNhdCh0aGlzLl9nbHlwaE1hcmdpbldpZGdldHMuZ2V0V2lkZ2V0cygpLm1hcCgod2lkZ2V0KSA9PiB7XG5cdFx0XHRjb25zdCByYW5nZSA9IG1vZGVsLnZhbGlkYXRlUmFuZ2Uod2lkZ2V0LnByZWZlcmVuY2UucmFuZ2UpO1xuXHRcdFx0bWF4TGluZU51bWJlciA9IE1hdGgubWF4KG1heExpbmVOdW1iZXIsIHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdFx0cmV0dXJuIHsgcmFuZ2UsIGxhbmU6IHdpZGdldC5wcmVmZXJlbmNlLmxhbmUgfTtcblx0XHR9KSk7XG5cblx0XHQvLyBTb3J0ZWQgYnkgdGhlaXIgc3RhcnQgcG9zaXRpb25cblx0XHRnbHlwaHMuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEucmFuZ2UsIGIucmFuZ2UpKTtcblxuXHRcdGxhbmVNb2RlbC5yZXNldChtYXhMaW5lTnVtYmVyKTtcblx0XHRmb3IgKGNvbnN0IGdseXBoIG9mIGdseXBocykge1xuXHRcdFx0bGFuZU1vZGVsLnB1c2goZ2x5cGgubGFuZSwgZ2x5cGgucmFuZ2UsIGdseXBoLnBlcnNpc3QpO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYW5lTW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVQb2ludGVySGFuZGxlckhlbHBlcigpOiBJUG9pbnRlckhhbmRsZXJIZWxwZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHR2aWV3RG9tTm9kZTogdGhpcy5kb21Ob2RlLmRvbU5vZGUsXG5cdFx0XHRsaW5lc0NvbnRlbnREb21Ob2RlOiB0aGlzLl9saW5lc0NvbnRlbnQuZG9tTm9kZSxcblx0XHRcdHZpZXdMaW5lc0RvbU5vZGU6IHRoaXMuX3ZpZXdMaW5lcy5nZXREb21Ob2RlKCkuZG9tTm9kZSxcblx0XHRcdHZpZXdMaW5lc0dwdTogdGhpcy5fdmlld0xpbmVzR3B1LFxuXG5cdFx0XHRmb2N1c1RleHRBcmVhOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHRcdH0sXG5cblx0XHRcdGRpc3BhdGNoVGV4dEFyZWFFdmVudDogKGV2ZW50OiBDdXN0b21FdmVudCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lZGl0Q29udGV4dC5kb21Ob2RlLmRvbU5vZGUuZGlzcGF0Y2hFdmVudChldmVudCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXRMYXN0UmVuZGVyRGF0YTogKCk6IFBvaW50ZXJIYW5kbGVyTGFzdFJlbmRlckRhdGEgPT4ge1xuXHRcdFx0XHRjb25zdCBsYXN0Vmlld0N1cnNvcnNSZW5kZXJEYXRhID0gdGhpcy5fdmlld0N1cnNvcnMuZ2V0TGFzdFJlbmRlckRhdGEoKSB8fCBbXTtcblx0XHRcdFx0Y29uc3QgbGFzdFRleHRhcmVhUG9zaXRpb24gPSB0aGlzLl9lZGl0Q29udGV4dC5nZXRMYXN0UmVuZGVyRGF0YSgpO1xuXHRcdFx0XHRyZXR1cm4gbmV3IFBvaW50ZXJIYW5kbGVyTGFzdFJlbmRlckRhdGEobGFzdFZpZXdDdXJzb3JzUmVuZGVyRGF0YSwgbGFzdFRleHRhcmVhUG9zaXRpb24pO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlck5vdzogKCk6IHZvaWQgPT4ge1xuXHRcdFx0XHR0aGlzLnJlbmRlcih0cnVlLCBmYWxzZSk7XG5cdFx0XHR9LFxuXHRcdFx0c2hvdWxkU3VwcHJlc3NNb3VzZURvd25PblZpZXdab25lOiAodmlld1pvbmVJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl92aWV3Wm9uZXMuc2hvdWxkU3VwcHJlc3NNb3VzZURvd25PblZpZXdab25lKHZpZXdab25lSWQpO1xuXHRcdFx0fSxcblx0XHRcdHNob3VsZFN1cHByZXNzTW91c2VEb3duT25XaWRnZXQ6ICh3aWRnZXRJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jb250ZW50V2lkZ2V0cy5zaG91bGRTdXBwcmVzc01vdXNlRG93bk9uV2lkZ2V0KHdpZGdldElkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRQb3NpdGlvbkZyb21ET01JbmZvOiAoc3Bhbk5vZGU6IEhUTUxFbGVtZW50LCBvZmZzZXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHR0aGlzLl9mbHVzaEFjY3VtdWxhdGVkQW5kUmVuZGVyTm93KCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl92aWV3TGluZXMuZ2V0UG9zaXRpb25Gcm9tRE9NSW5mbyhzcGFuTm9kZSwgb2Zmc2V0KTtcblx0XHRcdH0sXG5cblx0XHRcdHZpc2libGVSYW5nZUZvclBvc2l0aW9uOiAobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcikgPT4ge1xuXHRcdFx0XHR0aGlzLl9mbHVzaEFjY3VtdWxhdGVkQW5kUmVuZGVyTm93KCk7XG5cdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHRcdHJldHVybiB0aGlzLl92aWV3TGluZXMudmlzaWJsZVJhbmdlRm9yUG9zaXRpb24ocG9zaXRpb24pID8/IHRoaXMuX3ZpZXdMaW5lc0dwdT8udmlzaWJsZVJhbmdlRm9yUG9zaXRpb24ocG9zaXRpb24pID8/IG51bGw7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXRMaW5lV2lkdGg6IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdFx0dGhpcy5fZmx1c2hBY2N1bXVsYXRlZEFuZFJlbmRlck5vdygpO1xuXHRcdFx0XHRpZiAodGhpcy5fdmlld0xpbmVzR3B1KSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fdmlld0xpbmVzR3B1LmdldExpbmVXaWR0aChsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAocmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLl92aWV3TGluZXMuZ2V0TGluZVdpZHRoKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUZXh0QXJlYUhhbmRsZXJIZWxwZXIoKTogSVZpc2libGVSYW5nZVByb3ZpZGVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dmlzaWJsZVJhbmdlRm9yUG9zaXRpb246IChwb3NpdGlvbjogUG9zaXRpb24pID0+IHtcblx0XHRcdFx0dGhpcy5fZmx1c2hBY2N1bXVsYXRlZEFuZFJlbmRlck5vdygpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdmlld0xpbmVzLnZpc2libGVSYW5nZUZvclBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdH0sXG5cdFx0XHRsaW5lc1Zpc2libGVSYW5nZXNGb3JSYW5nZTogKHJhbmdlOiBSYW5nZSwgaW5jbHVkZU5ld0xpbmVzOiBib29sZWFuKTogTGluZVZpc2libGVSYW5nZXNbXSB8IG51bGwgPT4ge1xuXHRcdFx0XHR0aGlzLl9mbHVzaEFjY3VtdWxhdGVkQW5kUmVuZGVyTm93KCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl92aWV3TGluZXMubGluZXNWaXNpYmxlUmFuZ2VzRm9yUmFuZ2UocmFuZ2UsIGluY2x1ZGVOZXdMaW5lcyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5TGF5b3V0KCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXG5cdFx0dGhpcy5kb21Ob2RlLnNldFdpZHRoKGxheW91dEluZm8ud2lkdGgpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRIZWlnaHQobGF5b3V0SW5mby5oZWlnaHQpO1xuXG5cdFx0dGhpcy5fb3ZlcmZsb3dHdWFyZENvbnRhaW5lci5zZXRXaWR0aChsYXlvdXRJbmZvLndpZHRoKTtcblx0XHR0aGlzLl9vdmVyZmxvd0d1YXJkQ29udGFpbmVyLnNldEhlaWdodChsYXlvdXRJbmZvLmhlaWdodCk7XG5cblx0XHQvLyBodHRwczovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8zODkwNTkxNi9jb250ZW50LWluLWdvb2dsZS1jaHJvbWUtbGFyZ2VyLXRoYW4tMTY3NzcyMTYtcHgtbm90LWJlaW5nLXJlbmRlcmVkXG5cdFx0dGhpcy5fbGluZXNDb250ZW50LnNldFdpZHRoKDE2Nzc3MjE2KTtcblx0XHR0aGlzLl9saW5lc0NvbnRlbnQuc2V0SGVpZ2h0KDE2Nzc3MjE2KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVkaXRvckNsYXNzTmFtZSgpIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fZWRpdENvbnRleHQuaXNGb2N1c2VkKCkgPyAnIGZvY3VzZWQnIDogJyc7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZWRpdG9yQ2xhc3NOYW1lKSArICcgJyArIGdldFRoZW1lVHlwZVNlbGVjdG9yKHRoaXMuX2NvbnRleHQudGhlbWUudHlwZSkgKyBmb2N1c2VkO1xuXHR9XG5cblx0Ly8gLS0tIGJlZ2luIGV2ZW50IGhhbmRsZXJzXG5cdHB1YmxpYyBvdmVycmlkZSBoYW5kbGVFdmVudHMoZXZlbnRzOiB2aWV3RXZlbnRzLlZpZXdFdmVudFtdKTogdm9pZCB7XG5cdFx0c3VwZXIuaGFuZGxlRXZlbnRzKGV2ZW50cyk7XG5cdFx0dGhpcy5fc2NoZWR1bGVSZW5kZXIoKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5kb21Ob2RlLnNldENsYXNzTmFtZSh0aGlzLl9nZXRFZGl0b3JDbGFzc05hbWUoKSk7XG5cdFx0dGhpcy5fdXBkYXRlRWRpdENvbnRleHQoKTtcblx0XHR0aGlzLl9hcHBseUxheW91dCgpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25DdXJzb3JTdGF0ZUNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q3Vyc29yU3RhdGVDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHR0aGlzLl9zZWxlY3Rpb25zID0gZS5zZWxlY3Rpb25zO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgb25EZWNvcmF0aW9uc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZS5hZmZlY3RzR2x5cGhNYXJnaW4pIHtcblx0XHRcdHRoaXMuX3Nob3VsZFJlY29tcHV0ZUdseXBoTWFyZ2luTGFuZXMgPSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0cHVibGljIG92ZXJyaWRlIG9uRm9jdXNDaGFuZ2VkKGU6IHZpZXdFdmVudHMuVmlld0ZvY3VzQ2hhbmdlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0dGhpcy5kb21Ob2RlLnNldENsYXNzTmFtZSh0aGlzLl9nZXRFZGl0b3JDbGFzc05hbWUoKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHB1YmxpYyBvdmVycmlkZSBvblRoZW1lQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUaGVtZUNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2NvbnRleHQudGhlbWUudXBkYXRlKGUudGhlbWUpO1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRDbGFzc05hbWUodGhpcy5fZ2V0RWRpdG9yQ2xhc3NOYW1lKCkpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIC0tLSBlbmQgZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcmVuZGVyQW5pbWF0aW9uRnJhbWUgIT09IG51bGwpIHtcblx0XHRcdHRoaXMuX3JlbmRlckFuaW1hdGlvbkZyYW1lLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3JlbmRlckFuaW1hdGlvbkZyYW1lID0gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBEaXNwb3NlIGNsaXBib2FyZCBldmVudCBsaXN0ZW5lcnNcblx0XHR0aGlzLl9lZGl0Q29udGV4dENsaXBib2FyZExpc3RlbmVycy5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0cy5vdmVyZmxvd2luZ0NvbnRlbnRXaWRnZXRzRG9tTm9kZS5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdHRoaXMuX292ZXJsYXlXaWRnZXRzLm92ZXJmbG93aW5nT3ZlcmxheVdpZGdldHNEb21Ob2RlLmRvbU5vZGUucmVtb3ZlKCk7XG5cblx0XHR0aGlzLl9jb250ZXh0LnJlbW92ZUV2ZW50SGFuZGxlcih0aGlzKTtcblx0XHR0aGlzLl92aWV3R3B1Q29udGV4dD8uZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fdmlld0xpbmVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl92aWV3TGluZXNHcHU/LmRpc3Bvc2UoKTtcblxuXHRcdC8vIERlc3Ryb3kgdmlldyBwYXJ0c1xuXHRcdGZvciAoY29uc3Qgdmlld1BhcnQgb2YgdGhpcy5fdmlld1BhcnRzKSB7XG5cdFx0XHR2aWV3UGFydC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVSZW5kZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3JlbmRlckFuaW1hdGlvbkZyYW1lID09PSBudWxsKSB7XG5cdFx0XHQvLyBUT0RPOiB3b3JrYXJvdW5kIGZpeCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIyOTgyNVxuXHRcdFx0aWYgKHRoaXMuX2VkaXRDb250ZXh0IGluc3RhbmNlb2YgTmF0aXZlRWRpdENvbnRleHQpIHtcblx0XHRcdFx0dGhpcy5fZWRpdENvbnRleHQuc2V0RWRpdENvbnRleHRPbkRvbU5vZGUoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlbmRlcmluZyA9IHRoaXMuX2NyZWF0ZUNvb3JkaW5hdGVkUmVuZGVyaW5nKCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJBbmltYXRpb25GcmFtZSA9IEVkaXRvclJlbmRlcmluZ0Nvb3JkaW5hdG9yLklOU1RBTkNFLnNjaGVkdWxlQ29vcmRpbmF0ZWRSZW5kZXJpbmcoe1xuXHRcdFx0XHR3aW5kb3c6IGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlPy5kb21Ob2RlKSxcblx0XHRcdFx0cHJlcGFyZVJlbmRlclRleHQ6ICgpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHJlbmRlcmluZy5wcmVwYXJlUmVuZGVyVGV4dCgpO1xuXHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZW5kZXJBbmltYXRpb25GcmFtZSA9IG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW5kZXJUZXh0OiAodmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gcmVuZGVyaW5nLnJlbmRlclRleHQodmlld3BvcnREYXRhKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJlcGFyZVJlbmRlcjogKHZpZXdQYXJ0czogVmlld1BhcnRbXSwgY3R4OiBSZW5kZXJpbmdDb250ZXh0KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlbmRlcmluZy5wcmVwYXJlUmVuZGVyKHZpZXdQYXJ0cywgY3R4KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVuZGVyOiAodmlld1BhcnRzOiBWaWV3UGFydFtdLCBjdHg6IFJlc3RyaWN0ZWRSZW5kZXJpbmdDb250ZXh0KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHJlbmRlcmluZy5yZW5kZXIodmlld1BhcnRzLCBjdHgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mbHVzaEFjY3VtdWxhdGVkQW5kUmVuZGVyTm93KCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlcmluZyA9IHRoaXMuX2NyZWF0ZUNvb3JkaW5hdGVkUmVuZGVyaW5nKCk7XG5cdFx0Y29uc3Qgdmlld3BvcnREYXRhID0gc2FmZUludm9rZU5vQXJnKCgpID0+IHJlbmRlcmluZy5wcmVwYXJlUmVuZGVyVGV4dCgpKTtcblx0XHRpZiAoIXZpZXdwb3J0RGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkYXRhID0gc2FmZUludm9rZU5vQXJnKCgpID0+IHJlbmRlcmluZy5yZW5kZXJUZXh0KHZpZXdwb3J0RGF0YSkpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBbdmlld1BhcnRzLCBjdHhdID0gZGF0YTtcblx0XHRzYWZlSW52b2tlTm9BcmcoKCkgPT4gcmVuZGVyaW5nLnByZXBhcmVSZW5kZXIodmlld1BhcnRzLCBjdHgpKTtcblx0XHRzYWZlSW52b2tlTm9BcmcoKCkgPT4gcmVuZGVyaW5nLnJlbmRlcih2aWV3UGFydHMsIGN0eCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Vmlld1BhcnRzVG9SZW5kZXIoKTogVmlld1BhcnRbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBWaWV3UGFydFtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0Zm9yIChjb25zdCB2aWV3UGFydCBvZiB0aGlzLl92aWV3UGFydHMpIHtcblx0XHRcdGlmICh2aWV3UGFydC5zaG91bGRSZW5kZXIoKSkge1xuXHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gdmlld1BhcnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDb29yZGluYXRlZFJlbmRlcmluZygpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlcGFyZVJlbmRlclRleHQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3Nob3VsZFJlY29tcHV0ZUdseXBoTWFyZ2luTGFuZXMpIHtcblx0XHRcdFx0XHR0aGlzLl9zaG91bGRSZWNvbXB1dGVHbHlwaE1hcmdpbkxhbmVzID0gZmFsc2U7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jb21wdXRlR2x5cGhNYXJnaW5MYW5lcygpO1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHQuY29uZmlndXJhdGlvbi5zZXRHbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQobW9kZWwucmVxdWlyZWRMYW5lcyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aW5wdXRMYXRlbmN5Lm9uUmVuZGVyU3RhcnQoKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMuZG9tTm9kZS5kb21Ob2RlLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB2aWV3UGFydHNUb1JlbmRlciA9IHRoaXMuX2dldFZpZXdQYXJ0c1RvUmVuZGVyKCk7XG5cdFx0XHRcdGNvbnN0IHZpZXdMaW5lc1Nob3VsZFJlbmRlciA9IHRoaXMuX3ZpZXdMaW5lcy5zaG91bGRSZW5kZXIoKTtcblx0XHRcdFx0aWYgKCF2aWV3TGluZXNTaG91bGRSZW5kZXIgJiYgdmlld1BhcnRzVG9SZW5kZXIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gTm90aGluZyB0byByZW5kZXJcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBhcnRpYWxWaWV3cG9ydERhdGEgPSB0aGlzLl9jb250ZXh0LnZpZXdMYXlvdXQuZ2V0TGluZXNWaWV3cG9ydERhdGEoKTtcblx0XHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWwuc2V0Vmlld3BvcnQocGFydGlhbFZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIsIHBhcnRpYWxWaWV3cG9ydERhdGEuZW5kTGluZU51bWJlciwgcGFydGlhbFZpZXdwb3J0RGF0YS5jZW50ZXJlZExpbmVOdW1iZXIpO1xuXG5cdFx0XHRcdGNvbnN0IHZpZXdwb3J0RGF0YSA9IG5ldyBWaWV3cG9ydERhdGEoXG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0aW9ucyxcblx0XHRcdFx0XHRwYXJ0aWFsVmlld3BvcnREYXRhLFxuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHQudmlld0xheW91dC5nZXRXaGl0ZXNwYWNlVmlld3BvcnREYXRhKCksXG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dC52aWV3TW9kZWxcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHZpZXdQYXJ0IG9mIHRoaXMuX3ZpZXdQYXJ0cykge1xuXHRcdFx0XHRcdGlmICh2aWV3UGFydC5zaG91bGRSZW5kZXIoKSkge1xuXHRcdFx0XHRcdFx0dmlld1BhcnQub25CZWZvcmVSZW5kZXIodmlld3BvcnREYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdmlld3BvcnREYXRhO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlclRleHQ6ICh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IFtWaWV3UGFydFtdLCBSZW5kZXJpbmdDb250ZXh0XSA9PiB7XG5cblx0XHRcdFx0aWYgKHRoaXMuX3ZpZXdMaW5lcy5zaG91bGRSZW5kZXIoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3ZpZXdMaW5lcy5yZW5kZXJUZXh0KHZpZXdwb3J0RGF0YSk7XG5cdFx0XHRcdFx0dGhpcy5fdmlld0xpbmVzLm9uRGlkUmVuZGVyKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5fdmlld0xpbmVzR3B1Py5zaG91bGRSZW5kZXIoKSkge1xuXHRcdFx0XHRcdHRoaXMuX3ZpZXdMaW5lc0dwdS5yZW5kZXJUZXh0KHZpZXdwb3J0RGF0YSk7XG5cdFx0XHRcdFx0dGhpcy5fdmlld0xpbmVzR3B1Lm9uRGlkUmVuZGVyKCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZW5kZXJpbmcgb2Ygdmlld0xpbmVzIG1pZ2h0IGNhdXNlIHNjcm9sbCBldmVudHMgdG8gb2NjdXIsIHNvIGNvbGxlY3QgdmlldyBwYXJ0cyB0byByZW5kZXIgYWdhaW5cblx0XHRcdFx0Y29uc3Qgdmlld1BhcnRzVG9SZW5kZXIgPSB0aGlzLl9nZXRWaWV3UGFydHNUb1JlbmRlcigpO1xuXG5cdFx0XHRcdHJldHVybiBbdmlld1BhcnRzVG9SZW5kZXIsIG5ldyBSZW5kZXJpbmdDb250ZXh0KHRoaXMuX2NvbnRleHQudmlld0xheW91dCwgdmlld3BvcnREYXRhLCB0aGlzLl92aWV3TGluZXMsIHRoaXMuX3ZpZXdMaW5lc0dwdSldO1xuXHRcdFx0fSxcblx0XHRcdHByZXBhcmVSZW5kZXI6ICh2aWV3UGFydHNUb1JlbmRlcjogVmlld1BhcnRbXSwgY3R4OiBSZW5kZXJpbmdDb250ZXh0KSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3Qgdmlld1BhcnQgb2Ygdmlld1BhcnRzVG9SZW5kZXIpIHtcblx0XHRcdFx0XHR2aWV3UGFydC5wcmVwYXJlUmVuZGVyKGN0eCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZW5kZXI6ICh2aWV3UGFydHNUb1JlbmRlcjogVmlld1BhcnRbXSwgY3R4OiBSZXN0cmljdGVkUmVuZGVyaW5nQ29udGV4dCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHZpZXdQYXJ0IG9mIHZpZXdQYXJ0c1RvUmVuZGVyKSB7XG5cdFx0XHRcdFx0dmlld1BhcnQucmVuZGVyKGN0eCk7XG5cdFx0XHRcdFx0dmlld1BhcnQub25EaWRSZW5kZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyAtLS0gQkVHSU4gQ29kZUVkaXRvciBoZWxwZXJzXG5cblx0cHVibGljIGRlbGVnYXRlVmVydGljYWxTY3JvbGxiYXJQb2ludGVyRG93bihicm93c2VyRXZlbnQ6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3Njcm9sbGJhci5kZWxlZ2F0ZVZlcnRpY2FsU2Nyb2xsYmFyUG9pbnRlckRvd24oYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHB1YmxpYyBkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSB7XG5cdFx0dGhpcy5fc2Nyb2xsYmFyLmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIHJlc3RvcmVTdGF0ZShzY3JvbGxQb3NpdGlvbjogeyBzY3JvbGxMZWZ0OiBudW1iZXI7IHNjcm9sbFRvcDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC52aWV3TGF5b3V0LnNldFNjcm9sbFBvc2l0aW9uKHtcblx0XHRcdHNjcm9sbFRvcDogc2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wLFxuXHRcdFx0c2Nyb2xsTGVmdDogc2Nyb2xsUG9zaXRpb24uc2Nyb2xsTGVmdFxuXHRcdH0sIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHR0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC52aXNpYmxlTGluZXNTdGFiaWxpemVkKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T2Zmc2V0Rm9yQ29sdW1uKG1vZGVsTGluZU51bWJlcjogbnVtYmVyLCBtb2RlbENvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCBtb2RlbFBvc2l0aW9uID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwubW9kZWwudmFsaWRhdGVQb3NpdGlvbih7XG5cdFx0XHRsaW5lTnVtYmVyOiBtb2RlbExpbmVOdW1iZXIsXG5cdFx0XHRjb2x1bW46IG1vZGVsQ29sdW1uXG5cdFx0fSk7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFBvc2l0aW9uKTtcblx0XHR0aGlzLl9mbHVzaEFjY3VtdWxhdGVkQW5kUmVuZGVyTm93KCk7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlID0gdGhpcy5fdmlld0xpbmVzLnZpc2libGVSYW5nZUZvclBvc2l0aW9uKG5ldyBQb3NpdGlvbih2aWV3UG9zaXRpb24ubGluZU51bWJlciwgdmlld1Bvc2l0aW9uLmNvbHVtbikpO1xuXHRcdGlmICghdmlzaWJsZVJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiB2aXNpYmxlUmFuZ2UubGVmdDtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lV2lkdGgobW9kZWxMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fY29udGV4dC52aWV3TW9kZWwubW9kZWw7XG5cdFx0Y29uc3Qgdmlld0xpbmUgPSB0aGlzLl9jb250ZXh0LnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG5ldyBQb3NpdGlvbihtb2RlbExpbmVOdW1iZXIsIG1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxMaW5lTnVtYmVyKSkpLmxpbmVOdW1iZXI7XG5cdFx0dGhpcy5fZmx1c2hBY2N1bXVsYXRlZEFuZFJlbmRlck5vdygpO1xuXHRcdGNvbnN0IHdpZHRoID0gdGhpcy5fdmlld0xpbmVzLmdldExpbmVXaWR0aCh2aWV3TGluZSk7XG5cblx0XHRyZXR1cm4gd2lkdGg7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXRMaW5lV2lkdGhDYWNoZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld0xpbmVzLnJlc2V0TGluZVdpZHRoQ2FjaGVzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGFyZ2V0QXRDbGllbnRQb2ludChjbGllbnRYOiBudW1iZXIsIGNsaWVudFk6IG51bWJlcik6IElNb3VzZVRhcmdldCB8IG51bGwge1xuXHRcdGNvbnN0IG1vdXNlVGFyZ2V0ID0gdGhpcy5fcG9pbnRlckhhbmRsZXIuZ2V0VGFyZ2V0QXRDbGllbnRQb2ludChjbGllbnRYLCBjbGllbnRZKTtcblx0XHRpZiAoIW1vdXNlVGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIFZpZXdVc2VySW5wdXRFdmVudHMuY29udmVydFZpZXdUb01vZGVsTW91c2VUYXJnZXQobW91c2VUYXJnZXQsIHRoaXMuX2NvbnRleHQudmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVPdmVydmlld1J1bGVyKGNzc0NsYXNzTmFtZTogc3RyaW5nKTogT3ZlcnZpZXdSdWxlciB7XG5cdFx0cmV0dXJuIG5ldyBPdmVydmlld1J1bGVyKHRoaXMuX2NvbnRleHQsIGNzc0NsYXNzTmFtZSk7XG5cdH1cblxuXHRwdWJsaWMgY2hhbmdlKGNhbGxiYWNrOiAoY2hhbmdlQWNjZXNzb3I6IElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yKSA9PiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld1pvbmVzLmNoYW5nZVZpZXdab25lcyhjYWxsYmFjayk7XG5cdFx0dGhpcy5fc2NoZWR1bGVSZW5kZXIoKTtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIobm93OiBib29sZWFuLCBldmVyeXRoaW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGV2ZXJ5dGhpbmcpIHtcblx0XHRcdC8vIEZvcmNlIGV2ZXJ5dGhpbmcgdG8gcmVuZGVyLi4uXG5cdFx0XHR0aGlzLl92aWV3TGluZXMuZm9yY2VTaG91bGRSZW5kZXIoKTtcblx0XHRcdGZvciAoY29uc3Qgdmlld1BhcnQgb2YgdGhpcy5fdmlld1BhcnRzKSB7XG5cdFx0XHRcdHZpZXdQYXJ0LmZvcmNlU2hvdWxkUmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChub3cpIHtcblx0XHRcdHRoaXMuX2ZsdXNoQWNjdW11bGF0ZWRBbmRSZW5kZXJOb3coKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVSZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVTY3JlZW5SZWFkZXJDb250ZW50KHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdENvbnRleHQud3JpdGVTY3JlZW5SZWFkZXJDb250ZW50KHJlYXNvbik7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdENvbnRleHQuZm9jdXMoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRDb250ZXh0LmlzRm9jdXNlZCgpO1xuXHR9XG5cblx0cHVibGljIGlzV2lkZ2V0Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0Rm9jdXNUcmFja2VyLmhhc0ZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgcmVmcmVzaEZvY3VzU3RhdGUoKSB7XG5cdFx0dGhpcy5fZWRpdENvbnRleHQucmVmcmVzaEZvY3VzU3RhdGUoKTtcblx0XHR0aGlzLl93aWRnZXRGb2N1c1RyYWNrZXIucmVmcmVzaFN0YXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0QXJpYU9wdGlvbnMob3B0aW9uczogSUVkaXRvckFyaWFPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdENvbnRleHQuc2V0QXJpYU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgYWRkQ29udGVudFdpZGdldCh3aWRnZXREYXRhOiBJQ29udGVudFdpZGdldERhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0cy5hZGRXaWRnZXQod2lkZ2V0RGF0YS53aWRnZXQpO1xuXHRcdHRoaXMubGF5b3V0Q29udGVudFdpZGdldCh3aWRnZXREYXRhKTtcblx0XHR0aGlzLl9zY2hlZHVsZVJlbmRlcigpO1xuXHR9XG5cblx0cHVibGljIGxheW91dENvbnRlbnRXaWRnZXQod2lkZ2V0RGF0YTogSUNvbnRlbnRXaWRnZXREYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudFdpZGdldHMuc2V0V2lkZ2V0UG9zaXRpb24oXG5cdFx0XHR3aWRnZXREYXRhLndpZGdldCxcblx0XHRcdHdpZGdldERhdGEucG9zaXRpb24/LnBvc2l0aW9uID8/IG51bGwsXG5cdFx0XHR3aWRnZXREYXRhLnBvc2l0aW9uPy5zZWNvbmRhcnlQb3NpdGlvbiA/PyBudWxsLFxuXHRcdFx0d2lkZ2V0RGF0YS5wb3NpdGlvbj8ucHJlZmVyZW5jZSA/PyBudWxsLFxuXHRcdFx0d2lkZ2V0RGF0YS5wb3NpdGlvbj8ucG9zaXRpb25BZmZpbml0eSA/PyBudWxsXG5cdFx0KTtcblx0XHRpZiAodGhpcy5fY29udGVudFdpZGdldHMuc2hvdWxkUmVuZGVyKCkpIHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlUmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbnRlbnRXaWRnZXQod2lkZ2V0RGF0YTogSUNvbnRlbnRXaWRnZXREYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudFdpZGdldHMucmVtb3ZlV2lkZ2V0KHdpZGdldERhdGEud2lkZ2V0KTtcblx0XHR0aGlzLl9zY2hlZHVsZVJlbmRlcigpO1xuXHR9XG5cblx0cHVibGljIGFkZE92ZXJsYXlXaWRnZXQod2lkZ2V0RGF0YTogSU92ZXJsYXlXaWRnZXREYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fb3ZlcmxheVdpZGdldHMuYWRkV2lkZ2V0KHdpZGdldERhdGEud2lkZ2V0KTtcblx0XHR0aGlzLmxheW91dE92ZXJsYXlXaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0dGhpcy5fc2NoZWR1bGVSZW5kZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXRPdmVybGF5V2lkZ2V0KHdpZGdldERhdGE6IElPdmVybGF5V2lkZ2V0RGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IHNob3VsZFJlbmRlciA9IHRoaXMuX292ZXJsYXlXaWRnZXRzLnNldFdpZGdldFBvc2l0aW9uKHdpZGdldERhdGEud2lkZ2V0LCB3aWRnZXREYXRhLnBvc2l0aW9uKTtcblx0XHRpZiAoc2hvdWxkUmVuZGVyKSB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVJlbmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZW1vdmVPdmVybGF5V2lkZ2V0KHdpZGdldERhdGE6IElPdmVybGF5V2lkZ2V0RGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuX292ZXJsYXlXaWRnZXRzLnJlbW92ZVdpZGdldCh3aWRnZXREYXRhLndpZGdldCk7XG5cdFx0dGhpcy5fc2NoZWR1bGVSZW5kZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRHbHlwaE1hcmdpbldpZGdldCh3aWRnZXREYXRhOiBJR2x5cGhNYXJnaW5XaWRnZXREYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzLmFkZFdpZGdldCh3aWRnZXREYXRhLndpZGdldCk7XG5cdFx0dGhpcy5fc2hvdWxkUmVjb21wdXRlR2x5cGhNYXJnaW5MYW5lcyA9IHRydWU7XG5cdFx0dGhpcy5fc2NoZWR1bGVSZW5kZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXRHbHlwaE1hcmdpbldpZGdldCh3aWRnZXREYXRhOiBJR2x5cGhNYXJnaW5XaWRnZXREYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3UHJlZmVyZW5jZSA9IHdpZGdldERhdGEucG9zaXRpb247XG5cdFx0Y29uc3Qgc2hvdWxkUmVuZGVyID0gdGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzLnNldFdpZGdldFBvc2l0aW9uKHdpZGdldERhdGEud2lkZ2V0LCBuZXdQcmVmZXJlbmNlKTtcblx0XHRpZiAoc2hvdWxkUmVuZGVyKSB7XG5cdFx0XHR0aGlzLl9zaG91bGRSZWNvbXB1dGVHbHlwaE1hcmdpbkxhbmVzID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3NjaGVkdWxlUmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZUdseXBoTWFyZ2luV2lkZ2V0KHdpZGdldERhdGE6IElHbHlwaE1hcmdpbldpZGdldERhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9nbHlwaE1hcmdpbldpZGdldHMucmVtb3ZlV2lkZ2V0KHdpZGdldERhdGEud2lkZ2V0KTtcblx0XHR0aGlzLl9zaG91bGRSZWNvbXB1dGVHbHlwaE1hcmdpbkxhbmVzID0gdHJ1ZTtcblx0XHR0aGlzLl9zY2hlZHVsZVJlbmRlcigpO1xuXHR9XG5cblx0Ly8gLS0tIEVORCBDb2RlRWRpdG9yIGhlbHBlcnNcblxufVxuXG5mdW5jdGlvbiBzYWZlSW52b2tlTm9Bcmc8VD4oZnVuYzogKCkgPT4gVCk6IFQgfCBudWxsIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZnVuYygpO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0b25VbmV4cGVjdGVkRXJyb3IoZSk7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElDb29yZGluYXRlZFJlbmRlcmluZyB7XG5cdHJlYWRvbmx5IHdpbmRvdzogQ29kZVdpbmRvdztcblx0cHJlcGFyZVJlbmRlclRleHQoKTogVmlld3BvcnREYXRhIHwgbnVsbDtcblx0cmVuZGVyVGV4dCh2aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSk6IFtWaWV3UGFydFtdLCBSZW5kZXJpbmdDb250ZXh0XTtcblx0cHJlcGFyZVJlbmRlcih2aWV3UGFydHM6IFZpZXdQYXJ0W10sIGN0eDogUmVuZGVyaW5nQ29udGV4dCk6IHZvaWQ7XG5cdHJlbmRlcih2aWV3UGFydHM6IFZpZXdQYXJ0W10sIGN0eDogUmVzdHJpY3RlZFJlbmRlcmluZ0NvbnRleHQpOiB2b2lkO1xufVxuXG5jbGFzcyBFZGl0b3JSZW5kZXJpbmdDb29yZGluYXRvciB7XG5cblx0cHVibGljIHN0YXRpYyBJTlNUQU5DRSA9IG5ldyBFZGl0b3JSZW5kZXJpbmdDb29yZGluYXRvcigpO1xuXG5cdHByaXZhdGUgX2Nvb3JkaW5hdGVkUmVuZGVyaW5nczogSUNvb3JkaW5hdGVkUmVuZGVyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfYW5pbWF0aW9uRnJhbWVSdW5uZXJzID0gbmV3IE1hcDxDb2RlV2luZG93LCBJRGlzcG9zYWJsZT4oKTtcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKCkgeyB9XG5cblx0c2NoZWR1bGVDb29yZGluYXRlZFJlbmRlcmluZyhyZW5kZXJpbmc6IElDb29yZGluYXRlZFJlbmRlcmluZyk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9jb29yZGluYXRlZFJlbmRlcmluZ3MucHVzaChyZW5kZXJpbmcpO1xuXHRcdHRoaXMuX3NjaGVkdWxlUmVuZGVyKHJlbmRlcmluZy53aW5kb3cpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmluZ0luZGV4ID0gdGhpcy5fY29vcmRpbmF0ZWRSZW5kZXJpbmdzLmluZGV4T2YocmVuZGVyaW5nKTtcblx0XHRcdFx0aWYgKHJlbmRlcmluZ0luZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jb29yZGluYXRlZFJlbmRlcmluZ3Muc3BsaWNlKHJlbmRlcmluZ0luZGV4LCAxKTtcblxuXHRcdFx0XHRpZiAodGhpcy5fY29vcmRpbmF0ZWRSZW5kZXJpbmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIFRoZXJlIGFyZSBubyBtb3JlIHJlbmRlcmluZ3MgdG8gY29vcmRpbmF0ZSA9PiBjYW5jZWwgYW5pbWF0aW9uIGZyYW1lc1xuXHRcdFx0XHRcdGZvciAoY29uc3QgW18sIGRpc3Bvc2FibGVdIG9mIHRoaXMuX2FuaW1hdGlvbkZyYW1lUnVubmVycykge1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2FuaW1hdGlvbkZyYW1lUnVubmVycy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlUmVuZGVyKHdpbmRvdzogQ29kZVdpbmRvdyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fYW5pbWF0aW9uRnJhbWVSdW5uZXJzLmhhcyh3aW5kb3cpKSB7XG5cdFx0XHRjb25zdCBydW5uZXIgPSAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FuaW1hdGlvbkZyYW1lUnVubmVycy5kZWxldGUod2luZG93KTtcblx0XHRcdFx0dGhpcy5fb25SZW5kZXJTY2hlZHVsZWQoKTtcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9hbmltYXRpb25GcmFtZVJ1bm5lcnMuc2V0KHdpbmRvdywgZG9tLnJ1bkF0VGhpc09yU2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh3aW5kb3csIHJ1bm5lciwgMTAwKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25SZW5kZXJTY2hlZHVsZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29vcmRpbmF0ZWRSZW5kZXJpbmdzID0gdGhpcy5fY29vcmRpbmF0ZWRSZW5kZXJpbmdzLnNsaWNlKDApO1xuXHRcdHRoaXMuX2Nvb3JkaW5hdGVkUmVuZGVyaW5ncyA9IFtdO1xuXG5cdFx0Y29uc3Qgdmlld3BvcnREYXRhczogKFZpZXdwb3J0RGF0YSB8IG51bGwpW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY29vcmRpbmF0ZWRSZW5kZXJpbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCByZW5kZXJpbmcgPSBjb29yZGluYXRlZFJlbmRlcmluZ3NbaV07XG5cdFx0XHR2aWV3cG9ydERhdGFzW2ldID0gc2FmZUludm9rZU5vQXJnKCgpID0+IHJlbmRlcmluZy5wcmVwYXJlUmVuZGVyVGV4dCgpKTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhczogKFtWaWV3UGFydFtdLCBSZW5kZXJpbmdDb250ZXh0XSB8IG51bGwpW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY29vcmRpbmF0ZWRSZW5kZXJpbmdzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCByZW5kZXJpbmcgPSBjb29yZGluYXRlZFJlbmRlcmluZ3NbaV07XG5cdFx0XHRjb25zdCB2aWV3cG9ydERhdGEgPSB2aWV3cG9ydERhdGFzW2ldO1xuXHRcdFx0aWYgKCF2aWV3cG9ydERhdGEpIHtcblx0XHRcdFx0ZGF0YXNbaV0gPSBudWxsO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGRhdGFzW2ldID0gc2FmZUludm9rZU5vQXJnKCgpID0+IHJlbmRlcmluZy5yZW5kZXJUZXh0KHZpZXdwb3J0RGF0YSkpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBjb29yZGluYXRlZFJlbmRlcmluZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlbmRlcmluZyA9IGNvb3JkaW5hdGVkUmVuZGVyaW5nc1tpXTtcblx0XHRcdGNvbnN0IGRhdGEgPSBkYXRhc1tpXTtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IFt2aWV3UGFydHMsIGN0eF0gPSBkYXRhO1xuXHRcdFx0c2FmZUludm9rZU5vQXJnKCgpID0+IHJlbmRlcmluZy5wcmVwYXJlUmVuZGVyKHZpZXdQYXJ0cywgY3R4KSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGNvb3JkaW5hdGVkUmVuZGVyaW5ncy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcmVuZGVyaW5nID0gY29vcmRpbmF0ZWRSZW5kZXJpbmdzW2ldO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGRhdGFzW2ldO1xuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgW3ZpZXdQYXJ0cywgY3R4XSA9IGRhdGE7XG5cdFx0XHRzYWZlSW52b2tlTm9BcmcoKCkgPT4gcmVuZGVyaW5nLnJlbmRlcih2aWV3UGFydHMsIGN0eCkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBDb2RlRWRpdG9yV2lkZ2V0Rm9jdXNUcmFja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfaGFzRG9tRWxlbWVudEZvY3VzOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Gb2N1c1RyYWNrZXI6IGRvbS5JRm9jdXNUcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBkb20uSUZvY3VzVHJhY2tlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25DaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZUhhc0ZvY3VzOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX2hhZEZvY3VzOiBib29sZWFuIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKGRvbUVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCwgdXNlckludGVyYWN0aW9uU2VydmljZTogSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faGFzRG9tRWxlbWVudEZvY3VzID0gZmFsc2U7XG5cdFx0dGhpcy5fZG9tRm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIodXNlckludGVyYWN0aW9uU2VydmljZS5jcmVhdGVEb21Gb2N1c1RyYWNrZXIoZG9tRWxlbWVudCkpO1xuXG5cdFx0dGhpcy5fb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZUhhc0ZvY3VzID0gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kb21Gb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9oYXNEb21FbGVtZW50Rm9jdXMgPSB0cnVlO1xuXHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2RvbUZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5faGFzRG9tRWxlbWVudEZvY3VzID0gZmFsc2U7XG5cdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHR9KSk7XG5cblx0XHRpZiAob3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSkge1xuXHRcdFx0dGhpcy5fb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSA9IHRoaXMuX3JlZ2lzdGVyKHVzZXJJbnRlcmFjdGlvblNlcnZpY2UuY3JlYXRlRG9tRm9jdXNUcmFja2VyKG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX292ZXJmbG93V2lkZ2V0c0RvbU5vZGUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX292ZXJmbG93V2lkZ2V0c0RvbU5vZGVIYXNGb2N1cyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZS5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9vdmVyZmxvd1dpZGdldHNEb21Ob2RlSGFzRm9jdXMgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fdXBkYXRlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCkge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9oYXNEb21FbGVtZW50Rm9jdXMgfHwgdGhpcy5fb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZUhhc0ZvY3VzO1xuXHRcdGlmICh0aGlzLl9oYWRGb2N1cyAhPT0gZm9jdXNlZCkge1xuXHRcdFx0dGhpcy5faGFkRm9jdXMgPSBmb2N1c2VkO1xuXHRcdFx0dGhpcy5fb25DaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFkRm9jdXMgPz8gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgcmVmcmVzaFN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RvbUZvY3VzVHJhY2tlci5yZWZyZXNoU3RhdGUoKTtcblx0XHR0aGlzLl9vdmVyZmxvd1dpZGdldHNEb21Ob2RlPy5yZWZyZXNoU3RhdGU/LigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFzQix5QkFBeUI7QUFFL0MsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxvQkFBb0IseUJBQXlCO0FBQ3RELFNBQVMsWUFBWSx1QkFBb0M7QUFFekQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7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
