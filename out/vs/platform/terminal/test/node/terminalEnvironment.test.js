import { deepStrictEqual, ok, strictEqual } from "assert";
import { realpathSync, rmSync } from "fs";
import { homedir, tmpdir, userInfo } from "os";
import { FileAccess } from "../../../../base/common/network.js";
import { join } from "../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { getShellIntegrationInjection, sanitizeEnvForLogging } from "../../node/terminalEnvironment.js";
import { getWindowsBuildNumberSync } from "../../../../base/node/windowsVersion.js";
const enabledProcessOptions = { shellIntegration: { enabled: true, suggestEnabled: false, nonce: "" }, windowsUseConptyDll: false, environmentVariableCollections: void 0, workspaceFolder: void 0, isScreenReaderOptimized: false };
const disabledProcessOptions = { shellIntegration: { enabled: false, suggestEnabled: false, nonce: "" }, windowsUseConptyDll: false, environmentVariableCollections: void 0, workspaceFolder: void 0, isScreenReaderOptimized: false };
const pwshExe = process.platform === "win32" ? "pwsh.exe" : "pwsh";
const shellIntegrationScriptRoot = FileAccess.asFileUri("vs/workbench/contrib/terminal/common/scripts").fsPath;
const logService = new NullLogService();
const productService = { applicationName: "vscode" };
const defaultEnvironment = {};
function deepStrictEqualIgnoreStableVar(actual, expected) {
  if (actual?.type === "injection" && actual.envMixin) {
    delete actual.envMixin["VSCODE_STABLE"];
  }
  deepStrictEqual(actual, expected);
}
suite("platform - terminalEnvironment", async () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getShellIntegrationInjection", async () => {
    suite("should not enable", async () => {
      (getWindowsBuildNumberSync() < 18309 ? test.skip : test)("when isFeatureTerminal or when no executable is provided", async () => {
        strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo"], isFeatureTerminal: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo"], isFeatureTerminal: false }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "injection");
      });
    });
    (getWindowsBuildNumberSync() < 18309 ? suite.skip : suite)("pwsh", async () => {
      const expectedPs1 = process.platform === "win32" ? `try { . "${shellIntegrationScriptRoot}\\shellIntegration.ps1" } catch {}` : `. "${shellIntegrationScriptRoot}/shellIntegration.ps1"`;
      suite("should override args", async () => {
        const enabledExpectedResult = Object.freeze({
          type: "injection",
          newArgs: [
            "-noexit",
            "-command",
            expectedPs1
          ],
          envMixin: {
            VSCODE_A11Y_MODE: "0",
            VSCODE_INJECTION: "1"
          }
        });
        test("when undefined, []", async () => {
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: void 0 }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
        });
        suite("when no logo", async () => {
          test("array - case insensitive", async () => {
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-NoLogo"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-NOLOGO"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-nol"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-NOL"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          });
          test("string - case insensitive", async () => {
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-NoLogo" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-NOLOGO" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-nol" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-NOL" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          });
        });
      });
      suite("should incorporate login arg", async () => {
        const enabledExpectedResult = Object.freeze({
          type: "injection",
          newArgs: [
            "-l",
            "-noexit",
            "-command",
            expectedPs1
          ],
          envMixin: {
            VSCODE_A11Y_MODE: "0",
            VSCODE_INJECTION: "1"
          }
        });
        test("when array contains no logo and login", async () => {
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
        });
        test("when string", async () => {
          deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: pwshExe, args: "-l" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
        });
      });
      suite("should not modify args", async () => {
        test("when shell integration is disabled", async () => {
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: "-l" }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: void 0 }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        });
        test("when using unrecognized arg", async () => {
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: ["-l", "-NoLogo", "-i"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        });
        test("when using unrecognized arg (string)", async () => {
          strictEqual((await getShellIntegrationInjection({ executable: pwshExe, args: "-i" }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
        });
      });
    });
    if (process.platform !== "win32") {
      suite("zsh", async () => {
        suite("should override args", async () => {
          const username = userInfo().username;
          const expectedDir = new RegExp(`.+/${username}-vscode-zsh`);
          const customZdotdir = "/custom/zsh/dotdir";
          const expectedDests = [
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zshrc`),
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zprofile`),
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zshenv`),
            new RegExp(`.+\\/${username}-vscode-zsh\\/\\.zlogin`)
          ];
          const expectedSources = [
            `${shellIntegrationScriptRoot}/shellIntegration-rc.zsh`,
            `${shellIntegrationScriptRoot}/shellIntegration-profile.zsh`,
            `${shellIntegrationScriptRoot}/shellIntegration-env.zsh`,
            `${shellIntegrationScriptRoot}/shellIntegration-login.zsh`
          ];
          function assertIsEnabled(result, globalZdotdir = homedir()) {
            strictEqual(Object.keys(result.envMixin).length, 3);
            ok(result.envMixin["ZDOTDIR"]?.match(expectedDir));
            strictEqual(result.envMixin["USER_ZDOTDIR"], globalZdotdir);
            ok(result.envMixin["VSCODE_INJECTION"]?.match("1"));
            strictEqual(result.filesToCopy?.length, 4);
            ok(result.filesToCopy[0].dest.match(expectedDests[0]));
            ok(result.filesToCopy[1].dest.match(expectedDests[1]));
            ok(result.filesToCopy[2].dest.match(expectedDests[2]));
            ok(result.filesToCopy[3].dest.match(expectedDests[3]));
            strictEqual(result.filesToCopy[0].source, expectedSources[0]);
            strictEqual(result.filesToCopy[1].source, expectedSources[1]);
            strictEqual(result.filesToCopy[2].source, expectedSources[2]);
            strictEqual(result.filesToCopy[3].source, expectedSources[3]);
          }
          test("when undefined, []", async () => {
            const result1 = await getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
            deepStrictEqual(result1?.newArgs, ["-i"]);
            assertIsEnabled(result1);
            const result2 = await getShellIntegrationInjection({ executable: "zsh", args: void 0 }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
            deepStrictEqual(result2?.newArgs, ["-i"]);
            assertIsEnabled(result2);
          });
          test("when shell integration directory is created concurrently", async () => {
            const applicationName = `vscode-zsh-test-${process.pid}`;
            const zdotdir = join(realpathSync(tmpdir()), `${username}-${applicationName}-zsh`);
            rmSync(zdotdir, { recursive: true, force: true });
            try {
              const productService2 = { applicationName };
              const results = await Promise.all([
                getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService2),
                getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService2)
              ]);
              deepStrictEqual(results.map((result) => result.type), ["injection", "injection"]);
            } finally {
              rmSync(zdotdir, { recursive: true, force: true });
            }
          });
          suite("should incorporate login arg", async () => {
            test("when array", async () => {
              const result = await getShellIntegrationInjection({ executable: "zsh", args: ["-l"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true);
              deepStrictEqual(result?.newArgs, ["-il"]);
              assertIsEnabled(result);
            });
          });
          suite("should not modify args", async () => {
            test("when shell integration is disabled", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "zsh", args: ["-l"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
              strictEqual((await getShellIntegrationInjection({ executable: "zsh", args: void 0 }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
            test("when using unrecognized arg", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "zsh", args: ["-l", "-fake"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
          });
          suite("should incorporate global ZDOTDIR env variable", async () => {
            test("when custom ZDOTDIR", async () => {
              const result1 = await getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, { ...defaultEnvironment, ZDOTDIR: customZdotdir }, logService, productService, true);
              deepStrictEqual(result1?.newArgs, ["-i"]);
              assertIsEnabled(result1, customZdotdir);
            });
            test("when undefined", async () => {
              const result1 = await getShellIntegrationInjection({ executable: "zsh", args: [] }, enabledProcessOptions, void 0, logService, productService, true);
              deepStrictEqual(result1?.newArgs, ["-i"]);
              assertIsEnabled(result1);
            });
          });
        });
      });
      suite("bash", async () => {
        suite("forceShellIntegration", async () => {
          test("should inject when isFeatureTerminal is true but forceShellIntegration overrides it", async () => {
            strictEqual((await getShellIntegrationInjection({ executable: "bash", args: [], isFeatureTerminal: true, forceShellIntegration: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "injection");
          });
          test("should not inject when isFeatureTerminal is true and forceShellIntegration is false", async () => {
            strictEqual((await getShellIntegrationInjection({ executable: "bash", args: [], isFeatureTerminal: true, forceShellIntegration: false }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          });
          test("should not inject when isFeatureTerminal is true and forceShellIntegration is not set", async () => {
            strictEqual((await getShellIntegrationInjection({ executable: "bash", args: [], isFeatureTerminal: true }, enabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
          });
        });
        suite("should override args", async () => {
          test("when undefined, [], empty string", async () => {
            const enabledExpectedResult = Object.freeze({
              type: "injection",
              newArgs: [
                "--init-file",
                `${shellIntegrationScriptRoot}/shellIntegration-bash.sh`
              ],
              envMixin: {
                VSCODE_INJECTION: "1"
              }
            });
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: [] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: "" }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: void 0 }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
          });
          suite("should set login env variable and not modify args", async () => {
            const enabledExpectedResult = Object.freeze({
              type: "injection",
              newArgs: [
                "--init-file",
                `${shellIntegrationScriptRoot}/shellIntegration-bash.sh`
              ],
              envMixin: {
                VSCODE_INJECTION: "1",
                VSCODE_SHELL_LOGIN: "1"
              }
            });
            test("when array", async () => {
              deepStrictEqualIgnoreStableVar(await getShellIntegrationInjection({ executable: "bash", args: ["-l"] }, enabledProcessOptions, defaultEnvironment, logService, productService, true), enabledExpectedResult);
            });
          });
          suite("should not modify args", async () => {
            test("when shell integration is disabled", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "bash", args: ["-l"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
              strictEqual((await getShellIntegrationInjection({ executable: "bash", args: void 0 }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
            test("when custom array entry", async () => {
              strictEqual((await getShellIntegrationInjection({ executable: "bash", args: ["-l", "-i"] }, disabledProcessOptions, defaultEnvironment, logService, productService, true)).type, "failure");
            });
          });
        });
      });
    }
    suite("custom shell integration nonce", async () => {
      test("should fail for unsupported shell but nonce should still be available", async () => {
        const customProcessOptions = {
          shellIntegration: { enabled: true, suggestEnabled: false, nonce: "custom-nonce-12345" },
          windowsUseConptyDll: false,
          environmentVariableCollections: void 0,
          workspaceFolder: void 0,
          isScreenReaderOptimized: false
        };
        const result = await getShellIntegrationInjection(
          { executable: "julia", args: ["-i"] },
          customProcessOptions,
          defaultEnvironment,
          logService,
          productService,
          true
        );
        strictEqual(result.type, "failure");
        strictEqual(customProcessOptions.shellIntegration.nonce, "custom-nonce-12345");
      });
    });
  });
  suite("sanitizeEnvForLogging", () => {
    test("should return undefined for undefined input", () => {
      strictEqual(sanitizeEnvForLogging(void 0), void 0);
    });
    test("should return empty object for empty input", () => {
      deepStrictEqual(sanitizeEnvForLogging({}), {});
    });
    test("should pass through non-sensitive values", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        PATH: "/usr/bin",
        HOME: "/home/user",
        TERM: "xterm-256color"
      }), {
        PATH: "/usr/bin",
        HOME: "/home/user",
        TERM: "xterm-256color"
      });
    });
    test("should redact sensitive env var names", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        API_KEY: "secret123",
        GITHUB_TOKEN: "ghp_xxxx",
        MY_SECRET: "hidden",
        PASSWORD: "pass123",
        AWS_ACCESS_KEY: "AKIA...",
        DATABASE_PASSWORD: "dbpass",
        CLIENT_SECRET: "client_secret_value",
        AUTH_TOKEN: "auth_value",
        PRIVATE_KEY: "private_key_value"
      }), {
        API_KEY: "<REDACTED>",
        GITHUB_TOKEN: "<REDACTED>",
        MY_SECRET: "<REDACTED>",
        PASSWORD: "<REDACTED>",
        AWS_ACCESS_KEY: "<REDACTED>",
        DATABASE_PASSWORD: "<REDACTED>",
        CLIENT_SECRET: "<REDACTED>",
        AUTH_TOKEN: "<REDACTED>",
        PRIVATE_KEY: "<REDACTED>"
      });
    });
    test("should redact JWT tokens by value pattern", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        SOME_VAR: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
      }), {
        SOME_VAR: "<REDACTED>"
      });
    });
    test("should redact GitHub tokens by value pattern", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        MY_GH: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }), {
        MY_GH: "<REDACTED>"
      });
    });
    test("should redact Google API keys by value pattern", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        GOOGLE_KEY: "AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe"
      }), {
        GOOGLE_KEY: "<REDACTED>"
      });
    });
    test("should redact long alphanumeric strings (potential secrets)", () => {
      deepStrictEqual(sanitizeEnvForLogging({
        LONG_VALUE: "abcdefghijklmnopqrstuvwxyz123456"
      }), {
        LONG_VALUE: "<REDACTED>"
      });
    });
    test("should skip undefined values", () => {
      const env = {
        DEFINED: "value",
        UNDEFINED: void 0
      };
      deepStrictEqual(sanitizeEnvForLogging(env), {
        DEFINED: "value"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXHRlc3RcXG5vZGVcXHRlcm1pbmFsRW52aXJvbm1lbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qIGVzbGludC1kaXNhYmxlIGxvY2FsL2NvZGUtbm8tdGVzdC1hc3luYy1zdWl0ZSAqL1xuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcmVhbHBhdGhTeW5jLCBybVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBob21lZGlyLCB0bXBkaXIsIHVzZXJJbmZvIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24sIElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uLCB0eXBlIElTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZSwgc2FuaXRpemVFbnZGb3JMb2dnaW5nIH0gZnJvbSAnLi4vLi4vbm9kZS90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IGdldFdpbmRvd3NCdWlsZE51bWJlclN5bmMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvd2luZG93c1ZlcnNpb24uanMnO1xuXG5jb25zdCBlbmFibGVkUHJvY2Vzc09wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zID0geyBzaGVsbEludGVncmF0aW9uOiB7IGVuYWJsZWQ6IHRydWUsIHN1Z2dlc3RFbmFibGVkOiBmYWxzZSwgbm9uY2U6ICcnIH0sIHdpbmRvd3NVc2VDb25wdHlEbGw6IGZhbHNlLCBlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHVuZGVmaW5lZCwgd29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsIGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiBmYWxzZSB9O1xuY29uc3QgZGlzYWJsZWRQcm9jZXNzT3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMgPSB7IHNoZWxsSW50ZWdyYXRpb246IHsgZW5hYmxlZDogZmFsc2UsIHN1Z2dlc3RFbmFibGVkOiBmYWxzZSwgbm9uY2U6ICcnIH0sIHdpbmRvd3NVc2VDb25wdHlEbGw6IGZhbHNlLCBlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHVuZGVmaW5lZCwgd29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsIGlzU2NyZWVuUmVhZGVyT3B0aW1pemVkOiBmYWxzZSB9O1xuY29uc3QgcHdzaEV4ZSA9IHByb2Nlc3MucGxhdGZvcm0gPT09ICd3aW4zMicgPyAncHdzaC5leGUnIDogJ3B3c2gnO1xuY29uc3Qgc2hlbGxJbnRlZ3JhdGlvblNjcmlwdFJvb3QgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaSgndnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3NjcmlwdHMnKS5mc1BhdGg7XG5jb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5jb25zdCBwcm9kdWN0U2VydmljZSA9IHsgYXBwbGljYXRpb25OYW1lOiAndnNjb2RlJyB9IGFzIElQcm9kdWN0U2VydmljZTtcbmNvbnN0IGRlZmF1bHRFbnZpcm9ubWVudCA9IHt9O1xuXG5mdW5jdGlvbiBkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYWN0dWFsOiBJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbiB8IElTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uRmFpbHVyZSB8IHVuZGVmaW5lZCwgZXhwZWN0ZWQ6IElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uKSB7XG5cdGlmIChhY3R1YWw/LnR5cGUgPT09ICdpbmplY3Rpb24nICYmIGFjdHVhbC5lbnZNaXhpbikge1xuXHRcdGRlbGV0ZSBhY3R1YWwuZW52TWl4aW5bJ1ZTQ09ERV9TVEFCTEUnXTtcblx0fVxuXHRkZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG59XG5cbnN1aXRlKCdwbGF0Zm9ybSAtIHRlcm1pbmFsRW52aXJvbm1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRzdWl0ZSgnZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRzdWl0ZSgnc2hvdWxkIG5vdCBlbmFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGlzIHRlc3QgaXMgb25seSBleHBlY3RlZCB0byB3b3JrIG9uIFdpbmRvd3MgMTAgYnVpbGQgMTgzMDkgYW5kIGFib3ZlXG5cdFx0XHQoZ2V0V2luZG93c0J1aWxkTnVtYmVyU3luYygpIDwgMTgzMDkgPyB0ZXN0LnNraXAgOiB0ZXN0KSgnd2hlbiBpc0ZlYXR1cmVUZXJtaW5hbCBvciB3aGVuIG5vIGV4ZWN1dGFibGUgaXMgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogWyctbCcsICctTm9Mb2dvJ10sIGlzRmVhdHVyZVRlcm1pbmFsOiB0cnVlIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkpLnR5cGUsICdmYWlsdXJlJyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogWyctbCcsICctTm9Mb2dvJ10sIGlzRmVhdHVyZVRlcm1pbmFsOiBmYWxzZSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnaW5qZWN0aW9uJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIFRoZXNlIHRlc3RzIGFyZSBvbmx5IGV4cGVjdGVkIHRvIHdvcmsgb24gV2luZG93cyAxMCBidWlsZCAxODMwOSBhbmQgYWJvdmVcblx0XHQoZ2V0V2luZG93c0J1aWxkTnVtYmVyU3luYygpIDwgMTgzMDkgPyBzdWl0ZS5za2lwIDogc3VpdGUpKCdwd3NoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRQczEgPSBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInXG5cdFx0XHRcdD8gYHRyeSB7IC4gXCIke3NoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290fVxcXFxzaGVsbEludGVncmF0aW9uLnBzMVwiIH0gY2F0Y2gge31gXG5cdFx0XHRcdDogYC4gXCIke3NoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290fS9zaGVsbEludGVncmF0aW9uLnBzMVwiYDtcblx0XHRcdHN1aXRlKCdzaG91bGQgb3ZlcnJpZGUgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZEV4cGVjdGVkUmVzdWx0ID0gT2JqZWN0LmZyZWV6ZTxJU2hlbGxJbnRlZ3JhdGlvbkNvbmZpZ0luamVjdGlvbj4oe1xuXHRcdFx0XHRcdHR5cGU6ICdpbmplY3Rpb24nLFxuXHRcdFx0XHRcdG5ld0FyZ3M6IFtcblx0XHRcdFx0XHRcdCctbm9leGl0Jyxcblx0XHRcdFx0XHRcdCctY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRleHBlY3RlZFBzMVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZW52TWl4aW46IHtcblx0XHRcdFx0XHRcdFZTQ09ERV9BMTFZX01PREU6ICcwJyxcblx0XHRcdFx0XHRcdFZTQ09ERV9JTkpFQ1RJT046ICcxJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3doZW4gdW5kZWZpbmVkLCBbXScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFtdIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiB1bmRlZmluZWQgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHN1aXRlKCd3aGVuIG5vIGxvZ28nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dGVzdCgnYXJyYXkgLSBjYXNlIGluc2Vuc2l0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1Ob0xvZ28nXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1OT0xPR08nXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1ub2wnXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiBbJy1OT0wnXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRlc3QoJ3N0cmluZyAtIGNhc2UgaW5zZW5zaXRpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6ICctTm9Mb2dvJyB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiBwd3NoRXhlLCBhcmdzOiAnLU5PTE9HTycgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbElnbm9yZVN0YWJsZVZhcihhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogJy1ub2wnIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6ICctTk9MJyB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0c3VpdGUoJ3Nob3VsZCBpbmNvcnBvcmF0ZSBsb2dpbiBhcmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZWRFeHBlY3RlZFJlc3VsdCA9IE9iamVjdC5mcmVlemU8SVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24+KHtcblx0XHRcdFx0XHR0eXBlOiAnaW5qZWN0aW9uJyxcblx0XHRcdFx0XHRuZXdBcmdzOiBbXG5cdFx0XHRcdFx0XHQnLWwnLFxuXHRcdFx0XHRcdFx0Jy1ub2V4aXQnLFxuXHRcdFx0XHRcdFx0Jy1jb21tYW5kJyxcblx0XHRcdFx0XHRcdGV4cGVjdGVkUHMxXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRlbnZNaXhpbjoge1xuXHRcdFx0XHRcdFx0VlNDT0RFX0ExMVlfTU9ERTogJzAnLFxuXHRcdFx0XHRcdFx0VlNDT0RFX0lOSkVDVElPTjogJzEnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnd2hlbiBhcnJheSBjb250YWlucyBubyBsb2dvIGFuZCBsb2dpbicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFsnLWwnLCAnLU5vTG9nbyddIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0ZXN0KCd3aGVuIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6ICctbCcgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHN1aXRlKCdzaG91bGQgbm90IG1vZGlmeSBhcmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0ZXN0KCd3aGVuIHNoZWxsIGludGVncmF0aW9uIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogWyctbCddIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogJy1sJyB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IHVuZGVmaW5lZCB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRlc3QoJ3doZW4gdXNpbmcgdW5yZWNvZ25pemVkIGFyZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6IHB3c2hFeGUsIGFyZ3M6IFsnLWwnLCAnLU5vTG9nbycsICctaSddIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGVzdCgnd2hlbiB1c2luZyB1bnJlY29nbml6ZWQgYXJnIChzdHJpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogcHdzaEV4ZSwgYXJnczogJy1pJyB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGlmIChwcm9jZXNzLnBsYXRmb3JtICE9PSAnd2luMzInKSB7XG5cdFx0XHRzdWl0ZSgnenNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdWl0ZSgnc2hvdWxkIG92ZXJyaWRlIGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdXNlcm5hbWUgPSB1c2VySW5mbygpLnVzZXJuYW1lO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkRGlyID0gbmV3IFJlZ0V4cChgLitcXC8ke3VzZXJuYW1lfS12c2NvZGUtenNoYCk7XG5cdFx0XHRcdFx0Y29uc3QgY3VzdG9tWmRvdGRpciA9ICcvY3VzdG9tL3pzaC9kb3RkaXInO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkRGVzdHMgPSBbXG5cdFx0XHRcdFx0XHRuZXcgUmVnRXhwKGAuK1xcXFwvJHt1c2VybmFtZX0tdnNjb2RlLXpzaFxcXFwvXFxcXC56c2hyY2ApLFxuXHRcdFx0XHRcdFx0bmV3IFJlZ0V4cChgLitcXFxcLyR7dXNlcm5hbWV9LXZzY29kZS16c2hcXFxcL1xcXFwuenByb2ZpbGVgKSxcblx0XHRcdFx0XHRcdG5ldyBSZWdFeHAoYC4rXFxcXC8ke3VzZXJuYW1lfS12c2NvZGUtenNoXFxcXC9cXFxcLnpzaGVudmApLFxuXHRcdFx0XHRcdFx0bmV3IFJlZ0V4cChgLitcXFxcLyR7dXNlcm5hbWV9LXZzY29kZS16c2hcXFxcL1xcXFwuemxvZ2luYClcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkU291cmNlcyA9IFtcblx0XHRcdFx0XHRcdGAke3NoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290fS9zaGVsbEludGVncmF0aW9uLXJjLnpzaGAsXG5cdFx0XHRcdFx0XHRgJHtzaGVsbEludGVncmF0aW9uU2NyaXB0Um9vdH0vc2hlbGxJbnRlZ3JhdGlvbi1wcm9maWxlLnpzaGAsXG5cdFx0XHRcdFx0XHRgJHtzaGVsbEludGVncmF0aW9uU2NyaXB0Um9vdH0vc2hlbGxJbnRlZ3JhdGlvbi1lbnYuenNoYCxcblx0XHRcdFx0XHRcdGAke3NoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290fS9zaGVsbEludGVncmF0aW9uLWxvZ2luLnpzaGBcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdGZ1bmN0aW9uIGFzc2VydElzRW5hYmxlZChyZXN1bHQ6IElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uLCBnbG9iYWxaZG90ZGlyID0gaG9tZWRpcigpKSB7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChPYmplY3Qua2V5cyhyZXN1bHQuZW52TWl4aW4hKS5sZW5ndGgsIDMpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmVudk1peGluIVsnWkRPVERJUiddPy5tYXRjaChleHBlY3RlZERpcikpO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LmVudk1peGluIVsnVVNFUl9aRE9URElSJ10sIGdsb2JhbFpkb3RkaXIpO1xuXHRcdFx0XHRcdFx0b2socmVzdWx0LmVudk1peGluIVsnVlNDT0RFX0lOSkVDVElPTiddPy5tYXRjaCgnMScpKTtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5maWxlc1RvQ29weT8ubGVuZ3RoLCA0KTtcblx0XHRcdFx0XHRcdG9rKHJlc3VsdC5maWxlc1RvQ29weVswXS5kZXN0Lm1hdGNoKGV4cGVjdGVkRGVzdHNbMF0pKTtcblx0XHRcdFx0XHRcdG9rKHJlc3VsdC5maWxlc1RvQ29weVsxXS5kZXN0Lm1hdGNoKGV4cGVjdGVkRGVzdHNbMV0pKTtcblx0XHRcdFx0XHRcdG9rKHJlc3VsdC5maWxlc1RvQ29weVsyXS5kZXN0Lm1hdGNoKGV4cGVjdGVkRGVzdHNbMl0pKTtcblx0XHRcdFx0XHRcdG9rKHJlc3VsdC5maWxlc1RvQ29weVszXS5kZXN0Lm1hdGNoKGV4cGVjdGVkRGVzdHNbM10pKTtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5maWxlc1RvQ29weVswXS5zb3VyY2UsIGV4cGVjdGVkU291cmNlc1swXSk7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQuZmlsZXNUb0NvcHlbMV0uc291cmNlLCBleHBlY3RlZFNvdXJjZXNbMV0pO1xuXHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LmZpbGVzVG9Db3B5WzJdLnNvdXJjZSwgZXhwZWN0ZWRTb3VyY2VzWzJdKTtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdC5maWxlc1RvQ29weVszXS5zb3VyY2UsIGV4cGVjdGVkU291cmNlc1szXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRlc3QoJ3doZW4gdW5kZWZpbmVkLCBbXScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ3pzaCcsIGFyZ3M6IFtdIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkgYXMgSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb247XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0MT8ubmV3QXJncywgWyctaSddKTtcblx0XHRcdFx0XHRcdGFzc2VydElzRW5hYmxlZChyZXN1bHQxKTtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdDIgPSBhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ3pzaCcsIGFyZ3M6IHVuZGVmaW5lZCB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpIGFzIElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdDI/Lm5ld0FyZ3MsIFsnLWknXSk7XG5cdFx0XHRcdFx0XHRhc3NlcnRJc0VuYWJsZWQocmVzdWx0Mik7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGVzdCgnd2hlbiBzaGVsbCBpbnRlZ3JhdGlvbiBkaXJlY3RvcnkgaXMgY3JlYXRlZCBjb25jdXJyZW50bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBhcHBsaWNhdGlvbk5hbWUgPSBgdnNjb2RlLXpzaC10ZXN0LSR7cHJvY2Vzcy5waWR9YDtcblx0XHRcdFx0XHRcdGNvbnN0IHpkb3RkaXIgPSBqb2luKHJlYWxwYXRoU3luYyh0bXBkaXIoKSksIGAke3VzZXJuYW1lfS0ke2FwcGxpY2F0aW9uTmFtZX0tenNoYCk7XG5cdFx0XHRcdFx0XHRybVN5bmMoemRvdGRpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcHJvZHVjdFNlcnZpY2UgPSB7IGFwcGxpY2F0aW9uTmFtZSB9IGFzIElQcm9kdWN0U2VydmljZTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRcdFx0XHRnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ3pzaCcsIGFyZ3M6IFtdIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSksXG5cdFx0XHRcdFx0XHRcdFx0Z2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICd6c2gnLCBhcmdzOiBbXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UpLFxuXHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQudHlwZSksIFsnaW5qZWN0aW9uJywgJ2luamVjdGlvbiddKTtcblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdHJtU3luYyh6ZG90ZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c3VpdGUoJ3Nob3VsZCBpbmNvcnBvcmF0ZSBsb2dpbiBhcmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0ZXN0KCd3aGVuIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ3pzaCcsIGFyZ3M6IFsnLWwnXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpIGFzIElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uO1xuXHRcdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0Py5uZXdBcmdzLCBbJy1pbCddKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0SXNFbmFibGVkKHJlc3VsdCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzdWl0ZSgnc2hvdWxkIG5vdCBtb2RpZnkgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRlc3QoJ3doZW4gc2hlbGwgaW50ZWdyYXRpb24gaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ3pzaCcsIGFyZ3M6IFsnLWwnXSB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnenNoJywgYXJnczogdW5kZWZpbmVkIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0ZXN0KCd3aGVuIHVzaW5nIHVucmVjb2duaXplZCBhcmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ3pzaCcsIGFyZ3M6IFsnLWwnLCAnLWZha2UnXSB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHN1aXRlKCdzaG91bGQgaW5jb3Jwb3JhdGUgZ2xvYmFsIFpET1RESVIgZW52IHZhcmlhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGVzdCgnd2hlbiBjdXN0b20gWkRPVERJUicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0MSA9IGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnenNoJywgYXJnczogW10gfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCB7IC4uLmRlZmF1bHRFbnZpcm9ubWVudCwgWkRPVERJUjogY3VzdG9tWmRvdGRpciB9LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkgYXMgSVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb247XG5cdFx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXN1bHQxPy5uZXdBcmdzLCBbJy1pJ10pO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnRJc0VuYWJsZWQocmVzdWx0MSwgY3VzdG9tWmRvdGRpcik7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRlc3QoJ3doZW4gdW5kZWZpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXN1bHQxID0gYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICd6c2gnLCBhcmdzOiBbXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIHVuZGVmaW5lZCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpIGFzIElTaGVsbEludGVncmF0aW9uQ29uZmlnSW5qZWN0aW9uO1xuXHRcdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwocmVzdWx0MT8ubmV3QXJncywgWyctaSddKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0SXNFbmFibGVkKHJlc3VsdDEpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRzdWl0ZSgnYmFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3VpdGUoJ2ZvcmNlU2hlbGxJbnRlZ3JhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0ZXN0KCdzaG91bGQgaW5qZWN0IHdoZW4gaXNGZWF0dXJlVGVybWluYWwgaXMgdHJ1ZSBidXQgZm9yY2VTaGVsbEludGVncmF0aW9uIG92ZXJyaWRlcyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ2Jhc2gnLCBhcmdzOiBbXSwgaXNGZWF0dXJlVGVybWluYWw6IHRydWUsIGZvcmNlU2hlbGxJbnRlZ3JhdGlvbjogdHJ1ZSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnaW5qZWN0aW9uJyk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGVzdCgnc2hvdWxkIG5vdCBpbmplY3Qgd2hlbiBpc0ZlYXR1cmVUZXJtaW5hbCBpcyB0cnVlIGFuZCBmb3JjZVNoZWxsSW50ZWdyYXRpb24gaXMgZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICdiYXNoJywgYXJnczogW10sIGlzRmVhdHVyZVRlcm1pbmFsOiB0cnVlLCBmb3JjZVNoZWxsSW50ZWdyYXRpb246IGZhbHNlIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSkpLnR5cGUsICdmYWlsdXJlJyk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGVzdCgnc2hvdWxkIG5vdCBpbmplY3Qgd2hlbiBpc0ZlYXR1cmVUZXJtaW5hbCBpcyB0cnVlIGFuZCBmb3JjZVNoZWxsSW50ZWdyYXRpb24gaXMgbm90IHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHN0cmljdEVxdWFsKChhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ2Jhc2gnLCBhcmdzOiBbXSwgaXNGZWF0dXJlVGVybWluYWw6IHRydWUgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHN1aXRlKCdzaG91bGQgb3ZlcnJpZGUgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0ZXN0KCd3aGVuIHVuZGVmaW5lZCwgW10sIGVtcHR5IHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVuYWJsZWRFeHBlY3RlZFJlc3VsdCA9IE9iamVjdC5mcmVlemU8SVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24+KHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2luamVjdGlvbicsXG5cdFx0XHRcdFx0XHRcdG5ld0FyZ3M6IFtcblx0XHRcdFx0XHRcdFx0XHQnLS1pbml0LWZpbGUnLFxuXHRcdFx0XHRcdFx0XHRcdGAke3NoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290fS9zaGVsbEludGVncmF0aW9uLWJhc2guc2hgXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdGVudk1peGluOiB7XG5cdFx0XHRcdFx0XHRcdFx0VlNDT0RFX0lOSkVDVElPTjogJzEnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IFtdIH0sIGVuYWJsZWRQcm9jZXNzT3B0aW9ucywgZGVmYXVsdEVudmlyb25tZW50LCBsb2dTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgdHJ1ZSksIGVuYWJsZWRFeHBlY3RlZFJlc3VsdCk7XG5cdFx0XHRcdFx0XHRkZWVwU3RyaWN0RXF1YWxJZ25vcmVTdGFibGVWYXIoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICdiYXNoJywgYXJnczogJycgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0XHRcdGRlZXBTdHJpY3RFcXVhbElnbm9yZVN0YWJsZVZhcihhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKHsgZXhlY3V0YWJsZTogJ2Jhc2gnLCBhcmdzOiB1bmRlZmluZWQgfSwgZW5hYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSwgZW5hYmxlZEV4cGVjdGVkUmVzdWx0KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRzdWl0ZSgnc2hvdWxkIHNldCBsb2dpbiBlbnYgdmFyaWFibGUgYW5kIG5vdCBtb2RpZnkgYXJncycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVuYWJsZWRFeHBlY3RlZFJlc3VsdCA9IE9iamVjdC5mcmVlemU8SVNoZWxsSW50ZWdyYXRpb25Db25maWdJbmplY3Rpb24+KHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2luamVjdGlvbicsXG5cdFx0XHRcdFx0XHRcdG5ld0FyZ3M6IFtcblx0XHRcdFx0XHRcdFx0XHQnLS1pbml0LWZpbGUnLFxuXHRcdFx0XHRcdFx0XHRcdGAke3NoZWxsSW50ZWdyYXRpb25TY3JpcHRSb290fS9zaGVsbEludGVncmF0aW9uLWJhc2guc2hgXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRcdGVudk1peGluOiB7XG5cdFx0XHRcdFx0XHRcdFx0VlNDT0RFX0lOSkVDVElPTjogJzEnLFxuXHRcdFx0XHRcdFx0XHRcdFZTQ09ERV9TSEVMTF9MT0dJTjogJzEnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0dGVzdCgnd2hlbiBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsSWdub3JlU3RhYmxlVmFyKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IFsnLWwnXSB9LCBlbmFibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpLCBlbmFibGVkRXhwZWN0ZWRSZXN1bHQpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0c3VpdGUoJ3Nob3VsZCBub3QgbW9kaWZ5IGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0ZXN0KCd3aGVuIHNoZWxsIGludGVncmF0aW9uIGlzIGRpc2FibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICdiYXNoJywgYXJnczogWyctbCddIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgZ2V0U2hlbGxJbnRlZ3JhdGlvbkluamVjdGlvbih7IGV4ZWN1dGFibGU6ICdiYXNoJywgYXJnczogdW5kZWZpbmVkIH0sIGRpc2FibGVkUHJvY2Vzc09wdGlvbnMsIGRlZmF1bHRFbnZpcm9ubWVudCwgbG9nU2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIHRydWUpKS50eXBlLCAnZmFpbHVyZScpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR0ZXN0KCd3aGVuIGN1c3RvbSBhcnJheSBlbnRyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGdldFNoZWxsSW50ZWdyYXRpb25JbmplY3Rpb24oeyBleGVjdXRhYmxlOiAnYmFzaCcsIGFyZ3M6IFsnLWwnLCAnLWknXSB9LCBkaXNhYmxlZFByb2Nlc3NPcHRpb25zLCBkZWZhdWx0RW52aXJvbm1lbnQsIGxvZ1NlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlLCB0cnVlKSkudHlwZSwgJ2ZhaWx1cmUnKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHN1aXRlKCdjdXN0b20gc2hlbGwgaW50ZWdyYXRpb24gbm9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgZmFpbCBmb3IgdW5zdXBwb3J0ZWQgc2hlbGwgYnV0IG5vbmNlIHNob3VsZCBzdGlsbCBiZSBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbVByb2Nlc3NPcHRpb25zOiBJVGVybWluYWxQcm9jZXNzT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRzaGVsbEludGVncmF0aW9uOiB7IGVuYWJsZWQ6IHRydWUsIHN1Z2dlc3RFbmFibGVkOiBmYWxzZSwgbm9uY2U6ICdjdXN0b20tbm9uY2UtMTIzNDUnIH0sXG5cblx0XHRcdFx0XHR3aW5kb3dzVXNlQ29ucHR5RGxsOiBmYWxzZSxcblx0XHRcdFx0XHRlbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbnM6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpc1NjcmVlblJlYWRlck9wdGltaXplZDogZmFsc2Vcblx0XHRcdFx0fTtcblxuXHRcdFx0XHQvLyBUZXN0IHdpdGggYW4gdW5zdXBwb3J0ZWQgc2hlbGwgKGp1bGlhKVxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBnZXRTaGVsbEludGVncmF0aW9uSW5qZWN0aW9uKFxuXHRcdFx0XHRcdHsgZXhlY3V0YWJsZTogJ2p1bGlhJywgYXJnczogWyctaSddIH0sXG5cdFx0XHRcdFx0Y3VzdG9tUHJvY2Vzc09wdGlvbnMsXG5cdFx0XHRcdFx0ZGVmYXVsdEVudmlyb25tZW50LFxuXHRcdFx0XHRcdGxvZ1NlcnZpY2UsXG5cdFx0XHRcdFx0cHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRcdFx0dHJ1ZVxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdC8vIFNob3VsZCBmYWlsIGR1ZSB0byB1bnN1cHBvcnRlZCBzaGVsbFxuXHRcdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQudHlwZSwgJ2ZhaWx1cmUnKTtcblxuXHRcdFx0XHQvLyBCdXQgdGhlIG5vbmNlIHNob3VsZCBiZSBhdmFpbGFibGUgaW4gdGhlIHByb2Nlc3Mgb3B0aW9ucyBmb3IgdGhlIHRlcm1pbmFsIHByb2Nlc3MgdG8gdXNlXG5cdFx0XHRcdHN0cmljdEVxdWFsKGN1c3RvbVByb2Nlc3NPcHRpb25zLnNoZWxsSW50ZWdyYXRpb24ubm9uY2UsICdjdXN0b20tbm9uY2UtMTIzNDUnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2FuaXRpemVFbnZGb3JMb2dnaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciB1bmRlZmluZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzYW5pdGl6ZUVudkZvckxvZ2dpbmcodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gZW1wdHkgb2JqZWN0IGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzYW5pdGl6ZUVudkZvckxvZ2dpbmcoe30pLCB7fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcGFzcyB0aHJvdWdoIG5vbi1zZW5zaXRpdmUgdmFsdWVzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNhbml0aXplRW52Rm9yTG9nZ2luZyh7XG5cdFx0XHRcdFBBVEg6ICcvdXNyL2JpbicsXG5cdFx0XHRcdEhPTUU6ICcvaG9tZS91c2VyJyxcblx0XHRcdFx0VEVSTTogJ3h0ZXJtLTI1NmNvbG9yJ1xuXHRcdFx0fSksIHtcblx0XHRcdFx0UEFUSDogJy91c3IvYmluJyxcblx0XHRcdFx0SE9NRTogJy9ob21lL3VzZXInLFxuXHRcdFx0XHRURVJNOiAneHRlcm0tMjU2Y29sb3InXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZWRhY3Qgc2Vuc2l0aXZlIGVudiB2YXIgbmFtZXMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2FuaXRpemVFbnZGb3JMb2dnaW5nKHtcblx0XHRcdFx0QVBJX0tFWTogJ3NlY3JldDEyMycsXG5cdFx0XHRcdEdJVEhVQl9UT0tFTjogJ2docF94eHh4Jyxcblx0XHRcdFx0TVlfU0VDUkVUOiAnaGlkZGVuJyxcblx0XHRcdFx0UEFTU1dPUkQ6ICdwYXNzMTIzJyxcblx0XHRcdFx0QVdTX0FDQ0VTU19LRVk6ICdBS0lBLi4uJyxcblx0XHRcdFx0REFUQUJBU0VfUEFTU1dPUkQ6ICdkYnBhc3MnLFxuXHRcdFx0XHRDTElFTlRfU0VDUkVUOiAnY2xpZW50X3NlY3JldF92YWx1ZScsXG5cdFx0XHRcdEFVVEhfVE9LRU46ICdhdXRoX3ZhbHVlJyxcblx0XHRcdFx0UFJJVkFURV9LRVk6ICdwcml2YXRlX2tleV92YWx1ZSdcblx0XHRcdH0pLCB7XG5cdFx0XHRcdEFQSV9LRVk6ICc8UkVEQUNURUQ+Jyxcblx0XHRcdFx0R0lUSFVCX1RPS0VOOiAnPFJFREFDVEVEPicsXG5cdFx0XHRcdE1ZX1NFQ1JFVDogJzxSRURBQ1RFRD4nLFxuXHRcdFx0XHRQQVNTV09SRDogJzxSRURBQ1RFRD4nLFxuXHRcdFx0XHRBV1NfQUNDRVNTX0tFWTogJzxSRURBQ1RFRD4nLFxuXHRcdFx0XHREQVRBQkFTRV9QQVNTV09SRDogJzxSRURBQ1RFRD4nLFxuXHRcdFx0XHRDTElFTlRfU0VDUkVUOiAnPFJFREFDVEVEPicsXG5cdFx0XHRcdEFVVEhfVE9LRU46ICc8UkVEQUNURUQ+Jyxcblx0XHRcdFx0UFJJVkFURV9LRVk6ICc8UkVEQUNURUQ+J1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVkYWN0IEpXVCB0b2tlbnMgYnkgdmFsdWUgcGF0dGVybicsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChzYW5pdGl6ZUVudkZvckxvZ2dpbmcoe1xuXHRcdFx0XHRTT01FX1ZBUjogJ2V5SmhiR2NpT2lKSVV6STFOaUlzSW5SNWNDSTZJa3BYVkNKOS5leUp6ZFdJaU9pSXhNak0wTlRZM09Ea3dJbjAuZG96amdOcnlQNEozalZtTkhsMHc1Tl9YZ0wwbjNJOVBsRlVQMFRIc1I4VSdcblx0XHRcdH0pLCB7XG5cdFx0XHRcdFNPTUVfVkFSOiAnPFJFREFDVEVEPidcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlZGFjdCBHaXRIdWIgdG9rZW5zIGJ5IHZhbHVlIHBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2FuaXRpemVFbnZGb3JMb2dnaW5nKHtcblx0XHRcdFx0TVlfR0g6ICdnaHBfeHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4J1xuXHRcdFx0fSksIHtcblx0XHRcdFx0TVlfR0g6ICc8UkVEQUNURUQ+J1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmVkYWN0IEdvb2dsZSBBUEkga2V5cyBieSB2YWx1ZSBwYXR0ZXJuJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNhbml0aXplRW52Rm9yTG9nZ2luZyh7XG5cdFx0XHRcdEdPT0dMRV9LRVk6ICdBSXphU3lEYUdtV0thNEpzWFotSGpHdzdJU0xuXzNuYW1CR2V3UWUnXG5cdFx0XHR9KSwge1xuXHRcdFx0XHRHT09HTEVfS0VZOiAnPFJFREFDVEVEPidcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlZGFjdCBsb25nIGFscGhhbnVtZXJpYyBzdHJpbmdzIChwb3RlbnRpYWwgc2VjcmV0cyknLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoc2FuaXRpemVFbnZGb3JMb2dnaW5nKHtcblx0XHRcdFx0TE9OR19WQUxVRTogJ2FiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6MTIzNDU2J1xuXHRcdFx0fSksIHtcblx0XHRcdFx0TE9OR19WQUxVRTogJzxSRURBQ1RFRD4nXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBza2lwIHVuZGVmaW5lZCB2YWx1ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnY6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIHwgdW5kZWZpbmVkIH0gPSB7XG5cdFx0XHRcdERFRklORUQ6ICd2YWx1ZScsXG5cdFx0XHRcdFVOREVGSU5FRDogdW5kZWZpbmVkXG5cdFx0XHR9O1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHNhbml0aXplRW52Rm9yTG9nZ2luZyhlbnYpLCB7XG5cdFx0XHRcdERFRklORUQ6ICd2YWx1ZSdcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDakQsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUyxTQUFTLFFBQVEsZ0JBQWdCO0FBQzFDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUcvQixTQUFTLDhCQUF3Ryw2QkFBNkI7QUFDOUksU0FBUyxpQ0FBaUM7QUFFMUMsTUFBTSx3QkFBaUQsRUFBRSxrQkFBa0IsRUFBRSxTQUFTLE1BQU0sZ0JBQWdCLE9BQU8sT0FBTyxHQUFHLEdBQUcscUJBQXFCLE9BQU8sZ0NBQWdDLFFBQVcsaUJBQWlCLFFBQVcseUJBQXlCLE1BQU07QUFDbFEsTUFBTSx5QkFBa0QsRUFBRSxrQkFBa0IsRUFBRSxTQUFTLE9BQU8sZ0JBQWdCLE9BQU8sT0FBTyxHQUFHLEdBQUcscUJBQXFCLE9BQU8sZ0NBQWdD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
