import * as assert from "assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import {
  deepSeekCredentialSource,
  deepSeekCredentialsPath,
  deepSeekHarnessRoots,
  findDeepSeekHarnessRoot,
  findGrokBuildBinary,
  grokBuildBinaryCandidates,
  grokCredentialSource,
  hasDeepSeekWorkerCredentials,
  hasGrokWorkerCredentials,
  isExecutablePath,
  readDeepSeekApiKeyFromCredentials,
  resolveNodeNpmCli,
  resolveSpawnCommand
} from "../../../node/orchestration/workerRuntime.js";
import { resolveDeepSeekCommand, resolveGrokCommand } from "../../../node/orchestration/workerAdapters.js";
suite("Forge worker runtime", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("discovers harness roots under repo and user home", () => {
    const roots = deepSeekHarnessRoots("/app/resources/app");
    assert.ok(roots.some((root) => root.replace(/\\/g, "/").includes("third_party/deepseek-harness")));
    assert.ok(roots.some((root) => root.includes("deepseek-harness-master")));
    assert.ok(roots.some((root) => root.includes(".forge")));
  });
  test("discovers grok binary candidates under repo and user home", () => {
    const roots = grokBuildBinaryCandidates("/app/resources/app");
    assert.ok(roots.some((root) => root.replace(/\\/g, "/").includes("third_party/grok-build")));
    assert.ok(roots.some((root) => root.includes("grok-build-main")));
    assert.ok(roots.some((root) => root.includes(".forge") || root.includes(".grok")));
  });
  test("finds vendored harness and grok binary by walking up from appRoot", () => {
    const forgeRoot = mkdtempSync(join(tmpdir(), "forge-vendor-"));
    try {
      const appRoot = join(forgeRoot, "out");
      mkdirSync(join(forgeRoot, "third_party", "deepseek-harness", "apps", "cli", "src"), { recursive: true });
      mkdirSync(join(forgeRoot, "third_party", "grok-build", "bin"), { recursive: true });
      mkdirSync(appRoot, { recursive: true });
      writeFileSync(join(forgeRoot, "third_party", "deepseek-harness", "package.json"), '{"name":"dsh"}\n', "utf8");
      const grokBin = join(forgeRoot, "third_party", "grok-build", "bin", process.platform === "win32" ? "grok.exe" : "grok");
      writeFileSync(grokBin, "", "utf8");
      assert.strictEqual(findDeepSeekHarnessRoot(appRoot), join(forgeRoot, "third_party", "deepseek-harness"));
      assert.strictEqual(findGrokBuildBinary(appRoot), grokBin);
      const env = { DEEPSEEK_API_KEY: "k", XAI_API_KEY: "k" };
      const deepseek = resolveDeepSeekCommand(appRoot, env);
      assert.ok(deepseek);
      assert.ok(deepseek.args.some((arg) => arg.includes("@deepseek-ai/dsh") || arg.includes("npx") || arg.endsWith("bin.js") || arg.endsWith("bin.ts")));
      const grok = resolveGrokCommand(appRoot, env);
      assert.ok(grok);
      assert.strictEqual(grok.command, grokBin);
    } finally {
      rmSync(forgeRoot, { recursive: true, force: true });
    }
  });
  test("does not treat bare PATH names as installed executables", () => {
    assert.strictEqual(isExecutablePath("grok"), false);
    assert.strictEqual(isExecutablePath("npx"), false);
    assert.strictEqual(isExecutablePath(process.execPath), true);
  });
  test("resolves npx through node.exe instead of a Windows cmd shim", () => {
    const npx = resolveNodeNpmCli("npx");
    assert.ok(npx.command === "npx" || npx.command === process.execPath);
    if (npx.command === process.execPath) {
      assert.ok(npx.prefixArgs.some((arg) => arg.endsWith("npx-cli.js")));
    }
    const spawned = resolveSpawnCommand(process.execPath);
    assert.strictEqual(spawned.shell, false);
    assert.deepStrictEqual(spawned.prefixArgs, []);
    if (process.platform === "win32") {
      const cmdShim = resolveSpawnCommand("npx.cmd");
      assert.strictEqual(cmdShim.shell, false);
      assert.ok(cmdShim.prefixArgs.includes("/c"));
      assert.ok(cmdShim.command.toLowerCase().includes("cmd"));
      const bare = resolveSpawnCommand("npx");
      assert.strictEqual(bare.shell, true);
      assert.notStrictEqual(bare.command, "npx.cmd");
    }
  });
  test("reads deepseek credentials from the harness yaml file", () => {
    const home = mkdtempSync(join(tmpdir(), "forge-dsh-"));
    try {
      const path = deepSeekCredentialsPath(home);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, 'DEEPSEEK_API_KEY: "from-file"\n', "utf8");
      assert.strictEqual(readDeepSeekApiKeyFromCredentials(home), "from-file");
      assert.strictEqual(hasDeepSeekWorkerCredentials({}, home), true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  test("reports credential source from env and saved files", () => {
    const home = mkdtempSync(join(tmpdir(), "forge-dsh-src-"));
    try {
      const path = deepSeekCredentialsPath(home);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, 'DEEPSEEK_API_KEY: "from-file"\n', "utf8");
      assert.strictEqual(deepSeekCredentialSource({ DEEPSEEK_API_KEY: "from-env" }, home), "env");
      assert.strictEqual(deepSeekCredentialSource({}, home), "saved");
      assert.strictEqual(grokCredentialSource({ XAI_API_KEY: "k" }, home), "env");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
  test("signed-in flags alone do not count as worker credentials", () => {
    const home = mkdtempSync(join(tmpdir(), "forge-worker-empty-"));
    const previousForgeHome = process.env.FORGE_HOME;
    const previousDshHome = process.env.DSH_HOME;
    try {
      process.env.FORGE_HOME = home;
      delete process.env.DSH_HOME;
      const env = { FORGE_DEEPSEEK_SIGNED_IN: "1", FORGE_GROK_SIGNED_IN: "1" };
      assert.strictEqual(hasDeepSeekWorkerCredentials(env), false);
      assert.strictEqual(hasGrokWorkerCredentials(env), false);
      assert.strictEqual(resolveDeepSeekCommand("/missing-root", env), void 0);
      assert.strictEqual(resolveGrokCommand("/missing-root", env), void 0);
    } finally {
      if (previousForgeHome === void 0) {
        delete process.env.FORGE_HOME;
      } else {
        process.env.FORGE_HOME = previousForgeHome;
      }
      if (previousDshHome === void 0) {
        delete process.env.DSH_HOME;
      } else {
        process.env.DSH_HOME = previousDshHome;
      }
      rmSync(home, { recursive: true, force: true });
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFx3b3JrZXJSdW50aW1lLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIHJtU3luYywgd3JpdGVGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0ZGVlcFNlZWtDcmVkZW50aWFsU291cmNlLFxuXHRkZWVwU2Vla0NyZWRlbnRpYWxzUGF0aCxcblx0ZGVlcFNlZWtIYXJuZXNzUm9vdHMsXG5cdGZpbmREZWVwU2Vla0hhcm5lc3NSb290LFxuXHRmaW5kR3Jva0J1aWxkQmluYXJ5LFxuXHRncm9rQnVpbGRCaW5hcnlDYW5kaWRhdGVzLFxuXHRncm9rQ3JlZGVudGlhbFNvdXJjZSxcblx0aGFzRGVlcFNlZWtXb3JrZXJDcmVkZW50aWFscyxcblx0aGFzR3Jva1dvcmtlckNyZWRlbnRpYWxzLFxuXHRpc0V4ZWN1dGFibGVQYXRoLFxuXHRyZWFkRGVlcFNlZWtBcGlLZXlGcm9tQ3JlZGVudGlhbHMsXG5cdHJlc29sdmVOb2RlTnBtQ2xpLFxuXHRyZXNvbHZlU3Bhd25Db21tYW5kLFxufSBmcm9tICcuLi8uLi8uLi9ub2RlL29yY2hlc3RyYXRpb24vd29ya2VyUnVudGltZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlRGVlcFNlZWtDb21tYW5kLCByZXNvbHZlR3Jva0NvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi9ub2RlL29yY2hlc3RyYXRpb24vd29ya2VyQWRhcHRlcnMuanMnO1xuXG5zdWl0ZSgnRm9yZ2Ugd29ya2VyIHJ1bnRpbWUnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBoYXJuZXNzIHJvb3RzIHVuZGVyIHJlcG8gYW5kIHVzZXIgaG9tZScsICgpID0+IHtcblx0XHRjb25zdCByb290cyA9IGRlZXBTZWVrSGFybmVzc1Jvb3RzKCcvYXBwL3Jlc291cmNlcy9hcHAnKTtcblx0XHRhc3NlcnQub2socm9vdHMuc29tZShyb290ID0+IHJvb3QucmVwbGFjZSgvXFxcXC9nLCAnLycpLmluY2x1ZGVzKCd0aGlyZF9wYXJ0eS9kZWVwc2Vlay1oYXJuZXNzJykpKTtcblx0XHRhc3NlcnQub2socm9vdHMuc29tZShyb290ID0+IHJvb3QuaW5jbHVkZXMoJ2RlZXBzZWVrLWhhcm5lc3MtbWFzdGVyJykpKTtcblx0XHRhc3NlcnQub2socm9vdHMuc29tZShyb290ID0+IHJvb3QuaW5jbHVkZXMoJy5mb3JnZScpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBncm9rIGJpbmFyeSBjYW5kaWRhdGVzIHVuZGVyIHJlcG8gYW5kIHVzZXIgaG9tZScsICgpID0+IHtcblx0XHRjb25zdCByb290cyA9IGdyb2tCdWlsZEJpbmFyeUNhbmRpZGF0ZXMoJy9hcHAvcmVzb3VyY2VzL2FwcCcpO1xuXHRcdGFzc2VydC5vayhyb290cy5zb21lKHJvb3QgPT4gcm9vdC5yZXBsYWNlKC9cXFxcL2csICcvJykuaW5jbHVkZXMoJ3RoaXJkX3BhcnR5L2dyb2stYnVpbGQnKSkpO1xuXHRcdGFzc2VydC5vayhyb290cy5zb21lKHJvb3QgPT4gcm9vdC5pbmNsdWRlcygnZ3Jvay1idWlsZC1tYWluJykpKTtcblx0XHRhc3NlcnQub2socm9vdHMuc29tZShyb290ID0+IHJvb3QuaW5jbHVkZXMoJy5mb3JnZScpIHx8IHJvb3QuaW5jbHVkZXMoJy5ncm9rJykpKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZHMgdmVuZG9yZWQgaGFybmVzcyBhbmQgZ3JvayBiaW5hcnkgYnkgd2Fsa2luZyB1cCBmcm9tIGFwcFJvb3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZm9yZ2VSb290ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2ZvcmdlLXZlbmRvci0nKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFwcFJvb3QgPSBqb2luKGZvcmdlUm9vdCwgJ291dCcpO1xuXHRcdFx0bWtkaXJTeW5jKGpvaW4oZm9yZ2VSb290LCAndGhpcmRfcGFydHknLCAnZGVlcHNlZWstaGFybmVzcycsICdhcHBzJywgJ2NsaScsICdzcmMnKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRta2RpclN5bmMoam9pbihmb3JnZVJvb3QsICd0aGlyZF9wYXJ0eScsICdncm9rLWJ1aWxkJywgJ2JpbicpLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdG1rZGlyU3luYyhhcHBSb290LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdHdyaXRlRmlsZVN5bmMoam9pbihmb3JnZVJvb3QsICd0aGlyZF9wYXJ0eScsICdkZWVwc2Vlay1oYXJuZXNzJywgJ3BhY2thZ2UuanNvbicpLCAne1wibmFtZVwiOlwiZHNoXCJ9XFxuJywgJ3V0ZjgnKTtcblx0XHRcdGNvbnN0IGdyb2tCaW4gPSBqb2luKGZvcmdlUm9vdCwgJ3RoaXJkX3BhcnR5JywgJ2dyb2stYnVpbGQnLCAnYmluJywgcHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJyA/ICdncm9rLmV4ZScgOiAnZ3JvaycpO1xuXHRcdFx0d3JpdGVGaWxlU3luYyhncm9rQmluLCAnJywgJ3V0ZjgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kRGVlcFNlZWtIYXJuZXNzUm9vdChhcHBSb290KSwgam9pbihmb3JnZVJvb3QsICd0aGlyZF9wYXJ0eScsICdkZWVwc2Vlay1oYXJuZXNzJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRHcm9rQnVpbGRCaW5hcnkoYXBwUm9vdCksIGdyb2tCaW4pO1xuXHRcdFx0Y29uc3QgZW52ID0geyBERUVQU0VFS19BUElfS0VZOiAnaycsIFhBSV9BUElfS0VZOiAnaycgfSBhcyBOb2RlSlMuUHJvY2Vzc0Vudjtcblx0XHRcdGNvbnN0IGRlZXBzZWVrID0gcmVzb2x2ZURlZXBTZWVrQ29tbWFuZChhcHBSb290LCBlbnYpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlZXBzZWVrKTtcblx0XHRcdGFzc2VydC5vayhkZWVwc2Vlay5hcmdzLnNvbWUoYXJnID0+IGFyZy5pbmNsdWRlcygnQGRlZXBzZWVrLWFpL2RzaCcpIHx8IGFyZy5pbmNsdWRlcygnbnB4JykgfHwgYXJnLmVuZHNXaXRoKCdiaW4uanMnKSB8fCBhcmcuZW5kc1dpdGgoJ2Jpbi50cycpKSk7XG5cdFx0XHRjb25zdCBncm9rID0gcmVzb2x2ZUdyb2tDb21tYW5kKGFwcFJvb3QsIGVudik7XG5cdFx0XHRhc3NlcnQub2soZ3Jvayk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3Jvay5jb21tYW5kLCBncm9rQmluKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cm1TeW5jKGZvcmdlUm9vdCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgdHJlYXQgYmFyZSBQQVRIIG5hbWVzIGFzIGluc3RhbGxlZCBleGVjdXRhYmxlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNFeGVjdXRhYmxlUGF0aCgnZ3JvaycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhlY3V0YWJsZVBhdGgoJ25weCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRXhlY3V0YWJsZVBhdGgocHJvY2Vzcy5leGVjUGF0aCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBucHggdGhyb3VnaCBub2RlLmV4ZSBpbnN0ZWFkIG9mIGEgV2luZG93cyBjbWQgc2hpbScsICgpID0+IHtcblx0XHRjb25zdCBucHggPSByZXNvbHZlTm9kZU5wbUNsaSgnbnB4Jyk7XG5cdFx0YXNzZXJ0Lm9rKG5weC5jb21tYW5kID09PSAnbnB4JyB8fCBucHguY29tbWFuZCA9PT0gcHJvY2Vzcy5leGVjUGF0aCk7XG5cdFx0aWYgKG5weC5jb21tYW5kID09PSBwcm9jZXNzLmV4ZWNQYXRoKSB7XG5cdFx0XHRhc3NlcnQub2sobnB4LnByZWZpeEFyZ3Muc29tZShhcmcgPT4gYXJnLmVuZHNXaXRoKCducHgtY2xpLmpzJykpKTtcblx0XHR9XG5cdFx0Y29uc3Qgc3Bhd25lZCA9IHJlc29sdmVTcGF3bkNvbW1hbmQocHJvY2Vzcy5leGVjUGF0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwYXduZWQuc2hlbGwsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNwYXduZWQucHJlZml4QXJncywgW10pO1xuXHRcdGlmIChwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInKSB7XG5cdFx0XHRjb25zdCBjbWRTaGltID0gcmVzb2x2ZVNwYXduQ29tbWFuZCgnbnB4LmNtZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNtZFNoaW0uc2hlbGwsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5vayhjbWRTaGltLnByZWZpeEFyZ3MuaW5jbHVkZXMoJy9jJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNtZFNoaW0uY29tbWFuZC50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCdjbWQnKSk7XG5cdFx0XHRjb25zdCBiYXJlID0gcmVzb2x2ZVNwYXduQ29tbWFuZCgnbnB4Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmFyZS5zaGVsbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYmFyZS5jb21tYW5kLCAnbnB4LmNtZCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVhZHMgZGVlcHNlZWsgY3JlZGVudGlhbHMgZnJvbSB0aGUgaGFybmVzcyB5YW1sIGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9tZSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdmb3JnZS1kc2gtJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXRoID0gZGVlcFNlZWtDcmVkZW50aWFsc1BhdGgoaG9tZSk7XG5cdFx0XHRta2RpclN5bmMoam9pbihwYXRoLCAnLi4nKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR3cml0ZUZpbGVTeW5jKHBhdGgsICdERUVQU0VFS19BUElfS0VZOiBcImZyb20tZmlsZVwiXFxuJywgJ3V0ZjgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkRGVlcFNlZWtBcGlLZXlGcm9tQ3JlZGVudGlhbHMoaG9tZSksICdmcm9tLWZpbGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEZWVwU2Vla1dvcmtlckNyZWRlbnRpYWxzKHt9LCBob21lKSwgdHJ1ZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJtU3luYyhob21lLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIGNyZWRlbnRpYWwgc291cmNlIGZyb20gZW52IGFuZCBzYXZlZCBmaWxlcycsICgpID0+IHtcblx0XHRjb25zdCBob21lID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2ZvcmdlLWRzaC1zcmMtJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXRoID0gZGVlcFNlZWtDcmVkZW50aWFsc1BhdGgoaG9tZSk7XG5cdFx0XHRta2RpclN5bmMoam9pbihwYXRoLCAnLi4nKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHR3cml0ZUZpbGVTeW5jKHBhdGgsICdERUVQU0VFS19BUElfS0VZOiBcImZyb20tZmlsZVwiXFxuJywgJ3V0ZjgnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWVwU2Vla0NyZWRlbnRpYWxTb3VyY2UoeyBERUVQU0VFS19BUElfS0VZOiAnZnJvbS1lbnYnIH0gYXMgTm9kZUpTLlByb2Nlc3NFbnYsIGhvbWUpLCAnZW52Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVlcFNlZWtDcmVkZW50aWFsU291cmNlKHt9LCBob21lKSwgJ3NhdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ3Jva0NyZWRlbnRpYWxTb3VyY2UoeyBYQUlfQVBJX0tFWTogJ2snIH0gYXMgTm9kZUpTLlByb2Nlc3NFbnYsIGhvbWUpLCAnZW52Jyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJtU3luYyhob21lLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzaWduZWQtaW4gZmxhZ3MgYWxvbmUgZG8gbm90IGNvdW50IGFzIHdvcmtlciBjcmVkZW50aWFscycsICgpID0+IHtcblx0XHRjb25zdCBob21lID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2ZvcmdlLXdvcmtlci1lbXB0eS0nKSk7XG5cdFx0Y29uc3QgcHJldmlvdXNGb3JnZUhvbWUgPSBwcm9jZXNzLmVudi5GT1JHRV9IT01FO1xuXHRcdGNvbnN0IHByZXZpb3VzRHNoSG9tZSA9IHByb2Nlc3MuZW52LkRTSF9IT01FO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm9jZXNzLmVudi5GT1JHRV9IT01FID0gaG9tZTtcblx0XHRcdGRlbGV0ZSBwcm9jZXNzLmVudi5EU0hfSE9NRTtcblx0XHRcdGNvbnN0IGVudiA9IHsgRk9SR0VfREVFUFNFRUtfU0lHTkVEX0lOOiAnMScsIEZPUkdFX0dST0tfU0lHTkVEX0lOOiAnMScgfSBhcyBOb2RlSlMuUHJvY2Vzc0Vudjtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNEZWVwU2Vla1dvcmtlckNyZWRlbnRpYWxzKGVudiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoYXNHcm9rV29ya2VyQ3JlZGVudGlhbHMoZW52KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVEZWVwU2Vla0NvbW1hbmQoJy9taXNzaW5nLXJvb3QnLCBlbnYpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVHcm9rQ29tbWFuZCgnL21pc3Npbmctcm9vdCcsIGVudiksIHVuZGVmaW5lZCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChwcmV2aW91c0ZvcmdlSG9tZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGRlbGV0ZSBwcm9jZXNzLmVudi5GT1JHRV9IT01FO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJvY2Vzcy5lbnYuRk9SR0VfSE9NRSA9IHByZXZpb3VzRm9yZ2VIb21lO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByZXZpb3VzRHNoSG9tZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGRlbGV0ZSBwcm9jZXNzLmVudi5EU0hfSE9NRTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2Nlc3MuZW52LkRTSF9IT01FID0gcHJldmlvdXNEc2hIb21lO1xuXHRcdFx0fVxuXHRcdFx0cm1TeW5jKGhvbWUsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFlBQVk7QUFDeEIsU0FBUyxXQUFXLGFBQWEsUUFBUSxxQkFBcUI7QUFDOUQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsU0FBUyx3QkFBd0IsMEJBQTBCO0FBRTNELE1BQU0sd0JBQXdCLE1BQU07QUFDbkMsMENBQXdDO0FBRXhDLE9BQUssb0RBQW9ELE1BQU07QUFDOUQsVUFBTSxRQUFRLHFCQUFxQixvQkFBb0I7QUFDdkQsV0FBTyxHQUFHLE1BQU0sS0FBSyxVQUFRLEtBQUssUUFBUSxPQUFPLEdBQUcsRUFBRSxTQUFTLDhCQUE4QixDQUFDLENBQUM7QUFDL0YsV0FBTyxHQUFHLE1BQU0sS0FBSyxVQUFRLEtBQUssU0FBUyx5QkFBeUIsQ0FBQyxDQUFDO0FBQ3RFLFdBQU8sR0FBRyxNQUFNLEtBQUssVUFBUSxLQUFLLFNBQVMsUUFBUSxDQUFDLENBQUM7QUFBQSxFQUN0RCxDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLFFBQVEsMEJBQTBCLG9CQUFvQjtBQUM1RCxXQUFPLEdBQUcsTUFBTSxLQUFLLFVBQVEsS0FBSyxRQUFRLE9BQU8sR0FBRyxFQUFFLFNBQVMsd0JBQXdCLENBQUMsQ0FBQztBQUN6RixXQUFPLEdBQUcsTUFBTSxLQUFLLFVBQVEsS0FBSyxTQUFTLGlCQUFpQixD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
