import { deepStrictEqual, strictEqual, ok } from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { join } from "../../../../../../base/common/path.js";
import { isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { env } from "../../../../../../base/common/process.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IRemoteAgentService } from "../../../../../services/remote/common/remoteAgentService.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { fetchBashHistory, fetchFishHistory, fetchPwshHistory, fetchZshHistory, sanitizeFishHistoryCmd, TerminalPersistedHistory } from "../../common/history.js";
function getConfig(limit) {
  return {
    terminal: {
      integrated: {
        shellIntegration: {
          history: limit
        }
      }
    }
  };
}
const expectedCommands = [
  "single line command",
  'git commit -m "A wrapped line in pwsh history\n\nSome commit description\n\nFixes #xyz"',
  "git status",
  'two "\nline"'
];
suite("Terminal history", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("TerminalPersistedHistory", () => {
    let history;
    let instantiationService;
    let configurationService;
    setup(() => {
      configurationService = new TestConfigurationService(getConfig(5));
      instantiationService = store.add(new TestInstantiationService());
      instantiationService.set(IConfigurationService, configurationService);
      instantiationService.set(IStorageService, store.add(new TestStorageService()));
      history = store.add(instantiationService.createInstance(TerminalPersistedHistory, "test"));
    });
    teardown(() => {
      instantiationService.dispose();
    });
    test("should support adding items to the cache and respect LRU", () => {
      history.add("foo", 1);
      deepStrictEqual(Array.from(history.entries), [
        ["foo", 1]
      ]);
      history.add("bar", 2);
      deepStrictEqual(Array.from(history.entries), [
        ["foo", 1],
        ["bar", 2]
      ]);
      history.add("foo", 1);
      deepStrictEqual(Array.from(history.entries), [
        ["bar", 2],
        ["foo", 1]
      ]);
    });
    test("should support removing specific items", () => {
      history.add("1", 1);
      history.add("2", 2);
      history.add("3", 3);
      history.add("4", 4);
      history.add("5", 5);
      strictEqual(Array.from(history.entries).length, 5);
      history.add("6", 6);
      strictEqual(Array.from(history.entries).length, 5);
    });
    test("should limit the number of entries based on config", () => {
      history.add("1", 1);
      history.add("2", 2);
      history.add("3", 3);
      history.add("4", 4);
      history.add("5", 5);
      strictEqual(Array.from(history.entries).length, 5);
      history.add("6", 6);
      strictEqual(Array.from(history.entries).length, 5);
      configurationService.setUserConfiguration("terminal", getConfig(2).terminal);
      configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true });
      strictEqual(Array.from(history.entries).length, 2);
      history.add("7", 7);
      strictEqual(Array.from(history.entries).length, 2);
      configurationService.setUserConfiguration("terminal", getConfig(3).terminal);
      configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true });
      strictEqual(Array.from(history.entries).length, 2);
      history.add("8", 8);
      strictEqual(Array.from(history.entries).length, 3);
      history.add("9", 9);
      strictEqual(Array.from(history.entries).length, 3);
    });
    test("should reload from storage service after recreation", () => {
      history.add("1", 1);
      history.add("2", 2);
      history.add("3", 3);
      strictEqual(Array.from(history.entries).length, 3);
      const history2 = store.add(instantiationService.createInstance(TerminalPersistedHistory, "test"));
      strictEqual(Array.from(history2.entries).length, 3);
    });
  });
  suite("fetchBashHistory", () => {
    let fileScheme;
    let filePath;
    const fileContent = [
      "single line command",
      'git commit -m "A wrapped line in pwsh history',
      "",
      "Some commit description",
      "",
      'Fixes #xyz"',
      "git status",
      'two "',
      'line"'
    ].join("\n");
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    setup(() => {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IFileService, {
        async readFile(resource) {
          const expected = URI.from({ scheme: fileScheme, path: filePath });
          strictEqual(resource.scheme, expected.scheme);
          strictEqual(resource.path, expected.path);
          return { value: VSBuffer.fromString(fileContent) };
        }
      });
      instantiationService.stub(IRemoteAgentService, {
        async getEnvironment() {
          return remoteEnvironment;
        },
        getConnection() {
          return remoteConnection;
        }
      });
    });
    teardown(() => {
      instantiationService.dispose();
    });
    if (!isWindows) {
      suite("local", () => {
        let originalEnvValues;
        setup(() => {
          originalEnvValues = { HOME: env["HOME"] };
          env["HOME"] = "/home/user";
          remoteConnection = { remoteAuthority: "some-remote" };
          fileScheme = Schemas.vscodeRemote;
          filePath = "/home/user/.bash_history";
        });
        teardown(() => {
          if (originalEnvValues["HOME"] === void 0) {
            delete env["HOME"];
          } else {
            env["HOME"] = originalEnvValues["HOME"];
          }
        });
        test("current OS", async () => {
          filePath = "/home/user/.bash_history";
          deepStrictEqual((await instantiationService.invokeFunction(fetchBashHistory)).commands, expectedCommands);
        });
      });
    }
    suite("remote", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { HOME: env["HOME"] };
        env["HOME"] = "/home/user";
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/.bash_history";
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        strictEqual(await instantiationService.invokeFunction(fetchBashHistory), void 0);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        deepStrictEqual((await instantiationService.invokeFunction(fetchBashHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        deepStrictEqual((await instantiationService.invokeFunction(fetchBashHistory)).commands, expectedCommands);
      });
    });
  });
  suite("fetchZshHistory", () => {
    let fileScheme;
    let filePath;
    const fileContentType = [
      {
        type: "simple",
        content: [
          "single line command",
          'git commit -m "A wrapped line in pwsh history\\',
          "\\",
          "Some commit description\\",
          "\\",
          'Fixes #xyz"',
          "git status",
          'two "\\',
          'line"'
        ].join("\n")
      },
      {
        type: "extended",
        content: [
          ": 1655252330:0;single line command",
          ': 1655252330:0;git commit -m "A wrapped line in pwsh history\\',
          "\\",
          "Some commit description\\",
          "\\",
          'Fixes #xyz"',
          ": 1655252330:0;git status",
          ': 1655252330:0;two "\\',
          'line"'
        ].join("\n")
      }
    ];
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    for (const { type, content } of fileContentType) {
      suite(type, () => {
        setup(() => {
          instantiationService = new TestInstantiationService();
          instantiationService.stub(IFileService, {
            async readFile(resource) {
              const expected = URI.from({ scheme: fileScheme, path: filePath });
              strictEqual(resource.scheme, expected.scheme);
              strictEqual(resource.path, expected.path);
              return { value: VSBuffer.fromString(content) };
            }
          });
          instantiationService.stub(IRemoteAgentService, {
            async getEnvironment() {
              return remoteEnvironment;
            },
            getConnection() {
              return remoteConnection;
            }
          });
        });
        teardown(() => {
          instantiationService.dispose();
        });
        if (!isWindows) {
          suite("local", () => {
            let originalEnvValues;
            setup(() => {
              originalEnvValues = { HOME: env["HOME"] };
              env["HOME"] = "/home/user";
              remoteConnection = { remoteAuthority: "some-remote" };
              fileScheme = Schemas.vscodeRemote;
              filePath = "/home/user/.bash_history";
            });
            teardown(() => {
              if (originalEnvValues["HOME"] === void 0) {
                delete env["HOME"];
              } else {
                env["HOME"] = originalEnvValues["HOME"];
              }
            });
            test("current OS", async () => {
              filePath = "/home/user/.zsh_history";
              deepStrictEqual((await instantiationService.invokeFunction(fetchZshHistory)).commands, expectedCommands);
            });
          });
        }
        suite("remote", () => {
          let originalEnvValues;
          setup(() => {
            originalEnvValues = { HOME: env["HOME"] };
            env["HOME"] = "/home/user";
            remoteConnection = { remoteAuthority: "some-remote" };
            fileScheme = Schemas.vscodeRemote;
            filePath = "/home/user/.zsh_history";
          });
          teardown(() => {
            if (originalEnvValues["HOME"] === void 0) {
              delete env["HOME"];
            } else {
              env["HOME"] = originalEnvValues["HOME"];
            }
          });
          test("Windows", async () => {
            remoteEnvironment = { os: OperatingSystem.Windows };
            strictEqual(await instantiationService.invokeFunction(fetchZshHistory), void 0);
          });
          test("macOS", async () => {
            remoteEnvironment = { os: OperatingSystem.Macintosh };
            deepStrictEqual((await instantiationService.invokeFunction(fetchZshHistory)).commands, expectedCommands);
          });
          test("Linux", async () => {
            remoteEnvironment = { os: OperatingSystem.Linux };
            deepStrictEqual((await instantiationService.invokeFunction(fetchZshHistory)).commands, expectedCommands);
          });
        });
      });
    }
  });
  suite("fetchPwshHistory", () => {
    let fileScheme;
    let filePath;
    const fileContent = [
      "single line command",
      'git commit -m "A wrapped line in pwsh history`',
      "`",
      "Some commit description`",
      "`",
      'Fixes #xyz"',
      "git status",
      'two "`',
      'line"'
    ].join("\n");
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    setup(() => {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IFileService, {
        async readFile(resource) {
          const expected = URI.from({
            scheme: fileScheme,
            authority: remoteConnection?.remoteAuthority,
            path: URI.file(filePath).path
          });
          strictEqual(resource.toString().replaceAll("%5C", "/"), expected.toString().replaceAll("%5C", "/"));
          return { value: VSBuffer.fromString(fileContent) };
        }
      });
      instantiationService.stub(IRemoteAgentService, {
        async getEnvironment() {
          return remoteEnvironment;
        },
        getConnection() {
          return remoteConnection;
        }
      });
    });
    teardown(() => {
      instantiationService.dispose();
    });
    suite("local", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { HOME: env["HOME"], APPDATA: env["APPDATA"] };
        env["HOME"] = "/home/user";
        env["APPDATA"] = "C:\\AppData";
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/.zsh_history";
        originalEnvValues = { HOME: env["HOME"], APPDATA: env["APPDATA"] };
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
        if (originalEnvValues["APPDATA"] === void 0) {
          delete env["APPDATA"];
        } else {
          env["APPDATA"] = originalEnvValues["APPDATA"];
        }
      });
      test("current OS", async () => {
        if (isWindows) {
          filePath = join(env["APPDATA"], "Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt");
        } else {
          filePath = join(env["HOME"], ".local/share/powershell/PSReadline/ConsoleHost_history.txt");
        }
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
    });
    suite("remote", () => {
      let originalEnvValues;
      setup(() => {
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        originalEnvValues = { HOME: env["HOME"], APPDATA: env["APPDATA"] };
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
        if (originalEnvValues["APPDATA"] === void 0) {
          delete env["APPDATA"];
        } else {
          env["APPDATA"] = originalEnvValues["APPDATA"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        env["APPDATA"] = "C:\\AppData";
        filePath = "C:\\AppData\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt";
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        env["HOME"] = "/home/user";
        filePath = "/home/user/.local/share/powershell/PSReadline/ConsoleHost_history.txt";
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        env["HOME"] = "/home/user";
        filePath = "/home/user/.local/share/powershell/PSReadline/ConsoleHost_history.txt";
        deepStrictEqual((await instantiationService.invokeFunction(fetchPwshHistory)).commands, expectedCommands);
      });
    });
  });
  suite("fetchFishHistory", () => {
    let fileScheme;
    let filePath;
    const fileContent = [
      "- cmd: single line command",
      "  when: 1650000000",
      '- cmd: git commit -m "A wrapped line in pwsh history\\n\\nSome commit description\\n\\nFixes #xyz"',
      "  when: 1650000010",
      "- cmd: git status",
      "  when: 1650000020",
      '- cmd: two "\\nline"',
      "  when: 1650000030"
    ].join("\n");
    let instantiationService;
    let remoteConnection = null;
    let remoteEnvironment = null;
    setup(() => {
      instantiationService = new TestInstantiationService();
      instantiationService.stub(IFileService, {
        async readFile(resource) {
          const expected = URI.from({ scheme: fileScheme, path: filePath });
          strictEqual(resource.scheme, expected.scheme);
          strictEqual(resource.path, expected.path);
          return { value: VSBuffer.fromString(fileContent) };
        }
      });
      instantiationService.stub(IRemoteAgentService, {
        async getEnvironment() {
          return remoteEnvironment;
        },
        getConnection() {
          return remoteConnection;
        }
      });
    });
    teardown(() => {
      instantiationService.dispose();
    });
    if (!isWindows) {
      suite("local", () => {
        let originalEnvValues;
        setup(() => {
          originalEnvValues = { HOME: env["HOME"], XDG_DATA_HOME: env["XDG_DATA_HOME"] };
          env["HOME"] = "/home/user";
          delete env["XDG_DATA_HOME"];
          remoteConnection = { remoteAuthority: "some-remote" };
          fileScheme = Schemas.vscodeRemote;
          filePath = "/home/user/.local/share/fish/fish_history";
        });
        teardown(() => {
          if (originalEnvValues["HOME"] === void 0) {
            delete env["HOME"];
          } else {
            env["HOME"] = originalEnvValues["HOME"];
          }
          if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
            delete env["XDG_DATA_HOME"];
          } else {
            env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
          }
        });
        test("current OS", async () => {
          filePath = "/home/user/.local/share/fish/fish_history";
          deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
        });
      });
      suite("local (overriden path)", () => {
        let originalEnvValues;
        setup(() => {
          originalEnvValues = { XDG_DATA_HOME: env["XDG_DATA_HOME"] };
          env["XDG_DATA_HOME"] = "/home/user/data-home";
          remoteConnection = { remoteAuthority: "some-remote" };
          fileScheme = Schemas.vscodeRemote;
          filePath = "/home/user/data-home/fish/fish_history";
        });
        teardown(() => {
          if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
            delete env["XDG_DATA_HOME"];
          } else {
            env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
          }
        });
        test("current OS", async () => {
          filePath = "/home/user/data-home/fish/fish_history";
          deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
        });
      });
    }
    suite("remote", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { HOME: env["HOME"], XDG_DATA_HOME: env["XDG_DATA_HOME"] };
        env["HOME"] = "/home/user";
        delete env["XDG_DATA_HOME"];
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/.local/share/fish/fish_history";
      });
      teardown(() => {
        if (originalEnvValues["HOME"] === void 0) {
          delete env["HOME"];
        } else {
          env["HOME"] = originalEnvValues["HOME"];
        }
        if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
          delete env["XDG_DATA_HOME"];
        } else {
          env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        strictEqual(await instantiationService.invokeFunction(fetchFishHistory), void 0);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
    });
    suite("remote (overriden path)", () => {
      let originalEnvValues;
      setup(() => {
        originalEnvValues = { XDG_DATA_HOME: env["XDG_DATA_HOME"] };
        env["XDG_DATA_HOME"] = "/home/user/data-home";
        remoteConnection = { remoteAuthority: "some-remote" };
        fileScheme = Schemas.vscodeRemote;
        filePath = "/home/user/data-home/fish/fish_history";
      });
      teardown(() => {
        if (originalEnvValues["XDG_DATA_HOME"] === void 0) {
          delete env["XDG_DATA_HOME"];
        } else {
          env["XDG_DATA_HOME"] = originalEnvValues["XDG_DATA_HOME"];
        }
      });
      test("Windows", async () => {
        remoteEnvironment = { os: OperatingSystem.Windows };
        strictEqual(await instantiationService.invokeFunction(fetchFishHistory), void 0);
      });
      test("macOS", async () => {
        remoteEnvironment = { os: OperatingSystem.Macintosh };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
      test("Linux", async () => {
        remoteEnvironment = { os: OperatingSystem.Linux };
        deepStrictEqual((await instantiationService.invokeFunction(fetchFishHistory)).commands, expectedCommands);
      });
    });
    suite("sanitizeFishHistoryCmd", () => {
      test("valid new-lines", () => {
        const cases = [
          "\\n",
          "\\n at start",
          "some \\n in the middle",
          "at the end \\n",
          "\\\\\\n",
          "\\\\\\n valid at start",
          "valid \\\\\\n in the middle",
          "valid in the end \\\\\\n",
          "\\\\\\\\\\n",
          "\\\\\\\\\\n valid at start",
          "valid \\\\\\\\\\n in the middle",
          "valid in the end \\\\\\\\\\n",
          "mixed valid \\r\\n",
          "mixed valid \\\\\\r\\n",
          "mixed valid \\r\\\\\\n"
        ];
        for (const x of cases) {
          ok(sanitizeFishHistoryCmd(x).includes("\n"));
        }
      });
      test("invalid new-lines", () => {
        const cases = [
          "\\\\n",
          "\\\\n invalid at start",
          "invalid \\\\n in the middle",
          "invalid in the end \\\\n",
          "\\\\\\\\n",
          "\\\\\\\\n invalid at start",
          "invalid \\\\\\\\n in the middle",
          "invalid in the end \\\\\\\\n",
          "mixed invalid \\r\\\\n",
          "mixed invalid \\r\\\\\\\\n",
          'echo "\\\\n"'
        ];
        for (const x of cases) {
          ok(!sanitizeFishHistoryCmd(x).includes("\n"));
        }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcaGlzdG9yeVxcdGVzdFxcY29tbW9uXFxoaXN0b3J5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsLCBvayB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVudiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50RW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRDb25uZWN0aW9uLCBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IGZldGNoQmFzaEhpc3RvcnksIGZldGNoRmlzaEhpc3RvcnksIGZldGNoUHdzaEhpc3RvcnksIGZldGNoWnNoSGlzdG9yeSwgc2FuaXRpemVGaXNoSGlzdG9yeUNtZCwgVGVybWluYWxQZXJzaXN0ZWRIaXN0b3J5LCB0eXBlIElUZXJtaW5hbFBlcnNpc3RlZEhpc3RvcnkgfSBmcm9tICcuLi8uLi9jb21tb24vaGlzdG9yeS5qcyc7XG5cbmZ1bmN0aW9uIGdldENvbmZpZyhsaW1pdDogbnVtYmVyKSB7XG5cdHJldHVybiB7XG5cdFx0dGVybWluYWw6IHtcblx0XHRcdGludGVncmF0ZWQ6IHtcblx0XHRcdFx0c2hlbGxJbnRlZ3JhdGlvbjoge1xuXHRcdFx0XHRcdGhpc3Rvcnk6IGxpbWl0XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH07XG59XG5cbmNvbnN0IGV4cGVjdGVkQ29tbWFuZHMgPSBbXG5cdCdzaW5nbGUgbGluZSBjb21tYW5kJyxcblx0J2dpdCBjb21taXQgLW0gXCJBIHdyYXBwZWQgbGluZSBpbiBwd3NoIGhpc3RvcnlcXG5cXG5Tb21lIGNvbW1pdCBkZXNjcmlwdGlvblxcblxcbkZpeGVzICN4eXpcIicsXG5cdCdnaXQgc3RhdHVzJyxcblx0J3R3byBcIlxcbmxpbmVcIidcbl07XG5cbnN1aXRlKCdUZXJtaW5hbCBoaXN0b3J5JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdUZXJtaW5hbFBlcnNpc3RlZEhpc3RvcnknLCAoKSA9PiB7XG5cdFx0bGV0IGhpc3Rvcnk6IElUZXJtaW5hbFBlcnNpc3RlZEhpc3Rvcnk8bnVtYmVyPjtcblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZShnZXRDb25maWcoNSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKTtcblxuXHRcdFx0aGlzdG9yeSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbFBlcnNpc3RlZEhpc3Rvcnk8bnVtYmVyPiwgJ3Rlc3QnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VwcG9ydCBhZGRpbmcgaXRlbXMgdG8gdGhlIGNhY2hlIGFuZCByZXNwZWN0IExSVScsICgpID0+IHtcblx0XHRcdGhpc3RvcnkuYWRkKCdmb28nLCAxKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcyksIFtcblx0XHRcdFx0Wydmb28nLCAxXVxuXHRcdFx0XSk7XG5cdFx0XHRoaXN0b3J5LmFkZCgnYmFyJywgMik7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShoaXN0b3J5LmVudHJpZXMpLCBbXG5cdFx0XHRcdFsnZm9vJywgMV0sXG5cdFx0XHRcdFsnYmFyJywgMl1cblx0XHRcdF0pO1xuXHRcdFx0aGlzdG9yeS5hZGQoJ2ZvbycsIDEpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKSwgW1xuXHRcdFx0XHRbJ2JhcicsIDJdLFxuXHRcdFx0XHRbJ2ZvbycsIDFdXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IHJlbW92aW5nIHNwZWNpZmljIGl0ZW1zJywgKCkgPT4ge1xuXHRcdFx0aGlzdG9yeS5hZGQoJzEnLCAxKTtcblx0XHRcdGhpc3RvcnkuYWRkKCcyJywgMik7XG5cdFx0XHRoaXN0b3J5LmFkZCgnMycsIDMpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzQnLCA0KTtcblx0XHRcdGhpc3RvcnkuYWRkKCc1JywgNSk7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCA1KTtcblx0XHRcdGhpc3RvcnkuYWRkKCc2JywgNik7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCA1KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBsaW1pdCB0aGUgbnVtYmVyIG9mIGVudHJpZXMgYmFzZWQgb24gY29uZmlnJywgKCkgPT4ge1xuXHRcdFx0aGlzdG9yeS5hZGQoJzEnLCAxKTtcblx0XHRcdGhpc3RvcnkuYWRkKCcyJywgMik7XG5cdFx0XHRoaXN0b3J5LmFkZCgnMycsIDMpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzQnLCA0KTtcblx0XHRcdGhpc3RvcnkuYWRkKCc1JywgNSk7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCA1KTtcblx0XHRcdGhpc3RvcnkuYWRkKCc2JywgNik7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCA1KTtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd0ZXJtaW5hbCcsIGdldENvbmZpZygyKS50ZXJtaW5hbCk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7IGFmZmVjdHNDb25maWd1cmF0aW9uOiAoKSA9PiB0cnVlIH0gYXMgYW55KTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKS5sZW5ndGgsIDIpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzcnLCA3KTtcblx0XHRcdHN0cmljdEVxdWFsKEFycmF5LmZyb20oaGlzdG9yeS5lbnRyaWVzKS5sZW5ndGgsIDIpO1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsJywgZ2V0Q29uZmlnKDMpLnRlcm1pbmFsKTtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHsgYWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUgfSBhcyBhbnkpO1xuXHRcdFx0c3RyaWN0RXF1YWwoQXJyYXkuZnJvbShoaXN0b3J5LmVudHJpZXMpLmxlbmd0aCwgMik7XG5cdFx0XHRoaXN0b3J5LmFkZCgnOCcsIDgpO1xuXHRcdFx0c3RyaWN0RXF1YWwoQXJyYXkuZnJvbShoaXN0b3J5LmVudHJpZXMpLmxlbmd0aCwgMyk7XG5cdFx0XHRoaXN0b3J5LmFkZCgnOScsIDkpO1xuXHRcdFx0c3RyaWN0RXF1YWwoQXJyYXkuZnJvbShoaXN0b3J5LmVudHJpZXMpLmxlbmd0aCwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVsb2FkIGZyb20gc3RvcmFnZSBzZXJ2aWNlIGFmdGVyIHJlY3JlYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRoaXN0b3J5LmFkZCgnMScsIDEpO1xuXHRcdFx0aGlzdG9yeS5hZGQoJzInLCAyKTtcblx0XHRcdGhpc3RvcnkuYWRkKCczJywgMyk7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkuZW50cmllcykubGVuZ3RoLCAzKTtcblx0XHRcdGNvbnN0IGhpc3RvcnkyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsUGVyc2lzdGVkSGlzdG9yeSwgJ3Rlc3QnKSk7XG5cdFx0XHRzdHJpY3RFcXVhbChBcnJheS5mcm9tKGhpc3RvcnkyLmVudHJpZXMpLmxlbmd0aCwgMyk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnZmV0Y2hCYXNoSGlzdG9yeScsICgpID0+IHtcblx0XHRsZXQgZmlsZVNjaGVtZTogc3RyaW5nO1xuXHRcdGxldCBmaWxlUGF0aDogc3RyaW5nO1xuXHRcdGNvbnN0IGZpbGVDb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQnc2luZ2xlIGxpbmUgY29tbWFuZCcsXG5cdFx0XHQnZ2l0IGNvbW1pdCAtbSBcIkEgd3JhcHBlZCBsaW5lIGluIHB3c2ggaGlzdG9yeScsXG5cdFx0XHQnJyxcblx0XHRcdCdTb21lIGNvbW1pdCBkZXNjcmlwdGlvbicsXG5cdFx0XHQnJyxcblx0XHRcdCdGaXhlcyAjeHl6XCInLFxuXHRcdFx0J2dpdCBzdGF0dXMnLFxuXHRcdFx0J3R3byBcIicsXG5cdFx0XHQnbGluZVwiJ1xuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgcmVtb3RlQ29ubmVjdGlvbjogUGljazxJUmVtb3RlQWdlbnRDb25uZWN0aW9uLCAncmVtb3RlQXV0aG9yaXR5Jz4gfCBudWxsID0gbnVsbDtcblx0XHRsZXQgcmVtb3RlRW52aXJvbm1lbnQ6IFBpY2s8SVJlbW90ZUFnZW50RW52aXJvbm1lbnQsICdvcyc+IHwgbnVsbCA9IG51bGw7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7XG5cdFx0XHRcdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBmaWxlU2NoZW1lLCBwYXRoOiBmaWxlUGF0aCB9KTtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChyZXNvdXJjZS5zY2hlbWUsIGV4cGVjdGVkLnNjaGVtZSk7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzb3VyY2UucGF0aCwgZXhwZWN0ZWQucGF0aCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IFZTQnVmZmVyLmZyb21TdHJpbmcoZmlsZUNvbnRlbnQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH0gYXMgUGljazxJRmlsZVNlcnZpY2UsICdyZWFkRmlsZSc+KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50U2VydmljZSwge1xuXHRcdFx0XHRhc3luYyBnZXRFbnZpcm9ubWVudCgpIHsgcmV0dXJuIHJlbW90ZUVudmlyb25tZW50OyB9LFxuXHRcdFx0XHRnZXRDb25uZWN0aW9uKCkgeyByZXR1cm4gcmVtb3RlQ29ubmVjdGlvbjsgfVxuXHRcdFx0fSBhcyBQaWNrPElSZW1vdGVBZ2VudFNlcnZpY2UsICdnZXRDb25uZWN0aW9uJyB8ICdnZXRFbnZpcm9ubWVudCc+KTtcblx0XHR9KTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRzdWl0ZSgnbG9jYWwnLCAoKSA9PiB7XG5cdFx0XHRcdGxldCBvcmlnaW5hbEVudlZhbHVlczogeyBIT01FOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBIT01FOiBlbnZbJ0hPTUUnXSB9O1xuXHRcdFx0XHRcdGVudlsnSE9NRSddID0gJy9ob21lL3VzZXInO1xuXHRcdFx0XHRcdHJlbW90ZUNvbm5lY3Rpb24gPSB7IHJlbW90ZUF1dGhvcml0eTogJ3NvbWUtcmVtb3RlJyB9O1xuXHRcdFx0XHRcdGZpbGVTY2hlbWUgPSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy5iYXNoX2hpc3RvcnknO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0hPTUUnXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW52WydIT01FJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ2N1cnJlbnQgT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci8uYmFzaF9oaXN0b3J5Jztcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoQmFzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRzdWl0ZSgncmVtb3RlJywgKCkgPT4ge1xuXHRcdFx0bGV0IG9yaWdpbmFsRW52VmFsdWVzOiB7IEhPTUU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbEVudlZhbHVlcyA9IHsgSE9NRTogZW52WydIT01FJ10gfTtcblx0XHRcdFx0ZW52WydIT01FJ10gPSAnL2hvbWUvdXNlcic7XG5cdFx0XHRcdHJlbW90ZUNvbm5lY3Rpb24gPSB7IHJlbW90ZUF1dGhvcml0eTogJ3NvbWUtcmVtb3RlJyB9O1xuXHRcdFx0XHRmaWxlU2NoZW1lID0gU2NoZW1hcy52c2NvZGVSZW1vdGU7XG5cdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLmJhc2hfaGlzdG9yeSc7XG5cdFx0XHR9KTtcblx0XHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0hPTUUnXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbnZbJ0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ107XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB9O1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEJhc2hIaXN0b3J5KSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbWFjT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlbW90ZUVudmlyb25tZW50ID0geyBvczogT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCB9O1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoQmFzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXggfTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEJhc2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblx0c3VpdGUoJ2ZldGNoWnNoSGlzdG9yeScsICgpID0+IHtcblx0XHRsZXQgZmlsZVNjaGVtZTogc3RyaW5nO1xuXHRcdGxldCBmaWxlUGF0aDogc3RyaW5nO1xuXHRcdGNvbnN0IGZpbGVDb250ZW50VHlwZSA9IFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3NpbXBsZScsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHQnc2luZ2xlIGxpbmUgY29tbWFuZCcsXG5cdFx0XHRcdFx0J2dpdCBjb21taXQgLW0gXCJBIHdyYXBwZWQgbGluZSBpbiBwd3NoIGhpc3RvcnlcXFxcJyxcblx0XHRcdFx0XHQnXFxcXCcsXG5cdFx0XHRcdFx0J1NvbWUgY29tbWl0IGRlc2NyaXB0aW9uXFxcXCcsXG5cdFx0XHRcdFx0J1xcXFwnLFxuXHRcdFx0XHRcdCdGaXhlcyAjeHl6XCInLFxuXHRcdFx0XHRcdCdnaXQgc3RhdHVzJyxcblx0XHRcdFx0XHQndHdvIFwiXFxcXCcsXG5cdFx0XHRcdFx0J2xpbmVcIidcblx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2V4dGVuZGVkJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdCc6IDE2NTUyNTIzMzA6MDtzaW5nbGUgbGluZSBjb21tYW5kJyxcblx0XHRcdFx0XHQnOiAxNjU1MjUyMzMwOjA7Z2l0IGNvbW1pdCAtbSBcIkEgd3JhcHBlZCBsaW5lIGluIHB3c2ggaGlzdG9yeVxcXFwnLFxuXHRcdFx0XHRcdCdcXFxcJyxcblx0XHRcdFx0XHQnU29tZSBjb21taXQgZGVzY3JpcHRpb25cXFxcJyxcblx0XHRcdFx0XHQnXFxcXCcsXG5cdFx0XHRcdFx0J0ZpeGVzICN4eXpcIicsXG5cdFx0XHRcdFx0JzogMTY1NTI1MjMzMDowO2dpdCBzdGF0dXMnLFxuXHRcdFx0XHRcdCc6IDE2NTUyNTIzMzA6MDt0d28gXCJcXFxcJyxcblx0XHRcdFx0XHQnbGluZVwiJ1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgcmVtb3RlQ29ubmVjdGlvbjogUGljazxJUmVtb3RlQWdlbnRDb25uZWN0aW9uLCAncmVtb3RlQXV0aG9yaXR5Jz4gfCBudWxsID0gbnVsbDtcblx0XHRsZXQgcmVtb3RlRW52aXJvbm1lbnQ6IFBpY2s8SVJlbW90ZUFnZW50RW52aXJvbm1lbnQsICdvcyc+IHwgbnVsbCA9IG51bGw7XG5cblx0XHRmb3IgKGNvbnN0IHsgdHlwZSwgY29udGVudCB9IG9mIGZpbGVDb250ZW50VHlwZSkge1xuXHRcdFx0c3VpdGUodHlwZSwgKCkgPT4ge1xuXHRcdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBVUkkuZnJvbSh7IHNjaGVtZTogZmlsZVNjaGVtZSwgcGF0aDogZmlsZVBhdGggfSk7XG5cdFx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKHJlc291cmNlLnNjaGVtZSwgZXhwZWN0ZWQuc2NoZW1lKTtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzb3VyY2UucGF0aCwgZXhwZWN0ZWQucGF0aCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBhcyBQaWNrPElGaWxlU2VydmljZSwgJ3JlYWRGaWxlJz4pO1xuXHRcdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50U2VydmljZSwge1xuXHRcdFx0XHRcdFx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKSB7IHJldHVybiByZW1vdGVFbnZpcm9ubWVudDsgfSxcblx0XHRcdFx0XHRcdGdldENvbm5lY3Rpb24oKSB7IHJldHVybiByZW1vdGVDb25uZWN0aW9uOyB9XG5cdFx0XHRcdFx0fSBhcyBQaWNrPElSZW1vdGVBZ2VudFNlcnZpY2UsICdnZXRDb25uZWN0aW9uJyB8ICdnZXRFbnZpcm9ubWVudCc+KTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdFx0XHRzdWl0ZSgnbG9jYWwnLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBIT01FOiBlbnZbJ0hPTUUnXSB9O1xuXHRcdFx0XHRcdFx0XHRlbnZbJ0hPTUUnXSA9ICcvaG9tZS91c2VyJztcblx0XHRcdFx0XHRcdFx0cmVtb3RlQ29ubmVjdGlvbiA9IHsgcmVtb3RlQXV0aG9yaXR5OiAnc29tZS1yZW1vdGUnIH07XG5cdFx0XHRcdFx0XHRcdGZpbGVTY2hlbWUgPSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdFx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci8uYmFzaF9oaXN0b3J5Jztcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVsZXRlIGVudlsnSE9NRSddO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGVudlsnSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0ZXN0KCdjdXJyZW50IE9TJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy56c2hfaGlzdG9yeSc7XG5cdFx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hac2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN1aXRlKCdyZW1vdGUnLCAoKSA9PiB7XG5cdFx0XHRcdFx0bGV0IG9yaWdpbmFsRW52VmFsdWVzOiB7IEhPTUU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBIT01FOiBlbnZbJ0hPTUUnXSB9O1xuXHRcdFx0XHRcdFx0ZW52WydIT01FJ10gPSAnL2hvbWUvdXNlcic7XG5cdFx0XHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0XHRcdGZpbGVTY2hlbWUgPSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLnpzaF9oaXN0b3J5Jztcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0hPTUUnXTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGVudlsnSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0ZXN0KCdXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB9O1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hac2hIaXN0b3J5KSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0ZXN0KCdtYWNPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHJlbW90ZUVudmlyb25tZW50ID0geyBvczogT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCB9O1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaFpzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRlc3QoJ0xpbnV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXggfTtcblx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hac2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXHRzdWl0ZSgnZmV0Y2hQd3NoSGlzdG9yeScsICgpID0+IHtcblx0XHRsZXQgZmlsZVNjaGVtZTogc3RyaW5nO1xuXHRcdGxldCBmaWxlUGF0aDogc3RyaW5nO1xuXHRcdGNvbnN0IGZpbGVDb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQnc2luZ2xlIGxpbmUgY29tbWFuZCcsXG5cdFx0XHQnZ2l0IGNvbW1pdCAtbSBcIkEgd3JhcHBlZCBsaW5lIGluIHB3c2ggaGlzdG9yeWAnLFxuXHRcdFx0J2AnLFxuXHRcdFx0J1NvbWUgY29tbWl0IGRlc2NyaXB0aW9uYCcsXG5cdFx0XHQnYCcsXG5cdFx0XHQnRml4ZXMgI3h5elwiJyxcblx0XHRcdCdnaXQgc3RhdHVzJyxcblx0XHRcdCd0d28gXCJgJyxcblx0XHRcdCdsaW5lXCInXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRcdGxldCByZW1vdGVDb25uZWN0aW9uOiBQaWNrPElSZW1vdGVBZ2VudENvbm5lY3Rpb24sICdyZW1vdGVBdXRob3JpdHknPiB8IG51bGwgPSBudWxsO1xuXHRcdGxldCByZW1vdGVFbnZpcm9ubWVudDogUGljazxJUmVtb3RlQWdlbnRFbnZpcm9ubWVudCwgJ29zJz4gfCBudWxsID0gbnVsbDtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHtcblx0XHRcdFx0YXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gVVJJLmZyb20oe1xuXHRcdFx0XHRcdFx0c2NoZW1lOiBmaWxlU2NoZW1lLFxuXHRcdFx0XHRcdFx0YXV0aG9yaXR5OiByZW1vdGVDb25uZWN0aW9uPy5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdFx0XHRwYXRoOiBVUkkuZmlsZShmaWxlUGF0aCkucGF0aFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdC8vIFNhbml0aXplIHRoZSBlbmNvZGVkIGAvYCBjaGFycyBhcyB0aGV5IGRvbid0IGltcGFjdCBiZWhhdmlvclxuXHRcdFx0XHRcdHN0cmljdEVxdWFsKHJlc291cmNlLnRvU3RyaW5nKCkucmVwbGFjZUFsbCgnJTVDJywgJy8nKSwgZXhwZWN0ZWQudG9TdHJpbmcoKS5yZXBsYWNlQWxsKCclNUMnLCAnLycpKTtcblx0XHRcdFx0XHRyZXR1cm4geyB2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyhmaWxlQ29udGVudCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0fSBhcyBQaWNrPElGaWxlU2VydmljZSwgJ3JlYWRGaWxlJz4pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVtb3RlQWdlbnRTZXJ2aWNlLCB7XG5cdFx0XHRcdGFzeW5jIGdldEVudmlyb25tZW50KCkgeyByZXR1cm4gcmVtb3RlRW52aXJvbm1lbnQ7IH0sXG5cdFx0XHRcdGdldENvbm5lY3Rpb24oKSB7IHJldHVybiByZW1vdGVDb25uZWN0aW9uOyB9XG5cdFx0XHR9IGFzIFBpY2s8SVJlbW90ZUFnZW50U2VydmljZSwgJ2dldENvbm5lY3Rpb24nIHwgJ2dldEVudmlyb25tZW50Jz4pO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2xvY2FsJywgKCkgPT4ge1xuXHRcdFx0bGV0IG9yaWdpbmFsRW52VmFsdWVzOiB7IEhPTUU6IHN0cmluZyB8IHVuZGVmaW5lZDsgQVBQREFUQTogc3RyaW5nIHwgdW5kZWZpbmVkIH07XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBIT01FOiBlbnZbJ0hPTUUnXSwgQVBQREFUQTogZW52WydBUFBEQVRBJ10gfTtcblx0XHRcdFx0ZW52WydIT01FJ10gPSAnL2hvbWUvdXNlcic7XG5cdFx0XHRcdGVudlsnQVBQREFUQSddID0gJ0M6XFxcXEFwcERhdGEnO1xuXHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy56c2hfaGlzdG9yeSc7XG5cdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBIT01FOiBlbnZbJ0hPTUUnXSwgQVBQREFUQTogZW52WydBUFBEQVRBJ10gfTtcblx0XHRcdH0pO1xuXHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGVudlsnSE9NRSddO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudlsnSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ0FQUERBVEEnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZGVsZXRlIGVudlsnQVBQREFUQSddO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVudlsnQVBQREFUQSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ0FQUERBVEEnXTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdjdXJyZW50IE9TJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdFx0ZmlsZVBhdGggPSBqb2luKGVudlsnQVBQREFUQSddISwgJ01pY3Jvc29mdFxcXFxXaW5kb3dzXFxcXFBvd2VyU2hlbGxcXFxcUFNSZWFkTGluZVxcXFxDb25zb2xlSG9zdF9oaXN0b3J5LnR4dCcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZpbGVQYXRoID0gam9pbihlbnZbJ0hPTUUnXSEsICcubG9jYWwvc2hhcmUvcG93ZXJzaGVsbC9QU1JlYWRsaW5lL0NvbnNvbGVIb3N0X2hpc3RvcnkudHh0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaFB3c2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdyZW1vdGUnLCAoKSA9PiB7XG5cdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkOyBBUFBEQVRBOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0cmVtb3RlQ29ubmVjdGlvbiA9IHsgcmVtb3RlQXV0aG9yaXR5OiAnc29tZS1yZW1vdGUnIH07XG5cdFx0XHRcdGZpbGVTY2hlbWUgPSBTY2hlbWFzLnZzY29kZVJlbW90ZTtcblx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddLCBBUFBEQVRBOiBlbnZbJ0FQUERBVEEnXSB9O1xuXHRcdFx0fSk7XG5cdFx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRkZWxldGUgZW52WydIT01FJ107XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW52WydIT01FJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snSE9NRSddO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snQVBQREFUQSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRkZWxldGUgZW52WydBUFBEQVRBJ107XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW52WydBUFBEQVRBJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snQVBQREFUQSddO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ1dpbmRvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlbW90ZUVudmlyb25tZW50ID0geyBvczogT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgfTtcblx0XHRcdFx0ZW52WydBUFBEQVRBJ10gPSAnQzpcXFxcQXBwRGF0YSc7XG5cdFx0XHRcdGZpbGVQYXRoID0gJ0M6XFxcXEFwcERhdGFcXFxcTWljcm9zb2Z0XFxcXFdpbmRvd3NcXFxcUG93ZXJTaGVsbFxcXFxQU1JlYWRMaW5lXFxcXENvbnNvbGVIb3N0X2hpc3RvcnkudHh0Jztcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaFB3c2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbWFjT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlbW90ZUVudmlyb25tZW50ID0geyBvczogT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCB9O1xuXHRcdFx0XHRlbnZbJ0hPTUUnXSA9ICcvaG9tZS91c2VyJztcblx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci8ubG9jYWwvc2hhcmUvcG93ZXJzaGVsbC9QU1JlYWRsaW5lL0NvbnNvbGVIb3N0X2hpc3RvcnkudHh0Jztcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaFB3c2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnTGludXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlbW90ZUVudmlyb25tZW50ID0geyBvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4IH07XG5cdFx0XHRcdGVudlsnSE9NRSddID0gJy9ob21lL3VzZXInO1xuXHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy5sb2NhbC9zaGFyZS9wb3dlcnNoZWxsL1BTUmVhZGxpbmUvQ29uc29sZUhvc3RfaGlzdG9yeS50eHQnO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoUHdzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXHRzdWl0ZSgnZmV0Y2hGaXNoSGlzdG9yeScsICgpID0+IHtcblx0XHRsZXQgZmlsZVNjaGVtZTogc3RyaW5nO1xuXHRcdGxldCBmaWxlUGF0aDogc3RyaW5nO1xuXHRcdGNvbnN0IGZpbGVDb250ZW50OiBzdHJpbmcgPSBbXG5cdFx0XHQnLSBjbWQ6IHNpbmdsZSBsaW5lIGNvbW1hbmQnLFxuXHRcdFx0JyAgd2hlbjogMTY1MDAwMDAwMCcsXG5cdFx0XHQnLSBjbWQ6IGdpdCBjb21taXQgLW0gXCJBIHdyYXBwZWQgbGluZSBpbiBwd3NoIGhpc3RvcnlcXFxcblxcXFxuU29tZSBjb21taXQgZGVzY3JpcHRpb25cXFxcblxcXFxuRml4ZXMgI3h5elwiJyxcblx0XHRcdCcgIHdoZW46IDE2NTAwMDAwMTAnLFxuXHRcdFx0Jy0gY21kOiBnaXQgc3RhdHVzJyxcblx0XHRcdCcgIHdoZW46IDE2NTAwMDAwMjAnLFxuXHRcdFx0Jy0gY21kOiB0d28gXCJcXFxcbmxpbmVcIicsXG5cdFx0XHQnICB3aGVuOiAxNjUwMDAwMDMwJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IHJlbW90ZUNvbm5lY3Rpb246IFBpY2s8SVJlbW90ZUFnZW50Q29ubmVjdGlvbiwgJ3JlbW90ZUF1dGhvcml0eSc+IHwgbnVsbCA9IG51bGw7XG5cdFx0bGV0IHJlbW90ZUVudmlyb25tZW50OiBQaWNrPElSZW1vdGVBZ2VudEVudmlyb25tZW50LCAnb3MnPiB8IG51bGwgPSBudWxsO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0XHRhc3luYyByZWFkRmlsZShyZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBVUkkuZnJvbSh7IHNjaGVtZTogZmlsZVNjaGVtZSwgcGF0aDogZmlsZVBhdGggfSk7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzb3VyY2Uuc2NoZW1lLCBleHBlY3RlZC5zY2hlbWUpO1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKHJlc291cmNlLnBhdGgsIGV4cGVjdGVkLnBhdGgpO1xuXHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiBWU0J1ZmZlci5mcm9tU3RyaW5nKGZpbGVDb250ZW50KSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGFzIFBpY2s8SUZpbGVTZXJ2aWNlLCAncmVhZEZpbGUnPik7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZW1vdGVBZ2VudFNlcnZpY2UsIHtcblx0XHRcdFx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKSB7IHJldHVybiByZW1vdGVFbnZpcm9ubWVudDsgfSxcblx0XHRcdFx0Z2V0Q29ubmVjdGlvbigpIHsgcmV0dXJuIHJlbW90ZUNvbm5lY3Rpb247IH1cblx0XHRcdH0gYXMgUGljazxJUmVtb3RlQWdlbnRTZXJ2aWNlLCAnZ2V0Q29ubmVjdGlvbicgfCAnZ2V0RW52aXJvbm1lbnQnPik7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0c3VpdGUoJ2xvY2FsJywgKCkgPT4ge1xuXHRcdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkOyBYREdfREFUQV9IT01FOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBIT01FOiBlbnZbJ0hPTUUnXSwgWERHX0RBVEFfSE9NRTogZW52WydYREdfREFUQV9IT01FJ10gfTtcblx0XHRcdFx0XHRlbnZbJ0hPTUUnXSA9ICcvaG9tZS91c2VyJztcblx0XHRcdFx0XHRkZWxldGUgZW52WydYREdfREFUQV9IT01FJ107XG5cdFx0XHRcdFx0cmVtb3RlQ29ubmVjdGlvbiA9IHsgcmVtb3RlQXV0aG9yaXR5OiAnc29tZS1yZW1vdGUnIH07XG5cdFx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRcdGZpbGVQYXRoID0gJy9ob21lL3VzZXIvLmxvY2FsL3NoYXJlL2Zpc2gvZmlzaF9oaXN0b3J5Jztcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgZW52WydIT01FJ107XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGVudlsnSE9NRSddID0gb3JpZ2luYWxFbnZWYWx1ZXNbJ0hPTUUnXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIGVudlsnWERHX0RBVEFfSE9NRSddO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRlbnZbJ1hER19EQVRBX0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ107XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnY3VycmVudCBPUycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy5sb2NhbC9zaGFyZS9maXNoL2Zpc2hfaGlzdG9yeSc7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEZpc2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c3VpdGUoJ2xvY2FsIChvdmVycmlkZW4gcGF0aCknLCAoKSA9PiB7XG5cdFx0XHRcdGxldCBvcmlnaW5hbEVudlZhbHVlczogeyBYREdfREFUQV9IT01FOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRcdG9yaWdpbmFsRW52VmFsdWVzID0geyBYREdfREFUQV9IT01FOiBlbnZbJ1hER19EQVRBX0hPTUUnXSB9O1xuXHRcdFx0XHRcdGVudlsnWERHX0RBVEFfSE9NRSddID0gJy9ob21lL3VzZXIvZGF0YS1ob21lJztcblx0XHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0XHRmaWxlU2NoZW1lID0gU2NoZW1hcy52c2NvZGVSZW1vdGU7XG5cdFx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci9kYXRhLWhvbWUvZmlzaC9maXNoX2hpc3RvcnknO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEVudlZhbHVlc1snWERHX0RBVEFfSE9NRSddID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ1hER19EQVRBX0hPTUUnXTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZW52WydYREdfREFUQV9IT01FJ10gPSBvcmlnaW5hbEVudlZhbHVlc1snWERHX0RBVEFfSE9NRSddO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ2N1cnJlbnQgT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0ZmlsZVBhdGggPSAnL2hvbWUvdXNlci9kYXRhLWhvbWUvZmlzaC9maXNoX2hpc3RvcnknO1xuXHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZmV0Y2hGaXNoSGlzdG9yeSkpIS5jb21tYW5kcywgZXhwZWN0ZWRDb21tYW5kcyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHN1aXRlKCdyZW1vdGUnLCAoKSA9PiB7XG5cdFx0XHRsZXQgb3JpZ2luYWxFbnZWYWx1ZXM6IHsgSE9NRTogc3RyaW5nIHwgdW5kZWZpbmVkOyBYREdfREFUQV9IT01FOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0b3JpZ2luYWxFbnZWYWx1ZXMgPSB7IEhPTUU6IGVudlsnSE9NRSddLCBYREdfREFUQV9IT01FOiBlbnZbJ1hER19EQVRBX0hPTUUnXSB9O1xuXHRcdFx0XHRlbnZbJ0hPTUUnXSA9ICcvaG9tZS91c2VyJztcblx0XHRcdFx0ZGVsZXRlIGVudlsnWERHX0RBVEFfSE9NRSddO1xuXHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyLy5sb2NhbC9zaGFyZS9maXNoL2Zpc2hfaGlzdG9yeSc7XG5cdFx0XHR9KTtcblx0XHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ0hPTUUnXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbnZbJ0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydIT01FJ107XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ1hER19EQVRBX0hPTUUnXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbnZbJ1hER19EQVRBX0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ107XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB9O1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEZpc2hIaXN0b3J5KSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbWFjT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlbW90ZUVudmlyb25tZW50ID0geyBvczogT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCB9O1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoRmlzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXggfTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEZpc2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3JlbW90ZSAob3ZlcnJpZGVuIHBhdGgpJywgKCkgPT4ge1xuXHRcdFx0bGV0IG9yaWdpbmFsRW52VmFsdWVzOiB7IFhER19EQVRBX0hPTUU6IHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRvcmlnaW5hbEVudlZhbHVlcyA9IHsgWERHX0RBVEFfSE9NRTogZW52WydYREdfREFUQV9IT01FJ10gfTtcblx0XHRcdFx0ZW52WydYREdfREFUQV9IT01FJ10gPSAnL2hvbWUvdXNlci9kYXRhLWhvbWUnO1xuXHRcdFx0XHRyZW1vdGVDb25uZWN0aW9uID0geyByZW1vdGVBdXRob3JpdHk6ICdzb21lLXJlbW90ZScgfTtcblx0XHRcdFx0ZmlsZVNjaGVtZSA9IFNjaGVtYXMudnNjb2RlUmVtb3RlO1xuXHRcdFx0XHRmaWxlUGF0aCA9ICcvaG9tZS91c2VyL2RhdGEtaG9tZS9maXNoL2Zpc2hfaGlzdG9yeSc7XG5cdFx0XHR9KTtcblx0XHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdFx0aWYgKG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ10gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBlbnZbJ1hER19EQVRBX0hPTUUnXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbnZbJ1hER19EQVRBX0hPTUUnXSA9IG9yaWdpbmFsRW52VmFsdWVzWydYREdfREFUQV9IT01FJ107XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB9O1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEZpc2hIaXN0b3J5KSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbWFjT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlbW90ZUVudmlyb25tZW50ID0geyBvczogT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCB9O1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGZldGNoRmlzaEhpc3RvcnkpKSEuY29tbWFuZHMsIGV4cGVjdGVkQ29tbWFuZHMpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdMaW51eCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0cmVtb3RlRW52aXJvbm1lbnQgPSB7IG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXggfTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKChhd2FpdCBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmZXRjaEZpc2hIaXN0b3J5KSkhLmNvbW1hbmRzLCBleHBlY3RlZENvbW1hbmRzKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3Nhbml0aXplRmlzaEhpc3RvcnlDbWQnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCd2YWxpZCBuZXctbGluZXMnLCAoKSA9PiB7XG5cdFx0XHRcdC8qKlxuXHRcdFx0XHQgKiBWYWxpZCBuZXctbGluZXMgaGF2ZSBvZGQgbnVtYmVyIG9mIGxlYWRpbmcgYmFja3NsYXNoZXM6IFxcbiwgXFxcXFxcbiwgXFxcXFxcXFxcXG5cblx0XHRcdFx0ICovXG5cdFx0XHRcdGNvbnN0IGNhc2VzID0gW1xuXHRcdFx0XHRcdCdcXFxcbicsXG5cdFx0XHRcdFx0J1xcXFxuIGF0IHN0YXJ0Jyxcblx0XHRcdFx0XHQnc29tZSBcXFxcbiBpbiB0aGUgbWlkZGxlJyxcblx0XHRcdFx0XHQnYXQgdGhlIGVuZCBcXFxcbicsXG5cdFx0XHRcdFx0J1xcXFxcXFxcXFxcXG4nLFxuXHRcdFx0XHRcdCdcXFxcXFxcXFxcXFxuIHZhbGlkIGF0IHN0YXJ0Jyxcblx0XHRcdFx0XHQndmFsaWQgXFxcXFxcXFxcXFxcbiBpbiB0aGUgbWlkZGxlJyxcblx0XHRcdFx0XHQndmFsaWQgaW4gdGhlIGVuZCBcXFxcXFxcXFxcXFxuJyxcblx0XHRcdFx0XHQnXFxcXFxcXFxcXFxcXFxcXFxcXFxuJyxcblx0XHRcdFx0XHQnXFxcXFxcXFxcXFxcXFxcXFxcXFxuIHZhbGlkIGF0IHN0YXJ0Jyxcblx0XHRcdFx0XHQndmFsaWQgXFxcXFxcXFxcXFxcXFxcXFxcXFxuIGluIHRoZSBtaWRkbGUnLFxuXHRcdFx0XHRcdCd2YWxpZCBpbiB0aGUgZW5kIFxcXFxcXFxcXFxcXFxcXFxcXFxcbicsXG5cdFx0XHRcdFx0J21peGVkIHZhbGlkIFxcXFxyXFxcXG4nLFxuXHRcdFx0XHRcdCdtaXhlZCB2YWxpZCBcXFxcXFxcXFxcXFxyXFxcXG4nLFxuXHRcdFx0XHRcdCdtaXhlZCB2YWxpZCBcXFxcclxcXFxcXFxcXFxcXG4nLFxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgeCBvZiBjYXNlcykge1xuXHRcdFx0XHRcdG9rKHNhbml0aXplRmlzaEhpc3RvcnlDbWQoeCkuaW5jbHVkZXMoJ1xcbicpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ludmFsaWQgbmV3LWxpbmVzJywgKCkgPT4ge1xuXHRcdFx0XHQvKipcblx0XHRcdFx0ICogSW52YWxpZCBuZXctbGluZXMgaGF2ZSBldmVuIG51bWJlciBvZiBsZWFkaW5nIGJhY2tzbGFzaGVzOiBcXFxcbiwgXFxcXFxcXFxuLCBcXFxcXFxcXFxcXFxuXG5cdFx0XHRcdCAqL1xuXHRcdFx0XHRjb25zdCBjYXNlcyA9IFtcblx0XHRcdFx0XHQnXFxcXFxcXFxuJyxcblx0XHRcdFx0XHQnXFxcXFxcXFxuIGludmFsaWQgYXQgc3RhcnQnLFxuXHRcdFx0XHRcdCdpbnZhbGlkIFxcXFxcXFxcbiBpbiB0aGUgbWlkZGxlJyxcblx0XHRcdFx0XHQnaW52YWxpZCBpbiB0aGUgZW5kIFxcXFxcXFxcbicsXG5cdFx0XHRcdFx0J1xcXFxcXFxcXFxcXFxcXFxuJyxcblx0XHRcdFx0XHQnXFxcXFxcXFxcXFxcXFxcXG4gaW52YWxpZCBhdCBzdGFydCcsXG5cdFx0XHRcdFx0J2ludmFsaWQgXFxcXFxcXFxcXFxcXFxcXG4gaW4gdGhlIG1pZGRsZScsXG5cdFx0XHRcdFx0J2ludmFsaWQgaW4gdGhlIGVuZCBcXFxcXFxcXFxcXFxcXFxcbicsXG5cdFx0XHRcdFx0J21peGVkIGludmFsaWQgXFxcXHJcXFxcXFxcXG4nLFxuXHRcdFx0XHRcdCdtaXhlZCBpbnZhbGlkIFxcXFxyXFxcXFxcXFxcXFxcXFxcXG4nLFxuXHRcdFx0XHRcdCdlY2hvIFwiXFxcXFxcXFxuXCInLFxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgeCBvZiBjYXNlcykge1xuXHRcdFx0XHRcdG9rKCFzYW5pdGl6ZUZpc2hIaXN0b3J5Q21kKHgpLmluY2x1ZGVzKCdcXG4nKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixhQUFhLFVBQVU7QUFDakQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsV0FBVztBQUNwQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBaUMsMkJBQTJCO0FBQzVELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0JBQWtCLGtCQUFrQixrQkFBa0IsaUJBQWlCLHdCQUF3QixnQ0FBZ0U7QUFFeEssU0FBUyxVQUFVLE9BQWU7QUFDakMsU0FBTztBQUFBLElBQ04sVUFBVTtBQUFBLE1BQ1QsWUFBWTtBQUFBLFFBQ1gsa0JBQWtCO0FBQUEsVUFDakIsU0FBUztBQUFBLFFBQ1Y7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQUVBLE1BQU0sbUJBQW1CO0FBQUEsRUFDeEI7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRDtBQUVBLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxRQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUVKLFVBQU0sTUFBTTtBQUNYLDZCQUF1QixJQUFJLHlCQUF5QixVQUFVLENBQUMsQ0FBQztBQUNoRSw2QkFBdUIsTUFBTSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDL0QsMkJBQXFCLElBQUksdUJBQXVCLG9CQUFvQjtBQUNwRSwyQkFBcUIsSUFBSSxpQkFBaUIsTUFBTSxJQUFJLElBQUksbUJBQW1CLENBQUMsQ0FBQztBQUU3RSxnQkFBVSxNQUFNLElBQUkscUJBQXFCLGVBQWUsMEJBQWtDLE1BQU0sQ0FBQztBQUFBLElBQ2xHLENBQUM7QUFFRCxhQUFTLE1BQU07QUFDZCwyQkFBcUIsUUFBUTtBQUFBLElBQzlCLENBQUM7QUFFRCxTQUFLLDREQUE0RCxNQUFNO0FBQ3RFLGNBQVEsSUFBSSxPQUFPLENBQUM7QUFDcEIsc0JBQWdCLE1BQU0sS0FBSyxRQUFRLE9BQU8sR0FBRztBQUFBLFFBQzVDLENBQUMsT0FBTyxDQUFDO0FBQUEsTUFDVixDQUFDO0FBQ0QsY0FBUSxJQUFJLE9BQU8sQ0FBQztBQUNwQixzQkFBZ0IsTUFBTSxLQUFLLFFBQVEsT0FBTyxHQUFHO0FBQUEsUUFDNUMsQ0FBQyxPQUFPLENBQUM7QUFBQSxRQUNULENBQUMsT0FBTyxDQUFDO0FBQUEsTUFDVixDQUFDO0FBQ0QsY0FBUSxJQUFJLE9BQU8sQ0FBQztBQUNwQixzQkFBZ0IsTUFBTSxLQUFLLFFBQVEsT0FBTyxHQUFHO0FBQUEsUUFDNUMsQ0FBQyxPQUFPLENBQUM7QUFBQSxRQUNULENBQUMsT0FBTyxDQUFDO0FBQUEsTUFDVixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywwQ0FBMEMsTUFBTTtBQUNwRCxjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGNBQVEsSUFBSSxLQUFLLENBQUM7QUFDbEIsY0FBUSxJQUFJLEtBQUssQ0FBQztBQUNsQixjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGNBQVEsSUFBSSxLQUFLLENBQUM7QUFDbEIsa0JBQVksTUFBTSxLQUFLLFFBQVEsT0FBTyxFQUFFLFFBQVEsQ0FBQztBQUNqRCxjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGtCQUFZLE1BQU0sS0FBSyxRQUFRLE9BQU8sRUFBRSxRQUFRLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBRUQsU0FBSyxzREFBc0QsTUFBTTtBQUNoRSxjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGNBQVEsSUFBSSxLQUFLLENBQUM7QUFDbEIsY0FBUSxJQUFJLEtBQUssQ0FBQztBQUNsQixjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGNBQVEsSUFBSSxLQUFLLENBQUM7QUFDbEIsa0JBQVksTUFBTSxLQUFLLFFBQVEsT0FBTyxFQUFFLFFBQVEsQ0FBQztBQUNqRCxjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGtCQUFZLE1BQU0sS0FBSyxRQUFRLE9BQU8sRUFBRSxRQUFRLENBQUM7QUFDakQsMkJBQXFCLHFCQUFxQixZQUFZLFVBQVUsQ0FBQyxFQUFFLFFBQVE7QUFFM0UsMkJBQXFCLGdDQUFnQyxLQUFLLEVBQUUsc0JBQXNCLE1BQU0sS0FBSyxDQUFRO0FBQ3JHLGtCQUFZLE1BQU0sS0FBSyxRQUFRLE9BQU8sRUFBRSxRQUFRLENBQUM7QUFDakQsY0FBUSxJQUFJLEtBQUssQ0FBQztBQUNsQixrQkFBWSxNQUFNLEtBQUssUUFBUSxPQUFPLEVBQUUsUUFBUSxDQUFDO0FBQ2pELDJCQUFxQixxQkFBcUIsWUFBWSxVQUFVLENBQUMsRUFBRSxRQUFRO0FBRTNFLDJCQUFxQixnQ0FBZ0MsS0FBSyxFQUFFLHNCQUFzQixNQUFNLEtBQUssQ0FBUTtBQUNyRyxrQkFBWSxNQUFNLEtBQUssUUFBUSxPQUFPLEVBQUUsUUFBUSxDQUFDO0FBQ2pELGNBQVEsSUFBSSxLQUFLLENBQUM7QUFDbEIsa0JBQVksTUFBTSxLQUFLLFFBQVEsT0FBTyxFQUFFLFFBQVEsQ0FBQztBQUNqRCxjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGtCQUFZLE1BQU0sS0FBSyxRQUFRLE9BQU8sRUFBRSxRQUFRLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBRUQsU0FBSyx1REFBdUQsTUFBTTtBQUNqRSxjQUFRLElBQUksS0FBSyxDQUFDO0FBQ2xCLGNBQVEsSUFBSSxLQUFLLENBQUM7QUFDbEIsY0FBUSxJQUFJLEtBQUssQ0FBQztBQUNsQixrQkFBWSxNQUFNLEtBQUssUUFBUSxPQUFPLEVBQUUsUUFBUSxDQUFDO0FBQ2pELFlBQU0sV0FBVyxNQUFNLElBQUkscUJBQXFCLGVBQWUsMEJBQTBCLE1BQU0sQ0FBQztBQUNoRyxrQkFBWSxNQUFNLEtBQUssU0FBUyxPQUFPLEVBQUUsUUFBUSxDQUFDO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNELFFBQU0sb0JBQW9CLE1BQU07QUFDL0IsUUFBSTtBQUNKLFFBQUk7QUFDSixVQUFNLGNBQXNCO0FBQUEsTUFDM0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUk7QUFFWCxRQUFJO0FBQ0osUUFBSSxtQkFBMkU7QUFDL0UsUUFBSSxvQkFBZ0U7QUFFcEUsVUFBTSxNQUFNO0FBQ1gsNkJBQXVCLElBQUkseUJBQXlCO0FBQ3BELDJCQUFxQixLQUFLLGNBQWM7QUFBQSxRQUN2QyxNQUFNLFNBQVMsVUFBZTtBQUM3QixnQkFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsWUFBWSxNQUFNLFNBQVMsQ0FBQztBQUNoRSxzQkFBWSxTQUFTLFFBQVEsU0FBUyxNQUFNO0FBQzVDLHNCQUFZLFNBQVMsTUFBTSxTQUFTLElBQUk7QUFDeEMsaUJBQU8sRUFBRSxPQUFPLFNBQVMsV0FBVyxXQUFXLEVBQUU7QUFBQSxRQUNsRDtBQUFBLE1BQ0QsQ0FBbUM7QUFDbkMsMkJBQXFCLEtBQUsscUJBQXFCO0FBQUEsUUFDOUMsTUFBTSxpQkFBaUI7QUFBRSxpQkFBTztBQUFBLFFBQW1CO0FBQUEsUUFDbkQsZ0JBQWdCO0FBQUUsaUJBQU87QUFBQSxRQUFrQjtBQUFBLE1BQzVDLENBQWtFO0FBQUEsSUFDbkUsQ0FBQztBQUVELGFBQVMsTUFBTTtBQUNkLDJCQUFxQixRQUFRO0FBQUEsSUFDOUIsQ0FBQztBQUVELFFBQUksQ0FBQyxXQUFXO0FBQ2YsWUFBTSxTQUFTLE1BQU07QUFDcEIsWUFBSTtBQUNKLGNBQU0sTUFBTTtBQUNYLDhCQUFvQixFQUFFLE1BQU0sSUFBSSxNQUFNLEVBQUU7QUFDeEMsY0FBSSxNQUFNLElBQUk7QUFDZCw2QkFBbUIsRUFBRSxpQkFBaUIsY0FBYztBQUNwRCx1QkFBYSxRQUFRO0FBQ3JCLHFCQUFXO0FBQUEsUUFDWixDQUFDO0FBQ0QsaUJBQVMsTUFBTTtBQUNkLGNBQUksa0JBQWtCLE1BQU0sTUFBTSxRQUFXO0FBQzVDLG1CQUFPLElBQUksTUFBTTtBQUFBLFVBQ2xCLE9BQU87QUFDTixnQkFBSSxNQUFNLElBQUksa0JBQWtCLE1BQU07QUFBQSxVQUN2QztBQUFBLFFBQ0QsQ0FBQztBQUNELGFBQUssY0FBYyxZQUFZO0FBQzlCLHFCQUFXO0FBQ1gsMkJBQWlCLE1BQU0scUJBQXFCLGVBQWUsZ0JBQWdCLEdBQUksVUFBVSxnQkFBZ0I7QUFBQSxRQUMxRyxDQUFDO0FBQUEsTUFDRixDQUFDO0FBQUEsSUFDRjtBQUNBLFVBQU0sVUFBVSxNQUFNO0FBQ3JCLFVBQUk7QUFDSixZQUFNLE1BQU07QUFDWCw0QkFBb0IsRUFBRSxNQUFNLElBQUksTUFBTSxFQUFFO0FBQ3hDLFlBQUksTUFBTSxJQUFJO0FBQ2QsMkJBQW1CLEVBQUUsaUJBQWlCLGNBQWM7QUFDcEQscUJBQWEsUUFBUTtBQUNyQixtQkFBVztBQUFBLE1BQ1osQ0FBQztBQUNELGVBQVMsTUFBTTtBQUNkLFlBQUksa0JBQWtCLE1BQU0sTUFBTSxRQUFXO0FBQzVDLGlCQUFPLElBQUksTUFBTTtBQUFBLFFBQ2xCLE9BQU87QUFDTixjQUFJLE1BQU0sSUFBSSxrQkFBa0IsTUFBTTtBQUFBLFFBQ3ZDO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxXQUFXLFlBQVk7QUFDM0IsNEJBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsUUFBUTtBQUNsRCxvQkFBWSxNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFHLE1BQVM7QUFBQSxNQUNuRixDQUFDO0FBQ0QsV0FBSyxTQUFTLFlBQVk7QUFDekIsNEJBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsVUFBVTtBQUNwRCx5QkFBaUIsTUFBTSxxQkFBcUIsZUFBZSxnQkFBZ0IsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLE1BQzFHLENBQUM7QUFDRCxXQUFLLFNBQVMsWUFBWTtBQUN6Qiw0QkFBb0IsRUFBRSxJQUFJLGdCQUFnQixNQUFNO0FBQ2hELHlCQUFpQixNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFJLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUcsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNELFFBQU0sbUJBQW1CLE1BQU07QUFDOUIsUUFBSTtBQUNKLFFBQUk7QUFDSixVQUFNLGtCQUFrQjtBQUFBLE1BQ3ZCO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRCxFQUFFLEtBQUssSUFBSTtBQUFBLE1BQ1o7QUFBQSxNQUNBO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRCxFQUFFLEtBQUssSUFBSTtBQUFBLE1BQ1o7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUksbUJBQTJFO0FBQy9FLFFBQUksb0JBQWdFO0FBRXBFLGVBQVcsRUFBRSxNQUFNLFFBQVEsS0FBSyxpQkFBaUI7QUFDaEQsWUFBTSxNQUFNLE1BQU07QUFDakIsY0FBTSxNQUFNO0FBQ1gsaUNBQXVCLElBQUkseUJBQXlCO0FBQ3BELCtCQUFxQixLQUFLLGNBQWM7QUFBQSxZQUN2QyxNQUFNLFNBQVMsVUFBZTtBQUM3QixvQkFBTSxXQUFXLElBQUksS0FBSyxFQUFFLFFBQVEsWUFBWSxNQUFNLFNBQVMsQ0FBQztBQUNoRSwwQkFBWSxTQUFTLFFBQVEsU0FBUyxNQUFNO0FBQzVDLDBCQUFZLFNBQVMsTUFBTSxTQUFTLElBQUk7QUFDeEMscUJBQU8sRUFBRSxPQUFPLFNBQVMsV0FBVyxPQUFPLEVBQUU7QUFBQSxZQUM5QztBQUFBLFVBQ0QsQ0FBbUM7QUFDbkMsK0JBQXFCLEtBQUsscUJBQXFCO0FBQUEsWUFDOUMsTUFBTSxpQkFBaUI7QUFBRSxxQkFBTztBQUFBLFlBQW1CO0FBQUEsWUFDbkQsZ0JBQWdCO0FBQUUscUJBQU87QUFBQSxZQUFrQjtBQUFBLFVBQzVDLENBQWtFO0FBQUEsUUFDbkUsQ0FBQztBQUVELGlCQUFTLE1BQU07QUFDZCwrQkFBcUIsUUFBUTtBQUFBLFFBQzlCLENBQUM7QUFFRCxZQUFJLENBQUMsV0FBVztBQUNmLGdCQUFNLFNBQVMsTUFBTTtBQUNwQixnQkFBSTtBQUNKLGtCQUFNLE1BQU07QUFDWCxrQ0FBb0IsRUFBRSxNQUFNLElBQUksTUFBTSxFQUFFO0FBQ3hDLGtCQUFJLE1BQU0sSUFBSTtBQUNkLGlDQUFtQixFQUFFLGlCQUFpQixjQUFjO0FBQ3BELDJCQUFhLFFBQVE7QUFDckIseUJBQVc7QUFBQSxZQUNaLENBQUM7QUFDRCxxQkFBUyxNQUFNO0FBQ2Qsa0JBQUksa0JBQWtCLE1BQU0sTUFBTSxRQUFXO0FBQzVDLHVCQUFPLElBQUksTUFBTTtBQUFBLGNBQ2xCLE9BQU87QUFDTixvQkFBSSxNQUFNLElBQUksa0JBQWtCLE1BQU07QUFBQSxjQUN2QztBQUFBLFlBQ0QsQ0FBQztBQUNELGlCQUFLLGNBQWMsWUFBWTtBQUM5Qix5QkFBVztBQUNYLCtCQUFpQixNQUFNLHFCQUFxQixlQUFlLGVBQWUsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLFlBQ3pHLENBQUM7QUFBQSxVQUNGLENBQUM7QUFBQSxRQUNGO0FBQ0EsY0FBTSxVQUFVLE1BQU07QUFDckIsY0FBSTtBQUNKLGdCQUFNLE1BQU07QUFDWCxnQ0FBb0IsRUFBRSxNQUFNLElBQUksTUFBTSxFQUFFO0FBQ3hDLGdCQUFJLE1BQU0sSUFBSTtBQUNkLCtCQUFtQixFQUFFLGlCQUFpQixjQUFjO0FBQ3BELHlCQUFhLFFBQVE7QUFDckIsdUJBQVc7QUFBQSxVQUNaLENBQUM7QUFDRCxtQkFBUyxNQUFNO0FBQ2QsZ0JBQUksa0JBQWtCLE1BQU0sTUFBTSxRQUFXO0FBQzVDLHFCQUFPLElBQUksTUFBTTtBQUFBLFlBQ2xCLE9BQU87QUFDTixrQkFBSSxNQUFNLElBQUksa0JBQWtCLE1BQU07QUFBQSxZQUN2QztBQUFBLFVBQ0QsQ0FBQztBQUNELGVBQUssV0FBVyxZQUFZO0FBQzNCLGdDQUFvQixFQUFFLElBQUksZ0JBQWdCLFFBQVE7QUFDbEQsd0JBQVksTUFBTSxxQkFBcUIsZUFBZSxlQUFlLEdBQUcsTUFBUztBQUFBLFVBQ2xGLENBQUM7QUFDRCxlQUFLLFNBQVMsWUFBWTtBQUN6QixnQ0FBb0IsRUFBRSxJQUFJLGdCQUFnQixVQUFVO0FBQ3BELDZCQUFpQixNQUFNLHFCQUFxQixlQUFlLGVBQWUsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLFVBQ3pHLENBQUM7QUFDRCxlQUFLLFNBQVMsWUFBWTtBQUN6QixnQ0FBb0IsRUFBRSxJQUFJLGdCQUFnQixNQUFNO0FBQ2hELDZCQUFpQixNQUFNLHFCQUFxQixlQUFlLGVBQWUsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLFVBQ3pHLENBQUM7QUFBQSxRQUNGLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRCxDQUFDO0FBQ0QsUUFBTSxvQkFBb0IsTUFBTTtBQUMvQixRQUFJO0FBQ0osUUFBSTtBQUNKLFVBQU0sY0FBc0I7QUFBQSxNQUMzQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLFFBQUk7QUFDSixRQUFJLG1CQUEyRTtBQUMvRSxRQUFJLG9CQUFnRTtBQUVwRSxVQUFNLE1BQU07QUFDWCw2QkFBdUIsSUFBSSx5QkFBeUI7QUFDcEQsMkJBQXFCLEtBQUssY0FBYztBQUFBLFFBQ3ZDLE1BQU0sU0FBUyxVQUFlO0FBQzdCLGdCQUFNLFdBQVcsSUFBSSxLQUFLO0FBQUEsWUFDekIsUUFBUTtBQUFBLFlBQ1IsV0FBVyxrQkFBa0I7QUFBQSxZQUM3QixNQUFNLElBQUksS0FBSyxRQUFRLEVBQUU7QUFBQSxVQUMxQixDQUFDO0FBRUQsc0JBQVksU0FBUyxTQUFTLEVBQUUsV0FBVyxPQUFPLEdBQUcsR0FBRyxTQUFTLFNBQVMsRUFBRSxXQUFXLE9BQU8sR0FBRyxDQUFDO0FBQ2xHLGlCQUFPLEVBQUUsT0FBTyxTQUFTLFdBQVcsV0FBVyxFQUFFO0FBQUEsUUFDbEQ7QUFBQSxNQUNELENBQW1DO0FBQ25DLDJCQUFxQixLQUFLLHFCQUFxQjtBQUFBLFFBQzlDLE1BQU0saUJBQWlCO0FBQUUsaUJBQU87QUFBQSxRQUFtQjtBQUFBLFFBQ25ELGdCQUFnQjtBQUFFLGlCQUFPO0FBQUEsUUFBa0I7QUFBQSxNQUM1QyxDQUFrRTtBQUFBLElBQ25FLENBQUM7QUFFRCxhQUFTLE1BQU07QUFDZCwyQkFBcUIsUUFBUTtBQUFBLElBQzlCLENBQUM7QUFFRCxVQUFNLFNBQVMsTUFBTTtBQUNwQixVQUFJO0FBQ0osWUFBTSxNQUFNO0FBQ1gsNEJBQW9CLEVBQUUsTUFBTSxJQUFJLE1BQU0sR0FBRyxTQUFTLElBQUksU0FBUyxFQUFFO0FBQ2pFLFlBQUksTUFBTSxJQUFJO0FBQ2QsWUFBSSxTQUFTLElBQUk7QUFDakIsMkJBQW1CLEVBQUUsaUJBQWlCLGNBQWM7QUFDcEQscUJBQWEsUUFBUTtBQUNyQixtQkFBVztBQUNYLDRCQUFvQixFQUFFLE1BQU0sSUFBSSxNQUFNLEdBQUcsU0FBUyxJQUFJLFNBQVMsRUFBRTtBQUFBLE1BQ2xFLENBQUM7QUFDRCxlQUFTLE1BQU07QUFDZCxZQUFJLGtCQUFrQixNQUFNLE1BQU0sUUFBVztBQUM1QyxpQkFBTyxJQUFJLE1BQU07QUFBQSxRQUNsQixPQUFPO0FBQ04sY0FBSSxNQUFNLElBQUksa0JBQWtCLE1BQU07QUFBQSxRQUN2QztBQUNBLFlBQUksa0JBQWtCLFNBQVMsTUFBTSxRQUFXO0FBQy9DLGlCQUFPLElBQUksU0FBUztBQUFBLFFBQ3JCLE9BQU87QUFDTixjQUFJLFNBQVMsSUFBSSxrQkFBa0IsU0FBUztBQUFBLFFBQzdDO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxjQUFjLFlBQVk7QUFDOUIsWUFBSSxXQUFXO0FBQ2QscUJBQVcsS0FBSyxJQUFJLFNBQVMsR0FBSSxxRUFBcUU7QUFBQSxRQUN2RyxPQUFPO0FBQ04scUJBQVcsS0FBSyxJQUFJLE1BQU0sR0FBSSw0REFBNEQ7QUFBQSxRQUMzRjtBQUNBLHlCQUFpQixNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFJLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUcsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFVBQU0sVUFBVSxNQUFNO0FBQ3JCLFVBQUk7QUFDSixZQUFNLE1BQU07QUFDWCwyQkFBbUIsRUFBRSxpQkFBaUIsY0FBYztBQUNwRCxxQkFBYSxRQUFRO0FBQ3JCLDRCQUFvQixFQUFFLE1BQU0sSUFBSSxNQUFNLEdBQUcsU0FBUyxJQUFJLFNBQVMsRUFBRTtBQUFBLE1BQ2xFLENBQUM7QUFDRCxlQUFTLE1BQU07QUFDZCxZQUFJLGtCQUFrQixNQUFNLE1BQU0sUUFBVztBQUM1QyxpQkFBTyxJQUFJLE1BQU07QUFBQSxRQUNsQixPQUFPO0FBQ04sY0FBSSxNQUFNLElBQUksa0JBQWtCLE1BQU07QUFBQSxRQUN2QztBQUNBLFlBQUksa0JBQWtCLFNBQVMsTUFBTSxRQUFXO0FBQy9DLGlCQUFPLElBQUksU0FBUztBQUFBLFFBQ3JCLE9BQU87QUFDTixjQUFJLFNBQVMsSUFBSSxrQkFBa0IsU0FBUztBQUFBLFFBQzdDO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxXQUFXLFlBQVk7QUFDM0IsNEJBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsUUFBUTtBQUNsRCxZQUFJLFNBQVMsSUFBSTtBQUNqQixtQkFBVztBQUNYLHlCQUFpQixNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFJLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUcsQ0FBQztBQUNELFdBQUssU0FBUyxZQUFZO0FBQ3pCLDRCQUFvQixFQUFFLElBQUksZ0JBQWdCLFVBQVU7QUFDcEQsWUFBSSxNQUFNLElBQUk7QUFDZCxtQkFBVztBQUNYLHlCQUFpQixNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFJLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUcsQ0FBQztBQUNELFdBQUssU0FBUyxZQUFZO0FBQ3pCLDRCQUFvQixFQUFFLElBQUksZ0JBQWdCLE1BQU07QUFDaEQsWUFBSSxNQUFNLElBQUk7QUFDZCxtQkFBVztBQUNYLHlCQUFpQixNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFJLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUcsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNELFFBQU0sb0JBQW9CLE1BQU07QUFDL0IsUUFBSTtBQUNKLFFBQUk7QUFDSixVQUFNLGNBQXNCO0FBQUEsTUFDM0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLFFBQUk7QUFDSixRQUFJLG1CQUEyRTtBQUMvRSxRQUFJLG9CQUFnRTtBQUVwRSxVQUFNLE1BQU07QUFDWCw2QkFBdUIsSUFBSSx5QkFBeUI7QUFDcEQsMkJBQXFCLEtBQUssY0FBYztBQUFBLFFBQ3ZDLE1BQU0sU0FBUyxVQUFlO0FBQzdCLGdCQUFNLFdBQVcsSUFBSSxLQUFLLEVBQUUsUUFBUSxZQUFZLE1BQU0sU0FBUyxDQUFDO0FBQ2hFLHNCQUFZLFNBQVMsUUFBUSxTQUFTLE1BQU07QUFDNUMsc0JBQVksU0FBUyxNQUFNLFNBQVMsSUFBSTtBQUN4QyxpQkFBTyxFQUFFLE9BQU8sU0FBUyxXQUFXLFdBQVcsRUFBRTtBQUFBLFFBQ2xEO0FBQUEsTUFDRCxDQUFtQztBQUNuQywyQkFBcUIsS0FBSyxxQkFBcUI7QUFBQSxRQUM5QyxNQUFNLGlCQUFpQjtBQUFFLGlCQUFPO0FBQUEsUUFBbUI7QUFBQSxRQUNuRCxnQkFBZ0I7QUFBRSxpQkFBTztBQUFBLFFBQWtCO0FBQUEsTUFDNUMsQ0FBa0U7QUFBQSxJQUNuRSxDQUFDO0FBRUQsYUFBUyxNQUFNO0FBQ2QsMkJBQXFCLFFBQVE7QUFBQSxJQUM5QixDQUFDO0FBRUQsUUFBSSxDQUFDLFdBQVc7QUFDZixZQUFNLFNBQVMsTUFBTTtBQUNwQixZQUFJO0FBQ0osY0FBTSxNQUFNO0FBQ1gsOEJBQW9CLEVBQUUsTUFBTSxJQUFJLE1BQU0sR0FBRyxlQUFlLElBQUksZUFBZSxFQUFFO0FBQzdFLGNBQUksTUFBTSxJQUFJO0FBQ2QsaUJBQU8sSUFBSSxlQUFlO0FBQzFCLDZCQUFtQixFQUFFLGlCQUFpQixjQUFjO0FBQ3BELHVCQUFhLFFBQVE7QUFDckIscUJBQVc7QUFBQSxRQUNaLENBQUM7QUFDRCxpQkFBUyxNQUFNO0FBQ2QsY0FBSSxrQkFBa0IsTUFBTSxNQUFNLFFBQVc7QUFDNUMsbUJBQU8sSUFBSSxNQUFNO0FBQUEsVUFDbEIsT0FBTztBQUNOLGdCQUFJLE1BQU0sSUFBSSxrQkFBa0IsTUFBTTtBQUFBLFVBQ3ZDO0FBQ0EsY0FBSSxrQkFBa0IsZUFBZSxNQUFNLFFBQVc7QUFDckQsbUJBQU8sSUFBSSxlQUFlO0FBQUEsVUFDM0IsT0FBTztBQUNOLGdCQUFJLGVBQWUsSUFBSSxrQkFBa0IsZUFBZTtBQUFBLFVBQ3pEO0FBQUEsUUFDRCxDQUFDO0FBQ0QsYUFBSyxjQUFjLFlBQVk7QUFDOUIscUJBQVc7QUFDWCwyQkFBaUIsTUFBTSxxQkFBcUIsZUFBZSxnQkFBZ0IsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLFFBQzFHLENBQUM7QUFBQSxNQUNGLENBQUM7QUFFRCxZQUFNLDBCQUEwQixNQUFNO0FBQ3JDLFlBQUk7QUFDSixjQUFNLE1BQU07QUFDWCw4QkFBb0IsRUFBRSxlQUFlLElBQUksZUFBZSxFQUFFO0FBQzFELGNBQUksZUFBZSxJQUFJO0FBQ3ZCLDZCQUFtQixFQUFFLGlCQUFpQixjQUFjO0FBQ3BELHVCQUFhLFFBQVE7QUFDckIscUJBQVc7QUFBQSxRQUNaLENBQUM7QUFDRCxpQkFBUyxNQUFNO0FBQ2QsY0FBSSxrQkFBa0IsZUFBZSxNQUFNLFFBQVc7QUFDckQsbUJBQU8sSUFBSSxlQUFlO0FBQUEsVUFDM0IsT0FBTztBQUNOLGdCQUFJLGVBQWUsSUFBSSxrQkFBa0IsZUFBZTtBQUFBLFVBQ3pEO0FBQUEsUUFDRCxDQUFDO0FBQ0QsYUFBSyxjQUFjLFlBQVk7QUFDOUIscUJBQVc7QUFDWCwyQkFBaUIsTUFBTSxxQkFBcUIsZUFBZSxnQkFBZ0IsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLFFBQzFHLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxJQUNGO0FBQ0EsVUFBTSxVQUFVLE1BQU07QUFDckIsVUFBSTtBQUNKLFlBQU0sTUFBTTtBQUNYLDRCQUFvQixFQUFFLE1BQU0sSUFBSSxNQUFNLEdBQUcsZUFBZSxJQUFJLGVBQWUsRUFBRTtBQUM3RSxZQUFJLE1BQU0sSUFBSTtBQUNkLGVBQU8sSUFBSSxlQUFlO0FBQzFCLDJCQUFtQixFQUFFLGlCQUFpQixjQUFjO0FBQ3BELHFCQUFhLFFBQVE7QUFDckIsbUJBQVc7QUFBQSxNQUNaLENBQUM7QUFDRCxlQUFTLE1BQU07QUFDZCxZQUFJLGtCQUFrQixNQUFNLE1BQU0sUUFBVztBQUM1QyxpQkFBTyxJQUFJLE1BQU07QUFBQSxRQUNsQixPQUFPO0FBQ04sY0FBSSxNQUFNLElBQUksa0JBQWtCLE1BQU07QUFBQSxRQUN2QztBQUNBLFlBQUksa0JBQWtCLGVBQWUsTUFBTSxRQUFXO0FBQ3JELGlCQUFPLElBQUksZUFBZTtBQUFBLFFBQzNCLE9BQU87QUFDTixjQUFJLGVBQWUsSUFBSSxrQkFBa0IsZUFBZTtBQUFBLFFBQ3pEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxXQUFXLFlBQVk7QUFDM0IsNEJBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsUUFBUTtBQUNsRCxvQkFBWSxNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFHLE1BQVM7QUFBQSxNQUNuRixDQUFDO0FBQ0QsV0FBSyxTQUFTLFlBQVk7QUFDekIsNEJBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsVUFBVTtBQUNwRCx5QkFBaUIsTUFBTSxxQkFBcUIsZUFBZSxnQkFBZ0IsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLE1BQzFHLENBQUM7QUFDRCxXQUFLLFNBQVMsWUFBWTtBQUN6Qiw0QkFBb0IsRUFBRSxJQUFJLGdCQUFnQixNQUFNO0FBQ2hELHlCQUFpQixNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFJLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUcsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFVBQU0sMkJBQTJCLE1BQU07QUFDdEMsVUFBSTtBQUNKLFlBQU0sTUFBTTtBQUNYLDRCQUFvQixFQUFFLGVBQWUsSUFBSSxlQUFlLEVBQUU7QUFDMUQsWUFBSSxlQUFlLElBQUk7QUFDdkIsMkJBQW1CLEVBQUUsaUJBQWlCLGNBQWM7QUFDcEQscUJBQWEsUUFBUTtBQUNyQixtQkFBVztBQUFBLE1BQ1osQ0FBQztBQUNELGVBQVMsTUFBTTtBQUNkLFlBQUksa0JBQWtCLGVBQWUsTUFBTSxRQUFXO0FBQ3JELGlCQUFPLElBQUksZUFBZTtBQUFBLFFBQzNCLE9BQU87QUFDTixjQUFJLGVBQWUsSUFBSSxrQkFBa0IsZUFBZTtBQUFBLFFBQ3pEO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxXQUFXLFlBQVk7QUFDM0IsNEJBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsUUFBUTtBQUNsRCxvQkFBWSxNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFHLE1BQVM7QUFBQSxNQUNuRixDQUFDO0FBQ0QsV0FBSyxTQUFTLFlBQVk7QUFDekIsNEJBQW9CLEVBQUUsSUFBSSxnQkFBZ0IsVUFBVTtBQUNwRCx5QkFBaUIsTUFBTSxxQkFBcUIsZUFBZSxnQkFBZ0IsR0FBSSxVQUFVLGdCQUFnQjtBQUFBLE1BQzFHLENBQUM7QUFDRCxXQUFLLFNBQVMsWUFBWTtBQUN6Qiw0QkFBb0IsRUFBRSxJQUFJLGdCQUFnQixNQUFNO0FBQ2hELHlCQUFpQixNQUFNLHFCQUFxQixlQUFlLGdCQUFnQixHQUFJLFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUcsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFVBQU0sMEJBQTBCLE1BQU07QUFDckMsV0FBSyxtQkFBbUIsTUFBTTtBQUk3QixjQUFNLFFBQVE7QUFBQSxVQUNiO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNEO0FBRUEsbUJBQVcsS0FBSyxPQUFPO0FBQ3RCLGFBQUcsdUJBQXVCLENBQUMsRUFBRSxTQUFTLElBQUksQ0FBQztBQUFBLFFBQzVDO0FBQUEsTUFDRCxDQUFDO0FBRUQsV0FBSyxxQkFBcUIsTUFBTTtBQUkvQixjQUFNLFFBQVE7QUFBQSxVQUNiO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFFQSxtQkFBVyxLQUFLLE9BQU87QUFDdEIsYUFBRyxDQUFDLHVCQUF1QixDQUFDLEVBQUUsU0FBUyxJQUFJLENBQUM7QUFBQSxRQUM3QztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBRUYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
