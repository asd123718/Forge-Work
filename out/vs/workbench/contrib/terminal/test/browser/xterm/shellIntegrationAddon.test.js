import { deepEqual, deepStrictEqual, strictEqual } from "assert";
import * as sinon from "sinon";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { deserializeVSCodeOscMessage, serializeVSCodeOscMessage, parseKeyValueAssignment, parseMarkSequence, ShellIntegrationAddon } from "../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
import { writeP } from "../../../browser/terminalTestHelpers.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
class TestShellIntegrationAddon extends ShellIntegrationAddon {
  getCommandDetectionMock(terminal) {
    const capability = super._createOrGetCommandDetection(terminal);
    this.capabilities.add(TerminalCapability.CommandDetection, capability);
    return sinon.mock(capability);
  }
  getCwdDectionMock() {
    const capability = super._createOrGetCwdDetection();
    this.capabilities.add(TerminalCapability.CwdDetection, capability);
    return sinon.mock(capability);
  }
}
suite("ShellIntegrationAddon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let xterm;
  let shellIntegrationAddon;
  let capabilities;
  setup(async () => {
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, rows: 30, logger: TestXtermLogger }));
    shellIntegrationAddon = store.add(new TestShellIntegrationAddon("", true, void 0, void 0, new NullLogService()));
    xterm.loadAddon(shellIntegrationAddon);
    capabilities = shellIntegrationAddon.capabilities;
  });
  suite("cwd detection", () => {
    test("should activate capability on the cwd sequence (OSC 633 ; P ; Cwd=<cwd> ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CwdDetection), false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      strictEqual(capabilities.has(TerminalCapability.CwdDetection), true);
    });
    test("should pass cwd sequence to the capability as trusted when nonce matches", async () => {
      const mock = shellIntegrationAddon.getCwdDectionMock();
      mock.expects("updateCwd").once().withExactArgs("/foo", true);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo;\x07");
      mock.verify();
    });
    test("should treat cwd sequence as untrusted when nonce is missing", async () => {
      const mock = shellIntegrationAddon.getCwdDectionMock();
      mock.expects("updateCwd").once().withExactArgs("/foo", false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      mock.verify();
    });
    test("should treat cwd sequence as untrusted when nonce does not match", async () => {
      const mock = shellIntegrationAddon.getCwdDectionMock();
      mock.expects("updateCwd").once().withExactArgs("/foo", false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo;invalid-nonce\x07");
      mock.verify();
    });
    test("detect ITerm sequence: `OSC 1337 ; CurrentDir=<Cwd> ST`", async () => {
      const cases = [
        ["root", "/", "/"],
        ["non-root", "/some/path", "/some/path"]
      ];
      for (const x of cases) {
        const [title, input, expected] = x;
        const mock = shellIntegrationAddon.getCwdDectionMock();
        mock.expects("updateCwd").once().withExactArgs(expected, false).named(title);
        await writeP(xterm, `\x1B]1337;CurrentDir=${input}\x07`);
        mock.verify();
      }
    });
    suite("detect `SetCwd` sequence: `OSC 7; scheme://cwd ST`", () => {
      test("should accept well-formatted URLs", async () => {
        const cases = [
          // Different hostname values:
          ["empty hostname, pointing root", "file:///", "/"],
          ["empty hostname", "file:///test-root/local", "/test-root/local"],
          ["non-empty hostname", "file://some-hostname/test-root/local", "/test-root/local"],
          // URL-encoded chars:
          ["URL-encoded value (1)", "file:///test-root/%6c%6f%63%61%6c", "/test-root/local"],
          ["URL-encoded value (2)", "file:///test-root/local%22", '/test-root/local"'],
          ["URL-encoded value (3)", 'file:///test-root/local"', '/test-root/local"']
        ];
        for (const x of cases) {
          const [title, input, expected] = x;
          const mock = shellIntegrationAddon.getCwdDectionMock();
          mock.expects("updateCwd").once().withExactArgs(expected, false).named(title);
          await writeP(xterm, `\x1B]7;${input}\x07`);
          mock.verify();
        }
      });
      test("should ignore ill-formatted URLs", async () => {
        const cases = [
          // Different hostname values:
          ["no hostname, pointing root", "file://"],
          // Non-`file` scheme values:
          ["no scheme (1)", "/test-root"],
          ["no scheme (2)", "//test-root"],
          ["no scheme (3)", "///test-root"],
          ["no scheme (4)", ":///test-root"],
          ["http", "http:///test-root"],
          ["ftp", "ftp:///test-root"],
          ["ssh", "ssh:///test-root"]
        ];
        for (const x of cases) {
          const [title, input] = x;
          const mock = shellIntegrationAddon.getCwdDectionMock();
          mock.expects("updateCwd").never().named(title);
          await writeP(xterm, `\x1B]7;${input}\x07`);
          mock.verify();
        }
      });
    });
    test("detect `SetWindowsFrindlyCwd` sequence: `OSC 9 ; 9 ; <cwd> ST`", async () => {
      const cases = [
        ["root", "/", "/"],
        ["non-root", "/some/path", "/some/path"]
      ];
      for (const x of cases) {
        const [title, input, expected] = x;
        const mock = shellIntegrationAddon.getCwdDectionMock();
        mock.expects("updateCwd").once().withExactArgs(expected, false).named(title);
        await writeP(xterm, `\x1B]9;9;${input}\x07`);
        mock.verify();
      }
    });
  });
  suite("command tracking", () => {
    test("should activate capability on the prompt start sequence (OSC 633 ; A ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;A\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass prompt start sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handlePromptStart").once().withExactArgs();
      await writeP(xterm, "\x1B]633;A\x07");
      mock.verify();
    });
    test("should activate capability on the command start sequence (OSC 633 ; B ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;B\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass command start sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handleCommandStart").once().withExactArgs();
      await writeP(xterm, "\x1B]633;B\x07");
      mock.verify();
    });
    test("should activate capability on the command executed sequence (OSC 633 ; C ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;C\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass command executed sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handleCommandExecuted").once().withExactArgs();
      await writeP(xterm, "\x1B]633;C\x07");
      mock.verify();
    });
    test("should activate capability on the command finished sequence (OSC 633 ; D ; <ExitCode> ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;D;7\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), true);
    });
    test("should pass command finished sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("handleCommandFinished").once().withExactArgs(7);
      await writeP(xterm, "\x1B]633;D;7\x07");
      mock.verify();
    });
    test("should pass command line sequence to the capability", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("setCommandLine").once().withExactArgs("", false);
      await writeP(xterm, "\x1B]633;E\x07");
      mock.verify();
      const mock2 = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock2.expects("setCommandLine").twice().withExactArgs("cmd", false);
      await writeP(xterm, "\x1B]633;E;cmd\x07");
      await writeP(xterm, "\x1B]633;E;cmd;invalid-nonce\x07");
      mock2.verify();
    });
    test("should not activate capability on the cwd sequence (OSC 633 ; P=Cwd=<cwd> ST)", async () => {
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      strictEqual(capabilities.has(TerminalCapability.CommandDetection), false);
    });
    test("should pass cwd sequence to the capability if it's initialized", async () => {
      const mock = shellIntegrationAddon.getCommandDetectionMock(xterm);
      mock.expects("setCwd").once().withExactArgs("/foo");
      await writeP(xterm, "\x1B]633;P;Cwd=/foo\x07");
      mock.verify();
    });
  });
  suite("BufferMarkCapability", () => {
    test("SetMark", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    test("SetMark - ID", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;1;\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    test("SetMark - hidden", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;;Hidden\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    test("SetMark - hidden & ID", async () => {
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "foo");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), false);
      await writeP(xterm, "\x1B]633;SetMark;1;Hidden\x07");
      strictEqual(capabilities.has(TerminalCapability.BufferMarkDetection), true);
    });
    suite("parseMarkSequence", () => {
      test("basic", async () => {
        deepEqual(parseMarkSequence(["", ""]), { id: void 0, hidden: false });
      });
      test("ID", async () => {
        deepEqual(parseMarkSequence(["Id=3", ""]), { id: "3", hidden: false });
      });
      test("hidden", async () => {
        deepEqual(parseMarkSequence(["", "Hidden"]), { id: void 0, hidden: true });
      });
      test("ID + hidden", async () => {
        deepEqual(parseMarkSequence(["Id=4555", "Hidden"]), { id: "4555", hidden: true });
      });
    });
  });
  suite("deserializeMessage", () => {
    const Backslash = "\\";
    const Newline = "\n";
    const Semicolon = ";";
    const cases = [
      ["empty", "", ""],
      ["basic", "value", "value"],
      ["space", "some thing", "some thing"],
      ["escaped backslash", `${Backslash}${Backslash}`, Backslash],
      ["non-initial escaped backslash", `foo${Backslash}${Backslash}`, `foo${Backslash}`],
      ["two escaped backslashes", `${Backslash}${Backslash}${Backslash}${Backslash}`, `${Backslash}${Backslash}`],
      ["escaped backslash amidst text", `Hello${Backslash}${Backslash}there`, `Hello${Backslash}there`],
      ["backslash escaped literally and as hex", `${Backslash}${Backslash} is same as ${Backslash}x5c`, `${Backslash} is same as ${Backslash}`],
      ["escaped semicolon", `${Backslash}x3b`, Semicolon],
      ["non-initial escaped semicolon", `foo${Backslash}x3b`, `foo${Semicolon}`],
      ["escaped semicolon (upper hex)", `${Backslash}x3B`, Semicolon],
      ['escaped backslash followed by literal "x3b" is not a semicolon', `${Backslash}${Backslash}x3b`, `${Backslash}x3b`],
      ['non-initial escaped backslash followed by literal "x3b" is not a semicolon', `foo${Backslash}${Backslash}x3b`, `foo${Backslash}x3b`],
      ["escaped backslash followed by escaped semicolon", `${Backslash}${Backslash}${Backslash}x3b`, `${Backslash}${Semicolon}`],
      ["escaped semicolon amidst text", `some${Backslash}x3bthing`, `some${Semicolon}thing`],
      ["escaped newline", `${Backslash}x0a`, Newline],
      ["non-initial escaped newline", `foo${Backslash}x0a`, `foo${Newline}`],
      ["escaped newline (upper hex)", `${Backslash}x0A`, Newline],
      ['escaped backslash followed by literal "x0a" is not a newline', `${Backslash}${Backslash}x0a`, `${Backslash}x0a`],
      ['non-initial escaped backslash followed by literal "x0a" is not a newline', `foo${Backslash}${Backslash}x0a`, `foo${Backslash}x0a`],
      ["PS1 simple", "[\\u@\\h \\W]\\$", "[\\u@\\h \\W]\\$"],
      ["PS1 VSC SI", `${Backslash}x1b]633;A${Backslash}x07\\[${Backslash}x1b]0;\\u@\\h:\\w\\a\\]${Backslash}x1b]633;B${Backslash}x07`, "\x1B]633;A\x07\\[\x1B]0;\\u@\\h:\\w\\a\\]\x1B]633;B\x07"]
    ];
    cases.forEach(([title, input, expected]) => {
      test(title, () => strictEqual(deserializeVSCodeOscMessage(input), expected));
    });
  });
  suite("serializeVSCodeOscMessage", () => {
    const Backslash = "\\";
    const Newline = "\n";
    const Semicolon = ";";
    const cases = [
      ["empty", "", ""],
      ["basic", "value", "value"],
      ["space", "some thing", `some${Backslash}x20thing`],
      ["backslash", Backslash, `${Backslash}${Backslash}`],
      ["non-initial backslash", `foo${Backslash}`, `foo${Backslash}${Backslash}`],
      ["two backslashes", `${Backslash}${Backslash}`, `${Backslash}${Backslash}${Backslash}${Backslash}`],
      ["backslash amidst text", `Hello${Backslash}there`, `Hello${Backslash}${Backslash}there`],
      ["semicolon", Semicolon, `${Backslash}x3b`],
      ["non-initial semicolon", `foo${Semicolon}`, `foo${Backslash}x3b`],
      ["semicolon amidst text", `some${Semicolon}thing`, `some${Backslash}x3bthing`],
      ["newline", Newline, `${Backslash}x0a`],
      ["non-initial newline", `foo${Newline}`, `foo${Backslash}x0a`],
      ["newline amidst text", `some${Newline}thing`, `some${Backslash}x0athing`],
      ["tab character", "	", `${Backslash}x09`],
      ["carriage return", "\r", `${Backslash}x0d`],
      ["null character", "\0", `${Backslash}x00`],
      ["space character (0x20)", " ", `${Backslash}x20`],
      ["character above 0x20", "!", "!"],
      ["multiple special chars", `hello${Newline}world${Semicolon}test${Backslash}end`, `hello${Backslash}x0aworld${Backslash}x3btest${Backslash}${Backslash}end`],
      ["PS1 with escape sequences", `\x1B]633;A\x07\\[\x1B]0;\\u@\\h:\\w\\a\\]\x1B]633;B\x07`, `${Backslash}x1b]633${Backslash}x3bA${Backslash}x07${Backslash}${Backslash}[${Backslash}x1b]0${Backslash}x3b${Backslash}${Backslash}u@${Backslash}${Backslash}h:${Backslash}${Backslash}w${Backslash}${Backslash}a${Backslash}${Backslash}]${Backslash}x1b]633${Backslash}x3bB${Backslash}x07`]
    ];
    cases.forEach(([title, input, expected]) => {
      test(title, () => strictEqual(serializeVSCodeOscMessage(input), expected));
    });
  });
  test("parseKeyValueAssignment", () => {
    const cases = [
      ["empty", "", ["", void 0]],
      ['no "=" sign', "some-text", ["some-text", void 0]],
      ["empty value", "key=", ["key", ""]],
      ["empty key", "=value", ["", "value"]],
      ["normal", "key=value", ["key", "value"]],
      ['multiple "=" signs (1)', "key==value", ["key", "=value"]],
      ['multiple "=" signs (2)', "key=value===true", ["key", "value===true"]],
      ['just a "="', "=", ["", ""]],
      ['just a "=="', "==", ["", "="]]
    ];
    cases.forEach((x) => {
      const [title, input, [key, value]] = x;
      deepStrictEqual(parseKeyValueAssignment(input), { key, value }, title);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFx4dGVybVxcc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IGRlZXBFcXVhbCwgZGVlcFN0cmljdEVxdWFsLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlLCBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBkZXNlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UsIHNlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UsIHBhcnNlS2V5VmFsdWVBc3NpZ25tZW50LCBwYXJzZU1hcmtTZXF1ZW5jZSwgU2hlbGxJbnRlZ3JhdGlvbkFkZG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3h0ZXJtL3NoZWxsSW50ZWdyYXRpb25BZGRvbi5qcyc7XG5pbXBvcnQgeyB3cml0ZVAgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgVGVzdFh0ZXJtTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5cbmNsYXNzIFRlc3RTaGVsbEludGVncmF0aW9uQWRkb24gZXh0ZW5kcyBTaGVsbEludGVncmF0aW9uQWRkb24ge1xuXHRnZXRDb21tYW5kRGV0ZWN0aW9uTW9jayh0ZXJtaW5hbDogVGVybWluYWwpOiBzaW5vbi5TaW5vbk1vY2sge1xuXHRcdGNvbnN0IGNhcGFiaWxpdHkgPSBzdXBlci5fY3JlYXRlT3JHZXRDb21tYW5kRGV0ZWN0aW9uKHRlcm1pbmFsKTtcblx0XHR0aGlzLmNhcGFiaWxpdGllcy5hZGQoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24sIGNhcGFiaWxpdHkpO1xuXHRcdHJldHVybiBzaW5vbi5tb2NrKGNhcGFiaWxpdHkpO1xuXHR9XG5cdGdldEN3ZERlY3Rpb25Nb2NrKCk6IHNpbm9uLlNpbm9uTW9jayB7XG5cdFx0Y29uc3QgY2FwYWJpbGl0eSA9IHN1cGVyLl9jcmVhdGVPckdldEN3ZERldGVjdGlvbigpO1xuXHRcdHRoaXMuY2FwYWJpbGl0aWVzLmFkZChUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uLCBjYXBhYmlsaXR5KTtcblx0XHRyZXR1cm4gc2lub24ubW9jayhjYXBhYmlsaXR5KTtcblx0fVxufVxuXG5zdWl0ZSgnU2hlbGxJbnRlZ3JhdGlvbkFkZG9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB4dGVybTogVGVybWluYWw7XG5cdGxldCBzaGVsbEludGVncmF0aW9uQWRkb246IFRlc3RTaGVsbEludGVncmF0aW9uQWRkb247XG5cdGxldCBjYXBhYmlsaXRpZXM6IElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZTtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXHRcdHh0ZXJtID0gc3RvcmUuYWRkKG5ldyBUZXJtaW5hbEN0b3IoeyBhbGxvd1Byb3Bvc2VkQXBpOiB0cnVlLCBjb2xzOiA4MCwgcm93czogMzAsIGxvZ2dlcjogVGVzdFh0ZXJtTG9nZ2VyIH0pKTtcblx0XHRzaGVsbEludGVncmF0aW9uQWRkb24gPSBzdG9yZS5hZGQobmV3IFRlc3RTaGVsbEludGVncmF0aW9uQWRkb24oJycsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdHh0ZXJtLmxvYWRBZGRvbihzaGVsbEludGVncmF0aW9uQWRkb24pO1xuXHRcdGNhcGFiaWxpdGllcyA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5jYXBhYmlsaXRpZXM7XG5cdH0pO1xuXG5cdHN1aXRlKCdjd2QgZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhY3RpdmF0ZSBjYXBhYmlsaXR5IG9uIHRoZSBjd2Qgc2VxdWVuY2UgKE9TQyA2MzMgOyBQIDsgQ3dkPTxjd2Q+IFNUKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkN3ZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1A7Q3dkPS9mb29cXHgwNycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ3dkRGV0ZWN0aW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcGFzcyBjd2Qgc2VxdWVuY2UgdG8gdGhlIGNhcGFiaWxpdHkgYXMgdHJ1c3RlZCB3aGVuIG5vbmNlIG1hdGNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldEN3ZERlY3Rpb25Nb2NrKCk7XG5cdFx0XHQvLyBUaGUgYWRkb24gaXMgY29uc3RydWN0ZWQgd2l0aCBub25jZSAnJyBzbyBhIHRyYWlsaW5nICc7JyBwcm9kdWNlcyBhcmdzWzFdPT09Jycgd2hpY2ggbWF0Y2hlc1xuXHRcdFx0bW9jay5leHBlY3RzKCd1cGRhdGVDd2QnKS5vbmNlKCkud2l0aEV4YWN0QXJncygnL2ZvbycsIHRydWUpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1A7Q3dkPS9mb287XFx4MDcnKTtcblx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdHJlYXQgY3dkIHNlcXVlbmNlIGFzIHVudHJ1c3RlZCB3aGVuIG5vbmNlIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldEN3ZERlY3Rpb25Nb2NrKCk7XG5cdFx0XHRtb2NrLmV4cGVjdHMoJ3VwZGF0ZUN3ZCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKCcvZm9vJywgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1A7Q3dkPS9mb29cXHgwNycpO1xuXHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB0cmVhdCBjd2Qgc2VxdWVuY2UgYXMgdW50cnVzdGVkIHdoZW4gbm9uY2UgZG9lcyBub3QgbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldEN3ZERlY3Rpb25Nb2NrKCk7XG5cdFx0XHRtb2NrLmV4cGVjdHMoJ3VwZGF0ZUN3ZCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKCcvZm9vJywgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1A7Q3dkPS9mb287aW52YWxpZC1ub25jZVxceDA3Jyk7XG5cdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0ZWN0IElUZXJtIHNlcXVlbmNlOiBgT1NDIDEzMzcgOyBDdXJyZW50RGlyPTxDd2Q+IFNUYCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHR5cGUgVGVzdENhc2UgPSBbdGl0bGU6IHN0cmluZywgaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZ107XG5cdFx0XHRjb25zdCBjYXNlczogVGVzdENhc2VbXSA9IFtcblx0XHRcdFx0Wydyb290JywgJy8nLCAnLyddLFxuXHRcdFx0XHRbJ25vbi1yb290JywgJy9zb21lL3BhdGgnLCAnL3NvbWUvcGF0aCddLFxuXHRcdFx0XTtcblx0XHRcdGZvciAoY29uc3QgeCBvZiBjYXNlcykge1xuXHRcdFx0XHRjb25zdCBbdGl0bGUsIGlucHV0LCBleHBlY3RlZF0gPSB4O1xuXHRcdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldEN3ZERlY3Rpb25Nb2NrKCk7XG5cdFx0XHRcdG1vY2suZXhwZWN0cygndXBkYXRlQ3dkJykub25jZSgpLndpdGhFeGFjdEFyZ3MoZXhwZWN0ZWQsIGZhbHNlKS5uYW1lZCh0aXRsZSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxceDFiXTEzMzc7Q3VycmVudERpcj0ke2lucHV0fVxceDA3YCk7XG5cdFx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZGV0ZWN0IGBTZXRDd2RgIHNlcXVlbmNlOiBgT1NDIDc7IHNjaGVtZTovL2N3ZCBTVGAnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgYWNjZXB0IHdlbGwtZm9ybWF0dGVkIFVSTHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHR5cGUgVGVzdENhc2UgPSBbdGl0bGU6IHN0cmluZywgaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZ107XG5cdFx0XHRcdGNvbnN0IGNhc2VzOiBUZXN0Q2FzZVtdID0gW1xuXHRcdFx0XHRcdC8vIERpZmZlcmVudCBob3N0bmFtZSB2YWx1ZXM6XG5cdFx0XHRcdFx0WydlbXB0eSBob3N0bmFtZSwgcG9pbnRpbmcgcm9vdCcsICdmaWxlOi8vLycsICcvJ10sXG5cdFx0XHRcdFx0WydlbXB0eSBob3N0bmFtZScsICdmaWxlOi8vL3Rlc3Qtcm9vdC9sb2NhbCcsICcvdGVzdC1yb290L2xvY2FsJ10sXG5cdFx0XHRcdFx0Wydub24tZW1wdHkgaG9zdG5hbWUnLCAnZmlsZTovL3NvbWUtaG9zdG5hbWUvdGVzdC1yb290L2xvY2FsJywgJy90ZXN0LXJvb3QvbG9jYWwnXSxcblx0XHRcdFx0XHQvLyBVUkwtZW5jb2RlZCBjaGFyczpcblx0XHRcdFx0XHRbJ1VSTC1lbmNvZGVkIHZhbHVlICgxKScsICdmaWxlOi8vL3Rlc3Qtcm9vdC8lNmMlNmYlNjMlNjElNmMnLCAnL3Rlc3Qtcm9vdC9sb2NhbCddLFxuXHRcdFx0XHRcdFsnVVJMLWVuY29kZWQgdmFsdWUgKDIpJywgJ2ZpbGU6Ly8vdGVzdC1yb290L2xvY2FsJTIyJywgJy90ZXN0LXJvb3QvbG9jYWxcIiddLFxuXHRcdFx0XHRcdFsnVVJMLWVuY29kZWQgdmFsdWUgKDMpJywgJ2ZpbGU6Ly8vdGVzdC1yb290L2xvY2FsXCInLCAnL3Rlc3Qtcm9vdC9sb2NhbFwiJ10sXG5cdFx0XHRcdF07XG5cdFx0XHRcdGZvciAoY29uc3QgeCBvZiBjYXNlcykge1xuXHRcdFx0XHRcdGNvbnN0IFt0aXRsZSwgaW5wdXQsIGV4cGVjdGVkXSA9IHg7XG5cdFx0XHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDd2REZWN0aW9uTW9jaygpO1xuXHRcdFx0XHRcdG1vY2suZXhwZWN0cygndXBkYXRlQ3dkJykub25jZSgpLndpdGhFeGFjdEFyZ3MoZXhwZWN0ZWQsIGZhbHNlKS5uYW1lZCh0aXRsZSk7XG5cdFx0XHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCBgXFx4MWJdNzske2lucHV0fVxceDA3YCk7XG5cdFx0XHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBpZ25vcmUgaWxsLWZvcm1hdHRlZCBVUkxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0eXBlIFRlc3RDYXNlID0gW3RpdGxlOiBzdHJpbmcsIGlucHV0OiBzdHJpbmddO1xuXHRcdFx0XHRjb25zdCBjYXNlczogVGVzdENhc2VbXSA9IFtcblx0XHRcdFx0XHQvLyBEaWZmZXJlbnQgaG9zdG5hbWUgdmFsdWVzOlxuXHRcdFx0XHRcdFsnbm8gaG9zdG5hbWUsIHBvaW50aW5nIHJvb3QnLCAnZmlsZTovLyddLFxuXHRcdFx0XHRcdC8vIE5vbi1gZmlsZWAgc2NoZW1lIHZhbHVlczpcblx0XHRcdFx0XHRbJ25vIHNjaGVtZSAoMSknLCAnL3Rlc3Qtcm9vdCddLFxuXHRcdFx0XHRcdFsnbm8gc2NoZW1lICgyKScsICcvL3Rlc3Qtcm9vdCddLFxuXHRcdFx0XHRcdFsnbm8gc2NoZW1lICgzKScsICcvLy90ZXN0LXJvb3QnXSxcblx0XHRcdFx0XHRbJ25vIHNjaGVtZSAoNCknLCAnOi8vL3Rlc3Qtcm9vdCddLFxuXHRcdFx0XHRcdFsnaHR0cCcsICdodHRwOi8vL3Rlc3Qtcm9vdCddLFxuXHRcdFx0XHRcdFsnZnRwJywgJ2Z0cDovLy90ZXN0LXJvb3QnXSxcblx0XHRcdFx0XHRbJ3NzaCcsICdzc2g6Ly8vdGVzdC1yb290J10sXG5cdFx0XHRcdF07XG5cblx0XHRcdFx0Zm9yIChjb25zdCB4IG9mIGNhc2VzKSB7XG5cdFx0XHRcdFx0Y29uc3QgW3RpdGxlLCBpbnB1dF0gPSB4O1xuXHRcdFx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q3dkRGVjdGlvbk1vY2soKTtcblx0XHRcdFx0XHRtb2NrLmV4cGVjdHMoJ3VwZGF0ZUN3ZCcpLm5ldmVyKCkubmFtZWQodGl0bGUpO1xuXHRcdFx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxceDFiXTc7JHtpbnB1dH1cXHgwN2ApO1xuXHRcdFx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0ZWN0IGBTZXRXaW5kb3dzRnJpbmRseUN3ZGAgc2VxdWVuY2U6IGBPU0MgOSA7IDkgOyA8Y3dkPiBTVGAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0eXBlIFRlc3RDYXNlID0gW3RpdGxlOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmddO1xuXHRcdFx0Y29uc3QgY2FzZXM6IFRlc3RDYXNlW10gPSBbXG5cdFx0XHRcdFsncm9vdCcsICcvJywgJy8nXSxcblx0XHRcdFx0Wydub24tcm9vdCcsICcvc29tZS9wYXRoJywgJy9zb21lL3BhdGgnXSxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGNvbnN0IHggb2YgY2FzZXMpIHtcblx0XHRcdFx0Y29uc3QgW3RpdGxlLCBpbnB1dCwgZXhwZWN0ZWRdID0geDtcblx0XHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDd2REZWN0aW9uTW9jaygpO1xuXHRcdFx0XHRtb2NrLmV4cGVjdHMoJ3VwZGF0ZUN3ZCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKGV4cGVjdGVkLCBmYWxzZSkubmFtZWQodGl0bGUpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sIGBcXHgxYl05Ozk7JHtpbnB1dH1cXHgwN2ApO1xuXHRcdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29tbWFuZCB0cmFja2luZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYWN0aXZhdGUgY2FwYWJpbGl0eSBvbiB0aGUgcHJvbXB0IHN0YXJ0IHNlcXVlbmNlIChPU0MgNjMzIDsgQSBTVCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO0FcXHgwNycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIHRydWUpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBwYXNzIHByb21wdCBzdGFydCBzZXF1ZW5jZSB0byB0aGUgY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q29tbWFuZERldGVjdGlvbk1vY2soeHRlcm0pO1xuXHRcdFx0bW9jay5leHBlY3RzKCdoYW5kbGVQcm9tcHRTdGFydCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKCk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7QVxceDA3Jyk7XG5cdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBhY3RpdmF0ZSBjYXBhYmlsaXR5IG9uIHRoZSBjb21tYW5kIHN0YXJ0IHNlcXVlbmNlIChPU0MgNjMzIDsgQiBTVCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZm9vJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO0JcXHgwNycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIHRydWUpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBwYXNzIGNvbW1hbmQgc3RhcnQgc2VxdWVuY2UgdG8gdGhlIGNhcGFiaWxpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrID0gc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmdldENvbW1hbmREZXRlY3Rpb25Nb2NrKHh0ZXJtKTtcblx0XHRcdG1vY2suZXhwZWN0cygnaGFuZGxlQ29tbWFuZFN0YXJ0Jykub25jZSgpLndpdGhFeGFjdEFyZ3MoKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztCXFx4MDcnKTtcblx0XHRcdG1vY2sudmVyaWZ5KCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGFjdGl2YXRlIGNhcGFiaWxpdHkgb24gdGhlIGNvbW1hbmQgZXhlY3V0ZWQgc2VxdWVuY2UgKE9TQyA2MzMgOyBDIFNUKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7Q1xceDA3Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHBhc3MgY29tbWFuZCBleGVjdXRlZCBzZXF1ZW5jZSB0byB0aGUgY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q29tbWFuZERldGVjdGlvbk1vY2soeHRlcm0pO1xuXHRcdFx0bW9jay5leHBlY3RzKCdoYW5kbGVDb21tYW5kRXhlY3V0ZWQnKS5vbmNlKCkud2l0aEV4YWN0QXJncygpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO0NcXHgwNycpO1xuXHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgYWN0aXZhdGUgY2FwYWJpbGl0eSBvbiB0aGUgY29tbWFuZCBmaW5pc2hlZCBzZXF1ZW5jZSAoT1NDIDYzMyA7IEQgOyA8RXhpdENvZGU+IFNUKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7RDs3XFx4MDcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCB0cnVlKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdzaG91bGQgcGFzcyBjb21tYW5kIGZpbmlzaGVkIHNlcXVlbmNlIHRvIHRoZSBjYXBhYmlsaXR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9jayA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDb21tYW5kRGV0ZWN0aW9uTW9jayh4dGVybSk7XG5cdFx0XHRtb2NrLmV4cGVjdHMoJ2hhbmRsZUNvbW1hbmRGaW5pc2hlZCcpLm9uY2UoKS53aXRoRXhhY3RBcmdzKDcpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO0Q7N1xceDA3Jyk7XG5cdFx0XHRtb2NrLnZlcmlmeSgpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBwYXNzIGNvbW1hbmQgbGluZSBzZXF1ZW5jZSB0byB0aGUgY2FwYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q29tbWFuZERldGVjdGlvbk1vY2soeHRlcm0pO1xuXHRcdFx0bW9jay5leHBlY3RzKCdzZXRDb21tYW5kTGluZScpLm9uY2UoKS53aXRoRXhhY3RBcmdzKCcnLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7RVxceDA3Jyk7XG5cdFx0XHRtb2NrLnZlcmlmeSgpO1xuXG5cdFx0XHRjb25zdCBtb2NrMiA9IHNoZWxsSW50ZWdyYXRpb25BZGRvbi5nZXRDb21tYW5kRGV0ZWN0aW9uTW9jayh4dGVybSk7XG5cdFx0XHRtb2NrMi5leHBlY3RzKCdzZXRDb21tYW5kTGluZScpLnR3aWNlKCkud2l0aEV4YWN0QXJncygnY21kJywgZmFsc2UpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO0U7Y21kXFx4MDcnKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztFO2NtZDtpbnZhbGlkLW5vbmNlXFx4MDcnKTtcblx0XHRcdG1vY2syLnZlcmlmeSgpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgYWN0aXZhdGUgY2FwYWJpbGl0eSBvbiB0aGUgY3dkIHNlcXVlbmNlIChPU0MgNjMzIDsgUD1Dd2Q9PGN3ZD4gU1QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztQO0N3ZD0vZm9vXFx4MDcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkNvbW1hbmREZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIHBhc3MgY3dkIHNlcXVlbmNlIHRvIHRoZSBjYXBhYmlsaXR5IGlmIGl0XFwncyBpbml0aWFsaXplZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1vY2sgPSBzaGVsbEludGVncmF0aW9uQWRkb24uZ2V0Q29tbWFuZERldGVjdGlvbk1vY2soeHRlcm0pO1xuXHRcdFx0bW9jay5leHBlY3RzKCdzZXRDd2QnKS5vbmNlKCkud2l0aEV4YWN0QXJncygnL2ZvbycpO1xuXHRcdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnXFx4MWJdNjMzO1A7Q3dkPS9mb29cXHgwNycpO1xuXHRcdFx0bW9jay52ZXJpZnkoKTtcblx0XHR9KTtcblx0fSk7XG5cdHN1aXRlKCdCdWZmZXJNYXJrQ2FwYWJpbGl0eScsICgpID0+IHtcblx0XHR0ZXN0KCdTZXRNYXJrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztTZXRNYXJrO1xceDA3Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnU2V0TWFyayAtIElEJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztTZXRNYXJrOzE7XFx4MDcnKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24pLCB0cnVlKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdTZXRNYXJrIC0gaGlkZGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2ZvbycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIGZhbHNlKTtcblx0XHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ1xceDFiXTYzMztTZXRNYXJrOztIaWRkZW5cXHgwNycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQnVmZmVyTWFya0RldGVjdGlvbiksIHRydWUpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ1NldE1hcmsgLSBoaWRkZW4gJiBJRCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKGNhcGFiaWxpdGllcy5oYXMoVGVybWluYWxDYXBhYmlsaXR5LkJ1ZmZlck1hcmtEZXRlY3Rpb24pLCBmYWxzZSk7XG5cdFx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdcXHgxYl02MzM7U2V0TWFyazsxO0hpZGRlblxceDA3Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXBhYmlsaXRpZXMuaGFzKFRlcm1pbmFsQ2FwYWJpbGl0eS5CdWZmZXJNYXJrRGV0ZWN0aW9uKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdFx0c3VpdGUoJ3BhcnNlTWFya1NlcXVlbmNlJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYmFzaWMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGRlZXBFcXVhbChwYXJzZU1hcmtTZXF1ZW5jZShbJycsICcnXSksIHsgaWQ6IHVuZGVmaW5lZCwgaGlkZGVuOiBmYWxzZSB9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnSUQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGRlZXBFcXVhbChwYXJzZU1hcmtTZXF1ZW5jZShbJ0lkPTMnLCAnJ10pLCB7IGlkOiAnMycsIGhpZGRlbjogZmFsc2UgfSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ2hpZGRlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0ZGVlcEVxdWFsKHBhcnNlTWFya1NlcXVlbmNlKFsnJywgJ0hpZGRlbiddKSwgeyBpZDogdW5kZWZpbmVkLCBoaWRkZW46IHRydWUgfSk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ0lEICsgaGlkZGVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRkZWVwRXF1YWwocGFyc2VNYXJrU2VxdWVuY2UoWydJZD00NTU1JywgJ0hpZGRlbiddKSwgeyBpZDogJzQ1NTUnLCBoaWRkZW46IHRydWUgfSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2Rlc2VyaWFsaXplTWVzc2FnZScsICgpID0+IHtcblx0XHQvLyBBIHNpbmdsZSBsaXRlcmFsIGJhY2tzbGFzaCwgaW4gb3JkZXIgdG8gYXZvaWQgY29uZnVzaW9uIGFib3V0IHdoZXRoZXIgd2UgYXJlIGVzY2FwaW5nIHRlc3QgZGF0YSBvciB0ZXN0aW5nIGVzY2FwZXMuXG5cdFx0Y29uc3QgQmFja3NsYXNoID0gJ1xcXFwnIGFzIGNvbnN0O1xuXHRcdGNvbnN0IE5ld2xpbmUgPSAnXFxuJyBhcyBjb25zdDtcblx0XHRjb25zdCBTZW1pY29sb24gPSAnOycgYXMgY29uc3Q7XG5cblx0XHR0eXBlIFRlc3RDYXNlID0gW3RpdGxlOiBzdHJpbmcsIGlucHV0OiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmddO1xuXHRcdGNvbnN0IGNhc2VzOiBUZXN0Q2FzZVtdID0gW1xuXHRcdFx0WydlbXB0eScsICcnLCAnJ10sXG5cdFx0XHRbJ2Jhc2ljJywgJ3ZhbHVlJywgJ3ZhbHVlJ10sXG5cdFx0XHRbJ3NwYWNlJywgJ3NvbWUgdGhpbmcnLCAnc29tZSB0aGluZyddLFxuXHRcdFx0Wydlc2NhcGVkIGJhY2tzbGFzaCcsIGAke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1gLCBCYWNrc2xhc2hdLFxuXHRcdFx0Wydub24taW5pdGlhbCBlc2NhcGVkIGJhY2tzbGFzaCcsIGBmb28ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1gLCBgZm9vJHtCYWNrc2xhc2h9YF0sXG5cdFx0XHRbJ3R3byBlc2NhcGVkIGJhY2tzbGFzaGVzJywgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofSR7QmFja3NsYXNofSR7QmFja3NsYXNofWAsIGAke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1gXSxcblx0XHRcdFsnZXNjYXBlZCBiYWNrc2xhc2ggYW1pZHN0IHRleHQnLCBgSGVsbG8ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH10aGVyZWAsIGBIZWxsbyR7QmFja3NsYXNofXRoZXJlYF0sXG5cdFx0XHRbJ2JhY2tzbGFzaCBlc2NhcGVkIGxpdGVyYWxseSBhbmQgYXMgaGV4JywgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofSBpcyBzYW1lIGFzICR7QmFja3NsYXNofXg1Y2AsIGAke0JhY2tzbGFzaH0gaXMgc2FtZSBhcyAke0JhY2tzbGFzaH1gXSxcblx0XHRcdFsnZXNjYXBlZCBzZW1pY29sb24nLCBgJHtCYWNrc2xhc2h9eDNiYCwgU2VtaWNvbG9uXSxcblx0XHRcdFsnbm9uLWluaXRpYWwgZXNjYXBlZCBzZW1pY29sb24nLCBgZm9vJHtCYWNrc2xhc2h9eDNiYCwgYGZvbyR7U2VtaWNvbG9ufWBdLFxuXHRcdFx0Wydlc2NhcGVkIHNlbWljb2xvbiAodXBwZXIgaGV4KScsIGAke0JhY2tzbGFzaH14M0JgLCBTZW1pY29sb25dLFxuXHRcdFx0Wydlc2NhcGVkIGJhY2tzbGFzaCBmb2xsb3dlZCBieSBsaXRlcmFsIFwieDNiXCIgaXMgbm90IGEgc2VtaWNvbG9uJywgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofXgzYmAsIGAke0JhY2tzbGFzaH14M2JgXSxcblx0XHRcdFsnbm9uLWluaXRpYWwgZXNjYXBlZCBiYWNrc2xhc2ggZm9sbG93ZWQgYnkgbGl0ZXJhbCBcIngzYlwiIGlzIG5vdCBhIHNlbWljb2xvbicsIGBmb28ke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH14M2JgLCBgZm9vJHtCYWNrc2xhc2h9eDNiYF0sXG5cdFx0XHRbJ2VzY2FwZWQgYmFja3NsYXNoIGZvbGxvd2VkIGJ5IGVzY2FwZWQgc2VtaWNvbG9uJywgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofSR7QmFja3NsYXNofXgzYmAsIGAke0JhY2tzbGFzaH0ke1NlbWljb2xvbn1gXSxcblx0XHRcdFsnZXNjYXBlZCBzZW1pY29sb24gYW1pZHN0IHRleHQnLCBgc29tZSR7QmFja3NsYXNofXgzYnRoaW5nYCwgYHNvbWUke1NlbWljb2xvbn10aGluZ2BdLFxuXHRcdFx0Wydlc2NhcGVkIG5ld2xpbmUnLCBgJHtCYWNrc2xhc2h9eDBhYCwgTmV3bGluZV0sXG5cdFx0XHRbJ25vbi1pbml0aWFsIGVzY2FwZWQgbmV3bGluZScsIGBmb28ke0JhY2tzbGFzaH14MGFgLCBgZm9vJHtOZXdsaW5lfWBdLFxuXHRcdFx0Wydlc2NhcGVkIG5ld2xpbmUgKHVwcGVyIGhleCknLCBgJHtCYWNrc2xhc2h9eDBBYCwgTmV3bGluZV0sXG5cdFx0XHRbJ2VzY2FwZWQgYmFja3NsYXNoIGZvbGxvd2VkIGJ5IGxpdGVyYWwgXCJ4MGFcIiBpcyBub3QgYSBuZXdsaW5lJywgYCR7QmFja3NsYXNofSR7QmFja3NsYXNofXgwYWAsIGAke0JhY2tzbGFzaH14MGFgXSxcblx0XHRcdFsnbm9uLWluaXRpYWwgZXNjYXBlZCBiYWNrc2xhc2ggZm9sbG93ZWQgYnkgbGl0ZXJhbCBcIngwYVwiIGlzIG5vdCBhIG5ld2xpbmUnLCBgZm9vJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9eDBhYCwgYGZvbyR7QmFja3NsYXNofXgwYWBdLFxuXHRcdFx0WydQUzEgc2ltcGxlJywgJ1tcXFxcdUBcXFxcaCBcXFxcV11cXFxcJCcsICdbXFxcXHVAXFxcXGggXFxcXFddXFxcXCQnXSxcblx0XHRcdFsnUFMxIFZTQyBTSScsIGAke0JhY2tzbGFzaH14MWJdNjMzO0Eke0JhY2tzbGFzaH14MDdcXFxcWyR7QmFja3NsYXNofXgxYl0wO1xcXFx1QFxcXFxoOlxcXFx3XFxcXGFcXFxcXSR7QmFja3NsYXNofXgxYl02MzM7QiR7QmFja3NsYXNofXgwN2AsICdcXHgxYl02MzM7QVxceDA3XFxcXFtcXHgxYl0wO1xcXFx1QFxcXFxoOlxcXFx3XFxcXGFcXFxcXVxceDFiXTYzMztCXFx4MDcnXVxuXHRcdF07XG5cblx0XHRjYXNlcy5mb3JFYWNoKChbdGl0bGUsIGlucHV0LCBleHBlY3RlZF0pID0+IHtcblx0XHRcdHRlc3QodGl0bGUsICgpID0+IHN0cmljdEVxdWFsKGRlc2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZShpbnB1dCksIGV4cGVjdGVkKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlJywgKCkgPT4ge1xuXHRcdC8vIEEgc2luZ2xlIGxpdGVyYWwgYmFja3NsYXNoLCBpbiBvcmRlciB0byBhdm9pZCBjb25mdXNpb24gYWJvdXQgd2hldGhlciB3ZSBhcmUgZXNjYXBpbmcgdGVzdCBkYXRhIG9yIHRlc3RpbmcgZXNjYXBlcy5cblx0XHRjb25zdCBCYWNrc2xhc2ggPSAnXFxcXCcgYXMgY29uc3Q7XG5cdFx0Y29uc3QgTmV3bGluZSA9ICdcXG4nIGFzIGNvbnN0O1xuXHRcdGNvbnN0IFNlbWljb2xvbiA9ICc7JyBhcyBjb25zdDtcblxuXHRcdHR5cGUgVGVzdENhc2UgPSBbdGl0bGU6IHN0cmluZywgaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZ107XG5cdFx0Y29uc3QgY2FzZXM6IFRlc3RDYXNlW10gPSBbXG5cdFx0XHRbJ2VtcHR5JywgJycsICcnXSxcblx0XHRcdFsnYmFzaWMnLCAndmFsdWUnLCAndmFsdWUnXSxcblx0XHRcdFsnc3BhY2UnLCAnc29tZSB0aGluZycsIGBzb21lJHtCYWNrc2xhc2h9eDIwdGhpbmdgXSxcblx0XHRcdFsnYmFja3NsYXNoJywgQmFja3NsYXNoLCBgJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9YF0sXG5cdFx0XHRbJ25vbi1pbml0aWFsIGJhY2tzbGFzaCcsIGBmb28ke0JhY2tzbGFzaH1gLCBgZm9vJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9YF0sXG5cdFx0XHRbJ3R3byBiYWNrc2xhc2hlcycsIGAke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1gLCBgJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9YF0sXG5cdFx0XHRbJ2JhY2tzbGFzaCBhbWlkc3QgdGV4dCcsIGBIZWxsbyR7QmFja3NsYXNofXRoZXJlYCwgYEhlbGxvJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9dGhlcmVgXSxcblx0XHRcdFsnc2VtaWNvbG9uJywgU2VtaWNvbG9uLCBgJHtCYWNrc2xhc2h9eDNiYF0sXG5cdFx0XHRbJ25vbi1pbml0aWFsIHNlbWljb2xvbicsIGBmb28ke1NlbWljb2xvbn1gLCBgZm9vJHtCYWNrc2xhc2h9eDNiYF0sXG5cdFx0XHRbJ3NlbWljb2xvbiBhbWlkc3QgdGV4dCcsIGBzb21lJHtTZW1pY29sb259dGhpbmdgLCBgc29tZSR7QmFja3NsYXNofXgzYnRoaW5nYF0sXG5cdFx0XHRbJ25ld2xpbmUnLCBOZXdsaW5lLCBgJHtCYWNrc2xhc2h9eDBhYF0sXG5cdFx0XHRbJ25vbi1pbml0aWFsIG5ld2xpbmUnLCBgZm9vJHtOZXdsaW5lfWAsIGBmb28ke0JhY2tzbGFzaH14MGFgXSxcblx0XHRcdFsnbmV3bGluZSBhbWlkc3QgdGV4dCcsIGBzb21lJHtOZXdsaW5lfXRoaW5nYCwgYHNvbWUke0JhY2tzbGFzaH14MGF0aGluZ2BdLFxuXHRcdFx0Wyd0YWIgY2hhcmFjdGVyJywgJ1xcdCcsIGAke0JhY2tzbGFzaH14MDlgXSxcblx0XHRcdFsnY2FycmlhZ2UgcmV0dXJuJywgJ1xccicsIGAke0JhY2tzbGFzaH14MGRgXSxcblx0XHRcdFsnbnVsbCBjaGFyYWN0ZXInLCAnXFx4MDAnLCBgJHtCYWNrc2xhc2h9eDAwYF0sXG5cdFx0XHRbJ3NwYWNlIGNoYXJhY3RlciAoMHgyMCknLCAnICcsIGAke0JhY2tzbGFzaH14MjBgXSxcblx0XHRcdFsnY2hhcmFjdGVyIGFib3ZlIDB4MjAnLCAnIScsICchJ10sXG5cdFx0XHRbJ211bHRpcGxlIHNwZWNpYWwgY2hhcnMnLCBgaGVsbG8ke05ld2xpbmV9d29ybGQke1NlbWljb2xvbn10ZXN0JHtCYWNrc2xhc2h9ZW5kYCwgYGhlbGxvJHtCYWNrc2xhc2h9eDBhd29ybGQke0JhY2tzbGFzaH14M2J0ZXN0JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9ZW5kYF0sXG5cdFx0XHRbJ1BTMSB3aXRoIGVzY2FwZSBzZXF1ZW5jZXMnLCBgXFx4MWJdNjMzO0FcXHgwN1xcXFxbXFx4MWJdMDtcXFxcdUBcXFxcaDpcXFxcd1xcXFxhXFxcXF1cXHgxYl02MzM7QlxceDA3YCwgYCR7QmFja3NsYXNofXgxYl02MzMke0JhY2tzbGFzaH14M2JBJHtCYWNrc2xhc2h9eDA3JHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9WyR7QmFja3NsYXNofXgxYl0wJHtCYWNrc2xhc2h9eDNiJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9dUAke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1oOiR7QmFja3NsYXNofSR7QmFja3NsYXNofXcke0JhY2tzbGFzaH0ke0JhY2tzbGFzaH1hJHtCYWNrc2xhc2h9JHtCYWNrc2xhc2h9XSR7QmFja3NsYXNofXgxYl02MzMke0JhY2tzbGFzaH14M2JCJHtCYWNrc2xhc2h9eDA3YF1cblx0XHRdO1xuXG5cdFx0Y2FzZXMuZm9yRWFjaCgoW3RpdGxlLCBpbnB1dCwgZXhwZWN0ZWRdKSA9PiB7XG5cdFx0XHR0ZXN0KHRpdGxlLCAoKSA9PiBzdHJpY3RFcXVhbChzZXJpYWxpemVWU0NvZGVPc2NNZXNzYWdlKGlucHV0KSwgZXhwZWN0ZWQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VLZXlWYWx1ZUFzc2lnbm1lbnQnLCAoKSA9PiB7XG5cdFx0dHlwZSBUZXN0Q2FzZSA9IFt0aXRsZTogc3RyaW5nLCBpbnB1dDogc3RyaW5nLCBleHBlY3RlZDogW2tleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkXV07XG5cdFx0Y29uc3QgY2FzZXM6IFRlc3RDYXNlW10gPSBbXG5cdFx0XHRbJ2VtcHR5JywgJycsIFsnJywgdW5kZWZpbmVkXV0sXG5cdFx0XHRbJ25vIFwiPVwiIHNpZ24nLCAnc29tZS10ZXh0JywgWydzb21lLXRleHQnLCB1bmRlZmluZWRdXSxcblx0XHRcdFsnZW1wdHkgdmFsdWUnLCAna2V5PScsIFsna2V5JywgJyddXSxcblx0XHRcdFsnZW1wdHkga2V5JywgJz12YWx1ZScsIFsnJywgJ3ZhbHVlJ11dLFxuXHRcdFx0Wydub3JtYWwnLCAna2V5PXZhbHVlJywgWydrZXknLCAndmFsdWUnXV0sXG5cdFx0XHRbJ211bHRpcGxlIFwiPVwiIHNpZ25zICgxKScsICdrZXk9PXZhbHVlJywgWydrZXknLCAnPXZhbHVlJ11dLFxuXHRcdFx0WydtdWx0aXBsZSBcIj1cIiBzaWducyAoMiknLCAna2V5PXZhbHVlPT09dHJ1ZScsIFsna2V5JywgJ3ZhbHVlPT09dHJ1ZSddXSxcblx0XHRcdFsnanVzdCBhIFwiPVwiJywgJz0nLCBbJycsICcnXV0sXG5cdFx0XHRbJ2p1c3QgYSBcIj09XCInLCAnPT0nLCBbJycsICc9J11dLFxuXHRcdF07XG5cblx0XHRjYXNlcy5mb3JFYWNoKHggPT4ge1xuXHRcdFx0Y29uc3QgW3RpdGxlLCBpbnB1dCwgW2tleSwgdmFsdWVdXSA9IHg7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VLZXlWYWx1ZUFzc2lnbm1lbnQoaW5wdXQpLCB7IGtleSwgdmFsdWUgfSwgdGl0bGUpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxXQUFXLGlCQUFpQixtQkFBbUI7QUFDeEQsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQW1DLDBCQUEwQjtBQUM3RCxTQUFTLDZCQUE2QiwyQkFBMkIseUJBQXlCLG1CQUFtQiw2QkFBNkI7QUFDMUksU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sa0NBQWtDLHNCQUFzQjtBQUFBLEVBQzdELHdCQUF3QixVQUFxQztBQUM1RCxVQUFNLGFBQWEsTUFBTSw2QkFBNkIsUUFBUTtBQUM5RCxTQUFLLGFBQWEsSUFBSSxtQkFBbUIsa0JBQWtCLFVBQVU7QUFDckUsV0FBTyxNQUFNLEtBQUssVUFBVTtBQUFBLEVBQzdCO0FBQUEsRUFDQSxvQkFBcUM7QUFDcEMsVUFBTSxhQUFhLE1BQU0seUJBQXlCO0FBQ2xELFNBQUssYUFBYSxJQUFJLG1CQUFtQixjQUFjLFVBQVU7QUFDakUsV0FBTyxNQUFNLEtBQUssVUFBVTtBQUFBLEVBQzdCO0FBQ0Q7QUFFQSxNQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxZQUFZO0FBQ2pCLFVBQU0sZ0JBQWdCLE1BQU0sb0JBQW1ELGdCQUFnQixjQUFjLEdBQUc7QUFDaEgsWUFBUSxNQUFNLElBQUks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
