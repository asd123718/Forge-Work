import { strictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { Event } from "../../../../../../base/common/event.js";
import { isWindows } from "../../../../../../base/common/platform.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestCommandService } from "../../../../../../editor/test/browser/editorTestServices.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextMenuService } from "../../../../../../platform/contextview/browser/contextMenuService.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { ITerminalQuickFixService } from "../../browser/quickFix.js";
import { getQuickFixesForCommand, TerminalQuickFixAddon } from "../../browser/quickFixAddon.js";
import { freePort, FreePortOutputRegex, gitCreatePr, GitCreatePrOutputRegex, gitFastForwardPull, GitFastForwardPullOutputRegex, GitPushOutputRegex, gitPushSetUpstream, gitSimilar, GitSimilarOutputRegex, gitTwoDashes, GitTwoDashesRegex, pwshGeneralError, PwshGeneralErrorOutputRegex, pwshUnixCommandNotFoundError, PwshUnixCommandNotFoundErrorOutputRegex } from "../../browser/terminalQuickFixBuiltinActions.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
suite("QuickFixAddon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let quickFixAddon;
  let commandDetection;
  let commandService;
  let openerService;
  let labelService;
  let terminal;
  let instantiationService;
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    terminal = store.add(new TerminalCtor({
      allowProposedApi: true,
      cols: 80,
      rows: 30,
      logger: TestXtermLogger
    }));
    instantiationService.stub(IStorageService, store.add(new TestStorageService()));
    instantiationService.stub(ITerminalQuickFixService, {
      onDidRegisterProvider: Event.None,
      onDidUnregisterProvider: Event.None,
      onDidRegisterCommandSelector: Event.None,
      extensionQuickFixes: Promise.resolve([])
    });
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    labelService = instantiationService.stub(ILabelService, {});
    const capabilities = store.add(new TerminalCapabilityStore());
    instantiationService.stub(ILogService, new NullLogService());
    commandDetection = store.add(instantiationService.createInstance(CommandDetectionCapability, terminal));
    capabilities.add(TerminalCapability.CommandDetection, commandDetection);
    instantiationService.stub(IContextMenuService, store.add(instantiationService.createInstance(ContextMenuService)));
    openerService = instantiationService.stub(IOpenerService, {});
    commandService = new TestCommandService(instantiationService);
    quickFixAddon = instantiationService.createInstance(TerminalQuickFixAddon, generateUuid(), [], capabilities);
    terminal.loadAddon(quickFixAddon);
  });
  suite("registerCommandFinishedListener & getMatchActions", () => {
    suite("gitSimilarCommand", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git sttatus`;
      let output = `git: 'sttatus' is not a git command. See 'git --help'.

			The most similar command is
			status`;
      const exitCode = 1;
      const actions = [{
        id: "Git Similar",
        enabled: true,
        label: "Run: git status",
        tooltip: "Run: git status",
        command: "git status"
      }];
      const outputLines = output.split("\n");
      setup(() => {
        const command2 = gitSimilar();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitSimilarOutputRegex, exitCode, [`invalid output`]), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`gt sttatus`, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService), actions);
        });
        test("matching exit status", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, 2, outputLines), expectedMap, commandService, openerService, labelService), actions);
        });
      });
      suite("returns match", () => {
        test("returns match", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitSimilarOutputRegex, exitCode, outputLines), expectedMap, commandService, openerService, labelService), actions);
        });
        test("returns multiple match", async () => {
          output = `git: 'pu' is not a git command. See 'git --help'.
				The most similar commands are
						pull
						push`;
          const actions2 = [{
            id: "Git Similar",
            enabled: true,
            label: "Run: git pull",
            tooltip: "Run: git pull",
            command: "git pull"
          }, {
            id: "Git Similar",
            enabled: true,
            label: "Run: git push",
            tooltip: "Run: git push",
            command: "git push"
          }];
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand("git pu", output, GitSimilarOutputRegex, exitCode, output.split("\n")), expectedMap, commandService, openerService, labelService), actions2);
        });
        test("passes any arguments through", async () => {
          output = `git: 'checkoutt' is not a git command. See 'git --help'.
				The most similar commands are
						checkout`;
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand("git checkoutt .", output, GitSimilarOutputRegex, exitCode, output.split("\n")), expectedMap, commandService, openerService, labelService), [{
            id: "Git Similar",
            enabled: true,
            label: "Run: git checkout .",
            tooltip: "Run: git checkout .",
            command: "git checkout ."
          }]);
        });
      });
    });
    suite("gitTwoDashes", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git add . -all`;
      const output = "error: did you mean `--all` (with two dashes)?";
      const exitCode = 1;
      const actions = [{
        id: "Git Two Dashes",
        enabled: true,
        label: "Run: git add . --all",
        tooltip: "Run: git add . --all",
        command: "git add . --all"
      }];
      setup(() => {
        const command2 = gitTwoDashes();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`gt sttatus`, output, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitTwoDashesRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
        test("matching exit status", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitTwoDashesRegex, 2), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
    suite("gitFastForwardPull", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git checkout vnext`;
      const output = "Already on 'vnext' \n Your branch is behind 'origin/vnext' by 1 commit, and can be fast-forwarded.";
      const exitCode = 0;
      const actions = [{
        id: "Git Fast Forward Pull",
        enabled: true,
        label: "Run: git pull",
        tooltip: "Run: git pull",
        command: "git pull"
      }];
      setup(() => {
        const command2 = gitFastForwardPull();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`gt add`, output, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("exit code does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitFastForwardPullOutputRegex, 2), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("matching exit status, command, ouput", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitFastForwardPullOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
    if (!isWindows) {
      suite("freePort", () => {
        const expectedMap = /* @__PURE__ */ new Map();
        const portCommand = `yarn start dev`;
        const output = `yarn run v1.22.17
			warning ../../package.json: No license field
			Error: listen EADDRINUSE: address already in use 0.0.0.0:3000
				at Server.setupListenHandle [as _listen2] (node:net:1315:16)
				at listenInCluster (node:net:1363:12)
				at doListen (node:net:1501:7)
				at processTicksAndRejections (node:internal/process/task_queues:84:21)
			Emitted 'error' event on WebSocketServer instance at:
				at Server.emit (node:events:394:28)
				at emitErrorNT (node:net:1342:8)
				at processTicksAndRejections (node:internal/process/task_queues:83:21) {
			}
			error Command failed with exit code 1.
			info Visit https://yarnpkg.com/en/docs/cli/run for documentation about this command.`;
        const actionOptions = [{
          id: "Free Port",
          label: "Free port 3000",
          run: true,
          tooltip: "Free port 3000",
          enabled: true
        }];
        setup(() => {
          const command = freePort(() => Promise.resolve());
          expectedMap.set(command.commandLineMatcher.toString(), [command]);
          quickFixAddon.registerCommandFinishedListener(command);
        });
        suite("returns undefined when", () => {
          test("output does not match", async () => {
            strictEqual(await getQuickFixesForCommand([], terminal, createCommand(portCommand, `invalid output`, FreePortOutputRegex), expectedMap, commandService, openerService, labelService), void 0);
          });
        });
        test("returns actions", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(portCommand, output, FreePortOutputRegex), expectedMap, commandService, openerService, labelService), actionOptions);
        });
      });
    }
    suite("gitPushSetUpstream", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git push`;
      const output = `fatal: The current branch test22 has no upstream branch.
			To push the current branch and set the remote as upstream, use

				git push --set-upstream origin test22`;
      const exitCode = 128;
      const actions = [{
        id: "Git Push Set Upstream",
        enabled: true,
        label: "Run: git push --set-upstream origin test22",
        tooltip: "Run: git push --set-upstream origin test22",
        command: "git push --set-upstream origin test22"
      }];
      setup(() => {
        const command2 = gitPushSetUpstream();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
        test("matching exit status", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, 2), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
    suite("gitCreatePr", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `git push`;
      const output = `Total 0 (delta 0), reused 0 (delta 0), pack-reused 0
			remote:
			remote: Create a pull request for 'test22' on GitHub by visiting:
			remote:      https://github.com/meganrogge/xterm.js/pull/new/test22
			remote:
			To https://github.com/meganrogge/xterm.js
			 * [new branch]        test22 -> test22
			Branch 'test22' set up to track remote branch 'test22' from 'origin'. `;
      const exitCode = 0;
      const actions = [{
        id: "Git Create Pr",
        enabled: true,
        label: "Open: https://github.com/meganrogge/xterm.js/pull/new/test22",
        tooltip: "Open: https://github.com/meganrogge/xterm.js/pull/new/test22",
        uri: URI.parse("https://github.com/meganrogge/xterm.js/pull/new/test22")
      }];
      setup(() => {
        const command2 = gitCreatePr();
        expectedMap.set(command2.commandLineMatcher.toString(), [command2]);
        quickFixAddon.registerCommandFinishedListener(command2);
      });
      suite("returns undefined when", () => {
        test("output does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("command does not match", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
        });
        test("failure exit status", async () => {
          strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitCreatePrOutputRegex, 2), expectedMap, commandService, openerService, labelService), void 0);
        });
      });
      suite("returns actions when", () => {
        test("expected unix exit code", async () => {
          assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitCreatePrOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
        });
      });
    });
  });
  suite("gitPush - multiple providers", () => {
    const expectedMap = /* @__PURE__ */ new Map();
    const command = `git push`;
    const output = `fatal: The current branch test22 has no upstream branch.
		To push the current branch and set the remote as upstream, use

			git push --set-upstream origin test22`;
    const exitCode = 128;
    const actions = [{
      id: "Git Push Set Upstream",
      enabled: true,
      label: "Run: git push --set-upstream origin test22",
      tooltip: "Run: git push --set-upstream origin test22",
      command: "git push --set-upstream origin test22"
    }];
    setup(() => {
      const pushCommand = gitPushSetUpstream();
      const prCommand = gitCreatePr();
      quickFixAddon.registerCommandFinishedListener(prCommand);
      expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand, prCommand]);
    });
    suite("returns undefined when", () => {
      test("output does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
      test("command does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(`git status`, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
    });
    suite("returns actions when", () => {
      test("expected unix exit code", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
      });
      test("matching exit status", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, GitPushOutputRegex, 2), expectedMap, commandService, openerService, labelService), actions);
      });
    });
  });
  suite("pwsh feedback providers", () => {
    suite("General", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `not important`;
      const output = [
        `...`,
        ``,
        `Suggestion [General]:`,
        `  The most similar commands are: python3, python3m, pamon, python3.6, rtmon, echo, pushd, etsn, pwsh, pwconv.`,
        ``,
        `Suggestion [cmd-not-found]:`,
        `  Command 'python' not found, but can be installed with:`,
        `  sudo apt install python3`,
        `  sudo apt install python`,
        `  sudo apt install python-minimal`,
        `  You also have python3 installed, you can run 'python3' instead.'`,
        ``
      ].join("\n");
      const exitCode = 128;
      const actions = [
        "python3",
        "python3m",
        "pamon",
        "python3.6",
        "rtmon",
        "echo",
        "pushd",
        "etsn",
        "pwsh",
        "pwconv"
      ].map((command2) => {
        return {
          id: "Pwsh General Error",
          enabled: true,
          label: `Run: ${command2}`,
          tooltip: `Run: ${command2}`,
          command: command2
        };
      });
      setup(() => {
        const pushCommand = pwshGeneralError();
        quickFixAddon.registerCommandFinishedListener(pushCommand);
        expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand]);
      });
      test("returns undefined when output does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, PwshGeneralErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
      test("returns actions when output matches", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, PwshGeneralErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
      });
    });
    suite("Unix cmd-not-found", () => {
      const expectedMap = /* @__PURE__ */ new Map();
      const command = `not important`;
      const output = [
        `...`,
        ``,
        `Suggestion [General]`,
        `  The most similar commands are: python3, python3m, pamon, python3.6, rtmon, echo, pushd, etsn, pwsh, pwconv.`,
        ``,
        `Suggestion [cmd-not-found]:`,
        `  Command 'python' not found, but can be installed with:`,
        `  sudo apt install python3`,
        `  sudo apt install python`,
        `  sudo apt install python-minimal`,
        `  You also have python3 installed, you can run 'python3' instead.'`,
        ``
      ].join("\n");
      const exitCode = 128;
      const actions = [
        "sudo apt install python3",
        "sudo apt install python",
        "sudo apt install python-minimal",
        "python3"
      ].map((command2) => {
        return {
          id: "Pwsh Unix Command Not Found Error",
          enabled: true,
          label: `Run: ${command2}`,
          tooltip: `Run: ${command2}`,
          command: command2
        };
      });
      setup(() => {
        const pushCommand = pwshUnixCommandNotFoundError();
        quickFixAddon.registerCommandFinishedListener(pushCommand);
        expectedMap.set(pushCommand.commandLineMatcher.toString(), [pushCommand]);
      });
      test("returns undefined when output does not match", async () => {
        strictEqual(await getQuickFixesForCommand([], terminal, createCommand(command, `invalid output`, PwshUnixCommandNotFoundErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), void 0);
      });
      test("returns actions when output matches", async () => {
        assertMatchOptions(await getQuickFixesForCommand([], terminal, createCommand(command, output, PwshUnixCommandNotFoundErrorOutputRegex, exitCode), expectedMap, commandService, openerService, labelService), actions);
      });
    });
  });
});
function createCommand(command, output, outputMatcher, exitCode, outputLines) {
  return {
    cwd: "",
    commandStartLineContent: "",
    markProperties: {},
    executedX: void 0,
    startX: void 0,
    command,
    isTrusted: true,
    exitCode,
    getOutput: () => {
      return output;
    },
    getOutputMatch: (_matcher) => {
      if (outputMatcher) {
        const regexMatch = output.match(outputMatcher) ?? void 0;
        if (regexMatch) {
          return outputLines ? { regexMatch, outputLines } : { regexMatch, outputLines: [] };
        }
      }
      return void 0;
    },
    timestamp: Date.now(),
    hasOutput: () => !!output
  };
}
function assertMatchOptions(actual, expected) {
  strictEqual(actual?.length, expected.length);
  for (let i = 0; i < expected.length; i++) {
    const expectedItem = expected[i];
    const actualItem = actual[i];
    strictEqual(actualItem.id, expectedItem.id, `ID`);
    strictEqual(actualItem.enabled, expectedItem.enabled, `enabled`);
    strictEqual(actualItem.label, expectedItem.label, `label`);
    strictEqual(actualItem.tooltip, expectedItem.tooltip, `tooltip`);
    if (expectedItem.command) {
      strictEqual(actualItem.command, expectedItem.command);
    }
    if (expectedItem.uri) {
      strictEqual(actualItem.uri.toString(), expectedItem.uri.toString());
    }
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxccXVpY2tGaXhcXHRlc3RcXGJyb3dzZXJcXHF1aWNrRml4QWRkb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9icm93c2VyL2VkaXRvclRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dE1lbnVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbW1hbmQsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsT3V0cHV0TWF0Y2hlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxRdWlja0ZpeFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3F1aWNrRml4LmpzJztcbmltcG9ydCB7IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kLCBUZXJtaW5hbFF1aWNrRml4QWRkb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3F1aWNrRml4QWRkb24uanMnO1xuaW1wb3J0IHsgZnJlZVBvcnQsIEZyZWVQb3J0T3V0cHV0UmVnZXgsIGdpdENyZWF0ZVByLCBHaXRDcmVhdGVQck91dHB1dFJlZ2V4LCBnaXRGYXN0Rm9yd2FyZFB1bGwsIEdpdEZhc3RGb3J3YXJkUHVsbE91dHB1dFJlZ2V4LCBHaXRQdXNoT3V0cHV0UmVnZXgsIGdpdFB1c2hTZXRVcHN0cmVhbSwgZ2l0U2ltaWxhciwgR2l0U2ltaWxhck91dHB1dFJlZ2V4LCBnaXRUd29EYXNoZXMsIEdpdFR3b0Rhc2hlc1JlZ2V4LCBwd3NoR2VuZXJhbEVycm9yLCBQd3NoR2VuZXJhbEVycm9yT3V0cHV0UmVnZXgsIHB3c2hVbml4Q29tbWFuZE5vdEZvdW5kRXJyb3IsIFB3c2hVbml4Q29tbWFuZE5vdEZvdW5kRXJyb3JPdXRwdXRSZWdleCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxRdWlja0ZpeEJ1aWx0aW5BY3Rpb25zLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuXG5zdWl0ZSgnUXVpY2tGaXhBZGRvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgcXVpY2tGaXhBZGRvbjogVGVybWluYWxRdWlja0ZpeEFkZG9uO1xuXHRsZXQgY29tbWFuZERldGVjdGlvbjogQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdGxldCBjb21tYW5kU2VydmljZTogVGVzdENvbW1hbmRTZXJ2aWNlO1xuXHRsZXQgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2U7XG5cdGxldCBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2U7XG5cdGxldCB0ZXJtaW5hbDogVGVybWluYWw7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IFRlcm1pbmFsQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHR0ZXJtaW5hbCA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDdG9yKHtcblx0XHRcdGFsbG93UHJvcG9zZWRBcGk6IHRydWUsXG5cdFx0XHRjb2xzOiA4MCxcblx0XHRcdHJvd3M6IDMwLFxuXHRcdFx0bG9nZ2VyOiBUZXN0WHRlcm1Mb2dnZXJcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbFF1aWNrRml4U2VydmljZSwge1xuXHRcdFx0b25EaWRSZWdpc3RlclByb3ZpZGVyOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRVbnJlZ2lzdGVyUHJvdmlkZXI6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZFJlZ2lzdGVyQ29tbWFuZFNlbGVjdG9yOiBFdmVudC5Ob25lLFxuXHRcdFx0ZXh0ZW5zaW9uUXVpY2tGaXhlczogUHJvbWlzZS5yZXNvbHZlKFtdKVxuXHRcdH0gYXMgUGFydGlhbDxJVGVybWluYWxRdWlja0ZpeFNlcnZpY2U+KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRsYWJlbFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIHt9IGFzIFBhcnRpYWw8SUxhYmVsU2VydmljZT4pO1xuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbW1hbmREZXRlY3Rpb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIHRlcm1pbmFsKSk7XG5cdFx0Y2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiwgY29tbWFuZERldGVjdGlvbik7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dE1lbnVTZXJ2aWNlLCBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29udGV4dE1lbnVTZXJ2aWNlKSkpO1xuXHRcdG9wZW5lclNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElPcGVuZXJTZXJ2aWNlLCB7fSBhcyBQYXJ0aWFsPElPcGVuZXJTZXJ2aWNlPik7XG5cdFx0Y29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblxuXHRcdHF1aWNrRml4QWRkb24gPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFF1aWNrRml4QWRkb24sIGdlbmVyYXRlVXVpZCgpLCBbXSwgY2FwYWJpbGl0aWVzKTtcblx0XHR0ZXJtaW5hbC5sb2FkQWRkb24ocXVpY2tGaXhBZGRvbik7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyICYgZ2V0TWF0Y2hBY3Rpb25zJywgKCkgPT4ge1xuXHRcdHN1aXRlKCdnaXRTaW1pbGFyQ29tbWFuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBnaXQgc3R0YXR1c2A7XG5cdFx0XHRsZXQgb3V0cHV0ID0gYGdpdDogJ3N0dGF0dXMnIGlzIG5vdCBhIGdpdCBjb21tYW5kLiBTZWUgJ2dpdCAtLWhlbHAnLlxuXG5cdFx0XHRUaGUgbW9zdCBzaW1pbGFyIGNvbW1hbmQgaXNcblx0XHRcdHN0YXR1c2A7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IDE7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gW3tcblx0XHRcdFx0aWQ6ICdHaXQgU2ltaWxhcicsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGxhYmVsOiAnUnVuOiBnaXQgc3RhdHVzJyxcblx0XHRcdFx0dG9vbHRpcDogJ1J1bjogZ2l0IHN0YXR1cycsXG5cdFx0XHRcdGNvbW1hbmQ6ICdnaXQgc3RhdHVzJ1xuXHRcdFx0fV07XG5cdFx0XHRjb25zdCBvdXRwdXRMaW5lcyA9IG91dHB1dC5zcGxpdCgnXFxuJyk7XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBnaXRTaW1pbGFyKCk7XG5cdFx0XHRcdGV4cGVjdGVkTWFwLnNldChjb21tYW5kLmNvbW1hbmRMaW5lTWF0Y2hlci50b1N0cmluZygpLCBbY29tbWFuZF0pO1xuXHRcdFx0XHRxdWlja0ZpeEFkZG9uLnJlZ2lzdGVyQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIoY29tbWFuZCk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdvdXRwdXQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgKGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBgaW52YWxpZCBvdXRwdXRgLCBHaXRTaW1pbGFyT3V0cHV0UmVnZXgsIGV4aXRDb2RlLCBbYGludmFsaWQgb3V0cHV0YF0pLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnY29tbWFuZCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCAoZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGBndCBzdHRhdHVzYCwgb3V0cHV0LCBHaXRTaW1pbGFyT3V0cHV0UmVnZXgsIGV4aXRDb2RlLCBvdXRwdXRMaW5lcyksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyBhY3Rpb25zIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ2V4cGVjdGVkIHVuaXggZXhpdCBjb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0U2ltaWxhck91dHB1dFJlZ2V4LCBleGl0Q29kZSwgb3V0cHV0TGluZXMpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ21hdGNoaW5nIGV4aXQgc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0U2ltaWxhck91dHB1dFJlZ2V4LCAyLCBvdXRwdXRMaW5lcyksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ3JldHVybnMgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRTaW1pbGFyT3V0cHV0UmVnZXgsIGV4aXRDb2RlLCBvdXRwdXRMaW5lcyksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0ZXN0KCdyZXR1cm5zIG11bHRpcGxlIG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdG91dHB1dCA9IGBnaXQ6ICdwdScgaXMgbm90IGEgZ2l0IGNvbW1hbmQuIFNlZSAnZ2l0IC0taGVscCcuXG5cdFx0XHRcdFRoZSBtb3N0IHNpbWlsYXIgY29tbWFuZHMgYXJlXG5cdFx0XHRcdFx0XHRwdWxsXG5cdFx0XHRcdFx0XHRwdXNoYDtcblx0XHRcdFx0XHRjb25zdCBhY3Rpb25zID0gW3tcblx0XHRcdFx0XHRcdGlkOiAnR2l0IFNpbWlsYXInLFxuXHRcdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnUnVuOiBnaXQgcHVsbCcsXG5cdFx0XHRcdFx0XHR0b29sdGlwOiAnUnVuOiBnaXQgcHVsbCcsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnZ2l0IHB1bGwnXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0aWQ6ICdHaXQgU2ltaWxhcicsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdSdW46IGdpdCBwdXNoJyxcblx0XHRcdFx0XHRcdHRvb2x0aXA6ICdSdW46IGdpdCBwdXNoJyxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdnaXQgcHVzaCdcblx0XHRcdFx0XHR9XTtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZCgnZ2l0IHB1Jywgb3V0cHV0LCBHaXRTaW1pbGFyT3V0cHV0UmVnZXgsIGV4aXRDb2RlLCBvdXRwdXQuc3BsaXQoJ1xcbicpKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdwYXNzZXMgYW55IGFyZ3VtZW50cyB0aHJvdWdoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdG91dHB1dCA9IGBnaXQ6ICdjaGVja291dHQnIGlzIG5vdCBhIGdpdCBjb21tYW5kLiBTZWUgJ2dpdCAtLWhlbHAnLlxuXHRcdFx0XHRUaGUgbW9zdCBzaW1pbGFyIGNvbW1hbmRzIGFyZVxuXHRcdFx0XHRcdFx0Y2hlY2tvdXRgO1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKCdnaXQgY2hlY2tvdXR0IC4nLCBvdXRwdXQsIEdpdFNpbWlsYXJPdXRwdXRSZWdleCwgZXhpdENvZGUsIG91dHB1dC5zcGxpdCgnXFxuJykpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBbe1xuXHRcdFx0XHRcdFx0aWQ6ICdHaXQgU2ltaWxhcicsXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0bGFiZWw6ICdSdW46IGdpdCBjaGVja291dCAuJyxcblx0XHRcdFx0XHRcdHRvb2x0aXA6ICdSdW46IGdpdCBjaGVja291dCAuJyxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdnaXQgY2hlY2tvdXQgLidcblx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ2dpdFR3b0Rhc2hlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBnaXQgYWRkIC4gLWFsbGA7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSAnZXJyb3I6IGRpZCB5b3UgbWVhbiBgLS1hbGxgICh3aXRoIHR3byBkYXNoZXMpPyc7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IDE7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gW3tcblx0XHRcdFx0aWQ6ICdHaXQgVHdvIERhc2hlcycsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGxhYmVsOiAnUnVuOiBnaXQgYWRkIC4gLS1hbGwnLFxuXHRcdFx0XHR0b29sdGlwOiAnUnVuOiBnaXQgYWRkIC4gLS1hbGwnLFxuXHRcdFx0XHRjb21tYW5kOiAnZ2l0IGFkZCAuIC0tYWxsJ1xuXHRcdFx0fV07XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBnaXRUd29EYXNoZXMoKTtcblx0XHRcdFx0ZXhwZWN0ZWRNYXAuc2V0KGNvbW1hbmQuY29tbWFuZExpbmVNYXRjaGVyLnRvU3RyaW5nKCksIFtjb21tYW5kXSk7XG5cdFx0XHRcdHF1aWNrRml4QWRkb24ucmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihjb21tYW5kKTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ291dHB1dCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIGBpbnZhbGlkIG91dHB1dGAsIEdpdFR3b0Rhc2hlc1JlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdjb21tYW5kIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoYGd0IHN0dGF0dXNgLCBvdXRwdXQsIEdpdFR3b0Rhc2hlc1JlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyBhY3Rpb25zIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ2V4cGVjdGVkIHVuaXggZXhpdCBjb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0VHdvRGFzaGVzUmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdtYXRjaGluZyBleGl0IHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdFR3b0Rhc2hlc1JlZ2V4LCAyKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ2dpdEZhc3RGb3J3YXJkUHVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBnaXQgY2hlY2tvdXQgdm5leHRgO1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gJ0FscmVhZHkgb24gXFwndm5leHRcXCcgXFxuIFlvdXIgYnJhbmNoIGlzIGJlaGluZCBcXCdvcmlnaW4vdm5leHRcXCcgYnkgMSBjb21taXQsIGFuZCBjYW4gYmUgZmFzdC1mb3J3YXJkZWQuJztcblx0XHRcdGNvbnN0IGV4aXRDb2RlID0gMDtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbe1xuXHRcdFx0XHRpZDogJ0dpdCBGYXN0IEZvcndhcmQgUHVsbCcsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGxhYmVsOiAnUnVuOiBnaXQgcHVsbCcsXG5cdFx0XHRcdHRvb2x0aXA6ICdSdW46IGdpdCBwdWxsJyxcblx0XHRcdFx0Y29tbWFuZDogJ2dpdCBwdWxsJ1xuXHRcdFx0fV07XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBnaXRGYXN0Rm9yd2FyZFB1bGwoKTtcblx0XHRcdFx0ZXhwZWN0ZWRNYXAuc2V0KGNvbW1hbmQuY29tbWFuZExpbmVNYXRjaGVyLnRvU3RyaW5nKCksIFtjb21tYW5kXSk7XG5cdFx0XHRcdHF1aWNrRml4QWRkb24ucmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihjb21tYW5kKTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ291dHB1dCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIGBpbnZhbGlkIG91dHB1dGAsIEdpdEZhc3RGb3J3YXJkUHVsbE91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdjb21tYW5kIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoYGd0IGFkZGAsIG91dHB1dCwgR2l0RmFzdEZvcndhcmRQdWxsT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ2V4aXQgY29kZSBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0RmFzdEZvcndhcmRQdWxsT3V0cHV0UmVnZXgsIDIpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgYWN0aW9ucyB3aGVuJywgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCdtYXRjaGluZyBleGl0IHN0YXR1cywgY29tbWFuZCwgb3VwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRGYXN0Rm9yd2FyZFB1bGxPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0c3VpdGUoJ2ZyZWVQb3J0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZE1hcCA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Y29uc3QgcG9ydENvbW1hbmQgPSBgeWFybiBzdGFydCBkZXZgO1xuXHRcdFx0XHRjb25zdCBvdXRwdXQgPSBgeWFybiBydW4gdjEuMjIuMTdcblx0XHRcdHdhcm5pbmcgLi4vLi4vcGFja2FnZS5qc29uOiBObyBsaWNlbnNlIGZpZWxkXG5cdFx0XHRFcnJvcjogbGlzdGVuIEVBRERSSU5VU0U6IGFkZHJlc3MgYWxyZWFkeSBpbiB1c2UgMC4wLjAuMDozMDAwXG5cdFx0XHRcdGF0IFNlcnZlci5zZXR1cExpc3RlbkhhbmRsZSBbYXMgX2xpc3RlbjJdIChub2RlOm5ldDoxMzE1OjE2KVxuXHRcdFx0XHRhdCBsaXN0ZW5JbkNsdXN0ZXIgKG5vZGU6bmV0OjEzNjM6MTIpXG5cdFx0XHRcdGF0IGRvTGlzdGVuIChub2RlOm5ldDoxNTAxOjcpXG5cdFx0XHRcdGF0IHByb2Nlc3NUaWNrc0FuZFJlamVjdGlvbnMgKG5vZGU6aW50ZXJuYWwvcHJvY2Vzcy90YXNrX3F1ZXVlczo4NDoyMSlcblx0XHRcdEVtaXR0ZWQgJ2Vycm9yJyBldmVudCBvbiBXZWJTb2NrZXRTZXJ2ZXIgaW5zdGFuY2UgYXQ6XG5cdFx0XHRcdGF0IFNlcnZlci5lbWl0IChub2RlOmV2ZW50czozOTQ6MjgpXG5cdFx0XHRcdGF0IGVtaXRFcnJvck5UIChub2RlOm5ldDoxMzQyOjgpXG5cdFx0XHRcdGF0IHByb2Nlc3NUaWNrc0FuZFJlamVjdGlvbnMgKG5vZGU6aW50ZXJuYWwvcHJvY2Vzcy90YXNrX3F1ZXVlczo4MzoyMSkge1xuXHRcdFx0fVxuXHRcdFx0ZXJyb3IgQ29tbWFuZCBmYWlsZWQgd2l0aCBleGl0IGNvZGUgMS5cblx0XHRcdGluZm8gVmlzaXQgaHR0cHM6Ly95YXJucGtnLmNvbS9lbi9kb2NzL2NsaS9ydW4gZm9yIGRvY3VtZW50YXRpb24gYWJvdXQgdGhpcyBjb21tYW5kLmA7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbk9wdGlvbnMgPSBbe1xuXHRcdFx0XHRcdGlkOiAnRnJlZSBQb3J0Jyxcblx0XHRcdFx0XHRsYWJlbDogJ0ZyZWUgcG9ydCAzMDAwJyxcblx0XHRcdFx0XHRydW46IHRydWUsXG5cdFx0XHRcdFx0dG9vbHRpcDogJ0ZyZWUgcG9ydCAzMDAwJyxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlXG5cdFx0XHRcdH1dO1xuXHRcdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZCA9IGZyZWVQb3J0KCgpID0+IFByb21pc2UucmVzb2x2ZSgpKTtcblx0XHRcdFx0XHRleHBlY3RlZE1hcC5zZXQoY29tbWFuZC5jb21tYW5kTGluZU1hdGNoZXIudG9TdHJpbmcoKSwgW2NvbW1hbmRdKTtcblx0XHRcdFx0XHRxdWlja0ZpeEFkZG9uLnJlZ2lzdGVyQ29tbWFuZEZpbmlzaGVkTGlzdGVuZXIoY29tbWFuZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzdWl0ZSgncmV0dXJucyB1bmRlZmluZWQgd2hlbicsICgpID0+IHtcblx0XHRcdFx0XHR0ZXN0KCdvdXRwdXQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKHBvcnRDb21tYW5kLCBgaW52YWxpZCBvdXRwdXRgLCBGcmVlUG9ydE91dHB1dFJlZ2V4KSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3JldHVybnMgYWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChwb3J0Q29tbWFuZCwgb3V0cHV0LCBGcmVlUG9ydE91dHB1dFJlZ2V4KSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9uT3B0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0c3VpdGUoJ2dpdFB1c2hTZXRVcHN0cmVhbScsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBnaXQgcHVzaGA7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBgZmF0YWw6IFRoZSBjdXJyZW50IGJyYW5jaCB0ZXN0MjIgaGFzIG5vIHVwc3RyZWFtIGJyYW5jaC5cblx0XHRcdFRvIHB1c2ggdGhlIGN1cnJlbnQgYnJhbmNoIGFuZCBzZXQgdGhlIHJlbW90ZSBhcyB1cHN0cmVhbSwgdXNlXG5cblx0XHRcdFx0Z2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luIHRlc3QyMmA7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IDEyODtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbe1xuXHRcdFx0XHRpZDogJ0dpdCBQdXNoIFNldCBVcHN0cmVhbScsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGxhYmVsOiAnUnVuOiBnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gdGVzdDIyJyxcblx0XHRcdFx0dG9vbHRpcDogJ1J1bjogZ2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luIHRlc3QyMicsXG5cdFx0XHRcdGNvbW1hbmQ6ICdnaXQgcHVzaCAtLXNldC11cHN0cmVhbSBvcmlnaW4gdGVzdDIyJ1xuXHRcdFx0fV07XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBnaXRQdXNoU2V0VXBzdHJlYW0oKTtcblx0XHRcdFx0ZXhwZWN0ZWRNYXAuc2V0KGNvbW1hbmQuY29tbWFuZExpbmVNYXRjaGVyLnRvU3RyaW5nKCksIFtjb21tYW5kXSk7XG5cdFx0XHRcdHF1aWNrRml4QWRkb24ucmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihjb21tYW5kKTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ291dHB1dCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIGBpbnZhbGlkIG91dHB1dGAsIEdpdFB1c2hPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnY29tbWFuZCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGBnaXQgc3RhdHVzYCwgb3V0cHV0LCBHaXRQdXNoT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdyZXR1cm5zIGFjdGlvbnMgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnZXhwZWN0ZWQgdW5peCBleGl0IGNvZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRQdXNoT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdtYXRjaGluZyBleGl0IHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdFB1c2hPdXRwdXRSZWdleCwgMiksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdnaXRDcmVhdGVQcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBnaXQgcHVzaGA7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBgVG90YWwgMCAoZGVsdGEgMCksIHJldXNlZCAwIChkZWx0YSAwKSwgcGFjay1yZXVzZWQgMFxuXHRcdFx0cmVtb3RlOlxuXHRcdFx0cmVtb3RlOiBDcmVhdGUgYSBwdWxsIHJlcXVlc3QgZm9yICd0ZXN0MjInIG9uIEdpdEh1YiBieSB2aXNpdGluZzpcblx0XHRcdHJlbW90ZTogICAgICBodHRwczovL2dpdGh1Yi5jb20vbWVnYW5yb2dnZS94dGVybS5qcy9wdWxsL25ldy90ZXN0MjJcblx0XHRcdHJlbW90ZTpcblx0XHRcdFRvIGh0dHBzOi8vZ2l0aHViLmNvbS9tZWdhbnJvZ2dlL3h0ZXJtLmpzXG5cdFx0XHQgKiBbbmV3IGJyYW5jaF0gICAgICAgIHRlc3QyMiAtPiB0ZXN0MjJcblx0XHRcdEJyYW5jaCAndGVzdDIyJyBzZXQgdXAgdG8gdHJhY2sgcmVtb3RlIGJyYW5jaCAndGVzdDIyJyBmcm9tICdvcmlnaW4nLiBgO1xuXHRcdFx0Y29uc3QgZXhpdENvZGUgPSAwO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IFt7XG5cdFx0XHRcdGlkOiAnR2l0IENyZWF0ZSBQcicsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGxhYmVsOiAnT3BlbjogaHR0cHM6Ly9naXRodWIuY29tL21lZ2Fucm9nZ2UveHRlcm0uanMvcHVsbC9uZXcvdGVzdDIyJyxcblx0XHRcdFx0dG9vbHRpcDogJ09wZW46IGh0dHBzOi8vZ2l0aHViLmNvbS9tZWdhbnJvZ2dlL3h0ZXJtLmpzL3B1bGwvbmV3L3Rlc3QyMicsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vbWVnYW5yb2dnZS94dGVybS5qcy9wdWxsL25ldy90ZXN0MjInKVxuXHRcdFx0fV07XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBnaXRDcmVhdGVQcigpO1xuXHRcdFx0XHRleHBlY3RlZE1hcC5zZXQoY29tbWFuZC5jb21tYW5kTGluZU1hdGNoZXIudG9TdHJpbmcoKSwgW2NvbW1hbmRdKTtcblx0XHRcdFx0cXVpY2tGaXhBZGRvbi5yZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKGNvbW1hbmQpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgncmV0dXJucyB1bmRlZmluZWQgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnb3V0cHV0IGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgYGludmFsaWQgb3V0cHV0YCwgR2l0Q3JlYXRlUHJPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnY29tbWFuZCBkb2VzIG5vdCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGBnaXQgc3RhdHVzYCwgb3V0cHV0LCBHaXRDcmVhdGVQck91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCdmYWlsdXJlIGV4aXQgc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRDcmVhdGVQck91dHB1dFJlZ2V4LCAyKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdyZXR1cm5zIGFjdGlvbnMgd2hlbicsICgpID0+IHtcblx0XHRcdFx0dGVzdCgnZXhwZWN0ZWQgdW5peCBleGl0IGNvZGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBHaXRDcmVhdGVQck91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIGFjdGlvbnMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ2dpdFB1c2ggLSBtdWx0aXBsZSBwcm92aWRlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwZWN0ZWRNYXAgPSBuZXcgTWFwKCk7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGBnaXQgcHVzaGA7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gYGZhdGFsOiBUaGUgY3VycmVudCBicmFuY2ggdGVzdDIyIGhhcyBubyB1cHN0cmVhbSBicmFuY2guXG5cdFx0VG8gcHVzaCB0aGUgY3VycmVudCBicmFuY2ggYW5kIHNldCB0aGUgcmVtb3RlIGFzIHVwc3RyZWFtLCB1c2VcblxuXHRcdFx0Z2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luIHRlc3QyMmA7XG5cdFx0Y29uc3QgZXhpdENvZGUgPSAxMjg7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IFt7XG5cdFx0XHRpZDogJ0dpdCBQdXNoIFNldCBVcHN0cmVhbScsXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0bGFiZWw6ICdSdW46IGdpdCBwdXNoIC0tc2V0LXVwc3RyZWFtIG9yaWdpbiB0ZXN0MjInLFxuXHRcdFx0dG9vbHRpcDogJ1J1bjogZ2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luIHRlc3QyMicsXG5cdFx0XHRjb21tYW5kOiAnZ2l0IHB1c2ggLS1zZXQtdXBzdHJlYW0gb3JpZ2luIHRlc3QyMidcblx0XHR9XTtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRjb25zdCBwdXNoQ29tbWFuZCA9IGdpdFB1c2hTZXRVcHN0cmVhbSgpO1xuXHRcdFx0Y29uc3QgcHJDb21tYW5kID0gZ2l0Q3JlYXRlUHIoKTtcblx0XHRcdHF1aWNrRml4QWRkb24ucmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihwckNvbW1hbmQpO1xuXHRcdFx0ZXhwZWN0ZWRNYXAuc2V0KHB1c2hDb21tYW5kLmNvbW1hbmRMaW5lTWF0Y2hlci50b1N0cmluZygpLCBbcHVzaENvbW1hbmQsIHByQ29tbWFuZF0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnb3V0cHV0IGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIGBpbnZhbGlkIG91dHB1dGAsIEdpdFB1c2hPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdjb21tYW5kIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGBnaXQgc3RhdHVzYCwgb3V0cHV0LCBHaXRQdXNoT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdyZXR1cm5zIGFjdGlvbnMgd2hlbicsICgpID0+IHtcblx0XHRcdHRlc3QoJ2V4cGVjdGVkIHVuaXggZXhpdCBjb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIEdpdFB1c2hPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbWF0Y2hpbmcgZXhpdCBzdGF0dXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydE1hdGNoT3B0aW9ucygoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIG91dHB1dCwgR2l0UHVzaE91dHB1dFJlZ2V4LCAyKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdwd3NoIGZlZWRiYWNrIHByb3ZpZGVycycsICgpID0+IHtcblx0XHRzdWl0ZSgnR2VuZXJhbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkTWFwID0gbmV3IE1hcCgpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBub3QgaW1wb3J0YW50YDtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0YC4uLmAsXG5cdFx0XHRcdGBgLFxuXHRcdFx0XHRgU3VnZ2VzdGlvbiBbR2VuZXJhbF06YCxcblx0XHRcdFx0YCAgVGhlIG1vc3Qgc2ltaWxhciBjb21tYW5kcyBhcmU6IHB5dGhvbjMsIHB5dGhvbjNtLCBwYW1vbiwgcHl0aG9uMy42LCBydG1vbiwgZWNobywgcHVzaGQsIGV0c24sIHB3c2gsIHB3Y29udi5gLFxuXHRcdFx0XHRgYCxcblx0XHRcdFx0YFN1Z2dlc3Rpb24gW2NtZC1ub3QtZm91bmRdOmAsXG5cdFx0XHRcdGAgIENvbW1hbmQgJ3B5dGhvbicgbm90IGZvdW5kLCBidXQgY2FuIGJlIGluc3RhbGxlZCB3aXRoOmAsXG5cdFx0XHRcdGAgIHN1ZG8gYXB0IGluc3RhbGwgcHl0aG9uM2AsXG5cdFx0XHRcdGAgIHN1ZG8gYXB0IGluc3RhbGwgcHl0aG9uYCxcblx0XHRcdFx0YCAgc3VkbyBhcHQgaW5zdGFsbCBweXRob24tbWluaW1hbGAsXG5cdFx0XHRcdGAgIFlvdSBhbHNvIGhhdmUgcHl0aG9uMyBpbnN0YWxsZWQsIHlvdSBjYW4gcnVuICdweXRob24zJyBpbnN0ZWFkLidgLFxuXHRcdFx0XHRgYCxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IDEyODtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbXG5cdFx0XHRcdCdweXRob24zJyxcblx0XHRcdFx0J3B5dGhvbjNtJyxcblx0XHRcdFx0J3BhbW9uJyxcblx0XHRcdFx0J3B5dGhvbjMuNicsXG5cdFx0XHRcdCdydG1vbicsXG5cdFx0XHRcdCdlY2hvJyxcblx0XHRcdFx0J3B1c2hkJyxcblx0XHRcdFx0J2V0c24nLFxuXHRcdFx0XHQncHdzaCcsXG5cdFx0XHRcdCdwd2NvbnYnLFxuXHRcdFx0XS5tYXAoY29tbWFuZCA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6ICdQd3NoIEdlbmVyYWwgRXJyb3InLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0bGFiZWw6IGBSdW46ICR7Y29tbWFuZH1gLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGBSdW46ICR7Y29tbWFuZH1gLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGNvbW1hbmRcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwdXNoQ29tbWFuZCA9IHB3c2hHZW5lcmFsRXJyb3IoKTtcblx0XHRcdFx0cXVpY2tGaXhBZGRvbi5yZWdpc3RlckNvbW1hbmRGaW5pc2hlZExpc3RlbmVyKHB1c2hDb21tYW5kKTtcblx0XHRcdFx0ZXhwZWN0ZWRNYXAuc2V0KHB1c2hDb21tYW5kLmNvbW1hbmRMaW5lTWF0Y2hlci50b1N0cmluZygpLCBbcHVzaENvbW1hbmRdKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBvdXRwdXQgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgYGludmFsaWQgb3V0cHV0YCwgUHdzaEdlbmVyYWxFcnJvck91dHB1dFJlZ2V4LCBleGl0Q29kZSksIGV4cGVjdGVkTWFwLCBjb21tYW5kU2VydmljZSwgb3BlbmVyU2VydmljZSwgbGFiZWxTZXJ2aWNlKSksIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3JldHVybnMgYWN0aW9ucyB3aGVuIG91dHB1dCBtYXRjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnRNYXRjaE9wdGlvbnMoKGF3YWl0IGdldFF1aWNrRml4ZXNGb3JDb21tYW5kKFtdLCB0ZXJtaW5hbCwgY3JlYXRlQ29tbWFuZChjb21tYW5kLCBvdXRwdXQsIFB3c2hHZW5lcmFsRXJyb3JPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCBhY3Rpb25zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdVbml4IGNtZC1ub3QtZm91bmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1hcCA9IG5ldyBNYXAoKTtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBgbm90IGltcG9ydGFudGA7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdGAuLi5gLFxuXHRcdFx0XHRgYCxcblx0XHRcdFx0YFN1Z2dlc3Rpb24gW0dlbmVyYWxdYCxcblx0XHRcdFx0YCAgVGhlIG1vc3Qgc2ltaWxhciBjb21tYW5kcyBhcmU6IHB5dGhvbjMsIHB5dGhvbjNtLCBwYW1vbiwgcHl0aG9uMy42LCBydG1vbiwgZWNobywgcHVzaGQsIGV0c24sIHB3c2gsIHB3Y29udi5gLFxuXHRcdFx0XHRgYCxcblx0XHRcdFx0YFN1Z2dlc3Rpb24gW2NtZC1ub3QtZm91bmRdOmAsXG5cdFx0XHRcdGAgIENvbW1hbmQgJ3B5dGhvbicgbm90IGZvdW5kLCBidXQgY2FuIGJlIGluc3RhbGxlZCB3aXRoOmAsXG5cdFx0XHRcdGAgIHN1ZG8gYXB0IGluc3RhbGwgcHl0aG9uM2AsXG5cdFx0XHRcdGAgIHN1ZG8gYXB0IGluc3RhbGwgcHl0aG9uYCxcblx0XHRcdFx0YCAgc3VkbyBhcHQgaW5zdGFsbCBweXRob24tbWluaW1hbGAsXG5cdFx0XHRcdGAgIFlvdSBhbHNvIGhhdmUgcHl0aG9uMyBpbnN0YWxsZWQsIHlvdSBjYW4gcnVuICdweXRob24zJyBpbnN0ZWFkLidgLFxuXHRcdFx0XHRgYCxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBleGl0Q29kZSA9IDEyODtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBbXG5cdFx0XHRcdCdzdWRvIGFwdCBpbnN0YWxsIHB5dGhvbjMnLFxuXHRcdFx0XHQnc3VkbyBhcHQgaW5zdGFsbCBweXRob24nLFxuXHRcdFx0XHQnc3VkbyBhcHQgaW5zdGFsbCBweXRob24tbWluaW1hbCcsXG5cdFx0XHRcdCdweXRob24zJyxcblx0XHRcdF0ubWFwKGNvbW1hbmQgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiAnUHdzaCBVbml4IENvbW1hbmQgTm90IEZvdW5kIEVycm9yJyxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGxhYmVsOiBgUnVuOiAke2NvbW1hbmR9YCxcblx0XHRcdFx0XHR0b29sdGlwOiBgUnVuOiAke2NvbW1hbmR9YCxcblx0XHRcdFx0XHRjb21tYW5kOiBjb21tYW5kXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcHVzaENvbW1hbmQgPSBwd3NoVW5peENvbW1hbmROb3RGb3VuZEVycm9yKCk7XG5cdFx0XHRcdHF1aWNrRml4QWRkb24ucmVnaXN0ZXJDb21tYW5kRmluaXNoZWRMaXN0ZW5lcihwdXNoQ29tbWFuZCk7XG5cdFx0XHRcdGV4cGVjdGVkTWFwLnNldChwdXNoQ29tbWFuZC5jb21tYW5kTGluZU1hdGNoZXIudG9TdHJpbmcoKSwgW3B1c2hDb21tYW5kXSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gb3V0cHV0IGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0UXVpY2tGaXhlc0ZvckNvbW1hbmQoW10sIHRlcm1pbmFsLCBjcmVhdGVDb21tYW5kKGNvbW1hbmQsIGBpbnZhbGlkIG91dHB1dGAsIFB3c2hVbml4Q29tbWFuZE5vdEZvdW5kRXJyb3JPdXRwdXRSZWdleCwgZXhpdENvZGUpLCBleHBlY3RlZE1hcCwgY29tbWFuZFNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIGxhYmVsU2VydmljZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdyZXR1cm5zIGFjdGlvbnMgd2hlbiBvdXRwdXQgbWF0Y2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0TWF0Y2hPcHRpb25zKChhd2FpdCBnZXRRdWlja0ZpeGVzRm9yQ29tbWFuZChbXSwgdGVybWluYWwsIGNyZWF0ZUNvbW1hbmQoY29tbWFuZCwgb3V0cHV0LCBQd3NoVW5peENvbW1hbmROb3RGb3VuZEVycm9yT3V0cHV0UmVnZXgsIGV4aXRDb2RlKSwgZXhwZWN0ZWRNYXAsIGNvbW1hbmRTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBsYWJlbFNlcnZpY2UpKSwgYWN0aW9ucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gY3JlYXRlQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIG91dHB1dDogc3RyaW5nLCBvdXRwdXRNYXRjaGVyPzogUmVnRXhwIHwgc3RyaW5nLCBleGl0Q29kZT86IG51bWJlciwgb3V0cHV0TGluZXM/OiBzdHJpbmdbXSk6IElUZXJtaW5hbENvbW1hbmQge1xuXHRyZXR1cm4ge1xuXHRcdGN3ZDogJycsXG5cdFx0Y29tbWFuZFN0YXJ0TGluZUNvbnRlbnQ6ICcnLFxuXHRcdG1hcmtQcm9wZXJ0aWVzOiB7fSxcblx0XHRleGVjdXRlZFg6IHVuZGVmaW5lZCxcblx0XHRzdGFydFg6IHVuZGVmaW5lZCxcblx0XHRjb21tYW5kLFxuXHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRleGl0Q29kZSxcblx0XHRnZXRPdXRwdXQ6ICgpID0+IHsgcmV0dXJuIG91dHB1dDsgfSxcblx0XHRnZXRPdXRwdXRNYXRjaDogKF9tYXRjaGVyOiBJVGVybWluYWxPdXRwdXRNYXRjaGVyKSA9PiB7XG5cdFx0XHRpZiAob3V0cHV0TWF0Y2hlcikge1xuXHRcdFx0XHRjb25zdCByZWdleE1hdGNoID0gb3V0cHV0Lm1hdGNoKG91dHB1dE1hdGNoZXIpID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHJlZ2V4TWF0Y2gpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3V0cHV0TGluZXMgPyB7IHJlZ2V4TWF0Y2gsIG91dHB1dExpbmVzIH0gOiB7IHJlZ2V4TWF0Y2gsIG91dHB1dExpbmVzOiBbXSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0sXG5cdFx0dGltZXN0YW1wOiBEYXRlLm5vdygpLFxuXHRcdGhhc091dHB1dDogKCkgPT4gISFvdXRwdXRcblx0fSBhcyBJVGVybWluYWxDb21tYW5kO1xufVxuXG50eXBlIFRlc3RBY3Rpb24gPSBQaWNrPElBY3Rpb24sICdpZCcgfCAnbGFiZWwnIHwgJ3Rvb2x0aXAnIHwgJ2VuYWJsZWQnPiAmIHsgY29tbWFuZD86IHN0cmluZzsgdXJpPzogVVJJIH07XG5mdW5jdGlvbiBhc3NlcnRNYXRjaE9wdGlvbnMoYWN0dWFsOiBUZXN0QWN0aW9uW10gfCB1bmRlZmluZWQsIGV4cGVjdGVkOiBUZXN0QWN0aW9uW10pOiB2b2lkIHtcblx0c3RyaWN0RXF1YWwoYWN0dWFsPy5sZW5ndGgsIGV4cGVjdGVkLmxlbmd0aCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZXhwZWN0ZWQubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBleHBlY3RlZEl0ZW0gPSBleHBlY3RlZFtpXTtcblx0XHRjb25zdCBhY3R1YWxJdGVtOiBhbnkgPSBhY3R1YWxbaV07XG5cdFx0c3RyaWN0RXF1YWwoYWN0dWFsSXRlbS5pZCwgZXhwZWN0ZWRJdGVtLmlkLCBgSURgKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWxJdGVtLmVuYWJsZWQsIGV4cGVjdGVkSXRlbS5lbmFibGVkLCBgZW5hYmxlZGApO1xuXHRcdHN0cmljdEVxdWFsKGFjdHVhbEl0ZW0ubGFiZWwsIGV4cGVjdGVkSXRlbS5sYWJlbCwgYGxhYmVsYCk7XG5cdFx0c3RyaWN0RXF1YWwoYWN0dWFsSXRlbS50b29sdGlwLCBleHBlY3RlZEl0ZW0udG9vbHRpcCwgYHRvb2x0aXBgKTtcblx0XHRpZiAoZXhwZWN0ZWRJdGVtLmNvbW1hbmQpIHtcblx0XHRcdHN0cmljdEVxdWFsKGFjdHVhbEl0ZW0uY29tbWFuZCwgZXhwZWN0ZWRJdGVtLmNvbW1hbmQpO1xuXHRcdH1cblx0XHRpZiAoZXhwZWN0ZWRJdGVtLnVyaSkge1xuXHRcdFx0c3RyaWN0RXF1YWwoYWN0dWFsSXRlbS51cmkhLnRvU3RyaW5nKCksIGV4cGVjdGVkSXRlbS51cmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBMkIsMEJBQTBCO0FBQ3JELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCLDZCQUE2QjtBQUMvRCxTQUFTLFVBQVUscUJBQXFCLGFBQWEsd0JBQXdCLG9CQUFvQiwrQkFBK0Isb0JBQW9CLG9CQUFvQixZQUFZLHVCQUF1Qixj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
