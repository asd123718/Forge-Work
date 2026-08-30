import { strictEqual } from "assert";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { collapseTildePath, sanitizeCwd, escapeNonWindowsPath } from "../../common/terminalEnvironment.js";
import { PosixShellType, WindowsShellType, GeneralShellType } from "../../common/terminal.js";
suite("terminalEnvironment", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("collapseTildePath", () => {
    test("should return empty string for a falsy path", () => {
      strictEqual(collapseTildePath("", "/foo", "/"), "");
      strictEqual(collapseTildePath(void 0, "/foo", "/"), "");
    });
    test("should return path for a falsy user home", () => {
      strictEqual(collapseTildePath("/foo", "", "/"), "/foo");
      strictEqual(collapseTildePath("/foo", void 0, "/"), "/foo");
    });
    test("should not collapse when user home isn't present", () => {
      strictEqual(collapseTildePath("/foo", "/bar", "/"), "/foo");
      strictEqual(collapseTildePath("C:\\foo", "C:\\bar", "\\"), "C:\\foo");
    });
    test("should collapse with Windows separators", () => {
      strictEqual(collapseTildePath("C:\\foo\\bar", "C:\\foo", "\\"), "~\\bar");
      strictEqual(collapseTildePath("C:\\foo\\bar", "C:\\foo\\", "\\"), "~\\bar");
      strictEqual(collapseTildePath("C:\\foo\\bar\\baz", "C:\\foo\\", "\\"), "~\\bar\\baz");
      strictEqual(collapseTildePath("C:\\foo\\bar\\baz", "C:\\foo", "\\"), "~\\bar\\baz");
    });
    test("should collapse mixed case with Windows separators", () => {
      strictEqual(collapseTildePath("c:\\foo\\bar", "C:\\foo", "\\"), "~\\bar");
      strictEqual(collapseTildePath("C:\\foo\\bar\\baz", "c:\\foo", "\\"), "~\\bar\\baz");
    });
    test("should collapse with Posix separators", () => {
      strictEqual(collapseTildePath("/foo/bar", "/foo", "/"), "~/bar");
      strictEqual(collapseTildePath("/foo/bar", "/foo/", "/"), "~/bar");
      strictEqual(collapseTildePath("/foo/bar/baz", "/foo", "/"), "~/bar/baz");
      strictEqual(collapseTildePath("/foo/bar/baz", "/foo/", "/"), "~/bar/baz");
    });
  });
  suite("sanitizeCwd", () => {
    if (OS === OperatingSystem.Windows) {
      test("should make the Windows drive letter uppercase", () => {
        strictEqual(sanitizeCwd("c:\\foo\\bar"), "C:\\foo\\bar");
      });
    }
    test("should remove any wrapping quotes", () => {
      strictEqual(sanitizeCwd("'/foo/bar'"), "/foo/bar");
      strictEqual(sanitizeCwd('"/foo/bar"'), "/foo/bar");
    });
  });
  suite("escapeNonWindowsPath", () => {
    test("should escape for bash/sh/zsh shells", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Bash), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Bash), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', PosixShellType.Bash), `'/foo/bar"baz'`);
      strictEqual(escapeNonWindowsPath(`/foo/bar'baz"qux`, PosixShellType.Bash), `$'/foo/bar\\'baz"qux'`);
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Sh), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Sh), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Zsh), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Zsh), "'/foo/bar\\'baz'");
    });
    test("should escape for git bash", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", WindowsShellType.GitBash), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", WindowsShellType.GitBash), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', WindowsShellType.GitBash), `'/foo/bar"baz'`);
    });
    test("should escape for fish shell", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", PosixShellType.Fish), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", PosixShellType.Fish), "'/foo/bar\\'baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', PosixShellType.Fish), `'/foo/bar"baz'`);
      strictEqual(escapeNonWindowsPath(`/foo/bar'baz"qux`, PosixShellType.Fish), `"/foo/bar'baz\\"qux"`);
    });
    test("should escape for PowerShell", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar", GeneralShellType.PowerShell), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz", GeneralShellType.PowerShell), "'/foo/bar''baz'");
      strictEqual(escapeNonWindowsPath('/foo/bar"baz', GeneralShellType.PowerShell), `'/foo/bar"baz'`);
      strictEqual(escapeNonWindowsPath(`/foo/bar'baz"qux`, GeneralShellType.PowerShell), '"/foo/bar\'baz`"qux"');
    });
    test("should default to POSIX escaping for unknown shells", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar"), "'/foo/bar'");
      strictEqual(escapeNonWindowsPath("/foo/bar'baz"), "'/foo/bar\\'baz'");
    });
    test("should remove dangerous characters", () => {
      strictEqual(escapeNonWindowsPath("/foo/bar$(echo evil)", PosixShellType.Bash), "'/foo/bar(echo evil)'");
      strictEqual(escapeNonWindowsPath("/foo/bar`whoami`", PosixShellType.Bash), "'/foo/barwhoami'");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXHRlc3RcXGNvbW1vblxcdGVybWluYWxFbnZpcm9ubWVudC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29sbGFwc2VUaWxkZVBhdGgsIHNhbml0aXplQ3dkLCBlc2NhcGVOb25XaW5kb3dzUGF0aCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IFBvc2l4U2hlbGxUeXBlLCBXaW5kb3dzU2hlbGxUeXBlLCBHZW5lcmFsU2hlbGxUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcblxuc3VpdGUoJ3Rlcm1pbmFsRW52aXJvbm1lbnQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdjb2xsYXBzZVRpbGRlUGF0aCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGVtcHR5IHN0cmluZyBmb3IgYSBmYWxzeSBwYXRoJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJycsICcvZm9vJywgJy8nKSwgJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgodW5kZWZpbmVkLCAnL2ZvbycsICcvJyksICcnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHBhdGggZm9yIGEgZmFsc3kgdXNlciBob21lJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJy9mb28nLCAnJywgJy8nKSwgJy9mb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcvZm9vJywgdW5kZWZpbmVkLCAnLycpLCAnL2ZvbycpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgY29sbGFwc2Ugd2hlbiB1c2VyIGhvbWUgaXNuXFwndCBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJy9mb28nLCAnL2JhcicsICcvJyksICcvZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjb2xsYXBzZVRpbGRlUGF0aCgnQzpcXFxcZm9vJywgJ0M6XFxcXGJhcicsICdcXFxcJyksICdDOlxcXFxmb28nKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgY29sbGFwc2Ugd2l0aCBXaW5kb3dzIHNlcGFyYXRvcnMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjb2xsYXBzZVRpbGRlUGF0aCgnQzpcXFxcZm9vXFxcXGJhcicsICdDOlxcXFxmb28nLCAnXFxcXCcpLCAnflxcXFxiYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCdDOlxcXFxmb29cXFxcYmFyJywgJ0M6XFxcXGZvb1xcXFwnLCAnXFxcXCcpLCAnflxcXFxiYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCdDOlxcXFxmb29cXFxcYmFyXFxcXGJheicsICdDOlxcXFxmb29cXFxcJywgJ1xcXFwnKSwgJ35cXFxcYmFyXFxcXGJheicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJ0M6XFxcXGZvb1xcXFxiYXJcXFxcYmF6JywgJ0M6XFxcXGZvbycsICdcXFxcJyksICd+XFxcXGJhclxcXFxiYXonKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgY29sbGFwc2UgbWl4ZWQgY2FzZSB3aXRoIFdpbmRvd3Mgc2VwYXJhdG9ycycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCdjOlxcXFxmb29cXFxcYmFyJywgJ0M6XFxcXGZvbycsICdcXFxcJyksICd+XFxcXGJhcicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJ0M6XFxcXGZvb1xcXFxiYXJcXFxcYmF6JywgJ2M6XFxcXGZvbycsICdcXFxcJyksICd+XFxcXGJhclxcXFxiYXonKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgY29sbGFwc2Ugd2l0aCBQb3NpeCBzZXBhcmF0b3JzJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJy9mb28vYmFyJywgJy9mb28nLCAnLycpLCAnfi9iYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKGNvbGxhcHNlVGlsZGVQYXRoKCcvZm9vL2JhcicsICcvZm9vLycsICcvJyksICd+L2JhcicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJy9mb28vYmFyL2JheicsICcvZm9vJywgJy8nKSwgJ34vYmFyL2JheicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY29sbGFwc2VUaWxkZVBhdGgoJy9mb28vYmFyL2JheicsICcvZm9vLycsICcvJyksICd+L2Jhci9iYXonKTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdzYW5pdGl6ZUN3ZCcsICgpID0+IHtcblx0XHRpZiAoT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgbWFrZSB0aGUgV2luZG93cyBkcml2ZSBsZXR0ZXIgdXBwZXJjYXNlJywgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChzYW5pdGl6ZUN3ZCgnYzpcXFxcZm9vXFxcXGJhcicpLCAnQzpcXFxcZm9vXFxcXGJhcicpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHRlc3QoJ3Nob3VsZCByZW1vdmUgYW55IHdyYXBwaW5nIHF1b3RlcycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHNhbml0aXplQ3dkKCdcXCcvZm9vL2JhclxcJycpLCAnL2Zvby9iYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKHNhbml0aXplQ3dkKCdcIi9mb28vYmFyXCInKSwgJy9mb28vYmFyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlc2NhcGVOb25XaW5kb3dzUGF0aCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZXNjYXBlIGZvciBiYXNoL3NoL3pzaCBzaGVsbHMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXInLCBQb3NpeFNoZWxsVHlwZS5CYXNoKSwgJ1xcJy9mb28vYmFyXFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXonLCBQb3NpeFNoZWxsVHlwZS5CYXNoKSwgJ1xcJy9mb28vYmFyXFxcXFxcJ2JhelxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXCJiYXonLCBQb3NpeFNoZWxsVHlwZS5CYXNoKSwgJ1xcJy9mb28vYmFyXCJiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclxcJ2JhelwicXV4JywgUG9zaXhTaGVsbFR5cGUuQmFzaCksICckXFwnL2Zvby9iYXJcXFxcXFwnYmF6XCJxdXhcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhcicsIFBvc2l4U2hlbGxUeXBlLlNoKSwgJ1xcJy9mb28vYmFyXFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXonLCBQb3NpeFNoZWxsVHlwZS5TaCksICdcXCcvZm9vL2JhclxcXFxcXCdiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhcicsIFBvc2l4U2hlbGxUeXBlLlpzaCksICdcXCcvZm9vL2JhclxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXFwnYmF6JywgUG9zaXhTaGVsbFR5cGUuWnNoKSwgJ1xcJy9mb28vYmFyXFxcXFxcJ2JhelxcJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGVzY2FwZSBmb3IgZ2l0IGJhc2gnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXInLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gpLCAnXFwnL2Zvby9iYXJcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclxcJ2JheicsIFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCksICdcXCcvZm9vL2JhclxcXFxcXCdiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclwiYmF6JywgV2luZG93c1NoZWxsVHlwZS5HaXRCYXNoKSwgJ1xcJy9mb28vYmFyXCJiYXpcXCcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBlc2NhcGUgZm9yIGZpc2ggc2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXInLCBQb3NpeFNoZWxsVHlwZS5GaXNoKSwgJ1xcJy9mb28vYmFyXFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXonLCBQb3NpeFNoZWxsVHlwZS5GaXNoKSwgJ1xcJy9mb28vYmFyXFxcXFxcJ2JhelxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXCJiYXonLCBQb3NpeFNoZWxsVHlwZS5GaXNoKSwgJ1xcJy9mb28vYmFyXCJiYXpcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclxcJ2JhelwicXV4JywgUG9zaXhTaGVsbFR5cGUuRmlzaCksICdcIi9mb28vYmFyXFwnYmF6XFxcXFwicXV4XCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBlc2NhcGUgZm9yIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXInLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwpLCAnXFwnL2Zvby9iYXJcXCcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhclxcJ2JheicsIEdlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbCksICdcXCcvZm9vL2JhclxcJ1xcJ2JhelxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXCJiYXonLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwpLCAnXFwnL2Zvby9iYXJcImJhelxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyXFwnYmF6XCJxdXgnLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwpLCAnXCIvZm9vL2JhclxcJ2JhemBcInF1eFwiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGVmYXVsdCB0byBQT1NJWCBlc2NhcGluZyBmb3IgdW5rbm93biBzaGVsbHMnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXInKSwgJ1xcJy9mb28vYmFyXFwnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlc2NhcGVOb25XaW5kb3dzUGF0aCgnL2Zvby9iYXJcXCdiYXonKSwgJ1xcJy9mb28vYmFyXFxcXFxcJ2JhelxcJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlbW92ZSBkYW5nZXJvdXMgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGVzY2FwZU5vbldpbmRvd3NQYXRoKCcvZm9vL2JhciQoZWNobyBldmlsKScsIFBvc2l4U2hlbGxUeXBlLkJhc2gpLCAnXFwnL2Zvby9iYXIoZWNobyBldmlsKVxcJycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXNjYXBlTm9uV2luZG93c1BhdGgoJy9mb28vYmFyYHdob2FtaWAnLCBQb3NpeFNoZWxsVHlwZS5CYXNoKSwgJ1xcJy9mb28vYmFyd2hvYW1pXFwnJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixVQUFVO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CLGFBQWEsNEJBQTRCO0FBQ3JFLFNBQVMsZ0JBQWdCLGtCQUFrQix3QkFBd0I7QUFFbkUsTUFBTSx1QkFBdUIsTUFBTTtBQUNs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
