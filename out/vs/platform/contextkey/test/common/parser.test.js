import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Parser } from "../../common/contextkey.js";
function parseToStr(input) {
  const parser = new Parser();
  const prints = [];
  const print = (...ss) => {
    ss.forEach((s) => prints.push(s));
  };
  const expr = parser.parse(input);
  if (expr === void 0) {
    if (parser.lexingErrors.length > 0) {
      print("Lexing errors:", "\n\n");
      parser.lexingErrors.forEach((lexingError) => print(`Unexpected token '${lexingError.lexeme}' at offset ${lexingError.offset}. ${lexingError.additionalInfo}`, "\n"));
    }
    if (parser.parsingErrors.length > 0) {
      if (parser.lexingErrors.length > 0) {
        print("\n --- \n");
      }
      print("Parsing errors:", "\n\n");
      parser.parsingErrors.forEach((parsingError) => print(`Unexpected '${parsingError.lexeme}' at offset ${parsingError.offset}.`, "\n"));
    }
  } else {
    print(expr.serialize());
  }
  return prints.join("");
}
suite("Context Key Parser", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test(" foo", () => {
    const input = " foo";
    assert.deepStrictEqual(parseToStr(input), "foo");
  });
  test("!foo", () => {
    const input = "!foo";
    assert.deepStrictEqual(parseToStr(input), "!foo");
  });
  test("foo =~ /bar/", () => {
    const input = "foo =~ /bar/";
    assert.deepStrictEqual(parseToStr(input), "foo =~ /bar/");
  });
  test(`foo || (foo =~ /bar/ && baz)`, () => {
    const input = `foo || (foo =~ /bar/ && baz)`;
    assert.deepStrictEqual(parseToStr(input), "foo || baz && foo =~ /bar/");
  });
  test("foo || (foo =~ /bar/ || baz)", () => {
    const input = "foo || (foo =~ /bar/ || baz)";
    assert.deepStrictEqual(parseToStr(input), "baz || foo || foo =~ /bar/");
  });
  test(`(foo || bar) && (jee || jar)`, () => {
    const input = `(foo || bar) && (jee || jar)`;
    assert.deepStrictEqual(parseToStr(input), "bar && jar || bar && jee || foo && jar || foo && jee");
  });
  test("foo && foo =~ /zee/i", () => {
    const input = "foo && foo =~ /zee/i";
    assert.deepStrictEqual(parseToStr(input), "foo && foo =~ /zee/i");
  });
  test("foo.bar==enabled", () => {
    const input = "foo.bar==enabled";
    assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
  });
  test(`foo.bar == 'enabled'`, () => {
    const input = `foo.bar == 'enabled'`;
    assert.deepStrictEqual(parseToStr(input), `foo.bar == 'enabled'`);
  });
  test("foo.bar:zed==completed - equality with no space", () => {
    const input = "foo.bar:zed==completed";
    assert.deepStrictEqual(parseToStr(input), `foo.bar:zed == 'completed'`);
  });
  test("a && b || c", () => {
    const input = "a && b || c";
    assert.deepStrictEqual(parseToStr(input), "c || a && b");
  });
  test("fooBar && baz.jar && fee.bee<K-loo+1>", () => {
    const input = "fooBar && baz.jar && fee.bee<K-loo+1>";
    assert.deepStrictEqual(parseToStr(input), "baz.jar && fee.bee<K-loo+1> && fooBar");
  });
  test("foo.barBaz<C-r> < 2", () => {
    const input = "foo.barBaz<C-r> < 2";
    assert.deepStrictEqual(parseToStr(input), `foo.barBaz<C-r> < 2`);
  });
  test("foo.bar >= -1", () => {
    const input = "foo.bar >= -1";
    assert.deepStrictEqual(parseToStr(input), "foo.bar >= -1");
  });
  test(`key contains &nbsp: view == vsc-packages-activitybar-folders\xA0&& vsc-packages-folders-loaded`, () => {
    const input = `view == vsc-packages-activitybar-folders\xA0&& vsc-packages-folders-loaded`;
    assert.deepStrictEqual(parseToStr(input), `vsc-packages-folders-loaded && view == 'vsc-packages-activitybar-folders'`);
  });
  test("foo.bar <= -1", () => {
    const input = "foo.bar <= -1";
    assert.deepStrictEqual(parseToStr(input), `foo.bar <= -1`);
  });
  test("!cmake:hideBuildCommand && cmake:enableFullFeatureSet", () => {
    const input = "!cmake:hideBuildCommand && cmake:enableFullFeatureSet";
    assert.deepStrictEqual(parseToStr(input), "cmake:enableFullFeatureSet && !cmake:hideBuildCommand");
  });
  test("!(foo && bar)", () => {
    const input = "!(foo && bar)";
    assert.deepStrictEqual(parseToStr(input), "!bar || !foo");
  });
  test("!(foo && bar || boar) || deer", () => {
    const input = "!(foo && bar || boar) || deer";
    assert.deepStrictEqual(parseToStr(input), "deer || !bar && !boar || !boar && !foo");
  });
  test(`!(!foo)`, () => {
    const input = `!(!foo)`;
    assert.deepStrictEqual(parseToStr(input), "foo");
  });
  suite("controversial", () => {
    test(`debugState == "stopped"`, () => {
      const input = `debugState == "stopped"`;
      assert.deepStrictEqual(parseToStr(input), `debugState == '"stopped"'`);
    });
    test(` viewItem == VSCode WorkSpace`, () => {
      const input = ` viewItem == VSCode WorkSpace`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected 'WorkSpace' at offset 20.
`);
    });
  });
  suite("regex", () => {
    test(`resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`, () => {
      const input = `resource =~ //foo/(barr|door/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(/.*)*$/`;
      assert.deepStrictEqual(parseToStr(input), "resource =~ /\\/foo\\/(barr|door\\/(Foo-Bar%20Templates|Soo%20Looo)|Web%20Site%Jjj%20Llll)(\\/.*)*$/");
    });
    test(`resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`, () => {
      const input = `resource =~ /((/scratch/(?!update)(.*)/)|((/src/).*/)).*$/`;
      assert.deepStrictEqual(parseToStr(input), "resource =~ /((\\/scratch\\/(?!update)(.*)\\/)|((\\/src\\/).*\\/)).*$/");
    });
    test(`resourcePath =~ /.md(.yml|.txt)*$/giym`, () => {
      const input = `resourcePath =~ /.md(.yml|.txt)*$/giym`;
      assert.deepStrictEqual(parseToStr(input), "resourcePath =~ /.md(.yml|.txt)*$/im");
    });
  });
  suite("error handling", () => {
    test(`/foo`, () => {
      const input = `/foo`;
      assert.deepStrictEqual(parseToStr(input), `Lexing errors:

Unexpected token '/foo' at offset 0. Did you forget to escape the '/' (slash) character? Put two backslashes before it to escape, e.g., '\\\\/'.

 --- 
Parsing errors:

Unexpected '/foo' at offset 0.
`);
    });
    test(`!b == 'true'`, () => {
      const input = `!b == 'true'`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '==' at offset 3.
`);
    });
    test("!foo &&  in bar", () => {
      const input = "!foo &&  in bar";
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected 'in' at offset 9.
`);
    });
    test("vim<c-r> == 1 && vim<2<=3", () => {
      const input = "vim<c-r> == 1 && vim<2<=3";
      assert.deepStrictEqual(parseToStr(input), `Lexing errors:

Unexpected token '=' at offset 23. Did you mean == or =~?

 --- 
Parsing errors:

Unexpected '=' at offset 23.
`);
    });
    test(`foo && 'bar`, () => {
      const input = `foo && 'bar`;
      assert.deepStrictEqual(parseToStr(input), `Lexing errors:

Unexpected token ''bar' at offset 7. Did you forget to open or close the quote?

 --- 
Parsing errors:

Unexpected ''bar' at offset 7.
`);
    });
    test(`config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`, () => {
      const input = `config.foo &&  &&bar =~ /^foo$|^bar-foo$|^joo$|^jar$/ && !foo`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '&&' at offset 15.
`);
    });
    test(`!foo == 'test'`, () => {
      const input = `!foo == 'test'`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '==' at offset 5.
`);
    });
    test(`!!foo`, function() {
      const input = `!!foo`;
      assert.deepStrictEqual(parseToStr(input), `Parsing errors:

Unexpected '!' at offset 1.
`);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY29udGV4dGtleVxcdGVzdFxcY29tbW9uXFxwYXJzZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBhcnNlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5LmpzJztcblxuZnVuY3Rpb24gcGFyc2VUb1N0cihpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgcGFyc2VyID0gbmV3IFBhcnNlcigpO1xuXG5cdGNvbnN0IHByaW50czogc3RyaW5nW10gPSBbXTtcblxuXHRjb25zdCBwcmludCA9ICguLi5zczogc3RyaW5nW10pID0+IHsgc3MuZm9yRWFjaChzID0+IHByaW50cy5wdXNoKHMpKTsgfTtcblxuXHRjb25zdCBleHByID0gcGFyc2VyLnBhcnNlKGlucHV0KTtcblx0aWYgKGV4cHIgPT09IHVuZGVmaW5lZCkge1xuXHRcdGlmIChwYXJzZXIubGV4aW5nRXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdHByaW50KCdMZXhpbmcgZXJyb3JzOicsICdcXG5cXG4nKTtcblx0XHRcdHBhcnNlci5sZXhpbmdFcnJvcnMuZm9yRWFjaChsZXhpbmdFcnJvciA9PiBwcmludChgVW5leHBlY3RlZCB0b2tlbiAnJHtsZXhpbmdFcnJvci5sZXhlbWV9JyBhdCBvZmZzZXQgJHtsZXhpbmdFcnJvci5vZmZzZXR9LiAke2xleGluZ0Vycm9yLmFkZGl0aW9uYWxJbmZvfWAsICdcXG4nKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnNlci5wYXJzaW5nRXJyb3JzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChwYXJzZXIubGV4aW5nRXJyb3JzLmxlbmd0aCA+IDApIHsgcHJpbnQoJ1xcbiAtLS0gXFxuJyk7IH1cblx0XHRcdHByaW50KCdQYXJzaW5nIGVycm9yczonLCAnXFxuXFxuJyk7XG5cdFx0XHRwYXJzZXIucGFyc2luZ0Vycm9ycy5mb3JFYWNoKHBhcnNpbmdFcnJvciA9PiBwcmludChgVW5leHBlY3RlZCAnJHtwYXJzaW5nRXJyb3IubGV4ZW1lfScgYXQgb2Zmc2V0ICR7cGFyc2luZ0Vycm9yLm9mZnNldH0uYCwgJ1xcbicpKTtcblx0XHR9XG5cblx0fSBlbHNlIHtcblx0XHRwcmludChleHByLnNlcmlhbGl6ZSgpKTtcblx0fVxuXG5cdHJldHVybiBwcmludHMuam9pbignJyk7XG59XG5cbnN1aXRlKCdDb250ZXh0IEtleSBQYXJzZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnIGZvbycsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICcgZm9vJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJyFmb28nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnIWZvbyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJyFmb28nKTtcblx0fSk7XG5cblx0dGVzdCgnZm9vID1+IC9iYXIvJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2ZvbyA9fiAvYmFyLyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJ2ZvbyA9fiAvYmFyLycpO1xuXHR9KTtcblxuXHR0ZXN0KGBmb28gfHwgKGZvbyA9fiAvYmFyLyAmJiBiYXopYCwgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gYGZvbyB8fCAoZm9vID1+IC9iYXIvICYmIGJheilgO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdmb28gfHwgYmF6ICYmIGZvbyA9fiAvYmFyLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb28gfHwgKGZvbyA9fiAvYmFyLyB8fCBiYXopJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2ZvbyB8fCAoZm9vID1+IC9iYXIvIHx8IGJheiknO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdiYXogfHwgZm9vIHx8IGZvbyA9fiAvYmFyLycpO1xuXHR9KTtcblxuXHR0ZXN0KGAoZm9vIHx8IGJhcikgJiYgKGplZSB8fCBqYXIpYCwgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gYChmb28gfHwgYmFyKSAmJiAoamVlIHx8IGphcilgO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdiYXIgJiYgamFyIHx8IGJhciAmJiBqZWUgfHwgZm9vICYmIGphciB8fCBmb28gJiYgamVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbyAmJiBmb28gPX4gL3plZS9pJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2ZvbyAmJiBmb28gPX4gL3plZS9pJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnZm9vICYmIGZvbyA9fiAvemVlL2knKTtcblx0fSk7XG5cblx0dGVzdCgnZm9vLmJhcj09ZW5hYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb28uYmFyPT1lbmFibGVkJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgZm9vLmJhciA9PSAnZW5hYmxlZCdgKTtcblx0fSk7XG5cblx0dGVzdChgZm9vLmJhciA9PSAnZW5hYmxlZCdgLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSBgZm9vLmJhciA9PSAnZW5hYmxlZCdgO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGBmb28uYmFyID09ICdlbmFibGVkJ2ApO1xuXHR9KTtcblxuXHR0ZXN0KCdmb28uYmFyOnplZD09Y29tcGxldGVkIC0gZXF1YWxpdHkgd2l0aCBubyBzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb28uYmFyOnplZD09Y29tcGxldGVkJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgZm9vLmJhcjp6ZWQgPT0gJ2NvbXBsZXRlZCdgKTtcblx0fSk7XG5cblx0dGVzdCgnYSAmJiBiIHx8IGMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnYSAmJiBiIHx8IGMnO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdjIHx8IGEgJiYgYicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb29CYXIgJiYgYmF6LmphciAmJiBmZWUuYmVlPEstbG9vKzE+JywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2Zvb0JhciAmJiBiYXouamFyICYmIGZlZS5iZWU8Sy1sb28rMT4nO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdiYXouamFyICYmIGZlZS5iZWU8Sy1sb28rMT4gJiYgZm9vQmFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvby5iYXJCYXo8Qy1yPiA8IDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnZm9vLmJhckJhejxDLXI+IDwgMic7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYGZvby5iYXJCYXo8Qy1yPiA8IDJgKTtcblx0fSk7XG5cblx0dGVzdCgnZm9vLmJhciA+PSAtMScsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb28uYmFyID49IC0xJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCAnZm9vLmJhciA+PSAtMScpO1xuXHR9KTtcblxuXHR0ZXN0KGBrZXkgY29udGFpbnMgJm5ic3A6IHZpZXcgPT0gdnNjLXBhY2thZ2VzLWFjdGl2aXR5YmFyLWZvbGRlcnNcdTAwQTAmJiB2c2MtcGFja2FnZXMtZm9sZGVycy1sb2FkZWRgLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSBgdmlldyA9PSB2c2MtcGFja2FnZXMtYWN0aXZpdHliYXItZm9sZGVyc1x1MDBBMCYmIHZzYy1wYWNrYWdlcy1mb2xkZXJzLWxvYWRlZGA7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYHZzYy1wYWNrYWdlcy1mb2xkZXJzLWxvYWRlZCAmJiB2aWV3ID09ICd2c2MtcGFja2FnZXMtYWN0aXZpdHliYXItZm9sZGVycydgKTtcblx0fSk7XG5cblx0dGVzdCgnZm9vLmJhciA8PSAtMScsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdmb28uYmFyIDw9IC0xJztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgZm9vLmJhciA8PSAtMWApO1xuXHR9KTtcblxuXHR0ZXN0KCchY21ha2U6aGlkZUJ1aWxkQ29tbWFuZCBcXHUwMDI2XFx1MDAyNiBjbWFrZTplbmFibGVGdWxsRmVhdHVyZVNldCcsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICchY21ha2U6aGlkZUJ1aWxkQ29tbWFuZCBcXHUwMDI2XFx1MDAyNiBjbWFrZTplbmFibGVGdWxsRmVhdHVyZVNldCc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJ2NtYWtlOmVuYWJsZUZ1bGxGZWF0dXJlU2V0ICYmICFjbWFrZTpoaWRlQnVpbGRDb21tYW5kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJyEoZm9vICYmIGJhciknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnIShmb28gJiYgYmFyKSc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJyFiYXIgfHwgIWZvbycpO1xuXHR9KTtcblxuXHR0ZXN0KCchKGZvbyAmJiBiYXIgfHwgYm9hcikgfHwgZGVlcicsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICchKGZvbyAmJiBiYXIgfHwgYm9hcikgfHwgZGVlcic7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJ2RlZXIgfHwgIWJhciAmJiAhYm9hciB8fCAhYm9hciAmJiAhZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoYCEoIWZvbylgLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSBgISghZm9vKWA7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgJ2ZvbycpO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29udHJvdmVyc2lhbCcsICgpID0+IHtcblx0XHQvKlxuXHRcdFx0bmV3IHBhcnNlciBLRUVQUyBvbGQgb25lJ3MgYmVoYXZpb3I6XG5cblx0XHRcdG9sZCBwYXJzZXIgb3V0cHV0OiB7IGtleTogJ2RlYnVnU3RhdGUnLCBvcDogJz09JywgdmFsdWU6ICdcInN0b3BwZWRcIicgfVxuXHRcdFx0bmV3IHBhcnNlciBvdXRwdXQ6IHsga2V5OiAnZGVidWdTdGF0ZScsIG9wOiAnPT0nLCB2YWx1ZTogJ1wic3RvcHBlZFwiJyB9XG5cblx0XHRcdFRPRE9AdWx1Z2Jla25hOiB3ZSBzaG91bGQgY29uc2lkZXIgYnJlYWtpbmcgb2xkIHBhcnNlcidzIGJlaGF2aW9yLCBhbmQgbm90IHRha2UgZG91YmxlIHF1b3RlcyBhcyBwYXJ0IG9mIHRoZSBgdmFsdWVgIGJlY2F1c2UgdGhhdCdzIG5vdCB3aGF0IHVzZXIgZXhwZWN0cy5cblx0XHQqL1xuXHRcdHRlc3QoYGRlYnVnU3RhdGUgPT0gXCJzdG9wcGVkXCJgLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGBkZWJ1Z1N0YXRlID09IFwic3RvcHBlZFwiYDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGBkZWJ1Z1N0YXRlID09ICdcInN0b3BwZWRcIidgKTtcblx0XHR9KTtcblxuXHRcdC8qXG5cdFx0XHRuZXcgcGFyc2VyIEJSRUFLUyBvbGQgb25lJ3MgYmVoYXZpb3I6XG5cblx0XHRcdG9sZCBwYXJzZXIgb3V0cHV0OiB7IGtleTogJ3ZpZXdJdGVtJywgb3A6ICc9PScsIHZhbHVlOiAnVlNDb2RlIFdvcmtTcGFjZScgfVxuXHRcdFx0bmV3IHBhcnNlciBvdXRwdXQ6IHsga2V5OiAndmlld0l0ZW0nLCBvcDogJz09JywgdmFsdWU6ICdWU0NvZGUnIH1cblxuXHRcdFx0VE9ET0B1bHVnYmVrbmE6IHNpbmNlIHRoaXMncyBicmVha2luZywgd2UgY2FuIGhhdmUgaGFja3kgY29kZSB0aGF0IHRyaWVzIGRldGVjdGluZyBzdWNoIGNhc2VzIGFuZCByZXBsaWNhdGUgb2xkIHBhcnNlcidzIGJlaGF2aW9yLlxuXHRcdCovXG5cdFx0dGVzdChgIHZpZXdJdGVtID09IFZTQ29kZSBXb3JrU3BhY2VgLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGAgdmlld0l0ZW0gPT0gVlNDb2RlIFdvcmtTcGFjZWA7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgUGFyc2luZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCAnV29ya1NwYWNlJyBhdCBvZmZzZXQgMjAuXFxuYCk7XG5cdFx0fSk7XG5cblxuXHR9KTtcblxuXHRzdWl0ZSgncmVnZXgnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KGByZXNvdXJjZSA9fiAvL2Zvby8oYmFycnxkb29yLyhGb28tQmFyJTIwVGVtcGxhdGVzfFNvbyUyMExvb28pfFdlYiUyMFNpdGUlSmpqJTIwTGxsbCkoLy4qKSokL2AsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYHJlc291cmNlID1+IC8vZm9vLyhiYXJyfGRvb3IvKEZvby1CYXIlMjBUZW1wbGF0ZXN8U29vJTIwTG9vbyl8V2ViJTIwU2l0ZSVKamolMjBMbGxsKSgvLiopKiQvYDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdyZXNvdXJjZSA9fiAvXFxcXC9mb29cXFxcLyhiYXJyfGRvb3JcXFxcLyhGb28tQmFyJTIwVGVtcGxhdGVzfFNvbyUyMExvb28pfFdlYiUyMFNpdGUlSmpqJTIwTGxsbCkoXFxcXC8uKikqJC8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoYHJlc291cmNlID1+IC8oKC9zY3JhdGNoLyg/IXVwZGF0ZSkoLiopLyl8KCgvc3JjLykuKi8pKS4qJC9gLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IGByZXNvdXJjZSA9fiAvKCgvc2NyYXRjaC8oPyF1cGRhdGUpKC4qKS8pfCgoL3NyYy8pLiovKSkuKiQvYDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdyZXNvdXJjZSA9fiAvKChcXFxcL3NjcmF0Y2hcXFxcLyg/IXVwZGF0ZSkoLiopXFxcXC8pfCgoXFxcXC9zcmNcXFxcLykuKlxcXFwvKSkuKiQvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KGByZXNvdXJjZVBhdGggPX4gL1xcLm1kKFxcLnltbHxcXC50eHQpKiQvZ2l5bWAsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYHJlc291cmNlUGF0aCA9fiAvXFwubWQoXFwueW1sfFxcLnR4dCkqJC9naXltYDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksICdyZXNvdXJjZVBhdGggPX4gLy5tZCgueW1sfC50eHQpKiQvaW0nKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgnZXJyb3IgaGFuZGxpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KGAvZm9vYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgL2Zvb2A7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgTGV4aW5nIGVycm9yczpcXG5cXG5VbmV4cGVjdGVkIHRva2VuICcvZm9vJyBhdCBvZmZzZXQgMC4gRGlkIHlvdSBmb3JnZXQgdG8gZXNjYXBlIHRoZSAnLycgKHNsYXNoKSBjaGFyYWN0ZXI/IFB1dCB0d28gYmFja3NsYXNoZXMgYmVmb3JlIGl0IHRvIGVzY2FwZSwgZS5nLiwgJ1xcXFxcXFxcLycuXFxuXFxuIC0tLSBcXG5QYXJzaW5nIGVycm9yczpcXG5cXG5VbmV4cGVjdGVkICcvZm9vJyBhdCBvZmZzZXQgMC5cXG5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoYCFiID09ICd0cnVlJ2AsICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gYCFiID09ICd0cnVlJ2A7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgUGFyc2luZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCAnPT0nIGF0IG9mZnNldCAzLlxcbmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnIWZvbyAmJiAgaW4gYmFyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnIWZvbyAmJiAgaW4gYmFyJztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VUb1N0cihpbnB1dCksIGBQYXJzaW5nIGVycm9yczpcXG5cXG5VbmV4cGVjdGVkICdpbicgYXQgb2Zmc2V0IDkuXFxuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2aW08Yy1yPiA9PSAxICYmIHZpbTwyPD0zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAndmltPGMtcj4gPT0gMSAmJiB2aW08Mjw9Myc7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgTGV4aW5nIGVycm9yczpcXG5cXG5VbmV4cGVjdGVkIHRva2VuICc9JyBhdCBvZmZzZXQgMjMuIERpZCB5b3UgbWVhbiA9PSBvciA9fj9cXG5cXG4gLS0tIFxcblBhcnNpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgJz0nIGF0IG9mZnNldCAyMy5cXG5gKTsgLy8gRklYTUVcblx0XHR9KTtcblxuXHRcdHRlc3QoYGZvbyAmJiAnYmFyYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgZm9vICYmICdiYXJgO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYExleGluZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCB0b2tlbiAnJ2JhcicgYXQgb2Zmc2V0IDcuIERpZCB5b3UgZm9yZ2V0IHRvIG9wZW4gb3IgY2xvc2UgdGhlIHF1b3RlP1xcblxcbiAtLS0gXFxuUGFyc2luZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCAnJ2JhcicgYXQgb2Zmc2V0IDcuXFxuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KGBjb25maWcuZm9vICYmICAmJmJhciA9fiAvXmZvbyR8XmJhci1mb28kfF5qb28kfF5qYXIkLyAmJiAhZm9vYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgY29uZmlnLmZvbyAmJiAgJiZiYXIgPX4gL15mb28kfF5iYXItZm9vJHxeam9vJHxeamFyJC8gJiYgIWZvb2A7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVG9TdHIoaW5wdXQpLCBgUGFyc2luZyBlcnJvcnM6XFxuXFxuVW5leHBlY3RlZCAnJiYnIGF0IG9mZnNldCAxNS5cXG5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoYCFmb28gPT0gJ3Rlc3QnYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgIWZvbyA9PSAndGVzdCdgO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYFBhcnNpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgJz09JyBhdCBvZmZzZXQgNS5cXG5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoYCEhZm9vYCwgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBgISFmb29gO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVRvU3RyKGlucHV0KSwgYFBhcnNpbmcgZXJyb3JzOlxcblxcblVuZXhwZWN0ZWQgJyEnIGF0IG9mZnNldCAxLlxcbmApO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGNBQWM7QUFFdkIsU0FBUyxXQUFXLE9BQXVCO0FBQzFDLFFBQU0sU0FBUyxJQUFJLE9BQU87QUFFMUIsUUFBTSxTQUFtQixDQUFDO0FBRTFCLFFBQU0sUUFBUSxJQUFJLE9BQWlCO0FBQUUsT0FBRyxRQUFRLE9BQUssT0FBTyxLQUFLLENBQUMsQ0FBQztBQUFBLEVBQUc7QUFFdEUsUUFBTSxPQUFPLE9BQU8sTUFBTSxLQUFLO0FBQy9CLE1BQUksU0FBUyxRQUFXO0FBQ3ZCLFFBQUksT0FBTyxhQUFhLFNBQVMsR0FBRztBQUNuQyxZQUFNLGtCQUFrQixNQUFNO0FBQzlCLGFBQU8sYUFBYSxRQUFRLGlCQUFlLE1BQU0scUJBQXFCLFlBQVksTUFBTSxlQUFlLFlBQVksTUFBTSxLQUFLLFlBQVksY0FBYyxJQUFJLElBQUksQ0FB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
