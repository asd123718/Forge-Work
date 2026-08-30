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
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EditorResourceAccessor } from "../../../common/editor.js";
import { ITextMateTokenizationService } from "../../../services/textMate/browser/textMateTokenizationFeature.js";
import { TokenizationRegistry } from "../../../../editor/common/languages.js";
import { TokenMetadata } from "../../../../editor/common/encodedTokenAttributes.js";
import { findMatchingThemeRule } from "../../../services/textMate/common/TMHelper.js";
import { Color } from "../../../../base/common/color.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { basename } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { splitLines } from "../../../../base/common/strings.js";
import { findMetadata } from "../../../services/themes/common/colorThemeData.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { Event } from "../../../../base/common/event.js";
import { Range } from "../../../../editor/common/core/range.js";
import { TreeSitterSyntaxTokenBackend } from "../../../../editor/common/model/tokens/treeSitter/treeSitterSyntaxTokenBackend.js";
import { waitForState } from "../../../../base/common/observable.js";
class ThemeDocument {
  constructor(theme) {
    this._theme = theme;
    this._cache = /* @__PURE__ */ Object.create(null);
    this._defaultColor = "#000000";
    for (let i = 0, len = this._theme.tokenColors.length; i < len; i++) {
      const rule = this._theme.tokenColors[i];
      if (!rule.scope) {
        this._defaultColor = rule.settings.foreground;
      }
    }
  }
  _generateExplanation(selector, color) {
    return `${selector}: ${Color.Format.CSS.formatHexA(color, true).toUpperCase()}`;
  }
  explainTokenColor(scopes, color) {
    const matchingRule = this._findMatchingThemeRule(scopes);
    if (!matchingRule) {
      const expected2 = Color.fromHex(this._defaultColor);
      if (!color.equals(expected2)) {
        throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected default ${Color.Format.CSS.formatHexA(expected2)}`);
      }
      return this._generateExplanation("default", color);
    }
    const expected = Color.fromHex(matchingRule.settings.foreground);
    if (!color.equals(expected)) {
      throw new Error(`[${this._theme.label}]: Unexpected color ${Color.Format.CSS.formatHexA(color)} for ${scopes}. Expected ${Color.Format.CSS.formatHexA(expected)} coming in from ${matchingRule.rawSelector}`);
    }
    return this._generateExplanation(matchingRule.rawSelector, color);
  }
  _findMatchingThemeRule(scopes) {
    if (!this._cache[scopes]) {
      this._cache[scopes] = findMatchingThemeRule(this._theme, scopes.split(" "));
    }
    return this._cache[scopes];
  }
}
let Snapper = class {
  constructor(languageService, themeService, textMateService, modelService) {
    this.languageService = languageService;
    this.themeService = themeService;
    this.textMateService = textMateService;
    this.modelService = modelService;
  }
  _themedTokenize(grammar, lines) {
    const colorMap = TokenizationRegistry.getColorMap();
    let state = null;
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = lines.length; i < len; i++) {
      const line = lines[i];
      const tokenizationResult = grammar.tokenizeLine2(line, state);
      for (let j = 0, lenJ = tokenizationResult.tokens.length >>> 1; j < lenJ; j++) {
        const startOffset = tokenizationResult.tokens[j << 1];
        const metadata = tokenizationResult.tokens[(j << 1) + 1];
        const endOffset = j + 1 < lenJ ? tokenizationResult.tokens[j + 1 << 1] : line.length;
        const tokenText = line.substring(startOffset, endOffset);
        const color = TokenMetadata.getForeground(metadata);
        result[resultLen++] = {
          text: tokenText,
          color: colorMap[color]
        };
      }
      state = tokenizationResult.ruleStack;
    }
    return result;
  }
  _themedTokenizeTreeSitter(tokens, languageId) {
    const colorMap = TokenizationRegistry.getColorMap();
    const result = Array(tokens.length);
    const colorThemeData = this.themeService.getColorTheme();
    for (let i = 0, len = tokens.length; i < len; i++) {
      const token = tokens[i];
      const scopes = token.t.split(" ");
      const metadata = findMetadata(colorThemeData, scopes, this.languageService.languageIdCodec.encodeLanguageId(languageId), false);
      const color = TokenMetadata.getForeground(metadata);
      result[i] = {
        text: token.c,
        color: colorMap[color]
      };
    }
    return result;
  }
  _tokenize(grammar, lines) {
    let state = null;
    const result = [];
    let resultLen = 0;
    for (let i = 0, len = lines.length; i < len; i++) {
      const line = lines[i];
      const tokenizationResult = grammar.tokenizeLine(line, state);
      let lastScopes = null;
      for (let j = 0, lenJ = tokenizationResult.tokens.length; j < lenJ; j++) {
        const token = tokenizationResult.tokens[j];
        const tokenText = line.substring(token.startIndex, token.endIndex);
        const tokenScopes = token.scopes.join(" ");
        if (lastScopes === tokenScopes) {
          result[resultLen - 1].c += tokenText;
        } else {
          lastScopes = tokenScopes;
          result[resultLen++] = {
            c: tokenText,
            t: tokenScopes,
            r: {
              dark_plus: void 0,
              light_plus: void 0,
              dark_vs: void 0,
              light_vs: void 0,
              hc_black: void 0
            }
          };
        }
      }
      state = tokenizationResult.ruleStack;
    }
    return result;
  }
  async _getThemesResult(grammar, lines) {
    const currentTheme = this.themeService.getColorTheme();
    const getThemeName = (id) => {
      const part = "vscode-theme-defaults-themes-";
      const startIdx = id.indexOf(part);
      if (startIdx !== -1) {
        return id.substring(startIdx + part.length, id.length - 5);
      }
      return void 0;
    };
    const result = {};
    const themeDatas = await this.themeService.getColorThemes();
    const defaultThemes = themeDatas.filter((themeData) => !!getThemeName(themeData.id));
    for (const defaultTheme of defaultThemes) {
      const themeId = defaultTheme.id;
      const success = await this.themeService.setColorTheme(themeId, void 0);
      if (success) {
        const themeName = getThemeName(themeId);
        result[themeName] = {
          document: new ThemeDocument(this.themeService.getColorTheme()),
          tokens: this._themedTokenize(grammar, lines)
        };
      }
    }
    await this.themeService.setColorTheme(currentTheme.id, void 0);
    return result;
  }
  async _getTreeSitterThemesResult(tokens, languageId) {
    const currentTheme = this.themeService.getColorTheme();
    const getThemeName = (id) => {
      const part = "vscode-theme-defaults-themes-";
      const startIdx = id.indexOf(part);
      if (startIdx !== -1) {
        return id.substring(startIdx + part.length, id.length - 5);
      }
      return void 0;
    };
    const result = {};
    const themeDatas = await this.themeService.getColorThemes();
    const defaultThemes = themeDatas.filter((themeData) => !!getThemeName(themeData.id));
    for (const defaultTheme of defaultThemes) {
      const themeId = defaultTheme.id;
      const success = await this.themeService.setColorTheme(themeId, void 0);
      if (success) {
        const themeName = getThemeName(themeId);
        result[themeName] = {
          document: new ThemeDocument(this.themeService.getColorTheme()),
          tokens: this._themedTokenizeTreeSitter(tokens, languageId)
        };
      }
    }
    await this.themeService.setColorTheme(currentTheme.id, void 0);
    return result;
  }
  _enrichResult(result, themesResult) {
    const index = {};
    const themeNames = Object.keys(themesResult);
    for (const themeName of themeNames) {
      index[themeName] = 0;
    }
    for (let i = 0, len = result.length; i < len; i++) {
      const token = result[i];
      for (const themeName of themeNames) {
        const themedToken = themesResult[themeName].tokens[index[themeName]];
        themedToken.text = themedToken.text.substr(token.c.length);
        if (themedToken.color) {
          token.r[themeName] = themesResult[themeName].document.explainTokenColor(token.t, themedToken.color);
        }
        if (themedToken.text.length === 0) {
          index[themeName]++;
        }
      }
    }
  }
  _moveInjectionCursorToRange(cursor, injectionRange) {
    let continueCursor = cursor.gotoFirstChild();
    while ((cursor.startIndex < injectionRange.startIndex || cursor.endIndex > injectionRange.endIndex) && continueCursor) {
      if (cursor.endIndex < injectionRange.startIndex) {
        continueCursor = cursor.gotoNextSibling();
      } else {
        continueCursor = cursor.gotoFirstChild();
      }
    }
  }
  async _treeSitterTokenize(treeSitterTree, tokenizationModel, languageId) {
    const tree = await waitForState(treeSitterTree.tree);
    if (!tree) {
      return [];
    }
    const cursor = tree.walk();
    cursor.gotoFirstChild();
    let cursorResult = true;
    const tokens = [];
    const cursors = [{ cursor, languageId, startOffset: 0, endOffset: treeSitterTree.textModel.getValueLength() }];
    do {
      const current = cursors[cursors.length - 1];
      const currentCursor = current.cursor;
      const currentLanguageId = current.languageId;
      const isOutsideRange = currentCursor.currentNode.endIndex > current.endOffset;
      if (!isOutsideRange && currentCursor.currentNode.childCount === 0) {
        const range = new Range(currentCursor.currentNode.startPosition.row + 1, currentCursor.currentNode.startPosition.column + 1, currentCursor.currentNode.endPosition.row + 1, currentCursor.currentNode.endPosition.column + 1);
        const injection = treeSitterTree.getInjectionTrees(currentCursor.currentNode.startIndex, currentLanguageId);
        const treeSitterRange = injection?.ranges.find((r) => r.startIndex <= currentCursor.currentNode.startIndex && r.endIndex >= currentCursor.currentNode.endIndex);
        const injectionTree = injection?.tree.get();
        const injectionLanguageId = injection?.languageId;
        if (injectionTree && injectionLanguageId && treeSitterRange && treeSitterRange.startIndex === currentCursor.currentNode.startIndex) {
          const injectionCursor = injectionTree.walk();
          this._moveInjectionCursorToRange(injectionCursor, treeSitterRange);
          cursors.push({ cursor: injectionCursor, languageId: injectionLanguageId, startOffset: treeSitterRange.startIndex, endOffset: treeSitterRange.endIndex });
          while (currentCursor.endIndex <= treeSitterRange.endIndex && (currentCursor.gotoNextSibling() || currentCursor.gotoParent())) {
          }
        } else {
          const capture = tokenizationModel.captureAtRangeTree(range);
          tokens.push({
            c: currentCursor.currentNode.text.replace(/\r/g, ""),
            t: capture?.map((cap) => cap.name).join(" ") ?? "",
            r: {
              dark_plus: void 0,
              light_plus: void 0,
              dark_vs: void 0,
              light_vs: void 0,
              hc_black: void 0
            }
          });
          while (!(cursorResult = currentCursor.gotoNextSibling())) {
            if (!(cursorResult = currentCursor.gotoParent())) {
              break;
            }
          }
        }
      } else {
        cursorResult = currentCursor.gotoFirstChild();
      }
      if (cursors.length > 1 && (!cursorResult && currentCursor === cursors[cursors.length - 1].cursor || isOutsideRange)) {
        current.cursor.delete();
        cursors.pop();
        cursorResult = true;
      }
    } while (cursorResult);
    cursor.delete();
    return tokens;
  }
  captureSyntaxTokens(fileName, content) {
    const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(URI.file(fileName));
    return this.textMateService.createTokenizer(languageId).then((grammar) => {
      if (!grammar) {
        return [];
      }
      const lines = splitLines(content);
      const result = this._tokenize(grammar, lines);
      return this._getThemesResult(grammar, lines).then((themesResult) => {
        this._enrichResult(result, themesResult);
        return result.filter((t) => t.c.length > 0);
      });
    });
  }
  async captureTreeSitterSyntaxTokens(resource, content) {
    const languageId = this.languageService.guessLanguageIdByFilepathOrFirstLine(resource);
    if (!languageId) {
      return [];
    }
    const model = this.modelService.getModel(resource) ?? this.modelService.createModel(content, { languageId, onDidChange: Event.None }, resource);
    const tokenizationPart = model.tokenization.tokens.get();
    if (!(tokenizationPart instanceof TreeSitterSyntaxTokenBackend)) {
      return [];
    }
    const treeObs = tokenizationPart.tree;
    const tokenizationImplObs = tokenizationPart.tokenizationImpl;
    const treeSitterTree = treeObs.get() ?? await waitForState(treeObs);
    const tokenizationImpl = tokenizationImplObs.get() ?? await waitForState(tokenizationImplObs);
    if (!treeSitterTree) {
      return [];
    }
    const result = (await this._treeSitterTokenize(treeSitterTree, tokenizationImpl, languageId)).filter((t) => t.c.length > 0);
    const themeTokens = await this._getTreeSitterThemesResult(result, languageId);
    this._enrichResult(result, themeTokens);
    return result;
  }
};
Snapper = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, ITextMateTokenizationService),
  __decorateParam(3, IModelService)
], Snapper);
async function captureTokens(accessor, resource, treeSitter = false) {
  const process = (resource2) => {
    const fileService = accessor.get(IFileService);
    const fileName = basename(resource2);
    const snapper = accessor.get(IInstantiationService).createInstance(Snapper);
    return fileService.readFile(resource2).then((content) => {
      if (treeSitter) {
        return snapper.captureTreeSitterSyntaxTokens(resource2, content.value.toString());
      } else {
        return snapper.captureSyntaxTokens(fileName, content.value.toString());
      }
    });
  };
  if (!resource) {
    const editorService = accessor.get(IEditorService);
    const file = editorService.activeEditor ? EditorResourceAccessor.getCanonicalUri(editorService.activeEditor, { filterByScheme: Schemas.file }) : null;
    if (file) {
      process(file).then((result) => {
        console.log(result);
      });
    } else {
      console.log("No file editor active");
    }
  } else {
    const processResult = await process(resource);
    return processResult;
  }
  return void 0;
}
CommandsRegistry.registerCommand("_workbench.captureSyntaxTokens", function(accessor, resource) {
  return captureTokens(accessor, resource);
});
CommandsRegistry.registerCommand("_workbench.captureTreeSitterSyntaxTokens", function(accessor, resource) {
  if (!resource) {
    const editorService = accessor.get(IEditorService);
    resource = editorService.activeEditor?.resource;
  }
  return captureTokens(accessor, resource, true);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRoZW1lc1xcYnJvd3NlclxcdGhlbWVzLnRlc3QuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB0eXBlICogYXMgUGFyc2VyIGZyb20gJ0B2c2NvZGUvdHJlZS1zaXR0ZXItd2FzbSc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsIElXb3JrYmVuY2hDb2xvclRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVRleHRNYXRlVG9rZW5pemF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRNYXRlL2Jyb3dzZXIvdGV4dE1hdGVUb2tlbml6YXRpb25GZWF0dXJlLmpzJztcbmltcG9ydCB0eXBlIHsgSUdyYW1tYXIsIFN0YXRlU3RhY2sgfSBmcm9tICd2c2NvZGUtdGV4dG1hdGUnO1xuaW1wb3J0IHsgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBUb2tlbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IFRoZW1lUnVsZSwgZmluZE1hdGNoaW5nVGhlbWVSdWxlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dE1hdGUvY29tbW9uL1RNSGVscGVyLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHNwbGl0TGluZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IENvbG9yVGhlbWVEYXRhLCBmaW5kTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yVGhlbWVEYXRhLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVHJlZVNpdHRlclRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJUcmVlLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblRleHRNb2RlbFBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90b2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0LmpzJztcbmltcG9ydCB7IFRyZWVTaXR0ZXJTeW50YXhUb2tlbkJhY2tlbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJTeW50YXhUb2tlbkJhY2tlbmQuanMnO1xuaW1wb3J0IHsgVHJlZVNpdHRlclRva2VuaXphdGlvbkltcGwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3Rva2Vucy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJUb2tlbml6YXRpb25JbXBsLmpzJztcbmltcG9ydCB7IHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuXG5pbnRlcmZhY2UgSVRva2VuIHtcblx0Yzogc3RyaW5nOyAvLyB0b2tlblxuXHR0OiBzdHJpbmc7IC8vIHNwYWNlIHNlcGFyYXRlZCBzY29wZXMsIG1vc3QgZ2VuZXJhbCB0byBtb3N0IHNwZWNpZmljXG5cdHI6IHsgW3RoZW1lTmFtZTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH07IC8vIHRva2VuIHR5cGU6IGNvbG9yXG59XG5cbmludGVyZmFjZSBJVGhlbWVkVG9rZW4ge1xuXHR0ZXh0OiBzdHJpbmc7XG5cdGNvbG9yOiBDb2xvciB8IG51bGw7XG59XG5cbmludGVyZmFjZSBJVGhlbWVzUmVzdWx0IHtcblx0W3RoZW1lTmFtZTogc3RyaW5nXToge1xuXHRcdGRvY3VtZW50OiBUaGVtZURvY3VtZW50O1xuXHRcdHRva2VuczogSVRoZW1lZFRva2VuW107XG5cdH07XG59XG5cbmNsYXNzIFRoZW1lRG9jdW1lbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90aGVtZTogSVdvcmtiZW5jaENvbG9yVGhlbWU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhY2hlOiB7IFtzY29wZXM6IHN0cmluZ106IFRoZW1lUnVsZSB9O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0Q29sb3I6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcih0aGVtZTogSVdvcmtiZW5jaENvbG9yVGhlbWUpIHtcblx0XHR0aGlzLl90aGVtZSA9IHRoZW1lO1xuXHRcdHRoaXMuX2NhY2hlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9kZWZhdWx0Q29sb3IgPSAnIzAwMDAwMCc7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRoaXMuX3RoZW1lLnRva2VuQ29sb3JzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBydWxlID0gdGhpcy5fdGhlbWUudG9rZW5Db2xvcnNbaV07XG5cdFx0XHRpZiAoIXJ1bGUuc2NvcGUpIHtcblx0XHRcdFx0dGhpcy5fZGVmYXVsdENvbG9yID0gcnVsZS5zZXR0aW5ncy5mb3JlZ3JvdW5kITtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZW5lcmF0ZUV4cGxhbmF0aW9uKHNlbGVjdG9yOiBzdHJpbmcsIGNvbG9yOiBDb2xvcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3NlbGVjdG9yfTogJHtDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoY29sb3IsIHRydWUpLnRvVXBwZXJDYXNlKCl9YDtcblx0fVxuXG5cdHB1YmxpYyBleHBsYWluVG9rZW5Db2xvcihzY29wZXM6IHN0cmluZywgY29sb3I6IENvbG9yKTogc3RyaW5nIHtcblxuXHRcdGNvbnN0IG1hdGNoaW5nUnVsZSA9IHRoaXMuX2ZpbmRNYXRjaGluZ1RoZW1lUnVsZShzY29wZXMpO1xuXHRcdGlmICghbWF0Y2hpbmdSdWxlKSB7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IENvbG9yLmZyb21IZXgodGhpcy5fZGVmYXVsdENvbG9yKTtcblx0XHRcdC8vIE5vIG1hdGNoaW5nIHJ1bGVcblx0XHRcdGlmICghY29sb3IuZXF1YWxzKGV4cGVjdGVkKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFske3RoaXMuX3RoZW1lLmxhYmVsfV06IFVuZXhwZWN0ZWQgY29sb3IgJHtDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoY29sb3IpfSBmb3IgJHtzY29wZXN9LiBFeHBlY3RlZCBkZWZhdWx0ICR7Q29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGV4cGVjdGVkKX1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLl9nZW5lcmF0ZUV4cGxhbmF0aW9uKCdkZWZhdWx0JywgY29sb3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gQ29sb3IuZnJvbUhleChtYXRjaGluZ1J1bGUuc2V0dGluZ3MuZm9yZWdyb3VuZCEpO1xuXHRcdGlmICghY29sb3IuZXF1YWxzKGV4cGVjdGVkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbJHt0aGlzLl90aGVtZS5sYWJlbH1dOiBVbmV4cGVjdGVkIGNvbG9yICR7Q29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGNvbG9yKX0gZm9yICR7c2NvcGVzfS4gRXhwZWN0ZWQgJHtDb2xvci5Gb3JtYXQuQ1NTLmZvcm1hdEhleEEoZXhwZWN0ZWQpfSBjb21pbmcgaW4gZnJvbSAke21hdGNoaW5nUnVsZS5yYXdTZWxlY3Rvcn1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dlbmVyYXRlRXhwbGFuYXRpb24obWF0Y2hpbmdSdWxlLnJhd1NlbGVjdG9yLCBjb2xvcik7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kTWF0Y2hpbmdUaGVtZVJ1bGUoc2NvcGVzOiBzdHJpbmcpOiBUaGVtZVJ1bGUge1xuXHRcdGlmICghdGhpcy5fY2FjaGVbc2NvcGVzXSkge1xuXHRcdFx0dGhpcy5fY2FjaGVbc2NvcGVzXSA9IGZpbmRNYXRjaGluZ1RoZW1lUnVsZSh0aGlzLl90aGVtZSwgc2NvcGVzLnNwbGl0KCcgJykpITtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlW3Njb3Blc107XG5cdH1cbn1cblxuY2xhc3MgU25hcHBlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TWF0ZVNlcnZpY2U6IElUZXh0TWF0ZVRva2VuaXphdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cHJpdmF0ZSBfdGhlbWVkVG9rZW5pemUoZ3JhbW1hcjogSUdyYW1tYXIsIGxpbmVzOiBzdHJpbmdbXSk6IElUaGVtZWRUb2tlbltdIHtcblx0XHRjb25zdCBjb2xvck1hcCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldENvbG9yTWFwKCk7XG5cdFx0bGV0IHN0YXRlOiBTdGF0ZVN0YWNrIHwgbnVsbCA9IG51bGw7XG5cdFx0Y29uc3QgcmVzdWx0OiBJVGhlbWVkVG9rZW5bXSA9IFtdO1xuXHRcdGxldCByZXN1bHRMZW4gPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXG5cdFx0XHRjb25zdCB0b2tlbml6YXRpb25SZXN1bHQgPSBncmFtbWFyLnRva2VuaXplTGluZTIobGluZSwgc3RhdGUpO1xuXG5cdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IHRva2VuaXphdGlvblJlc3VsdC50b2tlbnMubGVuZ3RoID4+PiAxOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0T2Zmc2V0ID0gdG9rZW5pemF0aW9uUmVzdWx0LnRva2Vuc1soaiA8PCAxKV07XG5cdFx0XHRcdGNvbnN0IG1ldGFkYXRhID0gdG9rZW5pemF0aW9uUmVzdWx0LnRva2Vuc1soaiA8PCAxKSArIDFdO1xuXHRcdFx0XHRjb25zdCBlbmRPZmZzZXQgPSBqICsgMSA8IGxlbkogPyB0b2tlbml6YXRpb25SZXN1bHQudG9rZW5zWygoaiArIDEpIDw8IDEpXSA6IGxpbmUubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCB0b2tlblRleHQgPSBsaW5lLnN1YnN0cmluZyhzdGFydE9mZnNldCwgZW5kT2Zmc2V0KTtcblxuXHRcdFx0XHRjb25zdCBjb2xvciA9IFRva2VuTWV0YWRhdGEuZ2V0Rm9yZWdyb3VuZChtZXRhZGF0YSk7XG5cblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IHtcblx0XHRcdFx0XHR0ZXh0OiB0b2tlblRleHQsXG5cdFx0XHRcdFx0Y29sb3I6IGNvbG9yTWFwIVtjb2xvcl1cblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0c3RhdGUgPSB0b2tlbml6YXRpb25SZXN1bHQucnVsZVN0YWNrO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF90aGVtZWRUb2tlbml6ZVRyZWVTaXR0ZXIodG9rZW5zOiBJVG9rZW5bXSwgbGFuZ3VhZ2VJZDogc3RyaW5nKTogSVRoZW1lZFRva2VuW10ge1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gVG9rZW5pemF0aW9uUmVnaXN0cnkuZ2V0Q29sb3JNYXAoKTtcblx0XHRjb25zdCByZXN1bHQ6IElUaGVtZWRUb2tlbltdID0gQXJyYXkodG9rZW5zLmxlbmd0aCk7XG5cdFx0Y29uc3QgY29sb3JUaGVtZURhdGEgPSB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkgYXMgQ29sb3JUaGVtZURhdGE7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHRva2Vucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbaV07XG5cdFx0XHRjb25zdCBzY29wZXMgPSB0b2tlbi50LnNwbGl0KCcgJyk7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IGZpbmRNZXRhZGF0YShjb2xvclRoZW1lRGF0YSwgc2NvcGVzLCB0aGlzLmxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgY29sb3IgPSBUb2tlbk1ldGFkYXRhLmdldEZvcmVncm91bmQobWV0YWRhdGEpO1xuXG5cdFx0XHRyZXN1bHRbaV0gPSB7XG5cdFx0XHRcdHRleHQ6IHRva2VuLmMsXG5cdFx0XHRcdGNvbG9yOiBjb2xvck1hcCFbY29sb3JdXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF90b2tlbml6ZShncmFtbWFyOiBJR3JhbW1hciwgbGluZXM6IHN0cmluZ1tdKTogSVRva2VuW10ge1xuXHRcdGxldCBzdGF0ZTogU3RhdGVTdGFjayB8IG51bGwgPSBudWxsO1xuXHRcdGNvbnN0IHJlc3VsdDogSVRva2VuW10gPSBbXTtcblx0XHRsZXQgcmVzdWx0TGVuID0gMDtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbGluZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpbmUgPSBsaW5lc1tpXTtcblxuXHRcdFx0Y29uc3QgdG9rZW5pemF0aW9uUmVzdWx0ID0gZ3JhbW1hci50b2tlbml6ZUxpbmUobGluZSwgc3RhdGUpO1xuXHRcdFx0bGV0IGxhc3RTY29wZXM6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRmb3IgKGxldCBqID0gMCwgbGVuSiA9IHRva2VuaXphdGlvblJlc3VsdC50b2tlbnMubGVuZ3RoOyBqIDwgbGVuSjsgaisrKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuID0gdG9rZW5pemF0aW9uUmVzdWx0LnRva2Vuc1tqXTtcblx0XHRcdFx0Y29uc3QgdG9rZW5UZXh0ID0gbGluZS5zdWJzdHJpbmcodG9rZW4uc3RhcnRJbmRleCwgdG9rZW4uZW5kSW5kZXgpO1xuXHRcdFx0XHRjb25zdCB0b2tlblNjb3BlcyA9IHRva2VuLnNjb3Blcy5qb2luKCcgJyk7XG5cblx0XHRcdFx0aWYgKGxhc3RTY29wZXMgPT09IHRva2VuU2NvcGVzKSB7XG5cdFx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbiAtIDFdLmMgKz0gdG9rZW5UZXh0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhc3RTY29wZXMgPSB0b2tlblNjb3Blcztcblx0XHRcdFx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0ge1xuXHRcdFx0XHRcdFx0YzogdG9rZW5UZXh0LFxuXHRcdFx0XHRcdFx0dDogdG9rZW5TY29wZXMsXG5cdFx0XHRcdFx0XHRyOiB7XG5cdFx0XHRcdFx0XHRcdGRhcmtfcGx1czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRsaWdodF9wbHVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGRhcmtfdnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0bGlnaHRfdnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0aGNfYmxhY2s6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHN0YXRlID0gdG9rZW5pemF0aW9uUmVzdWx0LnJ1bGVTdGFjaztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFRoZW1lc1Jlc3VsdChncmFtbWFyOiBJR3JhbW1hciwgbGluZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxJVGhlbWVzUmVzdWx0PiB7XG5cdFx0Y29uc3QgY3VycmVudFRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXG5cdFx0Y29uc3QgZ2V0VGhlbWVOYW1lID0gKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHBhcnQgPSAndnNjb2RlLXRoZW1lLWRlZmF1bHRzLXRoZW1lcy0nO1xuXHRcdFx0Y29uc3Qgc3RhcnRJZHggPSBpZC5pbmRleE9mKHBhcnQpO1xuXHRcdFx0aWYgKHN0YXJ0SWR4ICE9PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gaWQuc3Vic3RyaW5nKHN0YXJ0SWR4ICsgcGFydC5sZW5ndGgsIGlkLmxlbmd0aCAtIDUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJVGhlbWVzUmVzdWx0ID0ge307XG5cblx0XHRjb25zdCB0aGVtZURhdGFzID0gYXdhaXQgdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKTtcblx0XHRjb25zdCBkZWZhdWx0VGhlbWVzID0gdGhlbWVEYXRhcy5maWx0ZXIodGhlbWVEYXRhID0+ICEhZ2V0VGhlbWVOYW1lKHRoZW1lRGF0YS5pZCkpO1xuXHRcdGZvciAoY29uc3QgZGVmYXVsdFRoZW1lIG9mIGRlZmF1bHRUaGVtZXMpIHtcblx0XHRcdGNvbnN0IHRoZW1lSWQgPSBkZWZhdWx0VGhlbWUuaWQ7XG5cdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy50aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZSh0aGVtZUlkLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0Y29uc3QgdGhlbWVOYW1lID0gZ2V0VGhlbWVOYW1lKHRoZW1lSWQpO1xuXHRcdFx0XHRyZXN1bHRbdGhlbWVOYW1lIV0gPSB7XG5cdFx0XHRcdFx0ZG9jdW1lbnQ6IG5ldyBUaGVtZURvY3VtZW50KHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSksXG5cdFx0XHRcdFx0dG9rZW5zOiB0aGlzLl90aGVtZWRUb2tlbml6ZShncmFtbWFyLCBsaW5lcylcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgdGhpcy50aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZShjdXJyZW50VGhlbWUuaWQsIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFRyZWVTaXR0ZXJUaGVtZXNSZXN1bHQodG9rZW5zOiBJVG9rZW5bXSwgbGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTxJVGhlbWVzUmVzdWx0PiB7XG5cdFx0Y29uc3QgY3VycmVudFRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXG5cdFx0Y29uc3QgZ2V0VGhlbWVOYW1lID0gKGlkOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHBhcnQgPSAndnNjb2RlLXRoZW1lLWRlZmF1bHRzLXRoZW1lcy0nO1xuXHRcdFx0Y29uc3Qgc3RhcnRJZHggPSBpZC5pbmRleE9mKHBhcnQpO1xuXHRcdFx0aWYgKHN0YXJ0SWR4ICE9PSAtMSkge1xuXHRcdFx0XHRyZXR1cm4gaWQuc3Vic3RyaW5nKHN0YXJ0SWR4ICsgcGFydC5sZW5ndGgsIGlkLmxlbmd0aCAtIDUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBJVGhlbWVzUmVzdWx0ID0ge307XG5cblx0XHRjb25zdCB0aGVtZURhdGFzID0gYXdhaXQgdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKTtcblx0XHRjb25zdCBkZWZhdWx0VGhlbWVzID0gdGhlbWVEYXRhcy5maWx0ZXIodGhlbWVEYXRhID0+ICEhZ2V0VGhlbWVOYW1lKHRoZW1lRGF0YS5pZCkpO1xuXHRcdGZvciAoY29uc3QgZGVmYXVsdFRoZW1lIG9mIGRlZmF1bHRUaGVtZXMpIHtcblx0XHRcdGNvbnN0IHRoZW1lSWQgPSBkZWZhdWx0VGhlbWUuaWQ7XG5cdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy50aGVtZVNlcnZpY2Uuc2V0Q29sb3JUaGVtZSh0aGVtZUlkLCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdFx0Y29uc3QgdGhlbWVOYW1lID0gZ2V0VGhlbWVOYW1lKHRoZW1lSWQpO1xuXHRcdFx0XHRyZXN1bHRbdGhlbWVOYW1lIV0gPSB7XG5cdFx0XHRcdFx0ZG9jdW1lbnQ6IG5ldyBUaGVtZURvY3VtZW50KHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSksXG5cdFx0XHRcdFx0dG9rZW5zOiB0aGlzLl90aGVtZWRUb2tlbml6ZVRyZWVTaXR0ZXIodG9rZW5zLCBsYW5ndWFnZUlkKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnRoZW1lU2VydmljZS5zZXRDb2xvclRoZW1lKGN1cnJlbnRUaGVtZS5pZCwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblxuXHRwcml2YXRlIF9lbnJpY2hSZXN1bHQocmVzdWx0OiBJVG9rZW5bXSwgdGhlbWVzUmVzdWx0OiBJVGhlbWVzUmVzdWx0KTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXg6IHsgW3RoZW1lTmFtZTogc3RyaW5nXTogbnVtYmVyIH0gPSB7fTtcblx0XHRjb25zdCB0aGVtZU5hbWVzID0gT2JqZWN0LmtleXModGhlbWVzUmVzdWx0KTtcblx0XHRmb3IgKGNvbnN0IHRoZW1lTmFtZSBvZiB0aGVtZU5hbWVzKSB7XG5cdFx0XHRpbmRleFt0aGVtZU5hbWVdID0gMDtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcmVzdWx0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHJlc3VsdFtpXTtcblxuXHRcdFx0Zm9yIChjb25zdCB0aGVtZU5hbWUgb2YgdGhlbWVOYW1lcykge1xuXHRcdFx0XHRjb25zdCB0aGVtZWRUb2tlbiA9IHRoZW1lc1Jlc3VsdFt0aGVtZU5hbWVdLnRva2Vuc1tpbmRleFt0aGVtZU5hbWVdXTtcblxuXHRcdFx0XHR0aGVtZWRUb2tlbi50ZXh0ID0gdGhlbWVkVG9rZW4udGV4dC5zdWJzdHIodG9rZW4uYy5sZW5ndGgpO1xuXHRcdFx0XHRpZiAodGhlbWVkVG9rZW4uY29sb3IpIHtcblx0XHRcdFx0XHR0b2tlbi5yW3RoZW1lTmFtZV0gPSB0aGVtZXNSZXN1bHRbdGhlbWVOYW1lXS5kb2N1bWVudC5leHBsYWluVG9rZW5Db2xvcih0b2tlbi50LCB0aGVtZWRUb2tlbi5jb2xvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRoZW1lZFRva2VuLnRleHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0aW5kZXhbdGhlbWVOYW1lXSsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbW92ZUluamVjdGlvbkN1cnNvclRvUmFuZ2UoY3Vyc29yOiBQYXJzZXIuVHJlZUN1cnNvciwgaW5qZWN0aW9uUmFuZ2U6IHsgc3RhcnRJbmRleDogbnVtYmVyOyBlbmRJbmRleDogbnVtYmVyIH0pOiB2b2lkIHtcblx0XHRsZXQgY29udGludWVDdXJzb3IgPSBjdXJzb3IuZ290b0ZpcnN0Q2hpbGQoKTtcblx0XHQvLyBHZXQgaW50byB0aGUgZmlyc3QgXCJyZWFsXCIgY2hpbGQgbm9kZSwgYXMgdGhlIHJvb3Qgbm9kZXMgY2FuIGV4dGVuZCBvdXRzaWRlIHRoZSByYW5nZS5cblx0XHR3aGlsZSAoKChjdXJzb3Iuc3RhcnRJbmRleCA8IGluamVjdGlvblJhbmdlLnN0YXJ0SW5kZXgpIHx8IChjdXJzb3IuZW5kSW5kZXggPiBpbmplY3Rpb25SYW5nZS5lbmRJbmRleCkpICYmIGNvbnRpbnVlQ3Vyc29yKSB7XG5cdFx0XHRpZiAoY3Vyc29yLmVuZEluZGV4IDwgaW5qZWN0aW9uUmFuZ2Uuc3RhcnRJbmRleCkge1xuXHRcdFx0XHRjb250aW51ZUN1cnNvciA9IGN1cnNvci5nb3RvTmV4dFNpYmxpbmcoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnRpbnVlQ3Vyc29yID0gY3Vyc29yLmdvdG9GaXJzdENoaWxkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJlZVNpdHRlclRva2VuaXplKHRyZWVTaXR0ZXJUcmVlOiBUcmVlU2l0dGVyVHJlZSwgdG9rZW5pemF0aW9uTW9kZWw6IFRyZWVTaXR0ZXJUb2tlbml6YXRpb25JbXBsLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPElUb2tlbltdPiB7XG5cdFx0Y29uc3QgdHJlZSA9IGF3YWl0IHdhaXRGb3JTdGF0ZSh0cmVlU2l0dGVyVHJlZS50cmVlKTtcblx0XHRpZiAoIXRyZWUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgY3Vyc29yID0gdHJlZS53YWxrKCk7XG5cdFx0Y3Vyc29yLmdvdG9GaXJzdENoaWxkKCk7XG5cdFx0bGV0IGN1cnNvclJlc3VsdDogYm9vbGVhbiA9IHRydWU7XG5cdFx0Y29uc3QgdG9rZW5zOiBJVG9rZW5bXSA9IFtdO1xuXG5cdFx0Y29uc3QgY3Vyc29yczogeyBjdXJzb3I6IFBhcnNlci5UcmVlQ3Vyc29yOyBsYW5ndWFnZUlkOiBzdHJpbmc7IHN0YXJ0T2Zmc2V0OiBudW1iZXI7IGVuZE9mZnNldDogbnVtYmVyIH1bXSA9IFt7IGN1cnNvciwgbGFuZ3VhZ2VJZCwgc3RhcnRPZmZzZXQ6IDAsIGVuZE9mZnNldDogdHJlZVNpdHRlclRyZWUudGV4dE1vZGVsLmdldFZhbHVlTGVuZ3RoKCkgfV07XG5cdFx0ZG8ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IGN1cnNvcnNbY3Vyc29ycy5sZW5ndGggLSAxXTtcblx0XHRcdGNvbnN0IGN1cnJlbnRDdXJzb3IgPSBjdXJyZW50LmN1cnNvcjtcblx0XHRcdGNvbnN0IGN1cnJlbnRMYW5ndWFnZUlkID0gY3VycmVudC5sYW5ndWFnZUlkO1xuXHRcdFx0Y29uc3QgaXNPdXRzaWRlUmFuZ2U6IGJvb2xlYW4gPSAoY3VycmVudEN1cnNvci5jdXJyZW50Tm9kZS5lbmRJbmRleCA+IGN1cnJlbnQuZW5kT2Zmc2V0KTtcblxuXHRcdFx0aWYgKCFpc091dHNpZGVSYW5nZSAmJiAoY3VycmVudEN1cnNvci5jdXJyZW50Tm9kZS5jaGlsZENvdW50ID09PSAwKSkge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShjdXJyZW50Q3Vyc29yLmN1cnJlbnROb2RlLnN0YXJ0UG9zaXRpb24ucm93ICsgMSwgY3VycmVudEN1cnNvci5jdXJyZW50Tm9kZS5zdGFydFBvc2l0aW9uLmNvbHVtbiArIDEsIGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuZW5kUG9zaXRpb24ucm93ICsgMSwgY3VycmVudEN1cnNvci5jdXJyZW50Tm9kZS5lbmRQb3NpdGlvbi5jb2x1bW4gKyAxKTtcblx0XHRcdFx0Y29uc3QgaW5qZWN0aW9uID0gdHJlZVNpdHRlclRyZWUuZ2V0SW5qZWN0aW9uVHJlZXMoY3VycmVudEN1cnNvci5jdXJyZW50Tm9kZS5zdGFydEluZGV4LCBjdXJyZW50TGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdGNvbnN0IHRyZWVTaXR0ZXJSYW5nZSA9IGluamVjdGlvbj8ucmFuZ2VzIS5maW5kKHIgPT4gci5zdGFydEluZGV4IDw9IGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuc3RhcnRJbmRleCAmJiByLmVuZEluZGV4ID49IGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUuZW5kSW5kZXgpO1xuXG5cdFx0XHRcdGNvbnN0IGluamVjdGlvblRyZWUgPSBpbmplY3Rpb24/LnRyZWUuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGluamVjdGlvbkxhbmd1YWdlSWQgPSBpbmplY3Rpb24/Lmxhbmd1YWdlSWQ7XG5cdFx0XHRcdGlmIChpbmplY3Rpb25UcmVlICYmIGluamVjdGlvbkxhbmd1YWdlSWQgJiYgdHJlZVNpdHRlclJhbmdlICYmICh0cmVlU2l0dGVyUmFuZ2Uuc3RhcnRJbmRleCA9PT0gY3VycmVudEN1cnNvci5jdXJyZW50Tm9kZS5zdGFydEluZGV4KSkge1xuXHRcdFx0XHRcdGNvbnN0IGluamVjdGlvbkN1cnNvciA9IGluamVjdGlvblRyZWUud2FsaygpO1xuXHRcdFx0XHRcdHRoaXMuX21vdmVJbmplY3Rpb25DdXJzb3JUb1JhbmdlKGluamVjdGlvbkN1cnNvciwgdHJlZVNpdHRlclJhbmdlKTtcblx0XHRcdFx0XHRjdXJzb3JzLnB1c2goeyBjdXJzb3I6IGluamVjdGlvbkN1cnNvciwgbGFuZ3VhZ2VJZDogaW5qZWN0aW9uTGFuZ3VhZ2VJZCwgc3RhcnRPZmZzZXQ6IHRyZWVTaXR0ZXJSYW5nZS5zdGFydEluZGV4LCBlbmRPZmZzZXQ6IHRyZWVTaXR0ZXJSYW5nZS5lbmRJbmRleCB9KTtcblx0XHRcdFx0XHR3aGlsZSAoKGN1cnJlbnRDdXJzb3IuZW5kSW5kZXggPD0gdHJlZVNpdHRlclJhbmdlLmVuZEluZGV4KSAmJiAoY3VycmVudEN1cnNvci5nb3RvTmV4dFNpYmxpbmcoKSB8fCBjdXJyZW50Q3Vyc29yLmdvdG9QYXJlbnQoKSkpIHsgfVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGNhcHR1cmUgPSB0b2tlbml6YXRpb25Nb2RlbC5jYXB0dXJlQXRSYW5nZVRyZWUocmFuZ2UpO1xuXHRcdFx0XHRcdHRva2Vucy5wdXNoKHtcblx0XHRcdFx0XHRcdGM6IGN1cnJlbnRDdXJzb3IuY3VycmVudE5vZGUudGV4dC5yZXBsYWNlKC9cXHIvZywgJycpLFxuXHRcdFx0XHRcdFx0dDogY2FwdHVyZT8ubWFwKGNhcCA9PiBjYXAubmFtZSkuam9pbignICcpID8/ICcnLFxuXHRcdFx0XHRcdFx0cjoge1xuXHRcdFx0XHRcdFx0XHRkYXJrX3BsdXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0bGlnaHRfcGx1czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRkYXJrX3ZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGxpZ2h0X3ZzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGhjX2JsYWNrOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0d2hpbGUgKCEoY3Vyc29yUmVzdWx0ID0gY3VycmVudEN1cnNvci5nb3RvTmV4dFNpYmxpbmcoKSkpIHtcblx0XHRcdFx0XHRcdGlmICghKGN1cnNvclJlc3VsdCA9IGN1cnJlbnRDdXJzb3IuZ290b1BhcmVudCgpKSkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y3Vyc29yUmVzdWx0ID0gY3VycmVudEN1cnNvci5nb3RvRmlyc3RDaGlsZCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnNvcnMubGVuZ3RoID4gMSAmJiAoKCFjdXJzb3JSZXN1bHQgJiYgY3VycmVudEN1cnNvciA9PT0gY3Vyc29yc1tjdXJzb3JzLmxlbmd0aCAtIDFdLmN1cnNvcikgfHwgaXNPdXRzaWRlUmFuZ2UpKSB7XG5cdFx0XHRcdGN1cnJlbnQuY3Vyc29yLmRlbGV0ZSgpO1xuXHRcdFx0XHRjdXJzb3JzLnBvcCgpO1xuXHRcdFx0XHRjdXJzb3JSZXN1bHQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKGN1cnNvclJlc3VsdCk7XG5cdFx0Y3Vyc29yLmRlbGV0ZSgpO1xuXHRcdHJldHVybiB0b2tlbnM7XG5cdH1cblxuXHRwdWJsaWMgY2FwdHVyZVN5bnRheFRva2VucyhmaWxlTmFtZTogc3RyaW5nLCBjb250ZW50OiBzdHJpbmcpOiBQcm9taXNlPElUb2tlbltdPiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmd1ZXNzTGFuZ3VhZ2VJZEJ5RmlsZXBhdGhPckZpcnN0TGluZShVUkkuZmlsZShmaWxlTmFtZSkpO1xuXHRcdHJldHVybiB0aGlzLnRleHRNYXRlU2VydmljZS5jcmVhdGVUb2tlbml6ZXIobGFuZ3VhZ2VJZCEpLnRoZW4oKGdyYW1tYXIpID0+IHtcblx0XHRcdGlmICghZ3JhbW1hcikge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXMoY29udGVudCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3Rva2VuaXplKGdyYW1tYXIsIGxpbmVzKTtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRUaGVtZXNSZXN1bHQoZ3JhbW1hciwgbGluZXMpLnRoZW4oKHRoZW1lc1Jlc3VsdCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9lbnJpY2hSZXN1bHQocmVzdWx0LCB0aGVtZXNSZXN1bHQpO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LmZpbHRlcih0ID0+IHQuYy5sZW5ndGggPiAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNhcHR1cmVUcmVlU2l0dGVyU3ludGF4VG9rZW5zKHJlc291cmNlOiBVUkksIGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8SVRva2VuW10+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gdGhpcy5sYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlKTtcblx0XHRpZiAoIWxhbmd1YWdlSWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxTZXJ2aWNlLmdldE1vZGVsKHJlc291cmNlKSA/PyB0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChjb250ZW50LCB7IGxhbmd1YWdlSWQsIG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lIH0sIHJlc291cmNlKTtcblx0XHRjb25zdCB0b2tlbml6YXRpb25QYXJ0ID0gKG1vZGVsLnRva2VuaXphdGlvbiBhcyBUb2tlbml6YXRpb25UZXh0TW9kZWxQYXJ0KS50b2tlbnMuZ2V0KCk7XG5cdFx0aWYgKCEodG9rZW5pemF0aW9uUGFydCBpbnN0YW5jZW9mIFRyZWVTaXR0ZXJTeW50YXhUb2tlbkJhY2tlbmQpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJlZU9icyA9IHRva2VuaXphdGlvblBhcnQudHJlZTtcblx0XHRjb25zdCB0b2tlbml6YXRpb25JbXBsT2JzID0gdG9rZW5pemF0aW9uUGFydC50b2tlbml6YXRpb25JbXBsO1xuXHRcdGNvbnN0IHRyZWVTaXR0ZXJUcmVlID0gdHJlZU9icy5nZXQoKSA/PyBhd2FpdCB3YWl0Rm9yU3RhdGUodHJlZU9icyk7XG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uSW1wbCA9IHRva2VuaXphdGlvbkltcGxPYnMuZ2V0KCkgPz8gYXdhaXQgd2FpdEZvclN0YXRlKHRva2VuaXphdGlvbkltcGxPYnMpO1xuXHRcdC8vIFRPRE86IGluamVjdGlvbnNcblx0XHRpZiAoIXRyZWVTaXR0ZXJUcmVlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IChhd2FpdCB0aGlzLl90cmVlU2l0dGVyVG9rZW5pemUodHJlZVNpdHRlclRyZWUsIHRva2VuaXphdGlvbkltcGwsIGxhbmd1YWdlSWQpKS5maWx0ZXIodCA9PiB0LmMubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgdGhlbWVUb2tlbnMgPSBhd2FpdCB0aGlzLl9nZXRUcmVlU2l0dGVyVGhlbWVzUmVzdWx0KHJlc3VsdCwgbGFuZ3VhZ2VJZCk7XG5cdFx0dGhpcy5fZW5yaWNoUmVzdWx0KHJlc3VsdCwgdGhlbWVUb2tlbnMpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBjYXB0dXJlVG9rZW5zKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB0cmVlU2l0dGVyOiBib29sZWFuID0gZmFsc2UpIHtcblx0Y29uc3QgcHJvY2VzcyA9IChyZXNvdXJjZTogVVJJKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlTmFtZSA9IGJhc2VuYW1lKHJlc291cmNlKTtcblx0XHRjb25zdCBzbmFwcGVyID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoU25hcHBlcik7XG5cblx0XHRyZXR1cm4gZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpLnRoZW4oY29udGVudCA9PiB7XG5cdFx0XHRpZiAodHJlZVNpdHRlcikge1xuXHRcdFx0XHRyZXR1cm4gc25hcHBlci5jYXB0dXJlVHJlZVNpdHRlclN5bnRheFRva2VucyhyZXNvdXJjZSwgY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBzbmFwcGVyLmNhcHR1cmVTeW50YXhUb2tlbnMoZmlsZU5hbWUsIGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH07XG5cblx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGZpbGUgPSBlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciA/IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yLCB7IGZpbHRlckJ5U2NoZW1lOiBTY2hlbWFzLmZpbGUgfSkgOiBudWxsO1xuXHRcdGlmIChmaWxlKSB7XG5cdFx0XHRwcm9jZXNzKGZpbGUpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0Y29uc29sZS5sb2cocmVzdWx0KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zb2xlLmxvZygnTm8gZmlsZSBlZGl0b3IgYWN0aXZlJyk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGNvbnN0IHByb2Nlc3NSZXN1bHQgPSBhd2FpdCBwcm9jZXNzKHJlc291cmNlKTtcblx0XHRyZXR1cm4gcHJvY2Vzc1Jlc3VsdDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xuXG59XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCdfd29ya2JlbmNoLmNhcHR1cmVTeW50YXhUb2tlbnMnLCBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJlc291cmNlOiBVUkkpIHtcblx0cmV0dXJuIGNhcHR1cmVUb2tlbnMoYWNjZXNzb3IsIHJlc291cmNlKTtcbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX3dvcmtiZW5jaC5jYXB0dXJlVHJlZVNpdHRlclN5bnRheFRva2VucycsIGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgcmVzb3VyY2U/OiBVUkkpIHtcblx0Ly8gSWYgbm8gcmVzb3VyY2UgaXMgcHJvdmlkZWQsIHVzZSB0aGUgYWN0aXZlIGVkaXRvcidzIHJlc291cmNlXG5cdC8vIFRoaXMgaXMgdXNlZnVsIGZvciB0ZXN0aW5nIHRoZSBjb21tYW5kXG5cdGlmICghcmVzb3VyY2UpIHtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0XHRyZXNvdXJjZSA9IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yPy5yZXNvdXJjZTtcblx0fVxuXHRyZXR1cm4gY2FwdHVyZVRva2VucyhhY2Nlc3NvciwgcmVzb3VyY2UsIHRydWUpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUVwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUErQztBQUN4RCxTQUFTLDhCQUFvRDtBQUM3RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG9DQUFvQztBQUU3QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFvQiw2QkFBNkI7QUFDakQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUF5QixvQkFBb0I7QUFDN0MsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsYUFBYTtBQUd0QixTQUFTLG9DQUFvQztBQUU3QyxTQUFTLG9CQUFvQjtBQW9CN0IsTUFBTSxjQUFjO0FBQUEsRUFLbkIsWUFBWSxPQUE2QjtBQUN4QyxTQUFLLFNBQVM7QUFDZCxTQUFLLFNBQVMsdUJBQU8sT0FBTyxJQUFJO0FBQ2hDLFNBQUssZ0JBQWdCO0FBQ3JCLGFBQVMsSUFBSSxHQUFHLE1BQU0sS0FBSyxPQUFPLFlBQVksUUFBUSxJQUFJLEtBQUssS0FBSztBQUNuRSxZQUFNLE9BQU8sS0FBSyxPQUFPLFlBQVksQ0FBQztBQUN0QyxVQUFJLENBQUMsS0FB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
