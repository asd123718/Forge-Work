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
import "./inspectEditorTokens.css";
import * as nls from "../../../../../nls.js";
import * as dom from "../../../../../base/browser/dom.js";
import { CharCode } from "../../../../../base/common/charCode.js";
import { Color } from "../../../../../base/common/color.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { ContentWidgetPositionPreference } from "../../../../../editor/browser/editorBrowser.js";
import { EditorAction, registerEditorAction, registerEditorContribution, EditorContributionInstantiation } from "../../../../../editor/browser/editorExtensions.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { FontStyle, ColorId, StandardTokenType, TokenMetadata } from "../../../../../editor/common/encodedTokenAttributes.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { findMatchingThemeRule } from "../../../../services/textMate/common/TMHelper.js";
import { ITextMateTokenizationService } from "../../../../services/textMate/browser/textMateTokenizationFeature.js";
import { IWorkbenchThemeService } from "../../../../services/themes/common/workbenchThemeService.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { SemanticTokenRule } from "../../../../../platform/theme/common/tokenClassificationRegistry.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { SEMANTIC_HIGHLIGHTING_SETTING_ID } from "../../../../../editor/contrib/semanticTokens/common/semanticTokensConfig.js";
import { Schemas } from "../../../../../base/common/network.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { TreeSitterSyntaxTokenBackend } from "../../../../../editor/common/model/tokens/treeSitter/treeSitterSyntaxTokenBackend.js";
const $ = dom.$;
let InspectEditorTokensController = class extends Disposable {
  static get(editor) {
    return editor.getContribution(InspectEditorTokensController.ID);
  }
  constructor(editor, textMateService, languageService, themeService, notificationService, configurationService, languageFeaturesService) {
    super();
    this._editor = editor;
    this._textMateService = textMateService;
    this._themeService = themeService;
    this._languageService = languageService;
    this._notificationService = notificationService;
    this._configurationService = configurationService;
    this._languageFeaturesService = languageFeaturesService;
    this._widget = null;
    this._register(this._editor.onDidChangeModel((e) => this.stop()));
    this._register(this._editor.onDidChangeModelLanguage((e) => this.stop()));
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
    if (this._editor.getModel().uri.scheme === Schemas.vscodeNotebookCell) {
      return;
    }
    this._widget = new InspectEditorTokensWidget(this._editor, this._textMateService, this._languageService, this._themeService, this._notificationService, this._configurationService, this._languageFeaturesService);
  }
  stop() {
    if (this._widget) {
      this._widget.dispose();
      this._widget = null;
    }
  }
  toggle() {
    if (!this._widget) {
      this.launch();
    } else {
      this.stop();
    }
  }
};
InspectEditorTokensController.ID = "editor.contrib.inspectEditorTokens";
InspectEditorTokensController = __decorateClass([
  __decorateParam(1, ITextMateTokenizationService),
  __decorateParam(2, ILanguageService),
  __decorateParam(3, IWorkbenchThemeService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILanguageFeaturesService)
], InspectEditorTokensController);
class InspectEditorTokens extends EditorAction {
  constructor() {
    super({
      id: "editor.action.inspectTMScopes",
      label: nls.localize2("inspectEditorTokens", "Developer: Inspect Editor Tokens and Scopes"),
      precondition: void 0
    });
  }
  run(accessor, editor) {
    const controller = InspectEditorTokensController.get(editor);
    controller?.toggle();
  }
}
function renderTokenText(tokenText) {
  if (tokenText.length > 40) {
    tokenText = tokenText.substr(0, 20) + "\u2026" + tokenText.substr(tokenText.length - 20);
  }
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
const _InspectEditorTokensWidget = class _InspectEditorTokensWidget extends Disposable {
  constructor(editor, textMateService, languageService, themeService, notificationService, configurationService, languageFeaturesService) {
    super();
    // Editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = true;
    this._isDisposed = false;
    this._editor = editor;
    this._languageService = languageService;
    this._themeService = themeService;
    this._textMateService = textMateService;
    this._notificationService = notificationService;
    this._configurationService = configurationService;
    this._languageFeaturesService = languageFeaturesService;
    this._model = this._editor.getModel();
    this._domNode = document.createElement("div");
    this._domNode.className = "token-inspect-widget";
    this._currentRequestCancellationTokenSource = new CancellationTokenSource();
    this._beginCompute(this._editor.getPosition());
    this._register(this._editor.onDidChangeCursorPosition((e) => this._beginCompute(this._editor.getPosition())));
    this._register(themeService.onDidColorThemeChange((_) => this._beginCompute(this._editor.getPosition())));
    this._register(configurationService.onDidChangeConfiguration((e) => e.affectsConfiguration("editor.semanticHighlighting.enabled") && this._beginCompute(this._editor.getPosition())));
    this._editor.addContentWidget(this);
  }
  dispose() {
    this._isDisposed = true;
    this._editor.removeContentWidget(this);
    this._currentRequestCancellationTokenSource.cancel();
    super.dispose();
  }
  getId() {
    return _InspectEditorTokensWidget._ID;
  }
  _beginCompute(position) {
    const grammar = this._textMateService.createTokenizer(this._model.getLanguageId());
    const semanticTokens = this._computeSemanticTokens(position);
    const backend = this._model.tokenization.tokens.get();
    const asTreeSitterBackend = backend instanceof TreeSitterSyntaxTokenBackend ? backend : void 0;
    dom.clearNode(this._domNode);
    this._domNode.appendChild(document.createTextNode(nls.localize("inspectTMScopesWidget.loading", "Loading...")));
    Promise.all([grammar, semanticTokens]).then(([grammar2, semanticTokens2]) => {
      if (this._isDisposed) {
        return;
      }
      const treeSitterTree = asTreeSitterBackend?.tree.get();
      this._compute(grammar2, semanticTokens2, treeSitterTree, position);
      this._domNode.style.maxWidth = `${Math.max(this._editor.getLayoutInfo().width * 0.66, 500)}px`;
      this._editor.layoutContentWidget(this);
    }, (err) => {
      this._notificationService.warn(err);
      setTimeout(() => {
        InspectEditorTokensController.get(this._editor)?.stop();
      });
    });
  }
  _isSemanticColoringEnabled() {
    const setting = this._configurationService.getValue(SEMANTIC_HIGHLIGHTING_SETTING_ID, { overrideIdentifier: this._model.getLanguageId(), resource: this._model.uri })?.enabled;
    if (typeof setting === "boolean") {
      return setting;
    }
    return this._themeService.getColorTheme().semanticHighlighting;
  }
  _compute(grammar, semanticTokens, tree, position) {
    const textMateTokenInfo = grammar && this._getTokensAtPosition(grammar, position);
    const semanticTokenInfo = semanticTokens && this._getSemanticTokenAtPosition(semanticTokens, position);
    const treeSitterTokenInfo = tree && this._getTreeSitterTokenAtPosition(tree, position);
    if (!textMateTokenInfo && !semanticTokenInfo && !treeSitterTokenInfo) {
      dom.reset(this._domNode, "No grammar or semantic tokens available.");
      return;
    }
    const tmMetadata = textMateTokenInfo?.metadata;
    const semMetadata = semanticTokenInfo?.metadata;
    const semTokenText = semanticTokenInfo && renderTokenText(this._model.getValueInRange(semanticTokenInfo.range));
    const tmTokenText = textMateTokenInfo && renderTokenText(this._model.getLineContent(position.lineNumber).substring(textMateTokenInfo.token.startIndex, textMateTokenInfo.token.endIndex));
    const semTokenLength = semanticTokenInfo && this._model.getValueLengthInRange(semanticTokenInfo.range);
    const tmTokenLength = textMateTokenInfo && textMateTokenInfo.token.endIndex - textMateTokenInfo.token.startIndex;
    const tokenText = semTokenText || tmTokenText || "";
    const tokenLength = semTokenLength || tmTokenLength || 0;
    dom.reset(
      this._domNode,
      $(
        "h2.tiw-token",
        void 0,
        tokenText,
        $("span.tiw-token-length", void 0, `${tokenLength} ${tokenLength === 1 ? "char" : "chars"}`)
      )
    );
    dom.append(this._domNode, $("hr.tiw-metadata-separator", { "style": "clear:both" }));
    dom.append(this._domNode, $(
      "table.tiw-metadata-table",
      void 0,
      $(
        "tbody",
        void 0,
        $(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "language"),
          $("td.tiw-metadata-value", void 0, tmMetadata?.languageId || "")
        ),
        $(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "standard token type"),
          $("td.tiw-metadata-value", void 0, this._tokenTypeToString(tmMetadata?.tokenType || StandardTokenType.Other))
        ),
        ...this._formatMetadata(semMetadata, tmMetadata)
      )
    ));
    if (semanticTokenInfo) {
      dom.append(this._domNode, $("hr.tiw-metadata-separator"));
      const table = dom.append(this._domNode, $("table.tiw-metadata-table", void 0));
      const tbody = dom.append(table, $(
        "tbody",
        void 0,
        $(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "semantic token type"),
          $("td.tiw-metadata-value", void 0, semanticTokenInfo.type)
        )
      ));
      if (semanticTokenInfo.modifiers.length) {
        dom.append(tbody, $(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "modifiers"),
          $("td.tiw-metadata-value", void 0, semanticTokenInfo.modifiers.join(" "))
        ));
      }
      if (semanticTokenInfo.metadata) {
        const properties = ["foreground", "bold", "italic", "underline", "strikethrough"];
        const propertiesByDefValue = {};
        const allDefValues = new Array();
        for (const property of properties) {
          if (semanticTokenInfo.metadata[property] !== void 0) {
            const definition = semanticTokenInfo.definitions[property];
            const defValue = this._renderTokenStyleDefinition(definition, property);
            const defValueStr = defValue.map((el) => dom.isHTMLElement(el) ? el.outerHTML : el).join();
            let properties2 = propertiesByDefValue[defValueStr];
            if (!properties2) {
              propertiesByDefValue[defValueStr] = properties2 = [];
              allDefValues.push([defValue, defValueStr]);
            }
            properties2.push(property);
          }
        }
        for (const [defValue, defValueStr] of allDefValues) {
          dom.append(tbody, $(
            "tr",
            void 0,
            $("td.tiw-metadata-key", void 0, propertiesByDefValue[defValueStr].join(", ")),
            $("td.tiw-metadata-value", void 0, ...defValue)
          ));
        }
      }
    }
    if (textMateTokenInfo) {
      const theme = this._themeService.getColorTheme();
      dom.append(this._domNode, $("hr.tiw-metadata-separator"));
      const table = dom.append(this._domNode, $("table.tiw-metadata-table"));
      const tbody = dom.append(table, $("tbody"));
      if (tmTokenText && tmTokenText !== tokenText) {
        dom.append(tbody, $(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "textmate token"),
          $("td.tiw-metadata-value", void 0, `${tmTokenText} (${tmTokenText.length})`)
        ));
      }
      const scopes = new Array();
      for (let i = textMateTokenInfo.token.scopes.length - 1; i >= 0; i--) {
        scopes.push(textMateTokenInfo.token.scopes[i]);
        if (i > 0) {
          scopes.push($("br"));
        }
      }
      dom.append(tbody, $(
        "tr",
        void 0,
        $("td.tiw-metadata-key", void 0, "textmate scopes"),
        $("td.tiw-metadata-value.tiw-metadata-scopes", void 0, ...scopes)
      ));
      const matchingRule = findMatchingThemeRule(theme, textMateTokenInfo.token.scopes, false);
      const semForeground = semanticTokenInfo?.metadata?.foreground;
      if (matchingRule) {
        if (semForeground !== textMateTokenInfo.metadata.foreground) {
          let defValue = $(
            "code.tiw-theme-selector",
            void 0,
            matchingRule.rawSelector,
            $("br"),
            JSON.stringify(matchingRule.settings, null, "	")
          );
          if (semForeground) {
            defValue = $("s", void 0, defValue);
          }
          dom.append(tbody, $(
            "tr",
            void 0,
            $("td.tiw-metadata-key", void 0, "foreground"),
            $("td.tiw-metadata-value", void 0, defValue)
          ));
        }
      } else if (!semForeground) {
        dom.append(tbody, $(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "foreground"),
          $("td.tiw-metadata-value", void 0, "No theme selector")
        ));
      }
    }
    if (treeSitterTokenInfo) {
      const lastTokenInfo = treeSitterTokenInfo[treeSitterTokenInfo.length - 1];
      dom.append(this._domNode, $("hr.tiw-metadata-separator"));
      const table = dom.append(this._domNode, $("table.tiw-metadata-table"));
      const tbody = dom.append(table, $("tbody"));
      dom.append(tbody, $(
        "tr",
        void 0,
        $("td.tiw-metadata-key", void 0, `tree-sitter token ${lastTokenInfo.id}`),
        $("td.tiw-metadata-value", void 0, `${lastTokenInfo.text}`)
      ));
      const scopes = new Array();
      let i = treeSitterTokenInfo.length - 1;
      let node = treeSitterTokenInfo[i];
      while (node.parent || i > 0) {
        scopes.push(node.type);
        node = node.parent ?? treeSitterTokenInfo[--i];
        if (node) {
          scopes.push($("br"));
        }
      }
      dom.append(tbody, $(
        "tr",
        void 0,
        $("td.tiw-metadata-key", void 0, "tree-sitter tree"),
        $("td.tiw-metadata-value.tiw-metadata-scopes", void 0, ...scopes)
      ));
      const tokenizationSupport = this._model.tokenization.tokens.get().tokenizationImpl.get();
      const captures = tokenizationSupport?.captureAtPosition(position.lineNumber, position.column);
      if (captures && captures.length > 0) {
        dom.append(tbody, $(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "foreground"),
          $("td.tiw-metadata-value", void 0, captures.map((cap) => cap.name).join(" "))
        ));
      }
    }
  }
  _formatMetadata(semantic, tm) {
    const elements = new Array();
    function render(property) {
      const value = semantic?.[property] || tm?.[property];
      if (value !== void 0) {
        const semanticStyle = semantic?.[property] ? "tiw-metadata-semantic" : "";
        elements.push($(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, property),
          $(`td.tiw-metadata-value.${semanticStyle}`, void 0, value)
        ));
      }
      return value;
    }
    const foreground = render("foreground");
    const background = render("background");
    if (foreground && background) {
      const backgroundColor = Color.fromHex(background), foregroundColor = Color.fromHex(foreground);
      if (backgroundColor.isOpaque()) {
        elements.push($(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "contrast ratio"),
          $("td.tiw-metadata-value", void 0, backgroundColor.getContrastRatio(foregroundColor.makeOpaque(backgroundColor)).toFixed(2))
        ));
      } else {
        elements.push($(
          "tr",
          void 0,
          $("td.tiw-metadata-key", void 0, "Contrast ratio cannot be precise for background colors that use transparency"),
          $("td.tiw-metadata-value")
        ));
      }
    }
    const fontStyleLabels = new Array();
    function addStyle(key) {
      let label;
      if (semantic && semantic[key]) {
        label = $("span.tiw-metadata-semantic", void 0, key);
      } else if (tm && tm[key]) {
        label = key;
      }
      if (label) {
        if (fontStyleLabels.length) {
          fontStyleLabels.push(" ");
        }
        fontStyleLabels.push(label);
      }
    }
    addStyle("bold");
    addStyle("italic");
    addStyle("underline");
    addStyle("strikethrough");
    if (fontStyleLabels.length) {
      elements.push($(
        "tr",
        void 0,
        $("td.tiw-metadata-key", void 0, "font style"),
        $("td.tiw-metadata-value", void 0, ...fontStyleLabels)
      ));
    }
    return elements;
  }
  _decodeMetadata(metadata) {
    const colorMap = this._themeService.getColorTheme().tokenColorMap;
    const languageId = TokenMetadata.getLanguageId(metadata);
    const tokenType = TokenMetadata.getTokenType(metadata);
    const fontStyle = TokenMetadata.getFontStyle(metadata);
    const foreground = TokenMetadata.getForeground(metadata);
    const background = TokenMetadata.getBackground(metadata);
    return {
      languageId: this._languageService.languageIdCodec.decodeLanguageId(languageId),
      tokenType,
      bold: fontStyle & FontStyle.Bold ? true : void 0,
      italic: fontStyle & FontStyle.Italic ? true : void 0,
      underline: fontStyle & FontStyle.Underline ? true : void 0,
      strikethrough: fontStyle & FontStyle.Strikethrough ? true : void 0,
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
  _getTokensAtPosition(grammar, position) {
    const lineNumber = position.lineNumber;
    const stateBeforeLine = this._getStateBeforeLine(grammar, lineNumber);
    const tokenizationResult1 = grammar.tokenizeLine(this._model.getLineContent(lineNumber), stateBeforeLine);
    const tokenizationResult2 = grammar.tokenizeLine2(this._model.getLineContent(lineNumber), stateBeforeLine);
    let token1Index = 0;
    for (let i = tokenizationResult1.tokens.length - 1; i >= 0; i--) {
      const t = tokenizationResult1.tokens[i];
      if (position.column - 1 >= t.startIndex) {
        token1Index = i;
        break;
      }
    }
    let token2Index = 0;
    for (let i = tokenizationResult2.tokens.length >>> 1; i >= 0; i--) {
      if (position.column - 1 >= tokenizationResult2.tokens[i << 1]) {
        token2Index = i;
        break;
      }
    }
    return {
      token: tokenizationResult1.tokens[token1Index],
      metadata: this._decodeMetadata(tokenizationResult2.tokens[(token2Index << 1) + 1])
    };
  }
  _getStateBeforeLine(grammar, lineNumber) {
    let state = null;
    for (let i = 1; i < lineNumber; i++) {
      const tokenizationResult = grammar.tokenizeLine(this._model.getLineContent(i), state);
      state = tokenizationResult.ruleStack;
    }
    return state;
  }
  isSemanticTokens(token) {
    return token && token.data;
  }
  async _computeSemanticTokens(position) {
    if (!this._isSemanticColoringEnabled()) {
      return null;
    }
    const tokenProviders = this._languageFeaturesService.documentSemanticTokensProvider.ordered(this._model);
    if (tokenProviders.length) {
      const provider = tokenProviders[0];
      const tokens = await Promise.resolve(provider.provideDocumentSemanticTokens(this._model, null, this._currentRequestCancellationTokenSource.token));
      if (this.isSemanticTokens(tokens)) {
        return { tokens, legend: provider.getLegend() };
      }
    }
    const rangeTokenProviders = this._languageFeaturesService.documentRangeSemanticTokensProvider.ordered(this._model);
    if (rangeTokenProviders.length) {
      const provider = rangeTokenProviders[0];
      const lineNumber = position.lineNumber;
      const range = new Range(lineNumber, 1, lineNumber, this._model.getLineMaxColumn(lineNumber));
      const tokens = await Promise.resolve(provider.provideDocumentRangeSemanticTokens(this._model, range, this._currentRequestCancellationTokenSource.token));
      if (this.isSemanticTokens(tokens)) {
        return { tokens, legend: provider.getLegend() };
      }
    }
    return null;
  }
  _getSemanticTokenAtPosition(semanticTokens, pos) {
    const tokenData = semanticTokens.tokens.data;
    const defaultLanguage = this._model.getLanguageId();
    let lastLine = 0;
    let lastCharacter = 0;
    const posLine = pos.lineNumber - 1, posCharacter = pos.column - 1;
    for (let i = 0; i < tokenData.length; i += 5) {
      const lineDelta = tokenData[i], charDelta = tokenData[i + 1], len = tokenData[i + 2], typeIdx = tokenData[i + 3], modSet = tokenData[i + 4];
      const line = lastLine + lineDelta;
      const character = lineDelta === 0 ? lastCharacter + charDelta : charDelta;
      if (posLine === line && character <= posCharacter && posCharacter < character + len) {
        const type = semanticTokens.legend.tokenTypes[typeIdx] || "not in legend (ignored)";
        const modifiers = [];
        let modifierSet = modSet;
        for (let modifierIndex = 0; modifierSet > 0 && modifierIndex < semanticTokens.legend.tokenModifiers.length; modifierIndex++) {
          if (modifierSet & 1) {
            modifiers.push(semanticTokens.legend.tokenModifiers[modifierIndex]);
          }
          modifierSet = modifierSet >> 1;
        }
        if (modifierSet > 0) {
          modifiers.push("not in legend (ignored)");
        }
        const range = new Range(line + 1, character + 1, line + 1, character + 1 + len);
        const definitions = {};
        const colorMap = this._themeService.getColorTheme().tokenColorMap;
        const theme = this._themeService.getColorTheme();
        const tokenStyle = theme.getTokenStyleMetadata(type, modifiers, defaultLanguage, true, definitions);
        let metadata = void 0;
        if (tokenStyle) {
          metadata = {
            languageId: void 0,
            tokenType: StandardTokenType.Other,
            bold: tokenStyle?.bold,
            italic: tokenStyle?.italic,
            underline: tokenStyle?.underline,
            strikethrough: tokenStyle?.strikethrough,
            foreground: colorMap[tokenStyle?.foreground || ColorId.None],
            background: void 0
          };
        }
        return { type, modifiers, range, metadata, definitions };
      }
      lastLine = line;
      lastCharacter = character;
    }
    return null;
  }
  _walkTreeforPosition(cursor, pos) {
    const offset = this._model.getOffsetAt(pos);
    cursor.gotoFirstChild();
    let goChild = false;
    let lastGoodNode = null;
    do {
      if (cursor.currentNode.startIndex <= offset && offset < cursor.currentNode.endIndex) {
        goChild = true;
        lastGoodNode = cursor.currentNode;
      } else {
        goChild = false;
      }
    } while (goChild ? cursor.gotoFirstChild() : cursor.gotoNextSibling());
    return lastGoodNode;
  }
  _getTreeSitterTokenAtPosition(treeSitterTree, pos) {
    const nodes = [];
    let tree = treeSitterTree?.tree.get();
    while (tree) {
      const cursor = tree.walk();
      const node = this._walkTreeforPosition(cursor, pos);
      cursor.delete();
      if (node) {
        nodes.push(node);
        treeSitterTree = treeSitterTree?.getInjectionTrees(node.startIndex, treeSitterTree.languageId);
        tree = treeSitterTree?.tree.get();
      } else {
        tree = void 0;
      }
    }
    return nodes.length > 0 ? nodes : null;
  }
  _renderTokenStyleDefinition(definition, property) {
    const elements = new Array();
    if (definition === void 0) {
      return elements;
    }
    const theme = this._themeService.getColorTheme();
    if (Array.isArray(definition)) {
      const scopesDefinition = {};
      theme.resolveScopes(definition, scopesDefinition);
      const matchingRule = scopesDefinition[property];
      if (matchingRule && scopesDefinition.scope) {
        const scopes = $("ul.tiw-metadata-values");
        const strScopes = Array.isArray(matchingRule.scope) ? matchingRule.scope : [String(matchingRule.scope)];
        for (const strScope of strScopes) {
          scopes.appendChild($("li.tiw-metadata-value.tiw-metadata-scopes", void 0, strScope));
        }
        elements.push(
          scopesDefinition.scope.join(" "),
          scopes,
          $("code.tiw-theme-selector", void 0, JSON.stringify(matchingRule.settings, null, "	"))
        );
        return elements;
      }
      return elements;
    } else if (SemanticTokenRule.is(definition)) {
      const scope = theme.getTokenStylingRuleScope(definition);
      if (scope === "setting") {
        elements.push(`User settings: ${definition.selector.id} - ${this._renderStyleProperty(definition.style, property)}`);
        return elements;
      } else if (scope === "theme") {
        elements.push(`Color theme: ${definition.selector.id} - ${this._renderStyleProperty(definition.style, property)}`);
        return elements;
      }
      return elements;
    } else {
      const style = theme.resolveTokenStyleValue(definition);
      elements.push(`Default: ${style ? this._renderStyleProperty(style, property) : ""}`);
      return elements;
    }
  }
  _renderStyleProperty(style, property) {
    switch (property) {
      case "foreground":
        return style.foreground ? Color.Format.CSS.formatHexA(style.foreground, true) : "";
      default:
        return style[property] !== void 0 ? String(style[property]) : "";
    }
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
_InspectEditorTokensWidget._ID = "editor.contrib.inspectEditorTokensWidget";
let InspectEditorTokensWidget = _InspectEditorTokensWidget;
registerEditorContribution(InspectEditorTokensController.ID, InspectEditorTokensController, EditorContributionInstantiation.Lazy);
registerEditorAction(InspectEditorTokens);
export {
  InspectEditorTokensController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXGluc3BlY3RFZGl0b3JUb2tlbnNcXGluc3BlY3RFZGl0b3JUb2tlbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vaW5zcGVjdEVkaXRvclRva2Vucy5jc3MnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUFjdGl2ZUNvZGVFZGl0b3IsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yLCByZWdpc3RlckVkaXRvckFjdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24sIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBTZW1hbnRpY1Rva2Vuc0xlZ2VuZCwgU2VtYW50aWNUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBGb250U3R5bGUsIENvbG9ySWQsIFN0YW5kYXJkVG9rZW5UeXBlLCBUb2tlbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGZpbmRNYXRjaGluZ1RoZW1lUnVsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3RleHRNYXRlL2NvbW1vbi9UTUhlbHBlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1hdGVUb2tlbml6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dE1hdGUvYnJvd3Nlci90ZXh0TWF0ZVRva2VuaXphdGlvbkZlYXR1cmUuanMnO1xuaW1wb3J0IHR5cGUgeyBJR3JhbW1hciwgSVRva2VuLCBTdGF0ZVN0YWNrIH0gZnJvbSAndnNjb2RlLXRleHRtYXRlJztcbmltcG9ydCB7IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvclRoZW1lRGF0YSwgVG9rZW5TdHlsZURlZmluaXRpb25zLCBUb2tlblN0eWxlRGVmaW5pdGlvbiwgVGV4dE1hdGVUaGVtaW5nUnVsZURlZmluaXRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi9jb2xvclRoZW1lRGF0YS5qcyc7XG5pbXBvcnQgeyBTZW1hbnRpY1Rva2VuUnVsZSwgVG9rZW5TdHlsZURhdGEsIFRva2VuU3R5bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgU0VNQU5USUNfSElHSExJR0hUSU5HX1NFVFRJTkdfSUQsIElFZGl0b3JTZW1hbnRpY0hpZ2hsaWdodGluZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zZW1hbnRpY1Rva2Vucy9jb21tb24vc2VtYW50aWNUb2tlbnNDb25maWcuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB0eXBlICogYXMgVHJlZVNpdHRlciBmcm9tICdAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20nO1xuaW1wb3J0IHsgVHJlZVNpdHRlclN5bnRheFRva2VuQmFja2VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdG9rZW5zL3RyZWVTaXR0ZXIvdHJlZVNpdHRlclN5bnRheFRva2VuQmFja2VuZC5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90b2tlbnMvdG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydC5qcyc7XG5pbXBvcnQgeyBUcmVlU2l0dGVyVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwvdG9rZW5zL3RyZWVTaXR0ZXIvdHJlZVNpdHRlclRyZWUuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmV4cG9ydCBjbGFzcyBJbnNwZWN0RWRpdG9yVG9rZW5zQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmluc3BlY3RFZGl0b3JUb2tlbnMnO1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0KGVkaXRvcjogSUNvZGVFZGl0b3IpOiBJbnNwZWN0RWRpdG9yVG9rZW5zQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPEluc3BlY3RFZGl0b3JUb2tlbnNDb250cm9sbGVyPihJbnNwZWN0RWRpdG9yVG9rZW5zQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRwcml2YXRlIF9lZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRwcml2YXRlIF90ZXh0TWF0ZVNlcnZpY2U6IElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgX3RoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZTtcblx0cHJpdmF0ZSBfbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRwcml2YXRlIF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZTtcblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZTtcblx0cHJpdmF0ZSBfd2lkZ2V0OiBJbnNwZWN0RWRpdG9yVG9rZW5zV2lkZ2V0IHwgbnVsbDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJVGV4dE1hdGVUb2tlbml6YXRpb25TZXJ2aWNlIHRleHRNYXRlU2VydmljZTogSVRleHRNYXRlVG9rZW5pemF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdG9yID0gZWRpdG9yO1xuXHRcdHRoaXMuX3RleHRNYXRlU2VydmljZSA9IHRleHRNYXRlU2VydmljZTtcblx0XHR0aGlzLl90aGVtZVNlcnZpY2UgPSB0aGVtZVNlcnZpY2U7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlO1xuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UgPSBub3RpZmljYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlID0gY29uZmlndXJhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTtcblx0XHR0aGlzLl93aWRnZXQgPSBudWxsO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKGUpID0+IHRoaXMuc3RvcCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxMYW5ndWFnZSgoZSkgPT4gdGhpcy5zdG9wKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25LZXlVcCgoZSkgPT4gZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSAmJiB0aGlzLnN0b3AoKSkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9wKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHVibGljIGxhdW5jaCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsKSB7XG5cdFx0XHQvLyBkaXNhYmxlIGluIG5vdGVib29rc1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl93aWRnZXQgPSBuZXcgSW5zcGVjdEVkaXRvclRva2Vuc1dpZGdldCh0aGlzLl9lZGl0b3IsIHRoaXMuX3RleHRNYXRlU2VydmljZSwgdGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLl90aGVtZVNlcnZpY2UsIHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgc3RvcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHR0aGlzLl93aWRnZXQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0ID0gbnVsbDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgdG9nZ2xlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0KSB7XG5cdFx0XHR0aGlzLmxhdW5jaCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSW5zcGVjdEVkaXRvclRva2VucyBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmluc3BlY3RUTVNjb3BlcycsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMignaW5zcGVjdEVkaXRvclRva2VucycsIFwiRGV2ZWxvcGVyOiBJbnNwZWN0IEVkaXRvciBUb2tlbnMgYW5kIFNjb3Blc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IEluc3BlY3RFZGl0b3JUb2tlbnNDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGNvbnRyb2xsZXI/LnRvZ2dsZSgpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJVGV4dE1hdGVUb2tlbkluZm8ge1xuXHR0b2tlbjogSVRva2VuO1xuXHRtZXRhZGF0YTogSURlY29kZWRNZXRhZGF0YTtcbn1cblxuaW50ZXJmYWNlIElTZW1hbnRpY1Rva2VuSW5mbyB7XG5cdHR5cGU6IHN0cmluZztcblx0bW9kaWZpZXJzOiBzdHJpbmdbXTtcblx0cmFuZ2U6IFJhbmdlO1xuXHRtZXRhZGF0YT86IElEZWNvZGVkTWV0YWRhdGE7XG5cdGRlZmluaXRpb25zOiBUb2tlblN0eWxlRGVmaW5pdGlvbnM7XG59XG5cbmludGVyZmFjZSBJRGVjb2RlZE1ldGFkYXRhIHtcblx0bGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0b2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlO1xuXHRib2xkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRpdGFsaWM6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHVuZGVybGluZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0c3RyaWtldGhyb3VnaDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Zm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRiYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRva2VuVGV4dCh0b2tlblRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICh0b2tlblRleHQubGVuZ3RoID4gNDApIHtcblx0XHR0b2tlblRleHQgPSB0b2tlblRleHQuc3Vic3RyKDAsIDIwKSArICdcdTIwMjYnICsgdG9rZW5UZXh0LnN1YnN0cih0b2tlblRleHQubGVuZ3RoIC0gMjApO1xuXHR9XG5cdGxldCByZXN1bHQ6IHN0cmluZyA9ICcnO1xuXHRmb3IgKGxldCBjaGFySW5kZXggPSAwLCBsZW4gPSB0b2tlblRleHQubGVuZ3RoOyBjaGFySW5kZXggPCBsZW47IGNoYXJJbmRleCsrKSB7XG5cdFx0Y29uc3QgY2hhckNvZGUgPSB0b2tlblRleHQuY2hhckNvZGVBdChjaGFySW5kZXgpO1xuXHRcdHN3aXRjaCAoY2hhckNvZGUpIHtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVGFiOlxuXHRcdFx0XHRyZXN1bHQgKz0gJ1xcdTIxOTInOyAvLyAmcmFycjtcblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0XHRcdHJlc3VsdCArPSAnXFx1MDBCNyc7IC8vICZtaWRkb3Q7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXN1bHQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShjaGFyQ29kZSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbnR5cGUgU2VtYW50aWNUb2tlbnNSZXN1bHQgPSB7IHRva2VuczogU2VtYW50aWNUb2tlbnM7IGxlZ2VuZDogU2VtYW50aWNUb2tlbnNMZWdlbmQgfTtcblxuY2xhc3MgSW5zcGVjdEVkaXRvclRva2Vuc1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0lEID0gJ2VkaXRvci5jb250cmliLmluc3BlY3RFZGl0b3JUb2tlbnNXaWRnZXQnO1xuXG5cdC8vIEVkaXRvci5JQ29udGVudFdpZGdldC5hbGxvd0VkaXRvck92ZXJmbG93XG5cdHB1YmxpYyByZWFkb25seSBhbGxvd0VkaXRvck92ZXJmbG93ID0gdHJ1ZTtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGV4dE1hdGVTZXJ2aWNlOiBJVGV4dE1hdGVUb2tlbml6YXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLFxuXHRcdHRleHRNYXRlU2VydmljZTogSVRleHRNYXRlVG9rZW5pemF0aW9uU2VydmljZSxcblx0XHRsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0dGhlbWVTZXJ2aWNlOiBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLFxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0bGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlO1xuXHRcdHRoaXMuX3RoZW1lU2VydmljZSA9IHRoZW1lU2VydmljZTtcblx0XHR0aGlzLl90ZXh0TWF0ZVNlcnZpY2UgPSB0ZXh0TWF0ZVNlcnZpY2U7XG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSA9IG5vdGlmaWNhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHR0aGlzLl9sYW5ndWFnZUZlYXR1cmVzU2VydmljZSA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlO1xuXHRcdHRoaXMuX21vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0dGhpcy5fZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2RvbU5vZGUuY2xhc3NOYW1lID0gJ3Rva2VuLWluc3BlY3Qtd2lkZ2V0Jztcblx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fYmVnaW5Db21wdXRlKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZSkgPT4gdGhpcy5fYmVnaW5Db21wdXRlKHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoXyA9PiB0aGlzLl9iZWdpbkNvbXB1dGUodGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLnNlbWFudGljSGlnaGxpZ2h0aW5nLmVuYWJsZWQnKSAmJiB0aGlzLl9iZWdpbkNvbXB1dGUodGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkpKSk7XG5cdFx0dGhpcy5fZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLl9jdXJyZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBJbnNwZWN0RWRpdG9yVG9rZW5zV2lkZ2V0Ll9JRDtcblx0fVxuXG5cdHByaXZhdGUgX2JlZ2luQ29tcHV0ZShwb3NpdGlvbjogUG9zaXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBncmFtbWFyID0gdGhpcy5fdGV4dE1hdGVTZXJ2aWNlLmNyZWF0ZVRva2VuaXplcih0aGlzLl9tb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdGNvbnN0IHNlbWFudGljVG9rZW5zID0gdGhpcy5fY29tcHV0ZVNlbWFudGljVG9rZW5zKHBvc2l0aW9uKTtcblx0XHRjb25zdCBiYWNrZW5kID0gKHRoaXMuX21vZGVsLnRva2VuaXphdGlvbiBhcyBUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0KS50b2tlbnMuZ2V0KCk7XG5cdFx0Y29uc3QgYXNUcmVlU2l0dGVyQmFja2VuZCA9IGJhY2tlbmQgaW5zdGFuY2VvZiBUcmVlU2l0dGVyU3ludGF4VG9rZW5CYWNrZW5kID8gYmFja2VuZCA6IHVuZGVmaW5lZDtcblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fZG9tTm9kZSk7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShubHMubG9jYWxpemUoJ2luc3BlY3RUTVNjb3Blc1dpZGdldC5sb2FkaW5nJywgXCJMb2FkaW5nLi4uXCIpKSk7XG5cblx0XHRQcm9taXNlLmFsbChbZ3JhbW1hciwgc2VtYW50aWNUb2tlbnNdKS50aGVuKChbZ3JhbW1hciwgc2VtYW50aWNUb2tlbnNdKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0cmVlU2l0dGVyVHJlZSA9IGFzVHJlZVNpdHRlckJhY2tlbmQ/LnRyZWUuZ2V0KCk7XG5cdFx0XHR0aGlzLl9jb21wdXRlKGdyYW1tYXIsIHNlbWFudGljVG9rZW5zLCB0cmVlU2l0dGVyVHJlZSwgcG9zaXRpb24pO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5zdHlsZS5tYXhXaWR0aCA9IGAke01hdGgubWF4KHRoaXMuX2VkaXRvci5nZXRMYXlvdXRJbmZvKCkud2lkdGggKiAwLjY2LCA1MDApfXB4YDtcblx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihlcnIpO1xuXG5cdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0SW5zcGVjdEVkaXRvclRva2Vuc0NvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik/LnN0b3AoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdH1cblxuXHRwcml2YXRlIF9pc1NlbWFudGljQ29sb3JpbmdFbmFibGVkKCkge1xuXHRcdGNvbnN0IHNldHRpbmcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yU2VtYW50aWNIaWdobGlnaHRpbmdPcHRpb25zPihTRU1BTlRJQ19ISUdITElHSFRJTkdfU0VUVElOR19JRCwgeyBvdmVycmlkZUlkZW50aWZpZXI6IHRoaXMuX21vZGVsLmdldExhbmd1YWdlSWQoKSwgcmVzb3VyY2U6IHRoaXMuX21vZGVsLnVyaSB9KT8uZW5hYmxlZDtcblx0XHRpZiAodHlwZW9mIHNldHRpbmcgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHNldHRpbmc7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnNlbWFudGljSGlnaGxpZ2h0aW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZShncmFtbWFyOiBJR3JhbW1hciB8IG51bGwsIHNlbWFudGljVG9rZW5zOiBTZW1hbnRpY1Rva2Vuc1Jlc3VsdCB8IG51bGwsIHRyZWU6IFRyZWVTaXR0ZXJUcmVlIHwgdW5kZWZpbmVkLCBwb3NpdGlvbjogUG9zaXRpb24pIHtcblx0XHRjb25zdCB0ZXh0TWF0ZVRva2VuSW5mbyA9IGdyYW1tYXIgJiYgdGhpcy5fZ2V0VG9rZW5zQXRQb3NpdGlvbihncmFtbWFyLCBwb3NpdGlvbik7XG5cdFx0Y29uc3Qgc2VtYW50aWNUb2tlbkluZm8gPSBzZW1hbnRpY1Rva2VucyAmJiB0aGlzLl9nZXRTZW1hbnRpY1Rva2VuQXRQb3NpdGlvbihzZW1hbnRpY1Rva2VucywgcG9zaXRpb24pO1xuXHRcdGNvbnN0IHRyZWVTaXR0ZXJUb2tlbkluZm8gPSB0cmVlICYmIHRoaXMuX2dldFRyZWVTaXR0ZXJUb2tlbkF0UG9zaXRpb24odHJlZSwgcG9zaXRpb24pO1xuXHRcdGlmICghdGV4dE1hdGVUb2tlbkluZm8gJiYgIXNlbWFudGljVG9rZW5JbmZvICYmICF0cmVlU2l0dGVyVG9rZW5JbmZvKSB7XG5cdFx0XHRkb20ucmVzZXQodGhpcy5fZG9tTm9kZSwgJ05vIGdyYW1tYXIgb3Igc2VtYW50aWMgdG9rZW5zIGF2YWlsYWJsZS4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0bU1ldGFkYXRhID0gdGV4dE1hdGVUb2tlbkluZm8/Lm1ldGFkYXRhO1xuXHRcdGNvbnN0IHNlbU1ldGFkYXRhID0gc2VtYW50aWNUb2tlbkluZm8/Lm1ldGFkYXRhO1xuXG5cdFx0Y29uc3Qgc2VtVG9rZW5UZXh0ID0gc2VtYW50aWNUb2tlbkluZm8gJiYgcmVuZGVyVG9rZW5UZXh0KHRoaXMuX21vZGVsLmdldFZhbHVlSW5SYW5nZShzZW1hbnRpY1Rva2VuSW5mby5yYW5nZSkpO1xuXHRcdGNvbnN0IHRtVG9rZW5UZXh0ID0gdGV4dE1hdGVUb2tlbkluZm8gJiYgcmVuZGVyVG9rZW5UZXh0KHRoaXMuX21vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLnN1YnN0cmluZyh0ZXh0TWF0ZVRva2VuSW5mby50b2tlbi5zdGFydEluZGV4LCB0ZXh0TWF0ZVRva2VuSW5mby50b2tlbi5lbmRJbmRleCkpO1xuXHRcdGNvbnN0IHNlbVRva2VuTGVuZ3RoID0gc2VtYW50aWNUb2tlbkluZm8gJiYgdGhpcy5fbW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHNlbWFudGljVG9rZW5JbmZvLnJhbmdlKTtcblx0XHRjb25zdCB0bVRva2VuTGVuZ3RoID0gdGV4dE1hdGVUb2tlbkluZm8gJiYgKHRleHRNYXRlVG9rZW5JbmZvLnRva2VuLmVuZEluZGV4IC0gdGV4dE1hdGVUb2tlbkluZm8udG9rZW4uc3RhcnRJbmRleCk7XG5cblx0XHRjb25zdCB0b2tlblRleHQgPSBzZW1Ub2tlblRleHQgfHwgdG1Ub2tlblRleHQgfHwgJyc7XG5cdFx0Y29uc3QgdG9rZW5MZW5ndGggPSBzZW1Ub2tlbkxlbmd0aCB8fCB0bVRva2VuTGVuZ3RoIHx8IDA7XG5cblx0XHRkb20ucmVzZXQodGhpcy5fZG9tTm9kZSxcblx0XHRcdCQoJ2gyLnRpdy10b2tlbicsIHVuZGVmaW5lZCxcblx0XHRcdFx0dG9rZW5UZXh0LFxuXHRcdFx0XHQkKCdzcGFuLnRpdy10b2tlbi1sZW5ndGgnLCB1bmRlZmluZWQsIGAke3Rva2VuTGVuZ3RofSAke3Rva2VuTGVuZ3RoID09PSAxID8gJ2NoYXInIDogJ2NoYXJzJ31gKSkpO1xuXHRcdGRvbS5hcHBlbmQodGhpcy5fZG9tTm9kZSwgJCgnaHIudGl3LW1ldGFkYXRhLXNlcGFyYXRvcicsIHsgJ3N0eWxlJzogJ2NsZWFyOmJvdGgnIH0pKTtcblx0XHRkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJ3RhYmxlLnRpdy1tZXRhZGF0YS10YWJsZScsIHVuZGVmaW5lZCxcblx0XHRcdCQoJ3Rib2R5JywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEta2V5JywgdW5kZWZpbmVkLCAnbGFuZ3VhZ2UnKSxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIHRtTWV0YWRhdGE/Lmxhbmd1YWdlSWQgfHwgJycpXG5cdFx0XHRcdCksXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdzdGFuZGFyZCB0b2tlbiB0eXBlJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS12YWx1ZScsIHVuZGVmaW5lZCwgdGhpcy5fdG9rZW5UeXBlVG9TdHJpbmcodG1NZXRhZGF0YT8udG9rZW5UeXBlIHx8IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyKSlcblx0XHRcdFx0KSxcblx0XHRcdFx0Li4udGhpcy5fZm9ybWF0TWV0YWRhdGEoc2VtTWV0YWRhdGEsIHRtTWV0YWRhdGEpXG5cdFx0XHQpXG5cdFx0KSk7XG5cblx0XHRpZiAoc2VtYW50aWNUb2tlbkluZm8pIHtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5fZG9tTm9kZSwgJCgnaHIudGl3LW1ldGFkYXRhLXNlcGFyYXRvcicpKTtcblx0XHRcdGNvbnN0IHRhYmxlID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCd0YWJsZS50aXctbWV0YWRhdGEtdGFibGUnLCB1bmRlZmluZWQpKTtcblx0XHRcdGNvbnN0IHRib2R5ID0gZG9tLmFwcGVuZCh0YWJsZSwgJCgndGJvZHknLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdzZW1hbnRpYyB0b2tlbiB0eXBlJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS12YWx1ZScsIHVuZGVmaW5lZCwgc2VtYW50aWNUb2tlbkluZm8udHlwZSlcblx0XHRcdFx0KVxuXHRcdFx0KSk7XG5cdFx0XHRpZiAoc2VtYW50aWNUb2tlbkluZm8ubW9kaWZpZXJzLmxlbmd0aCkge1xuXHRcdFx0XHRkb20uYXBwZW5kKHRib2R5LCAkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEta2V5JywgdW5kZWZpbmVkLCAnbW9kaWZpZXJzJyksXG5cdFx0XHRcdFx0JCgndGQudGl3LW1ldGFkYXRhLXZhbHVlJywgdW5kZWZpbmVkLCBzZW1hbnRpY1Rva2VuSW5mby5tb2RpZmllcnMuam9pbignICcpKSxcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VtYW50aWNUb2tlbkluZm8ubWV0YWRhdGEpIHtcblx0XHRcdFx0Y29uc3QgcHJvcGVydGllczogKGtleW9mIFRva2VuU3R5bGVEYXRhKVtdID0gWydmb3JlZ3JvdW5kJywgJ2JvbGQnLCAnaXRhbGljJywgJ3VuZGVybGluZScsICdzdHJpa2V0aHJvdWdoJ107XG5cdFx0XHRcdGNvbnN0IHByb3BlcnRpZXNCeURlZlZhbHVlOiB7IFtydWxlOiBzdHJpbmddOiBzdHJpbmdbXSB9ID0ge307XG5cdFx0XHRcdGNvbnN0IGFsbERlZlZhbHVlcyA9IG5ldyBBcnJheTxbQXJyYXk8SFRNTEVsZW1lbnQgfCBzdHJpbmc+LCBzdHJpbmddPigpOyAvLyByZW1lbWJlciB0aGUgb3JkZXJcblx0XHRcdFx0Ly8gZmlyc3QgY29sbGVjdCB0byBkZXRlY3Qgd2hlbiB0aGUgc2FtZSBydWxlIGlzIHVzZWQgZm9yIG11bHRpcGxlIHByb3BlcnRpZXNcblx0XHRcdFx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBwcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdFx0aWYgKHNlbWFudGljVG9rZW5JbmZvLm1ldGFkYXRhW3Byb3BlcnR5XSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWZpbml0aW9uID0gc2VtYW50aWNUb2tlbkluZm8uZGVmaW5pdGlvbnNbcHJvcGVydHldO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVmVmFsdWUgPSB0aGlzLl9yZW5kZXJUb2tlblN0eWxlRGVmaW5pdGlvbihkZWZpbml0aW9uLCBwcm9wZXJ0eSk7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWZWYWx1ZVN0ciA9IGRlZlZhbHVlLm1hcChlbCA9PiBkb20uaXNIVE1MRWxlbWVudChlbCkgPyBlbC5vdXRlckhUTUwgOiBlbCkuam9pbigpO1xuXHRcdFx0XHRcdFx0bGV0IHByb3BlcnRpZXMgPSBwcm9wZXJ0aWVzQnlEZWZWYWx1ZVtkZWZWYWx1ZVN0cl07XG5cdFx0XHRcdFx0XHRpZiAoIXByb3BlcnRpZXMpIHtcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllc0J5RGVmVmFsdWVbZGVmVmFsdWVTdHJdID0gcHJvcGVydGllcyA9IFtdO1xuXHRcdFx0XHRcdFx0XHRhbGxEZWZWYWx1ZXMucHVzaChbZGVmVmFsdWUsIGRlZlZhbHVlU3RyXSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzLnB1c2gocHJvcGVydHkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IFtkZWZWYWx1ZSwgZGVmVmFsdWVTdHJdIG9mIGFsbERlZlZhbHVlcykge1xuXHRcdFx0XHRcdGRvbS5hcHBlbmQodGJvZHksICQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0JCgndGQudGl3LW1ldGFkYXRhLWtleScsIHVuZGVmaW5lZCwgcHJvcGVydGllc0J5RGVmVmFsdWVbZGVmVmFsdWVTdHJdLmpvaW4oJywgJykpLFxuXHRcdFx0XHRcdFx0JCgndGQudGl3LW1ldGFkYXRhLXZhbHVlJywgdW5kZWZpbmVkLCAuLi5kZWZWYWx1ZSlcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0ZXh0TWF0ZVRva2VuSW5mbykge1xuXHRcdFx0Y29uc3QgdGhlbWUgPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCdoci50aXctbWV0YWRhdGEtc2VwYXJhdG9yJykpO1xuXHRcdFx0Y29uc3QgdGFibGUgPSBkb20uYXBwZW5kKHRoaXMuX2RvbU5vZGUsICQoJ3RhYmxlLnRpdy1tZXRhZGF0YS10YWJsZScpKTtcblx0XHRcdGNvbnN0IHRib2R5ID0gZG9tLmFwcGVuZCh0YWJsZSwgJCgndGJvZHknKSk7XG5cblx0XHRcdGlmICh0bVRva2VuVGV4dCAmJiB0bVRva2VuVGV4dCAhPT0gdG9rZW5UZXh0KSB7XG5cdFx0XHRcdGRvbS5hcHBlbmQodGJvZHksICQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICd0ZXh0bWF0ZSB0b2tlbicgYXMgc3RyaW5nKSxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGAke3RtVG9rZW5UZXh0fSAoJHt0bVRva2VuVGV4dC5sZW5ndGh9KWApXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2NvcGVzID0gbmV3IEFycmF5PEhUTUxFbGVtZW50IHwgc3RyaW5nPigpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHRleHRNYXRlVG9rZW5JbmZvLnRva2VuLnNjb3Blcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRzY29wZXMucHVzaCh0ZXh0TWF0ZVRva2VuSW5mby50b2tlbi5zY29wZXNbaV0pO1xuXHRcdFx0XHRpZiAoaSA+IDApIHtcblx0XHRcdFx0XHRzY29wZXMucHVzaCgkKCdicicpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZG9tLmFwcGVuZCh0Ym9keSwgJCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICd0ZXh0bWF0ZSBzY29wZXMnIGFzIHN0cmluZyksXG5cdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS12YWx1ZS50aXctbWV0YWRhdGEtc2NvcGVzJywgdW5kZWZpbmVkLCAuLi5zY29wZXMpLFxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IG1hdGNoaW5nUnVsZSA9IGZpbmRNYXRjaGluZ1RoZW1lUnVsZSh0aGVtZSwgdGV4dE1hdGVUb2tlbkluZm8udG9rZW4uc2NvcGVzLCBmYWxzZSk7XG5cdFx0XHRjb25zdCBzZW1Gb3JlZ3JvdW5kID0gc2VtYW50aWNUb2tlbkluZm8/Lm1ldGFkYXRhPy5mb3JlZ3JvdW5kO1xuXHRcdFx0aWYgKG1hdGNoaW5nUnVsZSkge1xuXHRcdFx0XHRpZiAoc2VtRm9yZWdyb3VuZCAhPT0gdGV4dE1hdGVUb2tlbkluZm8ubWV0YWRhdGEuZm9yZWdyb3VuZCkge1xuXHRcdFx0XHRcdGxldCBkZWZWYWx1ZSA9ICQoJ2NvZGUudGl3LXRoZW1lLXNlbGVjdG9yJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWF0Y2hpbmdSdWxlLnJhd1NlbGVjdG9yLCAkKCdicicpLCBKU09OLnN0cmluZ2lmeShtYXRjaGluZ1J1bGUuc2V0dGluZ3MsIG51bGwsICdcXHQnKSk7XG5cdFx0XHRcdFx0aWYgKHNlbUZvcmVncm91bmQpIHtcblx0XHRcdFx0XHRcdGRlZlZhbHVlID0gJCgncycsIHVuZGVmaW5lZCwgZGVmVmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkb20uYXBwZW5kKHRib2R5LCAkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdmb3JlZ3JvdW5kJyksXG5cdFx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGRlZlZhbHVlKSxcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghc2VtRm9yZWdyb3VuZCkge1xuXHRcdFx0XHRkb20uYXBwZW5kKHRib2R5LCAkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEta2V5JywgdW5kZWZpbmVkLCAnZm9yZWdyb3VuZCcpLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS12YWx1ZScsIHVuZGVmaW5lZCwgJ05vIHRoZW1lIHNlbGVjdG9yJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHJlZVNpdHRlclRva2VuSW5mbykge1xuXHRcdFx0Y29uc3QgbGFzdFRva2VuSW5mbyA9IHRyZWVTaXR0ZXJUb2tlbkluZm9bdHJlZVNpdHRlclRva2VuSW5mby5sZW5ndGggLSAxXTtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5fZG9tTm9kZSwgJCgnaHIudGl3LW1ldGFkYXRhLXNlcGFyYXRvcicpKTtcblx0XHRcdGNvbnN0IHRhYmxlID0gZG9tLmFwcGVuZCh0aGlzLl9kb21Ob2RlLCAkKCd0YWJsZS50aXctbWV0YWRhdGEtdGFibGUnKSk7XG5cdFx0XHRjb25zdCB0Ym9keSA9IGRvbS5hcHBlbmQodGFibGUsICQoJ3Rib2R5JykpO1xuXG5cdFx0XHRkb20uYXBwZW5kKHRib2R5LCAkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0JCgndGQudGl3LW1ldGFkYXRhLWtleScsIHVuZGVmaW5lZCwgYHRyZWUtc2l0dGVyIHRva2VuICR7bGFzdFRva2VuSW5mby5pZH1gIGFzIHN0cmluZyksXG5cdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS12YWx1ZScsIHVuZGVmaW5lZCwgYCR7bGFzdFRva2VuSW5mby50ZXh0fWApXG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IHNjb3BlcyA9IG5ldyBBcnJheTxIVE1MRWxlbWVudCB8IHN0cmluZz4oKTtcblx0XHRcdGxldCBpID0gdHJlZVNpdHRlclRva2VuSW5mby5sZW5ndGggLSAxO1xuXHRcdFx0bGV0IG5vZGUgPSB0cmVlU2l0dGVyVG9rZW5JbmZvW2ldO1xuXHRcdFx0d2hpbGUgKG5vZGUucGFyZW50IHx8IGkgPiAwKSB7XG5cdFx0XHRcdHNjb3Blcy5wdXNoKG5vZGUudHlwZSk7XG5cdFx0XHRcdG5vZGUgPSBub2RlLnBhcmVudCA/PyB0cmVlU2l0dGVyVG9rZW5JbmZvWy0taV07XG5cdFx0XHRcdGlmIChub2RlKSB7XG5cdFx0XHRcdFx0c2NvcGVzLnB1c2goJCgnYnInKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0ZG9tLmFwcGVuZCh0Ym9keSwgJCgndHInLCB1bmRlZmluZWQsXG5cdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICd0cmVlLXNpdHRlciB0cmVlJyBhcyBzdHJpbmcpLFxuXHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEtdmFsdWUudGl3LW1ldGFkYXRhLXNjb3BlcycsIHVuZGVmaW5lZCwgLi4uc2NvcGVzKSxcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0ID0gKCh0aGlzLl9tb2RlbC50b2tlbml6YXRpb24gYXMgVG9rZW5pemF0aW9uVGV4dE1vZGVsUGFydCkudG9rZW5zLmdldCgpIGFzIFRyZWVTaXR0ZXJTeW50YXhUb2tlbkJhY2tlbmQpLnRva2VuaXphdGlvbkltcGwuZ2V0KCk7XG5cdFx0XHRjb25zdCBjYXB0dXJlcyA9IHRva2VuaXphdGlvblN1cHBvcnQ/LmNhcHR1cmVBdFBvc2l0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0XHRpZiAoY2FwdHVyZXMgJiYgY2FwdHVyZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRkb20uYXBwZW5kKHRib2R5LCAkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEta2V5JywgdW5kZWZpbmVkLCAnZm9yZWdyb3VuZCcpLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS12YWx1ZScsIHVuZGVmaW5lZCwgY2FwdHVyZXMubWFwKGNhcCA9PiBjYXAubmFtZSkuam9pbignICcpKSxcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZm9ybWF0TWV0YWRhdGEoc2VtYW50aWM/OiBJRGVjb2RlZE1ldGFkYXRhLCB0bT86IElEZWNvZGVkTWV0YWRhdGEpOiBBcnJheTxIVE1MRWxlbWVudCB8IHN0cmluZz4ge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gbmV3IEFycmF5PEhUTUxFbGVtZW50IHwgc3RyaW5nPigpO1xuXG5cdFx0ZnVuY3Rpb24gcmVuZGVyKHByb3BlcnR5OiAnZm9yZWdyb3VuZCcgfCAnYmFja2dyb3VuZCcpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gc2VtYW50aWM/Lltwcm9wZXJ0eV0gfHwgdG0/Lltwcm9wZXJ0eV07XG5cdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBzZW1hbnRpY1N0eWxlID0gc2VtYW50aWM/Lltwcm9wZXJ0eV0gPyAndGl3LW1ldGFkYXRhLXNlbWFudGljJyA6ICcnO1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsIHByb3BlcnR5KSxcblx0XHRcdFx0XHQkKGB0ZC50aXctbWV0YWRhdGEtdmFsdWUuJHtzZW1hbnRpY1N0eWxlfWAsIHVuZGVmaW5lZCwgdmFsdWUpXG5cdFx0XHRcdCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvcmVncm91bmQgPSByZW5kZXIoJ2ZvcmVncm91bmQnKTtcblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gcmVuZGVyKCdiYWNrZ3JvdW5kJyk7XG5cdFx0aWYgKGZvcmVncm91bmQgJiYgYmFja2dyb3VuZCkge1xuXHRcdFx0Y29uc3QgYmFja2dyb3VuZENvbG9yID0gQ29sb3IuZnJvbUhleChiYWNrZ3JvdW5kKSwgZm9yZWdyb3VuZENvbG9yID0gQ29sb3IuZnJvbUhleChmb3JlZ3JvdW5kKTtcblx0XHRcdGlmIChiYWNrZ3JvdW5kQ29sb3IuaXNPcGFxdWUoKSkge1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCQoJ3RkLnRpdy1tZXRhZGF0YS1rZXknLCB1bmRlZmluZWQsICdjb250cmFzdCByYXRpbycgYXMgc3RyaW5nKSxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEtdmFsdWUnLCB1bmRlZmluZWQsIGJhY2tncm91bmRDb2xvci5nZXRDb250cmFzdFJhdGlvKGZvcmVncm91bmRDb2xvci5tYWtlT3BhcXVlKGJhY2tncm91bmRDb2xvcikpLnRvRml4ZWQoMikpXG5cdFx0XHRcdCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaCgkKCd0cicsIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEta2V5JywgdW5kZWZpbmVkLCAnQ29udHJhc3QgcmF0aW8gY2Fubm90IGJlIHByZWNpc2UgZm9yIGJhY2tncm91bmQgY29sb3JzIHRoYXQgdXNlIHRyYW5zcGFyZW5jeScgYXMgc3RyaW5nKSxcblx0XHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEtdmFsdWUnKVxuXHRcdFx0XHQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmb250U3R5bGVMYWJlbHMgPSBuZXcgQXJyYXk8SFRNTEVsZW1lbnQgfCBzdHJpbmc+KCk7XG5cblx0XHRmdW5jdGlvbiBhZGRTdHlsZShrZXk6ICdib2xkJyB8ICdpdGFsaWMnIHwgJ3VuZGVybGluZScgfCAnc3RyaWtldGhyb3VnaCcpIHtcblx0XHRcdGxldCBsYWJlbDogSFRNTEVsZW1lbnQgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc2VtYW50aWMgJiYgc2VtYW50aWNba2V5XSkge1xuXHRcdFx0XHRsYWJlbCA9ICQoJ3NwYW4udGl3LW1ldGFkYXRhLXNlbWFudGljJywgdW5kZWZpbmVkLCBrZXkpO1xuXHRcdFx0fSBlbHNlIGlmICh0bSAmJiB0bVtrZXldKSB7XG5cdFx0XHRcdGxhYmVsID0ga2V5O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHRcdGlmIChmb250U3R5bGVMYWJlbHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Zm9udFN0eWxlTGFiZWxzLnB1c2goJyAnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb250U3R5bGVMYWJlbHMucHVzaChsYWJlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFkZFN0eWxlKCdib2xkJyk7XG5cdFx0YWRkU3R5bGUoJ2l0YWxpYycpO1xuXHRcdGFkZFN0eWxlKCd1bmRlcmxpbmUnKTtcblx0XHRhZGRTdHlsZSgnc3RyaWtldGhyb3VnaCcpO1xuXHRcdGlmIChmb250U3R5bGVMYWJlbHMubGVuZ3RoKSB7XG5cdFx0XHRlbGVtZW50cy5wdXNoKCQoJ3RyJywgdW5kZWZpbmVkLFxuXHRcdFx0XHQkKCd0ZC50aXctbWV0YWRhdGEta2V5JywgdW5kZWZpbmVkLCAnZm9udCBzdHlsZScgYXMgc3RyaW5nKSxcblx0XHRcdFx0JCgndGQudGl3LW1ldGFkYXRhLXZhbHVlJywgdW5kZWZpbmVkLCAuLi5mb250U3R5bGVMYWJlbHMpXG5cdFx0XHQpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnRzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVjb2RlTWV0YWRhdGEobWV0YWRhdGE6IG51bWJlcik6IElEZWNvZGVkTWV0YWRhdGEge1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50b2tlbkNvbG9yTWFwO1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBUb2tlbk1ldGFkYXRhLmdldExhbmd1YWdlSWQobWV0YWRhdGEpO1xuXHRcdGNvbnN0IHRva2VuVHlwZSA9IFRva2VuTWV0YWRhdGEuZ2V0VG9rZW5UeXBlKG1ldGFkYXRhKTtcblx0XHRjb25zdCBmb250U3R5bGUgPSBUb2tlbk1ldGFkYXRhLmdldEZvbnRTdHlsZShtZXRhZGF0YSk7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZCA9IFRva2VuTWV0YWRhdGEuZ2V0Rm9yZWdyb3VuZChtZXRhZGF0YSk7XG5cdFx0Y29uc3QgYmFja2dyb3VuZCA9IFRva2VuTWV0YWRhdGEuZ2V0QmFja2dyb3VuZChtZXRhZGF0YSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhbmd1YWdlSWQ6IHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZGVjb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSxcblx0XHRcdHRva2VuVHlwZTogdG9rZW5UeXBlLFxuXHRcdFx0Ym9sZDogKGZvbnRTdHlsZSAmIEZvbnRTdHlsZS5Cb2xkKSA/IHRydWUgOiB1bmRlZmluZWQsXG5cdFx0XHRpdGFsaWM6IChmb250U3R5bGUgJiBGb250U3R5bGUuSXRhbGljKSA/IHRydWUgOiB1bmRlZmluZWQsXG5cdFx0XHR1bmRlcmxpbmU6IChmb250U3R5bGUgJiBGb250U3R5bGUuVW5kZXJsaW5lKSA/IHRydWUgOiB1bmRlZmluZWQsXG5cdFx0XHRzdHJpa2V0aHJvdWdoOiAoZm9udFN0eWxlICYgRm9udFN0eWxlLlN0cmlrZXRocm91Z2gpID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdGZvcmVncm91bmQ6IGNvbG9yTWFwW2ZvcmVncm91bmRdLFxuXHRcdFx0YmFja2dyb3VuZDogY29sb3JNYXBbYmFja2dyb3VuZF1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9rZW5UeXBlVG9TdHJpbmcodG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZSk6IHN0cmluZyB7XG5cdFx0c3dpdGNoICh0b2tlblR5cGUpIHtcblx0XHRcdGNhc2UgU3RhbmRhcmRUb2tlblR5cGUuT3RoZXI6IHJldHVybiAnT3RoZXInO1xuXHRcdFx0Y2FzZSBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50OiByZXR1cm4gJ0NvbW1lbnQnO1xuXHRcdFx0Y2FzZSBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmc6IHJldHVybiAnU3RyaW5nJztcblx0XHRcdGNhc2UgU3RhbmRhcmRUb2tlblR5cGUuUmVnRXg6IHJldHVybiAnUmVnRXgnO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuICc/Pyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VG9rZW5zQXRQb3NpdGlvbihncmFtbWFyOiBJR3JhbW1hciwgcG9zaXRpb246IFBvc2l0aW9uKTogSVRleHRNYXRlVG9rZW5JbmZvIHtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRjb25zdCBzdGF0ZUJlZm9yZUxpbmUgPSB0aGlzLl9nZXRTdGF0ZUJlZm9yZUxpbmUoZ3JhbW1hciwgbGluZU51bWJlcik7XG5cblx0XHRjb25zdCB0b2tlbml6YXRpb25SZXN1bHQxID0gZ3JhbW1hci50b2tlbml6ZUxpbmUodGhpcy5fbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlciksIHN0YXRlQmVmb3JlTGluZSk7XG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0MiA9IGdyYW1tYXIudG9rZW5pemVMaW5lMih0aGlzLl9tb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSwgc3RhdGVCZWZvcmVMaW5lKTtcblxuXHRcdGxldCB0b2tlbjFJbmRleCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IHRva2VuaXphdGlvblJlc3VsdDEudG9rZW5zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCB0ID0gdG9rZW5pemF0aW9uUmVzdWx0MS50b2tlbnNbaV07XG5cdFx0XHRpZiAocG9zaXRpb24uY29sdW1uIC0gMSA+PSB0LnN0YXJ0SW5kZXgpIHtcblx0XHRcdFx0dG9rZW4xSW5kZXggPSBpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgdG9rZW4ySW5kZXggPSAwO1xuXHRcdGZvciAobGV0IGkgPSAodG9rZW5pemF0aW9uUmVzdWx0Mi50b2tlbnMubGVuZ3RoID4+PiAxKTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmIChwb3NpdGlvbi5jb2x1bW4gLSAxID49IHRva2VuaXphdGlvblJlc3VsdDIudG9rZW5zWyhpIDw8IDEpXSkge1xuXHRcdFx0XHR0b2tlbjJJbmRleCA9IGk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0b2tlbjogdG9rZW5pemF0aW9uUmVzdWx0MS50b2tlbnNbdG9rZW4xSW5kZXhdLFxuXHRcdFx0bWV0YWRhdGE6IHRoaXMuX2RlY29kZU1ldGFkYXRhKHRva2VuaXphdGlvblJlc3VsdDIudG9rZW5zWyh0b2tlbjJJbmRleCA8PCAxKSArIDFdKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRTdGF0ZUJlZm9yZUxpbmUoZ3JhbW1hcjogSUdyYW1tYXIsIGxpbmVOdW1iZXI6IG51bWJlcik6IFN0YXRlU3RhY2sgfCBudWxsIHtcblx0XHRsZXQgc3RhdGU6IFN0YXRlU3RhY2sgfCBudWxsID0gbnVsbDtcblxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgbGluZU51bWJlcjsgaSsrKSB7XG5cdFx0XHRjb25zdCB0b2tlbml6YXRpb25SZXN1bHQgPSBncmFtbWFyLnRva2VuaXplTGluZSh0aGlzLl9tb2RlbC5nZXRMaW5lQ29udGVudChpKSwgc3RhdGUpO1xuXHRcdFx0c3RhdGUgPSB0b2tlbml6YXRpb25SZXN1bHQucnVsZVN0YWNrO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgaXNTZW1hbnRpY1Rva2Vucyh0b2tlbjogYW55KTogdG9rZW4gaXMgU2VtYW50aWNUb2tlbnMge1xuXHRcdHJldHVybiB0b2tlbiAmJiB0b2tlbi5kYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVNlbWFudGljVG9rZW5zKHBvc2l0aW9uOiBQb3NpdGlvbik6IFByb21pc2U8U2VtYW50aWNUb2tlbnNSZXN1bHQgfCBudWxsPiB7XG5cdFx0aWYgKCF0aGlzLl9pc1NlbWFudGljQ29sb3JpbmdFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRva2VuUHJvdmlkZXJzID0gdGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLm9yZGVyZWQodGhpcy5fbW9kZWwpO1xuXHRcdGlmICh0b2tlblByb3ZpZGVycy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdG9rZW5Qcm92aWRlcnNbMF07XG5cdFx0XHRjb25zdCB0b2tlbnMgPSBhd2FpdCBQcm9taXNlLnJlc29sdmUocHJvdmlkZXIucHJvdmlkZURvY3VtZW50U2VtYW50aWNUb2tlbnModGhpcy5fbW9kZWwsIG51bGwsIHRoaXMuX2N1cnJlbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pKTtcblx0XHRcdGlmICh0aGlzLmlzU2VtYW50aWNUb2tlbnModG9rZW5zKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0b2tlbnMsIGxlZ2VuZDogcHJvdmlkZXIuZ2V0TGVnZW5kKCkgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2VUb2tlblByb3ZpZGVycyA9IHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50UmFuZ2VTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLm9yZGVyZWQodGhpcy5fbW9kZWwpO1xuXHRcdGlmIChyYW5nZVRva2VuUHJvdmlkZXJzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSByYW5nZVRva2VuUHJvdmlkZXJzWzBdO1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShsaW5lTnVtYmVyLCAxLCBsaW5lTnVtYmVyLCB0aGlzLl9tb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpKTtcblx0XHRcdGNvbnN0IHRva2VucyA9IGF3YWl0IFByb21pc2UucmVzb2x2ZShwcm92aWRlci5wcm92aWRlRG9jdW1lbnRSYW5nZVNlbWFudGljVG9rZW5zKHRoaXMuX21vZGVsLCByYW5nZSwgdGhpcy5fY3VycmVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbikpO1xuXHRcdFx0aWYgKHRoaXMuaXNTZW1hbnRpY1Rva2Vucyh0b2tlbnMpKSB7XG5cdFx0XHRcdHJldHVybiB7IHRva2VucywgbGVnZW5kOiBwcm92aWRlci5nZXRMZWdlbmQoKSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlbWFudGljVG9rZW5BdFBvc2l0aW9uKHNlbWFudGljVG9rZW5zOiBTZW1hbnRpY1Rva2Vuc1Jlc3VsdCwgcG9zOiBQb3NpdGlvbik6IElTZW1hbnRpY1Rva2VuSW5mbyB8IG51bGwge1xuXHRcdGNvbnN0IHRva2VuRGF0YSA9IHNlbWFudGljVG9rZW5zLnRva2Vucy5kYXRhO1xuXHRcdGNvbnN0IGRlZmF1bHRMYW5ndWFnZSA9IHRoaXMuX21vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRsZXQgbGFzdExpbmUgPSAwO1xuXHRcdGxldCBsYXN0Q2hhcmFjdGVyID0gMDtcblx0XHRjb25zdCBwb3NMaW5lID0gcG9zLmxpbmVOdW1iZXIgLSAxLCBwb3NDaGFyYWN0ZXIgPSBwb3MuY29sdW1uIC0gMTsgLy8gdG8gMC1iYXNlZCBwb3NpdGlvblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdG9rZW5EYXRhLmxlbmd0aDsgaSArPSA1KSB7XG5cdFx0XHRjb25zdCBsaW5lRGVsdGEgPSB0b2tlbkRhdGFbaV0sIGNoYXJEZWx0YSA9IHRva2VuRGF0YVtpICsgMV0sIGxlbiA9IHRva2VuRGF0YVtpICsgMl0sIHR5cGVJZHggPSB0b2tlbkRhdGFbaSArIDNdLCBtb2RTZXQgPSB0b2tlbkRhdGFbaSArIDRdO1xuXHRcdFx0Y29uc3QgbGluZSA9IGxhc3RMaW5lICsgbGluZURlbHRhOyAvLyAwLWJhc2VkXG5cdFx0XHRjb25zdCBjaGFyYWN0ZXIgPSBsaW5lRGVsdGEgPT09IDAgPyBsYXN0Q2hhcmFjdGVyICsgY2hhckRlbHRhIDogY2hhckRlbHRhOyAvLyAwLWJhc2VkXG5cdFx0XHRpZiAocG9zTGluZSA9PT0gbGluZSAmJiBjaGFyYWN0ZXIgPD0gcG9zQ2hhcmFjdGVyICYmIHBvc0NoYXJhY3RlciA8IGNoYXJhY3RlciArIGxlbikge1xuXHRcdFx0XHRjb25zdCB0eXBlID0gc2VtYW50aWNUb2tlbnMubGVnZW5kLnRva2VuVHlwZXNbdHlwZUlkeF0gfHwgJ25vdCBpbiBsZWdlbmQgKGlnbm9yZWQpJztcblx0XHRcdFx0Y29uc3QgbW9kaWZpZXJzID0gW107XG5cdFx0XHRcdGxldCBtb2RpZmllclNldCA9IG1vZFNldDtcblx0XHRcdFx0Zm9yIChsZXQgbW9kaWZpZXJJbmRleCA9IDA7IG1vZGlmaWVyU2V0ID4gMCAmJiBtb2RpZmllckluZGV4IDwgc2VtYW50aWNUb2tlbnMubGVnZW5kLnRva2VuTW9kaWZpZXJzLmxlbmd0aDsgbW9kaWZpZXJJbmRleCsrKSB7XG5cdFx0XHRcdFx0aWYgKG1vZGlmaWVyU2V0ICYgMSkge1xuXHRcdFx0XHRcdFx0bW9kaWZpZXJzLnB1c2goc2VtYW50aWNUb2tlbnMubGVnZW5kLnRva2VuTW9kaWZpZXJzW21vZGlmaWVySW5kZXhdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bW9kaWZpZXJTZXQgPSBtb2RpZmllclNldCA+PiAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtb2RpZmllclNldCA+IDApIHtcblx0XHRcdFx0XHRtb2RpZmllcnMucHVzaCgnbm90IGluIGxlZ2VuZCAoaWdub3JlZCknKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShsaW5lICsgMSwgY2hhcmFjdGVyICsgMSwgbGluZSArIDEsIGNoYXJhY3RlciArIDEgKyBsZW4pO1xuXHRcdFx0XHRjb25zdCBkZWZpbml0aW9ucyA9IHt9O1xuXHRcdFx0XHRjb25zdCBjb2xvck1hcCA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudG9rZW5Db2xvck1hcDtcblx0XHRcdFx0Y29uc3QgdGhlbWUgPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpIGFzIENvbG9yVGhlbWVEYXRhO1xuXHRcdFx0XHRjb25zdCB0b2tlblN0eWxlID0gdGhlbWUuZ2V0VG9rZW5TdHlsZU1ldGFkYXRhKHR5cGUsIG1vZGlmaWVycywgZGVmYXVsdExhbmd1YWdlLCB0cnVlLCBkZWZpbml0aW9ucyk7XG5cblx0XHRcdFx0bGV0IG1ldGFkYXRhOiBJRGVjb2RlZE1ldGFkYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodG9rZW5TdHlsZSkge1xuXHRcdFx0XHRcdG1ldGFkYXRhID0ge1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlcixcblx0XHRcdFx0XHRcdGJvbGQ6IHRva2VuU3R5bGU/LmJvbGQsXG5cdFx0XHRcdFx0XHRpdGFsaWM6IHRva2VuU3R5bGU/Lml0YWxpYyxcblx0XHRcdFx0XHRcdHVuZGVybGluZTogdG9rZW5TdHlsZT8udW5kZXJsaW5lLFxuXHRcdFx0XHRcdFx0c3RyaWtldGhyb3VnaDogdG9rZW5TdHlsZT8uc3RyaWtldGhyb3VnaCxcblx0XHRcdFx0XHRcdGZvcmVncm91bmQ6IGNvbG9yTWFwW3Rva2VuU3R5bGU/LmZvcmVncm91bmQgfHwgQ29sb3JJZC5Ob25lXSxcblx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyB0eXBlLCBtb2RpZmllcnMsIHJhbmdlLCBtZXRhZGF0YSwgZGVmaW5pdGlvbnMgfTtcblx0XHRcdH1cblx0XHRcdGxhc3RMaW5lID0gbGluZTtcblx0XHRcdGxhc3RDaGFyYWN0ZXIgPSBjaGFyYWN0ZXI7XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2Fsa1RyZWVmb3JQb3NpdGlvbihjdXJzb3I6IFRyZWVTaXR0ZXIuVHJlZUN1cnNvciwgcG9zOiBQb3NpdGlvbik6IFRyZWVTaXR0ZXIuTm9kZSB8IG51bGwge1xuXHRcdGNvbnN0IG9mZnNldCA9IHRoaXMuX21vZGVsLmdldE9mZnNldEF0KHBvcyk7XG5cdFx0Y3Vyc29yLmdvdG9GaXJzdENoaWxkKCk7XG5cdFx0bGV0IGdvQ2hpbGQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRsZXQgbGFzdEdvb2ROb2RlOiBUcmVlU2l0dGVyLk5vZGUgfCBudWxsID0gbnVsbDtcblx0XHRkbyB7XG5cdFx0XHRpZiAoY3Vyc29yLmN1cnJlbnROb2RlLnN0YXJ0SW5kZXggPD0gb2Zmc2V0ICYmIG9mZnNldCA8IGN1cnNvci5jdXJyZW50Tm9kZS5lbmRJbmRleCkge1xuXHRcdFx0XHRnb0NoaWxkID0gdHJ1ZTtcblx0XHRcdFx0bGFzdEdvb2ROb2RlID0gY3Vyc29yLmN1cnJlbnROb2RlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Z29DaGlsZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKGdvQ2hpbGQgPyBjdXJzb3IuZ290b0ZpcnN0Q2hpbGQoKSA6IGN1cnNvci5nb3RvTmV4dFNpYmxpbmcoKSk7XG5cdFx0cmV0dXJuIGxhc3RHb29kTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRyZWVTaXR0ZXJUb2tlbkF0UG9zaXRpb24odHJlZVNpdHRlclRyZWU6IFRyZWVTaXR0ZXJUcmVlIHwgdW5kZWZpbmVkLCBwb3M6IFBvc2l0aW9uKTogVHJlZVNpdHRlci5Ob2RlW10gfCBudWxsIHtcblx0XHRjb25zdCBub2RlczogVHJlZVNpdHRlci5Ob2RlW10gPSBbXTtcblxuXHRcdGxldCB0cmVlID0gdHJlZVNpdHRlclRyZWU/LnRyZWUuZ2V0KCk7XG5cdFx0d2hpbGUgKHRyZWUpIHtcblx0XHRcdGNvbnN0IGN1cnNvciA9IHRyZWUud2FsaygpO1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX3dhbGtUcmVlZm9yUG9zaXRpb24oY3Vyc29yLCBwb3MpO1xuXHRcdFx0Y3Vyc29yLmRlbGV0ZSgpO1xuXHRcdFx0aWYgKG5vZGUpIHtcblx0XHRcdFx0bm9kZXMucHVzaChub2RlKTtcblx0XHRcdFx0dHJlZVNpdHRlclRyZWUgPSB0cmVlU2l0dGVyVHJlZT8uZ2V0SW5qZWN0aW9uVHJlZXMobm9kZS5zdGFydEluZGV4LCB0cmVlU2l0dGVyVHJlZS5sYW5ndWFnZUlkKTtcblx0XHRcdFx0dHJlZSA9IHRyZWVTaXR0ZXJUcmVlPy50cmVlLmdldCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJlZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG5vZGVzLmxlbmd0aCA+IDAgPyBub2RlcyA6IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJUb2tlblN0eWxlRGVmaW5pdGlvbihkZWZpbml0aW9uOiBUb2tlblN0eWxlRGVmaW5pdGlvbiB8IHVuZGVmaW5lZCwgcHJvcGVydHk6IGtleW9mIFRva2VuU3R5bGVEYXRhKTogQXJyYXk8SFRNTEVsZW1lbnQgfCBzdHJpbmc+IHtcblx0XHRjb25zdCBlbGVtZW50cyA9IG5ldyBBcnJheTxIVE1MRWxlbWVudCB8IHN0cmluZz4oKTtcblx0XHRpZiAoZGVmaW5pdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZWxlbWVudHM7XG5cdFx0fVxuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSBhcyBDb2xvclRoZW1lRGF0YTtcblxuXHRcdGlmIChBcnJheS5pc0FycmF5KGRlZmluaXRpb24pKSB7XG5cdFx0XHRjb25zdCBzY29wZXNEZWZpbml0aW9uOiBUZXh0TWF0ZVRoZW1pbmdSdWxlRGVmaW5pdGlvbnMgPSB7fTtcblx0XHRcdHRoZW1lLnJlc29sdmVTY29wZXMoZGVmaW5pdGlvbiwgc2NvcGVzRGVmaW5pdGlvbik7XG5cdFx0XHRjb25zdCBtYXRjaGluZ1J1bGUgPSBzY29wZXNEZWZpbml0aW9uW3Byb3BlcnR5XTtcblx0XHRcdGlmIChtYXRjaGluZ1J1bGUgJiYgc2NvcGVzRGVmaW5pdGlvbi5zY29wZSkge1xuXHRcdFx0XHRjb25zdCBzY29wZXMgPSAkKCd1bC50aXctbWV0YWRhdGEtdmFsdWVzJyk7XG5cdFx0XHRcdGNvbnN0IHN0clNjb3BlcyA9IEFycmF5LmlzQXJyYXkobWF0Y2hpbmdSdWxlLnNjb3BlKSA/IG1hdGNoaW5nUnVsZS5zY29wZSA6IFtTdHJpbmcobWF0Y2hpbmdSdWxlLnNjb3BlKV07XG5cblx0XHRcdFx0Zm9yIChjb25zdCBzdHJTY29wZSBvZiBzdHJTY29wZXMpIHtcblx0XHRcdFx0XHRzY29wZXMuYXBwZW5kQ2hpbGQoJCgnbGkudGl3LW1ldGFkYXRhLXZhbHVlLnRpdy1tZXRhZGF0YS1zY29wZXMnLCB1bmRlZmluZWQsIHN0clNjb3BlKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbGVtZW50cy5wdXNoKFxuXHRcdFx0XHRcdHNjb3Blc0RlZmluaXRpb24uc2NvcGUuam9pbignICcpLFxuXHRcdFx0XHRcdHNjb3Blcyxcblx0XHRcdFx0XHQkKCdjb2RlLnRpdy10aGVtZS1zZWxlY3RvcicsIHVuZGVmaW5lZCwgSlNPTi5zdHJpbmdpZnkobWF0Y2hpbmdSdWxlLnNldHRpbmdzLCBudWxsLCAnXFx0JykpKTtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnRzO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGVsZW1lbnRzO1xuXHRcdH0gZWxzZSBpZiAoU2VtYW50aWNUb2tlblJ1bGUuaXMoZGVmaW5pdGlvbikpIHtcblx0XHRcdGNvbnN0IHNjb3BlID0gdGhlbWUuZ2V0VG9rZW5TdHlsaW5nUnVsZVNjb3BlKGRlZmluaXRpb24pO1xuXHRcdFx0aWYgKHNjb3BlID09PSAnc2V0dGluZycpIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaChgVXNlciBzZXR0aW5nczogJHtkZWZpbml0aW9uLnNlbGVjdG9yLmlkfSAtICR7dGhpcy5fcmVuZGVyU3R5bGVQcm9wZXJ0eShkZWZpbml0aW9uLnN0eWxlLCBwcm9wZXJ0eSl9YCk7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50cztcblx0XHRcdH0gZWxzZSBpZiAoc2NvcGUgPT09ICd0aGVtZScpIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaChgQ29sb3IgdGhlbWU6ICR7ZGVmaW5pdGlvbi5zZWxlY3Rvci5pZH0gLSAke3RoaXMuX3JlbmRlclN0eWxlUHJvcGVydHkoZGVmaW5pdGlvbi5zdHlsZSwgcHJvcGVydHkpfWApO1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudHM7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZWxlbWVudHM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHN0eWxlID0gdGhlbWUucmVzb2x2ZVRva2VuU3R5bGVWYWx1ZShkZWZpbml0aW9uKTtcblx0XHRcdGVsZW1lbnRzLnB1c2goYERlZmF1bHQ6ICR7c3R5bGUgPyB0aGlzLl9yZW5kZXJTdHlsZVByb3BlcnR5KHN0eWxlLCBwcm9wZXJ0eSkgOiAnJ31gKTtcblx0XHRcdHJldHVybiBlbGVtZW50cztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdHlsZVByb3BlcnR5KHN0eWxlOiBUb2tlblN0eWxlLCBwcm9wZXJ0eToga2V5b2YgVG9rZW5TdHlsZURhdGEpIHtcblx0XHRzd2l0Y2ggKHByb3BlcnR5KSB7XG5cdFx0XHRjYXNlICdmb3JlZ3JvdW5kJzogcmV0dXJuIHN0eWxlLmZvcmVncm91bmQgPyBDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoc3R5bGUuZm9yZWdyb3VuZCwgdHJ1ZSkgOiAnJztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBzdHlsZVtwcm9wZXJ0eV0gIT09IHVuZGVmaW5lZCA/IFN0cmluZyhzdHlsZVtwcm9wZXJ0eV0pIDogJyc7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9kb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCksXG5cdFx0XHRwcmVmZXJlbmNlOiBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5CRUxPVywgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRV1cblx0XHR9O1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKEluc3BlY3RFZGl0b3JUb2tlbnNDb250cm9sbGVyLklELCBJbnNwZWN0RWRpdG9yVG9rZW5zQ29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5MYXp5KTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKEluc3BlY3RFZGl0b3JUb2tlbnMpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFlBQVksU0FBUztBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsdUNBQStHO0FBQ3hILFNBQVMsY0FBZ0Msc0JBQXNCLDRCQUE0Qix1Q0FBdUM7QUFFbEksU0FBUyxhQUFhO0FBSXRCLFNBQVMsV0FBVyxTQUFTLG1CQUFtQixxQkFBcUI7QUFDckUsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQ0FBb0M7QUFFN0MsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyx5QkFBcUQ7QUFDOUQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3Q0FBNEU7QUFDckYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsb0NBQW9DO0FBSTdDLE1BQU0sSUFBSSxJQUFJO0FBRVAsSUFBTSxnQ0FBTixjQUE0QyxXQUEwQztBQUFBLEVBSTVGLE9BQWMsSUFBSSxRQUEyRDtBQUM1RSxXQUFPLE9BQU8sZ0JBQStDLDhCQUE4QixFQUFFO0FBQUEsRUFDOUY7QUFBQSxFQVdBLFlBQ0MsUUFDOEIsaUJBQ1osaUJBQ00sY0FDRixxQkFDQyxzQkFDRyx5QkFDekI7QUFDRCxVQUFNO0FBQ04sU0FBSyxVQUFVO0FBQ2YsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSyx3QkFBd0I7QUFDN0IsU0FBSywyQkFB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LEVBQUUsMkJBQTJCLFFBQVcsS0FBSyxVQUFVLGFBQWEsVUFBVSxNQUFNLEdBQUksQ0FBQztBQUFBLFFBQUM7QUFDM0YsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsSUFDUixXQUFXLGtCQUFrQixHQUFHLFVBQVUsR0FBRztBQUM1QyxZQUFNLFFBQVEsTUFBTSx5QkFBeUIsVUFBVTtBQUN2RCxVQUFJLFVBQVUsV0FBVztBQUN4QixpQkFBUyxLQUFLLGtCQUFrQixXQUFXLFNBQVMsRUFBRSxNQUFNLEtBQUsscUJBQXFCLFdBQVcsT0FBTyxRQUFRLENBQUMsRUFBRTtBQUNuSCxlQUFPO0FBQUEsTUFDUixXQUFXLFVBQVUsU0FBUztBQUM3QixpQkFBUyxLQUFLLGdCQUFnQixXQUFXLFNBQVMsRUFBRSxNQUFNLEtBQUsscUJBQXFCLFdBQVcsT0FBTyxRQUFRLENBQUMsRUFBRTtBQUNqSCxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixZQUFNLFFBQVEsTUFBTSx1QkFBdUIsVUFBVTtBQUNyRCxlQUFTLEtBQUssWUFBWSxRQUFRLEtBQUsscUJBQXFCLE9BQU8sUUFBUSxJQUFJLEVBQUUsRUFBRTtBQUNuRixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixPQUFtQixVQUFnQztBQUMvRSxZQUFRLFVBQVU7QUFBQSxNQUNqQixLQUFLO0FBQWMsZUFBTyxNQUFNLGFBQWEsTUFBTSxPQUFPLElBQUksV0FBVyxNQUFNLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDbkc7QUFBUyxlQUFPLE1BQU0sUUFBUSxNQUFNLFNBQVksT0FBTyxNQUFNLFFBQVEsQ0FBQyxJQUFJO0FBQUEsSUFDM0U7QUFBQSxFQUNEO0FBQUEsRUFFTyxhQUEwQjtBQUNoQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxjQUFzQztBQUM1QyxXQUFPO0FBQUEsTUFDTixVQUFVLEtBQUssUUFBUSxZQUFZO0FBQUEsTUFDbkMsWUFBWSxDQUFDLGdDQUFnQyxPQUFPLGdDQUFnQyxLQUFLO0FBQUEsSUFDMUY7QUFBQSxFQUNEO0FBQ0Q7QUFyakJNLDJCQUVtQixNQUFNO0FBRi9CLElBQU0sNEJBQU47QUF1akJBLDJCQUEyQiw4QkFBOEIsSUFBSSwrQkFBK0IsZ0NBQWdDLElBQUk7QUFDaEkscUJBQXFCLG1CQUFtQjsiLAogICJuYW1lcyI6IFsiZ3JhbW1hciIsICJzZW1hbnRpY1Rva2VucyIsICJwcm9wZXJ0aWVzIl0KfQo=
