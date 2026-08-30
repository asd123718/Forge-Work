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
import { parse } from "../../../base/common/path.js";
import { debounce, throttle } from "../../../base/common/decorators.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { listProcesses } from "../../../base/node/ps.js";
import { ILogService } from "../../log/common/log.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["InactiveThrottleDuration"] = 5e3] = "InactiveThrottleDuration";
  Constants2[Constants2["ActiveDebounceDuration"] = 1e3] = "ActiveDebounceDuration";
  return Constants2;
})(Constants || {});
const ignoreProcessNames = [];
let ChildProcessMonitor = class extends Disposable {
  constructor(_pid, _logService) {
    super();
    this._pid = _pid;
    this._logService = _logService;
    this._hasChildProcesses = false;
    this._onDidChangeHasChildProcesses = this._register(new Emitter());
    /**
     * An event that fires when whether the process has child processes changes.
     */
    this.onDidChangeHasChildProcesses = this._onDidChangeHasChildProcesses.event;
  }
  set hasChildProcesses(value) {
    if (this._hasChildProcesses !== value) {
      this._hasChildProcesses = value;
      this._logService.debug("ChildProcessMonitor: Has child processes changed", value);
      this._onDidChangeHasChildProcesses.fire(value);
    }
  }
  /**
   * Whether the process has child processes.
   */
  get hasChildProcesses() {
    return this._hasChildProcesses;
  }
  /**
   * Updates the pid to monitor. This is needed when the pid is not available
   * immediately after spawn (e.g. node-pty deferred conpty connection).
   */
  setPid(pid) {
    this._pid = pid;
  }
  /**
   * Input was triggered on the process.
   */
  handleInput() {
    this._refreshActive();
  }
  /**
   * Output was triggered on the process.
   */
  handleOutput() {
    this._refreshInactive();
  }
  async _refreshActive() {
    if (this._store.isDisposed) {
      return;
    }
    try {
      const processItem = await listProcesses(this._pid);
      this.hasChildProcesses = this._processContainsChildren(processItem);
    } catch (e) {
      this._logService.debug("ChildProcessMonitor: Fetching process tree failed", e);
    }
  }
  _refreshInactive() {
    this._refreshActive();
  }
  _processContainsChildren(processItem) {
    if (!processItem.children) {
      return false;
    }
    if (processItem.children.length === 1) {
      const item = processItem.children[0];
      let cmd;
      if (item.cmd.startsWith(`"`)) {
        cmd = item.cmd.substring(1, item.cmd.indexOf(`"`, 1));
      } else {
        const spaceIndex = item.cmd.indexOf(` `);
        if (spaceIndex === -1) {
          cmd = item.cmd;
        } else {
          cmd = item.cmd.substring(0, spaceIndex);
        }
      }
      return ignoreProcessNames.indexOf(parse(cmd).name) === -1;
    }
    return processItem.children.length > 0;
  }
};
__decorateClass([
  debounce(1e3 /* ActiveDebounceDuration */)
], ChildProcessMonitor.prototype, "_refreshActive", 1);
__decorateClass([
  throttle(5e3 /* InactiveThrottleDuration */)
], ChildProcessMonitor.prototype, "_refreshInactive", 1);
ChildProcessMonitor = __decorateClass([
  __decorateParam(1, ILogService)
], ChildProcessMonitor);
export {
  ChildProcessMonitor,
  ignoreProcessNames
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXG5vZGVcXGNoaWxkUHJvY2Vzc01vbml0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBwYXJzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZGVib3VuY2UsIHRocm90dGxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBQcm9jZXNzSXRlbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgeyBsaXN0UHJvY2Vzc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3BzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5jb25zdCBlbnVtIENvbnN0YW50cyB7XG5cdC8qKlxuXHQgKiBUaGUgYW1vdW50IG9mIHRpbWUgdG8gdGhyb3R0bGUgY2hlY2tzIHdoZW4gdGhlIHByb2Nlc3MgcmVjZWl2ZXMgb3V0cHV0LlxuXHQgKi9cblx0SW5hY3RpdmVUaHJvdHRsZUR1cmF0aW9uID0gNTAwMCxcblx0LyoqXG5cdCAqIFRoZSBhbW91bnQgb2YgdGltZSB0byBkZWJvdW5jZSBjaGVjayB3aGVuIHRoZSBwcm9jZXNzIHJlY2VpdmVzIGlucHV0LlxuXHQgKi9cblx0QWN0aXZlRGVib3VuY2VEdXJhdGlvbiA9IDEwMDAsXG59XG5cbmV4cG9ydCBjb25zdCBpZ25vcmVQcm9jZXNzTmFtZXM6IHN0cmluZ1tdID0gW107XG5cbi8qKlxuICogTW9uaXRvcnMgYSBwcm9jZXNzIGZvciBjaGlsZCBwcm9jZXNzZXMsIGNoZWNraW5nIGF0IGRpZmZlcmluZyB0aW1lcyBkZXBlbmRpbmcgb24gaW5wdXQgYW5kIG91dHB1dFxuICogY2FsbHMgaW50byB0aGUgbW9uaXRvci5cbiAqL1xuZXhwb3J0IGNsYXNzIENoaWxkUHJvY2Vzc01vbml0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfaGFzQ2hpbGRQcm9jZXNzZXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzZXQgaGFzQ2hpbGRQcm9jZXNzZXModmFsdWU6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5faGFzQ2hpbGRQcm9jZXNzZXMgIT09IHZhbHVlKSB7XG5cdFx0XHR0aGlzLl9oYXNDaGlsZFByb2Nlc3NlcyA9IHZhbHVlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ2hpbGRQcm9jZXNzTW9uaXRvcjogSGFzIGNoaWxkIHByb2Nlc3NlcyBjaGFuZ2VkJywgdmFsdWUpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3Nlcy5maXJlKHZhbHVlKTtcblx0XHR9XG5cdH1cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIHByb2Nlc3MgaGFzIGNoaWxkIHByb2Nlc3Nlcy5cblx0ICovXG5cdGdldCBoYXNDaGlsZFByb2Nlc3NlcygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hhc0NoaWxkUHJvY2Vzc2VzOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3NlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBmaXJlcyB3aGVuIHdoZXRoZXIgdGhlIHByb2Nlc3MgaGFzIGNoaWxkIHByb2Nlc3NlcyBjaGFuZ2VzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIYXNDaGlsZFByb2Nlc3NlcyA9IHRoaXMuX29uRGlkQ2hhbmdlSGFzQ2hpbGRQcm9jZXNzZXMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfcGlkOiBudW1iZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgcGlkIHRvIG1vbml0b3IuIFRoaXMgaXMgbmVlZGVkIHdoZW4gdGhlIHBpZCBpcyBub3QgYXZhaWxhYmxlXG5cdCAqIGltbWVkaWF0ZWx5IGFmdGVyIHNwYXduIChlLmcuIG5vZGUtcHR5IGRlZmVycmVkIGNvbnB0eSBjb25uZWN0aW9uKS5cblx0ICovXG5cdHNldFBpZChwaWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3BpZCA9IHBpZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnB1dCB3YXMgdHJpZ2dlcmVkIG9uIHRoZSBwcm9jZXNzLlxuXHQgKi9cblx0aGFuZGxlSW5wdXQoKSB7XG5cdFx0dGhpcy5fcmVmcmVzaEFjdGl2ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE91dHB1dCB3YXMgdHJpZ2dlcmVkIG9uIHRoZSBwcm9jZXNzLlxuXHQgKi9cblx0aGFuZGxlT3V0cHV0KCkge1xuXHRcdHRoaXMuX3JlZnJlc2hJbmFjdGl2ZSgpO1xuXHR9XG5cblx0QGRlYm91bmNlKENvbnN0YW50cy5BY3RpdmVEZWJvdW5jZUR1cmF0aW9uKVxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoQWN0aXZlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwcm9jZXNzSXRlbSA9IGF3YWl0IGxpc3RQcm9jZXNzZXModGhpcy5fcGlkKTtcblx0XHRcdHRoaXMuaGFzQ2hpbGRQcm9jZXNzZXMgPSB0aGlzLl9wcm9jZXNzQ29udGFpbnNDaGlsZHJlbihwcm9jZXNzSXRlbSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZygnQ2hpbGRQcm9jZXNzTW9uaXRvcjogRmV0Y2hpbmcgcHJvY2VzcyB0cmVlIGZhaWxlZCcsIGUpO1xuXHRcdH1cblx0fVxuXG5cdEB0aHJvdHRsZShDb25zdGFudHMuSW5hY3RpdmVUaHJvdHRsZUR1cmF0aW9uKVxuXHRwcml2YXRlIF9yZWZyZXNoSW5hY3RpdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVmcmVzaEFjdGl2ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJvY2Vzc0NvbnRhaW5zQ2hpbGRyZW4ocHJvY2Vzc0l0ZW06IFByb2Nlc3NJdGVtKTogYm9vbGVhbiB7XG5cdFx0Ly8gTm8gY2hpbGQgcHJvY2Vzc2VzXG5cdFx0aWYgKCFwcm9jZXNzSXRlbS5jaGlsZHJlbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEEgc2luZ2xlIGNoaWxkIHByb2Nlc3MsIGhhbmRsZSBzcGVjaWFsIGNhc2VzXG5cdFx0aWYgKHByb2Nlc3NJdGVtLmNoaWxkcmVuLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0Y29uc3QgaXRlbSA9IHByb2Nlc3NJdGVtLmNoaWxkcmVuWzBdO1xuXHRcdFx0bGV0IGNtZDogc3RyaW5nO1xuXHRcdFx0aWYgKGl0ZW0uY21kLnN0YXJ0c1dpdGgoYFwiYCkpIHtcblx0XHRcdFx0Y21kID0gaXRlbS5jbWQuc3Vic3RyaW5nKDEsIGl0ZW0uY21kLmluZGV4T2YoYFwiYCwgMSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc3BhY2VJbmRleCA9IGl0ZW0uY21kLmluZGV4T2YoYCBgKTtcblx0XHRcdFx0aWYgKHNwYWNlSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0Y21kID0gaXRlbS5jbWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y21kID0gaXRlbS5jbWQuc3Vic3RyaW5nKDAsIHNwYWNlSW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaWdub3JlUHJvY2Vzc05hbWVzLmluZGV4T2YocGFyc2UoY21kKS5uYW1lKSA9PT0gLTE7XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbGJhY2ssIGNvdW50IGNoaWxkIHByb2Nlc3Nlc1xuXHRcdHJldHVybiBwcm9jZXNzSXRlbS5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLFVBQVUsZ0JBQWdCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1CQUFtQjtBQUU1QixJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFJQyxFQUFBQSxzQkFBQSw4QkFBMkIsT0FBM0I7QUFJQSxFQUFBQSxzQkFBQSw0QkFBeUIsT0FBekI7QUFSVSxTQUFBQTtBQUFBLEdBQUE7QUFXSixNQUFNLHFCQUErQixDQUFDO0FBTXRDLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBb0JuRCxZQUNTLE1BQ3NCLGFBQzdCO0FBQ0QsVUFBTTtBQUhFO0FBQ3NCO0FBckIvQixTQUFRLHFCQUE4QjtBQWF0QyxTQUFpQixnQ0FBZ0MsS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUl0RjtBQUFBO0FBQUE7QUFBQSxTQUFTLCtCQUErQixLQUFLLDhCQUE4QjtBQUFBLEVBTzNFO0FBQUEsRUF2QkEsSUFBWSxrQkFBa0IsT0FBZ0I7QUFDN0MsUUFBSSxLQUFLLHVCQUF1QixPQUFPO0FBQ3RDLFdBQUsscUJBQXFCO0FBQzFCLFdBQUssWUFBWSxNQUFNLG9EQUFvRCxLQUFLO0FBQ2hGLFdBQUssOEJBQThCLEtBQUssS0FBSztBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBSUEsSUFBSSxvQkFBNkI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFvQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFtQm5FLE9BQU8sS0FBbUI7QUFDekIsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsY0FBYztBQUNiLFNBQUssZUFBZTtBQUFBLEVBQ3JCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxlQUFlO0FBQ2QsU0FBSyxpQkFBaUI7QUFBQSxFQUN2QjtBQUFBLEVBR0EsTUFBYyxpQkFBZ0M7QUFDN0MsUUFBSSxLQUFLLE9BQU8sWUFBWTtBQUMzQjtBQUFBLElBQ0Q7QUFDQSxRQUFJO0FBQ0gsWUFBTSxjQUFjLE1BQU0sY0FBYyxLQUFLLElBQUk7QUFDakQsV0FBSyxvQkFBb0IsS0FBSyx5QkFBeUIsV0FBVztBQUFBLElBQ25FLFNBQVMsR0FBRztBQUNYLFdBQUssWUFBWSxNQUFNLHFEQUFxRCxDQUFDO0FBQUEsSUFDOUU7QUFBQSxFQUNEO0FBQUEsRUFHUSxtQkFBeUI7QUFDaEMsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVRLHlCQUF5QixhQUFtQztBQUVuRSxRQUFJLENBQUMsWUFBWSxVQUFVO0FBQzFCLGFBQU87QUFBQSxJQUNSO0FBR0EsUUFBSSxZQUFZLFNBQVMsV0FBVyxHQUFHO0FBQ3RDLFlBQU0sT0FBTyxZQUFZLFNBQVMsQ0FBQztBQUNuQyxVQUFJO0FBQ0osVUFBSSxLQUFLLElBQUksV0FBVyxHQUFHLEdBQUc7QUFDN0IsY0FBTSxLQUFLLElBQUksVUFBVSxHQUFHLEtBQUssSUFBSSxRQUFRLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDckQsT0FBTztBQUNOLGNBQU0sYUFBYSxLQUFLLElBQUksUUFBUSxHQUFHO0FBQ3ZDLFlBQUksZUFBZSxJQUFJO0FBQ3RCLGdCQUFNLEtBQUs7QUFBQSxRQUNaLE9BQU87QUFDTixnQkFBTSxLQUFLLElBQUksVUFBVSxHQUFHLFVBQVU7QUFBQSxRQUN2QztBQUFBLE1BQ0Q7QUFDQSxhQUFPLG1CQUFtQixRQUFRLE1BQU0sR0FBRyxFQUFFLElBQUksTUFBTTtBQUFBLElBQ3hEO0FBR0EsV0FBTyxZQUFZLFNBQVMsU0FBUztBQUFBLEVBQ3RDO0FBQ0Q7QUEzQ2U7QUFBQSxFQURiLFNBQVMsZ0NBQWdDO0FBQUEsR0FqRDlCLG9CQWtERTtBQWFOO0FBQUEsRUFEUCxTQUFTLGtDQUFrQztBQUFBLEdBOURoQyxvQkErREo7QUEvREksc0JBQU47QUFBQSxFQXNCSjtBQUFBLEdBdEJVOyIsCiAgIm5hbWVzIjogWyJDb25zdGFudHMiXQp9Cg==
