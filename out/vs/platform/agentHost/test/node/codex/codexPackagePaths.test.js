import assert from "assert";
import * as fs from "fs";
import { join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { codexBinaryTriple, codexPackageSuffix, resolveCodexBinaryPath, resolveCodexDevSdkRoot, resolveCodexNodeModulesDirName } from "../../../node/codex/codexAgent.js";
suite("codex package paths", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("codexPackageSuffix", () => {
    test("every supported (platform, arch) returns the npm optionalDependencies suffix", () => {
      assert.deepStrictEqual({
        "darwin-x64": codexPackageSuffix("darwin", "x64"),
        "darwin-arm64": codexPackageSuffix("darwin", "arm64"),
        "linux-x64": codexPackageSuffix("linux", "x64"),
        "linux-arm64": codexPackageSuffix("linux", "arm64"),
        "win32-x64": codexPackageSuffix("win32", "x64"),
        "win32-arm64": codexPackageSuffix("win32", "arm64")
      }, {
        "darwin-x64": "darwin-x64",
        "darwin-arm64": "darwin-arm64",
        "linux-x64": "linux-x64",
        "linux-arm64": "linux-arm64",
        "win32-x64": "win32-x64",
        "win32-arm64": "win32-arm64"
      });
    });
    test("never returns a -musl suffix on Linux (Codex is statically musl-linked)", () => {
      assert.strictEqual(codexPackageSuffix("linux", "x64"), "linux-x64");
      assert.strictEqual(codexPackageSuffix("linux", "arm64"), "linux-arm64");
    });
    test("returns undefined for unsupported platforms and architectures", () => {
      assert.strictEqual(codexPackageSuffix("freebsd", "x64"), void 0);
      assert.strictEqual(codexPackageSuffix("aix", "arm64"), void 0);
      assert.strictEqual(codexPackageSuffix("darwin", "ia32"), void 0);
      assert.strictEqual(codexPackageSuffix("linux", "arm"), void 0);
      assert.strictEqual(codexPackageSuffix("win32", "mips"), void 0);
    });
  });
  suite("codexBinaryTriple", () => {
    test("every suffix produced by codexPackageSuffix maps to a rust target triple", () => {
      assert.deepStrictEqual({
        "linux-x64": codexBinaryTriple("linux-x64"),
        "linux-arm64": codexBinaryTriple("linux-arm64"),
        "darwin-x64": codexBinaryTriple("darwin-x64"),
        "darwin-arm64": codexBinaryTriple("darwin-arm64"),
        "win32-x64": codexBinaryTriple("win32-x64"),
        "win32-arm64": codexBinaryTriple("win32-arm64")
      }, {
        "linux-x64": "x86_64-unknown-linux-musl",
        "linux-arm64": "aarch64-unknown-linux-musl",
        "darwin-x64": "x86_64-apple-darwin",
        "darwin-arm64": "aarch64-apple-darwin",
        "win32-x64": "x86_64-pc-windows-msvc",
        "win32-arm64": "aarch64-pc-windows-msvc"
      });
    });
    test("returns undefined for unknown suffixes", () => {
      assert.strictEqual(codexBinaryTriple("linux-x64-musl"), void 0);
      assert.strictEqual(codexBinaryTriple("darwin-arm"), void 0);
      assert.strictEqual(codexBinaryTriple(""), void 0);
    });
  });
  suite("resolveCodexDevSdkRoot", () => {
    test("returns the directory containing node_modules when @openai/codex resolves", async () => {
      const root = join("home", "me", "vscode");
      const pkgJson = join(root, "node_modules", "@openai", "codex", "package.json");
      assert.strictEqual(await resolveCodexDevSdkRoot(() => pkgJson), root);
    });
    test("returns undefined when resolution throws", async () => {
      assert.strictEqual(await resolveCodexDevSdkRoot(() => {
        throw new Error("Cannot find module");
      }), void 0);
    });
  });
  suite("resolveCodexBinaryPath", () => {
    test("prefers node_modules.asar.unpacked when the unpacked binary exists", () => {
      const root = join("app");
      const target = "win32-x64";
      const triple = "x86_64-pc-windows-msvc";
      const binaryName = "codex.exe";
      const unpackedDir = join(root, "node_modules.asar.unpacked", `@openai/codex-${target}`, "vendor", triple, "bin");
      fs.mkdirSync(unpackedDir, { recursive: true });
      fs.writeFileSync(join(unpackedDir, binaryName), "");
      try {
        assert.strictEqual(
          resolveCodexNodeModulesDirName(root, target, triple, binaryName),
          "node_modules.asar.unpacked"
        );
        assert.strictEqual(
          resolveCodexBinaryPath(root, target, triple, binaryName),
          join(unpackedDir, binaryName)
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
    test("falls back to node_modules when only the plain tree exists", () => {
      const root = join("sdk-cache");
      const target = "win32-x64";
      const triple = "x86_64-pc-windows-msvc";
      const binaryName = "codex.exe";
      const plainDir = join(root, "node_modules", `@openai/codex-${target}`, "vendor", triple, "bin");
      fs.mkdirSync(plainDir, { recursive: true });
      fs.writeFileSync(join(plainDir, binaryName), "");
      try {
        assert.strictEqual(
          resolveCodexNodeModulesDirName(root, target, triple, binaryName),
          "node_modules"
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhQYWNrYWdlUGF0aHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY29kZXhCaW5hcnlUcmlwbGUsIGNvZGV4UGFja2FnZVN1ZmZpeCwgcmVzb2x2ZUNvZGV4QmluYXJ5UGF0aCwgcmVzb2x2ZUNvZGV4RGV2U2RrUm9vdCwgcmVzb2x2ZUNvZGV4Tm9kZU1vZHVsZXNEaXJOYW1lIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleEFnZW50LmpzJztcblxuc3VpdGUoJ2NvZGV4IHBhY2thZ2UgcGF0aHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2NvZGV4UGFja2FnZVN1ZmZpeCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2V2ZXJ5IHN1cHBvcnRlZCAocGxhdGZvcm0sIGFyY2gpIHJldHVybnMgdGhlIG5wbSBvcHRpb25hbERlcGVuZGVuY2llcyBzdWZmaXgnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgYnVpbGQgcGlwZWxpbmUgYW5kIGNvZGV4QmluYXJ5VHJpcGxlIGJvdGggcmVseSBvbiB0aGUgcnVudGltZVxuXHRcdFx0Ly8gcmVhY2hpbmcgZXhhY3RseSBvbmUgb2YgdGhlc2Ugc3RyaW5ncy4gTmV3IHN1cHBvcnRlZCBwbGF0Zm9ybXNcblx0XHRcdC8vIG11c3QgdXBkYXRlIHRoaXMgdGFibGUsIHRoZSBidWlsZCdzIGBnZXRTZGtUYXJnZXRGb3JCdWlsZGAsIEFORFxuXHRcdFx0Ly8gY29kZXhCaW5hcnlUcmlwbGUgaW4gbG9ja3N0ZXAuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0J2Rhcndpbi14NjQnOiBjb2RleFBhY2thZ2VTdWZmaXgoJ2RhcndpbicsICd4NjQnKSxcblx0XHRcdFx0J2Rhcndpbi1hcm02NCc6IGNvZGV4UGFja2FnZVN1ZmZpeCgnZGFyd2luJywgJ2FybTY0JyksXG5cdFx0XHRcdCdsaW51eC14NjQnOiBjb2RleFBhY2thZ2VTdWZmaXgoJ2xpbnV4JywgJ3g2NCcpLFxuXHRcdFx0XHQnbGludXgtYXJtNjQnOiBjb2RleFBhY2thZ2VTdWZmaXgoJ2xpbnV4JywgJ2FybTY0JyksXG5cdFx0XHRcdCd3aW4zMi14NjQnOiBjb2RleFBhY2thZ2VTdWZmaXgoJ3dpbjMyJywgJ3g2NCcpLFxuXHRcdFx0XHQnd2luMzItYXJtNjQnOiBjb2RleFBhY2thZ2VTdWZmaXgoJ3dpbjMyJywgJ2FybTY0JyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdCdkYXJ3aW4teDY0JzogJ2Rhcndpbi14NjQnLFxuXHRcdFx0XHQnZGFyd2luLWFybTY0JzogJ2Rhcndpbi1hcm02NCcsXG5cdFx0XHRcdCdsaW51eC14NjQnOiAnbGludXgteDY0Jyxcblx0XHRcdFx0J2xpbnV4LWFybTY0JzogJ2xpbnV4LWFybTY0Jyxcblx0XHRcdFx0J3dpbjMyLXg2NCc6ICd3aW4zMi14NjQnLFxuXHRcdFx0XHQnd2luMzItYXJtNjQnOiAnd2luMzItYXJtNjQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCduZXZlciByZXR1cm5zIGEgLW11c2wgc3VmZml4IG9uIExpbnV4IChDb2RleCBpcyBzdGF0aWNhbGx5IG11c2wtbGlua2VkKScsICgpID0+IHtcblx0XHRcdC8vIFJlZ3Jlc3Npb24gZ3VhcmQ6IGF0IG9uZSBwb2ludCBkdXJpbmcgdGhlIHBlci1wbGF0Zm9ybSByZWZhY3RvclxuXHRcdFx0Ly8gdGhlIGhlbHBlciBzdGlsbCBhcHBlbmRlZCBgLW11c2xgIGZvciBtdXNsIExpbnV4IGhvc3RzLiBDb2RleCdzXG5cdFx0XHQvLyBgbGludXgtPGFyY2g+YCBwYWNrYWdlIHNlcnZlcyBib3RoIGdsaWJjIGFuZCBtdXNsLCBzbyB0aGUgc3VmZml4XG5cdFx0XHQvLyBtdXN0IE5PVCBiZSBhZGRlZC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RleFBhY2thZ2VTdWZmaXgoJ2xpbnV4JywgJ3g2NCcpLCAnbGludXgteDY0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhQYWNrYWdlU3VmZml4KCdsaW51eCcsICdhcm02NCcpLCAnbGludXgtYXJtNjQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bnN1cHBvcnRlZCBwbGF0Zm9ybXMgYW5kIGFyY2hpdGVjdHVyZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhQYWNrYWdlU3VmZml4KCdmcmVlYnNkJyBhcyBOb2RlSlMuUGxhdGZvcm0sICd4NjQnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RleFBhY2thZ2VTdWZmaXgoJ2FpeCcgYXMgTm9kZUpTLlBsYXRmb3JtLCAnYXJtNjQnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RleFBhY2thZ2VTdWZmaXgoJ2RhcndpbicsICdpYTMyJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhQYWNrYWdlU3VmZml4KCdsaW51eCcsICdhcm0nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RleFBhY2thZ2VTdWZmaXgoJ3dpbjMyJywgJ21pcHMnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvZGV4QmluYXJ5VHJpcGxlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXZlcnkgc3VmZml4IHByb2R1Y2VkIGJ5IGNvZGV4UGFja2FnZVN1ZmZpeCBtYXBzIHRvIGEgcnVzdCB0YXJnZXQgdHJpcGxlJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIHR3byBoZWxwZXJzIGFyZSBwYWlyZWQ6IHRoZSBkb3dubG9hZGVyIHBpY2tzIGEgcGFja2FnZSB2aWFcblx0XHRcdC8vIGNvZGV4UGFja2FnZVN1ZmZpeCwgdGhlbiB0aGlzIGZ1bmN0aW9uIHRlbGxzIF9zdGFydENvbm5lY3Rpb25cblx0XHRcdC8vIHdoaWNoIGB2ZW5kb3IvPHRyaXBsZT4vYmluL2NvZGV4YCBleGlzdHMgaW5zaWRlIGl0LiBBIHN1ZmZpeFxuXHRcdFx0Ly8gd2l0aG91dCBhIG1hdGNoaW5nIHRyaXBsZSB3b3VsZCBjcmFzaCBhdCBzcGF3biBcdTIwMTQgc28gdGhpcyB0ZXN0XG5cdFx0XHQvLyBndWFyZHMgdGhlIHVuaW9uLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdCdsaW51eC14NjQnOiBjb2RleEJpbmFyeVRyaXBsZSgnbGludXgteDY0JyksXG5cdFx0XHRcdCdsaW51eC1hcm02NCc6IGNvZGV4QmluYXJ5VHJpcGxlKCdsaW51eC1hcm02NCcpLFxuXHRcdFx0XHQnZGFyd2luLXg2NCc6IGNvZGV4QmluYXJ5VHJpcGxlKCdkYXJ3aW4teDY0JyksXG5cdFx0XHRcdCdkYXJ3aW4tYXJtNjQnOiBjb2RleEJpbmFyeVRyaXBsZSgnZGFyd2luLWFybTY0JyksXG5cdFx0XHRcdCd3aW4zMi14NjQnOiBjb2RleEJpbmFyeVRyaXBsZSgnd2luMzIteDY0JyksXG5cdFx0XHRcdCd3aW4zMi1hcm02NCc6IGNvZGV4QmluYXJ5VHJpcGxlKCd3aW4zMi1hcm02NCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHQnbGludXgteDY0JzogJ3g4Nl82NC11bmtub3duLWxpbnV4LW11c2wnLFxuXHRcdFx0XHQnbGludXgtYXJtNjQnOiAnYWFyY2g2NC11bmtub3duLWxpbnV4LW11c2wnLFxuXHRcdFx0XHQnZGFyd2luLXg2NCc6ICd4ODZfNjQtYXBwbGUtZGFyd2luJyxcblx0XHRcdFx0J2Rhcndpbi1hcm02NCc6ICdhYXJjaDY0LWFwcGxlLWRhcndpbicsXG5cdFx0XHRcdCd3aW4zMi14NjQnOiAneDg2XzY0LXBjLXdpbmRvd3MtbXN2YycsXG5cdFx0XHRcdCd3aW4zMi1hcm02NCc6ICdhYXJjaDY0LXBjLXdpbmRvd3MtbXN2YycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIHN1ZmZpeGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4QmluYXJ5VHJpcGxlKCdsaW51eC14NjQtbXVzbCcpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGV4QmluYXJ5VHJpcGxlKCdkYXJ3aW4tYXJtJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZXhCaW5hcnlUcmlwbGUoJycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZUNvZGV4RGV2U2RrUm9vdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdGhlIGRpcmVjdG9yeSBjb250YWluaW5nIG5vZGVfbW9kdWxlcyB3aGVuIEBvcGVuYWkvY29kZXggcmVzb2x2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBgcmVxdWlyZS5yZXNvbHZlKCdAb3BlbmFpL2NvZGV4L3BhY2thZ2UuanNvbicpYCB5aWVsZHNcblx0XHRcdC8vIGA8cm9vdD4vbm9kZV9tb2R1bGVzL0BvcGVuYWkvY29kZXgvcGFja2FnZS5qc29uYDsgdGhlIGhlbHBlciB3YWxrc1xuXHRcdFx0Ly8gZm91ciBzZWdtZW50cyB1cCB0byByZWNvdmVyIGA8cm9vdD5gIFx1MjAxNCB0aGUgZGlyIGBfc3RhcnRDb25uZWN0aW9uYFxuXHRcdFx0Ly8gam9pbnMgYG5vZGVfbW9kdWxlcy9Ab3BlbmFpL2NvZGV4LTx0YXJnZXQ+YCBvbnRvLlxuXHRcdFx0Y29uc3Qgcm9vdCA9IGpvaW4oJ2hvbWUnLCAnbWUnLCAndnNjb2RlJyk7XG5cdFx0XHRjb25zdCBwa2dKc29uID0gam9pbihyb290LCAnbm9kZV9tb2R1bGVzJywgJ0BvcGVuYWknLCAnY29kZXgnLCAncGFja2FnZS5qc29uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZUNvZGV4RGV2U2RrUm9vdCgoKSA9PiBwa2dKc29uKSwgcm9vdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHJlc29sdXRpb24gdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVDb2RleERldlNka1Jvb3QoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmaW5kIG1vZHVsZScpOyB9KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jlc29sdmVDb2RleEJpbmFyeVBhdGgnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIG5vZGVfbW9kdWxlcy5hc2FyLnVucGFja2VkIHdoZW4gdGhlIHVucGFja2VkIGJpbmFyeSBleGlzdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gam9pbignYXBwJyk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSAnd2luMzIteDY0Jztcblx0XHRcdGNvbnN0IHRyaXBsZSA9ICd4ODZfNjQtcGMtd2luZG93cy1tc3ZjJztcblx0XHRcdGNvbnN0IGJpbmFyeU5hbWUgPSAnY29kZXguZXhlJztcblx0XHRcdGNvbnN0IHVucGFja2VkRGlyID0gam9pbihyb290LCAnbm9kZV9tb2R1bGVzLmFzYXIudW5wYWNrZWQnLCBgQG9wZW5haS9jb2RleC0ke3RhcmdldH1gLCAndmVuZG9yJywgdHJpcGxlLCAnYmluJyk7XG5cdFx0XHRmcy5ta2RpclN5bmModW5wYWNrZWREaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0ZnMud3JpdGVGaWxlU3luYyhqb2luKHVucGFja2VkRGlyLCBiaW5hcnlOYW1lKSwgJycpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHJlc29sdmVDb2RleE5vZGVNb2R1bGVzRGlyTmFtZShyb290LCB0YXJnZXQsIHRyaXBsZSwgYmluYXJ5TmFtZSksXG5cdFx0XHRcdFx0J25vZGVfbW9kdWxlcy5hc2FyLnVucGFja2VkJyxcblx0XHRcdFx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHJlc29sdmVDb2RleEJpbmFyeVBhdGgocm9vdCwgdGFyZ2V0LCB0cmlwbGUsIGJpbmFyeU5hbWUpLFxuXHRcdFx0XHRcdGpvaW4odW5wYWNrZWREaXIsIGJpbmFyeU5hbWUpLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZnMucm1TeW5jKHJvb3QsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gbm9kZV9tb2R1bGVzIHdoZW4gb25seSB0aGUgcGxhaW4gdHJlZSBleGlzdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByb290ID0gam9pbignc2RrLWNhY2hlJyk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSAnd2luMzIteDY0Jztcblx0XHRcdGNvbnN0IHRyaXBsZSA9ICd4ODZfNjQtcGMtd2luZG93cy1tc3ZjJztcblx0XHRcdGNvbnN0IGJpbmFyeU5hbWUgPSAnY29kZXguZXhlJztcblx0XHRcdGNvbnN0IHBsYWluRGlyID0gam9pbihyb290LCAnbm9kZV9tb2R1bGVzJywgYEBvcGVuYWkvY29kZXgtJHt0YXJnZXR9YCwgJ3ZlbmRvcicsIHRyaXBsZSwgJ2JpbicpO1xuXHRcdFx0ZnMubWtkaXJTeW5jKHBsYWluRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmMoam9pbihwbGFpbkRpciwgYmluYXJ5TmFtZSksICcnKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0XHRyZXNvbHZlQ29kZXhOb2RlTW9kdWxlc0Rpck5hbWUocm9vdCwgdGFyZ2V0LCB0cmlwbGUsIGJpbmFyeU5hbWUpLFxuXHRcdFx0XHRcdCdub2RlX21vZHVsZXMnLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0ZnMucm1TeW5jKHJvb3QsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbUJBQW1CLG9CQUFvQix3QkFBd0Isd0JBQXdCLHNDQUFzQztBQUV0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
