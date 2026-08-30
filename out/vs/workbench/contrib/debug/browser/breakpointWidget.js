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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import * as lifecycle from "../../../../base/common/lifecycle.js";
import { URI as uri } from "../../../../base/common/uri.js";
import { EditorCommand, registerEditorCommand } from "../../../../editor/browser/editorExtensions.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../editor/common/languages/modesRegistry.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { CompletionOptions, provideSuggestionItems } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { ZoneWidget } from "../../../../editor/contrib/zoneWidget/browser/zoneWidget.js";
import * as nls from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService, createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { defaultButtonStyles, defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { editorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions } from "../../codeEditor/browser/simpleEditorOptions.js";
import { BREAKPOINT_EDITOR_CONTRIBUTION_ID, CONTEXT_BREAKPOINT_WIDGET_VISIBLE, CONTEXT_IN_BREAKPOINT_WIDGET, BreakpointWidgetContext as Context, DEBUG_SCHEME, IDebugService } from "../common/debug.js";
import "./media/breakpointWidget.css";
const $ = dom.$;
const IPrivateBreakpointWidgetService = createDecorator("privateBreakpointWidgetService");
const DECORATION_KEY = "breakpointwidgetdecoration";
function isPositionInCurlyBracketBlock(input) {
  const model = input.getModel();
  const bracketPairs = model.bracketPairs.getBracketPairsInRange(Range.fromPositions(input.getPosition()));
  return bracketPairs.some((p) => p.openingBracketInfo.bracketText === "{");
}
function createDecorations(theme, placeHolder) {
  const transparentForeground = theme.getColor(editorForeground)?.transparent(0.4);
  return [{
    range: {
      startLineNumber: 0,
      endLineNumber: 0,
      startColumn: 0,
      endColumn: 1
    },
    renderOptions: {
      after: {
        contentText: placeHolder,
        color: transparentForeground ? transparentForeground.toString() : void 0
      }
    }
  }];
}
let BreakpointWidget = class extends ZoneWidget {
  constructor(editor, lineNumber, column, context, contextViewService, debugService, themeService, instantiationService, modelService, codeEditorService, _configurationService, languageFeaturesService, keybindingService, labelService, textModelService, hoverService) {
    super(editor, { showFrame: true, showArrow: false, frameWidth: 1, isAccessible: true });
    this.lineNumber = lineNumber;
    this.column = column;
    this.contextViewService = contextViewService;
    this.debugService = debugService;
    this.themeService = themeService;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.codeEditorService = codeEditorService;
    this._configurationService = _configurationService;
    this.languageFeaturesService = languageFeaturesService;
    this.keybindingService = keybindingService;
    this.labelService = labelService;
    this.textModelService = textModelService;
    this.hoverService = hoverService;
    this.conditionInput = "";
    this.hitCountInput = "";
    this.logMessageInput = "";
    this.availableBreakpoints = [];
    this.store = new lifecycle.DisposableStore();
    const model = this.editor.getModel();
    if (model) {
      const uri2 = model.uri;
      const breakpoints = this.debugService.getModel().getBreakpoints({ lineNumber: this.lineNumber, column: this.column, uri: uri2 });
      this.breakpoint = breakpoints.length ? breakpoints[0] : void 0;
    }
    if (context === void 0) {
      if (this.breakpoint && !this.breakpoint.condition && !this.breakpoint.hitCondition && this.breakpoint.logMessage) {
        this.context = Context.LOG_MESSAGE;
      } else if (this.breakpoint && !this.breakpoint.condition && this.breakpoint.hitCondition) {
        this.context = Context.HIT_COUNT;
      } else if (this.breakpoint && this.breakpoint.triggeredBy) {
        this.context = Context.TRIGGER_POINT;
      } else {
        this.context = Context.CONDITION;
      }
    } else {
      this.context = context;
    }
    this.store.add(this.debugService.getModel().onDidChangeBreakpoints((e) => {
      if (this.breakpoint && e && e.removed && e.removed.indexOf(this.breakpoint) >= 0) {
        this.dispose();
      }
      if (this.context === Context.TRIGGER_POINT && this.selectBreakpointBox) {
        this.updateTriggerBreakpointList();
      }
    }));
    this.store.add(this.codeEditorService.registerDecorationType("breakpoint-widget", DECORATION_KEY, {}));
    this.create();
  }
  get placeholder() {
    const acceptString = this.keybindingService.lookupKeybinding(AcceptBreakpointWidgetInputAction.ID)?.getLabel() || "Enter";
    const closeString = this.keybindingService.lookupKeybinding(CloseBreakpointWidgetCommand.ID)?.getLabel() || "Escape";
    switch (this.context) {
      case Context.LOG_MESSAGE:
        return nls.localize("breakpointWidgetLogMessagePlaceholder", "Message to log when breakpoint is hit. Expressions within {} are interpolated. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
      case Context.HIT_COUNT:
        return nls.localize("breakpointWidgetHitCountPlaceholder", "Break when hit count condition is met. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
      default:
        return nls.localize("breakpointWidgetExpressionPlaceholder", "Break when expression evaluates to true. '{0}' to accept, '{1}' to cancel.", acceptString, closeString);
    }
  }
  getInputValue(breakpoint) {
    switch (this.context) {
      case Context.LOG_MESSAGE:
        return breakpoint && breakpoint.logMessage ? breakpoint.logMessage : this.logMessageInput;
      case Context.HIT_COUNT:
        return breakpoint && breakpoint.hitCondition ? breakpoint.hitCondition : this.hitCountInput;
      default:
        return breakpoint && breakpoint.condition ? breakpoint.condition : this.conditionInput;
    }
  }
  rememberInput() {
    if (this.context !== Context.TRIGGER_POINT) {
      const value = this.input.getModel().getValue();
      switch (this.context) {
        case Context.LOG_MESSAGE:
          this.logMessageInput = value;
          break;
        case Context.HIT_COUNT:
          this.hitCountInput = value;
          break;
        default:
          this.conditionInput = value;
      }
    }
  }
  setInputMode() {
    if (this.editor.hasModel()) {
      const languageId = this.context === Context.LOG_MESSAGE ? PLAINTEXT_LANGUAGE_ID : this.editor.getModel().getLanguageId();
      this.input.getModel().setLanguage(languageId);
    }
  }
  show(rangeOrPos) {
    const lineNum = this.input.getModel().getLineCount();
    super.show(rangeOrPos, lineNum + 1);
  }
  fitHeightToContent() {
    const lineNum = this.input.getModel().getLineCount();
    this._relayout(lineNum + 1);
  }
  _fillContainer(container) {
    this.setCssClass("breakpoint-widget");
    const selectBox = this.store.add(new SelectBox([
      { text: nls.localize("expression", "Expression") },
      { text: nls.localize("hitCount", "Hit Count") },
      { text: nls.localize("logMessage", "Log Message") },
      { text: nls.localize("triggeredBy", "Wait for Breakpoint") }
    ], this.context, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("breakpointType", "Breakpoint Type"), useCustomDrawn: !hasNativeContextMenu(this._configurationService) }));
    this.selectContainer = $(".breakpoint-select-container");
    selectBox.render(dom.append(container, this.selectContainer));
    this.store.add(selectBox.onDidSelect((e) => {
      this.rememberInput();
      this.context = e.index;
      this.updateContextInput();
    }));
    this.createModesInput(container);
    this.inputContainer = $(".inputContainer");
    this.store.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.inputContainer, this.placeholder));
    this.createBreakpointInput(dom.append(container, this.inputContainer));
    this.input.getModel().setValue(this.getInputValue(this.breakpoint));
    this.store.add(this.input.getModel().onDidChangeContent(() => {
      this.fitHeightToContent();
    }));
    this.input.setPosition({ lineNumber: 1, column: this.input.getModel().getLineMaxColumn(1) });
    this.createTriggerBreakpointInput(container);
    this.updateContextInput();
    setTimeout(() => this.focusInput(), 150);
  }
  createModesInput(container) {
    const modes = this.debugService.getModel().getBreakpointModes("source");
    if (modes.length <= 1) {
      return;
    }
    const sb = this.selectModeBox = new SelectBox(
      [
        { text: nls.localize("bpMode", "Mode"), isDisabled: true },
        ...modes.map((mode) => ({ text: mode.label, description: mode.description }))
      ],
      modes.findIndex((m) => m.mode === this.breakpoint?.mode) + 1,
      this.contextViewService,
      defaultSelectBoxStyles,
      { useCustomDrawn: !hasNativeContextMenu(this._configurationService) }
    );
    this.store.add(sb);
    this.store.add(sb.onDidSelect((e) => {
      this.modeInput = modes[e.index - 1];
    }));
    const modeWrapper = $(".select-mode-container");
    const selectionWrapper = $(".select-box-container");
    dom.append(modeWrapper, selectionWrapper);
    sb.render(selectionWrapper);
    dom.append(container, modeWrapper);
  }
  createTriggerBreakpointInput(container) {
    this.availableBreakpoints = this.debugService.getModel().getBreakpoints().filter((bp) => bp !== this.breakpoint && !bp.logMessage);
    const breakpointOptions = this.buildBreakpointOptions();
    const index = this.availableBreakpoints.findIndex((bp) => this.breakpoint?.triggeredBy === bp.getId());
    let selectedIndex = 0;
    if (index !== -1) {
      this.triggeredByBreakpointInput = this.availableBreakpoints[index];
      selectedIndex = index + 1;
    } else if (!this.breakpoint?.triggeredBy && this.availableBreakpoints.length > 0) {
      this.triggeredByBreakpointInput = this.availableBreakpoints[0];
      selectedIndex = 1;
    } else {
      this.triggeredByBreakpointInput = void 0;
    }
    const selectBreakpointBox = this.selectBreakpointBox = this.store.add(new SelectBox(breakpointOptions, selectedIndex, this.contextViewService, defaultSelectBoxStyles, { ariaLabel: nls.localize("selectBreakpoint", "Select breakpoint"), useCustomDrawn: !hasNativeContextMenu(this._configurationService) }));
    this.store.add(selectBreakpointBox.onDidSelect((e) => {
      if (e.index === 0) {
        this.triggeredByBreakpointInput = void 0;
      } else {
        this.triggeredByBreakpointInput = this.availableBreakpoints[e.index - 1];
      }
    }));
    this.selectBreakpointContainer = $(".select-breakpoint-container");
    this.store.add(dom.addDisposableListener(this.selectBreakpointContainer, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Escape)) {
        this.close(false);
      }
    }));
    const selectionWrapper = $(".select-box-container");
    dom.append(this.selectBreakpointContainer, selectionWrapper);
    selectBreakpointBox.render(selectionWrapper);
    dom.append(container, this.selectBreakpointContainer);
    const closeButton = new Button(this.selectBreakpointContainer, defaultButtonStyles);
    closeButton.label = nls.localize("ok", "OK");
    this.store.add(closeButton.onDidClick(() => this.close(true)));
    this.store.add(closeButton);
  }
  buildBreakpointOptions() {
    const breakpointOptions = [
      { text: nls.localize("noTriggerByBreakpoint", "None"), isDisabled: true },
      ...this.availableBreakpoints.map((bp) => ({
        text: `${this.labelService.getUriLabel(bp.uri, { relative: true })}: ${bp.lineNumber}`,
        description: nls.localize("triggerByLoading", "Loading...")
      }))
    ];
    for (const [i, bp] of this.availableBreakpoints.entries()) {
      this.textModelService.createModelReference(bp.uri).then((ref) => {
        try {
          breakpointOptions[i + 1].description = ref.object.textEditorModel.getLineContent(bp.lineNumber).trim();
        } finally {
          ref.dispose();
        }
      }).catch(() => {
        breakpointOptions[i + 1].description = nls.localize("noBpSource", "Could not load source.");
      });
    }
    return breakpointOptions;
  }
  updateTriggerBreakpointList() {
    this.availableBreakpoints = this.debugService.getModel().getBreakpoints().filter((bp) => bp !== this.breakpoint && !bp.logMessage);
    let selectedIndex = 0;
    if (this.triggeredByBreakpointInput) {
      const newIndex = this.availableBreakpoints.findIndex((bp) => bp.getId() === this.triggeredByBreakpointInput?.getId());
      if (newIndex !== -1) {
        selectedIndex = newIndex + 1;
      } else {
        this.triggeredByBreakpointInput = void 0;
      }
    }
    const breakpointOptions = this.buildBreakpointOptions();
    this.selectBreakpointBox.setOptions(breakpointOptions, selectedIndex);
  }
  updateContextInput() {
    if (this.context === Context.TRIGGER_POINT) {
      this.inputContainer.hidden = true;
      this.selectBreakpointContainer.hidden = false;
      if (this.selectBreakpointBox) {
        this.updateTriggerBreakpointList();
      }
    } else {
      this.inputContainer.hidden = false;
      this.selectBreakpointContainer.hidden = true;
      this.setInputMode();
      const value = this.getInputValue(this.breakpoint);
      this.input.getModel().setValue(value);
      this.focusInput();
    }
  }
  _doLayout(heightInPixel, widthInPixel) {
    this.heightInPx = heightInPixel;
    this.input.layout({ height: heightInPixel, width: widthInPixel - 113 });
    this.centerInputVertically();
  }
  _onWidth(widthInPixel) {
    if (typeof this.heightInPx === "number") {
      this._doLayout(this.heightInPx, widthInPixel);
    }
  }
  createBreakpointInput(container) {
    const scopedInstatiationService = this.instantiationService.createChild(new ServiceCollection(
      [IPrivateBreakpointWidgetService, this]
    ));
    this.store.add(scopedInstatiationService);
    const options = this.createEditorOptions();
    const codeEditorWidgetOptions = getSimpleCodeEditorWidgetOptions();
    this.input = scopedInstatiationService.createInstance(CodeEditorWidget, container, options, codeEditorWidgetOptions);
    CONTEXT_IN_BREAKPOINT_WIDGET.bindTo(this.input.contextKeyService).set(true);
    const model = this.modelService.createModel("", null, uri.parse(`${DEBUG_SCHEME}:${this.editor.getId()}:breakpointinput`), true);
    if (this.editor.hasModel()) {
      model.setLanguage(this.editor.getModel().getLanguageId());
    }
    this.input.setModel(model);
    this.setInputMode();
    this.store.add(model);
    const setDecorations = () => {
      const value = this.input.getModel().getValue();
      const decorations = !!value ? [] : createDecorations(this.themeService.getColorTheme(), this.placeholder);
      this.input.setDecorationsByType("breakpoint-widget", DECORATION_KEY, decorations);
    };
    this.store.add(this.input.getModel().onDidChangeContent(() => setDecorations()));
    this.store.add(this.themeService.onDidColorThemeChange(() => setDecorations()));
    this.store.add(this.languageFeaturesService.completionProvider.register({ scheme: DEBUG_SCHEME, hasAccessToAllModels: true }, {
      _debugDisplayName: "breakpointWidget",
      provideCompletionItems: (model2, position, _context, token) => {
        let suggestionsPromise;
        const underlyingModel = this.editor.getModel();
        if (underlyingModel && (this.context === Context.CONDITION || this.context === Context.LOG_MESSAGE && isPositionInCurlyBracketBlock(this.input))) {
          suggestionsPromise = provideSuggestionItems(this.languageFeaturesService.completionProvider, underlyingModel, new Position(this.lineNumber, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(CompletionItemKind.Snippet)), _context, token).then((suggestions) => {
            let overwriteBefore = 0;
            if (this.context === Context.CONDITION) {
              overwriteBefore = position.column - 1;
            } else {
              const value = this.input.getModel().getValue();
              while (position.column - 2 - overwriteBefore >= 0 && value[position.column - 2 - overwriteBefore] !== "{" && value[position.column - 2 - overwriteBefore] !== " ") {
                overwriteBefore++;
              }
            }
            return {
              suggestions: suggestions.items.map((s) => {
                s.completion.range = Range.fromPositions(position.delta(0, -overwriteBefore), position);
                return s.completion;
              })
            };
          });
        } else {
          suggestionsPromise = Promise.resolve({ suggestions: [] });
        }
        return suggestionsPromise;
      }
    }));
    this.store.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.fontSize") || e.affectsConfiguration("editor.lineHeight")) {
        this.input.updateOptions(this.createEditorOptions());
        this.centerInputVertically();
      }
    }));
  }
  createEditorOptions() {
    const editorConfig = this._configurationService.getValue("editor");
    const options = getSimpleEditorOptions(this._configurationService);
    options.fontSize = editorConfig.fontSize;
    options.fontFamily = editorConfig.fontFamily;
    options.lineHeight = editorConfig.lineHeight;
    options.fontLigatures = editorConfig.fontLigatures;
    options.ariaLabel = this.placeholder;
    return options;
  }
  centerInputVertically() {
    if (this.container && typeof this.heightInPx === "number") {
      const lineHeight = this.input.getOption(EditorOption.lineHeight);
      const lineNum = this.input.getModel().getLineCount();
      const newTopMargin = (this.heightInPx - lineNum * lineHeight) / 2;
      this.inputContainer.style.marginTop = newTopMargin + "px";
    }
  }
  close(success) {
    if (success) {
      let condition = void 0;
      let hitCondition = void 0;
      let logMessage = void 0;
      let triggeredBy = void 0;
      let mode = void 0;
      let modeLabel = void 0;
      this.rememberInput();
      if (this.conditionInput || this.context === Context.CONDITION) {
        condition = this.conditionInput;
      }
      if (this.hitCountInput || this.context === Context.HIT_COUNT) {
        hitCondition = this.hitCountInput;
      }
      if (this.logMessageInput || this.context === Context.LOG_MESSAGE) {
        logMessage = this.logMessageInput;
      }
      if (this.selectModeBox) {
        mode = this.modeInput?.mode;
        modeLabel = this.modeInput?.label;
      }
      if (this.context === Context.TRIGGER_POINT) {
        condition = void 0;
        hitCondition = void 0;
        logMessage = void 0;
        triggeredBy = this.triggeredByBreakpointInput?.getId();
      }
      if (this.breakpoint) {
        const data = /* @__PURE__ */ new Map();
        data.set(this.breakpoint.getId(), {
          condition,
          hitCondition,
          logMessage,
          triggeredBy,
          mode,
          modeLabel
        });
        this.debugService.updateBreakpoints(this.breakpoint.originalUri, data, false).then(void 0, onUnexpectedError);
      } else {
        const model = this.editor.getModel();
        if (model) {
          this.debugService.addBreakpoints(model.uri, [{
            lineNumber: this.lineNumber,
            column: this.column,
            enabled: true,
            condition,
            hitCondition,
            logMessage,
            triggeredBy,
            mode,
            modeLabel
          }]);
        }
      }
    }
    this.dispose();
  }
  focusInput() {
    if (this.context === Context.TRIGGER_POINT) {
      this.selectBreakpointBox.focus();
    } else {
      this.input.focus();
    }
  }
  dispose() {
    super.dispose();
    this.input.dispose();
    lifecycle.dispose(this.store);
    setTimeout(() => this.editor.focus(), 0);
  }
};
BreakpointWidget = __decorateClass([
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IDebugService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IModelService),
  __decorateParam(9, ICodeEditorService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, ILanguageFeaturesService),
  __decorateParam(12, IKeybindingService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, ITextModelService),
  __decorateParam(15, IHoverService)
], BreakpointWidget);
const _AcceptBreakpointWidgetInputAction = class _AcceptBreakpointWidgetInputAction extends EditorCommand {
  constructor() {
    super({
      id: _AcceptBreakpointWidgetInputAction.ID,
      precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
      kbOpts: {
        kbExpr: CONTEXT_IN_BREAKPOINT_WIDGET,
        primary: KeyCode.Enter,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  runEditorCommand(accessor, editor) {
    accessor.get(IPrivateBreakpointWidgetService).close(true);
  }
};
_AcceptBreakpointWidgetInputAction.ID = "breakpointWidget.action.acceptInput";
let AcceptBreakpointWidgetInputAction = _AcceptBreakpointWidgetInputAction;
const _CloseBreakpointWidgetCommand = class _CloseBreakpointWidgetCommand extends EditorCommand {
  constructor() {
    super({
      id: _CloseBreakpointWidgetCommand.ID,
      precondition: CONTEXT_BREAKPOINT_WIDGET_VISIBLE,
      kbOpts: {
        kbExpr: EditorContextKeys.textInputFocus,
        primary: KeyCode.Escape,
        secondary: [KeyMod.Shift | KeyCode.Escape],
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  runEditorCommand(accessor, editor, args) {
    const debugContribution = editor.getContribution(BREAKPOINT_EDITOR_CONTRIBUTION_ID);
    if (debugContribution) {
      return debugContribution.closeBreakpointWidget();
    }
    accessor.get(IPrivateBreakpointWidgetService).close(false);
  }
};
_CloseBreakpointWidgetCommand.ID = "closeBreakpointWidget";
let CloseBreakpointWidgetCommand = _CloseBreakpointWidgetCommand;
registerEditorCommand(new AcceptBreakpointWidgetInputAction());
registerEditorCommand(new CloseBreakpointWidgetCommand());
export {
  BreakpointWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxicmVha3BvaW50V2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSVNlbGVjdE9wdGlvbkl0ZW0sIFNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCAqIGFzIGxpZmVjeWNsZSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbW1hbmQsIFNlcnZpY2VzQWNjZXNzb3IsIHJlZ2lzdGVyRWRpdG9yQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvbkl0ZW1LaW5kLCBDb21wbGV0aW9uTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbk9wdGlvbnMsIHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBab25lV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvem9uZVdpZGdldC9icm93c2VyL3pvbmVXaWRnZXQuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGVkaXRvckZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzTmF0aXZlQ29udGV4dE1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBnZXRTaW1wbGVDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucywgZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zaW1wbGVFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEJSRUFLUE9JTlRfRURJVE9SX0NPTlRSSUJVVElPTl9JRCwgQ09OVEVYVF9CUkVBS1BPSU5UX1dJREdFVF9WSVNJQkxFLCBDT05URVhUX0lOX0JSRUFLUE9JTlRfV0lER0VULCBCcmVha3BvaW50V2lkZ2V0Q29udGV4dCBhcyBDb250ZXh0LCBERUJVR19TQ0hFTUUsIElCcmVha3BvaW50LCBJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbiwgSUJyZWFrcG9pbnRVcGRhdGVEYXRhLCBJRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCAnLi9tZWRpYS9icmVha3BvaW50V2lkZ2V0LmNzcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcbmNvbnN0IElQcml2YXRlQnJlYWtwb2ludFdpZGdldFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVByaXZhdGVCcmVha3BvaW50V2lkZ2V0U2VydmljZT4oJ3ByaXZhdGVCcmVha3BvaW50V2lkZ2V0U2VydmljZScpO1xuaW50ZXJmYWNlIElQcml2YXRlQnJlYWtwb2ludFdpZGdldFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGNsb3NlKHN1Y2Nlc3M6IGJvb2xlYW4pOiB2b2lkO1xufVxuY29uc3QgREVDT1JBVElPTl9LRVkgPSAnYnJlYWtwb2ludHdpZGdldGRlY29yYXRpb24nO1xuXG5mdW5jdGlvbiBpc1Bvc2l0aW9uSW5DdXJseUJyYWNrZXRCbG9jayhpbnB1dDogSUFjdGl2ZUNvZGVFZGl0b3IpOiBib29sZWFuIHtcblx0Y29uc3QgbW9kZWwgPSBpbnB1dC5nZXRNb2RlbCgpO1xuXHRjb25zdCBicmFja2V0UGFpcnMgPSBtb2RlbC5icmFja2V0UGFpcnMuZ2V0QnJhY2tldFBhaXJzSW5SYW5nZShSYW5nZS5mcm9tUG9zaXRpb25zKGlucHV0LmdldFBvc2l0aW9uKCkpKTtcblx0cmV0dXJuIGJyYWNrZXRQYWlycy5zb21lKHAgPT4gcC5vcGVuaW5nQnJhY2tldEluZm8uYnJhY2tldFRleHQgPT09ICd7Jyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZURlY29yYXRpb25zKHRoZW1lOiBJQ29sb3JUaGVtZSwgcGxhY2VIb2xkZXI6IHN0cmluZyk6IElEZWNvcmF0aW9uT3B0aW9uc1tdIHtcblx0Y29uc3QgdHJhbnNwYXJlbnRGb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yRm9yZWdyb3VuZCk/LnRyYW5zcGFyZW50KDAuNCk7XG5cdHJldHVybiBbe1xuXHRcdHJhbmdlOiB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDAsXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiAwLFxuXHRcdFx0c3RhcnRDb2x1bW46IDAsXG5cdFx0XHRlbmRDb2x1bW46IDFcblx0XHR9LFxuXHRcdHJlbmRlck9wdGlvbnM6IHtcblx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdGNvbnRlbnRUZXh0OiBwbGFjZUhvbGRlcixcblx0XHRcdFx0Y29sb3I6IHRyYW5zcGFyZW50Rm9yZWdyb3VuZCA/IHRyYW5zcGFyZW50Rm9yZWdyb3VuZC50b1N0cmluZygpIDogdW5kZWZpbmVkXG5cdFx0XHR9XG5cdFx0fVxuXHR9XTtcbn1cblxuZXhwb3J0IGNsYXNzIEJyZWFrcG9pbnRXaWRnZXQgZXh0ZW5kcyBab25lV2lkZ2V0IGltcGxlbWVudHMgSVByaXZhdGVCcmVha3BvaW50V2lkZ2V0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc2VsZWN0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgaW5wdXRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWxlY3RCcmVha3BvaW50Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgaW5wdXQhOiBJQWN0aXZlQ29kZUVkaXRvcjtcblx0cHJpdmF0ZSBzZWxlY3RCcmVha3BvaW50Qm94ITogU2VsZWN0Qm94O1xuXHRwcml2YXRlIHNlbGVjdE1vZGVCb3g/OiBTZWxlY3RCb3g7XG5cdHByaXZhdGUgc3RvcmU6IGxpZmVjeWNsZS5EaXNwb3NhYmxlU3RvcmU7XG5cdHByaXZhdGUgY29uZGl0aW9uSW5wdXQgPSAnJztcblx0cHJpdmF0ZSBoaXRDb3VudElucHV0ID0gJyc7XG5cdHByaXZhdGUgbG9nTWVzc2FnZUlucHV0ID0gJyc7XG5cdHByaXZhdGUgbW9kZUlucHV0PzogRGVidWdQcm90b2NvbC5CcmVha3BvaW50TW9kZTtcblx0cHJpdmF0ZSBicmVha3BvaW50OiBJQnJlYWtwb2ludCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb250ZXh0OiBDb250ZXh0O1xuXHRwcml2YXRlIGhlaWdodEluUHg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0cmlnZ2VyZWRCeUJyZWFrcG9pbnRJbnB1dDogSUJyZWFrcG9pbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXZhaWxhYmxlQnJlYWtwb2ludHM6IElCcmVha3BvaW50W10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihlZGl0b3I6IElDb2RlRWRpdG9yLCBwcml2YXRlIGxpbmVOdW1iZXI6IG51bWJlciwgcHJpdmF0ZSBjb2x1bW46IG51bWJlciB8IHVuZGVmaW5lZCwgY29udGV4dDogQ29udGV4dCB8IHVuZGVmaW5lZCxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASURlYnVnU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCB7IHNob3dGcmFtZTogdHJ1ZSwgc2hvd0Fycm93OiBmYWxzZSwgZnJhbWVXaWR0aDogMSwgaXNBY2Nlc3NpYmxlOiB0cnVlIH0pO1xuXG5cdFx0dGhpcy5zdG9yZSA9IG5ldyBsaWZlY3ljbGUuRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0Y29uc3QgdXJpID0gbW9kZWwudXJpO1xuXHRcdFx0Y29uc3QgYnJlYWtwb2ludHMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRzKHsgbGluZU51bWJlcjogdGhpcy5saW5lTnVtYmVyLCBjb2x1bW46IHRoaXMuY29sdW1uLCB1cmkgfSk7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnQgPSBicmVha3BvaW50cy5sZW5ndGggPyBicmVha3BvaW50c1swXSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoY29udGV4dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAodGhpcy5icmVha3BvaW50ICYmICF0aGlzLmJyZWFrcG9pbnQuY29uZGl0aW9uICYmICF0aGlzLmJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uICYmIHRoaXMuYnJlYWtwb2ludC5sb2dNZXNzYWdlKSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dCA9IENvbnRleHQuTE9HX01FU1NBR0U7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuYnJlYWtwb2ludCAmJiAhdGhpcy5icmVha3BvaW50LmNvbmRpdGlvbiAmJiB0aGlzLmJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uKSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dCA9IENvbnRleHQuSElUX0NPVU5UO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmJyZWFrcG9pbnQgJiYgdGhpcy5icmVha3BvaW50LnRyaWdnZXJlZEJ5KSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dCA9IENvbnRleHQuVFJJR0dFUl9QT0lOVDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dCA9IENvbnRleHQuQ09ORElUSU9OO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdH1cblxuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMuZGVidWdTZXJ2aWNlLmdldE1vZGVsKCkub25EaWRDaGFuZ2VCcmVha3BvaW50cyhlID0+IHtcblx0XHRcdGlmICh0aGlzLmJyZWFrcG9pbnQgJiYgZSAmJiBlLnJlbW92ZWQgJiYgZS5yZW1vdmVkLmluZGV4T2YodGhpcy5icmVha3BvaW50KSA+PSAwKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVXBkYXRlIHRoZSBicmVha3BvaW50IGxpc3Qgd2hlbiBpbiB0cmlnZ2VyIHBvaW50IGNvbnRleHRcblx0XHRcdGlmICh0aGlzLmNvbnRleHQgPT09IENvbnRleHQuVFJJR0dFUl9QT0lOVCAmJiB0aGlzLnNlbGVjdEJyZWFrcG9pbnRCb3gpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVUcmlnZ2VyQnJlYWtwb2ludExpc3QoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5zdG9yZS5hZGQodGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKCdicmVha3BvaW50LXdpZGdldCcsIERFQ09SQVRJT05fS0VZLCB7fSkpO1xuXG5cdFx0dGhpcy5jcmVhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHBsYWNlaG9sZGVyKCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYWNjZXB0U3RyaW5nID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKEFjY2VwdEJyZWFrcG9pbnRXaWRnZXRJbnB1dEFjdGlvbi5JRCk/LmdldExhYmVsKCkgfHwgJ0VudGVyJztcblx0XHRjb25zdCBjbG9zZVN0cmluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhDbG9zZUJyZWFrcG9pbnRXaWRnZXRDb21tYW5kLklEKT8uZ2V0TGFiZWwoKSB8fCAnRXNjYXBlJztcblx0XHRzd2l0Y2ggKHRoaXMuY29udGV4dCkge1xuXHRcdFx0Y2FzZSBDb250ZXh0LkxPR19NRVNTQUdFOlxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdicmVha3BvaW50V2lkZ2V0TG9nTWVzc2FnZVBsYWNlaG9sZGVyJywgXCJNZXNzYWdlIHRvIGxvZyB3aGVuIGJyZWFrcG9pbnQgaXMgaGl0LiBFeHByZXNzaW9ucyB3aXRoaW4ge30gYXJlIGludGVycG9sYXRlZC4gJ3swfScgdG8gYWNjZXB0LCAnezF9JyB0byBjYW5jZWwuXCIsIGFjY2VwdFN0cmluZywgY2xvc2VTdHJpbmcpO1xuXHRcdFx0Y2FzZSBDb250ZXh0LkhJVF9DT1VOVDpcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYnJlYWtwb2ludFdpZGdldEhpdENvdW50UGxhY2Vob2xkZXInLCBcIkJyZWFrIHdoZW4gaGl0IGNvdW50IGNvbmRpdGlvbiBpcyBtZXQuICd7MH0nIHRvIGFjY2VwdCwgJ3sxfScgdG8gY2FuY2VsLlwiLCBhY2NlcHRTdHJpbmcsIGNsb3NlU3RyaW5nKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2JyZWFrcG9pbnRXaWRnZXRFeHByZXNzaW9uUGxhY2Vob2xkZXInLCBcIkJyZWFrIHdoZW4gZXhwcmVzc2lvbiBldmFsdWF0ZXMgdG8gdHJ1ZS4gJ3swfScgdG8gYWNjZXB0LCAnezF9JyB0byBjYW5jZWwuXCIsIGFjY2VwdFN0cmluZywgY2xvc2VTdHJpbmcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5wdXRWYWx1ZShicmVha3BvaW50OiBJQnJlYWtwb2ludCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0aGlzLmNvbnRleHQpIHtcblx0XHRcdGNhc2UgQ29udGV4dC5MT0dfTUVTU0FHRTpcblx0XHRcdFx0cmV0dXJuIGJyZWFrcG9pbnQgJiYgYnJlYWtwb2ludC5sb2dNZXNzYWdlID8gYnJlYWtwb2ludC5sb2dNZXNzYWdlIDogdGhpcy5sb2dNZXNzYWdlSW5wdXQ7XG5cdFx0XHRjYXNlIENvbnRleHQuSElUX0NPVU5UOlxuXHRcdFx0XHRyZXR1cm4gYnJlYWtwb2ludCAmJiBicmVha3BvaW50LmhpdENvbmRpdGlvbiA/IGJyZWFrcG9pbnQuaGl0Q29uZGl0aW9uIDogdGhpcy5oaXRDb3VudElucHV0O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIGJyZWFrcG9pbnQgJiYgYnJlYWtwb2ludC5jb25kaXRpb24gPyBicmVha3BvaW50LmNvbmRpdGlvbiA6IHRoaXMuY29uZGl0aW9uSW5wdXQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW1lbWJlcklucHV0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvbnRleHQgIT09IENvbnRleHQuVFJJR0dFUl9QT0lOVCkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmlucHV0LmdldE1vZGVsKCkuZ2V0VmFsdWUoKTtcblx0XHRcdHN3aXRjaCAodGhpcy5jb250ZXh0KSB7XG5cdFx0XHRcdGNhc2UgQ29udGV4dC5MT0dfTUVTU0FHRTpcblx0XHRcdFx0XHR0aGlzLmxvZ01lc3NhZ2VJbnB1dCA9IHZhbHVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENvbnRleHQuSElUX0NPVU5UOlxuXHRcdFx0XHRcdHRoaXMuaGl0Q291bnRJbnB1dCA9IHZhbHVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRoaXMuY29uZGl0aW9uSW5wdXQgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldElucHV0TW9kZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Ly8gVXNlIHBsYWludGV4dCBsYW5ndWFnZSBmb3IgbG9nIG1lc3NhZ2VzLCBvdGhlcndpc2UgcmVzcGVjdCB1bmRlcmx5aW5nIGVkaXRvciBsYW5ndWFnZSAjMTI1NjE5XG5cdFx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5jb250ZXh0ID09PSBDb250ZXh0LkxPR19NRVNTQUdFID8gUExBSU5URVhUX0xBTkdVQUdFX0lEIDogdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKS5nZXRMYW5ndWFnZUlkKCk7XG5cdFx0XHR0aGlzLmlucHV0LmdldE1vZGVsKCkuc2V0TGFuZ3VhZ2UobGFuZ3VhZ2VJZCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2hvdyhyYW5nZU9yUG9zOiBJUmFuZ2UgfCBJUG9zaXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBsaW5lTnVtID0gdGhpcy5pbnB1dC5nZXRNb2RlbCgpLmdldExpbmVDb3VudCgpO1xuXHRcdHN1cGVyLnNob3cocmFuZ2VPclBvcywgbGluZU51bSArIDEpO1xuXHR9XG5cblx0Zml0SGVpZ2h0VG9Db250ZW50KCk6IHZvaWQge1xuXHRcdGNvbnN0IGxpbmVOdW0gPSB0aGlzLmlucHV0LmdldE1vZGVsKCkuZ2V0TGluZUNvdW50KCk7XG5cdFx0dGhpcy5fcmVsYXlvdXQobGluZU51bSArIDEpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9maWxsQ29udGFpbmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnNldENzc0NsYXNzKCdicmVha3BvaW50LXdpZGdldCcpO1xuXHRcdGNvbnN0IHNlbGVjdEJveCA9IHRoaXMuc3RvcmUuYWRkKG5ldyBTZWxlY3RCb3goW1xuXHRcdFx0eyB0ZXh0OiBubHMubG9jYWxpemUoJ2V4cHJlc3Npb24nLCBcIkV4cHJlc3Npb25cIikgfSxcblx0XHRcdHsgdGV4dDogbmxzLmxvY2FsaXplKCdoaXRDb3VudCcsIFwiSGl0IENvdW50XCIpIH0sXG5cdFx0XHR7IHRleHQ6IG5scy5sb2NhbGl6ZSgnbG9nTWVzc2FnZScsIFwiTG9nIE1lc3NhZ2VcIikgfSxcblx0XHRcdHsgdGV4dDogbmxzLmxvY2FsaXplKCd0cmlnZ2VyZWRCeScsIFwiV2FpdCBmb3IgQnJlYWtwb2ludFwiKSB9LFxuXHRcdF0gc2F0aXNmaWVzIElTZWxlY3RPcHRpb25JdGVtW10sIHRoaXMuY29udGV4dCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsIHsgYXJpYUxhYmVsOiBubHMubG9jYWxpemUoJ2JyZWFrcG9pbnRUeXBlJywgJ0JyZWFrcG9pbnQgVHlwZScpLCB1c2VDdXN0b21EcmF3bjogIWhhc05hdGl2ZUNvbnRleHRNZW51KHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKSB9KSk7XG5cdFx0dGhpcy5zZWxlY3RDb250YWluZXIgPSAkKCcuYnJlYWtwb2ludC1zZWxlY3QtY29udGFpbmVyJyk7XG5cdFx0c2VsZWN0Qm94LnJlbmRlcihkb20uYXBwZW5kKGNvbnRhaW5lciwgdGhpcy5zZWxlY3RDb250YWluZXIpKTtcblx0XHR0aGlzLnN0b3JlLmFkZChzZWxlY3RCb3gub25EaWRTZWxlY3QoZSA9PiB7XG5cdFx0XHR0aGlzLnJlbWVtYmVySW5wdXQoKTtcblx0XHRcdHRoaXMuY29udGV4dCA9IGUuaW5kZXg7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRleHRJbnB1dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuY3JlYXRlTW9kZXNJbnB1dChjb250YWluZXIpO1xuXG5cdFx0dGhpcy5pbnB1dENvbnRhaW5lciA9ICQoJy5pbnB1dENvbnRhaW5lcicpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmlucHV0Q29udGFpbmVyLCB0aGlzLnBsYWNlaG9sZGVyKSk7XG5cdFx0dGhpcy5jcmVhdGVCcmVha3BvaW50SW5wdXQoZG9tLmFwcGVuZChjb250YWluZXIsIHRoaXMuaW5wdXRDb250YWluZXIpKTtcblxuXHRcdHRoaXMuaW5wdXQuZ2V0TW9kZWwoKS5zZXRWYWx1ZSh0aGlzLmdldElucHV0VmFsdWUodGhpcy5icmVha3BvaW50KSk7XG5cdFx0dGhpcy5zdG9yZS5hZGQodGhpcy5pbnB1dC5nZXRNb2RlbCgpLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLmZpdEhlaWdodFRvQ29udGVudCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmlucHV0LnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMSwgY29sdW1uOiB0aGlzLmlucHV0LmdldE1vZGVsKCkuZ2V0TGluZU1heENvbHVtbigxKSB9KTtcblxuXHRcdHRoaXMuY3JlYXRlVHJpZ2dlckJyZWFrcG9pbnRJbnB1dChjb250YWluZXIpO1xuXG5cdFx0dGhpcy51cGRhdGVDb250ZXh0SW5wdXQoKTtcblx0XHQvLyBEdWUgdG8gYW4gZWxlY3Ryb24gYnVnIHdlIGhhdmUgdG8gZG8gdGhlIHRpbWVvdXQsIG90aGVyd2lzZSB3ZSBkbyBub3QgZ2V0IGZvY3VzXG5cdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLmZvY3VzSW5wdXQoKSwgMTUwKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlTW9kZXNJbnB1dChjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29uc3QgbW9kZXMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRNb2Rlcygnc291cmNlJyk7XG5cdFx0aWYgKG1vZGVzLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2IgPSB0aGlzLnNlbGVjdE1vZGVCb3ggPSBuZXcgU2VsZWN0Qm94KFxuXHRcdFx0W1xuXHRcdFx0XHR7IHRleHQ6IG5scy5sb2NhbGl6ZSgnYnBNb2RlJywgJ01vZGUnKSwgaXNEaXNhYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHQuLi5tb2Rlcy5tYXAobW9kZSA9PiAoeyB0ZXh0OiBtb2RlLmxhYmVsLCBkZXNjcmlwdGlvbjogbW9kZS5kZXNjcmlwdGlvbiB9KSksXG5cdFx0XHRdLFxuXHRcdFx0bW9kZXMuZmluZEluZGV4KG0gPT4gbS5tb2RlID09PSB0aGlzLmJyZWFrcG9pbnQ/Lm1vZGUpICsgMSxcblx0XHRcdHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdFx0ZGVmYXVsdFNlbGVjdEJveFN0eWxlcyxcblx0XHRcdHsgdXNlQ3VzdG9tRHJhd246ICFoYXNOYXRpdmVDb250ZXh0TWVudSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkgfVxuXHRcdCk7XG5cdFx0dGhpcy5zdG9yZS5hZGQoc2IpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKHNiLm9uRGlkU2VsZWN0KGUgPT4ge1xuXHRcdFx0dGhpcy5tb2RlSW5wdXQgPSBtb2Rlc1tlLmluZGV4IC0gMV07XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbW9kZVdyYXBwZXIgPSAkKCcuc2VsZWN0LW1vZGUtY29udGFpbmVyJyk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uV3JhcHBlciA9ICQoJy5zZWxlY3QtYm94LWNvbnRhaW5lcicpO1xuXHRcdGRvbS5hcHBlbmQobW9kZVdyYXBwZXIsIHNlbGVjdGlvbldyYXBwZXIpO1xuXHRcdHNiLnJlbmRlcihzZWxlY3Rpb25XcmFwcGVyKTtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgbW9kZVdyYXBwZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUcmlnZ2VyQnJlYWtwb2ludElucHV0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHR0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRCcmVha3BvaW50cygpLmZpbHRlcihicCA9PiBicCAhPT0gdGhpcy5icmVha3BvaW50ICYmICFicC5sb2dNZXNzYWdlKTtcblx0XHRjb25zdCBicmVha3BvaW50T3B0aW9ucyA9IHRoaXMuYnVpbGRCcmVha3BvaW50T3B0aW9ucygpO1xuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzLmZpbmRJbmRleChicCA9PiB0aGlzLmJyZWFrcG9pbnQ/LnRyaWdnZXJlZEJ5ID09PSBicC5nZXRJZCgpKTtcblxuXHRcdGxldCBzZWxlY3RlZEluZGV4ID0gMDtcblxuXHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdHRoaXMudHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQgPSB0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzW2luZGV4XTtcblx0XHRcdHNlbGVjdGVkSW5kZXggPSBpbmRleCArIDE7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5icmVha3BvaW50Py50cmlnZ2VyZWRCeSAmJiB0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMudHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQgPSB0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzWzBdO1xuXHRcdFx0c2VsZWN0ZWRJbmRleCA9IDE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0QnJlYWtwb2ludEJveCA9IHRoaXMuc2VsZWN0QnJlYWtwb2ludEJveCA9IHRoaXMuc3RvcmUuYWRkKG5ldyBTZWxlY3RCb3goYnJlYWtwb2ludE9wdGlvbnMsIHNlbGVjdGVkSW5kZXgsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzLCB7IGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCdzZWxlY3RCcmVha3BvaW50JywgJ1NlbGVjdCBicmVha3BvaW50JyksIHVzZUN1c3RvbURyYXduOiAhaGFzTmF0aXZlQ29udGV4dE1lbnUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpIH0pKTtcblx0XHR0aGlzLnN0b3JlLmFkZChzZWxlY3RCcmVha3BvaW50Qm94Lm9uRGlkU2VsZWN0KGUgPT4ge1xuXHRcdFx0aWYgKGUuaW5kZXggPT09IDApIHtcblx0XHRcdFx0dGhpcy50cmlnZ2VyZWRCeUJyZWFrcG9pbnRJbnB1dCA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQgPSB0aGlzLmF2YWlsYWJsZUJyZWFrcG9pbnRzW2UuaW5kZXggLSAxXTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5zZWxlY3RCcmVha3BvaW50Q29udGFpbmVyID0gJCgnLnNlbGVjdC1icmVha3BvaW50LWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3RCcmVha3BvaW50Q29udGFpbmVyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHRoaXMuY2xvc2UoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbldyYXBwZXIgPSAkKCcuc2VsZWN0LWJveC1jb250YWluZXInKTtcblx0XHRkb20uYXBwZW5kKHRoaXMuc2VsZWN0QnJlYWtwb2ludENvbnRhaW5lciwgc2VsZWN0aW9uV3JhcHBlcik7XG5cdFx0c2VsZWN0QnJlYWtwb2ludEJveC5yZW5kZXIoc2VsZWN0aW9uV3JhcHBlcik7XG5cblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgdGhpcy5zZWxlY3RCcmVha3BvaW50Q29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGNsb3NlQnV0dG9uID0gbmV3IEJ1dHRvbih0aGlzLnNlbGVjdEJyZWFrcG9pbnRDb250YWluZXIsIGRlZmF1bHRCdXR0b25TdHlsZXMpO1xuXHRcdGNsb3NlQnV0dG9uLmxhYmVsID0gbmxzLmxvY2FsaXplKCdvaycsIFwiT0tcIik7XG5cdFx0dGhpcy5zdG9yZS5hZGQoY2xvc2VCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmNsb3NlKHRydWUpKSk7XG5cdFx0dGhpcy5zdG9yZS5hZGQoY2xvc2VCdXR0b24pO1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZEJyZWFrcG9pbnRPcHRpb25zKCk6IElTZWxlY3RPcHRpb25JdGVtW10ge1xuXHRcdGNvbnN0IGJyZWFrcG9pbnRPcHRpb25zOiBJU2VsZWN0T3B0aW9uSXRlbVtdID0gW1xuXHRcdFx0eyB0ZXh0OiBubHMubG9jYWxpemUoJ25vVHJpZ2dlckJ5QnJlYWtwb2ludCcsICdOb25lJyksIGlzRGlzYWJsZWQ6IHRydWUgfSxcblx0XHRcdC4uLnRoaXMuYXZhaWxhYmxlQnJlYWtwb2ludHMubWFwKGJwID0+ICh7XG5cdFx0XHRcdHRleHQ6IGAke3RoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGJwLnVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KX06ICR7YnAubGluZU51bWJlcn1gLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0cmlnZ2VyQnlMb2FkaW5nJywgJ0xvYWRpbmcuLi4nKVxuXHRcdFx0fSkpLFxuXHRcdF07XG5cblx0XHQvLyBMb2FkIHRoZSBzb3VyY2UgY29kZSBmb3IgZWFjaCBicmVha3BvaW50IGFzeW5jaHJvbm91c2x5XG5cdFx0Zm9yIChjb25zdCBbaSwgYnBdIG9mIHRoaXMuYXZhaWxhYmxlQnJlYWtwb2ludHMuZW50cmllcygpKSB7XG5cdFx0XHR0aGlzLnRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoYnAudXJpKS50aGVuKHJlZiA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YnJlYWtwb2ludE9wdGlvbnNbaSArIDFdLmRlc2NyaXB0aW9uID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0TGluZUNvbnRlbnQoYnAubGluZU51bWJlcikudHJpbSgpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pLmNhdGNoKCgpID0+IHtcblx0XHRcdFx0YnJlYWtwb2ludE9wdGlvbnNbaSArIDFdLmRlc2NyaXB0aW9uID0gbmxzLmxvY2FsaXplKCdub0JwU291cmNlJywgJ0NvdWxkIG5vdCBsb2FkIHNvdXJjZS4nKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBicmVha3BvaW50T3B0aW9ucztcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVHJpZ2dlckJyZWFrcG9pbnRMaXN0KCk6IHZvaWQge1xuXHRcdHRoaXMuYXZhaWxhYmxlQnJlYWtwb2ludHMgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRzKCkuZmlsdGVyKGJwID0+IGJwICE9PSB0aGlzLmJyZWFrcG9pbnQgJiYgIWJwLmxvZ01lc3NhZ2UpO1xuXG5cdFx0bGV0IHNlbGVjdGVkSW5kZXggPSAwO1xuXG5cdFx0aWYgKHRoaXMudHJpZ2dlcmVkQnlCcmVha3BvaW50SW5wdXQpIHtcblx0XHRcdGNvbnN0IG5ld0luZGV4ID0gdGhpcy5hdmFpbGFibGVCcmVha3BvaW50cy5maW5kSW5kZXgoYnAgPT4gYnAuZ2V0SWQoKSA9PT0gdGhpcy50cmlnZ2VyZWRCeUJyZWFrcG9pbnRJbnB1dD8uZ2V0SWQoKSk7XG5cdFx0XHRpZiAobmV3SW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdHNlbGVjdGVkSW5kZXggPSBuZXdJbmRleCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJlZEJ5QnJlYWtwb2ludElucHV0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGJyZWFrcG9pbnRPcHRpb25zID0gdGhpcy5idWlsZEJyZWFrcG9pbnRPcHRpb25zKCk7XG5cdFx0dGhpcy5zZWxlY3RCcmVha3BvaW50Qm94LnNldE9wdGlvbnMoYnJlYWtwb2ludE9wdGlvbnMsIHNlbGVjdGVkSW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb250ZXh0SW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMuY29udGV4dCA9PT0gQ29udGV4dC5UUklHR0VSX1BPSU5UKSB7XG5cdFx0XHR0aGlzLmlucHV0Q29udGFpbmVyLmhpZGRlbiA9IHRydWU7XG5cdFx0XHR0aGlzLnNlbGVjdEJyZWFrcG9pbnRDb250YWluZXIuaGlkZGVuID0gZmFsc2U7XG5cdFx0XHQvLyBVcGRhdGUgdGhlIGJyZWFrcG9pbnQgbGlzdCB3aGVuIHN3aXRjaGluZyB0byB0cmlnZ2VyIHBvaW50IGNvbnRleHRcblx0XHRcdGlmICh0aGlzLnNlbGVjdEJyZWFrcG9pbnRCb3gpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVUcmlnZ2VyQnJlYWtwb2ludExpc3QoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dENvbnRhaW5lci5oaWRkZW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuc2VsZWN0QnJlYWtwb2ludENvbnRhaW5lci5oaWRkZW4gPSB0cnVlO1xuXHRcdFx0dGhpcy5zZXRJbnB1dE1vZGUoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5nZXRJbnB1dFZhbHVlKHRoaXMuYnJlYWtwb2ludCk7XG5cdFx0XHR0aGlzLmlucHV0LmdldE1vZGVsKCkuc2V0VmFsdWUodmFsdWUpO1xuXHRcdFx0dGhpcy5mb2N1c0lucHV0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9kb0xheW91dChoZWlnaHRJblBpeGVsOiBudW1iZXIsIHdpZHRoSW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5oZWlnaHRJblB4ID0gaGVpZ2h0SW5QaXhlbDtcblx0XHR0aGlzLmlucHV0LmxheW91dCh7IGhlaWdodDogaGVpZ2h0SW5QaXhlbCwgd2lkdGg6IHdpZHRoSW5QaXhlbCAtIDExMyB9KTtcblx0XHR0aGlzLmNlbnRlcklucHV0VmVydGljYWxseSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vbldpZHRoKHdpZHRoSW5QaXhlbDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLmhlaWdodEluUHggPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLl9kb0xheW91dCh0aGlzLmhlaWdodEluUHgsIHdpZHRoSW5QaXhlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCcmVha3BvaW50SW5wdXQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhdGlhdGlvblNlcnZpY2UgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJUHJpdmF0ZUJyZWFrcG9pbnRXaWRnZXRTZXJ2aWNlLCB0aGlzXVxuXHRcdCkpO1xuXHRcdHRoaXMuc3RvcmUuYWRkKHNjb3BlZEluc3RhdGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuY3JlYXRlRWRpdG9yT3B0aW9ucygpO1xuXHRcdGNvbnN0IGNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0gZ2V0U2ltcGxlQ29kZUVkaXRvcldpZGdldE9wdGlvbnMoKTtcblx0XHR0aGlzLmlucHV0ID0gPElBY3RpdmVDb2RlRWRpdG9yPnNjb3BlZEluc3RhdGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kZUVkaXRvcldpZGdldCwgY29udGFpbmVyLCBvcHRpb25zLCBjb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyk7XG5cblx0XHRDT05URVhUX0lOX0JSRUFLUE9JTlRfV0lER0VULmJpbmRUbyh0aGlzLmlucHV0LmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgdXJpLnBhcnNlKGAke0RFQlVHX1NDSEVNRX06JHt0aGlzLmVkaXRvci5nZXRJZCgpfTpicmVha3BvaW50aW5wdXRgKSwgdHJ1ZSk7XG5cdFx0aWYgKHRoaXMuZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdG1vZGVsLnNldExhbmd1YWdlKHRoaXMuZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dC5zZXRNb2RlbChtb2RlbCk7XG5cdFx0dGhpcy5zZXRJbnB1dE1vZGUoKTtcblx0XHR0aGlzLnN0b3JlLmFkZChtb2RlbCk7XG5cdFx0Y29uc3Qgc2V0RGVjb3JhdGlvbnMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuaW5wdXQuZ2V0TW9kZWwoKS5nZXRWYWx1ZSgpO1xuXHRcdFx0Y29uc3QgZGVjb3JhdGlvbnMgPSAhIXZhbHVlID8gW10gOiBjcmVhdGVEZWNvcmF0aW9ucyh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCksIHRoaXMucGxhY2Vob2xkZXIpO1xuXHRcdFx0dGhpcy5pbnB1dC5zZXREZWNvcmF0aW9uc0J5VHlwZSgnYnJlYWtwb2ludC13aWRnZXQnLCBERUNPUkFUSU9OX0tFWSwgZGVjb3JhdGlvbnMpO1xuXHRcdH07XG5cdFx0dGhpcy5zdG9yZS5hZGQodGhpcy5pbnB1dC5nZXRNb2RlbCgpLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiBzZXREZWNvcmF0aW9ucygpKSk7XG5cdFx0dGhpcy5zdG9yZS5hZGQodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHNldERlY29yYXRpb25zKCkpKTtcblxuXHRcdHRoaXMuc3RvcmUuYWRkKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBERUJVR19TQ0hFTUUsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnYnJlYWtwb2ludFdpZGdldCcsXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPENvbXBsZXRpb25MaXN0PiA9PiB7XG5cdFx0XHRcdGxldCBzdWdnZXN0aW9uc1Byb21pc2U6IFByb21pc2U8Q29tcGxldGlvbkxpc3Q+O1xuXHRcdFx0XHRjb25zdCB1bmRlcmx5aW5nTW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0XHRpZiAodW5kZXJseWluZ01vZGVsICYmICh0aGlzLmNvbnRleHQgPT09IENvbnRleHQuQ09ORElUSU9OIHx8ICh0aGlzLmNvbnRleHQgPT09IENvbnRleHQuTE9HX01FU1NBR0UgJiYgaXNQb3NpdGlvbkluQ3VybHlCcmFja2V0QmxvY2sodGhpcy5pbnB1dCkpKSkge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zUHJvbWlzZSA9IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXModGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIsIHVuZGVybHlpbmdNb2RlbCwgbmV3IFBvc2l0aW9uKHRoaXMubGluZU51bWJlciwgMSksIG5ldyBDb21wbGV0aW9uT3B0aW9ucyh1bmRlZmluZWQsIG5ldyBTZXQ8Q29tcGxldGlvbkl0ZW1LaW5kPigpLmFkZChDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCkpLCBfY29udGV4dCwgdG9rZW4pLnRoZW4oc3VnZ2VzdGlvbnMgPT4ge1xuXG5cdFx0XHRcdFx0XHRsZXQgb3ZlcndyaXRlQmVmb3JlID0gMDtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmNvbnRleHQgPT09IENvbnRleHQuQ09ORElUSU9OKSB7XG5cdFx0XHRcdFx0XHRcdG92ZXJ3cml0ZUJlZm9yZSA9IHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHQvLyBJbnNpZGUgdGhlIGN1cnJseSBicmFja2V0cywgbmVlZCB0byBjb3VudCBob3cgbWFueSB1c2VmdWwgY2hhcmFjdGVycyBhcmUgYmVoaW5kIHRoZSBwb3NpdGlvbiBzbyB0aGV5IHdvdWxkIGFsbCBiZSB0YWtlbiBpbnRvIGFjY291bnRcblx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLmlucHV0LmdldE1vZGVsKCkuZ2V0VmFsdWUoKTtcblx0XHRcdFx0XHRcdFx0d2hpbGUgKChwb3NpdGlvbi5jb2x1bW4gLSAyIC0gb3ZlcndyaXRlQmVmb3JlID49IDApICYmIHZhbHVlW3Bvc2l0aW9uLmNvbHVtbiAtIDIgLSBvdmVyd3JpdGVCZWZvcmVdICE9PSAneycgJiYgdmFsdWVbcG9zaXRpb24uY29sdW1uIC0gMiAtIG92ZXJ3cml0ZUJlZm9yZV0gIT09ICcgJykge1xuXHRcdFx0XHRcdFx0XHRcdG92ZXJ3cml0ZUJlZm9yZSsrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBzdWdnZXN0aW9ucy5pdGVtcy5tYXAocyA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cy5jb21wbGV0aW9uLnJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3NpdGlvbi5kZWx0YSgwLCAtb3ZlcndyaXRlQmVmb3JlKSwgcG9zaXRpb24pO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBzLmNvbXBsZXRpb247XG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSh7IHN1Z2dlc3Rpb25zOiBbXSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzdWdnZXN0aW9uc1Byb21pc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zdG9yZS5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmZvbnRTaXplJykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmxpbmVIZWlnaHQnKSkge1xuXHRcdFx0XHR0aGlzLmlucHV0LnVwZGF0ZU9wdGlvbnModGhpcy5jcmVhdGVFZGl0b3JPcHRpb25zKCkpO1xuXHRcdFx0XHR0aGlzLmNlbnRlcklucHV0VmVydGljYWxseSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRWRpdG9yT3B0aW9ucygpOiBJRWRpdG9yT3B0aW9ucyB7XG5cdFx0Y29uc3QgZWRpdG9yQ29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUVkaXRvck9wdGlvbnM+KCdlZGl0b3InKTtcblx0XHRjb25zdCBvcHRpb25zID0gZ2V0U2ltcGxlRWRpdG9yT3B0aW9ucyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0b3B0aW9ucy5mb250U2l6ZSA9IGVkaXRvckNvbmZpZy5mb250U2l6ZTtcblx0XHRvcHRpb25zLmZvbnRGYW1pbHkgPSBlZGl0b3JDb25maWcuZm9udEZhbWlseTtcblx0XHRvcHRpb25zLmxpbmVIZWlnaHQgPSBlZGl0b3JDb25maWcubGluZUhlaWdodDtcblx0XHRvcHRpb25zLmZvbnRMaWdhdHVyZXMgPSBlZGl0b3JDb25maWcuZm9udExpZ2F0dXJlcztcblx0XHRvcHRpb25zLmFyaWFMYWJlbCA9IHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0cmV0dXJuIG9wdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGNlbnRlcklucHV0VmVydGljYWxseSgpIHtcblx0XHRpZiAodGhpcy5jb250YWluZXIgJiYgdHlwZW9mIHRoaXMuaGVpZ2h0SW5QeCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLmlucHV0LmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cdFx0XHRjb25zdCBsaW5lTnVtID0gdGhpcy5pbnB1dC5nZXRNb2RlbCgpLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbmV3VG9wTWFyZ2luID0gKHRoaXMuaGVpZ2h0SW5QeCAtIGxpbmVOdW0gKiBsaW5lSGVpZ2h0KSAvIDI7XG5cdFx0XHR0aGlzLmlucHV0Q29udGFpbmVyLnN0eWxlLm1hcmdpblRvcCA9IG5ld1RvcE1hcmdpbiArICdweCc7XG5cdFx0fVxuXHR9XG5cblx0Y2xvc2Uoc3VjY2VzczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHQvLyBpZiB0aGVyZSBpcyBhbHJlYWR5IGEgYnJlYWtwb2ludCBvbiB0aGlzIGxvY2F0aW9uIC0gcmVtb3ZlIGl0LlxuXG5cdFx0XHRsZXQgY29uZGl0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgaGl0Q29uZGl0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbG9nTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHRyaWdnZXJlZEJ5OiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbW9kZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGV0IG1vZGVMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHR0aGlzLnJlbWVtYmVySW5wdXQoKTtcblxuXHRcdFx0aWYgKHRoaXMuY29uZGl0aW9uSW5wdXQgfHwgdGhpcy5jb250ZXh0ID09PSBDb250ZXh0LkNPTkRJVElPTikge1xuXHRcdFx0XHRjb25kaXRpb24gPSB0aGlzLmNvbmRpdGlvbklucHV0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuaGl0Q291bnRJbnB1dCB8fCB0aGlzLmNvbnRleHQgPT09IENvbnRleHQuSElUX0NPVU5UKSB7XG5cdFx0XHRcdGhpdENvbmRpdGlvbiA9IHRoaXMuaGl0Q291bnRJbnB1dDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmxvZ01lc3NhZ2VJbnB1dCB8fCB0aGlzLmNvbnRleHQgPT09IENvbnRleHQuTE9HX01FU1NBR0UpIHtcblx0XHRcdFx0bG9nTWVzc2FnZSA9IHRoaXMubG9nTWVzc2FnZUlucHV0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuc2VsZWN0TW9kZUJveCkge1xuXHRcdFx0XHRtb2RlID0gdGhpcy5tb2RlSW5wdXQ/Lm1vZGU7XG5cdFx0XHRcdG1vZGVMYWJlbCA9IHRoaXMubW9kZUlucHV0Py5sYWJlbDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmNvbnRleHQgPT09IENvbnRleHQuVFJJR0dFUl9QT0lOVCkge1xuXHRcdFx0XHQvLyBjdXJyZW50bHksIHRyaWdnZXIgcG9pbnRzIGRvbid0IHN1cHBvcnQgYWRkaXRpb25hbCBjb25kaXRpb25zOlxuXHRcdFx0XHRjb25kaXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGhpdENvbmRpdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0bG9nTWVzc2FnZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJpZ2dlcmVkQnkgPSB0aGlzLnRyaWdnZXJlZEJ5QnJlYWtwb2ludElucHV0Py5nZXRJZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5icmVha3BvaW50KSB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBuZXcgTWFwPHN0cmluZywgSUJyZWFrcG9pbnRVcGRhdGVEYXRhPigpO1xuXHRcdFx0XHRkYXRhLnNldCh0aGlzLmJyZWFrcG9pbnQuZ2V0SWQoKSwge1xuXHRcdFx0XHRcdGNvbmRpdGlvbixcblx0XHRcdFx0XHRoaXRDb25kaXRpb24sXG5cdFx0XHRcdFx0bG9nTWVzc2FnZSxcblx0XHRcdFx0XHR0cmlnZ2VyZWRCeSxcblx0XHRcdFx0XHRtb2RlLFxuXHRcdFx0XHRcdG1vZGVMYWJlbCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLnVwZGF0ZUJyZWFrcG9pbnRzKHRoaXMuYnJlYWtwb2ludC5vcmlnaW5hbFVyaSwgZGF0YSwgZmFsc2UpLnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRcdHRoaXMuZGVidWdTZXJ2aWNlLmFkZEJyZWFrcG9pbnRzKG1vZGVsLnVyaSwgW3tcblx0XHRcdFx0XHRcdGxpbmVOdW1iZXI6IHRoaXMubGluZU51bWJlcixcblx0XHRcdFx0XHRcdGNvbHVtbjogdGhpcy5jb2x1bW4sXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0aGl0Q29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0bG9nTWVzc2FnZSxcblx0XHRcdFx0XHRcdHRyaWdnZXJlZEJ5LFxuXHRcdFx0XHRcdFx0bW9kZSxcblx0XHRcdFx0XHRcdG1vZGVMYWJlbCxcblx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNJbnB1dCgpIHtcblx0XHRpZiAodGhpcy5jb250ZXh0ID09PSBDb250ZXh0LlRSSUdHRVJfUE9JTlQpIHtcblx0XHRcdHRoaXMuc2VsZWN0QnJlYWtwb2ludEJveC5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmlucHV0LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5pbnB1dC5kaXNwb3NlKCk7XG5cdFx0bGlmZWN5Y2xlLmRpc3Bvc2UodGhpcy5zdG9yZSk7XG5cdFx0c2V0VGltZW91dCgoKSA9PiB0aGlzLmVkaXRvci5mb2N1cygpLCAwKTtcblx0fVxufVxuXG5jbGFzcyBBY2NlcHRCcmVha3BvaW50V2lkZ2V0SW5wdXRBY3Rpb24gZXh0ZW5kcyBFZGl0b3JDb21tYW5kIHtcblx0c3RhdGljIElEID0gJ2JyZWFrcG9pbnRXaWRnZXQuYWN0aW9uLmFjY2VwdElucHV0Jztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEFjY2VwdEJyZWFrcG9pbnRXaWRnZXRJbnB1dEFjdGlvbi5JRCxcblx0XHRcdHByZWNvbmRpdGlvbjogQ09OVEVYVF9CUkVBS1BPSU5UX1dJREdFVF9WSVNJQkxFLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogQ09OVEVYVF9JTl9CUkVBS1BPSU5UX1dJREdFVCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5FbnRlcixcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRhY2Nlc3Nvci5nZXQoSVByaXZhdGVCcmVha3BvaW50V2lkZ2V0U2VydmljZSkuY2xvc2UodHJ1ZSk7XG5cdH1cbn1cblxuY2xhc3MgQ2xvc2VCcmVha3BvaW50V2lkZ2V0Q29tbWFuZCBleHRlbmRzIEVkaXRvckNvbW1hbmQge1xuXHRzdGF0aWMgSUQgPSAnY2xvc2VCcmVha3BvaW50V2lkZ2V0Jztcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENsb3NlQnJlYWtwb2ludFdpZGdldENvbW1hbmQuSUQsXG5cdFx0XHRwcmVjb25kaXRpb246IENPTlRFWFRfQlJFQUtQT0lOVF9XSURHRVRfVklTSUJMRSxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLnRleHRJbnB1dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVzY2FwZSxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5Fc2NhcGVdLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IGRlYnVnQ29udHJpYnV0aW9uID0gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJQnJlYWtwb2ludEVkaXRvckNvbnRyaWJ1dGlvbj4oQlJFQUtQT0lOVF9FRElUT1JfQ09OVFJJQlVUSU9OX0lEKTtcblx0XHRpZiAoZGVidWdDb250cmlidXRpb24pIHtcblx0XHRcdC8vIGlmIGZvY3VzIGlzIGluIG91dGVyIGVkaXRvciB3ZSBuZWVkIHRvIHVzZSB0aGUgZGVidWcgY29udHJpYnV0aW9uIHRvIGNsb3NlXG5cdFx0XHRyZXR1cm4gZGVidWdDb250cmlidXRpb24uY2xvc2VCcmVha3BvaW50V2lkZ2V0KCk7XG5cdFx0fVxuXG5cdFx0YWNjZXNzb3IuZ2V0KElQcml2YXRlQnJlYWtwb2ludFdpZGdldFNlcnZpY2UpLmNsb3NlKGZhbHNlKTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckNvbW1hbmQobmV3IEFjY2VwdEJyZWFrcG9pbnRXaWRnZXRJbnB1dEFjdGlvbigpKTtcbnJlZ2lzdGVyRWRpdG9yQ29tbWFuZChuZXcgQ2xvc2VCcmVha3BvaW50V2lkZ2V0Q29tbWFuZCgpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYztBQUN2QixTQUFTLCtCQUErQjtBQUN4QyxTQUE0QixpQkFBaUI7QUFFN0MsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsWUFBWSxlQUFlO0FBQzNCLFNBQVMsT0FBTyxXQUFXO0FBRTNCLFNBQVMsZUFBaUMsNkJBQTZCO0FBQ3ZFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9DO0FBQzdDLFNBQW9CLGdCQUFnQjtBQUNwQyxTQUFpQixhQUFhO0FBRTlCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQTRCLDBCQUEwQztBQUN0RSxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQiw4QkFBOEI7QUFDMUQsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCLHVCQUF1QjtBQUN2RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQiw4QkFBOEI7QUFDNUQsU0FBUyx3QkFBd0I7QUFDakMsU0FBc0IscUJBQXFCO0FBQzNDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMs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
