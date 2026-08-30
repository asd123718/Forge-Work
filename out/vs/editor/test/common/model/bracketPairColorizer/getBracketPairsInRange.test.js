import assert from "assert";
import { disposeOnReturn } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { StandardTokenType } from "../../../../common/encodedTokenAttributes.js";
import { TokenizationRegistry } from "../../../../common/languages.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { TokenInfo, TokenizedDocument } from "./tokenizer.test.js";
import { createModelServices, instantiateTextModel } from "../../testTextModel.js";
suite("Bracket Pair Colorizer - getBracketPairsInRange", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createTextModelWithColorizedBracketPairs(store, text) {
    const languageId = "testLanguage";
    const instantiationService = createModelServices(store);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    store.add(languageService.registerLanguage({
      id: languageId
    }));
    const encodedMode1 = languageService.languageIdCodec.encodeLanguageId(languageId);
    const document = new TokenizedDocument([
      new TokenInfo(text, encodedMode1, StandardTokenType.Other, true)
    ]);
    store.add(TokenizationRegistry.register(languageId, document.getTokenizationSupport()));
    store.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["<", ">"]
      ],
      colorizedBracketPairs: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const textModel = store.add(instantiateTextModel(instantiationService, text, languageId));
    return textModel;
  }
  test("Basic 1", () => {
    disposeOnReturn((store) => {
      const doc = new AnnotatedDocument(`{ ( [] \xB9 ) [ \xB2 { } ] () } []`);
      const model = createTextModelWithColorizedBracketPairs(store, doc.text);
      model.tokenization.getLineTokens(1).getLanguageId(0);
      assert.deepStrictEqual(
        model.bracketPairs.getBracketPairsInRange(doc.range(1, 2)).map(bracketPairToJSON).toArray(),
        [
          {
            level: 0,
            range: "[1,1 -> 1,2]",
            openRange: "[1,1 -> 1,2]",
            closeRange: "[1,23 -> 1,24]"
          },
          {
            level: 1,
            range: "[1,3 -> 1,4]",
            openRange: "[1,3 -> 1,4]",
            closeRange: "[1,9 -> 1,10]"
          },
          {
            level: 1,
            range: "[1,11 -> 1,12]",
            openRange: "[1,11 -> 1,12]",
            closeRange: "[1,18 -> 1,19]"
          }
        ]
      );
    });
  });
  test("Basic 2", () => {
    disposeOnReturn((store) => {
      const doc = new AnnotatedDocument(`{ ( [] \xB9 \xB2) [  { } ] () } []`);
      const model = createTextModelWithColorizedBracketPairs(store, doc.text);
      assert.deepStrictEqual(
        model.bracketPairs.getBracketPairsInRange(doc.range(1, 2)).map(bracketPairToJSON).toArray(),
        [
          {
            level: 0,
            range: "[1,1 -> 1,2]",
            openRange: "[1,1 -> 1,2]",
            closeRange: "[1,23 -> 1,24]"
          },
          {
            level: 1,
            range: "[1,3 -> 1,4]",
            openRange: "[1,3 -> 1,4]",
            closeRange: "[1,9 -> 1,10]"
          }
        ]
      );
    });
  });
  test("Basic Empty", () => {
    disposeOnReturn((store) => {
      const doc = new AnnotatedDocument(`\xB9 \xB2 { ( [] ) [  { } ] () } []`);
      const model = createTextModelWithColorizedBracketPairs(store, doc.text);
      assert.deepStrictEqual(
        model.bracketPairs.getBracketPairsInRange(doc.range(1, 2)).map(bracketPairToJSON).toArray(),
        []
      );
    });
  });
  test("Basic All", () => {
    disposeOnReturn((store) => {
      const doc = new AnnotatedDocument(`\xB9 { ( [] ) [  { } ] () } [] \xB2`);
      const model = createTextModelWithColorizedBracketPairs(store, doc.text);
      assert.deepStrictEqual(
        model.bracketPairs.getBracketPairsInRange(doc.range(1, 2)).map(bracketPairToJSON).toArray(),
        [
          {
            level: 0,
            range: "[1,2 -> 1,3]",
            openRange: "[1,2 -> 1,3]",
            closeRange: "[1,23 -> 1,24]"
          },
          {
            level: 1,
            range: "[1,4 -> 1,5]",
            openRange: "[1,4 -> 1,5]",
            closeRange: "[1,9 -> 1,10]"
          },
          {
            level: 2,
            range: "[1,6 -> 1,7]",
            openRange: "[1,6 -> 1,7]",
            closeRange: "[1,7 -> 1,8]"
          },
          {
            level: 1,
            range: "[1,11 -> 1,12]",
            openRange: "[1,11 -> 1,12]",
            closeRange: "[1,18 -> 1,19]"
          },
          {
            level: 2,
            range: "[1,14 -> 1,15]",
            openRange: "[1,14 -> 1,15]",
            closeRange: "[1,16 -> 1,17]"
          },
          {
            level: 1,
            range: "[1,20 -> 1,21]",
            openRange: "[1,20 -> 1,21]",
            closeRange: "[1,21 -> 1,22]"
          },
          {
            level: 0,
            range: "[1,25 -> 1,26]",
            openRange: "[1,25 -> 1,26]",
            closeRange: "[1,26 -> 1,27]"
          }
        ]
      );
    });
  });
  test("getBracketsInRange", () => {
    disposeOnReturn((store) => {
      const doc = new AnnotatedDocument(`\xB9 { [ ( [ [ (  ) ] ] ) ] } { } \xB2`);
      const model = createTextModelWithColorizedBracketPairs(store, doc.text);
      assert.deepStrictEqual(
        model.bracketPairs.getBracketsInRange(doc.range(1, 2)).map((b) => ({ level: b.nestingLevel, levelEqualBracketType: b.nestingLevelOfEqualBracketType, range: b.range.toString() })).toArray(),
        [
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,2 -> 1,3]"
          },
          {
            level: 1,
            levelEqualBracketType: 0,
            range: "[1,4 -> 1,5]"
          },
          {
            level: 2,
            levelEqualBracketType: 0,
            range: "[1,6 -> 1,7]"
          },
          {
            level: 3,
            levelEqualBracketType: 1,
            range: "[1,8 -> 1,9]"
          },
          {
            level: 4,
            levelEqualBracketType: 2,
            range: "[1,10 -> 1,11]"
          },
          {
            level: 5,
            levelEqualBracketType: 1,
            range: "[1,12 -> 1,13]"
          },
          {
            level: 5,
            levelEqualBracketType: 1,
            range: "[1,15 -> 1,16]"
          },
          {
            level: 4,
            levelEqualBracketType: 2,
            range: "[1,17 -> 1,18]"
          },
          {
            level: 3,
            levelEqualBracketType: 1,
            range: "[1,19 -> 1,20]"
          },
          {
            level: 2,
            levelEqualBracketType: 0,
            range: "[1,21 -> 1,22]"
          },
          {
            level: 1,
            levelEqualBracketType: 0,
            range: "[1,23 -> 1,24]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,25 -> 1,26]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,27 -> 1,28]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,29 -> 1,30]"
          }
        ]
      );
    });
  });
  test("Test Error Brackets", () => {
    disposeOnReturn((store) => {
      const doc = new AnnotatedDocument(`\xB9 { () ] \xB2 `);
      const model = createTextModelWithColorizedBracketPairs(store, doc.text);
      assert.deepStrictEqual(
        model.bracketPairs.getBracketsInRange(doc.range(1, 2)).map((b) => ({ level: b.nestingLevel, range: b.range.toString(), isInvalid: b.isInvalid })).toArray(),
        [
          {
            level: 0,
            isInvalid: true,
            range: "[1,2 -> 1,3]"
          },
          {
            level: 1,
            isInvalid: false,
            range: "[1,4 -> 1,5]"
          },
          {
            level: 1,
            isInvalid: false,
            range: "[1,5 -> 1,6]"
          },
          {
            level: 0,
            isInvalid: true,
            range: "[1,7 -> 1,8]"
          }
        ]
      );
    });
  });
  test("colorizedBracketsVSBrackets", () => {
    disposeOnReturn((store) => {
      const doc = new AnnotatedDocument(`\xB9 {} [<()>] <{>} \xB2`);
      const model = createTextModelWithColorizedBracketPairs(store, doc.text);
      assert.deepStrictEqual(
        model.bracketPairs.getBracketsInRange(doc.range(1, 2), true).map((b) => ({ level: b.nestingLevel, levelEqualBracketType: b.nestingLevelOfEqualBracketType, range: b.range.toString() })).toArray(),
        [
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,2 -> 1,3]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,3 -> 1,4]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,5 -> 1,6]"
          },
          {
            level: 1,
            levelEqualBracketType: 0,
            range: "[1,7 -> 1,8]"
          },
          {
            level: 1,
            levelEqualBracketType: 0,
            range: "[1,8 -> 1,9]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,10 -> 1,11]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,13 -> 1,14]"
          },
          {
            level: -1,
            levelEqualBracketType: 0,
            range: "[1,15 -> 1,16]"
          }
        ]
      );
      assert.deepStrictEqual(
        model.bracketPairs.getBracketsInRange(doc.range(1, 2), false).map((b) => ({ level: b.nestingLevel, levelEqualBracketType: b.nestingLevelOfEqualBracketType, range: b.range.toString() })).toArray(),
        [
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,2 -> 1,3]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,3 -> 1,4]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,5 -> 1,6]"
          },
          {
            level: 1,
            levelEqualBracketType: 0,
            range: "[1,6 -> 1,7]"
          },
          {
            level: 2,
            levelEqualBracketType: 0,
            range: "[1,7 -> 1,8]"
          },
          {
            level: 2,
            levelEqualBracketType: 0,
            range: "[1,8 -> 1,9]"
          },
          {
            level: 1,
            levelEqualBracketType: 0,
            range: "[1,9 -> 1,10]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,10 -> 1,11]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,12 -> 1,13]"
          },
          {
            level: 1,
            levelEqualBracketType: 0,
            range: "[1,13 -> 1,14]"
          },
          {
            level: 0,
            levelEqualBracketType: 0,
            range: "[1,14 -> 1,15]"
          },
          {
            level: -1,
            levelEqualBracketType: 0,
            range: "[1,15 -> 1,16]"
          }
        ]
      );
    });
  });
});
function bracketPairToJSON(pair) {
  return {
    level: pair.nestingLevel,
    range: pair.openingBracketRange.toString(),
    openRange: pair.openingBracketRange.toString(),
    closeRange: pair.closingBracketRange?.toString() || null
  };
}
class PositionOffsetTransformer {
  constructor(text) {
    this.lineStartOffsetByLineIdx = [];
    this.lineStartOffsetByLineIdx.push(0);
    for (let i = 0; i < text.length; i++) {
      if (text.charAt(i) === "\n") {
        this.lineStartOffsetByLineIdx.push(i + 1);
      }
    }
  }
  getOffset(position) {
    return this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1;
  }
  getPosition(offset) {
    const lineNumber = this.lineStartOffsetByLineIdx.findIndex((lineStartOffset) => lineStartOffset <= offset);
    return new Position(lineNumber + 1, offset - this.lineStartOffsetByLineIdx[lineNumber] + 1);
  }
}
class AnnotatedDocument {
  constructor(src) {
    const numbers = ["\u2070", "\xB9", "\xB2", "\xB3", "\u2074", "\u2075", "\u2076", "\u2077", "\u2078", "\u2079"];
    let text = "";
    const offsetPositions = /* @__PURE__ */ new Map();
    let offset = 0;
    for (let i = 0; i < src.length; i++) {
      const idx = numbers.indexOf(src[i]);
      if (idx >= 0) {
        offsetPositions.set(idx, offset);
      } else {
        text += src[i];
        offset++;
      }
    }
    this.text = text;
    const mapper = new PositionOffsetTransformer(this.text);
    const positions = /* @__PURE__ */ new Map();
    for (const [idx, offset2] of offsetPositions.entries()) {
      positions.set(idx, mapper.getPosition(offset2));
    }
    this.positions = positions;
  }
  range(start, end) {
    return Range.fromPositions(this.positions.get(start), this.positions.get(end));
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyQ29sb3JpemVyXFxnZXRCcmFja2V0UGFpcnNJblJhbmdlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2VPblJldHVybiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBCcmFja2V0UGFpckluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsQnJhY2tldFBhaXJzLmpzJztcbmltcG9ydCB7IFRva2VuSW5mbywgVG9rZW5pemVkRG9jdW1lbnQgfSBmcm9tICcuL3Rva2VuaXplci50ZXN0LmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsU2VydmljZXMsIGluc3RhbnRpYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5cbnN1aXRlKCdCcmFja2V0IFBhaXIgQ29sb3JpemVyIC0gZ2V0QnJhY2tldFBhaXJzSW5SYW5nZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVUZXh0TW9kZWxXaXRoQ29sb3JpemVkQnJhY2tldFBhaXJzKHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsIHRleHQ6IHN0cmluZyk6IFRleHRNb2RlbCB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICd0ZXN0TGFuZ3VhZ2UnO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhzdG9yZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdHN0b3JlLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7XG5cdFx0XHRpZDogbGFuZ3VhZ2VJZCxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBlbmNvZGVkTW9kZTEgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0Y29uc3QgZG9jdW1lbnQgPSBuZXcgVG9rZW5pemVkRG9jdW1lbnQoW1xuXHRcdFx0bmV3IFRva2VuSW5mbyh0ZXh0LCBlbmNvZGVkTW9kZTEsIFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyLCB0cnVlKVxuXHRcdF0pO1xuXHRcdHN0b3JlLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCBkb2N1bWVudC5nZXRUb2tlbml6YXRpb25TdXBwb3J0KCkpKTtcblxuXHRcdHN0b3JlLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsnPCcsICc+J11cblx0XHRcdF0sXG5cdFx0XHRjb2xvcml6ZWRCcmFja2V0UGFpcnM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXSxcblx0XHRcdF1cblx0XHR9KSk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gc3RvcmUuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkKSk7XG5cdFx0cmV0dXJuIHRleHRNb2RlbDtcblx0fVxuXG5cdHRlc3QoJ0Jhc2ljIDEnLCAoKSA9PiB7XG5cdFx0ZGlzcG9zZU9uUmV0dXJuKHN0b3JlID0+IHtcblx0XHRcdGNvbnN0IGRvYyA9IG5ldyBBbm5vdGF0ZWREb2N1bWVudChgeyAoIFtdIFx1MDBCOSApIFsgXHUwMEIyIHsgfSBdICgpIH0gW11gKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsV2l0aENvbG9yaXplZEJyYWNrZXRQYWlycyhzdG9yZSwgZG9jLnRleHQpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmdldExpbmVUb2tlbnMoMSkuZ2V0TGFuZ3VhZ2VJZCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vZGVsLmJyYWNrZXRQYWlyc1xuXHRcdFx0XHRcdC5nZXRCcmFja2V0UGFpcnNJblJhbmdlKGRvYy5yYW5nZSgxLCAyKSlcblx0XHRcdFx0XHQubWFwKGJyYWNrZXRQYWlyVG9KU09OKVxuXHRcdFx0XHRcdC50b0FycmF5KCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMSAtPiAxLDJdJyxcblx0XHRcdFx0XHRcdG9wZW5SYW5nZTogJ1sxLDEgLT4gMSwyXScsXG5cdFx0XHRcdFx0XHRjbG9zZVJhbmdlOiAnWzEsMjMgLT4gMSwyNF0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDEsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDMgLT4gMSw0XScsXG5cdFx0XHRcdFx0XHRvcGVuUmFuZ2U6ICdbMSwzIC0+IDEsNF0nLFxuXHRcdFx0XHRcdFx0Y2xvc2VSYW5nZTogJ1sxLDkgLT4gMSwxMF0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDEsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDExIC0+IDEsMTJdJyxcblx0XHRcdFx0XHRcdG9wZW5SYW5nZTogJ1sxLDExIC0+IDEsMTJdJyxcblx0XHRcdFx0XHRcdGNsb3NlUmFuZ2U6ICdbMSwxOCAtPiAxLDE5XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQmFzaWMgMicsICgpID0+IHtcblx0XHRkaXNwb3NlT25SZXR1cm4oc3RvcmUgPT4ge1xuXHRcdFx0Y29uc3QgZG9jID0gbmV3IEFubm90YXRlZERvY3VtZW50KGB7ICggW10gXHUwMEI5IFx1MDBCMikgWyAgeyB9IF0gKCkgfSBbXWApO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWxXaXRoQ29sb3JpemVkQnJhY2tldFBhaXJzKHN0b3JlLCBkb2MudGV4dCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtb2RlbC5icmFja2V0UGFpcnNcblx0XHRcdFx0XHQuZ2V0QnJhY2tldFBhaXJzSW5SYW5nZShkb2MucmFuZ2UoMSwgMikpXG5cdFx0XHRcdFx0Lm1hcChicmFja2V0UGFpclRvSlNPTilcblx0XHRcdFx0XHQudG9BcnJheSgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDEgLT4gMSwyXScsXG5cdFx0XHRcdFx0XHRvcGVuUmFuZ2U6ICdbMSwxIC0+IDEsMl0nLFxuXHRcdFx0XHRcdFx0Y2xvc2VSYW5nZTogJ1sxLDIzIC0+IDEsMjRdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwzIC0+IDEsNF0nLFxuXHRcdFx0XHRcdFx0b3BlblJhbmdlOiAnWzEsMyAtPiAxLDRdJyxcblx0XHRcdFx0XHRcdGNsb3NlUmFuZ2U6ICdbMSw5IC0+IDEsMTBdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCYXNpYyBFbXB0eScsICgpID0+IHtcblx0XHRkaXNwb3NlT25SZXR1cm4oc3RvcmUgPT4ge1xuXHRcdFx0Y29uc3QgZG9jID0gbmV3IEFubm90YXRlZERvY3VtZW50KGBcdTAwQjkgXHUwMEIyIHsgKCBbXSApIFsgIHsgfSBdICgpIH0gW11gKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsV2l0aENvbG9yaXplZEJyYWNrZXRQYWlycyhzdG9yZSwgZG9jLnRleHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bW9kZWwuYnJhY2tldFBhaXJzXG5cdFx0XHRcdFx0LmdldEJyYWNrZXRQYWlyc0luUmFuZ2UoZG9jLnJhbmdlKDEsIDIpKVxuXHRcdFx0XHRcdC5tYXAoYnJhY2tldFBhaXJUb0pTT04pXG5cdFx0XHRcdFx0LnRvQXJyYXkoKSxcblx0XHRcdFx0W11cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Jhc2ljIEFsbCcsICgpID0+IHtcblx0XHRkaXNwb3NlT25SZXR1cm4oc3RvcmUgPT4ge1xuXHRcdFx0Y29uc3QgZG9jID0gbmV3IEFubm90YXRlZERvY3VtZW50KGBcdTAwQjkgeyAoIFtdICkgWyAgeyB9IF0gKCkgfSBbXSBcdTAwQjJgKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsV2l0aENvbG9yaXplZEJyYWNrZXRQYWlycyhzdG9yZSwgZG9jLnRleHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bW9kZWwuYnJhY2tldFBhaXJzXG5cdFx0XHRcdFx0LmdldEJyYWNrZXRQYWlyc0luUmFuZ2UoZG9jLnJhbmdlKDEsIDIpKVxuXHRcdFx0XHRcdC5tYXAoYnJhY2tldFBhaXJUb0pTT04pXG5cdFx0XHRcdFx0LnRvQXJyYXkoKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyIC0+IDEsM10nLFxuXHRcdFx0XHRcdFx0b3BlblJhbmdlOiAnWzEsMiAtPiAxLDNdJyxcblx0XHRcdFx0XHRcdGNsb3NlUmFuZ2U6ICdbMSwyMyAtPiAxLDI0XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMSxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsNCAtPiAxLDVdJyxcblx0XHRcdFx0XHRcdG9wZW5SYW5nZTogJ1sxLDQgLT4gMSw1XScsXG5cdFx0XHRcdFx0XHRjbG9zZVJhbmdlOiAnWzEsOSAtPiAxLDEwXScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMixcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsNiAtPiAxLDddJyxcblx0XHRcdFx0XHRcdG9wZW5SYW5nZTogJ1sxLDYgLT4gMSw3XScsXG5cdFx0XHRcdFx0XHRjbG9zZVJhbmdlOiAnWzEsNyAtPiAxLDhdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxMSAtPiAxLDEyXScsXG5cdFx0XHRcdFx0XHRvcGVuUmFuZ2U6ICdbMSwxMSAtPiAxLDEyXScsXG5cdFx0XHRcdFx0XHRjbG9zZVJhbmdlOiAnWzEsMTggLT4gMSwxOV0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDIsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDE0IC0+IDEsMTVdJyxcblx0XHRcdFx0XHRcdG9wZW5SYW5nZTogJ1sxLDE0IC0+IDEsMTVdJyxcblx0XHRcdFx0XHRcdGNsb3NlUmFuZ2U6ICdbMSwxNiAtPiAxLDE3XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMSxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMjAgLT4gMSwyMV0nLFxuXHRcdFx0XHRcdFx0b3BlblJhbmdlOiAnWzEsMjAgLT4gMSwyMV0nLFxuXHRcdFx0XHRcdFx0Y2xvc2VSYW5nZTogJ1sxLDIxIC0+IDEsMjJdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyNSAtPiAxLDI2XScsXG5cdFx0XHRcdFx0XHRvcGVuUmFuZ2U6ICdbMSwyNSAtPiAxLDI2XScsXG5cdFx0XHRcdFx0XHRjbG9zZVJhbmdlOiAnWzEsMjYgLT4gMSwyN10nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEJyYWNrZXRzSW5SYW5nZScsICgpID0+IHtcblx0XHRkaXNwb3NlT25SZXR1cm4oc3RvcmUgPT4ge1xuXHRcdFx0Y29uc3QgZG9jID0gbmV3IEFubm90YXRlZERvY3VtZW50KGBcdTAwQjkgeyBbICggWyBbICggICkgXSBdICkgXSB9IHsgfSBcdTAwQjJgKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsV2l0aENvbG9yaXplZEJyYWNrZXRQYWlycyhzdG9yZSwgZG9jLnRleHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bW9kZWwuYnJhY2tldFBhaXJzXG5cdFx0XHRcdFx0LmdldEJyYWNrZXRzSW5SYW5nZShkb2MucmFuZ2UoMSwgMikpXG5cdFx0XHRcdFx0Lm1hcChiID0+ICh7IGxldmVsOiBiLm5lc3RpbmdMZXZlbCwgbGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiBiLm5lc3RpbmdMZXZlbE9mRXF1YWxCcmFja2V0VHlwZSwgcmFuZ2U6IGIucmFuZ2UudG9TdHJpbmcoKSB9KSlcblx0XHRcdFx0XHQudG9BcnJheSgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDAsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDIgLT4gMSwzXSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSw0IC0+IDEsNV0nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMixcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsNiAtPiAxLDddJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDMsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDEsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDggLT4gMSw5XSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiA0LFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAyLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxMCAtPiAxLDExXSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiA1LFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAxLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxMiAtPiAxLDEzXSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiA1LFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAxLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxNSAtPiAxLDE2XSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiA0LFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAyLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxNyAtPiAxLDE4XSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAzLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAxLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxOSAtPiAxLDIwXSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAyLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyMSAtPiAxLDIyXSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyMyAtPiAxLDI0XSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyNSAtPiAxLDI2XSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyNyAtPiAxLDI4XSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyOSAtPiAxLDMwXSdcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IEVycm9yIEJyYWNrZXRzJywgKCkgPT4ge1xuXHRcdGRpc3Bvc2VPblJldHVybihzdG9yZSA9PiB7XG5cdFx0XHRjb25zdCBkb2MgPSBuZXcgQW5ub3RhdGVkRG9jdW1lbnQoYFx1MDBCOSB7ICgpIF0gXHUwMEIyIGApO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWxXaXRoQ29sb3JpemVkQnJhY2tldFBhaXJzKHN0b3JlLCBkb2MudGV4dCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtb2RlbC5icmFja2V0UGFpcnNcblx0XHRcdFx0XHQuZ2V0QnJhY2tldHNJblJhbmdlKGRvYy5yYW5nZSgxLCAyKSlcblx0XHRcdFx0XHQubWFwKGIgPT4gKHsgbGV2ZWw6IGIubmVzdGluZ0xldmVsLCByYW5nZTogYi5yYW5nZS50b1N0cmluZygpLCBpc0ludmFsaWQ6IGIuaXNJbnZhbGlkIH0pKVxuXHRcdFx0XHRcdC50b0FycmF5KCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMCxcblx0XHRcdFx0XHRcdGlzSW52YWxpZDogdHJ1ZSxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMiAtPiAxLDNdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0aXNJbnZhbGlkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsNCAtPiAxLDVdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0aXNJbnZhbGlkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsNSAtPiAxLDZdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0aXNJbnZhbGlkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSw3IC0+IDEsOF0nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ2NvbG9yaXplZEJyYWNrZXRzVlNCcmFja2V0cycsICgpID0+IHtcblx0XHRkaXNwb3NlT25SZXR1cm4oc3RvcmUgPT4ge1xuXHRcdFx0Y29uc3QgZG9jID0gbmV3IEFubm90YXRlZERvY3VtZW50KGBcdTAwQjkge30gWzwoKT5dIDx7Pn0gXHUwMEIyYCk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbFdpdGhDb2xvcml6ZWRCcmFja2V0UGFpcnMoc3RvcmUsIGRvYy50ZXh0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vZGVsLmJyYWNrZXRQYWlyc1xuXHRcdFx0XHRcdC5nZXRCcmFja2V0c0luUmFuZ2UoZG9jLnJhbmdlKDEsIDIpLCB0cnVlKVxuXHRcdFx0XHRcdC5tYXAoYiA9PiAoeyBsZXZlbDogYi5uZXN0aW5nTGV2ZWwsIGxldmVsRXF1YWxCcmFja2V0VHlwZTogYi5uZXN0aW5nTGV2ZWxPZkVxdWFsQnJhY2tldFR5cGUsIHJhbmdlOiBiLnJhbmdlLnRvU3RyaW5nKCkgfSkpXG5cdFx0XHRcdFx0LnRvQXJyYXkoKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwyIC0+IDEsM10nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDAsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDMgLT4gMSw0XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMCxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsNSAtPiAxLDZdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSw3IC0+IDEsOF0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDEsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDggLT4gMSw5XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMCxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMTAgLT4gMSwxMV0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDAsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDEzIC0+IDEsMTRdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAtMSxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMTUgLT4gMSwxNl0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1vZGVsLmJyYWNrZXRQYWlyc1xuXHRcdFx0XHRcdC5nZXRCcmFja2V0c0luUmFuZ2UoZG9jLnJhbmdlKDEsIDIpLCBmYWxzZSlcblx0XHRcdFx0XHQubWFwKGIgPT4gKHsgbGV2ZWw6IGIubmVzdGluZ0xldmVsLCBsZXZlbEVxdWFsQnJhY2tldFR5cGU6IGIubmVzdGluZ0xldmVsT2ZFcXVhbEJyYWNrZXRUeXBlLCByYW5nZTogYi5yYW5nZS50b1N0cmluZygpIH0pKVxuXHRcdFx0XHRcdC50b0FycmF5KCksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMCxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMiAtPiAxLDNdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAwLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwzIC0+IDEsNF0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDAsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDUgLT4gMSw2XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMSxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsNiAtPiAxLDddJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAyLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSw3IC0+IDEsOF0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDIsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDggLT4gMSw5XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMSxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsOSAtPiAxLDEwXScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMCxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMTAgLT4gMSwxMV0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IDAsXG5cdFx0XHRcdFx0XHRsZXZlbEVxdWFsQnJhY2tldFR5cGU6IDAsXG5cdFx0XHRcdFx0XHRyYW5nZTogJ1sxLDEyIC0+IDEsMTNdJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxldmVsOiAxLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxMyAtPiAxLDE0XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsZXZlbDogMCxcblx0XHRcdFx0XHRcdGxldmVsRXF1YWxCcmFja2V0VHlwZTogMCxcblx0XHRcdFx0XHRcdHJhbmdlOiAnWzEsMTQgLT4gMSwxNV0nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGV2ZWw6IC0xLFxuXHRcdFx0XHRcdFx0bGV2ZWxFcXVhbEJyYWNrZXRUeXBlOiAwLFxuXHRcdFx0XHRcdFx0cmFuZ2U6ICdbMSwxNSAtPiAxLDE2XScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gYnJhY2tldFBhaXJUb0pTT04ocGFpcjogQnJhY2tldFBhaXJJbmZvKTogdW5rbm93biB7XG5cdHJldHVybiB7XG5cdFx0bGV2ZWw6IHBhaXIubmVzdGluZ0xldmVsLFxuXHRcdHJhbmdlOiBwYWlyLm9wZW5pbmdCcmFja2V0UmFuZ2UudG9TdHJpbmcoKSxcblx0XHRvcGVuUmFuZ2U6IHBhaXIub3BlbmluZ0JyYWNrZXRSYW5nZS50b1N0cmluZygpLFxuXHRcdGNsb3NlUmFuZ2U6IHBhaXIuY2xvc2luZ0JyYWNrZXRSYW5nZT8udG9TdHJpbmcoKSB8fCBudWxsLFxuXHR9O1xufVxuXG5jbGFzcyBQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyIHtcblx0cHJpdmF0ZSByZWFkb25seSBsaW5lU3RhcnRPZmZzZXRCeUxpbmVJZHg6IG51bWJlcltdO1xuXG5cdGNvbnN0cnVjdG9yKHRleHQ6IHN0cmluZykge1xuXHRcdHRoaXMubGluZVN0YXJ0T2Zmc2V0QnlMaW5lSWR4ID0gW107XG5cdFx0dGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHgucHVzaCgwKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRleHQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0ZXh0LmNoYXJBdChpKSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0dGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHgucHVzaChpICsgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0T2Zmc2V0KHBvc2l0aW9uOiBQb3NpdGlvbik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMubGluZVN0YXJ0T2Zmc2V0QnlMaW5lSWR4W3Bvc2l0aW9uLmxpbmVOdW1iZXIgLSAxXSArIHBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdH1cblxuXHRnZXRQb3NpdGlvbihvZmZzZXQ6IG51bWJlcik6IFBvc2l0aW9uIHtcblx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5saW5lU3RhcnRPZmZzZXRCeUxpbmVJZHguZmluZEluZGV4KGxpbmVTdGFydE9mZnNldCA9PiBsaW5lU3RhcnRPZmZzZXQgPD0gb2Zmc2V0KTtcblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIgKyAxLCBvZmZzZXQgLSB0aGlzLmxpbmVTdGFydE9mZnNldEJ5TGluZUlkeFtsaW5lTnVtYmVyXSArIDEpO1xuXHR9XG59XG5cbmNsYXNzIEFubm90YXRlZERvY3VtZW50IHtcblx0cHVibGljIHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBwb3NpdGlvbnM6IFJlYWRvbmx5TWFwPG51bWJlciwgUG9zaXRpb24+O1xuXG5cdGNvbnN0cnVjdG9yKHNyYzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgbnVtYmVycyA9IFsnXHUyMDcwJywgJ1x1MDBCOScsICdcdTAwQjInLCAnXHUwMEIzJywgJ1x1MjA3NCcsICdcdTIwNzUnLCAnXHUyMDc2JywgJ1x1MjA3NycsICdcdTIwNzgnLCAnXHUyMDc5J107XG5cblx0XHRsZXQgdGV4dCA9ICcnO1xuXHRcdGNvbnN0IG9mZnNldFBvc2l0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBudW1iZXI+KCk7XG5cblx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHNyYy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaWR4ID0gbnVtYmVycy5pbmRleE9mKHNyY1tpXSk7XG5cdFx0XHRpZiAoaWR4ID49IDApIHtcblx0XHRcdFx0b2Zmc2V0UG9zaXRpb25zLnNldChpZHgsIG9mZnNldCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0ZXh0ICs9IHNyY1tpXTtcblx0XHRcdFx0b2Zmc2V0Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy50ZXh0ID0gdGV4dDtcblxuXHRcdGNvbnN0IG1hcHBlciA9IG5ldyBQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyKHRoaXMudGV4dCk7XG5cdFx0Y29uc3QgcG9zaXRpb25zID0gbmV3IE1hcDxudW1iZXIsIFBvc2l0aW9uPigpO1xuXHRcdGZvciAoY29uc3QgW2lkeCwgb2Zmc2V0XSBvZiBvZmZzZXRQb3NpdGlvbnMuZW50cmllcygpKSB7XG5cdFx0XHRwb3NpdGlvbnMuc2V0KGlkeCwgbWFwcGVyLmdldFBvc2l0aW9uKG9mZnNldCkpO1xuXHRcdH1cblx0XHR0aGlzLnBvc2l0aW9ucyA9IHBvc2l0aW9ucztcblx0fVxuXG5cdHJhbmdlKHN0YXJ0OiBudW1iZXIsIGVuZDogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdHJldHVybiBSYW5nZS5mcm9tUG9zaXRpb25zKHRoaXMucG9zaXRpb25zLmdldChzdGFydCkhLCB0aGlzLnBvc2l0aW9ucy5nZXQoZW5kKSEpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBMEIsdUJBQXVCO0FBQ2pELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFDQUFxQztBQUc5QyxTQUFTLFdBQVcseUJBQXlCO0FBQzdDLFNBQVMscUJBQXFCLDRCQUE0QjtBQUUxRCxNQUFNLG1EQUFtRCxNQUFNO0FBRTlELDBDQUF3QztBQUV4QyxXQUFTLHlDQUF5QyxPQUF3QixNQUF5QjtBQUNsRyxVQUFNLGFBQWE7QUFDbkIsVUFBTSx1QkFBdUIsb0JBQW9CLEtBQUs7QUFDdEQsVUFBTSwrQkFBK0IscUJBQXFCLElBQUksNkJBQTZCO0FBQzNGLFVBQU0sa0JBQWtCLHFCQUFxQixJQUFJLGdCQUFnQjtBQUNqRSxVQUFNLElBQUksZ0JBQWdCLGlCQUFpQjtBQUFBLE1BQzFDLElBQUk7QUFBQSxJQUNMLENBQUMsQ0FBQztBQUVGLFVBQU0sZUFBZSxnQkFBZ0IsZ0JBQWdCLGlCQUFpQixVQUFVO0FBQ2hGLFVBQU0sV0FBVyxJQUFJLGtCQUFrQjtBQUFBLE1BQ3RDLElBQUksVUFBVSxNQUFNLGNBQWMsa0JBQWtCLE9BQU8sSUFBSTtBQUFBLElBQ2hFLENBQUM7QUFDRCxVQUFNLElBQUkscUJBQXFCLFNBQVMsWUFBWSxTQUFTLHVCQUF1QixDQUFDLENBQUM7QUFFdEYsVUFBTSxJQUFJLDZCQUE2QixTQUFTLFlBQVk7QUFBQSxNQUMzRCxVQUFVO0FBQUEsUUFDVCxDQUFDLEtBQUssR0FBRztBQUFBLE1BQ1Y7QUFBQSxNQUNBLHVCQUF1QjtBQUFBLFFBQ3RCLENBQUMs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
