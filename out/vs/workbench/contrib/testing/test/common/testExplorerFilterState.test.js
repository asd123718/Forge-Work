import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { TestExplorerFilterState, TestFilterTerm } from "../../common/testExplorerFilterState.js";
suite("TestExplorerFilterState", () => {
  let t;
  let ds;
  teardown(() => {
    ds.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    ds = new DisposableStore();
    t = ds.add(new TestExplorerFilterState(ds.add(new InMemoryStorageService())));
  });
  const assertFilteringFor = (expected) => {
    for (const [term, expectation] of Object.entries(expected)) {
      assert.strictEqual(t.isFilteringFor(term), expectation, `expected filtering for ${term} === ${expectation}`);
    }
  };
  const termFiltersOff = {
    [TestFilterTerm.Failed]: false,
    [TestFilterTerm.Executed]: false,
    [TestFilterTerm.CurrentDoc]: false,
    [TestFilterTerm.Hidden]: false
  };
  test("filters simple globs", () => {
    t.setText("hello, !world");
    assert.deepStrictEqual(t.globList, [{ text: "hello", include: true }, { text: "world", include: false }]);
    assert.deepStrictEqual(t.includeTags, /* @__PURE__ */ new Set());
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set());
    assertFilteringFor(termFiltersOff);
  });
  test("filters to patterns", () => {
    t.setText("@doc");
    assert.deepStrictEqual(t.globList, []);
    assert.deepStrictEqual(t.includeTags, /* @__PURE__ */ new Set());
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set());
    assertFilteringFor({
      ...termFiltersOff,
      [TestFilterTerm.CurrentDoc]: true
    });
  });
  test("filters to tags", () => {
    t.setText("@hello:world !@foo:bar");
    assert.deepStrictEqual(t.globList, []);
    assert.deepStrictEqual(t.includeTags, /* @__PURE__ */ new Set(["hello\0world"]));
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set(["foo\0bar"]));
    assertFilteringFor(termFiltersOff);
  });
  test("filters to mixed terms and tags", () => {
    t.setText("@hello:world foo, !bar @doc !@foo:bar");
    assert.deepStrictEqual(t.globList, [{ text: "foo", include: true }, { text: "bar", include: false }]);
    assert.deepStrictEqual(t.includeTags, /* @__PURE__ */ new Set(["hello\0world"]));
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set(["foo\0bar"]));
    assertFilteringFor({
      ...termFiltersOff,
      [TestFilterTerm.CurrentDoc]: true
    });
  });
  test("parses quotes", () => {
    t.setText(`@hello:"world" @foo:'bar' baz`);
    assert.deepStrictEqual(t.globList, [{ text: "baz", include: true }]);
    assert.deepStrictEqual([...t.includeTags], ["hello\0world", "foo\0bar"]);
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set());
  });
  test("parses quotes with escapes", () => {
    t.setText('@hello:"world\\"1" foo');
    assert.deepStrictEqual(t.globList, [{ text: "foo", include: true }]);
    assert.deepStrictEqual([...t.includeTags], ['hello\0world"1']);
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set());
  });
  test("treats unrecognized @-prefixed text as regular filter text", () => {
    t.setText("@smoke");
    assert.deepStrictEqual(t.globList, [{ text: "@smoke", include: true }]);
    assert.deepStrictEqual(t.includeTags, /* @__PURE__ */ new Set());
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set());
    assertFilteringFor(termFiltersOff);
  });
  test("treats unrecognized @-prefixed text as filter text in mixed input", () => {
    t.setText("@smoke @doc hello");
    assert.deepStrictEqual(t.globList, [{ text: "@smoke hello", include: true }]);
    assert.deepStrictEqual(t.includeTags, /* @__PURE__ */ new Set());
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set());
    assertFilteringFor({
      ...termFiltersOff,
      [TestFilterTerm.CurrentDoc]: true
    });
  });
  test("negated unrecognized @-prefixed text works as exclusion filter", () => {
    t.setText("!@smoke");
    assert.deepStrictEqual(t.globList, [{ text: "@smoke", include: false }]);
    assert.deepStrictEqual(t.includeTags, /* @__PURE__ */ new Set());
    assert.deepStrictEqual(t.excludeTags, /* @__PURE__ */ new Set());
    assertFilteringFor(termFiltersOff);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXHRlc3RcXGNvbW1vblxcdGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlc3RFeHBsb3JlckZpbHRlclN0YXRlLCBUZXN0RmlsdGVyVGVybSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZS5qcyc7XG5cbnN1aXRlKCdUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZScsICgpID0+IHtcblx0bGV0IHQ6IFRlc3RFeHBsb3JlckZpbHRlclN0YXRlO1xuXHRsZXQgZHM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZHMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZHMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dCA9IGRzLmFkZChuZXcgVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUoZHMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKSk7XG5cdH0pO1xuXG5cdGNvbnN0IGFzc2VydEZpbHRlcmluZ0ZvciA9IChleHBlY3RlZDogeyBbVCBpbiBUZXN0RmlsdGVyVGVybV0/OiBib29sZWFuIH0pID0+IHtcblx0XHRmb3IgKGNvbnN0IFt0ZXJtLCBleHBlY3RhdGlvbl0gb2YgT2JqZWN0LmVudHJpZXMoZXhwZWN0ZWQpKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodC5pc0ZpbHRlcmluZ0Zvcih0ZXJtIGFzIFRlc3RGaWx0ZXJUZXJtKSwgZXhwZWN0YXRpb24sIGBleHBlY3RlZCBmaWx0ZXJpbmcgZm9yICR7dGVybX0gPT09ICR7ZXhwZWN0YXRpb259YCk7XG5cdFx0fVxuXHR9O1xuXG5cdGNvbnN0IHRlcm1GaWx0ZXJzT2ZmID0ge1xuXHRcdFtUZXN0RmlsdGVyVGVybS5GYWlsZWRdOiBmYWxzZSxcblx0XHRbVGVzdEZpbHRlclRlcm0uRXhlY3V0ZWRdOiBmYWxzZSxcblx0XHRbVGVzdEZpbHRlclRlcm0uQ3VycmVudERvY106IGZhbHNlLFxuXHRcdFtUZXN0RmlsdGVyVGVybS5IaWRkZW5dOiBmYWxzZSxcblx0fTtcblxuXHR0ZXN0KCdmaWx0ZXJzIHNpbXBsZSBnbG9icycsICgpID0+IHtcblx0XHR0LnNldFRleHQoJ2hlbGxvLCAhd29ybGQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2xvYkxpc3QsIFt7IHRleHQ6ICdoZWxsbycsIGluY2x1ZGU6IHRydWUgfSwgeyB0ZXh0OiAnd29ybGQnLCBpbmNsdWRlOiBmYWxzZSB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmluY2x1ZGVUYWdzLCBuZXcgU2V0KCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5leGNsdWRlVGFncywgbmV3IFNldCgpKTtcblx0XHRhc3NlcnRGaWx0ZXJpbmdGb3IodGVybUZpbHRlcnNPZmYpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWx0ZXJzIHRvIHBhdHRlcm5zJywgKCkgPT4ge1xuXHRcdHQuc2V0VGV4dCgnQGRvYycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nbG9iTGlzdCwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5pbmNsdWRlVGFncywgbmV3IFNldCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZXhjbHVkZVRhZ3MsIG5ldyBTZXQoKSk7XG5cdFx0YXNzZXJ0RmlsdGVyaW5nRm9yKHtcblx0XHRcdC4uLnRlcm1GaWx0ZXJzT2ZmLFxuXHRcdFx0W1Rlc3RGaWx0ZXJUZXJtLkN1cnJlbnREb2NdOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWx0ZXJzIHRvIHRhZ3MnLCAoKSA9PiB7XG5cdFx0dC5zZXRUZXh0KCdAaGVsbG86d29ybGQgIUBmb286YmFyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0Lmdsb2JMaXN0LCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmluY2x1ZGVUYWdzLCBuZXcgU2V0KFsnaGVsbG9cXDB3b3JsZCddKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmV4Y2x1ZGVUYWdzLCBuZXcgU2V0KFsnZm9vXFwwYmFyJ10pKTtcblx0XHRhc3NlcnRGaWx0ZXJpbmdGb3IodGVybUZpbHRlcnNPZmYpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWx0ZXJzIHRvIG1peGVkIHRlcm1zIGFuZCB0YWdzJywgKCkgPT4ge1xuXHRcdHQuc2V0VGV4dCgnQGhlbGxvOndvcmxkIGZvbywgIWJhciBAZG9jICFAZm9vOmJhcicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nbG9iTGlzdCwgW3sgdGV4dDogJ2ZvbycsIGluY2x1ZGU6IHRydWUgfSwgeyB0ZXh0OiAnYmFyJywgaW5jbHVkZTogZmFsc2UgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5pbmNsdWRlVGFncywgbmV3IFNldChbJ2hlbGxvXFwwd29ybGQnXSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5leGNsdWRlVGFncywgbmV3IFNldChbJ2Zvb1xcMGJhciddKSk7XG5cdFx0YXNzZXJ0RmlsdGVyaW5nRm9yKHtcblx0XHRcdC4uLnRlcm1GaWx0ZXJzT2ZmLFxuXHRcdFx0W1Rlc3RGaWx0ZXJUZXJtLkN1cnJlbnREb2NdOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZXMgcXVvdGVzJywgKCkgPT4ge1xuXHRcdHQuc2V0VGV4dCgnQGhlbGxvOlwid29ybGRcIiBAZm9vOlxcJ2JhclxcJyBiYXonKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2xvYkxpc3QsIFt7IHRleHQ6ICdiYXonLCBpbmNsdWRlOiB0cnVlIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi50LmluY2x1ZGVUYWdzXSwgWydoZWxsb1xcMHdvcmxkJywgJ2Zvb1xcMGJhciddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZXhjbHVkZVRhZ3MsIG5ldyBTZXQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBxdW90ZXMgd2l0aCBlc2NhcGVzJywgKCkgPT4ge1xuXHRcdHQuc2V0VGV4dCgnQGhlbGxvOlwid29ybGRcXFxcXCIxXCIgZm9vJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0Lmdsb2JMaXN0LCBbeyB0ZXh0OiAnZm9vJywgaW5jbHVkZTogdHJ1ZSB9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4udC5pbmNsdWRlVGFnc10sIFsnaGVsbG9cXDB3b3JsZFwiMSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZXhjbHVkZVRhZ3MsIG5ldyBTZXQoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyB1bnJlY29nbml6ZWQgQC1wcmVmaXhlZCB0ZXh0IGFzIHJlZ3VsYXIgZmlsdGVyIHRleHQnLCAoKSA9PiB7XG5cdFx0dC5zZXRUZXh0KCdAc21va2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2xvYkxpc3QsIFt7IHRleHQ6ICdAc21va2UnLCBpbmNsdWRlOiB0cnVlIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuaW5jbHVkZVRhZ3MsIG5ldyBTZXQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmV4Y2x1ZGVUYWdzLCBuZXcgU2V0KCkpO1xuXHRcdGFzc2VydEZpbHRlcmluZ0Zvcih0ZXJtRmlsdGVyc09mZik7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyZWF0cyB1bnJlY29nbml6ZWQgQC1wcmVmaXhlZCB0ZXh0IGFzIGZpbHRlciB0ZXh0IGluIG1peGVkIGlucHV0JywgKCkgPT4ge1xuXHRcdHQuc2V0VGV4dCgnQHNtb2tlIEBkb2MgaGVsbG8nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2xvYkxpc3QsIFt7IHRleHQ6ICdAc21va2UgaGVsbG8nLCBpbmNsdWRlOiB0cnVlIH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuaW5jbHVkZVRhZ3MsIG5ldyBTZXQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmV4Y2x1ZGVUYWdzLCBuZXcgU2V0KCkpO1xuXHRcdGFzc2VydEZpbHRlcmluZ0Zvcih7XG5cdFx0XHQuLi50ZXJtRmlsdGVyc09mZixcblx0XHRcdFtUZXN0RmlsdGVyVGVybS5DdXJyZW50RG9jXTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbmVnYXRlZCB1bnJlY29nbml6ZWQgQC1wcmVmaXhlZCB0ZXh0IHdvcmtzIGFzIGV4Y2x1c2lvbiBmaWx0ZXInLCAoKSA9PiB7XG5cdFx0dC5zZXRUZXh0KCchQHNtb2tlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0Lmdsb2JMaXN0LCBbeyB0ZXh0OiAnQHNtb2tlJywgaW5jbHVkZTogZmFsc2UgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5pbmNsdWRlVGFncywgbmV3IFNldCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZXhjbHVkZVRhZ3MsIG5ldyBTZXQoKSk7XG5cdFx0YXNzZXJ0RmlsdGVyaW5nRm9yKHRlcm1GaWx0ZXJzT2ZmKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHlCQUF5QixzQkFBc0I7QUFFeEQsTUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsTUFBTTtBQUNkLE9BQUcsUUFBUTtBQUFBLEVBQ1osQ0FBQztBQUVELDBDQUF3QztBQUV4QyxRQUFNLE1BQU07QUFDWCxTQUFLLElBQUksZ0JBQWdCO0FBQ3pCLFFBQUksR0FBRyxJQUFJLElBQUksd0JBQXdCLEdBQUcsSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUMsQ0FBQztBQUFBLEVBQzdFLENBQUM7QUFFRCxRQUFNLHFCQUFxQixDQUFDLGFBQWtEO0FBQzdFLGVBQVcsQ0FBQyxNQUFNLFdBQVcsS0FBSyxPQUFPLFFBQVEsUUFBUSxHQUFHO0FBQzNELGFBQU8sWUFBWSxFQUFF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
