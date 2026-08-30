import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MetadataConsts, StandardTokenType } from "../../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../../common/languages.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { LanguageAgnosticBracketTokens } from "../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/brackets.js";
import { lengthAdd, lengthsToRange, lengthZero } from "../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/length.js";
import { DenseKeyProvider } from "../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/smallImmutableSet.js";
import { TextBufferTokenizer, TokenKind } from "../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/tokenizer.js";
import { createModelServices, instantiateTextModel } from "../../testTextModel.js";
suite("Bracket Pair Colorizer - Tokenizer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Basic", () => {
    const mode1 = "testMode1";
    const disposableStore = new DisposableStore();
    const instantiationService = createModelServices(disposableStore);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    disposableStore.add(languageService.registerLanguage({ id: mode1 }));
    const encodedMode1 = languageService.languageIdCodec.encodeLanguageId(mode1);
    const denseKeyProvider = new DenseKeyProvider();
    const tStandard = (text) => new TokenInfo(text, encodedMode1, StandardTokenType.Other, true);
    const tComment = (text) => new TokenInfo(text, encodedMode1, StandardTokenType.Comment, true);
    const document = new TokenizedDocument([
      tStandard(" { } "),
      tStandard("be"),
      tStandard("gin end"),
      tStandard("\n"),
      tStandard("hello"),
      tComment("{"),
      tStandard("}")
    ]);
    disposableStore.add(TokenizationRegistry.register(mode1, document.getTokenizationSupport()));
    disposableStore.add(languageConfigurationService.register(mode1, {
      brackets: [["{", "}"], ["[", "]"], ["(", ")"], ["begin", "end"]]
    }));
    const model = disposableStore.add(instantiateTextModel(instantiationService, document.getText(), mode1));
    model.tokenization.forceTokenization(model.getLineCount());
    const brackets = new LanguageAgnosticBracketTokens(denseKeyProvider, (l) => languageConfigurationService.getLanguageConfiguration(l));
    const tokens = readAllTokens(new TextBufferTokenizer(model, brackets));
    assert.deepStrictEqual(toArr(tokens, model, denseKeyProvider), [
      { text: " ", bracketId: null, bracketIds: [], kind: "Text" },
      {
        text: "{",
        bracketId: "testMode1:::{",
        bracketIds: ["testMode1:::{"],
        kind: "OpeningBracket"
      },
      { text: " ", bracketId: null, bracketIds: [], kind: "Text" },
      {
        text: "}",
        bracketId: "testMode1:::{",
        bracketIds: ["testMode1:::{"],
        kind: "ClosingBracket"
      },
      { text: " ", bracketId: null, bracketIds: [], kind: "Text" },
      {
        text: "begin",
        bracketId: "testMode1:::begin",
        bracketIds: ["testMode1:::begin"],
        kind: "OpeningBracket"
      },
      { text: " ", bracketId: null, bracketIds: [], kind: "Text" },
      {
        text: "end",
        bracketId: "testMode1:::begin",
        bracketIds: ["testMode1:::begin"],
        kind: "ClosingBracket"
      },
      { text: "\nhello{", bracketId: null, bracketIds: [], kind: "Text" },
      {
        text: "}",
        bracketId: "testMode1:::{",
        bracketIds: ["testMode1:::{"],
        kind: "ClosingBracket"
      }
    ]);
    disposableStore.dispose();
  });
});
function readAllTokens(tokenizer) {
  const tokens = new Array();
  while (true) {
    const token = tokenizer.read();
    if (!token) {
      break;
    }
    tokens.push(token);
  }
  return tokens;
}
function toArr(tokens, model, keyProvider) {
  const result = new Array();
  let offset = lengthZero;
  for (const token of tokens) {
    result.push(tokenToObj(token, offset, model, keyProvider));
    offset = lengthAdd(offset, token.length);
  }
  return result;
}
function tokenToObj(token, offset, model, keyProvider) {
  return {
    text: model.getValueInRange(lengthsToRange(offset, lengthAdd(offset, token.length))),
    bracketId: keyProvider.reverseLookup(token.bracketId) || null,
    bracketIds: keyProvider.reverseLookupSet(token.bracketIds),
    kind: {
      [TokenKind.ClosingBracket]: "ClosingBracket",
      [TokenKind.OpeningBracket]: "OpeningBracket",
      [TokenKind.Text]: "Text"
    }[token.kind]
  };
}
class TokenizedDocument {
  constructor(tokens) {
    const tokensByLine = new Array();
    let curLine = new Array();
    for (const token of tokens) {
      const lines = token.text.split("\n");
      let first = true;
      while (lines.length > 0) {
        if (!first) {
          tokensByLine.push(curLine);
          curLine = new Array();
        } else {
          first = false;
        }
        if (lines[0].length > 0) {
          curLine.push(token.withText(lines[0]));
        }
        lines.pop();
      }
    }
    tokensByLine.push(curLine);
    this.tokensByLine = tokensByLine;
  }
  getText() {
    return this.tokensByLine.map((t) => t.map((t2) => t2.text).join("")).join("\n");
  }
  getTokenizationSupport() {
    class State {
      constructor(lineNumber) {
        this.lineNumber = lineNumber;
      }
      clone() {
        return new State(this.lineNumber);
      }
      equals(other) {
        return this.lineNumber === other.lineNumber;
      }
    }
    return {
      getInitialState: () => new State(0),
      tokenize: () => {
        throw new Error("Method not implemented.");
      },
      tokenizeEncoded: (line, hasEOL, state) => {
        const state2 = state;
        const tokens = this.tokensByLine[state2.lineNumber];
        const arr = new Array();
        let offset = 0;
        for (const t of tokens) {
          arr.push(offset, t.getMetadata());
          offset += t.text.length;
        }
        return new EncodedTokenizationResult(new Uint32Array(arr), [], new State(state2.lineNumber + 1));
      }
    };
  }
}
class TokenInfo {
  constructor(text, languageId, tokenType, hasBalancedBrackets) {
    this.text = text;
    this.languageId = languageId;
    this.tokenType = tokenType;
    this.hasBalancedBrackets = hasBalancedBrackets;
  }
  getMetadata() {
    return (this.languageId << MetadataConsts.LANGUAGEID_OFFSET | this.tokenType << MetadataConsts.TOKEN_TYPE_OFFSET) >>> 0 | (this.hasBalancedBrackets ? MetadataConsts.BALANCED_BRACKETS_MASK : 0);
  }
  withText(text) {
    return new TokenInfo(text, this.languageId, this.tokenType, this.hasBalancedBrackets);
  }
}
export {
  TokenInfo,
  TokenizedDocument
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyQ29sb3JpemVyXFx0b2tlbml6ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlSWQsIE1ldGFkYXRhQ29uc3RzLCBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQsIElTdGF0ZSwgSVRva2VuaXphdGlvblN1cHBvcnQsIFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VBZ25vc3RpY0JyYWNrZXRUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNUcmVlL2JyYWNrZXRzLmpzJztcbmltcG9ydCB7IExlbmd0aCwgbGVuZ3RoQWRkLCBsZW5ndGhzVG9SYW5nZSwgbGVuZ3RoWmVybyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9icmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0L2JyYWNrZXRQYWlyc1RyZWUvbGVuZ3RoLmpzJztcbmltcG9ydCB7IERlbnNlS2V5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNUcmVlL3NtYWxsSW1tdXRhYmxlU2V0LmpzJztcbmltcG9ydCB7IFRleHRCdWZmZXJUb2tlbml6ZXIsIFRva2VuLCBUb2tlbml6ZXIsIFRva2VuS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9icmFja2V0UGFpcnNUZXh0TW9kZWxQYXJ0L2JyYWNrZXRQYWlyc1RyZWUvdG9rZW5pemVyLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcywgaW5zdGFudGlhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi90ZXN0VGV4dE1vZGVsLmpzJztcblxuc3VpdGUoJ0JyYWNrZXQgUGFpciBDb2xvcml6ZXIgLSBUb2tlbml6ZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnQmFzaWMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZTEgPSAndGVzdE1vZGUxJztcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbW9kZTEgfSkpO1xuXHRcdGNvbnN0IGVuY29kZWRNb2RlMSA9IGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChtb2RlMSk7XG5cblx0XHRjb25zdCBkZW5zZUtleVByb3ZpZGVyID0gbmV3IERlbnNlS2V5UHJvdmlkZXI8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgdFN0YW5kYXJkID0gKHRleHQ6IHN0cmluZykgPT4gbmV3IFRva2VuSW5mbyh0ZXh0LCBlbmNvZGVkTW9kZTEsIFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyLCB0cnVlKTtcblx0XHRjb25zdCB0Q29tbWVudCA9ICh0ZXh0OiBzdHJpbmcpID0+IG5ldyBUb2tlbkluZm8odGV4dCwgZW5jb2RlZE1vZGUxLCBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50LCB0cnVlKTtcblx0XHRjb25zdCBkb2N1bWVudCA9IG5ldyBUb2tlbml6ZWREb2N1bWVudChbXG5cdFx0XHR0U3RhbmRhcmQoJyB7IH0gJyksIHRTdGFuZGFyZCgnYmUnKSwgdFN0YW5kYXJkKCdnaW4gZW5kJyksIHRTdGFuZGFyZCgnXFxuJyksXG5cdFx0XHR0U3RhbmRhcmQoJ2hlbGxvJyksIHRDb21tZW50KCd7JyksIHRTdGFuZGFyZCgnfScpLFxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcihtb2RlMSwgZG9jdW1lbnQuZ2V0VG9rZW5pemF0aW9uU3VwcG9ydCgpKSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKG1vZGUxLCB7XG5cdFx0XHRicmFja2V0czogW1sneycsICd9J10sIFsnWycsICddJ10sIFsnKCcsICcpJ10sIFsnYmVnaW4nLCAnZW5kJ11dLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgZG9jdW1lbnQuZ2V0VGV4dCgpLCBtb2RlMSkpO1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cblx0XHRjb25zdCBicmFja2V0cyA9IG5ldyBMYW5ndWFnZUFnbm9zdGljQnJhY2tldFRva2VucyhkZW5zZUtleVByb3ZpZGVyLCBsID0+IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGwpKTtcblxuXHRcdGNvbnN0IHRva2VucyA9IHJlYWRBbGxUb2tlbnMobmV3IFRleHRCdWZmZXJUb2tlbml6ZXIobW9kZWwsIGJyYWNrZXRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyKHRva2VucywgbW9kZWwsIGRlbnNlS2V5UHJvdmlkZXIpLCBbXG5cdFx0XHR7IHRleHQ6ICcgJywgYnJhY2tldElkOiBudWxsLCBicmFja2V0SWRzOiBbXSwga2luZDogJ1RleHQnIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRleHQ6ICd7Jyxcblx0XHRcdFx0YnJhY2tldElkOiAndGVzdE1vZGUxOjo6eycsXG5cdFx0XHRcdGJyYWNrZXRJZHM6IFsndGVzdE1vZGUxOjo6eyddLFxuXHRcdFx0XHRraW5kOiAnT3BlbmluZ0JyYWNrZXQnLFxuXHRcdFx0fSxcblx0XHRcdHsgdGV4dDogJyAnLCBicmFja2V0SWQ6IG51bGwsIGJyYWNrZXRJZHM6IFtdLCBraW5kOiAnVGV4dCcgfSxcblx0XHRcdHtcblx0XHRcdFx0dGV4dDogJ30nLFxuXHRcdFx0XHRicmFja2V0SWQ6ICd0ZXN0TW9kZTE6Ojp7Jyxcblx0XHRcdFx0YnJhY2tldElkczogWyd0ZXN0TW9kZTE6Ojp7J10sXG5cdFx0XHRcdGtpbmQ6ICdDbG9zaW5nQnJhY2tldCcsXG5cdFx0XHR9LFxuXHRcdFx0eyB0ZXh0OiAnICcsIGJyYWNrZXRJZDogbnVsbCwgYnJhY2tldElkczogW10sIGtpbmQ6ICdUZXh0JyB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0ZXh0OiAnYmVnaW4nLFxuXHRcdFx0XHRicmFja2V0SWQ6ICd0ZXN0TW9kZTE6OjpiZWdpbicsXG5cdFx0XHRcdGJyYWNrZXRJZHM6IFsndGVzdE1vZGUxOjo6YmVnaW4nXSxcblx0XHRcdFx0a2luZDogJ09wZW5pbmdCcmFja2V0Jyxcblx0XHRcdH0sXG5cdFx0XHR7IHRleHQ6ICcgJywgYnJhY2tldElkOiBudWxsLCBicmFja2V0SWRzOiBbXSwga2luZDogJ1RleHQnIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRleHQ6ICdlbmQnLFxuXHRcdFx0XHRicmFja2V0SWQ6ICd0ZXN0TW9kZTE6OjpiZWdpbicsXG5cdFx0XHRcdGJyYWNrZXRJZHM6IFsndGVzdE1vZGUxOjo6YmVnaW4nXSxcblx0XHRcdFx0a2luZDogJ0Nsb3NpbmdCcmFja2V0Jyxcblx0XHRcdH0sXG5cdFx0XHR7IHRleHQ6ICdcXG5oZWxsb3snLCBicmFja2V0SWQ6IG51bGwsIGJyYWNrZXRJZHM6IFtdLCBraW5kOiAnVGV4dCcgfSxcblx0XHRcdHtcblx0XHRcdFx0dGV4dDogJ30nLFxuXHRcdFx0XHRicmFja2V0SWQ6ICd0ZXN0TW9kZTE6Ojp7Jyxcblx0XHRcdFx0YnJhY2tldElkczogWyd0ZXN0TW9kZTE6Ojp7J10sXG5cdFx0XHRcdGtpbmQ6ICdDbG9zaW5nQnJhY2tldCcsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gcmVhZEFsbFRva2Vucyh0b2tlbml6ZXI6IFRva2VuaXplcik6IFRva2VuW10ge1xuXHRjb25zdCB0b2tlbnMgPSBuZXcgQXJyYXk8VG9rZW4+KCk7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0Y29uc3QgdG9rZW4gPSB0b2tlbml6ZXIucmVhZCgpO1xuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHR0b2tlbnMucHVzaCh0b2tlbik7XG5cdH1cblx0cmV0dXJuIHRva2Vucztcbn1cblxuZnVuY3Rpb24gdG9BcnIodG9rZW5zOiBUb2tlbltdLCBtb2RlbDogVGV4dE1vZGVsLCBrZXlQcm92aWRlcjogRGVuc2VLZXlQcm92aWRlcjxzdHJpbmc+KTogYW55W10ge1xuXHRjb25zdCByZXN1bHQgPSBuZXcgQXJyYXk8YW55PigpO1xuXHRsZXQgb2Zmc2V0ID0gbGVuZ3RoWmVybztcblx0Zm9yIChjb25zdCB0b2tlbiBvZiB0b2tlbnMpIHtcblx0XHRyZXN1bHQucHVzaCh0b2tlblRvT2JqKHRva2VuLCBvZmZzZXQsIG1vZGVsLCBrZXlQcm92aWRlcikpO1xuXHRcdG9mZnNldCA9IGxlbmd0aEFkZChvZmZzZXQsIHRva2VuLmxlbmd0aCk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gdG9rZW5Ub09iaih0b2tlbjogVG9rZW4sIG9mZnNldDogTGVuZ3RoLCBtb2RlbDogVGV4dE1vZGVsLCBrZXlQcm92aWRlcjogRGVuc2VLZXlQcm92aWRlcjxhbnk+KTogYW55IHtcblx0cmV0dXJuIHtcblx0XHR0ZXh0OiBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobGVuZ3Roc1RvUmFuZ2Uob2Zmc2V0LCBsZW5ndGhBZGQob2Zmc2V0LCB0b2tlbi5sZW5ndGgpKSksXG5cdFx0YnJhY2tldElkOiBrZXlQcm92aWRlci5yZXZlcnNlTG9va3VwKHRva2VuLmJyYWNrZXRJZCkgfHwgbnVsbCxcblx0XHRicmFja2V0SWRzOiBrZXlQcm92aWRlci5yZXZlcnNlTG9va3VwU2V0KHRva2VuLmJyYWNrZXRJZHMpLFxuXHRcdGtpbmQ6IHtcblx0XHRcdFtUb2tlbktpbmQuQ2xvc2luZ0JyYWNrZXRdOiAnQ2xvc2luZ0JyYWNrZXQnLFxuXHRcdFx0W1Rva2VuS2luZC5PcGVuaW5nQnJhY2tldF06ICdPcGVuaW5nQnJhY2tldCcsXG5cdFx0XHRbVG9rZW5LaW5kLlRleHRdOiAnVGV4dCcsXG5cdFx0fVt0b2tlbi5raW5kXVxuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgVG9rZW5pemVkRG9jdW1lbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IHRva2Vuc0J5TGluZTogcmVhZG9ubHkgVG9rZW5JbmZvW11bXTtcblx0Y29uc3RydWN0b3IodG9rZW5zOiBUb2tlbkluZm9bXSkge1xuXHRcdGNvbnN0IHRva2Vuc0J5TGluZSA9IG5ldyBBcnJheTxUb2tlbkluZm9bXT4oKTtcblx0XHRsZXQgY3VyTGluZSA9IG5ldyBBcnJheTxUb2tlbkluZm8+KCk7XG5cblx0XHRmb3IgKGNvbnN0IHRva2VuIG9mIHRva2Vucykge1xuXHRcdFx0Y29uc3QgbGluZXMgPSB0b2tlbi50ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRcdGxldCBmaXJzdCA9IHRydWU7XG5cdFx0XHR3aGlsZSAobGluZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRcdFx0dG9rZW5zQnlMaW5lLnB1c2goY3VyTGluZSk7XG5cdFx0XHRcdFx0Y3VyTGluZSA9IG5ldyBBcnJheTxUb2tlbkluZm8+KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zmlyc3QgPSBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChsaW5lc1swXS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y3VyTGluZS5wdXNoKHRva2VuLndpdGhUZXh0KGxpbmVzWzBdKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0bGluZXMucG9wKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dG9rZW5zQnlMaW5lLnB1c2goY3VyTGluZSk7XG5cblx0XHR0aGlzLnRva2Vuc0J5TGluZSA9IHRva2Vuc0J5TGluZTtcblx0fVxuXG5cdGdldFRleHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMudG9rZW5zQnlMaW5lLm1hcCh0ID0+IHQubWFwKHQgPT4gdC50ZXh0KS5qb2luKCcnKSkuam9pbignXFxuJyk7XG5cdH1cblxuXHRnZXRUb2tlbml6YXRpb25TdXBwb3J0KCk6IElUb2tlbml6YXRpb25TdXBwb3J0IHtcblx0XHRjbGFzcyBTdGF0ZSBpbXBsZW1lbnRzIElTdGF0ZSB7XG5cdFx0XHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyKSB7IH1cblxuXHRcdFx0Y2xvbmUoKTogSVN0YXRlIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBTdGF0ZSh0aGlzLmxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRlcXVhbHMob3RoZXI6IElTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5saW5lTnVtYmVyID09PSAob3RoZXIgYXMgU3RhdGUpLmxpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gbmV3IFN0YXRlKDApLFxuXHRcdFx0dG9rZW5pemU6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdNZXRob2Qgbm90IGltcGxlbWVudGVkLicpOyB9LFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpOiBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0ID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUyID0gc3RhdGUgYXMgU3RhdGU7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IHRoaXMudG9rZW5zQnlMaW5lW3N0YXRlMi5saW5lTnVtYmVyXTtcblx0XHRcdFx0Y29uc3QgYXJyID0gbmV3IEFycmF5PG51bWJlcj4oKTtcblx0XHRcdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0XHRcdGZvciAoY29uc3QgdCBvZiB0b2tlbnMpIHtcblx0XHRcdFx0XHRhcnIucHVzaChvZmZzZXQsIHQuZ2V0TWV0YWRhdGEoKSk7XG5cdFx0XHRcdFx0b2Zmc2V0ICs9IHQudGV4dC5sZW5ndGg7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQobmV3IFVpbnQzMkFycmF5KGFyciksIFtdLCBuZXcgU3RhdGUoc3RhdGUyLmxpbmVOdW1iZXIgKyAxKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9rZW5JbmZvIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHRleHQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZDogTGFuZ3VhZ2VJZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgdG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgaGFzQmFsYW5jZWRCcmFja2V0czogYm9vbGVhbixcblx0KSB7IH1cblxuXHRnZXRNZXRhZGF0YSgpOiBudW1iZXIge1xuXHRcdHJldHVybiAoXG5cdFx0XHQoKCh0aGlzLmxhbmd1YWdlSWQgPDwgTWV0YWRhdGFDb25zdHMuTEFOR1VBR0VJRF9PRkZTRVQpIHxcblx0XHRcdFx0KHRoaXMudG9rZW5UeXBlIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKSkgPj4+XG5cdFx0XHRcdDApIHxcblx0XHRcdCh0aGlzLmhhc0JhbGFuY2VkQnJhY2tldHMgPyBNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLIDogMClcblx0XHQpO1xuXHR9XG5cblx0d2l0aFRleHQodGV4dDogc3RyaW5nKTogVG9rZW5JbmZvIHtcblx0XHRyZXR1cm4gbmV3IFRva2VuSW5mbyh0ZXh0LCB0aGlzLmxhbmd1YWdlSWQsIHRoaXMudG9rZW5UeXBlLCB0aGlzLmhhc0JhbGFuY2VkQnJhY2tldHMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBcUIsZ0JBQWdCLHlCQUF5QjtBQUM5RCxTQUFTLDJCQUF5RCw0QkFBNEI7QUFDOUYsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBaUIsV0FBVyxnQkFBZ0Isa0JBQWtCO0FBQzlELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXVDLGlCQUFpQjtBQUVqRSxTQUFTLHFCQUFxQiw0QkFBNEI7QUFFMUQsTUFBTSxzQ0FBc0MsTUFBTTtBQUVqRCwwQ0FBd0M7QUFFeEMsT0FBSyxTQUFTLE1BQU07QUFDbkIsVUFBTSxRQUFRO0FBQ2QsVUFBTSxrQkFBa0IsSUFBSSxnQkFBZ0I7QUFDNUMsVUFBTSx1QkFBdUIsb0JBQW9CLGVBQWU7QUFDaEUsVUFBTSwrQkFBK0IscUJBQXFCLElBQUksNkJBQTZCO0FBQzNGLFVBQU0sa0JBQWtCLHFCQUFxQixJQUFJLGdCQUFnQjtBQUNqRSxvQkFBZ0IsSUFB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
