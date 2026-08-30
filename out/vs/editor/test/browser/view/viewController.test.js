import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestThemeService } from "../../../../platform/theme/test/common/testThemeService.js";
import { NavigationCommandRevealType } from "../../../browser/coreCommands.js";
import { ViewController } from "../../../browser/view/viewController.js";
import { ViewUserInputEvents } from "../../../browser/view/viewUserInputEvents.js";
import { Position } from "../../../common/core/position.js";
import { MetadataConsts, StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { MonospaceLineBreaksComputerFactory } from "../../../common/viewModel/monospaceLineBreaksComputer.js";
import { ViewModel } from "../../../common/viewModel/viewModelImpl.js";
import { instantiateTextModel } from "../../../test/common/testTextModel.js";
import { TestLanguageConfigurationService } from "../../common/modes/testLanguageConfigurationService.js";
import { TestConfiguration } from "../config/testConfiguration.js";
import { createCodeEditorServices } from "../testCodeEditor.js";
suite("ViewController - Bracket content selection", () => {
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  let viewModel;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    viewModel = void 0;
  });
  teardown(() => {
    viewModel?.dispose();
    viewModel = void 0;
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createViewControllerWithText(text) {
    const languageId = "testMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const configuration = disposables.add(new TestConfiguration({}));
    const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
    viewModel = new ViewModel(
      1,
      // editorId
      configuration,
      disposables.add(instantiateTextModel(instantiationService, text, languageId)),
      monospaceLineBreaksComputerFactory,
      monospaceLineBreaksComputerFactory,
      null,
      disposables.add(new TestLanguageConfigurationService()),
      new TestThemeService(),
      { setVisibleLines() {
      } },
      { batchChanges: (cb) => cb() }
    );
    return new ViewController(
      configuration,
      viewModel,
      new ViewUserInputEvents(viewModel.coordinatesConverter),
      {
        paste: () => {
        },
        type: () => {
        },
        compositionType: () => {
        },
        startComposition: () => {
        },
        endComposition: () => {
        },
        cut: () => {
        }
      }
    );
  }
  function testBracketSelection(text, position, expectedText) {
    const controller = createViewControllerWithText(text);
    controller.dispatchMouse({
      position,
      mouseColumn: position.column,
      startedOnLineNumbers: false,
      revealType: NavigationCommandRevealType.Minimal,
      mouseDownCount: 2,
      inSelectionMode: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      leftButton: true,
      middleButton: false,
      onInjectedText: false
    });
    const selections = viewModel.getSelections();
    const selectedText = viewModel.model.getValueInRange(selections[0]);
    if (expectedText === void 0) {
      assert.notStrictEqual(selectedText, expectedText);
    } else {
      assert.strictEqual(selectedText, expectedText);
    }
  }
  test("Select content after opening curly brace", () => {
    testBracketSelection("var x = { hello };", new Position(1, 10), " hello ");
  });
  test("Select content before closing curly brace", () => {
    testBracketSelection("var x = { hello };", new Position(1, 17), " hello ");
  });
  test("Select content after opening parenthesis", () => {
    testBracketSelection("function foo(arg1, arg2) {}", new Position(1, 14), "arg1, arg2");
  });
  test("Select content before closing parenthesis", () => {
    testBracketSelection("function foo(arg1, arg2) {}", new Position(1, 24), "arg1, arg2");
  });
  test("Select content after opening square bracket", () => {
    testBracketSelection("const arr = [ 1, 2, 3 ];", new Position(1, 14), " 1, 2, 3 ");
  });
  test("Select content before closing square bracket", () => {
    testBracketSelection("const arr = [ 1, 2, 3 ];", new Position(1, 23), " 1, 2, 3 ");
  });
  test("Select innermost bracket content with nested brackets", () => {
    testBracketSelection("var x = { a: { b: 123 }};", new Position(1, 15), " b: 123 ");
  });
  test("Empty brackets create empty selection", () => {
    testBracketSelection("var x = {};", new Position(1, 10), "");
  });
});
suite("ViewController - String content selection", () => {
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  let viewModel;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    viewModel = void 0;
  });
  teardown(() => {
    viewModel?.dispose();
    viewModel = void 0;
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createViewControllerWithTokens(text, lineTokens) {
    const languageId = "stringTestMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
    const makeMetadata = (type) => (encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | type << MetadataConsts.TOKEN_TYPE_OFFSET) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (_line, _hasEOL, state) => {
        const arr = new Uint32Array(lineTokens.length * 2);
        for (let i = 0; i < lineTokens.length; i++) {
          arr[i * 2] = lineTokens[i].startIndex;
          arr[i * 2 + 1] = makeMetadata(lineTokens[i].type);
        }
        return new EncodedTokenizationResult(arr, [], state);
      }
    };
    disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));
    const configuration = disposables.add(new TestConfiguration({}));
    const monospaceLineBreaksComputerFactory = MonospaceLineBreaksComputerFactory.create(configuration.options);
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    model.tokenization.forceTokenization(1);
    viewModel = new ViewModel(
      1,
      configuration,
      model,
      monospaceLineBreaksComputerFactory,
      monospaceLineBreaksComputerFactory,
      null,
      disposables.add(new TestLanguageConfigurationService()),
      new TestThemeService(),
      { setVisibleLines() {
      } },
      { batchChanges: (cb) => cb() }
    );
    return new ViewController(
      configuration,
      viewModel,
      new ViewUserInputEvents(viewModel.coordinatesConverter),
      {
        paste: () => {
        },
        type: () => {
        },
        compositionType: () => {
        },
        startComposition: () => {
        },
        endComposition: () => {
        },
        cut: () => {
        }
      }
    );
  }
  function doubleClickAt(controller, position) {
    controller.dispatchMouse({
      position,
      mouseColumn: position.column,
      startedOnLineNumbers: false,
      revealType: NavigationCommandRevealType.Minimal,
      mouseDownCount: 2,
      inSelectionMode: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      leftButton: true,
      middleButton: false,
      onInjectedText: false
    });
    const selections = viewModel.getSelections();
    return viewModel.model.getValueInRange(selections[0]);
  }
  test("Select string content clicking right after opening double quote", () => {
    const text = 'var x = "hello";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("Select string content clicking at closing double quote", () => {
    const text = 'var x = "hello";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 15)), "hello");
  });
  test("Select string content with single quotes", () => {
    const text = `var x = 'hello';`;
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("Select string content with backtick quotes", () => {
    const text = "var x = `hello`;";
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 15, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("Select string content containing escape characters", () => {
    const text = 'var x = "hello\\"world";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 9, type: StandardTokenType.String },
      { startIndex: 14, type: StandardTokenType.String },
      { startIndex: 16, type: StandardTokenType.String },
      { startIndex: 21, type: StandardTokenType.String },
      { startIndex: 22, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), 'hello\\"world');
  });
  test("Click in middle of string does not select whole string", () => {
    const text = 'var x = "hello world";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 21, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 16)), "world");
  });
  test("Separate quote tokens fall back to word select", () => {
    const text = 'var x = "hello world";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.Other },
      // opening "
      { startIndex: 9, type: StandardTokenType.String },
      // hello world
      { startIndex: 20, type: StandardTokenType.Other },
      // closing "
      { startIndex: 21, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "hello");
  });
  test("RTL content in string falls back to word select", () => {
    const text = 'var x = "\u05E9\u05DC\u05D5\u05DD \u05E2\u05D5\u05DC\u05DD";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      { startIndex: 19, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "\u05E9\u05DC\u05D5\u05DD");
  });
  test("String token without matching closing quote falls back to word select", () => {
    const text = 'var x = "a {} b";';
    const controller = createViewControllerWithTokens(text, [
      { startIndex: 0, type: StandardTokenType.Other },
      { startIndex: 8, type: StandardTokenType.String },
      // `"a ` — starts with " but doesn't end with "
      { startIndex: 11, type: StandardTokenType.Other },
      // `{}`
      { startIndex: 13, type: StandardTokenType.String },
      // ` b"` — ends with " but doesn't start with "
      { startIndex: 16, type: StandardTokenType.Other }
    ]);
    assert.strictEqual(doubleClickAt(controller, new Position(1, 10)), "a");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXHZpZXdcXHZpZXdDb250cm9sbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOYXZpZ2F0aW9uQ29tbWFuZFJldmVhbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvcmVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlldy92aWV3Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBWaWV3VXNlcklucHV0RXZlbnRzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3L3ZpZXdVc2VySW5wdXRFdmVudHMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBNZXRhZGF0YUNvbnN0cywgU3RhbmRhcmRUb2tlblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0LCBJVG9rZW5pemF0aW9uU3VwcG9ydCwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9tb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC92aWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IGluc3RhbnRpYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbmZpZy90ZXN0Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb2RlRWRpdG9yU2VydmljZXMgfSBmcm9tICcuLi90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbnN1aXRlKCdWaWV3Q29udHJvbGxlciAtIEJyYWNrZXQgY29udGVudCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRsZXQgdmlld01vZGVsOiBWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0dmlld01vZGVsID0gdW5kZWZpbmVkO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0dmlld01vZGVsPy5kaXNwb3NlKCk7XG5cdFx0dmlld01vZGVsID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVGV4dCh0ZXh0OiBzdHJpbmcpOiBWaWV3Q29udHJvbGxlciB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICd0ZXN0TW9kZSc7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGJyYWNrZXRzOiBbXG5cdFx0XHRcdFsneycsICd9J10sXG5cdFx0XHRcdFsnWycsICddJ10sXG5cdFx0XHRcdFsnKCcsICcpJ10sXG5cdFx0XHRdXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdENvbmZpZ3VyYXRpb24oe30pKTtcblx0XHRjb25zdCBtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5ID0gTW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeS5jcmVhdGUoY29uZmlndXJhdGlvbi5vcHRpb25zKTtcblxuXHRcdHZpZXdNb2RlbCA9IG5ldyBWaWV3TW9kZWwoXG5cdFx0XHQxLCAvLyBlZGl0b3JJZFxuXHRcdFx0Y29uZmlndXJhdGlvbixcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgdGV4dCwgbGFuZ3VhZ2VJZCkpLFxuXHRcdFx0bW9ub3NwYWNlTGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSxcblx0XHRcdG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRudWxsISxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSksXG5cdFx0XHRuZXcgVGVzdFRoZW1lU2VydmljZSgpLFxuXHRcdFx0eyBzZXRWaXNpYmxlTGluZXMoKSB7IH0gfSxcblx0XHRcdHsgYmF0Y2hDaGFuZ2VzOiAoY2I6IGFueSkgPT4gY2IoKSB9XG5cdFx0KTtcblxuXHRcdHJldHVybiBuZXcgVmlld0NvbnRyb2xsZXIoXG5cdFx0XHRjb25maWd1cmF0aW9uLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdFx0bmV3IFZpZXdVc2VySW5wdXRFdmVudHModmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyKSxcblx0XHRcdHtcblx0XHRcdFx0cGFzdGU6ICgpID0+IHsgfSxcblx0XHRcdFx0dHlwZTogKCkgPT4geyB9LFxuXHRcdFx0XHRjb21wb3NpdGlvblR5cGU6ICgpID0+IHsgfSxcblx0XHRcdFx0c3RhcnRDb21wb3NpdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0XHRlbmRDb21wb3NpdGlvbjogKCkgPT4geyB9LFxuXHRcdFx0XHRjdXQ6ICgpID0+IHsgfVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0QnJhY2tldFNlbGVjdGlvbih0ZXh0OiBzdHJpbmcsIHBvc2l0aW9uOiBQb3NpdGlvbiwgZXhwZWN0ZWRUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVGV4dCh0ZXh0KTtcblx0XHRjb250cm9sbGVyLmRpc3BhdGNoTW91c2Uoe1xuXHRcdFx0cG9zaXRpb24sXG5cdFx0XHRtb3VzZUNvbHVtbjogcG9zaXRpb24uY29sdW1uLFxuXHRcdFx0c3RhcnRlZE9uTGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0cmV2ZWFsVHlwZTogTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlLk1pbmltYWwsXG5cdFx0XHRtb3VzZURvd25Db3VudDogMixcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdGxlZnRCdXR0b246IHRydWUsXG5cdFx0XHRtaWRkbGVCdXR0b246IGZhbHNlLFxuXHRcdFx0b25JbmplY3RlZFRleHQ6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdmlld01vZGVsIS5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRUZXh0ID0gdmlld01vZGVsIS5tb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uc1swXSk7XG5cdFx0aWYgKGV4cGVjdGVkVGV4dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2VsZWN0ZWRUZXh0LCBleHBlY3RlZFRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VsZWN0ZWRUZXh0LCBleHBlY3RlZFRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ1NlbGVjdCBjb250ZW50IGFmdGVyIG9wZW5pbmcgY3VybHkgYnJhY2UnLCAoKSA9PiB7XG5cdFx0dGVzdEJyYWNrZXRTZWxlY3Rpb24oJ3ZhciB4ID0geyBoZWxsbyB9OycsIG5ldyBQb3NpdGlvbigxLCAxMCksICcgaGVsbG8gJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlbGVjdCBjb250ZW50IGJlZm9yZSBjbG9zaW5nIGN1cmx5IGJyYWNlJywgKCkgPT4ge1xuXHRcdHRlc3RCcmFja2V0U2VsZWN0aW9uKCd2YXIgeCA9IHsgaGVsbG8gfTsnLCBuZXcgUG9zaXRpb24oMSwgMTcpLCAnIGhlbGxvICcpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWxlY3QgY29udGVudCBhZnRlciBvcGVuaW5nIHBhcmVudGhlc2lzJywgKCkgPT4ge1xuXHRcdHRlc3RCcmFja2V0U2VsZWN0aW9uKCdmdW5jdGlvbiBmb28oYXJnMSwgYXJnMikge30nLCBuZXcgUG9zaXRpb24oMSwgMTQpLCAnYXJnMSwgYXJnMicpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWxlY3QgY29udGVudCBiZWZvcmUgY2xvc2luZyBwYXJlbnRoZXNpcycsICgpID0+IHtcblx0XHR0ZXN0QnJhY2tldFNlbGVjdGlvbignZnVuY3Rpb24gZm9vKGFyZzEsIGFyZzIpIHt9JywgbmV3IFBvc2l0aW9uKDEsIDI0KSwgJ2FyZzEsIGFyZzInKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IGNvbnRlbnQgYWZ0ZXIgb3BlbmluZyBzcXVhcmUgYnJhY2tldCcsICgpID0+IHtcblx0XHR0ZXN0QnJhY2tldFNlbGVjdGlvbignY29uc3QgYXJyID0gWyAxLCAyLCAzIF07JywgbmV3IFBvc2l0aW9uKDEsIDE0KSwgJyAxLCAyLCAzICcpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWxlY3QgY29udGVudCBiZWZvcmUgY2xvc2luZyBzcXVhcmUgYnJhY2tldCcsICgpID0+IHtcblx0XHR0ZXN0QnJhY2tldFNlbGVjdGlvbignY29uc3QgYXJyID0gWyAxLCAyLCAzIF07JywgbmV3IFBvc2l0aW9uKDEsIDIzKSwgJyAxLCAyLCAzICcpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWxlY3QgaW5uZXJtb3N0IGJyYWNrZXQgY29udGVudCB3aXRoIG5lc3RlZCBicmFja2V0cycsICgpID0+IHtcblx0XHR0ZXN0QnJhY2tldFNlbGVjdGlvbigndmFyIHggPSB7IGE6IHsgYjogMTIzIH19OycsIG5ldyBQb3NpdGlvbigxLCAxNSksICcgYjogMTIzICcpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbXB0eSBicmFja2V0cyBjcmVhdGUgZW1wdHkgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3RCcmFja2V0U2VsZWN0aW9uKCd2YXIgeCA9IHt9OycsIG5ldyBQb3NpdGlvbigxLCAxMCksICcnKTtcblx0fSk7XG59KTtcblxuaW50ZXJmYWNlIFRva2VuU3BhbiB7XG5cdHN0YXJ0SW5kZXg6IG51bWJlcjtcblx0dHlwZTogU3RhbmRhcmRUb2tlblR5cGU7XG59XG5cbnN1aXRlKCdWaWV3Q29udHJvbGxlciAtIFN0cmluZyBjb250ZW50IHNlbGVjdGlvbicsICgpID0+IHtcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cdGxldCB2aWV3TW9kZWw6IFZpZXdNb2RlbCB8IHVuZGVmaW5lZDtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVDb2RlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHR2aWV3TW9kZWwgPSB1bmRlZmluZWQ7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHR2aWV3TW9kZWw/LmRpc3Bvc2UoKTtcblx0XHR2aWV3TW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVWaWV3Q29udHJvbGxlcldpdGhUb2tlbnModGV4dDogc3RyaW5nLCBsaW5lVG9rZW5zOiBUb2tlblNwYW5bXSk6IFZpZXdDb250cm9sbGVyIHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3N0cmluZ1Rlc3RNb2RlJztcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXSxcblx0XHRcdF1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBlbmNvZGVkTGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKTtcblx0XHRjb25zdCBtYWtlTWV0YWRhdGEgPSAodHlwZTogU3RhbmRhcmRUb2tlblR5cGUpID0+IChcblx0XHRcdChlbmNvZGVkTGFuZ3VhZ2VJZCA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdHwgKHR5cGUgPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpXG5cdFx0KSA+Pj4gMDtcblxuXHRcdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRcdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKSA9PiBOdWxsU3RhdGUsXG5cdFx0XHR0b2tlbml6ZTogdW5kZWZpbmVkISxcblx0XHRcdHRva2VuaXplRW5jb2RlZDogKF9saW5lLCBfaGFzRU9MLCBzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBhcnIgPSBuZXcgVWludDMyQXJyYXkobGluZVRva2Vucy5sZW5ndGggKiAyKTtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lVG9rZW5zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0YXJyW2kgKiAyXSA9IGxpbmVUb2tlbnNbaV0uc3RhcnRJbmRleDtcblx0XHRcdFx0XHRhcnJbaSAqIDIgKyAxXSA9IG1ha2VNZXRhZGF0YShsaW5lVG9rZW5zW2ldLnR5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdChhcnIsIFtdLCBzdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCB0b2tlbml6YXRpb25TdXBwb3J0KSk7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q29uZmlndXJhdGlvbih7fSkpO1xuXHRcdGNvbnN0IG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnkgPSBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LmNyZWF0ZShjb25maWd1cmF0aW9uLm9wdGlvbnMpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0ZXh0LCBsYW5ndWFnZUlkKSk7XG5cblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMSk7XG5cblx0XHR2aWV3TW9kZWwgPSBuZXcgVmlld01vZGVsKFxuXHRcdFx0MSxcblx0XHRcdGNvbmZpZ3VyYXRpb24sXG5cdFx0XHRtb2RlbCxcblx0XHRcdG1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRtb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdFx0bnVsbCEsXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IFRlc3RUaGVtZVNlcnZpY2UoKSxcblx0XHRcdHsgc2V0VmlzaWJsZUxpbmVzKCkgeyB9IH0sXG5cdFx0XHR7IGJhdGNoQ2hhbmdlczogKGNiOiBhbnkpID0+IGNiKCkgfVxuXHRcdCk7XG5cblx0XHRyZXR1cm4gbmV3IFZpZXdDb250cm9sbGVyKFxuXHRcdFx0Y29uZmlndXJhdGlvbixcblx0XHRcdHZpZXdNb2RlbCxcblx0XHRcdG5ldyBWaWV3VXNlcklucHV0RXZlbnRzKHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlciksXG5cdFx0XHR7XG5cdFx0XHRcdHBhc3RlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHR5cGU6ICgpID0+IHsgfSxcblx0XHRcdFx0Y29tcG9zaXRpb25UeXBlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdHN0YXJ0Q29tcG9zaXRpb246ICgpID0+IHsgfSxcblx0XHRcdFx0ZW5kQ29tcG9zaXRpb246ICgpID0+IHsgfSxcblx0XHRcdFx0Y3V0OiAoKSA9PiB7IH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gZG91YmxlQ2xpY2tBdChjb250cm9sbGVyOiBWaWV3Q29udHJvbGxlciwgcG9zaXRpb246IFBvc2l0aW9uKTogc3RyaW5nIHtcblx0XHRjb250cm9sbGVyLmRpc3BhdGNoTW91c2Uoe1xuXHRcdFx0cG9zaXRpb24sXG5cdFx0XHRtb3VzZUNvbHVtbjogcG9zaXRpb24uY29sdW1uLFxuXHRcdFx0c3RhcnRlZE9uTGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0cmV2ZWFsVHlwZTogTmF2aWdhdGlvbkNvbW1hbmRSZXZlYWxUeXBlLk1pbmltYWwsXG5cdFx0XHRtb3VzZURvd25Db3VudDogMixcblx0XHRcdGluU2VsZWN0aW9uTW9kZTogZmFsc2UsXG5cdFx0XHRhbHRLZXk6IGZhbHNlLFxuXHRcdFx0Y3RybEtleTogZmFsc2UsXG5cdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdHNoaWZ0S2V5OiBmYWxzZSxcblx0XHRcdGxlZnRCdXR0b246IHRydWUsXG5cdFx0XHRtaWRkbGVCdXR0b246IGZhbHNlLFxuXHRcdFx0b25JbmplY3RlZFRleHQ6IGZhbHNlXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHZpZXdNb2RlbCEuZ2V0U2VsZWN0aW9ucygpO1xuXHRcdHJldHVybiB2aWV3TW9kZWwhLm1vZGVsLmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb25zWzBdKTtcblx0fVxuXG5cdC8vIC0tIEhhcHB5LXBhdGg6IHdob2xlIHN0cmluZyBhcyBhIHNpbmdsZSB0b2tlbiBpbmNsdWRpbmcgcXVvdGVzIC0tXG5cblx0dGVzdCgnU2VsZWN0IHN0cmluZyBjb250ZW50IGNsaWNraW5nIHJpZ2h0IGFmdGVyIG9wZW5pbmcgZG91YmxlIHF1b3RlJywgKCkgPT4ge1xuXHRcdC8vICAgICAgICAgICAgICAgIDAxMjM0NTY3ODkuLi5cblx0XHRjb25zdCB0ZXh0ID0gJ3ZhciB4ID0gXCJoZWxsb1wiOyc7XG5cdFx0Ly8gVG9rZW4gbGF5b3V0OiBbMC4uOCkgT3RoZXIgIFs4Li4xNSkgU3RyaW5nKFwiaGVsbG9cIikgIFsxNS4uMTYpIE90aGVyXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IGNyZWF0ZVZpZXdDb250cm9sbGVyV2l0aFRva2Vucyh0ZXh0LCBbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDgsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxNSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRdKTtcblx0XHQvLyBDb2x1bW4gcmlnaHQgYWZ0ZXIgb3BlbmluZyBxdW90ZTogb2Zmc2V0IDkgXHUyMTkyIGNvbHVtbiAxMFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3VibGVDbGlja0F0KGNvbnRyb2xsZXIsIG5ldyBQb3NpdGlvbigxLCAxMCkpLCAnaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IHN0cmluZyBjb250ZW50IGNsaWNraW5nIGF0IGNsb3NpbmcgZG91YmxlIHF1b3RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSAndmFyIHggPSBcImhlbGxvXCI7Jztcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE1LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdC8vIENvbHVtbiBhdCBjbG9zaW5nIHF1b3RlOiBvZmZzZXQgMTQgXHUyMTkyIGNvbHVtbiAxNVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3VibGVDbGlja0F0KGNvbnRyb2xsZXIsIG5ldyBQb3NpdGlvbigxLCAxNSkpLCAnaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IHN0cmluZyBjb250ZW50IHdpdGggc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gYHZhciB4ID0gJ2hlbGxvJztgO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVWaWV3Q29udHJvbGxlcldpdGhUb2tlbnModGV4dCwgW1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA4LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTUsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvdWJsZUNsaWNrQXQoY29udHJvbGxlciwgbmV3IFBvc2l0aW9uKDEsIDEwKSksICdoZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWxlY3Qgc3RyaW5nIGNvbnRlbnQgd2l0aCBiYWNrdGljayBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICd2YXIgeCA9IGBoZWxsb2A7Jztcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE1LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb3VibGVDbGlja0F0KGNvbnRyb2xsZXIsIG5ldyBQb3NpdGlvbigxLCAxMCkpLCAnaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnU2VsZWN0IHN0cmluZyBjb250ZW50IGNvbnRhaW5pbmcgZXNjYXBlIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0Ly8gICAgICAgICAgICAgICAgMDEyMzQ1Njc4OS4uLlxuXHRcdGNvbnN0IHRleHQgPSAndmFyIHggPSBcImhlbGxvXFxcXFwid29ybGRcIjsnO1xuXHRcdC8vIFRva2VuIGxheW91dDogWzAuLjgpIE90aGVyICBbOC4uMjIpIFN0cmluZyhcImhlbGxvXFxcIndvcmxkXCIpICBbMjIuLjIzKSBPdGhlclxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVWaWV3Q29udHJvbGxlcldpdGhUb2tlbnModGV4dCwgW1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA4LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE0LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTYsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAyMSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDIyLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdC8vIENvbHVtbiByaWdodCBhZnRlciBvcGVuaW5nIHF1b3RlOiBvZmZzZXQgOSBcdTIxOTIgY29sdW1uIDEwXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvdWJsZUNsaWNrQXQoY29udHJvbGxlciwgbmV3IFBvc2l0aW9uKDEsIDEwKSksICdoZWxsb1xcXFxcIndvcmxkJyk7XG5cdH0pO1xuXG5cdC8vIC0tIENsaWNrIGluIG1pZGRsZSBvZiBzdHJpbmcgc2hvdWxkIE5PVCBzZWxlY3QgdGhlIHdob2xlIHN0cmluZyAtLVxuXG5cdHRlc3QoJ0NsaWNrIGluIG1pZGRsZSBvZiBzdHJpbmcgZG9lcyBub3Qgc2VsZWN0IHdob2xlIHN0cmluZycsICgpID0+IHtcblx0XHQvLyAgICAgICAgICAgICAgICAwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxXG5cdFx0Y29uc3QgdGV4dCA9ICd2YXIgeCA9IFwiaGVsbG8gd29ybGRcIjsnO1xuXHRcdC8vIFRva2VuIGxheW91dDogWzAuLjgpIE90aGVyICBbOC4uMjEpIFN0cmluZyhcImhlbGxvIHdvcmxkXCIpICBbMjEuLjIyKSBPdGhlclxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVWaWV3Q29udHJvbGxlcldpdGhUb2tlbnModGV4dCwgW1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA4LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMjEsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XSk7XG5cdFx0Ly8gQ2xpY2sgb24gJ3cnIGluIFwid29ybGRcIiBcdTIwMTQgd29yZCBzZWxlY3Qgc2hvdWxkIHBpY2sgJ3dvcmxkJywgbm90ICdoZWxsbyB3b3JsZCdcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG91YmxlQ2xpY2tBdChjb250cm9sbGVyLCBuZXcgUG9zaXRpb24oMSwgMTYpKSwgJ3dvcmxkJyk7XG5cdH0pO1xuXG5cdC8vIC0tIEJhaWwtb3V0OiBxdW90ZXMgYXMgc2VwYXJhdGUgdG9rZW5zICh0aGVtZSBpc3N1ZSAjMjkyNzg0KSAtLVxuXG5cdHRlc3QoJ1NlcGFyYXRlIHF1b3RlIHRva2VucyBmYWxsIGJhY2sgdG8gd29yZCBzZWxlY3QnLCAoKSA9PiB7XG5cdFx0Ly8gICAgICAgICAgICAgICAgMCAgICAgICAgIDEgICAgICAgICAyXG5cdFx0Ly8gICAgICAgICAgICAgICAgMDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNFxuXHRcdGNvbnN0IHRleHQgPSAndmFyIHggPSBcImhlbGxvIHdvcmxkXCI7Jztcblx0XHQvLyBUaGVtZSB0b2tlbml6ZXMgcXVvdGVzIGFzIHNlcGFyYXRlIE90aGVyIHRva2Vuczpcblx0XHQvLyBbMC4uOCkgT3RoZXIgIFs4Li45KSBPdGhlcihcIikgIFs5Li4yMCkgU3RyaW5nKGhlbGxvIHdvcmxkKSAgWzIwLi4yMSkgT3RoZXIoXCIpICBbMjEuLjIyKSBPdGhlclxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBjcmVhdGVWaWV3Q29udHJvbGxlcldpdGhUb2tlbnModGV4dCwgW1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA4LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LCAgIC8vIG9wZW5pbmcgXCJcblx0XHRcdHsgc3RhcnRJbmRleDogOSwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sICAvLyBoZWxsbyB3b3JsZFxuXHRcdFx0eyBzdGFydEluZGV4OiAyMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSwgIC8vIGNsb3NpbmcgXCJcblx0XHRcdHsgc3RhcnRJbmRleDogMjEsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XSk7XG5cdFx0Ly8gVGhlIFN0cmluZyB0b2tlbiBcImhlbGxvIHdvcmxkXCIgZG9lc24ndCBzdGFydCB3aXRoIGEgcXVvdGUgY2hhciBcdTIxOTIgc2hvdWxkIGJhaWwgb3V0LlxuXHRcdC8vIENsaWNrIHJpZ2h0IGFmdGVyIG9wZW5pbmcgcXVvdGUgKGNvbHVtbiAxMCkgXHUyMTkyIHdvcmQgc2VsZWN0IHBpY2tzIGp1c3QgJ2hlbGxvJy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG91YmxlQ2xpY2tBdChjb250cm9sbGVyLCBuZXcgUG9zaXRpb24oMSwgMTApKSwgJ2hlbGxvJyk7XG5cdH0pO1xuXG5cdC8vIC0tIEJhaWwtb3V0OiBSVEwgY29udGVudCBpbiBzdHJpbmcgKCMyOTMzODQpIC0tXG5cblx0dGVzdCgnUlRMIGNvbnRlbnQgaW4gc3RyaW5nIGZhbGxzIGJhY2sgdG8gd29yZCBzZWxlY3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9ICd2YXIgeCA9IFwiXHUwNUU5XHUwNURDXHUwNUQ1XHUwNUREIFx1MDVFMlx1MDVENVx1MDVEQ1x1MDVERFwiOyc7XG5cdFx0Ly8gVG9rZW4gbGF5b3V0OiBbMC4uOCkgT3RoZXIgIFs4Li4xOSkgU3RyaW5nKFwiXHUwNUU5XHUwNURDXHUwNUQ1XHUwNUREIFx1MDVFMlx1MDVENVx1MDVEQ1x1MDVERFwiKSAgWzE5Li4yMCkgT3RoZXJcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE5LCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdF0pO1xuXHRcdC8vIFNob3VsZCBiYWlsIG91dCBkdWUgdG8gUlRMIGNvbnRlbnQgXHUyMTkyIHdvcmQgc2VsZWN0IHBpY2tzIGZpcnN0IHdvcmRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG91YmxlQ2xpY2tBdChjb250cm9sbGVyLCBuZXcgUG9zaXRpb24oMSwgMTApKSwgJ1x1MDVFOVx1MDVEQ1x1MDVENVx1MDVERCcpO1xuXHR9KTtcblxuXHQvLyAtLSBCYWlsLW91dDogbWlzbWF0Y2hlZCBxdW90ZXMgKCMyOTMyMDMgXHUyMDE0IHN0cmluZyBzcGxpdCBhdCBicmFjZXMpIC0tXG5cblx0dGVzdCgnU3RyaW5nIHRva2VuIHdpdGhvdXQgbWF0Y2hpbmcgY2xvc2luZyBxdW90ZSBmYWxscyBiYWNrIHRvIHdvcmQgc2VsZWN0JywgKCkgPT4ge1xuXHRcdC8vICAgICAgICAgICAgICAgIDAxMjM0NTY3ODkwMTIzNDVcblx0XHRjb25zdCB0ZXh0ID0gJ3ZhciB4ID0gXCJhIHt9IGJcIjsnO1xuXHRcdC8vIEh5cG90aGV0aWNhbCB0b2tlbml6ZXIgc3BsaXRzOiBbMC4uOCkgT3RoZXIgIFs4Li4xMSkgU3RyaW5nKFwiYSApICBbMTEuLjEzKSBPdGhlcih7fSkgIFsxMy4uMTcpIFN0cmluZyggYlwiKSAgWzE3Li4xOCkgT3RoZXJcblx0XHRjb25zdCBjb250cm9sbGVyID0gY3JlYXRlVmlld0NvbnRyb2xsZXJXaXRoVG9rZW5zKHRleHQsIFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOCwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sICAvLyBgXCJhIGAgXHUyMDE0IHN0YXJ0cyB3aXRoIFwiIGJ1dCBkb2Vzbid0IGVuZCB3aXRoIFwiXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDExLCB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LCAgLy8gYHt9YFxuXHRcdFx0eyBzdGFydEluZGV4OiAxMywgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sIC8vIGAgYlwiYCBcdTIwMTQgZW5kcyB3aXRoIFwiIGJ1dCBkb2Vzbid0IHN0YXJ0IHdpdGggXCJcblx0XHRcdHsgc3RhcnRJbmRleDogMTYsIHR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XSk7XG5cdFx0Ly8gRmlyc3QgU3RyaW5nIHRva2VuIHN0YXJ0cyB3aXRoIFwiIGJ1dCBlbmRzIHdpdGggc3BhY2UgXHUyMTkyIGJhaWwgb3V0IFx1MjE5MiB3b3JkIHNlbGVjdCBwaWNrcyAnYSdcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG91YmxlQ2xpY2tBdChjb250cm9sbGVyLCBuZXcgUG9zaXRpb24oMSwgMTApKSwgJ2EnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUV4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFT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
