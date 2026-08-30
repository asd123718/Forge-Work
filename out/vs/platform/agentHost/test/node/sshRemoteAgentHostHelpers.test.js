import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION } from "../../common/agentHostEndpointRegistry.js";
import {
  buildAgentEndpointsCommand,
  buildAgentHostBaseCommand,
  buildAgentHostSpawnCommand,
  buildAgentRelayCommand,
  buildCLIDownloadUrl,
  buildCleanupOldCLIsCommand,
  buildFindFallbackCLICommand,
  filterLiveAgentHostEndpoints,
  findNewAgentHostEndpoint,
  getRemoteCLIArchiveName,
  getRemoteCLIBin,
  getRemoteCLIDataDir,
  getRemoteCLIInstallRoot,
  isValidFallbackCLIPath,
  parseAgentEndpointsOutput,
  redactToken,
  resolveRemotePlatform,
  runAgentEndpoints,
  shellEscape,
  validateCommit,
  validateShellToken,
  waitForNewStandaloneEndpoint
} from "../../node/sshRemoteAgentHostHelpers.js";
suite("SSH Remote Agent Host Helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeEndpoint(overrides) {
    return {
      schemaVersion: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
      protocolVersion: "1.0.0",
      connectionToken: "tok",
      endpoint: { type: "tcp", host: "127.0.0.1", port: 8080 },
      // The shared schema-v2 parser always spreads `quality`/`tunnelName`
      // explicitly (even when absent from the input), so default them here
      // too to keep deepStrictEqual comparisons against parser output exact.
      quality: void 0,
      tunnelName: void 0,
      ...overrides
    };
  }
  suite("validateShellToken", () => {
    test("accepts alphanumeric strings", () => {
      assert.strictEqual(validateShellToken("insider", "quality"), "insider");
      assert.strictEqual(validateShellToken("stable", "quality"), "stable");
      assert.strictEqual(validateShellToken("exploration", "quality"), "exploration");
    });
    test("accepts dots, dashes, and underscores", () => {
      assert.strictEqual(validateShellToken("my-build_1.0", "quality"), "my-build_1.0");
    });
    test("rejects strings with spaces", () => {
      assert.throws(() => validateShellToken("foo bar", "quality"), /Unsafe quality/);
    });
    test("rejects strings with shell metacharacters", () => {
      assert.throws(() => validateShellToken("foo;rm -rf /", "quality"), /Unsafe quality/);
      assert.throws(() => validateShellToken("$(whoami)", "quality"), /Unsafe quality/);
      assert.throws(() => validateShellToken("foo'bar", "quality"), /Unsafe quality/);
    });
    test("rejects empty string", () => {
      assert.throws(() => validateShellToken("", "quality"), /Unsafe quality/);
    });
  });
  suite("validateCommit", () => {
    test("accepts a 40-char lowercase hex SHA", () => {
      const c = "abcdef0123456789abcdef0123456789abcdef01";
      assert.strictEqual(validateCommit(c), c);
    });
    test("normalizes uppercase hex to lowercase", () => {
      assert.strictEqual(
        validateCommit("ABCDEF0123456789ABCDEF0123456789ABCDEF01"),
        "abcdef0123456789abcdef0123456789abcdef01"
      );
    });
    test("rejects non-hex characters", () => {
      assert.throws(() => validateCommit("g".repeat(40)), /Unsafe commit/);
      assert.throws(() => validateCommit("abcdef0123456789abcdef0123456789abcdef0z"), /Unsafe commit/);
    });
    test("rejects wrong-length values", () => {
      assert.throws(() => validateCommit("abc"), /Unsafe commit/);
      assert.throws(() => validateCommit("a".repeat(41)), /Unsafe commit/);
      assert.throws(() => validateCommit(""), /Unsafe commit/);
    });
    test("rejects shell metacharacters", () => {
      assert.throws(() => validateCommit("foo;rm"), /Unsafe commit/);
      assert.throws(() => validateCommit("a".repeat(39) + "$"), /Unsafe commit/);
    });
  });
  suite("getRemoteCLIArchiveName", () => {
    test("returns code for stable", () => {
      assert.strictEqual(getRemoteCLIArchiveName("stable"), "code");
    });
    test("returns code-insiders for insider", () => {
      assert.strictEqual(getRemoteCLIArchiveName("insider"), "code-insiders");
    });
    test("returns code-exploration for exploration", () => {
      assert.strictEqual(getRemoteCLIArchiveName("exploration"), "code-exploration");
    });
    test("falls back to code-insiders for unknown qualities", () => {
      assert.strictEqual(getRemoteCLIArchiveName("weirdbuild"), "code-insiders");
    });
    test("rejects unsafe quality strings", () => {
      assert.throws(() => getRemoteCLIArchiveName("foo bar"), /Unsafe quality/);
    });
  });
  suite("getRemoteCLIInstallRoot", () => {
    test("returns user-home anchored path under the server data folder", () => {
      assert.strictEqual(getRemoteCLIInstallRoot(".vscode-server-insiders"), "~/.vscode-server-insiders");
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getRemoteCLIInstallRoot("foo bar"), /Unsafe server data folder name/);
      assert.throws(() => getRemoteCLIInstallRoot("foo/bar"), /Unsafe server data folder name/);
      assert.throws(() => getRemoteCLIInstallRoot("$(whoami)"), /Unsafe server data folder name/);
    });
  });
  suite("getRemoteCLIDataDir", () => {
    test("returns the `cli` subdir under the install root", () => {
      assert.strictEqual(getRemoteCLIDataDir(".vscode-server"), "~/.vscode-server/cli");
      assert.strictEqual(getRemoteCLIDataDir(".vscode-server-insiders"), "~/.vscode-server-insiders/cli");
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getRemoteCLIDataDir("foo;rm"), /Unsafe server data folder name/);
    });
  });
  suite("buildAgentHostBaseCommand", () => {
    test("includes --cli-data-dir before the agent host subcommand", () => {
      const cmd = buildAgentHostBaseCommand("~/.vscode-server/code-insiders-abc", "~/.vscode-server/cli");
      assert.strictEqual(cmd, "~/.vscode-server/code-insiders-abc --cli-data-dir ~/.vscode-server/cli agent host --port 0");
    });
  });
  suite("getRemoteCLIBin", () => {
    const commit = "abcdef0123456789abcdef0123456789abcdef01";
    test("returns commit-keyed path under shared install root for stable", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server", "stable", commit),
        `~/.vscode-server/code-${commit}`
      );
    });
    test("returns commit-keyed path for insider", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server-insiders", "insider", commit),
        `~/.vscode-server-insiders/code-insiders-${commit}`
      );
    });
    test("returns commit-keyed path for exploration", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server-exploration", "exploration", commit),
        `~/.vscode-server-exploration/code-exploration-${commit}`
      );
    });
    test("returns non-keyed path when commit is undefined (dev build)", () => {
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server-oss", "insider"),
        "~/.vscode-server-oss/code-insiders"
      );
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server", "stable"),
        "~/.vscode-server/code"
      );
    });
    test("rejects unsafe commit values", () => {
      assert.throws(() => getRemoteCLIBin(".vscode-server", "stable", "foo;rm"), /Unsafe commit/);
    });
    test("normalizes uppercase hex commits to lowercase", () => {
      const upper = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
      assert.strictEqual(
        getRemoteCLIBin(".vscode-server", "stable", upper),
        "~/.vscode-server/code-abcdef0123456789abcdef0123456789abcdef01"
      );
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getRemoteCLIBin("foo bar", "stable", commit), /Unsafe server data folder name/);
    });
  });
  suite("shellEscape", () => {
    test("wraps simple string in single quotes", () => {
      assert.strictEqual(shellEscape("hello"), "'hello'");
    });
    test("escapes embedded single quotes", () => {
      assert.strictEqual(shellEscape("it's"), "'it'\\''s'");
    });
    test("handles empty string", () => {
      assert.strictEqual(shellEscape(""), "''");
    });
    test("passes through special chars safely wrapped", () => {
      assert.strictEqual(shellEscape("$(rm -rf /)"), "'$(rm -rf /)'");
    });
  });
  suite("resolveRemotePlatform", () => {
    test("detects Linux x64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "x86_64"), { os: "linux", arch: "x64" });
    });
    test("detects Linux amd64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "amd64"), { os: "linux", arch: "x64" });
    });
    test("detects Linux arm64 (aarch64)", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "aarch64"), { os: "linux", arch: "arm64" });
    });
    test("detects Linux arm64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "arm64"), { os: "linux", arch: "arm64" });
    });
    test("detects Linux armhf", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Linux", "armv7l"), { os: "linux", arch: "armhf" });
    });
    test("detects Darwin x64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Darwin", "x86_64"), { os: "darwin", arch: "x64" });
    });
    test("detects Darwin arm64", () => {
      assert.deepStrictEqual(resolveRemotePlatform("Darwin", "arm64"), { os: "darwin", arch: "arm64" });
    });
    test("handles whitespace in uname output", () => {
      assert.deepStrictEqual(resolveRemotePlatform("  Linux\n", "  x86_64\n"), { os: "linux", arch: "x64" });
    });
    test("returns undefined for Windows", () => {
      assert.strictEqual(resolveRemotePlatform("MINGW64_NT-10.0-19041", "x86_64"), void 0);
    });
    test("returns undefined for unknown OS", () => {
      assert.strictEqual(resolveRemotePlatform("FreeBSD", "amd64"), void 0);
    });
    test("returns undefined for unknown arch", () => {
      assert.strictEqual(resolveRemotePlatform("Linux", "ppc64le"), void 0);
    });
  });
  suite("buildCLIDownloadUrl", () => {
    const commit = "abcdef0123456789abcdef0123456789abcdef01";
    test("uses `latest` URL when commit is omitted", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("linux", "x64", "insider"),
        "https://update.code.visualstudio.com/latest/cli-linux-x64/insider"
      );
    });
    test("works for darwin arm64 stable (no commit)", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("darwin", "arm64", "stable"),
        "https://update.code.visualstudio.com/latest/cli-darwin-arm64/stable"
      );
    });
    test("pins to commit when provided", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("linux", "x64", "insider", commit),
        `https://update.code.visualstudio.com/commit:${commit}/cli-linux-x64/insider`
      );
    });
    test("pins to commit for darwin arm64 stable", () => {
      assert.strictEqual(
        buildCLIDownloadUrl("darwin", "arm64", "stable", commit),
        `https://update.code.visualstudio.com/commit:${commit}/cli-darwin-arm64/stable`
      );
    });
    test("rejects unsafe commit values", () => {
      assert.throws(() => buildCLIDownloadUrl("linux", "x64", "insider", "foo;rm"), /Unsafe commit/);
    });
    test("normalizes uppercase hex commits to lowercase", () => {
      const upper = "ABCDEF0123456789ABCDEF0123456789ABCDEF01";
      assert.strictEqual(
        buildCLIDownloadUrl("linux", "x64", "insider", upper),
        `https://update.code.visualstudio.com/commit:abcdef0123456789abcdef0123456789abcdef01/cli-linux-x64/insider`
      );
    });
  });
  suite("buildCleanupOldCLIsCommand", () => {
    test("produces a snippet that keeps the 5 most recent commit-keyed CLIs for insider", () => {
      const cmd = buildCleanupOldCLIsCommand(".vscode-server-insiders", "insider");
      assert.ok(cmd.includes("~/.vscode-server-insiders/code-insiders-"), `cmd missing install path: ${cmd}`);
      assert.ok(/(\[0-9a-f\]){40}/.test(cmd), "cmd should match exactly 40 hex chars");
      assert.ok(/ls -1t/.test(cmd), `cmd should sort by mtime: ${cmd}`);
      assert.ok(/awk\s+'NR>5'/.test(cmd), `cmd should keep 5: ${cmd}`);
      assert.ok(/xargs\s+-I\{\}\s+rm\s+-f\s+--/.test(cmd), `cmd should rm safely: ${cmd}`);
    });
    test("uses `code-` archive name for stable", () => {
      const cmd = buildCleanupOldCLIsCommand(".vscode-server", "stable");
      assert.ok(cmd.includes("~/.vscode-server/code-[0-9a-f]"), `cmd should target stable archive: ${cmd}`);
      assert.ok(!cmd.includes("code-insiders-"), "stable cmd should not mention insiders archive");
    });
    test("rejects unsafe inputs", () => {
      assert.throws(() => buildCleanupOldCLIsCommand("foo bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => buildCleanupOldCLIsCommand(".vscode-server", "foo bar"), /Unsafe quality/);
    });
  });
  suite("buildFindFallbackCLICommand", () => {
    test("lists commit-keyed candidates then legacy paths for insider", () => {
      const cmd = buildFindFallbackCLICommand(".vscode-server-insiders", "insider");
      assert.ok(cmd.includes("~/.vscode-server-insiders/code-insiders-"), `cmd missing new path: ${cmd}`);
      assert.ok(/ls -1t/.test(cmd), "should sort commit-keyed candidates by mtime");
      assert.ok(cmd.includes("~/.vscode-cli-insider/code-insiders"), `cmd missing legacy path: ${cmd}`);
    });
    test("uses no-suffix legacy dir for stable", () => {
      const cmd = buildFindFallbackCLICommand(".vscode-server", "stable");
      assert.ok(cmd.includes("~/.vscode-cli/code"), `cmd missing stable legacy path: ${cmd}`);
      assert.ok(!cmd.includes(".vscode-cli-stable"), "stable should not get the -<quality> suffix");
    });
    test("rejects unsafe inputs", () => {
      assert.throws(() => buildFindFallbackCLICommand("foo bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => buildFindFallbackCLICommand(".vscode-server", "foo bar"), /Unsafe quality/);
    });
  });
  suite("isValidFallbackCLIPath", () => {
    const sdf = ".vscode-server-insiders";
    const q = "insider";
    const hex = "0123456789abcdef0123456789abcdef01234567";
    test("accepts commit-keyed path under the shared install root", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}`, sdf, q), true);
    });
    test("accepts legacy ~/.vscode-cli-<quality>/<archive> path for insider", () => {
      assert.strictEqual(isValidFallbackCLIPath("~/.vscode-cli-insider/code-insiders", sdf, q), true);
    });
    test("accepts legacy ~/.vscode-cli/code path for stable", () => {
      assert.strictEqual(isValidFallbackCLIPath("~/.vscode-cli/code", ".vscode-server", "stable"), true);
    });
    test("rejects commit suffix with non-hex characters", () => {
      const notHex = "g".repeat(40);
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${notHex}`, sdf, q), false);
    });
    test("rejects commit suffix with wrong length", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex.slice(0, 39)}`, sdf, q), false);
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}a`, sdf, q), false);
    });
    test("rejects paths under an unexpected root", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/.something-else/code-insiders-${hex}`, sdf, q), false);
    });
    test("rejects empty input", () => {
      assert.strictEqual(isValidFallbackCLIPath("", sdf, q), false);
    });
    test("rejects shell metacharacters", () => {
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex}; rm -rf /`, sdf, q), false);
      assert.strictEqual(isValidFallbackCLIPath(`~/${sdf}/code-insiders-${hex} && evil`, sdf, q), false);
    });
  });
  suite("redactToken", () => {
    test("redacts token in WebSocket URL", () => {
      assert.strictEqual(
        redactToken("ws://127.0.0.1:12345?tkn=secret123"),
        "ws://127.0.0.1:12345?tkn=***"
      );
    });
    test("redacts token with following whitespace", () => {
      assert.strictEqual(
        redactToken("ws://127.0.0.1:12345?tkn=abc123 done"),
        "ws://127.0.0.1:12345?tkn=*** done"
      );
    });
    test("preserves text without tokens", () => {
      assert.strictEqual(redactToken("no token here"), "no token here");
    });
    test("redacts multiple tokens", () => {
      assert.strictEqual(
        redactToken("?tkn=one and ?tkn=two"),
        "?tkn=*** and ?tkn=***"
      );
    });
  });
  suite("buildAgentEndpointsCommand", () => {
    test("omits --user-data-dir when not yet known", () => {
      assert.strictEqual(
        buildAgentEndpointsCommand("~/.vscode-server/code", "~/.vscode-server/cli"),
        "~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent endpoints"
      );
    });
    test("includes --user-data-dir once resolved", () => {
      assert.strictEqual(
        buildAgentEndpointsCommand("~/.vscode-server/code", "~/.vscode-server/cli", "/home/user/.vscode-remote"),
        "~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent endpoints --user-data-dir '/home/user/.vscode-remote'"
      );
    });
  });
  suite("buildAgentHostSpawnCommand", () => {
    test("includes --new-instance, --user-data-dir and default --idle-timeout", () => {
      assert.strictEqual(
        buildAgentHostSpawnCommand("~/.vscode-server/code", "~/.vscode-server/cli", "/home/user/.vscode-remote"),
        "~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent host --port 0 --new-instance --user-data-dir '/home/user/.vscode-remote' --idle-timeout 300"
      );
    });
    test("honors a custom idle timeout", () => {
      assert.strictEqual(
        buildAgentHostSpawnCommand("~/.vscode-server/code", "~/.vscode-server/cli", "/home/user/.vscode-remote", 60),
        "~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent host --port 0 --new-instance --user-data-dir '/home/user/.vscode-remote' --idle-timeout 60"
      );
    });
    test("rejects unsafe idle timeout values", () => {
      assert.throws(() => buildAgentHostSpawnCommand("~/.vscode-server/code", "~/.vscode-server/cli", "/x", 0), /Unsafe idle timeout/);
      assert.throws(() => buildAgentHostSpawnCommand("~/.vscode-server/code", "~/.vscode-server/cli", "/x", -1), /Unsafe idle timeout/);
      assert.throws(() => buildAgentHostSpawnCommand("~/.vscode-server/code", "~/.vscode-server/cli", "/x", 1.5), /Unsafe idle timeout/);
    });
    test("always includes --new-instance so an existing standalone is never silently reused", () => {
      const cmd = buildAgentHostSpawnCommand("~/.vscode-server/code", "~/.vscode-server/cli", "/x");
      assert.ok(cmd.includes(" --new-instance "), "spawn command must request a genuinely new instance, not reuse an existing standalone");
    });
  });
  suite("buildAgentRelayCommand", () => {
    test("builds a relay command scoped to the exact instanceId", () => {
      assert.strictEqual(
        buildAgentRelayCommand("~/.vscode-server/code", "~/.vscode-server/cli", "abc-123", "/home/user/.vscode-remote"),
        "~/.vscode-server/code --cli-data-dir ~/.vscode-server/cli agent relay 'abc-123' --user-data-dir '/home/user/.vscode-remote'"
      );
    });
  });
  suite("parseAgentEndpointsOutput", () => {
    test("returns undefined for empty output", () => {
      assert.strictEqual(parseAgentEndpointsOutput(""), void 0);
      assert.strictEqual(parseAgentEndpointsOutput("   \n"), void 0);
    });
    test("returns undefined for invalid JSON", () => {
      assert.strictEqual(parseAgentEndpointsOutput("not json"), void 0);
    });
    test("returns undefined when the envelope is missing userDataPath/endpoints", () => {
      assert.strictEqual(parseAgentEndpointsOutput(JSON.stringify({ endpoints: [] })), void 0);
      assert.strictEqual(parseAgentEndpointsOutput(JSON.stringify({ userDataPath: "/x" })), void 0);
    });
    test("parses a well-formed envelope and validates each endpoint", () => {
      const endpoint = makeEndpoint({ type: "standalone", pid: 111, instanceId: "i1" });
      const result = parseAgentEndpointsOutput(JSON.stringify({ userDataPath: "/home/user/.vscode-remote", endpoints: [endpoint] }));
      assert.ok(result);
      assert.strictEqual(result.userDataPath, "/home/user/.vscode-remote");
      assert.deepStrictEqual(result.endpoints, [endpoint]);
    });
    test("drops malformed individual endpoint entries without failing the whole parse", () => {
      const good = makeEndpoint({ type: "editor", pid: 222, instanceId: "i2" });
      const result = parseAgentEndpointsOutput(JSON.stringify({ userDataPath: "/x", endpoints: [good, { garbage: true }] }));
      assert.ok(result);
      assert.deepStrictEqual(result.endpoints, [good]);
    });
  });
  suite("runAgentEndpoints", () => {
    test("parses stdout on success", async () => {
      const endpoint = makeEndpoint({ type: "standalone", pid: 333, instanceId: "i3" });
      const exec = async () => ({
        stdout: JSON.stringify({ userDataPath: "/home/user/.vscode-remote", endpoints: [endpoint] }),
        stderr: "",
        code: 0
      });
      const result = await runAgentEndpoints(exec, "~/.vscode-server/code", "~/.vscode-server/cli");
      assert.strictEqual(result.userDataPath, "/home/user/.vscode-remote");
      assert.deepStrictEqual(result.endpoints, [endpoint]);
    });
    test("passes the resolved --user-data-dir through to the command", async () => {
      const commands = [];
      const exec = async (command) => {
        commands.push(command);
        return { stdout: JSON.stringify({ userDataPath: "/x", endpoints: [] }), stderr: "", code: 0 };
      };
      await runAgentEndpoints(exec, "~/.vscode-server/code", "~/.vscode-server/cli", "/home/user/.vscode-remote");
      assert.ok(commands.some((c) => c.includes("--user-data-dir '/home/user/.vscode-remote'")));
    });
    test("throws (loudly) when the command exits non-zero", async () => {
      const exec = async () => ({ stdout: "", stderr: "command not found", code: 127 });
      await assert.rejects(
        () => runAgentEndpoints(exec, "~/.vscode-server/code", "~/.vscode-server/cli"),
        /exit code 127.*command not found/s
      );
    });
    test("throws when output cannot be parsed", async () => {
      const exec = async () => ({ stdout: "not json", stderr: "", code: 0 });
      await assert.rejects(
        () => runAgentEndpoints(exec, "~/.vscode-server/code", "~/.vscode-server/cli"),
        /unparsable output \(8 characters\)$/
      );
    });
    test("parses JSON after legacy CLI log output", async () => {
      const output = `[2026-08-06 15:31:19] info Pruning stale local endpoint registry entry
${JSON.stringify({ userDataPath: "/tmp/user-data", endpoints: [] })}`;
      const exec = async () => ({ stdout: output, stderr: "", code: 0 });
      const result = await runAgentEndpoints(exec, "~/.vscode-server/code", "~/.vscode-server/cli");
      assert.deepStrictEqual(result, {
        userDataPath: "/tmp/user-data",
        endpoints: []
      });
    });
  });
  suite("filterLiveAgentHostEndpoints", () => {
    test("keeps only entries whose PID responds to kill -0", async () => {
      const alive = makeEndpoint({ type: "standalone", pid: 100, instanceId: "alive" });
      const dead = makeEndpoint({ type: "standalone", pid: 200, instanceId: "dead" });
      const exec = async (command) => {
        if (command.includes("kill -0 100")) {
          return { stdout: "", stderr: "", code: 0 };
        }
        if (command.includes("kill -0 200")) {
          return { stdout: "", stderr: "", code: 1 };
        }
        throw new Error(`unexpected command: ${command}`);
      };
      const result = await filterLiveAgentHostEndpoints(exec, [alive, dead]);
      assert.deepStrictEqual(result, [alive]);
    });
    test("probes each distinct PID at most once", async () => {
      const first = makeEndpoint({ type: "editor", pid: 100, instanceId: "e1" });
      const second = makeEndpoint({ type: "standalone", pid: 100, instanceId: "e2" });
      let probes = 0;
      const exec = async (command) => {
        if (command.includes("kill -0 100")) {
          probes++;
          return { stdout: "", stderr: "", code: 0 };
        }
        throw new Error(`unexpected command: ${command}`);
      };
      const result = await filterLiveAgentHostEndpoints(exec, [first, second]);
      assert.strictEqual(probes, 1);
      assert.strictEqual(result.length, 2);
    });
    test("returns an empty array for an empty input", async () => {
      const exec = async () => {
        throw new Error("should not be called");
      };
      assert.deepStrictEqual(await filterLiveAgentHostEndpoints(exec, []), []);
    });
  });
  suite("findNewAgentHostEndpoint", () => {
    test('returns the standalone entry present only in "after"', () => {
      const before = [makeEndpoint({ type: "standalone", pid: 1, instanceId: "old" })];
      const spawned = makeEndpoint({ type: "standalone", pid: 2, instanceId: "new" });
      const after = [...before, spawned];
      assert.deepStrictEqual(findNewAgentHostEndpoint(before, after), spawned);
    });
    test("ignores new editor-owned entries (only standalone spawns are matched)", () => {
      const before = [];
      const newEditor = makeEndpoint({ type: "editor", pid: 5, instanceId: "e" });
      assert.strictEqual(findNewAgentHostEndpoint(before, [newEditor]), void 0);
    });
    test("returns undefined when nothing changed", () => {
      const entries = [makeEndpoint({ type: "standalone", pid: 1, instanceId: "same" })];
      assert.strictEqual(findNewAgentHostEndpoint(entries, entries), void 0);
    });
  });
  suite("waitForNewStandaloneEndpoint", () => {
    test("resolves as soon as the new endpoint appears", async () => {
      const before = [makeEndpoint({ type: "standalone", pid: 1, instanceId: "old" })];
      const spawned = makeEndpoint({ type: "standalone", pid: 2, instanceId: "new" });
      let poll = 0;
      const exec = async () => {
        poll++;
        const endpoints = poll < 2 ? before : [...before, spawned];
        return { stdout: JSON.stringify({ userDataPath: "/x", endpoints }), stderr: "", code: 0 };
      };
      const result = await waitForNewStandaloneEndpoint(exec, "~/.vscode-server/code", "~/.vscode-server/cli", "/x", before, { intervalMs: 1 });
      assert.deepStrictEqual(result, spawned);
      assert.ok(poll >= 2);
    });
    test("throws once the attempt budget is exhausted", async () => {
      const before = [makeEndpoint({ type: "standalone", pid: 1, instanceId: "old" })];
      const exec = async () => ({ stdout: JSON.stringify({ userDataPath: "/x", endpoints: before }), stderr: "", code: 0 });
      await assert.rejects(
        () => waitForNewStandaloneEndpoint(exec, "~/.vscode-server/code", "~/.vscode-server/cli", "/x", before, { attempts: 2, intervalMs: 1 }),
        /Timed out waiting/
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzc2hSZW1vdGVBZ2VudEhvc3RIZWxwZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfRU5EUE9JTlRfUkVHSVNUUllfU0NIRU1BX1ZFUlNJT04sIHR5cGUgSUFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0RW5kcG9pbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRidWlsZEFnZW50RW5kcG9pbnRzQ29tbWFuZCxcblx0YnVpbGRBZ2VudEhvc3RCYXNlQ29tbWFuZCxcblx0YnVpbGRBZ2VudEhvc3RTcGF3bkNvbW1hbmQsXG5cdGJ1aWxkQWdlbnRSZWxheUNvbW1hbmQsXG5cdGJ1aWxkQ0xJRG93bmxvYWRVcmwsXG5cdGJ1aWxkQ2xlYW51cE9sZENMSXNDb21tYW5kLFxuXHRidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQsXG5cdGZpbHRlckxpdmVBZ2VudEhvc3RFbmRwb2ludHMsXG5cdGZpbmROZXdBZ2VudEhvc3RFbmRwb2ludCxcblx0Z2V0UmVtb3RlQ0xJQXJjaGl2ZU5hbWUsXG5cdGdldFJlbW90ZUNMSUJpbixcblx0Z2V0UmVtb3RlQ0xJRGF0YURpcixcblx0Z2V0UmVtb3RlQ0xJSW5zdGFsbFJvb3QsXG5cdGlzVmFsaWRGYWxsYmFja0NMSVBhdGgsXG5cdHBhcnNlQWdlbnRFbmRwb2ludHNPdXRwdXQsXG5cdHJlZGFjdFRva2VuLFxuXHRyZXNvbHZlUmVtb3RlUGxhdGZvcm0sXG5cdHJ1bkFnZW50RW5kcG9pbnRzLFxuXHRzaGVsbEVzY2FwZSxcblx0dmFsaWRhdGVDb21taXQsXG5cdHZhbGlkYXRlU2hlbGxUb2tlbixcblx0d2FpdEZvck5ld1N0YW5kYWxvbmVFbmRwb2ludCxcblx0dHlwZSBJU3NoRXhlYyxcbn0gZnJvbSAnLi4vLi4vbm9kZS9zc2hSZW1vdGVBZ2VudEhvc3RIZWxwZXJzLmpzJztcblxuc3VpdGUoJ1NTSCBSZW1vdGUgQWdlbnQgSG9zdCBIZWxwZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VFbmRwb2ludChvdmVycmlkZXM6IFBhcnRpYWw8SUFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGE+ICYgUGljazxJQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSwgJ3R5cGUnIHwgJ3BpZCcgfCAnaW5zdGFuY2VJZCc+KTogSUFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzY2hlbWFWZXJzaW9uOiBBR0VOVF9IT1NUX0VORFBPSU5UX1JFR0lTVFJZX1NDSEVNQV9WRVJTSU9OLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiAnMS4wLjAnLFxuXHRcdFx0Y29ubmVjdGlvblRva2VuOiAndG9rJyxcblx0XHRcdGVuZHBvaW50OiB7IHR5cGU6ICd0Y3AnLCBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogODA4MCB9LFxuXHRcdFx0Ly8gVGhlIHNoYXJlZCBzY2hlbWEtdjIgcGFyc2VyIGFsd2F5cyBzcHJlYWRzIGBxdWFsaXR5YC9gdHVubmVsTmFtZWBcblx0XHRcdC8vIGV4cGxpY2l0bHkgKGV2ZW4gd2hlbiBhYnNlbnQgZnJvbSB0aGUgaW5wdXQpLCBzbyBkZWZhdWx0IHRoZW0gaGVyZVxuXHRcdFx0Ly8gdG9vIHRvIGtlZXAgZGVlcFN0cmljdEVxdWFsIGNvbXBhcmlzb25zIGFnYWluc3QgcGFyc2VyIG91dHB1dCBleGFjdC5cblx0XHRcdHF1YWxpdHk6IHVuZGVmaW5lZCxcblx0XHRcdHR1bm5lbE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9O1xuXHR9XG5cblxuXHRzdWl0ZSgndmFsaWRhdGVTaGVsbFRva2VuJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FjY2VwdHMgYWxwaGFudW1lcmljIHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsaWRhdGVTaGVsbFRva2VuKCdpbnNpZGVyJywgJ3F1YWxpdHknKSwgJ2luc2lkZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWxpZGF0ZVNoZWxsVG9rZW4oJ3N0YWJsZScsICdxdWFsaXR5JyksICdzdGFibGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWxpZGF0ZVNoZWxsVG9rZW4oJ2V4cGxvcmF0aW9uJywgJ3F1YWxpdHknKSwgJ2V4cGxvcmF0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhY2NlcHRzIGRvdHMsIGRhc2hlcywgYW5kIHVuZGVyc2NvcmVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbGlkYXRlU2hlbGxUb2tlbignbXktYnVpbGRfMS4wJywgJ3F1YWxpdHknKSwgJ215LWJ1aWxkXzEuMCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBzdHJpbmdzIHdpdGggc3BhY2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJ2ZvbyBiYXInLCAncXVhbGl0eScpLCAvVW5zYWZlIHF1YWxpdHkvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgc3RyaW5ncyB3aXRoIHNoZWxsIG1ldGFjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJ2ZvbztybSAtcmYgLycsICdxdWFsaXR5JyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJyQod2hvYW1pKScsICdxdWFsaXR5JyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZVNoZWxsVG9rZW4oJ2Zvb1xcJ2JhcicsICdxdWFsaXR5JyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBlbXB0eSBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlU2hlbGxUb2tlbignJywgJ3F1YWxpdHknKSwgL1Vuc2FmZSBxdWFsaXR5Lyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd2YWxpZGF0ZUNvbW1pdCcsICgpID0+IHtcblx0XHR0ZXN0KCdhY2NlcHRzIGEgNDAtY2hhciBsb3dlcmNhc2UgaGV4IFNIQScsICgpID0+IHtcblx0XHRcdGNvbnN0IGMgPSAnYWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMSc7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsaWRhdGVDb21taXQoYyksIGMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyB1cHBlcmNhc2UgaGV4IHRvIGxvd2VyY2FzZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dmFsaWRhdGVDb21taXQoJ0FCQ0RFRjAxMjM0NTY3ODlBQkNERUYwMTIzNDU2Nzg5QUJDREVGMDEnKSxcblx0XHRcdFx0J2FiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgbm9uLWhleCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZUNvbW1pdCgnZycucmVwZWF0KDQwKSksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWl0KCdhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjB6JyksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHdyb25nLWxlbmd0aCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWl0KCdhYmMnKSwgL1Vuc2FmZSBjb21taXQvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gdmFsaWRhdGVDb21taXQoJ2EnLnJlcGVhdCg0MSkpLCAvVW5zYWZlIGNvbW1pdC8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZUNvbW1pdCgnJyksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHNoZWxsIG1ldGFjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB2YWxpZGF0ZUNvbW1pdCgnZm9vO3JtJyksIC9VbnNhZmUgY29tbWl0Lyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHZhbGlkYXRlQ29tbWl0KCdhJy5yZXBlYXQoMzkpICsgJyQnKSwgL1Vuc2FmZSBjb21taXQvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFJlbW90ZUNMSUFyY2hpdmVOYW1lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgY29kZSBmb3Igc3RhYmxlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlbW90ZUNMSUFyY2hpdmVOYW1lKCdzdGFibGUnKSwgJ2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29kZS1pbnNpZGVycyBmb3IgaW5zaWRlcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnaW5zaWRlcicpLCAnY29kZS1pbnNpZGVycycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBjb2RlLWV4cGxvcmF0aW9uIGZvciBleHBsb3JhdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnZXhwbG9yYXRpb24nKSwgJ2NvZGUtZXhwbG9yYXRpb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gY29kZS1pbnNpZGVycyBmb3IgdW5rbm93biBxdWFsaXRpZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBEZXYgYnVpbGRzIHdpdGggbm8gYHF1YWxpdHlgIGVuZCB1cCBoZXJlIHZpYSB0aGVcblx0XHRcdC8vIGBfcXVhbGl0eWAgZ2V0dGVyJ3MgYCdpbnNpZGVyJ2AgZGVmYXVsdCwgc28gdGhlIGZhbGxiYWNrXG5cdFx0XHQvLyBzaG91bGRuJ3QgZGlmZmVyIGZyb20gaW5zaWRlci5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnd2VpcmRidWlsZCcpLCAnY29kZS1pbnNpZGVycycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB1bnNhZmUgcXVhbGl0eSBzdHJpbmdzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW1vdGVDTElBcmNoaXZlTmFtZSgnZm9vIGJhcicpLCAvVW5zYWZlIHF1YWxpdHkvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFJlbW90ZUNMSUluc3RhbGxSb290JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdXNlci1ob21lIGFuY2hvcmVkIHBhdGggdW5kZXIgdGhlIHNlcnZlciBkYXRhIGZvbGRlcicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElJbnN0YWxsUm9vdCgnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnKSwgJ34vLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lcycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0UmVtb3RlQ0xJSW5zdGFsbFJvb3QoJ2ZvbyBiYXInKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW1vdGVDTElJbnN0YWxsUm9vdCgnZm9vL2JhcicpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldFJlbW90ZUNMSUluc3RhbGxSb290KCckKHdob2FtaSknKSwgL1Vuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZS8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UmVtb3RlQ0xJRGF0YURpcicsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBgY2xpYCBzdWJkaXIgdW5kZXIgdGhlIGluc3RhbGwgcm9vdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElEYXRhRGlyKCcudnNjb2RlLXNlcnZlcicpLCAnfi8udnNjb2RlLXNlcnZlci9jbGknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZW1vdGVDTElEYXRhRGlyKCcudnNjb2RlLXNlcnZlci1pbnNpZGVycycpLCAnfi8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9jbGknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lcycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0UmVtb3RlQ0xJRGF0YURpcignZm9vO3JtJyksIC9VbnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWUvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1aWxkQWdlbnRIb3N0QmFzZUNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW5jbHVkZXMgLS1jbGktZGF0YS1kaXIgYmVmb3JlIHRoZSBhZ2VudCBob3N0IHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZEFnZW50SG9zdEJhc2VDb21tYW5kKCd+Ly52c2NvZGUtc2VydmVyL2NvZGUtaW5zaWRlcnMtYWJjJywgJ34vLnZzY29kZS1zZXJ2ZXIvY2xpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY21kLCAnfi8udnNjb2RlLXNlcnZlci9jb2RlLWluc2lkZXJzLWFiYyAtLWNsaS1kYXRhLWRpciB+Ly52c2NvZGUtc2VydmVyL2NsaSBhZ2VudCBob3N0IC0tcG9ydCAwJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRSZW1vdGVDTElCaW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWl0ID0gJ2FiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEnO1xuXG5cdFx0dGVzdCgncmV0dXJucyBjb21taXQta2V5ZWQgcGF0aCB1bmRlciBzaGFyZWQgaW5zdGFsbCByb290IGZvciBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFJlbW90ZUNMSUJpbignLnZzY29kZS1zZXJ2ZXInLCAnc3RhYmxlJywgY29tbWl0KSxcblx0XHRcdFx0YH4vLnZzY29kZS1zZXJ2ZXIvY29kZS0ke2NvbW1pdH1gLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29tbWl0LWtleWVkIHBhdGggZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGdldFJlbW90ZUNMSUJpbignLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnLCAnaW5zaWRlcicsIGNvbW1pdCksXG5cdFx0XHRcdGB+Ly52c2NvZGUtc2VydmVyLWluc2lkZXJzL2NvZGUtaW5zaWRlcnMtJHtjb21taXR9YCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGNvbW1pdC1rZXllZCBwYXRoIGZvciBleHBsb3JhdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVtb3RlQ0xJQmluKCcudnNjb2RlLXNlcnZlci1leHBsb3JhdGlvbicsICdleHBsb3JhdGlvbicsIGNvbW1pdCksXG5cdFx0XHRcdGB+Ly52c2NvZGUtc2VydmVyLWV4cGxvcmF0aW9uL2NvZGUtZXhwbG9yYXRpb24tJHtjb21taXR9YCxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIG5vbi1rZXllZCBwYXRoIHdoZW4gY29tbWl0IGlzIHVuZGVmaW5lZCAoZGV2IGJ1aWxkKScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0UmVtb3RlQ0xJQmluKCcudnNjb2RlLXNlcnZlci1vc3MnLCAnaW5zaWRlcicpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci1vc3MvY29kZS1pbnNpZGVycycsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRSZW1vdGVDTElCaW4oJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci9jb2RlJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBjb21taXQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRSZW1vdGVDTElCaW4oJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScsICdmb287cm0nKSwgL1Vuc2FmZSBjb21taXQvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vcm1hbGl6ZXMgdXBwZXJjYXNlIGhleCBjb21taXRzIHRvIGxvd2VyY2FzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVwcGVyID0gJ0FCQ0RFRjAxMjM0NTY3ODlBQkNERUYwMTIzNDU2Nzg5QUJDREVGMDEnO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXRSZW1vdGVDTElCaW4oJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScsIHVwcGVyKSxcblx0XHRcdFx0J34vLnZzY29kZS1zZXJ2ZXIvY29kZS1hYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldFJlbW90ZUNMSUJpbignZm9vIGJhcicsICdzdGFibGUnLCBjb21taXQpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaGVsbEVzY2FwZScsICgpID0+IHtcblx0XHR0ZXN0KCd3cmFwcyBzaW1wbGUgc3RyaW5nIGluIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hlbGxFc2NhcGUoJ2hlbGxvJyksICdcXCdoZWxsb1xcJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXNjYXBlcyBlbWJlZGRlZCBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoZWxsRXNjYXBlKCdpdFxcJ3MnKSwgJ1xcJ2l0XFwnXFxcXFxcJ1xcJ3NcXCcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoZWxsRXNjYXBlKCcnKSwgJ1xcJ1xcJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIHRocm91Z2ggc3BlY2lhbCBjaGFycyBzYWZlbHkgd3JhcHBlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGVsbEVzY2FwZSgnJChybSAtcmYgLyknKSwgJ1xcJyQocm0gLXJmIC8pXFwnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlUmVtb3RlUGxhdGZvcm0nLCAoKSA9PiB7XG5cdFx0dGVzdCgnZGV0ZWN0cyBMaW51eCB4NjQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnTGludXgnLCAneDg2XzY0JyksIHsgb3M6ICdsaW51eCcsIGFyY2g6ICd4NjQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0ZWN0cyBMaW51eCBhbWQ2NCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZVJlbW90ZVBsYXRmb3JtKCdMaW51eCcsICdhbWQ2NCcpLCB7IG9zOiAnbGludXgnLCBhcmNoOiAneDY0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgTGludXggYXJtNjQgKGFhcmNoNjQpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJ0xpbnV4JywgJ2FhcmNoNjQnKSwgeyBvczogJ2xpbnV4JywgYXJjaDogJ2FybTY0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgTGludXggYXJtNjQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnTGludXgnLCAnYXJtNjQnKSwgeyBvczogJ2xpbnV4JywgYXJjaDogJ2FybTY0JyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgTGludXggYXJtaGYnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnTGludXgnLCAnYXJtdjdsJyksIHsgb3M6ICdsaW51eCcsIGFyY2g6ICdhcm1oZicgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3RzIERhcndpbiB4NjQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnRGFyd2luJywgJ3g4Nl82NCcpLCB7IG9zOiAnZGFyd2luJywgYXJjaDogJ3g2NCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3RzIERhcndpbiBhcm02NCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZVJlbW90ZVBsYXRmb3JtKCdEYXJ3aW4nLCAnYXJtNjQnKSwgeyBvczogJ2RhcndpbicsIGFyY2g6ICdhcm02NCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHdoaXRlc3BhY2UgaW4gdW5hbWUgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJyAgTGludXhcXG4nLCAnICB4ODZfNjRcXG4nKSwgeyBvczogJ2xpbnV4JywgYXJjaDogJ3g2NCcgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgV2luZG93cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJ01JTkdXNjRfTlQtMTAuMC0xOTA0MScsICd4ODZfNjQnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIE9TJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVSZW1vdGVQbGF0Zm9ybSgnRnJlZUJTRCcsICdhbWQ2NCcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIHVua25vd24gYXJjaCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlUmVtb3RlUGxhdGZvcm0oJ0xpbnV4JywgJ3BwYzY0bGUnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2J1aWxkQ0xJRG93bmxvYWRVcmwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWl0ID0gJ2FiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEnO1xuXG5cdFx0dGVzdCgndXNlcyBgbGF0ZXN0YCBVUkwgd2hlbiBjb21taXQgaXMgb21pdHRlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YnVpbGRDTElEb3dubG9hZFVybCgnbGludXgnLCAneDY0JywgJ2luc2lkZXInKSxcblx0XHRcdFx0J2h0dHBzOi8vdXBkYXRlLmNvZGUudmlzdWFsc3R1ZGlvLmNvbS9sYXRlc3QvY2xpLWxpbnV4LXg2NC9pbnNpZGVyJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dvcmtzIGZvciBkYXJ3aW4gYXJtNjQgc3RhYmxlIChubyBjb21taXQpJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRidWlsZENMSURvd25sb2FkVXJsKCdkYXJ3aW4nLCAnYXJtNjQnLCAnc3RhYmxlJyksXG5cdFx0XHRcdCdodHRwczovL3VwZGF0ZS5jb2RlLnZpc3VhbHN0dWRpby5jb20vbGF0ZXN0L2NsaS1kYXJ3aW4tYXJtNjQvc3RhYmxlJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BpbnMgdG8gY29tbWl0IHdoZW4gcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2xpbnV4JywgJ3g2NCcsICdpbnNpZGVyJywgY29tbWl0KSxcblx0XHRcdFx0YGh0dHBzOi8vdXBkYXRlLmNvZGUudmlzdWFsc3R1ZGlvLmNvbS9jb21taXQ6JHtjb21taXR9L2NsaS1saW51eC14NjQvaW5zaWRlcmAsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGlucyB0byBjb21taXQgZm9yIGRhcndpbiBhcm02NCBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2RhcndpbicsICdhcm02NCcsICdzdGFibGUnLCBjb21taXQpLFxuXHRcdFx0XHRgaHR0cHM6Ly91cGRhdGUuY29kZS52aXN1YWxzdHVkaW8uY29tL2NvbW1pdDoke2NvbW1pdH0vY2xpLWRhcndpbi1hcm02NC9zdGFibGVgLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIGNvbW1pdCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2xpbnV4JywgJ3g2NCcsICdpbnNpZGVyJywgJ2ZvbztybScpLCAvVW5zYWZlIGNvbW1pdC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyB1cHBlcmNhc2UgaGV4IGNvbW1pdHMgdG8gbG93ZXJjYXNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXBwZXIgPSAnQUJDREVGMDEyMzQ1Njc4OUFCQ0RFRjAxMjM0NTY3ODlBQkNERUYwMSc7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQ0xJRG93bmxvYWRVcmwoJ2xpbnV4JywgJ3g2NCcsICdpbnNpZGVyJywgdXBwZXIpLFxuXHRcdFx0XHRgaHR0cHM6Ly91cGRhdGUuY29kZS52aXN1YWxzdHVkaW8uY29tL2NvbW1pdDphYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxL2NsaS1saW51eC14NjQvaW5zaWRlcmAsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncHJvZHVjZXMgYSBzbmlwcGV0IHRoYXQga2VlcHMgdGhlIDUgbW9zdCByZWNlbnQgY29tbWl0LWtleWVkIENMSXMgZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZENsZWFudXBPbGRDTElzQ29tbWFuZCgnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnLCAnaW5zaWRlcicpO1xuXHRcdFx0Ly8gVGFyZ2V0IHRoZSBjb21taXQta2V5ZWQgcGF0dGVybiAod2l0aCA0MCBjaGFycyksIHVuZGVyIHRoZSBzaGFyZWQgaW5zdGFsbCByb290LlxuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9jb2RlLWluc2lkZXJzLScpLCBgY21kIG1pc3NpbmcgaW5zdGFsbCBwYXRoOiAke2NtZH1gKTtcblx0XHRcdGFzc2VydC5vaygvKFxcWzAtOWEtZlxcXSl7NDB9Ly50ZXN0KGNtZCksICdjbWQgc2hvdWxkIG1hdGNoIGV4YWN0bHkgNDAgaGV4IGNoYXJzJyk7XG5cdFx0XHQvLyBSZXRlbnRpb24gdmlhIHNvcnQgKyBhd2sgZHJvcC1maXJzdC1OICsgeGFyZ3Mgcm0uXG5cdFx0XHRhc3NlcnQub2soL2xzIC0xdC8udGVzdChjbWQpLCBgY21kIHNob3VsZCBzb3J0IGJ5IG10aW1lOiAke2NtZH1gKTtcblx0XHRcdGFzc2VydC5vaygvYXdrXFxzKydOUj41Jy8udGVzdChjbWQpLCBgY21kIHNob3VsZCBrZWVwIDU6ICR7Y21kfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKC94YXJnc1xccystSVxce1xcfVxccytybVxccystZlxccystLS8udGVzdChjbWQpLCBgY21kIHNob3VsZCBybSBzYWZlbHk6ICR7Y21kfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBgY29kZS1gIGFyY2hpdmUgbmFtZSBmb3Igc3RhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY21kID0gYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQoJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLXNlcnZlci9jb2RlLVswLTlhLWZdJyksIGBjbWQgc2hvdWxkIHRhcmdldCBzdGFibGUgYXJjaGl2ZTogJHtjbWR9YCk7XG5cdFx0XHRhc3NlcnQub2soIWNtZC5pbmNsdWRlcygnY29kZS1pbnNpZGVycy0nKSwgJ3N0YWJsZSBjbWQgc2hvdWxkIG5vdCBtZW50aW9uIGluc2lkZXJzIGFyY2hpdmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIGlucHV0cycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQoJ2ZvbyBiYXInLCAnc3RhYmxlJyksIC9VbnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWUvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYnVpbGRDbGVhbnVwT2xkQ0xJc0NvbW1hbmQoJy52c2NvZGUtc2VydmVyJywgJ2ZvbyBiYXInKSwgL1Vuc2FmZSBxdWFsaXR5Lyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbGlzdHMgY29tbWl0LWtleWVkIGNhbmRpZGF0ZXMgdGhlbiBsZWdhY3kgcGF0aHMgZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQoJy52c2NvZGUtc2VydmVyLWluc2lkZXJzJywgJ2luc2lkZXInKTtcblx0XHRcdC8vIE5ldyBjb21taXQta2V5ZWQgY2FuZGlkYXRlcyBpbiBzaGFyZWQgaW5zdGFsbCByb290LCBzb3J0ZWQgbmV3ZXN0LWZpcnN0LlxuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLXNlcnZlci1pbnNpZGVycy9jb2RlLWluc2lkZXJzLScpLCBgY21kIG1pc3NpbmcgbmV3IHBhdGg6ICR7Y21kfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKC9scyAtMXQvLnRlc3QoY21kKSwgJ3Nob3VsZCBzb3J0IGNvbW1pdC1rZXllZCBjYW5kaWRhdGVzIGJ5IG10aW1lJyk7XG5cdFx0XHQvLyBMZWdhY3kgc2luZ2xlLWJpbmFyeSBwYXRoIChpbnNpZGVyIGhhcyB0aGUgYC1pbnNpZGVyYCBkaXIgc3VmZml4KS5cblx0XHRcdGFzc2VydC5vayhjbWQuaW5jbHVkZXMoJ34vLnZzY29kZS1jbGktaW5zaWRlci9jb2RlLWluc2lkZXJzJyksIGBjbWQgbWlzc2luZyBsZWdhY3kgcGF0aDogJHtjbWR9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIG5vLXN1ZmZpeCBsZWdhY3kgZGlyIGZvciBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbWQgPSBidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQoJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnfi8udnNjb2RlLWNsaS9jb2RlJyksIGBjbWQgbWlzc2luZyBzdGFibGUgbGVnYWN5IHBhdGg6ICR7Y21kfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKCFjbWQuaW5jbHVkZXMoJy52c2NvZGUtY2xpLXN0YWJsZScpLCAnc3RhYmxlIHNob3VsZCBub3QgZ2V0IHRoZSAtPHF1YWxpdHk+IHN1ZmZpeCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB1bnNhZmUgaW5wdXRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBidWlsZEZpbmRGYWxsYmFja0NMSUNvbW1hbmQoJ2ZvbyBiYXInLCAnc3RhYmxlJyksIC9VbnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWUvKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gYnVpbGRGaW5kRmFsbGJhY2tDTElDb21tYW5kKCcudnNjb2RlLXNlcnZlcicsICdmb28gYmFyJyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCcsICgpID0+IHtcblx0XHRjb25zdCBzZGYgPSAnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnO1xuXHRcdGNvbnN0IHEgPSAnaW5zaWRlcic7XG5cdFx0Y29uc3QgaGV4ID0gJzAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1NjcnO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyBjb21taXQta2V5ZWQgcGF0aCB1bmRlciB0aGUgc2hhcmVkIGluc3RhbGwgcm9vdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+LyR7c2RmfS9jb2RlLWluc2lkZXJzLSR7aGV4fWAsIHNkZiwgcSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyBsZWdhY3kgfi8udnNjb2RlLWNsaS08cXVhbGl0eT4vPGFyY2hpdmU+IHBhdGggZm9yIGluc2lkZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCgnfi8udnNjb2RlLWNsaS1pbnNpZGVyL2NvZGUtaW5zaWRlcnMnLCBzZGYsIHEpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgbGVnYWN5IH4vLnZzY29kZS1jbGkvY29kZSBwYXRoIGZvciBzdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCgnfi8udnNjb2RlLWNsaS9jb2RlJywgJy52c2NvZGUtc2VydmVyJywgJ3N0YWJsZScpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgY29tbWl0IHN1ZmZpeCB3aXRoIG5vbi1oZXggY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IG5vdEhleCA9ICdnJy5yZXBlYXQoNDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRGYWxsYmFja0NMSVBhdGgoYH4vJHtzZGZ9L2NvZGUtaW5zaWRlcnMtJHtub3RIZXh9YCwgc2RmLCBxKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBjb21taXQgc3VmZml4IHdpdGggd3JvbmcgbGVuZ3RoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVmFsaWRGYWxsYmFja0NMSVBhdGgoYH4vJHtzZGZ9L2NvZGUtaW5zaWRlcnMtJHtoZXguc2xpY2UoMCwgMzkpfWAsIHNkZiwgcSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+LyR7c2RmfS9jb2RlLWluc2lkZXJzLSR7aGV4fWFgLCBzZGYsIHEpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHBhdGhzIHVuZGVyIGFuIHVuZXhwZWN0ZWQgcm9vdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+Ly5zb21ldGhpbmctZWxzZS9jb2RlLWluc2lkZXJzLSR7aGV4fWAsIHNkZiwgcSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aCgnJywgc2RmLCBxKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBzaGVsbCBtZXRhY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1ZhbGlkRmFsbGJhY2tDTElQYXRoKGB+LyR7c2RmfS9jb2RlLWluc2lkZXJzLSR7aGV4fTsgcm0gLXJmIC9gLCBzZGYsIHEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNWYWxpZEZhbGxiYWNrQ0xJUGF0aChgfi8ke3NkZn0vY29kZS1pbnNpZGVycy0ke2hleH0gJiYgZXZpbGAsIHNkZiwgcSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlZGFjdFRva2VuJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlZGFjdHMgdG9rZW4gaW4gV2ViU29ja2V0IFVSTCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0cmVkYWN0VG9rZW4oJ3dzOi8vMTI3LjAuMC4xOjEyMzQ1P3Rrbj1zZWNyZXQxMjMnKSxcblx0XHRcdFx0J3dzOi8vMTI3LjAuMC4xOjEyMzQ1P3Rrbj0qKionXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVkYWN0cyB0b2tlbiB3aXRoIGZvbGxvd2luZyB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWRhY3RUb2tlbignd3M6Ly8xMjcuMC4wLjE6MTIzNDU/dGtuPWFiYzEyMyBkb25lJyksXG5cdFx0XHRcdCd3czovLzEyNy4wLjAuMToxMjM0NT90a249KioqIGRvbmUnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHRleHQgd2l0aG91dCB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVkYWN0VG9rZW4oJ25vIHRva2VuIGhlcmUnKSwgJ25vIHRva2VuIGhlcmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlZGFjdHMgbXVsdGlwbGUgdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZWRhY3RUb2tlbignP3Rrbj1vbmUgYW5kID90a249dHdvJyksXG5cdFx0XHRcdCc/dGtuPSoqKiBhbmQgP3Rrbj0qKionXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRBZ2VudEVuZHBvaW50c0NvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnb21pdHMgLS11c2VyLWRhdGEtZGlyIHdoZW4gbm90IHlldCBrbm93bicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YnVpbGRBZ2VudEVuZHBvaW50c0NvbW1hbmQoJ34vLnZzY29kZS1zZXJ2ZXIvY29kZScsICd+Ly52c2NvZGUtc2VydmVyL2NsaScpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci9jb2RlIC0tY2xpLWRhdGEtZGlyIH4vLnZzY29kZS1zZXJ2ZXIvY2xpIGFnZW50IGVuZHBvaW50cycsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgLS11c2VyLWRhdGEtZGlyIG9uY2UgcmVzb2x2ZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQWdlbnRFbmRwb2ludHNDb21tYW5kKCd+Ly52c2NvZGUtc2VydmVyL2NvZGUnLCAnfi8udnNjb2RlLXNlcnZlci9jbGknLCAnL2hvbWUvdXNlci8udnNjb2RlLXJlbW90ZScpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci9jb2RlIC0tY2xpLWRhdGEtZGlyIH4vLnZzY29kZS1zZXJ2ZXIvY2xpIGFnZW50IGVuZHBvaW50cyAtLXVzZXItZGF0YS1kaXIgXFwnL2hvbWUvdXNlci8udnNjb2RlLXJlbW90ZVxcJycsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRBZ2VudEhvc3RTcGF3bkNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaW5jbHVkZXMgLS1uZXctaW5zdGFuY2UsIC0tdXNlci1kYXRhLWRpciBhbmQgZGVmYXVsdCAtLWlkbGUtdGltZW91dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YnVpbGRBZ2VudEhvc3RTcGF3bkNvbW1hbmQoJ34vLnZzY29kZS1zZXJ2ZXIvY29kZScsICd+Ly52c2NvZGUtc2VydmVyL2NsaScsICcvaG9tZS91c2VyLy52c2NvZGUtcmVtb3RlJyksXG5cdFx0XHRcdCd+Ly52c2NvZGUtc2VydmVyL2NvZGUgLS1jbGktZGF0YS1kaXIgfi8udnNjb2RlLXNlcnZlci9jbGkgYWdlbnQgaG9zdCAtLXBvcnQgMCAtLW5ldy1pbnN0YW5jZSAtLXVzZXItZGF0YS1kaXIgXFwnL2hvbWUvdXNlci8udnNjb2RlLXJlbW90ZVxcJyAtLWlkbGUtdGltZW91dCAzMDAnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvbm9ycyBhIGN1c3RvbSBpZGxlIHRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGJ1aWxkQWdlbnRIb3N0U3Bhd25Db21tYW5kKCd+Ly52c2NvZGUtc2VydmVyL2NvZGUnLCAnfi8udnNjb2RlLXNlcnZlci9jbGknLCAnL2hvbWUvdXNlci8udnNjb2RlLXJlbW90ZScsIDYwKSxcblx0XHRcdFx0J34vLnZzY29kZS1zZXJ2ZXIvY29kZSAtLWNsaS1kYXRhLWRpciB+Ly52c2NvZGUtc2VydmVyL2NsaSBhZ2VudCBob3N0IC0tcG9ydCAwIC0tbmV3LWluc3RhbmNlIC0tdXNlci1kYXRhLWRpciBcXCcvaG9tZS91c2VyLy52c2NvZGUtcmVtb3RlXFwnIC0taWRsZS10aW1lb3V0IDYwJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBpZGxlIHRpbWVvdXQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBidWlsZEFnZW50SG9zdFNwYXduQ29tbWFuZCgnfi8udnNjb2RlLXNlcnZlci9jb2RlJywgJ34vLnZzY29kZS1zZXJ2ZXIvY2xpJywgJy94JywgMCksIC9VbnNhZmUgaWRsZSB0aW1lb3V0Lyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGJ1aWxkQWdlbnRIb3N0U3Bhd25Db21tYW5kKCd+Ly52c2NvZGUtc2VydmVyL2NvZGUnLCAnfi8udnNjb2RlLXNlcnZlci9jbGknLCAnL3gnLCAtMSksIC9VbnNhZmUgaWRsZSB0aW1lb3V0Lyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGJ1aWxkQWdlbnRIb3N0U3Bhd25Db21tYW5kKCd+Ly52c2NvZGUtc2VydmVyL2NvZGUnLCAnfi8udnNjb2RlLXNlcnZlci9jbGknLCAnL3gnLCAxLjUpLCAvVW5zYWZlIGlkbGUgdGltZW91dC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWx3YXlzIGluY2x1ZGVzIC0tbmV3LWluc3RhbmNlIHNvIGFuIGV4aXN0aW5nIHN0YW5kYWxvbmUgaXMgbmV2ZXIgc2lsZW50bHkgcmV1c2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY21kID0gYnVpbGRBZ2VudEhvc3RTcGF3bkNvbW1hbmQoJ34vLnZzY29kZS1zZXJ2ZXIvY29kZScsICd+Ly52c2NvZGUtc2VydmVyL2NsaScsICcveCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNtZC5pbmNsdWRlcygnIC0tbmV3LWluc3RhbmNlICcpLCAnc3Bhd24gY29tbWFuZCBtdXN0IHJlcXVlc3QgYSBnZW51aW5lbHkgbmV3IGluc3RhbmNlLCBub3QgcmV1c2UgYW4gZXhpc3Rpbmcgc3RhbmRhbG9uZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGRBZ2VudFJlbGF5Q29tbWFuZCcsICgpID0+IHtcblx0XHR0ZXN0KCdidWlsZHMgYSByZWxheSBjb21tYW5kIHNjb3BlZCB0byB0aGUgZXhhY3QgaW5zdGFuY2VJZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0YnVpbGRBZ2VudFJlbGF5Q29tbWFuZCgnfi8udnNjb2RlLXNlcnZlci9jb2RlJywgJ34vLnZzY29kZS1zZXJ2ZXIvY2xpJywgJ2FiYy0xMjMnLCAnL2hvbWUvdXNlci8udnNjb2RlLXJlbW90ZScpLFxuXHRcdFx0XHQnfi8udnNjb2RlLXNlcnZlci9jb2RlIC0tY2xpLWRhdGEtZGlyIH4vLnZzY29kZS1zZXJ2ZXIvY2xpIGFnZW50IHJlbGF5IFxcJ2FiYy0xMjNcXCcgLS11c2VyLWRhdGEtZGlyIFxcJy9ob21lL3VzZXIvLnZzY29kZS1yZW1vdGVcXCcnLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlQWdlbnRFbmRwb2ludHNPdXRwdXQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIGVtcHR5IG91dHB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUFnZW50RW5kcG9pbnRzT3V0cHV0KCcnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUFnZW50RW5kcG9pbnRzT3V0cHV0KCcgICBcXG4nKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBpbnZhbGlkIEpTT04nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VBZ2VudEVuZHBvaW50c091dHB1dCgnbm90IGpzb24nKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGhlIGVudmVsb3BlIGlzIG1pc3NpbmcgdXNlckRhdGFQYXRoL2VuZHBvaW50cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUFnZW50RW5kcG9pbnRzT3V0cHV0KEpTT04uc3RyaW5naWZ5KHsgZW5kcG9pbnRzOiBbXSB9KSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VBZ2VudEVuZHBvaW50c091dHB1dChKU09OLnN0cmluZ2lmeSh7IHVzZXJEYXRhUGF0aDogJy94JyB9KSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgYSB3ZWxsLWZvcm1lZCBlbnZlbG9wZSBhbmQgdmFsaWRhdGVzIGVhY2ggZW5kcG9pbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbmRwb2ludCA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMTEsIGluc3RhbmNlSWQ6ICdpMScgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUFnZW50RW5kcG9pbnRzT3V0cHV0KEpTT04uc3RyaW5naWZ5KHsgdXNlckRhdGFQYXRoOiAnL2hvbWUvdXNlci8udnNjb2RlLXJlbW90ZScsIGVuZHBvaW50czogW2VuZHBvaW50XSB9KSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudXNlckRhdGFQYXRoLCAnL2hvbWUvdXNlci8udnNjb2RlLXJlbW90ZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuZW5kcG9pbnRzLCBbZW5kcG9pbnRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIG1hbGZvcm1lZCBpbmRpdmlkdWFsIGVuZHBvaW50IGVudHJpZXMgd2l0aG91dCBmYWlsaW5nIHRoZSB3aG9sZSBwYXJzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGdvb2QgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnZWRpdG9yJywgcGlkOiAyMjIsIGluc3RhbmNlSWQ6ICdpMicgfSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUFnZW50RW5kcG9pbnRzT3V0cHV0KEpTT04uc3RyaW5naWZ5KHsgdXNlckRhdGFQYXRoOiAnL3gnLCBlbmRwb2ludHM6IFtnb29kLCB7IGdhcmJhZ2U6IHRydWUgfV0gfSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5lbmRwb2ludHMsIFtnb29kXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdydW5BZ2VudEVuZHBvaW50cycsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgc3Rkb3V0IG9uIHN1Y2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbmRwb2ludCA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAzMzMsIGluc3RhbmNlSWQ6ICdpMycgfSk7XG5cdFx0XHRjb25zdCBleGVjOiBJU3NoRXhlYyA9IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdHN0ZG91dDogSlNPTi5zdHJpbmdpZnkoeyB1c2VyRGF0YVBhdGg6ICcvaG9tZS91c2VyLy52c2NvZGUtcmVtb3RlJywgZW5kcG9pbnRzOiBbZW5kcG9pbnRdIH0pLFxuXHRcdFx0XHRzdGRlcnI6ICcnLFxuXHRcdFx0XHRjb2RlOiAwLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5BZ2VudEVuZHBvaW50cyhleGVjLCAnfi8udnNjb2RlLXNlcnZlci9jb2RlJywgJ34vLnZzY29kZS1zZXJ2ZXIvY2xpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVzZXJEYXRhUGF0aCwgJy9ob21lL3VzZXIvLnZzY29kZS1yZW1vdGUnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LmVuZHBvaW50cywgW2VuZHBvaW50XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhlIHJlc29sdmVkIC0tdXNlci1kYXRhLWRpciB0aHJvdWdoIHRvIHRoZSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBleGVjOiBJU3NoRXhlYyA9IGFzeW5jIGNvbW1hbmQgPT4ge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKGNvbW1hbmQpO1xuXHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6IEpTT04uc3RyaW5naWZ5KHsgdXNlckRhdGFQYXRoOiAnL3gnLCBlbmRwb2ludHM6IFtdIH0pLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH07XG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgcnVuQWdlbnRFbmRwb2ludHMoZXhlYywgJ34vLnZzY29kZS1zZXJ2ZXIvY29kZScsICd+Ly52c2NvZGUtc2VydmVyL2NsaScsICcvaG9tZS91c2VyLy52c2NvZGUtcmVtb3RlJyk7XG5cdFx0XHRhc3NlcnQub2soY29tbWFuZHMuc29tZShjID0+IGMuaW5jbHVkZXMoJy0tdXNlci1kYXRhLWRpciBcXCcvaG9tZS91c2VyLy52c2NvZGUtcmVtb3RlXFwnJykpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyAobG91ZGx5KSB3aGVuIHRoZSBjb21tYW5kIGV4aXRzIG5vbi16ZXJvJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoKSA9PiAoeyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICdjb21tYW5kIG5vdCBmb3VuZCcsIGNvZGU6IDEyNyB9KTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBydW5BZ2VudEVuZHBvaW50cyhleGVjLCAnfi8udnNjb2RlLXNlcnZlci9jb2RlJywgJ34vLnZzY29kZS1zZXJ2ZXIvY2xpJyksXG5cdFx0XHRcdC9leGl0IGNvZGUgMTI3Lipjb21tYW5kIG5vdCBmb3VuZC9zLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIG91dHB1dCBjYW5ub3QgYmUgcGFyc2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoKSA9PiAoeyBzdGRvdXQ6ICdub3QganNvbicsIHN0ZGVycjogJycsIGNvZGU6IDAgfSk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gcnVuQWdlbnRFbmRwb2ludHMoZXhlYywgJ34vLnZzY29kZS1zZXJ2ZXIvY29kZScsICd+Ly52c2NvZGUtc2VydmVyL2NsaScpLFxuXHRcdFx0XHQvdW5wYXJzYWJsZSBvdXRwdXQgXFwoOCBjaGFyYWN0ZXJzXFwpJC8sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIEpTT04gYWZ0ZXIgbGVnYWN5IENMSSBsb2cgb3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYFsyMDI2LTA4LTA2IDE1OjMxOjE5XSBpbmZvIFBydW5pbmcgc3RhbGUgbG9jYWwgZW5kcG9pbnQgcmVnaXN0cnkgZW50cnlcXG4ke0pTT04uc3RyaW5naWZ5KHsgdXNlckRhdGFQYXRoOiAnL3RtcC91c2VyLWRhdGEnLCBlbmRwb2ludHM6IFtdIH0pfWA7XG5cdFx0XHRjb25zdCBleGVjOiBJU3NoRXhlYyA9IGFzeW5jICgpID0+ICh7IHN0ZG91dDogb3V0cHV0LCBzdGRlcnI6ICcnLCBjb2RlOiAwIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW5BZ2VudEVuZHBvaW50cyhleGVjLCAnfi8udnNjb2RlLXNlcnZlci9jb2RlJywgJ34vLnZzY29kZS1zZXJ2ZXIvY2xpJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdHVzZXJEYXRhUGF0aDogJy90bXAvdXNlci1kYXRhJyxcblx0XHRcdFx0ZW5kcG9pbnRzOiBbXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmlsdGVyTGl2ZUFnZW50SG9zdEVuZHBvaW50cycsICgpID0+IHtcblx0XHR0ZXN0KCdrZWVwcyBvbmx5IGVudHJpZXMgd2hvc2UgUElEIHJlc3BvbmRzIHRvIGtpbGwgLTAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbGl2ZSA9IG1ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxMDAsIGluc3RhbmNlSWQ6ICdhbGl2ZScgfSk7XG5cdFx0XHRjb25zdCBkZWFkID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDIwMCwgaW5zdGFuY2VJZDogJ2RlYWQnIH0pO1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyBjb21tYW5kID0+IHtcblx0XHRcdFx0aWYgKGNvbW1hbmQuaW5jbHVkZXMoJ2tpbGwgLTAgMTAwJykpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbW1hbmQuaW5jbHVkZXMoJ2tpbGwgLTAgMjAwJykpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAxIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmV4cGVjdGVkIGNvbW1hbmQ6ICR7Y29tbWFuZH1gKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWx0ZXJMaXZlQWdlbnRIb3N0RW5kcG9pbnRzKGV4ZWMsIFthbGl2ZSwgZGVhZF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFthbGl2ZV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvYmVzIGVhY2ggZGlzdGluY3QgUElEIGF0IG1vc3Qgb25jZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZpcnN0ID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ2VkaXRvcicsIHBpZDogMTAwLCBpbnN0YW5jZUlkOiAnZTEnIH0pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEwMCwgaW5zdGFuY2VJZDogJ2UyJyB9KTtcblx0XHRcdGxldCBwcm9iZXMgPSAwO1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyBjb21tYW5kID0+IHtcblx0XHRcdFx0aWYgKGNvbW1hbmQuaW5jbHVkZXMoJ2tpbGwgLTAgMTAwJykpIHtcblx0XHRcdFx0XHRwcm9iZXMrKztcblx0XHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6ICcnLCBzdGRlcnI6ICcnLCBjb2RlOiAwIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGB1bmV4cGVjdGVkIGNvbW1hbmQ6ICR7Y29tbWFuZH1gKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWx0ZXJMaXZlQWdlbnRIb3N0RW5kcG9pbnRzKGV4ZWMsIFtmaXJzdCwgc2Vjb25kXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvYmVzLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgYW4gZW1wdHkgYXJyYXkgZm9yIGFuIGVtcHR5IGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignc2hvdWxkIG5vdCBiZSBjYWxsZWQnKTsgfTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZmlsdGVyTGl2ZUFnZW50SG9zdEVuZHBvaW50cyhleGVjLCBbXSksIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmROZXdBZ2VudEhvc3RFbmRwb2ludCcsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBzdGFuZGFsb25lIGVudHJ5IHByZXNlbnQgb25seSBpbiBcImFmdGVyXCInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEsIGluc3RhbmNlSWQ6ICdvbGQnIH0pXTtcblx0XHRcdGNvbnN0IHNwYXduZWQgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMiwgaW5zdGFuY2VJZDogJ25ldycgfSk7XG5cdFx0XHRjb25zdCBhZnRlciA9IFsuLi5iZWZvcmUsIHNwYXduZWRdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaW5kTmV3QWdlbnRIb3N0RW5kcG9pbnQoYmVmb3JlLCBhZnRlciksIHNwYXduZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBuZXcgZWRpdG9yLW93bmVkIGVudHJpZXMgKG9ubHkgc3RhbmRhbG9uZSBzcGF3bnMgYXJlIG1hdGNoZWQpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYmVmb3JlOiBJQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YVtdID0gW107XG5cdFx0XHRjb25zdCBuZXdFZGl0b3IgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnZWRpdG9yJywgcGlkOiA1LCBpbnN0YW5jZUlkOiAnZScgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE5ld0FnZW50SG9zdEVuZHBvaW50KGJlZm9yZSwgW25ld0VkaXRvcl0pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBub3RoaW5nIGNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gW21ha2VFbmRwb2ludCh7IHR5cGU6ICdzdGFuZGFsb25lJywgcGlkOiAxLCBpbnN0YW5jZUlkOiAnc2FtZScgfSldO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmROZXdBZ2VudEhvc3RFbmRwb2ludChlbnRyaWVzLCBlbnRyaWVzKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3dhaXRGb3JOZXdTdGFuZGFsb25lRW5kcG9pbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVzb2x2ZXMgYXMgc29vbiBhcyB0aGUgbmV3IGVuZHBvaW50IGFwcGVhcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBbbWFrZUVuZHBvaW50KHsgdHlwZTogJ3N0YW5kYWxvbmUnLCBwaWQ6IDEsIGluc3RhbmNlSWQ6ICdvbGQnIH0pXTtcblx0XHRcdGNvbnN0IHNwYXduZWQgPSBtYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMiwgaW5zdGFuY2VJZDogJ25ldycgfSk7XG5cdFx0XHRsZXQgcG9sbCA9IDA7XG5cdFx0XHRjb25zdCBleGVjOiBJU3NoRXhlYyA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0cG9sbCsrO1xuXHRcdFx0XHRjb25zdCBlbmRwb2ludHMgPSBwb2xsIDwgMiA/IGJlZm9yZSA6IFsuLi5iZWZvcmUsIHNwYXduZWRdO1xuXHRcdFx0XHRyZXR1cm4geyBzdGRvdXQ6IEpTT04uc3RyaW5naWZ5KHsgdXNlckRhdGFQYXRoOiAnL3gnLCBlbmRwb2ludHMgfSksIHN0ZGVycjogJycsIGNvZGU6IDAgfTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB3YWl0Rm9yTmV3U3RhbmRhbG9uZUVuZHBvaW50KGV4ZWMsICd+Ly52c2NvZGUtc2VydmVyL2NvZGUnLCAnfi8udnNjb2RlLXNlcnZlci9jbGknLCAnL3gnLCBiZWZvcmUsIHsgaW50ZXJ2YWxNczogMSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBzcGF3bmVkKTtcblx0XHRcdGFzc2VydC5vayhwb2xsID49IDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIG9uY2UgdGhlIGF0dGVtcHQgYnVkZ2V0IGlzIGV4aGF1c3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGJlZm9yZSA9IFttYWtlRW5kcG9pbnQoeyB0eXBlOiAnc3RhbmRhbG9uZScsIHBpZDogMSwgaW5zdGFuY2VJZDogJ29sZCcgfSldO1xuXHRcdFx0Y29uc3QgZXhlYzogSVNzaEV4ZWMgPSBhc3luYyAoKSA9PiAoeyBzdGRvdXQ6IEpTT04uc3RyaW5naWZ5KHsgdXNlckRhdGFQYXRoOiAnL3gnLCBlbmRwb2ludHM6IGJlZm9yZSB9KSwgc3RkZXJyOiAnJywgY29kZTogMCB9KTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiB3YWl0Rm9yTmV3U3RhbmRhbG9uZUVuZHBvaW50KGV4ZWMsICd+Ly52c2NvZGUtc2VydmVyL2NvZGUnLCAnfi8udnNjb2RlLXNlcnZlci9jbGknLCAnL3gnLCBiZWZvcmUsIHsgYXR0ZW1wdHM6IDIsIGludGVydmFsTXM6IDEgfSksXG5cdFx0XHRcdC9UaW1lZCBvdXQgd2FpdGluZy8sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsbURBQW9GO0FBQzdGO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFFUCxNQUFNLGlDQUFpQyxNQUFNO0FBRTVDLDBDQUF3QztBQUV4QyxXQUFTLGFBQWEsV0FBOEk7QUFDbkssV0FBTztBQUFBLE1BQ04sZUFBZTtBQUFBLE1BQ2YsaUJBQWlCO0FBQUEsTUFDakIsaUJBQWlCO0FBQUEsTUFDakIsVUFBVSxFQUFFLE1BQU0sT0FBTyxNQUFNLGFBQWEsTUFBTSxLQUFLO0FBQUE7QUFBQTtBQUFBO0FB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
