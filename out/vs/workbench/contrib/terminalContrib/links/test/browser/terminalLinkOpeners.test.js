import { deepStrictEqual } from "assert";
import { Schemas } from "../../../../../../base/common/network.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { URI } from "../../../../../../base/common/uri.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { TerminalBuiltinLinkType } from "../../browser/links.js";
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalSearchLinkOpener } from "../../browser/terminalLinkOpeners.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { ISearchService } from "../../../../../services/search/common/search.js";
import { SearchService } from "../../../../../services/search/common/searchService.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TerminalCommand } from "../../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
class TestCommandDetectionCapability extends CommandDetectionCapability {
  setCommands(commands) {
    this._commands = commands;
  }
}
class TestFileService extends FileService {
  constructor() {
    super(...arguments);
    this._files = "*";
  }
  async stat(resource) {
    if (this._files === "*" || this._files.some((e) => e.toString() === resource.toString())) {
      return { isFile: true, isDirectory: false, isSymbolicLink: false };
    }
    throw new Error("ENOENT");
  }
  setFiles(files) {
    this._files = files;
  }
}
class TestSearchService extends SearchService {
  async fileSearch(query) {
    return this._searchResult;
  }
  setSearchResult(result) {
    this._searchResult = result;
  }
}
class TestTerminalSearchLinkOpener extends TerminalSearchLinkOpener {
  setFileQueryBuilder(value) {
    this._fileQueryBuilder = value;
  }
}
suite("Workbench - TerminalLinkOpeners", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let fileService;
  let searchService;
  let activationResult;
  let xterm;
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    fileService = store.add(new TestFileService(new NullLogService()));
    searchService = store.add(new TestSearchService(null, null, null, null, null, null, null));
    instantiationService.set(IFileService, fileService);
    instantiationService.set(ILogService, new NullLogService());
    instantiationService.set(ISearchService, searchService);
    instantiationService.set(IWorkspaceContextService, new TestContextService());
    instantiationService.stub(ITerminalLogService, new NullLogService());
    instantiationService.stub(IWorkbenchEnvironmentService, {
      remoteAuthority: void 0
    });
    activationResult = void 0;
    instantiationService.stub(IQuickInputService, {
      quickAccess: {
        show(link) {
          activationResult = { link, source: "search" };
        }
      }
    });
    instantiationService.stub(IEditorService, {
      async openEditor(editor) {
        activationResult = {
          source: "editor",
          link: editor.resource?.toString()
        };
        if (editor.options?.selection && (editor.options.selection.startColumn !== 1 || editor.options.selection.startLineNumber !== 1)) {
          activationResult.selection = editor.options.selection;
        }
      }
    });
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
  });
  suite("TerminalSearchLinkOpener", () => {
    let opener;
    let capabilities;
    let commandDetection;
    let localFileOpener;
    setup(() => {
      capabilities = store.add(new TerminalCapabilityStore());
      commandDetection = store.add(instantiationService.createInstance(TestCommandDetectionCapability, xterm));
      capabilities.add(TerminalCapability.CommandDetection, commandDetection);
    });
    test("should open single exact match against cwd when searching if it exists when command detection cwd is available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      commandDetection.setCommands([new TerminalCommand(xterm, {
        command: "",
        commandLineConfidence: "low",
        exitCode: 0,
        commandStartLineContent: "",
        markProperties: {},
        isTrusted: true,
        cwd: "/initial/cwd",
        timestamp: 0,
        duration: 0,
        executedX: void 0,
        startX: void 0,
        // eslint-disable-next-line local/code-no-any-casts
        marker: {
          line: 0
        },
        id: generateUuid()
      })]);
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.txt" })
      ]);
      await opener.open({
        text: "foo/bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should open single exact match against cwd for paths containing a separator when searching if it exists, even when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.txt" })
      ]);
      await opener.open({
        text: "foo/bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should open single exact match against any folder for paths not containing a separator when there is a single search result, even when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      capabilities.remove(TerminalCapability.CommandDetection);
      opener.setFileQueryBuilder({ file: () => null });
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/baz.txt" })
      ]);
      searchService.setSearchResult({
        messages: [],
        results: [
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }) }
        ]
      });
      await opener.open({
        text: "bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should open single exact match against any folder for paths not containing a separator when there are multiple search results, even when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      capabilities.remove(TerminalCapability.CommandDetection);
      opener.setFileQueryBuilder({ file: () => null });
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.test.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.test.txt" })
      ]);
      searchService.setSearchResult({
        messages: [],
        results: [
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }) },
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.test.txt" }) },
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.test.txt" }) }
        ]
      });
      await opener.open({
        text: "bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should not open single exact match for paths not containing a when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.txt" })
      ]);
      await opener.open({
        text: "bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "bar.txt",
        source: "search"
      });
    });
    suite("macOS/Linux", () => {
      setup(() => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      });
      test("should apply the cwd to the link only when the file exists and cwdDetection is enabled", async () => {
        const cwd = "/Users/home/folder";
        const absoluteFile = "/Users/home/folder/file.txt";
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: absoluteFile }),
          URI.from({ scheme: Schemas.file, path: "/Users/home/folder/other/file.txt" })
        ]);
        commandDetection.setCommands([new TerminalCommand(xterm, {
          command: "",
          commandLineConfidence: "low",
          isTrusted: true,
          cwd,
          timestamp: 0,
          duration: 0,
          executedX: void 0,
          startX: void 0,
          // eslint-disable-next-line local/code-no-any-casts
          marker: {
            line: 0
          },
          exitCode: 0,
          commandStartLineContent: "",
          markProperties: {},
          id: generateUuid()
        })]);
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///Users/home/folder/file.txt",
          source: "editor"
        });
        commandDetection.setCommands([]);
        opener.setFileQueryBuilder({ file: () => null });
        searchService.setSearchResult({
          messages: [],
          results: [
            { resource: URI.from({ scheme: Schemas.file, path: "file:///Users/home/folder/file.txt" }) },
            { resource: URI.from({ scheme: Schemas.file, path: "file:///Users/home/folder/other/file.txt" }) }
          ]
        });
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file.txt",
          source: "search"
        });
      });
      test("should extract column and/or line numbers from links in a workspace containing spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/space folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/space folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove trailing periods", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor"
        });
        await opener.open({
          text: "./foo/bar.txt:10:5.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines incl singular spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract line numbers from links and remove ruby stack traces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.rb" })
        ]);
        await opener.open({
          text: "./foo/bar.rb:30:in `<main>`",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.rb",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 30,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should not misinterpret ISO 8601 timestamps as line:column numbers", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([]);
        await opener.open({
          text: "test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 34, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        await opener.open({
          text: "./test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 36, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/test-2025-04-28T14:30:00+02:00.log" })
        ]);
        await opener.open({
          text: "./test-2025-04-28T14:30:00+02:00.log",
          bufferRange: { start: { x: 10, y: 1 }, end: { x: 45, y: 1 } },
          type: TerminalBuiltinLinkType.LocalFile
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/test-2025-04-28T14%3A30%3A00%2B02%3A00.log",
          source: "editor"
        });
      });
    });
    suite("Windows", () => {
      setup(() => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
      });
      test("should apply the cwd to the link only when the file exists and cwdDetection is enabled", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:\\Users", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        const cwd = "c:\\Users\\home\\folder";
        const absoluteFile = "c:\\Users\\home\\folder\\file.txt";
        fileService.setFiles([
          URI.file("/c:/Users/home/folder/file.txt")
        ]);
        commandDetection.setCommands([new TerminalCommand(xterm, {
          exitCode: 0,
          commandStartLineContent: "",
          markProperties: {},
          command: "",
          commandLineConfidence: "low",
          isTrusted: true,
          cwd,
          executedX: void 0,
          startX: void 0,
          timestamp: 0,
          duration: 0,
          // eslint-disable-next-line local/code-no-any-casts
          marker: {
            line: 0
          },
          id: generateUuid()
        })]);
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/Users/home/folder/file.txt",
          source: "editor"
        });
        commandDetection.setCommands([]);
        opener.setFileQueryBuilder({ file: () => null });
        searchService.setSearchResult({
          messages: [],
          results: [
            { resource: URI.file(absoluteFile) },
            { resource: URI.file("/c:/Users/home/folder/other/file.txt") }
          ]
        });
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file.txt",
          source: "search"
        });
      });
      test("should extract column and/or line numbers from links in a workspace containing spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/space folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/space folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:5",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove trailing periods", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor"
        });
        await opener.open({
          text: "./foo/bar.txt:10:5.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor"
        });
        await opener.open({
          text: ".\\foo\\bar.txt:2:5.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 2,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:2.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 2,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:5:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines incl singular spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:5: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract line numbers from links and remove ruby stack traces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.rb" })
        ]);
        await opener.open({
          text: "./foo/bar.rb:30:in `<main>`",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.rb",
          source: "editor",
          selection: {
            startColumn: 1,
            // Since Ruby doesn't appear to put columns in stack traces, this should be 1
            startLineNumber: 30,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.rb:30:in `<main>`",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.rb",
          source: "editor",
          selection: {
            startColumn: 1,
            // Since Ruby doesn't appear to put columns in stack traces, this should be 1
            startLineNumber: 30,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should not misinterpret ISO 8601 timestamps as line:column numbers", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([]);
        await opener.open({
          text: "test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 34, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        await opener.open({
          text: ".\\test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 36, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/test-2025-04-28T14:30:00+02:00.log" })
        ]);
        await opener.open({
          text: ".\\test-2025-04-28T14:30:00+02:00.log",
          bufferRange: { start: { x: 10, y: 1 }, end: { x: 45, y: 1 } },
          type: TerminalBuiltinLinkType.LocalFile
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/test-2025-04-28T14%3A30%3A00%2B02%3A00.log",
          source: "editor"
        });
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXHRlc3RcXGJyb3dzZXJcXHRlcm1pbmFsTGlua09wZW5lcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZWxlY3Rpb24sIElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aFBhcnRpYWxNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbGlua3MuanMnO1xuaW1wb3J0IHsgVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyLCBUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyLCBUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsTGlua09wZW5lcnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL3Rlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IElGaWxlUXVlcnksIElTZWFyY2hDb21wbGV0ZSwgSVNlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb24vdGVybWluYWxDb21tYW5kLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hcmtlciB9IGZyb20gJ0B4dGVybS9oZWFkbGVzcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFRlc3RYdGVybUxvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL3Rlc3QvY29tbW9uL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuXG5pbnRlcmZhY2UgSVRlcm1pbmFsTGlua0FjdGl2YXRpb25SZXN1bHQge1xuXHRzb3VyY2U6ICdlZGl0b3InIHwgJ3NlYXJjaCc7XG5cdGxpbms6IHN0cmluZztcblx0c2VsZWN0aW9uPzogSVRleHRFZGl0b3JTZWxlY3Rpb247XG59XG5cbmNsYXNzIFRlc3RDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSBleHRlbmRzIENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IHtcblx0c2V0Q29tbWFuZHMoY29tbWFuZHM6IFRlcm1pbmFsQ29tbWFuZFtdKSB7XG5cdFx0dGhpcy5fY29tbWFuZHMgPSBjb21tYW5kcztcblx0fVxufVxuXG5jbGFzcyBUZXN0RmlsZVNlcnZpY2UgZXh0ZW5kcyBGaWxlU2VydmljZSB7XG5cdHByaXZhdGUgX2ZpbGVzOiBVUklbXSB8ICcqJyA9ICcqJztcblx0b3ZlcnJpZGUgYXN5bmMgc3RhdChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhPiB7XG5cdFx0aWYgKHRoaXMuX2ZpbGVzID09PSAnKicgfHwgdGhpcy5fZmlsZXMuc29tZShlID0+IGUudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybiB7IGlzRmlsZTogdHJ1ZSwgaXNEaXJlY3Rvcnk6IGZhbHNlLCBpc1N5bWJvbGljTGluazogZmFsc2UgfSBhcyBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhO1xuXHRcdH1cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0VOT0VOVCcpO1xuXHR9XG5cdHNldEZpbGVzKGZpbGVzOiBVUklbXSB8ICcqJyk6IHZvaWQge1xuXHRcdHRoaXMuX2ZpbGVzID0gZmlsZXM7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFNlYXJjaFNlcnZpY2UgZXh0ZW5kcyBTZWFyY2hTZXJ2aWNlIHtcblx0cHJpdmF0ZSBfc2VhcmNoUmVzdWx0OiBJU2VhcmNoQ29tcGxldGUgfCB1bmRlZmluZWQ7XG5cdG92ZXJyaWRlIGFzeW5jIGZpbGVTZWFyY2gocXVlcnk6IElGaWxlUXVlcnkpOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdHJldHVybiB0aGlzLl9zZWFyY2hSZXN1bHQhO1xuXHR9XG5cdHNldFNlYXJjaFJlc3VsdChyZXN1bHQ6IElTZWFyY2hDb21wbGV0ZSkge1xuXHRcdHRoaXMuX3NlYXJjaFJlc3VsdCA9IHJlc3VsdDtcblx0fVxufVxuXG5jbGFzcyBUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyIGV4dGVuZHMgVGVybWluYWxTZWFyY2hMaW5rT3BlbmVyIHtcblx0c2V0RmlsZVF1ZXJ5QnVpbGRlcih2YWx1ZTogYW55KSB7XG5cdFx0dGhpcy5fZmlsZVF1ZXJ5QnVpbGRlciA9IHZhbHVlO1xuXHR9XG59XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBUZXJtaW5hbExpbmtPcGVuZXJzJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgZmlsZVNlcnZpY2U6IFRlc3RGaWxlU2VydmljZTtcblx0bGV0IHNlYXJjaFNlcnZpY2U6IFRlc3RTZWFyY2hTZXJ2aWNlO1xuXHRsZXQgYWN0aXZhdGlvblJlc3VsdDogSVRlcm1pbmFsTGlua0FjdGl2YXRpb25SZXN1bHQgfCB1bmRlZmluZWQ7XG5cdGxldCB4dGVybTogVGVybWluYWw7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHNlYXJjaFNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTZWFyY2hTZXJ2aWNlKG51bGwhLCBudWxsISwgbnVsbCEsIG51bGwhLCBudWxsISwgbnVsbCEsIG51bGwhKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJU2VhcmNoU2VydmljZSwgc2VhcmNoU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IFRlc3RDb250ZXh0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbExvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHtcblx0XHRcdHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkXG5cdFx0fSBhcyBQYXJ0aWFsPElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2U+KTtcblx0XHQvLyBBbGxvdyBpbnRlcmNlcHRpbmcgbGluayBhY3RpdmF0aW9uc1xuXHRcdGFjdGl2YXRpb25SZXN1bHQgPSB1bmRlZmluZWQ7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUXVpY2tJbnB1dFNlcnZpY2UsIHtcblx0XHRcdHF1aWNrQWNjZXNzOiB7XG5cdFx0XHRcdHNob3cobGluazogc3RyaW5nKSB7XG5cdFx0XHRcdFx0YWN0aXZhdGlvblJlc3VsdCA9IHsgbGluaywgc291cmNlOiAnc2VhcmNoJyB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBhcyBQYXJ0aWFsPElRdWlja0lucHV0U2VydmljZT4pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclNlcnZpY2UsIHtcblx0XHRcdGFzeW5jIG9wZW5FZGl0b3IoZWRpdG9yOiBJVGV4dFJlc291cmNlRWRpdG9ySW5wdXQpOiBQcm9taXNlPGFueT4ge1xuXHRcdFx0XHRhY3RpdmF0aW9uUmVzdWx0ID0ge1xuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0bGluazogZWRpdG9yLnJlc291cmNlPy50b1N0cmluZygpXG5cdFx0XHRcdH07XG5cdFx0XHRcdC8vIE9ubHkgYXNzZXJ0IG9uIHNlbGVjdGlvbiBpZiBpdCdzIG5vdCB0aGUgZGVmYXVsdCB2YWx1ZVxuXHRcdFx0XHRpZiAoZWRpdG9yLm9wdGlvbnM/LnNlbGVjdGlvbiAmJiAoZWRpdG9yLm9wdGlvbnMuc2VsZWN0aW9uLnN0YXJ0Q29sdW1uICE9PSAxIHx8IGVkaXRvci5vcHRpb25zLnNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIgIT09IDEpKSB7XG5cdFx0XHRcdFx0YWN0aXZhdGlvblJlc3VsdC5zZWxlY3Rpb24gPSBlZGl0b3Iub3B0aW9ucy5zZWxlY3Rpb247XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGFzIFBhcnRpYWw8SUVkaXRvclNlcnZpY2U+KTtcblx0XHRjb25zdCBUZXJtaW5hbEN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0eHRlcm0gPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ3Rvcih7IGFsbG93UHJvcG9zZWRBcGk6IHRydWUsIGxvZ2dlcjogVGVzdFh0ZXJtTG9nZ2VyIH0pKTtcblx0fSk7XG5cblx0c3VpdGUoJ1Rlcm1pbmFsU2VhcmNoTGlua09wZW5lcicsICgpID0+IHtcblx0XHRsZXQgb3BlbmVyOiBUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyO1xuXHRcdGxldCBjYXBhYmlsaXRpZXM6IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlO1xuXHRcdGxldCBjb21tYW5kRGV0ZWN0aW9uOiBUZXN0Q29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0bGV0IGxvY2FsRmlsZU9wZW5lcjogVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0Y2FwYWJpbGl0aWVzID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKTtcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LCB4dGVybSkpO1xuXHRcdFx0Y2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiwgY29tbWFuZERldGVjdGlvbik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgb3BlbiBzaW5nbGUgZXhhY3QgbWF0Y2ggYWdhaW5zdCBjd2Qgd2hlbiBzZWFyY2hpbmcgaWYgaXQgZXhpc3RzIHdoZW4gY29tbWFuZCBkZXRlY3Rpb24gY3dkIGlzIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnL2luaXRpYWwvY3dkJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdC8vIFNldCBhIGZha2UgZGV0ZWN0ZWQgY29tbWFuZCBzdGFydGluZyBhcyBsaW5lIDAgdG8gZXN0YWJsaXNoIHRoZSBjd2Rcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24uc2V0Q29tbWFuZHMoW25ldyBUZXJtaW5hbENvbW1hbmQoeHRlcm0sIHtcblx0XHRcdFx0Y29tbWFuZDogJycsXG5cdFx0XHRcdGNvbW1hbmRMaW5lQ29uZmlkZW5jZTogJ2xvdycsXG5cdFx0XHRcdGV4aXRDb2RlOiAwLFxuXHRcdFx0XHRjb21tYW5kU3RhcnRMaW5lQ29udGVudDogJycsXG5cdFx0XHRcdG1hcmtQcm9wZXJ0aWVzOiB7fSxcblx0XHRcdFx0aXNUcnVzdGVkOiB0cnVlLFxuXHRcdFx0XHRjd2Q6ICcvaW5pdGlhbC9jd2QnLFxuXHRcdFx0XHR0aW1lc3RhbXA6IDAsXG5cdFx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdFx0XHRleGVjdXRlZFg6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhcnRYOiB1bmRlZmluZWQsXG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRtYXJrZXI6IHtcblx0XHRcdFx0XHRsaW5lOiAwXG5cdFx0XHRcdH0gYXMgUGFydGlhbDxJTWFya2VyPiBhcyBhbnksXG5cdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKVxuXHRcdFx0fSldKTtcblx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28vYmFyLnR4dCcgfSksXG5cdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vMi9iYXIudHh0JyB9KVxuXHRcdFx0XSk7XG5cdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdHRleHQ6ICdmb28vYmFyLnR4dCcsXG5cdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdH0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vaW5pdGlhbC9jd2QvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBvcGVuIHNpbmdsZSBleGFjdCBtYXRjaCBhZ2FpbnN0IGN3ZCBmb3IgcGF0aHMgY29udGFpbmluZyBhIHNlcGFyYXRvciB3aGVuIHNlYXJjaGluZyBpZiBpdCBleGlzdHMsIGV2ZW4gd2hlbiBjb21tYW5kIGRldGVjdGlvbiBpc25cXCd0IGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnL2luaXRpYWwvY3dkJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28vYmFyLnR4dCcgfSksXG5cdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vMi9iYXIudHh0JyB9KVxuXHRcdFx0XSk7XG5cdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdHRleHQ6ICdmb28vYmFyLnR4dCcsXG5cdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdH0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vaW5pdGlhbC9jd2QvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBvcGVuIHNpbmdsZSBleGFjdCBtYXRjaCBhZ2FpbnN0IGFueSBmb2xkZXIgZm9yIHBhdGhzIG5vdCBjb250YWluaW5nIGEgc2VwYXJhdG9yIHdoZW4gdGhlcmUgaXMgYSBzaW5nbGUgc2VhcmNoIHJlc3VsdCwgZXZlbiB3aGVuIGNvbW1hbmQgZGV0ZWN0aW9uIGlzblxcJ3QgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvaW5pdGlhbC9jd2QnLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0Y2FwYWJpbGl0aWVzLnJlbW92ZShUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0XHRvcGVuZXIuc2V0RmlsZVF1ZXJ5QnVpbGRlcih7IGZpbGU6ICgpID0+IG51bGwhIH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0JyB9KSxcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28yL2Jhei50eHQnIH0pXG5cdFx0XHRdKTtcblx0XHRcdHNlYXJjaFNlcnZpY2Uuc2V0U2VhcmNoUmVzdWx0KHtcblx0XHRcdFx0bWVzc2FnZXM6IFtdLFxuXHRcdFx0XHRyZXN1bHRzOiBbXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28vYmFyLnR4dCcgfSkgfVxuXHRcdFx0XHRdXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0dGV4dDogJ2Jhci50eHQnLFxuXHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHR9KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdGxpbms6ICdmaWxlOi8vL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0c291cmNlOiAnZWRpdG9yJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgb3BlbiBzaW5nbGUgZXhhY3QgbWF0Y2ggYWdhaW5zdCBhbnkgZm9sZGVyIGZvciBwYXRocyBub3QgY29udGFpbmluZyBhIHNlcGFyYXRvciB3aGVuIHRoZXJlIGFyZSBtdWx0aXBsZSBzZWFyY2ggcmVzdWx0cywgZXZlbiB3aGVuIGNvbW1hbmQgZGV0ZWN0aW9uIGlzblxcJ3QgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvaW5pdGlhbC9jd2QnLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0Y2FwYWJpbGl0aWVzLnJlbW92ZShUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik7XG5cdFx0XHRvcGVuZXIuc2V0RmlsZVF1ZXJ5QnVpbGRlcih7IGZpbGU6ICgpID0+IG51bGwhIH0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0JyB9KSxcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28vYmFyLnRlc3QudHh0JyB9KSxcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28yL2Jhci50ZXN0LnR4dCcgfSlcblx0XHRcdF0pO1xuXHRcdFx0c2VhcmNoU2VydmljZS5zZXRTZWFyY2hSZXN1bHQoe1xuXHRcdFx0XHRtZXNzYWdlczogW10sXG5cdFx0XHRcdHJlc3VsdHM6IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0JyB9KSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vL2Jhci50ZXN0LnR4dCcgfSkgfSxcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2ZvbzIvYmFyLnRlc3QudHh0JyB9KSB9XG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHR0ZXh0OiAnYmFyLnR4dCcsXG5cdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdH0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vaW5pdGlhbC9jd2QvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3Qgb3BlbiBzaW5nbGUgZXhhY3QgbWF0Y2ggZm9yIHBhdGhzIG5vdCBjb250YWluaW5nIGEgd2hlbiBjb21tYW5kIGRldGVjdGlvbiBpc25cXCd0IGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnL2luaXRpYWwvY3dkJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28vYmFyLnR4dCcgfSksXG5cdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vMi9iYXIudHh0JyB9KVxuXHRcdFx0XSk7XG5cdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdHRleHQ6ICdiYXIudHh0Jyxcblx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0fSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRsaW5rOiAnYmFyLnR4dCcsXG5cdFx0XHRcdHNvdXJjZTogJ3NlYXJjaCdcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ21hY09TL0xpbnV4JywgKCkgPT4ge1xuXHRcdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcnLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBhcHBseSB0aGUgY3dkIHRvIHRoZSBsaW5rIG9ubHkgd2hlbiB0aGUgZmlsZSBleGlzdHMgYW5kIGN3ZERldGVjdGlvbiBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjd2QgPSAnL1VzZXJzL2hvbWUvZm9sZGVyJztcblx0XHRcdFx0Y29uc3QgYWJzb2x1dGVGaWxlID0gJy9Vc2Vycy9ob21lL2ZvbGRlci9maWxlLnR4dCc7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiBhYnNvbHV0ZUZpbGUgfSksXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9Vc2Vycy9ob21lL2ZvbGRlci9vdGhlci9maWxlLnR4dCcgfSlcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Ly8gU2V0IGEgZmFrZSBkZXRlY3RlZCBjb21tYW5kIHN0YXJ0aW5nIGFzIGxpbmUgMCB0byBlc3RhYmxpc2ggdGhlIGN3ZFxuXHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uLnNldENvbW1hbmRzKFtuZXcgVGVybWluYWxDb21tYW5kKHh0ZXJtLCB7XG5cdFx0XHRcdFx0Y29tbWFuZDogJycsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmVDb25maWRlbmNlOiAnbG93Jyxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0Y3dkLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogMCxcblx0XHRcdFx0XHRkdXJhdGlvbjogMCxcblx0XHRcdFx0XHRleGVjdXRlZFg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdGFydFg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRtYXJrZXI6IHtcblx0XHRcdFx0XHRcdGxpbmU6IDBcblx0XHRcdFx0XHR9IGFzIFBhcnRpYWw8SU1hcmtlcj4gYXMgYW55LFxuXHRcdFx0XHRcdGV4aXRDb2RlOiAwLFxuXHRcdFx0XHRcdGNvbW1hbmRTdGFydExpbmVDb250ZW50OiAnJyxcblx0XHRcdFx0XHRtYXJrUHJvcGVydGllczoge30sXG5cdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpXG5cdFx0XHRcdH0pXSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9Vc2Vycy9ob21lL2ZvbGRlci9maWxlLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJ1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBDbGVhciBkZXRlY3RlZCBjb21tYW5kcyBhbmQgZW5zdXJlIHRoZSBzYW1lIHJlcXVlc3QgcmVzdWx0cyBpbiBhIHNlYXJjaCBzaW5jZSB0aGVyZSBhcmUgMiBtYXRjaGVzXG5cdFx0XHRcdGNvbW1hbmREZXRlY3Rpb24uc2V0Q29tbWFuZHMoW10pO1xuXHRcdFx0XHRvcGVuZXIuc2V0RmlsZVF1ZXJ5QnVpbGRlcih7IGZpbGU6ICgpID0+IG51bGwhIH0pO1xuXHRcdFx0XHRzZWFyY2hTZXJ2aWNlLnNldFNlYXJjaFJlc3VsdCh7XG5cdFx0XHRcdFx0bWVzc2FnZXM6IFtdLFxuXHRcdFx0XHRcdHJlc3VsdHM6IFtcblx0XHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICdmaWxlOi8vL1VzZXJzL2hvbWUvZm9sZGVyL2ZpbGUudHh0JyB9KSB9LFxuXHRcdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2ZpbGU6Ly8vVXNlcnMvaG9tZS9mb2xkZXIvb3RoZXIvZmlsZS50eHQnIH0pIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJ2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdzZWFyY2gnXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNvbHVtbiBhbmQvb3IgbGluZSBudW1iZXJzIGZyb20gbGlua3MgaW4gYSB3b3Jrc3BhY2UgY29udGFpbmluZyBzcGFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9zcGFjZSBmb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9zcGFjZSBmb2xkZXIvZm9vL2Jhci50eHQnIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6NScsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL3NwYWNlJTIwZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vc3BhY2UlMjBmb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNvbHVtbiBhbmQvb3IgbGluZSBudW1iZXJzIGZyb20gbGlua3MgYW5kIHJlbW92ZSB0cmFpbGluZyBwZXJpb2RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvZm9sZGVyL2Zvby9iYXIudHh0JyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0LicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMDo1LicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMC4nLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNvbHVtbiBhbmQvb3IgbGluZSBudW1iZXJzIGZyb20gbGlua3MgYW5kIHJlbW92ZSBncmVwcGVkIGxpbmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvZm9sZGVyL2Zvby9iYXIudHh0JyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOjU6aW1wb3J0IHsgSUxvdmVWU0NvZGUgfSBmcm9tIFxcJy4vZm9vL2Jhci50c1xcJzsnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6aW1wb3J0IHsgSUxvdmVWU0NvZGUgfSBmcm9tIFxcJy4vZm9vL2Jhci50c1xcJzsnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRlc3QgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMjAwOTE5I2Rpc2N1c3Npb25fcjE0MjgxMjQxOTZcblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNvbHVtbiBhbmQvb3IgbGluZSBudW1iZXJzIGZyb20gbGlua3MgYW5kIHJlbW92ZSBncmVwcGVkIGxpbmVzIGluY2wgc2luZ3VsYXIgc3BhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvZm9sZGVyL2Zvby9iYXIudHh0JyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOjU6ICcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMDogJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBhbmQgcmVtb3ZlIHJ1Ynkgc3RhY2sgdHJhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvZm9sZGVyL2Zvby9iYXIucmInIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci5yYjozMDppbiBgPG1haW4+YCcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci9mb28vYmFyLnJiJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDMwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgbm90IG1pc2ludGVycHJldCBJU08gODYwMSB0aW1lc3RhbXBzIGFzIGxpbmU6Y29sdW1uIG51bWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0XHQvLyBJbnRlbnRpb25hbGx5IG5vdCBzZXQgdGhlIGZpbGUgc28gaXQgZG9lcyBub3QgZ2V0IHBpY2tlZCB1cCBhcyBsb2NhbEZpbGUuXG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICd0ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiAzNCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICd0ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdzZWFyY2gnXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vdGVzdC0yMDI1LTA0LTI4VDExOjAzOjA5KzAyOjAwLmxvZycsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogMzYsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAndGVzdC0yMDI1LTA0LTI4VDExOjAzOjA5KzAyOjAwLmxvZycsXG5cdFx0XHRcdFx0c291cmNlOiAnc2VhcmNoJ1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBUZXN0IHdoZW4gZmlsZSBleGlzdHMsIGFuZCB0aGVyZSBhcmUgcHJlY2VkaW5nIGFyZ3VtZW50c1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9mb2xkZXIvdGVzdC0yMDI1LTA0LTI4VDE0OjMwOjAwKzAyOjAwLmxvZycgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi90ZXN0LTIwMjUtMDQtMjhUMTQ6MzA6MDArMDI6MDAubG9nJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxMCwgeTogMSB9LCBlbmQ6IHsgeDogNDUsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9mb2xkZXIvdGVzdC0yMDI1LTA0LTI4VDE0JTNBMzAlM0EwMCUyQjAyJTNBMDAubG9nJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblxuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ1dpbmRvd3MnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJycsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgYXBwbHkgdGhlIGN3ZCB0byB0aGUgbGluayBvbmx5IHdoZW4gdGhlIGZpbGUgZXhpc3RzIGFuZCBjd2REZXRlY3Rpb24gaXMgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnYzpcXFxcVXNlcnMnLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cblx0XHRcdFx0Y29uc3QgY3dkID0gJ2M6XFxcXFVzZXJzXFxcXGhvbWVcXFxcZm9sZGVyJztcblx0XHRcdFx0Y29uc3QgYWJzb2x1dGVGaWxlID0gJ2M6XFxcXFVzZXJzXFxcXGhvbWVcXFxcZm9sZGVyXFxcXGZpbGUudHh0JztcblxuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9jOi9Vc2Vycy9ob21lL2ZvbGRlci9maWxlLnR4dCcpXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdC8vIFNldCBhIGZha2UgZGV0ZWN0ZWQgY29tbWFuZCBzdGFydGluZyBhcyBsaW5lIDAgdG8gZXN0YWJsaXNoIHRoZSBjd2Rcblx0XHRcdFx0Y29tbWFuZERldGVjdGlvbi5zZXRDb21tYW5kcyhbbmV3IFRlcm1pbmFsQ29tbWFuZCh4dGVybSwge1xuXHRcdFx0XHRcdGV4aXRDb2RlOiAwLFxuXHRcdFx0XHRcdGNvbW1hbmRTdGFydExpbmVDb250ZW50OiAnJyxcblx0XHRcdFx0XHRtYXJrUHJvcGVydGllczoge30sXG5cdFx0XHRcdFx0Y29tbWFuZDogJycsXG5cdFx0XHRcdFx0Y29tbWFuZExpbmVDb25maWRlbmNlOiAnbG93Jyxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0Y3dkLFxuXHRcdFx0XHRcdGV4ZWN1dGVkWDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN0YXJ0WDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogMCxcblx0XHRcdFx0XHRkdXJhdGlvbjogMCxcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0XHRtYXJrZXI6IHtcblx0XHRcdFx0XHRcdGxpbmU6IDBcblx0XHRcdFx0XHR9IGFzIFBhcnRpYWw8SU1hcmtlcj4gYXMgYW55LFxuXHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKVxuXHRcdFx0XHR9KV0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJ2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9Vc2Vycy9ob21lL2ZvbGRlci9maWxlLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJ1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBDbGVhciBkZXRlY3RlZCBjb21tYW5kcyBhbmQgZW5zdXJlIHRoZSBzYW1lIHJlcXVlc3QgcmVzdWx0cyBpbiBhIHNlYXJjaFxuXHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uLnNldENvbW1hbmRzKFtdKTtcblx0XHRcdFx0b3BlbmVyLnNldEZpbGVRdWVyeUJ1aWxkZXIoeyBmaWxlOiAoKSA9PiBudWxsISB9KTtcblx0XHRcdFx0c2VhcmNoU2VydmljZS5zZXRTZWFyY2hSZXN1bHQoe1xuXHRcdFx0XHRcdG1lc3NhZ2VzOiBbXSxcblx0XHRcdFx0XHRyZXN1bHRzOiBbXG5cdFx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZShhYnNvbHV0ZUZpbGUpIH0sXG5cdFx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgnL2M6L1VzZXJzL2hvbWUvZm9sZGVyL290aGVyL2ZpbGUudHh0JykgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ3NlYXJjaCdcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY29sdW1uIGFuZC9vciBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBpbiBhIHdvcmtzcGFjZSBjb250YWluaW5nIHNwYWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnYzovc3BhY2UgZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2M6L3NwYWNlIGZvbGRlci9mb28vYmFyLnR4dCcgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMDo1Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9zcGFjZSUyMGZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMCcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0Evc3BhY2UlMjBmb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcZm9vXFxcXGJhci50eHQ6MTA6NScsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0Evc3BhY2UlMjBmb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcZm9vXFxcXGJhci50eHQ6MTAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL3NwYWNlJTIwZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBjb2x1bW4gYW5kL29yIGxpbmUgbnVtYmVycyBmcm9tIGxpbmtzIGFuZCByZW1vdmUgdHJhaWxpbmcgcGVyaW9kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnYzovZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2M6L2ZvbGRlci9mb28vYmFyLnR4dCcgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dC4nLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMDo1LicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwLicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXGZvb1xcXFxiYXIudHh0LicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXGZvb1xcXFxiYXIudHh0OjI6NS4nLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXGZvb1xcXFxiYXIudHh0OjIuJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMixcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY29sdW1uIGFuZC9vciBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBhbmQgcmVtb3ZlIGdyZXBwZWQgbGluZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJ2M6L2ZvbGRlcicsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICdjOi9mb2xkZXIvZm9vL2Jhci50eHQnIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6NTppbXBvcnQgeyBJTG92ZVZTQ29kZSB9IGZyb20gXFwnLi9mb28vYmFyLnRzXFwnOycsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOmltcG9ydCB7IElMb3ZlVlNDb2RlIH0gZnJvbSBcXCcuL2Zvby9iYXIudHNcXCc7Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcZm9vXFxcXGJhci50eHQ6MTA6NTppbXBvcnQgeyBJTG92ZVZTQ29kZSB9IGZyb20gXFwnLi9mb28vYmFyLnRzXFwnOycsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXGZvb1xcXFxiYXIudHh0OjEwOmltcG9ydCB7IElMb3ZlVlNDb2RlIH0gZnJvbSBcXCcuL2Zvby9iYXIudHNcXCc7Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRlc3QgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMjAwOTE5I2Rpc2N1c3Npb25fcjE0MjgxMjQxOTZcblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNvbHVtbiBhbmQvb3IgbGluZSBudW1iZXJzIGZyb20gbGlua3MgYW5kIHJlbW92ZSBncmVwcGVkIGxpbmVzIGluY2wgc2luZ3VsYXIgc3BhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICdjOi9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnYzovZm9sZGVyL2Zvby9iYXIudHh0JyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOjU6ICcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOiAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFxmb29cXFxcYmFyLnR4dDoxMDo1OiAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFxmb29cXFxcYmFyLnR4dDoxMDogJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGxpbmUgbnVtYmVycyBmcm9tIGxpbmtzIGFuZCByZW1vdmUgcnVieSBzdGFjayB0cmFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJ2M6L2ZvbGRlcicsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICdjOi9mb2xkZXIvZm9vL2Jhci5yYicgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnJiOjMwOmluIGA8bWFpbj5gJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci5yYicsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLCAvLyBTaW5jZSBSdWJ5IGRvZXNuJ3QgYXBwZWFyIHRvIHB1dCBjb2x1bW5zIGluIHN0YWNrIHRyYWNlcywgdGhpcyBzaG91bGQgYmUgMVxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFxmb29cXFxcYmFyLnJiOjMwOmluIGA8bWFpbj5gJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci5yYicsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLCAvLyBTaW5jZSBSdWJ5IGRvZXNuJ3QgYXBwZWFyIHRvIHB1dCBjb2x1bW5zIGluIHN0YWNrIHRyYWNlcywgdGhpcyBzaG91bGQgYmUgMVxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAzMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIG5vdCBtaXNpbnRlcnByZXQgSVNPIDg2MDEgdGltZXN0YW1wcyBhcyBsaW5lOmNvbHVtbiBudW1iZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICdjOi9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRcdC8vIEludGVudGlvbmFsbHkgbm90IHNldCB0aGUgZmlsZSBzbyBpdCBkb2VzIG5vdCBnZXQgcGlja2VkIHVwIGFzIGxvY2FsRmlsZS5cblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW10pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJ3Rlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDM0LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ3Rlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ3NlYXJjaCdcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFx0ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiAzNiwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICd0ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdzZWFyY2gnXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFRlc3Qgd2hlbiBmaWxlIGV4aXN0cywgYW5kIHRoZXJlIGFyZSBwcmVjZWRpbmcgYXJndW1lbnRzXG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnYzovZm9sZGVyL3Rlc3QtMjAyNS0wNC0yOFQxNDozMDowMCswMjowMC5sb2cnIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcdGVzdC0yMDI1LTA0LTI4VDE0OjMwOjAwKzAyOjAwLmxvZycsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMTAsIHk6IDEgfSwgZW5kOiB7IHg6IDQ1LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvdGVzdC0yMDI1LTA0LTI4VDE0JTNBMzAlM0EwMCUyQjAyJTNBMDAubG9nJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBRXBCLFNBQVMsb0JBQWtEO0FBQzNELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw2QkFBNkIsMENBQTBDLGdDQUFn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
