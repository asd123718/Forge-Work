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
import { createTrustedTypesPolicy } from "../../../../../../base/browser/trustedTypes.js";
import { renderIcon } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, constObservable, derived, derivedOpts, observableSignalFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import * as strings from "../../../../../../base/common/strings.js";
import { applyFontInfo } from "../../../../../browser/config/domFontInfo.js";
import { ContentWidgetPositionPreference, MouseTargetType } from "../../../../../browser/editorBrowser.js";
import { observableCodeEditor } from "../../../../../browser/observableCodeEditor.js";
import { EditorFontLigatures, EditorOption } from "../../../../../common/config/editorOptions.js";
import { StringEdit, StringReplacement } from "../../../../../common/core/edits/stringEdit.js";
import { Position } from "../../../../../common/core/position.js";
import { Range } from "../../../../../common/core/range.js";
import { StringBuilder } from "../../../../../common/core/stringBuilder.js";
import { ILanguageService } from "../../../../../common/languages/language.js";
import { InjectedTextCursorStops, PositionAffinity } from "../../../../../common/model.js";
import { LineTokens } from "../../../../../common/tokens/lineTokens.js";
import { LineDecoration } from "../../../../../common/viewLayout/lineDecorations.js";
import { RenderLineInput, renderViewLine } from "../../../../../common/viewLayout/viewLineRenderer.js";
import { GhostTextReplacement } from "../../model/ghostText.js";
import { RangeSingleLine } from "../../../../../common/core/ranges/rangeSingleLine.js";
import { ColumnRange } from "../../../../../common/core/ranges/columnRange.js";
import { addDisposableListener, getWindow, isHTMLElement, n } from "../../../../../../base/browser/dom.js";
import "./ghostTextView.css";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { CodeEditorWidget } from "../../../../../browser/widget/codeEditor/codeEditorWidget.js";
import { TokenWithTextArray } from "../../../../../common/tokens/tokenWithTextArray.js";
import { InlineCompletionViewData } from "../inlineEdits/inlineEditsViewInterface.js";
import { InlineDecorationType } from "../../../../../common/viewModel/inlineDecorations.js";
import { equals, sum } from "../../../../../../base/common/arrays.js";
import { equalsIfDefinedC, thisEqualsC } from "../../../../../../base/common/equals.js";
class GhostTextWidgetWarning {
  constructor(icon = Codicon.warning) {
    this.icon = icon;
  }
  static from(warning) {
    if (!warning) {
      return void 0;
    }
    return new GhostTextWidgetWarning(warning.icon);
  }
}
const USE_SQUIGGLES_FOR_WARNING = true;
const GHOST_TEXT_CLASS_NAME = "ghost-text";
let GhostTextView = class extends Disposable {
  constructor(_editor, _data, options, _languageService) {
    super();
    this._editor = _editor;
    this._data = _data;
    this._languageService = _languageService;
    this._isDisposed = observableValue(this, false);
    this._warningState = derived((reader) => {
      const model = this._data.read(reader);
      const warning = model?.warning;
      if (!model || !warning) {
        return void 0;
      }
      const gt = model.ghostText;
      return { lineNumber: gt.lineNumber, position: new Position(gt.lineNumber, gt.parts[0].column), icon: warning.icon };
    });
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._nonWhitespaceCount = derived(this, (reader) => {
      const data = this._data.read(reader);
      if (!data) {
        return void 0;
      }
      const ghostText = data.ghostText;
      const allText = ghostText.parts.map((p) => p.lines.map((l) => l.line).join("")).join("");
      return allText.replace(/\s/g, "").length;
    });
    this._extraClassNames = derived(this, (reader) => {
      const extraClasses = this._extraClasses.slice();
      if (USE_SQUIGGLES_FOR_WARNING && this._warningState.read(reader)) {
        extraClasses.push("warning");
      }
      const nonWhitespaceCount = this._nonWhitespaceCount.read(reader);
      if (this._highlightShortText && nonWhitespaceCount && nonWhitespaceCount < 3) {
        extraClasses.push("short-text");
      } else if (this._useSyntaxHighlighting.read(reader)) {
        extraClasses.push("syntax-highlighted");
      }
      const extraClassNames = extraClasses.map((c) => ` ${c}`).join("");
      return extraClassNames;
    });
    this._state = derived(this, (reader) => {
      if (this._isDisposed.read(reader)) {
        return void 0;
      }
      const props = this._data.read(reader);
      if (!props) {
        return void 0;
      }
      const textModel = this._editorObs.model.read(reader);
      if (!textModel) {
        return void 0;
      }
      const ghostText = props.ghostText;
      const replacedRange = ghostText instanceof GhostTextReplacement ? ghostText.columnRange : void 0;
      const syntaxHighlightingEnabled = this._useSyntaxHighlighting.read(reader);
      const extraClassNames = this._extraClassNames.read(reader);
      const { inlineTexts, additionalLines, hiddenRange, additionalLinesOriginalSuffix } = computeGhostTextViewData(ghostText, textModel, GHOST_TEXT_CLASS_NAME + extraClassNames);
      const currentLine = textModel.getLineContent(ghostText.lineNumber);
      const edit = new StringEdit(inlineTexts.map((t) => StringReplacement.insert(t.column - 1, t.text)));
      const tokens = syntaxHighlightingEnabled ? textModel.tokenization.tokenizeLinesAt(ghostText.lineNumber, [edit.apply(currentLine), ...additionalLines.map((l) => l.content)]) : void 0;
      const newRanges = edit.getNewRanges();
      const inlineTextsWithTokens = inlineTexts.map((t, idx) => ({ ...t, tokens: tokens?.[0]?.getTokensInRange(newRanges[idx]) }));
      const tokenizedAdditionalLines = additionalLines.map((l, idx) => {
        let content = tokens?.[idx + 1] ?? LineTokens.createEmpty(l.content, this._languageService.languageIdCodec);
        if (idx === additionalLines.length - 1 && additionalLinesOriginalSuffix) {
          const t = TokenWithTextArray.fromLineTokens(textModel.tokenization.getLineTokens(additionalLinesOriginalSuffix.lineNumber));
          const existingContent = t.slice(additionalLinesOriginalSuffix.columnRange.toZeroBasedOffsetRange());
          content = TokenWithTextArray.fromLineTokens(content).append(existingContent).toLineTokens(content.languageIdCodec);
        }
        return new LineData(
          content,
          l.decorations
        );
      });
      const cursorColumn = this._editor.getSelection()?.getStartPosition().column;
      const disjointInlineTexts = inlineTextsWithTokens.filter((inline) => inline.text !== "");
      const hasInsertionOnCurrentLine = disjointInlineTexts.length !== 0;
      const telemetryViewData = new InlineCompletionViewData(
        (hasInsertionOnCurrentLine ? disjointInlineTexts[0].column : 1) - cursorColumn,
        hasInsertionOnCurrentLine ? 0 : additionalLines.findIndex((line) => line.content !== "") + 1,
        hasInsertionOnCurrentLine ? 1 : 0,
        additionalLines.length + (hasInsertionOnCurrentLine ? 1 : 0),
        0,
        sum(disjointInlineTexts.map((inline) => inline.text.length)) + sum(tokenizedAdditionalLines.map((line) => line.content.getTextLength())),
        disjointInlineTexts.length + (additionalLines.length > 0 ? 1 : 0),
        disjointInlineTexts.length > 1 && tokenizedAdditionalLines.length === 0 ? disjointInlineTexts.every((inline) => inline.text === disjointInlineTexts[0].text) : void 0
      );
      return {
        replacedRange,
        inlineTexts: inlineTextsWithTokens,
        additionalLines: tokenizedAdditionalLines,
        hiddenRange,
        lineNumber: ghostText.lineNumber,
        additionalReservedLineCount: this._minReservedLineCount.read(reader),
        targetTextModel: textModel,
        syntaxHighlightingEnabled,
        telemetryViewData,
        handleInlineCompletionShown: props.handleInlineCompletionShown
      };
    });
    this._decorations = derived(this, (reader) => {
      const uiState = this._state.read(reader);
      if (!uiState) {
        return [];
      }
      const decorations = [];
      const extraClassNames = this._extraClassNames.read(reader);
      if (uiState.replacedRange) {
        decorations.push({
          range: uiState.replacedRange.toRange(uiState.lineNumber),
          options: { inlineClassName: "inline-completion-text-to-replace" + extraClassNames, description: "GhostTextReplacement" }
        });
      }
      if (uiState.hiddenRange) {
        decorations.push({
          range: uiState.hiddenRange.toRange(uiState.lineNumber),
          options: { inlineClassName: "ghost-text-hidden", description: "ghost-text-hidden" }
        });
      }
      for (const p of uiState.inlineTexts) {
        let inlineExtraClassNames = "";
        if (this._highlightShortText && p.text.length < 5) {
          inlineExtraClassNames += " short-text";
        }
        decorations.push({
          range: Range.fromPositions(new Position(uiState.lineNumber, p.column)),
          options: {
            description: "ghost-text-decoration",
            after: {
              content: p.text,
              tokens: p.tokens,
              inlineClassName: (p.preview ? "ghost-text-decoration-preview" : "ghost-text-decoration") + (this._isClickable ? " clickable" : "") + extraClassNames + inlineExtraClassNames + p.lineDecorations.map((d) => " " + d.className).join(" "),
              // TODO: take the ranges into account for line decorations
              cursorStops: InjectedTextCursorStops.Left,
              attachedData: new GhostTextAttachedData(this)
            },
            showIfCollapsed: true
          }
        });
      }
      return decorations;
    });
    this.isHovered = derived(this, (reader) => {
      if (this._isDisposed.read(reader)) {
        return false;
      }
      return this._isInlineTextHovered.read(reader) || this._additionalLinesWidget.isHovered.read(reader);
    });
    this.height = derived(this, (reader) => {
      const lineHeight = this._editorObs.getOption(EditorOption.lineHeight).read(reader);
      return lineHeight + (this._additionalLinesWidget.viewZoneHeight.read(reader) ?? 0);
    });
    this._extraClasses = options.extraClasses ?? [];
    this._isClickable = options.isClickable ?? false;
    this._shouldKeepCursorStable = options.shouldKeepCursorStable ?? false;
    this._minReservedLineCount = options.minReservedLineCount ?? constObservable(0);
    this._useSyntaxHighlighting = options.useSyntaxHighlighting ?? constObservable(true);
    this._highlightShortText = options.highlightShortSuggestions ?? false;
    this._editorObs = observableCodeEditor(this._editor);
    this._additionalLinesWidget = this._register(
      new AdditionalLinesWidget(
        this._editor,
        derivedOpts({ owner: this, equalsFn: equalsIfDefinedC(thisEqualsC()) }, (reader) => {
          const uiState = this._state.read(reader);
          return uiState ? new AdditionalLinesData(
            uiState.lineNumber,
            uiState.additionalLines,
            uiState.additionalReservedLineCount
          ) : void 0;
        }),
        this._shouldKeepCursorStable,
        this._isClickable
      )
    );
    this._isInlineTextHovered = this._editorObs.isTargetHovered(
      (p) => p.target.type === MouseTargetType.CONTENT_TEXT && p.target.detail.injectedText?.options.attachedData instanceof GhostTextAttachedData && p.target.detail.injectedText.options.attachedData.owner === this,
      this._store
    );
    this._register(toDisposable(() => {
      this._isDisposed.set(true, void 0);
    }));
    this._register(this._editorObs.setDecorations(this._decorations));
    if (this._isClickable) {
      this._register(this._additionalLinesWidget.onDidClick((e) => this._onDidClick.fire(e)));
      this._register(this._editor.onMouseUp((e) => {
        if (e.target.type !== MouseTargetType.CONTENT_TEXT) {
          return;
        }
        const a = e.target.detail.injectedText?.options.attachedData;
        if (a instanceof GhostTextAttachedData && a.owner === this) {
          this._onDidClick.fire(e.event);
        }
      }));
    }
    this._register(autorun((reader) => {
      const state = this._state.read(reader);
      state?.handleInlineCompletionShown(state.telemetryViewData);
    }));
    this._register(autorunWithStore((reader, store) => {
      if (USE_SQUIGGLES_FOR_WARNING) {
        return;
      }
      const state = this._warningState.read(reader);
      if (!state) {
        return;
      }
      const lineHeight = this._editorObs.getOption(EditorOption.lineHeight);
      store.add(this._editorObs.createContentWidget({
        position: constObservable({
          position: new Position(state.lineNumber, Number.MAX_SAFE_INTEGER),
          preference: [ContentWidgetPositionPreference.EXACT],
          positionAffinity: PositionAffinity.Right
        }),
        allowEditorOverflow: false,
        domNode: n.div({
          class: "ghost-text-view-warning-widget",
          style: {
            width: lineHeight,
            height: lineHeight,
            marginLeft: 4,
            color: "orange"
          },
          ref: (dom) => {
            dom.ghostTextViewWarningWidgetData = { range: Range.fromPositions(state.position) };
          }
        }, [
          n.div(
            {
              class: "ghost-text-view-warning-widget-icon",
              style: {
                width: "100%",
                height: "100%",
                display: "flex",
                alignContent: "center",
                alignItems: "center"
              }
            },
            [renderIcon(state.icon)]
          )
        ]).keepUpdated(store).element
      }));
    }));
  }
  static getWarningWidgetContext(domNode) {
    const data = domNode.ghostTextViewWarningWidgetData;
    if (data) {
      return data;
    } else if (domNode.parentElement) {
      return this.getWarningWidgetContext(domNode.parentElement);
    }
    return void 0;
  }
  ownsViewZone(viewZoneId) {
    return this._additionalLinesWidget.viewZoneId === viewZoneId;
  }
};
GhostTextView = __decorateClass([
  __decorateParam(3, ILanguageService)
], GhostTextView);
class GhostTextAttachedData {
  constructor(owner) {
    this.owner = owner;
  }
}
function computeGhostTextViewData(ghostText, textModel, ghostTextClassName) {
  const inlineTexts = [];
  const additionalLines = [];
  function addToAdditionalLines(ghLines, className) {
    if (additionalLines.length > 0) {
      const lastLine = additionalLines[additionalLines.length - 1];
      if (className) {
        lastLine.decorations.push(new LineDecoration(
          lastLine.content.length + 1,
          lastLine.content.length + 1 + ghLines[0].line.length,
          className,
          InlineDecorationType.Regular
        ));
      }
      lastLine.content += ghLines[0].line;
      ghLines = ghLines.slice(1);
    }
    for (const ghLine of ghLines) {
      additionalLines.push({
        content: ghLine.line,
        decorations: className ? [new LineDecoration(
          1,
          ghLine.line.length + 1,
          className,
          InlineDecorationType.Regular
        ), ...ghLine.lineDecorations] : [...ghLine.lineDecorations]
      });
    }
  }
  const textBufferLine = textModel.getLineContent(ghostText.lineNumber);
  let hiddenTextStartColumn = void 0;
  let lastIdx = 0;
  for (const part of ghostText.parts) {
    let ghLines = part.lines;
    if (hiddenTextStartColumn === void 0) {
      inlineTexts.push({ column: part.column, text: ghLines[0].line, preview: part.preview, lineDecorations: ghLines[0].lineDecorations });
      ghLines = ghLines.slice(1);
    } else {
      addToAdditionalLines([{ line: textBufferLine.substring(lastIdx, part.column - 1), lineDecorations: [] }], void 0);
    }
    if (ghLines.length > 0) {
      addToAdditionalLines(ghLines, ghostTextClassName);
      if (hiddenTextStartColumn === void 0 && part.column <= textBufferLine.length) {
        hiddenTextStartColumn = part.column;
      }
    }
    lastIdx = part.column - 1;
  }
  let additionalLinesOriginalSuffix = void 0;
  if (hiddenTextStartColumn !== void 0) {
    additionalLinesOriginalSuffix = new RangeSingleLine(ghostText.lineNumber, new ColumnRange(lastIdx + 1, textBufferLine.length + 1));
  }
  const hiddenRange = hiddenTextStartColumn !== void 0 ? new ColumnRange(hiddenTextStartColumn, textBufferLine.length + 1) : void 0;
  return {
    inlineTexts,
    additionalLines,
    hiddenRange,
    additionalLinesOriginalSuffix
  };
}
class AdditionalLinesData {
  constructor(lineNumber, additionalLines, minReservedLineCount) {
    this.lineNumber = lineNumber;
    this.additionalLines = additionalLines;
    this.minReservedLineCount = minReservedLineCount;
  }
  equals(other) {
    if (this.lineNumber !== other.lineNumber) {
      return false;
    }
    if (this.minReservedLineCount !== other.minReservedLineCount) {
      return false;
    }
    return equals(this.additionalLines, other.additionalLines, thisEqualsC());
  }
}
class AdditionalLinesWidget extends Disposable {
  constructor(_editor, _lines, _shouldKeepCursorStable, _isClickable) {
    super();
    this._editor = _editor;
    this._lines = _lines;
    this._shouldKeepCursorStable = _shouldKeepCursorStable;
    this._isClickable = _isClickable;
    this._viewZoneHeight = observableValue("viewZoneHeight", void 0);
    this.editorOptionsChanged = observableSignalFromEvent("editorOptionChanged", Event.filter(
      this._editor.onDidChangeConfiguration,
      (e) => e.hasChanged(EditorOption.disableMonospaceOptimizations) || e.hasChanged(EditorOption.stopRenderingLineAfter) || e.hasChanged(EditorOption.renderWhitespace) || e.hasChanged(EditorOption.renderControlCharacters) || e.hasChanged(EditorOption.fontLigatures) || e.hasChanged(EditorOption.fontInfo) || e.hasChanged(EditorOption.lineHeight)
    ));
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._viewZoneListener = this._register(new MutableDisposable());
    this.isHovered = observableCodeEditor(this._editor).isTargetHovered(
      (p) => isTargetGhostText(p.target.element),
      this._store
    );
    this.hasBeenAccepted = false;
    if (this._editor instanceof CodeEditorWidget && this._shouldKeepCursorStable) {
      this._register(this._editor.onBeforeExecuteEdit((e) => this.hasBeenAccepted = e.source === "inlineSuggestion.accept"));
    }
    this._register(autorun((reader) => {
      const lines = this._lines.read(reader);
      this.editorOptionsChanged.read(reader);
      if (lines) {
        this.hasBeenAccepted = false;
        this.updateLines(lines.lineNumber, lines.additionalLines, lines.minReservedLineCount);
      } else {
        this.clear();
      }
    }));
  }
  get viewZoneId() {
    return this._viewZoneInfo?.viewZoneId;
  }
  get viewZoneHeight() {
    return this._viewZoneHeight;
  }
  dispose() {
    super.dispose();
    this.clear();
  }
  clear() {
    this._viewZoneListener.clear();
    this._editor.changeViewZones((changeAccessor) => {
      this.removeActiveViewZone(changeAccessor);
    });
  }
  updateLines(lineNumber, additionalLines, minReservedLineCount) {
    const textModel = this._editor.getModel();
    if (!textModel) {
      return;
    }
    const { tabSize } = textModel.getOptions();
    observableCodeEditor(this._editor).transaction((_) => {
      this._editor.changeViewZones((changeAccessor) => {
        const store = new DisposableStore();
        this.removeActiveViewZone(changeAccessor);
        const heightInLines = Math.max(additionalLines.length, minReservedLineCount);
        if (heightInLines > 0) {
          const domNode = document.createElement("div");
          renderLines(domNode, tabSize, additionalLines, this._editor.getOptions(), this._isClickable);
          if (this._isClickable) {
            store.add(addDisposableListener(domNode, "mousedown", (e) => {
              e.preventDefault();
            }));
            store.add(addDisposableListener(domNode, "click", (e) => {
              if (isTargetGhostText(e.target)) {
                this._onDidClick.fire(new StandardMouseEvent(getWindow(e), e));
              }
            }));
          }
          this.addViewZone(changeAccessor, lineNumber, heightInLines, domNode);
        }
        this._viewZoneListener.value = store;
      });
    });
  }
  addViewZone(changeAccessor, afterLineNumber, heightInLines, domNode) {
    const id = changeAccessor.addZone({
      afterLineNumber,
      heightInLines,
      domNode,
      afterColumnAffinity: PositionAffinity.Right,
      onComputedHeight: (height) => {
        this._viewZoneHeight.set(height, void 0);
      }
    });
    this.keepCursorStable(afterLineNumber, heightInLines);
    this._viewZoneInfo = { viewZoneId: id, heightInLines, lineNumber: afterLineNumber };
  }
  removeActiveViewZone(changeAccessor) {
    if (this._viewZoneInfo) {
      changeAccessor.removeZone(this._viewZoneInfo.viewZoneId);
      if (!this.hasBeenAccepted) {
        this.keepCursorStable(this._viewZoneInfo.lineNumber, -this._viewZoneInfo.heightInLines);
      }
      this._viewZoneInfo = void 0;
      this._viewZoneHeight.set(void 0, void 0);
    }
  }
  keepCursorStable(lineNumber, heightInLines) {
    if (!this._shouldKeepCursorStable) {
      return;
    }
    const cursorLineNumber = this._editor.getSelection()?.getStartPosition()?.lineNumber;
    if (cursorLineNumber !== void 0 && lineNumber < cursorLineNumber) {
      this._editor.setScrollTop(this._editor.getScrollTop() + heightInLines * this._editor.getOption(EditorOption.lineHeight));
    }
  }
}
function isTargetGhostText(target) {
  return isHTMLElement(target) && target.classList.contains(GHOST_TEXT_CLASS_NAME);
}
class LineData {
  constructor(content, decorations) {
    this.content = content;
    this.decorations = decorations;
  }
  equals(other) {
    if (!this.content.equals(other.content)) {
      return false;
    }
    return LineDecoration.equalsArr(this.decorations, other.decorations);
  }
}
function renderLines(domNode, tabSize, lines, opts, isClickable) {
  const disableMonospaceOptimizations = opts.get(EditorOption.disableMonospaceOptimizations);
  const stopRenderingLineAfter = opts.get(EditorOption.stopRenderingLineAfter);
  const renderWhitespace = "none";
  const renderControlCharacters = opts.get(EditorOption.renderControlCharacters);
  const fontLigatures = opts.get(EditorOption.fontLigatures);
  const fontInfo = opts.get(EditorOption.fontInfo);
  const lineHeight = opts.get(EditorOption.lineHeight);
  let classNames = "suggest-preview-text";
  if (isClickable) {
    classNames += " clickable";
  }
  const sb = new StringBuilder(1e4);
  sb.appendString(`<div class="${classNames}">`);
  for (let i = 0, len = lines.length; i < len; i++) {
    const lineData = lines[i];
    const lineTokens = lineData.content;
    sb.appendString('<div class="view-line');
    sb.appendString('" style="top:');
    sb.appendString(String(i * lineHeight));
    sb.appendString('px;width:1000000px;">');
    const line = lineTokens.getLineContent();
    const isBasicASCII = strings.isBasicASCII(line);
    const containsRTL = strings.containsRTL(line);
    renderViewLine(new RenderLineInput(
      fontInfo.isMonospace && !disableMonospaceOptimizations,
      fontInfo.canUseHalfwidthRightwardsArrow,
      line,
      false,
      isBasicASCII,
      containsRTL,
      0,
      lineTokens,
      lineData.decorations.slice(),
      tabSize,
      0,
      fontInfo.spaceWidth,
      fontInfo.middotWidth,
      fontInfo.wsmiddotWidth,
      stopRenderingLineAfter,
      renderWhitespace,
      renderControlCharacters,
      fontLigatures !== EditorFontLigatures.OFF,
      null,
      null,
      0
    ), sb);
    sb.appendString("</div>");
  }
  sb.appendString("</div>");
  applyFontInfo(domNode, fontInfo);
  const html = sb.build();
  const trustedhtml = ttPolicy ? ttPolicy.createHTML(html) : html;
  domNode.innerHTML = trustedhtml;
}
const ttPolicy = createTrustedTypesPolicy("editorGhostText", { createHTML: (value) => value });
export {
  AdditionalLinesWidget,
  GhostTextView,
  GhostTextWidgetWarning,
  LineData,
  ttPolicy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFx2aWV3XFxnaG9zdFRleHRcXGdob3N0VGV4dFZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVUcnVzdGVkVHlwZXNQb2xpY3kgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdHJ1c3RlZFR5cGVzLmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBhdXRvcnVuV2l0aFN0b3JlLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBhcHBseUZvbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9jb25maWcvZG9tRm9udEluZm8uanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0UG9zaXRpb24sIElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yLCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvckZvbnRMaWdhdHVyZXMsIEVkaXRvck9wdGlvbiwgSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdHJpbmdFZGl0LCBTdHJpbmdSZXBsYWNlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFN0cmluZ0J1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9zdHJpbmdCdWlsZGVyLmpzJztcbmltcG9ydCB7IEljb25QYXRoLCBJbmxpbmVDb21wbGV0aW9uV2FybmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsLCBJbmplY3RlZFRleHRDdXJzb3JTdG9wcywgUG9zaXRpb25BZmZpbml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBMaW5lVG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IExpbmVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvbGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IFJlbmRlckxpbmVJbnB1dCwgcmVuZGVyVmlld0xpbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEdob3N0VGV4dCwgR2hvc3RUZXh0UmVwbGFjZW1lbnQsIElHaG9zdFRleHRMaW5lIH0gZnJvbSAnLi4vLi4vbW9kZWwvZ2hvc3RUZXh0LmpzJztcbmltcG9ydCB7IFJhbmdlU2luZ2xlTGluZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9yYW5nZVNpbmdsZUxpbmUuanMnO1xuaW1wb3J0IHsgQ29sdW1uUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvY29sdW1uUmFuZ2UuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRXaW5kb3csIGlzSFRNTEVsZW1lbnQsIG4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAnLi9naG9zdFRleHRWaWV3LmNzcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCwgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBUb2tlbldpdGhUZXh0QXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdG9rZW5zL3Rva2VuV2l0aFRleHRBcnJheS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEgfSBmcm9tICcuLi9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgSW5saW5lRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL2lubGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IGVxdWFscywgc3VtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGVxdWFsc0lmRGVmaW5lZEMsIElFcXVhdGFibGUsIHRoaXNFcXVhbHNDIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJR2hvc3RUZXh0V2lkZ2V0RGF0YSB7XG5cdHJlYWRvbmx5IGdob3N0VGV4dDogR2hvc3RUZXh0IHwgR2hvc3RUZXh0UmVwbGFjZW1lbnQ7XG5cdHJlYWRvbmx5IHdhcm5pbmc6IEdob3N0VGV4dFdpZGdldFdhcm5pbmcgfCB1bmRlZmluZWQ7XG5cdGhhbmRsZUlubGluZUNvbXBsZXRpb25TaG93bih2aWV3RGF0YTogSW5saW5lQ29tcGxldGlvblZpZXdEYXRhKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEdob3N0VGV4dFdpZGdldFdhcm5pbmcge1xuXHRwdWJsaWMgc3RhdGljIGZyb20od2FybmluZzogSW5saW5lQ29tcGxldGlvbldhcm5pbmcgfCB1bmRlZmluZWQpOiBHaG9zdFRleHRXaWRnZXRXYXJuaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXdhcm5pbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgR2hvc3RUZXh0V2lkZ2V0V2FybmluZyh3YXJuaW5nLmljb24pO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGljb246IEljb25QYXRoID0gQ29kaWNvbi53YXJuaW5nLFxuXHQpIHsgfVxufVxuXG5jb25zdCBVU0VfU1FVSUdHTEVTX0ZPUl9XQVJOSU5HID0gdHJ1ZTtcbmNvbnN0IEdIT1NUX1RFWFRfQ0xBU1NfTkFNRSA9ICdnaG9zdC10ZXh0JztcblxuZXhwb3J0IGNsYXNzIEdob3N0VGV4dFZpZXcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNEaXNwb3NlZCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck9icztcblx0cHJpdmF0ZSByZWFkb25seSBfd2FybmluZ1N0YXRlID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZGF0YS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgd2FybmluZyA9IG1vZGVsPy53YXJuaW5nO1xuXHRcdGlmICghbW9kZWwgfHwgIXdhcm5pbmcpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdGNvbnN0IGd0ID0gbW9kZWwuZ2hvc3RUZXh0O1xuXHRcdHJldHVybiB7IGxpbmVOdW1iZXI6IGd0LmxpbmVOdW1iZXIsIHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oZ3QubGluZU51bWJlciwgZ3QucGFydHNbMF0uY29sdW1uKSwgaWNvbjogd2FybmluZy5pY29uIH07XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTW91c2VFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENsaWNrID0gdGhpcy5fb25EaWRDbGljay5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRyYUNsYXNzZXM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0NsaWNrYWJsZTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hvdWxkS2VlcEN1cnNvclN0YWJsZTogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfbWluUmVzZXJ2ZWRMaW5lQ291bnQ6IElPYnNlcnZhYmxlPG51bWJlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VzZVN5bnRheEhpZ2hsaWdodGluZzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hpZ2hsaWdodFNob3J0VGV4dDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RhdGE6IElPYnNlcnZhYmxlPElHaG9zdFRleHRXaWRnZXREYXRhIHwgdW5kZWZpbmVkPixcblx0XHRvcHRpb25zOiB7XG5cdFx0XHRleHRyYUNsYXNzZXM/OiByZWFkb25seSBzdHJpbmdbXTsgLy8gVE9ET0BiZW5pYmVuaiBpbXByb3ZlXG5cdFx0XHRpc0NsaWNrYWJsZT86IGJvb2xlYW47XG5cdFx0XHRzaG91bGRLZWVwQ3Vyc29yU3RhYmxlPzogYm9vbGVhbjtcblx0XHRcdG1pblJlc2VydmVkTGluZUNvdW50PzogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0XHRcdHVzZVN5bnRheEhpZ2hsaWdodGluZz86IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRcdFx0aGlnaGxpZ2h0U2hvcnRTdWdnZXN0aW9ucz86IGJvb2xlYW47XG5cdFx0fSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2V4dHJhQ2xhc3NlcyA9IG9wdGlvbnMuZXh0cmFDbGFzc2VzID8/IFtdO1xuXHRcdHRoaXMuX2lzQ2xpY2thYmxlID0gb3B0aW9ucy5pc0NsaWNrYWJsZSA/PyBmYWxzZTtcblx0XHR0aGlzLl9zaG91bGRLZWVwQ3Vyc29yU3RhYmxlID0gb3B0aW9ucy5zaG91bGRLZWVwQ3Vyc29yU3RhYmxlID8/IGZhbHNlO1xuXHRcdHRoaXMuX21pblJlc2VydmVkTGluZUNvdW50ID0gb3B0aW9ucy5taW5SZXNlcnZlZExpbmVDb3VudCA/PyBjb25zdE9ic2VydmFibGUoMCk7XG5cdFx0dGhpcy5fdXNlU3ludGF4SGlnaGxpZ2h0aW5nID0gb3B0aW9ucy51c2VTeW50YXhIaWdobGlnaHRpbmcgPz8gY29uc3RPYnNlcnZhYmxlKHRydWUpO1xuXHRcdHRoaXMuX2hpZ2hsaWdodFNob3J0VGV4dCA9IG9wdGlvbnMuaGlnaGxpZ2h0U2hvcnRTdWdnZXN0aW9ucyA/PyBmYWxzZTtcblxuXHRcdHRoaXMuX2VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcik7XG5cdFx0dGhpcy5fYWRkaXRpb25hbExpbmVzV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRuZXcgQWRkaXRpb25hbExpbmVzV2lkZ2V0KFxuXHRcdFx0XHR0aGlzLl9lZGl0b3IsXG5cdFx0XHRcdGRlcml2ZWRPcHRzKHsgb3duZXI6IHRoaXMsIGVxdWFsc0ZuOiBlcXVhbHNJZkRlZmluZWRDKHRoaXNFcXVhbHNDKCkpIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiBsaW5lcyAqL1xuXHRcdFx0XHRcdGNvbnN0IHVpU3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0cmV0dXJuIHVpU3RhdGUgPyBuZXcgQWRkaXRpb25hbExpbmVzRGF0YShcblx0XHRcdFx0XHRcdHVpU3RhdGUubGluZU51bWJlcixcblx0XHRcdFx0XHRcdHVpU3RhdGUuYWRkaXRpb25hbExpbmVzLFxuXHRcdFx0XHRcdFx0dWlTdGF0ZS5hZGRpdGlvbmFsUmVzZXJ2ZWRMaW5lQ291bnQsXG5cdFx0XHRcdFx0KSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fSksXG5cdFx0XHRcdHRoaXMuX3Nob3VsZEtlZXBDdXJzb3JTdGFibGUsXG5cdFx0XHRcdHRoaXMuX2lzQ2xpY2thYmxlXG5cdFx0XHQpXG5cdFx0KTtcblx0XHR0aGlzLl9pc0lubGluZVRleHRIb3ZlcmVkID0gdGhpcy5fZWRpdG9yT2JzLmlzVGFyZ2V0SG92ZXJlZChcblx0XHRcdHAgPT4gcC50YXJnZXQudHlwZSA9PT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCAmJlxuXHRcdFx0XHRwLnRhcmdldC5kZXRhaWwuaW5qZWN0ZWRUZXh0Py5vcHRpb25zLmF0dGFjaGVkRGF0YSBpbnN0YW5jZW9mIEdob3N0VGV4dEF0dGFjaGVkRGF0YSAmJlxuXHRcdFx0XHRwLnRhcmdldC5kZXRhaWwuaW5qZWN0ZWRUZXh0Lm9wdGlvbnMuYXR0YWNoZWREYXRhLm93bmVyID09PSB0aGlzLFxuXHRcdFx0dGhpcy5fc3RvcmVcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHsgdGhpcy5faXNEaXNwb3NlZC5zZXQodHJ1ZSwgdW5kZWZpbmVkKTsgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5zZXREZWNvcmF0aW9ucyh0aGlzLl9kZWNvcmF0aW9ucykpO1xuXG5cdFx0aWYgKHRoaXMuX2lzQ2xpY2thYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9hZGRpdGlvbmFsTGluZXNXaWRnZXQub25EaWRDbGljaygoZSkgPT4gdGhpcy5fb25EaWRDbGljay5maXJlKGUpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25Nb3VzZVVwKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLkNPTlRFTlRfVEVYVCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhID0gZS50YXJnZXQuZGV0YWlsLmluamVjdGVkVGV4dD8ub3B0aW9ucy5hdHRhY2hlZERhdGE7XG5cdFx0XHRcdGlmIChhIGluc3RhbmNlb2YgR2hvc3RUZXh0QXR0YWNoZWREYXRhICYmIGEub3duZXIgPT09IHRoaXMpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoZS5ldmVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHN0YXRlPy5oYW5kbGVJbmxpbmVDb21wbGV0aW9uU2hvd24oc3RhdGUudGVsZW1ldHJ5Vmlld0RhdGEpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdGlmIChVU0VfU1FVSUdHTEVTX0ZPUl9XQVJOSU5HKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl93YXJuaW5nU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLl9lZGl0b3JPYnMuY3JlYXRlQ29udGVudFdpZGdldCh7XG5cdFx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGU8SUNvbnRlbnRXaWRnZXRQb3NpdGlvbj4oe1xuXHRcdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oc3RhdGUubGluZU51bWJlciwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpLFxuXHRcdFx0XHRcdHByZWZlcmVuY2U6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkVYQUNUXSxcblx0XHRcdFx0XHRwb3NpdGlvbkFmZmluaXR5OiBQb3NpdGlvbkFmZmluaXR5LlJpZ2h0LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0YWxsb3dFZGl0b3JPdmVyZmxvdzogZmFsc2UsXG5cdFx0XHRcdGRvbU5vZGU6IG4uZGl2KHtcblx0XHRcdFx0XHRjbGFzczogJ2dob3N0LXRleHQtdmlldy13YXJuaW5nLXdpZGdldCcsXG5cdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdHdpZHRoOiBsaW5lSGVpZ2h0LFxuXHRcdFx0XHRcdFx0aGVpZ2h0OiBsaW5lSGVpZ2h0LFxuXHRcdFx0XHRcdFx0bWFyZ2luTGVmdDogNCxcblx0XHRcdFx0XHRcdGNvbG9yOiAnb3JhbmdlJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlZjogKGRvbSkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0XHQoZG9tIGFzIGFueSBhcyBXaWRnZXREb21FbGVtZW50KS5naG9zdFRleHRWaWV3V2FybmluZ1dpZGdldERhdGEgPSB7IHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHN0YXRlLnBvc2l0aW9uKSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgW1xuXHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdGNsYXNzOiAnZ2hvc3QtdGV4dC12aWV3LXdhcm5pbmctd2lkZ2V0LWljb24nLFxuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0d2lkdGg6ICcxMDAlJyxcblx0XHRcdFx0XHRcdFx0aGVpZ2h0OiAnMTAwJScsXG5cdFx0XHRcdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdFx0XHRcdFx0YWxpZ25Db250ZW50OiAnY2VudGVyJyxcblx0XHRcdFx0XHRcdFx0YWxpZ25JdGVtczogJ2NlbnRlcicsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFtyZW5kZXJJY29uKHN0YXRlLmljb24pXVxuXHRcdFx0XHRcdClcblx0XHRcdFx0XSkua2VlcFVwZGF0ZWQoc3RvcmUpLmVsZW1lbnQsXG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXRXYXJuaW5nV2lkZ2V0Q29udGV4dChkb21Ob2RlOiBIVE1MRWxlbWVudCk6IHsgcmFuZ2U6IFJhbmdlIH0gfCB1bmRlZmluZWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IGRhdGEgPSAoZG9tTm9kZSBhcyBhbnkgYXMgV2lkZ2V0RG9tRWxlbWVudCkuZ2hvc3RUZXh0Vmlld1dhcm5pbmdXaWRnZXREYXRhO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRyZXR1cm4gZGF0YTtcblx0XHR9IGVsc2UgaWYgKGRvbU5vZGUucGFyZW50RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0V2FybmluZ1dpZGdldENvbnRleHQoZG9tTm9kZS5wYXJlbnRFbGVtZW50KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vbldoaXRlc3BhY2VDb3VudCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fZGF0YS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFkYXRhKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRjb25zdCBnaG9zdFRleHQgPSBkYXRhLmdob3N0VGV4dDtcblx0XHRjb25zdCBhbGxUZXh0ID0gZ2hvc3RUZXh0LnBhcnRzLm1hcChwID0+IHAubGluZXMubWFwKGwgPT4gbC5saW5lKS5qb2luKCcnKSkuam9pbignJyk7XG5cdFx0cmV0dXJuIGFsbFRleHQucmVwbGFjZSgvXFxzL2csICcnKS5sZW5ndGg7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4dHJhQ2xhc3NOYW1lcyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBleHRyYUNsYXNzZXMgPSB0aGlzLl9leHRyYUNsYXNzZXMuc2xpY2UoKTtcblx0XHRpZiAoVVNFX1NRVUlHR0xFU19GT1JfV0FSTklORyAmJiB0aGlzLl93YXJuaW5nU3RhdGUucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRleHRyYUNsYXNzZXMucHVzaCgnd2FybmluZycpO1xuXHRcdH1cblx0XHRjb25zdCBub25XaGl0ZXNwYWNlQ291bnQgPSB0aGlzLl9ub25XaGl0ZXNwYWNlQ291bnQucmVhZChyZWFkZXIpO1xuXHRcdGlmICh0aGlzLl9oaWdobGlnaHRTaG9ydFRleHQgJiYgbm9uV2hpdGVzcGFjZUNvdW50ICYmIG5vbldoaXRlc3BhY2VDb3VudCA8IDMpIHtcblx0XHRcdGV4dHJhQ2xhc3Nlcy5wdXNoKCdzaG9ydC10ZXh0Jyk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl91c2VTeW50YXhIaWdobGlnaHRpbmcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRleHRyYUNsYXNzZXMucHVzaCgnc3ludGF4LWhpZ2hsaWdodGVkJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dHJhQ2xhc3NOYW1lcyA9IGV4dHJhQ2xhc3Nlcy5tYXAoYyA9PiBgICR7Y31gKS5qb2luKCcnKTtcblx0XHRyZXR1cm4gZXh0cmFDbGFzc05hbWVzO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZC5yZWFkKHJlYWRlcikpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgcHJvcHMgPSB0aGlzLl9kYXRhLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIXByb3BzKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvck9icy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCF0ZXh0TW9kZWwpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0Y29uc3QgZ2hvc3RUZXh0ID0gcHJvcHMuZ2hvc3RUZXh0O1xuXHRcdGNvbnN0IHJlcGxhY2VkUmFuZ2UgPSBnaG9zdFRleHQgaW5zdGFuY2VvZiBHaG9zdFRleHRSZXBsYWNlbWVudCA/IGdob3N0VGV4dC5jb2x1bW5SYW5nZSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHN5bnRheEhpZ2hsaWdodGluZ0VuYWJsZWQgPSB0aGlzLl91c2VTeW50YXhIaWdobGlnaHRpbmcucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGV4dHJhQ2xhc3NOYW1lcyA9IHRoaXMuX2V4dHJhQ2xhc3NOYW1lcy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgeyBpbmxpbmVUZXh0cywgYWRkaXRpb25hbExpbmVzLCBoaWRkZW5SYW5nZSwgYWRkaXRpb25hbExpbmVzT3JpZ2luYWxTdWZmaXggfSA9IGNvbXB1dGVHaG9zdFRleHRWaWV3RGF0YShnaG9zdFRleHQsIHRleHRNb2RlbCwgR0hPU1RfVEVYVF9DTEFTU19OQU1FICsgZXh0cmFDbGFzc05hbWVzKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gdGV4dE1vZGVsLmdldExpbmVDb250ZW50KGdob3N0VGV4dC5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBlZGl0ID0gbmV3IFN0cmluZ0VkaXQoaW5saW5lVGV4dHMubWFwKHQgPT4gU3RyaW5nUmVwbGFjZW1lbnQuaW5zZXJ0KHQuY29sdW1uIC0gMSwgdC50ZXh0KSkpO1xuXHRcdGNvbnN0IHRva2VucyA9IHN5bnRheEhpZ2hsaWdodGluZ0VuYWJsZWQgPyB0ZXh0TW9kZWwudG9rZW5pemF0aW9uLnRva2VuaXplTGluZXNBdChnaG9zdFRleHQubGluZU51bWJlciwgW2VkaXQuYXBwbHkoY3VycmVudExpbmUpLCAuLi5hZGRpdGlvbmFsTGluZXMubWFwKGwgPT4gbC5jb250ZW50KV0pIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG5ld1JhbmdlcyA9IGVkaXQuZ2V0TmV3UmFuZ2VzKCk7XG5cdFx0Y29uc3QgaW5saW5lVGV4dHNXaXRoVG9rZW5zID0gaW5saW5lVGV4dHMubWFwKCh0LCBpZHgpID0+ICh7IC4uLnQsIHRva2VuczogdG9rZW5zPy5bMF0/LmdldFRva2Vuc0luUmFuZ2UobmV3UmFuZ2VzW2lkeF0pIH0pKTtcblxuXHRcdGNvbnN0IHRva2VuaXplZEFkZGl0aW9uYWxMaW5lczogTGluZURhdGFbXSA9IGFkZGl0aW9uYWxMaW5lcy5tYXAoKGwsIGlkeCkgPT4ge1xuXHRcdFx0bGV0IGNvbnRlbnQgPSB0b2tlbnM/LltpZHggKyAxXSA/PyBMaW5lVG9rZW5zLmNyZWF0ZUVtcHR5KGwuY29udGVudCwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYyk7XG5cdFx0XHRpZiAoaWR4ID09PSBhZGRpdGlvbmFsTGluZXMubGVuZ3RoIC0gMSAmJiBhZGRpdGlvbmFsTGluZXNPcmlnaW5hbFN1ZmZpeCkge1xuXHRcdFx0XHRjb25zdCB0ID0gVG9rZW5XaXRoVGV4dEFycmF5LmZyb21MaW5lVG9rZW5zKHRleHRNb2RlbC50b2tlbml6YXRpb24uZ2V0TGluZVRva2VucyhhZGRpdGlvbmFsTGluZXNPcmlnaW5hbFN1ZmZpeC5saW5lTnVtYmVyKSk7XG5cdFx0XHRcdGNvbnN0IGV4aXN0aW5nQ29udGVudCA9IHQuc2xpY2UoYWRkaXRpb25hbExpbmVzT3JpZ2luYWxTdWZmaXguY29sdW1uUmFuZ2UudG9aZXJvQmFzZWRPZmZzZXRSYW5nZSgpKTtcblx0XHRcdFx0Y29udGVudCA9IFRva2VuV2l0aFRleHRBcnJheS5mcm9tTGluZVRva2Vucyhjb250ZW50KS5hcHBlbmQoZXhpc3RpbmdDb250ZW50KS50b0xpbmVUb2tlbnMoY29udGVudC5sYW5ndWFnZUlkQ29kZWMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBMaW5lRGF0YShcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0bC5kZWNvcmF0aW9ucyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjdXJzb3JDb2x1bW4gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk/LmdldFN0YXJ0UG9zaXRpb24oKS5jb2x1bW4hO1xuXHRcdGNvbnN0IGRpc2pvaW50SW5saW5lVGV4dHMgPSBpbmxpbmVUZXh0c1dpdGhUb2tlbnMuZmlsdGVyKGlubGluZSA9PiBpbmxpbmUudGV4dCAhPT0gJycpO1xuXHRcdGNvbnN0IGhhc0luc2VydGlvbk9uQ3VycmVudExpbmUgPSBkaXNqb2ludElubGluZVRleHRzLmxlbmd0aCAhPT0gMDtcblx0XHRjb25zdCB0ZWxlbWV0cnlWaWV3RGF0YSA9IG5ldyBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEoXG5cdFx0XHQoaGFzSW5zZXJ0aW9uT25DdXJyZW50TGluZSA/IGRpc2pvaW50SW5saW5lVGV4dHNbMF0uY29sdW1uIDogMSkgLSBjdXJzb3JDb2x1bW4sXG5cdFx0XHRoYXNJbnNlcnRpb25PbkN1cnJlbnRMaW5lID8gMCA6IChhZGRpdGlvbmFsTGluZXMuZmluZEluZGV4KGxpbmUgPT4gbGluZS5jb250ZW50ICE9PSAnJykgKyAxKSxcblx0XHRcdGhhc0luc2VydGlvbk9uQ3VycmVudExpbmUgPyAxIDogMCxcblx0XHRcdGFkZGl0aW9uYWxMaW5lcy5sZW5ndGggKyAoaGFzSW5zZXJ0aW9uT25DdXJyZW50TGluZSA/IDEgOiAwKSxcblx0XHRcdDAsXG5cdFx0XHRzdW0oZGlzam9pbnRJbmxpbmVUZXh0cy5tYXAoaW5saW5lID0+IGlubGluZS50ZXh0Lmxlbmd0aCkpICsgc3VtKHRva2VuaXplZEFkZGl0aW9uYWxMaW5lcy5tYXAobGluZSA9PiBsaW5lLmNvbnRlbnQuZ2V0VGV4dExlbmd0aCgpKSksXG5cdFx0XHRkaXNqb2ludElubGluZVRleHRzLmxlbmd0aCArIChhZGRpdGlvbmFsTGluZXMubGVuZ3RoID4gMCA/IDEgOiAwKSxcblx0XHRcdGRpc2pvaW50SW5saW5lVGV4dHMubGVuZ3RoID4gMSAmJiB0b2tlbml6ZWRBZGRpdGlvbmFsTGluZXMubGVuZ3RoID09PSAwID8gZGlzam9pbnRJbmxpbmVUZXh0cy5ldmVyeShpbmxpbmUgPT4gaW5saW5lLnRleHQgPT09IGRpc2pvaW50SW5saW5lVGV4dHNbMF0udGV4dCkgOiB1bmRlZmluZWRcblx0XHQpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlcGxhY2VkUmFuZ2UsXG5cdFx0XHRpbmxpbmVUZXh0czogaW5saW5lVGV4dHNXaXRoVG9rZW5zLFxuXHRcdFx0YWRkaXRpb25hbExpbmVzOiB0b2tlbml6ZWRBZGRpdGlvbmFsTGluZXMsXG5cdFx0XHRoaWRkZW5SYW5nZSxcblx0XHRcdGxpbmVOdW1iZXI6IGdob3N0VGV4dC5saW5lTnVtYmVyLFxuXHRcdFx0YWRkaXRpb25hbFJlc2VydmVkTGluZUNvdW50OiB0aGlzLl9taW5SZXNlcnZlZExpbmVDb3VudC5yZWFkKHJlYWRlciksXG5cdFx0XHR0YXJnZXRUZXh0TW9kZWw6IHRleHRNb2RlbCxcblx0XHRcdHN5bnRheEhpZ2hsaWdodGluZ0VuYWJsZWQsXG5cdFx0XHR0ZWxlbWV0cnlWaWV3RGF0YSxcblx0XHRcdGhhbmRsZUlubGluZUNvbXBsZXRpb25TaG93bjogcHJvcHMuaGFuZGxlSW5saW5lQ29tcGxldGlvblNob3duLFxuXHRcdH07XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlY29yYXRpb25zID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHVpU3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCF1aVN0YXRlKSB7IHJldHVybiBbXTsgfVxuXG5cdFx0Y29uc3QgZGVjb3JhdGlvbnM6IElNb2RlbERlbHRhRGVjb3JhdGlvbltdID0gW107XG5cblx0XHRjb25zdCBleHRyYUNsYXNzTmFtZXMgPSB0aGlzLl9leHRyYUNsYXNzTmFtZXMucmVhZChyZWFkZXIpO1xuXG5cdFx0aWYgKHVpU3RhdGUucmVwbGFjZWRSYW5nZSkge1xuXHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiB1aVN0YXRlLnJlcGxhY2VkUmFuZ2UudG9SYW5nZSh1aVN0YXRlLmxpbmVOdW1iZXIpLFxuXHRcdFx0XHRvcHRpb25zOiB7IGlubGluZUNsYXNzTmFtZTogJ2lubGluZS1jb21wbGV0aW9uLXRleHQtdG8tcmVwbGFjZScgKyBleHRyYUNsYXNzTmFtZXMsIGRlc2NyaXB0aW9uOiAnR2hvc3RUZXh0UmVwbGFjZW1lbnQnIH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh1aVN0YXRlLmhpZGRlblJhbmdlKSB7XG5cdFx0XHRkZWNvcmF0aW9ucy5wdXNoKHtcblx0XHRcdFx0cmFuZ2U6IHVpU3RhdGUuaGlkZGVuUmFuZ2UudG9SYW5nZSh1aVN0YXRlLmxpbmVOdW1iZXIpLFxuXHRcdFx0XHRvcHRpb25zOiB7IGlubGluZUNsYXNzTmFtZTogJ2dob3N0LXRleHQtaGlkZGVuJywgZGVzY3JpcHRpb246ICdnaG9zdC10ZXh0LWhpZGRlbicsIH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcCBvZiB1aVN0YXRlLmlubGluZVRleHRzKSB7XG5cdFx0XHRsZXQgaW5saW5lRXh0cmFDbGFzc05hbWVzID0gJyc7XG5cdFx0XHRpZiAodGhpcy5faGlnaGxpZ2h0U2hvcnRUZXh0ICYmIHAudGV4dC5sZW5ndGggPCA1KSB7XG5cdFx0XHRcdGlubGluZUV4dHJhQ2xhc3NOYW1lcyArPSAnIHNob3J0LXRleHQnO1xuXHRcdFx0fVxuXHRcdFx0ZGVjb3JhdGlvbnMucHVzaCh7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKG5ldyBQb3NpdGlvbih1aVN0YXRlLmxpbmVOdW1iZXIsIHAuY29sdW1uKSksXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ2dob3N0LXRleHQtZGVjb3JhdGlvbicsXG5cdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHAudGV4dCxcblx0XHRcdFx0XHRcdHRva2VuczogcC50b2tlbnMsXG5cdFx0XHRcdFx0XHRpbmxpbmVDbGFzc05hbWU6IChwLnByZXZpZXcgPyAnZ2hvc3QtdGV4dC1kZWNvcmF0aW9uLXByZXZpZXcnIDogJ2dob3N0LXRleHQtZGVjb3JhdGlvbicpXG5cdFx0XHRcdFx0XHRcdCsgKHRoaXMuX2lzQ2xpY2thYmxlID8gJyBjbGlja2FibGUnIDogJycpXG5cdFx0XHRcdFx0XHRcdCsgZXh0cmFDbGFzc05hbWVzXG5cdFx0XHRcdFx0XHRcdCsgaW5saW5lRXh0cmFDbGFzc05hbWVzXG5cdFx0XHRcdFx0XHRcdCsgcC5saW5lRGVjb3JhdGlvbnMubWFwKGQgPT4gJyAnICsgZC5jbGFzc05hbWUpLmpvaW4oJyAnKSwgLy8gVE9ETzogdGFrZSB0aGUgcmFuZ2VzIGludG8gYWNjb3VudCBmb3IgbGluZSBkZWNvcmF0aW9uc1xuXHRcdFx0XHRcdFx0Y3Vyc29yU3RvcHM6IEluamVjdGVkVGV4dEN1cnNvclN0b3BzLkxlZnQsXG5cdFx0XHRcdFx0XHRhdHRhY2hlZERhdGE6IG5ldyBHaG9zdFRleHRBdHRhY2hlZERhdGEodGhpcyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZWNvcmF0aW9ucztcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWRkaXRpb25hbExpbmVzV2lkZ2V0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzSW5saW5lVGV4dEhvdmVyZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IGlzSG92ZXJlZCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZC5yZWFkKHJlYWRlcikpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0cmV0dXJuIHRoaXMuX2lzSW5saW5lVGV4dEhvdmVyZWQucmVhZChyZWFkZXIpIHx8IHRoaXMuX2FkZGl0aW9uYWxMaW5lc1dpZGdldC5pc0hvdmVyZWQucmVhZChyZWFkZXIpO1xuXHR9KTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaGVpZ2h0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KS5yZWFkKHJlYWRlcik7XG5cdFx0cmV0dXJuIGxpbmVIZWlnaHQgKyAodGhpcy5fYWRkaXRpb25hbExpbmVzV2lkZ2V0LnZpZXdab25lSGVpZ2h0LnJlYWQocmVhZGVyKSA/PyAwKTtcblx0fSk7XG5cblx0cHVibGljIG93bnNWaWV3Wm9uZSh2aWV3Wm9uZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWRkaXRpb25hbExpbmVzV2lkZ2V0LnZpZXdab25lSWQgPT09IHZpZXdab25lSWQ7XG5cdH1cbn1cblxuY2xhc3MgR2hvc3RUZXh0QXR0YWNoZWREYXRhIHtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG93bmVyOiBHaG9zdFRleHRWaWV3KSB7IH1cbn1cblxuaW50ZXJmYWNlIFdpZGdldERvbUVsZW1lbnQge1xuXHRnaG9zdFRleHRWaWV3V2FybmluZ1dpZGdldERhdGE/OiB7XG5cdFx0cmFuZ2U6IFJhbmdlO1xuXHR9O1xufVxuXG5mdW5jdGlvbiBjb21wdXRlR2hvc3RUZXh0Vmlld0RhdGEoZ2hvc3RUZXh0OiBHaG9zdFRleHQgfCBHaG9zdFRleHRSZXBsYWNlbWVudCwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBnaG9zdFRleHRDbGFzc05hbWU6IHN0cmluZykge1xuXHRjb25zdCBpbmxpbmVUZXh0czogeyBjb2x1bW46IG51bWJlcjsgdGV4dDogc3RyaW5nOyBwcmV2aWV3OiBib29sZWFuOyBsaW5lRGVjb3JhdGlvbnM6IExpbmVEZWNvcmF0aW9uW10gfVtdID0gW107XG5cdGNvbnN0IGFkZGl0aW9uYWxMaW5lczogeyBjb250ZW50OiBzdHJpbmc7IGRlY29yYXRpb25zOiBMaW5lRGVjb3JhdGlvbltdIH1bXSA9IFtdO1xuXG5cdGZ1bmN0aW9uIGFkZFRvQWRkaXRpb25hbExpbmVzKGdoTGluZXM6IHJlYWRvbmx5IElHaG9zdFRleHRMaW5lW10sIGNsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKGFkZGl0aW9uYWxMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IGFkZGl0aW9uYWxMaW5lc1thZGRpdGlvbmFsTGluZXMubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAoY2xhc3NOYW1lKSB7XG5cdFx0XHRcdGxhc3RMaW5lLmRlY29yYXRpb25zLnB1c2gobmV3IExpbmVEZWNvcmF0aW9uKFxuXHRcdFx0XHRcdGxhc3RMaW5lLmNvbnRlbnQubGVuZ3RoICsgMSxcblx0XHRcdFx0XHRsYXN0TGluZS5jb250ZW50Lmxlbmd0aCArIDEgKyBnaExpbmVzWzBdLmxpbmUubGVuZ3RoLFxuXHRcdFx0XHRcdGNsYXNzTmFtZSxcblx0XHRcdFx0XHRJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdExpbmUuY29udGVudCArPSBnaExpbmVzWzBdLmxpbmU7XG5cblx0XHRcdGdoTGluZXMgPSBnaExpbmVzLnNsaWNlKDEpO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGdoTGluZSBvZiBnaExpbmVzKSB7XG5cdFx0XHRhZGRpdGlvbmFsTGluZXMucHVzaCh7XG5cdFx0XHRcdGNvbnRlbnQ6IGdoTGluZS5saW5lLFxuXHRcdFx0XHRkZWNvcmF0aW9uczogY2xhc3NOYW1lID8gW25ldyBMaW5lRGVjb3JhdGlvbihcblx0XHRcdFx0XHQxLFxuXHRcdFx0XHRcdGdoTGluZS5saW5lLmxlbmd0aCArIDEsXG5cdFx0XHRcdFx0Y2xhc3NOYW1lLFxuXHRcdFx0XHRcdElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXJcblx0XHRcdFx0KSwgLi4uZ2hMaW5lLmxpbmVEZWNvcmF0aW9uc10gOiBbLi4uZ2hMaW5lLmxpbmVEZWNvcmF0aW9uc11cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHRleHRCdWZmZXJMaW5lID0gdGV4dE1vZGVsLmdldExpbmVDb250ZW50KGdob3N0VGV4dC5saW5lTnVtYmVyKTtcblxuXHRsZXQgaGlkZGVuVGV4dFN0YXJ0Q29sdW1uOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGxldCBsYXN0SWR4ID0gMDtcblx0Zm9yIChjb25zdCBwYXJ0IG9mIGdob3N0VGV4dC5wYXJ0cykge1xuXHRcdGxldCBnaExpbmVzID0gcGFydC5saW5lcztcblx0XHRpZiAoaGlkZGVuVGV4dFN0YXJ0Q29sdW1uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlubGluZVRleHRzLnB1c2goeyBjb2x1bW46IHBhcnQuY29sdW1uLCB0ZXh0OiBnaExpbmVzWzBdLmxpbmUsIHByZXZpZXc6IHBhcnQucHJldmlldywgbGluZURlY29yYXRpb25zOiBnaExpbmVzWzBdLmxpbmVEZWNvcmF0aW9ucyB9KTtcblx0XHRcdGdoTGluZXMgPSBnaExpbmVzLnNsaWNlKDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhZGRUb0FkZGl0aW9uYWxMaW5lcyhbeyBsaW5lOiB0ZXh0QnVmZmVyTGluZS5zdWJzdHJpbmcobGFzdElkeCwgcGFydC5jb2x1bW4gLSAxKSwgbGluZURlY29yYXRpb25zOiBbXSB9XSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAoZ2hMaW5lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRhZGRUb0FkZGl0aW9uYWxMaW5lcyhnaExpbmVzLCBnaG9zdFRleHRDbGFzc05hbWUpO1xuXHRcdFx0aWYgKGhpZGRlblRleHRTdGFydENvbHVtbiA9PT0gdW5kZWZpbmVkICYmIHBhcnQuY29sdW1uIDw9IHRleHRCdWZmZXJMaW5lLmxlbmd0aCkge1xuXHRcdFx0XHRoaWRkZW5UZXh0U3RhcnRDb2x1bW4gPSBwYXJ0LmNvbHVtbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsYXN0SWR4ID0gcGFydC5jb2x1bW4gLSAxO1xuXHR9XG5cdGxldCBhZGRpdGlvbmFsTGluZXNPcmlnaW5hbFN1ZmZpeDogUmFuZ2VTaW5nbGVMaW5lIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRpZiAoaGlkZGVuVGV4dFN0YXJ0Q29sdW1uICE9PSB1bmRlZmluZWQpIHtcblx0XHRhZGRpdGlvbmFsTGluZXNPcmlnaW5hbFN1ZmZpeCA9IG5ldyBSYW5nZVNpbmdsZUxpbmUoZ2hvc3RUZXh0LmxpbmVOdW1iZXIsIG5ldyBDb2x1bW5SYW5nZShsYXN0SWR4ICsgMSwgdGV4dEJ1ZmZlckxpbmUubGVuZ3RoICsgMSkpO1xuXHR9XG5cblx0Y29uc3QgaGlkZGVuUmFuZ2UgPSBoaWRkZW5UZXh0U3RhcnRDb2x1bW4gIT09IHVuZGVmaW5lZCA/IG5ldyBDb2x1bW5SYW5nZShoaWRkZW5UZXh0U3RhcnRDb2x1bW4sIHRleHRCdWZmZXJMaW5lLmxlbmd0aCArIDEpIDogdW5kZWZpbmVkO1xuXG5cdHJldHVybiB7XG5cdFx0aW5saW5lVGV4dHMsXG5cdFx0YWRkaXRpb25hbExpbmVzLFxuXHRcdGhpZGRlblJhbmdlLFxuXHRcdGFkZGl0aW9uYWxMaW5lc09yaWdpbmFsU3VmZml4LFxuXHR9O1xufVxuXG5jbGFzcyBBZGRpdGlvbmFsTGluZXNEYXRhIGltcGxlbWVudHMgSUVxdWF0YWJsZTxBZGRpdGlvbmFsTGluZXNEYXRhPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFkZGl0aW9uYWxMaW5lczogcmVhZG9ubHkgTGluZURhdGFbXSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbWluUmVzZXJ2ZWRMaW5lQ291bnQ6IG51bWJlcixcblx0KSB7IH1cblxuXHRlcXVhbHMob3RoZXI6IEFkZGl0aW9uYWxMaW5lc0RhdGEpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5saW5lTnVtYmVyICE9PSBvdGhlci5saW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm1pblJlc2VydmVkTGluZUNvdW50ICE9PSBvdGhlci5taW5SZXNlcnZlZExpbmVDb3VudCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gZXF1YWxzKHRoaXMuYWRkaXRpb25hbExpbmVzLCBvdGhlci5hZGRpdGlvbmFsTGluZXMsIHRoaXNFcXVhbHNDKCkpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZGRpdGlvbmFsTGluZXNXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfdmlld1pvbmVJbmZvOiB7IHZpZXdab25lSWQ6IHN0cmluZzsgaGVpZ2h0SW5MaW5lczogbnVtYmVyOyBsaW5lTnVtYmVyOiBudW1iZXIgfSB8IHVuZGVmaW5lZDtcblx0cHVibGljIGdldCB2aWV3Wm9uZUlkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl92aWV3Wm9uZUluZm8/LnZpZXdab25lSWQ7IH1cblxuXHRwcml2YXRlIF92aWV3Wm9uZUhlaWdodDtcblx0cHVibGljIGdldCB2aWV3Wm9uZUhlaWdodCgpOiBJT2JzZXJ2YWJsZTxudW1iZXIgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHRoaXMuX3ZpZXdab25lSGVpZ2h0OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JPcHRpb25zQ2hhbmdlZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsaWNrO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDbGljaztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3Wm9uZUxpc3RlbmVyO1xuXG5cdHJlYWRvbmx5IGlzSG92ZXJlZDtcblxuXHRwcml2YXRlIGhhc0JlZW5BY2NlcHRlZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVzOiBJT2JzZXJ2YWJsZTxBZGRpdGlvbmFsTGluZXNEYXRhIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRLZWVwQ3Vyc29yU3RhYmxlOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzQ2xpY2thYmxlOiBib29sZWFuLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3ZpZXdab25lSGVpZ2h0ID0gb2JzZXJ2YWJsZVZhbHVlPHVuZGVmaW5lZCB8IG51bWJlcj4oJ3ZpZXdab25lSGVpZ2h0JywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmVkaXRvck9wdGlvbnNDaGFuZ2VkID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCgnZWRpdG9yT3B0aW9uQ2hhbmdlZCcsIEV2ZW50LmZpbHRlcihcblx0XHRcdHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sXG5cdFx0XHRlID0+IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMpXG5cdFx0XHRcdHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uc3RvcFJlbmRlcmluZ0xpbmVBZnRlcilcblx0XHRcdFx0fHwgZS5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5yZW5kZXJXaGl0ZXNwYWNlKVxuXHRcdFx0XHR8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzKVxuXHRcdFx0XHR8fCBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRMaWdhdHVyZXMpXG5cdFx0XHRcdHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pXG5cdFx0XHRcdHx8IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZUhlaWdodClcblx0XHQpKTtcblx0XHR0aGlzLl9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1vdXNlRXZlbnQ+KCkpO1xuXHRcdHRoaXMub25EaWRDbGljayA9IHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cdFx0dGhpcy5fdmlld1pvbmVMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHR0aGlzLmlzSG92ZXJlZCA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMuX2VkaXRvcikuaXNUYXJnZXRIb3ZlcmVkKFxuXHRcdFx0cCA9PiBpc1RhcmdldEdob3N0VGV4dChwLnRhcmdldC5lbGVtZW50KSxcblx0XHRcdHRoaXMuX3N0b3JlXG5cdFx0KTtcblx0XHR0aGlzLmhhc0JlZW5BY2NlcHRlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKHRoaXMuX2VkaXRvciBpbnN0YW5jZW9mIENvZGVFZGl0b3JXaWRnZXQgJiYgdGhpcy5fc2hvdWxkS2VlcEN1cnNvclN0YWJsZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uQmVmb3JlRXhlY3V0ZUVkaXQoZSA9PiB0aGlzLmhhc0JlZW5BY2NlcHRlZCA9IGUuc291cmNlID09PSAnaW5saW5lU3VnZ2VzdGlvbi5hY2NlcHQnKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgdmlldyB6b25lICovXG5cdFx0XHRjb25zdCBsaW5lcyA9IHRoaXMuX2xpbmVzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuZWRpdG9yT3B0aW9uc0NoYW5nZWQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAobGluZXMpIHtcblx0XHRcdFx0dGhpcy5oYXNCZWVuQWNjZXB0ZWQgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy51cGRhdGVMaW5lcyhsaW5lcy5saW5lTnVtYmVyLCBsaW5lcy5hZGRpdGlvbmFsTGluZXMsIGxpbmVzLm1pblJlc2VydmVkTGluZUNvdW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl92aWV3Wm9uZUxpc3RlbmVyLmNsZWFyKCk7XG5cblx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlVmlld1pvbmVzKChjaGFuZ2VBY2Nlc3NvcikgPT4ge1xuXHRcdFx0dGhpcy5yZW1vdmVBY3RpdmVWaWV3Wm9uZShjaGFuZ2VBY2Nlc3Nvcik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxpbmVzKGxpbmVOdW1iZXI6IG51bWJlciwgYWRkaXRpb25hbExpbmVzOiByZWFkb25seSBMaW5lRGF0YVtdLCBtaW5SZXNlcnZlZExpbmVDb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCF0ZXh0TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IHRhYlNpemUgfSA9IHRleHRNb2RlbC5nZXRPcHRpb25zKCk7XG5cblx0XHRvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLl9lZGl0b3IpLnRyYW5zYWN0aW9uKF8gPT4ge1xuXHRcdFx0dGhpcy5fZWRpdG9yLmNoYW5nZVZpZXdab25lcygoY2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdFx0dGhpcy5yZW1vdmVBY3RpdmVWaWV3Wm9uZShjaGFuZ2VBY2Nlc3Nvcik7XG5cblx0XHRcdFx0Y29uc3QgaGVpZ2h0SW5MaW5lcyA9IE1hdGgubWF4KGFkZGl0aW9uYWxMaW5lcy5sZW5ndGgsIG1pblJlc2VydmVkTGluZUNvdW50KTtcblx0XHRcdFx0aWYgKGhlaWdodEluTGluZXMgPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRcdHJlbmRlckxpbmVzKGRvbU5vZGUsIHRhYlNpemUsIGFkZGl0aW9uYWxMaW5lcywgdGhpcy5fZWRpdG9yLmdldE9wdGlvbnMoKSwgdGhpcy5faXNDbGlja2FibGUpO1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMuX2lzQ2xpY2thYmxlKSB7XG5cdFx0XHRcdFx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRvbU5vZGUsICdtb3VzZWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IC8vIFRoaXMgcHJldmVudHMgdGhhdCB0aGUgZWRpdG9yIGxvc2VzIGZvY3VzXG5cdFx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRvbU5vZGUsICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChpc1RhcmdldEdob3N0VGV4dChlLnRhcmdldCkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUobmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3coZSksIGUpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuYWRkVmlld1pvbmUoY2hhbmdlQWNjZXNzb3IsIGxpbmVOdW1iZXIsIGhlaWdodEluTGluZXMsIGRvbU5vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fdmlld1pvbmVMaXN0ZW5lci52YWx1ZSA9IHN0b3JlO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZFZpZXdab25lKGNoYW5nZUFjY2Vzc29yOiBJVmlld1pvbmVDaGFuZ2VBY2Nlc3NvciwgYWZ0ZXJMaW5lTnVtYmVyOiBudW1iZXIsIGhlaWdodEluTGluZXM6IG51bWJlciwgZG9tTm9kZTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpZCA9IGNoYW5nZUFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0YWZ0ZXJMaW5lTnVtYmVyOiBhZnRlckxpbmVOdW1iZXIsXG5cdFx0XHRoZWlnaHRJbkxpbmVzOiBoZWlnaHRJbkxpbmVzLFxuXHRcdFx0ZG9tTm9kZSxcblx0XHRcdGFmdGVyQ29sdW1uQWZmaW5pdHk6IFBvc2l0aW9uQWZmaW5pdHkuUmlnaHQsXG5cdFx0XHRvbkNvbXB1dGVkSGVpZ2h0OiAoaGVpZ2h0OiBudW1iZXIpID0+IHtcblx0XHRcdFx0dGhpcy5fdmlld1pvbmVIZWlnaHQuc2V0KGhlaWdodCwgdW5kZWZpbmVkKTsgLy8gVE9ETzogY2FuIGEgdHJhbnNhY3Rpb24gYmUgdXNlZCB0byBhdm9pZCBmbGlja2VyaW5nP1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5rZWVwQ3Vyc29yU3RhYmxlKGFmdGVyTGluZU51bWJlciwgaGVpZ2h0SW5MaW5lcyk7XG5cblx0XHR0aGlzLl92aWV3Wm9uZUluZm8gPSB7IHZpZXdab25lSWQ6IGlkLCBoZWlnaHRJbkxpbmVzLCBsaW5lTnVtYmVyOiBhZnRlckxpbmVOdW1iZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlQWN0aXZlVmlld1pvbmUoY2hhbmdlQWNjZXNzb3I6IElWaWV3Wm9uZUNoYW5nZUFjY2Vzc29yKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ZpZXdab25lSW5mbykge1xuXHRcdFx0Y2hhbmdlQWNjZXNzb3IucmVtb3ZlWm9uZSh0aGlzLl92aWV3Wm9uZUluZm8udmlld1pvbmVJZCk7XG5cblx0XHRcdGlmICghdGhpcy5oYXNCZWVuQWNjZXB0ZWQpIHtcblx0XHRcdFx0dGhpcy5rZWVwQ3Vyc29yU3RhYmxlKHRoaXMuX3ZpZXdab25lSW5mby5saW5lTnVtYmVyLCAtdGhpcy5fdmlld1pvbmVJbmZvLmhlaWdodEluTGluZXMpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl92aWV3Wm9uZUluZm8gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl92aWV3Wm9uZUhlaWdodC5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUga2VlcEN1cnNvclN0YWJsZShsaW5lTnVtYmVyOiBudW1iZXIsIGhlaWdodEluTGluZXM6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fc2hvdWxkS2VlcEN1cnNvclN0YWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnNvckxpbmVOdW1iZXIgPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk/LmdldFN0YXJ0UG9zaXRpb24oKT8ubGluZU51bWJlcjtcblx0XHRpZiAoY3Vyc29yTGluZU51bWJlciAhPT0gdW5kZWZpbmVkICYmIGxpbmVOdW1iZXIgPCBjdXJzb3JMaW5lTnVtYmVyKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3Iuc2V0U2Nyb2xsVG9wKHRoaXMuX2VkaXRvci5nZXRTY3JvbGxUb3AoKSArIGhlaWdodEluTGluZXMgKiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGlzVGFyZ2V0R2hvc3RUZXh0KHRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0hUTUxFbGVtZW50KHRhcmdldCkgJiYgdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhHSE9TVF9URVhUX0NMQVNTX05BTUUpO1xufVxuXG5leHBvcnQgY2xhc3MgTGluZURhdGEgaW1wbGVtZW50cyBJRXF1YXRhYmxlPExpbmVEYXRhPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBjb250ZW50OiBMaW5lVG9rZW5zLCAvLyBNdXN0IG5vdCBjb250YWluIGEgbGluZWJyZWFrIVxuXHRcdHB1YmxpYyByZWFkb25seSBkZWNvcmF0aW9uczogcmVhZG9ubHkgTGluZURlY29yYXRpb25bXVxuXHQpIHsgfVxuXG5cdGVxdWFscyhvdGhlcjogTGluZURhdGEpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuY29udGVudC5lcXVhbHMob3RoZXIuY29udGVudCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIExpbmVEZWNvcmF0aW9uLmVxdWFsc0Fycih0aGlzLmRlY29yYXRpb25zLCBvdGhlci5kZWNvcmF0aW9ucyk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyTGluZXMoZG9tTm9kZTogSFRNTEVsZW1lbnQsIHRhYlNpemU6IG51bWJlciwgbGluZXM6IHJlYWRvbmx5IExpbmVEYXRhW10sIG9wdHM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIGlzQ2xpY2thYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdGNvbnN0IGRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zID0gb3B0cy5nZXQoRWRpdG9yT3B0aW9uLmRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zKTtcblx0Y29uc3Qgc3RvcFJlbmRlcmluZ0xpbmVBZnRlciA9IG9wdHMuZ2V0KEVkaXRvck9wdGlvbi5zdG9wUmVuZGVyaW5nTGluZUFmdGVyKTtcblx0Ly8gVG8gYXZvaWQgdmlzdWFsIGNvbmZ1c2lvbiwgd2UgZG9uJ3Qgd2FudCB0byByZW5kZXIgdmlzaWJsZSB3aGl0ZXNwYWNlXG5cdGNvbnN0IHJlbmRlcldoaXRlc3BhY2UgPSAnbm9uZSc7XG5cdGNvbnN0IHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzID0gb3B0cy5nZXQoRWRpdG9yT3B0aW9uLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzKTtcblx0Y29uc3QgZm9udExpZ2F0dXJlcyA9IG9wdHMuZ2V0KEVkaXRvck9wdGlvbi5mb250TGlnYXR1cmVzKTtcblx0Y29uc3QgZm9udEluZm8gPSBvcHRzLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRjb25zdCBsaW5lSGVpZ2h0ID0gb3B0cy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXG5cdGxldCBjbGFzc05hbWVzID0gJ3N1Z2dlc3QtcHJldmlldy10ZXh0Jztcblx0aWYgKGlzQ2xpY2thYmxlKSB7XG5cdFx0Y2xhc3NOYW1lcyArPSAnIGNsaWNrYWJsZSc7XG5cdH1cblxuXHRjb25zdCBzYiA9IG5ldyBTdHJpbmdCdWlsZGVyKDEwMDAwKTtcblx0c2IuYXBwZW5kU3RyaW5nKGA8ZGl2IGNsYXNzPVwiJHtjbGFzc05hbWVzfVwiPmApO1xuXG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IGxpbmVEYXRhID0gbGluZXNbaV07XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IGxpbmVEYXRhLmNvbnRlbnQ7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCc8ZGl2IGNsYXNzPVwidmlldy1saW5lJyk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCdcIiBzdHlsZT1cInRvcDonKTtcblx0XHRzYi5hcHBlbmRTdHJpbmcoU3RyaW5nKGkgKiBsaW5lSGVpZ2h0KSk7XG5cdFx0c2IuYXBwZW5kU3RyaW5nKCdweDt3aWR0aDoxMDAwMDAwcHg7XCI+Jyk7XG5cblx0XHRjb25zdCBsaW5lID0gbGluZVRva2Vucy5nZXRMaW5lQ29udGVudCgpO1xuXHRcdGNvbnN0IGlzQmFzaWNBU0NJSSA9IHN0cmluZ3MuaXNCYXNpY0FTQ0lJKGxpbmUpO1xuXHRcdGNvbnN0IGNvbnRhaW5zUlRMID0gc3RyaW5ncy5jb250YWluc1JUTChsaW5lKTtcblxuXHRcdHJlbmRlclZpZXdMaW5lKG5ldyBSZW5kZXJMaW5lSW5wdXQoXG5cdFx0XHQoZm9udEluZm8uaXNNb25vc3BhY2UgJiYgIWRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zKSxcblx0XHRcdGZvbnRJbmZvLmNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdyxcblx0XHRcdGxpbmUsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGlzQmFzaWNBU0NJSSxcblx0XHRcdGNvbnRhaW5zUlRMLFxuXHRcdFx0MCxcblx0XHRcdGxpbmVUb2tlbnMsXG5cdFx0XHRsaW5lRGF0YS5kZWNvcmF0aW9ucy5zbGljZSgpLFxuXHRcdFx0dGFiU2l6ZSxcblx0XHRcdDAsXG5cdFx0XHRmb250SW5mby5zcGFjZVdpZHRoLFxuXHRcdFx0Zm9udEluZm8ubWlkZG90V2lkdGgsXG5cdFx0XHRmb250SW5mby53c21pZGRvdFdpZHRoLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcixcblx0XHRcdHJlbmRlcldoaXRlc3BhY2UsXG5cdFx0XHRyZW5kZXJDb250cm9sQ2hhcmFjdGVycyxcblx0XHRcdGZvbnRMaWdhdHVyZXMgIT09IEVkaXRvckZvbnRMaWdhdHVyZXMuT0ZGLFxuXHRcdFx0bnVsbCxcblx0XHRcdG51bGwsXG5cdFx0XHQwXG5cdFx0KSwgc2IpO1xuXG5cdFx0c2IuYXBwZW5kU3RyaW5nKCc8L2Rpdj4nKTtcblx0fVxuXHRzYi5hcHBlbmRTdHJpbmcoJzwvZGl2PicpO1xuXG5cdGFwcGx5Rm9udEluZm8oZG9tTm9kZSwgZm9udEluZm8pO1xuXHRjb25zdCBodG1sID0gc2IuYnVpbGQoKTtcblx0Y29uc3QgdHJ1c3RlZGh0bWwgPSB0dFBvbGljeSA/IHR0UG9saWN5LmNyZWF0ZUhUTUwoaHRtbCkgOiBodG1sO1xuXHRkb21Ob2RlLmlubmVySFRNTCA9IHRydXN0ZWRodG1sIGFzIHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IHR0UG9saWN5ID0gY3JlYXRlVHJ1c3RlZFR5cGVzUG9saWN5KCdlZGl0b3JHaG9zdFRleHQnLCB7IGNyZWF0ZUhUTUw6IHZhbHVlID0+IHZhbHVlIH0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQixtQkFBbUIsb0JBQW9CO0FBQzdFLFNBQXNCLFNBQVMsa0JBQWtCLGlCQUFpQixTQUFTLGFBQWEsMkJBQTJCLHVCQUF1QjtBQUMxSSxZQUFZLGFBQWE7QUFDekIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQ0FBK0YsdUJBQXVCO0FBQy9ILFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUJBQXFCLG9CQUE0QztBQUMxRSxTQUFTLFlBQVkseUJBQXlCO0FBQzlDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLHdCQUF3QjtBQUNqQyxTQUE0Qyx5QkFBeUIsd0JBQXdCO0FBQzdGLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLHNCQUFzQjtBQUNoRCxTQUFvQiw0QkFBNEM7QUFDaEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx1QkFBdUIsV0FBVyxlQUFlLFNBQVM7QUFDbkUsT0FBTztBQUNQLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFT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
