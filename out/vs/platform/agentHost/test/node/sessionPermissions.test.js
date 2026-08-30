import assert from "assert";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "fs";
import { homedir, tmpdir } from "os";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { join } from "../../../../base/common/path.js";
import { isLinux, isWindows } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostEditAutoApprovePatternsConfigKey, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, platformSessionSchema } from "../../common/agentHostSchema.js";
import { SESSION_ATTACHMENTS_DIRNAME } from "../../common/sessionDataService.js";
import { DEFAULT_EDIT_AUTO_APPROVE_PATTERNS, mergeChatEditAutoApprovePatterns } from "../../../chat/common/chatSettings.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { buildChatUri, SessionStatus, ToolCallConfirmationReason } from "../../common/state/sessionState.js";
import { AgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { SessionPermissionManager } from "../../node/sessionPermissions.js";
import { createSessionDataService } from "../common/sessionTestHelpers.js";
suite("SessionPermissionManager", () => {
  const disposables = new DisposableStore();
  let manager;
  let configService;
  let permissions;
  let sessionDataService;
  let workDir;
  let workDir2;
  let outsideDir;
  const sessionUri = URI.from({ scheme: "copilot", path: "/s" }).toString();
  const directoryLinkType = isWindows ? "junction" : "dir";
  function makeSummary(resource, ...workingDirectories) {
    return {
      resource,
      provider: "copilot",
      title: "t",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///project", displayName: "Project" },
      workingDirectories: workingDirectories.length > 0 ? workingDirectories : void 0
    };
  }
  function writeEvent(permissionPath) {
    return { toolCallId: "tc-1", session: URI.parse(sessionUri), permissionKind: "write", permissionPath };
  }
  function readEvent(permissionPath, resource = sessionUri) {
    return { toolCallId: "tc-read", session: URI.parse(resource), permissionKind: "read", permissionPath };
  }
  function shellEvent(commandLine, shellLanguage) {
    return { toolCallId: "tc-shell", session: URI.parse(sessionUri), permissionKind: "shell", toolInput: commandLine, shellLanguage };
  }
  function powershellEvent(commandLine) {
    return shellEvent(commandLine, "powershell");
  }
  setup(async () => {
    const baseTmp = process.env.AGENT_TEMPDIRECTORY || process.env.RUNNER_TEMP || tmpdir();
    workDir = realpathSync(mkdtempSync(join(baseTmp, "sesperm-work-")));
    workDir2 = realpathSync(mkdtempSync(join(baseTmp, "sesperm-work2-")));
    outsideDir = realpathSync(mkdtempSync(join(baseTmp, "sesperm-out-")));
    manager = disposables.add(new AgentHostStateManager(new NullLogService()));
    configService = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
    const baseSessionDataService = createSessionDataService();
    const sessionDataRoot = URI.file(join(outsideDir, "session-data"));
    sessionDataService = {
      ...baseSessionDataService,
      getSessionDataDir: (session) => URI.joinPath(sessionDataRoot, session.path.slice(1))
    };
    permissions = disposables.add(new SessionPermissionManager(manager, {}, configService, new NullLogService(), sessionDataService));
    await permissions.initialize();
    manager.createSession(makeSummary(sessionUri, URI.file(workDir).toString()));
  });
  teardown(() => {
    disposables.clear();
    rmSync(workDir, { recursive: true, force: true });
    rmSync(workDir2, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("auto-approves a normal file inside the working directory", async () => {
    const result = await permissions.getAutoApproval(writeEvent(join(workDir, "src", "app.ts")), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
  });
  test("auto-approves an owning-session attachment for a peer chat but not another session attachment", async () => {
    const peerChat = buildChatUri(sessionUri, "peer");
    const attachmentPath = URI.joinPath(
      sessionDataService.getSessionDataDir(URI.parse(sessionUri)),
      SESSION_ATTACHMENTS_DIRNAME,
      "attachment-id",
      "Pasted text #1.txt"
    ).fsPath;
    const otherAttachmentPath = URI.joinPath(
      sessionDataService.getSessionDataDir(URI.from({ scheme: "copilot", path: "/other" })),
      SESSION_ATTACHMENTS_DIRNAME,
      "attachment-id",
      "other.txt"
    ).fsPath;
    const results = await Promise.all([
      permissions.getAutoApproval(readEvent(attachmentPath, peerChat), peerChat),
      permissions.getAutoApproval(readEvent(otherAttachmentPath, peerChat), peerChat)
    ]);
    assert.deepStrictEqual(results, [ToolCallConfirmationReason.NotNeeded, void 0]);
  });
  test("requires confirmation for writes outside the working directory", async () => {
    const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, "app.ts")), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("requires confirmation for protected files inside the working directory", async () => {
    const files = [
      ".env",
      "package.json",
      "Cargo.toml",
      "build.gradle",
      "build.gradle.kts",
      "gradle.properties",
      join("ruby_lsp", "example", "addon"),
      join(".git", "config"),
      "deps.lock",
      join(".vscode", "settings.json")
    ];
    const results = [];
    for (const file of files) {
      results.push(await permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri));
    }
    assert.deepStrictEqual(results, files.map(() => void 0));
  });
  if (!isLinux) {
    test("requires confirmation for protected files with non-canonical casing", async () => {
      const files = [".ENV", "Package.json", join(".GIT", "config"), join(".VSCODE", "settings.json")];
      const results = await Promise.all(files.map((file) => permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri)));
      assert.deepStrictEqual(results, files.map(() => void 0));
    });
  }
  test("respects forwarded edit auto-approve patterns", async () => {
    configService.updateRootConfig({
      [AgentHostEditAutoApprovePatternsConfigKey]: {
        "**/*": false,
        "**/*.ts": true,
        "**/.github/hooks/**": true
      }
    });
    assert.deepStrictEqual([
      await permissions.getAutoApproval(writeEvent(join(workDir, "src", "app.ts")), sessionUri),
      await permissions.getAutoApproval(writeEvent(join(workDir, "README.md")), sessionUri),
      await permissions.getAutoApproval(writeEvent(join(workDir, ".github", "hooks", "pre-tool.json")), sessionUri)
    ], [ToolCallConfirmationReason.NotNeeded, void 0, void 0]);
  });
  test("merges configured edit auto-approve patterns with defaults", () => {
    assert.deepStrictEqual(mergeChatEditAutoApprovePatterns({
      "**/generated/**": false
    }), {
      ...DEFAULT_EDIT_AUTO_APPROVE_PATTERNS,
      "**/generated/**": false
    });
  });
  test("overriding a default pattern keeps the configured order", async () => {
    const patterns = mergeChatEditAutoApprovePatterns({ "**/*.ts": true, "**/*": false });
    configService.updateRootConfig({ [AgentHostEditAutoApprovePatternsConfigKey]: patterns });
    assert.deepStrictEqual({
      lastPatterns: Object.keys(patterns).slice(-2),
      approval: await permissions.getAutoApproval(writeEvent(join(workDir, "src", "app.ts")), sessionUri)
    }, {
      lastPatterns: ["**/*.ts", "**/*"],
      approval: void 0
    });
  });
  test("malformed edit auto-approve values fail closed", async () => {
    configService.updateRootConfig({
      [AgentHostEditAutoApprovePatternsConfigKey]: {
        "**/*": "false"
      }
    });
    const result = await permissions.getAutoApproval(writeEvent(join(workDir, "src", "app.ts")), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("requires confirmation for files that can register lifecycle hooks", async () => {
    const files = [
      join(".github", "agents", "dev-helper.md"),
      join(".github", "hooks", "say-hi.json"),
      join(".claude", "agents", "dev-helper.md"),
      join(".claude", "settings.json"),
      join(".claude", "settings.local.json")
    ];
    const results = [];
    for (const file of files) {
      results.push(await permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri));
    }
    assert.deepStrictEqual(results, files.map(() => void 0));
  });
  test("requires confirmation for package manager configuration files", async () => {
    const files = [
      ".npmrc",
      ".yarnrc",
      ".yarnrc.yml",
      ".pnpmfile.js",
      ".pnpmfile.cjs",
      ".pnpmfile.mjs",
      "pnpm-workspace.yaml",
      join("packages", "nested", ".npmrc")
    ];
    const results = [];
    for (const file of files) {
      results.push(await permissions.getAutoApproval(writeEvent(join(workDir, file)), sessionUri));
    }
    assert.deepStrictEqual(results, files.map(() => void 0));
  });
  test("requires confirmation for paths containing null bytes", async () => {
    const result = await permissions.getAutoApproval(writeEvent(join(workDir, "a\0b.txt")), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("requires confirmation when a symlink redirects outside the working directory", async () => {
    symlinkSync(outsideDir, join(workDir, "link"), directoryLinkType);
    const result = await permissions.getAutoApproval(writeEvent(join(workDir, "link", "secret.txt")), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("auto-approves when a symlink stays inside the working directory", async () => {
    mkdirSync(join(workDir, "real"));
    symlinkSync(join(workDir, "real"), join(workDir, "link-in"), directoryLinkType);
    const result = await permissions.getAutoApproval(writeEvent(join(workDir, "link-in", "note.txt")), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
  });
  test("requires confirmation for home-directory dotfiles", async () => {
    const homeSession = URI.from({ scheme: "copilot", path: "/home" }).toString();
    manager.createSession(makeSummary(homeSession, URI.file(homedir()).toString()));
    const result = await permissions.getAutoApproval(writeEvent(join(homedir(), ".sesperm-config-xyz")), homeSession);
    assert.strictEqual(result, void 0);
  });
  test("auto-approves any write when session bypass is enabled", async () => {
    manager.setSessionConfig(sessionUri, {
      schema: platformSessionSchema.toProtocol(),
      values: { [SessionConfigKey.AutoApprove]: "autoApprove" }
    });
    const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, "anything.txt")), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.Setting);
  });
  test("auto-approves reads inside but requires confirmation outside the working directory", async () => {
    const inside = await permissions.getAutoApproval(readEvent(join(workDir, "a.txt")), sessionUri);
    const outside = await permissions.getAutoApproval(readEvent(join(outsideDir, "a.txt")), sessionUri);
    assert.deepStrictEqual([inside, outside], [ToolCallConfirmationReason.NotNeeded, void 0]);
  });
  test("requires confirmation when the working directory is not a file URI", async () => {
    const remoteSessionUri = URI.from({ scheme: "copilot", path: "/remote" }).toString();
    const remoteWorkingDirectory = URI.from({ scheme: Schemas.vscodeRemote, authority: "ssh-remote+host", path: URI.file(workDir).path });
    manager.createSession(makeSummary(remoteSessionUri, remoteWorkingDirectory.toString()));
    const result = await permissions.getAutoApproval(readEvent(join(workDir, "a.txt"), remoteSessionUri), remoteSessionUri);
    assert.strictEqual(result, void 0);
  });
  test("requires confirmation when a symlinked read ancestor redirects outside the working directory", async () => {
    mkdirSync(join(workDir, "nested"));
    symlinkSync(outsideDir, join(workDir, "nested", "link"), directoryLinkType);
    const result = await permissions.getAutoApproval(readEvent(join(workDir, "nested", "link", "secret.txt")), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("auto-approves a read through a symlink that stays inside the working directory", async () => {
    mkdirSync(join(workDir, "real-read"));
    symlinkSync(join(workDir, "real-read"), join(workDir, "link-read"), directoryLinkType);
    const result = await permissions.getAutoApproval(readEvent(join(workDir, "link-read", "note.txt")), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
  });
  test("requires confirmation when only the real read path is inside the working directory", async () => {
    symlinkSync(workDir, join(outsideDir, "link-to-workspace"), directoryLinkType);
    const result = await permissions.getAutoApproval(readEvent(join(outsideDir, "link-to-workspace", "note.txt")), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("auto-approves reads when the working directory is itself symlinked", async () => {
    const linkedWorkDir = join(outsideDir, "linked-workspace");
    const linkedSessionUri = URI.from({ scheme: "copilot", path: "/linked" }).toString();
    symlinkSync(workDir, linkedWorkDir, directoryLinkType);
    manager.createSession(makeSummary(linkedSessionUri, URI.file(linkedWorkDir).toString()));
    const result = await permissions.getAutoApproval(readEvent(join(linkedWorkDir, "note.txt"), linkedSessionUri), linkedSessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
  });
  test("requires confirmation when read realpath resolution is denied", async () => {
    const results = [];
    for (const code of ["EACCES", "EPERM"]) {
      const deniedPermissions = disposables.add(new SessionPermissionManager(manager, {
        realpath: async () => {
          const error = new Error(`realpath failed with ${code}`);
          error.code = code;
          throw error;
        }
      }, configService, new NullLogService(), sessionDataService));
      await deniedPermissions.initialize();
      results.push(await deniedPermissions.getAutoApproval(readEvent(join(workDir, "secret.txt")), sessionUri));
    }
    assert.deepStrictEqual(results, [void 0, void 0]);
  });
  test("auto-approves shell commands in default permission mode when terminal auto-approve is enabled", async () => {
    const result = await permissions.getAutoApproval(shellEvent("echo hello", "bash"), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
  });
  test("requires confirmation for sed in-place edits", async () => {
    const event = shellEvent('sed -i "s/foo/bar/" file.txt', "bash");
    assert.deepStrictEqual({
      approval: await permissions.getAutoApproval(event, sessionUri),
      ruleResolvable: permissions.isAutoApproveRuleResolvable(event, sessionUri)
    }, {
      approval: void 0,
      ruleResolvable: false
    });
  });
  test("uses forwarded terminal auto-approve rules as the source of truth over fallback defaults", async () => {
    configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: {} });
    const result = await permissions.getAutoApproval(shellEvent("echo hello", "bash"), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("respects forwarded terminal auto-approve deny rules in default permission mode", async () => {
    configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: { echo: false } });
    const result = await permissions.getAutoApproval(shellEvent("echo hello", "bash"), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("respects forwarded terminal auto-approve allow rules in default permission mode", async () => {
    configService.updateRootConfig({ [AgentHostTerminalAutoApproveRulesConfigKey]: { python: true } });
    const result = await permissions.getAutoApproval(shellEvent("python script.py", "bash"), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
  });
  test("requires confirmation for shell commands in default permission mode when terminal auto-approve is disabled", async () => {
    configService.updateRootConfig({
      [AgentHostTerminalAutoApproveEnabledConfigKey]: false,
      [AgentHostTerminalAutoApproveRulesConfigKey]: { echo: true }
    });
    const result = await permissions.getAutoApproval(shellEvent("echo hello", "bash"), sessionUri);
    assert.strictEqual(result, void 0);
  });
  test("isAutoApproveRuleResolvable is true only when a missing allow rule is the sole blocker", () => {
    const cases = [
      ["unknown command", shellEvent("my-custom-script", "bash"), true],
      ["already approved", shellEvent("echo hello", "bash"), false],
      ["denied", shellEvent("rm file.txt", "bash"), false],
      ["unapproved write redirect", shellEvent("my-custom-script > /etc/passwd", "bash"), false],
      ["sandbox bypass", { ...shellEvent("my-custom-script", "bash"), requestSandboxBypass: true }, false],
      ["non-shell", writeEvent("/outside/app.ts"), false]
    ];
    assert.deepStrictEqual(
      cases.map(([name, e]) => `${name}=${permissions.isAutoApproveRuleResolvable(e, sessionUri)}`),
      cases.map(([name, , expected]) => `${name}=${expected}`)
    );
  });
  test("isAutoApproveRuleResolvable is false when terminal auto-approve is disabled", () => {
    configService.updateRootConfig({ [AgentHostTerminalAutoApproveEnabledConfigKey]: false });
    assert.strictEqual(permissions.isAutoApproveRuleResolvable(shellEvent("my-custom-script", "bash"), sessionUri), false);
  });
  test("shell approval and rule eligibility respect the event shell language", async () => {
    const pwshEvent = powershellEvent("get-childitem");
    assert.deepStrictEqual([
      await permissions.getAutoApproval(pwshEvent, sessionUri),
      await permissions.getAutoApproval(shellEvent("get-childitem", "bash"), sessionUri),
      permissions.isAutoApproveRuleResolvable(pwshEvent, sessionUri),
      permissions.isAutoApproveRuleResolvable(shellEvent("get-childitem", "bash"), sessionUri)
    ], [ToolCallConfirmationReason.NotNeeded, void 0, false, true]);
  });
  test("PowerShell script-block payloads with nested denials require confirmation", async () => {
    configService.updateRootConfig({
      [AgentHostTerminalAutoApproveRulesConfigKey]: {
        "Measure-Command": true,
        "Set-Content": false,
        "Invoke-Expression": false
      }
    });
    assert.deepStrictEqual([
      await permissions.getAutoApproval(powershellEvent("Measure-Command { Set-Content -Path out.txt -Value pwned }"), sessionUri),
      await permissions.getAutoApproval(powershellEvent('Measure-Command { Invoke-Expression "Write-Output hi" }'), sessionUri),
      await permissions.getAutoApproval(shellEvent("Write-Host hi; Set-Content -Path out.txt -Value pwned", "powershell"), sessionUri),
      // Missing dialect remains fail-closed even for an otherwise allowlisted outer command.
      await permissions.getAutoApproval(shellEvent("Measure-Command { Get-ChildItem }", void 0), sessionUri)
    ], [void 0, void 0, void 0, void 0]);
  });
  test("PowerShell redirects require a literal approved destination", async () => {
    const dynamicResults = [];
    for (const dest of ["$HOME/outside.txt", "$env:TEMP/x.txt", "$(Get-Location)/x.txt", "`pwd`/x.txt", "${HOME}/x.txt", "%APPDATA%/x.txt"]) {
      dynamicResults.push(await permissions.getAutoApproval(powershellEvent(`Write-Host hi >${dest}`), sessionUri));
    }
    assert.deepStrictEqual({
      dynamicResults,
      literalWorkspaceDestination: await permissions.getAutoApproval(powershellEvent("Write-Host hi >out.txt"), sessionUri),
      nullSink: await permissions.getAutoApproval(powershellEvent("Write-Host hi >$null"), sessionUri)
    }, {
      dynamicResults: [void 0, void 0, void 0, void 0, void 0, void 0],
      literalWorkspaceDestination: ToolCallConfirmationReason.NotNeeded,
      nullSink: ToolCallConfirmationReason.NotNeeded
    });
  });
  test("CMD delayed-expansion redirect destinations require confirmation", async () => {
    const delayedExpansion = shellEvent("echo hi >!APPDATA!\\outside.txt", "bash");
    const literalExclamation = shellEvent("echo hi >important!.txt", "bash");
    assert.deepStrictEqual({
      delayedApproval: await permissions.getAutoApproval(delayedExpansion, sessionUri),
      delayedRuleResolvable: permissions.isAutoApproveRuleResolvable(delayedExpansion, sessionUri),
      literalApproval: await permissions.getAutoApproval(literalExclamation, sessionUri)
    }, {
      delayedApproval: void 0,
      delayedRuleResolvable: false,
      literalApproval: ToolCallConfirmationReason.NotNeeded
    });
  });
  test("missing shell language disables terminal rules and rule suggestions", async () => {
    const event = shellEvent("Get-ChildItem", void 0);
    assert.deepStrictEqual({
      approval: await permissions.getAutoApproval(event, sessionUri),
      ruleResolvable: permissions.isAutoApproveRuleResolvable(event, sessionUri)
    }, {
      approval: void 0,
      ruleResolvable: false
    });
  });
  test("does not affect session bypass permission mode when terminal auto-approve is disabled", async () => {
    configService.updateRootConfig({
      [AgentHostTerminalAutoApproveEnabledConfigKey]: false,
      [AgentHostTerminalAutoApproveRulesConfigKey]: { echo: false }
    });
    manager.setSessionConfig(sessionUri, {
      schema: platformSessionSchema.toProtocol(),
      values: { [SessionConfigKey.AutoApprove]: "autoApprove" }
    });
    const result = await permissions.getAutoApproval(shellEvent("echo hello", "bash"), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.Setting);
  });
  test("auto-approves any write when global auto-approve is enabled, even in default permission mode", async () => {
    configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });
    const result = await permissions.getAutoApproval(writeEvent(join(outsideDir, "anything.txt")), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.Setting);
  });
  test("auto-approves shell commands when global auto-approve is enabled, even with terminal auto-approve disabled", async () => {
    configService.updateRootConfig({
      [AgentHostGlobalAutoApproveEnabledConfigKey]: true,
      [AgentHostTerminalAutoApproveEnabledConfigKey]: false
    });
    const result = await permissions.getAutoApproval(shellEvent("rm -rf /tmp/whatever", "bash"), sessionUri);
    assert.strictEqual(result, ToolCallConfirmationReason.Setting);
  });
  test("global auto-approve is reported independently of the session permission picker", () => {
    assert.strictEqual(permissions.isGlobalAutoApproveEnabled(), false);
    assert.strictEqual(permissions.isSessionAutoApproveEnabled(sessionUri), false);
    configService.updateRootConfig({ [AgentHostGlobalAutoApproveEnabledConfigKey]: true });
    assert.strictEqual(permissions.isGlobalAutoApproveEnabled(), true);
    assert.strictEqual(permissions.isSessionAutoApproveEnabled(sessionUri), false);
  });
  suite("multi-root", () => {
    const multiUri = URI.from({ scheme: "copilot", path: "/multi" }).toString();
    setup(() => {
      manager.createSession(makeSummary(multiUri, URI.file(workDir).toString(), URI.file(workDir2).toString()));
    });
    test("auto-approves reads and writes under any root, confirms outside all roots", async () => {
      const results = [
        await permissions.getAutoApproval(readEvent(join(workDir, "a.txt"), multiUri), multiUri),
        await permissions.getAutoApproval(readEvent(join(workDir2, "a.txt"), multiUri), multiUri),
        await permissions.getAutoApproval(readEvent(join(outsideDir, "a.txt"), multiUri), multiUri),
        await permissions.getAutoApproval(writeEvent(join(workDir, "x.txt")), multiUri),
        await permissions.getAutoApproval(writeEvent(join(workDir2, "x.txt")), multiUri),
        await permissions.getAutoApproval(writeEvent(join(outsideDir, "x.txt")), multiUri)
      ];
      assert.deepStrictEqual(results, [
        ToolCallConfirmationReason.NotNeeded,
        ToolCallConfirmationReason.NotNeeded,
        void 0,
        ToolCallConfirmationReason.NotNeeded,
        ToolCallConfirmationReason.NotNeeded,
        void 0
      ]);
    });
    test("a relative shell redirect resolves against the primary root (index 0)", async () => {
      const result = await permissions.getAutoApproval(shellEvent("echo hi > out.txt", "bash"), multiUri);
      assert.strictEqual(result, ToolCallConfirmationReason.NotNeeded);
    });
    (isWindows ? test.skip : test)("an absolute shell redirect auto-approves under a non-primary root but confirms outside", async () => {
      const intoPeer = await permissions.getAutoApproval(shellEvent(`echo hi > ${join(workDir2, "out.txt")}`, "bash"), multiUri);
      const outside = await permissions.getAutoApproval(shellEvent(`echo hi > ${join(outsideDir, "out.txt")}`, "bash"), multiUri);
      assert.deepStrictEqual([intoPeer, outside], [ToolCallConfirmationReason.NotNeeded, void 0]);
    });
    test("requires confirmation for a symlink that crosses from one root into another (fail-closed)", async () => {
      symlinkSync(workDir2, join(workDir, "cross-link"), directoryLinkType);
      const read = await permissions.getAutoApproval(readEvent(join(workDir, "cross-link", "note.txt"), multiUri), multiUri);
      const write = await permissions.getAutoApproval(writeEvent(join(workDir, "cross-link", "note.txt")), multiUri);
      assert.deepStrictEqual([read, write], [void 0, void 0]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzZXNzaW9uUGVybWlzc2lvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIHJlYWxwYXRoU3luYywgcm1TeW5jLCBzeW1saW5rU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGhvbWVkaXIsIHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4LCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEVkaXRBdXRvQXBwcm92ZVBhdHRlcm5zQ29uZmlnS2V5LCBBZ2VudEhvc3RHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXksIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTY2hlbWEuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSwgU0VTU0lPTl9BVFRBQ0hNRU5UU19ESVJOQU1FIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRfQVVUT19BUFBST1ZFX1BBVFRFUk5TLCBtZXJnZUNoYXRFZGl0QXV0b0FwcHJvdmVQYXR0ZXJucyB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyLCB0eXBlIElUb29sQXBwcm92YWxFdmVudCB9IGZyb20gJy4uLy4uL25vZGUvc2Vzc2lvblBlcm1pc3Npb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuXG5zdWl0ZSgnU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRsZXQgY29uZmlnU2VydmljZTogQWdlbnRDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHBlcm1pc3Npb25zOiBTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXI7XG5cdGxldCBzZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2U7XG5cblx0Ly8gUmVhbCAoc3ltbGluay1yZXNvbHZlZCkgdGVtcCBkaXJlY3RvcmllcyBzbyB0aGF0IHRoZSBzeW1saW5rLXJlc29sdXRpb25cblx0Ly8gY2hlY2tzIGNvbXBhcmUgbGlrZS1mb3ItbGlrZSAoZS5nLiBtYWNPUyBgL3ZhcmAgLT4gYC9wcml2YXRlL3ZhcmApLlxuXHRsZXQgd29ya0Rpcjogc3RyaW5nO1xuXHRsZXQgd29ya0RpcjI6IHN0cmluZztcblx0bGV0IG91dHNpZGVEaXI6IHN0cmluZztcblx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvcycgfSkudG9TdHJpbmcoKTtcblx0Y29uc3QgZGlyZWN0b3J5TGlua1R5cGUgPSBpc1dpbmRvd3MgPyAnanVuY3Rpb24nIDogJ2Rpcic7XG5cblx0ZnVuY3Rpb24gbWFrZVN1bW1hcnkocmVzb3VyY2U6IHN0cmluZywgLi4ud29ya2luZ0RpcmVjdG9yaWVzOiBzdHJpbmdbXSk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0dGl0bGU6ICd0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnUHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yaWVzLmxlbmd0aCA+IDAgPyB3b3JraW5nRGlyZWN0b3JpZXMgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHdyaXRlRXZlbnQocGVybWlzc2lvblBhdGg6IHN0cmluZyk6IElUb29sQXBwcm92YWxFdmVudCB7XG5cdFx0cmV0dXJuIHsgdG9vbENhbGxJZDogJ3RjLTEnLCBzZXNzaW9uOiBVUkkucGFyc2Uoc2Vzc2lvblVyaSksIHBlcm1pc3Npb25LaW5kOiAnd3JpdGUnLCBwZXJtaXNzaW9uUGF0aCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVhZEV2ZW50KHBlcm1pc3Npb25QYXRoOiBzdHJpbmcsIHJlc291cmNlID0gc2Vzc2lvblVyaSk6IElUb29sQXBwcm92YWxFdmVudCB7XG5cdFx0cmV0dXJuIHsgdG9vbENhbGxJZDogJ3RjLXJlYWQnLCBzZXNzaW9uOiBVUkkucGFyc2UocmVzb3VyY2UpLCBwZXJtaXNzaW9uS2luZDogJ3JlYWQnLCBwZXJtaXNzaW9uUGF0aCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2hlbGxFdmVudChjb21tYW5kTGluZTogc3RyaW5nLCBzaGVsbExhbmd1YWdlOiBJVG9vbEFwcHJvdmFsRXZlbnRbJ3NoZWxsTGFuZ3VhZ2UnXSk6IElUb29sQXBwcm92YWxFdmVudCB7XG5cdFx0cmV0dXJuIHsgdG9vbENhbGxJZDogJ3RjLXNoZWxsJywgc2Vzc2lvbjogVVJJLnBhcnNlKHNlc3Npb25VcmkpLCBwZXJtaXNzaW9uS2luZDogJ3NoZWxsJywgdG9vbElucHV0OiBjb21tYW5kTGluZSwgc2hlbGxMYW5ndWFnZSB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcG93ZXJzaGVsbEV2ZW50KGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBJVG9vbEFwcHJvdmFsRXZlbnQge1xuXHRcdHJldHVybiBzaGVsbEV2ZW50KGNvbW1hbmRMaW5lLCAncG93ZXJzaGVsbCcpO1xuXHR9XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFByZWZlciB0aGUgQ0kgcnVubmVyIHRlbXAgZGlyIChhIHBsYWluIGxvbmcgcGF0aCkgb3ZlciBgb3MudG1wZGlyKClgLFxuXHRcdC8vIHdoaWNoIG9uIFdpbmRvd3MgQ0kgaXMgYW4gOC4zIHNob3J0IHBhdGggKGBDOlxcVXNlcnNcXFJVTk5FUn4xXFwuLi5gKSB0aGF0XG5cdFx0Ly8gYGFzc2VydFBhdGhJc1NhZmVgIHJlamVjdHMgZm9yIGl0cyBgfjFgIHNlZ21lbnQgXHUyMDE0IHdoaWNoIHdvdWxkIG1ha2UgZXZlcnlcblx0XHQvLyB3cml0ZSBhdXRvLWFwcHJvdmFsIGZhaWwuIGBBR0VOVF9URU1QRElSRUNUT1JZYCBpcyBzZXQgYnkgQXp1cmUgRGV2T3BzXG5cdFx0Ly8gKFZTIENvZGUncyBDSSkgYW5kIGBSVU5ORVJfVEVNUGAgYnkgR2l0SHViIEFjdGlvbnMuIE5vdGUgdGhhdCB0aGUgSlNcblx0XHQvLyBgZnMucmVhbHBhdGhTeW5jYCBkb2VzIG5vdCBleHBhbmQgOC4zIHNob3J0IG5hbWVzIHRvIHRoZWlyIGxvbmcgZm9ybSwgc29cblx0XHQvLyB0aGUgc2hvcnQtcGF0aCBmYWxsYmFjayBjYW4ndCBiZSByZXBhaXJlZCBhZnRlcndhcmRzLiBgcmVhbHBhdGhTeW5jYFxuXHRcdC8vIGtlZXBzIG1hY09TIGAvdmFyYCAtPiBgL3ByaXZhdGUvdmFyYCBjb25zaXN0ZW50IHNvIHRoZSBzeW1saW5rLXJlc29sdXRpb25cblx0XHQvLyBjaGVja3MgY29tcGFyZSBsaWtlLWZvci1saWtlLlxuXHRcdGNvbnN0IGJhc2VUbXAgPSBwcm9jZXNzLmVudi5BR0VOVF9URU1QRElSRUNUT1JZIHx8IHByb2Nlc3MuZW52LlJVTk5FUl9URU1QIHx8IHRtcGRpcigpO1xuXHRcdHdvcmtEaXIgPSByZWFscGF0aFN5bmMobWtkdGVtcFN5bmMoam9pbihiYXNlVG1wLCAnc2VzcGVybS13b3JrLScpKSk7XG5cdFx0d29ya0RpcjIgPSByZWFscGF0aFN5bmMobWtkdGVtcFN5bmMoam9pbihiYXNlVG1wLCAnc2VzcGVybS13b3JrMi0nKSkpO1xuXHRcdG91dHNpZGVEaXIgPSByZWFscGF0aFN5bmMobWtkdGVtcFN5bmMoam9pbihiYXNlVG1wLCAnc2VzcGVybS1vdXQtJykpKTtcblxuXHRcdG1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbmZpZ1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBiYXNlU2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGFSb290ID0gVVJJLmZpbGUoam9pbihvdXRzaWRlRGlyLCAnc2Vzc2lvbi1kYXRhJykpO1xuXHRcdHNlc3Npb25EYXRhU2VydmljZSA9IHtcblx0XHRcdC4uLmJhc2VTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRnZXRTZXNzaW9uRGF0YURpcjogc2Vzc2lvbiA9PiBVUkkuam9pblBhdGgoc2Vzc2lvbkRhdGFSb290LCBzZXNzaW9uLnBhdGguc2xpY2UoMSkpLFxuXHRcdH07XG5cdFx0cGVybWlzc2lvbnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25QZXJtaXNzaW9uTWFuYWdlcihtYW5hZ2VyLCB7fSwgY29uZmlnU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSkpO1xuXHRcdGF3YWl0IHBlcm1pc3Npb25zLmluaXRpYWxpemUoKTtcblxuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShzZXNzaW9uVXJpLCBVUkkuZmlsZSh3b3JrRGlyKS50b1N0cmluZygpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHJtU3luYyh3b3JrRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0cm1TeW5jKHdvcmtEaXIyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0cm1TeW5jKG91dHNpZGVEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnYXV0by1hcHByb3ZlcyBhIG5vcm1hbCBmaWxlIGluc2lkZSB0aGUgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbih3b3JrRGlyLCAnc3JjJywgJ2FwcC50cycpKSwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0by1hcHByb3ZlcyBhbiBvd25pbmctc2Vzc2lvbiBhdHRhY2htZW50IGZvciBhIHBlZXIgY2hhdCBidXQgbm90IGFub3RoZXIgc2Vzc2lvbiBhdHRhY2htZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyJyk7XG5cdFx0Y29uc3QgYXR0YWNobWVudFBhdGggPSBVUkkuam9pblBhdGgoXG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UuZ2V0U2Vzc2lvbkRhdGFEaXIoVVJJLnBhcnNlKHNlc3Npb25VcmkpKSxcblx0XHRcdFNFU1NJT05fQVRUQUNITUVOVFNfRElSTkFNRSxcblx0XHRcdCdhdHRhY2htZW50LWlkJyxcblx0XHRcdCdQYXN0ZWQgdGV4dCAjMS50eHQnLFxuXHRcdCkuZnNQYXRoO1xuXHRcdGNvbnN0IG90aGVyQXR0YWNobWVudFBhdGggPSBVUkkuam9pblBhdGgoXG5cdFx0XHRzZXNzaW9uRGF0YVNlcnZpY2UuZ2V0U2Vzc2lvbkRhdGFEaXIoVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9vdGhlcicgfSkpLFxuXHRcdFx0U0VTU0lPTl9BVFRBQ0hNRU5UU19ESVJOQU1FLFxuXHRcdFx0J2F0dGFjaG1lbnQtaWQnLFxuXHRcdFx0J290aGVyLnR4dCcsXG5cdFx0KS5mc1BhdGg7XG5cblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0cGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHJlYWRFdmVudChhdHRhY2htZW50UGF0aCwgcGVlckNoYXQpLCBwZWVyQ2hhdCksXG5cdFx0XHRwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocmVhZEV2ZW50KG90aGVyQXR0YWNobWVudFBhdGgsIHBlZXJDaGF0KSwgcGVlckNoYXQpLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLCBbVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLCB1bmRlZmluZWRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWlyZXMgY29uZmlybWF0aW9uIGZvciB3cml0ZXMgb3V0c2lkZSB0aGUgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbihvdXRzaWRlRGlyLCAnYXBwLnRzJykpLCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1aXJlcyBjb25maXJtYXRpb24gZm9yIHByb3RlY3RlZCBmaWxlcyBpbnNpZGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVzID0gW1xuXHRcdFx0Jy5lbnYnLFxuXHRcdFx0J3BhY2thZ2UuanNvbicsXG5cdFx0XHQnQ2FyZ28udG9tbCcsXG5cdFx0XHQnYnVpbGQuZ3JhZGxlJyxcblx0XHRcdCdidWlsZC5ncmFkbGUua3RzJyxcblx0XHRcdCdncmFkbGUucHJvcGVydGllcycsXG5cdFx0XHRqb2luKCdydWJ5X2xzcCcsICdleGFtcGxlJywgJ2FkZG9uJyksXG5cdFx0XHRqb2luKCcuZ2l0JywgJ2NvbmZpZycpLFxuXHRcdFx0J2RlcHMubG9jaycsXG5cdFx0XHRqb2luKCcudnNjb2RlJywgJ3NldHRpbmdzLmpzb24nKSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlc3VsdHM6IChUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiB8IHVuZGVmaW5lZClbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0cmVzdWx0cy5wdXNoKGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbCh3cml0ZUV2ZW50KGpvaW4od29ya0RpciwgZmlsZSkpLCBzZXNzaW9uVXJpKSk7XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgZmlsZXMubWFwKCgpID0+IHVuZGVmaW5lZCkpO1xuXHR9KTtcblxuXHRpZiAoIWlzTGludXgpIHtcblx0XHR0ZXN0KCdyZXF1aXJlcyBjb25maXJtYXRpb24gZm9yIHByb3RlY3RlZCBmaWxlcyB3aXRoIG5vbi1jYW5vbmljYWwgY2FzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZXMgPSBbJy5FTlYnLCAnUGFja2FnZS5qc29uJywgam9pbignLkdJVCcsICdjb25maWcnKSwgam9pbignLlZTQ09ERScsICdzZXR0aW5ncy5qc29uJyldO1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKGZpbGVzLm1hcChmaWxlID0+IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbCh3cml0ZUV2ZW50KGpvaW4od29ya0RpciwgZmlsZSkpLCBzZXNzaW9uVXJpKSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLCBmaWxlcy5tYXAoKCkgPT4gdW5kZWZpbmVkKSk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdyZXNwZWN0cyBmb3J3YXJkZWQgZWRpdCBhdXRvLWFwcHJvdmUgcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS51cGRhdGVSb290Q29uZmlnKHtcblx0XHRcdFtBZ2VudEhvc3RFZGl0QXV0b0FwcHJvdmVQYXR0ZXJuc0NvbmZpZ0tleV06IHtcblx0XHRcdFx0JyoqLyonOiBmYWxzZSxcblx0XHRcdFx0JyoqLyoudHMnOiB0cnVlLFxuXHRcdFx0XHQnKiovLmdpdGh1Yi9ob29rcy8qKic6IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwod3JpdGVFdmVudChqb2luKHdvcmtEaXIsICdzcmMnLCAnYXBwLnRzJykpLCBzZXNzaW9uVXJpKSxcblx0XHRcdGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbCh3cml0ZUV2ZW50KGpvaW4od29ya0RpciwgJ1JFQURNRS5tZCcpKSwgc2Vzc2lvblVyaSksXG5cdFx0XHRhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwod3JpdGVFdmVudChqb2luKHdvcmtEaXIsICcuZ2l0aHViJywgJ2hvb2tzJywgJ3ByZS10b29sLmpzb24nKSksIHNlc3Npb25VcmkpLFxuXHRcdF0sIFtUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlcyBjb25maWd1cmVkIGVkaXQgYXV0by1hcHByb3ZlIHBhdHRlcm5zIHdpdGggZGVmYXVsdHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXJnZUNoYXRFZGl0QXV0b0FwcHJvdmVQYXR0ZXJucyh7XG5cdFx0XHQnKiovZ2VuZXJhdGVkLyoqJzogZmFsc2UsXG5cdFx0fSksIHtcblx0XHRcdC4uLkRFRkFVTFRfRURJVF9BVVRPX0FQUFJPVkVfUEFUVEVSTlMsXG5cdFx0XHQnKiovZ2VuZXJhdGVkLyoqJzogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ292ZXJyaWRpbmcgYSBkZWZhdWx0IHBhdHRlcm4ga2VlcHMgdGhlIGNvbmZpZ3VyZWQgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gYCcqKi8qJzogZmFsc2VgIGlzIGNvbmZpZ3VyZWQgbGFzdCwgc28gaXQgaGFzIHRvIGRlY2lkZSB0aGUgb3V0Y29tZSBmb3IgYVxuXHRcdC8vIGZpbGUgdGhlIGVhcmxpZXIgYCcqKi8qLnRzJ2AgcnVsZSB3b3VsZCBvdGhlcndpc2UgYXBwcm92ZS5cblx0XHRjb25zdCBwYXR0ZXJucyA9IG1lcmdlQ2hhdEVkaXRBdXRvQXBwcm92ZVBhdHRlcm5zKHsgJyoqLyoudHMnOiB0cnVlLCAnKiovKic6IGZhbHNlIH0pO1xuXHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtBZ2VudEhvc3RFZGl0QXV0b0FwcHJvdmVQYXR0ZXJuc0NvbmZpZ0tleV06IHBhdHRlcm5zIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYXN0UGF0dGVybnM6IE9iamVjdC5rZXlzKHBhdHRlcm5zKS5zbGljZSgtMiksXG5cdFx0XHRhcHByb3ZhbDogYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbih3b3JrRGlyLCAnc3JjJywgJ2FwcC50cycpKSwgc2Vzc2lvblVyaSksXG5cdFx0fSwge1xuXHRcdFx0bGFzdFBhdHRlcm5zOiBbJyoqLyoudHMnLCAnKiovKiddLFxuXHRcdFx0YXBwcm92YWw6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFsZm9ybWVkIGVkaXQgYXV0by1hcHByb3ZlIHZhbHVlcyBmYWlsIGNsb3NlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoe1xuXHRcdFx0W0FnZW50SG9zdEVkaXRBdXRvQXBwcm92ZVBhdHRlcm5zQ29uZmlnS2V5XToge1xuXHRcdFx0XHQnKiovKic6ICdmYWxzZScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbih3b3JrRGlyLCAnc3JjJywgJ2FwcC50cycpKSwgc2Vzc2lvblVyaSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1aXJlcyBjb25maXJtYXRpb24gZm9yIGZpbGVzIHRoYXQgY2FuIHJlZ2lzdGVyIGxpZmVjeWNsZSBob29rcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlcyA9IFtcblx0XHRcdGpvaW4oJy5naXRodWInLCAnYWdlbnRzJywgJ2Rldi1oZWxwZXIubWQnKSxcblx0XHRcdGpvaW4oJy5naXRodWInLCAnaG9va3MnLCAnc2F5LWhpLmpzb24nKSxcblx0XHRcdGpvaW4oJy5jbGF1ZGUnLCAnYWdlbnRzJywgJ2Rldi1oZWxwZXIubWQnKSxcblx0XHRcdGpvaW4oJy5jbGF1ZGUnLCAnc2V0dGluZ3MuanNvbicpLFxuXHRcdFx0am9pbignLmNsYXVkZScsICdzZXR0aW5ncy5sb2NhbC5qc29uJyksXG5cdFx0XTtcblx0XHRjb25zdCByZXN1bHRzOiAoVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24gfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRcdHJlc3VsdHMucHVzaChhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwod3JpdGVFdmVudChqb2luKHdvcmtEaXIsIGZpbGUpKSwgc2Vzc2lvblVyaSkpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMsIGZpbGVzLm1hcCgoKSA9PiB1bmRlZmluZWQpKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWlyZXMgY29uZmlybWF0aW9uIGZvciBwYWNrYWdlIG1hbmFnZXIgY29uZmlndXJhdGlvbiBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaWxlcyA9IFtcblx0XHRcdCcubnBtcmMnLFxuXHRcdFx0Jy55YXJucmMnLFxuXHRcdFx0Jy55YXJucmMueW1sJyxcblx0XHRcdCcucG5wbWZpbGUuanMnLFxuXHRcdFx0Jy5wbnBtZmlsZS5janMnLFxuXHRcdFx0Jy5wbnBtZmlsZS5tanMnLFxuXHRcdFx0J3BucG0td29ya3NwYWNlLnlhbWwnLFxuXHRcdFx0am9pbigncGFja2FnZXMnLCAnbmVzdGVkJywgJy5ucG1yYycpLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVzdWx0czogKFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRyZXN1bHRzLnB1c2goYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbih3b3JrRGlyLCBmaWxlKSksIHNlc3Npb25VcmkpKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHRzLCBmaWxlcy5tYXAoKCkgPT4gdW5kZWZpbmVkKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIGNvbmZpcm1hdGlvbiBmb3IgcGF0aHMgY29udGFpbmluZyBudWxsIGJ5dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbCh3cml0ZUV2ZW50KGpvaW4od29ya0RpciwgJ2FcXHUwMDAwYi50eHQnKSksIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIGNvbmZpcm1hdGlvbiB3aGVuIGEgc3ltbGluayByZWRpcmVjdHMgb3V0c2lkZSB0aGUgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0c3ltbGlua1N5bmMob3V0c2lkZURpciwgam9pbih3b3JrRGlyLCAnbGluaycpLCBkaXJlY3RvcnlMaW5rVHlwZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbih3b3JrRGlyLCAnbGluaycsICdzZWNyZXQudHh0JykpLCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvLWFwcHJvdmVzIHdoZW4gYSBzeW1saW5rIHN0YXlzIGluc2lkZSB0aGUgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0bWtkaXJTeW5jKGpvaW4od29ya0RpciwgJ3JlYWwnKSk7XG5cdFx0c3ltbGlua1N5bmMoam9pbih3b3JrRGlyLCAncmVhbCcpLCBqb2luKHdvcmtEaXIsICdsaW5rLWluJyksIGRpcmVjdG9yeUxpbmtUeXBlKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwod3JpdGVFdmVudChqb2luKHdvcmtEaXIsICdsaW5rLWluJywgJ25vdGUudHh0JykpLCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1aXJlcyBjb25maXJtYXRpb24gZm9yIGhvbWUtZGlyZWN0b3J5IGRvdGZpbGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGhvbWVTZXNzaW9uID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9ob21lJyB9KS50b1N0cmluZygpO1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU3VtbWFyeShob21lU2Vzc2lvbiwgVVJJLmZpbGUoaG9tZWRpcigpKS50b1N0cmluZygpKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbihob21lZGlyKCksICcuc2VzcGVybS1jb25maWcteHl6JykpLCBob21lU2Vzc2lvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0by1hcHByb3ZlcyBhbnkgd3JpdGUgd2hlbiBzZXNzaW9uIGJ5cGFzcyBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uVXJpLCB7XG5cdFx0XHRzY2hlbWE6IHBsYXRmb3JtU2Vzc2lvblNjaGVtYS50b1Byb3RvY29sKCksXG5cdFx0XHR2YWx1ZXM6IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b0FwcHJvdmUnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbihvdXRzaWRlRGlyLCAnYW55dGhpbmcudHh0JykpLCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0by1hcHByb3ZlcyByZWFkcyBpbnNpZGUgYnV0IHJlcXVpcmVzIGNvbmZpcm1hdGlvbiBvdXRzaWRlIHRoZSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnNpZGUgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocmVhZEV2ZW50KGpvaW4od29ya0RpciwgJ2EudHh0JykpLCBzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBvdXRzaWRlID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHJlYWRFdmVudChqb2luKG91dHNpZGVEaXIsICdhLnR4dCcpKSwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbaW5zaWRlLCBvdXRzaWRlXSwgW1Rvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCwgdW5kZWZpbmVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIGNvbmZpcm1hdGlvbiB3aGVuIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyBub3QgYSBmaWxlIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZW1vdGVTZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9yZW1vdGUnIH0pLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcmVtb3RlV29ya2luZ0RpcmVjdG9yeSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZVJlbW90ZSwgYXV0aG9yaXR5OiAnc3NoLXJlbW90ZStob3N0JywgcGF0aDogVVJJLmZpbGUod29ya0RpcikucGF0aCB9KTtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVN1bW1hcnkocmVtb3RlU2Vzc2lvblVyaSwgcmVtb3RlV29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocmVhZEV2ZW50KGpvaW4od29ya0RpciwgJ2EudHh0JyksIHJlbW90ZVNlc3Npb25VcmkpLCByZW1vdGVTZXNzaW9uVXJpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIGNvbmZpcm1hdGlvbiB3aGVuIGEgc3ltbGlua2VkIHJlYWQgYW5jZXN0b3IgcmVkaXJlY3RzIG91dHNpZGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdG1rZGlyU3luYyhqb2luKHdvcmtEaXIsICduZXN0ZWQnKSk7XG5cdFx0c3ltbGlua1N5bmMob3V0c2lkZURpciwgam9pbih3b3JrRGlyLCAnbmVzdGVkJywgJ2xpbmsnKSwgZGlyZWN0b3J5TGlua1R5cGUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHJlYWRFdmVudChqb2luKHdvcmtEaXIsICduZXN0ZWQnLCAnbGluaycsICdzZWNyZXQudHh0JykpLCBzZXNzaW9uVXJpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8tYXBwcm92ZXMgYSByZWFkIHRocm91Z2ggYSBzeW1saW5rIHRoYXQgc3RheXMgaW5zaWRlIHRoZSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRta2RpclN5bmMoam9pbih3b3JrRGlyLCAncmVhbC1yZWFkJykpO1xuXHRcdHN5bWxpbmtTeW5jKGpvaW4od29ya0RpciwgJ3JlYWwtcmVhZCcpLCBqb2luKHdvcmtEaXIsICdsaW5rLXJlYWQnKSwgZGlyZWN0b3J5TGlua1R5cGUpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHJlYWRFdmVudChqb2luKHdvcmtEaXIsICdsaW5rLXJlYWQnLCAnbm90ZS50eHQnKSksIHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWlyZXMgY29uZmlybWF0aW9uIHdoZW4gb25seSB0aGUgcmVhbCByZWFkIHBhdGggaXMgaW5zaWRlIHRoZSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRzeW1saW5rU3luYyh3b3JrRGlyLCBqb2luKG91dHNpZGVEaXIsICdsaW5rLXRvLXdvcmtzcGFjZScpLCBkaXJlY3RvcnlMaW5rVHlwZSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocmVhZEV2ZW50KGpvaW4ob3V0c2lkZURpciwgJ2xpbmstdG8td29ya3NwYWNlJywgJ25vdGUudHh0JykpLCBzZXNzaW9uVXJpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8tYXBwcm92ZXMgcmVhZHMgd2hlbiB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMgaXRzZWxmIHN5bWxpbmtlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5rZWRXb3JrRGlyID0gam9pbihvdXRzaWRlRGlyLCAnbGlua2VkLXdvcmtzcGFjZScpO1xuXHRcdGNvbnN0IGxpbmtlZFNlc3Npb25VcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL2xpbmtlZCcgfSkudG9TdHJpbmcoKTtcblx0XHRzeW1saW5rU3luYyh3b3JrRGlyLCBsaW5rZWRXb3JrRGlyLCBkaXJlY3RvcnlMaW5rVHlwZSk7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KGxpbmtlZFNlc3Npb25VcmksIFVSSS5maWxlKGxpbmtlZFdvcmtEaXIpLnRvU3RyaW5nKCkpKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChyZWFkRXZlbnQoam9pbihsaW5rZWRXb3JrRGlyLCAnbm90ZS50eHQnKSwgbGlua2VkU2Vzc2lvblVyaSksIGxpbmtlZFNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWlyZXMgY29uZmlybWF0aW9uIHdoZW4gcmVhZCByZWFscGF0aCByZXNvbHV0aW9uIGlzIGRlbmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzOiAoVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24gfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGNvZGUgb2YgWydFQUNDRVMnLCAnRVBFUk0nXSkge1xuXHRcdFx0Y29uc3QgZGVuaWVkUGVybWlzc2lvbnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25QZXJtaXNzaW9uTWFuYWdlcihtYW5hZ2VyLCB7XG5cdFx0XHRcdHJlYWxwYXRoOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3I6IE5vZGVKUy5FcnJub0V4Y2VwdGlvbiA9IG5ldyBFcnJvcihgcmVhbHBhdGggZmFpbGVkIHdpdGggJHtjb2RlfWApO1xuXHRcdFx0XHRcdGVycm9yLmNvZGUgPSBjb2RlO1xuXHRcdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSwgY29uZmlnU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSkpO1xuXHRcdFx0YXdhaXQgZGVuaWVkUGVybWlzc2lvbnMuaW5pdGlhbGl6ZSgpO1xuXHRcdFx0cmVzdWx0cy5wdXNoKGF3YWl0IGRlbmllZFBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChyZWFkRXZlbnQoam9pbih3b3JrRGlyLCAnc2VjcmV0LnR4dCcpKSwgc2Vzc2lvblVyaSkpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0cywgW3VuZGVmaW5lZCwgdW5kZWZpbmVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG8tYXBwcm92ZXMgc2hlbGwgY29tbWFuZHMgaW4gZGVmYXVsdCBwZXJtaXNzaW9uIG1vZGUgd2hlbiB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwoc2hlbGxFdmVudCgnZWNobyBoZWxsbycsICdiYXNoJyksIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcXVpcmVzIGNvbmZpcm1hdGlvbiBmb3Igc2VkIGluLXBsYWNlIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gc2hlbGxFdmVudCgnc2VkIC1pIFwicy9mb28vYmFyL1wiIGZpbGUudHh0JywgJ2Jhc2gnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFwcHJvdmFsOiBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwoZXZlbnQsIHNlc3Npb25VcmkpLFxuXHRcdFx0cnVsZVJlc29sdmFibGU6IHBlcm1pc3Npb25zLmlzQXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZShldmVudCwgc2Vzc2lvblVyaSksXG5cdFx0fSwge1xuXHRcdFx0YXBwcm92YWw6IHVuZGVmaW5lZCxcblx0XHRcdHJ1bGVSZXNvbHZhYmxlOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBmb3J3YXJkZWQgdGVybWluYWwgYXV0by1hcHByb3ZlIHJ1bGVzIGFzIHRoZSBzb3VyY2Ugb2YgdHJ1dGggb3ZlciBmYWxsYmFjayBkZWZhdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5XToge30gfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwoc2hlbGxFdmVudCgnZWNobyBoZWxsbycsICdiYXNoJyksIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIGZvcndhcmRlZCB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgZGVueSBydWxlcyBpbiBkZWZhdWx0IHBlcm1pc3Npb24gbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25maWdTZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzQ29uZmlnS2V5XTogeyBlY2hvOiBmYWxzZSB9IH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHNoZWxsRXZlbnQoJ2VjaG8gaGVsbG8nLCAnYmFzaCcpLCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNwZWN0cyBmb3J3YXJkZWQgdGVybWluYWwgYXV0by1hcHByb3ZlIGFsbG93IHJ1bGVzIGluIGRlZmF1bHQgcGVybWlzc2lvbiBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7IFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXldOiB7IHB5dGhvbjogdHJ1ZSB9IH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHNoZWxsRXZlbnQoJ3B5dGhvbiBzY3JpcHQucHknLCAnYmFzaCcpLCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXF1aXJlcyBjb25maXJtYXRpb24gZm9yIHNoZWxsIGNvbW1hbmRzIGluIGRlZmF1bHQgcGVybWlzc2lvbiBtb2RlIHdoZW4gdGVybWluYWwgYXV0by1hcHByb3ZlIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7XG5cdFx0XHRbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXldOiBmYWxzZSxcblx0XHRcdFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXldOiB7IGVjaG86IHRydWUgfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChzaGVsbEV2ZW50KCdlY2hvIGhlbGxvJywgJ2Jhc2gnKSwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaXNBdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlIGlzIHRydWUgb25seSB3aGVuIGEgbWlzc2luZyBhbGxvdyBydWxlIGlzIHRoZSBzb2xlIGJsb2NrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZXM6IFtuYW1lOiBzdHJpbmcsIGV2ZW50OiBJVG9vbEFwcHJvdmFsRXZlbnQsIGV4cGVjdGVkOiBib29sZWFuXVtdID0gW1xuXHRcdFx0Wyd1bmtub3duIGNvbW1hbmQnLCBzaGVsbEV2ZW50KCdteS1jdXN0b20tc2NyaXB0JywgJ2Jhc2gnKSwgdHJ1ZV0sXG5cdFx0XHRbJ2FscmVhZHkgYXBwcm92ZWQnLCBzaGVsbEV2ZW50KCdlY2hvIGhlbGxvJywgJ2Jhc2gnKSwgZmFsc2VdLFxuXHRcdFx0WydkZW5pZWQnLCBzaGVsbEV2ZW50KCdybSBmaWxlLnR4dCcsICdiYXNoJyksIGZhbHNlXSxcblx0XHRcdFsndW5hcHByb3ZlZCB3cml0ZSByZWRpcmVjdCcsIHNoZWxsRXZlbnQoJ215LWN1c3RvbS1zY3JpcHQgPiAvZXRjL3Bhc3N3ZCcsICdiYXNoJyksIGZhbHNlXSxcblx0XHRcdFsnc2FuZGJveCBieXBhc3MnLCB7IC4uLnNoZWxsRXZlbnQoJ215LWN1c3RvbS1zY3JpcHQnLCAnYmFzaCcpLCByZXF1ZXN0U2FuZGJveEJ5cGFzczogdHJ1ZSB9LCBmYWxzZV0sXG5cdFx0XHRbJ25vbi1zaGVsbCcsIHdyaXRlRXZlbnQoJy9vdXRzaWRlL2FwcC50cycpLCBmYWxzZV0sXG5cdFx0XTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y2FzZXMubWFwKChbbmFtZSwgZV0pID0+IGAke25hbWV9PSR7cGVybWlzc2lvbnMuaXNBdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlKGUsIHNlc3Npb25VcmkpfWApLFxuXHRcdFx0Y2FzZXMubWFwKChbbmFtZSwgLCBleHBlY3RlZF0pID0+IGAke25hbWV9PSR7ZXhwZWN0ZWR9YCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0F1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUgaXMgZmFsc2Ugd2hlbiB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5XTogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcm1pc3Npb25zLmlzQXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZShzaGVsbEV2ZW50KCdteS1jdXN0b20tc2NyaXB0JywgJ2Jhc2gnKSwgc2Vzc2lvblVyaSksIGZhbHNlKTtcblx0fSk7XG5cblx0Ly8gYGdldC1jaGlsZGl0ZW1gIG9ubHkgbWF0Y2hlcyB0aGUgZGVmYXVsdCBgR2V0LUNoaWxkSXRlbWAgYWxsb3cgcnVsZSB1bmRlclxuXHQvLyBQb3dlclNoZWxsJ3MgY2FzZS1pbnNlbnNpdGl2ZSBtYXRjaGluZywgc28gaXQgZGlzdGluZ3Vpc2hlcyB3aGljaCBncmFtbWFyXG5cdC8vIHRoZSBhcHByb3ZlciB1c2VkLlxuXHR0ZXN0KCdzaGVsbCBhcHByb3ZhbCBhbmQgcnVsZSBlbGlnaWJpbGl0eSByZXNwZWN0IHRoZSBldmVudCBzaGVsbCBsYW5ndWFnZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwd3NoRXZlbnQgPSBwb3dlcnNoZWxsRXZlbnQoJ2dldC1jaGlsZGl0ZW0nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChwd3NoRXZlbnQsIHNlc3Npb25VcmkpLFxuXHRcdFx0YXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHNoZWxsRXZlbnQoJ2dldC1jaGlsZGl0ZW0nLCAnYmFzaCcpLCBzZXNzaW9uVXJpKSxcblx0XHRcdHBlcm1pc3Npb25zLmlzQXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZShwd3NoRXZlbnQsIHNlc3Npb25VcmkpLFxuXHRcdFx0cGVybWlzc2lvbnMuaXNBdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlKHNoZWxsRXZlbnQoJ2dldC1jaGlsZGl0ZW0nLCAnYmFzaCcpLCBzZXNzaW9uVXJpKSxcblx0XHRdLCBbVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLCB1bmRlZmluZWQsIGZhbHNlLCB0cnVlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Bvd2VyU2hlbGwgc2NyaXB0LWJsb2NrIHBheWxvYWRzIHdpdGggbmVzdGVkIGRlbmlhbHMgcmVxdWlyZSBjb25maXJtYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS51cGRhdGVSb290Q29uZmlnKHtcblx0XHRcdFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXldOiB7XG5cdFx0XHRcdCdNZWFzdXJlLUNvbW1hbmQnOiB0cnVlLFxuXHRcdFx0XHQnU2V0LUNvbnRlbnQnOiBmYWxzZSxcblx0XHRcdFx0J0ludm9rZS1FeHByZXNzaW9uJzogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0YXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHBvd2Vyc2hlbGxFdmVudCgnTWVhc3VyZS1Db21tYW5kIHsgU2V0LUNvbnRlbnQgLVBhdGggb3V0LnR4dCAtVmFsdWUgcHduZWQgfScpLCBzZXNzaW9uVXJpKSxcblx0XHRcdGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChwb3dlcnNoZWxsRXZlbnQoJ01lYXN1cmUtQ29tbWFuZCB7IEludm9rZS1FeHByZXNzaW9uIFwiV3JpdGUtT3V0cHV0IGhpXCIgfScpLCBzZXNzaW9uVXJpKSxcblx0XHRcdGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChzaGVsbEV2ZW50KCdXcml0ZS1Ib3N0IGhpOyBTZXQtQ29udGVudCAtUGF0aCBvdXQudHh0IC1WYWx1ZSBwd25lZCcsICdwb3dlcnNoZWxsJyksIHNlc3Npb25VcmkpLFxuXHRcdFx0Ly8gTWlzc2luZyBkaWFsZWN0IHJlbWFpbnMgZmFpbC1jbG9zZWQgZXZlbiBmb3IgYW4gb3RoZXJ3aXNlIGFsbG93bGlzdGVkIG91dGVyIGNvbW1hbmQuXG5cdFx0XHRhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwoc2hlbGxFdmVudCgnTWVhc3VyZS1Db21tYW5kIHsgR2V0LUNoaWxkSXRlbSB9JywgdW5kZWZpbmVkKSwgc2Vzc2lvblVyaSksXG5cdFx0XSwgW3VuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQb3dlclNoZWxsIHJlZGlyZWN0cyByZXF1aXJlIGEgbGl0ZXJhbCBhcHByb3ZlZCBkZXN0aW5hdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkeW5hbWljUmVzdWx0cyA9IFtdO1xuXHRcdGZvciAoY29uc3QgZGVzdCBvZiBbJyRIT01FL291dHNpZGUudHh0JywgJyRlbnY6VEVNUC94LnR4dCcsICckKEdldC1Mb2NhdGlvbikveC50eHQnLCAnYHB3ZGAveC50eHQnLCAnJHtIT01FfS94LnR4dCcsICclQVBQREFUQSUveC50eHQnXSkge1xuXHRcdFx0ZHluYW1pY1Jlc3VsdHMucHVzaChhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocG93ZXJzaGVsbEV2ZW50KGBXcml0ZS1Ib3N0IGhpID4ke2Rlc3R9YCksIHNlc3Npb25VcmkpKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkeW5hbWljUmVzdWx0cyxcblx0XHRcdGxpdGVyYWxXb3Jrc3BhY2VEZXN0aW5hdGlvbjogYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHBvd2Vyc2hlbGxFdmVudCgnV3JpdGUtSG9zdCBoaSA+b3V0LnR4dCcpLCBzZXNzaW9uVXJpKSxcblx0XHRcdG51bGxTaW5rOiBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocG93ZXJzaGVsbEV2ZW50KCdXcml0ZS1Ib3N0IGhpID4kbnVsbCcpLCBzZXNzaW9uVXJpKSxcblx0XHR9LCB7XG5cdFx0XHRkeW5hbWljUmVzdWx0czogW3VuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWRdLFxuXHRcdFx0bGl0ZXJhbFdvcmtzcGFjZURlc3RpbmF0aW9uOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRudWxsU2luazogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDTUQgZGVsYXllZC1leHBhbnNpb24gcmVkaXJlY3QgZGVzdGluYXRpb25zIHJlcXVpcmUgY29uZmlybWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlbGF5ZWRFeHBhbnNpb24gPSBzaGVsbEV2ZW50KCdlY2hvIGhpID4hQVBQREFUQSFcXFxcb3V0c2lkZS50eHQnLCAnYmFzaCcpO1xuXHRcdGNvbnN0IGxpdGVyYWxFeGNsYW1hdGlvbiA9IHNoZWxsRXZlbnQoJ2VjaG8gaGkgPmltcG9ydGFudCEudHh0JywgJ2Jhc2gnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlbGF5ZWRBcHByb3ZhbDogYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKGRlbGF5ZWRFeHBhbnNpb24sIHNlc3Npb25VcmkpLFxuXHRcdFx0ZGVsYXllZFJ1bGVSZXNvbHZhYmxlOiBwZXJtaXNzaW9ucy5pc0F1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUoZGVsYXllZEV4cGFuc2lvbiwgc2Vzc2lvblVyaSksXG5cdFx0XHRsaXRlcmFsQXBwcm92YWw6IGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChsaXRlcmFsRXhjbGFtYXRpb24sIHNlc3Npb25VcmkpLFxuXHRcdH0sIHtcblx0XHRcdGRlbGF5ZWRBcHByb3ZhbDogdW5kZWZpbmVkLFxuXHRcdFx0ZGVsYXllZFJ1bGVSZXNvbHZhYmxlOiBmYWxzZSxcblx0XHRcdGxpdGVyYWxBcHByb3ZhbDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtaXNzaW5nIHNoZWxsIGxhbmd1YWdlIGRpc2FibGVzIHRlcm1pbmFsIHJ1bGVzIGFuZCBydWxlIHN1Z2dlc3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50ID0gc2hlbGxFdmVudCgnR2V0LUNoaWxkSXRlbScsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhcHByb3ZhbDogYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKGV2ZW50LCBzZXNzaW9uVXJpKSxcblx0XHRcdHJ1bGVSZXNvbHZhYmxlOiBwZXJtaXNzaW9ucy5pc0F1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUoZXZlbnQsIHNlc3Npb25VcmkpLFxuXHRcdH0sIHtcblx0XHRcdGFwcHJvdmFsOiB1bmRlZmluZWQsXG5cdFx0XHRydWxlUmVzb2x2YWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGFmZmVjdCBzZXNzaW9uIGJ5cGFzcyBwZXJtaXNzaW9uIG1vZGUgd2hlbiB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS51cGRhdGVSb290Q29uZmlnKHtcblx0XHRcdFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleV06IGZhbHNlLFxuXHRcdFx0W0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleV06IHsgZWNobzogZmFsc2UgfSxcblx0XHR9KTtcblx0XHRtYW5hZ2VyLnNldFNlc3Npb25Db25maWcoc2Vzc2lvblVyaSwge1xuXHRcdFx0c2NoZW1hOiBwbGF0Zm9ybVNlc3Npb25TY2hlbWEudG9Qcm90b2NvbCgpLFxuXHRcdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2F1dG9BcHByb3ZlJyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHNoZWxsRXZlbnQoJ2VjaG8gaGVsbG8nLCAnYmFzaCcpLCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5TZXR0aW5nKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0by1hcHByb3ZlcyBhbnkgd3JpdGUgd2hlbiBnbG9iYWwgYXV0by1hcHByb3ZlIGlzIGVuYWJsZWQsIGV2ZW4gaW4gZGVmYXVsdCBwZXJtaXNzaW9uIG1vZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uZmlnU2VydmljZS51cGRhdGVSb290Q29uZmlnKHsgW0FnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleV06IHRydWUgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwod3JpdGVFdmVudChqb2luKG91dHNpZGVEaXIsICdhbnl0aGluZy50eHQnKSksIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvLWFwcHJvdmVzIHNoZWxsIGNvbW1hbmRzIHdoZW4gZ2xvYmFsIGF1dG8tYXBwcm92ZSBpcyBlbmFibGVkLCBldmVuIHdpdGggdGVybWluYWwgYXV0by1hcHByb3ZlIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbmZpZ1NlcnZpY2UudXBkYXRlUm9vdENvbmZpZyh7XG5cdFx0XHRbQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSxcblx0XHRcdFtBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleV06IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Ly8gQSBjb21tYW5kIHRoYXQgd291bGQgb3RoZXJ3aXNlIHJlcXVpcmUgY29uZmlybWF0aW9uICh0ZXJtaW5hbFxuXHRcdC8vIGF1dG8tYXBwcm92ZSBkaXNhYmxlZCkgaXMgYXBwcm92ZWQgYmVjYXVzZSBnbG9iYWwgYXV0by1hcHByb3ZlIGlzIGFcblx0XHQvLyBzdXBlcnNldCB0aGF0IHNob3J0LWNpcmN1aXRzIGJlZm9yZSB0aGUgcGVyLWtpbmQgY2hlY2tzLlxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChzaGVsbEV2ZW50KCdybSAtcmYgL3RtcC93aGF0ZXZlcicsICdiYXNoJyksIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdnbG9iYWwgYXV0by1hcHByb3ZlIGlzIHJlcG9ydGVkIGluZGVwZW5kZW50bHkgb2YgdGhlIHNlc3Npb24gcGVybWlzc2lvbiBwaWNrZXInLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcm1pc3Npb25zLmlzR2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkKCksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGVybWlzc2lvbnMuaXNTZXNzaW9uQXV0b0FwcHJvdmVFbmFibGVkKHNlc3Npb25VcmkpLCBmYWxzZSk7XG5cblx0XHRjb25maWdTZXJ2aWNlLnVwZGF0ZVJvb3RDb25maWcoeyBbQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5XTogdHJ1ZSB9KTtcblxuXHRcdC8vIFRoZSBnbG9iYWwgc2V0dGluZyBpcyBhIHN1cGVyc2V0IG9mIGFsbCBzZXR0aW5ncyBidXQgZG9lcyBub3QgY2hhbmdlIHRoZVxuXHRcdC8vIHNlc3Npb24ncyBvd24gYXBwcm92YWwgbGV2ZWwgKHRoZSBwZXJtaXNzaW9ucyBwaWNrZXIgc3RheXMgYXQgZGVmYXVsdCkuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBlcm1pc3Npb25zLmlzR2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkKCksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwZXJtaXNzaW9ucy5pc1Nlc3Npb25BdXRvQXBwcm92ZUVuYWJsZWQoc2Vzc2lvblVyaSksIGZhbHNlKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBNdWx0aS1yb290IGF1dG8tYXBwcm92YWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIEEgc2Vzc2lvbiB3aXRoIG11bHRpcGxlIHdvcmtpbmcgZGlyZWN0b3JpZXMgYXV0by1hcHByb3ZlcyBhIHJlYWQvd3JpdGUvXG5cdC8vIHNoZWxsIGRlc3RpbmF0aW9uIHdoZW4gaXQgaXMgY29udGFpbmVkIGJ5ICphbnkqIHJvb3QgKGluZGV4IDAgPSBwcmltYXJ5KS5cblx0Ly8gVGhlIG11bHRpLXJvb3QgcGF0aCBpcyBvdGhlcndpc2UgZG9ybWFudCB0b2RheSAodGhlIGNyZWF0ZS10aW1lIGxlbmd0aFxuXHQvLyBndWFyZCBrZWVwcyBzZXNzaW9ucyBzaW5nbGUtcm9vdCksIHNvIHRoZXNlIHRlc3RzIHN5bnRoZXNpemUgYSB0d28tcm9vdFxuXHQvLyBzZXNzaW9uIHN0YXRlIGRpcmVjdGx5LlxuXHRzdWl0ZSgnbXVsdGktcm9vdCcsICgpID0+IHtcblx0XHRjb25zdCBtdWx0aVVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvbXVsdGknIH0pLnRvU3RyaW5nKCk7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHQvLyBJbmRleCAwIChgd29ya0RpcmApIGlzIHRoZSBwcmltYXJ5L3Byb2Nlc3MgY3dkOyBgd29ya0RpcjJgIGlzIGEgcGVlciByb290LlxuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTdW1tYXJ5KG11bHRpVXJpLCBVUkkuZmlsZSh3b3JrRGlyKS50b1N0cmluZygpLCBVUkkuZmlsZSh3b3JrRGlyMikudG9TdHJpbmcoKSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXV0by1hcHByb3ZlcyByZWFkcyBhbmQgd3JpdGVzIHVuZGVyIGFueSByb290LCBjb25maXJtcyBvdXRzaWRlIGFsbCByb290cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBbXG5cdFx0XHRcdGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChyZWFkRXZlbnQoam9pbih3b3JrRGlyLCAnYS50eHQnKSwgbXVsdGlVcmkpLCBtdWx0aVVyaSksXG5cdFx0XHRcdGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbChyZWFkRXZlbnQoam9pbih3b3JrRGlyMiwgJ2EudHh0JyksIG11bHRpVXJpKSwgbXVsdGlVcmkpLFxuXHRcdFx0XHRhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocmVhZEV2ZW50KGpvaW4ob3V0c2lkZURpciwgJ2EudHh0JyksIG11bHRpVXJpKSwgbXVsdGlVcmkpLFxuXHRcdFx0XHRhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwod3JpdGVFdmVudChqb2luKHdvcmtEaXIsICd4LnR4dCcpKSwgbXVsdGlVcmkpLFxuXHRcdFx0XHRhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwod3JpdGVFdmVudChqb2luKHdvcmtEaXIyLCAneC50eHQnKSksIG11bHRpVXJpKSxcblx0XHRcdFx0YXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHdyaXRlRXZlbnQoam9pbihvdXRzaWRlRGlyLCAneC50eHQnKSksIG11bHRpVXJpKSxcblx0XHRcdF07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMsIFtcblx0XHRcdFx0VG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0VG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSByZWxhdGl2ZSBzaGVsbCByZWRpcmVjdCByZXNvbHZlcyBhZ2FpbnN0IHRoZSBwcmltYXJ5IHJvb3QgKGluZGV4IDApJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gYG91dC50eHRgIHJlc29sdmVzIGFnYWluc3QgdGhlIHNpbmdsZSBwcm9jZXNzIGN3ZCA9IGB3b3JrRGlyYCwgc28gaXRcblx0XHRcdC8vIGlzIGNvbnRhaW5lZCBieSB0aGUgcHJpbWFyeSByb290IGFuZCBhdXRvLWFwcHJvdmVzLlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHNoZWxsRXZlbnQoJ2VjaG8gaGkgPiBvdXQudHh0JywgJ2Jhc2gnKSwgbXVsdGlVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkKTtcblx0XHR9KTtcblxuXHRcdChpc1dpbmRvd3MgPyB0ZXN0LnNraXAgOiB0ZXN0KSgnYW4gYWJzb2x1dGUgc2hlbGwgcmVkaXJlY3QgYXV0by1hcHByb3ZlcyB1bmRlciBhIG5vbi1wcmltYXJ5IHJvb3QgYnV0IGNvbmZpcm1zIG91dHNpZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBQT1NJWC1vbmx5OiBlbWJlZGRpbmcgYWJzb2x1dGUgcGF0aHMgaW4gdGhlIGNvbW1hbmQgc3RyaW5nIGF2b2lkc1xuXHRcdFx0Ly8gV2luZG93cyBiYWNrc2xhc2gvZHJpdmUtY29sb24gcGFyc2luZyBwaXRmYWxscy4gVGhlIGNvbnRhaW5tZW50IHJ1bGVcblx0XHRcdC8vIGl0c2VsZiBpcyBwbGF0Zm9ybS1hZ25vc3RpYyBhbmQgY292ZXJlZCBieSB0aGUgcmVhZC93cml0ZSB0ZXN0IGFib3ZlLlxuXHRcdFx0Y29uc3QgaW50b1BlZXIgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwoc2hlbGxFdmVudChgZWNobyBoaSA+ICR7am9pbih3b3JrRGlyMiwgJ291dC50eHQnKX1gLCAnYmFzaCcpLCBtdWx0aVVyaSk7XG5cdFx0XHRjb25zdCBvdXRzaWRlID0gYXdhaXQgcGVybWlzc2lvbnMuZ2V0QXV0b0FwcHJvdmFsKHNoZWxsRXZlbnQoYGVjaG8gaGkgPiAke2pvaW4ob3V0c2lkZURpciwgJ291dC50eHQnKX1gLCAnYmFzaCcpLCBtdWx0aVVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtpbnRvUGVlciwgb3V0c2lkZV0sIFtUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsIHVuZGVmaW5lZF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWlyZXMgY29uZmlybWF0aW9uIGZvciBhIHN5bWxpbmsgdGhhdCBjcm9zc2VzIGZyb20gb25lIHJvb3QgaW50byBhbm90aGVyIChmYWlsLWNsb3NlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBBIHN5bWxpbmsgaW5zaWRlIGB3b3JrRGlyYCBwb2ludGluZyBhdCB0aGUgcGVlciByb290IGB3b3JrRGlyMmA6IHRoZVxuXHRcdFx0Ly8gbGl0ZXJhbCBwYXRoIGlzIHVuZGVyIHJvb3QgQSBhbmQgdGhlIHJlYWwgcGF0aCB1bmRlciByb290IEIsIHNvIG5vXG5cdFx0XHQvLyBzaW5nbGUgcm9vdCBjb250YWlucyBib3RoIHRoZSBsaXRlcmFsIGFuZCByZXNvbHZlZCBwYXRoLiBGYWlsLWNsb3NlZFxuXHRcdFx0Ly8gXHUyMUQyIGNvbmZpcm1hdGlvbiBmb3IgYm90aCByZWFkIGFuZCB3cml0ZS5cblx0XHRcdHN5bWxpbmtTeW5jKHdvcmtEaXIyLCBqb2luKHdvcmtEaXIsICdjcm9zcy1saW5rJyksIGRpcmVjdG9yeUxpbmtUeXBlKTtcblx0XHRcdGNvbnN0IHJlYWQgPSBhd2FpdCBwZXJtaXNzaW9ucy5nZXRBdXRvQXBwcm92YWwocmVhZEV2ZW50KGpvaW4od29ya0RpciwgJ2Nyb3NzLWxpbmsnLCAnbm90ZS50eHQnKSwgbXVsdGlVcmkpLCBtdWx0aVVyaSk7XG5cdFx0XHRjb25zdCB3cml0ZSA9IGF3YWl0IHBlcm1pc3Npb25zLmdldEF1dG9BcHByb3ZhbCh3cml0ZUV2ZW50KGpvaW4od29ya0RpciwgJ2Nyb3NzLWxpbmsnLCAnbm90ZS50eHQnKSksIG11bHRpVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3JlYWQsIHdyaXRlXSwgW3VuZGVmaW5lZCwgdW5kZWZpbmVkXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXLGFBQWEsY0FBYyxRQUFRLG1CQUFtQjtBQUMxRSxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsU0FBUyxpQkFBaUI7QUFDbkMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkNBQTJDLDRDQUE0Qyw4Q0FBOEMsNENBQTRDLDZCQUE2QjtBQUN2TixTQUE4QixtQ0FBbUM7QUFDakUsU0FBUyxvQ0FBb0Msd0NBQXdDO0FBQ3JGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsY0FBYyxlQUFlLGtDQUF1RDtBQUM3RixTQUFTLGlDQUFp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
