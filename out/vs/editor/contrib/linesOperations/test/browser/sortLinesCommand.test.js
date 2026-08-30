import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Selection } from "../../../../common/core/selection.js";
import { SortLinesCommand } from "../../browser/sortLinesCommand.js";
import { testCommand } from "../../../../test/browser/testCommand.js";
function testSortLinesAscendingCommand(lines, selection, expectedLines, expectedSelection) {
  testCommand(lines, null, selection, (accessor, sel) => new SortLinesCommand(sel, false), expectedLines, expectedSelection);
}
function testSortLinesDescendingCommand(lines, selection, expectedLines, expectedSelection) {
  testCommand(lines, null, selection, (accessor, sel) => new SortLinesCommand(sel, true), expectedLines, expectedSelection);
}
suite("Editor Contrib - Sort Lines Command", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no op unless at least two lines selected 1", function() {
    testSortLinesAscendingCommand(
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
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 1)
    );
  });
  test("no op unless at least two lines selected 2", function() {
    testSortLinesAscendingCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 2, 1),
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 2, 1)
    );
  });
  test("sorting two lines ascending", function() {
    testSortLinesAscendingCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 3, 4, 2),
      [
        "first",
        "second line",
        "fourth line",
        "third line",
        "fifth"
      ],
      new Selection(3, 3, 4, 1)
    );
  });
  test("sorting first 4 lines ascending", function() {
    testSortLinesAscendingCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 5, 1),
      [
        "first",
        "fourth line",
        "second line",
        "third line",
        "fifth"
      ],
      new Selection(1, 1, 5, 1)
    );
  });
  test("sorting all lines ascending", function() {
    testSortLinesAscendingCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 5, 6),
      [
        "fifth",
        "first",
        "fourth line",
        "second line",
        "third line"
      ],
      new Selection(1, 1, 5, 11)
    );
  });
  test("sorting first 4 lines descending", function() {
    testSortLinesDescendingCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 5, 1),
      [
        "third line",
        "second line",
        "fourth line",
        "first",
        "fifth"
      ],
      new Selection(1, 1, 5, 1)
    );
  });
  test("sorting all lines descending", function() {
    testSortLinesDescendingCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 5, 6),
      [
        "third line",
        "second line",
        "fourth line",
        "first",
        "fifth"
      ],
      new Selection(1, 1, 5, 6)
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmVzT3BlcmF0aW9uc1xcdGVzdFxcYnJvd3Nlclxcc29ydExpbmVzQ29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgU29ydExpbmVzQ29tbWFuZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc29ydExpbmVzQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyB0ZXN0Q29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci90ZXN0Q29tbWFuZC5qcyc7XG5cbmZ1bmN0aW9uIHRlc3RTb3J0TGluZXNBc2NlbmRpbmdDb21tYW5kKGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGV4cGVjdGVkTGluZXM6IHN0cmluZ1tdLCBleHBlY3RlZFNlbGVjdGlvbjogU2VsZWN0aW9uKTogdm9pZCB7XG5cdHRlc3RDb21tYW5kKGxpbmVzLCBudWxsLCBzZWxlY3Rpb24sIChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgU29ydExpbmVzQ29tbWFuZChzZWwsIGZhbHNlKSwgZXhwZWN0ZWRMaW5lcywgZXhwZWN0ZWRTZWxlY3Rpb24pO1xufVxuXG5mdW5jdGlvbiB0ZXN0U29ydExpbmVzRGVzY2VuZGluZ0NvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0dGVzdENvbW1hbmQobGluZXMsIG51bGwsIHNlbGVjdGlvbiwgKGFjY2Vzc29yLCBzZWwpID0+IG5ldyBTb3J0TGluZXNDb21tYW5kKHNlbCwgdHJ1ZSksIGV4cGVjdGVkTGluZXMsIGV4cGVjdGVkU2VsZWN0aW9uKTtcbn1cblxuc3VpdGUoJ0VkaXRvciBDb250cmliIC0gU29ydCBMaW5lcyBDb21tYW5kJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ25vIG9wIHVubGVzcyBhdCBsZWFzdCB0d28gbGluZXMgc2VsZWN0ZWQgMScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0U29ydExpbmVzQXNjZW5kaW5nQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIG9wIHVubGVzcyBhdCBsZWFzdCB0d28gbGluZXMgc2VsZWN0ZWQgMicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0U29ydExpbmVzQXNjZW5kaW5nQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAyLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRpbmcgdHdvIGxpbmVzIGFzY2VuZGluZycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0U29ydExpbmVzQXNjZW5kaW5nQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigzLCAzLCA0LCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigzLCAzLCA0LCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRpbmcgZmlyc3QgNCBsaW5lcyBhc2NlbmRpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdFNvcnRMaW5lc0FzY2VuZGluZ0NvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0aW5nIGFsbCBsaW5lcyBhc2NlbmRpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdFNvcnRMaW5lc0FzY2VuZGluZ0NvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgNiksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaWZ0aCcsXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDExKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRpbmcgZmlyc3QgNCBsaW5lcyBkZXNjZW5kaW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RTb3J0TGluZXNEZXNjZW5kaW5nQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnRpbmcgYWxsIGxpbmVzIGRlc2NlbmRpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdFNvcnRMaW5lc0Rlc2NlbmRpbmdDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDYpLFxuXHRcdFx0W1xuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdmaWZ0aCcsXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCA2KVxuXHRcdCk7XG5c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
