import { deepStrictEqual, strictEqual } from "assert";
import { isWindows, OperatingSystem } from "../../../../../base/common/platform.js";
import { URI as Uri } from "../../../../../base/common/uri.js";
import { addTerminalEnvironmentKeys, createTerminalEnvironment, getUriLabelForShell, getCwd, getLangEnvVariable, getWorkspaceForTerminal, mergeEnvironments, preparePathForShell, shouldSetLangEnvVariable } from "../../common/terminalEnvironment.js";
import { GeneralShellType, PosixShellType, WindowsShellType } from "../../../../../platform/terminal/common/terminal.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestContextService, TestHistoryService } from "../../../../test/common/workbenchTestServices.js";
import { testWorkspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
const wslPathBackend = {
  getWslPath: async (original, direction) => {
    if (direction === "unix-to-win") {
      const match2 = original.match(/^\/mnt\/(?<drive>[a-zA-Z])\/(?<path>.+)$/);
      const groups2 = match2?.groups;
      if (!groups2) {
        return original;
      }
      return `${groups2.drive}:\\${groups2.path.replace(/\//g, "\\")}`;
    }
    const match = original.match(/(?<drive>[a-zA-Z]):\\(?<path>.+)/);
    const groups = match?.groups;
    if (!groups) {
      return original;
    }
    return `/mnt/${groups.drive.toLowerCase()}/${groups.path.replace(/\\/g, "/")}`;
  }
};
suite("Workbench - TerminalEnvironment", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("addTerminalEnvironmentKeys", () => {
    test("should set expected variables", () => {
      const env = {};
      addTerminalEnvironmentKeys(env, "1.2.3", "en", "on");
      strictEqual(env["TERM_PROGRAM"], "vscode");
      strictEqual(env["TERM_PROGRAM_VERSION"], "1.2.3");
      strictEqual(env["COLORTERM"], "truecolor");
      strictEqual(env["LANG"], "en_US.UTF-8");
    });
    test("should use language variant for LANG that is provided in locale", () => {
      const env = {};
      addTerminalEnvironmentKeys(env, "1.2.3", "en-au", "on");
      strictEqual(env["LANG"], "en_AU.UTF-8", "LANG is equal to the requested locale with UTF-8");
    });
    test("should fallback to en_US when no locale is provided", () => {
      const env2 = { FOO: "bar" };
      addTerminalEnvironmentKeys(env2, "1.2.3", void 0, "on");
      strictEqual(env2["LANG"], "en_US.UTF-8", "LANG is equal to en_US.UTF-8 as fallback.");
    });
    test("should fallback to en_US when an invalid locale is provided", () => {
      const env3 = { LANG: "replace" };
      addTerminalEnvironmentKeys(env3, "1.2.3", void 0, "on");
      strictEqual(env3["LANG"], "en_US.UTF-8", "LANG is set to the fallback LANG");
    });
    test("should override existing LANG", () => {
      const env4 = { LANG: "en_AU.UTF-8" };
      addTerminalEnvironmentKeys(env4, "1.2.3", void 0, "on");
      strictEqual(env4["LANG"], "en_US.UTF-8", "LANG is equal to the parent environment's LANG");
    });
  });
  suite("shouldSetLangEnvVariable", () => {
    test("auto", () => {
      strictEqual(shouldSetLangEnvVariable({}, "auto"), true);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US" }, "auto"), true);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.utf" }, "auto"), true);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.utf8" }, "auto"), false);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.UTF-8" }, "auto"), false);
    });
    test("off", () => {
      strictEqual(shouldSetLangEnvVariable({}, "off"), false);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US" }, "off"), false);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.utf" }, "off"), false);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.utf8" }, "off"), false);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.UTF-8" }, "off"), false);
    });
    test("on", () => {
      strictEqual(shouldSetLangEnvVariable({}, "on"), true);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US" }, "on"), true);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.utf" }, "on"), true);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.utf8" }, "on"), true);
      strictEqual(shouldSetLangEnvVariable({ LANG: "en-US.UTF-8" }, "on"), true);
    });
  });
  suite("getLangEnvVariable", () => {
    test("should fallback to en_US when no locale is provided", () => {
      strictEqual(getLangEnvVariable(void 0), "en_US.UTF-8");
      strictEqual(getLangEnvVariable(""), "en_US.UTF-8");
    });
    test("should fallback to default language variants when variant isn't provided", () => {
      strictEqual(getLangEnvVariable("af"), "af_ZA.UTF-8");
      strictEqual(getLangEnvVariable("am"), "am_ET.UTF-8");
      strictEqual(getLangEnvVariable("be"), "be_BY.UTF-8");
      strictEqual(getLangEnvVariable("bg"), "bg_BG.UTF-8");
      strictEqual(getLangEnvVariable("ca"), "ca_ES.UTF-8");
      strictEqual(getLangEnvVariable("cs"), "cs_CZ.UTF-8");
      strictEqual(getLangEnvVariable("da"), "da_DK.UTF-8");
      strictEqual(getLangEnvVariable("de"), "de_DE.UTF-8");
      strictEqual(getLangEnvVariable("el"), "el_GR.UTF-8");
      strictEqual(getLangEnvVariable("en"), "en_US.UTF-8");
      strictEqual(getLangEnvVariable("es"), "es_ES.UTF-8");
      strictEqual(getLangEnvVariable("et"), "et_EE.UTF-8");
      strictEqual(getLangEnvVariable("eu"), "eu_ES.UTF-8");
      strictEqual(getLangEnvVariable("fi"), "fi_FI.UTF-8");
      strictEqual(getLangEnvVariable("fr"), "fr_FR.UTF-8");
      strictEqual(getLangEnvVariable("he"), "he_IL.UTF-8");
      strictEqual(getLangEnvVariable("hr"), "hr_HR.UTF-8");
      strictEqual(getLangEnvVariable("hu"), "hu_HU.UTF-8");
      strictEqual(getLangEnvVariable("hy"), "hy_AM.UTF-8");
      strictEqual(getLangEnvVariable("is"), "is_IS.UTF-8");
      strictEqual(getLangEnvVariable("it"), "it_IT.UTF-8");
      strictEqual(getLangEnvVariable("ja"), "ja_JP.UTF-8");
      strictEqual(getLangEnvVariable("kk"), "kk_KZ.UTF-8");
      strictEqual(getLangEnvVariable("ko"), "ko_KR.UTF-8");
      strictEqual(getLangEnvVariable("lt"), "lt_LT.UTF-8");
      strictEqual(getLangEnvVariable("nl"), "nl_NL.UTF-8");
      strictEqual(getLangEnvVariable("no"), "no_NO.UTF-8");
      strictEqual(getLangEnvVariable("pl"), "pl_PL.UTF-8");
      strictEqual(getLangEnvVariable("pt"), "pt_BR.UTF-8");
      strictEqual(getLangEnvVariable("ro"), "ro_RO.UTF-8");
      strictEqual(getLangEnvVariable("ru"), "ru_RU.UTF-8");
      strictEqual(getLangEnvVariable("sk"), "sk_SK.UTF-8");
      strictEqual(getLangEnvVariable("sl"), "sl_SI.UTF-8");
      strictEqual(getLangEnvVariable("sr"), "sr_YU.UTF-8");
      strictEqual(getLangEnvVariable("sv"), "sv_SE.UTF-8");
      strictEqual(getLangEnvVariable("tr"), "tr_TR.UTF-8");
      strictEqual(getLangEnvVariable("uk"), "uk_UA.UTF-8");
      strictEqual(getLangEnvVariable("zh"), "zh_CN.UTF-8");
    });
    test("should set language variant based on full locale", () => {
      strictEqual(getLangEnvVariable("en-AU"), "en_AU.UTF-8");
      strictEqual(getLangEnvVariable("en-au"), "en_AU.UTF-8");
      strictEqual(getLangEnvVariable("fa-ke"), "fa_KE.UTF-8");
    });
  });
  suite("mergeEnvironments", () => {
    test("should add keys", () => {
      const parent = {
        a: "b"
      };
      const other = {
        c: "d"
      };
      mergeEnvironments(parent, other);
      deepStrictEqual(parent, {
        a: "b",
        c: "d"
      });
    });
    (!isWindows ? test.skip : test)("should add keys ignoring case on Windows", () => {
      const parent = {
        a: "b"
      };
      const other = {
        A: "c"
      };
      mergeEnvironments(parent, other);
      deepStrictEqual(parent, {
        a: "c"
      });
    });
    test("null values should delete keys from the parent env", () => {
      const parent = {
        a: "b",
        c: "d"
      };
      const other = {
        a: null
      };
      mergeEnvironments(parent, other);
      deepStrictEqual(parent, {
        c: "d"
      });
    });
    (!isWindows ? test.skip : test)("null values should delete keys from the parent env ignoring case on Windows", () => {
      const parent = {
        a: "b",
        c: "d"
      };
      const other = {
        A: null
      };
      mergeEnvironments(parent, other);
      deepStrictEqual(parent, {
        c: "d"
      });
    });
  });
  suite("getCwd", () => {
    function assertPathsMatch(a, b) {
      strictEqual(Uri.file(a).fsPath, Uri.file(b).fsPath);
    }
    test("should default to userHome for an empty workspace", async () => {
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, void 0, void 0), "/userHome/");
    });
    test("should use to the workspace if it exists", async () => {
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, Uri.file("/foo"), void 0), "/foo");
    });
    test("should use an absolute custom cwd as is", async () => {
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, void 0, "/foo"), "/foo");
    });
    test("should normalize a relative custom cwd against the workspace path", async () => {
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, Uri.file("/bar"), "foo"), "/bar/foo");
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, Uri.file("/bar"), "./foo"), "/bar/foo");
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, Uri.file("/bar"), "../foo"), "/foo");
    });
    test("should fall back for relative a custom cwd that doesn't have a workspace", async () => {
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, void 0, "foo"), "/userHome/");
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, void 0, "./foo"), "/userHome/");
      assertPathsMatch(await getCwd({ executable: void 0, args: [] }, "/userHome/", void 0, void 0, "../foo"), "/userHome/");
    });
    test("should ignore custom cwd when told to ignore", async () => {
      assertPathsMatch(await getCwd({ executable: void 0, args: [], ignoreConfigurationCwd: true }, "/userHome/", void 0, Uri.file("/bar"), "/foo"), "/bar");
    });
  });
  suite("preparePathForShell", () => {
    suite("Windows frontend, Windows backend", () => {
      test("Command Prompt", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "cmd", "cmd", WindowsShellType.CommandPrompt, wslPathBackend, OperatingSystem.Windows, true), `c:\\foo\\bar`);
        strictEqual(await preparePathForShell("c:\\foo\\bar'baz", "cmd", "cmd", WindowsShellType.CommandPrompt, wslPathBackend, OperatingSystem.Windows, true), `c:\\foo\\bar'baz`);
        strictEqual(await preparePathForShell("c:\\foo\\bar$(echo evil)baz", "cmd", "cmd", WindowsShellType.CommandPrompt, wslPathBackend, OperatingSystem.Windows, true), `"c:\\foo\\bar$(echo evil)baz"`);
      });
      test("PowerShell", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "pwsh", "pwsh", GeneralShellType.PowerShell, wslPathBackend, OperatingSystem.Windows, true), `c:\\foo\\bar`);
        strictEqual(await preparePathForShell("c:\\foo\\bar'baz", "pwsh", "pwsh", GeneralShellType.PowerShell, wslPathBackend, OperatingSystem.Windows, true), `& 'c:\\foo\\bar''baz'`);
        strictEqual(await preparePathForShell("c:\\foo\\bar$(echo evil)baz", "pwsh", "pwsh", GeneralShellType.PowerShell, wslPathBackend, OperatingSystem.Windows, true), `& 'c:\\foo\\bar$(echo evil)baz'`);
      });
      test("Git Bash", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "bash", "bash", WindowsShellType.GitBash, wslPathBackend, OperatingSystem.Windows, true), `'c:/foo/bar'`);
        strictEqual(await preparePathForShell("c:\\foo\\bar'baz", "bash", "bash", WindowsShellType.GitBash, wslPathBackend, OperatingSystem.Windows, true), `'c:/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("c:\\foo\\bar$(echo evil)baz", "bash", "bash", WindowsShellType.GitBash, wslPathBackend, OperatingSystem.Windows, true), `'c:/foo/bar(echo evil)baz'`);
      });
      test("WSL", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "bash", "bash", WindowsShellType.Wsl, wslPathBackend, OperatingSystem.Windows, true), "/mnt/c/foo/bar");
      });
    });
    suite("Windows frontend, Linux backend", () => {
      test("Bash", async () => {
        strictEqual(await preparePathForShell("/foo/bar", "bash", "bash", PosixShellType.Bash, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar'`);
        strictEqual(await preparePathForShell("/foo/bar'baz", "bash", "bash", PosixShellType.Bash, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("/foo/bar$(echo evil)baz", "bash", "bash", PosixShellType.Bash, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar(echo evil)baz'`);
      });
      test("Zsh", async () => {
        strictEqual(await preparePathForShell("/foo/bar", "zsh", "zsh", PosixShellType.Zsh, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar'`);
        strictEqual(await preparePathForShell("/foo/bar'baz", "zsh", "zsh", PosixShellType.Zsh, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("/foo/bar$(echo evil)baz", "zsh", "zsh", PosixShellType.Zsh, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar(echo evil)baz'`);
      });
      test("Fish", async () => {
        strictEqual(await preparePathForShell("/foo/bar", "fish", "fish", PosixShellType.Fish, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar'`);
        strictEqual(await preparePathForShell("/foo/bar'baz", "fish", "fish", PosixShellType.Fish, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("/foo/bar$(echo evil)baz", "fish", "fish", PosixShellType.Fish, wslPathBackend, OperatingSystem.Linux, true), `'/foo/bar(echo evil)baz'`);
      });
    });
    suite("Linux frontend, Windows backend", () => {
      test("Command Prompt", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "cmd", "cmd", WindowsShellType.CommandPrompt, wslPathBackend, OperatingSystem.Windows, false), `c:\\foo\\bar`);
        strictEqual(await preparePathForShell("c:\\foo\\bar'baz", "cmd", "cmd", WindowsShellType.CommandPrompt, wslPathBackend, OperatingSystem.Windows, false), `c:\\foo\\bar'baz`);
        strictEqual(await preparePathForShell("c:\\foo\\bar$(echo evil)baz", "cmd", "cmd", WindowsShellType.CommandPrompt, wslPathBackend, OperatingSystem.Windows, false), `"c:\\foo\\bar$(echo evil)baz"`);
      });
      test("PowerShell", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "pwsh", "pwsh", GeneralShellType.PowerShell, wslPathBackend, OperatingSystem.Windows, false), `c:\\foo\\bar`);
        strictEqual(await preparePathForShell("c:\\foo\\bar'baz", "pwsh", "pwsh", GeneralShellType.PowerShell, wslPathBackend, OperatingSystem.Windows, false), `& 'c:\\foo\\bar''baz'`);
        strictEqual(await preparePathForShell("c:\\foo\\bar$(echo evil)baz", "pwsh", "pwsh", GeneralShellType.PowerShell, wslPathBackend, OperatingSystem.Windows, false), `& 'c:\\foo\\bar$(echo evil)baz'`);
      });
      test("Git Bash", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "bash", "bash", WindowsShellType.GitBash, wslPathBackend, OperatingSystem.Windows, false), `'c:/foo/bar'`);
        strictEqual(await preparePathForShell("c:\\foo\\bar'baz", "bash", "bash", WindowsShellType.GitBash, wslPathBackend, OperatingSystem.Windows, false), `'c:/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("c:\\foo\\bar$(echo evil)baz", "bash", "bash", WindowsShellType.GitBash, wslPathBackend, OperatingSystem.Windows, false), `'c:/foo/bar(echo evil)baz'`);
      });
      test("WSL", async () => {
        strictEqual(await preparePathForShell("c:\\foo\\bar", "bash", "bash", WindowsShellType.Wsl, wslPathBackend, OperatingSystem.Windows, false), "/mnt/c/foo/bar");
      });
    });
    suite("Linux frontend, Linux backend", () => {
      test("Bash", async () => {
        strictEqual(await preparePathForShell("/foo/bar", "bash", "bash", PosixShellType.Bash, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar'`);
        strictEqual(await preparePathForShell("/foo/bar'baz", "bash", "bash", PosixShellType.Bash, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("/foo/bar$(echo evil)baz", "bash", "bash", PosixShellType.Bash, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar(echo evil)baz'`);
      });
      test("Zsh", async () => {
        strictEqual(await preparePathForShell("/foo/bar", "zsh", "zsh", PosixShellType.Zsh, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar'`);
        strictEqual(await preparePathForShell("/foo/bar'baz", "zsh", "zsh", PosixShellType.Zsh, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("/foo/bar$(echo evil)baz", "zsh", "zsh", PosixShellType.Zsh, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar(echo evil)baz'`);
      });
      test("Fish", async () => {
        strictEqual(await preparePathForShell("/foo/bar", "fish", "fish", PosixShellType.Fish, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar'`);
        strictEqual(await preparePathForShell("/foo/bar'baz", "fish", "fish", PosixShellType.Fish, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar\\'baz'`);
        strictEqual(await preparePathForShell("/foo/bar$(echo evil)baz", "fish", "fish", PosixShellType.Fish, wslPathBackend, OperatingSystem.Linux, false), `'/foo/bar(echo evil)baz'`);
      });
    });
  });
  suite("createTerminalEnvironment", () => {
    const commonVariables = {
      COLORTERM: "truecolor",
      TERM_PROGRAM: "vscode"
    };
    test("should retain variables equal to the empty string", async () => {
      deepStrictEqual(
        await createTerminalEnvironment({}, void 0, void 0, void 0, "off", { foo: "bar", empty: "" }),
        { foo: "bar", empty: "", ...commonVariables }
      );
    });
  });
  suite("getWorkspaceForTerminal", () => {
    test("should resolve workspace folder from cwd, not last active workspace", () => {
      const folderA = Uri.file("/workspace/proj1");
      const folderB = Uri.file("/workspace/proj2");
      const contextService = new TestContextService(testWorkspace(folderA, folderB));
      const historyService = new TestHistoryService(folderA);
      const result = getWorkspaceForTerminal(folderB, contextService, historyService);
      strictEqual(result?.uri.fsPath, folderB.fsPath);
    });
    test("should fall back to last active workspace when cwd is not in any workspace folder", () => {
      const folderA = Uri.file("/workspace/proj1");
      const contextService = new TestContextService(testWorkspace(folderA));
      const historyService = new TestHistoryService(folderA);
      const result = getWorkspaceForTerminal(Uri.file("/other/path"), contextService, historyService);
      strictEqual(result?.uri.fsPath, folderA.fsPath);
    });
    test("should fall back to last active workspace when cwd is undefined", () => {
      const folderA = Uri.file("/workspace/proj1");
      const contextService = new TestContextService(testWorkspace(folderA));
      const historyService = new TestHistoryService(folderA);
      strictEqual(getWorkspaceForTerminal(void 0, contextService, historyService)?.uri.fsPath, folderA.fsPath);
    });
    test("should return undefined when cwd and history are both unavailable", () => {
      const contextService = new TestContextService(testWorkspace(Uri.file("/workspace/proj1")));
      const historyService = new TestHistoryService(void 0);
      strictEqual(getWorkspaceForTerminal(void 0, contextService, historyService), void 0);
    });
  });
  suite("formatUriForShellDisplay", () => {
    test("Wsl", async () => {
      strictEqual(await getUriLabelForShell("c:\\foo\\bar", wslPathBackend, WindowsShellType.Wsl, OperatingSystem.Windows, true), "/mnt/c/foo/bar");
      strictEqual(await getUriLabelForShell("c:/foo/bar", wslPathBackend, WindowsShellType.Wsl, OperatingSystem.Windows, false), "/mnt/c/foo/bar");
    });
    test("GitBash", async () => {
      strictEqual(await getUriLabelForShell("c:\\foo\\bar", wslPathBackend, WindowsShellType.GitBash, OperatingSystem.Windows, true), "/c/foo/bar");
      strictEqual(await getUriLabelForShell("c:/foo/bar", wslPathBackend, WindowsShellType.GitBash, OperatingSystem.Windows, false), "/c/foo/bar");
    });
    suite("PowerShell", () => {
      test("Windows frontend", async () => {
        strictEqual(await getUriLabelForShell("c:\\foo\\bar", wslPathBackend, GeneralShellType.PowerShell, OperatingSystem.Windows, true), "c:\\foo\\bar");
        strictEqual(await getUriLabelForShell("C:\\Foo\\Bar", wslPathBackend, GeneralShellType.PowerShell, OperatingSystem.Windows, true), "C:\\Foo\\Bar");
      });
      test("Non-Windows frontend", async () => {
        strictEqual(await getUriLabelForShell("c:/foo/bar", wslPathBackend, GeneralShellType.PowerShell, OperatingSystem.Windows, false), "c:\\foo\\bar");
        strictEqual(await getUriLabelForShell("C:/Foo/Bar", wslPathBackend, GeneralShellType.PowerShell, OperatingSystem.Windows, false), "C:\\Foo\\Bar");
      });
    });
    suite("Bash", () => {
      test("Windows frontend", async () => {
        strictEqual(await getUriLabelForShell("\\foo\\bar", wslPathBackend, PosixShellType.Bash, OperatingSystem.Linux, true), "/foo/bar");
        strictEqual(await getUriLabelForShell("/foo/bar", wslPathBackend, PosixShellType.Bash, OperatingSystem.Linux, true), "/foo/bar");
      });
      test("Non-Windows frontend", async () => {
        strictEqual(await getUriLabelForShell("\\foo\\bar", wslPathBackend, PosixShellType.Bash, OperatingSystem.Linux, false), "\\foo\\bar");
        strictEqual(await getUriLabelForShell("/foo/bar", wslPathBackend, PosixShellType.Bash, OperatingSystem.Linux, false), "/foo/bar");
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxjb21tb25cXHRlcm1pbmFsRW52aXJvbm1lbnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSBhcyBVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgYWRkVGVybWluYWxFbnZpcm9ubWVudEtleXMsIGNyZWF0ZVRlcm1pbmFsRW52aXJvbm1lbnQsIGdldFVyaUxhYmVsRm9yU2hlbGwsIGdldEN3ZCwgZ2V0TGFuZ0VudlZhcmlhYmxlLCBnZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbCwgbWVyZ2VFbnZpcm9ubWVudHMsIHByZXBhcmVQYXRoRm9yU2hlbGwsIHNob3VsZFNldExhbmdFbnZWYXJpYWJsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEdlbmVyYWxTaGVsbFR5cGUsIFBvc2l4U2hlbGxUeXBlLCBXaW5kb3dzU2hlbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlLCBUZXN0SGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgdGVzdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcblxuY29uc3Qgd3NsUGF0aEJhY2tlbmQgPSB7XG5cdGdldFdzbFBhdGg6IGFzeW5jIChvcmlnaW5hbDogc3RyaW5nLCBkaXJlY3Rpb246ICd1bml4LXRvLXdpbicgfCAnd2luLXRvLXVuaXgnKSA9PiB7XG5cdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ3VuaXgtdG8td2luJykge1xuXHRcdFx0Y29uc3QgbWF0Y2ggPSBvcmlnaW5hbC5tYXRjaCgvXlxcL21udFxcLyg/PGRyaXZlPlthLXpBLVpdKVxcLyg/PHBhdGg+LispJC8pO1xuXHRcdFx0Y29uc3QgZ3JvdXBzID0gbWF0Y2g/Lmdyb3Vwcztcblx0XHRcdGlmICghZ3JvdXBzKSB7XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBgJHtncm91cHMuZHJpdmV9OlxcXFwke2dyb3Vwcy5wYXRoLnJlcGxhY2UoL1xcLy9nLCAnXFxcXCcpfWA7XG5cdFx0fVxuXHRcdGNvbnN0IG1hdGNoID0gb3JpZ2luYWwubWF0Y2goLyg/PGRyaXZlPlthLXpBLVpdKTpcXFxcKD88cGF0aD4uKykvKTtcblx0XHRjb25zdCBncm91cHMgPSBtYXRjaD8uZ3JvdXBzO1xuXHRcdGlmICghZ3JvdXBzKSB7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWw7XG5cdFx0fVxuXHRcdHJldHVybiBgL21udC8ke2dyb3Vwcy5kcml2ZS50b0xvd2VyQ2FzZSgpfS8ke2dyb3Vwcy5wYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKX1gO1xuXHR9XG59O1xuXG5zdWl0ZSgnV29ya2JlbmNoIC0gVGVybWluYWxFbnZpcm9ubWVudCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2FkZFRlcm1pbmFsRW52aXJvbm1lbnRLZXlzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBzZXQgZXhwZWN0ZWQgdmFyaWFibGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW52OiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge307XG5cdFx0XHRhZGRUZXJtaW5hbEVudmlyb25tZW50S2V5cyhlbnYsICcxLjIuMycsICdlbicsICdvbicpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZW52WydURVJNX1BST0dSQU0nXSwgJ3ZzY29kZScpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZW52WydURVJNX1BST0dSQU1fVkVSU0lPTiddLCAnMS4yLjMnKTtcblx0XHRcdHN0cmljdEVxdWFsKGVudlsnQ09MT1JURVJNJ10sICd0cnVlY29sb3InKTtcblx0XHRcdHN0cmljdEVxdWFsKGVudlsnTEFORyddLCAnZW5fVVMuVVRGLTgnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgdXNlIGxhbmd1YWdlIHZhcmlhbnQgZm9yIExBTkcgdGhhdCBpcyBwcm92aWRlZCBpbiBsb2NhbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnY6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcblx0XHRcdGFkZFRlcm1pbmFsRW52aXJvbm1lbnRLZXlzKGVudiwgJzEuMi4zJywgJ2VuLWF1JywgJ29uJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlbnZbJ0xBTkcnXSwgJ2VuX0FVLlVURi04JywgJ0xBTkcgaXMgZXF1YWwgdG8gdGhlIHJlcXVlc3RlZCBsb2NhbGUgd2l0aCBVVEYtOCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsYmFjayB0byBlbl9VUyB3aGVuIG5vIGxvY2FsZSBpcyBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudjI6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7IEZPTzogJ2JhcicgfTtcblx0XHRcdGFkZFRlcm1pbmFsRW52aXJvbm1lbnRLZXlzKGVudjIsICcxLjIuMycsIHVuZGVmaW5lZCwgJ29uJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlbnYyWydMQU5HJ10sICdlbl9VUy5VVEYtOCcsICdMQU5HIGlzIGVxdWFsIHRvIGVuX1VTLlVURi04IGFzIGZhbGxiYWNrLicpOyAvLyBNb3JlIGluZm8gb24gaXNzdWUgIzE0NTg2XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGZhbGxiYWNrIHRvIGVuX1VTIHdoZW4gYW4gaW52YWxpZCBsb2NhbGUgaXMgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnYzID0geyBMQU5HOiAncmVwbGFjZScgfTtcblx0XHRcdGFkZFRlcm1pbmFsRW52aXJvbm1lbnRLZXlzKGVudjMsICcxLjIuMycsIHVuZGVmaW5lZCwgJ29uJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChlbnYzWydMQU5HJ10sICdlbl9VUy5VVEYtOCcsICdMQU5HIGlzIHNldCB0byB0aGUgZmFsbGJhY2sgTEFORycpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBvdmVycmlkZSBleGlzdGluZyBMQU5HJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW52NCA9IHsgTEFORzogJ2VuX0FVLlVURi04JyB9O1xuXHRcdFx0YWRkVGVybWluYWxFbnZpcm9ubWVudEtleXMoZW52NCwgJzEuMi4zJywgdW5kZWZpbmVkLCAnb24nKTtcblx0XHRcdHN0cmljdEVxdWFsKGVudjRbJ0xBTkcnXSwgJ2VuX1VTLlVURi04JywgJ0xBTkcgaXMgZXF1YWwgdG8gdGhlIHBhcmVudCBlbnZpcm9ubWVudFxcJ3MgTEFORycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2hvdWxkU2V0TGFuZ0VudlZhcmlhYmxlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2F1dG8nLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRTZXRMYW5nRW52VmFyaWFibGUoe30sICdhdXRvJyksIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkU2V0TGFuZ0VudlZhcmlhYmxlKHsgTEFORzogJ2VuLVVTJyB9LCAnYXV0bycpLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZFNldExhbmdFbnZWYXJpYWJsZSh7IExBTkc6ICdlbi1VUy51dGYnIH0sICdhdXRvJyksIHRydWUpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkU2V0TGFuZ0VudlZhcmlhYmxlKHsgTEFORzogJ2VuLVVTLnV0ZjgnIH0sICdhdXRvJyksIGZhbHNlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZFNldExhbmdFbnZWYXJpYWJsZSh7IExBTkc6ICdlbi1VUy5VVEYtOCcgfSwgJ2F1dG8nKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ29mZicsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZFNldExhbmdFbnZWYXJpYWJsZSh7fSwgJ29mZicpLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRTZXRMYW5nRW52VmFyaWFibGUoeyBMQU5HOiAnZW4tVVMnIH0sICdvZmYnKSwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkU2V0TGFuZ0VudlZhcmlhYmxlKHsgTEFORzogJ2VuLVVTLnV0ZicgfSwgJ29mZicpLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRTZXRMYW5nRW52VmFyaWFibGUoeyBMQU5HOiAnZW4tVVMudXRmOCcgfSwgJ29mZicpLCBmYWxzZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRTZXRMYW5nRW52VmFyaWFibGUoeyBMQU5HOiAnZW4tVVMuVVRGLTgnIH0sICdvZmYnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ29uJywgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoc2hvdWxkU2V0TGFuZ0VudlZhcmlhYmxlKHt9LCAnb24nKSwgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRTZXRMYW5nRW52VmFyaWFibGUoeyBMQU5HOiAnZW4tVVMnIH0sICdvbicpLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZFNldExhbmdFbnZWYXJpYWJsZSh7IExBTkc6ICdlbi1VUy51dGYnIH0sICdvbicpLCB0cnVlKTtcblx0XHRcdHN0cmljdEVxdWFsKHNob3VsZFNldExhbmdFbnZWYXJpYWJsZSh7IExBTkc6ICdlbi1VUy51dGY4JyB9LCAnb24nKSwgdHJ1ZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChzaG91bGRTZXRMYW5nRW52VmFyaWFibGUoeyBMQU5HOiAnZW4tVVMuVVRGLTgnIH0sICdvbicpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldExhbmdFbnZWYXJpYWJsZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZmFsbGJhY2sgdG8gZW5fVVMgd2hlbiBubyBsb2NhbGUgaXMgcHJvdmlkZWQnLCAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUodW5kZWZpbmVkKSwgJ2VuX1VTLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJycpLCAnZW5fVVMuVVRGLTgnKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgZmFsbGJhY2sgdG8gZGVmYXVsdCBsYW5ndWFnZSB2YXJpYW50cyB3aGVuIHZhcmlhbnQgaXNuXFwndCBwcm92aWRlZCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnYWYnKSwgJ2FmX1pBLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2FtJyksICdhbV9FVC5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdiZScpLCAnYmVfQlkuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnYmcnKSwgJ2JnX0JHLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2NhJyksICdjYV9FUy5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdjcycpLCAnY3NfQ1ouVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnZGEnKSwgJ2RhX0RLLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2RlJyksICdkZV9ERS5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdlbCcpLCAnZWxfR1IuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnZW4nKSwgJ2VuX1VTLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2VzJyksICdlc19FUy5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdldCcpLCAnZXRfRUUuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnZXUnKSwgJ2V1X0VTLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2ZpJyksICdmaV9GSS5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdmcicpLCAnZnJfRlIuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnaGUnKSwgJ2hlX0lMLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2hyJyksICdocl9IUi5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdodScpLCAnaHVfSFUuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnaHknKSwgJ2h5X0FNLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2lzJyksICdpc19JUy5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdpdCcpLCAnaXRfSVQuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnamEnKSwgJ2phX0pQLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2trJyksICdra19LWi5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdrbycpLCAna29fS1IuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnbHQnKSwgJ2x0X0xULlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ25sJyksICdubF9OTC5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdubycpLCAnbm9fTk8uVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgncGwnKSwgJ3BsX1BMLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ3B0JyksICdwdF9CUi5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdybycpLCAncm9fUk8uVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgncnUnKSwgJ3J1X1JVLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ3NrJyksICdza19TSy5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdzbCcpLCAnc2xfU0kuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnc3InKSwgJ3NyX1lVLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ3N2JyksICdzdl9TRS5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCd0cicpLCAndHJfVFIuVVRGLTgnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgndWsnKSwgJ3VrX1VBLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ3poJyksICd6aF9DTi5VVEYtOCcpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBzZXQgbGFuZ3VhZ2UgdmFyaWFudCBiYXNlZCBvbiBmdWxsIGxvY2FsZScsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGdldExhbmdFbnZWYXJpYWJsZSgnZW4tQVUnKSwgJ2VuX0FVLlVURi04Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRMYW5nRW52VmFyaWFibGUoJ2VuLWF1JyksICdlbl9BVS5VVEYtOCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0TGFuZ0VudlZhcmlhYmxlKCdmYS1rZScpLCAnZmFfS0UuVVRGLTgnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21lcmdlRW52aXJvbm1lbnRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhZGQga2V5cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IHtcblx0XHRcdFx0YTogJ2InXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgb3RoZXIgPSB7XG5cdFx0XHRcdGM6ICdkJ1xuXHRcdFx0fTtcblx0XHRcdG1lcmdlRW52aXJvbm1lbnRzKHBhcmVudCwgb3RoZXIpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHBhcmVudCwge1xuXHRcdFx0XHRhOiAnYicsXG5cdFx0XHRcdGM6ICdkJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQoIWlzV2luZG93cyA/IHRlc3Quc2tpcCA6IHRlc3QpKCdzaG91bGQgYWRkIGtleXMgaWdub3JpbmcgY2FzZSBvbiBXaW5kb3dzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0ge1xuXHRcdFx0XHRhOiAnYidcblx0XHRcdH07XG5cdFx0XHRjb25zdCBvdGhlciA9IHtcblx0XHRcdFx0QTogJ2MnXG5cdFx0XHR9O1xuXHRcdFx0bWVyZ2VFbnZpcm9ubWVudHMocGFyZW50LCBvdGhlcik7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyZW50LCB7XG5cdFx0XHRcdGE6ICdjJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdudWxsIHZhbHVlcyBzaG91bGQgZGVsZXRlIGtleXMgZnJvbSB0aGUgcGFyZW50IGVudicsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IHtcblx0XHRcdFx0YTogJ2InLFxuXHRcdFx0XHRjOiAnZCdcblx0XHRcdH07XG5cdFx0XHRjb25zdCBvdGhlcjogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nIHwgbnVsbD4gPSB7XG5cdFx0XHRcdGE6IG51bGxcblx0XHRcdH07XG5cdFx0XHRtZXJnZUVudmlyb25tZW50cyhwYXJlbnQsIG90aGVyKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJlbnQsIHtcblx0XHRcdFx0YzogJ2QnXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdCghaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ251bGwgdmFsdWVzIHNob3VsZCBkZWxldGUga2V5cyBmcm9tIHRoZSBwYXJlbnQgZW52IGlnbm9yaW5nIGNhc2Ugb24gV2luZG93cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IHtcblx0XHRcdFx0YTogJ2InLFxuXHRcdFx0XHRjOiAnZCdcblx0XHRcdH07XG5cdFx0XHRjb25zdCBvdGhlcjogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nIHwgbnVsbD4gPSB7XG5cdFx0XHRcdEE6IG51bGxcblx0XHRcdH07XG5cdFx0XHRtZXJnZUVudmlyb25tZW50cyhwYXJlbnQsIG90aGVyKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChwYXJlbnQsIHtcblx0XHRcdFx0YzogJ2QnXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldEN3ZCcsICgpID0+IHtcblx0XHQvLyBUaGlzIGhlbHBlciBjaGVja3MgdGhlIHBhdGhzIGluIGEgY3Jvc3MtcGxhdGZvcm0gZnJpZW5kbHkgbWFubmVyXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0UGF0aHNNYXRjaChhOiBzdHJpbmcsIGI6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0c3RyaWN0RXF1YWwoVXJpLmZpbGUoYSkuZnNQYXRoLCBVcmkuZmlsZShiKS5mc1BhdGgpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBkZWZhdWx0IHRvIHVzZXJIb21lIGZvciBhbiBlbXB0eSB3b3Jrc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnRQYXRoc01hdGNoKGF3YWl0IGdldEN3ZCh7IGV4ZWN1dGFibGU6IHVuZGVmaW5lZCwgYXJnczogW10gfSwgJy91c2VySG9tZS8nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgJy91c2VySG9tZS8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgdG8gdGhlIHdvcmtzcGFjZSBpZiBpdCBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnRQYXRoc01hdGNoKGF3YWl0IGdldEN3ZCh7IGV4ZWN1dGFibGU6IHVuZGVmaW5lZCwgYXJnczogW10gfSwgJy91c2VySG9tZS8nLCB1bmRlZmluZWQsIFVyaS5maWxlKCcvZm9vJyksIHVuZGVmaW5lZCksICcvZm9vJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdXNlIGFuIGFic29sdXRlIGN1c3RvbSBjd2QgYXMgaXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnRQYXRoc01hdGNoKGF3YWl0IGdldEN3ZCh7IGV4ZWN1dGFibGU6IHVuZGVmaW5lZCwgYXJnczogW10gfSwgJy91c2VySG9tZS8nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgJy9mb28nKSwgJy9mb28nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3JtYWxpemUgYSByZWxhdGl2ZSBjdXN0b20gY3dkIGFnYWluc3QgdGhlIHdvcmtzcGFjZSBwYXRoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0UGF0aHNNYXRjaChhd2FpdCBnZXRDd2QoeyBleGVjdXRhYmxlOiB1bmRlZmluZWQsIGFyZ3M6IFtdIH0sICcvdXNlckhvbWUvJywgdW5kZWZpbmVkLCBVcmkuZmlsZSgnL2JhcicpLCAnZm9vJyksICcvYmFyL2ZvbycpO1xuXHRcdFx0YXNzZXJ0UGF0aHNNYXRjaChhd2FpdCBnZXRDd2QoeyBleGVjdXRhYmxlOiB1bmRlZmluZWQsIGFyZ3M6IFtdIH0sICcvdXNlckhvbWUvJywgdW5kZWZpbmVkLCBVcmkuZmlsZSgnL2JhcicpLCAnLi9mb28nKSwgJy9iYXIvZm9vJyk7XG5cdFx0XHRhc3NlcnRQYXRoc01hdGNoKGF3YWl0IGdldEN3ZCh7IGV4ZWN1dGFibGU6IHVuZGVmaW5lZCwgYXJnczogW10gfSwgJy91c2VySG9tZS8nLCB1bmRlZmluZWQsIFVyaS5maWxlKCcvYmFyJyksICcuLi9mb28nKSwgJy9mb28nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgZm9yIHJlbGF0aXZlIGEgY3VzdG9tIGN3ZCB0aGF0IGRvZXNuXFwndCBoYXZlIGEgd29ya3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0UGF0aHNNYXRjaChhd2FpdCBnZXRDd2QoeyBleGVjdXRhYmxlOiB1bmRlZmluZWQsIGFyZ3M6IFtdIH0sICcvdXNlckhvbWUvJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsICdmb28nKSwgJy91c2VySG9tZS8nKTtcblx0XHRcdGFzc2VydFBhdGhzTWF0Y2goYXdhaXQgZ2V0Q3dkKHsgZXhlY3V0YWJsZTogdW5kZWZpbmVkLCBhcmdzOiBbXSB9LCAnL3VzZXJIb21lLycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnLi9mb28nKSwgJy91c2VySG9tZS8nKTtcblx0XHRcdGFzc2VydFBhdGhzTWF0Y2goYXdhaXQgZ2V0Q3dkKHsgZXhlY3V0YWJsZTogdW5kZWZpbmVkLCBhcmdzOiBbXSB9LCAnL3VzZXJIb21lLycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnLi4vZm9vJyksICcvdXNlckhvbWUvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaWdub3JlIGN1c3RvbSBjd2Qgd2hlbiB0b2xkIHRvIGlnbm9yZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydFBhdGhzTWF0Y2goYXdhaXQgZ2V0Q3dkKHsgZXhlY3V0YWJsZTogdW5kZWZpbmVkLCBhcmdzOiBbXSwgaWdub3JlQ29uZmlndXJhdGlvbkN3ZDogdHJ1ZSB9LCAnL3VzZXJIb21lLycsIHVuZGVmaW5lZCwgVXJpLmZpbGUoJy9iYXInKSwgJy9mb28nKSwgJy9iYXInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3ByZXBhcmVQYXRoRm9yU2hlbGwnLCAoKSA9PiB7XG5cdFx0c3VpdGUoJ1dpbmRvd3MgZnJvbnRlbmQsIFdpbmRvd3MgYmFja2VuZCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ0NvbW1hbmQgUHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCdjOlxcXFxmb29cXFxcYmFyJywgJ2NtZCcsICdjbWQnLCBXaW5kb3dzU2hlbGxUeXBlLkNvbW1hbmRQcm9tcHQsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgdHJ1ZSksIGBjOlxcXFxmb29cXFxcYmFyYCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJ2M6XFxcXGZvb1xcXFxiYXJcXCdiYXonLCAnY21kJywgJ2NtZCcsIFdpbmRvd3NTaGVsbFR5cGUuQ29tbWFuZFByb21wdCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgYGM6XFxcXGZvb1xcXFxiYXInYmF6YCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJ2M6XFxcXGZvb1xcXFxiYXIkKGVjaG8gZXZpbCliYXonLCAnY21kJywgJ2NtZCcsIFdpbmRvd3NTaGVsbFR5cGUuQ29tbWFuZFByb21wdCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgYFwiYzpcXFxcZm9vXFxcXGJhciQoZWNobyBldmlsKWJhelwiYCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ1Bvd2VyU2hlbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJ2M6XFxcXGZvb1xcXFxiYXInLCAncHdzaCcsICdwd3NoJywgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIHRydWUpLCBgYzpcXFxcZm9vXFxcXGJhcmApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCdjOlxcXFxmb29cXFxcYmFyXFwnYmF6JywgJ3B3c2gnLCAncHdzaCcsIEdlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgYCYgJ2M6XFxcXGZvb1xcXFxiYXInJ2JheidgKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhciQoZWNobyBldmlsKWJheicsICdwd3NoJywgJ3B3c2gnLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgdHJ1ZSksIGAmICdjOlxcXFxmb29cXFxcYmFyJChlY2hvIGV2aWwpYmF6J2ApO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdHaXQgQmFzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhcicsICdiYXNoJywgJ2Jhc2gnLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgdHJ1ZSksIGAnYzovZm9vL2JhcidgKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhclxcJ2JheicsICdiYXNoJywgJ2Jhc2gnLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgdHJ1ZSksIGAnYzovZm9vL2JhclxcXFwnYmF6J2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCdjOlxcXFxmb29cXFxcYmFyJChlY2hvIGV2aWwpYmF6JywgJ2Jhc2gnLCAnYmFzaCcsIFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgYCdjOi9mb28vYmFyKGVjaG8gZXZpbCliYXonYCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ1dTTCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhcicsICdiYXNoJywgJ2Jhc2gnLCBXaW5kb3dzU2hlbGxUeXBlLldzbCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgJy9tbnQvYy9mb28vYmFyJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRzdWl0ZSgnV2luZG93cyBmcm9udGVuZCwgTGludXggYmFja2VuZCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ0Jhc2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJy9mb28vYmFyJywgJ2Jhc2gnLCAnYmFzaCcsIFBvc2l4U2hlbGxUeXBlLkJhc2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpLCBgJy9mb28vYmFyJ2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhclxcJ2JheicsICdiYXNoJywgJ2Jhc2gnLCBQb3NpeFNoZWxsVHlwZS5CYXNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSwgYCcvZm9vL2JhclxcXFwnYmF6J2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhciQoZWNobyBldmlsKWJheicsICdiYXNoJywgJ2Jhc2gnLCBQb3NpeFNoZWxsVHlwZS5CYXNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSwgYCcvZm9vL2JhcihlY2hvIGV2aWwpYmF6J2ApO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdac2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJy9mb28vYmFyJywgJ3pzaCcsICd6c2gnLCBQb3NpeFNoZWxsVHlwZS5ac2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpLCBgJy9mb28vYmFyJ2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhclxcJ2JheicsICd6c2gnLCAnenNoJywgUG9zaXhTaGVsbFR5cGUuWnNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSwgYCcvZm9vL2JhclxcXFwnYmF6J2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhciQoZWNobyBldmlsKWJheicsICd6c2gnLCAnenNoJywgUG9zaXhTaGVsbFR5cGUuWnNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSwgYCcvZm9vL2JhcihlY2hvIGV2aWwpYmF6J2ApO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdGaXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhcicsICdmaXNoJywgJ2Zpc2gnLCBQb3NpeFNoZWxsVHlwZS5GaXNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSwgYCcvZm9vL2JhcidgKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnL2Zvby9iYXJcXCdiYXonLCAnZmlzaCcsICdmaXNoJywgUG9zaXhTaGVsbFR5cGUuRmlzaCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSksIGAnL2Zvby9iYXJcXFxcJ2JheidgKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnL2Zvby9iYXIkKGVjaG8gZXZpbCliYXonLCAnZmlzaCcsICdmaXNoJywgUG9zaXhTaGVsbFR5cGUuRmlzaCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSksIGAnL2Zvby9iYXIoZWNobyBldmlsKWJheidgKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdMaW51eCBmcm9udGVuZCwgV2luZG93cyBiYWNrZW5kJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnQ29tbWFuZCBQcm9tcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJ2M6XFxcXGZvb1xcXFxiYXInLCAnY21kJywgJ2NtZCcsIFdpbmRvd3NTaGVsbFR5cGUuQ29tbWFuZFByb21wdCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCBmYWxzZSksIGBjOlxcXFxmb29cXFxcYmFyYCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJ2M6XFxcXGZvb1xcXFxiYXJcXCdiYXonLCAnY21kJywgJ2NtZCcsIFdpbmRvd3NTaGVsbFR5cGUuQ29tbWFuZFByb21wdCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCBmYWxzZSksIGBjOlxcXFxmb29cXFxcYmFyJ2JhemApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCdjOlxcXFxmb29cXFxcYmFyJChlY2hvIGV2aWwpYmF6JywgJ2NtZCcsICdjbWQnLCBXaW5kb3dzU2hlbGxUeXBlLkNvbW1hbmRQcm9tcHQsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgZmFsc2UpLCBgXCJjOlxcXFxmb29cXFxcYmFyJChlY2hvIGV2aWwpYmF6XCJgKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnUG93ZXJTaGVsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhcicsICdwd3NoJywgJ3B3c2gnLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgZmFsc2UpLCBgYzpcXFxcZm9vXFxcXGJhcmApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCdjOlxcXFxmb29cXFxcYmFyXFwnYmF6JywgJ3B3c2gnLCAncHdzaCcsIEdlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCBmYWxzZSksIGAmICdjOlxcXFxmb29cXFxcYmFyJydiYXonYCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJ2M6XFxcXGZvb1xcXFxiYXIkKGVjaG8gZXZpbCliYXonLCAncHdzaCcsICdwd3NoJywgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIGZhbHNlKSwgYCYgJ2M6XFxcXGZvb1xcXFxiYXIkKGVjaG8gZXZpbCliYXonYCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ0dpdCBCYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCdjOlxcXFxmb29cXFxcYmFyJywgJ2Jhc2gnLCAnYmFzaCcsIFdpbmRvd3NTaGVsbFR5cGUuR2l0QmFzaCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCBmYWxzZSksIGAnYzovZm9vL2JhcidgKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhclxcJ2JheicsICdiYXNoJywgJ2Jhc2gnLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgZmFsc2UpLCBgJ2M6L2Zvby9iYXJcXFxcJ2JheidgKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhciQoZWNobyBldmlsKWJheicsICdiYXNoJywgJ2Jhc2gnLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgZmFsc2UpLCBgJ2M6L2Zvby9iYXIoZWNobyBldmlsKWJheidgKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnV1NMJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCdjOlxcXFxmb29cXFxcYmFyJywgJ2Jhc2gnLCAnYmFzaCcsIFdpbmRvd3NTaGVsbFR5cGUuV3NsLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIGZhbHNlKSwgJy9tbnQvYy9mb28vYmFyJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHRzdWl0ZSgnTGludXggZnJvbnRlbmQsIExpbnV4IGJhY2tlbmQnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdCYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhcicsICdiYXNoJywgJ2Jhc2gnLCBQb3NpeFNoZWxsVHlwZS5CYXNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBmYWxzZSksIGAnL2Zvby9iYXInYCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJy9mb28vYmFyXFwnYmF6JywgJ2Jhc2gnLCAnYmFzaCcsIFBvc2l4U2hlbGxUeXBlLkJhc2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIGZhbHNlKSwgYCcvZm9vL2JhclxcXFwnYmF6J2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhciQoZWNobyBldmlsKWJheicsICdiYXNoJywgJ2Jhc2gnLCBQb3NpeFNoZWxsVHlwZS5CYXNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBmYWxzZSksIGAnL2Zvby9iYXIoZWNobyBldmlsKWJheidgKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnWnNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhcicsICd6c2gnLCAnenNoJywgUG9zaXhTaGVsbFR5cGUuWnNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBmYWxzZSksIGAnL2Zvby9iYXInYCk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IHByZXBhcmVQYXRoRm9yU2hlbGwoJy9mb28vYmFyXFwnYmF6JywgJ3pzaCcsICd6c2gnLCBQb3NpeFNoZWxsVHlwZS5ac2gsIHdzbFBhdGhCYWNrZW5kLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIGZhbHNlKSwgYCcvZm9vL2JhclxcXFwnYmF6J2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhciQoZWNobyBldmlsKWJheicsICd6c2gnLCAnenNoJywgUG9zaXhTaGVsbFR5cGUuWnNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBmYWxzZSksIGAnL2Zvby9iYXIoZWNobyBldmlsKWJheidgKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnRmlzaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnL2Zvby9iYXInLCAnZmlzaCcsICdmaXNoJywgUG9zaXhTaGVsbFR5cGUuRmlzaCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgZmFsc2UpLCBgJy9mb28vYmFyJ2ApO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBwcmVwYXJlUGF0aEZvclNoZWxsKCcvZm9vL2JhclxcJ2JheicsICdmaXNoJywgJ2Zpc2gnLCBQb3NpeFNoZWxsVHlwZS5GaXNoLCB3c2xQYXRoQmFja2VuZCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBmYWxzZSksIGAnL2Zvby9iYXJcXFxcJ2JheidgKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgcHJlcGFyZVBhdGhGb3JTaGVsbCgnL2Zvby9iYXIkKGVjaG8gZXZpbCliYXonLCAnZmlzaCcsICdmaXNoJywgUG9zaXhTaGVsbFR5cGUuRmlzaCwgd3NsUGF0aEJhY2tlbmQsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgZmFsc2UpLCBgJy9mb28vYmFyKGVjaG8gZXZpbCliYXonYCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdjcmVhdGVUZXJtaW5hbEVudmlyb25tZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1vblZhcmlhYmxlcyA9IHtcblx0XHRcdENPTE9SVEVSTTogJ3RydWVjb2xvcicsXG5cdFx0XHRURVJNX1BST0dSQU06ICd2c2NvZGUnXG5cdFx0fTtcblx0XHR0ZXN0KCdzaG91bGQgcmV0YWluIHZhcmlhYmxlcyBlcXVhbCB0byB0aGUgZW1wdHkgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRhd2FpdCBjcmVhdGVUZXJtaW5hbEVudmlyb25tZW50KHt9LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAnb2ZmJywgeyBmb286ICdiYXInLCBlbXB0eTogJycgfSksXG5cdFx0XHRcdHsgZm9vOiAnYmFyJywgZW1wdHk6ICcnLCAuLi5jb21tb25WYXJpYWJsZXMgfVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdnZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVzb2x2ZSB3b3Jrc3BhY2UgZm9sZGVyIGZyb20gY3dkLCBub3QgbGFzdCBhY3RpdmUgd29ya3NwYWNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9sZGVyQSA9IFVyaS5maWxlKCcvd29ya3NwYWNlL3Byb2oxJyk7XG5cdFx0XHRjb25zdCBmb2xkZXJCID0gVXJpLmZpbGUoJy93b3Jrc3BhY2UvcHJvajInKTtcblx0XHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKGZvbGRlckEsIGZvbGRlckIpKTtcblx0XHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gbmV3IFRlc3RIaXN0b3J5U2VydmljZShmb2xkZXJBKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldFdvcmtzcGFjZUZvclRlcm1pbmFsKGZvbGRlckIsIGNvbnRleHRTZXJ2aWNlLCBoaXN0b3J5U2VydmljZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LnVyaS5mc1BhdGgsIGZvbGRlckIuZnNQYXRoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gbGFzdCBhY3RpdmUgd29ya3NwYWNlIHdoZW4gY3dkIGlzIG5vdCBpbiBhbnkgd29ya3NwYWNlIGZvbGRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlckEgPSBVcmkuZmlsZSgnL3dvcmtzcGFjZS9wcm9qMScpO1xuXHRcdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKHRlc3RXb3Jrc3BhY2UoZm9sZGVyQSkpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBuZXcgVGVzdEhpc3RvcnlTZXJ2aWNlKGZvbGRlckEpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZ2V0V29ya3NwYWNlRm9yVGVybWluYWwoVXJpLmZpbGUoJy9vdGhlci9wYXRoJyksIGNvbnRleHRTZXJ2aWNlLCBoaXN0b3J5U2VydmljZSk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LnVyaS5mc1BhdGgsIGZvbGRlckEuZnNQYXRoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBmYWxsIGJhY2sgdG8gbGFzdCBhY3RpdmUgd29ya3NwYWNlIHdoZW4gY3dkIGlzIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlckEgPSBVcmkuZmlsZSgnL3dvcmtzcGFjZS9wcm9qMScpO1xuXHRcdFx0Y29uc3QgY29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKHRlc3RXb3Jrc3BhY2UoZm9sZGVyQSkpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeVNlcnZpY2UgPSBuZXcgVGVzdEhpc3RvcnlTZXJ2aWNlKGZvbGRlckEpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0V29ya3NwYWNlRm9yVGVybWluYWwodW5kZWZpbmVkLCBjb250ZXh0U2VydmljZSwgaGlzdG9yeVNlcnZpY2UpPy51cmkuZnNQYXRoLCBmb2xkZXJBLmZzUGF0aCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIGN3ZCBhbmQgaGlzdG9yeSBhcmUgYm90aCB1bmF2YWlsYWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRleHRTZXJ2aWNlID0gbmV3IFRlc3RDb250ZXh0U2VydmljZSh0ZXN0V29ya3NwYWNlKFVyaS5maWxlKCcvd29ya3NwYWNlL3Byb2oxJykpKTtcblx0XHRcdGNvbnN0IGhpc3RvcnlTZXJ2aWNlID0gbmV3IFRlc3RIaXN0b3J5U2VydmljZSh1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0V29ya3NwYWNlRm9yVGVybWluYWwodW5kZWZpbmVkLCBjb250ZXh0U2VydmljZSwgaGlzdG9yeVNlcnZpY2UpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZm9ybWF0VXJpRm9yU2hlbGxEaXNwbGF5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ1dzbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldFVyaUxhYmVsRm9yU2hlbGwoJ2M6XFxcXGZvb1xcXFxiYXInLCB3c2xQYXRoQmFja2VuZCwgV2luZG93c1NoZWxsVHlwZS5Xc2wsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgJy9tbnQvYy9mb28vYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRVcmlMYWJlbEZvclNoZWxsKCdjOi9mb28vYmFyJywgd3NsUGF0aEJhY2tlbmQsIFdpbmRvd3NTaGVsbFR5cGUuV3NsLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgZmFsc2UpLCAnL21udC9jL2Zvby9iYXInKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdHaXRCYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0VXJpTGFiZWxGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhcicsIHdzbFBhdGhCYWNrZW5kLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgJy9jL2Zvby9iYXInKTtcblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldFVyaUxhYmVsRm9yU2hlbGwoJ2M6L2Zvby9iYXInLCB3c2xQYXRoQmFja2VuZCwgV2luZG93c1NoZWxsVHlwZS5HaXRCYXNoLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgZmFsc2UpLCAnL2MvZm9vL2JhcicpO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnV2luZG93cyBmcm9udGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0VXJpTGFiZWxGb3JTaGVsbCgnYzpcXFxcZm9vXFxcXGJhcicsIHdzbFBhdGhCYWNrZW5kLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgJ2M6XFxcXGZvb1xcXFxiYXInKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0VXJpTGFiZWxGb3JTaGVsbCgnQzpcXFxcRm9vXFxcXEJhcicsIHdzbFBhdGhCYWNrZW5kLCBHZW5lcmFsU2hlbGxUeXBlLlBvd2VyU2hlbGwsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSwgJ0M6XFxcXEZvb1xcXFxCYXInKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnTm9uLVdpbmRvd3MgZnJvbnRlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldFVyaUxhYmVsRm9yU2hlbGwoJ2M6L2Zvby9iYXInLCB3c2xQYXRoQmFja2VuZCwgR2VuZXJhbFNoZWxsVHlwZS5Qb3dlclNoZWxsLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgZmFsc2UpLCAnYzpcXFxcZm9vXFxcXGJhcicpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRVcmlMYWJlbEZvclNoZWxsKCdDOi9Gb28vQmFyJywgd3NsUGF0aEJhY2tlbmQsIEdlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbCwgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIGZhbHNlKSwgJ0M6XFxcXEZvb1xcXFxCYXInKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdCYXNoJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnV2luZG93cyBmcm9udGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0VXJpTGFiZWxGb3JTaGVsbCgnXFxcXGZvb1xcXFxiYXInLCB3c2xQYXRoQmFja2VuZCwgUG9zaXhTaGVsbFR5cGUuQmFzaCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSwgJy9mb28vYmFyJyk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldFVyaUxhYmVsRm9yU2hlbGwoJy9mb28vYmFyJywgd3NsUGF0aEJhY2tlbmQsIFBvc2l4U2hlbGxUeXBlLkJhc2gsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSksICcvZm9vL2JhcicpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdOb24tV2luZG93cyBmcm9udGVuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0VXJpTGFiZWxGb3JTaGVsbCgnXFxcXGZvb1xcXFxiYXInLCB3c2xQYXRoQmFja2VuZCwgUG9zaXhTaGVsbFR5cGUuQmFzaCwgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBmYWxzZSksICdcXFxcZm9vXFxcXGJhcicpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRVcmlMYWJlbEZvclNoZWxsKCcvZm9vL2JhcicsIHdzbFBhdGhCYWNrZW5kLCBQb3NpeFNoZWxsVHlwZS5CYXNoLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIGZhbHNlKSwgJy9mb28vYmFyJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUU3QyxTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsT0FBTyxXQUFXO0FBQzNCLFNBQVMsNEJBQTRCLDJCQUEyQixxQkFBcUIsUUFBUSxvQkFBb0IseUJBQXlCLG1CQUFtQixxQkFBcUIsZ0NBQWdDO0FBQ2xOLFNBQVMsa0JBQWtCLGdCQUFnQix3QkFBd0I7QUFDbkUsU0FBUywrQ0FBK0M7QUFDeEQsU0FB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a0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFBSSxHQUFHLGFBQWE7QUFDbkQsa0JBQVksbUJBQW1CLElBQUksR0FBRyxhQUFhO0FBQ25ELGtCQUFZLG1CQUFtQixJQUFJLEdBQUcsYUFBYTtBQUNuRCxrQkFBWSxtQkFBbUIsSUFB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
