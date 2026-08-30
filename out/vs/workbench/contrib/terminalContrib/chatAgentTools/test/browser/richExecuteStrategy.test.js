import { rejects, strictEqual } from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { RichExecuteStrategy } from "../../browser/executeStrategy/richExecuteStrategy.js";
function createLogService() {
  return new class extends NullLogService {
    constructor() {
      super(...arguments);
      this._logBrand = void 0;
    }
  }();
}
suite("RichExecuteStrategy", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("passes separate command line metadata when running a wrapped command", async () => {
    const onCommandFinishedEmitter = new Emitter();
    let actualCommandLine;
    let actualCommandId;
    let actualCommandLineForMetadata;
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      raw: {
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: () => toDisposable(() => {
          })
        },
        getContentsAsText: () => ""
      }
    };
    const instance = {
      xtermReadyPromise: Promise.resolve(xterm),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: Event.None,
      runCommand: (commandLine, _shouldExecute, commandId, _forceBracketedPasteMode, commandLineForMetadata) => {
        actualCommandLine = commandLine;
        actualCommandId = commandId;
        actualCommandLineForMetadata = commandLineForMetadata;
        queueMicrotask(() => onCommandFinishedEmitter.fire({ getOutput: () => "output", exitCode: 0 }));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    await strategy.execute("sandbox:echo hello", CancellationToken.None, "tool-command-id", "echo hello");
    strictEqual(actualCommandLine, "sandbox:echo hello");
    strictEqual(actualCommandId, "tool-command-id");
    strictEqual(actualCommandLineForMetadata, "echo hello");
  });
  test("completes when terminal process exits without shell integration sequences", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      raw: {
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: () => toDisposable(() => {
          })
        },
        getContentsAsText: () => "some output"
      }
    };
    const instance = {
      xtermReadyPromise: Promise.resolve(xterm),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      runCommand: () => {
        queueMicrotask(() => onExitEmitter.fire(1));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("exit 1", CancellationToken.None);
    strictEqual(result.exitCode, 1);
  });
  test("handles ITerminalLaunchError on process exit", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const marker = {
      line: 0,
      dispose: () => {
      },
      onDispose: Event.None
    };
    const xterm = {
      raw: {
        registerMarker: () => marker,
        buffer: {
          active: {},
          alternate: {},
          onBufferChange: () => toDisposable(() => {
          })
        },
        getContentsAsText: () => ""
      }
    };
    const instance = {
      xtermReadyPromise: Promise.resolve(xterm),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      runCommand: () => {
        queueMicrotask(() => onExitEmitter.fire({ message: "Failed to launch", code: 127 }));
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("bad-command", CancellationToken.None);
    strictEqual(result.exitCode, 127);
  });
  test("returns immediately with captured exit code when pty has already exited before execute()", async () => {
    const onCommandFinishedEmitter = new Emitter();
    const onExitEmitter = new Emitter();
    const instance = {
      xtermReadyPromise: Promise.resolve({}),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: onExitEmitter.event,
      isDisposed: false,
      exitCode: 1,
      runCommand: () => {
        throw new Error("runCommand should not be called when pty already exited");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    const result = await strategy.execute("Rscript /app/ars.R", CancellationToken.None);
    strictEqual(result.exitCode, 1);
    strictEqual(result.output, void 0);
    strictEqual(result.additionalInformation, "Command exited with code 1");
  });
  test('throws "The terminal was closed" when instance is already disposed before execute()', async () => {
    const onCommandFinishedEmitter = new Emitter();
    const instance = {
      xtermReadyPromise: Promise.resolve({}),
      onData: Event.None,
      onDisposed: Event.None,
      onExit: Event.None,
      isDisposed: true,
      exitCode: void 0,
      runCommand: () => {
        throw new Error("runCommand should not be called when terminal is disposed");
      }
    };
    const commandDetection = {
      onCommandFinished: onCommandFinishedEmitter.event
    };
    const strategy = store.add(new RichExecuteStrategy(
      instance,
      commandDetection,
      false,
      new TestConfigurationService(),
      createLogService()
    ));
    await rejects(
      () => strategy.execute("echo hello", CancellationToken.None),
      /The terminal was closed/
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHJpY2hFeGVjdXRlU3RyYXRlZ3kudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlamVjdHMsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IElUZXJtaW5hbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgUmljaEV4ZWN1dGVTdHJhdGVneSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZXhlY3V0ZVN0cmF0ZWd5L3JpY2hFeGVjdXRlU3RyYXRlZ3kuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUxvZ1NlcnZpY2UoKTogSVRlcm1pbmFsTG9nU2VydmljZSB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7IHJlYWRvbmx5IF9sb2dCcmFuZCA9IHVuZGVmaW5lZDsgfTtcbn1cblxuc3VpdGUoJ1JpY2hFeGVjdXRlU3RyYXRlZ3knLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFzc2VzIHNlcGFyYXRlIGNvbW1hbmQgbGluZSBtZXRhZGF0YSB3aGVuIHJ1bm5pbmcgYSB3cmFwcGVkIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb25Db21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBnZXRPdXRwdXQoKTogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0+KCk7XG5cdFx0bGV0IGFjdHVhbENvbW1hbmRMaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFjdHVhbENvbW1hbmRJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhY3R1YWxDb21tYW5kTGluZUZvck1ldGFkYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBtYXJrZXIgPSB7XG5cdFx0XHRsaW5lOiAwLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0b25EaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0Y29uc3QgeHRlcm0gPSB7XG5cdFx0XHRyYXc6IHtcblx0XHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+IG1hcmtlcixcblx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0YWN0aXZlOiB7fSxcblx0XHRcdFx0XHRhbHRlcm5hdGU6IHt9LFxuXHRcdFx0XHRcdG9uQnVmZmVyQ2hhbmdlOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0Q29udGVudHNBc1RleHQ6ICgpID0+ICcnLFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSB7XG5cdFx0XHR4dGVybVJlYWR5UHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKHh0ZXJtKSxcblx0XHRcdG9uRGF0YTogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlzcG9zZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkV4aXQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHRydW5Db21tYW5kOiAoY29tbWFuZExpbmU6IHN0cmluZywgX3Nob3VsZEV4ZWN1dGU6IGJvb2xlYW4sIGNvbW1hbmRJZD86IHN0cmluZywgX2ZvcmNlQnJhY2tldGVkUGFzdGVNb2RlPzogYm9vbGVhbiwgY29tbWFuZExpbmVGb3JNZXRhZGF0YT86IHN0cmluZykgPT4ge1xuXHRcdFx0XHRhY3R1YWxDb21tYW5kTGluZSA9IGNvbW1hbmRMaW5lO1xuXHRcdFx0XHRhY3R1YWxDb21tYW5kSWQgPSBjb21tYW5kSWQ7XG5cdFx0XHRcdGFjdHVhbENvbW1hbmRMaW5lRm9yTWV0YWRhdGEgPSBjb21tYW5kTGluZUZvck1ldGFkYXRhO1xuXHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIuZmlyZSh7IGdldE91dHB1dDogKCkgPT4gJ291dHB1dCcsIGV4aXRDb2RlOiAwIH0pKTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIElUZXJtaW5hbEluc3RhbmNlO1xuXHRcdGNvbnN0IGNvbW1hbmREZXRlY3Rpb24gPSB7XG5cdFx0XHRvbkNvbW1hbmRGaW5pc2hlZDogb25Db21tYW5kRmluaXNoZWRFbWl0dGVyLmV2ZW50LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHk7XG5cdFx0Y29uc3Qgc3RyYXRlZ3kgPSBzdG9yZS5hZGQobmV3IFJpY2hFeGVjdXRlU3RyYXRlZ3koXG5cdFx0XHRpbnN0YW5jZSxcblx0XHRcdGNvbW1hbmREZXRlY3Rpb24sXG5cdFx0XHRmYWxzZSxcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZUxvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblxuXHRcdGF3YWl0IHN0cmF0ZWd5LmV4ZWN1dGUoJ3NhbmRib3g6ZWNobyBoZWxsbycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICd0b29sLWNvbW1hbmQtaWQnLCAnZWNobyBoZWxsbycpO1xuXG5cdFx0c3RyaWN0RXF1YWwoYWN0dWFsQ29tbWFuZExpbmUsICdzYW5kYm94OmVjaG8gaGVsbG8nKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWxDb21tYW5kSWQsICd0b29sLWNvbW1hbmQtaWQnKTtcblx0XHRzdHJpY3RFcXVhbChhY3R1YWxDb21tYW5kTGluZUZvck1ldGFkYXRhLCAnZWNobyBoZWxsbycpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wbGV0ZXMgd2hlbiB0ZXJtaW5hbCBwcm9jZXNzIGV4aXRzIHdpdGhvdXQgc2hlbGwgaW50ZWdyYXRpb24gc2VxdWVuY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgZ2V0T3V0cHV0KCk6IHN0cmluZzsgZXhpdENvZGU6IG51bWJlciB9PigpO1xuXHRcdGNvbnN0IG9uRXhpdEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxudW1iZXIgfCB1bmRlZmluZWQ+KCk7XG5cblx0XHRjb25zdCBtYXJrZXIgPSB7XG5cdFx0XHRsaW5lOiAwLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0b25EaXNwb3NlOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0Y29uc3QgeHRlcm0gPSB7XG5cdFx0XHRyYXc6IHtcblx0XHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+IG1hcmtlcixcblx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0YWN0aXZlOiB7fSxcblx0XHRcdFx0XHRhbHRlcm5hdGU6IHt9LFxuXHRcdFx0XHRcdG9uQnVmZmVyQ2hhbmdlOiAoKSA9PiB0b0Rpc3Bvc2FibGUoKCkgPT4geyB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0Q29udGVudHNBc1RleHQ6ICgpID0+ICdzb21lIG91dHB1dCcsXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHtcblx0XHRcdHh0ZXJtUmVhZHlQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoeHRlcm0pLFxuXHRcdFx0b25EYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaXNwb3NlZDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRXhpdDogb25FeGl0RW1pdHRlci5ldmVudCxcblx0XHRcdHJ1bkNvbW1hbmQ6ICgpID0+IHtcblx0XHRcdFx0Ly8gU2ltdWxhdGUgcHJvY2VzcyBleGl0aW5nIHdpdGhvdXQgZmlyaW5nIG9uQ29tbWFuZEZpbmlzaGVkXG5cdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IG9uRXhpdEVtaXR0ZXIuZmlyZSgxKSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0ge1xuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5O1xuXHRcdGNvbnN0IHN0cmF0ZWd5ID0gc3RvcmUuYWRkKG5ldyBSaWNoRXhlY3V0ZVN0cmF0ZWd5KFxuXHRcdFx0aW5zdGFuY2UsXG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKCdleGl0IDEnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5leGl0Q29kZSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgSVRlcm1pbmFsTGF1bmNoRXJyb3Igb24gcHJvY2VzcyBleGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgZ2V0T3V0cHV0KCk6IHN0cmluZzsgZXhpdENvZGU6IG51bWJlciB9PigpO1xuXHRcdGNvbnN0IG9uRXhpdEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxudW1iZXIgfCB7IG1lc3NhZ2U6IHN0cmluZzsgY29kZT86IG51bWJlciB9IHwgdW5kZWZpbmVkPigpO1xuXG5cdFx0Y29uc3QgbWFya2VyID0ge1xuXHRcdFx0bGluZTogMCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRcdG9uRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHRcdGNvbnN0IHh0ZXJtID0ge1xuXHRcdFx0cmF3OiB7XG5cdFx0XHRcdHJlZ2lzdGVyTWFya2VyOiAoKSA9PiBtYXJrZXIsXG5cdFx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRcdGFjdGl2ZToge30sXG5cdFx0XHRcdFx0YWx0ZXJuYXRlOiB7fSxcblx0XHRcdFx0XHRvbkJ1ZmZlckNoYW5nZTogKCkgPT4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldENvbnRlbnRzQXNUZXh0OiAoKSA9PiAnJyxcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbmNlID0ge1xuXHRcdFx0eHRlcm1SZWFkeVByb21pc2U6IFByb21pc2UucmVzb2x2ZSh4dGVybSksXG5cdFx0XHRvbkRhdGE6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpc3Bvc2VkOiBFdmVudC5Ob25lLFxuXHRcdFx0b25FeGl0OiBvbkV4aXRFbWl0dGVyLmV2ZW50LFxuXHRcdFx0cnVuQ29tbWFuZDogKCkgPT4ge1xuXHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiBvbkV4aXRFbWl0dGVyLmZpcmUoeyBtZXNzYWdlOiAnRmFpbGVkIHRvIGxhdW5jaCcsIGNvZGU6IDEyNyB9KSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0ge1xuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5O1xuXHRcdGNvbnN0IHN0cmF0ZWd5ID0gc3RvcmUuYWRkKG5ldyBSaWNoRXhlY3V0ZVN0cmF0ZWd5KFxuXHRcdFx0aW5zdGFuY2UsXG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKCdiYWQtY29tbWFuZCcsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LmV4aXRDb2RlLCAxMjcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGltbWVkaWF0ZWx5IHdpdGggY2FwdHVyZWQgZXhpdCBjb2RlIHdoZW4gcHR5IGhhcyBhbHJlYWR5IGV4aXRlZCBiZWZvcmUgZXhlY3V0ZSgpJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlcyB0aGUgc2NlbmFyaW8gd2hlcmUgdGhlIHNoZWxsIHByb2Nlc3MgZnJvbSBhIHByZXZpb3VzIGNvbW1hbmRcblx0XHQvLyBoYXMgYWxyZWFkeSBkaWVkLCBzbyBvbkV4aXQgaGFzIGFscmVhZHkgZmlyZWQgYW5kIEV2ZW50LnRvUHJvbWlzZShvbkV4aXQpXG5cdFx0Ly8gd291bGQgbmV2ZXIgcmVzb2x2ZS4gVGhlIHN0cmF0ZWd5IG11c3Qgc2hvcnQtY2lyY3VpdCB1c2luZyB0aGVcblx0XHQvLyBpbnN0YW5jZSdzIGFscmVhZHktY2FwdHVyZWQgZXhpdENvZGUuXG5cdFx0Y29uc3Qgb25Db21tYW5kRmluaXNoZWRFbWl0dGVyID0gbmV3IEVtaXR0ZXI8eyBnZXRPdXRwdXQoKTogc3RyaW5nOyBleGl0Q29kZTogbnVtYmVyIH0+KCk7XG5cdFx0Y29uc3Qgb25FeGl0RW1pdHRlciA9IG5ldyBFbWl0dGVyPG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHtcblx0XHRcdHh0ZXJtUmVhZHlQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoe30pLFxuXHRcdFx0b25EYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaXNwb3NlZDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRXhpdDogb25FeGl0RW1pdHRlci5ldmVudCxcblx0XHRcdGlzRGlzcG9zZWQ6IGZhbHNlLFxuXHRcdFx0ZXhpdENvZGU6IDEsXG5cdFx0XHRydW5Db21tYW5kOiAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigncnVuQ29tbWFuZCBzaG91bGQgbm90IGJlIGNhbGxlZCB3aGVuIHB0eSBhbHJlYWR5IGV4aXRlZCcpOyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0ge1xuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5O1xuXHRcdGNvbnN0IHN0cmF0ZWd5ID0gc3RvcmUuYWRkKG5ldyBSaWNoRXhlY3V0ZVN0cmF0ZWd5KFxuXHRcdFx0aW5zdGFuY2UsXG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdHJhdGVneS5leGVjdXRlKCdSc2NyaXB0IC9hcHAvYXJzLlInLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5leGl0Q29kZSwgMSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lm91dHB1dCwgdW5kZWZpbmVkKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuYWRkaXRpb25hbEluZm9ybWF0aW9uLCAnQ29tbWFuZCBleGl0ZWQgd2l0aCBjb2RlIDEnKTtcblx0fSk7XG5cblx0dGVzdCgndGhyb3dzIFwiVGhlIHRlcm1pbmFsIHdhcyBjbG9zZWRcIiB3aGVuIGluc3RhbmNlIGlzIGFscmVhZHkgZGlzcG9zZWQgYmVmb3JlIGV4ZWN1dGUoKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvbkNvbW1hbmRGaW5pc2hlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx7IGdldE91dHB1dCgpOiBzdHJpbmc7IGV4aXRDb2RlOiBudW1iZXIgfT4oKTtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHtcblx0XHRcdHh0ZXJtUmVhZHlQcm9taXNlOiBQcm9taXNlLnJlc29sdmUoe30pLFxuXHRcdFx0b25EYXRhOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaXNwb3NlZDogRXZlbnQuTm9uZSxcblx0XHRcdG9uRXhpdDogRXZlbnQuTm9uZSxcblx0XHRcdGlzRGlzcG9zZWQ6IHRydWUsXG5cdFx0XHRleGl0Q29kZTogdW5kZWZpbmVkLFxuXHRcdFx0cnVuQ29tbWFuZDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ3J1bkNvbW1hbmQgc2hvdWxkIG5vdCBiZSBjYWxsZWQgd2hlbiB0ZXJtaW5hbCBpcyBkaXNwb3NlZCcpOyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCBjb21tYW5kRGV0ZWN0aW9uID0ge1xuXHRcdFx0b25Db21tYW5kRmluaXNoZWQ6IG9uQ29tbWFuZEZpbmlzaGVkRW1pdHRlci5ldmVudCxcblx0XHR9IGFzIHVua25vd24gYXMgSUNvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5O1xuXHRcdGNvbnN0IHN0cmF0ZWd5ID0gc3RvcmUuYWRkKG5ldyBSaWNoRXhlY3V0ZVN0cmF0ZWd5KFxuXHRcdFx0aW5zdGFuY2UsXG5cdFx0XHRjb21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhd2FpdCByZWplY3RzKFxuXHRcdFx0KCkgPT4gc3RyYXRlZ3kuZXhlY3V0ZSgnZWNobyBoZWxsbycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0L1RoZSB0ZXJtaW5hbCB3YXMgY2xvc2VkL1xuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFNBQVMsbUJBQW1CO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsMkJBQTJCO0FBSXBDLFNBQVMsbUJBQXdDO0FBQ2hELFNBQU8sSUFBSSxjQUFjLGVBQWU7QUFBQSxJQUE3QjtBQUFBO0FBQStCLFdBQVMsWUFBWTtBQUFBO0FBQUEsRUFBVztBQUMzRTtBQUVBLE1BQU0sdUJBQXVCLE1BQU07QUFDbEMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLHdFQUF3RSxZQUFZO0FBQ3hGLFVBQU0sMkJBQTJCLElBQUksUUFBbUQ7QUFDeEYsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBRUosVUFBTSxTQUFTO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTixTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDakIsV0FBVyxNQUFNO0FBQUEsSUFDbEI7QUFDQSxVQUFNLFFBQVE7QUFBQSxNQUNiLEtBQUs7QUFBQSxRQUNKLGdCQUFnQixNQUFNO0FBQUEsUUFDdEIsUUFBUTtBQUFBLFVBQ1AsUUFBUSxDQUFDO0FBQUEsVUFDVCxXQUFXLENBQUM7QUFBQSxVQUNaLGdCQUFnQixNQUFNLGFBQWEsTUFBTTtBQUFBLFVBQUUsQ0FBQztBQUFBLFFBQzdDO0FBQUEsUUFDQSxtQkFBbUIsTUFBTTtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCLG1CQUFtQixRQUFRLFFBQVEsS0FBSztBQUFBLE1BQ3hDLFFBQVEsTUFBTTtBQUFBLE1BQ2QsWUFBWSxNQUFNO0FBQUEsTUFDbEIsUUFBUSxNQUFNO0FBQUEsTUFDZCxZQUFZLENBQUMsYUFBcUIsZ0JBQXlCLFdBQW9CLDBCQUFvQywyQkFBb0M7QUFDdEosNEJBQW9CO0FBQ3BCLDBCQUFrQjtBQUNsQix1Q0FBK0I7QUFDL0IsdUJBQWUsTUFBTSx5QkFBeUIsS0FBSyxFQUFFLFdBQVcsTUFBTSxVQUFVLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFBQSxNQUMvRjtBQUFBLElBQ0Q7QUFDQSxVQUFNLG1CQUFtQjtBQUFBLE1BQ3hCLG1CQUFtQix5QkFBeUI7QUFBQSxJQUM3QztBQUNBLFVBQU0sV0FBVyxNQUFNLElBQUksSUFBSTtBQUFBLE1BQzlCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUkseUJBQXlCO0FBQUEsTUFDN0IsaUJBQWlCO0FBQUEsSUFDbEIsQ0FBQztBQUVELFVBQU0sU0FBUyxRQUFRLHNCQUFzQixrQkFBa0IsTUFBTSxtQkFBbUIsWUFBWTtBQUVwRyxnQkFBWSxtQkFBbUIsb0JBQW9CO0FBQ25ELGdCQUFZLGlCQUFpQixpQkFBaUI7QUFDOUMsZ0JBQVksOEJBQThCLFlBQVk7QUFBQSxFQUN2RCxDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLDJCQUEyQixJQUFJLFFBQW1EO0FBQ3hGLFVBQU0sZ0JBQWdCLElBQUksUUFBNEI7QUFFdEQsVUFBTSxTQUFTO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTixTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDakIsV0FBVyxNQUFNO0FBQUEsSUFDbEI7QUFDQSxVQUFNLFFBQVE7QUFBQSxNQUNiLEtBQUs7QUFBQSxRQUNKLGdCQUFnQixNQUFNO0FBQUEsUUFDdEIsUUFBUTtBQUFBLFVBQ1AsUUFBUSxDQUFDO0FBQUEsVUFDVCxXQUFXLENBQUM7QUFBQSxVQUNaLGdCQUFnQixNQUFNLGFBQWEsTUFBTTtBQUFBLFVBQUUsQ0FBQztBQUFBLFFBQzdDO0FBQUEsUUFDQSxtQkFBbUIsTUFBTTtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCLG1CQUFtQixRQUFRLFFBQVEsS0FBSztBQUFBLE1BQ3hDLFFBQVEsTUFBTTtBQUFBLE1BQ2QsWUFBWSxNQUFNO0FBQUEsTUFDbEIsUUFBUSxjQUFjO0FBQUEsTUFDdEIsWUFBWSxNQUFNO0FBRWpCLHVCQUFlLE1BQU0sY0FBYyxLQUFLLENBQUMsQ0FBQztBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUNBLFVBQU0sbUJBQW1CO0FBQUEsTUFDeEIsbUJBQW1CLHlCQUF5QjtBQUFBLElBQzdDO0FBQ0EsVUFBTSxXQUFXLE1BQU0sSUFBSSxJQUFJO0FBQUEsTUFDOUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSx5QkFBeUI7QUFBQSxNQUM3QixpQkFBaUI7QUFBQSxJQUNsQixDQUFDO0FBRUQsVUFBTSxTQUFTLE1BQU0sU0FBUyxRQUFRLFVBQVUsa0JBQWtCLElBQUk7QUFFdEUsZ0JBQVksT0FBTyxVQUFVLENBQUM7QUFBQSxFQUMvQixDQUFDO0FBRUQsT0FBSyxnREFBZ0QsWUFBWTtBQUNoRSxVQUFNLDJCQUEyQixJQUFJLFFBQW1EO0FBQ3hGLFVBQU0sZ0JBQWdCLElBQUksUUFBaUU7QUFFM0YsVUFBTSxTQUFTO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTixTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsTUFDakIsV0FBVyxNQUFNO0FBQUEsSUFDbEI7QUFDQSxVQUFNLFFBQVE7QUFBQSxNQUNiLEtBQUs7QUFBQSxRQUNKLGdCQUFnQixNQUFNO0FBQUEsUUFDdEIsUUFBUTtBQUFBLFVBQ1AsUUFBUSxDQUFDO0FBQUEsVUFDVCxXQUFXLENBQUM7QUFBQSxVQUNaLGdCQUFnQixNQUFNLGFBQWEsTUFBTTtBQUFBLFVBQUUsQ0FBQztBQUFBLFFBQzdDO0FBQUEsUUFDQSxtQkFBbUIsTUFBTTtBQUFBLE1BQzFCO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVztBQUFBLE1BQ2hCLG1CQUFtQixRQUFRLFFBQVEsS0FBSztBQUFBLE1BQ3hDLFFBQVEsTUFBTTtBQUFBLE1BQ2QsWUFBWSxNQUFNO0FBQUEsTUFDbEIsUUFBUSxjQUFjO0FBQUEsTUFDdEIsWUFBWSxNQUFNO0FBQ2pCLHVCQUFlLE1BQU0sY0FBYyxLQUFLLEVBQUUsU0FBUyxvQkFBb0IsTUFBTSxJQUFJLENBQUMsQ0FBQztBQUFBLE1BQ3BGO0FBQUEsSUFDRDtBQUNBLFVBQU0sbUJBQW1CO0FBQUEsTUFDeEIsbUJBQW1CLHlCQUF5QjtBQUFBLElBQzdDO0FBQ0EsVUFBTSxXQUFXLE1BQU0sSUFBSSxJQUFJO0FBQUEsTUFDOUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSx5QkFBeUI7QUFBQSxNQUM3QixpQkFBaUI7QUFBQSxJQUNsQixDQUFDO0FBRUQsVUFBTSxTQUFTLE1BQU0sU0FBUyxRQUFRLGVBQWUsa0JBQWtCLElBQUk7QUFFM0UsZ0JBQVksT0FBTyxVQUFVLEdBQUc7QUFBQSxFQUNqQyxDQUFDO0FBRUQsT0FBSyw0RkFBNEYsWUFBWTtBQUs1RyxVQUFNLDJCQUEyQixJQUFJLFFBQW1EO0FBQ3hGLFVBQU0sZ0JBQWdCLElBQUksUUFBNEI7QUFDdEQsVUFBTSxXQUFXO0FBQUEsTUFDaEIsbUJBQW1CLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFBQSxNQUNyQyxRQUFRLE1BQU07QUFBQSxNQUNkLFlBQVksTUFBTTtBQUFBLE1BQ2xCLFFBQVEsY0FBYztBQUFBLE1BQ3RCLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLFlBQVksTUFBTTtBQUFFLGNBQU0sSUFBSSxNQUFNLHlEQUF5RDtBQUFBLE1BQUc7QUFBQSxJQUNqRztBQUNBLFVBQU0sbUJBQW1CO0FBQUEsTUFDeEIsbUJBQW1CLHlCQUF5QjtBQUFBLElBQzdDO0FBQ0EsVUFBTSxXQUFXLE1BQU0sSUFBSSxJQUFJO0FBQUEsTUFDOUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSx5QkFBeUI7QUFBQSxNQUM3QixpQkFBaUI7QUFBQSxJQUNsQixDQUFDO0FBRUQsVUFBTSxTQUFTLE1BQU0sU0FBUyxRQUFRLHNCQUFzQixrQkFBa0IsSUFBSTtBQUVsRixnQkFBWSxPQUFPLFVBQVUsQ0FBQztBQUM5QixnQkFBWSxPQUFPLFFBQVEsTUFBUztBQUNwQyxnQkFBWSxPQUFPLHVCQUF1Qiw0QkFBNEI7QUFBQSxFQUN2RSxDQUFDO0FBRUQsT0FBSyx1RkFBdUYsWUFBWTtBQUN2RyxVQUFNLDJCQUEyQixJQUFJLFFBQW1EO0FBQ3hGLFVBQU0sV0FBVztBQUFBLE1BQ2hCLG1CQUFtQixRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQUEsTUFDckMsUUFBUSxNQUFNO0FBQUEsTUFDZCxZQUFZLE1BQU07QUFBQSxNQUNsQixRQUFRLE1BQU07QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxNQUNWLFlBQVksTUFBTTtBQUFFLGNBQU0sSUFBSSxNQUFNLDJEQUEyRDtBQUFBLE1BQUc7QUFBQSxJQUNuRztBQUNBLFVBQU0sbUJBQW1CO0FBQUEsTUFDeEIsbUJBQW1CLHlCQUF5QjtBQUFBLElBQzdDO0FBQ0EsVUFBTSxXQUFXLE1BQU0sSUFBSSxJQUFJO0FBQUEsTUFDOUI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSSx5QkFBeUI7QUFBQSxNQUM3QixpQkFBaUI7QUFBQSxJQUNsQixDQUFDO0FBRUQsVUFBTTtBQUFBLE1BQ0wsTUFBTSxTQUFTLFFBQVEsY0FBYyxrQkFBa0IsSUFBSTtBQUFBLE1BQzNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
