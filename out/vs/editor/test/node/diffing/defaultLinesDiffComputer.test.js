import assert from "assert";
import { Range } from "../../../common/core/range.js";
import { getLineRangeMapping, RangeMapping } from "../../../common/diff/rangeMapping.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { LinesSliceCharSequence } from "../../../common/diff/defaultLinesDiffComputer/linesSliceCharSequence.js";
import { MyersDiffAlgorithm } from "../../../common/diff/defaultLinesDiffComputer/algorithms/myersDiffAlgorithm.js";
import "../../../common/diff/defaultLinesDiffComputer/algorithms/dynamicProgrammingDiffing.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ArrayText } from "../../../common/core/text/abstractText.js";
suite("myers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("1", () => {
    const s1 = new LinesSliceCharSequence(["hello world"], new Range(1, 1, 1, Number.MAX_SAFE_INTEGER), true);
    const s2 = new LinesSliceCharSequence(["hallo welt"], new Range(1, 1, 1, Number.MAX_SAFE_INTEGER), true);
    const a = true ? new MyersDiffAlgorithm() : new DynamicProgrammingDiffing();
    a.compute(s1, s2);
  });
});
suite("lineRangeMapping", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Simple", () => {
    assert.deepStrictEqual(
      getLineRangeMapping(
        new RangeMapping(
          new Range(2, 1, 3, 1),
          new Range(2, 1, 2, 1)
        ),
        new ArrayText([
          'const abc = "helloworld".split("");',
          "",
          ""
        ]),
        new ArrayText([
          'const asciiLower = "helloworld".split("");',
          ""
        ])
      ).toString(),
      "{[2,3)->[2,2)}"
    );
  });
  test("Empty Lines", () => {
    assert.deepStrictEqual(
      getLineRangeMapping(
        new RangeMapping(
          new Range(2, 1, 2, 1),
          new Range(2, 1, 4, 1)
        ),
        new ArrayText([
          "",
          ""
        ]),
        new ArrayText([
          "",
          "",
          "",
          ""
        ])
      ).toString(),
      "{[2,2)->[2,4)}"
    );
  });
});
suite("LinesSliceCharSequence", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const sequence = new LinesSliceCharSequence(
    [
      "line1: foo",
      "line2: fizzbuzz",
      "line3: barr",
      "line4: hello world",
      "line5: bazz"
    ],
    new Range(2, 1, 5, 1),
    true
  );
  test("translateOffset", () => {
    assert.deepStrictEqual(
      { result: OffsetRange.ofLength(sequence.length).map((offset) => sequence.translateOffset(offset).toString()) },
      {
        result: [
          "(2,1)",
          "(2,2)",
          "(2,3)",
          "(2,4)",
          "(2,5)",
          "(2,6)",
          "(2,7)",
          "(2,8)",
          "(2,9)",
          "(2,10)",
          "(2,11)",
          "(2,12)",
          "(2,13)",
          "(2,14)",
          "(2,15)",
          "(2,16)",
          "(3,1)",
          "(3,2)",
          "(3,3)",
          "(3,4)",
          "(3,5)",
          "(3,6)",
          "(3,7)",
          "(3,8)",
          "(3,9)",
          "(3,10)",
          "(3,11)",
          "(3,12)",
          "(4,1)",
          "(4,2)",
          "(4,3)",
          "(4,4)",
          "(4,5)",
          "(4,6)",
          "(4,7)",
          "(4,8)",
          "(4,9)",
          "(4,10)",
          "(4,11)",
          "(4,12)",
          "(4,13)",
          "(4,14)",
          "(4,15)",
          "(4,16)",
          "(4,17)",
          "(4,18)",
          "(4,19)"
        ]
      }
    );
  });
  test("extendToFullLines", () => {
    assert.deepStrictEqual(
      { result: sequence.getText(sequence.extendToFullLines(new OffsetRange(20, 25))) },
      { result: "line3: barr\n" }
    );
    assert.deepStrictEqual(
      { result: sequence.getText(sequence.extendToFullLines(new OffsetRange(20, 45))) },
      { result: "line3: barr\nline4: hello world\n" }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXG5vZGVcXGRpZmZpbmdcXGRlZmF1bHRMaW5lc0RpZmZDb21wdXRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBnZXRMaW5lUmFuZ2VNYXBwaW5nLCBSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZXNTbGljZUNoYXJTZXF1ZW5jZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL2RlZmF1bHRMaW5lc0RpZmZDb21wdXRlci9saW5lc1NsaWNlQ2hhclNlcXVlbmNlLmpzJztcbmltcG9ydCB7IE15ZXJzRGlmZkFsZ29yaXRobSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL2RlZmF1bHRMaW5lc0RpZmZDb21wdXRlci9hbGdvcml0aG1zL215ZXJzRGlmZkFsZ29yaXRobS5qcyc7XG5pbXBvcnQgeyBEeW5hbWljUHJvZ3JhbW1pbmdEaWZmaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RpZmYvZGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyL2FsZ29yaXRobXMvZHluYW1pY1Byb2dyYW1taW5nRGlmZmluZy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFycmF5VGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3RleHQvYWJzdHJhY3RUZXh0LmpzJztcblxuc3VpdGUoJ215ZXJzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCcxJywgKCkgPT4ge1xuXHRcdGNvbnN0IHMxID0gbmV3IExpbmVzU2xpY2VDaGFyU2VxdWVuY2UoWydoZWxsbyB3b3JsZCddLCBuZXcgUmFuZ2UoMSwgMSwgMSwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpLCB0cnVlKTtcblx0XHRjb25zdCBzMiA9IG5ldyBMaW5lc1NsaWNlQ2hhclNlcXVlbmNlKFsnaGFsbG8gd2VsdCddLCBuZXcgUmFuZ2UoMSwgMSwgMSwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpLCB0cnVlKTtcblxuXHRcdGNvbnN0IGEgPSB0cnVlID8gbmV3IE15ZXJzRGlmZkFsZ29yaXRobSgpIDogbmV3IER5bmFtaWNQcm9ncmFtbWluZ0RpZmZpbmcoKTtcblx0XHRhLmNvbXB1dGUoczEsIHMyKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2xpbmVSYW5nZU1hcHBpbmcnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ1NpbXBsZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Z2V0TGluZVJhbmdlTWFwcGluZyhcblx0XHRcdFx0bmV3IFJhbmdlTWFwcGluZyhcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMiwgMSwgMywgMSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDIsIDEsIDIsIDEpXG5cdFx0XHRcdCksXG5cdFx0XHRcdG5ldyBBcnJheVRleHQoW1xuXHRcdFx0XHRcdCdjb25zdCBhYmMgPSBcImhlbGxvd29ybGRcIi5zcGxpdChcIlwiKTsnLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCcnXG5cdFx0XHRcdF0pLFxuXHRcdFx0XHRuZXcgQXJyYXlUZXh0KFtcblx0XHRcdFx0XHQnY29uc3QgYXNjaWlMb3dlciA9IFwiaGVsbG93b3JsZFwiLnNwbGl0KFwiXCIpOycsXG5cdFx0XHRcdFx0Jydcblx0XHRcdFx0XSlcblx0XHRcdCkudG9TdHJpbmcoKSxcblx0XHRcdCd7WzIsMyktPlsyLDIpfSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdFbXB0eSBMaW5lcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Z2V0TGluZVJhbmdlTWFwcGluZyhcblx0XHRcdFx0bmV3IFJhbmdlTWFwcGluZyhcblx0XHRcdFx0XHRuZXcgUmFuZ2UoMiwgMSwgMiwgMSksXG5cdFx0XHRcdFx0bmV3IFJhbmdlKDIsIDEsIDQsIDEpLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRuZXcgQXJyYXlUZXh0KFtcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XSksXG5cdFx0XHRcdG5ldyBBcnJheVRleHQoW1xuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRdKVxuXHRcdFx0KS50b1N0cmluZygpLFxuXHRcdFx0J3tbMiwyKS0+WzIsNCl9J1xuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdMaW5lc1NsaWNlQ2hhclNlcXVlbmNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXF1ZW5jZSA9IG5ldyBMaW5lc1NsaWNlQ2hhclNlcXVlbmNlKFxuXHRcdFtcblx0XHRcdCdsaW5lMTogZm9vJyxcblx0XHRcdCdsaW5lMjogZml6emJ1enonLFxuXHRcdFx0J2xpbmUzOiBiYXJyJyxcblx0XHRcdCdsaW5lNDogaGVsbG8gd29ybGQnLFxuXHRcdFx0J2xpbmU1OiBiYXp6Jyxcblx0XHRdLFxuXHRcdG5ldyBSYW5nZSgyLCAxLCA1LCAxKSwgdHJ1ZVxuXHQpO1xuXG5cdHRlc3QoJ3RyYW5zbGF0ZU9mZnNldCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyByZXN1bHQ6IE9mZnNldFJhbmdlLm9mTGVuZ3RoKHNlcXVlbmNlLmxlbmd0aCkubWFwKG9mZnNldCA9PiBzZXF1ZW5jZS50cmFuc2xhdGVPZmZzZXQob2Zmc2V0KS50b1N0cmluZygpKSB9LFxuXHRcdFx0KHtcblx0XHRcdFx0cmVzdWx0OiBbXG5cdFx0XHRcdFx0JygyLDEpJywgJygyLDIpJywgJygyLDMpJywgJygyLDQpJywgJygyLDUpJywgJygyLDYpJywgJygyLDcpJywgJygyLDgpJywgJygyLDkpJywgJygyLDEwKScsICcoMiwxMSknLFxuXHRcdFx0XHRcdCcoMiwxMiknLCAnKDIsMTMpJywgJygyLDE0KScsICcoMiwxNSknLCAnKDIsMTYpJyxcblxuXHRcdFx0XHRcdCcoMywxKScsICcoMywyKScsICcoMywzKScsICcoMyw0KScsICcoMyw1KScsICcoMyw2KScsICcoMyw3KScsICcoMyw4KScsICcoMyw5KScsICcoMywxMCknLCAnKDMsMTEpJywgJygzLDEyKScsXG5cblx0XHRcdFx0XHQnKDQsMSknLCAnKDQsMiknLCAnKDQsMyknLCAnKDQsNCknLCAnKDQsNSknLCAnKDQsNiknLCAnKDQsNyknLCAnKDQsOCknLCAnKDQsOSknLFxuXHRcdFx0XHRcdCcoNCwxMCknLCAnKDQsMTEpJywgJyg0LDEyKScsICcoNCwxMyknLCAnKDQsMTQpJywgJyg0LDE1KScsICcoNCwxNiknLCAnKDQsMTcpJyxcblx0XHRcdFx0XHQnKDQsMTgpJywgJyg0LDE5KSdcblx0XHRcdFx0XVxuXHRcdFx0fSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRlbmRUb0Z1bGxMaW5lcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyByZXN1bHQ6IHNlcXVlbmNlLmdldFRleHQoc2VxdWVuY2UuZXh0ZW5kVG9GdWxsTGluZXMobmV3IE9mZnNldFJhbmdlKDIwLCAyNSkpKSB9LFxuXHRcdFx0KHsgcmVzdWx0OiAnbGluZTM6IGJhcnJcXG4nIH0pXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IHJlc3VsdDogc2VxdWVuY2UuZ2V0VGV4dChzZXF1ZW5jZS5leHRlbmRUb0Z1bGxMaW5lcyhuZXcgT2Zmc2V0UmFuZ2UoMjAsIDQ1KSkpIH0sXG5cdFx0XHQoeyByZXN1bHQ6ICdsaW5lMzogYmFyclxcbmxpbmU0OiBoZWxsbyB3b3JsZFxcbicgfSlcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYTtBQUN0QixTQUFTLHFCQUFxQixvQkFBb0I7QUFDbEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywwQkFBMEI7QUFDbkMsT0FBMEM7QUFDMUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBaUI7QUFFMUIsTUFBTSxTQUFTLE1BQU07QUFDcEIsMENBQXdDO0FBRXhDLE9BQUssS0FBSyxNQUFNO0FBQ2YsVUFBTSxLQUFLLElBQUksdUJBQXVCLENBQUMsYUFBYSxHQUFHLElBQUks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
