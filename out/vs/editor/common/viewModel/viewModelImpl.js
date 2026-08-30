import { ArrayQueue } from "../../../base/common/arrays.js";
import { RunOnceScheduler } from "../../../base/common/async.js";
import { Color } from "../../../base/common/color.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as platform from "../../../base/common/platform.js";
import * as strings from "../../../base/common/strings.js";
import { EditorOption, filterValidationDecorations, filterFontDecorations } from "../config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../config/fontInfo.js";
import { CursorsController } from "../cursor/cursor.js";
import { CursorConfiguration } from "../cursorCommon.js";
import { CursorChangeReason } from "../cursorEvents.js";
import { Position } from "../core/position.js";
import { Range } from "../core/range.js";
import { ScrollType } from "../editorCommon.js";
import { EndOfLinePreference, TextDirection, TrackedRangeStickiness } from "../model.js";
import * as textModelEvents from "../textModelEvents.js";
import { TokenizationRegistry } from "../languages.js";
import { ColorId } from "../encodedTokenAttributes.js";
import { PLAINTEXT_LANGUAGE_ID } from "../languages/modesRegistry.js";
import { tokenizeLineToHTML } from "../languages/textToHtmlTokenizer.js";
import * as viewEvents from "../viewEvents.js";
import { ViewLayout } from "../viewLayout/viewLayout.js";
import { MinimapTokensColorTracker } from "./minimapTokensColorTracker.js";
import { MinimapLinesRenderingData, OverviewRulerDecorationsGroup, ViewLineRenderingData } from "../viewModel.js";
import { ViewModelDecorations } from "./viewModelDecorations.js";
import { FocusChangedEvent, HiddenAreasChangedEvent, ModelContentChangedEvent, ModelDecorationsChangedEvent, ModelFontChangedEvent, ModelLanguageChangedEvent, ModelLanguageConfigurationChangedEvent, ModelLineHeightChangedEvent, ModelOptionsChangedEvent, ModelTokensChangedEvent, ReadOnlyEditAttemptEvent, ScrollChangedEvent, ViewModelEventDispatcher, ViewZonesChangedEvent, WidgetFocusChangedEvent } from "../viewModelEventDispatcher.js";
import { ViewModelLinesFromModelAsIs, ViewModelLinesFromProjectedModel } from "./viewModelLines.js";
import { GlyphMarginLanesModel } from "./glyphLanesModel.js";
import { CustomLineHeightData } from "../viewLayout/lineHeights.js";
const USE_IDENTITY_LINES_COLLECTION = true;
class ViewModel extends Disposable {
  constructor(editorId, configuration, model, domLineBreaksComputerFactory, monospaceLineBreaksComputerFactory, scheduleAtNextAnimationFrame, languageConfigurationService, _themeService, _attachedView, _transactionalTarget) {
    super();
    this.languageConfigurationService = languageConfigurationService;
    this._themeService = _themeService;
    this._attachedView = _attachedView;
    this._transactionalTarget = _transactionalTarget;
    this.hiddenAreasModel = new HiddenAreasModel();
    this.previousHiddenAreas = [];
    this._editorId = editorId;
    this._configuration = configuration;
    this.model = model;
    this._eventDispatcher = new ViewModelEventDispatcher();
    this.onEvent = this._eventDispatcher.onEvent;
    this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
    this._updateConfigurationViewLineCount = this._register(new RunOnceScheduler(() => this._updateConfigurationViewLineCountNow(), 0));
    this._hasFocus = false;
    this._viewportStart = ViewportStart.create(this.model);
    this.glyphLanes = new GlyphMarginLanesModel(0);
    if (USE_IDENTITY_LINES_COLLECTION && this.model.isTooLargeForTokenization()) {
      this._lines = new ViewModelLinesFromModelAsIs(this.model);
    } else {
      const options = this._configuration.options;
      const fontInfo = options.get(EditorOption.fontInfo);
      const wrappingStrategy = options.get(EditorOption.wrappingStrategy);
      const wrappingInfo = options.get(EditorOption.wrappingInfo);
      const wrappingIndent = options.get(EditorOption.wrappingIndent);
      const wordBreak = options.get(EditorOption.wordBreak);
      const wrapOnEscapedLineFeeds = options.get(EditorOption.wrapOnEscapedLineFeeds);
      this._lines = new ViewModelLinesFromProjectedModel(
        this._editorId,
        this.model,
        domLineBreaksComputerFactory,
        monospaceLineBreaksComputerFactory,
        fontInfo,
        this.model.getOptions().tabSize,
        wrappingStrategy,
        wrappingInfo.wrappingColumn,
        wrappingIndent,
        wordBreak,
        wrapOnEscapedLineFeeds
      );
    }
    this.coordinatesConverter = this._lines.createCoordinatesConverter();
    this._cursor = this._register(new CursorsController(model, this, this.coordinatesConverter, this.cursorConfig));
    this.viewLayout = this._register(new ViewLayout(this._configuration, this.getLineCount(), this._getCustomLineHeights(), scheduleAtNextAnimationFrame));
    this._register(this.viewLayout.onDidScroll((e) => {
      if (e.scrollTopChanged) {
        this._handleVisibleLinesChanged();
      }
      if (e.scrollTopChanged) {
        this._viewportStart.invalidate();
      }
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewScrollChangedEvent(e));
      this._eventDispatcher.emitOutgoingEvent(new ScrollChangedEvent(
        e.oldScrollWidth,
        e.oldScrollLeft,
        e.oldScrollHeight,
        e.oldScrollTop,
        e.scrollWidth,
        e.scrollLeft,
        e.scrollHeight,
        e.scrollTop
      ));
    }));
    this._register(this.viewLayout.onDidContentSizeChange((e) => {
      this._eventDispatcher.emitOutgoingEvent(e);
    }));
    this._decorations = new ViewModelDecorations(this._editorId, this.model, this._configuration, this._lines, this.coordinatesConverter);
    this._registerModelEvents();
    this._register(this._configuration.onDidChangeFast((e) => {
      try {
        const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
        this._onConfigurationChanged(eventsCollector, e);
      } finally {
        this._eventDispatcher.endEmitViewEvents();
      }
    }));
    this._register(MinimapTokensColorTracker.getInstance().onDidChange(() => {
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewTokensColorsChangedEvent());
    }));
    this._register(this._themeService.onDidColorThemeChange((theme) => {
      this._invalidateDecorationsColorCache();
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewThemeChangedEvent(theme));
    }));
    this._updateConfigurationViewLineCountNow();
    this.model.registerViewModel(this);
  }
  dispose() {
    super.dispose();
    this._decorations.dispose();
    this._lines.dispose();
    this._viewportStart.dispose();
    this._eventDispatcher.dispose();
    this.model.unregisterViewModel(this);
  }
  getEditorOption(id) {
    return this._configuration.options.get(id);
  }
  createLineBreaksComputer(context) {
    return this._lines.createLineBreaksComputer(context);
  }
  addViewEventHandler(eventHandler) {
    this._eventDispatcher.addViewEventHandler(eventHandler);
  }
  removeViewEventHandler(eventHandler) {
    this._eventDispatcher.removeViewEventHandler(eventHandler);
  }
  _getCustomLineHeights() {
    const allowVariableLineHeights = this._configuration.options.get(EditorOption.allowVariableLineHeights);
    if (!allowVariableLineHeights) {
      return [];
    }
    const decorations = this.model.getCustomLineHeightsDecorations(this._editorId);
    return CustomLineHeightData.fromDecorations(decorations, this.coordinatesConverter, this._configuration);
  }
  _getCustomLineHeightsForLines(fromLineNumber, toLineNumber) {
    const allowVariableLineHeights = this._configuration.options.get(EditorOption.allowVariableLineHeights);
    if (!allowVariableLineHeights) {
      return [];
    }
    const modelRange = new Range(fromLineNumber, 1, toLineNumber, this.model.getLineMaxColumn(toLineNumber));
    const decorations = this.model.getCustomLineHeightsDecorationsInRange(modelRange, this._editorId);
    return CustomLineHeightData.fromDecorations(decorations, this.coordinatesConverter, this._configuration);
  }
  _updateConfigurationViewLineCountNow() {
    this._configuration.setViewLineCount(this._lines.getViewLineCount());
  }
  getModelVisibleRanges() {
    const linesViewportData = this.viewLayout.getLinesViewportData();
    const viewVisibleRange = new Range(
      linesViewportData.startLineNumber,
      this.getLineMinColumn(linesViewportData.startLineNumber),
      linesViewportData.endLineNumber,
      this.getLineMaxColumn(linesViewportData.endLineNumber)
    );
    const modelVisibleRanges = this._toModelVisibleRanges(viewVisibleRange);
    return modelVisibleRanges;
  }
  visibleLinesStabilized() {
    const modelVisibleRanges = this.getModelVisibleRanges();
    this._attachedView.setVisibleLines(modelVisibleRanges, true);
  }
  _handleVisibleLinesChanged() {
    const modelVisibleRanges = this.getModelVisibleRanges();
    this._attachedView.setVisibleLines(modelVisibleRanges, false);
  }
  setHasFocus(hasFocus) {
    this._hasFocus = hasFocus;
    this._cursor.setHasFocus(hasFocus);
    this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewFocusChangedEvent(hasFocus));
    this._eventDispatcher.emitOutgoingEvent(new FocusChangedEvent(!hasFocus, hasFocus));
  }
  setHasWidgetFocus(hasWidgetFocus) {
    this._eventDispatcher.emitOutgoingEvent(new WidgetFocusChangedEvent(!hasWidgetFocus, hasWidgetFocus));
  }
  onCompositionStart() {
    this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewCompositionStartEvent());
  }
  onCompositionEnd() {
    this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewCompositionEndEvent());
  }
  _captureStableViewport() {
    if (this._viewportStart.isValid && this.viewLayout.getCurrentScrollTop() > 0) {
      const previousViewportStartViewPosition = new Position(this._viewportStart.viewLineNumber, this.getLineMinColumn(this._viewportStart.viewLineNumber));
      const previousViewportStartModelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(previousViewportStartViewPosition);
      return new StableViewport(previousViewportStartModelPosition, this._viewportStart.startLineDelta);
    }
    return new StableViewport(null, 0);
  }
  _onConfigurationChanged(eventsCollector, e) {
    const stableViewport = this._captureStableViewport();
    const options = this._configuration.options;
    const fontInfo = options.get(EditorOption.fontInfo);
    const wrappingStrategy = options.get(EditorOption.wrappingStrategy);
    const wrappingInfo = options.get(EditorOption.wrappingInfo);
    const wrappingIndent = options.get(EditorOption.wrappingIndent);
    const wordBreak = options.get(EditorOption.wordBreak);
    if (this._lines.setWrappingSettings(fontInfo, wrappingStrategy, wrappingInfo.wrappingColumn, wrappingIndent, wordBreak)) {
      eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
      eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
      eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
      this._cursor.onLineMappingChanged(eventsCollector);
      this._decorations.onLineMappingChanged();
      this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
      this._updateConfigurationViewLineCount.schedule();
    }
    if (e.hasChanged(EditorOption.readOnly)) {
      this._decorations.reset();
      eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
    }
    if (e.hasChanged(EditorOption.renderValidationDecorations)) {
      this._decorations.reset();
      eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
    }
    eventsCollector.emitViewEvent(new viewEvents.ViewConfigurationChangedEvent(e));
    this.viewLayout.onConfigurationChanged(e);
    stableViewport.recoverViewportStart(this.coordinatesConverter, this.viewLayout);
    if (CursorConfiguration.shouldRecreate(e)) {
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
    }
  }
  /**
   * Gets called directly by the text model.
   */
  onDidChangeContentOrInjectedText(e) {
    try {
      const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
      let hadOtherModelChange = false;
      let hadModelLineChangeThatChangedLineMapping = false;
      const changes = e instanceof textModelEvents.InternalModelContentChangeEvent ? e.rawContentChangedEvent.changes : e.changes;
      const versionId = e instanceof textModelEvents.InternalModelContentChangeEvent ? e.rawContentChangedEvent.versionId : null;
      const lineBreaksComputer = this._lines.createLineBreaksComputer();
      for (const change of changes) {
        switch (change.changeType) {
          case textModelEvents.RawContentChangedType.LinesInserted: {
            for (let i = 0; i < change.count; i++) {
              lineBreaksComputer.addRequest(change.fromLineNumberPostEdit + i, null);
            }
            break;
          }
          case textModelEvents.RawContentChangedType.LineChanged: {
            lineBreaksComputer.addRequest(change.lineNumberPostEdit, null);
            break;
          }
        }
      }
      const lineBreaks = lineBreaksComputer.finalize();
      const lineBreakQueue = new ArrayQueue(lineBreaks);
      const customLineHeightRangesToInsert = [];
      for (const change of changes) {
        switch (change.changeType) {
          case textModelEvents.RawContentChangedType.Flush: {
            this._lines.onModelFlushed();
            eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
            this._decorations.reset();
            this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
            hadOtherModelChange = true;
            break;
          }
          case textModelEvents.RawContentChangedType.LinesDeleted: {
            const linesDeletedEvent = this._lines.onModelLinesDeleted(versionId, change.fromLineNumber, change.toLineNumber);
            if (linesDeletedEvent !== null) {
              eventsCollector.emitViewEvent(linesDeletedEvent);
              this.viewLayout.onLinesDeleted(linesDeletedEvent.fromLineNumber, linesDeletedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.lastUntouchedLinePostEdit, toLineNumber: change.lastUntouchedLinePostEdit });
            }
            hadOtherModelChange = true;
            break;
          }
          case textModelEvents.RawContentChangedType.LinesInserted: {
            const insertedLineBreaks = lineBreakQueue.takeCount(change.count);
            const linesInsertedEvent = this._lines.onModelLinesInserted(versionId, change.fromLineNumber, change.toLineNumber, insertedLineBreaks);
            if (linesInsertedEvent !== null) {
              eventsCollector.emitViewEvent(linesInsertedEvent);
              this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.fromLineNumberPostEdit, toLineNumber: change.toLineNumberPostEdit });
            }
            hadOtherModelChange = true;
            break;
          }
          case textModelEvents.RawContentChangedType.LineChanged: {
            const changedLineBreakData = lineBreakQueue.dequeue();
            const [lineMappingChanged, linesChangedEvent, linesInsertedEvent, linesDeletedEvent] = this._lines.onModelLineChanged(versionId, change.lineNumber, changedLineBreakData);
            hadModelLineChangeThatChangedLineMapping = lineMappingChanged;
            if (linesChangedEvent) {
              eventsCollector.emitViewEvent(linesChangedEvent);
            }
            if (linesInsertedEvent) {
              eventsCollector.emitViewEvent(linesInsertedEvent);
              this.viewLayout.onLinesInserted(linesInsertedEvent.fromLineNumber, linesInsertedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.lineNumberPostEdit, toLineNumber: change.lineNumberPostEdit });
            }
            if (linesDeletedEvent) {
              eventsCollector.emitViewEvent(linesDeletedEvent);
              this.viewLayout.onLinesDeleted(linesDeletedEvent.fromLineNumber, linesDeletedEvent.toLineNumber);
              customLineHeightRangesToInsert.push({ fromLineNumber: change.lineNumberPostEdit, toLineNumber: change.lineNumberPostEdit });
            }
            break;
          }
          case textModelEvents.RawContentChangedType.EOLChanged: {
            break;
          }
        }
      }
      if (versionId !== null) {
        this._lines.acceptVersionId(versionId);
      }
      if (customLineHeightRangesToInsert.length > 0) {
        this.viewLayout.changeSpecialLineHeights((accessor) => {
          for (const range of customLineHeightRangesToInsert) {
            const customLineHeights = this._getCustomLineHeightsForLines(range.fromLineNumber, range.toLineNumber);
            for (const data of customLineHeights) {
              accessor.insertOrChangeCustomLineHeight(data.decorationId, data.startLineNumber, data.endLineNumber, data.lineHeight);
            }
          }
        });
      }
      this.viewLayout.onHeightMaybeChanged();
      if (!hadOtherModelChange && hadModelLineChangeThatChangedLineMapping) {
        eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
        eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
        this._cursor.onLineMappingChanged(eventsCollector);
        this._decorations.onLineMappingChanged();
      }
    } finally {
      this._eventDispatcher.endEmitViewEvents();
    }
    const viewportStartWasValid = this._viewportStart.isValid;
    this._viewportStart.invalidate();
    this._configuration.setModelLineCount(this.model.getLineCount());
    this._updateConfigurationViewLineCountNow();
    if (!this._hasFocus && this.model.getAttachedEditorCount() >= 2 && viewportStartWasValid) {
      const modelRange = this.model._getTrackedRange(this._viewportStart.modelTrackedRange);
      if (modelRange) {
        const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(modelRange.getStartPosition());
        const viewPositionTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
        this.viewLayout.setScrollPosition({ scrollTop: viewPositionTop + this._viewportStart.startLineDelta }, ScrollType.Immediate);
      }
    }
    this._handleVisibleLinesChanged();
  }
  /**
   * Gets called directly by the text model.
   */
  emitContentChangeEvent(e) {
    this._emitViewEvent((eventsCollector) => {
      if (e instanceof textModelEvents.InternalModelContentChangeEvent) {
        eventsCollector.emitOutgoingEvent(new ModelContentChangedEvent(e.contentChangedEvent));
      }
      this._cursor.onModelContentChanged(eventsCollector, e);
    });
  }
  _registerModelEvents() {
    const allowVariableLineHeights = this._configuration.options.get(EditorOption.allowVariableLineHeights);
    if (allowVariableLineHeights) {
      this._register(this.model.onDidChangeLineHeight((e) => {
        const filteredChanges = e.changes.filter((change) => change.ownerId === this._editorId || change.ownerId === 0);
        this.viewLayout.changeSpecialLineHeights((accessor) => {
          for (const change of filteredChanges) {
            const { decorationId, lineNumber, lineHeightMultiplier } = change;
            const viewRange = this.coordinatesConverter.convertModelRangeToViewRange(new Range(lineNumber, 1, lineNumber, this.model.getLineMaxColumn(lineNumber)));
            if (lineHeightMultiplier !== null) {
              accessor.insertOrChangeCustomLineHeight(decorationId, viewRange.startLineNumber, viewRange.endLineNumber, lineHeightMultiplier * this._configuration.options.get(EditorOption.lineHeight));
            } else {
              accessor.removeCustomLineHeight(decorationId);
            }
          }
        });
        if (filteredChanges.length > 0) {
          const filteredEvent = new textModelEvents.ModelLineHeightChangedEvent(filteredChanges);
          this._eventDispatcher.emitOutgoingEvent(new ModelLineHeightChangedEvent(filteredEvent));
        }
      }));
    }
    const allowVariableFonts = this._configuration.options.get(EditorOption.effectiveAllowVariableFonts);
    if (allowVariableFonts) {
      this._register(this.model.onDidChangeFont((e) => {
        const filteredChanges = e.changes.filter((change) => change.ownerId === this._editorId || change.ownerId === 0);
        if (filteredChanges.length > 0) {
          const filteredEvent = new textModelEvents.ModelFontChangedEvent(filteredChanges);
          this._eventDispatcher.emitOutgoingEvent(new ModelFontChangedEvent(filteredEvent));
        }
      }));
    }
    this._register(this.model.onDidChangeTokens((e) => {
      const viewRanges = [];
      for (let j = 0, lenJ = e.ranges.length; j < lenJ; j++) {
        const modelRange = e.ranges[j];
        const viewStartLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.fromLineNumber, 1)).lineNumber;
        const viewEndLineNumber = this.coordinatesConverter.convertModelPositionToViewPosition(new Position(modelRange.toLineNumber, this.model.getLineMaxColumn(modelRange.toLineNumber))).lineNumber;
        viewRanges[j] = {
          fromLineNumber: viewStartLineNumber,
          toLineNumber: viewEndLineNumber
        };
      }
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewTokensChangedEvent(viewRanges));
      this._eventDispatcher.emitOutgoingEvent(new ModelTokensChangedEvent(e));
    }));
    this._register(this.model.onDidChangeLanguageConfiguration((e) => {
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewLanguageConfigurationEvent());
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
      this._eventDispatcher.emitOutgoingEvent(new ModelLanguageConfigurationChangedEvent(e));
    }));
    this._register(this.model.onDidChangeLanguage((e) => {
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
      this._eventDispatcher.emitOutgoingEvent(new ModelLanguageChangedEvent(e));
    }));
    this._register(this.model.onDidChangeOptions((e) => {
      if (this._lines.setTabSize(this.model.getOptions().tabSize)) {
        try {
          const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
          eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
          eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
          eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
          this._cursor.onLineMappingChanged(eventsCollector);
          this._decorations.onLineMappingChanged();
          this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
        } finally {
          this._eventDispatcher.endEmitViewEvents();
        }
        this._updateConfigurationViewLineCount.schedule();
      }
      this.cursorConfig = new CursorConfiguration(this.model.getLanguageId(), this.model.getOptions(), this._configuration, this.languageConfigurationService);
      this._cursor.updateConfiguration(this.cursorConfig);
      this._eventDispatcher.emitOutgoingEvent(new ModelOptionsChangedEvent(e));
    }));
    this._register(this.model.onDidChangeDecorations((e) => {
      this._decorations.onModelDecorationsChanged();
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewDecorationsChangedEvent(e));
      this._eventDispatcher.emitOutgoingEvent(new ModelDecorationsChangedEvent(e));
    }));
  }
  getFontSizeAtPosition(position) {
    const allowVariableFonts = this._configuration.options.get(EditorOption.effectiveAllowVariableFonts);
    if (!allowVariableFonts) {
      return null;
    }
    const fontDecorations = this.model.getFontDecorationsInRange(Range.fromPositions(position), this._editorId);
    let fontSize = this._configuration.options.get(EditorOption.fontInfo).fontSize + "px";
    for (const fontDecoration of fontDecorations) {
      if (fontDecoration.options.fontSize) {
        fontSize = fontDecoration.options.fontSize;
        break;
      }
    }
    return fontSize;
  }
  /**
   * @param forceUpdate If true, the hidden areas will be updated even if the new ranges are the same as the previous ranges.
   * This is because the model might have changed, which resets the hidden areas, but not the last cached value.
   * This needs a better fix in the future.
  */
  setHiddenAreas(ranges, source, forceUpdate) {
    this.hiddenAreasModel.setHiddenAreas(source, ranges);
    const mergedRanges = this.hiddenAreasModel.getMergedRanges();
    if (mergedRanges === this.previousHiddenAreas && !forceUpdate) {
      return;
    }
    this.previousHiddenAreas = mergedRanges;
    const stableViewport = this._captureStableViewport();
    let lineMappingChanged = false;
    try {
      const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
      lineMappingChanged = this._lines.setHiddenAreas(mergedRanges);
      if (lineMappingChanged) {
        eventsCollector.emitViewEvent(new viewEvents.ViewFlushedEvent());
        eventsCollector.emitViewEvent(new viewEvents.ViewLineMappingChangedEvent());
        eventsCollector.emitViewEvent(new viewEvents.ViewDecorationsChangedEvent(null));
        this._cursor.onLineMappingChanged(eventsCollector);
        this._decorations.onLineMappingChanged();
        this.viewLayout.onFlushed(this.getLineCount(), this._getCustomLineHeights());
        this.viewLayout.onHeightMaybeChanged();
      }
      const firstModelLineInViewPort = stableViewport.viewportStartModelPosition?.lineNumber;
      const firstModelLineIsHidden = firstModelLineInViewPort && mergedRanges.some((range) => range.startLineNumber <= firstModelLineInViewPort && firstModelLineInViewPort <= range.endLineNumber);
      if (!firstModelLineIsHidden) {
        stableViewport.recoverViewportStart(this.coordinatesConverter, this.viewLayout);
      }
    } finally {
      this._eventDispatcher.endEmitViewEvents();
    }
    this._updateConfigurationViewLineCount.schedule();
    if (lineMappingChanged) {
      this._eventDispatcher.emitOutgoingEvent(new HiddenAreasChangedEvent());
    }
  }
  getVisibleRangesPlusViewportAboveBelow() {
    const layoutInfo = this._configuration.options.get(EditorOption.layoutInfo);
    const lineHeight = this._configuration.options.get(EditorOption.lineHeight);
    const linesAround = Math.max(20, Math.round(layoutInfo.height / lineHeight));
    const partialData = this.viewLayout.getLinesViewportData();
    const startViewLineNumber = Math.max(1, partialData.completelyVisibleStartLineNumber - linesAround);
    const endViewLineNumber = Math.min(this.getLineCount(), partialData.completelyVisibleEndLineNumber + linesAround);
    return this._toModelVisibleRanges(new Range(
      startViewLineNumber,
      this.getLineMinColumn(startViewLineNumber),
      endViewLineNumber,
      this.getLineMaxColumn(endViewLineNumber)
    ));
  }
  getVisibleRanges() {
    const visibleViewRange = this.getCompletelyVisibleViewRange();
    return this._toModelVisibleRanges(visibleViewRange);
  }
  getHiddenAreas() {
    return this._lines.getHiddenAreas();
  }
  _toModelVisibleRanges(visibleViewRange) {
    const visibleRange = this.coordinatesConverter.convertViewRangeToModelRange(visibleViewRange);
    const hiddenAreas = this._lines.getHiddenAreas();
    if (hiddenAreas.length === 0) {
      return [visibleRange];
    }
    const result = [];
    let resultLen = 0;
    let startLineNumber = visibleRange.startLineNumber;
    let startColumn = visibleRange.startColumn;
    const endLineNumber = visibleRange.endLineNumber;
    const endColumn = visibleRange.endColumn;
    for (let i = 0, len = hiddenAreas.length; i < len; i++) {
      const hiddenStartLineNumber = hiddenAreas[i].startLineNumber;
      const hiddenEndLineNumber = hiddenAreas[i].endLineNumber;
      if (hiddenEndLineNumber < startLineNumber) {
        continue;
      }
      if (hiddenStartLineNumber > endLineNumber) {
        continue;
      }
      if (startLineNumber < hiddenStartLineNumber) {
        result[resultLen++] = new Range(
          startLineNumber,
          startColumn,
          hiddenStartLineNumber - 1,
          this.model.getLineMaxColumn(hiddenStartLineNumber - 1)
        );
      }
      startLineNumber = hiddenEndLineNumber + 1;
      startColumn = 1;
    }
    if (startLineNumber < endLineNumber || startLineNumber === endLineNumber && startColumn < endColumn) {
      result[resultLen++] = new Range(
        startLineNumber,
        startColumn,
        endLineNumber,
        endColumn
      );
    }
    return result;
  }
  getCompletelyVisibleViewRange() {
    const partialData = this.viewLayout.getLinesViewportData();
    const startViewLineNumber = partialData.completelyVisibleStartLineNumber;
    const endViewLineNumber = partialData.completelyVisibleEndLineNumber;
    return new Range(
      startViewLineNumber,
      this.getLineMinColumn(startViewLineNumber),
      endViewLineNumber,
      this.getLineMaxColumn(endViewLineNumber)
    );
  }
  getCompletelyVisibleViewRangeAtScrollTop(scrollTop) {
    const partialData = this.viewLayout.getLinesViewportDataAtScrollTop(scrollTop);
    const startViewLineNumber = partialData.completelyVisibleStartLineNumber;
    const endViewLineNumber = partialData.completelyVisibleEndLineNumber;
    return new Range(
      startViewLineNumber,
      this.getLineMinColumn(startViewLineNumber),
      endViewLineNumber,
      this.getLineMaxColumn(endViewLineNumber)
    );
  }
  /**
   * Applies `cursorSurroundingLines` and `stickyScroll` padding to the given view range.
   */
  getViewRangeWithCursorPadding(viewRange) {
    const options = this._configuration.options;
    const cursorSurroundingLines = options.get(EditorOption.cursorSurroundingLines);
    const stickyScroll = options.get(EditorOption.stickyScroll);
    let { startLineNumber, endLineNumber } = viewRange;
    const padding = Math.min(
      Math.max(cursorSurroundingLines, stickyScroll.enabled ? stickyScroll.maxLineCount : 0),
      Math.floor((endLineNumber - startLineNumber + 1) / 2)
    );
    startLineNumber += padding;
    endLineNumber -= Math.max(0, padding - 1);
    if (padding === 0 || startLineNumber > endLineNumber) {
      return viewRange;
    }
    return new Range(
      startLineNumber,
      this.getLineMinColumn(startLineNumber),
      endLineNumber,
      this.getLineMaxColumn(endLineNumber)
    );
  }
  saveState() {
    const compatViewState = this.viewLayout.saveState();
    const scrollTop = compatViewState.scrollTop;
    const firstViewLineNumber = this.viewLayout.getLineNumberAtVerticalOffset(scrollTop);
    const firstPosition = this.coordinatesConverter.convertViewPositionToModelPosition(new Position(firstViewLineNumber, this.getLineMinColumn(firstViewLineNumber)));
    const firstPositionDeltaTop = this.viewLayout.getVerticalOffsetForLineNumber(firstViewLineNumber) - scrollTop;
    return {
      scrollLeft: compatViewState.scrollLeft,
      firstPosition,
      firstPositionDeltaTop
    };
  }
  reduceRestoreState(state) {
    if (typeof state.firstPosition === "undefined") {
      return this._reduceRestoreStateCompatibility(state);
    }
    const modelPosition = this.model.validatePosition(state.firstPosition);
    const viewPosition = this.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
    const scrollTop = this.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber) - state.firstPositionDeltaTop;
    return {
      scrollLeft: state.scrollLeft,
      scrollTop
    };
  }
  _reduceRestoreStateCompatibility(state) {
    return {
      scrollLeft: state.scrollLeft,
      scrollTop: state.scrollTopWithoutViewZones
    };
  }
  getTabSize() {
    return this.model.getOptions().tabSize;
  }
  getLineCount() {
    return this._lines.getViewLineCount();
  }
  /**
   * Gives a hint that a lot of requests are about to come in for these line numbers.
   */
  setViewport(startLineNumber, endLineNumber, centeredLineNumber) {
    this._viewportStart.update(this, startLineNumber);
  }
  getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber) {
    return this._lines.getActiveIndentGuide(lineNumber, minLineNumber, maxLineNumber);
  }
  getLinesIndentGuides(startLineNumber, endLineNumber) {
    return this._lines.getViewLinesIndentGuides(startLineNumber, endLineNumber);
  }
  getBracketGuidesInRangeByLine(startLineNumber, endLineNumber, activePosition, options) {
    return this._lines.getViewLinesBracketGuides(startLineNumber, endLineNumber, activePosition, options);
  }
  getLineContent(lineNumber) {
    return this._lines.getViewLineContent(lineNumber);
  }
  getLineLength(lineNumber) {
    return this._lines.getViewLineLength(lineNumber);
  }
  getLineMinColumn(lineNumber) {
    return this._lines.getViewLineMinColumn(lineNumber);
  }
  getLineMaxColumn(lineNumber) {
    return this._lines.getViewLineMaxColumn(lineNumber);
  }
  getLineFirstNonWhitespaceColumn(lineNumber) {
    const result = strings.firstNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 1;
  }
  getLineLastNonWhitespaceColumn(lineNumber) {
    const result = strings.lastNonWhitespaceIndex(this.getLineContent(lineNumber));
    if (result === -1) {
      return 0;
    }
    return result + 2;
  }
  getMinimapDecorationsInRange(range) {
    return this._decorations.getMinimapDecorationsInRange(range);
  }
  getDecorationsInViewport(visibleRange) {
    return this._decorations.getDecorationsViewportData(visibleRange).decorations;
  }
  getInjectedTextAt(viewPosition) {
    return this._lines.getInjectedTextAt(viewPosition);
  }
  _getTextDirection(lineNumber, decorations) {
    let rtlCount = 0;
    for (const decoration of decorations) {
      const range = decoration.range;
      if (range.startLineNumber > lineNumber || range.endLineNumber < lineNumber) {
        continue;
      }
      const textDirection = decoration.options.textDirection;
      if (textDirection === TextDirection.RTL) {
        rtlCount++;
      } else if (textDirection === TextDirection.LTR) {
        rtlCount--;
      }
    }
    return rtlCount > 0 ? TextDirection.RTL : TextDirection.LTR;
  }
  getTextDirection(lineNumber) {
    const decorationsCollection = this._decorations.getDecorationsOnLine(lineNumber);
    return this._getTextDirection(lineNumber, decorationsCollection.decorations);
  }
  getViewportViewLineRenderingData(visibleRange, lineNumber) {
    const viewportDecorationsCollection = this._decorations.getDecorationsViewportData(visibleRange);
    const relativeLineNumber = lineNumber - visibleRange.startLineNumber;
    const inlineDecorations = viewportDecorationsCollection.inlineDecorations[relativeLineNumber];
    const hasVariableFonts = viewportDecorationsCollection.hasVariableFonts[relativeLineNumber];
    return this._getViewLineRenderingData(lineNumber, inlineDecorations, hasVariableFonts, viewportDecorationsCollection.decorations);
  }
  getViewLineRenderingData(lineNumber) {
    const decorationsCollection = this._decorations.getDecorationsOnLine(lineNumber);
    return this._getViewLineRenderingData(lineNumber, decorationsCollection.inlineDecorations[0], decorationsCollection.hasVariableFonts[0], decorationsCollection.decorations);
  }
  _getViewLineRenderingData(lineNumber, inlineDecorations, hasVariableFonts, decorations) {
    const mightContainRTL = this.model.mightContainRTL();
    const mightContainNonBasicASCII = this.model.mightContainNonBasicASCII();
    const tabSize = this.getTabSize();
    const lineData = this._lines.getViewLineData(lineNumber);
    if (lineData.inlineDecorations) {
      inlineDecorations = [
        ...inlineDecorations,
        ...lineData.inlineDecorations
      ];
    }
    return new ViewLineRenderingData(
      lineData.minColumn,
      lineData.maxColumn,
      lineData.content,
      lineData.continuesWithWrappedLine,
      mightContainRTL,
      mightContainNonBasicASCII,
      lineData.tokens,
      inlineDecorations,
      tabSize,
      lineData.startVisibleColumn,
      this._getTextDirection(lineNumber, decorations),
      hasVariableFonts
    );
  }
  getViewLineData(lineNumber) {
    return this._lines.getViewLineData(lineNumber);
  }
  getMinimapLinesRenderingData(startLineNumber, endLineNumber, needed) {
    const result = this._lines.getViewLinesData(startLineNumber, endLineNumber, needed);
    return new MinimapLinesRenderingData(
      this.getTabSize(),
      result
    );
  }
  getAllOverviewRulerDecorations(theme) {
    const decorations = this.model.getOverviewRulerDecorations(this._editorId, filterValidationDecorations(this._configuration.options), filterFontDecorations(this._configuration.options));
    const result = new OverviewRulerDecorations();
    for (const decoration of decorations) {
      const decorationOptions = decoration.options;
      const opts = decorationOptions.overviewRuler;
      if (!opts) {
        continue;
      }
      const lane = opts.position;
      if (lane === 0) {
        continue;
      }
      const color = opts.getColor(theme.value);
      const viewStartLineNumber = this.coordinatesConverter.getViewLineNumberOfModelPosition(decoration.range.startLineNumber, decoration.range.startColumn);
      const viewEndLineNumber = this.coordinatesConverter.getViewLineNumberOfModelPosition(decoration.range.endLineNumber, decoration.range.endColumn);
      result.accept(color, decorationOptions.zIndex, viewStartLineNumber, viewEndLineNumber, lane);
    }
    return result.asArray;
  }
  _invalidateDecorationsColorCache() {
    const decorations = this.model.getOverviewRulerDecorations();
    for (const decoration of decorations) {
      const opts1 = decoration.options.overviewRuler;
      opts1?.invalidateCachedColor();
      const opts2 = decoration.options.minimap;
      opts2?.invalidateCachedColor();
    }
  }
  getValueInRange(range, eol) {
    const modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
    return this.model.getValueInRange(modelRange, eol);
  }
  getValueLengthInRange(range, eol) {
    const modelRange = this.coordinatesConverter.convertViewRangeToModelRange(range);
    return this.model.getValueLengthInRange(modelRange, eol);
  }
  modifyPosition(position, offset) {
    const modelPosition = this.coordinatesConverter.convertViewPositionToModelPosition(position);
    const resultModelPosition = this.model.modifyPosition(modelPosition, offset);
    return this.coordinatesConverter.convertModelPositionToViewPosition(resultModelPosition);
  }
  deduceModelPositionRelativeToViewPosition(viewAnchorPosition, deltaOffset, lineFeedCnt) {
    const modelAnchor = this.coordinatesConverter.convertViewPositionToModelPosition(viewAnchorPosition);
    if (this.model.getEOL().length === 2) {
      if (deltaOffset < 0) {
        deltaOffset -= lineFeedCnt;
      } else {
        deltaOffset += lineFeedCnt;
      }
    }
    const modelAnchorOffset = this.model.getOffsetAt(modelAnchor);
    const resultOffset = modelAnchorOffset + deltaOffset;
    return this.model.getPositionAt(resultOffset);
  }
  getPlainTextToCopy(modelRanges, emptySelectionClipboard, forceCRLF) {
    const newLineCharacter = forceCRLF ? "\r\n" : this.model.getEOL();
    modelRanges = modelRanges.slice(0);
    modelRanges.sort(Range.compareRangesUsingStarts);
    let hasEmptyRange = false;
    let hasNonEmptyRange = false;
    for (const range of modelRanges) {
      if (range.isEmpty()) {
        hasEmptyRange = true;
      } else {
        hasNonEmptyRange = true;
      }
    }
    if (!hasNonEmptyRange && !emptySelectionClipboard) {
      return { sourceRanges: [], sourceText: "" };
    }
    const ranges = [];
    const result = [];
    const pushRange = (modelRange, append = "") => {
      ranges.push(modelRange);
      result.push(this.model.getValueInRange(modelRange, forceCRLF ? EndOfLinePreference.CRLF : EndOfLinePreference.TextDefined) + append);
    };
    if (hasEmptyRange && emptySelectionClipboard) {
      let prevModelLineNumber = 0;
      for (const modelRange of modelRanges) {
        const modelLineNumber = modelRange.startLineNumber;
        if (modelRange.isEmpty()) {
          if (modelLineNumber !== prevModelLineNumber) {
            pushRange(new Range(modelLineNumber, this.model.getLineMinColumn(modelLineNumber), modelLineNumber, this.model.getLineMaxColumn(modelLineNumber)), newLineCharacter);
          }
        } else {
          pushRange(modelRange);
        }
        prevModelLineNumber = modelLineNumber;
      }
    } else {
      for (const modelRange of modelRanges) {
        if (!modelRange.isEmpty()) {
          pushRange(modelRange);
        }
      }
    }
    return { sourceRanges: ranges, sourceText: result.length === 1 ? result[0] : result };
  }
  getRichTextToCopy(modelRanges, emptySelectionClipboard) {
    const languageId = this.model.getLanguageId();
    if (languageId === PLAINTEXT_LANGUAGE_ID) {
      return null;
    }
    if (modelRanges.length !== 1) {
      return null;
    }
    let range = modelRanges[0];
    if (range.isEmpty()) {
      if (!emptySelectionClipboard) {
        return null;
      }
      const lineNumber = range.startLineNumber;
      range = new Range(lineNumber, this.model.getLineMinColumn(lineNumber), lineNumber, this.model.getLineMaxColumn(lineNumber));
    }
    const fontInfo = this._configuration.options.get(EditorOption.fontInfo);
    const colorMap = this._getColorMap();
    const hasBadChars = /[:;\\\/<>]/.test(fontInfo.fontFamily);
    const useDefaultFontFamily = hasBadChars || fontInfo.fontFamily === EDITOR_FONT_DEFAULTS.fontFamily;
    let fontFamily;
    if (useDefaultFontFamily) {
      fontFamily = EDITOR_FONT_DEFAULTS.fontFamily;
    } else {
      fontFamily = fontInfo.fontFamily;
      fontFamily = fontFamily.replace(/"/g, "'");
      const hasQuotesOrIsList = /[,']/.test(fontFamily);
      if (!hasQuotesOrIsList) {
        const needsQuotes = /[+ ]/.test(fontFamily);
        if (needsQuotes) {
          fontFamily = `'${fontFamily}'`;
        }
      }
      fontFamily = `${fontFamily}, ${EDITOR_FONT_DEFAULTS.fontFamily}`;
    }
    return {
      mode: languageId,
      html: `<div style="color: ${colorMap[ColorId.DefaultForeground]};background-color: ${colorMap[ColorId.DefaultBackground]};font-family: ${fontFamily};font-weight: ${fontInfo.fontWeight};font-size: ${fontInfo.fontSize}px;line-height: ${fontInfo.lineHeight}px;white-space: pre;">` + this._getHTMLToCopy(range, colorMap) + "</div>"
    };
  }
  _getHTMLToCopy(modelRange, colorMap) {
    const startLineNumber = modelRange.startLineNumber;
    const startColumn = modelRange.startColumn;
    const endLineNumber = modelRange.endLineNumber;
    const endColumn = modelRange.endColumn;
    const tabSize = this.getTabSize();
    let result = "";
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineTokens = this.model.tokenization.getLineTokens(lineNumber);
      const lineContent = lineTokens.getLineContent();
      const startOffset = lineNumber === startLineNumber ? startColumn - 1 : 0;
      const endOffset = lineNumber === endLineNumber ? endColumn - 1 : lineContent.length;
      if (lineContent === "") {
        result += "<br>";
      } else {
        result += tokenizeLineToHTML(lineContent, lineTokens.inflate(), colorMap, startOffset, endOffset, tabSize, platform.isWindows);
      }
    }
    return result;
  }
  _getColorMap() {
    const colorMap = TokenizationRegistry.getColorMap();
    const result = ["#000000"];
    if (colorMap) {
      for (let i = 1, len = colorMap.length; i < len; i++) {
        result[i] = Color.Format.CSS.formatHex(colorMap[i]);
      }
    }
    return result;
  }
  //#region cursor operations
  getPrimaryCursorState() {
    return this._cursor.getPrimaryCursorState();
  }
  getLastAddedCursorIndex() {
    return this._cursor.getLastAddedCursorIndex();
  }
  getCursorStates() {
    return this._cursor.getCursorStates();
  }
  setCursorStates(source, reason, states) {
    return this._withViewEventsCollector((eventsCollector) => this._cursor.setStates(eventsCollector, source, reason, states));
  }
  getCursorColumnSelectData() {
    return this._cursor.getCursorColumnSelectData();
  }
  getCursorAutoClosedCharacters() {
    return this._cursor.getAutoClosedCharacters();
  }
  setCursorColumnSelectData(columnSelectData) {
    this._cursor.setCursorColumnSelectData(columnSelectData);
  }
  getPrevEditOperationType() {
    return this._cursor.getPrevEditOperationType();
  }
  setPrevEditOperationType(type) {
    this._cursor.setPrevEditOperationType(type);
  }
  getSelection() {
    return this._cursor.getSelection();
  }
  getSelections() {
    return this._cursor.getSelections();
  }
  getPosition() {
    return this._cursor.getPrimaryCursorState().modelState.position;
  }
  setSelections(source, selections, reason = CursorChangeReason.NotSet) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.setSelections(eventsCollector, source, selections, reason));
  }
  saveCursorState() {
    return this._cursor.saveState();
  }
  restoreCursorState(states) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.restoreState(eventsCollector, states));
  }
  _executeCursorEdit(callback) {
    if (this._cursor.context.cursorConfig.readOnly) {
      this._eventDispatcher.emitOutgoingEvent(new ReadOnlyEditAttemptEvent());
      return;
    }
    this._withViewEventsCollector(callback);
  }
  executeEdits(source, edits, cursorStateComputer, reason) {
    this._executeCursorEdit((eventsCollector) => this._cursor.executeEdits(eventsCollector, source, edits, cursorStateComputer, reason));
  }
  startComposition() {
    this._executeCursorEdit((eventsCollector) => this._cursor.startComposition(eventsCollector));
  }
  endComposition(source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.endComposition(eventsCollector, source));
  }
  type(text, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.type(eventsCollector, text, source));
  }
  compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.compositionType(eventsCollector, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source));
  }
  paste(text, pasteOnNewLine, multicursorText, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.paste(eventsCollector, text, pasteOnNewLine, multicursorText, source));
  }
  cut(source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.cut(eventsCollector, source));
  }
  executeCommand(command, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.executeCommand(eventsCollector, command, source));
  }
  executeCommands(commands, source) {
    this._executeCursorEdit((eventsCollector) => this._cursor.executeCommands(eventsCollector, commands, source));
  }
  revealAllCursors(source, revealHorizontal, minimalReveal = false) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.revealAll(eventsCollector, source, minimalReveal, viewEvents.VerticalRevealType.Simple, revealHorizontal, ScrollType.Smooth));
  }
  revealPrimaryCursor(source, revealHorizontal, minimalReveal = false) {
    this._withViewEventsCollector((eventsCollector) => this._cursor.revealPrimary(eventsCollector, source, minimalReveal, viewEvents.VerticalRevealType.Simple, revealHorizontal, ScrollType.Smooth));
  }
  revealTopMostCursor(source) {
    const viewPosition = this._cursor.getTopMostViewPosition();
    const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
    this._withViewEventsCollector((eventsCollector) => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, viewEvents.VerticalRevealType.Simple, true, ScrollType.Smooth)));
  }
  revealBottomMostCursor(source) {
    const viewPosition = this._cursor.getBottomMostViewPosition();
    const viewRange = new Range(viewPosition.lineNumber, viewPosition.column, viewPosition.lineNumber, viewPosition.column);
    this._withViewEventsCollector((eventsCollector) => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, viewEvents.VerticalRevealType.Simple, true, ScrollType.Smooth)));
  }
  revealRange(source, revealHorizontal, viewRange, verticalType, scrollType) {
    this._withViewEventsCollector((eventsCollector) => eventsCollector.emitViewEvent(new viewEvents.ViewRevealRangeRequestEvent(source, false, viewRange, null, verticalType, revealHorizontal, scrollType)));
  }
  //#endregion
  //#region viewLayout
  changeWhitespace(callback) {
    const hadAChange = this.viewLayout.changeWhitespace(callback);
    if (hadAChange) {
      this._eventDispatcher.emitSingleViewEvent(new viewEvents.ViewZonesChangedEvent());
      this._eventDispatcher.emitOutgoingEvent(new ViewZonesChangedEvent());
    }
  }
  //#endregion
  _withViewEventsCollector(callback) {
    return this._transactionalTarget.batchChanges(() => {
      return this._emitViewEvent(callback);
    });
  }
  _emitViewEvent(callback) {
    try {
      const eventsCollector = this._eventDispatcher.beginEmitViewEvents();
      return callback(eventsCollector);
    } finally {
      this._eventDispatcher.endEmitViewEvents();
    }
  }
  batchEvents(callback) {
    this._withViewEventsCollector(() => {
      callback();
    });
  }
  normalizePosition(position, affinity) {
    return this._lines.normalizePosition(position, affinity);
  }
  /**
   * Gets the column at which indentation stops at a given line.
   * @internal
  */
  getLineIndentColumn(lineNumber) {
    return this._lines.getLineIndentColumn(lineNumber);
  }
}
class ViewportStart {
  constructor(_model, _viewLineNumber, _isValid, _modelTrackedRange, _startLineDelta) {
    this._model = _model;
    this._viewLineNumber = _viewLineNumber;
    this._isValid = _isValid;
    this._modelTrackedRange = _modelTrackedRange;
    this._startLineDelta = _startLineDelta;
  }
  static create(model) {
    const viewportStartLineTrackedRange = model._setTrackedRange(null, new Range(1, 1, 1, 1), TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
    return new ViewportStart(model, 1, false, viewportStartLineTrackedRange, 0);
  }
  get viewLineNumber() {
    return this._viewLineNumber;
  }
  get isValid() {
    return this._isValid;
  }
  get modelTrackedRange() {
    return this._modelTrackedRange;
  }
  get startLineDelta() {
    return this._startLineDelta;
  }
  dispose() {
    this._model._setTrackedRange(this._modelTrackedRange, null, TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
  }
  update(viewModel, startLineNumber) {
    const position = viewModel.coordinatesConverter.convertViewPositionToModelPosition(new Position(startLineNumber, viewModel.getLineMinColumn(startLineNumber)));
    const viewportStartLineTrackedRange = viewModel.model._setTrackedRange(this._modelTrackedRange, new Range(position.lineNumber, position.column, position.lineNumber, position.column), TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges);
    const viewportStartLineTop = viewModel.viewLayout.getVerticalOffsetForLineNumber(startLineNumber);
    const scrollTop = viewModel.viewLayout.getCurrentScrollTop();
    this._viewLineNumber = startLineNumber;
    this._isValid = true;
    this._modelTrackedRange = viewportStartLineTrackedRange;
    this._startLineDelta = scrollTop - viewportStartLineTop;
  }
  invalidate() {
    this._isValid = false;
  }
}
class OverviewRulerDecorations {
  constructor() {
    this._asMap = /* @__PURE__ */ Object.create(null);
    this.asArray = [];
  }
  accept(color, zIndex, startLineNumber, endLineNumber, lane) {
    const prevGroup = this._asMap[color];
    if (prevGroup) {
      const prevData = prevGroup.data;
      const prevLane = prevData[prevData.length - 3];
      const prevEndLineNumber = prevData[prevData.length - 1];
      if (prevLane === lane && prevEndLineNumber + 1 >= startLineNumber) {
        if (endLineNumber > prevEndLineNumber) {
          prevData[prevData.length - 1] = endLineNumber;
        }
        return;
      }
      prevData.push(lane, startLineNumber, endLineNumber);
    } else {
      const group = new OverviewRulerDecorationsGroup(color, zIndex, [lane, startLineNumber, endLineNumber]);
      this._asMap[color] = group;
      this.asArray.push(group);
    }
  }
}
class HiddenAreasModel {
  constructor() {
    this.hiddenAreas = /* @__PURE__ */ new Map();
    this.shouldRecompute = false;
    this.ranges = [];
  }
  setHiddenAreas(source, ranges) {
    const existing = this.hiddenAreas.get(source);
    if (existing && rangeArraysEqual(existing, ranges)) {
      return;
    }
    this.hiddenAreas.set(source, ranges);
    this.shouldRecompute = true;
  }
  /**
   * The returned array is immutable.
  */
  getMergedRanges() {
    if (!this.shouldRecompute) {
      return this.ranges;
    }
    this.shouldRecompute = false;
    const newRanges = Array.from(this.hiddenAreas.values()).reduce((r, hiddenAreas) => mergeLineRangeArray(r, hiddenAreas), []);
    if (rangeArraysEqual(this.ranges, newRanges)) {
      return this.ranges;
    }
    this.ranges = newRanges;
    return this.ranges;
  }
}
function mergeLineRangeArray(arr1, arr2) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < arr1.length && j < arr2.length) {
    const item1 = arr1[i];
    const item2 = arr2[j];
    if (item1.endLineNumber < item2.startLineNumber - 1) {
      result.push(arr1[i++]);
    } else if (item2.endLineNumber < item1.startLineNumber - 1) {
      result.push(arr2[j++]);
    } else {
      const startLineNumber = Math.min(item1.startLineNumber, item2.startLineNumber);
      const endLineNumber = Math.max(item1.endLineNumber, item2.endLineNumber);
      result.push(new Range(startLineNumber, 1, endLineNumber, 1));
      i++;
      j++;
    }
  }
  while (i < arr1.length) {
    result.push(arr1[i++]);
  }
  while (j < arr2.length) {
    result.push(arr2[j++]);
  }
  return result;
}
function rangeArraysEqual(arr1, arr2) {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length; i++) {
    if (!arr1[i].equalsRange(arr2[i])) {
      return false;
    }
  }
  return true;
}
class StableViewport {
  constructor(viewportStartModelPosition, startLineDelta) {
    this.viewportStartModelPosition = viewportStartModelPosition;
    this.startLineDelta = startLineDelta;
  }
  recoverViewportStart(coordinatesConverter, viewLayout) {
    if (!this.viewportStartModelPosition) {
      return;
    }
    const viewPosition = coordinatesConverter.convertModelPositionToViewPosition(this.viewportStartModelPosition);
    const viewPositionTop = viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber);
    viewLayout.setScrollPosition({ scrollTop: viewPositionTop + this.startLineDelta }, ScrollType.Immediate);
  }
}
export {
  ViewModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcdmlld01vZGVsXFx2aWV3TW9kZWxJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQXJyYXlRdWV1ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBFZGl0b3JPcHRpb24sIGZpbHRlclZhbGlkYXRpb25EZWNvcmF0aW9ucywgZmlsdGVyRm9udERlY29yYXRpb25zLCBGaW5kQ29tcHV0ZWRFZGl0b3JPcHRpb25WYWx1ZUJ5SWQgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRk9OVF9ERUZBVUxUUyB9IGZyb20gJy4uL2NvbmZpZy9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBDdXJzb3JzQ29udHJvbGxlciB9IGZyb20gJy4uL2N1cnNvci9jdXJzb3IuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29uZmlndXJhdGlvbiwgQ3Vyc29yU3RhdGUsIEVkaXRPcGVyYXRpb25UeXBlLCBJQ29sdW1uU2VsZWN0RGF0YSwgUGFydGlhbEN1cnNvclN0YXRlIH0gZnJvbSAnLi4vY3Vyc29yQ29tbW9uLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiB9IGZyb20gJy4uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiwgU2VsZWN0aW9uIH0gZnJvbSAnLi4vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmQsIElDdXJzb3JTdGF0ZSwgSVZpZXdTdGF0ZSwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIElBdHRhY2hlZFZpZXcsIElDdXJzb3JTdGF0ZUNvbXB1dGVyLCBJR2x5cGhNYXJnaW5MYW5lc01vZGVsLCBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24sIElUZXh0TW9kZWwsIFBvc2l0aW9uQWZmaW5pdHksIFRleHREaXJlY3Rpb24sIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlSW5kZW50R3VpZGVJbmZvLCBCcmFja2V0R3VpZGVPcHRpb25zLCBJbmRlbnRHdWlkZSB9IGZyb20gJy4uL3RleHRNb2RlbEd1aWRlcy5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25NaW5pbWFwT3B0aW9ucywgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucywgTW9kZWxEZWNvcmF0aW9uT3ZlcnZpZXdSdWxlck9wdGlvbnMgfSBmcm9tICcuLi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0ICogYXMgdGV4dE1vZGVsRXZlbnRzIGZyb20gJy4uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBDb2xvcklkIH0gZnJvbSAnLi4vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBQTEFJTlRFWFRfTEFOR1VBR0VfSUQgfSBmcm9tICcuLi9sYW5ndWFnZXMvbW9kZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyB0b2tlbml6ZUxpbmVUb0hUTUwgfSBmcm9tICcuLi9sYW5ndWFnZXMvdGV4dFRvSHRtbFRva2VuaXplci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JUaGVtZSB9IGZyb20gJy4uL2VkaXRvclRoZW1lLmpzJztcbmltcG9ydCAqIGFzIHZpZXdFdmVudHMgZnJvbSAnLi4vdmlld0V2ZW50cy5qcyc7XG5pbXBvcnQgeyBWaWV3TGF5b3V0IH0gZnJvbSAnLi4vdmlld0xheW91dC92aWV3TGF5b3V0LmpzJztcbmltcG9ydCB7IE1pbmltYXBUb2tlbnNDb2xvclRyYWNrZXIgfSBmcm9tICcuL21pbmltYXBUb2tlbnNDb2xvclRyYWNrZXIuanMnO1xuaW1wb3J0IHsgSUxpbmVCcmVha3NDb21wdXRlciwgSUxpbmVCcmVha3NDb21wdXRlckNvbnRleHQsIElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LCBJbmplY3RlZFRleHQgfSBmcm9tICcuLi9tb2RlbExpbmVQcm9qZWN0aW9uRGF0YS5qcyc7XG5pbXBvcnQgeyBWaWV3RXZlbnRIYW5kbGVyIH0gZnJvbSAnLi4vdmlld0V2ZW50SGFuZGxlci5qcyc7XG5pbXBvcnQgeyBJTGluZUhlaWdodENoYW5nZUFjY2Vzc29yLCBJVmlld01vZGVsLCBJV2hpdGVzcGFjZUNoYW5nZUFjY2Vzc29yLCBNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhLCBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cCwgVmlld0xpbmVEYXRhLCBWaWV3TGluZVJlbmRlcmluZ0RhdGEsIFZpZXdNb2RlbERlY29yYXRpb24gfSBmcm9tICcuLi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsRGVjb3JhdGlvbnMgfSBmcm9tICcuL3ZpZXdNb2RlbERlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IEZvY3VzQ2hhbmdlZEV2ZW50LCBIaWRkZW5BcmVhc0NoYW5nZWRFdmVudCwgTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50LCBNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50LCBNb2RlbEZvbnRDaGFuZ2VkRXZlbnQsIE1vZGVsTGFuZ3VhZ2VDaGFuZ2VkRXZlbnQsIE1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50LCBNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQsIE1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudCwgTW9kZWxUb2tlbnNDaGFuZ2VkRXZlbnQsIE91dGdvaW5nVmlld01vZGVsRXZlbnQsIFJlYWRPbmx5RWRpdEF0dGVtcHRFdmVudCwgU2Nyb2xsQ2hhbmdlZEV2ZW50LCBWaWV3TW9kZWxFdmVudERpc3BhdGNoZXIsIFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvciwgVmlld1pvbmVzQ2hhbmdlZEV2ZW50LCBXaWRnZXRGb2N1c0NoYW5nZWRFdmVudCB9IGZyb20gJy4uL3ZpZXdNb2RlbEV2ZW50RGlzcGF0Y2hlci5qcyc7XG5pbXBvcnQgeyBJVmlld01vZGVsTGluZXMsIFZpZXdNb2RlbExpbmVzRnJvbU1vZGVsQXNJcywgVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwgfSBmcm9tICcuL3ZpZXdNb2RlbExpbmVzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdseXBoTWFyZ2luTGFuZXNNb2RlbCB9IGZyb20gJy4vZ2x5cGhMYW5lc01vZGVsLmpzJztcbmltcG9ydCB7IEN1c3RvbUxpbmVIZWlnaHREYXRhIH0gZnJvbSAnLi4vdmlld0xheW91dC9saW5lSGVpZ2h0cy5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVEZWNvcmF0aW9uIH0gZnJvbSAnLi9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29vcmRpbmF0ZXNDb252ZXJ0ZXIgfSBmcm9tICcuLi9jb29yZGluYXRlc0NvbnZlcnRlci5qcyc7XG5cbmNvbnN0IFVTRV9JREVOVElUWV9MSU5FU19DT0xMRUNUSU9OID0gdHJ1ZTtcblxuZXhwb3J0IGNsYXNzIFZpZXdNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVmlld01vZGVsIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JJZDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uOiBJRWRpdG9yQ29uZmlndXJhdGlvbjtcblx0cHVibGljIHJlYWRvbmx5IG1vZGVsOiBJVGV4dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ldmVudERpc3BhdGNoZXI6IFZpZXdNb2RlbEV2ZW50RGlzcGF0Y2hlcjtcblx0cHVibGljIHJlYWRvbmx5IG9uRXZlbnQ6IEV2ZW50PE91dGdvaW5nVmlld01vZGVsRXZlbnQ+O1xuXHRwdWJsaWMgY3Vyc29yQ29uZmlnOiBDdXJzb3JDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cGRhdGVDb25maWd1cmF0aW9uVmlld0xpbmVDb3VudDogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSBfaGFzRm9jdXM6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdwb3J0U3RhcnQ6IFZpZXdwb3J0U3RhcnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVzOiBJVmlld01vZGVsTGluZXM7XG5cdHB1YmxpYyByZWFkb25seSBjb29yZGluYXRlc0NvbnZlcnRlcjogSUNvb3JkaW5hdGVzQ29udmVydGVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgdmlld0xheW91dDogVmlld0xheW91dDtcblx0cHJpdmF0ZSByZWFkb25seSBfY3Vyc29yOiBDdXJzb3JzQ29udHJvbGxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnM6IFZpZXdNb2RlbERlY29yYXRpb25zO1xuXHRwdWJsaWMgcmVhZG9ubHkgZ2x5cGhMYW5lczogSUdseXBoTWFyZ2luTGFuZXNNb2RlbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3JJZDogbnVtYmVyLFxuXHRcdGNvbmZpZ3VyYXRpb246IElFZGl0b3JDb25maWd1cmF0aW9uLFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdGRvbUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk6IElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnk6IElMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWU6IChjYWxsYmFjazogKCkgPT4gdm9pZCkgPT4gSURpc3Bvc2FibGUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXR0YWNoZWRWaWV3OiBJQXR0YWNoZWRWaWV3LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyYW5zYWN0aW9uYWxUYXJnZXQ6IElCYXRjaGFibGVUYXJnZXQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9lZGl0b3JJZCA9IGVkaXRvcklkO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uO1xuXHRcdHRoaXMubW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIgPSBuZXcgVmlld01vZGVsRXZlbnREaXNwYXRjaGVyKCk7XG5cdFx0dGhpcy5vbkV2ZW50ID0gdGhpcy5fZXZlbnREaXNwYXRjaGVyLm9uRXZlbnQ7XG5cdFx0dGhpcy5jdXJzb3JDb25maWcgPSBuZXcgQ3Vyc29yQ29uZmlndXJhdGlvbih0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKSwgdGhpcy5tb2RlbC5nZXRPcHRpb25zKCksIHRoaXMuX2NvbmZpZ3VyYXRpb24sIHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvblZpZXdMaW5lQ291bnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl91cGRhdGVDb25maWd1cmF0aW9uVmlld0xpbmVDb3VudE5vdygpLCAwKSk7XG5cdFx0dGhpcy5faGFzRm9jdXMgPSBmYWxzZTtcblx0XHR0aGlzLl92aWV3cG9ydFN0YXJ0ID0gVmlld3BvcnRTdGFydC5jcmVhdGUodGhpcy5tb2RlbCk7XG5cdFx0dGhpcy5nbHlwaExhbmVzID0gbmV3IEdseXBoTWFyZ2luTGFuZXNNb2RlbCgwKTtcblxuXHRcdGlmIChVU0VfSURFTlRJVFlfTElORVNfQ09MTEVDVElPTiAmJiB0aGlzLm1vZGVsLmlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24oKSkge1xuXG5cdFx0XHR0aGlzLl9saW5lcyA9IG5ldyBWaWV3TW9kZWxMaW5lc0Zyb21Nb2RlbEFzSXModGhpcy5tb2RlbCk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRcdGNvbnN0IHdyYXBwaW5nU3RyYXRlZ3kgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdTdHJhdGVneSk7XG5cdFx0XHRjb25zdCB3cmFwcGluZ0luZm8gPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvKTtcblx0XHRcdGNvbnN0IHdyYXBwaW5nSW5kZW50ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5kZW50KTtcblx0XHRcdGNvbnN0IHdvcmRCcmVhayA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkQnJlYWspO1xuXHRcdFx0Y29uc3Qgd3JhcE9uRXNjYXBlZExpbmVGZWVkcyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwT25Fc2NhcGVkTGluZUZlZWRzKTtcblxuXHRcdFx0dGhpcy5fbGluZXMgPSBuZXcgVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwoXG5cdFx0XHRcdHRoaXMuX2VkaXRvcklkLFxuXHRcdFx0XHR0aGlzLm1vZGVsLFxuXHRcdFx0XHRkb21MaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdFx0XHRtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdFx0XHRmb250SW5mbyxcblx0XHRcdFx0dGhpcy5tb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZSxcblx0XHRcdFx0d3JhcHBpbmdTdHJhdGVneSxcblx0XHRcdFx0d3JhcHBpbmdJbmZvLndyYXBwaW5nQ29sdW1uLFxuXHRcdFx0XHR3cmFwcGluZ0luZGVudCxcblx0XHRcdFx0d29yZEJyZWFrLFxuXHRcdFx0XHR3cmFwT25Fc2NhcGVkTGluZUZlZWRzXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIgPSB0aGlzLl9saW5lcy5jcmVhdGVDb29yZGluYXRlc0NvbnZlcnRlcigpO1xuXG5cdFx0dGhpcy5fY3Vyc29yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEN1cnNvcnNDb250cm9sbGVyKG1vZGVsLCB0aGlzLCB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLCB0aGlzLmN1cnNvckNvbmZpZykpO1xuXG5cdFx0dGhpcy52aWV3TGF5b3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFZpZXdMYXlvdXQodGhpcy5fY29uZmlndXJhdGlvbiwgdGhpcy5nZXRMaW5lQ291bnQoKSwgdGhpcy5fZ2V0Q3VzdG9tTGluZUhlaWdodHMoKSwgc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3TGF5b3V0Lm9uRGlkU2Nyb2xsKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5zY3JvbGxUb3BDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX2hhbmRsZVZpc2libGVMaW5lc0NoYW5nZWQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fdmlld3BvcnRTdGFydC5pbnZhbGlkYXRlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3U2Nyb2xsQ2hhbmdlZEV2ZW50KGUpKTtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgU2Nyb2xsQ2hhbmdlZEV2ZW50KFxuXHRcdFx0XHRlLm9sZFNjcm9sbFdpZHRoLCBlLm9sZFNjcm9sbExlZnQsIGUub2xkU2Nyb2xsSGVpZ2h0LCBlLm9sZFNjcm9sbFRvcCxcblx0XHRcdFx0ZS5zY3JvbGxXaWR0aCwgZS5zY3JvbGxMZWZ0LCBlLnNjcm9sbEhlaWdodCwgZS5zY3JvbGxUb3Bcblx0XHRcdCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0xheW91dC5vbkRpZENvbnRlbnRTaXplQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQoZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSBuZXcgVmlld01vZGVsRGVjb3JhdGlvbnModGhpcy5fZWRpdG9ySWQsIHRoaXMubW9kZWwsIHRoaXMuX2NvbmZpZ3VyYXRpb24sIHRoaXMuX2xpbmVzLCB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyTW9kZWxFdmVudHMoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2VGYXN0KChlKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBldmVudHNDb2xsZWN0b3IgPSB0aGlzLl9ldmVudERpc3BhdGNoZXIuYmVnaW5FbWl0Vmlld0V2ZW50cygpO1xuXHRcdFx0XHR0aGlzLl9vbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGV2ZW50c0NvbGxlY3RvciwgZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW5kRW1pdFZpZXdFdmVudHMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihNaW5pbWFwVG9rZW5zQ29sb3JUcmFja2VyLmdldEluc3RhbmNlKCkub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRTaW5nbGVWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld1Rva2Vuc0NvbG9yc0NoYW5nZWRFdmVudCgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCh0aGVtZSkgPT4ge1xuXHRcdFx0dGhpcy5faW52YWxpZGF0ZURlY29yYXRpb25zQ29sb3JDYWNoZSgpO1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRTaW5nbGVWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld1RoZW1lQ2hhbmdlZEV2ZW50KHRoZW1lKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvblZpZXdMaW5lQ291bnROb3coKTtcblx0XHR0aGlzLm1vZGVsLnJlZ2lzdGVyVmlld01vZGVsKHRoaXMpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gRmlyc3QgcmVtb3ZlIGxpc3RlbmVycywgYXMgZGlzcG9zaW5nIHRoZSBsaW5lcyBtaWdodCBlbmQgdXAgc2VuZGluZ1xuXHRcdC8vIG1vZGVsIGRlY29yYXRpb24gY2hhbmdlZCBldmVudHMgLi4uIGFuZCB3ZSBubyBsb25nZXIgY2FyZSBhYm91dCB0aGVtIC4uLlxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9ucy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbGluZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3ZpZXdwb3J0U3RhcnQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5tb2RlbC51bnJlZ2lzdGVyVmlld01vZGVsKHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGdldEVkaXRvck9wdGlvbjxUIGV4dGVuZHMgRWRpdG9yT3B0aW9uPihpZDogVCk6IEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZDxUPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoaWQpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZUxpbmVCcmVha3NDb21wdXRlcihjb250ZXh0PzogSUxpbmVCcmVha3NDb21wdXRlckNvbnRleHQpOiBJTGluZUJyZWFrc0NvbXB1dGVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuY3JlYXRlTGluZUJyZWFrc0NvbXB1dGVyKGNvbnRleHQpO1xuXHR9XG5cblx0cHVibGljIGFkZFZpZXdFdmVudEhhbmRsZXIoZXZlbnRIYW5kbGVyOiBWaWV3RXZlbnRIYW5kbGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmFkZFZpZXdFdmVudEhhbmRsZXIoZXZlbnRIYW5kbGVyKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVWaWV3RXZlbnRIYW5kbGVyKGV2ZW50SGFuZGxlcjogVmlld0V2ZW50SGFuZGxlcik6IHZvaWQge1xuXHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5yZW1vdmVWaWV3RXZlbnRIYW5kbGVyKGV2ZW50SGFuZGxlcik7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDdXN0b21MaW5lSGVpZ2h0cygpOiBDdXN0b21MaW5lSGVpZ2h0RGF0YVtdIHtcblx0XHRjb25zdCBhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMpO1xuXHRcdGlmICghYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5tb2RlbC5nZXRDdXN0b21MaW5lSGVpZ2h0c0RlY29yYXRpb25zKHRoaXMuX2VkaXRvcklkKTtcblx0XHRyZXR1cm4gQ3VzdG9tTGluZUhlaWdodERhdGEuZnJvbURlY29yYXRpb25zKGRlY29yYXRpb25zLCB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLCB0aGlzLl9jb25maWd1cmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1c3RvbUxpbmVIZWlnaHRzRm9yTGluZXMoZnJvbUxpbmVOdW1iZXI6IG51bWJlciwgdG9MaW5lTnVtYmVyOiBudW1iZXIpOiBDdXN0b21MaW5lSGVpZ2h0RGF0YVtdIHtcblx0XHRjb25zdCBhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMpO1xuXHRcdGlmICghYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsUmFuZ2UgPSBuZXcgUmFuZ2UoZnJvbUxpbmVOdW1iZXIsIDEsIHRvTGluZU51bWJlciwgdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHRvTGluZU51bWJlcikpO1xuXHRcdGNvbnN0IGRlY29yYXRpb25zID0gdGhpcy5tb2RlbC5nZXRDdXN0b21MaW5lSGVpZ2h0c0RlY29yYXRpb25zSW5SYW5nZShtb2RlbFJhbmdlLCB0aGlzLl9lZGl0b3JJZCk7XG5cdFx0cmV0dXJuIEN1c3RvbUxpbmVIZWlnaHREYXRhLmZyb21EZWNvcmF0aW9ucyhkZWNvcmF0aW9ucywgdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlciwgdGhpcy5fY29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb25maWd1cmF0aW9uVmlld0xpbmVDb3VudE5vdygpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnNldFZpZXdMaW5lQ291bnQodGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVDb3VudCgpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9kZWxWaXNpYmxlUmFuZ2VzKCk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IGxpbmVzVmlld3BvcnREYXRhID0gdGhpcy52aWV3TGF5b3V0LmdldExpbmVzVmlld3BvcnREYXRhKCk7XG5cdFx0Y29uc3Qgdmlld1Zpc2libGVSYW5nZSA9IG5ldyBSYW5nZShcblx0XHRcdGxpbmVzVmlld3BvcnREYXRhLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdHRoaXMuZ2V0TGluZU1pbkNvbHVtbihsaW5lc1ZpZXdwb3J0RGF0YS5zdGFydExpbmVOdW1iZXIpLFxuXHRcdFx0bGluZXNWaWV3cG9ydERhdGEuZW5kTGluZU51bWJlcixcblx0XHRcdHRoaXMuZ2V0TGluZU1heENvbHVtbihsaW5lc1ZpZXdwb3J0RGF0YS5lbmRMaW5lTnVtYmVyKVxuXHRcdCk7XG5cdFx0Y29uc3QgbW9kZWxWaXNpYmxlUmFuZ2VzID0gdGhpcy5fdG9Nb2RlbFZpc2libGVSYW5nZXModmlld1Zpc2libGVSYW5nZSk7XG5cdFx0cmV0dXJuIG1vZGVsVmlzaWJsZVJhbmdlcztcblx0fVxuXG5cdHB1YmxpYyB2aXNpYmxlTGluZXNTdGFiaWxpemVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsVmlzaWJsZVJhbmdlcyA9IHRoaXMuZ2V0TW9kZWxWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0dGhpcy5fYXR0YWNoZWRWaWV3LnNldFZpc2libGVMaW5lcyhtb2RlbFZpc2libGVSYW5nZXMsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlVmlzaWJsZUxpbmVzQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbFZpc2libGVSYW5nZXMgPSB0aGlzLmdldE1vZGVsVmlzaWJsZVJhbmdlcygpO1xuXHRcdHRoaXMuX2F0dGFjaGVkVmlldy5zZXRWaXNpYmxlTGluZXMobW9kZWxWaXNpYmxlUmFuZ2VzLCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0SGFzRm9jdXMoaGFzRm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9oYXNGb2N1cyA9IGhhc0ZvY3VzO1xuXHRcdHRoaXMuX2N1cnNvci5zZXRIYXNGb2N1cyhoYXNGb2N1cyk7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRTaW5nbGVWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0ZvY3VzQ2hhbmdlZEV2ZW50KGhhc0ZvY3VzKSk7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBGb2N1c0NoYW5nZWRFdmVudCghaGFzRm9jdXMsIGhhc0ZvY3VzKSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0SGFzV2lkZ2V0Rm9jdXMoaGFzV2lkZ2V0Rm9jdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IFdpZGdldEZvY3VzQ2hhbmdlZEV2ZW50KCFoYXNXaWRnZXRGb2N1cywgaGFzV2lkZ2V0Rm9jdXMpKTtcblx0fVxuXG5cdHB1YmxpYyBvbkNvbXBvc2l0aW9uU3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRTaW5nbGVWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0NvbXBvc2l0aW9uU3RhcnRFdmVudCgpKTtcblx0fVxuXG5cdHB1YmxpYyBvbkNvbXBvc2l0aW9uRW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0U2luZ2xlVmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdDb21wb3NpdGlvbkVuZEV2ZW50KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FwdHVyZVN0YWJsZVZpZXdwb3J0KCk6IFN0YWJsZVZpZXdwb3J0IHtcblx0XHQvLyBXZSBtaWdodCBuZWVkIHRvIHJlc3RvcmUgdGhlIGN1cnJlbnQgc3RhcnQgdmlldyByYW5nZSwgc28gc2F2ZSBpdCAoaWYgYXZhaWxhYmxlKVxuXHRcdC8vIEJ1dCBvbmx5IGlmIHRoZSBzY3JvbGwgcG9zaXRpb24gaXMgbm90IGF0IHRoZSB0b3Agb2YgdGhlIGZpbGVcblx0XHRpZiAodGhpcy5fdmlld3BvcnRTdGFydC5pc1ZhbGlkICYmIHRoaXMudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsVG9wKCkgPiAwKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c1ZpZXdwb3J0U3RhcnRWaWV3UG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy5fdmlld3BvcnRTdGFydC52aWV3TGluZU51bWJlciwgdGhpcy5nZXRMaW5lTWluQ29sdW1uKHRoaXMuX3ZpZXdwb3J0U3RhcnQudmlld0xpbmVOdW1iZXIpKTtcblx0XHRcdGNvbnN0IHByZXZpb3VzVmlld3BvcnRTdGFydE1vZGVsUG9zaXRpb24gPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24ocHJldmlvdXNWaWV3cG9ydFN0YXJ0Vmlld1Bvc2l0aW9uKTtcblx0XHRcdHJldHVybiBuZXcgU3RhYmxlVmlld3BvcnQocHJldmlvdXNWaWV3cG9ydFN0YXJ0TW9kZWxQb3NpdGlvbiwgdGhpcy5fdmlld3BvcnRTdGFydC5zdGFydExpbmVEZWx0YSk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgU3RhYmxlVmlld3BvcnQobnVsbCwgMCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yLCBlOiBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhYmxlVmlld3BvcnQgPSB0aGlzLl9jYXB0dXJlU3RhYmxlVmlld3BvcnQoKTtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCB3cmFwcGluZ1N0cmF0ZWd5ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nU3RyYXRlZ3kpO1xuXHRcdGNvbnN0IHdyYXBwaW5nSW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pO1xuXHRcdGNvbnN0IHdyYXBwaW5nSW5kZW50ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5kZW50KTtcblx0XHRjb25zdCB3b3JkQnJlYWsgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZEJyZWFrKTtcblxuXHRcdGlmICh0aGlzLl9saW5lcy5zZXRXcmFwcGluZ1NldHRpbmdzKGZvbnRJbmZvLCB3cmFwcGluZ1N0cmF0ZWd5LCB3cmFwcGluZ0luZm8ud3JhcHBpbmdDb2x1bW4sIHdyYXBwaW5nSW5kZW50LCB3b3JkQnJlYWspKSB7XG5cdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KCkpO1xuXHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50KCkpO1xuXHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KG51bGwpKTtcblx0XHRcdHRoaXMuX2N1cnNvci5vbkxpbmVNYXBwaW5nQ2hhbmdlZChldmVudHNDb2xsZWN0b3IpO1xuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMub25MaW5lTWFwcGluZ0NoYW5nZWQoKTtcblx0XHRcdHRoaXMudmlld0xheW91dC5vbkZsdXNoZWQodGhpcy5nZXRMaW5lQ291bnQoKSwgdGhpcy5fZ2V0Q3VzdG9tTGluZUhlaWdodHMoKSk7XG5cblx0XHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb25WaWV3TGluZUNvdW50LnNjaGVkdWxlKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ucmVhZE9ubHkpKSB7XG5cdFx0XHQvLyBNdXN0IHJlYWQgYWdhaW4gYWxsIGRlY29yYXRpb25zIGR1ZSB0byByZWFkT25seSBmaWx0ZXJpbmdcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zLnJlc2V0KCk7XG5cdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQobnVsbCkpO1xuXHRcdH1cblxuXHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnJlbmRlclZhbGlkYXRpb25EZWNvcmF0aW9ucykpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRpb25zLnJlc2V0KCk7XG5cdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQobnVsbCkpO1xuXHRcdH1cblxuXHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KGUpKTtcblx0XHR0aGlzLnZpZXdMYXlvdXQub25Db25maWd1cmF0aW9uQ2hhbmdlZChlKTtcblxuXHRcdHN0YWJsZVZpZXdwb3J0LnJlY292ZXJWaWV3cG9ydFN0YXJ0KHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIsIHRoaXMudmlld0xheW91dCk7XG5cblx0XHRpZiAoQ3Vyc29yQ29uZmlndXJhdGlvbi5zaG91bGRSZWNyZWF0ZShlKSkge1xuXHRcdFx0dGhpcy5jdXJzb3JDb25maWcgPSBuZXcgQ3Vyc29yQ29uZmlndXJhdGlvbih0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKSwgdGhpcy5tb2RlbC5nZXRPcHRpb25zKCksIHRoaXMuX2NvbmZpZ3VyYXRpb24sIHRoaXMubGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR0aGlzLl9jdXJzb3IudXBkYXRlQ29uZmlndXJhdGlvbih0aGlzLmN1cnNvckNvbmZpZyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgY2FsbGVkIGRpcmVjdGx5IGJ5IHRoZSB0ZXh0IG1vZGVsLlxuXHQgKi9cblx0b25EaWRDaGFuZ2VDb250ZW50T3JJbmplY3RlZFRleHQoZTogdGV4dE1vZGVsRXZlbnRzLkludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgfCB0ZXh0TW9kZWxFdmVudHMuTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBldmVudHNDb2xsZWN0b3IgPSB0aGlzLl9ldmVudERpc3BhdGNoZXIuYmVnaW5FbWl0Vmlld0V2ZW50cygpO1xuXG5cdFx0XHRsZXQgaGFkT3RoZXJNb2RlbENoYW5nZSA9IGZhbHNlO1xuXHRcdFx0bGV0IGhhZE1vZGVsTGluZUNoYW5nZVRoYXRDaGFuZ2VkTGluZU1hcHBpbmcgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IChlIGluc3RhbmNlb2YgdGV4dE1vZGVsRXZlbnRzLkludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgPyBlLnJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQuY2hhbmdlcyA6IGUuY2hhbmdlcyk7XG5cdFx0XHRjb25zdCB2ZXJzaW9uSWQgPSAoZSBpbnN0YW5jZW9mIHRleHRNb2RlbEV2ZW50cy5JbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50ID8gZS5yYXdDb250ZW50Q2hhbmdlZEV2ZW50LnZlcnNpb25JZCA6IG51bGwpO1xuXG5cdFx0XHQvLyBEbyBhIGZpcnN0IHBhc3MgdG8gY29tcHV0ZSBsaW5lIG1hcHBpbmdzLCBhbmQgYSBzZWNvbmQgcGFzcyB0byBhY3R1YWxseSBpbnRlcnByZXQgdGhlbVxuXHRcdFx0Y29uc3QgbGluZUJyZWFrc0NvbXB1dGVyID0gdGhpcy5fbGluZXMuY3JlYXRlTGluZUJyZWFrc0NvbXB1dGVyKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdHN3aXRjaCAoY2hhbmdlLmNoYW5nZVR5cGUpIHtcblx0XHRcdFx0XHRjYXNlIHRleHRNb2RlbEV2ZW50cy5SYXdDb250ZW50Q2hhbmdlZFR5cGUuTGluZXNJbnNlcnRlZDoge1xuXHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjaGFuZ2UuY291bnQ7IGkrKykge1xuXHRcdFx0XHRcdFx0XHRsaW5lQnJlYWtzQ29tcHV0ZXIuYWRkUmVxdWVzdChjaGFuZ2UuZnJvbUxpbmVOdW1iZXJQb3N0RWRpdCArIGksIG51bGwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgdGV4dE1vZGVsRXZlbnRzLlJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5MaW5lQ2hhbmdlZDoge1xuXHRcdFx0XHRcdFx0bGluZUJyZWFrc0NvbXB1dGVyLmFkZFJlcXVlc3QoY2hhbmdlLmxpbmVOdW1iZXJQb3N0RWRpdCwgbnVsbCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVCcmVha3MgPSBsaW5lQnJlYWtzQ29tcHV0ZXIuZmluYWxpemUoKTtcblx0XHRcdGNvbnN0IGxpbmVCcmVha1F1ZXVlID0gbmV3IEFycmF5UXVldWUobGluZUJyZWFrcyk7XG5cblx0XHRcdC8vIENvbGxlY3QgbW9kZWwgbGluZSByYW5nZXMgdGhhdCBuZWVkIGN1c3RvbSBsaW5lIGhlaWdodCBjb21wdXRhdGlvbi5cblx0XHRcdC8vIFdlIGRlZmVyIHRoaXMgdW50aWwgYWZ0ZXIgdGhlIGxvb3AgYmVjYXVzZSB0aGUgY29vcmRpbmF0ZXNDb252ZXJ0ZXJcblx0XHRcdC8vIHJlbGllcyBvbiBwcm9qZWN0aW9ucyB0aGF0IG1heSBub3QgeWV0IHJlZmxlY3QgYWxsIGNoYW5nZXMgaW4gdGhlIGJhdGNoLlxuXHRcdFx0Y29uc3QgY3VzdG9tTGluZUhlaWdodFJhbmdlc1RvSW5zZXJ0OiB7IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHRvTGluZU51bWJlcjogbnVtYmVyIH1bXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdHN3aXRjaCAoY2hhbmdlLmNoYW5nZVR5cGUpIHtcblx0XHRcdFx0XHRjYXNlIHRleHRNb2RlbEV2ZW50cy5SYXdDb250ZW50Q2hhbmdlZFR5cGUuRmx1c2g6IHtcblx0XHRcdFx0XHRcdHRoaXMuX2xpbmVzLm9uTW9kZWxGbHVzaGVkKCk7XG5cdFx0XHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3Rmx1c2hlZEV2ZW50KCkpO1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMucmVzZXQoKTtcblx0XHRcdFx0XHRcdHRoaXMudmlld0xheW91dC5vbkZsdXNoZWQodGhpcy5nZXRMaW5lQ291bnQoKSwgdGhpcy5fZ2V0Q3VzdG9tTGluZUhlaWdodHMoKSk7XG5cdFx0XHRcdFx0XHRoYWRPdGhlck1vZGVsQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlIHRleHRNb2RlbEV2ZW50cy5SYXdDb250ZW50Q2hhbmdlZFR5cGUuTGluZXNEZWxldGVkOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5lc0RlbGV0ZWRFdmVudCA9IHRoaXMuX2xpbmVzLm9uTW9kZWxMaW5lc0RlbGV0ZWQodmVyc2lvbklkLCBjaGFuZ2UuZnJvbUxpbmVOdW1iZXIsIGNoYW5nZS50b0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVzRGVsZXRlZEV2ZW50ICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KGxpbmVzRGVsZXRlZEV2ZW50KTtcblx0XHRcdFx0XHRcdFx0dGhpcy52aWV3TGF5b3V0Lm9uTGluZXNEZWxldGVkKGxpbmVzRGVsZXRlZEV2ZW50LmZyb21MaW5lTnVtYmVyLCBsaW5lc0RlbGV0ZWRFdmVudC50b0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0XHRjdXN0b21MaW5lSGVpZ2h0UmFuZ2VzVG9JbnNlcnQucHVzaCh7IGZyb21MaW5lTnVtYmVyOiBjaGFuZ2UubGFzdFVudG91Y2hlZExpbmVQb3N0RWRpdCwgdG9MaW5lTnVtYmVyOiBjaGFuZ2UubGFzdFVudG91Y2hlZExpbmVQb3N0RWRpdCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGhhZE90aGVyTW9kZWxDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgdGV4dE1vZGVsRXZlbnRzLlJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5MaW5lc0luc2VydGVkOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnNlcnRlZExpbmVCcmVha3MgPSBsaW5lQnJlYWtRdWV1ZS50YWtlQ291bnQoY2hhbmdlLmNvdW50KTtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmVzSW5zZXJ0ZWRFdmVudCA9IHRoaXMuX2xpbmVzLm9uTW9kZWxMaW5lc0luc2VydGVkKHZlcnNpb25JZCwgY2hhbmdlLmZyb21MaW5lTnVtYmVyLCBjaGFuZ2UudG9MaW5lTnVtYmVyLCBpbnNlcnRlZExpbmVCcmVha3MpO1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVzSW5zZXJ0ZWRFdmVudCAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChsaW5lc0luc2VydGVkRXZlbnQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQub25MaW5lc0luc2VydGVkKGxpbmVzSW5zZXJ0ZWRFdmVudC5mcm9tTGluZU51bWJlciwgbGluZXNJbnNlcnRlZEV2ZW50LnRvTGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHRcdGN1c3RvbUxpbmVIZWlnaHRSYW5nZXNUb0luc2VydC5wdXNoKHsgZnJvbUxpbmVOdW1iZXI6IGNoYW5nZS5mcm9tTGluZU51bWJlclBvc3RFZGl0LCB0b0xpbmVOdW1iZXI6IGNoYW5nZS50b0xpbmVOdW1iZXJQb3N0RWRpdCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGhhZE90aGVyTW9kZWxDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgdGV4dE1vZGVsRXZlbnRzLlJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5MaW5lQ2hhbmdlZDoge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2hhbmdlZExpbmVCcmVha0RhdGEgPSBsaW5lQnJlYWtRdWV1ZS5kZXF1ZXVlKCkhO1xuXHRcdFx0XHRcdFx0Y29uc3QgW2xpbmVNYXBwaW5nQ2hhbmdlZCwgbGluZXNDaGFuZ2VkRXZlbnQsIGxpbmVzSW5zZXJ0ZWRFdmVudCwgbGluZXNEZWxldGVkRXZlbnRdID1cblx0XHRcdFx0XHRcdFx0dGhpcy5fbGluZXMub25Nb2RlbExpbmVDaGFuZ2VkKHZlcnNpb25JZCwgY2hhbmdlLmxpbmVOdW1iZXIsIGNoYW5nZWRMaW5lQnJlYWtEYXRhKTtcblx0XHRcdFx0XHRcdGhhZE1vZGVsTGluZUNoYW5nZVRoYXRDaGFuZ2VkTGluZU1hcHBpbmcgPSBsaW5lTWFwcGluZ0NoYW5nZWQ7XG5cdFx0XHRcdFx0XHRpZiAobGluZXNDaGFuZ2VkRXZlbnQpIHtcblx0XHRcdFx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobGluZXNDaGFuZ2VkRXZlbnQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGxpbmVzSW5zZXJ0ZWRFdmVudCkge1xuXHRcdFx0XHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChsaW5lc0luc2VydGVkRXZlbnQpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQub25MaW5lc0luc2VydGVkKGxpbmVzSW5zZXJ0ZWRFdmVudC5mcm9tTGluZU51bWJlciwgbGluZXNJbnNlcnRlZEV2ZW50LnRvTGluZU51bWJlcik7XG5cdFx0XHRcdFx0XHRcdGN1c3RvbUxpbmVIZWlnaHRSYW5nZXNUb0luc2VydC5wdXNoKHsgZnJvbUxpbmVOdW1iZXI6IGNoYW5nZS5saW5lTnVtYmVyUG9zdEVkaXQsIHRvTGluZU51bWJlcjogY2hhbmdlLmxpbmVOdW1iZXJQb3N0RWRpdCB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChsaW5lc0RlbGV0ZWRFdmVudCkge1xuXHRcdFx0XHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChsaW5lc0RlbGV0ZWRFdmVudCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMudmlld0xheW91dC5vbkxpbmVzRGVsZXRlZChsaW5lc0RlbGV0ZWRFdmVudC5mcm9tTGluZU51bWJlciwgbGluZXNEZWxldGVkRXZlbnQudG9MaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdFx0Y3VzdG9tTGluZUhlaWdodFJhbmdlc1RvSW5zZXJ0LnB1c2goeyBmcm9tTGluZU51bWJlcjogY2hhbmdlLmxpbmVOdW1iZXJQb3N0RWRpdCwgdG9MaW5lTnVtYmVyOiBjaGFuZ2UubGluZU51bWJlclBvc3RFZGl0IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgdGV4dE1vZGVsRXZlbnRzLlJhd0NvbnRlbnRDaGFuZ2VkVHlwZS5FT0xDaGFuZ2VkOiB7XG5cdFx0XHRcdFx0XHQvLyBOb3RoaW5nIHRvIGRvLiBUaGUgbmV3IHZlcnNpb24gd2lsbCBiZSBhY2NlcHRlZCBiZWxvd1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh2ZXJzaW9uSWQgIT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5fbGluZXMuYWNjZXB0VmVyc2lvbklkKHZlcnNpb25JZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEFwcGx5IGRlZmVycmVkIGN1c3RvbSBsaW5lIGhlaWdodHMgbm93IHRoYXQgcHJvamVjdGlvbnMgYXJlIHN0YWJsZVxuXHRcdFx0aWYgKGN1c3RvbUxpbmVIZWlnaHRSYW5nZXNUb0luc2VydC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMudmlld0xheW91dC5jaGFuZ2VTcGVjaWFsTGluZUhlaWdodHMoKGFjY2Vzc29yOiBJTGluZUhlaWdodENoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByYW5nZSBvZiBjdXN0b21MaW5lSGVpZ2h0UmFuZ2VzVG9JbnNlcnQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1c3RvbUxpbmVIZWlnaHRzID0gdGhpcy5fZ2V0Q3VzdG9tTGluZUhlaWdodHNGb3JMaW5lcyhyYW5nZS5mcm9tTGluZU51bWJlciwgcmFuZ2UudG9MaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgZGF0YSBvZiBjdXN0b21MaW5lSGVpZ2h0cykge1xuXHRcdFx0XHRcdFx0XHRhY2Nlc3Nvci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoZGF0YS5kZWNvcmF0aW9uSWQsIGRhdGEuc3RhcnRMaW5lTnVtYmVyLCBkYXRhLmVuZExpbmVOdW1iZXIsIGRhdGEubGluZUhlaWdodCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy52aWV3TGF5b3V0Lm9uSGVpZ2h0TWF5YmVDaGFuZ2VkKCk7XG5cblx0XHRcdGlmICghaGFkT3RoZXJNb2RlbENoYW5nZSAmJiBoYWRNb2RlbExpbmVDaGFuZ2VUaGF0Q2hhbmdlZExpbmVNYXBwaW5nKSB7XG5cdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdMaW5lTWFwcGluZ0NoYW5nZWRFdmVudCgpKTtcblx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0RlY29yYXRpb25zQ2hhbmdlZEV2ZW50KG51bGwpKTtcblx0XHRcdFx0dGhpcy5fY3Vyc29yLm9uTGluZU1hcHBpbmdDaGFuZ2VkKGV2ZW50c0NvbGxlY3Rvcik7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25zLm9uTGluZU1hcHBpbmdDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbmRFbWl0Vmlld0V2ZW50cygpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0aGUgY29uZmlndXJhdGlvbiBhbmQgcmVzZXQgdGhlIGNlbnRlcmVkIHZpZXcgbGluZVxuXHRcdGNvbnN0IHZpZXdwb3J0U3RhcnRXYXNWYWxpZCA9IHRoaXMuX3ZpZXdwb3J0U3RhcnQuaXNWYWxpZDtcblx0XHR0aGlzLl92aWV3cG9ydFN0YXJ0LmludmFsaWRhdGUoKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnNldE1vZGVsTGluZUNvdW50KHRoaXMubW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb25WaWV3TGluZUNvdW50Tm93KCk7XG5cblx0XHQvLyBSZWNvdmVyIHZpZXdwb3J0XG5cdFx0aWYgKCF0aGlzLl9oYXNGb2N1cyAmJiB0aGlzLm1vZGVsLmdldEF0dGFjaGVkRWRpdG9yQ291bnQoKSA+PSAyICYmIHZpZXdwb3J0U3RhcnRXYXNWYWxpZCkge1xuXHRcdFx0Y29uc3QgbW9kZWxSYW5nZSA9IHRoaXMubW9kZWwuX2dldFRyYWNrZWRSYW5nZSh0aGlzLl92aWV3cG9ydFN0YXJ0Lm1vZGVsVHJhY2tlZFJhbmdlKTtcblx0XHRcdGlmIChtb2RlbFJhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydE1vZGVsUG9zaXRpb25Ub1ZpZXdQb3NpdGlvbihtb2RlbFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdFx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvblRvcCA9IHRoaXMudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHZpZXdQb3NpdGlvblRvcCArIHRoaXMuX3ZpZXdwb3J0U3RhcnQuc3RhcnRMaW5lRGVsdGEgfSwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2hhbmRsZVZpc2libGVMaW5lc0NoYW5nZWQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIGNhbGxlZCBkaXJlY3RseSBieSB0aGUgdGV4dCBtb2RlbC5cblx0ICovXG5cdGVtaXRDb250ZW50Q2hhbmdlRXZlbnQoZTogdGV4dE1vZGVsRXZlbnRzLkludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgfCB0ZXh0TW9kZWxFdmVudHMuTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9lbWl0Vmlld0V2ZW50KChldmVudHNDb2xsZWN0b3IpID0+IHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgdGV4dE1vZGVsRXZlbnRzLkludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQpIHtcblx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQoZS5jb250ZW50Q2hhbmdlZEV2ZW50KSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jdXJzb3Iub25Nb2RlbENvbnRlbnRDaGFuZ2VkKGV2ZW50c0NvbGxlY3RvciwgZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck1vZGVsRXZlbnRzKCk6IHZvaWQge1xuXG5cdFx0Y29uc3QgYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzKTtcblx0XHRpZiAoYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlTGluZUhlaWdodCgoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZENoYW5nZXMgPSBlLmNoYW5nZXMuZmlsdGVyKChjaGFuZ2UpID0+IGNoYW5nZS5vd25lcklkID09PSB0aGlzLl9lZGl0b3JJZCB8fCBjaGFuZ2Uub3duZXJJZCA9PT0gMCk7XG5cblx0XHRcdFx0dGhpcy52aWV3TGF5b3V0LmNoYW5nZVNwZWNpYWxMaW5lSGVpZ2h0cygoYWNjZXNzb3I6IElMaW5lSGVpZ2h0Q2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBmaWx0ZXJlZENoYW5nZXMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHsgZGVjb3JhdGlvbklkLCBsaW5lTnVtYmVyLCBsaW5lSGVpZ2h0TXVsdGlwbGllciB9ID0gY2hhbmdlO1xuXHRcdFx0XHRcdFx0Y29uc3Qgdmlld1JhbmdlID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxSYW5nZVRvVmlld1JhbmdlKG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcikpKTtcblx0XHRcdFx0XHRcdGlmIChsaW5lSGVpZ2h0TXVsdGlwbGllciAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0XHRhY2Nlc3Nvci5pbnNlcnRPckNoYW5nZUN1c3RvbUxpbmVIZWlnaHQoZGVjb3JhdGlvbklkLCB2aWV3UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCB2aWV3UmFuZ2UuZW5kTGluZU51bWJlciwgbGluZUhlaWdodE11bHRpcGxpZXIgKiB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVDdXN0b21MaW5lSGVpZ2h0KGRlY29yYXRpb25JZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyByZWNyZWF0ZSB0aGUgbW9kZWwgZXZlbnQgdXNpbmcgdGhlIGZpbHRlcmVkIGNoYW5nZXNcblx0XHRcdFx0aWYgKGZpbHRlcmVkQ2hhbmdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyZWRFdmVudCA9IG5ldyB0ZXh0TW9kZWxFdmVudHMuTW9kZWxMaW5lSGVpZ2h0Q2hhbmdlZEV2ZW50KGZpbHRlcmVkQ2hhbmdlcyk7XG5cdFx0XHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQoZmlsdGVyZWRFdmVudCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWxsb3dWYXJpYWJsZUZvbnRzID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZWZmZWN0aXZlQWxsb3dWYXJpYWJsZUZvbnRzKTtcblx0XHRpZiAoYWxsb3dWYXJpYWJsZUZvbnRzKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlRm9udCgoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZENoYW5nZXMgPSBlLmNoYW5nZXMuZmlsdGVyKChjaGFuZ2UpID0+IGNoYW5nZS5vd25lcklkID09PSB0aGlzLl9lZGl0b3JJZCB8fCBjaGFuZ2Uub3duZXJJZCA9PT0gMCk7XG5cdFx0XHRcdC8vIHJlY3JlYXRlIHRoZSBtb2RlbCBldmVudCB1c2luZyB0aGUgZmlsdGVyZWQgY2hhbmdlc1xuXHRcdFx0XHRpZiAoZmlsdGVyZWRDaGFuZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBmaWx0ZXJlZEV2ZW50ID0gbmV3IHRleHRNb2RlbEV2ZW50cy5Nb2RlbEZvbnRDaGFuZ2VkRXZlbnQoZmlsdGVyZWRDaGFuZ2VzKTtcblx0XHRcdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IE1vZGVsRm9udENoYW5nZWRFdmVudChmaWx0ZXJlZEV2ZW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlVG9rZW5zKChlKSA9PiB7XG5cdFx0XHRjb25zdCB2aWV3UmFuZ2VzOiB7IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHRvTGluZU51bWJlcjogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbkogPSBlLnJhbmdlcy5sZW5ndGg7IGogPCBsZW5KOyBqKyspIHtcblx0XHRcdFx0Y29uc3QgbW9kZWxSYW5nZSA9IGUucmFuZ2VzW2pdO1xuXHRcdFx0XHRjb25zdCB2aWV3U3RhcnRMaW5lTnVtYmVyID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG5ldyBQb3NpdGlvbihtb2RlbFJhbmdlLmZyb21MaW5lTnVtYmVyLCAxKSkubGluZU51bWJlcjtcblx0XHRcdFx0Y29uc3Qgdmlld0VuZExpbmVOdW1iZXIgPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obmV3IFBvc2l0aW9uKG1vZGVsUmFuZ2UudG9MaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxSYW5nZS50b0xpbmVOdW1iZXIpKSkubGluZU51bWJlcjtcblx0XHRcdFx0dmlld1Jhbmdlc1tqXSA9IHtcblx0XHRcdFx0XHRmcm9tTGluZU51bWJlcjogdmlld1N0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHR0b0xpbmVOdW1iZXI6IHZpZXdFbmRMaW5lTnVtYmVyXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3VG9rZW5zQ2hhbmdlZEV2ZW50KHZpZXdSYW5nZXMpKTtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgTW9kZWxUb2tlbnNDaGFuZ2VkRXZlbnQoZSkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25EaWRDaGFuZ2VMYW5ndWFnZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0U2luZ2xlVmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdMYW5ndWFnZUNvbmZpZ3VyYXRpb25FdmVudCgpKTtcblx0XHRcdHRoaXMuY3Vyc29yQ29uZmlnID0gbmV3IEN1cnNvckNvbmZpZ3VyYXRpb24odGhpcy5tb2RlbC5nZXRMYW5ndWFnZUlkKCksIHRoaXMubW9kZWwuZ2V0T3B0aW9ucygpLCB0aGlzLl9jb25maWd1cmF0aW9uLCB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fY3Vyc29yLnVwZGF0ZUNvbmZpZ3VyYXRpb24odGhpcy5jdXJzb3JDb25maWcpO1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudChlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbC5vbkRpZENoYW5nZUxhbmd1YWdlKChlKSA9PiB7XG5cdFx0XHR0aGlzLmN1cnNvckNvbmZpZyA9IG5ldyBDdXJzb3JDb25maWd1cmF0aW9uKHRoaXMubW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLCB0aGlzLm1vZGVsLmdldE9wdGlvbnMoKSwgdGhpcy5fY29uZmlndXJhdGlvbiwgdGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdHRoaXMuX2N1cnNvci51cGRhdGVDb25maWd1cmF0aW9uKHRoaXMuY3Vyc29yQ29uZmlnKTtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudChlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbC5vbkRpZENoYW5nZU9wdGlvbnMoKGUpID0+IHtcblx0XHRcdC8vIEEgdGFiIHNpemUgY2hhbmdlIGNhdXNlcyBhIGxpbmUgbWFwcGluZyBjaGFuZ2VkIGV2ZW50ID0+IGFsbCB2aWV3IHBhcnRzIHdpbGwgcmVwYWludCBPSywgbm8gZnVydGhlciBldmVudCBuZWVkZWQgaGVyZVxuXHRcdFx0aWYgKHRoaXMuX2xpbmVzLnNldFRhYlNpemUodGhpcy5tb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZSkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBldmVudHNDb2xsZWN0b3IgPSB0aGlzLl9ldmVudERpc3BhdGNoZXIuYmVnaW5FbWl0Vmlld0V2ZW50cygpO1xuXHRcdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQoKSk7XG5cdFx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50KCkpO1xuXHRcdFx0XHRcdGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdEZWNvcmF0aW9uc0NoYW5nZWRFdmVudChudWxsKSk7XG5cdFx0XHRcdFx0dGhpcy5fY3Vyc29yLm9uTGluZU1hcHBpbmdDaGFuZ2VkKGV2ZW50c0NvbGxlY3Rvcik7XG5cdFx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMub25MaW5lTWFwcGluZ0NoYW5nZWQoKTtcblx0XHRcdFx0XHR0aGlzLnZpZXdMYXlvdXQub25GbHVzaGVkKHRoaXMuZ2V0TGluZUNvdW50KCksIHRoaXMuX2dldEN1c3RvbUxpbmVIZWlnaHRzKCkpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbmRFbWl0Vmlld0V2ZW50cygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb25WaWV3TGluZUNvdW50LnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY3Vyc29yQ29uZmlnID0gbmV3IEN1cnNvckNvbmZpZ3VyYXRpb24odGhpcy5tb2RlbC5nZXRMYW5ndWFnZUlkKCksIHRoaXMubW9kZWwuZ2V0T3B0aW9ucygpLCB0aGlzLl9jb25maWd1cmF0aW9uLCB0aGlzLmxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0dGhpcy5fY3Vyc29yLnVwZGF0ZUNvbmZpZ3VyYXRpb24odGhpcy5jdXJzb3JDb25maWcpO1xuXG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IE1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudChlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbC5vbkRpZENoYW5nZURlY29yYXRpb25zKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0aW9ucy5vbk1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkKCk7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdFNpbmdsZVZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQoZSkpO1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50KGUpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IGhpZGRlbkFyZWFzTW9kZWwgPSBuZXcgSGlkZGVuQXJlYXNNb2RlbCgpO1xuXHRwcml2YXRlIHByZXZpb3VzSGlkZGVuQXJlYXM6IHJlYWRvbmx5IFJhbmdlW10gPSBbXTtcblxuXHRwdWJsaWMgZ2V0Rm9udFNpemVBdFBvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24pOiBzdHJpbmcgfCBudWxsIHtcblx0XHRjb25zdCBhbGxvd1ZhcmlhYmxlRm9udHMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5lZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHMpO1xuXHRcdGlmICghYWxsb3dWYXJpYWJsZUZvbnRzKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgZm9udERlY29yYXRpb25zID0gdGhpcy5tb2RlbC5nZXRGb250RGVjb3JhdGlvbnNJblJhbmdlKFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pLCB0aGlzLl9lZGl0b3JJZCk7XG5cdFx0bGV0IGZvbnRTaXplOiBzdHJpbmcgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbykuZm9udFNpemUgKyAncHgnO1xuXHRcdGZvciAoY29uc3QgZm9udERlY29yYXRpb24gb2YgZm9udERlY29yYXRpb25zKSB7XG5cdFx0XHRpZiAoZm9udERlY29yYXRpb24ub3B0aW9ucy5mb250U2l6ZSkge1xuXHRcdFx0XHRmb250U2l6ZSA9IGZvbnREZWNvcmF0aW9uLm9wdGlvbnMuZm9udFNpemU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZm9udFNpemU7XG5cdH1cblxuXHQvKipcblx0ICogQHBhcmFtIGZvcmNlVXBkYXRlIElmIHRydWUsIHRoZSBoaWRkZW4gYXJlYXMgd2lsbCBiZSB1cGRhdGVkIGV2ZW4gaWYgdGhlIG5ldyByYW5nZXMgYXJlIHRoZSBzYW1lIGFzIHRoZSBwcmV2aW91cyByYW5nZXMuXG5cdCAqIFRoaXMgaXMgYmVjYXVzZSB0aGUgbW9kZWwgbWlnaHQgaGF2ZSBjaGFuZ2VkLCB3aGljaCByZXNldHMgdGhlIGhpZGRlbiBhcmVhcywgYnV0IG5vdCB0aGUgbGFzdCBjYWNoZWQgdmFsdWUuXG5cdCAqIFRoaXMgbmVlZHMgYSBiZXR0ZXIgZml4IGluIHRoZSBmdXR1cmUuXG5cdCovXG5cdHB1YmxpYyBzZXRIaWRkZW5BcmVhcyhyYW5nZXM6IFJhbmdlW10sIHNvdXJjZT86IHVua25vd24sIGZvcmNlVXBkYXRlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuaGlkZGVuQXJlYXNNb2RlbC5zZXRIaWRkZW5BcmVhcyhzb3VyY2UsIHJhbmdlcyk7XG5cdFx0Y29uc3QgbWVyZ2VkUmFuZ2VzID0gdGhpcy5oaWRkZW5BcmVhc01vZGVsLmdldE1lcmdlZFJhbmdlcygpO1xuXHRcdGlmIChtZXJnZWRSYW5nZXMgPT09IHRoaXMucHJldmlvdXNIaWRkZW5BcmVhcyAmJiAhZm9yY2VVcGRhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnByZXZpb3VzSGlkZGVuQXJlYXMgPSBtZXJnZWRSYW5nZXM7XG5cblx0XHRjb25zdCBzdGFibGVWaWV3cG9ydCA9IHRoaXMuX2NhcHR1cmVTdGFibGVWaWV3cG9ydCgpO1xuXG5cdFx0bGV0IGxpbmVNYXBwaW5nQ2hhbmdlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBldmVudHNDb2xsZWN0b3IgPSB0aGlzLl9ldmVudERpc3BhdGNoZXIuYmVnaW5FbWl0Vmlld0V2ZW50cygpO1xuXHRcdFx0bGluZU1hcHBpbmdDaGFuZ2VkID0gdGhpcy5fbGluZXMuc2V0SGlkZGVuQXJlYXMobWVyZ2VkUmFuZ2VzKTtcblx0XHRcdGlmIChsaW5lTWFwcGluZ0NoYW5nZWQpIHtcblx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0ZsdXNoZWRFdmVudCgpKTtcblx0XHRcdFx0ZXZlbnRzQ29sbGVjdG9yLmVtaXRWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld0xpbmVNYXBwaW5nQ2hhbmdlZEV2ZW50KCkpO1xuXHRcdFx0XHRldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3RGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQobnVsbCkpO1xuXHRcdFx0XHR0aGlzLl9jdXJzb3Iub25MaW5lTWFwcGluZ0NoYW5nZWQoZXZlbnRzQ29sbGVjdG9yKTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMub25MaW5lTWFwcGluZ0NoYW5nZWQoKTtcblx0XHRcdFx0dGhpcy52aWV3TGF5b3V0Lm9uRmx1c2hlZCh0aGlzLmdldExpbmVDb3VudCgpLCB0aGlzLl9nZXRDdXN0b21MaW5lSGVpZ2h0cygpKTtcblx0XHRcdFx0dGhpcy52aWV3TGF5b3V0Lm9uSGVpZ2h0TWF5YmVDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpcnN0TW9kZWxMaW5lSW5WaWV3UG9ydCA9IHN0YWJsZVZpZXdwb3J0LnZpZXdwb3J0U3RhcnRNb2RlbFBvc2l0aW9uPy5saW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgZmlyc3RNb2RlbExpbmVJc0hpZGRlbiA9IGZpcnN0TW9kZWxMaW5lSW5WaWV3UG9ydCAmJiBtZXJnZWRSYW5nZXMuc29tZShyYW5nZSA9PiByYW5nZS5zdGFydExpbmVOdW1iZXIgPD0gZmlyc3RNb2RlbExpbmVJblZpZXdQb3J0ICYmIGZpcnN0TW9kZWxMaW5lSW5WaWV3UG9ydCA8PSByYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdGlmICghZmlyc3RNb2RlbExpbmVJc0hpZGRlbikge1xuXHRcdFx0XHRzdGFibGVWaWV3cG9ydC5yZWNvdmVyVmlld3BvcnRTdGFydCh0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLCB0aGlzLnZpZXdMYXlvdXQpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW5kRW1pdFZpZXdFdmVudHMoKTtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvblZpZXdMaW5lQ291bnQuc2NoZWR1bGUoKTtcblxuXHRcdGlmIChsaW5lTWFwcGluZ0NoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5lbWl0T3V0Z29pbmdFdmVudChuZXcgSGlkZGVuQXJlYXNDaGFuZ2VkRXZlbnQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFZpc2libGVSYW5nZXNQbHVzVmlld3BvcnRBYm92ZUJlbG93KCk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0Y29uc3QgbGluZXNBcm91bmQgPSBNYXRoLm1heCgyMCwgTWF0aC5yb3VuZChsYXlvdXRJbmZvLmhlaWdodCAvIGxpbmVIZWlnaHQpKTtcblx0XHRjb25zdCBwYXJ0aWFsRGF0YSA9IHRoaXMudmlld0xheW91dC5nZXRMaW5lc1ZpZXdwb3J0RGF0YSgpO1xuXHRcdGNvbnN0IHN0YXJ0Vmlld0xpbmVOdW1iZXIgPSBNYXRoLm1heCgxLCBwYXJ0aWFsRGF0YS5jb21wbGV0ZWx5VmlzaWJsZVN0YXJ0TGluZU51bWJlciAtIGxpbmVzQXJvdW5kKTtcblx0XHRjb25zdCBlbmRWaWV3TGluZU51bWJlciA9IE1hdGgubWluKHRoaXMuZ2V0TGluZUNvdW50KCksIHBhcnRpYWxEYXRhLmNvbXBsZXRlbHlWaXNpYmxlRW5kTGluZU51bWJlciArIGxpbmVzQXJvdW5kKTtcblxuXHRcdHJldHVybiB0aGlzLl90b01vZGVsVmlzaWJsZVJhbmdlcyhuZXcgUmFuZ2UoXG5cdFx0XHRzdGFydFZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNaW5Db2x1bW4oc3RhcnRWaWV3TGluZU51bWJlciksXG5cdFx0XHRlbmRWaWV3TGluZU51bWJlciwgdGhpcy5nZXRMaW5lTWF4Q29sdW1uKGVuZFZpZXdMaW5lTnVtYmVyKVxuXHRcdCkpO1xuXHR9XG5cblx0cHVibGljIGdldFZpc2libGVSYW5nZXMoKTogUmFuZ2VbXSB7XG5cdFx0Y29uc3QgdmlzaWJsZVZpZXdSYW5nZSA9IHRoaXMuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UoKTtcblx0XHRyZXR1cm4gdGhpcy5fdG9Nb2RlbFZpc2libGVSYW5nZXModmlzaWJsZVZpZXdSYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0SGlkZGVuQXJlYXMoKTogUmFuZ2VbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldEhpZGRlbkFyZWFzKCk7XG5cdH1cblxuXHRwcml2YXRlIF90b01vZGVsVmlzaWJsZVJhbmdlcyh2aXNpYmxlVmlld1JhbmdlOiBSYW5nZSk6IFJhbmdlW10ge1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZSA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdSYW5nZVRvTW9kZWxSYW5nZSh2aXNpYmxlVmlld1JhbmdlKTtcblx0XHRjb25zdCBoaWRkZW5BcmVhcyA9IHRoaXMuX2xpbmVzLmdldEhpZGRlbkFyZWFzKCk7XG5cblx0XHRpZiAoaGlkZGVuQXJlYXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW3Zpc2libGVSYW5nZV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBSYW5nZVtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cdFx0bGV0IHN0YXJ0TGluZU51bWJlciA9IHZpc2libGVSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0bGV0IHN0YXJ0Q29sdW1uID0gdmlzaWJsZVJhbmdlLnN0YXJ0Q29sdW1uO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSB2aXNpYmxlUmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRjb25zdCBlbmRDb2x1bW4gPSB2aXNpYmxlUmFuZ2UuZW5kQ29sdW1uO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBoaWRkZW5BcmVhcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgaGlkZGVuU3RhcnRMaW5lTnVtYmVyID0gaGlkZGVuQXJlYXNbaV0uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y29uc3QgaGlkZGVuRW5kTGluZU51bWJlciA9IGhpZGRlbkFyZWFzW2ldLmVuZExpbmVOdW1iZXI7XG5cblx0XHRcdGlmIChoaWRkZW5FbmRMaW5lTnVtYmVyIDwgc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhpZGRlblN0YXJ0TGluZU51bWJlciA+IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGFydExpbmVOdW1iZXIgPCBoaWRkZW5TdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IG5ldyBSYW5nZShcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdGhpZGRlblN0YXJ0TGluZU51bWJlciAtIDEsIHRoaXMubW9kZWwuZ2V0TGluZU1heENvbHVtbihoaWRkZW5TdGFydExpbmVOdW1iZXIgLSAxKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gaGlkZGVuRW5kTGluZU51bWJlciArIDE7XG5cdFx0XHRzdGFydENvbHVtbiA9IDE7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXJ0TGluZU51bWJlciA8IGVuZExpbmVOdW1iZXIgfHwgKHN0YXJ0TGluZU51bWJlciA9PT0gZW5kTGluZU51bWJlciAmJiBzdGFydENvbHVtbiA8IGVuZENvbHVtbikpIHtcblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBuZXcgUmFuZ2UoXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW4sXG5cdFx0XHRcdGVuZExpbmVOdW1iZXIsIGVuZENvbHVtblxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlKCk6IFJhbmdlIHtcblx0XHRjb25zdCBwYXJ0aWFsRGF0YSA9IHRoaXMudmlld0xheW91dC5nZXRMaW5lc1ZpZXdwb3J0RGF0YSgpO1xuXHRcdGNvbnN0IHN0YXJ0Vmlld0xpbmVOdW1iZXIgPSBwYXJ0aWFsRGF0YS5jb21wbGV0ZWx5VmlzaWJsZVN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBlbmRWaWV3TGluZU51bWJlciA9IHBhcnRpYWxEYXRhLmNvbXBsZXRlbHlWaXNpYmxlRW5kTGluZU51bWJlcjtcblxuXHRcdHJldHVybiBuZXcgUmFuZ2UoXG5cdFx0XHRzdGFydFZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNaW5Db2x1bW4oc3RhcnRWaWV3TGluZU51bWJlciksXG5cdFx0XHRlbmRWaWV3TGluZU51bWJlciwgdGhpcy5nZXRMaW5lTWF4Q29sdW1uKGVuZFZpZXdMaW5lTnVtYmVyKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2VBdFNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcik6IFJhbmdlIHtcblx0XHRjb25zdCBwYXJ0aWFsRGF0YSA9IHRoaXMudmlld0xheW91dC5nZXRMaW5lc1ZpZXdwb3J0RGF0YUF0U2Nyb2xsVG9wKHNjcm9sbFRvcCk7XG5cdFx0Y29uc3Qgc3RhcnRWaWV3TGluZU51bWJlciA9IHBhcnRpYWxEYXRhLmNvbXBsZXRlbHlWaXNpYmxlU3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZFZpZXdMaW5lTnVtYmVyID0gcGFydGlhbERhdGEuY29tcGxldGVseVZpc2libGVFbmRMaW5lTnVtYmVyO1xuXG5cdFx0cmV0dXJuIG5ldyBSYW5nZShcblx0XHRcdHN0YXJ0Vmlld0xpbmVOdW1iZXIsIHRoaXMuZ2V0TGluZU1pbkNvbHVtbihzdGFydFZpZXdMaW5lTnVtYmVyKSxcblx0XHRcdGVuZFZpZXdMaW5lTnVtYmVyLCB0aGlzLmdldExpbmVNYXhDb2x1bW4oZW5kVmlld0xpbmVOdW1iZXIpXG5cdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIGBjdXJzb3JTdXJyb3VuZGluZ0xpbmVzYCBhbmQgYHN0aWNreVNjcm9sbGAgcGFkZGluZyB0byB0aGUgZ2l2ZW4gdmlldyByYW5nZS5cblx0ICovXG5cdHB1YmxpYyBnZXRWaWV3UmFuZ2VXaXRoQ3Vyc29yUGFkZGluZyh2aWV3UmFuZ2U6IFJhbmdlKTogUmFuZ2Uge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgY3Vyc29yU3Vycm91bmRpbmdMaW5lcyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5jdXJzb3JTdXJyb3VuZGluZ0xpbmVzKTtcblx0XHRjb25zdCBzdGlja3lTY3JvbGwgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKTtcblxuXHRcdGxldCB7IHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlciB9ID0gdmlld1JhbmdlO1xuXHRcdGNvbnN0IHBhZGRpbmcgPSBNYXRoLm1pbihcblx0XHRcdE1hdGgubWF4KGN1cnNvclN1cnJvdW5kaW5nTGluZXMsIHN0aWNreVNjcm9sbC5lbmFibGVkID8gc3RpY2t5U2Nyb2xsLm1heExpbmVDb3VudCA6IDApLFxuXHRcdFx0TWF0aC5mbG9vcigoZW5kTGluZU51bWJlciAtIHN0YXJ0TGluZU51bWJlciArIDEpIC8gMikpO1xuXG5cdFx0c3RhcnRMaW5lTnVtYmVyICs9IHBhZGRpbmc7XG5cdFx0ZW5kTGluZU51bWJlciAtPSBNYXRoLm1heCgwLCBwYWRkaW5nIC0gMSk7XG5cblx0XHRpZiAocGFkZGluZyA9PT0gMCB8fCBzdGFydExpbmVOdW1iZXIgPiBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdmlld1JhbmdlO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUmFuZ2UoXG5cdFx0XHRzdGFydExpbmVOdW1iZXIsIHRoaXMuZ2V0TGluZU1pbkNvbHVtbihzdGFydExpbmVOdW1iZXIpLFxuXHRcdFx0ZW5kTGluZU51bWJlciwgdGhpcy5nZXRMaW5lTWF4Q29sdW1uKGVuZExpbmVOdW1iZXIpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzYXZlU3RhdGUoKTogSVZpZXdTdGF0ZSB7XG5cdFx0Y29uc3QgY29tcGF0Vmlld1N0YXRlID0gdGhpcy52aWV3TGF5b3V0LnNhdmVTdGF0ZSgpO1xuXG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gY29tcGF0Vmlld1N0YXRlLnNjcm9sbFRvcDtcblx0XHRjb25zdCBmaXJzdFZpZXdMaW5lTnVtYmVyID0gdGhpcy52aWV3TGF5b3V0LmdldExpbmVOdW1iZXJBdFZlcnRpY2FsT2Zmc2V0KHNjcm9sbFRvcCk7XG5cdFx0Y29uc3QgZmlyc3RQb3NpdGlvbiA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihuZXcgUG9zaXRpb24oZmlyc3RWaWV3TGluZU51bWJlciwgdGhpcy5nZXRMaW5lTWluQ29sdW1uKGZpcnN0Vmlld0xpbmVOdW1iZXIpKSk7XG5cdFx0Y29uc3QgZmlyc3RQb3NpdGlvbkRlbHRhVG9wID0gdGhpcy52aWV3TGF5b3V0LmdldFZlcnRpY2FsT2Zmc2V0Rm9yTGluZU51bWJlcihmaXJzdFZpZXdMaW5lTnVtYmVyKSAtIHNjcm9sbFRvcDtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzY3JvbGxMZWZ0OiBjb21wYXRWaWV3U3RhdGUuc2Nyb2xsTGVmdCxcblx0XHRcdGZpcnN0UG9zaXRpb246IGZpcnN0UG9zaXRpb24sXG5cdFx0XHRmaXJzdFBvc2l0aW9uRGVsdGFUb3A6IGZpcnN0UG9zaXRpb25EZWx0YVRvcFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgcmVkdWNlUmVzdG9yZVN0YXRlKHN0YXRlOiBJVmlld1N0YXRlKTogeyBzY3JvbGxMZWZ0OiBudW1iZXI7IHNjcm9sbFRvcDogbnVtYmVyIH0ge1xuXHRcdGlmICh0eXBlb2Ygc3RhdGUuZmlyc3RQb3NpdGlvbiA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdC8vIFRoaXMgaXMgYSB2aWV3IHN0YXRlIHNlcmlhbGl6ZWQgYnkgYW4gb2xkZXIgdmVyc2lvblxuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZHVjZVJlc3RvcmVTdGF0ZUNvbXBhdGliaWxpdHkoc3RhdGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsUG9zaXRpb24gPSB0aGlzLm1vZGVsLnZhbGlkYXRlUG9zaXRpb24oc3RhdGUuZmlyc3RQb3NpdGlvbik7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG1vZGVsUG9zaXRpb24pO1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIpIC0gc3RhdGUuZmlyc3RQb3NpdGlvbkRlbHRhVG9wO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzY3JvbGxMZWZ0OiBzdGF0ZS5zY3JvbGxMZWZ0LFxuXHRcdFx0c2Nyb2xsVG9wOiBzY3JvbGxUb3Bcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVkdWNlUmVzdG9yZVN0YXRlQ29tcGF0aWJpbGl0eShzdGF0ZTogSVZpZXdTdGF0ZSk6IHsgc2Nyb2xsTGVmdDogbnVtYmVyOyBzY3JvbGxUb3A6IG51bWJlciB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2Nyb2xsTGVmdDogc3RhdGUuc2Nyb2xsTGVmdCxcblx0XHRcdHNjcm9sbFRvcDogc3RhdGUuc2Nyb2xsVG9wV2l0aG91dFZpZXdab25lcyFcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUYWJTaXplKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lQ291bnQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlcyBhIGhpbnQgdGhhdCBhIGxvdCBvZiByZXF1ZXN0cyBhcmUgYWJvdXQgdG8gY29tZSBpbiBmb3IgdGhlc2UgbGluZSBudW1iZXJzLlxuXHQgKi9cblx0cHVibGljIHNldFZpZXdwb3J0KHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGNlbnRlcmVkTGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdmlld3BvcnRTdGFydC51cGRhdGUodGhpcywgc3RhcnRMaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVJbmRlbnRHdWlkZShsaW5lTnVtYmVyOiBudW1iZXIsIG1pbkxpbmVOdW1iZXI6IG51bWJlciwgbWF4TGluZU51bWJlcjogbnVtYmVyKTogSUFjdGl2ZUluZGVudEd1aWRlSW5mbyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldEFjdGl2ZUluZGVudEd1aWRlKGxpbmVOdW1iZXIsIG1pbkxpbmVOdW1iZXIsIG1heExpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVzSW5kZW50R3VpZGVzKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcyhzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldEJyYWNrZXRHdWlkZXNJblJhbmdlQnlMaW5lKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGFjdGl2ZVBvc2l0aW9uOiBJUG9zaXRpb24gfCBudWxsLCBvcHRpb25zOiBCcmFja2V0R3VpZGVPcHRpb25zKTogSW5kZW50R3VpZGVbXVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVzQnJhY2tldEd1aWRlcyhzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIsIGFjdGl2ZVBvc2l0aW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5nZXRWaWV3TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9saW5lcy5nZXRWaWV3TGluZUxlbmd0aChsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTWluQ29sdW1uKGxpbmVOdW1iZXI6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lTWluQ29sdW1uKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVNYXhDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihsaW5lTnVtYmVyOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0cmluZ3MuZmlyc3ROb25XaGl0ZXNwYWNlSW5kZXgodGhpcy5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0ICsgMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRjb25zdCByZXN1bHQgPSBzdHJpbmdzLmxhc3ROb25XaGl0ZXNwYWNlSW5kZXgodGhpcy5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gLTEpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0ICsgMjtcblx0fVxuXG5cdHB1YmxpYyBnZXRNaW5pbWFwRGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlOiBSYW5nZSk6IFZpZXdNb2RlbERlY29yYXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RlY29yYXRpb25zLmdldE1pbmltYXBEZWNvcmF0aW9uc0luUmFuZ2UocmFuZ2UpO1xuXHR9XG5cblx0cHVibGljIGdldERlY29yYXRpb25zSW5WaWV3cG9ydCh2aXNpYmxlUmFuZ2U6IFJhbmdlKTogVmlld01vZGVsRGVjb3JhdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbnMuZ2V0RGVjb3JhdGlvbnNWaWV3cG9ydERhdGEodmlzaWJsZVJhbmdlKS5kZWNvcmF0aW9ucztcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmplY3RlZFRleHRBdCh2aWV3UG9zaXRpb246IFBvc2l0aW9uKTogSW5qZWN0ZWRUZXh0IHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldEluamVjdGVkVGV4dEF0KHZpZXdQb3NpdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUZXh0RGlyZWN0aW9uKGxpbmVOdW1iZXI6IG51bWJlciwgZGVjb3JhdGlvbnM6IFZpZXdNb2RlbERlY29yYXRpb25bXSk6IFRleHREaXJlY3Rpb24ge1xuXHRcdGxldCBydGxDb3VudCA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gZGVjb3JhdGlvbi5yYW5nZTtcblx0XHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPiBsaW5lTnVtYmVyIHx8IHJhbmdlLmVuZExpbmVOdW1iZXIgPCBsaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dERpcmVjdGlvbiA9IGRlY29yYXRpb24ub3B0aW9ucy50ZXh0RGlyZWN0aW9uO1xuXHRcdFx0aWYgKHRleHREaXJlY3Rpb24gPT09IFRleHREaXJlY3Rpb24uUlRMKSB7XG5cdFx0XHRcdHJ0bENvdW50Kys7XG5cdFx0XHR9IGVsc2UgaWYgKHRleHREaXJlY3Rpb24gPT09IFRleHREaXJlY3Rpb24uTFRSKSB7XG5cdFx0XHRcdHJ0bENvdW50LS07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJ0bENvdW50ID4gMCA/IFRleHREaXJlY3Rpb24uUlRMIDogVGV4dERpcmVjdGlvbi5MVFI7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGV4dERpcmVjdGlvbihsaW5lTnVtYmVyOiBudW1iZXIpOiBUZXh0RGlyZWN0aW9uIHtcblx0XHRjb25zdCBkZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXREZWNvcmF0aW9uc09uTGluZShsaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0VGV4dERpcmVjdGlvbihsaW5lTnVtYmVyLCBkZWNvcmF0aW9uc0NvbGxlY3Rpb24uZGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIGdldFZpZXdwb3J0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKHZpc2libGVSYW5nZTogUmFuZ2UsIGxpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdMaW5lUmVuZGVyaW5nRGF0YSB7XG5cdFx0Y29uc3Qgdmlld3BvcnREZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXREZWNvcmF0aW9uc1ZpZXdwb3J0RGF0YSh2aXNpYmxlUmFuZ2UpO1xuXHRcdGNvbnN0IHJlbGF0aXZlTGluZU51bWJlciA9IGxpbmVOdW1iZXIgLSB2aXNpYmxlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGlubGluZURlY29yYXRpb25zID0gdmlld3BvcnREZWNvcmF0aW9uc0NvbGxlY3Rpb24uaW5saW5lRGVjb3JhdGlvbnNbcmVsYXRpdmVMaW5lTnVtYmVyXTtcblx0XHRjb25zdCBoYXNWYXJpYWJsZUZvbnRzID0gdmlld3BvcnREZWNvcmF0aW9uc0NvbGxlY3Rpb24uaGFzVmFyaWFibGVGb250c1tyZWxhdGl2ZUxpbmVOdW1iZXJdO1xuXHRcdHJldHVybiB0aGlzLl9nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlciwgaW5saW5lRGVjb3JhdGlvbnMsIGhhc1ZhcmlhYmxlRm9udHMsIHZpZXdwb3J0RGVjb3JhdGlvbnNDb2xsZWN0aW9uLmRlY29yYXRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlcjogbnVtYmVyKTogVmlld0xpbmVSZW5kZXJpbmdEYXRhIHtcblx0XHRjb25zdCBkZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB0aGlzLl9kZWNvcmF0aW9ucy5nZXREZWNvcmF0aW9uc09uTGluZShsaW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKGxpbmVOdW1iZXIsIGRlY29yYXRpb25zQ29sbGVjdGlvbi5pbmxpbmVEZWNvcmF0aW9uc1swXSwgZGVjb3JhdGlvbnNDb2xsZWN0aW9uLmhhc1ZhcmlhYmxlRm9udHNbMF0sIGRlY29yYXRpb25zQ29sbGVjdGlvbi5kZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlcjogbnVtYmVyLCBpbmxpbmVEZWNvcmF0aW9uczogSW5saW5lRGVjb3JhdGlvbltdLCBoYXNWYXJpYWJsZUZvbnRzOiBib29sZWFuLCBkZWNvcmF0aW9uczogVmlld01vZGVsRGVjb3JhdGlvbltdKTogVmlld0xpbmVSZW5kZXJpbmdEYXRhIHtcblx0XHRjb25zdCBtaWdodENvbnRhaW5SVEwgPSB0aGlzLm1vZGVsLm1pZ2h0Q29udGFpblJUTCgpO1xuXHRcdGNvbnN0IG1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkgPSB0aGlzLm1vZGVsLm1pZ2h0Q29udGFpbk5vbkJhc2ljQVNDSUkoKTtcblx0XHRjb25zdCB0YWJTaXplID0gdGhpcy5nZXRUYWJTaXplKCk7XG5cdFx0Y29uc3QgbGluZURhdGEgPSB0aGlzLl9saW5lcy5nZXRWaWV3TGluZURhdGEobGluZU51bWJlcik7XG5cblx0XHRpZiAobGluZURhdGEuaW5saW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdGlubGluZURlY29yYXRpb25zID0gW1xuXHRcdFx0XHQuLi5pbmxpbmVEZWNvcmF0aW9ucyxcblx0XHRcdFx0Li4ubGluZURhdGEuaW5saW5lRGVjb3JhdGlvbnNcblx0XHRcdF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBWaWV3TGluZVJlbmRlcmluZ0RhdGEoXG5cdFx0XHRsaW5lRGF0YS5taW5Db2x1bW4sXG5cdFx0XHRsaW5lRGF0YS5tYXhDb2x1bW4sXG5cdFx0XHRsaW5lRGF0YS5jb250ZW50LFxuXHRcdFx0bGluZURhdGEuY29udGludWVzV2l0aFdyYXBwZWRMaW5lLFxuXHRcdFx0bWlnaHRDb250YWluUlRMLFxuXHRcdFx0bWlnaHRDb250YWluTm9uQmFzaWNBU0NJSSxcblx0XHRcdGxpbmVEYXRhLnRva2Vucyxcblx0XHRcdGlubGluZURlY29yYXRpb25zLFxuXHRcdFx0dGFiU2l6ZSxcblx0XHRcdGxpbmVEYXRhLnN0YXJ0VmlzaWJsZUNvbHVtbixcblx0XHRcdHRoaXMuX2dldFRleHREaXJlY3Rpb24obGluZU51bWJlciwgZGVjb3JhdGlvbnMpLFxuXHRcdFx0aGFzVmFyaWFibGVGb250c1xuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Vmlld0xpbmVEYXRhKGxpbmVOdW1iZXI6IG51bWJlcik6IFZpZXdMaW5lRGF0YSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLmdldFZpZXdMaW5lRGF0YShsaW5lTnVtYmVyKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIG5lZWRlZDogYm9vbGVhbltdKTogTWluaW1hcExpbmVzUmVuZGVyaW5nRGF0YSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fbGluZXMuZ2V0Vmlld0xpbmVzRGF0YShzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIsIG5lZWRlZCk7XG5cdFx0cmV0dXJuIG5ldyBNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKFxuXHRcdFx0dGhpcy5nZXRUYWJTaXplKCksXG5cdFx0XHRyZXN1bHRcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIGdldEFsbE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucyh0aGVtZTogRWRpdG9yVGhlbWUpOiBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cFtdIHtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMubW9kZWwuZ2V0T3ZlcnZpZXdSdWxlckRlY29yYXRpb25zKHRoaXMuX2VkaXRvcklkLCBmaWx0ZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnModGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zKSwgZmlsdGVyRm9udERlY29yYXRpb25zKHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucykpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnMoKTtcblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdGNvbnN0IGRlY29yYXRpb25PcHRpb25zID0gPE1vZGVsRGVjb3JhdGlvbk9wdGlvbnM+ZGVjb3JhdGlvbi5vcHRpb25zO1xuXHRcdFx0Y29uc3Qgb3B0cyA9IGRlY29yYXRpb25PcHRpb25zLm92ZXJ2aWV3UnVsZXI7XG5cdFx0XHRpZiAoIW9wdHMpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYW5lID0gPG51bWJlcj5vcHRzLnBvc2l0aW9uO1xuXHRcdFx0aWYgKGxhbmUgPT09IDApIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb2xvciA9IG9wdHMuZ2V0Q29sb3IodGhlbWUudmFsdWUpO1xuXHRcdFx0Y29uc3Qgdmlld1N0YXJ0TGluZU51bWJlciA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuZ2V0Vmlld0xpbmVOdW1iZXJPZk1vZGVsUG9zaXRpb24oZGVjb3JhdGlvbi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGRlY29yYXRpb24ucmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0Y29uc3Qgdmlld0VuZExpbmVOdW1iZXIgPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmdldFZpZXdMaW5lTnVtYmVyT2ZNb2RlbFBvc2l0aW9uKGRlY29yYXRpb24ucmFuZ2UuZW5kTGluZU51bWJlciwgZGVjb3JhdGlvbi5yYW5nZS5lbmRDb2x1bW4pO1xuXG5cdFx0XHRyZXN1bHQuYWNjZXB0KGNvbG9yLCBkZWNvcmF0aW9uT3B0aW9ucy56SW5kZXgsIHZpZXdTdGFydExpbmVOdW1iZXIsIHZpZXdFbmRMaW5lTnVtYmVyLCBsYW5lKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdC5hc0FycmF5O1xuXHR9XG5cblx0cHJpdmF0ZSBfaW52YWxpZGF0ZURlY29yYXRpb25zQ29sb3JDYWNoZSgpOiB2b2lkIHtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMubW9kZWwuZ2V0T3ZlcnZpZXdSdWxlckRlY29yYXRpb25zKCk7XG5cdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRjb25zdCBvcHRzMSA9IDxNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucz5kZWNvcmF0aW9uLm9wdGlvbnMub3ZlcnZpZXdSdWxlcjtcblx0XHRcdG9wdHMxPy5pbnZhbGlkYXRlQ2FjaGVkQ29sb3IoKTtcblx0XHRcdGNvbnN0IG9wdHMyID0gPE1vZGVsRGVjb3JhdGlvbk1pbmltYXBPcHRpb25zPmRlY29yYXRpb24ub3B0aW9ucy5taW5pbWFwO1xuXHRcdFx0b3B0czI/LmludmFsaWRhdGVDYWNoZWRDb2xvcigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRWYWx1ZUluUmFuZ2UocmFuZ2U6IFJhbmdlLCBlb2w6IEVuZE9mTGluZVByZWZlcmVuY2UpOiBzdHJpbmcge1xuXHRcdGNvbnN0IG1vZGVsUmFuZ2UgPSB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRWaWV3UmFuZ2VUb01vZGVsUmFuZ2UocmFuZ2UpO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldFZhbHVlSW5SYW5nZShtb2RlbFJhbmdlLCBlb2wpO1xuXHR9XG5cblx0cHVibGljIGdldFZhbHVlTGVuZ3RoSW5SYW5nZShyYW5nZTogUmFuZ2UsIGVvbDogRW5kT2ZMaW5lUHJlZmVyZW5jZSk6IG51bWJlciB7XG5cdFx0Y29uc3QgbW9kZWxSYW5nZSA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdSYW5nZVRvTW9kZWxSYW5nZShyYW5nZSk7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG1vZGVsUmFuZ2UsIGVvbCk7XG5cdH1cblxuXHRwdWJsaWMgbW9kaWZ5UG9zaXRpb24ocG9zaXRpb246IFBvc2l0aW9uLCBvZmZzZXQ6IG51bWJlcik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBtb2RlbFBvc2l0aW9uID0gdGhpcy5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRjb25zdCByZXN1bHRNb2RlbFBvc2l0aW9uID0gdGhpcy5tb2RlbC5tb2RpZnlQb3NpdGlvbihtb2RlbFBvc2l0aW9uLCBvZmZzZXQpO1xuXHRcdHJldHVybiB0aGlzLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24ocmVzdWx0TW9kZWxQb3NpdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgZGVkdWNlTW9kZWxQb3NpdGlvblJlbGF0aXZlVG9WaWV3UG9zaXRpb24odmlld0FuY2hvclBvc2l0aW9uOiBQb3NpdGlvbiwgZGVsdGFPZmZzZXQ6IG51bWJlciwgbGluZUZlZWRDbnQ6IG51bWJlcik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBtb2RlbEFuY2hvciA9IHRoaXMuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbih2aWV3QW5jaG9yUG9zaXRpb24pO1xuXHRcdGlmICh0aGlzLm1vZGVsLmdldEVPTCgpLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0Ly8gVGhpcyBtb2RlbCB1c2VzIENSTEYsIHNvIHRoZSBkZWx0YSBtdXN0IHRha2UgdGhhdCBpbnRvIGFjY291bnRcblx0XHRcdGlmIChkZWx0YU9mZnNldCA8IDApIHtcblx0XHRcdFx0ZGVsdGFPZmZzZXQgLT0gbGluZUZlZWRDbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkZWx0YU9mZnNldCArPSBsaW5lRmVlZENudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbEFuY2hvck9mZnNldCA9IHRoaXMubW9kZWwuZ2V0T2Zmc2V0QXQobW9kZWxBbmNob3IpO1xuXHRcdGNvbnN0IHJlc3VsdE9mZnNldCA9IG1vZGVsQW5jaG9yT2Zmc2V0ICsgZGVsdGFPZmZzZXQ7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0UG9zaXRpb25BdChyZXN1bHRPZmZzZXQpO1xuXHR9XG5cblx0cHVibGljIGdldFBsYWluVGV4dFRvQ29weShtb2RlbFJhbmdlczogUmFuZ2VbXSwgZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQ6IGJvb2xlYW4sIGZvcmNlQ1JMRjogYm9vbGVhbik6IHsgc291cmNlUmFuZ2VzOiBSYW5nZVtdOyBzb3VyY2VUZXh0OiBzdHJpbmcgfCBzdHJpbmdbXSB9IHtcblx0XHRjb25zdCBuZXdMaW5lQ2hhcmFjdGVyID0gZm9yY2VDUkxGID8gJ1xcclxcbicgOiB0aGlzLm1vZGVsLmdldEVPTCgpO1xuXG5cdFx0bW9kZWxSYW5nZXMgPSBtb2RlbFJhbmdlcy5zbGljZSgwKTtcblx0XHRtb2RlbFJhbmdlcy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cblx0XHRsZXQgaGFzRW1wdHlSYW5nZSA9IGZhbHNlO1xuXHRcdGxldCBoYXNOb25FbXB0eVJhbmdlID0gZmFsc2U7XG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiBtb2RlbFJhbmdlcykge1xuXHRcdFx0aWYgKHJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRoYXNFbXB0eVJhbmdlID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhhc05vbkVtcHR5UmFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaGFzTm9uRW1wdHlSYW5nZSAmJiAhZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQpIHtcblx0XHRcdC8vIGFsbCByYW5nZXMgYXJlIGVtcHR5XG5cdFx0XHRyZXR1cm4geyBzb3VyY2VSYW5nZXM6IFtdLCBzb3VyY2VUZXh0OiAnJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwdXNoUmFuZ2UgPSAobW9kZWxSYW5nZTogUmFuZ2UsIGFwcGVuZDogc3RyaW5nID0gJycpID0+IHtcblx0XHRcdHJhbmdlcy5wdXNoKG1vZGVsUmFuZ2UpO1xuXHRcdFx0cmVzdWx0LnB1c2godGhpcy5tb2RlbC5nZXRWYWx1ZUluUmFuZ2UobW9kZWxSYW5nZSwgZm9yY2VDUkxGID8gRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGIDogRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCkgKyBhcHBlbmQpO1xuXHRcdH07XG5cblx0XHRpZiAoaGFzRW1wdHlSYW5nZSAmJiBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCkge1xuXHRcdFx0Ly8gc29tZSAobWF5YmUgYWxsKSBlbXB0eSBzZWxlY3Rpb25zXG5cdFx0XHRsZXQgcHJldk1vZGVsTGluZU51bWJlciA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IG1vZGVsUmFuZ2Ugb2YgbW9kZWxSYW5nZXMpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWxMaW5lTnVtYmVyID0gbW9kZWxSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdGlmIChtb2RlbFJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdGlmIChtb2RlbExpbmVOdW1iZXIgIT09IHByZXZNb2RlbExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdHB1c2hSYW5nZShuZXcgUmFuZ2UobW9kZWxMaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNaW5Db2x1bW4obW9kZWxMaW5lTnVtYmVyKSwgbW9kZWxMaW5lTnVtYmVyLCB0aGlzLm1vZGVsLmdldExpbmVNYXhDb2x1bW4obW9kZWxMaW5lTnVtYmVyKSksIG5ld0xpbmVDaGFyYWN0ZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwdXNoUmFuZ2UobW9kZWxSYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHJldk1vZGVsTGluZU51bWJlciA9IG1vZGVsTGluZU51bWJlcjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlbFJhbmdlIG9mIG1vZGVsUmFuZ2VzKSB7XG5cdFx0XHRcdGlmICghbW9kZWxSYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRwdXNoUmFuZ2UobW9kZWxSYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBzb3VyY2VSYW5nZXM6IHJhbmdlcywgc291cmNlVGV4dDogcmVzdWx0Lmxlbmd0aCA9PT0gMSA/IHJlc3VsdFswXSA6IHJlc3VsdCB9O1xuXHR9XG5cblx0cHVibGljIGdldFJpY2hUZXh0VG9Db3B5KG1vZGVsUmFuZ2VzOiBSYW5nZVtdLCBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZDogYm9vbGVhbik6IHsgaHRtbDogc3RyaW5nOyBtb2RlOiBzdHJpbmcgfSB8IG51bGwge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLm1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRpZiAobGFuZ3VhZ2VJZCA9PT0gUExBSU5URVhUX0xBTkdVQUdFX0lEKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAobW9kZWxSYW5nZXMubGVuZ3RoICE9PSAxKSB7XG5cdFx0XHQvLyBubyBtdWx0aXBsZSBzZWxlY3Rpb24gc3VwcG9ydCBhdCB0aGlzIHRpbWVcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGxldCByYW5nZSA9IG1vZGVsUmFuZ2VzWzBdO1xuXHRcdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRcdGlmICghZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQpIHtcblx0XHRcdFx0Ly8gbm90aGluZyB0byBjb3B5XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdHJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIHRoaXMubW9kZWwuZ2V0TGluZU1pbkNvbHVtbihsaW5lTnVtYmVyKSwgbGluZU51bWJlciwgdGhpcy5tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBjb2xvck1hcCA9IHRoaXMuX2dldENvbG9yTWFwKCk7XG5cdFx0Y29uc3QgaGFzQmFkQ2hhcnMgPSAoL1s6O1xcXFxcXC88Pl0vLnRlc3QoZm9udEluZm8uZm9udEZhbWlseSkpO1xuXHRcdGNvbnN0IHVzZURlZmF1bHRGb250RmFtaWx5ID0gKGhhc0JhZENoYXJzIHx8IGZvbnRJbmZvLmZvbnRGYW1pbHkgPT09IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHkpO1xuXHRcdGxldCBmb250RmFtaWx5OiBzdHJpbmc7XG5cdFx0aWYgKHVzZURlZmF1bHRGb250RmFtaWx5KSB7XG5cdFx0XHRmb250RmFtaWx5ID0gRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9udEZhbWlseSA9IGZvbnRJbmZvLmZvbnRGYW1pbHk7XG5cdFx0XHRmb250RmFtaWx5ID0gZm9udEZhbWlseS5yZXBsYWNlKC9cIi9nLCAnXFwnJyk7XG5cdFx0XHRjb25zdCBoYXNRdW90ZXNPcklzTGlzdCA9IC9bLCddLy50ZXN0KGZvbnRGYW1pbHkpO1xuXHRcdFx0aWYgKCFoYXNRdW90ZXNPcklzTGlzdCkge1xuXHRcdFx0XHRjb25zdCBuZWVkc1F1b3RlcyA9IC9bKyBdLy50ZXN0KGZvbnRGYW1pbHkpO1xuXHRcdFx0XHRpZiAobmVlZHNRdW90ZXMpIHtcblx0XHRcdFx0XHRmb250RmFtaWx5ID0gYCcke2ZvbnRGYW1pbHl9J2A7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvbnRGYW1pbHkgPSBgJHtmb250RmFtaWx5fSwgJHtFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5fWA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGU6IGxhbmd1YWdlSWQsXG5cdFx0XHRodG1sOiAoXG5cdFx0XHRcdGA8ZGl2IHN0eWxlPVwiYFxuXHRcdFx0XHQrIGBjb2xvcjogJHtjb2xvck1hcFtDb2xvcklkLkRlZmF1bHRGb3JlZ3JvdW5kXX07YFxuXHRcdFx0XHQrIGBiYWNrZ3JvdW5kLWNvbG9yOiAke2NvbG9yTWFwW0NvbG9ySWQuRGVmYXVsdEJhY2tncm91bmRdfTtgXG5cdFx0XHRcdCsgYGZvbnQtZmFtaWx5OiAke2ZvbnRGYW1pbHl9O2Bcblx0XHRcdFx0KyBgZm9udC13ZWlnaHQ6ICR7Zm9udEluZm8uZm9udFdlaWdodH07YFxuXHRcdFx0XHQrIGBmb250LXNpemU6ICR7Zm9udEluZm8uZm9udFNpemV9cHg7YFxuXHRcdFx0XHQrIGBsaW5lLWhlaWdodDogJHtmb250SW5mby5saW5lSGVpZ2h0fXB4O2Bcblx0XHRcdFx0KyBgd2hpdGUtc3BhY2U6IHByZTtgXG5cdFx0XHRcdCsgYFwiPmBcblx0XHRcdFx0KyB0aGlzLl9nZXRIVE1MVG9Db3B5KHJhbmdlLCBjb2xvck1hcClcblx0XHRcdFx0KyAnPC9kaXY+J1xuXHRcdFx0KVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRIVE1MVG9Db3B5KG1vZGVsUmFuZ2U6IFJhbmdlLCBjb2xvck1hcDogc3RyaW5nW10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IG1vZGVsUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IHN0YXJ0Q29sdW1uID0gbW9kZWxSYW5nZS5zdGFydENvbHVtbjtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gbW9kZWxSYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IG1vZGVsUmFuZ2UuZW5kQ29sdW1uO1xuXG5cdFx0Y29uc3QgdGFiU2l6ZSA9IHRoaXMuZ2V0VGFiU2l6ZSgpO1xuXG5cdFx0bGV0IHJlc3VsdCA9ICcnO1xuXG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSB0aGlzLm1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBsaW5lVG9rZW5zLmdldExpbmVDb250ZW50KCk7XG5cdFx0XHRjb25zdCBzdGFydE9mZnNldCA9IChsaW5lTnVtYmVyID09PSBzdGFydExpbmVOdW1iZXIgPyBzdGFydENvbHVtbiAtIDEgOiAwKTtcblx0XHRcdGNvbnN0IGVuZE9mZnNldCA9IChsaW5lTnVtYmVyID09PSBlbmRMaW5lTnVtYmVyID8gZW5kQ29sdW1uIC0gMSA6IGxpbmVDb250ZW50Lmxlbmd0aCk7XG5cblx0XHRcdGlmIChsaW5lQ29udGVudCA9PT0gJycpIHtcblx0XHRcdFx0cmVzdWx0ICs9ICc8YnI+Jztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3VsdCArPSB0b2tlbml6ZUxpbmVUb0hUTUwobGluZUNvbnRlbnQsIGxpbmVUb2tlbnMuaW5mbGF0ZSgpLCBjb2xvck1hcCwgc3RhcnRPZmZzZXQsIGVuZE9mZnNldCwgdGFiU2l6ZSwgcGxhdGZvcm0uaXNXaW5kb3dzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q29sb3JNYXAoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKTtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gWycjMDAwMDAwJ107XG5cdFx0aWYgKGNvbG9yTWFwKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMSwgbGVuID0gY29sb3JNYXAubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0cmVzdWx0W2ldID0gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXgoY29sb3JNYXBbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Ly8jcmVnaW9uIGN1cnNvciBvcGVyYXRpb25zXG5cblx0cHVibGljIGdldFByaW1hcnlDdXJzb3JTdGF0ZSgpOiBDdXJzb3JTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvci5nZXRQcmltYXJ5Q3Vyc29yU3RhdGUoKTtcblx0fVxuXHRwdWJsaWMgZ2V0TGFzdEFkZGVkQ3Vyc29ySW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLmdldExhc3RBZGRlZEN1cnNvckluZGV4KCk7XG5cdH1cblx0cHVibGljIGdldEN1cnNvclN0YXRlcygpOiBDdXJzb3JTdGF0ZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLmdldEN1cnNvclN0YXRlcygpO1xuXHR9XG5cdHB1YmxpYyBzZXRDdXJzb3JTdGF0ZXMoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCByZWFzb246IEN1cnNvckNoYW5nZVJlYXNvbiwgc3RhdGVzOiBQYXJ0aWFsQ3Vyc29yU3RhdGVbXSB8IG51bGwpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5zZXRTdGF0ZXMoZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UsIHJlYXNvbiwgc3RhdGVzKSk7XG5cdH1cblx0cHVibGljIGdldEN1cnNvckNvbHVtblNlbGVjdERhdGEoKTogSUNvbHVtblNlbGVjdERhdGEge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0Q3Vyc29yQ29sdW1uU2VsZWN0RGF0YSgpO1xuXHR9XG5cdHB1YmxpYyBnZXRDdXJzb3JBdXRvQ2xvc2VkQ2hhcmFjdGVycygpOiBSYW5nZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLmdldEF1dG9DbG9zZWRDaGFyYWN0ZXJzKCk7XG5cdH1cblx0cHVibGljIHNldEN1cnNvckNvbHVtblNlbGVjdERhdGEoY29sdW1uU2VsZWN0RGF0YTogSUNvbHVtblNlbGVjdERhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJzb3Iuc2V0Q3Vyc29yQ29sdW1uU2VsZWN0RGF0YShjb2x1bW5TZWxlY3REYXRhKTtcblx0fVxuXHRwdWJsaWMgZ2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKCk6IEVkaXRPcGVyYXRpb25UeXBlIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLmdldFByZXZFZGl0T3BlcmF0aW9uVHlwZSgpO1xuXHR9XG5cdHB1YmxpYyBzZXRQcmV2RWRpdE9wZXJhdGlvblR5cGUodHlwZTogRWRpdE9wZXJhdGlvblR5cGUpOiB2b2lkIHtcblx0XHR0aGlzLl9jdXJzb3Iuc2V0UHJldkVkaXRPcGVyYXRpb25UeXBlKHR5cGUpO1xuXHR9XG5cdHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLmdldFNlbGVjdGlvbigpO1xuXHR9XG5cdHB1YmxpYyBnZXRTZWxlY3Rpb25zKCk6IFNlbGVjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fY3Vyc29yLmdldFNlbGVjdGlvbnMoKTtcblx0fVxuXHRwdWJsaWMgZ2V0UG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0UHJpbWFyeUN1cnNvclN0YXRlKCkubW9kZWxTdGF0ZS5wb3NpdGlvbjtcblx0fVxuXHRwdWJsaWMgc2V0U2VsZWN0aW9ucyhzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHNlbGVjdGlvbnM6IHJlYWRvbmx5IElTZWxlY3Rpb25bXSwgcmVhc29uID0gQ3Vyc29yQ2hhbmdlUmVhc29uLk5vdFNldCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhWaWV3RXZlbnRzQ29sbGVjdG9yKGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3Iuc2V0U2VsZWN0aW9ucyhldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgc2VsZWN0aW9ucywgcmVhc29uKSk7XG5cdH1cblx0cHVibGljIHNhdmVDdXJzb3JTdGF0ZSgpOiBJQ3Vyc29yU3RhdGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnNvci5zYXZlU3RhdGUoKTtcblx0fVxuXHRwdWJsaWMgcmVzdG9yZUN1cnNvclN0YXRlKHN0YXRlczogSUN1cnNvclN0YXRlW10pOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoVmlld0V2ZW50c0NvbGxlY3RvcihldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLnJlc3RvcmVTdGF0ZShldmVudHNDb2xsZWN0b3IsIHN0YXRlcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhlY3V0ZUN1cnNvckVkaXQoY2FsbGJhY2s6IChldmVudHNDb2xsZWN0b3I6IFZpZXdNb2RlbEV2ZW50c0NvbGxlY3RvcikgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJzb3IuY29udGV4dC5jdXJzb3JDb25maWcucmVhZE9ubHkpIHtcblx0XHRcdC8vIHdlIGNhbm5vdCBlZGl0IHdoZW4gcmVhZCBvbmx5Li4uXG5cdFx0XHR0aGlzLl9ldmVudERpc3BhdGNoZXIuZW1pdE91dGdvaW5nRXZlbnQobmV3IFJlYWRPbmx5RWRpdEF0dGVtcHRFdmVudCgpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoY2FsbGJhY2spO1xuXHR9XG5cdHB1YmxpYyBleGVjdXRlRWRpdHMoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBlZGl0czogSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uW10sIGN1cnNvclN0YXRlQ29tcHV0ZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyLCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9leGVjdXRlQ3Vyc29yRWRpdChldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLmV4ZWN1dGVFZGl0cyhldmVudHNDb2xsZWN0b3IsIHNvdXJjZSwgZWRpdHMsIGN1cnNvclN0YXRlQ29tcHV0ZXIsIHJlYXNvbikpO1xuXHR9XG5cdHB1YmxpYyBzdGFydENvbXBvc2l0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX2V4ZWN1dGVDdXJzb3JFZGl0KGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3Iuc3RhcnRDb21wb3NpdGlvbihldmVudHNDb2xsZWN0b3IpKTtcblx0fVxuXHRwdWJsaWMgZW5kQ29tcG9zaXRpb24oc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2V4ZWN1dGVDdXJzb3JFZGl0KGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IuZW5kQ29tcG9zaXRpb24oZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UpKTtcblx0fVxuXHRwdWJsaWMgdHlwZSh0ZXh0OiBzdHJpbmcsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9leGVjdXRlQ3Vyc29yRWRpdChldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLnR5cGUoZXZlbnRzQ29sbGVjdG9yLCB0ZXh0LCBzb3VyY2UpKTtcblx0fVxuXHRwdWJsaWMgY29tcG9zaXRpb25UeXBlKHRleHQ6IHN0cmluZywgcmVwbGFjZVByZXZDaGFyQ250OiBudW1iZXIsIHJlcGxhY2VOZXh0Q2hhckNudDogbnVtYmVyLCBwb3NpdGlvbkRlbHRhOiBudW1iZXIsIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9leGVjdXRlQ3Vyc29yRWRpdChldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLmNvbXBvc2l0aW9uVHlwZShldmVudHNDb2xsZWN0b3IsIHRleHQsIHJlcGxhY2VQcmV2Q2hhckNudCwgcmVwbGFjZU5leHRDaGFyQ250LCBwb3NpdGlvbkRlbHRhLCBzb3VyY2UpKTtcblx0fVxuXHRwdWJsaWMgcGFzdGUodGV4dDogc3RyaW5nLCBwYXN0ZU9uTmV3TGluZTogYm9vbGVhbiwgbXVsdGljdXJzb3JUZXh0Pzogc3RyaW5nW10gfCBudWxsIHwgdW5kZWZpbmVkLCBzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhlY3V0ZUN1cnNvckVkaXQoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5wYXN0ZShldmVudHNDb2xsZWN0b3IsIHRleHQsIHBhc3RlT25OZXdMaW5lLCBtdWx0aWN1cnNvclRleHQsIHNvdXJjZSkpO1xuXHR9XG5cdHB1YmxpYyBjdXQoc291cmNlPzogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2V4ZWN1dGVDdXJzb3JFZGl0KGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IuY3V0KGV2ZW50c0NvbGxlY3Rvciwgc291cmNlKSk7XG5cdH1cblx0cHVibGljIGV4ZWN1dGVDb21tYW5kKGNvbW1hbmQ6IElDb21tYW5kLCBzb3VyY2U/OiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhlY3V0ZUN1cnNvckVkaXQoZXZlbnRzQ29sbGVjdG9yID0+IHRoaXMuX2N1cnNvci5leGVjdXRlQ29tbWFuZChldmVudHNDb2xsZWN0b3IsIGNvbW1hbmQsIHNvdXJjZSkpO1xuXHR9XG5cdHB1YmxpYyBleGVjdXRlQ29tbWFuZHMoY29tbWFuZHM6IElDb21tYW5kW10sIHNvdXJjZT86IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9leGVjdXRlQ3Vyc29yRWRpdChldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLmV4ZWN1dGVDb21tYW5kcyhldmVudHNDb2xsZWN0b3IsIGNvbW1hbmRzLCBzb3VyY2UpKTtcblx0fVxuXHRwdWJsaWMgcmV2ZWFsQWxsQ3Vyc29ycyhzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHJldmVhbEhvcml6b250YWw6IGJvb2xlYW4sIG1pbmltYWxSZXZlYWw6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhWaWV3RXZlbnRzQ29sbGVjdG9yKGV2ZW50c0NvbGxlY3RvciA9PiB0aGlzLl9jdXJzb3IucmV2ZWFsQWxsKGV2ZW50c0NvbGxlY3Rvciwgc291cmNlLCBtaW5pbWFsUmV2ZWFsLCB2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZS5TaW1wbGUsIHJldmVhbEhvcml6b250YWwsIFNjcm9sbFR5cGUuU21vb3RoKSk7XG5cdH1cblx0cHVibGljIHJldmVhbFByaW1hcnlDdXJzb3Ioc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCByZXZlYWxIb3Jpem9udGFsOiBib29sZWFuLCBtaW5pbWFsUmV2ZWFsOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLl93aXRoVmlld0V2ZW50c0NvbGxlY3RvcihldmVudHNDb2xsZWN0b3IgPT4gdGhpcy5fY3Vyc29yLnJldmVhbFByaW1hcnkoZXZlbnRzQ29sbGVjdG9yLCBzb3VyY2UsIG1pbmltYWxSZXZlYWwsIHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSwgcmV2ZWFsSG9yaXpvbnRhbCwgU2Nyb2xsVHlwZS5TbW9vdGgpKTtcblx0fVxuXHRwdWJsaWMgcmV2ZWFsVG9wTW9zdEN1cnNvcihzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSB0aGlzLl9jdXJzb3IuZ2V0VG9wTW9zdFZpZXdQb3NpdGlvbigpO1xuXHRcdGNvbnN0IHZpZXdSYW5nZSA9IG5ldyBSYW5nZSh2aWV3UG9zaXRpb24ubGluZU51bWJlciwgdmlld1Bvc2l0aW9uLmNvbHVtbiwgdmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIsIHZpZXdQb3NpdGlvbi5jb2x1bW4pO1xuXHRcdHRoaXMuX3dpdGhWaWV3RXZlbnRzQ29sbGVjdG9yKGV2ZW50c0NvbGxlY3RvciA9PiBldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3UmV2ZWFsUmFuZ2VSZXF1ZXN0RXZlbnQoc291cmNlLCBmYWxzZSwgdmlld1JhbmdlLCBudWxsLCB2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZS5TaW1wbGUsIHRydWUsIFNjcm9sbFR5cGUuU21vb3RoKSkpO1xuXHR9XG5cdHB1YmxpYyByZXZlYWxCb3R0b21Nb3N0Q3Vyc29yKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IHRoaXMuX2N1cnNvci5nZXRCb3R0b21Nb3N0Vmlld1Bvc2l0aW9uKCk7XG5cdFx0Y29uc3Qgdmlld1JhbmdlID0gbmV3IFJhbmdlKHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCB2aWV3UG9zaXRpb24uY29sdW1uLCB2aWV3UG9zaXRpb24ubGluZU51bWJlciwgdmlld1Bvc2l0aW9uLmNvbHVtbik7XG5cdFx0dGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoZXZlbnRzQ29sbGVjdG9yID0+IGV2ZW50c0NvbGxlY3Rvci5lbWl0Vmlld0V2ZW50KG5ldyB2aWV3RXZlbnRzLlZpZXdSZXZlYWxSYW5nZVJlcXVlc3RFdmVudChzb3VyY2UsIGZhbHNlLCB2aWV3UmFuZ2UsIG51bGwsIHZpZXdFdmVudHMuVmVydGljYWxSZXZlYWxUeXBlLlNpbXBsZSwgdHJ1ZSwgU2Nyb2xsVHlwZS5TbW9vdGgpKSk7XG5cdH1cblx0cHVibGljIHJldmVhbFJhbmdlKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgcmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiwgdmlld1JhbmdlOiBSYW5nZSwgdmVydGljYWxUeXBlOiB2aWV3RXZlbnRzLlZlcnRpY2FsUmV2ZWFsVHlwZSwgc2Nyb2xsVHlwZTogU2Nyb2xsVHlwZSk6IHZvaWQge1xuXHRcdHRoaXMuX3dpdGhWaWV3RXZlbnRzQ29sbGVjdG9yKGV2ZW50c0NvbGxlY3RvciA9PiBldmVudHNDb2xsZWN0b3IuZW1pdFZpZXdFdmVudChuZXcgdmlld0V2ZW50cy5WaWV3UmV2ZWFsUmFuZ2VSZXF1ZXN0RXZlbnQoc291cmNlLCBmYWxzZSwgdmlld1JhbmdlLCBudWxsLCB2ZXJ0aWNhbFR5cGUsIHJldmVhbEhvcml6b250YWwsIHNjcm9sbFR5cGUpKSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gdmlld0xheW91dFxuXHRwdWJsaWMgY2hhbmdlV2hpdGVzcGFjZShjYWxsYmFjazogKGFjY2Vzc29yOiBJV2hpdGVzcGFjZUNoYW5nZUFjY2Vzc29yKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFkQUNoYW5nZSA9IHRoaXMudmlld0xheW91dC5jaGFuZ2VXaGl0ZXNwYWNlKGNhbGxiYWNrKTtcblx0XHRpZiAoaGFkQUNoYW5nZSkge1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRTaW5nbGVWaWV3RXZlbnQobmV3IHZpZXdFdmVudHMuVmlld1pvbmVzQ2hhbmdlZEV2ZW50KCkpO1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVtaXRPdXRnb2luZ0V2ZW50KG5ldyBWaWV3Wm9uZXNDaGFuZ2VkRXZlbnQoKSk7XG5cdFx0fVxuXHR9XG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgX3dpdGhWaWV3RXZlbnRzQ29sbGVjdG9yPFQ+KGNhbGxiYWNrOiAoZXZlbnRzQ29sbGVjdG9yOiBWaWV3TW9kZWxFdmVudHNDb2xsZWN0b3IpID0+IFQpOiBUIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNhY3Rpb25hbFRhcmdldC5iYXRjaENoYW5nZXMoKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VtaXRWaWV3RXZlbnQoY2FsbGJhY2spO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW1pdFZpZXdFdmVudDxUPihjYWxsYmFjazogKGV2ZW50c0NvbGxlY3RvcjogVmlld01vZGVsRXZlbnRzQ29sbGVjdG9yKSA9PiBUKTogVCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV2ZW50c0NvbGxlY3RvciA9IHRoaXMuX2V2ZW50RGlzcGF0Y2hlci5iZWdpbkVtaXRWaWV3RXZlbnRzKCk7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soZXZlbnRzQ29sbGVjdG9yKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZXZlbnREaXNwYXRjaGVyLmVuZEVtaXRWaWV3RXZlbnRzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGJhdGNoRXZlbnRzKGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5fd2l0aFZpZXdFdmVudHNDb2xsZWN0b3IoKCkgPT4geyBjYWxsYmFjaygpOyB9KTtcblx0fVxuXG5cdG5vcm1hbGl6ZVBvc2l0aW9uKHBvc2l0aW9uOiBQb3NpdGlvbiwgYWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkpOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzLm5vcm1hbGl6ZVBvc2l0aW9uKHBvc2l0aW9uLCBhZmZpbml0eSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgY29sdW1uIGF0IHdoaWNoIGluZGVudGF0aW9uIHN0b3BzIGF0IGEgZ2l2ZW4gbGluZS5cblx0ICogQGludGVybmFsXG5cdCovXG5cdGdldExpbmVJbmRlbnRDb2x1bW4obGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMuZ2V0TGluZUluZGVudENvbHVtbihsaW5lTnVtYmVyKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCYXRjaGFibGVUYXJnZXQge1xuXHQvKipcblx0ICogQWxsb3dzIHRoZSB0YXJnZXQgdG8gYXBwbHkgdGhlIGNoYW5nZXMgaW50cm9kdWNlZCBieSB0aGUgY2FsbGJhY2sgaW4gYSBiYXRjaC5cblx0Ki9cblx0YmF0Y2hDaGFuZ2VzPFQ+KGNiOiAoKSA9PiBUKTogVDtcbn1cblxuY2xhc3MgVmlld3BvcnRTdGFydCBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgc3RhdGljIGNyZWF0ZShtb2RlbDogSVRleHRNb2RlbCk6IFZpZXdwb3J0U3RhcnQge1xuXHRcdGNvbnN0IHZpZXdwb3J0U3RhcnRMaW5lVHJhY2tlZFJhbmdlID0gbW9kZWwuX3NldFRyYWNrZWRSYW5nZShudWxsLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzKTtcblx0XHRyZXR1cm4gbmV3IFZpZXdwb3J0U3RhcnQobW9kZWwsIDEsIGZhbHNlLCB2aWV3cG9ydFN0YXJ0TGluZVRyYWNrZWRSYW5nZSwgMCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHZpZXdMaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZpZXdMaW5lTnVtYmVyO1xuXHR9XG5cblx0cHVibGljIGdldCBpc1ZhbGlkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1ZhbGlkO1xuXHR9XG5cblx0cHVibGljIGdldCBtb2RlbFRyYWNrZWRSYW5nZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbFRyYWNrZWRSYW5nZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3RhcnRMaW5lRGVsdGEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRMaW5lRGVsdGE7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgX3ZpZXdMaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfaXNWYWxpZDogYm9vbGVhbixcblx0XHRwcml2YXRlIF9tb2RlbFRyYWNrZWRSYW5nZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3N0YXJ0TGluZURlbHRhOiBudW1iZXIsXG5cdCkgeyB9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWwuX3NldFRyYWNrZWRSYW5nZSh0aGlzLl9tb2RlbFRyYWNrZWRSYW5nZSwgbnVsbCwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZSh2aWV3TW9kZWw6IElWaWV3TW9kZWwsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB2aWV3TW9kZWwuY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihuZXcgUG9zaXRpb24oc3RhcnRMaW5lTnVtYmVyLCB2aWV3TW9kZWwuZ2V0TGluZU1pbkNvbHVtbihzdGFydExpbmVOdW1iZXIpKSk7XG5cdFx0Y29uc3Qgdmlld3BvcnRTdGFydExpbmVUcmFja2VkUmFuZ2UgPSB2aWV3TW9kZWwubW9kZWwuX3NldFRyYWNrZWRSYW5nZSh0aGlzLl9tb2RlbFRyYWNrZWRSYW5nZSwgbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMpO1xuXHRcdGNvbnN0IHZpZXdwb3J0U3RhcnRMaW5lVG9wID0gdmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHN0YXJ0TGluZU51bWJlcik7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0Q3VycmVudFNjcm9sbFRvcCgpO1xuXG5cdFx0dGhpcy5fdmlld0xpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0dGhpcy5faXNWYWxpZCA9IHRydWU7XG5cdFx0dGhpcy5fbW9kZWxUcmFja2VkUmFuZ2UgPSB2aWV3cG9ydFN0YXJ0TGluZVRyYWNrZWRSYW5nZTtcblx0XHR0aGlzLl9zdGFydExpbmVEZWx0YSA9IHNjcm9sbFRvcCAtIHZpZXdwb3J0U3RhcnRMaW5lVG9wO1xuXHR9XG5cblx0cHVibGljIGludmFsaWRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNWYWxpZCA9IGZhbHNlO1xuXHR9XG59XG5cbmNsYXNzIE92ZXJ2aWV3UnVsZXJEZWNvcmF0aW9ucyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXNNYXA6IHsgW2NvbG9yOiBzdHJpbmddOiBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cCB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0cmVhZG9ubHkgYXNBcnJheTogT3ZlcnZpZXdSdWxlckRlY29yYXRpb25zR3JvdXBbXSA9IFtdO1xuXG5cdHB1YmxpYyBhY2NlcHQoY29sb3I6IHN0cmluZywgekluZGV4OiBudW1iZXIsIHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGxhbmU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IHByZXZHcm91cCA9IHRoaXMuX2FzTWFwW2NvbG9yXTtcblxuXHRcdGlmIChwcmV2R3JvdXApIHtcblx0XHRcdGNvbnN0IHByZXZEYXRhID0gcHJldkdyb3VwLmRhdGE7XG5cdFx0XHRjb25zdCBwcmV2TGFuZSA9IHByZXZEYXRhW3ByZXZEYXRhLmxlbmd0aCAtIDNdO1xuXHRcdFx0Y29uc3QgcHJldkVuZExpbmVOdW1iZXIgPSBwcmV2RGF0YVtwcmV2RGF0YS5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChwcmV2TGFuZSA9PT0gbGFuZSAmJiBwcmV2RW5kTGluZU51bWJlciArIDEgPj0gc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIG1lcmdlIGludG8gcHJldlxuXHRcdFx0XHRpZiAoZW5kTGluZU51bWJlciA+IHByZXZFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cHJldkRhdGFbcHJldkRhdGEubGVuZ3RoIC0gMV0gPSBlbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcHVzaFxuXHRcdFx0cHJldkRhdGEucHVzaChsYW5lLCBzdGFydExpbmVOdW1iZXIsIGVuZExpbmVOdW1iZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBncm91cCA9IG5ldyBPdmVydmlld1J1bGVyRGVjb3JhdGlvbnNHcm91cChjb2xvciwgekluZGV4LCBbbGFuZSwgc3RhcnRMaW5lTnVtYmVyLCBlbmRMaW5lTnVtYmVyXSk7XG5cdFx0XHR0aGlzLl9hc01hcFtjb2xvcl0gPSBncm91cDtcblx0XHRcdHRoaXMuYXNBcnJheS5wdXNoKGdyb3VwKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSGlkZGVuQXJlYXNNb2RlbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgaGlkZGVuQXJlYXMgPSBuZXcgTWFwPHVua25vd24sIFJhbmdlW10+KCk7XG5cdHByaXZhdGUgc2hvdWxkUmVjb21wdXRlID0gZmFsc2U7XG5cdHByaXZhdGUgcmFuZ2VzOiBSYW5nZVtdID0gW107XG5cblx0c2V0SGlkZGVuQXJlYXMoc291cmNlOiB1bmtub3duLCByYW5nZXM6IFJhbmdlW10pOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuaGlkZGVuQXJlYXMuZ2V0KHNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIHJhbmdlQXJyYXlzRXF1YWwoZXhpc3RpbmcsIHJhbmdlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5oaWRkZW5BcmVhcy5zZXQoc291cmNlLCByYW5nZXMpO1xuXHRcdHRoaXMuc2hvdWxkUmVjb21wdXRlID0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgcmV0dXJuZWQgYXJyYXkgaXMgaW1tdXRhYmxlLlxuXHQqL1xuXHRnZXRNZXJnZWRSYW5nZXMoKTogcmVhZG9ubHkgUmFuZ2VbXSB7XG5cdFx0aWYgKCF0aGlzLnNob3VsZFJlY29tcHV0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmFuZ2VzO1xuXHRcdH1cblx0XHR0aGlzLnNob3VsZFJlY29tcHV0ZSA9IGZhbHNlO1xuXHRcdGNvbnN0IG5ld1JhbmdlcyA9IEFycmF5LmZyb20odGhpcy5oaWRkZW5BcmVhcy52YWx1ZXMoKSkucmVkdWNlKChyLCBoaWRkZW5BcmVhcykgPT4gbWVyZ2VMaW5lUmFuZ2VBcnJheShyLCBoaWRkZW5BcmVhcyksIFtdKTtcblx0XHRpZiAocmFuZ2VBcnJheXNFcXVhbCh0aGlzLnJhbmdlcywgbmV3UmFuZ2VzKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmFuZ2VzO1xuXHRcdH1cblx0XHR0aGlzLnJhbmdlcyA9IG5ld1Jhbmdlcztcblx0XHRyZXR1cm4gdGhpcy5yYW5nZXM7XG5cdH1cbn1cblxuZnVuY3Rpb24gbWVyZ2VMaW5lUmFuZ2VBcnJheShhcnIxOiBSYW5nZVtdLCBhcnIyOiBSYW5nZVtdKTogUmFuZ2VbXSB7XG5cdGNvbnN0IHJlc3VsdDogUmFuZ2VbXSA9IFtdO1xuXHRsZXQgaSA9IDA7XG5cdGxldCBqID0gMDtcblx0d2hpbGUgKGkgPCBhcnIxLmxlbmd0aCAmJiBqIDwgYXJyMi5sZW5ndGgpIHtcblx0XHRjb25zdCBpdGVtMSA9IGFycjFbaV07XG5cdFx0Y29uc3QgaXRlbTIgPSBhcnIyW2pdO1xuXG5cdFx0aWYgKGl0ZW0xLmVuZExpbmVOdW1iZXIgPCBpdGVtMi5zdGFydExpbmVOdW1iZXIgLSAxKSB7XG5cdFx0XHRyZXN1bHQucHVzaChhcnIxW2krK10pO1xuXHRcdH0gZWxzZSBpZiAoaXRlbTIuZW5kTGluZU51bWJlciA8IGl0ZW0xLnN0YXJ0TGluZU51bWJlciAtIDEpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGFycjJbaisrXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IE1hdGgubWluKGl0ZW0xLnN0YXJ0TGluZU51bWJlciwgaXRlbTIuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGVuZExpbmVOdW1iZXIgPSBNYXRoLm1heChpdGVtMS5lbmRMaW5lTnVtYmVyLCBpdGVtMi5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdHJlc3VsdC5wdXNoKG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIDEsIGVuZExpbmVOdW1iZXIsIDEpKTtcblx0XHRcdGkrKztcblx0XHRcdGorKztcblx0XHR9XG5cdH1cblx0d2hpbGUgKGkgPCBhcnIxLmxlbmd0aCkge1xuXHRcdHJlc3VsdC5wdXNoKGFycjFbaSsrXSk7XG5cdH1cblx0d2hpbGUgKGogPCBhcnIyLmxlbmd0aCkge1xuXHRcdHJlc3VsdC5wdXNoKGFycjJbaisrXSk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcmFuZ2VBcnJheXNFcXVhbChhcnIxOiBSYW5nZVtdLCBhcnIyOiBSYW5nZVtdKTogYm9vbGVhbiB7XG5cdGlmIChhcnIxLmxlbmd0aCAhPT0gYXJyMi5sZW5ndGgpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhcnIxLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKCFhcnIxW2ldLmVxdWFsc1JhbmdlKGFycjJbaV0pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB0cnVlO1xufVxuXG4vKipcbiAqIE1haW50YWluIGEgc3RhYmxlIHZpZXdwb3J0IGJ5IHRyeWluZyB0byBrZWVwIHRoZSBmaXJzdCBsaW5lIGluIHRoZSB2aWV3cG9ydCBjb25zdGFudC5cbiAqL1xuY2xhc3MgU3RhYmxlVmlld3BvcnQge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlld3BvcnRTdGFydE1vZGVsUG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRMaW5lRGVsdGE6IG51bWJlclxuXHQpIHsgfVxuXG5cdHB1YmxpYyByZWNvdmVyVmlld3BvcnRTdGFydChjb29yZGluYXRlc0NvbnZlcnRlcjogSUNvb3JkaW5hdGVzQ29udmVydGVyLCB2aWV3TGF5b3V0OiBWaWV3TGF5b3V0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnZpZXdwb3J0U3RhcnRNb2RlbFBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IGNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24odGhpcy52aWV3cG9ydFN0YXJ0TW9kZWxQb3NpdGlvbik7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uVG9wID0gdmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEZvckxpbmVOdW1iZXIodmlld1Bvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdHZpZXdMYXlvdXQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHZpZXdQb3NpdGlvblRvcCArIHRoaXMuc3RhcnRMaW5lRGVsdGEgfSwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGFBQWE7QUFFdEIsU0FBUyxrQkFBK0I7QUFDeEMsWUFBWSxjQUFjO0FBQzFCLFlBQVksYUFBYTtBQUN6QixTQUFvQyxjQUFjLDZCQUE2Qiw2QkFBZ0U7QUFDL0ksU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBa0c7QUFDM0csU0FBUywwQkFBMEI7QUFDbkMsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQVMsYUFBYTtBQUV0QixTQUE2QyxrQkFBa0I7QUFFL0QsU0FBUyxxQkFBZ0osZUFBZSw4QkFBOEI7QUFHdE0sWUFBWSxxQkFBcUI7QUFDakMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBRW5DLFlBQVksZ0JBQWdCO0FBQzVCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUNBQWlD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U0FBTyxJQUFJLEtBQUssVUFBVSxJQUFJLEtBQUssUUFBUTtBQUMxQyxVQUFNLFFBQVEsS0FBSyxDQUFDO0FBQ3BCLFVBQU0sUUFBUSxLQUFLLENBQUM7QUFFcEIsUUFBSSxNQUFNLGdCQUFnQixNQUFNLGtCQUFrQixHQUFHO0FBQ3BELGFBQU8sS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUFBLElBQ3RCLFdBQVcsTUFBTSxnQkFBZ0IsTUFBTSxrQkFBa0IsR0FBRztBQUMzRCxhQUFPLEtBQUssS0FBSyxHQUFHLENBQUM7QUFBQSxJQUN0QixPQUFPO0FBQ04sWUFBTSxrQkFBa0IsS0FBSyxJQUFJLE1BQU0saUJBQWlCLE1BQU0sZUFBZTtBQUM3RSxZQUFNLGdCQUFnQixLQUFLLElBQUksTUFBTSxlQUFlLE1BQU0sYUFBYTtBQUN2RSxhQUFPLEtBQUssSUFBSSxNQUFNLGlCQUFpQixHQUFHLGVBQWUsQ0FBQyxDQUFDO0FBQzNEO0FBQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU8sSUFBSSxLQUFLLFFBQVE7QUFDdkIsV0FBTyxLQUFLLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDdEI7QUFDQSxTQUFPLElBQUksS0FBSyxRQUFRO0FBQ3ZCLFdBQU8sS0FBSyxLQUFLLEdBQUcsQ0FBQztBQUFBLEVBQ3RCO0FBQ0EsU0FBTztBQUNSO0FBRUEsU0FBUyxpQkFBaUIsTUFBZSxNQUF3QjtBQUNoRSxNQUFJLEtBQUssV0FBVyxLQUFLLFFBQVE7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxXQUFTLElBQUksR0FBRyxJQUFJLEtBQUssUUFBUSxLQUFLO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxZQUFZLEtBQUssQ0FBQyxDQUFDLEdBQUc7QUFDbEMsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBS0EsTUFBTSxlQUFlO0FBQUEsRUFDcEIsWUFDaUIsNEJBQ0EsZ0JBQ2Y7QUFGZTtBQUNBO0FBQUEsRUFDYjtBQUFBLEVBRUcscUJBQXFCLHNCQUE2QyxZQUE4QjtBQUN0RyxRQUFJLENBQUMsS0FBSyw0QkFBNEI7QUFDckM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxlQUFlLHFCQUFxQixtQ0FBbUMsS0FBSywwQkFBMEI7QUFDNUcsVUFBTSxrQkFBa0IsV0FBVywrQkFBK0IsYUFBYSxVQUFVO0FBQ3pGLGVBQVcsa0JBQWtCLEVBQUUsV0FBVyxrQkFBa0IsS0FBSyxlQUFlLEdBQUcsV0FBVyxTQUFTO0FBQUEsRUFDeEc7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
