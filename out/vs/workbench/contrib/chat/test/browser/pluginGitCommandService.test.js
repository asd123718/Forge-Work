import assert from "assert";
import { bufferToStream, VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { InMemoryStorageService } from "../../../../../platform/storage/common/storage.js";
import { BrowserPluginGitCommandService } from "../../browser/pluginGitCommandService.js";
import { parseGitHubCloneUrl } from "../../browser/githubRepoFetcher.js";
suite("BrowserPluginGitCommandService", () => {
  const disposables = new DisposableStore();
  let fileService;
  let requestStub;
  let storage;
  let service;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    requestStub = new StubRequestService();
    storage = disposables.add(new InMemoryStorageService());
    service = new BrowserPluginGitCommandService(
      fileService,
      new NullLogService(),
      requestStub,
      storage,
      stubAuthenticationService()
    );
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  const targetDir = URI.from({ scheme: Schemas.inMemory, path: "/cache/github.com/octocat/hello" });
  suite("parseGitHubCloneUrl", () => {
    test("parses canonical github HTTPS clone URL", () => {
      assert.deepStrictEqual(parseGitHubCloneUrl("https://github.com/octocat/Hello-World.git"), { owner: "octocat", repo: "Hello-World" });
    });
    test("strips trailing slash and missing .git suffix", () => {
      assert.deepStrictEqual(parseGitHubCloneUrl("https://github.com/octocat/Hello-World/"), { owner: "octocat", repo: "Hello-World" });
      assert.deepStrictEqual(parseGitHubCloneUrl("https://github.com/octocat/Hello-World"), { owner: "octocat", repo: "Hello-World" });
      assert.deepStrictEqual(parseGitHubCloneUrl("https://github.com/octocat/Hello-World.git/"), { owner: "octocat", repo: "Hello-World" });
    });
    test("rejects URLs with extra path segments", () => {
      assert.strictEqual(parseGitHubCloneUrl("https://github.com/octocat/Hello-World/issues/42"), void 0);
      assert.strictEqual(parseGitHubCloneUrl("https://github.com/octocat/Hello-World/tree/main"), void 0);
    });
    test("rejects non-HTTPS, non-GitHub, and malformed URLs", () => {
      assert.strictEqual(parseGitHubCloneUrl("git@github.com:octocat/repo.git"), void 0);
      assert.strictEqual(parseGitHubCloneUrl("https://gitlab.com/octocat/repo.git"), void 0);
      assert.strictEqual(parseGitHubCloneUrl("https://github.com/octocat"), void 0);
      assert.strictEqual(parseGitHubCloneUrl("not-a-url"), void 0);
    });
  });
  suite("cloneRepository", () => {
    test("rejects non-GitHub clone URLs with an actionable message", async () => {
      await assert.rejects(
        () => service.cloneRepository("https://gitlab.com/foo/bar.git", targetDir),
        /can only be installed from GitHub HTTPS URLs/
      );
    });
    test("downloads tree + blobs and persists SHA metadata", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "deadbeef" }));
      queueRepoFetch(requestStub, "deadbeef", {
        "README.md": "hello\n",
        "src/index.js": "console.log(1);"
      });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      const readme = await fileService.readFile(URI.joinPath(targetDir, "README.md"));
      assert.strictEqual(readme.value.toString(), "hello\n");
      const index = await fileService.readFile(URI.joinPath(targetDir, "src/index.js"));
      assert.strictEqual(index.value.toString(), "console.log(1);");
      assert.strictEqual(await service.revParse(targetDir, "HEAD"), "deadbeef");
    });
    test("surfaces a sign-in message on 401 when auth is unavailable", async () => {
      requestStub.queue("GET", /\/commits\/main$/, plainResponse(401));
      await assert.rejects(
        () => service.cloneRepository("https://github.com/octocat/Private.git", targetDir, "main"),
        /Sign in to GitHub/
      );
    });
    test("surfaces a GitHubRateLimitError on 403 with X-RateLimit-Remaining: 0", async () => {
      requestStub.queue("GET", /\/commits\/main$/, plainResponse(403, VSBuffer.fromString("rate limit"), {
        "x-ratelimit-remaining": "0",
        "retry-after": "60"
      }));
      let captured;
      try {
        await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
        assert.fail("expected rejection");
      } catch (err) {
        captured = err;
      }
      assert.ok(captured instanceof Error && captured.name === "GitHubRateLimitError", `expected GitHubRateLimitError, got ${captured?.name}`);
    });
    test("requests GitHub auth and retries when GitHub returns 403", async () => {
      const state = { createSessionCalls: 0 };
      service = new BrowserPluginGitCommandService(
        fileService,
        new NullLogService(),
        requestStub,
        storage,
        stubAuthenticationService({ createdAccessToken: "repo-token", state })
      );
      requestStub.queue("GET", /\/commits\/main$/, plainResponse(403));
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      queueRepoFetch(requestStub, "sha1", { "private.txt": "secret" });
      await service.cloneRepository("https://github.com/octocat/Private.git", targetDir, "main");
      const file = await fileService.readFile(URI.joinPath(targetDir, "private.txt"));
      assert.strictEqual(file.value.toString(), "secret");
      assert.strictEqual(state.createSessionCalls, 1);
    });
    test("uses an existing signed-in GitHub session before falling back to anonymous requests", async () => {
      service = new BrowserPluginGitCommandService(
        fileService,
        new NullLogService(),
        requestStub,
        storage,
        stubAuthenticationService({ sessions: [createAuthenticationSession("signed-in-token")] })
      );
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      queueRepoFetch(requestStub, "sha1", { "auth.txt": "authed" });
      await service.cloneRepository("https://github.com/octocat/Private.git", targetDir, "main");
      assert.strictEqual(requestStub.requests[0].headers?.Authorization, "Bearer signed-in-token");
      assert.strictEqual(requestStub.requests[1].headers?.Authorization, "Bearer signed-in-token");
      assert.strictEqual(requestStub.requests[2].headers?.Authorization, "Bearer signed-in-token");
    });
    test("falls back to anonymous when the signed-in GitHub session is rejected", async () => {
      const state = { createSessionCalls: 0 };
      service = new BrowserPluginGitCommandService(
        fileService,
        new NullLogService(),
        requestStub,
        storage,
        stubAuthenticationService({ sessions: [createAuthenticationSession("sso-blocked-token")], state })
      );
      requestStub.queue("GET", /\/commits\/main$/, plainResponse(403));
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      queueRepoFetch(requestStub, "sha1", { "public.txt": "public" });
      await service.cloneRepository("https://github.com/octocat/Public.git", targetDir, "main");
      const file = await fileService.readFile(URI.joinPath(targetDir, "public.txt"));
      assert.strictEqual(file.value.toString(), "public");
      assert.strictEqual(requestStub.requests[0].headers?.Authorization, "Bearer sso-blocked-token");
      assert.strictEqual(requestStub.requests[1].headers?.Authorization, void 0);
      assert.strictEqual(requestStub.requests[2].headers?.Authorization, void 0);
      assert.strictEqual(state.createSessionCalls, 0);
    });
    test("failed extraction leaves the previous targetDir intact", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      queueRepoFetch(requestStub, "sha1", { "keep.txt": "preserved" });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha2" }));
      requestStub.queue("GET", /\/git\/trees\/sha2/, plainResponse(500, VSBuffer.fromString("boom")));
      await assert.rejects(() => service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main"));
      const keep = await fileService.readFile(URI.joinPath(targetDir, "keep.txt"));
      assert.strictEqual(keep.value.toString(), "preserved");
      assert.strictEqual(await service.revParse(targetDir, "HEAD"), "sha1");
    });
    test("skips symlink and submodule entries", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      requestStub.queue("GET", /\/git\/trees\/sha1/, jsonResponse(200, {
        sha: "sha1",
        truncated: false,
        tree: [
          { path: "README.md", mode: "100644", type: "blob", sha: "b-readme", size: 3 },
          { path: "link.txt", mode: "120000", type: "blob", sha: "b-link", size: 8 },
          { path: "subrepo", mode: "160000", type: "commit", sha: "b-sub" }
        ]
      }));
      requestStub.queue("GET", /\/git\/blobs\/b-readme$/, jsonResponse(200, { content: encodeBase64(new TextEncoder().encode("hi\n")), encoding: "base64" }));
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      assert.strictEqual((await fileService.readFile(URI.joinPath(targetDir, "README.md"))).value.toString(), "hi\n");
      assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, "link.txt")), false);
      assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, "subrepo")), false);
    });
  });
  suite("pull", () => {
    test("returns false when upstream SHA is unchanged", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      queueRepoFetch(requestStub, "sha1", { "a.txt": "a" });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      assert.strictEqual(await service.pull(targetDir), false);
    });
    test("re-downloads tree and returns true when SHA moves", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      queueRepoFetch(requestStub, "sha1", { "a.txt": "old" });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha2" }));
      queueRepoFetch(requestStub, "sha2", { "a.txt": "new" });
      assert.strictEqual(await service.pull(targetDir), true);
      const a = await fileService.readFile(URI.joinPath(targetDir, "a.txt"));
      assert.strictEqual(a.value.toString(), "new");
      assert.strictEqual(await service.revParse(targetDir, "HEAD"), "sha2");
    });
    test("throws when called for a target with no cached metadata", async () => {
      await assert.rejects(() => service.pull(targetDir), /no cached metadata/);
    });
    test("clears stale files from a prior extraction", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      queueRepoFetch(requestStub, "sha1", {
        "keep.txt": "k1",
        "removed.txt": "will be deleted"
      });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha2" }));
      queueRepoFetch(requestStub, "sha2", { "keep.txt": "k2" });
      assert.strictEqual(await service.pull(targetDir), true);
      assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, "removed.txt")), false);
      const keep = await fileService.readFile(URI.joinPath(targetDir, "keep.txt"));
      assert.strictEqual(keep.value.toString(), "k2");
    });
    test("rejects path-traversal entries in the tree", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      requestStub.queue("GET", /\/git\/trees\/sha1/, jsonResponse(200, {
        sha: "sha1",
        truncated: false,
        tree: [
          { path: "safe.txt", mode: "100644", type: "blob", sha: "b-safe", size: 4 },
          { path: "../escaped.txt", mode: "100644", type: "blob", sha: "b-escape", size: 4 }
        ]
      }));
      requestStub.queue("GET", /\/git\/blobs\/b-safe$/, jsonResponse(200, { content: encodeBase64(new TextEncoder().encode("safe")), encoding: "base64" }));
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      const safe = await fileService.readFile(URI.joinPath(targetDir, "safe.txt"));
      assert.strictEqual(safe.value.toString(), "safe");
      const escapedSibling = URI.from({ scheme: targetDir.scheme, path: "/cache/github.com/octocat/escaped.txt" });
      assert.strictEqual(await fileService.exists(escapedSibling), false);
    });
    test("rejects backslash-traversal entries (Windows path separator)", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "sha1" }));
      requestStub.queue("GET", /\/git\/trees\/sha1/, jsonResponse(200, {
        sha: "sha1",
        truncated: false,
        tree: [
          { path: "safe.txt", mode: "100644", type: "blob", sha: "b-safe", size: 4 },
          { path: "..\\..\\escaped.txt", mode: "100644", type: "blob", sha: "b-escape", size: 4 }
        ]
      }));
      requestStub.queue("GET", /\/git\/blobs\/b-safe$/, jsonResponse(200, { content: encodeBase64(new TextEncoder().encode("safe")), encoding: "base64" }));
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      const safe = await fileService.readFile(URI.joinPath(targetDir, "safe.txt"));
      assert.strictEqual(safe.value.toString(), "safe");
      assert.strictEqual(await fileService.exists(URI.joinPath(targetDir, "..\\..\\escaped.txt")), false);
    });
  });
  suite("checkout", () => {
    test("no-ops when the requested SHA matches the cached SHA", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "aabbccddeeff00112233445566778899aabbccdd" }));
      queueRepoFetch(requestStub, "aabbccddeeff00112233445566778899aabbccdd", { "a.txt": "a" });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      await service.checkout(targetDir, "aabbccddeeff00112233445566778899aabbccdd", true);
    });
    test("re-extracts when the SHA differs", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "1111111111111111111111111111111111111111" }));
      queueRepoFetch(requestStub, "1111111111111111111111111111111111111111", { "a.txt": "old" });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      queueRepoFetch(requestStub, "2222222222222222222222222222222222222222", { "a.txt": "new" });
      await service.checkout(targetDir, "2222222222222222222222222222222222222222", true);
      const a = await fileService.readFile(URI.joinPath(targetDir, "a.txt"));
      assert.strictEqual(a.value.toString(), "new");
      assert.strictEqual(await service.revParse(targetDir, "HEAD"), "2222222222222222222222222222222222222222");
    });
    test("throws when called for a target with no cached metadata", async () => {
      await assert.rejects(() => service.checkout(targetDir, "abc"), /no cached metadata/);
    });
  });
  suite("revParse", () => {
    test("throws when asked for an unrelated full SHA", async () => {
      requestStub.queue("GET", /\/commits\/main$/, jsonResponse(200, { sha: "aabbccddeeff00112233445566778899aabbccdd" }));
      queueRepoFetch(requestStub, "aabbccddeeff00112233445566778899aabbccdd", { "a.txt": "a" });
      await service.cloneRepository("https://github.com/octocat/Hello-World.git", targetDir, "main");
      assert.strictEqual(await service.revParse(targetDir, "aabbccddeeff00112233445566778899aabbccdd"), "aabbccddeeff00112233445566778899aabbccdd");
      await assert.rejects(() => service.revParse(targetDir, "1111111111111111111111111111111111111111"), /only HEAD/);
    });
  });
  test("fetch / fetchRepository / revListCount are inert", async () => {
    await service.fetch(targetDir);
    await service.fetchRepository(targetDir);
    assert.strictEqual(await service.revListCount(targetDir, "HEAD", "@{u}"), 0);
  });
});
class StubRequestService {
  constructor() {
    this._queue = [];
    this.requests = [];
  }
  queue(method, urlMatcher, response) {
    this._queue.push({ methodMatcher: method, urlMatcher, response });
  }
  async request(options, _token) {
    this.requests.push(options);
    const url = options.url ?? "";
    const method = options.type ?? "GET";
    const idx = this._queue.findIndex((q) => q.methodMatcher === method && q.urlMatcher.test(url));
    if (idx === -1) {
      throw new Error(`No queued response for ${method} ${url}`);
    }
    const [{ response }] = this._queue.splice(idx, 1);
    return response();
  }
}
function plainResponse(statusCode, body = VSBuffer.alloc(0), headers = {}) {
  return () => ({
    res: { statusCode, headers },
    stream: bufferToStream(body)
  });
}
function jsonResponse(statusCode, body) {
  return plainResponse(statusCode, VSBuffer.fromString(JSON.stringify(body)));
}
function queueRepoFetch(stub, sha, files) {
  const entries = Object.entries(files);
  const tree = entries.map(([path, content], i) => ({
    path,
    mode: "100644",
    type: "blob",
    sha: `b${i}`,
    size: content.length
  }));
  stub.queue("GET", new RegExp(`/git/trees/${escapeForRegExp(sha)}\\?recursive=1$`), jsonResponse(200, { sha, tree, truncated: false }));
  entries.forEach(([, content], i) => {
    stub.queue("GET", blobShaMatcher(tree[i].sha), jsonResponse(200, {
      content: encodeBase64(new TextEncoder().encode(content)),
      encoding: "base64"
    }));
  });
}
function blobShaMatcher(blobSha) {
  return new RegExp(`/git/blobs/${escapeForRegExp(blobSha)}$`);
}
function encodeBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function stubAuthenticationService(options = {}) {
  return {
    getSessions: async () => options.sessions ?? [],
    createSession: async () => {
      if (options.state) {
        options.state.createSessionCalls++;
      }
      if (!options.createdAccessToken) {
        throw new Error("No GitHub session available");
      }
      return { accessToken: options.createdAccessToken };
    }
  };
}
function createAuthenticationSession(accessToken, scopes = []) {
  return {
    id: accessToken,
    accessToken,
    account: { label: "octocat", id: "octocat" },
    scopes
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RDb250ZXh0LCBJUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3JlcXVlc3QvY29tbW9uL3JlcXVlc3QuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBBdXRoZW50aWNhdGlvblNlc3Npb24sIElBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wbHVnaW5HaXRDb21tYW5kU2VydmljZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUdpdEh1YkNsb25lVXJsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9naXRodWJSZXBvRmV0Y2hlci5qcyc7XG5cbnN1aXRlKCdCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCByZXF1ZXN0U3R1YjogU3R1YlJlcXVlc3RTZXJ2aWNlO1xuXHRsZXQgc3RvcmFnZTogSW5NZW1vcnlTdG9yYWdlU2VydmljZTtcblx0bGV0IHNlcnZpY2U6IEJyb3dzZXJQbHVnaW5HaXRDb21tYW5kU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdHJlcXVlc3RTdHViID0gbmV3IFN0dWJSZXF1ZXN0U2VydmljZSgpO1xuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VydmljZSA9IG5ldyBCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UoXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0cmVxdWVzdFN0dWIgYXMgdW5rbm93biBhcyBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0c3R1YkF1dGhlbnRpY2F0aW9uU2VydmljZSgpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB0YXJnZXREaXIgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9jYWNoZS9naXRodWIuY29tL29jdG9jYXQvaGVsbG8nIH0pO1xuXG5cdC8vIC0tLS0gcGFyc2VHaXRIdWJDbG9uZVVybCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdwYXJzZUdpdEh1YkNsb25lVXJsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBjYW5vbmljYWwgZ2l0aHViIEhUVFBTIGNsb25lIFVSTCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VHaXRIdWJDbG9uZVVybCgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQuZ2l0JyksIHsgb3duZXI6ICdvY3RvY2F0JywgcmVwbzogJ0hlbGxvLVdvcmxkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyB0cmFpbGluZyBzbGFzaCBhbmQgbWlzc2luZyAuZ2l0IHN1ZmZpeCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VHaXRIdWJDbG9uZVVybCgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQvJyksIHsgb3duZXI6ICdvY3RvY2F0JywgcmVwbzogJ0hlbGxvLVdvcmxkJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VHaXRIdWJDbG9uZVVybCgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQnKSwgeyBvd25lcjogJ29jdG9jYXQnLCByZXBvOiAnSGVsbG8tV29ybGQnIH0pO1xuXHRcdFx0Ly8gT3JkZXIgb2YgdHJpbSArIC5naXQgc3RyaXAgbWF0dGVyczogdHJhaWxpbmcgc2xhc2ggZmlyc3QsIHRoZW4gLmdpdFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUdpdEh1YkNsb25lVXJsKCdodHRwczovL2dpdGh1Yi5jb20vb2N0b2NhdC9IZWxsby1Xb3JsZC5naXQvJyksIHsgb3duZXI6ICdvY3RvY2F0JywgcmVwbzogJ0hlbGxvLVdvcmxkJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgVVJMcyB3aXRoIGV4dHJhIHBhdGggc2VnbWVudHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VHaXRIdWJDbG9uZVVybCgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQvaXNzdWVzLzQyJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VHaXRIdWJDbG9uZVVybCgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQvdHJlZS9tYWluJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIG5vbi1IVFRQUywgbm9uLUdpdEh1YiwgYW5kIG1hbGZvcm1lZCBVUkxzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlR2l0SHViQ2xvbmVVcmwoJ2dpdEBnaXRodWIuY29tOm9jdG9jYXQvcmVwby5naXQnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUdpdEh1YkNsb25lVXJsKCdodHRwczovL2dpdGxhYi5jb20vb2N0b2NhdC9yZXBvLmdpdCcpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlR2l0SHViQ2xvbmVVcmwoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0JyksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VHaXRIdWJDbG9uZVVybCgnbm90LWEtdXJsJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gY2xvbmVSZXBvc2l0b3J5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnY2xvbmVSZXBvc2l0b3J5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlamVjdHMgbm9uLUdpdEh1YiBjbG9uZSBVUkxzIHdpdGggYW4gYWN0aW9uYWJsZSBtZXNzYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UuY2xvbmVSZXBvc2l0b3J5KCdodHRwczovL2dpdGxhYi5jb20vZm9vL2Jhci5naXQnLCB0YXJnZXREaXIpLFxuXHRcdFx0XHQvY2FuIG9ubHkgYmUgaW5zdGFsbGVkIGZyb20gR2l0SHViIEhUVFBTIFVSTHMvLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rvd25sb2FkcyB0cmVlICsgYmxvYnMgYW5kIHBlcnNpc3RzIFNIQSBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywganNvblJlc3BvbnNlKDIwMCwgeyBzaGE6ICdkZWFkYmVlZicgfSkpO1xuXHRcdFx0cXVldWVSZXBvRmV0Y2gocmVxdWVzdFN0dWIsICdkZWFkYmVlZicsIHtcblx0XHRcdFx0J1JFQURNRS5tZCc6ICdoZWxsb1xcbicsXG5cdFx0XHRcdCdzcmMvaW5kZXguanMnOiAnY29uc29sZS5sb2coMSk7Jyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsb25lUmVwb3NpdG9yeSgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQuZ2l0JywgdGFyZ2V0RGlyLCAnbWFpbicpO1xuXG5cdFx0XHRjb25zdCByZWFkbWUgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgodGFyZ2V0RGlyLCAnUkVBRE1FLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWRtZS52YWx1ZS50b1N0cmluZygpLCAnaGVsbG9cXG4nKTtcblx0XHRcdGNvbnN0IGluZGV4ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ3NyYy9pbmRleC5qcycpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmRleC52YWx1ZS50b1N0cmluZygpLCAnY29uc29sZS5sb2coMSk7Jyk7XG5cblx0XHRcdC8vIHJldlBhcnNlIHNob3VsZCBub3cgYW5zd2VyIGZyb20gdGhlIHBlcnNpc3RlZCBtZXRhZGF0YS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLnJldlBhcnNlKHRhcmdldERpciwgJ0hFQUQnKSwgJ2RlYWRiZWVmJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdXJmYWNlcyBhIHNpZ24taW4gbWVzc2FnZSBvbiA0MDEgd2hlbiBhdXRoIGlzIHVuYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9jb21taXRzXFwvbWFpbiQvLCBwbGFpblJlc3BvbnNlKDQwMSkpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L1ByaXZhdGUuZ2l0JywgdGFyZ2V0RGlyLCAnbWFpbicpLFxuXHRcdFx0XHQvU2lnbiBpbiB0byBHaXRIdWIvLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1cmZhY2VzIGEgR2l0SHViUmF0ZUxpbWl0RXJyb3Igb24gNDAzIHdpdGggWC1SYXRlTGltaXQtUmVtYWluaW5nOiAwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9jb21taXRzXFwvbWFpbiQvLCBwbGFpblJlc3BvbnNlKDQwMywgVlNCdWZmZXIuZnJvbVN0cmluZygncmF0ZSBsaW1pdCcpLCB7XG5cdFx0XHRcdCd4LXJhdGVsaW1pdC1yZW1haW5pbmcnOiAnMCcsXG5cdFx0XHRcdCdyZXRyeS1hZnRlcic6ICc2MCcsXG5cdFx0XHR9KSk7XG5cblx0XHRcdGxldCBjYXB0dXJlZDogdW5rbm93bjtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHNlcnZpY2UuY2xvbmVSZXBvc2l0b3J5KCdodHRwczovL2dpdGh1Yi5jb20vb2N0b2NhdC9IZWxsby1Xb3JsZC5naXQnLCB0YXJnZXREaXIsICdtYWluJyk7XG5cdFx0XHRcdGFzc2VydC5mYWlsKCdleHBlY3RlZCByZWplY3Rpb24nKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjYXB0dXJlZCA9IGVycjtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5vayhjYXB0dXJlZCBpbnN0YW5jZW9mIEVycm9yICYmIGNhcHR1cmVkLm5hbWUgPT09ICdHaXRIdWJSYXRlTGltaXRFcnJvcicsIGBleHBlY3RlZCBHaXRIdWJSYXRlTGltaXRFcnJvciwgZ290ICR7KGNhcHR1cmVkIGFzIEVycm9yKT8ubmFtZX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcXVlc3RzIEdpdEh1YiBhdXRoIGFuZCByZXRyaWVzIHdoZW4gR2l0SHViIHJldHVybnMgNDAzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB7IGNyZWF0ZVNlc3Npb25DYWxsczogMCB9O1xuXHRcdFx0c2VydmljZSA9IG5ldyBCcm93c2VyUGx1Z2luR2l0Q29tbWFuZFNlcnZpY2UoXG5cdFx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0cmVxdWVzdFN0dWIgYXMgdW5rbm93biBhcyBJUmVxdWVzdFNlcnZpY2UsXG5cdFx0XHRcdHN0b3JhZ2UsXG5cdFx0XHRcdHN0dWJBdXRoZW50aWNhdGlvblNlcnZpY2UoeyBjcmVhdGVkQWNjZXNzVG9rZW46ICdyZXBvLXRva2VuJywgc3RhdGUgfSksXG5cdFx0XHQpO1xuXG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIHBsYWluUmVzcG9uc2UoNDAzKSk7XG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgc2hhOiAnc2hhMScgfSkpO1xuXHRcdFx0cXVldWVSZXBvRmV0Y2gocmVxdWVzdFN0dWIsICdzaGExJywgeyAncHJpdmF0ZS50eHQnOiAnc2VjcmV0JyB9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L1ByaXZhdGUuZ2l0JywgdGFyZ2V0RGlyLCAnbWFpbicpO1xuXG5cdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ3ByaXZhdGUudHh0JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGUudmFsdWUudG9TdHJpbmcoKSwgJ3NlY3JldCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmNyZWF0ZVNlc3Npb25DYWxscywgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIGFuIGV4aXN0aW5nIHNpZ25lZC1pbiBHaXRIdWIgc2Vzc2lvbiBiZWZvcmUgZmFsbGluZyBiYWNrIHRvIGFub255bW91cyByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNlcnZpY2UgPSBuZXcgQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlKFxuXHRcdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdHJlcXVlc3RTdHViIGFzIHVua25vd24gYXMgSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdFx0XHRzdG9yYWdlLFxuXHRcdFx0XHRzdHViQXV0aGVudGljYXRpb25TZXJ2aWNlKHsgc2Vzc2lvbnM6IFtjcmVhdGVBdXRoZW50aWNhdGlvblNlc3Npb24oJ3NpZ25lZC1pbi10b2tlbicpXSB9KSxcblx0XHRcdCk7XG5cblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywganNvblJlc3BvbnNlKDIwMCwgeyBzaGE6ICdzaGExJyB9KSk7XG5cdFx0XHRxdWV1ZVJlcG9GZXRjaChyZXF1ZXN0U3R1YiwgJ3NoYTEnLCB7ICdhdXRoLnR4dCc6ICdhdXRoZWQnIH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsb25lUmVwb3NpdG9yeSgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvUHJpdmF0ZS5naXQnLCB0YXJnZXREaXIsICdtYWluJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0U3R1Yi5yZXF1ZXN0c1swXS5oZWFkZXJzPy5BdXRob3JpemF0aW9uLCAnQmVhcmVyIHNpZ25lZC1pbi10b2tlbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RTdHViLnJlcXVlc3RzWzFdLmhlYWRlcnM/LkF1dGhvcml6YXRpb24sICdCZWFyZXIgc2lnbmVkLWluLXRva2VuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdFN0dWIucmVxdWVzdHNbMl0uaGVhZGVycz8uQXV0aG9yaXphdGlvbiwgJ0JlYXJlciBzaWduZWQtaW4tdG9rZW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYW5vbnltb3VzIHdoZW4gdGhlIHNpZ25lZC1pbiBHaXRIdWIgc2Vzc2lvbiBpcyByZWplY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0geyBjcmVhdGVTZXNzaW9uQ2FsbHM6IDAgfTtcblx0XHRcdHNlcnZpY2UgPSBuZXcgQnJvd3NlclBsdWdpbkdpdENvbW1hbmRTZXJ2aWNlKFxuXHRcdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdHJlcXVlc3RTdHViIGFzIHVua25vd24gYXMgSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdFx0XHRzdG9yYWdlLFxuXHRcdFx0XHRzdHViQXV0aGVudGljYXRpb25TZXJ2aWNlKHsgc2Vzc2lvbnM6IFtjcmVhdGVBdXRoZW50aWNhdGlvblNlc3Npb24oJ3Nzby1ibG9ja2VkLXRva2VuJyldLCBzdGF0ZSB9KSxcblx0XHRcdCk7XG5cblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywgcGxhaW5SZXNwb25zZSg0MDMpKTtcblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywganNvblJlc3BvbnNlKDIwMCwgeyBzaGE6ICdzaGExJyB9KSk7XG5cdFx0XHRxdWV1ZVJlcG9GZXRjaChyZXF1ZXN0U3R1YiwgJ3NoYTEnLCB7ICdwdWJsaWMudHh0JzogJ3B1YmxpYycgfSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xvbmVSZXBvc2l0b3J5KCdodHRwczovL2dpdGh1Yi5jb20vb2N0b2NhdC9QdWJsaWMuZ2l0JywgdGFyZ2V0RGlyLCAnbWFpbicpO1xuXG5cdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ3B1YmxpYy50eHQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZS52YWx1ZS50b1N0cmluZygpLCAncHVibGljJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdFN0dWIucmVxdWVzdHNbMF0uaGVhZGVycz8uQXV0aG9yaXphdGlvbiwgJ0JlYXJlciBzc28tYmxvY2tlZC10b2tlbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3RTdHViLnJlcXVlc3RzWzFdLmhlYWRlcnM/LkF1dGhvcml6YXRpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdFN0dWIucmVxdWVzdHNbMl0uaGVhZGVycz8uQXV0aG9yaXphdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jcmVhdGVTZXNzaW9uQ2FsbHMsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFpbGVkIGV4dHJhY3Rpb24gbGVhdmVzIHRoZSBwcmV2aW91cyB0YXJnZXREaXIgaW50YWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRmlyc3QgaW5zdGFsbDogc3VjY2VlZHMuXG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgc2hhOiAnc2hhMScgfSkpO1xuXHRcdFx0cXVldWVSZXBvRmV0Y2gocmVxdWVzdFN0dWIsICdzaGExJywgeyAna2VlcC50eHQnOiAncHJlc2VydmVkJyB9KTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xvbmVSZXBvc2l0b3J5KCdodHRwczovL2dpdGh1Yi5jb20vb2N0b2NhdC9IZWxsby1Xb3JsZC5naXQnLCB0YXJnZXREaXIsICdtYWluJyk7XG5cblx0XHRcdC8vIFNlY29uZCBpbnN0YWxsOiB0cmVlIGZldGNoIHJldHVybnMgNTAwIC0+IGFib3J0cyBiZWZvcmUgdG91Y2hpbmcgdGhlIHN0YWdlZCBkaXIuXG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgc2hhOiAnc2hhMicgfSkpO1xuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9naXRcXC90cmVlc1xcL3NoYTIvLCBwbGFpblJlc3BvbnNlKDUwMCwgVlNCdWZmZXIuZnJvbVN0cmluZygnYm9vbScpKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UuY2xvbmVSZXBvc2l0b3J5KCdodHRwczovL2dpdGh1Yi5jb20vb2N0b2NhdC9IZWxsby1Xb3JsZC5naXQnLCB0YXJnZXREaXIsICdtYWluJykpO1xuXG5cdFx0XHQvLyBPcmlnaW5hbCB0cmVlIHN0aWxsIHJlYWRhYmxlOyBjYWNoZSBzdGlsbCByZXBvcnRzIG9sZCBTSEEuXG5cdFx0XHRjb25zdCBrZWVwID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ2tlZXAudHh0JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGtlZXAudmFsdWUudG9TdHJpbmcoKSwgJ3ByZXNlcnZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UucmV2UGFyc2UodGFyZ2V0RGlyLCAnSEVBRCcpLCAnc2hhMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgc3ltbGluayBhbmQgc3VibW9kdWxlIGVudHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgc2hhOiAnc2hhMScgfSkpO1xuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9naXRcXC90cmVlc1xcL3NoYTEvLCBqc29uUmVzcG9uc2UoMjAwLCB7XG5cdFx0XHRcdHNoYTogJ3NoYTEnLFxuXHRcdFx0XHR0cnVuY2F0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR0cmVlOiBbXG5cdFx0XHRcdFx0eyBwYXRoOiAnUkVBRE1FLm1kJywgbW9kZTogJzEwMDY0NCcsIHR5cGU6ICdibG9iJywgc2hhOiAnYi1yZWFkbWUnLCBzaXplOiAzIH0sXG5cdFx0XHRcdFx0eyBwYXRoOiAnbGluay50eHQnLCBtb2RlOiAnMTIwMDAwJywgdHlwZTogJ2Jsb2InLCBzaGE6ICdiLWxpbmsnLCBzaXplOiA4IH0sXG5cdFx0XHRcdFx0eyBwYXRoOiAnc3VicmVwbycsIG1vZGU6ICcxNjAwMDAnLCB0eXBlOiAnY29tbWl0Jywgc2hhOiAnYi1zdWInIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2dpdFxcL2Jsb2JzXFwvYi1yZWFkbWUkLywganNvblJlc3BvbnNlKDIwMCwgeyBjb250ZW50OiBlbmNvZGVCYXNlNjQobmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdoaVxcbicpKSwgZW5jb2Rpbmc6ICdiYXNlNjQnIH0pKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L0hlbGxvLVdvcmxkLmdpdCcsIHRhcmdldERpciwgJ21haW4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgodGFyZ2V0RGlyLCAnUkVBRE1FLm1kJykpKS52YWx1ZS50b1N0cmluZygpLCAnaGlcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ2xpbmsudHh0JykpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5qb2luUGF0aCh0YXJnZXREaXIsICdzdWJyZXBvJykpLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gcHVsbCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgncHVsbCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gdXBzdHJlYW0gU0hBIGlzIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywganNvblJlc3BvbnNlKDIwMCwgeyBzaGE6ICdzaGExJyB9KSk7XG5cdFx0XHRxdWV1ZVJlcG9GZXRjaChyZXF1ZXN0U3R1YiwgJ3NoYTEnLCB7ICdhLnR4dCc6ICdhJyB9KTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuY2xvbmVSZXBvc2l0b3J5KCdodHRwczovL2dpdGh1Yi5jb20vb2N0b2NhdC9IZWxsby1Xb3JsZC5naXQnLCB0YXJnZXREaXIsICdtYWluJyk7XG5cblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywganNvblJlc3BvbnNlKDIwMCwgeyBzaGE6ICdzaGExJyB9KSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLnB1bGwodGFyZ2V0RGlyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtZG93bmxvYWRzIHRyZWUgYW5kIHJldHVybnMgdHJ1ZSB3aGVuIFNIQSBtb3ZlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywganNvblJlc3BvbnNlKDIwMCwgeyBzaGE6ICdzaGExJyB9KSk7XG5cdFx0XHRxdWV1ZVJlcG9GZXRjaChyZXF1ZXN0U3R1YiwgJ3NoYTEnLCB7ICdhLnR4dCc6ICdvbGQnIH0pO1xuXHRcdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L0hlbGxvLVdvcmxkLmdpdCcsIHRhcmdldERpciwgJ21haW4nKTtcblxuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9jb21taXRzXFwvbWFpbiQvLCBqc29uUmVzcG9uc2UoMjAwLCB7IHNoYTogJ3NoYTInIH0pKTtcblx0XHRcdHF1ZXVlUmVwb0ZldGNoKHJlcXVlc3RTdHViLCAnc2hhMicsIHsgJ2EudHh0JzogJ25ldycgfSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLnB1bGwodGFyZ2V0RGlyKSwgdHJ1ZSk7XG5cdFx0XHRjb25zdCBhID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ2EudHh0JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudmFsdWUudG9TdHJpbmcoKSwgJ25ldycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UucmV2UGFyc2UodGFyZ2V0RGlyLCAnSEVBRCcpLCAnc2hhMicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gY2FsbGVkIGZvciBhIHRhcmdldCB3aXRoIG5vIGNhY2hlZCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UucHVsbCh0YXJnZXREaXIpLCAvbm8gY2FjaGVkIG1ldGFkYXRhLyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGVhcnMgc3RhbGUgZmlsZXMgZnJvbSBhIHByaW9yIGV4dHJhY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgc2hhOiAnc2hhMScgfSkpO1xuXHRcdFx0cXVldWVSZXBvRmV0Y2gocmVxdWVzdFN0dWIsICdzaGExJywge1xuXHRcdFx0XHQna2VlcC50eHQnOiAnazEnLFxuXHRcdFx0XHQncmVtb3ZlZC50eHQnOiAnd2lsbCBiZSBkZWxldGVkJyxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L0hlbGxvLVdvcmxkLmdpdCcsIHRhcmdldERpciwgJ21haW4nKTtcblxuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9jb21taXRzXFwvbWFpbiQvLCBqc29uUmVzcG9uc2UoMjAwLCB7IHNoYTogJ3NoYTInIH0pKTtcblx0XHRcdHF1ZXVlUmVwb0ZldGNoKHJlcXVlc3RTdHViLCAnc2hhMicsIHsgJ2tlZXAudHh0JzogJ2syJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLnB1bGwodGFyZ2V0RGlyKSwgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ3JlbW92ZWQudHh0JykpLCBmYWxzZSk7XG5cdFx0XHRjb25zdCBrZWVwID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHRhcmdldERpciwgJ2tlZXAudHh0JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGtlZXAudmFsdWUudG9TdHJpbmcoKSwgJ2syJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHBhdGgtdHJhdmVyc2FsIGVudHJpZXMgaW4gdGhlIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgc2hhOiAnc2hhMScgfSkpO1xuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9naXRcXC90cmVlc1xcL3NoYTEvLCBqc29uUmVzcG9uc2UoMjAwLCB7XG5cdFx0XHRcdHNoYTogJ3NoYTEnLFxuXHRcdFx0XHR0cnVuY2F0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR0cmVlOiBbXG5cdFx0XHRcdFx0eyBwYXRoOiAnc2FmZS50eHQnLCBtb2RlOiAnMTAwNjQ0JywgdHlwZTogJ2Jsb2InLCBzaGE6ICdiLXNhZmUnLCBzaXplOiA0IH0sXG5cdFx0XHRcdFx0eyBwYXRoOiAnLi4vZXNjYXBlZC50eHQnLCBtb2RlOiAnMTAwNjQ0JywgdHlwZTogJ2Jsb2InLCBzaGE6ICdiLWVzY2FwZScsIHNpemU6IDQgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pKTtcblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvZ2l0XFwvYmxvYnNcXC9iLXNhZmUkLywganNvblJlc3BvbnNlKDIwMCwgeyBjb250ZW50OiBlbmNvZGVCYXNlNjQobmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdzYWZlJykpLCBlbmNvZGluZzogJ2Jhc2U2NCcgfSkpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsb25lUmVwb3NpdG9yeSgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQuZ2l0JywgdGFyZ2V0RGlyLCAnbWFpbicpO1xuXG5cdFx0XHQvLyBzYWZlIGVudHJ5IHdyaXR0ZW47IGVzY2FwZWQgZW50cnkgd2FzIHJlamVjdGVkIGFuZCBuZXZlciB3cml0dGVuXG5cdFx0XHQvLyB0byBhIHNpYmxpbmcgb2YgYHRhcmdldERpcmAgKG9yIGFueXdoZXJlIG91dHNpZGUgaXQpLlxuXHRcdFx0Y29uc3Qgc2FmZSA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aCh0YXJnZXREaXIsICdzYWZlLnR4dCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlLnZhbHVlLnRvU3RyaW5nKCksICdzYWZlJyk7XG5cdFx0XHRjb25zdCBlc2NhcGVkU2libGluZyA9IFVSSS5mcm9tKHsgc2NoZW1lOiB0YXJnZXREaXIuc2NoZW1lLCBwYXRoOiAnL2NhY2hlL2dpdGh1Yi5jb20vb2N0b2NhdC9lc2NhcGVkLnR4dCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKGVzY2FwZWRTaWJsaW5nKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBiYWNrc2xhc2gtdHJhdmVyc2FsIGVudHJpZXMgKFdpbmRvd3MgcGF0aCBzZXBhcmF0b3IpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9jb21taXRzXFwvbWFpbiQvLCBqc29uUmVzcG9uc2UoMjAwLCB7IHNoYTogJ3NoYTEnIH0pKTtcblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvZ2l0XFwvdHJlZXNcXC9zaGExLywganNvblJlc3BvbnNlKDIwMCwge1xuXHRcdFx0XHRzaGE6ICdzaGExJyxcblx0XHRcdFx0dHJ1bmNhdGVkOiBmYWxzZSxcblx0XHRcdFx0dHJlZTogW1xuXHRcdFx0XHRcdHsgcGF0aDogJ3NhZmUudHh0JywgbW9kZTogJzEwMDY0NCcsIHR5cGU6ICdibG9iJywgc2hhOiAnYi1zYWZlJywgc2l6ZTogNCB9LFxuXHRcdFx0XHRcdHsgcGF0aDogJy4uXFxcXC4uXFxcXGVzY2FwZWQudHh0JywgbW9kZTogJzEwMDY0NCcsIHR5cGU6ICdibG9iJywgc2hhOiAnYi1lc2NhcGUnLCBzaXplOiA0IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2dpdFxcL2Jsb2JzXFwvYi1zYWZlJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgY29udGVudDogZW5jb2RlQmFzZTY0KG5ldyBUZXh0RW5jb2RlcigpLmVuY29kZSgnc2FmZScpKSwgZW5jb2Rpbmc6ICdiYXNlNjQnIH0pKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L0hlbGxvLVdvcmxkLmdpdCcsIHRhcmdldERpciwgJ21haW4nKTtcblxuXHRcdFx0Y29uc3Qgc2FmZSA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aCh0YXJnZXREaXIsICdzYWZlLnR4dCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYWZlLnZhbHVlLnRvU3RyaW5nKCksICdzYWZlJyk7XG5cdFx0XHQvLyBUaGUgbWFsaWNpb3VzIGVudHJ5IHNob3VsZCBub3QgaGF2ZSBiZWVuIHdyaXR0ZW4gdW5kZXIgYW55XG5cdFx0XHQvLyByZWFzb25hYmxlIGludGVycHJldGF0aW9uIG9mIGl0cyBwYXRoLlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhVUkkuam9pblBhdGgodGFyZ2V0RGlyLCAnLi5cXFxcLi5cXFxcZXNjYXBlZC50eHQnKSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBjaGVja291dCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjaGVja291dCcsICgpID0+IHtcblx0XHR0ZXN0KCduby1vcHMgd2hlbiB0aGUgcmVxdWVzdGVkIFNIQSBtYXRjaGVzIHRoZSBjYWNoZWQgU0hBJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cmVxdWVzdFN0dWIucXVldWUoJ0dFVCcsIC9cXC9jb21taXRzXFwvbWFpbiQvLCBqc29uUmVzcG9uc2UoMjAwLCB7IHNoYTogJ2FhYmJjY2RkZWVmZjAwMTEyMjMzNDQ1NTY2Nzc4ODk5YWFiYmNjZGQnIH0pKTtcblx0XHRcdHF1ZXVlUmVwb0ZldGNoKHJlcXVlc3RTdHViLCAnYWFiYmNjZGRlZWZmMDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZCcsIHsgJ2EudHh0JzogJ2EnIH0pO1xuXHRcdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L0hlbGxvLVdvcmxkLmdpdCcsIHRhcmdldERpciwgJ21haW4nKTtcblxuXHRcdFx0Ly8gTm8gYWRkaXRpb25hbCBxdWV1ZWQgcmVzcG9uc2VzIFx1MjAxNCBjaGVja291dCB0byB0aGUgc2FtZSBTSEEgbXVzdFxuXHRcdFx0Ly8gbm90IGlzc3VlIGFueSBIVFRQIGNhbGxzLlxuXHRcdFx0YXdhaXQgc2VydmljZS5jaGVja291dCh0YXJnZXREaXIsICdhYWJiY2NkZGVlZmYwMDExMjIzMzQ0NTU2Njc3ODg5OWFhYmJjY2RkJywgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZS1leHRyYWN0cyB3aGVuIHRoZSBTSEEgZGlmZmVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdHJlcXVlc3RTdHViLnF1ZXVlKCdHRVQnLCAvXFwvY29tbWl0c1xcL21haW4kLywganNvblJlc3BvbnNlKDIwMCwgeyBzaGE6ICcxMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExJyB9KSk7XG5cdFx0XHRxdWV1ZVJlcG9GZXRjaChyZXF1ZXN0U3R1YiwgJzExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTEnLCB7ICdhLnR4dCc6ICdvbGQnIH0pO1xuXHRcdFx0YXdhaXQgc2VydmljZS5jbG9uZVJlcG9zaXRvcnkoJ2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvY2F0L0hlbGxvLVdvcmxkLmdpdCcsIHRhcmdldERpciwgJ21haW4nKTtcblxuXHRcdFx0cXVldWVSZXBvRmV0Y2gocmVxdWVzdFN0dWIsICcyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyJywgeyAnYS50eHQnOiAnbmV3JyB9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jaGVja291dCh0YXJnZXREaXIsICcyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyJywgdHJ1ZSk7XG5cblx0XHRcdGNvbnN0IGEgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgodGFyZ2V0RGlyLCAnYS50eHQnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS52YWx1ZS50b1N0cmluZygpLCAnbmV3Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXZQYXJzZSh0YXJnZXREaXIsICdIRUFEJyksICcyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJvd3Mgd2hlbiBjYWxsZWQgZm9yIGEgdGFyZ2V0IHdpdGggbm8gY2FjaGVkIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5jaGVja291dCh0YXJnZXREaXIsICdhYmMnKSwgL25vIGNhY2hlZCBtZXRhZGF0YS8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHJldlBhcnNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3JldlBhcnNlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIGFza2VkIGZvciBhbiB1bnJlbGF0ZWQgZnVsbCBTSEEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXF1ZXN0U3R1Yi5xdWV1ZSgnR0VUJywgL1xcL2NvbW1pdHNcXC9tYWluJC8sIGpzb25SZXNwb25zZSgyMDAsIHsgc2hhOiAnYWFiYmNjZGRlZWZmMDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZCcgfSkpO1xuXHRcdFx0cXVldWVSZXBvRmV0Y2gocmVxdWVzdFN0dWIsICdhYWJiY2NkZGVlZmYwMDExMjIzMzQ0NTU2Njc3ODg5OWFhYmJjY2RkJywgeyAnYS50eHQnOiAnYScgfSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNsb25lUmVwb3NpdG9yeSgnaHR0cHM6Ly9naXRodWIuY29tL29jdG9jYXQvSGVsbG8tV29ybGQuZ2l0JywgdGFyZ2V0RGlyLCAnbWFpbicpO1xuXG5cdFx0XHQvLyBRdWVyeWluZyB0aGUgY2FjaGVkIFNIQSBzdGlsbCB3b3Jrc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UucmV2UGFyc2UodGFyZ2V0RGlyLCAnYWFiYmNjZGRlZWZmMDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZCcpLCAnYWFiYmNjZGRlZWZmMDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZCcpO1xuXHRcdFx0Ly8gUXVlcnlpbmcgYW4gdW5yZWxhdGVkIFNIQSBtdXN0IG5vdCBzaWxlbnRseSBsaWVcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UucmV2UGFyc2UodGFyZ2V0RGlyLCAnMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMScpLCAvb25seSBIRUFELyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gbm9vcCBvcHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdmZXRjaCAvIGZldGNoUmVwb3NpdG9yeSAvIHJldkxpc3RDb3VudCBhcmUgaW5lcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VydmljZS5mZXRjaCh0YXJnZXREaXIpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmV0Y2hSZXBvc2l0b3J5KHRhcmdldERpcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UucmV2TGlzdENvdW50KHRhcmdldERpciwgJ0hFQUQnLCAnQHt1fScpLCAwKTtcblx0fSk7XG59KTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUZXN0IGhlbHBlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgUXVldWVkUmVzcG9uc2Uge1xuXHRyZWFkb25seSBtZXRob2RNYXRjaGVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVybE1hdGNoZXI6IFJlZ0V4cDtcblx0cmVhZG9ubHkgcmVzcG9uc2U6ICgpID0+IElSZXF1ZXN0Q29udGV4dDtcbn1cblxuY2xhc3MgU3R1YlJlcXVlc3RTZXJ2aWNlIGltcGxlbWVudHMgUGFydGlhbDxJUmVxdWVzdFNlcnZpY2U+IHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcXVldWU6IFF1ZXVlZFJlc3BvbnNlW10gPSBbXTtcblx0cmVhZG9ubHkgcmVxdWVzdHM6IElSZXF1ZXN0T3B0aW9uc1tdID0gW107XG5cblx0cXVldWUobWV0aG9kOiBzdHJpbmcsIHVybE1hdGNoZXI6IFJlZ0V4cCwgcmVzcG9uc2U6ICgpID0+IElSZXF1ZXN0Q29udGV4dCk6IHZvaWQge1xuXHRcdHRoaXMuX3F1ZXVlLnB1c2goeyBtZXRob2RNYXRjaGVyOiBtZXRob2QsIHVybE1hdGNoZXIsIHJlc3BvbnNlIH0pO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdChvcHRpb25zOiBJUmVxdWVzdE9wdGlvbnMsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElSZXF1ZXN0Q29udGV4dD4ge1xuXHRcdHRoaXMucmVxdWVzdHMucHVzaChvcHRpb25zKTtcblx0XHRjb25zdCB1cmwgPSBvcHRpb25zLnVybCA/PyAnJztcblx0XHRjb25zdCBtZXRob2QgPSBvcHRpb25zLnR5cGUgPz8gJ0dFVCc7XG5cdFx0Y29uc3QgaWR4ID0gdGhpcy5fcXVldWUuZmluZEluZGV4KHEgPT4gcS5tZXRob2RNYXRjaGVyID09PSBtZXRob2QgJiYgcS51cmxNYXRjaGVyLnRlc3QodXJsKSk7XG5cdFx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gcXVldWVkIHJlc3BvbnNlIGZvciAke21ldGhvZH0gJHt1cmx9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IFt7IHJlc3BvbnNlIH1dID0gdGhpcy5fcXVldWUuc3BsaWNlKGlkeCwgMSk7XG5cdFx0cmV0dXJuIHJlc3BvbnNlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcGxhaW5SZXNwb25zZShzdGF0dXNDb2RlOiBudW1iZXIsIGJvZHk6IFZTQnVmZmVyID0gVlNCdWZmZXIuYWxsb2MoMCksIGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fSk6ICgpID0+IElSZXF1ZXN0Q29udGV4dCB7XG5cdHJldHVybiAoKSA9PiAoe1xuXHRcdHJlczogeyBzdGF0dXNDb2RlLCBoZWFkZXJzIH0sXG5cdFx0c3RyZWFtOiBidWZmZXJUb1N0cmVhbShib2R5KSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGpzb25SZXNwb25zZShzdGF0dXNDb2RlOiBudW1iZXIsIGJvZHk6IHVua25vd24pOiAoKSA9PiBJUmVxdWVzdENvbnRleHQge1xuXHRyZXR1cm4gcGxhaW5SZXNwb25zZShzdGF0dXNDb2RlLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGJvZHkpKSk7XG59XG5cbi8qKlxuICogUXVldWUgc3R1YiByZXNwb25zZXMgcmVwcmVzZW50aW5nIGEgcmVjdXJzaXZlIEdpdCBUcmVlcyBmZXRjaCBmb2xsb3dlZFxuICogYnkgcGVyLWJsb2IgYGdpdC9ibG9icy97c2hhfWAgZG93bmxvYWRzIGZvciB0aGUgZ2l2ZW4gY29tbWl0IFNIQSBhbmRcbiAqIGZpbGUgbWFwLiBUaGUgb3JkZXIgb2YgYGZpbGVzYCBkb2VzIG5vdCBtYXR0ZXI7IHRoZSByZXF1ZXN0IHN0dWIgcGlja3NcbiAqIHRoZSBmaXJzdCByZWdleCB0aGF0IG1hdGNoZXMgZWFjaCBvdXRnb2luZyBVUkwuXG4gKi9cbmZ1bmN0aW9uIHF1ZXVlUmVwb0ZldGNoKHN0dWI6IFN0dWJSZXF1ZXN0U2VydmljZSwgc2hhOiBzdHJpbmcsIGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogdm9pZCB7XG5cdGNvbnN0IGVudHJpZXMgPSBPYmplY3QuZW50cmllcyhmaWxlcyk7XG5cdGNvbnN0IHRyZWUgPSBlbnRyaWVzLm1hcCgoW3BhdGgsIGNvbnRlbnRdLCBpKSA9PiAoe1xuXHRcdHBhdGgsXG5cdFx0bW9kZTogJzEwMDY0NCcsXG5cdFx0dHlwZTogJ2Jsb2InIGFzIGNvbnN0LFxuXHRcdHNoYTogYGIke2l9YCxcblx0XHRzaXplOiBjb250ZW50Lmxlbmd0aCxcblx0fSkpO1xuXHRzdHViLnF1ZXVlKCdHRVQnLCBuZXcgUmVnRXhwKGAvZ2l0L3RyZWVzLyR7ZXNjYXBlRm9yUmVnRXhwKHNoYSl9XFxcXD9yZWN1cnNpdmU9MSRgKSwganNvblJlc3BvbnNlKDIwMCwgeyBzaGEsIHRyZWUsIHRydW5jYXRlZDogZmFsc2UgfSkpO1xuXHRlbnRyaWVzLmZvckVhY2goKFssIGNvbnRlbnRdLCBpKSA9PiB7XG5cdFx0c3R1Yi5xdWV1ZSgnR0VUJywgYmxvYlNoYU1hdGNoZXIodHJlZVtpXS5zaGEpLCBqc29uUmVzcG9uc2UoMjAwLCB7XG5cdFx0XHRjb250ZW50OiBlbmNvZGVCYXNlNjQobmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGNvbnRlbnQpKSxcblx0XHRcdGVuY29kaW5nOiAnYmFzZTY0Jyxcblx0XHR9KSk7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBibG9iU2hhTWF0Y2hlcihibG9iU2hhOiBzdHJpbmcpOiBSZWdFeHAge1xuXHRyZXR1cm4gbmV3IFJlZ0V4cChgL2dpdC9ibG9icy8ke2VzY2FwZUZvclJlZ0V4cChibG9iU2hhKX0kYCk7XG59XG5cbmZ1bmN0aW9uIGVuY29kZUJhc2U2NChieXRlczogVWludDhBcnJheSk6IHN0cmluZyB7XG5cdGxldCBiaW5hcnkgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkrKykge1xuXHRcdGJpbmFyeSArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldKTtcblx0fVxuXHRyZXR1cm4gYnRvYShiaW5hcnkpO1xufVxuXG5mdW5jdGlvbiBlc2NhcGVGb3JSZWdFeHAodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpO1xufVxuXG5pbnRlcmZhY2UgSVN0dWJBdXRoZW50aWNhdGlvblNlcnZpY2VPcHRpb25zIHtcblx0cmVhZG9ubHkgc2Vzc2lvbnM/OiByZWFkb25seSBBdXRoZW50aWNhdGlvblNlc3Npb25bXTtcblx0cmVhZG9ubHkgY3JlYXRlZEFjY2Vzc1Rva2VuPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdGF0ZT86IHsgY3JlYXRlU2Vzc2lvbkNhbGxzOiBudW1iZXIgfTtcbn1cblxuZnVuY3Rpb24gc3R1YkF1dGhlbnRpY2F0aW9uU2VydmljZShvcHRpb25zOiBJU3R1YkF1dGhlbnRpY2F0aW9uU2VydmljZU9wdGlvbnMgPSB7fSk6IElBdXRoZW50aWNhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4ge1xuXHRcdGdldFNlc3Npb25zOiBhc3luYyAoKSA9PiBvcHRpb25zLnNlc3Npb25zID8/IFtdLFxuXHRcdGNyZWF0ZVNlc3Npb246IGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChvcHRpb25zLnN0YXRlKSB7XG5cdFx0XHRcdG9wdGlvbnMuc3RhdGUuY3JlYXRlU2Vzc2lvbkNhbGxzKys7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW9wdGlvbnMuY3JlYXRlZEFjY2Vzc1Rva2VuKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gR2l0SHViIHNlc3Npb24gYXZhaWxhYmxlJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBhY2Nlc3NUb2tlbjogb3B0aW9ucy5jcmVhdGVkQWNjZXNzVG9rZW4gfTtcblx0XHR9LFxuXHR9IGFzIHVua25vd24gYXMgSUF1dGhlbnRpY2F0aW9uU2VydmljZTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQXV0aGVudGljYXRpb25TZXNzaW9uKGFjY2Vzc1Rva2VuOiBzdHJpbmcsIHNjb3BlczogcmVhZG9ubHkgc3RyaW5nW10gPSBbXSk6IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IGFjY2Vzc1Rva2VuLFxuXHRcdGFjY2Vzc1Rva2VuLFxuXHRcdGFjY291bnQ6IHsgbGFiZWw6ICdvY3RvY2F0JywgaWQ6ICdvY3RvY2F0JyB9LFxuXHRcdHNjb3Blcyxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLGdCQUFnQixnQkFBZ0I7QUFDekMsU0FBUyx1QkFBdUI7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
