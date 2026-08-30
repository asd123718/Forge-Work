import assert from "assert";
import { isWindows } from "../../common/platform.js";
import { URI, isUriComponents } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("URI", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("file#toString", () => {
    assert.strictEqual(URI.file("c:/win/path").toString(), "file:///c%3A/win/path");
    assert.strictEqual(URI.file("C:/win/path").toString(), "file:///c%3A/win/path");
    assert.strictEqual(URI.file("c:/win/path/").toString(), "file:///c%3A/win/path/");
    assert.strictEqual(URI.file("/c:/win/path").toString(), "file:///c%3A/win/path");
  });
  test("URI.file (win-special)", () => {
    if (isWindows) {
      assert.strictEqual(URI.file("c:\\win\\path").toString(), "file:///c%3A/win/path");
      assert.strictEqual(URI.file("c:\\win/path").toString(), "file:///c%3A/win/path");
    } else {
      assert.strictEqual(URI.file("c:\\win\\path").toString(), "file:///c%3A%5Cwin%5Cpath");
      assert.strictEqual(URI.file("c:\\win/path").toString(), "file:///c%3A%5Cwin/path");
    }
  });
  test("file#fsPath (win-special)", () => {
    if (isWindows) {
      assert.strictEqual(URI.file("c:\\win\\path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("c:\\win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("c:/win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("c:/win/path/").fsPath, "c:\\win\\path\\");
      assert.strictEqual(URI.file("C:/win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("/c:/win/path").fsPath, "c:\\win\\path");
      assert.strictEqual(URI.file("./c/win/path").fsPath, "\\.\\c\\win\\path");
    } else {
      assert.strictEqual(URI.file("c:/win/path").fsPath, "c:/win/path");
      assert.strictEqual(URI.file("c:/win/path/").fsPath, "c:/win/path/");
      assert.strictEqual(URI.file("C:/win/path").fsPath, "c:/win/path");
      assert.strictEqual(URI.file("/c:/win/path").fsPath, "c:/win/path");
      assert.strictEqual(URI.file("./c/win/path").fsPath, "/./c/win/path");
    }
  });
  test("URI#fsPath - no `fsPath` when no `path`", () => {
    const value = URI.parse("file://%2Fhome%2Fticino%2Fdesktop%2Fcpluscplus%2Ftest.cpp");
    assert.strictEqual(value.authority, "/home/ticino/desktop/cpluscplus/test.cpp");
    assert.strictEqual(value.path, "/");
    if (isWindows) {
      assert.strictEqual(value.fsPath, "\\");
    } else {
      assert.strictEqual(value.fsPath, "/");
    }
  });
  test("http#toString", () => {
    assert.strictEqual(URI.from({ scheme: "http", authority: "www.example.com", path: "/my/path" }).toString(), "http://www.example.com/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "www.example.com", path: "/my/path" }).toString(), "http://www.example.com/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "www.EXAMPLE.com", path: "/my/path" }).toString(), "http://www.example.com/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "", path: "my/path" }).toString(), "http:/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "", path: "/my/path" }).toString(), "http:/my/path");
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "test=true" }).toString(), "http://example.com/?test%3Dtrue");
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "", fragment: "test=true" }).toString(), "http://example.com/#test%3Dtrue");
  });
  test("http#toString, encode=FALSE", () => {
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "test=true" }).toString(true), "http://example.com/?test=true");
    assert.strictEqual(URI.from({ scheme: "http", authority: "example.com", path: "/", query: "", fragment: "test=true" }).toString(true), "http://example.com/#test=true");
    assert.strictEqual(URI.from({ scheme: "http", path: "/api/files/test.me", query: "t=1234" }).toString(true), "http:/api/files/test.me?t=1234");
    const value = URI.parse("file://shares/pr\xF6jects/c%23/#l12");
    assert.strictEqual(value.authority, "shares");
    assert.strictEqual(value.path, "/pr\xF6jects/c#/");
    assert.strictEqual(value.fragment, "l12");
    assert.strictEqual(value.toString(), "file://shares/pr%C3%B6jects/c%23/#l12");
    assert.strictEqual(value.toString(true), "file://shares/pr\xF6jects/c%23/#l12");
    const uri2 = URI.parse(value.toString(true));
    const uri3 = URI.parse(value.toString());
    assert.strictEqual(uri2.authority, uri3.authority);
    assert.strictEqual(uri2.path, uri3.path);
    assert.strictEqual(uri2.query, uri3.query);
    assert.strictEqual(uri2.fragment, uri3.fragment);
  });
  test("with, identity", () => {
    const uri = URI.parse("foo:bar/path");
    let uri2 = uri.with(null);
    assert.ok(uri === uri2);
    uri2 = uri.with(void 0);
    assert.ok(uri === uri2);
    uri2 = uri.with({});
    assert.ok(uri === uri2);
    uri2 = uri.with({ scheme: "foo", path: "bar/path" });
    assert.ok(uri === uri2);
  });
  test("with, changes", () => {
    assert.strictEqual(URI.parse("before:some/file/path").with({ scheme: "after" }).toString(), "after:some/file/path");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "http", path: "/api/files/test.me", query: "t=1234" }).toString(), "http:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "http", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "http:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "https", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "https:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "HTTP", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "HTTP:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "HTTPS", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "HTTPS:/api/files/test.me?t%3D1234");
    assert.strictEqual(URI.from({ scheme: "s" }).with({ scheme: "boo", authority: "", path: "/api/files/test.me", query: "t=1234", fragment: "" }).toString(), "boo:/api/files/test.me?t%3D1234");
  });
  test("with, remove components #8465", () => {
    assert.strictEqual(URI.parse("scheme://authority/path").with({ authority: "" }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ authority: "" }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ authority: null }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ path: "" }).toString(), "scheme://authority");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "authority" }).with({ path: null }).toString(), "scheme://authority");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: "" }).toString(), "scheme:/path");
    assert.strictEqual(URI.parse("scheme:/path").with({ authority: null }).toString(), "scheme:/path");
  });
  test("with, validation", () => {
    const uri = URI.parse("foo:bar/path");
    assert.throws(() => uri.with({ scheme: "fai:l" }));
    assert.throws(() => uri.with({ scheme: "f\xE4il" }));
    assert.throws(() => uri.with({ authority: "fail" }));
    assert.throws(() => uri.with({ path: "//fail" }));
  });
  test("parse", () => {
    let value = URI.parse("http:/api/files/test.me?t=1234");
    assert.strictEqual(value.scheme, "http");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/api/files/test.me");
    assert.strictEqual(value.query, "t=1234");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("http://api/files/test.me?t=1234");
    assert.strictEqual(value.scheme, "http");
    assert.strictEqual(value.authority, "api");
    assert.strictEqual(value.path, "/files/test.me");
    assert.strictEqual(value.query, "t=1234");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("file:///c:/test/me");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/c:/test/me");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fsPath, isWindows ? "c:\\test\\me" : "c:/test/me");
    value = URI.parse("file://shares/files/c%23/p.cs");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "shares");
    assert.strictEqual(value.path, "/files/c#/p.cs");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fsPath, isWindows ? "\\\\shares\\files\\c#\\p.cs" : "//shares/files/c#/p.cs");
    value = URI.parse("file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins/c%23/plugin.json");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/c:/Source/Z\xFCrich or Zurich (\u02C8zj\u028A\u0259r\u026Ak,/Code/resources/app/plugins/c#/plugin.json");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    value = URI.parse("file:///c:/test %25/path");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/c:/test %/path");
    assert.strictEqual(value.fragment, "");
    assert.strictEqual(value.query, "");
    value = URI.parse("inmemory:");
    assert.strictEqual(value.scheme, "inmemory");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("foo:api/files/test");
    assert.strictEqual(value.scheme, "foo");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "api/files/test");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("file:?q");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/");
    assert.strictEqual(value.query, "q");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("file:#d");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "d");
    value = URI.parse("f3ile:#d");
    assert.strictEqual(value.scheme, "f3ile");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "d");
    value = URI.parse("foo+bar:path");
    assert.strictEqual(value.scheme, "foo+bar");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "path");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("foo-bar:path");
    assert.strictEqual(value.scheme, "foo-bar");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "path");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
    value = URI.parse("foo.bar:path");
    assert.strictEqual(value.scheme, "foo.bar");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "path");
    assert.strictEqual(value.query, "");
    assert.strictEqual(value.fragment, "");
  });
  test("parse, disallow //path when no authority", () => {
    assert.throws(() => URI.parse("file:////shares/files/p.cs"));
  });
  test("URI#file, win-speciale", () => {
    if (isWindows) {
      let value = URI.file("c:\\test\\drive");
      assert.strictEqual(value.path, "/c:/test/drive");
      assert.strictEqual(value.toString(), "file:///c%3A/test/drive");
      value = URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.authority, "sh\xE4res");
      assert.strictEqual(value.path, "/path/c#/plugin.json");
      assert.strictEqual(value.fragment, "");
      assert.strictEqual(value.query, "");
      assert.strictEqual(value.toString(), "file://sh%C3%A4res/path/c%23/plugin.json");
      value = URI.file("\\\\localhost\\c$\\GitDevelopment\\express");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.path, "/c$/GitDevelopment/express");
      assert.strictEqual(value.fsPath, "\\\\localhost\\c$\\GitDevelopment\\express");
      assert.strictEqual(value.query, "");
      assert.strictEqual(value.fragment, "");
      assert.strictEqual(value.toString(), "file://localhost/c%24/GitDevelopment/express");
      value = URI.file("c:\\test with %\\path");
      assert.strictEqual(value.path, "/c:/test with %/path");
      assert.strictEqual(value.toString(), "file:///c%3A/test%20with%20%25/path");
      value = URI.file("c:\\test with %25\\path");
      assert.strictEqual(value.path, "/c:/test with %25/path");
      assert.strictEqual(value.toString(), "file:///c%3A/test%20with%20%2525/path");
      value = URI.file("c:\\test with %25\\c#code");
      assert.strictEqual(value.path, "/c:/test with %25/c#code");
      assert.strictEqual(value.toString(), "file:///c%3A/test%20with%20%2525/c%23code");
      value = URI.file("\\\\shares");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.authority, "shares");
      assert.strictEqual(value.path, "/");
      value = URI.file("\\\\shares\\");
      assert.strictEqual(value.scheme, "file");
      assert.strictEqual(value.authority, "shares");
      assert.strictEqual(value.path, "/");
    }
  });
  test("VSCode URI module's driveLetterPath regex is incorrect, #32961", function() {
    const uri = URI.parse("file:///_:/path");
    assert.strictEqual(uri.fsPath, isWindows ? "\\_:\\path" : "/_:/path");
  });
  test("URI#file, no path-is-uri check", () => {
    const value = URI.file("file://path/to/file");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/file://path/to/file");
  });
  test("URI#file, always slash", () => {
    let value = URI.file("a.file");
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/a.file");
    assert.strictEqual(value.toString(), "file:///a.file");
    value = URI.parse(value.toString());
    assert.strictEqual(value.scheme, "file");
    assert.strictEqual(value.authority, "");
    assert.strictEqual(value.path, "/a.file");
    assert.strictEqual(value.toString(), "file:///a.file");
  });
  test("URI.toString, only scheme and query", () => {
    const value = URI.parse("stuff:?q\xFCery");
    assert.strictEqual(value.toString(), "stuff:?q%C3%BCery");
  });
  test("URI#toString, upper-case percent espaces", () => {
    const value = URI.parse("file://sh%c3%a4res/path");
    assert.strictEqual(value.toString(), "file://sh%C3%A4res/path");
  });
  test("URI#toString, lower-case windows drive letter", () => {
    assert.strictEqual(URI.parse("untitled:c:/Users/jrieken/Code/abc.txt").toString(), "untitled:c%3A/Users/jrieken/Code/abc.txt");
    assert.strictEqual(URI.parse("untitled:C:/Users/jrieken/Code/abc.txt").toString(), "untitled:c%3A/Users/jrieken/Code/abc.txt");
  });
  test("URI#toString, escape all the bits", () => {
    const value = URI.file("/Users/jrieken/Code/_samples/18500/M\xF6del + Other Th\xEEng\xDF/model.js");
    assert.strictEqual(value.toString(), "file:///Users/jrieken/Code/_samples/18500/M%C3%B6del%20%2B%20Other%20Th%C3%AEng%C3%9F/model.js");
  });
  test("URI#toString, don't encode port", () => {
    let value = URI.parse("http://localhost:8080/far");
    assert.strictEqual(value.toString(), "http://localhost:8080/far");
    value = URI.from({ scheme: "http", authority: "l\xF6calhost:8080", path: "/far", query: void 0, fragment: void 0 });
    assert.strictEqual(value.toString(), "http://l%C3%B6calhost:8080/far");
  });
  test("URI#toString, user information in authority", () => {
    let value = URI.parse("http://foo:bar@localhost/far");
    assert.strictEqual(value.toString(), "http://foo:bar@localhost/far");
    value = URI.parse("http://foo@localhost/far");
    assert.strictEqual(value.toString(), "http://foo@localhost/far");
    value = URI.parse("http://foo:bAr@localhost:8080/far");
    assert.strictEqual(value.toString(), "http://foo:bAr@localhost:8080/far");
    value = URI.parse("http://foo@localhost:8080/far");
    assert.strictEqual(value.toString(), "http://foo@localhost:8080/far");
    value = URI.from({ scheme: "http", authority: "f\xF6\xF6:b\xF6r@l\xF6calhost:8080", path: "/far", query: void 0, fragment: void 0 });
    assert.strictEqual(value.toString(), "http://f%C3%B6%C3%B6:b%C3%B6r@l%C3%B6calhost:8080/far");
  });
  test("correctFileUriToFilePath2", () => {
    const test2 = (input, expected) => {
      const value = URI.parse(input);
      assert.strictEqual(value.fsPath, expected, "Result for " + input);
      const value2 = URI.file(value.fsPath);
      assert.strictEqual(value2.fsPath, expected, "Result for " + input);
      assert.strictEqual(value.toString(), value2.toString());
    };
    test2("file:///c:/alex.txt", isWindows ? "c:\\alex.txt" : "c:/alex.txt");
    test2("file:///c:/Source/Z%C3%BCrich%20or%20Zurich%20(%CB%88zj%CA%8A%C9%99r%C9%AAk,/Code/resources/app/plugins", isWindows ? "c:\\Source\\Z\xFCrich or Zurich (\u02C8zj\u028A\u0259r\u026Ak,\\Code\\resources\\app\\plugins" : "c:/Source/Z\xFCrich or Zurich (\u02C8zj\u028A\u0259r\u026Ak,/Code/resources/app/plugins");
    test2("file://monacotools/folder/isi.txt", isWindows ? "\\\\monacotools\\folder\\isi.txt" : "//monacotools/folder/isi.txt");
    test2("file://monacotools1/certificates/SSL/", isWindows ? "\\\\monacotools1\\certificates\\SSL\\" : "//monacotools1/certificates/SSL/");
  });
  test("URI - http, query & toString", function() {
    let uri = URI.parse("https://go.microsoft.com/fwlink/?LinkId=518008");
    assert.strictEqual(uri.query, "LinkId=518008");
    assert.strictEqual(uri.toString(true), "https://go.microsoft.com/fwlink/?LinkId=518008");
    assert.strictEqual(uri.toString(), "https://go.microsoft.com/fwlink/?LinkId%3D518008");
    let uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri2.query, "LinkId=518008");
    assert.strictEqual(uri2.query, uri.query);
    uri = URI.parse("https://go.microsoft.com/fwlink/?LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri.query, "LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri.toString(true), "https://go.microsoft.com/fwlink/?LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri.toString(), "https://go.microsoft.com/fwlink/?LinkId%3D518008%26fo%C3%B6%26k%C3%A9%C2%A5%3D%C3%BC%C3%BC");
    uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri2.query, "LinkId=518008&fo\xF6&k\xE9\xA5=\xFC\xFC");
    assert.strictEqual(uri2.query, uri.query);
    uri = URI.parse("https://twitter.com/search?src=typd&q=%23tag");
    assert.strictEqual(uri.toString(true), "https://twitter.com/search?src=typd&q=%23tag");
  });
  test("class URI cannot represent relative file paths #34449", function() {
    let path = "/foo/bar";
    assert.strictEqual(URI.file(path).path, path);
    path = "foo/bar";
    assert.strictEqual(URI.file(path).path, "/foo/bar");
    path = "./foo/bar";
    assert.strictEqual(URI.file(path).path, "/./foo/bar");
    const fileUri1 = URI.parse(`file:foo/bar`);
    assert.strictEqual(fileUri1.path, "/foo/bar");
    assert.strictEqual(fileUri1.authority, "");
    const uri = fileUri1.toString();
    assert.strictEqual(uri, "file:///foo/bar");
    const fileUri2 = URI.parse(uri);
    assert.strictEqual(fileUri2.path, "/foo/bar");
    assert.strictEqual(fileUri2.authority, "");
  });
  test("Ctrl click to follow hash query param url gets urlencoded #49628", function() {
    let input = "http://localhost:3000/#/foo?bar=baz";
    let uri = URI.parse(input);
    assert.strictEqual(uri.toString(true), input);
    input = "http://localhost:3000/foo?bar=baz";
    uri = URI.parse(input);
    assert.strictEqual(uri.toString(true), input);
  });
  test("Unable to open '%A0.txt': URI malformed #76506", function() {
    let uri = URI.file("/foo/%A0.txt");
    let uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri.scheme, uri2.scheme);
    assert.strictEqual(uri.path, uri2.path);
    uri = URI.file("/foo/%2e.txt");
    uri2 = URI.parse(uri.toString());
    assert.strictEqual(uri.scheme, uri2.scheme);
    assert.strictEqual(uri.path, uri2.path);
  });
  test("Bug in URI.isUri() that fails `thing` type comparison #114971", function() {
    const uri = URI.file("/foo/bazz.txt");
    assert.strictEqual(URI.isUri(uri), true);
    assert.strictEqual(URI.isUri(uri.toJSON()), false);
    assert.strictEqual(URI.isUri({
      scheme: "file",
      authority: "",
      path: "/foo/bazz.txt",
      get fsPath() {
        return "/foo/bazz.txt";
      },
      query: "",
      fragment: "",
      with() {
        return this;
      },
      toString() {
        return "";
      }
    }), true);
    assert.strictEqual(URI.isUri({
      scheme: "file",
      authority: "",
      path: "/foo/bazz.txt",
      fsPath: "/foo/bazz.txt",
      query: "",
      fragment: "",
      with() {
        return this;
      },
      toString() {
        return "";
      }
    }), true);
    assert.strictEqual(URI.isUri(1), false);
    assert.strictEqual(URI.isUri("1"), false);
    assert.strictEqual(URI.isUri("http://sample.com"), false);
    assert.strictEqual(URI.isUri(null), false);
    assert.strictEqual(URI.isUri(void 0), false);
  });
  test("isUriComponents", function() {
    assert.ok(isUriComponents(URI.file("a")));
    assert.ok(isUriComponents(URI.file("a").toJSON()));
    assert.ok(isUriComponents(URI.file("")));
    assert.ok(isUriComponents(URI.file("").toJSON()));
    assert.strictEqual(isUriComponents(1), false);
    assert.strictEqual(isUriComponents(true), false);
    assert.strictEqual(isUriComponents("true"), false);
    assert.strictEqual(isUriComponents({}), false);
    assert.strictEqual(isUriComponents({ scheme: "" }), true);
    assert.strictEqual(isUriComponents({ scheme: "fo" }), true);
    assert.strictEqual(isUriComponents({ scheme: "fo", path: "/p" }), true);
    assert.strictEqual(isUriComponents({ path: "/p" }), false);
  });
  test("from, from(strict), revive", function() {
    assert.throws(() => URI.from({ scheme: "" }, true));
    assert.strictEqual(URI.from({ scheme: "" }).scheme, "file");
    assert.strictEqual(URI.revive({ scheme: "" }).scheme, "");
  });
  test("Unable to open '%A0.txt': URI malformed #76506, part 2", function() {
    assert.strictEqual(URI.parse("file://some/%.txt").toString(), "file://some/%25.txt");
    assert.strictEqual(URI.parse("file://some/%A0.txt").toString(), "file://some/%25A0.txt");
  });
  test.skip("Links in markdown are broken if url contains encoded parameters #79474", function() {
    const strIn = "https://myhost.com/Redirect?url=http%3A%2F%2Fwww.bing.com%3Fsearch%3Dtom";
    const uri1 = URI.parse(strIn);
    const strOut = uri1.toString();
    const uri2 = URI.parse(strOut);
    assert.strictEqual(uri1.scheme, uri2.scheme);
    assert.strictEqual(uri1.authority, uri2.authority);
    assert.strictEqual(uri1.path, uri2.path);
    assert.strictEqual(uri1.query, uri2.query);
    assert.strictEqual(uri1.fragment, uri2.fragment);
    assert.strictEqual(strIn, strOut);
  });
  test.skip("Uri#parse can break path-component #45515", function() {
    const strIn = "https://firebasestorage.googleapis.com/v0/b/brewlangerie.appspot.com/o/products%2FzVNZkudXJyq8bPGTXUxx%2FBetterave-Sesame.jpg?alt=media&token=0b2310c4-3ea6-4207-bbde-9c3710ba0437";
    const uri1 = URI.parse(strIn);
    const strOut = uri1.toString();
    const uri2 = URI.parse(strOut);
    assert.strictEqual(uri1.scheme, uri2.scheme);
    assert.strictEqual(uri1.authority, uri2.authority);
    assert.strictEqual(uri1.path, uri2.path);
    assert.strictEqual(uri1.query, uri2.query);
    assert.strictEqual(uri1.fragment, uri2.fragment);
    assert.strictEqual(strIn, strOut);
  });
  test("URI - (de)serialize", function() {
    const values = [
      URI.parse("http://localhost:8080/far"),
      URI.file("c:\\test with %25\\c#code"),
      URI.file("\\\\sh\xE4res\\path\\c#\\plugin.json"),
      URI.parse("http://api/files/test.me?t=1234"),
      URI.parse("http://api/files/test.me?t=1234#fff"),
      URI.parse("http://api/files/test.me#fff")
    ];
    for (const value of values) {
      const data = value.toJSON();
      const clone = URI.revive(data);
      assert.strictEqual(clone.scheme, value.scheme);
      assert.strictEqual(clone.authority, value.authority);
      assert.strictEqual(clone.path, value.path);
      assert.strictEqual(clone.query, value.query);
      assert.strictEqual(clone.fragment, value.fragment);
      assert.strictEqual(clone.fsPath, value.fsPath);
      assert.strictEqual(clone.toString(), value.toString());
    }
  });
  function assertJoined(base, fragment, expected, checkWithUrl = true) {
    const baseUri = URI.parse(base);
    const newUri = URI.joinPath(baseUri, fragment);
    const actual = newUri.toString(true);
    assert.strictEqual(actual, expected);
    if (checkWithUrl) {
      const actualUrl = new URL(fragment, base).href;
      assert.strictEqual(actualUrl, expected, "DIFFERENT from URL");
    }
  }
  test("URI#joinPath", function() {
    assertJoined("file:///foo/", "../../bazz", "file:///bazz");
    assertJoined("file:///foo", "../../bazz", "file:///bazz");
    assertJoined("file:///foo", "../../bazz", "file:///bazz");
    assertJoined("file:///foo/bar/", "./bazz", "file:///foo/bar/bazz");
    assertJoined("file:///foo/bar", "./bazz", "file:///foo/bar/bazz", false);
    assertJoined("file:///foo/bar", "bazz", "file:///foo/bar/bazz", false);
    assertJoined("file:", "bazz", "file:///bazz");
    assertJoined("http://domain", "bazz", "http://domain/bazz");
    assertJoined("https://domain", "bazz", "https://domain/bazz");
    assertJoined("http:", "bazz", "http:/bazz", false);
    assertJoined("https:", "bazz", "https:/bazz", false);
    assertJoined("foo:/", "bazz", "foo:/bazz");
    assertJoined("foo://bar/", "bazz", "foo://bar/bazz");
    assert.throws(() => assertJoined("foo:", "bazz", ""));
    assert.throws(() => new URL("bazz", "foo:"));
    assert.throws(() => assertJoined("foo://bar", "bazz", ""));
  });
  test("URI#joinPath (posix)", function() {
    if (isWindows) {
      this.skip();
    }
    assertJoined("file:///c:/foo/", "../../bazz", "file:///bazz", false);
    assertJoined("file://server/share/c:/", "../../bazz", "file://server/bazz", false);
    assertJoined("file://server/share/c:", "../../bazz", "file://server/bazz", false);
    assertJoined("file://ser/foo/", "../../bazz", "file://ser/bazz", false);
    assertJoined("file://ser/foo", "../../bazz", "file://ser/bazz", false);
  });
  test("URI#joinPath (windows)", function() {
    if (!isWindows) {
      this.skip();
    }
    assertJoined("file:///c:/foo/", "../../bazz", "file:///c:/bazz", false);
    assertJoined("file://server/share/c:/", "../../bazz", "file://server/share/bazz", false);
    assertJoined("file://server/share/c:", "../../bazz", "file://server/share/bazz", false);
    assertJoined("file://ser/foo/", "../../bazz", "file://ser/foo/bazz", false);
    assertJoined("file://ser/foo", "../../bazz", "file://ser/foo/bazz", false);
    assertJoined("file:///c:/foo/bar", "./other/foo.img", "file:///c:/foo/bar/other/foo.img", false);
  });
  test("vscode-uri: URI.toString() wrongly encode IPv6 literals #154048", function() {
    assert.strictEqual(URI.parse("http://[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html").toString(), "http://[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html");
    assert.strictEqual(URI.parse("http://user@[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html").toString(), "http://user@[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html");
    assert.strictEqual(URI.parse("http://us[er@[FEDC:BA98:7654:3210:FEDC:BA98:7654:3210]:80/index.html").toString(), "http://us%5Ber@[fedc:ba98:7654:3210:fedc:ba98:7654:3210]:80/index.html");
  });
  test("File paths containing apostrophes break URI parsing and cannot be opened #276075", function() {
    if (isWindows) {
      const filePath = "C:\\Users\\Abd-al-Haseeb's_Dell\\Studio\\w3mage\\wp-content\\database.ht.sqlite";
      const uri = URI.file(filePath);
      assert.strictEqual(uri.path, "/C:/Users/Abd-al-Haseeb's_Dell/Studio/w3mage/wp-content/database.ht.sqlite");
      assert.strictEqual(uri.fsPath, "c:\\Users\\Abd-al-Haseeb's_Dell\\Studio\\w3mage\\wp-content\\database.ht.sqlite");
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHVyaS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMsIGlzVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cblxuc3VpdGUoJ1VSSScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZmlsZSN0b1N0cmluZycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ2M6L3dpbi9wYXRoJykudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYyUzQS93aW4vcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnQzovd2luL3BhdGgnKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBL3dpbi9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKCdjOi93aW4vcGF0aC8nKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBL3dpbi9wYXRoLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnL2M6L3dpbi9wYXRoJykudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYyUzQS93aW4vcGF0aCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkuZmlsZSAod2luLXNwZWNpYWwpJywgKCkgPT4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzpcXFxcd2luXFxcXHBhdGgnKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBL3dpbi9wYXRoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ2M6XFxcXHdpbi9wYXRoJykudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYyUzQS93aW4vcGF0aCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ2M6XFxcXHdpblxcXFxwYXRoJykudG9TdHJpbmcoKSwgJ2ZpbGU6Ly8vYyUzQSU1Q3dpbiU1Q3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzpcXFxcd2luL3BhdGgnKS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBJTVDd2luL3BhdGgnKTtcblxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZmlsZSNmc1BhdGggKHdpbi1zcGVjaWFsKScsICgpID0+IHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ2M6XFxcXHdpblxcXFxwYXRoJykuZnNQYXRoLCAnYzpcXFxcd2luXFxcXHBhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzpcXFxcd2luL3BhdGgnKS5mc1BhdGgsICdjOlxcXFx3aW5cXFxccGF0aCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ2M6L3dpbi9wYXRoJykuZnNQYXRoLCAnYzpcXFxcd2luXFxcXHBhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzovd2luL3BhdGgvJykuZnNQYXRoLCAnYzpcXFxcd2luXFxcXHBhdGhcXFxcJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ0M6L3dpbi9wYXRoJykuZnNQYXRoLCAnYzpcXFxcd2luXFxcXHBhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnL2M6L3dpbi9wYXRoJykuZnNQYXRoLCAnYzpcXFxcd2luXFxcXHBhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnLi9jL3dpbi9wYXRoJykuZnNQYXRoLCAnXFxcXC5cXFxcY1xcXFx3aW5cXFxccGF0aCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ2M6L3dpbi9wYXRoJykuZnNQYXRoLCAnYzovd2luL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnYzovd2luL3BhdGgvJykuZnNQYXRoLCAnYzovd2luL3BhdGgvJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUoJ0M6L3dpbi9wYXRoJykuZnNQYXRoLCAnYzovd2luL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnL2M6L3dpbi9wYXRoJykuZnNQYXRoLCAnYzovd2luL3BhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZSgnLi9jL3dpbi9wYXRoJykuZnNQYXRoLCAnLy4vYy93aW4vcGF0aCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnVVJJI2ZzUGF0aCAtIG5vIGBmc1BhdGhgIHdoZW4gbm8gYHBhdGhgJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZhbHVlID0gVVJJLnBhcnNlKCdmaWxlOi8vJTJGaG9tZSUyRnRpY2lubyUyRmRlc2t0b3AlMkZjcGx1c2NwbHVzJTJGdGVzdC5jcHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnL2hvbWUvdGljaW5vL2Rlc2t0b3AvY3BsdXNjcGx1cy90ZXN0LmNwcCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnLycpO1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mc1BhdGgsICdcXFxcJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mc1BhdGgsICcvJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdodHRwI3RvU3RyaW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICd3d3cuZXhhbXBsZS5jb20nLCBwYXRoOiAnL215L3BhdGgnIH0pLnRvU3RyaW5nKCksICdodHRwOi8vd3d3LmV4YW1wbGUuY29tL215L3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnd3d3LmV4YW1wbGUuY29tJywgcGF0aDogJy9teS9wYXRoJyB9KS50b1N0cmluZygpLCAnaHR0cDovL3d3dy5leGFtcGxlLmNvbS9teS9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJ3d3dy5FWEFNUExFLmNvbScsIHBhdGg6ICcvbXkvcGF0aCcgfSkudG9TdHJpbmcoKSwgJ2h0dHA6Ly93d3cuZXhhbXBsZS5jb20vbXkvcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICcnLCBwYXRoOiAnbXkvcGF0aCcgfSkudG9TdHJpbmcoKSwgJ2h0dHA6L215L3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnJywgcGF0aDogJy9teS9wYXRoJyB9KS50b1N0cmluZygpLCAnaHR0cDovbXkvcGF0aCcpO1xuXHRcdC8vaHR0cDovL2V4YW1wbGUuY29tLyN0ZXN0PXRydWVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnZXhhbXBsZS5jb20nLCBwYXRoOiAnLycsIHF1ZXJ5OiAndGVzdD10cnVlJyB9KS50b1N0cmluZygpLCAnaHR0cDovL2V4YW1wbGUuY29tLz90ZXN0JTNEdHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICdleGFtcGxlLmNvbScsIHBhdGg6ICcvJywgcXVlcnk6ICcnLCBmcmFnbWVudDogJ3Rlc3Q9dHJ1ZScgfSkudG9TdHJpbmcoKSwgJ2h0dHA6Ly9leGFtcGxlLmNvbS8jdGVzdCUzRHRydWUnKTtcblx0fSk7XG5cblx0dGVzdCgnaHR0cCN0b1N0cmluZywgZW5jb2RlPUZBTFNFJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICdleGFtcGxlLmNvbScsIHBhdGg6ICcvJywgcXVlcnk6ICd0ZXN0PXRydWUnIH0pLnRvU3RyaW5nKHRydWUpLCAnaHR0cDovL2V4YW1wbGUuY29tLz90ZXN0PXRydWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnZXhhbXBsZS5jb20nLCBwYXRoOiAnLycsIHF1ZXJ5OiAnJywgZnJhZ21lbnQ6ICd0ZXN0PXRydWUnIH0pLnRvU3RyaW5nKHRydWUpLCAnaHR0cDovL2V4YW1wbGUuY29tLyN0ZXN0PXRydWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgcGF0aDogJy9hcGkvZmlsZXMvdGVzdC5tZScsIHF1ZXJ5OiAndD0xMjM0JyB9KS50b1N0cmluZyh0cnVlKSwgJ2h0dHA6L2FwaS9maWxlcy90ZXN0Lm1lP3Q9MTIzNCcpO1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9zaGFyZXMvcHJcdTAwRjZqZWN0cy9jJTIzLyNsMTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnc2hhcmVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvcHJcdTAwRjZqZWN0cy9jIy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICdsMTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2ZpbGU6Ly9zaGFyZXMvcHIlQzMlQjZqZWN0cy9jJTIzLyNsMTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcodHJ1ZSksICdmaWxlOi8vc2hhcmVzL3ByXHUwMEY2amVjdHMvYyUyMy8jbDEyJyk7XG5cblx0XHRjb25zdCB1cmkyID0gVVJJLnBhcnNlKHZhbHVlLnRvU3RyaW5nKHRydWUpKTtcblx0XHRjb25zdCB1cmkzID0gVVJJLnBhcnNlKHZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkyLmF1dGhvcml0eSwgdXJpMy5hdXRob3JpdHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkyLnBhdGgsIHVyaTMucGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIucXVlcnksIHVyaTMucXVlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkyLmZyYWdtZW50LCB1cmkzLmZyYWdtZW50KTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCwgaWRlbnRpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdmb286YmFyL3BhdGgnKTtcblxuXHRcdGxldCB1cmkyID0gdXJpLndpdGgobnVsbCEpO1xuXHRcdGFzc2VydC5vayh1cmkgPT09IHVyaTIpO1xuXHRcdHVyaTIgPSB1cmkud2l0aCh1bmRlZmluZWQhKTtcblx0XHRhc3NlcnQub2sodXJpID09PSB1cmkyKTtcblx0XHR1cmkyID0gdXJpLndpdGgoe30pO1xuXHRcdGFzc2VydC5vayh1cmkgPT09IHVyaTIpO1xuXHRcdHVyaTIgPSB1cmkud2l0aCh7IHNjaGVtZTogJ2ZvbycsIHBhdGg6ICdiYXIvcGF0aCcgfSk7XG5cdFx0YXNzZXJ0Lm9rKHVyaSA9PT0gdXJpMik7XG5cdH0pO1xuXG5cdHRlc3QoJ3dpdGgsIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnYmVmb3JlOnNvbWUvZmlsZS9wYXRoJykud2l0aCh7IHNjaGVtZTogJ2FmdGVyJyB9KS50b1N0cmluZygpLCAnYWZ0ZXI6c29tZS9maWxlL3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdzJyB9KS53aXRoKHsgc2NoZW1lOiAnaHR0cCcsIHBhdGg6ICcvYXBpL2ZpbGVzL3Rlc3QubWUnLCBxdWVyeTogJ3Q9MTIzNCcgfSkudG9TdHJpbmcoKSwgJ2h0dHA6L2FwaS9maWxlcy90ZXN0Lm1lP3QlM0QxMjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAncycgfSkud2l0aCh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICcnLCBwYXRoOiAnL2FwaS9maWxlcy90ZXN0Lm1lJywgcXVlcnk6ICd0PTEyMzQnLCBmcmFnbWVudDogJycgfSkudG9TdHJpbmcoKSwgJ2h0dHA6L2FwaS9maWxlcy90ZXN0Lm1lP3QlM0QxMjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAncycgfSkud2l0aCh7IHNjaGVtZTogJ2h0dHBzJywgYXV0aG9yaXR5OiAnJywgcGF0aDogJy9hcGkvZmlsZXMvdGVzdC5tZScsIHF1ZXJ5OiAndD0xMjM0JywgZnJhZ21lbnQ6ICcnIH0pLnRvU3RyaW5nKCksICdodHRwczovYXBpL2ZpbGVzL3Rlc3QubWU/dCUzRDEyMzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdzJyB9KS53aXRoKHsgc2NoZW1lOiAnSFRUUCcsIGF1dGhvcml0eTogJycsIHBhdGg6ICcvYXBpL2ZpbGVzL3Rlc3QubWUnLCBxdWVyeTogJ3Q9MTIzNCcsIGZyYWdtZW50OiAnJyB9KS50b1N0cmluZygpLCAnSFRUUDovYXBpL2ZpbGVzL3Rlc3QubWU/dCUzRDEyMzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZyb20oeyBzY2hlbWU6ICdzJyB9KS53aXRoKHsgc2NoZW1lOiAnSFRUUFMnLCBhdXRob3JpdHk6ICcnLCBwYXRoOiAnL2FwaS9maWxlcy90ZXN0Lm1lJywgcXVlcnk6ICd0PTEyMzQnLCBmcmFnbWVudDogJycgfSkudG9TdHJpbmcoKSwgJ0hUVFBTOi9hcGkvZmlsZXMvdGVzdC5tZT90JTNEMTIzNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZnJvbSh7IHNjaGVtZTogJ3MnIH0pLndpdGgoeyBzY2hlbWU6ICdib28nLCBhdXRob3JpdHk6ICcnLCBwYXRoOiAnL2FwaS9maWxlcy90ZXN0Lm1lJywgcXVlcnk6ICd0PTEyMzQnLCBmcmFnbWVudDogJycgfSkudG9TdHJpbmcoKSwgJ2JvbzovYXBpL2ZpbGVzL3Rlc3QubWU/dCUzRDEyMzQnKTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCwgcmVtb3ZlIGNvbXBvbmVudHMgIzg0NjUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnc2NoZW1lOi8vYXV0aG9yaXR5L3BhdGgnKS53aXRoKHsgYXV0aG9yaXR5OiAnJyB9KS50b1N0cmluZygpLCAnc2NoZW1lOi9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnc2NoZW1lOi9wYXRoJykud2l0aCh7IGF1dGhvcml0eTogJ2F1dGhvcml0eScgfSkud2l0aCh7IGF1dGhvcml0eTogJycgfSkudG9TdHJpbmcoKSwgJ3NjaGVtZTovcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ3NjaGVtZTovcGF0aCcpLndpdGgoeyBhdXRob3JpdHk6ICdhdXRob3JpdHknIH0pLndpdGgoeyBhdXRob3JpdHk6IG51bGwgfSkudG9TdHJpbmcoKSwgJ3NjaGVtZTovcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ3NjaGVtZTovcGF0aCcpLndpdGgoeyBhdXRob3JpdHk6ICdhdXRob3JpdHknIH0pLndpdGgoeyBwYXRoOiAnJyB9KS50b1N0cmluZygpLCAnc2NoZW1lOi8vYXV0aG9yaXR5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnc2NoZW1lOi9wYXRoJykud2l0aCh7IGF1dGhvcml0eTogJ2F1dGhvcml0eScgfSkud2l0aCh7IHBhdGg6IG51bGwgfSkudG9TdHJpbmcoKSwgJ3NjaGVtZTovL2F1dGhvcml0eScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ3NjaGVtZTovcGF0aCcpLndpdGgoeyBhdXRob3JpdHk6ICcnIH0pLnRvU3RyaW5nKCksICdzY2hlbWU6L3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdzY2hlbWU6L3BhdGgnKS53aXRoKHsgYXV0aG9yaXR5OiBudWxsIH0pLnRvU3RyaW5nKCksICdzY2hlbWU6L3BhdGgnKTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCwgdmFsaWRhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2ZvbzpiYXIvcGF0aCcpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdXJpLndpdGgoeyBzY2hlbWU6ICdmYWk6bCcgfSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdXJpLndpdGgoeyBzY2hlbWU6ICdmXHUwMEU0aWwnIH0pKTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHVyaS53aXRoKHsgYXV0aG9yaXR5OiAnZmFpbCcgfSkpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdXJpLndpdGgoeyBwYXRoOiAnLy9mYWlsJyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlJywgKCkgPT4ge1xuXHRcdGxldCB2YWx1ZSA9IFVSSS5wYXJzZSgnaHR0cDovYXBpL2ZpbGVzL3Rlc3QubWU/dD0xMjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2h0dHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYXBpL2ZpbGVzL3Rlc3QubWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICd0PTEyMzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdodHRwOi8vYXBpL2ZpbGVzL3Rlc3QubWU/dD0xMjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2h0dHAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnYXBpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvZmlsZXMvdGVzdC5tZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJ3Q9MTIzNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vYzovdGVzdC9tZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL2M6L3Rlc3QvbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnNQYXRoLCBpc1dpbmRvd3MgPyAnYzpcXFxcdGVzdFxcXFxtZScgOiAnYzovdGVzdC9tZScpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9zaGFyZXMvZmlsZXMvYyUyMy9wLmNzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnc2hhcmVzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvZmlsZXMvYyMvcC5jcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mc1BhdGgsIGlzV2luZG93cyA/ICdcXFxcXFxcXHNoYXJlc1xcXFxmaWxlc1xcXFxjI1xcXFxwLmNzJyA6ICcvL3NoYXJlcy9maWxlcy9jIy9wLmNzJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jOi9Tb3VyY2UvWiVDMyVCQ3JpY2glMjBvciUyMFp1cmljaCUyMCglQ0IlODh6aiVDQSU4QSVDOSU5OXIlQzklQUFrLC9Db2RlL3Jlc291cmNlcy9hcHAvcGx1Z2lucy9jJTIzL3BsdWdpbi5qc29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYzovU291cmNlL1pcdTAwRkNyaWNoIG9yIFp1cmljaCAoXHUwMkM4empcdTAyOEFcdTAyNTlyXHUwMjZBaywvQ29kZS9yZXNvdXJjZXMvYXBwL3BsdWdpbnMvYyMvcGx1Z2luLmpzb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICcnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdmaWxlOi8vL2M6L3Rlc3QgJTI1L3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9jOi90ZXN0ICUvcGF0aCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2lubWVtb3J5OicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdpbm1lbW9yeScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2ZvbzphcGkvZmlsZXMvdGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICdhcGkvZmlsZXMvdGVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJycpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2ZpbGU6P3EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICdxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmZyYWdtZW50LCAnJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnZmlsZTojZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJ2QnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdmM2lsZTojZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmM2lsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mcmFnbWVudCwgJ2QnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdmb28rYmFyOnBhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZm9vK2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJ3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdmb28tYmFyOnBhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZm9vLWJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJ3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdmb28uYmFyOnBhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZm9vLmJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJ3BhdGgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucXVlcnksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2UsIGRpc2FsbG93IC8vcGF0aCB3aGVuIG5vIGF1dGhvcml0eScsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IFVSSS5wYXJzZSgnZmlsZTovLy8vc2hhcmVzL2ZpbGVzL3AuY3MnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSNmaWxlLCB3aW4tc3BlY2lhbGUnLCAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0bGV0IHZhbHVlID0gVVJJLmZpbGUoJ2M6XFxcXHRlc3RcXFxcZHJpdmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL2M6L3Rlc3QvZHJpdmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnZmlsZTovLy9jJTNBL3Rlc3QvZHJpdmUnKTtcblxuXHRcdFx0dmFsdWUgPSBVUkkuZmlsZSgnXFxcXFxcXFxzaFx1MDBFNHJlc1xcXFxwYXRoXFxcXGMjXFxcXHBsdWdpbi5qc29uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJ3NoXHUwMEU0cmVzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9wYXRoL2MjL3BsdWdpbi5qc29uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5xdWVyeSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vc2glQzMlQTRyZXMvcGF0aC9jJTIzL3BsdWdpbi5qc29uJyk7XG5cblx0XHRcdHZhbHVlID0gVVJJLmZpbGUoJ1xcXFxcXFxcbG9jYWxob3N0XFxcXGMkXFxcXEdpdERldmVsb3BtZW50XFxcXGV4cHJlc3MnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9jJC9HaXREZXZlbG9wbWVudC9leHByZXNzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnNQYXRoLCAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcYyRcXFxcR2l0RGV2ZWxvcG1lbnRcXFxcZXhwcmVzcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnF1ZXJ5LCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuZnJhZ21lbnQsICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnZmlsZTovL2xvY2FsaG9zdC9jJTI0L0dpdERldmVsb3BtZW50L2V4cHJlc3MnKTtcblxuXHRcdFx0dmFsdWUgPSBVUkkuZmlsZSgnYzpcXFxcdGVzdCB3aXRoICVcXFxccGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYzovdGVzdCB3aXRoICUvcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0EvdGVzdCUyMHdpdGglMjAlMjUvcGF0aCcpO1xuXG5cdFx0XHR2YWx1ZSA9IFVSSS5maWxlKCdjOlxcXFx0ZXN0IHdpdGggJTI1XFxcXHBhdGgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnL2M6L3Rlc3Qgd2l0aCAlMjUvcGF0aCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0EvdGVzdCUyMHdpdGglMjAlMjUyNS9wYXRoJyk7XG5cblx0XHRcdHZhbHVlID0gVVJJLmZpbGUoJ2M6XFxcXHRlc3Qgd2l0aCAlMjVcXFxcYyNjb2RlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9jOi90ZXN0IHdpdGggJTI1L2MjY29kZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vL2MlM0EvdGVzdCUyMHdpdGglMjAlMjUyNS9jJTIzY29kZScpO1xuXG5cdFx0XHR2YWx1ZSA9IFVSSS5maWxlKCdcXFxcXFxcXHNoYXJlcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICdzaGFyZXMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5wYXRoLCAnLycpOyAvLyBzbGFzaCBpcyBhbHdheXMgdGhlcmVcblxuXHRcdFx0dmFsdWUgPSBVUkkuZmlsZSgnXFxcXFxcXFxzaGFyZXNcXFxcJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLmF1dGhvcml0eSwgJ3NoYXJlcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdWU0NvZGUgVVJJIG1vZHVsZVxcJ3MgZHJpdmVMZXR0ZXJQYXRoIHJlZ2V4IGlzIGluY29ycmVjdCwgIzMyOTYxJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9fOi9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5mc1BhdGgsIGlzV2luZG93cyA/ICdcXFxcXzpcXFxccGF0aCcgOiAnL186L3BhdGgnKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJI2ZpbGUsIG5vIHBhdGgtaXMtdXJpIGNoZWNrJywgKCkgPT4ge1xuXG5cdFx0Ly8gd2UgZG9uJ3QgY29tcGxhaW4gaGVyZVxuXHRcdGNvbnN0IHZhbHVlID0gVVJJLmZpbGUoJ2ZpbGU6Ly9wYXRoL3RvL2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuc2NoZW1lLCAnZmlsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5hdXRob3JpdHksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUucGF0aCwgJy9maWxlOi8vcGF0aC90by9maWxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSNmaWxlLCBhbHdheXMgc2xhc2gnLCAoKSA9PiB7XG5cblx0XHRsZXQgdmFsdWUgPSBVUkkuZmlsZSgnYS5maWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYS5maWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vL2EuZmlsZScpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UodmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnNjaGVtZSwgJ2ZpbGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUuYXV0aG9yaXR5LCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnBhdGgsICcvYS5maWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vL2EuZmlsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkudG9TdHJpbmcsIG9ubHkgc2NoZW1lIGFuZCBxdWVyeScsICgpID0+IHtcblx0XHRjb25zdCB2YWx1ZSA9IFVSSS5wYXJzZSgnc3R1ZmY6P3FcdTAwRkNlcnknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ3N0dWZmOj9xJUMzJUJDZXJ5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSN0b1N0cmluZywgdXBwZXItY2FzZSBwZXJjZW50IGVzcGFjZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFsdWUgPSBVUkkucGFyc2UoJ2ZpbGU6Ly9zaCVjMyVhNHJlcy9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdmaWxlOi8vc2glQzMlQTRyZXMvcGF0aCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkjdG9TdHJpbmcsIGxvd2VyLWNhc2Ugd2luZG93cyBkcml2ZSBsZXR0ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgndW50aXRsZWQ6YzovVXNlcnMvanJpZWtlbi9Db2RlL2FiYy50eHQnKS50b1N0cmluZygpLCAndW50aXRsZWQ6YyUzQS9Vc2Vycy9qcmlla2VuL0NvZGUvYWJjLnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ3VudGl0bGVkOkM6L1VzZXJzL2pyaWVrZW4vQ29kZS9hYmMudHh0JykudG9TdHJpbmcoKSwgJ3VudGl0bGVkOmMlM0EvVXNlcnMvanJpZWtlbi9Db2RlL2FiYy50eHQnKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJI3RvU3RyaW5nLCBlc2NhcGUgYWxsIHRoZSBiaXRzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgdmFsdWUgPSBVUkkuZmlsZSgnL1VzZXJzL2pyaWVrZW4vQ29kZS9fc2FtcGxlcy8xODUwMC9NXHUwMEY2ZGVsICsgT3RoZXIgVGhcdTAwRUVuZ1x1MDBERi9tb2RlbC5qcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnZmlsZTovLy9Vc2Vycy9qcmlla2VuL0NvZGUvX3NhbXBsZXMvMTg1MDAvTSVDMyVCNmRlbCUyMCUyQiUyME90aGVyJTIwVGglQzMlQUVuZyVDMyU5Ri9tb2RlbC5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkjdG9TdHJpbmcsIGRvblxcJ3QgZW5jb2RlIHBvcnQnLCAoKSA9PiB7XG5cdFx0bGV0IHZhbHVlID0gVVJJLnBhcnNlKCdodHRwOi8vbG9jYWxob3N0OjgwODAvZmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdodHRwOi8vbG9jYWxob3N0OjgwODAvZmFyJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJ2xcdTAwRjZjYWxob3N0OjgwODAnLCBwYXRoOiAnL2ZhcicsIHF1ZXJ5OiB1bmRlZmluZWQsIGZyYWdtZW50OiB1bmRlZmluZWQgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLnRvU3RyaW5nKCksICdodHRwOi8vbCVDMyVCNmNhbGhvc3Q6ODA4MC9mYXInKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJI3RvU3RyaW5nLCB1c2VyIGluZm9ybWF0aW9uIGluIGF1dGhvcml0eScsICgpID0+IHtcblx0XHRsZXQgdmFsdWUgPSBVUkkucGFyc2UoJ2h0dHA6Ly9mb286YmFyQGxvY2FsaG9zdC9mYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2h0dHA6Ly9mb286YmFyQGxvY2FsaG9zdC9mYXInKTtcblxuXHRcdHZhbHVlID0gVVJJLnBhcnNlKCdodHRwOi8vZm9vQGxvY2FsaG9zdC9mYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2h0dHA6Ly9mb29AbG9jYWxob3N0L2ZhcicpO1xuXG5cdFx0dmFsdWUgPSBVUkkucGFyc2UoJ2h0dHA6Ly9mb286YkFyQGxvY2FsaG9zdDo4MDgwL2ZhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCAnaHR0cDovL2ZvbzpiQXJAbG9jYWxob3N0OjgwODAvZmFyJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5wYXJzZSgnaHR0cDovL2Zvb0Bsb2NhbGhvc3Q6ODA4MC9mYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2h0dHA6Ly9mb29AbG9jYWxob3N0OjgwODAvZmFyJyk7XG5cblx0XHR2YWx1ZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJ2ZcdTAwRjZcdTAwRjY6Ylx1MDBGNnJAbFx1MDBGNmNhbGhvc3Q6ODA4MCcsIHBhdGg6ICcvZmFyJywgcXVlcnk6IHVuZGVmaW5lZCwgZnJhZ21lbnQ6IHVuZGVmaW5lZCB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUudG9TdHJpbmcoKSwgJ2h0dHA6Ly9mJUMzJUI2JUMzJUI2OmIlQzMlQjZyQGwlQzMlQjZjYWxob3N0OjgwODAvZmFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcnJlY3RGaWxlVXJpVG9GaWxlUGF0aDInLCAoKSA9PiB7XG5cblx0XHRjb25zdCB0ZXN0ID0gKGlucHV0OiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gVVJJLnBhcnNlKGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS5mc1BhdGgsIGV4cGVjdGVkLCAnUmVzdWx0IGZvciAnICsgaW5wdXQpO1xuXHRcdFx0Y29uc3QgdmFsdWUyID0gVVJJLmZpbGUodmFsdWUuZnNQYXRoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZTIuZnNQYXRoLCBleHBlY3RlZCwgJ1Jlc3VsdCBmb3IgJyArIGlucHV0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZS50b1N0cmluZygpLCB2YWx1ZTIudG9TdHJpbmcoKSk7XG5cdFx0fTtcblxuXHRcdHRlc3QoJ2ZpbGU6Ly8vYzovYWxleC50eHQnLCBpc1dpbmRvd3MgPyAnYzpcXFxcYWxleC50eHQnIDogJ2M6L2FsZXgudHh0Jyk7XG5cdFx0dGVzdCgnZmlsZTovLy9jOi9Tb3VyY2UvWiVDMyVCQ3JpY2glMjBvciUyMFp1cmljaCUyMCglQ0IlODh6aiVDQSU4QSVDOSU5OXIlQzklQUFrLC9Db2RlL3Jlc291cmNlcy9hcHAvcGx1Z2lucycsIGlzV2luZG93cyA/ICdjOlxcXFxTb3VyY2VcXFxcWlx1MDBGQ3JpY2ggb3IgWnVyaWNoIChcdTAyQzh6alx1MDI4QVx1MDI1OXJcdTAyNkFrLFxcXFxDb2RlXFxcXHJlc291cmNlc1xcXFxhcHBcXFxccGx1Z2lucycgOiAnYzovU291cmNlL1pcdTAwRkNyaWNoIG9yIFp1cmljaCAoXHUwMkM4empcdTAyOEFcdTAyNTlyXHUwMjZBaywvQ29kZS9yZXNvdXJjZXMvYXBwL3BsdWdpbnMnKTtcblx0XHR0ZXN0KCdmaWxlOi8vbW9uYWNvdG9vbHMvZm9sZGVyL2lzaS50eHQnLCBpc1dpbmRvd3MgPyAnXFxcXFxcXFxtb25hY290b29sc1xcXFxmb2xkZXJcXFxcaXNpLnR4dCcgOiAnLy9tb25hY290b29scy9mb2xkZXIvaXNpLnR4dCcpO1xuXHRcdHRlc3QoJ2ZpbGU6Ly9tb25hY290b29sczEvY2VydGlmaWNhdGVzL1NTTC8nLCBpc1dpbmRvd3MgPyAnXFxcXFxcXFxtb25hY290b29sczFcXFxcY2VydGlmaWNhdGVzXFxcXFNTTFxcXFwnIDogJy8vbW9uYWNvdG9vbHMxL2NlcnRpZmljYXRlcy9TU0wvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSAtIGh0dHAsIHF1ZXJ5ICYgdG9TdHJpbmcnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9NTE4MDA4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5xdWVyeSwgJ0xpbmtJZD01MTgwMDgnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnRvU3RyaW5nKHRydWUpLCAnaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkPTUxODAwOCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkudG9TdHJpbmcoKSwgJ2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZCUzRDUxODAwOCcpO1xuXG5cdFx0bGV0IHVyaTIgPSBVUkkucGFyc2UodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkyLnF1ZXJ5LCAnTGlua0lkPTUxODAwOCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkyLnF1ZXJ5LCB1cmkucXVlcnkpO1xuXG5cdFx0dXJpID0gVVJJLnBhcnNlKCdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9NTE4MDA4JmZvXHUwMEY2JmtcdTAwRTlcdTAwQTU9XHUwMEZDXHUwMEZDJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5xdWVyeSwgJ0xpbmtJZD01MTgwMDgmZm9cdTAwRjYma1x1MDBFOVx1MDBBNT1cdTAwRkNcdTAwRkMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnRvU3RyaW5nKHRydWUpLCAnaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkPTUxODAwOCZmb1x1MDBGNiZrXHUwMEU5XHUwMEE1PVx1MDBGQ1x1MDBGQycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkudG9TdHJpbmcoKSwgJ2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZCUzRDUxODAwOCUyNmZvJUMzJUI2JTI2ayVDMyVBOSVDMiVBNSUzRCVDMyVCQyVDMyVCQycpO1xuXG5cdFx0dXJpMiA9IFVSSS5wYXJzZSh1cmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIucXVlcnksICdMaW5rSWQ9NTE4MDA4JmZvXHUwMEY2JmtcdTAwRTlcdTAwQTU9XHUwMEZDXHUwMEZDJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTIucXVlcnksIHVyaS5xdWVyeSk7XG5cblx0XHQvLyAjMjQ4NDlcblx0XHR1cmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vdHdpdHRlci5jb20vc2VhcmNoP3NyYz10eXBkJnE9JTIzdGFnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS50b1N0cmluZyh0cnVlKSwgJ2h0dHBzOi8vdHdpdHRlci5jb20vc2VhcmNoP3NyYz10eXBkJnE9JTIzdGFnJyk7XG5cdH0pO1xuXG5cblx0dGVzdCgnY2xhc3MgVVJJIGNhbm5vdCByZXByZXNlbnQgcmVsYXRpdmUgZmlsZSBwYXRocyAjMzQ0NDknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgcGF0aCA9ICcvZm9vL2Jhcic7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKHBhdGgpLnBhdGgsIHBhdGgpO1xuXHRcdHBhdGggPSAnZm9vL2Jhcic7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5maWxlKHBhdGgpLnBhdGgsICcvZm9vL2JhcicpO1xuXHRcdHBhdGggPSAnLi9mb28vYmFyJztcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmZpbGUocGF0aCkucGF0aCwgJy8uL2Zvby9iYXInKTsgLy8gbWlzc2luZyBub3JtYWxpemF0aW9uXG5cblx0XHRjb25zdCBmaWxlVXJpMSA9IFVSSS5wYXJzZShgZmlsZTpmb28vYmFyYCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVVcmkxLnBhdGgsICcvZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlVXJpMS5hdXRob3JpdHksICcnKTtcblx0XHRjb25zdCB1cmkgPSBmaWxlVXJpMS50b1N0cmluZygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmksICdmaWxlOi8vL2Zvby9iYXInKTtcblx0XHRjb25zdCBmaWxlVXJpMiA9IFVSSS5wYXJzZSh1cmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlVXJpMi5wYXRoLCAnL2Zvby9iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZVVyaTIuYXV0aG9yaXR5LCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0N0cmwgY2xpY2sgdG8gZm9sbG93IGhhc2ggcXVlcnkgcGFyYW0gdXJsIGdldHMgdXJsZW5jb2RlZCAjNDk2MjgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGlucHV0ID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMC8jL2Zvbz9iYXI9YmF6Jztcblx0XHRsZXQgdXJpID0gVVJJLnBhcnNlKGlucHV0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnRvU3RyaW5nKHRydWUpLCBpbnB1dCk7XG5cblx0XHRpbnB1dCA9ICdodHRwOi8vbG9jYWxob3N0OjMwMDAvZm9vP2Jhcj1iYXonO1xuXHRcdHVyaSA9IFVSSS5wYXJzZShpbnB1dCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS50b1N0cmluZyh0cnVlKSwgaW5wdXQpO1xuXHR9KTtcblxuXHR0ZXN0KCdVbmFibGUgdG8gb3BlbiBcXCclQTAudHh0XFwnOiBVUkkgbWFsZm9ybWVkICM3NjUwNicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCB1cmkgPSBVUkkuZmlsZSgnL2Zvby8lQTAudHh0Jyk7XG5cdFx0bGV0IHVyaTIgPSBVUkkucGFyc2UodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuc2NoZW1lLCB1cmkyLnNjaGVtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCB1cmkyLnBhdGgpO1xuXG5cdFx0dXJpID0gVVJJLmZpbGUoJy9mb28vJTJlLnR4dCcpO1xuXHRcdHVyaTIgPSBVUkkucGFyc2UodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuc2NoZW1lLCB1cmkyLnNjaGVtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCB1cmkyLnBhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdCdWcgaW4gVVJJLmlzVXJpKCkgdGhhdCBmYWlscyBgdGhpbmdgIHR5cGUgY29tcGFyaXNvbiAjMTE0OTcxJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvZm9vL2JhenoudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5pc1VyaSh1cmkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmlzVXJpKHVyaS50b0pTT04oKSksIGZhbHNlKTtcblxuXHRcdC8vIGZzUGF0aCAtPiBnZXR0ZXJcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmlzVXJpKHtcblx0XHRcdHNjaGVtZTogJ2ZpbGUnLFxuXHRcdFx0YXV0aG9yaXR5OiAnJyxcblx0XHRcdHBhdGg6ICcvZm9vL2JhenoudHh0Jyxcblx0XHRcdGdldCBmc1BhdGgoKSB7IHJldHVybiAnL2Zvby9iYXp6LnR4dCc7IH0sXG5cdFx0XHRxdWVyeTogJycsXG5cdFx0XHRmcmFnbWVudDogJycsXG5cdFx0XHR3aXRoKCkgeyByZXR1cm4gdGhpczsgfSxcblx0XHRcdHRvU3RyaW5nKCkgeyByZXR1cm4gJyc7IH1cblx0XHR9KSwgdHJ1ZSk7XG5cblx0XHQvLyBmc1BhdGggLT4gcHJvcGVydHlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmlzVXJpKHtcblx0XHRcdHNjaGVtZTogJ2ZpbGUnLFxuXHRcdFx0YXV0aG9yaXR5OiAnJyxcblx0XHRcdHBhdGg6ICcvZm9vL2JhenoudHh0Jyxcblx0XHRcdGZzUGF0aDogJy9mb28vYmF6ei50eHQnLFxuXHRcdFx0cXVlcnk6ICcnLFxuXHRcdFx0ZnJhZ21lbnQ6ICcnLFxuXHRcdFx0d2l0aCgpIHsgcmV0dXJuIHRoaXM7IH0sXG5cdFx0XHR0b1N0cmluZygpIHsgcmV0dXJuICcnOyB9XG5cdFx0fSksIHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5pc1VyaSgxKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuaXNVcmkoJzEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuaXNVcmkoJ2h0dHA6Ly9zYW1wbGUuY29tJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLmlzVXJpKG51bGwpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5pc1VyaSh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzVXJpQ29tcG9uZW50cycsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGFzc2VydC5vayhpc1VyaUNvbXBvbmVudHMoVVJJLmZpbGUoJ2EnKSkpO1xuXHRcdGFzc2VydC5vayhpc1VyaUNvbXBvbmVudHMoVVJJLmZpbGUoJ2EnKS50b0pTT04oKSkpO1xuXHRcdGFzc2VydC5vayhpc1VyaUNvbXBvbmVudHMoVVJJLmZpbGUoJycpKSk7XG5cdFx0YXNzZXJ0Lm9rKGlzVXJpQ29tcG9uZW50cyhVUkkuZmlsZSgnJykudG9KU09OKCkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VyaUNvbXBvbmVudHMoMSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmlDb21wb25lbnRzKHRydWUpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJpQ29tcG9uZW50cygndHJ1ZScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJpQ29tcG9uZW50cyh7fSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmlDb21wb25lbnRzKHsgc2NoZW1lOiAnJyB9KSwgdHJ1ZSk7IC8vIHZhbGlkIGNvbXBvbmVudHMgYnV0IElOVkFMSUQgdXJpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJpQ29tcG9uZW50cyh7IHNjaGVtZTogJ2ZvJyB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJpQ29tcG9uZW50cyh7IHNjaGVtZTogJ2ZvJywgcGF0aDogJy9wJyB9KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJpQ29tcG9uZW50cyh7IHBhdGg6ICcvcCcgfSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZnJvbSwgZnJvbShzdHJpY3QpLCByZXZpdmUnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IFVSSS5mcm9tKHsgc2NoZW1lOiAnJyB9LCB0cnVlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5mcm9tKHsgc2NoZW1lOiAnJyB9KS5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5yZXZpdmUoeyBzY2hlbWU6ICcnIH0pLnNjaGVtZSwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdVbmFibGUgdG8gb3BlbiBcXCclQTAudHh0XFwnOiBVUkkgbWFsZm9ybWVkICM3NjUwNiwgcGFydCAyJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UoJ2ZpbGU6Ly9zb21lLyUudHh0JykudG9TdHJpbmcoKSwgJ2ZpbGU6Ly9zb21lLyUyNS50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdmaWxlOi8vc29tZS8lQTAudHh0JykudG9TdHJpbmcoKSwgJ2ZpbGU6Ly9zb21lLyUyNUEwLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ0xpbmtzIGluIG1hcmtkb3duIGFyZSBicm9rZW4gaWYgdXJsIGNvbnRhaW5zIGVuY29kZWQgcGFyYW1ldGVycyAjNzk0NzQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc3RySW4gPSAnaHR0cHM6Ly9teWhvc3QuY29tL1JlZGlyZWN0P3VybD1odHRwJTNBJTJGJTJGd3d3LmJpbmcuY29tJTNGc2VhcmNoJTNEdG9tJztcblx0XHRjb25zdCB1cmkxID0gVVJJLnBhcnNlKHN0ckluKTtcblx0XHRjb25zdCBzdHJPdXQgPSB1cmkxLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgdXJpMiA9IFVSSS5wYXJzZShzdHJPdXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEuc2NoZW1lLCB1cmkyLnNjaGVtZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEuYXV0aG9yaXR5LCB1cmkyLmF1dGhvcml0eSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEucGF0aCwgdXJpMi5wYXRoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpMS5xdWVyeSwgdXJpMi5xdWVyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEuZnJhZ21lbnQsIHVyaTIuZnJhZ21lbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJJbiwgc3RyT3V0KTsgLy8gZmFpbHMgaGVyZSEhXG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnVXJpI3BhcnNlIGNhbiBicmVhayBwYXRoLWNvbXBvbmVudCAjNDU1MTUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc3RySW4gPSAnaHR0cHM6Ly9maXJlYmFzZXN0b3JhZ2UuZ29vZ2xlYXBpcy5jb20vdjAvYi9icmV3bGFuZ2VyaWUuYXBwc3BvdC5jb20vby9wcm9kdWN0cyUyRnpWTlprdWRYSnlxOGJQR1RYVXh4JTJGQmV0dGVyYXZlLVNlc2FtZS5qcGc/YWx0PW1lZGlhJnRva2VuPTBiMjMxMGM0LTNlYTYtNDIwNy1iYmRlLTljMzcxMGJhMDQzNyc7XG5cdFx0Y29uc3QgdXJpMSA9IFVSSS5wYXJzZShzdHJJbik7XG5cdFx0Y29uc3Qgc3RyT3V0ID0gdXJpMS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHVyaTIgPSBVUkkucGFyc2Uoc3RyT3V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkxLnNjaGVtZSwgdXJpMi5zY2hlbWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkxLmF1dGhvcml0eSwgdXJpMi5hdXRob3JpdHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkxLnBhdGgsIHVyaTIucGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaTEucXVlcnksIHVyaTIucXVlcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkxLmZyYWdtZW50LCB1cmkyLmZyYWdtZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RySW4sIHN0ck91dCk7IC8vIGZhaWxzIGhlcmUhIVxuXHR9KTtcblxuXHR0ZXN0KCdVUkkgLSAoZGUpc2VyaWFsaXplJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgdmFsdWVzID0gW1xuXHRcdFx0VVJJLnBhcnNlKCdodHRwOi8vbG9jYWxob3N0OjgwODAvZmFyJyksXG5cdFx0XHRVUkkuZmlsZSgnYzpcXFxcdGVzdCB3aXRoICUyNVxcXFxjI2NvZGUnKSxcblx0XHRcdFVSSS5maWxlKCdcXFxcXFxcXHNoXHUwMEU0cmVzXFxcXHBhdGhcXFxcYyNcXFxccGx1Z2luLmpzb24nKSxcblx0XHRcdFVSSS5wYXJzZSgnaHR0cDovL2FwaS9maWxlcy90ZXN0Lm1lP3Q9MTIzNCcpLFxuXHRcdFx0VVJJLnBhcnNlKCdodHRwOi8vYXBpL2ZpbGVzL3Rlc3QubWU/dD0xMjM0I2ZmZicpLFxuXHRcdFx0VVJJLnBhcnNlKCdodHRwOi8vYXBpL2ZpbGVzL3Rlc3QubWUjZmZmJyksXG5cdFx0XTtcblxuXHRcdC8vIGNvbnNvbGUucHJvZmlsZSgpO1xuXHRcdC8vIGxldCBjID0gMTAwMDAwO1xuXHRcdC8vIHdoaWxlIChjLS0gPiAwKSB7XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB2YWx1ZS50b0pTT04oKSBhcyBVcmlDb21wb25lbnRzO1xuXHRcdFx0Y29uc3QgY2xvbmUgPSBVUkkucmV2aXZlKGRhdGEpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuc2NoZW1lLCB2YWx1ZS5zY2hlbWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmF1dGhvcml0eSwgdmFsdWUuYXV0aG9yaXR5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZS5wYXRoLCB2YWx1ZS5wYXRoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbG9uZS5xdWVyeSwgdmFsdWUucXVlcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLmZyYWdtZW50LCB2YWx1ZS5mcmFnbWVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUuZnNQYXRoLCB2YWx1ZS5mc1BhdGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsb25lLnRvU3RyaW5nKCksIHZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHQvLyB9XG5cdFx0Ly8gY29uc29sZS5wcm9maWxlRW5kKCk7XG5cdH0pO1xuXHRmdW5jdGlvbiBhc3NlcnRKb2luZWQoYmFzZTogc3RyaW5nLCBmcmFnbWVudDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nLCBjaGVja1dpdGhVcmw6IGJvb2xlYW4gPSB0cnVlKSB7XG5cdFx0Y29uc3QgYmFzZVVyaSA9IFVSSS5wYXJzZShiYXNlKTtcblx0XHRjb25zdCBuZXdVcmkgPSBVUkkuam9pblBhdGgoYmFzZVVyaSwgZnJhZ21lbnQpO1xuXHRcdGNvbnN0IGFjdHVhbCA9IG5ld1VyaS50b1N0cmluZyh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cblx0XHRpZiAoY2hlY2tXaXRoVXJsKSB7XG5cdFx0XHRjb25zdCBhY3R1YWxVcmwgPSBuZXcgVVJMKGZyYWdtZW50LCBiYXNlKS5ocmVmO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbFVybCwgZXhwZWN0ZWQsICdESUZGRVJFTlQgZnJvbSBVUkwnKTtcblx0XHR9XG5cdH1cblx0dGVzdCgnVVJJI2pvaW5QYXRoJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovLy9mb28vJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly8vYmF6eicpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly8vZm9vJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly8vYmF6eicpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly8vZm9vJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly8vYmF6eicpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly8vZm9vL2Jhci8nKSwgJy4vYmF6eicsICdmaWxlOi8vL2Zvby9iYXIvYmF6eicpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly8vZm9vL2JhcicpLCAnLi9iYXp6JywgJ2ZpbGU6Ly8vZm9vL2Jhci9iYXp6JywgZmFsc2UpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly8vZm9vL2JhcicpLCAnYmF6eicsICdmaWxlOi8vL2Zvby9iYXIvYmF6eicsIGZhbHNlKTtcblxuXHRcdC8vIFwiYXV0by1wYXRoXCIgc2NoZW1lXG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTonKSwgJ2JhenonLCAnZmlsZTovLy9iYXp6Jyk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnaHR0cDovL2RvbWFpbicpLCAnYmF6eicsICdodHRwOi8vZG9tYWluL2JhenonKTtcblx0XHRhc3NlcnRKb2luZWQoKCdodHRwczovL2RvbWFpbicpLCAnYmF6eicsICdodHRwczovL2RvbWFpbi9iYXp6Jyk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnaHR0cDonKSwgJ2JhenonLCAnaHR0cDovYmF6eicsIGZhbHNlKTtcblx0XHRhc3NlcnRKb2luZWQoKCdodHRwczonKSwgJ2JhenonLCAnaHR0cHM6L2JhenonLCBmYWxzZSk7XG5cblx0XHQvLyBubyBcImF1dG8tcGF0aFwiIHNjaGVtZSB3aXRoIGFuZCB3L28gcGF0aHNcblx0XHRhc3NlcnRKb2luZWQoKCdmb286LycpLCAnYmF6eicsICdmb286L2JhenonKTtcblx0XHRhc3NlcnRKb2luZWQoKCdmb286Ly9iYXIvJyksICdiYXp6JywgJ2ZvbzovL2Jhci9iYXp6Jyk7XG5cblx0XHQvLyBubyBcImF1dG8tcGF0aFwiICsgbm8gcGF0aCAtPiBlcnJvclxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYXNzZXJ0Sm9pbmVkKCgnZm9vOicpLCAnYmF6eicsICcnKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBuZXcgVVJMKCdiYXp6JywgJ2ZvbzonKSk7XG5cdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhc3NlcnRKb2luZWQoKCdmb286Ly9iYXInKSwgJ2JhenonLCAnJykpO1xuXHRcdC8vIGFzc2VydC50aHJvd3MoKCkgPT4gbmV3IFVSTCgnYmF6eicsICdmb286Ly9iYXInKSk7IEVkZ2UsIENocm9tZSA9PiBUSFJPVywgRmlyZWZveCwgU2FmYXJpID0+IGZvbzovL2Jhci9iYXp6XG5cdH0pO1xuXG5cdHRlc3QoJ1VSSSNqb2luUGF0aCAocG9zaXgpJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdHRoaXMuc2tpcCgpO1xuXHRcdH1cblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vL2M6L2Zvby8nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovLy9iYXp6JywgZmFsc2UpO1xuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly9zZXJ2ZXIvc2hhcmUvYzovJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly9zZXJ2ZXIvYmF6eicsIGZhbHNlKTtcblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vc2VydmVyL3NoYXJlL2M6JyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly9zZXJ2ZXIvYmF6eicsIGZhbHNlKTtcblxuXHRcdGFzc2VydEpvaW5lZCgoJ2ZpbGU6Ly9zZXIvZm9vLycpLCAnLi4vLi4vYmF6eicsICdmaWxlOi8vc2VyL2JhenonLCBmYWxzZSk7IC8vIEZpcmVmb3ggLT4gRGlmZmVyZW50LCBFZGdlLCBDaHJvbWUsIFNhZmFyIC0+IE9LXG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovL3Nlci9mb28nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovL3Nlci9iYXp6JywgZmFsc2UpOyAvLyBGaXJlZm94IC0+IERpZmZlcmVudCwgRWRnZSwgQ2hyb21lLCBTYWZhciAtPiBPS1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkjam9pblBhdGggKHdpbmRvd3MpJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHR0aGlzLnNraXAoKTtcblx0XHR9XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovLy9jOi9mb28vJyksICcuLi8uLi9iYXp6JywgJ2ZpbGU6Ly8vYzovYmF6eicsIGZhbHNlKTtcblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vc2VydmVyL3NoYXJlL2M6LycpLCAnLi4vLi4vYmF6eicsICdmaWxlOi8vc2VydmVyL3NoYXJlL2JhenonLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Sm9pbmVkKCgnZmlsZTovL3NlcnZlci9zaGFyZS9jOicpLCAnLi4vLi4vYmF6eicsICdmaWxlOi8vc2VydmVyL3NoYXJlL2JhenonLCBmYWxzZSk7XG5cblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vc2VyL2Zvby8nKSwgJy4uLy4uL2JhenonLCAnZmlsZTovL3Nlci9mb28vYmF6eicsIGZhbHNlKTtcblx0XHRhc3NlcnRKb2luZWQoKCdmaWxlOi8vc2VyL2ZvbycpLCAnLi4vLi4vYmF6eicsICdmaWxlOi8vc2VyL2Zvby9iYXp6JywgZmFsc2UpO1xuXG5cdFx0Ly9odHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTM4MzFcblx0XHRhc3NlcnRKb2luZWQoJ2ZpbGU6Ly8vYzovZm9vL2JhcicsICcuL290aGVyL2Zvby5pbWcnLCAnZmlsZTovLy9jOi9mb28vYmFyL290aGVyL2Zvby5pbWcnLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ZzY29kZS11cmk6IFVSSS50b1N0cmluZygpIHdyb25nbHkgZW5jb2RlIElQdjYgbGl0ZXJhbHMgIzE1NDA0OCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVVJJLnBhcnNlKCdodHRwOi8vW0ZFREM6QkE5ODo3NjU0OjMyMTA6RkVEQzpCQTk4Ojc2NTQ6MzIxMF06ODAvaW5kZXguaHRtbCcpLnRvU3RyaW5nKCksICdodHRwOi8vW2ZlZGM6YmE5ODo3NjU0OjMyMTA6ZmVkYzpiYTk4Ojc2NTQ6MzIxMF06ODAvaW5kZXguaHRtbCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnaHR0cDovL3VzZXJAW0ZFREM6QkE5ODo3NjU0OjMyMTA6RkVEQzpCQTk4Ojc2NTQ6MzIxMF06ODAvaW5kZXguaHRtbCcpLnRvU3RyaW5nKCksICdodHRwOi8vdXNlckBbZmVkYzpiYTk4Ojc2NTQ6MzIxMDpmZWRjOmJhOTg6NzY1NDozMjEwXTo4MC9pbmRleC5odG1sJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSgnaHR0cDovL3VzW2VyQFtGRURDOkJBOTg6NzY1NDozMjEwOkZFREM6QkE5ODo3NjU0OjMyMTBdOjgwL2luZGV4Lmh0bWwnKS50b1N0cmluZygpLCAnaHR0cDovL3VzJTVCZXJAW2ZlZGM6YmE5ODo3NjU0OjMyMTA6ZmVkYzpiYTk4Ojc2NTQ6MzIxMF06ODAvaW5kZXguaHRtbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIHBhdGhzIGNvbnRhaW5pbmcgYXBvc3Ryb3BoZXMgYnJlYWsgVVJJIHBhcnNpbmcgYW5kIGNhbm5vdCBiZSBvcGVuZWQgIzI3NjA3NScsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBmaWxlUGF0aCA9ICdDOlxcXFxVc2Vyc1xcXFxBYmQtYWwtSGFzZWViXFwnc19EZWxsXFxcXFN0dWRpb1xcXFx3M21hZ2VcXFxcd3AtY29udGVudFxcXFxkYXRhYmFzZS5odC5zcWxpdGUnO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoZmlsZVBhdGgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5wYXRoLCAnL0M6L1VzZXJzL0FiZC1hbC1IYXNlZWJcXCdzX0RlbGwvU3R1ZGlvL3czbWFnZS93cC1jb250ZW50L2RhdGFiYXNlLmh0LnNxbGl0ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5mc1BhdGgsICdjOlxcXFxVc2Vyc1xcXFxBYmQtYWwtSGFzZWViXFwnc19EZWxsXFxcXFN0dWRpb1xcXFx3M21hZ2VcXFxcd3AtY29udGVudFxcXFxkYXRhYmFzZS5odC5zcWxpdGUnKTtcblx0XHR9XG5cdH0pO1xuXG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsS0FBb0IsdUJBQXVCO0FBQ3BELFNBQVMsK0NBQStDO0FBR3hELE1BQU0sT0FBTyxNQUFNO0FBQ2xCLDBDQUF3QztBQUV4QyxPQUFLLGlCQUFpQixNQUFNO0FBQzNCLFdBQU8sWUFBWSxJQUFJLEtBQUssYUFBYSxFQUFFLFNBQVMsR0FBRyx1QkFBdUI7QUFDOUUsV0FBTyxZQUFZLElBQUksS0FBSyxhQUFhLEVBQUUsU0FBUyxHQUFHLHVCQUF1QjtBQUM5RSxXQUFPLFlBQVksSUFBSSxLQUFLLGNBQWMsRUFBRSxTQUFTLEdBQUcsd0JBQXdCO0FBQ2hGLFdBQU8sWUFBWSxJQUFJLEtBQUssY0FBYyxFQUFFLFNBQVMsR0FBRyx1QkFBdUI7QUFBQSxFQUNoRixDQUFDO0FBRUQsT0FBSywwQkFBMEIsTUFBTTtBQUNwQyxRQUFJLFdBQVc7QUFDZCxhQUFPLFlBQVksSUFBSSxLQUFLLGVBQWUsRUFBRSxTQUFTLEdBQUcsdUJBQXVCO0FBQ2hGLGFBQU8sWUFBWSxJQUFJLEtBQUssY0FBYyxFQUFFLFNBQVMsR0FBRyx1QkFBdUI7QUFBQSxJQUNoRixPQUFPO0FBQ04sYUFBTyxZQUFZLElBQUksS0FBSyxlQUFlLEVBQUUsU0FBUyxHQUFHLDJCQUEyQjtBQUNwRixhQUFPLFlBQVksSUFBSSxLQUFLLGNBQWMsRUFBRSxTQUFTLEdBQUcseUJBQXlCO0FBQUEsSUFFbEY7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLFFBQUksV0FBVztBQUNkLGFBQU8sWUFBWSxJQUFJLEtBQUssZUFBZSxF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
