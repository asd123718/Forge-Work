import * as strings from "../../../base/common/strings.js";
import { IndentAction } from "./languageConfiguration.js";
import { IndentConsts } from "./supports/indentRules.js";
import { EditorAutoIndentStrategy } from "../config/editorOptions.js";
import { IndentationContextProcessor, isLanguageDifferentFromLineStart, ProcessedIndentRulesSupport } from "./supports/indentationLineProcessor.js";
function getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport) {
  const languageId = model.tokenization.getLanguageIdAtPosition(lineNumber, 0);
  if (lineNumber > 1) {
    let lastLineNumber;
    let resultLineNumber = -1;
    for (lastLineNumber = lineNumber - 1; lastLineNumber >= 1; lastLineNumber--) {
      if (model.tokenization.getLanguageIdAtPosition(lastLineNumber, 0) !== languageId) {
        return resultLineNumber;
      }
      const text = model.getLineContent(lastLineNumber);
      if (processedIndentRulesSupport.shouldIgnore(lastLineNumber) || /^\s+$/.test(text) || text === "") {
        resultLineNumber = lastLineNumber;
        continue;
      }
      return lastLineNumber;
    }
  }
  return -1;
}
function getInheritIndentForLine(autoIndent, model, lineNumber, honorIntentialIndent = true, languageConfigurationService) {
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.tokenization.getLanguageId()).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  const processedIndentRulesSupport = new ProcessedIndentRulesSupport(model, indentRulesSupport, languageConfigurationService);
  if (lineNumber <= 1) {
    return {
      indentation: "",
      action: null
    };
  }
  for (let priorLineNumber = lineNumber - 1; priorLineNumber > 0; priorLineNumber--) {
    if (model.getLineContent(priorLineNumber) !== "") {
      break;
    }
    if (priorLineNumber === 1) {
      return {
        indentation: "",
        action: null
      };
    }
  }
  const precedingUnIgnoredLine = getPrecedingValidLine(model, lineNumber, processedIndentRulesSupport);
  if (precedingUnIgnoredLine < 0) {
    return null;
  } else if (precedingUnIgnoredLine < 1) {
    return {
      indentation: "",
      action: null
    };
  }
  if (processedIndentRulesSupport.shouldIncrease(precedingUnIgnoredLine) || processedIndentRulesSupport.shouldIndentNextLine(precedingUnIgnoredLine)) {
    const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
    return {
      indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
      action: IndentAction.Indent,
      line: precedingUnIgnoredLine
    };
  } else if (processedIndentRulesSupport.shouldDecrease(precedingUnIgnoredLine)) {
    const precedingUnIgnoredLineContent = model.getLineContent(precedingUnIgnoredLine);
    return {
      indentation: strings.getLeadingWhitespace(precedingUnIgnoredLineContent),
      action: null,
      line: precedingUnIgnoredLine
    };
  } else {
    if (precedingUnIgnoredLine === 1) {
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
        action: null,
        line: precedingUnIgnoredLine
      };
    }
    const previousLine = precedingUnIgnoredLine - 1;
    const previousLineIndentMetadata = indentRulesSupport.getIndentMetadata(model.getLineContent(previousLine));
    if (!(previousLineIndentMetadata & (IndentConsts.INCREASE_MASK | IndentConsts.DECREASE_MASK)) && previousLineIndentMetadata & IndentConsts.INDENT_NEXTLINE_MASK) {
      let stopLine = 0;
      for (let i = previousLine - 1; i > 0; i--) {
        if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
          continue;
        }
        stopLine = i;
        break;
      }
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
        action: null,
        line: stopLine + 1
      };
    }
    if (honorIntentialIndent) {
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(precedingUnIgnoredLine)),
        action: null,
        line: precedingUnIgnoredLine
      };
    } else {
      for (let i = precedingUnIgnoredLine; i > 0; i--) {
        if (processedIndentRulesSupport.shouldIncrease(i)) {
          return {
            indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
            action: IndentAction.Indent,
            line: i
          };
        } else if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
          let stopLine = 0;
          for (let j = i - 1; j > 0; j--) {
            if (processedIndentRulesSupport.shouldIndentNextLine(i)) {
              continue;
            }
            stopLine = j;
            break;
          }
          return {
            indentation: strings.getLeadingWhitespace(model.getLineContent(stopLine + 1)),
            action: null,
            line: stopLine + 1
          };
        } else if (processedIndentRulesSupport.shouldDecrease(i)) {
          return {
            indentation: strings.getLeadingWhitespace(model.getLineContent(i)),
            action: null,
            line: i
          };
        }
      }
      return {
        indentation: strings.getLeadingWhitespace(model.getLineContent(1)),
        action: null,
        line: 1
      };
    }
  }
}
function getGoodIndentForLine(autoIndent, virtualModel, languageId, lineNumber, indentConverter, languageConfigurationService) {
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const richEditSupport = languageConfigurationService.getLanguageConfiguration(languageId);
  if (!richEditSupport) {
    return null;
  }
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  const processedIndentRulesSupport = new ProcessedIndentRulesSupport(virtualModel, indentRulesSupport, languageConfigurationService);
  const indent = getInheritIndentForLine(autoIndent, virtualModel, lineNumber, void 0, languageConfigurationService);
  if (indent) {
    const inheritLine = indent.line;
    if (inheritLine !== void 0) {
      let shouldApplyEnterRules = true;
      for (let inBetweenLine = inheritLine; inBetweenLine < lineNumber - 1; inBetweenLine++) {
        if (!/^\s*$/.test(virtualModel.getLineContent(inBetweenLine))) {
          shouldApplyEnterRules = false;
          break;
        }
      }
      if (shouldApplyEnterRules) {
        const enterResult = richEditSupport.onEnter(autoIndent, "", virtualModel.getLineContent(inheritLine), "");
        if (enterResult) {
          let indentation = strings.getLeadingWhitespace(virtualModel.getLineContent(inheritLine));
          if (enterResult.removeText) {
            indentation = indentation.substring(0, indentation.length - enterResult.removeText);
          }
          if (enterResult.indentAction === IndentAction.Indent || enterResult.indentAction === IndentAction.IndentOutdent) {
            indentation = indentConverter.shiftIndent(indentation);
          } else if (enterResult.indentAction === IndentAction.Outdent) {
            indentation = indentConverter.unshiftIndent(indentation);
          }
          if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
            indentation = indentConverter.unshiftIndent(indentation);
          }
          if (enterResult.appendText) {
            indentation += enterResult.appendText;
          }
          return strings.getLeadingWhitespace(indentation);
        }
      }
    }
    if (processedIndentRulesSupport.shouldDecrease(lineNumber)) {
      if (indent.action === IndentAction.Indent) {
        return indent.indentation;
      } else {
        return indentConverter.unshiftIndent(indent.indentation);
      }
    } else {
      if (indent.action === IndentAction.Indent) {
        return indentConverter.shiftIndent(indent.indentation);
      } else {
        return indent.indentation;
      }
    }
  }
  return null;
}
function getIndentForEnter(autoIndent, model, range, indentConverter, languageConfigurationService) {
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  model.tokenization.forceTokenization(range.startLineNumber);
  const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
  const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
  const afterEnterProcessedTokens = processedContextTokens.afterRangeProcessedTokens;
  const beforeEnterProcessedTokens = processedContextTokens.beforeRangeProcessedTokens;
  const beforeEnterIndent = strings.getLeadingWhitespace(beforeEnterProcessedTokens.getLineContent());
  const virtualModel = createVirtualModelWithModifiedTokensAtLine(model, range.startLineNumber, beforeEnterProcessedTokens);
  const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
  const currentLine = model.getLineContent(range.startLineNumber);
  const currentLineIndent = strings.getLeadingWhitespace(currentLine);
  const afterEnterAction = getInheritIndentForLine(autoIndent, virtualModel, range.startLineNumber + 1, void 0, languageConfigurationService);
  if (!afterEnterAction) {
    const beforeEnter = languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent;
    return {
      beforeEnter,
      afterEnter: beforeEnter
    };
  }
  let afterEnterIndent = languageIsDifferentFromLineStart ? currentLineIndent : afterEnterAction.indentation;
  if (afterEnterAction.action === IndentAction.Indent) {
    afterEnterIndent = indentConverter.shiftIndent(afterEnterIndent);
  }
  if (indentRulesSupport.shouldDecrease(afterEnterProcessedTokens.getLineContent())) {
    afterEnterIndent = indentConverter.unshiftIndent(afterEnterIndent);
  }
  return {
    beforeEnter: languageIsDifferentFromLineStart ? currentLineIndent : beforeEnterIndent,
    afterEnter: afterEnterIndent
  };
}
function getIndentActionForType(cursorConfig, model, range, ch, indentConverter, languageConfigurationService) {
  const autoIndent = cursorConfig.autoIndent;
  if (autoIndent < EditorAutoIndentStrategy.Full) {
    return null;
  }
  const languageIsDifferentFromLineStart = isLanguageDifferentFromLineStart(model, range.getStartPosition());
  if (languageIsDifferentFromLineStart) {
    return null;
  }
  const languageId = model.getLanguageIdAtPosition(range.startLineNumber, range.startColumn);
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(languageId).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  const indentationContextProcessor = new IndentationContextProcessor(model, languageConfigurationService);
  const processedContextTokens = indentationContextProcessor.getProcessedTokenContextAroundRange(range);
  const beforeRangeText = processedContextTokens.beforeRangeProcessedTokens.getLineContent();
  const afterRangeText = processedContextTokens.afterRangeProcessedTokens.getLineContent();
  const textAroundRange = beforeRangeText + afterRangeText;
  const textAroundRangeWithCharacter = beforeRangeText + ch + afterRangeText;
  if (!indentRulesSupport.shouldDecrease(textAroundRange) && indentRulesSupport.shouldDecrease(textAroundRangeWithCharacter)) {
    const r = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
    if (!r) {
      return null;
    }
    let indentation = r.indentation;
    if (r.action !== IndentAction.Indent) {
      indentation = indentConverter.unshiftIndent(indentation);
    }
    return indentation;
  }
  const previousLineNumber = range.startLineNumber - 1;
  if (previousLineNumber > 0) {
    const previousLine = model.getLineContent(previousLineNumber);
    if (indentRulesSupport.shouldIndentNextLine(previousLine) && indentRulesSupport.shouldIncrease(textAroundRangeWithCharacter)) {
      const inheritedIndentationData = getInheritIndentForLine(autoIndent, model, range.startLineNumber, false, languageConfigurationService);
      const inheritedIndentation = inheritedIndentationData?.indentation;
      if (inheritedIndentation !== void 0) {
        const currentLine = model.getLineContent(range.startLineNumber);
        const actualCurrentIndentation = strings.getLeadingWhitespace(currentLine);
        const inferredCurrentIndentation = indentConverter.shiftIndent(inheritedIndentation);
        const inferredIndentationEqualsActual = inferredCurrentIndentation === actualCurrentIndentation;
        const textAroundRangeContainsOnlyWhitespace = /^\s*$/.test(textAroundRange);
        const autoClosingPairs = cursorConfig.autoClosingPairs.autoClosingPairsOpenByEnd.get(ch);
        const autoClosingPairExists = autoClosingPairs && autoClosingPairs.length > 0;
        const isChFirstNonWhitespaceCharacterAndInAutoClosingPair = autoClosingPairExists && textAroundRangeContainsOnlyWhitespace;
        if (inferredIndentationEqualsActual && isChFirstNonWhitespaceCharacterAndInAutoClosingPair) {
          return inheritedIndentation;
        }
      }
    }
  }
  return null;
}
function getIndentMetadata(model, lineNumber, languageConfigurationService) {
  const indentRulesSupport = languageConfigurationService.getLanguageConfiguration(model.getLanguageId()).indentRulesSupport;
  if (!indentRulesSupport) {
    return null;
  }
  if (lineNumber < 1 || lineNumber > model.getLineCount()) {
    return null;
  }
  return indentRulesSupport.getIndentMetadata(model.getLineContent(lineNumber));
}
function createVirtualModelWithModifiedTokensAtLine(model, modifiedLineNumber, modifiedTokens) {
  const virtualModel = {
    tokenization: {
      getLineTokens: (lineNumber) => {
        if (lineNumber === modifiedLineNumber) {
          return modifiedTokens;
        } else {
          return model.tokenization.getLineTokens(lineNumber);
        }
      },
      getLanguageId: () => {
        return model.getLanguageId();
      },
      getLanguageIdAtPosition: (lineNumber, column) => {
        return model.getLanguageIdAtPosition(lineNumber, column);
      }
    },
    getLineContent: (lineNumber) => {
      if (lineNumber === modifiedLineNumber) {
        return modifiedTokens.getLineContent();
      } else {
        return model.getLineContent(lineNumber);
      }
    }
  };
  return virtualModel;
}
export {
  getGoodIndentForLine,
  getIndentActionForType,
  getIndentForEnter,
  getIndentMetadata,
  getInheritIndentForLine
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbW1vblxcbGFuZ3VhZ2VzXFxhdXRvSW5kZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vbW9kZWwuanMnO1xuaW1wb3J0IHsgSW5kZW50QWN0aW9uIH0gZnJvbSAnLi9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSW5kZW50Q29uc3RzIH0gZnJvbSAnLi9zdXBwb3J0cy9pbmRlbnRSdWxlcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kgfSBmcm9tICcuLi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVZpZXdMaW5lVG9rZW5zIH0gZnJvbSAnLi4vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgSW5kZW50YXRpb25Db250ZXh0UHJvY2Vzc29yLCBpc0xhbmd1YWdlRGlmZmVyZW50RnJvbUxpbmVTdGFydCwgUHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0IH0gZnJvbSAnLi9zdXBwb3J0cy9pbmRlbnRhdGlvbkxpbmVQcm9jZXNzb3IuanMnO1xuaW1wb3J0IHsgQ3Vyc29yQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2N1cnNvckNvbW1vbi5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZpcnR1YWxNb2RlbCB7XG5cdHRva2VuaXphdGlvbjoge1xuXHRcdGdldExpbmVUb2tlbnMobGluZU51bWJlcjogbnVtYmVyKTogSVZpZXdMaW5lVG9rZW5zO1xuXHRcdGdldExhbmd1YWdlSWQoKTogc3RyaW5nO1xuXHRcdGdldExhbmd1YWdlSWRBdFBvc2l0aW9uKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBzdHJpbmc7XG5cdFx0Zm9yY2VUb2tlbml6YXRpb24/KGxpbmVOdW1iZXI6IG51bWJlcik6IHZvaWQ7XG5cdH07XG5cdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5kZW50Q29udmVydGVyIHtcblx0c2hpZnRJbmRlbnQoaW5kZW50YXRpb246IHN0cmluZyk6IHN0cmluZztcblx0dW5zaGlmdEluZGVudChpbmRlbnRhdGlvbjogc3RyaW5nKTogc3RyaW5nO1xuXHRub3JtYWxpemVJbmRlbnRhdGlvbj8oaW5kZW50YXRpb246IHN0cmluZyk6IHN0cmluZztcbn1cblxuLyoqXG4gKiBHZXQgbmVhcmVzdCBwcmVjZWRpbmcgbGluZSB3aGljaCBkb2Vzbid0IG1hdGNoIHVuSW5kZW50UGF0dGVybiBvciBjb250YWlucyBhbGwgd2hpdGVzcGFjZS5cbiAqIFJlc3VsdDpcbiAqIC0xOiBydW4gaW50byB0aGUgYm91bmRhcnkgb2YgZW1iZWRkZWQgbGFuZ3VhZ2VzXG4gKiAwOiBldmVyeSBsaW5lIGFib3ZlIGFyZSBpbnZhbGlkXG4gKiBlbHNlOiBuZWFyZXN0IHByZWNlZGluZyBsaW5lIG9mIHRoZSBzYW1lIGxhbmd1YWdlXG4gKi9cbmZ1bmN0aW9uIGdldFByZWNlZGluZ1ZhbGlkTGluZShtb2RlbDogSVZpcnR1YWxNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCBwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQ6IFByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydCkge1xuXHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwudG9rZW5pemF0aW9uLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKGxpbmVOdW1iZXIsIDApO1xuXHRpZiAobGluZU51bWJlciA+IDEpIHtcblx0XHRsZXQgbGFzdExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgcmVzdWx0TGluZU51bWJlciA9IC0xO1xuXG5cdFx0Zm9yIChsYXN0TGluZU51bWJlciA9IGxpbmVOdW1iZXIgLSAxOyBsYXN0TGluZU51bWJlciA+PSAxOyBsYXN0TGluZU51bWJlci0tKSB7XG5cdFx0XHRpZiAobW9kZWwudG9rZW5pemF0aW9uLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKGxhc3RMaW5lTnVtYmVyLCAwKSAhPT0gbGFuZ3VhZ2VJZCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0TGluZU51bWJlcjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsYXN0TGluZU51bWJlcik7XG5cdFx0XHRpZiAocHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZElnbm9yZShsYXN0TGluZU51bWJlcikgfHwgL15cXHMrJC8udGVzdCh0ZXh0KSB8fCB0ZXh0ID09PSAnJykge1xuXHRcdFx0XHRyZXN1bHRMaW5lTnVtYmVyID0gbGFzdExpbmVOdW1iZXI7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbGFzdExpbmVOdW1iZXI7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIC0xO1xufVxuXG4vKipcbiAqIEdldCBpbmhlcml0ZWQgaW5kZW50YXRpb24gZnJvbSBhYm92ZSBsaW5lcy5cbiAqIDEuIEZpbmQgdGhlIG5lYXJlc3QgcHJlY2VkaW5nIGxpbmUgd2hpY2ggZG9lc24ndCBtYXRjaCB1bkluZGVudGVkTGluZVBhdHRlcm4uXG4gKiAyLiBJZiB0aGlzIGxpbmUgbWF0Y2hlcyBpbmRlbnROZXh0TGluZVBhdHRlcm4gb3IgaW5jcmVhc2VJbmRlbnRQYXR0ZXJuLCBpdCBtZWFucyB0aGF0IHRoZSBpbmRlbnQgbGV2ZWwgb2YgYGxpbmVOdW1iZXJgIHNob3VsZCBiZSAxIGdyZWF0ZXIgdGhhbiB0aGlzIGxpbmUuXG4gKiAzLiBJZiB0aGlzIGxpbmUgZG9lc24ndCBtYXRjaCBhbnkgaW5kZW50IHJ1bGVzXG4gKiAgIGEuIGNoZWNrIHdoZXRoZXIgdGhlIGxpbmUgYWJvdmUgaXQgbWF0Y2hlcyBpbmRlbnROZXh0TGluZVBhdHRlcm5cbiAqICAgYi4gSWYgbm90LCB0aGUgaW5kZW50IGxldmVsIG9mIHRoaXMgbGluZSBpcyB0aGUgcmVzdWx0XG4gKiAgIGMuIElmIHNvLCBpdCBtZWFucyB0aGUgaW5kZW50IG9mIHRoaXMgbGluZSBpcyAqdGVtcG9yYXJ5KiwgZ28gdXB3YXJkIHV0aWxsIHdlIGZpbmQgYSBsaW5lIHdob3NlIGluZGVudCBpcyBub3QgdGVtcG9yYXJ5ICh0aGUgc2FtZSB3b3JrZmxvdyBhIC0+IGIgLT4gYykuXG4gKiA0LiBPdGhlcndpc2UsIHdlIGZhaWwgdG8gZ2V0IGFuIGluaGVyaXRlZCBpbmRlbnQgZnJvbSBhYm92ZXMuIFJldHVybiBudWxsIGFuZCB3ZSBzaG91bGQgbm90IHRvdWNoIHRoZSBpbmRlbnQgb2YgYGxpbmVOdW1iZXJgXG4gKlxuICogVGhpcyBmdW5jdGlvbiBvbmx5IHJldHVybiB0aGUgaW5oZXJpdGVkIGluZGVudCBiYXNlZCBvbiBhYm92ZSBsaW5lcywgaXQgZG9lc24ndCBjaGVjayB3aGV0aGVyIGN1cnJlbnQgbGluZSBzaG91bGQgZGVjcmVhc2Ugb3Igbm90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5oZXJpdEluZGVudEZvckxpbmUoXG5cdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSxcblx0bW9kZWw6IElWaXJ0dWFsTW9kZWwsXG5cdGxpbmVOdW1iZXI6IG51bWJlcixcblx0aG9ub3JJbnRlbnRpYWxJbmRlbnQ6IGJvb2xlYW4gPSB0cnVlLFxuXHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuKTogeyBpbmRlbnRhdGlvbjogc3RyaW5nOyBhY3Rpb246IEluZGVudEFjdGlvbiB8IG51bGw7IGxpbmU/OiBudW1iZXIgfSB8IG51bGwge1xuXHRpZiAoYXV0b0luZGVudCA8IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsKSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBpbmRlbnRSdWxlc1N1cHBvcnQgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihtb2RlbC50b2tlbml6YXRpb24uZ2V0TGFuZ3VhZ2VJZCgpKS5pbmRlbnRSdWxlc1N1cHBvcnQ7XG5cdGlmICghaW5kZW50UnVsZXNTdXBwb3J0KSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblx0Y29uc3QgcHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0ID0gbmV3IFByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydChtb2RlbCwgaW5kZW50UnVsZXNTdXBwb3J0LCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRpZiAobGluZU51bWJlciA8PSAxKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluZGVudGF0aW9uOiAnJyxcblx0XHRcdGFjdGlvbjogbnVsbFxuXHRcdH07XG5cdH1cblxuXHQvLyBVc2Ugbm8gaW5kZW50IGlmIHRoaXMgaXMgdGhlIGZpcnN0IG5vbi1ibGFuayBsaW5lXG5cdGZvciAobGV0IHByaW9yTGluZU51bWJlciA9IGxpbmVOdW1iZXIgLSAxOyBwcmlvckxpbmVOdW1iZXIgPiAwOyBwcmlvckxpbmVOdW1iZXItLSkge1xuXHRcdGlmIChtb2RlbC5nZXRMaW5lQ29udGVudChwcmlvckxpbmVOdW1iZXIpICE9PSAnJykge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGlmIChwcmlvckxpbmVOdW1iZXIgPT09IDEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluZGVudGF0aW9uOiAnJyxcblx0XHRcdFx0YWN0aW9uOiBudWxsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHByZWNlZGluZ1VuSWdub3JlZExpbmUgPSBnZXRQcmVjZWRpbmdWYWxpZExpbmUobW9kZWwsIGxpbmVOdW1iZXIsIHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydCk7XG5cdGlmIChwcmVjZWRpbmdVbklnbm9yZWRMaW5lIDwgMCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9IGVsc2UgaWYgKHByZWNlZGluZ1VuSWdub3JlZExpbmUgPCAxKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluZGVudGF0aW9uOiAnJyxcblx0XHRcdGFjdGlvbjogbnVsbFxuXHRcdH07XG5cdH1cblxuXHRpZiAocHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZEluY3JlYXNlKHByZWNlZGluZ1VuSWdub3JlZExpbmUpIHx8IHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGRJbmRlbnROZXh0TGluZShwcmVjZWRpbmdVbklnbm9yZWRMaW5lKSkge1xuXHRcdGNvbnN0IHByZWNlZGluZ1VuSWdub3JlZExpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocHJlY2VkaW5nVW5JZ25vcmVkTGluZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluZGVudGF0aW9uOiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKHByZWNlZGluZ1VuSWdub3JlZExpbmVDb250ZW50KSxcblx0XHRcdGFjdGlvbjogSW5kZW50QWN0aW9uLkluZGVudCxcblx0XHRcdGxpbmU6IHByZWNlZGluZ1VuSWdub3JlZExpbmVcblx0XHR9O1xuXHR9IGVsc2UgaWYgKHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGREZWNyZWFzZShwcmVjZWRpbmdVbklnbm9yZWRMaW5lKSkge1xuXHRcdGNvbnN0IHByZWNlZGluZ1VuSWdub3JlZExpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocHJlY2VkaW5nVW5JZ25vcmVkTGluZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluZGVudGF0aW9uOiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKHByZWNlZGluZ1VuSWdub3JlZExpbmVDb250ZW50KSxcblx0XHRcdGFjdGlvbjogbnVsbCxcblx0XHRcdGxpbmU6IHByZWNlZGluZ1VuSWdub3JlZExpbmVcblx0XHR9O1xuXHR9IGVsc2Uge1xuXHRcdC8vIHByZWNlZGluZ1VuSWdub3JlZExpbmUgY2FuIG5vdCBiZSBpZ25vcmVkLlxuXHRcdC8vIGl0IGRvZXNuJ3QgaW5jcmVhc2UgaW5kZW50IG9mIGZvbGxvd2luZyBsaW5lc1xuXHRcdC8vIGl0IGRvZXNuJ3QgaW5jcmVhc2UganVzdCBuZXh0IGxpbmVcblx0XHQvLyBzbyBjdXJyZW50IGxpbmUgaXMgbm90IGFmZmVjdCBieSBwcmVjZWRpbmdVbklnbm9yZWRMaW5lXG5cdFx0Ly8gYW5kIHRoZW4gd2Ugc2hvdWxkIGdldCBhIGNvcnJlY3QgaW5oZXJpdHRlZCBpbmRlbnRhdGlvbiBmcm9tIGFib3ZlIGxpbmVzXG5cdFx0aWYgKHByZWNlZGluZ1VuSWdub3JlZExpbmUgPT09IDEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluZGVudGF0aW9uOiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KHByZWNlZGluZ1VuSWdub3JlZExpbmUpKSxcblx0XHRcdFx0YWN0aW9uOiBudWxsLFxuXHRcdFx0XHRsaW5lOiBwcmVjZWRpbmdVbklnbm9yZWRMaW5lXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzTGluZSA9IHByZWNlZGluZ1VuSWdub3JlZExpbmUgLSAxO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNMaW5lSW5kZW50TWV0YWRhdGEgPSBpbmRlbnRSdWxlc1N1cHBvcnQuZ2V0SW5kZW50TWV0YWRhdGEobW9kZWwuZ2V0TGluZUNvbnRlbnQocHJldmlvdXNMaW5lKSk7XG5cdFx0aWYgKCEocHJldmlvdXNMaW5lSW5kZW50TWV0YWRhdGEgJiAoSW5kZW50Q29uc3RzLklOQ1JFQVNFX01BU0sgfCBJbmRlbnRDb25zdHMuREVDUkVBU0VfTUFTSykpICYmXG5cdFx0XHQocHJldmlvdXNMaW5lSW5kZW50TWV0YWRhdGEgJiBJbmRlbnRDb25zdHMuSU5ERU5UX05FWFRMSU5FX01BU0spKSB7XG5cdFx0XHRsZXQgc3RvcExpbmUgPSAwO1xuXHRcdFx0Zm9yIChsZXQgaSA9IHByZXZpb3VzTGluZSAtIDE7IGkgPiAwOyBpLS0pIHtcblx0XHRcdFx0aWYgKHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGRJbmRlbnROZXh0TGluZShpKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0b3BMaW5lID0gaTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluZGVudGF0aW9uOiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KHN0b3BMaW5lICsgMSkpLFxuXHRcdFx0XHRhY3Rpb246IG51bGwsXG5cdFx0XHRcdGxpbmU6IHN0b3BMaW5lICsgMVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoaG9ub3JJbnRlbnRpYWxJbmRlbnQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGluZGVudGF0aW9uOiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KHByZWNlZGluZ1VuSWdub3JlZExpbmUpKSxcblx0XHRcdFx0YWN0aW9uOiBudWxsLFxuXHRcdFx0XHRsaW5lOiBwcmVjZWRpbmdVbklnbm9yZWRMaW5lXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBzZWFyY2ggZnJvbSBwcmVjZWRpbmdVbklnbm9yZWRMaW5lIHVudGlsIHdlIGZpbmQgb25lIHdob3NlIGluZGVudCBpcyBub3QgdGVtcG9yYXJ5XG5cdFx0XHRmb3IgKGxldCBpID0gcHJlY2VkaW5nVW5JZ25vcmVkTGluZTsgaSA+IDA7IGktLSkge1xuXHRcdFx0XHRpZiAocHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZEluY3JlYXNlKGkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGluZGVudGF0aW9uOiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KGkpKSxcblx0XHRcdFx0XHRcdGFjdGlvbjogSW5kZW50QWN0aW9uLkluZGVudCxcblx0XHRcdFx0XHRcdGxpbmU6IGlcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByb2Nlc3NlZEluZGVudFJ1bGVzU3VwcG9ydC5zaG91bGRJbmRlbnROZXh0TGluZShpKSkge1xuXHRcdFx0XHRcdGxldCBzdG9wTGluZSA9IDA7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaiA9IGkgLSAxOyBqID4gMDsgai0tKSB7XG5cdFx0XHRcdFx0XHRpZiAocHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0LnNob3VsZEluZGVudE5leHRMaW5lKGkpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3RvcExpbmUgPSBqO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGluZGVudGF0aW9uOiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKG1vZGVsLmdldExpbmVDb250ZW50KHN0b3BMaW5lICsgMSkpLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiBudWxsLFxuXHRcdFx0XHRcdFx0bGluZTogc3RvcExpbmUgKyAxXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIGlmIChwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkRGVjcmVhc2UoaSkpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQoaSkpLFxuXHRcdFx0XHRcdFx0YWN0aW9uOiBudWxsLFxuXHRcdFx0XHRcdFx0bGluZTogaVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW5kZW50YXRpb246IHN0cmluZ3MuZ2V0TGVhZGluZ1doaXRlc3BhY2UobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSkpLFxuXHRcdFx0XHRhY3Rpb246IG51bGwsXG5cdFx0XHRcdGxpbmU6IDFcblx0XHRcdH07XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHb29kSW5kZW50Rm9yTGluZShcblx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LFxuXHR2aXJ0dWFsTW9kZWw6IElWaXJ0dWFsTW9kZWwsXG5cdGxhbmd1YWdlSWQ6IHN0cmluZyxcblx0bGluZU51bWJlcjogbnVtYmVyLFxuXHRpbmRlbnRDb252ZXJ0ZXI6IElJbmRlbnRDb252ZXJ0ZXIsXG5cdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG4pOiBzdHJpbmcgfCBudWxsIHtcblx0aWYgKGF1dG9JbmRlbnQgPCBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgcmljaEVkaXRTdXBwb3J0ID0gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCk7XG5cdGlmICghcmljaEVkaXRTdXBwb3J0KSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBpbmRlbnRSdWxlc1N1cHBvcnQgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5pbmRlbnRSdWxlc1N1cHBvcnQ7XG5cdGlmICghaW5kZW50UnVsZXNTdXBwb3J0KSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQgPSBuZXcgUHJvY2Vzc2VkSW5kZW50UnVsZXNTdXBwb3J0KHZpcnR1YWxNb2RlbCwgaW5kZW50UnVsZXNTdXBwb3J0LCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgaW5kZW50ID0gZ2V0SW5oZXJpdEluZGVudEZvckxpbmUoYXV0b0luZGVudCwgdmlydHVhbE1vZGVsLCBsaW5lTnVtYmVyLCB1bmRlZmluZWQsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGlmIChpbmRlbnQpIHtcblx0XHRjb25zdCBpbmhlcml0TGluZSA9IGluZGVudC5saW5lO1xuXHRcdGlmIChpbmhlcml0TGluZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBBcHBseSBlbnRlciBhY3Rpb24gYXMgbG9uZyBhcyB0aGVyZSBhcmUgb25seSB3aGl0ZXNwYWNlIGxpbmVzIGJldHdlZW4gaW5oZXJpdGVkIGxpbmUgYW5kIHRoaXMgbGluZS5cblx0XHRcdGxldCBzaG91bGRBcHBseUVudGVyUnVsZXMgPSB0cnVlO1xuXHRcdFx0Zm9yIChsZXQgaW5CZXR3ZWVuTGluZSA9IGluaGVyaXRMaW5lOyBpbkJldHdlZW5MaW5lIDwgbGluZU51bWJlciAtIDE7IGluQmV0d2VlbkxpbmUrKykge1xuXHRcdFx0XHRpZiAoIS9eXFxzKiQvLnRlc3QodmlydHVhbE1vZGVsLmdldExpbmVDb250ZW50KGluQmV0d2VlbkxpbmUpKSkge1xuXHRcdFx0XHRcdHNob3VsZEFwcGx5RW50ZXJSdWxlcyA9IGZhbHNlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2hvdWxkQXBwbHlFbnRlclJ1bGVzKSB7XG5cdFx0XHRcdGNvbnN0IGVudGVyUmVzdWx0ID0gcmljaEVkaXRTdXBwb3J0Lm9uRW50ZXIoYXV0b0luZGVudCwgJycsIHZpcnR1YWxNb2RlbC5nZXRMaW5lQ29udGVudChpbmhlcml0TGluZSksICcnKTtcblxuXHRcdFx0XHRpZiAoZW50ZXJSZXN1bHQpIHtcblx0XHRcdFx0XHRsZXQgaW5kZW50YXRpb24gPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKHZpcnR1YWxNb2RlbC5nZXRMaW5lQ29udGVudChpbmhlcml0TGluZSkpO1xuXG5cdFx0XHRcdFx0aWYgKGVudGVyUmVzdWx0LnJlbW92ZVRleHQpIHtcblx0XHRcdFx0XHRcdGluZGVudGF0aW9uID0gaW5kZW50YXRpb24uc3Vic3RyaW5nKDAsIGluZGVudGF0aW9uLmxlbmd0aCAtIGVudGVyUmVzdWx0LnJlbW92ZVRleHQpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdChlbnRlclJlc3VsdC5pbmRlbnRBY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnQpIHx8XG5cdFx0XHRcdFx0XHQoZW50ZXJSZXN1bHQuaW5kZW50QWN0aW9uID09PSBJbmRlbnRBY3Rpb24uSW5kZW50T3V0ZGVudClcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdGluZGVudGF0aW9uID0gaW5kZW50Q29udmVydGVyLnNoaWZ0SW5kZW50KGluZGVudGF0aW9uKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGVudGVyUmVzdWx0LmluZGVudEFjdGlvbiA9PT0gSW5kZW50QWN0aW9uLk91dGRlbnQpIHtcblx0XHRcdFx0XHRcdGluZGVudGF0aW9uID0gaW5kZW50Q29udmVydGVyLnVuc2hpZnRJbmRlbnQoaW5kZW50YXRpb24pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkRGVjcmVhc2UobGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRcdGluZGVudGF0aW9uID0gaW5kZW50Q29udmVydGVyLnVuc2hpZnRJbmRlbnQoaW5kZW50YXRpb24pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChlbnRlclJlc3VsdC5hcHBlbmRUZXh0KSB7XG5cdFx0XHRcdFx0XHRpbmRlbnRhdGlvbiArPSBlbnRlclJlc3VsdC5hcHBlbmRUZXh0O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGluZGVudGF0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwcm9jZXNzZWRJbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkRGVjcmVhc2UobGluZU51bWJlcikpIHtcblx0XHRcdGlmIChpbmRlbnQuYWN0aW9uID09PSBJbmRlbnRBY3Rpb24uSW5kZW50KSB7XG5cdFx0XHRcdHJldHVybiBpbmRlbnQuaW5kZW50YXRpb247XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gaW5kZW50Q29udmVydGVyLnVuc2hpZnRJbmRlbnQoaW5kZW50LmluZGVudGF0aW9uKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKGluZGVudC5hY3Rpb24gPT09IEluZGVudEFjdGlvbi5JbmRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIGluZGVudENvbnZlcnRlci5zaGlmdEluZGVudChpbmRlbnQuaW5kZW50YXRpb24pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGluZGVudC5pbmRlbnRhdGlvbjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbmRlbnRGb3JFbnRlcihcblx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LFxuXHRtb2RlbDogSVRleHRNb2RlbCxcblx0cmFuZ2U6IFJhbmdlLFxuXHRpbmRlbnRDb252ZXJ0ZXI6IElJbmRlbnRDb252ZXJ0ZXIsXG5cdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG4pOiB7IGJlZm9yZUVudGVyOiBzdHJpbmc7IGFmdGVyRW50ZXI6IHN0cmluZyB9IHwgbnVsbCB7XG5cdGlmIChhdXRvSW5kZW50IDwgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRjb25zdCBsYW5ndWFnZUlkID0gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbik7XG5cdGNvbnN0IGluZGVudFJ1bGVzU3VwcG9ydCA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlSWQpLmluZGVudFJ1bGVzU3VwcG9ydDtcblx0aWYgKCFpbmRlbnRSdWxlc1N1cHBvcnQpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRjb25zdCBpbmRlbnRhdGlvbkNvbnRleHRQcm9jZXNzb3IgPSBuZXcgSW5kZW50YXRpb25Db250ZXh0UHJvY2Vzc29yKG1vZGVsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgcHJvY2Vzc2VkQ29udGV4dFRva2VucyA9IGluZGVudGF0aW9uQ29udGV4dFByb2Nlc3Nvci5nZXRQcm9jZXNzZWRUb2tlbkNvbnRleHRBcm91bmRSYW5nZShyYW5nZSk7XG5cdGNvbnN0IGFmdGVyRW50ZXJQcm9jZXNzZWRUb2tlbnMgPSBwcm9jZXNzZWRDb250ZXh0VG9rZW5zLmFmdGVyUmFuZ2VQcm9jZXNzZWRUb2tlbnM7XG5cdGNvbnN0IGJlZm9yZUVudGVyUHJvY2Vzc2VkVG9rZW5zID0gcHJvY2Vzc2VkQ29udGV4dFRva2Vucy5iZWZvcmVSYW5nZVByb2Nlc3NlZFRva2Vucztcblx0Y29uc3QgYmVmb3JlRW50ZXJJbmRlbnQgPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGJlZm9yZUVudGVyUHJvY2Vzc2VkVG9rZW5zLmdldExpbmVDb250ZW50KCkpO1xuXG5cdGNvbnN0IHZpcnR1YWxNb2RlbCA9IGNyZWF0ZVZpcnR1YWxNb2RlbFdpdGhNb2RpZmllZFRva2Vuc0F0TGluZShtb2RlbCwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBiZWZvcmVFbnRlclByb2Nlc3NlZFRva2Vucyk7XG5cdGNvbnN0IGxhbmd1YWdlSXNEaWZmZXJlbnRGcm9tTGluZVN0YXJ0ID0gaXNMYW5ndWFnZURpZmZlcmVudEZyb21MaW5lU3RhcnQobW9kZWwsIHJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSk7XG5cdGNvbnN0IGN1cnJlbnRMaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0Y29uc3QgY3VycmVudExpbmVJbmRlbnQgPSBzdHJpbmdzLmdldExlYWRpbmdXaGl0ZXNwYWNlKGN1cnJlbnRMaW5lKTtcblx0Y29uc3QgYWZ0ZXJFbnRlckFjdGlvbiA9IGdldEluaGVyaXRJbmRlbnRGb3JMaW5lKGF1dG9JbmRlbnQsIHZpcnR1YWxNb2RlbCwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgMSwgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0aWYgKCFhZnRlckVudGVyQWN0aW9uKSB7XG5cdFx0Y29uc3QgYmVmb3JlRW50ZXIgPSBsYW5ndWFnZUlzRGlmZmVyZW50RnJvbUxpbmVTdGFydCA/IGN1cnJlbnRMaW5lSW5kZW50IDogYmVmb3JlRW50ZXJJbmRlbnQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJlZm9yZUVudGVyOiBiZWZvcmVFbnRlcixcblx0XHRcdGFmdGVyRW50ZXI6IGJlZm9yZUVudGVyXG5cdFx0fTtcblx0fVxuXG5cdGxldCBhZnRlckVudGVySW5kZW50ID0gbGFuZ3VhZ2VJc0RpZmZlcmVudEZyb21MaW5lU3RhcnQgPyBjdXJyZW50TGluZUluZGVudCA6IGFmdGVyRW50ZXJBY3Rpb24uaW5kZW50YXRpb247XG5cblx0aWYgKGFmdGVyRW50ZXJBY3Rpb24uYWN0aW9uID09PSBJbmRlbnRBY3Rpb24uSW5kZW50KSB7XG5cdFx0YWZ0ZXJFbnRlckluZGVudCA9IGluZGVudENvbnZlcnRlci5zaGlmdEluZGVudChhZnRlckVudGVySW5kZW50KTtcblx0fVxuXG5cdGlmIChpbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkRGVjcmVhc2UoYWZ0ZXJFbnRlclByb2Nlc3NlZFRva2Vucy5nZXRMaW5lQ29udGVudCgpKSkge1xuXHRcdGFmdGVyRW50ZXJJbmRlbnQgPSBpbmRlbnRDb252ZXJ0ZXIudW5zaGlmdEluZGVudChhZnRlckVudGVySW5kZW50KTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0YmVmb3JlRW50ZXI6IGxhbmd1YWdlSXNEaWZmZXJlbnRGcm9tTGluZVN0YXJ0ID8gY3VycmVudExpbmVJbmRlbnQgOiBiZWZvcmVFbnRlckluZGVudCxcblx0XHRhZnRlckVudGVyOiBhZnRlckVudGVySW5kZW50XG5cdH07XG59XG5cbi8qKlxuICogV2Ugc2hvdWxkIGFsd2F5cyBhbGxvdyBpbnRlbnRpb25hbCBpbmRlbnRhdGlvbi4gSXQgbWVhbnMsIGlmIHVzZXJzIGNoYW5nZSB0aGUgaW5kZW50YXRpb24gb2YgYGxpbmVOdW1iZXJgIGFuZCB0aGUgY29udGVudCBvZlxuICogdGhpcyBsaW5lIGRvZXNuJ3QgbWF0Y2ggZGVjcmVhc2VJbmRlbnRQYXR0ZXJuLCB3ZSBzaG91bGQgbm90IGFkanVzdCB0aGUgaW5kZW50YXRpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbmRlbnRBY3Rpb25Gb3JUeXBlKFxuXHRjdXJzb3JDb25maWc6IEN1cnNvckNvbmZpZ3VyYXRpb24sXG5cdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRyYW5nZTogUmFuZ2UsXG5cdGNoOiBzdHJpbmcsXG5cdGluZGVudENvbnZlcnRlcjogSUluZGVudENvbnZlcnRlcixcblx0bGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcbik6IHN0cmluZyB8IG51bGwge1xuXHRjb25zdCBhdXRvSW5kZW50ID0gY3Vyc29yQ29uZmlnLmF1dG9JbmRlbnQ7XG5cdGlmIChhdXRvSW5kZW50IDwgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRjb25zdCBsYW5ndWFnZUlzRGlmZmVyZW50RnJvbUxpbmVTdGFydCA9IGlzTGFuZ3VhZ2VEaWZmZXJlbnRGcm9tTGluZVN0YXJ0KG1vZGVsLCByYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRpZiAobGFuZ3VhZ2VJc0RpZmZlcmVudEZyb21MaW5lU3RhcnQpIHtcblx0XHQvLyB0aGlzIGxpbmUgaGFzIG1peGVkIGxhbmd1YWdlcyBhbmQgaW5kZW50YXRpb24gcnVsZXMgd2lsbCBub3Qgd29ya1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgbGFuZ3VhZ2VJZCA9IG1vZGVsLmdldExhbmd1YWdlSWRBdFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHRjb25zdCBpbmRlbnRSdWxlc1N1cHBvcnQgPSBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUlkKS5pbmRlbnRSdWxlc1N1cHBvcnQ7XG5cdGlmICghaW5kZW50UnVsZXNTdXBwb3J0KSB7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjb25zdCBpbmRlbnRhdGlvbkNvbnRleHRQcm9jZXNzb3IgPSBuZXcgSW5kZW50YXRpb25Db250ZXh0UHJvY2Vzc29yKG1vZGVsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgcHJvY2Vzc2VkQ29udGV4dFRva2VucyA9IGluZGVudGF0aW9uQ29udGV4dFByb2Nlc3Nvci5nZXRQcm9jZXNzZWRUb2tlbkNvbnRleHRBcm91bmRSYW5nZShyYW5nZSk7XG5cdGNvbnN0IGJlZm9yZVJhbmdlVGV4dCA9IHByb2Nlc3NlZENvbnRleHRUb2tlbnMuYmVmb3JlUmFuZ2VQcm9jZXNzZWRUb2tlbnMuZ2V0TGluZUNvbnRlbnQoKTtcblx0Y29uc3QgYWZ0ZXJSYW5nZVRleHQgPSBwcm9jZXNzZWRDb250ZXh0VG9rZW5zLmFmdGVyUmFuZ2VQcm9jZXNzZWRUb2tlbnMuZ2V0TGluZUNvbnRlbnQoKTtcblx0Y29uc3QgdGV4dEFyb3VuZFJhbmdlID0gYmVmb3JlUmFuZ2VUZXh0ICsgYWZ0ZXJSYW5nZVRleHQ7XG5cdGNvbnN0IHRleHRBcm91bmRSYW5nZVdpdGhDaGFyYWN0ZXIgPSBiZWZvcmVSYW5nZVRleHQgKyBjaCArIGFmdGVyUmFuZ2VUZXh0O1xuXG5cdC8vIElmIHByZXZpb3VzIGNvbnRlbnQgYWxyZWFkeSBtYXRjaGVzIGRlY3JlYXNlSW5kZW50UGF0dGVybiwgaXQgbWVhbnMgaW5kZW50YXRpb24gb2YgdGhpcyBsaW5lIHNob3VsZCBhbHJlYWR5IGJlIGFkanVzdGVkXG5cdC8vIFVzZXJzIG1pZ2h0IGNoYW5nZSB0aGUgaW5kZW50YXRpb24gYnkgcHVycG9zZSBhbmQgd2Ugc2hvdWxkIGhvbm9yIHRoYXQgaW5zdGVhZCBvZiByZWFkanVzdGluZy5cblx0aWYgKCFpbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkRGVjcmVhc2UodGV4dEFyb3VuZFJhbmdlKSAmJiBpbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkRGVjcmVhc2UodGV4dEFyb3VuZFJhbmdlV2l0aENoYXJhY3RlcikpIHtcblx0XHQvLyBhZnRlciB0eXBpbmcgYGNoYCwgdGhlIGNvbnRlbnQgbWF0Y2hlcyBkZWNyZWFzZUluZGVudFBhdHRlcm4sIHdlIHNob3VsZCBhZGp1c3QgdGhlIGluZGVudCB0byBhIGdvb2QgbWFubmVyLlxuXHRcdC8vIDEuIEdldCBpbmhlcml0ZWQgaW5kZW50IGFjdGlvblxuXHRcdGNvbnN0IHIgPSBnZXRJbmhlcml0SW5kZW50Rm9yTGluZShhdXRvSW5kZW50LCBtb2RlbCwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBmYWxzZSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0aWYgKCFyKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRsZXQgaW5kZW50YXRpb24gPSByLmluZGVudGF0aW9uO1xuXHRcdGlmIChyLmFjdGlvbiAhPT0gSW5kZW50QWN0aW9uLkluZGVudCkge1xuXHRcdFx0aW5kZW50YXRpb24gPSBpbmRlbnRDb252ZXJ0ZXIudW5zaGlmdEluZGVudChpbmRlbnRhdGlvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluZGVudGF0aW9uO1xuXHR9XG5cblx0Y29uc3QgcHJldmlvdXNMaW5lTnVtYmVyID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMTtcblx0aWYgKHByZXZpb3VzTGluZU51bWJlciA+IDApIHtcblx0XHRjb25zdCBwcmV2aW91c0xpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwcmV2aW91c0xpbmVOdW1iZXIpO1xuXHRcdGlmIChpbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkSW5kZW50TmV4dExpbmUocHJldmlvdXNMaW5lKSAmJiBpbmRlbnRSdWxlc1N1cHBvcnQuc2hvdWxkSW5jcmVhc2UodGV4dEFyb3VuZFJhbmdlV2l0aENoYXJhY3RlcikpIHtcblx0XHRcdGNvbnN0IGluaGVyaXRlZEluZGVudGF0aW9uRGF0YSA9IGdldEluaGVyaXRJbmRlbnRGb3JMaW5lKGF1dG9JbmRlbnQsIG1vZGVsLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIGZhbHNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGluaGVyaXRlZEluZGVudGF0aW9uID0gaW5oZXJpdGVkSW5kZW50YXRpb25EYXRhPy5pbmRlbnRhdGlvbjtcblx0XHRcdGlmIChpbmhlcml0ZWRJbmRlbnRhdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRMaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3QgYWN0dWFsQ3VycmVudEluZGVudGF0aW9uID0gc3RyaW5ncy5nZXRMZWFkaW5nV2hpdGVzcGFjZShjdXJyZW50TGluZSk7XG5cdFx0XHRcdGNvbnN0IGluZmVycmVkQ3VycmVudEluZGVudGF0aW9uID0gaW5kZW50Q29udmVydGVyLnNoaWZ0SW5kZW50KGluaGVyaXRlZEluZGVudGF0aW9uKTtcblx0XHRcdFx0Ly8gSWYgdGhlIGluZmVycmVkIGN1cnJlbnQgaW5kZW50YXRpb24gaXMgbm90IGVxdWFsIHRvIHRoZSBhY3R1YWwgY3VycmVudCBpbmRlbnRhdGlvbiwgdGhlbiB0aGUgaW5kZW50YXRpb24gaGFzIGJlZW4gaW50ZW50aW9uYWxseSBjaGFuZ2VkLCBpbiB0aGF0IGNhc2Uga2VlcCBpdFxuXHRcdFx0XHRjb25zdCBpbmZlcnJlZEluZGVudGF0aW9uRXF1YWxzQWN0dWFsID0gaW5mZXJyZWRDdXJyZW50SW5kZW50YXRpb24gPT09IGFjdHVhbEN1cnJlbnRJbmRlbnRhdGlvbjtcblx0XHRcdFx0Y29uc3QgdGV4dEFyb3VuZFJhbmdlQ29udGFpbnNPbmx5V2hpdGVzcGFjZSA9IC9eXFxzKiQvLnRlc3QodGV4dEFyb3VuZFJhbmdlKTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NpbmdQYWlycyA9IGN1cnNvckNvbmZpZy5hdXRvQ2xvc2luZ1BhaXJzLmF1dG9DbG9zaW5nUGFpcnNPcGVuQnlFbmQuZ2V0KGNoKTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NpbmdQYWlyRXhpc3RzID0gYXV0b0Nsb3NpbmdQYWlycyAmJiBhdXRvQ2xvc2luZ1BhaXJzLmxlbmd0aCA+IDA7XG5cdFx0XHRcdGNvbnN0IGlzQ2hGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXJBbmRJbkF1dG9DbG9zaW5nUGFpciA9IGF1dG9DbG9zaW5nUGFpckV4aXN0cyAmJiB0ZXh0QXJvdW5kUmFuZ2VDb250YWluc09ubHlXaGl0ZXNwYWNlO1xuXHRcdFx0XHRpZiAoaW5mZXJyZWRJbmRlbnRhdGlvbkVxdWFsc0FjdHVhbCAmJiBpc0NoRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyQW5kSW5BdXRvQ2xvc2luZ1BhaXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gaW5oZXJpdGVkSW5kZW50YXRpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEluZGVudE1ldGFkYXRhKFxuXHRtb2RlbDogSVRleHRNb2RlbCxcblx0bGluZU51bWJlcjogbnVtYmVyLFxuXHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZVxuKTogbnVtYmVyIHwgbnVsbCB7XG5cdGNvbnN0IGluZGVudFJ1bGVzU3VwcG9ydCA9IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKG1vZGVsLmdldExhbmd1YWdlSWQoKSkuaW5kZW50UnVsZXNTdXBwb3J0O1xuXHRpZiAoIWluZGVudFJ1bGVzU3VwcG9ydCkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cdGlmIChsaW5lTnVtYmVyIDwgMSB8fCBsaW5lTnVtYmVyID4gbW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXHRyZXR1cm4gaW5kZW50UnVsZXNTdXBwb3J0LmdldEluZGVudE1ldGFkYXRhKG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVmlydHVhbE1vZGVsV2l0aE1vZGlmaWVkVG9rZW5zQXRMaW5lKG1vZGVsOiBJVGV4dE1vZGVsLCBtb2RpZmllZExpbmVOdW1iZXI6IG51bWJlciwgbW9kaWZpZWRUb2tlbnM6IElWaWV3TGluZVRva2Vucyk6IElWaXJ0dWFsTW9kZWwge1xuXHRjb25zdCB2aXJ0dWFsTW9kZWw6IElWaXJ0dWFsTW9kZWwgPSB7XG5cdFx0dG9rZW5pemF0aW9uOiB7XG5cdFx0XHRnZXRMaW5lVG9rZW5zOiAobGluZU51bWJlcjogbnVtYmVyKTogSVZpZXdMaW5lVG9rZW5zID0+IHtcblx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IG1vZGlmaWVkTGluZU51bWJlcikge1xuXHRcdFx0XHRcdHJldHVybiBtb2RpZmllZFRva2Vucztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gbW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMobGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRnZXRMYW5ndWFnZUlkOiAoKTogc3RyaW5nID0+IHtcblx0XHRcdFx0cmV0dXJuIG1vZGVsLmdldExhbmd1YWdlSWQoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRMYW5ndWFnZUlkQXRQb3NpdGlvbjogKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBzdHJpbmcgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZEF0UG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRnZXRMaW5lQ29udGVudDogKGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyA9PiB7XG5cdFx0XHRpZiAobGluZU51bWJlciA9PT0gbW9kaWZpZWRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdHJldHVybiBtb2RpZmllZFRva2Vucy5nZXRMaW5lQ29udGVudCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblx0cmV0dXJuIHZpcnR1YWxNb2RlbDtcbn1cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxhQUFhO0FBR3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0NBQWdDO0FBR3pDLFNBQVMsNkJBQTZCLGtDQUFrQyxtQ0FBbUM7QUEwQjNHLFNBQVMsc0JBQXNCLE9BQXNCLFlBQW9CLDZCQUEwRDtBQUNsSSxRQUFNLGFBQWEsTUFBTSxhQUFhLHdCQUF3QixZQUFZLENBQUM7QUFDM0UsTUFBSSxhQUFhLEdBQUc7QUFDbkIsUUFBSTtBQUNKLFFBQUksbUJBQW1CO0FBRXZCLFNBQUssaUJBQWlCLGFBQWEsR0FBRyxrQkFBa0IsR0FBRyxrQkFBa0I7QUFDNUUsVUFBSSxNQUFNLGFBQWEsd0JBQXdCLGdCQUFnQixDQUFDLE1BQU0sWUFBWTtBQUNqRixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sT0FBTyxNQUFNLGVBQWUsY0FBYztBQUNoRCxVQUFJLDRCQUE0QixhQUFhLGNBQWMsS0FBSyxRQUFRLEtBQUssSUFBSSxLQUFLLFNBQVMsSUFBSTtBQUNsRywyQkFBbUI7QUFDbkI7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSO0FBY08sU0FBUyx3QkFDZixZQUNBLE9BQ0EsWUFDQSx1QkFBZ0MsTUFDaEMsOEJBQzZFO0FBQzdFLE1BQUksYUFBYSx5QkFBeUIsTUFBTTtBQUMvQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0scUJBQXFCLDZCQUE2Qix5QkFBeUIsTUFBTSxhQUFhLGNBQWMsQ0FBQyxFQUFFO0FBQ3JILE1BQUksQ0FBQyxvQkFBb0I7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLDhCQUE4QixJQUFJLDRCQUE0QixPQUFPLG9CQUFvQiw0QkFBNEI7QUFFM0gsTUFBSSxjQUFjLEdBQUc7QUFDcEIsV0FBTztBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsUUFBUTtBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBR0EsV0FBUyxrQkFBa0IsYUFBYSxHQUFHLGtCQUFrQixHQUFHLG1CQUFtQjtBQUNsRixRQUFJLE1BQU0sZUFBZSxlQUFlLE1BQU0sSUFBSTtBQUNqRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLG9CQUFvQixHQUFHO0FBQzFCLGFBQU87QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLFFBQVE7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxRQUFNLHlCQUF5QixzQkFBc0IsT0FBTyxZQUFZLDJCQUEyQjtBQUNuRyxNQUFJLHlCQUF5QixHQUFHO0FBQy9CLFdBQU87QUFBQSxFQUNSLFdBQVcseUJBQXlCLEdBQUc7QUFDdEMsV0FBTztBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsUUFBUTtBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBRUEsTUFBSSw0QkFBNEIsZUFBZSxzQkFBc0IsS0FBSyw0QkFBNEIscUJBQXFCLHNCQUFzQixHQUFHO0FBQ25KLFVBQU0sZ0NBQWdDLE1BQU0sZUFBZSxzQkFBc0I7QUFDakYsV0FBTztBQUFBLE1BQ04sYUFBYSxRQUFRLHFCQUFxQiw2QkFBNkI7QUFBQSxNQUN2RSxRQUFRLGFBQWE7QUFBQSxNQUNyQixNQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0QsV0FBVyw0QkFBNEIsZUFBZSxzQkFBc0IsR0FBRztBQUM5RSxVQUFNLGdDQUFnQyxNQUFNLGVBQWUsc0JBQXNCO0FBQ2pGLFdBQU87QUFBQSxNQUNOLGFBQWEsUUFBUSxxQkFBcUIsNkJBQTZCO0FBQUEsTUFDdkUsUUFBUTtBQUFBLE1BQ1IsTUFBTTtBQUFBLElBQ1A7QUFBQSxFQUNELE9BQU87QUFNTixRQUFJLDJCQUEyQixHQUFHO0FBQ2pDLGFBQU87QUFBQSxRQUNOLGFBQWEsUUFBUSxxQkFBcUIsTUFBTSxlQUFlLHNCQUFzQixDQUFDO0FBQUEsUUFDdEYsUUFBUTtBQUFBLFFBQ1IsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLHlCQUF5QjtBQUU5QyxVQUFNLDZCQUE2QixtQkFBbUIsa0JBQWtCLE1BQU0sZUFBZSxZQUFZLENBQUM7QUFDMUcsUUFBSSxFQUFFLDhCQUE4QixhQUFhLGdCQUFnQixhQUFhLG1CQUM1RSw2QkFBNkIsYUFBYSxzQkFBdUI7QUFDbEUsVUFBSSxXQUFXO0FBQ2YsZUFBUyxJQUFJLGVBQWUsR0FBRyxJQUFJLEdBQUcsS0FBSztBQUMxQyxZQUFJLDRCQUE0QixxQkFBcUIsQ0FBQyxHQUFHO0FBQ3hEO0FBQUEsUUFDRDtBQUNBLG1CQUFXO0FBQ1g7QUFBQSxNQUNEO0FBRUEsYUFBTztBQUFBLFFBQ04sYUFBYSxRQUFRLHFCQUFxQixNQUFNLGVBQWUsV0FBVyxDQUFDLENBQUM7QUFBQSxRQUM1RSxRQUFRO0FBQUEsUUFDUixNQUFNLFdBQVc7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLHNCQUFzQjtBQUN6QixhQUFPO0FBQUEsUUFDTixhQUFhLFFBQVEscUJBQXFCLE1BQU0sZUFBZSxzQkFBc0IsQ0FBQztBQUFBLFFBQ3RGLFFBQVE7QUFBQSxRQUNSLE1BQU07QUFBQSxNQUNQO0FBQUEsSUFDRCxPQUFPO0FBRU4sZUFBUyxJQUFJLHdCQUF3QixJQUFJLEdBQUcsS0FBSztBQUNoRCxZQUFJLDRCQUE0QixlQUFlLENBQUMsR0FBRztBQUNsRCxpQkFBTztBQUFBLFlBQ04sYUFBYSxRQUFRLHFCQUFxQixNQUFNLGVBQWUsQ0FBQyxDQUFDO0FBQUEsWUFDakUsUUFBUSxhQUFhO0FBQUEsWUFDckIsTUFBTTtBQUFBLFVBQ1A7QUFBQSxRQUNELFdBQVcsNEJBQTRCLHFCQUFxQixDQUFDLEdBQUc7QUFDL0QsY0FBSSxXQUFXO0FBQ2YsbUJBQVMsSUFBSSxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFDL0IsZ0JBQUksNEJBQTRCLHFCQUFxQixDQUFDLEdBQUc7QUFDeEQ7QUFBQSxZQUNEO0FBQ0EsdUJBQVc7QUFDWDtBQUFBLFVBQ0Q7QUFFQSxpQkFBTztBQUFBLFlBQ04sYUFBYSxRQUFRLHFCQUFxQixNQUFNLGVBQWUsV0FBVyxDQUFDLENBQUM7QUFBQSxZQUM1RSxRQUFRO0FBQUEsWUFDUixNQUFNLFdBQVc7QUFBQSxVQUNsQjtBQUFBLFFBQ0QsV0FBVyw0QkFBNEIsZUFBZSxDQUFDLEdBQUc7QUFDekQsaUJBQU87QUFBQSxZQUNOLGFBQWEsUUFBUSxxQkFBcUIsTUFBTSxlQUFlLENBQUMsQ0FBQztBQUFBLFlBQ2pFLFFBQVE7QUFBQSxZQUNSLE1BQU07QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPO0FBQUEsUUFDTixhQUFhLFFBQVEscUJBQXFCLE1BQU0sZUFBZSxDQUFDLENBQUM7QUFBQSxRQUNqRSxRQUFRO0FBQUEsUUFDUixNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFFTyxTQUFTLHFCQUNmLFlBQ0EsY0FDQSxZQUNBLFlBQ0EsaUJBQ0EsOEJBQ2dCO0FBQ2hCLE1BQUksYUFBYSx5QkFBeUIsTUFBTTtBQUMvQyxXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sa0JBQWtCLDZCQUE2Qix5QkFBeUIsVUFBVTtBQUN4RixNQUFJLENBQUMsaUJBQWlCO0FBQ3JCLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxxQkFBcUIsNkJBQTZCLHlCQUF5QixVQUFVLEVBQUU7QUFDN0YsTUFBSSxDQUFDLG9CQUFvQjtBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sOEJBQThCLElBQUksNEJBQTRCLGNBQWMsb0JBQW9CLDRCQUE0QjtBQUNsSSxRQUFNLFNBQVMsd0JBQXdCLFlBQVksY0FBYyxZQUFZLFFBQVcsNEJBQTRCO0FBRXBILE1BQUksUUFBUTtBQUNYLFVBQU0sY0FBYyxPQUFPO0FBQzNCLFFBQUksZ0JBQWdCLFFBQVc7QUFFOUIsVUFBSSx3QkFBd0I7QUFDNUIsZUFBUyxnQkFBZ0IsYUFBYSxnQkFBZ0IsYUFBYSxHQUFHLGlCQUFpQjtBQUN0RixZQUFJLENBQUMsUUFBUSxLQUFLLGFBQWEsZUFBZSxhQUFhLENBQUMsR0FBRztBQUM5RCxrQ0FBd0I7QUFDeEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUNBLFVBQUksdUJBQXVCO0FBQzFCLGNBQU0sY0FBYyxnQkFBZ0IsUUFBUSxZQUFZLElBQUksYUFBYSxlQUFlLFdBQVcsR0FBRyxFQUFFO0FBRXhHLFlBQUksYUFBYTtBQUNoQixjQUFJLGNBQWMsUUFBUSxxQkFBcUIsYUFBYSxlQUFlLFdBQVcsQ0FBQztBQUV2RixjQUFJLFlBQVksWUFBWTtBQUMzQiwwQkFBYyxZQUFZLFVBQVUsR0FBRyxZQUFZLFNBQVMsWUFBWSxVQUFVO0FBQUEsVUFDbkY7QUFFQSxjQUNFLFlBQVksaUJBQWlCLGFBQWEsVUFDMUMsWUFBWSxpQkFBaUIsYUFBYSxlQUMxQztBQUNELDBCQUFjLGdCQUFnQixZQUFZLFdBQVc7QUFBQSxVQUN0RCxXQUFXLFlBQVksaUJBQWlCLGFBQWEsU0FBUztBQUM3RCwwQkFBYyxnQkFBZ0IsY0FBYyxXQUFXO0FBQUEsVUFDeEQ7QUFFQSxjQUFJLDRCQUE0QixlQUFlLFVBQVUsR0FBRztBQUMzRCwwQkFBYyxnQkFBZ0IsY0FBYyxXQUFXO0FBQUEsVUFDeEQ7QUFFQSxjQUFJLFlBQVksWUFBWTtBQUMzQiwyQkFBZSxZQUFZO0FBQUEsVUFDNUI7QUFFQSxpQkFBTyxRQUFRLHFCQUFxQixXQUFXO0FBQUEsUUFDaEQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFFBQUksNEJBQTRCLGVBQWUsVUFBVSxHQUFHO0FBQzNELFVBQUksT0FBTyxXQUFXLGFBQWEsUUFBUTtBQUMxQyxlQUFPLE9BQU87QUFBQSxNQUNmLE9BQU87QUFDTixlQUFPLGdCQUFnQixjQUFjLE9BQU8sV0FBVztBQUFBLE1BQ3hEO0FBQUEsSUFDRCxPQUFPO0FBQ04sVUFBSSxPQUFPLFdBQVcsYUFBYSxRQUFRO0FBQzFDLGVBQU8sZ0JBQWdCLFlBQVksT0FBTyxXQUFXO0FBQUEsTUFDdEQsT0FBTztBQUNOLGVBQU8sT0FBTztBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsa0JBQ2YsWUFDQSxPQUNBLE9BQ0EsaUJBQ0EsOEJBQ3FEO0FBQ3JELE1BQUksYUFBYSx5QkFBeUIsTUFBTTtBQUMvQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sYUFBYSxNQUFNLHdCQUF3QixNQUFNLGlCQUFpQixNQUFNLFdBQVc7QUFDekYsUUFBTSxxQkFBcUIsNkJBQTZCLHlCQUF5QixVQUFVLEVBQUU7QUFDN0YsTUFBSSxDQUFDLG9CQUFvQjtBQUN4QixXQUFPO0FBQUEsRUFDUjtBQUVBLFFBQU0sYUFBYSxrQkFBa0IsTUFBTSxlQUFlO0FBQzFELFFBQU0sOEJBQThCLElBQUksNEJBQTRCLE9BQU8sNEJBQTRCO0FBQ3ZHLFFBQU0seUJBQXlCLDRCQUE0QixvQ0FBb0MsS0FBSztBQUNwRyxRQUFNLDRCQUE0Qix1QkFBdUI7QUFDekQsUUFBTSw2QkFBNkIsdUJBQXVCO0FBQzFELFFBQU0sb0JBQW9CLFFBQVEscUJBQXFCLDJCQUEyQixlQUFlLENBQUM7QUFFbEcsUUFBTSxlQUFlLDJDQUEyQyxPQUFPLE1BQU0saUJBQWlCLDBCQUEwQjtBQUN4SCxRQUFNLG1DQUFtQyxpQ0FBaUMsT0FBTyxNQUFNLGlCQUFpQixDQUFDO0FBQ3pHLFFBQU0sY0FBYyxNQUFNLGVBQWUsTUFBTSxlQUFlO0FBQzlELFFBQU0sb0JBQW9CLFFBQVEscUJBQXFCLFdBQVc7QUFDbEUsUUFBTSxtQkFBbUIsd0JBQXdCLFlBQVksY0FBYyxNQUFNLGtCQUFrQixHQUFHLFFBQVcsNEJBQTRCO0FBQzdJLE1BQUksQ0FBQyxrQkFBa0I7QUFDdEIsVUFBTSxjQUFjLG1DQUFtQyxvQkFBb0I7QUFDM0UsV0FBTztBQUFBLE1BQ047QUFBQSxNQUNBLFlBQVk7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUVBLE1BQUksbUJBQW1CLG1DQUFtQyxvQkFBb0IsaUJBQWlCO0FBRS9GLE1BQUksaUJBQWlCLFdBQVcsYUFBYSxRQUFRO0FBQ3BELHVCQUFtQixnQkFBZ0IsWUFBWSxnQkFBZ0I7QUFBQSxFQUNoRTtBQUVBLE1BQUksbUJBQW1CLGVBQWUsMEJBQTBCLGVBQWUsQ0FBQyxHQUFHO0FBQ2xGLHVCQUFtQixnQkFBZ0IsY0FBYyxnQkFBZ0I7QUFBQSxFQUNsRTtBQUVBLFNBQU87QUFBQSxJQUNOLGFBQWEsbUNBQW1DLG9CQUFvQjtBQUFBLElBQ3BFLFlBQVk7QUFBQSxFQUNiO0FBQ0Q7QUFNTyxTQUFTLHVCQUNmLGNBQ0EsT0FDQSxPQUNBLElBQ0EsaUJBQ0EsOEJBQ2dCO0FBQ2hCLFFBQU0sYUFBYSxhQUFhO0FBQ2hDLE1BQUksYUFBYSx5QkFBeUIsTUFBTTtBQUMvQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sbUNBQW1DLGlDQUFpQyxPQUFPLE1BQU0saUJBQWlCLENBQUM7QUFDekcsTUFBSSxrQ0FBa0M7QUFFckMsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLGFBQWEsTUFBTSx3QkFBd0IsTUFBTSxpQkFBaUIsTUFBTSxXQUFXO0FBQ3pGLFFBQU0scUJBQXFCLDZCQUE2Qix5QkFBeUIsVUFBVSxFQUFFO0FBQzdGLE1BQUksQ0FBQyxvQkFBb0I7QUFDeEIsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLDhCQUE4QixJQUFJLDRCQUE0QixPQUFPLDRCQUE0QjtBQUN2RyxRQUFNLHlCQUF5Qiw0QkFBNEIsb0NBQW9DLEtBQUs7QUFDcEcsUUFBTSxrQkFBa0IsdUJBQXVCLDJCQUEyQixlQUFlO0FBQ3pGLFFBQU0saUJBQWlCLHVCQUF1QiwwQkFBMEIsZUFBZTtBQUN2RixRQUFNLGtCQUFrQixrQkFBa0I7QUFDMUMsUUFBTSwrQkFBK0Isa0JBQWtCLEtBQUs7QUFJNUQsTUFBSSxDQUFDLG1CQUFtQixlQUFlLGVBQWUsS0FBSyxtQkFBbUIsZUFBZSw0QkFBNEIsR0FBRztBQUczSCxVQUFNLElBQUksd0JBQXdCLFlBQVksT0FBTyxNQUFNLGlCQUFpQixPQUFPLDRCQUE0QjtBQUMvRyxRQUFJLENBQUMsR0FBRztBQUNQLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxjQUFjLEVBQUU7QUFDcEIsUUFBSSxFQUFFLFdBQVcsYUFBYSxRQUFRO0FBQ3JDLG9CQUFjLGdCQUFnQixjQUFjLFdBQVc7QUFBQSxJQUN4RDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxxQkFBcUIsTUFBTSxrQkFBa0I7QUFDbkQsTUFBSSxxQkFBcUIsR0FBRztBQUMzQixVQUFNLGVBQWUsTUFBTSxlQUFlLGtCQUFrQjtBQUM1RCxRQUFJLG1CQUFtQixxQkFBcUIsWUFBWSxLQUFLLG1CQUFtQixlQUFlLDRCQUE0QixHQUFHO0FBQzdILFlBQU0sMkJBQTJCLHdCQUF3QixZQUFZLE9BQU8sTUFBTSxpQkFBaUIsT0FBTyw0QkFBNEI7QUFDdEksWUFBTSx1QkFBdUIsMEJBQTBCO0FBQ3ZELFVBQUkseUJBQXlCLFFBQVc7QUFDdkMsY0FBTSxjQUFjLE1BQU0sZUFBZSxNQUFNLGVBQWU7QUFDOUQsY0FBTSwyQkFBMkIsUUFBUSxxQkFBcUIsV0FBVztBQUN6RSxjQUFNLDZCQUE2QixnQkFBZ0IsWUFBWSxvQkFBb0I7QUFFbkYsY0FBTSxrQ0FBa0MsK0JBQStCO0FBQ3ZFLGNBQU0sd0NBQXdDLFFBQVEsS0FBSyxlQUFlO0FBQzFFLGNBQU0sbUJBQW1CLGFBQWEsaUJBQWlCLDBCQUEwQixJQUFJLEVBQUU7QUFDdkYsY0FBTSx3QkFBd0Isb0JBQW9CLGlCQUFpQixTQUFTO0FBQzVFLGNBQU0sc0RBQXNELHlCQUF5QjtBQUNyRixZQUFJLG1DQUFtQyxxREFBcUQ7QUFDM0YsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSO0FBRU8sU0FBUyxrQkFDZixPQUNBLFlBQ0EsOEJBQ2dCO0FBQ2hCLFFBQU0scUJBQXFCLDZCQUE2Qix5QkFBeUIsTUFBTSxjQUFjLENBQUMsRUFBRTtBQUN4RyxNQUFJLENBQUMsb0JBQW9CO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxhQUFhLEtBQUssYUFBYSxNQUFNLGFBQWEsR0FBRztBQUN4RCxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sbUJBQW1CLGtCQUFrQixNQUFNLGVBQWUsVUFBVSxDQUFDO0FBQzdFO0FBRUEsU0FBUywyQ0FBMkMsT0FBbUIsb0JBQTRCLGdCQUFnRDtBQUNsSixRQUFNLGVBQThCO0FBQUEsSUFDbkMsY0FBYztBQUFBLE1BQ2IsZUFBZSxDQUFDLGVBQXdDO0FBQ3ZELFlBQUksZUFBZSxvQkFBb0I7QUFDdEMsaUJBQU87QUFBQSxRQUNSLE9BQU87QUFDTixpQkFBTyxNQUFNLGFBQWEsY0FBYyxVQUFVO0FBQUEsUUFDbkQ7QUFBQSxNQUNEO0FBQUEsTUFDQSxlQUFlLE1BQWM7QUFDNUIsZUFBTyxNQUFNLGNBQWM7QUFBQSxNQUM1QjtBQUFBLE1BQ0EseUJBQXlCLENBQUMsWUFBb0IsV0FBMkI7QUFDeEUsZUFBTyxNQUFNLHdCQUF3QixZQUFZLE1BQU07QUFBQSxNQUN4RDtBQUFBLElBQ0Q7QUFBQSxJQUNBLGdCQUFnQixDQUFDLGVBQStCO0FBQy9DLFVBQUksZUFBZSxvQkFBb0I7QUFDdEMsZUFBTyxlQUFlLGVBQWU7QUFBQSxNQUN0QyxPQUFPO0FBQ04sZUFBTyxNQUFNLGVBQWUsVUFBVTtBQUFBLE1BQ3ZDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbXQp9Cg==
