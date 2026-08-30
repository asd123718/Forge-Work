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
import { handleVetos } from "../../../../platform/lifecycle/common/lifecycle.js";
import { ILifecycleService, WillShutdownJoinerOrder } from "../common/lifecycle.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ipcRenderer } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AbstractLifecycleService } from "../common/lifecycleService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Promises, disposableTimeout, raceCancellation } from "../../../../base/common/async.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
let NativeLifecycleService = class extends AbstractLifecycleService {
  constructor(nativeHostService, storageService, logService) {
    super(logService, storageService);
    this.nativeHostService = nativeHostService;
    this.registerListeners();
  }
  registerListeners() {
    const windowId = this.nativeHostService.windowId;
    ipcRenderer.on("vscode:onBeforeUnload", async (event, ...args) => {
      const reply = args[0];
      this.logService.trace(`[lifecycle] onBeforeUnload (reason: ${reply.reason})`);
      const veto = await this.handleBeforeShutdown(reply.reason);
      if (veto) {
        this.logService.trace("[lifecycle] onBeforeUnload prevented via veto");
        this._onShutdownVeto.fire();
        ipcRenderer.send(reply.cancelChannel, windowId);
      } else {
        this.logService.trace("[lifecycle] onBeforeUnload continues without veto");
        this.shutdownReason = reply.reason;
        ipcRenderer.send(reply.okChannel, windowId);
      }
    });
    ipcRenderer.on("vscode:onWillUnload", async (event, ...args) => {
      const reply = args[0];
      this.logService.trace(`[lifecycle] onWillUnload (reason: ${reply.reason})`);
      await this.handleWillShutdown(reply.reason);
      this._onDidShutdown.fire();
      ipcRenderer.send(reply.replyChannel, windowId);
    });
  }
  async handleBeforeShutdown(reason) {
    const logService = this.logService;
    const vetos = [];
    const pendingVetos = /* @__PURE__ */ new Set();
    let finalVeto = void 0;
    let finalVetoId = void 0;
    this._onBeforeShutdown.fire({
      reason,
      veto(value, id) {
        vetos.push(value);
        if (value === true) {
          logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
        } else if (value instanceof Promise) {
          pendingVetos.add(id);
          value.then((veto) => {
            if (veto === true) {
              logService.info(`[lifecycle]: Shutdown was prevented (id: ${id})`);
            }
          }).finally(() => pendingVetos.delete(id));
        }
      },
      finalVeto(value, id) {
        if (!finalVeto) {
          finalVeto = value;
          finalVetoId = id;
        } else {
          throw new Error(`[lifecycle]: Final veto is already defined (id: ${id})`);
        }
      }
    });
    const longRunningBeforeShutdownWarning = disposableTimeout(() => {
      logService.warn(`[lifecycle] onBeforeShutdown is taking a long time, pending operations: ${Array.from(pendingVetos).join(", ")}`);
    }, NativeLifecycleService.BEFORE_SHUTDOWN_WARNING_DELAY);
    try {
      let veto = await handleVetos(vetos, (error) => this.handleBeforeShutdownError(error, reason));
      if (veto) {
        return veto;
      }
      if (finalVeto) {
        try {
          pendingVetos.add(finalVetoId);
          veto = await finalVeto();
          if (veto) {
            logService.info(`[lifecycle]: Shutdown was prevented by final veto (id: ${finalVetoId})`);
          }
        } catch (error) {
          veto = true;
          this.handleBeforeShutdownError(error, reason);
        }
      }
      return veto;
    } finally {
      longRunningBeforeShutdownWarning.dispose();
    }
  }
  handleBeforeShutdownError(error, reason) {
    this.logService.error(`[lifecycle]: Error during before-shutdown phase (error: ${toErrorMessage(error)})`);
    this._onBeforeShutdownError.fire({ reason, error });
  }
  async handleWillShutdown(reason) {
    this._willShutdown = true;
    const joiners = [];
    const lastJoiners = [];
    const pendingJoiners = /* @__PURE__ */ new Set();
    const cts = new CancellationTokenSource();
    this._onWillShutdown.fire({
      reason,
      token: cts.token,
      joiners: () => Array.from(pendingJoiners.values()),
      join(promiseOrPromiseFn, joiner) {
        pendingJoiners.add(joiner);
        if (joiner.order === WillShutdownJoinerOrder.Last) {
          const promiseFn = typeof promiseOrPromiseFn === "function" ? promiseOrPromiseFn : () => promiseOrPromiseFn;
          lastJoiners.push(() => promiseFn().finally(() => pendingJoiners.delete(joiner)));
        } else {
          const promise = typeof promiseOrPromiseFn === "function" ? promiseOrPromiseFn() : promiseOrPromiseFn;
          promise.finally(() => pendingJoiners.delete(joiner));
          joiners.push(promise);
        }
      },
      force: () => {
        cts.dispose(true);
      }
    });
    const longRunningWillShutdownWarning = disposableTimeout(() => {
      this.logService.warn(`[lifecycle] onWillShutdown is taking a long time, pending operations: ${Array.from(pendingJoiners).map((joiner) => joiner.id).join(", ")}`);
    }, NativeLifecycleService.WILL_SHUTDOWN_WARNING_DELAY);
    try {
      await raceCancellation(Promises.settled(joiners), cts.token);
    } catch (error) {
      this.logService.error(`[lifecycle]: Error during will-shutdown phase in default joiners (error: ${toErrorMessage(error)})`);
    }
    try {
      await raceCancellation(Promises.settled(lastJoiners.map((lastJoiner) => lastJoiner())), cts.token);
    } catch (error) {
      this.logService.error(`[lifecycle]: Error during will-shutdown phase in last joiners (error: ${toErrorMessage(error)})`);
    }
    longRunningWillShutdownWarning.dispose();
  }
  shutdown() {
    return this.nativeHostService.closeWindow();
  }
};
NativeLifecycleService.BEFORE_SHUTDOWN_WARNING_DELAY = 5e3;
NativeLifecycleService.WILL_SHUTDOWN_WARNING_DELAY = 800;
NativeLifecycleService = __decorateClass([
  __decorateParam(0, INativeHostService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, ILogService)
], NativeLifecycleService);
registerSingleton(ILifecycleService, NativeLifecycleService, InstantiationType.Eager);
export {
  NativeLifecycleService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxsaWZlY3ljbGVcXGVsZWN0cm9uLWJyb3dzZXJcXGxpZmVjeWNsZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBoYW5kbGVWZXRvcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNodXRkb3duUmVhc29uLCBJTGlmZWN5Y2xlU2VydmljZSwgSVdpbGxTaHV0ZG93bkV2ZW50Sm9pbmVyLCBXaWxsU2h1dGRvd25Kb2luZXJPcmRlciB9IGZyb20gJy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBpcGNSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL2dsb2JhbHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdExpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbGlmZWN5Y2xlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IFByb21pc2VzLCBkaXNwb3NhYmxlVGltZW91dCwgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZUxpZmVjeWNsZVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdExpZmVjeWNsZVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEJFRk9SRV9TSFVURE9XTl9XQVJOSU5HX0RFTEFZID0gNTAwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgV0lMTF9TSFVURE9XTl9XQVJOSU5HX0RFTEFZID0gODAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBuYXRpdmVIb3N0U2VydmljZTogSU5hdGl2ZUhvc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIobG9nU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHRjb25zdCB3aW5kb3dJZCA9IHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uud2luZG93SWQ7XG5cblx0XHQvLyBNYWluIHNpZGUgaW5kaWNhdGVzIHRoYXQgd2luZG93IGlzIGFib3V0IHRvIHVubG9hZCwgY2hlY2sgZm9yIHZldG9zXG5cdFx0aXBjUmVuZGVyZXIub24oJ3ZzY29kZTpvbkJlZm9yZVVubG9hZCcsIGFzeW5jIChldmVudDogdW5rbm93biwgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRjb25zdCByZXBseSA9IGFyZ3NbMF0gYXMgeyBva0NoYW5uZWw6IHN0cmluZzsgY2FuY2VsQ2hhbm5lbDogc3RyaW5nOyByZWFzb246IFNodXRkb3duUmVhc29uIH07XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtsaWZlY3ljbGVdIG9uQmVmb3JlVW5sb2FkIChyZWFzb246ICR7cmVwbHkucmVhc29ufSlgKTtcblxuXHRcdFx0Ly8gdHJpZ2dlciBvbkJlZm9yZVNodXRkb3duIGV2ZW50cyBhbmQgdmV0byBjb2xsZWN0aW5nXG5cdFx0XHRjb25zdCB2ZXRvID0gYXdhaXQgdGhpcy5oYW5kbGVCZWZvcmVTaHV0ZG93bihyZXBseS5yZWFzb24pO1xuXG5cdFx0XHQvLyB2ZXRvOiBjYW5jZWwgdW5sb2FkXG5cdFx0XHRpZiAodmV0bykge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tsaWZlY3ljbGVdIG9uQmVmb3JlVW5sb2FkIHByZXZlbnRlZCB2aWEgdmV0bycpO1xuXG5cdFx0XHRcdC8vIEluZGljYXRlIGFzIGV2ZW50XG5cdFx0XHRcdHRoaXMuX29uU2h1dGRvd25WZXRvLmZpcmUoKTtcblxuXHRcdFx0XHRpcGNSZW5kZXJlci5zZW5kKHJlcGx5LmNhbmNlbENoYW5uZWwsIHdpbmRvd0lkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gbm8gdmV0bzogYWxsb3cgdW5sb2FkXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbbGlmZWN5Y2xlXSBvbkJlZm9yZVVubG9hZCBjb250aW51ZXMgd2l0aG91dCB2ZXRvJyk7XG5cblx0XHRcdFx0dGhpcy5zaHV0ZG93blJlYXNvbiA9IHJlcGx5LnJlYXNvbjtcblx0XHRcdFx0aXBjUmVuZGVyZXIuc2VuZChyZXBseS5va0NoYW5uZWwsIHdpbmRvd0lkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIE1haW4gc2lkZSBpbmRpY2F0ZXMgdGhhdCB3ZSB3aWxsIGluZGVlZCBzaHV0ZG93blxuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6b25XaWxsVW5sb2FkJywgYXN5bmMgKGV2ZW50OiB1bmtub3duLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHtcblx0XHRcdGNvbnN0IHJlcGx5ID0gYXJnc1swXSBhcyB7IHJlcGx5Q2hhbm5lbDogc3RyaW5nOyByZWFzb246IFNodXRkb3duUmVhc29uIH07XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtsaWZlY3ljbGVdIG9uV2lsbFVubG9hZCAocmVhc29uOiAke3JlcGx5LnJlYXNvbn0pYCk7XG5cblx0XHRcdC8vIHRyaWdnZXIgb25XaWxsU2h1dGRvd24gZXZlbnRzIGFuZCBqb2luaW5nXG5cdFx0XHRhd2FpdCB0aGlzLmhhbmRsZVdpbGxTaHV0ZG93bihyZXBseS5yZWFzb24pO1xuXG5cdFx0XHQvLyB0cmlnZ2VyIG9uRGlkU2h1dGRvd24gZXZlbnQgbm93IHRoYXQgd2Uga25vdyB3ZSB3aWxsIHF1aXRcblx0XHRcdHRoaXMuX29uRGlkU2h1dGRvd24uZmlyZSgpO1xuXG5cdFx0XHQvLyBhY2tub3dsZWRnZSB0byBtYWluIHNpZGVcblx0XHRcdGlwY1JlbmRlcmVyLnNlbmQocmVwbHkucmVwbHlDaGFubmVsLCB3aW5kb3dJZCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaGFuZGxlQmVmb3JlU2h1dGRvd24ocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSB0aGlzLmxvZ1NlcnZpY2U7XG5cblx0XHRjb25zdCB2ZXRvczogKGJvb2xlYW4gfCBQcm9taXNlPGJvb2xlYW4+KVtdID0gW107XG5cdFx0Y29uc3QgcGVuZGluZ1ZldG9zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRsZXQgZmluYWxWZXRvOiAoKCkgPT4gYm9vbGVhbiB8IFByb21pc2U8Ym9vbGVhbj4pIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBmaW5hbFZldG9JZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gYmVmb3JlLXNodXRkb3duIGV2ZW50IHdpdGggdmV0byBzdXBwb3J0XG5cdFx0dGhpcy5fb25CZWZvcmVTaHV0ZG93bi5maXJlKHtcblx0XHRcdHJlYXNvbixcblx0XHRcdHZldG8odmFsdWUsIGlkKSB7XG5cdFx0XHRcdHZldG9zLnB1c2godmFsdWUpO1xuXG5cdFx0XHRcdC8vIExvZyBhbnkgdmV0byBpbnN0YW50bHlcblx0XHRcdFx0aWYgKHZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS5pbmZvKGBbbGlmZWN5Y2xlXTogU2h1dGRvd24gd2FzIHByZXZlbnRlZCAoaWQ6ICR7aWR9KWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVHJhY2sgcHJvbWlzZSBjb21wbGV0aW9uXG5cdFx0XHRcdGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHRcdHBlbmRpbmdWZXRvcy5hZGQoaWQpO1xuXHRcdFx0XHRcdHZhbHVlLnRoZW4odmV0byA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodmV0byA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRsb2dTZXJ2aWNlLmluZm8oYFtsaWZlY3ljbGVdOiBTaHV0ZG93biB3YXMgcHJldmVudGVkIChpZDogJHtpZH0pYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkuZmluYWxseSgoKSA9PiBwZW5kaW5nVmV0b3MuZGVsZXRlKGlkKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRmaW5hbFZldG8odmFsdWUsIGlkKSB7XG5cdFx0XHRcdGlmICghZmluYWxWZXRvKSB7XG5cdFx0XHRcdFx0ZmluYWxWZXRvID0gdmFsdWU7XG5cdFx0XHRcdFx0ZmluYWxWZXRvSWQgPSBpZDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtsaWZlY3ljbGVdOiBGaW5hbCB2ZXRvIGlzIGFscmVhZHkgZGVmaW5lZCAoaWQ6ICR7aWR9KWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb25nUnVubmluZ0JlZm9yZVNodXRkb3duV2FybmluZyA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW2xpZmVjeWNsZV0gb25CZWZvcmVTaHV0ZG93biBpcyB0YWtpbmcgYSBsb25nIHRpbWUsIHBlbmRpbmcgb3BlcmF0aW9uczogJHtBcnJheS5mcm9tKHBlbmRpbmdWZXRvcykuam9pbignLCAnKX1gKTtcblx0XHR9LCBOYXRpdmVMaWZlY3ljbGVTZXJ2aWNlLkJFRk9SRV9TSFVURE9XTl9XQVJOSU5HX0RFTEFZKTtcblxuXHRcdHRyeSB7XG5cblx0XHRcdC8vIEZpcnN0OiBydW4gbGlzdCBvZiB2ZXRvcyBpbiBwYXJhbGxlbFxuXHRcdFx0bGV0IHZldG8gPSBhd2FpdCBoYW5kbGVWZXRvcyh2ZXRvcywgZXJyb3IgPT4gdGhpcy5oYW5kbGVCZWZvcmVTaHV0ZG93bkVycm9yKGVycm9yLCByZWFzb24pKTtcblx0XHRcdGlmICh2ZXRvKSB7XG5cdFx0XHRcdHJldHVybiB2ZXRvO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZWNvbmQ6IHJ1biB0aGUgZmluYWwgdmV0byBpZiBkZWZpbmVkXG5cdFx0XHRpZiAoZmluYWxWZXRvKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cGVuZGluZ1ZldG9zLmFkZChmaW5hbFZldG9JZCBhcyB1bmtub3duIGFzIHN0cmluZyk7XG5cdFx0XHRcdFx0dmV0byA9IGF3YWl0IChmaW5hbFZldG8gYXMgKCkgPT4gUHJvbWlzZTxib29sZWFuPikoKTtcblx0XHRcdFx0XHRpZiAodmV0bykge1xuXHRcdFx0XHRcdFx0bG9nU2VydmljZS5pbmZvKGBbbGlmZWN5Y2xlXTogU2h1dGRvd24gd2FzIHByZXZlbnRlZCBieSBmaW5hbCB2ZXRvIChpZDogJHtmaW5hbFZldG9JZH0pYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHZldG8gPSB0cnVlOyAvLyB0cmVhdCBlcnJvciBhcyB2ZXRvXG5cblx0XHRcdFx0XHR0aGlzLmhhbmRsZUJlZm9yZVNodXRkb3duRXJyb3IoZXJyb3IsIHJlYXNvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZldG87XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGxvbmdSdW5uaW5nQmVmb3JlU2h1dGRvd25XYXJuaW5nLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUJlZm9yZVNodXRkb3duRXJyb3IoZXJyb3I6IEVycm9yLCByZWFzb246IFNodXRkb3duUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbbGlmZWN5Y2xlXTogRXJyb3IgZHVyaW5nIGJlZm9yZS1zaHV0ZG93biBwaGFzZSAoZXJyb3I6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfSlgKTtcblxuXHRcdHRoaXMuX29uQmVmb3JlU2h1dGRvd25FcnJvci5maXJlKHsgcmVhc29uLCBlcnJvciB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBoYW5kbGVXaWxsU2h1dGRvd24ocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3dpbGxTaHV0ZG93biA9IHRydWU7XG5cblx0XHRjb25zdCBqb2luZXJzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRjb25zdCBsYXN0Sm9pbmVyczogKCgpID0+IFByb21pc2U8dm9pZD4pW10gPSBbXTtcblx0XHRjb25zdCBwZW5kaW5nSm9pbmVycyA9IG5ldyBTZXQ8SVdpbGxTaHV0ZG93bkV2ZW50Sm9pbmVyPigpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX29uV2lsbFNodXRkb3duLmZpcmUoe1xuXHRcdFx0cmVhc29uLFxuXHRcdFx0dG9rZW46IGN0cy50b2tlbixcblx0XHRcdGpvaW5lcnM6ICgpID0+IEFycmF5LmZyb20ocGVuZGluZ0pvaW5lcnMudmFsdWVzKCkpLFxuXHRcdFx0am9pbihwcm9taXNlT3JQcm9taXNlRm4sIGpvaW5lcikge1xuXHRcdFx0XHRwZW5kaW5nSm9pbmVycy5hZGQoam9pbmVyKTtcblxuXHRcdFx0XHRpZiAoam9pbmVyLm9yZGVyID09PSBXaWxsU2h1dGRvd25Kb2luZXJPcmRlci5MYXN0KSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvbWlzZUZuID0gdHlwZW9mIHByb21pc2VPclByb21pc2VGbiA9PT0gJ2Z1bmN0aW9uJyA/IHByb21pc2VPclByb21pc2VGbiA6ICgpID0+IHByb21pc2VPclByb21pc2VGbjtcblx0XHRcdFx0XHRsYXN0Sm9pbmVycy5wdXNoKCgpID0+IHByb21pc2VGbigpLmZpbmFsbHkoKCkgPT4gcGVuZGluZ0pvaW5lcnMuZGVsZXRlKGpvaW5lcikpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBwcm9taXNlID0gdHlwZW9mIHByb21pc2VPclByb21pc2VGbiA9PT0gJ2Z1bmN0aW9uJyA/IHByb21pc2VPclByb21pc2VGbigpIDogcHJvbWlzZU9yUHJvbWlzZUZuO1xuXHRcdFx0XHRcdHByb21pc2UuZmluYWxseSgoKSA9PiBwZW5kaW5nSm9pbmVycy5kZWxldGUoam9pbmVyKSk7XG5cdFx0XHRcdFx0am9pbmVycy5wdXNoKHByb21pc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Zm9yY2U6ICgpID0+IHtcblx0XHRcdFx0Y3RzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb25nUnVubmluZ1dpbGxTaHV0ZG93bldhcm5pbmcgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW2xpZmVjeWNsZV0gb25XaWxsU2h1dGRvd24gaXMgdGFraW5nIGEgbG9uZyB0aW1lLCBwZW5kaW5nIG9wZXJhdGlvbnM6ICR7QXJyYXkuZnJvbShwZW5kaW5nSm9pbmVycykubWFwKGpvaW5lciA9PiBqb2luZXIuaWQpLmpvaW4oJywgJyl9YCk7XG5cdFx0fSwgTmF0aXZlTGlmZWN5Y2xlU2VydmljZS5XSUxMX1NIVVRET1dOX1dBUk5JTkdfREVMQVkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb24oUHJvbWlzZXMuc2V0dGxlZChqb2luZXJzKSwgY3RzLnRva2VuKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbbGlmZWN5Y2xlXTogRXJyb3IgZHVyaW5nIHdpbGwtc2h1dGRvd24gcGhhc2UgaW4gZGVmYXVsdCBqb2luZXJzIChlcnJvcjogJHt0b0Vycm9yTWVzc2FnZShlcnJvcil9KWApO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKFByb21pc2VzLnNldHRsZWQobGFzdEpvaW5lcnMubWFwKGxhc3RKb2luZXIgPT4gbGFzdEpvaW5lcigpKSksIGN0cy50b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2xpZmVjeWNsZV06IEVycm9yIGR1cmluZyB3aWxsLXNodXRkb3duIHBoYXNlIGluIGxhc3Qgam9pbmVycyAoZXJyb3I6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfSlgKTtcblx0XHR9XG5cblx0XHRsb25nUnVubmluZ1dpbGxTaHV0ZG93bldhcm5pbmcuZGlzcG9zZSgpO1xuXHR9XG5cblx0c2h1dGRvd24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuY2xvc2VXaW5kb3coKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJTGlmZWN5Y2xlU2VydmljZSwgTmF0aXZlTGlmZWN5Y2xlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRWFnZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUF5QixtQkFBNkMsK0JBQStCO0FBQ3JHLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFVBQVUsbUJBQW1CLHdCQUF3QjtBQUM5RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUVqQyxJQUFNLHlCQUFOLGNBQXFDLHlCQUF5QjtBQUFBLEVBS3BFLFlBQ3NDLG1CQUNwQixnQkFDSixZQUNaO0FBQ0QsVUFBTSxZQUFZLGNBQWM7QUFKSztBQU1yQyxTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQUEsRUFFUSxvQkFBMEI7QUFDakMsVUFBTSxXQUFXLEtBQUssa0JBQWtCO0FBR3hD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
