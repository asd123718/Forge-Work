import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { Range } from "../../../../common/core/range.js";
import { Selection } from "../../../../common/core/selection.js";
import { MetadataConsts, StandardTokenType } from "../../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../../common/languages.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { NullState } from "../../../../common/languages/nullTokenize.js";
import { AutoIndentOnPaste, IndentationToSpacesCommand, IndentationToTabsCommand } from "../../browser/indentation.js";
import { withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { testCommand } from "../../../../test/browser/testCommand.js";
import { goIndentationRules, htmlIndentationRules, javascriptIndentationRules, latexIndentationRules, luaIndentationRules, phpIndentationRules, rubyIndentationRules, vbIndentationRules } from "../../../../test/common/modes/supports/indentationRules.js";
import { cppOnEnterRules, htmlOnEnterRules, javascriptOnEnterRules, phpOnEnterRules, vbOnEnterRules } from "../../../../test/common/modes/supports/onEnterRules.js";
import { TypeOperations } from "../../../../common/cursor/cursorTypeOperations.js";
import { cppBracketRules, goBracketRules, htmlBracketRules, latexBracketRules, luaBracketRules, phpBracketRules, rubyBracketRules, typescriptBracketRules, vbBracketRules } from "../../../../test/common/modes/supports/bracketRules.js";
import { javascriptAutoClosingPairsRules, latexAutoClosingPairsRules } from "../../../../test/common/modes/supports/autoClosingPairsRules.js";
import { LanguageService } from "../../../../common/services/languageService.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
var Language = /* @__PURE__ */ ((Language2) => {
  Language2["TypeScript"] = "ts-test";
  Language2["Ruby"] = "ruby-test";
  Language2["PHP"] = "php-test";
  Language2["Go"] = "go-test";
  Language2["CPP"] = "cpp-test";
  Language2["HTML"] = "html-test";
  Language2["VB"] = "vb-test";
  Language2["Latex"] = "latex-test";
  Language2["Lua"] = "lua-test";
  return Language2;
})(Language || {});
function testIndentationToSpacesCommand(lines, selection, tabSize, expectedLines, expectedSelection) {
  testCommand(lines, null, selection, (accessor, sel) => new IndentationToSpacesCommand(sel, tabSize), expectedLines, expectedSelection);
}
function testIndentationToTabsCommand(lines, selection, tabSize, expectedLines, expectedSelection) {
  testCommand(lines, null, selection, (accessor, sel) => new IndentationToTabsCommand(sel, tabSize), expectedLines, expectedSelection);
}
function registerLanguage(languageService, language) {
  return languageService.registerLanguage({ id: language });
}
function registerLanguageConfiguration(languageConfigurationService, language) {
  switch (language) {
    case "ts-test" /* TypeScript */:
      return languageConfigurationService.register(language, {
        brackets: typescriptBracketRules,
        comments: {
          lineComment: "//",
          blockComment: ["/*", "*/"]
        },
        autoClosingPairs: javascriptAutoClosingPairsRules,
        indentationRules: javascriptIndentationRules,
        onEnterRules: javascriptOnEnterRules
      });
    case "ruby-test" /* Ruby */:
      return languageConfigurationService.register(language, {
        brackets: rubyBracketRules,
        indentationRules: rubyIndentationRules
      });
    case "php-test" /* PHP */:
      return languageConfigurationService.register(language, {
        brackets: phpBracketRules,
        indentationRules: phpIndentationRules,
        onEnterRules: phpOnEnterRules
      });
    case "go-test" /* Go */:
      return languageConfigurationService.register(language, {
        brackets: goBracketRules,
        indentationRules: goIndentationRules
      });
    case "cpp-test" /* CPP */:
      return languageConfigurationService.register(language, {
        brackets: cppBracketRules,
        onEnterRules: cppOnEnterRules
      });
    case "html-test" /* HTML */:
      return languageConfigurationService.register(language, {
        brackets: htmlBracketRules,
        indentationRules: htmlIndentationRules,
        onEnterRules: htmlOnEnterRules
      });
    case "vb-test" /* VB */:
      return languageConfigurationService.register(language, {
        brackets: vbBracketRules,
        indentationRules: vbIndentationRules,
        onEnterRules: vbOnEnterRules
      });
    case "latex-test" /* Latex */:
      return languageConfigurationService.register(language, {
        brackets: latexBracketRules,
        autoClosingPairs: latexAutoClosingPairsRules,
        indentationRules: latexIndentationRules
      });
    case "lua-test" /* Lua */:
      return languageConfigurationService.register(language, {
        brackets: luaBracketRules,
        indentationRules: luaIndentationRules
      });
  }
}
function registerTokenizationSupport(instantiationService, tokens, languageId) {
  let lineIndex = 0;
  const languageService = instantiationService.get(ILanguageService);
  const tokenizationSupport = {
    getInitialState: () => NullState,
    tokenize: void 0,
    tokenizeEncoded: (line, hasEOL, state) => {
      const tokensOnLine = tokens[lineIndex++];
      const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
      const result = new Uint32Array(2 * tokensOnLine.length);
      for (let i = 0; i < tokensOnLine.length; i++) {
        result[2 * i] = tokensOnLine[i].startIndex;
        result[2 * i + 1] = encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | tokensOnLine[i].standardTokenType << MetadataConsts.TOKEN_TYPE_OFFSET;
      }
      return new EncodedTokenizationResult(result, [], state);
    }
  };
  return TokenizationRegistry.register(languageId, tokenizationSupport);
}
suite("Change Indentation to Spaces - TypeScript/Javascript", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("single tabs only at start of line", function() {
    testIndentationToSpacesCommand(
      [
        "first",
        "second line",
        "third line",
        "	fourth line",
        "	fifth"
      ],
      new Selection(2, 3, 2, 3),
      4,
      [
        "first",
        "second line",
        "third line",
        "    fourth line",
        "    fifth"
      ],
      new Selection(2, 3, 2, 3)
    );
  });
  test("multiple tabs at start of line", function() {
    testIndentationToSpacesCommand(
      [
        "		first",
        "	second line",
        "			 third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5),
      3,
      [
        "      first",
        "   second line",
        "          third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 9, 1, 9)
    );
  });
  test("multiple tabs", function() {
    testIndentationToSpacesCommand(
      [
        "		first	",
        "	second  	 line 	",
        "			 third line",
        " 	fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5),
      2,
      [
        "    first	",
        "  second  	 line 	",
        "       third line",
        "   fourth line",
        "fifth"
      ],
      new Selection(1, 7, 1, 7)
    );
  });
  test("empty lines", function() {
    testIndentationToSpacesCommand(
      [
        "			",
        "	",
        "		"
      ],
      new Selection(1, 4, 1, 4),
      2,
      [
        "      ",
        "  ",
        "    "
      ],
      new Selection(1, 4, 1, 4)
    );
  });
});
suite("Change Indentation to Tabs -  TypeScript/Javascript", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("spaces only at start of line", function() {
    testIndentationToTabsCommand(
      [
        "    first",
        "second line",
        "    third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 3, 2, 3),
      4,
      [
        "	first",
        "second line",
        "	third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 3, 2, 3)
    );
  });
  test("multiple spaces at start of line", function() {
    testIndentationToTabsCommand(
      [
        "first",
        "   second line",
        "          third line",
        "fourth line",
        "     fifth"
      ],
      new Selection(1, 5, 1, 5),
      3,
      [
        "first",
        "	second line",
        "			 third line",
        "fourth line",
        "	  fifth"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("multiple spaces", function() {
    testIndentationToTabsCommand(
      [
        "      first   ",
        "  second     line 	",
        "       third line",
        "   fourth line",
        "fifth"
      ],
      new Selection(1, 8, 1, 8),
      2,
      [
        "			first   ",
        "	second     line 	",
        "			 third line",
        "	 fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("issue #45996", function() {
    testIndentationToSpacesCommand(
      [
        "	abc"
      ],
      new Selection(1, 3, 1, 3),
      4,
      [
        "    abc"
      ],
      new Selection(1, 6, 1, 6)
    );
  });
});
suite("Indent With Tab - TypeScript/JavaScript", () => {
  const languageId = "ts-test" /* TypeScript */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("temp issue because there should be at least one passing test in a suite", () => {
    assert.ok(true);
  });
  test.skip("issue #63388: perserve correct indentation on tab 1", () => {
    const model = createTextModel([
      "/*",
      " * Comment",
      " * /"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(1, 1, 3, 5));
      editor.executeCommands("editor.action.indentLines", TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
      assert.strictEqual(model.getValue(), [
        "    /*",
        "     * Comment",
        "     * /"
      ].join("\n"));
    });
  });
  test.skip("issue #63388: perserve correct indentation on tab 2", () => {
    const model = createTextModel([
      "switch (something) {",
      "  case 1:",
      "    whatever();",
      "    break;",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(1, 1, 5, 2));
      editor.executeCommands("editor.action.indentLines", TypeOperations.indent(viewModel.cursorConfig, editor.getModel(), editor.getSelections()));
      assert.strictEqual(model.getValue(), [
        "    switch (something) {",
        "        case 1:",
        "            whatever();",
        "            break;",
        "    }"
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Paste - TypeScript/JavaScript", () => {
  const languageId = "ts-test" /* TypeScript */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #119225: Do not add extra leading space when pasting JSDoc", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const pasteText = [
        "/**",
        " * JSDoc",
        " */",
        "function a() {}"
      ].join("\n");
      const tokens = [
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 3, standardTokenType: StandardTokenType.Comment }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 2, standardTokenType: StandardTokenType.Comment },
          { startIndex: 8, standardTokenType: StandardTokenType.Comment }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 1, standardTokenType: StandardTokenType.Comment },
          { startIndex: 3, standardTokenType: StandardTokenType.Other }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Other },
          { startIndex: 8, standardTokenType: StandardTokenType.Other },
          { startIndex: 9, standardTokenType: StandardTokenType.Other },
          { startIndex: 10, standardTokenType: StandardTokenType.Other },
          { startIndex: 11, standardTokenType: StandardTokenType.Other },
          { startIndex: 12, standardTokenType: StandardTokenType.Other },
          { startIndex: 13, standardTokenType: StandardTokenType.Other },
          { startIndex: 14, standardTokenType: StandardTokenType.Other },
          { startIndex: 15, standardTokenType: StandardTokenType.Other }
        ]
      ];
      disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(pasteText, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(1, 1, 4, 16));
      assert.strictEqual(model.getValue(), pasteText);
    });
  });
  test("issue #167299: Blank line removes indent", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const pasteText = [
        "",
        "export type IncludeReference =",
        "	| BaseReference",
        "	| SelfReference",
        "	| RelativeReference;",
        "",
        "export const enum IncludeReferenceKind {",
        "	Base,",
        "	Self,",
        "	RelativeReference,",
        "}"
      ].join("\n");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(pasteText, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(1, 1, 11, 2));
      assert.strictEqual(model.getValue(), pasteText);
    });
  });
  test("issue #29803: do not indent when pasting text with only one line", () => {
    const model = createTextModel([
      "const linkHandler = new Class(a, b, c,",
      "    d)"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(2, 6, 2, 6));
      const text = ", null";
      viewModel.paste(text, true, void 0, "keyboard");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      autoIndentOnPasteController.trigger(new Range(2, 6, 2, 11));
      assert.strictEqual(model.getValue(), [
        "const linkHandler = new Class(a, b, c,",
        "    d, null)"
      ].join("\n"));
    });
  });
  test("issue #29753: incorrect indentation after comment", () => {
    const model = createTextModel([
      "class A {",
      "    /**",
      "     * used only for debug purposes.",
      "     */",
      "    private _codeInfo: KeyMapping[];",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(5, 24, 5, 34));
      const text = "IMacLinuxKeyMapping";
      viewModel.paste(text, true, void 0, "keyboard");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      autoIndentOnPasteController.trigger(new Range(5, 24, 5, 43));
      assert.strictEqual(model.getValue(), [
        "class A {",
        "    /**",
        "     * used only for debug purposes.",
        "     */",
        "    private _codeInfo: IMacLinuxKeyMapping[];",
        "}"
      ].join("\n"));
    });
  });
  test("issue #29753: incorrect indentation of header comment", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const text = [
        "/*----------------",
        " *  Copyright (c) ",
        " *  Licensed under ...",
        " *-----------------*/"
      ].join("\n");
      viewModel.paste(text, true, void 0, "keyboard");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      autoIndentOnPasteController.trigger(new Range(1, 1, 4, 22));
      assert.strictEqual(model.getValue(), text);
    });
  });
  test("issue #209859: do not do change indentation when pasted inside of a string", () => {
    const initialText = [
      'const foo = "some text',
      "         which is strangely",
      '    indented"'
    ].join("\n");
    const model = createTextModel(initialText, languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const tokens = [
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Other },
          { startIndex: 12, standardTokenType: StandardTokenType.String }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.String }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.String }
        ]
      ];
      disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
      editor.setSelection(new Selection(2, 10, 2, 15));
      viewModel.paste("which", true, void 0, "keyboard");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      autoIndentOnPasteController.trigger(new Range(2, 1, 2, 28));
      assert.strictEqual(model.getValue(), initialText);
    });
  });
  test.skip("issue #181065: Incorrect paste of object within comment", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const text = [
        "/**",
        " * @typedef {",
        " * }",
        " */"
      ].join("\n");
      const tokens = [
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 3, standardTokenType: StandardTokenType.Comment }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 2, standardTokenType: StandardTokenType.Comment },
          { startIndex: 3, standardTokenType: StandardTokenType.Comment },
          { startIndex: 11, standardTokenType: StandardTokenType.Comment },
          { startIndex: 12, standardTokenType: StandardTokenType.Other },
          { startIndex: 13, standardTokenType: StandardTokenType.Other }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 2, standardTokenType: StandardTokenType.Other },
          { startIndex: 3, standardTokenType: StandardTokenType.Other },
          { startIndex: 4, standardTokenType: StandardTokenType.Other }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 1, standardTokenType: StandardTokenType.Comment },
          { startIndex: 3, standardTokenType: StandardTokenType.Other }
        ]
      ];
      disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(text, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(1, 1, 4, 4));
      assert.strictEqual(model.getValue(), text);
    });
  });
  test.skip("issue #86301: preserve cursor at inserted indentation level", () => {
    const model = createTextModel([
      "() => {",
      "",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(2, 1, 2, 1));
      const text = [
        "() => {",
        "",
        "}",
        ""
      ].join("\n");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(text, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(2, 1, 5, 1));
      assert.strictEqual(model.getValue(), [
        "() => {",
        "    () => {",
        "    ",
        // <- should also be indented
        "    }",
        "    ",
        // <- cursor should be at the end of the indentation
        "}"
      ].join("\n"));
      const selection = viewModel.getSelection();
      assert.deepStrictEqual(selection, new Selection(5, 5, 5, 5));
    });
  });
  test.skip("issue #85781: indent line with extra white space", () => {
    const model = createTextModel([
      "() => {",
      '    console.log("a");',
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      const text = [
        "() => {",
        '    console.log("b")',
        "}",
        " "
      ].join("\n");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(text, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(2, 5, 5, 6));
      assert.strictEqual(model.getValue(), [
        "() => {",
        "    () => {",
        '        console.log("b")',
        "    }",
        '    console.log("a");',
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #29589: incorrect indentation of closing brace on paste", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      const text = [
        "function makeSub(a,b) {",
        "subsent = sent.substring(a,b);",
        "return subsent;",
        "}"
      ].join("\n");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(text, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(1, 1, 4, 2));
      assert.strictEqual(model.getValue(), [
        "function makeSub(a,b) {",
        "subsent = sent.substring(a,b);",
        "return subsent;",
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #201420: incorrect indentation when first line is comment", () => {
    const model = createTextModel([
      "function bar() {",
      "",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const tokens = [
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Other },
          { startIndex: 8, standardTokenType: StandardTokenType.Other },
          { startIndex: 9, standardTokenType: StandardTokenType.Other },
          { startIndex: 12, standardTokenType: StandardTokenType.Other },
          { startIndex: 13, standardTokenType: StandardTokenType.Other },
          { startIndex: 14, standardTokenType: StandardTokenType.Other },
          { startIndex: 15, standardTokenType: StandardTokenType.Other },
          { startIndex: 16, standardTokenType: StandardTokenType.Other }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Comment },
          { startIndex: 2, standardTokenType: StandardTokenType.Comment },
          { startIndex: 3, standardTokenType: StandardTokenType.Comment },
          { startIndex: 10, standardTokenType: StandardTokenType.Comment }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Other },
          { startIndex: 5, standardTokenType: StandardTokenType.Other },
          { startIndex: 6, standardTokenType: StandardTokenType.Other },
          { startIndex: 9, standardTokenType: StandardTokenType.Other },
          { startIndex: 10, standardTokenType: StandardTokenType.Other },
          { startIndex: 11, standardTokenType: StandardTokenType.Other },
          { startIndex: 12, standardTokenType: StandardTokenType.Other },
          { startIndex: 14, standardTokenType: StandardTokenType.Other }
        ],
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Other },
          { startIndex: 1, standardTokenType: StandardTokenType.Other }
        ]
      ];
      disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
      editor.setSelection(new Selection(2, 1, 2, 1));
      const text = [
        "// comment",
        "const foo = 42"
      ].join("\n");
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(text, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(2, 1, 3, 15));
      assert.strictEqual(model.getValue(), [
        "function bar() {",
        "    // comment",
        "    const foo = 42",
        "}"
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Type - TypeScript/JavaScript", () => {
  const languageId = "ts-test" /* TypeScript */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #208215: indent after arrow function", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      viewModel.type("const add1 = (n) =>");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const add1 = (n) =>",
        "    "
      ].join("\n"));
    });
  });
  test("issue #208215: indent after arrow function 2", () => {
    const model = createTextModel([
      "const array = [1, 2, 3, 4, 5];",
      "array.map(",
      "    v =>"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 9, 3, 9));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const array = [1, 2, 3, 4, 5];",
        "array.map(",
        "    v =>",
        "        "
      ].join("\n"));
    });
  });
  test("issue #116843: indent after arrow function", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      viewModel.type([
        "const add1 = (n) =>",
        "    n + 1;"
      ].join("\n"));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const add1 = (n) =>",
        "    n + 1;",
        ""
      ].join("\n"));
    });
  });
  test("issue #29755: do not add indentation on enter if indentation is already valid", () => {
    const model = createTextModel([
      "function f() {",
      "    const one = 1;",
      "    const two = 2;",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 1, 3, 1));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "function f() {",
        "    const one = 1;",
        "",
        "    const two = 2;",
        "}"
      ].join("\n"));
    });
  });
  test("issue #36090", () => {
    const model = createTextModel([
      "class ItemCtrl {",
      "    getPropertiesByItemId(id) {",
      "        return this.fetchItem(id)",
      "            .then(item => {",
      "                return this.getPropertiesOfItem(item);",
      "            });",
      "    }",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "advanced", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(7, 6, 7, 6));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(
        model.getValue(),
        [
          "class ItemCtrl {",
          "    getPropertiesByItemId(id) {",
          "        return this.fetchItem(id)",
          "            .then(item => {",
          "                return this.getPropertiesOfItem(item);",
          "            });",
          "    }",
          "    ",
          "}"
        ].join("\n")
      );
      assert.deepStrictEqual(editor.getSelection(), new Selection(8, 5, 8, 5));
    });
  });
  test("issue #115304: indent block comment onEnter", () => {
    const model = createTextModel([
      "/** */",
      "function f() {}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "advanced", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 4, 1, 4));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(
        model.getValue(),
        [
          "/**",
          " * ",
          " */",
          "function f() {}"
        ].join("\n")
      );
      assert.deepStrictEqual(editor.getSelection(), new Selection(2, 4, 2, 4));
    });
  });
  test("issue #43244: indent when lambda arrow function is detected, outdent when end is reached", () => {
    const model = createTextModel([
      "const array = [1, 2, 3, 4, 5];",
      "array.map(_)"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 12, 2, 12));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const array = [1, 2, 3, 4, 5];",
        "array.map(_",
        "    ",
        ")"
      ].join("\n"));
    });
  });
  test("issue #43244: incorrect indentation after if/for/while without braces", () => {
    const model = createTextModel([
      "function f() {",
      "    if (condition)",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 19, 2, 19));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "function f() {",
        "    if (condition)",
        "        ",
        "}"
      ].join("\n"));
      viewModel.type("return;");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "function f() {",
        "    if (condition)",
        "        return;",
        "    ",
        "}"
      ].join("\n"));
    });
  });
  test("issue #208232: incorrect indentation inside of comments", () => {
    const model = createTextModel([
      "/**",
      "indentation done for {",
      "*/"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const tokens = [
        [{ startIndex: 0, standardTokenType: StandardTokenType.Comment }],
        [{ startIndex: 0, standardTokenType: StandardTokenType.Comment }],
        [{ startIndex: 0, standardTokenType: StandardTokenType.Comment }]
      ];
      disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
      editor.setSelection(new Selection(2, 23, 2, 23));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "/**",
        "indentation done for {",
        "",
        "*/"
      ].join("\n"));
    });
  });
  test("issue #209802: allman style braces in JavaScript", () => {
    const model = createTextModel([
      "if (/*condition*/)"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 19, 1, 19));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "if (/*condition*/)",
        "    "
      ].join("\n"));
      viewModel.type("{", "keyboard");
      assert.strictEqual(model.getValue(), [
        "if (/*condition*/)",
        "{}"
      ].join("\n"));
      editor.setSelection(new Selection(2, 2, 2, 2));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "if (/*condition*/)",
        "{",
        "    ",
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #43244: indent after equal sign is detected", () => {
    const model = createTextModel([
      "const array ="
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 14, 1, 14));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const array =",
        "    "
      ].join("\n"));
    });
  });
  test.skip("issue #43244: indent after dot detected after object/array signifying a method call", () => {
    const model = createTextModel([
      "const array = [1, 2, 3];",
      "array."
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 7, 2, 7));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const array = [1, 2, 3];",
        "array.",
        "    "
      ].join("\n"));
    });
  });
  test.skip("issue #43244: indent after dot detected on a subsequent line after object/array signifying a method call", () => {
    const model = createTextModel([
      "const array = [1, 2, 3]"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 7, 2, 7));
      viewModel.type("\n", "keyboard");
      viewModel.type(".");
      assert.strictEqual(model.getValue(), [
        "const array = [1, 2, 3]",
        "    ."
      ].join("\n"));
    });
  });
  test.skip("issue #43244: keep indentation when methods called on object/array", () => {
    const model = createTextModel([
      "const array = [1, 2, 3]",
      "    .filter(() => true)"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 24, 2, 24));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const array = [1, 2, 3]",
        "    .filter(() => true)",
        "    "
      ].join("\n"));
    });
  });
  test.skip("issue #43244: keep indentation when chained methods called on object/array", () => {
    const model = createTextModel([
      "const array = [1, 2, 3]",
      "    .filter(() => true)",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 5, 3, 5));
      viewModel.type(".");
      assert.strictEqual(model.getValue(), [
        "const array = [1, 2, 3]",
        "    .filter(() => true)",
        "    ."
        // here we don't want to increase the indentation because we have chained methods
      ].join("\n"));
    });
  });
  test.skip("issue #43244: outdent when a semi-color is detected indicating the end of the assignment", () => {
    const model = createTextModel([
      "const array = [1, 2, 3]",
      "    .filter(() => true);"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 25, 2, 25));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "const array = [1, 2, 3]",
        "    .filter(() => true);",
        ""
      ].join("\n"));
    });
  });
  test.skip("issue #40115: keep indentation when added", () => {
    const model = createTextModel("function foo() {}", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 17, 1, 17));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "function foo() {",
        "    ",
        "}"
      ].join("\n"));
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "function foo() {",
        "    ",
        "    ",
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #193875: incorrect indentation on enter", () => {
    const model = createTextModel([
      "{",
      "    for(;;)",
      "    for(;;) {}",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 14, 3, 14));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "{",
        "    for(;;)",
        "    for(;;) {",
        "        ",
        "    }",
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #67678: indent on typing curly brace", () => {
    const model = createTextModel([
      "if (true) {",
      'console.log("a")',
      'console.log("b")',
      ""
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 1, 4, 1));
      viewModel.type("}", "keyboard");
      assert.strictEqual(model.getValue(), [
        "if (true) {",
        '    console.log("a")',
        '    console.log("b")',
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #46401: outdent when encountering bracket on line - allman style indentation", () => {
    const model = createTextModel([
      "if (true)",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("{}", "keyboard");
      assert.strictEqual(model.getValue(), [
        "if (true)",
        "{}"
      ].join("\n"));
      editor.setSelection(new Selection(2, 2, 2, 2));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "if (true)",
        "{",
        "    ",
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #125261: typing closing brace does not keep the current indentation", () => {
    const model = createTextModel([
      "foo {",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "keep", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("}", "keyboard");
      assert.strictEqual(model.getValue(), [
        "foo {",
        "}"
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Type - Ruby", () => {
  const languageId = "ruby-test" /* Ruby */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #198350: in or when incorrectly match non keywords for Ruby", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      viewModel.type("def foo\n        i");
      viewModel.type("n", "keyboard");
      assert.strictEqual(model.getValue(), "def foo\n        in");
      viewModel.type(" ", "keyboard");
      assert.strictEqual(model.getValue(), "def foo\nin ");
      viewModel.model.setValue("");
      viewModel.type("  # in");
      assert.strictEqual(model.getValue(), "  # in");
      viewModel.type(" ", "keyboard");
      assert.strictEqual(model.getValue(), "  # in ");
    });
  });
  test.skip("issue #199846: in or when incorrectly match non keywords for Ruby", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      viewModel.type(`method('#foo') do`);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        `method('#foo') do`,
        "    "
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Type - PHP", () => {
  const languageId = "php-test" /* PHP */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("issue #199050: should not indent after { detected in a string", () => {
    const model = createTextModel(`preg_replace('{');`, languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      const tokens = [
        [
          { startIndex: 0, standardTokenType: StandardTokenType.Other },
          { startIndex: 13, standardTokenType: StandardTokenType.String },
          { startIndex: 16, standardTokenType: StandardTokenType.Other }
        ]
      ];
      disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
      editor.setSelection(new Selection(1, 54, 1, 54));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        `preg_replace('{');`,
        ""
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Paste - Go", () => {
  const languageId = "go-test" /* Go */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("temp issue because there should be at least one passing test in a suite", () => {
    assert.ok(true);
  });
  test.skip("issue #199050: should not indent after { detected in a string", () => {
    const model = createTextModel([
      "var s = `",
      "quick  brown",
      "fox",
      "`"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 1, 3, 1));
      const text = "  ";
      const autoIndentOnPasteController = editor.registerAndInstantiateContribution(AutoIndentOnPaste.ID, AutoIndentOnPaste);
      viewModel.paste(text, true, void 0, "keyboard");
      autoIndentOnPasteController.trigger(new Range(3, 1, 3, 3));
      assert.strictEqual(model.getValue(), [
        "var s = `",
        "quick  brown",
        "  fox",
        "`"
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Type - CPP", () => {
  const languageId = "cpp-test" /* CPP */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("temp issue because there should be at least one passing test in a suite", () => {
    assert.ok(true);
  });
  test.skip("issue #178334: incorrect outdent of } when signature spans multiple lines", () => {
    const model = createTextModel([
      "int WINAPI WinMain(bool instance,",
      "    int nshowcmd) {}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 20, 2, 20));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "int WINAPI WinMain(bool instance,",
        "    int nshowcmd) {",
        "    ",
        "}"
      ].join("\n"));
    });
  });
  test.skip("issue #118929: incorrect indent when // follows curly brace", () => {
    const model = createTextModel([
      "if (true) { // jaja",
      "}"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 20, 1, 20));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "if (true) { // jaja",
        "    ",
        "}"
      ].join("\n"));
    });
  });
  test.skip('issue #111265: auto indentation set to "none" still changes the indentation', () => {
    const model = createTextModel([
      "int func() {",
      "		"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "none", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 3, 2, 3));
      viewModel.type("}", "keyboard");
      assert.strictEqual(model.getValue(), [
        "int func() {",
        "		}"
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Type - HTML", () => {
  const languageId = "html-test" /* HTML */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("temp issue because there should be at least one passing test in a suite", () => {
    assert.ok(true);
  });
  test.skip("issue #61510: incorrect indentation after // in html file", () => {
    const model = createTextModel([
      "<pre>",
      "  foo //I press <Enter> at the end of this line",
      "</pre>"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 48, 2, 48));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "<pre>",
        "  foo //I press <Enter> at the end of this line",
        "  ",
        "</pre>"
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Type - Visual Basic", () => {
  const languageId = "vb-test" /* VB */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("temp issue because there should be at least one passing test in a suite", () => {
    assert.ok(true);
  });
  test("issue #118932: no indentation in visual basic files", () => {
    const model = createTextModel([
      "If True Then",
      "    Some code",
      "    End I"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel, instantiationService) => {
      editor.setSelection(new Selection(3, 10, 3, 10));
      viewModel.type("f", "keyboard");
      assert.strictEqual(model.getValue(), [
        "If True Then",
        "    Some code",
        "End If"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after Module declaration", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      viewModel.type("Module Test");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    "
      ].join("\n"));
    });
  });
  test("issue #118932: indent after Sub declaration", () => {
    const model = createTextModel([
      "Module Test",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("Sub Main()");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Sub Main()",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on End Sub", () => {
    const model = createTextModel([
      "Module Test",
      "    Sub Main()",
      '        Console.WriteLine("Hello")',
      "        End Su"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 15, 4, 15));
      viewModel.type("b", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Sub Main()",
        '        Console.WriteLine("Hello")',
        "    End Sub"
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on End Module", () => {
    const model = createTextModel([
      "Module Test",
      "    Private x As Integer",
      "    End Modul"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 14, 3, 14));
      viewModel.type("e", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Private x As Integer",
        "End Module"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after Function declaration", () => {
    const model = createTextModel([
      "Module Test",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("Function Add(a As Integer, b As Integer) As Integer");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Function Add(a As Integer, b As Integer) As Integer",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on End Function", () => {
    const model = createTextModel([
      "Module Test",
      "    Function Add(a, b)",
      "        Return a + b",
      "        End Functio"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 20, 4, 20));
      viewModel.type("n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Function Add(a, b)",
        "        Return a + b",
        "    End Function"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after If Then", () => {
    const model = createTextModel([
      "Sub Test()",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("If x > 0 Then");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    If x > 0 Then",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: indent after ElseIf Then", () => {
    const model = createTextModel([
      "Sub Test()",
      "    If x > 0 Then",
      "        DoSomething()",
      "    ElseIf x < 0 Then"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 22, 4, 22));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    If x > 0 Then",
        "        DoSomething()",
        "    ElseIf x < 0 Then",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent and indent on Else", () => {
    const model = createTextModel([
      "Sub Test()",
      "    If x > 0 Then",
      "        DoSomething()",
      "        Els"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 12, 4, 12));
      viewModel.type("e", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    If x > 0 Then",
        "        DoSomething()",
        "    Else"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after While", () => {
    const model = createTextModel([
      "Sub Test()",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("While x > 0");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    While x > 0",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on End While", () => {
    const model = createTextModel([
      "Sub Test()",
      "    While x > 0",
      "        x = x - 1",
      "        End Whil"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 17, 4, 17));
      viewModel.type("e", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    While x > 0",
        "        x = x - 1",
        "    End While"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after For", () => {
    const model = createTextModel([
      "Sub Test()",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("For i = 1 To 10");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    For i = 1 To 10",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on Next", () => {
    const model = createTextModel([
      "Sub Test()",
      "    For i = 1 To 10",
      "        DoSomething(i)",
      "        Nex"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 12, 4, 12));
      viewModel.type("t", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    For i = 1 To 10",
        "        DoSomething(i)",
        "    Next"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after Do", () => {
    const model = createTextModel([
      "Sub Test()",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("Do");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Do",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on Loop", () => {
    const model = createTextModel([
      "Sub Test()",
      "    Do",
      "        x = x + 1",
      "        Loo"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 12, 4, 12));
      viewModel.type("p", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Do",
        "        x = x + 1",
        "    Loop"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after Select Case", () => {
    const model = createTextModel([
      "Sub Test()",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("Select Case x");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Select Case x",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on End Select", () => {
    const model = createTextModel([
      "Sub Test()",
      "    Select Case x",
      "        End Selec"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 18, 3, 18));
      viewModel.type("t", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Select Case x",
        "    End Select"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after Try", () => {
    const model = createTextModel([
      "Sub Test()",
      "    "
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 5, 2, 5));
      viewModel.type("Try");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Try",
        "        "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent and indent on Catch", () => {
    const model = createTextModel([
      "Sub Test()",
      "    Try",
      "        DoSomething()",
      "        Catc"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(4, 13, 4, 13));
      viewModel.type("h", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Try",
        "        DoSomething()",
        "    Catch"
      ].join("\n"));
    });
  });
  test("issue #118932: dedent and indent on Finally", () => {
    const model = createTextModel([
      "Sub Test()",
      "    Try",
      "        DoSomething()",
      "    Catch",
      "        HandleError()",
      "        Finall"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(6, 15, 6, 15));
      viewModel.type("y", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Try",
        "        DoSomething()",
        "    Catch",
        "        HandleError()",
        "    Finally"
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on End Try", () => {
    const model = createTextModel([
      "Sub Test()",
      "    Try",
      "        DoSomething()",
      "    Catch",
      "        HandleError()",
      "    Finally",
      "        Cleanup()",
      "        End Tr"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(8, 15, 8, 15));
      viewModel.type("y", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Sub Test()",
        "    Try",
        "        DoSomething()",
        "    Catch",
        "        HandleError()",
        "    Finally",
        "        Cleanup()",
        "    End Try"
      ].join("\n"));
    });
  });
  test("issue #118932: indent after Class", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      viewModel.type("Class MyClass");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Class MyClass",
        "    "
      ].join("\n"));
    });
  });
  test("issue #118932: dedent on End Class", () => {
    const model = createTextModel([
      "Class MyClass",
      "    Private x As Integer",
      "    End Clas"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(3, 14, 3, 14));
      viewModel.type("s", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Class MyClass",
        "    Private x As Integer",
        "End Class"
      ].join("\n"));
    });
  });
  test("issue #118932: full program indentation flow", () => {
    const model = createTextModel("", languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      viewModel.type("Module Test");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    "
      ].join("\n"), "After Module Test");
      viewModel.type("Sub Main()");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Sub Main()",
        "        "
      ].join("\n"), "After Sub Main()");
      viewModel.type('Console.WriteLine("Hello, World!")');
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Sub Main()",
        '        Console.WriteLine("Hello, World!")',
        "        "
      ].join("\n"), "After Console.WriteLine");
      viewModel.type("End Su");
      viewModel.type("b", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Sub Main()",
        '        Console.WriteLine("Hello, World!")',
        "    End Sub"
      ].join("\n"), "After End Sub");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "Module Test",
        "    Sub Main()",
        '        Console.WriteLine("Hello, World!")',
        "    End Sub",
        "    "
      ].join("\n"), "After Enter after End Sub");
    });
  });
});
suite("Auto Indent On Type - Latex", () => {
  const languageId = "latex-test" /* Latex */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("temp issue because there should be at least one passing test in a suite", () => {
    assert.ok(true);
  });
  test.skip("issue #178075: no auto closing pair when indentation done", () => {
    const model = createTextModel([
      "\\begin{theorem}",
      "    \\end"
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(2, 9, 2, 9));
      viewModel.type("{", "keyboard");
      assert.strictEqual(model.getValue(), [
        "\\begin{theorem}",
        "\\end{}"
      ].join("\n"));
    });
  });
});
suite("Auto Indent On Type - Lua", () => {
  const languageId = "lua-test" /* Lua */;
  let disposables;
  let serviceCollection;
  setup(() => {
    disposables = new DisposableStore();
    const languageService = new LanguageService();
    const languageConfigurationService = new TestLanguageConfigurationService();
    disposables.add(languageService);
    disposables.add(languageConfigurationService);
    disposables.add(registerLanguage(languageService, languageId));
    disposables.add(registerLanguageConfiguration(languageConfigurationService, languageId));
    serviceCollection = new ServiceCollection(
      [ILanguageService, languageService],
      [ILanguageConfigurationService, languageConfigurationService]
    );
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("temp issue because there should be at least one passing test in a suite", () => {
    assert.ok(true);
  });
  test.skip("issue #178075: no auto closing pair when indentation done", () => {
    const model = createTextModel([
      'print("asdf function asdf")'
    ].join("\n"), languageId, {});
    disposables.add(model);
    withTestCodeEditor(model, { autoIndent: "full", serviceCollection }, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 28, 1, 28));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        'print("asdf function asdf")',
        ""
      ].join("\n"));
    });
  });
});
export {
  Language,
  registerLanguage,
  registerLanguageConfiguration,
  registerTokenizationSupport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGluZGVudGF0aW9uXFx0ZXN0XFxicm93c2VyXFxpbmRlbnRhdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IE1ldGFkYXRhQ29uc3RzLCBTdGFuZGFyZFRva2VuVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQsIElTdGF0ZSwgSVRva2VuaXphdGlvblN1cHBvcnQsIFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBBdXRvSW5kZW50T25QYXN0ZSwgSW5kZW50YXRpb25Ub1NwYWNlc0NvbW1hbmQsIEluZGVudGF0aW9uVG9UYWJzQ29tbWFuZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaW5kZW50YXRpb24uanMnO1xuaW1wb3J0IHsgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IHRlc3RDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb21tYW5kLmpzJztcbmltcG9ydCB7IGdvSW5kZW50YXRpb25SdWxlcywgaHRtbEluZGVudGF0aW9uUnVsZXMsIGphdmFzY3JpcHRJbmRlbnRhdGlvblJ1bGVzLCBsYXRleEluZGVudGF0aW9uUnVsZXMsIGx1YUluZGVudGF0aW9uUnVsZXMsIHBocEluZGVudGF0aW9uUnVsZXMsIHJ1YnlJbmRlbnRhdGlvblJ1bGVzLCB2YkluZGVudGF0aW9uUnVsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9tb2Rlcy9zdXBwb3J0cy9pbmRlbnRhdGlvblJ1bGVzLmpzJztcbmltcG9ydCB7IGNwcE9uRW50ZXJSdWxlcywgaHRtbE9uRW50ZXJSdWxlcywgamF2YXNjcmlwdE9uRW50ZXJSdWxlcywgcGhwT25FbnRlclJ1bGVzLCB2Yk9uRW50ZXJSdWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL29uRW50ZXJSdWxlcy5qcyc7XG5pbXBvcnQgeyBUeXBlT3BlcmF0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jdXJzb3IvY3Vyc29yVHlwZU9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgY3BwQnJhY2tldFJ1bGVzLCBnb0JyYWNrZXRSdWxlcywgaHRtbEJyYWNrZXRSdWxlcywgbGF0ZXhCcmFja2V0UnVsZXMsIGx1YUJyYWNrZXRSdWxlcywgcGhwQnJhY2tldFJ1bGVzLCBydWJ5QnJhY2tldFJ1bGVzLCB0eXBlc2NyaXB0QnJhY2tldFJ1bGVzLCB2YkJyYWNrZXRSdWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL2JyYWNrZXRSdWxlcy5qcyc7XG5pbXBvcnQgeyBqYXZhc2NyaXB0QXV0b0Nsb3NpbmdQYWlyc1J1bGVzLCBsYXRleEF1dG9DbG9zaW5nUGFpcnNSdWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL21vZGVzL3N1cHBvcnRzL2F1dG9DbG9zaW5nUGFpcnNSdWxlcy5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbmV4cG9ydCBlbnVtIExhbmd1YWdlIHtcblx0VHlwZVNjcmlwdCA9ICd0cy10ZXN0Jyxcblx0UnVieSA9ICdydWJ5LXRlc3QnLFxuXHRQSFAgPSAncGhwLXRlc3QnLFxuXHRHbyA9ICdnby10ZXN0Jyxcblx0Q1BQID0gJ2NwcC10ZXN0Jyxcblx0SFRNTCA9ICdodG1sLXRlc3QnLFxuXHRWQiA9ICd2Yi10ZXN0Jyxcblx0TGF0ZXggPSAnbGF0ZXgtdGVzdCcsXG5cdEx1YSA9ICdsdWEtdGVzdCdcbn1cblxuZnVuY3Rpb24gdGVzdEluZGVudGF0aW9uVG9TcGFjZXNDb21tYW5kKGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIHRhYlNpemU6IG51bWJlciwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblx0dGVzdENvbW1hbmQobGluZXMsIG51bGwsIHNlbGVjdGlvbiwgKGFjY2Vzc29yLCBzZWwpID0+IG5ldyBJbmRlbnRhdGlvblRvU3BhY2VzQ29tbWFuZChzZWwsIHRhYlNpemUpLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbik7XG59XG5cbmZ1bmN0aW9uIHRlc3RJbmRlbnRhdGlvblRvVGFic0NvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgdGFiU2l6ZTogbnVtYmVyLCBleHBlY3RlZExpbmVzOiBzdHJpbmdbXSwgZXhwZWN0ZWRTZWxlY3Rpb246IFNlbGVjdGlvbik6IHZvaWQge1xuXHR0ZXN0Q29tbWFuZChsaW5lcywgbnVsbCwgc2VsZWN0aW9uLCAoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IEluZGVudGF0aW9uVG9UYWJzQ29tbWFuZChzZWwsIHRhYlNpemUpLCBleHBlY3RlZExpbmVzLCBleHBlY3RlZFNlbGVjdGlvbik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3Rlckxhbmd1YWdlKGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSwgbGFuZ3VhZ2U6IExhbmd1YWdlKTogSURpc3Bvc2FibGUge1xuXHRyZXR1cm4gbGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2UgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3Rlckxhbmd1YWdlQ29uZmlndXJhdGlvbihsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2U6IExhbmd1YWdlKTogSURpc3Bvc2FibGUge1xuXHRzd2l0Y2ggKGxhbmd1YWdlKSB7XG5cdFx0Y2FzZSBMYW5ndWFnZS5UeXBlU2NyaXB0OlxuXHRcdFx0cmV0dXJuIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2UsIHtcblx0XHRcdFx0YnJhY2tldHM6IHR5cGVzY3JpcHRCcmFja2V0UnVsZXMsXG5cdFx0XHRcdGNvbW1lbnRzOiB7XG5cdFx0XHRcdFx0bGluZUNvbW1lbnQ6ICcvLycsXG5cdFx0XHRcdFx0YmxvY2tDb21tZW50OiBbJy8qJywgJyovJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogamF2YXNjcmlwdEF1dG9DbG9zaW5nUGFpcnNSdWxlcyxcblx0XHRcdFx0aW5kZW50YXRpb25SdWxlczogamF2YXNjcmlwdEluZGVudGF0aW9uUnVsZXMsXG5cdFx0XHRcdG9uRW50ZXJSdWxlczogamF2YXNjcmlwdE9uRW50ZXJSdWxlc1xuXHRcdFx0fSk7XG5cdFx0Y2FzZSBMYW5ndWFnZS5SdWJ5OlxuXHRcdFx0cmV0dXJuIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2UsIHtcblx0XHRcdFx0YnJhY2tldHM6IHJ1YnlCcmFja2V0UnVsZXMsXG5cdFx0XHRcdGluZGVudGF0aW9uUnVsZXM6IHJ1YnlJbmRlbnRhdGlvblJ1bGVzLFxuXHRcdFx0fSk7XG5cdFx0Y2FzZSBMYW5ndWFnZS5QSFA6XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZSwge1xuXHRcdFx0XHRicmFja2V0czogcGhwQnJhY2tldFJ1bGVzLFxuXHRcdFx0XHRpbmRlbnRhdGlvblJ1bGVzOiBwaHBJbmRlbnRhdGlvblJ1bGVzLFxuXHRcdFx0XHRvbkVudGVyUnVsZXM6IHBocE9uRW50ZXJSdWxlc1xuXHRcdFx0fSk7XG5cdFx0Y2FzZSBMYW5ndWFnZS5Hbzpcblx0XHRcdHJldHVybiBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlLCB7XG5cdFx0XHRcdGJyYWNrZXRzOiBnb0JyYWNrZXRSdWxlcyxcblx0XHRcdFx0aW5kZW50YXRpb25SdWxlczogZ29JbmRlbnRhdGlvblJ1bGVzXG5cdFx0XHR9KTtcblx0XHRjYXNlIExhbmd1YWdlLkNQUDpcblx0XHRcdHJldHVybiBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlLCB7XG5cdFx0XHRcdGJyYWNrZXRzOiBjcHBCcmFja2V0UnVsZXMsXG5cdFx0XHRcdG9uRW50ZXJSdWxlczogY3BwT25FbnRlclJ1bGVzXG5cdFx0XHR9KTtcblx0XHRjYXNlIExhbmd1YWdlLkhUTUw6XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZSwge1xuXHRcdFx0XHRicmFja2V0czogaHRtbEJyYWNrZXRSdWxlcyxcblx0XHRcdFx0aW5kZW50YXRpb25SdWxlczogaHRtbEluZGVudGF0aW9uUnVsZXMsXG5cdFx0XHRcdG9uRW50ZXJSdWxlczogaHRtbE9uRW50ZXJSdWxlc1xuXHRcdFx0fSk7XG5cdFx0Y2FzZSBMYW5ndWFnZS5WQjpcblx0XHRcdHJldHVybiBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlLCB7XG5cdFx0XHRcdGJyYWNrZXRzOiB2YkJyYWNrZXRSdWxlcyxcblx0XHRcdFx0aW5kZW50YXRpb25SdWxlczogdmJJbmRlbnRhdGlvblJ1bGVzLFxuXHRcdFx0XHRvbkVudGVyUnVsZXM6IHZiT25FbnRlclJ1bGVzLFxuXHRcdFx0fSk7XG5cdFx0Y2FzZSBMYW5ndWFnZS5MYXRleDpcblx0XHRcdHJldHVybiBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlLCB7XG5cdFx0XHRcdGJyYWNrZXRzOiBsYXRleEJyYWNrZXRSdWxlcyxcblx0XHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogbGF0ZXhBdXRvQ2xvc2luZ1BhaXJzUnVsZXMsXG5cdFx0XHRcdGluZGVudGF0aW9uUnVsZXM6IGxhdGV4SW5kZW50YXRpb25SdWxlc1xuXHRcdFx0fSk7XG5cdFx0Y2FzZSBMYW5ndWFnZS5MdWE6XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZSwge1xuXHRcdFx0XHRicmFja2V0czogbHVhQnJhY2tldFJ1bGVzLFxuXHRcdFx0XHRpbmRlbnRhdGlvblJ1bGVzOiBsdWFJbmRlbnRhdGlvblJ1bGVzXG5cdFx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0YW5kYXJkVG9rZW5UeXBlRGF0YSB7XG5cdHN0YXJ0SW5kZXg6IG51bWJlcjtcblx0c3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJUb2tlbml6YXRpb25TdXBwb3J0KGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIHRva2VuczogU3RhbmRhcmRUb2tlblR5cGVEYXRhW11bXSwgbGFuZ3VhZ2VJZDogTGFuZ3VhZ2UpOiBJRGlzcG9zYWJsZSB7XG5cdGxldCBsaW5lSW5kZXggPSAwO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKTogRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbnNPbkxpbmUgPSB0b2tlbnNbbGluZUluZGV4KytdO1xuXHRcdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoMiAqIHRva2Vuc09uTGluZS5sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnNPbkxpbmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0cmVzdWx0WzIgKiBpXSA9IHRva2Vuc09uTGluZVtpXS5zdGFydEluZGV4O1xuXHRcdFx0XHRyZXN1bHRbMiAqIGkgKyAxXSA9XG5cdFx0XHRcdFx0KFxuXHRcdFx0XHRcdFx0KGVuY29kZWRMYW5ndWFnZUlkIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0XHRcdFx0fCAodG9rZW5zT25MaW5lW2ldLnN0YW5kYXJkVG9rZW5UeXBlIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQocmVzdWx0LCBbXSwgc3RhdGUpO1xuXHRcdH1cblx0fTtcblx0cmV0dXJuIFRva2VuaXphdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHRva2VuaXphdGlvblN1cHBvcnQpO1xufVxuXG5zdWl0ZSgnQ2hhbmdlIEluZGVudGF0aW9uIHRvIFNwYWNlcyAtIFR5cGVTY3JpcHQvSmF2YXNjcmlwdCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaW5nbGUgdGFicyBvbmx5IGF0IHN0YXJ0IG9mIGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdEluZGVudGF0aW9uVG9TcGFjZXNDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdcXHRmb3VydGggbGluZScsXG5cdFx0XHRcdCdcXHRmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDMpLFxuXHRcdFx0NCxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnICAgIGZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0JyAgICBmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDMpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgdGFicyBhdCBzdGFydCBvZiBsaW5lJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RJbmRlbnRhdGlvblRvU3BhY2VzQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdGZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdFxcdFxcdCB0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSksXG5cdFx0XHQzLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICAgZmlyc3QnLFxuXHRcdFx0XHQnICAgc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnICAgICAgICAgIHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA5LCAxLCA5KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIHRhYnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdEluZGVudGF0aW9uVG9TcGFjZXNDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQnLFxuXHRcdFx0XHQnXFx0c2Vjb25kICBcXHQgbGluZSBcXHQnLFxuXHRcdFx0XHQnXFx0XFx0XFx0IHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnIFxcdGZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSksXG5cdFx0XHQyLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgIGZpcnN0XFx0Jyxcblx0XHRcdFx0JyAgc2Vjb25kICBcXHQgbGluZSBcXHQnLFxuXHRcdFx0XHQnICAgICAgIHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnICAgZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IGxpbmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RJbmRlbnRhdGlvblRvU3BhY2VzQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdFxcdCcsXG5cdFx0XHRcdCdcXHQnLFxuXHRcdFx0XHQnXFx0XFx0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksXG5cdFx0XHQyLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICAgJyxcblx0XHRcdFx0JyAgJyxcblx0XHRcdFx0JyAgICAnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDaGFuZ2UgSW5kZW50YXRpb24gdG8gVGFicyAtICBUeXBlU2NyaXB0L0phdmFzY3JpcHQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3BhY2VzIG9ubHkgYXQgc3RhcnQgb2YgbGluZScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0SW5kZW50YXRpb25Ub1RhYnNDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgIGZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0JyAgICB0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMywgMiwgMyksXG5cdFx0XHQ0LFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0Zmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnXFx0dGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDMpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlwbGUgc3BhY2VzIGF0IHN0YXJ0IG9mIGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdEluZGVudGF0aW9uVG9UYWJzQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0JyAgIHNlY29uZCBsaW5lJyxcblx0XHRcdFx0JyAgICAgICAgICB0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0JyAgICAgZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSxcblx0XHRcdDMsXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdcXHRcXHRcXHQgdGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdcXHQgIGZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBzcGFjZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdEluZGVudGF0aW9uVG9UYWJzQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JyAgICAgIGZpcnN0ICAgJyxcblx0XHRcdFx0JyAgc2Vjb25kICAgICBsaW5lIFxcdCcsXG5cdFx0XHRcdCcgICAgICAgdGhpcmQgbGluZScsXG5cdFx0XHRcdCcgICBmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDgpLFxuXHRcdFx0Mixcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdFxcdGZpcnN0ICAgJyxcblx0XHRcdFx0J1xcdHNlY29uZCAgICAgbGluZSBcXHQnLFxuXHRcdFx0XHQnXFx0XFx0XFx0IHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnXFx0IGZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDU5OTYnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdEluZGVudGF0aW9uVG9TcGFjZXNDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0YWJjJyxcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLFxuXHRcdFx0NCxcblx0XHRcdFtcblx0XHRcdFx0JyAgICBhYmMnLFxuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNilcblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnSW5kZW50IFdpdGggVGFiIC0gVHlwZVNjcmlwdC9KYXZhU2NyaXB0JywgKCkgPT4ge1xuXG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBMYW5ndWFnZS5UeXBlU2NyaXB0O1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcnZpY2VDb2xsZWN0aW9uOiBTZXJ2aWNlQ29sbGVjdGlvbjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gbmV3IExhbmd1YWdlU2VydmljZSgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2UobGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZUlkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2VdLFxuXHRcdFx0W0lMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RlbXAgaXNzdWUgYmVjYXVzZSB0aGVyZSBzaG91bGQgYmUgYXQgbGVhc3Qgb25lIHBhc3NpbmcgdGVzdCBpbiBhIHN1aXRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayh0cnVlKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjNjMzODg6IHBlcnNlcnZlIGNvcnJlY3QgaW5kZW50YXRpb24gb24gdGFiIDEnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNjMzODhcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCcvKicsXG5cdFx0XHQnICogQ29tbWVudCcsXG5cdFx0XHQnICogLycsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMywgNSkpO1xuXHRcdFx0ZWRpdG9yLmV4ZWN1dGVDb21tYW5kcygnZWRpdG9yLmFjdGlvbi5pbmRlbnRMaW5lcycsIFR5cGVPcGVyYXRpb25zLmluZGVudCh2aWV3TW9kZWwuY3Vyc29yQ29uZmlnLCBlZGl0b3IuZ2V0TW9kZWwoKSwgZWRpdG9yLmdldFNlbGVjdGlvbnMoKSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0JyAgICAvKicsXG5cdFx0XHRcdCcgICAgICogQ29tbWVudCcsXG5cdFx0XHRcdCcgICAgICogLycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjNjMzODg6IHBlcnNlcnZlIGNvcnJlY3QgaW5kZW50YXRpb24gb24gdGFiIDInLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNjMzODhcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdzd2l0Y2ggKHNvbWV0aGluZykgeycsXG5cdFx0XHQnICBjYXNlIDE6Jyxcblx0XHRcdCcgICAgd2hhdGV2ZXIoKTsnLFxuXHRcdFx0JyAgICBicmVhazsnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDIpKTtcblx0XHRcdGVkaXRvci5leGVjdXRlQ29tbWFuZHMoJ2VkaXRvci5hY3Rpb24uaW5kZW50TGluZXMnLCBUeXBlT3BlcmF0aW9ucy5pbmRlbnQodmlld01vZGVsLmN1cnNvckNvbmZpZywgZWRpdG9yLmdldE1vZGVsKCksIGVkaXRvci5nZXRTZWxlY3Rpb25zKCkpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCcgICAgc3dpdGNoIChzb21ldGhpbmcpIHsnLFxuXHRcdFx0XHQnICAgICAgICBjYXNlIDE6Jyxcblx0XHRcdFx0JyAgICAgICAgICAgIHdoYXRldmVyKCk7Jyxcblx0XHRcdFx0JyAgICAgICAgICAgIGJyZWFrOycsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0F1dG8gSW5kZW50IE9uIFBhc3RlIC0gVHlwZVNjcmlwdC9KYXZhU2NyaXB0JywgKCkgPT4ge1xuXG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBMYW5ndWFnZS5UeXBlU2NyaXB0O1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcnZpY2VDb2xsZWN0aW9uOiBTZXJ2aWNlQ29sbGVjdGlvbjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gbmV3IExhbmd1YWdlU2VydmljZSgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2UobGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZUlkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2VdLFxuXHRcdFx0W0lMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTkyMjU6IERvIG5vdCBhZGQgZXh0cmEgbGVhZGluZyBzcGFjZSB3aGVuIHBhc3RpbmcgSlNEb2MnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJywgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCBwYXN0ZVRleHQgPSBbXG5cdFx0XHRcdCcvKionLFxuXHRcdFx0XHQnICogSlNEb2MnLFxuXHRcdFx0XHQnICovJyxcblx0XHRcdFx0J2Z1bmN0aW9uIGEoKSB7fSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAzLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDgsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAxLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMywgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogOCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiA5LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDExLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEyLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEzLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDE0LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDE1LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XVxuXHRcdFx0XTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRva2VuaXphdGlvblN1cHBvcnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRva2VucywgbGFuZ3VhZ2VJZCkpO1xuXHRcdFx0Y29uc3QgYXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oQXV0b0luZGVudE9uUGFzdGUuSUQsIEF1dG9JbmRlbnRPblBhc3RlKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZShwYXN0ZVRleHQsIHRydWUsIHVuZGVmaW5lZCwgJ2tleWJvYXJkJyk7XG5cdFx0XHRhdXRvSW5kZW50T25QYXN0ZUNvbnRyb2xsZXIudHJpZ2dlcihuZXcgUmFuZ2UoMSwgMSwgNCwgMTYpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBwYXN0ZVRleHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTY3Mjk5OiBCbGFuayBsaW5lIHJlbW92ZXMgaW5kZW50JywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJycsIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXG5cdFx0XHQvLyBubyBuZWVkIGZvciB0b2tlbml6YXRpb24gYmVjYXVzZSB0aGVyZSBhcmUgbm8gY29tbWVudHNcblx0XHRcdGNvbnN0IHBhc3RlVGV4dCA9IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdleHBvcnQgdHlwZSBJbmNsdWRlUmVmZXJlbmNlID0nLFxuXHRcdFx0XHQnXHR8IEJhc2VSZWZlcmVuY2UnLFxuXHRcdFx0XHQnXHR8IFNlbGZSZWZlcmVuY2UnLFxuXHRcdFx0XHQnXHR8IFJlbGF0aXZlUmVmZXJlbmNlOycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnZXhwb3J0IGNvbnN0IGVudW0gSW5jbHVkZVJlZmVyZW5jZUtpbmQgeycsXG5cdFx0XHRcdCdcdEJhc2UsJyxcblx0XHRcdFx0J1x0U2VsZiwnLFxuXHRcdFx0XHQnXHRSZWxhdGl2ZVJlZmVyZW5jZSwnLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKEF1dG9JbmRlbnRPblBhc3RlLklELCBBdXRvSW5kZW50T25QYXN0ZSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUocGFzdGVUZXh0LCB0cnVlLCB1bmRlZmluZWQsICdrZXlib2FyZCcpO1xuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDEsIDEsIDExLCAyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgcGFzdGVUZXh0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI5ODAzOiBkbyBub3QgaW5kZW50IHdoZW4gcGFzdGluZyB0ZXh0IHdpdGggb25seSBvbmUgbGluZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yOTgwM1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2NvbnN0IGxpbmtIYW5kbGVyID0gbmV3IENsYXNzKGEsIGIsIGMsJyxcblx0XHRcdCcgICAgZCknXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNiwgMiwgNikpO1xuXHRcdFx0Y29uc3QgdGV4dCA9ICcsIG51bGwnO1xuXHRcdFx0dmlld01vZGVsLnBhc3RlKHRleHQsIHRydWUsIHVuZGVmaW5lZCwgJ2tleWJvYXJkJyk7XG5cdFx0XHRjb25zdCBhdXRvSW5kZW50T25QYXN0ZUNvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihBdXRvSW5kZW50T25QYXN0ZS5JRCwgQXV0b0luZGVudE9uUGFzdGUpO1xuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDIsIDYsIDIsIDExKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnY29uc3QgbGlua0hhbmRsZXIgPSBuZXcgQ2xhc3MoYSwgYiwgYywnLFxuXHRcdFx0XHQnICAgIGQsIG51bGwpJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyOTc1MzogaW5jb3JyZWN0IGluZGVudGF0aW9uIGFmdGVyIGNvbW1lbnQnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjk3NTNcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdjbGFzcyBBIHsnLFxuXHRcdFx0JyAgICAvKionLFxuXHRcdFx0JyAgICAgKiB1c2VkIG9ubHkgZm9yIGRlYnVnIHB1cnBvc2VzLicsXG5cdFx0XHQnICAgICAqLycsXG5cdFx0XHQnICAgIHByaXZhdGUgX2NvZGVJbmZvOiBLZXlNYXBwaW5nW107Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig1LCAyNCwgNSwgMzQpKTtcblx0XHRcdGNvbnN0IHRleHQgPSAnSU1hY0xpbnV4S2V5TWFwcGluZyc7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUodGV4dCwgdHJ1ZSwgdW5kZWZpbmVkLCAna2V5Ym9hcmQnKTtcblx0XHRcdGNvbnN0IGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKEF1dG9JbmRlbnRPblBhc3RlLklELCBBdXRvSW5kZW50T25QYXN0ZSk7XG5cdFx0XHRhdXRvSW5kZW50T25QYXN0ZUNvbnRyb2xsZXIudHJpZ2dlcihuZXcgUmFuZ2UoNSwgMjQsIDUsIDQzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnY2xhc3MgQSB7Jyxcblx0XHRcdFx0JyAgICAvKionLFxuXHRcdFx0XHQnICAgICAqIHVzZWQgb25seSBmb3IgZGVidWcgcHVycG9zZXMuJyxcblx0XHRcdFx0JyAgICAgKi8nLFxuXHRcdFx0XHQnICAgIHByaXZhdGUgX2NvZGVJbmZvOiBJTWFjTGludXhLZXlNYXBwaW5nW107Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyOTc1MzogaW5jb3JyZWN0IGluZGVudGF0aW9uIG9mIGhlYWRlciBjb21tZW50JywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI5NzUzXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJywgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0XHQnLyotLS0tLS0tLS0tLS0tLS0tJyxcblx0XHRcdFx0JyAqICBDb3B5cmlnaHQgKGMpICcsXG5cdFx0XHRcdCcgKiAgTGljZW5zZWQgdW5kZXIgLi4uJyxcblx0XHRcdFx0JyAqLS0tLS0tLS0tLS0tLS0tLS0qLycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0dmlld01vZGVsLnBhc3RlKHRleHQsIHRydWUsIHVuZGVmaW5lZCwgJ2tleWJvYXJkJyk7XG5cdFx0XHRjb25zdCBhdXRvSW5kZW50T25QYXN0ZUNvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihBdXRvSW5kZW50T25QYXN0ZS5JRCwgQXV0b0luZGVudE9uUGFzdGUpO1xuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDEsIDEsIDQsIDIyKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgdGV4dCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMDk4NTk6IGRvIG5vdCBkbyBjaGFuZ2UgaW5kZW50YXRpb24gd2hlbiBwYXN0ZWQgaW5zaWRlIG9mIGEgc3RyaW5nJywgKCkgPT4ge1xuXG5cdFx0Ly8gaXNzdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDk4NTlcblx0XHQvLyBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwOTQxOFxuXG5cdFx0Y29uc3QgaW5pdGlhbFRleHQgPSBbXG5cdFx0XHQnY29uc3QgZm9vID0gXCJzb21lIHRleHQnLFxuXHRcdFx0JyAgICAgICAgIHdoaWNoIGlzIHN0cmFuZ2VseScsXG5cdFx0XHQnICAgIGluZGVudGVkXCInXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChpbml0aWFsVGV4dCwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMTIsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHRcdF1cblx0XHRcdF07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUb2tlbml6YXRpb25TdXBwb3J0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0b2tlbnMsIGxhbmd1YWdlSWQpKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDEwLCAyLCAxNSkpO1xuXHRcdFx0dmlld01vZGVsLnBhc3RlKCd3aGljaCcsIHRydWUsIHVuZGVmaW5lZCwgJ2tleWJvYXJkJyk7XG5cdFx0XHRjb25zdCBhdXRvSW5kZW50T25QYXN0ZUNvbnRyb2xsZXIgPSBlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihBdXRvSW5kZW50T25QYXN0ZS5JRCwgQXV0b0luZGVudE9uUGFzdGUpO1xuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDIsIDEsIDIsIDI4KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgaW5pdGlhbFRleHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBGYWlsaW5nIHRlc3RzIGZvdW5kIGluIGlzc3Vlcy4uLlxuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzE4MTA2NTogSW5jb3JyZWN0IHBhc3RlIG9mIG9iamVjdCB3aXRoaW4gY29tbWVudCcsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xODEwNjVcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcnLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHRcdCcvKionLFxuXHRcdFx0XHQnICogQHR5cGVkZWYgeycsXG5cdFx0XHRcdCcgKiB9Jyxcblx0XHRcdFx0JyAqLydcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAzLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDMsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAxMSwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEyLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEzLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDIsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMywgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiA0LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAzLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XVxuXHRcdFx0XTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRva2VuaXphdGlvblN1cHBvcnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRva2VucywgbGFuZ3VhZ2VJZCkpO1xuXHRcdFx0Y29uc3QgYXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oQXV0b0luZGVudE9uUGFzdGUuSUQsIEF1dG9JbmRlbnRPblBhc3RlKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSh0ZXh0LCB0cnVlLCB1bmRlZmluZWQsICdrZXlib2FyZCcpO1xuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDEsIDEsIDQsIDQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCB0ZXh0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjODYzMDE6IHByZXNlcnZlIGN1cnNvciBhdCBpbnNlcnRlZCBpbmRlbnRhdGlvbiBsZXZlbCcsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84NjMwMVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0JygpID0+IHsnLFxuXHRcdFx0JycsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXHRcdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdFx0JygpID0+IHsnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKEF1dG9JbmRlbnRPblBhc3RlLklELCBBdXRvSW5kZW50T25QYXN0ZSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUodGV4dCwgdHJ1ZSwgdW5kZWZpbmVkLCAna2V5Ym9hcmQnKTtcblx0XHRcdGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlci50cmlnZ2VyKG5ldyBSYW5nZSgyLCAxLCA1LCAxKSk7XG5cblx0XHRcdC8vIG5vdGVzOlxuXHRcdFx0Ly8gd2h5IGlzIGxpbmUgMyBub3QgaW5kZW50ZWQgdG8gdGhlIHNhbWUgbGV2ZWwgYXMgbGluZSAyP1xuXHRcdFx0Ly8gbG9va3MgbGlrZSB0aGUgaW5kZW50YXRpb24gaXMgaW5zZXJ0ZWQgY29ycmVjdGx5IGF0IGxpbmUgNSwgYnV0IHRoZSBjdXJzb3IgZG9lcyBub3QgYXBwZWFyIGF0IHRoZSBtYXhpbXVtIGluZGVudGF0aW9uIGxldmVsP1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0JygpID0+IHsnLFxuXHRcdFx0XHQnICAgICgpID0+IHsnLFxuXHRcdFx0XHQnICAgICcsIC8vIDwtIHNob3VsZCBhbHNvIGJlIGluZGVudGVkXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRcdCcgICAgJywgLy8gPC0gY3Vyc29yIHNob3VsZCBiZSBhdCB0aGUgZW5kIG9mIHRoZSBpbmRlbnRhdGlvblxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdmlld01vZGVsLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWxlY3Rpb24sIG5ldyBTZWxlY3Rpb24oNSwgNSwgNSwgNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ2lzc3VlICM4NTc4MTogaW5kZW50IGxpbmUgd2l0aCBleHRyYSB3aGl0ZSBzcGFjZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy84NTc4MVxuXHRcdC8vIG5vdGU6IHN0aWxsIHRvIGRldGVybWluZSB3aGV0aGVyIHRoaXMgaXMgYSBidWcgb3Igbm90XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnKCkgPT4geycsXG5cdFx0XHQnICAgIGNvbnNvbGUubG9nKFwiYVwiKTsnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblx0XHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHRcdCcoKSA9PiB7Jyxcblx0XHRcdFx0JyAgICBjb25zb2xlLmxvZyhcImJcIiknLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRcdCcgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKEF1dG9JbmRlbnRPblBhc3RlLklELCBBdXRvSW5kZW50T25QYXN0ZSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUodGV4dCwgdHJ1ZSwgdW5kZWZpbmVkLCAna2V5Ym9hcmQnKTtcblx0XHRcdC8vIHRvZG9AYWlkYXktbWFyLCBtYWtlIHN1cmUgcmFuZ2UgaXMgY29ycmVjdCwgYW5kIG1ha2UgdGVzdCB3b3JrIGFzIGluIHJlYWwgbGlmZVxuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDIsIDUsIDUsIDYpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCcoKSA9PiB7Jyxcblx0XHRcdFx0JyAgICAoKSA9PiB7Jyxcblx0XHRcdFx0JyAgICAgICAgY29uc29sZS5sb2coXCJiXCIpJyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0JyAgICBjb25zb2xlLmxvZyhcImFcIik7Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzI5NTg5OiBpbmNvcnJlY3QgaW5kZW50YXRpb24gb2YgY2xvc2luZyBicmFjZSBvbiBwYXN0ZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yOTU4OVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJycsIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblx0XHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHRcdCdmdW5jdGlvbiBtYWtlU3ViKGEsYikgeycsXG5cdFx0XHRcdCdzdWJzZW50ID0gc2VudC5zdWJzdHJpbmcoYSxiKTsnLFxuXHRcdFx0XHQncmV0dXJuIHN1YnNlbnQ7Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKEF1dG9JbmRlbnRPblBhc3RlLklELCBBdXRvSW5kZW50T25QYXN0ZSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUodGV4dCwgdHJ1ZSwgdW5kZWZpbmVkLCAna2V5Ym9hcmQnKTtcblx0XHRcdC8vIHRvZG9AYWlkYXktbWFyLCBtYWtlIHN1cmUgcmFuZ2UgaXMgY29ycmVjdCwgYW5kIG1ha2UgdGVzdCB3b3JrIGFzIGluIHJlYWwgbGlmZVxuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDEsIDEsIDQsIDIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdmdW5jdGlvbiBtYWtlU3ViKGEsYikgeycsXG5cdFx0XHRcdCdzdWJzZW50ID0gc2VudC5zdWJzdHJpbmcoYSxiKTsnLFxuXHRcdFx0XHQncmV0dXJuIHN1YnNlbnQ7Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzIwMTQyMDogaW5jb3JyZWN0IGluZGVudGF0aW9uIHdoZW4gZmlyc3QgbGluZSBpcyBjb21tZW50JywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwMTQyMFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2Z1bmN0aW9uIGJhcigpIHsnLFxuXHRcdFx0JycsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogOCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiA5LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEyLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEzLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDE0LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDE1LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDE2LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDMsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAxMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDUsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogNiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiA5LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDExLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEyLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDE0LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfV0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMSwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH1dXG5cdFx0XHRdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyVG9rZW5pemF0aW9uU3VwcG9ydChpbnN0YW50aWF0aW9uU2VydmljZSwgdG9rZW5zLCBsYW5ndWFnZUlkKSk7XG5cblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0XHQnLy8gY29tbWVudCcsXG5cdFx0XHRcdCdjb25zdCBmb28gPSA0MicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyID0gZWRpdG9yLnJlZ2lzdGVyQW5kSW5zdGFudGlhdGVDb250cmlidXRpb24oQXV0b0luZGVudE9uUGFzdGUuSUQsIEF1dG9JbmRlbnRPblBhc3RlKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSh0ZXh0LCB0cnVlLCB1bmRlZmluZWQsICdrZXlib2FyZCcpO1xuXHRcdFx0YXV0b0luZGVudE9uUGFzdGVDb250cm9sbGVyLnRyaWdnZXIobmV3IFJhbmdlKDIsIDEsIDMsIDE1KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnZnVuY3Rpb24gYmFyKCkgeycsXG5cdFx0XHRcdCcgICAgLy8gY29tbWVudCcsXG5cdFx0XHRcdCcgICAgY29uc3QgZm9vID0gNDInLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0F1dG8gSW5kZW50IE9uIFR5cGUgLSBUeXBlU2NyaXB0L0phdmFTY3JpcHQnLCAoKSA9PiB7XG5cblx0Y29uc3QgbGFuZ3VhZ2VJZCA9IExhbmd1YWdlLlR5cGVTY3JpcHQ7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCkpO1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZV0sXG5cdFx0XHRbSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gRmFpbGluZyB0ZXN0cyBmcm9tIGlzc3Vlcy4uLlxuXG5cdHRlc3QoJ2lzc3VlICMyMDgyMTU6IGluZGVudCBhZnRlciBhcnJvdyBmdW5jdGlvbicsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDgyMTVcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcnLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2NvbnN0IGFkZDEgPSAobikgPT4nKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdjb25zdCBhZGQxID0gKG4pID0+Jyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMDgyMTU6IGluZGVudCBhZnRlciBhcnJvdyBmdW5jdGlvbiAyJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwODIxNVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2NvbnN0IGFycmF5ID0gWzEsIDIsIDMsIDQsIDVdOycsXG5cdFx0XHQnYXJyYXkubWFwKCcsXG5cdFx0XHQnICAgIHYgPT4nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMywgOSwgMywgOSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2NvbnN0IGFycmF5ID0gWzEsIDIsIDMsIDQsIDVdOycsXG5cdFx0XHRcdCdhcnJheS5tYXAoJyxcblx0XHRcdFx0JyAgICB2ID0+Jyxcblx0XHRcdFx0JyAgICAgICAgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTY4NDM6IGluZGVudCBhZnRlciBhcnJvdyBmdW5jdGlvbicsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTY4NDNcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcnLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnR5cGUoW1xuXHRcdFx0XHQnY29uc3QgYWRkMSA9IChuKSA9PicsXG5cdFx0XHRcdCcgICAgbiArIDE7Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2NvbnN0IGFkZDEgPSAobikgPT4nLFxuXHRcdFx0XHQnICAgIG4gKyAxOycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyOTc1NTogZG8gbm90IGFkZCBpbmRlbnRhdGlvbiBvbiBlbnRlciBpZiBpbmRlbnRhdGlvbiBpcyBhbHJlYWR5IHZhbGlkJywgKCkgPT4ge1xuXG5cdFx0Ly9odHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjk3NTVcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdmdW5jdGlvbiBmKCkgeycsXG5cdFx0XHQnICAgIGNvbnN0IG9uZSA9IDE7Jyxcblx0XHRcdCcgICAgY29uc3QgdHdvID0gMjsnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2Z1bmN0aW9uIGYoKSB7Jyxcblx0XHRcdFx0JyAgICBjb25zdCBvbmUgPSAxOycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAgIGNvbnN0IHR3byA9IDI7Jyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNjA5MCcsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zNjA5MFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2NsYXNzIEl0ZW1DdHJsIHsnLFxuXHRcdFx0JyAgICBnZXRQcm9wZXJ0aWVzQnlJdGVtSWQoaWQpIHsnLFxuXHRcdFx0JyAgICAgICAgcmV0dXJuIHRoaXMuZmV0Y2hJdGVtKGlkKScsXG5cdFx0XHQnICAgICAgICAgICAgLnRoZW4oaXRlbSA9PiB7Jyxcblx0XHRcdCcgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UHJvcGVydGllc09mSXRlbShpdGVtKTsnLFxuXHRcdFx0JyAgICAgICAgICAgIH0pOycsXG5cdFx0XHQnICAgIH0nLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdhZHZhbmNlZCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDcsIDYsIDcsIDYpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2NsYXNzIEl0ZW1DdHJsIHsnLFxuXHRcdFx0XHRcdCcgICAgZ2V0UHJvcGVydGllc0J5SXRlbUlkKGlkKSB7Jyxcblx0XHRcdFx0XHQnICAgICAgICByZXR1cm4gdGhpcy5mZXRjaEl0ZW0oaWQpJyxcblx0XHRcdFx0XHQnICAgICAgICAgICAgLnRoZW4oaXRlbSA9PiB7Jyxcblx0XHRcdFx0XHQnICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmdldFByb3BlcnRpZXNPZkl0ZW0oaXRlbSk7Jyxcblx0XHRcdFx0XHQnICAgICAgICAgICAgfSk7Jyxcblx0XHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XHRcdCcgICAgJyxcblx0XHRcdFx0XHQnfScsXG5cdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbig4LCA1LCA4LCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTUzMDQ6IGluZGVudCBibG9jayBjb21tZW50IG9uRW50ZXInLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE1MzA0XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnLyoqICovJyxcblx0XHRcdCdmdW5jdGlvbiBmKCkge30nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdhZHZhbmNlZCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy8qKicsXG5cdFx0XHRcdFx0JyAqICcsXG5cdFx0XHRcdFx0JyAqLycsXG5cdFx0XHRcdFx0J2Z1bmN0aW9uIGYoKSB7fScsXG5cdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MzI0NDogaW5kZW50IHdoZW4gbGFtYmRhIGFycm93IGZ1bmN0aW9uIGlzIGRldGVjdGVkLCBvdXRkZW50IHdoZW4gZW5kIGlzIHJlYWNoZWQnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDMyNDRcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdjb25zdCBhcnJheSA9IFsxLCAyLCAzLCA0LCA1XTsnLFxuXHRcdFx0J2FycmF5Lm1hcChfKSdcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDEyLCAyLCAxMikpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2NvbnN0IGFycmF5ID0gWzEsIDIsIDMsIDQsIDVdOycsXG5cdFx0XHRcdCdhcnJheS5tYXAoXycsXG5cdFx0XHRcdCcgICAgJyxcblx0XHRcdFx0JyknXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQzMjQ0OiBpbmNvcnJlY3QgaW5kZW50YXRpb24gYWZ0ZXIgaWYvZm9yL3doaWxlIHdpdGhvdXQgYnJhY2VzJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQzMjQ0XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnZnVuY3Rpb24gZigpIHsnLFxuXHRcdFx0JyAgICBpZiAoY29uZGl0aW9uKScsXG5cdFx0XHQnfSdcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDE5LCAyLCAxOSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2Z1bmN0aW9uIGYoKSB7Jyxcblx0XHRcdFx0JyAgICBpZiAoY29uZGl0aW9uKScsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgncmV0dXJuOycpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2Z1bmN0aW9uIGYoKSB7Jyxcblx0XHRcdFx0JyAgICBpZiAoY29uZGl0aW9uKScsXG5cdFx0XHRcdCcgICAgICAgIHJldHVybjsnLFxuXHRcdFx0XHQnICAgICcsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjA4MjMyOiBpbmNvcnJlY3QgaW5kZW50YXRpb24gaW5zaWRlIG9mIGNvbW1lbnRzJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwODIzMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0Jy8qKicsXG5cdFx0XHQnaW5kZW50YXRpb24gZG9uZSBmb3IgeycsXG5cdFx0XHQnKi8nXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRcdFt7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50IH1dLFxuXHRcdFx0XHRbeyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuQ29tbWVudCB9XSxcblx0XHRcdFx0W3sgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQgfV1cblx0XHRcdF07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJUb2tlbml6YXRpb25TdXBwb3J0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0b2tlbnMsIGxhbmd1YWdlSWQpKTtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAyMywgMiwgMjMpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCcvKionLFxuXHRcdFx0XHQnaW5kZW50YXRpb24gZG9uZSBmb3IgeycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnKi8nXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIwOTgwMjogYWxsbWFuIHN0eWxlIGJyYWNlcyBpbiBKYXZhU2NyaXB0JywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIwOTgwMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2lmICgvKmNvbmRpdGlvbiovKScsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxOSwgMSwgMTkpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdpZiAoLypjb25kaXRpb24qLyknLFxuXHRcdFx0XHQnICAgICdcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3snLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdpZiAoLypjb25kaXRpb24qLyknLFxuXHRcdFx0XHQne30nXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnaWYgKC8qY29uZGl0aW9uKi8pJyxcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnICAgICcsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIEZhaWxpbmcgdGVzdHMuLi5cblxuXHR0ZXN0LnNraXAoJ2lzc3VlICM0MzI0NDogaW5kZW50IGFmdGVyIGVxdWFsIHNpZ24gaXMgZGV0ZWN0ZWQnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDMyNDRcblx0XHQvLyBpc3N1ZTogU2hvdWxkIGluZGVudCBhZnRlciBhbiBlcXVhbCBzaWduIGlzIGRldGVjdGVkIGZvbGxvd2VkIGJ5IHdoaXRlc3BhY2UgY2hhcmFjdGVycy5cblx0XHQvLyBUaGlzIHNob3VsZCBiZSBvdXRkZW50ZWQgd2hlbiBhIHNlbWktY29sb24gaXMgZGV0ZWN0ZWQgaW5kaWNhdGluZyB0aGUgZW5kIG9mIHRoZSBhc3NpZ25tZW50LlxuXG5cdFx0Ly8gVE9ETzogcmVxdWlyZXMgZXhwbG9yaW5nIGluZGVudC9vdXRkZW50IHBhaXJzIGluc3RlYWRcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdjb25zdCBhcnJheSA9J1xuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMTQsIDEsIDE0KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnY29uc3QgYXJyYXkgPScsXG5cdFx0XHRcdCcgICAgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzQzMjQ0OiBpbmRlbnQgYWZ0ZXIgZG90IGRldGVjdGVkIGFmdGVyIG9iamVjdC9hcnJheSBzaWduaWZ5aW5nIGEgbWV0aG9kIGNhbGwnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDMyNDRcblx0XHQvLyBpc3N1ZTogV2hlbiBhIGRvdCBpcyB3cml0dGVuLCB3ZSBzaG91bGQgZGV0ZWN0IHRoYXQgdGhpcyBpcyBhIG1ldGhvZCBjYWxsIGFuZCBpbmRlbnQgYWNjb3JkaW5nbHlcblxuXHRcdC8vIFRPRE86IHJlcXVpcmVzIGV4cGxvcmluZyBpbmRlbnQvb3V0ZGVudCBwYWlycyBpbnN0ZWFkXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnY29uc3QgYXJyYXkgPSBbMSwgMiwgM107Jyxcblx0XHRcdCdhcnJheS4nXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCA3LCAyLCA3KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnY29uc3QgYXJyYXkgPSBbMSwgMiwgM107Jyxcblx0XHRcdFx0J2FycmF5LicsXG5cdFx0XHRcdCcgICAgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzQzMjQ0OiBpbmRlbnQgYWZ0ZXIgZG90IGRldGVjdGVkIG9uIGEgc3Vic2VxdWVudCBsaW5lIGFmdGVyIG9iamVjdC9hcnJheSBzaWduaWZ5aW5nIGEgbWV0aG9kIGNhbGwnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDMyNDRcblx0XHQvLyBpc3N1ZTogV2hlbiBhIGRvdCBpcyB3cml0dGVuLCB3ZSBzaG91bGQgZGV0ZWN0IHRoYXQgdGhpcyBpcyBhIG1ldGhvZCBjYWxsIGFuZCBpbmRlbnQgYWNjb3JkaW5nbHlcblxuXHRcdC8vIFRPRE86IHJlcXVpcmVzIGV4cGxvcmluZyBpbmRlbnQvb3V0ZGVudCBwYWlycyBpbnN0ZWFkXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnY29uc3QgYXJyYXkgPSBbMSwgMiwgM10nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNywgMiwgNykpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJy4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdjb25zdCBhcnJheSA9IFsxLCAyLCAzXScsXG5cdFx0XHRcdCcgICAgLidcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ2lzc3VlICM0MzI0NDoga2VlcCBpbmRlbnRhdGlvbiB3aGVuIG1ldGhvZHMgY2FsbGVkIG9uIG9iamVjdC9hcnJheScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MzI0NFxuXHRcdC8vIEN1cnJlbnRseSBwYXNzZXMsIGJ1dCBzaG91bGQgcGFzcyB3aXRoIGFsbCB0aGUgdGVzdHMgYWJvdmUgdG9vXG5cblx0XHQvLyBUT0RPOiByZXF1aXJlcyBleHBsb3JpbmcgaW5kZW50L291dGRlbnQgcGFpcnMgaW5zdGVhZFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2NvbnN0IGFycmF5ID0gWzEsIDIsIDNdJyxcblx0XHRcdCcgICAgLmZpbHRlcigoKSA9PiB0cnVlKSdcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDI0LCAyLCAyNCkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2NvbnN0IGFycmF5ID0gWzEsIDIsIDNdJyxcblx0XHRcdFx0JyAgICAuZmlsdGVyKCgpID0+IHRydWUpJyxcblx0XHRcdFx0JyAgICAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjNDMyNDQ6IGtlZXAgaW5kZW50YXRpb24gd2hlbiBjaGFpbmVkIG1ldGhvZHMgY2FsbGVkIG9uIG9iamVjdC9hcnJheScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MzI0NFxuXHRcdC8vIFdoZW4gdGhlIGNhbGwgY2hhaW4gaXMgbm90IGZpbmlzaGVkIHlldCwgYW5kIHdlIHR5cGUgYSBkb3QsIHdlIGRvIG5vdCB3YW50IHRvIGNoYW5nZSB0aGUgaW5kZW50YXRpb25cblxuXHRcdC8vIFRPRE86IHJlcXVpcmVzIGV4cGxvcmluZyBpbmRlbnQvb3V0ZGVudCBwYWlycyBpbnN0ZWFkXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnY29uc3QgYXJyYXkgPSBbMSwgMiwgM10nLFxuXHRcdFx0JyAgICAuZmlsdGVyKCgpID0+IHRydWUpJyxcblx0XHRcdCcgICAgJ1xuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMywgNSwgMywgNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJy4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdjb25zdCBhcnJheSA9IFsxLCAyLCAzXScsXG5cdFx0XHRcdCcgICAgLmZpbHRlcigoKSA9PiB0cnVlKScsXG5cdFx0XHRcdCcgICAgLicgLy8gaGVyZSB3ZSBkb24ndCB3YW50IHRvIGluY3JlYXNlIHRoZSBpbmRlbnRhdGlvbiBiZWNhdXNlIHdlIGhhdmUgY2hhaW5lZCBtZXRob2RzXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjNDMyNDQ6IG91dGRlbnQgd2hlbiBhIHNlbWktY29sb3IgaXMgZGV0ZWN0ZWQgaW5kaWNhdGluZyB0aGUgZW5kIG9mIHRoZSBhc3NpZ25tZW50JywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzQzMjQ0XG5cblx0XHQvLyBUT0RPOiByZXF1aXJlcyBleHBsb3JpbmcgaW5kZW50L291dGRlbnQgcGFpcnMgaW5zdGVhZFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2NvbnN0IGFycmF5ID0gWzEsIDIsIDNdJyxcblx0XHRcdCcgICAgLmZpbHRlcigoKSA9PiB0cnVlKTsnXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAyNSwgMiwgMjUpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdjb25zdCBhcnJheSA9IFsxLCAyLCAzXScsXG5cdFx0XHRcdCcgICAgLmZpbHRlcigoKSA9PiB0cnVlKTsnLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjNDAxMTU6IGtlZXAgaW5kZW50YXRpb24gd2hlbiBhZGRlZCcsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MDExNVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2Z1bmN0aW9uIGZvbygpIHt9JywgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxNywgMSwgMTcpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdmdW5jdGlvbiBmb28oKSB7Jyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnZnVuY3Rpb24gZm9vKCkgeycsXG5cdFx0XHRcdCcgICAgJyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjMTkzODc1OiBpbmNvcnJlY3QgaW5kZW50YXRpb24gb24gZW50ZXInLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTkzODc1XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQneycsXG5cdFx0XHQnICAgIGZvcig7OyknLFxuXHRcdFx0JyAgICBmb3IoOzspIHt9Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDMsIDE0LCAzLCAxNCkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnICAgIGZvcig7OyknLFxuXHRcdFx0XHQnICAgIGZvcig7OykgeycsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ2lzc3VlICM2NzY3ODogaW5kZW50IG9uIHR5cGluZyBjdXJseSBicmFjZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy82NzY3OFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdCdjb25zb2xlLmxvZyhcImFcIiknLFxuXHRcdFx0J2NvbnNvbGUubG9nKFwiYlwiKScsXG5cdFx0XHQnJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICAgIGNvbnNvbGUubG9nKFwiYVwiKScsXG5cdFx0XHRcdCcgICAgY29uc29sZS5sb2coXCJiXCIpJyxcblx0XHRcdFx0J30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzQ2NDAxOiBvdXRkZW50IHdoZW4gZW5jb3VudGVyaW5nIGJyYWNrZXQgb24gbGluZSAtIGFsbG1hbiBzdHlsZSBpbmRlbnRhdGlvbicsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80NjQwMVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2lmICh0cnVlKScsXG5cdFx0XHQnICAgICcsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgne30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdpZiAodHJ1ZSknLFxuXHRcdFx0XHQne30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMikpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2lmICh0cnVlKScsXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ2lzc3VlICMxMjUyNjE6IHR5cGluZyBjbG9zaW5nIGJyYWNlIGRvZXMgbm90IGtlZXAgdGhlIGN1cnJlbnQgaW5kZW50YXRpb24nLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTI1MjYxXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnZm9vIHsnLFxuXHRcdFx0JyAgICAnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdrZWVwJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdmb28geycsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQXV0byBJbmRlbnQgT24gVHlwZSAtIFJ1YnknLCAoKSA9PiB7XG5cblx0Y29uc3QgbGFuZ3VhZ2VJZCA9IExhbmd1YWdlLlJ1Ynk7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCkpO1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZV0sXG5cdFx0XHRbSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXNzdWUgIzE5ODM1MDogaW4gb3Igd2hlbiBpbmNvcnJlY3RseSBtYXRjaCBub24ga2V5d29yZHMgZm9yIFJ1YnknLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTk4MzUwXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJywgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdkZWYgZm9vXFxuICAgICAgICBpJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdkZWYgZm9vXFxuICAgICAgICBpbicpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyAnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnZGVmIGZvb1xcbmluICcpO1xuXG5cdFx0XHR2aWV3TW9kZWwubW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyAgIyBpbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcgICMgaW4nKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcgJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJyAgIyBpbiAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gRmFpbGluZyB0ZXN0cy4uLlxuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzE5OTg0NjogaW4gb3Igd2hlbiBpbmNvcnJlY3RseSBtYXRjaCBub24ga2V5d29yZHMgZm9yIFJ1YnknLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTk5ODQ2XG5cdFx0Ly8gZXhwbGFuYXRpb246IGhhcHBlbmluZyBiZWNhdXNlIHRoZSAjIGlzIGRldGVjdGVkIHByb2JhYmx5IGFzIGEgY29tbWVudFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJycsIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwudHlwZShgbWV0aG9kKCcjZm9vJykgZG9gKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdGBtZXRob2QoJyNmb28nKSBkb2AsXG5cdFx0XHRcdCcgICAgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBdXRvIEluZGVudCBPbiBUeXBlIC0gUEhQJywgKCkgPT4ge1xuXG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBMYW5ndWFnZS5QSFA7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCkpO1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZV0sXG5cdFx0XHRbSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaXNzdWUgIzE5OTA1MDogc2hvdWxkIG5vdCBpbmRlbnQgYWZ0ZXIgeyBkZXRlY3RlZCBpbiBhIHN0cmluZycsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTkwNTBcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGBwcmVnX3JlcGxhY2UoJ3snKTtgLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCwgaW5zdGFudGlhdGlvblNlcnZpY2UpID0+IHtcblx0XHRcdGNvbnN0IHRva2VuczogU3RhbmRhcmRUb2tlblR5cGVEYXRhW11bXSA9IFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdFx0eyBzdGFydEluZGV4OiAxMywgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0XHRcdHsgc3RhcnRJbmRleDogMTYsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyVG9rZW5pemF0aW9uU3VwcG9ydChpbnN0YW50aWF0aW9uU2VydmljZSwgdG9rZW5zLCBsYW5ndWFnZUlkKSk7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgNTQsIDEsIDU0KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHRgcHJlZ19yZXBsYWNlKCd7Jyk7YCxcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQXV0byBJbmRlbnQgT24gUGFzdGUgLSBHbycsICgpID0+IHtcblxuXHRjb25zdCBsYW5ndWFnZUlkID0gTGFuZ3VhZ2UuR287XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCkpO1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZV0sXG5cdFx0XHRbSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndGVtcCBpc3N1ZSBiZWNhdXNlIHRoZXJlIHNob3VsZCBiZSBhdCBsZWFzdCBvbmUgcGFzc2luZyB0ZXN0IGluIGEgc3VpdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ2lzc3VlICMxOTkwNTA6IHNob3VsZCBub3QgaW5kZW50IGFmdGVyIHsgZGV0ZWN0ZWQgaW4gYSBzdHJpbmcnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTk5MDUwXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQndmFyIHMgPSBgJyxcblx0XHRcdCdxdWljayAgYnJvd24nLFxuXHRcdFx0J2ZveCcsXG5cdFx0XHQnYCcsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxKSk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gJyAgJztcblx0XHRcdGNvbnN0IGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlciA9IGVkaXRvci5yZWdpc3RlckFuZEluc3RhbnRpYXRlQ29udHJpYnV0aW9uKEF1dG9JbmRlbnRPblBhc3RlLklELCBBdXRvSW5kZW50T25QYXN0ZSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUodGV4dCwgdHJ1ZSwgdW5kZWZpbmVkLCAna2V5Ym9hcmQnKTtcblx0XHRcdGF1dG9JbmRlbnRPblBhc3RlQ29udHJvbGxlci50cmlnZ2VyKG5ldyBSYW5nZSgzLCAxLCAzLCAzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQndmFyIHMgPSBgJyxcblx0XHRcdFx0J3F1aWNrICBicm93bicsXG5cdFx0XHRcdCcgIGZveCcsXG5cdFx0XHRcdCdgJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQXV0byBJbmRlbnQgT24gVHlwZSAtIENQUCcsICgpID0+IHtcblxuXHRjb25zdCBsYW5ndWFnZUlkID0gTGFuZ3VhZ2UuQ1BQO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcnZpY2VDb2xsZWN0aW9uOiBTZXJ2aWNlQ29sbGVjdGlvbjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gbmV3IExhbmd1YWdlU2VydmljZSgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2UobGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZUlkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2VdLFxuXHRcdFx0W0lMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RlbXAgaXNzdWUgYmVjYXVzZSB0aGVyZSBzaG91bGQgYmUgYXQgbGVhc3Qgb25lIHBhc3NpbmcgdGVzdCBpbiBhIHN1aXRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayh0cnVlKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjMTc4MzM0OiBpbmNvcnJlY3Qgb3V0ZGVudCBvZiB9IHdoZW4gc2lnbmF0dXJlIHNwYW5zIG11bHRpcGxlIGxpbmVzJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE3ODMzNFxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2ludCBXSU5BUEkgV2luTWFpbihib29sIGluc3RhbmNlLCcsXG5cdFx0XHQnICAgIGludCBuc2hvd2NtZCkge30nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMjAsIDIsIDIwKSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnaW50IFdJTkFQSSBXaW5NYWluKGJvb2wgaW5zdGFuY2UsJyxcblx0XHRcdFx0JyAgICBpbnQgbnNob3djbWQpIHsnLFxuXHRcdFx0XHQnICAgICcsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnaXNzdWUgIzExODkyOTogaW5jb3JyZWN0IGluZGVudCB3aGVuIC8vIGZvbGxvd3MgY3VybHkgYnJhY2UnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTI5XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnaWYgKHRydWUpIHsgLy8gamFqYScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAyMCwgMSwgMjApKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeyAvLyBqYWphJyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjMTExMjY1OiBhdXRvIGluZGVudGF0aW9uIHNldCB0byBcIm5vbmVcIiBzdGlsbCBjaGFuZ2VzIHRoZSBpbmRlbnRhdGlvbicsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTEyNjVcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdpbnQgZnVuYygpIHsnLFxuXHRcdFx0J1x0XHQnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdub25lJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMywgMiwgMykpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdpbnQgZnVuYygpIHsnLFxuXHRcdFx0XHQnXHRcdH0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ0F1dG8gSW5kZW50IE9uIFR5cGUgLSBIVE1MJywgKCkgPT4ge1xuXG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBMYW5ndWFnZS5IVE1MO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcnZpY2VDb2xsZWN0aW9uOiBTZXJ2aWNlQ29sbGVjdGlvbjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gbmV3IExhbmd1YWdlU2VydmljZSgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2UobGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZUlkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2VdLFxuXHRcdFx0W0lMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RlbXAgaXNzdWUgYmVjYXVzZSB0aGVyZSBzaG91bGQgYmUgYXQgbGVhc3Qgb25lIHBhc3NpbmcgdGVzdCBpbiBhIHN1aXRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayh0cnVlKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjNjE1MTA6IGluY29ycmVjdCBpbmRlbnRhdGlvbiBhZnRlciAvLyBpbiBodG1sIGZpbGUnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTc4MzM0XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnPHByZT4nLFxuXHRcdFx0JyAgZm9vIC8vSSBwcmVzcyA8RW50ZXI+IGF0IHRoZSBlbmQgb2YgdGhpcyBsaW5lJyxcblx0XHRcdCc8L3ByZT4nLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNDgsIDIsIDQ4KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnPHByZT4nLFxuXHRcdFx0XHQnICBmb28gLy9JIHByZXNzIDxFbnRlcj4gYXQgdGhlIGVuZCBvZiB0aGlzIGxpbmUnLFxuXHRcdFx0XHQnICAnLFxuXHRcdFx0XHQnPC9wcmU+Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQXV0byBJbmRlbnQgT24gVHlwZSAtIFZpc3VhbCBCYXNpYycsICgpID0+IHtcblxuXHRjb25zdCBsYW5ndWFnZUlkID0gTGFuZ3VhZ2UuVkI7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCkpO1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZV0sXG5cdFx0XHRbSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndGVtcCBpc3N1ZSBiZWNhdXNlIHRoZXJlIHNob3VsZCBiZSBhdCBsZWFzdCBvbmUgcGFzc2luZyB0ZXN0IGluIGEgc3VpdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBubyBpbmRlbnRhdGlvbiBpbiB2aXN1YWwgYmFzaWMgZmlsZXMnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnSWYgVHJ1ZSBUaGVuJyxcblx0XHRcdCcgICAgU29tZSBjb2RlJyxcblx0XHRcdCcgICAgRW5kIEknLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsLCBpbnN0YW50aWF0aW9uU2VydmljZSkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDMsIDEwLCAzLCAxMCkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2YnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdJZiBUcnVlIFRoZW4nLFxuXHRcdFx0XHQnICAgIFNvbWUgY29kZScsXG5cdFx0XHRcdCdFbmQgSWYnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGluZGVudCBhZnRlciBNb2R1bGUgZGVjbGFyYXRpb24nLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJywgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdNb2R1bGUgVGVzdCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J01vZHVsZSBUZXN0Jyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGluZGVudCBhZnRlciBTdWIgZGVjbGFyYXRpb24nLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnTW9kdWxlIFRlc3QnLFxuXHRcdFx0JyAgICAnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1N1YiBNYWluKCknKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdNb2R1bGUgVGVzdCcsXG5cdFx0XHRcdCcgICAgU3ViIE1haW4oKScsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODkzMjogZGVkZW50IG9uIEVuZCBTdWInLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnTW9kdWxlIFRlc3QnLFxuXHRcdFx0JyAgICBTdWIgTWFpbigpJyxcblx0XHRcdCcgICAgICAgIENvbnNvbGUuV3JpdGVMaW5lKFwiSGVsbG9cIiknLFxuXHRcdFx0JyAgICAgICAgRW5kIFN1Jyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDQsIDE1LCA0LCAxNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2InLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdNb2R1bGUgVGVzdCcsXG5cdFx0XHRcdCcgICAgU3ViIE1haW4oKScsXG5cdFx0XHRcdCcgICAgICAgIENvbnNvbGUuV3JpdGVMaW5lKFwiSGVsbG9cIiknLFxuXHRcdFx0XHQnICAgIEVuZCBTdWInLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGRlZGVudCBvbiBFbmQgTW9kdWxlJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODkzMlxuXHRcdC8vIFdoZW4gRW5kIE1vZHVsZSBpcyB0eXBlZCByaWdodCBhZnRlciBNb2R1bGUgKG5vIG5lc3RlZCBibG9ja3MpLCBpdCBkZWRlbnRzIGNvcnJlY3RseVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J01vZHVsZSBUZXN0Jyxcblx0XHRcdCcgICAgUHJpdmF0ZSB4IEFzIEludGVnZXInLFxuXHRcdFx0JyAgICBFbmQgTW9kdWwnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMywgMTQsIDMsIDE0KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnZScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J01vZHVsZSBUZXN0Jyxcblx0XHRcdFx0JyAgICBQcml2YXRlIHggQXMgSW50ZWdlcicsXG5cdFx0XHRcdCdFbmQgTW9kdWxlJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBpbmRlbnQgYWZ0ZXIgRnVuY3Rpb24gZGVjbGFyYXRpb24nLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnTW9kdWxlIFRlc3QnLFxuXHRcdFx0JyAgICAnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ0Z1bmN0aW9uIEFkZChhIEFzIEludGVnZXIsIGIgQXMgSW50ZWdlcikgQXMgSW50ZWdlcicpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J01vZHVsZSBUZXN0Jyxcblx0XHRcdFx0JyAgICBGdW5jdGlvbiBBZGQoYSBBcyBJbnRlZ2VyLCBiIEFzIEludGVnZXIpIEFzIEludGVnZXInLFxuXHRcdFx0XHQnICAgICAgICAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGRlZGVudCBvbiBFbmQgRnVuY3Rpb24nLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnTW9kdWxlIFRlc3QnLFxuXHRcdFx0JyAgICBGdW5jdGlvbiBBZGQoYSwgYiknLFxuXHRcdFx0JyAgICAgICAgUmV0dXJuIGEgKyBiJyxcblx0XHRcdCcgICAgICAgIEVuZCBGdW5jdGlvJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDQsIDIwLCA0LCAyMCkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ24nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdNb2R1bGUgVGVzdCcsXG5cdFx0XHRcdCcgICAgRnVuY3Rpb24gQWRkKGEsIGIpJyxcblx0XHRcdFx0JyAgICAgICAgUmV0dXJuIGEgKyBiJyxcblx0XHRcdFx0JyAgICBFbmQgRnVuY3Rpb24nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGluZGVudCBhZnRlciBJZiBUaGVuJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODkzMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0JyAgICAnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ0lmIHggPiAwIFRoZW4nKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdFx0JyAgICBJZiB4ID4gMCBUaGVuJyxcblx0XHRcdFx0JyAgICAgICAgJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBpbmRlbnQgYWZ0ZXIgRWxzZUlmIFRoZW4nLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHQnICAgIElmIHggPiAwIFRoZW4nLFxuXHRcdFx0JyAgICAgICAgRG9Tb21ldGhpbmcoKScsXG5cdFx0XHQnICAgIEVsc2VJZiB4IDwgMCBUaGVuJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDQsIDIyLCA0LCAyMikpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0XHQnICAgIElmIHggPiAwIFRoZW4nLFxuXHRcdFx0XHQnICAgICAgICBEb1NvbWV0aGluZygpJyxcblx0XHRcdFx0JyAgICBFbHNlSWYgeCA8IDAgVGhlbicsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODkzMjogZGVkZW50IGFuZCBpbmRlbnQgb24gRWxzZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdCcgICAgSWYgeCA+IDAgVGhlbicsXG5cdFx0XHQnICAgICAgICBEb1NvbWV0aGluZygpJyxcblx0XHRcdCcgICAgICAgIEVscycsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig0LCAxMiwgNCwgMTIpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdlJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHRcdCcgICAgSWYgeCA+IDAgVGhlbicsXG5cdFx0XHRcdCcgICAgICAgIERvU29tZXRoaW5nKCknLFxuXHRcdFx0XHQnICAgIEVsc2UnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGluZGVudCBhZnRlciBXaGlsZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdCcgICAgJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdXaGlsZSB4ID4gMCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0XHQnICAgIFdoaWxlIHggPiAwJyxcblx0XHRcdFx0JyAgICAgICAgJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBkZWRlbnQgb24gRW5kIFdoaWxlJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODkzMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0JyAgICBXaGlsZSB4ID4gMCcsXG5cdFx0XHQnICAgICAgICB4ID0geCAtIDEnLFxuXHRcdFx0JyAgICAgICAgRW5kIFdoaWwnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNCwgMTcsIDQsIDE3KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnZScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0XHQnICAgIFdoaWxlIHggPiAwJyxcblx0XHRcdFx0JyAgICAgICAgeCA9IHggLSAxJyxcblx0XHRcdFx0JyAgICBFbmQgV2hpbGUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGluZGVudCBhZnRlciBGb3InLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHQnICAgICcsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnRm9yIGkgPSAxIFRvIDEwJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHRcdCcgICAgRm9yIGkgPSAxIFRvIDEwJyxcblx0XHRcdFx0JyAgICAgICAgJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBkZWRlbnQgb24gTmV4dCcsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdCcgICAgRm9yIGkgPSAxIFRvIDEwJyxcblx0XHRcdCcgICAgICAgIERvU29tZXRoaW5nKGkpJyxcblx0XHRcdCcgICAgICAgIE5leCcsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig0LCAxMiwgNCwgMTIpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd0JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHRcdCcgICAgRm9yIGkgPSAxIFRvIDEwJyxcblx0XHRcdFx0JyAgICAgICAgRG9Tb21ldGhpbmcoaSknLFxuXHRcdFx0XHQnICAgIE5leHQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGluZGVudCBhZnRlciBEbycsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdCcgICAgJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdEbycpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0XHQnICAgIERvJyxcblx0XHRcdFx0JyAgICAgICAgJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBkZWRlbnQgb24gTG9vcCcsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdCcgICAgRG8nLFxuXHRcdFx0JyAgICAgICAgeCA9IHggKyAxJyxcblx0XHRcdCcgICAgICAgIExvbycsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig0LCAxMiwgNCwgMTIpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdwJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHRcdCcgICAgRG8nLFxuXHRcdFx0XHQnICAgICAgICB4ID0geCArIDEnLFxuXHRcdFx0XHQnICAgIExvb3AnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGluZGVudCBhZnRlciBTZWxlY3QgQ2FzZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdCcgICAgJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDUsIDIsIDUpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdTZWxlY3QgQ2FzZSB4Jyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHRcdCcgICAgU2VsZWN0IENhc2UgeCcsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODkzMjogZGVkZW50IG9uIEVuZCBTZWxlY3QnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cdFx0Ly8gV2hlbiBFbmQgU2VsZWN0IGlzIHR5cGVkLCBpdCBkZWRlbnRzIHRvIG1hdGNoIFNlbGVjdCBDYXNlIGxldmVsXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHQnICAgIFNlbGVjdCBDYXNlIHgnLFxuXHRcdFx0JyAgICAgICAgRW5kIFNlbGVjJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDMsIDE4LCAzLCAxOCkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3QnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdFx0JyAgICBTZWxlY3QgQ2FzZSB4Jyxcblx0XHRcdFx0JyAgICBFbmQgU2VsZWN0Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBpbmRlbnQgYWZ0ZXIgVHJ5JywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODkzMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0JyAgICAnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1RyeScpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0XHQnICAgIFRyeScsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODkzMjogZGVkZW50IGFuZCBpbmRlbnQgb24gQ2F0Y2gnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE4OTMyXG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnU3ViIFRlc3QoKScsXG5cdFx0XHQnICAgIFRyeScsXG5cdFx0XHQnICAgICAgICBEb1NvbWV0aGluZygpJyxcblx0XHRcdCcgICAgICAgIENhdGMnLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNCwgMTMsIDQsIDEzKSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnaCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0XHQnICAgIFRyeScsXG5cdFx0XHRcdCcgICAgICAgIERvU29tZXRoaW5nKCknLFxuXHRcdFx0XHQnICAgIENhdGNoJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBkZWRlbnQgYW5kIGluZGVudCBvbiBGaW5hbGx5JywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODkzMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0JyAgICBUcnknLFxuXHRcdFx0JyAgICAgICAgRG9Tb21ldGhpbmcoKScsXG5cdFx0XHQnICAgIENhdGNoJyxcblx0XHRcdCcgICAgICAgIEhhbmRsZUVycm9yKCknLFxuXHRcdFx0JyAgICAgICAgRmluYWxsJyxcblx0XHRdLmpvaW4oJ1xcbicpLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDYsIDE1LCA2LCAxNSkpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3knLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdTdWIgVGVzdCgpJyxcblx0XHRcdFx0JyAgICBUcnknLFxuXHRcdFx0XHQnICAgICAgICBEb1NvbWV0aGluZygpJyxcblx0XHRcdFx0JyAgICBDYXRjaCcsXG5cdFx0XHRcdCcgICAgICAgIEhhbmRsZUVycm9yKCknLFxuXHRcdFx0XHQnICAgIEZpbmFsbHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTg5MzI6IGRlZGVudCBvbiBFbmQgVHJ5JywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODkzMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0JyAgICBUcnknLFxuXHRcdFx0JyAgICAgICAgRG9Tb21ldGhpbmcoKScsXG5cdFx0XHQnICAgIENhdGNoJyxcblx0XHRcdCcgICAgICAgIEhhbmRsZUVycm9yKCknLFxuXHRcdFx0JyAgICBGaW5hbGx5Jyxcblx0XHRcdCcgICAgICAgIENsZWFudXAoKScsXG5cdFx0XHQnICAgICAgICBFbmQgVHInLFxuXHRcdF0uam9pbignXFxuJyksIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oOCwgMTUsIDgsIDE1KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1N1YiBUZXN0KCknLFxuXHRcdFx0XHQnICAgIFRyeScsXG5cdFx0XHRcdCcgICAgICAgIERvU29tZXRoaW5nKCknLFxuXHRcdFx0XHQnICAgIENhdGNoJyxcblx0XHRcdFx0JyAgICAgICAgSGFuZGxlRXJyb3IoKScsXG5cdFx0XHRcdCcgICAgRmluYWxseScsXG5cdFx0XHRcdCcgICAgICAgIENsZWFudXAoKScsXG5cdFx0XHRcdCcgICAgRW5kIFRyeScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODkzMjogaW5kZW50IGFmdGVyIENsYXNzJywgKCkgPT4ge1xuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExODkzMlxuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJycsIGxhbmd1YWdlSWQsIHt9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJywgc2VydmljZUNvbGxlY3Rpb24gfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnQ2xhc3MgTXlDbGFzcycpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J0NsYXNzIE15Q2xhc3MnLFxuXHRcdFx0XHQnICAgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODkzMjogZGVkZW50IG9uIEVuZCBDbGFzcycsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdDbGFzcyBNeUNsYXNzJyxcblx0XHRcdCcgICAgUHJpdmF0ZSB4IEFzIEludGVnZXInLFxuXHRcdFx0JyAgICBFbmQgQ2xhcycsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigzLCAxNCwgMywgMTQpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdzJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnQ2xhc3MgTXlDbGFzcycsXG5cdFx0XHRcdCcgICAgUHJpdmF0ZSB4IEFzIEludGVnZXInLFxuXHRcdFx0XHQnRW5kIENsYXNzJyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4OTMyOiBmdWxsIHByb2dyYW0gaW5kZW50YXRpb24gZmxvdycsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTg5MzJcblx0XHQvLyBWZXJpZnkgdGhlIGNvbXBsZXRlIGZsb3cgYXMgZGVzY3JpYmVkIGluIHRoZSB2ZXJpZmljYXRpb24gY29tbWVudFxuXHRcdC8vIE5vdGU6IEF1dG8taW5kZW50IG9ubHkgdHJpZ2dlcnMgb24gdHlwaW5nIHRoZSBsYXN0IGNoYXJhY3RlciB0aGF0IGNvbXBsZXRlcyBhIGtleXdvcmRcblx0XHQvLyBhbmQgb25seSBkZWNyZWFzZXMgYnkgb25lIGluZGVudGF0aW9uIGxldmVsIHBlciBrZXl3b3JkIGNvbXBsZXRpb25cblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcnLCBsYW5ndWFnZUlkLCB7fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1vZGVsKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcsIHNlcnZpY2VDb2xsZWN0aW9uIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gVHlwZSBNb2R1bGUgVGVzdCBhbmQgcHJlc3MgRW50ZXJcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdNb2R1bGUgVGVzdCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J01vZHVsZSBUZXN0Jyxcblx0XHRcdFx0JyAgICAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ0FmdGVyIE1vZHVsZSBUZXN0Jyk7XG5cblx0XHRcdC8vIFR5cGUgU3ViIE1haW4oKSBhbmQgcHJlc3MgRW50ZXJcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdTdWIgTWFpbigpJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnTW9kdWxlIFRlc3QnLFxuXHRcdFx0XHQnICAgIFN1YiBNYWluKCknLFxuXHRcdFx0XHQnICAgICAgICAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ0FmdGVyIFN1YiBNYWluKCknKTtcblxuXHRcdFx0Ly8gVHlwZSBDb25zb2xlLldyaXRlTGluZSBhbmQgcHJlc3MgRW50ZXJcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdDb25zb2xlLldyaXRlTGluZShcIkhlbGxvLCBXb3JsZCFcIiknKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdNb2R1bGUgVGVzdCcsXG5cdFx0XHRcdCcgICAgU3ViIE1haW4oKScsXG5cdFx0XHRcdCcgICAgICAgIENvbnNvbGUuV3JpdGVMaW5lKFwiSGVsbG8sIFdvcmxkIVwiKScsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnQWZ0ZXIgQ29uc29sZS5Xcml0ZUxpbmUnKTtcblxuXHRcdFx0Ly8gVHlwZSBFbmQgU3UgdGhlbiAnYicgdG8gY29tcGxldGUgRW5kIFN1YiAoYXV0by1pbmRlbnQgdHJpZ2dlcnMgb24gbGFzdCBjaGFyKVxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ0VuZCBTdScpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2InLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdNb2R1bGUgVGVzdCcsXG5cdFx0XHRcdCcgICAgU3ViIE1haW4oKScsXG5cdFx0XHRcdCcgICAgICAgIENvbnNvbGUuV3JpdGVMaW5lKFwiSGVsbG8sIFdvcmxkIVwiKScsXG5cdFx0XHRcdCcgICAgRW5kIFN1YicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnQWZ0ZXIgRW5kIFN1YicpO1xuXG5cdFx0XHQvLyBQcmVzcyBFbnRlciAtIHNob3VsZCBtYWludGFpbiBzYW1lIGluZGVudCBsZXZlbCBhZnRlciBFbmQgU3ViXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnTW9kdWxlIFRlc3QnLFxuXHRcdFx0XHQnICAgIFN1YiBNYWluKCknLFxuXHRcdFx0XHQnICAgICAgICBDb25zb2xlLldyaXRlTGluZShcIkhlbGxvLCBXb3JsZCFcIiknLFxuXHRcdFx0XHQnICAgIEVuZCBTdWInLFxuXHRcdFx0XHQnICAgICcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnQWZ0ZXIgRW50ZXIgYWZ0ZXIgRW5kIFN1YicpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5cbnN1aXRlKCdBdXRvIEluZGVudCBPbiBUeXBlIC0gTGF0ZXgnLCAoKSA9PiB7XG5cblx0Y29uc3QgbGFuZ3VhZ2VJZCA9IExhbmd1YWdlLkxhdGV4O1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcnZpY2VDb2xsZWN0aW9uOiBTZXJ2aWNlQ29sbGVjdGlvbjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gbmV3IExhbmd1YWdlU2VydmljZSgpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2UobGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZUlkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRzZXJ2aWNlQ29sbGVjdGlvbiA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFuZ3VhZ2VTZXJ2aWNlLCBsYW5ndWFnZVNlcnZpY2VdLFxuXHRcdFx0W0lMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RlbXAgaXNzdWUgYmVjYXVzZSB0aGVyZSBzaG91bGQgYmUgYXQgbGVhc3Qgb25lIHBhc3NpbmcgdGVzdCBpbiBhIHN1aXRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5vayh0cnVlKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdpc3N1ZSAjMTc4MDc1OiBubyBhdXRvIGNsb3NpbmcgcGFpciB3aGVuIGluZGVudGF0aW9uIGRvbmUnLCAoKSA9PiB7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTc4MDc1XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnXFxcXGJlZ2lue3RoZW9yZW19Jyxcblx0XHRcdCcgICAgXFxcXGVuZCcsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCA5LCAyLCA5KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneycsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J1xcXFxiZWdpbnt0aGVvcmVtfScsXG5cdFx0XHRcdCdcXFxcZW5ke30nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBdXRvIEluZGVudCBPbiBUeXBlIC0gTHVhJywgKCkgPT4ge1xuXG5cdGNvbnN0IGxhbmd1YWdlSWQgPSBMYW5ndWFnZS5MdWE7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VydmljZUNvbGxlY3Rpb246IFNlcnZpY2VDb2xsZWN0aW9uO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBuZXcgTGFuZ3VhZ2VTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZShsYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlSWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnaXN0ZXJMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCkpO1xuXHRcdHNlcnZpY2VDb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lMYW5ndWFnZVNlcnZpY2UsIGxhbmd1YWdlU2VydmljZV0sXG5cdFx0XHRbSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2VdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndGVtcCBpc3N1ZSBiZWNhdXNlIHRoZXJlIHNob3VsZCBiZSBhdCBsZWFzdCBvbmUgcGFzc2luZyB0ZXN0IGluIGEgc3VpdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ2lzc3VlICMxNzgwNzU6IG5vIGF1dG8gY2xvc2luZyBwYWlyIHdoZW4gaW5kZW50YXRpb24gZG9uZScsICgpID0+IHtcblxuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNzgwNzVcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtcblx0XHRcdCdwcmludChcImFzZGYgZnVuY3Rpb24gYXNkZlwiKScsXG5cdFx0XS5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCwge30pO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnLCBzZXJ2aWNlQ29sbGVjdGlvbiB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAyOCwgMSwgMjgpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdwcmludChcImFzZGYgZnVuY3Rpb24gYXNkZlwiKScsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxnQkFBZ0IseUJBQXlCO0FBQ2xELFNBQVMsMkJBQXlELDRCQUE0QjtBQUM5RixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFtQiw0QkFBNEIsZ0NBQWdDO0FBQ3hGLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CLHNCQUFzQiw0QkFBNEIsdUJBQXVCLHFCQUFxQixxQkFBcUIsc0JBQXNCLDBCQUEwQjtBQUNoTSxTQUFTLGlCQUFpQixrQkFBa0Isd0JBQXdCLGlCQUFpQixzQkFBc0I7QUFDM0csU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUIsZ0JBQWdCLGtCQUFrQixtQkFBbUIsaUJBQWlCLGlCQUFpQixrQkFBa0Isd0JBQXdCLHNCQUFzQjtBQUNqTCxTQUFTLGlDQUFpQyxrQ0FBa0M7QUFDNUUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3Q0FBd0M7QUFFMUMsSUFBSyxXQUFMLGtCQUFLQSxjQUFMO0FBQ04sRUFBQUEsVUFBQSxnQkFBYTtBQUNiLEVBQUFBLFVBQUEsVUFBTztBQUNQLEVBQUFBLFVBQUEsU0FBTTtBQUNOLEVBQUFBLFVBQUEsUUFBSztBQUNMLEVBQUFBLFVBQUEsU0FBTTtBQUNOLEVBQUFBLFVBQUEsVUFB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
