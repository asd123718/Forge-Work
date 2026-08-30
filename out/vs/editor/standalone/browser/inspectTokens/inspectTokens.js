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
import "./inspectTokens.css";
import { $, append, reset } from "../../../../base/browser/dom.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { Color } from "../../../../base/common/color.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorAction, registerEditorAction, registerEditorContribution, EditorContributionInstantiation } from "../../../browser/editorExtensions.js";
import { TokenizationRegistry } from "../../../common/languages.js";
import { FontStyle, StandardTokenType, TokenMetadata } from "../../../common/encodedTokenAttributes.js";
import { NullState, nullTokenize, nullTokenizeEncoded } from "../../../common/languages/nullTokenize.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { IStandaloneThemeService } from "../../common/standaloneTheme.js";
import { InspectTokensNLS } from "../../../common/standaloneStrings.js";
let InspectTokensController = class extends Disposable {
  static get(editor) {
    return editor.getContribution(InspectTokensController.ID);
  }
  constructor(editor, standaloneColorService, languageService) {
    super();
    this._editor = editor;
    this._languageService = languageService;
    this._widget = null;
    this._register(this._editor.onDidChangeModel((e) => this.stop()));
    this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
    this._register(TokenizationRegistry.onDidChange((e) => this.stop()));
    this._register(this._editor.onKeyUp((e) => e.keyCode === KeyCode.Escape && this.stop()));
  }
  dispose() {
    this.stop();
    super.dispose();
  }
  launch() {
    if (this._widget) {
      return;
    }
    if (!this._editor.hasModel()) {
      return;
    }
    this._widget = new InspectTokensWidget(this._editor, this._languageService);
  }
  stop() {
    if (this._widget) {
      this._widget.dispose();
      this._widget = null;
    }
  }
};
InspectTokensController.ID = "editor.contrib.inspectTokens";
InspectTokensController = __decorateClass([
  __decorateParam(1, IStandaloneThemeService),
  __decorateParam(2, ILanguageService)
], InspectTokensController);
class InspectTokens extends EditorAction {
  constructor() {
    super({
      id: "editor.action.inspectTokens",
      label: InspectTokensNLS.inspectTokensAction,
      alias: "Developer: Inspect Tokens",
      precondition: void 0
    });
  }
  run(accessor, editor) {
    const controller = InspectTokensController.get(editor);
    controller?.launch();
  }
}
function renderTokenText(tokenText) {
  let result = "";
  for (let charIndex = 0, len = tokenText.length; charIndex < len; charIndex++) {
    const charCode = tokenText.charCodeAt(charIndex);
    switch (charCode) {
      case CharCode.Tab:
        result += "\u2192";
        break;
      case CharCode.Space:
        result += "\xB7";
        break;
      default:
        result += String.fromCharCode(charCode);
    }
  }
  return result;
}
function getSafeTokenizationSupport(languageIdCodec, languageId) {
  const tokenizationSupport = TokenizationRegistry.get(languageId);
  if (tokenizationSupport) {
    return tokenizationSupport;
  }
  const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
  return {
    getInitialState: () => NullState,
    tokenize: (line, hasEOL, state) => nullTokenize(languageId, state),
    tokenizeEncoded: (line, hasEOL, state) => nullTokenizeEncoded(encodedLanguageId, state)
  };
}
const _InspectTokensWidget = class _InspectTokensWidget extends Disposable {
  constructor(editor, languageService) {
    super();
    // Editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = true;
    this._editor = editor;
    this._languageService = languageService;
    this._model = this._editor.getModel();
    this._domNode = document.createElement("div");
    this._domNode.className = "tokens-inspect-widget";
    this._tokenizationSupport = getSafeTokenizationSupport(this._languageService.languageIdCodec, this._model.getLanguageId());
    this._compute(this._editor.getPosition());
    this._register(this._editor.onDidChangeCursorPosition((e) => this._compute(this._editor.getPosition())));
    this._editor.addContentWidget(this);
  }
  dispose() {
    this._editor.removeContentWidget(this);
    super.dispose();
  }
  getId() {
    return _InspectTokensWidget._ID;
  }
  _compute(position) {
    const data = this._getTokensAtLine(position.lineNumber);
    let token1Index = 0;
    for (let i = data.tokens1.length - 1; i >= 0; i--) {
      const t = data.tokens1[i];
      if (position.column - 1 >= t.offset) {
        token1Index = i;
        break;
      }
    }
    let token2Index = 0;
    for (let i = data.tokens2.length >>> 1; i >= 0; i--) {
      if (position.column - 1 >= data.tokens2[i << 1]) {
        token2Index = i;
        break;
      }
    }
    const lineContent = this._model.getLineContent(position.lineNumber);
    let tokenText = "";
    if (token1Index < data.tokens1.length) {
      const tokenStartIndex = data.tokens1[token1Index].offset;
      const tokenEndIndex = token1Index + 1 < data.tokens1.length ? data.tokens1[token1Index + 1].offset : lineContent.length;
      tokenText = lineContent.substring(tokenStartIndex, tokenEndIndex);
    }
    reset(
      this._domNode,
      $(
        "h2.tm-token",
        void 0,
        renderTokenText(tokenText),
        $("span.tm-token-length", void 0, `${tokenText.length} ${tokenText.length === 1 ? "char" : "chars"}`)
      )
    );
    append(this._domNode, $("hr.tokens-inspect-separator", { "style": "clear:both" }));
    const metadata = (token2Index << 1) + 1 < data.tokens2.length ? this._decodeMetadata(data.tokens2[(token2Index << 1) + 1]) : null;
    append(this._domNode, $(
      "table.tm-metadata-table",
      void 0,
      $(
        "tbody",
        void 0,
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "language"),
          $("td.tm-metadata-value", void 0, `${metadata ? metadata.languageId : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "token type"),
          $("td.tm-metadata-value", void 0, `${metadata ? this._tokenTypeToString(metadata.tokenType) : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "font style"),
          $("td.tm-metadata-value", void 0, `${metadata ? this._fontStyleToString(metadata.fontStyle) : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "foreground"),
          $("td.tm-metadata-value", void 0, `${metadata ? Color.Format.CSS.formatHex(metadata.foreground) : "-?-"}`)
        ),
        $(
          "tr",
          void 0,
          $("td.tm-metadata-key", void 0, "background"),
          $("td.tm-metadata-value", void 0, `${metadata ? Color.Format.CSS.formatHex(metadata.background) : "-?-"}`)
        )
      )
    ));
    append(this._domNode, $("hr.tokens-inspect-separator"));
    if (token1Index < data.tokens1.length) {
      append(this._domNode, $("span.tm-token-type", void 0, data.tokens1[token1Index].type));
    }
    this._editor.layoutContentWidget(this);
  }
  _decodeMetadata(metadata) {
    const colorMap = TokenizationRegistry.getColorMap();
    const languageId = TokenMetadata.getLanguageId(metadata);
    const tokenType = TokenMetadata.getTokenType(metadata);
    const fontStyle = TokenMetadata.getFontStyle(metadata);
    const foreground = TokenMetadata.getForeground(metadata);
    const background = TokenMetadata.getBackground(metadata);
    return {
      languageId: this._languageService.languageIdCodec.decodeLanguageId(languageId),
      tokenType,
      fontStyle,
      foreground: colorMap[foreground],
      background: colorMap[background]
    };
  }
  _tokenTypeToString(tokenType) {
    switch (tokenType) {
      case StandardTokenType.Other:
        return "Other";
      case StandardTokenType.Comment:
        return "Comment";
      case StandardTokenType.String:
        return "String";
      case StandardTokenType.RegEx:
        return "RegEx";
      default:
        return "??";
    }
  }
  _fontStyleToString(fontStyle) {
    let r = "";
    if (fontStyle & FontStyle.Italic) {
      r += "italic ";
    }
    if (fontStyle & FontStyle.Bold) {
      r += "bold ";
    }
    if (fontStyle & FontStyle.Underline) {
      r += "underline ";
    }
    if (fontStyle & FontStyle.Strikethrough) {
      r += "strikethrough ";
    }
    if (r.length === 0) {
      r = "---";
    }
    return r;
  }
  _getTokensAtLine(lineNumber) {
    const stateBeforeLine = this._getStateBeforeLine(lineNumber);
    const tokenizationResult1 = this._tokenizationSupport.tokenize(this._model.getLineContent(lineNumber), true, stateBeforeLine);
    const tokenizationResult2 = this._tokenizationSupport.tokenizeEncoded(this._model.getLineContent(lineNumber), true, stateBeforeLine);
    return {
      startState: stateBeforeLine,
      tokens1: tokenizationResult1.tokens,
      tokens2: tokenizationResult2.tokens,
      endState: tokenizationResult1.endState
    };
  }
  _getStateBeforeLine(lineNumber) {
    let state = this._tokenizationSupport.getInitialState();
    for (let i = 1; i < lineNumber; i++) {
      const tokenizationResult = this._tokenizationSupport.tokenize(this._model.getLineContent(i), true, state);
      state = tokenizationResult.endState;
    }
    return state;
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    return {
      position: this._editor.getPosition(),
      preference: [ContentWidgetPositionPreference.BELOW, ContentWidgetPositionPreference.ABOVE]
    };
  }
};
_InspectTokensWidget._ID = "editor.contrib.inspectTokensWidget";
let InspectTokensWidget = _InspectTokensWidget;
registerEditorContribution(InspectTokensController.ID, InspectTokensController, EditorContributionInstantiation.Lazy);
registerEditorAction(InspectTokens);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHN0YW5kYWxvbmVcXGJyb3dzZXJcXGluc3BlY3RUb2tlbnNcXGluc3BlY3RUb2tlbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vaW5zcGVjdFRva2Vucy5jc3MnO1xuaW1wb3J0IHsgJCwgYXBwZW5kLCByZXNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElBY3RpdmVDb2RlRWRpdG9yLCBJQ29kZUVkaXRvciwgSUNvbnRlbnRXaWRnZXQsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElTdGF0ZSwgSVRva2VuaXphdGlvblN1cHBvcnQsIFRva2VuaXphdGlvblJlZ2lzdHJ5LCBJTGFuZ3VhZ2VJZENvZGVjLCBUb2tlbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgRm9udFN0eWxlLCBTdGFuZGFyZFRva2VuVHlwZSwgVG9rZW5NZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IE51bGxTdGF0ZSwgbnVsbFRva2VuaXplLCBudWxsVG9rZW5pemVFbmNvZGVkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhbmRhbG9uZVRoZW1lLmpzJztcbmltcG9ydCB7IEluc3BlY3RUb2tlbnNOTFMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhbmRhbG9uZVN0cmluZ3MuanMnO1xuXG5cbmNsYXNzIEluc3BlY3RUb2tlbnNDb250cm9sbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIuaW5zcGVjdFRva2Vucyc7XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IEluc3BlY3RUb2tlbnNDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248SW5zcGVjdFRva2Vuc0NvbnRyb2xsZXI+KEluc3BlY3RUb2tlbnNDb250cm9sbGVyLklEKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0cHJpdmF0ZSBfd2lkZ2V0OiBJbnNwZWN0VG9rZW5zV2lkZ2V0IHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSBzdGFuZGFsb25lQ29sb3JTZXJ2aWNlOiBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlO1xuXHRcdHRoaXMuX3dpZGdldCA9IG51bGw7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoZSkgPT4gdGhpcy5zdG9wKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlKChlKSA9PiB0aGlzLnN0b3AoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFRva2VuaXphdGlvblJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKChlKSA9PiB0aGlzLnN0b3AoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbktleVVwKChlKSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRXNjYXBlICYmIHRoaXMuc3RvcCgpKSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3AoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgbGF1bmNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl93aWRnZXQgPSBuZXcgSW5zcGVjdFRva2Vuc1dpZGdldCh0aGlzLl9lZGl0b3IsIHRoaXMuX2xhbmd1YWdlU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl93aWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0ID0gbnVsbDtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSW5zcGVjdFRva2VucyBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmluc3BlY3RUb2tlbnMnLFxuXHRcdFx0bGFiZWw6IEluc3BlY3RUb2tlbnNOTFMuaW5zcGVjdFRva2Vuc0FjdGlvbixcblx0XHRcdGFsaWFzOiAnRGV2ZWxvcGVyOiBJbnNwZWN0IFRva2VucycsXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBJbnNwZWN0VG9rZW5zQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRjb250cm9sbGVyPy5sYXVuY2goKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNvbXBsZXRlTGluZVRva2VuaXphdGlvbiB7XG5cdHN0YXJ0U3RhdGU6IElTdGF0ZTtcblx0dG9rZW5zMTogVG9rZW5bXTtcblx0dG9rZW5zMjogVWludDMyQXJyYXk7XG5cdGVuZFN0YXRlOiBJU3RhdGU7XG59XG5cbmludGVyZmFjZSBJRGVjb2RlZE1ldGFkYXRhIHtcblx0bGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHR0b2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlO1xuXHRmb250U3R5bGU6IEZvbnRTdHlsZTtcblx0Zm9yZWdyb3VuZDogQ29sb3I7XG5cdGJhY2tncm91bmQ6IENvbG9yO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUb2tlblRleHQodG9rZW5UZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRsZXQgcmVzdWx0OiBzdHJpbmcgPSAnJztcblx0Zm9yIChsZXQgY2hhckluZGV4ID0gMCwgbGVuID0gdG9rZW5UZXh0Lmxlbmd0aDsgY2hhckluZGV4IDwgbGVuOyBjaGFySW5kZXgrKykge1xuXHRcdGNvbnN0IGNoYXJDb2RlID0gdG9rZW5UZXh0LmNoYXJDb2RlQXQoY2hhckluZGV4KTtcblx0XHRzd2l0Y2ggKGNoYXJDb2RlKSB7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlRhYjpcblx0XHRcdFx0cmVzdWx0ICs9ICdcXHUyMTkyJzsgLy8gJnJhcnI7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIENoYXJDb2RlLlNwYWNlOlxuXHRcdFx0XHRyZXN1bHQgKz0gJ1xcdTAwQjcnOyAvLyAmbWlkZG90O1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhckNvZGUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiBnZXRTYWZlVG9rZW5pemF0aW9uU3VwcG9ydChsYW5ndWFnZUlkQ29kZWM6IElMYW5ndWFnZUlkQ29kZWMsIGxhbmd1YWdlSWQ6IHN0cmluZyk6IElUb2tlbml6YXRpb25TdXBwb3J0IHtcblx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldChsYW5ndWFnZUlkKTtcblx0aWYgKHRva2VuaXphdGlvblN1cHBvcnQpIHtcblx0XHRyZXR1cm4gdG9rZW5pemF0aW9uU3VwcG9ydDtcblx0fVxuXHRjb25zdCBlbmNvZGVkTGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXHRyZXR1cm4ge1xuXHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdHRva2VuaXplOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpID0+IG51bGxUb2tlbml6ZShsYW5ndWFnZUlkLCBzdGF0ZSksXG5cdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpID0+IG51bGxUb2tlbml6ZUVuY29kZWQoZW5jb2RlZExhbmd1YWdlSWQsIHN0YXRlKVxuXHR9O1xufVxuXG5jbGFzcyBJbnNwZWN0VG9rZW5zV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb250ZW50V2lkZ2V0IHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfSUQgPSAnZWRpdG9yLmNvbnRyaWIuaW5zcGVjdFRva2Vuc1dpZGdldCc7XG5cblx0Ly8gRWRpdG9yLklDb250ZW50V2lkZ2V0LmFsbG93RWRpdG9yT3ZlcmZsb3dcblx0cHVibGljIGFsbG93RWRpdG9yT3ZlcmZsb3cgPSB0cnVlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3I7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRcdGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLl9sYW5ndWFnZVNlcnZpY2UgPSBsYW5ndWFnZVNlcnZpY2U7XG5cdFx0dGhpcy5fbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHR0aGlzLl9kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc05hbWUgPSAndG9rZW5zLWluc3BlY3Qtd2lkZ2V0Jztcblx0XHR0aGlzLl90b2tlbml6YXRpb25TdXBwb3J0ID0gZ2V0U2FmZVRva2VuaXphdGlvblN1cHBvcnQodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYywgdGhpcy5fbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHR0aGlzLl9jb21wdXRlKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZSkgPT4gdGhpcy5fY29tcHV0ZSh0aGlzLl9lZGl0b3IuZ2V0UG9zaXRpb24oKSkpKTtcblx0XHR0aGlzLl9lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBJbnNwZWN0VG9rZW5zV2lkZ2V0Ll9JRDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXB1dGUocG9zaXRpb246IFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2dldFRva2Vuc0F0TGluZShwb3NpdGlvbi5saW5lTnVtYmVyKTtcblxuXHRcdGxldCB0b2tlbjFJbmRleCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IGRhdGEudG9rZW5zMS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgdCA9IGRhdGEudG9rZW5zMVtpXTtcblx0XHRcdGlmIChwb3NpdGlvbi5jb2x1bW4gLSAxID49IHQub2Zmc2V0KSB7XG5cdFx0XHRcdHRva2VuMUluZGV4ID0gaTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHRva2VuMkluZGV4ID0gMDtcblx0XHRmb3IgKGxldCBpID0gKGRhdGEudG9rZW5zMi5sZW5ndGggPj4+IDEpOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHBvc2l0aW9uLmNvbHVtbiAtIDEgPj0gZGF0YS50b2tlbnMyWyhpIDw8IDEpXSkge1xuXHRcdFx0XHR0b2tlbjJJbmRleCA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gdGhpcy5fbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0bGV0IHRva2VuVGV4dCA9ICcnO1xuXHRcdGlmICh0b2tlbjFJbmRleCA8IGRhdGEudG9rZW5zMS5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHRva2VuU3RhcnRJbmRleCA9IGRhdGEudG9rZW5zMVt0b2tlbjFJbmRleF0ub2Zmc2V0O1xuXHRcdFx0Y29uc3QgdG9rZW5FbmRJbmRleCA9IHRva2VuMUluZGV4ICsgMSA8IGRhdGEudG9rZW5zMS5sZW5ndGggPyBkYXRhLnRva2VuczFbdG9rZW4xSW5kZXggKyAxXS5vZmZzZXQgOiBsaW5lQ29udGVudC5sZW5ndGg7XG5cdFx0XHR0b2tlblRleHQgPSBsaW5lQ29udGVudC5zdWJzdHJpbmcodG9rZW5TdGFydEluZGV4LCB0b2tlbkVuZEluZGV4KTtcblx0XHR9XG5cdFx0cmVzZXQodGhpcy5fZG9tTm9kZSxcblx0XHRcdCQoJ2gyLnRtLXRva2VuJywgdW5kZWZpbmVkLCByZW5kZXJUb2tlblRleHQodG9rZW5UZXh0KSxcblx0XHRcdFx0JCgnc3Bhbi50bS10b2tlbi1sZW5ndGgnLCB1bmRlZmluZWQsIGAke3Rva2VuVGV4dC5sZW5ndGh9ICR7dG9rZW5UZXh0Lmxlbmd0aCA9PT0gMSA/ICdjaGFyJyA6ICdjaGFycyd9YCkpKTtcblxuXHRcdGFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCdoci50b2tlbnMtaW5zcGVjdC1zZXBhcmF0b3InLCB7ICdzdHlsZSc6ICdjbGVhcjpib3RoJyB9KSk7XG5cblx0XHRjb25zdCBtZXRhZGF0YSA9ICh0b2tlbjJJbmRleCA8PCAxKSArIDEgPCBkYXRhLnRva2VuczIubGVuZ3RoID8gdGhpcy5fZGVjb2RlTWV0YWRhdGEoZGF0YS50b2tlbnMyWyh0b2tlbjJJbmRleCA8PCAxKSArIDFdKSA6IG51bGw7XG5cdFx0YXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJ3RhYmxlLnRtLW1ldGFkYXRhLXRhYmxlJywgdW5kZWZpbmVkLFxuXHRcdFx0JCgndGJvZHknLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLWtleScsIHVuZGVmaW5lZCwgJ2xhbmd1YWdlJyksXG5cdFx0XHRcdFx0JCgndGQudG0tbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGAke21ldGFkYXRhID8gbWV0YWRhdGEubGFuZ3VhZ2VJZCA6ICctPy0nfWApXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLWtleScsIHVuZGVmaW5lZCwgJ3Rva2VuIHR5cGUnIGFzIHN0cmluZyksXG5cdFx0XHRcdFx0JCgndGQudG0tbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGAke21ldGFkYXRhID8gdGhpcy5fdG9rZW5UeXBlVG9TdHJpbmcobWV0YWRhdGEudG9rZW5UeXBlKSA6ICctPy0nfWApXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLWtleScsIHVuZGVmaW5lZCwgJ2ZvbnQgc3R5bGUnIGFzIHN0cmluZyksXG5cdFx0XHRcdFx0JCgndGQudG0tbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGAke21ldGFkYXRhID8gdGhpcy5fZm9udFN0eWxlVG9TdHJpbmcobWV0YWRhdGEuZm9udFN0eWxlKSA6ICctPy0nfWApXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLWtleScsIHVuZGVmaW5lZCwgJ2ZvcmVncm91bmQnKSxcblx0XHRcdFx0XHQkKCd0ZC50bS1tZXRhZGF0YS12YWx1ZScsIHVuZGVmaW5lZCwgYCR7bWV0YWRhdGEgPyBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleChtZXRhZGF0YS5mb3JlZ3JvdW5kKSA6ICctPy0nfWApXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRtLW1ldGFkYXRhLWtleScsIHVuZGVmaW5lZCwgJ2JhY2tncm91bmQnKSxcblx0XHRcdFx0XHQkKCd0ZC50bS1tZXRhZGF0YS12YWx1ZScsIHVuZGVmaW5lZCwgYCR7bWV0YWRhdGEgPyBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleChtZXRhZGF0YS5iYWNrZ3JvdW5kKSA6ICctPy0nfWApXG5cdFx0XHRcdClcblx0XHRcdClcblx0XHQpKTtcblx0XHRhcHBlbmQodGhpcy5fZG9tTm9kZSwgJCgnaHIudG9rZW5zLWluc3BlY3Qtc2VwYXJhdG9yJykpO1xuXG5cdFx0aWYgKHRva2VuMUluZGV4IDwgZGF0YS50b2tlbnMxLmxlbmd0aCkge1xuXHRcdFx0YXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJ3NwYW4udG0tdG9rZW4tdHlwZScsIHVuZGVmaW5lZCwgZGF0YS50b2tlbnMxW3Rva2VuMUluZGV4XS50eXBlKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwcml2YXRlIF9kZWNvZGVNZXRhZGF0YShtZXRhZGF0YTogbnVtYmVyKTogSURlY29kZWRNZXRhZGF0YSB7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXRDb2xvck1hcCgpITtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gVG9rZW5NZXRhZGF0YS5nZXRMYW5ndWFnZUlkKG1ldGFkYXRhKTtcblx0XHRjb25zdCB0b2tlblR5cGUgPSBUb2tlbk1ldGFkYXRhLmdldFRva2VuVHlwZShtZXRhZGF0YSk7XG5cdFx0Y29uc3QgZm9udFN0eWxlID0gVG9rZW5NZXRhZGF0YS5nZXRGb250U3R5bGUobWV0YWRhdGEpO1xuXHRcdGNvbnN0IGZvcmVncm91bmQgPSBUb2tlbk1ldGFkYXRhLmdldEZvcmVncm91bmQobWV0YWRhdGEpO1xuXHRcdGNvbnN0IGJhY2tncm91bmQgPSBUb2tlbk1ldGFkYXRhLmdldEJhY2tncm91bmQobWV0YWRhdGEpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsYW5ndWFnZUlkOiB0aGlzLl9sYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmRlY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCksXG5cdFx0XHR0b2tlblR5cGU6IHRva2VuVHlwZSxcblx0XHRcdGZvbnRTdHlsZTogZm9udFN0eWxlLFxuXHRcdFx0Zm9yZWdyb3VuZDogY29sb3JNYXBbZm9yZWdyb3VuZF0sXG5cdFx0XHRiYWNrZ3JvdW5kOiBjb2xvck1hcFtiYWNrZ3JvdW5kXVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF90b2tlblR5cGVUb1N0cmluZyh0b2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHRva2VuVHlwZSkge1xuXHRcdFx0Y2FzZSBTdGFuZGFyZFRva2VuVHlwZS5PdGhlcjogcmV0dXJuICdPdGhlcic7XG5cdFx0XHRjYXNlIFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQ6IHJldHVybiAnQ29tbWVudCc7XG5cdFx0XHRjYXNlIFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZzogcmV0dXJuICdTdHJpbmcnO1xuXHRcdFx0Y2FzZSBTdGFuZGFyZFRva2VuVHlwZS5SZWdFeDogcmV0dXJuICdSZWdFeCc7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gJz8/Jztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mb250U3R5bGVUb1N0cmluZyhmb250U3R5bGU6IEZvbnRTdHlsZSk6IHN0cmluZyB7XG5cdFx0bGV0IHIgPSAnJztcblx0XHRpZiAoZm9udFN0eWxlICYgRm9udFN0eWxlLkl0YWxpYykge1xuXHRcdFx0ciArPSAnaXRhbGljICc7XG5cdFx0fVxuXHRcdGlmIChmb250U3R5bGUgJiBGb250U3R5bGUuQm9sZCkge1xuXHRcdFx0ciArPSAnYm9sZCAnO1xuXHRcdH1cblx0XHRpZiAoZm9udFN0eWxlICYgRm9udFN0eWxlLlVuZGVybGluZSkge1xuXHRcdFx0ciArPSAndW5kZXJsaW5lICc7XG5cdFx0fVxuXHRcdGlmIChmb250U3R5bGUgJiBGb250U3R5bGUuU3RyaWtldGhyb3VnaCkge1xuXHRcdFx0ciArPSAnc3RyaWtldGhyb3VnaCAnO1xuXHRcdH1cblx0XHRpZiAoci5sZW5ndGggPT09IDApIHtcblx0XHRcdHIgPSAnLS0tJztcblx0XHR9XG5cdFx0cmV0dXJuIHI7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb2tlbnNBdExpbmUobGluZU51bWJlcjogbnVtYmVyKTogSUNvbXBsZXRlTGluZVRva2VuaXphdGlvbiB7XG5cdFx0Y29uc3Qgc3RhdGVCZWZvcmVMaW5lID0gdGhpcy5fZ2V0U3RhdGVCZWZvcmVMaW5lKGxpbmVOdW1iZXIpO1xuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0MSA9IHRoaXMuX3Rva2VuaXphdGlvblN1cHBvcnQudG9rZW5pemUodGhpcy5fbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlciksIHRydWUsIHN0YXRlQmVmb3JlTGluZSk7XG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0MiA9IHRoaXMuX3Rva2VuaXphdGlvblN1cHBvcnQudG9rZW5pemVFbmNvZGVkKHRoaXMuX21vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpLCB0cnVlLCBzdGF0ZUJlZm9yZUxpbmUpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN0YXJ0U3RhdGU6IHN0YXRlQmVmb3JlTGluZSxcblx0XHRcdHRva2VuczE6IHRva2VuaXphdGlvblJlc3VsdDEudG9rZW5zLFxuXHRcdFx0dG9rZW5zMjogdG9rZW5pemF0aW9uUmVzdWx0Mi50b2tlbnMsXG5cdFx0XHRlbmRTdGF0ZTogdG9rZW5pemF0aW9uUmVzdWx0MS5lbmRTdGF0ZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdGF0ZUJlZm9yZUxpbmUobGluZU51bWJlcjogbnVtYmVyKTogSVN0YXRlIHtcblx0XHRsZXQgc3RhdGU6IElTdGF0ZSA9IHRoaXMuX3Rva2VuaXphdGlvblN1cHBvcnQuZ2V0SW5pdGlhbFN0YXRlKCk7XG5cblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGxpbmVOdW1iZXI7IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0ID0gdGhpcy5fdG9rZW5pemF0aW9uU3VwcG9ydC50b2tlbml6ZSh0aGlzLl9tb2RlbC5nZXRMaW5lQ29udGVudChpKSwgdHJ1ZSwgc3RhdGUpO1xuXHRcdFx0c3RhdGUgPSB0b2tlbml6YXRpb25SZXN1bHQuZW5kU3RhdGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHVibGljIGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCksXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPVywgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRV1cblx0XHR9O1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKEluc3BlY3RUb2tlbnNDb250cm9sbGVyLklELCBJbnNwZWN0VG9rZW5zQ29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5MYXp5KTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluc3BlY3RUb2tlbnMpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLFFBQVEsYUFBYTtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFT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
