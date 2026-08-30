import assert from "assert";
import { CharCode } from "../../../../base/common/charCode.js";
import * as platform from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { StringBuilder } from "../../../common/core/stringBuilder.js";
import { DefaultEndOfLine } from "../../../common/model.js";
import { createTextBuffer } from "../../../common/model/textModel.js";
import { ModelService } from "../../../common/services/modelService.js";
import { TestConfigurationService } from "../../../../platform/configuration/test/common/testConfigurationService.js";
import { createModelServices, createTextModel } from "../testTextModel.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { IModelService } from "../../../common/services/model.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
const GENERATE_TESTS = false;
suite("ModelService", () => {
  let disposables;
  let modelService;
  let instantiationService;
  setup(() => {
    disposables = new DisposableStore();
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("files", { "eol": "\n" });
    configService.setUserConfiguration("files", { "eol": "\r\n" }, URI.file(platform.isWindows ? "c:\\myroot" : "/myroot"));
    instantiationService = createModelServices(disposables, [
      [IConfigurationService, configService]
    ]);
    modelService = instantiationService.get(IModelService);
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("EOL setting respected depending on root", () => {
    const model1 = modelService.createModel("farboo", null);
    const model2 = modelService.createModel("farboo", null, URI.file(platform.isWindows ? "c:\\myroot\\myfile.txt" : "/myroot/myfile.txt"));
    const model3 = modelService.createModel("farboo", null, URI.file(platform.isWindows ? "c:\\other\\myfile.txt" : "/other/myfile.txt"));
    assert.strictEqual(model1.getOptions().defaultEOL, DefaultEndOfLine.LF);
    assert.strictEqual(model2.getOptions().defaultEOL, DefaultEndOfLine.CRLF);
    assert.strictEqual(model3.getOptions().defaultEOL, DefaultEndOfLine.LF);
    model1.dispose();
    model2.dispose();
    model3.dispose();
  });
  test("_computeEdits no change", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, []);
  });
  test("_computeEdits first line changed", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line One",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, [
      EditOperation.replaceMove(new Range(1, 1, 2, 1), "This is line One\n")
    ]);
  });
  test("_computeEdits EOL changed", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\r\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, []);
  });
  test("_computeEdits EOL and other change 1", function() {
    const model = disposables.add(createTextModel(
      [
        "This is line one",
        //16
        "and this is line number two",
        //27
        "it is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "This is line One",
        //16
        "and this is line number two",
        //27
        "It is followed by #3",
        //20
        "and finished with the fourth."
        //29
      ].join("\r\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, [
      EditOperation.replaceMove(
        new Range(1, 1, 4, 1),
        [
          "This is line One",
          "and this is line number two",
          "It is followed by #3",
          ""
        ].join("\r\n")
      )
    ]);
  });
  test("_computeEdits EOL and other change 2", function() {
    const model = disposables.add(createTextModel(
      [
        "package main",
        // 1
        "func foo() {",
        // 2
        "}"
        // 3
      ].join("\n")
    ));
    const textBuffer = createAndRegisterTextBuffer(
      disposables,
      [
        "package main",
        // 1
        "func foo() {",
        // 2
        "}",
        // 3
        ""
      ].join("\r\n"),
      DefaultEndOfLine.LF
    );
    const actual = ModelService._computeEdits(model, textBuffer);
    assert.deepStrictEqual(actual, [
      EditOperation.replaceMove(new Range(3, 2, 3, 2), "\r\n")
    ]);
  });
  test("generated1", () => {
    const file1 = ["pram", "okctibad", "pjuwtemued", "knnnm", "u", ""];
    const file2 = ["tcnr", "rxwlicro", "vnzy", "", "", "pjzcogzur", "ptmxyp", "dfyshia", "pee", "ygg"];
    assertComputeEdits(file1, file2);
  });
  test("generated2", () => {
    const file1 = ["", "itls", "hrilyhesv", ""];
    const file2 = ["vdl", "", "tchgz", "bhx", "nyl"];
    assertComputeEdits(file1, file2);
  });
  test("generated3", () => {
    const file1 = ["ubrbrcv", "wv", "xodspybszt", "s", "wednjxm", "fklajt", "fyfc", "lvejgge", "rtpjlodmmk", "arivtgmjdm"];
    const file2 = ["s", "qj", "tu", "ur", "qerhjjhyvx", "t"];
    assertComputeEdits(file1, file2);
  });
  test("generated4", () => {
    const file1 = ["ig", "kh", "hxegci", "smvker", "pkdmjjdqnv", "vgkkqqx", "", "jrzeb"];
    const file2 = ["yk", ""];
    assertComputeEdits(file1, file2);
  });
  test("does insertions in the middle of the document", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 2",
      "line 5",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does insertions at the end of the document", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 2",
      "line 3",
      "line 4"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does insertions at the beginning of the document", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 0",
      "line 1",
      "line 2",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does replacements", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 7",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does deletions", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3"
    ];
    const file2 = [
      "line 1",
      "line 3"
    ];
    assertComputeEdits(file1, file2);
  });
  test("does insert, replace, and delete", () => {
    const file1 = [
      "line 1",
      "line 2",
      "line 3",
      "line 4",
      "line 5"
    ];
    const file2 = [
      "line 0",
      // insert line 0
      "line 1",
      "replace line 2",
      // replace line 2
      "line 3",
      // delete line 4
      "line 5"
    ];
    assertComputeEdits(file1, file2);
  });
  test("maintains undo for same resource and same content", () => {
    const resource = URI.parse("file://test.txt");
    const model1 = modelService.createModel("text", null, resource);
    model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model1.getValue(), "text1");
    modelService.destroyModel(resource);
    const model2 = modelService.createModel("text1", null, resource);
    model2.undo();
    assert.strictEqual(model2.getValue(), "text");
    modelService.destroyModel(resource);
  });
  test("maintains version id and alternative version id for same resource and same content", () => {
    const resource = URI.parse("file://test.txt");
    const model1 = modelService.createModel("text", null, resource);
    model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model1.getValue(), "text1");
    const versionId = model1.getVersionId();
    const alternativeVersionId = model1.getAlternativeVersionId();
    modelService.destroyModel(resource);
    const model2 = modelService.createModel("text1", null, resource);
    assert.strictEqual(model2.getVersionId(), versionId);
    assert.strictEqual(model2.getAlternativeVersionId(), alternativeVersionId);
    modelService.destroyModel(resource);
  });
  test("does not maintain undo for same resource and different content", () => {
    const resource = URI.parse("file://test.txt");
    const model1 = modelService.createModel("text", null, resource);
    model1.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model1.getValue(), "text1");
    modelService.destroyModel(resource);
    const model2 = modelService.createModel("text2", null, resource);
    model2.undo();
    assert.strictEqual(model2.getValue(), "text2");
    modelService.destroyModel(resource);
  });
  test("setValue should clear undo stack", () => {
    const resource = URI.parse("file://test.txt");
    const model = modelService.createModel("text", null, resource);
    model.pushEditOperations(null, [{ range: new Range(1, 5, 1, 5), text: "1" }], () => [new Selection(1, 5, 1, 5)]);
    assert.strictEqual(model.getValue(), "text1");
    model.setValue("text2");
    model.undo();
    assert.strictEqual(model.getValue(), "text2");
    modelService.destroyModel(resource);
  });
});
function assertComputeEdits(lines1, lines2) {
  const model = createTextModel(lines1.join("\n"));
  const { disposable, textBuffer } = createTextBuffer(lines2.join("\n"), DefaultEndOfLine.LF);
  const edits = ModelService._computeEdits(model, textBuffer);
  model.pushEditOperations([], edits, null);
  assert.strictEqual(model.getValue(), lines2.join("\n"));
  disposable.dispose();
  model.dispose();
}
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function getRandomString(minLength, maxLength) {
  const length = getRandomInt(minLength, maxLength);
  const t = new StringBuilder(length);
  for (let i = 0; i < length; i++) {
    t.appendASCIICharCode(getRandomInt(CharCode.a, CharCode.z));
  }
  return t.build();
}
function generateFile(small) {
  const lineCount = getRandomInt(1, small ? 3 : 1e4);
  const lines = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(getRandomString(0, small ? 3 : 1e4));
  }
  return lines;
}
if (GENERATE_TESTS) {
  let number = 1;
  while (true) {
    console.log("------TEST: " + number++);
    const file1 = generateFile(true);
    const file2 = generateFile(true);
    console.log("------TEST GENERATED");
    try {
      assertComputeEdits(file1, file2);
    } catch (err) {
      console.log(err);
      console.log(`
const file1 = ${JSON.stringify(file1).replace(/"/g, "'")};
const file2 = ${JSON.stringify(file2).replace(/"/g, "'")};
assertComputeEdits(file1, file2);
`);
      break;
    }
  }
}
function createAndRegisterTextBuffer(store, value, defaultEOL) {
  const { disposable, textBuffer } = createTextBuffer(value, defaultEOL);
  store.add(disposable);
  return textBuffer;
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcc2VydmljZXNcXG1vZGVsU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgU3RyaW5nQnVpbGRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3N0cmluZ0J1aWxkZXIuanMnO1xuaW1wb3J0IHsgRGVmYXVsdEVuZE9mTGluZSwgSVRleHRCdWZmZXIsIElUZXh0QnVmZmVyRmFjdG9yeSwgSVRleHRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0QnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsU2VydmljZXMsIGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY29uc3QgR0VORVJBVEVfVEVTVFMgPSBmYWxzZTtcblxuc3VpdGUoJ01vZGVsU2VydmljZScsICgpID0+IHtcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZmlsZXMnLCB7ICdlb2wnOiAnXFxuJyB9KTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdmaWxlcycsIHsgJ2VvbCc6ICdcXHJcXG4nIH0sIFVSSS5maWxlKHBsYXRmb3JtLmlzV2luZG93cyA/ICdjOlxcXFxteXJvb3QnIDogJy9teXJvb3QnKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMsIFtcblx0XHRcdFtJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1NlcnZpY2VdXG5cdFx0XSk7XG5cdFx0bW9kZWxTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdFT0wgc2V0dGluZyByZXNwZWN0ZWQgZGVwZW5kaW5nIG9uIHJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwxID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCdmYXJib28nLCBudWxsKTtcblx0XHRjb25zdCBtb2RlbDIgPSBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJ2ZhcmJvbycsIG51bGwsIFVSSS5maWxlKHBsYXRmb3JtLmlzV2luZG93cyA/ICdjOlxcXFxteXJvb3RcXFxcbXlmaWxlLnR4dCcgOiAnL215cm9vdC9teWZpbGUudHh0JykpO1xuXHRcdGNvbnN0IG1vZGVsMyA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnZmFyYm9vJywgbnVsbCwgVVJJLmZpbGUocGxhdGZvcm0uaXNXaW5kb3dzID8gJ2M6XFxcXG90aGVyXFxcXG15ZmlsZS50eHQnIDogJy9vdGhlci9teWZpbGUudHh0JykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMS5nZXRPcHRpb25zKCkuZGVmYXVsdEVPTCwgRGVmYXVsdEVuZE9mTGluZS5MRik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMi5nZXRPcHRpb25zKCkuZGVmYXVsdEVPTCwgRGVmYXVsdEVuZE9mTGluZS5DUkxGKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwzLmdldE9wdGlvbnMoKS5kZWZhdWx0RU9MLCBEZWZhdWx0RW5kT2ZMaW5lLkxGKTtcblxuXHRcdG1vZGVsMS5kaXNwb3NlKCk7XG5cdFx0bW9kZWwyLmRpc3Bvc2UoKTtcblx0XHRtb2RlbDMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdfY29tcHV0ZUVkaXRzIG5vIGNoYW5nZScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLCAvLzE2XG5cdFx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IGNyZWF0ZUFuZFJlZ2lzdGVyVGV4dEJ1ZmZlcihcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsIC8vMTZcblx0XHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsIC8vMjdcblx0XHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJywgLy8yMFxuXHRcdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLCAvLzI5XG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0RGVmYXVsdEVuZE9mTGluZS5MRlxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBNb2RlbFNlcnZpY2UuX2NvbXB1dGVFZGl0cyhtb2RlbCwgdGV4dEJ1ZmZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdfY29tcHV0ZUVkaXRzIGZpcnN0IGxpbmUgY2hhbmdlZCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLCAvLzE2XG5cdFx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IGNyZWF0ZUFuZFJlZ2lzdGVyVGV4dEJ1ZmZlcihcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyBsaW5lIE9uZScsIC8vMTZcblx0XHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsIC8vMjdcblx0XHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJywgLy8yMFxuXHRcdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLCAvLzI5XG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0RGVmYXVsdEVuZE9mTGluZS5MRlxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBNb2RlbFNlcnZpY2UuX2NvbXB1dGVFZGl0cyhtb2RlbCwgdGV4dEJ1ZmZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSksICdUaGlzIGlzIGxpbmUgT25lXFxuJylcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnX2NvbXB1dGVFZGl0cyBFT0wgY2hhbmdlZCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgbGluZSBvbmUnLCAvLzE2XG5cdFx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHRcdCdpdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IGNyZWF0ZUFuZFJlZ2lzdGVyVGV4dEJ1ZmZlcihcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0W1xuXHRcdFx0XHQnVGhpcyBpcyBsaW5lIG9uZScsIC8vMTZcblx0XHRcdFx0J2FuZCB0aGlzIGlzIGxpbmUgbnVtYmVyIHR3bycsIC8vMjdcblx0XHRcdFx0J2l0IGlzIGZvbGxvd2VkIGJ5ICMzJywgLy8yMFxuXHRcdFx0XHQnYW5kIGZpbmlzaGVkIHdpdGggdGhlIGZvdXJ0aC4nLCAvLzI5XG5cdFx0XHRdLmpvaW4oJ1xcclxcbicpLFxuXHRcdFx0RGVmYXVsdEVuZE9mTGluZS5MRlxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBNb2RlbFNlcnZpY2UuX2NvbXB1dGVFZGl0cyhtb2RlbCwgdGV4dEJ1ZmZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdfY29tcHV0ZUVkaXRzIEVPTCBhbmQgb3RoZXIgY2hhbmdlIDEnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdUaGlzIGlzIGxpbmUgb25lJywgLy8xNlxuXHRcdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJywgLy8yN1xuXHRcdFx0XHQnaXQgaXMgZm9sbG93ZWQgYnkgIzMnLCAvLzIwXG5cdFx0XHRcdCdhbmQgZmluaXNoZWQgd2l0aCB0aGUgZm91cnRoLicsIC8vMjlcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpKTtcblxuXHRcdGNvbnN0IHRleHRCdWZmZXIgPSBjcmVhdGVBbmRSZWdpc3RlclRleHRCdWZmZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdFtcblx0XHRcdFx0J1RoaXMgaXMgbGluZSBPbmUnLCAvLzE2XG5cdFx0XHRcdCdhbmQgdGhpcyBpcyBsaW5lIG51bWJlciB0d28nLCAvLzI3XG5cdFx0XHRcdCdJdCBpcyBmb2xsb3dlZCBieSAjMycsIC8vMjBcblx0XHRcdFx0J2FuZCBmaW5pc2hlZCB3aXRoIHRoZSBmb3VydGguJywgLy8yOVxuXHRcdFx0XS5qb2luKCdcXHJcXG4nKSxcblx0XHRcdERlZmF1bHRFbmRPZkxpbmUuTEZcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gTW9kZWxTZXJ2aWNlLl9jb21wdXRlRWRpdHMobW9kZWwsIHRleHRCdWZmZXIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdEVkaXRPcGVyYXRpb24ucmVwbGFjZU1vdmUoXG5cdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCA0LCAxKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdUaGlzIGlzIGxpbmUgT25lJyxcblx0XHRcdFx0XHQnYW5kIHRoaXMgaXMgbGluZSBudW1iZXIgdHdvJyxcblx0XHRcdFx0XHQnSXQgaXMgZm9sbG93ZWQgYnkgIzMnLFxuXHRcdFx0XHRcdCcnXG5cdFx0XHRcdF0uam9pbignXFxyXFxuJylcblx0XHRcdClcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnX2NvbXB1dGVFZGl0cyBFT0wgYW5kIG90aGVyIGNoYW5nZSAyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQncGFja2FnZSBtYWluJyxcdC8vIDFcblx0XHRcdFx0J2Z1bmMgZm9vKCkgeycsXHQvLyAyXG5cdFx0XHRcdCd9J1x0XHRcdFx0Ly8gM1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgdGV4dEJ1ZmZlciA9IGNyZWF0ZUFuZFJlZ2lzdGVyVGV4dEJ1ZmZlcihcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0W1xuXHRcdFx0XHQncGFja2FnZSBtYWluJyxcdC8vIDFcblx0XHRcdFx0J2Z1bmMgZm9vKCkgeycsXHQvLyAyXG5cdFx0XHRcdCd9JyxcdFx0XHQvLyAzXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcclxcbicpLFxuXHRcdFx0RGVmYXVsdEVuZE9mTGluZS5MRlxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBNb2RlbFNlcnZpY2UuX2NvbXB1dGVFZGl0cyhtb2RlbCwgdGV4dEJ1ZmZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0RWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShuZXcgUmFuZ2UoMywgMiwgMywgMiksICdcXHJcXG4nKVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZW5lcmF0ZWQxJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGUxID0gWydwcmFtJywgJ29rY3RpYmFkJywgJ3BqdXd0ZW11ZWQnLCAna25ubm0nLCAndScsICcnXTtcblx0XHRjb25zdCBmaWxlMiA9IFsndGNucicsICdyeHdsaWNybycsICd2bnp5JywgJycsICcnLCAncGp6Y29nenVyJywgJ3B0bXh5cCcsICdkZnlzaGlhJywgJ3BlZScsICd5Z2cnXTtcblx0XHRhc3NlcnRDb21wdXRlRWRpdHMoZmlsZTEsIGZpbGUyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJhdGVkMicsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFsnJywgJ2l0bHMnLCAnaHJpbHloZXN2JywgJyddO1xuXHRcdGNvbnN0IGZpbGUyID0gWyd2ZGwnLCAnJywgJ3RjaGd6JywgJ2JoeCcsICdueWwnXTtcblx0XHRhc3NlcnRDb21wdXRlRWRpdHMoZmlsZTEsIGZpbGUyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJhdGVkMycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFsndWJyYnJjdicsICd3dicsICd4b2RzcHlic3p0JywgJ3MnLCAnd2Vkbmp4bScsICdma2xhanQnLCAnZnlmYycsICdsdmVqZ2dlJywgJ3J0cGpsb2RtbWsnLCAnYXJpdnRnbWpkbSddO1xuXHRcdGNvbnN0IGZpbGUyID0gWydzJywgJ3FqJywgJ3R1JywgJ3VyJywgJ3Flcmhqamh5dngnLCAndCddO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZW5lcmF0ZWQ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGUxID0gWydpZycsICdraCcsICdoeGVnY2knLCAnc212a2VyJywgJ3BrZG1qamRxbnYnLCAndmdra3FxeCcsICcnLCAnanJ6ZWInXTtcblx0XHRjb25zdCBmaWxlMiA9IFsneWsnLCAnJ107XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgaW5zZXJ0aW9ucyBpbiB0aGUgbWlkZGxlIG9mIHRoZSBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0Y29uc3QgZmlsZTIgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgNScsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgaW5zZXJ0aW9ucyBhdCB0aGUgZW5kIG9mIHRoZSBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0Y29uc3QgZmlsZTIgPSBbXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdsaW5lIDInLFxuXHRcdFx0J2xpbmUgMycsXG5cdFx0XHQnbGluZSA0J1xuXHRcdF07XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgaW5zZXJ0aW9ucyBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0Y29uc3QgZmlsZTIgPSBbXG5cdFx0XHQnbGluZSAwJyxcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgcmVwbGFjZW1lbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGUxID0gW1xuXHRcdFx0J2xpbmUgMScsXG5cdFx0XHQnbGluZSAyJyxcblx0XHRcdCdsaW5lIDMnXG5cdFx0XTtcblx0XHRjb25zdCBmaWxlMiA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgNycsXG5cdFx0XHQnbGluZSAzJ1xuXHRcdF07XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgZGVsZXRpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGUxID0gW1xuXHRcdFx0J2xpbmUgMScsXG5cdFx0XHQnbGluZSAyJyxcblx0XHRcdCdsaW5lIDMnXG5cdFx0XTtcblx0XHRjb25zdCBmaWxlMiA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMydcblx0XHRdO1xuXHRcdGFzc2VydENvbXB1dGVFZGl0cyhmaWxlMSwgZmlsZTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGluc2VydCwgcmVwbGFjZSwgYW5kIGRlbGV0ZScsICgpID0+IHtcblx0XHRjb25zdCBmaWxlMSA9IFtcblx0XHRcdCdsaW5lIDEnLFxuXHRcdFx0J2xpbmUgMicsXG5cdFx0XHQnbGluZSAzJyxcblx0XHRcdCdsaW5lIDQnLFxuXHRcdFx0J2xpbmUgNScsXG5cdFx0XTtcblx0XHRjb25zdCBmaWxlMiA9IFtcblx0XHRcdCdsaW5lIDAnLCAvLyBpbnNlcnQgbGluZSAwXG5cdFx0XHQnbGluZSAxJyxcblx0XHRcdCdyZXBsYWNlIGxpbmUgMicsIC8vIHJlcGxhY2UgbGluZSAyXG5cdFx0XHQnbGluZSAzJyxcblx0XHRcdC8vIGRlbGV0ZSBsaW5lIDRcblx0XHRcdCdsaW5lIDUnLFxuXHRcdF07XG5cdFx0YXNzZXJ0Q29tcHV0ZUVkaXRzKGZpbGUxLCBmaWxlMik7XG5cdH0pO1xuXG5cdHRlc3QoJ21haW50YWlucyB1bmRvIGZvciBzYW1lIHJlc291cmNlIGFuZCBzYW1lIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZpbGU6Ly90ZXN0LnR4dCcpO1xuXG5cdFx0Ly8gY3JlYXRlIGEgbW9kZWxcblx0XHRjb25zdCBtb2RlbDEgPSBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJ3RleHQnLCBudWxsLCByZXNvdXJjZSk7XG5cdFx0Ly8gbWFrZSBhbiBlZGl0XG5cdFx0bW9kZWwxLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCB0ZXh0OiAnMScgfV0sICgpID0+IFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMS5nZXRWYWx1ZSgpLCAndGV4dDEnKTtcblx0XHQvLyBkaXNwb3NlIGl0XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChyZXNvdXJjZSk7XG5cblx0XHQvLyBjcmVhdGUgYSBuZXcgbW9kZWwgd2l0aCB0aGUgc2FtZSBjb250ZW50XG5cdFx0Y29uc3QgbW9kZWwyID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCd0ZXh0MScsIG51bGwsIHJlc291cmNlKTtcblx0XHQvLyB1bmRvXG5cdFx0bW9kZWwyLnVuZG8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwyLmdldFZhbHVlKCksICd0ZXh0Jyk7XG5cdFx0Ly8gZGlzcG9zZSBpdFxuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwocmVzb3VyY2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYWludGFpbnMgdmVyc2lvbiBpZCBhbmQgYWx0ZXJuYXRpdmUgdmVyc2lvbiBpZCBmb3Igc2FtZSByZXNvdXJjZSBhbmQgc2FtZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaWxlOi8vdGVzdC50eHQnKTtcblxuXHRcdC8vIGNyZWF0ZSBhIG1vZGVsXG5cdFx0Y29uc3QgbW9kZWwxID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCd0ZXh0JywgbnVsbCwgcmVzb3VyY2UpO1xuXHRcdC8vIG1ha2UgYW4gZWRpdFxuXHRcdG1vZGVsMS5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgdGV4dDogJzEnIH1dLCAoKSA9PiBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDEuZ2V0VmFsdWUoKSwgJ3RleHQxJyk7XG5cdFx0Y29uc3QgdmVyc2lvbklkID0gbW9kZWwxLmdldFZlcnNpb25JZCgpO1xuXHRcdGNvbnN0IGFsdGVybmF0aXZlVmVyc2lvbklkID0gbW9kZWwxLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCk7XG5cdFx0Ly8gZGlzcG9zZSBpdFxuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwocmVzb3VyY2UpO1xuXG5cdFx0Ly8gY3JlYXRlIGEgbmV3IG1vZGVsIHdpdGggdGhlIHNhbWUgY29udGVudFxuXHRcdGNvbnN0IG1vZGVsMiA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgndGV4dDEnLCBudWxsLCByZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMi5nZXRWZXJzaW9uSWQoKSwgdmVyc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwyLmdldEFsdGVybmF0aXZlVmVyc2lvbklkKCksIGFsdGVybmF0aXZlVmVyc2lvbklkKTtcblx0XHQvLyBkaXNwb3NlIGl0XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChyZXNvdXJjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG1haW50YWluIHVuZG8gZm9yIHNhbWUgcmVzb3VyY2UgYW5kIGRpZmZlcmVudCBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaWxlOi8vdGVzdC50eHQnKTtcblxuXHRcdC8vIGNyZWF0ZSBhIG1vZGVsXG5cdFx0Y29uc3QgbW9kZWwxID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCd0ZXh0JywgbnVsbCwgcmVzb3VyY2UpO1xuXHRcdC8vIG1ha2UgYW4gZWRpdFxuXHRcdG1vZGVsMS5wdXNoRWRpdE9wZXJhdGlvbnMobnVsbCwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA1LCAxLCA1KSwgdGV4dDogJzEnIH1dLCAoKSA9PiBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbDEuZ2V0VmFsdWUoKSwgJ3RleHQxJyk7XG5cdFx0Ly8gZGlzcG9zZSBpdFxuXHRcdG1vZGVsU2VydmljZS5kZXN0cm95TW9kZWwocmVzb3VyY2UpO1xuXG5cdFx0Ly8gY3JlYXRlIGEgbmV3IG1vZGVsIHdpdGggdGhlIHNhbWUgY29udGVudFxuXHRcdGNvbnN0IG1vZGVsMiA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgndGV4dDInLCBudWxsLCByZXNvdXJjZSk7XG5cdFx0Ly8gdW5kb1xuXHRcdG1vZGVsMi51bmRvKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsMi5nZXRWYWx1ZSgpLCAndGV4dDInKTtcblx0XHQvLyBkaXNwb3NlIGl0XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChyZXNvdXJjZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFZhbHVlIHNob3VsZCBjbGVhciB1bmRvIHN0YWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaWxlOi8vdGVzdC50eHQnKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCd0ZXh0JywgbnVsbCwgcmVzb3VyY2UpO1xuXHRcdG1vZGVsLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDUsIDEsIDUpLCB0ZXh0OiAnMScgfV0sICgpID0+IFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd0ZXh0MScpO1xuXG5cdFx0bW9kZWwuc2V0VmFsdWUoJ3RleHQyJyk7XG5cdFx0bW9kZWwudW5kbygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAndGV4dDInKTtcblx0XHQvLyBkaXNwb3NlIGl0XG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChyZXNvdXJjZSk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIGFzc2VydENvbXB1dGVFZGl0cyhsaW5lczE6IHN0cmluZ1tdLCBsaW5lczI6IHN0cmluZ1tdKTogdm9pZCB7XG5cdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKGxpbmVzMS5qb2luKCdcXG4nKSk7XG5cdGNvbnN0IHsgZGlzcG9zYWJsZSwgdGV4dEJ1ZmZlciB9ID0gY3JlYXRlVGV4dEJ1ZmZlcihsaW5lczIuam9pbignXFxuJyksIERlZmF1bHRFbmRPZkxpbmUuTEYpO1xuXG5cdC8vIGNvbXB1dGUgcmVxdWlyZWQgZWRpdHNcblx0Ly8gbGV0IHN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0Y29uc3QgZWRpdHMgPSBNb2RlbFNlcnZpY2UuX2NvbXB1dGVFZGl0cyhtb2RlbCwgdGV4dEJ1ZmZlcik7XG5cdC8vIGNvbnNvbGUubG9nKGB0b29rICR7RGF0ZS5ub3coKSAtIHN0YXJ0fSBtcy5gKTtcblxuXHQvLyBhcHBseSBlZGl0c1xuXHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW10sIGVkaXRzLCBudWxsKTtcblxuXHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgbGluZXMyLmpvaW4oJ1xcbicpKTtcblx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdG1vZGVsLmRpc3Bvc2UoKTtcbn1cblxuZnVuY3Rpb24gZ2V0UmFuZG9tSW50KG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpICsgbWluO1xufVxuXG5mdW5jdGlvbiBnZXRSYW5kb21TdHJpbmcobWluTGVuZ3RoOiBudW1iZXIsIG1heExlbmd0aDogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgbGVuZ3RoID0gZ2V0UmFuZG9tSW50KG1pbkxlbmd0aCwgbWF4TGVuZ3RoKTtcblx0Y29uc3QgdCA9IG5ldyBTdHJpbmdCdWlsZGVyKGxlbmd0aCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHR0LmFwcGVuZEFTQ0lJQ2hhckNvZGUoZ2V0UmFuZG9tSW50KENoYXJDb2RlLmEsIENoYXJDb2RlLnopKTtcblx0fVxuXHRyZXR1cm4gdC5idWlsZCgpO1xufVxuXG5mdW5jdGlvbiBnZW5lcmF0ZUZpbGUoc21hbGw6IGJvb2xlYW4pOiBzdHJpbmdbXSB7XG5cdGNvbnN0IGxpbmVDb3VudCA9IGdldFJhbmRvbUludCgxLCBzbWFsbCA/IDMgOiAxMDAwMCk7XG5cdGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVDb3VudDsgaSsrKSB7XG5cdFx0bGluZXMucHVzaChnZXRSYW5kb21TdHJpbmcoMCwgc21hbGwgPyAzIDogMTAwMDApKTtcblx0fVxuXHRyZXR1cm4gbGluZXM7XG59XG5cbmlmIChHRU5FUkFURV9URVNUUykge1xuXHRsZXQgbnVtYmVyID0gMTtcblx0d2hpbGUgKHRydWUpIHtcblxuXHRcdGNvbnNvbGUubG9nKCctLS0tLS1URVNUOiAnICsgbnVtYmVyKyspO1xuXG5cdFx0Y29uc3QgZmlsZTEgPSBnZW5lcmF0ZUZpbGUodHJ1ZSk7XG5cdFx0Y29uc3QgZmlsZTIgPSBnZW5lcmF0ZUZpbGUodHJ1ZSk7XG5cblx0XHRjb25zb2xlLmxvZygnLS0tLS0tVEVTVCBHRU5FUkFURUQnKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnRDb21wdXRlRWRpdHMoZmlsZTEsIGZpbGUyKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnNvbGUubG9nKGVycik7XG5cdFx0XHRjb25zb2xlLmxvZyhgXG5jb25zdCBmaWxlMSA9ICR7SlNPTi5zdHJpbmdpZnkoZmlsZTEpLnJlcGxhY2UoL1wiL2csICdcXCcnKX07XG5jb25zdCBmaWxlMiA9ICR7SlNPTi5zdHJpbmdpZnkoZmlsZTIpLnJlcGxhY2UoL1wiL2csICdcXCcnKX07XG5hc3NlcnRDb21wdXRlRWRpdHMoZmlsZTEsIGZpbGUyKTtcbmApO1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUFuZFJlZ2lzdGVyVGV4dEJ1ZmZlcihzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCB2YWx1ZTogc3RyaW5nIHwgSVRleHRCdWZmZXJGYWN0b3J5IHwgSVRleHRTbmFwc2hvdCwgZGVmYXVsdEVPTDogRGVmYXVsdEVuZE9mTGluZSk6IElUZXh0QnVmZmVyIHtcblx0Y29uc3QgeyBkaXNwb3NhYmxlLCB0ZXh0QnVmZmVyIH0gPSBjcmVhdGVUZXh0QnVmZmVyKHZhbHVlLCBkZWZhdWx0RU9MKTtcblx0c3RvcmUuYWRkKGRpc3Bvc2FibGUpO1xuXHRyZXR1cm4gdGV4dEJ1ZmZlcjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLGNBQWM7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3RTtB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
