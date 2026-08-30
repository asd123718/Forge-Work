import { Barrier } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ProcessPropertyType } from "../../../../platform/terminal/common/terminal.js";
import { AGENT_HOST_SCHEME, fromAgentHostUri } from "../../../../platform/agentHost/common/agentHostUri.js";
import { ActionType } from "../../../../platform/agentHost/common/state/sessionActions.js";
import { TerminalClaimKind } from "../../../../platform/agentHost/common/state/protocol/state.js";
import { StateComponents } from "../../../../platform/agentHost/common/state/sessionState.js";
import { BasePty } from "../common/basePty.js";
var AhpCommandMarkKind = /* @__PURE__ */ ((AhpCommandMarkKind2) => {
  AhpCommandMarkKind2["Executed"] = "s";
  AhpCommandMarkKind2["End"] = "e";
  return AhpCommandMarkKind2;
})(AhpCommandMarkKind || {});
function getAhpCommandMarkId(commandId, kind) {
  return `ahp-${commandId}-${kind}`;
}
function getAhpCommandMarkCode(commandId, kind) {
  return `\x1B]633;SetMark;Id=${getAhpCommandMarkId(commandId, kind)};Hidden\x07`;
}
const COPILOT_SENTINEL_PREFIX = "<<<COPILOT_SENTINEL_";
function isCopilotSentinelCommand(commandLine) {
  return commandLine.includes(COPILOT_SENTINEL_PREFIX);
}
class AgentHostPty extends BasePty {
  constructor(id, _connection, _terminalUri, _options) {
    super(
      id,
      /* shouldPersist */
      false
    );
    this._connection = _connection;
    this._terminalUri = _terminalUri;
    this._options = _options;
    this._startBarrier = new Barrier();
    this._subscriptionDisposables = this._register(new DisposableStore());
    this._initialCwd = "";
    this._onCommandExecuted = this._register(new Emitter());
    this.onCommandExecuted = this._onCommandExecuted.event;
    this._onCommandFinished = this._register(new Emitter());
    this.onCommandFinished = this._onCommandFinished.event;
    this._onSupportsCommandDetection = this._register(new Emitter());
    this.onSupportsCommandDetection = this._onSupportsCommandDetection.event;
    this._supportsCommandDetection = false;
    /**
     * Command IDs for sentinel commands that should be suppressed from shell
     * integration events. When the copilot shell tools fall back to sentinel-
     * based exit code detection, shell integration may also detect the sentinel
     * echo as a real command — we filter those out here.
     */
    this._suppressedCommandIds = /* @__PURE__ */ new Set();
  }
  get supportsCommandDetection() {
    return this._supportsCommandDetection;
  }
  async start() {
    try {
      if (!this._options?.attachOnly) {
        await this._connection.createTerminal({
          channel: this._terminalUri.toString(),
          claim: { kind: TerminalClaimKind.Client, clientId: this._connection.clientId },
          name: this._options?.name,
          cwd: this._resolveCwdForProtocol(this._options?.cwd),
          cols: this._lastDimensions.cols > 0 ? this._lastDimensions.cols : void 0,
          rows: this._lastDimensions.rows > 0 ? this._lastDimensions.rows : void 0
        });
      }
      this._subscriptionRef = this._connection.getSubscription(StateComponents.Terminal, this._terminalUri, "AgentHostPty");
      const subscription = this._subscriptionRef.object;
      if (subscription.value === void 0) {
        await new Promise((resolve) => {
          const listener = subscription.onDidChange(() => {
            listener.dispose();
            resolve();
          });
          this._subscriptionDisposables.add(listener);
        });
      }
      const state = subscription.value;
      if (state.supportsCommandDetection) {
        this._supportsCommandDetection = true;
        this._onSupportsCommandDetection.fire();
      }
      this._replayContent(state.content);
      this._initialCwd = state.cwd?.toString() ?? "";
      this._properties.cwd = this._initialCwd;
      this._properties.initialCwd = this._initialCwd;
      if (state.title) {
        this._properties.title = state.title;
      }
      this._subscriptionDisposables.add(subscription.onDidApplyAction((envelope) => {
        this._handleAction(envelope);
      }));
      this._startBarrier.open();
      this.handleReady({ pid: -1, cwd: this._initialCwd, windowsPty: void 0 });
      return void 0;
    } catch (err) {
      this._startBarrier.open();
      return { message: err instanceof Error ? err.message : String(err) };
    }
  }
  _handleAction(envelope) {
    const action = envelope.action;
    switch (action.type) {
      case ActionType.TerminalData:
        this.handleData(action.data);
        break;
      case ActionType.TerminalExited:
        this.handleExit(action.exitCode);
        break;
      case ActionType.TerminalCwdChanged:
        this._properties.cwd = action.cwd.toString();
        this.handleDidChangeProperty({ type: ProcessPropertyType.Cwd, value: action.cwd.toString() });
        break;
      case ActionType.TerminalTitleChanged:
        this._properties.title = action.title;
        this.handleDidChangeProperty({ type: ProcessPropertyType.Title, value: action.title });
        break;
      case ActionType.TerminalResized:
        if (envelope.origin?.clientId !== this._connection.clientId) {
          this.handleDidChangeProperty({
            type: ProcessPropertyType.OverrideDimensions,
            value: { cols: action.cols, rows: action.rows }
          });
        }
        break;
      case ActionType.TerminalCommandDetectionAvailable:
        if (!this._supportsCommandDetection) {
          this._supportsCommandDetection = true;
          this._onSupportsCommandDetection.fire();
        }
        break;
      case ActionType.TerminalCommandExecuted:
        if (isCopilotSentinelCommand(action.commandLine)) {
          this._suppressedCommandIds.add(action.commandId);
          break;
        }
        this.handleData(getAhpCommandMarkCode(action.commandId, "s" /* Executed */));
        this._onCommandExecuted.fire({
          commandId: action.commandId,
          commandLine: action.commandLine,
          timestamp: action.timestamp
        });
        break;
      case ActionType.TerminalCommandFinished:
        if (this._suppressedCommandIds.delete(action.commandId)) {
          break;
        }
        this.handleData(getAhpCommandMarkCode(action.commandId, "e" /* End */));
        this._onCommandFinished.fire({
          commandId: action.commandId,
          exitCode: action.exitCode,
          durationMs: action.durationMs
        });
        break;
    }
  }
  /**
   * Replays structured terminal content parts from the initial state snapshot.
   * Emits command lifecycle events for command parts so that consumers
   * (e.g. {@link AhpTerminalCommandSource}) can reconstruct command history.
   */
  _replayContent(content) {
    for (const part of content) {
      if (part.type === "unclassified") {
        if (part.value) {
          this.handleData(part.value);
        }
      } else if (part.type === "command") {
        if (isCopilotSentinelCommand(part.commandLine)) {
          continue;
        }
        this.handleData(getAhpCommandMarkCode(part.commandId, "s" /* Executed */));
        this._onCommandExecuted.fire({
          commandId: part.commandId,
          commandLine: part.commandLine,
          timestamp: part.timestamp,
          storedOutput: part.output
        });
        if (part.output) {
          this.handleData(part.output);
        }
        if (part.isComplete) {
          this.handleData(getAhpCommandMarkCode(part.commandId, "e" /* End */));
          this._onCommandFinished.fire({
            commandId: part.commandId,
            exitCode: part.exitCode,
            durationMs: part.durationMs
          });
        }
      }
    }
  }
  /**
   * Resolves a cwd URI for sending over the protocol. Agent-host URIs
   * are unwrapped to their original URI via {@link fromAgentHostUri}.
   */
  _resolveCwdForProtocol(cwd) {
    if (!cwd) {
      return void 0;
    }
    if (cwd.scheme === AGENT_HOST_SCHEME) {
      return fromAgentHostUri(cwd).toString();
    }
    return cwd.toString();
  }
  input(data) {
    if (this._inReplay) {
      return;
    }
    this._startBarrier.wait().then(() => {
      this._connection.dispatch(
        this._terminalUri.toString(),
        { type: ActionType.TerminalInput, data }
      );
    });
  }
  resize(cols, rows) {
    if (this._inReplay || this._lastDimensions.cols === cols && this._lastDimensions.rows === rows) {
      return;
    }
    this._lastDimensions.cols = cols;
    this._lastDimensions.rows = rows;
    this._startBarrier.wait().then(() => {
      this._connection.dispatch(
        this._terminalUri.toString(),
        { type: ActionType.TerminalResized, cols, rows }
      );
    });
  }
  shutdown(_immediate) {
    this._startBarrier.wait().then(() => {
      if (!this._options?.attachOnly) {
        this._connection.disposeTerminal(this._terminalUri);
      }
      this._subscriptionRef?.dispose();
      this._subscriptionRef = void 0;
      this._subscriptionDisposables.clear();
      this.handleExit(void 0);
    });
  }
  async getInitialCwd() {
    return this._initialCwd;
  }
  async getCwd() {
    return this._properties.cwd || this._initialCwd;
  }
  async clearBuffer() {
    this._connection.dispatch(
      this._terminalUri.toString(),
      { type: ActionType.TerminalCleared }
    );
  }
  acknowledgeDataEvent(_charCount) {
  }
  async setUnicodeVersion(_version) {
  }
  processBinary(_data) {
    return Promise.resolve();
  }
  sendSignal(_signal) {
  }
  async refreshProperty(type) {
    return this._properties[type];
  }
  async updateProperty(_type, _value) {
  }
  /**
   * Reconnect this pty to a new agent host connection. Tears down the
   * old subscription and re-subscribes with the new connection, replaying
   * content from the server-side snapshot. Terminal output during the
   * disconnect gap is a stream (not state), so some loss is expected.
   *
   * @returns `true` if reconnection succeeded, `false` otherwise.
   */
  async reconnect(newConnection) {
    this._subscriptionDisposables.clear();
    this._subscriptionRef?.dispose();
    this._subscriptionRef = void 0;
    this._connection = newConnection;
    try {
      this._subscriptionRef = this._connection.getSubscription(StateComponents.Terminal, this._terminalUri, "AgentHostPty");
      const subscription = this._subscriptionRef.object;
      if (subscription.value === void 0) {
        const RECONNECT_HYDRATE_TIMEOUT_MS = 1e4;
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            listener.dispose();
            reject(new Error("Reconnect hydration timed out"));
          }, RECONNECT_HYDRATE_TIMEOUT_MS);
          const listener = subscription.onDidChange(() => {
            clearTimeout(timer);
            listener.dispose();
            resolve();
          });
          this._subscriptionDisposables.add(listener);
        });
      }
      const state = subscription.value;
      if (state.supportsCommandDetection && !this._supportsCommandDetection) {
        this._supportsCommandDetection = true;
        this._onSupportsCommandDetection.fire();
      }
      this.handleData("\x1B[2J\x1B[3J\x1B[H");
      this._replayContent(state.content);
      if (state.cwd) {
        this._properties.cwd = state.cwd.toString();
      }
      if (state.title) {
        this._properties.title = state.title;
      }
      this._subscriptionDisposables.add(subscription.onDidApplyAction((envelope) => {
        this._handleAction(envelope);
      }));
      return true;
    } catch (err) {
      console.warn("[AgentHostPty] Reconnection failed:", err instanceof Error ? err.message : String(err));
      return false;
    }
  }
  /** The terminal URI this pty is subscribed to. */
  get terminalUri() {
    return this._terminalUri;
  }
  dispose() {
    this._subscriptionRef?.dispose();
    this._subscriptionRef = void 0;
    super.dispose();
  }
}
export {
  AgentHostPty,
  AhpCommandMarkKind,
  getAhpCommandMarkId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFxhZ2VudEhvc3RQdHkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCYXJyaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElQcm9jZXNzUHJvcGVydHlNYXAsIElUZXJtaW5hbENoaWxkUHJvY2VzcywgSVRlcm1pbmFsTGF1bmNoRXJyb3IsIElUZXJtaW5hbExhdW5jaFJlc3VsdCwgUHJvY2Vzc1Byb3BlcnR5VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfSE9TVF9TQ0hFTUUsIGZyb21BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCBBY3Rpb25FbnZlbG9wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDbGFpbUtpbmQsIHR5cGUgVGVybWluYWxDb250ZW50UGFydCwgdHlwZSBUZXJtaW5hbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL2FnZW50U3Vic2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IFN0YXRlQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEJhc2VQdHkgfSBmcm9tICcuLi9jb21tb24vYmFzZVB0eS5qcyc7XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgY3JlYXRpbmcgYSBuZXcgdGVybWluYWwgb24gYW4gYWdlbnQgaG9zdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0UHR5T3B0aW9ucyB7XG5cdC8qKiBIdW1hbi1yZWFkYWJsZSB0ZXJtaW5hbCBuYW1lLiAqL1xuXHRyZWFkb25seSBuYW1lPzogc3RyaW5nO1xuXHQvKiogSW5pdGlhbCB3b3JraW5nIGRpcmVjdG9yeSBVUkkuICovXG5cdHJlYWRvbmx5IGN3ZD86IFVSSTtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgYXR0YWNoIHRvIGFuIGV4aXN0aW5nIHRlcm1pbmFsIG9uIHRoZSBhZ2VudCBob3N0IGluc3RlYWQgb2Zcblx0ICogY3JlYXRpbmcgYSBuZXcgb25lLiBUaGUgdGVybWluYWwgbXVzdCBhbHJlYWR5IGV4aXN0IHNlcnZlci1zaWRlIChlLmcuXG5cdCAqIGNyZWF0ZWQgYnkgYSB0b29sKS4gVGhlIHB0eSB3aWxsIHN1YnNjcmliZSB0byBpdHMgc3RhdGUgYW5kIHJlcGxheVxuXHQgKiBjb250ZW50IHdpdGhvdXQgY2FsbGluZyBgY3JlYXRlVGVybWluYWxgLlxuXHQgKi9cblx0cmVhZG9ubHkgYXR0YWNoT25seT86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFB0eUNvbW1hbmRFeGVjdXRlZEV2ZW50IHtcblx0cmVhZG9ubHkgY29tbWFuZElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmRMaW5lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpbWVzdGFtcDogbnVtYmVyO1xuXHQvKiogVGhlIHN0b3JlZCBWVCBvdXRwdXQgZm9yIHRoaXMgY29tbWFuZCAocHJlc2VudCBkdXJpbmcgY29udGVudCByZXBsYXkpLiAqL1xuXHRyZWFkb25seSBzdG9yZWRPdXRwdXQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFB0eUNvbW1hbmRGaW5pc2hlZEV2ZW50IHtcblx0cmVhZG9ubHkgY29tbWFuZElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4aXRDb2RlPzogbnVtYmVyO1xuXHRyZWFkb25seSBkdXJhdGlvbk1zPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBBaHBDb21tYW5kTWFya0tpbmQge1xuXHRFeGVjdXRlZCA9ICdzJyxcblx0RW5kID0gJ2UnXG59XG5cblxuLyoqXG4gKiBHZW5lcmF0ZXMgdGhlIG1hcmsgSUQgdXNlZCB0byBjb3JyZWxhdGUgU2V0TWFyayBWVCBjb2RlcyB3aXRoIHh0ZXJtIG1hcmtlcnNcbiAqIHZpYSB7QGxpbmsgSUJ1ZmZlck1hcmtDYXBhYmlsaXR5LmdldE1hcmt9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWhwQ29tbWFuZE1hcmtJZChjb21tYW5kSWQ6IHN0cmluZywga2luZDogQWhwQ29tbWFuZE1hcmtLaW5kKTogc3RyaW5nIHtcblx0cmV0dXJuIGBhaHAtJHtjb21tYW5kSWR9LSR7a2luZH1gO1xufVxuXG4vKiogR2VuZXJhdGVzIGFuIE9TQyA2MzMgU2V0TWFyayBzZXF1ZW5jZSBmb3IgYW4gQUhQIGNvbW1hbmQgYm91bmRhcnkuICovXG5mdW5jdGlvbiBnZXRBaHBDb21tYW5kTWFya0NvZGUoY29tbWFuZElkOiBzdHJpbmcsIGtpbmQ6IEFocENvbW1hbmRNYXJrS2luZCk6IHN0cmluZyB7XG5cdHJldHVybiBgXFx4MWJdNjMzO1NldE1hcms7SWQ9JHtnZXRBaHBDb21tYW5kTWFya0lkKGNvbW1hbmRJZCwga2luZCl9O0hpZGRlblxceDA3YDtcbn1cblxuLyoqXG4gKiBUaGUgc2VudGluZWwgcHJlZml4IHVzZWQgYnkgY29waWxvdCBzaGVsbCB0b29scyBmb3IgZXhpdCBjb2RlIGRldGVjdGlvbi5cbiAqIFdoZW4gc2hlbGwgaW50ZWdyYXRpb24gaXMgYWN0aXZlLCB0aGVzZSBpbnRlcm5hbCBzZW50aW5lbCBlY2hvIGNvbW1hbmRzXG4gKiBnZXQgZGV0ZWN0ZWQgYXMgcmVhbCBjb21tYW5kcyBcdTIwMTQgd2Ugc3VwcHJlc3MgdGhlbSBmcm9tIGNvbW1hbmQgZXZlbnRzLlxuICovXG5jb25zdCBDT1BJTE9UX1NFTlRJTkVMX1BSRUZJWCA9ICc8PDxDT1BJTE9UX1NFTlRJTkVMXyc7XG5cbi8qKiBSZXR1cm5zIHdoZXRoZXIgYSBjb21tYW5kIGxpbmUgaXMgYSBjb3BpbG90IHNlbnRpbmVsIGVjaG8sIG5vdCBhIHJlYWwgdXNlciBjb21tYW5kLiAqL1xuZnVuY3Rpb24gaXNDb3BpbG90U2VudGluZWxDb21tYW5kKGNvbW1hbmRMaW5lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGNvbW1hbmRMaW5lLmluY2x1ZGVzKENPUElMT1RfU0VOVElORUxfUFJFRklYKTtcbn1cblxuLyoqXG4gKiBBIHBzZXVkby10ZXJtaW5hbCBiYWNrZWQgYnkgYW4gQWdlbnQgSG9zdCBQcm90b2NvbCB0ZXJtaW5hbCBzdWJzY3JpcHRpb24uXG4gKlxuICogVXNlcyBgY3VzdG9tUHR5SW1wbGVtZW50YXRpb25gIG9uIGBJU2hlbGxMYXVuY2hDb25maWdgIHNvIHRoZVxuICogYFRlcm1pbmFsUHJvY2Vzc01hbmFnZXJgIGJ5cGFzc2VzIHRoZSBwdHkgaG9zdCBiYWNrZW5kIGVudGlyZWx5LlxuICpcbiAqIERhdGEgZmxvdzpcbiAqICAgdGVybWluYWwvZGF0YSAgIFx1MjE5MiAgb25Qcm9jZXNzRGF0YVxuICogICB0ZXJtaW5hbC9leGl0ZWQgXHUyMTkyICBvblByb2Nlc3NFeGl0XG4gKiAgIGlucHV0KGRhdGEpICAgICBcdTIxOTIgIGRpc3BhdGNoIHRlcm1pbmFsL2lucHV0XG4gKiAgIHJlc2l6ZShjLHIpICAgICBcdTIxOTIgIGRpc3BhdGNoIHRlcm1pbmFsL3Jlc2l6ZWRcbiAqICAgc2h1dGRvd24oKSAgICAgIFx1MjE5MiAgZGlzcG9zZVRlcm1pbmFsIGNvbW1hbmRcbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFB0eSBleHRlbmRzIEJhc2VQdHkgaW1wbGVtZW50cyBJVGVybWluYWxDaGlsZFByb2Nlc3Mge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXJ0QmFycmllciA9IG5ldyBCYXJyaWVyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1YnNjcmlwdGlvbkRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfc3Vic2NyaXB0aW9uUmVmOiBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxUZXJtaW5hbFN0YXRlPj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2luaXRpYWxDd2QgPSAnJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNvbW1hbmRFeGVjdXRlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudEhvc3RQdHlDb21tYW5kRXhlY3V0ZWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uQ29tbWFuZEV4ZWN1dGVkOiBFdmVudDxJQWdlbnRIb3N0UHR5Q29tbWFuZEV4ZWN1dGVkRXZlbnQ+ID0gdGhpcy5fb25Db21tYW5kRXhlY3V0ZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Db21tYW5kRmluaXNoZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRIb3N0UHR5Q29tbWFuZEZpbmlzaGVkRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkNvbW1hbmRGaW5pc2hlZDogRXZlbnQ8SUFnZW50SG9zdFB0eUNvbW1hbmRGaW5pc2hlZEV2ZW50PiA9IHRoaXMuX29uQ29tbWFuZEZpbmlzaGVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uU3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uU3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX3N1cHBvcnRzQ29tbWFuZERldGVjdGlvbiA9IGZhbHNlO1xuXHRnZXQgc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uOyB9XG5cblx0LyoqXG5cdCAqIENvbW1hbmQgSURzIGZvciBzZW50aW5lbCBjb21tYW5kcyB0aGF0IHNob3VsZCBiZSBzdXBwcmVzc2VkIGZyb20gc2hlbGxcblx0ICogaW50ZWdyYXRpb24gZXZlbnRzLiBXaGVuIHRoZSBjb3BpbG90IHNoZWxsIHRvb2xzIGZhbGwgYmFjayB0byBzZW50aW5lbC1cblx0ICogYmFzZWQgZXhpdCBjb2RlIGRldGVjdGlvbiwgc2hlbGwgaW50ZWdyYXRpb24gbWF5IGFsc28gZGV0ZWN0IHRoZSBzZW50aW5lbFxuXHQgKiBlY2hvIGFzIGEgcmVhbCBjb21tYW5kIFx1MjAxNCB3ZSBmaWx0ZXIgdGhvc2Ugb3V0IGhlcmUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwcmVzc2VkQ29tbWFuZElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBudW1iZXIsXG5cdFx0cHJpdmF0ZSBfY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFVyaTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM/OiBJQWdlbnRIb3N0UHR5T3B0aW9ucyxcblx0KSB7XG5cdFx0c3VwZXIoaWQsIC8qIHNob3VsZFBlcnNpc3QgKi8gZmFsc2UpO1xuXHR9XG5cblx0YXN5bmMgc3RhcnQoKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IElUZXJtaW5hbExhdW5jaFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHQvLyAxLiBDcmVhdGUgdGhlIHRlcm1pbmFsIG9uIHRoZSBhZ2VudCBob3N0IChza2lwIGZvciBhdHRhY2gtb25seSBtb2RlXG5cdFx0XHQvLyAgICB3aGVyZSB0aGUgdGVybWluYWwgYWxyZWFkeSBleGlzdHMsIGUuZy4gY3JlYXRlZCBieSBhIHRvb2wpXG5cdFx0XHRpZiAoIXRoaXMuX29wdGlvbnM/LmF0dGFjaE9ubHkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29ubmVjdGlvbi5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdFx0Y2hhbm5lbDogdGhpcy5fdGVybWluYWxVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkOiB0aGlzLl9jb25uZWN0aW9uLmNsaWVudElkIH0sXG5cdFx0XHRcdFx0bmFtZTogdGhpcy5fb3B0aW9ucz8ubmFtZSxcblx0XHRcdFx0XHRjd2Q6IHRoaXMuX3Jlc29sdmVDd2RGb3JQcm90b2NvbCh0aGlzLl9vcHRpb25zPy5jd2QpLFxuXHRcdFx0XHRcdGNvbHM6IHRoaXMuX2xhc3REaW1lbnNpb25zLmNvbHMgPiAwID8gdGhpcy5fbGFzdERpbWVuc2lvbnMuY29scyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyb3dzOiB0aGlzLl9sYXN0RGltZW5zaW9ucy5yb3dzID4gMCA/IHRoaXMuX2xhc3REaW1lbnNpb25zLnJvd3MgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyAyLiBHZXQgYSBzdWJzY3JpcHRpb24gZm9yIHRoZSB0ZXJtaW5hbCBVUkkgKGF1dG8tc3Vic2NyaWJlcylcblx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZiA9IHRoaXMuX2Nvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5UZXJtaW5hbCwgdGhpcy5fdGVybWluYWxVcmksICdBZ2VudEhvc3RQdHknKTtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHRoaXMuX3N1YnNjcmlwdGlvblJlZi5vYmplY3Q7XG5cblx0XHRcdC8vIDMuIFdhaXQgZm9yIGh5ZHJhdGlvbiB2aWEgb25EaWRDaGFuZ2UsIHRoZW4gcmVwbGF5IHNuYXBzaG90XG5cdFx0XHRpZiAoc3Vic2NyaXB0aW9uLnZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBzdWJzY3JpcHRpb24ub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvbkRpc3Bvc2FibGVzLmFkZChsaXN0ZW5lcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN1YnNjcmlwdGlvbi52YWx1ZSBhcyBUZXJtaW5hbFN0YXRlO1xuXG5cdFx0XHQvLyA0LiBSZXBsYXkgYW55IGV4aXN0aW5nIGNvbnRlbnQgZnJvbSB0aGUgc25hcHNob3Rcblx0XHRcdGlmIChzdGF0ZS5zdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fb25TdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24uZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmVwbGF5Q29udGVudChzdGF0ZS5jb250ZW50KTtcblxuXHRcdFx0Ly8gNS4gVHJhY2sgaW5pdGlhbCBjd2Rcblx0XHRcdHRoaXMuX2luaXRpYWxDd2QgPSBzdGF0ZS5jd2Q/LnRvU3RyaW5nKCkgPz8gJyc7XG5cdFx0XHR0aGlzLl9wcm9wZXJ0aWVzLmN3ZCA9IHRoaXMuX2luaXRpYWxDd2Q7XG5cdFx0XHR0aGlzLl9wcm9wZXJ0aWVzLmluaXRpYWxDd2QgPSB0aGlzLl9pbml0aWFsQ3dkO1xuXHRcdFx0aWYgKHN0YXRlLnRpdGxlKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3BlcnRpZXMudGl0bGUgPSBzdGF0ZS50aXRsZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gNi4gV2lyZSB1cCBhY3Rpb24gbGlzdGVuZXIgZm9yIHN0cmVhbWluZyB1cGRhdGVzIHZpYSB0aGUgc3Vic2NyaXB0aW9uXG5cdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25EaXNwb3NhYmxlcy5hZGQoc3Vic2NyaXB0aW9uLm9uRGlkQXBwbHlBY3Rpb24oZW52ZWxvcGUgPT4ge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVBY3Rpb24oZW52ZWxvcGUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyA3LiBTaWduYWwgdGhhdCB0aGUgcHJvY2VzcyBpcyByZWFkeVxuXHRcdFx0dGhpcy5fc3RhcnRCYXJyaWVyLm9wZW4oKTtcblx0XHRcdHRoaXMuaGFuZGxlUmVhZHkoeyBwaWQ6IC0xLCBjd2Q6IHRoaXMuX2luaXRpYWxDd2QsIHdpbmRvd3NQdHk6IHVuZGVmaW5lZCB9KTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9zdGFydEJhcnJpZXIub3BlbigpO1xuXHRcdFx0cmV0dXJuIHsgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQWN0aW9uKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxEYXRhOlxuXHRcdFx0XHR0aGlzLmhhbmRsZURhdGEoYWN0aW9uLmRhdGEpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbEV4aXRlZDpcblx0XHRcdFx0dGhpcy5oYW5kbGVFeGl0KGFjdGlvbi5leGl0Q29kZSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsQ3dkQ2hhbmdlZDpcblx0XHRcdFx0dGhpcy5fcHJvcGVydGllcy5jd2QgPSBhY3Rpb24uY3dkLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHRoaXMuaGFuZGxlRGlkQ2hhbmdlUHJvcGVydHkoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLkN3ZCwgdmFsdWU6IGFjdGlvbi5jd2QudG9TdHJpbmcoKSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuVGVybWluYWxUaXRsZUNoYW5nZWQ6XG5cdFx0XHRcdHRoaXMuX3Byb3BlcnRpZXMudGl0bGUgPSBhY3Rpb24udGl0bGU7XG5cdFx0XHRcdHRoaXMuaGFuZGxlRGlkQ2hhbmdlUHJvcGVydHkoeyB0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLlRpdGxlLCB2YWx1ZTogYWN0aW9uLnRpdGxlIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbFJlc2l6ZWQ6XG5cdFx0XHRcdC8vIE9ubHkgYXBwbHkgcmVzaXplIGZyb20gb3RoZXIgY2xpZW50cyBcdTIwMTQgdGhpcyBjbGllbnQgb3duc1xuXHRcdFx0XHQvLyBpdHMgb3duIGRpbWVuc2lvbnMgYW5kIGVjaG9pbmcgYmFjayBvdXIgb3duIHJlc2l6ZSB3b3VsZFxuXHRcdFx0XHQvLyBjYXVzZSBhIGZlZWRiYWNrIGxvb3AuXG5cdFx0XHRcdGlmIChlbnZlbG9wZS5vcmlnaW4/LmNsaWVudElkICE9PSB0aGlzLl9jb25uZWN0aW9uLmNsaWVudElkKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVEaWRDaGFuZ2VQcm9wZXJ0eSh7XG5cdFx0XHRcdFx0XHR0eXBlOiBQcm9jZXNzUHJvcGVydHlUeXBlLk92ZXJyaWRlRGltZW5zaW9ucyxcblx0XHRcdFx0XHRcdHZhbHVlOiB7IGNvbHM6IGFjdGlvbi5jb2xzLCByb3dzOiBhY3Rpb24ucm93cyB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZERldGVjdGlvbkF2YWlsYWJsZTpcblx0XHRcdFx0aWYgKCF0aGlzLl9zdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0XHR0aGlzLl9zdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24gPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX29uU3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRFeGVjdXRlZDpcblx0XHRcdFx0aWYgKGlzQ29waWxvdFNlbnRpbmVsQ29tbWFuZChhY3Rpb24uY29tbWFuZExpbmUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3VwcHJlc3NlZENvbW1hbmRJZHMuYWRkKGFjdGlvbi5jb21tYW5kSWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuaGFuZGxlRGF0YShnZXRBaHBDb21tYW5kTWFya0NvZGUoYWN0aW9uLmNvbW1hbmRJZCwgQWhwQ29tbWFuZE1hcmtLaW5kLkV4ZWN1dGVkKSk7XG5cdFx0XHRcdHRoaXMuX29uQ29tbWFuZEV4ZWN1dGVkLmZpcmUoe1xuXHRcdFx0XHRcdGNvbW1hbmRJZDogYWN0aW9uLmNvbW1hbmRJZCxcblx0XHRcdFx0XHRjb21tYW5kTGluZTogYWN0aW9uLmNvbW1hbmRMaW5lLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogYWN0aW9uLnRpbWVzdGFtcCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlRlcm1pbmFsQ29tbWFuZEZpbmlzaGVkOlxuXHRcdFx0XHRpZiAodGhpcy5fc3VwcHJlc3NlZENvbW1hbmRJZHMuZGVsZXRlKGFjdGlvbi5jb21tYW5kSWQpKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5oYW5kbGVEYXRhKGdldEFocENvbW1hbmRNYXJrQ29kZShhY3Rpb24uY29tbWFuZElkLCBBaHBDb21tYW5kTWFya0tpbmQuRW5kKSk7XG5cdFx0XHRcdHRoaXMuX29uQ29tbWFuZEZpbmlzaGVkLmZpcmUoe1xuXHRcdFx0XHRcdGNvbW1hbmRJZDogYWN0aW9uLmNvbW1hbmRJZCxcblx0XHRcdFx0XHRleGl0Q29kZTogYWN0aW9uLmV4aXRDb2RlLFxuXHRcdFx0XHRcdGR1cmF0aW9uTXM6IGFjdGlvbi5kdXJhdGlvbk1zLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxheXMgc3RydWN0dXJlZCB0ZXJtaW5hbCBjb250ZW50IHBhcnRzIGZyb20gdGhlIGluaXRpYWwgc3RhdGUgc25hcHNob3QuXG5cdCAqIEVtaXRzIGNvbW1hbmQgbGlmZWN5Y2xlIGV2ZW50cyBmb3IgY29tbWFuZCBwYXJ0cyBzbyB0aGF0IGNvbnN1bWVyc1xuXHQgKiAoZS5nLiB7QGxpbmsgQWhwVGVybWluYWxDb21tYW5kU291cmNlfSkgY2FuIHJlY29uc3RydWN0IGNvbW1hbmQgaGlzdG9yeS5cblx0ICovXG5cdHByaXZhdGUgX3JlcGxheUNvbnRlbnQoY29udGVudDogVGVybWluYWxDb250ZW50UGFydFtdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGNvbnRlbnQpIHtcblx0XHRcdGlmIChwYXJ0LnR5cGUgPT09ICd1bmNsYXNzaWZpZWQnKSB7XG5cdFx0XHRcdGlmIChwYXJ0LnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5oYW5kbGVEYXRhKHBhcnQudmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQudHlwZSA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdGlmIChpc0NvcGlsb3RTZW50aW5lbENvbW1hbmQocGFydC5jb21tYW5kTGluZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmhhbmRsZURhdGEoZ2V0QWhwQ29tbWFuZE1hcmtDb2RlKHBhcnQuY29tbWFuZElkLCBBaHBDb21tYW5kTWFya0tpbmQuRXhlY3V0ZWQpKTtcblx0XHRcdFx0dGhpcy5fb25Db21tYW5kRXhlY3V0ZWQuZmlyZSh7XG5cdFx0XHRcdFx0Y29tbWFuZElkOiBwYXJ0LmNvbW1hbmRJZCxcblx0XHRcdFx0XHRjb21tYW5kTGluZTogcGFydC5jb21tYW5kTGluZSxcblx0XHRcdFx0XHR0aW1lc3RhbXA6IHBhcnQudGltZXN0YW1wLFxuXHRcdFx0XHRcdHN0b3JlZE91dHB1dDogcGFydC5vdXRwdXQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAocGFydC5vdXRwdXQpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZURhdGEocGFydC5vdXRwdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChwYXJ0LmlzQ29tcGxldGUpIHtcblx0XHRcdFx0XHR0aGlzLmhhbmRsZURhdGEoZ2V0QWhwQ29tbWFuZE1hcmtDb2RlKHBhcnQuY29tbWFuZElkLCBBaHBDb21tYW5kTWFya0tpbmQuRW5kKSk7XG5cdFx0XHRcdFx0dGhpcy5fb25Db21tYW5kRmluaXNoZWQuZmlyZSh7XG5cdFx0XHRcdFx0XHRjb21tYW5kSWQ6IHBhcnQuY29tbWFuZElkLFxuXHRcdFx0XHRcdFx0ZXhpdENvZGU6IHBhcnQuZXhpdENvZGUsXG5cdFx0XHRcdFx0XHRkdXJhdGlvbk1zOiBwYXJ0LmR1cmF0aW9uTXMsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgYSBjd2QgVVJJIGZvciBzZW5kaW5nIG92ZXIgdGhlIHByb3RvY29sLiBBZ2VudC1ob3N0IFVSSXNcblx0ICogYXJlIHVud3JhcHBlZCB0byB0aGVpciBvcmlnaW5hbCBVUkkgdmlhIHtAbGluayBmcm9tQWdlbnRIb3N0VXJpfS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVDd2RGb3JQcm90b2NvbChjd2Q6IFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFjd2QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChjd2Quc2NoZW1lID09PSBBR0VOVF9IT1NUX1NDSEVNRSkge1xuXHRcdFx0cmV0dXJuIGZyb21BZ2VudEhvc3RVcmkoY3dkKS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3dkLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRpbnB1dChkYXRhOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5SZXBsYXkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhcnRCYXJyaWVyLndhaXQoKS50aGVuKCgpID0+IHtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24uZGlzcGF0Y2goXG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbElucHV0LCBkYXRhIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cmVzaXplKGNvbHM6IG51bWJlciwgcm93czogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luUmVwbGF5IHx8ICh0aGlzLl9sYXN0RGltZW5zaW9ucy5jb2xzID09PSBjb2xzICYmIHRoaXMuX2xhc3REaW1lbnNpb25zLnJvd3MgPT09IHJvd3MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3REaW1lbnNpb25zLmNvbHMgPSBjb2xzO1xuXHRcdHRoaXMuX2xhc3REaW1lbnNpb25zLnJvd3MgPSByb3dzO1xuXHRcdHRoaXMuX3N0YXJ0QmFycmllci53YWl0KCkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9uLmRpc3BhdGNoKFxuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbFVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxSZXNpemVkLCBjb2xzLCByb3dzIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0c2h1dGRvd24oX2ltbWVkaWF0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXJ0QmFycmllci53YWl0KCkudGhlbigoKSA9PiB7XG5cdFx0XHQvLyBJbiBhdHRhY2gtb25seSBtb2RlLCBkb24ndCBkaXNwb3NlIHRoZSBzZXJ2ZXItc2lkZSB0ZXJtaW5hbCBcdTIwMTRcblx0XHRcdC8vIGl0J3Mgb3duZWQgYnkgdGhlIHRvb2wvc2Vzc2lvbiwgbm90IGJ5IHRoaXMgY2xpZW50LlxuXHRcdFx0aWYgKCF0aGlzLl9vcHRpb25zPy5hdHRhY2hPbmx5KSB7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb24uZGlzcG9zZVRlcm1pbmFsKHRoaXMuX3Rlcm1pbmFsVXJpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uUmVmID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuaGFuZGxlRXhpdCh1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZ2V0SW5pdGlhbEN3ZCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsQ3dkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZ2V0Q3dkKCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3BlcnRpZXMuY3dkIHx8IHRoaXMuX2luaXRpYWxDd2Q7XG5cdH1cblxuXHRhc3luYyBjbGVhckJ1ZmZlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBTZW5kIGEgY2xlYXIgYWN0aW9uIHRvIHRoZSBhZ2VudCBob3N0XG5cdFx0dGhpcy5fY29ubmVjdGlvbi5kaXNwYXRjaChcblx0XHRcdHRoaXMuX3Rlcm1pbmFsVXJpLnRvU3RyaW5nKCksXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDbGVhcmVkIH0sXG5cdFx0KTtcblx0fVxuXG5cdGFja25vd2xlZGdlRGF0YUV2ZW50KF9jaGFyQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdC8vIE5vIGZsb3cgY29udHJvbCBuZWVkZWQgZm9yIEFIUCB0ZXJtaW5hbHNcblx0fVxuXG5cdGFzeW5jIHNldFVuaWNvZGVWZXJzaW9uKF92ZXJzaW9uOiAnNicgfCAnMTEnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTm90IGFwcGxpY2FibGVcblx0fVxuXG5cdHByb2Nlc3NCaW5hcnkoX2RhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE5vdCBhcHBsaWNhYmxlXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG5cblx0c2VuZFNpZ25hbChfc2lnbmFsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBOb3QgYXBwbGljYWJsZVxuXHR9XG5cblx0YXN5bmMgcmVmcmVzaFByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPih0eXBlOiBUKTogUHJvbWlzZTxJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3BlcnRpZXNbdHlwZV07XG5cdH1cblxuXHRhc3luYyB1cGRhdGVQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4oX3R5cGU6IFQsIF92YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE5vdCBhcHBsaWNhYmxlXG5cdH1cblxuXHQvKipcblx0ICogUmVjb25uZWN0IHRoaXMgcHR5IHRvIGEgbmV3IGFnZW50IGhvc3QgY29ubmVjdGlvbi4gVGVhcnMgZG93biB0aGVcblx0ICogb2xkIHN1YnNjcmlwdGlvbiBhbmQgcmUtc3Vic2NyaWJlcyB3aXRoIHRoZSBuZXcgY29ubmVjdGlvbiwgcmVwbGF5aW5nXG5cdCAqIGNvbnRlbnQgZnJvbSB0aGUgc2VydmVyLXNpZGUgc25hcHNob3QuIFRlcm1pbmFsIG91dHB1dCBkdXJpbmcgdGhlXG5cdCAqIGRpc2Nvbm5lY3QgZ2FwIGlzIGEgc3RyZWFtIChub3Qgc3RhdGUpLCBzbyBzb21lIGxvc3MgaXMgZXhwZWN0ZWQuXG5cdCAqXG5cdCAqIEByZXR1cm5zIGB0cnVlYCBpZiByZWNvbm5lY3Rpb24gc3VjY2VlZGVkLCBgZmFsc2VgIG90aGVyd2lzZS5cblx0ICovXG5cdGFzeW5jIHJlY29ubmVjdChuZXdDb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gQ2xlYW4gdXAgb2xkIHN1YnNjcmlwdGlvblxuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9uUmVmPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc3Vic2NyaXB0aW9uUmVmID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gU3dhcCBjb25uZWN0aW9uXG5cdFx0dGhpcy5fY29ubmVjdGlvbiA9IG5ld0Nvbm5lY3Rpb247XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gUmUtc3Vic2NyaWJlIHRvIHRoZSB0ZXJtaW5hbCBzdGF0ZVxuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uUmVmID0gdGhpcy5fY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlRlcm1pbmFsLCB0aGlzLl90ZXJtaW5hbFVyaSwgJ0FnZW50SG9zdFB0eScpO1xuXHRcdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gdGhpcy5fc3Vic2NyaXB0aW9uUmVmLm9iamVjdDtcblxuXHRcdFx0Ly8gV2FpdCBmb3IgaHlkcmF0aW9uIHdpdGggYSB0aW1lb3V0IFx1MjAxNCB0aGUgdGVybWluYWwgbWF5IG5vIGxvbmdlclxuXHRcdFx0Ly8gZXhpc3Qgb24gdGhlIHNlcnZlciAoZS5nLiBhZ2VudCBwcm9jZXNzIHJlc3RhcnRlZCkuXG5cdFx0XHRpZiAoc3Vic2NyaXB0aW9uLnZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgUkVDT05ORUNUX0hZRFJBVEVfVElNRU9VVF9NUyA9IDEwXzAwMDtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCdSZWNvbm5lY3QgaHlkcmF0aW9uIHRpbWVkIG91dCcpKTtcblx0XHRcdFx0XHR9LCBSRUNPTk5FQ1RfSFlEUkFURV9USU1FT1VUX01TKTtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHN1YnNjcmlwdGlvbi5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRjbGVhclRpbWVvdXQodGltZXIpO1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuX3N1YnNjcmlwdGlvbkRpc3Bvc2FibGVzLmFkZChsaXN0ZW5lcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHN1YnNjcmlwdGlvbi52YWx1ZSBhcyBUZXJtaW5hbFN0YXRlO1xuXG5cdFx0XHRpZiAoc3RhdGUuc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uICYmICF0aGlzLl9zdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fc3VwcG9ydHNDb21tYW5kRGV0ZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fb25TdXBwb3J0c0NvbW1hbmREZXRlY3Rpb24uZmlyZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGVhciB0aGUgdGVybWluYWwgYnVmZmVyIGJlZm9yZSByZXBsYXlpbmcgdG8gYXZvaWQgZHVwbGljYXRlXG5cdFx0XHQvLyBjb250ZW50LiBFU0NbMkogY2xlYXJzIHRoZSBzY3JlZW4sIEVTQ1szSiBjbGVhcnMgc2Nyb2xsYmFjayxcblx0XHRcdC8vIEVTQ1tIIG1vdmVzIGN1cnNvciB0byBob21lIHBvc2l0aW9uLlxuXHRcdFx0dGhpcy5oYW5kbGVEYXRhKCdcXHgxYlsySlxceDFiWzNKXFx4MWJbSCcpO1xuXHRcdFx0dGhpcy5fcmVwbGF5Q29udGVudChzdGF0ZS5jb250ZW50KTtcblxuXHRcdFx0Ly8gVXBkYXRlIGN3ZC90aXRsZSBpZiB0aGV5IGNoYW5nZWRcblx0XHRcdGlmIChzdGF0ZS5jd2QpIHtcblx0XHRcdFx0dGhpcy5fcHJvcGVydGllcy5jd2QgPSBzdGF0ZS5jd2QudG9TdHJpbmcoKTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS50aXRsZSkge1xuXHRcdFx0XHR0aGlzLl9wcm9wZXJ0aWVzLnRpdGxlID0gc3RhdGUudGl0bGU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdpcmUgdXAgYWN0aW9uIGxpc3RlbmVyIGZvciBzdHJlYW1pbmcgdXBkYXRlc1xuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9uRGlzcG9zYWJsZXMuYWRkKHN1YnNjcmlwdGlvbi5vbkRpZEFwcGx5QWN0aW9uKGVudmVsb3BlID0+IHtcblx0XHRcdFx0dGhpcy5faGFuZGxlQWN0aW9uKGVudmVsb3BlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zb2xlLndhcm4oJ1tBZ2VudEhvc3RQdHldIFJlY29ubmVjdGlvbiBmYWlsZWQ6JywgZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKiogVGhlIHRlcm1pbmFsIFVSSSB0aGlzIHB0eSBpcyBzdWJzY3JpYmVkIHRvLiAqL1xuXHRnZXQgdGVybWluYWxVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxVcmk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N1YnNjcmlwdGlvblJlZiA9IHVuZGVmaW5lZDtcblx0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
