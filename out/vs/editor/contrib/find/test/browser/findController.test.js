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
import { Delayer } from "../../../../../base/common/async.js";
import * as platform from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { EditOperation } from "../../../../common/core/editOperation.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { CommonFindController, FindStartFocusAction, NextMatchFindAction, NextSelectionMatchFindAction, StartFindAction, StartFindReplaceAction, StartFindWithSelectionAction } from "../../browser/findController.js";
import { CONTEXT_FIND_INPUT_FOCUSED } from "../../browser/findModel.js";
import { withAsyncTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { IStorageService, InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
let TestFindController = class extends CommonFindController {
  constructor(editor, contextKeyService, storageService, clipboardService, notificationService, hoverService) {
    super(editor, contextKeyService, storageService, clipboardService, notificationService, hoverService);
    this.delayUpdateHistory = false;
    this._findInputFocused = CONTEXT_FIND_INPUT_FOCUSED.bindTo(contextKeyService);
    this._updateHistoryDelayer = new Delayer(50);
    this.hasFocus = false;
  }
  async _start(opts) {
    await super._start(opts);
    if (opts.shouldFocus !== FindStartFocusAction.NoFocusChange) {
      this.hasFocus = true;
    }
    const inputFocused = opts.shouldFocus === FindStartFocusAction.FocusFindInput;
    this._findInputFocused.set(inputFocused);
  }
};
TestFindController = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IStorageService),
  __decorateParam(3, IClipboardService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IHoverService)
], TestFindController);
function fromSelection(slc) {
  return [slc.startLineNumber, slc.startColumn, slc.endLineNumber, slc.endColumn];
}
function executeAction(instantiationService, editor, action, args) {
  return instantiationService.invokeFunction((accessor) => {
    return Promise.resolve(action.runEditorCommand(accessor, editor, args));
  });
}
suite("FindController", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let clipboardState = "";
  const serviceCollection = new ServiceCollection();
  serviceCollection.set(IStorageService, new InMemoryStorageService());
  if (platform.isMacintosh) {
    serviceCollection.set(IClipboardService, {
      readFindText: () => clipboardState,
      writeFindText: (value) => {
        clipboardState = value;
      }
    });
  }
  test('issue #1857: F3, Find Next, acts like "Find Under Cursor"', async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "ABC",
      "XYZ",
      "ABC"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const findState = findController.getState();
      const nextMatchFindAction = NextMatchFindAction;
      await executeAction(instantiationService, editor, StartFindAction);
      findState.change({ searchString: "A" }, true);
      findState.change({ searchString: "AB" }, true);
      findState.change({ searchString: "ABC" }, true);
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 1, 1, 4]);
      findController.closeFindWidget();
      findController.hasFocus = false;
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 1, 1, 4]);
      editor.pushUndoStop();
      editor.executeEdits("test", [EditOperation.delete(new Range(1, 1, 1, 4))]);
      editor.executeEdits("test", [EditOperation.insert(new Position(1, 1), "XYZ")]);
      editor.pushUndoStop();
      assert.strictEqual(editor.getModel().getLineContent(1), "XYZ");
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 4, 1, 4]);
      await editor.runAction(nextMatchFindAction);
      assert.strictEqual(findState.searchString, "ABC");
      assert.strictEqual(findController.hasFocus, false);
      findController.dispose();
    });
  });
  test("issue #3090: F3 does not loop with two matches on a single line", async () => {
    await withAsyncTestCodeEditor([
      "import nls = require('vs/nls');"
    ], { serviceCollection }, async (editor) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const nextMatchFindAction = NextMatchFindAction;
      editor.setPosition({
        lineNumber: 1,
        column: 9
      });
      await editor.runAction(nextMatchFindAction);
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 26, 1, 29]);
      await editor.runAction(nextMatchFindAction);
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 8, 1, 11]);
      findController.dispose();
    });
  });
  test("issue #6149: Auto-escape highlighted text for search and replace regex mode", async () => {
    await withAsyncTestCodeEditor([
      "var x = (3 * 5)",
      "var y = (3 * 5)",
      "var z = (3  * 5)"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const nextMatchFindAction = NextMatchFindAction;
      editor.setSelection(new Selection(1, 9, 1, 13));
      findController.toggleRegex();
      await executeAction(instantiationService, editor, StartFindAction);
      await editor.runAction(nextMatchFindAction);
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [2, 9, 2, 13]);
      await editor.runAction(nextMatchFindAction);
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [1, 9, 1, 13]);
      findController.dispose();
    });
  });
  test("issue #41027: Don't replace find input value on replace action if find input is active", async () => {
    await withAsyncTestCodeEditor([
      "test"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      const testRegexString = "tes.";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const nextMatchFindAction = NextMatchFindAction;
      findController.toggleRegex();
      findController.setSearchString(testRegexString);
      await findController.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: FindStartFocusAction.FocusFindInput,
        shouldAnimate: false,
        updateSearchScope: false,
        loop: true
      });
      await editor.runAction(nextMatchFindAction);
      await executeAction(instantiationService, editor, StartFindReplaceAction);
      assert.strictEqual(findController.getState().searchString, testRegexString);
      findController.dispose();
    });
  });
  test("editor.find.closeOnResult: closes find widget when a match is found from explicit navigation", async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "ABC",
      "XYZ"
    ], { serviceCollection, find: { closeOnResult: true } }, async (editor, _, instantiationService) => {
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const findState = findController.getState();
      await executeAction(instantiationService, editor, StartFindAction);
      assert.strictEqual(findState.isRevealed, true);
      findState.change({ searchString: "ABC" }, true);
      await editor.runAction(NextMatchFindAction);
      assert.strictEqual(findState.isRevealed, false);
      findController.dispose();
    });
  });
  test("editor.find.closeOnResult: keeps find widget open when no match is found", async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "DEF",
      "XYZ"
    ], { serviceCollection, find: { closeOnResult: true } }, async (editor, _, instantiationService) => {
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const findState = findController.getState();
      await executeAction(instantiationService, editor, StartFindAction);
      assert.strictEqual(findState.isRevealed, true);
      findState.change({ searchString: "NO_MATCH" }, true);
      await editor.runAction(NextMatchFindAction);
      assert.strictEqual(findState.matchesCount, 0);
      assert.strictEqual(findState.isRevealed, true);
      findController.dispose();
    });
  });
  test("editor.find.closeOnResult: disabled keeps find widget open after navigation", async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "ABC",
      "XYZ"
    ], { serviceCollection, find: { closeOnResult: false } }, async (editor, _, instantiationService) => {
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const findState = findController.getState();
      await executeAction(instantiationService, editor, StartFindAction);
      assert.strictEqual(findState.isRevealed, true);
      findState.change({ searchString: "ABC" }, true);
      await editor.runAction(NextMatchFindAction);
      assert.strictEqual(findState.isRevealed, true);
      findController.dispose();
    });
  });
  test("issue #9043: Clear search scope when find widget is hidden", async () => {
    await withAsyncTestCodeEditor([
      "var x = (3 * 5)",
      "var y = (3 * 5)",
      "var z = (3 * 5)"
    ], { serviceCollection }, async (editor) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      await findController.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: FindStartFocusAction.NoFocusChange,
        shouldAnimate: false,
        updateSearchScope: false,
        loop: true
      });
      assert.strictEqual(findController.getState().searchScope, null);
      findController.getState().change({
        searchScope: [new Range(1, 1, 1, 5)]
      }, false);
      assert.deepStrictEqual(findController.getState().searchScope, [new Range(1, 1, 1, 5)]);
      findController.closeFindWidget();
      assert.strictEqual(findController.getState().searchScope, null);
    });
  });
  test("issue #18111: Regex replace with single space replaces with no space", async () => {
    await withAsyncTestCodeEditor([
      "HRESULT OnAmbientPropertyChange(DISPID   dispid);"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      await executeAction(instantiationService, editor, StartFindAction);
      findController.getState().change({ searchString: "\\b\\s{3}\\b", replaceString: " ", isRegex: true }, false);
      findController.moveToNextMatch();
      assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
        [1, 39, 1, 42]
      ]);
      findController.replace();
      assert.deepStrictEqual(editor.getValue(), "HRESULT OnAmbientPropertyChange(DISPID dispid);");
      findController.dispose();
    });
  });
  test("issue #24714: Regular expression with ^ in search & replace", async () => {
    await withAsyncTestCodeEditor([
      "",
      "line2",
      "line3"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      await executeAction(instantiationService, editor, StartFindAction);
      findController.getState().change({ searchString: "^", replaceString: "x", isRegex: true }, false);
      findController.moveToNextMatch();
      assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
        [2, 1, 2, 1]
      ]);
      findController.replace();
      assert.deepStrictEqual(editor.getValue(), "\nxline2\nline3");
      findController.dispose();
    });
  });
  test("issue #38232: Find Next Selection, regex enabled", async () => {
    await withAsyncTestCodeEditor([
      "([funny]",
      "",
      "([funny]"
    ], { serviceCollection }, async (editor) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const nextSelectionMatchFindAction = new NextSelectionMatchFindAction();
      findController.getState().change({ isRegex: true }, false);
      editor.setSelection(new Selection(1, 1, 1, 9));
      await editor.runAction(nextSelectionMatchFindAction);
      assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
        [3, 1, 3, 9]
      ]);
      findController.dispose();
    });
  });
  test("issue #38232: Find Next Selection, regex enabled, find widget open", async () => {
    await withAsyncTestCodeEditor([
      "([funny]",
      "",
      "([funny]"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const nextSelectionMatchFindAction = new NextSelectionMatchFindAction();
      await executeAction(instantiationService, editor, StartFindAction);
      findController.getState().change({ isRegex: true }, false);
      editor.setSelection(new Selection(1, 1, 1, 9));
      await editor.runAction(nextSelectionMatchFindAction);
      assert.deepStrictEqual(editor.getSelections().map(fromSelection), [
        [3, 1, 3, 9]
      ]);
      findController.dispose();
    });
  });
  test("issue #47400, CMD+E supports feeding multiple line of text into the find widget", async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "ABC",
      "XYZ",
      "ABC",
      "ABC"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      editor.setSelection(new Selection(1, 1, 1, 1));
      await executeAction(instantiationService, editor, StartFindAction);
      editor.setSelection(new Selection(1, 1, 2, 4));
      const startFindWithSelectionAction = new StartFindWithSelectionAction();
      await editor.runAction(startFindWithSelectionAction);
      const findState = findController.getState();
      assert.deepStrictEqual(findState.searchString.split(/\r\n|\r|\n/g), ["ABC", "ABC"]);
      editor.setSelection(new Selection(3, 1, 3, 1));
      await editor.runAction(startFindWithSelectionAction);
      findController.dispose();
    });
  });
  test("issue #109756, CMD+E with empty cursor should always work", async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "ABC",
      "XYZ",
      "ABC",
      "ABC"
    ], { serviceCollection }, async (editor) => {
      clipboardState = "";
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      editor.setSelection(new Selection(1, 2, 1, 2));
      const startFindWithSelectionAction = new StartFindWithSelectionAction();
      editor.runAction(startFindWithSelectionAction);
      const findState = findController.getState();
      assert.deepStrictEqual(findState.searchString, "ABC");
      findController.dispose();
    });
  });
});
suite("FindController query options persistence", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const serviceCollection = new ServiceCollection();
  const storageService = new InMemoryStorageService();
  storageService.store("editor.isRegex", false, StorageScope.WORKSPACE, StorageTarget.USER);
  storageService.store("editor.matchCase", false, StorageScope.WORKSPACE, StorageTarget.USER);
  storageService.store("editor.wholeWord", false, StorageScope.WORKSPACE, StorageTarget.USER);
  serviceCollection.set(IStorageService, storageService);
  test("matchCase", async () => {
    await withAsyncTestCodeEditor([
      "abc",
      "ABC",
      "XYZ",
      "ABC"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      storageService.store("editor.matchCase", true, StorageScope.WORKSPACE, StorageTarget.USER);
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const findState = findController.getState();
      await executeAction(instantiationService, editor, StartFindAction);
      findState.change({ searchString: "ABC" }, true);
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [2, 1, 2, 4]);
      findController.dispose();
    });
  });
  storageService.store("editor.matchCase", false, StorageScope.WORKSPACE, StorageTarget.USER);
  storageService.store("editor.wholeWord", true, StorageScope.WORKSPACE, StorageTarget.USER);
  test("wholeWord", async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "AB",
      "XYZ",
      "ABC"
    ], { serviceCollection }, async (editor, _, instantiationService) => {
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const findState = findController.getState();
      await executeAction(instantiationService, editor, StartFindAction);
      findState.change({ searchString: "AB" }, true);
      assert.deepStrictEqual(fromSelection(editor.getSelection()), [2, 1, 2, 3]);
      findController.dispose();
    });
  });
  test("toggling options is saved", async () => {
    await withAsyncTestCodeEditor([
      "ABC",
      "AB",
      "XYZ",
      "ABC"
    ], { serviceCollection }, async (editor) => {
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      findController.toggleRegex();
      assert.strictEqual(storageService.getBoolean("editor.isRegex", StorageScope.WORKSPACE), true);
      findController.dispose();
    });
  });
  test("issue #27083: Update search scope once find widget becomes visible", async () => {
    await withAsyncTestCodeEditor([
      "var x = (3 * 5)",
      "var y = (3 * 5)",
      "var z = (3 * 5)"
    ], { serviceCollection, find: { autoFindInSelection: "always", globalFindClipboard: false } }, async (editor) => {
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      const findConfig = {
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: FindStartFocusAction.NoFocusChange,
        shouldAnimate: false,
        updateSearchScope: true,
        loop: true
      };
      editor.setSelection(new Range(1, 1, 2, 1));
      findController.start(findConfig);
      assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 1, 2, 1)]);
      findController.closeFindWidget();
      editor.setSelections([new Selection(1, 1, 2, 1), new Selection(2, 1, 2, 5)]);
      findController.start(findConfig);
      assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 1, 2, 1), new Selection(2, 1, 2, 5)]);
    });
  });
  test("issue #58604: Do not update searchScope if it is empty", async () => {
    await withAsyncTestCodeEditor([
      "var x = (3 * 5)",
      "var y = (3 * 5)",
      "var z = (3 * 5)"
    ], { serviceCollection, find: { autoFindInSelection: "always", globalFindClipboard: false } }, async (editor) => {
      editor.setSelection(new Range(1, 2, 1, 2));
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      await findController.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: FindStartFocusAction.NoFocusChange,
        shouldAnimate: false,
        updateSearchScope: true,
        loop: true
      });
      assert.deepStrictEqual(findController.getState().searchScope, null);
    });
  });
  test("issue #58604: Update searchScope if it is not empty", async () => {
    await withAsyncTestCodeEditor([
      "var x = (3 * 5)",
      "var y = (3 * 5)",
      "var z = (3 * 5)"
    ], { serviceCollection, find: { autoFindInSelection: "always", globalFindClipboard: false } }, async (editor) => {
      editor.setSelection(new Range(1, 2, 1, 3));
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      await findController.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: FindStartFocusAction.NoFocusChange,
        shouldAnimate: false,
        updateSearchScope: true,
        loop: true
      });
      assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 2, 1, 3)]);
    });
  });
  test("issue #27083: Find in selection when multiple lines are selected", async () => {
    await withAsyncTestCodeEditor([
      "var x = (3 * 5)",
      "var y = (3 * 5)",
      "var z = (3 * 5)"
    ], { serviceCollection, find: { autoFindInSelection: "multiline", globalFindClipboard: false } }, async (editor) => {
      editor.setSelection(new Range(1, 6, 2, 1));
      const findController = editor.registerAndInstantiateContribution(TestFindController.ID, TestFindController);
      await findController.start({
        forceRevealReplace: false,
        seedSearchStringFromSelection: "none",
        seedSearchStringFromNonEmptySelection: false,
        seedSearchStringFromGlobalClipboard: false,
        shouldFocus: FindStartFocusAction.NoFocusChange,
        shouldAnimate: false,
        updateSearchScope: true,
        loop: true
      });
      assert.deepStrictEqual(findController.getState().searchScope, [new Selection(1, 6, 2, 1)]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGZpbmRcXHRlc3RcXGJyb3dzZXJcXGZpbmRDb250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21tb25GaW5kQ29udHJvbGxlciwgRmluZFN0YXJ0Rm9jdXNBY3Rpb24sIElGaW5kU3RhcnRPcHRpb25zLCBOZXh0TWF0Y2hGaW5kQWN0aW9uLCBOZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uLCBTdGFydEZpbmRBY3Rpb24sIFN0YXJ0RmluZFJlcGxhY2VBY3Rpb24sIFN0YXJ0RmluZFdpdGhTZWxlY3Rpb25BY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2ZpbmRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENPTlRFWFRfRklORF9JTlBVVF9GT0NVU0VEIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9maW5kTW9kZWwuanMnO1xuaW1wb3J0IHsgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcblxuY2xhc3MgVGVzdEZpbmRDb250cm9sbGVyIGV4dGVuZHMgQ29tbW9uRmluZENvbnRyb2xsZXIge1xuXG5cdHB1YmxpYyBoYXNGb2N1czogYm9vbGVhbjtcblx0cHVibGljIGRlbGF5VXBkYXRlSGlzdG9yeTogYm9vbGVhbiA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2ZpbmRJbnB1dEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3IsIGNvbnRleHRLZXlTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgY2xpcGJvYXJkU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0XHR0aGlzLl9maW5kSW5wdXRGb2N1c2VkID0gQ09OVEVYVF9GSU5EX0lOUFVUX0ZPQ1VTRUQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl91cGRhdGVIaXN0b3J5RGVsYXllciA9IG5ldyBEZWxheWVyPHZvaWQ+KDUwKTtcblx0XHR0aGlzLmhhc0ZvY3VzID0gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgX3N0YXJ0KG9wdHM6IElGaW5kU3RhcnRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgc3VwZXIuX3N0YXJ0KG9wdHMpO1xuXG5cdFx0aWYgKG9wdHMuc2hvdWxkRm9jdXMgIT09IEZpbmRTdGFydEZvY3VzQWN0aW9uLk5vRm9jdXNDaGFuZ2UpIHtcblx0XHRcdHRoaXMuaGFzRm9jdXMgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlucHV0Rm9jdXNlZCA9IG9wdHMuc2hvdWxkRm9jdXMgPT09IEZpbmRTdGFydEZvY3VzQWN0aW9uLkZvY3VzRmluZElucHV0O1xuXHRcdHRoaXMuX2ZpbmRJbnB1dEZvY3VzZWQuc2V0KGlucHV0Rm9jdXNlZCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZnJvbVNlbGVjdGlvbihzbGM6IFNlbGVjdGlvbik6IG51bWJlcltdIHtcblx0cmV0dXJuIFtzbGMuc3RhcnRMaW5lTnVtYmVyLCBzbGMuc3RhcnRDb2x1bW4sIHNsYy5lbmRMaW5lTnVtYmVyLCBzbGMuZW5kQ29sdW1uXTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZUFjdGlvbihpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhY3Rpb246IEVkaXRvckFjdGlvbiwgYXJncz86IGFueSk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShhY3Rpb24ucnVuRWRpdG9yQ29tbWFuZChhY2Nlc3NvciwgZWRpdG9yLCBhcmdzKSk7XG5cdH0pO1xufVxuXG5zdWl0ZSgnRmluZENvbnRyb2xsZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGNsaXBib2FyZFN0YXRlID0gJyc7XG5cdGNvbnN0IHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdHNlcnZpY2VDb2xsZWN0aW9uLnNldChJU3RvcmFnZVNlcnZpY2UsIG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uLnNldChJQ2xpcGJvYXJkU2VydmljZSwgPGFueT57XG5cdFx0XHRyZWFkRmluZFRleHQ6ICgpID0+IGNsaXBib2FyZFN0YXRlLFxuXHRcdFx0d3JpdGVGaW5kVGV4dDogKHZhbHVlOiBhbnkpID0+IHsgY2xpcGJvYXJkU3RhdGUgPSB2YWx1ZTsgfVxuXHRcdH0pO1xuXHR9XG5cblx0LyogdGVzdCgnc3RvcmVzIHRvIHRoZSBnbG9iYWwgY2xpcGJvYXJkIGJ1ZmZlciBvbiBzdGFydCBmaW5kIGFjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnQUJDJyxcblx0XHRcdCdBQkMnLFxuXHRcdFx0J1hZWicsXG5cdFx0XHQnQUJDJ1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRcdGNsaXBib2FyZFN0YXRlID0gJyc7XG5cdFx0XHRpZiAoIXBsYXRmb3JtLmlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdGFzc2VydC5vayh0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEZpbmRDb250cm9sbGVyLklELCBUZXN0RmluZENvbnRyb2xsZXIpO1xuXHRcdFx0bGV0IHN0YXJ0RmluZEFjdGlvbiA9IG5ldyBTdGFydEZpbmRBY3Rpb24oKTtcblx0XHRcdC8vIEkgc2VsZWN0IEFCQyBvbiB0aGUgZmlyc3QgbGluZVxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpKTtcblx0XHRcdC8vIEkgaGl0IEN0cmwrRiB0byBzaG93IHRoZSBGaW5kIGRpYWxvZ1xuXHRcdFx0c3RhcnRGaW5kQWN0aW9uLnJ1bihudWxsLCBlZGl0b3IpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbmRDb250cm9sbGVyLmdldEdsb2JhbEJ1ZmZlclRlcm0oKSwgZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTdHJpbmcpO1xuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFkcyBmcm9tIHRoZSBnbG9iYWwgY2xpcGJvYXJkIGJ1ZmZlciBvbiBuZXh0IGZpbmQgYWN0aW9uIGlmIGJ1ZmZlciBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0FCQycsXG5cdFx0XHQnQUJDJyxcblx0XHRcdCdYWVonLFxuXHRcdFx0J0FCQydcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjbGlwYm9hcmRTdGF0ZSA9ICdBQkMnO1xuXG5cdFx0XHRpZiAoIXBsYXRmb3JtLmlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdGFzc2VydC5vayh0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRsZXQgZmluZFN0YXRlID0gZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKTtcblx0XHRcdGxldCBuZXh0TWF0Y2hGaW5kQWN0aW9uID0gbmV3IE5leHRNYXRjaEZpbmRBY3Rpb24oKTtcblxuXHRcdFx0bmV4dE1hdGNoRmluZEFjdGlvbi5ydW4obnVsbCwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuc2VhcmNoU3RyaW5nLCAnQUJDJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZnJvbVNlbGVjdGlvbihlZGl0b3IuZ2V0U2VsZWN0aW9uKCkhKSwgWzEsIDEsIDEsIDRdKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3cml0ZXMgdG8gdGhlIGdsb2JhbCBjbGlwYm9hcmQgYnVmZmVyIHdoZW4gdGV4dCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdBQkMnLFxuXHRcdFx0J0FCQycsXG5cdFx0XHQnWFlaJyxcblx0XHRcdCdBQkMnXG5cdFx0XSwgeyBzZXJ2aWNlQ29sbGVjdGlvbjogc2VydmljZUNvbGxlY3Rpb24gfSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y2xpcGJvYXJkU3RhdGUgPSAnJztcblx0XHRcdGlmICghcGxhdGZvcm0uaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RGaW5kQ29udHJvbGxlci5JRCwgVGVzdEZpbmRDb250cm9sbGVyKTtcblx0XHRcdGxldCBmaW5kU3RhdGUgPSBmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpO1xuXG5cdFx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnQUJDJyB9LCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kQ29udHJvbGxlci5nZXRHbG9iYWxCdWZmZXJUZXJtKCksICdBQkMnKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTsgKi9cblxuXHR0ZXN0KCdpc3N1ZSAjMTg1NzogRjMsIEZpbmQgTmV4dCwgYWN0cyBsaWtlIFwiRmluZCBVbmRlciBDdXJzb3JcIicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnQUJDJyxcblx0XHRcdCdBQkMnLFxuXHRcdFx0J1hZWicsXG5cdFx0XHQnQUJDJ1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IsIF8sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0Ly8gVGhlIGN1cnNvciBpcyBhdCB0aGUgdmVyeSB0b3AsIG9mIHRoZSBmaWxlLCBhdCB0aGUgZmlyc3QgQUJDXG5cdFx0XHRjb25zdCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RGaW5kQ29udHJvbGxlci5JRCwgVGVzdEZpbmRDb250cm9sbGVyKTtcblx0XHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cdFx0XHRjb25zdCBuZXh0TWF0Y2hGaW5kQWN0aW9uID0gTmV4dE1hdGNoRmluZEFjdGlvbjtcblxuXHRcdFx0Ly8gSSBoaXQgQ3RybCtGIHRvIHNob3cgdGhlIEZpbmQgZGlhbG9nXG5cdFx0XHRhd2FpdCBleGVjdXRlQWN0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3IsIFN0YXJ0RmluZEFjdGlvbik7XG5cblx0XHRcdC8vIEkgdHlwZSBBQkMuXG5cdFx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnQScgfSwgdHJ1ZSk7XG5cdFx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnQUInIH0sIHRydWUpO1xuXHRcdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ0FCQycgfSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFRoZSBmaXJzdCBBQkMgaXMgaGlnaGxpZ2h0ZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZyb21TZWxlY3Rpb24oZWRpdG9yLmdldFNlbGVjdGlvbigpISksIFsxLCAxLCAxLCA0XSk7XG5cblx0XHRcdC8vIEkgaGl0IEVzYyB0byBleGl0IHRoZSBGaW5kIGRpYWxvZy5cblx0XHRcdGZpbmRDb250cm9sbGVyLmNsb3NlRmluZFdpZGdldCgpO1xuXHRcdFx0ZmluZENvbnRyb2xsZXIuaGFzRm9jdXMgPSBmYWxzZTtcblxuXHRcdFx0Ly8gVGhlIGN1cnNvciBpcyBub3cgYXQgZW5kIG9mIHRoZSBmaXJzdCBsaW5lLCB3aXRoIEFCQyBvbiB0aGF0IGxpbmUgaGlnaGxpZ2h0ZWQuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZyb21TZWxlY3Rpb24oZWRpdG9yLmdldFNlbGVjdGlvbigpISksIFsxLCAxLCAxLCA0XSk7XG5cblx0XHRcdC8vIEkgaGl0IGRlbGV0ZSB0byByZW1vdmUgaXQgYW5kIGNoYW5nZSB0aGUgdGV4dCB0byBYWVouXG5cdFx0XHRlZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW0VkaXRPcGVyYXRpb24uZGVsZXRlKG5ldyBSYW5nZSgxLCAxLCAxLCA0KSldKTtcblx0XHRcdGVkaXRvci5leGVjdXRlRWRpdHMoJ3Rlc3QnLCBbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDEsIDEpLCAnWFlaJyldKTtcblx0XHRcdGVkaXRvci5wdXNoVW5kb1N0b3AoKTtcblxuXHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB0aGUgdGV4dCBlZGl0b3IgbG9va3MgbGlrZSB0aGlzOlxuXHRcdFx0Ly8gICBYWVpcblx0XHRcdC8vICAgQUJDXG5cdFx0XHQvLyAgIFhZWlxuXHRcdFx0Ly8gICBBQkNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvbnRlbnQoMSksICdYWVonKTtcblxuXHRcdFx0Ly8gVGhlIGN1cnNvciBpcyBhdCBlbmQgb2YgdGhlIGZpcnN0IGxpbmUuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZyb21TZWxlY3Rpb24oZWRpdG9yLmdldFNlbGVjdGlvbigpISksIFsxLCA0LCAxLCA0XSk7XG5cblx0XHRcdC8vIEkgaGl0IEYzIHRvIFwiRmluZCBOZXh0XCIgdG8gZmluZCB0aGUgbmV4dCBvY2N1cnJlbmNlIG9mIEFCQywgYnV0IGluc3RlYWQgaXQgc2VhcmNoZXMgZm9yIFhZWi5cblx0XHRcdGF3YWl0IGVkaXRvci5ydW5BY3Rpb24obmV4dE1hdGNoRmluZEFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuc2VhcmNoU3RyaW5nLCAnQUJDJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZENvbnRyb2xsZXIuaGFzRm9jdXMsIGZhbHNlKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzA5MDogRjMgZG9lcyBub3QgbG9vcCB3aXRoIHR3byBtYXRjaGVzIG9uIGEgc2luZ2xlIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J2ltcG9ydCBubHMgPSByZXF1aXJlKFxcJ3ZzL25sc1xcJyk7J1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRcdGNsaXBib2FyZFN0YXRlID0gJyc7XG5cdFx0XHRjb25zdCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RGaW5kQ29udHJvbGxlci5JRCwgVGVzdEZpbmRDb250cm9sbGVyKTtcblx0XHRcdGNvbnN0IG5leHRNYXRjaEZpbmRBY3Rpb24gPSBOZXh0TWF0Y2hGaW5kQWN0aW9uO1xuXG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oe1xuXHRcdFx0XHRsaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRjb2x1bW46IDlcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBlZGl0b3IucnVuQWN0aW9uKG5leHRNYXRjaEZpbmRBY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmcm9tU2VsZWN0aW9uKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEpLCBbMSwgMjYsIDEsIDI5XSk7XG5cblx0XHRcdGF3YWl0IGVkaXRvci5ydW5BY3Rpb24obmV4dE1hdGNoRmluZEFjdGlvbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZyb21TZWxlY3Rpb24oZWRpdG9yLmdldFNlbGVjdGlvbigpISksIFsxLCA4LCAxLCAxMV0pO1xuXG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2MTQ5OiBBdXRvLWVzY2FwZSBoaWdobGlnaHRlZCB0ZXh0IGZvciBzZWFyY2ggYW5kIHJlcGxhY2UgcmVnZXggbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQndmFyIHggPSAoMyAqIDUpJyxcblx0XHRcdCd2YXIgeSA9ICgzICogNSknLFxuXHRcdFx0J3ZhciB6ID0gKDMgICogNSknLFxuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IsIF8sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRjb25zdCBuZXh0TWF0Y2hGaW5kQWN0aW9uID0gTmV4dE1hdGNoRmluZEFjdGlvbjtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDEzKSk7XG5cblx0XHRcdGZpbmRDb250cm9sbGVyLnRvZ2dsZVJlZ2V4KCk7XG5cdFx0XHRhd2FpdCBleGVjdXRlQWN0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3IsIFN0YXJ0RmluZEFjdGlvbik7XG5cblx0XHRcdGF3YWl0IGVkaXRvci5ydW5BY3Rpb24obmV4dE1hdGNoRmluZEFjdGlvbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZyb21TZWxlY3Rpb24oZWRpdG9yLmdldFNlbGVjdGlvbigpISksIFsyLCA5LCAyLCAxM10pO1xuXG5cdFx0XHRhd2FpdCBlZGl0b3IucnVuQWN0aW9uKG5leHRNYXRjaEZpbmRBY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmcm9tU2VsZWN0aW9uKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEpLCBbMSwgOSwgMSwgMTNdKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDEwMjc6IERvblxcJ3QgcmVwbGFjZSBmaW5kIGlucHV0IHZhbHVlIG9uIHJlcGxhY2UgYWN0aW9uIGlmIGZpbmQgaW5wdXQgaXMgYWN0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCd0ZXN0Jyxcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCBhc3luYyAoZWRpdG9yLCBfLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0Y29uc3QgdGVzdFJlZ2V4U3RyaW5nID0gJ3Rlcy4nO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRjb25zdCBuZXh0TWF0Y2hGaW5kQWN0aW9uID0gTmV4dE1hdGNoRmluZEFjdGlvbjtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIudG9nZ2xlUmVnZXgoKTtcblx0XHRcdGZpbmRDb250cm9sbGVyLnNldFNlYXJjaFN0cmluZyh0ZXN0UmVnZXhTdHJpbmcpO1xuXHRcdFx0YXdhaXQgZmluZENvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdFx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogJ25vbmUnLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IGZhbHNlLFxuXHRcdFx0XHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uRm9jdXNGaW5kSW5wdXQsXG5cdFx0XHRcdHNob3VsZEFuaW1hdGU6IGZhbHNlLFxuXHRcdFx0XHR1cGRhdGVTZWFyY2hTY29wZTogZmFsc2UsXG5cdFx0XHRcdGxvb3A6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgZWRpdG9yLnJ1bkFjdGlvbihuZXh0TWF0Y2hGaW5kQWN0aW9uKTtcblx0XHRcdGF3YWl0IGV4ZWN1dGVBY3Rpb24oaW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvciwgU3RhcnRGaW5kUmVwbGFjZUFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFN0cmluZywgdGVzdFJlZ2V4U3RyaW5nKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3IuZmluZC5jbG9zZU9uUmVzdWx0OiBjbG9zZXMgZmluZCB3aWRnZXQgd2hlbiBhIG1hdGNoIGlzIGZvdW5kIGZyb20gZXhwbGljaXQgbmF2aWdhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnQUJDJyxcblx0XHRcdCdBQkMnLFxuXHRcdFx0J1hZWicsXG5cdFx0XSwgeyBzZXJ2aWNlQ29sbGVjdGlvbjogc2VydmljZUNvbGxlY3Rpb24sIGZpbmQ6IHsgY2xvc2VPblJlc3VsdDogdHJ1ZSB9IH0sIGFzeW5jIChlZGl0b3IsIF8sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RGaW5kQ29udHJvbGxlci5JRCwgVGVzdEZpbmRDb250cm9sbGVyKTtcblx0XHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cblx0XHRcdGF3YWl0IGV4ZWN1dGVBY3Rpb24oaW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvciwgU3RhcnRGaW5kQWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuaXNSZXZlYWxlZCwgdHJ1ZSk7XG5cblx0XHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdBQkMnIH0sIHRydWUpO1xuXHRcdFx0YXdhaXQgZWRpdG9yLnJ1bkFjdGlvbihOZXh0TWF0Y2hGaW5kQWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5pc1JldmVhbGVkLCBmYWxzZSk7XG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvci5maW5kLmNsb3NlT25SZXN1bHQ6IGtlZXBzIGZpbmQgd2lkZ2V0IG9wZW4gd2hlbiBubyBtYXRjaCBpcyBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnQUJDJyxcblx0XHRcdCdERUYnLFxuXHRcdFx0J1hZWicsXG5cdFx0XSwgeyBzZXJ2aWNlQ29sbGVjdGlvbjogc2VydmljZUNvbGxlY3Rpb24sIGZpbmQ6IHsgY2xvc2VPblJlc3VsdDogdHJ1ZSB9IH0sIGFzeW5jIChlZGl0b3IsIF8sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RGaW5kQ29udHJvbGxlci5JRCwgVGVzdEZpbmRDb250cm9sbGVyKTtcblx0XHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cblx0XHRcdGF3YWl0IGV4ZWN1dGVBY3Rpb24oaW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvciwgU3RhcnRGaW5kQWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kU3RhdGUuaXNSZXZlYWxlZCwgdHJ1ZSk7XG5cblx0XHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdOT19NQVRDSCcgfSwgdHJ1ZSk7XG5cdFx0XHRhd2FpdCBlZGl0b3IucnVuQWN0aW9uKE5leHRNYXRjaEZpbmRBY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLm1hdGNoZXNDb3VudCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmlzUmV2ZWFsZWQsIHRydWUpO1xuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3IuZmluZC5jbG9zZU9uUmVzdWx0OiBkaXNhYmxlZCBrZWVwcyBmaW5kIHdpZGdldCBvcGVuIGFmdGVyIG5hdmlnYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0FCQycsXG5cdFx0XHQnQUJDJyxcblx0XHRcdCdYWVonLFxuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uLCBmaW5kOiB7IGNsb3NlT25SZXN1bHQ6IGZhbHNlIH0gfSwgYXN5bmMgKGVkaXRvciwgXywgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEZpbmRDb250cm9sbGVyLklELCBUZXN0RmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgZmluZFN0YXRlID0gZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKTtcblxuXHRcdFx0YXdhaXQgZXhlY3V0ZUFjdGlvbihpbnN0YW50aWF0aW9uU2VydmljZSwgZWRpdG9yLCBTdGFydEZpbmRBY3Rpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRTdGF0ZS5pc1JldmVhbGVkLCB0cnVlKTtcblxuXHRcdFx0ZmluZFN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ0FCQycgfSwgdHJ1ZSk7XG5cdFx0XHRhd2FpdCBlZGl0b3IucnVuQWN0aW9uKE5leHRNYXRjaEZpbmRBY3Rpb24pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZFN0YXRlLmlzUmV2ZWFsZWQsIHRydWUpO1xuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTA0MzogQ2xlYXIgc2VhcmNoIHNjb3BlIHdoZW4gZmluZCB3aWRnZXQgaXMgaGlkZGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCd2YXIgeCA9ICgzICogNSknLFxuXHRcdFx0J3ZhciB5ID0gKDMgKiA1KScsXG5cdFx0XHQndmFyIHogPSAoMyAqIDUpJyxcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRhd2FpdCBmaW5kQ29udHJvbGxlci5zdGFydCh7XG5cdFx0XHRcdGZvcmNlUmV2ZWFsUmVwbGFjZTogZmFsc2UsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiAnbm9uZScsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb246IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbUdsb2JhbENsaXBib2FyZDogZmFsc2UsXG5cdFx0XHRcdHNob3VsZEZvY3VzOiBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Ob0ZvY3VzQ2hhbmdlLFxuXHRcdFx0XHRzaG91bGRBbmltYXRlOiBmYWxzZSxcblx0XHRcdFx0dXBkYXRlU2VhcmNoU2NvcGU6IGZhbHNlLFxuXHRcdFx0XHRsb29wOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCkuc2VhcmNoU2NvcGUsIG51bGwpO1xuXG5cdFx0XHRmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLmNoYW5nZSh7XG5cdFx0XHRcdHNlYXJjaFNjb3BlOiBbbmV3IFJhbmdlKDEsIDEsIDEsIDUpXVxuXHRcdFx0fSwgZmFsc2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCkuc2VhcmNoU2NvcGUsIFtuZXcgUmFuZ2UoMSwgMSwgMSwgNSldKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuY2xvc2VGaW5kV2lkZ2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTY29wZSwgbnVsbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxODExMTogUmVnZXggcmVwbGFjZSB3aXRoIHNpbmdsZSBzcGFjZSByZXBsYWNlcyB3aXRoIG5vIHNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdIUkVTVUxUIE9uQW1iaWVudFByb3BlcnR5Q2hhbmdlKERJU1BJRCAgIGRpc3BpZCk7J1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IsIF8sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cblx0XHRcdGF3YWl0IGV4ZWN1dGVBY3Rpb24oaW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvciwgU3RhcnRGaW5kQWN0aW9uKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdcXFxcYlxcXFxzezN9XFxcXGInLCByZXBsYWNlU3RyaW5nOiAnICcsIGlzUmVnZXg6IHRydWUgfSwgZmFsc2UpO1xuXHRcdFx0ZmluZENvbnRyb2xsZXIubW92ZVRvTmV4dE1hdGNoKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubWFwKGZyb21TZWxlY3Rpb24pLCBbXG5cdFx0XHRcdFsxLCAzOSwgMSwgNDJdXG5cdFx0XHRdKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIucmVwbGFjZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRWYWx1ZSgpLCAnSFJFU1VMVCBPbkFtYmllbnRQcm9wZXJ0eUNoYW5nZShESVNQSUQgZGlzcGlkKTsnKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjQ3MTQ6IFJlZ3VsYXIgZXhwcmVzc2lvbiB3aXRoIF4gaW4gc2VhcmNoICYgcmVwbGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnJyxcblx0XHRcdCdsaW5lMicsXG5cdFx0XHQnbGluZTMnXG5cdFx0XSwgeyBzZXJ2aWNlQ29sbGVjdGlvbjogc2VydmljZUNvbGxlY3Rpb24gfSwgYXN5bmMgKGVkaXRvciwgXywgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGNsaXBib2FyZFN0YXRlID0gJyc7XG5cdFx0XHRjb25zdCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RGaW5kQ29udHJvbGxlci5JRCwgVGVzdEZpbmRDb250cm9sbGVyKTtcblxuXHRcdFx0YXdhaXQgZXhlY3V0ZUFjdGlvbihpbnN0YW50aWF0aW9uU2VydmljZSwgZWRpdG9yLCBTdGFydEZpbmRBY3Rpb24pO1xuXG5cdFx0XHRmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJ14nLCByZXBsYWNlU3RyaW5nOiAneCcsIGlzUmVnZXg6IHRydWUgfSwgZmFsc2UpO1xuXHRcdFx0ZmluZENvbnRyb2xsZXIubW92ZVRvTmV4dE1hdGNoKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubWFwKGZyb21TZWxlY3Rpb24pLCBbXG5cdFx0XHRcdFsyLCAxLCAyLCAxXVxuXHRcdFx0XSk7XG5cblx0XHRcdGZpbmRDb250cm9sbGVyLnJlcGxhY2UoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ1xcbnhsaW5lMlxcbmxpbmUzJyk7XG5cblx0XHRcdGZpbmRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM4MjMyOiBGaW5kIE5leHQgU2VsZWN0aW9uLCByZWdleCBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcoW2Z1bm55XScsXG5cdFx0XHQnJyxcblx0XHRcdCcoW2Z1bm55XSdcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRjb25zdCBuZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uID0gbmV3IE5leHRTZWxlY3Rpb25NYXRjaEZpbmRBY3Rpb24oKTtcblxuXHRcdFx0Ly8gdG9nZ2xlIHJlZ2V4XG5cdFx0XHRmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLmNoYW5nZSh7IGlzUmVnZXg6IHRydWUgfSwgZmFsc2UpO1xuXG5cdFx0XHQvLyBjaGFuZ2Ugc2VsZWN0aW9uXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgOSkpO1xuXG5cdFx0XHQvLyBjbWQrZjNcblx0XHRcdGF3YWl0IGVkaXRvci5ydW5BY3Rpb24obmV4dFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEubWFwKGZyb21TZWxlY3Rpb24pLCBbXG5cdFx0XHRcdFszLCAxLCAzLCA5XVxuXHRcdFx0XSk7XG5cblx0XHRcdGZpbmRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM4MjMyOiBGaW5kIE5leHQgU2VsZWN0aW9uLCByZWdleCBlbmFibGVkLCBmaW5kIHdpZGdldCBvcGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCcoW2Z1bm55XScsXG5cdFx0XHQnJyxcblx0XHRcdCcoW2Z1bm55XSdcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCBhc3luYyAoZWRpdG9yLCBfLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0Y2xpcGJvYXJkU3RhdGUgPSAnJztcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEZpbmRDb250cm9sbGVyLklELCBUZXN0RmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgbmV4dFNlbGVjdGlvbk1hdGNoRmluZEFjdGlvbiA9IG5ldyBOZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uKCk7XG5cblx0XHRcdC8vIGNtZCtmIC0gb3BlbiBmaW5kIHdpZGdldFxuXHRcdFx0YXdhaXQgZXhlY3V0ZUFjdGlvbihpbnN0YW50aWF0aW9uU2VydmljZSwgZWRpdG9yLCBTdGFydEZpbmRBY3Rpb24pO1xuXG5cdFx0XHQvLyB0b2dnbGUgcmVnZXhcblx0XHRcdGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCkuY2hhbmdlKHsgaXNSZWdleDogdHJ1ZSB9LCBmYWxzZSk7XG5cblx0XHRcdC8vIGNoYW5nZSBzZWxlY3Rpb25cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCA5KSk7XG5cblx0XHRcdC8vIGNtZCtmM1xuXHRcdFx0YXdhaXQgZWRpdG9yLnJ1bkFjdGlvbihuZXh0U2VsZWN0aW9uTWF0Y2hGaW5kQWN0aW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpIS5tYXAoZnJvbVNlbGVjdGlvbiksIFtcblx0XHRcdFx0WzMsIDEsIDMsIDldXG5cdFx0XHRdKTtcblxuXHRcdFx0ZmluZENvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDc0MDAsIENNRCtFIHN1cHBvcnRzIGZlZWRpbmcgbXVsdGlwbGUgbGluZSBvZiB0ZXh0IGludG8gdGhlIGZpbmQgd2lkZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdBQkMnLFxuXHRcdFx0J0FCQycsXG5cdFx0XHQnWFlaJyxcblx0XHRcdCdBQkMnLFxuXHRcdFx0J0FCQydcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCBhc3luYyAoZWRpdG9yLCBfLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0Y2xpcGJvYXJkU3RhdGUgPSAnJztcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEZpbmRDb250cm9sbGVyLklELCBUZXN0RmluZENvbnRyb2xsZXIpO1xuXG5cdFx0XHQvLyBjaGFuZ2Ugc2VsZWN0aW9uXG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXG5cdFx0XHQvLyBjbWQrZiAtIG9wZW4gZmluZCB3aWRnZXRcblx0XHRcdGF3YWl0IGV4ZWN1dGVBY3Rpb24oaW5zdGFudGlhdGlvblNlcnZpY2UsIGVkaXRvciwgU3RhcnRGaW5kQWN0aW9uKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDQpKTtcblx0XHRcdGNvbnN0IHN0YXJ0RmluZFdpdGhTZWxlY3Rpb25BY3Rpb24gPSBuZXcgU3RhcnRGaW5kV2l0aFNlbGVjdGlvbkFjdGlvbigpO1xuXHRcdFx0YXdhaXQgZWRpdG9yLnJ1bkFjdGlvbihzdGFydEZpbmRXaXRoU2VsZWN0aW9uQWN0aW9uKTtcblx0XHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZFN0YXRlLnNlYXJjaFN0cmluZy5zcGxpdCgvXFxyXFxufFxccnxcXG4vZyksIFsnQUJDJywgJ0FCQyddKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDEpKTtcblx0XHRcdGF3YWl0IGVkaXRvci5ydW5BY3Rpb24oc3RhcnRGaW5kV2l0aFNlbGVjdGlvbkFjdGlvbik7XG5cblx0XHRcdGZpbmRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEwOTc1NiwgQ01EK0Ugd2l0aCBlbXB0eSBjdXJzb3Igc2hvdWxkIGFsd2F5cyB3b3JrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdBQkMnLFxuXHRcdFx0J0FCQycsXG5cdFx0XHQnWFlaJyxcblx0XHRcdCdBQkMnLFxuXHRcdFx0J0FCQydcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiB9LCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMikpO1xuXG5cdFx0XHRjb25zdCBzdGFydEZpbmRXaXRoU2VsZWN0aW9uQWN0aW9uID0gbmV3IFN0YXJ0RmluZFdpdGhTZWxlY3Rpb25BY3Rpb24oKTtcblx0XHRcdGVkaXRvci5ydW5BY3Rpb24oc3RhcnRGaW5kV2l0aFNlbGVjdGlvbkFjdGlvbik7XG5cblx0XHRcdGNvbnN0IGZpbmRTdGF0ZSA9IGZpbmRDb250cm9sbGVyLmdldFN0YXRlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbmRTdGF0ZS5zZWFyY2hTdHJpbmcsICdBQkMnKTtcblx0XHRcdGZpbmRDb250cm9sbGVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0ZpbmRDb250cm9sbGVyIHF1ZXJ5IG9wdGlvbnMgcGVyc2lzdGVuY2UnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2VydmljZUNvbGxlY3Rpb24gPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpO1xuXHRzdG9yYWdlU2VydmljZS5zdG9yZSgnZWRpdG9yLmlzUmVnZXgnLCBmYWxzZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2VkaXRvci5tYXRjaENhc2UnLCBmYWxzZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ2VkaXRvci53aG9sZVdvcmQnLCBmYWxzZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0c2VydmljZUNvbGxlY3Rpb24uc2V0KElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdHRlc3QoJ21hdGNoQ2FzZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnYWJjJyxcblx0XHRcdCdBQkMnLFxuXHRcdFx0J1hZWicsXG5cdFx0XHQnQUJDJ1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IsIF8sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRzdG9yYWdlU2VydmljZS5zdG9yZSgnZWRpdG9yLm1hdGNoQ2FzZScsIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHQvLyBUaGUgY3Vyc29yIGlzIGF0IHRoZSB2ZXJ5IHRvcCwgb2YgdGhlIGZpbGUsIGF0IHRoZSBmaXJzdCBBQkNcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEZpbmRDb250cm9sbGVyLklELCBUZXN0RmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgZmluZFN0YXRlID0gZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKTtcblxuXHRcdFx0Ly8gSSBoaXQgQ3RybCtGIHRvIHNob3cgdGhlIEZpbmQgZGlhbG9nXG5cdFx0XHRhd2FpdCBleGVjdXRlQWN0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3IsIFN0YXJ0RmluZEFjdGlvbik7XG5cblx0XHRcdC8vIEkgdHlwZSBBQkMuXG5cdFx0XHRmaW5kU3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnQUJDJyB9LCB0cnVlKTtcblx0XHRcdC8vIFRoZSBzZWNvbmQgQUJDIGlzIGhpZ2hsaWdodGVkIGFzIG1hdGNoQ2FzZSBpcyB0cnVlLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmcm9tU2VsZWN0aW9uKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEpLCBbMiwgMSwgMiwgNF0pO1xuXG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlZGl0b3IubWF0Y2hDYXNlJywgZmFsc2UsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCdlZGl0b3Iud2hvbGVXb3JkJywgdHJ1ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHR0ZXN0KCd3aG9sZVdvcmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0FCQycsXG5cdFx0XHQnQUInLFxuXHRcdFx0J1hZWicsXG5cdFx0XHQnQUJDJ1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IsIF8sIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHQvLyBUaGUgY3Vyc29yIGlzIGF0IHRoZSB2ZXJ5IHRvcCwgb2YgdGhlIGZpbGUsIGF0IHRoZSBmaXJzdCBBQkNcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEZpbmRDb250cm9sbGVyLklELCBUZXN0RmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgZmluZFN0YXRlID0gZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKTtcblxuXHRcdFx0Ly8gSSBoaXQgQ3RybCtGIHRvIHNob3cgdGhlIEZpbmQgZGlhbG9nXG5cdFx0XHRhd2FpdCBleGVjdXRlQWN0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBlZGl0b3IsIFN0YXJ0RmluZEFjdGlvbik7XG5cblx0XHRcdC8vIEkgdHlwZSBBQi5cblx0XHRcdGZpbmRTdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICdBQicgfSwgdHJ1ZSk7XG5cdFx0XHQvLyBUaGUgc2Vjb25kIEFCIGlzIGhpZ2hsaWdodGVkIGFzIHdob2xlV29yZCBpcyB0cnVlLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmcm9tU2VsZWN0aW9uKGVkaXRvci5nZXRTZWxlY3Rpb24oKSEpLCBbMiwgMSwgMiwgM10pO1xuXG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvZ2dsaW5nIG9wdGlvbnMgaXMgc2F2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0FCQycsXG5cdFx0XHQnQUInLFxuXHRcdFx0J1hZWicsXG5cdFx0XHQnQUJDJ1xuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uIH0sIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRcdC8vIFRoZSBjdXJzb3IgaXMgYXQgdGhlIHZlcnkgdG9wLCBvZiB0aGUgZmlsZSwgYXQgdGhlIGZpcnN0IEFCQ1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cdFx0XHRmaW5kQ29udHJvbGxlci50b2dnbGVSZWdleCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oJ2VkaXRvci5pc1JlZ2V4JywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSksIHRydWUpO1xuXG5cdFx0XHRmaW5kQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNzA4MzogVXBkYXRlIHNlYXJjaCBzY29wZSBvbmNlIGZpbmQgd2lkZ2V0IGJlY29tZXMgdmlzaWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoQXN5bmNUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQndmFyIHggPSAoMyAqIDUpJyxcblx0XHRcdCd2YXIgeSA9ICgzICogNSknLFxuXHRcdFx0J3ZhciB6ID0gKDMgKiA1KScsXG5cdFx0XSwgeyBzZXJ2aWNlQ29sbGVjdGlvbjogc2VydmljZUNvbGxlY3Rpb24sIGZpbmQ6IHsgYXV0b0ZpbmRJblNlbGVjdGlvbjogJ2Fsd2F5cycsIGdsb2JhbEZpbmRDbGlwYm9hcmQ6IGZhbHNlIH0gfSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdFx0Ly8gY2xpcGJvYXJkU3RhdGUgPSAnJztcblx0XHRcdGNvbnN0IGZpbmRDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oVGVzdEZpbmRDb250cm9sbGVyLklELCBUZXN0RmluZENvbnRyb2xsZXIpO1xuXHRcdFx0Y29uc3QgZmluZENvbmZpZzogSUZpbmRTdGFydE9wdGlvbnMgPSB7XG5cdFx0XHRcdGZvcmNlUmV2ZWFsUmVwbGFjZTogZmFsc2UsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiAnbm9uZScsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tTm9uRW1wdHlTZWxlY3Rpb246IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbUdsb2JhbENsaXBib2FyZDogZmFsc2UsXG5cdFx0XHRcdHNob3VsZEZvY3VzOiBGaW5kU3RhcnRGb2N1c0FjdGlvbi5Ob0ZvY3VzQ2hhbmdlLFxuXHRcdFx0XHRzaG91bGRBbmltYXRlOiBmYWxzZSxcblx0XHRcdFx0dXBkYXRlU2VhcmNoU2NvcGU6IHRydWUsXG5cdFx0XHRcdGxvb3A6IHRydWVcblx0XHRcdH07XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFJhbmdlKDEsIDEsIDIsIDEpKTtcblx0XHRcdGZpbmRDb250cm9sbGVyLnN0YXJ0KGZpbmRDb25maWcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFNjb3BlLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKV0pO1xuXG5cdFx0XHRmaW5kQ29udHJvbGxlci5jbG9zZUZpbmRXaWRnZXQoKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMiwgMSksIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNSldKTtcblx0XHRcdGZpbmRDb250cm9sbGVyLnN0YXJ0KGZpbmRDb25maWcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFNjb3BlLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKSwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCA1KV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNTg2MDQ6IERvIG5vdCB1cGRhdGUgc2VhcmNoU2NvcGUgaWYgaXQgaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aEFzeW5jVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J3ZhciB4ID0gKDMgKiA1KScsXG5cdFx0XHQndmFyIHkgPSAoMyAqIDUpJyxcblx0XHRcdCd2YXIgeiA9ICgzICogNSknLFxuXHRcdF0sIHsgc2VydmljZUNvbGxlY3Rpb246IHNlcnZpY2VDb2xsZWN0aW9uLCBmaW5kOiB7IGF1dG9GaW5kSW5TZWxlY3Rpb246ICdhbHdheXMnLCBnbG9iYWxGaW5kQ2xpcGJvYXJkOiBmYWxzZSB9IH0sIGFzeW5jIChlZGl0b3IpID0+IHtcblx0XHRcdC8vIGNsaXBib2FyZFN0YXRlID0gJyc7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBSYW5nZSgxLCAyLCAxLCAyKSk7XG5cdFx0XHRjb25zdCBmaW5kQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKFRlc3RGaW5kQ29udHJvbGxlci5JRCwgVGVzdEZpbmRDb250cm9sbGVyKTtcblxuXHRcdFx0YXdhaXQgZmluZENvbnRyb2xsZXIuc3RhcnQoe1xuXHRcdFx0XHRmb3JjZVJldmVhbFJlcGxhY2U6IGZhbHNlLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbjogJ25vbmUnLFxuXHRcdFx0XHRzZWVkU2VhcmNoU3RyaW5nRnJvbU5vbkVtcHR5U2VsZWN0aW9uOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21HbG9iYWxDbGlwYm9hcmQ6IGZhbHNlLFxuXHRcdFx0XHRzaG91bGRGb2N1czogRmluZFN0YXJ0Rm9jdXNBY3Rpb24uTm9Gb2N1c0NoYW5nZSxcblx0XHRcdFx0c2hvdWxkQW5pbWF0ZTogZmFsc2UsXG5cdFx0XHRcdHVwZGF0ZVNlYXJjaFNjb3BlOiB0cnVlLFxuXHRcdFx0XHRsb29wOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kQ29udHJvbGxlci5nZXRTdGF0ZSgpLnNlYXJjaFNjb3BlLCBudWxsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzU4NjA0OiBVcGRhdGUgc2VhcmNoU2NvcGUgaWYgaXQgaXMgbm90IGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCd2YXIgeCA9ICgzICogNSknLFxuXHRcdFx0J3ZhciB5ID0gKDMgKiA1KScsXG5cdFx0XHQndmFyIHogPSAoMyAqIDUpJyxcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiwgZmluZDogeyBhdXRvRmluZEluU2VsZWN0aW9uOiAnYWx3YXlzJywgZ2xvYmFsRmluZENsaXBib2FyZDogZmFsc2UgfSB9LCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHQvLyBjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgUmFuZ2UoMSwgMiwgMSwgMykpO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cblx0XHRcdGF3YWl0IGZpbmRDb250cm9sbGVyLnN0YXJ0KHtcblx0XHRcdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246ICdub25lJyxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZmFsc2UsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkRm9jdXM6IEZpbmRTdGFydEZvY3VzQWN0aW9uLk5vRm9jdXNDaGFuZ2UsXG5cdFx0XHRcdHNob3VsZEFuaW1hdGU6IGZhbHNlLFxuXHRcdFx0XHR1cGRhdGVTZWFyY2hTY29wZTogdHJ1ZSxcblx0XHRcdFx0bG9vcDogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTY29wZSwgW25ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMyldKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdpc3N1ZSAjMjcwODM6IEZpbmQgaW4gc2VsZWN0aW9uIHdoZW4gbXVsdGlwbGUgbGluZXMgYXJlIHNlbGVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhBc3luY1Rlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCd2YXIgeCA9ICgzICogNSknLFxuXHRcdFx0J3ZhciB5ID0gKDMgKiA1KScsXG5cdFx0XHQndmFyIHogPSAoMyAqIDUpJyxcblx0XHRdLCB7IHNlcnZpY2VDb2xsZWN0aW9uOiBzZXJ2aWNlQ29sbGVjdGlvbiwgZmluZDogeyBhdXRvRmluZEluU2VsZWN0aW9uOiAnbXVsdGlsaW5lJywgZ2xvYmFsRmluZENsaXBib2FyZDogZmFsc2UgfSB9LCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHQvLyBjbGlwYm9hcmRTdGF0ZSA9ICcnO1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgUmFuZ2UoMSwgNiwgMiwgMSkpO1xuXHRcdFx0Y29uc3QgZmluZENvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihUZXN0RmluZENvbnRyb2xsZXIuSUQsIFRlc3RGaW5kQ29udHJvbGxlcik7XG5cblx0XHRcdGF3YWl0IGZpbmRDb250cm9sbGVyLnN0YXJ0KHtcblx0XHRcdFx0Zm9yY2VSZXZlYWxSZXBsYWNlOiBmYWxzZSxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246ICdub25lJyxcblx0XHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21Ob25FbXB0eVNlbGVjdGlvbjogZmFsc2UsXG5cdFx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tR2xvYmFsQ2xpcGJvYXJkOiBmYWxzZSxcblx0XHRcdFx0c2hvdWxkRm9jdXM6IEZpbmRTdGFydEZvY3VzQWN0aW9uLk5vRm9jdXNDaGFuZ2UsXG5cdFx0XHRcdHNob3VsZEFuaW1hdGU6IGZhbHNlLFxuXHRcdFx0XHR1cGRhdGVTZWFyY2hTY29wZTogdHJ1ZSxcblx0XHRcdFx0bG9vcDogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmluZENvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTY29wZSwgW25ldyBTZWxlY3Rpb24oMSwgNiwgMiwgMSldKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixZQUFZLGNBQWM7QUFDMUIsU0FBUywrQ0FBK0M7QUFHeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsc0JBQXNCLHNCQUF5QyxxQkFBcUIsOEJBQThCLGlCQUFpQix3QkFBd0Isb0NBQW9DO0FBQ3hNLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGlCQUFpQix3QkFBd0IsY0FBYyxxQkFBcUI7QUFFckYsSUFBTSxxQkFBTixjQUFpQyxxQkFBcUI7QUFBQSxFQU9yRCxZQUNDLFFBQ29CLG1CQUNILGdCQUNFLGtCQUNHLHFCQUNQLGNBQ2Q7QUFDRCxVQUFNLFFBQVEsbUJBQW1CLGdCQUFnQixrQkFBa0IscUJBQXFCLFlBQVk7QUFackcsU0FBTyxxQkFBOEI7QUFhcEMsU0FBSyxvQkFBb0IsMkJBQTJCLE9BQU8saUJBQWlCO0FBQzVFLFNBQUssd0JBQXdCLElBQUksUUFBYyxFQUFFO0FBQ2pELFNBQUssV0FBVztBQUFBLEVBQ2pCO0FBQUEsRUFFQSxNQUF5QixPQUFPLE1BQXdDO0FBQ3ZFLFVBQU0sTUFBTSxPQUFPLElBQUk7QUFFdkIsUUFBSSxLQUFLLGdCQUFnQixxQkFBcUIsZUFBZTtBQUM1RCxXQUFLLFdBQVc7QUFBQSxJQUNqQjtBQUVBLFVBQU0sZUFBZSxLQUFLLGdCQUFnQixxQkFBcUI7QUFDL0QsU0FBSyxrQkFBa0IsSUFBSSxZQUFZO0FBQUEsRUFDeEM7QUFDRDtBQS9CTSxxQkFBTjtBQUFBLEVBU0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FiRztBQWlDTixTQUFTLGNBQWMsS0FBMEI7QUFDaEQsU0FBTyxDQUFDLElBQUksaUJBQWlCLElBQUksYUFBYSxJQUFJLGVBQWUsSUFBSSxTQUFTO0FBQy9FO0FBRUEsU0FBUyxjQUFjLHNCQUE2QyxRQUFxQixRQUFzQixNQUEyQjtBQUN6SSxTQUFPLHFCQUFxQixlQUFlLENBQUMsYUFBYTtBQUN4RCxXQUFPLFFBQVEsUUFBUSxPQUFPLGlCQUFpQixVQUFVLFFBQVEsSUFBSSxDQUFDO0FBQUEsRUFDdkUsQ0FBQztBQUNGO0FBRUEsTUFBTSxrQkFBa0IsTUFBTTtBQUU3QiwwQ0FBd0M7QUFFeEMsTUFBSSxpQkFBaUI7QUFDckIsUUFBTSxvQkFBb0IsSUFBSSxrQkFBa0I7QUFDaEQsb0JBQWtCLElBQUksaUJBQWlCLElBQUksdUJBQXVCLENBQUM7QUFFbkUsTUFBSSxTQUFTLGFBQWE7QUFFekIsc0JBQWtCLElBQUksbUJBQXdCO0FBQUEsTUFDN0MsY0FBYyxNQUFNO0FBQUEsTUFDcEIsZUFBZSxDQUFDLFVBQWU7QUFBRSx5QkFBaUI7QUFBQSxNQUFPO0FBQUEsSUFDMUQsQ0FBQztBQUFBLEVBQ0Y7QUE2RUEsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsa0JBQXFDLEdBQUcsT0FBTyxRQUFRLEdBQUcseUJBQXlCO0FBQ3ZGLHVCQUFpQjtBQUVqQixZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFDMUcsWUFBTSxZQUFZLGVBQWUsU0FBUztBQUMxQyxZQUFNLHNCQUFzQjtBQUc1QixZQUFNLGNBQWMsc0JBQXNCLFFBQVEsZUFBZTtBQUdqRSxnQkFBVSxPQUFPLEVBQUUsY0FBYyxJQUFJLEdBQUcsSUFBSTtBQUM1QyxnQkFBVSxPQUFPLEVBQUUsY0FBYyxLQUFLLEdBQUcsSUFBSTtBQUM3QyxnQkFBVSxPQUFPLEVBQUUsY0FBYyxNQUFNLEdBQUcsSUFBSTtBQUc5QyxhQUFPLGdCQUFnQixjQUFjLE9BQU8sYUFBYSxDQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFHMUUscUJBQWUsZ0JBQWdCO0FBQy9CLHFCQUFlLFdBQVc7QUFHMUIsYUFBTyxnQkFBZ0IsY0FBYyxPQUFPLGFBQWEsQ0FBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRzFFLGFBQU8sYUFBYTtBQUNwQixhQUFPLGFBQWEsUUFBUSxDQUFDLGNBQWMsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN6RSxhQUFPLGFBQWEsUUFBUSxDQUFDLGNBQWMsT0FBTyxJQUFJLFNBQVMsR0FBRyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUM7QUFDN0UsYUFBTyxhQUFhO0FBT3BCLGFBQU8sWUFBWSxPQUFPLFNBQVMsRUFBRyxlQUFlLENBQUMsR0FBRyxLQUFLO0FBRzlELGFBQU8sZ0JBQWdCLGNBQWMsT0FBTyxhQUFhLENBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUcxRSxZQUFNLE9BQU8sVUFBVSxtQkFBbUI7QUFFMUMsYUFBTyxZQUFZLFVBQVUsY0FBYyxLQUFLO0FBQ2hELGFBQU8sWUFBWSxlQUFlLFVBQVUsS0FBSztBQUVqRCxxQkFBZSxRQUFRO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUVBQW1FLFlBQVk7QUFDbkYsVUFBTSx3QkFBd0I7QUFBQSxNQUM3QjtBQUFBLElBQ0QsR0FBRyxFQUFFLGtCQUFxQyxHQUFHLE9BQU8sV0FBVztBQUM5RCx1QkFBaUI7QUFDakIsWUFBTSxpQkFBaUIsT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBQzFHLFlBQU0sc0JBQXNCO0FBRTVCLGFBQU8sWUFBWTtBQUFBLFFBQ2xCLFlBQVk7QUFBQSxRQUNaLFFBQVE7QUFBQSxNQUNULENBQUM7QUFFRCxZQUFNLE9BQU8sVUFBVSxtQkFBbUI7QUFDMUMsYUFBTyxnQkFBZ0IsY0FBYyxPQUFPLGFBQWEsQ0FBRSxHQUFHLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBRTVFLFlBQU0sT0FBTyxVQUFVLG1CQUFtQjtBQUMxQyxhQUFPLGdCQUFnQixjQUFjLE9BQU8sYUFBYSxDQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFFM0UscUJBQWUsUUFBUTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxFQUFFLGtCQUFxQyxHQUFHLE9BQU8sUUFBUSxHQUFHLHlCQUF5QjtBQUN2Rix1QkFBaUI7QUFDakIsWUFBTSxpQkFBaUIsT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBQzFHLFlBQU0sc0JBQXNCO0FBRTVCLGFBQU8sYUFBYSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBRTlDLHFCQUFlLFlBQVk7QUFDM0IsWUFBTSxjQUFjLHNCQUFzQixRQUFRLGVBQWU7QUFFakUsWUFBTSxPQUFPLFVBQVUsbUJBQW1CO0FBQzFDLGFBQU8sZ0JBQWdCLGNBQWMsT0FBTyxhQUFhLENBQUUsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUUzRSxZQUFNLE9BQU8sVUFBVSxtQkFBbUI7QUFDMUMsYUFBTyxnQkFBZ0IsY0FBYyxPQUFPLGFBQWEsQ0FBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBRTNFLHFCQUFlLFFBQVE7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRkFBMkYsWUFBWTtBQUMzRyxVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsSUFDRCxHQUFHLEVBQUUsa0JBQXFDLEdBQUcsT0FBTyxRQUFRLEdBQUcseUJBQXlCO0FBQ3ZGLFlBQU0sa0JBQWtCO0FBQ3hCLFlBQU0saUJBQWlCLE9BQU8sbUNBQW1DLG1CQUFtQixJQUFJLGtCQUFrQjtBQUMxRyxZQUFNLHNCQUFzQjtBQUU1QixxQkFBZSxZQUFZO0FBQzNCLHFCQUFlLGdCQUFnQixlQUFlO0FBQzlDLFlBQU0sZUFBZSxNQUFNO0FBQUEsUUFDMUIsb0JBQW9CO0FBQUEsUUFDcEIsK0JBQStCO0FBQUEsUUFDL0IsdUNBQXVDO0FBQUEsUUFDdkMscUNBQXFDO0FBQUEsUUFDckMsYUFBYSxxQkFBcUI7QUFBQSxRQUNsQyxlQUFlO0FBQUEsUUFDZixtQkFBbUI7QUFBQSxRQUNuQixNQUFNO0FBQUEsTUFDUCxDQUFDO0FBQ0QsWUFBTSxPQUFPLFVBQVUsbUJBQW1CO0FBQzFDLFlBQU0sY0FBYyxzQkFBc0IsUUFBUSxzQkFBc0I7QUFFeEUsYUFBTyxZQUFZLGVBQWUsU0FBUyxFQUFFLGNBQWMsZUFBZTtBQUUxRSxxQkFBZSxRQUFRO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0dBQWdHLFlBQVk7QUFDaEgsVUFBTSx3QkFBd0I7QUFBQSxNQUM3QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsbUJBQXNDLE1BQU0sRUFBRSxlQUFlLEtBQUssRUFBRSxHQUFHLE9BQU8sUUFBUSxHQUFHLHlCQUF5QjtBQUN0SCxZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFDMUcsWUFBTSxZQUFZLGVBQWUsU0FBUztBQUUxQyxZQUFNLGNBQWMsc0JBQXNCLFFBQVEsZUFBZTtBQUNqRSxhQUFPLFlBQVksVUFBVSxZQUFZLElBQUk7QUFFN0MsZ0JBQVUsT0FBTyxFQUFFLGNBQWMsTUFBTSxHQUFHLElBQUk7QUFDOUMsWUFBTSxPQUFPLFVBQVUsbUJBQW1CO0FBRTFDLGFBQU8sWUFBWSxVQUFVLFlBQVksS0FBSztBQUM5QyxxQkFBZSxRQUFRO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNEVBQTRFLFlBQVk7QUFDNUYsVUFBTSx3QkFBd0I7QUFBQSxNQUM3QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsbUJBQXNDLE1BQU0sRUFBRSxlQUFlLEtBQUssRUFBRSxHQUFHLE9BQU8sUUFBUSxHQUFHLHlCQUF5QjtBQUN0SCxZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFDMUcsWUFBTSxZQUFZLGVBQWUsU0FBUztBQUUxQyxZQUFNLGNBQWMsc0JBQXNCLFFBQVEsZUFBZTtBQUNqRSxhQUFPLFlBQVksVUFBVSxZQUFZLElBQUk7QUFFN0MsZ0JBQVUsT0FBTyxFQUFFLGNBQWMsV0FBVyxHQUFHLElBQUk7QUFDbkQsWUFBTSxPQUFPLFVBQVUsbUJBQW1CO0FBRTFDLGFBQU8sWUFBWSxVQUFVLGNBQWMsQ0FBQztBQUM1QyxhQUFPLFlBQVksVUFBVSxZQUFZLElBQUk7QUFDN0MscUJBQWUsUUFBUTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtFQUErRSxZQUFZO0FBQy9GLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxFQUFFLG1CQUFzQyxNQUFNLEVBQUUsZUFBZSxNQUFNLEVBQUUsR0FBRyxPQUFPLFFBQVEsR0FBRyx5QkFBeUI7QUFDdkgsWUFBTSxpQkFBaUIsT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBQzFHLFlBQU0sWUFBWSxlQUFlLFNBQVM7QUFFMUMsWUFBTSxjQUFjLHNCQUFzQixRQUFRLGVBQWU7QUFDakUsYUFBTyxZQUFZLFVBQVUsWUFBWSxJQUFJO0FBRTdDLGdCQUFVLE9BQU8sRUFBRSxjQUFjLE1BQU0sR0FBRyxJQUFJO0FBQzlDLFlBQU0sT0FBTyxVQUFVLG1CQUFtQjtBQUUxQyxhQUFPLFlBQVksVUFBVSxZQUFZLElBQUk7QUFDN0MscUJBQWUsUUFBUTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxZQUFZO0FBQzlFLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxFQUFFLGtCQUFxQyxHQUFHLE9BQU8sV0FBVztBQUM5RCx1QkFBaUI7QUFDakIsWUFBTSxpQkFBaUIsT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBQzFHLFlBQU0sZUFBZSxNQUFNO0FBQUEsUUFDMUIsb0JBQW9CO0FBQUEsUUFDcEIsK0JBQStCO0FBQUEsUUFDL0IsdUNBQXVDO0FBQUEsUUFDdkMscUNBQXFDO0FBQUEsUUFDckMsYUFBYSxxQkFBcUI7QUFBQSxRQUNsQyxlQUFlO0FBQUEsUUFDZixtQkFBbUI7QUFBQSxRQUNuQixNQUFNO0FBQUEsTUFDUCxDQUFDO0FBRUQsYUFBTyxZQUFZLGVBQWUsU0FBUyxFQUFFLGFBQWEsSUFBSTtBQUU5RCxxQkFBZSxTQUFTLEVBQUUsT0FBTztBQUFBLFFBQ2hDLGFBQWEsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDcEMsR0FBRyxLQUFLO0FBRVIsYUFBTyxnQkFBZ0IsZUFBZSxTQUFTLEVBQUUsYUFBYSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUVyRixxQkFBZSxnQkFBZ0I7QUFDL0IsYUFBTyxZQUFZLGVBQWUsU0FBUyxFQUFFLGFBQWEsSUFBSTtBQUFBLElBQy9ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdFQUF3RSxZQUFZO0FBQ3hGLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxJQUNELEdBQUcsRUFBRSxrQkFBcUMsR0FBRyxPQUFPLFFBQVEsR0FBRyx5QkFBeUI7QUFDdkYsdUJBQWlCO0FBQ2pCLFlBQU0saUJBQWlCLE9BQU8sbUNBQW1DLG1CQUFtQixJQUFJLGtCQUFrQjtBQUUxRyxZQUFNLGNBQWMsc0JBQXNCLFFBQVEsZUFBZTtBQUVqRSxxQkFBZSxTQUFTLEVBQUUsT0FBTyxFQUFFLGNBQWMsZ0JBQWdCLGVBQWUsS0FBSyxTQUFTLEtBQUssR0FBRyxLQUFLO0FBQzNHLHFCQUFlLGdCQUFnQjtBQUUvQixhQUFPLGdCQUFnQixPQUFPLGNBQWMsRUFBRyxJQUFJLGFBQWEsR0FBRztBQUFBLFFBQ2xFLENBQUMsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQ2QsQ0FBQztBQUVELHFCQUFlLFFBQVE7QUFFdkIsYUFBTyxnQkFBZ0IsT0FBTyxTQUFTLEdBQUcsaURBQWlEO0FBRTNGLHFCQUFlLFFBQVE7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrREFBK0QsWUFBWTtBQUMvRSxVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsRUFBRSxrQkFBcUMsR0FBRyxPQUFPLFFBQVEsR0FBRyx5QkFBeUI7QUFDdkYsdUJBQWlCO0FBQ2pCLFlBQU0saUJBQWlCLE9BQU8sbUNBQW1DLG1CQUFtQixJQUFJLGtCQUFrQjtBQUUxRyxZQUFNLGNBQWMsc0JBQXNCLFFBQVEsZUFBZTtBQUVqRSxxQkFBZSxTQUFTLEVBQUUsT0FBTyxFQUFFLGNBQWMsS0FBSyxlQUFlLEtBQUssU0FBUyxLQUFLLEdBQUcsS0FBSztBQUNoRyxxQkFBZSxnQkFBZ0I7QUFFL0IsYUFBTyxnQkFBZ0IsT0FBTyxjQUFjLEVBQUcsSUFBSSxhQUFhLEdBQUc7QUFBQSxRQUNsRSxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNaLENBQUM7QUFFRCxxQkFBZSxRQUFRO0FBRXZCLGFBQU8sZ0JBQWdCLE9BQU8sU0FBUyxHQUFHLGlCQUFpQjtBQUUzRCxxQkFBZSxRQUFRO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0RBQW9ELFlBQVk7QUFDcEUsVUFBTSx3QkFBd0I7QUFBQSxNQUM3QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsa0JBQXFDLEdBQUcsT0FBTyxXQUFXO0FBQzlELHVCQUFpQjtBQUNqQixZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFDMUcsWUFBTSwrQkFBK0IsSUFBSSw2QkFBNkI7QUFHdEUscUJBQWUsU0FBUyxFQUFFLE9BQU8sRUFBRSxTQUFTLEtBQUssR0FBRyxLQUFLO0FBR3pELGFBQU8sYUFBYSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRzdDLFlBQU0sT0FBTyxVQUFVLDRCQUE0QjtBQUVuRCxhQUFPLGdCQUFnQixPQUFPLGNBQWMsRUFBRyxJQUFJLGFBQWEsR0FBRztBQUFBLFFBQ2xFLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ1osQ0FBQztBQUVELHFCQUFlLFFBQVE7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRUFBc0UsWUFBWTtBQUN0RixVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsRUFBRSxrQkFBcUMsR0FBRyxPQUFPLFFBQVEsR0FBRyx5QkFBeUI7QUFDdkYsdUJBQWlCO0FBQ2pCLFlBQU0saUJBQWlCLE9BQU8sbUNBQW1DLG1CQUFtQixJQUFJLGtCQUFrQjtBQUMxRyxZQUFNLCtCQUErQixJQUFJLDZCQUE2QjtBQUd0RSxZQUFNLGNBQWMsc0JBQXNCLFFBQVEsZUFBZTtBQUdqRSxxQkFBZSxTQUFTLEVBQUUsT0FBTyxFQUFFLFNBQVMsS0FBSyxHQUFHLEtBQUs7QUFHekQsYUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFHN0MsWUFBTSxPQUFPLFVBQVUsNEJBQTRCO0FBRW5ELGFBQU8sZ0JBQWdCLE9BQU8sY0FBYyxFQUFHLElBQUksYUFBYSxHQUFHO0FBQUEsUUFDbEUsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDWixDQUFDO0FBRUQscUJBQWUsUUFBUTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1GQUFtRixZQUFZO0FBQ25HLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsa0JBQXFDLEdBQUcsT0FBTyxRQUFRLEdBQUcseUJBQXlCO0FBQ3ZGLHVCQUFpQjtBQUNqQixZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFHMUcsYUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFHN0MsWUFBTSxjQUFjLHNCQUFzQixRQUFRLGVBQWU7QUFFakUsYUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDN0MsWUFBTSwrQkFBK0IsSUFBSSw2QkFBNkI7QUFDdEUsWUFBTSxPQUFPLFVBQVUsNEJBQTRCO0FBQ25ELFlBQU0sWUFBWSxlQUFlLFNBQVM7QUFFMUMsYUFBTyxnQkFBZ0IsVUFBVSxhQUFhLE1BQU0sYUFBYSxHQUFHLENBQUMsT0FBTyxLQUFLLENBQUM7QUFFbEYsYUFBTyxhQUFhLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDN0MsWUFBTSxPQUFPLFVBQVUsNEJBQTRCO0FBRW5ELHFCQUFlLFFBQVE7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2REFBNkQsWUFBWTtBQUM3RSxVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxFQUFFLGtCQUFxQyxHQUFHLE9BQU8sV0FBVztBQUM5RCx1QkFBaUI7QUFDakIsWUFBTSxpQkFBaUIsT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBQzFHLGFBQU8sYUFBYSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRTdDLFlBQU0sK0JBQStCLElBQUksNkJBQTZCO0FBQ3RFLGFBQU8sVUFBVSw0QkFBNEI7QUFFN0MsWUFBTSxZQUFZLGVBQWUsU0FBUztBQUMxQyxhQUFPLGdCQUFnQixVQUFVLGNBQWMsS0FBSztBQUNwRCxxQkFBZSxRQUFRO0FBQUEsSUFDeEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLDRDQUE0QyxNQUFNO0FBRXZELDBDQUF3QztBQUV4QyxRQUFNLG9CQUFvQixJQUFJLGtCQUFrQjtBQUNoRCxRQUFNLGlCQUFpQixJQUFJLHVCQUF1QjtBQUNsRCxpQkFBZSxNQUFNLGtCQUFrQixPQUFPLGFBQWEsV0FBVyxjQUFjLElBQUk7QUFDeEYsaUJBQWUsTUFBTSxvQkFBb0IsT0FBTyxhQUFhLFdBQVcsY0FBYyxJQUFJO0FBQzFGLGlCQUFlLE1BQU0sb0JBQW9CLE9BQU8sYUFBYSxXQUFXLGNBQWMsSUFBSTtBQUMxRixvQkFBa0IsSUFBSSxpQkFBaUIsY0FBYztBQUVyRCxPQUFLLGFBQWEsWUFBWTtBQUM3QixVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsa0JBQXFDLEdBQUcsT0FBTyxRQUFRLEdBQUcseUJBQXlCO0FBQ3ZGLHFCQUFlLE1BQU0sb0JBQW9CLE1BQU0sYUFBYSxXQUFXLGNBQWMsSUFBSTtBQUV6RixZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFDMUcsWUFBTSxZQUFZLGVBQWUsU0FBUztBQUcxQyxZQUFNLGNBQWMsc0JBQXNCLFFBQVEsZUFBZTtBQUdqRSxnQkFBVSxPQUFPLEVBQUUsY0FBYyxNQUFNLEdBQUcsSUFBSTtBQUU5QyxhQUFPLGdCQUFnQixjQUFjLE9BQU8sYUFBYSxDQUFFLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFFMUUscUJBQWUsUUFBUTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxpQkFBZSxNQUFNLG9CQUFvQixPQUFPLGFBQWEsV0FBVyxjQUFjLElBQUk7QUFDMUYsaUJBQWUsTUFBTSxvQkFBb0IsTUFBTSxhQUFhLFdBQVcsY0FBYyxJQUFJO0FBRXpGLE9BQUssYUFBYSxZQUFZO0FBQzdCLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsRUFBRSxrQkFBcUMsR0FBRyxPQUFPLFFBQVEsR0FBRyx5QkFBeUI7QUFFdkYsWUFBTSxpQkFBaUIsT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBQzFHLFlBQU0sWUFBWSxlQUFlLFNBQVM7QUFHMUMsWUFBTSxjQUFjLHNCQUFzQixRQUFRLGVBQWU7QUFHakUsZ0JBQVUsT0FBTyxFQUFFLGNBQWMsS0FBSyxHQUFHLElBQUk7QUFFN0MsYUFBTyxnQkFBZ0IsY0FBYyxPQUFPLGFBQWEsQ0FBRSxHQUFHLENBQUMsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRTFFLHFCQUFlLFFBQVE7QUFBQSxJQUN4QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2QkFBNkIsWUFBWTtBQUM3QyxVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEVBQUUsa0JBQXFDLEdBQUcsT0FBTyxXQUFXO0FBRTlELFlBQU0saUJBQWlCLE9BQU8sbUNBQW1DLG1CQUFtQixJQUFJLGtCQUFrQjtBQUMxRyxxQkFBZSxZQUFZO0FBQzNCLGFBQU8sWUFBWSxlQUFlLFdBQVcsa0JBQWtCLGFBQWEsU0FBUyxHQUFHLElBQUk7QUFFNUYscUJBQWUsUUFBUTtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxFQUFFLG1CQUFzQyxNQUFNLEVBQUUscUJBQXFCLFVBQVUscUJBQXFCLE1BQU0sRUFBRSxHQUFHLE9BQU8sV0FBVztBQUVuSSxZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFDMUcsWUFBTSxhQUFnQztBQUFBLFFBQ3JDLG9CQUFvQjtBQUFBLFFBQ3BCLCtCQUErQjtBQUFBLFFBQy9CLHVDQUF1QztBQUFBLFFBQ3ZDLHFDQUFxQztBQUFBLFFBQ3JDLGFBQWEscUJBQXFCO0FBQUEsUUFDbEMsZUFBZTtBQUFBLFFBQ2YsbUJBQW1CO0FBQUEsUUFDbkIsTUFBTTtBQUFBLE1BQ1A7QUFFQSxhQUFPLGFBQWEsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUN6QyxxQkFBZSxNQUFNLFVBQVU7QUFDL0IsYUFBTyxnQkFBZ0IsZUFBZSxTQUFTLEVBQUUsYUFBYSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUV6RixxQkFBZSxnQkFBZ0I7QUFFL0IsYUFBTyxjQUFjLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDM0UscUJBQWUsTUFBTSxVQUFVO0FBQy9CLGFBQU8sZ0JBQWdCLGVBQWUsU0FBUyxFQUFFLGFBQWEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQ3JILENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxZQUFZO0FBQzFFLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxFQUFFLG1CQUFzQyxNQUFNLEVBQUUscUJBQXFCLFVBQVUscUJBQXFCLE1BQU0sRUFBRSxHQUFHLE9BQU8sV0FBVztBQUVuSSxhQUFPLGFBQWEsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUN6QyxZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFFMUcsWUFBTSxlQUFlLE1BQU07QUFBQSxRQUMxQixvQkFBb0I7QUFBQSxRQUNwQiwrQkFBK0I7QUFBQSxRQUMvQix1Q0FBdUM7QUFBQSxRQUN2QyxxQ0FBcUM7QUFBQSxRQUNyQyxhQUFhLHFCQUFxQjtBQUFBLFFBQ2xDLGVBQWU7QUFBQSxRQUNmLG1CQUFtQjtBQUFBLFFBQ25CLE1BQU07QUFBQSxNQUNQLENBQUM7QUFFRCxhQUFPLGdCQUFnQixlQUFlLFNBQVMsRUFBRSxhQUFhLElBQUk7QUFBQSxJQUNuRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1REFBdUQsWUFBWTtBQUN2RSxVQUFNLHdCQUF3QjtBQUFBLE1BQzdCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsRUFBRSxtQkFBc0MsTUFBTSxFQUFFLHFCQUFxQixVQUFVLHFCQUFxQixNQUFNLEVBQUUsR0FBRyxPQUFPLFdBQVc7QUFFbkksYUFBTyxhQUFhLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDekMsWUFBTSxpQkFBaUIsT0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBRTFHLFlBQU0sZUFBZSxNQUFNO0FBQUEsUUFDMUIsb0JBQW9CO0FBQUEsUUFDcEIsK0JBQStCO0FBQUEsUUFDL0IsdUNBQXVDO0FBQUEsUUFDdkMscUNBQXFDO0FBQUEsUUFDckMsYUFBYSxxQkFBcUI7QUFBQSxRQUNsQyxlQUFlO0FBQUEsUUFDZixtQkFBbUI7QUFBQSxRQUNuQixNQUFNO0FBQUEsTUFDUCxDQUFDO0FBRUQsYUFBTyxnQkFBZ0IsZUFBZSxTQUFTLEVBQUUsYUFBYSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLElBQzFGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFHRCxPQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFVBQU0sd0JBQXdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxFQUFFLG1CQUFzQyxNQUFNLEVBQUUscUJBQXFCLGFBQWEscUJBQXFCLE1BQU0sRUFBRSxHQUFHLE9BQU8sV0FBVztBQUV0SSxhQUFPLGFBQWEsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUN6QyxZQUFNLGlCQUFpQixPQUFPLG1DQUFtQyxtQkFBbUIsSUFBSSxrQkFBa0I7QUFFMUcsWUFBTSxlQUFlLE1BQU07QUFBQSxRQUMxQixvQkFBb0I7QUFBQSxRQUNwQiwrQkFBK0I7QUFBQSxRQUMvQix1Q0FBdUM7QUFBQSxRQUN2QyxxQ0FBcUM7QUFBQSxRQUNyQyxhQUFhLHFCQUFxQjtBQUFBLFFBQ2xDLGVBQWU7QUFBQSxRQUNmLG1CQUFtQjtBQUFBLFFBQ25CLE1BQU07QUFBQSxNQUNQLENBQUM7QUFFRCxhQUFPLGdCQUFnQixlQUFlLFNBQVMsRUFBRSxhQUFhLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsSUFDMUYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
