import { URI } from "../../../../../../base/common/uri.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TerminalCompletionService } from "../../browser/terminalCompletionService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import assert, { fail } from "assert";
import { isWindows } from "../../../../../../base/common/platform.js";
import { createFileStat } from "../../../../../test/common/workbenchTestServices.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { ShellEnvDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/shellEnvDetectionCapability.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCompletionItemKind } from "../../browser/terminalCompletionItem.js";
import { count } from "../../../../../../base/common/strings.js";
import { ITerminalLogService, WindowsShellType } from "../../../../../../platform/terminal/common/terminal.js";
import { gitBashToWindowsPath, windowsToGitBashPath } from "../../browser/terminalGitBashHelpers.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TerminalSuggestSettingId } from "../../common/terminalSuggestConfiguration.js";
import { TestPathService, workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
const pathSeparator = isWindows ? "\\" : "/";
function assertCompletions(actual, expected, expectedConfig, pathSep) {
  const sep = pathSep ?? pathSeparator;
  assert.deepStrictEqual(
    actual?.map((e) => ({
      label: e.label,
      detail: e.detail ?? "",
      kind: e.kind ?? TerminalCompletionItemKind.Folder,
      replacementRange: e.replacementRange
    })),
    expected.map((e) => ({
      label: e.label.replaceAll("/", sep),
      detail: e.detail ? e.detail.replaceAll("/", sep) : "",
      kind: e.kind ?? TerminalCompletionItemKind.Folder,
      replacementRange: expectedConfig.replacementRange
    }))
  );
}
function assertPartialCompletionsExist(actual, expectedPartial, expectedConfig) {
  if (!actual) {
    fail();
  }
  const expectedMapped = expectedPartial.map((e) => ({
    label: e.label.replaceAll("/", pathSeparator),
    detail: e.detail ? e.detail.replaceAll("/", pathSeparator) : "",
    kind: e.kind ?? TerminalCompletionItemKind.Folder,
    replacementRange: expectedConfig.replacementRange
  }));
  for (const expectedItem of expectedMapped) {
    assert.deepStrictEqual(actual.map((e) => ({
      label: e.label,
      detail: e.detail ?? "",
      kind: e.kind ?? TerminalCompletionItemKind.Folder,
      replacementRange: e.replacementRange
    })).find((e) => e.detail === expectedItem.detail), expectedItem);
  }
}
const testEnv = {
  HOME: "/home/user",
  USERPROFILE: "/home/user"
};
let homeDir = isWindows ? testEnv["USERPROFILE"] : testEnv["HOME"];
if (!homeDir.endsWith("/")) {
  homeDir += "/";
}
const standardTildeItem = Object.freeze({ label: "~", detail: homeDir });
suite("TerminalCompletionService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let capabilities;
  let validResources;
  let childResources;
  let terminalCompletionService;
  const provider = "testProvider";
  setup(() => {
    instantiationService = workbenchInstantiationService({
      pathService: () => new TestPathService(URI.file(homeDir ?? "/"))
    }, store);
    const normalizePath = (path) => path === "/" ? path : path.replace(/\/+$/, "");
    const doesResourceExist = (resource) => validResources.some((e) => normalizePath(e.path) === normalizePath(resource.path)) || childResources.some((e) => normalizePath(e.resource.path) === normalizePath(resource.path));
    configurationService = new TestConfigurationService();
    instantiationService.stub(ITerminalLogService, new NullLogService());
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IFileService, {
      async stat(resource) {
        if (!doesResourceExist(resource)) {
          throw new Error("Doesn't exist");
        }
        return createFileStat(resource);
      },
      async resolve(resource, options) {
        if (!doesResourceExist(resource)) {
          throw new Error("Doesn't exist");
        }
        const children = childResources.filter((child) => {
          const childFsPath = child.resource.path.replace(/\/$/, "");
          const parentFsPath = resource.path.replace(/\/$/, "");
          return childFsPath.startsWith(parentFsPath) && count(childFsPath, "/") === count(parentFsPath, "/") + 1;
        });
        return createFileStat(resource, void 0, void 0, void 0, void 0, children);
      },
      async realpath(resource) {
        if (resource.path.includes("symlink-file")) {
          return resource.with({ path: "/target/actual-file.txt" });
        } else if (resource.path.includes("symlink-folder")) {
          return resource.with({ path: "/target/actual-folder" });
        }
        return void 0;
      }
    });
    terminalCompletionService = store.add(instantiationService.createInstance(TerminalCompletionService));
    terminalCompletionService.processEnv = testEnv;
    validResources = [];
    childResources = [];
    capabilities = store.add(new TerminalCapabilityStore());
  });
  suite("resolveResources should return undefined", () => {
    test("if neither showFiles nor showDirectories are true", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      assert(!result);
    });
  });
  suite("resolveResources should return folder completions", () => {
    setup(() => {
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true, isFile: false },
        { resource: URI.parse("file:///test/file1.txt"), isDirectory: false, isFile: true }
      ];
    });
    test("| should return root-level completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "", 1, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [1, 1] });
    });
    test("./| should return folder completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 3, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [1, 3] });
    });
    test("../| should return parent folder completions", async () => {
      validResources = [
        URI.parse("file:///parent/folder1"),
        URI.parse("file:///parent")
      ];
      childResources = [
        { resource: URI.parse("file:///parent/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///parent/folder2/"), isDirectory: true }
      ];
      const resourceOptions = {
        cwd: URI.parse("file:///parent/folder1"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "../", 3, provider, capabilities);
      assertCompletions(result, [
        { label: "../", detail: "/parent/" },
        { label: "../folder1/", detail: "/parent/folder1/" },
        { label: "../folder2/", detail: "/parent/folder2/" },
        { label: "../../", detail: "/" }
      ], { replacementRange: [0, 3] });
    });
    test("cd ./| should return folder completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ./", 5, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [3, 5] });
    });
    test("cd ./f| should return folder completions", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ./f", 6, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [3, 6] });
    });
  });
  suite("resolveResources should handle file and folder completion requests correctly", () => {
    setup(() => {
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/.hiddenFile"), isFile: true, executable: true },
        { resource: URI.parse("file:///test/.hiddenFolder/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/file1.txt"), isFile: true, executable: true }
      ];
    });
    test("./| should handle hidden files and folders", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./.hiddenFile", detail: "/test/.hiddenFile", kind: TerminalCompletionItemKind.File },
        { label: "./.hiddenFolder/", detail: "/test/.hiddenFolder/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./file1.txt", detail: "/test/file1.txt", kind: TerminalCompletionItemKind.File },
        { label: "./../", detail: "/" }
      ], { replacementRange: [0, 2] });
    });
    test("./h| should handle hidden files and folders", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./h", 3, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./.hiddenFile", detail: "/test/.hiddenFile", kind: TerminalCompletionItemKind.File },
        { label: "./.hiddenFolder/", detail: "/test/.hiddenFolder/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./file1.txt", detail: "/test/file1.txt", kind: TerminalCompletionItemKind.File },
        { label: "./../", detail: "/" }
      ], { replacementRange: [0, 3] });
    });
  });
  suite("~ -> $HOME", () => {
    let resourceOptions;
    let shellEnvDetection;
    setup(() => {
      shellEnvDetection = store.add(new ShellEnvDetectionCapability());
      shellEnvDetection.setEnvironment({
        HOME: "/home",
        USERPROFILE: "/home"
      }, true);
      capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
      resourceOptions = {
        cwd: URI.parse("file:///test/folder1"),
        // Updated to reflect home directory
        showFiles: true,
        showDirectories: true,
        pathSeparator
      };
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///test/folder1"),
        URI.parse("file:///home"),
        URI.parse("file:///home/vscode"),
        URI.parse("file:///home/vscode/foo"),
        URI.parse("file:///home/vscode/bar.txt")
      ];
      childResources = [
        { resource: URI.parse("file:///home/vscode"), isDirectory: true },
        { resource: URI.parse("file:///home/vscode/foo"), isDirectory: true },
        { resource: URI.parse("file:///home/vscode/bar.txt"), isFile: true, executable: true }
      ];
    });
    test("~| should return completion for ~", async () => {
      assertPartialCompletionsExist(await terminalCompletionService.resolveResources(resourceOptions, "~", 1, provider, capabilities), [
        { label: "~", detail: "/home/" }
      ], { replacementRange: [0, 1] });
    });
    test("~/| should return folder completions relative to $HOME", async () => {
      assertCompletions(await terminalCompletionService.resolveResources(resourceOptions, "~/", 2, provider, capabilities), [
        { label: "~/", detail: "/home/" },
        { label: "~/vscode/", detail: "/home/vscode/" }
      ], { replacementRange: [0, 2] });
    });
    test("~/vscode/| should return folder completions relative to $HOME/vscode", async () => {
      assertCompletions(await terminalCompletionService.resolveResources(resourceOptions, "~/vscode/", 9, provider, capabilities), [
        { label: "~/vscode/", detail: "/home/vscode/" },
        { label: "~/vscode/foo/", detail: "/home/vscode/foo/" },
        { label: "~/vscode/bar.txt", detail: "/home/vscode/bar.txt", kind: TerminalCompletionItemKind.File }
      ], { replacementRange: [0, 9] });
    });
  });
  suite("resolveResources edge cases and advanced scenarios", () => {
    setup(() => {
      validResources = [];
      childResources = [];
    });
    if (isWindows) {
      test("C:/Foo/| absolute paths on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///C:"),
          showDirectories: true,
          pathSeparator
        };
        validResources = [URI.parse("file:///C:/Foo")];
        childResources = [
          { resource: URI.parse("file:///C:/Foo/Bar"), isDirectory: true, isFile: false },
          { resource: URI.parse("file:///C:/Foo/Baz.txt"), isDirectory: false, isFile: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "C:/Foo/", 7, provider, capabilities);
        assertCompletions(result, [
          { label: "C:/Foo/", detail: "C:/Foo/" },
          { label: "C:/Foo/Bar/", detail: "C:/Foo/Bar/" }
        ], { replacementRange: [0, 7] });
      });
      test("c:/foo/| case insensitivity on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///c:"),
          showDirectories: true,
          pathSeparator
        };
        validResources = [URI.parse("file:///c:/foo")];
        childResources = [
          { resource: URI.parse("file:///c:/foo/Bar"), isDirectory: true, isFile: false }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "c:/foo/", 7, provider, capabilities);
        assertCompletions(result, [
          // Note that the detail is normalizes drive letters to capital case intentionally
          { label: "c:/foo/", detail: "C:/foo/" },
          { label: "c:/foo/Bar/", detail: "C:/foo/Bar/" }
        ], { replacementRange: [0, 7] });
      });
    } else {
      test("/foo/| absolute paths NOT on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///"),
          showDirectories: true,
          pathSeparator
        };
        validResources = [URI.parse("file:///foo")];
        childResources = [
          { resource: URI.parse("file:///foo/Bar"), isDirectory: true, isFile: false },
          { resource: URI.parse("file:///foo/Baz.txt"), isDirectory: false, isFile: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "/foo/", 5, provider, capabilities);
        assertCompletions(result, [
          { label: "/foo/", detail: "/foo/" },
          { label: "/foo/Bar/", detail: "/foo/Bar/" }
        ], { replacementRange: [0, 5] });
      });
    }
    if (isWindows) {
      test(".\\folder | Case insensitivity should resolve correctly on Windows", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///C:/test"),
          showDirectories: true,
          pathSeparator: "\\"
        };
        validResources = [URI.parse("file:///C:/test")];
        childResources = [
          { resource: URI.parse("file:///C:/test/FolderA/"), isDirectory: true },
          { resource: URI.parse("file:///C:/test/anotherFolder/"), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, ".\\folder", 8, provider, capabilities);
        assertCompletions(result, [
          { label: ".\\", detail: "C:\\test\\" },
          { label: ".\\FolderA\\", detail: "C:\\test\\FolderA\\" },
          { label: ".\\anotherFolder\\", detail: "C:\\test\\anotherFolder\\" },
          { label: ".\\..\\", detail: "C:\\" }
        ], { replacementRange: [0, 8] });
      });
    } else {
      test("./folder | Case sensitivity should resolve correctly on Mac/Unix", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///test"),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [URI.parse("file:///test")];
        childResources = [
          { resource: URI.parse("file:///test/FolderA/"), isDirectory: true },
          { resource: URI.parse("file:///test/foldera/"), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "./folder", 8, provider, capabilities);
        assertCompletions(result, [
          { label: "./", detail: "/test/" },
          { label: "./FolderA/", detail: "/test/FolderA/" },
          { label: "./foldera/", detail: "/test/foldera/" },
          { label: "./../", detail: "/" }
        ], { replacementRange: [0, 8] });
      });
    }
    test("| Empty input should resolve to current directory", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "", 0, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./folder2/", detail: "/test/folder2/" },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [0, 0] });
    });
    test("should ignore environment variable setting prefixes", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "FOO=./", 2, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./folder2/", detail: "/test/folder2/" },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [0, 2] });
    });
    test("should not return completions when relative folder prefix does not exist", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/src/"), isDirectory: true },
        { resource: URI.parse("file:///test/vs/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "s/", 2, provider, capabilities);
      assert.strictEqual(result, void 0);
    });
    test("./| should handle large directories with many results gracefully", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = Array.from({ length: 1e3 }, (_, i) => ({
        resource: URI.parse(`file:///test/folder${i}/`),
        isDirectory: true
      }));
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities);
      assert(result);
      assert.strictEqual(result?.length, 1002);
      assert.strictEqual(result[0].label, `.${pathSeparator}`);
      assert.strictEqual(result.at(-1)?.label, `.${pathSeparator}..${pathSeparator}`);
    });
    test("./folder| should include current folder with trailing / is missing", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./folder1", 10, provider, capabilities);
      assertCompletions(result, [
        { label: "./", detail: "/test/" },
        { label: "./folder1/", detail: "/test/folder1/" },
        { label: "./folder2/", detail: "/test/folder2/" },
        { label: "./../", detail: "/" }
      ], { replacementRange: [1, 10] });
    });
    test("should resolve nested folder when name matches cwd basename", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///test/test")
      ];
      childResources = [
        { resource: URI.parse("file:///test/test/"), isDirectory: true },
        { resource: URI.parse("file:///test/test/inner/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "test/", 5, provider, capabilities);
      assertCompletions(result, [
        { label: "./test/", detail: "/test/test/" },
        { label: "./test/inner/", detail: "/test/test/inner/" },
        // ../` from the viewed folder (/test/test/) goes to /test/, not /
        { label: "./test/../", detail: "/test/" }
      ], { replacementRange: [0, 5] });
    });
    test("test/| should normalize current and parent folders", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        pathSeparator
      };
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///test/folder1"),
        URI.parse("file:///test/folder2")
      ];
      childResources = [
        { resource: URI.parse("file:///test/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder2/"), isDirectory: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "./test/", 7, provider, capabilities);
      assertCompletions(result, [
        { label: "./test/", detail: "/test/" },
        { label: "./test/folder1/", detail: "/test/folder1/" },
        { label: "./test/folder2/", detail: "/test/folder2/" },
        { label: "./test/../", detail: "/" }
      ], { replacementRange: [0, 7] });
    });
  });
  suite("cdpath", () => {
    let shellEnvDetection;
    setup(() => {
      validResources = [
        URI.parse("file:///test"),
        URI.parse("file:///cdpath_value")
      ];
      childResources = [
        { resource: URI.parse("file:///cdpath_value/folder1/"), isDirectory: true },
        { resource: URI.parse("file:///cdpath_value/file1.txt"), isFile: true }
      ];
      shellEnvDetection = store.add(new ShellEnvDetectionCapability());
      shellEnvDetection.setEnvironment({ CDPATH: "/cdpath_value" }, true);
      capabilities.add(TerminalCapability.ShellEnvDetection, shellEnvDetection);
    });
    test("cd | should show paths from $CDPATH (relative)", async () => {
      configurationService.setUserConfiguration("terminal.integrated.suggest.cdPath", "relative");
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      assertPartialCompletionsExist(result, [
        { label: "folder1", detail: "CDPATH /cdpath_value/folder1/" }
      ], { replacementRange: [3, 3] });
    });
    test("cd | should show paths from $CDPATH (absolute)", async () => {
      configurationService.setUserConfiguration("terminal.integrated.suggest.cdPath", "absolute");
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      assertPartialCompletionsExist(result, [
        { label: "/cdpath_value/folder1/", detail: "CDPATH" }
      ], { replacementRange: [3, 3] });
    });
    test("cd | should support pulling from multiple paths in $CDPATH", async () => {
      configurationService.setUserConfiguration("terminal.integrated.suggest.cdPath", "relative");
      const pathPrefix = isWindows ? "c:\\" : "/";
      const delimeter = isWindows ? ";" : ":";
      const separator = isWindows ? "\\" : "/";
      shellEnvDetection.setEnvironment({ CDPATH: `${pathPrefix}cdpath1_value${delimeter}${pathPrefix}cdpath2_value${separator}inner_dir` }, true);
      const uriPathPrefix = isWindows ? "file:///c:/" : "file:///";
      validResources = [
        URI.parse(`${uriPathPrefix}test`),
        URI.parse(`${uriPathPrefix}cdpath1_value`),
        URI.parse(`${uriPathPrefix}cdpath2_value`),
        URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir`)
      ];
      childResources = [
        { resource: URI.parse(`${uriPathPrefix}cdpath1_value/folder1/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath1_value/folder2/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath1_value/file1.txt`), isFile: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/folder1/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/folder2/`), isDirectory: true },
        { resource: URI.parse(`${uriPathPrefix}cdpath2_value/inner_dir/file1.txt`), isFile: true }
      ];
      const resourceOptions = {
        cwd: URI.parse(`${uriPathPrefix}test`),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      const result = await terminalCompletionService.resolveResources(resourceOptions, "cd ", 3, provider, capabilities);
      const finalPrefix = isWindows ? "C:\\" : "/";
      assertPartialCompletionsExist(result, [
        { label: "folder1", detail: `CDPATH ${finalPrefix}cdpath1_value/folder1/` },
        { label: "folder2", detail: `CDPATH ${finalPrefix}cdpath1_value/folder2/` },
        { label: "folder1", detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder1/` },
        { label: "folder2", detail: `CDPATH ${finalPrefix}cdpath2_value/inner_dir/folder2/` }
      ], { replacementRange: [3, 3] });
    });
  });
  if (isWindows) {
    suite("gitbash", () => {
      test("should convert Git Bash absolute path to Windows absolute path", () => {
        assert.strictEqual(gitBashToWindowsPath("/"), "C:\\");
        assert.strictEqual(gitBashToWindowsPath("/c/"), "C:\\");
        assert.strictEqual(gitBashToWindowsPath("/c/Users/foo"), "C:\\Users\\foo");
        assert.strictEqual(gitBashToWindowsPath("/d/bar"), "D:\\bar");
      });
      test("should convert Windows absolute path to Git Bash absolute path", () => {
        assert.strictEqual(windowsToGitBashPath("C:\\"), "/c/");
        assert.strictEqual(windowsToGitBashPath("C:\\Users\\foo"), "/c/Users/foo");
        assert.strictEqual(windowsToGitBashPath("D:\\bar"), "/d/bar");
        assert.strictEqual(windowsToGitBashPath("E:\\some\\path"), "/e/some/path");
      });
      test("resolveResources with c:/ style absolute path for Git Bash", async () => {
        const resourceOptions = {
          cwd: URI.file("C:\\Users\\foo"),
          showDirectories: true,
          showFiles: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.file("C:\\Users\\foo"),
          URI.file("C:\\Users\\foo\\bar"),
          URI.file("C:\\Users\\foo\\baz.txt")
        ];
        childResources = [
          { resource: URI.file("C:\\Users\\foo\\bar"), isDirectory: true, isFile: false },
          { resource: URI.file("C:\\Users\\foo\\baz.txt"), isFile: true, executable: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "C:/Users/foo/", 13, provider, capabilities, WindowsShellType.GitBash);
        assertCompletions(result, [
          { label: "C:/Users/foo/", detail: "C:\\Users\\foo\\" },
          { label: "C:/Users/foo/bar/", detail: "C:\\Users\\foo\\bar\\" },
          { label: "C:/Users/foo/baz.txt", detail: "C:\\Users\\foo\\baz.txt", kind: TerminalCompletionItemKind.File }
        ], { replacementRange: [0, 13] }, "/");
      });
      test("resolveResources with cwd as Windows path (relative)", async () => {
        const resourceOptions = {
          cwd: URI.file("C:\\Users\\foo"),
          showDirectories: true,
          showFiles: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.file("C:\\Users\\foo"),
          URI.file("C:\\Users\\foo\\bar"),
          URI.file("C:\\Users\\foo\\baz.txt")
        ];
        childResources = [
          { resource: URI.file("C:\\Users\\foo\\bar"), isDirectory: true },
          { resource: URI.file("C:\\Users\\foo\\baz.txt"), isFile: true, executable: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities, WindowsShellType.GitBash);
        assertCompletions(result, [
          { label: "./", detail: "C:\\Users\\foo\\" },
          { label: "./bar/", detail: "C:\\Users\\foo\\bar\\" },
          { label: "./baz.txt", detail: "C:\\Users\\foo\\baz.txt", kind: TerminalCompletionItemKind.File },
          { label: "./../", detail: "C:\\Users\\" }
        ], { replacementRange: [0, 2] }, "/");
      });
      test("resolveResources with cwd as Windows path (absolute)", async () => {
        const resourceOptions = {
          cwd: URI.file("C:\\Users\\foo"),
          showDirectories: true,
          showFiles: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.file("C:\\Users\\foo"),
          URI.file("C:\\Users\\foo\\bar"),
          URI.file("C:\\Users\\foo\\baz.txt")
        ];
        childResources = [
          { resource: URI.file("C:\\Users\\foo\\bar"), isDirectory: true },
          { resource: URI.file("C:\\Users\\foo\\baz.txt"), isFile: true, executable: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "/c/Users/foo/", 13, provider, capabilities, WindowsShellType.GitBash);
        assertCompletions(result, [
          { label: "/c/Users/foo/", detail: "C:\\Users\\foo\\" },
          { label: "/c/Users/foo/bar/", detail: "C:\\Users\\foo\\bar\\" },
          { label: "/c/Users/foo/baz.txt", detail: "C:\\Users\\foo\\baz.txt", kind: TerminalCompletionItemKind.File }
        ], { replacementRange: [0, 13] }, "/");
      });
    });
  }
  if (!isWindows) {
    suite("symlink support", () => {
      test("should include symlink target information in completions", async () => {
        const resourceOptions = {
          cwd: URI.parse("file:///test"),
          pathSeparator,
          showFiles: true,
          showDirectories: true
        };
        validResources = [URI.parse("file:///test")];
        childResources = [
          { resource: URI.parse("file:///test/regular-file.txt"), isFile: true },
          { resource: URI.parse("file:///test/symlink-file"), isFile: true, isSymbolicLink: true },
          { resource: URI.parse("file:///test/symlink-folder"), isDirectory: true, isSymbolicLink: true },
          { resource: URI.parse("file:///test/regular-folder"), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "ls ", 3, provider, capabilities);
        const symlinkFileCompletion = result?.find((c) => c.label === "./symlink-file");
        const symlinkFolderCompletion = result?.find((c) => c.label === "./symlink-folder/");
        assert.strictEqual(symlinkFileCompletion?.detail, "/test/symlink-file -> /target/actual-file.txt", "Symlink file detail should match target");
        assert.strictEqual(symlinkFolderCompletion?.detail, "/test/symlink-folder -> /target/actual-folder", "Symlink folder detail should match target");
      });
    });
  }
  if (!isWindows) {
    suite("remote file completion (e.g. WSL)", () => {
      const remoteAuthority = "wsl+Ubuntu";
      const remoteTestEnv = {
        HOME: "/home/remoteuser",
        USERPROFILE: "/home/remoteuser"
      };
      test("/absolute/path should preserve remote authority", async () => {
        terminalCompletionService.processEnv = remoteTestEnv;
        const resourceOptions = {
          cwd: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" }),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home" }),
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" })
        ];
        childResources = [
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" }), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "/home/", 6, provider, capabilities);
        assert.ok(result && result.length > 0, "Should return completions for remote absolute path");
        const absoluteCompletion = result?.find((c) => c.label === "/home/");
        assert.ok(absoluteCompletion, "Should have absolute path completion");
        assert.ok(absoluteCompletion.detail?.includes("/home/"), "Detail should show remote path");
      });
      test("~/ should preserve remote authority for tilde expansion", async () => {
        terminalCompletionService.processEnv = remoteTestEnv;
        const resourceOptions = {
          cwd: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" }),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser" }),
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" })
        ];
        childResources = [
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/Documents" }), isDirectory: true },
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" }), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "~/", 2, provider, capabilities);
        assert.ok(result && result.length > 0, "Should return completions for remote tilde path");
        const documentsCompletion = result?.find((c) => c.detail?.includes("Documents"));
        assert.ok(documentsCompletion, "Should find Documents folder from remote home");
      });
      test("./relative should preserve remote authority for relative paths", async () => {
        terminalCompletionService.processEnv = remoteTestEnv;
        const resourceOptions = {
          cwd: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" }),
          showDirectories: true,
          pathSeparator: "/"
        };
        validResources = [
          URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project" })
        ];
        childResources = [
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project/src" }), isDirectory: true },
          { resource: URI.from({ scheme: "vscode-remote", authority: remoteAuthority, path: "/home/remoteuser/project/docs" }), isDirectory: true }
        ];
        const result = await terminalCompletionService.resolveResources(resourceOptions, "./", 2, provider, capabilities);
        assert.ok(result && result.length > 0, "Should return completions for remote relative path");
        const srcCompletion = result?.find((c) => c.detail?.includes("/home/remoteuser/project/src"));
        assert.ok(srcCompletion, "Should find src folder completion with remote path in detail");
      });
    });
  }
  suite("completion label escaping", () => {
    test("| should escape special characters in file/folder names for POSIX shells", async () => {
      const resourceOptions = {
        cwd: URI.parse("file:///test"),
        showDirectories: true,
        showFiles: true,
        pathSeparator
      };
      validResources = [URI.parse("file:///test")];
      childResources = [
        { resource: URI.parse("file:///test/[folder1]/"), isDirectory: true },
        { resource: URI.parse("file:///test/folder 2/"), isDirectory: true },
        { resource: URI.parse("file:///test/!special$chars&/"), isDirectory: true },
        { resource: URI.parse("file:///test/!special$chars2&"), isFile: true, executable: true }
      ];
      const result = await terminalCompletionService.resolveResources(resourceOptions, "", 0, provider, capabilities);
      assertCompletions(result, [
        { label: ".", detail: "/test/" },
        { label: "./[folder1]/", detail: "/test/[folder1]/" },
        { label: "./folder 2/", detail: "/test/folder 2/" },
        { label: "./!special$chars&/", detail: "/test/!special$chars&/" },
        { label: "./!special$chars2&", detail: "/test/!special$chars2&", kind: TerminalCompletionItemKind.File },
        { label: "../", detail: "/" },
        standardTildeItem
      ], { replacementRange: [0, 0] });
    });
  });
  suite("Provider Configuration", () => {
    class TestTerminalCompletionService extends TerminalCompletionService {
      getEnabledProviders(providers) {
        return super._getEnabledProviders(providers);
      }
    }
    let testTerminalCompletionService;
    setup(() => {
      testTerminalCompletionService = store.add(instantiationService.createInstance(TestTerminalCompletionService));
    });
    function createMockProvider(id) {
      return {
        id,
        provideCompletions: async () => [{
          label: `completion-from-${id}`,
          kind: TerminalCompletionItemKind.Method,
          replacementRange: [0, 0],
          provider: id
        }]
      };
    }
    test("should enable providers by default when no configuration exists", () => {
      const defaultProvider = createMockProvider("terminal-suggest");
      const newProvider = createMockProvider("new-extension-provider");
      const providers = [defaultProvider, newProvider];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {});
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 2, "Should enable both providers by default");
      assert.ok(result.includes(defaultProvider), "Should include default provider");
      assert.ok(result.includes(newProvider), "Should include new provider");
    });
    test("should disable providers when explicitly set to false", () => {
      const provider1 = createMockProvider("provider1");
      const provider2 = createMockProvider("provider2");
      const providers = [provider1, provider2];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
        "provider1": false
      });
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 1, "Should enable only one provider");
      assert.ok(result.includes(provider2), "Should include unconfigured provider");
      assert.ok(!result.includes(provider1), "Should not include disabled provider");
    });
    test("should enable providers when explicitly set to true", () => {
      const provider1 = createMockProvider("provider1");
      const provider2 = createMockProvider("provider2");
      const providers = [provider1, provider2];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
        "provider1": true
      });
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 2, "Should enable both providers");
      assert.ok(result.includes(provider1), "Should include explicitly enabled provider");
      assert.ok(result.includes(provider2), "Should include unconfigured provider");
    });
    test("should handle mixed configuration correctly", () => {
      const provider1 = createMockProvider("provider1");
      const provider2 = createMockProvider("provider2");
      const provider3 = createMockProvider("provider3");
      const providers = [provider1, provider2, provider3];
      configurationService.setUserConfiguration(TerminalSuggestSettingId.Providers, {
        "provider1": true,
        "provider2": false
      });
      const result = testTerminalCompletionService.getEnabledProviders(providers);
      assert.strictEqual(result.length, 2, "Should enable two providers");
      assert.ok(result.includes(provider1), "Should include explicitly enabled provider");
      assert.ok(result.includes(provider3), "Should include unconfigured provider");
      assert.ok(!result.includes(provider2), "Should not include disabled provider");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc3VnZ2VzdFxcdGVzdFxcYnJvd3NlclxcdGVybWluYWxDb21wbGV0aW9uU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhLCBJUmVzb2x2ZU1ldGFkYXRhRmlsZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSwgVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zLCB0eXBlIElUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCBhc3NlcnQsIHsgZmFpbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIHR5cGUgSVByb2Nlc3NFbnZpcm9ubWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IFNoZWxsRW52RGV0ZWN0aW9uQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvc2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbENvbXBsZXRpb24sIFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25JdGVtLmpzJztcbmltcG9ydCB7IGNvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxMb2dTZXJ2aWNlLCBXaW5kb3dzU2hlbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGdpdEJhc2hUb1dpbmRvd3NQYXRoLCB3aW5kb3dzVG9HaXRCYXNoUGF0aCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxHaXRCYXNoSGVscGVycy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXJtaW5hbFN1Z2dlc3RDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RQYXRoU2VydmljZSwgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuY29uc3QgcGF0aFNlcGFyYXRvciA9IGlzV2luZG93cyA/ICdcXFxcJyA6ICcvJztcblxuaW50ZXJmYWNlIElBc3NlcnRpb25UZXJtaW5hbENvbXBsZXRpb24ge1xuXHRsYWJlbDogc3RyaW5nO1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cdGtpbmQ/OiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZDtcbn1cblxuaW50ZXJmYWNlIElBc3NlcnRpb25Db21tYW5kTGluZUNvbmZpZyB7XG5cdHJlcGxhY2VtZW50UmFuZ2U6IFtudW1iZXIsIG51bWJlcl07XG59XG5cbi8qKlxuICogQXNzZXJ0IHRoZSBzZXQgb2YgY29tcGxldGlvbnMgZXhpc3QgZXhhY3RseSwgaW5jbHVkaW5nIHRoZWlyIG9yZGVyLlxuICovXG5mdW5jdGlvbiBhc3NlcnRDb21wbGV0aW9ucyhhY3R1YWw6IElUZXJtaW5hbENvbXBsZXRpb25bXSB8IHVuZGVmaW5lZCwgZXhwZWN0ZWQ6IElBc3NlcnRpb25UZXJtaW5hbENvbXBsZXRpb25bXSwgZXhwZWN0ZWRDb25maWc6IElBc3NlcnRpb25Db21tYW5kTGluZUNvbmZpZywgcGF0aFNlcD86IHN0cmluZykge1xuXHRjb25zdCBzZXAgPSBwYXRoU2VwID8/IHBhdGhTZXBhcmF0b3I7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0YWN0dWFsPy5tYXAoZSA9PiAoe1xuXHRcdFx0bGFiZWw6IGUubGFiZWwsXG5cdFx0XHRkZXRhaWw6IGUuZGV0YWlsID8/ICcnLFxuXHRcdFx0a2luZDogZS5raW5kID8/IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IGUucmVwbGFjZW1lbnRSYW5nZSxcblx0XHR9KSksIGV4cGVjdGVkLm1hcChlID0+ICh7XG5cdFx0XHRsYWJlbDogZS5sYWJlbC5yZXBsYWNlQWxsKCcvJywgc2VwKSxcblx0XHRcdGRldGFpbDogZS5kZXRhaWwgPyBlLmRldGFpbC5yZXBsYWNlQWxsKCcvJywgc2VwKSA6ICcnLFxuXHRcdFx0a2luZDogZS5raW5kID8/IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IGV4cGVjdGVkQ29uZmlnLnJlcGxhY2VtZW50UmFuZ2UsXG5cdFx0fSkpXG5cdCk7XG59XG5cbi8qKlxuICogQXNzZXJ0IGEgc2V0IG9mIGNvbXBsZXRpb25zIGV4aXN0IHdpdGhpbiB0aGUgYWN0dWFsIHNldC5cbiAqL1xuZnVuY3Rpb24gYXNzZXJ0UGFydGlhbENvbXBsZXRpb25zRXhpc3QoYWN0dWFsOiBJVGVybWluYWxDb21wbGV0aW9uW10gfCB1bmRlZmluZWQsIGV4cGVjdGVkUGFydGlhbDogSUFzc2VydGlvblRlcm1pbmFsQ29tcGxldGlvbltdLCBleHBlY3RlZENvbmZpZzogSUFzc2VydGlvbkNvbW1hbmRMaW5lQ29uZmlnKSB7XG5cdGlmICghYWN0dWFsKSB7XG5cdFx0ZmFpbCgpO1xuXHR9XG5cdGNvbnN0IGV4cGVjdGVkTWFwcGVkID0gZXhwZWN0ZWRQYXJ0aWFsLm1hcChlID0+ICh7XG5cdFx0bGFiZWw6IGUubGFiZWwucmVwbGFjZUFsbCgnLycsIHBhdGhTZXBhcmF0b3IpLFxuXHRcdGRldGFpbDogZS5kZXRhaWwgPyBlLmRldGFpbC5yZXBsYWNlQWxsKCcvJywgcGF0aFNlcGFyYXRvcikgOiAnJyxcblx0XHRraW5kOiBlLmtpbmQgPz8gVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLFxuXHRcdHJlcGxhY2VtZW50UmFuZ2U6IGV4cGVjdGVkQ29uZmlnLnJlcGxhY2VtZW50UmFuZ2UsXG5cdH0pKTtcblx0Zm9yIChjb25zdCBleHBlY3RlZEl0ZW0gb2YgZXhwZWN0ZWRNYXBwZWQpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5tYXAoZSA9PiAoe1xuXHRcdFx0bGFiZWw6IGUubGFiZWwsXG5cdFx0XHRkZXRhaWw6IGUuZGV0YWlsID8/ICcnLFxuXHRcdFx0a2luZDogZS5raW5kID8/IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlcixcblx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IGUucmVwbGFjZW1lbnRSYW5nZSxcblx0XHR9KSkuZmluZChlID0+IGUuZGV0YWlsID09PSBleHBlY3RlZEl0ZW0uZGV0YWlsKSwgZXhwZWN0ZWRJdGVtKTtcblx0fVxufVxuXG5jb25zdCB0ZXN0RW52OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRIT01FOiAnL2hvbWUvdXNlcicsXG5cdFVTRVJQUk9GSUxFOiAnL2hvbWUvdXNlcidcbn07XG5cbmxldCBob21lRGlyID0gaXNXaW5kb3dzID8gdGVzdEVudlsnVVNFUlBST0ZJTEUnXSA6IHRlc3RFbnZbJ0hPTUUnXTtcbmlmICghaG9tZURpciEuZW5kc1dpdGgoJy8nKSkge1xuXHRob21lRGlyICs9ICcvJztcbn1cbmNvbnN0IHN0YW5kYXJkVGlsZGVJdGVtID0gT2JqZWN0LmZyZWV6ZSh7IGxhYmVsOiAnficsIGRldGFpbDogaG9tZURpciB9KTtcblxuc3VpdGUoJ1Rlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IGNhcGFiaWxpdGllczogVGVybWluYWxDYXBhYmlsaXR5U3RvcmU7XG5cdGxldCB2YWxpZFJlc291cmNlczogVVJJW107XG5cdGxldCBjaGlsZFJlc291cmNlczogeyByZXNvdXJjZTogVVJJOyBpc0ZpbGU/OiBib29sZWFuOyBpc0RpcmVjdG9yeT86IGJvb2xlYW47IGlzU3ltYm9saWNMaW5rPzogYm9vbGVhbjsgZXhlY3V0YWJsZT86IGJvb2xlYW4gfVtdO1xuXHRsZXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZTogVGVybWluYWxDb21wbGV0aW9uU2VydmljZTtcblx0Y29uc3QgcHJvdmlkZXIgPSAndGVzdFByb3ZpZGVyJztcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRwYXRoU2VydmljZTogKCkgPT4gbmV3IFRlc3RQYXRoU2VydmljZShVUkkuZmlsZShob21lRGlyID8/ICcvJykpLFxuXHRcdH0sIHN0b3JlKTtcblx0XHRjb25zdCBub3JtYWxpemVQYXRoID0gKHBhdGg6IHN0cmluZykgPT4gcGF0aCA9PT0gJy8nID8gcGF0aCA6IHBhdGgucmVwbGFjZSgvXFwvKyQvLCAnJyk7XG5cdFx0Y29uc3QgZG9lc1Jlc291cmNlRXhpc3QgPSAocmVzb3VyY2U6IFVSSSkgPT4gdmFsaWRSZXNvdXJjZXMuc29tZShlID0+IG5vcm1hbGl6ZVBhdGgoZS5wYXRoKSA9PT0gbm9ybWFsaXplUGF0aChyZXNvdXJjZS5wYXRoKSkgfHwgY2hpbGRSZXNvdXJjZXMuc29tZShlID0+IG5vcm1hbGl6ZVBhdGgoZS5yZXNvdXJjZS5wYXRoKSA9PT0gbm9ybWFsaXplUGF0aChyZXNvdXJjZS5wYXRoKSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVybWluYWxMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwge1xuXHRcdFx0YXN5bmMgc3RhdChyZXNvdXJjZSkge1xuXHRcdFx0XHRpZiAoIWRvZXNSZXNvdXJjZUV4aXN0KHJlc291cmNlKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignRG9lc25cXCd0IGV4aXN0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlKTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyByZXNvbHZlKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElSZXNvbHZlTWV0YWRhdGFGaWxlT3B0aW9ucyk6IFByb21pc2U8SUZpbGVTdGF0V2l0aE1ldGFkYXRhPiB7XG5cdFx0XHRcdGlmICghZG9lc1Jlc291cmNlRXhpc3QocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEb2VzblxcJ3QgZXhpc3QnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjaGlsZHJlbiA9IGNoaWxkUmVzb3VyY2VzLmZpbHRlcihjaGlsZCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRGc1BhdGggPSBjaGlsZC5yZXNvdXJjZS5wYXRoLnJlcGxhY2UoL1xcLyQvLCAnJyk7XG5cdFx0XHRcdFx0Y29uc3QgcGFyZW50RnNQYXRoID0gcmVzb3VyY2UucGF0aC5yZXBsYWNlKC9cXC8kLywgJycpO1xuXHRcdFx0XHRcdHJldHVybiAoXG5cdFx0XHRcdFx0XHRjaGlsZEZzUGF0aC5zdGFydHNXaXRoKHBhcmVudEZzUGF0aCkgJiZcblx0XHRcdFx0XHRcdGNvdW50KGNoaWxkRnNQYXRoLCAnLycpID09PSBjb3VudChwYXJlbnRGc1BhdGgsICcvJykgKyAxXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVGaWxlU3RhdChyZXNvdXJjZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBjaGlsZHJlbik7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgcmVhbHBhdGgocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZS5wYXRoLmluY2x1ZGVzKCdzeW1saW5rLWZpbGUnKSkge1xuXHRcdFx0XHRcdHJldHVybiByZXNvdXJjZS53aXRoKHsgcGF0aDogJy90YXJnZXQvYWN0dWFsLWZpbGUudHh0JyB9KTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXNvdXJjZS5wYXRoLmluY2x1ZGVzKCdzeW1saW5rLWZvbGRlcicpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc291cmNlLndpdGgoeyBwYXRoOiAnL3RhcmdldC9hY3R1YWwtZm9sZGVyJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxDb21wbGV0aW9uU2VydmljZSkpO1xuXHRcdHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucHJvY2Vzc0VudiA9IHRlc3RFbnY7XG5cdFx0dmFsaWRSZXNvdXJjZXMgPSBbXTtcblx0XHRjaGlsZFJlc291cmNlcyA9IFtdO1xuXHRcdGNhcGFiaWxpdGllcyA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlUmVzb3VyY2VzIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2lmIG5laXRoZXIgc2hvd0ZpbGVzIG5vciBzaG93RGlyZWN0b3JpZXMgYXJlIHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnY2QgJywgMywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cdFx0XHRhc3NlcnQoIXJlc3VsdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlUmVzb3VyY2VzIHNob3VsZCByZXR1cm4gZm9sZGVyIGNvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyldO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjEvJyksIGlzRGlyZWN0b3J5OiB0cnVlLCBpc0ZpbGU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZpbGUxLnR4dCcpLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0XTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3wgc2hvdWxkIHJldHVybiByb290LWxldmVsIGNvbXBsZXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJycsIDEsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLi8nLCBkZXRhaWw6ICcvJyB9LFxuXHRcdFx0XHRzdGFuZGFyZFRpbGRlSXRlbSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzEsIDFdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLi98IHNob3VsZCByZXR1cm4gZm9sZGVyIGNvbXBsZXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy4vJywgMywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLi8nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy4uLycsIGRldGFpbDogJy8nIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFsxLCAzXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy4uL3wgc2hvdWxkIHJldHVybiBwYXJlbnQgZm9sZGVyIGNvbXBsZXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU2NlbmFyaW86IGN3ZCBpcyAvcGFyZW50L2ZvbGRlcjEsIHNpYmxpbmcgaXMgL3BhcmVudC9mb2xkZXIyXG5cdFx0XHQvLyBXaGVuIHR5cGluZyAuLi8sIHNob3VsZCBzZWUgY29udGVudHMgb2YgL3BhcmVudC8gKGZvbGRlcjEgYW5kIGZvbGRlcjIpXG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3BhcmVudC9mb2xkZXIxJyksXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy9wYXJlbnQnKSxcblx0XHRcdF07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3BhcmVudC9mb2xkZXIxLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vcGFyZW50L2ZvbGRlcjIvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3BhcmVudC9mb2xkZXIxJyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcuLi8nLCAzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuLi8nLCBkZXRhaWw6ICcvcGFyZW50LycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4uL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3BhcmVudC9mb2xkZXIxLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4uL2ZvbGRlcjIvJywgZGV0YWlsOiAnL3BhcmVudC9mb2xkZXIyLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4uLy4uLycsIGRldGFpbDogJy8nIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAzXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NkIC4vfCBzaG91bGQgcmV0dXJuIGZvbGRlciBjb21wbGV0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdjZCAuLycsIDUsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4vJywgZGV0YWlsOiAnL3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIxLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi8uLi8nLCBkZXRhaWw6ICcvJyB9LFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMywgNV0gfSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnY2QgLi9mfCBzaG91bGQgcmV0dXJuIGZvbGRlciBjb21wbGV0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdjZCAuL2YnLCA2LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuLycsIGRldGFpbDogJy90ZXN0LycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZm9sZGVyMS8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXIxLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzMsIDZdIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZVJlc291cmNlcyBzaG91bGQgaGFuZGxlIGZpbGUgYW5kIGZvbGRlciBjb21wbGV0aW9uIHJlcXVlc3RzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpXTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC8uaGlkZGVuRmlsZScpLCBpc0ZpbGU6IHRydWUsIGV4ZWN1dGFibGU6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvLmhpZGRlbkZvbGRlci8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZmlsZTEudHh0JyksIGlzRmlsZTogdHJ1ZSwgZXhlY3V0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy4vfCBzaG91bGQgaGFuZGxlIGhpZGRlbiBmaWxlcyBhbmQgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy4vJywgMiwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLi8nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy5oaWRkZW5GaWxlJywgZGV0YWlsOiAnL3Rlc3QvLmhpZGRlbkZpbGUnLCBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy5oaWRkZW5Gb2xkZXIvJywgZGV0YWlsOiAnL3Rlc3QvLmhpZGRlbkZvbGRlci8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlcjEvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyMS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZpbGUxLnR4dCcsIGRldGFpbDogJy90ZXN0L2ZpbGUxLnR4dCcsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDJdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLi9ofCBzaG91bGQgaGFuZGxlIGhpZGRlbiBmaWxlcyBhbmQgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy4vaCcsIDMsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4vJywgZGV0YWlsOiAnL3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi8uaGlkZGVuRmlsZScsIGRldGFpbDogJy90ZXN0Ly5oaWRkZW5GaWxlJywga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi8uaGlkZGVuRm9sZGVyLycsIGRldGFpbDogJy90ZXN0Ly5oaWRkZW5Gb2xkZXIvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIxLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9maWxlMS50eHQnLCBkZXRhaWw6ICcvdGVzdC9maWxlMS50eHQnLCBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuLy4uLycsIGRldGFpbDogJy8nIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAzXSB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ34gLT4gJEhPTUUnLCAoKSA9PiB7XG5cdFx0bGV0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zO1xuXHRcdGxldCBzaGVsbEVudkRldGVjdGlvbjogU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2hlbGxFbnZEZXRlY3Rpb24gPSBzdG9yZS5hZGQobmV3IFNoZWxsRW52RGV0ZWN0aW9uQ2FwYWJpbGl0eSgpKTtcblx0XHRcdHNoZWxsRW52RGV0ZWN0aW9uLnNldEVudmlyb25tZW50KHtcblx0XHRcdFx0SE9NRTogJy9ob21lJyxcblx0XHRcdFx0VVNFUlBST0ZJTEU6ICcvaG9tZSdcblx0XHRcdH0sIHRydWUpO1xuXHRcdFx0Y2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuU2hlbGxFbnZEZXRlY3Rpb24sIHNoZWxsRW52RGV0ZWN0aW9uKTtcblxuXHRcdFx0cmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjEnKSwvLyBVcGRhdGVkIHRvIHJlZmxlY3QgaG9tZSBkaXJlY3Rvcnlcblx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMScpLFxuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZScpLFxuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS92c2NvZGUnKSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdnNjb2RlL2ZvbycpLFxuXHRcdFx0XHRVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS92c2NvZGUvYmFyLnR4dCcpLFxuXHRcdFx0XTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS92c2NvZGUnKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdnNjb2RlL2ZvbycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS92c2NvZGUvYmFyLnR4dCcpLCBpc0ZpbGU6IHRydWUsIGV4ZWN1dGFibGU6IHRydWUgfSxcblx0XHRcdF07XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd+fCBzaG91bGQgcmV0dXJuIGNvbXBsZXRpb24gZm9yIH4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnRQYXJ0aWFsQ29tcGxldGlvbnNFeGlzdChhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnficsIDEsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICd+JywgZGV0YWlsOiAnL2hvbWUvJyB9LFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgMV0gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd+L3wgc2hvdWxkIHJldHVybiBmb2xkZXIgY29tcGxldGlvbnMgcmVsYXRpdmUgdG8gJEhPTUUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnfi8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnfi8nLCBkZXRhaWw6ICcvaG9tZS8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd+L3ZzY29kZS8nLCBkZXRhaWw6ICcvaG9tZS92c2NvZGUvJyB9LFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgMl0gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd+L3ZzY29kZS98IHNob3VsZCByZXR1cm4gZm9sZGVyIGNvbXBsZXRpb25zIHJlbGF0aXZlIHRvICRIT01FL3ZzY29kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydENvbXBsZXRpb25zKGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICd+L3ZzY29kZS8nLCA5LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnfi92c2NvZGUvJywgZGV0YWlsOiAnL2hvbWUvdnNjb2RlLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJ34vdnNjb2RlL2Zvby8nLCBkZXRhaWw6ICcvaG9tZS92c2NvZGUvZm9vLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJ34vdnNjb2RlL2Jhci50eHQnLCBkZXRhaWw6ICcvaG9tZS92c2NvZGUvYmFyLnR4dCcsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDldIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZVJlc291cmNlcyBlZGdlIGNhc2VzIGFuZCBhZHZhbmNlZCBzY2VuYXJpb3MnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbXTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW107XG5cdFx0fSk7XG5cblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHR0ZXN0KCdDOi9Gb28vfCBhYnNvbHV0ZSBwYXRocyBvbiBXaW5kb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy9DOicpLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy9DOi9Gb28nKV07XG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9DOi9Gb28vQmFyJyksIGlzRGlyZWN0b3J5OiB0cnVlLCBpc0ZpbGU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL0M6L0Zvby9CYXoudHh0JyksIGlzRGlyZWN0b3J5OiBmYWxzZSwgaXNGaWxlOiB0cnVlIH1cblx0XHRcdFx0XTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ0M6L0Zvby8nLCA3LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnQzovRm9vLycsIGRldGFpbDogJ0M6L0Zvby8nIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ0M6L0Zvby9CYXIvJywgZGV0YWlsOiAnQzovRm9vL0Jhci8nIH0sXG5cdFx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDddIH0pO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdjOi9mb28vfCBjYXNlIGluc2Vuc2l0aXZpdHkgb24gV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYzonKSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0XHR9O1xuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vYzovZm9vJyldO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYzovZm9vL0JhcicpLCBpc0RpcmVjdG9yeTogdHJ1ZSwgaXNGaWxlOiBmYWxzZSB9XG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdjOi9mb28vJywgNywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdFx0Ly8gTm90ZSB0aGF0IHRoZSBkZXRhaWwgaXMgbm9ybWFsaXplcyBkcml2ZSBsZXR0ZXJzIHRvIGNhcGl0YWwgY2FzZSBpbnRlbnRpb25hbGx5XG5cdFx0XHRcdFx0eyBsYWJlbDogJ2M6L2Zvby8nLCBkZXRhaWw6ICdDOi9mb28vJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICdjOi9mb28vQmFyLycsIGRldGFpbDogJ0M6L2Zvby9CYXIvJyB9LFxuXHRcdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCA3XSB9KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZXN0KCcvZm9vL3wgYWJzb2x1dGUgcGF0aHMgTk9UIG9uIFdpbmRvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vLycpLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy9mb28nKV07XG5cdFx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9mb28vQmFyJyksIGlzRGlyZWN0b3J5OiB0cnVlLCBpc0ZpbGU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL2Zvby9CYXoudHh0JyksIGlzRGlyZWN0b3J5OiBmYWxzZSwgaXNGaWxlOiB0cnVlIH1cblx0XHRcdFx0XTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy9mb28vJywgNSwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJy9mb28vJywgZGV0YWlsOiAnL2Zvby8nIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy9mb28vQmFyLycsIGRldGFpbDogJy9mb28vQmFyLycgfSxcblx0XHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgNV0gfSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHR0ZXN0KCcuXFxcXGZvbGRlciB8IENhc2UgaW5zZW5zaXRpdml0eSBzaG91bGQgcmVzb2x2ZSBjb3JyZWN0bHkgb24gV2luZG93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vQzovdGVzdCcpLFxuXHRcdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yOiAnXFxcXCdcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vQzovdGVzdCcpXTtcblx0XHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL0M6L3Rlc3QvRm9sZGVyQS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vQzovdGVzdC9hbm90aGVyRm9sZGVyLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9XG5cdFx0XHRcdF07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy5cXFxcZm9sZGVyJywgOCwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJy5cXFxcJywgZGV0YWlsOiAnQzpcXFxcdGVzdFxcXFwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy5cXFxcRm9sZGVyQVxcXFwnLCBkZXRhaWw6ICdDOlxcXFx0ZXN0XFxcXEZvbGRlckFcXFxcJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcuXFxcXGFub3RoZXJGb2xkZXJcXFxcJywgZGV0YWlsOiAnQzpcXFxcdGVzdFxcXFxhbm90aGVyRm9sZGVyXFxcXCcgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnLlxcXFwuLlxcXFwnLCBkZXRhaWw6ICdDOlxcXFwnIH0sXG5cdFx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDhdIH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlc3QoJy4vZm9sZGVyIHwgQ2FzZSBzZW5zaXRpdml0eSBzaG91bGQgcmVzb2x2ZSBjb3JyZWN0bHkgb24gTWFjL1VuaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvcjogJy8nXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyldO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9Gb2xkZXJBLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcmEvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH1cblx0XHRcdFx0XTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi9mb2xkZXInLCA4LCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnLi8nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy4vRm9sZGVyQS8nLCBkZXRhaWw6ICcvdGVzdC9Gb2xkZXJBLycgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXJhLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcmEvJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcuLy4uLycsIGRldGFpbDogJy8nIH1cblx0XHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgOF0gfSk7XG5cdFx0XHR9KTtcblxuXHRcdH1cblx0XHR0ZXN0KCd8IEVtcHR5IGlucHV0IHNob3VsZCByZXNvbHZlIHRvIGN1cnJlbnQgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMi8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcnLCAwLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuJywgZGV0YWlsOiAnL3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIxLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIyLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjIvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi4vJywgZGV0YWlsOiAnLycgfSxcblx0XHRcdFx0c3RhbmRhcmRUaWxkZUl0ZW0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAwXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgZW52aXJvbm1lbnQgdmFyaWFibGUgc2V0dGluZyBwcmVmaXhlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyldO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjEvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjIvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnRk9PPS4vJywgMiwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdC8vIE11c3Qgbm90IGluY2x1ZGUgRk9PPSBwcmVmaXggaW4gY29tcGxldGlvbnNcblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLicsIGRldGFpbDogJy90ZXN0LycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZm9sZGVyMS8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXIxLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vZm9sZGVyMi8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXIyLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4uLycsIGRldGFpbDogJy8nIH0sXG5cdFx0XHRcdHN0YW5kYXJkVGlsZGVJdGVtLFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgMl0gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJldHVybiBjb21wbGV0aW9ucyB3aGVuIHJlbGF0aXZlIGZvbGRlciBwcmVmaXggZG9lcyBub3QgZXhpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpXTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9zcmMvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3ZzLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ3MvJywgMiwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcuL3wgc2hvdWxkIGhhbmRsZSBsYXJnZSBkaXJlY3RvcmllcyB3aXRoIG1hbnkgcmVzdWx0cyBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cdFx0XHRjaGlsZFJlc291cmNlcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEwMDAgfSwgKF8sIGkpID0+ICh7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoYGZpbGU6Ly8vdGVzdC9mb2xkZXIke2l9L2ApLFxuXHRcdFx0XHRpc0RpcmVjdG9yeTogdHJ1ZVxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy4vJywgMiwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydChyZXN1bHQpO1xuXHRcdFx0Ly8gaW5jbHVkZXMgdGhlIDEwMDAgZm9sZGVycyArIC4vIGFuZCAuLy4uL1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdD8ubGVuZ3RoLCAxMDAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubGFiZWwsIGAuJHtwYXRoU2VwYXJhdG9yfWApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5hdCgtMSk/LmxhYmVsLCBgLiR7cGF0aFNlcGFyYXRvcn0uLiR7cGF0aFNlcGFyYXRvcn1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy4vZm9sZGVyfCBzaG91bGQgaW5jbHVkZSBjdXJyZW50IGZvbGRlciB3aXRoIHRyYWlsaW5nIC8gaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdHNob3dEaXJlY3RvcmllczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyldO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjEvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjIvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi9mb2xkZXIxJywgMTAsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4vJywgZGV0YWlsOiAnL3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIxLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjEvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9mb2xkZXIyLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjIvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi8uLi8nLCBkZXRhaWw6ICcvJyB9XG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFsxLCAxMF0gfSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJlc29sdmUgbmVzdGVkIGZvbGRlciB3aGVuIG5hbWUgbWF0Y2hlcyBjd2QgYmFzZW5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvdGVzdCcpLFxuXHRcdFx0XTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0LycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC90ZXN0L2lubmVyLycpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJ3Rlc3QvJywgNSwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydENvbXBsZXRpb25zKHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnLi90ZXN0LycsIGRldGFpbDogJy90ZXN0L3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi90ZXN0L2lubmVyLycsIGRldGFpbDogJy90ZXN0L3Rlc3QvaW5uZXIvJyB9LFxuXHRcdFx0XHQvLyAuLi9gIGZyb20gdGhlIHZpZXdlZCBmb2xkZXIgKC90ZXN0L3Rlc3QvKSBnb2VzIHRvIC90ZXN0Lywgbm90IC9cblx0XHRcdFx0eyBsYWJlbDogJy4vdGVzdC8uLi8nLCBkZXRhaWw6ICcvdGVzdC8nIH1cblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDVdIH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Rlc3QvfCBzaG91bGQgbm9ybWFsaXplIGN1cnJlbnQgYW5kIHBhcmVudCBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRwYXRoU2VwYXJhdG9yXG5cdFx0XHR9O1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjEnKSxcblx0XHRcdFx0VVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyMicpXG5cdFx0XHRdO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjEvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L2ZvbGRlcjIvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi90ZXN0LycsIDcsIHByb3ZpZGVyLCBjYXBhYmlsaXRpZXMpO1xuXG5cdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJy4vdGVzdC8nLCBkZXRhaWw6ICcvdGVzdC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL3Rlc3QvZm9sZGVyMS8nLCBkZXRhaWw6ICcvdGVzdC9mb2xkZXIxLycgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4vdGVzdC9mb2xkZXIyLycsIGRldGFpbDogJy90ZXN0L2ZvbGRlcjIvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi90ZXN0Ly4uLycsIGRldGFpbDogJy8nIH1cblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDddIH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2RwYXRoJywgKCkgPT4ge1xuXHRcdGxldCBzaGVsbEVudkRldGVjdGlvbjogU2hlbGxFbnZEZXRlY3Rpb25DYXBhYmlsaXR5O1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdFVSSS5wYXJzZSgnZmlsZTovLy9jZHBhdGhfdmFsdWUnKVxuXHRcdFx0XTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vY2RwYXRoX3ZhbHVlL2ZvbGRlcjEvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy9jZHBhdGhfdmFsdWUvZmlsZTEudHh0JyksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0XTtcblxuXHRcdFx0c2hlbGxFbnZEZXRlY3Rpb24gPSBzdG9yZS5hZGQobmV3IFNoZWxsRW52RGV0ZWN0aW9uQ2FwYWJpbGl0eSgpKTtcblx0XHRcdHNoZWxsRW52RGV0ZWN0aW9uLnNldEVudmlyb25tZW50KHsgQ0RQQVRIOiAnL2NkcGF0aF92YWx1ZScgfSwgdHJ1ZSk7XG5cdFx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5TaGVsbEVudkRldGVjdGlvbiwgc2hlbGxFbnZEZXRlY3Rpb24pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2QgfCBzaG91bGQgc2hvdyBwYXRocyBmcm9tICRDRFBBVEggKHJlbGF0aXZlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnN1Z2dlc3QuY2RQYXRoJywgJ3JlbGF0aXZlJyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHNob3dGaWxlczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICdjZCAnLCAzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0UGFydGlhbENvbXBsZXRpb25zRXhpc3QocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdmb2xkZXIxJywgZGV0YWlsOiAnQ0RQQVRIIC9jZHBhdGhfdmFsdWUvZm9sZGVyMS8nIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFszLCAzXSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NkIHwgc2hvdWxkIHNob3cgcGF0aHMgZnJvbSAkQ0RQQVRIIChhYnNvbHV0ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbigndGVybWluYWwuaW50ZWdyYXRlZC5zdWdnZXN0LmNkUGF0aCcsICdhYnNvbHV0ZScpO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdGN3ZDogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnY2QgJywgMywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGFzc2VydFBhcnRpYWxDb21wbGV0aW9uc0V4aXN0KHJlc3VsdCwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnL2NkcGF0aF92YWx1ZS9mb2xkZXIxLycsIGRldGFpbDogJ0NEUEFUSCcgfSxcblx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzMsIDNdIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2QgfCBzaG91bGQgc3VwcG9ydCBwdWxsaW5nIGZyb20gbXVsdGlwbGUgcGF0aHMgaW4gJENEUEFUSCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnN1Z2dlc3QuY2RQYXRoJywgJ3JlbGF0aXZlJyk7XG5cdFx0XHRjb25zdCBwYXRoUHJlZml4ID0gaXNXaW5kb3dzID8gJ2M6XFxcXCcgOiAnLyc7XG5cdFx0XHRjb25zdCBkZWxpbWV0ZXIgPSBpc1dpbmRvd3MgPyAnOycgOiAnOic7XG5cdFx0XHRjb25zdCBzZXBhcmF0b3IgPSBpc1dpbmRvd3MgPyAnXFxcXCcgOiAnLyc7XG5cdFx0XHRzaGVsbEVudkRldGVjdGlvbi5zZXRFbnZpcm9ubWVudCh7IENEUEFUSDogYCR7cGF0aFByZWZpeH1jZHBhdGgxX3ZhbHVlJHtkZWxpbWV0ZXJ9JHtwYXRoUHJlZml4fWNkcGF0aDJfdmFsdWUke3NlcGFyYXRvcn1pbm5lcl9kaXJgIH0sIHRydWUpO1xuXG5cdFx0XHRjb25zdCB1cmlQYXRoUHJlZml4ID0gaXNXaW5kb3dzID8gJ2ZpbGU6Ly8vYzovJyA6ICdmaWxlOi8vLyc7XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0VVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9dGVzdGApLFxuXHRcdFx0XHRVUkkucGFyc2UoYCR7dXJpUGF0aFByZWZpeH1jZHBhdGgxX3ZhbHVlYCksXG5cdFx0XHRcdFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fWNkcGF0aDJfdmFsdWVgKSxcblx0XHRcdFx0VVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9Y2RwYXRoMl92YWx1ZS9pbm5lcl9kaXJgKVxuXHRcdFx0XTtcblx0XHRcdGNoaWxkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoYCR7dXJpUGF0aFByZWZpeH1jZHBhdGgxX3ZhbHVlL2ZvbGRlcjEvYCksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fWNkcGF0aDFfdmFsdWUvZm9sZGVyMi9gKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKGAke3VyaVBhdGhQcmVmaXh9Y2RwYXRoMV92YWx1ZS9maWxlMS50eHRgKSwgaXNGaWxlOiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fWNkcGF0aDJfdmFsdWUvaW5uZXJfZGlyL2ZvbGRlcjEvYCksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fWNkcGF0aDJfdmFsdWUvaW5uZXJfZGlyL2ZvbGRlcjIvYCksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fWNkcGF0aDJfdmFsdWUvaW5uZXJfZGlyL2ZpbGUxLnR4dGApLCBpc0ZpbGU6IHRydWUgfSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc291cmNlT3B0aW9uczogVGVybWluYWxDb21wbGV0aW9uUmVzb3VyY2VPcHRpb25zID0ge1xuXHRcdFx0XHRjd2Q6IFVSSS5wYXJzZShgJHt1cmlQYXRoUHJlZml4fXRlc3RgKSxcblx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdHBhdGhTZXBhcmF0b3Jcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnY2QgJywgMywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdGNvbnN0IGZpbmFsUHJlZml4ID0gaXNXaW5kb3dzID8gJ0M6XFxcXCcgOiAnLyc7XG5cdFx0XHRhc3NlcnRQYXJ0aWFsQ29tcGxldGlvbnNFeGlzdChyZXN1bHQsIFtcblx0XHRcdFx0eyBsYWJlbDogJ2ZvbGRlcjEnLCBkZXRhaWw6IGBDRFBBVEggJHtmaW5hbFByZWZpeH1jZHBhdGgxX3ZhbHVlL2ZvbGRlcjEvYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZm9sZGVyMicsIGRldGFpbDogYENEUEFUSCAke2ZpbmFsUHJlZml4fWNkcGF0aDFfdmFsdWUvZm9sZGVyMi9gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdmb2xkZXIxJywgZGV0YWlsOiBgQ0RQQVRIICR7ZmluYWxQcmVmaXh9Y2RwYXRoMl92YWx1ZS9pbm5lcl9kaXIvZm9sZGVyMS9gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdmb2xkZXIyJywgZGV0YWlsOiBgQ0RQQVRIICR7ZmluYWxQcmVmaXh9Y2RwYXRoMl92YWx1ZS9pbm5lcl9kaXIvZm9sZGVyMi9gIH0sXG5cdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFszLCAzXSB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0aWYgKGlzV2luZG93cykge1xuXHRcdHN1aXRlKCdnaXRiYXNoJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnc2hvdWxkIGNvbnZlcnQgR2l0IEJhc2ggYWJzb2x1dGUgcGF0aCB0byBXaW5kb3dzIGFic29sdXRlIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRCYXNoVG9XaW5kb3dzUGF0aCgnLycpLCAnQzpcXFxcJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRCYXNoVG9XaW5kb3dzUGF0aCgnL2MvJyksICdDOlxcXFwnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdEJhc2hUb1dpbmRvd3NQYXRoKCcvYy9Vc2Vycy9mb28nKSwgJ0M6XFxcXFVzZXJzXFxcXGZvbycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0QmFzaFRvV2luZG93c1BhdGgoJy9kL2JhcicpLCAnRDpcXFxcYmFyJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGNvbnZlcnQgV2luZG93cyBhYnNvbHV0ZSBwYXRoIHRvIEdpdCBCYXNoIGFic29sdXRlIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aW5kb3dzVG9HaXRCYXNoUGF0aCgnQzpcXFxcJyksICcvYy8nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdpbmRvd3NUb0dpdEJhc2hQYXRoKCdDOlxcXFxVc2Vyc1xcXFxmb28nKSwgJy9jL1VzZXJzL2ZvbycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2luZG93c1RvR2l0QmFzaFBhdGgoJ0Q6XFxcXGJhcicpLCAnL2QvYmFyJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aW5kb3dzVG9HaXRCYXNoUGF0aCgnRTpcXFxcc29tZVxcXFxwYXRoJyksICcvZS9zb21lL3BhdGgnKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXNvbHZlUmVzb3VyY2VzIHdpdGggYzovIHN0eWxlIGFic29sdXRlIHBhdGggZm9yIEdpdCBCYXNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb28nKSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3I6ICcvJ1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vJyksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXInKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhei50eHQnKVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhcicpLCBpc0RpcmVjdG9yeTogdHJ1ZSwgaXNGaWxlOiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmF6LnR4dCcpLCBpc0ZpbGU6IHRydWUsIGV4ZWN1dGFibGU6IHRydWUgfVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnQzovVXNlcnMvZm9vLycsIDEzLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gpO1xuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnQzovVXNlcnMvZm9vLycsIGRldGFpbDogJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ0M6L1VzZXJzL2Zvby9iYXIvJywgZGV0YWlsOiAnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhclxcXFwnIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ0M6L1VzZXJzL2Zvby9iYXoudHh0JywgZGV0YWlsOiAnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhei50eHQnLCBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlIH0sXG5cdFx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDEzXSB9LCAnLycpO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdyZXNvbHZlUmVzb3VyY2VzIHdpdGggY3dkIGFzIFdpbmRvd3MgcGF0aCAocmVsYXRpdmUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb28nKSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3I6ICcvJ1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vJyksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXInKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhei50eHQnKVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhcicpLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmF6LnR4dCcpLCBpc0ZpbGU6IHRydWUsIGV4ZWN1dGFibGU6IHRydWUgfVxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnLi8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzLCBXaW5kb3dzU2hlbGxUeXBlLkdpdEJhc2gpO1xuXHRcdFx0XHRhc3NlcnRDb21wbGV0aW9ucyhyZXN1bHQsIFtcblx0XHRcdFx0XHR7IGxhYmVsOiAnLi8nLCBkZXRhaWw6ICdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcuL2Jhci8nLCBkZXRhaWw6ICdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmFyXFxcXCcgfSxcblx0XHRcdFx0XHR7IGxhYmVsOiAnLi9iYXoudHh0JywgZGV0YWlsOiAnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhei50eHQnLCBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJy4vLi4vJywgZGV0YWlsOiAnQzpcXFxcVXNlcnNcXFxcJyB9XG5cdFx0XHRcdF0sIHsgcmVwbGFjZW1lbnRSYW5nZTogWzAsIDJdIH0sICcvJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVzb2x2ZVJlc291cmNlcyB3aXRoIGN3ZCBhcyBXaW5kb3dzIHBhdGggKGFic29sdXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vJyksXG5cdFx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRcdHNob3dGaWxlczogdHJ1ZSxcblx0XHRcdFx0XHRwYXRoU2VwYXJhdG9yOiAnLydcblx0XHRcdFx0fTtcblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0VVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvbycpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcYmFyJyksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXoudHh0Jylcblx0XHRcdFx0XTtcblx0XHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXInKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcVXNlcnNcXFxcZm9vXFxcXGJhei50eHQnKSwgaXNGaWxlOiB0cnVlLCBleGVjdXRhYmxlOiB0cnVlIH1cblx0XHRcdFx0XTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy9jL1VzZXJzL2Zvby8nLCAxMywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcywgV2luZG93c1NoZWxsVHlwZS5HaXRCYXNoKTtcblx0XHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJy9jL1VzZXJzL2Zvby8nLCBkZXRhaWw6ICdDOlxcXFxVc2Vyc1xcXFxmb29cXFxcJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcvYy9Vc2Vycy9mb28vYmFyLycsIGRldGFpbDogJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXJcXFxcJyB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICcvYy9Vc2Vycy9mb28vYmF6LnR4dCcsIGRldGFpbDogJ0M6XFxcXFVzZXJzXFxcXGZvb1xcXFxiYXoudHh0Jywga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSB9LFxuXHRcdFx0XHRdLCB7IHJlcGxhY2VtZW50UmFuZ2U6IFswLCAxM10gfSwgJy8nKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0c3VpdGUoJ3N5bWxpbmsgc3VwcG9ydCcsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Nob3VsZCBpbmNsdWRlIHN5bWxpbmsgdGFyZ2V0IGluZm9ybWF0aW9uIGluIGNvbXBsZXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyksXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvcixcblx0XHRcdFx0XHRzaG93RmlsZXM6IHRydWUsXG5cdFx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QnKV07XG5cblx0XHRcdFx0Ly8gQ3JlYXRlIG1vY2sgY2hpbGRyZW4gaW5jbHVkaW5nIGEgc3ltYm9saWMgbGlua1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9yZWd1bGFyLWZpbGUudHh0JyksIGlzRmlsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L3N5bWxpbmstZmlsZScpLCBpc0ZpbGU6IHRydWUsIGlzU3ltYm9saWNMaW5rOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3Qvc3ltbGluay1mb2xkZXInKSwgaXNEaXJlY3Rvcnk6IHRydWUsIGlzU3ltYm9saWNMaW5rOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvcmVndWxhci1mb2xkZXInKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0XTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnbHMgJywgMywgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdFx0Ly8gRmluZCB0aGUgc3ltbGluayBjb21wbGV0aW9uXG5cdFx0XHRcdGNvbnN0IHN5bWxpbmtGaWxlQ29tcGxldGlvbiA9IHJlc3VsdD8uZmluZChjID0+IGMubGFiZWwgPT09ICcuL3N5bWxpbmstZmlsZScpO1xuXHRcdFx0XHRjb25zdCBzeW1saW5rRm9sZGVyQ29tcGxldGlvbiA9IHJlc3VsdD8uZmluZChjID0+IGMubGFiZWwgPT09ICcuL3N5bWxpbmstZm9sZGVyLycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ltbGlua0ZpbGVDb21wbGV0aW9uPy5kZXRhaWwsICcvdGVzdC9zeW1saW5rLWZpbGUgLT4gL3RhcmdldC9hY3R1YWwtZmlsZS50eHQnLCAnU3ltbGluayBmaWxlIGRldGFpbCBzaG91bGQgbWF0Y2ggdGFyZ2V0Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzeW1saW5rRm9sZGVyQ29tcGxldGlvbj8uZGV0YWlsLCAnL3Rlc3Qvc3ltbGluay1mb2xkZXIgLT4gL3RhcmdldC9hY3R1YWwtZm9sZGVyJywgJ1N5bWxpbmsgZm9sZGVyIGRldGFpbCBzaG91bGQgbWF0Y2ggdGFyZ2V0Jyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXHRpZiAoIWlzV2luZG93cykge1xuXHRcdHN1aXRlKCdyZW1vdGUgZmlsZSBjb21wbGV0aW9uIChlLmcuIFdTTCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZW1vdGVBdXRob3JpdHkgPSAnd3NsK1VidW50dSc7XG5cdFx0XHRjb25zdCByZW1vdGVUZXN0RW52OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRcdFx0XHRIT01FOiAnL2hvbWUvcmVtb3RldXNlcicsXG5cdFx0XHRcdFVTRVJQUk9GSUxFOiAnL2hvbWUvcmVtb3RldXNlcidcblx0XHRcdH07XG5cblx0XHRcdHRlc3QoJy9hYnNvbHV0ZS9wYXRoIHNob3VsZCBwcmVzZXJ2ZSByZW1vdGUgYXV0aG9yaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnByb2Nlc3NFbnYgPSByZW1vdGVUZXN0RW52O1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlcicgfSksXG5cdFx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3I6ICcvJ1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lJyB9KSxcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXInIH0pLFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjaGlsZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXInIH0pLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnL2hvbWUvJywgNiwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCByZXN1bHRzIGV4aXN0IGFuZCBoYXZlIHRoZSBjb3JyZWN0IHNjaGVtZS9hdXRob3JpdHlcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCAmJiByZXN1bHQubGVuZ3RoID4gMCwgJ1Nob3VsZCByZXR1cm4gY29tcGxldGlvbnMgZm9yIHJlbW90ZSBhYnNvbHV0ZSBwYXRoJyk7XG5cdFx0XHRcdC8vIFZlcmlmeSBjb21wbGV0aW9ucyBjb250YWluIHBhdGhzIHJlc29sdmVkIHZpYSB0aGUgcmVtb3RlIGZpbGUgc2VydmljZSAobm90IGxvY2FsIGZpbGU6Ly8pXG5cdFx0XHRcdGNvbnN0IGFic29sdXRlQ29tcGxldGlvbiA9IHJlc3VsdD8uZmluZChjID0+IGMubGFiZWwgPT09ICcvaG9tZS8nKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGFic29sdXRlQ29tcGxldGlvbiwgJ1Nob3VsZCBoYXZlIGFic29sdXRlIHBhdGggY29tcGxldGlvbicpO1xuXHRcdFx0XHRhc3NlcnQub2soYWJzb2x1dGVDb21wbGV0aW9uLmRldGFpbD8uaW5jbHVkZXMoJy9ob21lLycpLCAnRGV0YWlsIHNob3VsZCBzaG93IHJlbW90ZSBwYXRoJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnfi8gc2hvdWxkIHByZXNlcnZlIHJlbW90ZSBhdXRob3JpdHkgZm9yIHRpbGRlIGV4cGFuc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGVybWluYWxDb21wbGV0aW9uU2VydmljZS5wcm9jZXNzRW52ID0gcmVtb3RlVGVzdEVudjtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2VPcHRpb25zOiBUZXJtaW5hbENvbXBsZXRpb25SZXNvdXJjZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0Y3dkOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXIvcHJvamVjdCcgfSksXG5cdFx0XHRcdFx0c2hvd0RpcmVjdG9yaWVzOiB0cnVlLFxuXHRcdFx0XHRcdHBhdGhTZXBhcmF0b3I6ICcvJ1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXInIH0pLFxuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlci9wcm9qZWN0JyB9KSxcblx0XHRcdFx0XTtcblx0XHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksIHBhdGg6ICcvaG9tZS9yZW1vdGV1c2VyL0RvY3VtZW50cycgfSksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksIHBhdGg6ICcvaG9tZS9yZW1vdGV1c2VyL3Byb2plY3QnIH0pLCBpc0RpcmVjdG9yeTogdHJ1ZSB9LFxuXHRcdFx0XHRdO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnJlc29sdmVSZXNvdXJjZXMocmVzb3VyY2VPcHRpb25zLCAnfi8nLCAyLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0XHQvLyBDaGVjayB0aGF0IHJlc3VsdHMgZXhpc3QgZm9yIHJlbW90ZSB0aWxkZSBwYXRoXG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQgJiYgcmVzdWx0Lmxlbmd0aCA+IDAsICdTaG91bGQgcmV0dXJuIGNvbXBsZXRpb25zIGZvciByZW1vdGUgdGlsZGUgcGF0aCcpO1xuXHRcdFx0XHQvLyBWZXJpZnkgdGhlIHRpbGRlIHBhdGggd2FzIHJlc29sdmVkIHVzaW5nIHRoZSByZW1vdGUgaG9tZSBkaXJlY3Rvcnlcblx0XHRcdFx0Y29uc3QgZG9jdW1lbnRzQ29tcGxldGlvbiA9IHJlc3VsdD8uZmluZChjID0+IGMuZGV0YWlsPy5pbmNsdWRlcygnRG9jdW1lbnRzJykpO1xuXHRcdFx0XHRhc3NlcnQub2soZG9jdW1lbnRzQ29tcGxldGlvbiwgJ1Nob3VsZCBmaW5kIERvY3VtZW50cyBmb2xkZXIgZnJvbSByZW1vdGUgaG9tZScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJy4vcmVsYXRpdmUgc2hvdWxkIHByZXNlcnZlIHJlbW90ZSBhdXRob3JpdHkgZm9yIHJlbGF0aXZlIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0ZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlLnByb2Nlc3NFbnYgPSByZW1vdGVUZXN0RW52O1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0XHRjd2Q6IFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlci9wcm9qZWN0JyB9KSxcblx0XHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdFx0cGF0aFNlcGFyYXRvcjogJy8nXG5cdFx0XHRcdH07XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiAndnNjb2RlLXJlbW90ZScsIGF1dGhvcml0eTogcmVtb3RlQXV0aG9yaXR5LCBwYXRoOiAnL2hvbWUvcmVtb3RldXNlci9wcm9qZWN0JyB9KSxcblx0XHRcdFx0XTtcblx0XHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd2c2NvZGUtcmVtb3RlJywgYXV0aG9yaXR5OiByZW1vdGVBdXRob3JpdHksIHBhdGg6ICcvaG9tZS9yZW1vdGV1c2VyL3Byb2plY3Qvc3JjJyB9KSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3ZzY29kZS1yZW1vdGUnLCBhdXRob3JpdHk6IHJlbW90ZUF1dGhvcml0eSwgcGF0aDogJy9ob21lL3JlbW90ZXVzZXIvcHJvamVjdC9kb2NzJyB9KSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0XTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGVybWluYWxDb21wbGV0aW9uU2VydmljZS5yZXNvbHZlUmVzb3VyY2VzKHJlc291cmNlT3B0aW9ucywgJy4vJywgMiwgcHJvdmlkZXIsIGNhcGFiaWxpdGllcyk7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCByZXN1bHRzIGV4aXN0IGZvciByZW1vdGUgcmVsYXRpdmUgcGF0aFxuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0ICYmIHJlc3VsdC5sZW5ndGggPiAwLCAnU2hvdWxkIHJldHVybiBjb21wbGV0aW9ucyBmb3IgcmVtb3RlIHJlbGF0aXZlIHBhdGgnKTtcblx0XHRcdFx0Ly8gVmVyaWZ5IGNvbXBsZXRpb25zIGFyZSBmcm9tIHRoZSByZW1vdGUgZmlsZXN5c3RlbVxuXHRcdFx0XHRjb25zdCBzcmNDb21wbGV0aW9uID0gcmVzdWx0Py5maW5kKGMgPT4gYy5kZXRhaWw/LmluY2x1ZGVzKCcvaG9tZS9yZW1vdGV1c2VyL3Byb2plY3Qvc3JjJykpO1xuXHRcdFx0XHRhc3NlcnQub2soc3JjQ29tcGxldGlvbiwgJ1Nob3VsZCBmaW5kIHNyYyBmb2xkZXIgY29tcGxldGlvbiB3aXRoIHJlbW90ZSBwYXRoIGluIGRldGFpbCcpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRzdWl0ZSgnY29tcGxldGlvbiBsYWJlbCBlc2NhcGluZycsICgpID0+IHtcblx0XHR0ZXN0KCd8IHNob3VsZCBlc2NhcGUgc3BlY2lhbCBjaGFyYWN0ZXJzIGluIGZpbGUvZm9sZGVyIG5hbWVzIGZvciBQT1NJWCBzaGVsbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZU9wdGlvbnM6IFRlcm1pbmFsQ29tcGxldGlvblJlc291cmNlT3B0aW9ucyA9IHtcblx0XHRcdFx0Y3dkOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdCcpLFxuXHRcdFx0XHRzaG93RGlyZWN0b3JpZXM6IHRydWUsXG5cdFx0XHRcdHNob3dGaWxlczogdHJ1ZSxcblx0XHRcdFx0cGF0aFNlcGFyYXRvclxuXHRcdFx0fTtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5wYXJzZSgnZmlsZTovLy90ZXN0JyldO1xuXHRcdFx0Y2hpbGRSZXNvdXJjZXMgPSBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0L1tmb2xkZXIxXS8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvZm9sZGVyIDIvJyksIGlzRGlyZWN0b3J5OiB0cnVlIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5wYXJzZSgnZmlsZTovLy90ZXN0LyFzcGVjaWFsJGNoYXJzJi8nKSwgaXNEaXJlY3Rvcnk6IHRydWUgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3QvIXNwZWNpYWwkY2hhcnMyJicpLCBpc0ZpbGU6IHRydWUsIGV4ZWN1dGFibGU6IHRydWUgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UucmVzb2x2ZVJlc291cmNlcyhyZXNvdXJjZU9wdGlvbnMsICcnLCAwLCBwcm92aWRlciwgY2FwYWJpbGl0aWVzKTtcblxuXHRcdFx0YXNzZXJ0Q29tcGxldGlvbnMocmVzdWx0LCBbXG5cdFx0XHRcdHsgbGFiZWw6ICcuJywgZGV0YWlsOiAnL3Rlc3QvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9bZm9sZGVyMV0vJywgZGV0YWlsOiAnL3Rlc3QvXFxbZm9sZGVyMV1cXC8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL2ZvbGRlclxcIDIvJywgZGV0YWlsOiAnL3Rlc3QvZm9sZGVyXFwgMi8nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICcuL1xcIXNwZWNpYWxcXCRjaGFyc1xcJi8nLCBkZXRhaWw6ICcvdGVzdC9cXCFzcGVjaWFsXFwkY2hhcnNcXCYvJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnLi9cXCFzcGVjaWFsXFwkY2hhcnMyXFwmJywgZGV0YWlsOiAnL3Rlc3QvXFwhc3BlY2lhbFxcJGNoYXJzMlxcJicsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgfSxcblx0XHRcdFx0eyBsYWJlbDogJy4uLycsIGRldGFpbDogJy8nIH0sXG5cdFx0XHRcdHN0YW5kYXJkVGlsZGVJdGVtLFxuXHRcdFx0XSwgeyByZXBsYWNlbWVudFJhbmdlOiBbMCwgMF0gfSk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0c3VpdGUoJ1Byb3ZpZGVyIENvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cdFx0Ly8gVGVzdCBjbGFzcyB0aGF0IGV4dGVuZHMgVGVybWluYWxDb21wbGV0aW9uU2VydmljZSB0byBhY2Nlc3MgcHJvdGVjdGVkIG1ldGhvZHNcblx0XHRjbGFzcyBUZXN0VGVybWluYWxDb21wbGV0aW9uU2VydmljZSBleHRlbmRzIFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2Uge1xuXHRcdFx0cHVibGljIGdldEVuYWJsZWRQcm92aWRlcnMocHJvdmlkZXJzOiBJVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXJbXSk6IElUZXJtaW5hbENvbXBsZXRpb25Qcm92aWRlcltdIHtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLl9nZXRFbmFibGVkUHJvdmlkZXJzKHByb3ZpZGVycyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHRlc3RUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlOiBUZXN0VGVybWluYWxDb21wbGV0aW9uU2VydmljZTtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdHRlc3RUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbENvbXBsZXRpb25TZXJ2aWNlKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBNb2NrIHByb3ZpZGVyIGZvciB0ZXN0aW5nXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTW9ja1Byb3ZpZGVyKGlkOiBzdHJpbmcpOiBJVGVybWluYWxDb21wbGV0aW9uUHJvdmlkZXIge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHByb3ZpZGVDb21wbGV0aW9uczogYXN5bmMgKCkgPT4gW3tcblx0XHRcdFx0XHRsYWJlbDogYGNvbXBsZXRpb24tZnJvbS0ke2lkfWAsXG5cdFx0XHRcdFx0a2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuTWV0aG9kLFxuXHRcdFx0XHRcdHJlcGxhY2VtZW50UmFuZ2U6IFswLCAwXSxcblx0XHRcdFx0XHRwcm92aWRlcjogaWRcblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIGVuYWJsZSBwcm92aWRlcnMgYnkgZGVmYXVsdCB3aGVuIG5vIGNvbmZpZ3VyYXRpb24gZXhpc3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCd0ZXJtaW5hbC1zdWdnZXN0Jyk7XG5cdFx0XHRjb25zdCBuZXdQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbmV3LWV4dGVuc2lvbi1wcm92aWRlcicpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJzID0gW2RlZmF1bHRQcm92aWRlciwgbmV3UHJvdmlkZXJdO1xuXG5cdFx0XHQvLyBTZXQgZW1wdHkgY29uZmlndXJhdGlvbiAobm8gcHJvdmlkZXIga2V5cylcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5Qcm92aWRlcnMsIHt9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGVzdFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UuZ2V0RW5hYmxlZFByb3ZpZGVycyhwcm92aWRlcnMpO1xuXG5cdFx0XHQvLyBCb3RoIHByb3ZpZGVycyBzaG91bGQgYmUgZW5hYmxlZCBzaW5jZSB0aGV5J3JlIG5vdCBleHBsaWNpdGx5IGRpc2FibGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBlbmFibGUgYm90aCBwcm92aWRlcnMgYnkgZGVmYXVsdCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhkZWZhdWx0UHJvdmlkZXIpLCAnU2hvdWxkIGluY2x1ZGUgZGVmYXVsdCBwcm92aWRlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhuZXdQcm92aWRlciksICdTaG91bGQgaW5jbHVkZSBuZXcgcHJvdmlkZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkaXNhYmxlIHByb3ZpZGVycyB3aGVuIGV4cGxpY2l0bHkgc2V0IHRvIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIxID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdwcm92aWRlcjEnKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyMiA9IGNyZWF0ZU1vY2tQcm92aWRlcigncHJvdmlkZXIyJyk7XG5cdFx0XHRjb25zdCBwcm92aWRlcnMgPSBbcHJvdmlkZXIxLCBwcm92aWRlcjJdO1xuXG5cdFx0XHQvLyBEaXNhYmxlIHByb3ZpZGVyMSwgbGVhdmUgcHJvdmlkZXIyIHVuY29uZmlndXJlZFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlByb3ZpZGVycywge1xuXHRcdFx0XHQncHJvdmlkZXIxJzogZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0ZXN0VGVybWluYWxDb21wbGV0aW9uU2VydmljZS5nZXRFbmFibGVkUHJvdmlkZXJzKHByb3ZpZGVycyk7XG5cblx0XHRcdC8vIE9ubHkgcHJvdmlkZXIyIHNob3VsZCBiZSBlbmFibGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSwgJ1Nob3VsZCBlbmFibGUgb25seSBvbmUgcHJvdmlkZXInKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMocHJvdmlkZXIyKSwgJ1Nob3VsZCBpbmNsdWRlIHVuY29uZmlndXJlZCBwcm92aWRlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMocHJvdmlkZXIxKSwgJ1Nob3VsZCBub3QgaW5jbHVkZSBkaXNhYmxlZCBwcm92aWRlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGVuYWJsZSBwcm92aWRlcnMgd2hlbiBleHBsaWNpdGx5IHNldCB0byB0cnVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIxID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdwcm92aWRlcjEnKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyMiA9IGNyZWF0ZU1vY2tQcm92aWRlcigncHJvdmlkZXIyJyk7XG5cdFx0XHRjb25zdCBwcm92aWRlcnMgPSBbcHJvdmlkZXIxLCBwcm92aWRlcjJdO1xuXG5cdFx0XHQvLyBFeHBsaWNpdGx5IGVuYWJsZSBwcm92aWRlcjEsIGxlYXZlIHByb3ZpZGVyMiB1bmNvbmZpZ3VyZWRcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsU3VnZ2VzdFNldHRpbmdJZC5Qcm92aWRlcnMsIHtcblx0XHRcdFx0J3Byb3ZpZGVyMSc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0ZXN0VGVybWluYWxDb21wbGV0aW9uU2VydmljZS5nZXRFbmFibGVkUHJvdmlkZXJzKHByb3ZpZGVycyk7XG5cblx0XHRcdC8vIEJvdGggcHJvdmlkZXJzIHNob3VsZCBiZSBlbmFibGVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMiwgJ1Nob3VsZCBlbmFibGUgYm90aCBwcm92aWRlcnMnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMocHJvdmlkZXIxKSwgJ1Nob3VsZCBpbmNsdWRlIGV4cGxpY2l0bHkgZW5hYmxlZCBwcm92aWRlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhwcm92aWRlcjIpLCAnU2hvdWxkIGluY2x1ZGUgdW5jb25maWd1cmVkIHByb3ZpZGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peGVkIGNvbmZpZ3VyYXRpb24gY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIxID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdwcm92aWRlcjEnKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyMiA9IGNyZWF0ZU1vY2tQcm92aWRlcigncHJvdmlkZXIyJyk7XG5cdFx0XHRjb25zdCBwcm92aWRlcjMgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ3Byb3ZpZGVyMycpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJzID0gW3Byb3ZpZGVyMSwgcHJvdmlkZXIyLCBwcm92aWRlcjNdO1xuXG5cdFx0XHQvLyBNaXhlZCBjb25maWd1cmF0aW9uOiBlbmFibGUgcHJvdmlkZXIxLCBkaXNhYmxlIHByb3ZpZGVyMiwgbGVhdmUgcHJvdmlkZXIzIHVuY29uZmlndXJlZFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxTdWdnZXN0U2V0dGluZ0lkLlByb3ZpZGVycywge1xuXHRcdFx0XHQncHJvdmlkZXIxJzogdHJ1ZSxcblx0XHRcdFx0J3Byb3ZpZGVyMic6IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGVzdFRlcm1pbmFsQ29tcGxldGlvblNlcnZpY2UuZ2V0RW5hYmxlZFByb3ZpZGVycyhwcm92aWRlcnMpO1xuXG5cdFx0XHQvLyBwcm92aWRlcjEgYW5kIHByb3ZpZGVyMyBzaG91bGQgYmUgZW5hYmxlZCwgcHJvdmlkZXIyIHNob3VsZCBiZSBkaXNhYmxlZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIsICdTaG91bGQgZW5hYmxlIHR3byBwcm92aWRlcnMnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMocHJvdmlkZXIxKSwgJ1Nob3VsZCBpbmNsdWRlIGV4cGxpY2l0bHkgZW5hYmxlZCBwcm92aWRlcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcyhwcm92aWRlcjMpLCAnU2hvdWxkIGluY2x1ZGUgdW5jb25maWd1cmVkIHByb3ZpZGVyJyk7XG5cdFx0XHRhc3NlcnQub2soIXJlc3VsdC5pbmNsdWRlcyhwcm92aWRlcjIpLCAnU2hvdWxkIG5vdCBpbmNsdWRlIGRpc2FibGVkIHByb3ZpZGVyJyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBd0U7QUFDakYsU0FBUyxpQ0FBc0c7QUFDL0csU0FBUywrQ0FBK0M7QUFDeEQsT0FBTyxVQUFVLFlBQVk7QUFDN0IsU0FBUyxpQkFBMkM7QUFFcEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBOEIsa0NBQWtDO0FBQ2hFLFNBQVMsYUFBYTtBQUN0QixTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxzQkFBc0IsNEJBQTRCO0FBQzNELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsaUJBQWlCLHFDQUFxQztBQUUvRCxNQUFNLGdCQUFnQixZQUFZLE9BQU87QUFlekMsU0FBUyxrQkFBa0IsUUFBMkMsVUFBMEMsZ0JBQTZDLFNBQWtCO0FBQzlLLFFBQU0sTUFBTSxXQUFXO0FBQ3ZCLFNBQU87QUFBQSxJQUNOLFFBQVEsSUFBSSxRQUFNO0FBQUEsTUFDakIsT0FBTyxFQUFFO0FBQUEsTUFDVCxRQUFRLEVBQUUsVUFBVTtBQUFBLE1BQ3BCLE1BQU0sRUFBRSxRQUFRLDJCQUEyQjtBQUFBLE1BQzNDLGtCQUFrQixFQUFFO0FBQUEsSUFDckIsRUFBRTtBQUFBLElBQUcsU0FBUyxJQUFJLFFBQU07QUFBQSxNQUN2QixPQUFPLEVBQUUs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
