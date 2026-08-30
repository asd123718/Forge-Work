import { isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { format } from "../../../../../../base/common/strings.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TerminalBuiltinLinkType } from "../../browser/links.js";
import { TerminalLocalLinkDetector } from "../../browser/terminalLocalLinkDetector.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { assertLinkHelper } from "./linkTestUtils.js";
import { timeout } from "../../../../../../base/common/async.js";
import { strictEqual } from "assert";
import { TerminalLinkResolver } from "../../browser/terminalLinkResolver.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { URI } from "../../../../../../base/common/uri.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IUriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { isString } from "../../../../../../base/common/types.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
const unixLinks = [
  // Absolute
  "/foo",
  "/foo/bar",
  "/foo/[bar]",
  "/foo/[bar].baz",
  "/foo/[bar]/baz",
  "/foo/bar+more",
  // URI file://
  { link: "file:///foo", resource: URI.file("/foo") },
  { link: "file:///foo/bar", resource: URI.file("/foo/bar") },
  { link: "file:///foo/bar%20baz", resource: URI.file("/foo/bar baz") },
  // User home
  { link: "~/foo", resource: URI.file("/home/foo") },
  // Relative
  { link: "./foo", resource: URI.file("/parent/cwd/foo") },
  { link: "./$foo", resource: URI.file("/parent/cwd/$foo") },
  { link: "../foo", resource: URI.file("/parent/foo") },
  { link: "foo/bar", resource: URI.file("/parent/cwd/foo/bar") },
  { link: "foo/bar+more", resource: URI.file("/parent/cwd/foo/bar+more") }
];
const unixLinksWithIso = [
  // ISO 8601 timestamps - tested separately to avoid line/column suffix conflicts
  { link: "./test-2025-04-28T11:03:09+02:00.log", resource: URI.file("/parent/cwd/test-2025-04-28T11:03:09+02:00.log") }
];
const windowsLinks = [
  // Absolute
  "c:\\foo",
  { link: "\\\\?\\C:\\foo", resource: URI.file("C:\\foo") },
  "c:/foo",
  "c:/foo/bar",
  "c:\\foo\\bar",
  "c:\\foo\\bar+more",
  "c:\\foo/bar\\baz",
  // URI file://
  { link: "file:///c:/foo", resource: URI.file("c:\\foo") },
  { link: "file:///c:/foo/bar", resource: URI.file("c:\\foo\\bar") },
  { link: "file:///c:/foo/bar%20baz", resource: URI.file("c:\\foo\\bar baz") },
  // User home
  { link: "~\\foo", resource: URI.file("C:\\Home\\foo") },
  { link: "~/foo", resource: URI.file("C:\\Home\\foo") },
  // Relative
  { link: ".\\foo", resource: URI.file("C:\\Parent\\Cwd\\foo") },
  { link: "./foo", resource: URI.file("C:\\Parent\\Cwd\\foo") },
  { link: "./$foo", resource: URI.file("C:\\Parent\\Cwd\\$foo") },
  { link: "..\\foo", resource: URI.file("C:\\Parent\\foo") },
  { link: "foo/bar", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar") },
  { link: "foo/bar", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar") },
  { link: "foo/[bar]", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar]") },
  { link: "foo/[bar].baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar].baz") },
  { link: "foo/[bar]/baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar]/baz") },
  { link: "foo\\bar", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar") },
  { link: "foo\\[bar].baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar].baz") },
  { link: "foo\\[bar]\\baz", resource: URI.file("C:\\Parent\\Cwd\\foo\\[bar]\\baz") },
  { link: "foo\\bar+more", resource: URI.file("C:\\Parent\\Cwd\\foo\\bar+more") }
];
const windowsLinksWithIso = [
  // ISO 8601 timestamps - tested separately to avoid line/column suffix conflicts
  { link: ".\\test-2025-04-28T11:03:09+02:00.log", resource: URI.file("C:\\Parent\\Cwd\\test-2025-04-28T11:03:09+02:00.log") }
];
const supportedLinkFormats = [
  { urlFormat: "{0}" },
  { urlFormat: '{0}" on line {1}', line: "5" },
  { urlFormat: '{0}" on line {1}, column {2}', line: "5", column: "3" },
  { urlFormat: '{0}":line {1}', line: "5" },
  { urlFormat: '{0}":line {1}, column {2}', line: "5", column: "3" },
  { urlFormat: '{0}": line {1}', line: "5" },
  { urlFormat: '{0}": line {1}, col {2}', line: "5", column: "3" },
  { urlFormat: "{0}({1})", line: "5" },
  { urlFormat: "{0} ({1})", line: "5" },
  { urlFormat: "{0}, {1}", line: "5" },
  { urlFormat: "{0}({1},{2})", line: "5", column: "3" },
  { urlFormat: "{0} ({1},{2})", line: "5", column: "3" },
  { urlFormat: "{0}: ({1},{2})", line: "5", column: "3" },
  { urlFormat: "{0}({1}, {2})", line: "5", column: "3" },
  { urlFormat: "{0} ({1}, {2})", line: "5", column: "3" },
  { urlFormat: "{0}: ({1}, {2})", line: "5", column: "3" },
  { urlFormat: "{0}({1}:{2})", line: "5", column: "3" },
  { urlFormat: "{0} ({1}:{2})", line: "5", column: "3" },
  { urlFormat: "{0}:{1}", line: "5" },
  { urlFormat: "{0}:{1}:{2}", line: "5", column: "3" },
  { urlFormat: "{0} {1}:{2}", line: "5", column: "3" },
  { urlFormat: "{0}[{1}]", line: "5" },
  { urlFormat: "{0} [{1}]", line: "5" },
  { urlFormat: "{0}[{1},{2}]", line: "5", column: "3" },
  { urlFormat: "{0} [{1},{2}]", line: "5", column: "3" },
  { urlFormat: "{0}: [{1},{2}]", line: "5", column: "3" },
  { urlFormat: "{0}[{1}, {2}]", line: "5", column: "3" },
  { urlFormat: "{0} [{1}, {2}]", line: "5", column: "3" },
  { urlFormat: "{0}: [{1}, {2}]", line: "5", column: "3" },
  { urlFormat: "{0}[{1}:{2}]", line: "5", column: "3" },
  { urlFormat: "{0} [{1}:{2}]", line: "5", column: "3" },
  { urlFormat: '{0}",{1}', line: "5" },
  { urlFormat: "{0}',{1}", line: "5" },
  { urlFormat: "{0}#{1}", line: "5" },
  { urlFormat: "{0}#{1}:{2}", line: "5", column: "5" }
];
const windowsFallbackLinks = [
  "C:\\foo bar",
  "C:\\foo bar\\baz",
  "C:\\foo\\bar baz",
  "C:\\foo/bar baz"
];
const supportedFallbackLinkFormats = [
  // Python style error: File "<path>", line <line>
  { urlFormat: 'File "{0}"', linkCellStartOffset: 5 },
  { urlFormat: 'File "{0}", line {1}', line: "5", linkCellStartOffset: 5 },
  // Unknown tool #200166: FILE  <path>:<line>:<col>
  { urlFormat: " FILE  {0}", linkCellStartOffset: 7 },
  { urlFormat: " FILE  {0}:{1}", line: "5", linkCellStartOffset: 7 },
  { urlFormat: " FILE  {0}:{1}:{2}", line: "5", column: "3", linkCellStartOffset: 7 },
  // Some C++ compile error formats
  { urlFormat: "{0}({1}) :", line: "5", linkCellEndOffset: -2 },
  { urlFormat: "{0}({1},{2}) :", line: "5", column: "3", linkCellEndOffset: -2 },
  { urlFormat: "{0}({1}, {2}) :", line: "5", column: "3", linkCellEndOffset: -2 },
  { urlFormat: "{0}({1}):", line: "5", linkCellEndOffset: -1 },
  { urlFormat: "{0}({1},{2}):", line: "5", column: "3", linkCellEndOffset: -1 },
  { urlFormat: "{0}({1}, {2}):", line: "5", column: "3", linkCellEndOffset: -1 },
  { urlFormat: "{0}:{1} :", line: "5", linkCellEndOffset: -2 },
  { urlFormat: "{0}:{1}:{2} :", line: "5", column: "3", linkCellEndOffset: -2 },
  { urlFormat: "{0}:{1}:", line: "5", linkCellEndOffset: -1 },
  { urlFormat: "{0}:{1}:{2}:", line: "5", column: "3", linkCellEndOffset: -1 },
  // PowerShell prompt
  { urlFormat: "PS {0}>", linkCellStartOffset: 3, linkCellEndOffset: -1 },
  // Cmd prompt
  { urlFormat: "{0}>", linkCellEndOffset: -1 },
  // The whole line is the path
  { urlFormat: "{0}" }
];
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
suite("Workbench - TerminalLocalLinkDetector", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let fileService;
  let detector;
  let resolver;
  let xterm;
  let validResources;
  async function assertLinks(type, text, expected) {
    let to;
    const race = await Promise.race([
      assertLinkHelper(text, expected, detector, type).then(() => "success"),
      (to = timeout(2)).then(() => "timeout")
    ]);
    strictEqual(race, "success", `Awaiting link assertion for "${text}" timed out`);
    to.cancel();
  }
  async function assertLinksWithWrapped(link, resource) {
    const uri = resource ?? URI.file(link);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, link, [{ uri, range: [[1, 1], [link.length, 1]] }]);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, ` ${link} `, [{ uri, range: [[2, 1], [link.length + 1, 1]] }]);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, `(${link})`, [{ uri, range: [[2, 1], [link.length + 1, 1]] }]);
    await assertLinks(TerminalBuiltinLinkType.LocalFile, `[${link}]`, [{ uri, range: [[2, 1], [link.length + 1, 1]] }]);
  }
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    configurationService = new TestConfigurationService();
    fileService = store.add(new TestFileService(new NullLogService()));
    instantiationService.stub(IConfigurationService, configurationService);
    fileService.setFiles(validResources);
    instantiationService.set(IFileService, fileService);
    instantiationService.set(IWorkspaceContextService, new TestContextService());
    instantiationService.set(IUriIdentityService, store.add(new UriIdentityService(fileService)));
    instantiationService.stub(ITerminalLogService, new NullLogService());
    resolver = instantiationService.createInstance(TerminalLinkResolver);
    validResources = [];
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger });
  });
  suite("platform independent", () => {
    setup(() => {
      detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, store.add(new TerminalCapabilityStore()), {
        initialCwd: "/parent/cwd",
        os: OperatingSystem.Linux,
        remoteAuthority: void 0,
        userHome: "/home",
        backend: void 0
      }, resolver);
    });
    test("should support multiple link results", async () => {
      validResources = [
        URI.file("/parent/cwd/foo"),
        URI.file("/parent/cwd/bar")
      ];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, "./foo ./bar", [
        { range: [[1, 1], [5, 1]], uri: URI.file("/parent/cwd/foo") },
        { range: [[7, 1], [11, 1]], uri: URI.file("/parent/cwd/bar") }
      ]);
    });
    test("should support trimming extra quotes", async () => {
      validResources = [URI.file("/parent/cwd/foo")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, '"foo"" on line 5', [
        { range: [[1, 1], [16, 1]], uri: URI.file("/parent/cwd/foo") }
      ]);
    });
    test("should support trimming extra square brackets", async () => {
      validResources = [URI.file("/parent/cwd/foo")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, '"foo]" on line 5', [
        { range: [[1, 1], [16, 1]], uri: URI.file("/parent/cwd/foo") }
      ]);
    });
    test("should support finding links after brackets", async () => {
      validResources = [URI.file("/parent/cwd/foo")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, "bar[foo:5", [
        { range: [[5, 1], [9, 1]], uri: URI.file("/parent/cwd/foo") }
      ]);
    });
  });
  suite("macOS/Linux", () => {
    setup(() => {
      detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, store.add(new TerminalCapabilityStore()), {
        initialCwd: "/parent/cwd",
        os: OperatingSystem.Linux,
        remoteAuthority: void 0,
        userHome: "/home",
        backend: void 0
      }, resolver);
    });
    for (const l of unixLinks) {
      const baseLink = isString(l) ? l : l.link;
      const resource = isString(l) ? URI.file(l) : l.resource;
      suite(`Link: ${baseLink}`, () => {
        for (let i = 0; i < supportedLinkFormats.length; i++) {
          const linkFormat = supportedLinkFormats[i];
          const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
          test(`should detect in "${formattedLink}"`, async () => {
            validResources = [resource];
            fileService.setFiles(validResources);
            await assertLinksWithWrapped(formattedLink, resource);
          });
        }
      });
    }
    test("Git diff links", async () => {
      validResources = [URI.file("/parent/cwd/foo/bar")];
      fileService.setFiles(validResources);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
        { uri: validResources[0], range: [[14, 1], [20, 1]] },
        { uri: validResources[0], range: [[24, 1], [30, 1]] }
      ]);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ uri: validResources[0], range: [[7, 1], [13, 1]] }]);
      await assertLinks(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ uri: validResources[0], range: [[7, 1], [13, 1]] }]);
    });
    for (const l of unixLinksWithIso) {
      const baseLink = typeof l === "string" ? l : l.link;
      const resource = typeof l === "string" ? URI.file(l) : l.resource;
      test(`should detect ISO 8601 link: ${baseLink}`, async () => {
        validResources = [resource];
        fileService.setFiles(validResources);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, baseLink, [{ uri: resource, range: [[1, 1], [baseLink.length, 1]] }]);
      });
    }
  });
  if (isWindows) {
    suite("Windows", () => {
      const wslUnixToWindowsPathMap = /* @__PURE__ */ new Map();
      setup(() => {
        detector = instantiationService.createInstance(TerminalLocalLinkDetector, xterm, store.add(new TerminalCapabilityStore()), {
          initialCwd: "C:\\Parent\\Cwd",
          os: OperatingSystem.Windows,
          remoteAuthority: void 0,
          userHome: "C:\\Home",
          backend: {
            async getWslPath(original, direction) {
              if (direction === "unix-to-win") {
                return wslUnixToWindowsPathMap.get(original) ?? original;
              }
              return original;
            }
          }
        }, resolver);
        wslUnixToWindowsPathMap.clear();
      });
      for (const l of windowsLinks) {
        const baseLink = isString(l) ? l : l.link;
        const resource = isString(l) ? URI.file(l) : l.resource;
        suite(`Link "${baseLink}"`, () => {
          for (let i = 0; i < supportedLinkFormats.length; i++) {
            const linkFormat = supportedLinkFormats[i];
            const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
            test(`should detect in "${formattedLink}"`, async () => {
              validResources = [resource];
              fileService.setFiles(validResources);
              await assertLinksWithWrapped(formattedLink, resource);
            });
          }
        });
      }
      for (const l of windowsFallbackLinks) {
        const baseLink = isString(l) ? l : l.link;
        const resource = isString(l) ? URI.file(l) : l.resource;
        suite(`Fallback link "${baseLink}"`, () => {
          for (let i = 0; i < supportedFallbackLinkFormats.length; i++) {
            const linkFormat = supportedFallbackLinkFormats[i];
            const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
            const linkCellStartOffset = linkFormat.linkCellStartOffset ?? 0;
            const linkCellEndOffset = linkFormat.linkCellEndOffset ?? 0;
            test(`should detect in "${formattedLink}"`, async () => {
              validResources = [resource];
              fileService.setFiles(validResources);
              await assertLinks(TerminalBuiltinLinkType.LocalFile, formattedLink, [{ uri: resource, range: [[1 + linkCellStartOffset, 1], [formattedLink.length + linkCellEndOffset, 1]] }]);
            });
          }
        });
      }
      test("Git diff links", async () => {
        const resource = URI.file("C:\\Parent\\Cwd\\foo\\bar");
        validResources = [resource];
        fileService.setFiles(validResources);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, `diff --git a/foo/bar b/foo/bar`, [
          { uri: resource, range: [[14, 1], [20, 1]] },
          { uri: resource, range: [[24, 1], [30, 1]] }
        ]);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, `--- a/foo/bar`, [{ uri: resource, range: [[7, 1], [13, 1]] }]);
        await assertLinks(TerminalBuiltinLinkType.LocalFile, `+++ b/foo/bar`, [{ uri: resource, range: [[7, 1], [13, 1]] }]);
      });
      for (const l of windowsLinksWithIso) {
        const baseLink = typeof l === "string" ? l : l.link;
        const resource = typeof l === "string" ? URI.file(l) : l.resource;
        test(`should detect ISO 8601 link: ${baseLink}`, async () => {
          validResources = [resource];
          fileService.setFiles(validResources);
          await assertLinks(TerminalBuiltinLinkType.LocalFile, baseLink, [{ uri: resource, range: [[1, 1], [baseLink.length, 1]] }]);
        });
      }
      suite("WSL", () => {
        test("Unix -> Windows /mnt/ style links", async () => {
          wslUnixToWindowsPathMap.set("/mnt/c/foo/bar", "C:\\foo\\bar");
          validResources = [URI.file("C:\\foo\\bar")];
          fileService.setFiles(validResources);
          await assertLinksWithWrapped("/mnt/c/foo/bar", validResources[0]);
        });
        test("Windows -> Unix \\\\wsl$\\ style links", async () => {
          validResources = [URI.file("\\\\wsl$\\Debian\\home\\foo\\bar")];
          fileService.setFiles(validResources);
          await assertLinksWithWrapped("\\\\wsl$\\Debian\\home\\foo\\bar");
        });
        test("Windows -> Unix \\\\wsl.localhost\\ style links", async () => {
          validResources = [URI.file("\\\\wsl.localhost\\Debian\\home\\foo\\bar")];
          fileService.setFiles(validResources);
          await assertLinksWithWrapped("\\\\wsl.localhost\\Debian\\home\\foo\\bar");
        });
      });
    });
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXHRlc3RcXGJyb3dzZXJcXHRlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZm9ybWF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9saW5rcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExvY2FsTGlua0RldGVjdG9yIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbExvY2FsTGlua0RldGVjdG9yLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRMaW5rSGVscGVyIH0gZnJvbSAnLi9saW5rVGVzdFV0aWxzLmpzJztcbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFRlcm1pbmFsTGlua1Jlc29sdmVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbExpbmtSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2FtZFguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1Mb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC90ZXN0L2NvbW1vbi90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcblxuY29uc3QgdW5peExpbmtzOiAoc3RyaW5nIHwgeyBsaW5rOiBzdHJpbmc7IHJlc291cmNlOiBVUkkgfSlbXSA9IFtcblx0Ly8gQWJzb2x1dGVcblx0Jy9mb28nLFxuXHQnL2Zvby9iYXInLFxuXHQnL2Zvby9bYmFyXScsXG5cdCcvZm9vL1tiYXJdLmJheicsXG5cdCcvZm9vL1tiYXJdL2JheicsXG5cdCcvZm9vL2Jhcittb3JlJyxcblx0Ly8gVVJJIGZpbGU6Ly9cblx0eyBsaW5rOiAnZmlsZTovLy9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9mb28nKSB9LFxuXHR7IGxpbms6ICdmaWxlOi8vL2Zvby9iYXInLCByZXNvdXJjZTogVVJJLmZpbGUoJy9mb28vYmFyJykgfSxcblx0eyBsaW5rOiAnZmlsZTovLy9mb28vYmFyJTIwYmF6JywgcmVzb3VyY2U6IFVSSS5maWxlKCcvZm9vL2JhciBiYXonKSB9LFxuXHQvLyBVc2VyIGhvbWVcblx0eyBsaW5rOiAnfi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9ob21lL2ZvbycpIH0sXG5cdC8vIFJlbGF0aXZlXG5cdHsgbGluazogJy4vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKSB9LFxuXHR7IGxpbms6ICcuLyRmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkLyRmb28nKSB9LFxuXHR7IGxpbms6ICcuLi9mb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvZm9vJykgfSxcblx0eyBsaW5rOiAnZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vL2JhcicpIH0sXG5cdHsgbGluazogJ2Zvby9iYXIrbW9yZScsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vL2Jhcittb3JlJykgfSxcbl07XG5cbmNvbnN0IHVuaXhMaW5rc1dpdGhJc286IChzdHJpbmcgfCB7IGxpbms6IHN0cmluZzsgcmVzb3VyY2U6IFVSSSB9KVtdID0gW1xuXHQvLyBJU08gODYwMSB0aW1lc3RhbXBzIC0gdGVzdGVkIHNlcGFyYXRlbHkgdG8gYXZvaWQgbGluZS9jb2x1bW4gc3VmZml4IGNvbmZsaWN0c1xuXHR7IGxpbms6ICcuL3Rlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL3Rlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnKSB9LFxuXTtcblxuY29uc3Qgd2luZG93c0xpbmtzOiAoc3RyaW5nIHwgeyBsaW5rOiBzdHJpbmc7IHJlc291cmNlOiBVUkkgfSlbXSA9IFtcblx0Ly8gQWJzb2x1dGVcblx0J2M6XFxcXGZvbycsXG5cdHsgbGluazogJ1xcXFxcXFxcP1xcXFxDOlxcXFxmb28nLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXGZvbycpIH0sXG5cdCdjOi9mb28nLFxuXHQnYzovZm9vL2JhcicsXG5cdCdjOlxcXFxmb29cXFxcYmFyJyxcblx0J2M6XFxcXGZvb1xcXFxiYXIrbW9yZScsXG5cdCdjOlxcXFxmb28vYmFyXFxcXGJheicsXG5cdC8vIFVSSSBmaWxlOi8vXG5cdHsgbGluazogJ2ZpbGU6Ly8vYzovZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdjOlxcXFxmb28nKSB9LFxuXHR7IGxpbms6ICdmaWxlOi8vL2M6L2Zvby9iYXInLCByZXNvdXJjZTogVVJJLmZpbGUoJ2M6XFxcXGZvb1xcXFxiYXInKSB9LFxuXHR7IGxpbms6ICdmaWxlOi8vL2M6L2Zvby9iYXIlMjBiYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ2M6XFxcXGZvb1xcXFxiYXIgYmF6JykgfSxcblx0Ly8gVXNlciBob21lXG5cdHsgbGluazogJ35cXFxcZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxIb21lXFxcXGZvbycpIH0sXG5cdHsgbGluazogJ34vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxIb21lXFxcXGZvbycpIH0sXG5cdC8vIFJlbGF0aXZlXG5cdHsgbGluazogJy5cXFxcZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvbycpIH0sXG5cdHsgbGluazogJy4vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvbycpIH0sXG5cdHsgbGluazogJy4vJGZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFwkZm9vJykgfSxcblx0eyBsaW5rOiAnLi5cXFxcZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyJykgfSxcblx0eyBsaW5rOiAnZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyJykgfSxcblx0eyBsaW5rOiAnZm9vL1tiYXJdJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxbYmFyXScpIH0sXG5cdHsgbGluazogJ2Zvby9bYmFyXS5iYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdLmJheicpIH0sXG5cdHsgbGluazogJ2Zvby9bYmFyXS9iYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdL2JheicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxiYXInLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXGJhcicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxbYmFyXS5iYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdLmJheicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxbYmFyXVxcXFxiYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdXFxcXGJheicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxiYXIrbW9yZScsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyK21vcmUnKSB9LFxuXTtcblxuY29uc3Qgd2luZG93c0xpbmtzV2l0aElzbzogKHN0cmluZyB8IHsgbGluazogc3RyaW5nOyByZXNvdXJjZTogVVJJIH0pW10gPSBbXG5cdC8vIElTTyA4NjAxIHRpbWVzdGFtcHMgLSB0ZXN0ZWQgc2VwYXJhdGVseSB0byBhdm9pZCBsaW5lL2NvbHVtbiBzdWZmaXggY29uZmxpY3RzXG5cdHsgbGluazogJy5cXFxcdGVzdC0yMDI1LTA0LTI4VDExOjAzOjA5KzAyOjAwLmxvZycsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFx0ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJykgfSxcbl07XG5cbmludGVyZmFjZSBMaW5rRm9ybWF0SW5mbyB7XG5cdHVybEZvcm1hdDogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIHN0YXJ0IG9mZnNldCB0byB0aGUgYnVmZmVyIHJhbmdlIHRoYXQgaXMgbm90IGluIHRoZSBhY3R1YWwgbGluayAoYnV0IGlzIGluIHRoZSBtYXRjaGVkXG5cdCAqIGFyZWEuXG5cdCAqL1xuXHRsaW5rQ2VsbFN0YXJ0T2Zmc2V0PzogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlIGVuZCBvZmZzZXQgdG8gdGhlIGJ1ZmZlciByYW5nZSB0aGF0IGlzIG5vdCBpbiB0aGUgYWN0dWFsIGxpbmsgKGJ1dCBpcyBpbiB0aGUgbWF0Y2hlZFxuXHQgKiBhcmVhLlxuXHQgKi9cblx0bGlua0NlbGxFbmRPZmZzZXQ/OiBudW1iZXI7XG5cdGxpbmU/OiBzdHJpbmc7XG5cdGNvbHVtbj86IHN0cmluZztcbn1cblxuY29uc3Qgc3VwcG9ydGVkTGlua0Zvcm1hdHM6IExpbmtGb3JtYXRJbmZvW10gPSBbXG5cdHsgdXJsRm9ybWF0OiAnezB9JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVwiIG9uIGxpbmUgezF9JywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XCIgb24gbGluZSB7MX0sIGNvbHVtbiB7Mn0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XCI6bGluZSB7MX0nLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1cIjpsaW5lIHsxfSwgY29sdW1uIHsyfScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1cIjogbGluZSB7MX0nLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1cIjogbGluZSB7MX0sIGNvbCB7Mn0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSknLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gKHsxfSknLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0sIHsxfScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSh7MX0sezJ9KScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gKHsxfSx7Mn0pJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfTogKHsxfSx7Mn0pJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSh7MX0sIHsyfSknLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9ICh7MX0sIHsyfSknLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9OiAoezF9LCB7Mn0pJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSh7MX06ezJ9KScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gKHsxfTp7Mn0pJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfTp7MX0nLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH06ezF9OnsyfScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gezF9OnsyfScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1bezF9XScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSBbezF9XScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVt7MX0sezJ9XScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gW3sxfSx7Mn1dJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfTogW3sxfSx7Mn1dJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVt7MX0sIHsyfV0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9IFt7MX0sIHsyfV0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9OiBbezF9LCB7Mn1dJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVt7MX06ezJ9XScsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0gW3sxfTp7Mn1dJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVwiLHsxfScsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVxcJyx7MX0nLCBsaW5lOiAnNScgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0jezF9JywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9I3sxfTp7Mn0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzUnIH1cbl07XG5cbmNvbnN0IHdpbmRvd3NGYWxsYmFja0xpbmtzOiAoc3RyaW5nIHwgeyBsaW5rOiBzdHJpbmc7IHJlc291cmNlOiBVUkkgfSlbXSA9IFtcblx0J0M6XFxcXGZvbyBiYXInLFxuXHQnQzpcXFxcZm9vIGJhclxcXFxiYXonLFxuXHQnQzpcXFxcZm9vXFxcXGJhciBiYXonLFxuXHQnQzpcXFxcZm9vL2JhciBiYXonXG5dO1xuXG5jb25zdCBzdXBwb3J0ZWRGYWxsYmFja0xpbmtGb3JtYXRzOiBMaW5rRm9ybWF0SW5mb1tdID0gW1xuXHQvLyBQeXRob24gc3R5bGUgZXJyb3I6IEZpbGUgXCI8cGF0aD5cIiwgbGluZSA8bGluZT5cblx0eyB1cmxGb3JtYXQ6ICdGaWxlIFwiezB9XCInLCBsaW5rQ2VsbFN0YXJ0T2Zmc2V0OiA1IH0sXG5cdHsgdXJsRm9ybWF0OiAnRmlsZSBcInswfVwiLCBsaW5lIHsxfScsIGxpbmU6ICc1JywgbGlua0NlbGxTdGFydE9mZnNldDogNSB9LFxuXHQvLyBVbmtub3duIHRvb2wgIzIwMDE2NjogRklMRSAgPHBhdGg+OjxsaW5lPjo8Y29sPlxuXHR7IHVybEZvcm1hdDogJyBGSUxFICB7MH0nLCBsaW5rQ2VsbFN0YXJ0T2Zmc2V0OiA3IH0sXG5cdHsgdXJsRm9ybWF0OiAnIEZJTEUgIHswfTp7MX0nLCBsaW5lOiAnNScsIGxpbmtDZWxsU3RhcnRPZmZzZXQ6IDcgfSxcblx0eyB1cmxGb3JtYXQ6ICcgRklMRSAgezB9OnsxfTp7Mn0nLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnLCBsaW5rQ2VsbFN0YXJ0T2Zmc2V0OiA3IH0sXG5cdC8vIFNvbWUgQysrIGNvbXBpbGUgZXJyb3IgZm9ybWF0c1xuXHR7IHVybEZvcm1hdDogJ3swfSh7MX0pIDonLCBsaW5lOiAnNScsIGxpbmtDZWxsRW5kT2Zmc2V0OiAtMiB9LFxuXHR7IHVybEZvcm1hdDogJ3swfSh7MX0sezJ9KSA6JywgbGluZTogJzUnLCBjb2x1bW46ICczJywgbGlua0NlbGxFbmRPZmZzZXQ6IC0yIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSwgezJ9KSA6JywgbGluZTogJzUnLCBjb2x1bW46ICczJywgbGlua0NlbGxFbmRPZmZzZXQ6IC0yIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSk6JywgbGluZTogJzUnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTEgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH0oezF9LHsyfSk6JywgbGluZTogJzUnLCBjb2x1bW46ICczJywgbGlua0NlbGxFbmRPZmZzZXQ6IC0xIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9KHsxfSwgezJ9KTonLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTEgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH06ezF9IDonLCBsaW5lOiAnNScsIGxpbmtDZWxsRW5kT2Zmc2V0OiAtMiB9LFxuXHR7IHVybEZvcm1hdDogJ3swfTp7MX06ezJ9IDonLCBsaW5lOiAnNScsIGNvbHVtbjogJzMnLCBsaW5rQ2VsbEVuZE9mZnNldDogLTIgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH06ezF9OicsIGxpbmU6ICc1JywgbGlua0NlbGxFbmRPZmZzZXQ6IC0xIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9OnsxfTp7Mn06JywgbGluZTogJzUnLCBjb2x1bW46ICczJywgbGlua0NlbGxFbmRPZmZzZXQ6IC0xIH0sXG5cdC8vIFBvd2VyU2hlbGwgcHJvbXB0XG5cdHsgdXJsRm9ybWF0OiAnUFMgezB9PicsIGxpbmtDZWxsU3RhcnRPZmZzZXQ6IDMsIGxpbmtDZWxsRW5kT2Zmc2V0OiAtMSB9LFxuXHQvLyBDbWQgcHJvbXB0XG5cdHsgdXJsRm9ybWF0OiAnezB9PicsIGxpbmtDZWxsRW5kT2Zmc2V0OiAtMSB9LFxuXHQvLyBUaGUgd2hvbGUgbGluZSBpcyB0aGUgcGF0aFxuXHR7IHVybEZvcm1hdDogJ3swfScgfSxcbl07XG5cbmNsYXNzIFRlc3RGaWxlU2VydmljZSBleHRlbmRzIEZpbGVTZXJ2aWNlIHtcblx0cHJpdmF0ZSBfZmlsZXM6IFVSSVtdIHwgJyonID0gJyonO1xuXHRvdmVycmlkZSBhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGE+IHtcblx0XHRpZiAodGhpcy5fZmlsZXMgPT09ICcqJyB8fCB0aGlzLl9maWxlcy5zb21lKGUgPT4gZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuIHsgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSB9IGFzIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGE7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignRU5PRU5UJyk7XG5cdH1cblx0c2V0RmlsZXMoZmlsZXM6IFVSSVtdIHwgJyonKTogdm9pZCB7XG5cdFx0dGhpcy5fZmlsZXMgPSBmaWxlcztcblx0fVxufVxuXG5zdWl0ZSgnV29ya2JlbmNoIC0gVGVybWluYWxMb2NhbExpbmtEZXRlY3RvcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogVGVzdEZpbGVTZXJ2aWNlO1xuXHRsZXQgZGV0ZWN0b3I6IFRlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3I7XG5cdGxldCByZXNvbHZlcjogVGVybWluYWxMaW5rUmVzb2x2ZXI7XG5cdGxldCB4dGVybTogVGVybWluYWw7XG5cdGxldCB2YWxpZFJlc291cmNlczogVVJJW107XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0TGlua3MoXG5cdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUsXG5cdFx0dGV4dDogc3RyaW5nLFxuXHRcdGV4cGVjdGVkOiAoeyB1cmk6IFVSSTsgcmFuZ2U6IFtudW1iZXIsIG51bWJlcl1bXSB9KVtdXG5cdCkge1xuXHRcdGxldCB0bztcblx0XHRjb25zdCByYWNlID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdGFzc2VydExpbmtIZWxwZXIodGV4dCwgZXhwZWN0ZWQsIGRldGVjdG9yLCB0eXBlKS50aGVuKCgpID0+ICdzdWNjZXNzJyksXG5cdFx0XHQodG8gPSB0aW1lb3V0KDIpKS50aGVuKCgpID0+ICd0aW1lb3V0Jylcblx0XHRdKTtcblx0XHRzdHJpY3RFcXVhbChyYWNlLCAnc3VjY2VzcycsIGBBd2FpdGluZyBsaW5rIGFzc2VydGlvbiBmb3IgXCIke3RleHR9XCIgdGltZWQgb3V0YCk7XG5cdFx0dG8uY2FuY2VsKCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRMaW5rc1dpdGhXcmFwcGVkKGxpbms6IHN0cmluZywgcmVzb3VyY2U/OiBVUkkpIHtcblx0XHRjb25zdCB1cmkgPSByZXNvdXJjZSA/PyBVUkkuZmlsZShsaW5rKTtcblx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGxpbmssIFt7IHVyaSwgcmFuZ2U6IFtbMSwgMV0sIFtsaW5rLmxlbmd0aCwgMV1dIH1dKTtcblx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGAgJHtsaW5rfSBgLCBbeyB1cmksIHJhbmdlOiBbWzIsIDFdLCBbbGluay5sZW5ndGggKyAxLCAxXV0gfV0pO1xuXHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYCgke2xpbmt9KWAsIFt7IHVyaSwgcmFuZ2U6IFtbMiwgMV0sIFtsaW5rLmxlbmd0aCArIDEsIDFdXSB9XSk7XG5cdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCBgWyR7bGlua31dYCwgW3sgdXJpLCByYW5nZTogW1syLCAxXSwgW2xpbmsubGVuZ3RoICsgMSwgMV1dIH1dKTtcblx0fVxuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0RmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdC8vIE92ZXJyaWRlIHRoZSBzZXRGaWxlcyBtZXRob2QgdG8gd29yayB3aXRoIHZhbGlkUmVzb3VyY2VzIGZvciB0ZXN0aW5nXG5cdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJVXJpSWRlbnRpdHlTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IFVyaUlkZW50aXR5U2VydmljZShmaWxlU2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbExvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRyZXNvbHZlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTGlua1Jlc29sdmVyKTtcblx0XHR2YWxpZFJlc291cmNlcyA9IFtdO1xuXG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdHh0ZXJtID0gbmV3IFRlcm1pbmFsQ3Rvcih7IGFsbG93UHJvcG9zZWRBcGk6IHRydWUsIGNvbHM6IDgwLCByb3dzOiAzMCwgbG9nZ2VyOiBUZXN0WHRlcm1Mb2dnZXIgfSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwbGF0Zm9ybSBpbmRlcGVuZGVudCcsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRkZXRlY3RvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxMaW5rRGV0ZWN0b3IsIHh0ZXJtLCBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpLCB7XG5cdFx0XHRcdGluaXRpYWxDd2Q6ICcvcGFyZW50L2N3ZCcsXG5cdFx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXgsXG5cdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VySG9tZTogJy9ob21lJyxcblx0XHRcdFx0YmFja2VuZDogdW5kZWZpbmVkXG5cdFx0XHR9LCByZXNvbHZlcik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc3VwcG9ydCBtdWx0aXBsZSBsaW5rIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtcblx0XHRcdFx0VVJJLmZpbGUoJy9wYXJlbnQvY3dkL2ZvbycpLFxuXHRcdFx0XHRVUkkuZmlsZSgnL3BhcmVudC9jd2QvYmFyJylcblx0XHRcdF07XG5cdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsICcuL2ZvbyAuL2JhcicsIFtcblx0XHRcdFx0eyByYW5nZTogW1sxLCAxXSwgWzUsIDFdXSwgdXJpOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vJykgfSxcblx0XHRcdFx0eyByYW5nZTogW1s3LCAxXSwgWzExLCAxXV0sIHVyaTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2JhcicpIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN1cHBvcnQgdHJpbW1pbmcgZXh0cmEgcXVvdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2ZvbycpXTtcblx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgJ1wiZm9vXCJcIiBvbiBsaW5lIDUnLCBbXG5cdFx0XHRcdHsgcmFuZ2U6IFtbMSwgMV0sIFsxNiwgMV1dLCB1cmk6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IHRyaW1taW5nIGV4dHJhIHNxdWFyZSBicmFja2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKV07XG5cdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsICdcImZvb11cIiBvbiBsaW5lIDUnLCBbXG5cdFx0XHRcdHsgcmFuZ2U6IFtbMSwgMV0sIFsxNiwgMV1dLCB1cmk6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdXBwb3J0IGZpbmRpbmcgbGlua3MgYWZ0ZXIgYnJhY2tldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vJyldO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCAnYmFyW2Zvbzo1JywgW1xuXHRcdFx0XHR7IHJhbmdlOiBbWzUsIDFdLCBbOSwgMV1dLCB1cmk6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28nKSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21hY09TL0xpbnV4JywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGRldGVjdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbExpbmtEZXRlY3RvciwgeHRlcm0sIHN0b3JlLmFkZChuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKSksIHtcblx0XHRcdFx0aW5pdGlhbEN3ZDogJy9wYXJlbnQvY3dkJyxcblx0XHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eCxcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJIb21lOiAnL2hvbWUnLFxuXHRcdFx0XHRiYWNrZW5kOiB1bmRlZmluZWRcblx0XHRcdH0sIHJlc29sdmVyKTtcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgbCBvZiB1bml4TGlua3MpIHtcblx0XHRcdGNvbnN0IGJhc2VMaW5rID0gaXNTdHJpbmcobCkgPyBsIDogbC5saW5rO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBpc1N0cmluZyhsKSA/IFVSSS5maWxlKGwpIDogbC5yZXNvdXJjZTtcblx0XHRcdHN1aXRlKGBMaW5rOiAke2Jhc2VMaW5rfWAsICgpID0+IHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdXBwb3J0ZWRMaW5rRm9ybWF0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGxpbmtGb3JtYXQgPSBzdXBwb3J0ZWRMaW5rRm9ybWF0c1tpXTtcblx0XHRcdFx0XHRjb25zdCBmb3JtYXR0ZWRMaW5rID0gZm9ybWF0KGxpbmtGb3JtYXQudXJsRm9ybWF0LCBiYXNlTGluaywgbGlua0Zvcm1hdC5saW5lLCBsaW5rRm9ybWF0LmNvbHVtbik7XG5cdFx0XHRcdFx0dGVzdChgc2hvdWxkIGRldGVjdCBpbiBcIiR7Zm9ybWF0dGVkTGlua31cImAsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW3Jlc291cmNlXTtcblx0XHRcdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzV2l0aFdyYXBwZWQoZm9ybWF0dGVkTGluaywgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdHaXQgZGlmZiBsaW5rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5maWxlKCcvcGFyZW50L2N3ZC9mb28vYmFyJyldO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCBgZGlmZiAtLWdpdCBhL2Zvby9iYXIgYi9mb28vYmFyYCwgW1xuXHRcdFx0XHR7IHVyaTogdmFsaWRSZXNvdXJjZXNbMF0sIHJhbmdlOiBbWzE0LCAxXSwgWzIwLCAxXV0gfSxcblx0XHRcdFx0eyB1cmk6IHZhbGlkUmVzb3VyY2VzWzBdLCByYW5nZTogW1syNCwgMV0sIFszMCwgMV1dIH1cblx0XHRcdF0pO1xuXHRcdFx0YXdhaXQgYXNzZXJ0TGlua3MoVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlLCBgLS0tIGEvZm9vL2JhcmAsIFt7IHVyaTogdmFsaWRSZXNvdXJjZXNbMF0sIHJhbmdlOiBbWzcsIDFdLCBbMTMsIDFdXSB9XSk7XG5cdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGArKysgYi9mb28vYmFyYCwgW3sgdXJpOiB2YWxpZFJlc291cmNlc1swXSwgcmFuZ2U6IFtbNywgMV0sIFsxMywgMV1dIH1dKTtcblx0XHR9KTtcblxuXHRcdC8vIFRlc3QgSVNPIDg2MDEgbGlua3Mgc2VwYXJhdGVseSB3aXRoIG9ubHkgYmFzZSBmb3JtYXQgdG8gYXZvaWQgc3VmZml4IGNvbmZsaWN0c1xuXHRcdC8vIE5vdGU6IE9ubHkgdGVzdCBwbGFpbiBmb3JtYXQgYXMgY29sb25zIGFyZSBleGNsdWRlZCBwYXRoIGNoYXJhY3RlcnMgaW4gdGhlIHJlZ2V4LFxuXHRcdC8vIHNvIHdyYXBwZWQgY29udGV4dHMgKHNwYWNlcywgcGFyZW50aGVzZXMsIGJyYWNrZXRzKSB3b24ndCB3b3JrXG5cdFx0Zm9yIChjb25zdCBsIG9mIHVuaXhMaW5rc1dpdGhJc28pIHtcblx0XHRcdGNvbnN0IGJhc2VMaW5rID0gdHlwZW9mIGwgPT09ICdzdHJpbmcnID8gbCA6IGwubGluaztcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdHlwZW9mIGwgPT09ICdzdHJpbmcnID8gVVJJLmZpbGUobCkgOiBsLnJlc291cmNlO1xuXHRcdFx0dGVzdChgc2hvdWxkIGRldGVjdCBJU08gODYwMSBsaW5rOiAke2Jhc2VMaW5rfWAsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYmFzZUxpbmssIFt7IHVyaTogcmVzb3VyY2UsIHJhbmdlOiBbWzEsIDFdLCBbYmFzZUxpbmsubGVuZ3RoLCAxXV0gfV0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxuXHQvLyBPbmx5IHRlc3QgdGhlc2Ugd2hlbiBvbiBXaW5kb3dzIGJlY2F1c2UgdGhlcmUgaXMgc3BlY2lhbCBiZWhhdmlvciBhcm91bmQgcmVwbGFjaW5nIHNlcGFyYXRvcnNcblx0Ly8gaW4gVVJJIHRoYXQgY2Fubm90IGJlIGNoYW5nZWRcblx0aWYgKGlzV2luZG93cykge1xuXHRcdHN1aXRlKCdXaW5kb3dzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd3NsVW5peFRvV2luZG93c1BhdGhNYXA6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwKCk7XG5cblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0ZGV0ZWN0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsTGlua0RldGVjdG9yLCB4dGVybSwgc3RvcmUuYWRkKG5ldyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSgpKSwge1xuXHRcdFx0XHRcdGluaXRpYWxDd2Q6ICdDOlxcXFxQYXJlbnRcXFxcQ3dkJyxcblx0XHRcdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsXG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXNlckhvbWU6ICdDOlxcXFxIb21lJyxcblx0XHRcdFx0XHRiYWNrZW5kOiB7XG5cdFx0XHRcdFx0XHRhc3luYyBnZXRXc2xQYXRoKG9yaWdpbmFsOiBzdHJpbmcsIGRpcmVjdGlvbjogJ3VuaXgtdG8td2luJyB8ICd3aW4tdG8tdW5peCcpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGRpcmVjdGlvbiA9PT0gJ3VuaXgtdG8td2luJykge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB3c2xVbml4VG9XaW5kb3dzUGF0aE1hcC5nZXQob3JpZ2luYWwpID8/IG9yaWdpbmFsO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBvcmlnaW5hbDtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCByZXNvbHZlcik7XG5cdFx0XHRcdHdzbFVuaXhUb1dpbmRvd3NQYXRoTWFwLmNsZWFyKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Zm9yIChjb25zdCBsIG9mIHdpbmRvd3NMaW5rcykge1xuXHRcdFx0XHRjb25zdCBiYXNlTGluayA9IGlzU3RyaW5nKGwpID8gbCA6IGwubGluaztcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBpc1N0cmluZyhsKSA/IFVSSS5maWxlKGwpIDogbC5yZXNvdXJjZTtcblx0XHRcdFx0c3VpdGUoYExpbmsgXCIke2Jhc2VMaW5rfVwiYCwgKCkgPT4ge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3VwcG9ydGVkTGlua0Zvcm1hdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmtGb3JtYXQgPSBzdXBwb3J0ZWRMaW5rRm9ybWF0c1tpXTtcblx0XHRcdFx0XHRcdGNvbnN0IGZvcm1hdHRlZExpbmsgPSBmb3JtYXQobGlua0Zvcm1hdC51cmxGb3JtYXQsIGJhc2VMaW5rLCBsaW5rRm9ybWF0LmxpbmUsIGxpbmtGb3JtYXQuY29sdW1uKTtcblx0XHRcdFx0XHRcdHRlc3QoYHNob3VsZCBkZXRlY3QgaW4gXCIke2Zvcm1hdHRlZExpbmt9XCJgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW3Jlc291cmNlXTtcblx0XHRcdFx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rc1dpdGhXcmFwcGVkKGZvcm1hdHRlZExpbmssIHJlc291cmNlKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgbCBvZiB3aW5kb3dzRmFsbGJhY2tMaW5rcykge1xuXHRcdFx0XHRjb25zdCBiYXNlTGluayA9IGlzU3RyaW5nKGwpID8gbCA6IGwubGluaztcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBpc1N0cmluZyhsKSA/IFVSSS5maWxlKGwpIDogbC5yZXNvdXJjZTtcblx0XHRcdFx0c3VpdGUoYEZhbGxiYWNrIGxpbmsgXCIke2Jhc2VMaW5rfVwiYCwgKCkgPT4ge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3VwcG9ydGVkRmFsbGJhY2tMaW5rRm9ybWF0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlua0Zvcm1hdCA9IHN1cHBvcnRlZEZhbGxiYWNrTGlua0Zvcm1hdHNbaV07XG5cdFx0XHRcdFx0XHRjb25zdCBmb3JtYXR0ZWRMaW5rID0gZm9ybWF0KGxpbmtGb3JtYXQudXJsRm9ybWF0LCBiYXNlTGluaywgbGlua0Zvcm1hdC5saW5lLCBsaW5rRm9ybWF0LmNvbHVtbik7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rQ2VsbFN0YXJ0T2Zmc2V0ID0gbGlua0Zvcm1hdC5saW5rQ2VsbFN0YXJ0T2Zmc2V0ID8/IDA7XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rQ2VsbEVuZE9mZnNldCA9IGxpbmtGb3JtYXQubGlua0NlbGxFbmRPZmZzZXQgPz8gMDtcblx0XHRcdFx0XHRcdHRlc3QoYHNob3VsZCBkZXRlY3QgaW4gXCIke2Zvcm1hdHRlZExpbmt9XCJgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW3Jlc291cmNlXTtcblx0XHRcdFx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGZvcm1hdHRlZExpbmssIFt7IHVyaTogcmVzb3VyY2UsIHJhbmdlOiBbWzEgKyBsaW5rQ2VsbFN0YXJ0T2Zmc2V0LCAxXSwgW2Zvcm1hdHRlZExpbmsubGVuZ3RoICsgbGlua0NlbGxFbmRPZmZzZXQsIDFdXSB9XSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXN0KCdHaXQgZGlmZiBsaW5rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyJyk7XG5cdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW3Jlc291cmNlXTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXModmFsaWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGBkaWZmIC0tZ2l0IGEvZm9vL2JhciBiL2Zvby9iYXJgLCBbXG5cdFx0XHRcdFx0eyB1cmk6IHJlc291cmNlLCByYW5nZTogW1sxNCwgMV0sIFsyMCwgMV1dIH0sXG5cdFx0XHRcdFx0eyB1cmk6IHJlc291cmNlLCByYW5nZTogW1syNCwgMV0sIFszMCwgMV1dIH1cblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgYC0tLSBhL2Zvby9iYXJgLCBbeyB1cmk6IHJlc291cmNlLCByYW5nZTogW1s3LCAxXSwgWzEzLCAxXV0gfV0pO1xuXHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGArKysgYi9mb28vYmFyYCwgW3sgdXJpOiByZXNvdXJjZSwgcmFuZ2U6IFtbNywgMV0sIFsxMywgMV1dIH1dKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUZXN0IElTTyA4NjAxIGxpbmtzIHNlcGFyYXRlbHkgd2l0aCBvbmx5IGJhc2UgZm9ybWF0IHRvIGF2b2lkIHN1ZmZpeCBjb25mbGljdHNcblx0XHRcdC8vIE5vdGU6IE9ubHkgdGVzdCBwbGFpbiBmb3JtYXQgYXMgY29sb25zIGFyZSBleGNsdWRlZCBwYXRoIGNoYXJhY3RlcnMgaW4gdGhlIHJlZ2V4LFxuXHRcdFx0Ly8gc28gd3JhcHBlZCBjb250ZXh0cyAoc3BhY2VzLCBwYXJlbnRoZXNlcywgYnJhY2tldHMpIHdvbid0IHdvcmtcblx0XHRcdGZvciAoY29uc3QgbCBvZiB3aW5kb3dzTGlua3NXaXRoSXNvKSB7XG5cdFx0XHRcdGNvbnN0IGJhc2VMaW5rID0gdHlwZW9mIGwgPT09ICdzdHJpbmcnID8gbCA6IGwubGluaztcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0eXBlb2YgbCA9PT0gJ3N0cmluZycgPyBVUkkuZmlsZShsKSA6IGwucmVzb3VyY2U7XG5cdFx0XHRcdHRlc3QoYHNob3VsZCBkZXRlY3QgSVNPIDg2MDEgbGluazogJHtiYXNlTGlua31gLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbcmVzb3VyY2VdO1xuXHRcdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rcyhUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5Mb2NhbEZpbGUsIGJhc2VMaW5rLCBbeyB1cmk6IHJlc291cmNlLCByYW5nZTogW1sxLCAxXSwgW2Jhc2VMaW5rLmxlbmd0aCwgMV1dIH1dKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHN1aXRlKCdXU0wnLCAoKSA9PiB7XG5cdFx0XHRcdHRlc3QoJ1VuaXggLT4gV2luZG93cyAvbW50LyBzdHlsZSBsaW5rcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR3c2xVbml4VG9XaW5kb3dzUGF0aE1hcC5zZXQoJy9tbnQvYy9mb28vYmFyJywgJ0M6XFxcXGZvb1xcXFxiYXInKTtcblx0XHRcdFx0XHR2YWxpZFJlc291cmNlcyA9IFtVUkkuZmlsZSgnQzpcXFxcZm9vXFxcXGJhcicpXTtcblx0XHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0TGlua3NXaXRoV3JhcHBlZCgnL21udC9jL2Zvby9iYXInLCB2YWxpZFJlc291cmNlc1swXSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRlc3QoJ1dpbmRvd3MgLT4gVW5peCBcXFxcXFxcXHdzbCRcXFxcIHN0eWxlIGxpbmtzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW1VSSS5maWxlKCdcXFxcXFxcXHdzbCRcXFxcRGViaWFuXFxcXGhvbWVcXFxcZm9vXFxcXGJhcicpXTtcblx0XHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyh2YWxpZFJlc291cmNlcyk7XG5cdFx0XHRcdFx0YXdhaXQgYXNzZXJ0TGlua3NXaXRoV3JhcHBlZCgnXFxcXFxcXFx3c2wkXFxcXERlYmlhblxcXFxob21lXFxcXGZvb1xcXFxiYXInKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGVzdCgnV2luZG93cyAtPiBVbml4IFxcXFxcXFxcd3NsLmxvY2FsaG9zdFxcXFwgc3R5bGUgbGlua3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0dmFsaWRSZXNvdXJjZXMgPSBbVVJJLmZpbGUoJ1xcXFxcXFxcd3NsLmxvY2FsaG9zdFxcXFxEZWJpYW5cXFxcaG9tZVxcXFxmb29cXFxcYmFyJyldO1xuXHRcdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKHZhbGlkUmVzb3VyY2VzKTtcblx0XHRcdFx0XHRhd2FpdCBhc3NlcnRMaW5rc1dpdGhXcmFwcGVkKCdcXFxcXFxcXHdzbC5sb2NhbGhvc3RcXFxcRGViaWFuXFxcXGhvbWVcXFxcZm9vXFxcXGJhcicpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVyx1QkFBdUI7QUFDM0MsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9CQUFrRDtBQUMzRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFFaEMsTUFBTSxZQUEwRDtBQUFBO0FBQUEsRUFFL0Q7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBO0FBQUEsRUFFQSxFQUFFLE1BQU0sZUFBZSxVQUFVLElBQUksS0FBSyxNQUFNLEVBQUU7QUFBQSxFQUNsRCxFQUFFLE1BQU0sbUJBQW1CLFVBQVUsSUFBSSxLQUFLLFVBQVUsRUFBRTtBQUFBLEVBQzFELEVBQUUsTUFB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
