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
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { isObject } from "../../../../base/common/types.js";
import { FontMeasurements } from "../../../../editor/browser/config/fontMeasurements.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { createBareFontInfoFromRawSettings } from "../../../../editor/common/config/fontInfoFromSettings.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { NotebookSetting } from "../common/notebookCommon.js";
import { INotebookExecutionStateService } from "../common/notebookExecutionStateService.js";
const SCROLLABLE_ELEMENT_PADDING_TOP = 18;
const OutputInnerContainerTopPadding = 4;
const defaultConfigConstants = Object.freeze({
  codeCellLeftMargin: 28,
  cellRunGutter: 32,
  markdownCellTopMargin: 8,
  markdownCellBottomMargin: 8,
  markdownCellLeftMargin: 0,
  markdownCellGutter: 32,
  focusIndicatorLeftMargin: 4
});
const compactConfigConstants = Object.freeze({
  codeCellLeftMargin: 8,
  cellRunGutter: 36,
  markdownCellTopMargin: 6,
  markdownCellBottomMargin: 6,
  markdownCellLeftMargin: 8,
  markdownCellGutter: 36,
  focusIndicatorLeftMargin: 4
});
let NotebookOptions = class extends Disposable {
  constructor(targetWindow, isReadonly, overrides, configurationService, notebookExecutionStateService, codeEditorService) {
    super();
    this.targetWindow = targetWindow;
    this.isReadonly = isReadonly;
    this.overrides = overrides;
    this.configurationService = configurationService;
    this.notebookExecutionStateService = notebookExecutionStateService;
    this.codeEditorService = codeEditorService;
    this._onDidChangeOptions = this._register(new Emitter());
    this.onDidChangeOptions = this._onDidChangeOptions.event;
    this._editorTopPadding = 12;
    this.previousModelToCompare = observableValue("previousModelToCompare", void 0);
    const showCellStatusBar = this.configurationService.getValue(NotebookSetting.showCellStatusBar);
    const globalToolbar = overrides?.globalToolbar ?? this.configurationService.getValue(NotebookSetting.globalToolbar) ?? true;
    const stickyScrollEnabled = overrides?.stickyScrollEnabled ?? this.configurationService.getValue(NotebookSetting.stickyScrollEnabled) ?? false;
    const stickyScrollMode = this._computeStickyScrollModeOption();
    const consolidatedOutputButton = this.configurationService.getValue(NotebookSetting.consolidatedOutputButton) ?? true;
    const consolidatedRunButton = this.configurationService.getValue(NotebookSetting.consolidatedRunButton) ?? false;
    const dragAndDropEnabled = overrides?.dragAndDropEnabled ?? this.configurationService.getValue(NotebookSetting.dragAndDropEnabled) ?? true;
    const cellToolbarLocation = this.configurationService.getValue(NotebookSetting.cellToolbarLocation) ?? { "default": "right" };
    const cellToolbarInteraction = overrides?.cellToolbarInteraction ?? this.configurationService.getValue(NotebookSetting.cellToolbarVisibility);
    const compactView = this.configurationService.getValue(NotebookSetting.compactView) ?? true;
    const focusIndicator = this._computeFocusIndicatorOption();
    const insertToolbarPosition = this._computeInsertToolbarPositionOption(this.isReadonly);
    const insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
    const showFoldingControls = this._computeShowFoldingControlsOption();
    const fontSize = this.configurationService.getValue("editor.fontSize");
    const markupFontSize = this.configurationService.getValue(NotebookSetting.markupFontSize);
    const markdownLineHeight = this.configurationService.getValue(NotebookSetting.markdownLineHeight);
    let editorOptionsCustomizations = this.configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations) ?? {};
    editorOptionsCustomizations = isObject(editorOptionsCustomizations) ? editorOptionsCustomizations : {};
    const interactiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);
    const outputLineHeightSettingValue = this.configurationService.getValue(NotebookSetting.outputLineHeight);
    const outputFontSize = this.configurationService.getValue(NotebookSetting.outputFontSize) || fontSize;
    const outputFontFamily = this.configurationService.getValue(NotebookSetting.outputFontFamily);
    const outputScrolling = this.configurationService.getValue(NotebookSetting.outputScrolling);
    const outputLineHeight = this._computeOutputLineHeight(outputLineHeightSettingValue, outputFontSize);
    const outputWordWrap = this.configurationService.getValue(NotebookSetting.outputWordWrap);
    const outputLineLimit = this.configurationService.getValue(NotebookSetting.textOutputLineLimit) ?? 30;
    const linkifyFilePaths = this.configurationService.getValue(NotebookSetting.LinkifyOutputFilePaths) ?? true;
    const minimalErrors = this.configurationService.getValue(NotebookSetting.minimalErrorRendering);
    const markupFontFamily = this.configurationService.getValue(NotebookSetting.markupFontFamily);
    const editorTopPadding = this._computeEditorTopPadding();
    this._layoutConfiguration = {
      ...compactView ? compactConfigConstants : defaultConfigConstants,
      cellTopMargin: 6,
      cellBottomMargin: 6,
      cellRightMargin: 16,
      cellStatusBarHeight: 22,
      cellOutputPadding: 8,
      markdownPreviewPadding: 8,
      // bottomToolbarHeight: bottomToolbarHeight,
      // bottomToolbarGap: bottomToolbarGap,
      editorToolbarHeight: 0,
      editorTopPadding,
      editorBottomPadding: 4,
      editorBottomPaddingWithoutStatusBar: 12,
      collapsedIndicatorHeight: 28,
      showCellStatusBar,
      globalToolbar,
      stickyScrollEnabled,
      stickyScrollMode,
      consolidatedOutputButton,
      consolidatedRunButton,
      dragAndDropEnabled,
      cellToolbarLocation,
      cellToolbarInteraction,
      compactView,
      focusIndicator,
      insertToolbarPosition,
      insertToolbarAlignment,
      showFoldingControls,
      fontSize,
      outputFontSize,
      outputFontFamily,
      outputLineHeight,
      markupFontSize,
      markdownLineHeight,
      editorOptionsCustomizations,
      focusIndicatorGap: 3,
      interactiveWindowCollapseCodeCells,
      markdownFoldHintHeight: 22,
      outputScrolling,
      outputWordWrap,
      outputLineLimit,
      outputLinkifyFilePaths: linkifyFilePaths,
      outputMinimalError: minimalErrors,
      markupFontFamily,
      disableRulers: overrides?.disableRulers
    };
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      this._updateConfiguration(e);
    }));
  }
  updateOptions(isReadonly) {
    if (this.isReadonly !== isReadonly) {
      this.isReadonly = isReadonly;
      this._updateConfiguration({
        affectsConfiguration(configuration) {
          return configuration === NotebookSetting.insertToolbarLocation;
        },
        source: ConfigurationTarget.DEFAULT,
        affectedKeys: /* @__PURE__ */ new Set([NotebookSetting.insertToolbarLocation]),
        change: { keys: [NotebookSetting.insertToolbarLocation], overrides: [] }
      });
    }
  }
  _computeEditorTopPadding() {
    let decorationTriggeredAdjustment = false;
    const updateEditorTopPadding = (top) => {
      this._editorTopPadding = top;
      const configuration = Object.assign({}, this._layoutConfiguration);
      configuration.editorTopPadding = this._editorTopPadding;
      this._layoutConfiguration = configuration;
      this._onDidChangeOptions.fire({ editorTopPadding: true });
    };
    const decorationCheckSet = /* @__PURE__ */ new Set();
    const onDidAddDecorationType = (e) => {
      if (decorationTriggeredAdjustment) {
        return;
      }
      if (decorationCheckSet.has(e)) {
        return;
      }
      try {
        const options = this.codeEditorService.resolveDecorationOptions(e, true);
        if (options.afterContentClassName || options.beforeContentClassName) {
          const cssRules = this.codeEditorService.resolveDecorationCSSRules(e);
          if (cssRules !== null) {
            for (let i = 0; i < cssRules.length; i++) {
              if ((cssRules[i].selectorText.endsWith("::after") || cssRules[i].selectorText.endsWith("::after")) && cssRules[i].cssText.indexOf("top:") > -1) {
                const editorOptions = this.configurationService.getValue("editor");
                updateEditorTopPadding(createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value).lineHeight + 2);
                decorationTriggeredAdjustment = true;
                break;
              }
            }
          }
        }
        decorationCheckSet.add(e);
      } catch (_ex) {
      }
    };
    this._register(this.codeEditorService.onDecorationTypeRegistered(onDidAddDecorationType));
    this.codeEditorService.listDecorationTypes().forEach(onDidAddDecorationType);
    return this._editorTopPadding;
  }
  _computeOutputLineHeight(lineHeight, outputFontSize) {
    const minimumLineHeight = 9;
    if (lineHeight === 0) {
      const editorOptions = this.configurationService.getValue("editor");
      const fontInfo = FontMeasurements.readFontInfo(this.targetWindow, createBareFontInfoFromRawSettings(editorOptions, PixelRatio.getInstance(this.targetWindow).value));
      lineHeight = fontInfo.lineHeight;
    } else if (lineHeight < minimumLineHeight) {
      let fontSize = outputFontSize;
      if (fontSize === 0) {
        fontSize = this.configurationService.getValue("editor.fontSize");
      }
      lineHeight = lineHeight * fontSize;
    }
    lineHeight = Math.round(lineHeight);
    if (lineHeight < minimumLineHeight) {
      lineHeight = minimumLineHeight;
    }
    return lineHeight;
  }
  _updateConfiguration(e) {
    const cellStatusBarVisibility = e.affectsConfiguration(NotebookSetting.showCellStatusBar);
    const cellToolbarLocation = e.affectsConfiguration(NotebookSetting.cellToolbarLocation);
    const cellToolbarInteraction = e.affectsConfiguration(NotebookSetting.cellToolbarVisibility);
    const compactView = e.affectsConfiguration(NotebookSetting.compactView);
    const focusIndicator = e.affectsConfiguration(NotebookSetting.focusIndicator);
    const insertToolbarPosition = e.affectsConfiguration(NotebookSetting.insertToolbarLocation);
    const insertToolbarAlignment = e.affectsConfiguration(NotebookSetting.experimentalInsertToolbarAlignment);
    const globalToolbar = e.affectsConfiguration(NotebookSetting.globalToolbar);
    const stickyScrollEnabled = e.affectsConfiguration(NotebookSetting.stickyScrollEnabled);
    const stickyScrollMode = e.affectsConfiguration(NotebookSetting.stickyScrollMode);
    const consolidatedOutputButton = e.affectsConfiguration(NotebookSetting.consolidatedOutputButton);
    const consolidatedRunButton = e.affectsConfiguration(NotebookSetting.consolidatedRunButton);
    const showFoldingControls = e.affectsConfiguration(NotebookSetting.showFoldingControls);
    const dragAndDropEnabled = e.affectsConfiguration(NotebookSetting.dragAndDropEnabled);
    const fontSize = e.affectsConfiguration("editor.fontSize");
    const outputFontSize = e.affectsConfiguration(NotebookSetting.outputFontSize);
    const markupFontSize = e.affectsConfiguration(NotebookSetting.markupFontSize);
    const markdownLineHeight = e.affectsConfiguration(NotebookSetting.markdownLineHeight);
    const fontFamily = e.affectsConfiguration("editor.fontFamily");
    const outputFontFamily = e.affectsConfiguration(NotebookSetting.outputFontFamily);
    const editorOptionsCustomizations = e.affectsConfiguration(NotebookSetting.cellEditorOptionsCustomizations);
    const interactiveWindowCollapseCodeCells = e.affectsConfiguration(NotebookSetting.interactiveWindowCollapseCodeCells);
    const outputLineHeight = e.affectsConfiguration(NotebookSetting.outputLineHeight);
    const outputScrolling = e.affectsConfiguration(NotebookSetting.outputScrolling);
    const outputWordWrap = e.affectsConfiguration(NotebookSetting.outputWordWrap);
    const outputLinkifyFilePaths = e.affectsConfiguration(NotebookSetting.LinkifyOutputFilePaths);
    const minimalError = e.affectsConfiguration(NotebookSetting.minimalErrorRendering);
    const markupFontFamily = e.affectsConfiguration(NotebookSetting.markupFontFamily);
    if (!cellStatusBarVisibility && !cellToolbarLocation && !cellToolbarInteraction && !compactView && !focusIndicator && !insertToolbarPosition && !insertToolbarAlignment && !globalToolbar && !stickyScrollEnabled && !stickyScrollMode && !consolidatedOutputButton && !consolidatedRunButton && !showFoldingControls && !dragAndDropEnabled && !fontSize && !outputFontSize && !markupFontSize && !markdownLineHeight && !fontFamily && !outputFontFamily && !editorOptionsCustomizations && !interactiveWindowCollapseCodeCells && !outputLineHeight && !outputScrolling && !outputWordWrap && !outputLinkifyFilePaths && !minimalError && !markupFontFamily) {
      return;
    }
    let configuration = Object.assign({}, this._layoutConfiguration);
    if (cellStatusBarVisibility) {
      configuration.showCellStatusBar = this.configurationService.getValue(NotebookSetting.showCellStatusBar);
    }
    if (cellToolbarLocation) {
      configuration.cellToolbarLocation = this.configurationService.getValue(NotebookSetting.cellToolbarLocation) ?? { "default": "right" };
    }
    if (cellToolbarInteraction && !this.overrides?.cellToolbarInteraction) {
      configuration.cellToolbarInteraction = this.configurationService.getValue(NotebookSetting.cellToolbarVisibility);
    }
    if (focusIndicator) {
      configuration.focusIndicator = this._computeFocusIndicatorOption();
    }
    if (compactView) {
      const compactViewValue = this.configurationService.getValue(NotebookSetting.compactView) ?? true;
      configuration = Object.assign(configuration, {
        ...compactViewValue ? compactConfigConstants : defaultConfigConstants
      });
      configuration.compactView = compactViewValue;
    }
    if (insertToolbarAlignment) {
      configuration.insertToolbarAlignment = this._computeInsertToolbarAlignmentOption();
    }
    if (insertToolbarPosition) {
      configuration.insertToolbarPosition = this._computeInsertToolbarPositionOption(this.isReadonly);
    }
    if (globalToolbar && this.overrides?.globalToolbar === void 0) {
      configuration.globalToolbar = this.configurationService.getValue(NotebookSetting.globalToolbar) ?? true;
    }
    if (stickyScrollEnabled && this.overrides?.stickyScrollEnabled === void 0) {
      configuration.stickyScrollEnabled = this.configurationService.getValue(NotebookSetting.stickyScrollEnabled) ?? false;
    }
    if (stickyScrollMode) {
      configuration.stickyScrollMode = this.configurationService.getValue(NotebookSetting.stickyScrollMode) ?? "flat";
    }
    if (consolidatedOutputButton) {
      configuration.consolidatedOutputButton = this.configurationService.getValue(NotebookSetting.consolidatedOutputButton) ?? true;
    }
    if (consolidatedRunButton) {
      configuration.consolidatedRunButton = this.configurationService.getValue(NotebookSetting.consolidatedRunButton) ?? true;
    }
    if (showFoldingControls) {
      configuration.showFoldingControls = this._computeShowFoldingControlsOption();
    }
    if (dragAndDropEnabled) {
      configuration.dragAndDropEnabled = this.configurationService.getValue(NotebookSetting.dragAndDropEnabled) ?? true;
    }
    if (fontSize) {
      configuration.fontSize = this.configurationService.getValue("editor.fontSize");
    }
    if (outputFontSize || fontSize) {
      configuration.outputFontSize = this.configurationService.getValue(NotebookSetting.outputFontSize) || configuration.fontSize;
    }
    if (markupFontSize) {
      configuration.markupFontSize = this.configurationService.getValue(NotebookSetting.markupFontSize);
    }
    if (markdownLineHeight) {
      configuration.markdownLineHeight = this.configurationService.getValue(NotebookSetting.markdownLineHeight);
    }
    if (outputFontFamily) {
      configuration.outputFontFamily = this.configurationService.getValue(NotebookSetting.outputFontFamily);
    }
    if (editorOptionsCustomizations) {
      configuration.editorOptionsCustomizations = this.configurationService.getValue(NotebookSetting.cellEditorOptionsCustomizations);
    }
    if (interactiveWindowCollapseCodeCells) {
      configuration.interactiveWindowCollapseCodeCells = this.configurationService.getValue(NotebookSetting.interactiveWindowCollapseCodeCells);
    }
    if (outputLineHeight || fontSize || outputFontSize) {
      const lineHeight = this.configurationService.getValue(NotebookSetting.outputLineHeight);
      configuration.outputLineHeight = this._computeOutputLineHeight(lineHeight, configuration.outputFontSize);
    }
    if (outputWordWrap) {
      configuration.outputWordWrap = this.configurationService.getValue(NotebookSetting.outputWordWrap);
    }
    if (outputScrolling) {
      configuration.outputScrolling = this.configurationService.getValue(NotebookSetting.outputScrolling);
    }
    if (outputLinkifyFilePaths) {
      configuration.outputLinkifyFilePaths = this.configurationService.getValue(NotebookSetting.LinkifyOutputFilePaths);
    }
    if (minimalError) {
      configuration.outputMinimalError = this.configurationService.getValue(NotebookSetting.minimalErrorRendering);
    }
    if (markupFontFamily) {
      configuration.markupFontFamily = this.configurationService.getValue(NotebookSetting.markupFontFamily);
    }
    this._layoutConfiguration = Object.freeze(configuration);
    this._onDidChangeOptions.fire({
      cellStatusBarVisibility,
      cellToolbarLocation,
      cellToolbarInteraction,
      compactView,
      focusIndicator,
      insertToolbarPosition,
      insertToolbarAlignment,
      globalToolbar,
      stickyScrollEnabled,
      stickyScrollMode,
      showFoldingControls,
      consolidatedOutputButton,
      consolidatedRunButton,
      dragAndDropEnabled,
      fontSize,
      outputFontSize,
      markupFontSize,
      markdownLineHeight,
      fontFamily,
      outputFontFamily,
      editorOptionsCustomizations,
      interactiveWindowCollapseCodeCells,
      outputLineHeight,
      outputScrolling,
      outputWordWrap,
      outputLinkifyFilePaths,
      minimalError,
      markupFontFamily
    });
  }
  _computeInsertToolbarPositionOption(isReadOnly) {
    return isReadOnly ? "hidden" : this.configurationService.getValue(NotebookSetting.insertToolbarLocation) ?? "both";
  }
  _computeInsertToolbarAlignmentOption() {
    return this.configurationService.getValue(NotebookSetting.experimentalInsertToolbarAlignment) ?? "center";
  }
  _computeShowFoldingControlsOption() {
    return this.configurationService.getValue(NotebookSetting.showFoldingControls) ?? "mouseover";
  }
  _computeFocusIndicatorOption() {
    return this.configurationService.getValue(NotebookSetting.focusIndicator) ?? "gutter";
  }
  _computeStickyScrollModeOption() {
    return this.configurationService.getValue(NotebookSetting.stickyScrollMode) ?? "flat";
  }
  getCellCollapseDefault() {
    return this._layoutConfiguration.interactiveWindowCollapseCodeCells === "never" ? {
      codeCell: {
        inputCollapsed: false
      }
    } : {
      codeCell: {
        inputCollapsed: true
      }
    };
  }
  getLayoutConfiguration() {
    return this._layoutConfiguration;
  }
  getDisplayOptions() {
    return this._layoutConfiguration;
  }
  getCellEditorContainerLeftMargin() {
    const {
      codeCellLeftMargin,
      cellRunGutter
    } = this._layoutConfiguration;
    return codeCellLeftMargin + cellRunGutter;
  }
  computeCollapsedMarkdownCellHeight(viewType) {
    const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
    return this._layoutConfiguration.markdownCellTopMargin + this._layoutConfiguration.collapsedIndicatorHeight + bottomToolbarGap + this._layoutConfiguration.markdownCellBottomMargin;
  }
  computeBottomToolbarOffset(totalHeight, viewType) {
    const { bottomToolbarGap, bottomToolbarHeight } = this.computeBottomToolbarDimensions(viewType);
    return totalHeight - bottomToolbarGap - bottomToolbarHeight / 2;
  }
  computeCodeCellEditorWidth(outerWidth) {
    return outerWidth - (this._layoutConfiguration.codeCellLeftMargin + this._layoutConfiguration.cellRunGutter + this._layoutConfiguration.cellRightMargin);
  }
  computeMarkdownCellEditorWidth(outerWidth) {
    return outerWidth - this._layoutConfiguration.markdownCellGutter - this._layoutConfiguration.markdownCellLeftMargin - this._layoutConfiguration.cellRightMargin;
  }
  computeStatusBarHeight() {
    return this._layoutConfiguration.cellStatusBarHeight;
  }
  _computeBottomToolbarDimensions(compactView, insertToolbarPosition, insertToolbarAlignment, cellToolbar) {
    if (insertToolbarAlignment === "left" || cellToolbar !== "hidden") {
      return {
        bottomToolbarGap: 18,
        bottomToolbarHeight: 18
      };
    }
    if (insertToolbarPosition === "betweenCells" || insertToolbarPosition === "both") {
      return compactView ? {
        bottomToolbarGap: 12,
        bottomToolbarHeight: 20
      } : {
        bottomToolbarGap: 20,
        bottomToolbarHeight: 20
      };
    } else {
      return {
        bottomToolbarGap: 0,
        bottomToolbarHeight: 0
      };
    }
  }
  computeBottomToolbarDimensions(viewType) {
    const configuration = this._layoutConfiguration;
    const cellToolbarPosition = this.computeCellToolbarLocation(viewType);
    const { bottomToolbarGap, bottomToolbarHeight } = this._computeBottomToolbarDimensions(configuration.compactView, configuration.insertToolbarPosition, configuration.insertToolbarAlignment, cellToolbarPosition);
    return {
      bottomToolbarGap,
      bottomToolbarHeight
    };
  }
  computeCellToolbarLocation(viewType) {
    const cellToolbarLocation = this._layoutConfiguration.cellToolbarLocation;
    if (typeof cellToolbarLocation === "string") {
      if (cellToolbarLocation === "left" || cellToolbarLocation === "right" || cellToolbarLocation === "hidden") {
        return cellToolbarLocation;
      }
    } else {
      if (viewType) {
        const notebookSpecificSetting = cellToolbarLocation[viewType] ?? cellToolbarLocation["default"];
        let cellToolbarLocationForCurrentView = "right";
        switch (notebookSpecificSetting) {
          case "left":
            cellToolbarLocationForCurrentView = "left";
            break;
          case "right":
            cellToolbarLocationForCurrentView = "right";
            break;
          case "hidden":
            cellToolbarLocationForCurrentView = "hidden";
            break;
          default:
            cellToolbarLocationForCurrentView = "right";
            break;
        }
        return cellToolbarLocationForCurrentView;
      }
    }
    return "right";
  }
  computeTopInsertToolbarHeight(viewType) {
    if (this._layoutConfiguration.insertToolbarPosition === "betweenCells" || this._layoutConfiguration.insertToolbarPosition === "both") {
      return SCROLLABLE_ELEMENT_PADDING_TOP;
    }
    const cellToolbarLocation = this.computeCellToolbarLocation(viewType);
    if (cellToolbarLocation === "left" || cellToolbarLocation === "right") {
      return SCROLLABLE_ELEMENT_PADDING_TOP;
    }
    return 0;
  }
  computeEditorPadding(internalMetadata, cellUri) {
    return {
      top: this._editorTopPadding,
      bottom: this.statusBarIsVisible(internalMetadata, cellUri) ? this._layoutConfiguration.editorBottomPadding : this._layoutConfiguration.editorBottomPaddingWithoutStatusBar
    };
  }
  computeEditorStatusbarHeight(internalMetadata, cellUri) {
    return this.statusBarIsVisible(internalMetadata, cellUri) ? this.computeStatusBarHeight() : 0;
  }
  statusBarIsVisible(internalMetadata, cellUri) {
    const exe = this.notebookExecutionStateService.getCellExecution(cellUri);
    if (this._layoutConfiguration.showCellStatusBar === "visible") {
      return true;
    } else if (this._layoutConfiguration.showCellStatusBar === "visibleAfterExecute") {
      return typeof internalMetadata.lastRunSuccess === "boolean" || exe !== void 0;
    } else {
      return false;
    }
  }
  computeWebviewOptions() {
    return {
      outputNodePadding: this._layoutConfiguration.cellOutputPadding,
      outputNodeLeftPadding: this._layoutConfiguration.cellOutputPadding,
      previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
      markdownLeftMargin: this._layoutConfiguration.markdownCellGutter + this._layoutConfiguration.markdownCellLeftMargin,
      leftMargin: this._layoutConfiguration.codeCellLeftMargin,
      rightMargin: this._layoutConfiguration.cellRightMargin,
      runGutter: this._layoutConfiguration.cellRunGutter,
      dragAndDropEnabled: this._layoutConfiguration.dragAndDropEnabled,
      fontSize: this._layoutConfiguration.fontSize,
      outputFontSize: this._layoutConfiguration.outputFontSize,
      outputFontFamily: this._layoutConfiguration.outputFontFamily,
      markupFontSize: this._layoutConfiguration.markupFontSize,
      markdownLineHeight: this._layoutConfiguration.markdownLineHeight,
      outputLineHeight: this._layoutConfiguration.outputLineHeight,
      outputScrolling: this._layoutConfiguration.outputScrolling,
      outputWordWrap: this._layoutConfiguration.outputWordWrap,
      outputLineLimit: this._layoutConfiguration.outputLineLimit,
      outputLinkifyFilePaths: this._layoutConfiguration.outputLinkifyFilePaths,
      minimalError: this._layoutConfiguration.outputMinimalError,
      markupFontFamily: this._layoutConfiguration.markupFontFamily
    };
  }
  computeDiffWebviewOptions() {
    return {
      outputNodePadding: this._layoutConfiguration.cellOutputPadding,
      outputNodeLeftPadding: 0,
      previewNodePadding: this._layoutConfiguration.markdownPreviewPadding,
      markdownLeftMargin: 0,
      leftMargin: 32,
      rightMargin: 0,
      runGutter: 0,
      dragAndDropEnabled: false,
      fontSize: this._layoutConfiguration.fontSize,
      outputFontSize: this._layoutConfiguration.outputFontSize,
      outputFontFamily: this._layoutConfiguration.outputFontFamily,
      markupFontSize: this._layoutConfiguration.markupFontSize,
      markdownLineHeight: this._layoutConfiguration.markdownLineHeight,
      outputLineHeight: this._layoutConfiguration.outputLineHeight,
      outputScrolling: this._layoutConfiguration.outputScrolling,
      outputWordWrap: this._layoutConfiguration.outputWordWrap,
      outputLineLimit: this._layoutConfiguration.outputLineLimit,
      outputLinkifyFilePaths: false,
      minimalError: false,
      markupFontFamily: this._layoutConfiguration.markupFontFamily
    };
  }
  computeIndicatorPosition(totalHeight, foldHintHeight, viewType) {
    const { bottomToolbarGap } = this.computeBottomToolbarDimensions(viewType);
    return {
      bottomIndicatorTop: totalHeight - bottomToolbarGap - this._layoutConfiguration.cellBottomMargin - foldHintHeight,
      verticalIndicatorHeight: totalHeight - bottomToolbarGap - foldHintHeight
    };
  }
};
NotebookOptions = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, INotebookExecutionStateService),
  __decorateParam(5, ICodeEditorService)
], NotebookOptions);
export {
  NotebookOptions,
  OutputInnerContainerTopPadding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxub3RlYm9va09wdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQaXhlbFJhdGlvIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3BpeGVsUmF0aW8uanMnO1xuaW1wb3J0IHsgQ29kZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBGb250TWVhc3VyZW1lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2ZvbnRNZWFzdXJlbWVudHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJhcmVGb250SW5mb0Zyb21SYXdTZXR0aW5ncyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvRnJvbVNldHRpbmdzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscywgTm90ZWJvb2tDZWxsRGVmYXVsdENvbGxhcHNlQ29uZmlnLCBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhLCBOb3RlYm9va1NldHRpbmcsIFNob3dDZWxsU3RhdHVzQmFyVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UuanMnO1xuXG5jb25zdCBTQ1JPTExBQkxFX0VMRU1FTlRfUEFERElOR19UT1AgPSAxODtcblxuZXhwb3J0IGNvbnN0IE91dHB1dElubmVyQ29udGFpbmVyVG9wUGFkZGluZyA9IDQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tEaXNwbGF5T3B0aW9ucyB7IC8vIFRPRE8gQFlveW9rcmF6eSByZW5hbWUgdG8gYSBtb3JlIGdlbmVyaWMgbmFtZSwgbm90IGRpc3BsYXlcblx0c2hvd0NlbGxTdGF0dXNCYXI6IFNob3dDZWxsU3RhdHVzQmFyVHlwZTtcblx0Y2VsbFRvb2xiYXJMb2NhdGlvbjogc3RyaW5nIHwgeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcblx0Y2VsbFRvb2xiYXJJbnRlcmFjdGlvbjogc3RyaW5nO1xuXHRjb21wYWN0VmlldzogYm9vbGVhbjtcblx0Zm9jdXNJbmRpY2F0b3I6ICdib3JkZXInIHwgJ2d1dHRlcic7XG5cdGluc2VydFRvb2xiYXJQb3NpdGlvbjogJ2JldHdlZW5DZWxscycgfCAnbm90ZWJvb2tUb29sYmFyJyB8ICdib3RoJyB8ICdoaWRkZW4nO1xuXHRpbnNlcnRUb29sYmFyQWxpZ25tZW50OiAnbGVmdCcgfCAnY2VudGVyJztcblx0Z2xvYmFsVG9vbGJhcjogYm9vbGVhbjtcblx0c3RpY2t5U2Nyb2xsRW5hYmxlZDogYm9vbGVhbjtcblx0c3RpY2t5U2Nyb2xsTW9kZTogJ2ZsYXQnIHwgJ2luZGVudGVkJztcblx0Y29uc29saWRhdGVkT3V0cHV0QnV0dG9uOiBib29sZWFuO1xuXHRjb25zb2xpZGF0ZWRSdW5CdXR0b246IGJvb2xlYW47XG5cdHNob3dGb2xkaW5nQ29udHJvbHM6ICdhbHdheXMnIHwgJ25ldmVyJyB8ICdtb3VzZW92ZXInO1xuXHRkcmFnQW5kRHJvcEVuYWJsZWQ6IGJvb2xlYW47XG5cdGludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHM6IEludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHM7XG5cdG91dHB1dFNjcm9sbGluZzogYm9vbGVhbjtcblx0b3V0cHV0V29yZFdyYXA6IGJvb2xlYW47XG5cdG91dHB1dExpbmVMaW1pdDogbnVtYmVyO1xuXHRvdXRwdXRMaW5raWZ5RmlsZVBhdGhzOiBib29sZWFuO1xuXHRvdXRwdXRNaW5pbWFsRXJyb3I6IGJvb2xlYW47XG5cdGZvbnRTaXplOiBudW1iZXI7XG5cdG91dHB1dEZvbnRTaXplOiBudW1iZXI7XG5cdG91dHB1dEZvbnRGYW1pbHk6IHN0cmluZztcblx0b3V0cHV0TGluZUhlaWdodDogbnVtYmVyO1xuXHRtYXJrdXBGb250U2l6ZTogbnVtYmVyO1xuXHRtYXJrZG93bkxpbmVIZWlnaHQ6IG51bWJlcjtcblx0ZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zOiBQYXJ0aWFsPHtcblx0XHQnZWRpdG9yLmluZGVudFNpemUnOiAndGFiU2l6ZScgfCBudW1iZXI7XG5cdFx0J2VkaXRvci50YWJTaXplJzogbnVtYmVyO1xuXHRcdCdlZGl0b3IuaW5zZXJ0U3BhY2VzJzogYm9vbGVhbjtcblx0fT4gfCB1bmRlZmluZWQ7XG5cdG1hcmt1cEZvbnRGYW1pbHk6IHN0cmluZztcblx0ZGlzYWJsZVJ1bGVyczogYm9vbGVhbiB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0xheW91dENvbmZpZ3VyYXRpb24ge1xuXHRjZWxsUmlnaHRNYXJnaW46IG51bWJlcjtcblx0Y2VsbFJ1bkd1dHRlcjogbnVtYmVyO1xuXHRjZWxsVG9wTWFyZ2luOiBudW1iZXI7XG5cdGNlbGxCb3R0b21NYXJnaW46IG51bWJlcjtcblx0Y2VsbE91dHB1dFBhZGRpbmc6IG51bWJlcjtcblx0Y29kZUNlbGxMZWZ0TWFyZ2luOiBudW1iZXI7XG5cdG1hcmtkb3duQ2VsbExlZnRNYXJnaW46IG51bWJlcjtcblx0bWFya2Rvd25DZWxsR3V0dGVyOiBudW1iZXI7XG5cdG1hcmtkb3duQ2VsbFRvcE1hcmdpbjogbnVtYmVyO1xuXHRtYXJrZG93bkNlbGxCb3R0b21NYXJnaW46IG51bWJlcjtcblx0bWFya2Rvd25QcmV2aWV3UGFkZGluZzogbnVtYmVyO1xuXHRtYXJrZG93bkZvbGRIaW50SGVpZ2h0OiBudW1iZXI7XG5cdGVkaXRvclRvb2xiYXJIZWlnaHQ6IG51bWJlcjtcblx0ZWRpdG9yVG9wUGFkZGluZzogbnVtYmVyO1xuXHRlZGl0b3JCb3R0b21QYWRkaW5nOiBudW1iZXI7XG5cdGVkaXRvckJvdHRvbVBhZGRpbmdXaXRob3V0U3RhdHVzQmFyOiBudW1iZXI7XG5cdGNvbGxhcHNlZEluZGljYXRvckhlaWdodDogbnVtYmVyO1xuXHRjZWxsU3RhdHVzQmFySGVpZ2h0OiBudW1iZXI7XG5cdGZvY3VzSW5kaWNhdG9yTGVmdE1hcmdpbjogbnVtYmVyO1xuXHRmb2N1c0luZGljYXRvckdhcDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rT3B0aW9uc0NoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgY2VsbFN0YXR1c0JhclZpc2liaWxpdHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBjZWxsVG9vbGJhckxvY2F0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGVkaXRvclRvcFBhZGRpbmc/OiBib29sZWFuO1xuXHRyZWFkb25seSBjb21wYWN0Vmlldz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGZvY3VzSW5kaWNhdG9yPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5zZXJ0VG9vbGJhclBvc2l0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5zZXJ0VG9vbGJhckFsaWdubWVudD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGdsb2JhbFRvb2xiYXI/OiBib29sZWFuO1xuXHRyZWFkb25seSBzdGlja3lTY3JvbGxFbmFibGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3RpY2t5U2Nyb2xsTW9kZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dGb2xkaW5nQ29udHJvbHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBjb25zb2xpZGF0ZWRPdXRwdXRCdXR0b24/OiBib29sZWFuO1xuXHRyZWFkb25seSBjb25zb2xpZGF0ZWRSdW5CdXR0b24/OiBib29sZWFuO1xuXHRyZWFkb25seSBkcmFnQW5kRHJvcEVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBmb250U2l6ZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG91dHB1dEZvbnRTaXplPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWFya3VwRm9udFNpemU/OiBib29sZWFuO1xuXHRyZWFkb25seSBtYXJrZG93bkxpbmVIZWlnaHQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBmb250RmFtaWx5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0Rm9udEZhbWlseT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHM/OiBib29sZWFuO1xuXHRyZWFkb25seSBvdXRwdXRMaW5lSGVpZ2h0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3V0cHV0V29yZFdyYXA/OiBib29sZWFuO1xuXHRyZWFkb25seSBvdXRwdXRTY3JvbGxpbmc/OiBib29sZWFuO1xuXHRyZWFkb25seSBvdXRwdXRMaW5raWZ5RmlsZVBhdGhzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWluaW1hbEVycm9yPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcmVhZG9ubHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBtYXJrdXBGb250RmFtaWx5PzogYm9vbGVhbjtcbn1cblxuY29uc3QgZGVmYXVsdENvbmZpZ0NvbnN0YW50cyA9IE9iamVjdC5mcmVlemUoe1xuXHRjb2RlQ2VsbExlZnRNYXJnaW46IDI4LFxuXHRjZWxsUnVuR3V0dGVyOiAzMixcblx0bWFya2Rvd25DZWxsVG9wTWFyZ2luOiA4LFxuXHRtYXJrZG93bkNlbGxCb3R0b21NYXJnaW46IDgsXG5cdG1hcmtkb3duQ2VsbExlZnRNYXJnaW46IDAsXG5cdG1hcmtkb3duQ2VsbEd1dHRlcjogMzIsXG5cdGZvY3VzSW5kaWNhdG9yTGVmdE1hcmdpbjogNFxufSk7XG5cbmNvbnN0IGNvbXBhY3RDb25maWdDb25zdGFudHMgPSBPYmplY3QuZnJlZXplKHtcblx0Y29kZUNlbGxMZWZ0TWFyZ2luOiA4LFxuXHRjZWxsUnVuR3V0dGVyOiAzNixcblx0bWFya2Rvd25DZWxsVG9wTWFyZ2luOiA2LFxuXHRtYXJrZG93bkNlbGxCb3R0b21NYXJnaW46IDYsXG5cdG1hcmtkb3duQ2VsbExlZnRNYXJnaW46IDgsXG5cdG1hcmtkb3duQ2VsbEd1dHRlcjogMzYsXG5cdGZvY3VzSW5kaWNhdG9yTGVmdE1hcmdpbjogNFxufSk7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va09wdGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfbGF5b3V0Q29uZmlndXJhdGlvbjogTm90ZWJvb2tMYXlvdXRDb25maWd1cmF0aW9uICYgTm90ZWJvb2tEaXNwbGF5T3B0aW9ucztcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxOb3RlYm9va09wdGlvbnNDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlT3B0aW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9ucy5ldmVudDtcblx0cHJpdmF0ZSBfZWRpdG9yVG9wUGFkZGluZzogbnVtYmVyID0gMTI7XG5cblx0cmVhZG9ubHkgcHJldmlvdXNNb2RlbFRvQ29tcGFyZSA9IG9ic2VydmFibGVWYWx1ZTxOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZD4oJ3ByZXZpb3VzTW9kZWxUb0NvbXBhcmUnLCB1bmRlZmluZWQpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHRhcmdldFdpbmRvdzogQ29kZVdpbmRvdyxcblx0XHRwcml2YXRlIGlzUmVhZG9ubHk6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvdmVycmlkZXM6IHsgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbjogc3RyaW5nOyBnbG9iYWxUb29sYmFyOiBib29sZWFuOyBzdGlja3lTY3JvbGxFbmFibGVkOiBib29sZWFuOyBkcmFnQW5kRHJvcEVuYWJsZWQ6IGJvb2xlYW47IGRpc2FibGVSdWxlcnM6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBzaG93Q2VsbFN0YXR1c0JhciA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8U2hvd0NlbGxTdGF0dXNCYXJUeXBlPihOb3RlYm9va1NldHRpbmcuc2hvd0NlbGxTdGF0dXNCYXIpO1xuXHRcdGNvbnN0IGdsb2JhbFRvb2xiYXIgPSBvdmVycmlkZXM/Lmdsb2JhbFRvb2xiYXIgPz8gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuIHwgdW5kZWZpbmVkPihOb3RlYm9va1NldHRpbmcuZ2xvYmFsVG9vbGJhcikgPz8gdHJ1ZTtcblx0XHRjb25zdCBzdGlja3lTY3JvbGxFbmFibGVkID0gb3ZlcnJpZGVzPy5zdGlja3lTY3JvbGxFbmFibGVkID8/IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oTm90ZWJvb2tTZXR0aW5nLnN0aWNreVNjcm9sbEVuYWJsZWQpID8/IGZhbHNlO1xuXHRcdGNvbnN0IHN0aWNreVNjcm9sbE1vZGUgPSB0aGlzLl9jb21wdXRlU3RpY2t5U2Nyb2xsTW9kZU9wdGlvbigpO1xuXHRcdGNvbnN0IGNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oTm90ZWJvb2tTZXR0aW5nLmNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbikgPz8gdHJ1ZTtcblx0XHRjb25zdCBjb25zb2xpZGF0ZWRSdW5CdXR0b24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KE5vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRSdW5CdXR0b24pID8/IGZhbHNlO1xuXHRcdGNvbnN0IGRyYWdBbmREcm9wRW5hYmxlZCA9IG92ZXJyaWRlcz8uZHJhZ0FuZERyb3BFbmFibGVkID8/IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oTm90ZWJvb2tTZXR0aW5nLmRyYWdBbmREcm9wRW5hYmxlZCkgPz8gdHJ1ZTtcblx0XHRjb25zdCBjZWxsVG9vbGJhckxvY2F0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmcgfCB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9PihOb3RlYm9va1NldHRpbmcuY2VsbFRvb2xiYXJMb2NhdGlvbikgPz8geyAnZGVmYXVsdCc6ICdyaWdodCcgfTtcblx0XHRjb25zdCBjZWxsVG9vbGJhckludGVyYWN0aW9uID0gb3ZlcnJpZGVzPy5jZWxsVG9vbGJhckludGVyYWN0aW9uID8/IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihOb3RlYm9va1NldHRpbmcuY2VsbFRvb2xiYXJWaXNpYmlsaXR5KTtcblx0XHRjb25zdCBjb21wYWN0VmlldyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbiB8IHVuZGVmaW5lZD4oTm90ZWJvb2tTZXR0aW5nLmNvbXBhY3RWaWV3KSA/PyB0cnVlO1xuXHRcdGNvbnN0IGZvY3VzSW5kaWNhdG9yID0gdGhpcy5fY29tcHV0ZUZvY3VzSW5kaWNhdG9yT3B0aW9uKCk7XG5cdFx0Y29uc3QgaW5zZXJ0VG9vbGJhclBvc2l0aW9uID0gdGhpcy5fY29tcHV0ZUluc2VydFRvb2xiYXJQb3NpdGlvbk9wdGlvbih0aGlzLmlzUmVhZG9ubHkpO1xuXHRcdGNvbnN0IGluc2VydFRvb2xiYXJBbGlnbm1lbnQgPSB0aGlzLl9jb21wdXRlSW5zZXJ0VG9vbGJhckFsaWdubWVudE9wdGlvbigpO1xuXHRcdGNvbnN0IHNob3dGb2xkaW5nQ29udHJvbHMgPSB0aGlzLl9jb21wdXRlU2hvd0ZvbGRpbmdDb250cm9sc09wdGlvbigpO1xuXHRcdC8vIGNvbnN0IHsgYm90dG9tVG9vbGJhckdhcCwgYm90dG9tVG9vbGJhckhlaWdodCB9ID0gdGhpcy5fY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKGNvbXBhY3RWaWV3LCBpbnNlcnRUb29sYmFyUG9zaXRpb24sIGluc2VydFRvb2xiYXJBbGlnbm1lbnQpO1xuXHRcdGNvbnN0IGZvbnRTaXplID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdlZGl0b3IuZm9udFNpemUnKTtcblx0XHRjb25zdCBtYXJrdXBGb250U2l6ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcubWFya3VwRm9udFNpemUpO1xuXHRcdGNvbnN0IG1hcmtkb3duTGluZUhlaWdodCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcubWFya2Rvd25MaW5lSGVpZ2h0KTtcblx0XHRsZXQgZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxQYXJ0aWFsPHtcblx0XHRcdCdlZGl0b3IuaW5kZW50U2l6ZSc6ICd0YWJTaXplJyB8IG51bWJlcjtcblx0XHRcdCdlZGl0b3IudGFiU2l6ZSc6IG51bWJlcjtcblx0XHRcdCdlZGl0b3IuaW5zZXJ0U3BhY2VzJzogYm9vbGVhbjtcblx0XHR9Pj4oTm90ZWJvb2tTZXR0aW5nLmNlbGxFZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMpID8/IHt9O1xuXHRcdGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucyA9IGlzT2JqZWN0KGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucykgPyBlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMgOiB7fTtcblx0XHRjb25zdCBpbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzOiBJbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcuaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyk7XG5cblx0XHRjb25zdCBvdXRwdXRMaW5lSGVpZ2h0U2V0dGluZ1ZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KE5vdGVib29rU2V0dGluZy5vdXRwdXRMaW5lSGVpZ2h0KTtcblx0XHRjb25zdCBvdXRwdXRGb250U2l6ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcub3V0cHV0Rm9udFNpemUpIHx8IGZvbnRTaXplO1xuXHRcdGNvbnN0IG91dHB1dEZvbnRGYW1pbHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEZvbnRGYW1pbHkpO1xuXHRcdGNvbnN0IG91dHB1dFNjcm9sbGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dFNjcm9sbGluZyk7XG5cblx0XHRjb25zdCBvdXRwdXRMaW5lSGVpZ2h0ID0gdGhpcy5fY29tcHV0ZU91dHB1dExpbmVIZWlnaHQob3V0cHV0TGluZUhlaWdodFNldHRpbmdWYWx1ZSwgb3V0cHV0Rm9udFNpemUpO1xuXHRcdGNvbnN0IG91dHB1dFdvcmRXcmFwID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0cHV0V29yZFdyYXApO1xuXHRcdGNvbnN0IG91dHB1dExpbmVMaW1pdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcudGV4dE91dHB1dExpbmVMaW1pdCkgPz8gMzA7XG5cdFx0Y29uc3QgbGlua2lmeUZpbGVQYXRocyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLkxpbmtpZnlPdXRwdXRGaWxlUGF0aHMpID8/IHRydWU7XG5cdFx0Y29uc3QgbWluaW1hbEVycm9ycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm1pbmltYWxFcnJvclJlbmRlcmluZyk7XG5cdFx0Y29uc3QgbWFya3VwRm9udEZhbWlseSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihOb3RlYm9va1NldHRpbmcubWFya3VwRm9udEZhbWlseSk7XG5cblx0XHRjb25zdCBlZGl0b3JUb3BQYWRkaW5nID0gdGhpcy5fY29tcHV0ZUVkaXRvclRvcFBhZGRpbmcoKTtcblxuXHRcdHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHQuLi4oY29tcGFjdFZpZXcgPyBjb21wYWN0Q29uZmlnQ29uc3RhbnRzIDogZGVmYXVsdENvbmZpZ0NvbnN0YW50cyksXG5cdFx0XHRjZWxsVG9wTWFyZ2luOiA2LFxuXHRcdFx0Y2VsbEJvdHRvbU1hcmdpbjogNixcblx0XHRcdGNlbGxSaWdodE1hcmdpbjogMTYsXG5cdFx0XHRjZWxsU3RhdHVzQmFySGVpZ2h0OiAyMixcblx0XHRcdGNlbGxPdXRwdXRQYWRkaW5nOiA4LFxuXHRcdFx0bWFya2Rvd25QcmV2aWV3UGFkZGluZzogOCxcblx0XHRcdC8vIGJvdHRvbVRvb2xiYXJIZWlnaHQ6IGJvdHRvbVRvb2xiYXJIZWlnaHQsXG5cdFx0XHQvLyBib3R0b21Ub29sYmFyR2FwOiBib3R0b21Ub29sYmFyR2FwLFxuXHRcdFx0ZWRpdG9yVG9vbGJhckhlaWdodDogMCxcblx0XHRcdGVkaXRvclRvcFBhZGRpbmc6IGVkaXRvclRvcFBhZGRpbmcsXG5cdFx0XHRlZGl0b3JCb3R0b21QYWRkaW5nOiA0LFxuXHRcdFx0ZWRpdG9yQm90dG9tUGFkZGluZ1dpdGhvdXRTdGF0dXNCYXI6IDEyLFxuXHRcdFx0Y29sbGFwc2VkSW5kaWNhdG9ySGVpZ2h0OiAyOCxcblx0XHRcdHNob3dDZWxsU3RhdHVzQmFyLFxuXHRcdFx0Z2xvYmFsVG9vbGJhcixcblx0XHRcdHN0aWNreVNjcm9sbEVuYWJsZWQsXG5cdFx0XHRzdGlja3lTY3JvbGxNb2RlLFxuXHRcdFx0Y29uc29saWRhdGVkT3V0cHV0QnV0dG9uLFxuXHRcdFx0Y29uc29saWRhdGVkUnVuQnV0dG9uLFxuXHRcdFx0ZHJhZ0FuZERyb3BFbmFibGVkLFxuXHRcdFx0Y2VsbFRvb2xiYXJMb2NhdGlvbixcblx0XHRcdGNlbGxUb29sYmFySW50ZXJhY3Rpb24sXG5cdFx0XHRjb21wYWN0Vmlldyxcblx0XHRcdGZvY3VzSW5kaWNhdG9yLFxuXHRcdFx0aW5zZXJ0VG9vbGJhclBvc2l0aW9uLFxuXHRcdFx0aW5zZXJ0VG9vbGJhckFsaWdubWVudCxcblx0XHRcdHNob3dGb2xkaW5nQ29udHJvbHMsXG5cdFx0XHRmb250U2l6ZSxcblx0XHRcdG91dHB1dEZvbnRTaXplLFxuXHRcdFx0b3V0cHV0Rm9udEZhbWlseSxcblx0XHRcdG91dHB1dExpbmVIZWlnaHQsXG5cdFx0XHRtYXJrdXBGb250U2l6ZSxcblx0XHRcdG1hcmtkb3duTGluZUhlaWdodCxcblx0XHRcdGVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucyxcblx0XHRcdGZvY3VzSW5kaWNhdG9yR2FwOiAzLFxuXHRcdFx0aW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyxcblx0XHRcdG1hcmtkb3duRm9sZEhpbnRIZWlnaHQ6IDIyLFxuXHRcdFx0b3V0cHV0U2Nyb2xsaW5nOiBvdXRwdXRTY3JvbGxpbmcsXG5cdFx0XHRvdXRwdXRXb3JkV3JhcDogb3V0cHV0V29yZFdyYXAsXG5cdFx0XHRvdXRwdXRMaW5lTGltaXQ6IG91dHB1dExpbmVMaW1pdCxcblx0XHRcdG91dHB1dExpbmtpZnlGaWxlUGF0aHM6IGxpbmtpZnlGaWxlUGF0aHMsXG5cdFx0XHRvdXRwdXRNaW5pbWFsRXJyb3I6IG1pbmltYWxFcnJvcnMsXG5cdFx0XHRtYXJrdXBGb250RmFtaWx5LFxuXHRcdFx0ZGlzYWJsZVJ1bGVyczogb3ZlcnJpZGVzPy5kaXNhYmxlUnVsZXJzLFxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZUNvbmZpZ3VyYXRpb24oZSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhpc1JlYWRvbmx5OiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuaXNSZWFkb25seSAhPT0gaXNSZWFkb25seSkge1xuXHRcdFx0dGhpcy5pc1JlYWRvbmx5ID0gaXNSZWFkb25seTtcblxuXHRcdFx0dGhpcy5fdXBkYXRlQ29uZmlndXJhdGlvbih7XG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uID09PSBOb3RlYm9va1NldHRpbmcuaW5zZXJ0VG9vbGJhckxvY2F0aW9uO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVCxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtOb3RlYm9va1NldHRpbmcuaW5zZXJ0VG9vbGJhckxvY2F0aW9uXSksXG5cdFx0XHRcdGNoYW5nZTogeyBrZXlzOiBbTm90ZWJvb2tTZXR0aW5nLmluc2VydFRvb2xiYXJMb2NhdGlvbl0sIG92ZXJyaWRlczogW10gfSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVFZGl0b3JUb3BQYWRkaW5nKCk6IG51bWJlciB7XG5cdFx0bGV0IGRlY29yYXRpb25UcmlnZ2VyZWRBZGp1c3RtZW50ID0gZmFsc2U7XG5cblx0XHRjb25zdCB1cGRhdGVFZGl0b3JUb3BQYWRkaW5nID0gKHRvcDogbnVtYmVyKSA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3JUb3BQYWRkaW5nID0gdG9wO1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24pO1xuXHRcdFx0Y29uZmlndXJhdGlvbi5lZGl0b3JUb3BQYWRkaW5nID0gdGhpcy5fZWRpdG9yVG9wUGFkZGluZztcblx0XHRcdHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VPcHRpb25zLmZpcmUoeyBlZGl0b3JUb3BQYWRkaW5nOiB0cnVlIH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBkZWNvcmF0aW9uQ2hlY2tTZXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBvbkRpZEFkZERlY29yYXRpb25UeXBlID0gKGU6IHN0cmluZykgPT4ge1xuXHRcdFx0aWYgKGRlY29yYXRpb25UcmlnZ2VyZWRBZGp1c3RtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRlY29yYXRpb25DaGVja1NldC5oYXMoZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZXNvbHZlRGVjb3JhdGlvbk9wdGlvbnMoZSwgdHJ1ZSk7XG5cdFx0XHRcdGlmIChvcHRpb25zLmFmdGVyQ29udGVudENsYXNzTmFtZSB8fCBvcHRpb25zLmJlZm9yZUNvbnRlbnRDbGFzc05hbWUpIHtcblx0XHRcdFx0XHRjb25zdCBjc3NSdWxlcyA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UucmVzb2x2ZURlY29yYXRpb25DU1NSdWxlcyhlKTtcblx0XHRcdFx0XHRpZiAoY3NzUnVsZXMgIT09IG51bGwpIHtcblx0XHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY3NzUnVsZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0Ly8gVGhlIGZvbGxvd2luZyB3YXlzIHRvIGluZGV4IGludG8gdGhlIGxpc3QgYXJlIGVxdWl2YWxlbnRcblx0XHRcdFx0XHRcdFx0aWYgKFxuXHRcdFx0XHRcdFx0XHRcdCgoY3NzUnVsZXNbaV0gYXMgQ1NTU3R5bGVSdWxlKS5zZWxlY3RvclRleHQuZW5kc1dpdGgoJzo6YWZ0ZXInKSB8fCAoY3NzUnVsZXNbaV0gYXMgQ1NTU3R5bGVSdWxlKS5zZWxlY3RvclRleHQuZW5kc1dpdGgoJzo6YWZ0ZXInKSlcblx0XHRcdFx0XHRcdFx0XHQmJiAoY3NzUnVsZXNbaV0gYXMgQ1NTU3R5bGVSdWxlKS5jc3NUZXh0LmluZGV4T2YoJ3RvcDonKSA+IC0xXG5cdFx0XHRcdFx0XHRcdCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHRoZXJlIGlzIGEgYDo6YmVmb3JlYCBvciBgOjphZnRlcmAgdGV4dCBkZWNvcmF0aW9uIHdob3NlIHBvc2l0aW9uIGlzIGFib3ZlIG9yIGJlbG93IGN1cnJlbnQgbGluZVxuXHRcdFx0XHRcdFx0XHRcdC8vIHdlIGF0IGxlYXN0IG1ha2Ugc3VyZSB0aGF0IHRoZSBlZGl0b3IgdG9wIHBhZGRpbmcgaXMgYXQgbGVhc3Qgb25lIGxpbmVcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBlZGl0b3JPcHRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpO1xuXHRcdFx0XHRcdFx0XHRcdHVwZGF0ZUVkaXRvclRvcFBhZGRpbmcoY3JlYXRlQmFyZUZvbnRJbmZvRnJvbVJhd1NldHRpbmdzKGVkaXRvck9wdGlvbnMsIFBpeGVsUmF0aW8uZ2V0SW5zdGFuY2UodGhpcy50YXJnZXRXaW5kb3cpLnZhbHVlKS5saW5lSGVpZ2h0ICsgMik7XG5cdFx0XHRcdFx0XHRcdFx0ZGVjb3JhdGlvblRyaWdnZXJlZEFkanVzdG1lbnQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGVjb3JhdGlvbkNoZWNrU2V0LmFkZChlKTtcblx0XHRcdH0gY2F0Y2ggKF9leCkge1xuXHRcdFx0XHQvLyBkbyBub3QgdGhyb3cgYW5kIGJyZWFrIG5vdGVib29rXG5cdFx0XHR9XG5cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29kZUVkaXRvclNlcnZpY2Uub25EZWNvcmF0aW9uVHlwZVJlZ2lzdGVyZWQob25EaWRBZGREZWNvcmF0aW9uVHlwZSkpO1xuXHRcdHRoaXMuY29kZUVkaXRvclNlcnZpY2UubGlzdERlY29yYXRpb25UeXBlcygpLmZvckVhY2gob25EaWRBZGREZWNvcmF0aW9uVHlwZSk7XG5cblx0XHRyZXR1cm4gdGhpcy5fZWRpdG9yVG9wUGFkZGluZztcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVPdXRwdXRMaW5lSGVpZ2h0KGxpbmVIZWlnaHQ6IG51bWJlciwgb3V0cHV0Rm9udFNpemU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbWluaW11bUxpbmVIZWlnaHQgPSA5O1xuXG5cdFx0aWYgKGxpbmVIZWlnaHQgPT09IDApIHtcblx0XHRcdC8vIHVzZSBlZGl0b3IgbGluZSBoZWlnaHRcblx0XHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElFZGl0b3JPcHRpb25zPignZWRpdG9yJyk7XG5cdFx0XHRjb25zdCBmb250SW5mbyA9IEZvbnRNZWFzdXJlbWVudHMucmVhZEZvbnRJbmZvKHRoaXMudGFyZ2V0V2luZG93LCBjcmVhdGVCYXJlRm9udEluZm9Gcm9tUmF3U2V0dGluZ3MoZWRpdG9yT3B0aW9ucywgUGl4ZWxSYXRpby5nZXRJbnN0YW5jZSh0aGlzLnRhcmdldFdpbmRvdykudmFsdWUpKTtcblx0XHRcdGxpbmVIZWlnaHQgPSBmb250SW5mby5saW5lSGVpZ2h0O1xuXHRcdH0gZWxzZSBpZiAobGluZUhlaWdodCA8IG1pbmltdW1MaW5lSGVpZ2h0KSB7XG5cdFx0XHQvLyBWYWx1ZXMgdG9vIHNtYWxsIHRvIGJlIGxpbmUgaGVpZ2h0cyBpbiBwaXhlbHMgYXJlIGluIGVtcy5cblx0XHRcdGxldCBmb250U2l6ZSA9IG91dHB1dEZvbnRTaXplO1xuXHRcdFx0aWYgKGZvbnRTaXplID09PSAwKSB7XG5cdFx0XHRcdGZvbnRTaXplID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdlZGl0b3IuZm9udFNpemUnKTtcblx0XHRcdH1cblxuXHRcdFx0bGluZUhlaWdodCA9IGxpbmVIZWlnaHQgKiBmb250U2l6ZTtcblx0XHR9XG5cblx0XHQvLyBFbmZvcmNlIGludGVnZXIsIG1pbmltdW0gY29uc3RyYWludHNcblx0XHRsaW5lSGVpZ2h0ID0gTWF0aC5yb3VuZChsaW5lSGVpZ2h0KTtcblx0XHRpZiAobGluZUhlaWdodCA8IG1pbmltdW1MaW5lSGVpZ2h0KSB7XG5cdFx0XHRsaW5lSGVpZ2h0ID0gbWluaW11bUxpbmVIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxpbmVIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDb25maWd1cmF0aW9uKGU6IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpIHtcblx0XHRjb25zdCBjZWxsU3RhdHVzQmFyVmlzaWJpbGl0eSA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLnNob3dDZWxsU3RhdHVzQmFyKTtcblx0XHRjb25zdCBjZWxsVG9vbGJhckxvY2F0aW9uID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuY2VsbFRvb2xiYXJMb2NhdGlvbik7XG5cdFx0Y29uc3QgY2VsbFRvb2xiYXJJbnRlcmFjdGlvbiA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmNlbGxUb29sYmFyVmlzaWJpbGl0eSk7XG5cdFx0Y29uc3QgY29tcGFjdFZpZXcgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5jb21wYWN0Vmlldyk7XG5cdFx0Y29uc3QgZm9jdXNJbmRpY2F0b3IgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5mb2N1c0luZGljYXRvcik7XG5cdFx0Y29uc3QgaW5zZXJ0VG9vbGJhclBvc2l0aW9uID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuaW5zZXJ0VG9vbGJhckxvY2F0aW9uKTtcblx0XHRjb25zdCBpbnNlcnRUb29sYmFyQWxpZ25tZW50ID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuZXhwZXJpbWVudGFsSW5zZXJ0VG9vbGJhckFsaWdubWVudCk7XG5cdFx0Y29uc3QgZ2xvYmFsVG9vbGJhciA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmdsb2JhbFRvb2xiYXIpO1xuXHRcdGNvbnN0IHN0aWNreVNjcm9sbEVuYWJsZWQgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5zdGlja3lTY3JvbGxFbmFibGVkKTtcblx0XHRjb25zdCBzdGlja3lTY3JvbGxNb2RlID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuc3RpY2t5U2Nyb2xsTW9kZSk7XG5cdFx0Y29uc3QgY29uc29saWRhdGVkT3V0cHV0QnV0dG9uID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuY29uc29saWRhdGVkT3V0cHV0QnV0dG9uKTtcblx0XHRjb25zdCBjb25zb2xpZGF0ZWRSdW5CdXR0b24gPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRSdW5CdXR0b24pO1xuXHRcdGNvbnN0IHNob3dGb2xkaW5nQ29udHJvbHMgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5zaG93Rm9sZGluZ0NvbnRyb2xzKTtcblx0XHRjb25zdCBkcmFnQW5kRHJvcEVuYWJsZWQgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5kcmFnQW5kRHJvcEVuYWJsZWQpO1xuXHRcdGNvbnN0IGZvbnRTaXplID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmZvbnRTaXplJyk7XG5cdFx0Y29uc3Qgb3V0cHV0Rm9udFNpemUgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5vdXRwdXRGb250U2l6ZSk7XG5cdFx0Y29uc3QgbWFya3VwRm9udFNpemUgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5tYXJrdXBGb250U2l6ZSk7XG5cdFx0Y29uc3QgbWFya2Rvd25MaW5lSGVpZ2h0ID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcubWFya2Rvd25MaW5lSGVpZ2h0KTtcblx0XHRjb25zdCBmb250RmFtaWx5ID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmZvbnRGYW1pbHknKTtcblx0XHRjb25zdCBvdXRwdXRGb250RmFtaWx5ID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0cHV0Rm9udEZhbWlseSk7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuY2VsbEVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucyk7XG5cdFx0Y29uc3QgaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMpO1xuXHRcdGNvbnN0IG91dHB1dExpbmVIZWlnaHQgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5vdXRwdXRMaW5lSGVpZ2h0KTtcblx0XHRjb25zdCBvdXRwdXRTY3JvbGxpbmcgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5vdXRwdXRTY3JvbGxpbmcpO1xuXHRcdGNvbnN0IG91dHB1dFdvcmRXcmFwID0gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0cHV0V29yZFdyYXApO1xuXHRcdGNvbnN0IG91dHB1dExpbmtpZnlGaWxlUGF0aHMgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5MaW5raWZ5T3V0cHV0RmlsZVBhdGhzKTtcblx0XHRjb25zdCBtaW5pbWFsRXJyb3IgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5taW5pbWFsRXJyb3JSZW5kZXJpbmcpO1xuXHRcdGNvbnN0IG1hcmt1cEZvbnRGYW1pbHkgPSBlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5tYXJrdXBGb250RmFtaWx5KTtcblxuXHRcdGlmIChcblx0XHRcdCFjZWxsU3RhdHVzQmFyVmlzaWJpbGl0eVxuXHRcdFx0JiYgIWNlbGxUb29sYmFyTG9jYXRpb25cblx0XHRcdCYmICFjZWxsVG9vbGJhckludGVyYWN0aW9uXG5cdFx0XHQmJiAhY29tcGFjdFZpZXdcblx0XHRcdCYmICFmb2N1c0luZGljYXRvclxuXHRcdFx0JiYgIWluc2VydFRvb2xiYXJQb3NpdGlvblxuXHRcdFx0JiYgIWluc2VydFRvb2xiYXJBbGlnbm1lbnRcblx0XHRcdCYmICFnbG9iYWxUb29sYmFyXG5cdFx0XHQmJiAhc3RpY2t5U2Nyb2xsRW5hYmxlZFxuXHRcdFx0JiYgIXN0aWNreVNjcm9sbE1vZGVcblx0XHRcdCYmICFjb25zb2xpZGF0ZWRPdXRwdXRCdXR0b25cblx0XHRcdCYmICFjb25zb2xpZGF0ZWRSdW5CdXR0b25cblx0XHRcdCYmICFzaG93Rm9sZGluZ0NvbnRyb2xzXG5cdFx0XHQmJiAhZHJhZ0FuZERyb3BFbmFibGVkXG5cdFx0XHQmJiAhZm9udFNpemVcblx0XHRcdCYmICFvdXRwdXRGb250U2l6ZVxuXHRcdFx0JiYgIW1hcmt1cEZvbnRTaXplXG5cdFx0XHQmJiAhbWFya2Rvd25MaW5lSGVpZ2h0XG5cdFx0XHQmJiAhZm9udEZhbWlseVxuXHRcdFx0JiYgIW91dHB1dEZvbnRGYW1pbHlcblx0XHRcdCYmICFlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnNcblx0XHRcdCYmICFpbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzXG5cdFx0XHQmJiAhb3V0cHV0TGluZUhlaWdodFxuXHRcdFx0JiYgIW91dHB1dFNjcm9sbGluZ1xuXHRcdFx0JiYgIW91dHB1dFdvcmRXcmFwXG5cdFx0XHQmJiAhb3V0cHV0TGlua2lmeUZpbGVQYXRoc1xuXHRcdFx0JiYgIW1pbmltYWxFcnJvclxuXHRcdFx0JiYgIW1hcmt1cEZvbnRGYW1pbHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgY29uZmlndXJhdGlvbiA9IE9iamVjdC5hc3NpZ24oe30sIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24pO1xuXG5cdFx0aWYgKGNlbGxTdGF0dXNCYXJWaXNpYmlsaXR5KSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLnNob3dDZWxsU3RhdHVzQmFyID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxTaG93Q2VsbFN0YXR1c0JhclR5cGU+KE5vdGVib29rU2V0dGluZy5zaG93Q2VsbFN0YXR1c0Jhcik7XG5cdFx0fVxuXG5cdFx0aWYgKGNlbGxUb29sYmFyTG9jYXRpb24pIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uY2VsbFRvb2xiYXJMb2NhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nIHwgeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfT4oTm90ZWJvb2tTZXR0aW5nLmNlbGxUb29sYmFyTG9jYXRpb24pID8/IHsgJ2RlZmF1bHQnOiAncmlnaHQnIH07XG5cdFx0fVxuXG5cdFx0aWYgKGNlbGxUb29sYmFySW50ZXJhY3Rpb24gJiYgIXRoaXMub3ZlcnJpZGVzPy5jZWxsVG9vbGJhckludGVyYWN0aW9uKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmNlbGxUb29sYmFySW50ZXJhY3Rpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oTm90ZWJvb2tTZXR0aW5nLmNlbGxUb29sYmFyVmlzaWJpbGl0eSk7XG5cdFx0fVxuXG5cdFx0aWYgKGZvY3VzSW5kaWNhdG9yKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmZvY3VzSW5kaWNhdG9yID0gdGhpcy5fY29tcHV0ZUZvY3VzSW5kaWNhdG9yT3B0aW9uKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbXBhY3RWaWV3KSB7XG5cdFx0XHRjb25zdCBjb21wYWN0Vmlld1ZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuIHwgdW5kZWZpbmVkPihOb3RlYm9va1NldHRpbmcuY29tcGFjdFZpZXcpID8/IHRydWU7XG5cdFx0XHRjb25maWd1cmF0aW9uID0gT2JqZWN0LmFzc2lnbihjb25maWd1cmF0aW9uLCB7XG5cdFx0XHRcdC4uLihjb21wYWN0Vmlld1ZhbHVlID8gY29tcGFjdENvbmZpZ0NvbnN0YW50cyA6IGRlZmF1bHRDb25maWdDb25zdGFudHMpLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25maWd1cmF0aW9uLmNvbXBhY3RWaWV3ID0gY29tcGFjdFZpZXdWYWx1ZTtcblx0XHR9XG5cblx0XHRpZiAoaW5zZXJ0VG9vbGJhckFsaWdubWVudCkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5pbnNlcnRUb29sYmFyQWxpZ25tZW50ID0gdGhpcy5fY29tcHV0ZUluc2VydFRvb2xiYXJBbGlnbm1lbnRPcHRpb24oKTtcblx0XHR9XG5cblx0XHRpZiAoaW5zZXJ0VG9vbGJhclBvc2l0aW9uKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmluc2VydFRvb2xiYXJQb3NpdGlvbiA9IHRoaXMuX2NvbXB1dGVJbnNlcnRUb29sYmFyUG9zaXRpb25PcHRpb24odGhpcy5pc1JlYWRvbmx5KTtcblx0XHR9XG5cblx0XHRpZiAoZ2xvYmFsVG9vbGJhciAmJiB0aGlzLm92ZXJyaWRlcz8uZ2xvYmFsVG9vbGJhciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmdsb2JhbFRvb2xiYXIgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5nbG9iYWxUb29sYmFyKSA/PyB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChzdGlja3lTY3JvbGxFbmFibGVkICYmIHRoaXMub3ZlcnJpZGVzPy5zdGlja3lTY3JvbGxFbmFibGVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uc3RpY2t5U2Nyb2xsRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLnN0aWNreVNjcm9sbEVuYWJsZWQpID8/IGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChzdGlja3lTY3JvbGxNb2RlKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLnN0aWNreVNjcm9sbE1vZGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdmbGF0JyB8ICdpbmRlbnRlZCc+KE5vdGVib29rU2V0dGluZy5zdGlja3lTY3JvbGxNb2RlKSA/PyAnZmxhdCc7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbikge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5jb25zb2xpZGF0ZWRPdXRwdXRCdXR0b24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRPdXRwdXRCdXR0b24pID8/IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnNvbGlkYXRlZFJ1bkJ1dHRvbikge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5jb25zb2xpZGF0ZWRSdW5CdXR0b24gPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5jb25zb2xpZGF0ZWRSdW5CdXR0b24pID8/IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHNob3dGb2xkaW5nQ29udHJvbHMpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uc2hvd0ZvbGRpbmdDb250cm9scyA9IHRoaXMuX2NvbXB1dGVTaG93Rm9sZGluZ0NvbnRyb2xzT3B0aW9uKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRyYWdBbmREcm9wRW5hYmxlZCkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5kcmFnQW5kRHJvcEVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5kcmFnQW5kRHJvcEVuYWJsZWQpID8/IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGZvbnRTaXplKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLmZvbnRTaXplID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdlZGl0b3IuZm9udFNpemUnKTtcblx0XHR9XG5cblx0XHRpZiAob3V0cHV0Rm9udFNpemUgfHwgZm9udFNpemUpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ub3V0cHV0Rm9udFNpemUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEZvbnRTaXplKSB8fCBjb25maWd1cmF0aW9uLmZvbnRTaXplO1xuXHRcdH1cblxuXHRcdGlmIChtYXJrdXBGb250U2l6ZSkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5tYXJrdXBGb250U2l6ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihOb3RlYm9va1NldHRpbmcubWFya3VwRm9udFNpemUpO1xuXHRcdH1cblxuXHRcdGlmIChtYXJrZG93bkxpbmVIZWlnaHQpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ubWFya2Rvd25MaW5lSGVpZ2h0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KE5vdGVib29rU2V0dGluZy5tYXJrZG93bkxpbmVIZWlnaHQpO1xuXHRcdH1cblxuXHRcdGlmIChvdXRwdXRGb250RmFtaWx5KSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLm91dHB1dEZvbnRGYW1pbHkgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEZvbnRGYW1pbHkpO1xuXHRcdH1cblxuXHRcdGlmIChlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShOb3RlYm9va1NldHRpbmcuY2VsbEVkaXRvck9wdGlvbnNDdXN0b21pemF0aW9ucyk7XG5cdFx0fVxuXG5cdFx0aWYgKGludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24uaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoTm90ZWJvb2tTZXR0aW5nLmludGVyYWN0aXZlV2luZG93Q29sbGFwc2VDb2RlQ2VsbHMpO1xuXHRcdH1cblxuXHRcdGlmIChvdXRwdXRMaW5lSGVpZ2h0IHx8IGZvbnRTaXplIHx8IG91dHB1dEZvbnRTaXplKSB7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KE5vdGVib29rU2V0dGluZy5vdXRwdXRMaW5lSGVpZ2h0KTtcblx0XHRcdGNvbmZpZ3VyYXRpb24ub3V0cHV0TGluZUhlaWdodCA9IHRoaXMuX2NvbXB1dGVPdXRwdXRMaW5lSGVpZ2h0KGxpbmVIZWlnaHQsIGNvbmZpZ3VyYXRpb24ub3V0cHV0Rm9udFNpemUpO1xuXHRcdH1cblxuXHRcdGlmIChvdXRwdXRXb3JkV3JhcCkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5vdXRwdXRXb3JkV3JhcCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dFdvcmRXcmFwKTtcblx0XHR9XG5cblx0XHRpZiAob3V0cHV0U2Nyb2xsaW5nKSB7XG5cdFx0XHRjb25maWd1cmF0aW9uLm91dHB1dFNjcm9sbGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dFNjcm9sbGluZyk7XG5cdFx0fVxuXG5cdFx0aWYgKG91dHB1dExpbmtpZnlGaWxlUGF0aHMpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ub3V0cHV0TGlua2lmeUZpbGVQYXRocyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLkxpbmtpZnlPdXRwdXRGaWxlUGF0aHMpO1xuXHRcdH1cblxuXHRcdGlmIChtaW5pbWFsRXJyb3IpIHtcblx0XHRcdGNvbmZpZ3VyYXRpb24ub3V0cHV0TWluaW1hbEVycm9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcubWluaW1hbEVycm9yUmVuZGVyaW5nKTtcblx0XHR9XG5cblx0XHRpZiAobWFya3VwRm9udEZhbWlseSkge1xuXHRcdFx0Y29uZmlndXJhdGlvbi5tYXJrdXBGb250RmFtaWx5ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KE5vdGVib29rU2V0dGluZy5tYXJrdXBGb250RmFtaWx5KTtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uID0gT2JqZWN0LmZyZWV6ZShjb25maWd1cmF0aW9uKTtcblxuXHRcdC8vIHRyaWdnZXIgZXZlbnRcblx0XHR0aGlzLl9vbkRpZENoYW5nZU9wdGlvbnMuZmlyZSh7XG5cdFx0XHRjZWxsU3RhdHVzQmFyVmlzaWJpbGl0eSxcblx0XHRcdGNlbGxUb29sYmFyTG9jYXRpb24sXG5cdFx0XHRjZWxsVG9vbGJhckludGVyYWN0aW9uLFxuXHRcdFx0Y29tcGFjdFZpZXcsXG5cdFx0XHRmb2N1c0luZGljYXRvcixcblx0XHRcdGluc2VydFRvb2xiYXJQb3NpdGlvbixcblx0XHRcdGluc2VydFRvb2xiYXJBbGlnbm1lbnQsXG5cdFx0XHRnbG9iYWxUb29sYmFyLFxuXHRcdFx0c3RpY2t5U2Nyb2xsRW5hYmxlZCxcblx0XHRcdHN0aWNreVNjcm9sbE1vZGUsXG5cdFx0XHRzaG93Rm9sZGluZ0NvbnRyb2xzLFxuXHRcdFx0Y29uc29saWRhdGVkT3V0cHV0QnV0dG9uLFxuXHRcdFx0Y29uc29saWRhdGVkUnVuQnV0dG9uLFxuXHRcdFx0ZHJhZ0FuZERyb3BFbmFibGVkLFxuXHRcdFx0Zm9udFNpemUsXG5cdFx0XHRvdXRwdXRGb250U2l6ZSxcblx0XHRcdG1hcmt1cEZvbnRTaXplLFxuXHRcdFx0bWFya2Rvd25MaW5lSGVpZ2h0LFxuXHRcdFx0Zm9udEZhbWlseSxcblx0XHRcdG91dHB1dEZvbnRGYW1pbHksXG5cdFx0XHRlZGl0b3JPcHRpb25zQ3VzdG9taXphdGlvbnMsXG5cdFx0XHRpbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzLFxuXHRcdFx0b3V0cHV0TGluZUhlaWdodCxcblx0XHRcdG91dHB1dFNjcm9sbGluZyxcblx0XHRcdG91dHB1dFdvcmRXcmFwLFxuXHRcdFx0b3V0cHV0TGlua2lmeUZpbGVQYXRocyxcblx0XHRcdG1pbmltYWxFcnJvcixcblx0XHRcdG1hcmt1cEZvbnRGYW1pbHlcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVJbnNlcnRUb29sYmFyUG9zaXRpb25PcHRpb24oaXNSZWFkT25seTogYm9vbGVhbikge1xuXHRcdHJldHVybiBpc1JlYWRPbmx5ID8gJ2hpZGRlbicgOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdiZXR3ZWVuQ2VsbHMnIHwgJ25vdGVib29rVG9vbGJhcicgfCAnYm90aCcgfCAnaGlkZGVuJz4oTm90ZWJvb2tTZXR0aW5nLmluc2VydFRvb2xiYXJMb2NhdGlvbikgPz8gJ2JvdGgnO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUluc2VydFRvb2xiYXJBbGlnbm1lbnRPcHRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2xlZnQnIHwgJ2NlbnRlcic+KE5vdGVib29rU2V0dGluZy5leHBlcmltZW50YWxJbnNlcnRUb29sYmFyQWxpZ25tZW50KSA/PyAnY2VudGVyJztcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVTaG93Rm9sZGluZ0NvbnRyb2xzT3B0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdhbHdheXMnIHwgJ25ldmVyJyB8ICdtb3VzZW92ZXInPihOb3RlYm9va1NldHRpbmcuc2hvd0ZvbGRpbmdDb250cm9scykgPz8gJ21vdXNlb3Zlcic7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlRm9jdXNJbmRpY2F0b3JPcHRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2JvcmRlcicgfCAnZ3V0dGVyJz4oTm90ZWJvb2tTZXR0aW5nLmZvY3VzSW5kaWNhdG9yKSA/PyAnZ3V0dGVyJztcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGVTdGlja3lTY3JvbGxNb2RlT3B0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdmbGF0JyB8ICdpbmRlbnRlZCc+KE5vdGVib29rU2V0dGluZy5zdGlja3lTY3JvbGxNb2RlKSA/PyAnZmxhdCc7XG5cdH1cblxuXHRnZXRDZWxsQ29sbGFwc2VEZWZhdWx0KCk6IE5vdGVib29rQ2VsbERlZmF1bHRDb2xsYXBzZUNvbmZpZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uaW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxscyA9PT0gJ25ldmVyJyA/XG5cdFx0XHR7XG5cdFx0XHRcdGNvZGVDZWxsOiB7XG5cdFx0XHRcdFx0aW5wdXRDb2xsYXBzZWQ6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdH0gOiB7XG5cdFx0XHRcdGNvZGVDZWxsOiB7XG5cdFx0XHRcdFx0aW5wdXRDb2xsYXBzZWQ6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0fVxuXG5cdGdldExheW91dENvbmZpZ3VyYXRpb24oKTogTm90ZWJvb2tMYXlvdXRDb25maWd1cmF0aW9uICYgTm90ZWJvb2tEaXNwbGF5T3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRnZXREaXNwbGF5T3B0aW9ucygpOiBOb3RlYm9va0Rpc3BsYXlPcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGdldENlbGxFZGl0b3JDb250YWluZXJMZWZ0TWFyZ2luKCkge1xuXHRcdGNvbnN0IHtcblx0XHRcdGNvZGVDZWxsTGVmdE1hcmdpbixcblx0XHRcdGNlbGxSdW5HdXR0ZXJcblx0XHR9ID0gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbjtcblx0XHRyZXR1cm4gY29kZUNlbGxMZWZ0TWFyZ2luICsgY2VsbFJ1bkd1dHRlcjtcblx0fVxuXG5cdGNvbXB1dGVDb2xsYXBzZWRNYXJrZG93bkNlbGxIZWlnaHQodmlld1R5cGU6IHN0cmluZyk6IG51bWJlciB7XG5cdFx0Y29uc3QgeyBib3R0b21Ub29sYmFyR2FwIH0gPSB0aGlzLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh2aWV3VHlwZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25DZWxsVG9wTWFyZ2luXG5cdFx0XHQrIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY29sbGFwc2VkSW5kaWNhdG9ySGVpZ2h0XG5cdFx0XHQrIGJvdHRvbVRvb2xiYXJHYXBcblx0XHRcdCsgdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrZG93bkNlbGxCb3R0b21NYXJnaW47XG5cdH1cblxuXHRjb21wdXRlQm90dG9tVG9vbGJhck9mZnNldCh0b3RhbEhlaWdodDogbnVtYmVyLCB2aWV3VHlwZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgeyBib3R0b21Ub29sYmFyR2FwLCBib3R0b21Ub29sYmFySGVpZ2h0IH0gPSB0aGlzLmNvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyh2aWV3VHlwZSk7XG5cblx0XHRyZXR1cm4gdG90YWxIZWlnaHRcblx0XHRcdC0gYm90dG9tVG9vbGJhckdhcFxuXHRcdFx0LSBib3R0b21Ub29sYmFySGVpZ2h0IC8gMjtcblx0fVxuXG5cdGNvbXB1dGVDb2RlQ2VsbEVkaXRvcldpZHRoKG91dGVyV2lkdGg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIG91dGVyV2lkdGggLSAoXG5cdFx0XHR0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNvZGVDZWxsTGVmdE1hcmdpblxuXHRcdFx0KyB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxSdW5HdXR0ZXJcblx0XHRcdCsgdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsUmlnaHRNYXJnaW5cblx0XHQpO1xuXHR9XG5cblx0Y29tcHV0ZU1hcmtkb3duQ2VsbEVkaXRvcldpZHRoKG91dGVyV2lkdGg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIG91dGVyV2lkdGhcblx0XHRcdC0gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrZG93bkNlbGxHdXR0ZXJcblx0XHRcdC0gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrZG93bkNlbGxMZWZ0TWFyZ2luXG5cdFx0XHQtIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY2VsbFJpZ2h0TWFyZ2luO1xuXHR9XG5cblx0Y29tcHV0ZVN0YXR1c0JhckhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxTdGF0dXNCYXJIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnMoY29tcGFjdFZpZXc6IGJvb2xlYW4sIGluc2VydFRvb2xiYXJQb3NpdGlvbjogJ2JldHdlZW5DZWxscycgfCAnbm90ZWJvb2tUb29sYmFyJyB8ICdib3RoJyB8ICdoaWRkZW4nLCBpbnNlcnRUb29sYmFyQWxpZ25tZW50OiAnbGVmdCcgfCAnY2VudGVyJywgY2VsbFRvb2xiYXI6ICdyaWdodCcgfCAnbGVmdCcgfCAnaGlkZGVuJyk6IHsgYm90dG9tVG9vbGJhckdhcDogbnVtYmVyOyBib3R0b21Ub29sYmFySGVpZ2h0OiBudW1iZXIgfSB7XG5cdFx0aWYgKGluc2VydFRvb2xiYXJBbGlnbm1lbnQgPT09ICdsZWZ0JyB8fCBjZWxsVG9vbGJhciAhPT0gJ2hpZGRlbicpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGJvdHRvbVRvb2xiYXJHYXA6IDE4LFxuXHRcdFx0XHRib3R0b21Ub29sYmFySGVpZ2h0OiAxOFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoaW5zZXJ0VG9vbGJhclBvc2l0aW9uID09PSAnYmV0d2VlbkNlbGxzJyB8fCBpbnNlcnRUb29sYmFyUG9zaXRpb24gPT09ICdib3RoJykge1xuXHRcdFx0cmV0dXJuIGNvbXBhY3RWaWV3ID8ge1xuXHRcdFx0XHRib3R0b21Ub29sYmFyR2FwOiAxMixcblx0XHRcdFx0Ym90dG9tVG9vbGJhckhlaWdodDogMjBcblx0XHRcdH0gOiB7XG5cdFx0XHRcdGJvdHRvbVRvb2xiYXJHYXA6IDIwLFxuXHRcdFx0XHRib3R0b21Ub29sYmFySGVpZ2h0OiAyMFxuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Ym90dG9tVG9vbGJhckdhcDogMCxcblx0XHRcdFx0Ym90dG9tVG9vbGJhckhlaWdodDogMFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRjb21wdXRlQm90dG9tVG9vbGJhckRpbWVuc2lvbnModmlld1R5cGU/OiBzdHJpbmcpOiB7IGJvdHRvbVRvb2xiYXJHYXA6IG51bWJlcjsgYm90dG9tVG9vbGJhckhlaWdodDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uO1xuXHRcdGNvbnN0IGNlbGxUb29sYmFyUG9zaXRpb24gPSB0aGlzLmNvbXB1dGVDZWxsVG9vbGJhckxvY2F0aW9uKHZpZXdUeXBlKTtcblx0XHRjb25zdCB7IGJvdHRvbVRvb2xiYXJHYXAsIGJvdHRvbVRvb2xiYXJIZWlnaHQgfSA9IHRoaXMuX2NvbXB1dGVCb3R0b21Ub29sYmFyRGltZW5zaW9ucyhjb25maWd1cmF0aW9uLmNvbXBhY3RWaWV3LCBjb25maWd1cmF0aW9uLmluc2VydFRvb2xiYXJQb3NpdGlvbiwgY29uZmlndXJhdGlvbi5pbnNlcnRUb29sYmFyQWxpZ25tZW50LCBjZWxsVG9vbGJhclBvc2l0aW9uKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Ym90dG9tVG9vbGJhckdhcCxcblx0XHRcdGJvdHRvbVRvb2xiYXJIZWlnaHRcblx0XHR9O1xuXHR9XG5cblx0Y29tcHV0ZUNlbGxUb29sYmFyTG9jYXRpb24odmlld1R5cGU/OiBzdHJpbmcpOiAncmlnaHQnIHwgJ2xlZnQnIHwgJ2hpZGRlbicge1xuXHRcdGNvbnN0IGNlbGxUb29sYmFyTG9jYXRpb24gPSB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxUb29sYmFyTG9jYXRpb247XG5cblx0XHRpZiAodHlwZW9mIGNlbGxUb29sYmFyTG9jYXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRpZiAoY2VsbFRvb2xiYXJMb2NhdGlvbiA9PT0gJ2xlZnQnIHx8IGNlbGxUb29sYmFyTG9jYXRpb24gPT09ICdyaWdodCcgfHwgY2VsbFRvb2xiYXJMb2NhdGlvbiA9PT0gJ2hpZGRlbicpIHtcblx0XHRcdFx0cmV0dXJuIGNlbGxUb29sYmFyTG9jYXRpb247XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh2aWV3VHlwZSkge1xuXHRcdFx0XHRjb25zdCBub3RlYm9va1NwZWNpZmljU2V0dGluZyA9IGNlbGxUb29sYmFyTG9jYXRpb25bdmlld1R5cGVdID8/IGNlbGxUb29sYmFyTG9jYXRpb25bJ2RlZmF1bHQnXTtcblx0XHRcdFx0bGV0IGNlbGxUb29sYmFyTG9jYXRpb25Gb3JDdXJyZW50VmlldzogJ3JpZ2h0JyB8ICdsZWZ0JyB8ICdoaWRkZW4nID0gJ3JpZ2h0JztcblxuXHRcdFx0XHRzd2l0Y2ggKG5vdGVib29rU3BlY2lmaWNTZXR0aW5nKSB7XG5cdFx0XHRcdFx0Y2FzZSAnbGVmdCc6XG5cdFx0XHRcdFx0XHRjZWxsVG9vbGJhckxvY2F0aW9uRm9yQ3VycmVudFZpZXcgPSAnbGVmdCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdyaWdodCc6XG5cdFx0XHRcdFx0XHRjZWxsVG9vbGJhckxvY2F0aW9uRm9yQ3VycmVudFZpZXcgPSAncmlnaHQnO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnaGlkZGVuJzpcblx0XHRcdFx0XHRcdGNlbGxUb29sYmFyTG9jYXRpb25Gb3JDdXJyZW50VmlldyA9ICdoaWRkZW4nO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdGNlbGxUb29sYmFyTG9jYXRpb25Gb3JDdXJyZW50VmlldyA9ICdyaWdodCc7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBjZWxsVG9vbGJhckxvY2F0aW9uRm9yQ3VycmVudFZpZXc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuICdyaWdodCc7XG5cdH1cblxuXHRjb21wdXRlVG9wSW5zZXJ0VG9vbGJhckhlaWdodCh2aWV3VHlwZT86IHN0cmluZyk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uaW5zZXJ0VG9vbGJhclBvc2l0aW9uID09PSAnYmV0d2VlbkNlbGxzJyB8fCB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmluc2VydFRvb2xiYXJQb3NpdGlvbiA9PT0gJ2JvdGgnKSB7XG5cdFx0XHRyZXR1cm4gU0NST0xMQUJMRV9FTEVNRU5UX1BBRERJTkdfVE9QO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNlbGxUb29sYmFyTG9jYXRpb24gPSB0aGlzLmNvbXB1dGVDZWxsVG9vbGJhckxvY2F0aW9uKHZpZXdUeXBlKTtcblxuXHRcdGlmIChjZWxsVG9vbGJhckxvY2F0aW9uID09PSAnbGVmdCcgfHwgY2VsbFRvb2xiYXJMb2NhdGlvbiA9PT0gJ3JpZ2h0Jykge1xuXHRcdFx0cmV0dXJuIFNDUk9MTEFCTEVfRUxFTUVOVF9QQURESU5HX1RPUDtcblx0XHR9XG5cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdGNvbXB1dGVFZGl0b3JQYWRkaW5nKGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGEsIGNlbGxVcmk6IFVSSSkge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0b3A6IHRoaXMuX2VkaXRvclRvcFBhZGRpbmcsXG5cdFx0XHRib3R0b206IHRoaXMuc3RhdHVzQmFySXNWaXNpYmxlKGludGVybmFsTWV0YWRhdGEsIGNlbGxVcmkpXG5cdFx0XHRcdD8gdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5lZGl0b3JCb3R0b21QYWRkaW5nXG5cdFx0XHRcdDogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5lZGl0b3JCb3R0b21QYWRkaW5nV2l0aG91dFN0YXR1c0JhclxuXHRcdH07XG5cdH1cblxuXG5cdGNvbXB1dGVFZGl0b3JTdGF0dXNiYXJIZWlnaHQoaW50ZXJuYWxNZXRhZGF0YTogTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSwgY2VsbFVyaTogVVJJKSB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdHVzQmFySXNWaXNpYmxlKGludGVybmFsTWV0YWRhdGEsIGNlbGxVcmkpID8gdGhpcy5jb21wdXRlU3RhdHVzQmFySGVpZ2h0KCkgOiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0dXNCYXJJc1Zpc2libGUoaW50ZXJuYWxNZXRhZGF0YTogTm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YSwgY2VsbFVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZXhlID0gdGhpcy5ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRDZWxsRXhlY3V0aW9uKGNlbGxVcmkpO1xuXHRcdGlmICh0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLnNob3dDZWxsU3RhdHVzQmFyID09PSAndmlzaWJsZScpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5zaG93Q2VsbFN0YXR1c0JhciA9PT0gJ3Zpc2libGVBZnRlckV4ZWN1dGUnKSB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIGludGVybmFsTWV0YWRhdGEubGFzdFJ1blN1Y2Nlc3MgPT09ICdib29sZWFuJyB8fCBleGUgIT09IHVuZGVmaW5lZDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGNvbXB1dGVXZWJ2aWV3T3B0aW9ucygpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b3V0cHV0Tm9kZVBhZGRpbmc6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY2VsbE91dHB1dFBhZGRpbmcsXG5cdFx0XHRvdXRwdXROb2RlTGVmdFBhZGRpbmc6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY2VsbE91dHB1dFBhZGRpbmcsXG5cdFx0XHRwcmV2aWV3Tm9kZVBhZGRpbmc6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25QcmV2aWV3UGFkZGluZyxcblx0XHRcdG1hcmtkb3duTGVmdE1hcmdpbjogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrZG93bkNlbGxHdXR0ZXIgKyB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm1hcmtkb3duQ2VsbExlZnRNYXJnaW4sXG5cdFx0XHRsZWZ0TWFyZ2luOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNvZGVDZWxsTGVmdE1hcmdpbixcblx0XHRcdHJpZ2h0TWFyZ2luOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmNlbGxSaWdodE1hcmdpbixcblx0XHRcdHJ1bkd1dHRlcjogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsUnVuR3V0dGVyLFxuXHRcdFx0ZHJhZ0FuZERyb3BFbmFibGVkOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmRyYWdBbmREcm9wRW5hYmxlZCxcblx0XHRcdGZvbnRTaXplOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLmZvbnRTaXplLFxuXHRcdFx0b3V0cHV0Rm9udFNpemU6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ub3V0cHV0Rm9udFNpemUsXG5cdFx0XHRvdXRwdXRGb250RmFtaWx5OiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dEZvbnRGYW1pbHksXG5cdFx0XHRtYXJrdXBGb250U2l6ZTogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrdXBGb250U2l6ZSxcblx0XHRcdG1hcmtkb3duTGluZUhlaWdodDogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrZG93bkxpbmVIZWlnaHQsXG5cdFx0XHRvdXRwdXRMaW5lSGVpZ2h0OiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dExpbmVIZWlnaHQsXG5cdFx0XHRvdXRwdXRTY3JvbGxpbmc6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ub3V0cHV0U2Nyb2xsaW5nLFxuXHRcdFx0b3V0cHV0V29yZFdyYXA6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ub3V0cHV0V29yZFdyYXAsXG5cdFx0XHRvdXRwdXRMaW5lTGltaXQ6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ub3V0cHV0TGluZUxpbWl0LFxuXHRcdFx0b3V0cHV0TGlua2lmeUZpbGVQYXRoczogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRMaW5raWZ5RmlsZVBhdGhzLFxuXHRcdFx0bWluaW1hbEVycm9yOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dE1pbmltYWxFcnJvcixcblx0XHRcdG1hcmt1cEZvbnRGYW1pbHk6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya3VwRm9udEZhbWlseVxuXHRcdH07XG5cdH1cblxuXHRjb21wdXRlRGlmZldlYnZpZXdPcHRpb25zKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRvdXRwdXROb2RlUGFkZGluZzogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5jZWxsT3V0cHV0UGFkZGluZyxcblx0XHRcdG91dHB1dE5vZGVMZWZ0UGFkZGluZzogMCxcblx0XHRcdHByZXZpZXdOb2RlUGFkZGluZzogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5tYXJrZG93blByZXZpZXdQYWRkaW5nLFxuXHRcdFx0bWFya2Rvd25MZWZ0TWFyZ2luOiAwLFxuXHRcdFx0bGVmdE1hcmdpbjogMzIsXG5cdFx0XHRyaWdodE1hcmdpbjogMCxcblx0XHRcdHJ1bkd1dHRlcjogMCxcblx0XHRcdGRyYWdBbmREcm9wRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRmb250U2l6ZTogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5mb250U2l6ZSxcblx0XHRcdG91dHB1dEZvbnRTaXplOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dEZvbnRTaXplLFxuXHRcdFx0b3V0cHV0Rm9udEZhbWlseTogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRGb250RmFtaWx5LFxuXHRcdFx0bWFya3VwRm9udFNpemU6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya3VwRm9udFNpemUsXG5cdFx0XHRtYXJrZG93bkxpbmVIZWlnaHQ6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya2Rvd25MaW5lSGVpZ2h0LFxuXHRcdFx0b3V0cHV0TGluZUhlaWdodDogdGhpcy5fbGF5b3V0Q29uZmlndXJhdGlvbi5vdXRwdXRMaW5lSGVpZ2h0LFxuXHRcdFx0b3V0cHV0U2Nyb2xsaW5nOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dFNjcm9sbGluZyxcblx0XHRcdG91dHB1dFdvcmRXcmFwOiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dFdvcmRXcmFwLFxuXHRcdFx0b3V0cHV0TGluZUxpbWl0OiB0aGlzLl9sYXlvdXRDb25maWd1cmF0aW9uLm91dHB1dExpbmVMaW1pdCxcblx0XHRcdG91dHB1dExpbmtpZnlGaWxlUGF0aHM6IGZhbHNlLFxuXHRcdFx0bWluaW1hbEVycm9yOiBmYWxzZSxcblx0XHRcdG1hcmt1cEZvbnRGYW1pbHk6IHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24ubWFya3VwRm9udEZhbWlseVxuXHRcdH07XG5cdH1cblxuXHRjb21wdXRlSW5kaWNhdG9yUG9zaXRpb24odG90YWxIZWlnaHQ6IG51bWJlciwgZm9sZEhpbnRIZWlnaHQ6IG51bWJlciwgdmlld1R5cGU/OiBzdHJpbmcpIHtcblx0XHRjb25zdCB7IGJvdHRvbVRvb2xiYXJHYXAgfSA9IHRoaXMuY29tcHV0ZUJvdHRvbVRvb2xiYXJEaW1lbnNpb25zKHZpZXdUeXBlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRib3R0b21JbmRpY2F0b3JUb3A6IHRvdGFsSGVpZ2h0IC0gYm90dG9tVG9vbGJhckdhcCAtIHRoaXMuX2xheW91dENvbmZpZ3VyYXRpb24uY2VsbEJvdHRvbU1hcmdpbiAtIGZvbGRIaW50SGVpZ2h0LFxuXHRcdFx0dmVydGljYWxJbmRpY2F0b3JIZWlnaHQ6IHRvdGFsSGVpZ2h0IC0gYm90dG9tVG9vbGJhckdhcCAtIGZvbGRIaW50SGVpZ2h0XG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxxQkFBZ0QsNkJBQTZCO0FBRXRGLFNBQThHLHVCQUE4QztBQUM1SixTQUFTLHNDQUFzQztBQUUvQyxNQUFN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
