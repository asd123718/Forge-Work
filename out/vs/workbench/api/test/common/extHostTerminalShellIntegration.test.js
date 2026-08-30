import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { InternalTerminalShellIntegration } from "../../common/extHostTerminalShellIntegration.js";
import { Emitter } from "../../../../base/common/event.js";
import { TerminalShellExecutionCommandLineConfidence } from "../../common/extHostTypes.js";
import { deepStrictEqual, notStrictEqual, strictEqual } from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
function cmdLine(value) {
  return Object.freeze({
    confidence: TerminalShellExecutionCommandLineConfidence.High,
    value,
    isTrusted: true
  });
}
function asCmdLine(value) {
  if (typeof value === "string") {
    return cmdLine(value);
  }
  return value;
}
function vsc(data) {
  return `\x1B]633;${data}\x07`;
}
const testCommandLine = "echo hello world";
const testCommandLine2 = "echo goodbye world";
suite("InternalTerminalShellIntegration", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let si;
  let terminal;
  let onDidStartTerminalShellExecution;
  let trackedEvents;
  let readIteratorsFlushed;
  async function startExecutionAwaitObject(commandLine, cwd) {
    return await new Promise((r) => {
      store.add(onDidStartTerminalShellExecution.event((e) => {
        r(e.execution);
      }));
      si.startShellExecution(asCmdLine(commandLine), cwd);
    });
  }
  async function endExecutionAwaitObject(commandLine) {
    return await new Promise((r) => {
      store.add(si.onDidRequestEndExecution((e) => r(e.execution)));
      si.endShellExecution(asCmdLine(commandLine), 0);
    });
  }
  async function emitData(data) {
    await new Promise((r) => queueMicrotask(r));
    si.emitData(data);
  }
  function assertTrackedEvents(expected) {
    deepStrictEqual(trackedEvents, expected);
  }
  function assertNonDataTrackedEvents(expected) {
    deepStrictEqual(trackedEvents.filter((e) => e.type !== "data"), expected);
  }
  function assertDataTrackedEvents(expected) {
    deepStrictEqual(trackedEvents.filter((e) => e.type === "data"), expected);
  }
  setup(() => {
    terminal = /* @__PURE__ */ Symbol("testTerminal");
    onDidStartTerminalShellExecution = store.add(new Emitter());
    si = store.add(new InternalTerminalShellIntegration(terminal, true, onDidStartTerminalShellExecution));
    trackedEvents = [];
    readIteratorsFlushed = [];
    store.add(onDidStartTerminalShellExecution.event(async (e) => {
      trackedEvents.push({
        type: "start",
        commandLine: e.execution.commandLine.value
      });
      const stream = e.execution.read();
      const readIteratorsFlushedDeferred = new DeferredPromise();
      readIteratorsFlushed.push(readIteratorsFlushedDeferred.p);
      for await (const data of stream) {
        trackedEvents.push({
          type: "data",
          commandLine: e.execution.commandLine.value,
          data
        });
      }
      readIteratorsFlushedDeferred.complete();
    }));
    store.add(si.onDidRequestEndExecution((e) => trackedEvents.push({
      type: "end",
      commandLine: e.execution.commandLine.value
    })));
  });
  test("simple execution", async () => {
    const execution = await startExecutionAwaitObject(testCommandLine);
    deepStrictEqual(execution.commandLine.value, testCommandLine);
    const execution2 = await endExecutionAwaitObject(testCommandLine);
    strictEqual(execution2, execution);
    assertTrackedEvents([
      { commandLine: testCommandLine, type: "start" },
      { commandLine: testCommandLine, type: "end" }
    ]);
  });
  test("different execution unexpectedly ended", async () => {
    const execution1 = await startExecutionAwaitObject(testCommandLine);
    const execution2 = await endExecutionAwaitObject(testCommandLine2);
    strictEqual(execution1, execution2, "when a different execution is ended, the one that started first should end");
    assertTrackedEvents([
      { commandLine: testCommandLine, type: "start" },
      // This looks weird, but it's the same execution behind the scenes, just the command
      // line was updated
      { commandLine: testCommandLine2, type: "end" }
    ]);
  });
  test("no end event", async () => {
    const execution1 = await startExecutionAwaitObject(testCommandLine);
    const endedExecution = await new Promise((r) => {
      store.add(si.onDidRequestEndExecution((e) => r(e.execution)));
      startExecutionAwaitObject(testCommandLine2);
    });
    strictEqual(execution1, endedExecution, "when no end event is fired, the current execution should end");
    await endExecutionAwaitObject(testCommandLine2);
    await Promise.all(readIteratorsFlushed);
    assertTrackedEvents([
      { commandLine: testCommandLine, type: "start" },
      { commandLine: testCommandLine, type: "end" },
      { commandLine: testCommandLine2, type: "start" },
      { commandLine: testCommandLine2, type: "end" }
    ]);
  });
  suite("executeCommand", () => {
    test("^C to clear previous command", async () => {
      const commandLine = "foo";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const firstExecution = await startExecutionAwaitObject("^C");
      notStrictEqual(firstExecution, apiRequestedExecution.value);
      si.emitData("SIGINT");
      si.endShellExecution(cmdLine("^C"), 0);
      si.startShellExecution(cmdLine(commandLine), void 0);
      await emitData("1");
      await endExecutionAwaitObject(commandLine);
      await Promise.all(readIteratorsFlushed);
      assertNonDataTrackedEvents([
        { commandLine: "^C", type: "start" },
        { commandLine: "^C", type: "end" },
        { commandLine, type: "start" },
        { commandLine, type: "end" }
      ]);
      assertDataTrackedEvents([
        { commandLine: "^C", type: "data", data: "SIGINT" },
        { commandLine, type: "data", data: "1" }
      ]);
    });
    test("multi-line command line", async () => {
      const commandLine = "foo\nbar";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject("foo");
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData("1");
      si.emitData("2");
      si.endShellExecution(cmdLine("foo"), 0);
      si.startShellExecution(cmdLine("bar"), void 0);
      si.emitData("3");
      si.emitData("4");
      const endedExecution = await endExecutionAwaitObject("bar");
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: "1" },
        { commandLine, type: "data", data: "2" },
        { commandLine, type: "data", data: "3" },
        { commandLine, type: "data", data: "4" },
        { commandLine, type: "end" }
      ]);
    });
    test("multi-line command with long second command", async () => {
      const commandLine = "echo foo\ncat << EOT\nline1\nline2\nline3\nEOT";
      const subCommandLine1 = "echo foo";
      const subCommandLine2 = "cat << EOT\nline1\nline2\nline3\nEOT";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject(subCommandLine1);
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData(`${vsc("C")}foo`);
      si.endShellExecution(cmdLine(subCommandLine1), 0);
      si.startShellExecution(cmdLine(subCommandLine2), void 0);
      si.emitData(`${vsc("C")}line1`);
      si.emitData("line2");
      si.emitData("line3");
      const endedExecution = await endExecutionAwaitObject(subCommandLine2);
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: `${vsc("C")}foo` },
        { commandLine, type: "data", data: `${vsc("C")}line1` },
        { commandLine, type: "data", data: "line2" },
        { commandLine, type: "data", data: "line3" },
        { commandLine, type: "end" }
      ]);
    });
    test("multi-line command comment followed by long second command", async () => {
      const commandLine = "# comment: foo\ncat << EOT\nline1\nline2\nline3\nEOT";
      const subCommandLine1 = "# comment: foo";
      const subCommandLine2 = "cat << EOT\nline1\nline2\nline3\nEOT";
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject(subCommandLine1);
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData(`${vsc("C")}`);
      si.endShellExecution(cmdLine(subCommandLine1), 0);
      si.startShellExecution(cmdLine(subCommandLine2), void 0);
      si.emitData(`${vsc("C")}line1`);
      si.emitData("line2");
      si.emitData("line3");
      const endedExecution = await endExecutionAwaitObject(subCommandLine2);
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: `${vsc("C")}` },
        { commandLine, type: "data", data: `${vsc("C")}line1` },
        { commandLine, type: "data", data: "line2" },
        { commandLine, type: "data", data: "line3" },
        { commandLine, type: "end" }
      ]);
    });
    test("4 multi-line commands with output", async () => {
      const commandLine = 'echo "\nfoo"\ngit commit -m "hello\n\nworld"\ncat << EOT\nline1\nline2\nline3\nEOT\n{\necho "foo"\n}';
      const subCommandLine1 = 'echo "\nfoo"';
      const subCommandLine2 = 'git commit -m "hello\n\nworld"';
      const subCommandLine3 = "cat << EOT\nline1\nline2\nline3\nEOT";
      const subCommandLine4 = '{\necho "foo"\n}';
      const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), void 0);
      const startedExecution = await startExecutionAwaitObject(subCommandLine1);
      strictEqual(startedExecution, apiRequestedExecution.value);
      si.emitData(`${vsc("C")}foo`);
      si.endShellExecution(cmdLine(subCommandLine1), 0);
      si.startShellExecution(cmdLine(subCommandLine2), void 0);
      si.emitData(`${vsc("C")} 2 files changed, 61 insertions(+), 2 deletions(-)`);
      si.endShellExecution(cmdLine(subCommandLine2), 0);
      si.startShellExecution(cmdLine(subCommandLine3), void 0);
      si.emitData(`${vsc("C")}line1`);
      si.emitData("line2");
      si.emitData("line3");
      si.endShellExecution(cmdLine(subCommandLine3), 0);
      si.emitData(`${vsc("C")}foo`);
      si.startShellExecution(cmdLine(subCommandLine4), void 0);
      const endedExecution = await endExecutionAwaitObject(subCommandLine4);
      strictEqual(startedExecution, endedExecution);
      assertTrackedEvents([
        { commandLine, type: "start" },
        { commandLine, type: "data", data: `${vsc("C")}foo` },
        { commandLine, type: "data", data: `${vsc("C")} 2 files changed, 61 insertions(+), 2 deletions(-)` },
        { commandLine, type: "data", data: `${vsc("C")}line1` },
        { commandLine, type: "data", data: "line2" },
        { commandLine, type: "data", data: "line3" },
        { commandLine, type: "data", data: `${vsc("C")}foo` },
        { commandLine, type: "end" }
      ]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcY29tbW9uXFxleHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0eXBlIFRlcm1pbmFsLCB0eXBlIFRlcm1pbmFsU2hlbGxFeGVjdXRpb24sIHR5cGUgVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lLCB0eXBlIFRlcm1pbmFsU2hlbGxFeGVjdXRpb25TdGFydEV2ZW50IH0gZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSW50ZXJuYWxUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lQ29uZmlkZW5jZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBub3RTdHJpY3RFcXVhbCwgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5mdW5jdGlvbiBjbWRMaW5lKHZhbHVlOiBzdHJpbmcpOiBUZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmUge1xuXHRyZXR1cm4gT2JqZWN0LmZyZWV6ZSh7XG5cdFx0Y29uZmlkZW5jZTogVGVybWluYWxTaGVsbEV4ZWN1dGlvbkNvbW1hbmRMaW5lQ29uZmlkZW5jZS5IaWdoLFxuXHRcdHZhbHVlLFxuXHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0fSk7XG59XG5mdW5jdGlvbiBhc0NtZExpbmUodmFsdWU6IHN0cmluZyB8IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZSk6IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGNtZExpbmUodmFsdWUpO1xuXHR9XG5cdHJldHVybiB2YWx1ZTtcbn1cbmZ1bmN0aW9uIHZzYyhkYXRhOiBzdHJpbmcpIHtcblx0cmV0dXJuIGBcXHgxYl02MzM7JHtkYXRhfVxceDA3YDtcbn1cblxuY29uc3QgdGVzdENvbW1hbmRMaW5lID0gJ2VjaG8gaGVsbG8gd29ybGQnO1xuY29uc3QgdGVzdENvbW1hbmRMaW5lMiA9ICdlY2hvIGdvb2RieWUgd29ybGQnO1xuXG5pbnRlcmZhY2UgSVRyYWNrZWRFdmVudCB7XG5cdHR5cGU6ICdzdGFydCcgfCAnZGF0YScgfCAnZW5kJztcblx0Y29tbWFuZExpbmU6IHN0cmluZztcblx0ZGF0YT86IHN0cmluZztcbn1cblxuc3VpdGUoJ0ludGVybmFsVGVybWluYWxTaGVsbEludGVncmF0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBzaTogSW50ZXJuYWxUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb247XG5cdGxldCB0ZXJtaW5hbDogVGVybWluYWw7XG5cdGxldCBvbkRpZFN0YXJ0VGVybWluYWxTaGVsbEV4ZWN1dGlvbjogRW1pdHRlcjxUZXJtaW5hbFNoZWxsRXhlY3V0aW9uU3RhcnRFdmVudD47XG5cdGxldCB0cmFja2VkRXZlbnRzOiBJVHJhY2tlZEV2ZW50W107XG5cdGxldCByZWFkSXRlcmF0b3JzRmx1c2hlZDogUHJvbWlzZTx2b2lkPltdO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3QoY29tbWFuZExpbmU6IHN0cmluZyB8IFRlcm1pbmFsU2hlbGxFeGVjdXRpb25Db21tYW5kTGluZSwgY3dkPzogVVJJKTogUHJvbWlzZTxUZXJtaW5hbFNoZWxsRXhlY3V0aW9uPiB7XG5cdFx0cmV0dXJuIGF3YWl0IG5ldyBQcm9taXNlPFRlcm1pbmFsU2hlbGxFeGVjdXRpb24+KHIgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKG9uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uLmV2ZW50KGUgPT4ge1xuXHRcdFx0XHRyKGUuZXhlY3V0aW9uKTtcblx0XHRcdH0pKTtcblx0XHRcdHNpLnN0YXJ0U2hlbGxFeGVjdXRpb24oYXNDbWRMaW5lKGNvbW1hbmRMaW5lKSwgY3dkKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGVuZEV4ZWN1dGlvbkF3YWl0T2JqZWN0KGNvbW1hbmRMaW5lOiBzdHJpbmcgfCBUZXJtaW5hbFNoZWxsRXhlY3V0aW9uQ29tbWFuZExpbmUpOiBQcm9taXNlPFRlcm1pbmFsU2hlbGxFeGVjdXRpb24+IHtcblx0XHRyZXR1cm4gYXdhaXQgbmV3IFByb21pc2U8VGVybWluYWxTaGVsbEV4ZWN1dGlvbj4ociA9PiB7XG5cdFx0XHRzdG9yZS5hZGQoc2kub25EaWRSZXF1ZXN0RW5kRXhlY3V0aW9uKGUgPT4gcihlLmV4ZWN1dGlvbikpKTtcblx0XHRcdHNpLmVuZFNoZWxsRXhlY3V0aW9uKGFzQ21kTGluZShjb21tYW5kTGluZSksIDApO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZW1pdERhdGEoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQXN5bmNJdGVyYWJsZU9iamVjdHMgYXJlIGluaXRpYWxpemVkIGluIGEgbWljcm90YXNrLCB0aGlzIGRvZXNuJ3QgbWF0dGVyIGluIHByYWN0aWNlXG5cdFx0Ly8gc2luY2UgdGhlIGV2ZW50cyB3aWxsIGFsd2F5cyBjb21lIHRocm91Z2ggaW4gZGlmZmVyZW50IGV2ZW50cy5cblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHF1ZXVlTWljcm90YXNrKHIpKTtcblx0XHRzaS5lbWl0RGF0YShkYXRhKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFRyYWNrZWRFdmVudHMoZXhwZWN0ZWQ6IElUcmFja2VkRXZlbnRbXSkge1xuXHRcdGRlZXBTdHJpY3RFcXVhbCh0cmFja2VkRXZlbnRzLCBleHBlY3RlZCk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnROb25EYXRhVHJhY2tlZEV2ZW50cyhleHBlY3RlZDogSVRyYWNrZWRFdmVudFtdKSB7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHRyYWNrZWRFdmVudHMuZmlsdGVyKGUgPT4gZS50eXBlICE9PSAnZGF0YScpLCBleHBlY3RlZCk7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnREYXRhVHJhY2tlZEV2ZW50cyhleHBlY3RlZDogSVRyYWNrZWRFdmVudFtdKSB7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHRyYWNrZWRFdmVudHMuZmlsdGVyKGUgPT4gZS50eXBlID09PSAnZGF0YScpLCBleHBlY3RlZCk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0dGVybWluYWwgPSBTeW1ib2woJ3Rlc3RUZXJtaW5hbCcpIGFzIGFueTtcblx0XHRvbkRpZFN0YXJ0VGVybWluYWxTaGVsbEV4ZWN1dGlvbiA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcigpKTtcblx0XHRzaSA9IHN0b3JlLmFkZChuZXcgSW50ZXJuYWxUZXJtaW5hbFNoZWxsSW50ZWdyYXRpb24odGVybWluYWwsIHRydWUsIG9uRGlkU3RhcnRUZXJtaW5hbFNoZWxsRXhlY3V0aW9uKSk7XG5cblx0XHR0cmFja2VkRXZlbnRzID0gW107XG5cdFx0cmVhZEl0ZXJhdG9yc0ZsdXNoZWQgPSBbXTtcblx0XHRzdG9yZS5hZGQob25EaWRTdGFydFRlcm1pbmFsU2hlbGxFeGVjdXRpb24uZXZlbnQoYXN5bmMgZSA9PiB7XG5cdFx0XHR0cmFja2VkRXZlbnRzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnc3RhcnQnLFxuXHRcdFx0XHRjb21tYW5kTGluZTogZS5leGVjdXRpb24uY29tbWFuZExpbmUudmFsdWUsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHN0cmVhbSA9IGUuZXhlY3V0aW9uLnJlYWQoKTtcblx0XHRcdGNvbnN0IHJlYWRJdGVyYXRvcnNGbHVzaGVkRGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRyZWFkSXRlcmF0b3JzRmx1c2hlZC5wdXNoKHJlYWRJdGVyYXRvcnNGbHVzaGVkRGVmZXJyZWQucCk7XG5cdFx0XHRmb3IgYXdhaXQgKGNvbnN0IGRhdGEgb2Ygc3RyZWFtKSB7XG5cdFx0XHRcdHRyYWNrZWRFdmVudHMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ2RhdGEnLFxuXHRcdFx0XHRcdGNvbW1hbmRMaW5lOiBlLmV4ZWN1dGlvbi5jb21tYW5kTGluZS52YWx1ZSxcblx0XHRcdFx0XHRkYXRhLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJlYWRJdGVyYXRvcnNGbHVzaGVkRGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKHNpLm9uRGlkUmVxdWVzdEVuZEV4ZWN1dGlvbihlID0+IHRyYWNrZWRFdmVudHMucHVzaCh7XG5cdFx0XHR0eXBlOiAnZW5kJyxcblx0XHRcdGNvbW1hbmRMaW5lOiBlLmV4ZWN1dGlvbi5jb21tYW5kTGluZS52YWx1ZSxcblx0XHR9KSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW1wbGUgZXhlY3V0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4ZWN1dGlvbiA9IGF3YWl0IHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3QodGVzdENvbW1hbmRMaW5lKTtcblx0XHRkZWVwU3RyaWN0RXF1YWwoZXhlY3V0aW9uLmNvbW1hbmRMaW5lLnZhbHVlLCB0ZXN0Q29tbWFuZExpbmUpO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbjIgPSBhd2FpdCBlbmRFeGVjdXRpb25Bd2FpdE9iamVjdCh0ZXN0Q29tbWFuZExpbmUpO1xuXHRcdHN0cmljdEVxdWFsKGV4ZWN1dGlvbjIsIGV4ZWN1dGlvbik7XG5cblx0XHRhc3NlcnRUcmFja2VkRXZlbnRzKFtcblx0XHRcdHsgY29tbWFuZExpbmU6IHRlc3RDb21tYW5kTGluZSwgdHlwZTogJ3N0YXJ0JyB9LFxuXHRcdFx0eyBjb21tYW5kTGluZTogdGVzdENvbW1hbmRMaW5lLCB0eXBlOiAnZW5kJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgZXhlY3V0aW9uIHVuZXhwZWN0ZWRseSBlbmRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGVjdXRpb24xID0gYXdhaXQgc3RhcnRFeGVjdXRpb25Bd2FpdE9iamVjdCh0ZXN0Q29tbWFuZExpbmUpO1xuXHRcdGNvbnN0IGV4ZWN1dGlvbjIgPSBhd2FpdCBlbmRFeGVjdXRpb25Bd2FpdE9iamVjdCh0ZXN0Q29tbWFuZExpbmUyKTtcblx0XHRzdHJpY3RFcXVhbChleGVjdXRpb24xLCBleGVjdXRpb24yLCAnd2hlbiBhIGRpZmZlcmVudCBleGVjdXRpb24gaXMgZW5kZWQsIHRoZSBvbmUgdGhhdCBzdGFydGVkIGZpcnN0IHNob3VsZCBlbmQnKTtcblxuXHRcdGFzc2VydFRyYWNrZWRFdmVudHMoW1xuXHRcdFx0eyBjb21tYW5kTGluZTogdGVzdENvbW1hbmRMaW5lLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHQvLyBUaGlzIGxvb2tzIHdlaXJkLCBidXQgaXQncyB0aGUgc2FtZSBleGVjdXRpb24gYmVoaW5kIHRoZSBzY2VuZXMsIGp1c3QgdGhlIGNvbW1hbmRcblx0XHRcdC8vIGxpbmUgd2FzIHVwZGF0ZWRcblx0XHRcdHsgY29tbWFuZExpbmU6IHRlc3RDb21tYW5kTGluZTIsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vIGVuZCBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleGVjdXRpb24xID0gYXdhaXQgc3RhcnRFeGVjdXRpb25Bd2FpdE9iamVjdCh0ZXN0Q29tbWFuZExpbmUpO1xuXHRcdGNvbnN0IGVuZGVkRXhlY3V0aW9uID0gYXdhaXQgbmV3IFByb21pc2U8VGVybWluYWxTaGVsbEV4ZWN1dGlvbj4ociA9PiB7XG5cdFx0XHRzdG9yZS5hZGQoc2kub25EaWRSZXF1ZXN0RW5kRXhlY3V0aW9uKGUgPT4gcihlLmV4ZWN1dGlvbikpKTtcblx0XHRcdHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3QodGVzdENvbW1hbmRMaW5lMik7XG5cdFx0fSk7XG5cdFx0c3RyaWN0RXF1YWwoZXhlY3V0aW9uMSwgZW5kZWRFeGVjdXRpb24sICd3aGVuIG5vIGVuZCBldmVudCBpcyBmaXJlZCwgdGhlIGN1cnJlbnQgZXhlY3V0aW9uIHNob3VsZCBlbmQnKTtcblxuXHRcdC8vIENsZWFuIHVwIGRpc3Bvc2FibGVzXG5cdFx0YXdhaXQgZW5kRXhlY3V0aW9uQXdhaXRPYmplY3QodGVzdENvbW1hbmRMaW5lMik7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwocmVhZEl0ZXJhdG9yc0ZsdXNoZWQpO1xuXG5cdFx0YXNzZXJ0VHJhY2tlZEV2ZW50cyhbXG5cdFx0XHR7IGNvbW1hbmRMaW5lOiB0ZXN0Q29tbWFuZExpbmUsIHR5cGU6ICdzdGFydCcgfSxcblx0XHRcdHsgY29tbWFuZExpbmU6IHRlc3RDb21tYW5kTGluZSwgdHlwZTogJ2VuZCcgfSxcblx0XHRcdHsgY29tbWFuZExpbmU6IHRlc3RDb21tYW5kTGluZTIsIHR5cGU6ICdzdGFydCcgfSxcblx0XHRcdHsgY29tbWFuZExpbmU6IHRlc3RDb21tYW5kTGluZTIsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdleGVjdXRlQ29tbWFuZCcsICgpID0+IHtcblx0XHR0ZXN0KCdeQyB0byBjbGVhciBwcmV2aW91cyBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnZm9vJztcblx0XHRcdGNvbnN0IGFwaVJlcXVlc3RlZEV4ZWN1dGlvbiA9IHNpLnJlcXVlc3ROZXdTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKGNvbW1hbmRMaW5lKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGZpcnN0RXhlY3V0aW9uID0gYXdhaXQgc3RhcnRFeGVjdXRpb25Bd2FpdE9iamVjdCgnXkMnKTtcblx0XHRcdG5vdFN0cmljdEVxdWFsKGZpcnN0RXhlY3V0aW9uLCBhcGlSZXF1ZXN0ZWRFeGVjdXRpb24udmFsdWUpO1xuXHRcdFx0c2kuZW1pdERhdGEoJ1NJR0lOVCcpO1xuXHRcdFx0c2kuZW5kU2hlbGxFeGVjdXRpb24oY21kTGluZSgnXkMnKSwgMCk7XG5cdFx0XHRzaS5zdGFydFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoY29tbWFuZExpbmUpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXdhaXQgZW1pdERhdGEoJzEnKTtcblx0XHRcdGF3YWl0IGVuZEV4ZWN1dGlvbkF3YWl0T2JqZWN0KGNvbW1hbmRMaW5lKTtcblx0XHRcdC8vIElNUE9SVEFOVDogV2UgY2Fubm90IHJlbGlhYmx5IGFzc2VydCB0aGUgb3JkZXIgb2YgZGF0YSBldmVudHMgaGVyZSBiZWNhdXNlIGZsdXNoaW5nXG5cdFx0XHQvLyBvZiB0aGUgYXN5bmMgaXRlcmF0b3IgaXMgYXN5bmNocm9ub3VzIGFuZCBjb3VsZCBoYXBwZW4gYWZ0ZXIgdGhlIGV4ZWN1dGlvbidzIGVuZFxuXHRcdFx0Ly8gZXZlbnQgZmlyZXMgaWYgYW4gZXhlY3V0aW9uIGlzIHN0YXJ0ZWQgaW1tZWRpYXRlbHkgYWZ0ZXJ3YXJkcy5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHJlYWRJdGVyYXRvcnNGbHVzaGVkKTtcblxuXHRcdFx0YXNzZXJ0Tm9uRGF0YVRyYWNrZWRFdmVudHMoW1xuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiAnXkMnLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmU6ICdeQycsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdzdGFydCcgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2VuZCcgfSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0RGF0YVRyYWNrZWRFdmVudHMoW1xuXHRcdFx0XHR7IGNvbW1hbmRMaW5lOiAnXkMnLCB0eXBlOiAnZGF0YScsIGRhdGE6ICdTSUdJTlQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJzEnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLWxpbmUgY29tbWFuZCBsaW5lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnZm9vXFxuYmFyJztcblx0XHRcdGNvbnN0IGFwaVJlcXVlc3RlZEV4ZWN1dGlvbiA9IHNpLnJlcXVlc3ROZXdTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKGNvbW1hbmRMaW5lKSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHN0YXJ0ZWRFeGVjdXRpb24gPSBhd2FpdCBzdGFydEV4ZWN1dGlvbkF3YWl0T2JqZWN0KCdmb28nKTtcblx0XHRcdHN0cmljdEVxdWFsKHN0YXJ0ZWRFeGVjdXRpb24sIGFwaVJlcXVlc3RlZEV4ZWN1dGlvbi52YWx1ZSk7XG5cblx0XHRcdHNpLmVtaXREYXRhKCcxJyk7XG5cdFx0XHRzaS5lbWl0RGF0YSgnMicpO1xuXHRcdFx0c2kuZW5kU2hlbGxFeGVjdXRpb24oY21kTGluZSgnZm9vJyksIDApO1xuXHRcdFx0c2kuc3RhcnRTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKCdiYXInKSwgdW5kZWZpbmVkKTtcblx0XHRcdHNpLmVtaXREYXRhKCczJyk7XG5cdFx0XHRzaS5lbWl0RGF0YSgnNCcpO1xuXHRcdFx0Y29uc3QgZW5kZWRFeGVjdXRpb24gPSBhd2FpdCBlbmRFeGVjdXRpb25Bd2FpdE9iamVjdCgnYmFyJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChzdGFydGVkRXhlY3V0aW9uLCBlbmRlZEV4ZWN1dGlvbik7XG5cblx0XHRcdGFzc2VydFRyYWNrZWRFdmVudHMoW1xuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJzEnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJzInIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJzMnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJzQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLWxpbmUgY29tbWFuZCB3aXRoIGxvbmcgc2Vjb25kIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdlY2hvIGZvb1xcbmNhdCA8PCBFT1RcXG5saW5lMVxcbmxpbmUyXFxubGluZTNcXG5FT1QnO1xuXHRcdFx0Y29uc3Qgc3ViQ29tbWFuZExpbmUxID0gJ2VjaG8gZm9vJztcblx0XHRcdGNvbnN0IHN1YkNvbW1hbmRMaW5lMiA9ICdjYXQgPDwgRU9UXFxubGluZTFcXG5saW5lMlxcbmxpbmUzXFxuRU9UJztcblxuXHRcdFx0Y29uc3QgYXBpUmVxdWVzdGVkRXhlY3V0aW9uID0gc2kucmVxdWVzdE5ld1NoZWxsRXhlY3V0aW9uKGNtZExpbmUoY29tbWFuZExpbmUpLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgc3RhcnRlZEV4ZWN1dGlvbiA9IGF3YWl0IHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3Qoc3ViQ29tbWFuZExpbmUxKTtcblx0XHRcdHN0cmljdEVxdWFsKHN0YXJ0ZWRFeGVjdXRpb24sIGFwaVJlcXVlc3RlZEV4ZWN1dGlvbi52YWx1ZSk7XG5cblx0XHRcdHNpLmVtaXREYXRhKGAke3ZzYygnQycpfWZvb2ApO1xuXHRcdFx0c2kuZW5kU2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTEpLCAwKTtcblx0XHRcdHNpLnN0YXJ0U2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTIpLCB1bmRlZmluZWQpO1xuXHRcdFx0c2kuZW1pdERhdGEoYCR7dnNjKCdDJyl9bGluZTFgKTtcblx0XHRcdHNpLmVtaXREYXRhKCdsaW5lMicpO1xuXHRcdFx0c2kuZW1pdERhdGEoJ2xpbmUzJyk7XG5cdFx0XHRjb25zdCBlbmRlZEV4ZWN1dGlvbiA9IGF3YWl0IGVuZEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHN1YkNvbW1hbmRMaW5lMik7XG5cdFx0XHRzdHJpY3RFcXVhbChzdGFydGVkRXhlY3V0aW9uLCBlbmRlZEV4ZWN1dGlvbik7XG5cblx0XHRcdGFzc2VydFRyYWNrZWRFdmVudHMoW1xuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogYCR7dnNjKCdDJyl9Zm9vYCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6IGAke3ZzYygnQycpfWxpbmUxYCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICdsaW5lMicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiAnbGluZTMnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpLWxpbmUgY29tbWFuZCBjb21tZW50IGZvbGxvd2VkIGJ5IGxvbmcgc2Vjb25kIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kTGluZSA9ICcjIGNvbW1lbnQ6IGZvb1xcbmNhdCA8PCBFT1RcXG5saW5lMVxcbmxpbmUyXFxubGluZTNcXG5FT1QnO1xuXHRcdFx0Y29uc3Qgc3ViQ29tbWFuZExpbmUxID0gJyMgY29tbWVudDogZm9vJztcblx0XHRcdGNvbnN0IHN1YkNvbW1hbmRMaW5lMiA9ICdjYXQgPDwgRU9UXFxubGluZTFcXG5saW5lMlxcbmxpbmUzXFxuRU9UJztcblxuXHRcdFx0Y29uc3QgYXBpUmVxdWVzdGVkRXhlY3V0aW9uID0gc2kucmVxdWVzdE5ld1NoZWxsRXhlY3V0aW9uKGNtZExpbmUoY29tbWFuZExpbmUpLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgc3RhcnRlZEV4ZWN1dGlvbiA9IGF3YWl0IHN0YXJ0RXhlY3V0aW9uQXdhaXRPYmplY3Qoc3ViQ29tbWFuZExpbmUxKTtcblx0XHRcdHN0cmljdEVxdWFsKHN0YXJ0ZWRFeGVjdXRpb24sIGFwaVJlcXVlc3RlZEV4ZWN1dGlvbi52YWx1ZSk7XG5cblx0XHRcdHNpLmVtaXREYXRhKGAke3ZzYygnQycpfWApO1xuXHRcdFx0c2kuZW5kU2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTEpLCAwKTtcblx0XHRcdHNpLnN0YXJ0U2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTIpLCB1bmRlZmluZWQpO1xuXHRcdFx0c2kuZW1pdERhdGEoYCR7dnNjKCdDJyl9bGluZTFgKTtcblx0XHRcdHNpLmVtaXREYXRhKCdsaW5lMicpO1xuXHRcdFx0c2kuZW1pdERhdGEoJ2xpbmUzJyk7XG5cdFx0XHRjb25zdCBlbmRlZEV4ZWN1dGlvbiA9IGF3YWl0IGVuZEV4ZWN1dGlvbkF3YWl0T2JqZWN0KHN1YkNvbW1hbmRMaW5lMik7XG5cdFx0XHRzdHJpY3RFcXVhbChzdGFydGVkRXhlY3V0aW9uLCBlbmRlZEV4ZWN1dGlvbik7XG5cblx0XHRcdGFzc2VydFRyYWNrZWRFdmVudHMoW1xuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnc3RhcnQnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogYCR7dnNjKCdDJyl9YCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6IGAke3ZzYygnQycpfWxpbmUxYCB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICdsaW5lMicgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiAnbGluZTMnIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJzQgbXVsdGktbGluZSBjb21tYW5kcyB3aXRoIG91dHB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ2VjaG8gXCJcXG5mb29cIlxcbmdpdCBjb21taXQgLW0gXCJoZWxsb1xcblxcbndvcmxkXCJcXG5jYXQgPDwgRU9UXFxubGluZTFcXG5saW5lMlxcbmxpbmUzXFxuRU9UXFxue1xcbmVjaG8gXCJmb29cIlxcbn0nO1xuXHRcdFx0Y29uc3Qgc3ViQ29tbWFuZExpbmUxID0gJ2VjaG8gXCJcXG5mb29cIic7XG5cdFx0XHRjb25zdCBzdWJDb21tYW5kTGluZTIgPSAnZ2l0IGNvbW1pdCAtbSBcImhlbGxvXFxuXFxud29ybGRcIic7XG5cdFx0XHRjb25zdCBzdWJDb21tYW5kTGluZTMgPSAnY2F0IDw8IEVPVFxcbmxpbmUxXFxubGluZTJcXG5saW5lM1xcbkVPVCc7XG5cdFx0XHRjb25zdCBzdWJDb21tYW5kTGluZTQgPSAne1xcbmVjaG8gXCJmb29cIlxcbn0nO1xuXG5cdFx0XHRjb25zdCBhcGlSZXF1ZXN0ZWRFeGVjdXRpb24gPSBzaS5yZXF1ZXN0TmV3U2hlbGxFeGVjdXRpb24oY21kTGluZShjb21tYW5kTGluZSksIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBzdGFydGVkRXhlY3V0aW9uID0gYXdhaXQgc3RhcnRFeGVjdXRpb25Bd2FpdE9iamVjdChzdWJDb21tYW5kTGluZTEpO1xuXHRcdFx0c3RyaWN0RXF1YWwoc3RhcnRlZEV4ZWN1dGlvbiwgYXBpUmVxdWVzdGVkRXhlY3V0aW9uLnZhbHVlKTtcblxuXHRcdFx0c2kuZW1pdERhdGEoYCR7dnNjKCdDJyl9Zm9vYCk7XG5cdFx0XHRzaS5lbmRTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKHN1YkNvbW1hbmRMaW5lMSksIDApO1xuXHRcdFx0c2kuc3RhcnRTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKHN1YkNvbW1hbmRMaW5lMiksIHVuZGVmaW5lZCk7XG5cdFx0XHRzaS5lbWl0RGF0YShgJHt2c2MoJ0MnKX0gMiBmaWxlcyBjaGFuZ2VkLCA2MSBpbnNlcnRpb25zKCspLCAyIGRlbGV0aW9ucygtKWApO1xuXHRcdFx0c2kuZW5kU2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTIpLCAwKTtcblx0XHRcdHNpLnN0YXJ0U2hlbGxFeGVjdXRpb24oY21kTGluZShzdWJDb21tYW5kTGluZTMpLCB1bmRlZmluZWQpO1xuXHRcdFx0c2kuZW1pdERhdGEoYCR7dnNjKCdDJyl9bGluZTFgKTtcblx0XHRcdHNpLmVtaXREYXRhKCdsaW5lMicpO1xuXHRcdFx0c2kuZW1pdERhdGEoJ2xpbmUzJyk7XG5cdFx0XHRzaS5lbmRTaGVsbEV4ZWN1dGlvbihjbWRMaW5lKHN1YkNvbW1hbmRMaW5lMyksIDApO1xuXHRcdFx0c2kuZW1pdERhdGEoYCR7dnNjKCdDJyl9Zm9vYCk7XG5cdFx0XHRzaS5zdGFydFNoZWxsRXhlY3V0aW9uKGNtZExpbmUoc3ViQ29tbWFuZExpbmU0KSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGVuZGVkRXhlY3V0aW9uID0gYXdhaXQgZW5kRXhlY3V0aW9uQXdhaXRPYmplY3Qoc3ViQ29tbWFuZExpbmU0KTtcblx0XHRcdHN0cmljdEVxdWFsKHN0YXJ0ZWRFeGVjdXRpb24sIGVuZGVkRXhlY3V0aW9uKTtcblxuXHRcdFx0YXNzZXJ0VHJhY2tlZEV2ZW50cyhbXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdzdGFydCcgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiBgJHt2c2MoJ0MnKX1mb29gIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogYCR7dnNjKCdDJyl9IDIgZmlsZXMgY2hhbmdlZCwgNjEgaW5zZXJ0aW9ucygrKSwgMiBkZWxldGlvbnMoLSlgIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogYCR7dnNjKCdDJyl9bGluZTFgIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdkYXRhJywgZGF0YTogJ2xpbmUyJyB9LFxuXHRcdFx0XHR7IGNvbW1hbmRMaW5lLCB0eXBlOiAnZGF0YScsIGRhdGE6ICdsaW5lMycgfSxcblx0XHRcdFx0eyBjb21tYW5kTGluZSwgdHlwZTogJ2RhdGEnLCBkYXRhOiBgJHt2c2MoJ0MnKX1mb29gIH0sXG5cdFx0XHRcdHsgY29tbWFuZExpbmUsIHR5cGU6ICdlbmQnIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsZUFBZTtBQUN4QixTQUFTLG1EQUFtRDtBQUM1RCxTQUFTLGlCQUFpQixnQkFBZ0IsbUJBQW1CO0FBRTdELFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsUUFBUSxPQUFrRDtBQUNsRSxTQUFPLE9BQU8sT0FBTztBQUFBLElBQ3BCLFlBQVksNENBQTRDO0FBQUEsSUFDeEQ7QUFBQSxJQUNBLFdBQVc7QUFBQSxFQUNaLENBQUM7QUFDRjtBQUNBLFNBQVMsVUFBVSxPQUFzRjtBQUN4RyxNQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFdBQU8sUUFBUSxLQUFLO0FBQUEsRUFDckI7QUFDQSxTQUFPO0FBQ1I7QUFDQSxTQUFTLElBQUksTUFBYztBQUMxQixTQUFPLFlBQVksSUFBSTtBQUN4QjtBQUVBLE1BQU0sa0JBQWtCO0FBQ3hCLE1BQU0sbUJBQW1CO0FBUXpCLE1BQU0sb0NBQW9DLE1BQU07QUFDL0MsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLGlCQUFlLDBCQUEwQixhQUF5RCxLQUE0QztBQUM3SSxXQUFPLE1BQU0sSUFBSSxRQUFnQyxPQUFLO0FBQ3JELFlBQU0sSUFBSSxpQ0FBaUMsTUFBTSxPQUFLO0FBQ3JELFVBQUUsRUFBRSxTQUFTO0FBQUEsTUFDZCxDQUFDLENBQUM7QUFDRixTQUFHLG9CQUFvQixVQUFVLFdBQVcsR0FBRyxHQUFHO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxpQkFBZSx3QkFBd0IsYUFBMEY7QUFDaEksV0FB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
