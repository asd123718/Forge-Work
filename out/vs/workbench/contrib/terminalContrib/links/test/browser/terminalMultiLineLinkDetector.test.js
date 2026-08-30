import { isWindows, OperatingSystem } from "../../../../../../base/common/platform.js";
import { format } from "../../../../../../base/common/strings.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { TerminalBuiltinLinkType } from "../../browser/links.js";
import { assertLinkHelper } from "./linkTestUtils.js";
import { timeout } from "../../../../../../base/common/async.js";
import { strictEqual } from "assert";
import { TerminalLinkResolver } from "../../browser/terminalLinkResolver.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { createFileStat } from "../../../../../test/common/workbenchTestServices.js";
import { URI } from "../../../../../../base/common/uri.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
import { TerminalMultiLineLinkDetector } from "../../browser/terminalMultiLineLinkDetector.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
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
  // User home
  { link: "~/foo", resource: URI.file("/home/foo") },
  // Relative
  { link: "./foo", resource: URI.file("/parent/cwd/foo") },
  { link: "./$foo", resource: URI.file("/parent/cwd/$foo") },
  { link: "../foo", resource: URI.file("/parent/foo") },
  { link: "foo/bar", resource: URI.file("/parent/cwd/foo/bar") },
  { link: "foo/bar+more", resource: URI.file("/parent/cwd/foo/bar+more") }
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
const supportedLinkFormats = [
  // 5: file content...                         [#181837]
  //   5:3  error                               [#181837]
  { urlFormat: "{0}\r\n{1}:foo", line: "5" },
  { urlFormat: "{0}\r\n{1}: foo", line: "5" },
  { urlFormat: "{0}\r\n5:another link\r\n{1}:{2} foo", line: "5", column: "3" },
  { urlFormat: "{0}\r\n  {1}:{2} foo", line: "5", column: "3" },
  { urlFormat: "{0}\r\n  5:6  error  another one\r\n  {1}:{2}  error", line: "5", column: "3" },
  { urlFormat: `{0}\r
  5:6  error  ${"a".repeat(80)}\r
  {1}:{2}  error`, line: "5", column: "3" },
  // @@ ... <to-file-range> @@ content...       [#182878]   (tests check the entire line, so they don't include the line content at the end of the last @@)
  { urlFormat: "+++ b/{0}\r\n@@ -7,6 +{1},7 @@", line: "5" },
  { urlFormat: "+++ b/{0}\r\n@@ -1,1 +1,1 @@\r\nfoo\r\nbar\r\n@@ -7,6 +{1},7 @@", line: "5" }
];
suite("Workbench - TerminalMultiLineLinkDetector", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
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
  async function assertLinksMain(link, resource) {
    const uri = resource ?? URI.file(link);
    const lines = link.split("\r\n");
    const lastLine = lines.at(-1);
    let lineCount = 0;
    for (const line of lines) {
      lineCount += Math.max(Math.ceil(line.length / 80), 1);
    }
    await assertLinks(TerminalBuiltinLinkType.LocalFile, link, [{ uri, range: [[1, lineCount], [lastLine.length, lineCount]] }]);
  }
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    configurationService = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, configurationService);
    instantiationService.stub(IFileService, {
      async stat(resource) {
        if (!validResources.map((e) => e.path).includes(resource.path)) {
          throw new Error("Doesn't exist");
        }
        return createFileStat(resource);
      }
    });
    instantiationService.stub(ITerminalLogService, new NullLogService());
    resolver = instantiationService.createInstance(TerminalLinkResolver);
    validResources = [];
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger });
  });
  suite("macOS/Linux", () => {
    setup(() => {
      detector = instantiationService.createInstance(TerminalMultiLineLinkDetector, xterm, {
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
          test(`should detect in "${escapeMultilineTestName(formattedLink)}"`, async () => {
            validResources = [resource];
            await assertLinksMain(formattedLink, resource);
          });
        }
      });
    }
  });
  if (isWindows) {
    suite("Windows", () => {
      setup(() => {
        detector = instantiationService.createInstance(TerminalMultiLineLinkDetector, xterm, {
          initialCwd: "C:\\Parent\\Cwd",
          os: OperatingSystem.Windows,
          remoteAuthority: void 0,
          userHome: "C:\\Home"
        }, resolver);
      });
      for (const l of windowsLinks) {
        const baseLink = isString(l) ? l : l.link;
        const resource = isString(l) ? URI.file(l) : l.resource;
        suite(`Link "${baseLink}"`, () => {
          for (let i = 0; i < supportedLinkFormats.length; i++) {
            const linkFormat = supportedLinkFormats[i];
            const formattedLink = format(linkFormat.urlFormat, baseLink, linkFormat.line, linkFormat.column);
            test(`should detect in "${escapeMultilineTestName(formattedLink)}"`, async () => {
              validResources = [resource];
              await assertLinksMain(formattedLink, resource);
            });
          }
        });
      }
    });
  }
});
function escapeMultilineTestName(text) {
  return text.replaceAll("\r\n", "\\r\\n");
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcbGlua3NcXHRlc3RcXGJyb3dzZXJcXHRlcm1pbmFsTXVsdGlMaW5lTGlua0RldGVjdG9yLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbGlua3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TGlua0hlbHBlciB9IGZyb20gJy4vbGlua1Rlc3RVdGlscy5qcyc7XG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBUZXJtaW5hbExpbmtSZXNvbHZlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxMaW5rUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3IgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsTXVsdGlMaW5lTGlua0RldGVjdG9yLmpzJztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1Mb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC90ZXN0L2NvbW1vbi90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcblxuY29uc3QgdW5peExpbmtzOiAoc3RyaW5nIHwgeyBsaW5rOiBzdHJpbmc7IHJlc291cmNlOiBVUkkgfSlbXSA9IFtcblx0Ly8gQWJzb2x1dGVcblx0Jy9mb28nLFxuXHQnL2Zvby9iYXInLFxuXHQnL2Zvby9bYmFyXScsXG5cdCcvZm9vL1tiYXJdLmJheicsXG5cdCcvZm9vL1tiYXJdL2JheicsXG5cdCcvZm9vL2Jhcittb3JlJyxcblx0Ly8gVXNlciBob21lXG5cdHsgbGluazogJ34vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCcvaG9tZS9mb28nKSB9LFxuXHQvLyBSZWxhdGl2ZVxuXHR7IGxpbms6ICcuL2ZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnL3BhcmVudC9jd2QvZm9vJykgfSxcblx0eyBsaW5rOiAnLi8kZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCcvcGFyZW50L2N3ZC8kZm9vJykgfSxcblx0eyBsaW5rOiAnLi4vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCcvcGFyZW50L2ZvbycpIH0sXG5cdHsgbGluazogJ2Zvby9iYXInLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2Zvby9iYXInKSB9LFxuXHR7IGxpbms6ICdmb28vYmFyK21vcmUnLCByZXNvdXJjZTogVVJJLmZpbGUoJy9wYXJlbnQvY3dkL2Zvby9iYXIrbW9yZScpIH0sXG5dO1xuXG5jb25zdCB3aW5kb3dzTGlua3M6IChzdHJpbmcgfCB7IGxpbms6IHN0cmluZzsgcmVzb3VyY2U6IFVSSSB9KVtdID0gW1xuXHQvLyBBYnNvbHV0ZVxuXHQnYzpcXFxcZm9vJyxcblx0eyBsaW5rOiAnXFxcXFxcXFw/XFxcXEM6XFxcXGZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcZm9vJykgfSxcblx0J2M6L2ZvbycsXG5cdCdjOi9mb28vYmFyJyxcblx0J2M6XFxcXGZvb1xcXFxiYXInLFxuXHQnYzpcXFxcZm9vXFxcXGJhcittb3JlJyxcblx0J2M6XFxcXGZvby9iYXJcXFxcYmF6Jyxcblx0Ly8gVXNlciBob21lXG5cdHsgbGluazogJ35cXFxcZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxIb21lXFxcXGZvbycpIH0sXG5cdHsgbGluazogJ34vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxIb21lXFxcXGZvbycpIH0sXG5cdC8vIFJlbGF0aXZlXG5cdHsgbGluazogJy5cXFxcZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvbycpIH0sXG5cdHsgbGluazogJy4vZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvbycpIH0sXG5cdHsgbGluazogJy4vJGZvbycsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFwkZm9vJykgfSxcblx0eyBsaW5rOiAnLi5cXFxcZm9vJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcZm9vJykgfSxcblx0eyBsaW5rOiAnZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyJykgfSxcblx0eyBsaW5rOiAnZm9vL2JhcicsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyJykgfSxcblx0eyBsaW5rOiAnZm9vL1tiYXJdJywgcmVzb3VyY2U6IFVSSS5maWxlKCdDOlxcXFxQYXJlbnRcXFxcQ3dkXFxcXGZvb1xcXFxbYmFyXScpIH0sXG5cdHsgbGluazogJ2Zvby9bYmFyXS5iYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdLmJheicpIH0sXG5cdHsgbGluazogJ2Zvby9bYmFyXS9iYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdL2JheicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxiYXInLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXGJhcicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxbYmFyXS5iYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdLmJheicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxbYmFyXVxcXFxiYXonLCByZXNvdXJjZTogVVJJLmZpbGUoJ0M6XFxcXFBhcmVudFxcXFxDd2RcXFxcZm9vXFxcXFtiYXJdXFxcXGJheicpIH0sXG5cdHsgbGluazogJ2Zvb1xcXFxiYXIrbW9yZScsIHJlc291cmNlOiBVUkkuZmlsZSgnQzpcXFxcUGFyZW50XFxcXEN3ZFxcXFxmb29cXFxcYmFyK21vcmUnKSB9LFxuXTtcblxuaW50ZXJmYWNlIExpbmtGb3JtYXRJbmZvIHtcblx0dXJsRm9ybWF0OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgc3RhcnQgb2Zmc2V0IHRvIHRoZSBidWZmZXIgcmFuZ2UgdGhhdCBpcyBub3QgaW4gdGhlIGFjdHVhbCBsaW5rIChidXQgaXMgaW4gdGhlIG1hdGNoZWRcblx0ICogYXJlYS5cblx0ICovXG5cdGxpbmtDZWxsU3RhcnRPZmZzZXQ/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgZW5kIG9mZnNldCB0byB0aGUgYnVmZmVyIHJhbmdlIHRoYXQgaXMgbm90IGluIHRoZSBhY3R1YWwgbGluayAoYnV0IGlzIGluIHRoZSBtYXRjaGVkXG5cdCAqIGFyZWEuXG5cdCAqL1xuXHRsaW5rQ2VsbEVuZE9mZnNldD86IG51bWJlcjtcblx0bGluZT86IHN0cmluZztcblx0Y29sdW1uPzogc3RyaW5nO1xufVxuXG5jb25zdCBzdXBwb3J0ZWRMaW5rRm9ybWF0czogTGlua0Zvcm1hdEluZm9bXSA9IFtcblx0Ly8gNTogZmlsZSBjb250ZW50Li4uICAgICAgICAgICAgICAgICAgICAgICAgIFsjMTgxODM3XVxuXHQvLyAgIDU6MyAgZXJyb3IgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWyMxODE4MzddXG5cdHsgdXJsRm9ybWF0OiAnezB9XFxyXFxuezF9OmZvbycsIGxpbmU6ICc1JyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVxcclxcbnsxfTogZm9vJywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnezB9XFxyXFxuNTphbm90aGVyIGxpbmtcXHJcXG57MX06ezJ9IGZvbycsIGxpbmU6ICc1JywgY29sdW1uOiAnMycgfSxcblx0eyB1cmxGb3JtYXQ6ICd7MH1cXHJcXG4gIHsxfTp7Mn0gZm9vJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogJ3swfVxcclxcbiAgNTo2ICBlcnJvciAgYW5vdGhlciBvbmVcXHJcXG4gIHsxfTp7Mn0gIGVycm9yJywgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXHR7IHVybEZvcm1hdDogYHswfVxcclxcbiAgNTo2ICBlcnJvciAgJHsnYScucmVwZWF0KDgwKX1cXHJcXG4gIHsxfTp7Mn0gIGVycm9yYCwgbGluZTogJzUnLCBjb2x1bW46ICczJyB9LFxuXG5cdC8vIEBAIC4uLiA8dG8tZmlsZS1yYW5nZT4gQEAgY29udGVudC4uLiAgICAgICBbIzE4Mjg3OF0gICAodGVzdHMgY2hlY2sgdGhlIGVudGlyZSBsaW5lLCBzbyB0aGV5IGRvbid0IGluY2x1ZGUgdGhlIGxpbmUgY29udGVudCBhdCB0aGUgZW5kIG9mIHRoZSBsYXN0IEBAKVxuXHR7IHVybEZvcm1hdDogJysrKyBiL3swfVxcclxcbkBAIC03LDYgK3sxfSw3IEBAJywgbGluZTogJzUnIH0sXG5cdHsgdXJsRm9ybWF0OiAnKysrIGIvezB9XFxyXFxuQEAgLTEsMSArMSwxIEBAXFxyXFxuZm9vXFxyXFxuYmFyXFxyXFxuQEAgLTcsNiArezF9LDcgQEAnLCBsaW5lOiAnNScgfSxcbl07XG5cbnN1aXRlKCdXb3JrYmVuY2ggLSBUZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3RvcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBkZXRlY3RvcjogVGVybWluYWxNdWx0aUxpbmVMaW5rRGV0ZWN0b3I7XG5cdGxldCByZXNvbHZlcjogVGVybWluYWxMaW5rUmVzb2x2ZXI7XG5cdGxldCB4dGVybTogVGVybWluYWw7XG5cdGxldCB2YWxpZFJlc291cmNlczogVVJJW107XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0TGlua3MoXG5cdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUsXG5cdFx0dGV4dDogc3RyaW5nLFxuXHRcdGV4cGVjdGVkOiAoeyB1cmk6IFVSSTsgcmFuZ2U6IFtudW1iZXIsIG51bWJlcl1bXSB9KVtdXG5cdCkge1xuXHRcdGxldCB0bztcblx0XHRjb25zdCByYWNlID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdGFzc2VydExpbmtIZWxwZXIodGV4dCwgZXhwZWN0ZWQsIGRldGVjdG9yLCB0eXBlKS50aGVuKCgpID0+ICdzdWNjZXNzJyksXG5cdFx0XHQodG8gPSB0aW1lb3V0KDIpKS50aGVuKCgpID0+ICd0aW1lb3V0Jylcblx0XHRdKTtcblx0XHRzdHJpY3RFcXVhbChyYWNlLCAnc3VjY2VzcycsIGBBd2FpdGluZyBsaW5rIGFzc2VydGlvbiBmb3IgXCIke3RleHR9XCIgdGltZWQgb3V0YCk7XG5cdFx0dG8uY2FuY2VsKCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBhc3NlcnRMaW5rc01haW4obGluazogc3RyaW5nLCByZXNvdXJjZT86IFVSSSkge1xuXHRcdGNvbnN0IHVyaSA9IHJlc291cmNlID8/IFVSSS5maWxlKGxpbmspO1xuXHRcdGNvbnN0IGxpbmVzID0gbGluay5zcGxpdCgnXFxyXFxuJyk7XG5cdFx0Y29uc3QgbGFzdExpbmUgPSBsaW5lcy5hdCgtMSkhO1xuXHRcdC8vIENvdW50IGxpbmVzLCBhY2NvdW50aW5nIGZvciB3cmFwcGluZ1xuXHRcdGxldCBsaW5lQ291bnQgPSAwO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBsaW5lcykge1xuXHRcdFx0bGluZUNvdW50ICs9IE1hdGgubWF4KE1hdGguY2VpbChsaW5lLmxlbmd0aCAvIDgwKSwgMSk7XG5cdFx0fVxuXHRcdGF3YWl0IGFzc2VydExpbmtzKFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZSwgbGluaywgW3sgdXJpLCByYW5nZTogW1sxLCBsaW5lQ291bnRdLCBbbGFzdExpbmUubGVuZ3RoLCBsaW5lQ291bnRdXSB9XSk7XG5cdH1cblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCB7XG5cdFx0XHRhc3luYyBzdGF0KHJlc291cmNlKSB7XG5cdFx0XHRcdGlmICghdmFsaWRSZXNvdXJjZXMubWFwKGUgPT4gZS5wYXRoKS5pbmNsdWRlcyhyZXNvdXJjZS5wYXRoKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignRG9lc25cXCd0IGV4aXN0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpbGVTdGF0KHJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZXJtaW5hbExvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRyZXNvbHZlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTGlua1Jlc29sdmVyKTtcblx0XHR2YWxpZFJlc291cmNlcyA9IFtdO1xuXG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdHh0ZXJtID0gbmV3IFRlcm1pbmFsQ3Rvcih7IGFsbG93UHJvcG9zZWRBcGk6IHRydWUsIGNvbHM6IDgwLCByb3dzOiAzMCwgbG9nZ2VyOiBUZXN0WHRlcm1Mb2dnZXIgfSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtYWNPUy9MaW51eCcsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRkZXRlY3RvciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTXVsdGlMaW5lTGlua0RldGVjdG9yLCB4dGVybSwge1xuXHRcdFx0XHRpbml0aWFsQ3dkOiAnL3BhcmVudC9jd2QnLFxuXHRcdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4LFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlckhvbWU6ICcvaG9tZScsXG5cdFx0XHRcdGJhY2tlbmQ6IHVuZGVmaW5lZFxuXHRcdFx0fSwgcmVzb2x2ZXIpO1xuXHRcdH0pO1xuXG5cdFx0Zm9yIChjb25zdCBsIG9mIHVuaXhMaW5rcykge1xuXHRcdFx0Y29uc3QgYmFzZUxpbmsgPSBpc1N0cmluZyhsKSA/IGwgOiBsLmxpbms7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzU3RyaW5nKGwpID8gVVJJLmZpbGUobCkgOiBsLnJlc291cmNlO1xuXHRcdFx0c3VpdGUoYExpbms6ICR7YmFzZUxpbmt9YCwgKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN1cHBvcnRlZExpbmtGb3JtYXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGlua0Zvcm1hdCA9IHN1cHBvcnRlZExpbmtGb3JtYXRzW2ldO1xuXHRcdFx0XHRcdGNvbnN0IGZvcm1hdHRlZExpbmsgPSBmb3JtYXQobGlua0Zvcm1hdC51cmxGb3JtYXQsIGJhc2VMaW5rLCBsaW5rRm9ybWF0LmxpbmUsIGxpbmtGb3JtYXQuY29sdW1uKTtcblx0XHRcdFx0XHR0ZXN0KGBzaG91bGQgZGV0ZWN0IGluIFwiJHtlc2NhcGVNdWx0aWxpbmVUZXN0TmFtZShmb3JtYXR0ZWRMaW5rKX1cImAsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW3Jlc291cmNlXTtcblx0XHRcdFx0XHRcdGF3YWl0IGFzc2VydExpbmtzTWFpbihmb3JtYXR0ZWRMaW5rLCByZXNvdXJjZSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gT25seSB0ZXN0IHRoZXNlIHdoZW4gb24gV2luZG93cyBiZWNhdXNlIHRoZXJlIGlzIHNwZWNpYWwgYmVoYXZpb3IgYXJvdW5kIHJlcGxhY2luZyBzZXBhcmF0b3JzXG5cdC8vIGluIFVSSSB0aGF0IGNhbm5vdCBiZSBjaGFuZ2VkXG5cdGlmIChpc1dpbmRvd3MpIHtcblx0XHRzdWl0ZSgnV2luZG93cycsICgpID0+IHtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0ZGV0ZWN0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbE11bHRpTGluZUxpbmtEZXRlY3RvciwgeHRlcm0sIHtcblx0XHRcdFx0XHRpbml0aWFsQ3dkOiAnQzpcXFxcUGFyZW50XFxcXEN3ZCcsXG5cdFx0XHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLFxuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVzZXJIb21lOiAnQzpcXFxcSG9tZScsXG5cdFx0XHRcdH0sIHJlc29sdmVyKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGwgb2Ygd2luZG93c0xpbmtzKSB7XG5cdFx0XHRcdGNvbnN0IGJhc2VMaW5rID0gaXNTdHJpbmcobCkgPyBsIDogbC5saW5rO1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IGlzU3RyaW5nKGwpID8gVVJJLmZpbGUobCkgOiBsLnJlc291cmNlO1xuXHRcdFx0XHRzdWl0ZShgTGluayBcIiR7YmFzZUxpbmt9XCJgLCAoKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdXBwb3J0ZWRMaW5rRm9ybWF0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGlua0Zvcm1hdCA9IHN1cHBvcnRlZExpbmtGb3JtYXRzW2ldO1xuXHRcdFx0XHRcdFx0Y29uc3QgZm9ybWF0dGVkTGluayA9IGZvcm1hdChsaW5rRm9ybWF0LnVybEZvcm1hdCwgYmFzZUxpbmssIGxpbmtGb3JtYXQubGluZSwgbGlua0Zvcm1hdC5jb2x1bW4pO1xuXHRcdFx0XHRcdFx0dGVzdChgc2hvdWxkIGRldGVjdCBpbiBcIiR7ZXNjYXBlTXVsdGlsaW5lVGVzdE5hbWUoZm9ybWF0dGVkTGluayl9XCJgLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHZhbGlkUmVzb3VyY2VzID0gW3Jlc291cmNlXTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgYXNzZXJ0TGlua3NNYWluKGZvcm1hdHRlZExpbmssIHJlc291cmNlKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5mdW5jdGlvbiBlc2NhcGVNdWx0aWxpbmVUZXN0TmFtZSh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gdGV4dC5yZXBsYWNlQWxsKCdcXHJcXG4nLCAnXFxcXHJcXFxcbicpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxXQUFXLHVCQUF1QjtBQUMzQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLFlBQTBEO0FBQUE7QUFBQSxFQUUvRDtBQUFBLEVBQ0E7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
