import assert from "assert";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { transaction } from "../../../../../base/common/observable.js";
import { isDefined } from "../../../../../base/common/types.js";
import { linesDiffComputers } from "../../../../../editor/common/diff/linesDiffComputers.js";
import { EndOfLinePreference } from "../../../../../editor/common/model.js";
import { createModelServices, createTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { toLineRange, toRangeMapping } from "../../browser/model/diffComputer.js";
import { DetailedLineRangeMapping } from "../../browser/model/mapping.js";
import { MergeEditorModel } from "../../browser/model/mergeEditorModel.js";
import { MergeEditorTelemetry } from "../../browser/telemetry.js";
suite("merge editor model", () => {
  test("prepend line", async () => {
    await testMergeModel(
      {
        "languageId": "plaintext",
        "base": "line1\nline2",
        "input1": "0\nline1\nline2",
        "input2": "0\nline1\nline2",
        "result": ""
      },
      (model) => {
        assert.deepStrictEqual(model.getProjections(), {
          base: ["\u27E6\u27E7\u2080line1", "line2"],
          input1: ["\u27E60", "\u27E7\u2080line1", "line2"],
          input2: ["\u27E60", "\u27E7\u2080line1", "line2"],
          result: ["\u27E6\u27E7{unrecognized}\u2080"]
        });
        model.toggleConflict(0, 1);
        assert.deepStrictEqual(
          { result: model.getResult() },
          { result: "0\nline1\nline2" }
        );
        model.toggleConflict(0, 2);
        assert.deepStrictEqual(
          { result: model.getResult() },
          { result: "0\n0\nline1\nline2" }
        );
      }
    );
  });
  test("empty base", async () => {
    await testMergeModel(
      {
        "languageId": "plaintext",
        "base": "",
        "input1": "input1",
        "input2": "input2",
        "result": ""
      },
      (model) => {
        assert.deepStrictEqual(model.getProjections(), {
          base: ["\u27E6\u27E7\u2080"],
          input1: ["\u27E6input1\u27E7\u2080"],
          input2: ["\u27E6input2\u27E7\u2080"],
          result: ["\u27E6\u27E7{base}\u2080"]
        });
        model.toggleConflict(0, 1);
        assert.deepStrictEqual(
          { result: model.getResult() },
          { result: "input1" }
        );
        model.toggleConflict(0, 2);
        assert.deepStrictEqual(
          { result: model.getResult() },
          { result: "input2" }
        );
      }
    );
  });
  test("can merge word changes", async () => {
    await testMergeModel(
      {
        "languageId": "plaintext",
        "base": "hello",
        "input1": "hallo",
        "input2": "helloworld",
        "result": ""
      },
      (model) => {
        assert.deepStrictEqual(model.getProjections(), {
          base: ["\u27E6hello\u27E7\u2080"],
          input1: ["\u27E6hallo\u27E7\u2080"],
          input2: ["\u27E6helloworld\u27E7\u2080"],
          result: ["\u27E6\u27E7{unrecognized}\u2080"]
        });
        model.toggleConflict(0, 1);
        model.toggleConflict(0, 2);
        assert.deepStrictEqual(
          { result: model.getResult() },
          { result: "halloworld" }
        );
      }
    );
  });
  test("can combine insertions at end of document", async () => {
    await testMergeModel(
      {
        "languageId": "plaintext",
        "base": "Z\xFCrich\nBern\nBasel\nChur\nGenf\nThun",
        "input1": "Z\xFCrich\nBern\nChur\nDavos\nGenf\nThun\nfunction f(b:boolean) {}",
        "input2": "Z\xFCrich\nBern\nBasel (FCB)\nChur\nGenf\nThun\nfunction f(a:number) {}",
        "result": "Z\xFCrich\nBern\nBasel\nChur\nDavos\nGenf\nThun"
      },
      (model) => {
        assert.deepStrictEqual(model.getProjections(), {
          base: ["Z\xFCrich", "Bern", "\u27E6Basel", "\u27E7\u2080Chur", "\u27E6\u27E7\u2081Genf", "Thun\u27E6\u27E7\u2082"],
          input1: [
            "Z\xFCrich",
            "Bern",
            "\u27E6\u27E7\u2080Chur",
            "\u27E6Davos",
            "\u27E7\u2081Genf",
            "Thun",
            "\u27E6function f(b:boolean) {}\u27E7\u2082"
          ],
          input2: [
            "Z\xFCrich",
            "Bern",
            "\u27E6Basel (FCB)",
            "\u27E7\u2080Chur",
            "\u27E6\u27E7\u2081Genf",
            "Thun",
            "\u27E6function f(a:number) {}\u27E7\u2082"
          ],
          result: [
            "Z\xFCrich",
            "Bern",
            "\u27E6Basel",
            "\u27E7{base}\u2080Chur",
            "\u27E6Davos",
            "\u27E7{1\u2713}\u2081Genf",
            "Thun\u27E6\u27E7{base}\u2082"
          ]
        });
        model.toggleConflict(2, 1);
        model.toggleConflict(2, 2);
        assert.deepStrictEqual(
          { result: model.getResult() },
          {
            result: "Z\xFCrich\nBern\nBasel\nChur\nDavos\nGenf\nThun\nfunction f(b:boolean) {}\nfunction f(a:number) {}"
          }
        );
      }
    );
  });
  test("conflicts are reset", async () => {
    await testMergeModel(
      {
        "languageId": "typescript",
        "base": `import { h } from 'vs/base/browser/dom';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
`,
        "input1": `import { h } from 'vs/base/browser/dom';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { observableSignalFromEvent } from 'vs/base/common/observable';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
`,
        "input2": `import { h } from 'vs/base/browser/dom';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';
`,
        "result": `import { h } from 'vs/base/browser/dom';\r
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';\r
import { observableSignalFromEvent } from 'vs/base/common/observable';\r
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';\r
<<<<<<< Updated upstream\r
import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';\r
=======\r
import { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';\r
>>>>>>> Stashed changes\r
import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';\r
`
      },
      (model) => {
        assert.deepStrictEqual(model.getProjections(), {
          base: [
            `import { h } from 'vs/base/browser/dom';`,
            `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
            `\u27E6\u27E7\u2080import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
            `\u27E6import { EditorOption } from 'vs/editor/common/config/editorOptions';`,
            `import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';`,
            `\u27E7\u2081import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
            ""
          ],
          input1: [
            `import { h } from 'vs/base/browser/dom';`,
            `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
            `\u27E6import { observableSignalFromEvent } from 'vs/base/common/observable';`,
            `\u27E7\u2080import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
            `\u27E6import { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';`,
            `\u27E7\u2081import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
            ""
          ],
          input2: [
            `import { h } from 'vs/base/browser/dom';`,
            `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
            `\u27E6\u27E7\u2080import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
            `\u27E6import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';`,
            `\u27E7\u2081import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
            ""
          ],
          result: [
            `import { h } from 'vs/base/browser/dom';`,
            `import { Disposable, IDisposable } from 'vs/base/common/lifecycle';`,
            `\u27E6import { observableSignalFromEvent } from 'vs/base/common/observable';`,
            `\u27E7{1\u2713}\u2080import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';`,
            "\u27E6<<<<<<< Updated upstream",
            `import { autorun, IReader, observableFromEvent, ObservableValue } from 'vs/workbench/contrib/audioCues/browser/observable';`,
            "=======",
            `import { autorun, IReader, observableFromEvent } from 'vs/workbench/contrib/audioCues/browser/observable';`,
            ">>>>>>> Stashed changes",
            `\u27E7{unrecognized}\u2081import { LineRange } from 'vs/workbench/contrib/mergeEditor/browser/model/lineRange';`,
            ""
          ]
        });
      }
    );
  });
  test("auto-solve equal edits", async () => {
    await testMergeModel(
      {
        "languageId": "javascript",
        "base": `const { readFileSync } = require('fs');

let paths = process.argv.slice(2);
main(paths);

function main(paths) {
    // print the welcome message
    printMessage();

    let data = getLineCountInfo(paths);
    console.log("Lines: " + data.totalLineCount);
}

/**
 * Prints the welcome message
*/
function printMessage() {
    console.log("Welcome To Line Counter");
}

/**
 * @param {string[]} paths
*/
function getLineCountInfo(paths) {
    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));
    return {
        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),
        lineCounts,
    };
}

/**
 * @param {string} str
 */
function getLinesLength(str) {
    return str.split('\\n').length;
}
`,
        "input1": `const { readFileSync } = require('fs');

let paths = process.argv.slice(2);
main(paths);

function main(paths) {
    // print the welcome message
    printMessage();

    const data = getLineCountInfo(paths);
    console.log("Lines: " + data.totalLineCount);
}

function printMessage() {
    console.log("Welcome To Line Counter");
}

/**
 * @param {string[]} paths
*/
function getLineCountInfo(paths) {
    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));
    return {
        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),
        lineCounts,
    };
}

/**
 * @param {string} str
 */
function getLinesLength(str) {
    return str.split('\\n').length;
}
`,
        "input2": `const { readFileSync } = require('fs');

let paths = process.argv.slice(2);
run(paths);

function run(paths) {
    // print the welcome message
    printMessage();

    const data = getLineCountInfo(paths);
    console.log("Lines: " + data.totalLineCount);
}

function printMessage() {
    console.log("Welcome To Line Counter");
}

/**
 * @param {string[]} paths
*/
function getLineCountInfo(paths) {
    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));
    return {
        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),
        lineCounts,
    };
}

/**
 * @param {string} str
 */
function getLinesLength(str) {
    return str.split('\\n').length;
}
`,
        "result": "<<<<<<< uiae\n>>>>>>> Stashed changes",
        resetResult: true
      },
      async (model) => {
        await model.mergeModel.reset();
        assert.deepStrictEqual(model.getResult(), `const { readFileSync } = require('fs');

let paths = process.argv.slice(2);
run(paths);

function run(paths) {
    // print the welcome message
    printMessage();

    const data = getLineCountInfo(paths);
    console.log("Lines: " + data.totalLineCount);
}

function printMessage() {
    console.log("Welcome To Line Counter");
}

/**
 * @param {string[]} paths
*/
function getLineCountInfo(paths) {
    let lineCounts = paths.map(path => ({ path, count: getLinesLength(readFileSync(path, 'utf8')) }));
    return {
        totalLineCount: lineCounts.reduce((acc, { count }) => acc + count, 0),
        lineCounts,
    };
}

/**
 * @param {string} str
 */
function getLinesLength(str) {
    return str.split('\\n').length;
}
`);
      }
    );
  });
});
async function testMergeModel(options, fn) {
  const disposables = new DisposableStore();
  const modelInterface = disposables.add(
    new MergeModelInterface(options, createModelServices(disposables))
  );
  await modelInterface.mergeModel.onInitialized;
  await fn(modelInterface);
  disposables.dispose();
}
function toSmallNumbersDec(value) {
  const smallNumbers = ["\u2080", "\u2081", "\u2082", "\u2083", "\u2084", "\u2085", "\u2086", "\u2087", "\u2088", "\u2089"];
  return value.toString().split("").map((c) => smallNumbers[parseInt(c)]).join("");
}
class MergeModelInterface extends Disposable {
  constructor(options, instantiationService) {
    super();
    const input1TextModel = this._register(createTextModel(options.input1, options.languageId));
    const input2TextModel = this._register(createTextModel(options.input2, options.languageId));
    const baseTextModel = this._register(createTextModel(options.base, options.languageId));
    const resultTextModel = this._register(createTextModel(options.result, options.languageId));
    const diffComputer = {
      async computeDiff(textModel1, textModel2, reader) {
        const result = await linesDiffComputers.getLegacy().computeDiff(
          textModel1.getLinesContent(),
          textModel2.getLinesContent(),
          { ignoreTrimWhitespace: false, maxComputationTimeMs: 1e4, computeMoves: false }
        );
        const changes = result.changes.map(
          (c) => new DetailedLineRangeMapping(
            toLineRange(c.original),
            textModel1,
            toLineRange(c.modified),
            textModel2,
            c.innerChanges?.map((ic) => toRangeMapping(ic)).filter(isDefined)
          )
        );
        return {
          diffs: changes
        };
      }
    };
    this.mergeModel = this._register(instantiationService.createInstance(
      MergeEditorModel,
      baseTextModel,
      {
        textModel: input1TextModel,
        description: "",
        detail: "",
        title: ""
      },
      {
        textModel: input2TextModel,
        description: "",
        detail: "",
        title: ""
      },
      resultTextModel,
      diffComputer,
      {
        resetResult: options.resetResult || false
      },
      new MergeEditorTelemetry(NullTelemetryService)
    ));
  }
  getProjections() {
    function applyRanges(textModel, ranges) {
      textModel.applyEdits(ranges.map(({ range, label }) => ({
        range,
        text: `\u27E6${textModel.getValueInRange(range)}\u27E7${label}`
      })));
    }
    const baseRanges = this.mergeModel.modifiedBaseRanges.get();
    const baseTextModel = createTextModel(this.mergeModel.base.getValue());
    applyRanges(
      baseTextModel,
      baseRanges.map((r, idx) => ({
        range: r.baseRange.toExclusiveRange(),
        label: toSmallNumbersDec(idx)
      }))
    );
    const input1TextModel = createTextModel(this.mergeModel.input1.textModel.getValue());
    applyRanges(
      input1TextModel,
      baseRanges.map((r, idx) => ({
        range: r.input1Range.toExclusiveRange(),
        label: toSmallNumbersDec(idx)
      }))
    );
    const input2TextModel = createTextModel(this.mergeModel.input2.textModel.getValue());
    applyRanges(
      input2TextModel,
      baseRanges.map((r, idx) => ({
        range: r.input2Range.toExclusiveRange(),
        label: toSmallNumbersDec(idx)
      }))
    );
    const resultTextModel = createTextModel(this.mergeModel.resultTextModel.getValue());
    applyRanges(
      resultTextModel,
      baseRanges.map((r, idx) => ({
        range: this.mergeModel.getLineRangeInResult(r.baseRange).toExclusiveRange(),
        label: `{${this.mergeModel.getState(r).get()}}${toSmallNumbersDec(idx)}`
      }))
    );
    const result = {
      base: baseTextModel.getValue(EndOfLinePreference.LF).split("\n"),
      input1: input1TextModel.getValue(EndOfLinePreference.LF).split("\n"),
      input2: input2TextModel.getValue(EndOfLinePreference.LF).split("\n"),
      result: resultTextModel.getValue(EndOfLinePreference.LF).split("\n")
    };
    baseTextModel.dispose();
    input1TextModel.dispose();
    input2TextModel.dispose();
    resultTextModel.dispose();
    return result;
  }
  toggleConflict(conflictIdx, inputNumber) {
    const baseRange = this.mergeModel.modifiedBaseRanges.get()[conflictIdx];
    if (!baseRange) {
      throw new Error();
    }
    const state = this.mergeModel.getState(baseRange).get();
    transaction((tx) => {
      this.mergeModel.setState(baseRange, state.toggle(inputNumber), true, tx);
    });
  }
  getResult() {
    return this.mergeModel.resultTextModel.getValue();
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1lcmdlRWRpdG9yXFx0ZXN0XFxicm93c2VyXFxtb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElSZWFkZXIsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsaW5lc0RpZmZDb21wdXRlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvbGluZXNEaWZmQ29tcHV0ZXJzLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElNZXJnZURpZmZDb21wdXRlciwgSU1lcmdlRGlmZkNvbXB1dGVyUmVzdWx0LCB0b0xpbmVSYW5nZSwgdG9SYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVsL2RpZmZDb21wdXRlci5qcyc7XG5pbXBvcnQgeyBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVsL21hcHBpbmcuanMnO1xuaW1wb3J0IHsgTWVyZ2VFZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWwvbWVyZ2VFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBNZXJnZUVkaXRvclRlbGVtZXRyeSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVsZW1ldHJ5LmpzJztcblxuc3VpdGUoJ21lcmdlIGVkaXRvciBtb2RlbCcsICgpID0+IHtcblx0Ly8gdG9kbzogcmVuYWJsZSB3aGVuIGZhaWxpbmcgY2FzZSBpcyBmb3VuZCBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzE5MDQ0NCNpc3N1ZWNvbW1lbnQtMTY3ODE1MTQyOFxuXHQvLyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwcmVwZW5kIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE1lcmdlTW9kZWwoXG5cdFx0XHR7XG5cdFx0XHRcdCdsYW5ndWFnZUlkJzogJ3BsYWludGV4dCcsXG5cdFx0XHRcdCdiYXNlJzogJ2xpbmUxXFxubGluZTInLFxuXHRcdFx0XHQnaW5wdXQxJzogJzBcXG5saW5lMVxcbmxpbmUyJyxcblx0XHRcdFx0J2lucHV0Mic6ICcwXFxubGluZTFcXG5saW5lMicsXG5cdFx0XHRcdCdyZXN1bHQnOiAnJ1xuXHRcdFx0fSxcblx0XHRcdG1vZGVsID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRQcm9qZWN0aW9ucygpLCB7XG5cdFx0XHRcdFx0YmFzZTogWydcdTI3RTZcdTI3RTdcdTIwODBsaW5lMScsICdsaW5lMiddLFxuXHRcdFx0XHRcdGlucHV0MTogWydcdTI3RTYwJywgJ1x1MjdFN1x1MjA4MGxpbmUxJywgJ2xpbmUyJ10sXG5cdFx0XHRcdFx0aW5wdXQyOiBbJ1x1MjdFNjAnLCAnXHUyN0U3XHUyMDgwbGluZTEnLCAnbGluZTInXSxcblx0XHRcdFx0XHRyZXN1bHQ6IFsnXHUyN0U2XHUyN0U3e3VucmVjb2duaXplZH1cdTIwODAnXSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9kZWwudG9nZ2xlQ29uZmxpY3QoMCwgMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0eyByZXN1bHQ6IG1vZGVsLmdldFJlc3VsdCgpIH0sXG5cdFx0XHRcdFx0eyByZXN1bHQ6ICcwXFxubGluZTFcXG5saW5lMicgfVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdG1vZGVsLnRvZ2dsZUNvbmZsaWN0KDAsIDIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgcmVzdWx0OiBtb2RlbC5nZXRSZXN1bHQoKSB9LFxuXHRcdFx0XHRcdCh7IHJlc3VsdDogJzBcXG4wXFxubGluZTFcXG5saW5lMicgfSlcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSBiYXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHRlc3RNZXJnZU1vZGVsKFxuXHRcdFx0e1xuXHRcdFx0XHQnbGFuZ3VhZ2VJZCc6ICdwbGFpbnRleHQnLFxuXHRcdFx0XHQnYmFzZSc6ICcnLFxuXHRcdFx0XHQnaW5wdXQxJzogJ2lucHV0MScsXG5cdFx0XHRcdCdpbnB1dDInOiAnaW5wdXQyJyxcblx0XHRcdFx0J3Jlc3VsdCc6ICcnXG5cdFx0XHR9LFxuXHRcdFx0bW9kZWwgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldFByb2plY3Rpb25zKCksIHtcblx0XHRcdFx0XHRiYXNlOiBbJ1x1MjdFNlx1MjdFN1x1MjA4MCddLFxuXHRcdFx0XHRcdGlucHV0MTogWydcdTI3RTZpbnB1dDFcdTI3RTdcdTIwODAnXSxcblx0XHRcdFx0XHRpbnB1dDI6IFsnXHUyN0U2aW5wdXQyXHUyN0U3XHUyMDgwJ10sXG5cdFx0XHRcdFx0cmVzdWx0OiBbJ1x1MjdFNlx1MjdFN3tiYXNlfVx1MjA4MCddLFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRtb2RlbC50b2dnbGVDb25mbGljdCgwLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHJlc3VsdDogbW9kZWwuZ2V0UmVzdWx0KCkgfSxcblx0XHRcdFx0XHQoeyByZXN1bHQ6ICdpbnB1dDEnIH0pXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0bW9kZWwudG9nZ2xlQ29uZmxpY3QoMCwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0eyByZXN1bHQ6IG1vZGVsLmdldFJlc3VsdCgpIH0sXG5cdFx0XHRcdFx0KHsgcmVzdWx0OiAnaW5wdXQyJyB9KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBtZXJnZSB3b3JkIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE1lcmdlTW9kZWwoXG5cdFx0XHR7XG5cdFx0XHRcdCdsYW5ndWFnZUlkJzogJ3BsYWludGV4dCcsXG5cdFx0XHRcdCdiYXNlJzogJ2hlbGxvJyxcblx0XHRcdFx0J2lucHV0MSc6ICdoYWxsbycsXG5cdFx0XHRcdCdpbnB1dDInOiAnaGVsbG93b3JsZCcsXG5cdFx0XHRcdCdyZXN1bHQnOiAnJ1xuXHRcdFx0fSxcblx0XHRcdG1vZGVsID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRQcm9qZWN0aW9ucygpLCB7XG5cdFx0XHRcdFx0YmFzZTogWydcdTI3RTZoZWxsb1x1MjdFN1x1MjA4MCddLFxuXHRcdFx0XHRcdGlucHV0MTogWydcdTI3RTZoYWxsb1x1MjdFN1x1MjA4MCddLFxuXHRcdFx0XHRcdGlucHV0MjogWydcdTI3RTZoZWxsb3dvcmxkXHUyN0U3XHUyMDgwJ10sXG5cdFx0XHRcdFx0cmVzdWx0OiBbJ1x1MjdFNlx1MjdFN3t1bnJlY29nbml6ZWR9XHUyMDgwJ10sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG1vZGVsLnRvZ2dsZUNvbmZsaWN0KDAsIDEpO1xuXHRcdFx0XHRtb2RlbC50b2dnbGVDb25mbGljdCgwLCAyKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgcmVzdWx0OiBtb2RlbC5nZXRSZXN1bHQoKSB9LFxuXHRcdFx0XHRcdHsgcmVzdWx0OiAnaGFsbG93b3JsZCcgfVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cblx0fSk7XG5cblx0dGVzdCgnY2FuIGNvbWJpbmUgaW5zZXJ0aW9ucyBhdCBlbmQgb2YgZG9jdW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgdGVzdE1lcmdlTW9kZWwoXG5cdFx0XHR7XG5cdFx0XHRcdCdsYW5ndWFnZUlkJzogJ3BsYWludGV4dCcsXG5cdFx0XHRcdCdiYXNlJzogJ1pcdTAwRkNyaWNoXFxuQmVyblxcbkJhc2VsXFxuQ2h1clxcbkdlbmZcXG5UaHVuJyxcblx0XHRcdFx0J2lucHV0MSc6ICdaXHUwMEZDcmljaFxcbkJlcm5cXG5DaHVyXFxuRGF2b3NcXG5HZW5mXFxuVGh1blxcbmZ1bmN0aW9uIGYoYjpib29sZWFuKSB7fScsXG5cdFx0XHRcdCdpbnB1dDInOiAnWlx1MDBGQ3JpY2hcXG5CZXJuXFxuQmFzZWwgKEZDQilcXG5DaHVyXFxuR2VuZlxcblRodW5cXG5mdW5jdGlvbiBmKGE6bnVtYmVyKSB7fScsXG5cdFx0XHRcdCdyZXN1bHQnOiAnWlx1MDBGQ3JpY2hcXG5CZXJuXFxuQmFzZWxcXG5DaHVyXFxuRGF2b3NcXG5HZW5mXFxuVGh1bidcblx0XHRcdH0sXG5cdFx0XHRtb2RlbCA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0UHJvamVjdGlvbnMoKSwge1xuXHRcdFx0XHRcdGJhc2U6IFsnWlx1MDBGQ3JpY2gnLCAnQmVybicsICdcdTI3RTZCYXNlbCcsICdcdTI3RTdcdTIwODBDaHVyJywgJ1x1MjdFNlx1MjdFN1x1MjA4MUdlbmYnLCAnVGh1blx1MjdFNlx1MjdFN1x1MjA4MiddLFxuXHRcdFx0XHRcdGlucHV0MTogW1xuXHRcdFx0XHRcdFx0J1pcdTAwRkNyaWNoJyxcblx0XHRcdFx0XHRcdCdCZXJuJyxcblx0XHRcdFx0XHRcdCdcdTI3RTZcdTI3RTdcdTIwODBDaHVyJyxcblx0XHRcdFx0XHRcdCdcdTI3RTZEYXZvcycsXG5cdFx0XHRcdFx0XHQnXHUyN0U3XHUyMDgxR2VuZicsXG5cdFx0XHRcdFx0XHQnVGh1bicsXG5cdFx0XHRcdFx0XHQnXHUyN0U2ZnVuY3Rpb24gZihiOmJvb2xlYW4pIHt9XHUyN0U3XHUyMDgyJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGlucHV0MjogW1xuXHRcdFx0XHRcdFx0J1pcdTAwRkNyaWNoJyxcblx0XHRcdFx0XHRcdCdCZXJuJyxcblx0XHRcdFx0XHRcdCdcdTI3RTZCYXNlbCAoRkNCKScsXG5cdFx0XHRcdFx0XHQnXHUyN0U3XHUyMDgwQ2h1cicsXG5cdFx0XHRcdFx0XHQnXHUyN0U2XHUyN0U3XHUyMDgxR2VuZicsXG5cdFx0XHRcdFx0XHQnVGh1bicsXG5cdFx0XHRcdFx0XHQnXHUyN0U2ZnVuY3Rpb24gZihhOm51bWJlcikge31cdTI3RTdcdTIwODInLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0cmVzdWx0OiBbXG5cdFx0XHRcdFx0XHQnWlx1MDBGQ3JpY2gnLFxuXHRcdFx0XHRcdFx0J0Jlcm4nLFxuXHRcdFx0XHRcdFx0J1x1MjdFNkJhc2VsJyxcblx0XHRcdFx0XHRcdCdcdTI3RTd7YmFzZX1cdTIwODBDaHVyJyxcblx0XHRcdFx0XHRcdCdcdTI3RTZEYXZvcycsXG5cdFx0XHRcdFx0XHQnXHUyN0U3ezFcdTI3MTN9XHUyMDgxR2VuZicsXG5cdFx0XHRcdFx0XHQnVGh1blx1MjdFNlx1MjdFN3tiYXNlfVx1MjA4MicsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9kZWwudG9nZ2xlQ29uZmxpY3QoMiwgMSk7XG5cdFx0XHRcdG1vZGVsLnRvZ2dsZUNvbmZsaWN0KDIsIDIpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0eyByZXN1bHQ6IG1vZGVsLmdldFJlc3VsdCgpIH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmVzdWx0OlxuXHRcdFx0XHRcdFx0XHQnWlx1MDBGQ3JpY2hcXG5CZXJuXFxuQmFzZWxcXG5DaHVyXFxuRGF2b3NcXG5HZW5mXFxuVGh1blxcbmZ1bmN0aW9uIGYoYjpib29sZWFuKSB7fVxcbmZ1bmN0aW9uIGYoYTpudW1iZXIpIHt9Jyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmxpY3RzIGFyZSByZXNldCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0TWVyZ2VNb2RlbChcblx0XHRcdHtcblx0XHRcdFx0J2xhbmd1YWdlSWQnOiAndHlwZXNjcmlwdCcsXG5cdFx0XHRcdCdiYXNlJzogYGltcG9ydCB7IGggfSBmcm9tICd2cy9iYXNlL2Jyb3dzZXIvZG9tJztcXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL2xpZmVjeWNsZSc7XFxuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJ3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yV2lkZ2V0JztcXG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICd2cy9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zJztcXG5pbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9hdWRpb0N1ZXMvYnJvd3Nlci9vYnNlcnZhYmxlJztcXG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL21vZGVsL2xpbmVSYW5nZSc7XFxuYCxcblx0XHRcdFx0J2lucHV0MSc6IGBpbXBvcnQgeyBoIH0gZnJvbSAndnMvYmFzZS9icm93c2VyL2RvbSc7XFxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICd2cy9iYXNlL2NvbW1vbi9saWZlY3ljbGUnO1xcbmltcG9ydCB7IG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQgfSBmcm9tICd2cy9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlJztcXG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAndnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3JXaWRnZXQnO1xcbmltcG9ydCB7IGF1dG9ydW4sIElSZWFkZXIsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9hdWRpb0N1ZXMvYnJvd3Nlci9vYnNlcnZhYmxlJztcXG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9tZXJnZUVkaXRvci9icm93c2VyL21vZGVsL2xpbmVSYW5nZSc7XFxuYCxcblx0XHRcdFx0J2lucHV0Mic6IGBpbXBvcnQgeyBoIH0gZnJvbSAndnMvYmFzZS9icm93c2VyL2RvbSc7XFxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICd2cy9iYXNlL2NvbW1vbi9saWZlY3ljbGUnO1xcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICd2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvcldpZGdldCc7XFxuaW1wb3J0IHsgYXV0b3J1biwgSVJlYWRlciwgb2JzZXJ2YWJsZUZyb21FdmVudCwgT2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAndnMvd29ya2JlbmNoL2NvbnRyaWIvYXVkaW9DdWVzL2Jyb3dzZXIvb2JzZXJ2YWJsZSc7XFxuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAndnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci9tb2RlbC9saW5lUmFuZ2UnO1xcbmAsXG5cdFx0XHRcdCdyZXN1bHQnOiBgaW1wb3J0IHsgaCB9IGZyb20gJ3ZzL2Jhc2UvYnJvd3Nlci9kb20nO1xcclxcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAndnMvYmFzZS9jb21tb24vbGlmZWN5Y2xlJztcXHJcXG5pbXBvcnQgeyBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50IH0gZnJvbSAndnMvYmFzZS9jb21tb24vb2JzZXJ2YWJsZSc7XFxyXFxuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJ3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yV2lkZ2V0JztcXHJcXG48PDw8PDw8IFVwZGF0ZWQgdXBzdHJlYW1cXHJcXG5pbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9hdWRpb0N1ZXMvYnJvd3Nlci9vYnNlcnZhYmxlJztcXHJcXG49PT09PT09XFxyXFxuaW1wb3J0IHsgYXV0b3J1biwgSVJlYWRlciwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJ3ZzL3dvcmtiZW5jaC9jb250cmliL2F1ZGlvQ3Vlcy9icm93c2VyL29ic2VydmFibGUnO1xcclxcbj4+Pj4+Pj4gU3Rhc2hlZCBjaGFuZ2VzXFxyXFxuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAndnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci9tb2RlbC9saW5lUmFuZ2UnO1xcclxcbmBcblx0XHRcdH0sXG5cdFx0XHRtb2RlbCA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0UHJvamVjdGlvbnMoKSwge1xuXHRcdFx0XHRcdGJhc2U6IFtcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBoIH0gZnJvbSAndnMvYmFzZS9icm93c2VyL2RvbSc7YCxcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL2xpZmVjeWNsZSc7YCxcblx0XHRcdFx0XHRcdGBcdTI3RTZcdTI3RTdcdTIwODBpbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAndnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3JXaWRnZXQnO2AsXG5cdFx0XHRcdFx0XHRgXHUyN0U2aW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAndnMvZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucyc7YCxcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9hdWRpb0N1ZXMvYnJvd3Nlci9vYnNlcnZhYmxlJztgLFxuXHRcdFx0XHRcdFx0YFx1MjdFN1x1MjA4MWltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJ3ZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbW9kZWwvbGluZVJhbmdlJztgLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRpbnB1dDE6IFtcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBoIH0gZnJvbSAndnMvYmFzZS9icm93c2VyL2RvbSc7YCxcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL2xpZmVjeWNsZSc7YCxcblx0XHRcdFx0XHRcdGBcdTI3RTZpbXBvcnQgeyBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50IH0gZnJvbSAndnMvYmFzZS9jb21tb24vb2JzZXJ2YWJsZSc7YCxcblx0XHRcdFx0XHRcdGBcdTI3RTdcdTIwODBpbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAndnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3JXaWRnZXQnO2AsXG5cdFx0XHRcdFx0XHRgXHUyN0U2aW1wb3J0IHsgYXV0b3J1biwgSVJlYWRlciwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJ3ZzL3dvcmtiZW5jaC9jb250cmliL2F1ZGlvQ3Vlcy9icm93c2VyL29ic2VydmFibGUnO2AsXG5cdFx0XHRcdFx0XHRgXHUyN0U3XHUyMDgxaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAndnMvd29ya2JlbmNoL2NvbnRyaWIvbWVyZ2VFZGl0b3IvYnJvd3Nlci9tb2RlbC9saW5lUmFuZ2UnO2AsXG5cdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGlucHV0MjogW1xuXHRcdFx0XHRcdFx0YGltcG9ydCB7IGggfSBmcm9tICd2cy9iYXNlL2Jyb3dzZXIvZG9tJztgLFxuXHRcdFx0XHRcdFx0YGltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAndnMvYmFzZS9jb21tb24vbGlmZWN5Y2xlJztgLFxuXHRcdFx0XHRcdFx0YFx1MjdFNlx1MjdFN1x1MjA4MGltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICd2cy9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvcldpZGdldCc7YCxcblx0XHRcdFx0XHRcdGBcdTI3RTZpbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9hdWRpb0N1ZXMvYnJvd3Nlci9vYnNlcnZhYmxlJztgLFxuXHRcdFx0XHRcdFx0YFx1MjdFN1x1MjA4MWltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJ3ZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbW9kZWwvbGluZVJhbmdlJztgLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRyZXN1bHQ6IFtcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBoIH0gZnJvbSAndnMvYmFzZS9icm93c2VyL2RvbSc7YCxcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL2xpZmVjeWNsZSc7YCxcblx0XHRcdFx0XHRcdGBcdTI3RTZpbXBvcnQgeyBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50IH0gZnJvbSAndnMvYmFzZS9jb21tb24vb2JzZXJ2YWJsZSc7YCxcblx0XHRcdFx0XHRcdGBcdTI3RTd7MVx1MjcxM31cdTIwODBpbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAndnMvZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3JXaWRnZXQnO2AsXG5cdFx0XHRcdFx0XHQnXHUyN0U2PDw8PDw8PCBVcGRhdGVkIHVwc3RyZWFtJyxcblx0XHRcdFx0XHRcdGBpbXBvcnQgeyBhdXRvcnVuLCBJUmVhZGVyLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBPYnNlcnZhYmxlVmFsdWUgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9hdWRpb0N1ZXMvYnJvd3Nlci9vYnNlcnZhYmxlJztgLFxuXHRcdFx0XHRcdFx0Jz09PT09PT0nLFxuXHRcdFx0XHRcdFx0YGltcG9ydCB7IGF1dG9ydW4sIElSZWFkZXIsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICd2cy93b3JrYmVuY2gvY29udHJpYi9hdWRpb0N1ZXMvYnJvd3Nlci9vYnNlcnZhYmxlJztgLFxuXHRcdFx0XHRcdFx0Jz4+Pj4+Pj4gU3Rhc2hlZCBjaGFuZ2VzJyxcblx0XHRcdFx0XHRcdGBcdTI3RTd7dW5yZWNvZ25pemVkfVx1MjA4MWltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJ3ZzL3dvcmtiZW5jaC9jb250cmliL21lcmdlRWRpdG9yL2Jyb3dzZXIvbW9kZWwvbGluZVJhbmdlJztgLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0by1zb2x2ZSBlcXVhbCBlZGl0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB0ZXN0TWVyZ2VNb2RlbChcblx0XHRcdHtcblx0XHRcdFx0J2xhbmd1YWdlSWQnOiAnamF2YXNjcmlwdCcsXG5cdFx0XHRcdCdiYXNlJzogYGNvbnN0IHsgcmVhZEZpbGVTeW5jIH0gPSByZXF1aXJlKCdmcycpO1xcblxcbmxldCBwYXRocyA9IHByb2Nlc3MuYXJndi5zbGljZSgyKTtcXG5tYWluKHBhdGhzKTtcXG5cXG5mdW5jdGlvbiBtYWluKHBhdGhzKSB7XFxuICAgIC8vIHByaW50IHRoZSB3ZWxjb21lIG1lc3NhZ2VcXG4gICAgcHJpbnRNZXNzYWdlKCk7XFxuXFxuICAgIGxldCBkYXRhID0gZ2V0TGluZUNvdW50SW5mbyhwYXRocyk7XFxuICAgIGNvbnNvbGUubG9nKFwiTGluZXM6IFwiICsgZGF0YS50b3RhbExpbmVDb3VudCk7XFxufVxcblxcbi8qKlxcbiAqIFByaW50cyB0aGUgd2VsY29tZSBtZXNzYWdlXFxuKi9cXG5mdW5jdGlvbiBwcmludE1lc3NhZ2UoKSB7XFxuICAgIGNvbnNvbGUubG9nKFwiV2VsY29tZSBUbyBMaW5lIENvdW50ZXJcIik7XFxufVxcblxcbi8qKlxcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGhzXFxuKi9cXG5mdW5jdGlvbiBnZXRMaW5lQ291bnRJbmZvKHBhdGhzKSB7XFxuICAgIGxldCBsaW5lQ291bnRzID0gcGF0aHMubWFwKHBhdGggPT4gKHsgcGF0aCwgY291bnQ6IGdldExpbmVzTGVuZ3RoKHJlYWRGaWxlU3luYyhwYXRoLCAndXRmOCcpKSB9KSk7XFxuICAgIHJldHVybiB7XFxuICAgICAgICB0b3RhbExpbmVDb3VudDogbGluZUNvdW50cy5yZWR1Y2UoKGFjYywgeyBjb3VudCB9KSA9PiBhY2MgKyBjb3VudCwgMCksXFxuICAgICAgICBsaW5lQ291bnRzLFxcbiAgICB9O1xcbn1cXG5cXG4vKipcXG4gKiBAcGFyYW0ge3N0cmluZ30gc3RyXFxuICovXFxuZnVuY3Rpb24gZ2V0TGluZXNMZW5ndGgoc3RyKSB7XFxuICAgIHJldHVybiBzdHIuc3BsaXQoJ1xcXFxuJykubGVuZ3RoO1xcbn1cXG5gLFxuXHRcdFx0XHQnaW5wdXQxJzogYGNvbnN0IHsgcmVhZEZpbGVTeW5jIH0gPSByZXF1aXJlKCdmcycpO1xcblxcbmxldCBwYXRocyA9IHByb2Nlc3MuYXJndi5zbGljZSgyKTtcXG5tYWluKHBhdGhzKTtcXG5cXG5mdW5jdGlvbiBtYWluKHBhdGhzKSB7XFxuICAgIC8vIHByaW50IHRoZSB3ZWxjb21lIG1lc3NhZ2VcXG4gICAgcHJpbnRNZXNzYWdlKCk7XFxuXFxuICAgIGNvbnN0IGRhdGEgPSBnZXRMaW5lQ291bnRJbmZvKHBhdGhzKTtcXG4gICAgY29uc29sZS5sb2coXCJMaW5lczogXCIgKyBkYXRhLnRvdGFsTGluZUNvdW50KTtcXG59XFxuXFxuZnVuY3Rpb24gcHJpbnRNZXNzYWdlKCkge1xcbiAgICBjb25zb2xlLmxvZyhcIldlbGNvbWUgVG8gTGluZSBDb3VudGVyXCIpO1xcbn1cXG5cXG4vKipcXG4gKiBAcGFyYW0ge3N0cmluZ1tdfSBwYXRoc1xcbiovXFxuZnVuY3Rpb24gZ2V0TGluZUNvdW50SW5mbyhwYXRocykge1xcbiAgICBsZXQgbGluZUNvdW50cyA9IHBhdGhzLm1hcChwYXRoID0+ICh7IHBhdGgsIGNvdW50OiBnZXRMaW5lc0xlbmd0aChyZWFkRmlsZVN5bmMocGF0aCwgJ3V0ZjgnKSkgfSkpO1xcbiAgICByZXR1cm4ge1xcbiAgICAgICAgdG90YWxMaW5lQ291bnQ6IGxpbmVDb3VudHMucmVkdWNlKChhY2MsIHsgY291bnQgfSkgPT4gYWNjICsgY291bnQsIDApLFxcbiAgICAgICAgbGluZUNvdW50cyxcXG4gICAgfTtcXG59XFxuXFxuLyoqXFxuICogQHBhcmFtIHtzdHJpbmd9IHN0clxcbiAqL1xcbmZ1bmN0aW9uIGdldExpbmVzTGVuZ3RoKHN0cikge1xcbiAgICByZXR1cm4gc3RyLnNwbGl0KCdcXFxcbicpLmxlbmd0aDtcXG59XFxuYCxcblx0XHRcdFx0J2lucHV0Mic6IGBjb25zdCB7IHJlYWRGaWxlU3luYyB9ID0gcmVxdWlyZSgnZnMnKTtcXG5cXG5sZXQgcGF0aHMgPSBwcm9jZXNzLmFyZ3Yuc2xpY2UoMik7XFxucnVuKHBhdGhzKTtcXG5cXG5mdW5jdGlvbiBydW4ocGF0aHMpIHtcXG4gICAgLy8gcHJpbnQgdGhlIHdlbGNvbWUgbWVzc2FnZVxcbiAgICBwcmludE1lc3NhZ2UoKTtcXG5cXG4gICAgY29uc3QgZGF0YSA9IGdldExpbmVDb3VudEluZm8ocGF0aHMpO1xcbiAgICBjb25zb2xlLmxvZyhcIkxpbmVzOiBcIiArIGRhdGEudG90YWxMaW5lQ291bnQpO1xcbn1cXG5cXG5mdW5jdGlvbiBwcmludE1lc3NhZ2UoKSB7XFxuICAgIGNvbnNvbGUubG9nKFwiV2VsY29tZSBUbyBMaW5lIENvdW50ZXJcIik7XFxufVxcblxcbi8qKlxcbiAqIEBwYXJhbSB7c3RyaW5nW119IHBhdGhzXFxuKi9cXG5mdW5jdGlvbiBnZXRMaW5lQ291bnRJbmZvKHBhdGhzKSB7XFxuICAgIGxldCBsaW5lQ291bnRzID0gcGF0aHMubWFwKHBhdGggPT4gKHsgcGF0aCwgY291bnQ6IGdldExpbmVzTGVuZ3RoKHJlYWRGaWxlU3luYyhwYXRoLCAndXRmOCcpKSB9KSk7XFxuICAgIHJldHVybiB7XFxuICAgICAgICB0b3RhbExpbmVDb3VudDogbGluZUNvdW50cy5yZWR1Y2UoKGFjYywgeyBjb3VudCB9KSA9PiBhY2MgKyBjb3VudCwgMCksXFxuICAgICAgICBsaW5lQ291bnRzLFxcbiAgICB9O1xcbn1cXG5cXG4vKipcXG4gKiBAcGFyYW0ge3N0cmluZ30gc3RyXFxuICovXFxuZnVuY3Rpb24gZ2V0TGluZXNMZW5ndGgoc3RyKSB7XFxuICAgIHJldHVybiBzdHIuc3BsaXQoJ1xcXFxuJykubGVuZ3RoO1xcbn1cXG5gLFxuXHRcdFx0XHQncmVzdWx0JzogJzw8PDw8PDwgdWlhZVxcbj4+Pj4+Pj4gU3Rhc2hlZCBjaGFuZ2VzJyxcblx0XHRcdFx0cmVzZXRSZXN1bHQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgbW9kZWwgPT4ge1xuXHRcdFx0XHRhd2FpdCBtb2RlbC5tZXJnZU1vZGVsLnJlc2V0KCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRSZXN1bHQoKSwgYGNvbnN0IHsgcmVhZEZpbGVTeW5jIH0gPSByZXF1aXJlKCdmcycpO1xcblxcbmxldCBwYXRocyA9IHByb2Nlc3MuYXJndi5zbGljZSgyKTtcXG5ydW4ocGF0aHMpO1xcblxcbmZ1bmN0aW9uIHJ1bihwYXRocykge1xcbiAgICAvLyBwcmludCB0aGUgd2VsY29tZSBtZXNzYWdlXFxuICAgIHByaW50TWVzc2FnZSgpO1xcblxcbiAgICBjb25zdCBkYXRhID0gZ2V0TGluZUNvdW50SW5mbyhwYXRocyk7XFxuICAgIGNvbnNvbGUubG9nKFwiTGluZXM6IFwiICsgZGF0YS50b3RhbExpbmVDb3VudCk7XFxufVxcblxcbmZ1bmN0aW9uIHByaW50TWVzc2FnZSgpIHtcXG4gICAgY29uc29sZS5sb2coXCJXZWxjb21lIFRvIExpbmUgQ291bnRlclwiKTtcXG59XFxuXFxuLyoqXFxuICogQHBhcmFtIHtzdHJpbmdbXX0gcGF0aHNcXG4qL1xcbmZ1bmN0aW9uIGdldExpbmVDb3VudEluZm8ocGF0aHMpIHtcXG4gICAgbGV0IGxpbmVDb3VudHMgPSBwYXRocy5tYXAocGF0aCA9PiAoeyBwYXRoLCBjb3VudDogZ2V0TGluZXNMZW5ndGgocmVhZEZpbGVTeW5jKHBhdGgsICd1dGY4JykpIH0pKTtcXG4gICAgcmV0dXJuIHtcXG4gICAgICAgIHRvdGFsTGluZUNvdW50OiBsaW5lQ291bnRzLnJlZHVjZSgoYWNjLCB7IGNvdW50IH0pID0+IGFjYyArIGNvdW50LCAwKSxcXG4gICAgICAgIGxpbmVDb3VudHMsXFxuICAgIH07XFxufVxcblxcbi8qKlxcbiAqIEBwYXJhbSB7c3RyaW5nfSBzdHJcXG4gKi9cXG5mdW5jdGlvbiBnZXRMaW5lc0xlbmd0aChzdHIpIHtcXG4gICAgcmV0dXJuIHN0ci5zcGxpdCgnXFxcXG4nKS5sZW5ndGg7XFxufVxcbmApO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHRlc3RNZXJnZU1vZGVsKFxuXHRvcHRpb25zOiBNZXJnZU1vZGVsT3B0aW9ucyxcblx0Zm46IChtb2RlbDogTWVyZ2VNb2RlbEludGVyZmFjZSkgPT4gdm9pZFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBtb2RlbEludGVyZmFjZSA9IGRpc3Bvc2FibGVzLmFkZChcblx0XHRuZXcgTWVyZ2VNb2RlbEludGVyZmFjZShvcHRpb25zLCBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKSlcblx0KTtcblx0YXdhaXQgbW9kZWxJbnRlcmZhY2UubWVyZ2VNb2RlbC5vbkluaXRpYWxpemVkO1xuXHRhd2FpdCBmbihtb2RlbEludGVyZmFjZSk7XG5cdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcbn1cblxuaW50ZXJmYWNlIE1lcmdlTW9kZWxPcHRpb25zIHtcblx0bGFuZ3VhZ2VJZDogc3RyaW5nO1xuXHRpbnB1dDE6IHN0cmluZztcblx0aW5wdXQyOiBzdHJpbmc7XG5cdGJhc2U6IHN0cmluZztcblx0cmVzdWx0OiBzdHJpbmc7XG5cdHJlc2V0UmVzdWx0PzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gdG9TbWFsbE51bWJlcnNEZWModmFsdWU6IG51bWJlcik6IHN0cmluZyB7XG5cdGNvbnN0IHNtYWxsTnVtYmVycyA9IFsnXHUyMDgwJywgJ1x1MjA4MScsICdcdTIwODInLCAnXHUyMDgzJywgJ1x1MjA4NCcsICdcdTIwODUnLCAnXHUyMDg2JywgJ1x1MjA4NycsICdcdTIwODgnLCAnXHUyMDg5J107XG5cdHJldHVybiB2YWx1ZS50b1N0cmluZygpLnNwbGl0KCcnKS5tYXAoYyA9PiBzbWFsbE51bWJlcnNbcGFyc2VJbnQoYyldKS5qb2luKCcnKTtcbn1cblxuY2xhc3MgTWVyZ2VNb2RlbEludGVyZmFjZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgbWVyZ2VNb2RlbDogTWVyZ2VFZGl0b3JNb2RlbDtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiBNZXJnZU1vZGVsT3B0aW9ucywgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgaW5wdXQxVGV4dE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlVGV4dE1vZGVsKG9wdGlvbnMuaW5wdXQxLCBvcHRpb25zLmxhbmd1YWdlSWQpKTtcblx0XHRjb25zdCBpbnB1dDJUZXh0TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVUZXh0TW9kZWwob3B0aW9ucy5pbnB1dDIsIG9wdGlvbnMubGFuZ3VhZ2VJZCkpO1xuXHRcdGNvbnN0IGJhc2VUZXh0TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVUZXh0TW9kZWwob3B0aW9ucy5iYXNlLCBvcHRpb25zLmxhbmd1YWdlSWQpKTtcblx0XHRjb25zdCByZXN1bHRUZXh0TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVUZXh0TW9kZWwob3B0aW9ucy5yZXN1bHQsIG9wdGlvbnMubGFuZ3VhZ2VJZCkpO1xuXG5cdFx0Y29uc3QgZGlmZkNvbXB1dGVyOiBJTWVyZ2VEaWZmQ29tcHV0ZXIgPSB7XG5cdFx0XHRhc3luYyBjb21wdXRlRGlmZih0ZXh0TW9kZWwxOiBJVGV4dE1vZGVsLCB0ZXh0TW9kZWwyOiBJVGV4dE1vZGVsLCByZWFkZXI6IElSZWFkZXIpOiBQcm9taXNlPElNZXJnZURpZmZDb21wdXRlclJlc3VsdD4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBsaW5lc0RpZmZDb21wdXRlcnMuZ2V0TGVnYWN5KCkuY29tcHV0ZURpZmYoXG5cdFx0XHRcdFx0dGV4dE1vZGVsMS5nZXRMaW5lc0NvbnRlbnQoKSxcblx0XHRcdFx0XHR0ZXh0TW9kZWwyLmdldExpbmVzQ29udGVudCgpLFxuXHRcdFx0XHRcdHsgaWdub3JlVHJpbVdoaXRlc3BhY2U6IGZhbHNlLCBtYXhDb21wdXRhdGlvblRpbWVNczogMTAwMDAsIGNvbXB1dGVNb3ZlczogZmFsc2UgfVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VzID0gcmVzdWx0LmNoYW5nZXMubWFwKGMgPT5cblx0XHRcdFx0XHRuZXcgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKFxuXHRcdFx0XHRcdFx0dG9MaW5lUmFuZ2UoYy5vcmlnaW5hbCksXG5cdFx0XHRcdFx0XHR0ZXh0TW9kZWwxLFxuXHRcdFx0XHRcdFx0dG9MaW5lUmFuZ2UoYy5tb2RpZmllZCksXG5cdFx0XHRcdFx0XHR0ZXh0TW9kZWwyLFxuXHRcdFx0XHRcdFx0Yy5pbm5lckNoYW5nZXM/Lm1hcChpYyA9PiB0b1JhbmdlTWFwcGluZyhpYykpLmZpbHRlcihpc0RlZmluZWQpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGRpZmZzOiBjaGFuZ2VzXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMubWVyZ2VNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lcmdlRWRpdG9yTW9kZWwsXG5cdFx0XHRiYXNlVGV4dE1vZGVsLFxuXHRcdFx0e1xuXHRcdFx0XHR0ZXh0TW9kZWw6IGlucHV0MVRleHRNb2RlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRkZXRhaWw6ICcnLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0ZXh0TW9kZWw6IGlucHV0MlRleHRNb2RlbCxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRkZXRhaWw6ICcnLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHR9LFxuXHRcdFx0cmVzdWx0VGV4dE1vZGVsLFxuXHRcdFx0ZGlmZkNvbXB1dGVyLFxuXHRcdFx0e1xuXHRcdFx0XHRyZXNldFJlc3VsdDogb3B0aW9ucy5yZXNldFJlc3VsdCB8fCBmYWxzZVxuXHRcdFx0fSxcblx0XHRcdG5ldyBNZXJnZUVkaXRvclRlbGVtZXRyeShOdWxsVGVsZW1ldHJ5U2VydmljZSksXG5cdFx0KSk7XG5cdH1cblxuXHRnZXRQcm9qZWN0aW9ucygpOiB1bmtub3duIHtcblx0XHRpbnRlcmZhY2UgTGFiZWxlZFJhbmdlIHtcblx0XHRcdHJhbmdlOiBSYW5nZTtcblx0XHRcdGxhYmVsOiBzdHJpbmc7XG5cdFx0fVxuXHRcdGZ1bmN0aW9uIGFwcGx5UmFuZ2VzKHRleHRNb2RlbDogSVRleHRNb2RlbCwgcmFuZ2VzOiBMYWJlbGVkUmFuZ2VbXSk6IHZvaWQge1xuXHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMocmFuZ2VzLm1hcCgoeyByYW5nZSwgbGFiZWwgfSkgPT4gKHtcblx0XHRcdFx0cmFuZ2U6IHJhbmdlLFxuXHRcdFx0XHR0ZXh0OiBgXHUyN0U2JHt0ZXh0TW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKX1cdTI3RTcke2xhYmVsfWAsXG5cdFx0XHR9KSkpO1xuXHRcdH1cblx0XHRjb25zdCBiYXNlUmFuZ2VzID0gdGhpcy5tZXJnZU1vZGVsLm1vZGlmaWVkQmFzZVJhbmdlcy5nZXQoKTtcblxuXHRcdGNvbnN0IGJhc2VUZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGhpcy5tZXJnZU1vZGVsLmJhc2UuZ2V0VmFsdWUoKSk7XG5cdFx0YXBwbHlSYW5nZXMoXG5cdFx0XHRiYXNlVGV4dE1vZGVsLFxuXHRcdFx0YmFzZVJhbmdlcy5tYXA8TGFiZWxlZFJhbmdlPigociwgaWR4KSA9PiAoe1xuXHRcdFx0XHRyYW5nZTogci5iYXNlUmFuZ2UudG9FeGNsdXNpdmVSYW5nZSgpLFxuXHRcdFx0XHRsYWJlbDogdG9TbWFsbE51bWJlcnNEZWMoaWR4KSxcblx0XHRcdH0pKVxuXHRcdCk7XG5cblx0XHRjb25zdCBpbnB1dDFUZXh0TW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGhpcy5tZXJnZU1vZGVsLmlucHV0MS50ZXh0TW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0YXBwbHlSYW5nZXMoXG5cdFx0XHRpbnB1dDFUZXh0TW9kZWwsXG5cdFx0XHRiYXNlUmFuZ2VzLm1hcDxMYWJlbGVkUmFuZ2U+KChyLCBpZHgpID0+ICh7XG5cdFx0XHRcdHJhbmdlOiByLmlucHV0MVJhbmdlLnRvRXhjbHVzaXZlUmFuZ2UoKSxcblx0XHRcdFx0bGFiZWw6IHRvU21hbGxOdW1iZXJzRGVjKGlkeCksXG5cdFx0XHR9KSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgaW5wdXQyVGV4dE1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKHRoaXMubWVyZ2VNb2RlbC5pbnB1dDIudGV4dE1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdGFwcGx5UmFuZ2VzKFxuXHRcdFx0aW5wdXQyVGV4dE1vZGVsLFxuXHRcdFx0YmFzZVJhbmdlcy5tYXA8TGFiZWxlZFJhbmdlPigociwgaWR4KSA9PiAoe1xuXHRcdFx0XHRyYW5nZTogci5pbnB1dDJSYW5nZS50b0V4Y2x1c2l2ZVJhbmdlKCksXG5cdFx0XHRcdGxhYmVsOiB0b1NtYWxsTnVtYmVyc0RlYyhpZHgpLFxuXHRcdFx0fSkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdFRleHRNb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0aGlzLm1lcmdlTW9kZWwucmVzdWx0VGV4dE1vZGVsLmdldFZhbHVlKCkpO1xuXHRcdGFwcGx5UmFuZ2VzKFxuXHRcdFx0cmVzdWx0VGV4dE1vZGVsLFxuXHRcdFx0YmFzZVJhbmdlcy5tYXA8TGFiZWxlZFJhbmdlPigociwgaWR4KSA9PiAoe1xuXHRcdFx0XHRyYW5nZTogdGhpcy5tZXJnZU1vZGVsLmdldExpbmVSYW5nZUluUmVzdWx0KHIuYmFzZVJhbmdlKS50b0V4Y2x1c2l2ZVJhbmdlKCksXG5cdFx0XHRcdGxhYmVsOiBgeyR7dGhpcy5tZXJnZU1vZGVsLmdldFN0YXRlKHIpLmdldCgpfX0ke3RvU21hbGxOdW1iZXJzRGVjKGlkeCl9YCxcblx0XHRcdH0pKVxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB7XG5cdFx0XHRiYXNlOiBiYXNlVGV4dE1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLnNwbGl0KCdcXG4nKSxcblx0XHRcdGlucHV0MTogaW5wdXQxVGV4dE1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLnNwbGl0KCdcXG4nKSxcblx0XHRcdGlucHV0MjogaW5wdXQyVGV4dE1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLnNwbGl0KCdcXG4nKSxcblx0XHRcdHJlc3VsdDogcmVzdWx0VGV4dE1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLnNwbGl0KCdcXG4nKSxcblx0XHR9O1xuXHRcdGJhc2VUZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdGlucHV0MVRleHRNb2RlbC5kaXNwb3NlKCk7XG5cdFx0aW5wdXQyVGV4dE1vZGVsLmRpc3Bvc2UoKTtcblx0XHRyZXN1bHRUZXh0TW9kZWwuZGlzcG9zZSgpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHR0b2dnbGVDb25mbGljdChjb25mbGljdElkeDogbnVtYmVyLCBpbnB1dE51bWJlcjogMSB8IDIpOiB2b2lkIHtcblx0XHRjb25zdCBiYXNlUmFuZ2UgPSB0aGlzLm1lcmdlTW9kZWwubW9kaWZpZWRCYXNlUmFuZ2VzLmdldCgpW2NvbmZsaWN0SWR4XTtcblx0XHRpZiAoIWJhc2VSYW5nZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCk7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5tZXJnZU1vZGVsLmdldFN0YXRlKGJhc2VSYW5nZSkuZ2V0KCk7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5tZXJnZU1vZGVsLnNldFN0YXRlKGJhc2VSYW5nZSwgc3RhdGUudG9nZ2xlKGlucHV0TnVtYmVyKSwgdHJ1ZSwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0UmVzdWx0KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMubWVyZ2VNb2RlbC5yZXN1bHRUZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBa0IsbUJBQW1CO0FBQ3JDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMs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QTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUNYO0FBQUEsTUFDQSxXQUFTO0FBQ1IsZUFBTyxnQkFBZ0IsTUFBTSxlQUFlLEdBQUc7QUFBQSxVQUM5QyxNQUFNO0FBQUEsWUFDTDtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBLFFBQVE7QUFBQSxZQUNQO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsVUFDRDtBQUFBLFVBQ0EsUUFBUTtBQUFBLFlBQ1A7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxVQUNBLFFBQVE7QUFBQSxZQUNQO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMEJBQTBCLFlBQVk7QUFDMUMsVUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLGNBQWM7QUFBQSxRQUNkLFFBQVE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBQ1IsVUFBVTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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
