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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FontStyle, MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { _tokenizeToString, tokenizeLineToHTML } from "../../../common/languages/textToHtmlTokenizer.js";
import { LanguageIdCodec } from "../../../common/services/languagesRegistry.js";
import { TestLineToken, TestLineTokens } from "../core/testLineToken.js";
import { createModelServices } from "../testTextModel.js";
suite("Editor Modes - textToHtmlTokenizer", () => {
  let disposables;
  let instantiationService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createModelServices(disposables);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function toStr(pieces) {
    const resultArr = pieces.map((t) => `<span class="${t.className}">${t.text}</span>`);
    return resultArr.join("");
  }
  test("TextToHtmlTokenizer 1", () => {
    const mode = disposables.add(instantiationService.createInstance(Mode));
    const support = TokenizationRegistry.get(mode.languageId);
    const actual = _tokenizeToString(".abc..def...gh", new LanguageIdCodec(), support);
    const expected = [
      { className: "mtk7", text: "." },
      { className: "mtk9", text: "abc" },
      { className: "mtk7", text: ".." },
      { className: "mtk9", text: "def" },
      { className: "mtk7", text: "..." },
      { className: "mtk9", text: "gh" }
    ];
    const expectedStr = `<div class="monaco-tokenized-source">${toStr(expected)}</div>`;
    assert.strictEqual(actual, expectedStr);
  });
  test("TextToHtmlTokenizer 2", () => {
    const mode = disposables.add(instantiationService.createInstance(Mode));
    const support = TokenizationRegistry.get(mode.languageId);
    const actual = _tokenizeToString(".abc..def...gh\n.abc..def...gh", new LanguageIdCodec(), support);
    const expected1 = [
      { className: "mtk7", text: "." },
      { className: "mtk9", text: "abc" },
      { className: "mtk7", text: ".." },
      { className: "mtk9", text: "def" },
      { className: "mtk7", text: "..." },
      { className: "mtk9", text: "gh" }
    ];
    const expected2 = [
      { className: "mtk7", text: "." },
      { className: "mtk9", text: "abc" },
      { className: "mtk7", text: ".." },
      { className: "mtk9", text: "def" },
      { className: "mtk7", text: "..." },
      { className: "mtk9", text: "gh" }
    ];
    const expectedStr1 = toStr(expected1);
    const expectedStr2 = toStr(expected2);
    const expectedStr = `<div class="monaco-tokenized-source">${expectedStr1}<br/>${expectedStr2}</div>`;
    assert.strictEqual(actual, expectedStr);
  });
  test("tokenizeLineToHTML", () => {
    const text = "Ciao hello world!";
    const lineTokens = new TestLineTokens([
      new TestLineToken(
        4,
        (3 << MetadataConsts.FOREGROUND_OFFSET | (FontStyle.Bold | FontStyle.Italic) << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      ),
      new TestLineToken(
        5,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        10,
        4 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        11,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        17,
        (5 << MetadataConsts.FOREGROUND_OFFSET | FontStyle.Underline << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      )
    ]);
    const colorMap = [null, "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff"];
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">world!</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 12, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">w</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 11, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 1, 11, 4, true),
      [
        "<div>",
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">iao</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 4, 11, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160;</span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 5, 11, 4, true),
      [
        "<div>",
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 5, 10, 4, true),
      [
        "<div>",
        '<span style="color: #00ff00;">hello</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 6, 9, 4, true),
      [
        "<div>",
        '<span style="color: #00ff00;">ell</span>',
        "</div>"
      ].join("")
    );
  });
  test("tokenizeLineToHTML handle spaces #35954", () => {
    const text = "  Ciao   hello world!";
    const lineTokens = new TestLineTokens([
      new TestLineToken(
        2,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        6,
        (3 << MetadataConsts.FOREGROUND_OFFSET | (FontStyle.Bold | FontStyle.Italic) << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      ),
      new TestLineToken(
        9,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        14,
        4 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        15,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        21,
        (5 << MetadataConsts.FOREGROUND_OFFSET | FontStyle.Underline << MetadataConsts.FONT_STYLE_OFFSET) >>> 0
      )
    ]);
    const colorMap = [null, "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff"];
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 21, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; </span>',
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> &#160; </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">world!</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 17, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; </span>',
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">Ciao</span>',
        '<span style="color: #000000;"> &#160; </span>',
        '<span style="color: #00ff00;">hello</span>',
        '<span style="color: #000000;"> </span>',
        '<span style="color: #0000ff;text-decoration: underline;">wo</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 3, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; </span>',
        '<span style="color: #ff0000;font-style: italic;font-weight: bold;">C</span>',
        "</div>"
      ].join("")
    );
  });
  test("tokenizeLineToHTML with tabs and non-zero startOffset #263387", () => {
    const colorMap = [null, "#000000", "#ffffff", "#ff0000", "#00ff00"];
    const text = "	a	b";
    const lineTokens = new TestLineTokens([
      new TestLineToken(
        1,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        2,
        3 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        3,
        1 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      ),
      new TestLineToken(
        4,
        4 << MetadataConsts.FOREGROUND_OFFSET >>> 0
      )
    ]);
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 0, 4, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; &#160; </span>',
        // First tab: 4 spaces
        '<span style="color: #ff0000;">a</span>',
        // 'a' at column 4
        '<span style="color: #000000;"> &#160; </span>',
        // Second tab: 3 spaces (column 5 to 8)
        '<span style="color: #00ff00;">b</span>',
        "</div>"
      ].join("")
    );
    assert.strictEqual(
      tokenizeLineToHTML(text, lineTokens, colorMap, 2, 4, 4, true),
      [
        "<div>",
        '<span style="color: #000000;">&#160; &#160;</span>',
        // With fix: 3 spaces; with bug: only 2 spaces
        '<span style="color: #00ff00;">b</span>',
        "</div>"
      ].join("")
    );
  });
});
let Mode = class extends Disposable {
  constructor(languageService) {
    super();
    this.languageId = "textToHtmlTokenizerMode";
    this._register(languageService.registerLanguage({ id: this.languageId }));
    this._register(TokenizationRegistry.register(this.languageId, {
      getInitialState: () => null,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const tokensArr = [];
        let prevColor = -1;
        for (let i = 0; i < line.length; i++) {
          const colorId = line.charAt(i) === "." ? 7 : 9;
          if (prevColor !== colorId) {
            tokensArr.push(i);
            tokensArr.push(colorId << MetadataConsts.FOREGROUND_OFFSET >>> 0);
          }
          prevColor = colorId;
        }
        const tokens = new Uint32Array(tokensArr.length);
        for (let i = 0; i < tokens.length; i++) {
          tokens[i] = tokensArr[i];
        }
        return new EncodedTokenizationResult(tokens, [], null);
      }
    }));
  }
};
Mode = __decorateClass([
  __decorateParam(0, ILanguageService)
], Mode);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXHRleHRUb0h0bWxUb2tlbml6ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbG9ySWQsIEZvbnRTdHlsZSwgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0LCBJU3RhdGUsIFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBfdG9rZW5pemVUb1N0cmluZywgdG9rZW5pemVMaW5lVG9IVE1MIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy90ZXh0VG9IdG1sVG9rZW5pemVyLmpzJztcbmltcG9ydCB7IExhbmd1YWdlSWRDb2RlYyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZXNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUZXN0TGluZVRva2VuLCBUZXN0TGluZVRva2VucyB9IGZyb20gJy4uL2NvcmUvdGVzdExpbmVUb2tlbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2RlbFNlcnZpY2VzIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5cbnN1aXRlKCdFZGl0b3IgTW9kZXMgLSB0ZXh0VG9IdG1sVG9rZW5pemVyJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdG9TdHIocGllY2VzOiB7IGNsYXNzTmFtZTogc3RyaW5nOyB0ZXh0OiBzdHJpbmcgfVtdKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHRBcnIgPSBwaWVjZXMubWFwKCh0KSA9PiBgPHNwYW4gY2xhc3M9XCIke3QuY2xhc3NOYW1lfVwiPiR7dC50ZXh0fTwvc3Bhbj5gKTtcblx0XHRyZXR1cm4gcmVzdWx0QXJyLmpvaW4oJycpO1xuXHR9XG5cblx0dGVzdCgnVGV4dFRvSHRtbFRva2VuaXplciAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGUgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZSkpO1xuXHRcdGNvbnN0IHN1cHBvcnQgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5nZXQobW9kZS5sYW5ndWFnZUlkKSE7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBfdG9rZW5pemVUb1N0cmluZygnLmFiYy4uZGVmLi4uZ2gnLCBuZXcgTGFuZ3VhZ2VJZENvZGVjKCksIHN1cHBvcnQpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs3JywgdGV4dDogJy4nIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azknLCB0ZXh0OiAnYWJjJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs3JywgdGV4dDogJy4uJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs5JywgdGV4dDogJ2RlZicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrNycsIHRleHQ6ICcuLi4nIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azknLCB0ZXh0OiAnZ2gnIH0sXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZFN0ciA9IGA8ZGl2IGNsYXNzPVwibW9uYWNvLXRva2VuaXplZC1zb3VyY2VcIj4ke3RvU3RyKGV4cGVjdGVkKX08L2Rpdj5gO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWRTdHIpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXh0VG9IdG1sVG9rZW5pemVyIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNb2RlKSk7XG5cdFx0Y29uc3Qgc3VwcG9ydCA9IFRva2VuaXphdGlvblJlZ2lzdHJ5LmdldChtb2RlLmxhbmd1YWdlSWQpITtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IF90b2tlbml6ZVRvU3RyaW5nKCcuYWJjLi5kZWYuLi5naFxcbi5hYmMuLmRlZi4uLmdoJywgbmV3IExhbmd1YWdlSWRDb2RlYygpLCBzdXBwb3J0KTtcblx0XHRjb25zdCBleHBlY3RlZDEgPSBbXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azcnLCB0ZXh0OiAnLicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrOScsIHRleHQ6ICdhYmMnIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azcnLCB0ZXh0OiAnLi4nIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azknLCB0ZXh0OiAnZGVmJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs3JywgdGV4dDogJy4uLicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrOScsIHRleHQ6ICdnaCcgfSxcblx0XHRdO1xuXHRcdGNvbnN0IGV4cGVjdGVkMiA9IFtcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrNycsIHRleHQ6ICcuJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs5JywgdGV4dDogJ2FiYycgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrNycsIHRleHQ6ICcuLicgfSxcblx0XHRcdHsgY2xhc3NOYW1lOiAnbXRrOScsIHRleHQ6ICdkZWYnIH0sXG5cdFx0XHR7IGNsYXNzTmFtZTogJ210azcnLCB0ZXh0OiAnLi4uJyB9LFxuXHRcdFx0eyBjbGFzc05hbWU6ICdtdGs5JywgdGV4dDogJ2doJyB9LFxuXHRcdF07XG5cdFx0Y29uc3QgZXhwZWN0ZWRTdHIxID0gdG9TdHIoZXhwZWN0ZWQxKTtcblx0XHRjb25zdCBleHBlY3RlZFN0cjIgPSB0b1N0cihleHBlY3RlZDIpO1xuXHRcdGNvbnN0IGV4cGVjdGVkU3RyID0gYDxkaXYgY2xhc3M9XCJtb25hY28tdG9rZW5pemVkLXNvdXJjZVwiPiR7ZXhwZWN0ZWRTdHIxfTxici8+JHtleHBlY3RlZFN0cjJ9PC9kaXY+YDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkU3RyKTtcblx0fSk7XG5cblx0dGVzdCgndG9rZW5pemVMaW5lVG9IVE1MJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAnQ2lhbyBoZWxsbyB3b3JsZCEnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBuZXcgVGVzdExpbmVUb2tlbnMoW1xuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDQsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoMyA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0XHR8ICgoRm9udFN0eWxlLkJvbGQgfCBGb250U3R5bGUuSXRhbGljKSA8PCBNZXRhZGF0YUNvbnN0cy5GT05UX1NUWUxFX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQ1LFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDEgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0MTAsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoNCA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQxMSxcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCgxIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDE3LFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDUgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdFx0fCAoKEZvbnRTdHlsZS5VbmRlcmxpbmUpIDw8IE1ldGFkYXRhQ29uc3RzLkZPTlRfU1RZTEVfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpXG5cdFx0XSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBbbnVsbCEsICcjMDAwMDAwJywgJyNmZmZmZmYnLCAnI2ZmMDAwMCcsICcjMDBmZjAwJywgJyMwMDAwZmYnXTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgMCwgMTcsIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogI2ZmMDAwMDtmb250LXN0eWxlOiBpdGFsaWM7Zm9udC13ZWlnaHQ6IGJvbGQ7XCI+Q2lhbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmhlbGxvPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwZmY7dGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XCI+d29ybGQhPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgMCwgMTIsIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogI2ZmMDAwMDtmb250LXN0eWxlOiBpdGFsaWM7Zm9udC13ZWlnaHQ6IGJvbGQ7XCI+Q2lhbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmhlbGxvPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwZmY7dGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7XCI+dzwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDAsIDExLCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7Zm9udC1zdHlsZTogaXRhbGljO2ZvbnQtd2VpZ2h0OiBib2xkO1wiPkNpYW88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgMSwgMTEsIDQsIHRydWUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogI2ZmMDAwMDtmb250LXN0eWxlOiBpdGFsaWM7Zm9udC13ZWlnaHQ6IGJvbGQ7XCI+aWFvPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGZmMDA7XCI+aGVsbG88L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDQsIDExLCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+JiMxNjA7PC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmhlbGxvPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiA8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dG9rZW5pemVMaW5lVG9IVE1MKHRleHQsIGxpbmVUb2tlbnMsIGNvbG9yTWFwLCA1LCAxMSwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmhlbGxvPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiA8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dG9rZW5pemVMaW5lVG9IVE1MKHRleHQsIGxpbmVUb2tlbnMsIGNvbG9yTWFwLCA1LCAxMCwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmhlbGxvPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgNiwgOSwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmVsbDwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cdH0pO1xuXHR0ZXN0KCd0b2tlbml6ZUxpbmVUb0hUTUwgaGFuZGxlIHNwYWNlcyAjMzU5NTQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICcgIENpYW8gICBoZWxsbyB3b3JsZCEnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBuZXcgVGVzdExpbmVUb2tlbnMoW1xuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDIsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoMSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQ2LFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDMgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdFx0fCAoKEZvbnRTdHlsZS5Cb2xkIHwgRm9udFN0eWxlLkl0YWxpYykgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0OSxcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCgxIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDE0LFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0MTUsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoMSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQyMSxcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCg1IDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHRcdHwgKChGb250U3R5bGUuVW5kZXJsaW5lKSA8PCBNZXRhZGF0YUNvbnN0cy5GT05UX1NUWUxFX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KVxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gW251bGwhLCAnIzAwMDAwMCcsICcjZmZmZmZmJywgJyNmZjAwMDAnLCAnIzAwZmYwMCcsICcjMDAwMGZmJ107XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDAsIDIxLCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+JiMxNjA7IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogI2ZmMDAwMDtmb250LXN0eWxlOiBpdGFsaWM7Zm9udC13ZWlnaHQ6IGJvbGQ7XCI+Q2lhbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gJiMxNjA7IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMGZmO3RleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1wiPndvcmxkITwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHR0b2tlbml6ZUxpbmVUb0hUTUwodGV4dCwgbGluZVRva2VucywgY29sb3JNYXAsIDAsIDE3LCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+JiMxNjA7IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogI2ZmMDAwMDtmb250LXN0eWxlOiBpdGFsaWM7Zm9udC13ZWlnaHQ6IGJvbGQ7XCI+Q2lhbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gJiMxNjA7IDwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwZmYwMDtcIj5oZWxsbzwvc3Bhbj4nLFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gPC9zcGFuPicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMGZmO3RleHQtZGVjb3JhdGlvbjogdW5kZXJsaW5lO1wiPndvPC9zcGFuPicsXG5cdFx0XHRcdCc8L2Rpdj4nXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgMCwgMywgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiYjMTYwOyA8L3NwYW4+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7Zm9udC1zdHlsZTogaXRhbGljO2ZvbnQtd2VpZ2h0OiBib2xkO1wiPkM8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2tlbml6ZUxpbmVUb0hUTUwgd2l0aCB0YWJzIGFuZCBub24temVybyBzdGFydE9mZnNldCAjMjYzMzg3JywgKCkgPT4ge1xuXHRcdC8vIFRoaXMgdGVzdCBkZW1vbnN0cmF0ZXMgdGhlIGlzc3VlIHdoZXJlIHRhYiBwYWRkaW5nIGlzIGNhbGN1bGF0ZWQgaW5jb3JyZWN0bHlcblx0XHQvLyB3aGVuIHN0YXJ0T2Zmc2V0IGlzIG5vbi16ZXJvIGFuZCB0aGVyZSBhcmUgdGFicyBBRlRFUiB0aGUgc3RhcnQgcG9zaXRpb24uXG5cdFx0Ly8gVGhlIGJ1ZzogdGFic0NoYXJEZWx0YSBkb2Vzbid0IGFjY291bnQgZm9yIGNoYXJhY3RlcnMgYmVmb3JlIHN0YXJ0T2Zmc2V0LlxuXG5cdFx0Y29uc3QgY29sb3JNYXAgPSBbbnVsbCEsICcjMDAwMDAwJywgJyNmZmZmZmYnLCAnI2ZmMDAwMCcsICcjMDBmZjAwJ107XG5cblx0XHQvLyBDcml0aWNhbCB0ZXN0IGNhc2U6IFwiXFx0YVxcdGJcIiBzdGFydGluZyBhdCBwb3NpdGlvbiAyIChza2lwcGluZyBmaXJzdCB0YWIgYW5kICdhJylcblx0XHQvLyBMYXlvdXQ6IEZpcnN0IHRhYiAocG9zIDApIGdvZXMgdG8gY29sdW1uIDQsICdhJyAocG9zIDEpIGF0IGNvbHVtbiA0LFxuXHRcdC8vICAgICAgICAgc2Vjb25kIHRhYiAocG9zIDIpIHNob3VsZCBnbyBmcm9tIGNvbHVtbiA1IHRvIGNvbHVtbiA4ICgzIHNwYWNlcylcblx0XHQvLyBXaXRoIHRoZSBidWc6IGNoYXJJbmRleCBzdGFydHMgYXQgMiwgdGFic0NoYXJEZWx0YT0wIChmaXJzdCB0YWIgd2FzIG5ldmVyIHNlZW4pXG5cdFx0Ly8gICBXaGVuIHByb2Nlc3Npbmcgc2Vjb25kIHRhYjogaW5zZXJ0U3BhY2VzQ291bnQgPSA0IC0gKDIgKyAwKSAlIDQgPSAyIHNwYWNlcyAoV1JPTkchKVxuXHRcdC8vICAgVGhlIG9sZCBjb2RlIHRoaW5rcyBpdCdzIGF0IGNvbHVtbiAyLCBidXQgaXQncyBhY3R1YWxseSBhdCBjb2x1bW4gNVxuXHRcdGNvbnN0IHRleHQgPSAnXFx0YVxcdGInO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBuZXcgVGVzdExpbmVUb2tlbnMoW1xuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDEsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoMSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KSxcblx0XHRcdG5ldyBUZXN0TGluZVRva2VuKFxuXHRcdFx0XHQyLFxuXHRcdFx0XHQoXG5cdFx0XHRcdFx0KDMgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHRcdCkgPj4+IDBcblx0XHRcdCksXG5cdFx0XHRuZXcgVGVzdExpbmVUb2tlbihcblx0XHRcdFx0Myxcblx0XHRcdFx0KFxuXHRcdFx0XHRcdCgxIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKVxuXHRcdFx0XHQpID4+PiAwXG5cdFx0XHQpLFxuXHRcdFx0bmV3IFRlc3RMaW5lVG9rZW4oXG5cdFx0XHRcdDQsXG5cdFx0XHRcdChcblx0XHRcdFx0XHQoNCA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0KSA+Pj4gMFxuXHRcdFx0KVxuXHRcdF0pO1xuXG5cdFx0Ly8gRmlyc3QsIHZlcmlmeSB0aGUgZnVsbCBsaW5lIHdvcmtzIGNvcnJlY3RseVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHRva2VuaXplTGluZVRvSFRNTCh0ZXh0LCBsaW5lVG9rZW5zLCBjb2xvck1hcCwgMCwgNCwgNCwgdHJ1ZSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDAwMDAwO1wiPiYjMTYwOyAmIzE2MDsgPC9zcGFuPicsIC8vIEZpcnN0IHRhYjogNCBzcGFjZXNcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICNmZjAwMDA7XCI+YTwvc3Bhbj4nLCAgICAgICAgICAgICAgIC8vICdhJyBhdCBjb2x1bW4gNFxuXHRcdFx0XHQnPHNwYW4gc3R5bGU9XCJjb2xvcjogIzAwMDAwMDtcIj4gJiMxNjA7IDwvc3Bhbj4nLCAgICAgICAvLyBTZWNvbmQgdGFiOiAzIHNwYWNlcyAoY29sdW1uIDUgdG8gOClcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMGZmMDA7XCI+Yjwvc3Bhbj4nLFxuXHRcdFx0XHQnPC9kaXY+J1xuXHRcdFx0XS5qb2luKCcnKVxuXHRcdCk7XG5cblx0XHQvLyBUSEUgQlVHOiBTdGFydGluZyBhdCBwb3NpdGlvbiAyIChhZnRlciBmaXJzdCB0YWIgYW5kICdhJylcblx0XHQvLyBFeHBlY3RlZCAod2l0aCBmaXgpOiAzIHNwYWNlcyBmb3IgdGhlIHNlY29uZCB0YWIgKGNvbHVtbiA1IHRvIDgpXG5cdFx0Ly8gQnVnZ3kgYmVoYXZpb3IgKG9sZCBjb2RlKTogMiBzcGFjZXMgKHRoaW5rcyBpdCdzIGF0IGNvbHVtbiAyLCBnaXZlcyAmIzE2MDsgKVxuXHRcdC8vIFRoZSBmaXggY29ycmVjdGx5IGFjY291bnRzIGZvciB0aGUgc2tpcHBlZCB0YWIgYW5kICdhJywgb3V0cHV0dGluZyAmIzE2MDsgJiMxNjA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0dG9rZW5pemVMaW5lVG9IVE1MKHRleHQsIGxpbmVUb2tlbnMsIGNvbG9yTWFwLCAyLCA0LCA0LCB0cnVlKSxcblx0XHRcdFtcblx0XHRcdFx0JzxkaXY+Jyxcblx0XHRcdFx0JzxzcGFuIHN0eWxlPVwiY29sb3I6ICMwMDAwMDA7XCI+JiMxNjA7ICYjMTYwOzwvc3Bhbj4nLCAvLyBXaXRoIGZpeDogMyBzcGFjZXM7IHdpdGggYnVnOiBvbmx5IDIgc3BhY2VzXG5cdFx0XHRcdCc8c3BhbiBzdHlsZT1cImNvbG9yOiAjMDBmZjAwO1wiPmI8L3NwYW4+Jyxcblx0XHRcdFx0JzwvZGl2Pidcblx0XHRcdF0uam9pbignJylcblx0XHQpO1xuXHR9KTtcblxufSk7XG5cbmNsYXNzIE1vZGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZCA9ICd0ZXh0VG9IdG1sVG9rZW5pemVyTW9kZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogdGhpcy5sYW5ndWFnZUlkIH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcih0aGlzLmxhbmd1YWdlSWQsIHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCk6IElTdGF0ZSA9PiBudWxsISxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpOiBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0ID0+IHtcblx0XHRcdFx0Y29uc3QgdG9rZW5zQXJyOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0XHRsZXQgcHJldkNvbG9yID0gLTEgYXMgQ29sb3JJZDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29sb3JJZCA9IChsaW5lLmNoYXJBdChpKSA9PT0gJy4nID8gNyA6IDkpIGFzIENvbG9ySWQ7XG5cdFx0XHRcdFx0aWYgKHByZXZDb2xvciAhPT0gY29sb3JJZCkge1xuXHRcdFx0XHRcdFx0dG9rZW5zQXJyLnB1c2goaSk7XG5cdFx0XHRcdFx0XHR0b2tlbnNBcnIucHVzaCgoXG5cdFx0XHRcdFx0XHRcdGNvbG9ySWQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVRcblx0XHRcdFx0XHRcdCkgPj4+IDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcmV2Q29sb3IgPSBjb2xvcklkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KHRva2Vuc0Fyci5sZW5ndGgpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHRva2Vuc1tpXSA9IHRva2Vuc0FycltpXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgbnVsbCEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0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WSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFBQSxNQUM3RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBRUEsV0FBTztBQUFBLE1BQ04sbUJBQW1CLE1BQU0sWUFBWSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFBQSxNQUM3RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBRUEsV0FBTztBQUFBLE1BQ04sbUJBQW1CLE1BQU0sWUFBWSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFBQSxNQUM3RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssRUFBRTtBQUFBLElBQ1Y7QUFFQSxXQUFPO0FBQUEsTUFDTixtQkFBbUIsTUFBTSxZQUFZLFVBQVUsR0FBRyxJQUFJLEdBQUcsSUFBSTtBQUFBLE1BQzdEO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBRUEsV0FBTztBQUFBLE1BQ04sbUJBQW1CLE1BQU0sWUFBWSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFBQSxNQUM3RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBRUEsV0FBTztBQUFBLE1BQ04sbUJBQW1CLE1BQU0sWUFBWSxVQUFVLEdBQUcsR0FBRyxHQUFHLElBQUk7QUFBQSxNQUM1RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBQUEsRUFDRCxDQUFDO0FBQ0QsT0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxVQUFNLE9BQU87QUFDYixVQUFNLGFBQWEsSUFBSSxlQUFlO0FBQUEsTUFDckMsSUFBSTtBQUFBLFFBQ0g7QUFBQSxRQUVFLEtBQUssZUFBZSxzQkFDaEI7QUFBQSxNQUNQO0FBQUEsTUFDQSxJQUFJO0FBQUEsUUFDSDtBQUFBLFNBRUUsS0FBSyxlQUFlLHFCQUNqQixVQUFVLE9BQU8sVUFBVSxXQUFXLGVBQWUsdUJBQ3BEO0FBQUEsTUFDUDtBQUFBLE1BQ0EsSUFBSTtBQUFBLFFBQ0g7QUFBQSxRQUVFLEtBQUssZUFBZSxzQkFDaEI7QUFBQSxNQUNQO0FBQUEsTUFDQSxJQUFJO0FBQUEsUUFDSDtBQUFBLFFBRUUsS0FBSyxlQUFlLHNCQUNoQjtBQUFBLE1BQ1A7QUFBQSxNQUNBLElBQUk7QUFBQSxRQUNIO0FBQUEsUUFFRSxLQUFLLGVBQWUsc0JBQ2hCO0FBQUEsTUFDUDtBQUFBLE1BQ0EsSUFBSTtBQUFBLFFBQ0g7QUFBQSxTQUVFLEtBQUssZUFBZSxvQkFDakIsVUFBVSxhQUFjLGVBQWUsdUJBQ3RDO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sV0FBVyxDQUFDLE1BQU8sV0FBVyxXQUFXLFdBQVcsV0FBVyxTQUFTO0FBRTlFLFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLElBQUksR0FBRyxJQUFJO0FBQUEsTUFDN0Q7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBRUEsV0FBTztBQUFBLE1BQ04sbUJBQW1CLE1BQU0sWUFBWSxVQUFVLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFBQSxNQUM3RDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssRUFBRTtBQUFBLElBQ1Y7QUFFQSxXQUFPO0FBQUEsTUFDTixtQkFBbUIsTUFBTSxZQUFZLFVBQVUsR0FBRyxHQUFHLEdBQUcsSUFBSTtBQUFBLE1BQzVEO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpRUFBaUUsTUFBTTtBQUszRSxVQUFNLFdBQVcsQ0FBQyxNQUFPLFdBQVcsV0FBVyxXQUFXLFNBQVM7QUFRbkUsVUFBTSxPQUFPO0FBQ2IsVUFBTSxhQUFhLElBQUksZUFBZTtBQUFBLE1BQ3JDLElBQUk7QUFBQSxRQUNIO0FBQUEsUUFFRSxLQUFLLGVBQWUsc0JBQ2hCO0FBQUEsTUFDUDtBQUFBLE1BQ0EsSUFBSTtBQUFBLFFBQ0g7QUFBQSxRQUVFLEtBQUssZUFBZSxzQkFDaEI7QUFBQSxNQUNQO0FBQUEsTUFDQSxJQUFJO0FBQUEsUUFDSDtBQUFBLFFBRUUsS0FBSyxlQUFlLHNCQUNoQjtBQUFBLE1BQ1A7QUFBQSxNQUNBLElBQUk7QUFBQSxRQUNIO0FBQUEsUUFFRSxLQUFLLGVBQWUsc0JBQ2hCO0FBQUEsTUFDUDtBQUFBLElBQ0QsQ0FBQztBQUdELFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLEdBQUcsR0FBRyxJQUFJO0FBQUEsTUFDNUQ7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBO0FBQUEsUUFDQTtBQUFBO0FBQUEsUUFDQTtBQUFBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVjtBQU1BLFdBQU87QUFBQSxNQUNOLG1CQUFtQixNQUFNLFlBQVksVUFBVSxHQUFHLEdBQUcsR0FBRyxJQUFJO0FBQUEsTUFDNUQ7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVjtBQUFBLEVBQ0QsQ0FBQztBQUVGLENBQUM7QUFFRCxJQUFNLE9BQU4sY0FBbUIsV0FBVztBQUFBLEVBSTdCLFlBQ21CLGlCQUNqQjtBQUNELFVBQU07QUFMUCxTQUFnQixhQUFhO0FBTTVCLFNBQUssVUFBVSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQ3hFLFNBQUssVUFBVSxxQkFBcUIsU0FBUyxLQUFLLFlBQVk7QUFBQSxNQUM3RCxpQkFBaUIsTUFBYztBQUFBLE1BQy9CLFVBQVU7QUFBQSxNQUNWLGlCQUFpQixDQUFDLE1BQWMsUUFBaUIsVUFBNkM7QUFDN0YsY0FBTSxZQUFzQixDQUFDO0FBQzdCLFlBQUksWUFBWTtBQUNoQixpQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLFFBQVEsS0FBSztBQUNyQyxnQkFBTSxVQUFXLEtBQUssT0FBTyxDQUFDLE1BQU0sTUFBTSxJQUFJO0FBQzlDLGNBQUksY0FBYyxTQUFTO0FBQzFCLHNCQUFVLEtBQUssQ0FBQztBQUNoQixzQkFBVSxLQUNULFdBQVcsZUFBZSxzQkFDckIsQ0FBQztBQUFBLFVBQ1I7QUFDQSxzQkFBWTtBQUFBLFFBQ2I7QUFFQSxjQUFNLFNBQVMsSUFBSSxZQUFZLFVBQVUsTUFBTTtBQUMvQyxpQkFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUN2QyxpQkFBTyxDQUFDLElBQUksVUFBVSxDQUFDO0FBQUEsUUFDeEI7QUFDQSxlQUFPLElBQUksMEJBQTBCLFFBQVEsQ0FBQyxHQUFHLElBQUs7QUFBQSxNQUN2RDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNEO0FBbENNLE9BQU47QUFBQSxFQUtHO0FBQUEsR0FMRzsiLAogICJuYW1lcyI6IFtdCn0K
