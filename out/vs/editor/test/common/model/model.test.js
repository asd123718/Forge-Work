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
import assert from "assert";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { InternalModelContentChangeEvent, ModelRawContentChangedEvent, ModelRawFlush, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from "../../../common/textModelEvents.js";
import { createModelServices, createTextModel, instantiateTextModel } from "../testTextModel.js";
import { mock } from "../../../../base/test/common/mock.js";
const LINE1 = "My First Line";
const LINE2 = "		My Second Line";
const LINE3 = "    Third Line";
const LINE4 = "";
const LINE5 = "1";
suite("Editor Model - Model", () => {
  let thisModel;
  setup(() => {
    const text = LINE1 + "\r\n" + LINE2 + "\n" + LINE3 + "\n" + LINE4 + "\r\n" + LINE5;
    thisModel = createTextModel(text);
  });
  teardown(() => {
    thisModel.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("model getValue", () => {
    assert.strictEqual(thisModel.getValue(), "My First Line\n		My Second Line\n    Third Line\n\n1");
  });
  test("model insert empty text", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "")]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "My First Line");
  });
  test("model insert text without newline 1", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "foo ")]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "foo My First Line");
  });
  test("model insert text without newline 2", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " foo")]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "My foo First Line");
  });
  test("model insert text with one newline", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " new line\nNo longer")]);
    assert.strictEqual(thisModel.getLineCount(), 6);
    assert.strictEqual(thisModel.getLineContent(1), "My new line");
    assert.strictEqual(thisModel.getLineContent(2), "No longer First Line");
  });
  test("model insert text with two newlines", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " new line\nOne more line in the middle\nNo longer")]);
    assert.strictEqual(thisModel.getLineCount(), 7);
    assert.strictEqual(thisModel.getLineContent(1), "My new line");
    assert.strictEqual(thisModel.getLineContent(2), "One more line in the middle");
    assert.strictEqual(thisModel.getLineContent(3), "No longer First Line");
  });
  test("model insert text with many newlines", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 3), "\n\n\n\n")]);
    assert.strictEqual(thisModel.getLineCount(), 9);
    assert.strictEqual(thisModel.getLineContent(1), "My");
    assert.strictEqual(thisModel.getLineContent(2), "");
    assert.strictEqual(thisModel.getLineContent(3), "");
    assert.strictEqual(thisModel.getLineContent(4), "");
    assert.strictEqual(thisModel.getLineContent(5), " First Line");
  });
  function withEventCapturing(callback) {
    let e = null;
    const spyViewModel = new class extends mock() {
      onDidChangeContentOrInjectedText(_e) {
        if (e !== null || !(_e instanceof InternalModelContentChangeEvent)) {
          assert.fail("Unexpected assertion error");
        }
        e = _e.rawContentChangedEvent;
      }
      emitContentChangeEvent(e2) {
      }
    }();
    thisModel.registerViewModel(spyViewModel);
    callback();
    thisModel.unregisterViewModel(spyViewModel);
    return e;
  }
  test("model insert empty text does not trigger eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "")]);
    });
    assert.deepStrictEqual(e, null, "was not expecting event");
  });
  test("model insert text without newline eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "foo ")]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model insert text with one newline eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.insert(new Position(1, 3), " new line\nNo longer")]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1),
        new ModelRawLinesInserted(2, 2, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete empty text", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "My First Line");
  });
  test("model delete text from one line", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "y First Line");
  });
  test("model delete text from one line 2", () => {
    thisModel.applyEdits([EditOperation.insert(new Position(1, 1), "a")]);
    assert.strictEqual(thisModel.getLineContent(1), "aMy First Line");
    thisModel.applyEdits([EditOperation.delete(new Range(1, 2, 1, 4))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "a First Line");
  });
  test("model delete all text from a line", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
    assert.strictEqual(thisModel.getLineCount(), 5);
    assert.strictEqual(thisModel.getLineContent(1), "");
  });
  test("model delete text from two lines", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
    assert.strictEqual(thisModel.getLineCount(), 4);
    assert.strictEqual(thisModel.getLineContent(1), "My Second Line");
  });
  test("model delete text from many lines", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);
    assert.strictEqual(thisModel.getLineCount(), 3);
    assert.strictEqual(thisModel.getLineContent(1), "My Third Line");
  });
  test("model delete everything", () => {
    thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 5, 2))]);
    assert.strictEqual(thisModel.getLineCount(), 1);
    assert.strictEqual(thisModel.getLineContent(1), "");
  });
  test("model delete empty text does not trigger eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 1))]);
    });
    assert.deepStrictEqual(e, null, "was not expecting event");
  });
  test("model delete text from one line eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 2))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete all text from a line eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 1, 1, 14))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete text from two lines eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 2, 6))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1),
        new ModelRawLinesDeleted(2, 2, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("model delete text from many lines eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.applyEdits([EditOperation.delete(new Range(1, 4, 3, 5))]);
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawLineChanged(1, 1),
        new ModelRawLinesDeleted(2, 3, 1)
      ],
      2,
      false,
      false
    ));
  });
  test("getValueInRange", () => {
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 1)), "");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 2)), "M");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 2, 1, 3)), "y");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 1, 14)), "My First Line");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 1)), "My First Line\n");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 2)), "My First Line\n	");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 3)), "My First Line\n		");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 2, 17)), "My First Line\n		My Second Line");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 3, 1)), "My First Line\n		My Second Line\n");
    assert.strictEqual(thisModel.getValueInRange(new Range(1, 1, 4, 1)), "My First Line\n		My Second Line\n    Third Line\n");
  });
  test("getValueLengthInRange", () => {
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 1)), "".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 2)), "M".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 2, 1, 3)), "y".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 1, 14)), "My First Line".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 1)), "My First Line\n".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 2)), "My First Line\n	".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 3)), "My First Line\n		".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 2, 17)), "My First Line\n		My Second Line".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 3, 1)), "My First Line\n		My Second Line\n".length);
    assert.strictEqual(thisModel.getValueLengthInRange(new Range(1, 1, 4, 1)), "My First Line\n		My Second Line\n    Third Line\n".length);
  });
  test("setValue eventing", () => {
    const e = withEventCapturing(() => {
      thisModel.setValue("new value");
    });
    assert.deepStrictEqual(e, new ModelRawContentChangedEvent(
      [
        new ModelRawFlush()
      ],
      2,
      false,
      false
    ));
  });
  test("issue #46342: Maintain edit operation order in applyEdits", () => {
    const res = thisModel.applyEdits([
      { range: new Range(2, 1, 2, 1), text: "a" },
      { range: new Range(1, 1, 1, 1), text: "b" }
    ], true);
    assert.deepStrictEqual(res[0].range, new Range(2, 1, 2, 2));
    assert.deepStrictEqual(res[1].range, new Range(1, 1, 1, 2));
  });
});
suite("Editor Model - Model Line Separators", () => {
  let thisModel;
  setup(() => {
    const text = LINE1 + "\u2028" + LINE2 + "\n" + LINE3 + "\u2028" + LINE4 + "\r\n" + LINE5;
    thisModel = createTextModel(text);
  });
  teardown(() => {
    thisModel.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("model getValue", () => {
    assert.strictEqual(thisModel.getValue(), "My First Line\u2028		My Second Line\n    Third Line\u2028\n1");
  });
  test("model lines", () => {
    assert.strictEqual(thisModel.getLineCount(), 3);
  });
  test("Bug 13333:Model should line break on lonely CR too", () => {
    const model = createTextModel("Hello\rWorld!\r\nAnother line");
    assert.strictEqual(model.getLineCount(), 3);
    assert.strictEqual(model.getValue(), "Hello\r\nWorld!\r\nAnother line");
    model.dispose();
  });
});
suite("Editor Model - Words", () => {
  const OUTER_LANGUAGE_ID = "outerMode";
  const INNER_LANGUAGE_ID = "innerMode";
  let OuterMode = class extends Disposable {
    constructor(languageService, languageConfigurationService) {
      super();
      this.languageId = OUTER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {}));
      const languageIdCodec = languageService.languageIdCodec;
      this._register(TokenizationRegistry.register(this.languageId, {
        getInitialState: () => NullState,
        tokenize: void 0,
        tokenizeEncoded: (line, hasEOL, state) => {
          const tokensArr = [];
          let prevLanguageId = void 0;
          for (let i = 0; i < line.length; i++) {
            const languageId = line.charAt(i) === "x" ? INNER_LANGUAGE_ID : OUTER_LANGUAGE_ID;
            const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);
            if (prevLanguageId !== languageId) {
              tokensArr.push(i);
              tokensArr.push(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET);
            }
            prevLanguageId = languageId;
          }
          const tokens = new Uint32Array(tokensArr.length);
          for (let i = 0; i < tokens.length; i++) {
            tokens[i] = tokensArr[i];
          }
          return new EncodedTokenizationResult(tokens, [], state);
        }
      }));
    }
  };
  OuterMode = __decorateClass([
    __decorateParam(0, ILanguageService),
    __decorateParam(1, ILanguageConfigurationService)
  ], OuterMode);
  let InnerMode = class extends Disposable {
    constructor(languageService, languageConfigurationService) {
      super();
      this.languageId = INNER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {}));
    }
  };
  InnerMode = __decorateClass([
    __decorateParam(0, ILanguageService),
    __decorateParam(1, ILanguageConfigurationService)
  ], InnerMode);
  let disposables = [];
  setup(() => {
    disposables = [];
  });
  teardown(() => {
    dispose(disposables);
    disposables = [];
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Get word at position", () => {
    const text = ["This text has some  words. "];
    const thisModel = createTextModel(text.join("\n"));
    disposables.push(thisModel);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 1)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 2)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 4)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 5)), { word: "This", startColumn: 1, endColumn: 5 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 6)), { word: "text", startColumn: 6, endColumn: 10 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 19)), { word: "some", startColumn: 15, endColumn: 19 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 20)), null);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 21)), { word: "words", startColumn: 21, endColumn: 26 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 26)), { word: "words", startColumn: 21, endColumn: 26 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 27)), null);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 28)), null);
  });
  test("getWordAtPosition at embedded language boundaries", () => {
    const disposables2 = new DisposableStore();
    const instantiationService = createModelServices(disposables2);
    const outerMode = disposables2.add(instantiationService.createInstance(OuterMode));
    disposables2.add(instantiationService.createInstance(InnerMode));
    const model = disposables2.add(instantiateTextModel(instantiationService, "ab<xx>ab<x>", outerMode.languageId));
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 1)), { word: "ab", startColumn: 1, endColumn: 3 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 2)), { word: "ab", startColumn: 1, endColumn: 3 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 3)), { word: "ab", startColumn: 1, endColumn: 3 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 4)), { word: "xx", startColumn: 4, endColumn: 6 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 5)), { word: "xx", startColumn: 4, endColumn: 6 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 6)), { word: "xx", startColumn: 4, endColumn: 6 });
    assert.deepStrictEqual(model.getWordAtPosition(new Position(1, 7)), { word: "ab", startColumn: 7, endColumn: 9 });
    disposables2.dispose();
  });
  test("issue #61296: VS code freezes when editing CSS file with emoji", () => {
    const MODE_ID = "testMode";
    const disposables2 = new DisposableStore();
    const instantiationService = createModelServices(disposables2);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    disposables2.add(languageService.registerLanguage({ id: MODE_ID }));
    disposables2.add(languageConfigurationService.register(MODE_ID, {
      wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g
    }));
    const thisModel = disposables2.add(instantiateTextModel(instantiationService, ".\u{1F437}-a-b", MODE_ID));
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 1)), { word: ".", startColumn: 1, endColumn: 2 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 2)), { word: ".", startColumn: 1, endColumn: 2 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 3)), null);
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 4)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 5)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 6)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 7)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    assert.deepStrictEqual(thisModel.getWordAtPosition(new Position(1, 8)), { word: "-a-b", startColumn: 4, endColumn: 8 });
    disposables2.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXG1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0LCBJU3RhdGUsIFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50LCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCwgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50LCBNb2RlbFJhd0ZsdXNoLCBNb2RlbFJhd0xpbmVDaGFuZ2VkLCBNb2RlbFJhd0xpbmVzRGVsZXRlZCwgTW9kZWxSYXdMaW5lc0luc2VydGVkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2RlbFNlcnZpY2VzLCBjcmVhdGVUZXh0TW9kZWwsIGluc3RhbnRpYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsLmpzJztcblxuLy8gLS0tLS0tLS0tIHV0aWxzXG5cbmNvbnN0IExJTkUxID0gJ015IEZpcnN0IExpbmUnO1xuY29uc3QgTElORTIgPSAnXFx0XFx0TXkgU2Vjb25kIExpbmUnO1xuY29uc3QgTElORTMgPSAnICAgIFRoaXJkIExpbmUnO1xuY29uc3QgTElORTQgPSAnJztcbmNvbnN0IExJTkU1ID0gJzEnO1xuXG5zdWl0ZSgnRWRpdG9yIE1vZGVsIC0gTW9kZWwnLCAoKSA9PiB7XG5cblx0bGV0IHRoaXNNb2RlbDogVGV4dE1vZGVsO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID1cblx0XHRcdExJTkUxICsgJ1xcclxcbicgK1xuXHRcdFx0TElORTIgKyAnXFxuJyArXG5cdFx0XHRMSU5FMyArICdcXG4nICtcblx0XHRcdExJTkU0ICsgJ1xcclxcbicgK1xuXHRcdFx0TElORTU7XG5cdFx0dGhpc01vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRleHQpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLS0tLS0tIGluc2VydCB0ZXh0XG5cblx0dGVzdCgnbW9kZWwgZ2V0VmFsdWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZSgpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdE15IFNlY29uZCBMaW5lXFxuICAgIFRoaXJkIExpbmVcXG5cXG4xJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGluc2VydCBlbXB0eSB0ZXh0JywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICcnKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdNeSBGaXJzdCBMaW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGluc2VydCB0ZXh0IHdpdGhvdXQgbmV3bGluZSAxJywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICdmb28gJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnZm9vIE15IEZpcnN0IExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgaW5zZXJ0IHRleHQgd2l0aG91dCBuZXdsaW5lIDInLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAzKSwgJyBmb28nKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdNeSBmb28gRmlyc3QgTGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBpbnNlcnQgdGV4dCB3aXRoIG9uZSBuZXdsaW5lJywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMyksICcgbmV3IGxpbmVcXG5ObyBsb25nZXInKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDYpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdNeSBuZXcgbGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdObyBsb25nZXIgRmlyc3QgTGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBpbnNlcnQgdGV4dCB3aXRoIHR3byBuZXdsaW5lcycsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDMpLCAnIG5ldyBsaW5lXFxuT25lIG1vcmUgbGluZSBpbiB0aGUgbWlkZGxlXFxuTm8gbG9uZ2VyJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA3KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnTXkgbmV3IGxpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDIpLCAnT25lIG1vcmUgbGluZSBpbiB0aGUgbWlkZGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ05vIGxvbmdlciBGaXJzdCBMaW5lJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGluc2VydCB0ZXh0IHdpdGggbWFueSBuZXdsaW5lcycsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDMpLCAnXFxuXFxuXFxuXFxuJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCA5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnTXknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDIpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDUpLCAnIEZpcnN0IExpbmUnKTtcblx0fSk7XG5cblxuXHQvLyAtLS0tLS0tLS0gaW5zZXJ0IHRleHQgZXZlbnRpbmdcblxuXHRmdW5jdGlvbiB3aXRoRXZlbnRDYXB0dXJpbmcoY2FsbGJhY2s6ICgpID0+IHZvaWQpOiBNb2RlbFJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQgfCBudWxsIHtcblx0XHRsZXQgZTogTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50IHwgbnVsbCA9IG51bGw7XG5cdFx0Y29uc3Qgc3B5Vmlld01vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld01vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlQ29udGVudE9ySW5qZWN0ZWRUZXh0KF9lOiBJbnRlcm5hbE1vZGVsQ29udGVudENoYW5nZUV2ZW50IHwgTW9kZWxJbmplY3RlZFRleHRDaGFuZ2VkRXZlbnQpIHtcblx0XHRcdFx0aWYgKGUgIT09IG51bGwgfHwgIShfZSBpbnN0YW5jZW9mIEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQpKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LmZhaWwoJ1VuZXhwZWN0ZWQgYXNzZXJ0aW9uIGVycm9yJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZSA9IF9lLnJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBlbWl0Q29udGVudENoYW5nZUV2ZW50KGU6IEludGVybmFsTW9kZWxDb250ZW50Q2hhbmdlRXZlbnQgfCBNb2RlbEluamVjdGVkVGV4dENoYW5nZWRFdmVudCk6IHZvaWQgeyB9XG5cdFx0fTtcblx0XHR0aGlzTW9kZWwucmVnaXN0ZXJWaWV3TW9kZWwoc3B5Vmlld01vZGVsKTtcblx0XHRjYWxsYmFjaygpO1xuXHRcdHRoaXNNb2RlbC51bnJlZ2lzdGVyVmlld01vZGVsKHNweVZpZXdNb2RlbCk7XG5cdFx0cmV0dXJuIGU7XG5cdH1cblxuXHR0ZXN0KCdtb2RlbCBpbnNlcnQgZW1wdHkgdGV4dCBkb2VzIG5vdCB0cmlnZ2VyIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGUgPSB3aXRoRXZlbnRDYXB0dXJpbmcoKCkgPT4ge1xuXHRcdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAxKSwgJycpXSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLCBudWxsLCAnd2FzIG5vdCBleHBlY3RpbmcgZXZlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgaW5zZXJ0IHRleHQgd2l0aG91dCBuZXdsaW5lIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGUgPSB3aXRoRXZlbnRDYXB0dXJpbmcoKCkgPT4ge1xuXHRcdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAxKSwgJ2ZvbyAnKV0pO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZSwgbmV3IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFtcblx0XHRcdFx0bmV3IE1vZGVsUmF3TGluZUNoYW5nZWQoMSwgMSlcblx0XHRcdF0sXG5cdFx0XHQyLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBpbnNlcnQgdGV4dCB3aXRoIG9uZSBuZXdsaW5lIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGUgPSB3aXRoRXZlbnRDYXB0dXJpbmcoKCkgPT4ge1xuXHRcdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uaW5zZXJ0KG5ldyBQb3NpdGlvbigxLCAzKSwgJyBuZXcgbGluZVxcbk5vIGxvbmdlcicpXSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLCBuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lQ2hhbmdlZCgxLCAxKSxcblx0XHRcdFx0bmV3IE1vZGVsUmF3TGluZXNJbnNlcnRlZCgyLCAyLCAxKSxcblx0XHRcdF0sXG5cdFx0XHQyLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZVxuXHRcdCkpO1xuXHR9KTtcblxuXG5cdC8vIC0tLS0tLS0tLSBkZWxldGUgdGV4dFxuXG5cdHRlc3QoJ21vZGVsIGRlbGV0ZSBlbXB0eSB0ZXh0JywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ015IEZpcnN0IExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIHRleHQgZnJvbSBvbmUgbGluZScsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDEsIDEsIDIpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd5IEZpcnN0IExpbmUnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIHRleHQgZnJvbSBvbmUgbGluZSAyJywgKCkgPT4ge1xuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMSwgMSksICdhJyldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnYU15IEZpcnN0IExpbmUnKTtcblxuXHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2EgRmlyc3QgTGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkZWxldGUgYWxsIHRleHQgZnJvbSBhIGxpbmUnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAxLCAxNCkpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkZWxldGUgdGV4dCBmcm9tIHR3byBsaW5lcycsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDQsIDIsIDYpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdNeSBTZWNvbmQgTGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkZWxldGUgdGV4dCBmcm9tIG1hbnkgbGluZXMnLCAoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCA0LCAzLCA1KSldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb3VudCgpLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldExpbmVDb250ZW50KDEpLCAnTXkgVGhpcmQgTGluZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkZWxldGUgZXZlcnl0aGluZycsICgpID0+IHtcblx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDEsIDUsIDIpKV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcnKTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIGRlbGV0ZSB0ZXh0IGV2ZW50aW5nXG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIGVtcHR5IHRleHQgZG9lcyBub3QgdHJpZ2dlciBldmVudGluZycsICgpID0+IHtcblx0XHRjb25zdCBlID0gd2l0aEV2ZW50Q2FwdHVyaW5nKCgpID0+IHtcblx0XHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpXSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLCBudWxsLCAnd2FzIG5vdCBleHBlY3RpbmcgZXZlbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIHRleHQgZnJvbSBvbmUgbGluZSBldmVudGluZycsICgpID0+IHtcblx0XHRjb25zdCBlID0gd2l0aEV2ZW50Q2FwdHVyaW5nKCgpID0+IHtcblx0XHRcdHRoaXNNb2RlbC5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMSwgMSwgMSwgMikpXSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLCBuZXcgTW9kZWxSYXdDb250ZW50Q2hhbmdlZEV2ZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lQ2hhbmdlZCgxLCAxKSxcblx0XHRcdF0sXG5cdFx0XHQyLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRmYWxzZVxuXHRcdCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2RlbCBkZWxldGUgYWxsIHRleHQgZnJvbSBhIGxpbmUgZXZlbnRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZSA9IHdpdGhFdmVudENhcHR1cmluZygoKSA9PiB7XG5cdFx0XHR0aGlzTW9kZWwuYXBwbHlFZGl0cyhbRWRpdE9wZXJhdGlvbi5kZWxldGUobmV3IFJhbmdlKDEsIDEsIDEsIDE0KSldKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUsIG5ldyBNb2RlbFJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQoXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBNb2RlbFJhd0xpbmVDaGFuZ2VkKDEsIDEpLFxuXHRcdFx0XSxcblx0XHRcdDIsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGVsIGRlbGV0ZSB0ZXh0IGZyb20gdHdvIGxpbmVzIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGUgPSB3aXRoRXZlbnRDYXB0dXJpbmcoKCkgPT4ge1xuXHRcdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCA0LCAyLCA2KSldKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUsIG5ldyBNb2RlbFJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQoXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBNb2RlbFJhd0xpbmVDaGFuZ2VkKDEsIDEpLFxuXHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lc0RlbGV0ZWQoMiwgMiwgMSksXG5cdFx0XHRdLFxuXHRcdFx0Mixcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2Vcblx0XHQpKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGVsZXRlIHRleHQgZnJvbSBtYW55IGxpbmVzIGV2ZW50aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGUgPSB3aXRoRXZlbnRDYXB0dXJpbmcoKCkgPT4ge1xuXHRcdFx0dGhpc01vZGVsLmFwcGx5RWRpdHMoW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCA0LCAzLCA1KSldKTtcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUsIG5ldyBNb2RlbFJhd0NvbnRlbnRDaGFuZ2VkRXZlbnQoXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBNb2RlbFJhd0xpbmVDaGFuZ2VkKDEsIDEpLFxuXHRcdFx0XHRuZXcgTW9kZWxSYXdMaW5lc0RlbGV0ZWQoMiwgMywgMSksXG5cdFx0XHRdLFxuXHRcdFx0Mixcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2Vcblx0XHQpKTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIGdldFZhbHVlSW5SYW5nZVxuXG5cdHRlc3QoJ2dldFZhbHVlSW5SYW5nZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDIpKSwgJ00nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgMykpLCAneScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxNCkpLCAnTXkgRmlyc3QgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxKSksICdNeSBGaXJzdCBMaW5lXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDIsIDIpKSwgJ015IEZpcnN0IExpbmVcXG5cXHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMykpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxNykpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdE15IFNlY29uZCBMaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDMsIDEpKSwgJ015IEZpcnN0IExpbmVcXG5cXHRcXHRNeSBTZWNvbmQgTGluZVxcbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCA0LCAxKSksICdNeSBGaXJzdCBMaW5lXFxuXFx0XFx0TXkgU2Vjb25kIExpbmVcXG4gICAgVGhpcmQgTGluZVxcbicpO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gZ2V0VmFsdWVMZW5ndGhJblJhbmdlXG5cblx0dGVzdCgnZ2V0VmFsdWVMZW5ndGhJblJhbmdlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxKSksICcnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDIpKSwgJ00nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDMpKSwgJ3knLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDE0KSksICdNeSBGaXJzdCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxKSksICdNeSBGaXJzdCBMaW5lXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAyKSksICdNeSBGaXJzdCBMaW5lXFxuXFx0Jy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAzKSksICdNeSBGaXJzdCBMaW5lXFxuXFx0XFx0Jy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxNykpLCAnTXkgRmlyc3QgTGluZVxcblxcdFxcdE15IFNlY29uZCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAzLCAxKSksICdNeSBGaXJzdCBMaW5lXFxuXFx0XFx0TXkgU2Vjb25kIExpbmVcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDQsIDEpKSwgJ015IEZpcnN0IExpbmVcXG5cXHRcXHRNeSBTZWNvbmQgTGluZVxcbiAgICBUaGlyZCBMaW5lXFxuJy5sZW5ndGgpO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gc2V0VmFsdWVcblx0dGVzdCgnc2V0VmFsdWUgZXZlbnRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZSA9IHdpdGhFdmVudENhcHR1cmluZygoKSA9PiB7XG5cdFx0XHR0aGlzTW9kZWwuc2V0VmFsdWUoJ25ldyB2YWx1ZScpO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZSwgbmV3IE1vZGVsUmF3Q29udGVudENoYW5nZWRFdmVudChcblx0XHRcdFtcblx0XHRcdFx0bmV3IE1vZGVsUmF3Rmx1c2goKVxuXHRcdFx0XSxcblx0XHRcdDIsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NjM0MjogTWFpbnRhaW4gZWRpdCBvcGVyYXRpb24gb3JkZXIgaW4gYXBwbHlFZGl0cycsICgpID0+IHtcblx0XHRjb25zdCByZXMgPSB0aGlzTW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMiwgMSwgMiwgMSksIHRleHQ6ICdhJyB9LFxuXHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnYicgfSxcblx0XHRdLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzWzBdLnJhbmdlLCBuZXcgUmFuZ2UoMiwgMSwgMiwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzWzFdLnJhbmdlLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMikpO1xuXHR9KTtcbn0pO1xuXG5cbi8vIC0tLS0tLS0tLSBTcGVjaWFsIFVuaWNvZGUgTElORSBTRVBBUkFUT1IgY2hhcmFjdGVyXG5zdWl0ZSgnRWRpdG9yIE1vZGVsIC0gTW9kZWwgTGluZSBTZXBhcmF0b3JzJywgKCkgPT4ge1xuXG5cdGxldCB0aGlzTW9kZWw6IFRleHRNb2RlbDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9XG5cdFx0XHRMSU5FMSArICdcXHUyMDI4JyArXG5cdFx0XHRMSU5FMiArICdcXG4nICtcblx0XHRcdExJTkUzICsgJ1xcdTIwMjgnICtcblx0XHRcdExJTkU0ICsgJ1xcclxcbicgK1xuXHRcdFx0TElORTU7XG5cdFx0dGhpc01vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRleHQpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0dGhpc01vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbW9kZWwgZ2V0VmFsdWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRWYWx1ZSgpLCAnTXkgRmlyc3QgTGluZVxcdTIwMjhcXHRcXHRNeSBTZWNvbmQgTGluZVxcbiAgICBUaGlyZCBMaW5lXFx1MjAyOFxcbjEnKTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgbGluZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRMaW5lQ291bnQoKSwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0J1ZyAxMzMzMzpNb2RlbCBzaG91bGQgbGluZSBicmVhayBvbiBsb25lbHkgQ1IgdG9vJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdIZWxsb1xccldvcmxkIVxcclxcbkFub3RoZXIgbGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdIZWxsb1xcclxcbldvcmxkIVxcclxcbkFub3RoZXIgbGluZScpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuXG4vLyAtLS0tLS0tLS0gV29yZHNcblxuc3VpdGUoJ0VkaXRvciBNb2RlbCAtIFdvcmRzJywgKCkgPT4ge1xuXG5cdGNvbnN0IE9VVEVSX0xBTkdVQUdFX0lEID0gJ291dGVyTW9kZSc7XG5cdGNvbnN0IElOTkVSX0xBTkdVQUdFX0lEID0gJ2lubmVyTW9kZSc7XG5cblx0Y2xhc3MgT3V0ZXJNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZCA9IE9VVEVSX0xBTkdVQUdFX0lEO1xuXG5cdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHQpIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiB0aGlzLmxhbmd1YWdlSWQgfSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3Rlcih0aGlzLmxhbmd1YWdlSWQsIHt9KSk7XG5cblx0XHRcdGNvbnN0IGxhbmd1YWdlSWRDb2RlYyA9IGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWM7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcih0aGlzLmxhbmd1YWdlSWQsIHtcblx0XHRcdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKTogSVN0YXRlID0+IE51bGxTdGF0ZSxcblx0XHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKTogRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdG9rZW5zQXJyOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRcdGxldCBwcmV2TGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IChsaW5lLmNoYXJBdChpKSA9PT0gJ3gnID8gSU5ORVJfTEFOR1VBR0VfSUQgOiBPVVRFUl9MQU5HVUFHRV9JRCk7XG5cdFx0XHRcdFx0XHRjb25zdCBlbmNvZGVkTGFuZ3VhZ2VJZCA9IGxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXHRcdFx0XHRcdFx0aWYgKHByZXZMYW5ndWFnZUlkICE9PSBsYW5ndWFnZUlkKSB7XG5cdFx0XHRcdFx0XHRcdHRva2Vuc0Fyci5wdXNoKGkpO1xuXHRcdFx0XHRcdFx0XHR0b2tlbnNBcnIucHVzaCgoZW5jb2RlZExhbmd1YWdlSWQgPDwgTWV0YWRhdGFDb25zdHMuTEFOR1VBR0VJRF9PRkZTRVQpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHByZXZMYW5ndWFnZUlkID0gbGFuZ3VhZ2VJZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB0b2tlbnMgPSBuZXcgVWludDMyQXJyYXkodG9rZW5zQXJyLmxlbmd0aCk7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdHRva2Vuc1tpXSA9IHRva2Vuc0FycltpXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIElubmVyTW9kZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQgPSBJTk5FUl9MQU5HVUFHRV9JRDtcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogdGhpcy5sYW5ndWFnZUlkIH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7fSkpO1xuXHRcdH1cblx0fVxuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVtdID0gW107XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gW107XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NlKGRpc3Bvc2FibGVzKTtcblx0XHRkaXNwb3NhYmxlcyA9IFtdO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdHZXQgd29yZCBhdCBwb3NpdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gWydUaGlzIHRleHQgaGFzIHNvbWUgIHdvcmRzLiAnXTtcblx0XHRjb25zdCB0aGlzTW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dC5qb2luKCdcXG4nKSk7XG5cdFx0ZGlzcG9zYWJsZXMucHVzaCh0aGlzTW9kZWwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKSwgeyB3b3JkOiAnVGhpcycsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpKSwgeyB3b3JkOiAnVGhpcycsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDQpKSwgeyB3b3JkOiAnVGhpcycsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDUpKSwgeyB3b3JkOiAnVGhpcycsIHN0YXJ0Q29sdW1uOiAxLCBlbmRDb2x1bW46IDUgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDYpKSwgeyB3b3JkOiAndGV4dCcsIHN0YXJ0Q29sdW1uOiA2LCBlbmRDb2x1bW46IDEwIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxOSkpLCB7IHdvcmQ6ICdzb21lJywgc3RhcnRDb2x1bW46IDE1LCBlbmRDb2x1bW46IDE5IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyMCkpLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMjEpKSwgeyB3b3JkOiAnd29yZHMnLCBzdGFydENvbHVtbjogMjEsIGVuZENvbHVtbjogMjYgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0aGlzTW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDI2KSksIHsgd29yZDogJ3dvcmRzJywgc3RhcnRDb2x1bW46IDIxLCBlbmRDb2x1bW46IDI2IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyNykpLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRoaXNNb2RlbC5nZXRXb3JkQXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMjgpKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFdvcmRBdFBvc2l0aW9uIGF0IGVtYmVkZGVkIGxhbmd1YWdlIGJvdW5kYXJpZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBvdXRlck1vZGUgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3V0ZXJNb2RlKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubmVyTW9kZSkpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICdhYjx4eD5hYjx4PicsIG91dGVyTW9kZS5sYW5ndWFnZUlkKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSksIHsgd29yZDogJ2FiJywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSksIHsgd29yZDogJ2FiJywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAzKSksIHsgd29yZDogJ2FiJywgc3RhcnRDb2x1bW46IDEsIGVuZENvbHVtbjogMyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA0KSksIHsgd29yZDogJ3h4Jywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogNiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA1KSksIHsgd29yZDogJ3h4Jywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogNiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA2KSksIHsgd29yZDogJ3h4Jywgc3RhcnRDb2x1bW46IDQsIGVuZENvbHVtbjogNiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA3KSksIHsgd29yZDogJ2FiJywgc3RhcnRDb2x1bW46IDcsIGVuZENvbHVtbjogOSB9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzYxMjk2OiBWUyBjb2RlIGZyZWV6ZXMgd2hlbiBlZGl0aW5nIENTUyBmaWxlIHdpdGggZW1vamknLCAoKSA9PiB7XG5cdFx0Y29uc3QgTU9ERV9JRCA9ICd0ZXN0TW9kZSc7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogTU9ERV9JRCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIoTU9ERV9JRCwge1xuXHRcdFx0d29yZFBhdHRlcm46IC8oIz8tP1xcZCpcXC5cXGRcXHcqJT8pfCg6Oj9bXFx3LV0qKD89W14seztdKlsse10pKXwoKFtAIy4hXSk/W1xcdy0/XSslP3xbQCMhLl0pL2dcblx0XHR9KSk7XG5cblx0XHRjb25zdCB0aGlzTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICcuXHVEODNEXHVEQzM3LWEtYicsIE1PREVfSUQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSksIHsgd29yZDogJy4nLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSksIHsgd29yZDogJy4nLCBzdGFydENvbHVtbjogMSwgZW5kQ29sdW1uOiAyIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAzKSksIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA0KSksIHsgd29yZDogJy1hLWInLCBzdGFydENvbHVtbjogNCwgZW5kQ29sdW1uOiA4IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA1KSksIHsgd29yZDogJy1hLWInLCBzdGFydENvbHVtbjogNCwgZW5kQ29sdW1uOiA4IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA2KSksIHsgd29yZDogJy1hLWInLCBzdGFydENvbHVtbjogNCwgZW5kQ29sdW1uOiA4IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA3KSksIHsgd29yZDogJy1hLWInLCBzdGFydENvbHVtbjogNCwgZW5kQ29sdW1uOiA4IH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGhpc01vZGVsLmdldFdvcmRBdFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA4KSksIHsgd29yZDogJy1hLWInLCBzdGFydENvbHVtbjogNCwgZW5kQ29sdW1uOiA4IH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPLFlBQVk7QUFDbkIs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
