import assert from "assert";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as os from "os";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import * as path from "../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { FileService } from "../../../files/common/fileService.js";
import { DiskFileSystemProvider } from "../../../files/node/diskFileSystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { RequestService } from "../../../request/node/requestService.js";
import { AgentSdkDownloader, resolveSdkTarget } from "../../node/agentSdkDownloader.js";
import { ClaudeSdkPackage } from "../../node/claude/claudeAgentSdkService.js";
import { AgentHostClaudeSdkRootEnvVar } from "../../common/agentService.js";
async function buildFixtureTarball() {
  const tar = await import("tar");
  const stagingDir = await fsp.mkdtemp(path.join(os.tmpdir(), "sdk-fixture-"));
  const innerRel = path.join("node_modules", "@anthropic-ai", "claude-agent-sdk", "sdk.mjs");
  const innerContents = "// fixture sdk.mjs\nexport default {};\n";
  await fsp.mkdir(path.dirname(path.join(stagingDir, innerRel)), { recursive: true });
  await fsp.writeFile(path.join(stagingDir, innerRel), innerContents);
  const tarballPath = path.join(stagingDir, "fixture.tgz");
  await tar.c({ file: tarballPath, cwd: stagingDir, gzip: true }, ["node_modules"]);
  return {
    tarballPath,
    innerFile: innerRel,
    innerContents,
    cleanup: async () => fsp.rm(stagingDir, { recursive: true, force: true })
  };
}
async function startServer(body) {
  const http = await import("http");
  return new Promise((resolve) => {
    const state = { count: 0, lastPath: void 0 };
    const server = http.createServer((req, res) => {
      state.count++;
      state.lastPath = req.url;
      res.statusCode = 200;
      res.setHeader("content-type", "application/octet-stream");
      res.setHeader("content-length", String(body.length));
      res.end(body);
    });
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({
        get port() {
          return port;
        },
        get requestCount() {
          return state.count;
        },
        get lastPath() {
          return state.lastPath;
        },
        close: () => new Promise((res) => server.close(() => res()))
      });
    });
  });
}
function makeEnvService(userDataPath) {
  return { userDataPath, args: { "force-disable-user-env": true } };
}
function makeProductService(config) {
  return {
    agentSdks: config ? { claude: config } : void 0
  };
}
function makeRequestService(disposables) {
  return disposables.add(new RequestService(
    "local",
    new TestConfigurationService(),
    makeEnvService("/unused-for-requestservice"),
    new NullLogService()
  ));
}
function makeFileService(disposables) {
  const log = new NullLogService();
  const svc = disposables.add(new FileService(log));
  disposables.add(svc.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(log))));
  return svc;
}
suite("resolveSdkTarget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function fakePkg(hasSeparateMuslLinuxPackage) {
    return { id: "test", displayName: "Test", devOverrideEnvVar: "X", hasSeparateMuslLinuxPackage };
  }
  test("returns <platform>-<arch> for supported (platform, arch)", () => {
    assert.deepStrictEqual({
      "darwin-x64": resolveSdkTarget(fakePkg(false), { platform: "darwin", arch: "x64", libc: void 0 }),
      "darwin-arm64": resolveSdkTarget(fakePkg(false), { platform: "darwin", arch: "arm64", libc: void 0 }),
      "linux-x64": resolveSdkTarget(fakePkg(false), { platform: "linux", arch: "x64", libc: "glibc" }),
      "linux-arm64": resolveSdkTarget(fakePkg(false), { platform: "linux", arch: "arm64", libc: "glibc" }),
      "win32-x64": resolveSdkTarget(fakePkg(false), { platform: "win32", arch: "x64", libc: void 0 }),
      "win32-arm64": resolveSdkTarget(fakePkg(false), { platform: "win32", arch: "arm64", libc: void 0 })
    }, {
      "darwin-x64": "darwin-x64",
      "darwin-arm64": "darwin-arm64",
      "linux-x64": "linux-x64",
      "linux-arm64": "linux-arm64",
      "win32-x64": "win32-x64",
      "win32-arm64": "win32-arm64"
    });
  });
  test("appends -musl on musl Linux iff the package has separate musl SKUs", () => {
    assert.strictEqual(
      resolveSdkTarget(fakePkg(true), { platform: "linux", arch: "x64", libc: "musl" }),
      "linux-x64-musl",
      "claude-style: musl host \u2192 -musl suffix"
    );
    assert.strictEqual(
      resolveSdkTarget(fakePkg(false), { platform: "linux", arch: "x64", libc: "musl" }),
      "linux-x64",
      "codex-style: musl host \u2192 no suffix (statically musl-linked, single SKU)"
    );
    assert.strictEqual(
      resolveSdkTarget(fakePkg(true), { platform: "linux", arch: "x64", libc: "glibc" }),
      "linux-x64",
      "claude-style: glibc host \u2192 no suffix"
    );
  });
  test("returns undefined for unsupported (platform, arch)", () => {
    assert.strictEqual(resolveSdkTarget(fakePkg(true), { platform: "linux", arch: "armhf", libc: "glibc" }), void 0);
    assert.strictEqual(resolveSdkTarget(fakePkg(true), { platform: "freebsd", arch: "x64", libc: void 0 }), void 0);
    assert.strictEqual(resolveSdkTarget(fakePkg(false), { platform: "darwin", arch: "ia32", libc: void 0 }), void 0);
  });
});
suite("AgentSdkDownloader", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  let userDataPath;
  let fixture;
  let server;
  let originalEnvOverride;
  let hostSdkTarget;
  function newToken() {
    const src = disposables.add(new CancellationTokenSource());
    return src.token;
  }
  suiteSetup(function() {
    const target = resolveSdkTarget(ClaudeSdkPackage);
    if (!target) {
      this.skip();
    }
    hostSdkTarget = target;
  });
  setup(async () => {
    originalEnvOverride = process.env[AgentHostClaudeSdkRootEnvVar];
    delete process.env[AgentHostClaudeSdkRootEnvVar];
    userDataPath = await fsp.mkdtemp(path.join(os.tmpdir(), "sdk-userdata-"));
    fixture = await buildFixtureTarball();
    server = await startServer(await fsp.readFile(fixture.tarballPath));
  });
  teardown(async () => {
    await server.close();
    await fixture.cleanup();
    await fsp.rm(userDataPath, { recursive: true, force: true });
    if (originalEnvOverride === void 0) {
      delete process.env[AgentHostClaudeSdkRootEnvVar];
    } else {
      process.env[AgentHostClaudeSdkRootEnvVar] = originalEnvOverride;
    }
  });
  function makeDownloader(productConfig) {
    const config = productConfig === null ? void 0 : {
      version: productConfig?.version ?? "1.0.0",
      urlTemplate: productConfig?.urlTemplate ?? `http://127.0.0.1:${server.port}/sdk-{sdkTarget}.tgz`
    };
    return disposables.add(new AgentSdkDownloader(
      makeEnvService(userDataPath),
      makeProductService(config),
      makeRequestService(disposables),
      makeFileService(disposables),
      new NullLogService()
    ));
  }
  test("isAvailable: false when no env override and no product config", () => {
    assert.strictEqual(makeDownloader(null).isAvailable(ClaudeSdkPackage), false);
  });
  test("isAvailable: true when env override set", () => {
    process.env[AgentHostClaudeSdkRootEnvVar] = "/some/path";
    assert.strictEqual(makeDownloader(null).isAvailable(ClaudeSdkPackage), true);
  });
  test("isAvailable: true when product config populated and host has a target", () => {
    assert.strictEqual(makeDownloader().isAvailable(ClaudeSdkPackage), true);
  });
  test("loadSdkRoot: dev override returns the path unchanged", async () => {
    process.env[AgentHostClaudeSdkRootEnvVar] = "/path/to/dev/sdk";
    const root = await makeDownloader(null).loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(root, "/path/to/dev/sdk");
  });
  test("loadSdkRoot: substitutes {sdkTarget} into urlTemplate", async () => {
    await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.lastPath, `/sdk-${hostSdkTarget}.tgz`);
  });
  test("loadSdkRoot: cache miss \u2192 downloads, extracts, writes sentinel", async () => {
    const root = await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.requestCount, 1);
    const extracted = await fsp.readFile(path.join(root, fixture.innerFile), "utf8");
    assert.strictEqual(extracted, fixture.innerContents);
    assert.ok(fs.existsSync(path.join(root, ".complete")));
  });
  test("loadSdkRoot: reports monotonic download progress ending at totalBytes", async () => {
    const downloader = makeDownloader();
    const samples = [];
    disposables.add(downloader.onDidDownloadProgress((p) => samples.push(p)));
    await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    const tarballSize = (await fsp.stat(fixture.tarballPath)).size;
    assert.ok(samples.length >= 2, "expected at least a started and a completed frame");
    assert.strictEqual(samples[0].phase, "started");
    const completed = samples[samples.length - 1];
    assert.strictEqual(completed.phase, "completed");
    assert.ok(samples.every((s) => s.downloadId === samples[0].downloadId), "all frames share one downloadId");
    assert.ok(samples.every((s) => s.displayName === "Claude"), "all frames carry the brand display name");
    for (let i = 1; i < samples.length; i++) {
      assert.ok(samples[i].receivedBytes >= samples[i - 1].receivedBytes, "receivedBytes must be monotonic");
    }
    assert.strictEqual(completed.totalBytes, tarballSize);
    assert.strictEqual(completed.receivedBytes, tarballSize);
  });
  test("loadSdkRoot: marks progress explicitly requested by a user-initiated flow", async () => {
    const downloader = makeDownloader();
    const samples = [];
    disposables.add(downloader.onDidDownloadProgress((p) => samples.push(p)));
    disposables.add(downloader.acquireDownloadProgressInterest(ClaudeSdkPackage));
    await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.ok(samples.length >= 2);
    assert.ok(samples.every((sample) => sample.explicitlyRequested));
  });
  test("loadSdkRoot: cache hit returns immediately without re-downloading", async () => {
    const downloader = makeDownloader();
    await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.requestCount, 1);
    await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(server.requestCount, 1, "cache hit should not re-download");
  });
  test("loadSdkRoot: cache dir includes sdkTarget so Universal launches stay separate", async () => {
    const root = await makeDownloader().loadSdkRoot(ClaudeSdkPackage, newToken());
    const expected = path.join(userDataPath, "agent-host", "sdk-cache", "claude", "1.0.0", hostSdkTarget);
    assert.strictEqual(root, expected);
  });
  test("loadSdkRoot: missing product config and no env override throws actionable error", async () => {
    await assert.rejects(
      () => makeDownloader(null).loadSdkRoot(ClaudeSdkPackage, newToken()),
      /no `product\.agentSdks\.claude` configured/
    );
  });
  test("loadSdkRoot: urlTemplate with unknown placeholder throws config error", async () => {
    const downloader = makeDownloader({
      urlTemplate: `http://127.0.0.1:${server.port}/sdk-{sdkTaret}.tgz`
    });
    await assert.rejects(
      () => downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
      /unknown placeholder \{sdkTaret\}/
    );
    assert.strictEqual(server.requestCount, 0, "should fail before any HTTP call");
  });
  test("loadSdkRoot: cancel before download completes cleans up scratch dir", async function() {
    this.timeout(15e3);
    await server.close();
    const http = await import("http");
    const hangingServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-length": "999999" });
      res.write(Buffer.alloc(8));
    });
    await new Promise((r) => hangingServer.listen(0, "127.0.0.1", () => r()));
    const port = hangingServer.address().port;
    try {
      const downloader = makeDownloader({
        version: "1.0.0",
        urlTemplate: `http://127.0.0.1:${port}/sdk-{sdkTarget}.tgz`
      });
      const cts = disposables.add(new CancellationTokenSource());
      const promise = downloader.loadSdkRoot(ClaudeSdkPackage, cts.token);
      await new Promise((r) => setTimeout(r, 50));
      cts.cancel();
      await assert.rejects(() => promise, /Cancel|cancel|Failed to download/);
      const versionDir = path.join(userDataPath, "agent-host", "sdk-cache", "claude", "1.0.0");
      const leftover = fs.existsSync(versionDir) ? (await fsp.readdir(versionDir)).filter((f) => f.includes(".tmp.")) : [];
      assert.deepStrictEqual(leftover, []);
    } finally {
      hangingServer.closeAllConnections();
      await new Promise((r) => hangingServer.close(() => r()));
    }
  });
  test("loadSdkRoot: concurrent calls in same process share one download", async () => {
    const downloader = makeDownloader();
    const [a, b, c] = await Promise.all([
      downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
      downloader.loadSdkRoot(ClaudeSdkPackage, newToken()),
      downloader.loadSdkRoot(ClaudeSdkPackage, newToken())
    ]);
    assert.strictEqual(a, b);
    assert.strictEqual(b, c);
    assert.strictEqual(server.requestCount, 1, "concurrent loaders must dedupe");
  });
  test("loadSdkRoot: rename-loser path returns existing cache when winner already published", async () => {
    const downloader = makeDownloader();
    const target = path.join(userDataPath, "agent-host", "sdk-cache", "claude", "1.0.0", hostSdkTarget);
    await fsp.mkdir(target, { recursive: true });
    await fsp.mkdir(path.dirname(path.join(target, fixture.innerFile)), { recursive: true });
    await fsp.writeFile(path.join(target, fixture.innerFile), fixture.innerContents);
    await fsp.writeFile(path.join(target, ".complete"), "");
    const root = await downloader.loadSdkRoot(ClaudeSdkPackage, newToken());
    assert.strictEqual(root, target);
    assert.strictEqual(server.requestCount, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudFNka0Rvd25sb2FkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGZzcCBmcm9tICdmcy9wcm9taXNlcyc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHBUeXBlIGZyb20gJ2h0dHAnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IERpc2tGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9ub2RlL2Rpc2tGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3JlcXVlc3Qvbm9kZS9yZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNka0Rvd25sb2FkZXIsIHJlc29sdmVTZGtUYXJnZXQsIHR5cGUgSUFnZW50U2RrUGFja2FnZSwgdHlwZSBJQWdlbnRTZGtEb3dubG9hZFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudFNka0Rvd25sb2FkZXIuanMnO1xuaW1wb3J0IHsgQ2xhdWRlU2RrUGFja2FnZSB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZUFnZW50U2RrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGF1ZGVTZGtSb290RW52VmFyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHR5cGUgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJVGVzdFNka0Rvd25sb2FkRml4dHVyZSB7XG5cdHRhcmJhbGxQYXRoOiBzdHJpbmc7XG5cdGlubmVyRmlsZTogc3RyaW5nOyAvLyBwYXRoIHRoYXQgc2hvdWxkIGV4aXN0IGluc2lkZSB0aGUgZXh0cmFjdGVkIHJvb3Rcblx0aW5uZXJDb250ZW50czogc3RyaW5nO1xuXHRjbGVhbnVwOiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xufVxuXG5hc3luYyBmdW5jdGlvbiBidWlsZEZpeHR1cmVUYXJiYWxsKCk6IFByb21pc2U8SVRlc3RTZGtEb3dubG9hZEZpeHR1cmU+IHtcblx0Y29uc3QgdGFyID0gYXdhaXQgaW1wb3J0KCd0YXInKTtcblx0Y29uc3Qgc3RhZ2luZ0RpciA9IGF3YWl0IGZzcC5ta2R0ZW1wKHBhdGguam9pbihvcy50bXBkaXIoKSwgJ3Nkay1maXh0dXJlLScpKTtcblx0Y29uc3QgaW5uZXJSZWwgPSBwYXRoLmpvaW4oJ25vZGVfbW9kdWxlcycsICdAYW50aHJvcGljLWFpJywgJ2NsYXVkZS1hZ2VudC1zZGsnLCAnc2RrLm1qcycpO1xuXHRjb25zdCBpbm5lckNvbnRlbnRzID0gJy8vIGZpeHR1cmUgc2RrLm1qc1xcbmV4cG9ydCBkZWZhdWx0IHt9O1xcbic7XG5cdGF3YWl0IGZzcC5ta2RpcihwYXRoLmRpcm5hbWUocGF0aC5qb2luKHN0YWdpbmdEaXIsIGlubmVyUmVsKSksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRhd2FpdCBmc3Aud3JpdGVGaWxlKHBhdGguam9pbihzdGFnaW5nRGlyLCBpbm5lclJlbCksIGlubmVyQ29udGVudHMpO1xuXHRjb25zdCB0YXJiYWxsUGF0aCA9IHBhdGguam9pbihzdGFnaW5nRGlyLCAnZml4dHVyZS50Z3onKTtcblx0YXdhaXQgdGFyLmMoeyBmaWxlOiB0YXJiYWxsUGF0aCwgY3dkOiBzdGFnaW5nRGlyLCBnemlwOiB0cnVlIH0sIFsnbm9kZV9tb2R1bGVzJ10pO1xuXHRyZXR1cm4ge1xuXHRcdHRhcmJhbGxQYXRoLFxuXHRcdGlubmVyRmlsZTogaW5uZXJSZWwsXG5cdFx0aW5uZXJDb250ZW50cyxcblx0XHRjbGVhbnVwOiBhc3luYyAoKSA9PiBmc3Aucm0oc3RhZ2luZ0RpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pLFxuXHR9O1xufVxuXG5pbnRlcmZhY2UgSVRlc3RTZXJ2ZXIge1xuXHRwb3J0OiBudW1iZXI7XG5cdHJlcXVlc3RDb3VudDogbnVtYmVyO1xuXHRsYXN0UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRjbG9zZTogKCkgPT4gUHJvbWlzZTx2b2lkPjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RhcnRTZXJ2ZXIoYm9keTogQnVmZmVyKTogUHJvbWlzZTxJVGVzdFNlcnZlcj4ge1xuXHRjb25zdCBodHRwOiB0eXBlb2YgaHR0cFR5cGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0geyBjb3VudDogMCwgbGFzdFBhdGg6IHVuZGVmaW5lZCBhcyBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRjb25zdCBzZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHtcblx0XHRcdHN0YXRlLmNvdW50Kys7XG5cdFx0XHRzdGF0ZS5sYXN0UGF0aCA9IHJlcS51cmw7XG5cdFx0XHRyZXMuc3RhdHVzQ29kZSA9IDIwMDtcblx0XHRcdHJlcy5zZXRIZWFkZXIoJ2NvbnRlbnQtdHlwZScsICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nKTtcblx0XHRcdHJlcy5zZXRIZWFkZXIoJ2NvbnRlbnQtbGVuZ3RoJywgU3RyaW5nKGJvZHkubGVuZ3RoKSk7XG5cdFx0XHRyZXMuZW5kKGJvZHkpO1xuXHRcdH0pO1xuXHRcdHNlcnZlci5saXN0ZW4oMCwgJzEyNy4wLjAuMScsICgpID0+IHtcblx0XHRcdGNvbnN0IGFkZHIgPSBzZXJ2ZXIuYWRkcmVzcygpO1xuXHRcdFx0Y29uc3QgcG9ydCA9IHR5cGVvZiBhZGRyID09PSAnb2JqZWN0JyAmJiBhZGRyID8gYWRkci5wb3J0IDogMDtcblx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRnZXQgcG9ydCgpIHsgcmV0dXJuIHBvcnQ7IH0sXG5cdFx0XHRcdGdldCByZXF1ZXN0Q291bnQoKSB7IHJldHVybiBzdGF0ZS5jb3VudDsgfSxcblx0XHRcdFx0Z2V0IGxhc3RQYXRoKCkgeyByZXR1cm4gc3RhdGUubGFzdFBhdGg7IH0sXG5cdFx0XHRcdGNsb3NlOiAoKSA9PiBuZXcgUHJvbWlzZShyZXMgPT4gc2VydmVyLmNsb3NlKCgpID0+IHJlcygpKSksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIG1ha2VFbnZTZXJ2aWNlKHVzZXJEYXRhUGF0aDogc3RyaW5nKTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB7XG5cdC8vIGBSZXF1ZXN0U2VydmljZS5yZXF1ZXN0YCBjYWxscyBgZ2V0UmVzb2x2ZWRTaGVsbEVudihjb25maWdTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBhcmdzLCBwcm9jZXNzLmVudilgLlxuXHQvLyBgZm9yY2UtZGlzYWJsZS11c2VyLWVudjogdHJ1ZWAgc2hvcnQtY2lyY3VpdHMgYmVmb3JlIHNwYXduaW5nIGEgc2hlbGwgXHUyMDE0XG5cdC8vIHdpdGhvdXQgaXQgYHNoZWxsRW52LnRzOjE0MGAgcmVnaXN0ZXJzIGEgY2FuY2VsbGF0aW9uIGxpc3RlbmVyIHRoYXRcblx0Ly8gbGVha3MgYWNyb3NzIHRlc3RzIGFuZCB0cmlwcyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUuXG5cdHJldHVybiB7IHVzZXJEYXRhUGF0aCwgYXJnczogeyAnZm9yY2UtZGlzYWJsZS11c2VyLWVudic6IHRydWUgfSBhcyBuZXZlciB9IGFzIHVua25vd24gYXMgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZTtcbn1cblxuZnVuY3Rpb24gbWFrZVByb2R1Y3RTZXJ2aWNlKGNvbmZpZzogeyB2ZXJzaW9uOiBzdHJpbmc7IHVybFRlbXBsYXRlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCk6IElQcm9kdWN0U2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0YWdlbnRTZGtzOiBjb25maWcgPyB7IGNsYXVkZTogY29uZmlnIH0gOiB1bmRlZmluZWQsXG5cdH0gYXMgdW5rbm93biBhcyBJUHJvZHVjdFNlcnZpY2U7XG59XG5cbmZ1bmN0aW9uIG1ha2VSZXF1ZXN0U2VydmljZShkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPik6IFJlcXVlc3RTZXJ2aWNlIHtcblx0Ly8gQmFyZSBSZXF1ZXN0U2VydmljZTogbm8gaHR0cC5wcm94eSBzZXR0aW5nLCBubyBzcGVjaWFsIGNvbmZpZy5cblx0Ly8gUmVhZHMgc3lzdGVtIHByb3h5IGVudiB2YXJzIChIVFRQX1BST1hZLCBIVFRQU19QUk9YWSwgTk9fUFJPWFkpIFx1MjAxNCBub25lIHNldFxuXHQvLyBpbiBDSSBzbyBkaXJlY3QgY29ubmVjdGlvbiB0byB0aGUgdGVzdCBsb29wYmFjayBzZXJ2ZXIgd29ya3MuXG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFJlcXVlc3RTZXJ2aWNlKFxuXHRcdCdsb2NhbCcsXG5cdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdG1ha2VFbnZTZXJ2aWNlKCcvdW51c2VkLWZvci1yZXF1ZXN0c2VydmljZScpLFxuXHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHQpKTtcbn1cblxuZnVuY3Rpb24gbWFrZUZpbGVTZXJ2aWNlKGRpc3Bvc2FibGVzOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KTogSUZpbGVTZXJ2aWNlIHtcblx0Ly8gUmVhbCBGaWxlU2VydmljZSB3aXRoIERpc2tGaWxlU3lzdGVtUHJvdmlkZXIgZm9yIGBmaWxlOi8vYCBcdTIwMTQgbWF0Y2hlc1xuXHQvLyB0aGUgd2lyaW5nIGluIGBhZ2VudEhvc3RNYWluLnRzYC4gRWFjaCB0ZXN0IGdldHMgaXRzIG93biBjbGVhbiBpbnN0YW5jZVxuXHQvLyBzbyBwcm92aWRlciByZWdpc3RyYXRpb25zIGRvbid0IGJsZWVkIGFjcm9zcyB0ZXN0cy5cblx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdGNvbnN0IHN2YyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nKSk7XG5cdGRpc3Bvc2FibGVzLmFkZChzdmMucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGRpc3Bvc2FibGVzLmFkZChuZXcgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlcihsb2cpKSkpO1xuXHRyZXR1cm4gc3ZjO1xufVxuXG4vKipcbiAqIFVuaXQgdGVzdHMgZm9yIHRoZSBwbGF0Zm9ybS9hcmNoL2xpYmMgXHUyMTkyIHNka1RhcmdldCBtYXBwaW5nLiBUaGVzZSBjb3ZlclxuICogdGhlIGNyb3NzLXByb2R1Y3QgdGhlIGRvd25sb2FkZXIgY2FuJ3QgZWFzaWx5IGV4ZXJjaXNlIChVbml2ZXJzYWwgeDY0XG4gKiBsYXVuY2hlcyBmcm9tIGFybTY0IGhvc3RzLCBtdXNsIExpbnV4IGZyb20gYSBtYWNPUyBDSSBydW5uZXIsIFx1MjAyNikgYnlcbiAqIHBhc3NpbmcgYSBzeW50aGV0aWMgaG9zdCBkaXJlY3RseSB0byB0aGUgcHVyZSBmdW5jdGlvbi5cbiAqL1xuc3VpdGUoJ3Jlc29sdmVTZGtUYXJnZXQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZmFrZVBrZyhoYXNTZXBhcmF0ZU11c2xMaW51eFBhY2thZ2U6IGJvb2xlYW4pOiBJQWdlbnRTZGtQYWNrYWdlIHtcblx0XHRyZXR1cm4geyBpZDogJ3Rlc3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QnLCBkZXZPdmVycmlkZUVudlZhcjogJ1gnLCBoYXNTZXBhcmF0ZU11c2xMaW51eFBhY2thZ2UgfTtcblx0fVxuXG5cdHRlc3QoJ3JldHVybnMgPHBsYXRmb3JtPi08YXJjaD4gZm9yIHN1cHBvcnRlZCAocGxhdGZvcm0sIGFyY2gpJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0J2Rhcndpbi14NjQnOiByZXNvbHZlU2RrVGFyZ2V0KGZha2VQa2coZmFsc2UpLCB7IHBsYXRmb3JtOiAnZGFyd2luJywgYXJjaDogJ3g2NCcsIGxpYmM6IHVuZGVmaW5lZCB9KSxcblx0XHRcdCdkYXJ3aW4tYXJtNjQnOiByZXNvbHZlU2RrVGFyZ2V0KGZha2VQa2coZmFsc2UpLCB7IHBsYXRmb3JtOiAnZGFyd2luJywgYXJjaDogJ2FybTY0JywgbGliYzogdW5kZWZpbmVkIH0pLFxuXHRcdFx0J2xpbnV4LXg2NCc6IHJlc29sdmVTZGtUYXJnZXQoZmFrZVBrZyhmYWxzZSksIHsgcGxhdGZvcm06ICdsaW51eCcsIGFyY2g6ICd4NjQnLCBsaWJjOiAnZ2xpYmMnIH0pLFxuXHRcdFx0J2xpbnV4LWFybTY0JzogcmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKGZhbHNlKSwgeyBwbGF0Zm9ybTogJ2xpbnV4JywgYXJjaDogJ2FybTY0JywgbGliYzogJ2dsaWJjJyB9KSxcblx0XHRcdCd3aW4zMi14NjQnOiByZXNvbHZlU2RrVGFyZ2V0KGZha2VQa2coZmFsc2UpLCB7IHBsYXRmb3JtOiAnd2luMzInLCBhcmNoOiAneDY0JywgbGliYzogdW5kZWZpbmVkIH0pLFxuXHRcdFx0J3dpbjMyLWFybTY0JzogcmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKGZhbHNlKSwgeyBwbGF0Zm9ybTogJ3dpbjMyJywgYXJjaDogJ2FybTY0JywgbGliYzogdW5kZWZpbmVkIH0pLFxuXHRcdH0sIHtcblx0XHRcdCdkYXJ3aW4teDY0JzogJ2Rhcndpbi14NjQnLFxuXHRcdFx0J2Rhcndpbi1hcm02NCc6ICdkYXJ3aW4tYXJtNjQnLFxuXHRcdFx0J2xpbnV4LXg2NCc6ICdsaW51eC14NjQnLFxuXHRcdFx0J2xpbnV4LWFybTY0JzogJ2xpbnV4LWFybTY0Jyxcblx0XHRcdCd3aW4zMi14NjQnOiAnd2luMzIteDY0Jyxcblx0XHRcdCd3aW4zMi1hcm02NCc6ICd3aW4zMi1hcm02NCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZHMgLW11c2wgb24gbXVzbCBMaW51eCBpZmYgdGhlIHBhY2thZ2UgaGFzIHNlcGFyYXRlIG11c2wgU0tVcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRyZXNvbHZlU2RrVGFyZ2V0KGZha2VQa2codHJ1ZSksIHsgcGxhdGZvcm06ICdsaW51eCcsIGFyY2g6ICd4NjQnLCBsaWJjOiAnbXVzbCcgfSksXG5cdFx0XHQnbGludXgteDY0LW11c2wnLFxuXHRcdFx0J2NsYXVkZS1zdHlsZTogbXVzbCBob3N0IFx1MjE5MiAtbXVzbCBzdWZmaXgnLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKGZhbHNlKSwgeyBwbGF0Zm9ybTogJ2xpbnV4JywgYXJjaDogJ3g2NCcsIGxpYmM6ICdtdXNsJyB9KSxcblx0XHRcdCdsaW51eC14NjQnLFxuXHRcdFx0J2NvZGV4LXN0eWxlOiBtdXNsIGhvc3QgXHUyMTkyIG5vIHN1ZmZpeCAoc3RhdGljYWxseSBtdXNsLWxpbmtlZCwgc2luZ2xlIFNLVSknLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKHRydWUpLCB7IHBsYXRmb3JtOiAnbGludXgnLCBhcmNoOiAneDY0JywgbGliYzogJ2dsaWJjJyB9KSxcblx0XHRcdCdsaW51eC14NjQnLFxuXHRcdFx0J2NsYXVkZS1zdHlsZTogZ2xpYmMgaG9zdCBcdTIxOTIgbm8gc3VmZml4Jyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5zdXBwb3J0ZWQgKHBsYXRmb3JtLCBhcmNoKScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZVNka1RhcmdldChmYWtlUGtnKHRydWUpLCB7IHBsYXRmb3JtOiAnbGludXgnLCBhcmNoOiAnYXJtaGYnLCBsaWJjOiAnZ2xpYmMnIH0pLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlU2RrVGFyZ2V0KGZha2VQa2codHJ1ZSksIHsgcGxhdGZvcm06ICdmcmVlYnNkJyBhcyBOb2RlSlMuUGxhdGZvcm0sIGFyY2g6ICd4NjQnLCBsaWJjOiB1bmRlZmluZWQgfSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVTZGtUYXJnZXQoZmFrZVBrZyhmYWxzZSksIHsgcGxhdGZvcm06ICdkYXJ3aW4nLCBhcmNoOiAnaWEzMicsIGxpYmM6IHVuZGVmaW5lZCB9KSwgdW5kZWZpbmVkKTtcblx0fSk7XG59KTtcblxuLyoqXG4gKiBJbnRlZ3JhdGlvbiB0ZXN0cyBmb3IgdGhlIGRvd25sb2FkZXIncyBuZXR3b3JrIFx1MjE5MiBjYWNoZSBcdTIxOTIgZXh0cmFjdCBmbG93LlxuICogVGhlc2UgcnVuIGFnYWluc3Qgd2hhdGV2ZXIgYHByb2Nlc3MucGxhdGZvcm1gIHRoZSB0ZXN0IGhvc3QgaXMgXHUyMDE0IHRoZVxuICogcHVyZSBgcmVzb2x2ZVNka1RhcmdldGAgc3VpdGUgYWJvdmUgY292ZXJzIHRoZSBjcm9zcy1ob3N0IG1hdHJpeC5cbiAqL1xuc3VpdGUoJ0FnZW50U2RrRG93bmxvYWRlcicsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB1c2VyRGF0YVBhdGg6IHN0cmluZztcblx0bGV0IGZpeHR1cmU6IElUZXN0U2RrRG93bmxvYWRGaXh0dXJlO1xuXHRsZXQgc2VydmVyOiBJVGVzdFNlcnZlcjtcblx0bGV0IG9yaWdpbmFsRW52T3ZlcnJpZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIFdoYXRldmVyIHRoZSBob3N0IHJlc29sdmVzIHRvIFx1MjAxNCB1c2VkIGZvciBjYWNoZS1kaXIgcGF0aCBhc3NlcnRpb25zLiAqL1xuXHRsZXQgaG9zdFNka1RhcmdldDogc3RyaW5nO1xuXG5cdC8qKiBBIGNhbmNlbGxhdGlvbiB0b2tlbiB3aG9zZSBzb3VyY2UgaXMgZGlzcG9zZWQgaW4gdGVhcmRvd24uICovXG5cdGZ1bmN0aW9uIG5ld1Rva2VuKCkge1xuXHRcdGNvbnN0IHNyYyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0cmV0dXJuIHNyYy50b2tlbjtcblx0fVxuXG5cdHN1aXRlU2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdC8vIFNraXAgdGhlIGludGVncmF0aW9uIHN1aXRlIG9uIGhvc3RzIHRoZSBkb3dubG9hZGVyIGNhbid0IHJlc29sdmVcblx0XHQvLyBhIHRhcmdldCBmb3IgKGUuZy4gbGludXgtYXJtaGYpLiBgcmVzb2x2ZVNka1RhcmdldGAgaXMgY292ZXJlZFxuXHRcdC8vIGFib3ZlIGFuZCBkb2Vzbid0IG5lZWQgYSByZWFsIGhvc3QuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gcmVzb2x2ZVNka1RhcmdldChDbGF1ZGVTZGtQYWNrYWdlKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhpcy5za2lwKCk7XG5cdFx0fVxuXHRcdGhvc3RTZGtUYXJnZXQgPSB0YXJnZXQ7XG5cdH0pO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRvcmlnaW5hbEVudk92ZXJyaWRlID0gcHJvY2Vzcy5lbnZbQWdlbnRIb3N0Q2xhdWRlU2RrUm9vdEVudlZhcl07XG5cdFx0ZGVsZXRlIHByb2Nlc3MuZW52W0FnZW50SG9zdENsYXVkZVNka1Jvb3RFbnZWYXJdO1xuXHRcdHVzZXJEYXRhUGF0aCA9IGF3YWl0IGZzcC5ta2R0ZW1wKHBhdGguam9pbihvcy50bXBkaXIoKSwgJ3Nkay11c2VyZGF0YS0nKSk7XG5cdFx0Zml4dHVyZSA9IGF3YWl0IGJ1aWxkRml4dHVyZVRhcmJhbGwoKTtcblx0XHRzZXJ2ZXIgPSBhd2FpdCBzdGFydFNlcnZlcihhd2FpdCBmc3AucmVhZEZpbGUoZml4dHVyZS50YXJiYWxsUGF0aCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VydmVyLmNsb3NlKCk7XG5cdFx0YXdhaXQgZml4dHVyZS5jbGVhbnVwKCk7XG5cdFx0YXdhaXQgZnNwLnJtKHVzZXJEYXRhUGF0aCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdGlmIChvcmlnaW5hbEVudk92ZXJyaWRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlbGV0ZSBwcm9jZXNzLmVudltBZ2VudEhvc3RDbGF1ZGVTZGtSb290RW52VmFyXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvY2Vzcy5lbnZbQWdlbnRIb3N0Q2xhdWRlU2RrUm9vdEVudlZhcl0gPSBvcmlnaW5hbEVudk92ZXJyaWRlO1xuXHRcdH1cblx0fSk7XG5cblx0LyoqXG5cdCAqIERlZmF1bHQgdXJsVGVtcGxhdGUgcmVmZXJlbmNlcyBge3Nka1RhcmdldH1gIHNvIHdlIGV4ZXJjaXNlIHRoZVxuXHQgKiBzdWJzdGl0dXRpb24gcGF0aDsgdGVzdHMgdGhhdCBuZWVkIGEgY3VzdG9tIFVSTCBwYXNzIHVybFRlbXBsYXRlXG5cdCAqIGV4cGxpY2l0bHkuIFBhc3MgYHByb2R1Y3RDb25maWc6IG51bGxgIHRvIG9taXQgdGhlIGFnZW50U2RrcyBibG9ja1xuXHQgKiBlbnRpcmVseSAodGhlIFwibm8gcHJvZHVjdCBjb25maWdcIiBjYXNlKS5cblx0ICovXG5cdGZ1bmN0aW9uIG1ha2VEb3dubG9hZGVyKHByb2R1Y3RDb25maWc/OiB7IHZlcnNpb24/OiBzdHJpbmc7IHVybFRlbXBsYXRlPzogc3RyaW5nIH0gfCBudWxsKSB7XG5cdFx0Y29uc3QgY29uZmlnID0gcHJvZHVjdENvbmZpZyA9PT0gbnVsbCA/IHVuZGVmaW5lZCA6IHtcblx0XHRcdHZlcnNpb246IHByb2R1Y3RDb25maWc/LnZlcnNpb24gPz8gJzEuMC4wJyxcblx0XHRcdHVybFRlbXBsYXRlOiBwcm9kdWN0Q29uZmlnPy51cmxUZW1wbGF0ZSA/PyBgaHR0cDovLzEyNy4wLjAuMToke3NlcnZlci5wb3J0fS9zZGste3Nka1RhcmdldH0udGd6YCxcblx0XHR9O1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U2RrRG93bmxvYWRlcihcblx0XHRcdG1ha2VFbnZTZXJ2aWNlKHVzZXJEYXRhUGF0aCksXG5cdFx0XHRtYWtlUHJvZHVjdFNlcnZpY2UoY29uZmlnKSxcblx0XHRcdG1ha2VSZXF1ZXN0U2VydmljZShkaXNwb3NhYmxlcyksXG5cdFx0XHRtYWtlRmlsZVNlcnZpY2UoZGlzcG9zYWJsZXMpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cdH1cblxuXHR0ZXN0KCdpc0F2YWlsYWJsZTogZmFsc2Ugd2hlbiBubyBlbnYgb3ZlcnJpZGUgYW5kIG5vIHByb2R1Y3QgY29uZmlnJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWtlRG93bmxvYWRlcihudWxsKS5pc0F2YWlsYWJsZShDbGF1ZGVTZGtQYWNrYWdlKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0F2YWlsYWJsZTogdHJ1ZSB3aGVuIGVudiBvdmVycmlkZSBzZXQnLCAoKSA9PiB7XG5cdFx0cHJvY2Vzcy5lbnZbQWdlbnRIb3N0Q2xhdWRlU2RrUm9vdEVudlZhcl0gPSAnL3NvbWUvcGF0aCc7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1ha2VEb3dubG9hZGVyKG51bGwpLmlzQXZhaWxhYmxlKENsYXVkZVNka1BhY2thZ2UpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnaXNBdmFpbGFibGU6IHRydWUgd2hlbiBwcm9kdWN0IGNvbmZpZyBwb3B1bGF0ZWQgYW5kIGhvc3QgaGFzIGEgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYWtlRG93bmxvYWRlcigpLmlzQXZhaWxhYmxlKENsYXVkZVNka1BhY2thZ2UpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGRldiBvdmVycmlkZSByZXR1cm5zIHRoZSBwYXRoIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRwcm9jZXNzLmVudltBZ2VudEhvc3RDbGF1ZGVTZGtSb290RW52VmFyXSA9ICcvcGF0aC90by9kZXYvc2RrJztcblx0XHRjb25zdCByb290ID0gYXdhaXQgbWFrZURvd25sb2FkZXIobnVsbCkubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QsICcvcGF0aC90by9kZXYvc2RrJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRTZGtSb290OiBzdWJzdGl0dXRlcyB7c2RrVGFyZ2V0fSBpbnRvIHVybFRlbXBsYXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IG1ha2VEb3dubG9hZGVyKCkubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5sYXN0UGF0aCwgYC9zZGstJHtob3N0U2RrVGFyZ2V0fS50Z3pgKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGNhY2hlIG1pc3MgXHUyMTkyIGRvd25sb2FkcywgZXh0cmFjdHMsIHdyaXRlcyBzZW50aW5lbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gYXdhaXQgbWFrZURvd25sb2FkZXIoKS5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RDb3VudCwgMSk7XG5cdFx0Y29uc3QgZXh0cmFjdGVkID0gYXdhaXQgZnNwLnJlYWRGaWxlKHBhdGguam9pbihyb290LCBmaXh0dXJlLmlubmVyRmlsZSksICd1dGY4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RlZCwgZml4dHVyZS5pbm5lckNvbnRlbnRzKTtcblx0XHRhc3NlcnQub2soZnMuZXhpc3RzU3luYyhwYXRoLmpvaW4ocm9vdCwgJy5jb21wbGV0ZScpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRTZGtSb290OiByZXBvcnRzIG1vbm90b25pYyBkb3dubG9hZCBwcm9ncmVzcyBlbmRpbmcgYXQgdG90YWxCeXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkb3dubG9hZGVyID0gbWFrZURvd25sb2FkZXIoKTtcblx0XHRjb25zdCBzYW1wbGVzOiBJQWdlbnRTZGtEb3dubG9hZFByb2dyZXNzW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZG93bmxvYWRlci5vbkRpZERvd25sb2FkUHJvZ3Jlc3MocCA9PiBzYW1wbGVzLnB1c2gocCkpKTtcblxuXHRcdGF3YWl0IGRvd25sb2FkZXIubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSk7XG5cblx0XHRjb25zdCB0YXJiYWxsU2l6ZSA9IChhd2FpdCBmc3Auc3RhdChmaXh0dXJlLnRhcmJhbGxQYXRoKSkuc2l6ZTtcblx0XHQvLyBPbmUgYHN0YXJ0ZWRgLCBcdTIyNjUxIGBwcm9ncmVzc2AsIG9uZSB0ZXJtaW5hbCBgY29tcGxldGVkYCwgYWxsIHNoYXJpbmcgYVxuXHRcdC8vIHNpbmdsZSBkb3dubG9hZElkIGFuZCBjYXJyeWluZyB0aGUgYnJhbmQgZGlzcGxheSBuYW1lLlxuXHRcdGFzc2VydC5vayhzYW1wbGVzLmxlbmd0aCA+PSAyLCAnZXhwZWN0ZWQgYXQgbGVhc3QgYSBzdGFydGVkIGFuZCBhIGNvbXBsZXRlZCBmcmFtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYW1wbGVzWzBdLnBoYXNlLCAnc3RhcnRlZCcpO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IHNhbXBsZXNbc2FtcGxlcy5sZW5ndGggLSAxXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGVkLnBoYXNlLCAnY29tcGxldGVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHNhbXBsZXMuZXZlcnkocyA9PiBzLmRvd25sb2FkSWQgPT09IHNhbXBsZXNbMF0uZG93bmxvYWRJZCksICdhbGwgZnJhbWVzIHNoYXJlIG9uZSBkb3dubG9hZElkJyk7XG5cdFx0YXNzZXJ0Lm9rKHNhbXBsZXMuZXZlcnkocyA9PiBzLmRpc3BsYXlOYW1lID09PSAnQ2xhdWRlJyksICdhbGwgZnJhbWVzIGNhcnJ5IHRoZSBicmFuZCBkaXNwbGF5IG5hbWUnKTtcblxuXHRcdC8vIHJlY2VpdmVkQnl0ZXMgaXMgbW9ub3RvbmljYWxseSBub24tZGVjcmVhc2luZyBhbmQgcmVhY2hlcyB0aGUgdG90YWxcblx0XHQvLyByZXBvcnRlZCB2aWEgQ29udGVudC1MZW5ndGguXG5cdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBzYW1wbGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRhc3NlcnQub2soc2FtcGxlc1tpXS5yZWNlaXZlZEJ5dGVzID49IHNhbXBsZXNbaSAtIDFdLnJlY2VpdmVkQnl0ZXMsICdyZWNlaXZlZEJ5dGVzIG11c3QgYmUgbW9ub3RvbmljJyk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZWQudG90YWxCeXRlcywgdGFyYmFsbFNpemUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZWQucmVjZWl2ZWRCeXRlcywgdGFyYmFsbFNpemUpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkU2RrUm9vdDogbWFya3MgcHJvZ3Jlc3MgZXhwbGljaXRseSByZXF1ZXN0ZWQgYnkgYSB1c2VyLWluaXRpYXRlZCBmbG93JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRvd25sb2FkZXIgPSBtYWtlRG93bmxvYWRlcigpO1xuXHRcdGNvbnN0IHNhbXBsZXM6IElBZ2VudFNka0Rvd25sb2FkUHJvZ3Jlc3NbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkb3dubG9hZGVyLm9uRGlkRG93bmxvYWRQcm9ncmVzcyhwID0+IHNhbXBsZXMucHVzaChwKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkb3dubG9hZGVyLmFjcXVpcmVEb3dubG9hZFByb2dyZXNzSW50ZXJlc3QoQ2xhdWRlU2RrUGFja2FnZSkpO1xuXG5cdFx0YXdhaXQgZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKTtcblxuXHRcdGFzc2VydC5vayhzYW1wbGVzLmxlbmd0aCA+PSAyKTtcblx0XHRhc3NlcnQub2soc2FtcGxlcy5ldmVyeShzYW1wbGUgPT4gc2FtcGxlLmV4cGxpY2l0bHlSZXF1ZXN0ZWQpKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGNhY2hlIGhpdCByZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGhvdXQgcmUtZG93bmxvYWRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZG93bmxvYWRlciA9IG1ha2VEb3dubG9hZGVyKCk7XG5cdFx0YXdhaXQgZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RDb3VudCwgMSk7XG5cblx0XHQvLyBTZWNvbmQgY2FsbCBoaXRzIHRoZSBjYWNoZS5cblx0XHRhd2FpdCBkb3dubG9hZGVyLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdENvdW50LCAxLCAnY2FjaGUgaGl0IHNob3VsZCBub3QgcmUtZG93bmxvYWQnKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGNhY2hlIGRpciBpbmNsdWRlcyBzZGtUYXJnZXQgc28gVW5pdmVyc2FsIGxhdW5jaGVzIHN0YXkgc2VwYXJhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRGlyZWN0IHBhdGggY2hlY2sgdGhhdCB0aGUgY2FjaGUgZGlyIGxheW91dCBlbmNvZGVzIHNka1RhcmdldCBcdTIwMTRcblx0XHQvLyBwYWlycyB3aXRoIHRoZSByZXNvbHZlU2RrVGFyZ2V0IHVuaXQgdGVzdHMgYWJvdmUgdG8gY292ZXIgdGhlXG5cdFx0Ly8gbWFjT1MtVW5pdmVyc2FsIGNhc2UgKHdoaWNoIHdlIGNhbid0IHNpbXVsYXRlIGVuZC10by1lbmQgd2l0aG91dFxuXHRcdC8vIGluamVjdGluZyBhIGhvc3QgdGhlIHByb2R1Y3Rpb24gZG93bmxvYWRlciBkb2Vzbid0IGFjY2VwdCkuXG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IG1ha2VEb3dubG9hZGVyKCkubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBwYXRoLmpvaW4odXNlckRhdGFQYXRoLCAnYWdlbnQtaG9zdCcsICdzZGstY2FjaGUnLCAnY2xhdWRlJywgJzEuMC4wJywgaG9zdFNka1RhcmdldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QsIGV4cGVjdGVkKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IG1pc3NpbmcgcHJvZHVjdCBjb25maWcgYW5kIG5vIGVudiBvdmVycmlkZSB0aHJvd3MgYWN0aW9uYWJsZSBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IG1ha2VEb3dubG9hZGVyKG51bGwpLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpLFxuXHRcdFx0L25vIGBwcm9kdWN0XFwuYWdlbnRTZGtzXFwuY2xhdWRlYCBjb25maWd1cmVkLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2FkU2RrUm9vdDogdXJsVGVtcGxhdGUgd2l0aCB1bmtub3duIHBsYWNlaG9sZGVyIHRocm93cyBjb25maWcgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gdnNjb2RlLWRpc3RybyB0eXBvIGd1YXJkOiBge3Nka1RhcmV0fWAgbGVmdCB1bnRvdWNoZWQgYnkgZm9ybWF0MlxuXHRcdC8vIHdvdWxkIG90aGVyd2lzZSB5aWVsZCBhIDQwNCBmcm9tIHRoZSBDRE4gd2l0aCBubyBoaW50IGF0IHRoZVxuXHRcdC8vIHJlYWwgY2F1c2UuXG5cdFx0Y29uc3QgZG93bmxvYWRlciA9IG1ha2VEb3dubG9hZGVyKHtcblx0XHRcdHVybFRlbXBsYXRlOiBgaHR0cDovLzEyNy4wLjAuMToke3NlcnZlci5wb3J0fS9zZGste3Nka1RhcmV0fS50Z3pgLFxuXHRcdH0pO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKSxcblx0XHRcdC91bmtub3duIHBsYWNlaG9sZGVyIFxce3Nka1RhcmV0XFx9Lyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdENvdW50LCAwLCAnc2hvdWxkIGZhaWwgYmVmb3JlIGFueSBIVFRQIGNhbGwnKTtcblx0fSk7XG5cblx0dGVzdCgnbG9hZFNka1Jvb3Q6IGNhbmNlbCBiZWZvcmUgZG93bmxvYWQgY29tcGxldGVzIGNsZWFucyB1cCBzY3JhdGNoIGRpcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTVfMDAwKTtcblx0XHQvLyBSZXBsYWNlIHNlcnZlciB3aXRoIG9uZSB0aGF0IGhhbmdzIGZvcmV2ZXIuXG5cdFx0YXdhaXQgc2VydmVyLmNsb3NlKCk7XG5cdFx0Y29uc3QgaHR0cDogdHlwZW9mIGh0dHBUeXBlID0gYXdhaXQgaW1wb3J0KCdodHRwJyk7XG5cdFx0Y29uc3QgaGFuZ2luZ1NlcnZlciA9IGh0dHAuY3JlYXRlU2VydmVyKChfcmVxLCByZXMpID0+IHtcblx0XHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdjb250ZW50LWxlbmd0aCc6ICc5OTk5OTknIH0pO1xuXHRcdFx0cmVzLndyaXRlKEJ1ZmZlci5hbGxvYyg4KSk7XG5cdFx0XHQvLyBuZXZlciBlbmRcblx0XHR9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IGhhbmdpbmdTZXJ2ZXIubGlzdGVuKDAsICcxMjcuMC4wLjEnLCAoKSA9PiByKCkpKTtcblx0XHRjb25zdCBwb3J0ID0gKGhhbmdpbmdTZXJ2ZXIuYWRkcmVzcygpIGFzIHsgcG9ydDogbnVtYmVyIH0pLnBvcnQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRvd25sb2FkZXIgPSBtYWtlRG93bmxvYWRlcih7XG5cdFx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRcdHVybFRlbXBsYXRlOiBgaHR0cDovLzEyNy4wLjAuMToke3BvcnR9L3Nkay17c2RrVGFyZ2V0fS50Z3pgLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBjdHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdFx0Y29uc3QgcHJvbWlzZSA9IGRvd25sb2FkZXIubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgY3RzLnRva2VuKTtcblx0XHRcdC8vIEdpdmUgdGhlIHJlcXVlc3QgYSBtb21lbnQgdG8gc3RhcnQuXG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgNTApKTtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb21pc2UsIC9DYW5jZWx8Y2FuY2VsfEZhaWxlZCB0byBkb3dubG9hZC8pO1xuXHRcdFx0Ly8gTm8gaGFsZi1leHRyYWN0ZWQgZGlyIGxlZnQgYXJvdW5kLiBUaGUgc2NyYXRjaCBkaXIgbGFuZHMgYXRcblx0XHRcdC8vIDx1c2VyRGF0YVBhdGg+L2FnZW50LWhvc3Qvc2RrLWNhY2hlL2NsYXVkZS8xLjAuMC88dGFyZ2V0Pi50bXAuPHBpZD5cblx0XHRcdC8vIFx1MjAxNCBhIHNpYmxpbmcgb2YgdGhlIHJlc29sdmVkIHRhcmdldCBkaXIgdW5kZXIgdGhlIHZlcnNpb24gZGlyLlxuXHRcdFx0Y29uc3QgdmVyc2lvbkRpciA9IHBhdGguam9pbih1c2VyRGF0YVBhdGgsICdhZ2VudC1ob3N0JywgJ3Nkay1jYWNoZScsICdjbGF1ZGUnLCAnMS4wLjAnKTtcblx0XHRcdGNvbnN0IGxlZnRvdmVyID0gZnMuZXhpc3RzU3luYyh2ZXJzaW9uRGlyKVxuXHRcdFx0XHQ/IChhd2FpdCBmc3AucmVhZGRpcih2ZXJzaW9uRGlyKSkuZmlsdGVyKGYgPT4gZi5pbmNsdWRlcygnLnRtcC4nKSlcblx0XHRcdFx0OiBbXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGVmdG92ZXIsIFtdKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Ly8gRm9yY2UtY2xvc2UgYW55IHNvY2tldHMgdGhlIHRlc3QgbGVmdCBkYW5nbGluZyBcdTIwMTQgdGhlIGNhbmNlbCBwYXRoXG5cdFx0XHQvLyBvbmx5IHRlYXJzIGRvd24gT1VSIHN0cmVhbXMsIHRoZSB1bmRlcmx5aW5nIGh0dHAgY29ubmVjdGlvbiBvblxuXHRcdFx0Ly8gdGhlIHNlcnZlciBzaWRlIHN0YXlzIGFsaXZlIHVudGlsIHRoZSBPUyByZWFwcyBpdC4gV2l0aG91dCB0aGlzXG5cdFx0XHQvLyBgaGFuZ2luZ1NlcnZlci5jbG9zZSgpYCB3b3VsZCBoYW5nIHdhaXRpbmcgZm9yIHRoZSBzdGlsbC1vcGVuXG5cdFx0XHQvLyBjb25uZWN0aW9uLlxuXHRcdFx0aGFuZ2luZ1NlcnZlci5jbG9zZUFsbENvbm5lY3Rpb25zKCk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IGhhbmdpbmdTZXJ2ZXIuY2xvc2UoKCkgPT4gcigpKSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdsb2FkU2RrUm9vdDogY29uY3VycmVudCBjYWxscyBpbiBzYW1lIHByb2Nlc3Mgc2hhcmUgb25lIGRvd25sb2FkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRvd25sb2FkZXIgPSBtYWtlRG93bmxvYWRlcigpO1xuXHRcdGNvbnN0IFthLCBiLCBjXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGRvd25sb2FkZXIubG9hZFNka1Jvb3QoQ2xhdWRlU2RrUGFja2FnZSwgbmV3VG9rZW4oKSksXG5cdFx0XHRkb3dubG9hZGVyLmxvYWRTZGtSb290KENsYXVkZVNka1BhY2thZ2UsIG5ld1Rva2VuKCkpLFxuXHRcdFx0ZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKSxcblx0XHRdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYSwgYik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGIsIGMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdENvdW50LCAxLCAnY29uY3VycmVudCBsb2FkZXJzIG11c3QgZGVkdXBlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRTZGtSb290OiByZW5hbWUtbG9zZXIgcGF0aCByZXR1cm5zIGV4aXN0aW5nIGNhY2hlIHdoZW4gd2lubmVyIGFscmVhZHkgcHVibGlzaGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRvd25sb2FkZXIgPSBtYWtlRG93bmxvYWRlcigpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHBhdGguam9pbih1c2VyRGF0YVBhdGgsICdhZ2VudC1ob3N0JywgJ3Nkay1jYWNoZScsICdjbGF1ZGUnLCAnMS4wLjAnLCBob3N0U2RrVGFyZ2V0KTtcblxuXHRcdC8vIFByZS1wb3B1bGF0ZSB0aGUgY2FjaGUgYXMgaWYgYSBcIndpbm5lclwiIGFscmVhZHkgZXh0cmFjdGVkIGl0LlxuXHRcdGF3YWl0IGZzcC5ta2Rpcih0YXJnZXQsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzcC5ta2RpcihwYXRoLmRpcm5hbWUocGF0aC5qb2luKHRhcmdldCwgZml4dHVyZS5pbm5lckZpbGUpKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgZnNwLndyaXRlRmlsZShwYXRoLmpvaW4odGFyZ2V0LCBmaXh0dXJlLmlubmVyRmlsZSksIGZpeHR1cmUuaW5uZXJDb250ZW50cyk7XG5cdFx0YXdhaXQgZnNwLndyaXRlRmlsZShwYXRoLmpvaW4odGFyZ2V0LCAnLmNvbXBsZXRlJyksICcnKTtcblxuXHRcdC8vIGxvYWRTZGtSb290IHNob3VsZCBoaXQgdGhlIGNhY2hlIGZpcnN0IGFuZCBuZXZlciBpbnZva2UgdGhlIHNlcnZlci5cblx0XHRjb25zdCByb290ID0gYXdhaXQgZG93bmxvYWRlci5sb2FkU2RrUm9vdChDbGF1ZGVTZGtQYWNrYWdlLCBuZXdUb2tlbigpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdCwgdGFyZ2V0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RDb3VudCwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxRQUFRO0FBQ3BCLFlBQVksU0FBUztBQUVyQixZQUFZLFFBQVE7QUFDcEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFlBQVksVUFBVTtBQUN0QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG9CQUFvQix3QkFBK0U7QUFD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
