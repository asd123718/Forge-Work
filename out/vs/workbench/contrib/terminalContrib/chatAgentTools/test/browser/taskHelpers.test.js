import * as assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { collectTerminalResults } from "../../browser/taskHelpers.js";
import { OutputMonitorState } from "../../browser/tools/monitoring/types.js";
suite("Task Helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("collectTerminalResults reads output from invocation start marker", async () => {
    const lines = ["old output", "more old output", "new output line 1", "new output line 2"];
    let markerDisposed = false;
    const marker = {
      line: 2,
      dispose: () => {
        markerDisposed = true;
      }
    };
    const terminal = {
      instanceId: 1,
      title: "task-terminal",
      shellLaunchConfig: { name: "task-terminal" },
      registerMarker: () => marker,
      xterm: {
        raw: {
          buffer: {
            active: {
              length: lines.length,
              getLine: (y) => ({ translateToString: () => lines[y] })
            }
          }
        }
      }
    };
    const task = {
      _label: "my-task",
      configurationProperties: {}
    };
    const invocationContext = {
      sessionResource: URI.parse("vscode-chat-session://test")
    };
    const instantiationService = {
      createInstance: (_ctor, execution) => {
        const didFinishEmitter = new Emitter();
        const monitor = {
          onDidFinishCommand: didFinishEmitter.event,
          pollingResult: {
            output: execution.getOutput(),
            pollDurationMs: 1,
            state: OutputMonitorState.Idle
          },
          outputMonitorTelemetryCounters: {
            inputToolManualAcceptCount: 0,
            inputToolManualRejectCount: 0,
            inputToolManualChars: 0,
            inputToolAutoAcceptCount: 0,
            inputToolAutoChars: 0,
            inputToolManualShownCount: 0,
            inputToolFreeFormInputShownCount: 0,
            inputToolFreeFormInputCount: 0
          },
          dispose: () => didFinishEmitter.dispose()
        };
        setTimeout(() => didFinishEmitter.fire(), 0);
        return monitor;
      }
    };
    const disposableStore = new DisposableStore();
    const results = await collectTerminalResults(
      [terminal],
      task,
      instantiationService,
      invocationContext,
      { report: () => {
      } },
      CancellationToken.None,
      disposableStore
    );
    disposableStore.dispose();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].output, "new output line 1\nnew output line 2");
    assert.strictEqual(markerDisposed, true);
  });
  test("collectTerminalResults uses provided pre-run marker when present", async () => {
    const lines = ["old output", "new output line 1", "new output line 2", "* Terminal will be reused by tasks, press any key to close it."];
    let defaultMarkerDisposed = false;
    let preRunMarkerDisposed = false;
    const defaultMarker = {
      line: 3,
      dispose: () => {
        defaultMarkerDisposed = true;
      }
    };
    const preRunMarker = {
      id: 1,
      line: 1,
      isDisposed: false,
      onDispose: new Emitter().event,
      dispose: () => {
        preRunMarkerDisposed = true;
      }
    };
    const terminal = {
      instanceId: 1,
      title: "task-terminal",
      shellLaunchConfig: { name: "task-terminal" },
      registerMarker: () => defaultMarker,
      xterm: {
        raw: {
          buffer: {
            active: {
              length: lines.length,
              getLine: (y) => ({ translateToString: () => lines[y] })
            }
          }
        }
      }
    };
    const task = {
      _label: "my-task",
      configurationProperties: {}
    };
    const invocationContext = {
      sessionResource: URI.parse("vscode-chat-session://test")
    };
    const instantiationService = {
      createInstance: (_ctor, execution) => {
        const didFinishEmitter = new Emitter();
        const monitor = {
          onDidFinishCommand: didFinishEmitter.event,
          pollingResult: {
            output: execution.getOutput(),
            pollDurationMs: 1,
            state: OutputMonitorState.Idle
          },
          outputMonitorTelemetryCounters: {
            inputToolManualAcceptCount: 0,
            inputToolManualRejectCount: 0,
            inputToolManualChars: 0,
            inputToolAutoAcceptCount: 0,
            inputToolAutoChars: 0,
            inputToolManualShownCount: 0,
            inputToolFreeFormInputShownCount: 0,
            inputToolFreeFormInputCount: 0
          },
          dispose: () => didFinishEmitter.dispose()
        };
        setTimeout(() => didFinishEmitter.fire(), 0);
        return monitor;
      }
    };
    const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
    startMarkersByTerminalInstanceId.set(terminal.instanceId, preRunMarker);
    const disposableStore = new DisposableStore();
    const results = await collectTerminalResults(
      [terminal],
      task,
      instantiationService,
      invocationContext,
      { report: () => {
      } },
      CancellationToken.None,
      disposableStore,
      void 0,
      void 0,
      void 0,
      startMarkersByTerminalInstanceId
    );
    disposableStore.dispose();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].output, "new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.");
    assert.strictEqual(preRunMarkerDisposed, true);
    assert.strictEqual(defaultMarkerDisposed, false);
  });
  test("collectTerminalResults reads full output when pre-run marker map has no marker for terminal", async () => {
    const lines = ["new output line 1", "new output line 2", "* Terminal will be reused by tasks, press any key to close it."];
    let defaultMarkerDisposed = false;
    const defaultMarker = {
      line: 1,
      dispose: () => {
        defaultMarkerDisposed = true;
      }
    };
    const terminal = {
      instanceId: 1,
      title: "task-terminal",
      shellLaunchConfig: { name: "task-terminal" },
      registerMarker: () => defaultMarker,
      xterm: {
        raw: {
          buffer: {
            active: {
              length: lines.length,
              getLine: (y) => ({ translateToString: () => lines[y] })
            }
          }
        }
      }
    };
    const task = {
      _label: "my-task",
      configurationProperties: {}
    };
    const invocationContext = {
      sessionResource: URI.parse("vscode-chat-session://test")
    };
    const instantiationService = {
      createInstance: (_ctor, execution) => {
        const didFinishEmitter = new Emitter();
        const monitor = {
          onDidFinishCommand: didFinishEmitter.event,
          pollingResult: {
            output: execution.getOutput(),
            pollDurationMs: 1,
            state: OutputMonitorState.Idle
          },
          outputMonitorTelemetryCounters: {
            inputToolManualAcceptCount: 0,
            inputToolManualRejectCount: 0,
            inputToolManualChars: 0,
            inputToolAutoAcceptCount: 0,
            inputToolAutoChars: 0,
            inputToolManualShownCount: 0,
            inputToolFreeFormInputShownCount: 0,
            inputToolFreeFormInputCount: 0
          },
          dispose: () => didFinishEmitter.dispose()
        };
        setTimeout(() => didFinishEmitter.fire(), 0);
        return monitor;
      }
    };
    const startMarkersByTerminalInstanceId = /* @__PURE__ */ new Map();
    const disposableStore = new DisposableStore();
    const results = await collectTerminalResults(
      [terminal],
      task,
      instantiationService,
      invocationContext,
      { report: () => {
      } },
      CancellationToken.None,
      disposableStore,
      void 0,
      void 0,
      void 0,
      startMarkersByTerminalInstanceId
    );
    disposableStore.dispose();
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].output, "new output line 1\nnew output line 2\n* Terminal will be reused by tasks, press any key to close it.");
    assert.strictEqual(defaultMarkerDisposed, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHRhc2tIZWxwZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVG9vbEludm9jYXRpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXNrIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGFza3MvY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBjb2xsZWN0VGVybWluYWxSZXN1bHRzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90YXNrSGVscGVycy5qcyc7XG5pbXBvcnQgeyBJRXhlY3V0aW9uLCBPdXRwdXRNb25pdG9yU3RhdGUgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL21vbml0b3JpbmcvdHlwZXMuanMnO1xuXG5zdWl0ZSgnVGFzayBIZWxwZXJzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjb2xsZWN0VGVybWluYWxSZXN1bHRzIHJlYWRzIG91dHB1dCBmcm9tIGludm9jYXRpb24gc3RhcnQgbWFya2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gWydvbGQgb3V0cHV0JywgJ21vcmUgb2xkIG91dHB1dCcsICduZXcgb3V0cHV0IGxpbmUgMScsICduZXcgb3V0cHV0IGxpbmUgMiddO1xuXHRcdGxldCBtYXJrZXJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IG1hcmtlciA9IHtcblx0XHRcdGxpbmU6IDIsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IG1hcmtlckRpc3Bvc2VkID0gdHJ1ZTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgdGVybWluYWwgPSB7XG5cdFx0XHRpbnN0YW5jZUlkOiAxLFxuXHRcdFx0dGl0bGU6ICd0YXNrLXRlcm1pbmFsJyxcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnOiB7IG5hbWU6ICd0YXNrLXRlcm1pbmFsJyB9LFxuXHRcdFx0cmVnaXN0ZXJNYXJrZXI6ICgpID0+IG1hcmtlcixcblx0XHRcdHh0ZXJtOiB7XG5cdFx0XHRcdHJhdzoge1xuXHRcdFx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRcdFx0YWN0aXZlOiB7XG5cdFx0XHRcdFx0XHRcdGxlbmd0aDogbGluZXMubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHRnZXRMaW5lOiAoeTogbnVtYmVyKSA9PiAoeyB0cmFuc2xhdGVUb1N0cmluZzogKCkgPT4gbGluZXNbeV0gfSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0Y29uc3QgdGFzayA9IHtcblx0XHRcdF9sYWJlbDogJ215LXRhc2snLFxuXHRcdFx0Y29uZmlndXJhdGlvblByb3BlcnRpZXM6IHt9XG5cdFx0fSBhcyBUYXNrO1xuXHRcdGNvbnN0IGludm9jYXRpb25Db250ZXh0OiBJVG9vbEludm9jYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0Jylcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlSW5zdGFuY2U6IChfY3RvcjogdW5rbm93biwgZXhlY3V0aW9uOiBJRXhlY3V0aW9uKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpZEZpbmlzaEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0XHRjb25zdCBtb25pdG9yID0ge1xuXHRcdFx0XHRcdG9uRGlkRmluaXNoQ29tbWFuZDogZGlkRmluaXNoRW1pdHRlci5ldmVudCxcblx0XHRcdFx0XHRwb2xsaW5nUmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRvdXRwdXQ6IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKSxcblx0XHRcdFx0XHRcdHBvbGxEdXJhdGlvbk1zOiAxLFxuXHRcdFx0XHRcdFx0c3RhdGU6IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM6IHtcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsUmVqZWN0Q291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxDaGFyczogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEF1dG9BY2NlcHRDb3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEF1dG9DaGFyczogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbFNob3duQ291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRDb3VudDogMCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpZEZpbmlzaEVtaXR0ZXIuZGlzcG9zZSgpXG5cdFx0XHRcdH07XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gZGlkRmluaXNoRW1pdHRlci5maXJlKCksIDApO1xuXHRcdFx0XHRyZXR1cm4gbW9uaXRvcjtcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBjb2xsZWN0VGVybWluYWxSZXN1bHRzKFxuXHRcdFx0W3Rlcm1pbmFsXSxcblx0XHRcdHRhc2ssXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdGludm9jYXRpb25Db250ZXh0LFxuXHRcdFx0eyByZXBvcnQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdGRpc3Bvc2FibGVTdG9yZVxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNbMF0ub3V0cHV0LCAnbmV3IG91dHB1dCBsaW5lIDFcXG5uZXcgb3V0cHV0IGxpbmUgMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJEaXNwb3NlZCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxlY3RUZXJtaW5hbFJlc3VsdHMgdXNlcyBwcm92aWRlZCBwcmUtcnVuIG1hcmtlciB3aGVuIHByZXNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbJ29sZCBvdXRwdXQnLCAnbmV3IG91dHB1dCBsaW5lIDEnLCAnbmV3IG91dHB1dCBsaW5lIDInLCAnKiBUZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcywgcHJlc3MgYW55IGtleSB0byBjbG9zZSBpdC4nXTtcblx0XHRsZXQgZGVmYXVsdE1hcmtlckRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0bGV0IHByZVJ1bk1hcmtlckRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0Y29uc3QgZGVmYXVsdE1hcmtlciA9IHtcblx0XHRcdGxpbmU6IDMsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IGRlZmF1bHRNYXJrZXJEaXNwb3NlZCA9IHRydWU7IH1cblx0XHR9O1xuXHRcdGNvbnN0IHByZVJ1bk1hcmtlciA9IHtcblx0XHRcdGlkOiAxLFxuXHRcdFx0bGluZTogMSxcblx0XHRcdGlzRGlzcG9zZWQ6IGZhbHNlLFxuXHRcdFx0b25EaXNwb3NlOiBuZXcgRW1pdHRlcjx2b2lkPigpLmV2ZW50LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyBwcmVSdW5NYXJrZXJEaXNwb3NlZCA9IHRydWU7IH1cblx0XHR9O1xuXHRcdGNvbnN0IHRlcm1pbmFsID0ge1xuXHRcdFx0aW5zdGFuY2VJZDogMSxcblx0XHRcdHRpdGxlOiAndGFzay10ZXJtaW5hbCcsXG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZzogeyBuYW1lOiAndGFzay10ZXJtaW5hbCcgfSxcblx0XHRcdHJlZ2lzdGVyTWFya2VyOiAoKSA9PiBkZWZhdWx0TWFya2VyLFxuXHRcdFx0eHRlcm06IHtcblx0XHRcdFx0cmF3OiB7XG5cdFx0XHRcdFx0YnVmZmVyOiB7XG5cdFx0XHRcdFx0XHRhY3RpdmU6IHtcblx0XHRcdFx0XHRcdFx0bGVuZ3RoOiBsaW5lcy5sZW5ndGgsXG5cdFx0XHRcdFx0XHRcdGdldExpbmU6ICh5OiBudW1iZXIpID0+ICh7IHRyYW5zbGF0ZVRvU3RyaW5nOiAoKSA9PiBsaW5lc1t5XSB9KVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJVGVybWluYWxJbnN0YW5jZTtcblx0XHRjb25zdCB0YXNrID0ge1xuXHRcdFx0X2xhYmVsOiAnbXktdGFzaycsXG5cdFx0XHRjb25maWd1cmF0aW9uUHJvcGVydGllczoge31cblx0XHR9IGFzIFRhc2s7XG5cdFx0Y29uc3QgaW52b2NhdGlvbkNvbnRleHQ6IElUb29sSW52b2NhdGlvbkNvbnRleHQgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL3Rlc3QnKVxuXHRcdH07XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB7XG5cdFx0XHRjcmVhdGVJbnN0YW5jZTogKF9jdG9yOiB1bmtub3duLCBleGVjdXRpb246IElFeGVjdXRpb24pID0+IHtcblx0XHRcdFx0Y29uc3QgZGlkRmluaXNoRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRcdGNvbnN0IG1vbml0b3IgPSB7XG5cdFx0XHRcdFx0b25EaWRGaW5pc2hDb21tYW5kOiBkaWRGaW5pc2hFbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHBvbGxpbmdSZXN1bHQ6IHtcblx0XHRcdFx0XHRcdG91dHB1dDogZXhlY3V0aW9uLmdldE91dHB1dCgpLFxuXHRcdFx0XHRcdFx0cG9sbER1cmF0aW9uTXM6IDEsXG5cdFx0XHRcdFx0XHRzdGF0ZTogT3V0cHV0TW9uaXRvclN0YXRlLklkbGVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG91dHB1dE1vbml0b3JUZWxlbWV0cnlDb3VudGVyczoge1xuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsQWNjZXB0Q291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxSZWplY3RDb3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbENoYXJzOiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sQXV0b0FjY2VwdENvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sQXV0b0NoYXJzOiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsU2hvd25Db3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRTaG93bkNvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sRnJlZUZvcm1JbnB1dENvdW50OiAwLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gZGlkRmluaXNoRW1pdHRlci5kaXNwb3NlKClcblx0XHRcdFx0fTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiBkaWRGaW5pc2hFbWl0dGVyLmZpcmUoKSwgMCk7XG5cdFx0XHRcdHJldHVybiBtb25pdG9yO1xuXHRcdFx0fVxuXHRcdH0gYXMgdW5rbm93biBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0XHRjb25zdCBzdGFydE1hcmtlcnNCeVRlcm1pbmFsSW5zdGFuY2VJZCA9IG5ldyBNYXA8bnVtYmVyLCBSZXR1cm5UeXBlPElUZXJtaW5hbEluc3RhbmNlWydyZWdpc3Rlck1hcmtlciddPj4oKTtcblx0XHRzdGFydE1hcmtlcnNCeVRlcm1pbmFsSW5zdGFuY2VJZC5zZXQodGVybWluYWwuaW5zdGFuY2VJZCwgcHJlUnVuTWFya2VyIGFzIFJldHVyblR5cGU8SVRlcm1pbmFsSW5zdGFuY2VbJ3JlZ2lzdGVyTWFya2VyJ10+KTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgY29sbGVjdFRlcm1pbmFsUmVzdWx0cyhcblx0XHRcdFt0ZXJtaW5hbF0sXG5cdFx0XHR0YXNrLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRpbnZvY2F0aW9uQ29udGV4dCxcblx0XHRcdHsgcmVwb3J0OiAoKSA9PiB7IH0gfSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRzdGFydE1hcmtlcnNCeVRlcm1pbmFsSW5zdGFuY2VJZFxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHNbMF0ub3V0cHV0LCAnbmV3IG91dHB1dCBsaW5lIDFcXG5uZXcgb3V0cHV0IGxpbmUgMlxcbiogVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXQuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZVJ1bk1hcmtlckRpc3Bvc2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdE1hcmtlckRpc3Bvc2VkLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxlY3RUZXJtaW5hbFJlc3VsdHMgcmVhZHMgZnVsbCBvdXRwdXQgd2hlbiBwcmUtcnVuIG1hcmtlciBtYXAgaGFzIG5vIG1hcmtlciBmb3IgdGVybWluYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBbJ25ldyBvdXRwdXQgbGluZSAxJywgJ25ldyBvdXRwdXQgbGluZSAyJywgJyogVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXQuJ107XG5cdFx0bGV0IGRlZmF1bHRNYXJrZXJEaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IGRlZmF1bHRNYXJrZXIgPSB7XG5cdFx0XHRsaW5lOiAxLFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyBkZWZhdWx0TWFya2VyRGlzcG9zZWQgPSB0cnVlOyB9XG5cdFx0fTtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHtcblx0XHRcdGluc3RhbmNlSWQ6IDEsXG5cdFx0XHR0aXRsZTogJ3Rhc2stdGVybWluYWwnLFxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWc6IHsgbmFtZTogJ3Rhc2stdGVybWluYWwnIH0sXG5cdFx0XHRyZWdpc3Rlck1hcmtlcjogKCkgPT4gZGVmYXVsdE1hcmtlcixcblx0XHRcdHh0ZXJtOiB7XG5cdFx0XHRcdHJhdzoge1xuXHRcdFx0XHRcdGJ1ZmZlcjoge1xuXHRcdFx0XHRcdFx0YWN0aXZlOiB7XG5cdFx0XHRcdFx0XHRcdGxlbmd0aDogbGluZXMubGVuZ3RoLFxuXHRcdFx0XHRcdFx0XHRnZXRMaW5lOiAoeTogbnVtYmVyKSA9PiAoeyB0cmFuc2xhdGVUb1N0cmluZzogKCkgPT4gbGluZXNbeV0gfSlcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSVRlcm1pbmFsSW5zdGFuY2U7XG5cdFx0Y29uc3QgdGFzayA9IHtcblx0XHRcdF9sYWJlbDogJ215LXRhc2snLFxuXHRcdFx0Y29uZmlndXJhdGlvblByb3BlcnRpZXM6IHt9XG5cdFx0fSBhcyBUYXNrO1xuXHRcdGNvbnN0IGludm9jYXRpb25Db250ZXh0OiBJVG9vbEludm9jYXRpb25Db250ZXh0ID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly90ZXN0Jylcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0ge1xuXHRcdFx0Y3JlYXRlSW5zdGFuY2U6IChfY3RvcjogdW5rbm93biwgZXhlY3V0aW9uOiBJRXhlY3V0aW9uKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpZEZpbmlzaEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0XHRjb25zdCBtb25pdG9yID0ge1xuXHRcdFx0XHRcdG9uRGlkRmluaXNoQ29tbWFuZDogZGlkRmluaXNoRW1pdHRlci5ldmVudCxcblx0XHRcdFx0XHRwb2xsaW5nUmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRvdXRwdXQ6IGV4ZWN1dGlvbi5nZXRPdXRwdXQoKSxcblx0XHRcdFx0XHRcdHBvbGxEdXJhdGlvbk1zOiAxLFxuXHRcdFx0XHRcdFx0c3RhdGU6IE91dHB1dE1vbml0b3JTdGF0ZS5JZGxlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRvdXRwdXRNb25pdG9yVGVsZW1ldHJ5Q291bnRlcnM6IHtcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbEFjY2VwdENvdW50OiAwLFxuXHRcdFx0XHRcdFx0aW5wdXRUb29sTWFudWFsUmVqZWN0Q291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xNYW51YWxDaGFyczogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEF1dG9BY2NlcHRDb3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEF1dG9DaGFyczogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbE1hbnVhbFNob3duQ291bnQ6IDAsXG5cdFx0XHRcdFx0XHRpbnB1dFRvb2xGcmVlRm9ybUlucHV0U2hvd25Db3VudDogMCxcblx0XHRcdFx0XHRcdGlucHV0VG9vbEZyZWVGb3JtSW5wdXRDb3VudDogMCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpZEZpbmlzaEVtaXR0ZXIuZGlzcG9zZSgpXG5cdFx0XHRcdH07XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4gZGlkRmluaXNoRW1pdHRlci5maXJlKCksIDApO1xuXHRcdFx0XHRyZXR1cm4gbW9uaXRvcjtcblx0XHRcdH1cblx0XHR9IGFzIHVua25vd24gYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0Y29uc3Qgc3RhcnRNYXJrZXJzQnlUZXJtaW5hbEluc3RhbmNlSWQgPSBuZXcgTWFwPG51bWJlciwgUmV0dXJuVHlwZTxJVGVybWluYWxJbnN0YW5jZVsncmVnaXN0ZXJNYXJrZXInXT4+KCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IGNvbGxlY3RUZXJtaW5hbFJlc3VsdHMoXG5cdFx0XHRbdGVybWluYWxdLFxuXHRcdFx0dGFzayxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0aW52b2NhdGlvbkNvbnRleHQsXG5cdFx0XHR7IHJlcG9ydDogKCkgPT4geyB9IH0sXG5cdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLFxuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0c3RhcnRNYXJrZXJzQnlUZXJtaW5hbEluc3RhbmNlSWRcblx0XHQpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzWzBdLm91dHB1dCwgJ25ldyBvdXRwdXQgbGluZSAxXFxubmV3IG91dHB1dCBsaW5lIDJcXG4qIFRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0LicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0TWFya2VyRGlzcG9zZWQsIGZhbHNlKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBRXBCLFNBQVMsK0NBQStDO0FBSXhELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQXFCLDBCQUEwQjtBQUUvQyxNQUFNLGdCQUFnQixNQUFNO0FBQzNCLDBDQUF3QztBQUV4QyxPQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFVBQU0sUUFBUSxDQUFDLGNBQWMsbUJBQW1CLHFCQUFxQixtQkFBbUI7QUFDeEYsUUFBSSxpQkFBaUI7QUFDckIsVUFBTSxTQUFTO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTixTQUFTLE1BQU07QUFBRSx5QkFBaUI7QUFBQSxNQUFNO0FBQUEsSUFDekM7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQixZQUFZO0FBQUEsTUFDWixPQUFPO0FBQUEsTUFDUCxtQkFBbUIsRUFBRSxNQUFNLGdCQUFnQjtBQUFBLE1BQzNDLGdCQUFnQixNQUFNO0FBQUEsTUFDdEIsT0FBTztBQUFBLFFBQ04sS0FBSztBQUFBLFVBQ0osUUFBUTtBQUFBLFlBQ1AsUUFBUTtBQUFBLGNBQ1AsUUFBUSxNQUFNO0FBQUEsY0FDZCxTQUFTLENBQUMsT0FBZSxFQUFFLG1CQUFtQixNQUFNLE1BQU0sQ0FB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
