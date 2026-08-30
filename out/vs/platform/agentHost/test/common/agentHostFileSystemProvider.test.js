import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileChangeType, FileSystemProviderErrorCode, FileType, toFileSystemProviderErrorCode } from "../../../files/common/files.js";
import { AgentHostFileSystemProvider, agentHostRemotePath, agentHostUri } from "../../common/agentHostFileSystemProvider.js";
import { remoteAgentHostSessionTypeId } from "../../common/agentHostSessionType.js";
import { AGENT_HOST_LABEL_FORMATTER, AGENT_HOST_SCHEME, agentHostAuthority, fromAgentHostUri, toAgentHostUri } from "../../common/agentHostUri.js";
import { ContentEncoding, ResourceType } from "../../common/state/protocol/commands.js";
import { AhpErrorCodes } from "../../common/state/protocol/errors.js";
import { ProtocolError } from "../../common/state/sessionProtocol.js";
import { ROOT_STATE_URI } from "../../common/state/sessionState.js";
suite("AgentHostFileSystemProvider - URI helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("agentHostUri builds correct URI", () => {
    const uri = agentHostUri("localhost", "/home/user/project");
    assert.strictEqual(uri.scheme, AGENT_HOST_SCHEME);
    assert.strictEqual(uri.authority, "localhost");
    assert.ok(uri.path.includes("/home/user/project"));
  });
  test("agentHostRemotePath extracts the original path", () => {
    const uri = agentHostUri("host", "/some/path");
    assert.strictEqual(agentHostRemotePath(uri), "/some/path");
  });
  test("agentHostRemotePath round-trips with agentHostUri", () => {
    const original = "/home/user/project";
    const uri = agentHostUri("host", original);
    assert.strictEqual(agentHostRemotePath(uri), original);
  });
});
suite("AgentHostAuthority - encoding", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("purely alphanumeric address is returned as-is", () => {
    assert.strictEqual(agentHostAuthority("localhost"), "localhost");
  });
  test("normal host:port address uses human-readable encoding", () => {
    assert.strictEqual(agentHostAuthority("localhost:8081"), "localhost__8081");
    assert.strictEqual(agentHostAuthority("192.168.1.1:8080"), "192.168.1.1__8080");
    assert.strictEqual(agentHostAuthority("my-host:9090"), "my-host__9090");
    assert.strictEqual(agentHostAuthority("host.name:80"), "host.name__80");
  });
  test("address with underscore falls through to base64", () => {
    const authority = agentHostAuthority("host_name:8080");
    assert.ok(authority.startsWith("b64-"), `expected base64 for underscore address, got: ${authority}`);
  });
  test("address with exotic characters is base64-encoded", () => {
    assert.ok(agentHostAuthority("user@host:8080").startsWith("b64-"));
    assert.ok(agentHostAuthority("host with spaces").startsWith("b64-"));
    assert.ok(agentHostAuthority("http://myhost:3000").startsWith("b64-"));
  });
  test("ws:// prefix is normalized so authority matches bare address", () => {
    assert.strictEqual(agentHostAuthority("ws://127.0.0.1:8080"), agentHostAuthority("127.0.0.1:8080"));
    assert.strictEqual(agentHostAuthority("ws://localhost:9090"), agentHostAuthority("localhost:9090"));
  });
  test("remote local address does not collide with the ambient authority", () => {
    const authority = agentHostAuthority("local");
    const wrapped = toAgentHostUri(URI.file("/remote/file.txt"), authority);
    assert.deepStrictEqual({
      authority,
      normalizedAuthority: agentHostAuthority("ws://local"),
      similarAddressAuthority: agentHostAuthority("remote_local"),
      wrappedScheme: wrapped.scheme,
      wrappedAuthority: wrapped.authority
    }, {
      authority: "remote_local",
      normalizedAuthority: "remote_local",
      similarAddressAuthority: "b64-cmVtb3RlX2xvY2Fs",
      wrappedScheme: AGENT_HOST_SCHEME,
      wrappedAuthority: "remote_local"
    });
  });
  test("different addresses produce different authorities", () => {
    const cases = ["localhost:8080", "localhost:8081", "192.168.1.1:8080", "host-name:80", "host.name:80", "host_name:80", "user@host:8080"];
    const results = cases.map(agentHostAuthority);
    const unique = new Set(results);
    assert.strictEqual(unique.size, cases.length, "all authorities must be unique");
  });
  test("authority is valid in a URI authority position", () => {
    const addresses = ["localhost", "localhost:8081", "user@host:8080", "host with spaces", "192.168.1.1:9090"];
    for (const address of addresses) {
      const authority = agentHostAuthority(address);
      const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority, path: "/test" });
      assert.strictEqual(uri.authority, authority, `authority for '${address}' must round-trip through URI`);
    }
  });
  test("authority is valid in a URI scheme position", () => {
    const addresses = ["localhost", "localhost:8081", "user@host:8080", "host with spaces"];
    for (const address of addresses) {
      const authority = agentHostAuthority(address);
      const scheme = remoteAgentHostSessionTypeId(authority, "copilot");
      const uri = URI.from({ scheme, path: "/test" });
      assert.strictEqual(uri.scheme, scheme, `scheme for '${address}' must round-trip through URI`);
    }
  });
});
suite("toAgentHostUri / fromAgentHostUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("round-trips a file URI", () => {
    const original = URI.file("/home/user/project/file.ts");
    const wrapped = toAgentHostUri(original, "my-server");
    assert.strictEqual(wrapped.scheme, AGENT_HOST_SCHEME);
    assert.strictEqual(wrapped.authority, "my-server");
    const unwrapped = fromAgentHostUri(wrapped);
    assert.strictEqual(unwrapped.scheme, "file");
    assert.strictEqual(unwrapped.path, original.path);
  });
  test("round-trips a URI with authority", () => {
    const original = URI.from({ scheme: "agenthost-content", authority: "session1", path: "/snap/before" });
    const wrapped = toAgentHostUri(original, "remote-host");
    const unwrapped = fromAgentHostUri(wrapped);
    assert.strictEqual(unwrapped.scheme, "agenthost-content");
    assert.strictEqual(unwrapped.authority, "session1");
    assert.strictEqual(unwrapped.path, "/snap/before");
  });
  test("round-trips query and fragment for synthetic content URIs", () => {
    const original = URI.from({
      scheme: "git-blob",
      path: "/src/app.ts",
      query: JSON.stringify({ sessionUri: "copilot:/abc", sha: "cafe1234" }),
      fragment: "L1"
    });
    const wrapped = toAgentHostUri(original, "remote-host");
    const unwrapped = fromAgentHostUri(wrapped);
    assert.deepStrictEqual({
      wrappedPath: wrapped.path,
      wrappedFragment: wrapped.fragment,
      unwrapped: unwrapped.toString()
    }, {
      wrappedPath: original.path,
      wrappedFragment: original.fragment,
      unwrapped: original.toString()
    });
  });
  test("local authority returns original URI unchanged", () => {
    const original = URI.file("/workspace/test.ts");
    const result = toAgentHostUri(original, "local");
    assert.strictEqual(result.toString(), original.toString());
  });
  test("agentHostUri for root path produces valid encoded URI", () => {
    const authority = agentHostAuthority("localhost:8089");
    const uri = agentHostUri(authority, "/");
    assert.strictEqual(uri.scheme, AGENT_HOST_SCHEME);
    assert.strictEqual(uri.authority, authority);
    assert.strictEqual(fromAgentHostUri(uri).path, "/");
  });
  test("fromAgentHostUri falls back to a file URI when metadata is missing", () => {
    const uri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: "host", path: "/file" });
    const result = fromAgentHostUri(uri);
    assert.strictEqual(result.scheme, "file");
    assert.strictEqual(result.path, "/file");
  });
});
suite("AGENT_HOST_LABEL_FORMATTER", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("label is the original path verbatim for file URIs", () => {
    const authority = agentHostAuthority("localhost:8089");
    const originalPath = "/Users/roblou/code/vscode";
    const encodedUri = agentHostUri(authority, originalPath);
    assert.strictEqual(AGENT_HOST_LABEL_FORMATTER.formatting.label, "${path}");
    assert.strictEqual(encodedUri.path, originalPath);
  });
  test("label is the original path verbatim for URIs with authority", () => {
    const originalUri = URI.from({ scheme: "agenthost-content", authority: "myhost", path: "/snap/before" });
    const encodedUri = toAgentHostUri(originalUri, "remote-host");
    assert.strictEqual(encodedUri.path, "/snap/before");
  });
  test("label is the original path verbatim for git-blob URIs", () => {
    const originalUri = URI.from({
      scheme: "git-blob",
      path: "/src/app.ts",
      query: JSON.stringify({ sessionUri: "copilot:/abc", sha: "cafe1234" })
    });
    const encodedUri = toAgentHostUri(originalUri, "remote-host");
    assert.strictEqual(encodedUri.path, "/src/app.ts");
  });
});
suite("AgentHostFileSystemProvider - authority registrations", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class NamedConnection {
    constructor(name) {
      this.name = name;
      this.listCalls = [];
    }
    async resourceList(uri) {
      this.listCalls.push(uri);
      return { entries: [{ name: `${this.name}.txt`, type: "file" }] };
    }
    async resourceRead() {
      return { data: "", encoding: ContentEncoding.Utf8 };
    }
    async resourceWrite() {
      return {};
    }
    async resourceCopy() {
      return {};
    }
    async resourceDelete() {
      return {};
    }
    async resourceMove() {
      return {};
    }
    async resourceResolve(params) {
      const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
      return { uri: uri.toString(), type: ResourceType.File };
    }
    async resourceMkdir() {
      return {};
    }
  }
  test("disposing a stale registration does not remove a newer registration for the same authority", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const first = new NamedConnection("first");
    const second = new NamedConnection("second");
    const firstRegistration = disposables.add(provider.registerAuthority("client", first));
    disposables.add(provider.registerAuthority("client", second));
    firstRegistration.dispose();
    const entries = await provider.readdir(agentHostUri("client", "/workspace"));
    assert.deepStrictEqual({ entries, firstCalls: first.listCalls, secondCalls: second.listCalls.map((uri) => uri.toString()) }, {
      entries: [["second.txt", FileType.File]],
      firstCalls: [],
      secondCalls: [URI.file("/workspace").toString()]
    });
  });
  test("disposing the newest registration falls back to the previous one without entering grace", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const first = new NamedConnection("first");
    const second = new NamedConnection("second");
    disposables.add(provider.registerAuthority("client", first));
    const secondRegistration = provider.registerAuthority("client", second);
    secondRegistration.dispose();
    const entries = await provider.readdir(agentHostUri("client", "/workspace"));
    assert.deepStrictEqual({ entries, firstCalls: first.listCalls.map((uri) => uri.toString()), secondCalls: second.listCalls }, {
      entries: [["first.txt", FileType.File]],
      firstCalls: [URI.file("/workspace").toString()],
      secondCalls: []
    });
  });
  test("operation issued during reconnect window waits for the replacement registration", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(50));
    const first = new NamedConnection("first");
    const second = new NamedConnection("second");
    const firstRegistration = provider.registerAuthority("client", first);
    firstRegistration.dispose();
    const pending = provider.readdir(agentHostUri("client", "/workspace"));
    disposables.add(provider.registerAuthority("client", second));
    const entries = await pending;
    assert.deepStrictEqual({ entries, firstCalls: first.listCalls, secondCalls: second.listCalls.map((uri) => uri.toString()) }, {
      entries: [["second.txt", FileType.File]],
      firstCalls: [],
      secondCalls: [URI.file("/workspace").toString()]
    });
  });
  test("operation issued in the grace window rejects with Unavailable when no reconnect arrives", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(20));
    const first = new NamedConnection("first");
    const firstRegistration = provider.registerAuthority("client", first);
    firstRegistration.dispose();
    const pending = provider.readdir(agentHostUri("client", "/workspace"));
    let caught;
    try {
      await pending;
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error, "expected an error");
    assert.strictEqual(toFileSystemProviderErrorCode(caught), FileSystemProviderErrorCode.Unavailable);
  });
  test("operation rejects immediately when no authority was ever registered", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(50));
    let caught;
    try {
      await provider.readdir(agentHostUri("never", "/workspace"));
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error, "expected an error");
    assert.strictEqual(toFileSystemProviderErrorCode(caught), FileSystemProviderErrorCode.Unavailable);
  });
});
suite("AgentHostFileSystemProvider - synthetic content schemes", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class StubConnection {
    constructor() {
      this.readCalls = [];
      this.listCalls = [];
      this.resolveCalls = [];
      this.readResult = { data: "stub-content", encoding: ContentEncoding.Utf8, contentType: "text/plain" };
    }
    async resourceRead(uri) {
      this.readCalls.push(uri);
      return this.readResult;
    }
    async resourceList(uri) {
      this.listCalls.push(uri);
      return { entries: [] };
    }
    async resourceWrite() {
      return {};
    }
    async resourceCopy() {
      return {};
    }
    async resourceDelete() {
      return {};
    }
    async resourceMove() {
      return {};
    }
    async resourceResolve(params) {
      this.resolveCalls.push(params);
      const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
      return { uri: uri.toString(), type: ResourceType.File };
    }
    async resourceMkdir() {
      return {};
    }
  }
  function setup() {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new StubConnection();
    disposables.add(provider.registerAuthority("local", connection));
    return { provider, connection };
  }
  test("stat returns File for git-blob: URIs without listing the parent", async () => {
    const { provider, connection } = setup();
    const inner = URI.from({ scheme: "git-blob", authority: "sess1", path: "/sha/encoded/file.ts" });
    const wrapped = toAgentHostUri(inner, "local");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.File);
    assert.deepStrictEqual(connection.listCalls, [], "stat must not list a synthetic parent directory");
  });
  test("stat returns File for session-db: URIs (parity with git-blob)", async () => {
    const { provider, connection } = setup();
    const inner = URI.from({ scheme: "session-db", authority: "sess1", path: "/snap/some-blob" });
    const wrapped = toAgentHostUri(inner, "local");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.File);
    assert.deepStrictEqual(connection.listCalls, []);
  });
  test("stat uses resourceResolve for ordinary file: URIs", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new StubConnection();
    disposables.add(provider.registerAuthority("remote", connection));
    const wrapped = agentHostUri("remote", "/some/file.ts");
    await provider.stat(wrapped);
    assert.strictEqual(connection.resolveCalls.length, 1);
    assert.strictEqual(connection.listCalls.length, 0);
  });
  test("readFile passes the decoded synthetic URI through to the connection", async () => {
    const { provider, connection } = setup();
    const inner = URI.from({ scheme: "git-blob", authority: "sess1", path: "/sha/encoded/file.ts" });
    const wrapped = toAgentHostUri(inner, "local");
    const bytes = await provider.readFile(wrapped);
    assert.strictEqual(VSBuffer.wrap(bytes).toString(), "stub-content");
    assert.deepStrictEqual(connection.readCalls.map((u) => u.toString()), [inner.toString()]);
  });
  test("full stat-then-read round-trip mirrors the diff editor flow", async () => {
    const { provider } = setup();
    const inner = URI.from({ scheme: "git-blob", authority: "sess1", path: "/sha/encoded/file.ts" });
    const wrapped = toAgentHostUri(inner, "local");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.File);
    const bytes = await provider.readFile(wrapped);
    assert.strictEqual(VSBuffer.wrap(bytes).toString(), "stub-content");
  });
});
suite("AgentHostFileSystemProvider - permission errors and requestResourceAccess", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class ConfigurableConnection {
    constructor() {
      this.requestCalls = [];
      this.hasResourceRequest = true;
      // Defined as a property so we can `delete` it to simulate a connection
      // without resourceRequest support (e.g. older protocol clients).
      this.resourceRequest = async (params) => {
        this.requestCalls.push(params);
        if (this.requestError) {
          throw this.requestError;
        }
        return {};
      };
    }
    async resourceRead() {
      if (this.readError) {
        throw this.readError;
      }
      return { data: "", encoding: ContentEncoding.Utf8 };
    }
    async resourceList() {
      if (this.listError) {
        throw this.listError;
      }
      return { entries: [] };
    }
    async resourceWrite() {
      if (this.writeError) {
        throw this.writeError;
      }
      return {};
    }
    async resourceCopy() {
      if (this.copyError) {
        throw this.copyError;
      }
      return {};
    }
    async resourceDelete() {
      if (this.deleteError) {
        throw this.deleteError;
      }
      return {};
    }
    async resourceMove() {
      if (this.moveError) {
        throw this.moveError;
      }
      return {};
    }
    async resourceResolve(params) {
      if (this.resolveError) {
        throw this.resolveError;
      }
      const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
      return { uri: uri.toString(), type: ResourceType.File };
    }
    async resourceMkdir() {
      if (this.mkdirError) {
        throw this.mkdirError;
      }
      return {};
    }
  }
  function setup(opts = {}) {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new ConfigurableConnection();
    if (opts.withResourceRequest === false) {
      connection.hasResourceRequest = false;
      delete connection.resourceRequest;
    }
    disposables.add(provider.registerAuthority("remote", connection));
    return { provider, connection };
  }
  function permissionDenied(uri) {
    return new ProtocolError(AhpErrorCodes.PermissionDenied, "denied", { request: { uri, read: true } });
  }
  test("readFile maps PermissionDenied to NoPermissions (not FileNotFound)", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/secret");
    connection.readError = permissionDenied(wrapped.toString());
    try {
      await provider.readFile(wrapped);
      assert.fail("expected readFile to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.NoPermissions
      );
    }
  });
  test("readFile still maps generic errors to FileNotFound", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/missing");
    connection.readError = new Error("boom");
    try {
      await provider.readFile(wrapped);
      assert.fail("expected readFile to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.FileNotFound
      );
    }
  });
  test("writeFile / delete / rename / readdir all surface NoPermissions on PermissionDenied", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/no-write");
    const denied = permissionDenied(wrapped.toString());
    connection.writeError = denied;
    connection.deleteError = denied;
    connection.moveError = denied;
    connection.listError = denied;
    const codes = [];
    const collect = async (op) => {
      try {
        await op();
      } catch (err) {
        codes.push(toFileSystemProviderErrorCode(err instanceof Error ? err : void 0));
      }
    };
    await collect(() => provider.writeFile(wrapped, new Uint8Array(), { create: true, overwrite: true, unlock: false, atomic: false }));
    await collect(() => provider.delete(wrapped, { recursive: false, useTrash: false, atomic: false }));
    await collect(() => provider.rename(wrapped, agentHostUri("remote", "/dst"), { overwrite: true }));
    await collect(() => provider.readdir(wrapped));
    assert.deepStrictEqual(codes, [
      FileSystemProviderErrorCode.NoPermissions,
      FileSystemProviderErrorCode.NoPermissions,
      FileSystemProviderErrorCode.NoPermissions,
      FileSystemProviderErrorCode.NoPermissions
    ]);
  });
  test("requestResourceAccess forwards the decoded URI and access flags", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/etc/foo");
    await provider.requestResourceAccess(wrapped, { read: true, write: true });
    assert.deepStrictEqual(connection.requestCalls, [
      { channel: ROOT_STATE_URI, uri: URI.file("/etc/foo").toString(), read: true, write: true }
    ]);
  });
  test("requestResourceAccess throws Unavailable when the connection has no resourceRequest", async () => {
    const { provider } = setup({ withResourceRequest: false });
    const wrapped = agentHostUri("remote", "/etc/foo");
    try {
      await provider.requestResourceAccess(wrapped, { read: true });
      assert.fail("expected requestResourceAccess to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.Unavailable
      );
    }
  });
  test("requestResourceAccess maps PermissionDenied to NoPermissions", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/etc/foo");
    connection.requestError = permissionDenied(wrapped.toString());
    try {
      await provider.requestResourceAccess(wrapped, { read: true });
      assert.fail("expected requestResourceAccess to reject");
    } catch (err) {
      assert.strictEqual(
        toFileSystemProviderErrorCode(err instanceof Error ? err : void 0),
        FileSystemProviderErrorCode.NoPermissions
      );
    }
  });
});
suite("AgentHostFileSystemProvider - resolve / mkdir / copy / watch", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  class FullConnection {
    constructor() {
      this.resolveCalls = [];
      this.mkdirCalls = [];
      this.copyCalls = [];
      this.watchCalls = [];
      this.nextResolveResult = { uri: "", type: ResourceType.File, size: 42, mtime: "2026-01-15T12:34:56.789Z", etag: "etag-1" };
    }
    async resourceRead() {
      return { data: "", encoding: ContentEncoding.Utf8 };
    }
    async resourceList() {
      return { entries: [] };
    }
    async resourceWrite() {
      return {};
    }
    async resourceDelete() {
      return {};
    }
    async resourceMove() {
      return {};
    }
    async resourceCopy(params) {
      this.copyCalls.push(params);
      return {};
    }
    async resourceResolve(params) {
      this.resolveCalls.push(params);
      return { ...this.nextResolveResult, uri: typeof params.uri === "string" ? params.uri : URI.revive(params.uri).toString() };
    }
    async resourceMkdir(params) {
      this.mkdirCalls.push(params);
      return {};
    }
    async watchResource(params) {
      this.watchCalls.push(params);
      if (this.watchError) {
        throw this.watchError;
      }
      if (!this.nextWatchHandle) {
        throw new Error("test forgot to set nextWatchHandle");
      }
      return this.nextWatchHandle;
    }
  }
  function setup() {
    const provider = disposables.add(new AgentHostFileSystemProvider());
    const connection = new FullConnection();
    disposables.add(provider.registerAuthority("remote", connection));
    return { provider, connection };
  }
  test("stat uses resourceResolve when available and maps size/mtime/type", async () => {
    const { provider, connection } = setup();
    connection.nextResolveResult = { uri: "", type: ResourceType.Directory, size: 0, mtime: "2026-01-15T00:00:00.000Z" };
    const wrapped = agentHostUri("remote", "/some/dir");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.type, FileType.Directory);
    assert.strictEqual(stat.mtime, Date.parse("2026-01-15T00:00:00.000Z"));
    assert.strictEqual(connection.resolveCalls.length, 1, "resourceResolve was called");
  });
  test("stat does not mark resolved files readonly so they remain editable", async () => {
    const { provider, connection } = setup();
    connection.nextResolveResult = { uri: "", type: ResourceType.File, size: 10, mtime: "2026-01-15T00:00:00.000Z" };
    const wrapped = agentHostUri("remote", "/some/file.ts");
    const stat = await provider.stat(wrapped);
    assert.strictEqual(stat.permissions ?? 0, 0, "resolved files must not carry the Readonly permission");
  });
  test("realpath re-encodes the connection canonical URI back into provider space", async () => {
    const { provider, connection } = setup();
    connection.resourceResolve = async (params) => {
      connection.resolveCalls.push(params);
      return { uri: "file:///real/target.ts", type: ResourceType.File };
    };
    const wrapped = agentHostUri("remote", "/link/source.ts");
    const real = await provider.realpath(wrapped);
    assert.strictEqual(real, agentHostUri("remote", "/real/target.ts").path);
    assert.strictEqual(connection.resolveCalls.length, 1);
  });
  test("mkdir delegates to resourceMkdir", async () => {
    const { provider, connection } = setup();
    const wrapped = agentHostUri("remote", "/new/dir");
    await provider.mkdir(wrapped);
    assert.strictEqual(connection.mkdirCalls.length, 1);
    assert.strictEqual(connection.mkdirCalls[0].uri, fromAgentHostUri(wrapped).toString());
  });
  test("copy delegates to resourceCopy with overwrite mapped to !failIfExists", async () => {
    const { provider, connection } = setup();
    const from = agentHostUri("remote", "/a");
    const to = agentHostUri("remote", "/b");
    await provider.copy(from, to, { overwrite: false });
    assert.strictEqual(connection.copyCalls.length, 1);
    assert.strictEqual(connection.copyCalls[0].source, fromAgentHostUri(from).toString());
    assert.strictEqual(connection.copyCalls[0].destination, fromAgentHostUri(to).toString());
    assert.strictEqual(connection.copyCalls[0].failIfExists, true);
  });
  test("watch starts watchResource, forwards changes to onDidChangeFile, dispose tears down handle", async () => {
    const { provider, connection } = setup();
    const onDidChange = new Emitter();
    let handleDisposed = false;
    connection.nextWatchHandle = {
      onDidChange: onDidChange.event,
      dispose: () => {
        handleDisposed = true;
        onDidChange.dispose();
      }
    };
    const wrapped = agentHostUri("remote", "/watched");
    const received = [];
    const sub = provider.onDidChangeFile((c) => received.push([...c]));
    const watchDisposable = provider.watch(wrapped, { recursive: true, excludes: ["**/node_modules/**"] });
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.strictEqual(connection.watchCalls.length, 1);
    assert.strictEqual(connection.watchCalls[0].recursive, true);
    assert.deepStrictEqual(connection.watchCalls[0].excludes, { items: ["**/node_modules/**"] });
    const incomingChange = { resource: URI.parse("file:///watched/a.txt"), type: FileChangeType.UPDATED };
    const expectedChange = { resource: toAgentHostUri(URI.parse("file:///watched/a.txt"), "remote"), type: FileChangeType.UPDATED };
    onDidChange.fire([incomingChange]);
    assert.deepStrictEqual(received, [[expectedChange]]);
    watchDisposable.dispose();
    assert.strictEqual(handleDisposed, true, "underlying handle should be disposed when wrapper is disposed");
    sub.dispose();
  });
  test("watch forwards includes patterns to watchResource", async () => {
    const { provider, connection } = setup();
    const onDidChange = new Emitter();
    connection.nextWatchHandle = {
      onDidChange: onDidChange.event,
      dispose: () => onDidChange.dispose()
    };
    const wrapped = agentHostUri("remote", "/watched");
    const watchDisposable = provider.watch(wrapped, {
      recursive: false,
      excludes: [],
      includes: ["**/*.ts", { base: "/watched", pattern: "**/*.md" }]
    });
    await new Promise((resolve) => queueMicrotask(resolve));
    assert.deepStrictEqual(connection.watchCalls[0].includes, { items: ["**/*.ts", "**/*.md"] });
    watchDisposable.dispose();
  });
  test("watch setup failures are surfaced on onDidWatchError", async () => {
    const { provider, connection } = setup();
    connection.watchError = new Error("watch setup failed");
    const wrapped = agentHostUri("remote", "/watched");
    const errors = [];
    const sub = provider.onDidWatchError((message) => errors.push(message));
    const watchDisposable = provider.watch(wrapped, { recursive: false, excludes: [] });
    await timeout(0);
    assert.deepStrictEqual(errors, ["watch setup failed"]);
    watchDisposable.dispose();
    sub.dispose();
  });
  test("watch disposed before async setup completes still tears down the handle", async () => {
    const { provider, connection } = setup();
    const onDidChange = new Emitter();
    let handleDisposed = false;
    let handleCreated = false;
    connection.nextWatchHandle = {
      onDidChange: onDidChange.event,
      dispose: () => {
        handleDisposed = true;
        onDidChange.dispose();
      }
    };
    const originalWatchResource = connection.watchResource.bind(connection);
    connection.watchResource = async (params) => {
      handleCreated = true;
      await timeout(0);
      return originalWatchResource(params);
    };
    const wrapped = agentHostUri("remote", "/watched");
    const watchDisposable = provider.watch(wrapped, { recursive: false, excludes: [] });
    await timeout(0);
    assert.strictEqual(handleCreated, true);
    watchDisposable.dispose();
    await timeout(0);
    await timeout(0);
    assert.strictEqual(handleDisposed, true);
  });
  test("watch reattaches to the next connection registered for the authority after disconnect", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(20));
    const first = new FullConnection();
    const firstChanges = new Emitter();
    let firstHandleDisposed = false;
    first.nextWatchHandle = {
      onDidChange: firstChanges.event,
      dispose: () => {
        firstHandleDisposed = true;
        firstChanges.dispose();
      }
    };
    const firstReg = provider.registerAuthority("remote", first);
    const wrapped = agentHostUri("remote", "/watched");
    const received = [];
    disposables.add(provider.onDidChangeFile((c) => received.push([...c])));
    disposables.add(provider.watch(wrapped, { recursive: false, excludes: [] }));
    await timeout(0);
    await timeout(0);
    firstChanges.fire([{ resource: URI.file("/watched/a.txt"), type: FileChangeType.UPDATED }]);
    firstReg.dispose();
    const second = new FullConnection();
    const secondChanges = new Emitter();
    let secondHandleDisposed = false;
    second.nextWatchHandle = {
      onDidChange: secondChanges.event,
      dispose: () => {
        secondHandleDisposed = true;
        secondChanges.dispose();
      }
    };
    disposables.add(provider.registerAuthority("remote", second));
    await timeout(0);
    await timeout(0);
    secondChanges.fire([{ resource: URI.file("/watched/b.txt"), type: FileChangeType.ADDED }]);
    assert.deepStrictEqual({
      firstWatchCalls: first.watchCalls.length,
      secondWatchCalls: second.watchCalls.length,
      firstHandleDisposed,
      secondHandleDisposed,
      received: received.map((batch) => batch.map((c) => [c.resource.toString(), c.type]))
    }, {
      firstWatchCalls: 1,
      secondWatchCalls: 1,
      firstHandleDisposed: true,
      secondHandleDisposed: false,
      received: [
        [[agentHostUri("remote", "/watched/a.txt").toString(), FileChangeType.UPDATED]],
        [[agentHostUri("remote", "/watched/b.txt").toString(), FileChangeType.ADDED]]
      ]
    });
  });
  test("watch attaches to a freshly-registered authority that did not exist when watch() was called", async () => {
    const provider = disposables.add(new AgentHostFileSystemProvider(20));
    const wrapped = agentHostUri("never-registered", "/path");
    const received = [];
    disposables.add(provider.onDidChangeFile((c) => received.push([...c])));
    disposables.add(provider.watch(wrapped, { recursive: false, excludes: [] }));
    await new Promise((r) => setTimeout(r, 40));
    const connection = new FullConnection();
    const changes = new Emitter();
    connection.nextWatchHandle = {
      onDidChange: changes.event,
      dispose: () => changes.dispose()
    };
    disposables.add(provider.registerAuthority("never-registered", connection));
    await timeout(0);
    await timeout(0);
    changes.fire([{ resource: URI.file("/path/late.txt"), type: FileChangeType.ADDED }]);
    assert.strictEqual(connection.watchCalls.length, 1, "watch attached after late registration");
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0][0].resource.toString(), agentHostUri("never-registered", "/path/late.txt").toString());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZVR5cGUsIEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSwgRmlsZVR5cGUsIElGaWxlQ2hhbmdlLCB0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIsIGFnZW50SG9zdFJlbW90ZVBhdGgsIGFnZW50SG9zdFVyaSwgdHlwZSBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IHJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlSWQgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2Vzc2lvblR5cGUuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9MQUJFTF9GT1JNQVRURVIsIEFHRU5UX0hPU1RfU0NIRU1FLCBhZ2VudEhvc3RBdXRob3JpdHksIGZyb21BZ2VudEhvc3RVcmksIHRvQWdlbnRIb3N0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBDb250ZW50RW5jb2RpbmcsIFJlc291cmNlVHlwZSwgdHlwZSBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zLCB0eXBlIFJlc291cmNlQ29weVBhcmFtcywgdHlwZSBSZXNvdXJjZUxpc3RSZXN1bHQsIHR5cGUgUmVzb3VyY2VNa2RpclBhcmFtcywgdHlwZSBSZXNvdXJjZVJlYWRSZXN1bHQsIHR5cGUgUmVzb3VyY2VSZXF1ZXN0UGFyYW1zLCB0eXBlIFJlc291cmNlUmVxdWVzdFJlc3VsdCwgdHlwZSBSZXNvdXJjZVJlc29sdmVQYXJhbXMsIHR5cGUgUmVzb3VyY2VSZXNvbHZlUmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IEFocEVycm9yQ29kZXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvZXJyb3JzLmpzJztcbmltcG9ydCB7IFByb3RvY29sRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbnN1aXRlKCdBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIgLSBVUkkgaGVscGVycycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhZ2VudEhvc3RVcmkgYnVpbGRzIGNvcnJlY3QgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IGFnZW50SG9zdFVyaSgnbG9jYWxob3N0JywgJy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuc2NoZW1lLCBBR0VOVF9IT1NUX1NDSEVNRSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS5hdXRob3JpdHksICdsb2NhbGhvc3QnKTtcblx0XHQvLyBwYXRoIGVuY29kZXMgZmlsZSBzY2hlbWU6IC9maWxlLy9ob21lL3VzZXIvcHJvamVjdFxuXHRcdGFzc2VydC5vayh1cmkucGF0aC5pbmNsdWRlcygnL2hvbWUvdXNlci9wcm9qZWN0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudEhvc3RSZW1vdGVQYXRoIGV4dHJhY3RzIHRoZSBvcmlnaW5hbCBwYXRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IGFnZW50SG9zdFVyaSgnaG9zdCcsICcvc29tZS9wYXRoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdFJlbW90ZVBhdGgodXJpKSwgJy9zb21lL3BhdGgnKTtcblx0fSk7XG5cblx0dGVzdCgnYWdlbnRIb3N0UmVtb3RlUGF0aCByb3VuZC10cmlwcyB3aXRoIGFnZW50SG9zdFVyaScsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9ICcvaG9tZS91c2VyL3Byb2plY3QnO1xuXHRcdGNvbnN0IHVyaSA9IGFnZW50SG9zdFVyaSgnaG9zdCcsIG9yaWdpbmFsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0UmVtb3RlUGF0aCh1cmkpLCBvcmlnaW5hbCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RBdXRob3JpdHkgLSBlbmNvZGluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwdXJlbHkgYWxwaGFudW1lcmljIGFkZHJlc3MgaXMgcmV0dXJuZWQgYXMtaXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdEF1dGhvcml0eSgnbG9jYWxob3N0JyksICdsb2NhbGhvc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsIGhvc3Q6cG9ydCBhZGRyZXNzIHVzZXMgaHVtYW4tcmVhZGFibGUgZW5jb2RpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdEF1dGhvcml0eSgnbG9jYWxob3N0OjgwODEnKSwgJ2xvY2FsaG9zdF9fODA4MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3RBdXRob3JpdHkoJzE5Mi4xNjguMS4xOjgwODAnKSwgJzE5Mi4xNjguMS4xX184MDgwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdEF1dGhvcml0eSgnbXktaG9zdDo5MDkwJyksICdteS1ob3N0X185MDkwJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdEF1dGhvcml0eSgnaG9zdC5uYW1lOjgwJyksICdob3N0Lm5hbWVfXzgwJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZHJlc3Mgd2l0aCB1bmRlcnNjb3JlIGZhbGxzIHRocm91Z2ggdG8gYmFzZTY0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eSgnaG9zdF9uYW1lOjgwODAnKTtcblx0XHRhc3NlcnQub2soYXV0aG9yaXR5LnN0YXJ0c1dpdGgoJ2I2NC0nKSwgYGV4cGVjdGVkIGJhc2U2NCBmb3IgdW5kZXJzY29yZSBhZGRyZXNzLCBnb3Q6ICR7YXV0aG9yaXR5fWApO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRyZXNzIHdpdGggZXhvdGljIGNoYXJhY3RlcnMgaXMgYmFzZTY0LWVuY29kZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKGFnZW50SG9zdEF1dGhvcml0eSgndXNlckBob3N0OjgwODAnKS5zdGFydHNXaXRoKCdiNjQtJykpO1xuXHRcdGFzc2VydC5vayhhZ2VudEhvc3RBdXRob3JpdHkoJ2hvc3Qgd2l0aCBzcGFjZXMnKS5zdGFydHNXaXRoKCdiNjQtJykpO1xuXHRcdGFzc2VydC5vayhhZ2VudEhvc3RBdXRob3JpdHkoJ2h0dHA6Ly9teWhvc3Q6MzAwMCcpLnN0YXJ0c1dpdGgoJ2I2NC0nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dzOi8vIHByZWZpeCBpcyBub3JtYWxpemVkIHNvIGF1dGhvcml0eSBtYXRjaGVzIGJhcmUgYWRkcmVzcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0QXV0aG9yaXR5KCd3czovLzEyNy4wLjAuMTo4MDgwJyksIGFnZW50SG9zdEF1dGhvcml0eSgnMTI3LjAuMC4xOjgwODAnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdEF1dGhvcml0eSgnd3M6Ly9sb2NhbGhvc3Q6OTA5MCcpLCBhZ2VudEhvc3RBdXRob3JpdHkoJ2xvY2FsaG9zdDo5MDkwJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdGUgbG9jYWwgYWRkcmVzcyBkb2VzIG5vdCBjb2xsaWRlIHdpdGggdGhlIGFtYmllbnQgYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eSgnbG9jYWwnKTtcblx0XHRjb25zdCB3cmFwcGVkID0gdG9BZ2VudEhvc3RVcmkoVVJJLmZpbGUoJy9yZW1vdGUvZmlsZS50eHQnKSwgYXV0aG9yaXR5KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXV0aG9yaXR5LFxuXHRcdFx0bm9ybWFsaXplZEF1dGhvcml0eTogYWdlbnRIb3N0QXV0aG9yaXR5KCd3czovL2xvY2FsJyksXG5cdFx0XHRzaW1pbGFyQWRkcmVzc0F1dGhvcml0eTogYWdlbnRIb3N0QXV0aG9yaXR5KCdyZW1vdGVfbG9jYWwnKSxcblx0XHRcdHdyYXBwZWRTY2hlbWU6IHdyYXBwZWQuc2NoZW1lLFxuXHRcdFx0d3JhcHBlZEF1dGhvcml0eTogd3JhcHBlZC5hdXRob3JpdHksXG5cdFx0fSwge1xuXHRcdFx0YXV0aG9yaXR5OiAncmVtb3RlX2xvY2FsJyxcblx0XHRcdG5vcm1hbGl6ZWRBdXRob3JpdHk6ICdyZW1vdGVfbG9jYWwnLFxuXHRcdFx0c2ltaWxhckFkZHJlc3NBdXRob3JpdHk6ICdiNjQtY21WdGIzUmxYMnh2WTJGcycsXG5cdFx0XHR3cmFwcGVkU2NoZW1lOiBBR0VOVF9IT1NUX1NDSEVNRSxcblx0XHRcdHdyYXBwZWRBdXRob3JpdHk6ICdyZW1vdGVfbG9jYWwnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgYWRkcmVzc2VzIHByb2R1Y2UgZGlmZmVyZW50IGF1dGhvcml0aWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhc2VzID0gWydsb2NhbGhvc3Q6ODA4MCcsICdsb2NhbGhvc3Q6ODA4MScsICcxOTIuMTY4LjEuMTo4MDgwJywgJ2hvc3QtbmFtZTo4MCcsICdob3N0Lm5hbWU6ODAnLCAnaG9zdF9uYW1lOjgwJywgJ3VzZXJAaG9zdDo4MDgwJ107XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGNhc2VzLm1hcChhZ2VudEhvc3RBdXRob3JpdHkpO1xuXHRcdGNvbnN0IHVuaXF1ZSA9IG5ldyBTZXQocmVzdWx0cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuaXF1ZS5zaXplLCBjYXNlcy5sZW5ndGgsICdhbGwgYXV0aG9yaXRpZXMgbXVzdCBiZSB1bmlxdWUnKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0aG9yaXR5IGlzIHZhbGlkIGluIGEgVVJJIGF1dGhvcml0eSBwb3NpdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBhZGRyZXNzZXMgPSBbJ2xvY2FsaG9zdCcsICdsb2NhbGhvc3Q6ODA4MScsICd1c2VyQGhvc3Q6ODA4MCcsICdob3N0IHdpdGggc3BhY2VzJywgJzE5Mi4xNjguMS4xOjkwOTAnXTtcblx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgYWRkcmVzc2VzKSB7XG5cdFx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyk7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogQUdFTlRfSE9TVF9TQ0hFTUUsIGF1dGhvcml0eSwgcGF0aDogJy90ZXN0JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuYXV0aG9yaXR5LCBhdXRob3JpdHksIGBhdXRob3JpdHkgZm9yICcke2FkZHJlc3N9JyBtdXN0IHJvdW5kLXRyaXAgdGhyb3VnaCBVUklgKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dGhvcml0eSBpcyB2YWxpZCBpbiBhIFVSSSBzY2hlbWUgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWRkcmVzc2VzID0gWydsb2NhbGhvc3QnLCAnbG9jYWxob3N0OjgwODEnLCAndXNlckBob3N0OjgwODAnLCAnaG9zdCB3aXRoIHNwYWNlcyddO1xuXHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiBhZGRyZXNzZXMpIHtcblx0XHRcdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKTtcblx0XHRcdGNvbnN0IHNjaGVtZSA9IHJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlSWQoYXV0aG9yaXR5LCAnY29waWxvdCcpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWUsIHBhdGg6ICcvdGVzdCcgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnNjaGVtZSwgc2NoZW1lLCBgc2NoZW1lIGZvciAnJHthZGRyZXNzfScgbXVzdCByb3VuZC10cmlwIHRocm91Z2ggVVJJYCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgndG9BZ2VudEhvc3RVcmkgLyBmcm9tQWdlbnRIb3N0VXJpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JvdW5kLXRyaXBzIGEgZmlsZSBVUkknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0L2ZpbGUudHMnKTtcblx0XHRjb25zdCB3cmFwcGVkID0gdG9BZ2VudEhvc3RVcmkob3JpZ2luYWwsICdteS1zZXJ2ZXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBlZC5zY2hlbWUsIEFHRU5UX0hPU1RfU0NIRU1FKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3JhcHBlZC5hdXRob3JpdHksICdteS1zZXJ2ZXInKTtcblxuXHRcdGNvbnN0IHVud3JhcHBlZCA9IGZyb21BZ2VudEhvc3RVcmkod3JhcHBlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVud3JhcHBlZC5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVud3JhcHBlZC5wYXRoLCBvcmlnaW5hbC5wYXRoKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBVUkkgd2l0aCBhdXRob3JpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50aG9zdC1jb250ZW50JywgYXV0aG9yaXR5OiAnc2Vzc2lvbjEnLCBwYXRoOiAnL3NuYXAvYmVmb3JlJyB9KTtcblx0XHRjb25zdCB3cmFwcGVkID0gdG9BZ2VudEhvc3RVcmkob3JpZ2luYWwsICdyZW1vdGUtaG9zdCcpO1xuXHRcdGNvbnN0IHVud3JhcHBlZCA9IGZyb21BZ2VudEhvc3RVcmkod3JhcHBlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVud3JhcHBlZC5zY2hlbWUsICdhZ2VudGhvc3QtY29udGVudCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bndyYXBwZWQuYXV0aG9yaXR5LCAnc2Vzc2lvbjEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW53cmFwcGVkLnBhdGgsICcvc25hcC9iZWZvcmUnKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgcXVlcnkgYW5kIGZyYWdtZW50IGZvciBzeW50aGV0aWMgY29udGVudCBVUklzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiAnZ2l0LWJsb2InLFxuXHRcdFx0cGF0aDogJy9zcmMvYXBwLnRzJyxcblx0XHRcdHF1ZXJ5OiBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9hYmMnLCBzaGE6ICdjYWZlMTIzNCcgfSksXG5cdFx0XHRmcmFnbWVudDogJ0wxJyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSB0b0FnZW50SG9zdFVyaShvcmlnaW5hbCwgJ3JlbW90ZS1ob3N0Jyk7XG5cdFx0Y29uc3QgdW53cmFwcGVkID0gZnJvbUFnZW50SG9zdFVyaSh3cmFwcGVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d3JhcHBlZFBhdGg6IHdyYXBwZWQucGF0aCxcblx0XHRcdHdyYXBwZWRGcmFnbWVudDogd3JhcHBlZC5mcmFnbWVudCxcblx0XHRcdHVud3JhcHBlZDogdW53cmFwcGVkLnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0d3JhcHBlZFBhdGg6IG9yaWdpbmFsLnBhdGgsXG5cdFx0XHR3cmFwcGVkRnJhZ21lbnQ6IG9yaWdpbmFsLmZyYWdtZW50LFxuXHRcdFx0dW53cmFwcGVkOiBvcmlnaW5hbC50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBhdXRob3JpdHkgcmV0dXJucyBvcmlnaW5hbCBVUkkgdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC50cycpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRvQWdlbnRIb3N0VXJpKG9yaWdpbmFsLCAnbG9jYWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnRvU3RyaW5nKCksIG9yaWdpbmFsLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhZ2VudEhvc3RVcmkgZm9yIHJvb3QgcGF0aCBwcm9kdWNlcyB2YWxpZCBlbmNvZGVkIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoJ2xvY2FsaG9zdDo4MDg5Jyk7XG5cdFx0Y29uc3QgdXJpID0gYWdlbnRIb3N0VXJpKGF1dGhvcml0eSwgJy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJpLnNjaGVtZSwgQUdFTlRfSE9TVF9TQ0hFTUUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cmkuYXV0aG9yaXR5LCBhdXRob3JpdHkpO1xuXHRcdC8vIFRoZSBkZWNvZGVkIHBhdGggc2hvdWxkIGJlIHJvb3Rcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnJvbUFnZW50SG9zdFVyaSh1cmkpLnBhdGgsICcvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zyb21BZ2VudEhvc3RVcmkgZmFsbHMgYmFjayB0byBhIGZpbGUgVVJJIHdoZW4gbWV0YWRhdGEgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogQUdFTlRfSE9TVF9TQ0hFTUUsIGF1dGhvcml0eTogJ2hvc3QnLCBwYXRoOiAnL2ZpbGUnIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGZyb21BZ2VudEhvc3RVcmkodXJpKTtcblx0XHQvLyBTaG91bGQgbm90IHRocm93IC0gZmFsbHMgYmFjayB0byBhIGZpbGUgVVJJIHVzaW5nIHRoZSBwYXRoIHZlcmJhdGltXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zY2hlbWUsICdmaWxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5wYXRoLCAnL2ZpbGUnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FHRU5UX0hPU1RfTEFCRUxfRk9STUFUVEVSJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2xhYmVsIGlzIHRoZSBvcmlnaW5hbCBwYXRoIHZlcmJhdGltIGZvciBmaWxlIFVSSXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gYWdlbnRIb3N0QXV0aG9yaXR5KCdsb2NhbGhvc3Q6ODA4OScpO1xuXHRcdGNvbnN0IG9yaWdpbmFsUGF0aCA9ICcvVXNlcnMvcm9ibG91L2NvZGUvdnNjb2RlJztcblx0XHRjb25zdCBlbmNvZGVkVXJpID0gYWdlbnRIb3N0VXJpKGF1dGhvcml0eSwgb3JpZ2luYWxQYXRoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChBR0VOVF9IT1NUX0xBQkVMX0ZPUk1BVFRFUi5mb3JtYXR0aW5nLmxhYmVsLCAnJHtwYXRofScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmNvZGVkVXJpLnBhdGgsIG9yaWdpbmFsUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhYmVsIGlzIHRoZSBvcmlnaW5hbCBwYXRoIHZlcmJhdGltIGZvciBVUklzIHdpdGggYXV0aG9yaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudGhvc3QtY29udGVudCcsIGF1dGhvcml0eTogJ215aG9zdCcsIHBhdGg6ICcvc25hcC9iZWZvcmUnIH0pO1xuXHRcdGNvbnN0IGVuY29kZWRVcmkgPSB0b0FnZW50SG9zdFVyaShvcmlnaW5hbFVyaSwgJ3JlbW90ZS1ob3N0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5jb2RlZFVyaS5wYXRoLCAnL3NuYXAvYmVmb3JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhYmVsIGlzIHRoZSBvcmlnaW5hbCBwYXRoIHZlcmJhdGltIGZvciBnaXQtYmxvYiBVUklzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gVVJJLmZyb20oe1xuXHRcdFx0c2NoZW1lOiAnZ2l0LWJsb2InLFxuXHRcdFx0cGF0aDogJy9zcmMvYXBwLnRzJyxcblx0XHRcdHF1ZXJ5OiBKU09OLnN0cmluZ2lmeSh7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9hYmMnLCBzaGE6ICdjYWZlMTIzNCcgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW5jb2RlZFVyaSA9IHRvQWdlbnRIb3N0VXJpKG9yaWdpbmFsVXJpLCAncmVtb3RlLWhvc3QnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmNvZGVkVXJpLnBhdGgsICcvc3JjL2FwcC50cycpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyIC0gYXV0aG9yaXR5IHJlZ2lzdHJhdGlvbnMnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBOYW1lZENvbm5lY3Rpb24gaW1wbGVtZW50cyBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24ge1xuXHRcdHJlYWRvbmx5IGxpc3RDYWxsczogVVJJW10gPSBbXTtcblxuXHRcdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbmFtZTogc3RyaW5nKSB7IH1cblxuXHRcdGFzeW5jIHJlc291cmNlTGlzdCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0PiB7XG5cdFx0XHR0aGlzLmxpc3RDYWxscy5wdXNoKHVyaSk7XG5cdFx0XHRyZXR1cm4geyBlbnRyaWVzOiBbeyBuYW1lOiBgJHt0aGlzLm5hbWV9LnR4dGAsIHR5cGU6ICdmaWxlJyB9XSB9O1xuXHRcdH1cblxuXHRcdGFzeW5jIHJlc291cmNlUmVhZCgpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4geyByZXR1cm4geyBkYXRhOiAnJywgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4IH07IH1cblx0XHRhc3luYyByZXNvdXJjZVdyaXRlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VDb3B5KCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VEZWxldGUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0XHRhc3luYyByZXNvdXJjZU1vdmUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0XHRhc3luYyByZXNvdXJjZVJlc29sdmUocGFyYW1zOiBSZXNvdXJjZVJlc29sdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4ge1xuXHRcdFx0Y29uc3QgdXJpID0gdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHBhcmFtcy51cmkpIDogVVJJLnJldml2ZShwYXJhbXMudXJpKSE7XG5cdFx0XHRyZXR1cm4geyB1cmk6IHVyaS50b1N0cmluZygpLCB0eXBlOiBSZXNvdXJjZVR5cGUuRmlsZSB9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZU1rZGlyKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdH1cblxuXHR0ZXN0KCdkaXNwb3NpbmcgYSBzdGFsZSByZWdpc3RyYXRpb24gZG9lcyBub3QgcmVtb3ZlIGEgbmV3ZXIgcmVnaXN0cmF0aW9uIGZvciB0aGUgc2FtZSBhdXRob3JpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRjb25zdCBmaXJzdCA9IG5ldyBOYW1lZENvbm5lY3Rpb24oJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbmV3IE5hbWVkQ29ubmVjdGlvbignc2Vjb25kJyk7XG5cdFx0Y29uc3QgZmlyc3RSZWdpc3RyYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ2NsaWVudCcsIGZpcnN0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdjbGllbnQnLCBzZWNvbmQpKTtcblxuXHRcdGZpcnN0UmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgcHJvdmlkZXIucmVhZGRpcihhZ2VudEhvc3RVcmkoJ2NsaWVudCcsICcvd29ya3NwYWNlJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVudHJpZXMsIGZpcnN0Q2FsbHM6IGZpcnN0Lmxpc3RDYWxscywgc2Vjb25kQ2FsbHM6IHNlY29uZC5saXN0Q2FsbHMubWFwKHVyaSA9PiB1cmkudG9TdHJpbmcoKSkgfSwge1xuXHRcdFx0ZW50cmllczogW1snc2Vjb25kLnR4dCcsIEZpbGVUeXBlLkZpbGVdXSxcblx0XHRcdGZpcnN0Q2FsbHM6IFtdLFxuXHRcdFx0c2Vjb25kQ2FsbHM6IFtVUkkuZmlsZSgnL3dvcmtzcGFjZScpLnRvU3RyaW5nKCldLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgdGhlIG5ld2VzdCByZWdpc3RyYXRpb24gZmFsbHMgYmFjayB0byB0aGUgcHJldmlvdXMgb25lIHdpdGhvdXQgZW50ZXJpbmcgZ3JhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRjb25zdCBmaXJzdCA9IG5ldyBOYW1lZENvbm5lY3Rpb24oJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gbmV3IE5hbWVkQ29ubmVjdGlvbignc2Vjb25kJyk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdjbGllbnQnLCBmaXJzdCkpO1xuXHRcdGNvbnN0IHNlY29uZFJlZ2lzdHJhdGlvbiA9IHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdjbGllbnQnLCBzZWNvbmQpO1xuXG5cdFx0c2Vjb25kUmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgcHJvdmlkZXIucmVhZGRpcihhZ2VudEhvc3RVcmkoJ2NsaWVudCcsICcvd29ya3NwYWNlJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVudHJpZXMsIGZpcnN0Q2FsbHM6IGZpcnN0Lmxpc3RDYWxscy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSwgc2Vjb25kQ2FsbHM6IHNlY29uZC5saXN0Q2FsbHMgfSwge1xuXHRcdFx0ZW50cmllczogW1snZmlyc3QudHh0JywgRmlsZVR5cGUuRmlsZV1dLFxuXHRcdFx0Zmlyc3RDYWxsczogW1VSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKV0sXG5cdFx0XHRzZWNvbmRDYWxsczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZXJhdGlvbiBpc3N1ZWQgZHVyaW5nIHJlY29ubmVjdCB3aW5kb3cgd2FpdHMgZm9yIHRoZSByZXBsYWNlbWVudCByZWdpc3RyYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcig1MCkpO1xuXHRcdGNvbnN0IGZpcnN0ID0gbmV3IE5hbWVkQ29ubmVjdGlvbignZmlyc3QnKTtcblx0XHRjb25zdCBzZWNvbmQgPSBuZXcgTmFtZWRDb25uZWN0aW9uKCdzZWNvbmQnKTtcblxuXHRcdC8vIFJlZ2lzdGVyLCB0aGVuIGRpc3Bvc2UgXHUyMDE0IHdlJ3JlIG5vdyBpbnNpZGUgdGhlIGdyYWNlIHdpbmRvdy5cblx0XHRjb25zdCBmaXJzdFJlZ2lzdHJhdGlvbiA9IHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdjbGllbnQnLCBmaXJzdCk7XG5cdFx0Zmlyc3RSZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0Ly8gSXNzdWUgYW4gb3BlcmF0aW9uIHdoaWxlIG5vIGNvbm5lY3Rpb24gaXMgYm91bmQuIEl0IHNob3VsZFxuXHRcdC8vIHF1ZXVlLCB3YWl0aW5nIGZvciBhIHJlLXJlZ2lzdHJhdGlvbi5cblx0XHRjb25zdCBwZW5kaW5nID0gcHJvdmlkZXIucmVhZGRpcihhZ2VudEhvc3RVcmkoJ2NsaWVudCcsICcvd29ya3NwYWNlJykpO1xuXG5cdFx0Ly8gUmVjb25uZWN0IHdpdGhpbiB0aGUgZ3JhY2Ugd2luZG93LlxuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgnY2xpZW50Jywgc2Vjb25kKSk7XG5cblx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgcGVuZGluZztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZW50cmllcywgZmlyc3RDYWxsczogZmlyc3QubGlzdENhbGxzLCBzZWNvbmRDYWxsczogc2Vjb25kLmxpc3RDYWxscy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSB9LCB7XG5cdFx0XHRlbnRyaWVzOiBbWydzZWNvbmQudHh0JywgRmlsZVR5cGUuRmlsZV1dLFxuXHRcdFx0Zmlyc3RDYWxsczogW10sXG5cdFx0XHRzZWNvbmRDYWxsczogW1VSSS5maWxlKCcvd29ya3NwYWNlJykudG9TdHJpbmcoKV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZXJhdGlvbiBpc3N1ZWQgaW4gdGhlIGdyYWNlIHdpbmRvdyByZWplY3RzIHdpdGggVW5hdmFpbGFibGUgd2hlbiBubyByZWNvbm5lY3QgYXJyaXZlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKDIwKSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBuZXcgTmFtZWRDb25uZWN0aW9uKCdmaXJzdCcpO1xuXG5cdFx0Y29uc3QgZmlyc3RSZWdpc3RyYXRpb24gPSBwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgnY2xpZW50JywgZmlyc3QpO1xuXHRcdGZpcnN0UmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSBwcm92aWRlci5yZWFkZGlyKGFnZW50SG9zdFVyaSgnY2xpZW50JywgJy93b3Jrc3BhY2UnKSk7XG5cblx0XHRsZXQgY2F1Z2h0OiB1bmtub3duO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwZW5kaW5nO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y2F1Z2h0ID0gZXJyO1xuXHRcdH1cblx0XHRhc3NlcnQub2soY2F1Z2h0IGluc3RhbmNlb2YgRXJyb3IsICdleHBlY3RlZCBhbiBlcnJvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShjYXVnaHQgYXMgRXJyb3IpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVyYXRpb24gcmVqZWN0cyBpbW1lZGlhdGVseSB3aGVuIG5vIGF1dGhvcml0eSB3YXMgZXZlciByZWdpc3RlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoNTApKTtcblxuXHRcdGxldCBjYXVnaHQ6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLnJlYWRkaXIoYWdlbnRIb3N0VXJpKCduZXZlcicsICcvd29ya3NwYWNlJykpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y2F1Z2h0ID0gZXJyO1xuXHRcdH1cblx0XHRhc3NlcnQub2soY2F1Z2h0IGluc3RhbmNlb2YgRXJyb3IsICdleHBlY3RlZCBhbiBlcnJvcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShjYXVnaHQgYXMgRXJyb3IpLCBGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuVW5hdmFpbGFibGUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyIC0gc3ludGhldGljIGNvbnRlbnQgc2NoZW1lcycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8qKlxuXHQgKiBTdHViIGNvbm5lY3Rpb24gdGhhdCByZWNvcmRzIHRoZSBVUklzIGl0J3MgYXNrZWQgYWJvdXQgYW5kIHJldHVybnNcblx0ICogY2FubmVkIGRhdGEsIHNvIHdlIGNhbiBhc3NlcnQgb24gdGhlIFVSSXMgdGhlIHByb3ZpZGVyIHBhc3NlcyB0aHJvdWdoLlxuXHQgKi9cblx0Y2xhc3MgU3R1YkNvbm5lY3Rpb24gaW1wbGVtZW50cyBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24ge1xuXHRcdHJlYWRvbmx5IHJlYWRDYWxsczogVVJJW10gPSBbXTtcblx0XHRyZWFkb25seSBsaXN0Q2FsbHM6IFVSSVtdID0gW107XG5cdFx0cmVhZG9ubHkgcmVzb2x2ZUNhbGxzOiBSZXNvdXJjZVJlc29sdmVQYXJhbXNbXSA9IFtdO1xuXHRcdHJlYWRSZXN1bHQ6IFJlc291cmNlUmVhZFJlc3VsdCA9IHsgZGF0YTogJ3N0dWItY29udGVudCcsIGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCwgY29udGVudFR5cGU6ICd0ZXh0L3BsYWluJyB9O1xuXG5cdFx0YXN5bmMgcmVzb3VyY2VSZWFkKHVyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZVJlYWRSZXN1bHQ+IHtcblx0XHRcdHRoaXMucmVhZENhbGxzLnB1c2godXJpKTtcblx0XHRcdHJldHVybiB0aGlzLnJlYWRSZXN1bHQ7XG5cdFx0fVxuXHRcdGFzeW5jIHJlc291cmNlTGlzdCh1cmk6IFVSSSk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0PiB7XG5cdFx0XHR0aGlzLmxpc3RDYWxscy5wdXNoKHVyaSk7XG5cdFx0XHRyZXR1cm4geyBlbnRyaWVzOiBbXSB9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZVdyaXRlKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VDb3B5KCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdFx0YXN5bmMgcmVzb3VyY2VEZWxldGUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0XHRhc3luYyByZXNvdXJjZU1vdmUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0XHRhc3luYyByZXNvdXJjZVJlc29sdmUocGFyYW1zOiBSZXNvdXJjZVJlc29sdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4ge1xuXHRcdFx0dGhpcy5yZXNvbHZlQ2FsbHMucHVzaChwYXJhbXMpO1xuXHRcdFx0Y29uc3QgdXJpID0gdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHBhcmFtcy51cmkpIDogVVJJLnJldml2ZShwYXJhbXMudXJpKSE7XG5cdFx0XHRyZXR1cm4geyB1cmk6IHVyaS50b1N0cmluZygpLCB0eXBlOiBSZXNvdXJjZVR5cGUuRmlsZSB9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZU1rZGlyKCk6IFByb21pc2U8e30+IHsgcmV0dXJuIHt9OyB9XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cCgpIHtcblx0XHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBuZXcgU3R1YkNvbm5lY3Rpb24oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ2xvY2FsJywgY29ubmVjdGlvbikpO1xuXHRcdHJldHVybiB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH07XG5cdH1cblxuXHQvLyBSZWdyZXNzaW9uOiBBSFBGaWxlU3lzdGVtUHJvdmlkZXIuc3RhdCgpIHVzZWQgdG8gZmFsbCB0aHJvdWdoIHRvXG5cdC8vIF9saXN0RGlyZWN0b3J5KHBhcmVudCkgZm9yIGFueSBVUkkgd2hvc2UgZGVjb2RlZCBzY2hlbWUgd2Fzbid0XG5cdC8vIHNlc3Npb24tZGIsIHdoaWNoIGZhaWxzIHdpdGggXCJEaXJlY3Rvcnkgbm90IGZvdW5kXCIgZm9yIHN5bnRoZXRpY1xuXHQvLyBjb250ZW50IFVSSXMgdGhhdCBoYXZlIG5vIHJlYWwgcGFyZW50IGRpcmVjdG9yeS4gVGhlIGRpZmYgZWRpdG9yXG5cdC8vIHN0YXRzIGV2ZXJ5IFVSSSBiZWZvcmUgcmVhZGluZyBpdCwgc28gdGhpcyBicm9rZSBcIm9wZW4gZGlmZiBvZiBhXG5cdC8vIG1vZGlmaWVkIGZpbGVcIiBlbnRpcmVseS4gVGhlIGZpeCBpcyB0aGUgc2NoZW1lIGFsbG93bGlzdCBpbiBzdGF0KCkuXG5cblx0dGVzdCgnc3RhdCByZXR1cm5zIEZpbGUgZm9yIGdpdC1ibG9iOiBVUklzIHdpdGhvdXQgbGlzdGluZyB0aGUgcGFyZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgaW5uZXIgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2dpdC1ibG9iJywgYXV0aG9yaXR5OiAnc2VzczEnLCBwYXRoOiAnL3NoYS9lbmNvZGVkL2ZpbGUudHMnIH0pO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSB0b0FnZW50SG9zdFVyaShpbm5lciwgJ2xvY2FsJyk7XG5cblx0XHRjb25zdCBzdGF0ID0gYXdhaXQgcHJvdmlkZXIuc3RhdCh3cmFwcGVkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0LnR5cGUsIEZpbGVUeXBlLkZpbGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5saXN0Q2FsbHMsIFtdLCAnc3RhdCBtdXN0IG5vdCBsaXN0IGEgc3ludGhldGljIHBhcmVudCBkaXJlY3RvcnknKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdCByZXR1cm5zIEZpbGUgZm9yIHNlc3Npb24tZGI6IFVSSXMgKHBhcml0eSB3aXRoIGdpdC1ibG9iKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGlubmVyID0gVVJJLmZyb20oeyBzY2hlbWU6ICdzZXNzaW9uLWRiJywgYXV0aG9yaXR5OiAnc2VzczEnLCBwYXRoOiAnL3NuYXAvc29tZS1ibG9iJyB9KTtcblx0XHRjb25zdCB3cmFwcGVkID0gdG9BZ2VudEhvc3RVcmkoaW5uZXIsICdsb2NhbCcpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHByb3ZpZGVyLnN0YXQod3JhcHBlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdC50eXBlLCBGaWxlVHlwZS5GaWxlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24ubGlzdENhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXQgdXNlcyByZXNvdXJjZVJlc29sdmUgZm9yIG9yZGluYXJ5IGZpbGU6IFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVXNlIGEgbm9uLWxvY2FsIGF1dGhvcml0eSBzbyB0aGUgVVJJIGFjdHVhbGx5IGdvZXMgdGhyb3VnaCB0aGVcblx0XHQvLyBhZ2VudC1ob3N0IHdyYXBwaW5nICh0b0FnZW50SG9zdFVyaSBzaG9ydC1jaXJjdWl0cyAnbG9jYWwnXG5cdFx0Ly8gKyBmaWxlOi8vIHRvIHJldHVybiB0aGUgVVJJIHVuY2hhbmdlZCkuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IFN0dWJDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdyZW1vdGUnLCBjb25uZWN0aW9uKSk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9zb21lL2ZpbGUudHMnKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnN0YXQod3JhcHBlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ucmVzb2x2ZUNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ubGlzdENhbGxzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIHBhc3NlcyB0aGUgZGVjb2RlZCBzeW50aGV0aWMgVVJJIHRocm91Z2ggdG8gdGhlIGNvbm5lY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBpbm5lciA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZ2l0LWJsb2InLCBhdXRob3JpdHk6ICdzZXNzMScsIHBhdGg6ICcvc2hhL2VuY29kZWQvZmlsZS50cycgfSk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IHRvQWdlbnRIb3N0VXJpKGlubmVyLCAnbG9jYWwnKTtcblxuXHRcdGNvbnN0IGJ5dGVzID0gYXdhaXQgcHJvdmlkZXIucmVhZEZpbGUod3JhcHBlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVlNCdWZmZXIud3JhcChieXRlcykudG9TdHJpbmcoKSwgJ3N0dWItY29udGVudCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29ubmVjdGlvbi5yZWFkQ2FsbHMubWFwKHUgPT4gdS50b1N0cmluZygpKSwgW2lubmVyLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0dGVzdCgnZnVsbCBzdGF0LXRoZW4tcmVhZCByb3VuZC10cmlwIG1pcnJvcnMgdGhlIGRpZmYgZWRpdG9yIGZsb3cnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBpcyB0aGUgZXhhY3Qgc2VxdWVuY2UgdGhlIHdvcmtiZW5jaCdzIFRleHRGaWxlRWRpdG9yTW9kZWxcblx0XHQvLyBnb2VzIHRocm91Z2ggd2hlbiBEaWZmRWRpdG9ySW5wdXQuY3JlYXRlTW9kZWwgcmVzb2x2ZXM6IHN0YXRcblx0XHQvLyB0aGUgVVJJLCB0aGVuIHJlYWQgdGhlIGZpbGUuIFByZS1maXggdGhpcyBjb21ibyBmYWlsZWQgYXQgdGhlXG5cdFx0Ly8gc3RhdCBzdGVwIGJlZm9yZSByZWFkRmlsZSB3YXMgZXZlbiBjYWxsZWQuXG5cdFx0Y29uc3QgeyBwcm92aWRlciB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBpbm5lciA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnZ2l0LWJsb2InLCBhdXRob3JpdHk6ICdzZXNzMScsIHBhdGg6ICcvc2hhL2VuY29kZWQvZmlsZS50cycgfSk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IHRvQWdlbnRIb3N0VXJpKGlubmVyLCAnbG9jYWwnKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KHdyYXBwZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0LnR5cGUsIEZpbGVUeXBlLkZpbGUpO1xuXHRcdGNvbnN0IGJ5dGVzID0gYXdhaXQgcHJvdmlkZXIucmVhZEZpbGUod3JhcHBlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZTQnVmZmVyLndyYXAoYnl0ZXMpLnRvU3RyaW5nKCksICdzdHViLWNvbnRlbnQnKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlciAtIHBlcm1pc3Npb24gZXJyb3JzIGFuZCByZXF1ZXN0UmVzb3VyY2VBY2Nlc3MnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKipcblx0ICogU3R1YiBjb25uZWN0aW9uIHdob3NlIGluZGl2aWR1YWwgb3BlcmF0aW9ucyBjYW4gYmUgY29uZmlndXJlZCB0byB0aHJvdy5cblx0ICogUmVjb3JkcyBldmVyeSBgcmVzb3VyY2VSZXF1ZXN0YCBjYWxsIHNvIHRlc3RzIGNhbiBhc3NlcnQgVVJJIHRyYW5zbGF0aW9uXG5cdCAqIGFuZCB0aGUgcmVhZC93cml0ZSBmbGFncyBmb3J3YXJkZWQgdG8gdGhlIHJlY2VpdmVyLlxuXHQgKi9cblx0Y2xhc3MgQ29uZmlndXJhYmxlQ29ubmVjdGlvbiBpbXBsZW1lbnRzIElSZW1vdGVGaWxlc3lzdGVtQ29ubmVjdGlvbiB7XG5cdFx0cmVhZEVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdHdyaXRlRXJyb3I6IHVua25vd24gfCB1bmRlZmluZWQ7XG5cdFx0bGlzdEVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdGRlbGV0ZUVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdG1vdmVFcnJvcjogdW5rbm93biB8IHVuZGVmaW5lZDtcblx0XHRjb3B5RXJyb3I6IHVua25vd24gfCB1bmRlZmluZWQ7XG5cdFx0cmVzb2x2ZUVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdG1rZGlyRXJyb3I6IHVua25vd24gfCB1bmRlZmluZWQ7XG5cdFx0cmVxdWVzdEVycm9yOiB1bmtub3duIHwgdW5kZWZpbmVkO1xuXHRcdHJlYWRvbmx5IHJlcXVlc3RDYWxsczogUmVzb3VyY2VSZXF1ZXN0UGFyYW1zW10gPSBbXTtcblx0XHRoYXNSZXNvdXJjZVJlcXVlc3QgPSB0cnVlO1xuXG5cdFx0YXN5bmMgcmVzb3VyY2VSZWFkKCk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0XHRpZiAodGhpcy5yZWFkRXJyb3IpIHsgdGhyb3cgdGhpcy5yZWFkRXJyb3I7IH1cblx0XHRcdHJldHVybiB7IGRhdGE6ICcnLCBlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjggfTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VMaXN0KCk6IFByb21pc2U8UmVzb3VyY2VMaXN0UmVzdWx0PiB7XG5cdFx0XHRpZiAodGhpcy5saXN0RXJyb3IpIHsgdGhyb3cgdGhpcy5saXN0RXJyb3I7IH1cblx0XHRcdHJldHVybiB7IGVudHJpZXM6IFtdIH07XG5cdFx0fVxuXHRcdGFzeW5jIHJlc291cmNlV3JpdGUoKTogUHJvbWlzZTx7fT4ge1xuXHRcdFx0aWYgKHRoaXMud3JpdGVFcnJvcikgeyB0aHJvdyB0aGlzLndyaXRlRXJyb3I7IH1cblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VDb3B5KCk6IFByb21pc2U8e30+IHtcblx0XHRcdGlmICh0aGlzLmNvcHlFcnJvcikgeyB0aHJvdyB0aGlzLmNvcHlFcnJvcjsgfVxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZURlbGV0ZSgpOiBQcm9taXNlPHt9PiB7XG5cdFx0XHRpZiAodGhpcy5kZWxldGVFcnJvcikgeyB0aHJvdyB0aGlzLmRlbGV0ZUVycm9yOyB9XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGFzeW5jIHJlc291cmNlTW92ZSgpOiBQcm9taXNlPHt9PiB7XG5cdFx0XHRpZiAodGhpcy5tb3ZlRXJyb3IpIHsgdGhyb3cgdGhpcy5tb3ZlRXJyb3I7IH1cblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VSZXNvbHZlKHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+IHtcblx0XHRcdGlmICh0aGlzLnJlc29sdmVFcnJvcikgeyB0aHJvdyB0aGlzLnJlc29sdmVFcnJvcjsgfVxuXHRcdFx0Y29uc3QgdXJpID0gdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHBhcmFtcy51cmkpIDogVVJJLnJldml2ZShwYXJhbXMudXJpKSE7XG5cdFx0XHRyZXR1cm4geyB1cmk6IHVyaS50b1N0cmluZygpLCB0eXBlOiBSZXNvdXJjZVR5cGUuRmlsZSB9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZU1rZGlyKCk6IFByb21pc2U8e30+IHtcblx0XHRcdGlmICh0aGlzLm1rZGlyRXJyb3IpIHsgdGhyb3cgdGhpcy5ta2RpckVycm9yOyB9XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdC8vIERlZmluZWQgYXMgYSBwcm9wZXJ0eSBzbyB3ZSBjYW4gYGRlbGV0ZWAgaXQgdG8gc2ltdWxhdGUgYSBjb25uZWN0aW9uXG5cdFx0Ly8gd2l0aG91dCByZXNvdXJjZVJlcXVlc3Qgc3VwcG9ydCAoZS5nLiBvbGRlciBwcm90b2NvbCBjbGllbnRzKS5cblx0XHRyZXNvdXJjZVJlcXVlc3Q/ID0gYXN5bmMgKHBhcmFtczogUmVzb3VyY2VSZXF1ZXN0UGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlcXVlc3RSZXN1bHQ+ID0+IHtcblx0XHRcdHRoaXMucmVxdWVzdENhbGxzLnB1c2gocGFyYW1zKTtcblx0XHRcdGlmICh0aGlzLnJlcXVlc3RFcnJvcikgeyB0aHJvdyB0aGlzLnJlcXVlc3RFcnJvcjsgfVxuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cChvcHRzOiB7IHdpdGhSZXNvdXJjZVJlcXVlc3Q/OiBib29sZWFuIH0gPSB7fSkge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoKSk7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBDb25maWd1cmFibGVDb25uZWN0aW9uKCk7XG5cdFx0aWYgKG9wdHMud2l0aFJlc291cmNlUmVxdWVzdCA9PT0gZmFsc2UpIHtcblx0XHRcdGNvbm5lY3Rpb24uaGFzUmVzb3VyY2VSZXF1ZXN0ID0gZmFsc2U7XG5cdFx0XHRkZWxldGUgY29ubmVjdGlvbi5yZXNvdXJjZVJlcXVlc3Q7XG5cdFx0fVxuXHRcdC8vIFVzZSBhIG5vbi1gbG9jYWxgIGF1dGhvcml0eSBzbyBmaWxlIFVSSXMgYWN0dWFsbHkgZ28gdGhyb3VnaCB0aGVcblx0XHQvLyBBSFAgd3JhcHBpbmc7IHRvQWdlbnRIb3N0VXJpIHNob3J0LWNpcmN1aXRzICdsb2NhbCcrZmlsZTovLyB0b1xuXHRcdC8vIHJldHVybiB0aGUgVVJJIHVuY2hhbmdlZCwgd2hpY2ggd291bGQgYnlwYXNzIHRoZSBwcm92aWRlciBlbnRpcmVseS5cblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ3JlbW90ZScsIGNvbm5lY3Rpb24pKTtcblx0XHRyZXR1cm4geyBwcm92aWRlciwgY29ubmVjdGlvbiB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcGVybWlzc2lvbkRlbmllZCh1cmk6IHN0cmluZyk6IFByb3RvY29sRXJyb3Ige1xuXHRcdHJldHVybiBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLlBlcm1pc3Npb25EZW5pZWQsICdkZW5pZWQnLCB7IHJlcXVlc3Q6IHsgdXJpLCByZWFkOiB0cnVlIH0gfSk7XG5cdH1cblxuXHR0ZXN0KCdyZWFkRmlsZSBtYXBzIFBlcm1pc3Npb25EZW5pZWQgdG8gTm9QZXJtaXNzaW9ucyAobm90IEZpbGVOb3RGb3VuZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL3NlY3JldCcpO1xuXHRcdGNvbm5lY3Rpb24ucmVhZEVycm9yID0gcGVybWlzc2lvbkRlbmllZCh3cmFwcGVkLnRvU3RyaW5nKCkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLnJlYWRGaWxlKHdyYXBwZWQpO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIHJlYWRGaWxlIHRvIHJlamVjdCcpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zLFxuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWRGaWxlIHN0aWxsIG1hcHMgZ2VuZXJpYyBlcnJvcnMgdG8gRmlsZU5vdEZvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9taXNzaW5nJyk7XG5cdFx0Y29ubmVjdGlvbi5yZWFkRXJyb3IgPSBuZXcgRXJyb3IoJ2Jvb20nKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5yZWFkRmlsZSh3cmFwcGVkKTtcblx0XHRcdGFzc2VydC5mYWlsKCdleHBlY3RlZCByZWFkRmlsZSB0byByZWplY3QnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuRmlsZU5vdEZvdW5kLFxuXHRcdFx0KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlRmlsZSAvIGRlbGV0ZSAvIHJlbmFtZSAvIHJlYWRkaXIgYWxsIHN1cmZhY2UgTm9QZXJtaXNzaW9ucyBvbiBQZXJtaXNzaW9uRGVuaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9uby13cml0ZScpO1xuXHRcdGNvbnN0IGRlbmllZCA9IHBlcm1pc3Npb25EZW5pZWQod3JhcHBlZC50b1N0cmluZygpKTtcblx0XHRjb25uZWN0aW9uLndyaXRlRXJyb3IgPSBkZW5pZWQ7XG5cdFx0Y29ubmVjdGlvbi5kZWxldGVFcnJvciA9IGRlbmllZDtcblx0XHRjb25uZWN0aW9uLm1vdmVFcnJvciA9IGRlbmllZDtcblx0XHRjb25uZWN0aW9uLmxpc3RFcnJvciA9IGRlbmllZDtcblxuXHRcdGNvbnN0IGNvZGVzOiAoRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Y29uc3QgY29sbGVjdCA9IGFzeW5jIChvcDogKCkgPT4gUHJvbWlzZTx1bmtub3duPikgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgb3AoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjb2Rlcy5wdXNoKHRvRmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyIDogdW5kZWZpbmVkKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRhd2FpdCBjb2xsZWN0KCgpID0+IHByb3ZpZGVyLndyaXRlRmlsZSh3cmFwcGVkLCBuZXcgVWludDhBcnJheSgpLCB7IGNyZWF0ZTogdHJ1ZSwgb3ZlcndyaXRlOiB0cnVlLCB1bmxvY2s6IGZhbHNlLCBhdG9taWM6IGZhbHNlIH0pKTtcblx0XHRhd2FpdCBjb2xsZWN0KCgpID0+IHByb3ZpZGVyLmRlbGV0ZSh3cmFwcGVkLCB7IHJlY3Vyc2l2ZTogZmFsc2UsIHVzZVRyYXNoOiBmYWxzZSwgYXRvbWljOiBmYWxzZSB9KSk7XG5cdFx0YXdhaXQgY29sbGVjdCgoKSA9PiBwcm92aWRlci5yZW5hbWUod3JhcHBlZCwgYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL2RzdCcpLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KSk7XG5cdFx0YXdhaXQgY29sbGVjdCgoKSA9PiBwcm92aWRlci5yZWFkZGlyKHdyYXBwZWQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29kZXMsIFtcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zLFxuXHRcdFx0RmlsZVN5c3RlbVByb3ZpZGVyRXJyb3JDb2RlLk5vUGVybWlzc2lvbnMsXG5cdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyxcblx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5Ob1Blcm1pc3Npb25zLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0UmVzb3VyY2VBY2Nlc3MgZm9yd2FyZHMgdGhlIGRlY29kZWQgVVJJIGFuZCBhY2Nlc3MgZmxhZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL2V0Yy9mb28nKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnJlcXVlc3RSZXNvdXJjZUFjY2Vzcyh3cmFwcGVkLCB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLnJlcXVlc3RDYWxscywgW1xuXHRcdFx0eyBjaGFubmVsOiBST09UX1NUQVRFX1VSSSwgdXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKS50b1N0cmluZygpLCByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0UmVzb3VyY2VBY2Nlc3MgdGhyb3dzIFVuYXZhaWxhYmxlIHdoZW4gdGhlIGNvbm5lY3Rpb24gaGFzIG5vIHJlc291cmNlUmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyIH0gPSBzZXR1cCh7IHdpdGhSZXNvdXJjZVJlcXVlc3Q6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvZXRjL2ZvbycpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLnJlcXVlc3RSZXNvdXJjZUFjY2Vzcyh3cmFwcGVkLCB7IHJlYWQ6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnZXhwZWN0ZWQgcmVxdWVzdFJlc291cmNlQWNjZXNzIHRvIHJlamVjdCcpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0b0ZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZShlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdEZpbGVTeXN0ZW1Qcm92aWRlckVycm9yQ29kZS5VbmF2YWlsYWJsZSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZXF1ZXN0UmVzb3VyY2VBY2Nlc3MgbWFwcyBQZXJtaXNzaW9uRGVuaWVkIHRvIE5vUGVybWlzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL2V0Yy9mb28nKTtcblx0XHRjb25uZWN0aW9uLnJlcXVlc3RFcnJvciA9IHBlcm1pc3Npb25EZW5pZWQod3JhcHBlZC50b1N0cmluZygpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5yZXF1ZXN0UmVzb3VyY2VBY2Nlc3Mod3JhcHBlZCwgeyByZWFkOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIHJlcXVlc3RSZXNvdXJjZUFjY2VzcyB0byByZWplY3QnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dG9GaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHRGaWxlU3lzdGVtUHJvdmlkZXJFcnJvckNvZGUuTm9QZXJtaXNzaW9ucyxcblx0XHRcdCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0RmlsZVN5c3RlbVByb3ZpZGVyIC0gcmVzb2x2ZSAvIG1rZGlyIC8gY29weSAvIHdhdGNoJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y2xhc3MgRnVsbENvbm5lY3Rpb24gaW1wbGVtZW50cyBJUmVtb3RlRmlsZXN5c3RlbUNvbm5lY3Rpb24ge1xuXHRcdHJlYWRvbmx5IHJlc29sdmVDYWxsczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zW10gPSBbXTtcblx0XHRyZWFkb25seSBta2RpckNhbGxzOiBSZXNvdXJjZU1rZGlyUGFyYW1zW10gPSBbXTtcblx0XHRyZWFkb25seSBjb3B5Q2FsbHM6IFJlc291cmNlQ29weVBhcmFtc1tdID0gW107XG5cdFx0cmVhZG9ubHkgd2F0Y2hDYWxsczogQ3JlYXRlUmVzb3VyY2VXYXRjaFBhcmFtc1tdID0gW107XG5cdFx0bmV4dFdhdGNoSGFuZGxlOiB7IG9uRGlkQ2hhbmdlOiBFdmVudDxyZWFkb25seSBJRmlsZUNoYW5nZVtdPjsgZGlzcG9zZSgpOiB2b2lkIH0gfCB1bmRlZmluZWQ7XG5cdFx0d2F0Y2hFcnJvcjogdW5rbm93biB8IHVuZGVmaW5lZDtcblx0XHRuZXh0UmVzb2x2ZVJlc3VsdDogUmVzb3VyY2VSZXNvbHZlUmVzdWx0ID0geyB1cmk6ICcnLCB0eXBlOiBSZXNvdXJjZVR5cGUuRmlsZSwgc2l6ZTogNDIsIG10aW1lOiAnMjAyNi0wMS0xNVQxMjozNDo1Ni43ODlaJywgZXRhZzogJ2V0YWctMScgfTtcblxuXHRcdGFzeW5jIHJlc291cmNlUmVhZCgpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4geyByZXR1cm4geyBkYXRhOiAnJywgZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4IH07IH1cblx0XHRhc3luYyByZXNvdXJjZUxpc3QoKTogUHJvbWlzZTxSZXNvdXJjZUxpc3RSZXN1bHQ+IHsgcmV0dXJuIHsgZW50cmllczogW10gfTsgfVxuXHRcdGFzeW5jIHJlc291cmNlV3JpdGUoKTogUHJvbWlzZTx7fT4geyByZXR1cm4ge307IH1cblx0XHRhc3luYyByZXNvdXJjZURlbGV0ZSgpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRcdGFzeW5jIHJlc291cmNlTW92ZSgpOiBQcm9taXNlPHt9PiB7IHJldHVybiB7fTsgfVxuXHRcdGFzeW5jIHJlc291cmNlQ29weShwYXJhbXM6IFJlc291cmNlQ29weVBhcmFtcyk6IFByb21pc2U8e30+IHtcblx0XHRcdHRoaXMuY29weUNhbGxzLnB1c2gocGFyYW1zKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0YXN5bmMgcmVzb3VyY2VSZXNvbHZlKHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+IHtcblx0XHRcdHRoaXMucmVzb2x2ZUNhbGxzLnB1c2gocGFyYW1zKTtcblx0XHRcdHJldHVybiB7IC4uLnRoaXMubmV4dFJlc29sdmVSZXN1bHQsIHVyaTogdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gcGFyYW1zLnVyaSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSkudG9TdHJpbmcoKSB9O1xuXHRcdH1cblx0XHRhc3luYyByZXNvdXJjZU1rZGlyKHBhcmFtczogUmVzb3VyY2VNa2RpclBhcmFtcyk6IFByb21pc2U8e30+IHtcblx0XHRcdHRoaXMubWtkaXJDYWxscy5wdXNoKHBhcmFtcyk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdGFzeW5jIHdhdGNoUmVzb3VyY2UocGFyYW1zOiBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zKTogUHJvbWlzZTx7IG9uRGlkQ2hhbmdlOiBFdmVudDxyZWFkb25seSBJRmlsZUNoYW5nZVtdPjsgZGlzcG9zZSgpOiB2b2lkIH0+IHtcblx0XHRcdHRoaXMud2F0Y2hDYWxscy5wdXNoKHBhcmFtcyk7XG5cdFx0XHRpZiAodGhpcy53YXRjaEVycm9yKSB7XG5cdFx0XHRcdHRocm93IHRoaXMud2F0Y2hFcnJvcjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5uZXh0V2F0Y2hIYW5kbGUpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCd0ZXN0IGZvcmdvdCB0byBzZXQgbmV4dFdhdGNoSGFuZGxlJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5uZXh0V2F0Y2hIYW5kbGU7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoKSB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gbmV3IEZ1bGxDb25uZWN0aW9uKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLnJlZ2lzdGVyQXV0aG9yaXR5KCdyZW1vdGUnLCBjb25uZWN0aW9uKSk7XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfTtcblx0fVxuXG5cdHRlc3QoJ3N0YXQgdXNlcyByZXNvdXJjZVJlc29sdmUgd2hlbiBhdmFpbGFibGUgYW5kIG1hcHMgc2l6ZS9tdGltZS90eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29ubmVjdGlvbi5uZXh0UmVzb2x2ZVJlc3VsdCA9IHsgdXJpOiAnJywgdHlwZTogUmVzb3VyY2VUeXBlLkRpcmVjdG9yeSwgc2l6ZTogMCwgbXRpbWU6ICcyMDI2LTAxLTE1VDAwOjAwOjAwLjAwMFonIH07XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9zb21lL2RpcicpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHByb3ZpZGVyLnN0YXQod3JhcHBlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdC50eXBlLCBGaWxlVHlwZS5EaXJlY3RvcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0Lm10aW1lLCBEYXRlLnBhcnNlKCcyMDI2LTAxLTE1VDAwOjAwOjAwLjAwMFonKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ucmVzb2x2ZUNhbGxzLmxlbmd0aCwgMSwgJ3Jlc291cmNlUmVzb2x2ZSB3YXMgY2FsbGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXQgZG9lcyBub3QgbWFyayByZXNvbHZlZCBmaWxlcyByZWFkb25seSBzbyB0aGV5IHJlbWFpbiBlZGl0YWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbm5lY3Rpb24ubmV4dFJlc29sdmVSZXN1bHQgPSB7IHVyaTogJycsIHR5cGU6IFJlc291cmNlVHlwZS5GaWxlLCBzaXplOiAxMCwgbXRpbWU6ICcyMDI2LTAxLTE1VDAwOjAwOjAwLjAwMFonIH07XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9zb21lL2ZpbGUudHMnKTtcblxuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBwcm92aWRlci5zdGF0KHdyYXBwZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXQucGVybWlzc2lvbnMgPz8gMCwgMCwgJ3Jlc29sdmVkIGZpbGVzIG11c3Qgbm90IGNhcnJ5IHRoZSBSZWFkb25seSBwZXJtaXNzaW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWxwYXRoIHJlLWVuY29kZXMgdGhlIGNvbm5lY3Rpb24gY2Fub25pY2FsIFVSSSBiYWNrIGludG8gcHJvdmlkZXIgc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHQvLyBTaW11bGF0ZSBhIHN5bWxpbms6IHRoZSByZXNvbHZlIHJlcG9ydHMgYSBjYW5vbmljYWwgdGFyZ2V0IHRoYXRcblx0XHQvLyBkaWZmZXJzIGZyb20gdGhlIHJlcXVlc3RlZCBwYXRoLlxuXHRcdGNvbm5lY3Rpb24ucmVzb3VyY2VSZXNvbHZlID0gYXN5bmMgKHBhcmFtczogUmVzb3VyY2VSZXNvbHZlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVJlc29sdmVSZXN1bHQ+ID0+IHtcblx0XHRcdGNvbm5lY3Rpb24ucmVzb2x2ZUNhbGxzLnB1c2gocGFyYW1zKTtcblx0XHRcdHJldHVybiB7IHVyaTogJ2ZpbGU6Ly8vcmVhbC90YXJnZXQudHMnLCB0eXBlOiBSZXNvdXJjZVR5cGUuRmlsZSB9O1xuXHRcdH07XG5cdFx0Y29uc3Qgd3JhcHBlZCA9IGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9saW5rL3NvdXJjZS50cycpO1xuXG5cdFx0Y29uc3QgcmVhbCA9IGF3YWl0IHByb3ZpZGVyLnJlYWxwYXRoKHdyYXBwZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWwsIGFnZW50SG9zdFVyaSgncmVtb3RlJywgJy9yZWFsL3RhcmdldC50cycpLnBhdGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLnJlc29sdmVDYWxscy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdta2RpciBkZWxlZ2F0ZXMgdG8gcmVzb3VyY2VNa2RpcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvbmV3L2RpcicpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIubWtkaXIod3JhcHBlZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5ta2RpckNhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24ubWtkaXJDYWxsc1swXS51cmksIGZyb21BZ2VudEhvc3RVcmkod3JhcHBlZCkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcHkgZGVsZWdhdGVzIHRvIHJlc291cmNlQ29weSB3aXRoIG92ZXJ3cml0ZSBtYXBwZWQgdG8gIWZhaWxJZkV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBjb25uZWN0aW9uIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGZyb20gPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvYScpO1xuXHRcdGNvbnN0IHRvID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL2InKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLmNvcHkoZnJvbSwgdG8sIHsgb3ZlcndyaXRlOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmNvcHlDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLmNvcHlDYWxsc1swXS5zb3VyY2UsIGZyb21BZ2VudEhvc3RVcmkoZnJvbSkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbm5lY3Rpb24uY29weUNhbGxzWzBdLmRlc3RpbmF0aW9uLCBmcm9tQWdlbnRIb3N0VXJpKHRvKS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi5jb3B5Q2FsbHNbMF0uZmFpbElmRXhpc3RzLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2ggc3RhcnRzIHdhdGNoUmVzb3VyY2UsIGZvcndhcmRzIGNoYW5nZXMgdG8gb25EaWRDaGFuZ2VGaWxlLCBkaXNwb3NlIHRlYXJzIGRvd24gaGFuZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGNvbm5lY3Rpb24gfSA9IHNldHVwKCk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpO1xuXHRcdGxldCBoYW5kbGVEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGNvbm5lY3Rpb24ubmV4dFdhdGNoSGFuZGxlID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyBoYW5kbGVEaXNwb3NlZCA9IHRydWU7IG9uRGlkQ2hhbmdlLmRpc3Bvc2UoKTsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvd2F0Y2hlZCcpO1xuXG5cdFx0Y29uc3QgcmVjZWl2ZWQ6IElGaWxlQ2hhbmdlW11bXSA9IFtdO1xuXHRcdGNvbnN0IHN1YiA9IHByb3ZpZGVyLm9uRGlkQ2hhbmdlRmlsZShjID0+IHJlY2VpdmVkLnB1c2goWy4uLmNdKSk7XG5cblx0XHRjb25zdCB3YXRjaERpc3Bvc2FibGUgPSBwcm92aWRlci53YXRjaCh3cmFwcGVkLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZXhjbHVkZXM6IFsnKiovbm9kZV9tb2R1bGVzLyoqJ10gfSk7XG5cblx0XHQvLyBXYWl0IG9uZSBtaWNyb3Rhc2sgdGljayBzbyB0aGUgYXN5bmMgd2F0Y2hSZXNvdXJjZSByZXNvbHZlcy5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHF1ZXVlTWljcm90YXNrKHJlc29sdmUpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb25uZWN0aW9uLndhdGNoQ2FsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi53YXRjaENhbGxzWzBdLnJlY3Vyc2l2ZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25uZWN0aW9uLndhdGNoQ2FsbHNbMF0uZXhjbHVkZXMsIHsgaXRlbXM6IFsnKiovbm9kZV9tb2R1bGVzLyoqJ10gfSk7XG5cblx0XHQvLyBXaGVuIHdhdGNoUmVzb3VyY2UgcmVwb3J0cyBjaGFuZ2VzIGZyb20gdGhlIHVuZGVybHlpbmcgZmlsZXN5c3RlbSxcblx0XHQvLyB0aGV5IGNvbWUgYmFjayB3aXRoIGZpbGU6Ly8gVVJJcy4gVGhlIHByb3ZpZGVyIHJlLWVuY29kZXMgdGhlbSB3aXRoXG5cdFx0Ly8gdGhlIGFnZW50IGhvc3QgYXV0aG9yaXR5LlxuXHRcdGNvbnN0IGluY29taW5nQ2hhbmdlOiBJRmlsZUNoYW5nZSA9IHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy93YXRjaGVkL2EudHh0JyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfTtcblx0XHRjb25zdCBleHBlY3RlZENoYW5nZTogSUZpbGVDaGFuZ2UgPSB7IHJlc291cmNlOiB0b0FnZW50SG9zdFVyaShVUkkucGFyc2UoJ2ZpbGU6Ly8vd2F0Y2hlZC9hLnR4dCcpLCAncmVtb3RlJyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfTtcblx0XHRvbkRpZENoYW5nZS5maXJlKFtpbmNvbWluZ0NoYW5nZV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZCwgW1tleHBlY3RlZENoYW5nZV1dKTtcblxuXHRcdHdhdGNoRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhhbmRsZURpc3Bvc2VkLCB0cnVlLCAndW5kZXJseWluZyBoYW5kbGUgc2hvdWxkIGJlIGRpc3Bvc2VkIHdoZW4gd3JhcHBlciBpcyBkaXNwb3NlZCcpO1xuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIGZvcndhcmRzIGluY2x1ZGVzIHBhdHRlcm5zIHRvIHdhdGNoUmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCk7XG5cdFx0Y29ubmVjdGlvbi5uZXh0V2F0Y2hIYW5kbGUgPSB7XG5cdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBvbkRpZENoYW5nZS5kaXNwb3NlKCksXG5cdFx0fTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL3dhdGNoZWQnKTtcblxuXHRcdGNvbnN0IHdhdGNoRGlzcG9zYWJsZSA9IHByb3ZpZGVyLndhdGNoKHdyYXBwZWQsIHtcblx0XHRcdHJlY3Vyc2l2ZTogZmFsc2UsXG5cdFx0XHRleGNsdWRlczogW10sXG5cdFx0XHRpbmNsdWRlczogWycqKi8qLnRzJywgeyBiYXNlOiAnL3dhdGNoZWQnLCBwYXR0ZXJuOiAnKiovKi5tZCcgfV0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHF1ZXVlTWljcm90YXNrKHJlc29sdmUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbm5lY3Rpb24ud2F0Y2hDYWxsc1swXS5pbmNsdWRlcywgeyBpdGVtczogWycqKi8qLnRzJywgJyoqLyoubWQnXSB9KTtcblxuXHRcdHdhdGNoRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIHNldHVwIGZhaWx1cmVzIGFyZSBzdXJmYWNlZCBvbiBvbkRpZFdhdGNoRXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25uZWN0aW9uLndhdGNoRXJyb3IgPSBuZXcgRXJyb3IoJ3dhdGNoIHNldHVwIGZhaWxlZCcpO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvd2F0Y2hlZCcpO1xuXG5cdFx0Y29uc3QgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHN1YiA9IHByb3ZpZGVyLm9uRGlkV2F0Y2hFcnJvcihtZXNzYWdlID0+IGVycm9ycy5wdXNoKG1lc3NhZ2UpKTtcblxuXHRcdGNvbnN0IHdhdGNoRGlzcG9zYWJsZSA9IHByb3ZpZGVyLndhdGNoKHdyYXBwZWQsIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdC8vIFlpZWxkIHVudGlsIHRoZSB3YXRjaCdzIGFzeW5jIGNoYWluIChhY3F1aXJlIGNvbm5lY3Rpb24gXHUyMTkyXG5cdFx0Ly8gd2F0Y2hSZXNvdXJjZSBcdTIxOTIgZXJyb3IgcHJvcGFnYXRpb24pIHNldHRsZXMuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXJyb3JzLCBbJ3dhdGNoIHNldHVwIGZhaWxlZCddKTtcblxuXHRcdHdhdGNoRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnd2F0Y2ggZGlzcG9zZWQgYmVmb3JlIGFzeW5jIHNldHVwIGNvbXBsZXRlcyBzdGlsbCB0ZWFycyBkb3duIHRoZSBoYW5kbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgY29ubmVjdGlvbiB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCk7XG5cdFx0bGV0IGhhbmRsZURpc3Bvc2VkID0gZmFsc2U7XG5cdFx0bGV0IGhhbmRsZUNyZWF0ZWQgPSBmYWxzZTtcblx0XHRjb25uZWN0aW9uLm5leHRXYXRjaEhhbmRsZSA9IHtcblx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZS5ldmVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgaGFuZGxlRGlzcG9zZWQgPSB0cnVlOyBvbkRpZENoYW5nZS5kaXNwb3NlKCk7IH0sXG5cdFx0fTtcblx0XHQvLyBEZWZlciB0aGUgd2F0Y2hSZXNvdXJjZSByZXNvbHV0aW9uIHNvIHdlIGNhbiBkaXNwb3NlIGJldHdlZW5cblx0XHQvLyBgd2F0Y2goKWAgcmV0dXJuaW5nIGFuZCB0aGUgaGFuZGxlIGJlaW5nIGFzc2lnbmVkLlxuXHRcdGNvbnN0IG9yaWdpbmFsV2F0Y2hSZXNvdXJjZSA9IGNvbm5lY3Rpb24ud2F0Y2hSZXNvdXJjZS5iaW5kKGNvbm5lY3Rpb24pO1xuXHRcdGNvbm5lY3Rpb24ud2F0Y2hSZXNvdXJjZSA9IGFzeW5jIHBhcmFtcyA9PiB7XG5cdFx0XHRoYW5kbGVDcmVhdGVkID0gdHJ1ZTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWxXYXRjaFJlc291cmNlKHBhcmFtcyk7XG5cdFx0fTtcblx0XHRjb25zdCB3cmFwcGVkID0gYWdlbnRIb3N0VXJpKCdyZW1vdGUnLCAnL3dhdGNoZWQnKTtcblxuXHRcdGNvbnN0IHdhdGNoRGlzcG9zYWJsZSA9IHByb3ZpZGVyLndhdGNoKHdyYXBwZWQsIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pO1xuXHRcdC8vIFlpZWxkIHVudGlsIHdhdGNoUmVzb3VyY2UgaGFzIGJlZ3VuIChzbyBhIGhhbmRsZSBpcyBpbiBmbGlnaHQpLFxuXHRcdC8vIHRoZW4gZGlzcG9zZSBiZWZvcmUgaXQgcmVzb2x2ZXMuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlQ3JlYXRlZCwgdHJ1ZSk7XG5cdFx0d2F0Y2hEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFuZGxlRGlzcG9zZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaCByZWF0dGFjaGVzIHRvIHRoZSBuZXh0IGNvbm5lY3Rpb24gcmVnaXN0ZXJlZCBmb3IgdGhlIGF1dGhvcml0eSBhZnRlciBkaXNjb25uZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RGaWxlU3lzdGVtUHJvdmlkZXIoMjApKTtcblx0XHRjb25zdCBmaXJzdCA9IG5ldyBGdWxsQ29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGZpcnN0Q2hhbmdlcyA9IG5ldyBFbWl0dGVyPHJlYWRvbmx5IElGaWxlQ2hhbmdlW10+KCk7XG5cdFx0bGV0IGZpcnN0SGFuZGxlRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRmaXJzdC5uZXh0V2F0Y2hIYW5kbGUgPSB7XG5cdFx0XHRvbkRpZENoYW5nZTogZmlyc3RDaGFuZ2VzLmV2ZW50LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyBmaXJzdEhhbmRsZURpc3Bvc2VkID0gdHJ1ZTsgZmlyc3RDaGFuZ2VzLmRpc3Bvc2UoKTsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGZpcnN0UmVnID0gcHJvdmlkZXIucmVnaXN0ZXJBdXRob3JpdHkoJ3JlbW90ZScsIGZpcnN0KTtcblxuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ3JlbW90ZScsICcvd2F0Y2hlZCcpO1xuXHRcdGNvbnN0IHJlY2VpdmVkOiBJRmlsZUNoYW5nZVtdW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VGaWxlKGMgPT4gcmVjZWl2ZWQucHVzaChbLi4uY10pKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLndhdGNoKHdyYXBwZWQsIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRmaXJzdENoYW5nZXMuZmlyZShbeyByZXNvdXJjZTogVVJJLmZpbGUoJy93YXRjaGVkL2EudHh0JyksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlLlVQREFURUQgfV0pO1xuXG5cdFx0Ly8gRGlzY29ubmVjdDogYSByZS1yZWdpc3RyYXRpb24gYXJyaXZlcyB3aXRoaW4gdGhlIGdyYWNlIHdpbmRvdy5cblx0XHQvLyBUaGUgd2F0Y2hlciBtdXN0IGRpc3Bvc2UgdGhlIG9sZCBoYW5kbGUgYW5kIGF0dGFjaCB0byB0aGUgbmV3XG5cdFx0Ly8gY29ubmVjdGlvbiB3aXRob3V0IHRoZSBjYWxsZXIgZG9pbmcgYW55dGhpbmcuXG5cdFx0Zmlyc3RSZWcuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG5ldyBGdWxsQ29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IHNlY29uZENoYW5nZXMgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpO1xuXHRcdGxldCBzZWNvbmRIYW5kbGVEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdHNlY29uZC5uZXh0V2F0Y2hIYW5kbGUgPSB7XG5cdFx0XHRvbkRpZENoYW5nZTogc2Vjb25kQ2hhbmdlcy5ldmVudCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgc2Vjb25kSGFuZGxlRGlzcG9zZWQgPSB0cnVlOyBzZWNvbmRDaGFuZ2VzLmRpc3Bvc2UoKTsgfSxcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgncmVtb3RlJywgc2Vjb25kKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0c2Vjb25kQ2hhbmdlcy5maXJlKFt7IHJlc291cmNlOiBVUkkuZmlsZSgnL3dhdGNoZWQvYi50eHQnKSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaXJzdFdhdGNoQ2FsbHM6IGZpcnN0LndhdGNoQ2FsbHMubGVuZ3RoLFxuXHRcdFx0c2Vjb25kV2F0Y2hDYWxsczogc2Vjb25kLndhdGNoQ2FsbHMubGVuZ3RoLFxuXHRcdFx0Zmlyc3RIYW5kbGVEaXNwb3NlZCxcblx0XHRcdHNlY29uZEhhbmRsZURpc3Bvc2VkLFxuXHRcdFx0cmVjZWl2ZWQ6IHJlY2VpdmVkLm1hcChiYXRjaCA9PiBiYXRjaC5tYXAoYyA9PiBbYy5yZXNvdXJjZS50b1N0cmluZygpLCBjLnR5cGVdKSksXG5cdFx0fSwge1xuXHRcdFx0Zmlyc3RXYXRjaENhbGxzOiAxLFxuXHRcdFx0c2Vjb25kV2F0Y2hDYWxsczogMSxcblx0XHRcdGZpcnN0SGFuZGxlRGlzcG9zZWQ6IHRydWUsXG5cdFx0XHRzZWNvbmRIYW5kbGVEaXNwb3NlZDogZmFsc2UsXG5cdFx0XHRyZWNlaXZlZDogW1xuXHRcdFx0XHRbW2FnZW50SG9zdFVyaSgncmVtb3RlJywgJy93YXRjaGVkL2EudHh0JykudG9TdHJpbmcoKSwgRmlsZUNoYW5nZVR5cGUuVVBEQVRFRF1dLFxuXHRcdFx0XHRbW2FnZW50SG9zdFVyaSgncmVtb3RlJywgJy93YXRjaGVkL2IudHh0JykudG9TdHJpbmcoKSwgRmlsZUNoYW5nZVR5cGUuQURERURdXSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoIGF0dGFjaGVzIHRvIGEgZnJlc2hseS1yZWdpc3RlcmVkIGF1dGhvcml0eSB0aGF0IGRpZCBub3QgZXhpc3Qgd2hlbiB3YXRjaCgpIHdhcyBjYWxsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdEZpbGVTeXN0ZW1Qcm92aWRlcigyMCkpO1xuXHRcdGNvbnN0IHdyYXBwZWQgPSBhZ2VudEhvc3RVcmkoJ25ldmVyLXJlZ2lzdGVyZWQnLCAnL3BhdGgnKTtcblxuXHRcdGNvbnN0IHJlY2VpdmVkOiBJRmlsZUNoYW5nZVtdW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VGaWxlKGMgPT4gcmVjZWl2ZWQucHVzaChbLi4uY10pKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLndhdGNoKHdyYXBwZWQsIHsgcmVjdXJzaXZlOiBmYWxzZSwgZXhjbHVkZXM6IFtdIH0pKTtcblxuXHRcdC8vIE5vIGF1dGhvcml0eSByZWdpc3RlcmVkIHlldCBcdTIwMTQgbm90aGluZyB0byBhdHRhY2ggdG8uIFdhaXQgbG9uZ1xuXHRcdC8vIGVub3VnaCB0aGF0IHRoZSBncmFjZSB0aW1lciAoaWYgYW55IHdlcmUgcnVubmluZykgd291bGQgZXhwaXJlLlxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA0MCkpO1xuXG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IG5ldyBGdWxsQ29ubmVjdGlvbigpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBuZXcgRW1pdHRlcjxyZWFkb25seSBJRmlsZUNoYW5nZVtdPigpO1xuXHRcdGNvbm5lY3Rpb24ubmV4dFdhdGNoSGFuZGxlID0ge1xuXHRcdFx0b25EaWRDaGFuZ2U6IGNoYW5nZXMuZXZlbnQsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBjaGFuZ2VzLmRpc3Bvc2UoKSxcblx0XHR9O1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5yZWdpc3RlckF1dGhvcml0eSgnbmV2ZXItcmVnaXN0ZXJlZCcsIGNvbm5lY3Rpb24pKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjaGFuZ2VzLmZpcmUoW3sgcmVzb3VyY2U6IFVSSS5maWxlKCcvcGF0aC9sYXRlLnR4dCcpLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5BRERFRCB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdGlvbi53YXRjaENhbGxzLmxlbmd0aCwgMSwgJ3dhdGNoIGF0dGFjaGVkIGFmdGVyIGxhdGUgcmVnaXN0cmF0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpdmVkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpdmVkWzBdWzBdLnJlc291cmNlLnRvU3RyaW5nKCksIGFnZW50SG9zdFVyaSgnbmV2ZXItcmVnaXN0ZXJlZCcsICcvcGF0aC9sYXRlLnR4dCcpLnRvU3RyaW5nKCkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQiw2QkFBNkIsVUFBdUIscUNBQXFDO0FBQ2xILFNBQVMsNkJBQTZCLHFCQUFxQixvQkFBc0Q7QUFDakgsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyw0QkFBNEIsbUJBQW1CLG9CQUFvQixrQkFBa0Isc0JBQXNCO0FBQ3BILFNBQVMsaUJBQWlCLG9CQUF5UTtBQUNuUyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUUvQixNQUFNLDZDQUE2QyxNQUFNO0FBRXhELDBDQUF3QztBQUV4QyxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFVBQU0sTUFBTSxhQUFhLGFBQWEsb0JBQW9CO0FBQzFELFdBQU8sWUFBWSxJQUFJLFFBQVEsaUJBQWlCO0FBQ2hELFdBQU8sWUFBWSxJQUFJLFdBQVcsV0FBVztBQUU3QyxXQUFPLEdBQUcsSUFBSSxLQUFLLFNBQVMsb0JBQW9CLENBQUM7QUFBQSxFQUNsRCxDQUFDO0FBRUQsT0FBSyxrREFBa0QsTUFBTTtBQUM1RCxVQUFNLE1BQU0sYUFBYSxRQUFRLFlBQVk7QUFDN0MsV0FBTyxZQUFZLG9CQUFvQixHQUFHLEdBQUcsWUFBWTtBQUFBLEVBQzFELENBQUM7QUFFRCxPQUFLLHFEQUFxRCxN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
