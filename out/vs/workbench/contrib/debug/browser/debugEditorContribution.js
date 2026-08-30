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
import { addDisposableListener, isKeyboardEvent } from "../../../../base/browser/dom.js";
import { DomEmitter } from "../../../../base/browser/event.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { memoize } from "../../../../base/common/decorators.js";
import { illegalArgument, onUnexpectedExternalError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { visit } from "../../../../base/common/json.js";
import { setProperty } from "../../../../base/common/jsonEdit.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { basename } from "../../../../base/common/path.js";
import * as env from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import { assertType, isDefined } from "../../../../base/common/types.js";
import { Constants } from "../../../../base/common/uint.js";
import { URI } from "../../../../base/common/uri.js";
import { CoreEditingCommands } from "../../../../editor/browser/coreCommands.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { DEFAULT_WORD_REGEXP } from "../../../../editor/common/core/wordHelper.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { StandardTokenType } from "../../../../editor/common/encodedTokenAttributes.js";
import { InjectedTextCursorStops } from "../../../../editor/common/model.js";
import { ILanguageFeatureDebounceService } from "../../../../editor/common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ContentHoverController } from "../../../../editor/contrib/hover/browser/contentHoverController.js";
import { HoverStartMode, HoverStartSource } from "../../../../editor/contrib/hover/browser/hoverOperation.js";
import * as nls from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { DebugHoverWidget, ShowDebugHoverResult } from "./debugHover.js";
import { ExceptionWidget } from "./exceptionWidget.js";
import { CONTEXT_EXCEPTION_WIDGET_VISIBLE, IDebugService, State } from "../common/debug.js";
import { Expression } from "../common/debugModel.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { InsertLineAfterAction } from "../../../../editor/contrib/linesOperations/browser/linesOperations.js";
const MAX_NUM_INLINE_VALUES = 100;
const MAX_INLINE_DECORATOR_LENGTH = 150;
const MAX_TOKENIZATION_LINE_LEN = 500;
const DEAFULT_INLINE_DEBOUNCE_DELAY = 200;
const debugInlineForeground = registerColor("editor.inlineValuesForeground", {
  dark: "#ffffff80",
  light: "#00000080",
  hcDark: "#ffffff80",
  hcLight: "#00000080"
}, nls.localize("editor.inlineValuesForeground", "Color for the debug inline value text."));
const debugInlineBackground = registerColor("editor.inlineValuesBackground", "#ffc80033", nls.localize("editor.inlineValuesBackground", "Color for the debug inline value background."));
class InlineSegment {
  constructor(column, text) {
    this.column = column;
    this.text = text;
  }
}
function formatHoverContent(contentText) {
  if (contentText.includes(",") && contentText.includes("=")) {
    const customSplit = (text) => {
      const splits = [];
      let equalsFound = 0;
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "=") {
          if (equalsFound === 0) {
            equalsFound++;
            continue;
          }
          const commaIndex = text.lastIndexOf(",", i);
          if (commaIndex !== -1 && commaIndex >= start) {
            splits.push(commaIndex);
            start = commaIndex + 1;
          }
          equalsFound++;
        }
      }
      const result = [];
      let s = 0;
      for (const index of splits) {
        result.push(text.substring(s, index).trim());
        s = index + 1;
      }
      if (s < text.length) {
        result.push(text.substring(s).trim());
      }
      return result;
    };
    const pairs = customSplit(contentText);
    const formattedPairs = pairs.map((pair) => {
      const equalsIndex = pair.indexOf("=");
      if (equalsIndex !== -1) {
        const indent = " ".repeat(equalsIndex + 2);
        const [firstLine, ...restLines] = pair.split(/\r?\n/);
        return [firstLine, ...restLines.map((line) => indent + line)].join("\n");
      }
      return pair;
    });
    return new MarkdownString().appendCodeblock("", formattedPairs.join(",\n"));
  }
  return new MarkdownString().appendCodeblock("", contentText);
}
function createInlineValueDecoration(lineNumber, contentText, classNamePrefix, column = Constants.MAX_SAFE_SMALL_INTEGER, viewportMaxCol = MAX_INLINE_DECORATOR_LENGTH) {
  const rawText = contentText;
  if (contentText.length > viewportMaxCol) {
    contentText = contentText.substring(0, viewportMaxCol) + "...";
  }
  return [
    {
      range: {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: column,
        endColumn: column
      },
      options: {
        description: `${classNamePrefix}-inline-value-decoration-spacer`,
        after: {
          content: strings.noBreakWhitespace,
          cursorStops: InjectedTextCursorStops.None
        },
        showIfCollapsed: true
      }
    },
    {
      range: {
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: column,
        endColumn: column
      },
      options: {
        description: `${classNamePrefix}-inline-value-decoration`,
        after: {
          content: replaceWsWithNoBreakWs(contentText),
          inlineClassName: `${classNamePrefix}-inline-value`,
          inlineClassNameAffectsLetterSpacing: true,
          cursorStops: InjectedTextCursorStops.None
        },
        showIfCollapsed: true,
        hoverMessage: formatHoverContent(rawText)
      }
    }
  ];
}
function replaceWsWithNoBreakWs(str) {
  return str.replace(/[ \t\n]/g, strings.noBreakWhitespace);
}
function createInlineValueDecorationsInsideRange(expressions, ranges, model, wordToLineNumbersMap) {
  const nameValueMap = /* @__PURE__ */ new Map();
  for (const expr of expressions) {
    nameValueMap.set(expr.name, expr.value);
    if (nameValueMap.size >= MAX_NUM_INLINE_VALUES) {
      break;
    }
  }
  const lineToNamesMap = /* @__PURE__ */ new Map();
  nameValueMap.forEach((_value, name) => {
    const lineNumbers = wordToLineNumbersMap.get(name);
    if (lineNumbers) {
      for (const lineNumber of lineNumbers) {
        if (ranges.some((r) => lineNumber >= r.startLineNumber && lineNumber <= r.endLineNumber)) {
          if (!lineToNamesMap.has(lineNumber)) {
            lineToNamesMap.set(lineNumber, []);
          }
          if (lineToNamesMap.get(lineNumber).indexOf(name) === -1) {
            lineToNamesMap.get(lineNumber).push(name);
          }
        }
      }
    }
  });
  return [...lineToNamesMap].map(([line, names]) => ({
    line,
    variables: names.sort((first, second) => {
      const content = model.getLineContent(line);
      return content.indexOf(first) - content.indexOf(second);
    }).map((name) => ({ name, value: nameValueMap.get(name) }))
  }));
}
function getWordToLineNumbersMap(model, lineNumber, result) {
  const lineLength = model.getLineLength(lineNumber);
  if (lineLength > MAX_TOKENIZATION_LINE_LEN) {
    return;
  }
  const lineContent = model.getLineContent(lineNumber);
  model.tokenization.forceTokenization(lineNumber);
  const lineTokens = model.tokenization.getLineTokens(lineNumber);
  for (let tokenIndex = 0, tokenCount = lineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
    const tokenType = lineTokens.getStandardTokenType(tokenIndex);
    if (tokenType === StandardTokenType.Other) {
      DEFAULT_WORD_REGEXP.lastIndex = 0;
      const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
      const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);
      const tokenStr = lineContent.substring(tokenStartOffset, tokenEndOffset);
      const wordMatch = DEFAULT_WORD_REGEXP.exec(tokenStr);
      if (wordMatch) {
        const word = wordMatch[0];
        if (!result.has(word)) {
          result.set(word, []);
        }
        result.get(word).push(lineNumber);
      }
    }
  }
}
let DebugEditorContribution = class {
  constructor(editor, debugService, instantiationService, commandService, configurationService, hostService, uriIdentityService, contextKeyService, languageFeaturesService, featureDebounceService, editorService) {
    this.editor = editor;
    this.debugService = debugService;
    this.instantiationService = instantiationService;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.uriIdentityService = uriIdentityService;
    this.languageFeaturesService = languageFeaturesService;
    this.editorService = editorService;
    this.mouseDown = false;
    this.gutterIsHovered = false;
    this.altListener = new MutableDisposable();
    this.altPressed = false;
    this.displayedStore = new DisposableStore();
    this.allowScrollToExceptionWidget = true;
    this.shouldScrollToExceptionWidget = () => this.allowScrollToExceptionWidget;
    // Holds a Disposable that prevents the default editor hover behavior while it exists.
    this.defaultHoverLockout = new MutableDisposable();
    this.oldDecorations = this.editor.createDecorationsCollection();
    this.debounceInfo = featureDebounceService.for(languageFeaturesService.inlineValuesProvider, "InlineValues", { min: DEAFULT_INLINE_DEBOUNCE_DELAY });
    this.hoverWidget = this.instantiationService.createInstance(DebugHoverWidget, this.editor);
    this.toDispose = [this.defaultHoverLockout, this.altListener, this.displayedStore];
    this.registerListeners();
    this.exceptionWidgetVisible = CONTEXT_EXCEPTION_WIDGET_VISIBLE.bindTo(contextKeyService);
    this.toggleExceptionWidget();
  }
  registerListeners() {
    this.toDispose.push(this.debugService.getViewModel().onDidFocusStackFrame((e) => this.onFocusStackFrame(e.stackFrame)));
    this.toDispose.push(this.editor.onMouseDown((e) => this.onEditorMouseDown(e)));
    this.toDispose.push(this.editor.onMouseUp(() => this.mouseDown = false));
    this.toDispose.push(this.editor.onMouseMove((e) => this.onEditorMouseMove(e)));
    this.toDispose.push(this.editor.onMouseLeave((e) => {
      const hoverDomNode = this.hoverWidget.getDomNode();
      if (!hoverDomNode) {
        return;
      }
      const rect = hoverDomNode.getBoundingClientRect();
      if (e.event.posx < rect.left || e.event.posx > rect.right || e.event.posy < rect.top || e.event.posy > rect.bottom) {
        this.hideHoverWidget();
      }
    }));
    this.toDispose.push(this.editor.onKeyDown((e) => this.onKeyDown(e)));
    this.toDispose.push(this.editor.onDidChangeModelContent(() => {
      this._wordToLineNumbersMap = void 0;
      this.updateInlineValuesScheduler.schedule();
    }));
    this.toDispose.push(this.debugService.getViewModel().onWillUpdateViews(() => this.updateInlineValuesScheduler.schedule()));
    this.toDispose.push(this.debugService.getViewModel().onDidEvaluateLazyExpression(() => this.updateInlineValuesScheduler.schedule()));
    this.toDispose.push(this.editor.onDidChangeModel(async () => {
      this.addDocumentListeners();
      this.toggleExceptionWidget();
      this.hideHoverWidget();
      this._wordToLineNumbersMap = void 0;
      const stackFrame = this.debugService.getViewModel().focusedStackFrame;
      await this.updateInlineValueDecorations(stackFrame);
    }));
    this.toDispose.push(this.editor.onDidScrollChange(() => {
      this.hideHoverWidget();
      const model = this.editor.getModel();
      if (model && this.languageFeaturesService.inlineValuesProvider.has(model)) {
        this.updateInlineValuesScheduler.schedule();
      }
    }));
    this.toDispose.push(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("editor.hover")) {
        this.updateHoverConfiguration();
      }
    }));
    this.toDispose.push(this.debugService.onDidChangeState((state) => {
      if (state !== State.Stopped) {
        this.toggleExceptionWidget();
      }
    }));
    this.updateHoverConfiguration();
  }
  updateHoverConfiguration() {
    const model = this.editor.getModel();
    if (model) {
      this.editorHoverOptions = this.configurationService.getValue("editor.hover", {
        resource: model.uri,
        overrideIdentifier: model.getLanguageId()
      });
    }
  }
  addDocumentListeners() {
    const stackFrame = this.debugService.getViewModel().focusedStackFrame;
    const model = this.editor.getModel();
    if (model) {
      this.applyDocumentListeners(model, stackFrame);
    }
  }
  applyDocumentListeners(model, stackFrame) {
    if (!stackFrame || !this.uriIdentityService.extUri.isEqual(model.uri, stackFrame.source.uri)) {
      this.altListener.clear();
      return;
    }
    const ownerDocument = this.editor.getContainerDomNode().ownerDocument;
    this.altListener.value = addDisposableListener(ownerDocument, "keydown", (keydownEvent) => {
      const standardKeyboardEvent = new StandardKeyboardEvent(keydownEvent);
      if (standardKeyboardEvent.keyCode === KeyCode.Alt) {
        this.altPressed = true;
        const debugHoverWasVisible = this.hoverWidget.isVisible();
        this.hoverWidget.hide();
        this.defaultHoverLockout.clear();
        if (debugHoverWasVisible && this.hoverPosition) {
          this.showEditorHover(this.hoverPosition.position, false);
        }
        const onKeyUp = new DomEmitter(ownerDocument, "keyup");
        const listener = Event.any(this.hostService.onDidChangeFocus, onKeyUp.event)((keyupEvent) => {
          let standardKeyboardEvent2 = void 0;
          if (isKeyboardEvent(keyupEvent)) {
            standardKeyboardEvent2 = new StandardKeyboardEvent(keyupEvent);
          }
          if (!standardKeyboardEvent2 || standardKeyboardEvent2.keyCode === KeyCode.Alt) {
            this.altPressed = false;
            this.preventDefaultEditorHover();
            listener.dispose();
            onKeyUp.dispose();
          }
        });
      }
    });
  }
  async showHover(position, focus, mouseEvent) {
    this.preventDefaultEditorHover();
    const sf = this.debugService.getViewModel().focusedStackFrame;
    const model = this.editor.getModel();
    if (sf && model && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
      const result = await this.hoverWidget.showAt(position, focus, mouseEvent);
      if (result === ShowDebugHoverResult.NOT_AVAILABLE) {
        this.showEditorHover(position, focus);
      }
    } else {
      this.showEditorHover(position, focus);
    }
  }
  preventDefaultEditorHover() {
    if (this.defaultHoverLockout.value || this.editorHoverOptions?.enabled === "off") {
      return;
    }
    const hoverController = this.editor.getContribution(ContentHoverController.ID);
    hoverController?.hideContentHover();
    this.editor.updateOptions({ hover: { enabled: "off" } });
    this.defaultHoverLockout.value = {
      dispose: () => {
        this.editor.updateOptions({
          hover: { enabled: this.editorHoverOptions?.enabled ?? "on" }
        });
      }
    };
  }
  showEditorHover(position, focus) {
    const hoverController = this.editor.getContribution(ContentHoverController.ID);
    const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
    this.defaultHoverLockout.clear();
    hoverController?.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Mouse, focus);
  }
  async onFocusStackFrame(sf) {
    const model = this.editor.getModel();
    if (model) {
      this.applyDocumentListeners(model, sf);
      if (sf && this.uriIdentityService.extUri.isEqual(sf.source.uri, model.uri)) {
        await this.toggleExceptionWidget();
      } else {
        this.hideHoverWidget();
      }
    }
    await this.updateInlineValueDecorations(sf);
  }
  get hoverDelay() {
    const baseDelay = this.editorHoverOptions?.delay || 0;
    const delayFactor = clamp(2 - (baseDelay - 300) / 600, 1, 2);
    return baseDelay * delayFactor;
  }
  get showHoverScheduler() {
    const scheduler = new RunOnceScheduler(() => {
      if (this.hoverPosition && !this.altPressed) {
        this.showHover(this.hoverPosition.position, false, this.hoverPosition.event);
      }
    }, this.hoverDelay);
    this.toDispose.push(scheduler);
    return scheduler;
  }
  hideHoverWidget() {
    if (this.hoverWidget.willBeVisible()) {
      this.hoverWidget.hide();
    }
    this.showHoverScheduler.cancel();
    this.defaultHoverLockout.clear();
  }
  // hover business
  onEditorMouseDown(mouseEvent) {
    this.mouseDown = true;
    if (mouseEvent.target.type === MouseTargetType.CONTENT_WIDGET && mouseEvent.target.detail === DebugHoverWidget.ID) {
      return;
    }
    this.hideHoverWidget();
  }
  onEditorMouseMove(mouseEvent) {
    if (this.debugService.state !== State.Stopped) {
      return;
    }
    const target = mouseEvent.target;
    const stopKey = env.isMacintosh ? "metaKey" : "ctrlKey";
    if (!this.altPressed) {
      if (target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
        this.defaultHoverLockout.clear();
        this.gutterIsHovered = true;
      } else if (this.gutterIsHovered) {
        this.gutterIsHovered = false;
        this.updateHoverConfiguration();
      }
    }
    if (target.type === MouseTargetType.CONTENT_WIDGET && target.detail === DebugHoverWidget.ID || this.hoverWidget.isInSafeTriangle(mouseEvent.event.posx, mouseEvent.event.posy)) {
      const sticky = this.editorHoverOptions?.sticky ?? true;
      if (sticky || this.hoverWidget.isShowingComplexValue || mouseEvent.event[stopKey]) {
        return;
      }
    }
    if (target.type === MouseTargetType.CONTENT_TEXT) {
      if (target.position && !Position.equals(target.position, this.hoverPosition?.position || null) && !this.hoverWidget.isInSafeTriangle(mouseEvent.event.posx, mouseEvent.event.posy)) {
        this.hoverPosition = { position: target.position, event: mouseEvent.event };
        this.preventDefaultEditorHover();
        this.showHoverScheduler.schedule(this.hoverDelay);
      }
    } else if (!this.mouseDown) {
      this.hideHoverWidget();
    }
  }
  onKeyDown(e) {
    const stopKey = env.isMacintosh ? KeyCode.Meta : KeyCode.Ctrl;
    if (e.keyCode !== stopKey && e.keyCode !== KeyCode.Alt) {
      this.hideHoverWidget();
    }
  }
  // end hover business
  // exception widget
  async toggleExceptionWidget() {
    const model = this.editor.getModel();
    const focusedSf = this.debugService.getViewModel().focusedStackFrame;
    const callStack = focusedSf ? focusedSf.thread.getCallStack() : null;
    if (!model || !focusedSf || !callStack || callStack.length === 0) {
      this.closeExceptionWidget();
      return;
    }
    const exceptionSf = callStack.find((sf) => !!(sf && sf.source && sf.source.available && sf.source.presentationHint !== "deemphasize"));
    if (!exceptionSf || exceptionSf !== focusedSf) {
      this.closeExceptionWidget();
      return;
    }
    const sameUri = this.uriIdentityService.extUri.isEqual(exceptionSf.source.uri, model.uri);
    if (this.exceptionWidget && !sameUri) {
      this.closeExceptionWidget();
    } else if (sameUri) {
      const activeControl = this.editorService.activeTextEditorControl;
      const isActiveEditor = activeControl === this.editor;
      const exceptionInfo = await focusedSf.thread.exceptionInfo;
      if (exceptionInfo) {
        if (isActiveEditor) {
          this.showExceptionWidget(exceptionInfo, this.debugService.getViewModel().focusedSession, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
        } else {
          this.showExceptionWidgetWithoutScroll(exceptionInfo, this.debugService.getViewModel().focusedSession, exceptionSf.range.startLineNumber, exceptionSf.range.startColumn);
        }
      }
    }
  }
  showExceptionWidget(exceptionInfo, debugSession, lineNumber, column) {
    if (this.exceptionWidget) {
      this.exceptionWidget.dispose();
    }
    this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
    this.exceptionWidget.show({ lineNumber, column }, 0);
    this.exceptionWidget.focus();
    this.editor.revealRangeInCenter({
      startLineNumber: lineNumber,
      startColumn: column,
      endLineNumber: lineNumber,
      endColumn: column
    });
    this.exceptionWidgetVisible.set(true);
  }
  showExceptionWidgetWithoutScroll(exceptionInfo, debugSession, lineNumber, column) {
    if (this.exceptionWidget) {
      this.exceptionWidget.dispose();
    }
    this.allowScrollToExceptionWidget = false;
    const currentScrollTop = this.editor.getScrollTop();
    const visibleRanges = this.editor.getVisibleRanges();
    if (visibleRanges.length === 0) {
      this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
      this.exceptionWidget.show({ lineNumber, column }, 0);
      this.exceptionWidgetVisible.set(true);
      this.allowScrollToExceptionWidget = true;
      return;
    }
    const firstVisibleLine = visibleRanges[0].startLineNumber;
    this.exceptionWidget = this.instantiationService.createInstance(ExceptionWidget, this.editor, exceptionInfo, debugSession, this.shouldScrollToExceptionWidget);
    this.exceptionWidget.show({ lineNumber, column }, 0);
    this.exceptionWidgetVisible.set(true);
    if (lineNumber < firstVisibleLine) {
      const scrollAdjustment = this.exceptionWidget.getWhitespaceHeight();
      this.editor.setScrollTop(currentScrollTop + scrollAdjustment, ScrollType.Immediate);
    }
    this.allowScrollToExceptionWidget = true;
  }
  closeExceptionWidget() {
    if (this.exceptionWidget) {
      const shouldFocusEditor = this.exceptionWidget.hasFocus();
      this.exceptionWidget.dispose();
      this.exceptionWidget = void 0;
      this.exceptionWidgetVisible.set(false);
      if (shouldFocusEditor) {
        this.editor.focus();
      }
    }
  }
  async addLaunchConfiguration() {
    const model = this.editor.getModel();
    if (!model) {
      return;
    }
    let configurationsArrayPosition;
    let lastProperty;
    const getConfigurationPosition = () => {
      let depthInArray = 0;
      visit(model.getValue(), {
        onObjectProperty: (property) => {
          lastProperty = property;
        },
        onArrayBegin: (offset) => {
          if (lastProperty === "configurations" && depthInArray === 0) {
            configurationsArrayPosition = model.getPositionAt(offset + 1);
          }
          depthInArray++;
        },
        onArrayEnd: () => {
          depthInArray--;
        }
      });
    };
    getConfigurationPosition();
    if (!configurationsArrayPosition) {
      const { tabSize, insertSpaces } = model.getOptions();
      const eol = model.getEOL();
      const edit = basename(model.uri.fsPath) === "launch.json" ? setProperty(model.getValue(), ["configurations"], [], { tabSize, insertSpaces, eol })[0] : setProperty(model.getValue(), ["launch"], { "configurations": [] }, { tabSize, insertSpaces, eol })[0];
      const startPosition = model.getPositionAt(edit.offset);
      const lineNumber = startPosition.lineNumber;
      const range = new Range(lineNumber, startPosition.column, lineNumber, model.getLineMaxColumn(lineNumber));
      model.pushEditOperations(null, [EditOperation.replace(range, edit.content)], () => null);
      getConfigurationPosition();
    }
    if (!configurationsArrayPosition) {
      return;
    }
    this.editor.focus();
    const insertLine = (position) => {
      if (model.getLineLastNonWhitespaceColumn(position.lineNumber) > position.column) {
        this.editor.setPosition(position);
        this.instantiationService.invokeFunction((accessor) => {
          CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, this.editor, null);
        });
      }
      this.editor.setPosition(position);
      return this.commandService.executeCommand(InsertLineAfterAction.ID);
    };
    await insertLine(configurationsArrayPosition);
    await this.commandService.executeCommand("editor.action.triggerSuggest");
  }
  get removeInlineValuesScheduler() {
    return new RunOnceScheduler(
      () => {
        this.displayedStore.clear();
        this.oldDecorations.clear();
      },
      100
    );
  }
  get updateInlineValuesScheduler() {
    const model = this.editor.getModel();
    return new RunOnceScheduler(
      async () => await this.updateInlineValueDecorations(this.debugService.getViewModel().focusedStackFrame),
      model ? this.debounceInfo.get(model) : DEAFULT_INLINE_DEBOUNCE_DELAY
    );
  }
  async updateInlineValueDecorations(stackFrame) {
    const var_value_format = "{0} = {1}";
    const separator = ", ";
    const model = this.editor.getModel();
    const inlineValuesSetting = this.configurationService.getValue("debug").inlineValues;
    const inlineValuesTurnedOn = inlineValuesSetting === true || inlineValuesSetting === "on" || inlineValuesSetting === "auto" && model && this.languageFeaturesService.inlineValuesProvider.has(model);
    if (!inlineValuesTurnedOn || !model || !stackFrame || model.uri.toString() !== stackFrame.source.uri.toString()) {
      if (!this.removeInlineValuesScheduler.isScheduled()) {
        this.removeInlineValuesScheduler.schedule();
      }
      return;
    }
    this.removeInlineValuesScheduler.cancel();
    this.displayedStore.clear();
    const viewRanges = this.editor.getVisibleRangesPlusViewportAboveBelow();
    let allDecorations;
    const cts = new CancellationTokenSource();
    this.displayedStore.add(toDisposable(() => cts.dispose(true)));
    if (this.languageFeaturesService.inlineValuesProvider.has(model)) {
      const findVariable = async (_key, caseSensitiveLookup) => {
        const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range);
        const key = caseSensitiveLookup ? _key : _key.toLowerCase();
        for (const scope of scopes) {
          const variables = await scope.getChildren();
          const found = variables.find((v) => caseSensitiveLookup ? v.name === key : v.name.toLowerCase() === key);
          if (found) {
            return found.value;
          }
        }
        return void 0;
      };
      const ctx = {
        frameId: stackFrame.frameId,
        stoppedLocation: new Range(stackFrame.range.startLineNumber, stackFrame.range.startColumn + 1, stackFrame.range.endLineNumber, stackFrame.range.endColumn + 1)
      };
      const providers = this.languageFeaturesService.inlineValuesProvider.ordered(model).reverse();
      allDecorations = [];
      const lineDecorations = /* @__PURE__ */ new Map();
      const promises = providers.flatMap((provider) => viewRanges.map((range) => Promise.resolve(provider.provideInlineValues(model, range, ctx, cts.token)).then(async (result) => {
        if (result) {
          for (const iv of result) {
            let text = void 0;
            switch (iv.type) {
              case "text":
                text = iv.text;
                break;
              case "variable": {
                let va = iv.variableName;
                if (!va) {
                  const lineContent = model.getLineContent(iv.range.startLineNumber);
                  va = lineContent.substring(iv.range.startColumn - 1, iv.range.endColumn - 1);
                }
                const value = await findVariable(va, iv.caseSensitiveLookup);
                if (value) {
                  text = strings.format(var_value_format, va, value);
                }
                break;
              }
              case "expression": {
                let expr = iv.expression;
                if (!expr) {
                  const lineContent = model.getLineContent(iv.range.startLineNumber);
                  expr = lineContent.substring(iv.range.startColumn - 1, iv.range.endColumn - 1);
                }
                if (expr) {
                  const expression = new Expression(expr);
                  await expression.evaluate(stackFrame.thread.session, stackFrame, "watch", true);
                  if (expression.available) {
                    text = strings.format(var_value_format, expr, expression.value);
                  }
                }
                break;
              }
            }
            if (text) {
              const line = iv.range.startLineNumber;
              let lineSegments = lineDecorations.get(line);
              if (!lineSegments) {
                lineSegments = [];
                lineDecorations.set(line, lineSegments);
              }
              if (!lineSegments.some((iv2) => iv2.text === text)) {
                lineSegments.push(new InlineSegment(iv.range.startColumn, text));
              }
            }
          }
        }
      }, (err) => {
        onUnexpectedExternalError(err);
      })));
      const startTime = Date.now();
      await Promise.all(promises);
      this.updateInlineValuesScheduler.delay = this.debounceInfo.update(model, Date.now() - startTime);
      lineDecorations.forEach((segments, line) => {
        if (segments.length > 0) {
          segments = segments.sort((a, b) => a.column - b.column);
          const text = segments.map((s) => s.text).join(separator);
          const editorWidth = this.editor.getLayoutInfo().width;
          const fontInfo = this.editor.getOption(EditorOption.fontInfo);
          const viewportMaxCol = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
          allDecorations.push(...createInlineValueDecoration(line, text, "debug", void 0, viewportMaxCol));
        }
      });
    } else {
      const scopes = await stackFrame.getMostSpecificScopes(stackFrame.range);
      const scopesWithVariables = await Promise.all(scopes.map(async (scope) => ({ scope, variables: await scope.getChildren() })));
      const valuesPerLine = /* @__PURE__ */ new Map();
      for (const { scope, variables } of scopesWithVariables) {
        let scopeRange = new Range(0, 0, stackFrame.range.startLineNumber, stackFrame.range.startColumn);
        if (scope.range) {
          scopeRange = scopeRange.setStartPosition(scope.range.startLineNumber, scope.range.startColumn);
        }
        const ownRanges = viewRanges.map((r) => r.intersectRanges(scopeRange)).filter(isDefined);
        this._wordToLineNumbersMap ??= new WordsToLineNumbersCache(model);
        for (const range of ownRanges) {
          this._wordToLineNumbersMap.ensureRangePopulated(range);
        }
        const mapped = createInlineValueDecorationsInsideRange(variables, ownRanges, model, this._wordToLineNumbersMap.value);
        for (const { line, variables: variables2 } of mapped) {
          let values = valuesPerLine.get(line);
          if (!values) {
            values = /* @__PURE__ */ new Map();
            valuesPerLine.set(line, values);
          }
          for (const { name, value } of variables2) {
            if (!values.has(name)) {
              values.set(name, value);
            }
          }
        }
      }
      allDecorations = [...valuesPerLine.entries()].flatMap(([line, values]) => {
        const text = [...values].map(([n, v]) => `${n} = ${v}`).join(", ");
        const editorWidth = this.editor.getLayoutInfo().width;
        const fontInfo = this.editor.getOption(EditorOption.fontInfo);
        const viewportMaxCol = Math.floor((editorWidth - 50) / fontInfo.typicalHalfwidthCharacterWidth);
        return createInlineValueDecoration(line, text, "debug", void 0, viewportMaxCol);
      });
    }
    if (cts.token.isCancellationRequested) {
      return;
    }
    let preservePosition;
    if (this.editor.getOption(EditorOption.wordWrap) !== "off") {
      const position = this.editor.getPosition();
      if (position && this.editor.getVisibleRanges().some((r) => r.containsPosition(position))) {
        preservePosition = { position, top: this.editor.getTopForPosition(position.lineNumber, position.column) };
      }
    }
    this.oldDecorations.set(allDecorations);
    if (preservePosition) {
      const top = this.editor.getTopForPosition(preservePosition.position.lineNumber, preservePosition.position.column);
      this.editor.setScrollTop(this.editor.getScrollTop() - (preservePosition.top - top), ScrollType.Immediate);
    }
  }
  dispose() {
    this.hoverWidget?.dispose();
    this.configurationWidget?.dispose();
    this.exceptionWidget?.dispose();
    this.toDispose = dispose(this.toDispose);
  }
};
__decorateClass([
  memoize
], DebugEditorContribution.prototype, "showHoverScheduler", 1);
__decorateClass([
  memoize
], DebugEditorContribution.prototype, "removeInlineValuesScheduler", 1);
__decorateClass([
  memoize
], DebugEditorContribution.prototype, "updateInlineValuesScheduler", 1);
DebugEditorContribution = __decorateClass([
  __decorateParam(1, IDebugService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IHostService),
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, ILanguageFeaturesService),
  __decorateParam(9, ILanguageFeatureDebounceService),
  __decorateParam(10, IEditorService)
], DebugEditorContribution);
class WordsToLineNumbersCache {
  constructor(model) {
    this.model = model;
    this.value = /* @__PURE__ */ new Map();
    this.intervals = new Uint8Array(Math.ceil(model.getLineCount() / 8));
  }
  /** Ensures that variables names in the given range have been identified. */
  ensureRangePopulated(range) {
    for (let lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
      const bin = lineNumber >> 3;
      const bit = 1 << (lineNumber & 7);
      if (!(this.intervals[bin] & bit)) {
        getWordToLineNumbersMap(this.model, lineNumber, this.value);
        this.intervals[bin] |= bit;
      }
    }
  }
}
CommandsRegistry.registerCommand(
  "_executeInlineValueProvider",
  async (accessor, uri, iRange, context) => {
    assertType(URI.isUri(uri));
    assertType(Range.isIRange(iRange));
    if (!context || typeof context.frameId !== "number" || !Range.isIRange(context.stoppedLocation)) {
      throw illegalArgument("context");
    }
    const model = accessor.get(IModelService).getModel(uri);
    if (!model) {
      throw illegalArgument("uri");
    }
    const range = Range.lift(iRange);
    const { inlineValuesProvider } = accessor.get(ILanguageFeaturesService);
    const providers = inlineValuesProvider.ordered(model);
    const providerResults = await Promise.all(providers.map((provider) => provider.provideInlineValues(model, range, context, CancellationToken.None)));
    return providerResults.flat().filter(isDefined);
  }
);
export {
  DebugEditorContribution,
  createInlineValueDecoration,
  debugInlineBackground,
  debugInlineForeground,
  formatHoverContent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0VkaXRvckNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgaXNLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2V2ZW50LmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50LCBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgaWxsZWdhbEFyZ3VtZW50LCBvblVuZXhwZWN0ZWRFeHRlcm5hbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdmlzaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IHNldFByb3BlcnR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbkVkaXQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCBkaXNwb3NlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgKiBhcyBlbnYgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUsIGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENvbnN0YW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvcmVFZGl0aW5nQ29tbWFuZHMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElFZGl0b3JNb3VzZUV2ZW50LCBJUGFydGlhbEVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBJRWRpdG9ySG92ZXJPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX1dPUkRfUkVHRVhQIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3dvcmRIZWxwZXIuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiwgU2Nyb2xsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElubGluZVZhbHVlLCBJbmxpbmVWYWx1ZUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIEluamVjdGVkVGV4dEN1cnNvclN0b3BzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24sIElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZURlYm91bmNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9jb250ZW50SG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEhvdmVyU3RhcnRNb2RlLCBIb3ZlclN0YXJ0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaG92ZXIvYnJvd3Nlci9ob3Zlck9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnksIElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgRmxvYXRpbmdFZGl0b3JDbGlja1dpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29kZWVkaXRvci5qcyc7XG5pbXBvcnQgeyBEZWJ1Z0hvdmVyV2lkZ2V0LCBTaG93RGVidWdIb3ZlclJlc3VsdCB9IGZyb20gJy4vZGVidWdIb3Zlci5qcyc7XG5pbXBvcnQgeyBFeGNlcHRpb25XaWRnZXQgfSBmcm9tICcuL2V4Y2VwdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0VYQ0VQVElPTl9XSURHRVRfVklTSUJMRSwgSURlYnVnQ29uZmlndXJhdGlvbiwgSURlYnVnRWRpdG9yQ29udHJpYnV0aW9uLCBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBJRXhjZXB0aW9uSW5mbywgSUV4cHJlc3Npb24sIElTdGFja0ZyYW1lLCBTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBFeHByZXNzaW9uIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJbnNlcnRMaW5lQWZ0ZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9saW5lc09wZXJhdGlvbnMvYnJvd3Nlci9saW5lc09wZXJhdGlvbnMuanMnO1xuXG5jb25zdCBNQVhfTlVNX0lOTElORV9WQUxVRVMgPSAxMDA7IC8vIEpTIEdsb2JhbCBzY29wZSBjYW4gaGF2ZSA3MDArIGVudHJpZXMuIFdlIHdhbnQgdG8gbGltaXQgb3Vyc2VsdmVzIGZvciBwZXJmIHJlYXNvbnNcbmNvbnN0IE1BWF9JTkxJTkVfREVDT1JBVE9SX0xFTkdUSCA9IDE1MDsgLy8gTWF4IHN0cmluZyBsZW5ndGggb2YgZWFjaCBpbmxpbmUgZGVjb3JhdG9yIHdoZW4gZGVidWdnaW5nLiBJZiBleGNlZWRlZCAuLi4gaXMgYWRkZWRcbmNvbnN0IE1BWF9UT0tFTklaQVRJT05fTElORV9MRU4gPSA1MDA7IC8vIElmIGxpbmUgaXMgdG9vIGxvbmcsIHRoZW4gaW5saW5lIHZhbHVlcyBmb3IgdGhlIGxpbmUgYXJlIHNraXBwZWRcblxuY29uc3QgREVBRlVMVF9JTkxJTkVfREVCT1VOQ0VfREVMQVkgPSAyMDA7XG5cbmV4cG9ydCBjb25zdCBkZWJ1Z0lubGluZUZvcmVncm91bmQgPSByZWdpc3RlckNvbG9yKCdlZGl0b3IuaW5saW5lVmFsdWVzRm9yZWdyb3VuZCcsIHtcblx0ZGFyazogJyNmZmZmZmY4MCcsXG5cdGxpZ2h0OiAnIzAwMDAwMDgwJyxcblx0aGNEYXJrOiAnI2ZmZmZmZjgwJyxcblx0aGNMaWdodDogJyMwMDAwMDA4MCdcbn0sIG5scy5sb2NhbGl6ZSgnZWRpdG9yLmlubGluZVZhbHVlc0ZvcmVncm91bmQnLCBcIkNvbG9yIGZvciB0aGUgZGVidWcgaW5saW5lIHZhbHVlIHRleHQuXCIpKTtcblxuZXhwb3J0IGNvbnN0IGRlYnVnSW5saW5lQmFja2dyb3VuZCA9IHJlZ2lzdGVyQ29sb3IoJ2VkaXRvci5pbmxpbmVWYWx1ZXNCYWNrZ3JvdW5kJywgJyNmZmM4MDAzMycsIG5scy5sb2NhbGl6ZSgnZWRpdG9yLmlubGluZVZhbHVlc0JhY2tncm91bmQnLCBcIkNvbG9yIGZvciB0aGUgZGVidWcgaW5saW5lIHZhbHVlIGJhY2tncm91bmQuXCIpKTtcblxuY2xhc3MgSW5saW5lU2VnbWVudCB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyBjb2x1bW46IG51bWJlciwgcHVibGljIHRleHQ6IHN0cmluZykge1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRIb3ZlckNvbnRlbnQoY29udGVudFRleHQ6IHN0cmluZyk6IE1hcmtkb3duU3RyaW5nIHtcblx0aWYgKGNvbnRlbnRUZXh0LmluY2x1ZGVzKCcsJykgJiYgY29udGVudFRleHQuaW5jbHVkZXMoJz0nKSkge1xuXHRcdC8vIEN1c3RvbSBzcGxpdDogZm9yIGVhY2ggZXF1YWxzIHNpZ24gYWZ0ZXIgdGhlIGZpcnN0LCBiYWNrdHJhY2sgdG8gdGhlIG5lYXJlc3QgY29tbWFcblx0XHRjb25zdCBjdXN0b21TcGxpdCA9ICh0ZXh0OiBzdHJpbmcpOiBzdHJpbmdbXSA9PiB7XG5cdFx0XHRjb25zdCBzcGxpdHM6IG51bWJlcltdID0gW107XG5cdFx0XHRsZXQgZXF1YWxzRm91bmQgPSAwO1xuXHRcdFx0bGV0IHN0YXJ0ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGV4dC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAodGV4dFtpXSA9PT0gJz0nKSB7XG5cdFx0XHRcdFx0aWYgKGVxdWFsc0ZvdW5kID09PSAwKSB7XG5cdFx0XHRcdFx0XHRlcXVhbHNGb3VuZCsrO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGNvbW1hSW5kZXggPSB0ZXh0Lmxhc3RJbmRleE9mKCcsJywgaSk7XG5cdFx0XHRcdFx0aWYgKGNvbW1hSW5kZXggIT09IC0xICYmIGNvbW1hSW5kZXggPj0gc3RhcnQpIHtcblx0XHRcdFx0XHRcdHNwbGl0cy5wdXNoKGNvbW1hSW5kZXgpO1xuXHRcdFx0XHRcdFx0c3RhcnQgPSBjb21tYUluZGV4ICsgMTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZXF1YWxzRm91bmQrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0bGV0IHMgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBpbmRleCBvZiBzcGxpdHMpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2godGV4dC5zdWJzdHJpbmcocywgaW5kZXgpLnRyaW0oKSk7XG5cdFx0XHRcdHMgPSBpbmRleCArIDE7XG5cdFx0XHR9XG5cdFx0XHRpZiAocyA8IHRleHQubGVuZ3RoKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRleHQuc3Vic3RyaW5nKHMpLnRyaW0oKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH07XG5cblx0XHRjb25zdCBwYWlycyA9IGN1c3RvbVNwbGl0KGNvbnRlbnRUZXh0KTtcblx0XHRjb25zdCBmb3JtYXR0ZWRQYWlycyA9IHBhaXJzLm1hcChwYWlyID0+IHtcblx0XHRcdGNvbnN0IGVxdWFsc0luZGV4ID0gcGFpci5pbmRleE9mKCc9Jyk7XG5cdFx0XHRpZiAoZXF1YWxzSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdGNvbnN0IGluZGVudCA9ICcgJy5yZXBlYXQoZXF1YWxzSW5kZXggKyAyKTtcblx0XHRcdFx0Y29uc3QgW2ZpcnN0TGluZSwgLi4ucmVzdExpbmVzXSA9IHBhaXIuc3BsaXQoL1xccj9cXG4vKTtcblx0XHRcdFx0cmV0dXJuIFtmaXJzdExpbmUsIC4uLnJlc3RMaW5lcy5tYXAobGluZSA9PiBpbmRlbnQgKyBsaW5lKV0uam9pbignXFxuJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGFpcjtcblx0XHR9KTtcblx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCcnLCBmb3JtYXR0ZWRQYWlycy5qb2luKCcsXFxuJykpO1xuXHR9XG5cdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRDb2RlYmxvY2soJycsIGNvbnRlbnRUZXh0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbihsaW5lTnVtYmVyOiBudW1iZXIsIGNvbnRlbnRUZXh0OiBzdHJpbmcsIGNsYXNzTmFtZVByZWZpeDogc3RyaW5nLCBjb2x1bW4gPSBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUiwgdmlld3BvcnRNYXhDb2w6IG51bWJlciA9IE1BWF9JTkxJTkVfREVDT1JBVE9SX0xFTkdUSCk6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdIHtcblx0Y29uc3QgcmF3VGV4dCA9IGNvbnRlbnRUZXh0OyAvLyBzdG9yZSByYXcgdGV4dCBmb3IgaG92ZXIgbWVzc2FnZVxuXG5cdC8vIFRydW5jYXRlIGNvbnRlbnRUZXh0IGlmIGl0IGV4Y2VlZHMgdGhlIHZpZXdwb3J0IG1heCBjb2x1bW5cblx0aWYgKGNvbnRlbnRUZXh0Lmxlbmd0aCA+IHZpZXdwb3J0TWF4Q29sKSB7XG5cdFx0Y29udGVudFRleHQgPSBjb250ZW50VGV4dC5zdWJzdHJpbmcoMCwgdmlld3BvcnRNYXhDb2wpICsgJy4uLic7XG5cdH1cblxuXHRyZXR1cm4gW1xuXHRcdHtcblx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogbGluZU51bWJlcixcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogbGluZU51bWJlcixcblx0XHRcdFx0c3RhcnRDb2x1bW46IGNvbHVtbixcblx0XHRcdFx0ZW5kQ29sdW1uOiBjb2x1bW5cblx0XHRcdH0sXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgJHtjbGFzc05hbWVQcmVmaXh9LWlubGluZS12YWx1ZS1kZWNvcmF0aW9uLXNwYWNlcmAsXG5cdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0Y29udGVudDogc3RyaW5ncy5ub0JyZWFrV2hpdGVzcGFjZSxcblx0XHRcdFx0XHRjdXJzb3JTdG9wczogSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTm9uZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHR9XG5cdFx0fSxcblx0XHR7XG5cdFx0XHRyYW5nZToge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBjb2x1bW4sXG5cdFx0XHRcdGVuZENvbHVtbjogY29sdW1uXG5cdFx0XHR9LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogYCR7Y2xhc3NOYW1lUHJlZml4fS1pbmxpbmUtdmFsdWUtZGVjb3JhdGlvbmAsXG5cdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0Y29udGVudDogcmVwbGFjZVdzV2l0aE5vQnJlYWtXcyhjb250ZW50VGV4dCksXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBgJHtjbGFzc05hbWVQcmVmaXh9LWlubGluZS12YWx1ZWAsXG5cdFx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IHRydWUsXG5cdFx0XHRcdFx0Y3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLk5vbmVcblx0XHRcdFx0fSxcblx0XHRcdFx0c2hvd0lmQ29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0XHRob3Zlck1lc3NhZ2U6IGZvcm1hdEhvdmVyQ29udGVudChyYXdUZXh0KVxuXHRcdFx0fVxuXHRcdH0sXG5cdF07XG59XG5cbmZ1bmN0aW9uIHJlcGxhY2VXc1dpdGhOb0JyZWFrV3Moc3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gc3RyLnJlcGxhY2UoL1sgXFx0XFxuXS9nLCBzdHJpbmdzLm5vQnJlYWtXaGl0ZXNwYWNlKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlSW5saW5lVmFsdWVEZWNvcmF0aW9uc0luc2lkZVJhbmdlKGV4cHJlc3Npb25zOiBSZWFkb25seUFycmF5PElFeHByZXNzaW9uPiwgcmFuZ2VzOiBSYW5nZVtdLCBtb2RlbDogSVRleHRNb2RlbCwgd29yZFRvTGluZU51bWJlcnNNYXA6IE1hcDxzdHJpbmcsIG51bWJlcltdPikge1xuXHRjb25zdCBuYW1lVmFsdWVNYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRmb3IgKGNvbnN0IGV4cHIgb2YgZXhwcmVzc2lvbnMpIHtcblx0XHRuYW1lVmFsdWVNYXAuc2V0KGV4cHIubmFtZSwgZXhwci52YWx1ZSk7XG5cdFx0Ly8gTGltaXQgdGhlIHNpemUgb2YgbWFwLiBUb28gbGFyZ2UgY2FuIGhhdmUgYSBwZXJmIGltcGFjdFxuXHRcdGlmIChuYW1lVmFsdWVNYXAuc2l6ZSA+PSBNQVhfTlVNX0lOTElORV9WQUxVRVMpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGxpbmVUb05hbWVzTWFwOiBNYXA8bnVtYmVyLCBzdHJpbmdbXT4gPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nW10+KCk7XG5cblx0Ly8gQ29tcHV0ZSB1bmlxdWUgc2V0IG9mIG5hbWVzIG9uIGVhY2ggbGluZVxuXHRuYW1lVmFsdWVNYXAuZm9yRWFjaCgoX3ZhbHVlLCBuYW1lKSA9PiB7XG5cdFx0Y29uc3QgbGluZU51bWJlcnMgPSB3b3JkVG9MaW5lTnVtYmVyc01hcC5nZXQobmFtZSk7XG5cdFx0aWYgKGxpbmVOdW1iZXJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGxpbmVOdW1iZXIgb2YgbGluZU51bWJlcnMpIHtcblx0XHRcdFx0aWYgKHJhbmdlcy5zb21lKHIgPT4gbGluZU51bWJlciA+PSByLnN0YXJ0TGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IHIuZW5kTGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRpZiAoIWxpbmVUb05hbWVzTWFwLmhhcyhsaW5lTnVtYmVyKSkge1xuXHRcdFx0XHRcdFx0bGluZVRvTmFtZXNNYXAuc2V0KGxpbmVOdW1iZXIsIFtdKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAobGluZVRvTmFtZXNNYXAuZ2V0KGxpbmVOdW1iZXIpIS5pbmRleE9mKG5hbWUpID09PSAtMSkge1xuXHRcdFx0XHRcdFx0bGluZVRvTmFtZXNNYXAuZ2V0KGxpbmVOdW1iZXIpIS5wdXNoKG5hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0Ly8gQ29tcHV0ZSBkZWNvcmF0b3JzIGZvciBlYWNoIGxpbmVcblx0cmV0dXJuIFsuLi5saW5lVG9OYW1lc01hcF0ubWFwKChbbGluZSwgbmFtZXNdKSA9PiAoe1xuXHRcdGxpbmUsXG5cdFx0dmFyaWFibGVzOiBuYW1lcy5zb3J0KChmaXJzdCwgc2Vjb25kKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC5pbmRleE9mKGZpcnN0KSAtIGNvbnRlbnQuaW5kZXhPZihzZWNvbmQpO1xuXHRcdH0pLm1hcChuYW1lID0+ICh7IG5hbWUsIHZhbHVlOiBuYW1lVmFsdWVNYXAuZ2V0KG5hbWUpISB9KSlcblx0fSkpO1xufVxuXG5mdW5jdGlvbiBnZXRXb3JkVG9MaW5lTnVtYmVyc01hcChtb2RlbDogSVRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCByZXN1bHQ6IE1hcDxzdHJpbmcsIG51bWJlcltdPikge1xuXHRjb25zdCBsaW5lTGVuZ3RoID0gbW9kZWwuZ2V0TGluZUxlbmd0aChsaW5lTnVtYmVyKTtcblx0Ly8gSWYgbGluZSBpcyB0b28gbG9uZyB0aGVuIHNraXAgdGhlIGxpbmVcblx0aWYgKGxpbmVMZW5ndGggPiBNQVhfVE9LRU5JWkFUSU9OX0xJTkVfTEVOKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRjb25zdCBsaW5lVG9rZW5zID0gbW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdGZvciAobGV0IHRva2VuSW5kZXggPSAwLCB0b2tlbkNvdW50ID0gbGluZVRva2Vucy5nZXRDb3VudCgpOyB0b2tlbkluZGV4IDwgdG9rZW5Db3VudDsgdG9rZW5JbmRleCsrKSB7XG5cdFx0Y29uc3QgdG9rZW5UeXBlID0gbGluZVRva2Vucy5nZXRTdGFuZGFyZFRva2VuVHlwZSh0b2tlbkluZGV4KTtcblxuXHRcdC8vIFRva2VuIGlzIGEgd29yZCBhbmQgbm90IGEgY29tbWVudFxuXHRcdGlmICh0b2tlblR5cGUgPT09IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyKSB7XG5cdFx0XHRERUZBVUxUX1dPUkRfUkVHRVhQLmxhc3RJbmRleCA9IDA7IC8vIFdlIGFzc3VtZSB0b2tlbnMgd2lsbCB1c3VhbGx5IG1hcCAxOjEgdG8gd29yZHMgaWYgdGhleSBtYXRjaFxuXG5cdFx0XHRjb25zdCB0b2tlblN0YXJ0T2Zmc2V0ID0gbGluZVRva2Vucy5nZXRTdGFydE9mZnNldCh0b2tlbkluZGV4KTtcblx0XHRcdGNvbnN0IHRva2VuRW5kT2Zmc2V0ID0gbGluZVRva2Vucy5nZXRFbmRPZmZzZXQodG9rZW5JbmRleCk7XG5cdFx0XHRjb25zdCB0b2tlblN0ciA9IGxpbmVDb250ZW50LnN1YnN0cmluZyh0b2tlblN0YXJ0T2Zmc2V0LCB0b2tlbkVuZE9mZnNldCk7XG5cdFx0XHRjb25zdCB3b3JkTWF0Y2ggPSBERUZBVUxUX1dPUkRfUkVHRVhQLmV4ZWModG9rZW5TdHIpO1xuXG5cdFx0XHRpZiAod29yZE1hdGNoKSB7XG5cblx0XHRcdFx0Y29uc3Qgd29yZCA9IHdvcmRNYXRjaFswXTtcblx0XHRcdFx0aWYgKCFyZXN1bHQuaGFzKHdvcmQpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnNldCh3b3JkLCBbXSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXN1bHQuZ2V0KHdvcmQpIS5wdXNoKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGVidWdFZGl0b3JDb250cmlidXRpb24gaW1wbGVtZW50cyBJRGVidWdFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgdG9EaXNwb3NlOiBJRGlzcG9zYWJsZVtdO1xuXHRwcml2YXRlIGhvdmVyV2lkZ2V0OiBEZWJ1Z0hvdmVyV2lkZ2V0O1xuXHRwcml2YXRlIGhvdmVyUG9zaXRpb24/OiB7IHBvc2l0aW9uOiBQb3NpdGlvbjsgZXZlbnQ6IElNb3VzZUV2ZW50IH07XG5cdHByaXZhdGUgbW91c2VEb3duID0gZmFsc2U7XG5cdHByaXZhdGUgZXhjZXB0aW9uV2lkZ2V0VmlzaWJsZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZ3V0dGVySXNIb3ZlcmVkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBleGNlcHRpb25XaWRnZXQ6IEV4Y2VwdGlvbldpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb25maWd1cmF0aW9uV2lkZ2V0OiBGbG9hdGluZ0VkaXRvckNsaWNrV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFsdExpc3RlbmVyID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cdHByaXZhdGUgYWx0UHJlc3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIG9sZERlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3BsYXllZFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIGVkaXRvckhvdmVyT3B0aW9uczogSUVkaXRvckhvdmVyT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBkZWJvdW5jZUluZm86IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbjtcblx0cHJpdmF0ZSBhbGxvd1Njcm9sbFRvRXhjZXB0aW9uV2lkZ2V0ID0gdHJ1ZTtcblx0cHJpdmF0ZSBzaG91bGRTY3JvbGxUb0V4Y2VwdGlvbldpZGdldCA9ICgpID0+IHRoaXMuYWxsb3dTY3JvbGxUb0V4Y2VwdGlvbldpZGdldDtcblxuXHQvLyBIb2xkcyBhIERpc3Bvc2FibGUgdGhhdCBwcmV2ZW50cyB0aGUgZGVmYXVsdCBlZGl0b3IgaG92ZXIgYmVoYXZpb3Igd2hpbGUgaXQgZXhpc3RzLlxuXHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRIb3ZlckxvY2tvdXQgPSBuZXcgTXV0YWJsZURpc3Bvc2FibGUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIGZlYXR1cmVEZWJvdW5jZVNlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5vbGREZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuZGVib3VuY2VJbmZvID0gZmVhdHVyZURlYm91bmNlU2VydmljZS5mb3IobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lVmFsdWVzUHJvdmlkZXIsICdJbmxpbmVWYWx1ZXMnLCB7IG1pbjogREVBRlVMVF9JTkxJTkVfREVCT1VOQ0VfREVMQVkgfSk7XG5cdFx0dGhpcy5ob3ZlcldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdIb3ZlcldpZGdldCwgdGhpcy5lZGl0b3IpO1xuXHRcdHRoaXMudG9EaXNwb3NlID0gW3RoaXMuZGVmYXVsdEhvdmVyTG9ja291dCwgdGhpcy5hbHRMaXN0ZW5lciwgdGhpcy5kaXNwbGF5ZWRTdG9yZV07XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuZXhjZXB0aW9uV2lkZ2V0VmlzaWJsZSA9IENPTlRFWFRfRVhDRVBUSU9OX1dJREdFVF9WSVNJQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50b2dnbGVFeGNlcHRpb25XaWRnZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU3RhY2tGcmFtZShlID0+IHRoaXMub25Gb2N1c1N0YWNrRnJhbWUoZS5zdGFja0ZyYW1lKSkpO1xuXG5cdFx0Ly8gaG92ZXIgbGlzdGVuZXJzICYgaG92ZXIgd2lkZ2V0XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbk1vdXNlRG93bigoZTogSUVkaXRvck1vdXNlRXZlbnQpID0+IHRoaXMub25FZGl0b3JNb3VzZURvd24oZSkpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uTW91c2VVcCgoKSA9PiB0aGlzLm1vdXNlRG93biA9IGZhbHNlKSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbk1vdXNlTW92ZSgoZTogSUVkaXRvck1vdXNlRXZlbnQpID0+IHRoaXMub25FZGl0b3JNb3VzZU1vdmUoZSkpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZWRpdG9yLm9uTW91c2VMZWF2ZSgoZTogSVBhcnRpYWxFZGl0b3JNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBob3ZlckRvbU5vZGUgPSB0aGlzLmhvdmVyV2lkZ2V0LmdldERvbU5vZGUoKTtcblx0XHRcdGlmICghaG92ZXJEb21Ob2RlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVjdCA9IGhvdmVyRG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdC8vIE9ubHkgaGlkZSB0aGUgaG92ZXIgd2lkZ2V0IGlmIHRoZSBlZGl0b3IgbW91c2UgbGVhdmUgZXZlbnQgaXMgb3V0c2lkZSB0aGUgaG92ZXIgd2lkZ2V0ICMzNTI4XG5cdFx0XHRpZiAoZS5ldmVudC5wb3N4IDwgcmVjdC5sZWZ0IHx8IGUuZXZlbnQucG9zeCA+IHJlY3QucmlnaHQgfHwgZS5ldmVudC5wb3N5IDwgcmVjdC50b3AgfHwgZS5ldmVudC5wb3N5ID4gcmVjdC5ib3R0b20pIHtcblx0XHRcdFx0dGhpcy5oaWRlSG92ZXJXaWRnZXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbktleURvd24oKGU6IElLZXlib2FyZEV2ZW50KSA9PiB0aGlzLm9uS2V5RG93bihlKSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fd29yZFRvTGluZU51bWJlcnNNYXAgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZUlubGluZVZhbHVlc1NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uV2lsbFVwZGF0ZVZpZXdzKCgpID0+IHRoaXMudXBkYXRlSW5saW5lVmFsdWVzU2NoZWR1bGVyLnNjaGVkdWxlKCkpKTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLm9uRGlkRXZhbHVhdGVMYXp5RXhwcmVzc2lvbigoKSA9PiB0aGlzLnVwZGF0ZUlubGluZVZhbHVlc1NjaGVkdWxlci5zY2hlZHVsZSgpKSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmVkaXRvci5vbkRpZENoYW5nZU1vZGVsKGFzeW5jICgpID0+IHtcblx0XHRcdHRoaXMuYWRkRG9jdW1lbnRMaXN0ZW5lcnMoKTtcblx0XHRcdHRoaXMudG9nZ2xlRXhjZXB0aW9uV2lkZ2V0KCk7XG5cdFx0XHR0aGlzLmhpZGVIb3ZlcldpZGdldCgpO1xuXHRcdFx0dGhpcy5fd29yZFRvTGluZU51bWJlcnNNYXAgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzdGFja0ZyYW1lID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbnMoc3RhY2tGcmFtZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5oaWRlSG92ZXJXaWRnZXQoKTtcblxuXHRcdFx0Ly8gSW5saW5lIHZhbHVlIHByb3ZpZGVyIHNob3VsZCBnZXQgY2FsbGVkIG9uIHZpZXcgcG9ydCBjaGFuZ2Vcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbCAmJiB0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmlubGluZVZhbHVlc1Byb3ZpZGVyLmhhcyhtb2RlbCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5ob3ZlcicpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlSG92ZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2godGhpcy5kZWJ1Z1NlcnZpY2Uub25EaWRDaGFuZ2VTdGF0ZSgoc3RhdGU6IFN0YXRlKSA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgIT09IFN0YXRlLlN0b3BwZWQpIHtcblx0XHRcdFx0dGhpcy50b2dnbGVFeGNlcHRpb25XaWRnZXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUhvdmVyQ29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd29yZFRvTGluZU51bWJlcnNNYXA6IFdvcmRzVG9MaW5lTnVtYmVyc0NhY2hlIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgdXBkYXRlSG92ZXJDb25maWd1cmF0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuZWRpdG9ySG92ZXJPcHRpb25zID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9ySG92ZXJPcHRpb25zPignZWRpdG9yLmhvdmVyJywge1xuXHRcdFx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdFx0XHRvdmVycmlkZUlkZW50aWZpZXI6IG1vZGVsLmdldExhbmd1YWdlSWQoKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGREb2N1bWVudExpc3RlbmVycygpOiB2b2lkIHtcblx0XHRjb25zdCBzdGFja0ZyYW1lID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFN0YWNrRnJhbWU7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0dGhpcy5hcHBseURvY3VtZW50TGlzdGVuZXJzKG1vZGVsLCBzdGFja0ZyYW1lKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5RG9jdW1lbnRMaXN0ZW5lcnMobW9kZWw6IElUZXh0TW9kZWwsIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFzdGFja0ZyYW1lIHx8ICF0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChtb2RlbC51cmksIHN0YWNrRnJhbWUuc291cmNlLnVyaSkpIHtcblx0XHRcdHRoaXMuYWx0TGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvd25lckRvY3VtZW50ID0gdGhpcy5lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpLm93bmVyRG9jdW1lbnQ7XG5cblx0XHQvLyBXaGVuIHRoZSBhbHQga2V5IGlzIHByZXNzZWQgc2hvdyByZWd1bGFyIGVkaXRvciBob3ZlciBhbmQgaGlkZSB0aGUgZGVidWcgaG92ZXIgIzg0NTYxXG5cdFx0dGhpcy5hbHRMaXN0ZW5lci52YWx1ZSA9IGFkZERpc3Bvc2FibGVMaXN0ZW5lcihvd25lckRvY3VtZW50LCAna2V5ZG93bicsIGtleWRvd25FdmVudCA9PiB7XG5cdFx0XHRjb25zdCBzdGFuZGFyZEtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGtleWRvd25FdmVudCk7XG5cdFx0XHRpZiAoc3RhbmRhcmRLZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuQWx0KSB7XG5cdFx0XHRcdHRoaXMuYWx0UHJlc3NlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IGRlYnVnSG92ZXJXYXNWaXNpYmxlID0gdGhpcy5ob3ZlcldpZGdldC5pc1Zpc2libGUoKTtcblx0XHRcdFx0dGhpcy5ob3ZlcldpZGdldC5oaWRlKCk7XG5cdFx0XHRcdHRoaXMuZGVmYXVsdEhvdmVyTG9ja291dC5jbGVhcigpO1xuXG5cdFx0XHRcdGlmIChkZWJ1Z0hvdmVyV2FzVmlzaWJsZSAmJiB0aGlzLmhvdmVyUG9zaXRpb24pIHtcblx0XHRcdFx0XHQvLyBJZiB0aGUgZGVidWcgaG92ZXIgd2FzIHZpc2libGUgaW1tZWRpYXRlbHkgc2hvdyB0aGUgZWRpdG9yIGhvdmVyIGZvciB0aGUgYWx0IHRyYW5zaXRpb24gdG8gYmUgc21vb3RoXG5cdFx0XHRcdFx0dGhpcy5zaG93RWRpdG9ySG92ZXIodGhpcy5ob3ZlclBvc2l0aW9uLnBvc2l0aW9uLCBmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBvbktleVVwID0gbmV3IERvbUVtaXR0ZXIob3duZXJEb2N1bWVudCwgJ2tleXVwJyk7XG5cdFx0XHRcdGNvbnN0IGxpc3RlbmVyID0gRXZlbnQuYW55PEtleWJvYXJkRXZlbnQgfCBib29sZWFuPih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMsIG9uS2V5VXAuZXZlbnQpKGtleXVwRXZlbnQgPT4ge1xuXHRcdFx0XHRcdGxldCBzdGFuZGFyZEtleWJvYXJkRXZlbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKGlzS2V5Ym9hcmRFdmVudChrZXl1cEV2ZW50KSkge1xuXHRcdFx0XHRcdFx0c3RhbmRhcmRLZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChrZXl1cEV2ZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFzdGFuZGFyZEtleWJvYXJkRXZlbnQgfHwgc3RhbmRhcmRLZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuQWx0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLmFsdFByZXNzZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHRoaXMucHJldmVudERlZmF1bHRFZGl0b3JIb3ZlcigpO1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0b25LZXlVcC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHNob3dIb3Zlcihwb3NpdGlvbjogUG9zaXRpb24sIGZvY3VzOiBib29sZWFuLCBtb3VzZUV2ZW50PzogSU1vdXNlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBub3JtYWxseSB3aWxsIGFscmVhZHkgYmUgc2V0IGluIGBzaG93SG92ZXJTY2hlZHVsZXJgLCBidXQgcHVibGljIGNhbGxlcnMgbWF5IGhpdCB0aGlzIGRpcmVjdGx5OlxuXHRcdHRoaXMucHJldmVudERlZmF1bHRFZGl0b3JIb3ZlcigpO1xuXG5cdFx0Y29uc3Qgc2YgPSB0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKHNmICYmIG1vZGVsICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNmLnNvdXJjZS51cmksIG1vZGVsLnVyaSkpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuaG92ZXJXaWRnZXQuc2hvd0F0KHBvc2l0aW9uLCBmb2N1cywgbW91c2VFdmVudCk7XG5cdFx0XHRpZiAocmVzdWx0ID09PSBTaG93RGVidWdIb3ZlclJlc3VsdC5OT1RfQVZBSUxBQkxFKSB7XG5cdFx0XHRcdC8vIFdoZW4gbm8gZXhwcmVzc2lvbiBhdmFpbGFibGUgZmFsbGJhY2sgdG8gZWRpdG9yIGhvdmVyXG5cdFx0XHRcdHRoaXMuc2hvd0VkaXRvckhvdmVyKHBvc2l0aW9uLCBmb2N1cyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2hvd0VkaXRvckhvdmVyKHBvc2l0aW9uLCBmb2N1cyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBwcmV2ZW50RGVmYXVsdEVkaXRvckhvdmVyKCkge1xuXHRcdGlmICh0aGlzLmRlZmF1bHRIb3ZlckxvY2tvdXQudmFsdWUgfHwgdGhpcy5lZGl0b3JIb3Zlck9wdGlvbnM/LmVuYWJsZWQgPT09ICdvZmYnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG92ZXJDb250cm9sbGVyID0gdGhpcy5lZGl0b3IuZ2V0Q29udHJpYnV0aW9uPENvbnRlbnRIb3ZlckNvbnRyb2xsZXI+KENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuSUQpO1xuXHRcdGhvdmVyQ29udHJvbGxlcj8uaGlkZUNvbnRlbnRIb3ZlcigpO1xuXG5cdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh7IGhvdmVyOiB7IGVuYWJsZWQ6ICdvZmYnIH0gfSk7XG5cdFx0dGhpcy5kZWZhdWx0SG92ZXJMb2Nrb3V0LnZhbHVlID0ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdFx0XHRob3ZlcjogeyBlbmFibGVkOiB0aGlzLmVkaXRvckhvdmVyT3B0aW9ucz8uZW5hYmxlZCA/PyAnb24nIH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0VkaXRvckhvdmVyKHBvc2l0aW9uOiBQb3NpdGlvbiwgZm9jdXM6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBob3ZlckNvbnRyb2xsZXIgPSB0aGlzLmVkaXRvci5nZXRDb250cmlidXRpb248Q29udGVudEhvdmVyQ29udHJvbGxlcj4oQ29udGVudEhvdmVyQ29udHJvbGxlci5JRCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdC8vIGVuYWJsZSB0aGUgZWRpdG9yIGhvdmVyLCBvdGhlcndpc2UgdGhlIGNvbnRlbnQgY29udHJvbGxlciB3aWxsIHNlZSBpdFxuXHRcdC8vIGFzIGRpc2FibGVkIGFuZCBoaWRlIGl0IG9uIHRoZSBmaXJzdCBtb3VzZSBtb3ZlICgjMTkzMTQ5KVxuXHRcdHRoaXMuZGVmYXVsdEhvdmVyTG9ja291dC5jbGVhcigpO1xuXHRcdGhvdmVyQ29udHJvbGxlcj8uc2hvd0NvbnRlbnRIb3ZlcihyYW5nZSwgSG92ZXJTdGFydE1vZGUuSW1tZWRpYXRlLCBIb3ZlclN0YXJ0U291cmNlLk1vdXNlLCBmb2N1cyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRm9jdXNTdGFja0ZyYW1lKHNmOiBJU3RhY2tGcmFtZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdHRoaXMuYXBwbHlEb2N1bWVudExpc3RlbmVycyhtb2RlbCwgc2YpO1xuXHRcdFx0aWYgKHNmICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHNmLnNvdXJjZS51cmksIG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50b2dnbGVFeGNlcHRpb25XaWRnZXQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaGlkZUhvdmVyV2lkZ2V0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVJbmxpbmVWYWx1ZURlY29yYXRpb25zKHNmKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGhvdmVyRGVsYXkoKSB7XG5cdFx0Y29uc3QgYmFzZURlbGF5ID0gdGhpcy5lZGl0b3JIb3Zlck9wdGlvbnM/LmRlbGF5IHx8IDA7XG5cblx0XHQvLyBoZXVyaXN0aWMgdG8gZ2V0IGEgJ2dvb2QnIGJ1dCBjb25maWd1cmFibGUgZGVsYXkgZm9yIGV2YWx1YXRpb24uIFRoZVxuXHRcdC8vIGRlYnVnIGhvdmVyIGNhbiBiZSB2ZXJ5IGxhcmdlLCBzbyB3ZSB0ZW5kIHRvIGJlIG1vcmUgY29uc2VydmF0aXZlIGFib3V0XG5cdFx0Ly8gd2hlbiB0byBzaG93IGl0ICgjMTgwNjIxKS4gV2l0aCB0aGlzIGVxdWF0aW9uOlxuXHRcdC8vIC0gZGVmYXVsdCAzMDBtcyBob3ZlciA9PiAqIDIgICA9IDYwMG1zXG5cdFx0Ly8gLSBzaG9ydCAgIDEwMG1zIGhvdmVyID0+ICogMiAgID0gMjAwbXNcblx0XHQvLyAtIGxvbmdlciAgNjAwbXMgaG92ZXIgPT4gKiAxLjUgPSA5MDBtc1xuXHRcdC8vIC0gbG9uZyAgIDEwMDBtcyBob3ZlciA9PiAqIDEuMCA9IDEwMDBtc1xuXHRcdGNvbnN0IGRlbGF5RmFjdG9yID0gY2xhbXAoMiAtIChiYXNlRGVsYXkgLSAzMDApIC8gNjAwLCAxLCAyKTtcblxuXHRcdHJldHVybiBiYXNlRGVsYXkgKiBkZWxheUZhY3Rvcjtcblx0fVxuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgZ2V0IHNob3dIb3ZlclNjaGVkdWxlcigpIHtcblx0XHRjb25zdCBzY2hlZHVsZXIgPSBuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5ob3ZlclBvc2l0aW9uICYmICF0aGlzLmFsdFByZXNzZWQpIHtcblx0XHRcdFx0dGhpcy5zaG93SG92ZXIodGhpcy5ob3ZlclBvc2l0aW9uLnBvc2l0aW9uLCBmYWxzZSwgdGhpcy5ob3ZlclBvc2l0aW9uLmV2ZW50KTtcblx0XHRcdH1cblx0XHR9LCB0aGlzLmhvdmVyRGVsYXkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goc2NoZWR1bGVyKTtcblxuXHRcdHJldHVybiBzY2hlZHVsZXI7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVIb3ZlcldpZGdldCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ob3ZlcldpZGdldC53aWxsQmVWaXNpYmxlKCkpIHtcblx0XHRcdHRoaXMuaG92ZXJXaWRnZXQuaGlkZSgpO1xuXHRcdH1cblx0XHR0aGlzLnNob3dIb3ZlclNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLmRlZmF1bHRIb3ZlckxvY2tvdXQuY2xlYXIoKTtcblx0fVxuXG5cdC8vIGhvdmVyIGJ1c2luZXNzXG5cblx0cHJpdmF0ZSBvbkVkaXRvck1vdXNlRG93bihtb3VzZUV2ZW50OiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMubW91c2VEb3duID0gdHJ1ZTtcblx0XHRpZiAobW91c2VFdmVudC50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfV0lER0VUICYmIG1vdXNlRXZlbnQudGFyZ2V0LmRldGFpbCA9PT0gRGVidWdIb3ZlcldpZGdldC5JRCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaGlkZUhvdmVyV2lkZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRWRpdG9yTW91c2VNb3ZlKG1vdXNlRXZlbnQ6IElFZGl0b3JNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGVidWdTZXJ2aWNlLnN0YXRlICE9PSBTdGF0ZS5TdG9wcGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gbW91c2VFdmVudC50YXJnZXQ7XG5cdFx0Y29uc3Qgc3RvcEtleSA9IGVudi5pc01hY2ludG9zaCA/ICdtZXRhS2V5JyA6ICdjdHJsS2V5JztcblxuXHRcdGlmICghdGhpcy5hbHRQcmVzc2VkKSB7XG5cdFx0XHRpZiAodGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfR0xZUEhfTUFSR0lOKSB7XG5cdFx0XHRcdHRoaXMuZGVmYXVsdEhvdmVyTG9ja291dC5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLmd1dHRlcklzSG92ZXJlZCA9IHRydWU7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuZ3V0dGVySXNIb3ZlcmVkKSB7XG5cdFx0XHRcdHRoaXMuZ3V0dGVySXNIb3ZlcmVkID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMudXBkYXRlSG92ZXJDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKFxuXHRcdFx0KHRhcmdldC50eXBlID09PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9XSURHRVQgJiYgdGFyZ2V0LmRldGFpbCA9PT0gRGVidWdIb3ZlcldpZGdldC5JRClcblx0XHRcdHx8IHRoaXMuaG92ZXJXaWRnZXQuaXNJblNhZmVUcmlhbmdsZShtb3VzZUV2ZW50LmV2ZW50LnBvc3gsIG1vdXNlRXZlbnQuZXZlbnQucG9zeSlcblx0XHQpIHtcblx0XHRcdC8vIG1vdXNlIG1vdmVkIG9uIHRvcCBvZiBkZWJ1ZyBob3ZlciB3aWRnZXRcblxuXHRcdFx0Y29uc3Qgc3RpY2t5ID0gdGhpcy5lZGl0b3JIb3Zlck9wdGlvbnM/LnN0aWNreSA/PyB0cnVlO1xuXHRcdFx0aWYgKHN0aWNreSB8fCB0aGlzLmhvdmVyV2lkZ2V0LmlzU2hvd2luZ0NvbXBsZXhWYWx1ZSB8fCBtb3VzZUV2ZW50LmV2ZW50W3N0b3BLZXldKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQpIHtcblx0XHRcdGlmICh0YXJnZXQucG9zaXRpb24gJiYgIVBvc2l0aW9uLmVxdWFscyh0YXJnZXQucG9zaXRpb24sIHRoaXMuaG92ZXJQb3NpdGlvbj8ucG9zaXRpb24gfHwgbnVsbCkgJiYgIXRoaXMuaG92ZXJXaWRnZXQuaXNJblNhZmVUcmlhbmdsZShtb3VzZUV2ZW50LmV2ZW50LnBvc3gsIG1vdXNlRXZlbnQuZXZlbnQucG9zeSkpIHtcblx0XHRcdFx0dGhpcy5ob3ZlclBvc2l0aW9uID0geyBwb3NpdGlvbjogdGFyZ2V0LnBvc2l0aW9uLCBldmVudDogbW91c2VFdmVudC5ldmVudCB9O1xuXHRcdFx0XHQvLyBEaXNhYmxlIHRoZSBlZGl0b3IgaG92ZXIgZHVyaW5nIHRoZSByZXF1ZXN0IHRvIGF2b2lkIGZsaWNrZXJpbmdcblx0XHRcdFx0dGhpcy5wcmV2ZW50RGVmYXVsdEVkaXRvckhvdmVyKCk7XG5cdFx0XHRcdHRoaXMuc2hvd0hvdmVyU2NoZWR1bGVyLnNjaGVkdWxlKHRoaXMuaG92ZXJEZWxheSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghdGhpcy5tb3VzZURvd24pIHtcblx0XHRcdC8vIERvIG5vdCBoaWRlIGRlYnVnIGhvdmVyIHdoZW4gdGhlIG1vdXNlIGlzIHByZXNzZWQgYmVjYXVzZSBpdCB1c3VhbGx5IGxlYWRzIHRvIGFjY2lkZW50YWwgY2xvc2luZyAjNjQ2MjBcblx0XHRcdHRoaXMuaGlkZUhvdmVyV2lkZ2V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbktleURvd24oZTogSUtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9wS2V5ID0gZW52LmlzTWFjaW50b3NoID8gS2V5Q29kZS5NZXRhIDogS2V5Q29kZS5DdHJsO1xuXHRcdGlmIChlLmtleUNvZGUgIT09IHN0b3BLZXkgJiYgZS5rZXlDb2RlICE9PSBLZXlDb2RlLkFsdCkge1xuXHRcdFx0Ly8gZG8gbm90IGhpZGUgaG92ZXIgd2hlbiBDdHJsL01ldGEgaXMgcHJlc3NlZCwgYW5kIGFsdCBpcyBoYW5kbGVkIHNlcGFyYXRlbHlcblx0XHRcdHRoaXMuaGlkZUhvdmVyV2lkZ2V0KCk7XG5cdFx0fVxuXHR9XG5cdC8vIGVuZCBob3ZlciBidXNpbmVzc1xuXG5cdC8vIGV4Y2VwdGlvbiB3aWRnZXRcblx0cHJpdmF0ZSBhc3luYyB0b2dnbGVFeGNlcHRpb25XaWRnZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gVG9nZ2xlcyBleGNlcHRpb24gd2lkZ2V0IGJhc2VkIG9uIHRoZSBzdGF0ZSBvZiB0aGUgY3VycmVudCBlZGl0b3IgbW9kZWwgYW5kIGRlYnVnIHN0YWNrIGZyYW1lXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGZvY3VzZWRTZiA9IHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTdGFja0ZyYW1lO1xuXHRcdGNvbnN0IGNhbGxTdGFjayA9IGZvY3VzZWRTZiA/IGZvY3VzZWRTZi50aHJlYWQuZ2V0Q2FsbFN0YWNrKCkgOiBudWxsO1xuXHRcdGlmICghbW9kZWwgfHwgIWZvY3VzZWRTZiB8fCAhY2FsbFN0YWNrIHx8IGNhbGxTdGFjay5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY2xvc2VFeGNlcHRpb25XaWRnZXQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaXJzdCBjYWxsIHN0YWNrIGZyYW1lIHRoYXQgaXMgYXZhaWxhYmxlIGlzIHRoZSBmcmFtZSB3aGVyZSBleGNlcHRpb24gaGFzIGJlZW4gdGhyb3duXG5cdFx0Y29uc3QgZXhjZXB0aW9uU2YgPSBjYWxsU3RhY2suZmluZChzZiA9PiAhIShzZiAmJiBzZi5zb3VyY2UgJiYgc2Yuc291cmNlLmF2YWlsYWJsZSAmJiBzZi5zb3VyY2UucHJlc2VudGF0aW9uSGludCAhPT0gJ2RlZW1waGFzaXplJykpO1xuXHRcdGlmICghZXhjZXB0aW9uU2YgfHwgZXhjZXB0aW9uU2YgIT09IGZvY3VzZWRTZikge1xuXHRcdFx0dGhpcy5jbG9zZUV4Y2VwdGlvbldpZGdldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhbWVVcmkgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbChleGNlcHRpb25TZi5zb3VyY2UudXJpLCBtb2RlbC51cmkpO1xuXHRcdGlmICh0aGlzLmV4Y2VwdGlvbldpZGdldCAmJiAhc2FtZVVyaSkge1xuXHRcdFx0dGhpcy5jbG9zZUV4Y2VwdGlvbldpZGdldCgpO1xuXHRcdH0gZWxzZSBpZiAoc2FtZVVyaSkge1xuXHRcdFx0Ly8gU2hvdyBleGNlcHRpb24gd2lkZ2V0IGluIGFsbCBlZGl0b3JzIHdpdGggdGhlIHNhbWUgZmlsZSwgYnV0IG9ubHkgc2Nyb2xsIGluIHRoZSBhY3RpdmUgZWRpdG9yXG5cdFx0XHRjb25zdCBhY3RpdmVDb250cm9sID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmVFZGl0b3IgPSBhY3RpdmVDb250cm9sID09PSB0aGlzLmVkaXRvcjtcblx0XHRcdGNvbnN0IGV4Y2VwdGlvbkluZm8gPSBhd2FpdCBmb2N1c2VkU2YudGhyZWFkLmV4Y2VwdGlvbkluZm87XG5cblx0XHRcdGlmIChleGNlcHRpb25JbmZvKSB7XG5cdFx0XHRcdGlmIChpc0FjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRcdC8vIEFjdGl2ZSBlZGl0b3I6IHNob3cgd2lkZ2V0IGFuZCBzY3JvbGwgdG8gaXRcblx0XHRcdFx0XHR0aGlzLnNob3dFeGNlcHRpb25XaWRnZXQoZXhjZXB0aW9uSW5mbywgdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb24sIGV4Y2VwdGlvblNmLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgZXhjZXB0aW9uU2YucmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEluYWN0aXZlIGVkaXRvcjogc2hvdyB3aWRnZXQgd2l0aG91dCBzY3JvbGxpbmdcblx0XHRcdFx0XHR0aGlzLnNob3dFeGNlcHRpb25XaWRnZXRXaXRob3V0U2Nyb2xsKGV4Y2VwdGlvbkluZm8sIHRoaXMuZGVidWdTZXJ2aWNlLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uLCBleGNlcHRpb25TZi5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGV4Y2VwdGlvblNmLnJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2hvd0V4Y2VwdGlvbldpZGdldChleGNlcHRpb25JbmZvOiBJRXhjZXB0aW9uSW5mbywgZGVidWdTZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXhjZXB0aW9uV2lkZ2V0KSB7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5leGNlcHRpb25XaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEV4Y2VwdGlvbldpZGdldCwgdGhpcy5lZGl0b3IsIGV4Y2VwdGlvbkluZm8sIGRlYnVnU2Vzc2lvbiwgdGhpcy5zaG91bGRTY3JvbGxUb0V4Y2VwdGlvbldpZGdldCk7XG5cdFx0dGhpcy5leGNlcHRpb25XaWRnZXQuc2hvdyh7IGxpbmVOdW1iZXIsIGNvbHVtbiB9LCAwKTtcblx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldC5mb2N1cygpO1xuXHRcdHRoaXMuZWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXIoe1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBsaW5lTnVtYmVyLFxuXHRcdFx0c3RhcnRDb2x1bW46IGNvbHVtbixcblx0XHRcdGVuZExpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRlbmRDb2x1bW46IGNvbHVtbixcblx0XHR9KTtcblx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldFZpc2libGUuc2V0KHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93RXhjZXB0aW9uV2lkZ2V0V2l0aG91dFNjcm9sbChleGNlcHRpb25JbmZvOiBJRXhjZXB0aW9uSW5mbywgZGVidWdTZXNzaW9uOiBJRGVidWdTZXNzaW9uIHwgdW5kZWZpbmVkLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXhjZXB0aW9uV2lkZ2V0KSB7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlzYWJsZSBzY3JvbGxpbmcgdG8gZXhjZXB0aW9uIHdpZGdldFxuXHRcdHRoaXMuYWxsb3dTY3JvbGxUb0V4Y2VwdGlvbldpZGdldCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgY3VycmVudFNjcm9sbFRvcCA9IHRoaXMuZWRpdG9yLmdldFNjcm9sbFRvcCgpO1xuXHRcdGNvbnN0IHZpc2libGVSYW5nZXMgPSB0aGlzLmVkaXRvci5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0aWYgKHZpc2libGVSYW5nZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBFZGl0b3Igbm90IGZ1bGx5IGluaXRpYWxpemVkIG9yIG5vdCB2aXNpYmxlOyBza2lwIHNjcm9sbCBhZGp1c3RtZW50XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhjZXB0aW9uV2lkZ2V0LCB0aGlzLmVkaXRvciwgZXhjZXB0aW9uSW5mbywgZGVidWdTZXNzaW9uLCB0aGlzLnNob3VsZFNjcm9sbFRvRXhjZXB0aW9uV2lkZ2V0KTtcblx0XHRcdHRoaXMuZXhjZXB0aW9uV2lkZ2V0LnNob3coeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSwgMCk7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldFZpc2libGUuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5hbGxvd1Njcm9sbFRvRXhjZXB0aW9uV2lkZ2V0ID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaXJzdFZpc2libGVMaW5lID0gdmlzaWJsZVJhbmdlc1swXS5zdGFydExpbmVOdW1iZXI7XG5cblx0XHQvLyBDcmVhdGUgd2lkZ2V0IC0gdGhpcyBtYXkgYWRkIGEgem9uZSB0aGF0IHB1c2hlcyBjb250ZW50IGRvd25cblx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhjZXB0aW9uV2lkZ2V0LCB0aGlzLmVkaXRvciwgZXhjZXB0aW9uSW5mbywgZGVidWdTZXNzaW9uLCB0aGlzLnNob3VsZFNjcm9sbFRvRXhjZXB0aW9uV2lkZ2V0KTtcblx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldC5zaG93KHsgbGluZU51bWJlciwgY29sdW1uIH0sIDApO1xuXHRcdHRoaXMuZXhjZXB0aW9uV2lkZ2V0VmlzaWJsZS5zZXQodHJ1ZSk7XG5cblx0XHQvLyBvbmx5IGFkanVzdCBzY3JvbGwgaWYgdGhlIGV4Y2VwdGlvbiB3aWRnZXQgaXMgYWJvdmUgdGhlIGZpcnN0IHZpc2libGUgbGluZVxuXHRcdGlmIChsaW5lTnVtYmVyIDwgZmlyc3RWaXNpYmxlTGluZSkge1xuXHRcdFx0Ly8gR2V0IHRoZSBhY3R1YWwgaGVpZ2h0IG9mIHRoZSB3aWRnZXQgdGhhdCB3YXMganVzdCBhZGRlZCBmcm9tIHRoZSB3aGl0ZXNwYWNlXG5cdFx0XHQvLyBUaGUgd2hpdGVzcGFjZSBoZWlnaHQgaXMgbW9yZSBhY2N1cmF0ZSB0aGFuIHRoZSBjb250YWluZXIgaGVpZ2h0XG5cdFx0XHRjb25zdCBzY3JvbGxBZGp1c3RtZW50ID0gdGhpcy5leGNlcHRpb25XaWRnZXQuZ2V0V2hpdGVzcGFjZUhlaWdodCgpO1xuXG5cdFx0XHQvLyBTY3JvbGwgZG93biBieSB0aGUgYWN0dWFsIHdpZGdldCBoZWlnaHQgdG8ga2VlcCB0aGUgZmlyc3QgdmlzaWJsZSBsaW5lIHRoZSBzYW1lXG5cdFx0XHR0aGlzLmVkaXRvci5zZXRTY3JvbGxUb3AoY3VycmVudFNjcm9sbFRvcCArIHNjcm9sbEFkanVzdG1lbnQsIFNjcm9sbFR5cGUuSW1tZWRpYXRlKTtcblx0XHR9XG5cblx0XHQvLyBSZS1lbmFibGUgc2Nyb2xsaW5nIHRvIGV4Y2VwdGlvbiB3aWRnZXRcblx0XHR0aGlzLmFsbG93U2Nyb2xsVG9FeGNlcHRpb25XaWRnZXQgPSB0cnVlO1xuXHR9XG5cblx0Y2xvc2VFeGNlcHRpb25XaWRnZXQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZXhjZXB0aW9uV2lkZ2V0KSB7XG5cdFx0XHRjb25zdCBzaG91bGRGb2N1c0VkaXRvciA9IHRoaXMuZXhjZXB0aW9uV2lkZ2V0Lmhhc0ZvY3VzKCk7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmV4Y2VwdGlvbldpZGdldCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuZXhjZXB0aW9uV2lkZ2V0VmlzaWJsZS5zZXQoZmFsc2UpO1xuXHRcdFx0aWYgKHNob3VsZEZvY3VzRWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgYWRkTGF1bmNoQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBjb25maWd1cmF0aW9uc0FycmF5UG9zaXRpb246IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsYXN0UHJvcGVydHk6IHN0cmluZztcblxuXHRcdGNvbnN0IGdldENvbmZpZ3VyYXRpb25Qb3NpdGlvbiA9ICgpID0+IHtcblx0XHRcdGxldCBkZXB0aEluQXJyYXkgPSAwO1xuXHRcdFx0dmlzaXQobW9kZWwuZ2V0VmFsdWUoKSwge1xuXHRcdFx0XHRvbk9iamVjdFByb3BlcnR5OiAocHJvcGVydHk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGxhc3RQcm9wZXJ0eSA9IHByb3BlcnR5O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkFycmF5QmVnaW46IChvZmZzZXQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdGlmIChsYXN0UHJvcGVydHkgPT09ICdjb25maWd1cmF0aW9ucycgJiYgZGVwdGhJbkFycmF5ID09PSAwKSB7XG5cdFx0XHRcdFx0XHRjb25maWd1cmF0aW9uc0FycmF5UG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZXB0aEluQXJyYXkrKztcblx0XHRcdFx0fSxcblx0XHRcdFx0b25BcnJheUVuZDogKCkgPT4ge1xuXHRcdFx0XHRcdGRlcHRoSW5BcnJheS0tO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0Z2V0Q29uZmlndXJhdGlvblBvc2l0aW9uKCk7XG5cblx0XHRpZiAoIWNvbmZpZ3VyYXRpb25zQXJyYXlQb3NpdGlvbikge1xuXHRcdFx0Ly8gXCJjb25maWd1cmF0aW9uc1wiIGFycmF5IGRvZXNuJ3QgZXhpc3QuIEFkZCBpdCBoZXJlLlxuXHRcdFx0Y29uc3QgeyB0YWJTaXplLCBpbnNlcnRTcGFjZXMgfSA9IG1vZGVsLmdldE9wdGlvbnMoKTtcblx0XHRcdGNvbnN0IGVvbCA9IG1vZGVsLmdldEVPTCgpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IChiYXNlbmFtZShtb2RlbC51cmkuZnNQYXRoKSA9PT0gJ2xhdW5jaC5qc29uJykgP1xuXHRcdFx0XHRzZXRQcm9wZXJ0eShtb2RlbC5nZXRWYWx1ZSgpLCBbJ2NvbmZpZ3VyYXRpb25zJ10sIFtdLCB7IHRhYlNpemUsIGluc2VydFNwYWNlcywgZW9sIH0pWzBdIDpcblx0XHRcdFx0c2V0UHJvcGVydHkobW9kZWwuZ2V0VmFsdWUoKSwgWydsYXVuY2gnXSwgeyAnY29uZmlndXJhdGlvbnMnOiBbXSB9LCB7IHRhYlNpemUsIGluc2VydFNwYWNlcywgZW9sIH0pWzBdO1xuXHRcdFx0Y29uc3Qgc3RhcnRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQoZWRpdC5vZmZzZXQpO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHN0YXJ0UG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKGxpbmVOdW1iZXIsIHN0YXJ0UG9zaXRpb24uY29sdW1uLCBsaW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbRWRpdE9wZXJhdGlvbi5yZXBsYWNlKHJhbmdlLCBlZGl0LmNvbnRlbnQpXSwgKCkgPT4gbnVsbCk7XG5cdFx0XHQvLyBHbyB0aHJvdWdoIHRoZSBmaWxlIGFnYWluIHNpbmNlIHdlJ3ZlIGVkaXRlZCBpdFxuXHRcdFx0Z2V0Q29uZmlndXJhdGlvblBvc2l0aW9uKCk7XG5cdFx0fVxuXHRcdGlmICghY29uZmlndXJhdGlvbnNBcnJheVBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblxuXHRcdGNvbnN0IGluc2VydExpbmUgPSAocG9zaXRpb246IFBvc2l0aW9uKTogUHJvbWlzZTxhbnk+ID0+IHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZXJlIGFyZSBtb3JlIGNoYXJhY3RlcnMgb24gYSBsaW5lIGFmdGVyIGEgXCJjb25maWd1cmF0aW9uc1wiOiBbLCBpZiB5ZXMgZW50ZXIgYSBuZXdsaW5lXG5cdFx0XHRpZiAobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpID4gcG9zaXRpb24uY29sdW1uKSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbigoYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0XHRDb3JlRWRpdGluZ0NvbW1hbmRzLkxpbmVCcmVha0luc2VydC5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCB0aGlzLmVkaXRvciwgbnVsbCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0cmV0dXJuIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoSW5zZXJ0TGluZUFmdGVyQWN0aW9uLklEKTtcblx0XHR9O1xuXG5cdFx0YXdhaXQgaW5zZXJ0TGluZShjb25maWd1cmF0aW9uc0FycmF5UG9zaXRpb24pO1xuXHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2VkaXRvci5hY3Rpb24udHJpZ2dlclN1Z2dlc3QnKTtcblx0fVxuXG5cdC8vIElubGluZSBEZWNvcmF0aW9uc1xuXG5cdEBtZW1vaXplXG5cdHByaXZhdGUgZ2V0IHJlbW92ZUlubGluZVZhbHVlc1NjaGVkdWxlcigpOiBSdW5PbmNlU2NoZWR1bGVyIHtcblx0XHRyZXR1cm4gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZGlzcGxheWVkU3RvcmUuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5vbGREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0fSxcblx0XHRcdDEwMFxuXHRcdCk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRwcml2YXRlIGdldCB1cGRhdGVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIoKTogUnVuT25jZVNjaGVkdWxlciB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdHJldHVybiBuZXcgUnVuT25jZVNjaGVkdWxlcihcblx0XHRcdGFzeW5jICgpID0+IGF3YWl0IHRoaXMudXBkYXRlSW5saW5lVmFsdWVEZWNvcmF0aW9ucyh0aGlzLmRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5mb2N1c2VkU3RhY2tGcmFtZSksXG5cdFx0XHRtb2RlbCA/IHRoaXMuZGVib3VuY2VJbmZvLmdldChtb2RlbCkgOiBERUFGVUxUX0lOTElORV9ERUJPVU5DRV9ERUxBWVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbnMoc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdGNvbnN0IHZhcl92YWx1ZV9mb3JtYXQgPSAnezB9ID0gezF9Jztcblx0XHRjb25zdCBzZXBhcmF0b3IgPSAnLCAnO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGlubGluZVZhbHVlc1NldHRpbmcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmlubGluZVZhbHVlcztcblx0XHRjb25zdCBpbmxpbmVWYWx1ZXNUdXJuZWRPbiA9IGlubGluZVZhbHVlc1NldHRpbmcgPT09IHRydWUgfHwgaW5saW5lVmFsdWVzU2V0dGluZyA9PT0gJ29uJyB8fCAoaW5saW5lVmFsdWVzU2V0dGluZyA9PT0gJ2F1dG8nICYmIG1vZGVsICYmIHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lVmFsdWVzUHJvdmlkZXIuaGFzKG1vZGVsKSk7XG5cdFx0aWYgKCFpbmxpbmVWYWx1ZXNUdXJuZWRPbiB8fCAhbW9kZWwgfHwgIXN0YWNrRnJhbWUgfHwgbW9kZWwudXJpLnRvU3RyaW5nKCkgIT09IHN0YWNrRnJhbWUuc291cmNlLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRpZiAoIXRoaXMucmVtb3ZlSW5saW5lVmFsdWVzU2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5yZW1vdmVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlbW92ZUlubGluZVZhbHVlc1NjaGVkdWxlci5jYW5jZWwoKTtcblx0XHR0aGlzLmRpc3BsYXllZFN0b3JlLmNsZWFyKCk7XG5cblx0XHRjb25zdCB2aWV3UmFuZ2VzID0gdGhpcy5lZGl0b3IuZ2V0VmlzaWJsZVJhbmdlc1BsdXNWaWV3cG9ydEFib3ZlQmVsb3coKTtcblx0XHRsZXQgYWxsRGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdO1xuXG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5kaXNwbGF5ZWRTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cblx0XHRpZiAodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5pbmxpbmVWYWx1ZXNQcm92aWRlci5oYXMobW9kZWwpKSB7XG5cblx0XHRcdGNvbnN0IGZpbmRWYXJpYWJsZSA9IGFzeW5jIChfa2V5OiBzdHJpbmcsIGNhc2VTZW5zaXRpdmVMb29rdXA6IGJvb2xlYW4pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCBzY29wZXMgPSBhd2FpdCBzdGFja0ZyYW1lLmdldE1vc3RTcGVjaWZpY1Njb3BlcyhzdGFja0ZyYW1lLnJhbmdlKTtcblx0XHRcdFx0Y29uc3Qga2V5ID0gY2FzZVNlbnNpdGl2ZUxvb2t1cCA/IF9rZXkgOiBfa2V5LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2NvcGUgb2Ygc2NvcGVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFyaWFibGVzID0gYXdhaXQgc2NvcGUuZ2V0Q2hpbGRyZW4oKTtcblx0XHRcdFx0XHRjb25zdCBmb3VuZCA9IHZhcmlhYmxlcy5maW5kKHYgPT4gY2FzZVNlbnNpdGl2ZUxvb2t1cCA/ICh2Lm5hbWUgPT09IGtleSkgOiAodi5uYW1lLnRvTG93ZXJDYXNlKCkgPT09IGtleSkpO1xuXHRcdFx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZvdW5kLnZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgY3R4OiBJbmxpbmVWYWx1ZUNvbnRleHQgPSB7XG5cdFx0XHRcdGZyYW1lSWQ6IHN0YWNrRnJhbWUuZnJhbWVJZCxcblx0XHRcdFx0c3RvcHBlZExvY2F0aW9uOiBuZXcgUmFuZ2Uoc3RhY2tGcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRDb2x1bW4gKyAxLCBzdGFja0ZyYW1lLnJhbmdlLmVuZExpbmVOdW1iZXIsIHN0YWNrRnJhbWUucmFuZ2UuZW5kQ29sdW1uICsgMSlcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lVmFsdWVzUHJvdmlkZXIub3JkZXJlZChtb2RlbCkucmV2ZXJzZSgpO1xuXG5cdFx0XHRhbGxEZWNvcmF0aW9ucyA9IFtdO1xuXHRcdFx0Y29uc3QgbGluZURlY29yYXRpb25zID0gbmV3IE1hcDxudW1iZXIsIElubGluZVNlZ21lbnRbXT4oKTtcblxuXHRcdFx0Y29uc3QgcHJvbWlzZXMgPSBwcm92aWRlcnMuZmxhdE1hcChwcm92aWRlciA9PiB2aWV3UmFuZ2VzLm1hcChyYW5nZSA9PiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZUlubGluZVZhbHVlcyhtb2RlbCwgcmFuZ2UsIGN0eCwgY3RzLnRva2VuKSkudGhlbihhc3luYyAocmVzdWx0KSA9PiB7XG5cdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl2IG9mIHJlc3VsdCkge1xuXG5cdFx0XHRcdFx0XHRsZXQgdGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0c3dpdGNoIChpdi50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHRcdFx0XHRcdHRleHQgPSBpdi50ZXh0O1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRjYXNlICd2YXJpYWJsZSc6IHtcblx0XHRcdFx0XHRcdFx0XHRsZXQgdmEgPSBpdi52YXJpYWJsZU5hbWU7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCF2YSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChpdi5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0dmEgPSBsaW5lQ29udGVudC5zdWJzdHJpbmcoaXYucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCBpdi5yYW5nZS5lbmRDb2x1bW4gLSAxKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBmaW5kVmFyaWFibGUodmEsIGl2LmNhc2VTZW5zaXRpdmVMb29rdXApO1xuXHRcdFx0XHRcdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGV4dCA9IHN0cmluZ3MuZm9ybWF0KHZhcl92YWx1ZV9mb3JtYXQsIHZhLCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGNhc2UgJ2V4cHJlc3Npb24nOiB7XG5cdFx0XHRcdFx0XHRcdFx0bGV0IGV4cHIgPSBpdi5leHByZXNzaW9uO1xuXHRcdFx0XHRcdFx0XHRcdGlmICghZXhwcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChpdi5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXhwciA9IGxpbmVDb250ZW50LnN1YnN0cmluZyhpdi5yYW5nZS5zdGFydENvbHVtbiAtIDEsIGl2LnJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRpZiAoZXhwcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZXhwcmVzc2lvbiA9IG5ldyBFeHByZXNzaW9uKGV4cHIpO1xuXHRcdFx0XHRcdFx0XHRcdFx0YXdhaXQgZXhwcmVzc2lvbi5ldmFsdWF0ZShzdGFja0ZyYW1lLnRocmVhZC5zZXNzaW9uLCBzdGFja0ZyYW1lLCAnd2F0Y2gnLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChleHByZXNzaW9uLmF2YWlsYWJsZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0ZXh0ID0gc3RyaW5ncy5mb3JtYXQodmFyX3ZhbHVlX2Zvcm1hdCwgZXhwciwgZXhwcmVzc2lvbi52YWx1ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICh0ZXh0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmUgPSBpdi5yYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRcdGxldCBsaW5lU2VnbWVudHMgPSBsaW5lRGVjb3JhdGlvbnMuZ2V0KGxpbmUpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIWxpbmVTZWdtZW50cykge1xuXHRcdFx0XHRcdFx0XHRcdGxpbmVTZWdtZW50cyA9IFtdO1xuXHRcdFx0XHRcdFx0XHRcdGxpbmVEZWNvcmF0aW9ucy5zZXQobGluZSwgbGluZVNlZ21lbnRzKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoIWxpbmVTZWdtZW50cy5zb21lKGl2ID0+IGl2LnRleHQgPT09IHRleHQpKSB7XHQvLyBkZS1kdXBlXG5cdFx0XHRcdFx0XHRcdFx0bGluZVNlZ21lbnRzLnB1c2gobmV3IElubGluZVNlZ21lbnQoaXYucmFuZ2Uuc3RhcnRDb2x1bW4sIHRleHQpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0b25VbmV4cGVjdGVkRXh0ZXJuYWxFcnJvcihlcnIpO1xuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3Qgc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXG5cdFx0XHQvLyB1cGRhdGUgZGVib3VuY2UgaW5mb1xuXHRcdFx0dGhpcy51cGRhdGVJbmxpbmVWYWx1ZXNTY2hlZHVsZXIuZGVsYXkgPSB0aGlzLmRlYm91bmNlSW5mby51cGRhdGUobW9kZWwsIERhdGUubm93KCkgLSBzdGFydFRpbWUpO1xuXG5cdFx0XHQvLyBzb3J0IGxpbmUgc2VnbWVudHMgYW5kIGNvbmNhdGVuYXRlIHRoZW0gaW50byBhIGRlY29yYXRpb25cblxuXHRcdFx0bGluZURlY29yYXRpb25zLmZvckVhY2goKHNlZ21lbnRzLCBsaW5lKSA9PiB7XG5cdFx0XHRcdGlmIChzZWdtZW50cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VnbWVudHMgPSBzZWdtZW50cy5zb3J0KChhLCBiKSA9PiBhLmNvbHVtbiAtIGIuY29sdW1uKTtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gc2VnbWVudHMubWFwKHMgPT4gcy50ZXh0KS5qb2luKHNlcGFyYXRvcik7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdG9yV2lkdGggPSB0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkud2lkdGg7XG5cdFx0XHRcdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRcdFx0XHRjb25zdCB2aWV3cG9ydE1heENvbCA9IE1hdGguZmxvb3IoKGVkaXRvcldpZHRoIC0gNTApIC8gZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKTtcblx0XHRcdFx0XHRhbGxEZWNvcmF0aW9ucy5wdXNoKC4uLmNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbihsaW5lLCB0ZXh0LCAnZGVidWcnLCB1bmRlZmluZWQsIHZpZXdwb3J0TWF4Q29sKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIG9sZCBcIm9uZS1zaXplLWZpdHMtYWxsXCIgc3RyYXRlZ3lcblxuXHRcdFx0Y29uc3Qgc2NvcGVzID0gYXdhaXQgc3RhY2tGcmFtZS5nZXRNb3N0U3BlY2lmaWNTY29wZXMoc3RhY2tGcmFtZS5yYW5nZSk7XG5cdFx0XHRjb25zdCBzY29wZXNXaXRoVmFyaWFibGVzID0gYXdhaXQgUHJvbWlzZS5hbGwoc2NvcGVzLm1hcChhc3luYyBzY29wZSA9PlxuXHRcdFx0XHQoeyBzY29wZSwgdmFyaWFibGVzOiBhd2FpdCBzY29wZS5nZXRDaGlsZHJlbigpIH0pKSk7XG5cblx0XHRcdC8vIE1hcCBvZiBpbmxpbmUgdmFsdWVzIHBlciBsaW5lIHRoYXQncyBwb3B1bGF0ZWQgaW4gc2NvcGUgb3JkZXIsIGZyb21cblx0XHRcdC8vIG5hcnJvd2VzdCB0byB3aWRlc3QuIFRoaXMgaXMgZG9uZSB0byBhdm9pZCBkdXBsaWNhdGluZyB2YWx1ZXMgaWZcblx0XHRcdC8vIHRoZXkgYXBwZWFyIGluIG11bHRpcGxlIHNjb3BlcyBvciBhcmUgc2hhZG93ZWQgKCMxMjk3NzAsICMyMTczMjYpXG5cdFx0XHRjb25zdCB2YWx1ZXNQZXJMaW5lID0gbmV3IE1hcDwvKiBsaW5lICovbnVtYmVyLCBNYXA8LyogdmFyICovc3RyaW5nLCAvKiB2YWx1ZSAqLyBzdHJpbmc+PigpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHsgc2NvcGUsIHZhcmlhYmxlcyB9IG9mIHNjb3Blc1dpdGhWYXJpYWJsZXMpIHtcblx0XHRcdFx0bGV0IHNjb3BlUmFuZ2UgPSBuZXcgUmFuZ2UoMCwgMCwgc3RhY2tGcmFtZS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHRpZiAoc2NvcGUucmFuZ2UpIHtcblx0XHRcdFx0XHRzY29wZVJhbmdlID0gc2NvcGVSYW5nZS5zZXRTdGFydFBvc2l0aW9uKHNjb3BlLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgc2NvcGUucmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgb3duUmFuZ2VzID0gdmlld1Jhbmdlcy5tYXAociA9PiByLmludGVyc2VjdFJhbmdlcyhzY29wZVJhbmdlKSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuX3dvcmRUb0xpbmVOdW1iZXJzTWFwID8/PSBuZXcgV29yZHNUb0xpbmVOdW1iZXJzQ2FjaGUobW9kZWwpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIG93blJhbmdlcykge1xuXHRcdFx0XHRcdHRoaXMuX3dvcmRUb0xpbmVOdW1iZXJzTWFwLmVuc3VyZVJhbmdlUG9wdWxhdGVkKHJhbmdlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG1hcHBlZCA9IGNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbnNJbnNpZGVSYW5nZSh2YXJpYWJsZXMsIG93blJhbmdlcywgbW9kZWwsIHRoaXMuX3dvcmRUb0xpbmVOdW1iZXJzTWFwLnZhbHVlKTtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGxpbmUsIHZhcmlhYmxlcyB9IG9mIG1hcHBlZCkge1xuXHRcdFx0XHRcdGxldCB2YWx1ZXMgPSB2YWx1ZXNQZXJMaW5lLmdldChsaW5lKTtcblx0XHRcdFx0XHRpZiAoIXZhbHVlcykge1xuXHRcdFx0XHRcdFx0dmFsdWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRcdFx0XHRcdHZhbHVlc1BlckxpbmUuc2V0KGxpbmUsIHZhbHVlcyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCB7IG5hbWUsIHZhbHVlIH0gb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXZhbHVlcy5oYXMobmFtZSkpIHtcblx0XHRcdFx0XHRcdFx0dmFsdWVzLnNldChuYW1lLCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFsbERlY29yYXRpb25zID0gWy4uLnZhbHVlc1BlckxpbmUuZW50cmllcygpXS5mbGF0TWFwKChbbGluZSwgdmFsdWVzXSkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gWy4uLnZhbHVlc10ubWFwKChbbiwgdl0pID0+IGAke259ID0gJHt2fWApLmpvaW4oJywgJyk7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcldpZHRoID0gdGhpcy5lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLndpZHRoO1xuXHRcdFx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdFx0XHRjb25zdCB2aWV3cG9ydE1heENvbCA9IE1hdGguZmxvb3IoKGVkaXRvcldpZHRoIC0gNTApIC8gZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKTtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUlubGluZVZhbHVlRGVjb3JhdGlvbihsaW5lLCB0ZXh0LCAnZGVidWcnLCB1bmRlZmluZWQsIHZpZXdwb3J0TWF4Q29sKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB3b3JkIHdyYXAgaXMgb24sIGFwcGxpY2F0aW9uIG9mIGlubGluZSBkZWNvcmF0aW9ucyBtYXkgY2hhbmdlIHRoZSBzY3JvbGwgcG9zaXRpb24uXG5cdFx0Ly8gRW5zdXJlIHRoZSBjdXJzb3IgbWFpbnRhaW5zIGl0cyB2ZXJ0aWNhbCBwb3NpdGlvbiByZWxhdGl2ZSB0byB0aGUgdmlld3BvcnQgd2hlblxuXHRcdC8vIHdlIGFwcGx5IGRlY29yYXRpb25zLlxuXHRcdGxldCBwcmVzZXJ2ZVBvc2l0aW9uOiB7IHBvc2l0aW9uOiBQb3NpdGlvbjsgdG9wOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi53b3JkV3JhcCkgIT09ICdvZmYnKSB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCk7XG5cdFx0XHRpZiAocG9zaXRpb24gJiYgdGhpcy5lZGl0b3IuZ2V0VmlzaWJsZVJhbmdlcygpLnNvbWUociA9PiByLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSkge1xuXHRcdFx0XHRwcmVzZXJ2ZVBvc2l0aW9uID0geyBwb3NpdGlvbiwgdG9wOiB0aGlzLmVkaXRvci5nZXRUb3BGb3JQb3NpdGlvbihwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5vbGREZWNvcmF0aW9ucy5zZXQoYWxsRGVjb3JhdGlvbnMpO1xuXG5cdFx0aWYgKHByZXNlcnZlUG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IHRvcCA9IHRoaXMuZWRpdG9yLmdldFRvcEZvclBvc2l0aW9uKHByZXNlcnZlUG9zaXRpb24ucG9zaXRpb24ubGluZU51bWJlciwgcHJlc2VydmVQb3NpdGlvbi5wb3NpdGlvbi5jb2x1bW4pO1xuXHRcdFx0dGhpcy5lZGl0b3Iuc2V0U2Nyb2xsVG9wKHRoaXMuZWRpdG9yLmdldFNjcm9sbFRvcCgpIC0gKHByZXNlcnZlUG9zaXRpb24udG9wIC0gdG9wKSwgU2Nyb2xsVHlwZS5JbW1lZGlhdGUpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5ob3ZlcldpZGdldD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuY29uZmlndXJhdGlvbldpZGdldD8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuZXhjZXB0aW9uV2lkZ2V0Py5kaXNwb3NlKCk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UgPSBkaXNwb3NlKHRoaXMudG9EaXNwb3NlKTtcblx0fVxufVxuXG5jbGFzcyBXb3Jkc1RvTGluZU51bWJlcnNDYWNoZSB7XG5cdC8vIHdlIHVzZSB0aGlzIGFzIGFuIGFycmF5IG9mIGJpdHMgd2hlcmUgZWFjaCAxIGJpdCBpcyBhIGxpbmUgbnVtYmVyIHRoYXQncyBiZWVuIHBhcnNlZFxuXHRwcml2YXRlIHJlYWRvbmx5IGludGVydmFsczogVWludDhBcnJheTtcblx0cHVibGljIHJlYWRvbmx5IHZhbHVlID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcltdPigpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElUZXh0TW9kZWwpIHtcblx0XHR0aGlzLmludGVydmFscyA9IG5ldyBVaW50OEFycmF5KE1hdGguY2VpbChtb2RlbC5nZXRMaW5lQ291bnQoKSAvIDgpKTtcblx0fVxuXG5cdC8qKiBFbnN1cmVzIHRoYXQgdmFyaWFibGVzIG5hbWVzIGluIHRoZSBnaXZlbiByYW5nZSBoYXZlIGJlZW4gaWRlbnRpZmllZC4gKi9cblx0cHVibGljIGVuc3VyZVJhbmdlUG9wdWxhdGVkKHJhbmdlOiBSYW5nZSkge1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGxpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlcjsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRjb25zdCBiaW4gPSBsaW5lTnVtYmVyID4+IDM7ICAvKiBNYXRoLmZsb29yKGkgLyA4KSAqL1xuXHRcdFx0Y29uc3QgYml0ID0gMSA8PCAobGluZU51bWJlciAmIDBiMTExKTsgLyogMSA8PCAoaSAlIDgpICovXG5cdFx0XHRpZiAoISh0aGlzLmludGVydmFsc1tiaW5dICYgYml0KSkge1xuXHRcdFx0XHRnZXRXb3JkVG9MaW5lTnVtYmVyc01hcCh0aGlzLm1vZGVsLCBsaW5lTnVtYmVyLCB0aGlzLnZhbHVlKTtcblx0XHRcdFx0dGhpcy5pbnRlcnZhbHNbYmluXSB8PSBiaXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoXG5cdCdfZXhlY3V0ZUlubGluZVZhbHVlUHJvdmlkZXInLFxuXHRhc3luYyAoXG5cdFx0YWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsXG5cdFx0dXJpOiBVUkksXG5cdFx0aVJhbmdlOiBJUmFuZ2UsXG5cdFx0Y29udGV4dDogSW5saW5lVmFsdWVDb250ZXh0XG5cdCk6IFByb21pc2U8SW5saW5lVmFsdWVbXSB8IG51bGw+ID0+IHtcblx0XHRhc3NlcnRUeXBlKFVSSS5pc1VyaSh1cmkpKTtcblx0XHRhc3NlcnRUeXBlKFJhbmdlLmlzSVJhbmdlKGlSYW5nZSkpO1xuXG5cdFx0aWYgKCFjb250ZXh0IHx8IHR5cGVvZiBjb250ZXh0LmZyYW1lSWQgIT09ICdudW1iZXInIHx8ICFSYW5nZS5pc0lSYW5nZShjb250ZXh0LnN0b3BwZWRMb2NhdGlvbikpIHtcblx0XHRcdHRocm93IGlsbGVnYWxBcmd1bWVudCgnY29udGV4dCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gYWNjZXNzb3IuZ2V0KElNb2RlbFNlcnZpY2UpLmdldE1vZGVsKHVyaSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgaWxsZWdhbEFyZ3VtZW50KCd1cmknKTtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmxpZnQoaVJhbmdlKTtcblx0XHRjb25zdCB7IGlubGluZVZhbHVlc1Byb3ZpZGVyIH0gPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlKTtcblx0XHRjb25zdCBwcm92aWRlcnMgPSBpbmxpbmVWYWx1ZXNQcm92aWRlci5vcmRlcmVkKG1vZGVsKTtcblx0XHRjb25zdCBwcm92aWRlclJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm92aWRlcnMubWFwKHByb3ZpZGVyID0+IHByb3ZpZGVyLnByb3ZpZGVJbmxpbmVWYWx1ZXMobW9kZWwsIHJhbmdlLCBjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkpO1xuXHRcdHJldHVybiBwcm92aWRlclJlc3VsdHMuZmxhdCgpLmZpbHRlcihpc0RlZmluZWQpO1xuXHR9KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUIsdUJBQXVCO0FBQ3ZELFNBQVMsa0JBQWtCO0FBQzNCLFNBQXlCLDZCQUE2QjtBQUV0RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLGlDQUFpQztBQUMzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUE4QixtQkFBbUIs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QUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxDVTtBQTRzQmIsTUFBTSx3QkFBd0I7QUFBQSxFQUs3QixZQUE2QixPQUFtQjtBQUFuQjtBQUY3QixTQUFnQixRQUFRLG9CQUFJLElBQXNCO0FBR2pELFNBQUssWUFBWSxJQUFJLFdBQVcsS0FBSyxLQUFLLE1BQU0sYUFBYSxJQUFJLENBQUMsQ0FBQztBQUFBLEVBQ3BFO0FBQUE7QUFBQSxFQUdPLHFCQUFxQixPQUFjO0FBQ3pDLGFBQVMsYUFBYSxNQUFNLGlCQUFpQixjQUFjLE1BQU0sZUFBZSxjQUFjO0FBQzdGLFlBQU0sTUFBTSxjQUFjO0FBQzFCLFlBQU0sTUFBTSxNQUFNLGFBQWE7QUFDL0IsVUFBSSxFQUFFLEtBQUssVUFBVSxHQUFHLElBQUksTUFBTTtBQUNqQyxnQ0FBd0IsS0FBSyxPQUFPLFlBQVksS0FBSyxLQUFLO0FBQzFELGFBQUssVUFBVSxHQUFHLEtBQUs7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFHQSxpQkFBaUI7QUFBQSxFQUNoQjtBQUFBLEVBQ0EsT0FDQyxVQUNBLEtBQ0EsUUFDQSxZQUNtQztBQUNuQyxlQUFXLElBQUksTUFBTSxHQUFHLENBQUM7QUFDekIsZUFBVyxNQUFNLFNBQVMsTUFBTSxDQUFDO0FBRWpDLFFBQUksQ0FBQyxXQUFXLE9BQU8sUUFBUSxZQUFZLFlBQVksQ0FBQyxNQUFNLFNBQVMsUUFBUSxlQUFlLEdBQUc7QUFDaEcsWUFBTSxnQkFBZ0IsU0FBUztBQUFBLElBQ2hDO0FBRUEsVUFBTSxRQUFRLFNBQVMsSUFBSSxhQUFhLEVBQUUsU0FBUyxHQUFHO0FBQ3RELFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxnQkFBZ0IsS0FBSztBQUFBLElBQzVCO0FBRUEsVUFBTSxRQUFRLE1BQU0sS0FBSyxNQUFNO0FBQy9CLFVBQU0sRUFBRSxxQkFBcUIsSUFBSSxTQUFTLElBQUksd0JBQXdCO0FBQ3RFLFVBQU0sWUFBWSxxQkFBcUIsUUFBUSxLQUFLO0FBQ3BELFVBQU0sa0JBQWtCLE1BQU0sUUFBUSxJQUFJLFVBQVUsSUFBSSxjQUFZLFNBQVMsb0JBQW9CLE9BQU8sT0FBTyxTQUFTLGtCQUFrQixJQUFJLENBQUMsQ0FBQztBQUNoSixXQUFPLGdCQUFnQixLQUFLLEVBQUUsT0FBTyxTQUFTO0FBQUEsRUFDL0M7QUFBQzsiLAogICJuYW1lcyI6IFsic3RhbmRhcmRLZXlib2FyZEV2ZW50IiwgIml2IiwgInZhcmlhYmxlcyJdCn0K
