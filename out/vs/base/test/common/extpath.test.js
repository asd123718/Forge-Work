import assert from "assert";
import { CharCode } from "../../common/charCode.js";
import * as extpath from "../../common/extpath.js";
import { isWindows } from "../../common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Paths", () => {
  test("toForwardSlashes", () => {
    assert.strictEqual(extpath.toSlashes("\\\\server\\share\\some\\path"), "//server/share/some/path");
    assert.strictEqual(extpath.toSlashes("c:\\test"), "c:/test");
    assert.strictEqual(extpath.toSlashes("foo\\bar"), "foo/bar");
    assert.strictEqual(extpath.toSlashes("/user/far"), "/user/far");
  });
  test("getRoot", () => {
    assert.strictEqual(extpath.getRoot("/user/far"), "/");
    assert.strictEqual(extpath.getRoot("\\\\server\\share\\some\\path"), "//server/share/");
    assert.strictEqual(extpath.getRoot("//server/share/some/path"), "//server/share/");
    assert.strictEqual(extpath.getRoot("//server/share"), "/");
    assert.strictEqual(extpath.getRoot("//server"), "/");
    assert.strictEqual(extpath.getRoot("//server//"), "/");
    assert.strictEqual(extpath.getRoot("c:/user/far"), "c:/");
    assert.strictEqual(extpath.getRoot("c:user/far"), "c:");
    assert.strictEqual(extpath.getRoot("http://www"), "");
    assert.strictEqual(extpath.getRoot("http://www/"), "http://www/");
    assert.strictEqual(extpath.getRoot("file:///foo"), "file:///");
    assert.strictEqual(extpath.getRoot("file://foo"), "");
  });
  (!isWindows ? test.skip : test)("isUNC", () => {
    assert.ok(!extpath.isUNC("foo"));
    assert.ok(!extpath.isUNC("/foo"));
    assert.ok(!extpath.isUNC("\\foo"));
    assert.ok(!extpath.isUNC("\\\\foo"));
    assert.ok(extpath.isUNC("\\\\a\\b"));
    assert.ok(!extpath.isUNC("//a/b"));
    assert.ok(extpath.isUNC("\\\\server\\share"));
    assert.ok(extpath.isUNC("\\\\server\\share\\"));
    assert.ok(extpath.isUNC("\\\\server\\share\\path"));
  });
  test("isValidBasename", () => {
    assert.ok(!extpath.isValidBasename(null));
    assert.ok(!extpath.isValidBasename(""));
    assert.ok(extpath.isValidBasename("test.txt"));
    assert.ok(!extpath.isValidBasename("/test.txt"));
    if (isWindows) {
      assert.ok(!extpath.isValidBasename("\\test.txt"));
      assert.ok(!extpath.isValidBasename("aux"));
      assert.ok(!extpath.isValidBasename("Aux"));
      assert.ok(!extpath.isValidBasename("LPT0"));
      assert.ok(!extpath.isValidBasename("aux.txt"));
      assert.ok(!extpath.isValidBasename("com0.abc"));
      assert.ok(extpath.isValidBasename("LPT00"));
      assert.ok(extpath.isValidBasename("aux1"));
      assert.ok(extpath.isValidBasename("aux1.txt"));
      assert.ok(extpath.isValidBasename("aux1.aux.txt"));
      assert.ok(!extpath.isValidBasename("test.txt."));
      assert.ok(!extpath.isValidBasename("test.txt.."));
      assert.ok(!extpath.isValidBasename("test.txt "));
      assert.ok(!extpath.isValidBasename("test.txt	"));
      assert.ok(!extpath.isValidBasename("tes:t.txt"));
      assert.ok(!extpath.isValidBasename('tes"t.txt'));
    } else {
      assert.ok(extpath.isValidBasename("\\test.txt"));
    }
  });
  test("sanitizeFilePath", () => {
    if (isWindows) {
      assert.strictEqual(extpath.sanitizeFilePath(".", "C:\\the\\cwd"), "C:\\the\\cwd");
      assert.strictEqual(extpath.sanitizeFilePath("", "C:\\the\\cwd"), "C:\\the\\cwd");
      assert.strictEqual(extpath.sanitizeFilePath("C:", "C:\\the\\cwd"), "C:\\");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\", "C:\\the\\cwd"), "C:\\");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\\\", "C:\\the\\cwd"), "C:\\");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my.txt", "C:\\the\\cwd"), "C:\\folder\\my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my", "C:\\the\\cwd"), "C:\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\..\\my", "C:\\the\\cwd"), "C:\\my");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my\\", "C:\\the\\cwd"), "C:\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("C:\\folder\\my\\\\\\", "C:\\the\\cwd"), "C:\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt", "C:\\the\\cwd"), "C:\\the\\cwd\\my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt\\", "C:\\the\\cwd"), "C:\\the\\cwd\\my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("\\\\localhost\\folder\\my", "C:\\the\\cwd"), "\\\\localhost\\folder\\my");
      assert.strictEqual(extpath.sanitizeFilePath("\\\\localhost\\folder\\my\\", "C:\\the\\cwd"), "\\\\localhost\\folder\\my");
    } else {
      assert.strictEqual(extpath.sanitizeFilePath(".", "/the/cwd"), "/the/cwd");
      assert.strictEqual(extpath.sanitizeFilePath("", "/the/cwd"), "/the/cwd");
      assert.strictEqual(extpath.sanitizeFilePath("/", "/the/cwd"), "/");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my.txt", "/the/cwd"), "/folder/my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my", "/the/cwd"), "/folder/my");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/../my", "/the/cwd"), "/my");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my/", "/the/cwd"), "/folder/my");
      assert.strictEqual(extpath.sanitizeFilePath("/folder/my///", "/the/cwd"), "/folder/my");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt", "/the/cwd"), "/the/cwd/my.txt");
      assert.strictEqual(extpath.sanitizeFilePath("my.txt/", "/the/cwd"), "/the/cwd/my.txt");
    }
  });
  test("isRootOrDriveLetter", () => {
    if (isWindows) {
      assert.ok(extpath.isRootOrDriveLetter("c:"));
      assert.ok(extpath.isRootOrDriveLetter("D:"));
      assert.ok(extpath.isRootOrDriveLetter("D:/"));
      assert.ok(extpath.isRootOrDriveLetter("D:\\"));
      assert.ok(!extpath.isRootOrDriveLetter("D:\\path"));
      assert.ok(!extpath.isRootOrDriveLetter("D:/path"));
    } else {
      assert.ok(extpath.isRootOrDriveLetter("/"));
      assert.ok(!extpath.isRootOrDriveLetter("/path"));
    }
  });
  test("hasDriveLetter", () => {
    if (isWindows) {
      assert.ok(extpath.hasDriveLetter("c:"));
      assert.ok(extpath.hasDriveLetter("D:"));
      assert.ok(extpath.hasDriveLetter("D:/"));
      assert.ok(extpath.hasDriveLetter("D:\\"));
      assert.ok(extpath.hasDriveLetter("D:\\path"));
      assert.ok(extpath.hasDriveLetter("D:/path"));
    } else {
      assert.ok(!extpath.hasDriveLetter("/"));
      assert.ok(!extpath.hasDriveLetter("/path"));
    }
  });
  test("getDriveLetter", () => {
    if (isWindows) {
      assert.strictEqual(extpath.getDriveLetter("c:"), "c");
      assert.strictEqual(extpath.getDriveLetter("D:"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:/"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:\\"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:\\path"), "D");
      assert.strictEqual(extpath.getDriveLetter("D:/path"), "D");
    } else {
      assert.ok(!extpath.getDriveLetter("/"));
      assert.ok(!extpath.getDriveLetter("/path"));
    }
  });
  test("isWindowsDriveLetter", () => {
    assert.ok(!extpath.isWindowsDriveLetter(0));
    assert.ok(!extpath.isWindowsDriveLetter(-1));
    assert.ok(extpath.isWindowsDriveLetter(CharCode.A));
    assert.ok(extpath.isWindowsDriveLetter(CharCode.z));
  });
  test("indexOfPath", () => {
    assert.strictEqual(extpath.indexOfPath("/foo", "/bar", true), -1);
    assert.strictEqual(extpath.indexOfPath("/foo", "/FOO", false), -1);
    assert.strictEqual(extpath.indexOfPath("/foo", "/FOO", true), 0);
    assert.strictEqual(extpath.indexOfPath("/some/long/path", "/some/long", false), 0);
    assert.strictEqual(extpath.indexOfPath("/some/long/path", "/PATH", true), 10);
  });
  test("parseLineAndColumnAware", () => {
    let res = extpath.parseLineAndColumnAware("/foo/bar");
    assert.strictEqual(res.path, "/foo/bar");
    assert.strictEqual(res.line, void 0);
    assert.strictEqual(res.column, void 0);
    res = extpath.parseLineAndColumnAware("/foo/bar:33");
    assert.strictEqual(res.path, "/foo/bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 1);
    res = extpath.parseLineAndColumnAware("/foo/bar:33:34");
    assert.strictEqual(res.path, "/foo/bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 34);
    res = extpath.parseLineAndColumnAware("C:\\foo\\bar");
    assert.strictEqual(res.path, "C:\\foo\\bar");
    assert.strictEqual(res.line, void 0);
    assert.strictEqual(res.column, void 0);
    res = extpath.parseLineAndColumnAware("C:\\foo\\bar:33");
    assert.strictEqual(res.path, "C:\\foo\\bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 1);
    res = extpath.parseLineAndColumnAware("C:\\foo\\bar:33:34");
    assert.strictEqual(res.path, "C:\\foo\\bar");
    assert.strictEqual(res.line, 33);
    assert.strictEqual(res.column, 34);
    res = extpath.parseLineAndColumnAware("/foo/bar:abb");
    assert.strictEqual(res.path, "/foo/bar:abb");
    assert.strictEqual(res.line, void 0);
    assert.strictEqual(res.column, void 0);
  });
  test("randomPath", () => {
    let res = extpath.randomPath("/foo/bar");
    assert.ok(res);
    res = extpath.randomPath("/foo/bar", "prefix-");
    assert.ok(res.indexOf("prefix-"));
    const r1 = extpath.randomPath("/foo/bar");
    const r2 = extpath.randomPath("/foo/bar");
    assert.notStrictEqual(r1, r2);
    const r3 = extpath.randomPath("", "", 3);
    assert.strictEqual(r3.length, 3);
    const r4 = extpath.randomPath();
    assert.ok(r4);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGV4dHBhdGgudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCAqIGFzIGV4dHBhdGggZnJvbSAnLi4vLi4vY29tbW9uL2V4dHBhdGguanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnUGF0aHMnLCAoKSA9PiB7XG5cblx0dGVzdCgndG9Gb3J3YXJkU2xhc2hlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC50b1NsYXNoZXMoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXHNvbWVcXFxccGF0aCcpLCAnLy9zZXJ2ZXIvc2hhcmUvc29tZS9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGgudG9TbGFzaGVzKCdjOlxcXFx0ZXN0JyksICdjOi90ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGgudG9TbGFzaGVzKCdmb29cXFxcYmFyJyksICdmb28vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGgudG9TbGFzaGVzKCcvdXNlci9mYXInKSwgJy91c2VyL2ZhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRSb290JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJy91c2VyL2ZhcicpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXHNvbWVcXFxccGF0aCcpLCAnLy9zZXJ2ZXIvc2hhcmUvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnLy9zZXJ2ZXIvc2hhcmUvc29tZS9wYXRoJyksICcvL3NlcnZlci9zaGFyZS8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5nZXRSb290KCcvL3NlcnZlci9zaGFyZScpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJy8vc2VydmVyJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0Um9vdCgnLy9zZXJ2ZXIvLycpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJ2M6L3VzZXIvZmFyJyksICdjOi8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5nZXRSb290KCdjOnVzZXIvZmFyJyksICdjOicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJ2h0dHA6Ly93d3cnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJ2h0dHA6Ly93d3cvJyksICdodHRwOi8vd3d3LycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJ2ZpbGU6Ly8vZm9vJyksICdmaWxlOi8vLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldFJvb3QoJ2ZpbGU6Ly9mb28nKSwgJycpO1xuXHR9KTtcblxuXHQoIWlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdpc1VOQycsICgpID0+IHtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNVTkMoJ2ZvbycpKTtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNVTkMoJy9mb28nKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVU5DKCdcXFxcZm9vJykpO1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1VOQygnXFxcXFxcXFxmb28nKSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNVTkMoJ1xcXFxcXFxcYVxcXFxiJykpO1xuXHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1VOQygnLy9hL2InKSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNVTkMoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlJykpO1xuXHRcdGFzc2VydC5vayhleHRwYXRoLmlzVU5DKCdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFwnKSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNVTkMoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXHBhdGgnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzVmFsaWRCYXNlbmFtZScsICgpID0+IHtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKG51bGwpKTtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCcnKSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCd0ZXN0LnR4dCcpKTtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCcvdGVzdC50eHQnKSk7XG5cblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdcXFxcdGVzdC50eHQnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdhdXgnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdBdXgnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdMUFQwJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgnYXV4LnR4dCcpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ2NvbTAuYWJjJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdMUFQwMCcpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgnYXV4MScpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgnYXV4MS50eHQnKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ2F1eDEuYXV4LnR4dCcpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgndGVzdC50eHQuJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgndGVzdC50eHQuLicpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ3Rlc3QudHh0ICcpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1ZhbGlkQmFzZW5hbWUoJ3Rlc3QudHh0XFx0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgndGVzOnQudHh0JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzVmFsaWRCYXNlbmFtZSgndGVzXCJ0LnR4dCcpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNWYWxpZEJhc2VuYW1lKCdcXFxcdGVzdC50eHQnKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzYW5pdGl6ZUZpbGVQYXRoJywgKCkgPT4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJy4nLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcdGhlXFxcXGN3ZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnJywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXHRoZVxcXFxjd2QnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnQzonLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdDOlxcXFwnLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnQzpcXFxcJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdDOlxcXFxcXFxcJywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdDOlxcXFxmb2xkZXJcXFxcbXkudHh0JywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXGZvbGRlclxcXFxteS50eHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ0M6XFxcXGZvbGRlclxcXFxteScsICdDOlxcXFx0aGVcXFxcY3dkJyksICdDOlxcXFxmb2xkZXJcXFxcbXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ0M6XFxcXGZvbGRlclxcXFwuLlxcXFxteScsICdDOlxcXFx0aGVcXFxcY3dkJyksICdDOlxcXFxteScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnQzpcXFxcZm9sZGVyXFxcXG15XFxcXCcsICdDOlxcXFx0aGVcXFxcY3dkJyksICdDOlxcXFxmb2xkZXJcXFxcbXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ0M6XFxcXGZvbGRlclxcXFxteVxcXFxcXFxcXFxcXCcsICdDOlxcXFx0aGVcXFxcY3dkJyksICdDOlxcXFxmb2xkZXJcXFxcbXknKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnbXkudHh0JywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXHRoZVxcXFxjd2RcXFxcbXkudHh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdteS50eHRcXFxcJywgJ0M6XFxcXHRoZVxcXFxjd2QnKSwgJ0M6XFxcXHRoZVxcXFxjd2RcXFxcbXkudHh0Jyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ1xcXFxcXFxcbG9jYWxob3N0XFxcXGZvbGRlclxcXFxteScsICdDOlxcXFx0aGVcXFxcY3dkJyksICdcXFxcXFxcXGxvY2FsaG9zdFxcXFxmb2xkZXJcXFxcbXknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJ1xcXFxcXFxcbG9jYWxob3N0XFxcXGZvbGRlclxcXFxteVxcXFwnLCAnQzpcXFxcdGhlXFxcXGN3ZCcpLCAnXFxcXFxcXFxsb2NhbGhvc3RcXFxcZm9sZGVyXFxcXG15Jyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJy4nLCAnL3RoZS9jd2QnKSwgJy90aGUvY3dkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCcnLCAnL3RoZS9jd2QnKSwgJy90aGUvY3dkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCcvJywgJy90aGUvY3dkJyksICcvJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLnNhbml0aXplRmlsZVBhdGgoJy9mb2xkZXIvbXkudHh0JywgJy90aGUvY3dkJyksICcvZm9sZGVyL215LnR4dCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnL2ZvbGRlci9teScsICcvdGhlL2N3ZCcpLCAnL2ZvbGRlci9teScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnL2ZvbGRlci8uLi9teScsICcvdGhlL2N3ZCcpLCAnL215Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCcvZm9sZGVyL215LycsICcvdGhlL2N3ZCcpLCAnL2ZvbGRlci9teScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnL2ZvbGRlci9teS8vLycsICcvdGhlL2N3ZCcpLCAnL2ZvbGRlci9teScpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5zYW5pdGl6ZUZpbGVQYXRoKCdteS50eHQnLCAnL3RoZS9jd2QnKSwgJy90aGUvY3dkL215LnR4dCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguc2FuaXRpemVGaWxlUGF0aCgnbXkudHh0LycsICcvdGhlL2N3ZCcpLCAnL3RoZS9jd2QvbXkudHh0Jyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdpc1Jvb3RPckRyaXZlTGV0dGVyJywgKCkgPT4ge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmlzUm9vdE9yRHJpdmVMZXR0ZXIoJ2M6JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNSb290T3JEcml2ZUxldHRlcignRDonKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1Jvb3RPckRyaXZlTGV0dGVyKCdEOi8nKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1Jvb3RPckRyaXZlTGV0dGVyKCdEOlxcXFwnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNSb290T3JEcml2ZUxldHRlcignRDpcXFxccGF0aCcpKTtcblx0XHRcdGFzc2VydC5vayghZXh0cGF0aC5pc1Jvb3RPckRyaXZlTGV0dGVyKCdEOi9wYXRoJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1Jvb3RPckRyaXZlTGV0dGVyKCcvJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzUm9vdE9yRHJpdmVMZXR0ZXIoJy9wYXRoJykpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaGFzRHJpdmVMZXR0ZXInLCAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaGFzRHJpdmVMZXR0ZXIoJ2M6JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaGFzRHJpdmVMZXR0ZXIoJ0Q6JykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaGFzRHJpdmVMZXR0ZXIoJ0Q6LycpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmhhc0RyaXZlTGV0dGVyKCdEOlxcXFwnKSk7XG5cdFx0XHRhc3NlcnQub2soZXh0cGF0aC5oYXNEcml2ZUxldHRlcignRDpcXFxccGF0aCcpKTtcblx0XHRcdGFzc2VydC5vayhleHRwYXRoLmhhc0RyaXZlTGV0dGVyKCdEOi9wYXRoJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaGFzRHJpdmVMZXR0ZXIoJy8nKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguaGFzRHJpdmVMZXR0ZXIoJy9wYXRoJykpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZ2V0RHJpdmVMZXR0ZXInLCAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguZ2V0RHJpdmVMZXR0ZXIoJ2M6JyksICdjJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5nZXREcml2ZUxldHRlcignRDonKSwgJ0QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldERyaXZlTGV0dGVyKCdEOi8nKSwgJ0QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldERyaXZlTGV0dGVyKCdEOlxcXFwnKSwgJ0QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmdldERyaXZlTGV0dGVyKCdEOlxcXFxwYXRoJyksICdEJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5nZXREcml2ZUxldHRlcignRDovcGF0aCcpLCAnRCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguZ2V0RHJpdmVMZXR0ZXIoJy8nKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHBhdGguZ2V0RHJpdmVMZXR0ZXIoJy9wYXRoJykpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnaXNXaW5kb3dzRHJpdmVMZXR0ZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKCFleHRwYXRoLmlzV2luZG93c0RyaXZlTGV0dGVyKDApKTtcblx0XHRhc3NlcnQub2soIWV4dHBhdGguaXNXaW5kb3dzRHJpdmVMZXR0ZXIoLTEpKTtcblx0XHRhc3NlcnQub2soZXh0cGF0aC5pc1dpbmRvd3NEcml2ZUxldHRlcihDaGFyQ29kZS5BKSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dHBhdGguaXNXaW5kb3dzRHJpdmVMZXR0ZXIoQ2hhckNvZGUueikpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmRleE9mUGF0aCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5pbmRleE9mUGF0aCgnL2ZvbycsICcvYmFyJywgdHJ1ZSksIC0xKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5pbmRleE9mUGF0aCgnL2ZvbycsICcvRk9PJywgZmFsc2UpLCAtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHBhdGguaW5kZXhPZlBhdGgoJy9mb28nLCAnL0ZPTycsIHRydWUpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cGF0aC5pbmRleE9mUGF0aCgnL3NvbWUvbG9uZy9wYXRoJywgJy9zb21lL2xvbmcnLCBmYWxzZSksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRwYXRoLmluZGV4T2ZQYXRoKCcvc29tZS9sb25nL3BhdGgnLCAnL1BBVEgnLCB0cnVlKSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZScsICgpID0+IHtcblx0XHRsZXQgcmVzID0gZXh0cGF0aC5wYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSgnL2Zvby9iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnBhdGgsICcvZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGluZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNvbHVtbiwgdW5kZWZpbmVkKTtcblxuXHRcdHJlcyA9IGV4dHBhdGgucGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUoJy9mb28vYmFyOjMzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5wYXRoLCAnL2Zvby9iYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIDMzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNvbHVtbiwgMSk7XG5cblx0XHRyZXMgPSBleHRwYXRoLnBhcnNlTGluZUFuZENvbHVtbkF3YXJlKCcvZm9vL2JhcjozMzozNCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMucGF0aCwgJy9mb28vYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCAzMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5jb2x1bW4sIDM0KTtcblxuXHRcdHJlcyA9IGV4dHBhdGgucGFyc2VMaW5lQW5kQ29sdW1uQXdhcmUoJ0M6XFxcXGZvb1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnBhdGgsICdDOlxcXFxmb29cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5saW5lLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuY29sdW1uLCB1bmRlZmluZWQpO1xuXG5cdFx0cmVzID0gZXh0cGF0aC5wYXJzZUxpbmVBbmRDb2x1bW5Bd2FyZSgnQzpcXFxcZm9vXFxcXGJhcjozMycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMucGF0aCwgJ0M6XFxcXGZvb1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIDMzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmNvbHVtbiwgMSk7XG5cblx0XHRyZXMgPSBleHRwYXRoLnBhcnNlTGluZUFuZENvbHVtbkF3YXJlKCdDOlxcXFxmb29cXFxcYmFyOjMzOjM0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5wYXRoLCAnQzpcXFxcZm9vXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMubGluZSwgMzMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuY29sdW1uLCAzNCk7XG5cblx0XHRyZXMgPSBleHRwYXRoLnBhcnNlTGluZUFuZENvbHVtbkF3YXJlKCcvZm9vL2JhcjphYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnBhdGgsICcvZm9vL2JhcjphYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmxpbmUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5jb2x1bW4sIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JhbmRvbVBhdGgnLCAoKSA9PiB7XG5cdFx0bGV0IHJlcyA9IGV4dHBhdGgucmFuZG9tUGF0aCgnL2Zvby9iYXInKTtcblx0XHRhc3NlcnQub2socmVzKTtcblxuXHRcdHJlcyA9IGV4dHBhdGgucmFuZG9tUGF0aCgnL2Zvby9iYXInLCAncHJlZml4LScpO1xuXHRcdGFzc2VydC5vayhyZXMuaW5kZXhPZigncHJlZml4LScpKTtcblxuXHRcdGNvbnN0IHIxID0gZXh0cGF0aC5yYW5kb21QYXRoKCcvZm9vL2JhcicpO1xuXHRcdGNvbnN0IHIyID0gZXh0cGF0aC5yYW5kb21QYXRoKCcvZm9vL2JhcicpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHIxLCByMik7XG5cblx0XHRjb25zdCByMyA9IGV4dHBhdGgucmFuZG9tUGF0aCgnJywgJycsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMy5sZW5ndGgsIDMpO1xuXG5cdFx0Y29uc3QgcjQgPSBleHRwYXRoLnJhbmRvbVBhdGgoKTtcblx0XHRhc3NlcnQub2socjQpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksYUFBYTtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLFNBQVMsTUFBTTtB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
