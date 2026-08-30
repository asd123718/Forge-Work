import assert from "assert";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { formatPII, getEffectiveConfigForPlatform, getEffectivePresentationForConfig, getExactExpressionStartAndEnd, getVisibleAndSorted } from "../../common/debugUtils.js";
function platformSection(os, value) {
  switch (os) {
    case OperatingSystem.Windows:
      return { windows: value };
    case OperatingSystem.Macintosh:
      return { osx: value };
    case OperatingSystem.Linux:
      return { linux: value };
  }
}
suite("Debug - Utils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("formatPII", () => {
    assert.strictEqual(formatPII("Foo Bar", false, {}), "Foo Bar");
    assert.strictEqual(formatPII("Foo {key} Bar", false, {}), "Foo {key} Bar");
    assert.strictEqual(formatPII("Foo {key} Bar", false, { "key": "yes" }), "Foo yes Bar");
    assert.strictEqual(formatPII("Foo {_0} Bar {_0}", true, { "_0": "yes" }), "Foo yes Bar yes");
    assert.strictEqual(formatPII("Foo {0} Bar {1}{2}", false, { "0": "yes" }), "Foo yes Bar {1}{2}");
    assert.strictEqual(formatPII("Foo {0} Bar {1}{2}", false, { "0": "yes", "1": "undefined" }), "Foo yes Bar undefined{2}");
    assert.strictEqual(formatPII("Foo {_key0} Bar {key1}{key2}", true, { "_key0": "yes", "key1": "5", "key2": "false" }), "Foo yes Bar {key1}{key2}");
    assert.strictEqual(formatPII("Foo {_key0} Bar {key1}{key2}", false, { "_key0": "yes", "key1": "5", "key2": "false" }), "Foo yes Bar 5false");
    assert.strictEqual(formatPII('Unable to display threads:"{e}"', false, { "e": "detached from process" }), 'Unable to display threads:"detached from process"');
  });
  test("getExactExpressionStartAndEnd", () => {
    assert.deepStrictEqual(getExactExpressionStartAndEnd("foo", 1, 2), { start: 1, end: 3 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("!foo", 2, 3), { start: 2, end: 4 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("foo", 1, 3), { start: 1, end: 3 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("foo", 1, 4), { start: 1, end: 3 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd('this.name = "John"', 1, 10), { start: 1, end: 9 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd('this.name = "John"', 6, 10), { start: 1, end: 9 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd('this->address = "Main street"', 6, 10), { start: 1, end: 13 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("var t = a.b.c.d.name", 16, 20), { start: 9, end: 20 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("MyClass::StaticProp", 10, 20), { start: 1, end: 19 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("largeNumber = myVar?.prop", 21, 25), { start: 15, end: 25 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("var t = a.b.c.d.name", 11, 12), { start: 9, end: 11 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("var t = a.b;c.d.name", 16, 20), { start: 13, end: 20 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("var t = a.b.c-d.name", 16, 20), { start: 15, end: 20 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("var a\xF8\xF1\xE9\xE5\u6587 = a.b.c-d.name", 5, 5), { start: 5, end: 10 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("a\xF8\xF1\xE9\xE5\u6587.a\xF8\xF1\xE9\xE5\u6587.a\xF8\xF1\xE9\xE5\u6587", 9, 9), { start: 1, end: 13 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("[...bar]", 5, 7), { start: 5, end: 7 });
    assert.deepStrictEqual(getExactExpressionStartAndEnd("...variable", 5, 5), { start: 4, end: 11 });
  });
  test("getEffectivePresentationForConfig - platform override", () => {
    const config1 = { type: "node", request: "launch", name: "a", presentation: { hidden: false } };
    assert.deepStrictEqual(getEffectivePresentationForConfig(config1, OperatingSystem.Macintosh), { hidden: false });
    const config2 = {
      type: "node",
      request: "launch",
      name: "b",
      presentation: { hidden: false },
      ...platformSection(OperatingSystem.Windows, { presentation: { hidden: true } })
    };
    assert.deepStrictEqual(getEffectivePresentationForConfig(config2, OperatingSystem.Windows), { hidden: true });
    const config3 = {
      type: "node",
      request: "launch",
      name: "c",
      presentation: { hidden: false },
      ...platformSection(OperatingSystem.Windows, { presentation: { hidden: true } })
    };
    assert.deepStrictEqual(getEffectivePresentationForConfig(config3, OperatingSystem.Linux), { hidden: false });
    const config4 = {
      type: "node",
      request: "launch",
      name: "d",
      ...platformSection(OperatingSystem.Macintosh, { presentation: { hidden: true } })
    };
    assert.deepStrictEqual(getEffectivePresentationForConfig(config4, OperatingSystem.Macintosh), { hidden: true });
    const config5 = {
      type: "node",
      request: "launch",
      name: "e",
      presentation: { group: "myGroup", order: 2 },
      ...platformSection(OperatingSystem.Linux, { presentation: { hidden: true } })
    };
    assert.deepStrictEqual(getEffectivePresentationForConfig(config5, OperatingSystem.Linux), { group: "myGroup", order: 2, hidden: true });
    const config6 = {
      type: "node",
      request: "launch",
      name: "f",
      preLaunchTask: "base-task",
      presentation: { group: "base" },
      ...platformSection(OperatingSystem.Windows, { preLaunchTask: "windows-task", presentation: { hidden: true } })
    };
    assert.deepStrictEqual(getEffectiveConfigForPlatform(config6, OperatingSystem.Windows), {
      ...config6,
      preLaunchTask: "windows-task",
      presentation: { group: "base", hidden: true }
    });
  });
  test("config presentation", () => {
    const configs = [];
    configs.push({
      type: "node",
      request: "launch",
      name: "p"
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "a"
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "b",
      presentation: {
        hidden: false
      }
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "c",
      presentation: {
        hidden: true
      }
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "d",
      presentation: {
        group: "2_group",
        order: 5
      }
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "e",
      presentation: {
        group: "2_group",
        order: 52
      }
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "f",
      presentation: {
        group: "1_group",
        order: 500
      }
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "g",
      presentation: {
        group: "5_group",
        order: 500
      }
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "h",
      presentation: {
        order: 700
      }
    });
    configs.push({
      type: "node",
      request: "launch",
      name: "i",
      presentation: {
        order: 1e3
      }
    });
    const sorted = getVisibleAndSorted(configs);
    assert.strictEqual(sorted.length, 9);
    assert.strictEqual(sorted[0].name, "f");
    assert.strictEqual(sorted[1].name, "d");
    assert.strictEqual(sorted[2].name, "e");
    assert.strictEqual(sorted[3].name, "g");
    assert.strictEqual(sorted[4].name, "h");
    assert.strictEqual(sorted[5].name, "i");
    assert.strictEqual(sorted[6].name, "b");
    assert.strictEqual(sorted[7].name, "p");
    assert.strictEqual(sorted[8].name, "a");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFx0ZXN0XFxicm93c2VyXFxkZWJ1Z1V0aWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElDb25maWcgfSBmcm9tICcuLi8uLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgZm9ybWF0UElJLCBnZXRFZmZlY3RpdmVDb25maWdGb3JQbGF0Zm9ybSwgZ2V0RWZmZWN0aXZlUHJlc2VudGF0aW9uRm9yQ29uZmlnLCBnZXRFeGFjdEV4cHJlc3Npb25TdGFydEFuZEVuZCwgZ2V0VmlzaWJsZUFuZFNvcnRlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcblxuZnVuY3Rpb24gcGxhdGZvcm1TZWN0aW9uKG9zOiBPcGVyYXRpbmdTeXN0ZW0sIHZhbHVlOiBOb25OdWxsYWJsZTxJQ29uZmlnWyd3aW5kb3dzJ10+KTogUGljazxJQ29uZmlnLCAnd2luZG93cycgfCAnb3N4JyB8ICdsaW51eCc+IHtcblx0c3dpdGNoIChvcykge1xuXHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6XG5cdFx0XHRyZXR1cm4geyB3aW5kb3dzOiB2YWx1ZSB9O1xuXHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDpcblx0XHRcdHJldHVybiB7IG9zeDogdmFsdWUgfTtcblx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDpcblx0XHRcdHJldHVybiB7IGxpbnV4OiB2YWx1ZSB9O1xuXHR9XG59XG5cbnN1aXRlKCdEZWJ1ZyAtIFV0aWxzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmb3JtYXRQSUknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFBJSSgnRm9vIEJhcicsIGZhbHNlLCB7fSksICdGb28gQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFBJSSgnRm9vIHtrZXl9IEJhcicsIGZhbHNlLCB7fSksICdGb28ge2tleX0gQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFBJSSgnRm9vIHtrZXl9IEJhcicsIGZhbHNlLCB7ICdrZXknOiAneWVzJyB9KSwgJ0ZvbyB5ZXMgQmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFBJSSgnRm9vIHtfMH0gQmFyIHtfMH0nLCB0cnVlLCB7ICdfMCc6ICd5ZXMnIH0pLCAnRm9vIHllcyBCYXIgeWVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdFBJSSgnRm9vIHswfSBCYXIgezF9ezJ9JywgZmFsc2UsIHsgJzAnOiAneWVzJyB9KSwgJ0ZvbyB5ZXMgQmFyIHsxfXsyfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRQSUkoJ0ZvbyB7MH0gQmFyIHsxfXsyfScsIGZhbHNlLCB7ICcwJzogJ3llcycsICcxJzogJ3VuZGVmaW5lZCcgfSksICdGb28geWVzIEJhciB1bmRlZmluZWR7Mn0nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0UElJKCdGb28ge19rZXkwfSBCYXIge2tleTF9e2tleTJ9JywgdHJ1ZSwgeyAnX2tleTAnOiAneWVzJywgJ2tleTEnOiAnNScsICdrZXkyJzogJ2ZhbHNlJyB9KSwgJ0ZvbyB5ZXMgQmFyIHtrZXkxfXtrZXkyfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRQSUkoJ0ZvbyB7X2tleTB9IEJhciB7a2V5MX17a2V5Mn0nLCBmYWxzZSwgeyAnX2tleTAnOiAneWVzJywgJ2tleTEnOiAnNScsICdrZXkyJzogJ2ZhbHNlJyB9KSwgJ0ZvbyB5ZXMgQmFyIDVmYWxzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRQSUkoJ1VuYWJsZSB0byBkaXNwbGF5IHRocmVhZHM6XCJ7ZX1cIicsIGZhbHNlLCB7ICdlJzogJ2RldGFjaGVkIGZyb20gcHJvY2VzcycgfSksICdVbmFibGUgdG8gZGlzcGxheSB0aHJlYWRzOlwiZGV0YWNoZWQgZnJvbSBwcm9jZXNzXCInKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFeGFjdEV4cHJlc3Npb25TdGFydEFuZEVuZCgnZm9vJywgMSwgMiksIHsgc3RhcnQ6IDEsIGVuZDogMyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKCchZm9vJywgMiwgMyksIHsgc3RhcnQ6IDIsIGVuZDogNCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKCdmb28nLCAxLCAzKSwgeyBzdGFydDogMSwgZW5kOiAzIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQoJ2ZvbycsIDEsIDQpLCB7IHN0YXJ0OiAxLCBlbmQ6IDMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFeGFjdEV4cHJlc3Npb25TdGFydEFuZEVuZCgndGhpcy5uYW1lID0gXCJKb2huXCInLCAxLCAxMCksIHsgc3RhcnQ6IDEsIGVuZDogOSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKCd0aGlzLm5hbWUgPSBcIkpvaG5cIicsIDYsIDEwKSwgeyBzdGFydDogMSwgZW5kOiA5IH0pO1xuXHRcdC8vIEhvdmVycyBvdmVyIFwiYWRkcmVzc1wiIHNob3VsZCBwaWNrIHVwIHRoaXMtPmFkZHJlc3Ncblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKCd0aGlzLT5hZGRyZXNzID0gXCJNYWluIHN0cmVldFwiJywgNiwgMTApLCB7IHN0YXJ0OiAxLCBlbmQ6IDEzIH0pO1xuXHRcdC8vIEhvdmVycyBvdmVyIFwibmFtZVwiIHNob3VsZCBwaWNrIHVwIGEuYi5jLmQubmFtZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQoJ3ZhciB0ID0gYS5iLmMuZC5uYW1lJywgMTYsIDIwKSwgeyBzdGFydDogOSwgZW5kOiAyMCB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKCdNeUNsYXNzOjpTdGF0aWNQcm9wJywgMTAsIDIwKSwgeyBzdGFydDogMSwgZW5kOiAxOSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKCdsYXJnZU51bWJlciA9IG15VmFyPy5wcm9wJywgMjEsIDI1KSwgeyBzdGFydDogMTUsIGVuZDogMjUgfSk7XG5cblx0XHQvLyBGb3IgZXhhbXBsZSBpbiBleHByZXNzaW9uICdhLmIuYy5kJywgaG92ZXIgd2FzIHVuZGVyICdiJywgJ2EuYicgc2hvdWxkIGJlIHRoZSBleGFjdCByYW5nZVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQoJ3ZhciB0ID0gYS5iLmMuZC5uYW1lJywgMTEsIDEyKSwgeyBzdGFydDogOSwgZW5kOiAxMSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQoJ3ZhciB0ID0gYS5iO2MuZC5uYW1lJywgMTYsIDIwKSwgeyBzdGFydDogMTMsIGVuZDogMjAgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFeGFjdEV4cHJlc3Npb25TdGFydEFuZEVuZCgndmFyIHQgPSBhLmIuYy1kLm5hbWUnLCAxNiwgMjApLCB7IHN0YXJ0OiAxNSwgZW5kOiAyMCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQoJ3ZhciBhXHUwMEY4XHUwMEYxXHUwMEU5XHUwMEU1XHU2NTg3ID0gYS5iLmMtZC5uYW1lJywgNSwgNSksIHsgc3RhcnQ6IDUsIGVuZDogMTAgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFeGFjdEV4cHJlc3Npb25TdGFydEFuZEVuZCgnYVx1MDBGOFx1MDBGMVx1MDBFOVx1MDBFNVx1NjU4Ny5hXHUwMEY4XHUwMEYxXHUwMEU5XHUwMEU1XHU2NTg3LmFcdTAwRjhcdTAwRjFcdTAwRTlcdTAwRTVcdTY1ODcnLCA5LCA5KSwgeyBzdGFydDogMSwgZW5kOiAxMyB9KTtcblxuXHRcdC8vIFNwcmVhZCBzeW50YXggc2hvdWxkIGV4dHJhY3QganVzdCB0aGUgaWRlbnRpZmllclxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RXhhY3RFeHByZXNzaW9uU3RhcnRBbmRFbmQoJ1suLi5iYXJdJywgNSwgNyksIHsgc3RhcnQ6IDUsIGVuZDogNyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEV4YWN0RXhwcmVzc2lvblN0YXJ0QW5kRW5kKCcuLi52YXJpYWJsZScsIDUsIDUpLCB7IHN0YXJ0OiA0LCBlbmQ6IDExIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRFZmZlY3RpdmVQcmVzZW50YXRpb25Gb3JDb25maWcgLSBwbGF0Zm9ybSBvdmVycmlkZScsICgpID0+IHtcblx0XHQvLyBObyBwbGF0Zm9ybSBvdmVycmlkZTogcmV0dXJucyBiYXNlIHByZXNlbnRhdGlvblxuXHRcdGNvbnN0IGNvbmZpZzE6IElDb25maWcgPSB7IHR5cGU6ICdub2RlJywgcmVxdWVzdDogJ2xhdW5jaCcsIG5hbWU6ICdhJywgcHJlc2VudGF0aW9uOiB7IGhpZGRlbjogZmFsc2UgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWZmZWN0aXZlUHJlc2VudGF0aW9uRm9yQ29uZmlnKGNvbmZpZzEsIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpLCB7IGhpZGRlbjogZmFsc2UgfSk7XG5cblx0XHQvLyBQbGF0Zm9ybS1zcGVjaWZpYyBwcmVzZW50YXRpb24gb3ZlcnJpZGVzIGJhc2UgaGlkZGVuIHZhbHVlXG5cdFx0Y29uc3QgY29uZmlnMjogSUNvbmZpZyA9IHtcblx0XHRcdHR5cGU6ICdub2RlJywgcmVxdWVzdDogJ2xhdW5jaCcsIG5hbWU6ICdiJyxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBoaWRkZW46IGZhbHNlIH0sXG5cdFx0XHQuLi5wbGF0Zm9ybVNlY3Rpb24oT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIHsgcHJlc2VudGF0aW9uOiB7IGhpZGRlbjogdHJ1ZSB9IH0pXG5cdFx0fTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVmZmVjdGl2ZVByZXNlbnRhdGlvbkZvckNvbmZpZyhjb25maWcyLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksIHsgaGlkZGVuOiB0cnVlIH0pO1xuXG5cdFx0Ly8gTm9uLW1hdGNoaW5nIHBsYXRmb3JtIG92ZXJyaWRlIGRvZXMgbm90IGFmZmVjdCByZXN1bHRcblx0XHRjb25zdCBjb25maWczOiBJQ29uZmlnID0ge1xuXHRcdFx0dHlwZTogJ25vZGUnLCByZXF1ZXN0OiAnbGF1bmNoJywgbmFtZTogJ2MnLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7IGhpZGRlbjogZmFsc2UgfSxcblx0XHRcdC4uLnBsYXRmb3JtU2VjdGlvbihPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgeyBwcmVzZW50YXRpb246IHsgaGlkZGVuOiB0cnVlIH0gfSlcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWZmZWN0aXZlUHJlc2VudGF0aW9uRm9yQ29uZmlnKGNvbmZpZzMsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksIHsgaGlkZGVuOiBmYWxzZSB9KTtcblxuXHRcdC8vIE5vIGJhc2UgcHJlc2VudGF0aW9uLCBwbGF0Zm9ybS1zcGVjaWZpYyBzZXRzIGhpZGRlblxuXHRcdGNvbnN0IGNvbmZpZzQ6IElDb25maWcgPSB7XG5cdFx0XHR0eXBlOiAnbm9kZScsIHJlcXVlc3Q6ICdsYXVuY2gnLCBuYW1lOiAnZCcsXG5cdFx0XHQuLi5wbGF0Zm9ybVNlY3Rpb24oT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCwgeyBwcmVzZW50YXRpb246IHsgaGlkZGVuOiB0cnVlIH0gfSlcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWZmZWN0aXZlUHJlc2VudGF0aW9uRm9yQ29uZmlnKGNvbmZpZzQsIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpLCB7IGhpZGRlbjogdHJ1ZSB9KTtcblxuXHRcdC8vIFBsYXRmb3JtLXNwZWNpZmljIG1lcmdlcyB3aXRoIGJhc2UgKGdyb3VwIGFuZCBvcmRlciBwcmVzZXJ2ZWQpXG5cdFx0Y29uc3QgY29uZmlnNTogSUNvbmZpZyA9IHtcblx0XHRcdHR5cGU6ICdub2RlJywgcmVxdWVzdDogJ2xhdW5jaCcsIG5hbWU6ICdlJyxcblx0XHRcdHByZXNlbnRhdGlvbjogeyBncm91cDogJ215R3JvdXAnLCBvcmRlcjogMiB9LFxuXHRcdFx0Li4ucGxhdGZvcm1TZWN0aW9uKE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgeyBwcmVzZW50YXRpb246IHsgaGlkZGVuOiB0cnVlIH0gfSlcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWZmZWN0aXZlUHJlc2VudGF0aW9uRm9yQ29uZmlnKGNvbmZpZzUsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksIHsgZ3JvdXA6ICdteUdyb3VwJywgb3JkZXI6IDIsIGhpZGRlbjogdHJ1ZSB9KTtcblxuXHRcdC8vIFBsYXRmb3JtLXNwZWNpZmljIGNvbmZpZyBvdmVycmlkZXMgb3RoZXIgbGF1bmNoIGF0dHJpYnV0ZXMgd2hpbGUgcHJlc2VydmluZyBuZXN0ZWQgc2VjdGlvbnNcblx0XHRjb25zdCBjb25maWc2OiBJQ29uZmlnID0ge1xuXHRcdFx0dHlwZTogJ25vZGUnLCByZXF1ZXN0OiAnbGF1bmNoJywgbmFtZTogJ2YnLFxuXHRcdFx0cHJlTGF1bmNoVGFzazogJ2Jhc2UtdGFzaycsXG5cdFx0XHRwcmVzZW50YXRpb246IHsgZ3JvdXA6ICdiYXNlJyB9LFxuXHRcdFx0Li4ucGxhdGZvcm1TZWN0aW9uKE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB7IHByZUxhdW5jaFRhc2s6ICd3aW5kb3dzLXRhc2snLCBwcmVzZW50YXRpb246IHsgaGlkZGVuOiB0cnVlIH0gfSlcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RWZmZWN0aXZlQ29uZmlnRm9yUGxhdGZvcm0oY29uZmlnNiwgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLCB7XG5cdFx0XHQuLi5jb25maWc2LFxuXHRcdFx0cHJlTGF1bmNoVGFzazogJ3dpbmRvd3MtdGFzaycsXG5cdFx0XHRwcmVzZW50YXRpb246IHsgZ3JvdXA6ICdiYXNlJywgaGlkZGVuOiB0cnVlIH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlnIHByZXNlbnRhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBjb25maWdzOiBJQ29uZmlnW10gPSBbXTtcblx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0dHlwZTogJ25vZGUnLFxuXHRcdFx0cmVxdWVzdDogJ2xhdW5jaCcsXG5cdFx0XHRuYW1lOiAncCdcblx0XHR9KTtcblx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0dHlwZTogJ25vZGUnLFxuXHRcdFx0cmVxdWVzdDogJ2xhdW5jaCcsXG5cdFx0XHRuYW1lOiAnYSdcblx0XHR9KTtcblx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0dHlwZTogJ25vZGUnLFxuXHRcdFx0cmVxdWVzdDogJ2xhdW5jaCcsXG5cdFx0XHRuYW1lOiAnYicsXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0aGlkZGVuOiBmYWxzZVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbmZpZ3MucHVzaCh7XG5cdFx0XHR0eXBlOiAnbm9kZScsXG5cdFx0XHRyZXF1ZXN0OiAnbGF1bmNoJyxcblx0XHRcdG5hbWU6ICdjJyxcblx0XHRcdHByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHRoaWRkZW46IHRydWVcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0dHlwZTogJ25vZGUnLFxuXHRcdFx0cmVxdWVzdDogJ2xhdW5jaCcsXG5cdFx0XHRuYW1lOiAnZCcsXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0Z3JvdXA6ICcyX2dyb3VwJyxcblx0XHRcdFx0b3JkZXI6IDVcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0dHlwZTogJ25vZGUnLFxuXHRcdFx0cmVxdWVzdDogJ2xhdW5jaCcsXG5cdFx0XHRuYW1lOiAnZScsXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0Z3JvdXA6ICcyX2dyb3VwJyxcblx0XHRcdFx0b3JkZXI6IDUyXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uZmlncy5wdXNoKHtcblx0XHRcdHR5cGU6ICdub2RlJyxcblx0XHRcdHJlcXVlc3Q6ICdsYXVuY2gnLFxuXHRcdFx0bmFtZTogJ2YnLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7XG5cdFx0XHRcdGdyb3VwOiAnMV9ncm91cCcsXG5cdFx0XHRcdG9yZGVyOiA1MDBcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0dHlwZTogJ25vZGUnLFxuXHRcdFx0cmVxdWVzdDogJ2xhdW5jaCcsXG5cdFx0XHRuYW1lOiAnZycsXG5cdFx0XHRwcmVzZW50YXRpb246IHtcblx0XHRcdFx0Z3JvdXA6ICc1X2dyb3VwJyxcblx0XHRcdFx0b3JkZXI6IDUwMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbmZpZ3MucHVzaCh7XG5cdFx0XHR0eXBlOiAnbm9kZScsXG5cdFx0XHRyZXF1ZXN0OiAnbGF1bmNoJyxcblx0XHRcdG5hbWU6ICdoJyxcblx0XHRcdHByZXNlbnRhdGlvbjoge1xuXHRcdFx0XHRvcmRlcjogNzAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uZmlncy5wdXNoKHtcblx0XHRcdHR5cGU6ICdub2RlJyxcblx0XHRcdHJlcXVlc3Q6ICdsYXVuY2gnLFxuXHRcdFx0bmFtZTogJ2knLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB7XG5cdFx0XHRcdG9yZGVyOiAxMDAwXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzb3J0ZWQgPSBnZXRWaXNpYmxlQW5kU29ydGVkKGNvbmZpZ3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3J0ZWQubGVuZ3RoLCA5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc29ydGVkWzBdLm5hbWUsICdmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvcnRlZFsxXS5uYW1lLCAnZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3J0ZWRbMl0ubmFtZSwgJ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc29ydGVkWzNdLm5hbWUsICdnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvcnRlZFs0XS5uYW1lLCAnaCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3J0ZWRbNV0ubmFtZSwgJ2knKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc29ydGVkWzZdLm5hbWUsICdiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNvcnRlZFs3XS5uYW1lLCAncCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzb3J0ZWRbOF0ubmFtZSwgJ2EnKTtcblxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsV0FBVywrQkFBK0IsbUNBQW1DLCtCQUErQiwyQkFBMkI7QUFFaEosU0FBUyxnQkFBZ0IsSUFBcUIsT0FBb0Y7QUFDakksVUFBUSxJQUFJO0FBQUEsSUFDWCxLQUFLLGdCQUFnQjtBQUNwQixhQUFPLEVBQUUsU0FBUyxNQUFNO0FBQUEsSUFDekIsS0FBSyxnQkFBZ0I7QUFDcEIsYUFBTyxFQUFFLEtBQUssTUFBTTtBQUFBLElBQ3JCLEtBQUssZ0JBQWdCO0FBQ3BCLGFBQU8sRUFBRSxPQUFPLE1BQU07QUFBQSxFQUN4QjtBQUNEO0FBRUEsTUFBTSxpQkFBaUIsTUFBTTtBQUM1QiwwQ0FBd0M7QUFFeEMsT0FBSyxhQUFhLE1BQU07QUFDdkIsV0FBTyxZQUFZLFVBQVUsV0FBVyxPQUFPLENBQUMsQ0FBQyxHQUFHLFNBQVM7QUFDN0QsV0FBTyxZQUFZLFVBQVUsaUJBQWlCLE9BQU8sQ0FBQyxDQUFDLEdBQUcsZUFBZTtBQUN6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O0FBQUEsUUFDYixRQUFRO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQztBQUNELFlBQVEsS0FBSztBQUFBLE1BQ1osTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTTtBQUFBLE1BQ04sY0FBYztBQUFBLFFBQ2IsUUFBUTtBQUFBLE1BQ1Q7QUFBQSxJQUNELENBQUM7QUFDRCxZQUFRLEtBQUs7QUFBQSxNQUNaLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLGNBQWM7QUFBQSxRQUNiLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQ0QsWUFBUSxLQUFLO0FBQUEsTUFDWixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixjQUFjO0FBQUEsUUFDYixPQUFPO0FBQUEsUUFDUCxPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUNELFlBQVEsS0FBSztBQUFBLE1BQ1osTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTTtBQUFBLE1BQ04sY0FBYztBQUFBLFFBQ2IsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFDRCxZQUFRLEtBQUs7QUFBQSxNQUNaLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxNQUNOLGNBQWM7QUFBQSxRQUNiLE9BQU87QUFBQSxRQUNQLE9BQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxDQUFDO0FBQ0QsWUFBUSxLQUFLO0FBQUEsTUFDWixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixjQUFjO0FBQUEsUUFDYixPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsQ0FBQztBQUNELFlBQVEsS0FBSztBQUFBLE1BQ1osTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsTUFBTTtBQUFBLE1BQ04sY0FBYztBQUFBLFFBQ2IsT0FBTztBQUFBLE1BQ1I7QUFBQSxJQUNELENBQUM7QUFFRCxVQUFNLFNBQVMsb0JBQW9CLE9BQU87QUFDMUMsV0FBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLEdBQUc7QUFDdEMsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sR0FBRztBQUN0QyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxHQUFHO0FBQ3RDLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLEdBQUc7QUFDdEMsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sR0FBRztBQUN0QyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxHQUFHO0FBQ3RDLFdBQU8sWUFBWSxPQUFPLENBQUMsRUFBRSxNQUFNLEdBQUc7QUFDdEMsV0FBTyxZQUFZLE9BQU8sQ0FBQyxFQUFFLE1BQU0sR0FBRztBQUN0QyxXQUFPLFlBQVksT0FBTyxDQUFDLEVBQUUsTUFBTSxHQUFHO0FBQUEsRUFFdkMsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
