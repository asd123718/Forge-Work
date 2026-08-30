import { deepStrictEqual, fail, ok, strictEqual } from "assert";
import { isWindows } from "../../../../../base/common/platform.js";
import { ProfileSource } from "../../../../../platform/terminal/common/terminal.js";
import { detectAvailableProfiles } from "../../../../../platform/terminal/node/terminalProfiles.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
function profilesEqual(actualProfiles, expectedProfiles) {
  strictEqual(actualProfiles.length, expectedProfiles.length, `Actual: ${actualProfiles.map((e) => e.profileName).join(",")}
Expected: ${expectedProfiles.map((e) => e.profileName).join(",")}`);
  for (const expected of expectedProfiles) {
    const actual = actualProfiles.find((e) => e.profileName === expected.profileName);
    ok(actual, `Expected profile ${expected.profileName} not found`);
    strictEqual(actual.profileName, expected.profileName);
    strictEqual(actual.path, expected.path);
    deepStrictEqual(actual.args, expected.args);
    strictEqual(actual.isAutoDetected, expected.isAutoDetected);
    strictEqual(actual.overrideName, expected.overrideName);
  }
}
suite("Workbench - TerminalProfiles", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("detectAvailableProfiles", () => {
    if (isWindows) {
      test("should detect Git Bash and provide login args", async () => {
        const fsProvider = createFsProvider([
          "C:\\Program Files\\Git\\bin\\bash.exe"
        ]);
        const config = {
          profiles: {
            windows: {
              "Git Bash": { source: ProfileSource.GitBash }
            },
            linux: {},
            osx: {}
          },
          useWslProfiles: false
        };
        const configurationService = new TestConfigurationService({ terminal: { integrated: config } });
        const profiles = await detectAvailableProfiles(void 0, void 0, false, configurationService, process.env, fsProvider, void 0, void 0, void 0);
        const expected = [
          { profileName: "Git Bash", path: "C:\\Program Files\\Git\\bin\\bash.exe", args: ["--login", "-i"], isDefault: true }
        ];
        profilesEqual(profiles, expected);
      });
      test("should allow source to have args", async () => {
        const pwshSourcePaths = [
          "C:\\Program Files\\PowerShell\\7\\pwsh.exe"
        ];
        const fsProvider = createFsProvider(pwshSourcePaths);
        const config = {
          profiles: {
            windows: {
              "PowerShell": { source: ProfileSource.Pwsh, args: ["-NoProfile"], overrideName: true }
            },
            linux: {},
            osx: {}
          },
          useWslProfiles: false
        };
        const configurationService = new TestConfigurationService({ terminal: { integrated: config } });
        const profiles = await detectAvailableProfiles(void 0, void 0, false, configurationService, process.env, fsProvider, void 0, void 0, pwshSourcePaths);
        const expected = [
          { profileName: "PowerShell", path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe", overrideName: true, args: ["-NoProfile"], isDefault: true }
        ];
        profilesEqual(profiles, expected);
      });
      test("configured args should override default source ones", async () => {
        const fsProvider = createFsProvider([
          "C:\\Program Files\\Git\\bin\\bash.exe"
        ]);
        const config = {
          profiles: {
            windows: {
              "Git Bash": { source: ProfileSource.GitBash, args: [] }
            },
            linux: {},
            osx: {}
          },
          useWslProfiles: false
        };
        const configurationService = new TestConfigurationService({ terminal: { integrated: config } });
        const profiles = await detectAvailableProfiles(void 0, void 0, false, configurationService, process.env, fsProvider, void 0, void 0, void 0);
        const expected = [{ profileName: "Git Bash", path: "C:\\Program Files\\Git\\bin\\bash.exe", args: [], isAutoDetected: void 0, overrideName: void 0, isDefault: true }];
        profilesEqual(profiles, expected);
      });
      suite("pwsh source detection/fallback", () => {
        const pwshSourceConfig = {
          profiles: {
            windows: {
              "PowerShell": { source: ProfileSource.Pwsh }
            },
            linux: {},
            osx: {}
          },
          useWslProfiles: false
        };
        test("should prefer pwsh 7 to Windows PowerShell", async () => {
          const pwshSourcePaths = [
            "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
            "C:\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe",
            "C:\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
          ];
          const fsProvider = createFsProvider(pwshSourcePaths);
          const configurationService = new TestConfigurationService({ terminal: { integrated: pwshSourceConfig } });
          const profiles = await detectAvailableProfiles(void 0, void 0, false, configurationService, process.env, fsProvider, void 0, void 0, pwshSourcePaths);
          const expected = [
            { profileName: "PowerShell", path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe", isDefault: true }
          ];
          profilesEqual(profiles, expected);
        });
        test("should prefer pwsh 7 to pwsh 6", async () => {
          const pwshSourcePaths = [
            "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
            "C:\\Program Files\\PowerShell\\6\\pwsh.exe",
            "C:\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe",
            "C:\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
          ];
          const fsProvider = createFsProvider(pwshSourcePaths);
          const configurationService = new TestConfigurationService({ terminal: { integrated: pwshSourceConfig } });
          const profiles = await detectAvailableProfiles(void 0, void 0, false, configurationService, process.env, fsProvider, void 0, void 0, pwshSourcePaths);
          const expected = [
            { profileName: "PowerShell", path: "C:\\Program Files\\PowerShell\\7\\pwsh.exe", isDefault: true }
          ];
          profilesEqual(profiles, expected);
        });
        test("should fallback to Windows PowerShell", async () => {
          const pwshSourcePaths = [
            "C:\\Windows\\Sysnative\\WindowsPowerShell\\v1.0\\powershell.exe",
            "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"
          ];
          const fsProvider = createFsProvider(pwshSourcePaths);
          const configurationService = new TestConfigurationService({ terminal: { integrated: pwshSourceConfig } });
          const profiles = await detectAvailableProfiles(void 0, void 0, false, configurationService, process.env, fsProvider, void 0, void 0, pwshSourcePaths);
          strictEqual(profiles.length, 1);
          strictEqual(profiles[0].profileName, "PowerShell");
        });
      });
    } else {
      const absoluteConfig = {
        profiles: {
          windows: {},
          osx: {
            "fakeshell1": { path: "/bin/fakeshell1" },
            "fakeshell2": { path: "/bin/fakeshell2" },
            "fakeshell3": { path: "/bin/fakeshell3" }
          },
          linux: {
            "fakeshell1": { path: "/bin/fakeshell1" },
            "fakeshell2": { path: "/bin/fakeshell2" },
            "fakeshell3": { path: "/bin/fakeshell3" }
          }
        },
        useWslProfiles: false
      };
      const onPathConfig = {
        profiles: {
          windows: {},
          osx: {
            "fakeshell1": { path: "fakeshell1" },
            "fakeshell2": { path: "fakeshell2" },
            "fakeshell3": { path: "fakeshell3" }
          },
          linux: {
            "fakeshell1": { path: "fakeshell1" },
            "fakeshell2": { path: "fakeshell2" },
            "fakeshell3": { path: "fakeshell3" }
          }
        },
        useWslProfiles: false
      };
      test("should detect shells via absolute paths", async () => {
        const fsProvider = createFsProvider([
          "/bin/fakeshell1",
          "/bin/fakeshell3"
        ]);
        const configurationService = new TestConfigurationService({ terminal: { integrated: absoluteConfig } });
        const profiles = await detectAvailableProfiles(void 0, void 0, false, configurationService, process.env, fsProvider, void 0, void 0, void 0);
        const expected = [
          { profileName: "fakeshell1", path: "/bin/fakeshell1", isDefault: true },
          { profileName: "fakeshell3", path: "/bin/fakeshell3", isDefault: true }
        ];
        profilesEqual(profiles, expected);
      });
      test("should auto detect shells via /etc/shells", async () => {
        const fsProvider = createFsProvider([
          "/bin/fakeshell1",
          "/bin/fakeshell3"
        ], "/bin/fakeshell1\n/bin/fakeshell3");
        const configurationService = new TestConfigurationService({ terminal: { integrated: onPathConfig } });
        const profiles = await detectAvailableProfiles(void 0, void 0, true, configurationService, process.env, fsProvider, void 0, void 0, void 0);
        const expected = [
          { profileName: "fakeshell1", path: "/bin/fakeshell1", isFromPath: true, isDefault: true },
          { profileName: "fakeshell3", path: "/bin/fakeshell3", isFromPath: true, isDefault: true }
        ];
        profilesEqual(profiles, expected);
      });
      test("should validate auto detected shells from /etc/shells exist", async () => {
        const fsProvider = createFsProvider([
          "/bin/fakeshell1"
        ], "/bin/fakeshell1\n/bin/fakeshell3");
        const configurationService = new TestConfigurationService({ terminal: { integrated: onPathConfig } });
        const profiles = await detectAvailableProfiles(void 0, void 0, true, configurationService, process.env, fsProvider, void 0, void 0, void 0);
        const expected = [
          { profileName: "fakeshell1", path: "/bin/fakeshell1", isFromPath: true, isDefault: true }
        ];
        profilesEqual(profiles, expected);
      });
    }
  });
  function createFsProvider(expectedPaths, etcShellsContent = "") {
    const provider = {
      async existsFile(path) {
        return expectedPaths.includes(path);
      },
      async readFile(path) {
        if (path !== "/etc/shells") {
          fail("Unexepected path");
        }
        return Buffer.from(etcShellsContent);
      }
    };
    return provider;
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxub2RlXFx0ZXJtaW5hbFByb2ZpbGVzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIGZhaWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxQcm9maWxlLCBQcm9maWxlU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbmZpZ3VyYXRpb24sIElUZXJtaW5hbFByb2ZpbGVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGRldGVjdEF2YWlsYWJsZVByb2ZpbGVzLCBJRnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvdGVybWluYWxQcm9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuLyoqXG4gKiBBc3NldHMgdGhhdCB0d28gcHJvZmlsZXMgb2JqZWN0cyBhcmUgZXF1YWwsIHRoaXMgd2lsbCB0cmVhdCBleHBsaWNpdCB1bmRlZmluZWQgYW5kIHVuc2V0XG4gKiBwcm9wZXJ0aWVzIHRoZSBzYW1lLiBPcmRlciBvZiB0aGUgcHJvZmlsZXMgaXMgaWdub3JlZC5cbiAqL1xuZnVuY3Rpb24gcHJvZmlsZXNFcXVhbChhY3R1YWxQcm9maWxlczogSVRlcm1pbmFsUHJvZmlsZVtdLCBleHBlY3RlZFByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlW10pIHtcblx0c3RyaWN0RXF1YWwoYWN0dWFsUHJvZmlsZXMubGVuZ3RoLCBleHBlY3RlZFByb2ZpbGVzLmxlbmd0aCwgYEFjdHVhbDogJHthY3R1YWxQcm9maWxlcy5tYXAoZSA9PiBlLnByb2ZpbGVOYW1lKS5qb2luKCcsJyl9XFxuRXhwZWN0ZWQ6ICR7ZXhwZWN0ZWRQcm9maWxlcy5tYXAoZSA9PiBlLnByb2ZpbGVOYW1lKS5qb2luKCcsJyl9YCk7XG5cdGZvciAoY29uc3QgZXhwZWN0ZWQgb2YgZXhwZWN0ZWRQcm9maWxlcykge1xuXHRcdGNvbnN0IGFjdHVhbCA9IGFjdHVhbFByb2ZpbGVzLmZpbmQoZSA9PiBlLnByb2ZpbGVOYW1lID09PSBleHBlY3RlZC5wcm9maWxlTmFtZSk7XG5cdFx0b2soYWN0dWFsLCBgRXhwZWN0ZWQgcHJvZmlsZSAke2V4cGVjdGVkLnByb2ZpbGVOYW1lfSBub3QgZm91bmRgKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWwucHJvZmlsZU5hbWUsIGV4cGVjdGVkLnByb2ZpbGVOYW1lKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWwucGF0aCwgZXhwZWN0ZWQucGF0aCk7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5hcmdzLCBleHBlY3RlZC5hcmdzKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWwuaXNBdXRvRGV0ZWN0ZWQsIGV4cGVjdGVkLmlzQXV0b0RldGVjdGVkKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWwub3ZlcnJpZGVOYW1lLCBleHBlY3RlZC5vdmVycmlkZU5hbWUpO1xuXHR9XG59XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBUZXJtaW5hbFByb2ZpbGVzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXMnLCAoKSA9PiB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBHaXQgQmFzaCBhbmQgcHJvdmlkZSBsb2dpbiBhcmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmc1Byb3ZpZGVyID0gY3JlYXRlRnNQcm92aWRlcihbXG5cdFx0XHRcdFx0J0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcR2l0XFxcXGJpblxcXFxiYXNoLmV4ZSdcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZzogSVRlc3RUZXJtaW5hbENvbmZpZyA9IHtcblx0XHRcdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdFx0XHQnR2l0IEJhc2gnOiB7IHNvdXJjZTogUHJvZmlsZVNvdXJjZS5HaXRCYXNoIH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRsaW51eDoge30sXG5cdFx0XHRcdFx0XHRvc3g6IHt9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR1c2VXc2xQcm9maWxlczogZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogY29uZmlnIH0gfSk7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVzID0gYXdhaXQgZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHJvY2Vzcy5lbnYsIGZzUHJvdmlkZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0XHR7IHByb2ZpbGVOYW1lOiAnR2l0IEJhc2gnLCBwYXRoOiAnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxHaXRcXFxcYmluXFxcXGJhc2guZXhlJywgYXJnczogWyctLWxvZ2luJywgJy1pJ10sIGlzRGVmYXVsdDogdHJ1ZSB9XG5cdFx0XHRcdF07XG5cdFx0XHRcdHByb2ZpbGVzRXF1YWwocHJvZmlsZXMsIGV4cGVjdGVkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIGFsbG93IHNvdXJjZSB0byBoYXZlIGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHB3c2hTb3VyY2VQYXRocyA9IFtcblx0XHRcdFx0XHQnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnXG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IGZzUHJvdmlkZXIgPSBjcmVhdGVGc1Byb3ZpZGVyKHB3c2hTb3VyY2VQYXRocyk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZzogSVRlc3RUZXJtaW5hbENvbmZpZyA9IHtcblx0XHRcdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdFx0XHQnUG93ZXJTaGVsbCc6IHsgc291cmNlOiBQcm9maWxlU291cmNlLlB3c2gsIGFyZ3M6IFsnLU5vUHJvZmlsZSddLCBvdmVycmlkZU5hbWU6IHRydWUgfVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGxpbnV4OiB7fSxcblx0XHRcdFx0XHRcdG9zeDoge30sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR1c2VXc2xQcm9maWxlczogZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogY29uZmlnIH0gfSk7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVzID0gYXdhaXQgZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHJvY2Vzcy5lbnYsIGZzUHJvdmlkZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBwd3NoU291cmNlUGF0aHMpO1xuXHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0XHR7IHByb2ZpbGVOYW1lOiAnUG93ZXJTaGVsbCcsIHBhdGg6ICdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZScsIG92ZXJyaWRlTmFtZTogdHJ1ZSwgYXJnczogWyctTm9Qcm9maWxlJ10sIGlzRGVmYXVsdDogdHJ1ZSB9XG5cdFx0XHRcdF07XG5cdFx0XHRcdHByb2ZpbGVzRXF1YWwocHJvZmlsZXMsIGV4cGVjdGVkKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnY29uZmlndXJlZCBhcmdzIHNob3VsZCBvdmVycmlkZSBkZWZhdWx0IHNvdXJjZSBvbmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmc1Byb3ZpZGVyID0gY3JlYXRlRnNQcm92aWRlcihbXG5cdFx0XHRcdFx0J0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcR2l0XFxcXGJpblxcXFxiYXNoLmV4ZSdcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZzogSVRlc3RUZXJtaW5hbENvbmZpZyA9IHtcblx0XHRcdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdFx0XHQnR2l0IEJhc2gnOiB7IHNvdXJjZTogUHJvZmlsZVNvdXJjZS5HaXRCYXNoLCBhcmdzOiBbXSB9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bGludXg6IHt9LFxuXHRcdFx0XHRcdFx0b3N4OiB7fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dXNlV3NsUHJvZmlsZXM6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IGNvbmZpZyB9IH0pO1xuXHRcdFx0XHRjb25zdCBwcm9maWxlcyA9IGF3YWl0IGRldGVjdEF2YWlsYWJsZVByb2ZpbGVzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHByb2Nlc3MuZW52LCBmc1Byb3ZpZGVyLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbeyBwcm9maWxlTmFtZTogJ0dpdCBCYXNoJywgcGF0aDogJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcR2l0XFxcXGJpblxcXFxiYXNoLmV4ZScsIGFyZ3M6IFtdLCBpc0F1dG9EZXRlY3RlZDogdW5kZWZpbmVkLCBvdmVycmlkZU5hbWU6IHVuZGVmaW5lZCwgaXNEZWZhdWx0OiB0cnVlIH1dO1xuXHRcdFx0XHRwcm9maWxlc0VxdWFsKHByb2ZpbGVzLCBleHBlY3RlZCk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdwd3NoIHNvdXJjZSBkZXRlY3Rpb24vZmFsbGJhY2snLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHB3c2hTb3VyY2VDb25maWcgPSAoe1xuXHRcdFx0XHRcdHByb2ZpbGVzOiB7XG5cdFx0XHRcdFx0XHR3aW5kb3dzOiB7XG5cdFx0XHRcdFx0XHRcdCdQb3dlclNoZWxsJzogeyBzb3VyY2U6IFByb2ZpbGVTb3VyY2UuUHdzaCB9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bGludXg6IHt9LFxuXHRcdFx0XHRcdFx0b3N4OiB7fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHVzZVdzbFByb2ZpbGVzOiBmYWxzZVxuXHRcdFx0XHR9IGFzIElUZXN0VGVybWluYWxDb25maWcpIGFzIElUZXJtaW5hbENvbmZpZ3VyYXRpb247XG5cblx0XHRcdFx0dGVzdCgnc2hvdWxkIHByZWZlciBwd3NoIDcgdG8gV2luZG93cyBQb3dlclNoZWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHB3c2hTb3VyY2VQYXRocyA9IFtcblx0XHRcdFx0XHRcdCdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZScsXG5cdFx0XHRcdFx0XHQnQzpcXFxcU3lzbmF0aXZlXFxcXFdpbmRvd3NQb3dlclNoZWxsXFxcXHYxLjBcXFxccG93ZXJzaGVsbC5leGUnLFxuXHRcdFx0XHRcdFx0J0M6XFxcXFN5c3RlbTMyXFxcXFdpbmRvd3NQb3dlclNoZWxsXFxcXHYxLjBcXFxccG93ZXJzaGVsbC5leGUnXG5cdFx0XHRcdFx0XTtcblx0XHRcdFx0XHRjb25zdCBmc1Byb3ZpZGVyID0gY3JlYXRlRnNQcm92aWRlcihwd3NoU291cmNlUGF0aHMpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IHRlcm1pbmFsOiB7IGludGVncmF0ZWQ6IHB3c2hTb3VyY2VDb25maWcgfSB9KTtcblx0XHRcdFx0XHRjb25zdCBwcm9maWxlcyA9IGF3YWl0IGRldGVjdEF2YWlsYWJsZVByb2ZpbGVzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHByb2Nlc3MuZW52LCBmc1Byb3ZpZGVyLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgcHdzaFNvdXJjZVBhdGhzKTtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0XHRcdHsgcHJvZmlsZU5hbWU6ICdQb3dlclNoZWxsJywgcGF0aDogJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJywgaXNEZWZhdWx0OiB0cnVlIH1cblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdHByb2ZpbGVzRXF1YWwocHJvZmlsZXMsIGV4cGVjdGVkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3Nob3VsZCBwcmVmZXIgcHdzaCA3IHRvIHB3c2ggNicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwd3NoU291cmNlUGF0aHMgPSBbXG5cdFx0XHRcdFx0XHQnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnLFxuXHRcdFx0XHRcdFx0J0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw2XFxcXHB3c2guZXhlJyxcblx0XHRcdFx0XHRcdCdDOlxcXFxTeXNuYXRpdmVcXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZScsXG5cdFx0XHRcdFx0XHQnQzpcXFxcU3lzdGVtMzJcXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZSdcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdGNvbnN0IGZzUHJvdmlkZXIgPSBjcmVhdGVGc1Byb3ZpZGVyKHB3c2hTb3VyY2VQYXRocyk7XG5cdFx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogcHdzaFNvdXJjZUNvbmZpZyB9IH0pO1xuXHRcdFx0XHRcdGNvbnN0IHByb2ZpbGVzID0gYXdhaXQgZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgcHJvY2Vzcy5lbnYsIGZzUHJvdmlkZXIsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBwd3NoU291cmNlUGF0aHMpO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHRcdFx0eyBwcm9maWxlTmFtZTogJ1Bvd2VyU2hlbGwnLCBwYXRoOiAnQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGUnLCBpc0RlZmF1bHQ6IHRydWUgfVxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0cHJvZmlsZXNFcXVhbChwcm9maWxlcywgZXhwZWN0ZWQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnc2hvdWxkIGZhbGxiYWNrIHRvIFdpbmRvd3MgUG93ZXJTaGVsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwd3NoU291cmNlUGF0aHMgPSBbXG5cdFx0XHRcdFx0XHQnQzpcXFxcV2luZG93c1xcXFxTeXNuYXRpdmVcXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZScsXG5cdFx0XHRcdFx0XHQnQzpcXFxcV2luZG93c1xcXFxTeXN0ZW0zMlxcXFxXaW5kb3dzUG93ZXJTaGVsbFxcXFx2MS4wXFxcXHBvd2Vyc2hlbGwuZXhlJ1xuXHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0Y29uc3QgZnNQcm92aWRlciA9IGNyZWF0ZUZzUHJvdmlkZXIocHdzaFNvdXJjZVBhdGhzKTtcblx0XHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiBwd3NoU291cmNlQ29uZmlnIH0gfSk7XG5cdFx0XHRcdFx0Y29uc3QgcHJvZmlsZXMgPSBhd2FpdCBkZXRlY3RBdmFpbGFibGVQcm9maWxlcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwcm9jZXNzLmVudiwgZnNQcm92aWRlciwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHB3c2hTb3VyY2VQYXRocyk7XG5cdFx0XHRcdFx0c3RyaWN0RXF1YWwocHJvZmlsZXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbChwcm9maWxlc1swXS5wcm9maWxlTmFtZSwgJ1Bvd2VyU2hlbGwnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYWJzb2x1dGVDb25maWcgPSAoe1xuXHRcdFx0XHRwcm9maWxlczoge1xuXHRcdFx0XHRcdHdpbmRvd3M6IHt9LFxuXHRcdFx0XHRcdG9zeDoge1xuXHRcdFx0XHRcdFx0J2Zha2VzaGVsbDEnOiB7IHBhdGg6ICcvYmluL2Zha2VzaGVsbDEnIH0sXG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMic6IHsgcGF0aDogJy9iaW4vZmFrZXNoZWxsMicgfSxcblx0XHRcdFx0XHRcdCdmYWtlc2hlbGwzJzogeyBwYXRoOiAnL2Jpbi9mYWtlc2hlbGwzJyB9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdFx0J2Zha2VzaGVsbDEnOiB7IHBhdGg6ICcvYmluL2Zha2VzaGVsbDEnIH0sXG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMic6IHsgcGF0aDogJy9iaW4vZmFrZXNoZWxsMicgfSxcblx0XHRcdFx0XHRcdCdmYWtlc2hlbGwzJzogeyBwYXRoOiAnL2Jpbi9mYWtlc2hlbGwzJyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR1c2VXc2xQcm9maWxlczogZmFsc2Vcblx0XHRcdH0gYXMgSVRlc3RUZXJtaW5hbENvbmZpZykgYXMgSVRlcm1pbmFsQ29uZmlndXJhdGlvbjtcblx0XHRcdGNvbnN0IG9uUGF0aENvbmZpZyA9ICh7XG5cdFx0XHRcdHByb2ZpbGVzOiB7XG5cdFx0XHRcdFx0d2luZG93czoge30sXG5cdFx0XHRcdFx0b3N4OiB7XG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMSc6IHsgcGF0aDogJ2Zha2VzaGVsbDEnIH0sXG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMic6IHsgcGF0aDogJ2Zha2VzaGVsbDInIH0sXG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMyc6IHsgcGF0aDogJ2Zha2VzaGVsbDMnIH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMSc6IHsgcGF0aDogJ2Zha2VzaGVsbDEnIH0sXG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMic6IHsgcGF0aDogJ2Zha2VzaGVsbDInIH0sXG5cdFx0XHRcdFx0XHQnZmFrZXNoZWxsMyc6IHsgcGF0aDogJ2Zha2VzaGVsbDMnIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVzZVdzbFByb2ZpbGVzOiBmYWxzZVxuXHRcdFx0fSBhcyBJVGVzdFRlcm1pbmFsQ29uZmlnKSBhcyBJVGVybWluYWxDb25maWd1cmF0aW9uO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IHNoZWxscyB2aWEgYWJzb2x1dGUgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZzUHJvdmlkZXIgPSBjcmVhdGVGc1Byb3ZpZGVyKFtcblx0XHRcdFx0XHQnL2Jpbi9mYWtlc2hlbGwxJyxcblx0XHRcdFx0XHQnL2Jpbi9mYWtlc2hlbGwzJ1xuXHRcdFx0XHRdKTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogYWJzb2x1dGVDb25maWcgfSB9KTtcblx0XHRcdFx0Y29uc3QgcHJvZmlsZXMgPSBhd2FpdCBkZXRlY3RBdmFpbGFibGVQcm9maWxlcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwcm9jZXNzLmVudiwgZnNQcm92aWRlciwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJVGVybWluYWxQcm9maWxlW10gPSBbXG5cdFx0XHRcdFx0eyBwcm9maWxlTmFtZTogJ2Zha2VzaGVsbDEnLCBwYXRoOiAnL2Jpbi9mYWtlc2hlbGwxJywgaXNEZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBwcm9maWxlTmFtZTogJ2Zha2VzaGVsbDMnLCBwYXRoOiAnL2Jpbi9mYWtlc2hlbGwzJywgaXNEZWZhdWx0OiB0cnVlIH1cblx0XHRcdFx0XTtcblx0XHRcdFx0cHJvZmlsZXNFcXVhbChwcm9maWxlcywgZXhwZWN0ZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgYXV0byBkZXRlY3Qgc2hlbGxzIHZpYSAvZXRjL3NoZWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZnNQcm92aWRlciA9IGNyZWF0ZUZzUHJvdmlkZXIoW1xuXHRcdFx0XHRcdCcvYmluL2Zha2VzaGVsbDEnLFxuXHRcdFx0XHRcdCcvYmluL2Zha2VzaGVsbDMnXG5cdFx0XHRcdF0sICcvYmluL2Zha2VzaGVsbDFcXG4vYmluL2Zha2VzaGVsbDMnKTtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgdGVybWluYWw6IHsgaW50ZWdyYXRlZDogb25QYXRoQ29uZmlnIH0gfSk7XG5cdFx0XHRcdGNvbnN0IHByb2ZpbGVzID0gYXdhaXQgZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXModW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwcm9jZXNzLmVudiwgZnNQcm92aWRlciwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkOiBJVGVybWluYWxQcm9maWxlW10gPSBbXG5cdFx0XHRcdFx0eyBwcm9maWxlTmFtZTogJ2Zha2VzaGVsbDEnLCBwYXRoOiAnL2Jpbi9mYWtlc2hlbGwxJywgaXNGcm9tUGF0aDogdHJ1ZSwgaXNEZWZhdWx0OiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBwcm9maWxlTmFtZTogJ2Zha2VzaGVsbDMnLCBwYXRoOiAnL2Jpbi9mYWtlc2hlbGwzJywgaXNGcm9tUGF0aDogdHJ1ZSwgaXNEZWZhdWx0OiB0cnVlIH1cblx0XHRcdFx0XTtcblx0XHRcdFx0cHJvZmlsZXNFcXVhbChwcm9maWxlcywgZXhwZWN0ZWQpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdzaG91bGQgdmFsaWRhdGUgYXV0byBkZXRlY3RlZCBzaGVsbHMgZnJvbSAvZXRjL3NoZWxscyBleGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gZmFrZXNoZWxsMyBleGlzdHMgaW4gL2V0Yy9zaGVsbHMgYnV0IG5vdCBvbiBGU1xuXHRcdFx0XHRjb25zdCBmc1Byb3ZpZGVyID0gY3JlYXRlRnNQcm92aWRlcihbXG5cdFx0XHRcdFx0Jy9iaW4vZmFrZXNoZWxsMSdcblx0XHRcdFx0XSwgJy9iaW4vZmFrZXNoZWxsMVxcbi9iaW4vZmFrZXNoZWxsMycpO1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyB0ZXJtaW5hbDogeyBpbnRlZ3JhdGVkOiBvblBhdGhDb25maWcgfSB9KTtcblx0XHRcdFx0Y29uc3QgcHJvZmlsZXMgPSBhd2FpdCBkZXRlY3RBdmFpbGFibGVQcm9maWxlcyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHByb2Nlc3MuZW52LCBmc1Byb3ZpZGVyLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWQ6IElUZXJtaW5hbFByb2ZpbGVbXSA9IFtcblx0XHRcdFx0XHR7IHByb2ZpbGVOYW1lOiAnZmFrZXNoZWxsMScsIHBhdGg6ICcvYmluL2Zha2VzaGVsbDEnLCBpc0Zyb21QYXRoOiB0cnVlLCBpc0RlZmF1bHQ6IHRydWUgfVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRwcm9maWxlc0VxdWFsKHByb2ZpbGVzLCBleHBlY3RlZCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUZzUHJvdmlkZXIoZXhwZWN0ZWRQYXRoczogc3RyaW5nW10sIGV0Y1NoZWxsc0NvbnRlbnQ6IHN0cmluZyA9ICcnKTogSUZzUHJvdmlkZXIge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0ge1xuXHRcdFx0YXN5bmMgZXhpc3RzRmlsZShwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRcdFx0cmV0dXJuIGV4cGVjdGVkUGF0aHMuaW5jbHVkZXMocGF0aCk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcmVhZEZpbGUocGF0aDogc3RyaW5nKTogUHJvbWlzZTxCdWZmZXI+IHtcblx0XHRcdFx0aWYgKHBhdGggIT09ICcvZXRjL3NoZWxscycpIHtcblx0XHRcdFx0XHRmYWlsKCdVbmV4ZXBlY3RlZCBwYXRoJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIEJ1ZmZlci5mcm9tKGV0Y1NoZWxsc0NvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cmV0dXJuIHByb3ZpZGVyO1xuXHR9XG59KTtcblxuZXhwb3J0IGludGVyZmFjZSBJVGVzdFRlcm1pbmFsQ29uZmlnIHtcblx0cHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVzO1xuXHR1c2VXc2xQcm9maWxlczogYm9vbGVhbjtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLE1BQU0sSUFBSSxtQkFBbUI7QUFDdkQsU0FBUyxpQkFBaUI7QUFDMUIsU0FB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
