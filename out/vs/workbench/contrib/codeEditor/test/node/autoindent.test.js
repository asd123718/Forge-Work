import * as fs from "fs";
import { extname, join } from "../../../../../base/common/path.js";
import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ILanguageConfigurationService } from "../../../../../editor/common/languages/languageConfigurationRegistry.js";
import { getReindentEditOperations } from "../../../../../editor/contrib/indentation/common/indentation.js";
import { createModelServices, instantiateTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { LanguageConfigurationFileHandler } from "../../common/languageConfigurationExtensionPoint.js";
import { parse } from "../../../../../base/common/json.js";
import { trimTrailingWhitespace } from "../../../../../editor/common/commands/trimTrailingWhitespaceCommand.js";
import { execSync } from "child_process";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../../../editor/common/languages.js";
import { NullState } from "../../../../../editor/common/languages/nullTokenize.js";
import { MetadataConsts, StandardTokenType } from "../../../../../editor/common/encodedTokenAttributes.js";
import { FileAccess } from "../../../../../base/common/network.js";
function getIRange(range) {
  return {
    startLineNumber: range.startLineNumber,
    startColumn: range.startColumn,
    endLineNumber: range.endLineNumber,
    endColumn: range.endColumn
  };
}
var LanguageId = /* @__PURE__ */ ((LanguageId2) => {
  LanguageId2["TypeScript"] = "ts-test";
  return LanguageId2;
})(LanguageId || {});
function forceTokenizationFromLineToLine(model, startLine, endLine) {
  for (let line = startLine; line <= endLine; line++) {
    model.tokenization.forceTokenization(line);
  }
}
function registerLanguage(instantiationService, languageId) {
  const disposables = new DisposableStore();
  const languageService = instantiationService.get(ILanguageService);
  disposables.add(registerLanguageConfiguration(instantiationService, languageId));
  disposables.add(languageService.registerLanguage({ id: languageId }));
  return disposables;
}
function registerLanguageConfiguration(instantiationService, languageId) {
  const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
  let configPath;
  switch (languageId) {
    case "ts-test" /* TypeScript */:
      configPath = FileAccess.asFileUri("vs/workbench/contrib/codeEditor/test/node/language-configuration.json").fsPath;
      break;
    default:
      throw new Error("Unknown languageId");
  }
  const configContent = fs.readFileSync(configPath, { encoding: "utf-8" });
  const parsedConfig = parse(configContent, []);
  const languageConfig = LanguageConfigurationFileHandler.extractValidConfig(languageId, parsedConfig);
  return languageConfigurationService.register(languageId, languageConfig);
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
suite("Language Configuration Parsing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Folding markers support object regex syntax with flags", () => {
    const parsed = LanguageConfigurationFileHandler.extractValidConfig("testLang", {
      folding: {
        markers: {
          start: { pattern: "^\\s*#region\\b", flags: "i" },
          end: { pattern: "^\\s*#endregion\\b", flags: "i" }
        }
      }
    });
    assert.ok(parsed.folding?.markers);
    assert.strictEqual(parsed.folding?.markers?.start.flags, "i");
    assert.strictEqual(parsed.folding?.markers?.end.flags, "i");
    assert.ok(parsed.folding?.markers?.start.test("#REGION"));
    assert.ok(parsed.folding?.markers?.end.test("#ENDREGION"));
  });
});
suite("Auto-Reindentation - TypeScript/JavaScript", () => {
  const languageId = "ts-test" /* TypeScript */;
  const options = {};
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createModelServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    disposables.add(instantiationService);
    disposables.add(registerLanguage(instantiationService, languageId));
    disposables.add(registerLanguageConfiguration(instantiationService, languageId));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test.skip("Find Cases of Incorrect Indentation with the Reindent Lines Command", () => {
    function walkDirectoryAndReindent(directory, languageId2) {
      const files = fs.readdirSync(directory, { withFileTypes: true });
      const directoriesToRecurseOn = [];
      for (const file of files) {
        if (file.isDirectory()) {
          directoriesToRecurseOn.push(join(directory, file.name));
        } else {
          const filePathName = join(directory, file.name);
          const fileExtension = extname(filePathName);
          if (fileExtension !== ".ts") {
            continue;
          }
          const fileContents = fs.readFileSync(filePathName, { encoding: "utf-8" });
          const modelOptions = {
            tabSize: 4,
            insertSpaces: false
          };
          const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId2, modelOptions));
          const lineCount = model.getLineCount();
          const editOperations = [];
          for (let line = 1; line <= lineCount - 1; line++) {
            const lineContent = model.getLineContent(line);
            const trimmedLineContent = lineContent.trim();
            if (trimmedLineContent.length === 0) {
              continue;
            }
            const editOperation = getReindentEditOperations(model, languageConfigurationService, line, line + 1);
            editOperations.push(...editOperation);
          }
          model.applyEdits(editOperations);
          model.applyEdits(trimTrailingWhitespace(model, [], true));
          fs.writeFileSync(filePathName, model.getValue());
        }
      }
      for (const directory2 of directoriesToRecurseOn) {
        walkDirectoryAndReindent(directory2, languageId2);
      }
    }
    walkDirectoryAndReindent("/Users/aiday/Desktop/Test/vscode-test", "ts-test");
    const output = execSync("cd /Users/aiday/Desktop/Test/vscode-test && git diff --shortstat", { encoding: "utf-8" });
    console.log("\ngit diff --shortstat:\n", output);
  });
  test("Issue #25437", () => {
    const fileContents = [
      "const foo = `{`;",
      "    "
    ].join("\n");
    const tokens = [
      [
        { startIndex: 0, standardTokenType: StandardTokenType.Other },
        { startIndex: 5, standardTokenType: StandardTokenType.Other },
        { startIndex: 6, standardTokenType: StandardTokenType.Other },
        { startIndex: 9, standardTokenType: StandardTokenType.Other },
        { startIndex: 10, standardTokenType: StandardTokenType.Other },
        { startIndex: 11, standardTokenType: StandardTokenType.Other },
        { startIndex: 12, standardTokenType: StandardTokenType.String },
        { startIndex: 13, standardTokenType: StandardTokenType.String },
        { startIndex: 14, standardTokenType: StandardTokenType.String },
        { startIndex: 15, standardTokenType: StandardTokenType.Other },
        { startIndex: 16, standardTokenType: StandardTokenType.Other }
      ],
      [
        { startIndex: 0, standardTokenType: StandardTokenType.Other },
        { startIndex: 4, standardTokenType: StandardTokenType.Other }
      ]
    ];
    disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    forceTokenizationFromLineToLine(model, 1, 2);
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 1);
    const operation = editOperations[0];
    assert.deepStrictEqual(getIRange(operation.range), {
      "startLineNumber": 2,
      "startColumn": 1,
      "endLineNumber": 2,
      "endColumn": 5
    });
    assert.deepStrictEqual(operation.text, "");
  });
  test("Enriching the hover", () => {
    let fileContents = [
      "function foo(",
      "    bar: string",
      "    ){}"
    ].join("\n");
    let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 1);
    let operation = editOperations[0];
    assert.deepStrictEqual(getIRange(operation.range), {
      "startLineNumber": 3,
      "startColumn": 1,
      "endLineNumber": 3,
      "endColumn": 5
    });
    assert.deepStrictEqual(operation.text, "");
    fileContents = [
      "function foo(",
      "bar: string",
      "){}"
    ].join("\n");
    model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 1);
    operation = editOperations[0];
    assert.deepStrictEqual(getIRange(operation.range), {
      "startLineNumber": 2,
      "startColumn": 1,
      "endLineNumber": 2,
      "endColumn": 1
    });
    assert.deepStrictEqual(operation.text, "    ");
  });
  test("Issue #86176", () => {
    const fileContents = [
      `if () { // '`,
      `x = 4`,
      `}`
    ].join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 1);
    const operation = editOperations[0];
    assert.deepStrictEqual(getIRange(operation.range), {
      "startLineNumber": 2,
      "startColumn": 1,
      "endLineNumber": 2,
      "endColumn": 1
    });
    assert.deepStrictEqual(operation.text, "    ");
  });
  test("Issue #141816", () => {
    const fileContents = [
      "const r = /{/;",
      "   "
    ].join("\n");
    const tokens = [
      [
        { startIndex: 0, standardTokenType: StandardTokenType.Other },
        { startIndex: 5, standardTokenType: StandardTokenType.Other },
        { startIndex: 6, standardTokenType: StandardTokenType.Other },
        { startIndex: 7, standardTokenType: StandardTokenType.Other },
        { startIndex: 8, standardTokenType: StandardTokenType.Other },
        { startIndex: 9, standardTokenType: StandardTokenType.RegEx },
        { startIndex: 10, standardTokenType: StandardTokenType.RegEx },
        { startIndex: 11, standardTokenType: StandardTokenType.RegEx },
        { startIndex: 12, standardTokenType: StandardTokenType.RegEx },
        { startIndex: 13, standardTokenType: StandardTokenType.Other },
        { startIndex: 14, standardTokenType: StandardTokenType.Other }
      ],
      [
        { startIndex: 0, standardTokenType: StandardTokenType.Other },
        { startIndex: 4, standardTokenType: StandardTokenType.Other }
      ]
    ];
    disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    forceTokenizationFromLineToLine(model, 1, 2);
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 1);
    const operation = editOperations[0];
    assert.deepStrictEqual(getIRange(operation.range), {
      "startLineNumber": 2,
      "startColumn": 1,
      "endLineNumber": 2,
      "endColumn": 4
    });
    assert.deepStrictEqual(operation.text, "");
  });
  test("Issue #29886", () => {
    const fileContents = [
      "function foo() {",
      "    bar(/*  */)",
      "};"
    ].join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
  });
  test("Issue #209859: do not do reindentation for tokens inside of a string", () => {
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
      ],
      [
        { startIndex: 0, standardTokenType: StandardTokenType.String }
      ]
    ];
    disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
    const fileContents = [
      "const foo = `some text",
      "         which is strangely",
      "    indented. It should",
      "   not be reindented.`"
    ].join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    forceTokenizationFromLineToLine(model, 1, 4);
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
  });
  test.skip("Incorrect deindentation after `*/}` string", () => {
    const fileContents = [
      `const obj = {`,
      `    obj1: {`,
      `        brace : '*/}'`,
      `    }`,
      `}`
    ].join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
  });
  test.skip("Issue #56275", () => {
    let fileContents = [
      "function foo() {",
      "    var bar = (/b*/);",
      "}"
    ].join("\n");
    let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
    fileContents = [
      "function foo() {",
      '    var bar = "/b*/)";',
      "}"
    ].join("\n");
    model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
  });
  test.skip("Issue #116843", () => {
    const fileContents = [
      "const add1 = (n) =>",
      "	n + 1;"
    ].join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
  });
  test.skip("Issue #185252", () => {
    const fileContents = [
      "/*",
      " * This is a comment.",
      " */"
    ].join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
  });
  test.skip("Issue 43244: incorrect indentation when signature of function call spans several lines", () => {
    const fileContents = [
      "function callSomeOtherFunction(one: number, two: number) { }",
      "function someFunction() {",
      "    callSomeOtherFunction(4,",
      "        5)",
      "}"
    ].join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
    const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
    assert.deepStrictEqual(editOperations.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXHRlc3RcXG5vZGVcXGF1dG9pbmRlbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IGV4dG5hbWUsIGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmRlbnRhdGlvbi9jb21tb24vaW5kZW50YXRpb24uanMnO1xuaW1wb3J0IHsgSVJlbGF4ZWRUZXh0TW9kZWxDcmVhdGlvbk9wdGlvbnMsIGNyZWF0ZU1vZGVsU2VydmljZXMsIGluc3RhbnRpYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvbiwgTGFuZ3VhZ2VDb25maWd1cmF0aW9uRmlsZUhhbmRsZXIgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VDb25maWd1cmF0aW9uRXh0ZW5zaW9uUG9pbnQuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9lZGl0T3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IHRyaW1UcmFpbGluZ1doaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbW1hbmRzL3RyaW1UcmFpbGluZ1doaXRlc3BhY2VDb21tYW5kLmpzJztcbmltcG9ydCB7IGV4ZWNTeW5jIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCwgSVN0YXRlLCBJVG9rZW5pemF0aW9uU3VwcG9ydCwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMsIFN0YW5kYXJkVG9rZW5UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcblxuZnVuY3Rpb24gZ2V0SVJhbmdlKHJhbmdlOiBJUmFuZ2UpOiBJUmFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydENvbHVtbixcblx0XHRlbmRMaW5lTnVtYmVyOiByYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdGVuZENvbHVtbjogcmFuZ2UuZW5kQ29sdW1uXG5cdH07XG59XG5cbmNvbnN0IGVudW0gTGFuZ3VhZ2VJZCB7XG5cdFR5cGVTY3JpcHQgPSAndHMtdGVzdCdcbn1cblxuZnVuY3Rpb24gZm9yY2VUb2tlbml6YXRpb25Gcm9tTGluZVRvTGluZShtb2RlbDogSVRleHRNb2RlbCwgc3RhcnRMaW5lOiBudW1iZXIsIGVuZExpbmU6IG51bWJlcik6IHZvaWQge1xuXHRmb3IgKGxldCBsaW5lID0gc3RhcnRMaW5lOyBsaW5lIDw9IGVuZExpbmU7IGxpbmUrKykge1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZWdpc3Rlckxhbmd1YWdlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UsIGxhbmd1YWdlSWQ6IExhbmd1YWdlSWQpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGRpc3Bvc2FibGVzLmFkZChyZWdpc3Rlckxhbmd1YWdlQ29uZmlndXJhdGlvbihpbnN0YW50aWF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZCkpO1xuXHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdHJldHVybiBkaXNwb3NhYmxlcztcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJMYW5ndWFnZUNvbmZpZ3VyYXRpb24oaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSwgbGFuZ3VhZ2VJZDogTGFuZ3VhZ2VJZCk6IElEaXNwb3NhYmxlIHtcblx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGxldCBjb25maWdQYXRoOiBzdHJpbmc7XG5cdHN3aXRjaCAobGFuZ3VhZ2VJZCkge1xuXHRcdGNhc2UgTGFuZ3VhZ2VJZC5UeXBlU2NyaXB0OlxuXHRcdFx0Y29uZmlnUGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCd2cy93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL3Rlc3Qvbm9kZS9sYW5ndWFnZS1jb25maWd1cmF0aW9uLmpzb24nKS5mc1BhdGg7XG5cdFx0XHRicmVhaztcblx0XHRkZWZhdWx0OlxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGxhbmd1YWdlSWQnKTtcblx0fVxuXHRjb25zdCBjb25maWdDb250ZW50ID0gZnMucmVhZEZpbGVTeW5jKGNvbmZpZ1BhdGgsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSk7XG5cdGNvbnN0IHBhcnNlZENvbmZpZyA9IDxJTGFuZ3VhZ2VDb25maWd1cmF0aW9uPnBhcnNlKGNvbmZpZ0NvbnRlbnQsIFtdKTtcblx0Y29uc3QgbGFuZ3VhZ2VDb25maWcgPSBMYW5ndWFnZUNvbmZpZ3VyYXRpb25GaWxlSGFuZGxlci5leHRyYWN0VmFsaWRDb25maWcobGFuZ3VhZ2VJZCwgcGFyc2VkQ29uZmlnKTtcblx0cmV0dXJuIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwgbGFuZ3VhZ2VDb25maWcpO1xufVxuXG5pbnRlcmZhY2UgU3RhbmRhcmRUb2tlblR5cGVEYXRhIHtcblx0c3RhcnRJbmRleDogbnVtYmVyO1xuXHRzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGU7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVyVG9rZW5pemF0aW9uU3VwcG9ydChpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10sIGxhbmd1YWdlSWQ6IExhbmd1YWdlSWQpOiBJRGlzcG9zYWJsZSB7XG5cdGxldCBsaW5lSW5kZXggPSAwO1xuXHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKTogRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbnNPbkxpbmUgPSB0b2tlbnNbbGluZUluZGV4KytdO1xuXHRcdFx0Y29uc3QgZW5jb2RlZExhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UubGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobGFuZ3VhZ2VJZCk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoMiAqIHRva2Vuc09uTGluZS5sZW5ndGgpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnNPbkxpbmUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0cmVzdWx0WzIgKiBpXSA9IHRva2Vuc09uTGluZVtpXS5zdGFydEluZGV4O1xuXHRcdFx0XHRyZXN1bHRbMiAqIGkgKyAxXSA9XG5cdFx0XHRcdFx0KChlbmNvZGVkTGFuZ3VhZ2VJZCA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdFx0XHRcdHwgKHRva2Vuc09uTGluZVtpXS5zdGFuZGFyZFRva2VuVHlwZSA8PCBNZXRhZGF0YUNvbnN0cy5UT0tFTl9UWVBFX09GRlNFVCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHJlc3VsdCwgW10sIHN0YXRlKTtcblx0XHR9XG5cdH07XG5cdHJldHVybiBUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihsYW5ndWFnZUlkLCB0b2tlbml6YXRpb25TdXBwb3J0KTtcbn1cblxuc3VpdGUoJ0xhbmd1YWdlIENvbmZpZ3VyYXRpb24gUGFyc2luZycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlc3QoJ0ZvbGRpbmcgbWFya2VycyBzdXBwb3J0IG9iamVjdCByZWdleCBzeW50YXggd2l0aCBmbGFncycsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBMYW5ndWFnZUNvbmZpZ3VyYXRpb25GaWxlSGFuZGxlci5leHRyYWN0VmFsaWRDb25maWcoJ3Rlc3RMYW5nJywge1xuXHRcdFx0Zm9sZGluZzoge1xuXHRcdFx0XHRtYXJrZXJzOiB7XG5cdFx0XHRcdFx0c3RhcnQ6IHsgcGF0dGVybjogJ15cXFxccyojcmVnaW9uXFxcXGInLCBmbGFnczogJ2knIH0sXG5cdFx0XHRcdFx0ZW5kOiB7IHBhdHRlcm46ICdeXFxcXHMqI2VuZHJlZ2lvblxcXFxiJywgZmxhZ3M6ICdpJyB9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydC5vayhwYXJzZWQuZm9sZGluZz8ubWFya2Vycyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5mb2xkaW5nPy5tYXJrZXJzPy5zdGFydC5mbGFncywgJ2knKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmZvbGRpbmc/Lm1hcmtlcnM/LmVuZC5mbGFncywgJ2knKTtcblx0XHRhc3NlcnQub2socGFyc2VkLmZvbGRpbmc/Lm1hcmtlcnM/LnN0YXJ0LnRlc3QoJyNSRUdJT04nKSk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZC5mb2xkaW5nPy5tYXJrZXJzPy5lbmQudGVzdCgnI0VORFJFR0lPTicpKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0F1dG8tUmVpbmRlbnRhdGlvbiAtIFR5cGVTY3JpcHQvSmF2YVNjcmlwdCcsICgpID0+IHtcblxuXHRjb25zdCBsYW5ndWFnZUlkID0gTGFuZ3VhZ2VJZC5UeXBlU2NyaXB0O1xuXHRjb25zdCBvcHRpb25zOiBJUmVsYXhlZFRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyA9IHt9O1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3Rlckxhbmd1YWdlKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUlkKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyTGFuZ3VhZ2VDb25maWd1cmF0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsYW5ndWFnZUlkKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFRlc3Qgd2hpY2ggY2FuIGJlIHJhbiB0byBmaW5kIGNhc2VzIG9mIGluY29ycmVjdCBpbmRlbnRhdGlvbi4uLlxuXHR0ZXN0LnNraXAoJ0ZpbmQgQ2FzZXMgb2YgSW5jb3JyZWN0IEluZGVudGF0aW9uIHdpdGggdGhlIFJlaW5kZW50IExpbmVzIENvbW1hbmQnLCAoKSA9PiB7XG5cblx0XHQvLyAuL3NjcmlwdHMvdGVzdC5zaCAtLWluc3BlY3QgLS1ncmVwPSdGaW5kIENhc2VzIG9mIEluY29ycmVjdCBJbmRlbnRhdGlvbiB3aXRoIHRoZSBSZWluZGVudCBMaW5lcyBDb21tYW5kJyAtLXRpbWVvdXQ9MTUwMDBcblxuXHRcdGZ1bmN0aW9uIHdhbGtEaXJlY3RvcnlBbmRSZWluZGVudChkaXJlY3Rvcnk6IHN0cmluZywgbGFuZ3VhZ2VJZDogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBmaWxlcyA9IGZzLnJlYWRkaXJTeW5jKGRpcmVjdG9yeSwgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgZGlyZWN0b3JpZXNUb1JlY3Vyc2VPbjogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRpZiAoZmlsZS5pc0RpcmVjdG9yeSgpKSB7XG5cdFx0XHRcdFx0ZGlyZWN0b3JpZXNUb1JlY3Vyc2VPbi5wdXNoKGpvaW4oZGlyZWN0b3J5LCBmaWxlLm5hbWUpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBmaWxlUGF0aE5hbWUgPSBqb2luKGRpcmVjdG9yeSwgZmlsZS5uYW1lKTtcblx0XHRcdFx0XHRjb25zdCBmaWxlRXh0ZW5zaW9uID0gZXh0bmFtZShmaWxlUGF0aE5hbWUpO1xuXHRcdFx0XHRcdGlmIChmaWxlRXh0ZW5zaW9uICE9PSAnLnRzJykge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aE5hbWUsIHsgZW5jb2Rpbmc6ICd1dGYtOCcgfSk7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxPcHRpb25zOiBJUmVsYXhlZFRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgZmlsZUNvbnRlbnRzLCBsYW5ndWFnZUlkLCBtb2RlbE9wdGlvbnMpKTtcblx0XHRcdFx0XHRjb25zdCBsaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdFx0XHRjb25zdCBlZGl0T3BlcmF0aW9uczogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAobGV0IGxpbmUgPSAxOyBsaW5lIDw9IGxpbmVDb3VudCAtIDE7IGxpbmUrKykge1xuXHRcdFx0XHRcdFx0Lypcblx0XHRcdFx0XHRcdE5PVEU6IFVuY29tbWVudCBpbiBvcmRlciB0byBpZ25vcmUgaW5jb3JyZWN0IEpTIERPQyBpbmRlbnRhdGlvblxuXHRcdFx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lKTtcblx0XHRcdFx0XHRcdGNvbnN0IHRyaW1tZWRMaW5lQ29udGVudCA9IGxpbmVDb250ZW50LnRyaW0oKTtcblx0XHRcdFx0XHRcdGlmICh0cmltbWVkTGluZUNvbnRlbnQubGVuZ3RoID09PSAwIHx8IHRyaW1tZWRMaW5lQ29udGVudC5zdGFydHNXaXRoKCcqJykgfHwgdHJpbW1lZExpbmVDb250ZW50LnN0YXJ0c1dpdGgoJy8qJykpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQqL1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lKTtcblx0XHRcdFx0XHRcdGNvbnN0IHRyaW1tZWRMaW5lQ29udGVudCA9IGxpbmVDb250ZW50LnRyaW0oKTtcblx0XHRcdFx0XHRcdGlmICh0cmltbWVkTGluZUNvbnRlbnQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgZWRpdE9wZXJhdGlvbiA9IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIGxpbmUsIGxpbmUgKyAxKTtcblx0XHRcdFx0XHRcdC8qXG5cdFx0XHRcdFx0XHROT1RFOiBVbmNvbW1lbnQgaW4gb3JkZXIgdG8gc2VlIGFjdHVhbCBpbmNvcnJlY3QgaW5kZW50YXRpb24gZGlmZlxuXHRcdFx0XHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0T3BlcmF0aW9uKTtcblx0XHRcdFx0XHRcdCovXG5cdFx0XHRcdFx0XHRlZGl0T3BlcmF0aW9ucy5wdXNoKC4uLmVkaXRPcGVyYXRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKGVkaXRPcGVyYXRpb25zKTtcblx0XHRcdFx0XHRtb2RlbC5hcHBseUVkaXRzKHRyaW1UcmFpbGluZ1doaXRlc3BhY2UobW9kZWwsIFtdLCB0cnVlKSk7XG5cdFx0XHRcdFx0ZnMud3JpdGVGaWxlU3luYyhmaWxlUGF0aE5hbWUsIG1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGRpcmVjdG9yeSBvZiBkaXJlY3Rvcmllc1RvUmVjdXJzZU9uKSB7XG5cdFx0XHRcdHdhbGtEaXJlY3RvcnlBbmRSZWluZGVudChkaXJlY3RvcnksIGxhbmd1YWdlSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHdhbGtEaXJlY3RvcnlBbmRSZWluZGVudCgnL1VzZXJzL2FpZGF5L0Rlc2t0b3AvVGVzdC92c2NvZGUtdGVzdCcsICd0cy10ZXN0Jyk7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gZXhlY1N5bmMoJ2NkIC9Vc2Vycy9haWRheS9EZXNrdG9wL1Rlc3QvdnNjb2RlLXRlc3QgJiYgZ2l0IGRpZmYgLS1zaG9ydHN0YXQnLCB7IGVuY29kaW5nOiAndXRmLTgnIH0pO1xuXHRcdGNvbnNvbGUubG9nKCdcXG5naXQgZGlmZiAtLXNob3J0c3RhdDpcXG4nLCBvdXRwdXQpO1xuXHR9KTtcblxuXHQvLyBVbml0IHRlc3RzIGZvciBpbmNyZWFzZSBhbmQgZGVjcmVhc2UgaW5kZW50IHBhdHRlcm5zLi4uXG5cblx0LyoqXG5cdCAqIEZpcnN0IGluY3JlYXNlIGluZGVudCBhbmQgZGVjcmVhc2UgaW5kZW50IHBhdHRlcm5zOlxuXHQgKlxuXHQgKiAtIGRlY3JlYXNlSW5kZW50UGF0dGVybjogL14oLipcXCpcXC8pP1xccypcXH0uKiQvXG5cdCAqICAtIEluIChodHRwczovL21hY3JvbWF0ZXMuY29tL21hbnVhbC9lbi9hcHBlbmRpeClcblx0ICogXHQgIEVpdGhlciB3ZSBoYXZlIHdoaXRlIHNwYWNlIGJlZm9yZSB0aGUgY2xvc2luZyBicmFja2V0LCBvciB3ZSBoYXZlIGEgbXVsdGkgbGluZSBjb21tZW50IGVuZGluZyBvbiB0aGF0IGxpbmUgZm9sbG93ZWQgYnkgd2hpdGVzcGFjZXNcblx0ICogICAgVGhpcyBpcyBmb2xsb3dlZCBieSBhbnkgY2hhcmFjdGVyLlxuXHQgKiAgICBUZXh0bWF0ZSBkZWNyZWFzZSBpbmRlbnQgcGF0dGVybiBpcyBhcyBmb2xsb3dzOiAvXiguKlxcKlxcLyk/XFxzKlxcfVs7XFxzXSokL1xuXHQgKiAgICBQcmVzdW1hYmx5IGFsbG93aW5nIG11bHRpIGxpbmUgY29tbWVudHMgZW5kaW5nIG9uIHRoYXQgbGluZSBpbXBsaWVzIHRoYXQgfSBpcyBpdHNlbGYgbm90IHBhcnQgb2YgYSBtdWx0aSBsaW5lIGNvbW1lbnRcblx0ICpcblx0ICogLSBpbmNyZWFzZUluZGVudFBhdHRlcm46IC9eLipcXHtbXn1cIiddKiQvXG5cdCAqICAtIEluIChodHRwczovL21hY3JvbWF0ZXMuY29tL21hbnVhbC9lbi9hcHBlbmRpeClcblx0ICogICAgVGhpcyByZWdleCBtZWFucyB0aGF0IHdlIGluY3JlYXNlIHRoZSBpbmRlbnQgd2hlbiB3ZSBoYXZlIGFueSBjaGFyYWN0ZXJzIGZvbGxvd2VkIGJ5IHRoZSBvcGVuaW5nIGJyYWNlLCBmb2xsb3dlZCBieSBjaGFyYWN0ZXJzXG5cdCAqICAgIGV4Y2VwdCBmb3IgY2xvc2luZyBicmFjZSB9LCBkb3VibGUgcXVvdGVzIFwiIG9yIHNpbmdsZSBxdW90ZSAnLlxuXHQgKiAgICBUaGUgfSBpcyBjaGVja2VkIGluIG9yZGVyIHRvIGF2b2lkIHRoZSBpbmRlbnRhdGlvbiBpbiB0aGUgZm9sbG93aW5nIGNhc2UgYGludCBhcnJbXSA9IHsgMSwgMiwgMyB9O2Bcblx0ICogICAgVGhlIGRvdWJsZSBxdW90ZSBhbmQgc2luZ2xlIHF1b3RlIGFyZSBjaGVja2VkIGluIG9yZGVyIHRvIGF2b2lkIHRoZSBpbmRlbnRhdGlvbiBpbiB0aGUgZm9sbG93aW5nIGNhc2U6IHN0ciA9IFwiZm9vIHtcIjtcblx0ICovXG5cblx0dGVzdCgnSXNzdWUgIzI1NDM3JywgKCkgPT4ge1xuXHRcdC8vIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjU0Mzdcblx0XHQvLyBmaXg6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2NvbW1pdC84YzgyYTZjNjE1ODU3NGUwOTg1NjFjMjhkNDcwNzExZjFiNDg0ZmM4XG5cdFx0Ly8gZXhwbGFuYXRpb246IHZhciBmb28gPSBge2A7IHNob3VsZCBub3QgaW5jcmVhc2UgaW5kZW50YXRpb25cblxuXHRcdC8vIGluY3JlYXNlSW5kZW50UGF0dGVybjogL14uKlxce1tefVwiJ10qJC8gLT4gL14uKlxce1tefVwiJ2BdKiQvXG5cblx0XHRjb25zdCBmaWxlQ29udGVudHMgPSBbXG5cdFx0XHQnY29uc3QgZm9vID0gYHtgOycsXG5cdFx0XHQnICAgICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRbXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogNSwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogNiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogOSwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMTAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDExLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0eyBzdGFydEluZGV4OiAxMiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDEzLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMTQsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdFx0eyBzdGFydEluZGV4OiAxNSwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMTYsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9XG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDQsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9XVxuXHRcdF07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyVG9rZW5pemF0aW9uU3VwcG9ydChpbnN0YW50aWF0aW9uU2VydmljZSwgdG9rZW5zLCBsYW5ndWFnZUlkKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVDb250ZW50cywgbGFuZ3VhZ2VJZCwgb3B0aW9ucykpO1xuXHRcdGZvcmNlVG9rZW5pemF0aW9uRnJvbUxpbmVUb0xpbmUobW9kZWwsIDEsIDIpO1xuXHRcdGNvbnN0IGVkaXRPcGVyYXRpb25zID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdE9wZXJhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSBlZGl0T3BlcmF0aW9uc1swXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldElSYW5nZShvcGVyYXRpb24ucmFuZ2UpLCB7XG5cdFx0XHQnc3RhcnRMaW5lTnVtYmVyJzogMixcblx0XHRcdCdzdGFydENvbHVtbic6IDEsXG5cdFx0XHQnZW5kTGluZU51bWJlcic6IDIsXG5cdFx0XHQnZW5kQ29sdW1uJzogNSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZXJhdGlvbi50ZXh0LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VucmljaGluZyB0aGUgaG92ZXInLCAoKSA9PiB7XG5cdFx0Ly8gaXNzdWU6IC1cblx0XHQvLyBmaXg6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2NvbW1pdC8xOWFlMDkzMmM0NWIxMDk2NDQzYThjMTMzNWNmMWUwMmViOTllMTZkXG5cdFx0Ly8gZXhwbGFuYXRpb246XG5cdFx0Ly8gIC0gZGVjcmVhc2UgaW5kZW50IG9uICkgYW5kIF0gYWxzb1xuXHRcdC8vICAtIGluY3JlYXNlIGluZGVudCBvbiAoIGFuZCBbIGFsc29cblxuXHRcdC8vIGRlY3JlYXNlSW5kZW50UGF0dGVybjogL14oLipcXCpcXC8pP1xccypcXH0uKiQvIC0+IC9eKC4qXFwqXFwvKT9cXHMqW1xcfVxcXVxcKV0uKiQvXG5cdFx0Ly8gaW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXi4qXFx7W159XCInYF0qJC8gLT4gL14uKihcXHtbXn1cIidgXSp8XFwoW14pXCInYF0qfFxcW1teXFxdXCInYF0qKSQvXG5cblx0XHRsZXQgZmlsZUNvbnRlbnRzID0gW1xuXHRcdFx0J2Z1bmN0aW9uIGZvbygnLFxuXHRcdFx0JyAgICBiYXI6IHN0cmluZycsXG5cdFx0XHQnICAgICl7fScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRsZXQgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVDb250ZW50cywgbGFuZ3VhZ2VJZCwgb3B0aW9ucykpO1xuXHRcdGxldCBlZGl0T3BlcmF0aW9ucyA9IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIDEsIG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRPcGVyYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0bGV0IG9wZXJhdGlvbiA9IGVkaXRPcGVyYXRpb25zWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0SVJhbmdlKG9wZXJhdGlvbi5yYW5nZSksIHtcblx0XHRcdCdzdGFydExpbmVOdW1iZXInOiAzLFxuXHRcdFx0J3N0YXJ0Q29sdW1uJzogMSxcblx0XHRcdCdlbmRMaW5lTnVtYmVyJzogMyxcblx0XHRcdCdlbmRDb2x1bW4nOiA1LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlcmF0aW9uLnRleHQsICcnKTtcblxuXHRcdGZpbGVDb250ZW50cyA9IFtcblx0XHRcdCdmdW5jdGlvbiBmb28oJyxcblx0XHRcdCdiYXI6IHN0cmluZycsXG5cdFx0XHQnKXt9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBmaWxlQ29udGVudHMsIGxhbmd1YWdlSWQsIG9wdGlvbnMpKTtcblx0XHRlZGl0T3BlcmF0aW9ucyA9IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIDEsIG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRPcGVyYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0b3BlcmF0aW9uID0gZWRpdE9wZXJhdGlvbnNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRJUmFuZ2Uob3BlcmF0aW9uLnJhbmdlKSwge1xuXHRcdFx0J3N0YXJ0TGluZU51bWJlcic6IDIsXG5cdFx0XHQnc3RhcnRDb2x1bW4nOiAxLFxuXHRcdFx0J2VuZExpbmVOdW1iZXInOiAyLFxuXHRcdFx0J2VuZENvbHVtbic6IDEsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVyYXRpb24udGV4dCwgJyAgICAnKTtcblx0fSk7XG5cblx0dGVzdCgnSXNzdWUgIzg2MTc2JywgKCkgPT4ge1xuXHRcdC8vIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODYxNzZcblx0XHQvLyBmaXg6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2NvbW1pdC9kODllMmUxN2E1ZDFiYTM3Yzk5YjFkMzkyOWViNjE4MGE1YmZjN2E4XG5cdFx0Ly8gZXhwbGFuYXRpb246IFdoZW4gcXVvdGF0aW9uIG1hcmtzIGFyZSBwcmVzZW50IG9uIHRoZSBmaXJzdCBsaW5lIG9mIGFuIGlmIHN0YXRlbWVudCBvciBmb3IgbG9vcCwgZm9sbG93aW5nIGxpbmUgc2hvdWxkIG5vdCBiZSBpbmRlbnRlZFxuXG5cdFx0Ly8gaW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXigoPyFcXC9cXC8pLikqKFxce1tefVwiJ2BdKnxcXChbXilcIidgXSp8XFxbW15cXF1cIidgXSopJC8gLT4gL14oKD8hXFwvXFwvKS4pKihcXHsoW159XCInYF0qfChcXHR8WyBdKSpcXC9cXC8uKil8XFwoW14pXCInYF0qfFxcW1teXFxdXCInYF0qKSQvXG5cdFx0Ly8gZXhwbGFuYXRpb246IGFmdGVyIG9wZW4gYnJhY2UsIGRvIG5vdCBkZWNyZWFzZSBpbmRlbnQgaWYgaXQgaXMgZm9sbG93ZWQgb24gdGhlIHNhbWUgbGluZSBieSBcIjx3aGl0ZXNwYWNlIGNoYXJhY3RlcnM+IC8vIDxhbnkgY2hhcmFjdGVycz5cIlxuXHRcdC8vIHRvZG9AYWlkYXktbWFyOiBzaG91bGQgYWxzbyBhcHBseSBmb3Igd2hlbiBpdCBmb2xsb3dzICggYW5kIFtcblxuXHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IFtcblx0XHRcdGBpZiAoKSB7IC8vICdgLFxuXHRcdFx0YHggPSA0YCxcblx0XHRcdGB9YFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVDb250ZW50cywgbGFuZ3VhZ2VJZCwgb3B0aW9ucykpO1xuXHRcdGNvbnN0IGVkaXRPcGVyYXRpb25zID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdE9wZXJhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSBlZGl0T3BlcmF0aW9uc1swXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldElSYW5nZShvcGVyYXRpb24ucmFuZ2UpLCB7XG5cdFx0XHQnc3RhcnRMaW5lTnVtYmVyJzogMixcblx0XHRcdCdzdGFydENvbHVtbic6IDEsXG5cdFx0XHQnZW5kTGluZU51bWJlcic6IDIsXG5cdFx0XHQnZW5kQ29sdW1uJzogMSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZXJhdGlvbi50ZXh0LCAnICAgICcpO1xuXHR9KTtcblxuXHR0ZXN0KCdJc3N1ZSAjMTQxODE2JywgKCkgPT4ge1xuXG5cdFx0Ly8gaXNzdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDE4MTZcblx0XHQvLyBmaXg6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTQxOTk3L2ZpbGVzXG5cdFx0Ly8gZXhwbGFuYXRpb246IGlmICgsIFssIHssIGlzIGZvbGxvd2VkIGJ5IGEgZm9yd2FyZCBzbGFzaCB0aGVuIGFzc3VtZSB3ZSBhcmUgaW4gYSByZWdleCBwYXR0ZXJuLCBhbmQgZG8gbm90IGluZGVudFxuXG5cdFx0Ly8gaW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXigoPyFcXC9cXC8pLikqKFxceyhbXn1cIidgXSp8KFxcdHxbIF0pKlxcL1xcLy4qKXxcXChbXilcIidgXSp8XFxbW15cXF1cIidgXSopJC8gLT4gL14oKD8hXFwvXFwvKS4pKihcXHsoW159XCInYC9dKnwoXFx0fFsgXSkqXFwvXFwvLiopfFxcKFteKVwiJ2AvXSp8XFxbW15cXF1cIidgL10qKSQvXG5cdFx0Ly8gLT4gRmluYWwgY3VycmVudCBpbmNyZWFzZSBpbmRlbnQgcGF0dGVybiBhdCBvZiB3cml0aW5nXG5cblx0XHRjb25zdCBmaWxlQ29udGVudHMgPSBbXG5cdFx0XHQnY29uc3QgciA9IC97LzsnLFxuXHRcdFx0JyAgICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRbXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogNSwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogNiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogNywgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogOCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogOSwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlJlZ0V4IH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMTAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5SZWdFeCB9LFxuXHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDExLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuUmVnRXggfSxcblx0XHRcdFx0eyBzdGFydEluZGV4OiAxMiwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlJlZ0V4IH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMTMsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciB9LFxuXHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDE0LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfSxcblx0XHRcdFx0eyBzdGFydEluZGV4OiA0LCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgfVxuXHRcdFx0XVxuXHRcdF07XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyVG9rZW5pemF0aW9uU3VwcG9ydChpbnN0YW50aWF0aW9uU2VydmljZSwgdG9rZW5zLCBsYW5ndWFnZUlkKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVDb250ZW50cywgbGFuZ3VhZ2VJZCwgb3B0aW9ucykpO1xuXHRcdGZvcmNlVG9rZW5pemF0aW9uRnJvbUxpbmVUb0xpbmUobW9kZWwsIDEsIDIpO1xuXHRcdGNvbnN0IGVkaXRPcGVyYXRpb25zID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdE9wZXJhdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSBlZGl0T3BlcmF0aW9uc1swXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldElSYW5nZShvcGVyYXRpb24ucmFuZ2UpLCB7XG5cdFx0XHQnc3RhcnRMaW5lTnVtYmVyJzogMixcblx0XHRcdCdzdGFydENvbHVtbic6IDEsXG5cdFx0XHQnZW5kTGluZU51bWJlcic6IDIsXG5cdFx0XHQnZW5kQ29sdW1uJzogNCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZXJhdGlvbi50ZXh0LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0lzc3VlICMyOTg4NicsICgpID0+IHtcblx0XHQvLyBpc3N1ZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI5ODg2XG5cdFx0Ly8gZml4OiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9jb21taXQvNzkxMGIzZDdiYWI4YTcyMWFhZTk4ZGMwNWFmMGI1ZTFlYTlkOTc4MlxuXG5cdFx0Ly8gZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXiguKlxcKlxcLyk/XFxzKltcXH1cXF1cXCldLiokLyAtPiAvXigoPyEuKj9cXC9cXCopLipcXCpcXC8pP1xccypbXFx9XFxdXFwpXS4qJC9cblx0XHQvLyAtPiBGaW5hbCBjdXJyZW50IGRlY3JlYXNlIGluZGVudCBwYXR0ZXJuIGF0IHRoZSB0aW1lIG9mIHdyaXRpbmdcblxuXHRcdC8vIGV4cGxhbmF0aW9uOiBQb3NpdGl2ZSBsb29rYWhlYWQ6ICg/PSBcdTAwQUJwYXR0ZXJuXHUwMEJCKSBtYXRjaGVzIGlmIHBhdHRlcm4gbWF0Y2hlcyB3aGF0IGNvbWVzIGFmdGVyIHRoZSBjdXJyZW50IGxvY2F0aW9uIGluIHRoZSBpbnB1dCBzdHJpbmcuXG5cdFx0Ly8gTmVnYXRpdmUgbG9va2FoZWFkOiAoPyEgXHUwMEFCcGF0dGVyblx1MDBCQikgbWF0Y2hlcyBpZiBwYXR0ZXJuIGRvZXMgbm90IG1hdGNoIHdoYXQgY29tZXMgYWZ0ZXIgdGhlIGN1cnJlbnQgbG9jYXRpb24gaW4gdGhlIGlucHV0IHN0cmluZ1xuXHRcdC8vIFRoZSBjaGFuZ2UgcHJvcG9zZWQgaXMgdG8gbm90IGRlY3JlYXNlIHRoZSBpbmRlbnQgaWYgdGhlcmUgaXMgYSBtdWx0aS1saW5lIGNvbW1lbnQgZW5kaW5nIG9uIHRoZSBzYW1lIGxpbmUgYmVmb3JlIHRoZSBjbG9zaW5nIHBhcmVudGhlc2VzXG5cblx0XHRjb25zdCBmaWxlQ29udGVudHMgPSBbXG5cdFx0XHQnZnVuY3Rpb24gZm9vKCkgeycsXG5cdFx0XHQnICAgIGJhcigvKiAgKi8pJyxcblx0XHRcdCd9OycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgZmlsZUNvbnRlbnRzLCBsYW5ndWFnZUlkLCBvcHRpb25zKSk7XG5cdFx0Y29uc3QgZWRpdE9wZXJhdGlvbnMgPSBnZXRSZWluZGVudEVkaXRPcGVyYXRpb25zKG1vZGVsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0T3BlcmF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdJc3N1ZSAjMjA5ODU5OiBkbyBub3QgZG8gcmVpbmRlbnRhdGlvbiBmb3IgdG9rZW5zIGluc2lkZSBvZiBhIHN0cmluZycsICgpID0+IHtcblxuXHRcdC8vIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjA5ODU5XG5cblx0XHRjb25zdCB0b2tlbnM6IFN0YW5kYXJkVG9rZW5UeXBlRGF0YVtdW10gPSBbXG5cdFx0XHRbXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyIH0sXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMTIsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdHsgc3RhcnRJbmRleDogMCwgc3RhbmRhcmRUb2tlblR5cGU6IFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyB9LFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyBzdGFydEluZGV4OiAwLCBzdGFuZGFyZFRva2VuVHlwZTogU3RhbmRhcmRUb2tlblR5cGUuU3RyaW5nIH0sXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHN0YW5kYXJkVG9rZW5UeXBlOiBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcgfSxcblx0XHRcdF1cblx0XHRdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclRva2VuaXphdGlvblN1cHBvcnQoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRva2VucywgbGFuZ3VhZ2VJZCkpO1xuXHRcdGNvbnN0IGZpbGVDb250ZW50cyA9IFtcblx0XHRcdCdjb25zdCBmb28gPSBgc29tZSB0ZXh0Jyxcblx0XHRcdCcgICAgICAgICB3aGljaCBpcyBzdHJhbmdlbHknLFxuXHRcdFx0JyAgICBpbmRlbnRlZC4gSXQgc2hvdWxkJyxcblx0XHRcdCcgICBub3QgYmUgcmVpbmRlbnRlZC5gJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVDb250ZW50cywgbGFuZ3VhZ2VJZCwgb3B0aW9ucykpO1xuXHRcdGZvcmNlVG9rZW5pemF0aW9uRnJvbUxpbmVUb0xpbmUobW9kZWwsIDEsIDQpO1xuXHRcdGNvbnN0IGVkaXRPcGVyYXRpb25zID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdE9wZXJhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gRmFpbGluZyB0ZXN0cyBpbmZlcnJlZCBmcm9tIHRoZSBjdXJyZW50IHJlZ2V4ZXMuLi5cblxuXHR0ZXN0LnNraXAoJ0luY29ycmVjdCBkZWluZGVudGF0aW9uIGFmdGVyIGAqL31gIHN0cmluZycsICgpID0+IHtcblxuXHRcdC8vIGV4cGxhbmF0aW9uOiBJZiAqLyB3YXMgbm90IGJlZm9yZSB0aGUgfSwgdGhlIHJlZ2V4IGRvZXMgbm90IGFsbG93IGNoYXJhY3RlcnMgYmVmb3JlIHRoZSB9LCBzbyB0aGVyZSB3b3VsZCBub3QgYmUgYW4gaW5kZW50XG5cdFx0Ly8gSGVyZSBzaW5jZSB0aGVyZSBpcyAqLyBiZWZvcmUgdGhlIH0sIHRoZSByZWdleCBhbGxvd3MgYWxsIHRoZSBjaGFyYWN0ZXJzIGJlZm9yZSwgaGVuY2UgdGhlcmUgaXMgYSBkZWluZGVudFxuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gW1xuXHRcdFx0YGNvbnN0IG9iaiA9IHtgLFxuXHRcdFx0YCAgICBvYmoxOiB7YCxcblx0XHRcdGAgICAgICAgIGJyYWNlIDogJyovfSdgLFxuXHRcdFx0YCAgICB9YCxcblx0XHRcdGB9YCxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBmaWxlQ29udGVudHMsIGxhbmd1YWdlSWQsIG9wdGlvbnMpKTtcblx0XHRjb25zdCBlZGl0T3BlcmF0aW9ucyA9IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIDEsIG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRPcGVyYXRpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdC8vIEZhaWxpbmcgdGVzdHMgZnJvbSBpc3N1ZXMuLi5cblxuXHR0ZXN0LnNraXAoJ0lzc3VlICM1NjI3NScsICgpID0+IHtcblxuXHRcdC8vIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTYyNzVcblx0XHQvLyBleHBsYW5hdGlvbjogSWYgKi8gd2FzIG5vdCBiZWZvcmUgdGhlIH0sIHRoZSByZWdleCBkb2VzIG5vdCBhbGxvdyBjaGFyYWN0ZXJzIGJlZm9yZSB0aGUgfSwgc28gdGhlcmUgd291bGQgbm90IGJlIGFuIGluZGVudFxuXHRcdC8vIEhlcmUgc2luY2UgdGhlcmUgaXMgKi8gYmVmb3JlIHRoZSB9LCB0aGUgcmVnZXggYWxsb3dzIGFsbCB0aGUgY2hhcmFjdGVycyBiZWZvcmUsIGhlbmNlIHRoZXJlIGlzIGEgZGVpbmRlbnRcblxuXHRcdGxldCBmaWxlQ29udGVudHMgPSBbXG5cdFx0XHQnZnVuY3Rpb24gZm9vKCkgeycsXG5cdFx0XHQnICAgIHZhciBiYXIgPSAoL2IqLyk7Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGxldCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgZmlsZUNvbnRlbnRzLCBsYW5ndWFnZUlkLCBvcHRpb25zKSk7XG5cdFx0bGV0IGVkaXRPcGVyYXRpb25zID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdE9wZXJhdGlvbnMubGVuZ3RoLCAwKTtcblxuXHRcdGZpbGVDb250ZW50cyA9IFtcblx0XHRcdCdmdW5jdGlvbiBmb28oKSB7Jyxcblx0XHRcdCcgICAgdmFyIGJhciA9IFwiL2IqLylcIjsnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0bW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIGZpbGVDb250ZW50cywgbGFuZ3VhZ2VJZCwgb3B0aW9ucykpO1xuXHRcdGVkaXRPcGVyYXRpb25zID0gZ2V0UmVpbmRlbnRFZGl0T3BlcmF0aW9ucyhtb2RlbCwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgMSwgbW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdE9wZXJhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdJc3N1ZSAjMTE2ODQzJywgKCkgPT4ge1xuXG5cdFx0Ly8gaXNzdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTY4NDNcblx0XHQvLyByZWxhdGVkOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNDMyNDRcblx0XHQvLyBleHBsYW5hdGlvbjogV2hlbiB5b3UgaGF2ZSBhbiBhcnJvdyBmdW5jdGlvbiwgeW91IGRvbid0IGhhdmUgeyBvciB9LCBidXQgeW91IHdvdWxkIGV4cGVjdCBpbmRlbnRhdGlvbiB0byBzdGlsbCBiZSBkb25lIGluIHRoYXQgd2F5XG5cblx0XHQvLyBUT0RPOiByZXF1aXJlcyBleHBsb3JpbmcgaW5kZW50L291dGRlbnQgcGFpcnMgaW5zdGVhZFxuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gW1xuXHRcdFx0J2NvbnN0IGFkZDEgPSAobikgPT4nLFxuXHRcdFx0J1x0biArIDE7Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBmaWxlQ29udGVudHMsIGxhbmd1YWdlSWQsIG9wdGlvbnMpKTtcblx0XHRjb25zdCBlZGl0T3BlcmF0aW9ucyA9IGdldFJlaW5kZW50RWRpdE9wZXJhdGlvbnMobW9kZWwsIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsIDEsIG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRPcGVyYXRpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnSXNzdWUgIzE4NTI1MicsICgpID0+IHtcblxuXHRcdC8vIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTg1MjUyXG5cdFx0Ly8gZXhwbGFuYXRpb246IFJlaW5kZW50aW5nIHRoZSBjb21tZW50IGNvcnJlY3RseVxuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gW1xuXHRcdFx0Jy8qJyxcblx0XHRcdCcgKiBUaGlzIGlzIGEgY29tbWVudC4nLFxuXHRcdFx0JyAqLycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgZmlsZUNvbnRlbnRzLCBsYW5ndWFnZUlkLCBvcHRpb25zKSk7XG5cdFx0Y29uc3QgZWRpdE9wZXJhdGlvbnMgPSBnZXRSZWluZGVudEVkaXRPcGVyYXRpb25zKG1vZGVsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0T3BlcmF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ0lzc3VlIDQzMjQ0OiBpbmNvcnJlY3QgaW5kZW50YXRpb24gd2hlbiBzaWduYXR1cmUgb2YgZnVuY3Rpb24gY2FsbCBzcGFucyBzZXZlcmFsIGxpbmVzJywgKCkgPT4ge1xuXG5cdFx0Ly8gaXNzdWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MzI0NFxuXG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gW1xuXHRcdFx0J2Z1bmN0aW9uIGNhbGxTb21lT3RoZXJGdW5jdGlvbihvbmU6IG51bWJlciwgdHdvOiBudW1iZXIpIHsgfScsXG5cdFx0XHQnZnVuY3Rpb24gc29tZUZ1bmN0aW9uKCkgeycsXG5cdFx0XHQnICAgIGNhbGxTb21lT3RoZXJGdW5jdGlvbig0LCcsXG5cdFx0XHQnICAgICAgICA1KScsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgZmlsZUNvbnRlbnRzLCBsYW5ndWFnZUlkLCBvcHRpb25zKSk7XG5cdFx0Y29uc3QgZWRpdE9wZXJhdGlvbnMgPSBnZXRSZWluZGVudEVkaXRPcGVyYXRpb25zKG1vZGVsLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0T3BlcmF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsU0FBUyxZQUFZO0FBQzlCLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlDQUFpQztBQUMxQyxTQUEyQyxxQkFBcUIsNEJBQTRCO0FBRTVGLFNBQWlDLHdDQUF3QztBQUN6RSxTQUFTLGFBQWE7QUFHdEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywyQkFBeUQsNEJBQTRCO0FBQzlGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUVsRCxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLFVBQVUsT0FBdUI7QUFDekMsU0FBTztBQUFBLElBQ04saUJBQWlCLE1BQU07QUFBQSxJQUN2QixhQUFhLE1BQU07QUFBQSxJQUNuQixlQUFlLE1BQU07QUFBQSxJQUNyQixXQUFXLE1BQU07QUFBQSxFQUNsQjtBQUNEO0FBRUEsSUFBVyxhQUFYLGtCQUFXQSxnQkFBWDtBQUNDLEVBQUFBLFlBQUEsZ0JBQWE7QUFESCxTQUFBQTtBQUFBLEdBQUE7QUFJWCxTQUFTLGdDQUFnQyxPQUFtQixXQUFtQixTQUF1QjtBQUNyRyxXQUFTLE9BQU8sV0FBVyxRQUFRLFNBQVMsUUFBUTtBQUNuRCxVQUFNLGFBQWEs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aUIsMEJBQTBCLE9BQU8sOEJBQThCLEdBQUcsTUFBTSxhQUFhLENBQUM7QUFDM0csV0FBTyxnQkFBZ0IsZUFBZSxRQUFRLENBQUM7QUFFL0MsbUJBQWU7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsWUFBUSxZQUFZLElBQUkscUJBQXFCLHNCQUFzQixjQUFjLFlBQVksT0FBTyxDQUFDO0FBQ3JHLHFCQUFpQiwwQkFBMEIsT0FBTyw4QkFBOEIsR0FBRyxNQUFNLGFBQWEsQ0FBQztBQUN2RyxXQUFPLGdCQUFnQixlQUFlLFFBQVEsQ0FBQztBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLEtBQUssaUJBQWlCLE1BQU07QUFRaEMsVUFBTSxlQUFlO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFVBQU0sUUFBUSxZQUFZLElBQUkscUJBQXFCLHNCQUFzQixjQUFjLFlBQVksT0FBTyxDQUFDO0FBQzNHLFVBQU0saUJBQWlCLDBCQUEwQixPQUFPLDhCQUE4QixHQUFHLE1BQU0sYUFBYSxDQUFDO0FBQzdHLFdBQU8sZ0JBQWdCLGVBQWUsUUFBUSxDQUFDO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssS0FBSyxpQkFBaUIsTUFBTTtBQUtoQyxVQUFNLGVBQWU7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUNYLFVBQU0sUUFBUSxZQUFZLElBQUkscUJBQXFCLHNCQUFzQixjQUFjLFlBQVksT0FBTyxDQUFDO0FBQzNHLFVBQU0saUJBQWlCLDBCQUEwQixPQUFPLDhCQUE4QixHQUFHLE1BQU0sYUFBYSxDQUFDO0FBQzdHLFdBQU8sZ0JBQWdCLGVBQWUsUUFBUSxDQUFDO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssS0FBSywwRkFBMEYsTUFBTTtBQUl6RyxVQUFNLGVBQWU7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJO0FBQ1gsVUFBTSxRQUFRLFlBQVksSUFBSSxxQkFBcUIsc0JBQXNCLGNBQWMsWUFBWSxPQUFPLENBQUM7QUFDM0csVUFBTSxpQkFBaUIsMEJBQTBCLE9BQU8sOEJBQThCLEdBQUcsTUFBTSxhQUFhLENBQUM7QUFDN0csV0FBTyxnQkFBZ0IsZUFBZSxRQUFRLENBQUM7QUFBQSxFQUNoRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiTGFuZ3VhZ2VJZCIsICJsYW5ndWFnZUlkIiwgImRpcmVjdG9yeSJdCn0K
