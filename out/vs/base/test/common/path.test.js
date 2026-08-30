import assert from "assert";
import * as path from "../../common/path.js";
import { isWeb, isWindows } from "../../common/platform.js";
import * as process from "../../common/process.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Paths (Node Implementation)", () => {
  const __filename = "path.test.js";
  ensureNoDisposablesAreLeakedInTestSuite();
  test("join", () => {
    const failures = [];
    const backslashRE = /\\/g;
    const joinTests = [
      [
        [path.posix.join, path.win32.join],
        // arguments                     result
        [
          [[".", "x/b", "..", "/b/c.js"], "x/b/c.js"],
          [[], "."],
          [["/.", "x/b", "..", "/b/c.js"], "/x/b/c.js"],
          [["/foo", "../../../bar"], "/bar"],
          [["foo", "../../../bar"], "../../bar"],
          [["foo/", "../../../bar"], "../../bar"],
          [["foo/x", "../../../bar"], "../bar"],
          [["foo/x", "./bar"], "foo/x/bar"],
          [["foo/x/", "./bar"], "foo/x/bar"],
          [["foo/x/", ".", "bar"], "foo/x/bar"],
          [["./"], "./"],
          [[".", "./"], "./"],
          [[".", ".", "."], "."],
          [[".", "./", "."], "."],
          [[".", "/./", "."], "."],
          [[".", "/////./", "."], "."],
          [["."], "."],
          [["", "."], "."],
          [["", "foo"], "foo"],
          [["foo", "/bar"], "foo/bar"],
          [["", "/foo"], "/foo"],
          [["", "", "/foo"], "/foo"],
          [["", "", "foo"], "foo"],
          [["foo", ""], "foo"],
          [["foo/", ""], "foo/"],
          [["foo", "", "/bar"], "foo/bar"],
          [["./", "..", "/foo"], "../foo"],
          [["./", "..", "..", "/foo"], "../../foo"],
          [[".", "..", "..", "/foo"], "../../foo"],
          [["", "..", "..", "/foo"], "../../foo"],
          [["/"], "/"],
          [["/", "."], "/"],
          [["/", ".."], "/"],
          [["/", "..", ".."], "/"],
          [[""], "."],
          [["", ""], "."],
          [[" /foo"], " /foo"],
          [[" ", "foo"], " /foo"],
          [[" ", "."], " "],
          [[" ", "/"], " /"],
          [[" ", ""], " "],
          [["/", "foo"], "/foo"],
          [["/", "/foo"], "/foo"],
          [["/", "//foo"], "/foo"],
          [["/", "", "/foo"], "/foo"],
          [["", "/", "foo"], "/foo"],
          [["", "/", "/foo"], "/foo"]
        ]
      ]
    ];
    joinTests.push([
      path.win32.join,
      joinTests[0][1].slice(0).concat(
        [
          // arguments                     result
          // UNC path expected
          [["//foo/bar"], "\\\\foo\\bar\\"],
          [["\\/foo/bar"], "\\\\foo\\bar\\"],
          [["\\\\foo/bar"], "\\\\foo\\bar\\"],
          // UNC path expected - server and share separate
          [["//foo", "bar"], "\\\\foo\\bar\\"],
          [["//foo/", "bar"], "\\\\foo\\bar\\"],
          [["//foo", "/bar"], "\\\\foo\\bar\\"],
          // UNC path expected - questionable
          [["//foo", "", "bar"], "\\\\foo\\bar\\"],
          [["//foo/", "", "bar"], "\\\\foo\\bar\\"],
          [["//foo/", "", "/bar"], "\\\\foo\\bar\\"],
          // UNC path expected - even more questionable
          [["", "//foo", "bar"], "\\\\foo\\bar\\"],
          [["", "//foo/", "bar"], "\\\\foo\\bar\\"],
          [["", "//foo/", "/bar"], "\\\\foo\\bar\\"],
          // No UNC path expected (no double slash in first component)
          [["\\", "foo/bar"], "\\foo\\bar"],
          [["\\", "/foo/bar"], "\\foo\\bar"],
          [["", "/", "/foo/bar"], "\\foo\\bar"],
          // No UNC path expected (no non-slashes in first component -
          // questionable)
          [["//", "foo/bar"], "\\foo\\bar"],
          [["//", "/foo/bar"], "\\foo\\bar"],
          [["\\\\", "/", "/foo/bar"], "\\foo\\bar"],
          [["//"], "\\"],
          // No UNC path expected (share name missing - questionable).
          [["//foo"], "\\foo"],
          [["//foo/"], "\\foo\\"],
          [["//foo", "/"], "\\foo\\"],
          [["//foo", "", "/"], "\\foo\\"],
          // No UNC path expected (too many leading slashes - questionable)
          [["///foo/bar"], "\\foo\\bar"],
          [["////foo", "bar"], "\\foo\\bar"],
          [["\\\\\\/foo/bar"], "\\foo\\bar"],
          // Drive-relative vs drive-absolute paths. This merely describes the
          // status quo, rather than being obviously right
          [["c:"], "c:."],
          [["c:."], "c:."],
          [["c:", ""], "c:."],
          [["", "c:"], "c:."],
          [["c:.", "/"], "c:.\\"],
          [["c:.", "file"], "c:file"],
          [["c:", "/"], "c:\\"],
          [["c:", "file"], "c:\\file"]
        ]
      )
    ]);
    joinTests.forEach((test2) => {
      if (!Array.isArray(test2[0])) {
        test2[0] = [test2[0]];
      }
      test2[0].forEach((join) => {
        test2[1].forEach((test3) => {
          const actual = join.apply(null, test3[0]);
          const expected = test3[1];
          let actualAlt;
          let os;
          if (join === path.win32.join) {
            actualAlt = actual.replace(backslashRE, "/");
            os = "win32";
          } else {
            os = "posix";
          }
          const message = `path.${os}.join(${test3[0].map(JSON.stringify).join(",")})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
          if (actual !== expected && actualAlt !== expected) {
            failures.push(`
${message}`);
          }
        });
      });
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
  });
  test("dirname", () => {
    assert.strictEqual(path.posix.dirname("/a/b/"), "/a");
    assert.strictEqual(path.posix.dirname("/a/b"), "/a");
    assert.strictEqual(path.posix.dirname("/a"), "/");
    assert.strictEqual(path.posix.dirname(""), ".");
    assert.strictEqual(path.posix.dirname("/"), "/");
    assert.strictEqual(path.posix.dirname("////"), "/");
    assert.strictEqual(path.posix.dirname("//a"), "//");
    assert.strictEqual(path.posix.dirname("foo"), ".");
    assert.strictEqual(path.win32.dirname("c:\\"), "c:\\");
    assert.strictEqual(path.win32.dirname("c:\\foo"), "c:\\");
    assert.strictEqual(path.win32.dirname("c:\\foo\\"), "c:\\");
    assert.strictEqual(path.win32.dirname("c:\\foo\\bar"), "c:\\foo");
    assert.strictEqual(path.win32.dirname("c:\\foo\\bar\\"), "c:\\foo");
    assert.strictEqual(path.win32.dirname("c:\\foo\\bar\\baz"), "c:\\foo\\bar");
    assert.strictEqual(path.win32.dirname("\\"), "\\");
    assert.strictEqual(path.win32.dirname("\\foo"), "\\");
    assert.strictEqual(path.win32.dirname("\\foo\\"), "\\");
    assert.strictEqual(path.win32.dirname("\\foo\\bar"), "\\foo");
    assert.strictEqual(path.win32.dirname("\\foo\\bar\\"), "\\foo");
    assert.strictEqual(path.win32.dirname("\\foo\\bar\\baz"), "\\foo\\bar");
    assert.strictEqual(path.win32.dirname("c:"), "c:");
    assert.strictEqual(path.win32.dirname("c:foo"), "c:");
    assert.strictEqual(path.win32.dirname("c:foo\\"), "c:");
    assert.strictEqual(path.win32.dirname("c:foo\\bar"), "c:foo");
    assert.strictEqual(path.win32.dirname("c:foo\\bar\\"), "c:foo");
    assert.strictEqual(path.win32.dirname("c:foo\\bar\\baz"), "c:foo\\bar");
    assert.strictEqual(path.win32.dirname("file:stream"), ".");
    assert.strictEqual(path.win32.dirname("dir\\file:stream"), "dir");
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share"),
      "\\\\unc\\share"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo"),
      "\\\\unc\\share\\"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\"),
      "\\\\unc\\share\\"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\bar"),
      "\\\\unc\\share\\foo"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\bar\\"),
      "\\\\unc\\share\\foo"
    );
    assert.strictEqual(
      path.win32.dirname("\\\\unc\\share\\foo\\bar\\baz"),
      "\\\\unc\\share\\foo\\bar"
    );
    assert.strictEqual(path.win32.dirname("/a/b/"), "/a");
    assert.strictEqual(path.win32.dirname("/a/b"), "/a");
    assert.strictEqual(path.win32.dirname("/a"), "/");
    assert.strictEqual(path.win32.dirname(""), ".");
    assert.strictEqual(path.win32.dirname("/"), "/");
    assert.strictEqual(path.win32.dirname("////"), "/");
    assert.strictEqual(path.win32.dirname("foo"), ".");
    function assertDirname(p, expected, win = false) {
      const actual = win ? path.win32.dirname(p) : path.posix.dirname(p);
      if (actual !== expected) {
        assert.fail(`${p}: expected: ${expected}, ours: ${actual}`);
      }
    }
    assertDirname("foo/bar", "foo");
    assertDirname("foo\\bar", "foo", true);
    assertDirname("/foo/bar", "/foo");
    assertDirname("\\foo\\bar", "\\foo", true);
    assertDirname("/foo", "/");
    assertDirname("\\foo", "\\", true);
    assertDirname("/", "/");
    assertDirname("\\", "\\", true);
    assertDirname("foo", ".");
    assertDirname("f", ".");
    assertDirname("f/", ".");
    assertDirname("/folder/", "/");
    assertDirname("c:\\some\\file.txt", "c:\\some", true);
    assertDirname("c:\\some", "c:\\", true);
    assertDirname("c:\\", "c:\\", true);
    assertDirname("c:", "c:", true);
    assertDirname("\\\\server\\share\\some\\path", "\\\\server\\share\\some", true);
    assertDirname("\\\\server\\share\\some", "\\\\server\\share\\", true);
    assertDirname("\\\\server\\share\\", "\\\\server\\share\\", true);
  });
  test("extname", () => {
    const failures = [];
    const slashRE = /\//g;
    [
      [__filename, ".js"],
      ["", ""],
      ["/path/to/file", ""],
      ["/path/to/file.ext", ".ext"],
      ["/path.to/file.ext", ".ext"],
      ["/path.to/file", ""],
      ["/path.to/.file", ""],
      ["/path.to/.file.ext", ".ext"],
      ["/path/to/f.ext", ".ext"],
      ["/path/to/..ext", ".ext"],
      ["/path/to/..", ""],
      ["file", ""],
      ["file.ext", ".ext"],
      [".file", ""],
      [".file.ext", ".ext"],
      ["/file", ""],
      ["/file.ext", ".ext"],
      ["/.file", ""],
      ["/.file.ext", ".ext"],
      [".path/file.ext", ".ext"],
      ["file.ext.ext", ".ext"],
      ["file.", "."],
      [".", ""],
      ["./", ""],
      [".file.ext", ".ext"],
      [".file", ""],
      [".file.", "."],
      [".file..", "."],
      ["..", ""],
      ["../", ""],
      ["..file.ext", ".ext"],
      ["..file", ".file"],
      ["..file.", "."],
      ["..file..", "."],
      ["...", "."],
      ["...ext", ".ext"],
      ["....", "."],
      ["file.ext/", ".ext"],
      ["file.ext//", ".ext"],
      ["file/", ""],
      ["file//", ""],
      ["file./", "."],
      ["file.//", "."]
    ].forEach((test2) => {
      const expected = test2[1];
      [path.posix.extname, path.win32.extname].forEach((extname) => {
        let input = test2[0];
        let os;
        if (extname === path.win32.extname) {
          input = input.replace(slashRE, "\\");
          os = "win32";
        } else {
          os = "posix";
        }
        const actual = extname(input);
        const message = `path.${os}.extname(${JSON.stringify(input)})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected) {
          failures.push(`
${message}`);
        }
      });
      {
        const input = `C:${test2[0].replace(slashRE, "\\")}`;
        const actual = path.win32.extname(input);
        const message = `path.win32.extname(${JSON.stringify(input)})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected) {
          failures.push(`
${message}`);
        }
      }
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
    assert.strictEqual(path.win32.extname(".\\"), "");
    assert.strictEqual(path.win32.extname("..\\"), "");
    assert.strictEqual(path.win32.extname("file.ext\\"), ".ext");
    assert.strictEqual(path.win32.extname("file.ext\\\\"), ".ext");
    assert.strictEqual(path.win32.extname("file\\"), "");
    assert.strictEqual(path.win32.extname("file\\\\"), "");
    assert.strictEqual(path.win32.extname("file.\\"), ".");
    assert.strictEqual(path.win32.extname("file.\\\\"), ".");
    assert.strictEqual(path.posix.extname(".\\"), "");
    assert.strictEqual(path.posix.extname("..\\"), ".\\");
    assert.strictEqual(path.posix.extname("file.ext\\"), ".ext\\");
    assert.strictEqual(path.posix.extname("file.ext\\\\"), ".ext\\\\");
    assert.strictEqual(path.posix.extname("file\\"), "");
    assert.strictEqual(path.posix.extname("file\\\\"), "");
    assert.strictEqual(path.posix.extname("file.\\"), ".\\");
    assert.strictEqual(path.posix.extname("file.\\\\"), ".\\\\");
    assert.strictEqual(path.extname("far.boo"), ".boo");
    assert.strictEqual(path.extname("far.b"), ".b");
    assert.strictEqual(path.extname("far."), ".");
    assert.strictEqual(path.extname("far.boo/boo.far"), ".far");
    assert.strictEqual(path.extname("far.boo/boo"), "");
  });
  test("resolve", () => {
    const failures = [];
    const slashRE = /\//g;
    const backslashRE = /\\/g;
    const resolveTests = [
      [
        path.win32.resolve,
        // arguments                               result
        [
          [["c:/blah\\blah", "d:/games", "c:../a"], "c:\\blah\\a"],
          [["c:/ignore", "d:\\a/b\\c/d", "\\e.exe"], "d:\\e.exe"],
          [["c:/ignore", "c:/some/file"], "c:\\some\\file"],
          [["d:/ignore", "d:some/dir//"], "d:\\ignore\\some\\dir"],
          [["//server/share", "..", "relative\\"], "\\\\server\\share\\relative"],
          [["c:/", "//"], "c:\\"],
          [["c:/", "//dir"], "c:\\dir"],
          [["c:/", "//server/share"], "\\\\server\\share\\"],
          [["c:/", "//server//share"], "\\\\server\\share\\"],
          [["c:/", "///some//dir"], "c:\\some\\dir"],
          [
            ["C:\\foo\\tmp.3\\", "..\\tmp.3\\cycles\\root.js"],
            "C:\\foo\\tmp.3\\cycles\\root.js"
          ]
        ]
      ],
      [
        path.posix.resolve,
        // arguments                    result
        [
          [["/var/lib", "../", "file/"], "/var/file"],
          [["/var/lib", "/../", "file/"], "/file"],
          [["/some/dir", ".", "/absolute/"], "/absolute"],
          [["/foo/tmp.3/", "../tmp.3/cycles/root.js"], "/foo/tmp.3/cycles/root.js"]
        ]
      ],
      [
        isWeb ? path.posix.resolve : path.resolve,
        // arguments						result
        [
          [["."], process.cwd()],
          [["a/b/c", "../../.."], process.cwd()]
        ]
      ]
    ];
    resolveTests.forEach((test2) => {
      const resolve = test2[0];
      test2[1].forEach((test3) => {
        const actual = resolve.apply(null, test3[0]);
        let actualAlt;
        const os = resolve === path.win32.resolve ? "win32" : "posix";
        if (resolve === path.win32.resolve && !isWindows) {
          actualAlt = actual.replace(backslashRE, "/");
        } else if (resolve !== path.win32.resolve && isWindows) {
          actualAlt = actual.replace(slashRE, "\\");
        }
        const expected = test3[1];
        const message = `path.${os}.resolve(${test3[0].map(JSON.stringify).join(",")})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected && actualAlt !== expected) {
          failures.push(`
${message}`);
        }
      });
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
  });
  test("basename", () => {
    assert.strictEqual(path.basename(__filename), "path.test.js");
    assert.strictEqual(path.basename(__filename, ".js"), "path.test");
    assert.strictEqual(path.basename(".js", ".js"), "");
    assert.strictEqual(path.basename(""), "");
    assert.strictEqual(path.basename("/dir/basename.ext"), "basename.ext");
    assert.strictEqual(path.basename("/basename.ext"), "basename.ext");
    assert.strictEqual(path.basename("basename.ext"), "basename.ext");
    assert.strictEqual(path.basename("basename.ext/"), "basename.ext");
    assert.strictEqual(path.basename("basename.ext//"), "basename.ext");
    assert.strictEqual(path.basename("aaa/bbb", "/bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb", "a/bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb", "bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb//", "bbb"), "bbb");
    assert.strictEqual(path.basename("aaa/bbb", "bb"), "b");
    assert.strictEqual(path.basename("aaa/bbb", "b"), "bb");
    assert.strictEqual(path.basename("/aaa/bbb", "/bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb", "a/bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb", "bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb//", "bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/bbb", "bb"), "b");
    assert.strictEqual(path.basename("/aaa/bbb", "b"), "bb");
    assert.strictEqual(path.basename("/aaa/bbb"), "bbb");
    assert.strictEqual(path.basename("/aaa/"), "aaa");
    assert.strictEqual(path.basename("/aaa/b"), "b");
    assert.strictEqual(path.basename("/a/b"), "b");
    assert.strictEqual(path.basename("//a"), "a");
    assert.strictEqual(path.basename("a", "a"), "");
    assert.strictEqual(path.win32.basename("\\dir\\basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("\\basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("basename.ext\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("basename.ext\\\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("foo"), "foo");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "\\bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "a\\bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb\\\\\\\\", "bbb"), "bbb");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "bb"), "b");
    assert.strictEqual(path.win32.basename("aaa\\bbb", "b"), "bb");
    assert.strictEqual(path.win32.basename("C:"), "");
    assert.strictEqual(path.win32.basename("C:."), ".");
    assert.strictEqual(path.win32.basename("C:\\"), "");
    assert.strictEqual(path.win32.basename("C:\\dir\\base.ext"), "base.ext");
    assert.strictEqual(path.win32.basename("C:\\basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:basename.ext"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:basename.ext\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:basename.ext\\\\"), "basename.ext");
    assert.strictEqual(path.win32.basename("C:foo"), "foo");
    assert.strictEqual(path.win32.basename("file:stream"), "file:stream");
    assert.strictEqual(path.win32.basename("a", "a"), "");
    assert.strictEqual(
      path.posix.basename("\\dir\\basename.ext"),
      "\\dir\\basename.ext"
    );
    assert.strictEqual(path.posix.basename("\\basename.ext"), "\\basename.ext");
    assert.strictEqual(path.posix.basename("basename.ext"), "basename.ext");
    assert.strictEqual(path.posix.basename("basename.ext\\"), "basename.ext\\");
    assert.strictEqual(path.posix.basename("basename.ext\\\\"), "basename.ext\\\\");
    assert.strictEqual(path.posix.basename("foo"), "foo");
    const controlCharFilename = `Icon${String.fromCharCode(13)}`;
    assert.strictEqual(
      path.posix.basename(`/a/b/${controlCharFilename}`),
      controlCharFilename
    );
    assert.strictEqual(path.basename("foo/bar"), "bar");
    assert.strictEqual(path.posix.basename("foo\\bar"), "foo\\bar");
    assert.strictEqual(path.win32.basename("foo\\bar"), "bar");
    assert.strictEqual(path.basename("/foo/bar"), "bar");
    assert.strictEqual(path.posix.basename("\\foo\\bar"), "\\foo\\bar");
    assert.strictEqual(path.win32.basename("\\foo\\bar"), "bar");
    assert.strictEqual(path.basename("./bar"), "bar");
    assert.strictEqual(path.posix.basename(".\\bar"), ".\\bar");
    assert.strictEqual(path.win32.basename(".\\bar"), "bar");
    assert.strictEqual(path.basename("/bar"), "bar");
    assert.strictEqual(path.posix.basename("\\bar"), "\\bar");
    assert.strictEqual(path.win32.basename("\\bar"), "bar");
    assert.strictEqual(path.basename("bar/"), "bar");
    assert.strictEqual(path.posix.basename("bar\\"), "bar\\");
    assert.strictEqual(path.win32.basename("bar\\"), "bar");
    assert.strictEqual(path.basename("bar"), "bar");
    assert.strictEqual(path.basename("////////"), "");
    assert.strictEqual(path.posix.basename("\\\\\\\\"), "\\\\\\\\");
    assert.strictEqual(path.win32.basename("\\\\\\\\"), "");
  });
  test("relative", () => {
    const failures = [];
    const relativeTests = [
      [
        path.win32.relative,
        // arguments                     result
        [
          ["c:/blah\\blah", "d:/games", "d:\\games"],
          ["c:/aaaa/bbbb", "c:/aaaa", ".."],
          ["c:/aaaa/bbbb", "c:/cccc", "..\\..\\cccc"],
          ["c:/aaaa/bbbb", "c:/aaaa/bbbb", ""],
          ["c:/aaaa/bbbb", "c:/aaaa/cccc", "..\\cccc"],
          ["c:/aaaa/", "c:/aaaa/cccc", "cccc"],
          ["c:/", "c:\\aaaa\\bbbb", "aaaa\\bbbb"],
          ["c:/aaaa/bbbb", "d:\\", "d:\\"],
          ["c:/AaAa/bbbb", "c:/aaaa/bbbb", ""],
          ["c:/aaaaa/", "c:/aaaa/cccc", "..\\aaaa\\cccc"],
          ["C:\\foo\\bar\\baz\\quux", "C:\\", "..\\..\\..\\.."],
          ["C:\\foo\\test", "C:\\foo\\test\\bar\\package.json", "bar\\package.json"],
          ["C:\\foo\\bar\\baz-quux", "C:\\foo\\bar\\baz", "..\\baz"],
          ["C:\\foo\\bar\\baz", "C:\\foo\\bar\\baz-quux", "..\\baz-quux"],
          ["\\\\foo\\bar", "\\\\foo\\bar\\baz", "baz"],
          ["\\\\foo\\bar\\baz", "\\\\foo\\bar", ".."],
          ["\\\\foo\\bar\\baz-quux", "\\\\foo\\bar\\baz", "..\\baz"],
          ["\\\\foo\\bar\\baz", "\\\\foo\\bar\\baz-quux", "..\\baz-quux"],
          ["C:\\baz-quux", "C:\\baz", "..\\baz"],
          ["C:\\baz", "C:\\baz-quux", "..\\baz-quux"],
          ["\\\\foo\\baz-quux", "\\\\foo\\baz", "..\\baz"],
          ["\\\\foo\\baz", "\\\\foo\\baz-quux", "..\\baz-quux"],
          ["C:\\baz", "\\\\foo\\bar\\baz", "\\\\foo\\bar\\baz"],
          ["\\\\foo\\bar\\baz", "C:\\baz", "C:\\baz"]
        ]
      ],
      [
        path.posix.relative,
        // arguments          result
        [
          ["/var/lib", "/var", ".."],
          ["/var/lib", "/bin", "../../bin"],
          ["/var/lib", "/var/lib", ""],
          ["/var/lib", "/var/apache", "../apache"],
          ["/var/", "/var/lib", "lib"],
          ["/", "/var/lib", "var/lib"],
          ["/foo/test", "/foo/test/bar/package.json", "bar/package.json"],
          ["/Users/a/web/b/test/mails", "/Users/a/web/b", "../.."],
          ["/foo/bar/baz-quux", "/foo/bar/baz", "../baz"],
          ["/foo/bar/baz", "/foo/bar/baz-quux", "../baz-quux"],
          ["/baz-quux", "/baz", "../baz"],
          ["/baz", "/baz-quux", "../baz-quux"]
        ]
      ]
    ];
    relativeTests.forEach((test2) => {
      const relative = test2[0];
      test2[1].forEach((test3) => {
        const actual = relative(test3[0], test3[1]);
        const expected = test3[2];
        const os = relative === path.win32.relative ? "win32" : "posix";
        const message = `path.${os}.relative(${test3.slice(0, 2).map(JSON.stringify).join(",")})
  expect=${JSON.stringify(expected)}
  actual=${JSON.stringify(actual)}`;
        if (actual !== expected) {
          failures.push(`
${message}`);
        }
      });
    });
    assert.strictEqual(failures.length, 0, failures.join(""));
  });
  test("normalize", () => {
    assert.strictEqual(
      path.win32.normalize("./fixtures///b/../b/c.js"),
      "fixtures\\b\\c.js"
    );
    assert.strictEqual(path.win32.normalize("/foo/../../../bar"), "\\bar");
    assert.strictEqual(path.win32.normalize("a//b//../b"), "a\\b");
    assert.strictEqual(path.win32.normalize("a//b//./c"), "a\\b\\c");
    assert.strictEqual(path.win32.normalize("a//b//."), "a\\b");
    assert.strictEqual(
      path.win32.normalize("//server/share/dir/file.ext"),
      "\\\\server\\share\\dir\\file.ext"
    );
    assert.strictEqual(path.win32.normalize("/a/b/c/../../../x/y/z"), "\\x\\y\\z");
    assert.strictEqual(path.win32.normalize("C:"), "C:.");
    assert.strictEqual(path.win32.normalize("C:..\\abc"), "C:..\\abc");
    assert.strictEqual(
      path.win32.normalize("C:..\\..\\abc\\..\\def"),
      "C:..\\..\\def"
    );
    assert.strictEqual(path.win32.normalize("C:\\."), "C:\\");
    assert.strictEqual(path.win32.normalize("file:stream"), "file:stream");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\..\\"), "bar\\");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\.."), "bar");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\..\\baz"), "bar\\baz");
    assert.strictEqual(path.win32.normalize("bar\\foo..\\"), "bar\\foo..\\");
    assert.strictEqual(path.win32.normalize("bar\\foo.."), "bar\\foo..");
    assert.strictEqual(
      path.win32.normalize("..\\foo..\\..\\..\\bar"),
      "..\\..\\bar"
    );
    assert.strictEqual(
      path.win32.normalize("..\\...\\..\\.\\...\\..\\..\\bar"),
      "..\\..\\bar"
    );
    assert.strictEqual(
      path.win32.normalize("../../../foo/../../../bar"),
      "..\\..\\..\\..\\..\\bar"
    );
    assert.strictEqual(
      path.win32.normalize("../../../foo/../../../bar/../../"),
      "..\\..\\..\\..\\..\\..\\"
    );
    assert.strictEqual(
      path.win32.normalize("../foobar/barfoo/foo/../../../bar/../../"),
      "..\\..\\"
    );
    assert.strictEqual(
      path.win32.normalize("../.../../foobar/../../../bar/../../baz"),
      "..\\..\\..\\..\\baz"
    );
    assert.strictEqual(path.win32.normalize("foo/bar\\baz"), "foo\\bar\\baz");
    assert.strictEqual(
      path.posix.normalize("./fixtures///b/../b/c.js"),
      "fixtures/b/c.js"
    );
    assert.strictEqual(path.posix.normalize("/foo/../../../bar"), "/bar");
    assert.strictEqual(path.posix.normalize("a//b//../b"), "a/b");
    assert.strictEqual(path.posix.normalize("a//b//./c"), "a/b/c");
    assert.strictEqual(path.posix.normalize("a//b//."), "a/b");
    assert.strictEqual(path.posix.normalize("/a/b/c/../../../x/y/z"), "/x/y/z");
    assert.strictEqual(path.posix.normalize("///..//./foo/.//bar"), "/foo/bar");
    assert.strictEqual(path.posix.normalize("bar/foo../../"), "bar/");
    assert.strictEqual(path.posix.normalize("bar/foo../.."), "bar");
    assert.strictEqual(path.posix.normalize("bar/foo../../baz"), "bar/baz");
    assert.strictEqual(path.posix.normalize("bar/foo../"), "bar/foo../");
    assert.strictEqual(path.posix.normalize("bar/foo.."), "bar/foo..");
    assert.strictEqual(path.posix.normalize("../foo../../../bar"), "../../bar");
    assert.strictEqual(
      path.posix.normalize("../.../.././.../../../bar"),
      "../../bar"
    );
    assert.strictEqual(
      path.posix.normalize("../../../foo/../../../bar"),
      "../../../../../bar"
    );
    assert.strictEqual(
      path.posix.normalize("../../../foo/../../../bar/../../"),
      "../../../../../../"
    );
    assert.strictEqual(
      path.posix.normalize("../foobar/barfoo/foo/../../../bar/../../"),
      "../../"
    );
    assert.strictEqual(
      path.posix.normalize("../.../../foobar/../../../bar/../../baz"),
      "../../../../baz"
    );
    assert.strictEqual(path.posix.normalize("foo/bar\\baz"), "foo/bar\\baz");
  });
  test("isAbsolute", () => {
    assert.strictEqual(path.win32.isAbsolute("/"), true);
    assert.strictEqual(path.win32.isAbsolute("//"), true);
    assert.strictEqual(path.win32.isAbsolute("//server"), true);
    assert.strictEqual(path.win32.isAbsolute("//server/file"), true);
    assert.strictEqual(path.win32.isAbsolute("\\\\server\\file"), true);
    assert.strictEqual(path.win32.isAbsolute("\\\\server"), true);
    assert.strictEqual(path.win32.isAbsolute("\\\\"), true);
    assert.strictEqual(path.win32.isAbsolute("c"), false);
    assert.strictEqual(path.win32.isAbsolute("c:"), false);
    assert.strictEqual(path.win32.isAbsolute("c:\\"), true);
    assert.strictEqual(path.win32.isAbsolute("c:/"), true);
    assert.strictEqual(path.win32.isAbsolute("c://"), true);
    assert.strictEqual(path.win32.isAbsolute("C:/Users/"), true);
    assert.strictEqual(path.win32.isAbsolute("C:\\Users\\"), true);
    assert.strictEqual(path.win32.isAbsolute("C:cwd/another"), false);
    assert.strictEqual(path.win32.isAbsolute("C:cwd\\another"), false);
    assert.strictEqual(path.win32.isAbsolute("directory/directory"), false);
    assert.strictEqual(path.win32.isAbsolute("directory\\directory"), false);
    assert.strictEqual(path.posix.isAbsolute("/home/foo"), true);
    assert.strictEqual(path.posix.isAbsolute("/home/foo/.."), true);
    assert.strictEqual(path.posix.isAbsolute("bar/"), false);
    assert.strictEqual(path.posix.isAbsolute("./baz"), false);
    [
      "C:/",
      "C:\\",
      "C:/foo",
      "C:\\foo",
      "z:/foo/bar.txt",
      "z:\\foo\\bar.txt",
      "\\\\localhost\\c$\\foo",
      "/",
      "/foo"
    ].forEach((absolutePath) => {
      assert.ok(path.win32.isAbsolute(absolutePath), absolutePath);
    });
    [
      "/",
      "/foo",
      "/foo/bar.txt"
    ].forEach((absolutePath) => {
      assert.ok(path.posix.isAbsolute(absolutePath), absolutePath);
    });
    [
      "",
      "foo",
      "foo/bar",
      "./foo",
      "http://foo.com/bar"
    ].forEach((nonAbsolutePath) => {
      assert.ok(!path.win32.isAbsolute(nonAbsolutePath), nonAbsolutePath);
    });
    [
      "",
      "foo",
      "foo/bar",
      "./foo",
      "http://foo.com/bar",
      "z:/foo/bar.txt"
    ].forEach((nonAbsolutePath) => {
      assert.ok(!path.posix.isAbsolute(nonAbsolutePath), nonAbsolutePath);
    });
  });
  test("path", () => {
    assert.strictEqual(path.win32.sep, "\\");
    assert.strictEqual(path.posix.sep, "/");
    assert.strictEqual(path.win32.delimiter, ";");
    assert.strictEqual(path.posix.delimiter, ":");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXHBhdGgudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIE5PVEU6IFZTQ29kZSdzIGNvcHkgb2Ygbm9kZWpzIHBhdGggbGlicmFyeSB0byBiZSB1c2FibGUgaW4gY29tbW9uIChub24tbm9kZSkgbmFtZXNwYWNlXG4vLyBDb3BpZWQgZnJvbTogaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL3RyZWUvNDNkZDQ5Yzk3ODI4NDhjMjVlNWIwMzQ0OGM4YTBmOTIzZjEzYzE1OFxuXG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dlYiwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHByb2Nlc3MgZnJvbSAnLi4vLi4vY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbnN1aXRlKCdQYXRocyAoTm9kZSBJbXBsZW1lbnRhdGlvbiknLCAoKSA9PiB7XG5cdGNvbnN0IF9fZmlsZW5hbWUgPSAncGF0aC50ZXN0LmpzJztcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlc3QoJ2pvaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmFpbHVyZXMgPSBbXSBhcyBzdHJpbmdbXTtcblx0XHRjb25zdCBiYWNrc2xhc2hSRSA9IC9cXFxcL2c7XG5cblx0XHRjb25zdCBqb2luVGVzdHM6IGFueSA9IFtcblx0XHRcdFtbcGF0aC5wb3NpeC5qb2luLCBwYXRoLndpbjMyLmpvaW5dLFxuXHRcdFx0Ly8gYXJndW1lbnRzICAgICAgICAgICAgICAgICAgICAgcmVzdWx0XG5cdFx0XHRbW1snLicsICd4L2InLCAnLi4nLCAnL2IvYy5qcyddLCAneC9iL2MuanMnXSxcblx0XHRcdFtbXSwgJy4nXSxcblx0XHRcdFtbJy8uJywgJ3gvYicsICcuLicsICcvYi9jLmpzJ10sICcveC9iL2MuanMnXSxcblx0XHRcdFtbJy9mb28nLCAnLi4vLi4vLi4vYmFyJ10sICcvYmFyJ10sXG5cdFx0XHRbWydmb28nLCAnLi4vLi4vLi4vYmFyJ10sICcuLi8uLi9iYXInXSxcblx0XHRcdFtbJ2Zvby8nLCAnLi4vLi4vLi4vYmFyJ10sICcuLi8uLi9iYXInXSxcblx0XHRcdFtbJ2Zvby94JywgJy4uLy4uLy4uL2JhciddLCAnLi4vYmFyJ10sXG5cdFx0XHRbWydmb28veCcsICcuL2JhciddLCAnZm9vL3gvYmFyJ10sXG5cdFx0XHRbWydmb28veC8nLCAnLi9iYXInXSwgJ2Zvby94L2JhciddLFxuXHRcdFx0W1snZm9vL3gvJywgJy4nLCAnYmFyJ10sICdmb28veC9iYXInXSxcblx0XHRcdFtbJy4vJ10sICcuLyddLFxuXHRcdFx0W1snLicsICcuLyddLCAnLi8nXSxcblx0XHRcdFtbJy4nLCAnLicsICcuJ10sICcuJ10sXG5cdFx0XHRbWycuJywgJy4vJywgJy4nXSwgJy4nXSxcblx0XHRcdFtbJy4nLCAnLy4vJywgJy4nXSwgJy4nXSxcblx0XHRcdFtbJy4nLCAnLy8vLy8uLycsICcuJ10sICcuJ10sXG5cdFx0XHRbWycuJ10sICcuJ10sXG5cdFx0XHRbWycnLCAnLiddLCAnLiddLFxuXHRcdFx0W1snJywgJ2ZvbyddLCAnZm9vJ10sXG5cdFx0XHRbWydmb28nLCAnL2JhciddLCAnZm9vL2JhciddLFxuXHRcdFx0W1snJywgJy9mb28nXSwgJy9mb28nXSxcblx0XHRcdFtbJycsICcnLCAnL2ZvbyddLCAnL2ZvbyddLFxuXHRcdFx0W1snJywgJycsICdmb28nXSwgJ2ZvbyddLFxuXHRcdFx0W1snZm9vJywgJyddLCAnZm9vJ10sXG5cdFx0XHRbWydmb28vJywgJyddLCAnZm9vLyddLFxuXHRcdFx0W1snZm9vJywgJycsICcvYmFyJ10sICdmb28vYmFyJ10sXG5cdFx0XHRbWycuLycsICcuLicsICcvZm9vJ10sICcuLi9mb28nXSxcblx0XHRcdFtbJy4vJywgJy4uJywgJy4uJywgJy9mb28nXSwgJy4uLy4uL2ZvbyddLFxuXHRcdFx0W1snLicsICcuLicsICcuLicsICcvZm9vJ10sICcuLi8uLi9mb28nXSxcblx0XHRcdFtbJycsICcuLicsICcuLicsICcvZm9vJ10sICcuLi8uLi9mb28nXSxcblx0XHRcdFtbJy8nXSwgJy8nXSxcblx0XHRcdFtbJy8nLCAnLiddLCAnLyddLFxuXHRcdFx0W1snLycsICcuLiddLCAnLyddLFxuXHRcdFx0W1snLycsICcuLicsICcuLiddLCAnLyddLFxuXHRcdFx0W1snJ10sICcuJ10sXG5cdFx0XHRbWycnLCAnJ10sICcuJ10sXG5cdFx0XHRbWycgL2ZvbyddLCAnIC9mb28nXSxcblx0XHRcdFtbJyAnLCAnZm9vJ10sICcgL2ZvbyddLFxuXHRcdFx0W1snICcsICcuJ10sICcgJ10sXG5cdFx0XHRbWycgJywgJy8nXSwgJyAvJ10sXG5cdFx0XHRbWycgJywgJyddLCAnICddLFxuXHRcdFx0W1snLycsICdmb28nXSwgJy9mb28nXSxcblx0XHRcdFtbJy8nLCAnL2ZvbyddLCAnL2ZvbyddLFxuXHRcdFx0W1snLycsICcvL2ZvbyddLCAnL2ZvbyddLFxuXHRcdFx0W1snLycsICcnLCAnL2ZvbyddLCAnL2ZvbyddLFxuXHRcdFx0W1snJywgJy8nLCAnZm9vJ10sICcvZm9vJ10sXG5cdFx0XHRbWycnLCAnLycsICcvZm9vJ10sICcvZm9vJ11cblx0XHRcdF1cblx0XHRcdF1cblx0XHRdO1xuXG5cdFx0Ly8gV2luZG93cy1zcGVjaWZpYyBqb2luIHRlc3RzXG5cdFx0am9pblRlc3RzLnB1c2goW1xuXHRcdFx0cGF0aC53aW4zMi5qb2luLFxuXHRcdFx0am9pblRlc3RzWzBdWzFdLnNsaWNlKDApLmNvbmNhdChcblx0XHRcdFx0Wy8vIGFyZ3VtZW50cyAgICAgICAgICAgICAgICAgICAgIHJlc3VsdFxuXHRcdFx0XHRcdC8vIFVOQyBwYXRoIGV4cGVjdGVkXG5cdFx0XHRcdFx0W1snLy9mb28vYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0W1snXFxcXC9mb28vYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0W1snXFxcXFxcXFxmb28vYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0Ly8gVU5DIHBhdGggZXhwZWN0ZWQgLSBzZXJ2ZXIgYW5kIHNoYXJlIHNlcGFyYXRlXG5cdFx0XHRcdFx0W1snLy9mb28nLCAnYmFyJ10sICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcJ10sXG5cdFx0XHRcdFx0W1snLy9mb28vJywgJ2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdFtbJy8vZm9vJywgJy9iYXInXSwgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFwnXSxcblx0XHRcdFx0XHQvLyBVTkMgcGF0aCBleHBlY3RlZCAtIHF1ZXN0aW9uYWJsZVxuXHRcdFx0XHRcdFtbJy8vZm9vJywgJycsICdiYXInXSwgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFwnXSxcblx0XHRcdFx0XHRbWycvL2Zvby8nLCAnJywgJ2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdFtbJy8vZm9vLycsICcnLCAnL2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdC8vIFVOQyBwYXRoIGV4cGVjdGVkIC0gZXZlbiBtb3JlIHF1ZXN0aW9uYWJsZVxuXHRcdFx0XHRcdFtbJycsICcvL2ZvbycsICdiYXInXSwgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFwnXSxcblx0XHRcdFx0XHRbWycnLCAnLy9mb28vJywgJ2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdFtbJycsICcvL2Zvby8nLCAnL2JhciddLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXCddLFxuXHRcdFx0XHRcdC8vIE5vIFVOQyBwYXRoIGV4cGVjdGVkIChubyBkb3VibGUgc2xhc2ggaW4gZmlyc3QgY29tcG9uZW50KVxuXHRcdFx0XHRcdFtbJ1xcXFwnLCAnZm9vL2JhciddLCAnXFxcXGZvb1xcXFxiYXInXSxcblx0XHRcdFx0XHRbWydcXFxcJywgJy9mb28vYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdFtbJycsICcvJywgJy9mb28vYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdC8vIE5vIFVOQyBwYXRoIGV4cGVjdGVkIChubyBub24tc2xhc2hlcyBpbiBmaXJzdCBjb21wb25lbnQgLVxuXHRcdFx0XHRcdC8vIHF1ZXN0aW9uYWJsZSlcblx0XHRcdFx0XHRbWycvLycsICdmb28vYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdFtbJy8vJywgJy9mb28vYmFyJ10sICdcXFxcZm9vXFxcXGJhciddLFxuXHRcdFx0XHRcdFtbJ1xcXFxcXFxcJywgJy8nLCAnL2Zvby9iYXInXSwgJ1xcXFxmb29cXFxcYmFyJ10sXG5cdFx0XHRcdFx0W1snLy8nXSwgJ1xcXFwnXSxcblx0XHRcdFx0XHQvLyBObyBVTkMgcGF0aCBleHBlY3RlZCAoc2hhcmUgbmFtZSBtaXNzaW5nIC0gcXVlc3Rpb25hYmxlKS5cblx0XHRcdFx0XHRbWycvL2ZvbyddLCAnXFxcXGZvbyddLFxuXHRcdFx0XHRcdFtbJy8vZm9vLyddLCAnXFxcXGZvb1xcXFwnXSxcblx0XHRcdFx0XHRbWycvL2ZvbycsICcvJ10sICdcXFxcZm9vXFxcXCddLFxuXHRcdFx0XHRcdFtbJy8vZm9vJywgJycsICcvJ10sICdcXFxcZm9vXFxcXCddLFxuXHRcdFx0XHRcdC8vIE5vIFVOQyBwYXRoIGV4cGVjdGVkICh0b28gbWFueSBsZWFkaW5nIHNsYXNoZXMgLSBxdWVzdGlvbmFibGUpXG5cdFx0XHRcdFx0W1snLy8vZm9vL2JhciddLCAnXFxcXGZvb1xcXFxiYXInXSxcblx0XHRcdFx0XHRbWycvLy8vZm9vJywgJ2JhciddLCAnXFxcXGZvb1xcXFxiYXInXSxcblx0XHRcdFx0XHRbWydcXFxcXFxcXFxcXFwvZm9vL2JhciddLCAnXFxcXGZvb1xcXFxiYXInXSxcblx0XHRcdFx0XHQvLyBEcml2ZS1yZWxhdGl2ZSB2cyBkcml2ZS1hYnNvbHV0ZSBwYXRocy4gVGhpcyBtZXJlbHkgZGVzY3JpYmVzIHRoZVxuXHRcdFx0XHRcdC8vIHN0YXR1cyBxdW8sIHJhdGhlciB0aGFuIGJlaW5nIG9idmlvdXNseSByaWdodFxuXHRcdFx0XHRcdFtbJ2M6J10sICdjOi4nXSxcblx0XHRcdFx0XHRbWydjOi4nXSwgJ2M6LiddLFxuXHRcdFx0XHRcdFtbJ2M6JywgJyddLCAnYzouJ10sXG5cdFx0XHRcdFx0W1snJywgJ2M6J10sICdjOi4nXSxcblx0XHRcdFx0XHRbWydjOi4nLCAnLyddLCAnYzouXFxcXCddLFxuXHRcdFx0XHRcdFtbJ2M6LicsICdmaWxlJ10sICdjOmZpbGUnXSxcblx0XHRcdFx0XHRbWydjOicsICcvJ10sICdjOlxcXFwnXSxcblx0XHRcdFx0XHRbWydjOicsICdmaWxlJ10sICdjOlxcXFxmaWxlJ11cblx0XHRcdFx0XVxuXHRcdFx0KVxuXHRcdF0pO1xuXHRcdGpvaW5UZXN0cy5mb3JFYWNoKCh0ZXN0OiBhbnlbXSkgPT4ge1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHRlc3RbMF0pKSB7XG5cdFx0XHRcdHRlc3RbMF0gPSBbdGVzdFswXV07XG5cdFx0XHR9XG5cdFx0XHR0ZXN0WzBdLmZvckVhY2goKGpvaW46IGFueSkgPT4ge1xuXHRcdFx0XHR0ZXN0WzFdLmZvckVhY2goKHRlc3Q6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjdHVhbCA9IGpvaW4uYXBwbHkobnVsbCwgdGVzdFswXSk7XG5cdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSB0ZXN0WzFdO1xuXHRcdFx0XHRcdC8vIEZvciBub24tV2luZG93cyBzcGVjaWZpYyB0ZXN0cyB3aXRoIHRoZSBXaW5kb3dzIGpvaW4oKSwgd2UgbmVlZCB0byB0cnlcblx0XHRcdFx0XHQvLyByZXBsYWNpbmcgdGhlIHNsYXNoZXMgc2luY2UgdGhlIG5vbi1XaW5kb3dzIHNwZWNpZmljIHRlc3RzJyBgZXhwZWN0ZWRgXG5cdFx0XHRcdFx0Ly8gdXNlIGZvcndhcmQgc2xhc2hlc1xuXHRcdFx0XHRcdGxldCBhY3R1YWxBbHQ7XG5cdFx0XHRcdFx0bGV0IG9zO1xuXHRcdFx0XHRcdGlmIChqb2luID09PSBwYXRoLndpbjMyLmpvaW4pIHtcblx0XHRcdFx0XHRcdGFjdHVhbEFsdCA9IGFjdHVhbC5yZXBsYWNlKGJhY2tzbGFzaFJFLCAnLycpO1xuXHRcdFx0XHRcdFx0b3MgPSAnd2luMzInO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRvcyA9ICdwb3NpeCc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPVxuXHRcdFx0XHRcdFx0YHBhdGguJHtvc30uam9pbigke3Rlc3RbMF0ubWFwKEpTT04uc3RyaW5naWZ5KS5qb2luKCcsJyl9KVxcbiAgZXhwZWN0PSR7SlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpfVxcbiAgYWN0dWFsPSR7SlNPTi5zdHJpbmdpZnkoYWN0dWFsKX1gO1xuXHRcdFx0XHRcdGlmIChhY3R1YWwgIT09IGV4cGVjdGVkICYmIGFjdHVhbEFsdCAhPT0gZXhwZWN0ZWQpIHtcblx0XHRcdFx0XHRcdGZhaWx1cmVzLnB1c2goYFxcbiR7bWVzc2FnZX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhaWx1cmVzLmxlbmd0aCwgMCwgZmFpbHVyZXMuam9pbignJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXJuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmRpcm5hbWUoJy9hL2IvJyksICcvYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmRpcm5hbWUoJy9hL2InKSwgJy9hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZGlybmFtZSgnL2EnKSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5kaXJuYW1lKCcnKSwgJy4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5kaXJuYW1lKCcvJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZGlybmFtZSgnLy8vLycpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmRpcm5hbWUoJy8vYScpLCAnLy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5kaXJuYW1lKCdmb28nKSwgJy4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2M6XFxcXCcpLCAnYzpcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzpcXFxcZm9vJyksICdjOlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOlxcXFxmb29cXFxcJyksICdjOlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOlxcXFxmb29cXFxcYmFyJyksICdjOlxcXFxmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOlxcXFxmb29cXFxcYmFyXFxcXCcpLCAnYzpcXFxcZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzpcXFxcZm9vXFxcXGJhclxcXFxiYXonKSwgJ2M6XFxcXGZvb1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcJyksICdcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnXFxcXGZvbycpLCAnXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFxmb29cXFxcJyksICdcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnXFxcXGZvb1xcXFxiYXInKSwgJ1xcXFxmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcZm9vXFxcXGJhclxcXFwnKSwgJ1xcXFxmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcZm9vXFxcXGJhclxcXFxiYXonKSwgJ1xcXFxmb29cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzonKSwgJ2M6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzpmb28nKSwgJ2M6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnYzpmb29cXFxcJyksICdjOicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2M6Zm9vXFxcXGJhcicpLCAnYzpmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdjOmZvb1xcXFxiYXJcXFxcJyksICdjOmZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2M6Zm9vXFxcXGJhclxcXFxiYXonKSwgJ2M6Zm9vXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2ZpbGU6c3RyZWFtJyksICcuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnZGlyXFxcXGZpbGU6c3RyZWFtJyksICdkaXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcXFxcXHVuY1xcXFxzaGFyZScpLFxuXHRcdFx0J1xcXFxcXFxcdW5jXFxcXHNoYXJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcZm9vJyksXG5cdFx0XHQnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcZm9vXFxcXCcpLFxuXHRcdFx0J1xcXFxcXFxcdW5jXFxcXHNoYXJlXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFxcXFxcdW5jXFxcXHNoYXJlXFxcXGZvb1xcXFxiYXInKSxcblx0XHRcdCdcXFxcXFxcXHVuY1xcXFxzaGFyZVxcXFxmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCdcXFxcXFxcXHVuY1xcXFxzaGFyZVxcXFxmb29cXFxcYmFyXFxcXCcpLFxuXHRcdFx0J1xcXFxcXFxcdW5jXFxcXHNoYXJlXFxcXGZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ1xcXFxcXFxcdW5jXFxcXHNoYXJlXFxcXGZvb1xcXFxiYXJcXFxcYmF6JyksXG5cdFx0XHQnXFxcXFxcXFx1bmNcXFxcc2hhcmVcXFxcZm9vXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJy9hL2IvJyksICcvYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJy9hL2InKSwgJy9hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnL2EnKSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCcnKSwgJy4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5kaXJuYW1lKCcvJyksICcvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGlybmFtZSgnLy8vLycpLCAnLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmRpcm5hbWUoJ2ZvbycpLCAnLicpO1xuXG5cdFx0Ly8gVGVzdHMgZnJvbSBWU0NvZGVcblxuXHRcdGZ1bmN0aW9uIGFzc2VydERpcm5hbWUocDogc3RyaW5nLCBleHBlY3RlZDogc3RyaW5nLCB3aW4gPSBmYWxzZSkge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gd2luID8gcGF0aC53aW4zMi5kaXJuYW1lKHApIDogcGF0aC5wb3NpeC5kaXJuYW1lKHApO1xuXG5cdFx0XHRpZiAoYWN0dWFsICE9PSBleHBlY3RlZCkge1xuXHRcdFx0XHRhc3NlcnQuZmFpbChgJHtwfTogZXhwZWN0ZWQ6ICR7ZXhwZWN0ZWR9LCBvdXJzOiAke2FjdHVhbH1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhc3NlcnREaXJuYW1lKCdmb28vYmFyJywgJ2ZvbycpO1xuXHRcdGFzc2VydERpcm5hbWUoJ2Zvb1xcXFxiYXInLCAnZm9vJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnL2Zvby9iYXInLCAnL2ZvbycpO1xuXHRcdGFzc2VydERpcm5hbWUoJ1xcXFxmb29cXFxcYmFyJywgJ1xcXFxmb28nLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCcvZm9vJywgJy8nKTtcblx0XHRhc3NlcnREaXJuYW1lKCdcXFxcZm9vJywgJ1xcXFwnLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCcvJywgJy8nKTtcblx0XHRhc3NlcnREaXJuYW1lKCdcXFxcJywgJ1xcXFwnLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCdmb28nLCAnLicpO1xuXHRcdGFzc2VydERpcm5hbWUoJ2YnLCAnLicpO1xuXHRcdGFzc2VydERpcm5hbWUoJ2YvJywgJy4nKTtcblx0XHRhc3NlcnREaXJuYW1lKCcvZm9sZGVyLycsICcvJyk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnYzpcXFxcc29tZVxcXFxmaWxlLnR4dCcsICdjOlxcXFxzb21lJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnYzpcXFxcc29tZScsICdjOlxcXFwnLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCdjOlxcXFwnLCAnYzpcXFxcJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnYzonLCAnYzonLCB0cnVlKTtcblx0XHRhc3NlcnREaXJuYW1lKCdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFxzb21lXFxcXHBhdGgnLCAnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcc29tZScsIHRydWUpO1xuXHRcdGFzc2VydERpcm5hbWUoJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXHNvbWUnLCAnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0RGlybmFtZSgnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcJywgJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXCcsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRuYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZhaWx1cmVzID0gW10gYXMgc3RyaW5nW107XG5cdFx0Y29uc3Qgc2xhc2hSRSA9IC9cXC8vZztcblxuXHRcdFtcblx0XHRcdFtfX2ZpbGVuYW1lLCAnLmpzJ10sXG5cdFx0XHRbJycsICcnXSxcblx0XHRcdFsnL3BhdGgvdG8vZmlsZScsICcnXSxcblx0XHRcdFsnL3BhdGgvdG8vZmlsZS5leHQnLCAnLmV4dCddLFxuXHRcdFx0WycvcGF0aC50by9maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy9wYXRoLnRvL2ZpbGUnLCAnJ10sXG5cdFx0XHRbJy9wYXRoLnRvLy5maWxlJywgJyddLFxuXHRcdFx0WycvcGF0aC50by8uZmlsZS5leHQnLCAnLmV4dCddLFxuXHRcdFx0WycvcGF0aC90by9mLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy9wYXRoL3RvLy4uZXh0JywgJy5leHQnXSxcblx0XHRcdFsnL3BhdGgvdG8vLi4nLCAnJ10sXG5cdFx0XHRbJ2ZpbGUnLCAnJ10sXG5cdFx0XHRbJ2ZpbGUuZXh0JywgJy5leHQnXSxcblx0XHRcdFsnLmZpbGUnLCAnJ10sXG5cdFx0XHRbJy5maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy9maWxlJywgJyddLFxuXHRcdFx0WycvZmlsZS5leHQnLCAnLmV4dCddLFxuXHRcdFx0WycvLmZpbGUnLCAnJ10sXG5cdFx0XHRbJy8uZmlsZS5leHQnLCAnLmV4dCddLFxuXHRcdFx0WycucGF0aC9maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJ2ZpbGUuZXh0LmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJ2ZpbGUuJywgJy4nXSxcblx0XHRcdFsnLicsICcnXSxcblx0XHRcdFsnLi8nLCAnJ10sXG5cdFx0XHRbJy5maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy5maWxlJywgJyddLFxuXHRcdFx0WycuZmlsZS4nLCAnLiddLFxuXHRcdFx0WycuZmlsZS4uJywgJy4nXSxcblx0XHRcdFsnLi4nLCAnJ10sXG5cdFx0XHRbJy4uLycsICcnXSxcblx0XHRcdFsnLi5maWxlLmV4dCcsICcuZXh0J10sXG5cdFx0XHRbJy4uZmlsZScsICcuZmlsZSddLFxuXHRcdFx0WycuLmZpbGUuJywgJy4nXSxcblx0XHRcdFsnLi5maWxlLi4nLCAnLiddLFxuXHRcdFx0WycuLi4nLCAnLiddLFxuXHRcdFx0WycuLi5leHQnLCAnLmV4dCddLFxuXHRcdFx0WycuLi4uJywgJy4nXSxcblx0XHRcdFsnZmlsZS5leHQvJywgJy5leHQnXSxcblx0XHRcdFsnZmlsZS5leHQvLycsICcuZXh0J10sXG5cdFx0XHRbJ2ZpbGUvJywgJyddLFxuXHRcdFx0WydmaWxlLy8nLCAnJ10sXG5cdFx0XHRbJ2ZpbGUuLycsICcuJ10sXG5cdFx0XHRbJ2ZpbGUuLy8nLCAnLiddLFxuXHRcdF0uZm9yRWFjaCgodGVzdCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSB0ZXN0WzFdO1xuXHRcdFx0W3BhdGgucG9zaXguZXh0bmFtZSwgcGF0aC53aW4zMi5leHRuYW1lXS5mb3JFYWNoKChleHRuYW1lKSA9PiB7XG5cdFx0XHRcdGxldCBpbnB1dCA9IHRlc3RbMF07XG5cdFx0XHRcdGxldCBvcztcblx0XHRcdFx0aWYgKGV4dG5hbWUgPT09IHBhdGgud2luMzIuZXh0bmFtZSkge1xuXHRcdFx0XHRcdGlucHV0ID0gaW5wdXQucmVwbGFjZShzbGFzaFJFLCAnXFxcXCcpO1xuXHRcdFx0XHRcdG9zID0gJ3dpbjMyJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvcyA9ICdwb3NpeCc7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gZXh0bmFtZShpbnB1dCk7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBgcGF0aC4ke29zfS5leHRuYW1lKCR7SlNPTi5zdHJpbmdpZnkoaW5wdXQpfSlcXG4gIGV4cGVjdD0ke0pTT04uc3RyaW5naWZ5KGV4cGVjdGVkKX1cXG4gIGFjdHVhbD0ke0pTT04uc3RyaW5naWZ5KGFjdHVhbCl9YDtcblx0XHRcdFx0aWYgKGFjdHVhbCAhPT0gZXhwZWN0ZWQpIHtcblx0XHRcdFx0XHRmYWlsdXJlcy5wdXNoKGBcXG4ke21lc3NhZ2V9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBpbnB1dCA9IGBDOiR7dGVzdFswXS5yZXBsYWNlKHNsYXNoUkUsICdcXFxcJyl9YDtcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gcGF0aC53aW4zMi5leHRuYW1lKGlucHV0KTtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBwYXRoLndpbjMyLmV4dG5hbWUoJHtKU09OLnN0cmluZ2lmeShpbnB1dCl9KVxcbiAgZXhwZWN0PSR7SlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWQpfVxcbiAgYWN0dWFsPSR7SlNPTi5zdHJpbmdpZnkoYWN0dWFsKX1gO1xuXHRcdFx0XHRpZiAoYWN0dWFsICE9PSBleHBlY3RlZCkge1xuXHRcdFx0XHRcdGZhaWx1cmVzLnB1c2goYFxcbiR7bWVzc2FnZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWlsdXJlcy5sZW5ndGgsIDAsIGZhaWx1cmVzLmpvaW4oJycpKTtcblxuXHRcdC8vIE9uIFdpbmRvd3MsIGJhY2tzbGFzaCBpcyBhIHBhdGggc2VwYXJhdG9yLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmV4dG5hbWUoJy5cXFxcJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5leHRuYW1lKCcuLlxcXFwnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmV4dG5hbWUoJ2ZpbGUuZXh0XFxcXCcpLCAnLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmV4dG5hbWUoJ2ZpbGUuZXh0XFxcXFxcXFwnKSwgJy5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5leHRuYW1lKCdmaWxlXFxcXCcpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZXh0bmFtZSgnZmlsZVxcXFxcXFxcJyksICcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5leHRuYW1lKCdmaWxlLlxcXFwnKSwgJy4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5leHRuYW1lKCdmaWxlLlxcXFxcXFxcJyksICcuJyk7XG5cblx0XHQvLyBPbiAqbml4LCBiYWNrc2xhc2ggaXMgYSB2YWxpZCBuYW1lIGNvbXBvbmVudCBsaWtlIGFueSBvdGhlciBjaGFyYWN0ZXIuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZXh0bmFtZSgnLlxcXFwnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmV4dG5hbWUoJy4uXFxcXCcpLCAnLlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5leHRuYW1lKCdmaWxlLmV4dFxcXFwnKSwgJy5leHRcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZXh0bmFtZSgnZmlsZS5leHRcXFxcXFxcXCcpLCAnLmV4dFxcXFxcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZXh0bmFtZSgnZmlsZVxcXFwnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmV4dG5hbWUoJ2ZpbGVcXFxcXFxcXCcpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZXh0bmFtZSgnZmlsZS5cXFxcJyksICcuXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmV4dG5hbWUoJ2ZpbGUuXFxcXFxcXFwnKSwgJy5cXFxcXFxcXCcpO1xuXG5cdFx0Ly8gVGVzdHMgZnJvbSBWU0NvZGVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5leHRuYW1lKCdmYXIuYm9vJyksICcuYm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguZXh0bmFtZSgnZmFyLmInKSwgJy5iJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguZXh0bmFtZSgnZmFyLicpLCAnLicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmV4dG5hbWUoJ2Zhci5ib28vYm9vLmZhcicpLCAnLmZhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmV4dG5hbWUoJ2Zhci5ib28vYm9vJyksICcnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZScsICgpID0+IHtcblx0XHRjb25zdCBmYWlsdXJlcyA9IFtdIGFzIHN0cmluZ1tdO1xuXHRcdGNvbnN0IHNsYXNoUkUgPSAvXFwvL2c7XG5cdFx0Y29uc3QgYmFja3NsYXNoUkUgPSAvXFxcXC9nO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZVRlc3RzID0gW1xuXHRcdFx0W3BhdGgud2luMzIucmVzb2x2ZSxcblx0XHRcdC8vIGFyZ3VtZW50cyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN1bHRcblx0XHRcdFtbWydjOi9ibGFoXFxcXGJsYWgnLCAnZDovZ2FtZXMnLCAnYzouLi9hJ10sICdjOlxcXFxibGFoXFxcXGEnXSxcblx0XHRcdFtbJ2M6L2lnbm9yZScsICdkOlxcXFxhL2JcXFxcYy9kJywgJ1xcXFxlLmV4ZSddLCAnZDpcXFxcZS5leGUnXSxcblx0XHRcdFtbJ2M6L2lnbm9yZScsICdjOi9zb21lL2ZpbGUnXSwgJ2M6XFxcXHNvbWVcXFxcZmlsZSddLFxuXHRcdFx0W1snZDovaWdub3JlJywgJ2Q6c29tZS9kaXIvLyddLCAnZDpcXFxcaWdub3JlXFxcXHNvbWVcXFxcZGlyJ10sXG5cdFx0XHRbWycvL3NlcnZlci9zaGFyZScsICcuLicsICdyZWxhdGl2ZVxcXFwnXSwgJ1xcXFxcXFxcc2VydmVyXFxcXHNoYXJlXFxcXHJlbGF0aXZlJ10sXG5cdFx0XHRbWydjOi8nLCAnLy8nXSwgJ2M6XFxcXCddLFxuXHRcdFx0W1snYzovJywgJy8vZGlyJ10sICdjOlxcXFxkaXInXSxcblx0XHRcdFtbJ2M6LycsICcvL3NlcnZlci9zaGFyZSddLCAnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcJ10sXG5cdFx0XHRbWydjOi8nLCAnLy9zZXJ2ZXIvL3NoYXJlJ10sICdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFwnXSxcblx0XHRcdFtbJ2M6LycsICcvLy9zb21lLy9kaXInXSwgJ2M6XFxcXHNvbWVcXFxcZGlyJ10sXG5cdFx0XHRbWydDOlxcXFxmb29cXFxcdG1wLjNcXFxcJywgJy4uXFxcXHRtcC4zXFxcXGN5Y2xlc1xcXFxyb290LmpzJ10sXG5cdFx0XHRcdCdDOlxcXFxmb29cXFxcdG1wLjNcXFxcY3ljbGVzXFxcXHJvb3QuanMnXVxuXHRcdFx0XVxuXHRcdFx0XSxcblx0XHRcdFtwYXRoLnBvc2l4LnJlc29sdmUsXG5cdFx0XHQvLyBhcmd1bWVudHMgICAgICAgICAgICAgICAgICAgIHJlc3VsdFxuXHRcdFx0W1tbJy92YXIvbGliJywgJy4uLycsICdmaWxlLyddLCAnL3Zhci9maWxlJ10sXG5cdFx0XHRbWycvdmFyL2xpYicsICcvLi4vJywgJ2ZpbGUvJ10sICcvZmlsZSddLFxuXHRcdFx0W1snL3NvbWUvZGlyJywgJy4nLCAnL2Fic29sdXRlLyddLCAnL2Fic29sdXRlJ10sXG5cdFx0XHRbWycvZm9vL3RtcC4zLycsICcuLi90bXAuMy9jeWNsZXMvcm9vdC5qcyddLCAnL2Zvby90bXAuMy9jeWNsZXMvcm9vdC5qcyddXG5cdFx0XHRdXG5cdFx0XHRdLFxuXHRcdFx0Wyhpc1dlYiA/IHBhdGgucG9zaXgucmVzb2x2ZSA6IHBhdGgucmVzb2x2ZSksXG5cdFx0XHQvLyBhcmd1bWVudHNcdFx0XHRcdFx0XHRyZXN1bHRcblx0XHRcdFtbWycuJ10sIHByb2Nlc3MuY3dkKCldLFxuXHRcdFx0W1snYS9iL2MnLCAnLi4vLi4vLi4nXSwgcHJvY2Vzcy5jd2QoKV1cblx0XHRcdF1cblx0XHRcdF0sXG5cdFx0XTtcblx0XHRyZXNvbHZlVGVzdHMuZm9yRWFjaCgodGVzdCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZSA9IHRlc3RbMF07XG5cdFx0XHQvL0B0cy1leHBlY3QtZXJyb3Jcblx0XHRcdHRlc3RbMV0uZm9yRWFjaCgodGVzdCkgPT4ge1xuXHRcdFx0XHQvL0B0cy1leHBlY3QtZXJyb3Jcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gcmVzb2x2ZS5hcHBseShudWxsLCB0ZXN0WzBdKTtcblx0XHRcdFx0bGV0IGFjdHVhbEFsdDtcblx0XHRcdFx0Y29uc3Qgb3MgPSByZXNvbHZlID09PSBwYXRoLndpbjMyLnJlc29sdmUgPyAnd2luMzInIDogJ3Bvc2l4Jztcblx0XHRcdFx0aWYgKHJlc29sdmUgPT09IHBhdGgud2luMzIucmVzb2x2ZSAmJiAhaXNXaW5kb3dzKSB7XG5cdFx0XHRcdFx0YWN0dWFsQWx0ID0gYWN0dWFsLnJlcGxhY2UoYmFja3NsYXNoUkUsICcvJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAocmVzb2x2ZSAhPT0gcGF0aC53aW4zMi5yZXNvbHZlICYmIGlzV2luZG93cykge1xuXHRcdFx0XHRcdGFjdHVhbEFsdCA9IGFjdHVhbC5yZXBsYWNlKHNsYXNoUkUsICdcXFxcJyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IHRlc3RbMV07XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPVxuXHRcdFx0XHRcdGBwYXRoLiR7b3N9LnJlc29sdmUoJHt0ZXN0WzBdLm1hcChKU09OLnN0cmluZ2lmeSkuam9pbignLCcpfSlcXG4gIGV4cGVjdD0ke0pTT04uc3RyaW5naWZ5KGV4cGVjdGVkKX1cXG4gIGFjdHVhbD0ke0pTT04uc3RyaW5naWZ5KGFjdHVhbCl9YDtcblx0XHRcdFx0aWYgKGFjdHVhbCAhPT0gZXhwZWN0ZWQgJiYgYWN0dWFsQWx0ICE9PSBleHBlY3RlZCkge1xuXHRcdFx0XHRcdGZhaWx1cmVzLnB1c2goYFxcbiR7bWVzc2FnZX1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZhaWx1cmVzLmxlbmd0aCwgMCwgZmFpbHVyZXMuam9pbignJykpO1xuXG5cdFx0Ly8gaWYgKGlzV2luZG93cykge1xuXHRcdC8vIFx0Ly8gVGVzdCByZXNvbHZpbmcgdGhlIGN1cnJlbnQgV2luZG93cyBkcml2ZSBsZXR0ZXIgZnJvbSBhIHNwYXduZWQgcHJvY2Vzcy5cblx0XHQvLyBcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzcyMTVcblx0XHQvLyBcdGNvbnN0IGN1cnJlbnREcml2ZUxldHRlciA9IHBhdGgucGFyc2UocHJvY2Vzcy5jd2QoKSkucm9vdC5zdWJzdHJpbmcoMCwgMik7XG5cdFx0Ly8gXHRjb25zdCByZXNvbHZlRml4dHVyZSA9IGZpeHR1cmVzLnBhdGgoJ3BhdGgtcmVzb2x2ZS5qcycpO1xuXHRcdC8vIFx0Y29uc3Qgc3Bhd25SZXN1bHQgPSBjaGlsZC5zcGF3blN5bmMoXG5cdFx0Ly8gXHRcdHByb2Nlc3MuYXJndlswXSwgW3Jlc29sdmVGaXh0dXJlLCBjdXJyZW50RHJpdmVMZXR0ZXJdKTtcblx0XHQvLyBcdGNvbnN0IHJlc29sdmVkUGF0aCA9IHNwYXduUmVzdWx0LnN0ZG91dC50b1N0cmluZygpLnRyaW0oKTtcblx0XHQvLyBcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlZFBhdGgudG9Mb3dlckNhc2UoKSwgcHJvY2Vzcy5jd2QoKS50b0xvd2VyQ2FzZSgpKTtcblx0XHQvLyB9XG5cdH0pO1xuXG5cdHRlc3QoJ2Jhc2VuYW1lJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKF9fZmlsZW5hbWUpLCAncGF0aC50ZXN0LmpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoX19maWxlbmFtZSwgJy5qcycpLCAncGF0aC50ZXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy5qcycsICcuanMnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvZGlyL2Jhc2VuYW1lLmV4dCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9iYXNlbmFtZS5leHQnKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdiYXNlbmFtZS5leHQnKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdiYXNlbmFtZS5leHQvJyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnYmFzZW5hbWUuZXh0Ly8nKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdhYWEvYmJiJywgJy9iYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdhYWEvYmJiJywgJ2EvYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnYWFhL2JiYicsICdiYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdhYWEvYmJiLy8nLCAnYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnYWFhL2JiYicsICdiYicpLCAnYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdhYWEvYmJiJywgJ2InKSwgJ2JiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9hYWEvYmJiJywgJy9iYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvYWFhL2JiYicsICdhL2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9hYWEvYmJiJywgJ2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9hYWEvYmJiLy8nLCAnYmJiJyksICdiYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2FhYS9iYmInLCAnYmInKSwgJ2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2FhYS9iYmInLCAnYicpLCAnYmInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2FhYS9iYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvYWFhLycpLCAnYWFhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy9hYWEvYicpLCAnYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvYS9iJyksICdiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy8vYScpLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdhJywgJ2EnKSwgJycpO1xuXG5cdFx0Ly8gT24gV2luZG93cyBhIGJhY2tzbGFzaCBhY3RzIGFzIGEgcGF0aCBzZXBhcmF0b3IuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ1xcXFxkaXJcXFxcYmFzZW5hbWUuZXh0JyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnXFxcXGJhc2VuYW1lLmV4dCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2Jhc2VuYW1lLmV4dCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2Jhc2VuYW1lLmV4dFxcXFwnKSwgJ2Jhc2VuYW1lLmV4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdiYXNlbmFtZS5leHRcXFxcXFxcXCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2ZvbycpLCAnZm9vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2FhYVxcXFxiYmInLCAnXFxcXGJiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2FhYVxcXFxiYmInLCAnYVxcXFxiYmInKSwgJ2JiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdhYWFcXFxcYmJiJywgJ2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2FhYVxcXFxiYmJcXFxcXFxcXFxcXFxcXFxcJywgJ2JiYicpLCAnYmJiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2FhYVxcXFxiYmInLCAnYmInKSwgJ2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnYWFhXFxcXGJiYicsICdiJyksICdiYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdDOicpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ0M6LicpLCAnLicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdDOlxcXFwnKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdDOlxcXFxkaXJcXFxcYmFzZS5leHQnKSwgJ2Jhc2UuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ0M6XFxcXGJhc2VuYW1lLmV4dCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ0M6YmFzZW5hbWUuZXh0JyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnQzpiYXNlbmFtZS5leHRcXFxcJyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnQzpiYXNlbmFtZS5leHRcXFxcXFxcXCcpLCAnYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ0M6Zm9vJyksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnZmlsZTpzdHJlYW0nKSwgJ2ZpbGU6c3RyZWFtJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2EnLCAnYScpLCAnJyk7XG5cblx0XHQvLyBPbiB1bml4IGEgYmFja3NsYXNoIGlzIGp1c3QgdHJlYXRlZCBhcyBhbnkgb3RoZXIgY2hhcmFjdGVyLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCdcXFxcZGlyXFxcXGJhc2VuYW1lLmV4dCcpLFxuXHRcdFx0J1xcXFxkaXJcXFxcYmFzZW5hbWUuZXh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ1xcXFxiYXNlbmFtZS5leHQnKSwgJ1xcXFxiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnYmFzZW5hbWUuZXh0JyksICdiYXNlbmFtZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnYmFzZW5hbWUuZXh0XFxcXCcpLCAnYmFzZW5hbWUuZXh0XFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCdiYXNlbmFtZS5leHRcXFxcXFxcXCcpLCAnYmFzZW5hbWUuZXh0XFxcXFxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnZm9vJyksICdmb28nKTtcblxuXHRcdC8vIFBPU0lYIGZpbGVuYW1lcyBtYXkgaW5jbHVkZSBjb250cm9sIGNoYXJhY3RlcnNcblx0XHQvLyBjLmYuIGh0dHA6Ly93d3cuZHdoZWVsZXIuY29tL2Vzc2F5cy9maXhpbmctdW5peC1saW51eC1maWxlbmFtZXMuaHRtbFxuXHRcdGNvbnN0IGNvbnRyb2xDaGFyRmlsZW5hbWUgPSBgSWNvbiR7U3RyaW5nLmZyb21DaGFyQ29kZSgxMyl9YDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZShgL2EvYi8ke2NvbnRyb2xDaGFyRmlsZW5hbWV9YCksXG5cdFx0XHRjb250cm9sQ2hhckZpbGVuYW1lKTtcblxuXHRcdC8vIFRlc3RzIGZyb20gVlNDb2RlXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2Zvby9iYXInKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCdmb29cXFxcYmFyJyksICdmb29cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2Zvb1xcXFxiYXInKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvZm9vL2JhcicpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ1xcXFxmb29cXFxcYmFyJyksICdcXFxcZm9vXFxcXGJhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmJhc2VuYW1lKCdcXFxcZm9vXFxcXGJhcicpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJy4vYmFyJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5iYXNlbmFtZSgnLlxcXFxiYXInKSwgJy5cXFxcYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJy5cXFxcYmFyJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5iYXNlbmFtZSgnL2JhcicpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ1xcXFxiYXInKSwgJ1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnXFxcXGJhcicpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGguYmFzZW5hbWUoJ2Jhci8nKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmJhc2VuYW1lKCdiYXJcXFxcJyksICdiYXJcXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuYmFzZW5hbWUoJ2JhclxcXFwnKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCdiYXInKSwgJ2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLmJhc2VuYW1lKCcvLy8vLy8vLycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguYmFzZW5hbWUoJ1xcXFxcXFxcXFxcXFxcXFwnKSwgJ1xcXFxcXFxcXFxcXFxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5iYXNlbmFtZSgnXFxcXFxcXFxcXFxcXFxcXCcpLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZhaWx1cmVzID0gW10gYXMgc3RyaW5nW107XG5cblx0XHRjb25zdCByZWxhdGl2ZVRlc3RzID0gW1xuXHRcdFx0W3BhdGgud2luMzIucmVsYXRpdmUsXG5cdFx0XHQvLyBhcmd1bWVudHMgICAgICAgICAgICAgICAgICAgICByZXN1bHRcblx0XHRcdFtbJ2M6L2JsYWhcXFxcYmxhaCcsICdkOi9nYW1lcycsICdkOlxcXFxnYW1lcyddLFxuXHRcdFx0WydjOi9hYWFhL2JiYmInLCAnYzovYWFhYScsICcuLiddLFxuXHRcdFx0WydjOi9hYWFhL2JiYmInLCAnYzovY2NjYycsICcuLlxcXFwuLlxcXFxjY2NjJ10sXG5cdFx0XHRbJ2M6L2FhYWEvYmJiYicsICdjOi9hYWFhL2JiYmInLCAnJ10sXG5cdFx0XHRbJ2M6L2FhYWEvYmJiYicsICdjOi9hYWFhL2NjY2MnLCAnLi5cXFxcY2NjYyddLFxuXHRcdFx0WydjOi9hYWFhLycsICdjOi9hYWFhL2NjY2MnLCAnY2NjYyddLFxuXHRcdFx0WydjOi8nLCAnYzpcXFxcYWFhYVxcXFxiYmJiJywgJ2FhYWFcXFxcYmJiYiddLFxuXHRcdFx0WydjOi9hYWFhL2JiYmInLCAnZDpcXFxcJywgJ2Q6XFxcXCddLFxuXHRcdFx0WydjOi9BYUFhL2JiYmInLCAnYzovYWFhYS9iYmJiJywgJyddLFxuXHRcdFx0WydjOi9hYWFhYS8nLCAnYzovYWFhYS9jY2NjJywgJy4uXFxcXGFhYWFcXFxcY2NjYyddLFxuXHRcdFx0WydDOlxcXFxmb29cXFxcYmFyXFxcXGJhelxcXFxxdXV4JywgJ0M6XFxcXCcsICcuLlxcXFwuLlxcXFwuLlxcXFwuLiddLFxuXHRcdFx0WydDOlxcXFxmb29cXFxcdGVzdCcsICdDOlxcXFxmb29cXFxcdGVzdFxcXFxiYXJcXFxccGFja2FnZS5qc29uJywgJ2JhclxcXFxwYWNrYWdlLmpzb24nXSxcblx0XHRcdFsnQzpcXFxcZm9vXFxcXGJhclxcXFxiYXotcXV1eCcsICdDOlxcXFxmb29cXFxcYmFyXFxcXGJheicsICcuLlxcXFxiYXonXSxcblx0XHRcdFsnQzpcXFxcZm9vXFxcXGJhclxcXFxiYXonLCAnQzpcXFxcZm9vXFxcXGJhclxcXFxiYXotcXV1eCcsICcuLlxcXFxiYXotcXV1eCddLFxuXHRcdFx0WydcXFxcXFxcXGZvb1xcXFxiYXInLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJheicsICdiYXonXSxcblx0XHRcdFsnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJheicsICdcXFxcXFxcXGZvb1xcXFxiYXInLCAnLi4nXSxcblx0XHRcdFsnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJhei1xdXV4JywgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFxiYXonLCAnLi5cXFxcYmF6J10sXG5cdFx0XHRbJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFxiYXonLCAnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJhei1xdXV4JywgJy4uXFxcXGJhei1xdXV4J10sXG5cdFx0XHRbJ0M6XFxcXGJhei1xdXV4JywgJ0M6XFxcXGJheicsICcuLlxcXFxiYXonXSxcblx0XHRcdFsnQzpcXFxcYmF6JywgJ0M6XFxcXGJhei1xdXV4JywgJy4uXFxcXGJhei1xdXV4J10sXG5cdFx0XHRbJ1xcXFxcXFxcZm9vXFxcXGJhei1xdXV4JywgJ1xcXFxcXFxcZm9vXFxcXGJheicsICcuLlxcXFxiYXonXSxcblx0XHRcdFsnXFxcXFxcXFxmb29cXFxcYmF6JywgJ1xcXFxcXFxcZm9vXFxcXGJhei1xdXV4JywgJy4uXFxcXGJhei1xdXV4J10sXG5cdFx0XHRbJ0M6XFxcXGJheicsICdcXFxcXFxcXGZvb1xcXFxiYXJcXFxcYmF6JywgJ1xcXFxcXFxcZm9vXFxcXGJhclxcXFxiYXonXSxcblx0XHRcdFsnXFxcXFxcXFxmb29cXFxcYmFyXFxcXGJheicsICdDOlxcXFxiYXonLCAnQzpcXFxcYmF6J11cblx0XHRcdF1cblx0XHRcdF0sXG5cdFx0XHRbcGF0aC5wb3NpeC5yZWxhdGl2ZSxcblx0XHRcdC8vIGFyZ3VtZW50cyAgICAgICAgICByZXN1bHRcblx0XHRcdFtbJy92YXIvbGliJywgJy92YXInLCAnLi4nXSxcblx0XHRcdFsnL3Zhci9saWInLCAnL2JpbicsICcuLi8uLi9iaW4nXSxcblx0XHRcdFsnL3Zhci9saWInLCAnL3Zhci9saWInLCAnJ10sXG5cdFx0XHRbJy92YXIvbGliJywgJy92YXIvYXBhY2hlJywgJy4uL2FwYWNoZSddLFxuXHRcdFx0WycvdmFyLycsICcvdmFyL2xpYicsICdsaWInXSxcblx0XHRcdFsnLycsICcvdmFyL2xpYicsICd2YXIvbGliJ10sXG5cdFx0XHRbJy9mb28vdGVzdCcsICcvZm9vL3Rlc3QvYmFyL3BhY2thZ2UuanNvbicsICdiYXIvcGFja2FnZS5qc29uJ10sXG5cdFx0XHRbJy9Vc2Vycy9hL3dlYi9iL3Rlc3QvbWFpbHMnLCAnL1VzZXJzL2Evd2ViL2InLCAnLi4vLi4nXSxcblx0XHRcdFsnL2Zvby9iYXIvYmF6LXF1dXgnLCAnL2Zvby9iYXIvYmF6JywgJy4uL2JheiddLFxuXHRcdFx0WycvZm9vL2Jhci9iYXonLCAnL2Zvby9iYXIvYmF6LXF1dXgnLCAnLi4vYmF6LXF1dXgnXSxcblx0XHRcdFsnL2Jhei1xdXV4JywgJy9iYXonLCAnLi4vYmF6J10sXG5cdFx0XHRbJy9iYXonLCAnL2Jhei1xdXV4JywgJy4uL2Jhei1xdXV4J11cblx0XHRcdF1cblx0XHRcdF1cblx0XHRdO1xuXHRcdHJlbGF0aXZlVGVzdHMuZm9yRWFjaCgodGVzdCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVsYXRpdmUgPSB0ZXN0WzBdO1xuXHRcdFx0Ly9AdHMtZXhwZWN0LWVycm9yXG5cdFx0XHR0ZXN0WzFdLmZvckVhY2goKHRlc3QpID0+IHtcblx0XHRcdFx0Ly9AdHMtZXhwZWN0LWVycm9yXG5cdFx0XHRcdGNvbnN0IGFjdHVhbCA9IHJlbGF0aXZlKHRlc3RbMF0sIHRlc3RbMV0pO1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IHRlc3RbMl07XG5cdFx0XHRcdGNvbnN0IG9zID0gcmVsYXRpdmUgPT09IHBhdGgud2luMzIucmVsYXRpdmUgPyAnd2luMzInIDogJ3Bvc2l4Jztcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGBwYXRoLiR7b3N9LnJlbGF0aXZlKCR7dGVzdC5zbGljZSgwLCAyKS5tYXAoSlNPTi5zdHJpbmdpZnkpLmpvaW4oJywnKX0pXFxuICBleHBlY3Q9JHtKU09OLnN0cmluZ2lmeShleHBlY3RlZCl9XFxuICBhY3R1YWw9JHtKU09OLnN0cmluZ2lmeShhY3R1YWwpfWA7XG5cdFx0XHRcdGlmIChhY3R1YWwgIT09IGV4cGVjdGVkKSB7XG5cdFx0XHRcdFx0ZmFpbHVyZXMucHVzaChgXFxuJHttZXNzYWdlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFpbHVyZXMubGVuZ3RoLCAwLCBmYWlsdXJlcy5qb2luKCcnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vcm1hbGl6ZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJy4vZml4dHVyZXMvLy9iLy4uL2IvYy5qcycpLFxuXHRcdFx0J2ZpeHR1cmVzXFxcXGJcXFxcYy5qcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnL2Zvby8uLi8uLi8uLi9iYXInKSwgJ1xcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ2EvL2IvLy4uL2InKSwgJ2FcXFxcYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYS8vYi8vLi9jJyksICdhXFxcXGJcXFxcYycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYS8vYi8vLicpLCAnYVxcXFxiJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCcvL3NlcnZlci9zaGFyZS9kaXIvZmlsZS5leHQnKSxcblx0XHRcdCdcXFxcXFxcXHNlcnZlclxcXFxzaGFyZVxcXFxkaXJcXFxcZmlsZS5leHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJy9hL2IvYy8uLi8uLi8uLi94L3kveicpLCAnXFxcXHhcXFxceVxcXFx6Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdDOicpLCAnQzouJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdDOi4uXFxcXGFiYycpLCAnQzouLlxcXFxhYmMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ0M6Li5cXFxcLi5cXFxcYWJjXFxcXC4uXFxcXGRlZicpLFxuXHRcdFx0J0M6Li5cXFxcLi5cXFxcZGVmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdDOlxcXFwuJyksICdDOlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ2ZpbGU6c3RyZWFtJyksICdmaWxlOnN0cmVhbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYmFyXFxcXGZvby4uXFxcXC4uXFxcXCcpLCAnYmFyXFxcXCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLm5vcm1hbGl6ZSgnYmFyXFxcXGZvby4uXFxcXC4uJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ2JhclxcXFxmb28uLlxcXFwuLlxcXFxiYXonKSwgJ2JhclxcXFxiYXonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ2JhclxcXFxmb28uLlxcXFwnKSwgJ2JhclxcXFxmb28uLlxcXFwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJ2JhclxcXFxmb28uLicpLCAnYmFyXFxcXGZvby4uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCcuLlxcXFxmb28uLlxcXFwuLlxcXFwuLlxcXFxiYXInKSxcblx0XHRcdCcuLlxcXFwuLlxcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJy4uXFxcXC4uLlxcXFwuLlxcXFwuXFxcXC4uLlxcXFwuLlxcXFwuLlxcXFxiYXInKSxcblx0XHRcdCcuLlxcXFwuLlxcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJy4uLy4uLy4uL2Zvby8uLi8uLi8uLi9iYXInKSxcblx0XHRcdCcuLlxcXFwuLlxcXFwuLlxcXFwuLlxcXFwuLlxcXFxiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5ub3JtYWxpemUoJy4uLy4uLy4uL2Zvby8uLi8uLi8uLi9iYXIvLi4vLi4vJyksXG5cdFx0XHQnLi5cXFxcLi5cXFxcLi5cXFxcLi5cXFxcLi5cXFxcLi5cXFxcJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cGF0aC53aW4zMi5ub3JtYWxpemUoJy4uL2Zvb2Jhci9iYXJmb28vZm9vLy4uLy4uLy4uL2Jhci8uLi8uLi8nKSxcblx0XHRcdCcuLlxcXFwuLlxcXFwnXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwYXRoLndpbjMyLm5vcm1hbGl6ZSgnLi4vLi4uLy4uL2Zvb2Jhci8uLi8uLi8uLi9iYXIvLi4vLi4vYmF6JyksXG5cdFx0XHQnLi5cXFxcLi5cXFxcLi5cXFxcLi5cXFxcYmF6J1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIubm9ybWFsaXplKCdmb28vYmFyXFxcXGJheicpLCAnZm9vXFxcXGJhclxcXFxiYXonKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnLi9maXh0dXJlcy8vL2IvLi4vYi9jLmpzJyksXG5cdFx0XHQnZml4dHVyZXMvYi9jLmpzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCcvZm9vLy4uLy4uLy4uL2JhcicpLCAnL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnYS8vYi8vLi4vYicpLCAnYS9iJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCdhLy9iLy8uL2MnKSwgJ2EvYi9jJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCdhLy9iLy8uJyksICdhL2InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJy9hL2IvYy8uLi8uLi8uLi94L3kveicpLCAnL3gveS96Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCcvLy8uLi8vLi9mb28vLi8vYmFyJyksICcvZm9vL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnYmFyL2Zvby4uLy4uLycpLCAnYmFyLycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnYmFyL2Zvby4uLy4uJyksICdiYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJ2Jhci9mb28uLi8uLi9iYXonKSwgJ2Jhci9iYXonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJ2Jhci9mb28uLi8nKSwgJ2Jhci9mb28uLi8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJ2Jhci9mb28uLicpLCAnYmFyL2Zvby4uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXgubm9ybWFsaXplKCcuLi9mb28uLi8uLi8uLi9iYXInKSwgJy4uLy4uL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnLi4vLi4uLy4uLy4vLi4uLy4uLy4uL2JhcicpLFxuXHRcdFx0Jy4uLy4uL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnLi4vLi4vLi4vZm9vLy4uLy4uLy4uL2JhcicpLFxuXHRcdFx0Jy4uLy4uLy4uLy4uLy4uL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnLi4vLi4vLi4vZm9vLy4uLy4uLy4uL2Jhci8uLi8uLi8nKSxcblx0XHRcdCcuLi8uLi8uLi8uLi8uLi8uLi8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwYXRoLnBvc2l4Lm5vcm1hbGl6ZSgnLi4vZm9vYmFyL2JhcmZvby9mb28vLi4vLi4vLi4vYmFyLy4uLy4uLycpLFxuXHRcdFx0Jy4uLy4uLydcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHBhdGgucG9zaXgubm9ybWFsaXplKCcuLi8uLi4vLi4vZm9vYmFyLy4uLy4uLy4uL2Jhci8uLi8uLi9iYXonKSxcblx0XHRcdCcuLi8uLi8uLi8uLi9iYXonXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5ub3JtYWxpemUoJ2Zvby9iYXJcXFxcYmF6JyksICdmb28vYmFyXFxcXGJheicpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0Fic29sdXRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJy8nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnLy8nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnLy9zZXJ2ZXInKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnLy9zZXJ2ZXIvZmlsZScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdcXFxcXFxcXHNlcnZlclxcXFxmaWxlJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ1xcXFxcXFxcc2VydmVyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ1xcXFxcXFxcJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ2MnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ2M6JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdjOlxcXFwnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnYzovJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ2M6Ly8nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuaXNBYnNvbHV0ZSgnQzovVXNlcnMvJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLndpbjMyLmlzQWJzb2x1dGUoJ0M6XFxcXFVzZXJzXFxcXCcpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdDOmN3ZC9hbm90aGVyJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdDOmN3ZFxcXFxhbm90aGVyJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdkaXJlY3RvcnkvZGlyZWN0b3J5JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC53aW4zMi5pc0Fic29sdXRlKCdkaXJlY3RvcnlcXFxcZGlyZWN0b3J5JyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLnBvc2l4LmlzQWJzb2x1dGUoJy9ob21lL2ZvbycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aC5wb3NpeC5pc0Fic29sdXRlKCcvaG9tZS9mb28vLi4nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguaXNBYnNvbHV0ZSgnYmFyLycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguaXNBYnNvbHV0ZSgnLi9iYXonKSwgZmFsc2UpO1xuXG5cdFx0Ly8gVGVzdHMgZnJvbSBWU0NvZGU6XG5cblx0XHQvLyBBYnNvbHV0ZSBQYXRoc1xuXHRcdFtcblx0XHRcdCdDOi8nLFxuXHRcdFx0J0M6XFxcXCcsXG5cdFx0XHQnQzovZm9vJyxcblx0XHRcdCdDOlxcXFxmb28nLFxuXHRcdFx0J3o6L2Zvby9iYXIudHh0Jyxcblx0XHRcdCd6OlxcXFxmb29cXFxcYmFyLnR4dCcsXG5cblx0XHRcdCdcXFxcXFxcXGxvY2FsaG9zdFxcXFxjJFxcXFxmb28nLFxuXG5cdFx0XHQnLycsXG5cdFx0XHQnL2Zvbydcblx0XHRdLmZvckVhY2goYWJzb2x1dGVQYXRoID0+IHtcblx0XHRcdGFzc2VydC5vayhwYXRoLndpbjMyLmlzQWJzb2x1dGUoYWJzb2x1dGVQYXRoKSwgYWJzb2x1dGVQYXRoKTtcblx0XHR9KTtcblxuXHRcdFtcblx0XHRcdCcvJyxcblx0XHRcdCcvZm9vJyxcblx0XHRcdCcvZm9vL2Jhci50eHQnXG5cdFx0XS5mb3JFYWNoKGFic29sdXRlUGF0aCA9PiB7XG5cdFx0XHRhc3NlcnQub2socGF0aC5wb3NpeC5pc0Fic29sdXRlKGFic29sdXRlUGF0aCksIGFic29sdXRlUGF0aCk7XG5cdFx0fSk7XG5cblx0XHQvLyBSZWxhdGl2ZSBQYXRoc1xuXHRcdFtcblx0XHRcdCcnLFxuXHRcdFx0J2ZvbycsXG5cdFx0XHQnZm9vL2JhcicsXG5cdFx0XHQnLi9mb28nLFxuXHRcdFx0J2h0dHA6Ly9mb28uY29tL2Jhcidcblx0XHRdLmZvckVhY2gobm9uQWJzb2x1dGVQYXRoID0+IHtcblx0XHRcdGFzc2VydC5vayghcGF0aC53aW4zMi5pc0Fic29sdXRlKG5vbkFic29sdXRlUGF0aCksIG5vbkFic29sdXRlUGF0aCk7XG5cdFx0fSk7XG5cblx0XHRbXG5cdFx0XHQnJyxcblx0XHRcdCdmb28nLFxuXHRcdFx0J2Zvby9iYXInLFxuXHRcdFx0Jy4vZm9vJyxcblx0XHRcdCdodHRwOi8vZm9vLmNvbS9iYXInLFxuXHRcdFx0J3o6L2Zvby9iYXIudHh0Jyxcblx0XHRdLmZvckVhY2gobm9uQWJzb2x1dGVQYXRoID0+IHtcblx0XHRcdGFzc2VydC5vayghcGF0aC5wb3NpeC5pc0Fic29sdXRlKG5vbkFic29sdXRlUGF0aCksIG5vbkFic29sdXRlUGF0aCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhdGgnLCAoKSA9PiB7XG5cdFx0Ly8gcGF0aC5zZXAgdGVzdHNcblx0XHQvLyB3aW5kb3dzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuc2VwLCAnXFxcXCcpO1xuXHRcdC8vIHBvc2l4XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguc2VwLCAnLycpO1xuXG5cdFx0Ly8gcGF0aC5kZWxpbWl0ZXIgdGVzdHNcblx0XHQvLyB3aW5kb3dzXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgud2luMzIuZGVsaW1pdGVyLCAnOycpO1xuXHRcdC8vIHBvc2l4XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgucG9zaXguZGVsaW1pdGVyLCAnOicpO1xuXG5cdFx0Ly8gaWYgKGlzV2luZG93cykge1xuXHRcdC8vIFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgsIHBhdGgud2luMzIpO1xuXHRcdC8vIH0gZWxzZSB7XG5cdFx0Ly8gXHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aCwgcGF0aC5wb3NpeCk7XG5cdFx0Ly8gfVxuXHR9KTtcblxuXHQvLyB0ZXN0KCdwZXJmJywgKCkgPT4ge1xuXHQvLyBcdGNvbnN0IGZvbGRlck5hbWVzID0gW1xuXHQvLyBcdFx0J2FiYycsXG5cdC8vIFx0XHQnVXNlcnMnLFxuXHQvLyBcdFx0J3JlYWxseWxvbmdmb2xkZXJuYW1lJyxcblx0Ly8gXHRcdCdzJyxcblx0Ly8gXHRcdCdyZWFsbHlyZWFsbHlyZWFsbHlsb25nZm9sZGVybmFtZScsXG5cdC8vIFx0XHQnaG9tZSdcblx0Ly8gXHRdO1xuXG5cdC8vIFx0Y29uc3QgYmFzZVBhdGhzID0gW1xuXHQvLyBcdFx0J0M6Jyxcblx0Ly8gXHRcdCcnLFxuXHQvLyBcdF07XG5cblx0Ly8gXHRjb25zdCBzZXBhcmF0b3JzID0gW1xuXHQvLyBcdFx0J1xcXFwnLFxuXHQvLyBcdFx0Jy8nXG5cdC8vIFx0XTtcblxuXHQvLyBcdGZ1bmN0aW9uIHJhbmRvbUludChjaWVsOiBudW1iZXIpOiBudW1iZXIge1xuXHQvLyBcdFx0cmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGNpZWwpO1xuXHQvLyBcdH1cblxuXHQvLyBcdGxldCBwYXRoc1RvTm9ybWFsaXplID0gW107XG5cdC8vIFx0bGV0IHBhdGhzVG9Kb2luID0gW107XG5cdC8vIFx0bGV0IGk7XG5cdC8vIFx0Zm9yIChpID0gMDsgaSA8IDEwMDAwMDA7IGkrKykge1xuXHQvLyBcdFx0Y29uc3QgYmFzZVBhdGggPSBiYXNlUGF0aHNbcmFuZG9tSW50KGJhc2VQYXRocy5sZW5ndGgpXTtcblx0Ly8gXHRcdGxldCBsZW5ndGhPZlBhdGggPSByYW5kb21JbnQoMTApICsgMjtcblxuXHQvLyBcdFx0bGV0IHBhdGhUb05vcm1hbGl6ZSA9IGJhc2VQYXRoICsgc2VwYXJhdG9yc1tyYW5kb21JbnQoc2VwYXJhdG9ycy5sZW5ndGgpXTtcblx0Ly8gXHRcdHdoaWxlIChsZW5ndGhPZlBhdGgtLSA+IDApIHtcblx0Ly8gXHRcdFx0cGF0aFRvTm9ybWFsaXplID0gcGF0aFRvTm9ybWFsaXplICsgZm9sZGVyTmFtZXNbcmFuZG9tSW50KGZvbGRlck5hbWVzLmxlbmd0aCldICsgc2VwYXJhdG9yc1tyYW5kb21JbnQoc2VwYXJhdG9ycy5sZW5ndGgpXTtcblx0Ly8gXHRcdH1cblxuXHQvLyBcdFx0cGF0aHNUb05vcm1hbGl6ZS5wdXNoKHBhdGhUb05vcm1hbGl6ZSk7XG5cblx0Ly8gXHRcdGxldCBwYXRoVG9Kb2luID0gJyc7XG5cdC8vIFx0XHRsZW5ndGhPZlBhdGggPSByYW5kb21JbnQoMTApICsgMjtcblx0Ly8gXHRcdHdoaWxlIChsZW5ndGhPZlBhdGgtLSA+IDApIHtcblx0Ly8gXHRcdFx0cGF0aFRvSm9pbiA9IHBhdGhUb0pvaW4gKyBmb2xkZXJOYW1lc1tyYW5kb21JbnQoZm9sZGVyTmFtZXMubGVuZ3RoKV0gKyBzZXBhcmF0b3JzW3JhbmRvbUludChzZXBhcmF0b3JzLmxlbmd0aCldO1xuXHQvLyBcdFx0fVxuXG5cdC8vIFx0XHRwYXRoc1RvSm9pbi5wdXNoKHBhdGhUb0pvaW4gKyAnLnRzJyk7XG5cdC8vIFx0fVxuXG5cdC8vIFx0bGV0IG5ld1RpbWUgPSAwO1xuXG5cdC8vIFx0bGV0IGo7XG5cdC8vIFx0Zm9yKGogPSAwOyBqIDwgcGF0aHNUb0pvaW4ubGVuZ3RoOyBqKyspIHtcblx0Ly8gXHRcdGNvbnN0IHBhdGgxID0gcGF0aHNUb05vcm1hbGl6ZVtqXTtcblx0Ly8gXHRcdGNvbnN0IHBhdGgyID0gcGF0aHNUb05vcm1hbGl6ZVtqXTtcblxuXHQvLyBcdFx0Y29uc3QgbmV3U3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0Ly8gXHRcdHBhdGguam9pbihwYXRoMSwgcGF0aDIpO1xuXHQvLyBcdFx0bmV3VGltZSArPSBwZXJmb3JtYW5jZS5ub3coKSAtIG5ld1N0YXJ0O1xuXHQvLyBcdH1cblxuXHQvLyBcdGFzc2VydC5vayhmYWxzZSwgYFRpbWU6ICR7bmV3VGltZX1tcy5gKTtcblx0Ly8gfSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQTZCQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsT0FBTyxpQkFBaUI7QUFDakMsWUFBWSxhQUFhO0FBQ3pCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sK0JBQStCLE1BQU07QUFDMUMsUUFBTSxhQUFhO0FBQ25CLDBDQUF3QztBQUN4QyxPQUFLLFFBQVEsTUFBTTtBQUNsQixVQUFNLFdBQVcsQ0FBQztBQUNsQixVQUFNLGNBQWM7QUFFcEIsVUFBTSxZQUFpQjtBQUFBLE1BQ3RCO0FBQUEsUUFBQyxDQUFDLEtBQUssTUFBTSxNQUFNLEtBQUssTUFBTSxJQUFJO0FBQUE7QUFBQSxR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
