import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Selection } from "../../../../common/core/selection.js";
import { CopyLinesCommand } from "../../browser/copyLinesCommand.js";
import { DuplicateSelectionAction } from "../../browser/linesOperations.js";
import { withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { testCommand } from "../../../../test/browser/testCommand.js";
function testCopyLinesDownCommand(lines, selection, expectedLines, expectedSelection) {
  testCommand(lines, null, selection, (accessor, sel) => new CopyLinesCommand(sel, true), expectedLines, expectedSelection);
}
function testCopyLinesUpCommand(lines, selection, expectedLines, expectedSelection) {
  testCommand(lines, null, selection, (accessor, sel) => new CopyLinesCommand(sel, false), expectedLines, expectedSelection);
}
suite("Editor Contrib - Copy Lines Command", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("copy first line down", function() {
    testCopyLinesDownCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 1),
      [
        "first",
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 3, 2, 1)
    );
  });
  test("copy first line up", function() {
    testCopyLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 1),
      [
        "first",
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 1)
    );
  });
  test("copy last line down", function() {
    testCopyLinesDownCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 3, 5, 1),
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth",
        "fifth"
      ],
      new Selection(6, 3, 6, 1)
    );
  });
  test("copy last line up", function() {
    testCopyLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 3, 5, 1),
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth",
        "fifth"
      ],
      new Selection(5, 3, 5, 1)
    );
  });
  test("issue #1322: copy line up", function() {
    testCopyLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 11, 3, 11),
      [
        "first",
        "second line",
        "third line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 11, 3, 11)
    );
  });
  test("issue #1322: copy last line up", function() {
    testCopyLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 6, 5, 6),
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth",
        "fifth"
      ],
      new Selection(5, 6, 5, 6)
    );
  });
  test("copy many lines up", function() {
    testCopyLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(4, 3, 2, 1),
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(4, 3, 2, 1)
    );
  });
  test("ignore empty selection", function() {
    testCopyLinesUpCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 1, 1),
      [
        "first",
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 1, 1)
    );
  });
});
suite("Editor Contrib - Duplicate Selection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const duplicateSelectionAction = new DuplicateSelectionAction();
  function testDuplicateSelectionAction(lines, selections, expectedLines, expectedSelections) {
    withTestCodeEditor(lines.join("\n"), {}, (editor) => {
      editor.setSelections(selections);
      duplicateSelectionAction.run(null, editor, {});
      assert.deepStrictEqual(editor.getValue(), expectedLines.join("\n"));
      assert.deepStrictEqual(editor.getSelections().map((s) => s.toString()), expectedSelections.map((s) => s.toString()));
    });
  }
  test("empty selection", function() {
    testDuplicateSelectionAction(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      [new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)],
      [
        "first",
        "second line",
        "second line",
        "third line",
        "third line",
        "fourth line",
        "fifth"
      ],
      [new Selection(3, 2, 3, 2), new Selection(5, 2, 5, 2)]
    );
  });
  test("with selection", function() {
    testDuplicateSelectionAction(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      [new Selection(2, 1, 2, 4), new Selection(3, 1, 3, 4)],
      [
        "first",
        "secsecond line",
        "thithird line",
        "fourth line",
        "fifth"
      ],
      [new Selection(2, 4, 2, 7), new Selection(3, 4, 3, 7)]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmVzT3BlcmF0aW9uc1xcdGVzdFxcYnJvd3NlclxcY29weUxpbmVzQ29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29weUxpbmVzQ29tbWFuZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY29weUxpbmVzQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBEdXBsaWNhdGVTZWxlY3Rpb25BY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2xpbmVzT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyB3aXRoVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgdGVzdENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvbW1hbmQuanMnO1xuXG5mdW5jdGlvbiB0ZXN0Q29weUxpbmVzRG93bkNvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0dGVzdENvbW1hbmQobGluZXMsIG51bGwsIHNlbGVjdGlvbiwgKGFjY2Vzc29yLCBzZWwpID0+IG5ldyBDb3B5TGluZXNDb21tYW5kKHNlbCwgdHJ1ZSksIGV4cGVjdGVkTGluZXMsIGV4cGVjdGVkU2VsZWN0aW9uKTtcbn1cblxuZnVuY3Rpb24gdGVzdENvcHlMaW5lc1VwQ29tbWFuZChsaW5lczogc3RyaW5nW10sIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBleHBlY3RlZExpbmVzOiBzdHJpbmdbXSwgZXhwZWN0ZWRTZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuXHR0ZXN0Q29tbWFuZChsaW5lcywgbnVsbCwgc2VsZWN0aW9uLCAoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IENvcHlMaW5lc0NvbW1hbmQoc2VsLCBmYWxzZSksIGV4cGVjdGVkTGluZXMsIGV4cGVjdGVkU2VsZWN0aW9uKTtcbn1cblxuc3VpdGUoJ0VkaXRvciBDb250cmliIC0gQ29weSBMaW5lcyBDb21tYW5kJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NvcHkgZmlyc3QgbGluZSBkb3duJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RDb3B5TGluZXNEb3duQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAzLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgZmlyc3QgbGluZSB1cCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0Q29weUxpbmVzVXBDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29weSBsYXN0IGxpbmUgZG93bicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0Q29weUxpbmVzRG93bkNvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgMywgNSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgMywgNiwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IGxhc3QgbGluZSB1cCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0Q29weUxpbmVzVXBDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDMsIDUsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCcsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDMsIDUsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEzMjI6IGNvcHkgbGluZSB1cCcsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0Q29weUxpbmVzVXBDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDExLCAzLCAxMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxMSwgMywgMTEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEzMjI6IGNvcHkgbGFzdCBsaW5lIHVwJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RDb3B5TGluZXNVcENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNiwgNSwgNiksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNiwgNSwgNilcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3B5IG1hbnkgbGluZXMgdXAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdENvcHlMaW5lc1VwQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAzLCAyLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDMsIDIsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlIGVtcHR5IHNlbGVjdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0Q29weUxpbmVzVXBDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0VkaXRvciBDb250cmliIC0gRHVwbGljYXRlIFNlbGVjdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBkdXBsaWNhdGVTZWxlY3Rpb25BY3Rpb24gPSBuZXcgRHVwbGljYXRlU2VsZWN0aW9uQWN0aW9uKCk7XG5cblx0ZnVuY3Rpb24gdGVzdER1cGxpY2F0ZVNlbGVjdGlvbkFjdGlvbihsaW5lczogc3RyaW5nW10sIHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdLCBleHBlY3RlZExpbmVzOiBzdHJpbmdbXSwgZXhwZWN0ZWRTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihsaW5lcy5qb2luKCdcXG4nKSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnMpO1xuXHRcdFx0ZHVwbGljYXRlU2VsZWN0aW9uQWN0aW9uLnJ1bihudWxsISwgZWRpdG9yLCB7fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCBleHBlY3RlZExpbmVzLmpvaW4oJ1xcbicpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubWFwKHMgPT4gcy50b1N0cmluZygpKSwgZXhwZWN0ZWRTZWxlY3Rpb25zLm1hcChzID0+IHMudG9TdHJpbmcoKSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnZW1wdHkgc2VsZWN0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3REdXBsaWNhdGVTZWxlY3Rpb25BY3Rpb24oXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpLCBuZXcgU2VsZWN0aW9uKDMsIDIsIDMsIDIpXSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRbbmV3IFNlbGVjdGlvbigzLCAyLCAzLCAyKSwgbmV3IFNlbGVjdGlvbig1LCAyLCA1LCAyKV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRoIHNlbGVjdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0RHVwbGljYXRlU2VsZWN0aW9uQWN0aW9uKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRbbmV3IFNlbGVjdGlvbigyLCAxLCAyLCA0KSwgbmV3IFNlbGVjdGlvbigzLCAxLCAzLCA0KV0sXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGl0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdFtuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDcpLCBuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDcpXVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyx5QkFBeUIsT0FBaUIsV0FBc0IsZUFBeUIsbUJBQW9DO0FBQ3JJLGNBQVksT0FBTyxNQUFNLFdBQVcsQ0FBQyxVQUFVLFFBQVEsSUFBSSxpQkFBaUIsS0FBSyxJQUFJLEdBQUcsZUFBZSxpQkFBaUI7QUFDekg7QUFFQSxTQUFTLHVCQUF1QixPQUFpQixXQUFzQixlQUF5QixtQkFBb0M7QUFDbkksY0FBWSxPQUFPLE1BQU0sV0FBVyxDQUFDLFVBQVUsUUFBUSxJQUFJLGlCQUFpQixLQUFLLEtBQUssR0FBRyxlQUFlLGlCQUFpQjtBQUMxSDtBQUVBLE1BQU0sdUNBQXVDLE1BQU07QUFFbEQsMENBQXdDO0FBRXhDLE9BQUssd0JBQXdCLFdBQVk7QUFDeEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0JBQXNCLFdBQVk7QUFDdEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssdUJBQXVCLFdBQVk7QUFDdkM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUsscUJBQXFCLFdBQVk7QUFDckM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssNkJBQTZCLFdBQVk7QUFDN0M7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQzFCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxJQUMzQjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0NBQWtDLFdBQVk7QUFDbEQ7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxJQUN6QjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssc0JBQXNCLFdBQVk7QUFDdEM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywwQkFBMEIsV0FBWTtBQUMxQztBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sd0NBQXdDLE1BQU07QUFFbkQsMENBQXdDO0FBRXhDLFFBQU0sMkJBQTJCLElBQUkseUJBQXlCO0FBRTlELFdBQVMsNkJBQTZCLE9BQWlCLFlBQXlCLGVBQXlCLG9CQUF1QztBQUMvSSx1QkFBbUIsTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxXQUFXO0FBQ3BELGFBQU8sY0FBYyxVQUFVO0FBQy9CLCtCQUF5QixJQUFJLE1BQU8sUUFBUSxDQUFDLENBQUM7QUFDOUMsYUFBTyxnQkFBZ0IsT0FBTyxTQUFTLEdBQUcsY0FBYyxLQUFLLElBQUksQ0FBQztBQUNsRSxhQUFPLGdCQUFnQixPQUFPLGNBQWMsRUFBRyxJQUFJLE9BQUssRUFBRSxTQUFTLENBQUMsR0FBRyxtQkFBbUIsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFBQSxJQUNqSCxDQUFDO0FBQUEsRUFDRjtBQUVBLE9BQUssbUJBQW1CLFdBQVk7QUFDbkM7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3JEO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDdEQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixXQUFZO0FBQ2xDO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNyRDtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUN0RDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
