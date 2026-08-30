import { TimeoutTimer } from "../../../../base/common/async.js";
import { killTree } from "../../../../base/node/processes.js";
import { isWindows } from "../../../../base/common/platform.js";
var McpProcessState = /* @__PURE__ */ ((McpProcessState2) => {
  McpProcessState2[McpProcessState2["Running"] = 0] = "Running";
  McpProcessState2[McpProcessState2["StdinEnded"] = 1] = "StdinEnded";
  McpProcessState2[McpProcessState2["KilledPolite"] = 2] = "KilledPolite";
  McpProcessState2[McpProcessState2["KilledForceful"] = 3] = "KilledForceful";
  return McpProcessState2;
})(McpProcessState || {});
const _McpStdioStateHandler = class _McpStdioStateHandler {
  constructor(_child, _graceTimeMs = _McpStdioStateHandler.GRACE_TIME_MS) {
    this._child = _child;
    this._graceTimeMs = _graceTimeMs;
    this._procState = 0 /* Running */;
  }
  get stopped() {
    return this._procState !== 0 /* Running */;
  }
  /**
   * Initiates graceful shutdown. If called while shutdown is already in progress,
   * forces immediate termination.
   */
  stop() {
    if (this._procState === 0 /* Running */) {
      let graceTime = this._graceTimeMs;
      try {
        this._child.stdin.end();
      } catch (error) {
        graceTime = 1;
      }
      this._procState = 1 /* StdinEnded */;
      this._nextTimeout = new TimeoutTimer(() => this.killPolite(), graceTime);
    } else {
      this._nextTimeout?.dispose();
      this.killForceful();
    }
  }
  async killPolite() {
    this._procState = 2 /* KilledPolite */;
    this._nextTimeout = new TimeoutTimer(() => this.killForceful(), this._graceTimeMs);
    if (this._child.pid) {
      if (!isWindows) {
        await killTree(this._child.pid, false).catch(() => {
          this._child.kill("SIGTERM");
        });
      }
    } else {
      this._child.kill("SIGTERM");
    }
  }
  async killForceful() {
    this._procState = 3 /* KilledForceful */;
    if (this._child.pid) {
      await killTree(this._child.pid, true).catch(() => {
        this._child.kill("SIGKILL");
      });
    } else {
      this._child.kill();
    }
  }
  write(message) {
    if (!this.stopped) {
      this._child.stdin.write(message + "\n");
    }
  }
  dispose() {
    this._nextTimeout?.dispose();
  }
};
_McpStdioStateHandler.GRACE_TIME_MS = 1e4;
let McpStdioStateHandler = _McpStdioStateHandler;
export {
  McpStdioStateHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcbm9kZVxcbWNwU3RkaW9TdGF0ZUhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGlsZFByb2Nlc3NXaXRob3V0TnVsbFN0cmVhbXMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGtpbGxUcmVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9ub2RlL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmNvbnN0IGVudW0gTWNwUHJvY2Vzc1N0YXRlIHtcblx0UnVubmluZyxcblx0U3RkaW5FbmRlZCxcblx0S2lsbGVkUG9saXRlLFxuXHRLaWxsZWRGb3JjZWZ1bCxcbn1cblxuLyoqXG4gKiBNYW5hZ2VzIGdyYWNlZnVsIHNodXRkb3duIG9mIE1DUCBzdGRpbyBjb25uZWN0aW9ucyBmb2xsb3dpbmcgdGhlIE1DUCBzcGVjaWZpY2F0aW9uLlxuICpcbiAqIFBlciBzcGVjLCBzaHV0ZG93biBzaG91bGQ6XG4gKiAxLiBDbG9zZSB0aGUgaW5wdXQgc3RyZWFtIHRvIHRoZSBjaGlsZCBwcm9jZXNzXG4gKiAyLiBXYWl0IGZvciB0aGUgc2VydmVyIHRvIGV4aXQsIG9yIHNlbmQgU0lHVEVSTSBpZiBpdCBkb2Vzbid0IGV4aXQgd2l0aGluIDEwIHNlY29uZHNcbiAqIDMuIFNlbmQgU0lHS0lMTCBpZiB0aGUgc2VydmVyIGRvZXNuJ3QgZXhpdCB3aXRoaW4gMTAgc2Vjb25kcyBhZnRlciBTSUdURVJNXG4gKiA0LiBBbGxvdyBmb3JjZWZ1bCBraWxsaW5nIGlmIGNhbGxlZCB0d2ljZVxuICovXG5leHBvcnQgY2xhc3MgTWNwU3RkaW9TdGF0ZUhhbmRsZXIgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEdSQUNFX1RJTUVfTVMgPSAxMF8wMDA7XG5cblx0cHJpdmF0ZSBfcHJvY1N0YXRlID0gTWNwUHJvY2Vzc1N0YXRlLlJ1bm5pbmc7XG5cdHByaXZhdGUgX25leHRUaW1lb3V0PzogSURpc3Bvc2FibGU7XG5cblx0cHVibGljIGdldCBzdG9wcGVkKCkge1xuXHRcdHJldHVybiB0aGlzLl9wcm9jU3RhdGUgIT09IE1jcFByb2Nlc3NTdGF0ZS5SdW5uaW5nO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY2hpbGQ6IENoaWxkUHJvY2Vzc1dpdGhvdXROdWxsU3RyZWFtcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ncmFjZVRpbWVNczogbnVtYmVyID0gTWNwU3RkaW9TdGF0ZUhhbmRsZXIuR1JBQ0VfVElNRV9NU1xuXHQpIHsgfVxuXG5cdC8qKlxuXHQgKiBJbml0aWF0ZXMgZ3JhY2VmdWwgc2h1dGRvd24uIElmIGNhbGxlZCB3aGlsZSBzaHV0ZG93biBpcyBhbHJlYWR5IGluIHByb2dyZXNzLFxuXHQgKiBmb3JjZXMgaW1tZWRpYXRlIHRlcm1pbmF0aW9uLlxuXHQgKi9cblx0cHVibGljIHN0b3AoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Byb2NTdGF0ZSA9PT0gTWNwUHJvY2Vzc1N0YXRlLlJ1bm5pbmcpIHtcblx0XHRcdGxldCBncmFjZVRpbWUgPSB0aGlzLl9ncmFjZVRpbWVNcztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX2NoaWxkLnN0ZGluLmVuZCgpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gSWYgc3RkaW4uZW5kKCkgZmFpbHMsIGNvbnRpbnVlIHdpdGggdGVybWluYXRpb24gc2VxdWVuY2Vcblx0XHRcdFx0Ly8gVGhpcyBjYW4gaGFwcGVuIGlmIHRoZSBzdHJlYW0gaXMgYWxyZWFkeSBpbiBhbiBlcnJvciBzdGF0ZVxuXHRcdFx0XHRncmFjZVRpbWUgPSAxO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJvY1N0YXRlID0gTWNwUHJvY2Vzc1N0YXRlLlN0ZGluRW5kZWQ7XG5cdFx0XHR0aGlzLl9uZXh0VGltZW91dCA9IG5ldyBUaW1lb3V0VGltZXIoKCkgPT4gdGhpcy5raWxsUG9saXRlKCksIGdyYWNlVGltZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX25leHRUaW1lb3V0Py5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLmtpbGxGb3JjZWZ1bCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMga2lsbFBvbGl0ZSgpIHtcblx0XHR0aGlzLl9wcm9jU3RhdGUgPSBNY3BQcm9jZXNzU3RhdGUuS2lsbGVkUG9saXRlO1xuXHRcdHRoaXMuX25leHRUaW1lb3V0ID0gbmV3IFRpbWVvdXRUaW1lcigoKSA9PiB0aGlzLmtpbGxGb3JjZWZ1bCgpLCB0aGlzLl9ncmFjZVRpbWVNcyk7XG5cblx0XHRpZiAodGhpcy5fY2hpbGQucGlkKSB7XG5cdFx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0XHRhd2FpdCBraWxsVHJlZSh0aGlzLl9jaGlsZC5waWQsIGZhbHNlKS5jYXRjaCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY2hpbGQua2lsbCgnU0lHVEVSTScpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY2hpbGQua2lsbCgnU0lHVEVSTScpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMga2lsbEZvcmNlZnVsKCkge1xuXHRcdHRoaXMuX3Byb2NTdGF0ZSA9IE1jcFByb2Nlc3NTdGF0ZS5LaWxsZWRGb3JjZWZ1bDtcblxuXHRcdGlmICh0aGlzLl9jaGlsZC5waWQpIHtcblx0XHRcdGF3YWl0IGtpbGxUcmVlKHRoaXMuX2NoaWxkLnBpZCwgdHJ1ZSkuY2F0Y2goKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jaGlsZC5raWxsKCdTSUdLSUxMJyk7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY2hpbGQua2lsbCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyB3cml0ZShtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc3RvcHBlZCkge1xuXHRcdFx0dGhpcy5fY2hpbGQuc3RkaW4ud3JpdGUobWVzc2FnZSArICdcXG4nKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpIHtcblx0XHR0aGlzLl9uZXh0VGltZW91dD8uZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUUxQixJQUFXLGtCQUFYLGtCQUFXQSxxQkFBWDtBQUNDLEVBQUFBLGtDQUFBO0FBQ0EsRUFBQUEsa0NBQUE7QUFDQSxFQUFBQSxrQ0FBQTtBQUNBLEVBQUFBLGtDQUFBO0FBSlUsU0FBQUE7QUFBQSxHQUFBO0FBZ0JKLE1BQU0sd0JBQU4sTUFBTSxzQkFBNEM7QUFBQSxFQVV4RCxZQUNrQixRQUNBLGVBQXVCLHNCQUFxQixlQUM1RDtBQUZnQjtBQUNBO0FBVGxCLFNBQVEsYUFBYTtBQUFBLEVBVWpCO0FBQUEsRUFQSixJQUFXLFVBQVU7QUFDcEIsV0FBTyxLQUFLLGVBQWU7QUFBQSxFQUM1QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXTyxPQUFhO0FBQ25CLFFBQUksS0FBSyxlQUFlLGlCQUF5QjtBQUNoRCxVQUFJLFlBQVksS0FBSztBQUNyQixVQUFJO0FBQ0gsYUFBSyxPQUFPLE1BQU0sSUFBSTtBQUFBLE1BQ3ZCLFNBQVMsT0FBTztBQUdmLG9CQUFZO0FBQUEsTUFDYjtBQUNBLFdBQUssYUFBYTtBQUNsQixXQUFLLGVBQWUsSUFBSSxhQUFhLE1BQU0sS0FBSyxXQUFXLEdBQUcsU0FBUztBQUFBLElBQ3hFLE9BQU87QUFDTixXQUFLLGNBQWMsUUFBUTtBQUMzQixXQUFLLGFBQWE7QUFBQSxJQUNuQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsYUFBYTtBQUMxQixTQUFLLGFBQWE7QUFDbEIsU0FBSyxlQUFlLElBQUksYUFBYSxNQUFNLEtBQUssYUFBYSxHQUFHLEtBQUssWUFBWTtBQUVqRixRQUFJLEtBQUssT0FBTyxLQUFLO0FBQ3BCLFVBQUksQ0FBQyxXQUFXO0FBQ2YsY0FBTSxTQUFTLEtBQUssT0FBTyxLQUFLLEtBQUssRUFBRSxNQUFNLE1BQU07QUFDbEQsZUFBSyxPQUFPLEtBQUssU0FBUztBQUFBLFFBQzNCLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSyxPQUFPLEtBQUssU0FBUztBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxlQUFlO0FBQzVCLFNBQUssYUFBYTtBQUVsQixRQUFJLEtBQUssT0FBTyxLQUFLO0FBQ3BCLFlBQU0sU0FBUyxLQUFLLE9BQU8sS0FBSyxJQUFJLEVBQUUsTUFBTSxNQUFNO0FBQ2pELGFBQUssT0FBTyxLQUFLLFNBQVM7QUFBQSxNQUMzQixDQUFDO0FBQUEsSUFDRixPQUFPO0FBQ04sV0FBSyxPQUFPLEtBQUs7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLE1BQU0sU0FBdUI7QUFDbkMsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixXQUFLLE9BQU8sTUFBTSxNQUFNLFVBQVUsSUFBSTtBQUFBLElBQ3ZDO0FBQUEsRUFDRDtBQUFBLEVBRU8sVUFBVTtBQUNoQixTQUFLLGNBQWMsUUFBUTtBQUFBLEVBQzVCO0FBQ0Q7QUF6RWEsc0JBQ1ksZ0JBQWdCO0FBRGxDLElBQU0sdUJBQU47IiwKICAibmFtZXMiOiBbIk1jcFByb2Nlc3NTdGF0ZSJdCn0K
