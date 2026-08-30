import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { UriTemplate } from "../../common/uriTemplate.js";
import * as assert from "assert";
suite("UriTemplate", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testParsing(template, expectedComponents) {
    const templ = UriTemplate.parse(template);
    assert.deepStrictEqual(templ.components.filter((c) => typeof c === "object"), expectedComponents);
    return templ;
  }
  function testResolution(template, variables, expected) {
    const templ = UriTemplate.parse(template);
    const result = templ.resolve(variables);
    assert.strictEqual(result, expected);
  }
  test("simple replacement", () => {
    const templ = UriTemplate.parse("http://example.com/{var}");
    assert.deepStrictEqual(templ.components, ["http://example.com/", {
      expression: "{var}",
      operator: "",
      variables: [{ explodable: false, name: "var", optional: false, prefixLength: void 0, repeatable: false }]
    }, ""]);
    const result = templ.resolve({ var: "value" });
    assert.strictEqual(result, "http://example.com/value");
  });
  test("parsing components correctly", () => {
    testParsing("http://example.com/{var}", [{
      expression: "{var}",
      operator: "",
      variables: [{ explodable: false, name: "var", optional: false, prefixLength: void 0, repeatable: false }]
    }]);
    testParsing("http://example.com/{+path}", [{
      expression: "{+path}",
      operator: "+",
      variables: [{ explodable: false, name: "path", optional: false, prefixLength: void 0, repeatable: false }]
    }]);
    testParsing("http://example.com/{x,y}", [{
      expression: "{x,y}",
      operator: "",
      variables: [
        { explodable: false, name: "x", optional: false, prefixLength: void 0, repeatable: false },
        { explodable: false, name: "y", optional: false, prefixLength: void 0, repeatable: false }
      ]
    }]);
    testParsing("http://example.com/{var:3}", [{
      expression: "{var:3}",
      operator: "",
      variables: [{ explodable: false, name: "var", optional: false, prefixLength: 3, repeatable: false }]
    }]);
    testParsing("http://example.com/{list*}", [{
      expression: "{list*}",
      operator: "",
      variables: [{ explodable: true, name: "list", optional: false, prefixLength: void 0, repeatable: true }]
    }]);
    testParsing("http://example.com/{x}/path/{y}", [
      {
        expression: "{x}",
        operator: "",
        variables: [{ explodable: false, name: "x", optional: false, prefixLength: void 0, repeatable: false }]
      },
      {
        expression: "{y}",
        operator: "",
        variables: [{ explodable: false, name: "y", optional: false, prefixLength: void 0, repeatable: false }]
      }
    ]);
  });
  test("Level 1 - Simple string expansion", () => {
    const variables = {
      var: "value",
      hello: "Hello World!"
    };
    testResolution("{var}", variables, "value");
    testResolution("{hello}", variables, "Hello%20World%21");
  });
  test("control characters are percent-encoded with two hex digits", () => {
    testResolution("{x}", { x: "a	b" }, "a%09b");
    testResolution("{x}", { x: "\n" }, "%0A");
    testResolution("{x}", { x: "\r" }, "%0D");
  });
  test("Level 2 - Reserved expansion", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar"
    };
    testResolution("{+var}", variables, "value");
    testResolution("{+hello}", variables, "Hello%20World!");
    testResolution("{+path}/here", variables, "/foo/bar/here");
    testResolution("here?ref={+path}", variables, "here?ref=/foo/bar");
  });
  test("Level 2 - Fragment expansion", () => {
    const variables = {
      var: "value",
      hello: "Hello World!"
    };
    testResolution("X{#var}", variables, "X#value");
    testResolution("X{#hello}", variables, "X#Hello%20World!");
  });
  test("Level 3 - String expansion with multiple variables", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      empty: "",
      path: "/foo/bar",
      x: "1024",
      y: "768"
    };
    testResolution("map?{x,y}", variables, "map?1024,768");
    testResolution("{x,hello,y}", variables, "1024,Hello%20World%21,768");
  });
  test("Level 3 - Reserved expansion with multiple variables", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      x: "1024",
      y: "768"
    };
    testResolution("{+x,hello,y}", variables, "1024,Hello%20World!,768");
    testResolution("{+path,x}/here", variables, "/foo/bar,1024/here");
  });
  test("Level 3 - Fragment expansion with multiple variables", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      x: "1024",
      y: "768"
    };
    testResolution("{#x,hello,y}", variables, "#1024,Hello%20World!,768");
    testResolution("{#path,x}/here", variables, "#/foo/bar,1024/here");
  });
  test("Level 3 - Label expansion with dot-prefix", () => {
    const variables = {
      var: "value",
      x: "1024",
      y: "768"
    };
    testResolution("X{.var}", variables, "X.value");
    testResolution("X{.x,y}", variables, "X.1024.768");
  });
  test("Level 3 - Path segments expansion", () => {
    const variables = {
      var: "value",
      x: "1024"
    };
    testResolution("{/var}", variables, "/value");
    testResolution("{/var,x}/here", variables, "/value/1024/here");
  });
  test("Level 3 - Path-style parameter expansion", () => {
    const variables = {
      x: "1024",
      y: "768",
      empty: ""
    };
    testResolution("{;x,y}", variables, ";x=1024;y=768");
    testResolution("{;x,y,empty}", variables, ";x=1024;y=768;empty");
  });
  test("Level 3 - Form-style query expansion", () => {
    const variables = {
      x: "1024",
      y: "768",
      empty: ""
    };
    testResolution("{?x,y}", variables, "?x=1024&y=768");
    testResolution("{?x,y,empty}", variables, "?x=1024&y=768&empty=");
  });
  test("Level 3 - Form-style query continuation", () => {
    const variables = {
      x: "1024",
      y: "768",
      empty: ""
    };
    testResolution("?fixed=yes{&x}", variables, "?fixed=yes&x=1024");
    testResolution("{&x,y,empty}", variables, "&x=1024&y=768&empty=");
  });
  test("Level 4 - String expansion with value modifiers", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{var:3}", variables, "val");
    testResolution("{var:30}", variables, "value");
    testResolution("{list}", variables, "red,green,blue");
    testResolution("{list*}", variables, "red,green,blue");
  });
  test("Level 4 - Reserved expansion with value modifiers", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{+path:6}/here", variables, "/foo/b/here");
    testResolution("{+list}", variables, "red,green,blue");
    testResolution("{+list*}", variables, "red,green,blue");
    testResolution("{+keys}", variables, "semi,;,dot,.,comma,,");
    testResolution("{+keys*}", variables, "semi=;,dot=.,comma=,");
  });
  test("Level 4 - Fragment expansion with value modifiers", () => {
    const variables = {
      var: "value",
      hello: "Hello World!",
      path: "/foo/bar",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{#path:6}/here", variables, "#/foo/b/here");
    testResolution("{#list}", variables, "#red,green,blue");
    testResolution("{#list*}", variables, "#red,green,blue");
    testResolution("{#keys}", variables, "#semi,;,dot,.,comma,,");
    testResolution("{#keys*}", variables, "#semi=;,dot=.,comma=,");
  });
  test("Level 4 - Label expansion with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("X{.var:3}", variables, "X.val");
    testResolution("X{.list}", variables, "X.red,green,blue");
    testResolution("X{.list*}", variables, "X.red.green.blue");
    testResolution("X{.keys}", variables, "X.semi,;,dot,.,comma,,");
    testResolution("X{.keys*}", variables, "X.semi=;.dot=..comma=,");
  });
  test("Level 4 - Path expansion with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      path: "/foo/bar",
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{/var:1,var}", variables, "/v/value");
    testResolution("{/list}", variables, "/red,green,blue");
    testResolution("{/list*}", variables, "/red/green/blue");
    testResolution("{/list*,path:4}", variables, "/red/green/blue/%2Ffoo");
    testResolution("{/keys}", variables, "/semi,;,dot,.,comma,,");
    testResolution("{/keys*}", variables, "/semi=%3B/dot=./comma=%2C");
  });
  test("Level 4 - Path-style parameters with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{;hello:5}", { hello: "Hello World!" }, ";hello=Hello");
    testResolution("{;list}", variables, ";list=red,green,blue");
    testResolution("{;list*}", variables, ";list=red;list=green;list=blue");
    testResolution("{;keys}", variables, ";keys=semi,;,dot,.,comma,,");
    testResolution("{;keys*}", variables, ";semi=;;dot=.;comma=,");
  });
  test("Level 4 - Form-style query with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("{?var:3}", variables, "?var=val");
    testResolution("{?list}", variables, "?list=red,green,blue");
    testResolution("{?list*}", variables, "?list=red&list=green&list=blue");
    testResolution("{?keys}", variables, "?keys=semi,;,dot,.,comma,,");
    testResolution("{?keys*}", variables, "?semi=;&dot=.&comma=,");
  });
  test("Level 4 - Form-style query continuation with value modifiers", () => {
    const variables = {
      var: "value",
      list: ["red", "green", "blue"],
      keys: {
        semi: ";",
        dot: ".",
        comma: ","
      }
    };
    testResolution("?fixed=yes{&var:3}", variables, "?fixed=yes&var=val");
    testResolution("?fixed=yes{&list}", variables, "?fixed=yes&list=red,green,blue");
    testResolution("?fixed=yes{&list*}", variables, "?fixed=yes&list=red&list=green&list=blue");
    testResolution("?fixed=yes{&keys}", variables, "?fixed=yes&keys=semi,;,dot,.,comma,,");
    testResolution("?fixed=yes{&keys*}", variables, "?fixed=yes&semi=;&dot=.&comma=,");
  });
  test("handling undefined or null values", () => {
    const variables = {
      defined: "value",
      undef: void 0,
      null: null,
      empty: ""
    };
    testResolution("{defined,undef,null,empty}", variables, "value,");
    testResolution("{+defined,undef,null,empty}", variables, "value,");
    testResolution("{#defined,undef,null,empty}", variables, "#value,");
    testResolution("X{.defined,undef,null,empty}", variables, "X.value");
    testResolution("{/defined,undef,null}", variables, "/value");
    testResolution("{;defined,empty}", variables, ";defined=value;empty");
    testResolution("{?defined,undef,null,empty}", variables, "?defined=value&undef=&null=&empty=");
    testResolution("{&defined,undef,null,empty}", variables, "&defined=value&undef=&null=&empty=");
  });
  test("complex templates", () => {
    const variables = {
      domain: "example.com",
      user: "fred",
      path: ["path", "to", "resource"],
      query: "search",
      page: 5,
      lang: "en",
      sessionId: "123abc",
      filters: ["color:blue", "shape:square"],
      coordinates: { lat: "37.7", lon: "-122.4" }
    };
    testResolution(
      "https://{domain}/api/v1/users/{user}{/path*}{?query,page,lang}",
      variables,
      "https://example.com/api/v1/users/fred/path/to/resource?query=search&page=5&lang=en"
    );
    testResolution(
      "https://{domain}/search{?query,filters,coordinates*}",
      variables,
      "https://example.com/search?query=search&filters=color:blue,shape:square&lat=37.7&lon=-122.4"
    );
    testResolution(
      "https://{domain}/users/{user}/profile{.lang}{?sessionId}{#path}",
      variables,
      "https://example.com/users/fred/profile.en?sessionId=123abc#path,to,resource"
    );
  });
  test("literals and escaping", () => {
    testParsing("http://example.com/literal", []);
    testParsing("http://example.com/{var}literal{var2}", [
      {
        expression: "{var}",
        operator: "",
        variables: [{ explodable: false, name: "var", optional: false, prefixLength: void 0, repeatable: false }]
      },
      {
        expression: "{var2}",
        operator: "",
        variables: [{ explodable: false, name: "var2", optional: false, prefixLength: void 0, repeatable: false }]
      }
    ]);
    testResolution("http://example.com/{{var}}", { var: "value" }, "http://example.com/{var}");
  });
  test("edge cases", () => {
    testResolution("", {}, "");
    testResolution("http://example.com/path", {}, "http://example.com/path");
    testResolution("{var}", {}, "");
    testResolution("{a}{b}{c}", { a: "1", b: "2", c: "3" }, "123");
    testResolution("{_hidden.var-name$}", { "_hidden.var-name$": "value" }, "value");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHVyaVRlbXBsYXRlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcbmltcG9ydCB7IFVyaVRlbXBsYXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaVRlbXBsYXRlLmpzJztcbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuXG5zdWl0ZSgnVXJpVGVtcGxhdGUnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8qKlxuXHQgKiBIZWxwZXIgZnVuY3Rpb24gdG8gdGVzdCB0ZW1wbGF0ZSBwYXJzaW5nIGFuZCBjb21wb25lbnQgZXh0cmFjdGlvblxuXHQgKi9cblx0ZnVuY3Rpb24gdGVzdFBhcnNpbmcodGVtcGxhdGU6IHN0cmluZywgZXhwZWN0ZWRDb21wb25lbnRzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCB0ZW1wbCA9IFVyaVRlbXBsYXRlLnBhcnNlKHRlbXBsYXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbXBsLmNvbXBvbmVudHMuZmlsdGVyKGMgPT4gdHlwZW9mIGMgPT09ICdvYmplY3QnKSwgZXhwZWN0ZWRDb21wb25lbnRzKTtcblx0XHRyZXR1cm4gdGVtcGw7XG5cdH1cblxuXHQvKipcblx0ICogSGVscGVyIGZ1bmN0aW9uIHRvIHRlc3QgdGVtcGxhdGUgcmVzb2x1dGlvblxuXHQgKi9cblx0ZnVuY3Rpb24gdGVzdFJlc29sdXRpb24odGVtcGxhdGU6IHN0cmluZywgdmFyaWFibGVzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+LCBleHBlY3RlZDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgdGVtcGwgPSBVcmlUZW1wbGF0ZS5wYXJzZSh0ZW1wbGF0ZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGVtcGwucmVzb2x2ZSh2YXJpYWJsZXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGV4cGVjdGVkKTtcblx0fVxuXG5cdHRlc3QoJ3NpbXBsZSByZXBsYWNlbWVudCcsICgpID0+IHtcblx0XHRjb25zdCB0ZW1wbCA9IFVyaVRlbXBsYXRlLnBhcnNlKCdodHRwOi8vZXhhbXBsZS5jb20ve3Zhcn0nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlbXBsLmNvbXBvbmVudHMsIFsnaHR0cDovL2V4YW1wbGUuY29tLycsIHtcblx0XHRcdGV4cHJlc3Npb246ICd7dmFyfScsXG5cdFx0XHRvcGVyYXRvcjogJycsXG5cdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAndmFyJywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfV1cblx0XHR9LCAnJ10pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRlbXBsLnJlc29sdmUoeyB2YXI6ICd2YWx1ZScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ2h0dHA6Ly9leGFtcGxlLmNvbS92YWx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzaW5nIGNvbXBvbmVudHMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdC8vIFNpbXBsZSBjb21wb25lbnRcblx0XHR0ZXN0UGFyc2luZygnaHR0cDovL2V4YW1wbGUuY29tL3t2YXJ9JywgW3tcblx0XHRcdGV4cHJlc3Npb246ICd7dmFyfScsXG5cdFx0XHRvcGVyYXRvcjogJycsXG5cdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAndmFyJywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfV1cblx0XHR9XSk7XG5cblx0XHQvLyBDb21wb25lbnQgd2l0aCBvcGVyYXRvclxuXHRcdHRlc3RQYXJzaW5nKCdodHRwOi8vZXhhbXBsZS5jb20veytwYXRofScsIFt7XG5cdFx0XHRleHByZXNzaW9uOiAneytwYXRofScsXG5cdFx0XHRvcGVyYXRvcjogJysnLFxuXHRcdFx0dmFyaWFibGVzOiBbeyBleHBsb2RhYmxlOiBmYWxzZSwgbmFtZTogJ3BhdGgnLCBvcHRpb25hbDogZmFsc2UsIHByZWZpeExlbmd0aDogdW5kZWZpbmVkLCByZXBlYXRhYmxlOiBmYWxzZSB9XVxuXHRcdH1dKTtcblxuXHRcdC8vIENvbXBvbmVudCB3aXRoIG11bHRpcGxlIHZhcmlhYmxlc1xuXHRcdHRlc3RQYXJzaW5nKCdodHRwOi8vZXhhbXBsZS5jb20ve3gseX0nLCBbe1xuXHRcdFx0ZXhwcmVzc2lvbjogJ3t4LHl9Jyxcblx0XHRcdG9wZXJhdG9yOiAnJyxcblx0XHRcdHZhcmlhYmxlczogW1xuXHRcdFx0XHR7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAneCcsIG9wdGlvbmFsOiBmYWxzZSwgcHJlZml4TGVuZ3RoOiB1bmRlZmluZWQsIHJlcGVhdGFibGU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgZXhwbG9kYWJsZTogZmFsc2UsIG5hbWU6ICd5Jywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IHVuZGVmaW5lZCwgcmVwZWF0YWJsZTogZmFsc2UgfVxuXHRcdFx0XVxuXHRcdH1dKTtcblxuXHRcdC8vIENvbXBvbmVudCB3aXRoIHZhbHVlIG1vZGlmaWVyc1xuXHRcdHRlc3RQYXJzaW5nKCdodHRwOi8vZXhhbXBsZS5jb20ve3ZhcjozfScsIFt7XG5cdFx0XHRleHByZXNzaW9uOiAne3ZhcjozfScsXG5cdFx0XHRvcGVyYXRvcjogJycsXG5cdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAndmFyJywgb3B0aW9uYWw6IGZhbHNlLCBwcmVmaXhMZW5ndGg6IDMsIHJlcGVhdGFibGU6IGZhbHNlIH1dXG5cdFx0fV0pO1xuXG5cdFx0dGVzdFBhcnNpbmcoJ2h0dHA6Ly9leGFtcGxlLmNvbS97bGlzdCp9JywgW3tcblx0XHRcdGV4cHJlc3Npb246ICd7bGlzdCp9Jyxcblx0XHRcdG9wZXJhdG9yOiAnJyxcblx0XHRcdHZhcmlhYmxlczogW3sgZXhwbG9kYWJsZTogdHJ1ZSwgbmFtZTogJ2xpc3QnLCBvcHRpb25hbDogZmFsc2UsIHByZWZpeExlbmd0aDogdW5kZWZpbmVkLCByZXBlYXRhYmxlOiB0cnVlIH1dXG5cdFx0fV0pO1xuXG5cdFx0Ly8gTXVsdGlwbGUgY29tcG9uZW50c1xuXHRcdHRlc3RQYXJzaW5nKCdodHRwOi8vZXhhbXBsZS5jb20ve3h9L3BhdGgve3l9JywgW1xuXHRcdFx0e1xuXHRcdFx0XHRleHByZXNzaW9uOiAne3h9Jyxcblx0XHRcdFx0b3BlcmF0b3I6ICcnLFxuXHRcdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAneCcsIG9wdGlvbmFsOiBmYWxzZSwgcHJlZml4TGVuZ3RoOiB1bmRlZmluZWQsIHJlcGVhdGFibGU6IGZhbHNlIH1dXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRleHByZXNzaW9uOiAne3l9Jyxcblx0XHRcdFx0b3BlcmF0b3I6ICcnLFxuXHRcdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAneScsIG9wdGlvbmFsOiBmYWxzZSwgcHJlZml4TGVuZ3RoOiB1bmRlZmluZWQsIHJlcGVhdGFibGU6IGZhbHNlIH1dXG5cdFx0XHR9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDEgLSBTaW1wbGUgc3RyaW5nIGV4cGFuc2lvbicsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkISdcblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ3t2YXJ9JywgdmFyaWFibGVzLCAndmFsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigne2hlbGxvfScsIHZhcmlhYmxlcywgJ0hlbGxvJTIwV29ybGQlMjEnKTtcblx0fSk7XG5cblx0dGVzdCgnY29udHJvbCBjaGFyYWN0ZXJzIGFyZSBwZXJjZW50LWVuY29kZWQgd2l0aCB0d28gaGV4IGRpZ2l0cycsICgpID0+IHtcblx0XHQvLyBDb2RlIHBvaW50cyBiZWxvdyAweDEwIG11c3QgYmUgemVyby1wYWRkZWQgKGUuZy4gJTA5LCBub3QgJTkpIHNvIHRoZVxuXHRcdC8vIG91dHB1dCBpcyBhIHZhbGlkIHBlcmNlbnQtZW5jb2RpbmcgdGhhdCBkZWNvZGVVUklDb21wb25lbnQgYWNjZXB0cy5cblx0XHR0ZXN0UmVzb2x1dGlvbigne3h9JywgeyB4OiAnYVxcdGInIH0sICdhJTA5YicpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7eH0nLCB7IHg6ICdcXG4nIH0sICclMEEnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigne3h9JywgeyB4OiAnXFxyJyB9LCAnJTBEJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDIgLSBSZXNlcnZlZCBleHBhbnNpb24nLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyBmcm9tIFJGQyA2NTcwIFNlY3Rpb24gMS4yXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0aGVsbG86ICdIZWxsbyBXb3JsZCEnLFxuXHRcdFx0cGF0aDogJy9mb28vYmFyJ1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbigneyt2YXJ9JywgdmFyaWFibGVzLCAndmFsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneytoZWxsb30nLCB2YXJpYWJsZXMsICdIZWxsbyUyMFdvcmxkIScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K3BhdGh9L2hlcmUnLCB2YXJpYWJsZXMsICcvZm9vL2Jhci9oZXJlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ2hlcmU/cmVmPXsrcGF0aH0nLCB2YXJpYWJsZXMsICdoZXJlP3JlZj0vZm9vL2JhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCAyIC0gRnJhZ21lbnQgZXhwYW5zaW9uJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgZnJvbSBSRkMgNjU3MCBTZWN0aW9uIDEuMlxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHZhcjogJ3ZhbHVlJyxcblx0XHRcdGhlbGxvOiAnSGVsbG8gV29ybGQhJ1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbignWHsjdmFyfScsIHZhcmlhYmxlcywgJ1gjdmFsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignWHsjaGVsbG99JywgdmFyaWFibGVzLCAnWCNIZWxsbyUyMFdvcmxkIScpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCAzIC0gU3RyaW5nIGV4cGFuc2lvbiB3aXRoIG11bHRpcGxlIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkIScsXG5cdFx0XHRlbXB0eTogJycsXG5cdFx0XHRwYXRoOiAnL2Zvby9iYXInLFxuXHRcdFx0eDogJzEwMjQnLFxuXHRcdFx0eTogJzc2OCdcblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ21hcD97eCx5fScsIHZhcmlhYmxlcywgJ21hcD8xMDI0LDc2OCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7eCxoZWxsbyx5fScsIHZhcmlhYmxlcywgJzEwMjQsSGVsbG8lMjBXb3JsZCUyMSw3NjgnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgMyAtIFJlc2VydmVkIGV4cGFuc2lvbiB3aXRoIG11bHRpcGxlIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRoZWxsbzogJ0hlbGxvIFdvcmxkIScsXG5cdFx0XHRwYXRoOiAnL2Zvby9iYXInLFxuXHRcdFx0eDogJzEwMjQnLFxuXHRcdFx0eTogJzc2OCdcblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ3sreCxoZWxsbyx5fScsIHZhcmlhYmxlcywgJzEwMjQsSGVsbG8lMjBXb3JsZCEsNzY4Jyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3srcGF0aCx4fS9oZXJlJywgdmFyaWFibGVzLCAnL2Zvby9iYXIsMTAyNC9oZXJlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDMgLSBGcmFnbWVudCBleHBhbnNpb24gd2l0aCBtdWx0aXBsZSB2YXJpYWJsZXMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyBmcm9tIFJGQyA2NTcwIFNlY3Rpb24gMS4yXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0aGVsbG86ICdIZWxsbyBXb3JsZCEnLFxuXHRcdFx0cGF0aDogJy9mb28vYmFyJyxcblx0XHRcdHg6ICcxMDI0Jyxcblx0XHRcdHk6ICc3NjgnXG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7I3gsaGVsbG8seX0nLCB2YXJpYWJsZXMsICcjMTAyNCxIZWxsbyUyMFdvcmxkISw3NjgnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneyNwYXRoLHh9L2hlcmUnLCB2YXJpYWJsZXMsICcjL2Zvby9iYXIsMTAyNC9oZXJlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDMgLSBMYWJlbCBleHBhbnNpb24gd2l0aCBkb3QtcHJlZml4JywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgZnJvbSBSRkMgNjU3MCBTZWN0aW9uIDEuMlxuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHZhcjogJ3ZhbHVlJyxcblx0XHRcdHg6ICcxMDI0Jyxcblx0XHRcdHk6ICc3NjgnXG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCdYey52YXJ9JywgdmFyaWFibGVzLCAnWC52YWx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCdYey54LHl9JywgdmFyaWFibGVzLCAnWC4xMDI0Ljc2OCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCAzIC0gUGF0aCBzZWdtZW50cyBleHBhbnNpb24nLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyBmcm9tIFJGQyA2NTcwIFNlY3Rpb24gMS4yXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0eDogJzEwMjQnXG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7L3Zhcn0nLCB2YXJpYWJsZXMsICcvdmFsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigney92YXIseH0vaGVyZScsIHZhcmlhYmxlcywgJy92YWx1ZS8xMDI0L2hlcmUnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgMyAtIFBhdGgtc3R5bGUgcGFyYW1ldGVyIGV4cGFuc2lvbicsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR4OiAnMTAyNCcsXG5cdFx0XHR5OiAnNzY4Jyxcblx0XHRcdGVtcHR5OiAnJ1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbignezt4LHl9JywgdmFyaWFibGVzLCAnO3g9MTAyNDt5PTc2OCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7O3gseSxlbXB0eX0nLCB2YXJpYWJsZXMsICc7eD0xMDI0O3k9NzY4O2VtcHR5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDMgLSBGb3JtLXN0eWxlIHF1ZXJ5IGV4cGFuc2lvbicsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIGZyb20gUkZDIDY1NzAgU2VjdGlvbiAxLjJcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR4OiAnMTAyNCcsXG5cdFx0XHR5OiAnNzY4Jyxcblx0XHRcdGVtcHR5OiAnJ1xuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbignez94LHl9JywgdmFyaWFibGVzLCAnP3g9MTAyNCZ5PTc2OCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7P3gseSxlbXB0eX0nLCB2YXJpYWJsZXMsICc/eD0xMDI0Jnk9NzY4JmVtcHR5PScpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCAzIC0gRm9ybS1zdHlsZSBxdWVyeSBjb250aW51YXRpb24nLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyBmcm9tIFJGQyA2NTcwIFNlY3Rpb24gMS4yXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0eDogJzEwMjQnLFxuXHRcdFx0eTogJzc2OCcsXG5cdFx0XHRlbXB0eTogJydcblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJz9maXhlZD15ZXN7Jnh9JywgdmFyaWFibGVzLCAnP2ZpeGVkPXllcyZ4PTEwMjQnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneyZ4LHksZW1wdHl9JywgdmFyaWFibGVzLCAnJng9MTAyNCZ5PTc2OCZlbXB0eT0nKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgNCAtIFN0cmluZyBleHBhbnNpb24gd2l0aCB2YWx1ZSBtb2RpZmllcnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyBmcm9tIFJGQyA2NTcwIFNlY3Rpb24gMS4yXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0aGVsbG86ICdIZWxsbyBXb3JsZCEnLFxuXHRcdFx0cGF0aDogJy9mb28vYmFyJyxcblx0XHRcdGxpc3Q6IFsncmVkJywgJ2dyZWVuJywgJ2JsdWUnXSxcblx0XHRcdGtleXM6IHtcblx0XHRcdFx0c2VtaTogJzsnLFxuXHRcdFx0XHRkb3Q6ICcuJyxcblx0XHRcdFx0Y29tbWE6ICcsJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbigne3ZhcjozfScsIHZhcmlhYmxlcywgJ3ZhbCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7dmFyOjMwfScsIHZhcmlhYmxlcywgJ3ZhbHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3tsaXN0fScsIHZhcmlhYmxlcywgJ3JlZCxncmVlbixibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3tsaXN0Kn0nLCB2YXJpYWJsZXMsICdyZWQsZ3JlZW4sYmx1ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCA0IC0gUmVzZXJ2ZWQgZXhwYW5zaW9uIHdpdGggdmFsdWUgbW9kaWZpZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgcmVsYXRlZCB0byBMZXZlbCA0IGZlYXR1cmVzXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0aGVsbG86ICdIZWxsbyBXb3JsZCEnLFxuXHRcdFx0cGF0aDogJy9mb28vYmFyJyxcblx0XHRcdGxpc3Q6IFsncmVkJywgJ2dyZWVuJywgJ2JsdWUnXSxcblx0XHRcdGtleXM6IHtcblx0XHRcdFx0c2VtaTogJzsnLFxuXHRcdFx0XHRkb3Q6ICcuJyxcblx0XHRcdFx0Y29tbWE6ICcsJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbigneytwYXRoOjZ9L2hlcmUnLCB2YXJpYWJsZXMsICcvZm9vL2IvaGVyZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K2xpc3R9JywgdmFyaWFibGVzLCAncmVkLGdyZWVuLGJsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneytsaXN0Kn0nLCB2YXJpYWJsZXMsICdyZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7K2tleXN9JywgdmFyaWFibGVzLCAnc2VtaSw7LGRvdCwuLGNvbW1hLCwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneytrZXlzKn0nLCB2YXJpYWJsZXMsICdzZW1pPTssZG90PS4sY29tbWE9LCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCA0IC0gRnJhZ21lbnQgZXhwYW5zaW9uIHdpdGggdmFsdWUgbW9kaWZpZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgcmVsYXRlZCB0byBMZXZlbCA0IGZlYXR1cmVzXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0aGVsbG86ICdIZWxsbyBXb3JsZCEnLFxuXHRcdFx0cGF0aDogJy9mb28vYmFyJyxcblx0XHRcdGxpc3Q6IFsncmVkJywgJ2dyZWVuJywgJ2JsdWUnXSxcblx0XHRcdGtleXM6IHtcblx0XHRcdFx0c2VtaTogJzsnLFxuXHRcdFx0XHRkb3Q6ICcuJyxcblx0XHRcdFx0Y29tbWE6ICcsJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0ZXN0UmVzb2x1dGlvbigneyNwYXRoOjZ9L2hlcmUnLCB2YXJpYWJsZXMsICcjL2Zvby9iL2hlcmUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneyNsaXN0fScsIHZhcmlhYmxlcywgJyNyZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7I2xpc3QqfScsIHZhcmlhYmxlcywgJyNyZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7I2tleXN9JywgdmFyaWFibGVzLCAnI3NlbWksOyxkb3QsLixjb21tYSwsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3sja2V5cyp9JywgdmFyaWFibGVzLCAnI3NlbWk9Oyxkb3Q9Lixjb21tYT0sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDQgLSBMYWJlbCBleHBhbnNpb24gd2l0aCB2YWx1ZSBtb2RpZmllcnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjYXNlcyByZWxhdGVkIHRvIExldmVsIDQgZmVhdHVyZXNcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHR2YXI6ICd2YWx1ZScsXG5cdFx0XHRsaXN0OiBbJ3JlZCcsICdncmVlbicsICdibHVlJ10sXG5cdFx0XHRrZXlzOiB7XG5cdFx0XHRcdHNlbWk6ICc7Jyxcblx0XHRcdFx0ZG90OiAnLicsXG5cdFx0XHRcdGNvbW1hOiAnLCdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7LnZhcjozfScsIHZhcmlhYmxlcywgJ1gudmFsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7Lmxpc3R9JywgdmFyaWFibGVzLCAnWC5yZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCdYey5saXN0Kn0nLCB2YXJpYWJsZXMsICdYLnJlZC5ncmVlbi5ibHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ1h7LmtleXN9JywgdmFyaWFibGVzLCAnWC5zZW1pLDssZG90LC4sY29tbWEsLCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCdYey5rZXlzKn0nLCB2YXJpYWJsZXMsICdYLnNlbWk9Oy5kb3Q9Li5jb21tYT0sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDQgLSBQYXRoIGV4cGFuc2lvbiB3aXRoIHZhbHVlIG1vZGlmaWVycycsICgpID0+IHtcblx0XHQvLyBUZXN0IGNhc2VzIHJlbGF0ZWQgdG8gTGV2ZWwgNCBmZWF0dXJlc1xuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdHZhcjogJ3ZhbHVlJyxcblx0XHRcdGxpc3Q6IFsncmVkJywgJ2dyZWVuJywgJ2JsdWUnXSxcblx0XHRcdHBhdGg6ICcvZm9vL2JhcicsXG5cdFx0XHRrZXlzOiB7XG5cdFx0XHRcdHNlbWk6ICc7Jyxcblx0XHRcdFx0ZG90OiAnLicsXG5cdFx0XHRcdGNvbW1hOiAnLCdcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGVzdFJlc29sdXRpb24oJ3svdmFyOjEsdmFyfScsIHZhcmlhYmxlcywgJy92L3ZhbHVlJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3svbGlzdH0nLCB2YXJpYWJsZXMsICcvcmVkLGdyZWVuLGJsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigney9saXN0Kn0nLCB2YXJpYWJsZXMsICcvcmVkL2dyZWVuL2JsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigney9saXN0KixwYXRoOjR9JywgdmFyaWFibGVzLCAnL3JlZC9ncmVlbi9ibHVlLyUyRmZvbycpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7L2tleXN9JywgdmFyaWFibGVzLCAnL3NlbWksOyxkb3QsLixjb21tYSwsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3sva2V5cyp9JywgdmFyaWFibGVzLCAnL3NlbWk9JTNCL2RvdD0uL2NvbW1hPSUyQycpO1xuXHR9KTtcblxuXHR0ZXN0KCdMZXZlbCA0IC0gUGF0aC1zdHlsZSBwYXJhbWV0ZXJzIHdpdGggdmFsdWUgbW9kaWZpZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgcmVsYXRlZCB0byBMZXZlbCA0IGZlYXR1cmVzXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0bGlzdDogWydyZWQnLCAnZ3JlZW4nLCAnYmx1ZSddLFxuXHRcdFx0a2V5czoge1xuXHRcdFx0XHRzZW1pOiAnOycsXG5cdFx0XHRcdGRvdDogJy4nLFxuXHRcdFx0XHRjb21tYTogJywnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7O2hlbGxvOjV9JywgeyBoZWxsbzogJ0hlbGxvIFdvcmxkIScgfSwgJztoZWxsbz1IZWxsbycpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7O2xpc3R9JywgdmFyaWFibGVzLCAnO2xpc3Q9cmVkLGdyZWVuLGJsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneztsaXN0Kn0nLCB2YXJpYWJsZXMsICc7bGlzdD1yZWQ7bGlzdD1ncmVlbjtsaXN0PWJsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbigneztrZXlzfScsIHZhcmlhYmxlcywgJztrZXlzPXNlbWksOyxkb3QsLixjb21tYSwsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3s7a2V5cyp9JywgdmFyaWFibGVzLCAnO3NlbWk9Oztkb3Q9Ljtjb21tYT0sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xldmVsIDQgLSBGb3JtLXN0eWxlIHF1ZXJ5IHdpdGggdmFsdWUgbW9kaWZpZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgcmVsYXRlZCB0byBMZXZlbCA0IGZlYXR1cmVzXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0bGlzdDogWydyZWQnLCAnZ3JlZW4nLCAnYmx1ZSddLFxuXHRcdFx0a2V5czoge1xuXHRcdFx0XHRzZW1pOiAnOycsXG5cdFx0XHRcdGRvdDogJy4nLFxuXHRcdFx0XHRjb21tYTogJywnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7P3ZhcjozfScsIHZhcmlhYmxlcywgJz92YXI9dmFsJyk7XG5cdFx0dGVzdFJlc29sdXRpb24oJ3s/bGlzdH0nLCB2YXJpYWJsZXMsICc/bGlzdD1yZWQsZ3JlZW4sYmx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7P2xpc3QqfScsIHZhcmlhYmxlcywgJz9saXN0PXJlZCZsaXN0PWdyZWVuJmxpc3Q9Ymx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7P2tleXN9JywgdmFyaWFibGVzLCAnP2tleXM9c2VtaSw7LGRvdCwuLGNvbW1hLCwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignez9rZXlzKn0nLCB2YXJpYWJsZXMsICc/c2VtaT07JmRvdD0uJmNvbW1hPSwnKTtcblx0fSk7XG5cblx0dGVzdCgnTGV2ZWwgNCAtIEZvcm0tc3R5bGUgcXVlcnkgY29udGludWF0aW9uIHdpdGggdmFsdWUgbW9kaWZpZXJzJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgY2FzZXMgcmVsYXRlZCB0byBMZXZlbCA0IGZlYXR1cmVzXG5cdFx0Y29uc3QgdmFyaWFibGVzID0ge1xuXHRcdFx0dmFyOiAndmFsdWUnLFxuXHRcdFx0bGlzdDogWydyZWQnLCAnZ3JlZW4nLCAnYmx1ZSddLFxuXHRcdFx0a2V5czoge1xuXHRcdFx0XHRzZW1pOiAnOycsXG5cdFx0XHRcdGRvdDogJy4nLFxuXHRcdFx0XHRjb21tYTogJywnXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRlc3RSZXNvbHV0aW9uKCc/Zml4ZWQ9eWVzeyZ2YXI6M30nLCB2YXJpYWJsZXMsICc/Zml4ZWQ9eWVzJnZhcj12YWwnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignP2ZpeGVkPXllc3smbGlzdH0nLCB2YXJpYWJsZXMsICc/Zml4ZWQ9eWVzJmxpc3Q9cmVkLGdyZWVuLGJsdWUnKTtcblx0XHR0ZXN0UmVzb2x1dGlvbignP2ZpeGVkPXllc3smbGlzdCp9JywgdmFyaWFibGVzLCAnP2ZpeGVkPXllcyZsaXN0PXJlZCZsaXN0PWdyZWVuJmxpc3Q9Ymx1ZScpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCc/Zml4ZWQ9eWVzeyZrZXlzfScsIHZhcmlhYmxlcywgJz9maXhlZD15ZXMma2V5cz1zZW1pLDssZG90LC4sY29tbWEsLCcpO1xuXHRcdHRlc3RSZXNvbHV0aW9uKCc/Zml4ZWQ9eWVzeyZrZXlzKn0nLCB2YXJpYWJsZXMsICc/Zml4ZWQ9eWVzJnNlbWk9OyZkb3Q9LiZjb21tYT0sJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsaW5nIHVuZGVmaW5lZCBvciBudWxsIHZhbHVlcycsICgpID0+IHtcblx0XHQvLyBUZXN0IGhhbmRsaW5nIG9mIHVuZGVmaW5lZC9udWxsIHZhbHVlcyBmb3IgZGlmZmVyZW50IG9wZXJhdG9yc1xuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IHtcblx0XHRcdGRlZmluZWQ6ICd2YWx1ZScsXG5cdFx0XHR1bmRlZjogdW5kZWZpbmVkLFxuXHRcdFx0bnVsbDogbnVsbCxcblx0XHRcdGVtcHR5OiAnJ1xuXHRcdH07XG5cblx0XHQvLyBTaW1wbGUgc3RyaW5nIGV4cGFuc2lvblxuXHRcdHRlc3RSZXNvbHV0aW9uKCd7ZGVmaW5lZCx1bmRlZixudWxsLGVtcHR5fScsIHZhcmlhYmxlcywgJ3ZhbHVlLCcpO1xuXG5cdFx0Ly8gUmVzZXJ2ZWQgZXhwYW5zaW9uXG5cdFx0dGVzdFJlc29sdXRpb24oJ3srZGVmaW5lZCx1bmRlZixudWxsLGVtcHR5fScsIHZhcmlhYmxlcywgJ3ZhbHVlLCcpO1xuXG5cdFx0Ly8gRnJhZ21lbnQgZXhwYW5zaW9uXG5cdFx0dGVzdFJlc29sdXRpb24oJ3sjZGVmaW5lZCx1bmRlZixudWxsLGVtcHR5fScsIHZhcmlhYmxlcywgJyN2YWx1ZSwnKTtcblxuXHRcdC8vIExhYmVsIGV4cGFuc2lvblxuXHRcdHRlc3RSZXNvbHV0aW9uKCdYey5kZWZpbmVkLHVuZGVmLG51bGwsZW1wdHl9JywgdmFyaWFibGVzLCAnWC52YWx1ZScpO1xuXG5cdFx0Ly8gUGF0aCBzZWdtZW50c1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7L2RlZmluZWQsdW5kZWYsbnVsbH0nLCB2YXJpYWJsZXMsICcvdmFsdWUnKTtcblxuXHRcdC8vIFBhdGgtc3R5bGUgcGFyYW1ldGVyc1xuXHRcdHRlc3RSZXNvbHV0aW9uKCd7O2RlZmluZWQsZW1wdHl9JywgdmFyaWFibGVzLCAnO2RlZmluZWQ9dmFsdWU7ZW1wdHknKTtcblxuXHRcdC8vIEZvcm0tc3R5bGUgcXVlcnlcblx0XHR0ZXN0UmVzb2x1dGlvbignez9kZWZpbmVkLHVuZGVmLG51bGwsZW1wdHl9JywgdmFyaWFibGVzLCAnP2RlZmluZWQ9dmFsdWUmdW5kZWY9Jm51bGw9JmVtcHR5PScpO1xuXG5cdFx0Ly8gRm9ybS1zdHlsZSBxdWVyeSBjb250aW51YXRpb25cblx0XHR0ZXN0UmVzb2x1dGlvbigneyZkZWZpbmVkLHVuZGVmLG51bGwsZW1wdHl9JywgdmFyaWFibGVzLCAnJmRlZmluZWQ9dmFsdWUmdW5kZWY9Jm51bGw9JmVtcHR5PScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV4IHRlbXBsYXRlcycsICgpID0+IHtcblx0XHQvLyBUZXN0IG1vcmUgY29tcGxleCB0ZW1wbGF0ZSBjb21iaW5hdGlvbnNcblx0XHRjb25zdCB2YXJpYWJsZXMgPSB7XG5cdFx0XHRkb21haW46ICdleGFtcGxlLmNvbScsXG5cdFx0XHR1c2VyOiAnZnJlZCcsXG5cdFx0XHRwYXRoOiBbJ3BhdGgnLCAndG8nLCAncmVzb3VyY2UnXSxcblx0XHRcdHF1ZXJ5OiAnc2VhcmNoJyxcblx0XHRcdHBhZ2U6IDUsXG5cdFx0XHRsYW5nOiAnZW4nLFxuXHRcdFx0c2Vzc2lvbklkOiAnMTIzYWJjJyxcblx0XHRcdGZpbHRlcnM6IFsnY29sb3I6Ymx1ZScsICdzaGFwZTpzcXVhcmUnXSxcblx0XHRcdGNvb3JkaW5hdGVzOiB7IGxhdDogJzM3LjcnLCBsb246ICctMTIyLjQnIH1cblx0XHR9O1xuXG5cdFx0Ly8gUkVTVGZ1bCBVUkwgcGF0dGVyblxuXHRcdHRlc3RSZXNvbHV0aW9uKCdodHRwczovL3tkb21haW59L2FwaS92MS91c2Vycy97dXNlcn17L3BhdGgqfXs/cXVlcnkscGFnZSxsYW5nfScsXG5cdFx0XHR2YXJpYWJsZXMsXG5cdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEvdXNlcnMvZnJlZC9wYXRoL3RvL3Jlc291cmNlP3F1ZXJ5PXNlYXJjaCZwYWdlPTUmbGFuZz1lbicpO1xuXG5cdFx0Ly8gQ29tcGxleCBxdWVyeSBwYXJhbWV0ZXJzXG5cdFx0dGVzdFJlc29sdXRpb24oJ2h0dHBzOi8ve2RvbWFpbn0vc2VhcmNoez9xdWVyeSxmaWx0ZXJzLGNvb3JkaW5hdGVzKn0nLFxuXHRcdFx0dmFyaWFibGVzLFxuXHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20vc2VhcmNoP3F1ZXJ5PXNlYXJjaCZmaWx0ZXJzPWNvbG9yOmJsdWUsc2hhcGU6c3F1YXJlJmxhdD0zNy43Jmxvbj0tMTIyLjQnKTtcblxuXHRcdC8vIE11bHRpcGxlIGV4cHJlc3Npb24gdHlwZXNcblx0XHR0ZXN0UmVzb2x1dGlvbignaHR0cHM6Ly97ZG9tYWlufS91c2Vycy97dXNlcn0vcHJvZmlsZXsubGFuZ317P3Nlc3Npb25JZH17I3BhdGh9Jyxcblx0XHRcdHZhcmlhYmxlcyxcblx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tL3VzZXJzL2ZyZWQvcHJvZmlsZS5lbj9zZXNzaW9uSWQ9MTIzYWJjI3BhdGgsdG8scmVzb3VyY2UnKTtcblx0fSk7XG5cblx0dGVzdCgnbGl0ZXJhbHMgYW5kIGVzY2FwaW5nJywgKCkgPT4ge1xuXHRcdC8vIFRlc3QgbGl0ZXJhbCBzZWdtZW50cyBhbmQgZXNjYXBpbmdcblx0XHR0ZXN0UGFyc2luZygnaHR0cDovL2V4YW1wbGUuY29tL2xpdGVyYWwnLCBbXSk7XG5cdFx0dGVzdFBhcnNpbmcoJ2h0dHA6Ly9leGFtcGxlLmNvbS97dmFyfWxpdGVyYWx7dmFyMn0nLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGV4cHJlc3Npb246ICd7dmFyfScsXG5cdFx0XHRcdG9wZXJhdG9yOiAnJyxcblx0XHRcdFx0dmFyaWFibGVzOiBbeyBleHBsb2RhYmxlOiBmYWxzZSwgbmFtZTogJ3ZhcicsIG9wdGlvbmFsOiBmYWxzZSwgcHJlZml4TGVuZ3RoOiB1bmRlZmluZWQsIHJlcGVhdGFibGU6IGZhbHNlIH1dXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRleHByZXNzaW9uOiAne3ZhcjJ9Jyxcblx0XHRcdFx0b3BlcmF0b3I6ICcnLFxuXHRcdFx0XHR2YXJpYWJsZXM6IFt7IGV4cGxvZGFibGU6IGZhbHNlLCBuYW1lOiAndmFyMicsIG9wdGlvbmFsOiBmYWxzZSwgcHJlZml4TGVuZ3RoOiB1bmRlZmluZWQsIHJlcGVhdGFibGU6IGZhbHNlIH1dXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHQvLyBUZXN0IHRoYXQgZXNjYXBlZCBicmFjZXMgYXJlIHRyZWF0ZWQgYXMgbGl0ZXJhbHNcblx0XHQvLyBOb3RlOiBUaGUgY3VycmVudCBpbXBsZW1lbnRhdGlvbiBtaWdodCBub3QgaGFuZGxlIHRoaXMgY2FzZVxuXHRcdHRlc3RSZXNvbHV0aW9uKCdodHRwOi8vZXhhbXBsZS5jb20ve3t2YXJ9fScsIHsgdmFyOiAndmFsdWUnIH0sICdodHRwOi8vZXhhbXBsZS5jb20ve3Zhcn0nKTtcblx0fSk7XG5cblx0dGVzdCgnZWRnZSBjYXNlcycsICgpID0+IHtcblx0XHQvLyBFbXB0eSB0ZW1wbGF0ZVxuXHRcdHRlc3RSZXNvbHV0aW9uKCcnLCB7fSwgJycpO1xuXG5cdFx0Ly8gVGVtcGxhdGUgd2l0aCBvbmx5IGxpdGVyYWxzXG5cdFx0dGVzdFJlc29sdXRpb24oJ2h0dHA6Ly9leGFtcGxlLmNvbS9wYXRoJywge30sICdodHRwOi8vZXhhbXBsZS5jb20vcGF0aCcpO1xuXG5cdFx0Ly8gTm8gdmFyaWFibGVzIHByb3ZpZGVkIGZvciByZXNvbHV0aW9uXG5cdFx0dGVzdFJlc29sdXRpb24oJ3t2YXJ9Jywge30sICcnKTtcblxuXHRcdC8vIE11bHRpcGxlIHNlcXVlbnRpYWwgZXhwcmVzc2lvbnNcblx0XHR0ZXN0UmVzb2x1dGlvbigne2F9e2J9e2N9JywgeyBhOiAnMScsIGI6ICcyJywgYzogJzMnIH0sICcxMjMnKTtcblxuXHRcdC8vIEV4cHJlc3Npb25zIHdpdGggc3BlY2lhbCBjaGFyYWN0ZXJzIGluIHZhcmlhYmxlIG5hbWVzXG5cdFx0dGVzdFJlc29sdXRpb24oJ3tfaGlkZGVuLnZhci1uYW1lJH0nLCB7ICdfaGlkZGVuLnZhci1uYW1lJCc6ICd2YWx1ZScgfSwgJ3ZhbHVlJyk7XG5cdH0pO1xufSk7XG4iXSwK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
