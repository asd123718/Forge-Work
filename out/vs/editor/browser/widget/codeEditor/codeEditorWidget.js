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
import "../../services/contribution.js";
import * as dom from "../../../../base/browser/dom.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, createEventDeliveryQueue } from "../../../../base/common/event.js";
import { hash } from "../../../../base/common/hash.js";
import { Disposable, dispose } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import "./editor.css";
import { applyFontInfo } from "../../config/domFontInfo.js";
import { EditorConfiguration } from "../../config/editorConfiguration.js";
import { TabFocus } from "../../config/tabFocus.js";
import { EditorExtensionsRegistry } from "../../editorExtensions.js";
import { ICodeEditorService } from "../../services/codeEditorService.js";
import { View } from "../../view.js";
import { DOMLineBreaksComputerFactory } from "../../view/domLineBreaksComputer.js";
import { ViewUserInputEvents } from "../../view/viewUserInputEvents.js";
import { CodeEditorContributions } from "./codeEditorContributions.js";
import { EditorOption, filterFontDecorations, filterValidationDecorations } from "../../../common/config/editorOptions.js";
import { CursorColumns } from "../../../common/core/cursorColumns.js";
import { editorUnnecessaryCodeOpacity } from "../../../common/core/editorColorRegistry.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { WordOperations } from "../../../common/cursor/cursorWordOperations.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { InternalEditorAction } from "../../../common/editorAction.js";
import * as editorCommon from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { EndOfLinePreference } from "../../../common/model.js";
import { ClassName } from "../../../common/model/intervalTree.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { VerticalRevealType } from "../../../common/viewEvents.js";
import { MonospaceLineBreaksComputerFactory } from "../../../common/viewModel/monospaceLineBreaksComputer.js";
import { ViewModel } from "../../../common/viewModel/viewModelImpl.js";
import { OutgoingViewModelEventKind } from "../../../common/viewModelEventDispatcher.js";
import * as nls from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { editorErrorForeground, editorHintForeground, editorInfoForeground, editorWarningForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { TextModelEditSource, EditSources } from "../../../common/textModelEditSource.js";
import { isObject } from "../../../../base/common/types.js";
import { IUserInteractionService } from "../../../../platform/userInteraction/browser/userInteractionService.js";
let CodeEditorWidget = class extends Disposable {
  constructor(domElement, _options, codeEditorWidgetOptions, instantiationService, codeEditorService, commandService, contextKeyService, themeService, notificationService, accessibilityService, languageConfigurationService, languageFeaturesService, userInteractionService) {
    super();
    this.languageConfigurationService = languageConfigurationService;
    //#region Eventing
    this._deliveryQueue = createEventDeliveryQueue();
    this._contributions = this._register(new CodeEditorContributions());
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidChangeModelContent = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelContent = this._onDidChangeModelContent.event;
    this._onDidChangeModelLanguage = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelLanguage = this._onDidChangeModelLanguage.event;
    this._onDidChangeModelLanguageConfiguration = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelLanguageConfiguration = this._onDidChangeModelLanguageConfiguration.event;
    this._onDidChangeModelOptions = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelOptions = this._onDidChangeModelOptions.event;
    this._onDidChangeModelDecorations = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelDecorations = this._onDidChangeModelDecorations.event;
    this._onDidChangeLineHeight = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeLineHeight = this._onDidChangeLineHeight.event;
    this._onDidChangeFont = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeFont = this._onDidChangeFont.event;
    this._onDidChangeModelTokens = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModelTokens = this._onDidChangeModelTokens.event;
    this._onDidChangeConfiguration = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeConfiguration = this._onDidChangeConfiguration.event;
    this._onWillChangeModel = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onWillChangeModel = this._onWillChangeModel.event;
    this._onDidChangeModel = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeModel = this._onDidChangeModel.event;
    this._onDidChangeCursorPosition = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeCursorPosition = this._onDidChangeCursorPosition.event;
    this._onDidChangeCursorSelection = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeCursorSelection = this._onDidChangeCursorSelection.event;
    this._onDidAttemptReadOnlyEdit = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidAttemptReadOnlyEdit = this._onDidAttemptReadOnlyEdit.event;
    this._onDidLayoutChange = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidLayoutChange = this._onDidLayoutChange.event;
    this._editorTextFocus = this._register(new BooleanEventEmitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidFocusEditorText = this._editorTextFocus.onDidChangeToTrue;
    this.onDidBlurEditorText = this._editorTextFocus.onDidChangeToFalse;
    this._editorWidgetFocus = this._register(new BooleanEventEmitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidFocusEditorWidget = this._editorWidgetFocus.onDidChangeToTrue;
    this.onDidBlurEditorWidget = this._editorWidgetFocus.onDidChangeToFalse;
    this._onWillType = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillType = this._onWillType.event;
    this._onDidType = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidType = this._onDidType.event;
    this._onDidCompositionStart = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidCompositionStart = this._onDidCompositionStart.event;
    this._onDidCompositionEnd = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidCompositionEnd = this._onDidCompositionEnd.event;
    this._onDidPaste = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDidPaste = this._onDidPaste.event;
    this._onWillCopy = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillCopy = this._onWillCopy.event;
    this._onWillCut = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillCut = this._onWillCut.event;
    this._onWillPaste = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onWillPaste = this._onWillPaste.event;
    this._onMouseUp = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseUp = this._onMouseUp.event;
    this._onMouseDown = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDown = this._onMouseDown.event;
    this._onMouseDrag = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDrag = this._onMouseDrag.event;
    this._onMouseDrop = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDrop = this._onMouseDrop.event;
    this._onMouseDropCanceled = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseDropCanceled = this._onMouseDropCanceled.event;
    this._onDropIntoEditor = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onDropIntoEditor = this._onDropIntoEditor.event;
    this._onContextMenu = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onContextMenu = this._onContextMenu.event;
    this._onMouseMove = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseMove = this._onMouseMove.event;
    this._onMouseLeave = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseLeave = this._onMouseLeave.event;
    this._onMouseWheel = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onMouseWheel = this._onMouseWheel.event;
    this._onKeyUp = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onKeyUp = this._onKeyUp.event;
    this._onKeyDown = this._register(new InteractionEmitter(this._contributions, this._deliveryQueue));
    this.onKeyDown = this._onKeyDown.event;
    this._onDidContentSizeChange = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidContentSizeChange = this._onDidContentSizeChange.event;
    this._onDidScrollChange = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidScrollChange = this._onDidScrollChange.event;
    this._onDidChangeViewZones = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeViewZones = this._onDidChangeViewZones.event;
    this._onDidChangeHiddenAreas = this._register(new Emitter({ deliveryQueue: this._deliveryQueue }));
    this.onDidChangeHiddenAreas = this._onDidChangeHiddenAreas.event;
    this._updateCounter = 0;
    this._onWillTriggerEditorOperationEvent = this._register(new Emitter());
    this.onWillTriggerEditorOperationEvent = this._onWillTriggerEditorOperationEvent.event;
    this._onBeginUpdate = this._register(new Emitter());
    this.onBeginUpdate = this._onBeginUpdate.event;
    this._onEndUpdate = this._register(new Emitter());
    this.onEndUpdate = this._onEndUpdate.event;
    this._onBeforeExecuteEdit = this._register(new Emitter());
    this.onBeforeExecuteEdit = this._onBeforeExecuteEdit.event;
    this._actions = /* @__PURE__ */ new Map();
    this._bannerDomNode = null;
    this._dropIntoEditorDecorations = this.createDecorationsCollection();
    this.inComposition = false;
    codeEditorService.willCreateCodeEditor();
    const options = { ..._options };
    this._domElement = domElement;
    this._userInteractionService = userInteractionService;
    this._overflowWidgetsDomNode = options.overflowWidgetsDomNode;
    delete options.overflowWidgetsDomNode;
    this._id = ++EDITOR_ID;
    this._decorationTypeKeysToIds = {};
    this._decorationTypeSubtypes = {};
    this._telemetryData = codeEditorWidgetOptions.telemetryData;
    this._configuration = this._register(this._createConfiguration(
      codeEditorWidgetOptions.isSimpleWidget || false,
      codeEditorWidgetOptions.contextMenuId ?? (codeEditorWidgetOptions.isSimpleWidget ? MenuId.SimpleEditorContext : MenuId.EditorContext),
      options,
      accessibilityService
    ));
    this._domElement.style?.setProperty("--editor-font-size", this._configuration.options.get(EditorOption.fontSize) + "px");
    this._register(this._configuration.onDidChange((e) => {
      this._onDidChangeConfiguration.fire(e);
      const options2 = this._configuration.options;
      if (e.hasChanged(EditorOption.layoutInfo)) {
        const layoutInfo = options2.get(EditorOption.layoutInfo);
        this._onDidLayoutChange.fire(layoutInfo);
      }
      if (e.hasChanged(EditorOption.fontSize)) {
        this._domElement.style.setProperty("--editor-font-size", options2.get(EditorOption.fontSize) + "px");
      }
    }));
    this._contextKeyService = this._register(contextKeyService.createScoped(this._domElement));
    if (codeEditorWidgetOptions.contextKeyValues) {
      for (const [key, value] of Object.entries(codeEditorWidgetOptions.contextKeyValues)) {
        this._contextKeyService.createKey(key, value);
      }
    }
    this._notificationService = notificationService;
    this._codeEditorService = codeEditorService;
    this._commandService = commandService;
    this._themeService = themeService;
    this._register(new EditorContextKeysManager(this, this._contextKeyService));
    this._register(new EditorModeContext(this, this._contextKeyService, languageFeaturesService));
    this._instantiationService = this._register(instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
    this._modelData = null;
    this._contentWidgets = {};
    this._overlayWidgets = {};
    this._glyphMarginWidgets = {};
    let contributions;
    if (Array.isArray(codeEditorWidgetOptions.contributions)) {
      contributions = codeEditorWidgetOptions.contributions;
    } else {
      contributions = EditorExtensionsRegistry.getEditorContributions();
    }
    this._contributions.initialize(this, contributions, this._instantiationService);
    for (const action of EditorExtensionsRegistry.getEditorActions()) {
      if (this._actions.has(action.id)) {
        onUnexpectedError(new Error(`Cannot have two actions with the same id ${action.id}`));
        continue;
      }
      const internalAction = new InternalEditorAction(
        action.id,
        action.label,
        action.alias,
        action.metadata,
        action.precondition ?? void 0,
        (args) => {
          return this._instantiationService.invokeFunction((accessor) => {
            return Promise.resolve(action.runEditorCommand(accessor, this, args));
          });
        },
        this._contextKeyService
      );
      this._actions.set(internalAction.id, internalAction);
    }
    const isDropIntoEnabled = () => {
      return !this._configuration.options.get(EditorOption.readOnly) && this._configuration.options.get(EditorOption.dropIntoEditor).enabled;
    };
    this._register(new dom.DragAndDropObserver(this._domElement, {
      onDragOver: (e) => {
        if (!isDropIntoEnabled()) {
          return;
        }
        const target = this.getTargetAtClientPoint(e.clientX, e.clientY);
        if (target?.position) {
          this.showDropIndicatorAt(target.position);
        }
      },
      onDrop: async (e) => {
        if (!isDropIntoEnabled()) {
          return;
        }
        this.removeDropIndicator();
        if (!e.dataTransfer) {
          return;
        }
        const target = this.getTargetAtClientPoint(e.clientX, e.clientY);
        if (target?.position) {
          this._onDropIntoEditor.fire({ position: target.position, event: e });
        }
      },
      onDragLeave: () => {
        this.removeDropIndicator();
      },
      onDragEnd: () => {
        this.removeDropIndicator();
      }
    }));
    this._codeEditorService.addCodeEditor(this);
  }
  //#endregion
  get isSimpleWidget() {
    return this._configuration.isSimpleWidget;
  }
  get contextMenuId() {
    return this._configuration.contextMenuId;
  }
  get contextKeyService() {
    return this._contextKeyService;
  }
  writeScreenReaderContent(reason) {
    this._modelData?.view.writeScreenReaderContent(reason);
  }
  _createConfiguration(isSimpleWidget, contextMenuId, options, accessibilityService) {
    return new EditorConfiguration(isSimpleWidget, contextMenuId, options, this._domElement, accessibilityService);
  }
  getId() {
    return this.getEditorType() + ":" + this._id;
  }
  getEditorType() {
    return editorCommon.EditorType.ICodeEditor;
  }
  dispose() {
    this._codeEditorService.removeCodeEditor(this);
    this._actions.clear();
    this._contentWidgets = {};
    this._overlayWidgets = {};
    this._removeDecorationTypes();
    this._postDetachModelCleanup(this._detachModel());
    this._onDidDispose.fire();
    super.dispose();
  }
  invokeWithinContext(fn) {
    return this._instantiationService.invokeFunction(fn);
  }
  updateOptions(newOptions) {
    this._configuration.updateOptions(newOptions || {});
  }
  getOptions() {
    return this._configuration.options;
  }
  getOption(id) {
    return this._configuration.options.get(id);
  }
  getRawOptions() {
    return this._configuration.getRawOptions();
  }
  getOverflowWidgetsDomNode() {
    return this._overflowWidgetsDomNode;
  }
  getConfiguredWordAtPosition(position) {
    if (!this._modelData) {
      return null;
    }
    return WordOperations.getWordAtPosition(this._modelData.model, this._configuration.options.get(EditorOption.wordSeparators), this._configuration.options.get(EditorOption.wordSegmenterLocales), position);
  }
  getValue(options = null) {
    if (!this._modelData) {
      return "";
    }
    const preserveBOM = options && options.preserveBOM ? true : false;
    let eolPreference = EndOfLinePreference.TextDefined;
    if (options && options.lineEnding && options.lineEnding === "\n") {
      eolPreference = EndOfLinePreference.LF;
    } else if (options && options.lineEnding && options.lineEnding === "\r\n") {
      eolPreference = EndOfLinePreference.CRLF;
    }
    return this._modelData.model.getValue(eolPreference, preserveBOM);
  }
  setValue(newValue) {
    try {
      this._beginUpdate();
      if (!this._modelData) {
        return;
      }
      this._modelData.model.setValue(newValue);
    } finally {
      this._endUpdate();
    }
  }
  getModel() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.model;
  }
  setModel(_model = null) {
    try {
      this._beginUpdate();
      const model = _model;
      if (this._modelData === null && model === null) {
        return;
      }
      if (this._modelData && this._modelData.model === model) {
        return;
      }
      const e = {
        oldModelUrl: this._modelData?.model.uri || null,
        newModelUrl: model?.uri || null
      };
      this._onWillChangeModel.fire(e);
      const hasTextFocus = this.hasTextFocus();
      const detachedModel = this._detachModel();
      this._attachModel(model);
      if (this.hasModel()) {
        if (hasTextFocus) {
          this.focus();
        }
      } else {
        this._editorTextFocus.setValue(false);
        this._editorWidgetFocus.setValue(false);
      }
      this._removeDecorationTypes();
      this._onDidChangeModel.fire(e);
      this._postDetachModelCleanup(detachedModel);
      this._contributionsDisposable = this._contributions.onAfterModelAttached();
    } finally {
      this._endUpdate();
    }
  }
  _removeDecorationTypes() {
    this._decorationTypeKeysToIds = {};
    if (this._decorationTypeSubtypes) {
      for (const decorationType in this._decorationTypeSubtypes) {
        const subTypes = this._decorationTypeSubtypes[decorationType];
        for (const subType in subTypes) {
          this._removeDecorationType(decorationType + "-" + subType);
        }
      }
      this._decorationTypeSubtypes = {};
    }
  }
  getVisibleRanges() {
    if (!this._modelData) {
      return [];
    }
    return this._modelData.viewModel.getVisibleRanges();
  }
  getVisibleRangesPlusViewportAboveBelow() {
    if (!this._modelData) {
      return [];
    }
    return this._modelData.viewModel.getVisibleRangesPlusViewportAboveBelow();
  }
  getWhitespaces() {
    if (!this._modelData) {
      return [];
    }
    return this._modelData.viewModel.viewLayout.getWhitespaces();
  }
  static _getVerticalOffsetAfterPosition(modelData, modelLineNumber, modelColumn, includeViewZones) {
    const modelPosition = modelData.model.validatePosition({
      lineNumber: modelLineNumber,
      column: modelColumn
    });
    const viewPosition = modelData.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
    return modelData.viewModel.viewLayout.getVerticalOffsetAfterLineNumber(viewPosition.lineNumber, includeViewZones);
  }
  getTopForLineNumber(lineNumber, includeViewZones = false) {
    if (!this._modelData) {
      return -1;
    }
    return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, 1, includeViewZones);
  }
  getTopForPosition(lineNumber, column) {
    if (!this._modelData) {
      return -1;
    }
    return CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, lineNumber, column, false);
  }
  static _getVerticalOffsetForPosition(modelData, modelLineNumber, modelColumn, includeViewZones = false) {
    const modelPosition = modelData.model.validatePosition({
      lineNumber: modelLineNumber,
      column: modelColumn
    });
    const viewPosition = modelData.viewModel.coordinatesConverter.convertModelPositionToViewPosition(modelPosition);
    return modelData.viewModel.viewLayout.getVerticalOffsetForLineNumber(viewPosition.lineNumber, includeViewZones);
  }
  getBottomForLineNumber(lineNumber, includeViewZones = false) {
    if (!this._modelData) {
      return -1;
    }
    return CodeEditorWidget._getVerticalOffsetAfterPosition(this._modelData, lineNumber, Number.MAX_SAFE_INTEGER, includeViewZones);
  }
  getLineHeightForPosition(position) {
    if (!this._modelData) {
      return -1;
    }
    const viewModel = this._modelData.viewModel;
    const coordinatesConverter = viewModel.coordinatesConverter;
    const pos = Position.lift(position);
    if (coordinatesConverter.modelPositionIsVisible(pos)) {
      const viewPosition = coordinatesConverter.convertModelPositionToViewPosition(pos);
      return viewModel.viewLayout.getLineHeightForLineNumber(viewPosition.lineNumber);
    }
    return 0;
  }
  setHiddenAreas(ranges, source, forceUpdate) {
    this._modelData?.viewModel.setHiddenAreas(ranges.map((r) => Range.lift(r)), source, forceUpdate);
  }
  getVisibleColumnFromPosition(rawPosition) {
    if (!this._modelData) {
      return rawPosition.column;
    }
    const position = this._modelData.model.validatePosition(rawPosition);
    const tabSize = this._modelData.model.getOptions().tabSize;
    return CursorColumns.visibleColumnFromColumn(this._modelData.model.getLineContent(position.lineNumber), position.column, tabSize) + 1;
  }
  getStatusbarColumn(rawPosition) {
    if (!this._modelData) {
      return rawPosition.column;
    }
    const position = this._modelData.model.validatePosition(rawPosition);
    const tabSize = this._modelData.model.getOptions().tabSize;
    return CursorColumns.toStatusbarColumn(this._modelData.model.getLineContent(position.lineNumber), position.column, tabSize);
  }
  getPosition() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getPosition();
  }
  setPosition(position, source = "api") {
    if (!this._modelData) {
      return;
    }
    if (!Position.isIPosition(position)) {
      throw new Error("Invalid arguments");
    }
    this._modelData.viewModel.setSelections(source, [{
      selectionStartLineNumber: position.lineNumber,
      selectionStartColumn: position.column,
      positionLineNumber: position.lineNumber,
      positionColumn: position.column
    }]);
  }
  _sendRevealRange(modelRange, verticalType, revealHorizontal, scrollType) {
    if (!this._modelData) {
      return;
    }
    if (!Range.isIRange(modelRange)) {
      throw new Error("Invalid arguments");
    }
    const validatedModelRange = this._modelData.model.validateRange(modelRange);
    const viewRange = this._modelData.viewModel.coordinatesConverter.convertModelRangeToViewRange(validatedModelRange);
    this._modelData.viewModel.revealRange("api", revealHorizontal, viewRange, verticalType, scrollType);
  }
  revealAllCursors(revealHorizontal, minimalReveal) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.revealAllCursors("api", revealHorizontal, minimalReveal);
  }
  revealLine(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.Simple, scrollType);
  }
  revealLineInCenter(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.Center, scrollType);
  }
  revealLineInCenterIfOutsideViewport(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.CenterIfOutsideViewport, scrollType);
  }
  revealLineNearTop(lineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLine(lineNumber, VerticalRevealType.NearTop, scrollType);
  }
  _revealLine(lineNumber, revealType, scrollType) {
    if (typeof lineNumber !== "number") {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      new Range(lineNumber, 1, lineNumber, 1),
      revealType,
      false,
      scrollType
    );
  }
  revealPosition(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.Simple,
      true,
      scrollType
    );
  }
  revealPositionInCenter(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.Center,
      true,
      scrollType
    );
  }
  revealPositionInCenterIfOutsideViewport(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.CenterIfOutsideViewport,
      true,
      scrollType
    );
  }
  revealPositionNearTop(position, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealPosition(
      position,
      VerticalRevealType.NearTop,
      true,
      scrollType
    );
  }
  _revealPosition(position, verticalType, revealHorizontal, scrollType) {
    if (!Position.isIPosition(position)) {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      new Range(position.lineNumber, position.column, position.lineNumber, position.column),
      verticalType,
      revealHorizontal,
      scrollType
    );
  }
  getSelection() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getSelection();
  }
  getSelections() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getSelections();
  }
  setSelection(something, source = "api") {
    const isSelection = Selection.isISelection(something);
    const isRange = Range.isIRange(something);
    if (!isSelection && !isRange) {
      throw new Error("Invalid arguments");
    }
    if (isSelection) {
      this._setSelectionImpl(something, source);
    } else if (isRange) {
      const selection = {
        selectionStartLineNumber: something.startLineNumber,
        selectionStartColumn: something.startColumn,
        positionLineNumber: something.endLineNumber,
        positionColumn: something.endColumn
      };
      this._setSelectionImpl(selection, source);
    }
  }
  _setSelectionImpl(sel, source) {
    if (!this._modelData) {
      return;
    }
    const selection = new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn);
    this._modelData.viewModel.setSelections(source, [selection]);
  }
  revealLines(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.Simple,
      scrollType
    );
  }
  revealLinesInCenter(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.Center,
      scrollType
    );
  }
  revealLinesInCenterIfOutsideViewport(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.CenterIfOutsideViewport,
      scrollType
    );
  }
  revealLinesNearTop(startLineNumber, endLineNumber, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealLines(
      startLineNumber,
      endLineNumber,
      VerticalRevealType.NearTop,
      scrollType
    );
  }
  _revealLines(startLineNumber, endLineNumber, verticalType, scrollType) {
    if (typeof startLineNumber !== "number" || typeof endLineNumber !== "number") {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      new Range(startLineNumber, 1, endLineNumber, 1),
      verticalType,
      false,
      scrollType
    );
  }
  revealRange(range, scrollType = editorCommon.ScrollType.Smooth, revealVerticalInCenter = false, revealHorizontal = true) {
    this._revealRange(
      range,
      revealVerticalInCenter ? VerticalRevealType.Center : VerticalRevealType.Simple,
      revealHorizontal,
      scrollType
    );
  }
  revealRangeInCenter(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.Center,
      true,
      scrollType
    );
  }
  revealRangeInCenterIfOutsideViewport(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.CenterIfOutsideViewport,
      true,
      scrollType
    );
  }
  revealRangeNearTop(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.NearTop,
      true,
      scrollType
    );
  }
  revealRangeNearTopIfOutsideViewport(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.NearTopIfOutsideViewport,
      true,
      scrollType
    );
  }
  revealRangeAtTop(range, scrollType = editorCommon.ScrollType.Smooth) {
    this._revealRange(
      range,
      VerticalRevealType.Top,
      true,
      scrollType
    );
  }
  _revealRange(range, verticalType, revealHorizontal, scrollType) {
    if (!Range.isIRange(range)) {
      throw new Error("Invalid arguments");
    }
    this._sendRevealRange(
      Range.lift(range),
      verticalType,
      revealHorizontal,
      scrollType
    );
  }
  setSelections(ranges, source = "api", reason = CursorChangeReason.NotSet) {
    if (!this._modelData) {
      return;
    }
    if (!ranges || ranges.length === 0) {
      throw new Error("Invalid arguments");
    }
    for (let i = 0, len = ranges.length; i < len; i++) {
      if (!Selection.isISelection(ranges[i])) {
        throw new Error("Invalid arguments");
      }
    }
    this._modelData.viewModel.setSelections(source, ranges, reason);
  }
  getContentWidth() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getContentWidth();
  }
  getScrollWidth() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getScrollWidth();
  }
  getScrollLeft() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getCurrentScrollLeft();
  }
  getContentHeight() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getContentHeight();
  }
  getScrollHeight() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getScrollHeight();
  }
  getScrollTop() {
    if (!this._modelData) {
      return -1;
    }
    return this._modelData.viewModel.viewLayout.getCurrentScrollTop();
  }
  setScrollLeft(newScrollLeft, scrollType = editorCommon.ScrollType.Immediate) {
    if (!this._modelData) {
      return;
    }
    if (typeof newScrollLeft !== "number") {
      throw new Error("Invalid arguments");
    }
    this._modelData.viewModel.viewLayout.setScrollPosition({
      scrollLeft: newScrollLeft
    }, scrollType);
  }
  setScrollTop(newScrollTop, scrollType = editorCommon.ScrollType.Immediate) {
    if (!this._modelData) {
      return;
    }
    if (typeof newScrollTop !== "number") {
      throw new Error("Invalid arguments");
    }
    this._modelData.viewModel.viewLayout.setScrollPosition({
      scrollTop: newScrollTop
    }, scrollType);
  }
  setScrollPosition(position, scrollType = editorCommon.ScrollType.Immediate) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.viewLayout.setScrollPosition(position, scrollType);
  }
  hasPendingScrollAnimation() {
    if (!this._modelData) {
      return false;
    }
    return this._modelData.viewModel.viewLayout.hasPendingScrollAnimation();
  }
  saveViewState() {
    if (!this._modelData) {
      return null;
    }
    const contributionsState = this._contributions.saveViewState();
    const cursorState = this._modelData.viewModel.saveCursorState();
    const viewState = this._modelData.viewModel.saveState();
    return {
      cursorState,
      viewState,
      contributionsState
    };
  }
  restoreViewState(s) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    const codeEditorState = s;
    if (codeEditorState && codeEditorState.cursorState && codeEditorState.viewState) {
      const cursorState = codeEditorState.cursorState;
      if (Array.isArray(cursorState)) {
        if (cursorState.length > 0) {
          this._modelData.viewModel.restoreCursorState(cursorState);
        }
      } else {
        this._modelData.viewModel.restoreCursorState([cursorState]);
      }
      this._contributions.restoreViewState(codeEditorState.contributionsState || {});
      const reducedState = this._modelData.viewModel.reduceRestoreState(codeEditorState.viewState);
      this._modelData.view.restoreState(reducedState);
    }
  }
  handleInitialized() {
    this._getViewModel()?.visibleLinesStabilized();
  }
  onVisible() {
    this._modelData?.view.refreshFocusState();
  }
  onHide() {
    this._modelData?.view.refreshFocusState();
  }
  getContribution(id) {
    return this._contributions.get(id);
  }
  getActions() {
    return Array.from(this._actions.values());
  }
  getSupportedActions() {
    let result = this.getActions();
    result = result.filter((action) => action.isSupported());
    return result;
  }
  getAction(id) {
    return this._actions.get(id) || null;
  }
  trigger(source, handlerId, payload) {
    payload = payload || {};
    try {
      this._onWillTriggerEditorOperationEvent.fire({ source, handlerId, payload });
      this._beginUpdate();
      switch (handlerId) {
        case editorCommon.Handler.CompositionStart:
          this._startComposition();
          return;
        case editorCommon.Handler.CompositionEnd:
          this._endComposition(source);
          return;
        case editorCommon.Handler.Type: {
          const args = payload;
          this._type(source, args.text || "");
          return;
        }
        case editorCommon.Handler.ReplacePreviousChar: {
          const args = payload;
          this._compositionType(source, args.text || "", args.replaceCharCnt || 0, 0, 0);
          return;
        }
        case editorCommon.Handler.CompositionType: {
          const args = payload;
          this._compositionType(source, args.text || "", args.replacePrevCharCnt || 0, args.replaceNextCharCnt || 0, args.positionDelta || 0);
          return;
        }
        case editorCommon.Handler.Paste: {
          const args = payload;
          this._paste(source, args.text || "", args.pasteOnNewLine || false, args.multicursorText || null, args.mode || null, args.clipboardEvent);
          return;
        }
        case editorCommon.Handler.Cut:
          this._cut(source);
          return;
      }
      const action = this.getAction(handlerId);
      if (action) {
        Promise.resolve(action.run(payload)).then(void 0, onUnexpectedError);
        return;
      }
      if (!this._modelData) {
        return;
      }
      if (this._triggerEditorCommand(source, handlerId, payload)) {
        return;
      }
      this._triggerCommand(handlerId, payload);
    } finally {
      this._endUpdate();
    }
  }
  _triggerCommand(handlerId, payload) {
    this._commandService.executeCommand(handlerId, payload);
  }
  _startComposition() {
    if (!this._modelData) {
      return;
    }
    this.inComposition = true;
    this._modelData.viewModel.startComposition();
    this._onDidCompositionStart.fire();
  }
  _endComposition(source) {
    if (!this._modelData) {
      return;
    }
    this.inComposition = false;
    this._modelData.viewModel.endComposition(source);
    this._onDidCompositionEnd.fire();
  }
  _type(source, text) {
    if (!this._modelData || text.length === 0) {
      return;
    }
    if (source === "keyboard") {
      this._onWillType.fire(text);
    }
    this._modelData.viewModel.type(text, source);
    if (source === "keyboard") {
      this._onDidType.fire(text);
    }
  }
  _compositionType(source, text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.compositionType(text, replacePrevCharCnt, replaceNextCharCnt, positionDelta, source);
  }
  _paste(source, text, pasteOnNewLine, multicursorText, mode, clipboardEvent) {
    if (!this._modelData) {
      return;
    }
    const viewModel = this._modelData.viewModel;
    const startPosition = viewModel.getSelection().getStartPosition();
    viewModel.paste(text, pasteOnNewLine, multicursorText, source);
    const endPosition = viewModel.getSelection().getStartPosition();
    if (source === "keyboard") {
      this._onDidPaste.fire({
        clipboardEvent,
        range: new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column),
        languageId: mode
      });
    }
  }
  _cut(source) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.cut(source);
  }
  _triggerEditorCommand(source, handlerId, payload) {
    const command = EditorExtensionsRegistry.getEditorCommand(handlerId);
    if (command) {
      payload = payload || {};
      if (isObject(payload)) {
        payload.source = source;
      }
      this._instantiationService.invokeFunction((accessor) => {
        Promise.resolve(command.runEditorCommand(accessor, this, payload)).then(void 0, onUnexpectedError);
      });
      return true;
    }
    return false;
  }
  _getViewModel() {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel;
  }
  pushUndoStop() {
    if (!this._modelData) {
      return false;
    }
    if (this._configuration.options.get(EditorOption.readOnly)) {
      return false;
    }
    this._modelData.model.pushStackElement();
    return true;
  }
  popUndoStop() {
    if (!this._modelData) {
      return false;
    }
    if (this._configuration.options.get(EditorOption.readOnly)) {
      return false;
    }
    this._modelData.model.popStackElement();
    return true;
  }
  edit(edit, reason) {
    return this.executeEdits(reason, edit.replacements.map((e) => ({ range: e.range, text: e.text })), void 0);
  }
  executeEdits(source, edits, endCursorState) {
    if (!this._modelData) {
      return false;
    }
    if (this._configuration.options.get(EditorOption.readOnly)) {
      return false;
    }
    let cursorStateComputer;
    if (!endCursorState) {
      cursorStateComputer = () => null;
    } else if (Array.isArray(endCursorState)) {
      cursorStateComputer = () => endCursorState;
    } else {
      cursorStateComputer = endCursorState;
    }
    let sourceStr;
    let reason;
    if (source instanceof TextModelEditSource) {
      reason = source;
      sourceStr = source.metadata.source;
    } else {
      reason = EditSources.unknown({ name: source });
      sourceStr = source;
    }
    this._onBeforeExecuteEdit.fire({ source: sourceStr ?? void 0 });
    this._modelData.viewModel.executeEdits(sourceStr, edits, cursorStateComputer, reason);
    return true;
  }
  executeCommand(source, command) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.executeCommand(command, source);
  }
  executeCommands(source, commands) {
    if (!this._modelData) {
      return;
    }
    this._modelData.viewModel.executeCommands(commands, source);
  }
  createDecorationsCollection(decorations) {
    return new EditorDecorationsCollection(this, decorations);
  }
  changeDecorations(callback) {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.model.changeDecorations(callback, this._id);
  }
  getLineDecorations(lineNumber) {
    if (!this._modelData) {
      return null;
    }
    const options = this._configuration.options;
    return this._modelData.model.getLineDecorations(lineNumber, this._id, filterValidationDecorations(options), filterFontDecorations(options));
  }
  getDecorationsInRange(range) {
    if (!this._modelData) {
      return null;
    }
    const options = this._configuration.options;
    return this._modelData.model.getDecorationsInRange(range, this._id, filterValidationDecorations(options), filterFontDecorations(options));
  }
  getFontSizeAtPosition(position) {
    if (!this._modelData) {
      return null;
    }
    return this._modelData.viewModel.getFontSizeAtPosition(position);
  }
  /**
   * @deprecated
   */
  deltaDecorations(oldDecorations, newDecorations) {
    if (!this._modelData) {
      return [];
    }
    if (oldDecorations.length === 0 && newDecorations.length === 0) {
      return oldDecorations;
    }
    return this._modelData.model.deltaDecorations(oldDecorations, newDecorations, this._id);
  }
  removeDecorations(decorationIds) {
    if (!this._modelData || decorationIds.length === 0) {
      return;
    }
    this._modelData.model.changeDecorations((changeAccessor) => {
      changeAccessor.deltaDecorations(decorationIds, []);
    });
  }
  setDecorationsByType(description, decorationTypeKey, decorationOptions) {
    const newDecorationsSubTypes = {};
    const oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
    this._decorationTypeSubtypes[decorationTypeKey] = newDecorationsSubTypes;
    const newModelDecorations = [];
    for (const decorationOption of decorationOptions) {
      let typeKey = decorationTypeKey;
      if (decorationOption.renderOptions) {
        const subType = hash(decorationOption.renderOptions).toString(16);
        typeKey = decorationTypeKey + "-" + subType;
        if (!oldDecorationsSubTypes[subType] && !newDecorationsSubTypes[subType]) {
          this._registerDecorationType(description, typeKey, decorationOption.renderOptions, decorationTypeKey);
        }
        newDecorationsSubTypes[subType] = true;
      }
      const opts = this._resolveDecorationOptions(typeKey, !!decorationOption.hoverMessage);
      if (decorationOption.hoverMessage) {
        opts.hoverMessage = decorationOption.hoverMessage;
      }
      newModelDecorations.push({ range: decorationOption.range, options: opts });
    }
    for (const subType in oldDecorationsSubTypes) {
      if (!newDecorationsSubTypes[subType]) {
        this._removeDecorationType(decorationTypeKey + "-" + subType);
      }
    }
    const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
    this.changeDecorations((accessor) => this._decorationTypeKeysToIds[decorationTypeKey] = accessor.deltaDecorations(oldDecorationsIds, newModelDecorations));
    return this._decorationTypeKeysToIds[decorationTypeKey] || [];
  }
  setDecorationsByTypeFast(decorationTypeKey, ranges) {
    const oldDecorationsSubTypes = this._decorationTypeSubtypes[decorationTypeKey] || {};
    for (const subType in oldDecorationsSubTypes) {
      this._removeDecorationType(decorationTypeKey + "-" + subType);
    }
    this._decorationTypeSubtypes[decorationTypeKey] = {};
    const opts = ModelDecorationOptions.createDynamic(this._resolveDecorationOptions(decorationTypeKey, false));
    const newModelDecorations = new Array(ranges.length);
    for (let i = 0, len = ranges.length; i < len; i++) {
      newModelDecorations[i] = { range: ranges[i], options: opts };
    }
    const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey] || [];
    this.changeDecorations((accessor) => this._decorationTypeKeysToIds[decorationTypeKey] = accessor.deltaDecorations(oldDecorationsIds, newModelDecorations));
  }
  removeDecorationsByType(decorationTypeKey) {
    const oldDecorationsIds = this._decorationTypeKeysToIds[decorationTypeKey];
    if (oldDecorationsIds) {
      this.changeDecorations((accessor) => accessor.deltaDecorations(oldDecorationsIds, []));
    }
    if (this._decorationTypeKeysToIds.hasOwnProperty(decorationTypeKey)) {
      delete this._decorationTypeKeysToIds[decorationTypeKey];
    }
    if (this._decorationTypeSubtypes.hasOwnProperty(decorationTypeKey)) {
      const items = this._decorationTypeSubtypes[decorationTypeKey];
      for (const subType of Object.keys(items)) {
        this._removeDecorationType(decorationTypeKey + "-" + subType);
      }
      delete this._decorationTypeSubtypes[decorationTypeKey];
    }
  }
  getLayoutInfo() {
    const options = this._configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    return layoutInfo;
  }
  createOverviewRuler(cssClassName) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    return this._modelData.view.createOverviewRuler(cssClassName);
  }
  getContainerDomNode() {
    return this._domElement;
  }
  getDomNode() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    return this._modelData.view.domNode.domNode;
  }
  delegateVerticalScrollbarPointerDown(browserEvent) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.delegateVerticalScrollbarPointerDown(browserEvent);
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  layout(dimension, postponeRendering = false) {
    this._configuration.observeContainer(dimension);
    if (!postponeRendering) {
      this.render();
    }
  }
  focus() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.focus();
  }
  hasTextFocus() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return false;
    }
    return this._modelData.view.isFocused();
  }
  hasWidgetFocus() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return false;
    }
    return this._modelData.view.isWidgetFocused();
  }
  addContentWidget(widget) {
    const widgetData = {
      widget,
      position: widget.getPosition()
    };
    if (this._contentWidgets.hasOwnProperty(widget.getId())) {
      console.warn("Overwriting a content widget with the same id:" + widget.getId());
    }
    this._contentWidgets[widget.getId()] = widgetData;
    if (this._modelData && this._modelData.hasRealView) {
      this._modelData.view.addContentWidget(widgetData);
    }
  }
  layoutContentWidget(widget) {
    const widgetId = widget.getId();
    if (this._contentWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._contentWidgets[widgetId];
      widgetData.position = widget.getPosition();
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.layoutContentWidget(widgetData);
      }
    }
  }
  removeContentWidget(widget) {
    const widgetId = widget.getId();
    if (this._contentWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._contentWidgets[widgetId];
      delete this._contentWidgets[widgetId];
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.removeContentWidget(widgetData);
      }
    }
  }
  addOverlayWidget(widget) {
    const widgetData = {
      widget,
      position: widget.getPosition()
    };
    if (this._overlayWidgets.hasOwnProperty(widget.getId())) {
      console.warn("Overwriting an overlay widget with the same id.");
    }
    this._overlayWidgets[widget.getId()] = widgetData;
    if (this._modelData && this._modelData.hasRealView) {
      this._modelData.view.addOverlayWidget(widgetData);
    }
  }
  layoutOverlayWidget(widget) {
    const widgetId = widget.getId();
    if (this._overlayWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._overlayWidgets[widgetId];
      widgetData.position = widget.getPosition();
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.layoutOverlayWidget(widgetData);
      }
    }
  }
  removeOverlayWidget(widget) {
    const widgetId = widget.getId();
    if (this._overlayWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._overlayWidgets[widgetId];
      delete this._overlayWidgets[widgetId];
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.removeOverlayWidget(widgetData);
      }
    }
  }
  addGlyphMarginWidget(widget) {
    const widgetData = {
      widget,
      position: widget.getPosition()
    };
    if (this._glyphMarginWidgets.hasOwnProperty(widget.getId())) {
      console.warn("Overwriting a glyph margin widget with the same id.");
    }
    this._glyphMarginWidgets[widget.getId()] = widgetData;
    if (this._modelData && this._modelData.hasRealView) {
      this._modelData.view.addGlyphMarginWidget(widgetData);
    }
  }
  layoutGlyphMarginWidget(widget) {
    const widgetId = widget.getId();
    if (this._glyphMarginWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._glyphMarginWidgets[widgetId];
      widgetData.position = widget.getPosition();
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.layoutGlyphMarginWidget(widgetData);
      }
    }
  }
  removeGlyphMarginWidget(widget) {
    const widgetId = widget.getId();
    if (this._glyphMarginWidgets.hasOwnProperty(widgetId)) {
      const widgetData = this._glyphMarginWidgets[widgetId];
      delete this._glyphMarginWidgets[widgetId];
      if (this._modelData && this._modelData.hasRealView) {
        this._modelData.view.removeGlyphMarginWidget(widgetData);
      }
    }
  }
  changeViewZones(callback) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.change(callback);
  }
  getTargetAtClientPoint(clientX, clientY) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    return this._modelData.view.getTargetAtClientPoint(clientX, clientY);
  }
  getScrolledVisiblePosition(rawPosition) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return null;
    }
    const position = this._modelData.model.validatePosition(rawPosition);
    const options = this._configuration.options;
    const layoutInfo = options.get(EditorOption.layoutInfo);
    const top = CodeEditorWidget._getVerticalOffsetForPosition(this._modelData, position.lineNumber, position.column) - this.getScrollTop();
    const left = this._modelData.view.getOffsetForColumn(position.lineNumber, position.column) + layoutInfo.glyphMarginWidth + layoutInfo.lineNumbersWidth + layoutInfo.decorationsWidth - this.getScrollLeft();
    const height = this.getLineHeightForPosition(position);
    return {
      top,
      left,
      height
    };
  }
  getOffsetForColumn(lineNumber, column) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return -1;
    }
    return this._modelData.view.getOffsetForColumn(lineNumber, column);
  }
  getWidthOfLine(lineNumber) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return -1;
    }
    return this._modelData.view.getLineWidth(lineNumber);
  }
  resetLineWidthCaches() {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.resetLineWidthCaches();
  }
  render(forceRedraw = false) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.viewModel.batchEvents(() => {
      this._modelData.view.render(true, forceRedraw);
    });
  }
  renderAsync(forceRedraw = false) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.viewModel.batchEvents(() => {
      this._modelData.view.render(false, forceRedraw);
    });
  }
  setAriaOptions(options) {
    if (!this._modelData || !this._modelData.hasRealView) {
      return;
    }
    this._modelData.view.setAriaOptions(options);
  }
  applyFontInfo(target) {
    applyFontInfo(target, this._configuration.options.get(EditorOption.fontInfo));
  }
  setBanner(domNode, domNodeHeight) {
    if (this._bannerDomNode && this._domElement.contains(this._bannerDomNode)) {
      this._bannerDomNode.remove();
    }
    this._bannerDomNode = domNode;
    this._configuration.setReservedHeight(domNode ? domNodeHeight : 0);
    if (this._bannerDomNode) {
      this._domElement.prepend(this._bannerDomNode);
    }
  }
  _attachModel(model) {
    if (!model) {
      this._modelData = null;
      return;
    }
    const listenersToRemove = [];
    this._domElement.setAttribute("data-mode-id", model.getLanguageId());
    this._configuration.setIsDominatedByLongLines(model.isDominatedByLongLines());
    this._configuration.setModelLineCount(model.getLineCount());
    const attachedView = model.onBeforeAttached();
    const viewModel = new ViewModel(
      this._id,
      this._configuration,
      model,
      DOMLineBreaksComputerFactory.create(dom.getWindow(this._domElement)),
      MonospaceLineBreaksComputerFactory.create(this._configuration.options),
      (callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(this._domElement), callback),
      this.languageConfigurationService,
      this._themeService,
      attachedView,
      {
        batchChanges: (cb) => {
          try {
            this._beginUpdate();
            return cb();
          } finally {
            this._endUpdate();
          }
        }
      }
    );
    listenersToRemove.push(model.onWillDispose(() => this.setModel(null)));
    listenersToRemove.push(viewModel.onEvent((e) => {
      switch (e.kind) {
        case OutgoingViewModelEventKind.ContentSizeChanged:
          this._onDidContentSizeChange.fire(e);
          break;
        case OutgoingViewModelEventKind.FocusChanged:
          this._editorTextFocus.setValue(e.hasFocus);
          break;
        case OutgoingViewModelEventKind.WidgetFocusChanged:
          this._editorWidgetFocus.setValue(e.hasFocus);
          break;
        case OutgoingViewModelEventKind.ScrollChanged:
          this._onDidScrollChange.fire(e);
          break;
        case OutgoingViewModelEventKind.ViewZonesChanged:
          this._onDidChangeViewZones.fire();
          break;
        case OutgoingViewModelEventKind.HiddenAreasChanged:
          this._onDidChangeHiddenAreas.fire();
          break;
        case OutgoingViewModelEventKind.ReadOnlyEditAttempt:
          this._onDidAttemptReadOnlyEdit.fire();
          break;
        case OutgoingViewModelEventKind.CursorStateChanged: {
          if (e.reachedMaxCursorCount) {
            const multiCursorLimit = this.getOption(EditorOption.multiCursorLimit);
            const message = nls.localize("cursors.maximum", "The number of cursors has been limited to {0}. Consider using [find and replace](https://code.visualstudio.com/docs/editor/codebasics#_find-and-replace) for larger changes or increase the editor multi cursor limit setting.", multiCursorLimit);
            this._notificationService.prompt(Severity.Warning, message, [
              {
                label: "Find and Replace",
                run: () => {
                  this._commandService.executeCommand("editor.action.startFindReplaceAction");
                }
              },
              {
                label: nls.localize("goToSetting", "Increase Multi Cursor Limit"),
                run: () => {
                  this._commandService.executeCommand("workbench.action.openSettings2", {
                    query: "editor.multiCursorLimit"
                  });
                }
              }
            ]);
          }
          const positions = [];
          for (let i = 0, len = e.selections.length; i < len; i++) {
            positions[i] = e.selections[i].getPosition();
          }
          const e1 = {
            position: positions[0],
            secondaryPositions: positions.slice(1),
            reason: e.reason,
            source: e.source
          };
          this._onDidChangeCursorPosition.fire(e1);
          const e2 = {
            selection: e.selections[0],
            secondarySelections: e.selections.slice(1),
            modelVersionId: e.modelVersionId,
            oldSelections: e.oldSelections,
            oldModelVersionId: e.oldModelVersionId,
            source: e.source,
            reason: e.reason
          };
          this._onDidChangeCursorSelection.fire(e2);
          break;
        }
        case OutgoingViewModelEventKind.ModelDecorationsChanged:
          this._onDidChangeModelDecorations.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelLanguageChanged:
          this._domElement.setAttribute("data-mode-id", model.getLanguageId());
          this._onDidChangeModelLanguage.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelLanguageConfigurationChanged:
          this._onDidChangeModelLanguageConfiguration.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelContentChanged:
          this._onDidChangeModelContent.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelOptionsChanged:
          this._onDidChangeModelOptions.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelTokensChanged:
          this._onDidChangeModelTokens.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelLineHeightChanged:
          this._onDidChangeLineHeight.fire(e.event);
          break;
        case OutgoingViewModelEventKind.ModelFontChangedEvent:
          this._onDidChangeFont.fire(e.event);
          break;
      }
    }));
    const [view, hasRealView] = this._createView(viewModel);
    if (hasRealView) {
      this._domElement.appendChild(view.domNode.domNode);
      let keys = Object.keys(this._contentWidgets);
      for (let i = 0, len = keys.length; i < len; i++) {
        const widgetId = keys[i];
        view.addContentWidget(this._contentWidgets[widgetId]);
      }
      keys = Object.keys(this._overlayWidgets);
      for (let i = 0, len = keys.length; i < len; i++) {
        const widgetId = keys[i];
        view.addOverlayWidget(this._overlayWidgets[widgetId]);
      }
      keys = Object.keys(this._glyphMarginWidgets);
      for (let i = 0, len = keys.length; i < len; i++) {
        const widgetId = keys[i];
        view.addGlyphMarginWidget(this._glyphMarginWidgets[widgetId]);
      }
      view.render(false, true);
      view.domNode.domNode.setAttribute("data-uri", model.uri.toString());
      listenersToRemove.push(view.onWillCopy((e) => this._onWillCopy.fire(e)));
      listenersToRemove.push(view.onWillCut((e) => this._onWillCut.fire(e)));
      listenersToRemove.push(view.onWillPaste((e) => this._onWillPaste.fire(e)));
    }
    this._modelData = new ModelData(model, viewModel, view, hasRealView, listenersToRemove, attachedView);
  }
  _createView(viewModel) {
    let commandDelegate;
    if (this.isSimpleWidget) {
      commandDelegate = {
        paste: (text, pasteOnNewLine, multicursorText, mode) => {
          this._paste("keyboard", text, pasteOnNewLine, multicursorText, mode);
        },
        type: (text) => {
          this._type("keyboard", text);
        },
        compositionType: (text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) => {
          this._compositionType("keyboard", text, replacePrevCharCnt, replaceNextCharCnt, positionDelta);
        },
        startComposition: () => {
          this._startComposition();
        },
        endComposition: () => {
          this._endComposition("keyboard");
        },
        cut: () => {
          this._cut("keyboard");
        }
      };
    } else {
      commandDelegate = {
        paste: (text, pasteOnNewLine, multicursorText, mode) => {
          const payload = { text, pasteOnNewLine, multicursorText, mode };
          this._commandService.executeCommand(editorCommon.Handler.Paste, payload);
        },
        type: (text) => {
          const payload = { text };
          this._commandService.executeCommand(editorCommon.Handler.Type, payload);
        },
        compositionType: (text, replacePrevCharCnt, replaceNextCharCnt, positionDelta) => {
          if (replaceNextCharCnt || positionDelta) {
            const payload = { text, replacePrevCharCnt, replaceNextCharCnt, positionDelta };
            this._commandService.executeCommand(editorCommon.Handler.CompositionType, payload);
          } else {
            const payload = { text, replaceCharCnt: replacePrevCharCnt };
            this._commandService.executeCommand(editorCommon.Handler.ReplacePreviousChar, payload);
          }
        },
        startComposition: () => {
          this._commandService.executeCommand(editorCommon.Handler.CompositionStart, {});
        },
        endComposition: () => {
          this._commandService.executeCommand(editorCommon.Handler.CompositionEnd, {});
        },
        cut: () => {
          this._commandService.executeCommand(editorCommon.Handler.Cut, {});
        }
      };
    }
    const viewUserInputEvents = new ViewUserInputEvents(viewModel.coordinatesConverter);
    viewUserInputEvents.onKeyDown = (e) => this._onKeyDown.fire(e);
    viewUserInputEvents.onKeyUp = (e) => this._onKeyUp.fire(e);
    viewUserInputEvents.onContextMenu = (e) => this._onContextMenu.fire(e);
    viewUserInputEvents.onMouseMove = (e) => this._onMouseMove.fire(e);
    viewUserInputEvents.onMouseLeave = (e) => this._onMouseLeave.fire(e);
    viewUserInputEvents.onMouseDown = (e) => this._onMouseDown.fire(e);
    viewUserInputEvents.onMouseUp = (e) => this._onMouseUp.fire(e);
    viewUserInputEvents.onMouseDrag = (e) => this._onMouseDrag.fire(e);
    viewUserInputEvents.onMouseDrop = (e) => this._onMouseDrop.fire(e);
    viewUserInputEvents.onMouseDropCanceled = (e) => this._onMouseDropCanceled.fire(e);
    viewUserInputEvents.onMouseWheel = (e) => this._onMouseWheel.fire(e);
    const view = new View(
      this._domElement,
      this.getId(),
      commandDelegate,
      this._configuration,
      this._themeService.getColorTheme(),
      viewModel,
      viewUserInputEvents,
      this._overflowWidgetsDomNode,
      this._instantiationService,
      this._userInteractionService
    );
    return [view, true];
  }
  _postDetachModelCleanup(detachedModel) {
    detachedModel?.removeAllDecorationsWithOwnerId(this._id);
  }
  _detachModel() {
    this._contributionsDisposable?.dispose();
    this._contributionsDisposable = void 0;
    if (!this._modelData) {
      return null;
    }
    const model = this._modelData.model;
    const removeDomNode = this._modelData.hasRealView ? this._modelData.view.domNode.domNode : null;
    this._modelData.dispose();
    this._modelData = null;
    this._domElement.removeAttribute("data-mode-id");
    if (removeDomNode && this._domElement.contains(removeDomNode)) {
      removeDomNode.remove();
    }
    if (this._bannerDomNode && this._domElement.contains(this._bannerDomNode)) {
      this._bannerDomNode.remove();
    }
    return model;
  }
  _registerDecorationType(description, key, options, parentTypeKey) {
    this._codeEditorService.registerDecorationType(description, key, options, parentTypeKey, this);
  }
  _removeDecorationType(key) {
    this._codeEditorService.removeDecorationType(key);
  }
  _resolveDecorationOptions(typeKey, writable) {
    return this._codeEditorService.resolveDecorationOptions(typeKey, writable);
  }
  getTelemetryData() {
    return this._telemetryData;
  }
  hasModel() {
    return this._modelData !== null;
  }
  showDropIndicatorAt(position) {
    const newDecorations = [{
      range: new Range(position.lineNumber, position.column, position.lineNumber, position.column),
      options: CodeEditorWidget.dropIntoEditorDecorationOptions
    }];
    this._dropIntoEditorDecorations.set(newDecorations);
    this.revealPosition(position, editorCommon.ScrollType.Immediate);
  }
  removeDropIndicator() {
    this._dropIntoEditorDecorations.clear();
  }
  setContextValue(key, value) {
    this._contextKeyService.createKey(key, value);
  }
  _beginUpdate() {
    this._updateCounter++;
    if (this._updateCounter === 1) {
      this._onBeginUpdate.fire();
    }
  }
  _endUpdate() {
    this._updateCounter--;
    if (this._updateCounter === 0) {
      this._onEndUpdate.fire();
    }
  }
};
CodeEditorWidget.dropIntoEditorDecorationOptions = ModelDecorationOptions.register({
  description: "workbench-dnd-target",
  className: "dnd-target"
});
CodeEditorWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, ILanguageConfigurationService),
  __decorateParam(11, ILanguageFeaturesService),
  __decorateParam(12, IUserInteractionService)
], CodeEditorWidget);
let EDITOR_ID = 0;
class ModelData {
  constructor(model, viewModel, view, hasRealView, listenersToRemove, attachedView) {
    this.model = model;
    this.viewModel = viewModel;
    this.view = view;
    this.hasRealView = hasRealView;
    this.listenersToRemove = listenersToRemove;
    this.attachedView = attachedView;
  }
  dispose() {
    dispose(this.listenersToRemove);
    this.model.onBeforeDetached(this.attachedView);
    if (this.hasRealView) {
      this.view.dispose();
    }
    this.viewModel.dispose();
  }
}
var BooleanEventValue = /* @__PURE__ */ ((BooleanEventValue2) => {
  BooleanEventValue2[BooleanEventValue2["NotSet"] = 0] = "NotSet";
  BooleanEventValue2[BooleanEventValue2["False"] = 1] = "False";
  BooleanEventValue2[BooleanEventValue2["True"] = 2] = "True";
  return BooleanEventValue2;
})(BooleanEventValue || {});
class BooleanEventEmitter extends Disposable {
  constructor(_emitterOptions) {
    super();
    this._emitterOptions = _emitterOptions;
    this._onDidChangeToTrue = this._register(new Emitter(this._emitterOptions));
    this.onDidChangeToTrue = this._onDidChangeToTrue.event;
    this._onDidChangeToFalse = this._register(new Emitter(this._emitterOptions));
    this.onDidChangeToFalse = this._onDidChangeToFalse.event;
    this._value = 0 /* NotSet */;
  }
  setValue(_value) {
    const value = _value ? 2 /* True */ : 1 /* False */;
    if (this._value === value) {
      return;
    }
    this._value = value;
    if (this._value === 2 /* True */) {
      this._onDidChangeToTrue.fire();
    } else if (this._value === 1 /* False */) {
      this._onDidChangeToFalse.fire();
    }
  }
}
class InteractionEmitter extends Emitter {
  constructor(_contributions, deliveryQueue) {
    super({ deliveryQueue });
    this._contributions = _contributions;
  }
  fire(event) {
    this._contributions.onBeforeInteractionEvent();
    super.fire(event);
  }
}
class EditorContextKeysManager extends Disposable {
  constructor(editor, contextKeyService) {
    super();
    this._editor = editor;
    contextKeyService.createKey("editorId", editor.getId());
    this._editorSimpleInput = EditorContextKeys.editorSimpleInput.bindTo(contextKeyService);
    this._editorFocus = EditorContextKeys.focus.bindTo(contextKeyService);
    this._textInputFocus = EditorContextKeys.textInputFocus.bindTo(contextKeyService);
    this._editorTextFocus = EditorContextKeys.editorTextFocus.bindTo(contextKeyService);
    this._tabMovesFocus = EditorContextKeys.tabMovesFocus.bindTo(contextKeyService);
    this._editorReadonly = EditorContextKeys.readOnly.bindTo(contextKeyService);
    this._inDiffEditor = EditorContextKeys.inDiffEditor.bindTo(contextKeyService);
    this._editorColumnSelection = EditorContextKeys.columnSelection.bindTo(contextKeyService);
    this._hasMultipleSelections = EditorContextKeys.hasMultipleSelections.bindTo(contextKeyService);
    this._hasNonEmptySelection = EditorContextKeys.hasNonEmptySelection.bindTo(contextKeyService);
    this._canUndo = EditorContextKeys.canUndo.bindTo(contextKeyService);
    this._canRedo = EditorContextKeys.canRedo.bindTo(contextKeyService);
    this._register(this._editor.onDidChangeConfiguration(() => this._updateFromConfig()));
    this._register(this._editor.onDidChangeCursorSelection(() => this._updateFromSelection()));
    this._register(this._editor.onDidFocusEditorWidget(() => this._updateFromFocus()));
    this._register(this._editor.onDidBlurEditorWidget(() => this._updateFromFocus()));
    this._register(this._editor.onDidFocusEditorText(() => this._updateFromFocus()));
    this._register(this._editor.onDidBlurEditorText(() => this._updateFromFocus()));
    this._register(this._editor.onDidChangeModel(() => this._updateFromModel()));
    this._register(this._editor.onDidChangeConfiguration(() => this._updateFromModel()));
    this._register(TabFocus.onDidChangeTabFocus((tabFocusMode) => this._tabMovesFocus.set(tabFocusMode)));
    this._updateFromConfig();
    this._updateFromSelection();
    this._updateFromFocus();
    this._updateFromModel();
    this._editorSimpleInput.set(this._editor.isSimpleWidget);
  }
  _updateFromConfig() {
    const options = this._editor.getOptions();
    this._tabMovesFocus.set(options.get(EditorOption.tabFocusMode) || TabFocus.getTabFocusMode());
    this._editorReadonly.set(options.get(EditorOption.readOnly));
    this._inDiffEditor.set(options.get(EditorOption.inDiffEditor));
    this._editorColumnSelection.set(options.get(EditorOption.columnSelection));
  }
  _updateFromSelection() {
    const selections = this._editor.getSelections();
    if (!selections) {
      this._hasMultipleSelections.reset();
      this._hasNonEmptySelection.reset();
    } else {
      this._hasMultipleSelections.set(selections.length > 1);
      this._hasNonEmptySelection.set(selections.some((s) => !s.isEmpty()));
    }
  }
  _updateFromFocus() {
    this._editorFocus.set(this._editor.hasWidgetFocus() && !this._editor.isSimpleWidget);
    this._editorTextFocus.set(this._editor.hasTextFocus() && !this._editor.isSimpleWidget);
    this._textInputFocus.set(this._editor.hasTextFocus());
  }
  _updateFromModel() {
    const model = this._editor.getModel();
    this._canUndo.set(Boolean(model && model.canUndo()));
    this._canRedo.set(Boolean(model && model.canRedo()));
  }
}
class EditorModeContext extends Disposable {
  constructor(_editor, _contextKeyService, _languageFeaturesService) {
    super();
    this._editor = _editor;
    this._contextKeyService = _contextKeyService;
    this._languageFeaturesService = _languageFeaturesService;
    this._langId = EditorContextKeys.languageId.bindTo(_contextKeyService);
    this._hasCompletionItemProvider = EditorContextKeys.hasCompletionItemProvider.bindTo(_contextKeyService);
    this._hasCodeActionsProvider = EditorContextKeys.hasCodeActionsProvider.bindTo(_contextKeyService);
    this._hasCodeLensProvider = EditorContextKeys.hasCodeLensProvider.bindTo(_contextKeyService);
    this._hasDefinitionProvider = EditorContextKeys.hasDefinitionProvider.bindTo(_contextKeyService);
    this._hasDeclarationProvider = EditorContextKeys.hasDeclarationProvider.bindTo(_contextKeyService);
    this._hasImplementationProvider = EditorContextKeys.hasImplementationProvider.bindTo(_contextKeyService);
    this._hasTypeDefinitionProvider = EditorContextKeys.hasTypeDefinitionProvider.bindTo(_contextKeyService);
    this._hasHoverProvider = EditorContextKeys.hasHoverProvider.bindTo(_contextKeyService);
    this._hasDocumentHighlightProvider = EditorContextKeys.hasDocumentHighlightProvider.bindTo(_contextKeyService);
    this._hasDocumentSymbolProvider = EditorContextKeys.hasDocumentSymbolProvider.bindTo(_contextKeyService);
    this._hasReferenceProvider = EditorContextKeys.hasReferenceProvider.bindTo(_contextKeyService);
    this._hasRenameProvider = EditorContextKeys.hasRenameProvider.bindTo(_contextKeyService);
    this._hasSignatureHelpProvider = EditorContextKeys.hasSignatureHelpProvider.bindTo(_contextKeyService);
    this._hasInlayHintsProvider = EditorContextKeys.hasInlayHintsProvider.bindTo(_contextKeyService);
    this._hasDocumentFormattingProvider = EditorContextKeys.hasDocumentFormattingProvider.bindTo(_contextKeyService);
    this._hasDocumentSelectionFormattingProvider = EditorContextKeys.hasDocumentSelectionFormattingProvider.bindTo(_contextKeyService);
    this._hasMultipleDocumentFormattingProvider = EditorContextKeys.hasMultipleDocumentFormattingProvider.bindTo(_contextKeyService);
    this._hasMultipleDocumentSelectionFormattingProvider = EditorContextKeys.hasMultipleDocumentSelectionFormattingProvider.bindTo(_contextKeyService);
    this._isInEmbeddedEditor = EditorContextKeys.isInEmbeddedEditor.bindTo(_contextKeyService);
    const update = () => this._update();
    this._register(_editor.onDidChangeModel(update));
    this._register(_editor.onDidChangeModelLanguage(update));
    this._register(_languageFeaturesService.completionProvider.onDidChange(update));
    this._register(_languageFeaturesService.codeActionProvider.onDidChange(update));
    this._register(_languageFeaturesService.codeLensProvider.onDidChange(update));
    this._register(_languageFeaturesService.definitionProvider.onDidChange(update));
    this._register(_languageFeaturesService.declarationProvider.onDidChange(update));
    this._register(_languageFeaturesService.implementationProvider.onDidChange(update));
    this._register(_languageFeaturesService.typeDefinitionProvider.onDidChange(update));
    this._register(_languageFeaturesService.hoverProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentHighlightProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentSymbolProvider.onDidChange(update));
    this._register(_languageFeaturesService.referenceProvider.onDidChange(update));
    this._register(_languageFeaturesService.renameProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentFormattingEditProvider.onDidChange(update));
    this._register(_languageFeaturesService.documentRangeFormattingEditProvider.onDidChange(update));
    this._register(_languageFeaturesService.signatureHelpProvider.onDidChange(update));
    this._register(_languageFeaturesService.inlayHintsProvider.onDidChange(update));
    update();
  }
  dispose() {
    super.dispose();
  }
  reset() {
    this._contextKeyService.bufferChangeEvents(() => {
      this._langId.reset();
      this._hasCompletionItemProvider.reset();
      this._hasCodeActionsProvider.reset();
      this._hasCodeLensProvider.reset();
      this._hasDefinitionProvider.reset();
      this._hasDeclarationProvider.reset();
      this._hasImplementationProvider.reset();
      this._hasTypeDefinitionProvider.reset();
      this._hasHoverProvider.reset();
      this._hasDocumentHighlightProvider.reset();
      this._hasDocumentSymbolProvider.reset();
      this._hasReferenceProvider.reset();
      this._hasRenameProvider.reset();
      this._hasDocumentFormattingProvider.reset();
      this._hasDocumentSelectionFormattingProvider.reset();
      this._hasSignatureHelpProvider.reset();
      this._isInEmbeddedEditor.reset();
    });
  }
  _update() {
    const model = this._editor.getModel();
    if (!model) {
      this.reset();
      return;
    }
    this._contextKeyService.bufferChangeEvents(() => {
      this._langId.set(model.getLanguageId());
      this._hasCompletionItemProvider.set(this._languageFeaturesService.completionProvider.has(model));
      this._hasCodeActionsProvider.set(this._languageFeaturesService.codeActionProvider.has(model));
      this._hasCodeLensProvider.set(this._languageFeaturesService.codeLensProvider.has(model));
      this._hasDefinitionProvider.set(this._languageFeaturesService.definitionProvider.has(model));
      this._hasDeclarationProvider.set(this._languageFeaturesService.declarationProvider.has(model));
      this._hasImplementationProvider.set(this._languageFeaturesService.implementationProvider.has(model));
      this._hasTypeDefinitionProvider.set(this._languageFeaturesService.typeDefinitionProvider.has(model));
      this._hasHoverProvider.set(this._languageFeaturesService.hoverProvider.has(model));
      this._hasDocumentHighlightProvider.set(this._languageFeaturesService.documentHighlightProvider.has(model));
      this._hasDocumentSymbolProvider.set(this._languageFeaturesService.documentSymbolProvider.has(model));
      this._hasReferenceProvider.set(this._languageFeaturesService.referenceProvider.has(model));
      this._hasRenameProvider.set(this._languageFeaturesService.renameProvider.has(model));
      this._hasSignatureHelpProvider.set(this._languageFeaturesService.signatureHelpProvider.has(model));
      this._hasInlayHintsProvider.set(this._languageFeaturesService.inlayHintsProvider.has(model));
      this._hasDocumentFormattingProvider.set(this._languageFeaturesService.documentFormattingEditProvider.has(model) || this._languageFeaturesService.documentRangeFormattingEditProvider.has(model));
      this._hasDocumentSelectionFormattingProvider.set(this._languageFeaturesService.documentRangeFormattingEditProvider.has(model));
      this._hasMultipleDocumentFormattingProvider.set(this._languageFeaturesService.documentFormattingEditProvider.all(model).length + this._languageFeaturesService.documentRangeFormattingEditProvider.all(model).length > 1);
      this._hasMultipleDocumentSelectionFormattingProvider.set(this._languageFeaturesService.documentRangeFormattingEditProvider.all(model).length > 1);
      this._isInEmbeddedEditor.set(model.uri.scheme === Schemas.walkThroughSnippet || model.uri.scheme === Schemas.vscodeChatCodeBlock);
    });
  }
}
class EditorDecorationsCollection {
  constructor(_editor, decorations) {
    this._editor = _editor;
    this._decorationIds = [];
    this._isChangingDecorations = false;
    if (Array.isArray(decorations) && decorations.length > 0) {
      this.set(decorations);
    }
  }
  get length() {
    return this._decorationIds.length;
  }
  onDidChange(listener, thisArgs, disposables) {
    return this._editor.onDidChangeModelDecorations((e) => {
      if (this._isChangingDecorations) {
        return;
      }
      listener.call(thisArgs, e);
    }, disposables);
  }
  getRange(index) {
    if (!this._editor.hasModel()) {
      return null;
    }
    if (index >= this._decorationIds.length) {
      return null;
    }
    return this._editor.getModel().getDecorationRange(this._decorationIds[index]);
  }
  getRanges() {
    if (!this._editor.hasModel()) {
      return [];
    }
    const model = this._editor.getModel();
    const result = [];
    for (const decorationId of this._decorationIds) {
      const range = model.getDecorationRange(decorationId);
      if (range) {
        result.push(range);
      }
    }
    return result;
  }
  has(decoration) {
    return this._decorationIds.includes(decoration.id);
  }
  clear() {
    if (this._decorationIds.length === 0) {
      return;
    }
    this.set([]);
  }
  set(newDecorations) {
    try {
      this._isChangingDecorations = true;
      this._editor.changeDecorations((accessor) => {
        this._decorationIds = accessor.deltaDecorations(this._decorationIds, newDecorations);
      });
    } finally {
      this._isChangingDecorations = false;
    }
    return this._decorationIds;
  }
  append(newDecorations) {
    let newDecorationIds = [];
    try {
      this._isChangingDecorations = true;
      this._editor.changeDecorations((accessor) => {
        newDecorationIds = accessor.deltaDecorations([], newDecorations);
        this._decorationIds = this._decorationIds.concat(newDecorationIds);
      });
    } finally {
      this._isChangingDecorations = false;
    }
    return newDecorationIds;
  }
}
const squigglyStart = encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3' enable-background='new 0 0 6 3' height='3' width='6'><g fill='`);
const squigglyEnd = encodeURIComponent(`'><polygon points='5.5,0 2.5,3 1.1,3 4.1,0'/><polygon points='4,0 6,2 6,0.6 5.4,0'/><polygon points='0,2 1,3 2.4,3 0,0.6'/></g></svg>`);
function getSquigglySVGData(color) {
  return squigglyStart + encodeURIComponent(color.toString()) + squigglyEnd;
}
const dotdotdotStart = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" height="3" width="12"><g fill="`);
const dotdotdotEnd = encodeURIComponent(`"><circle cx="1" cy="1" r="1"/><circle cx="5" cy="1" r="1"/><circle cx="9" cy="1" r="1"/></g></svg>`);
function getDotDotDotSVGData(color) {
  return dotdotdotStart + encodeURIComponent(color.toString()) + dotdotdotEnd;
}
registerThemingParticipant((theme, collector) => {
  const errorForeground = theme.getColor(editorErrorForeground);
  if (errorForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorErrorDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(errorForeground)}") repeat-x bottom left; }`);
    collector.addRule(`:root { --monaco-editor-error-decoration: url("data:image/svg+xml,${getSquigglySVGData(errorForeground)}"); }`);
  }
  const warningForeground = theme.getColor(editorWarningForeground);
  if (warningForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorWarningDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(warningForeground)}") repeat-x bottom left; }`);
    collector.addRule(`:root { --monaco-editor-warning-decoration: url("data:image/svg+xml,${getSquigglySVGData(warningForeground)}"); }`);
  }
  const infoForeground = theme.getColor(editorInfoForeground);
  if (infoForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorInfoDecoration} { background: url("data:image/svg+xml,${getSquigglySVGData(infoForeground)}") repeat-x bottom left; }`);
    collector.addRule(`:root { --monaco-editor-info-decoration: url("data:image/svg+xml,${getSquigglySVGData(infoForeground)}"); }`);
  }
  const hintForeground = theme.getColor(editorHintForeground);
  if (hintForeground) {
    collector.addRule(`.monaco-editor .${ClassName.EditorHintDecoration} { background: url("data:image/svg+xml,${getDotDotDotSVGData(hintForeground)}") no-repeat bottom left; }`);
    collector.addRule(`:root { --monaco-editor-hint-decoration: url("data:image/svg+xml,${getDotDotDotSVGData(hintForeground)}"); }`);
  }
  const unnecessaryForeground = theme.getColor(editorUnnecessaryCodeOpacity);
  if (unnecessaryForeground) {
    collector.addRule(`.monaco-editor.showUnused .${ClassName.EditorUnnecessaryInlineDecoration} { opacity: ${unnecessaryForeground.rgba.a}; }`);
    collector.addRule(`:root { --monaco-editor-unnecessary-decoration-opacity: ${unnecessaryForeground.rgba.a}; }`);
  }
});
export {
  BooleanEventEmitter,
  CodeEditorWidget,
  EditorModeContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGJyb3dzZXJcXHdpZGdldFxcY29kZUVkaXRvclxcY29kZUVkaXRvcldpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi4vLi4vc2VydmljZXMvY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRW1pdHRlck9wdGlvbnMsIEV2ZW50LCBFdmVudERlbGl2ZXJ5UXVldWUsIGNyZWF0ZUV2ZW50RGVsaXZlcnlRdWV1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICcuL2VkaXRvci5jc3MnO1xuaW1wb3J0IHsgYXBwbHlGb250SW5mbyB9IGZyb20gJy4uLy4uL2NvbmZpZy9kb21Gb250SW5mby5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb25maWd1cmF0aW9uLCBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRhYkZvY3VzIH0gZnJvbSAnLi4vLi4vY29uZmlnL3RhYkZvY3VzLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckJyb3dzZXIgZnJvbSAnLi4vLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkQ29weUV2ZW50LCBJQ2xpcGJvYXJkUGFzdGVFdmVudCB9IGZyb20gJy4uLy4uL2NvbnRyb2xsZXIvZWRpdENvbnRleHQvY2xpcGJvYXJkVXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZW50V2lkZ2V0RGF0YSwgSUdseXBoTWFyZ2luV2lkZ2V0RGF0YSwgSU92ZXJsYXlXaWRnZXREYXRhLCBWaWV3IH0gZnJvbSAnLi4vLi4vdmlldy5qcyc7XG5pbXBvcnQgeyBET01MaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5IH0gZnJvbSAnLi4vLi4vdmlldy9kb21MaW5lQnJlYWtzQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmREZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgVmlld1VzZXJJbnB1dEV2ZW50cyB9IGZyb20gJy4uLy4uL3ZpZXcvdmlld1VzZXJJbnB1dEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yQ29udHJpYnV0aW9ucyB9IGZyb20gJy4vY29kZUVkaXRvckNvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yTGF5b3V0SW5mbywgRWRpdG9yT3B0aW9uLCBGaW5kQ29tcHV0ZWRFZGl0b3JPcHRpb25WYWx1ZUJ5SWQsIElDb21wdXRlZEVkaXRvck9wdGlvbnMsIElFZGl0b3JPcHRpb25zLCBmaWx0ZXJGb250RGVjb3JhdGlvbnMsIGZpbHRlclZhbGlkYXRpb25EZWNvcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb2x1bW5zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvY3Vyc29yQ29sdW1ucy5qcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvZGltZW5zaW9uLmpzJztcbmltcG9ydCB7IGVkaXRvclVubmVjZXNzYXJ5Q29kZU9wYWNpdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9lZGl0b3JDb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiwgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElXb3JkQXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgV29yZE9wZXJhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yL2N1cnNvcldvcmRPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiwgSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50LCBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbEVkaXRvckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JBY3Rpb24uanMnO1xuaW1wb3J0ICogYXMgZWRpdG9yQ29tbW9uIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIElBdHRhY2hlZFZpZXcsIElDdXJzb3JTdGF0ZUNvbXB1dGVyLCBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb24sIElNb2RlbERlY29yYXRpb24sIElNb2RlbERlY29yYXRpb25PcHRpb25zLCBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgQ2xhc3NOYW1lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2ludGVydmFsVHJlZS5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50LCBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudCwgSU1vZGVsTGFuZ3VhZ2VDaGFuZ2VkRXZlbnQsIElNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgSU1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudCwgSU1vZGVsVG9rZW5zQ2hhbmdlZEV2ZW50LCBNb2RlbEZvbnRDaGFuZ2VkRXZlbnQsIE1vZGVsTGluZUhlaWdodENoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgVmVydGljYWxSZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdFdmVudHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldoaXRlc3BhY2UsIElWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcbmltcG9ydCB7IE1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL21vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsRXZlbnREaXNwYXRjaGVyLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVZhbHVlLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgZWRpdG9yRXJyb3JGb3JlZ3JvdW5kLCBlZGl0b3JIaW50Rm9yZWdyb3VuZCwgZWRpdG9ySW5mb0ZvcmVncm91bmQsIGVkaXRvcldhcm5pbmdGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSwgcmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsRWRpdFNvdXJjZSwgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VySW50ZXJhY3Rpb24vYnJvd3Nlci91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIENvZGVFZGl0b3JXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgZWRpdG9yQnJvd3Nlci5JQ29kZUVkaXRvciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgZHJvcEludG9FZGl0b3JEZWNvcmF0aW9uT3B0aW9ucyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAnd29ya2JlbmNoLWRuZC10YXJnZXQnLFxuXHRcdGNsYXNzTmFtZTogJ2RuZC10YXJnZXQnXG5cdH0pO1xuXG5cdC8vI3JlZ2lvbiBFdmVudGluZ1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlbGl2ZXJ5UXVldWUgPSBjcmVhdGVFdmVudERlbGl2ZXJ5UXVldWUoKTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9jb250cmlidXRpb25zOiBDb2RlRWRpdG9yQ29udHJpYnV0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb2RlRWRpdG9yQ29udHJpYnV0aW9ucygpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRGlzcG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbENvbnRlbnQ6IEVtaXR0ZXI8SU1vZGVsQ29udGVudENoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbENvbnRlbnQ6IEV2ZW50PElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbENvbnRlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlOiBFbWl0dGVyPElNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb2RlbExhbmd1YWdlQ2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlOiBFdmVudDxJTW9kZWxMYW5ndWFnZUNoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbjogRW1pdHRlcjxJTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbjogRXZlbnQ8SU1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbE9wdGlvbnM6IEVtaXR0ZXI8SU1vZGVsT3B0aW9uc0NoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW9kZWxPcHRpb25zQ2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbE9wdGlvbnM6IEV2ZW50PElNb2RlbE9wdGlvbnNDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VNb2RlbE9wdGlvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbERlY29yYXRpb25zOiBFbWl0dGVyPElNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElNb2RlbERlY29yYXRpb25zQ2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbERlY29yYXRpb25zOiBFdmVudDxJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsRGVjb3JhdGlvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMaW5lSGVpZ2h0OiBFbWl0dGVyPE1vZGVsTGluZUhlaWdodENoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNb2RlbExpbmVIZWlnaHRDaGFuZ2VkRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUxpbmVIZWlnaHQ6IEV2ZW50PE1vZGVsTGluZUhlaWdodENoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUxpbmVIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VGb250OiBFbWl0dGVyPE1vZGVsRm9udENoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxNb2RlbEZvbnRDaGFuZ2VkRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUZvbnQ6IEV2ZW50PE1vZGVsRm9udENoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUZvbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbFRva2VuczogRW1pdHRlcjxJTW9kZWxUb2tlbnNDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vZGVsVG9rZW5zQ2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbFRva2VuczogRXZlbnQ8SU1vZGVsVG9rZW5zQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxUb2tlbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uOiBFbWl0dGVyPENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbjogRXZlbnQ8Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24uZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbldpbGxDaGFuZ2VNb2RlbDogRW1pdHRlcjxlZGl0b3JDb21tb24uSU1vZGVsQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGVkaXRvckNvbW1vbi5JTW9kZWxDaGFuZ2VkRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxDaGFuZ2VNb2RlbDogRXZlbnQ8ZWRpdG9yQ29tbW9uLklNb2RlbENoYW5nZWRFdmVudD4gPSB0aGlzLl9vbldpbGxDaGFuZ2VNb2RlbC5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTW9kZWw6IEVtaXR0ZXI8ZWRpdG9yQ29tbW9uLklNb2RlbENoYW5nZWRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxlZGl0b3JDb21tb24uSU1vZGVsQ2hhbmdlZEV2ZW50Pih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbDogRXZlbnQ8ZWRpdG9yQ29tbW9uLklNb2RlbENoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb246IEVtaXR0ZXI8SUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb246IEV2ZW50PElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uOiBFbWl0dGVyPElDdXJzb3JTZWxlY3Rpb25DaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUN1cnNvclNlbGVjdGlvbkNoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uOiBFdmVudDxJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQXR0ZW1wdFJlYWRPbmx5RWRpdDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8dm9pZD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRBdHRlbXB0UmVhZE9ubHlFZGl0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQXR0ZW1wdFJlYWRPbmx5RWRpdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dENoYW5nZTogRW1pdHRlcjxFZGl0b3JMYXlvdXRJbmZvPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEVkaXRvckxheW91dEluZm8+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZExheW91dENoYW5nZTogRXZlbnQ8RWRpdG9yTGF5b3V0SW5mbz4gPSB0aGlzLl9vbkRpZExheW91dENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JUZXh0Rm9jdXM6IEJvb2xlYW5FdmVudEVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQm9vbGVhbkV2ZW50RW1pdHRlcih7IGRlbGl2ZXJ5UXVldWU6IHRoaXMuX2RlbGl2ZXJ5UXVldWUgfSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRGb2N1c0VkaXRvclRleHQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fZWRpdG9yVGV4dEZvY3VzLm9uRGlkQ2hhbmdlVG9UcnVlO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRCbHVyRWRpdG9yVGV4dDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9lZGl0b3JUZXh0Rm9jdXMub25EaWRDaGFuZ2VUb0ZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcldpZGdldEZvY3VzOiBCb29sZWFuRXZlbnRFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJvb2xlYW5FdmVudEVtaXR0ZXIoeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRm9jdXNFZGl0b3JXaWRnZXQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fZWRpdG9yV2lkZ2V0Rm9jdXMub25EaWRDaGFuZ2VUb1RydWU7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZEJsdXJFZGl0b3JXaWRnZXQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fZWRpdG9yV2lkZ2V0Rm9jdXMub25EaWRDaGFuZ2VUb0ZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFR5cGU6IEVtaXR0ZXI8c3RyaW5nPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8c3RyaW5nPih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxUeXBlID0gdGhpcy5fb25XaWxsVHlwZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFR5cGU6IEVtaXR0ZXI8c3RyaW5nPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8c3RyaW5nPih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFR5cGUgPSB0aGlzLl9vbkRpZFR5cGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb21wb3NpdGlvblN0YXJ0OiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjx2b2lkPih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENvbXBvc2l0aW9uU3RhcnQgPSB0aGlzLl9vbkRpZENvbXBvc2l0aW9uU3RhcnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDb21wb3NpdGlvbkVuZDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8dm9pZD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDb21wb3NpdGlvbkVuZCA9IHRoaXMuX29uRGlkQ29tcG9zaXRpb25FbmQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQYXN0ZTogRW1pdHRlcjxlZGl0b3JCcm93c2VyLklQYXN0ZUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JUGFzdGVFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRQYXN0ZSA9IHRoaXMuX29uRGlkUGFzdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ29weTogRW1pdHRlcjxJQ2xpcGJvYXJkQ29weUV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8SUNsaXBib2FyZENvcHlFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQ29weSA9IHRoaXMuX29uV2lsbENvcHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ3V0OiBFbWl0dGVyPElDbGlwYm9hcmRDb3B5RXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxJQ2xpcGJvYXJkQ29weUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxDdXQgPSB0aGlzLl9vbldpbGxDdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsUGFzdGU6IEVtaXR0ZXI8SUNsaXBib2FyZFBhc3RlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxJQ2xpcGJvYXJkUGFzdGVFdmVudD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsUGFzdGUgPSB0aGlzLl9vbldpbGxQYXN0ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlVXA6IEVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW91c2VVcDogRXZlbnQ8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbk1vdXNlVXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb3VzZURvd246IEVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW91c2VEb3duOiBFdmVudDxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX29uTW91c2VEb3duLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VEcmFnOiBFbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlRHJhZzogRXZlbnQ8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9vbk1vdXNlRHJhZy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlRHJvcDogRW1pdHRlcjxlZGl0b3JCcm93c2VyLklQYXJ0aWFsRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPGVkaXRvckJyb3dzZXIuSVBhcnRpYWxFZGl0b3JNb3VzZUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlRHJvcDogRXZlbnQ8ZWRpdG9yQnJvd3Nlci5JUGFydGlhbEVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fb25Nb3VzZURyb3AuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb3VzZURyb3BDYW5jZWxlZDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnRlcmFjdGlvbkVtaXR0ZXI8dm9pZD4odGhpcy5fY29udHJpYnV0aW9ucywgdGhpcy5fZGVsaXZlcnlRdWV1ZSkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Nb3VzZURyb3BDYW5jZWxlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbk1vdXNlRHJvcENhbmNlbGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRHJvcEludG9FZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPHsgcmVhZG9ubHkgcG9zaXRpb246IElQb3NpdGlvbjsgcmVhZG9ubHkgZXZlbnQ6IERyYWdFdmVudCB9Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRyb3BJbnRvRWRpdG9yID0gdGhpcy5fb25Ecm9wSW50b0VkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbnRleHRNZW51OiBFbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEludGVyYWN0aW9uRW1pdHRlcjxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkNvbnRleHRNZW51OiBFdmVudDxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX29uQ29udGV4dE1lbnUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Nb3VzZU1vdmU6IEVtaXR0ZXI8ZWRpdG9yQnJvd3Nlci5JRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPGVkaXRvckJyb3dzZXIuSUVkaXRvck1vdXNlRXZlbnQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW91c2VNb3ZlOiBFdmVudDxlZGl0b3JCcm93c2VyLklFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX29uTW91c2VNb3ZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VMZWF2ZTogRW1pdHRlcjxlZGl0b3JCcm93c2VyLklQYXJ0aWFsRWRpdG9yTW91c2VFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPGVkaXRvckJyb3dzZXIuSVBhcnRpYWxFZGl0b3JNb3VzZUV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbk1vdXNlTGVhdmU6IEV2ZW50PGVkaXRvckJyb3dzZXIuSVBhcnRpYWxFZGl0b3JNb3VzZUV2ZW50PiA9IHRoaXMuX29uTW91c2VMZWF2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1vdXNlV2hlZWw6IEVtaXR0ZXI8SU1vdXNlV2hlZWxFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPElNb3VzZVdoZWVsRXZlbnQ+KHRoaXMuX2NvbnRyaWJ1dGlvbnMsIHRoaXMuX2RlbGl2ZXJ5UXVldWUpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uTW91c2VXaGVlbDogRXZlbnQ8SU1vdXNlV2hlZWxFdmVudD4gPSB0aGlzLl9vbk1vdXNlV2hlZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25LZXlVcDogRW1pdHRlcjxJS2V5Ym9hcmRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPElLZXlib2FyZEV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbktleVVwOiBFdmVudDxJS2V5Ym9hcmRFdmVudD4gPSB0aGlzLl9vbktleVVwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uS2V5RG93bjogRW1pdHRlcjxJS2V5Ym9hcmRFdmVudD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJhY3Rpb25FbWl0dGVyPElLZXlib2FyZEV2ZW50Pih0aGlzLl9jb250cmlidXRpb25zLCB0aGlzLl9kZWxpdmVyeVF1ZXVlKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbktleURvd246IEV2ZW50PElLZXlib2FyZEV2ZW50PiA9IHRoaXMuX29uS2V5RG93bi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENvbnRlbnRTaXplQ2hhbmdlOiBFbWl0dGVyPGVkaXRvckNvbW1vbi5JQ29udGVudFNpemVDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8ZWRpdG9yQ29tbW9uLklDb250ZW50U2l6ZUNoYW5nZWRFdmVudD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ29udGVudFNpemVDaGFuZ2U6IEV2ZW50PGVkaXRvckNvbW1vbi5JQ29udGVudFNpemVDaGFuZ2VkRXZlbnQ+ID0gdGhpcy5fb25EaWRDb250ZW50U2l6ZUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjcm9sbENoYW5nZTogRW1pdHRlcjxlZGl0b3JDb21tb24uSVNjcm9sbEV2ZW50PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGVkaXRvckNvbW1vbi5JU2Nyb2xsRXZlbnQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFNjcm9sbENoYW5nZTogRXZlbnQ8ZWRpdG9yQ29tbW9uLklTY3JvbGxFdmVudD4gPSB0aGlzLl9vbkRpZFNjcm9sbENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdab25lczogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KHsgZGVsaXZlcnlRdWV1ZTogdGhpcy5fZGVsaXZlcnlRdWV1ZSB9KSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVZpZXdab25lczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdab25lcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhpZGRlbkFyZWFzOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oeyBkZWxpdmVyeVF1ZXVlOiB0aGlzLl9kZWxpdmVyeVF1ZXVlIH0pKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGlkZGVuQXJlYXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VIaWRkZW5BcmVhcy5ldmVudDtcblxuXHRwcml2YXRlIF91cGRhdGVDb3VudGVyID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQ6IEVtaXR0ZXI8ZWRpdG9yQ29tbW9uLklUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8ZWRpdG9yQ29tbW9uLklUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsVHJpZ2dlckVkaXRvck9wZXJhdGlvbkV2ZW50OiBFdmVudDxlZGl0b3JDb21tb24uSVRyaWdnZXJFZGl0b3JPcGVyYXRpb25FdmVudD4gPSB0aGlzLl9vbldpbGxUcmlnZ2VyRWRpdG9yT3BlcmF0aW9uRXZlbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWdpblVwZGF0ZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25CZWdpblVwZGF0ZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkJlZ2luVXBkYXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRW5kVXBkYXRlOiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkVuZFVwZGF0ZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkVuZFVwZGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJlZm9yZUV4ZWN1dGVFZGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZCB9PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQmVmb3JlRXhlY3V0ZUVkaXQgPSB0aGlzLl9vbkJlZm9yZUV4ZWN1dGVFZGl0LmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHB1YmxpYyBnZXQgaXNTaW1wbGVXaWRnZXQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uaXNTaW1wbGVXaWRnZXQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvbnRleHRNZW51SWQoKTogTWVudUlkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5jb250ZXh0TWVudUlkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5RGF0YT86IG9iamVjdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21FbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lkOiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb246IElFZGl0b3JDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIF9jb250cmlidXRpb25zRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9hY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIGVkaXRvckNvbW1vbi5JRWRpdG9yQWN0aW9uPigpO1xuXG5cdC8vIC0tLSBNZW1iZXJzIGxvZ2ljYWxseSBhc3NvY2lhdGVkIHRvIGEgbW9kZWxcblx0cHJvdGVjdGVkIF9tb2RlbERhdGE6IE1vZGVsRGF0YSB8IG51bGw7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cdGdldCBjb250ZXh0S2V5U2VydmljZSgpIHsgcmV0dXJuIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlOyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNlckludGVyYWN0aW9uU2VydmljZTogSVVzZXJJbnRlcmFjdGlvblNlcnZpY2U7XG5cblx0cHJpdmF0ZSBfY29udGVudFdpZGdldHM6IHsgW2tleTogc3RyaW5nXTogSUNvbnRlbnRXaWRnZXREYXRhIH07XG5cdHByaXZhdGUgX292ZXJsYXlXaWRnZXRzOiB7IFtrZXk6IHN0cmluZ106IElPdmVybGF5V2lkZ2V0RGF0YSB9O1xuXHRwcml2YXRlIF9nbHlwaE1hcmdpbldpZGdldHM6IHsgW2tleTogc3RyaW5nXTogSUdseXBoTWFyZ2luV2lkZ2V0RGF0YSB9O1xuXG5cdC8qKlxuXHQgKiBtYXAgZnJvbSBcInBhcmVudFwiIGRlY29yYXRpb24gdHlwZSB0byBsaXZlIGRlY29yYXRpb24gaWRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVjb3JhdGlvblR5cGVLZXlzVG9JZHM6IHsgW2RlY29yYXRpb25UeXBlS2V5OiBzdHJpbmddOiBzdHJpbmdbXSB9O1xuXHRwcml2YXRlIF9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzOiB7IFtkZWNvcmF0aW9uVHlwZUtleTogc3RyaW5nXTogeyBbc3VidHlwZTogc3RyaW5nXTogYm9vbGVhbiB9IH07XG5cblx0cHJpdmF0ZSBfYmFubmVyRG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIF9kcm9wSW50b0VkaXRvckRlY29yYXRpb25zOiBFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gPSB0aGlzLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXG5cdHB1YmxpYyBpbkNvbXBvc2l0aW9uOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZG9tRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0X29wdGlvbnM6IFJlYWRvbmx5PElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zPixcblx0XHRjb2RlRWRpdG9yV2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIGNvZGVFZGl0b3JTZXJ2aWNlOiBJQ29kZUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIHVzZXJJbnRlcmFjdGlvblNlcnZpY2U6IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvZGVFZGl0b3JTZXJ2aWNlLndpbGxDcmVhdGVDb2RlRWRpdG9yKCk7XG5cblx0XHRjb25zdCBvcHRpb25zID0geyAuLi5fb3B0aW9ucyB9O1xuXG5cdFx0dGhpcy5fZG9tRWxlbWVudCA9IGRvbUVsZW1lbnQ7XG5cdFx0dGhpcy5fdXNlckludGVyYWN0aW9uU2VydmljZSA9IHVzZXJJbnRlcmFjdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSA9IG9wdGlvbnMub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTtcblx0XHRkZWxldGUgb3B0aW9ucy5vdmVyZmxvd1dpZGdldHNEb21Ob2RlO1xuXHRcdHRoaXMuX2lkID0gKCsrRURJVE9SX0lEKTtcblx0XHR0aGlzLl9kZWNvcmF0aW9uVHlwZUtleXNUb0lkcyA9IHt9O1xuXHRcdHRoaXMuX2RlY29yYXRpb25UeXBlU3VidHlwZXMgPSB7fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlEYXRhID0gY29kZUVkaXRvcldpZGdldE9wdGlvbnMudGVsZW1ldHJ5RGF0YTtcblxuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24gPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9jcmVhdGVDb25maWd1cmF0aW9uKGNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLmlzU2ltcGxlV2lkZ2V0IHx8IGZhbHNlLFxuXHRcdFx0Y29kZUVkaXRvcldpZGdldE9wdGlvbnMuY29udGV4dE1lbnVJZCA/PyAoY29kZUVkaXRvcldpZGdldE9wdGlvbnMuaXNTaW1wbGVXaWRnZXQgPyBNZW51SWQuU2ltcGxlRWRpdG9yQ29udGV4dCA6IE1lbnVJZC5FZGl0b3JDb250ZXh0KSxcblx0XHRcdG9wdGlvbnMsIGFjY2Vzc2liaWxpdHlTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fZG9tRWxlbWVudC5zdHlsZT8uc2V0UHJvcGVydHkoJy0tZWRpdG9yLWZvbnQtc2l6ZScsIHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbnRTaXplKSArICdweCcpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb24ub25EaWRDaGFuZ2UoKGUpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbi5maXJlKGUpO1xuXG5cdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGF5b3V0SW5mbykpIHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRcdFx0dGhpcy5fb25EaWRMYXlvdXRDaGFuZ2UuZmlyZShsYXlvdXRJbmZvKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRTaXplKSkge1xuXHRcdFx0XHR0aGlzLl9kb21FbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLWVkaXRvci1mb250LXNpemUnLCBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udFNpemUpICsgJ3B4Jyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5fZG9tRWxlbWVudCkpO1xuXHRcdGlmIChjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucy5jb250ZXh0S2V5VmFsdWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucy5jb250ZXh0S2V5VmFsdWVzKSkge1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UgPSBub3RpZmljYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlID0gY29kZUVkaXRvclNlcnZpY2U7XG5cdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UgPSBjb21tYW5kU2VydmljZTtcblx0XHR0aGlzLl90aGVtZVNlcnZpY2UgPSB0aGVtZVNlcnZpY2U7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IEVkaXRvckNvbnRleHRLZXlzTWFuYWdlcih0aGlzLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG5ldyBFZGl0b3JNb2RlQ29udGV4dCh0aGlzLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UpKTtcblxuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdHRoaXMuX21vZGVsRGF0YSA9IG51bGw7XG5cblx0XHR0aGlzLl9jb250ZW50V2lkZ2V0cyA9IHt9O1xuXHRcdHRoaXMuX292ZXJsYXlXaWRnZXRzID0ge307XG5cdFx0dGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzID0ge307XG5cblx0XHRsZXQgY29udHJpYnV0aW9uczogSUVkaXRvckNvbnRyaWJ1dGlvbkRlc2NyaXB0aW9uW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY29kZUVkaXRvcldpZGdldE9wdGlvbnMuY29udHJpYnV0aW9ucykpIHtcblx0XHRcdGNvbnRyaWJ1dGlvbnMgPSBjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucy5jb250cmlidXRpb25zO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250cmlidXRpb25zID0gRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKTtcblx0XHR9XG5cdFx0dGhpcy5fY29udHJpYnV0aW9ucy5pbml0aWFsaXplKHRoaXMsIGNvbnRyaWJ1dGlvbnMsIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JBY3Rpb25zKCkpIHtcblx0XHRcdGlmICh0aGlzLl9hY3Rpb25zLmhhcyhhY3Rpb24uaWQpKSB7XG5cdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBFcnJvcihgQ2Fubm90IGhhdmUgdHdvIGFjdGlvbnMgd2l0aCB0aGUgc2FtZSBpZCAke2FjdGlvbi5pZH1gKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW50ZXJuYWxBY3Rpb24gPSBuZXcgSW50ZXJuYWxFZGl0b3JBY3Rpb24oXG5cdFx0XHRcdGFjdGlvbi5pZCxcblx0XHRcdFx0YWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRhY3Rpb24uYWxpYXMsXG5cdFx0XHRcdGFjdGlvbi5tZXRhZGF0YSxcblx0XHRcdFx0YWN0aW9uLnByZWNvbmRpdGlvbiA/PyB1bmRlZmluZWQsXG5cdFx0XHRcdChhcmdzOiB1bmtub3duKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgdGhpcywgYXJncykpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2FjdGlvbnMuc2V0KGludGVybmFsQWN0aW9uLmlkLCBpbnRlcm5hbEFjdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNEcm9wSW50b0VuYWJsZWQgPSAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gIXRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KVxuXHRcdFx0XHQmJiB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5kcm9wSW50b0VkaXRvcikuZW5hYmxlZDtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EcmFnQW5kRHJvcE9ic2VydmVyKHRoaXMuX2RvbUVsZW1lbnQsIHtcblx0XHRcdG9uRHJhZ092ZXI6IGUgPT4ge1xuXHRcdFx0XHRpZiAoIWlzRHJvcEludG9FbmFibGVkKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmdldFRhcmdldEF0Q2xpZW50UG9pbnQoZS5jbGllbnRYLCBlLmNsaWVudFkpO1xuXHRcdFx0XHRpZiAodGFyZ2V0Py5wb3NpdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuc2hvd0Ryb3BJbmRpY2F0b3JBdCh0YXJnZXQucG9zaXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25Ecm9wOiBhc3luYyBlID0+IHtcblx0XHRcdFx0aWYgKCFpc0Ryb3BJbnRvRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5yZW1vdmVEcm9wSW5kaWNhdG9yKCk7XG5cblx0XHRcdFx0aWYgKCFlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuZ2V0VGFyZ2V0QXRDbGllbnRQb2ludChlLmNsaWVudFgsIGUuY2xpZW50WSk7XG5cdFx0XHRcdGlmICh0YXJnZXQ/LnBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25Ecm9wSW50b0VkaXRvci5maXJlKHsgcG9zaXRpb246IHRhcmdldC5wb3NpdGlvbiwgZXZlbnQ6IGUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdMZWF2ZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnJlbW92ZURyb3BJbmRpY2F0b3IoKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdFbmQ6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5yZW1vdmVEcm9wSW5kaWNhdG9yKCk7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLmFkZENvZGVFZGl0b3IodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgd3JpdGVTY3JlZW5SZWFkZXJDb250ZW50KHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxEYXRhPy52aWV3LndyaXRlU2NyZWVuUmVhZGVyQ29udGVudChyZWFzb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9jcmVhdGVDb25maWd1cmF0aW9uKGlzU2ltcGxlV2lkZ2V0OiBib29sZWFuLCBjb250ZXh0TWVudUlkOiBNZW51SWQsIG9wdGlvbnM6IFJlYWRvbmx5PElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zPiwgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSk6IEVkaXRvckNvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiBuZXcgRWRpdG9yQ29uZmlndXJhdGlvbihpc1NpbXBsZVdpZGdldCwgY29udGV4dE1lbnVJZCwgb3B0aW9ucywgdGhpcy5fZG9tRWxlbWVudCwgYWNjZXNzaWJpbGl0eVNlcnZpY2UpO1xuXHR9XG5cblx0cHVibGljIGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdG9yVHlwZSgpICsgJzonICsgdGhpcy5faWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWRpdG9yVHlwZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBlZGl0b3JDb21tb24uRWRpdG9yVHlwZS5JQ29kZUVkaXRvcjtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnJlbW92ZUNvZGVFZGl0b3IodGhpcyk7XG5cblx0XHR0aGlzLl9hY3Rpb25zLmNsZWFyKCk7XG5cdFx0dGhpcy5fY29udGVudFdpZGdldHMgPSB7fTtcblx0XHR0aGlzLl9vdmVybGF5V2lkZ2V0cyA9IHt9O1xuXG5cdFx0dGhpcy5fcmVtb3ZlRGVjb3JhdGlvblR5cGVzKCk7XG5cdFx0dGhpcy5fcG9zdERldGFjaE1vZGVsQ2xlYW51cCh0aGlzLl9kZXRhY2hNb2RlbCgpKTtcblxuXHRcdHRoaXMuX29uRGlkRGlzcG9zZS5maXJlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgaW52b2tlV2l0aGluQ29udGV4dDxUPihmbjogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiBUKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZuKTtcblx0fVxuXG5cdHB1YmxpYyB1cGRhdGVPcHRpb25zKG5ld09wdGlvbnM6IFJlYWRvbmx5PElFZGl0b3JPcHRpb25zPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24udXBkYXRlT3B0aW9ucyhuZXdPcHRpb25zIHx8IHt9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRPcHRpb25zKCk6IElDb21wdXRlZEVkaXRvck9wdGlvbnMge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3B0aW9uPFQgZXh0ZW5kcyBFZGl0b3JPcHRpb24+KGlkOiBUKTogRmluZENvbXB1dGVkRWRpdG9yT3B0aW9uVmFsdWVCeUlkPFQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChpZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmF3T3B0aW9ucygpOiBJRWRpdG9yT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb24uZ2V0UmF3T3B0aW9ucygpO1xuXHR9XG5cblx0cHVibGljIGdldE92ZXJmbG93V2lkZ2V0c0RvbU5vZGUoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vdmVyZmxvd1dpZGdldHNEb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIGdldENvbmZpZ3VyZWRXb3JkQXRQb3NpdGlvbihwb3NpdGlvbjogUG9zaXRpb24pOiBJV29yZEF0UG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBXb3JkT3BlcmF0aW9ucy5nZXRXb3JkQXRQb3NpdGlvbih0aGlzLl9tb2RlbERhdGEubW9kZWwsIHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRTZXBhcmF0b3JzKSwgdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFNlZ21lbnRlckxvY2FsZXMpLCBwb3NpdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmFsdWUob3B0aW9uczogeyBwcmVzZXJ2ZUJPTTogYm9vbGVhbjsgbGluZUVuZGluZzogc3RyaW5nIH0gfCBudWxsID0gbnVsbCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBwcmVzZXJ2ZUJPTTogYm9vbGVhbiA9IChvcHRpb25zICYmIG9wdGlvbnMucHJlc2VydmVCT00pID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdGxldCBlb2xQcmVmZXJlbmNlID0gRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucyAmJiBvcHRpb25zLmxpbmVFbmRpbmcgJiYgb3B0aW9ucy5saW5lRW5kaW5nID09PSAnXFxuJykge1xuXHRcdFx0ZW9sUHJlZmVyZW5jZSA9IEVuZE9mTGluZVByZWZlcmVuY2UuTEY7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zICYmIG9wdGlvbnMubGluZUVuZGluZyAmJiBvcHRpb25zLmxpbmVFbmRpbmcgPT09ICdcXHJcXG4nKSB7XG5cdFx0XHRlb2xQcmVmZXJlbmNlID0gRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLmdldFZhbHVlKGVvbFByZWZlcmVuY2UsIHByZXNlcnZlQk9NKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWYWx1ZShuZXdWYWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2JlZ2luVXBkYXRlKCk7XG5cdFx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tb2RlbERhdGEubW9kZWwuc2V0VmFsdWUobmV3VmFsdWUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9lbmRVcGRhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW9kZWwoKTogSVRleHRNb2RlbCB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS5tb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBzZXRNb2RlbChfbW9kZWw6IElUZXh0TW9kZWwgfCBlZGl0b3JDb21tb24uSURpZmZFZGl0b3JNb2RlbCB8IGVkaXRvckNvbW1vbi5JRGlmZkVkaXRvclZpZXdNb2RlbCB8IG51bGwgPSBudWxsKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2JlZ2luVXBkYXRlKCk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IDxJVGV4dE1vZGVsIHwgbnVsbD5fbW9kZWw7XG5cdFx0XHRpZiAodGhpcy5fbW9kZWxEYXRhID09PSBudWxsICYmIG1vZGVsID09PSBudWxsKSB7XG5cdFx0XHRcdC8vIEN1cnJlbnQgbW9kZWwgaXMgdGhlIG5ldyBtb2RlbFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fbW9kZWxEYXRhICYmIHRoaXMuX21vZGVsRGF0YS5tb2RlbCA9PT0gbW9kZWwpIHtcblx0XHRcdFx0Ly8gQ3VycmVudCBtb2RlbCBpcyB0aGUgbmV3IG1vZGVsXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZTogZWRpdG9yQ29tbW9uLklNb2RlbENoYW5nZWRFdmVudCA9IHtcblx0XHRcdFx0b2xkTW9kZWxVcmw6IHRoaXMuX21vZGVsRGF0YT8ubW9kZWwudXJpIHx8IG51bGwsXG5cdFx0XHRcdG5ld01vZGVsVXJsOiBtb2RlbD8udXJpIHx8IG51bGxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9vbldpbGxDaGFuZ2VNb2RlbC5maXJlKGUpO1xuXG5cdFx0XHRjb25zdCBoYXNUZXh0Rm9jdXMgPSB0aGlzLmhhc1RleHRGb2N1cygpO1xuXHRcdFx0Y29uc3QgZGV0YWNoZWRNb2RlbCA9IHRoaXMuX2RldGFjaE1vZGVsKCk7XG5cdFx0XHR0aGlzLl9hdHRhY2hNb2RlbChtb2RlbCk7XG5cdFx0XHRpZiAodGhpcy5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdC8vIHdlIGhhdmUgYSBuZXcgbW9kZWwgKHdpdGggYSBuZXcgdmlldykhXG5cdFx0XHRcdGlmIChoYXNUZXh0Rm9jdXMpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHdlIGhhdmUgbm8gbW9kZWwgKGFuZCBubyB2aWV3KSBhbnltb3JlXG5cdFx0XHRcdC8vIG1ha2Ugc3VyZSB0aGUgb3V0c2lkZSB3b3JsZCBrbm93cyB3ZSBhcmUgbm90IGZvY3VzZWRcblx0XHRcdFx0dGhpcy5fZWRpdG9yVGV4dEZvY3VzLnNldFZhbHVlKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yV2lkZ2V0Rm9jdXMuc2V0VmFsdWUoZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZW1vdmVEZWNvcmF0aW9uVHlwZXMoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWwuZmlyZShlKTtcblx0XHRcdHRoaXMuX3Bvc3REZXRhY2hNb2RlbENsZWFudXAoZGV0YWNoZWRNb2RlbCk7XG5cblx0XHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnNEaXNwb3NhYmxlID0gdGhpcy5fY29udHJpYnV0aW9ucy5vbkFmdGVyTW9kZWxBdHRhY2hlZCgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9lbmRVcGRhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVEZWNvcmF0aW9uVHlwZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHMgPSB7fTtcblx0XHRpZiAodGhpcy5fZGVjb3JhdGlvblR5cGVTdWJ0eXBlcykge1xuXHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uVHlwZSBpbiB0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzKSB7XG5cdFx0XHRcdGNvbnN0IHN1YlR5cGVzID0gdGhpcy5fZGVjb3JhdGlvblR5cGVTdWJ0eXBlc1tkZWNvcmF0aW9uVHlwZV07XG5cdFx0XHRcdGZvciAoY29uc3Qgc3ViVHlwZSBpbiBzdWJUeXBlcykge1xuXHRcdFx0XHRcdHRoaXMuX3JlbW92ZURlY29yYXRpb25UeXBlKGRlY29yYXRpb25UeXBlICsgJy0nICsgc3ViVHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX2RlY29yYXRpb25UeXBlU3VidHlwZXMgPSB7fTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZVJhbmdlcygpOiBSYW5nZVtdIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZVJhbmdlc1BsdXNWaWV3cG9ydEFib3ZlQmVsb3coKTogUmFuZ2VbXSB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZ2V0VmlzaWJsZVJhbmdlc1BsdXNWaWV3cG9ydEFib3ZlQmVsb3coKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXaGl0ZXNwYWNlcygpOiBJRWRpdG9yV2hpdGVzcGFjZVtdIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC52aWV3TGF5b3V0LmdldFdoaXRlc3BhY2VzKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfZ2V0VmVydGljYWxPZmZzZXRBZnRlclBvc2l0aW9uKG1vZGVsRGF0YTogTW9kZWxEYXRhLCBtb2RlbExpbmVOdW1iZXI6IG51bWJlciwgbW9kZWxDb2x1bW46IG51bWJlciwgaW5jbHVkZVZpZXdab25lczogYm9vbGVhbik6IG51bWJlciB7XG5cdFx0Y29uc3QgbW9kZWxQb3NpdGlvbiA9IG1vZGVsRGF0YS5tb2RlbC52YWxpZGF0ZVBvc2l0aW9uKHtcblx0XHRcdGxpbmVOdW1iZXI6IG1vZGVsTGluZU51bWJlcixcblx0XHRcdGNvbHVtbjogbW9kZWxDb2x1bW5cblx0XHR9KTtcblx0XHRjb25zdCB2aWV3UG9zaXRpb24gPSBtb2RlbERhdGEudmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obW9kZWxQb3NpdGlvbik7XG5cdFx0cmV0dXJuIG1vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRWZXJ0aWNhbE9mZnNldEFmdGVyTGluZU51bWJlcih2aWV3UG9zaXRpb24ubGluZU51bWJlciwgaW5jbHVkZVZpZXdab25lcyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VG9wRm9yTGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIsIGluY2x1ZGVWaWV3Wm9uZXM6IGJvb2xlYW4gPSBmYWxzZSk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIENvZGVFZGl0b3JXaWRnZXQuX2dldFZlcnRpY2FsT2Zmc2V0Rm9yUG9zaXRpb24odGhpcy5fbW9kZWxEYXRhLCBsaW5lTnVtYmVyLCAxLCBpbmNsdWRlVmlld1pvbmVzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb3BGb3JQb3NpdGlvbihsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29kZUVkaXRvcldpZGdldC5fZ2V0VmVydGljYWxPZmZzZXRGb3JQb3NpdGlvbih0aGlzLl9tb2RlbERhdGEsIGxpbmVOdW1iZXIsIGNvbHVtbiwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2dldFZlcnRpY2FsT2Zmc2V0Rm9yUG9zaXRpb24obW9kZWxEYXRhOiBNb2RlbERhdGEsIG1vZGVsTGluZU51bWJlcjogbnVtYmVyLCBtb2RlbENvbHVtbjogbnVtYmVyLCBpbmNsdWRlVmlld1pvbmVzOiBib29sZWFuID0gZmFsc2UpOiBudW1iZXIge1xuXHRcdGNvbnN0IG1vZGVsUG9zaXRpb24gPSBtb2RlbERhdGEubW9kZWwudmFsaWRhdGVQb3NpdGlvbih7XG5cdFx0XHRsaW5lTnVtYmVyOiBtb2RlbExpbmVOdW1iZXIsXG5cdFx0XHRjb2x1bW46IG1vZGVsQ29sdW1uXG5cdFx0fSk7XG5cdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gbW9kZWxEYXRhLnZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlci5jb252ZXJ0TW9kZWxQb3NpdGlvblRvVmlld1Bvc2l0aW9uKG1vZGVsUG9zaXRpb24pO1xuXHRcdHJldHVybiBtb2RlbERhdGEudmlld01vZGVsLnZpZXdMYXlvdXQuZ2V0VmVydGljYWxPZmZzZXRGb3JMaW5lTnVtYmVyKHZpZXdQb3NpdGlvbi5saW5lTnVtYmVyLCBpbmNsdWRlVmlld1pvbmVzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRCb3R0b21Gb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXI6IG51bWJlciwgaW5jbHVkZVZpZXdab25lczogYm9vbGVhbiA9IGZhbHNlKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gQ29kZUVkaXRvcldpZGdldC5fZ2V0VmVydGljYWxPZmZzZXRBZnRlclBvc2l0aW9uKHRoaXMuX21vZGVsRGF0YSwgbGluZU51bWJlciwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIsIGluY2x1ZGVWaWV3Wm9uZXMpO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsO1xuXHRcdGNvbnN0IGNvb3JkaW5hdGVzQ29udmVydGVyID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyO1xuXHRcdGNvbnN0IHBvcyA9IFBvc2l0aW9uLmxpZnQocG9zaXRpb24pO1xuXHRcdGlmIChjb29yZGluYXRlc0NvbnZlcnRlci5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKHBvcykpIHtcblx0XHRcdGNvbnN0IHZpZXdQb3NpdGlvbiA9IGNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24ocG9zKTtcblx0XHRcdHJldHVybiB2aWV3TW9kZWwudmlld0xheW91dC5nZXRMaW5lSGVpZ2h0Rm9yTGluZU51bWJlcih2aWV3UG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0fVxuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cHVibGljIHNldEhpZGRlbkFyZWFzKHJhbmdlczogSVJhbmdlW10sIHNvdXJjZT86IHVua25vd24sIGZvcmNlVXBkYXRlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsRGF0YT8udmlld01vZGVsLnNldEhpZGRlbkFyZWFzKHJhbmdlcy5tYXAociA9PiBSYW5nZS5saWZ0KHIpKSwgc291cmNlLCBmb3JjZVVwZGF0ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZUNvbHVtbkZyb21Qb3NpdGlvbihyYXdQb3NpdGlvbjogSVBvc2l0aW9uKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIHJhd1Bvc2l0aW9uLmNvbHVtbjtcblx0XHR9XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX21vZGVsRGF0YS5tb2RlbC52YWxpZGF0ZVBvc2l0aW9uKHJhd1Bvc2l0aW9uKTtcblx0XHRjb25zdCB0YWJTaXplID0gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplO1xuXG5cdFx0cmV0dXJuIEN1cnNvckNvbHVtbnMudmlzaWJsZUNvbHVtbkZyb21Db2x1bW4odGhpcy5fbW9kZWxEYXRhLm1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLCBwb3NpdGlvbi5jb2x1bW4sIHRhYlNpemUpICsgMTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTdGF0dXNiYXJDb2x1bW4ocmF3UG9zaXRpb246IElQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiByYXdQb3NpdGlvbi5jb2x1bW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9tb2RlbERhdGEubW9kZWwudmFsaWRhdGVQb3NpdGlvbihyYXdQb3NpdGlvbik7XG5cdFx0Y29uc3QgdGFiU2l6ZSA9IHRoaXMuX21vZGVsRGF0YS5tb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZTtcblxuXHRcdHJldHVybiBDdXJzb3JDb2x1bW5zLnRvU3RhdHVzYmFyQ29sdW1uKHRoaXMuX21vZGVsRGF0YS5tb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSwgcG9zaXRpb24uY29sdW1uLCB0YWJTaXplKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQb3NpdGlvbigpOiBQb3NpdGlvbiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZ2V0UG9zaXRpb24oKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uLCBzb3VyY2U6IHN0cmluZyA9ICdhcGknKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFQb3NpdGlvbi5pc0lQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKHNvdXJjZSwgW3tcblx0XHRcdHNlbGVjdGlvblN0YXJ0TGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdHNlbGVjdGlvblN0YXJ0Q29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRwb3NpdGlvbkxpbmVOdW1iZXI6IHBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHRwb3NpdGlvbkNvbHVtbjogcG9zaXRpb24uY29sdW1uXG5cdFx0fV0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZFJldmVhbFJhbmdlKG1vZGVsUmFuZ2U6IFJhbmdlLCB2ZXJ0aWNhbFR5cGU6IFZlcnRpY2FsUmV2ZWFsVHlwZSwgcmV2ZWFsSG9yaXpvbnRhbDogYm9vbGVhbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIVJhbmdlLmlzSVJhbmdlKG1vZGVsUmFuZ2UpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbGlkYXRlZE1vZGVsUmFuZ2UgPSB0aGlzLl9tb2RlbERhdGEubW9kZWwudmFsaWRhdGVSYW5nZShtb2RlbFJhbmdlKTtcblx0XHRjb25zdCB2aWV3UmFuZ2UgPSB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UodmFsaWRhdGVkTW9kZWxSYW5nZSk7XG5cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnJldmVhbFJhbmdlKCdhcGknLCByZXZlYWxIb3Jpem9udGFsLCB2aWV3UmFuZ2UsIHZlcnRpY2FsVHlwZSwgc2Nyb2xsVHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsQWxsQ3Vyc29ycyhyZXZlYWxIb3Jpem9udGFsOiBib29sZWFuLCBtaW5pbWFsUmV2ZWFsPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwucmV2ZWFsQWxsQ3Vyc29ycygnYXBpJywgcmV2ZWFsSG9yaXpvbnRhbCwgbWluaW1hbFJldmVhbCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZShsaW5lTnVtYmVyOiBudW1iZXIsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsTGluZShsaW5lTnVtYmVyLCBWZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLCBzY3JvbGxUeXBlKTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxMaW5lSW5DZW50ZXIobGluZU51bWJlcjogbnVtYmVyLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbExpbmUobGluZU51bWJlciwgVmVydGljYWxSZXZlYWxUeXBlLkNlbnRlciwgc2Nyb2xsVHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQobGluZU51bWJlcjogbnVtYmVyLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbExpbmUobGluZU51bWJlciwgVmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LCBzY3JvbGxUeXBlKTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxMaW5lTmVhclRvcChsaW5lTnVtYmVyOiBudW1iZXIsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsTGluZShsaW5lTnVtYmVyLCBWZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcCwgc2Nyb2xsVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxMaW5lKGxpbmVOdW1iZXI6IG51bWJlciwgcmV2ZWFsVHlwZTogVmVydGljYWxSZXZlYWxUeXBlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgbGluZU51bWJlciAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kUmV2ZWFsUmFuZ2UoXG5cdFx0XHRuZXcgUmFuZ2UobGluZU51bWJlciwgMSwgbGluZU51bWJlciwgMSksXG5cdFx0XHRyZXZlYWxUeXBlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFBvc2l0aW9uKFxuXHRcdFx0cG9zaXRpb24sXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFBvc2l0aW9uSW5DZW50ZXIocG9zaXRpb246IElQb3NpdGlvbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxQb3NpdGlvbihcblx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcixcblx0XHRcdHRydWUsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQocG9zaXRpb246IElQb3NpdGlvbiwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxQb3NpdGlvbihcblx0XHRcdHBvc2l0aW9uLFxuXHRcdFx0VmVydGljYWxSZXZlYWxUeXBlLkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFBvc2l0aW9uTmVhclRvcChwb3NpdGlvbjogSVBvc2l0aW9uLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFBvc2l0aW9uKFxuXHRcdFx0cG9zaXRpb24sXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcCxcblx0XHRcdHRydWUsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbFBvc2l0aW9uKHBvc2l0aW9uOiBJUG9zaXRpb24sIHZlcnRpY2FsVHlwZTogVmVydGljYWxSZXZlYWxUeXBlLCByZXZlYWxIb3Jpem9udGFsOiBib29sZWFuLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSk6IHZvaWQge1xuXHRcdGlmICghUG9zaXRpb24uaXNJUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZFJldmVhbFJhbmdlKFxuXHRcdFx0bmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSxcblx0XHRcdHZlcnRpY2FsVHlwZSxcblx0XHRcdHJldmVhbEhvcml6b250YWwsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogU2VsZWN0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb25zKCk6IFNlbGVjdGlvbltdIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2VsZWN0aW9uKHJhbmdlOiBJUmFuZ2UsIHNvdXJjZT86IHN0cmluZyk6IHZvaWQ7XG5cdHB1YmxpYyBzZXRTZWxlY3Rpb24oZWRpdG9yUmFuZ2U6IFJhbmdlLCBzb3VyY2U/OiBzdHJpbmcpOiB2b2lkO1xuXHRwdWJsaWMgc2V0U2VsZWN0aW9uKHNlbGVjdGlvbjogSVNlbGVjdGlvbiwgc291cmNlPzogc3RyaW5nKTogdm9pZDtcblx0cHVibGljIHNldFNlbGVjdGlvbihlZGl0b3JTZWxlY3Rpb246IFNlbGVjdGlvbiwgc291cmNlPzogc3RyaW5nKTogdm9pZDtcblx0cHVibGljIHNldFNlbGVjdGlvbihzb21ldGhpbmc6IHVua25vd24sIHNvdXJjZT86IHN0cmluZyk6IHZvaWQ7XG5cdHB1YmxpYyBzZXRTZWxlY3Rpb24oc29tZXRoaW5nOiB1bmtub3duLCBzb3VyY2U6IHN0cmluZyA9ICdhcGknKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNTZWxlY3Rpb24gPSBTZWxlY3Rpb24uaXNJU2VsZWN0aW9uKHNvbWV0aGluZyk7XG5cdFx0Y29uc3QgaXNSYW5nZSA9IFJhbmdlLmlzSVJhbmdlKHNvbWV0aGluZyk7XG5cblx0XHRpZiAoIWlzU2VsZWN0aW9uICYmICFpc1JhbmdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzU2VsZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9zZXRTZWxlY3Rpb25JbXBsKHNvbWV0aGluZywgc291cmNlKTtcblx0XHR9IGVsc2UgaWYgKGlzUmFuZ2UpIHtcblx0XHRcdC8vIGFjdCBhcyBpZiBpdCB3YXMgYW4gSVJhbmdlXG5cdFx0XHRjb25zdCBzZWxlY3Rpb246IElTZWxlY3Rpb24gPSB7XG5cdFx0XHRcdHNlbGVjdGlvblN0YXJ0TGluZU51bWJlcjogc29tZXRoaW5nLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0c2VsZWN0aW9uU3RhcnRDb2x1bW46IHNvbWV0aGluZy5zdGFydENvbHVtbixcblx0XHRcdFx0cG9zaXRpb25MaW5lTnVtYmVyOiBzb21ldGhpbmcuZW5kTGluZU51bWJlcixcblx0XHRcdFx0cG9zaXRpb25Db2x1bW46IHNvbWV0aGluZy5lbmRDb2x1bW5cblx0XHRcdH07XG5cdFx0XHR0aGlzLl9zZXRTZWxlY3Rpb25JbXBsKHNlbGVjdGlvbiwgc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTZWxlY3Rpb25JbXBsKHNlbDogSVNlbGVjdGlvbiwgc291cmNlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBuZXcgU2VsZWN0aW9uKHNlbC5zZWxlY3Rpb25TdGFydExpbmVOdW1iZXIsIHNlbC5zZWxlY3Rpb25TdGFydENvbHVtbiwgc2VsLnBvc2l0aW9uTGluZU51bWJlciwgc2VsLnBvc2l0aW9uQ29sdW1uKTtcblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnNldFNlbGVjdGlvbnMoc291cmNlLCBbc2VsZWN0aW9uXSk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZXMoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxMaW5lcyhcblx0XHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRcdGVuZExpbmVOdW1iZXIsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuU2ltcGxlLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsTGluZXNJbkNlbnRlcihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbExpbmVzKFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0ZW5kTGluZU51bWJlcixcblx0XHRcdFZlcnRpY2FsUmV2ZWFsVHlwZS5DZW50ZXIsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxMaW5lc0luQ2VudGVySWZPdXRzaWRlVmlld3BvcnQoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxMaW5lcyhcblx0XHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRcdGVuZExpbmVOdW1iZXIsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxMaW5lc05lYXJUb3Aoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZlYWxMaW5lcyhcblx0XHRcdHN0YXJ0TGluZU51bWJlcixcblx0XHRcdGVuZExpbmVOdW1iZXIsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuTmVhclRvcCxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsTGluZXMoc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZExpbmVOdW1iZXI6IG51bWJlciwgdmVydGljYWxUeXBlOiBWZXJ0aWNhbFJldmVhbFR5cGUsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiBzdGFydExpbmVOdW1iZXIgIT09ICdudW1iZXInIHx8IHR5cGVvZiBlbmRMaW5lTnVtYmVyICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlbmRSZXZlYWxSYW5nZShcblx0XHRcdG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIDEsIGVuZExpbmVOdW1iZXIsIDEpLFxuXHRcdFx0dmVydGljYWxUeXBlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyByZXZlYWxSYW5nZShyYW5nZTogSVJhbmdlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCwgcmV2ZWFsVmVydGljYWxJbkNlbnRlcjogYm9vbGVhbiA9IGZhbHNlLCByZXZlYWxIb3Jpem9udGFsOiBib29sZWFuID0gdHJ1ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFJhbmdlKFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRyZXZlYWxWZXJ0aWNhbEluQ2VudGVyID8gVmVydGljYWxSZXZlYWxUeXBlLkNlbnRlciA6IFZlcnRpY2FsUmV2ZWFsVHlwZS5TaW1wbGUsXG5cdFx0XHRyZXZlYWxIb3Jpem9udGFsLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsUmFuZ2VJbkNlbnRlcihyYW5nZTogSVJhbmdlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFJhbmdlKFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuQ2VudGVyLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChyYW5nZTogSVJhbmdlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFJhbmdlKFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsUmFuZ2VOZWFyVG9wKHJhbmdlOiBJUmFuZ2UsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsUmFuZ2UoXG5cdFx0XHRyYW5nZSxcblx0XHRcdFZlcnRpY2FsUmV2ZWFsVHlwZS5OZWFyVG9wLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFJhbmdlTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0KHJhbmdlOiBJUmFuZ2UsIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlID0gZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuU21vb3RoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFsUmFuZ2UoXG5cdFx0XHRyYW5nZSxcblx0XHRcdFZlcnRpY2FsUmV2ZWFsVHlwZS5OZWFyVG9wSWZPdXRzaWRlVmlld3BvcnQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0c2Nyb2xsVHlwZVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgcmV2ZWFsUmFuZ2VBdFRvcChyYW5nZTogSVJhbmdlLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLlNtb290aCk6IHZvaWQge1xuXHRcdHRoaXMuX3JldmVhbFJhbmdlKFxuXHRcdFx0cmFuZ2UsXG5cdFx0XHRWZXJ0aWNhbFJldmVhbFR5cGUuVG9wLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNjcm9sbFR5cGVcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmV2ZWFsUmFuZ2UocmFuZ2U6IElSYW5nZSwgdmVydGljYWxUeXBlOiBWZXJ0aWNhbFJldmVhbFR5cGUsIHJldmVhbEhvcml6b250YWw6IGJvb2xlYW4sIHNjcm9sbFR5cGU6IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlKTogdm9pZCB7XG5cdFx0aWYgKCFSYW5nZS5pc0lSYW5nZShyYW5nZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9zZW5kUmV2ZWFsUmFuZ2UoXG5cdFx0XHRSYW5nZS5saWZ0KHJhbmdlKSxcblx0XHRcdHZlcnRpY2FsVHlwZSxcblx0XHRcdHJldmVhbEhvcml6b250YWwsXG5cdFx0XHRzY3JvbGxUeXBlXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTZWxlY3Rpb25zKHJhbmdlczogcmVhZG9ubHkgSVNlbGVjdGlvbltdLCBzb3VyY2U6IHN0cmluZyA9ICdhcGknLCByZWFzb24gPSBDdXJzb3JDaGFuZ2VSZWFzb24uTm90U2V0KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFyYW5nZXMgfHwgcmFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGFyZ3VtZW50cycpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRpZiAoIVNlbGVjdGlvbi5pc0lTZWxlY3Rpb24ocmFuZ2VzW2ldKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuc2V0U2VsZWN0aW9ucyhzb3VyY2UsIHJhbmdlcywgcmVhc29uKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZW50V2lkdGgoKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC52aWV3TGF5b3V0LmdldENvbnRlbnRXaWR0aCgpO1xuXHR9XG5cblx0cHVibGljIGdldFNjcm9sbFdpZHRoKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRTY3JvbGxXaWR0aCgpO1xuXHR9XG5cdHB1YmxpYyBnZXRTY3JvbGxMZWZ0KCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5nZXRDdXJyZW50U2Nyb2xsTGVmdCgpO1xuXHR9XG5cblx0cHVibGljIGdldENvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC52aWV3TGF5b3V0LmdldENvbnRlbnRIZWlnaHQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTY3JvbGxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC52aWV3TGF5b3V0LmdldFNjcm9sbEhlaWdodCgpO1xuXHR9XG5cdHB1YmxpYyBnZXRTY3JvbGxUb3AoKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC52aWV3TGF5b3V0LmdldEN1cnJlbnRTY3JvbGxUb3AoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTY3JvbGxMZWZ0KG5ld1Njcm9sbExlZnQ6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5JbW1lZGlhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld1Njcm9sbExlZnQgIT09ICdudW1iZXInKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgYXJndW1lbnRzJyk7XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbih7XG5cdFx0XHRzY3JvbGxMZWZ0OiBuZXdTY3JvbGxMZWZ0XG5cdFx0fSwgc2Nyb2xsVHlwZSk7XG5cdH1cblx0cHVibGljIHNldFNjcm9sbFRvcChuZXdTY3JvbGxUb3A6IG51bWJlciwgc2Nyb2xsVHlwZTogZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUgPSBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5JbW1lZGlhdGUpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld1Njcm9sbFRvcCAhPT0gJ251bWJlcicpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBhcmd1bWVudHMnKTtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC52aWV3TGF5b3V0LnNldFNjcm9sbFBvc2l0aW9uKHtcblx0XHRcdHNjcm9sbFRvcDogbmV3U2Nyb2xsVG9wXG5cdFx0fSwgc2Nyb2xsVHlwZSk7XG5cdH1cblx0cHVibGljIHNldFNjcm9sbFBvc2l0aW9uKHBvc2l0aW9uOiBlZGl0b3JDb21tb24uSU5ld1Njcm9sbFBvc2l0aW9uLCBzY3JvbGxUeXBlOiBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZSA9IGVkaXRvckNvbW1vbi5TY3JvbGxUeXBlLkltbWVkaWF0ZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5zZXRTY3JvbGxQb3NpdGlvbihwb3NpdGlvbiwgc2Nyb2xsVHlwZSk7XG5cdH1cblx0cHVibGljIGhhc1BlbmRpbmdTY3JvbGxBbmltYXRpb24oKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudmlld0xheW91dC5oYXNQZW5kaW5nU2Nyb2xsQW5pbWF0aW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgc2F2ZVZpZXdTdGF0ZSgpOiBlZGl0b3JDb21tb24uSUNvZGVFZGl0b3JWaWV3U3RhdGUgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnNTdGF0ZSA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdGNvbnN0IGN1cnNvclN0YXRlID0gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5zYXZlQ3Vyc29yU3RhdGUoKTtcblx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnNhdmVTdGF0ZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjdXJzb3JTdGF0ZTogY3Vyc29yU3RhdGUsXG5cdFx0XHR2aWV3U3RhdGU6IHZpZXdTdGF0ZSxcblx0XHRcdGNvbnRyaWJ1dGlvbnNTdGF0ZTogY29udHJpYnV0aW9uc1N0YXRlXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyByZXN0b3JlVmlld1N0YXRlKHM6IGVkaXRvckNvbW1vbi5JRWRpdG9yVmlld1N0YXRlIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29kZUVkaXRvclN0YXRlID0gcyBhcyBlZGl0b3JDb21tb24uSUNvZGVFZGl0b3JWaWV3U3RhdGUgfCBudWxsO1xuXHRcdGlmIChjb2RlRWRpdG9yU3RhdGUgJiYgY29kZUVkaXRvclN0YXRlLmN1cnNvclN0YXRlICYmIGNvZGVFZGl0b3JTdGF0ZS52aWV3U3RhdGUpIHtcblx0XHRcdGNvbnN0IGN1cnNvclN0YXRlID0gPHVua25vd24+Y29kZUVkaXRvclN0YXRlLmN1cnNvclN0YXRlO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoY3Vyc29yU3RhdGUpKSB7XG5cdFx0XHRcdGlmIChjdXJzb3JTdGF0ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5yZXN0b3JlQ3Vyc29yU3RhdGUoPGVkaXRvckNvbW1vbi5JQ3Vyc29yU3RhdGVbXT5jdXJzb3JTdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG5cdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwucmVzdG9yZUN1cnNvclN0YXRlKFs8ZWRpdG9yQ29tbW9uLklDdXJzb3JTdGF0ZT5jdXJzb3JTdGF0ZV0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9jb250cmlidXRpb25zLnJlc3RvcmVWaWV3U3RhdGUoY29kZUVkaXRvclN0YXRlLmNvbnRyaWJ1dGlvbnNTdGF0ZSB8fCB7fSk7XG5cdFx0XHRjb25zdCByZWR1Y2VkU3RhdGUgPSB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLnJlZHVjZVJlc3RvcmVTdGF0ZShjb2RlRWRpdG9yU3RhdGUudmlld1N0YXRlKTtcblx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LnJlc3RvcmVTdGF0ZShyZWR1Y2VkU3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVJbml0aWFsaXplZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9nZXRWaWV3TW9kZWwoKT8udmlzaWJsZUxpbmVzU3RhYmlsaXplZCgpO1xuXHR9XG5cblx0cHVibGljIG9uVmlzaWJsZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbERhdGE/LnZpZXcucmVmcmVzaEZvY3VzU3RhdGUoKTtcblx0fVxuXG5cdHB1YmxpYyBvbkhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxEYXRhPy52aWV3LnJlZnJlc2hGb2N1c1N0YXRlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29udHJpYnV0aW9uPFQgZXh0ZW5kcyBlZGl0b3JDb21tb24uSUVkaXRvckNvbnRyaWJ1dGlvbj4oaWQ6IHN0cmluZyk6IFQgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQoaWQpIGFzIFQgfCBudWxsO1xuXHR9XG5cblx0cHVibGljIGdldEFjdGlvbnMoKTogZWRpdG9yQ29tbW9uLklFZGl0b3JBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fYWN0aW9ucy52YWx1ZXMoKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0U3VwcG9ydGVkQWN0aW9ucygpOiBlZGl0b3JDb21tb24uSUVkaXRvckFjdGlvbltdIHtcblx0XHRsZXQgcmVzdWx0ID0gdGhpcy5nZXRBY3Rpb25zKCk7XG5cblx0XHRyZXN1bHQgPSByZXN1bHQuZmlsdGVyKGFjdGlvbiA9PiBhY3Rpb24uaXNTdXBwb3J0ZWQoKSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldEFjdGlvbihpZDogc3RyaW5nKTogZWRpdG9yQ29tbW9uLklFZGl0b3JBY3Rpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9ucy5nZXQoaWQpIHx8IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgdHJpZ2dlcihzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGhhbmRsZXJJZDogc3RyaW5nLCBwYXlsb2FkOiB1bmtub3duKTogdm9pZCB7XG5cdFx0cGF5bG9hZCA9IHBheWxvYWQgfHwge307XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb25XaWxsVHJpZ2dlckVkaXRvck9wZXJhdGlvbkV2ZW50LmZpcmUoeyBzb3VyY2U6IHNvdXJjZSwgaGFuZGxlcklkOiBoYW5kbGVySWQsIHBheWxvYWQ6IHBheWxvYWQgfSk7XG5cdFx0XHR0aGlzLl9iZWdpblVwZGF0ZSgpO1xuXG5cdFx0XHRzd2l0Y2ggKGhhbmRsZXJJZCkge1xuXHRcdFx0XHRjYXNlIGVkaXRvckNvbW1vbi5IYW5kbGVyLkNvbXBvc2l0aW9uU3RhcnQ6XG5cdFx0XHRcdFx0dGhpcy5fc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSBlZGl0b3JDb21tb24uSGFuZGxlci5Db21wb3NpdGlvbkVuZDpcblx0XHRcdFx0XHR0aGlzLl9lbmRDb21wb3NpdGlvbihzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0Y2FzZSBlZGl0b3JDb21tb24uSGFuZGxlci5UeXBlOiB7XG5cdFx0XHRcdFx0Y29uc3QgYXJncyA9IDxQYXJ0aWFsPGVkaXRvckNvbW1vbi5UeXBlUGF5bG9hZD4+cGF5bG9hZDtcblx0XHRcdFx0XHR0aGlzLl90eXBlKHNvdXJjZSwgYXJncy50ZXh0IHx8ICcnKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBlZGl0b3JDb21tb24uSGFuZGxlci5SZXBsYWNlUHJldmlvdXNDaGFyOiB7XG5cdFx0XHRcdFx0Y29uc3QgYXJncyA9IDxQYXJ0aWFsPGVkaXRvckNvbW1vbi5SZXBsYWNlUHJldmlvdXNDaGFyUGF5bG9hZD4+cGF5bG9hZDtcblx0XHRcdFx0XHR0aGlzLl9jb21wb3NpdGlvblR5cGUoc291cmNlLCBhcmdzLnRleHQgfHwgJycsIGFyZ3MucmVwbGFjZUNoYXJDbnQgfHwgMCwgMCwgMCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgZWRpdG9yQ29tbW9uLkhhbmRsZXIuQ29tcG9zaXRpb25UeXBlOiB7XG5cdFx0XHRcdFx0Y29uc3QgYXJncyA9IDxQYXJ0aWFsPGVkaXRvckNvbW1vbi5Db21wb3NpdGlvblR5cGVQYXlsb2FkPj5wYXlsb2FkO1xuXHRcdFx0XHRcdHRoaXMuX2NvbXBvc2l0aW9uVHlwZShzb3VyY2UsIGFyZ3MudGV4dCB8fCAnJywgYXJncy5yZXBsYWNlUHJldkNoYXJDbnQgfHwgMCwgYXJncy5yZXBsYWNlTmV4dENoYXJDbnQgfHwgMCwgYXJncy5wb3NpdGlvbkRlbHRhIHx8IDApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIGVkaXRvckNvbW1vbi5IYW5kbGVyLlBhc3RlOiB7XG5cdFx0XHRcdFx0Y29uc3QgYXJncyA9IDxQYXJ0aWFsPGVkaXRvckJyb3dzZXIuUGFzdGVQYXlsb2FkPj5wYXlsb2FkO1xuXHRcdFx0XHRcdHRoaXMuX3Bhc3RlKHNvdXJjZSwgYXJncy50ZXh0IHx8ICcnLCBhcmdzLnBhc3RlT25OZXdMaW5lIHx8IGZhbHNlLCBhcmdzLm11bHRpY3Vyc29yVGV4dCB8fCBudWxsLCBhcmdzLm1vZGUgfHwgbnVsbCwgYXJncy5jbGlwYm9hcmRFdmVudCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgZWRpdG9yQ29tbW9uLkhhbmRsZXIuQ3V0OlxuXHRcdFx0XHRcdHRoaXMuX2N1dChzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWN0aW9uID0gdGhpcy5nZXRBY3Rpb24oaGFuZGxlcklkKTtcblx0XHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdFx0UHJvbWlzZS5yZXNvbHZlKGFjdGlvbi5ydW4ocGF5bG9hZCkpLnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fdHJpZ2dlckVkaXRvckNvbW1hbmQoc291cmNlLCBoYW5kbGVySWQsIHBheWxvYWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdHJpZ2dlckNvbW1hbmQoaGFuZGxlcklkLCBwYXlsb2FkKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZW5kVXBkYXRlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF90cmlnZ2VyQ29tbWFuZChoYW5kbGVySWQ6IHN0cmluZywgcGF5bG9hZDogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGhhbmRsZXJJZCwgcGF5bG9hZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydENvbXBvc2l0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaW5Db21wb3NpdGlvbiA9IHRydWU7XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0dGhpcy5fb25EaWRDb21wb3NpdGlvblN0YXJ0LmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2VuZENvbXBvc2l0aW9uKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuaW5Db21wb3NpdGlvbiA9IGZhbHNlO1xuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oc291cmNlKTtcblx0XHR0aGlzLl9vbkRpZENvbXBvc2l0aW9uRW5kLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3R5cGUoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCB0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCB0ZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc291cmNlID09PSAna2V5Ym9hcmQnKSB7XG5cdFx0XHR0aGlzLl9vbldpbGxUeXBlLmZpcmUodGV4dCk7XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwudHlwZSh0ZXh0LCBzb3VyY2UpO1xuXHRcdGlmIChzb3VyY2UgPT09ICdrZXlib2FyZCcpIHtcblx0XHRcdHRoaXMuX29uRGlkVHlwZS5maXJlKHRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbXBvc2l0aW9uVHlwZShzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIHRleHQ6IHN0cmluZywgcmVwbGFjZVByZXZDaGFyQ250OiBudW1iZXIsIHJlcGxhY2VOZXh0Q2hhckNudDogbnVtYmVyLCBwb3NpdGlvbkRlbHRhOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSh0ZXh0LCByZXBsYWNlUHJldkNoYXJDbnQsIHJlcGxhY2VOZXh0Q2hhckNudCwgcG9zaXRpb25EZWx0YSwgc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3Bhc3RlKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgdGV4dDogc3RyaW5nLCBwYXN0ZU9uTmV3TGluZTogYm9vbGVhbiwgbXVsdGljdXJzb3JUZXh0OiBzdHJpbmdbXSB8IG51bGwsIG1vZGU6IHN0cmluZyB8IG51bGwsIGNsaXBib2FyZEV2ZW50PzogQ2xpcGJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9tb2RlbERhdGEudmlld01vZGVsO1xuXHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSB2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCkuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdHZpZXdNb2RlbC5wYXN0ZSh0ZXh0LCBwYXN0ZU9uTmV3TGluZSwgbXVsdGljdXJzb3JUZXh0LCBzb3VyY2UpO1xuXHRcdGNvbnN0IGVuZFBvc2l0aW9uID0gdmlld01vZGVsLmdldFNlbGVjdGlvbigpLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRpZiAoc291cmNlID09PSAna2V5Ym9hcmQnKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFBhc3RlLmZpcmUoe1xuXHRcdFx0XHRjbGlwYm9hcmRFdmVudCxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShzdGFydFBvc2l0aW9uLmxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uLCBlbmRQb3NpdGlvbi5saW5lTnVtYmVyLCBlbmRQb3NpdGlvbi5jb2x1bW4pLFxuXHRcdFx0XHRsYW5ndWFnZUlkOiBtb2RlXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jdXQoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5jdXQoc291cmNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyaWdnZXJFZGl0b3JDb21tYW5kKHNvdXJjZTogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwgaGFuZGxlcklkOiBzdHJpbmcsIHBheWxvYWQ6IHVua25vd24pOiBib29sZWFuIHtcblx0XHRjb25zdCBjb21tYW5kID0gRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbW1hbmQoaGFuZGxlcklkKTtcblx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0cGF5bG9hZCA9IHBheWxvYWQgfHwge307XG5cdFx0XHRpZiAoaXNPYmplY3QocGF5bG9hZCkpIHtcblx0XHRcdFx0KHBheWxvYWQgYXMgeyBzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQgfSkuc291cmNlID0gc291cmNlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdFByb21pc2UucmVzb2x2ZShjb21tYW5kLnJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3IsIHRoaXMsIHBheWxvYWQpKS50aGVuKHVuZGVmaW5lZCwgb25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgX2dldFZpZXdNb2RlbCgpOiBJVmlld01vZGVsIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbDtcblx0fVxuXG5cdHB1YmxpYyBwdXNoVW5kb1N0b3AoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSkge1xuXHRcdFx0Ly8gcmVhZCBvbmx5IGVkaXRvciA9PiBzb3JyeSFcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxEYXRhLm1vZGVsLnB1c2hTdGFja0VsZW1lbnQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBwb3BVbmRvU3RvcCgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVhZE9ubHkpKSB7XG5cdFx0XHQvLyByZWFkIG9ubHkgZWRpdG9yID0+IHNvcnJ5IVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEubW9kZWwucG9wU3RhY2tFbGVtZW50KCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgZWRpdChlZGl0OiBUZXh0RWRpdCwgcmVhc29uOiBUZXh0TW9kZWxFZGl0U291cmNlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZXhlY3V0ZUVkaXRzKHJlYXNvbiwgZWRpdC5yZXBsYWNlbWVudHMubWFwPElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbj4oZSA9PiAoeyByYW5nZTogZS5yYW5nZSwgdGV4dDogZS50ZXh0IH0pKSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBleGVjdXRlRWRpdHMoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkIHwgVGV4dE1vZGVsRWRpdFNvdXJjZSwgZWRpdHM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdLCBlbmRDdXJzb3JTdGF0ZT86IElDdXJzb3JTdGF0ZUNvbXB1dGVyIHwgU2VsZWN0aW9uW10pOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVhZE9ubHkpKSB7XG5cdFx0XHQvLyByZWFkIG9ubHkgZWRpdG9yID0+IHNvcnJ5IVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBjdXJzb3JTdGF0ZUNvbXB1dGVyOiBJQ3Vyc29yU3RhdGVDb21wdXRlcjtcblx0XHRpZiAoIWVuZEN1cnNvclN0YXRlKSB7XG5cdFx0XHRjdXJzb3JTdGF0ZUNvbXB1dGVyID0gKCkgPT4gbnVsbDtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkoZW5kQ3Vyc29yU3RhdGUpKSB7XG5cdFx0XHRjdXJzb3JTdGF0ZUNvbXB1dGVyID0gKCkgPT4gZW5kQ3Vyc29yU3RhdGU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnNvclN0YXRlQ29tcHV0ZXIgPSBlbmRDdXJzb3JTdGF0ZTtcblx0XHR9XG5cblx0XHRsZXQgc291cmNlU3RyOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsO1xuXHRcdGxldCByZWFzb246IFRleHRNb2RlbEVkaXRTb3VyY2U7XG5cblx0XHRpZiAoc291cmNlIGluc3RhbmNlb2YgVGV4dE1vZGVsRWRpdFNvdXJjZSkge1xuXHRcdFx0cmVhc29uID0gc291cmNlO1xuXHRcdFx0c291cmNlU3RyID0gc291cmNlLm1ldGFkYXRhLnNvdXJjZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVhc29uID0gRWRpdFNvdXJjZXMudW5rbm93bih7IG5hbWU6IHNvdXJjZSB9KTtcblx0XHRcdHNvdXJjZVN0ciA9IHNvdXJjZTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkJlZm9yZUV4ZWN1dGVFZGl0LmZpcmUoeyBzb3VyY2U6IHNvdXJjZVN0ciA/PyB1bmRlZmluZWQgfSk7XG5cdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXdNb2RlbC5leGVjdXRlRWRpdHMoc291cmNlU3RyLCBlZGl0cywgY3Vyc29yU3RhdGVDb21wdXRlciwgcmVhc29uKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBleGVjdXRlQ29tbWFuZChzb3VyY2U6IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQsIGNvbW1hbmQ6IGVkaXRvckNvbW1vbi5JQ29tbWFuZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCwgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBleGVjdXRlQ29tbWFuZHMoc291cmNlOiBzdHJpbmcgfCBudWxsIHwgdW5kZWZpbmVkLCBjb21tYW5kczogZWRpdG9yQ29tbW9uLklDb21tYW5kW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmV4ZWN1dGVDb21tYW5kcyhjb21tYW5kcywgc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oZGVjb3JhdGlvbnM/OiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSk6IEVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24odGhpcywgZGVjb3JhdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIGNoYW5nZURlY29yYXRpb25zPFQ+KGNhbGxiYWNrOiAoY2hhbmdlQWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IFQpOiBUIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdC8vIGNhbGxiYWNrIHdpbGwgbm90IGJlIGNhbGxlZFxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEubW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoY2FsbGJhY2ssIHRoaXMuX2lkKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lRGVjb3JhdGlvbnMobGluZU51bWJlcjogbnVtYmVyKTogSU1vZGVsRGVjb3JhdGlvbltdIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zO1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEubW9kZWwuZ2V0TGluZURlY29yYXRpb25zKGxpbmVOdW1iZXIsIHRoaXMuX2lkLCBmaWx0ZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMob3B0aW9ucyksIGZpbHRlckZvbnREZWNvcmF0aW9ucyhvcHRpb25zKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVjb3JhdGlvbnNJblJhbmdlKHJhbmdlOiBSYW5nZSk6IElNb2RlbERlY29yYXRpb25bXSB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLm1vZGVsLmdldERlY29yYXRpb25zSW5SYW5nZShyYW5nZSwgdGhpcy5faWQsIGZpbHRlclZhbGlkYXRpb25EZWNvcmF0aW9ucyhvcHRpb25zKSwgZmlsdGVyRm9udERlY29yYXRpb25zKG9wdGlvbnMpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGb250U2l6ZUF0UG9zaXRpb24ocG9zaXRpb246IElQb3NpdGlvbik6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuZ2V0Rm9udFNpemVBdFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZFxuXHQgKi9cblx0cHVibGljIGRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnM6IHN0cmluZ1tdLCBuZXdEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10pOiBzdHJpbmdbXSB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRpZiAob2xkRGVjb3JhdGlvbnMubGVuZ3RoID09PSAwICYmIG5ld0RlY29yYXRpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG9sZERlY29yYXRpb25zO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEubW9kZWwuZGVsdGFEZWNvcmF0aW9ucyhvbGREZWNvcmF0aW9ucywgbmV3RGVjb3JhdGlvbnMsIHRoaXMuX2lkKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVEZWNvcmF0aW9ucyhkZWNvcmF0aW9uSWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8IGRlY29yYXRpb25JZHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbW9kZWxEYXRhLm1vZGVsLmNoYW5nZURlY29yYXRpb25zKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y2hhbmdlQWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyhkZWNvcmF0aW9uSWRzLCBbXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVzY3JpcHRpb246IHN0cmluZywgZGVjb3JhdGlvblR5cGVLZXk6IHN0cmluZywgZGVjb3JhdGlvbk9wdGlvbnM6IGVkaXRvckNvbW1vbi5JRGVjb3JhdGlvbk9wdGlvbnNbXSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zU3ViVHlwZXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XG5cdFx0Y29uc3Qgb2xkRGVjb3JhdGlvbnNTdWJUeXBlcyA9IHRoaXMuX2RlY29yYXRpb25UeXBlU3VidHlwZXNbZGVjb3JhdGlvblR5cGVLZXldIHx8IHt9O1xuXHRcdHRoaXMuX2RlY29yYXRpb25UeXBlU3VidHlwZXNbZGVjb3JhdGlvblR5cGVLZXldID0gbmV3RGVjb3JhdGlvbnNTdWJUeXBlcztcblxuXHRcdGNvbnN0IG5ld01vZGVsRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb25PcHRpb24gb2YgZGVjb3JhdGlvbk9wdGlvbnMpIHtcblx0XHRcdGxldCB0eXBlS2V5ID0gZGVjb3JhdGlvblR5cGVLZXk7XG5cdFx0XHRpZiAoZGVjb3JhdGlvbk9wdGlvbi5yZW5kZXJPcHRpb25zKSB7XG5cdFx0XHRcdC8vIGlkZW50aWZ5IGN1c3RvbSByZW5kZXIgb3B0aW9ucyBieSBhIGhhc2ggY29kZSBvdmVyIGFsbCBrZXlzIGFuZCB2YWx1ZXNcblx0XHRcdFx0Ly8gRm9yIGN1c3RvbSByZW5kZXIgb3B0aW9ucyByZWdpc3RlciBhIGRlY29yYXRpb24gdHlwZSBpZiBuZWNlc3Nhcnlcblx0XHRcdFx0Y29uc3Qgc3ViVHlwZSA9IGhhc2goZGVjb3JhdGlvbk9wdGlvbi5yZW5kZXJPcHRpb25zKS50b1N0cmluZygxNik7XG5cdFx0XHRcdC8vIFRoZSBmYWN0IHRoYXQgYGRlY29yYXRpb25UeXBlS2V5YCBhcHBlYXJzIGluIHRoZSB0eXBlS2V5IGhhcyBubyBpbmZsdWVuY2Vcblx0XHRcdFx0Ly8gaXQgaXMganVzdCBhIG1lY2hhbmlzbSB0byBnZXQgcHJlZGljdGFibGUgYW5kIHVuaXF1ZSBrZXlzIChyZXBlYXRhYmxlIGZvciB0aGUgc2FtZSBvcHRpb25zIGFuZCB1bmlxdWUgYWNyb3NzIGNsaWVudHMpXG5cdFx0XHRcdHR5cGVLZXkgPSBkZWNvcmF0aW9uVHlwZUtleSArICctJyArIHN1YlR5cGU7XG5cdFx0XHRcdGlmICghb2xkRGVjb3JhdGlvbnNTdWJUeXBlc1tzdWJUeXBlXSAmJiAhbmV3RGVjb3JhdGlvbnNTdWJUeXBlc1tzdWJUeXBlXSkge1xuXHRcdFx0XHRcdC8vIGRlY29yYXRpb24gdHlwZSBkaWQgbm90IGV4aXN0IGJlZm9yZSwgcmVnaXN0ZXIgbmV3IG9uZVxuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyRGVjb3JhdGlvblR5cGUoZGVzY3JpcHRpb24sIHR5cGVLZXksIGRlY29yYXRpb25PcHRpb24ucmVuZGVyT3B0aW9ucywgZGVjb3JhdGlvblR5cGVLZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG5ld0RlY29yYXRpb25zU3ViVHlwZXNbc3ViVHlwZV0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3B0cyA9IHRoaXMuX3Jlc29sdmVEZWNvcmF0aW9uT3B0aW9ucyh0eXBlS2V5LCAhIWRlY29yYXRpb25PcHRpb24uaG92ZXJNZXNzYWdlKTtcblx0XHRcdGlmIChkZWNvcmF0aW9uT3B0aW9uLmhvdmVyTWVzc2FnZSkge1xuXHRcdFx0XHRvcHRzLmhvdmVyTWVzc2FnZSA9IGRlY29yYXRpb25PcHRpb24uaG92ZXJNZXNzYWdlO1xuXHRcdFx0fVxuXHRcdFx0bmV3TW9kZWxEZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IGRlY29yYXRpb25PcHRpb24ucmFuZ2UsIG9wdGlvbnM6IG9wdHMgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVtb3ZlIGRlY29yYXRpb24gc3ViIHR5cGVzIHRoYXQgYXJlIG5vIGxvbmdlciB1c2VkLCBkZXJlZ2lzdGVyIGRlY29yYXRpb24gdHlwZSBpZiBuZWNlc3Nhcnlcblx0XHRmb3IgKGNvbnN0IHN1YlR5cGUgaW4gb2xkRGVjb3JhdGlvbnNTdWJUeXBlcykge1xuXHRcdFx0aWYgKCFuZXdEZWNvcmF0aW9uc1N1YlR5cGVzW3N1YlR5cGVdKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZURlY29yYXRpb25UeXBlKGRlY29yYXRpb25UeXBlS2V5ICsgJy0nICsgc3ViVHlwZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIGFsbCBkZWNvcmF0aW9uc1xuXHRcdGNvbnN0IG9sZERlY29yYXRpb25zSWRzID0gdGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHNbZGVjb3JhdGlvblR5cGVLZXldIHx8IFtdO1xuXHRcdHRoaXMuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4gdGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHNbZGVjb3JhdGlvblR5cGVLZXldID0gYWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyhvbGREZWNvcmF0aW9uc0lkcywgbmV3TW9kZWxEZWNvcmF0aW9ucykpO1xuXHRcdHJldHVybiB0aGlzLl9kZWNvcmF0aW9uVHlwZUtleXNUb0lkc1tkZWNvcmF0aW9uVHlwZUtleV0gfHwgW107XG5cdH1cblxuXHRwdWJsaWMgc2V0RGVjb3JhdGlvbnNCeVR5cGVGYXN0KGRlY29yYXRpb25UeXBlS2V5OiBzdHJpbmcsIHJhbmdlczogSVJhbmdlW10pOiB2b2lkIHtcblxuXHRcdC8vIHJlbW92ZSBkZWNvcmF0aW9uIHN1YiB0eXBlcyB0aGF0IGFyZSBubyBsb25nZXIgdXNlZCwgZGVyZWdpc3RlciBkZWNvcmF0aW9uIHR5cGUgaWYgbmVjZXNzYXJ5XG5cdFx0Y29uc3Qgb2xkRGVjb3JhdGlvbnNTdWJUeXBlcyA9IHRoaXMuX2RlY29yYXRpb25UeXBlU3VidHlwZXNbZGVjb3JhdGlvblR5cGVLZXldIHx8IHt9O1xuXHRcdGZvciAoY29uc3Qgc3ViVHlwZSBpbiBvbGREZWNvcmF0aW9uc1N1YlR5cGVzKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uVHlwZUtleSArICctJyArIHN1YlR5cGUpO1xuXHRcdH1cblx0XHR0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzW2RlY29yYXRpb25UeXBlS2V5XSA9IHt9O1xuXG5cdFx0Y29uc3Qgb3B0cyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMuY3JlYXRlRHluYW1pYyh0aGlzLl9yZXNvbHZlRGVjb3JhdGlvbk9wdGlvbnMoZGVjb3JhdGlvblR5cGVLZXksIGZhbHNlKSk7XG5cdFx0Y29uc3QgbmV3TW9kZWxEZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBuZXcgQXJyYXk8SU1vZGVsRGVsdGFEZWNvcmF0aW9uPihyYW5nZXMubGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmFuZ2VzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRuZXdNb2RlbERlY29yYXRpb25zW2ldID0geyByYW5nZTogcmFuZ2VzW2ldLCBvcHRpb25zOiBvcHRzIH07XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIGFsbCBkZWNvcmF0aW9uc1xuXHRcdGNvbnN0IG9sZERlY29yYXRpb25zSWRzID0gdGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHNbZGVjb3JhdGlvblR5cGVLZXldIHx8IFtdO1xuXHRcdHRoaXMuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4gdGhpcy5fZGVjb3JhdGlvblR5cGVLZXlzVG9JZHNbZGVjb3JhdGlvblR5cGVLZXldID0gYWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyhvbGREZWNvcmF0aW9uc0lkcywgbmV3TW9kZWxEZWNvcmF0aW9ucykpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZURlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25UeXBlS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyByZW1vdmUgZGVjb3JhdGlvbnMgZm9yIHR5cGUgYW5kIHN1YiB0eXBlXG5cdFx0Y29uc3Qgb2xkRGVjb3JhdGlvbnNJZHMgPSB0aGlzLl9kZWNvcmF0aW9uVHlwZUtleXNUb0lkc1tkZWNvcmF0aW9uVHlwZUtleV07XG5cdFx0aWYgKG9sZERlY29yYXRpb25zSWRzKSB7XG5cdFx0XHR0aGlzLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMob2xkRGVjb3JhdGlvbnNJZHMsIFtdKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kZWNvcmF0aW9uVHlwZUtleXNUb0lkcy5oYXNPd25Qcm9wZXJ0eShkZWNvcmF0aW9uVHlwZUtleSkpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9kZWNvcmF0aW9uVHlwZUtleXNUb0lkc1tkZWNvcmF0aW9uVHlwZUtleV07XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzLmhhc093blByb3BlcnR5KGRlY29yYXRpb25UeXBlS2V5KSkge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzW2RlY29yYXRpb25UeXBlS2V5XTtcblx0XHRcdGZvciAoY29uc3Qgc3ViVHlwZSBvZiBPYmplY3Qua2V5cyhpdGVtcykpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3ZlRGVjb3JhdGlvblR5cGUoZGVjb3JhdGlvblR5cGVLZXkgKyAnLScgKyBzdWJUeXBlKTtcblx0XHRcdH1cblx0XHRcdGRlbGV0ZSB0aGlzLl9kZWNvcmF0aW9uVHlwZVN1YnR5cGVzW2RlY29yYXRpb25UeXBlS2V5XTtcblxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRMYXlvdXRJbmZvKCk6IEVkaXRvckxheW91dEluZm8ge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9jb25maWd1cmF0aW9uLm9wdGlvbnM7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvKTtcblx0XHRyZXR1cm4gbGF5b3V0SW5mbztcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVPdmVydmlld1J1bGVyKGNzc0NsYXNzTmFtZTogc3RyaW5nKTogZWRpdG9yQnJvd3Nlci5JT3ZlcnZpZXdSdWxlciB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXcuY3JlYXRlT3ZlcnZpZXdSdWxlcihjc3NDbGFzc05hbWUpO1xuXHR9XG5cblx0cHVibGljIGdldENvbnRhaW5lckRvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21FbGVtZW50O1xuXHR9XG5cblx0cHVibGljIGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsRGF0YS52aWV3LmRvbU5vZGUuZG9tTm9kZTtcblx0fVxuXG5cdHB1YmxpYyBkZWxlZ2F0ZVZlcnRpY2FsU2Nyb2xsYmFyUG9pbnRlckRvd24oYnJvd3NlckV2ZW50OiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LmRlbGVnYXRlVmVydGljYWxTY3JvbGxiYXJQb2ludGVyRG93bihicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIGRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIGxheW91dChkaW1lbnNpb24/OiBJRGltZW5zaW9uLCBwb3N0cG9uZVJlbmRlcmluZzogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvbi5vYnNlcnZlQ29udGFpbmVyKGRpbWVuc2lvbik7XG5cdFx0aWYgKCFwb3N0cG9uZVJlbmRlcmluZykge1xuXHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGhhc1RleHRGb2N1cygpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlldy5pc0ZvY3VzZWQoKTtcblx0fVxuXG5cdHB1YmxpYyBoYXNXaWRnZXRGb2N1cygpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlldy5pc1dpZGdldEZvY3VzZWQoKTtcblx0fVxuXG5cdHB1YmxpYyBhZGRDb250ZW50V2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JQ29udGVudFdpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldERhdGE6IElDb250ZW50V2lkZ2V0RGF0YSA9IHtcblx0XHRcdHdpZGdldDogd2lkZ2V0LFxuXHRcdFx0cG9zaXRpb246IHdpZGdldC5nZXRQb3NpdGlvbigpXG5cdFx0fTtcblxuXHRcdGlmICh0aGlzLl9jb250ZW50V2lkZ2V0cy5oYXNPd25Qcm9wZXJ0eSh3aWRnZXQuZ2V0SWQoKSkpIHtcblx0XHRcdGNvbnNvbGUud2FybignT3ZlcndyaXRpbmcgYSBjb250ZW50IHdpZGdldCB3aXRoIHRoZSBzYW1lIGlkOicgKyB3aWRnZXQuZ2V0SWQoKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGVudFdpZGdldHNbd2lkZ2V0LmdldElkKCldID0gd2lkZ2V0RGF0YTtcblxuXHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5hZGRDb250ZW50V2lkZ2V0KHdpZGdldERhdGEpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBsYXlvdXRDb250ZW50V2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JQ29udGVudFdpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldElkID0gd2lkZ2V0LmdldElkKCk7XG5cdFx0aWYgKHRoaXMuX2NvbnRlbnRXaWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldElkKSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0RGF0YSA9IHRoaXMuX2NvbnRlbnRXaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdHdpZGdldERhdGEucG9zaXRpb24gPSB3aWRnZXQuZ2V0UG9zaXRpb24oKTtcblx0XHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LmxheW91dENvbnRlbnRXaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbnRlbnRXaWRnZXQod2lkZ2V0OiBlZGl0b3JCcm93c2VyLklDb250ZW50V2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0SWQgPSB3aWRnZXQuZ2V0SWQoKTtcblx0XHRpZiAodGhpcy5fY29udGVudFdpZGdldHMuaGFzT3duUHJvcGVydHkod2lkZ2V0SWQpKSB7XG5cdFx0XHRjb25zdCB3aWRnZXREYXRhID0gdGhpcy5fY29udGVudFdpZGdldHNbd2lkZ2V0SWRdO1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2NvbnRlbnRXaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LnJlbW92ZUNvbnRlbnRXaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZE92ZXJsYXlXaWRnZXQod2lkZ2V0OiBlZGl0b3JCcm93c2VyLklPdmVybGF5V2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0RGF0YTogSU92ZXJsYXlXaWRnZXREYXRhID0ge1xuXHRcdFx0d2lkZ2V0OiB3aWRnZXQsXG5cdFx0XHRwb3NpdGlvbjogd2lkZ2V0LmdldFBvc2l0aW9uKClcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMuX292ZXJsYXlXaWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldC5nZXRJZCgpKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdPdmVyd3JpdGluZyBhbiBvdmVybGF5IHdpZGdldCB3aXRoIHRoZSBzYW1lIGlkLicpO1xuXHRcdH1cblxuXHRcdHRoaXMuX292ZXJsYXlXaWRnZXRzW3dpZGdldC5nZXRJZCgpXSA9IHdpZGdldERhdGE7XG5cdFx0aWYgKHRoaXMuX21vZGVsRGF0YSAmJiB0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHRoaXMuX21vZGVsRGF0YS52aWV3LmFkZE92ZXJsYXlXaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGxheW91dE92ZXJsYXlXaWRnZXQod2lkZ2V0OiBlZGl0b3JCcm93c2VyLklPdmVybGF5V2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkZ2V0SWQgPSB3aWRnZXQuZ2V0SWQoKTtcblx0XHRpZiAodGhpcy5fb3ZlcmxheVdpZGdldHMuaGFzT3duUHJvcGVydHkod2lkZ2V0SWQpKSB7XG5cdFx0XHRjb25zdCB3aWRnZXREYXRhID0gdGhpcy5fb3ZlcmxheVdpZGdldHNbd2lkZ2V0SWRdO1xuXHRcdFx0d2lkZ2V0RGF0YS5wb3NpdGlvbiA9IHdpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsRGF0YSAmJiB0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcubGF5b3V0T3ZlcmxheVdpZGdldCh3aWRnZXREYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlT3ZlcmxheVdpZGdldCh3aWRnZXQ6IGVkaXRvckJyb3dzZXIuSU92ZXJsYXlXaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRJZCA9IHdpZGdldC5nZXRJZCgpO1xuXHRcdGlmICh0aGlzLl9vdmVybGF5V2lkZ2V0cy5oYXNPd25Qcm9wZXJ0eSh3aWRnZXRJZCkpIHtcblx0XHRcdGNvbnN0IHdpZGdldERhdGEgPSB0aGlzLl9vdmVybGF5V2lkZ2V0c1t3aWRnZXRJZF07XG5cdFx0XHRkZWxldGUgdGhpcy5fb3ZlcmxheVdpZGdldHNbd2lkZ2V0SWRdO1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsRGF0YSAmJiB0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcucmVtb3ZlT3ZlcmxheVdpZGdldCh3aWRnZXREYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYWRkR2x5cGhNYXJnaW5XaWRnZXQod2lkZ2V0OiBlZGl0b3JCcm93c2VyLklHbHlwaE1hcmdpbldpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldERhdGE6IElHbHlwaE1hcmdpbldpZGdldERhdGEgPSB7XG5cdFx0XHR3aWRnZXQ6IHdpZGdldCxcblx0XHRcdHBvc2l0aW9uOiB3aWRnZXQuZ2V0UG9zaXRpb24oKVxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzLmhhc093blByb3BlcnR5KHdpZGdldC5nZXRJZCgpKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdPdmVyd3JpdGluZyBhIGdseXBoIG1hcmdpbiB3aWRnZXQgd2l0aCB0aGUgc2FtZSBpZC4nKTtcblx0XHR9XG5cblx0XHR0aGlzLl9nbHlwaE1hcmdpbldpZGdldHNbd2lkZ2V0LmdldElkKCldID0gd2lkZ2V0RGF0YTtcblxuXHRcdGlmICh0aGlzLl9tb2RlbERhdGEgJiYgdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5hZGRHbHlwaE1hcmdpbldpZGdldCh3aWRnZXREYXRhKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0R2x5cGhNYXJnaW5XaWRnZXQod2lkZ2V0OiBlZGl0b3JCcm93c2VyLklHbHlwaE1hcmdpbldpZGdldCk6IHZvaWQge1xuXHRcdGNvbnN0IHdpZGdldElkID0gd2lkZ2V0LmdldElkKCk7XG5cdFx0aWYgKHRoaXMuX2dseXBoTWFyZ2luV2lkZ2V0cy5oYXNPd25Qcm9wZXJ0eSh3aWRnZXRJZCkpIHtcblx0XHRcdGNvbnN0IHdpZGdldERhdGEgPSB0aGlzLl9nbHlwaE1hcmdpbldpZGdldHNbd2lkZ2V0SWRdO1xuXHRcdFx0d2lkZ2V0RGF0YS5wb3NpdGlvbiA9IHdpZGdldC5nZXRQb3NpdGlvbigpO1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsRGF0YSAmJiB0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcubGF5b3V0R2x5cGhNYXJnaW5XaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZUdseXBoTWFyZ2luV2lkZ2V0KHdpZGdldDogZWRpdG9yQnJvd3Nlci5JR2x5cGhNYXJnaW5XaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCB3aWRnZXRJZCA9IHdpZGdldC5nZXRJZCgpO1xuXHRcdGlmICh0aGlzLl9nbHlwaE1hcmdpbldpZGdldHMuaGFzT3duUHJvcGVydHkod2lkZ2V0SWQpKSB7XG5cdFx0XHRjb25zdCB3aWRnZXREYXRhID0gdGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzW3dpZGdldElkXTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9nbHlwaE1hcmdpbldpZGdldHNbd2lkZ2V0SWRdO1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsRGF0YSAmJiB0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxEYXRhLnZpZXcucmVtb3ZlR2x5cGhNYXJnaW5XaWRnZXQod2lkZ2V0RGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNoYW5nZVZpZXdab25lcyhjYWxsYmFjazogKGFjY2Vzc29yOiBlZGl0b3JCcm93c2VyLklWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5jaGFuZ2UoY2FsbGJhY2spO1xuXHR9XG5cblx0cHVibGljIGdldFRhcmdldEF0Q2xpZW50UG9pbnQoY2xpZW50WDogbnVtYmVyLCBjbGllbnRZOiBudW1iZXIpOiBlZGl0b3JCcm93c2VyLklNb3VzZVRhcmdldCB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhIHx8ICF0aGlzLl9tb2RlbERhdGEuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXcuZ2V0VGFyZ2V0QXRDbGllbnRQb2ludChjbGllbnRYLCBjbGllbnRZKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRTY3JvbGxlZFZpc2libGVQb3NpdGlvbihyYXdQb3NpdGlvbjogSVBvc2l0aW9uKTogeyB0b3A6IG51bWJlcjsgbGVmdDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9tb2RlbERhdGEubW9kZWwudmFsaWRhdGVQb3NpdGlvbihyYXdQb3NpdGlvbik7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2NvbmZpZ3VyYXRpb24ub3B0aW9ucztcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXG5cdFx0Y29uc3QgdG9wID0gQ29kZUVkaXRvcldpZGdldC5fZ2V0VmVydGljYWxPZmZzZXRGb3JQb3NpdGlvbih0aGlzLl9tb2RlbERhdGEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikgLSB0aGlzLmdldFNjcm9sbFRvcCgpO1xuXHRcdGNvbnN0IGxlZnQgPSB0aGlzLl9tb2RlbERhdGEudmlldy5nZXRPZmZzZXRGb3JDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKSArIGxheW91dEluZm8uZ2x5cGhNYXJnaW5XaWR0aCArIGxheW91dEluZm8ubGluZU51bWJlcnNXaWR0aCArIGxheW91dEluZm8uZGVjb3JhdGlvbnNXaWR0aCAtIHRoaXMuZ2V0U2Nyb2xsTGVmdCgpO1xuXHRcdGNvbnN0IGhlaWdodCA9IHRoaXMuZ2V0TGluZUhlaWdodEZvclBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9wOiB0b3AsXG5cdFx0XHRsZWZ0OiBsZWZ0LFxuXHRcdFx0aGVpZ2h0XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRPZmZzZXRGb3JDb2x1bW4obGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbW9kZWxEYXRhLnZpZXcuZ2V0T2Zmc2V0Rm9yQ29sdW1uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V2lkdGhPZkxpbmUobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tb2RlbERhdGEudmlldy5nZXRMaW5lV2lkdGgobGluZU51bWJlcik7XG5cdH1cblxuXHRwdWJsaWMgcmVzZXRMaW5lV2lkdGhDYWNoZXMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5yZXNldExpbmVXaWR0aENhY2hlcygpO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihmb3JjZVJlZHJhdzogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlld01vZGVsLmJhdGNoRXZlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMuX21vZGVsRGF0YSEudmlldy5yZW5kZXIodHJ1ZSwgZm9yY2VSZWRyYXcpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJlbmRlckFzeW5jKGZvcmNlUmVkcmF3OiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vZGVsRGF0YSB8fCAhdGhpcy5fbW9kZWxEYXRhLmhhc1JlYWxWaWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsRGF0YS52aWV3TW9kZWwuYmF0Y2hFdmVudHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbW9kZWxEYXRhIS52aWV3LnJlbmRlcihmYWxzZSwgZm9yY2VSZWRyYXcpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHNldEFyaWFPcHRpb25zKG9wdGlvbnM6IGVkaXRvckJyb3dzZXIuSUVkaXRvckFyaWFPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbERhdGEgfHwgIXRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9tb2RlbERhdGEudmlldy5zZXRBcmlhT3B0aW9ucyhvcHRpb25zKTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseUZvbnRJbmZvKHRhcmdldDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRhcHBseUZvbnRJbmZvKHRhcmdldCwgdGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRCYW5uZXIoZG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsLCBkb21Ob2RlSGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYmFubmVyRG9tTm9kZSAmJiB0aGlzLl9kb21FbGVtZW50LmNvbnRhaW5zKHRoaXMuX2Jhbm5lckRvbU5vZGUpKSB7XG5cdFx0XHR0aGlzLl9iYW5uZXJEb21Ob2RlLnJlbW92ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2Jhbm5lckRvbU5vZGUgPSBkb21Ob2RlO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24uc2V0UmVzZXJ2ZWRIZWlnaHQoZG9tTm9kZSA/IGRvbU5vZGVIZWlnaHQgOiAwKTtcblxuXHRcdGlmICh0aGlzLl9iYW5uZXJEb21Ob2RlKSB7XG5cdFx0XHR0aGlzLl9kb21FbGVtZW50LnByZXBlbmQodGhpcy5fYmFubmVyRG9tTm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9hdHRhY2hNb2RlbChtb2RlbDogSVRleHRNb2RlbCB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aGlzLl9tb2RlbERhdGEgPSBudWxsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpc3RlbmVyc1RvUmVtb3ZlOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0XHR0aGlzLl9kb21FbGVtZW50LnNldEF0dHJpYnV0ZSgnZGF0YS1tb2RlLWlkJywgbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnNldElzRG9taW5hdGVkQnlMb25nTGluZXMobW9kZWwuaXNEb21pbmF0ZWRCeUxvbmdMaW5lcygpKTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uLnNldE1vZGVsTGluZUNvdW50KG1vZGVsLmdldExpbmVDb3VudCgpKTtcblxuXHRcdGNvbnN0IGF0dGFjaGVkVmlldyA9IG1vZGVsLm9uQmVmb3JlQXR0YWNoZWQoKTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IG5ldyBWaWV3TW9kZWwoXG5cdFx0XHR0aGlzLl9pZCxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24sXG5cdFx0XHRtb2RlbCxcblx0XHRcdERPTUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkuY3JlYXRlKGRvbS5nZXRXaW5kb3codGhpcy5fZG9tRWxlbWVudCkpLFxuXHRcdFx0TW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeS5jcmVhdGUodGhpcy5fY29uZmlndXJhdGlvbi5vcHRpb25zKSxcblx0XHRcdChjYWxsYmFjaykgPT4gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUoZG9tLmdldFdpbmRvdyh0aGlzLl9kb21FbGVtZW50KSwgY2FsbGJhY2spLFxuXHRcdFx0dGhpcy5sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGhpcy5fdGhlbWVTZXJ2aWNlLFxuXHRcdFx0YXR0YWNoZWRWaWV3LFxuXHRcdFx0e1xuXHRcdFx0XHRiYXRjaENoYW5nZXM6IChjYikgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9iZWdpblVwZGF0ZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGNiKCk7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHRoaXMuX2VuZFVwZGF0ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gU29tZW9uZSBtaWdodCBkZXN0cm95IHRoZSBtb2RlbCBmcm9tIHVuZGVyIHRoZSBlZGl0b3IsIHNvIHByZXZlbnQgYW55IGV4Y2VwdGlvbnMgYnkgc2V0dGluZyBhIG51bGwgbW9kZWxcblx0XHRsaXN0ZW5lcnNUb1JlbW92ZS5wdXNoKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4gdGhpcy5zZXRNb2RlbChudWxsKSkpO1xuXG5cdFx0bGlzdGVuZXJzVG9SZW1vdmUucHVzaCh2aWV3TW9kZWwub25FdmVudCgoZSkgPT4ge1xuXHRcdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Db250ZW50U2l6ZUNoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDb250ZW50U2l6ZUNoYW5nZS5maXJlKGUpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLkZvY3VzQ2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JUZXh0Rm9jdXMuc2V0VmFsdWUoZS5oYXNGb2N1cyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuV2lkZ2V0Rm9jdXNDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX2VkaXRvcldpZGdldEZvY3VzLnNldFZhbHVlKGUuaGFzRm9jdXMpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLlNjcm9sbENoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTY3JvbGxDaGFuZ2UuZmlyZShlKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5WaWV3Wm9uZXNDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlld1pvbmVzLmZpcmUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5IaWRkZW5BcmVhc0NoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIaWRkZW5BcmVhcy5maXJlKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuUmVhZE9ubHlFZGl0QXR0ZW1wdDpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZEF0dGVtcHRSZWFkT25seUVkaXQuZmlyZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLkN1cnNvclN0YXRlQ2hhbmdlZDoge1xuXHRcdFx0XHRcdGlmIChlLnJlYWNoZWRNYXhDdXJzb3JDb3VudCkge1xuXG5cdFx0XHRcdFx0XHRjb25zdCBtdWx0aUN1cnNvckxpbWl0ID0gdGhpcy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLm11bHRpQ3Vyc29yTGltaXQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnY3Vyc29ycy5tYXhpbXVtJywgXCJUaGUgbnVtYmVyIG9mIGN1cnNvcnMgaGFzIGJlZW4gbGltaXRlZCB0byB7MH0uIENvbnNpZGVyIHVzaW5nIFtmaW5kIGFuZCByZXBsYWNlXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci9jb2RlYmFzaWNzI19maW5kLWFuZC1yZXBsYWNlKSBmb3IgbGFyZ2VyIGNoYW5nZXMgb3IgaW5jcmVhc2UgdGhlIGVkaXRvciBtdWx0aSBjdXJzb3IgbGltaXQgc2V0dGluZy5cIiwgbXVsdGlDdXJzb3JMaW1pdCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlLCBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogJ0ZpbmQgYW5kIFJlcGxhY2UnLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2VkaXRvci5hY3Rpb24uc3RhcnRGaW5kUmVwbGFjZUFjdGlvbicpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2dvVG9TZXR0aW5nJywgJ0luY3JlYXNlIE11bHRpIEN1cnNvciBMaW1pdCcpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzMicsIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cXVlcnk6ICdlZGl0b3IubXVsdGlDdXJzb3JMaW1pdCdcblx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcG9zaXRpb25zOiBQb3NpdGlvbltdID0gW107XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGUuc2VsZWN0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdFx0cG9zaXRpb25zW2ldID0gZS5zZWxlY3Rpb25zW2ldLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZTE6IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCA9IHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiBwb3NpdGlvbnNbMF0sXG5cdFx0XHRcdFx0XHRzZWNvbmRhcnlQb3NpdGlvbnM6IHBvc2l0aW9ucy5zbGljZSgxKSxcblx0XHRcdFx0XHRcdHJlYXNvbjogZS5yZWFzb24sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGUuc291cmNlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uLmZpcmUoZTEpO1xuXG5cdFx0XHRcdFx0Y29uc3QgZTI6IElDdXJzb3JTZWxlY3Rpb25DaGFuZ2VkRXZlbnQgPSB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb246IGUuc2VsZWN0aW9uc1swXSxcblx0XHRcdFx0XHRcdHNlY29uZGFyeVNlbGVjdGlvbnM6IGUuc2VsZWN0aW9ucy5zbGljZSgxKSxcblx0XHRcdFx0XHRcdG1vZGVsVmVyc2lvbklkOiBlLm1vZGVsVmVyc2lvbklkLFxuXHRcdFx0XHRcdFx0b2xkU2VsZWN0aW9uczogZS5vbGRTZWxlY3Rpb25zLFxuXHRcdFx0XHRcdFx0b2xkTW9kZWxWZXJzaW9uSWQ6IGUub2xkTW9kZWxWZXJzaW9uSWQsXG5cdFx0XHRcdFx0XHRzb3VyY2U6IGUuc291cmNlLFxuXHRcdFx0XHRcdFx0cmVhc29uOiBlLnJlYXNvblxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24uZmlyZShlMik7XG5cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLk1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxEZWNvcmF0aW9ucy5maXJlKGUuZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLk1vZGVsTGFuZ3VhZ2VDaGFuZ2VkOlxuXHRcdFx0XHRcdHRoaXMuX2RvbUVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLW1vZGUtaWQnLCBtb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZS5maXJlKGUuZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLk1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uQ2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2VDb25maWd1cmF0aW9uLmZpcmUoZS5ldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuTW9kZWxDb250ZW50Q2hhbmdlZDpcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsQ29udGVudC5maXJlKGUuZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLk1vZGVsT3B0aW9uc0NoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbE9wdGlvbnMuZmlyZShlLmV2ZW50KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBPdXRnb2luZ1ZpZXdNb2RlbEV2ZW50S2luZC5Nb2RlbFRva2Vuc0NoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbFRva2Vucy5maXJlKGUuZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLk1vZGVsTGluZUhlaWdodENoYW5nZWQ6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMaW5lSGVpZ2h0LmZpcmUoZS5ldmVudCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQuTW9kZWxGb250Q2hhbmdlZEV2ZW50OlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlRm9udC5maXJlKGUuZXZlbnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IFt2aWV3LCBoYXNSZWFsVmlld10gPSB0aGlzLl9jcmVhdGVWaWV3KHZpZXdNb2RlbCk7XG5cdFx0aWYgKGhhc1JlYWxWaWV3KSB7XG5cdFx0XHR0aGlzLl9kb21FbGVtZW50LmFwcGVuZENoaWxkKHZpZXcuZG9tTm9kZS5kb21Ob2RlKTtcblxuXHRcdFx0bGV0IGtleXMgPSBPYmplY3Qua2V5cyh0aGlzLl9jb250ZW50V2lkZ2V0cyk7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0ga2V5cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCB3aWRnZXRJZCA9IGtleXNbaV07XG5cdFx0XHRcdHZpZXcuYWRkQ29udGVudFdpZGdldCh0aGlzLl9jb250ZW50V2lkZ2V0c1t3aWRnZXRJZF0pO1xuXHRcdFx0fVxuXG5cdFx0XHRrZXlzID0gT2JqZWN0LmtleXModGhpcy5fb3ZlcmxheVdpZGdldHMpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGtleXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0SWQgPSBrZXlzW2ldO1xuXHRcdFx0XHR2aWV3LmFkZE92ZXJsYXlXaWRnZXQodGhpcy5fb3ZlcmxheVdpZGdldHNbd2lkZ2V0SWRdKTtcblx0XHRcdH1cblxuXHRcdFx0a2V5cyA9IE9iamVjdC5rZXlzKHRoaXMuX2dseXBoTWFyZ2luV2lkZ2V0cyk7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0ga2V5cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCB3aWRnZXRJZCA9IGtleXNbaV07XG5cdFx0XHRcdHZpZXcuYWRkR2x5cGhNYXJnaW5XaWRnZXQodGhpcy5fZ2x5cGhNYXJnaW5XaWRnZXRzW3dpZGdldElkXSk7XG5cdFx0XHR9XG5cblx0XHRcdHZpZXcucmVuZGVyKGZhbHNlLCB0cnVlKTtcblx0XHRcdHZpZXcuZG9tTm9kZS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnZGF0YS11cmknLCBtb2RlbC51cmkudG9TdHJpbmcoKSk7XG5cblx0XHRcdC8vIENvbm5lY3QgY2xpcGJvYXJkIGV2ZW50cyBmcm9tIFZpZXdcblx0XHRcdGxpc3RlbmVyc1RvUmVtb3ZlLnB1c2godmlldy5vbldpbGxDb3B5KGUgPT4gdGhpcy5fb25XaWxsQ29weS5maXJlKGUpKSk7XG5cdFx0XHRsaXN0ZW5lcnNUb1JlbW92ZS5wdXNoKHZpZXcub25XaWxsQ3V0KGUgPT4gdGhpcy5fb25XaWxsQ3V0LmZpcmUoZSkpKTtcblx0XHRcdGxpc3RlbmVyc1RvUmVtb3ZlLnB1c2godmlldy5vbldpbGxQYXN0ZShlID0+IHRoaXMuX29uV2lsbFBhc3RlLmZpcmUoZSkpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9tb2RlbERhdGEgPSBuZXcgTW9kZWxEYXRhKG1vZGVsLCB2aWV3TW9kZWwsIHZpZXcsIGhhc1JlYWxWaWV3LCBsaXN0ZW5lcnNUb1JlbW92ZSwgYXR0YWNoZWRWaWV3KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlVmlldyh2aWV3TW9kZWw6IFZpZXdNb2RlbCk6IFtWaWV3LCBib29sZWFuXSB7XG5cdFx0bGV0IGNvbW1hbmREZWxlZ2F0ZTogSUNvbW1hbmREZWxlZ2F0ZTtcblx0XHRpZiAodGhpcy5pc1NpbXBsZVdpZGdldCkge1xuXHRcdFx0Y29tbWFuZERlbGVnYXRlID0ge1xuXHRcdFx0XHRwYXN0ZTogKHRleHQ6IHN0cmluZywgcGFzdGVPbk5ld0xpbmU6IGJvb2xlYW4sIG11bHRpY3Vyc29yVGV4dDogc3RyaW5nW10gfCBudWxsLCBtb2RlOiBzdHJpbmcgfCBudWxsKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fcGFzdGUoJ2tleWJvYXJkJywgdGV4dCwgcGFzdGVPbk5ld0xpbmUsIG11bHRpY3Vyc29yVGV4dCwgbW9kZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR5cGU6ICh0ZXh0OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHR0aGlzLl90eXBlKCdrZXlib2FyZCcsIHRleHQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21wb3NpdGlvblR5cGU6ICh0ZXh0OiBzdHJpbmcsIHJlcGxhY2VQcmV2Q2hhckNudDogbnVtYmVyLCByZXBsYWNlTmV4dENoYXJDbnQ6IG51bWJlciwgcG9zaXRpb25EZWx0YTogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY29tcG9zaXRpb25UeXBlKCdrZXlib2FyZCcsIHRleHQsIHJlcGxhY2VQcmV2Q2hhckNudCwgcmVwbGFjZU5leHRDaGFyQ250LCBwb3NpdGlvbkRlbHRhKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c3RhcnRDb21wb3NpdGlvbjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5kQ29tcG9zaXRpb246ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3V0OiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY3V0KCdrZXlib2FyZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb21tYW5kRGVsZWdhdGUgPSB7XG5cdFx0XHRcdHBhc3RlOiAodGV4dDogc3RyaW5nLCBwYXN0ZU9uTmV3TGluZTogYm9vbGVhbiwgbXVsdGljdXJzb3JUZXh0OiBzdHJpbmdbXSB8IG51bGwsIG1vZGU6IHN0cmluZyB8IG51bGwpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwYXlsb2FkOiBlZGl0b3JCcm93c2VyLlBhc3RlUGF5bG9hZCA9IHsgdGV4dCwgcGFzdGVPbk5ld0xpbmUsIG11bHRpY3Vyc29yVGV4dCwgbW9kZSB9O1xuXHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGVkaXRvckNvbW1vbi5IYW5kbGVyLlBhc3RlLCBwYXlsb2FkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0dHlwZTogKHRleHQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBheWxvYWQ6IGVkaXRvckNvbW1vbi5UeXBlUGF5bG9hZCA9IHsgdGV4dCB9O1xuXHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGVkaXRvckNvbW1vbi5IYW5kbGVyLlR5cGUsIHBheWxvYWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21wb3NpdGlvblR5cGU6ICh0ZXh0OiBzdHJpbmcsIHJlcGxhY2VQcmV2Q2hhckNudDogbnVtYmVyLCByZXBsYWNlTmV4dENoYXJDbnQ6IG51bWJlciwgcG9zaXRpb25EZWx0YTogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdFx0Ly8gVHJ5IGlmIHBvc3NpYmxlIHRvIGdvIHRocm91Z2ggdGhlIGV4aXN0aW5nIGByZXBsYWNlUHJldmlvdXNDaGFyYCBjb21tYW5kXG5cdFx0XHRcdFx0aWYgKHJlcGxhY2VOZXh0Q2hhckNudCB8fCBwb3NpdGlvbkRlbHRhKSB7XG5cdFx0XHRcdFx0XHQvLyBtdXN0IGJlIGhhbmRsZWQgdGhyb3VnaCB0aGUgbmV3IGNvbW1hbmRcblx0XHRcdFx0XHRcdGNvbnN0IHBheWxvYWQ6IGVkaXRvckNvbW1vbi5Db21wb3NpdGlvblR5cGVQYXlsb2FkID0geyB0ZXh0LCByZXBsYWNlUHJldkNoYXJDbnQsIHJlcGxhY2VOZXh0Q2hhckNudCwgcG9zaXRpb25EZWx0YSB9O1xuXHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZWRpdG9yQ29tbW9uLkhhbmRsZXIuQ29tcG9zaXRpb25UeXBlLCBwYXlsb2FkKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGF5bG9hZDogZWRpdG9yQ29tbW9uLlJlcGxhY2VQcmV2aW91c0NoYXJQYXlsb2FkID0geyB0ZXh0LCByZXBsYWNlQ2hhckNudDogcmVwbGFjZVByZXZDaGFyQ250IH07XG5cdFx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChlZGl0b3JDb21tb24uSGFuZGxlci5SZXBsYWNlUHJldmlvdXNDaGFyLCBwYXlsb2FkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN0YXJ0Q29tcG9zaXRpb246ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChlZGl0b3JDb21tb24uSGFuZGxlci5Db21wb3NpdGlvblN0YXJ0LCB7fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVuZENvbXBvc2l0aW9uOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZWRpdG9yQ29tbW9uLkhhbmRsZXIuQ29tcG9zaXRpb25FbmQsIHt9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3V0OiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZWRpdG9yQ29tbW9uLkhhbmRsZXIuQ3V0LCB7fSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld1VzZXJJbnB1dEV2ZW50cyA9IG5ldyBWaWV3VXNlcklucHV0RXZlbnRzKHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlcik7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbktleURvd24gPSAoZSkgPT4gdGhpcy5fb25LZXlEb3duLmZpcmUoZSk7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbktleVVwID0gKGUpID0+IHRoaXMuX29uS2V5VXAuZmlyZShlKTtcblx0XHR2aWV3VXNlcklucHV0RXZlbnRzLm9uQ29udGV4dE1lbnUgPSAoZSkgPT4gdGhpcy5fb25Db250ZXh0TWVudS5maXJlKGUpO1xuXHRcdHZpZXdVc2VySW5wdXRFdmVudHMub25Nb3VzZU1vdmUgPSAoZSkgPT4gdGhpcy5fb25Nb3VzZU1vdmUuZmlyZShlKTtcblx0XHR2aWV3VXNlcklucHV0RXZlbnRzLm9uTW91c2VMZWF2ZSA9IChlKSA9PiB0aGlzLl9vbk1vdXNlTGVhdmUuZmlyZShlKTtcblx0XHR2aWV3VXNlcklucHV0RXZlbnRzLm9uTW91c2VEb3duID0gKGUpID0+IHRoaXMuX29uTW91c2VEb3duLmZpcmUoZSk7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbk1vdXNlVXAgPSAoZSkgPT4gdGhpcy5fb25Nb3VzZVVwLmZpcmUoZSk7XG5cdFx0dmlld1VzZXJJbnB1dEV2ZW50cy5vbk1vdXNlRHJhZyA9IChlKSA9PiB0aGlzLl9vbk1vdXNlRHJhZy5maXJlKGUpO1xuXHRcdHZpZXdVc2VySW5wdXRFdmVudHMub25Nb3VzZURyb3AgPSAoZSkgPT4gdGhpcy5fb25Nb3VzZURyb3AuZmlyZShlKTtcblx0XHR2aWV3VXNlcklucHV0RXZlbnRzLm9uTW91c2VEcm9wQ2FuY2VsZWQgPSAoZSkgPT4gdGhpcy5fb25Nb3VzZURyb3BDYW5jZWxlZC5maXJlKGUpO1xuXHRcdHZpZXdVc2VySW5wdXRFdmVudHMub25Nb3VzZVdoZWVsID0gKGUpID0+IHRoaXMuX29uTW91c2VXaGVlbC5maXJlKGUpO1xuXG5cdFx0Y29uc3QgdmlldyA9IG5ldyBWaWV3KFxuXHRcdFx0dGhpcy5fZG9tRWxlbWVudCxcblx0XHRcdHRoaXMuZ2V0SWQoKSxcblx0XHRcdGNvbW1hbmREZWxlZ2F0ZSxcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb24sXG5cdFx0XHR0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdFx0dmlld1VzZXJJbnB1dEV2ZW50cyxcblx0XHRcdHRoaXMuX292ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdHRoaXMuX3VzZXJJbnRlcmFjdGlvblNlcnZpY2UsXG5cdFx0KTtcblxuXHRcdHJldHVybiBbdmlldywgdHJ1ZV07XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Bvc3REZXRhY2hNb2RlbENsZWFudXAoZGV0YWNoZWRNb2RlbDogSVRleHRNb2RlbCB8IG51bGwpOiB2b2lkIHtcblx0XHRkZXRhY2hlZE1vZGVsPy5yZW1vdmVBbGxEZWNvcmF0aW9uc1dpdGhPd25lcklkKHRoaXMuX2lkKTtcblx0fVxuXG5cdHByaXZhdGUgX2RldGFjaE1vZGVsKCk6IElUZXh0TW9kZWwgfCBudWxsIHtcblx0XHR0aGlzLl9jb250cmlidXRpb25zRGlzcG9zYWJsZT8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnNEaXNwb3NhYmxlID0gdW5kZWZpbmVkO1xuXHRcdGlmICghdGhpcy5fbW9kZWxEYXRhKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbERhdGEubW9kZWw7XG5cdFx0Y29uc3QgcmVtb3ZlRG9tTm9kZSA9IHRoaXMuX21vZGVsRGF0YS5oYXNSZWFsVmlldyA/IHRoaXMuX21vZGVsRGF0YS52aWV3LmRvbU5vZGUuZG9tTm9kZSA6IG51bGw7XG5cblx0XHR0aGlzLl9tb2RlbERhdGEuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX21vZGVsRGF0YSA9IG51bGw7XG5cblx0XHR0aGlzLl9kb21FbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnZGF0YS1tb2RlLWlkJyk7XG5cdFx0aWYgKHJlbW92ZURvbU5vZGUgJiYgdGhpcy5fZG9tRWxlbWVudC5jb250YWlucyhyZW1vdmVEb21Ob2RlKSkge1xuXHRcdFx0cmVtb3ZlRG9tTm9kZS5yZW1vdmUoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2Jhbm5lckRvbU5vZGUgJiYgdGhpcy5fZG9tRWxlbWVudC5jb250YWlucyh0aGlzLl9iYW5uZXJEb21Ob2RlKSkge1xuXHRcdFx0dGhpcy5fYmFubmVyRG9tTm9kZS5yZW1vdmUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShkZXNjcmlwdGlvbjogc3RyaW5nLCBrZXk6IHN0cmluZywgb3B0aW9uczogZWRpdG9yQ29tbW9uLklEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucywgcGFyZW50VHlwZUtleT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoZGVzY3JpcHRpb24sIGtleSwgb3B0aW9ucywgcGFyZW50VHlwZUtleSwgdGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVEZWNvcmF0aW9uVHlwZShrZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JTZXJ2aWNlLnJlbW92ZURlY29yYXRpb25UeXBlKGtleSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlRGVjb3JhdGlvbk9wdGlvbnModHlwZUtleTogc3RyaW5nLCB3cml0YWJsZTogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0XHRyZXR1cm4gdGhpcy5fY29kZUVkaXRvclNlcnZpY2UucmVzb2x2ZURlY29yYXRpb25PcHRpb25zKHR5cGVLZXksIHdyaXRhYmxlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUZWxlbWV0cnlEYXRhKCk6IG9iamVjdCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RlbGVtZXRyeURhdGE7XG5cdH1cblxuXHRwdWJsaWMgaGFzTW9kZWwoKTogdGhpcyBpcyBlZGl0b3JCcm93c2VyLklBY3RpdmVDb2RlRWRpdG9yIHtcblx0XHRyZXR1cm4gKHRoaXMuX21vZGVsRGF0YSAhPT0gbnVsbCk7XG5cdH1cblxuXHRwcml2YXRlIHNob3dEcm9wSW5kaWNhdG9yQXQocG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgbmV3RGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pLFxuXHRcdFx0b3B0aW9uczogQ29kZUVkaXRvcldpZGdldC5kcm9wSW50b0VkaXRvckRlY29yYXRpb25PcHRpb25zXG5cdFx0fV07XG5cblx0XHR0aGlzLl9kcm9wSW50b0VkaXRvckRlY29yYXRpb25zLnNldChuZXdEZWNvcmF0aW9ucyk7XG5cdFx0dGhpcy5yZXZlYWxQb3NpdGlvbihwb3NpdGlvbiwgZWRpdG9yQ29tbW9uLlNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlRHJvcEluZGljYXRvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9kcm9wSW50b0VkaXRvckRlY29yYXRpb25zLmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29udGV4dFZhbHVlKGtleTogc3RyaW5nLCB2YWx1ZTogQ29udGV4dEtleVZhbHVlKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KGtleSwgdmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYmVnaW5VcGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlQ291bnRlcisrO1xuXHRcdGlmICh0aGlzLl91cGRhdGVDb3VudGVyID09PSAxKSB7XG5cdFx0XHR0aGlzLl9vbkJlZ2luVXBkYXRlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9lbmRVcGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlQ291bnRlci0tO1xuXHRcdGlmICh0aGlzLl91cGRhdGVDb3VudGVyID09PSAwKSB7XG5cdFx0XHR0aGlzLl9vbkVuZFVwZGF0ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmxldCBFRElUT1JfSUQgPSAwO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBJcyB0aGlzIGEgc2ltcGxlIHdpZGdldCAobm90IGEgcmVhbCBjb2RlIGVkaXRvcik/XG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0aXNTaW1wbGVXaWRnZXQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cmlidXRpb25zIHRvIGluc3RhbnRpYXRlLlxuXHQgKiBXaGVuIHByb3ZpZGVkLCBvbmx5IHRoZSBjb250cmlidXRpb25zIGluY2x1ZGVkIHdpbGwgYmUgaW5zdGFudGlhdGVkLlxuXHQgKiBUbyBpbmNsdWRlIHRoZSBkZWZhdWx0cywgdGhvc2UgbXVzdCBiZSBwcm92aWRlZCBhcyB3ZWxsIHZpYSBbLi4uRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKV1cblx0ICogRGVmYXVsdHMgdG8gRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKS5cblx0ICovXG5cdGNvbnRyaWJ1dGlvbnM/OiBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXTtcblxuXHQvKipcblx0ICogVGVsZW1ldHJ5IGRhdGEgYXNzb2NpYXRlZCB3aXRoIHRoaXMgQ29kZUVkaXRvcldpZGdldC5cblx0ICogRGVmYXVsdHMgdG8gbnVsbC5cblx0ICovXG5cdHRlbGVtZXRyeURhdGE/OiBvYmplY3Q7XG5cblx0LyoqXG5cdCAqIFRoZSBJRCBvZiB0aGUgY29udGV4dCBtZW51LlxuXHQgKiBEZWZhdWx0cyB0byBNZW51SWQuU2ltcGxlRWRpdG9yQ29udGV4dCBvciBNZW51SWQuRWRpdG9yQ29udGV4dCBkZXBlbmRpbmcgb24gd2hldGhlciB0aGUgd2lkZ2V0IGlzIHNpbXBsZS5cblx0ICovXG5cdGNvbnRleHRNZW51SWQ/OiBNZW51SWQ7XG5cblx0LyoqXG5cdCAqIERlZmluZSBleHRyYSBjb250ZXh0IGtleXMgdGhhdCB3aWxsIGJlIGRlZmluZWQgaW4gdGhlIGNvbnRleHQgc2VydmljZVxuXHQgKiBmb3IgdGhlIGVkaXRvci5cblx0ICovXG5cdGNvbnRleHRLZXlWYWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCBDb250ZXh0S2V5VmFsdWU+O1xufVxuXG5jbGFzcyBNb2RlbERhdGEge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHVibGljIHJlYWRvbmx5IHZpZXdNb2RlbDogVmlld01vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSB2aWV3OiBWaWV3LFxuXHRcdHB1YmxpYyByZWFkb25seSBoYXNSZWFsVmlldzogYm9vbGVhbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGlzdGVuZXJzVG9SZW1vdmU6IElEaXNwb3NhYmxlW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IGF0dGFjaGVkVmlldzogSUF0dGFjaGVkVmlldyxcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRkaXNwb3NlKHRoaXMubGlzdGVuZXJzVG9SZW1vdmUpO1xuXHRcdHRoaXMubW9kZWwub25CZWZvcmVEZXRhY2hlZCh0aGlzLmF0dGFjaGVkVmlldyk7XG5cdFx0aWYgKHRoaXMuaGFzUmVhbFZpZXcpIHtcblx0XHRcdHRoaXMudmlldy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMudmlld01vZGVsLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jb25zdCBlbnVtIEJvb2xlYW5FdmVudFZhbHVlIHtcblx0Tm90U2V0LFxuXHRGYWxzZSxcblx0VHJ1ZVxufVxuXG5leHBvcnQgY2xhc3MgQm9vbGVhbkV2ZW50RW1pdHRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRvVHJ1ZTogRW1pdHRlcjx2b2lkPjtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlVG9UcnVlOiBFdmVudDx2b2lkPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVRvRmFsc2U6IEVtaXR0ZXI8dm9pZD47XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZVRvRmFsc2U6IEV2ZW50PHZvaWQ+O1xuXG5cdHByaXZhdGUgX3ZhbHVlOiBCb29sZWFuRXZlbnRWYWx1ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lbWl0dGVyT3B0aW9uczogRW1pdHRlck9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRvVHJ1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KHRoaXMuX2VtaXR0ZXJPcHRpb25zKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVRvVHJ1ZSA9IHRoaXMuX29uRGlkQ2hhbmdlVG9UcnVlLmV2ZW50O1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVG9GYWxzZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KHRoaXMuX2VtaXR0ZXJPcHRpb25zKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVRvRmFsc2UgPSB0aGlzLl9vbkRpZENoYW5nZVRvRmFsc2UuZXZlbnQ7XG5cdFx0dGhpcy5fdmFsdWUgPSBCb29sZWFuRXZlbnRWYWx1ZS5Ob3RTZXQ7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUoX3ZhbHVlOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgdmFsdWUgPSAoX3ZhbHVlID8gQm9vbGVhbkV2ZW50VmFsdWUuVHJ1ZSA6IEJvb2xlYW5FdmVudFZhbHVlLkZhbHNlKTtcblx0XHRpZiAodGhpcy5fdmFsdWUgPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3ZhbHVlID0gdmFsdWU7XG5cdFx0aWYgKHRoaXMuX3ZhbHVlID09PSBCb29sZWFuRXZlbnRWYWx1ZS5UcnVlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRvVHJ1ZS5maXJlKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl92YWx1ZSA9PT0gQm9vbGVhbkV2ZW50VmFsdWUuRmFsc2UpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlVG9GYWxzZS5maXJlKCk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQSByZWd1bGFyIGV2ZW50IGVtaXR0ZXIgdGhhdCBhbHNvIG1ha2VzIHN1cmUgY29udHJpYnV0aW9ucyBhcmUgaW5zdGFudGlhdGVkIGlmIG5lY2Vzc2FyeVxuICovXG5jbGFzcyBJbnRlcmFjdGlvbkVtaXR0ZXI8VD4gZXh0ZW5kcyBFbWl0dGVyPFQ+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRpb25zOiBDb2RlRWRpdG9yQ29udHJpYnV0aW9ucyxcblx0XHRkZWxpdmVyeVF1ZXVlOiBFdmVudERlbGl2ZXJ5UXVldWVcblx0KSB7XG5cdFx0c3VwZXIoeyBkZWxpdmVyeVF1ZXVlIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZmlyZShldmVudDogVCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGlvbnMub25CZWZvcmVJbnRlcmFjdGlvbkV2ZW50KCk7XG5cdFx0c3VwZXIuZmlyZShldmVudCk7XG5cdH1cbn1cblxuY2xhc3MgRWRpdG9yQ29udGV4dEtleXNNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTaW1wbGVJbnB1dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dElucHV0Rm9jdXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JUZXh0Rm9jdXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YWJNb3Zlc0ZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUmVhZG9ubHk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbkRpZmZFZGl0b3I6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JDb2x1bW5TZWxlY3Rpb246IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNNdWx0aXBsZVNlbGVjdGlvbnM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNOb25FbXB0eVNlbGVjdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhblVuZG86IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5SZWRvOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0Y29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXG5cdFx0Y29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdlZGl0b3JJZCcsIGVkaXRvci5nZXRJZCgpKTtcblxuXHRcdHRoaXMuX2VkaXRvclNpbXBsZUlucHV0ID0gRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yU2ltcGxlSW5wdXQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9lZGl0b3JGb2N1cyA9IEVkaXRvckNvbnRleHRLZXlzLmZvY3VzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fdGV4dElucHV0Rm9jdXMgPSBFZGl0b3JDb250ZXh0S2V5cy50ZXh0SW5wdXRGb2N1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2VkaXRvclRleHRGb2N1cyA9IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3RhYk1vdmVzRm9jdXMgPSBFZGl0b3JDb250ZXh0S2V5cy50YWJNb3Zlc0ZvY3VzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fZWRpdG9yUmVhZG9ubHkgPSBFZGl0b3JDb250ZXh0S2V5cy5yZWFkT25seS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2luRGlmZkVkaXRvciA9IEVkaXRvckNvbnRleHRLZXlzLmluRGlmZkVkaXRvci5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2VkaXRvckNvbHVtblNlbGVjdGlvbiA9IEVkaXRvckNvbnRleHRLZXlzLmNvbHVtblNlbGVjdGlvbi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc011bHRpcGxlU2VsZWN0aW9ucyA9IEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlU2VsZWN0aW9ucy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc05vbkVtcHR5U2VsZWN0aW9uID0gRWRpdG9yQ29udGV4dEtleXMuaGFzTm9uRW1wdHlTZWxlY3Rpb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jYW5VbmRvID0gRWRpdG9yQ29udGV4dEtleXMuY2FuVW5kby5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NhblJlZG8gPSBFZGl0b3JDb250ZXh0S2V5cy5jYW5SZWRvLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKCgpID0+IHRoaXMuX3VwZGF0ZUZyb21Db25maWcoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoKSA9PiB0aGlzLl91cGRhdGVGcm9tU2VsZWN0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB0aGlzLl91cGRhdGVGcm9tRm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4gdGhpcy5fdXBkYXRlRnJvbUZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRGb2N1c0VkaXRvclRleHQoKCkgPT4gdGhpcy5fdXBkYXRlRnJvbUZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB0aGlzLl91cGRhdGVGcm9tRm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHRoaXMuX3VwZGF0ZUZyb21Nb2RlbCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoKSA9PiB0aGlzLl91cGRhdGVGcm9tTW9kZWwoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFRhYkZvY3VzLm9uRGlkQ2hhbmdlVGFiRm9jdXMoKHRhYkZvY3VzTW9kZTogYm9vbGVhbikgPT4gdGhpcy5fdGFiTW92ZXNGb2N1cy5zZXQodGFiRm9jdXNNb2RlKSkpO1xuXG5cdFx0dGhpcy5fdXBkYXRlRnJvbUNvbmZpZygpO1xuXHRcdHRoaXMuX3VwZGF0ZUZyb21TZWxlY3Rpb24oKTtcblx0XHR0aGlzLl91cGRhdGVGcm9tRm9jdXMoKTtcblx0XHR0aGlzLl91cGRhdGVGcm9tTW9kZWwoKTtcblxuXHRcdHRoaXMuX2VkaXRvclNpbXBsZUlucHV0LnNldCh0aGlzLl9lZGl0b3IuaXNTaW1wbGVXaWRnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRnJvbUNvbmZpZygpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbnMoKTtcblxuXHRcdHRoaXMuX3RhYk1vdmVzRm9jdXMuc2V0KG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi50YWJGb2N1c01vZGUpIHx8IFRhYkZvY3VzLmdldFRhYkZvY3VzTW9kZSgpKTtcblx0XHR0aGlzLl9lZGl0b3JSZWFkb25seS5zZXQob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnJlYWRPbmx5KSk7XG5cdFx0dGhpcy5faW5EaWZmRWRpdG9yLnNldChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uaW5EaWZmRWRpdG9yKSk7XG5cdFx0dGhpcy5fZWRpdG9yQ29sdW1uU2VsZWN0aW9uLnNldChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uY29sdW1uU2VsZWN0aW9uKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVGcm9tU2VsZWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdGlmICghc2VsZWN0aW9ucykge1xuXHRcdFx0dGhpcy5faGFzTXVsdGlwbGVTZWxlY3Rpb25zLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNOb25FbXB0eVNlbGVjdGlvbi5yZXNldCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9oYXNNdWx0aXBsZVNlbGVjdGlvbnMuc2V0KHNlbGVjdGlvbnMubGVuZ3RoID4gMSk7XG5cdFx0XHR0aGlzLl9oYXNOb25FbXB0eVNlbGVjdGlvbi5zZXQoc2VsZWN0aW9ucy5zb21lKHMgPT4gIXMuaXNFbXB0eSgpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRnJvbUZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvckZvY3VzLnNldCh0aGlzLl9lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSAmJiAhdGhpcy5fZWRpdG9yLmlzU2ltcGxlV2lkZ2V0KTtcblx0XHR0aGlzLl9lZGl0b3JUZXh0Rm9jdXMuc2V0KHRoaXMuX2VkaXRvci5oYXNUZXh0Rm9jdXMoKSAmJiAhdGhpcy5fZWRpdG9yLmlzU2ltcGxlV2lkZ2V0KTtcblx0XHR0aGlzLl90ZXh0SW5wdXRGb2N1cy5zZXQodGhpcy5fZWRpdG9yLmhhc1RleHRGb2N1cygpKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUZyb21Nb2RlbCgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHRoaXMuX2NhblVuZG8uc2V0KEJvb2xlYW4obW9kZWwgJiYgbW9kZWwuY2FuVW5kbygpKSk7XG5cdFx0dGhpcy5fY2FuUmVkby5zZXQoQm9vbGVhbihtb2RlbCAmJiBtb2RlbC5jYW5SZWRvKCkpKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRWRpdG9yTW9kZUNvbnRleHQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5nSWQ6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0NvbXBsZXRpb25JdGVtUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNDb2RlQWN0aW9uc1Byb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzQ29kZUxlbnNQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0RlZmluaXRpb25Qcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0RlY2xhcmF0aW9uUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNJbXBsZW1lbnRhdGlvblByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzVHlwZURlZmluaXRpb25Qcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0hvdmVyUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzRG9jdW1lbnRTeW1ib2xQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc1JlZmVyZW5jZVByb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzUmVuYW1lUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0RvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzTXVsdGlwbGVEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc011bHRpcGxlRG9jdW1lbnRTZWxlY3Rpb25Gb3JtYXR0aW5nUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNTaWduYXR1cmVIZWxwUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9oYXNJbmxheUhpbnRzUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0luRW1iZWRkZWRFZGl0b3I6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogQ29kZUVkaXRvcldpZGdldCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9sYW5nSWQgPSBFZGl0b3JDb250ZXh0S2V5cy5sYW5ndWFnZUlkLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc0NvbXBsZXRpb25JdGVtUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNDb21wbGV0aW9uSXRlbVByb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc0NvZGVBY3Rpb25zUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNDb2RlQWN0aW9uc1Byb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc0NvZGVMZW5zUHJvdmlkZXIgPSBFZGl0b3JDb250ZXh0S2V5cy5oYXNDb2RlTGVuc1Byb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc0RlZmluaXRpb25Qcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0RlZmluaXRpb25Qcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNEZWNsYXJhdGlvblByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzRGVjbGFyYXRpb25Qcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNJbXBsZW1lbnRhdGlvblByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzSW1wbGVtZW50YXRpb25Qcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNUeXBlRGVmaW5pdGlvblByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzVHlwZURlZmluaXRpb25Qcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNIb3ZlclByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzSG92ZXJQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNEb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNEb2N1bWVudFN5bWJvbFByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzRG9jdW1lbnRTeW1ib2xQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNSZWZlcmVuY2VQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc1JlZmVyZW5jZVByb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc1JlbmFtZVByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzUmVuYW1lUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzU2lnbmF0dXJlSGVscFByb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzU2lnbmF0dXJlSGVscFByb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc0lubGF5SGludHNQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0lubGF5SGludHNQcm92aWRlci5iaW5kVG8oX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9oYXNEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc0RvY3VtZW50Rm9ybWF0dGluZ1Byb3ZpZGVyLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc0RvY3VtZW50U2VsZWN0aW9uRm9ybWF0dGluZ1Byb3ZpZGVyID0gRWRpdG9yQ29udGV4dEtleXMuaGFzRG9jdW1lbnRTZWxlY3Rpb25Gb3JtYXR0aW5nUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzTXVsdGlwbGVEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzTXVsdGlwbGVEb2N1bWVudFNlbGVjdGlvbkZvcm1hdHRpbmdQcm92aWRlciA9IEVkaXRvckNvbnRleHRLZXlzLmhhc011bHRpcGxlRG9jdW1lbnRTZWxlY3Rpb25Gb3JtYXR0aW5nUHJvdmlkZXIuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faXNJbkVtYmVkZGVkRWRpdG9yID0gRWRpdG9yQ29udGV4dEtleXMuaXNJbkVtYmVkZGVkRWRpdG9yLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdXBkYXRlID0gKCkgPT4gdGhpcy5fdXBkYXRlKCk7XG5cblx0XHQvLyB1cGRhdGUgd2hlbiBtb2RlbC9tb2RlIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3RlcihfZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsTGFuZ3VhZ2UodXBkYXRlKSk7XG5cblx0XHQvLyB1cGRhdGUgd2hlbiByZWdpc3RyaWVzIGNoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUxlbnNQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWNsYXJhdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbXBsZW1lbnRhdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS50eXBlRGVmaW5pdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5ob3ZlclByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudEhpZ2hsaWdodFByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFN5bWJvbFByb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5yZWZlcmVuY2VQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIub25EaWRDaGFuZ2UodXBkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNpZ25hdHVyZUhlbHBQcm92aWRlci5vbkRpZENoYW5nZSh1cGRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5sYXlIaW50c1Byb3ZpZGVyLm9uRGlkQ2hhbmdlKHVwZGF0ZSkpO1xuXG5cdFx0dXBkYXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHJlc2V0KCkge1xuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYW5nSWQucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0NvbXBsZXRpb25JdGVtUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0NvZGVBY3Rpb25zUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0NvZGVMZW5zUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc0RlZmluaXRpb25Qcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzRGVjbGFyYXRpb25Qcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzSW1wbGVtZW50YXRpb25Qcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzVHlwZURlZmluaXRpb25Qcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzSG92ZXJQcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzRG9jdW1lbnRTeW1ib2xQcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzUmVmZXJlbmNlUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc1JlbmFtZVByb3ZpZGVyLnJlc2V0KCk7XG5cdFx0XHR0aGlzLl9oYXNEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faGFzRG9jdW1lbnRTZWxlY3Rpb25Gb3JtYXR0aW5nUHJvdmlkZXIucmVzZXQoKTtcblx0XHRcdHRoaXMuX2hhc1NpZ25hdHVyZUhlbHBQcm92aWRlci5yZXNldCgpO1xuXHRcdFx0dGhpcy5faXNJbkVtYmVkZGVkRWRpdG9yLnJlc2V0KCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aGlzLnJlc2V0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9sYW5nSWQuc2V0KG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0XHR0aGlzLl9oYXNDb21wbGV0aW9uSXRlbVByb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNDb2RlQWN0aW9uc1Byb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlQWN0aW9uUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNDb2RlTGVuc1Byb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb2RlTGVuc1Byb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzRGVmaW5pdGlvblByb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWZpbml0aW9uUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNEZWNsYXJhdGlvblByb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kZWNsYXJhdGlvblByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzSW1wbGVtZW50YXRpb25Qcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW1wbGVtZW50YXRpb25Qcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc1R5cGVEZWZpbml0aW9uUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnR5cGVEZWZpbml0aW9uUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNIb3ZlclByb3ZpZGVyLnNldCh0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5ob3ZlclByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzRG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRIaWdobGlnaHRQcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc0RvY3VtZW50U3ltYm9sUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNSZWZlcmVuY2VQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVmZXJlbmNlUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNSZW5hbWVQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UucmVuYW1lUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0XHR0aGlzLl9oYXNTaWduYXR1cmVIZWxwUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLnNpZ25hdHVyZUhlbHBQcm92aWRlci5oYXMobW9kZWwpKTtcblx0XHRcdHRoaXMuX2hhc0lubGF5SGludHNQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5sYXlIaW50c1Byb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzRG9jdW1lbnRGb3JtYXR0aW5nUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50Rm9ybWF0dGluZ0VkaXRQcm92aWRlci5oYXMobW9kZWwpIHx8IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzRG9jdW1lbnRTZWxlY3Rpb25Gb3JtYXR0aW5nUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLmhhcyhtb2RlbCkpO1xuXHRcdFx0dGhpcy5faGFzTXVsdGlwbGVEb2N1bWVudEZvcm1hdHRpbmdQcm92aWRlci5zZXQodGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLmFsbChtb2RlbCkubGVuZ3RoICsgdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRSYW5nZUZvcm1hdHRpbmdFZGl0UHJvdmlkZXIuYWxsKG1vZGVsKS5sZW5ndGggPiAxKTtcblx0XHRcdHRoaXMuX2hhc011bHRpcGxlRG9jdW1lbnRTZWxlY3Rpb25Gb3JtYXR0aW5nUHJvdmlkZXIuc2V0KHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VGb3JtYXR0aW5nRWRpdFByb3ZpZGVyLmFsbChtb2RlbCkubGVuZ3RoID4gMSk7XG5cdFx0XHR0aGlzLl9pc0luRW1iZWRkZWRFZGl0b3Iuc2V0KG1vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMud2Fsa1Rocm91Z2hTbmlwcGV0IHx8IG1vZGVsLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlQ2hhdENvZGVCbG9jayk7XG5cdFx0fSk7XG5cdH1cbn1cblxuXG5jbGFzcyBFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gaW1wbGVtZW50cyBlZGl0b3JDb21tb24uSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB7XG5cblx0cHJpdmF0ZSBfZGVjb3JhdGlvbklkczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfaXNDaGFuZ2luZ0RlY29yYXRpb25zOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHVibGljIGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbklkcy5sZW5ndGg7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IGVkaXRvckJyb3dzZXIuSUNvZGVFZGl0b3IsXG5cdFx0ZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdIHwgdW5kZWZpbmVkXG5cdCkge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGRlY29yYXRpb25zKSAmJiBkZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnNldChkZWNvcmF0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG9uRGlkQ2hhbmdlKGxpc3RlbmVyOiAoZTogSU1vZGVsRGVjb3JhdGlvbnNDaGFuZ2VkRXZlbnQpID0+IHVua25vd24sIHRoaXNBcmdzPzogdW5rbm93biwgZGlzcG9zYWJsZXM/OiBJRGlzcG9zYWJsZVtdIHwgRGlzcG9zYWJsZVN0b3JlKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbERlY29yYXRpb25zKChlKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNDaGFuZ2luZ0RlY29yYXRpb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxpc3RlbmVyLmNhbGwodGhpc0FyZ3MsIGUpO1xuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRSYW5nZShpbmRleDogbnVtYmVyKTogUmFuZ2UgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGluZGV4ID49IHRoaXMuX2RlY29yYXRpb25JZHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmdldERlY29yYXRpb25SYW5nZSh0aGlzLl9kZWNvcmF0aW9uSWRzW2luZGV4XSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmFuZ2VzKCk6IFJhbmdlW10ge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCByZXN1bHQ6IFJhbmdlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb25JZCBvZiB0aGlzLl9kZWNvcmF0aW9uSWRzKSB7XG5cdFx0XHRjb25zdCByYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uSWQpO1xuXHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBoYXMoZGVjb3JhdGlvbjogSU1vZGVsRGVjb3JhdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9kZWNvcmF0aW9uSWRzLmluY2x1ZGVzKGRlY29yYXRpb24uaWQpO1xuXHR9XG5cblx0cHVibGljIGNsZWFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kZWNvcmF0aW9uSWRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNldChbXSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0KG5ld0RlY29yYXRpb25zOiByZWFkb25seSBJTW9kZWxEZWx0YURlY29yYXRpb25bXSk6IHN0cmluZ1tdIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faXNDaGFuZ2luZ0RlY29yYXRpb25zID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbklkcyA9IGFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnModGhpcy5fZGVjb3JhdGlvbklkcywgbmV3RGVjb3JhdGlvbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzQ2hhbmdpbmdEZWNvcmF0aW9ucyA9IGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVjb3JhdGlvbklkcztcblx0fVxuXG5cdHB1YmxpYyBhcHBlbmQobmV3RGVjb3JhdGlvbnM6IHJlYWRvbmx5IElNb2RlbERlbHRhRGVjb3JhdGlvbltdKTogc3RyaW5nW10ge1xuXHRcdGxldCBuZXdEZWNvcmF0aW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9pc0NoYW5naW5nRGVjb3JhdGlvbnMgPSB0cnVlO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmNoYW5nZURlY29yYXRpb25zKChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRuZXdEZWNvcmF0aW9uSWRzID0gYWNjZXNzb3IuZGVsdGFEZWNvcmF0aW9ucyhbXSwgbmV3RGVjb3JhdGlvbnMpO1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0aW9uSWRzID0gdGhpcy5fZGVjb3JhdGlvbklkcy5jb25jYXQobmV3RGVjb3JhdGlvbklkcyk7XG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNDaGFuZ2luZ0RlY29yYXRpb25zID0gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBuZXdEZWNvcmF0aW9uSWRzO1xuXHR9XG59XG5cbmNvbnN0IHNxdWlnZ2x5U3RhcnQgPSBlbmNvZGVVUklDb21wb25lbnQoYDxzdmcgeG1sbnM9J2h0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnJyB2aWV3Qm94PScwIDAgNiAzJyBlbmFibGUtYmFja2dyb3VuZD0nbmV3IDAgMCA2IDMnIGhlaWdodD0nMycgd2lkdGg9JzYnPjxnIGZpbGw9J2ApO1xuY29uc3Qgc3F1aWdnbHlFbmQgPSBlbmNvZGVVUklDb21wb25lbnQoYCc+PHBvbHlnb24gcG9pbnRzPSc1LjUsMCAyLjUsMyAxLjEsMyA0LjEsMCcvPjxwb2x5Z29uIHBvaW50cz0nNCwwIDYsMiA2LDAuNiA1LjQsMCcvPjxwb2x5Z29uIHBvaW50cz0nMCwyIDEsMyAyLjQsMyAwLDAuNicvPjwvZz48L3N2Zz5gKTtcblxuZnVuY3Rpb24gZ2V0U3F1aWdnbHlTVkdEYXRhKGNvbG9yOiBDb2xvcikge1xuXHRyZXR1cm4gc3F1aWdnbHlTdGFydCArIGVuY29kZVVSSUNvbXBvbmVudChjb2xvci50b1N0cmluZygpKSArIHNxdWlnZ2x5RW5kO1xufVxuXG5jb25zdCBkb3Rkb3Rkb3RTdGFydCA9IGVuY29kZVVSSUNvbXBvbmVudChgPHN2ZyB4bWxucz1cImh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnXCIgaGVpZ2h0PVwiM1wiIHdpZHRoPVwiMTJcIj48ZyBmaWxsPVwiYCk7XG5jb25zdCBkb3Rkb3Rkb3RFbmQgPSBlbmNvZGVVUklDb21wb25lbnQoYFwiPjxjaXJjbGUgY3g9XCIxXCIgY3k9XCIxXCIgcj1cIjFcIi8+PGNpcmNsZSBjeD1cIjVcIiBjeT1cIjFcIiByPVwiMVwiLz48Y2lyY2xlIGN4PVwiOVwiIGN5PVwiMVwiIHI9XCIxXCIvPjwvZz48L3N2Zz5gKTtcblxuZnVuY3Rpb24gZ2V0RG90RG90RG90U1ZHRGF0YShjb2xvcjogQ29sb3IpIHtcblx0cmV0dXJuIGRvdGRvdGRvdFN0YXJ0ICsgZW5jb2RlVVJJQ29tcG9uZW50KGNvbG9yLnRvU3RyaW5nKCkpICsgZG90ZG90ZG90RW5kO1xufVxuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRjb25zdCBlcnJvckZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JFcnJvckZvcmVncm91bmQpO1xuXHRpZiAoZXJyb3JGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC4ke0NsYXNzTmFtZS5FZGl0b3JFcnJvckRlY29yYXRpb259IHsgYmFja2dyb3VuZDogdXJsKFwiZGF0YTppbWFnZS9zdmcreG1sLCR7Z2V0U3F1aWdnbHlTVkdEYXRhKGVycm9yRm9yZWdyb3VuZCl9XCIpIHJlcGVhdC14IGJvdHRvbSBsZWZ0OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYDpyb290IHsgLS1tb25hY28tZWRpdG9yLWVycm9yLWRlY29yYXRpb246IHVybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwke2dldFNxdWlnZ2x5U1ZHRGF0YShlcnJvckZvcmVncm91bmQpfVwiKTsgfWApO1xuXHR9XG5cdGNvbnN0IHdhcm5pbmdGb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yV2FybmluZ0ZvcmVncm91bmQpO1xuXHRpZiAod2FybmluZ0ZvcmVncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IgLiR7Q2xhc3NOYW1lLkVkaXRvcldhcm5pbmdEZWNvcmF0aW9ufSB7IGJhY2tncm91bmQ6IHVybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwke2dldFNxdWlnZ2x5U1ZHRGF0YSh3YXJuaW5nRm9yZWdyb3VuZCl9XCIpIHJlcGVhdC14IGJvdHRvbSBsZWZ0OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYDpyb290IHsgLS1tb25hY28tZWRpdG9yLXdhcm5pbmctZGVjb3JhdGlvbjogdXJsKFwiZGF0YTppbWFnZS9zdmcreG1sLCR7Z2V0U3F1aWdnbHlTVkdEYXRhKHdhcm5pbmdGb3JlZ3JvdW5kKX1cIik7IH1gKTtcblx0fVxuXHRjb25zdCBpbmZvRm9yZWdyb3VuZCA9IHRoZW1lLmdldENvbG9yKGVkaXRvckluZm9Gb3JlZ3JvdW5kKTtcblx0aWYgKGluZm9Gb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yIC4ke0NsYXNzTmFtZS5FZGl0b3JJbmZvRGVjb3JhdGlvbn0geyBiYWNrZ3JvdW5kOiB1cmwoXCJkYXRhOmltYWdlL3N2Zyt4bWwsJHtnZXRTcXVpZ2dseVNWR0RhdGEoaW5mb0ZvcmVncm91bmQpfVwiKSByZXBlYXQteCBib3R0b20gbGVmdDsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGA6cm9vdCB7IC0tbW9uYWNvLWVkaXRvci1pbmZvLWRlY29yYXRpb246IHVybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwke2dldFNxdWlnZ2x5U1ZHRGF0YShpbmZvRm9yZWdyb3VuZCl9XCIpOyB9YCk7XG5cdH1cblx0Y29uc3QgaGludEZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JIaW50Rm9yZWdyb3VuZCk7XG5cdGlmIChoaW50Rm9yZWdyb3VuZCkge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAuJHtDbGFzc05hbWUuRWRpdG9ySGludERlY29yYXRpb259IHsgYmFja2dyb3VuZDogdXJsKFwiZGF0YTppbWFnZS9zdmcreG1sLCR7Z2V0RG90RG90RG90U1ZHRGF0YShoaW50Rm9yZWdyb3VuZCl9XCIpIG5vLXJlcGVhdCBib3R0b20gbGVmdDsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGA6cm9vdCB7IC0tbW9uYWNvLWVkaXRvci1oaW50LWRlY29yYXRpb246IHVybChcImRhdGE6aW1hZ2Uvc3ZnK3htbCwke2dldERvdERvdERvdFNWR0RhdGEoaGludEZvcmVncm91bmQpfVwiKTsgfWApO1xuXHR9XG5cdGNvbnN0IHVubmVjZXNzYXJ5Rm9yZWdyb3VuZCA9IHRoZW1lLmdldENvbG9yKGVkaXRvclVubmVjZXNzYXJ5Q29kZU9wYWNpdHkpO1xuXHRpZiAodW5uZWNlc3NhcnlGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yLnNob3dVbnVzZWQgLiR7Q2xhc3NOYW1lLkVkaXRvclVubmVjZXNzYXJ5SW5saW5lRGVjb3JhdGlvbn0geyBvcGFjaXR5OiAke3VubmVjZXNzYXJ5Rm9yZWdyb3VuZC5yZ2JhLmF9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYDpyb290IHsgLS1tb25hY28tZWRpdG9yLXVubmVjZXNzYXJ5LWRlY29yYXRpb24tb3BhY2l0eTogJHt1bm5lY2Vzc2FyeUZvcmVncm91bmQucmdiYS5hfTsgfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFlBQVksU0FBUztBQUlyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFNBQW9ELGdDQUFnQztBQUM3RixTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUEwQyxlQUFlO0FBQ2xFLFNBQVMsZUFBZTtBQUN4QixPQUFPO0FBQ1AsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBdUQ7QUFDaEUsU0FBUyxnQkFBZ0I7QUFHekIsU0FBUyxnQ0FBZ0U7QUFDekUsU0FBUywwQkFBMEI7QUFDbkMsU0FBeUUsWUFBWTtBQUNyRixTQUFTLG9DQUFvQztBQUU3QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtCQUErQjtBQUV4QyxTQUFzRCxjQUF5Rix1QkFBdUIsbUNBQW1DO0FBQ3pNLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsb0NBQW9D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
