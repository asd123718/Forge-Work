import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IgnoreFile } from "../../common/ignoreFile.js";
function runAssert(input, ignoreFile, ignoreFileLocation, shouldMatch, traverse, ignoreCase) {
  return (prefix) => {
    const isDir = input.endsWith("/");
    const rawInput = isDir ? input.slice(0, input.length - 1) : input;
    const matcher = new IgnoreFile(ignoreFile, prefix + ignoreFileLocation, void 0, ignoreCase);
    if (traverse) {
      const traverses = matcher.isPathIncludedInTraversal(prefix + rawInput, isDir);
      if (shouldMatch) {
        assert(traverses, `${ignoreFileLocation}: ${ignoreFile} should traverse ${isDir ? "dir" : "file"} ${prefix}${rawInput}`);
      } else {
        assert(!traverses, `${ignoreFileLocation}: ${ignoreFile} should not traverse ${isDir ? "dir" : "file"} ${prefix}${rawInput}`);
      }
    } else {
      const ignores = matcher.isArbitraryPathIgnored(prefix + rawInput, isDir);
      if (shouldMatch) {
        assert(ignores, `${ignoreFileLocation}: ${ignoreFile} should ignore ${isDir ? "dir" : "file"} ${prefix}${rawInput}`);
      } else {
        assert(!ignores, `${ignoreFileLocation}: ${ignoreFile} should not ignore ${isDir ? "dir" : "file"} ${prefix}${rawInput}`);
      }
    }
  };
}
function assertNoTraverses(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
  const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, false, true, ignoreCase);
  runWithPrefix("");
  runWithPrefix("/someFolder");
}
function assertTraverses(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
  const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, true, true, ignoreCase);
  runWithPrefix("");
  runWithPrefix("/someFolder");
}
function assertIgnoreMatch(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
  const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, true, false, ignoreCase);
  runWithPrefix("");
  runWithPrefix("/someFolder");
}
function assertNoIgnoreMatch(ignoreFile, ignoreFileLocation, input, ignoreCase = false) {
  const runWithPrefix = runAssert(input, ignoreFile, ignoreFileLocation, false, false, ignoreCase);
  runWithPrefix("");
  runWithPrefix("/someFolder");
}
suite("Parsing .gitignore files", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("paths with trailing slashes do not match files", () => {
    const i = "node_modules/\n";
    assertNoIgnoreMatch(i, "/", "/node_modules");
    assertIgnoreMatch(i, "/", "/node_modules/");
    assertNoIgnoreMatch(i, "/", "/inner/node_modules");
    assertIgnoreMatch(i, "/", "/inner/node_modules/");
  });
  test("parsing simple gitignore files", () => {
    let i = "node_modules\nout\n";
    assertIgnoreMatch(i, "/", "/node_modules");
    assertNoTraverses(i, "/", "/node_modules");
    assertIgnoreMatch(i, "/", "/node_modules/file");
    assertIgnoreMatch(i, "/", "/dir/node_modules");
    assertIgnoreMatch(i, "/", "/dir/node_modules/file");
    assertIgnoreMatch(i, "/", "/out");
    assertNoTraverses(i, "/", "/out");
    assertIgnoreMatch(i, "/", "/out/file");
    assertIgnoreMatch(i, "/", "/dir/out");
    assertIgnoreMatch(i, "/", "/dir/out/file");
    i = "/node_modules\n/out\n";
    assertIgnoreMatch(i, "/", "/node_modules");
    assertIgnoreMatch(i, "/", "/node_modules/file");
    assertNoIgnoreMatch(i, "/", "/dir/node_modules");
    assertNoIgnoreMatch(i, "/", "/dir/node_modules/file");
    assertIgnoreMatch(i, "/", "/out");
    assertIgnoreMatch(i, "/", "/out/file");
    assertNoIgnoreMatch(i, "/", "/dir/out");
    assertNoIgnoreMatch(i, "/", "/dir/out/file");
    i = "node_modules/\nout/\n";
    assertNoIgnoreMatch(i, "/", "/node_modules");
    assertIgnoreMatch(i, "/", "/node_modules/");
    assertIgnoreMatch(i, "/", "/node_modules/file");
    assertIgnoreMatch(i, "/", "/dir/node_modules/");
    assertNoIgnoreMatch(i, "/", "/dir/node_modules");
    assertIgnoreMatch(i, "/", "/dir/node_modules/file");
    assertIgnoreMatch(i, "/", "/out/");
    assertNoIgnoreMatch(i, "/", "/out");
    assertIgnoreMatch(i, "/", "/out/file");
    assertNoIgnoreMatch(i, "/", "/dir/out");
    assertIgnoreMatch(i, "/", "/dir/out/");
    assertIgnoreMatch(i, "/", "/dir/out/file");
  });
  test("parsing files-in-folder exclude", () => {
    let i = "node_modules/*\n";
    assertNoIgnoreMatch(i, "/", "/node_modules");
    assertNoIgnoreMatch(i, "/", "/node_modules/");
    assertTraverses(i, "/", "/node_modules");
    assertTraverses(i, "/", "/node_modules/");
    assertIgnoreMatch(i, "/", "/node_modules/something");
    assertNoTraverses(i, "/", "/node_modules/something");
    assertIgnoreMatch(i, "/", "/node_modules/something/else");
    assertIgnoreMatch(i, "/", "/node_modules/@types");
    assertNoTraverses(i, "/", "/node_modules/@types");
    i = "node_modules/**/*\n";
    assertNoIgnoreMatch(i, "/", "/node_modules");
    assertNoIgnoreMatch(i, "/", "/node_modules/");
    assertIgnoreMatch(i, "/", "/node_modules/something");
    assertIgnoreMatch(i, "/", "/node_modules/something/else");
    assertIgnoreMatch(i, "/", "/node_modules/@types");
  });
  test("parsing simple negations", () => {
    let i = "node_modules/*\n!node_modules/@types\n";
    assertNoIgnoreMatch(i, "/", "/node_modules");
    assertTraverses(i, "/", "/node_modules");
    assertIgnoreMatch(i, "/", "/node_modules/something");
    assertNoTraverses(i, "/", "/node_modules/something");
    assertIgnoreMatch(i, "/", "/node_modules/something/else");
    assertNoIgnoreMatch(i, "/", "/node_modules/@types");
    assertTraverses(i, "/", "/node_modules/@types");
    assertTraverses(i, "/", "/node_modules/@types/boop");
    i = "*.log\n!important.log\n";
    assertIgnoreMatch(i, "/", "/test.log");
    assertIgnoreMatch(i, "/", "/inner/test.log");
    assertNoIgnoreMatch(i, "/", "/important.log");
    assertNoIgnoreMatch(i, "/", "/inner/important.log");
    assertNoTraverses(i, "/", "/test.log");
    assertNoTraverses(i, "/", "/inner/test.log");
    assertTraverses(i, "/", "/important.log");
    assertTraverses(i, "/", "/inner/important.log");
  });
  test("nested .gitignores", () => {
    let i = "node_modules\nout\n";
    assertIgnoreMatch(i, "/inner/", "/inner/node_modules");
    assertIgnoreMatch(i, "/inner/", "/inner/more/node_modules");
    i = "/node_modules\n/out\n";
    assertIgnoreMatch(i, "/inner/", "/inner/node_modules");
    assertNoIgnoreMatch(i, "/inner/", "/inner/more/node_modules");
    assertNoIgnoreMatch(i, "/inner/", "/node_modules");
    i = "node_modules/\nout/\n";
    assertNoIgnoreMatch(i, "/inner/", "/inner/node_modules");
    assertIgnoreMatch(i, "/inner/", "/inner/node_modules/");
    assertNoIgnoreMatch(i, "/inner/", "/inner/more/node_modules");
    assertIgnoreMatch(i, "/inner/", "/inner/more/node_modules/");
    assertNoIgnoreMatch(i, "/inner/", "/node_modules");
  });
  test("file extension matches", () => {
    let i = "*.js\n";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/myFile.js");
    i = "/*.js";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.js");
    i = "**/*.js";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/more/myFile.js");
    i = "inner/*.js";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.js");
    i = "/inner/*.js";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.js");
    i = "**/inner/*.js";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.js");
    i = "**/inner/**/*.js";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/more/myFile.js");
    i = "**/more/*.js";
    assertNoIgnoreMatch(i, "/", "/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.ts");
    assertNoIgnoreMatch(i, "/", "/inner/myFile.js");
    assertNoIgnoreMatch(i, "/", "/inner/more/myFile.ts");
    assertIgnoreMatch(i, "/", "/inner/more/myFile.js");
  });
  test("real world example: vscode-js-debug", () => {
    const i = `.cache/
			.profile/
			.cdp-profile/
			.headless-profile/
			.vscode-test/
			.DS_Store
			node_modules/
			out/
			dist
			/coverage
			/.nyc_output
			demos/web-worker/vscode-pwa-dap.log
			demos/web-worker/vscode-pwa-cdp.log
			.dynamic-testWorkspace
			**/test/**/*.actual
			/testWorkspace/web/tmp
			/testWorkspace/**/debug.log
			/testWorkspace/webview/win/true/
			*.cpuprofile`;
    const included = [
      "/distro",
      "/inner/coverage",
      "/inner/.nyc_output",
      "/inner/demos/web-worker/vscode-pwa-dap.log",
      "/inner/demos/web-worker/vscode-pwa-cdp.log",
      "/testWorkspace/webview/win/true",
      "/a/best/b/c.actual",
      "/best/b/c.actual"
    ];
    const excluded = [
      "/.profile/",
      "/inner/.profile/",
      "/.DS_Store",
      "/inner/.DS_Store",
      "/coverage",
      "/.nyc_output",
      "/demos/web-worker/vscode-pwa-dap.log",
      "/demos/web-worker/vscode-pwa-cdp.log",
      "/.dynamic-testWorkspace",
      "/inner/.dynamic-testWorkspace",
      "/test/.actual",
      "/test/hello.actual",
      "/a/test/.actual",
      "/a/test/b.actual",
      "/a/test/b/.actual",
      "/a/test/b/c.actual",
      "/a/b/test/.actual",
      "/a/b/test/f/c.actual",
      "/testWorkspace/web/tmp",
      "/testWorkspace/debug.log",
      "/testWorkspace/a/debug.log",
      "/testWorkspace/a/b/debug.log",
      "/testWorkspace/webview/win/true/",
      "/.cpuprofile",
      "/a.cpuprofile",
      "/aa/a.cpuprofile",
      "/aaa/aa/a.cpuprofile"
    ];
    for (const include of included) {
      assertNoIgnoreMatch(i, "/", include);
    }
    for (const exclude of excluded) {
      assertIgnoreMatch(i, "/", exclude);
    }
  });
  test("real world example: vscode", () => {
    const i = `.DS_Store
			.cache
			npm-debug.log
			Thumbs.db
			node_modules/
			.build/
			extensions/**/dist/
			/out*/
			/extensions/**/out/
			src/vs/server
			resources/server
			build/node_modules
			coverage/
			test_data/
			test-results/
			yarn-error.log
			vscode.lsif
			vscode.db
			/.profile-oss`;
    const included = [
      "/inner/extensions/dist",
      "/inner/extensions/boop/dist/test",
      "/inner/extensions/boop/doop/dist",
      "/inner/extensions/boop/doop/dist/test",
      "/inner/extensions/boop/doop/dist/test",
      "/inner/extensions/out/test",
      "/inner/extensions/boop/out",
      "/inner/extensions/boop/out/test",
      "/inner/out/",
      "/inner/out/test",
      "/inner/out1/",
      "/inner/out1/test",
      "/inner/out2/",
      "/inner/out2/test",
      "/inner/.profile-oss",
      // Files.
      "/extensions/dist",
      "/extensions/boop/doop/dist",
      "/extensions/boop/out"
    ];
    const excluded = [
      "/extensions/dist/",
      "/extensions/boop/dist/test",
      "/extensions/boop/doop/dist/",
      "/extensions/boop/doop/dist/test",
      "/extensions/boop/doop/dist/test",
      "/extensions/out/test",
      "/extensions/boop/out/",
      "/extensions/boop/out/test",
      "/out/",
      "/out/test",
      "/out1/",
      "/out1/test",
      "/out2/",
      "/out2/test",
      "/.profile-oss"
    ];
    for (const include of included) {
      assertNoIgnoreMatch(i, "/", include);
    }
    for (const exclude of excluded) {
      assertIgnoreMatch(i, "/", exclude);
    }
  });
  test("various advanced constructs found in popular repos", () => {
    const runTest = ({ pattern, included, excluded }) => {
      for (const include of included) {
        assertNoIgnoreMatch(pattern, "/", include);
      }
      for (const exclude of excluded) {
        assertIgnoreMatch(pattern, "/", exclude);
      }
    };
    runTest({
      pattern: `**/node_modules
			/packages/*/dist`,
      excluded: [
        "/node_modules",
        "/test/node_modules",
        "/node_modules/test",
        "/test/node_modules/test",
        "/packages/a/dist",
        "/packages/abc/dist",
        "/packages/abc/dist/test"
      ],
      included: [
        "/inner/packages/a/dist",
        "/inner/packages/abc/dist",
        "/inner/packages/abc/dist/test",
        "/packages/dist",
        "/packages/dist/test",
        "/packages/a/b/dist",
        "/packages/a/b/dist/test"
      ]
    });
    runTest({
      pattern: `.yarn/*
			# !.yarn/cache
			!.yarn/patches
			!.yarn/plugins
			!.yarn/releases
			!.yarn/sdks
			!.yarn/versions`,
      excluded: [
        "/.yarn/test",
        "/.yarn/cache"
      ],
      included: [
        "/inner/.yarn/test",
        "/inner/.yarn/cache",
        "/.yarn/patches",
        "/.yarn/plugins",
        "/.yarn/releases",
        "/.yarn/sdks",
        "/.yarn/versions"
      ]
    });
    runTest({
      pattern: `[._]*s[a-w][a-z]
			[._]s[a-w][a-z]
			*.un~
			*~`,
      excluded: [
        "/~",
        "/abc~",
        "/inner/~",
        "/inner/abc~",
        "/.un~",
        "/a.un~",
        "/test/.un~",
        "/test/a.un~",
        "/.saa",
        "/....saa",
        "/._._sby",
        "/inner/._._sby",
        "/_swz"
      ],
      included: [
        "/.jaa"
      ]
    });
    runTest({
      pattern: `*.pbxuser
			!default.pbxuser
			*.mode1v3
			!default.mode1v3
			*.mode2v3
			!default.mode2v3
			*.perspectivev3
			!default.perspectivev3`,
      excluded: [],
      included: []
    });
    runTest({
      pattern: `[Dd]ebug/
			[Dd]ebugPublic/
			[Rr]elease/
			[Rr]eleases/
			*.[Mm]etrics.xml
			[Tt]est[Rr]esult*/
			[Bb]uild[Ll]og.*
			bld/
			[Bb]in/
			[Oo]bj/
			[Ll]og/`,
      excluded: [],
      included: []
    });
    runTest({
      pattern: `Dockerfile*
			!/tests/bud/*/Dockerfile*
			!/tests/conformance/**/Dockerfile*`,
      excluded: [],
      included: []
    });
    runTest({
      pattern: `*.pdf
			*.html
			!author_bio.html
			!colo.html
			!copyright.html
			!cover.html
			!ix.html
			!titlepage.html
			!toc.html`,
      excluded: [],
      included: []
    });
    runTest({
      pattern: `/log/*
			/tmp/*
			!/log/.keep
			!/tmp/.keep`,
      excluded: [],
      included: []
    });
  });
  test("child negation overrides parent ignore", () => {
    const parentIgnore = new IgnoreFile(".myconfig\n", "/");
    const childIgnore = new IgnoreFile("!.myconfig/\n", "/", parentIgnore);
    assert(
      !childIgnore.isArbitraryPathIgnored("/.myconfig", true),
      "child !.myconfig/ should override parent .myconfig for directories"
    );
    assert(
      !childIgnore.isArbitraryPathIgnored("/.myconfig/settings/test.md", false),
      "files inside un-ignored directory should not be ignored"
    );
    const childNoNegation = new IgnoreFile("node_modules/\n", "/", parentIgnore);
    assert(
      childNoNegation.isArbitraryPathIgnored("/.myconfig", true),
      "without negation, parent ignore should still apply for directories"
    );
    assert(
      childNoNegation.isArbitraryPathIgnored("/.myconfig/settings/test.md", false),
      "without negation, files under parent-ignored directory should still be ignored"
    );
  });
  test("child negation overrides parent ignore for files", () => {
    const parentIgnore = new IgnoreFile("*.log\n", "/");
    const childIgnore = new IgnoreFile("!important.log\n", "/", parentIgnore);
    assert(
      !childIgnore.isArbitraryPathIgnored("/important.log", false),
      "child !important.log should override parent *.log"
    );
    assert(
      childIgnore.isArbitraryPathIgnored("/other.log", false),
      "other .log files should still be ignored via parent"
    );
  });
  test("case-insensitive ignore files", () => {
    const f1 = "node_modules/\n";
    assertNoIgnoreMatch(f1, "/", "/Node_Modules/", false);
    assertIgnoreMatch(f1, "/", "/Node_Modules/", true);
    const f2 = "NODE_MODULES/\n";
    assertNoIgnoreMatch(f2, "/", "/Node_Modules/", false);
    assertIgnoreMatch(f2, "/", "/Node_Modules/", true);
    const f3 = `
			temp/*
			!temp/keep
		`;
    assertNoIgnoreMatch(f3, "/", "/TEMP/other", false);
    assertIgnoreMatch(f3, "/", "/temp/KEEP", false);
    assertIgnoreMatch(f3, "/", "/TEMP/other", true);
    assertNoIgnoreMatch(f3, "/", "/TEMP/KEEP", true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXHRlc3RcXGNvbW1vblxcaWdub3JlRmlsZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJZ25vcmVGaWxlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2lnbm9yZUZpbGUuanMnO1xuXG5mdW5jdGlvbiBydW5Bc3NlcnQoaW5wdXQ6IHN0cmluZywgaWdub3JlRmlsZTogc3RyaW5nLCBpZ25vcmVGaWxlTG9jYXRpb246IHN0cmluZywgc2hvdWxkTWF0Y2g6IGJvb2xlYW4sIHRyYXZlcnNlOiBib29sZWFuLCBpZ25vcmVDYXNlOiBib29sZWFuKSB7XG5cdHJldHVybiAocHJlZml4OiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBpc0RpciA9IGlucHV0LmVuZHNXaXRoKCcvJyk7XG5cdFx0Y29uc3QgcmF3SW5wdXQgPSBpc0RpciA/IGlucHV0LnNsaWNlKDAsIGlucHV0Lmxlbmd0aCAtIDEpIDogaW5wdXQ7XG5cblx0XHRjb25zdCBtYXRjaGVyID0gbmV3IElnbm9yZUZpbGUoaWdub3JlRmlsZSwgcHJlZml4ICsgaWdub3JlRmlsZUxvY2F0aW9uLCB1bmRlZmluZWQsIGlnbm9yZUNhc2UpO1xuXHRcdGlmICh0cmF2ZXJzZSkge1xuXHRcdFx0Y29uc3QgdHJhdmVyc2VzID0gbWF0Y2hlci5pc1BhdGhJbmNsdWRlZEluVHJhdmVyc2FsKHByZWZpeCArIHJhd0lucHV0LCBpc0Rpcik7XG5cblx0XHRcdGlmIChzaG91bGRNYXRjaCkge1xuXHRcdFx0XHRhc3NlcnQodHJhdmVyc2VzLCBgJHtpZ25vcmVGaWxlTG9jYXRpb259OiAke2lnbm9yZUZpbGV9IHNob3VsZCB0cmF2ZXJzZSAke2lzRGlyID8gJ2RpcicgOiAnZmlsZSd9ICR7cHJlZml4fSR7cmF3SW5wdXR9YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQoIXRyYXZlcnNlcywgYCR7aWdub3JlRmlsZUxvY2F0aW9ufTogJHtpZ25vcmVGaWxlfSBzaG91bGQgbm90IHRyYXZlcnNlICR7aXNEaXIgPyAnZGlyJyA6ICdmaWxlJ30gJHtwcmVmaXh9JHtyYXdJbnB1dH1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRjb25zdCBpZ25vcmVzID0gbWF0Y2hlci5pc0FyYml0cmFyeVBhdGhJZ25vcmVkKHByZWZpeCArIHJhd0lucHV0LCBpc0Rpcik7XG5cblx0XHRcdGlmIChzaG91bGRNYXRjaCkge1xuXHRcdFx0XHRhc3NlcnQoaWdub3JlcywgYCR7aWdub3JlRmlsZUxvY2F0aW9ufTogJHtpZ25vcmVGaWxlfSBzaG91bGQgaWdub3JlICR7aXNEaXIgPyAnZGlyJyA6ICdmaWxlJ30gJHtwcmVmaXh9JHtyYXdJbnB1dH1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFzc2VydCghaWdub3JlcywgYCR7aWdub3JlRmlsZUxvY2F0aW9ufTogJHtpZ25vcmVGaWxlfSBzaG91bGQgbm90IGlnbm9yZSAke2lzRGlyID8gJ2RpcicgOiAnZmlsZSd9ICR7cHJlZml4fSR7cmF3SW5wdXR9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBhc3NlcnROb1RyYXZlcnNlcyhpZ25vcmVGaWxlOiBzdHJpbmcsIGlnbm9yZUZpbGVMb2NhdGlvbjogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCBpZ25vcmVDYXNlID0gZmFsc2UpIHtcblx0Y29uc3QgcnVuV2l0aFByZWZpeCA9IHJ1bkFzc2VydChpbnB1dCwgaWdub3JlRmlsZSwgaWdub3JlRmlsZUxvY2F0aW9uLCBmYWxzZSwgdHJ1ZSwgaWdub3JlQ2FzZSk7XG5cblx0cnVuV2l0aFByZWZpeCgnJyk7XG5cdHJ1bldpdGhQcmVmaXgoJy9zb21lRm9sZGVyJyk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydFRyYXZlcnNlcyhpZ25vcmVGaWxlOiBzdHJpbmcsIGlnbm9yZUZpbGVMb2NhdGlvbjogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCBpZ25vcmVDYXNlID0gZmFsc2UpIHtcblx0Y29uc3QgcnVuV2l0aFByZWZpeCA9IHJ1bkFzc2VydChpbnB1dCwgaWdub3JlRmlsZSwgaWdub3JlRmlsZUxvY2F0aW9uLCB0cnVlLCB0cnVlLCBpZ25vcmVDYXNlKTtcblxuXHRydW5XaXRoUHJlZml4KCcnKTtcblx0cnVuV2l0aFByZWZpeCgnL3NvbWVGb2xkZXInKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0SWdub3JlTWF0Y2goaWdub3JlRmlsZTogc3RyaW5nLCBpZ25vcmVGaWxlTG9jYXRpb246IHN0cmluZywgaW5wdXQ6IHN0cmluZywgaWdub3JlQ2FzZSA9IGZhbHNlKSB7XG5cdGNvbnN0IHJ1bldpdGhQcmVmaXggPSBydW5Bc3NlcnQoaW5wdXQsIGlnbm9yZUZpbGUsIGlnbm9yZUZpbGVMb2NhdGlvbiwgdHJ1ZSwgZmFsc2UsIGlnbm9yZUNhc2UpO1xuXG5cdHJ1bldpdGhQcmVmaXgoJycpO1xuXHRydW5XaXRoUHJlZml4KCcvc29tZUZvbGRlcicpO1xufVxuXG5mdW5jdGlvbiBhc3NlcnROb0lnbm9yZU1hdGNoKGlnbm9yZUZpbGU6IHN0cmluZywgaWdub3JlRmlsZUxvY2F0aW9uOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcsIGlnbm9yZUNhc2UgPSBmYWxzZSkge1xuXHRjb25zdCBydW5XaXRoUHJlZml4ID0gcnVuQXNzZXJ0KGlucHV0LCBpZ25vcmVGaWxlLCBpZ25vcmVGaWxlTG9jYXRpb24sIGZhbHNlLCBmYWxzZSwgaWdub3JlQ2FzZSk7XG5cblx0cnVuV2l0aFByZWZpeCgnJyk7XG5cdHJ1bldpdGhQcmVmaXgoJy9zb21lRm9sZGVyJyk7XG59XG5cbnN1aXRlKCdQYXJzaW5nIC5naXRpZ25vcmUgZmlsZXMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3BhdGhzIHdpdGggdHJhaWxpbmcgc2xhc2hlcyBkbyBub3QgbWF0Y2ggZmlsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaSA9ICdub2RlX21vZHVsZXMvXFxuJztcblxuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9ub2RlX21vZHVsZXMvJyk7XG5cblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbm9kZV9tb2R1bGVzLycpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzaW5nIHNpbXBsZSBnaXRpZ25vcmUgZmlsZXMnLCAoKSA9PiB7XG5cdFx0bGV0IGkgPSAnbm9kZV9tb2R1bGVzXFxub3V0XFxuJztcblxuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnROb1RyYXZlcnNlcyhpLCAnLycsICcvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcy9maWxlJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2Rpci9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvZGlyL25vZGVfbW9kdWxlcy9maWxlJyk7XG5cblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvb3V0Jyk7XG5cdFx0YXNzZXJ0Tm9UcmF2ZXJzZXMoaSwgJy8nLCAnL291dCcpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9vdXQvZmlsZScpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9kaXIvb3V0Jyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2Rpci9vdXQvZmlsZScpO1xuXG5cdFx0aSA9ICcvbm9kZV9tb2R1bGVzXFxuL291dFxcbic7XG5cblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcy9maWxlJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvZGlyL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2Rpci9ub2RlX21vZHVsZXMvZmlsZScpO1xuXG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL291dCcpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9vdXQvZmlsZScpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2Rpci9vdXQnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9kaXIvb3V0L2ZpbGUnKTtcblxuXHRcdGkgPSAnbm9kZV9tb2R1bGVzL1xcbm91dC9cXG4nO1xuXG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcy8nKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvbm9kZV9tb2R1bGVzL2ZpbGUnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvZGlyL25vZGVfbW9kdWxlcy8nKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9kaXIvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2Rpci9ub2RlX21vZHVsZXMvZmlsZScpO1xuXG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL291dC8nKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9vdXQnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvb3V0L2ZpbGUnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9kaXIvb3V0Jyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2Rpci9vdXQvJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2Rpci9vdXQvZmlsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzaW5nIGZpbGVzLWluLWZvbGRlciBleGNsdWRlJywgKCkgPT4ge1xuXHRcdGxldCBpID0gJ25vZGVfbW9kdWxlcy8qXFxuJztcblxuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcy8nKTtcblx0XHRhc3NlcnRUcmF2ZXJzZXMoaSwgJy8nLCAnL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydFRyYXZlcnNlcyhpLCAnLycsICcvbm9kZV9tb2R1bGVzLycpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9ub2RlX21vZHVsZXMvc29tZXRoaW5nJyk7XG5cdFx0YXNzZXJ0Tm9UcmF2ZXJzZXMoaSwgJy8nLCAnL25vZGVfbW9kdWxlcy9zb21ldGhpbmcnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvbm9kZV9tb2R1bGVzL3NvbWV0aGluZy9lbHNlJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcy9AdHlwZXMnKTtcblx0XHRhc3NlcnROb1RyYXZlcnNlcyhpLCAnLycsICcvbm9kZV9tb2R1bGVzL0B0eXBlcycpO1xuXG5cdFx0aSA9ICdub2RlX21vZHVsZXMvKiovKlxcbic7XG5cblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9ub2RlX21vZHVsZXMvJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcy9zb21ldGhpbmcnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvbm9kZV9tb2R1bGVzL3NvbWV0aGluZy9lbHNlJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL25vZGVfbW9kdWxlcy9AdHlwZXMnKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2luZyBzaW1wbGUgbmVnYXRpb25zJywgKCkgPT4ge1xuXHRcdGxldCBpID0gJ25vZGVfbW9kdWxlcy8qXFxuIW5vZGVfbW9kdWxlcy9AdHlwZXNcXG4nO1xuXG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0VHJhdmVyc2VzKGksICcvJywgJy9ub2RlX21vZHVsZXMnKTtcblxuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9ub2RlX21vZHVsZXMvc29tZXRoaW5nJyk7XG5cdFx0YXNzZXJ0Tm9UcmF2ZXJzZXMoaSwgJy8nLCAnL25vZGVfbW9kdWxlcy9zb21ldGhpbmcnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvbm9kZV9tb2R1bGVzL3NvbWV0aGluZy9lbHNlJyk7XG5cblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9ub2RlX21vZHVsZXMvQHR5cGVzJyk7XG5cdFx0YXNzZXJ0VHJhdmVyc2VzKGksICcvJywgJy9ub2RlX21vZHVsZXMvQHR5cGVzJyk7XG5cdFx0YXNzZXJ0VHJhdmVyc2VzKGksICcvJywgJy9ub2RlX21vZHVsZXMvQHR5cGVzL2Jvb3AnKTtcblxuXHRcdGkgPSAnKi5sb2dcXG4haW1wb3J0YW50LmxvZ1xcbic7XG5cblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvdGVzdC5sb2cnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvdGVzdC5sb2cnKTtcblxuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2ltcG9ydGFudC5sb2cnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9pbXBvcnRhbnQubG9nJyk7XG5cblx0XHRhc3NlcnROb1RyYXZlcnNlcyhpLCAnLycsICcvdGVzdC5sb2cnKTtcblx0XHRhc3NlcnROb1RyYXZlcnNlcyhpLCAnLycsICcvaW5uZXIvdGVzdC5sb2cnKTtcblx0XHRhc3NlcnRUcmF2ZXJzZXMoaSwgJy8nLCAnL2ltcG9ydGFudC5sb2cnKTtcblx0XHRhc3NlcnRUcmF2ZXJzZXMoaSwgJy8nLCAnL2lubmVyL2ltcG9ydGFudC5sb2cnKTtcblx0fSk7XG5cblx0dGVzdCgnbmVzdGVkIC5naXRpZ25vcmVzJywgKCkgPT4ge1xuXHRcdGxldCBpID0gJ25vZGVfbW9kdWxlc1xcbm91dFxcbic7XG5cblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnL2lubmVyLycsICcvaW5uZXIvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy9pbm5lci8nLCAnL2lubmVyL21vcmUvbm9kZV9tb2R1bGVzJyk7XG5cblxuXHRcdGkgPSAnL25vZGVfbW9kdWxlc1xcbi9vdXRcXG4nO1xuXG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy9pbm5lci8nLCAnL2lubmVyL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy9pbm5lci8nLCAnL2lubmVyL21vcmUvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnL2lubmVyLycsICcvbm9kZV9tb2R1bGVzJyk7XG5cblx0XHRpID0gJ25vZGVfbW9kdWxlcy9cXG5vdXQvXFxuJztcblxuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy9pbm5lci8nLCAnL2lubmVyL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvaW5uZXIvJywgJy9pbm5lci9ub2RlX21vZHVsZXMvJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnL2lubmVyLycsICcvaW5uZXIvbW9yZS9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnL2lubmVyLycsICcvaW5uZXIvbW9yZS9ub2RlX21vZHVsZXMvJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnL2lubmVyLycsICcvbm9kZV9tb2R1bGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUgZXh0ZW5zaW9uIG1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0bGV0IGkgPSAnKi5qc1xcbic7XG5cblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUudHMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvbXlGaWxlLmpzJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbXlGaWxlLnRzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL215RmlsZS5qcycpO1xuXG5cdFx0aSA9ICcvKi5qcyc7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvbXlGaWxlLnRzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL215RmlsZS5qcycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL215RmlsZS50cycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL215RmlsZS5qcycpO1xuXG5cdFx0aSA9ICcqKi8qLmpzJztcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUudHMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvbXlGaWxlLmpzJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbXlGaWxlLnRzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL215RmlsZS5qcycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL21vcmUvbXlGaWxlLnRzJyk7XG5cdFx0YXNzZXJ0SWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL21vcmUvbXlGaWxlLmpzJyk7XG5cblx0XHRpID0gJ2lubmVyLyouanMnO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL215RmlsZS50cycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL215RmlsZS5qcycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL215RmlsZS50cycpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9teUZpbGUuanMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9tb3JlL215RmlsZS50cycpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCAnL2lubmVyL21vcmUvbXlGaWxlLmpzJyk7XG5cblx0XHRpID0gJy9pbm5lci8qLmpzJztcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUudHMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUuanMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9teUZpbGUudHMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbXlGaWxlLmpzJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbW9yZS9teUZpbGUudHMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9tb3JlL215RmlsZS5qcycpO1xuXG5cdFx0aSA9ICcqKi9pbm5lci8qLmpzJztcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUudHMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUuanMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9teUZpbGUudHMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbXlGaWxlLmpzJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbW9yZS9teUZpbGUudHMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9tb3JlL215RmlsZS5qcycpO1xuXG5cdFx0aSA9ICcqKi9pbm5lci8qKi8qLmpzJztcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUudHMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUuanMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9teUZpbGUudHMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbXlGaWxlLmpzJyk7XG5cdFx0YXNzZXJ0Tm9JZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbW9yZS9teUZpbGUudHMnKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsICcvaW5uZXIvbW9yZS9teUZpbGUuanMnKTtcblxuXHRcdGkgPSAnKiovbW9yZS8qLmpzJztcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUudHMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9teUZpbGUuanMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9teUZpbGUudHMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9teUZpbGUuanMnKTtcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9tb3JlL215RmlsZS50cycpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgJy9pbm5lci9tb3JlL215RmlsZS5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWFsIHdvcmxkIGV4YW1wbGU6IHZzY29kZS1qcy1kZWJ1ZycsICgpID0+IHtcblx0XHRjb25zdCBpID0gYC5jYWNoZS9cblx0XHRcdC5wcm9maWxlL1xuXHRcdFx0LmNkcC1wcm9maWxlL1xuXHRcdFx0LmhlYWRsZXNzLXByb2ZpbGUvXG5cdFx0XHQudnNjb2RlLXRlc3QvXG5cdFx0XHQuRFNfU3RvcmVcblx0XHRcdG5vZGVfbW9kdWxlcy9cblx0XHRcdG91dC9cblx0XHRcdGRpc3Rcblx0XHRcdC9jb3ZlcmFnZVxuXHRcdFx0Ly5ueWNfb3V0cHV0XG5cdFx0XHRkZW1vcy93ZWItd29ya2VyL3ZzY29kZS1wd2EtZGFwLmxvZ1xuXHRcdFx0ZGVtb3Mvd2ViLXdvcmtlci92c2NvZGUtcHdhLWNkcC5sb2dcblx0XHRcdC5keW5hbWljLXRlc3RXb3Jrc3BhY2Vcblx0XHRcdCoqL3Rlc3QvKiovKi5hY3R1YWxcblx0XHRcdC90ZXN0V29ya3NwYWNlL3dlYi90bXBcblx0XHRcdC90ZXN0V29ya3NwYWNlLyoqL2RlYnVnLmxvZ1xuXHRcdFx0L3Rlc3RXb3Jrc3BhY2Uvd2Vidmlldy93aW4vdHJ1ZS9cblx0XHRcdCouY3B1cHJvZmlsZWA7XG5cblx0XHRjb25zdCBpbmNsdWRlZCA9IFtcblx0XHRcdCcvZGlzdHJvJyxcblxuXHRcdFx0Jy9pbm5lci9jb3ZlcmFnZScsXG5cdFx0XHQnL2lubmVyLy5ueWNfb3V0cHV0JyxcblxuXHRcdFx0Jy9pbm5lci9kZW1vcy93ZWItd29ya2VyL3ZzY29kZS1wd2EtZGFwLmxvZycsXG5cdFx0XHQnL2lubmVyL2RlbW9zL3dlYi13b3JrZXIvdnNjb2RlLXB3YS1jZHAubG9nJyxcblxuXHRcdFx0Jy90ZXN0V29ya3NwYWNlL3dlYnZpZXcvd2luL3RydWUnLFxuXG5cdFx0XHQnL2EvYmVzdC9iL2MuYWN0dWFsJyxcblx0XHRcdCcvYmVzdC9iL2MuYWN0dWFsJyxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZXhjbHVkZWQgPSBbXG5cdFx0XHQnLy5wcm9maWxlLycsXG5cdFx0XHQnL2lubmVyLy5wcm9maWxlLycsXG5cblx0XHRcdCcvLkRTX1N0b3JlJyxcblx0XHRcdCcvaW5uZXIvLkRTX1N0b3JlJyxcblxuXHRcdFx0Jy9jb3ZlcmFnZScsXG5cdFx0XHQnLy5ueWNfb3V0cHV0JyxcblxuXHRcdFx0Jy9kZW1vcy93ZWItd29ya2VyL3ZzY29kZS1wd2EtZGFwLmxvZycsXG5cdFx0XHQnL2RlbW9zL3dlYi13b3JrZXIvdnNjb2RlLXB3YS1jZHAubG9nJyxcblxuXHRcdFx0Jy8uZHluYW1pYy10ZXN0V29ya3NwYWNlJyxcblx0XHRcdCcvaW5uZXIvLmR5bmFtaWMtdGVzdFdvcmtzcGFjZScsXG5cblx0XHRcdCcvdGVzdC8uYWN0dWFsJyxcblx0XHRcdCcvdGVzdC9oZWxsby5hY3R1YWwnLFxuXHRcdFx0Jy9hL3Rlc3QvLmFjdHVhbCcsXG5cdFx0XHQnL2EvdGVzdC9iLmFjdHVhbCcsXG5cdFx0XHQnL2EvdGVzdC9iLy5hY3R1YWwnLFxuXHRcdFx0Jy9hL3Rlc3QvYi9jLmFjdHVhbCcsXG5cdFx0XHQnL2EvYi90ZXN0Ly5hY3R1YWwnLFxuXHRcdFx0Jy9hL2IvdGVzdC9mL2MuYWN0dWFsJyxcblxuXHRcdFx0Jy90ZXN0V29ya3NwYWNlL3dlYi90bXAnLFxuXG5cdFx0XHQnL3Rlc3RXb3Jrc3BhY2UvZGVidWcubG9nJyxcblx0XHRcdCcvdGVzdFdvcmtzcGFjZS9hL2RlYnVnLmxvZycsXG5cdFx0XHQnL3Rlc3RXb3Jrc3BhY2UvYS9iL2RlYnVnLmxvZycsXG5cblx0XHRcdCcvdGVzdFdvcmtzcGFjZS93ZWJ2aWV3L3dpbi90cnVlLycsXG5cblx0XHRcdCcvLmNwdXByb2ZpbGUnLFxuXHRcdFx0Jy9hLmNwdXByb2ZpbGUnLFxuXHRcdFx0Jy9hYS9hLmNwdXByb2ZpbGUnLFxuXHRcdFx0Jy9hYWEvYWEvYS5jcHVwcm9maWxlJyxcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBpbmNsdWRlIG9mIGluY2x1ZGVkKSB7XG5cdFx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGksICcvJywgaW5jbHVkZSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBleGNsdWRlIG9mIGV4Y2x1ZGVkKSB7XG5cdFx0XHRhc3NlcnRJZ25vcmVNYXRjaChpLCAnLycsIGV4Y2x1ZGUpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVhbCB3b3JsZCBleGFtcGxlOiB2c2NvZGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaSA9IGAuRFNfU3RvcmVcblx0XHRcdC5jYWNoZVxuXHRcdFx0bnBtLWRlYnVnLmxvZ1xuXHRcdFx0VGh1bWJzLmRiXG5cdFx0XHRub2RlX21vZHVsZXMvXG5cdFx0XHQuYnVpbGQvXG5cdFx0XHRleHRlbnNpb25zLyoqL2Rpc3QvXG5cdFx0XHQvb3V0Ki9cblx0XHRcdC9leHRlbnNpb25zLyoqL291dC9cblx0XHRcdHNyYy92cy9zZXJ2ZXJcblx0XHRcdHJlc291cmNlcy9zZXJ2ZXJcblx0XHRcdGJ1aWxkL25vZGVfbW9kdWxlc1xuXHRcdFx0Y292ZXJhZ2UvXG5cdFx0XHR0ZXN0X2RhdGEvXG5cdFx0XHR0ZXN0LXJlc3VsdHMvXG5cdFx0XHR5YXJuLWVycm9yLmxvZ1xuXHRcdFx0dnNjb2RlLmxzaWZcblx0XHRcdHZzY29kZS5kYlxuXHRcdFx0Ly5wcm9maWxlLW9zc2A7XG5cblx0XHRjb25zdCBpbmNsdWRlZCA9IFtcblx0XHRcdCcvaW5uZXIvZXh0ZW5zaW9ucy9kaXN0Jyxcblx0XHRcdCcvaW5uZXIvZXh0ZW5zaW9ucy9ib29wL2Rpc3QvdGVzdCcsXG5cdFx0XHQnL2lubmVyL2V4dGVuc2lvbnMvYm9vcC9kb29wL2Rpc3QnLFxuXHRcdFx0Jy9pbm5lci9leHRlbnNpb25zL2Jvb3AvZG9vcC9kaXN0L3Rlc3QnLFxuXHRcdFx0Jy9pbm5lci9leHRlbnNpb25zL2Jvb3AvZG9vcC9kaXN0L3Rlc3QnLFxuXG5cdFx0XHQnL2lubmVyL2V4dGVuc2lvbnMvb3V0L3Rlc3QnLFxuXHRcdFx0Jy9pbm5lci9leHRlbnNpb25zL2Jvb3Avb3V0Jyxcblx0XHRcdCcvaW5uZXIvZXh0ZW5zaW9ucy9ib29wL291dC90ZXN0JyxcblxuXHRcdFx0Jy9pbm5lci9vdXQvJyxcblx0XHRcdCcvaW5uZXIvb3V0L3Rlc3QnLFxuXHRcdFx0Jy9pbm5lci9vdXQxLycsXG5cdFx0XHQnL2lubmVyL291dDEvdGVzdCcsXG5cdFx0XHQnL2lubmVyL291dDIvJyxcblx0XHRcdCcvaW5uZXIvb3V0Mi90ZXN0JyxcblxuXHRcdFx0Jy9pbm5lci8ucHJvZmlsZS1vc3MnLFxuXG5cdFx0XHQvLyBGaWxlcy5cblx0XHRcdCcvZXh0ZW5zaW9ucy9kaXN0Jyxcblx0XHRcdCcvZXh0ZW5zaW9ucy9ib29wL2Rvb3AvZGlzdCcsXG5cdFx0XHQnL2V4dGVuc2lvbnMvYm9vcC9vdXQnLFxuXHRcdF07XG5cblx0XHRjb25zdCBleGNsdWRlZCA9IFtcblx0XHRcdCcvZXh0ZW5zaW9ucy9kaXN0LycsXG5cdFx0XHQnL2V4dGVuc2lvbnMvYm9vcC9kaXN0L3Rlc3QnLFxuXHRcdFx0Jy9leHRlbnNpb25zL2Jvb3AvZG9vcC9kaXN0LycsXG5cdFx0XHQnL2V4dGVuc2lvbnMvYm9vcC9kb29wL2Rpc3QvdGVzdCcsXG5cdFx0XHQnL2V4dGVuc2lvbnMvYm9vcC9kb29wL2Rpc3QvdGVzdCcsXG5cblx0XHRcdCcvZXh0ZW5zaW9ucy9vdXQvdGVzdCcsXG5cdFx0XHQnL2V4dGVuc2lvbnMvYm9vcC9vdXQvJyxcblx0XHRcdCcvZXh0ZW5zaW9ucy9ib29wL291dC90ZXN0JyxcblxuXHRcdFx0Jy9vdXQvJyxcblx0XHRcdCcvb3V0L3Rlc3QnLFxuXHRcdFx0Jy9vdXQxLycsXG5cdFx0XHQnL291dDEvdGVzdCcsXG5cdFx0XHQnL291dDIvJyxcblx0XHRcdCcvb3V0Mi90ZXN0JyxcblxuXHRcdFx0Jy8ucHJvZmlsZS1vc3MnLFxuXHRcdF07XG5cblx0XHRmb3IgKGNvbnN0IGluY2x1ZGUgb2YgaW5jbHVkZWQpIHtcblx0XHRcdGFzc2VydE5vSWdub3JlTWF0Y2goaSwgJy8nLCBpbmNsdWRlKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGV4Y2x1ZGUgb2YgZXhjbHVkZWQpIHtcblx0XHRcdGFzc2VydElnbm9yZU1hdGNoKGksICcvJywgZXhjbHVkZSk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdHRlc3QoJ3ZhcmlvdXMgYWR2YW5jZWQgY29uc3RydWN0cyBmb3VuZCBpbiBwb3B1bGFyIHJlcG9zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJ1blRlc3QgPSAoeyBwYXR0ZXJuLCBpbmNsdWRlZCwgZXhjbHVkZWQgfTogeyBwYXR0ZXJuOiBzdHJpbmc7IGluY2x1ZGVkOiBzdHJpbmdbXTsgZXhjbHVkZWQ6IHN0cmluZ1tdIH0pID0+IHtcblx0XHRcdGZvciAoY29uc3QgaW5jbHVkZSBvZiBpbmNsdWRlZCkge1xuXHRcdFx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKHBhdHRlcm4sICcvJywgaW5jbHVkZSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZXhjbHVkZSBvZiBleGNsdWRlZCkge1xuXHRcdFx0XHRhc3NlcnRJZ25vcmVNYXRjaChwYXR0ZXJuLCAnLycsIGV4Y2x1ZGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRydW5UZXN0KHtcblx0XHRcdHBhdHRlcm46IGAqKi9ub2RlX21vZHVsZXNcblx0XHRcdC9wYWNrYWdlcy8qL2Rpc3RgLFxuXG5cdFx0XHRleGNsdWRlZDogW1xuXHRcdFx0XHQnL25vZGVfbW9kdWxlcycsXG5cdFx0XHRcdCcvdGVzdC9ub2RlX21vZHVsZXMnLFxuXHRcdFx0XHQnL25vZGVfbW9kdWxlcy90ZXN0Jyxcblx0XHRcdFx0Jy90ZXN0L25vZGVfbW9kdWxlcy90ZXN0JyxcblxuXHRcdFx0XHQnL3BhY2thZ2VzL2EvZGlzdCcsXG5cdFx0XHRcdCcvcGFja2FnZXMvYWJjL2Rpc3QnLFxuXHRcdFx0XHQnL3BhY2thZ2VzL2FiYy9kaXN0L3Rlc3QnLFxuXHRcdFx0XSxcblx0XHRcdGluY2x1ZGVkOiBbXG5cdFx0XHRcdCcvaW5uZXIvcGFja2FnZXMvYS9kaXN0Jyxcblx0XHRcdFx0Jy9pbm5lci9wYWNrYWdlcy9hYmMvZGlzdCcsXG5cdFx0XHRcdCcvaW5uZXIvcGFja2FnZXMvYWJjL2Rpc3QvdGVzdCcsXG5cblx0XHRcdFx0Jy9wYWNrYWdlcy9kaXN0Jyxcblx0XHRcdFx0Jy9wYWNrYWdlcy9kaXN0L3Rlc3QnLFxuXHRcdFx0XHQnL3BhY2thZ2VzL2EvYi9kaXN0Jyxcblx0XHRcdFx0Jy9wYWNrYWdlcy9hL2IvZGlzdC90ZXN0Jyxcblx0XHRcdF0sXG5cdFx0fSk7XG5cblx0XHRydW5UZXN0KHtcblx0XHRcdHBhdHRlcm46IGAueWFybi8qXG5cdFx0XHQjICEueWFybi9jYWNoZVxuXHRcdFx0IS55YXJuL3BhdGNoZXNcblx0XHRcdCEueWFybi9wbHVnaW5zXG5cdFx0XHQhLnlhcm4vcmVsZWFzZXNcblx0XHRcdCEueWFybi9zZGtzXG5cdFx0XHQhLnlhcm4vdmVyc2lvbnNgLFxuXG5cdFx0XHRleGNsdWRlZDogW1xuXHRcdFx0XHQnLy55YXJuL3Rlc3QnLFxuXHRcdFx0XHQnLy55YXJuL2NhY2hlJyxcblx0XHRcdF0sXG5cdFx0XHRpbmNsdWRlZDogW1xuXHRcdFx0XHQnL2lubmVyLy55YXJuL3Rlc3QnLFxuXHRcdFx0XHQnL2lubmVyLy55YXJuL2NhY2hlJyxcblxuXHRcdFx0XHQnLy55YXJuL3BhdGNoZXMnLFxuXHRcdFx0XHQnLy55YXJuL3BsdWdpbnMnLFxuXHRcdFx0XHQnLy55YXJuL3JlbGVhc2VzJyxcblx0XHRcdFx0Jy8ueWFybi9zZGtzJyxcblx0XHRcdFx0Jy8ueWFybi92ZXJzaW9ucycsXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0cnVuVGVzdCh7XG5cdFx0XHRwYXR0ZXJuOiBgWy5fXSpzW2Etd11bYS16XVxuXHRcdFx0Wy5fXXNbYS13XVthLXpdXG5cdFx0XHQqLnVuflxuXHRcdFx0Kn5gLFxuXG5cdFx0XHRleGNsdWRlZDogW1xuXHRcdFx0XHQnL34nLFxuXHRcdFx0XHQnL2FiY34nLFxuXHRcdFx0XHQnL2lubmVyL34nLFxuXHRcdFx0XHQnL2lubmVyL2FiY34nLFxuXHRcdFx0XHQnLy51bn4nLFxuXHRcdFx0XHQnL2EudW5+Jyxcblx0XHRcdFx0Jy90ZXN0Ly51bn4nLFxuXHRcdFx0XHQnL3Rlc3QvYS51bn4nLFxuXHRcdFx0XHQnLy5zYWEnLFxuXHRcdFx0XHQnLy4uLi5zYWEnLFxuXHRcdFx0XHQnLy5fLl9zYnknLFxuXHRcdFx0XHQnL2lubmVyLy5fLl9zYnknLFxuXHRcdFx0XHQnL19zd3onLFxuXHRcdFx0XSxcblx0XHRcdGluY2x1ZGVkOiBbXG5cdFx0XHRcdCcvLmphYScsXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0Ly8gVE9ETzogdGhlIHJlc3Qgb2YgdGhlc2UgOilcblx0XHRydW5UZXN0KHtcblx0XHRcdHBhdHRlcm46IGAqLnBieHVzZXJcblx0XHRcdCFkZWZhdWx0LnBieHVzZXJcblx0XHRcdCoubW9kZTF2M1xuXHRcdFx0IWRlZmF1bHQubW9kZTF2M1xuXHRcdFx0Ki5tb2RlMnYzXG5cdFx0XHQhZGVmYXVsdC5tb2RlMnYzXG5cdFx0XHQqLnBlcnNwZWN0aXZldjNcblx0XHRcdCFkZWZhdWx0LnBlcnNwZWN0aXZldjNgLFxuXHRcdFx0ZXhjbHVkZWQ6IFtdLFxuXHRcdFx0aW5jbHVkZWQ6IFtdLFxuXHRcdH0pO1xuXG5cdFx0cnVuVGVzdCh7XG5cdFx0XHRwYXR0ZXJuOiBgW0RkXWVidWcvXG5cdFx0XHRbRGRdZWJ1Z1B1YmxpYy9cblx0XHRcdFtScl1lbGVhc2UvXG5cdFx0XHRbUnJdZWxlYXNlcy9cblx0XHRcdCouW01tXWV0cmljcy54bWxcblx0XHRcdFtUdF1lc3RbUnJdZXN1bHQqL1xuXHRcdFx0W0JiXXVpbGRbTGxdb2cuKlxuXHRcdFx0YmxkL1xuXHRcdFx0W0JiXWluL1xuXHRcdFx0W09vXWJqL1xuXHRcdFx0W0xsXW9nL2AsXG5cdFx0XHRleGNsdWRlZDogW10sXG5cdFx0XHRpbmNsdWRlZDogW10sXG5cdFx0fSk7XG5cblx0XHRydW5UZXN0KHtcblx0XHRcdHBhdHRlcm46IGBEb2NrZXJmaWxlKlxuXHRcdFx0IS90ZXN0cy9idWQvKi9Eb2NrZXJmaWxlKlxuXHRcdFx0IS90ZXN0cy9jb25mb3JtYW5jZS8qKi9Eb2NrZXJmaWxlKmAsXG5cdFx0XHRleGNsdWRlZDogW10sXG5cdFx0XHRpbmNsdWRlZDogW10sXG5cdFx0fSk7XG5cblx0XHRydW5UZXN0KHtcblx0XHRcdHBhdHRlcm46IGAqLnBkZlxuXHRcdFx0Ki5odG1sXG5cdFx0XHQhYXV0aG9yX2Jpby5odG1sXG5cdFx0XHQhY29sby5odG1sXG5cdFx0XHQhY29weXJpZ2h0Lmh0bWxcblx0XHRcdCFjb3Zlci5odG1sXG5cdFx0XHQhaXguaHRtbFxuXHRcdFx0IXRpdGxlcGFnZS5odG1sXG5cdFx0XHQhdG9jLmh0bWxgLFxuXHRcdFx0ZXhjbHVkZWQ6IFtdLFxuXHRcdFx0aW5jbHVkZWQ6IFtdLFxuXHRcdH0pO1xuXG5cdFx0cnVuVGVzdCh7XG5cdFx0XHRwYXR0ZXJuOiBgL2xvZy8qXG5cdFx0XHQvdG1wLypcblx0XHRcdCEvbG9nLy5rZWVwXG5cdFx0XHQhL3RtcC8ua2VlcGAsXG5cdFx0XHRleGNsdWRlZDogW10sXG5cdFx0XHRpbmNsdWRlZDogW10sXG5cdFx0fSk7XG5cblx0fSk7XG5cblx0dGVzdCgnY2hpbGQgbmVnYXRpb24gb3ZlcnJpZGVzIHBhcmVudCBpZ25vcmUnLCAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGVzOiBnbG9iYWwgZ2l0aWdub3JlIGhhcyBgLm15Y29uZmlnYCwgcHJvamVjdCAuZ2l0aWdub3JlIGhhcyBgIS5teWNvbmZpZy9gXG5cdFx0Ly8gVGhlIGNoaWxkIG5lZ2F0aW9uIHNob3VsZCBvdmVycmlkZSB0aGUgcGFyZW50IHBvc2l0aXZlIHBhdHRlcm4uXG5cdFx0Y29uc3QgcGFyZW50SWdub3JlID0gbmV3IElnbm9yZUZpbGUoJy5teWNvbmZpZ1xcbicsICcvJyk7XG5cdFx0Y29uc3QgY2hpbGRJZ25vcmUgPSBuZXcgSWdub3JlRmlsZSgnIS5teWNvbmZpZy9cXG4nLCAnLycsIHBhcmVudElnbm9yZSk7XG5cblx0XHQvLyBUaGUgZGlyZWN0b3J5IHNob3VsZCBOT1QgYmUgaWdub3JlZCAoY2hpbGQgbmVnYXRlcyBwYXJlbnQpXG5cdFx0YXNzZXJ0KCFjaGlsZElnbm9yZS5pc0FyYml0cmFyeVBhdGhJZ25vcmVkKCcvLm15Y29uZmlnJywgdHJ1ZSksXG5cdFx0XHQnY2hpbGQgIS5teWNvbmZpZy8gc2hvdWxkIG92ZXJyaWRlIHBhcmVudCAubXljb25maWcgZm9yIGRpcmVjdG9yaWVzJyk7XG5cblx0XHQvLyBGaWxlcyBpbnNpZGUgdGhlIGRpcmVjdG9yeSBzaG91bGQgYWxzbyBub3QgYmUgaWdub3JlZFxuXHRcdGFzc2VydCghY2hpbGRJZ25vcmUuaXNBcmJpdHJhcnlQYXRoSWdub3JlZCgnLy5teWNvbmZpZy9zZXR0aW5ncy90ZXN0Lm1kJywgZmFsc2UpLFxuXHRcdFx0J2ZpbGVzIGluc2lkZSB1bi1pZ25vcmVkIGRpcmVjdG9yeSBzaG91bGQgbm90IGJlIGlnbm9yZWQnKTtcblxuXHRcdC8vIFBhcmVudCBzaG91bGQgc3RpbGwgaWdub3JlIHdoZW4gY2hpbGQgaGFzIG5vIG5lZ2F0aW9uXG5cdFx0Y29uc3QgY2hpbGROb05lZ2F0aW9uID0gbmV3IElnbm9yZUZpbGUoJ25vZGVfbW9kdWxlcy9cXG4nLCAnLycsIHBhcmVudElnbm9yZSk7XG5cdFx0YXNzZXJ0KGNoaWxkTm9OZWdhdGlvbi5pc0FyYml0cmFyeVBhdGhJZ25vcmVkKCcvLm15Y29uZmlnJywgdHJ1ZSksXG5cdFx0XHQnd2l0aG91dCBuZWdhdGlvbiwgcGFyZW50IGlnbm9yZSBzaG91bGQgc3RpbGwgYXBwbHkgZm9yIGRpcmVjdG9yaWVzJyk7XG5cdFx0YXNzZXJ0KGNoaWxkTm9OZWdhdGlvbi5pc0FyYml0cmFyeVBhdGhJZ25vcmVkKCcvLm15Y29uZmlnL3NldHRpbmdzL3Rlc3QubWQnLCBmYWxzZSksXG5cdFx0XHQnd2l0aG91dCBuZWdhdGlvbiwgZmlsZXMgdW5kZXIgcGFyZW50LWlnbm9yZWQgZGlyZWN0b3J5IHNob3VsZCBzdGlsbCBiZSBpZ25vcmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoaWxkIG5lZ2F0aW9uIG92ZXJyaWRlcyBwYXJlbnQgaWdub3JlIGZvciBmaWxlcycsICgpID0+IHtcblx0XHQvLyBQYXJlbnQgaWdub3JlcyBhbGwgLmxvZyBmaWxlcywgY2hpbGQgdW4taWdub3JlcyBpbXBvcnRhbnQubG9nXG5cdFx0Y29uc3QgcGFyZW50SWdub3JlID0gbmV3IElnbm9yZUZpbGUoJyoubG9nXFxuJywgJy8nKTtcblx0XHRjb25zdCBjaGlsZElnbm9yZSA9IG5ldyBJZ25vcmVGaWxlKCchaW1wb3J0YW50LmxvZ1xcbicsICcvJywgcGFyZW50SWdub3JlKTtcblxuXHRcdGFzc2VydCghY2hpbGRJZ25vcmUuaXNBcmJpdHJhcnlQYXRoSWdub3JlZCgnL2ltcG9ydGFudC5sb2cnLCBmYWxzZSksXG5cdFx0XHQnY2hpbGQgIWltcG9ydGFudC5sb2cgc2hvdWxkIG92ZXJyaWRlIHBhcmVudCAqLmxvZycpO1xuXHRcdGFzc2VydChjaGlsZElnbm9yZS5pc0FyYml0cmFyeVBhdGhJZ25vcmVkKCcvb3RoZXIubG9nJywgZmFsc2UpLFxuXHRcdFx0J290aGVyIC5sb2cgZmlsZXMgc2hvdWxkIHN0aWxsIGJlIGlnbm9yZWQgdmlhIHBhcmVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXNlLWluc2Vuc2l0aXZlIGlnbm9yZSBmaWxlcycsICgpID0+IHtcblx0XHRjb25zdCBmMSA9ICdub2RlX21vZHVsZXMvXFxuJztcblx0XHRhc3NlcnROb0lnbm9yZU1hdGNoKGYxLCAnLycsICcvTm9kZV9Nb2R1bGVzLycsIGZhbHNlKTtcblx0XHRhc3NlcnRJZ25vcmVNYXRjaChmMSwgJy8nLCAnL05vZGVfTW9kdWxlcy8nLCB0cnVlKTtcblxuXHRcdGNvbnN0IGYyID0gJ05PREVfTU9EVUxFUy9cXG4nO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goZjIsICcvJywgJy9Ob2RlX01vZHVsZXMvJywgZmFsc2UpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGYyLCAnLycsICcvTm9kZV9Nb2R1bGVzLycsIHRydWUpO1xuXG5cdFx0Y29uc3QgZjMgPSBgXG5cdFx0XHR0ZW1wLypcblx0XHRcdCF0ZW1wL2tlZXBcblx0XHRgO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goZjMsICcvJywgJy9URU1QL290aGVyJywgZmFsc2UpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGYzLCAnLycsICcvdGVtcC9LRUVQJywgZmFsc2UpO1xuXHRcdGFzc2VydElnbm9yZU1hdGNoKGYzLCAnLycsICcvVEVNUC9vdGhlcicsIHRydWUpO1xuXHRcdGFzc2VydE5vSWdub3JlTWF0Y2goZjMsICcvJywgJy9URU1QL0tFRVAnLCB0cnVlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLFVBQVUs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QUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFFRCxZQUFRO0FBQUEsTUFDUCxTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFLVCxVQUFVO0FBQUEsUUFDVDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNUO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUdELFlBQVE7QUFBQSxNQUNQLFNBQVM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BUVQsVUFBVSxDQUFDO0FBQUEsTUFDWCxVQUFVLENBQUM7QUFBQSxJQUNaLENBQUM7QUFFRCxZQUFRO0FBQUEsTUFDUCxTQUFTO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQVdULFVBQVUsQ0FBQztBQUFBLE1BQ1gsVUFBVSxDQUFDO0FBQUEsSUFDWixDQUFDO0FBRUQsWUFBUTtBQUFBLE1BQ1AsU0FBUztBQUFBO0FBQUE7QUFBQSxNQUdULFVBQVUsQ0FBQztBQUFBLE1BQ1gsVUFBVSxDQUFDO0FBQUEsSUFDWixDQUFDO0FBRUQsWUFBUTtBQUFBLE1BQ1AsU0FBUztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQVNULFVBQVUsQ0FBQztBQUFBLE1BQ1gsVUFBVSxDQUFDO0FBQUEsSUFDWixDQUFDO0FBRUQsWUFBUTtBQUFBLE1BQ1AsU0FBUztBQUFBO0FBQUE7QUFBQTtBQUFBLE1BSVQsVUFBVSxDQUFDO0FBQUEsTUFDWCxVQUFVLENBQUM7QUFBQSxJQUNaLENBQUM7QUFBQSxFQUVGLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBR3BELFVBQU0sZUFBZSxJQUFJLFdBQVcsZUFBZSxHQUFHO0FBQ3RELFVBQU0sY0FBYyxJQUFJLFdBQVcsaUJBQWlCLEtBQUssWUFBWTtBQUdyRTtBQUFBLE1BQU8sQ0FBQyxZQUFZLHVCQUF1QixjQUFjLElBQUk7QUFBQSxNQUM1RDtBQUFBLElBQW9FO0FBR3JFO0FBQUEsTUFBTyxDQUFDLFlBQVksdUJBQXVCLCtCQUErQixLQUFLO0FBQUEsTUFDOUU7QUFBQSxJQUF5RDtBQUcxRCxVQUFNLGtCQUFrQixJQUFJLFdBQVcsbUJBQW1CLEtBQUssWUFBWTtBQUMzRTtBQUFBLE1BQU8sZ0JBQWdCLHVCQUF1QixjQUFjLElBQUk7QUFBQSxNQUMvRDtBQUFBLElBQW9FO0FBQ3JFO0FBQUEsTUFBTyxnQkFBZ0IsdUJBQXVCLCtCQUErQixLQUFLO0FBQUEsTUFDakY7QUFBQSxJQUFnRjtBQUFBLEVBQ2xGLENBQUM7QUFFRCxPQUFLLG9EQUFvRCxNQUFNO0FBRTlELFVBQU0sZUFBZSxJQUFJLFdBQVcsV0FBVyxHQUFHO0FBQ2xELFVBQU0sY0FBYyxJQUFJLFdBQVcsb0JBQW9CLEtBQUssWUFBWTtBQUV4RTtBQUFBLE1BQU8sQ0FBQyxZQUFZLHVCQUF1QixrQkFBa0IsS0FBSztBQUFBLE1BQ2pFO0FBQUEsSUFBbUQ7QUFDcEQ7QUFBQSxNQUFPLFlBQVksdUJBQXVCLGNBQWMsS0FBSztBQUFBLE1BQzVEO0FBQUEsSUFBcUQ7QUFBQSxFQUN2RCxDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxVQUFNLEtBQUs7QUFDWCx3QkFBb0IsSUFBSSxLQUFLLGtCQUFrQixLQUFLO0FBQ3BELHNCQUFrQixJQUFJLEtBQUssa0JBQWtCLElBQUk7QUFFakQsVUFBTSxLQUFLO0FBQ1gsd0JBQW9CLElBQUksS0FBSyxrQkFBa0IsS0FBSztBQUNwRCxzQkFBa0IsSUFBSSxLQUFLLGtCQUFrQixJQUFJO0FBRWpELFVBQU0sS0FBSztBQUFBO0FBQUE7QUFBQTtBQUlYLHdCQUFvQixJQUFJLEtBQUssZUFBZSxLQUFLO0FBQ2pELHNCQUFrQixJQUFJLEtBQUssY0FBYyxLQUFLO0FBQzlDLHNCQUFrQixJQUFJLEtBQUssZUFBZSxJQUFJO0FBQzlDLHdCQUFvQixJQUFJLEtBQUssY0FBYyxJQUFJO0FBQUEsRUFDaEQsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
