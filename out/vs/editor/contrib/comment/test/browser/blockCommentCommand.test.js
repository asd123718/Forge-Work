import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Selection } from "../../../../common/core/selection.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { BlockCommentCommand } from "../../browser/blockCommentCommand.js";
import { testCommand } from "../../../../test/browser/testCommand.js";
function _testCommentCommand(lines, selection, commandFactory, expectedLines, expectedSelection) {
  const languageId = "commentMode";
  const prepare = (accessor, disposables) => {
    const languageConfigurationService = accessor.get(ILanguageConfigurationService);
    const languageService = accessor.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      comments: { lineComment: "!@#", blockComment: ["<0", "0>"] }
    }));
  };
  testCommand(lines, languageId, selection, commandFactory, expectedLines, expectedSelection, void 0, prepare);
}
function testBlockCommentCommand(lines, selection, expectedLines, expectedSelection) {
  _testCommentCommand(lines, selection, (accessor, sel) => new BlockCommentCommand(sel, true, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection);
}
suite("Editor Contrib - Block Comment Command", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty selection wraps itself", function() {
    testBlockCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 3),
      [
        "fi<0  0>rst",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 6, 1, 6)
    );
  });
  test("invisible selection ignored", function() {
    testBlockCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 1, 1),
      [
        "<0 first",
        " 0>	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 4, 2, 1)
    );
  });
  test("bug9511", () => {
    testBlockCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 6, 1, 1),
      [
        "<0 first 0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 4, 1, 9)
    );
    testBlockCommentCommand(
      [
        "<0first0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 8, 1, 3),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 6)
    );
  });
  test("one line selection", function() {
    testBlockCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 6, 1, 3),
      [
        "fi<0 rst 0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 6, 1, 9)
    );
  });
  test("one line selection toggle", function() {
    testBlockCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 6, 1, 3),
      [
        "fi<0 rst 0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 6, 1, 9)
    );
    testBlockCommentCommand(
      [
        "fi<0rst0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 8, 1, 5),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 6)
    );
    testBlockCommentCommand(
      [
        "<0 first 0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 10, 1, 1),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 6)
    );
    testBlockCommentCommand(
      [
        "<0 first0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 9, 1, 1),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 6)
    );
    testBlockCommentCommand(
      [
        "<0first 0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 9, 1, 1),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 6)
    );
    testBlockCommentCommand(
      [
        "fi<0rst0>",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 8, 1, 5),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 6)
    );
  });
  test("multi line selection", function() {
    testBlockCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 1),
      [
        "<0 first",
        "	se 0>cond line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 4, 2, 4)
    );
  });
  test("multi line selection toggle", function() {
    testBlockCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 1),
      [
        "<0 first",
        "	se 0>cond line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 4, 2, 4)
    );
    testBlockCommentCommand(
      [
        "<0first",
        "	se0>cond line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 3),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 2, 4)
    );
    testBlockCommentCommand(
      [
        "<0 first",
        "	se0>cond line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 3),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 2, 4)
    );
    testBlockCommentCommand(
      [
        "<0first",
        "	se 0>cond line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 3),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 2, 4)
    );
    testBlockCommentCommand(
      [
        "<0 first",
        "	se 0>cond line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 3),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 2, 4)
    );
  });
  test("fuzzy removes", function() {
    testBlockCommentCommand(
      [
        "asd <0 qwe",
        "asd 0> qwe"
      ],
      new Selection(2, 5, 1, 7),
      [
        "asd qwe",
        "asd qwe"
      ],
      new Selection(1, 5, 2, 4)
    );
    testBlockCommentCommand(
      [
        "asd <0 qwe",
        "asd 0> qwe"
      ],
      new Selection(2, 5, 1, 6),
      [
        "asd qwe",
        "asd qwe"
      ],
      new Selection(1, 5, 2, 4)
    );
    testBlockCommentCommand(
      [
        "asd <0 qwe",
        "asd 0> qwe"
      ],
      new Selection(2, 5, 1, 5),
      [
        "asd qwe",
        "asd qwe"
      ],
      new Selection(1, 5, 2, 4)
    );
    testBlockCommentCommand(
      [
        "asd <0 qwe",
        "asd 0> qwe"
      ],
      new Selection(2, 5, 1, 11),
      [
        "asd qwe",
        "asd qwe"
      ],
      new Selection(1, 5, 2, 4)
    );
    testBlockCommentCommand(
      [
        "asd <0 qwe",
        "asd 0> qwe"
      ],
      new Selection(2, 1, 1, 11),
      [
        "asd qwe",
        "asd qwe"
      ],
      new Selection(1, 5, 2, 4)
    );
    testBlockCommentCommand(
      [
        "asd <0 qwe",
        "asd 0> qwe"
      ],
      new Selection(2, 7, 1, 11),
      [
        "asd qwe",
        "asd qwe"
      ],
      new Selection(1, 5, 2, 4)
    );
  });
  test("bug #30358", function() {
    testBlockCommentCommand(
      [
        "<0 start 0> middle end"
      ],
      new Selection(1, 20, 1, 23),
      [
        "<0 start 0> middle <0 end 0>"
      ],
      new Selection(1, 23, 1, 26)
    );
    testBlockCommentCommand(
      [
        "<0 start 0> middle <0 end 0>"
      ],
      new Selection(1, 13, 1, 19),
      [
        "<0 start 0> <0 middle 0> <0 end 0>"
      ],
      new Selection(1, 16, 1, 22)
    );
  });
  test("issue #34618", function() {
    testBlockCommentCommand(
      [
        "<0  0> middle end"
      ],
      new Selection(1, 4, 1, 4),
      [
        " middle end"
      ],
      new Selection(1, 1, 1, 1)
    );
  });
  test("insertSpace false", () => {
    function testLineCommentCommand(lines, selection, expectedLines, expectedSelection) {
      _testCommentCommand(lines, selection, (accessor, sel) => new BlockCommentCommand(sel, false, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection);
    }
    testLineCommentCommand(
      [
        "some text"
      ],
      new Selection(1, 1, 1, 5),
      [
        "<0some0> text"
      ],
      new Selection(1, 3, 1, 7)
    );
  });
  test("insertSpace false does not remove space", () => {
    function testLineCommentCommand(lines, selection, expectedLines, expectedSelection) {
      _testCommentCommand(lines, selection, (accessor, sel) => new BlockCommentCommand(sel, false, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection);
    }
    testLineCommentCommand(
      [
        "<0 some 0> text"
      ],
      new Selection(1, 4, 1, 8),
      [
        " some  text"
      ],
      new Selection(1, 1, 1, 7)
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvbW1lbnRcXHRlc3RcXGJyb3dzZXJcXGJsb2NrQ29tbWVudENvbW1hbmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEJsb2NrQ29tbWVudENvbW1hbmQgfSBmcm9tICcuLi8uLi9icm93c2VyL2Jsb2NrQ29tbWVudENvbW1hbmQuanMnO1xuaW1wb3J0IHsgdGVzdENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvbW1hbmQuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5mdW5jdGlvbiBfdGVzdENvbW1lbnRDb21tYW5kKGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGNvbW1hbmRGYWN0b3J5OiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlbGVjdGlvbjogU2VsZWN0aW9uKSA9PiBJQ29tbWFuZCwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdjb21tZW50TW9kZSc7XG5cdGNvbnN0IHByZXBhcmUgPSAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGNvbW1lbnRzOiB7IGxpbmVDb21tZW50OiAnIUAjJywgYmxvY2tDb21tZW50OiBbJzwwJywgJzA+J10gfVxuXHRcdH0pKTtcblx0fTtcblx0dGVzdENvbW1hbmQobGluZXMsIGxhbmd1YWdlSWQsIHNlbGVjdGlvbiwgY29tbWFuZEZhY3RvcnksIGV4cGVjdGVkTGluZXMsIGV4cGVjdGVkU2VsZWN0aW9uLCB1bmRlZmluZWQsIHByZXBhcmUpO1xufVxuXG5mdW5jdGlvbiB0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChsaW5lczogc3RyaW5nW10sIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBleHBlY3RlZExpbmVzOiBzdHJpbmdbXSwgZXhwZWN0ZWRTZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuXHRfdGVzdENvbW1lbnRDb21tYW5kKGxpbmVzLCBzZWxlY3Rpb24sIChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgQmxvY2tDb21tZW50Q29tbWFuZChzZWwsIHRydWUsIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbik7XG59XG5cbnN1aXRlKCdFZGl0b3IgQ29udHJpYiAtIEJsb2NrIENvbW1lbnQgQ29tbWFuZCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbXB0eSBzZWxlY3Rpb24gd3JhcHMgaXRzZWxmJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmk8MCAgMD5yc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW52aXNpYmxlIHNlbGVjdGlvbiBpZ25vcmVkJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPDAgZmlyc3QnLFxuXHRcdFx0XHQnIDA+XFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDIsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnOTUxMScsICgpID0+IHtcblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0JzwwIGZpcnN0IDA+Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA5KVxuXHRcdCk7XG5cblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JzwwZmlyc3QwPicsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgOCwgMSwgMyksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNilcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgbGluZSBzZWxlY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdEJsb2NrQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgMyksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaTwwIHJzdCAwPicsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgOSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmUgbGluZSBzZWxlY3Rpb24gdG9nZ2xlJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDMpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmk8MCByc3QgMD4nLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDkpXG5cdFx0KTtcblxuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmk8MHJzdDA+Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA4LCAxLCA1KSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCA2KVxuXHRcdCk7XG5cblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JzwwIGZpcnN0IDA+Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNilcblx0XHQpO1xuXG5cdFx0dGVzdEJsb2NrQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCc8MCBmaXJzdDA+Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA5LCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA2KVxuXHRcdCk7XG5cblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JzwwZmlyc3QgMD4nLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDYpXG5cdFx0KTtcblxuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmk8MHJzdDA+Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA4LCAxLCA1KSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCA2KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpIGxpbmUgc2VsZWN0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPDAgZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2UgMD5jb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDIsIDQpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgbGluZSBzZWxlY3Rpb24gdG9nZ2xlJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPDAgZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2UgMD5jb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDIsIDQpXG5cdFx0KTtcblxuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnPDBmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZTA+Y29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAxLCAzKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAyLCA0KVxuXHRcdCk7XG5cblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JzwwIGZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlMD5jb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDEsIDMpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDQpXG5cdFx0KTtcblxuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnPDBmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZSAwPmNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMSwgMyksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgNClcblx0XHQpO1xuXG5cdFx0dGVzdEJsb2NrQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCc8MCBmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZSAwPmNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMSwgMyksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgNClcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eSByZW1vdmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnYXNkIDwwIHF3ZScsXG5cdFx0XHRcdCdhc2QgMD4gcXdlJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNSwgMSwgNyksXG5cdFx0XHRbXG5cdFx0XHRcdCdhc2QgcXdlJyxcblx0XHRcdFx0J2FzZCBxd2UnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAyLCA0KVxuXHRcdCk7XG5cblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2FzZCA8MCBxd2UnLFxuXHRcdFx0XHQnYXNkIDA+IHF3ZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDUsIDEsIDYpLFxuXHRcdFx0W1xuXHRcdFx0XHQnYXNkIHF3ZScsXG5cdFx0XHRcdCdhc2QgcXdlJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMiwgNClcblx0XHQpO1xuXG5cdFx0dGVzdEJsb2NrQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdhc2QgPDAgcXdlJyxcblx0XHRcdFx0J2FzZCAwPiBxd2UnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCA1LCAxLCA1KSxcblx0XHRcdFtcblx0XHRcdFx0J2FzZCBxd2UnLFxuXHRcdFx0XHQnYXNkIHF3ZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDIsIDQpXG5cdFx0KTtcblxuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnYXNkIDwwIHF3ZScsXG5cdFx0XHRcdCdhc2QgMD4gcXdlJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNSwgMSwgMTEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnYXNkIHF3ZScsXG5cdFx0XHRcdCdhc2QgcXdlJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMiwgNClcblx0XHQpO1xuXG5cdFx0dGVzdEJsb2NrQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdhc2QgPDAgcXdlJyxcblx0XHRcdFx0J2FzZCAwPiBxd2UnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAxLCAxMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdhc2QgcXdlJyxcblx0XHRcdFx0J2FzZCBxd2UnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAyLCA0KVxuXHRcdCk7XG5cblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2FzZCA8MCBxd2UnLFxuXHRcdFx0XHQnYXNkIDA+IHF3ZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDcsIDEsIDExKSxcblx0XHRcdFtcblx0XHRcdFx0J2FzZCBxd2UnLFxuXHRcdFx0XHQnYXNkIHF3ZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDIsIDQpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnICMzMDM1OCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JzwwIHN0YXJ0IDA+IG1pZGRsZSBlbmQnLFxuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjAsIDEsIDIzKSxcblx0XHRcdFtcblx0XHRcdFx0JzwwIHN0YXJ0IDA+IG1pZGRsZSA8MCBlbmQgMD4nXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyMywgMSwgMjYpXG5cdFx0KTtcblxuXHRcdHRlc3RCbG9ja0NvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnPDAgc3RhcnQgMD4gbWlkZGxlIDwwIGVuZCAwPidcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxOSksXG5cdFx0XHRbXG5cdFx0XHRcdCc8MCBzdGFydCAwPiA8MCBtaWRkbGUgMD4gPDAgZW5kIDA+J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTYsIDEsIDIyKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNDYxOCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0QmxvY2tDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JzwwICAwPiBtaWRkbGUgZW5kJyxcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLFxuXHRcdFx0W1xuXHRcdFx0XHQnIG1pZGRsZSBlbmQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydFNwYWNlIGZhbHNlJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RMaW5lQ29tbWVudENvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRcdF90ZXN0Q29tbWVudENvbW1hbmQobGluZXMsIHNlbGVjdGlvbiwgKGFjY2Vzc29yLCBzZWwpID0+IG5ldyBCbG9ja0NvbW1lbnRDb21tYW5kKHNlbCwgZmFsc2UsIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbik7XG5cdFx0fVxuXG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J3NvbWUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnPDBzb21lMD4gdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDcpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0U3BhY2UgZmFsc2UgZG9lcyBub3QgcmVtb3ZlIHNwYWNlJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RMaW5lQ29tbWVudENvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0XHRcdF90ZXN0Q29tbWVudENvbW1hbmQobGluZXMsIHNlbGVjdGlvbiwgKGFjY2Vzc29yLCBzZWwpID0+IG5ldyBCbG9ja0NvbW1lbnRDb21tYW5kKHNlbCwgZmFsc2UsIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbik7XG5cdFx0fVxuXG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JzwwIHNvbWUgMD4gdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDgpLFxuXHRcdFx0W1xuXHRcdFx0XHQnIHNvbWUgIHRleHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA3KVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQjtBQUc1QixTQUFTLG9CQUFvQixPQUFpQixXQUFzQixnQkFBZ0YsZUFBeUIsbUJBQW9DO0FBQ2hOLFFBQU0sYUFBYTtBQUNuQixRQUFNLFVBQVUsQ0FBQyxVQUE0QixnQkFBaUM7QUFDN0UsVUFBTSwrQkFBK0IsU0FBUyxJQUFJLDZCQUE2QjtBQUMvRSxVQUFNLGtCQUFrQixTQUFTLElBQUksZ0JBQWdCO0FBQ3JELGdCQUFZLElBQUksZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksV0FBVyxDQUFDLENBQUM7QUFDcEUsZ0JBQVksSUFBSSw2QkFBNkIsU0FBUyxZQUFZO0FBQUEsTUFDakUsVUFBVSxFQUFFLGFBQWEsT0FBTyxjQUFjLENBQUMsTUFBTSxJQUFJLEVBQUU7QUFBQSxJQUM1RCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0EsY0FBWSxPQUFPLFlBQVksV0FBVyxnQkFBZ0IsZUFBZSxtQkFBbUIsUUFBVyxPQUFPO0FBQy9HO0FBRUEsU0FBUyx3QkFBd0IsT0FBaUIsV0FBc0IsZUFBeUIsbUJBQW9DO0FBQ3BJLHNCQUFvQixPQUFPLFdBQVcsQ0FBQyxVQUFVLFFBQVEsSUFBSSxvQkFBb0IsS0FBSyxNQUFNLFNBQVMsSUFBSSw2QkFBNkIsQ0FBQyxHQUFHLGVBQWUsaUJBQWlCO0FBQzNLO0FBRUEsTUFBTSwwQ0FBMEMsTUFBTTtBQUVyRCwwQ0FBd0M7QUFFeEMsT0FBSyxnQ0FBZ0MsV0FBWTtBQUNoRDtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtCQUErQixXQUFZO0FBQy9DO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN4QjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssV0FBVyxNQUFNO0FBQ3JCO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN4QjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUVBO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN4QjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0JBQXNCLFdBQVk7QUFDdEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw2QkFBNkIsV0FBWTtBQUM3QztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsTUFDekI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdCQUF3QixXQUFZO0FBQ3hDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN4QjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssK0JBQStCLFdBQVk7QUFDL0M7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBRUE7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBRUE7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBRUE7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBRUE7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxpQkFBaUIsV0FBWTtBQUNqQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsTUFDekI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsTUFDekI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsTUFDekI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGNBQWMsV0FBWTtBQUM5QjtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxNQUMxQjtBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLElBQzNCO0FBRUE7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDMUI7QUFBQSxRQUNDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxJQUMzQjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssZ0JBQWdCLFdBQVk7QUFDaEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUJBQXFCLE1BQU07QUFDL0IsYUFBUyx1QkFBdUIsT0FBaUIsV0FBc0IsZUFBeUIsbUJBQW9DO0FBQ25JLDBCQUFvQixPQUFPLFdBQVcsQ0FBQyxVQUFVLFFBQVEsSUFBSSxvQkFBb0IsS0FBSyxPQUFPLFNBQVMsSUFBSSw2QkFBNkIsQ0FBQyxHQUFHLGVBQWUsaUJBQWlCO0FBQUEsSUFDNUs7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN4QjtBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxhQUFTLHVCQUF1QixPQUFpQixXQUFzQixlQUF5QixtQkFBb0M7QUFDbkksMEJBQW9CLE9BQU8sV0FBVyxDQUFDLFVBQVUsUUFBUSxJQUFJLG9CQUFvQixLQUFLLE9BQU8sU0FBUyxJQUFJLDZCQUE2QixDQUFDLEdBQUcsZUFBZSxpQkFBaUI7QUFBQSxJQUM1SztBQUVBO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
