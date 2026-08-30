var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { raceTimeout } from "../../../base/common/async.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { ILogService, ILoggerService } from "../../log/common/log.js";
import { RemoteLoggerChannelClient } from "../../log/common/logIpc.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { AgentHostStartError } from "../common/agent.js";
import { reportAgentHostProcessError } from "../common/agentHostProcessTelemetry.js";
import { AgentHostLaunchKind } from "../common/agentHostTelemetry.js";
import { AgentHostIpcChannels } from "../common/agentService.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxRestarts"] = 5] = "MaxRestarts";
  Constants2[Constants2["ShutdownTimeoutMs"] = 6e3] = "ShutdownTimeoutMs";
  return Constants2;
})(Constants || {});
const WINDOWS_EXPECTED_SHUTDOWN_EXIT_CODES = /* @__PURE__ */ new Set([
  3221226091,
  // STATUS_DLL_INIT_FAILED_LOGOFF
  1073807364
  // DBG_TERMINATE_PROCESS
]);
function isExpectedWindowsShutdownExit(platform, code) {
  return platform === "win32" && WINDOWS_EXPECTED_SHUTDOWN_EXIT_CODES.has(code >>> 0);
}
let AgentHostProcessManager = class extends Disposable {
  constructor(_starter, _platform = process.platform, _logService, _loggerService, _telemetryService) {
    super();
    this._starter = _starter;
    this._platform = _platform;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._telemetryService = _telemetryService;
    this._wasQuitRequested = false;
    this._restartCount = 0;
    this._restartLimitReached = false;
    this._connectionStore = this._register(new MutableDisposable());
    this._register(this._starter);
    if (this._starter.onRequestConnection) {
      this._register(this._starter.onRequestConnection((request) => request.waitUntil(this._ensureStarted())));
    }
    if (this._starter.onRequestRestart) {
      this._register(this._starter.onRequestRestart(() => {
        this.restart().catch((error) => this._logService.error("AgentHostProcessManager: failed to restart agent host", error));
      }));
    }
    if (this._starter.onWillShutdown) {
      this._register(this._starter.onWillShutdown((request) => {
        this._wasQuitRequested = true;
        request.join(this._shutdown().finally(() => this.dispose()));
      }));
    }
  }
  _ensureStarted() {
    if (this._wasQuitRequested || this._store.isDisposed) {
      return Promise.reject(new Error("Agent Host process manager is shutting down."));
    }
    if (this._restartLimitReached) {
      return Promise.reject(new AgentHostStartError(`Agent Host process stopped after ${5 /* MaxRestarts */} restarts.`, true));
    }
    if (this._connection) {
      return Promise.resolve();
    }
    if (!this._startPromise) {
      return this._setStartPromise(this._start());
    }
    return this._startPromise;
  }
  /**
   * Explicitly restarts the agent host process, discarding the current connection
   * and resetting crash recovery bookkeeping.
   */
  restart() {
    if (this._wasQuitRequested || this._store.isDisposed) {
      return Promise.reject(new Error("Agent Host process manager is shutting down."));
    }
    this._restartCount = 0;
    this._restartLimitReached = false;
    const pendingStart = this._startPromise;
    const restartPromise = (async () => {
      if (pendingStart) {
        try {
          await pendingStart;
        } catch {
        }
      }
      if (this._wasQuitRequested || this._store.isDisposed) {
        return;
      }
      this._logService.info("AgentHostProcessManager: explicitly restarting agent host");
      const connection = this._connection;
      if (connection) {
        this._connection = void 0;
        try {
          await raceTimeout(connection.shutdown(), 6e3 /* ShutdownTimeoutMs */, () => {
            this._logService.warn(`AgentHostProcessManager: agent host did not shut down before restart within ${6e3 /* ShutdownTimeoutMs */}ms; terminating it`);
          });
        } catch (error) {
          this._logService.error("AgentHostProcessManager: failed to shut down agent host gracefully before restart", error);
        } finally {
          this._clearConnection(connection);
        }
      }
      await this._start();
    })();
    this._setStartPromise(restartPromise);
    return restartPromise;
  }
  _setStartPromise(startPromise) {
    this._startPromise = startPromise;
    void startPromise.then(
      () => {
        if (this._startPromise === startPromise) {
          this._startPromise = void 0;
        }
      },
      () => {
        if (this._startPromise === startPromise) {
          this._startPromise = void 0;
        }
      }
    );
    return startPromise;
  }
  async _start() {
    let connection;
    try {
      const startedConnection = await this._starter.start();
      connection = startedConnection;
      if (this._store.isDisposed || this._wasQuitRequested) {
        startedConnection.store.dispose();
        throw new Error("Agent Host process manager disposed during startup.");
      }
      this._connection = startedConnection;
      this._connectionStore.value = startedConnection.store;
      this._logService.info("AgentHostProcessManager: agent host started");
      startedConnection.store.add(new RemoteLoggerChannelClient(this._loggerService, startedConnection.client.getChannel(AgentHostIpcChannels.Logger)));
      startedConnection.store.add(startedConnection.onDidProcessExit((e) => this._handleProcessExit(startedConnection, e.code)));
    } catch (error) {
      this._clearConnection(connection);
      if (!this._store.isDisposed && !this._wasQuitRequested) {
        this._logService.error("AgentHostProcessManager: failed to start agent host", error);
        reportAgentHostProcessError(this._telemetryService, {
          hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
          kind: "startFailed",
          restartCount: this._restartCount,
          willRestart: false
        }, error);
      }
      throw error;
    }
  }
  /**
   * Drops the given connection, disposing it exactly once regardless of whether it is
   * still the connection tracked by {@link _connectionStore}.
   */
  _clearConnection(connection) {
    if (this._connection === connection) {
      this._connection = void 0;
    }
    if (!connection) {
      return;
    }
    if (this._connectionStore.value === connection.store) {
      this._connectionStore.clear();
    } else {
      connection.store.dispose();
    }
  }
  _handleProcessExit(connection, code) {
    if (this._connection !== connection) {
      return;
    }
    this._clearConnection(connection);
    if (this._wasQuitRequested || this._store.isDisposed) {
      return;
    }
    if (isExpectedWindowsShutdownExit(this._platform, code)) {
      this._logService.info(`AgentHostProcessManager: agent host terminated with expected Windows shutdown code ${code}`);
      return;
    }
    const willRestart = this._restartCount < 5 /* MaxRestarts */;
    reportAgentHostProcessError(this._telemetryService, {
      hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
      kind: "unexpectedExit",
      code,
      restartCount: this._restartCount,
      willRestart
    });
    if (willRestart) {
      this._logService.error(`AgentHostProcessManager: agent host terminated unexpectedly with code ${code}`);
      this._restartCount++;
      const pendingLifecycle = this._startPromise;
      const restart = () => {
        if (!this._connection && !this._wasQuitRequested && !this._store.isDisposed) {
          void this._ensureStarted().catch((error) => this._logService.trace("AgentHostProcessManager: automatic restart failed", error));
        }
      };
      if (pendingLifecycle) {
        void pendingLifecycle.then(restart, restart);
      } else {
        restart();
      }
    } else {
      this._restartLimitReached = true;
      this._logService.error(`AgentHostProcessManager: agent host terminated with code ${code}, giving up after ${5 /* MaxRestarts */} restarts`);
    }
  }
  async _shutdown() {
    try {
      await raceTimeout(this._shutdownGracefully(), 6e3 /* ShutdownTimeoutMs */, () => {
        this._logService.warn(`AgentHostProcessManager: agent host did not shut down within ${6e3 /* ShutdownTimeoutMs */}ms; terminating it`);
      });
    } catch (error) {
      this._logService.error("AgentHostProcessManager: failed to shut down agent host gracefully", error);
    } finally {
      this._clearConnection(this._connection);
    }
  }
  async _shutdownGracefully() {
    try {
      await this._startPromise;
    } catch (error) {
      this._logService.trace("AgentHostProcessManager: startup did not complete before shutdown", error);
      return;
    }
    await this._connection?.shutdown();
  }
};
AgentHostProcessManager = __decorateClass([
  __decorateParam(2, ILogService),
  __decorateParam(3, ILoggerService),
  __decorateParam(4, ITelemetryService)
], AgentHostProcessManager);
export {
  AgentHostProcessManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFJlbW90ZUxvZ2dlckNoYW5uZWxDbGllbnQgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZ0lwYy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXJ0RXJyb3IsIElBZ2VudEhvc3RDb25uZWN0aW9uLCBJQWdlbnRIb3N0U3RhcnRlciB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyByZXBvcnRBZ2VudEhvc3RQcm9jZXNzRXJyb3IgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0UHJvY2Vzc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RMYXVuY2hLaW5kIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJcGNDaGFubmVscyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuXG5lbnVtIENvbnN0YW50cyB7XG5cdE1heFJlc3RhcnRzID0gNSxcblx0U2h1dGRvd25UaW1lb3V0TXMgPSA2MDAwLFxufVxuXG5jb25zdCBXSU5ET1dTX0VYUEVDVEVEX1NIVVRET1dOX0VYSVRfQ09ERVMgPSBuZXcgU2V0KFtcblx0MHhDMDAwMDI2QiwgLy8gU1RBVFVTX0RMTF9JTklUX0ZBSUxFRF9MT0dPRkZcblx0MHg0MDAxMDAwNCwgLy8gREJHX1RFUk1JTkFURV9QUk9DRVNTXG5dKTtcblxuZnVuY3Rpb24gaXNFeHBlY3RlZFdpbmRvd3NTaHV0ZG93bkV4aXQocGxhdGZvcm06IE5vZGVKUy5QbGF0Zm9ybSwgY29kZTogbnVtYmVyKTogYm9vbGVhbiB7XG5cdHJldHVybiBwbGF0Zm9ybSA9PT0gJ3dpbjMyJyAmJiBXSU5ET1dTX0VYUEVDVEVEX1NIVVRET1dOX0VYSVRfQ09ERVMuaGFzKGNvZGUgPj4+IDApO1xufVxuXG4vKipcbiAqIE1haW4tcHJvY2VzcyBzZXJ2aWNlIHRoYXQgbWFuYWdlcyB0aGUgYWdlbnQgaG9zdCB1dGlsaXR5IHByb2Nlc3MgbGlmZWN5Y2xlXG4gKiAobGF6eSBzdGFydCwgY3Jhc2ggcmVjb3ZlcnksIGxvZ2dlciBmb3J3YXJkaW5nKS4gVGhlIHJlbmRlcmVyIGNvbW11bmljYXRlc1xuICogd2l0aCB0aGUgdXRpbGl0eSBwcm9jZXNzIGRpcmVjdGx5IHZpYSBNZXNzYWdlUG9ydCAtIHRoaXMgY2xhc3MgZG9lcyBub3RcbiAqIHJlbGF5IGFueSBhZ2VudCBzZXJ2aWNlIGNhbGxzLlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF93YXNRdWl0UmVxdWVzdGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX3Jlc3RhcnRDb3VudCA9IDA7XG5cdHByaXZhdGUgX3Jlc3RhcnRMaW1pdFJlYWNoZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY29ubmVjdGlvbjogSUFnZW50SG9zdENvbm5lY3Rpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N0YXJ0UHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdGlvblN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRlcjogSUFnZW50SG9zdFN0YXJ0ZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcGxhdGZvcm06IE5vZGVKUy5QbGF0Zm9ybSA9IHByb2Nlc3MucGxhdGZvcm0sXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGFydGVyKTtcblxuXHRcdGlmICh0aGlzLl9zdGFydGVyLm9uUmVxdWVzdENvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXJ0ZXIub25SZXF1ZXN0Q29ubmVjdGlvbihyZXF1ZXN0ID0+IHJlcXVlc3Qud2FpdFVudGlsKHRoaXMuX2Vuc3VyZVN0YXJ0ZWQoKSkpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N0YXJ0ZXIub25SZXF1ZXN0UmVzdGFydCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhcnRlci5vblJlcXVlc3RSZXN0YXJ0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5yZXN0YXJ0KCkuY2F0Y2goZXJyb3IgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcignQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGZhaWxlZCB0byByZXN0YXJ0IGFnZW50IGhvc3QnLCBlcnJvcikpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdGFydGVyLm9uV2lsbFNodXRkb3duKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGFydGVyLm9uV2lsbFNodXRkb3duKHJlcXVlc3QgPT4ge1xuXHRcdFx0XHR0aGlzLl93YXNRdWl0UmVxdWVzdGVkID0gdHJ1ZTtcblx0XHRcdFx0cmVxdWVzdC5qb2luKHRoaXMuX3NodXRkb3duKCkuZmluYWxseSgoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVN0YXJ0ZWQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3dhc1F1aXRSZXF1ZXN0ZWQgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignQWdlbnQgSG9zdCBwcm9jZXNzIG1hbmFnZXIgaXMgc2h1dHRpbmcgZG93bi4nKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZXN0YXJ0TGltaXRSZWFjaGVkKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEFnZW50SG9zdFN0YXJ0RXJyb3IoYEFnZW50IEhvc3QgcHJvY2VzcyBzdG9wcGVkIGFmdGVyICR7Q29uc3RhbnRzLk1heFJlc3RhcnRzfSByZXN0YXJ0cy5gLCB0cnVlKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fc3RhcnRQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2V0U3RhcnRQcm9taXNlKHRoaXMuX3N0YXJ0KCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc3RhcnRQcm9taXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4cGxpY2l0bHkgcmVzdGFydHMgdGhlIGFnZW50IGhvc3QgcHJvY2VzcywgZGlzY2FyZGluZyB0aGUgY3VycmVudCBjb25uZWN0aW9uXG5cdCAqIGFuZCByZXNldHRpbmcgY3Jhc2ggcmVjb3ZlcnkgYm9va2tlZXBpbmcuXG5cdCAqL1xuXHRyZXN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl93YXNRdWl0UmVxdWVzdGVkIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0FnZW50IEhvc3QgcHJvY2VzcyBtYW5hZ2VyIGlzIHNodXR0aW5nIGRvd24uJykpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jlc3RhcnRDb3VudCA9IDA7XG5cdFx0dGhpcy5fcmVzdGFydExpbWl0UmVhY2hlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHBlbmRpbmdTdGFydCA9IHRoaXMuX3N0YXJ0UHJvbWlzZTtcblx0XHRjb25zdCByZXN0YXJ0UHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAocGVuZGluZ1N0YXJ0KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgcGVuZGluZ1N0YXJ0O1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBBbiBleHBsaWNpdCByZXN0YXJ0IHJldHJpZXMgYWZ0ZXIgYSBmYWlsZWQgc3RhcnQuXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl93YXNRdWl0UmVxdWVzdGVkIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcjogZXhwbGljaXRseSByZXN0YXJ0aW5nIGFnZW50IGhvc3QnKTtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9jb25uZWN0aW9uO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCByYWNlVGltZW91dChjb25uZWN0aW9uLnNodXRkb3duKCksIENvbnN0YW50cy5TaHV0ZG93blRpbWVvdXRNcywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcjogYWdlbnQgaG9zdCBkaWQgbm90IHNodXQgZG93biBiZWZvcmUgcmVzdGFydCB3aXRoaW4gJHtDb25zdGFudHMuU2h1dGRvd25UaW1lb3V0TXN9bXM7IHRlcm1pbmF0aW5nIGl0YCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGZhaWxlZCB0byBzaHV0IGRvd24gYWdlbnQgaG9zdCBncmFjZWZ1bGx5IGJlZm9yZSByZXN0YXJ0JywgZXJyb3IpO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHRoaXMuX2NsZWFyQ29ubmVjdGlvbihjb25uZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fc3RhcnQoKTtcblx0XHR9KSgpO1xuXHRcdHRoaXMuX3NldFN0YXJ0UHJvbWlzZShyZXN0YXJ0UHJvbWlzZSk7XG5cdFx0cmV0dXJuIHJlc3RhcnRQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U3RhcnRQcm9taXNlKHN0YXJ0UHJvbWlzZTogUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3N0YXJ0UHJvbWlzZSA9IHN0YXJ0UHJvbWlzZTtcblx0XHR2b2lkIHN0YXJ0UHJvbWlzZS50aGVuKFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fc3RhcnRQcm9taXNlID09PSBzdGFydFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGFydFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGFydFByb21pc2UgPT09IHN0YXJ0UHJvbWlzZSkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXJ0UHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHQpO1xuXHRcdHJldHVybiBzdGFydFByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgY29ubmVjdGlvbjogSUFnZW50SG9zdENvbm5lY3Rpb24gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXJ0ZWRDb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fc3RhcnRlci5zdGFydCgpO1xuXHRcdFx0Y29ubmVjdGlvbiA9IHN0YXJ0ZWRDb25uZWN0aW9uO1xuXG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCB0aGlzLl93YXNRdWl0UmVxdWVzdGVkKSB7XG5cdFx0XHRcdHN0YXJ0ZWRDb25uZWN0aW9uLnN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBZ2VudCBIb3N0IHByb2Nlc3MgbWFuYWdlciBkaXNwb3NlZCBkdXJpbmcgc3RhcnR1cC4nKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fY29ubmVjdGlvbiA9IHN0YXJ0ZWRDb25uZWN0aW9uO1xuXHRcdFx0dGhpcy5fY29ubmVjdGlvblN0b3JlLnZhbHVlID0gc3RhcnRlZENvbm5lY3Rpb24uc3RvcmU7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ0FnZW50SG9zdFByb2Nlc3NNYW5hZ2VyOiBhZ2VudCBob3N0IHN0YXJ0ZWQnKTtcblxuXHRcdFx0Ly8gQ29ubmVjdCBsb2dnZXIgY2hhbm5lbCBzbyBhZ2VudCBob3N0IGxvZ3MgYXBwZWFyIGluIHRoZSBvdXRwdXQgY2hhbm5lbFxuXHRcdFx0c3RhcnRlZENvbm5lY3Rpb24uc3RvcmUuYWRkKG5ldyBSZW1vdGVMb2dnZXJDaGFubmVsQ2xpZW50KHRoaXMuX2xvZ2dlclNlcnZpY2UsIHN0YXJ0ZWRDb25uZWN0aW9uLmNsaWVudC5nZXRDaGFubmVsKEFnZW50SG9zdElwY0NoYW5uZWxzLkxvZ2dlcikpKTtcblxuXHRcdFx0c3RhcnRlZENvbm5lY3Rpb24uc3RvcmUuYWRkKHN0YXJ0ZWRDb25uZWN0aW9uLm9uRGlkUHJvY2Vzc0V4aXQoZSA9PiB0aGlzLl9oYW5kbGVQcm9jZXNzRXhpdChzdGFydGVkQ29ubmVjdGlvbiwgZS5jb2RlKSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9jbGVhckNvbm5lY3Rpb24oY29ubmVjdGlvbik7XG5cdFx0XHRpZiAoIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgJiYgIXRoaXMuX3dhc1F1aXRSZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGZhaWxlZCB0byBzdGFydCBhZ2VudCBob3N0JywgZXJyb3IpO1xuXHRcdFx0XHRyZXBvcnRBZ2VudEhvc3RQcm9jZXNzRXJyb3IodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLlZTQ29kZU1haW5Qcm9jZXNzLFxuXHRcdFx0XHRcdGtpbmQ6ICdzdGFydEZhaWxlZCcsXG5cdFx0XHRcdFx0cmVzdGFydENvdW50OiB0aGlzLl9yZXN0YXJ0Q291bnQsXG5cdFx0XHRcdFx0d2lsbFJlc3RhcnQ6IGZhbHNlLFxuXHRcdFx0XHR9LCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRHJvcHMgdGhlIGdpdmVuIGNvbm5lY3Rpb24sIGRpc3Bvc2luZyBpdCBleGFjdGx5IG9uY2UgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0IGlzXG5cdCAqIHN0aWxsIHRoZSBjb25uZWN0aW9uIHRyYWNrZWQgYnkge0BsaW5rIF9jb25uZWN0aW9uU3RvcmV9LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYXJDb25uZWN0aW9uKGNvbm5lY3Rpb246IElBZ2VudEhvc3RDb25uZWN0aW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb24gPT09IGNvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghY29ubmVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY29ubmVjdGlvblN0b3JlLnZhbHVlID09PSBjb25uZWN0aW9uLnN0b3JlKSB7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uU3RvcmUuY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29ubmVjdGlvbi5zdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlUHJvY2Vzc0V4aXQoY29ubmVjdGlvbjogSUFnZW50SG9zdENvbm5lY3Rpb24sIGNvZGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb25uZWN0aW9uICE9PSBjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NsZWFyQ29ubmVjdGlvbihjb25uZWN0aW9uKTtcblxuXHRcdGlmICh0aGlzLl93YXNRdWl0UmVxdWVzdGVkIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGlzRXhwZWN0ZWRXaW5kb3dzU2h1dGRvd25FeGl0KHRoaXMuX3BsYXRmb3JtLCBjb2RlKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcjogYWdlbnQgaG9zdCB0ZXJtaW5hdGVkIHdpdGggZXhwZWN0ZWQgV2luZG93cyBzaHV0ZG93biBjb2RlICR7Y29kZX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWxsUmVzdGFydCA9IHRoaXMuX3Jlc3RhcnRDb3VudCA8IENvbnN0YW50cy5NYXhSZXN0YXJ0cztcblx0XHRyZXBvcnRBZ2VudEhvc3RQcm9jZXNzRXJyb3IodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0aG9zdExhdW5jaEtpbmQ6IEFnZW50SG9zdExhdW5jaEtpbmQuVlNDb2RlTWFpblByb2Nlc3MsXG5cdFx0XHRraW5kOiAndW5leHBlY3RlZEV4aXQnLFxuXHRcdFx0Y29kZSxcblx0XHRcdHJlc3RhcnRDb3VudDogdGhpcy5fcmVzdGFydENvdW50LFxuXHRcdFx0d2lsbFJlc3RhcnQsXG5cdFx0fSk7XG5cdFx0aWYgKHdpbGxSZXN0YXJ0KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcjogYWdlbnQgaG9zdCB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseSB3aXRoIGNvZGUgJHtjb2RlfWApO1xuXHRcdFx0dGhpcy5fcmVzdGFydENvdW50Kys7XG5cdFx0XHRjb25zdCBwZW5kaW5nTGlmZWN5Y2xlID0gdGhpcy5fc3RhcnRQcm9taXNlO1xuXHRcdFx0Y29uc3QgcmVzdGFydCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jb25uZWN0aW9uICYmICF0aGlzLl93YXNRdWl0UmVxdWVzdGVkICYmICF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLl9lbnN1cmVTdGFydGVkKCkuY2F0Y2goZXJyb3IgPT4gdGhpcy5fbG9nU2VydmljZS50cmFjZSgnQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGF1dG9tYXRpYyByZXN0YXJ0IGZhaWxlZCcsIGVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRpZiAocGVuZGluZ0xpZmVjeWNsZSkge1xuXHRcdFx0XHR2b2lkIHBlbmRpbmdMaWZlY3ljbGUudGhlbihyZXN0YXJ0LCByZXN0YXJ0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3RhcnQoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVzdGFydExpbWl0UmVhY2hlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcjogYWdlbnQgaG9zdCB0ZXJtaW5hdGVkIHdpdGggY29kZSAke2NvZGV9LCBnaXZpbmcgdXAgYWZ0ZXIgJHtDb25zdGFudHMuTWF4UmVzdGFydHN9IHJlc3RhcnRzYCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJhY2VUaW1lb3V0KHRoaXMuX3NodXRkb3duR3JhY2VmdWxseSgpLCBDb25zdGFudHMuU2h1dGRvd25UaW1lb3V0TXMsICgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBBZ2VudEhvc3RQcm9jZXNzTWFuYWdlcjogYWdlbnQgaG9zdCBkaWQgbm90IHNodXQgZG93biB3aXRoaW4gJHtDb25zdGFudHMuU2h1dGRvd25UaW1lb3V0TXN9bXM7IHRlcm1pbmF0aW5nIGl0YCk7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGZhaWxlZCB0byBzaHV0IGRvd24gYWdlbnQgaG9zdCBncmFjZWZ1bGx5JywgZXJyb3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9jbGVhckNvbm5lY3Rpb24odGhpcy5fY29ubmVjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2h1dGRvd25HcmFjZWZ1bGx5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zdGFydFByb21pc2U7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0FnZW50SG9zdFByb2Nlc3NNYW5hZ2VyOiBzdGFydHVwIGRpZCBub3QgY29tcGxldGUgYmVmb3JlIHNodXRkb3duJywgZXJyb3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3Rpb24/LnNodXRkb3duKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxZQUE2Qix5QkFBeUI7QUFDL0QsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUFvRTtBQUM3RSxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUVyQyxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFDQyxFQUFBQSxzQkFBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsc0JBQUEsdUJBQW9CLE9BQXBCO0FBRkksU0FBQUE7QUFBQSxHQUFBO0FBS0wsTUFBTSx1Q0FBdUMsb0JBQUksSUFBSTtB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
