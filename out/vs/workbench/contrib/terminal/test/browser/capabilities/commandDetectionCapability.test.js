import { deepStrictEqual, ok, strictEqual } from "assert";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { writeP } from "../../../browser/terminalTestHelpers.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
class TestCommandDetectionCapability extends CommandDetectionCapability {
  clearCommands() {
    this._commands.length = 0;
  }
}
suite("CommandDetectionCapability", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let xterm;
  let capability;
  let addEvents;
  function assertCommands(expectedCommands) {
    deepStrictEqual(capability.commands.map((e) => e.command), expectedCommands.map((e) => e.command));
    deepStrictEqual(capability.commands.map((e) => e.cwd), expectedCommands.map((e) => e.cwd));
    deepStrictEqual(capability.commands.map((e) => e.exitCode), expectedCommands.map((e) => e.exitCode));
    deepStrictEqual(capability.commands.map((e) => e.marker?.line), expectedCommands.map((e) => e.marker?.line));
    for (const command of capability.commands) {
      ok(Math.abs(Date.now() - command.timestamp) < 2e3);
      ok(command.id, "Expected command to have an assigned id");
    }
    deepStrictEqual(addEvents, capability.commands);
    addEvents.length = 0;
    capability.clearCommands();
  }
  async function printStandardCommand(prompt, command, output, cwd, exitCode) {
    if (cwd !== void 0) {
      capability.setCwd(cwd);
    }
    capability.handlePromptStart();
    await writeP(xterm, `\r${prompt}`);
    capability.handleCommandStart();
    await writeP(xterm, command);
    capability.handleCommandExecuted();
    await writeP(xterm, `\r
${output}\r
`);
    capability.handleCommandFinished(exitCode);
  }
  async function printCommandStart(prompt) {
    capability.handlePromptStart();
    await writeP(xterm, `\r${prompt}`);
    capability.handleCommandStart();
  }
  setup(async () => {
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, cols: 80, logger: TestXtermLogger }));
    const instantiationService = workbenchInstantiationService(void 0, store);
    capability = store.add(instantiationService.createInstance(TestCommandDetectionCapability, xterm));
    addEvents = [];
    store.add(capability.onCommandFinished((e) => addEvents.push(e)));
    assertCommands([]);
  });
  test("should not add commands when no capability methods are triggered", async () => {
    await writeP(xterm, "foo\r\nbar\r\n");
    assertCommands([]);
    await writeP(xterm, "baz\r\n");
    assertCommands([]);
  });
  test("should add commands for expected capability method calls", async () => {
    await printStandardCommand("$ ", "echo foo", "foo", void 0, 0);
    await printCommandStart("$ ");
    assertCommands([{
      command: "echo foo",
      exitCode: 0,
      cwd: void 0,
      marker: { line: 0 }
    }]);
  });
  test("should trim the command when command executed appears on the following line", async () => {
    await printStandardCommand("$ ", "echo foo\r\n", "foo", void 0, 0);
    await printCommandStart("$ ");
    assertCommands([{
      command: "echo foo",
      exitCode: 0,
      cwd: void 0,
      marker: { line: 0 }
    }]);
  });
  suite("cwd", () => {
    test("should add cwd to commands when it's set", async () => {
      await printStandardCommand("$ ", "echo foo", "foo", "/home", 0);
      await printStandardCommand("$ ", "echo bar", "bar", "/home/second", 0);
      await printCommandStart("$ ");
      assertCommands([
        { command: "echo foo", exitCode: 0, cwd: "/home", marker: { line: 0 } },
        { command: "echo bar", exitCode: 0, cwd: "/home/second", marker: { line: 2 } }
      ]);
    });
    test("should add old cwd to commands if no cwd sequence is output", async () => {
      await printStandardCommand("$ ", "echo foo", "foo", "/home", 0);
      await printStandardCommand("$ ", "echo bar", "bar", void 0, 0);
      await printCommandStart("$ ");
      assertCommands([
        { command: "echo foo", exitCode: 0, cwd: "/home", marker: { line: 0 } },
        { command: "echo bar", exitCode: 0, cwd: "/home", marker: { line: 2 } }
      ]);
    });
    test("should use an undefined cwd if it's not set initially", async () => {
      await printStandardCommand("$ ", "echo foo", "foo", void 0, 0);
      await printStandardCommand("$ ", "echo bar", "bar", "/home", 0);
      await printCommandStart("$ ");
      assertCommands([
        { command: "echo foo", exitCode: 0, cwd: void 0, marker: { line: 0 } },
        { command: "echo bar", exitCode: 0, cwd: "/home", marker: { line: 2 } }
      ]);
    });
  });
  test("should not inherit the previous exit code when a duplicate command is interrupted", async () => {
    await printStandardCommand("$ ", "echo test", "test", void 0, 0);
    capability.handlePromptStart();
    await writeP(xterm, `\r$ `);
    capability.handleCommandStart();
    await writeP(xterm, "echo test");
    xterm.input("");
    await writeP(xterm, "^C");
    capability.setCommandLine("echo test", true);
    capability.handleCommandExecuted();
    await writeP(xterm, `\r
`);
    capability.handleCommandFinished(void 0);
    await printCommandStart("$ ");
    assertCommands([
      { command: "echo test", exitCode: 0, cwd: void 0, marker: { line: 0 } },
      { command: "echo test", exitCode: void 0, cwd: void 0, marker: { line: 2 } }
    ]);
  });
  test("should inherit the previous exit code for duplicate commands without interruption", async () => {
    await printStandardCommand("$ ", "echo ^C", "test", void 0, 0);
    capability.handlePromptStart();
    await writeP(xterm, `\r$ `);
    capability.handleCommandStart();
    await writeP(xterm, "echo ^C");
    capability.setCommandLine("echo ^C", true);
    capability.handleCommandExecuted();
    await writeP(xterm, `\r
test\r
`);
    capability.handleCommandFinished(void 0);
    await printCommandStart("$ ");
    assertCommands([
      { command: "echo ^C", exitCode: 0, cwd: void 0, marker: { line: 0 } },
      { command: "echo ^C", exitCode: 0, cwd: void 0, marker: { line: 2 } }
    ]);
  });
  test("should preserve explicit newlines at 80-column wrap boundaries in command output", async () => {
    const boundaryWidthLine = "A".repeat(80);
    await printStandardCommand("$ ", "cat content.txt", `${boundaryWidthLine}\r
after`, void 0, 0);
    await printCommandStart("$ ");
    strictEqual(capability.commands.length, 1);
    const output = capability.commands[0].getOutput();
    ok(!!output);
    ok(output.includes(`${boundaryWidthLine}
after
`));
    ok(!output.includes(`${boundaryWidthLine}after`));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxicm93c2VyXFxjYXBhYmlsaXRpZXNcXGNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGltcG9ydEFNRE5vZGVNb2R1bGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9hbWRYLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy9jb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eS5qcyc7XG5pbXBvcnQgeyB3cml0ZVAgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rlcm1pbmFsVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgVGVzdFh0ZXJtTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuXG50eXBlIFRlc3RUZXJtaW5hbENvbW1hbmRNYXRjaCA9IFBpY2s8SVRlcm1pbmFsQ29tbWFuZCwgJ2NvbW1hbmQnIHwgJ2N3ZCcgfCAnZXhpdENvZGUnPiAmIHsgbWFya2VyOiB7IGxpbmU6IG51bWJlciB9IH07XG5cbmNsYXNzIFRlc3RDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSBleHRlbmRzIENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IHtcblx0Y2xlYXJDb21tYW5kcygpIHtcblx0XHR0aGlzLl9jb21tYW5kcy5sZW5ndGggPSAwO1xuXHR9XG59XG5cbnN1aXRlKCdDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgeHRlcm06IFRlcm1pbmFsO1xuXHRsZXQgY2FwYWJpbGl0eTogVGVzdENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5O1xuXHRsZXQgYWRkRXZlbnRzOiBJVGVybWluYWxDb21tYW5kW107XG5cblx0ZnVuY3Rpb24gYXNzZXJ0Q29tbWFuZHMoZXhwZWN0ZWRDb21tYW5kczogVGVzdFRlcm1pbmFsQ29tbWFuZE1hdGNoW10pIHtcblx0XHRkZWVwU3RyaWN0RXF1YWwoY2FwYWJpbGl0eS5jb21tYW5kcy5tYXAoZSA9PiBlLmNvbW1hbmQpLCBleHBlY3RlZENvbW1hbmRzLm1hcChlID0+IGUuY29tbWFuZCkpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjYXBhYmlsaXR5LmNvbW1hbmRzLm1hcChlID0+IGUuY3dkKSwgZXhwZWN0ZWRDb21tYW5kcy5tYXAoZSA9PiBlLmN3ZCkpO1xuXHRcdGRlZXBTdHJpY3RFcXVhbChjYXBhYmlsaXR5LmNvbW1hbmRzLm1hcChlID0+IGUuZXhpdENvZGUpLCBleHBlY3RlZENvbW1hbmRzLm1hcChlID0+IGUuZXhpdENvZGUpKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwoY2FwYWJpbGl0eS5jb21tYW5kcy5tYXAoZSA9PiBlLm1hcmtlcj8ubGluZSksIGV4cGVjdGVkQ29tbWFuZHMubWFwKGUgPT4gZS5tYXJrZXI/LmxpbmUpKTtcblx0XHQvLyBFbnN1cmUgdGltZXN0YW1wcyBhcmUgc2V0IGFuZCB3ZXJlIGNhcHR1cmVkIHJlY2VudGx5XG5cdFx0Zm9yIChjb25zdCBjb21tYW5kIG9mIGNhcGFiaWxpdHkuY29tbWFuZHMpIHtcblx0XHRcdG9rKE1hdGguYWJzKERhdGUubm93KCkgLSBjb21tYW5kLnRpbWVzdGFtcCkgPCAyMDAwKTtcblx0XHRcdG9rKGNvbW1hbmQuaWQsICdFeHBlY3RlZCBjb21tYW5kIHRvIGhhdmUgYW4gYXNzaWduZWQgaWQnKTtcblx0XHR9XG5cdFx0ZGVlcFN0cmljdEVxdWFsKGFkZEV2ZW50cywgY2FwYWJpbGl0eS5jb21tYW5kcyk7XG5cdFx0Ly8gQ2xlYXIgdGhlIGNvbW1hbmRzIHRvIGF2b2lkIHJlLWFzc2VydGluZyBwYXN0IGNvbW1hbmRzXG5cdFx0YWRkRXZlbnRzLmxlbmd0aCA9IDA7XG5cdFx0Y2FwYWJpbGl0eS5jbGVhckNvbW1hbmRzKCk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBwcmludFN0YW5kYXJkQ29tbWFuZChwcm9tcHQ6IHN0cmluZywgY29tbWFuZDogc3RyaW5nLCBvdXRwdXQ6IHN0cmluZywgY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV4aXRDb2RlOiBudW1iZXIpIHtcblx0XHRpZiAoY3dkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNhcGFiaWxpdHkuc2V0Q3dkKGN3ZCk7XG5cdFx0fVxuXHRcdGNhcGFiaWxpdHkuaGFuZGxlUHJvbXB0U3RhcnQoKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sIGBcXHIke3Byb21wdH1gKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRTdGFydCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgY29tbWFuZCk7XG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVDb21tYW5kRXhlY3V0ZWQoKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sIGBcXHJcXG4ke291dHB1dH1cXHJcXG5gKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRGaW5pc2hlZChleGl0Q29kZSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBwcmludENvbW1hbmRTdGFydChwcm9tcHQ6IHN0cmluZykge1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlUHJvbXB0U3RhcnQoKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sIGBcXHIke3Byb21wdH1gKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRTdGFydCgpO1xuXHR9XG5cblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgVGVybWluYWxDdG9yID0gKGF3YWl0IGltcG9ydEFNRE5vZGVNb2R1bGU8dHlwZW9mIGltcG9ydCgnQHh0ZXJtL3h0ZXJtJyk+KCdAeHRlcm0veHRlcm0nLCAnbGliL3h0ZXJtLmpzJykpLlRlcm1pbmFsO1xuXG5cdFx0eHRlcm0gPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ3Rvcih7IGFsbG93UHJvcG9zZWRBcGk6IHRydWUsIGNvbHM6IDgwLCBsb2dnZXI6IFRlc3RYdGVybUxvZ2dlciB9KSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRjYXBhYmlsaXR5ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eSwgeHRlcm0pKTtcblx0XHRhZGRFdmVudHMgPSBbXTtcblx0XHRzdG9yZS5hZGQoY2FwYWJpbGl0eS5vbkNvbW1hbmRGaW5pc2hlZChlID0+IGFkZEV2ZW50cy5wdXNoKGUpKSk7XG5cdFx0YXNzZXJ0Q29tbWFuZHMoW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgbm90IGFkZCBjb21tYW5kcyB3aGVuIG5vIGNhcGFiaWxpdHkgbWV0aG9kcyBhcmUgdHJpZ2dlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgJ2Zvb1xcclxcbmJhclxcclxcbicpO1xuXHRcdGFzc2VydENvbW1hbmRzKFtdKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdiYXpcXHJcXG4nKTtcblx0XHRhc3NlcnRDb21tYW5kcyhbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBhZGQgY29tbWFuZHMgZm9yIGV4cGVjdGVkIGNhcGFiaWxpdHkgbWV0aG9kIGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGZvbycsICdmb28nLCB1bmRlZmluZWQsIDApO1xuXHRcdGF3YWl0IHByaW50Q29tbWFuZFN0YXJ0KCckICcpO1xuXHRcdGFzc2VydENvbW1hbmRzKFt7XG5cdFx0XHRjb21tYW5kOiAnZWNobyBmb28nLFxuXHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRjd2Q6IHVuZGVmaW5lZCxcblx0XHRcdG1hcmtlcjogeyBsaW5lOiAwIH1cblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCB0cmltIHRoZSBjb21tYW5kIHdoZW4gY29tbWFuZCBleGVjdXRlZCBhcHBlYXJzIG9uIHRoZSBmb2xsb3dpbmcgbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBwcmludFN0YW5kYXJkQ29tbWFuZCgnJCAnLCAnZWNobyBmb29cXHJcXG4nLCAnZm9vJywgdW5kZWZpbmVkLCAwKTtcblx0XHRhd2FpdCBwcmludENvbW1hbmRTdGFydCgnJCAnKTtcblx0XHRhc3NlcnRDb21tYW5kcyhbe1xuXHRcdFx0Y29tbWFuZDogJ2VjaG8gZm9vJyxcblx0XHRcdGV4aXRDb2RlOiAwLFxuXHRcdFx0Y3dkOiB1bmRlZmluZWQsXG5cdFx0XHRtYXJrZXI6IHsgbGluZTogMCB9XG5cdFx0fV0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY3dkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhZGQgY3dkIHRvIGNvbW1hbmRzIHdoZW4gaXRcXCdzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGZvbycsICdmb28nLCAnL2hvbWUnLCAwKTtcblx0XHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGJhcicsICdiYXInLCAnL2hvbWUvc2Vjb25kJywgMCk7XG5cdFx0XHRhd2FpdCBwcmludENvbW1hbmRTdGFydCgnJCAnKTtcblx0XHRcdGFzc2VydENvbW1hbmRzKFtcblx0XHRcdFx0eyBjb21tYW5kOiAnZWNobyBmb28nLCBleGl0Q29kZTogMCwgY3dkOiAnL2hvbWUnLCBtYXJrZXI6IHsgbGluZTogMCB9IH0sXG5cdFx0XHRcdHsgY29tbWFuZDogJ2VjaG8gYmFyJywgZXhpdENvZGU6IDAsIGN3ZDogJy9ob21lL3NlY29uZCcsIG1hcmtlcjogeyBsaW5lOiAyIH0gfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnc2hvdWxkIGFkZCBvbGQgY3dkIHRvIGNvbW1hbmRzIGlmIG5vIGN3ZCBzZXF1ZW5jZSBpcyBvdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBwcmludFN0YW5kYXJkQ29tbWFuZCgnJCAnLCAnZWNobyBmb28nLCAnZm9vJywgJy9ob21lJywgMCk7XG5cdFx0XHRhd2FpdCBwcmludFN0YW5kYXJkQ29tbWFuZCgnJCAnLCAnZWNobyBiYXInLCAnYmFyJywgdW5kZWZpbmVkLCAwKTtcblx0XHRcdGF3YWl0IHByaW50Q29tbWFuZFN0YXJ0KCckICcpO1xuXHRcdFx0YXNzZXJ0Q29tbWFuZHMoW1xuXHRcdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIGZvbycsIGV4aXRDb2RlOiAwLCBjd2Q6ICcvaG9tZScsIG1hcmtlcjogeyBsaW5lOiAwIH0gfSxcblx0XHRcdFx0eyBjb21tYW5kOiAnZWNobyBiYXInLCBleGl0Q29kZTogMCwgY3dkOiAnL2hvbWUnLCBtYXJrZXI6IHsgbGluZTogMiB9IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCB1c2UgYW4gdW5kZWZpbmVkIGN3ZCBpZiBpdFxcJ3Mgbm90IHNldCBpbml0aWFsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBwcmludFN0YW5kYXJkQ29tbWFuZCgnJCAnLCAnZWNobyBmb28nLCAnZm9vJywgdW5kZWZpbmVkLCAwKTtcblx0XHRcdGF3YWl0IHByaW50U3RhbmRhcmRDb21tYW5kKCckICcsICdlY2hvIGJhcicsICdiYXInLCAnL2hvbWUnLCAwKTtcblx0XHRcdGF3YWl0IHByaW50Q29tbWFuZFN0YXJ0KCckICcpO1xuXHRcdFx0YXNzZXJ0Q29tbWFuZHMoW1xuXHRcdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIGZvbycsIGV4aXRDb2RlOiAwLCBjd2Q6IHVuZGVmaW5lZCwgbWFya2VyOiB7IGxpbmU6IDAgfSB9LFxuXHRcdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIGJhcicsIGV4aXRDb2RlOiAwLCBjd2Q6ICcvaG9tZScsIG1hcmtlcjogeyBsaW5lOiAyIH0gfVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgaW5oZXJpdCB0aGUgcHJldmlvdXMgZXhpdCBjb2RlIHdoZW4gYSBkdXBsaWNhdGUgY29tbWFuZCBpcyBpbnRlcnJ1cHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBwcmludFN0YW5kYXJkQ29tbWFuZCgnJCAnLCAnZWNobyB0ZXN0JywgJ3Rlc3QnLCB1bmRlZmluZWQsIDApO1xuXG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVQcm9tcHRTdGFydCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxcciQgYCk7XG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVDb21tYW5kU3RhcnQoKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdlY2hvIHRlc3QnKTtcblx0XHR4dGVybS5pbnB1dCgnXFx4MDMnKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sICdeQycpO1xuXHRcdGNhcGFiaWxpdHkuc2V0Q29tbWFuZExpbmUoJ2VjaG8gdGVzdCcsIHRydWUpO1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlQ29tbWFuZEV4ZWN1dGVkKCk7XG5cdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCBgXFxyXFxuYCk7XG5cdFx0Y2FwYWJpbGl0eS5oYW5kbGVDb21tYW5kRmluaXNoZWQodW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IHByaW50Q29tbWFuZFN0YXJ0KCckICcpO1xuXG5cdFx0YXNzZXJ0Q29tbWFuZHMoW1xuXHRcdFx0eyBjb21tYW5kOiAnZWNobyB0ZXN0JywgZXhpdENvZGU6IDAsIGN3ZDogdW5kZWZpbmVkLCBtYXJrZXI6IHsgbGluZTogMCB9IH0sXG5cdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIHRlc3QnLCBleGl0Q29kZTogdW5kZWZpbmVkLCBjd2Q6IHVuZGVmaW5lZCwgbWFya2VyOiB7IGxpbmU6IDIgfSB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBpbmhlcml0IHRoZSBwcmV2aW91cyBleGl0IGNvZGUgZm9yIGR1cGxpY2F0ZSBjb21tYW5kcyB3aXRob3V0IGludGVycnVwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBwcmludFN0YW5kYXJkQ29tbWFuZCgnJCAnLCAnZWNobyBeQycsICd0ZXN0JywgdW5kZWZpbmVkLCAwKTtcblxuXHRcdGNhcGFiaWxpdHkuaGFuZGxlUHJvbXB0U3RhcnQoKTtcblx0XHRhd2FpdCB3cml0ZVAoeHRlcm0sIGBcXHIkIGApO1xuXHRcdGNhcGFiaWxpdHkuaGFuZGxlQ29tbWFuZFN0YXJ0KCk7XG5cdFx0YXdhaXQgd3JpdGVQKHh0ZXJtLCAnZWNobyBeQycpO1xuXHRcdGNhcGFiaWxpdHkuc2V0Q29tbWFuZExpbmUoJ2VjaG8gXkMnLCB0cnVlKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRFeGVjdXRlZCgpO1xuXHRcdGF3YWl0IHdyaXRlUCh4dGVybSwgYFxcclxcbnRlc3RcXHJcXG5gKTtcblx0XHRjYXBhYmlsaXR5LmhhbmRsZUNvbW1hbmRGaW5pc2hlZCh1bmRlZmluZWQpO1xuXG5cdFx0YXdhaXQgcHJpbnRDb21tYW5kU3RhcnQoJyQgJyk7XG5cblx0XHRhc3NlcnRDb21tYW5kcyhbXG5cdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIF5DJywgZXhpdENvZGU6IDAsIGN3ZDogdW5kZWZpbmVkLCBtYXJrZXI6IHsgbGluZTogMCB9IH0sXG5cdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIF5DJywgZXhpdENvZGU6IDAsIGN3ZDogdW5kZWZpbmVkLCBtYXJrZXI6IHsgbGluZTogMiB9IH1cblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIGV4cGxpY2l0IG5ld2xpbmVzIGF0IDgwLWNvbHVtbiB3cmFwIGJvdW5kYXJpZXMgaW4gY29tbWFuZCBvdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYm91bmRhcnlXaWR0aExpbmUgPSAnQScucmVwZWF0KDgwKTtcblx0XHRhd2FpdCBwcmludFN0YW5kYXJkQ29tbWFuZCgnJCAnLCAnY2F0IGNvbnRlbnQudHh0JywgYCR7Ym91bmRhcnlXaWR0aExpbmV9XFxyXFxuYWZ0ZXJgLCB1bmRlZmluZWQsIDApO1xuXHRcdGF3YWl0IHByaW50Q29tbWFuZFN0YXJ0KCckICcpO1xuXG5cdFx0c3RyaWN0RXF1YWwoY2FwYWJpbGl0eS5jb21tYW5kcy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IG91dHB1dCA9IGNhcGFiaWxpdHkuY29tbWFuZHNbMF0uZ2V0T3V0cHV0KCk7XG5cdFx0b2soISFvdXRwdXQpO1xuXHRcdG9rKG91dHB1dC5pbmNsdWRlcyhgJHtib3VuZGFyeVdpZHRoTGluZX1cXG5hZnRlclxcbmApKTtcblx0XHRvayghb3V0cHV0LmluY2x1ZGVzKGAke2JvdW5kYXJ5V2lkdGhMaW5lfWFmdGVyYCkpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxpQkFBaUIsSUFBSSxtQkFBbUI7QUFDakQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQ0FBK0M7QUFFeEQsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMscUNBQXFDO0FBSTlDLE1BQU0sdUNBQXVDLDJCQUEyQjtBQUFBLEVBQ3ZFLGdCQUFnQjtBQUNmLFNBQUssVUFBVSxTQUFTO0FBQUEsRUFDekI7QUFDRDtBQUVBLE1BQU0sOEJBQThCLE1BQU07QUFDekMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixXQUFTLGVBQWUsa0JBQThDO0FBQ3JFLG9CQUFnQixXQUFXLFNBQVMsSUFBSSxPQUFLLEVBQUUsT0FBTyxHQUFHLGlCQUFpQixJQUFJLE9BQUssRUFBRSxPQUFPLENBQUM7QUFDN0Ysb0JBQWdCLFdBQVcsU0FBUyxJQUFJLE9BQUssRUFBRSxHQUFHLEdBQUcsaUJBQWlCLElBQUksT0FBSyxFQUFFLEdBQUcsQ0FBQztB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
