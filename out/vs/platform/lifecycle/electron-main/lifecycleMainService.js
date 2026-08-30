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
import electron from "electron";
import { validatedIpcMain } from "../../../base/parts/ipc/electron-main/ipcMain.js";
import { Barrier, Promises, timeout } from "../../../base/common/async.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { isMacintosh, isWindows } from "../../../base/common/platform.js";
import { cwd } from "../../../base/common/process.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IStateService } from "../../state/node/state.js";
import { UnloadReason } from "../../window/electron-main/window.js";
import { IEnvironmentMainService } from "../../environment/electron-main/environmentMainService.js";
import { getAllWindowsExcludingOffscreen } from "../../windows/electron-main/windows.js";
const ILifecycleMainService = createDecorator("lifecycleMainService");
var ShutdownReason = /* @__PURE__ */ ((ShutdownReason2) => {
  ShutdownReason2[ShutdownReason2["QUIT"] = 1] = "QUIT";
  ShutdownReason2[ShutdownReason2["KILL"] = 2] = "KILL";
  return ShutdownReason2;
})(ShutdownReason || {});
var LifecycleMainPhase = /* @__PURE__ */ ((LifecycleMainPhase2) => {
  LifecycleMainPhase2[LifecycleMainPhase2["Starting"] = 1] = "Starting";
  LifecycleMainPhase2[LifecycleMainPhase2["Ready"] = 2] = "Ready";
  LifecycleMainPhase2[LifecycleMainPhase2["AfterWindowOpen"] = 3] = "AfterWindowOpen";
  LifecycleMainPhase2[LifecycleMainPhase2["Eventually"] = 4] = "Eventually";
  return LifecycleMainPhase2;
})(LifecycleMainPhase || {});
let LifecycleMainService = class extends Disposable {
  constructor(logService, stateService, environmentMainService) {
    super();
    this.logService = logService;
    this.stateService = stateService;
    this.environmentMainService = environmentMainService;
    this._onBeforeShutdown = this._register(new Emitter());
    this.onBeforeShutdown = this._onBeforeShutdown.event;
    this._onWillShutdown = this._register(new Emitter());
    this.onWillShutdown = this._onWillShutdown.event;
    this._onWillLoadWindow = this._register(new Emitter());
    this.onWillLoadWindow = this._onWillLoadWindow.event;
    this._onBeforeCloseWindow = this._register(new Emitter());
    this.onBeforeCloseWindow = this._onBeforeCloseWindow.event;
    this._quitRequested = false;
    this._wasRestarted = false;
    this._phase = 1 /* Starting */;
    this.windowToCloseRequest = /* @__PURE__ */ new Set();
    this.oneTimeListenerTokenGenerator = 0;
    this.windowCounter = 0;
    this.pendingQuitPromise = void 0;
    this.pendingQuitPromiseResolve = void 0;
    this.pendingWillShutdownPromise = void 0;
    this.mapWindowIdToPendingUnload = /* @__PURE__ */ new Map();
    this.phaseWhen = /* @__PURE__ */ new Map();
    this.relaunchHandler = void 0;
    this.resolveRestarted();
    this.when(2 /* Ready */).then(() => this.registerListeners());
  }
  get quitRequested() {
    return this._quitRequested;
  }
  get wasRestarted() {
    return this._wasRestarted;
  }
  get phase() {
    return this._phase;
  }
  resolveRestarted() {
    this._wasRestarted = !!this.stateService.getItem(LifecycleMainService.QUIT_AND_RESTART_KEY);
    if (this._wasRestarted) {
      this.stateService.removeItem(LifecycleMainService.QUIT_AND_RESTART_KEY);
    }
  }
  registerListeners() {
    const beforeQuitListener = () => {
      if (this._quitRequested) {
        return;
      }
      this.trace("Lifecycle#app.on(before-quit)");
      this._quitRequested = true;
      this.trace("Lifecycle#onBeforeShutdown.fire()");
      this._onBeforeShutdown.fire();
      if (isMacintosh && this.windowCounter === 0) {
        this.fireOnWillShutdown(1 /* QUIT */);
      }
    };
    electron.app.addListener("before-quit", beforeQuitListener);
    const windowAllClosedListener = () => {
      this.trace("Lifecycle#app.on(window-all-closed)");
      if (this._quitRequested || !isMacintosh) {
        electron.app.quit();
      }
    };
    electron.app.addListener("window-all-closed", windowAllClosedListener);
    electron.app.once("will-quit", (e) => {
      this.trace("Lifecycle#app.on(will-quit) - begin");
      e.preventDefault();
      const shutdownPromise = this.fireOnWillShutdown(1 /* QUIT */);
      shutdownPromise.finally(() => {
        this.trace("Lifecycle#app.on(will-quit) - after fireOnWillShutdown");
        this.resolvePendingQuitPromise(
          false
          /* no veto */
        );
        electron.app.removeListener("before-quit", beforeQuitListener);
        electron.app.removeListener("window-all-closed", windowAllClosedListener);
        this.trace("Lifecycle#app.on(will-quit) - calling app.quit()");
        electron.app.quit();
      });
    });
  }
  fireOnWillShutdown(reason) {
    if (this.pendingWillShutdownPromise) {
      return this.pendingWillShutdownPromise;
    }
    const logService = this.logService;
    this.trace("Lifecycle#onWillShutdown.fire()");
    const joiners = [];
    this._onWillShutdown.fire({
      reason,
      join(id, promise) {
        logService.trace(`Lifecycle#onWillShutdown - begin '${id}'`);
        joiners.push(promise.finally(() => {
          logService.trace(`Lifecycle#onWillShutdown - end '${id}'`);
        }));
      }
    });
    this.pendingWillShutdownPromise = (async () => {
      try {
        await Promises.settled(joiners);
      } catch (error) {
        this.logService.error(error);
      }
      try {
        await this.stateService.close();
      } catch (error) {
        this.logService.error(error);
      }
    })();
    return this.pendingWillShutdownPromise;
  }
  set phase(value) {
    if (value < this.phase) {
      throw new Error("Lifecycle cannot go backwards");
    }
    if (this._phase === value) {
      return;
    }
    this.trace(`lifecycle (main): phase changed (value: ${value})`);
    this._phase = value;
    const barrier = this.phaseWhen.get(this._phase);
    if (barrier) {
      barrier.open();
      this.phaseWhen.delete(this._phase);
    }
  }
  async when(phase) {
    if (phase <= this._phase) {
      return;
    }
    let barrier = this.phaseWhen.get(phase);
    if (!barrier) {
      barrier = new Barrier();
      this.phaseWhen.set(phase, barrier);
    }
    await barrier.wait();
  }
  registerWindow(window) {
    const windowListeners = new DisposableStore();
    this.windowCounter++;
    windowListeners.add(window.onWillLoad((e) => this._onWillLoadWindow.fire({ window, workspace: e.workspace, reason: e.reason })));
    const win = assertReturnsDefined(window.win);
    windowListeners.add(Event.fromNodeEventEmitter(win, "close")((e) => {
      const windowId = window.id;
      if (this.windowToCloseRequest.delete(windowId)) {
        return;
      }
      this.trace(`Lifecycle#window.on('close') - window ID ${window.id}`);
      e.preventDefault();
      this.unload(window, UnloadReason.CLOSE).then((veto) => {
        if (veto) {
          this.windowToCloseRequest.delete(windowId);
          return;
        }
        this.windowToCloseRequest.add(windowId);
        this.trace(`Lifecycle#onBeforeCloseWindow.fire() - window ID ${windowId}`);
        this._onBeforeCloseWindow.fire(window);
        window.close();
      });
    }));
    windowListeners.add(Event.fromNodeEventEmitter(win, "closed")(() => {
      this.trace(`Lifecycle#window.on('closed') - window ID ${window.id}`);
      this.windowCounter--;
      windowListeners.dispose();
      if (this.windowCounter === 0 && (!isMacintosh || this._quitRequested)) {
        this.fireOnWillShutdown(1 /* QUIT */);
      }
    }));
  }
  registerAuxWindow(auxWindow) {
    const win = assertReturnsDefined(auxWindow.win);
    const windowListeners = new DisposableStore();
    windowListeners.add(Event.fromNodeEventEmitter(win, "close")((e) => {
      this.trace(`Lifecycle#auxWindow.on('close') - window ID ${auxWindow.id}`);
      if (this._quitRequested) {
        this.trace(`Lifecycle#auxWindow.on('close') - preventDefault() because quit requested`);
        e.preventDefault();
      }
    }));
    windowListeners.add(Event.fromNodeEventEmitter(win, "closed")(() => {
      this.trace(`Lifecycle#auxWindow.on('closed') - window ID ${auxWindow.id}`);
      windowListeners.dispose();
    }));
  }
  async reload(window, cli) {
    const veto = await this.unload(window, UnloadReason.RELOAD);
    if (!veto) {
      window.reload(cli);
    }
  }
  unload(window, reason) {
    const pendingUnloadPromise = this.mapWindowIdToPendingUnload.get(window.id);
    if (pendingUnloadPromise) {
      return pendingUnloadPromise;
    }
    const unloadPromise = this.doUnload(window, reason).finally(() => {
      this.mapWindowIdToPendingUnload.delete(window.id);
    });
    this.mapWindowIdToPendingUnload.set(window.id, unloadPromise);
    return unloadPromise;
  }
  async doUnload(window, reason) {
    if (!window.isReady) {
      return false;
    }
    this.trace(`Lifecycle#unload() - window ID ${window.id}`);
    const windowUnloadReason = this._quitRequested ? UnloadReason.QUIT : reason;
    const veto = await this.onBeforeUnloadWindowInRenderer(window, windowUnloadReason);
    if (veto) {
      this.trace(`Lifecycle#unload() - veto in renderer (window ID ${window.id})`);
      return this.handleWindowUnloadVeto(veto);
    }
    await this.onWillUnloadWindowInRenderer(window, windowUnloadReason);
    return false;
  }
  handleWindowUnloadVeto(veto) {
    if (!veto) {
      return false;
    }
    this.resolvePendingQuitPromise(
      true
      /* veto */
    );
    this._quitRequested = false;
    return true;
  }
  resolvePendingQuitPromise(veto) {
    if (this.pendingQuitPromiseResolve) {
      this.pendingQuitPromiseResolve(veto);
      this.pendingQuitPromiseResolve = void 0;
      this.pendingQuitPromise = void 0;
    }
  }
  onBeforeUnloadWindowInRenderer(window, reason) {
    return new Promise((resolve) => {
      const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
      const okChannel = `vscode:ok${oneTimeEventToken}`;
      const cancelChannel = `vscode:cancel${oneTimeEventToken}`;
      const cleanup = (value) => {
        validatedIpcMain.removeListener(okChannel, okListener);
        validatedIpcMain.removeListener(cancelChannel, cancelListener);
        resolve(value);
      };
      const okListener = () => {
        cleanup(false);
      };
      const cancelListener = () => {
        cleanup(true);
      };
      validatedIpcMain.on(okChannel, okListener);
      validatedIpcMain.on(cancelChannel, cancelListener);
      window.send("vscode:onBeforeUnload", { okChannel, cancelChannel, reason });
    });
  }
  onWillUnloadWindowInRenderer(window, reason) {
    return new Promise((resolve) => {
      const oneTimeEventToken = this.oneTimeListenerTokenGenerator++;
      const replyChannel = `vscode:reply${oneTimeEventToken}`;
      validatedIpcMain.once(replyChannel, () => resolve());
      window.send("vscode:onWillUnload", { replyChannel, reason });
    });
  }
  quit(willRestart) {
    return this.doQuit(willRestart).then((veto) => {
      if (!veto && willRestart) {
        try {
          if (isWindows) {
            const currentWorkingDir = cwd();
            if (currentWorkingDir !== process.cwd()) {
              process.chdir(currentWorkingDir);
            }
          }
        } catch (err) {
          this.logService.error(err);
        }
      }
      return veto;
    });
  }
  doQuit(willRestart) {
    this.trace(`Lifecycle#quit() - begin (willRestart: ${willRestart})`);
    if (this.pendingQuitPromise) {
      this.trace("Lifecycle#quit() - returning pending quit promise");
      return this.pendingQuitPromise;
    }
    if (willRestart) {
      this.stateService.setItem(LifecycleMainService.QUIT_AND_RESTART_KEY, true);
    }
    this.pendingQuitPromise = new Promise((resolve) => {
      this.pendingQuitPromiseResolve = resolve;
      this.trace("Lifecycle#quit() - calling app.quit()");
      electron.app.quit();
    });
    return this.pendingQuitPromise;
  }
  trace(msg) {
    if (this.environmentMainService.args["enable-smoke-test-driver"]) {
      this.logService.info(msg);
    } else {
      this.logService.trace(msg);
    }
  }
  setRelaunchHandler(handler) {
    this.relaunchHandler = handler;
  }
  async relaunch(options) {
    this.trace("Lifecycle#relaunch()");
    const args = process.argv.slice(1);
    if (options?.addArgs) {
      args.push(...options.addArgs);
    }
    if (options?.removeArgs) {
      for (const a of options.removeArgs) {
        const idx = args.indexOf(a);
        if (idx >= 0) {
          args.splice(idx, 1);
        }
      }
    }
    const quitListener = () => {
      if (!this.relaunchHandler?.handleRelaunch(options)) {
        this.trace("Lifecycle#relaunch() - calling app.relaunch()");
        electron.app.relaunch({ args });
      }
    };
    electron.app.once("quit", quitListener);
    const veto = await this.quit(
      true
      /* will restart */
    );
    if (veto) {
      electron.app.removeListener("quit", quitListener);
    }
  }
  async kill(code) {
    this.trace("Lifecycle#kill()");
    await this.fireOnWillShutdown(2 /* KILL */);
    await Promise.race([
      // Still do not block more than 1s
      timeout(1e3),
      // Destroy any opened window: we do not unload windows here because
      // there is a chance that the unload is veto'd or long running due
      // to a participant within the window. this is not wanted when we
      // are asked to kill the application.
      (async () => {
        for (const window of getAllWindowsExcludingOffscreen()) {
          if (window && !window.isDestroyed()) {
            let whenWindowClosed;
            if (window.webContents && !window.webContents.isDestroyed()) {
              whenWindowClosed = new Promise((resolve) => window.once("closed", resolve));
            } else {
              whenWindowClosed = Promise.resolve();
            }
            window.destroy();
            await whenWindowClosed;
          }
        }
      })()
    ]);
    electron.app.exit(code);
  }
};
LifecycleMainService.QUIT_AND_RESTART_KEY = "lifecycle.quitAndRestart";
LifecycleMainService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IStateService),
  __decorateParam(2, IEnvironmentMainService)
], LifecycleMainService);
export {
  ILifecycleMainService,
  LifecycleMainPhase,
  LifecycleMainService,
  ShutdownReason
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbGlmZWN5Y2xlXFxlbGVjdHJvbi1tYWluXFxsaWZlY3ljbGVNYWluU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBlbGVjdHJvbiBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyB2YWxpZGF0ZWRJcGNNYWluIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvZWxlY3Ryb24tbWFpbi9pcGNNYWluLmpzJztcbmltcG9ydCB7IEJhcnJpZXIsIFByb21pc2VzLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGN3ZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBOYXRpdmVQYXJzZWRBcmdzIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2FyZ3YuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdGF0ZS9ub2RlL3N0YXRlLmpzJztcbmltcG9ydCB7IElDb2RlV2luZG93LCBMb2FkUmVhc29uLCBVbmxvYWRSZWFzb24gfSBmcm9tICcuLi8uLi93aW5kb3cvZWxlY3Ryb24tbWFpbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIElXb3Jrc3BhY2VJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50TWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9lbGVjdHJvbi1tYWluL2Vudmlyb25tZW50TWFpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1eGlsaWFyeVdpbmRvdyB9IGZyb20gJy4uLy4uL2F1eGlsaWFyeVdpbmRvdy9lbGVjdHJvbi1tYWluL2F1eGlsaWFyeVdpbmRvdy5qcyc7XG5pbXBvcnQgeyBnZXRBbGxXaW5kb3dzRXhjbHVkaW5nT2Zmc2NyZWVuIH0gZnJvbSAnLi4vLi4vd2luZG93cy9lbGVjdHJvbi1tYWluL3dpbmRvd3MuanMnO1xuXG5leHBvcnQgY29uc3QgSUxpZmVjeWNsZU1haW5TZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElMaWZlY3ljbGVNYWluU2VydmljZT4oJ2xpZmVjeWNsZU1haW5TZXJ2aWNlJyk7XG5cbmludGVyZmFjZSBXaW5kb3dMb2FkRXZlbnQge1xuXG5cdC8qKlxuXHQgKiBUaGUgd2luZG93IHRoYXQgaXMgbG9hZGVkIHRvIGEgbmV3IHdvcmtzcGFjZS5cblx0ICovXG5cdHJlYWRvbmx5IHdpbmRvdzogSUNvZGVXaW5kb3c7XG5cblx0LyoqXG5cdCAqIFRoZSB3b3Jrc3BhY2UgdGhlIHdpbmRvdyBpcyBsb2FkZWQgaW50by5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmtzcGFjZTogSVdvcmtzcGFjZUlkZW50aWZpZXIgfCBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogTW9yZSBkZXRhaWxzIHdoeSB0aGUgd2luZG93IGxvYWRzIHRvIGEgbmV3IHdvcmtzcGFjZS5cblx0ICovXG5cdHJlYWRvbmx5IHJlYXNvbjogTG9hZFJlYXNvbjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gU2h1dGRvd25SZWFzb24ge1xuXG5cdC8qKlxuXHQgKiBUaGUgYXBwbGljYXRpb24gZXhpdHMgbm9ybWFsbHkuXG5cdCAqL1xuXHRRVUlUID0gMSxcblxuXHQvKipcblx0ICogVGhlIGFwcGxpY2F0aW9uIGV4aXRzIGFibm9ybWFsbHkgYW5kIGlzIGJlaW5nXG5cdCAqIGtpbGxlZCB3aXRoIGFuIGV4aXQgY29kZSAoZS5nLiBmcm9tIGludGVncmF0aW9uXG5cdCAqIHRlc3QgcnVuKVxuXHQgKi9cblx0S0lMTFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFNodXRkb3duRXZlbnQge1xuXG5cdC8qKlxuXHQgKiBNb3JlIGRldGFpbHMgd2h5IHRoZSBhcHBsaWNhdGlvbiBpcyBzaHV0dGluZyBkb3duLlxuXHQgKi9cblx0cmVhc29uOiBTaHV0ZG93blJlYXNvbjtcblxuXHQvKipcblx0ICogQWxsb3dzIHRvIGpvaW4gdGhlIHNodXRkb3duLiBUaGUgcHJvbWlzZSBjYW4gYmUgYSBsb25nIHJ1bm5pbmcgb3BlcmF0aW9uIGJ1dCBpdFxuXHQgKiB3aWxsIGJsb2NrIHRoZSBhcHBsaWNhdGlvbiBmcm9tIGNsb3NpbmcuXG5cdCAqL1xuXHRqb2luKGlkOiBzdHJpbmcsIHByb21pc2U6IFByb21pc2U8dm9pZD4pOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSZWxhdW5jaEhhbmRsZXIge1xuXG5cdC8qKlxuXHQgKiBBbGxvd3MgYSBoYW5kbGVyIHRvIGRlYWwgd2l0aCByZWxhdW5jaGluZyB0aGUgYXBwbGljYXRpb24uIFRoZSByZXR1cm5cblx0ICogdmFsdWUgaW5kaWNhdGVzIGlmIHRoZSByZWxhdW5jaCBpcyBoYW5kbGVkIG9yIG5vdC5cblx0ICovXG5cdGhhbmRsZVJlbGF1bmNoKG9wdGlvbnM/OiBJUmVsYXVuY2hPcHRpb25zKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVsYXVuY2hPcHRpb25zIHtcblx0cmVhZG9ubHkgYWRkQXJncz86IHN0cmluZ1tdO1xuXHRyZWFkb25seSByZW1vdmVBcmdzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpZmVjeWNsZU1haW5TZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFdpbGwgYmUgdHJ1ZSBpZiB0aGUgcHJvZ3JhbSB3YXMgcmVzdGFydGVkIChlLmcuIGR1ZSB0byBleHBsaWNpdCByZXF1ZXN0IG9yIHVwZGF0ZSkuXG5cdCAqL1xuXHRyZWFkb25seSB3YXNSZXN0YXJ0ZWQ6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdpbGwgYmUgdHJ1ZSBpZiB0aGUgcHJvZ3JhbSB3YXMgcmVxdWVzdGVkIHRvIHF1aXQuXG5cdCAqL1xuXHRyZWFkb25seSBxdWl0UmVxdWVzdGVkOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBBIGZsYWcgaW5kaWNhdGluZyBpbiB3aGF0IHBoYXNlIG9mIHRoZSBsaWZlY3ljbGUgd2UgY3VycmVudGx5IGFyZS5cblx0ICovXG5cdHBoYXNlOiBMaWZlY3ljbGVNYWluUGhhc2U7XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgZmlyZXMgd2hlbiB0aGUgYXBwbGljYXRpb24gaXMgYWJvdXQgdG8gc2h1dGRvd24gYmVmb3JlIGFueSB3aW5kb3cgaXMgY2xvc2VkLlxuXHQgKiBUaGUgc2h1dGRvd24gY2FuIHN0aWxsIGJlIHByZXZlbnRlZCBieSBhbnkgd2luZG93IHRoYXQgdmV0b3MgdGhpcyBldmVudC5cblx0ICovXG5cdHJlYWRvbmx5IG9uQmVmb3JlU2h1dGRvd246IEV2ZW50PHZvaWQ+O1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB0aGF0IGZpcmVzIGFmdGVyIHRoZSBvbkJlZm9yZVNodXRkb3duIGV2ZW50IGhhcyBiZWVuIGZpcmVkIGFuZCBhZnRlciBubyB3aW5kb3cgaGFzXG5cdCAqIHZldG9lZCB0aGUgc2h1dGRvd24gc2VxdWVuY2UuIEF0IHRoaXMgcG9pbnQgbGlzdGVuZXJzIGFyZSBlbnN1cmVkIHRoYXQgdGhlIGFwcGxpY2F0aW9uIHdpbGxcblx0ICogcXVpdCB3aXRob3V0IHZldG8uXG5cdCAqL1xuXHRyZWFkb25seSBvbldpbGxTaHV0ZG93bjogRXZlbnQ8U2h1dGRvd25FdmVudD47XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHRoYXQgZmlyZXMgd2hlbiBhIHdpbmRvdyBpcyBsb2FkaW5nLiBUaGlzIGNhbiBlaXRoZXIgYmUgYSB3aW5kb3cgb3BlbmluZyBmb3IgdGhlXG5cdCAqIGZpcnN0IHRpbWUgb3IgYSB3aW5kb3cgcmVsb2FkaW5nIG9yIGNoYW5naW5nIHRvIGFub3RoZXIgVVJMLlxuXHQgKi9cblx0cmVhZG9ubHkgb25XaWxsTG9hZFdpbmRvdzogRXZlbnQ8V2luZG93TG9hZEV2ZW50PjtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBmaXJlcyBiZWZvcmUgYSB3aW5kb3cgY2xvc2VzLiBUaGlzIGV2ZW50IGlzIGZpcmVkIGFmdGVyIGFueSB2ZXRvIGhhcyBiZWVuIGRlYWx0XG5cdCAqIHdpdGggc28gdGhhdCBsaXN0ZW5lcnMga25vdyBmb3Igc3VyZSB0aGF0IHRoZSB3aW5kb3cgd2lsbCBjbG9zZSB3aXRob3V0IHZldG8uXG5cdCAqL1xuXHRyZWFkb25seSBvbkJlZm9yZUNsb3NlV2luZG93OiBFdmVudDxJQ29kZVdpbmRvdz47XG5cblx0LyoqXG5cdCAqIE1ha2UgYSBgSUNvZGVXaW5kb3dgIGtub3duIHRvIHRoZSBsaWZlY3ljbGUgbWFpbiBzZXJ2aWNlLlxuXHQgKi9cblx0cmVnaXN0ZXJXaW5kb3cod2luZG93OiBJQ29kZVdpbmRvdyk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIE1ha2UgYSBgSUF1eGlsaWFyeVdpbmRvd2Aga25vd24gdG8gdGhlIGxpZmVjeWNsZSBtYWluIHNlcnZpY2UuXG5cdCAqL1xuXHRyZWdpc3RlckF1eFdpbmRvdyhhdXhXaW5kb3c6IElBdXhpbGlhcnlXaW5kb3cpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBSZWxvYWQgYSB3aW5kb3cuIEFsbCBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYXJlIHRyaWdnZXJlZC5cblx0ICovXG5cdHJlbG9hZCh3aW5kb3c6IElDb2RlV2luZG93LCBjbGk/OiBOYXRpdmVQYXJzZWRBcmdzKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvKipcblx0ICogVW5sb2FkIGEgd2luZG93IGZvciB0aGUgcHJvdmlkZWQgcmVhc29uLiBBbGwgbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzIGFyZSB0cmlnZ2VyZWQuXG5cdCAqL1xuXHR1bmxvYWQod2luZG93OiBJQ29kZVdpbmRvdywgcmVhc29uOiBVbmxvYWRSZWFzb24pOiBQcm9taXNlPGJvb2xlYW4gLyogdmV0byAqLz47XG5cblx0LyoqXG5cdCAqIFJlc3RhcnQgdGhlIGFwcGxpY2F0aW9uIHdpdGggb3B0aW9uYWwgYXJndW1lbnRzIChDTEkpLiBBbGwgbGlmZWN5Y2xlIGV2ZW50IGhhbmRsZXJzIGFyZSB0cmlnZ2VyZWQuXG5cdCAqL1xuXHRyZWxhdW5jaChvcHRpb25zPzogSVJlbGF1bmNoT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIFNldHMgYSBjdXN0b20gaGFuZGxlciBmb3IgcmVsYXVuY2hpbmcgdGhlIGFwcGxpY2F0aW9uLlxuXHQgKi9cblx0c2V0UmVsYXVuY2hIYW5kbGVyKGhhbmRsZXI6IElSZWxhdW5jaEhhbmRsZXIpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBTaHV0ZG93biB0aGUgYXBwbGljYXRpb24gbm9ybWFsbHkuIEFsbCBsaWZlY3ljbGUgZXZlbnQgaGFuZGxlcnMgYXJlIHRyaWdnZXJlZC5cblx0ICovXG5cdHF1aXQod2lsbFJlc3RhcnQ/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuIC8qIHZldG8gKi8+O1xuXG5cdC8qKlxuXHQgKiBGb3JjZWZ1bGx5IHNodXRkb3duIHRoZSBhcHBsaWNhdGlvbiBhbmQgb3B0aW9uYWxseSBzZXQgYW4gZXhpdCBjb2RlLlxuXHQgKlxuXHQgKiBUaGlzIG1ldGhvZCBzaG91bGQgb25seSBiZSB1c2VkIGluIHJhcmUgc2l0dWF0aW9ucyB3aGVyZSBpdCBpcyBpbXBvcnRhbnRcblx0ICogdG8gc2V0IGFuIGV4aXQgY29kZSAoZS5nLiBydW5uaW5nIHRlc3RzKSBvciB3aGVuIHRoZSBhcHBsaWNhdGlvbiBpc1xuXHQgKiBub3QgaW4gYSBoZWFsdGh5IHN0YXRlIGFuZCBzaG91bGQgdGVybWluYXRlIGFzYXAuXG5cdCAqXG5cdCAqIFRoaXMgbWV0aG9kIGRvZXMgbm90IGZpcmUgdGhlIG5vcm1hbCBsaWZlY3ljbGUgZXZlbnRzIHRvIHRoZSB3aW5kb3dzLFxuXHQgKiB0aGF0IG5vcm1hbGx5IGNhbiBiZSB2ZXRvZWQuIFdpbmRvd3MgYXJlIGRlc3Ryb3llZCB3aXRob3V0IGEgY2hhbmNlXG5cdCAqIG9mIGNvbXBvbmVudHMgdG8gcGFydGljaXBhdGUuIFRoZSBvbmx5IGxpZmVjeWNsZSBldmVudCBoYW5kbGVyIHRoYXRcblx0ICogaXMgdHJpZ2dlcmVkIGlzIGBvbldpbGxTaHV0ZG93bmAgaW4gdGhlIG1haW4gcHJvY2Vzcy5cblx0ICovXG5cdGtpbGwoY29kZT86IG51bWJlcik6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBhIGNlcnRhaW4gbGlmZWN5Y2xlIHBoYXNlXG5cdCAqIGhhcyBzdGFydGVkLlxuXHQgKi9cblx0d2hlbihwaGFzZTogTGlmZWN5Y2xlTWFpblBoYXNlKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gTGlmZWN5Y2xlTWFpblBoYXNlIHtcblxuXHQvKipcblx0ICogVGhlIGZpcnN0IHBoYXNlIHNpZ25hbHMgdGhhdCB3ZSBhcmUgYWJvdXQgdG8gc3RhcnR1cC5cblx0ICovXG5cdFN0YXJ0aW5nID0gMSxcblxuXHQvKipcblx0ICogU2VydmljZXMgYXJlIHJlYWR5IGFuZCBmaXJzdCB3aW5kb3cgaXMgYWJvdXQgdG8gb3Blbi5cblx0ICovXG5cdFJlYWR5ID0gMixcblxuXHQvKipcblx0ICogVGhpcyBwaGFzZSBzaWduYWxzIGEgcG9pbnQgaW4gdGltZSBhZnRlciB0aGUgd2luZG93IGhhcyBvcGVuZWRcblx0ICogYW5kIGlzIHR5cGljYWxseSB0aGUgYmVzdCBwbGFjZSB0byBkbyB3b3JrIHRoYXQgaXMgbm90IHJlcXVpcmVkXG5cdCAqIGZvciB0aGUgd2luZG93IHRvIG9wZW4uXG5cdCAqL1xuXHRBZnRlcldpbmRvd09wZW4gPSAzLFxuXG5cdC8qKlxuXHQgKiBUaGUgbGFzdCBwaGFzZSBhZnRlciBhIHdpbmRvdyBoYXMgb3BlbmVkIGFuZCBzb21lIHRpbWUgaGFzIHBhc3NlZFxuXHQgKiAoMi01IHNlY29uZHMpLlxuXHQgKi9cblx0RXZlbnR1YWxseSA9IDRcbn1cblxuZXhwb3J0IGNsYXNzIExpZmVjeWNsZU1haW5TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMaWZlY3ljbGVNYWluU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUVVJVF9BTkRfUkVTVEFSVF9LRVkgPSAnbGlmZWN5Y2xlLnF1aXRBbmRSZXN0YXJ0JztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkJlZm9yZVNodXRkb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uQmVmb3JlU2h1dGRvd24gPSB0aGlzLl9vbkJlZm9yZVNodXRkb3duLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFNodXRkb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2h1dGRvd25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFNodXRkb3duID0gdGhpcy5fb25XaWxsU2h1dGRvd24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsTG9hZFdpbmRvdyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFdpbmRvd0xvYWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbExvYWRXaW5kb3cgPSB0aGlzLl9vbldpbGxMb2FkV2luZG93LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQmVmb3JlQ2xvc2VXaW5kb3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29kZVdpbmRvdz4oKSk7XG5cdHJlYWRvbmx5IG9uQmVmb3JlQ2xvc2VXaW5kb3cgPSB0aGlzLl9vbkJlZm9yZUNsb3NlV2luZG93LmV2ZW50O1xuXG5cdHByaXZhdGUgX3F1aXRSZXF1ZXN0ZWQgPSBmYWxzZTtcblx0Z2V0IHF1aXRSZXF1ZXN0ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9xdWl0UmVxdWVzdGVkOyB9XG5cblx0cHJpdmF0ZSBfd2FzUmVzdGFydGVkID0gZmFsc2U7XG5cdGdldCB3YXNSZXN0YXJ0ZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl93YXNSZXN0YXJ0ZWQ7IH1cblxuXHRwcml2YXRlIF9waGFzZSA9IExpZmVjeWNsZU1haW5QaGFzZS5TdGFydGluZztcblx0Z2V0IHBoYXNlKCk6IExpZmVjeWNsZU1haW5QaGFzZSB7IHJldHVybiB0aGlzLl9waGFzZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2luZG93VG9DbG9zZVJlcXVlc3QgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0cHJpdmF0ZSBvbmVUaW1lTGlzdGVuZXJUb2tlbkdlbmVyYXRvciA9IDA7XG5cdHByaXZhdGUgd2luZG93Q291bnRlciA9IDA7XG5cblx0cHJpdmF0ZSBwZW5kaW5nUXVpdFByb21pc2U6IFByb21pc2U8Ym9vbGVhbj4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcGVuZGluZ1F1aXRQcm9taXNlUmVzb2x2ZTogeyAodmV0bzogYm9vbGVhbik6IHZvaWQgfSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHBlbmRpbmdXaWxsU2h1dGRvd25Qcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbWFwV2luZG93SWRUb1BlbmRpbmdVbmxvYWQgPSBuZXcgTWFwPG51bWJlciwgUHJvbWlzZTxib29sZWFuPj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBoYXNlV2hlbiA9IG5ldyBNYXA8TGlmZWN5Y2xlTWFpblBoYXNlLCBCYXJyaWVyPigpO1xuXG5cdHByaXZhdGUgcmVsYXVuY2hIYW5kbGVyOiBJUmVsYXVuY2hIYW5kbGVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RhdGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdGVTZXJ2aWNlOiBJU3RhdGVTZXJ2aWNlLFxuXHRcdEBJRW52aXJvbm1lbnRNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50TWFpblNlcnZpY2U6IElFbnZpcm9ubWVudE1haW5TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlc29sdmVSZXN0YXJ0ZWQoKTtcblx0XHR0aGlzLndoZW4oTGlmZWN5Y2xlTWFpblBoYXNlLlJlYWR5KS50aGVuKCgpID0+IHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlc29sdmVSZXN0YXJ0ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2FzUmVzdGFydGVkID0gISF0aGlzLnN0YXRlU2VydmljZS5nZXRJdGVtKExpZmVjeWNsZU1haW5TZXJ2aWNlLlFVSVRfQU5EX1JFU1RBUlRfS0VZKTtcblxuXHRcdGlmICh0aGlzLl93YXNSZXN0YXJ0ZWQpIHtcblx0XHRcdC8vIHJlbW92ZSB0aGUgbWFya2VyIHJpZ2h0IGFmdGVyIGlmIGZvdW5kXG5cdFx0XHR0aGlzLnN0YXRlU2VydmljZS5yZW1vdmVJdGVtKExpZmVjeWNsZU1haW5TZXJ2aWNlLlFVSVRfQU5EX1JFU1RBUlRfS0VZKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gYmVmb3JlLXF1aXQ6IGFuIGV2ZW50IHRoYXQgaXMgZmlyZWQgaWYgYXBwbGljYXRpb24gcXVpdCB3YXNcblx0XHQvLyByZXF1ZXN0ZWQgYnV0IGJlZm9yZSBhbnkgd2luZG93IHdhcyBjbG9zZWQuXG5cdFx0Y29uc3QgYmVmb3JlUXVpdExpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3F1aXRSZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyYWNlKCdMaWZlY3ljbGUjYXBwLm9uKGJlZm9yZS1xdWl0KScpO1xuXHRcdFx0dGhpcy5fcXVpdFJlcXVlc3RlZCA9IHRydWU7XG5cblx0XHRcdC8vIEVtaXQgZXZlbnQgdG8gaW5kaWNhdGUgdGhhdCB3ZSBhcmUgYWJvdXQgdG8gc2h1dGRvd25cblx0XHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNvbkJlZm9yZVNodXRkb3duLmZpcmUoKScpO1xuXHRcdFx0dGhpcy5fb25CZWZvcmVTaHV0ZG93bi5maXJlKCk7XG5cblx0XHRcdC8vIG1hY09TOiBjYW4gcnVuIHdpdGhvdXQgYW55IHdpbmRvdyBvcGVuLiBpbiB0aGF0IGNhc2Ugd2UgZmlyZVxuXHRcdFx0Ly8gdGhlIG9uV2lsbFNodXRkb3duKCkgZXZlbnQgZGlyZWN0bHkgYmVjYXVzZSB0aGVyZSBpcyBubyB2ZXRvXG5cdFx0XHQvLyB0byBiZSBleHBlY3RlZC5cblx0XHRcdGlmIChpc01hY2ludG9zaCAmJiB0aGlzLndpbmRvd0NvdW50ZXIgPT09IDApIHtcblx0XHRcdFx0dGhpcy5maXJlT25XaWxsU2h1dGRvd24oU2h1dGRvd25SZWFzb24uUVVJVCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRlbGVjdHJvbi5hcHAuYWRkTGlzdGVuZXIoJ2JlZm9yZS1xdWl0JywgYmVmb3JlUXVpdExpc3RlbmVyKTtcblxuXHRcdC8vIHdpbmRvdy1hbGwtY2xvc2VkOiBhbiBldmVudCB0aGF0IG9ubHkgZmlyZXMgd2hlbiB0aGUgbGFzdCB3aW5kb3dcblx0XHQvLyB3YXMgY2xvc2VkLiBXZSBvdmVycmlkZSB0aGlzIGV2ZW50IHRvIGJlIGluIGNoYXJnZSBpZiBhcHAucXVpdCgpXG5cdFx0Ly8gc2hvdWxkIGJlIGNhbGxlZCBvciBub3QuXG5cdFx0Y29uc3Qgd2luZG93QWxsQ2xvc2VkTGlzdGVuZXIgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLnRyYWNlKCdMaWZlY3ljbGUjYXBwLm9uKHdpbmRvdy1hbGwtY2xvc2VkKScpO1xuXG5cdFx0XHQvLyBXaW5kb3dzL0xpbnV4OiB3ZSBxdWl0IHdoZW4gYWxsIHdpbmRvd3MgaGF2ZSBjbG9zZWRcblx0XHRcdC8vIE1hYzogd2Ugb25seSBxdWl0IHdoZW4gcXVpdCB3YXMgcmVxdWVzdGVkXG5cdFx0XHRpZiAodGhpcy5fcXVpdFJlcXVlc3RlZCB8fCAhaXNNYWNpbnRvc2gpIHtcblx0XHRcdFx0ZWxlY3Ryb24uYXBwLnF1aXQoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGVsZWN0cm9uLmFwcC5hZGRMaXN0ZW5lcignd2luZG93LWFsbC1jbG9zZWQnLCB3aW5kb3dBbGxDbG9zZWRMaXN0ZW5lcik7XG5cblx0XHQvLyB3aWxsLXF1aXQ6IGFuIGV2ZW50IHRoYXQgaXMgZmlyZWQgYWZ0ZXIgYWxsIHdpbmRvd3MgaGF2ZSBiZWVuXG5cdFx0Ly8gY2xvc2VkLCBidXQgYmVmb3JlIGFjdHVhbGx5IHF1aXR0aW5nLlxuXHRcdGVsZWN0cm9uLmFwcC5vbmNlKCd3aWxsLXF1aXQnLCBlID0+IHtcblx0XHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNhcHAub24od2lsbC1xdWl0KSAtIGJlZ2luJyk7XG5cblx0XHRcdC8vIFByZXZlbnQgdGhlIHF1aXQgdW50aWwgdGhlIHNodXRkb3duIHByb21pc2Ugd2FzIHJlc29sdmVkXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdC8vIFN0YXJ0IHNodXRkb3duIHNlcXVlbmNlXG5cdFx0XHRjb25zdCBzaHV0ZG93blByb21pc2UgPSB0aGlzLmZpcmVPbldpbGxTaHV0ZG93bihTaHV0ZG93blJlYXNvbi5RVUlUKTtcblxuXHRcdFx0Ly8gV2FpdCB1bnRpbCBzaHV0ZG93biBpcyBzaWduYWxlZCB0byBiZSBjb21wbGV0ZVxuXHRcdFx0c2h1dGRvd25Qcm9taXNlLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdMaWZlY3ljbGUjYXBwLm9uKHdpbGwtcXVpdCkgLSBhZnRlciBmaXJlT25XaWxsU2h1dGRvd24nKTtcblxuXHRcdFx0XHQvLyBSZXNvbHZlIHBlbmRpbmcgcXVpdCBwcm9taXNlIG5vdyB3aXRob3V0IHZldG9cblx0XHRcdFx0dGhpcy5yZXNvbHZlUGVuZGluZ1F1aXRQcm9taXNlKGZhbHNlIC8qIG5vIHZldG8gKi8pO1xuXG5cdFx0XHRcdC8vIFF1aXQgYWdhaW4sIHRoaXMgdGltZSBkbyBub3QgcHJldmVudCB0aGlzLCBzaW5jZSBvdXJcblx0XHRcdFx0Ly8gd2lsbC1xdWl0IGxpc3RlbmVyIGlzIG9ubHkgaW5zdGFsbGVkIFwib25jZVwiLiBBbHNvXG5cdFx0XHRcdC8vIHJlbW92ZSBhbnkgbGlzdGVuZXIgd2UgaGF2ZSB0aGF0IGlzIG5vIGxvbmdlciBuZWVkZWRcblxuXHRcdFx0XHRlbGVjdHJvbi5hcHAucmVtb3ZlTGlzdGVuZXIoJ2JlZm9yZS1xdWl0JywgYmVmb3JlUXVpdExpc3RlbmVyKTtcblx0XHRcdFx0ZWxlY3Ryb24uYXBwLnJlbW92ZUxpc3RlbmVyKCd3aW5kb3ctYWxsLWNsb3NlZCcsIHdpbmRvd0FsbENsb3NlZExpc3RlbmVyKTtcblxuXHRcdFx0XHR0aGlzLnRyYWNlKCdMaWZlY3ljbGUjYXBwLm9uKHdpbGwtcXVpdCkgLSBjYWxsaW5nIGFwcC5xdWl0KCknKTtcblxuXHRcdFx0XHRlbGVjdHJvbi5hcHAucXVpdCgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGZpcmVPbldpbGxTaHV0ZG93bihyZWFzb246IFNodXRkb3duUmVhc29uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMucGVuZGluZ1dpbGxTaHV0ZG93blByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnBlbmRpbmdXaWxsU2h1dGRvd25Qcm9taXNlOyAvLyBzaHV0ZG93biBpcyBhbHJlYWR5IHJ1bm5pbmdcblx0XHR9XG5cblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gdGhpcy5sb2dTZXJ2aWNlO1xuXHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNvbldpbGxTaHV0ZG93bi5maXJlKCknKTtcblxuXHRcdGNvbnN0IGpvaW5lcnM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXG5cdFx0dGhpcy5fb25XaWxsU2h1dGRvd24uZmlyZSh7XG5cdFx0XHRyZWFzb24sXG5cdFx0XHRqb2luKGlkLCBwcm9taXNlKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYExpZmVjeWNsZSNvbldpbGxTaHV0ZG93biAtIGJlZ2luICcke2lkfSdgKTtcblx0XHRcdFx0am9pbmVycy5wdXNoKHByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS50cmFjZShgTGlmZWN5Y2xlI29uV2lsbFNodXRkb3duIC0gZW5kICcke2lkfSdgKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5wZW5kaW5nV2lsbFNodXRkb3duUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIFNldHRsZSBhbGwgc2h1dGRvd24gZXZlbnQgam9pbmVyc1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChqb2luZXJzKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZW4sIGFsd2F5cyBtYWtlIHN1cmUgYXQgdGhlIGVuZFxuXHRcdFx0Ly8gdGhlIHN0YXRlIHNlcnZpY2UgaXMgZmx1c2hlZC5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3RhdGVTZXJ2aWNlLmNsb3NlKCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5wZW5kaW5nV2lsbFNodXRkb3duUHJvbWlzZTtcblx0fVxuXG5cdHNldCBwaGFzZSh2YWx1ZTogTGlmZWN5Y2xlTWFpblBoYXNlKSB7XG5cdFx0aWYgKHZhbHVlIDwgdGhpcy5waGFzZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdMaWZlY3ljbGUgY2Fubm90IGdvIGJhY2t3YXJkcycpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9waGFzZSA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnRyYWNlKGBsaWZlY3ljbGUgKG1haW4pOiBwaGFzZSBjaGFuZ2VkICh2YWx1ZTogJHt2YWx1ZX0pYCk7XG5cblx0XHR0aGlzLl9waGFzZSA9IHZhbHVlO1xuXG5cdFx0Y29uc3QgYmFycmllciA9IHRoaXMucGhhc2VXaGVuLmdldCh0aGlzLl9waGFzZSk7XG5cdFx0aWYgKGJhcnJpZXIpIHtcblx0XHRcdGJhcnJpZXIub3BlbigpO1xuXHRcdFx0dGhpcy5waGFzZVdoZW4uZGVsZXRlKHRoaXMuX3BoYXNlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB3aGVuKHBoYXNlOiBMaWZlY3ljbGVNYWluUGhhc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocGhhc2UgPD0gdGhpcy5fcGhhc2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgYmFycmllciA9IHRoaXMucGhhc2VXaGVuLmdldChwaGFzZSk7XG5cdFx0aWYgKCFiYXJyaWVyKSB7XG5cdFx0XHRiYXJyaWVyID0gbmV3IEJhcnJpZXIoKTtcblx0XHRcdHRoaXMucGhhc2VXaGVuLnNldChwaGFzZSwgYmFycmllcik7XG5cdFx0fVxuXG5cdFx0YXdhaXQgYmFycmllci53YWl0KCk7XG5cdH1cblxuXHRyZWdpc3RlcldpbmRvdyh3aW5kb3c6IElDb2RlV2luZG93KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2luZG93TGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gdHJhY2sgd2luZG93IGNvdW50XG5cdFx0dGhpcy53aW5kb3dDb3VudGVyKys7XG5cblx0XHQvLyBXaW5kb3cgV2lsbCBMb2FkXG5cdFx0d2luZG93TGlzdGVuZXJzLmFkZCh3aW5kb3cub25XaWxsTG9hZChlID0+IHRoaXMuX29uV2lsbExvYWRXaW5kb3cuZmlyZSh7IHdpbmRvdywgd29ya3NwYWNlOiBlLndvcmtzcGFjZSwgcmVhc29uOiBlLnJlYXNvbiB9KSkpO1xuXG5cdFx0Ly8gV2luZG93IEJlZm9yZSBDbG9zaW5nOiBNYWluIC0+IFJlbmRlcmVyXG5cdFx0Y29uc3Qgd2luID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQod2luZG93Lndpbik7XG5cdFx0d2luZG93TGlzdGVuZXJzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjxlbGVjdHJvbi5FdmVudD4od2luLCAnY2xvc2UnKShlID0+IHtcblxuXHRcdFx0Ly8gVGhlIHdpbmRvdyBhbHJlYWR5IGFja25vd2xlZGdlZCB0byBiZSBjbG9zZWRcblx0XHRcdGNvbnN0IHdpbmRvd0lkID0gd2luZG93LmlkO1xuXHRcdFx0aWYgKHRoaXMud2luZG93VG9DbG9zZVJlcXVlc3QuZGVsZXRlKHdpbmRvd0lkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSN3aW5kb3cub24oJ2Nsb3NlJykgLSB3aW5kb3cgSUQgJHt3aW5kb3cuaWR9YCk7XG5cblx0XHRcdC8vIE90aGVyd2lzZSBwcmV2ZW50IHVubG9hZCBhbmQgaGFuZGxlIGl0IGZyb20gd2luZG93XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLnVubG9hZCh3aW5kb3csIFVubG9hZFJlYXNvbi5DTE9TRSkudGhlbih2ZXRvID0+IHtcblx0XHRcdFx0aWYgKHZldG8pIHtcblx0XHRcdFx0XHR0aGlzLndpbmRvd1RvQ2xvc2VSZXF1ZXN0LmRlbGV0ZSh3aW5kb3dJZCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy53aW5kb3dUb0Nsb3NlUmVxdWVzdC5hZGQod2luZG93SWQpO1xuXG5cdFx0XHRcdC8vIEZpcmUgb25CZWZvcmVDbG9zZVdpbmRvdyBiZWZvcmUgYWN0dWFsbHkgY2xvc2luZ1xuXHRcdFx0XHR0aGlzLnRyYWNlKGBMaWZlY3ljbGUjb25CZWZvcmVDbG9zZVdpbmRvdy5maXJlKCkgLSB3aW5kb3cgSUQgJHt3aW5kb3dJZH1gKTtcblx0XHRcdFx0dGhpcy5fb25CZWZvcmVDbG9zZVdpbmRvdy5maXJlKHdpbmRvdyk7XG5cblx0XHRcdFx0Ly8gTm8gdmV0bywgY2xvc2Ugd2luZG93IG5vd1xuXHRcdFx0XHR3aW5kb3cuY2xvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR3aW5kb3dMaXN0ZW5lcnMuYWRkKEV2ZW50LmZyb21Ob2RlRXZlbnRFbWl0dGVyPGVsZWN0cm9uLkV2ZW50Pih3aW4sICdjbG9zZWQnKSgoKSA9PiB7XG5cdFx0XHR0aGlzLnRyYWNlKGBMaWZlY3ljbGUjd2luZG93Lm9uKCdjbG9zZWQnKSAtIHdpbmRvdyBJRCAke3dpbmRvdy5pZH1gKTtcblxuXHRcdFx0Ly8gdXBkYXRlIHdpbmRvdyBjb3VudFxuXHRcdFx0dGhpcy53aW5kb3dDb3VudGVyLS07XG5cblx0XHRcdC8vIGNsZWFyIHdpbmRvdyBsaXN0ZW5lcnNcblx0XHRcdHdpbmRvd0xpc3RlbmVycy5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIGlmIHRoZXJlIGFyZSBubyBtb3JlIGNvZGUgd2luZG93cyBvcGVuZWQsIGZpcmUgdGhlIG9uV2lsbFNodXRkb3duIGV2ZW50LCB1bmxlc3Ncblx0XHRcdC8vIHdlIGFyZSBvbiBtYWNPUyB3aGVyZSBpdCBpcyBwZXJmZWN0bHkgZmluZSB0byBjbG9zZSB0aGUgbGFzdCB3aW5kb3cgYW5kXG5cdFx0XHQvLyB0aGUgYXBwbGljYXRpb24gY29udGludWVzIHJ1bm5pbmcgKHVubGVzcyBxdWl0IHdhcyBhY3R1YWxseSByZXF1ZXN0ZWQpXG5cdFx0XHRpZiAodGhpcy53aW5kb3dDb3VudGVyID09PSAwICYmICghaXNNYWNpbnRvc2ggfHwgdGhpcy5fcXVpdFJlcXVlc3RlZCkpIHtcblx0XHRcdFx0dGhpcy5maXJlT25XaWxsU2h1dGRvd24oU2h1dGRvd25SZWFzb24uUVVJVCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cmVnaXN0ZXJBdXhXaW5kb3coYXV4V2luZG93OiBJQXV4aWxpYXJ5V2luZG93KTogdm9pZCB7XG5cdFx0Y29uc3Qgd2luID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoYXV4V2luZG93Lndpbik7XG5cblx0XHRjb25zdCB3aW5kb3dMaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0d2luZG93TGlzdGVuZXJzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjxlbGVjdHJvbi5FdmVudD4od2luLCAnY2xvc2UnKShlID0+IHtcblx0XHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSNhdXhXaW5kb3cub24oJ2Nsb3NlJykgLSB3aW5kb3cgSUQgJHthdXhXaW5kb3cuaWR9YCk7XG5cblx0XHRcdGlmICh0aGlzLl9xdWl0UmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoYExpZmVjeWNsZSNhdXhXaW5kb3cub24oJ2Nsb3NlJykgLSBwcmV2ZW50RGVmYXVsdCgpIGJlY2F1c2UgcXVpdCByZXF1ZXN0ZWRgKTtcblxuXHRcdFx0XHQvLyBXaGVuIHF1aXQgaXMgcmVxdWVzdGVkLCBFbGVjdHJvbiB3aWxsIGNsb3NlIGFsbFxuXHRcdFx0XHQvLyBhdXhpbGlhcnkgd2luZG93cyBiZWZvcmUgY2xvc2luZyB0aGUgbWFpbiB3aW5kb3dzLlxuXHRcdFx0XHQvLyBUaGlzIHByZXZlbnRzIHVzIGZyb20gc3RvcmluZyB0aGUgYXV4aWxpYXJ5IHdpbmRvd1xuXHRcdFx0XHQvLyBzdGF0ZSBvbiBzaHV0ZG93biBhbmQgdGh1cyB3ZSBwcmV2ZW50IGNsb3NpbmcgaWZcblx0XHRcdFx0Ly8gcXVpdCBpcyByZXF1ZXN0ZWQuXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIEludGVyZXN0aW5nbHksIHRoaXMgd2lsbCBub3QgcHJldmVudCB0aGUgYXBwbGljYXRpb25cblx0XHRcdFx0Ly8gZnJvbSBxdWl0dGluZyBiZWNhdXNlIHRoZSBhdXhpbGlhcnkgd2luZG93cyB3aWxsIHN0aWxsXG5cdFx0XHRcdC8vIGNsb3NlIG9uY2UgdGhlIG93bmluZyB3aW5kb3cgY2xvc2VzLlxuXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0d2luZG93TGlzdGVuZXJzLmFkZChFdmVudC5mcm9tTm9kZUV2ZW50RW1pdHRlcjxlbGVjdHJvbi5FdmVudD4od2luLCAnY2xvc2VkJykoKCkgPT4ge1xuXHRcdFx0dGhpcy50cmFjZShgTGlmZWN5Y2xlI2F1eFdpbmRvdy5vbignY2xvc2VkJykgLSB3aW5kb3cgSUQgJHthdXhXaW5kb3cuaWR9YCk7XG5cblx0XHRcdHdpbmRvd0xpc3RlbmVycy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0YXN5bmMgcmVsb2FkKHdpbmRvdzogSUNvZGVXaW5kb3csIGNsaT86IE5hdGl2ZVBhcnNlZEFyZ3MpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIE9ubHkgcmVsb2FkIHdoZW4gdGhlIHdpbmRvdyBoYXMgbm90IHZldG9lZCB0aGlzXG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IHRoaXMudW5sb2FkKHdpbmRvdywgVW5sb2FkUmVhc29uLlJFTE9BRCk7XG5cdFx0aWYgKCF2ZXRvKSB7XG5cdFx0XHR3aW5kb3cucmVsb2FkKGNsaSk7XG5cdFx0fVxuXHR9XG5cblx0dW5sb2FkKHdpbmRvdzogSUNvZGVXaW5kb3csIHJlYXNvbjogVW5sb2FkUmVhc29uKTogUHJvbWlzZTxib29sZWFuIC8qIHZldG8gKi8+IHtcblxuXHRcdC8vIEVuc3VyZSB0aGVyZSBpcyBvbmx5IDEgdW5sb2FkIHJ1bm5pbmcgYXQgdGhlIHNhbWUgdGltZVxuXHRcdGNvbnN0IHBlbmRpbmdVbmxvYWRQcm9taXNlID0gdGhpcy5tYXBXaW5kb3dJZFRvUGVuZGluZ1VubG9hZC5nZXQod2luZG93LmlkKTtcblx0XHRpZiAocGVuZGluZ1VubG9hZFByb21pc2UpIHtcblx0XHRcdHJldHVybiBwZW5kaW5nVW5sb2FkUHJvbWlzZTtcblx0XHR9XG5cblx0XHQvLyBTdGFydCB1bmxvYWQgYW5kIHJlbWVtYmVyIGluIG1hcCB1bnRpbCBmaW5pc2hlZFxuXHRcdGNvbnN0IHVubG9hZFByb21pc2UgPSB0aGlzLmRvVW5sb2FkKHdpbmRvdywgcmVhc29uKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMubWFwV2luZG93SWRUb1BlbmRpbmdVbmxvYWQuZGVsZXRlKHdpbmRvdy5pZCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5tYXBXaW5kb3dJZFRvUGVuZGluZ1VubG9hZC5zZXQod2luZG93LmlkLCB1bmxvYWRQcm9taXNlKTtcblxuXHRcdHJldHVybiB1bmxvYWRQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1VubG9hZCh3aW5kb3c6IElDb2RlV2luZG93LCByZWFzb246IFVubG9hZFJlYXNvbik6IFByb21pc2U8Ym9vbGVhbiAvKiB2ZXRvICovPiB7XG5cblx0XHQvLyBBbHdheXMgYWxsb3cgdG8gdW5sb2FkIGEgd2luZG93IHRoYXQgaXMgbm90IHlldCByZWFkeVxuXHRcdGlmICghd2luZG93LmlzUmVhZHkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnRyYWNlKGBMaWZlY3ljbGUjdW5sb2FkKCkgLSB3aW5kb3cgSUQgJHt3aW5kb3cuaWR9YCk7XG5cblx0XHQvLyBmaXJzdCBhc2sgdGhlIHdpbmRvdyBpdHNlbGYgaWYgaXQgdmV0b3MgdGhlIHVubG9hZFxuXHRcdGNvbnN0IHdpbmRvd1VubG9hZFJlYXNvbiA9IHRoaXMuX3F1aXRSZXF1ZXN0ZWQgPyBVbmxvYWRSZWFzb24uUVVJVCA6IHJlYXNvbjtcblx0XHRjb25zdCB2ZXRvID0gYXdhaXQgdGhpcy5vbkJlZm9yZVVubG9hZFdpbmRvd0luUmVuZGVyZXIod2luZG93LCB3aW5kb3dVbmxvYWRSZWFzb24pO1xuXHRcdGlmICh2ZXRvKSB7XG5cdFx0XHR0aGlzLnRyYWNlKGBMaWZlY3ljbGUjdW5sb2FkKCkgLSB2ZXRvIGluIHJlbmRlcmVyICh3aW5kb3cgSUQgJHt3aW5kb3cuaWR9KWApO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5oYW5kbGVXaW5kb3dVbmxvYWRWZXRvKHZldG8pO1xuXHRcdH1cblxuXHRcdC8vIGZpbmFsbHkgaWYgdGhlcmUgYXJlIG5vIHZldG9zLCB1bmxvYWQgdGhlIHJlbmRlcmVyXG5cdFx0YXdhaXQgdGhpcy5vbldpbGxVbmxvYWRXaW5kb3dJblJlbmRlcmVyKHdpbmRvdywgd2luZG93VW5sb2FkUmVhc29uKTtcblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlV2luZG93VW5sb2FkVmV0byh2ZXRvOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF2ZXRvKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vIHZldG9cblx0XHR9XG5cblx0XHQvLyBhIHZldG8gcmVzb2x2ZXMgYW55IHBlbmRpbmcgcXVpdCB3aXRoIHZldG9cblx0XHR0aGlzLnJlc29sdmVQZW5kaW5nUXVpdFByb21pc2UodHJ1ZSAvKiB2ZXRvICovKTtcblxuXHRcdC8vIGEgdmV0byByZXNldHMgdGhlIHBlbmRpbmcgcXVpdCByZXF1ZXN0IGZsYWdcblx0XHR0aGlzLl9xdWl0UmVxdWVzdGVkID0gZmFsc2U7XG5cblx0XHRyZXR1cm4gdHJ1ZTsgLy8gdmV0b1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlUGVuZGluZ1F1aXRQcm9taXNlKHZldG86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5wZW5kaW5nUXVpdFByb21pc2VSZXNvbHZlKSB7XG5cdFx0XHR0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZVJlc29sdmUodmV0byk7XG5cdFx0XHR0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZVJlc29sdmUgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQmVmb3JlVW5sb2FkV2luZG93SW5SZW5kZXJlcih3aW5kb3c6IElDb2RlV2luZG93LCByZWFzb246IFVubG9hZFJlYXNvbik6IFByb21pc2U8Ym9vbGVhbiAvKiB2ZXRvICovPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3Qgb25lVGltZUV2ZW50VG9rZW4gPSB0aGlzLm9uZVRpbWVMaXN0ZW5lclRva2VuR2VuZXJhdG9yKys7XG5cdFx0XHRjb25zdCBva0NoYW5uZWwgPSBgdnNjb2RlOm9rJHtvbmVUaW1lRXZlbnRUb2tlbn1gO1xuXHRcdFx0Y29uc3QgY2FuY2VsQ2hhbm5lbCA9IGB2c2NvZGU6Y2FuY2VsJHtvbmVUaW1lRXZlbnRUb2tlbn1gO1xuXG5cdFx0XHRjb25zdCBjbGVhbnVwID0gKHZhbHVlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHZhbGlkYXRlZElwY01haW4ucmVtb3ZlTGlzdGVuZXIob2tDaGFubmVsLCBva0xpc3RlbmVyKTtcblx0XHRcdFx0dmFsaWRhdGVkSXBjTWFpbi5yZW1vdmVMaXN0ZW5lcihjYW5jZWxDaGFubmVsLCBjYW5jZWxMaXN0ZW5lcik7XG5cdFx0XHRcdHJlc29sdmUodmFsdWUpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgb2tMaXN0ZW5lciA9ICgpID0+IHtcblx0XHRcdFx0Y2xlYW51cChmYWxzZSk7IC8vIG5vIHZldG9cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNhbmNlbExpc3RlbmVyID0gKCkgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKHRydWUpOyAvLyB2ZXRvXG5cdFx0XHR9O1xuXG5cdFx0XHR2YWxpZGF0ZWRJcGNNYWluLm9uKG9rQ2hhbm5lbCwgb2tMaXN0ZW5lcik7XG5cdFx0XHR2YWxpZGF0ZWRJcGNNYWluLm9uKGNhbmNlbENoYW5uZWwsIGNhbmNlbExpc3RlbmVyKTtcblxuXHRcdFx0d2luZG93LnNlbmQoJ3ZzY29kZTpvbkJlZm9yZVVubG9hZCcsIHsgb2tDaGFubmVsLCBjYW5jZWxDaGFubmVsLCByZWFzb24gfSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG9uV2lsbFVubG9hZFdpbmRvd0luUmVuZGVyZXIod2luZG93OiBJQ29kZVdpbmRvdywgcmVhc29uOiBVbmxvYWRSZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBvbmVUaW1lRXZlbnRUb2tlbiA9IHRoaXMub25lVGltZUxpc3RlbmVyVG9rZW5HZW5lcmF0b3IrKztcblx0XHRcdGNvbnN0IHJlcGx5Q2hhbm5lbCA9IGB2c2NvZGU6cmVwbHkke29uZVRpbWVFdmVudFRva2VufWA7XG5cblx0XHRcdHZhbGlkYXRlZElwY01haW4ub25jZShyZXBseUNoYW5uZWwsICgpID0+IHJlc29sdmUoKSk7XG5cblx0XHRcdHdpbmRvdy5zZW5kKCd2c2NvZGU6b25XaWxsVW5sb2FkJywgeyByZXBseUNoYW5uZWwsIHJlYXNvbiB9KTtcblx0XHR9KTtcblx0fVxuXG5cdHF1aXQod2lsbFJlc3RhcnQ/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuIC8qIHZldG8gKi8+IHtcblx0XHRyZXR1cm4gdGhpcy5kb1F1aXQod2lsbFJlc3RhcnQpLnRoZW4odmV0byA9PiB7XG5cdFx0XHRpZiAoIXZldG8gJiYgd2lsbFJlc3RhcnQpIHtcblx0XHRcdFx0Ly8gV2luZG93czogd2UgYXJlIGFib3V0IHRvIHJlc3RhcnQgYW5kIGFzIHN1Y2ggd2UgbmVlZCB0byByZXN0b3JlIHRoZSBvcmlnaW5hbFxuXHRcdFx0XHQvLyBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IHdlIGhhZCBvbiBzdGFydHVwIHRvIGdldCB0aGUgZXhhY3Qgc2FtZSBzdGFydHVwXG5cdFx0XHRcdC8vIGJlaGF2aW91ci4gQXMgc3VjaCwgd2UgYnJpZWZseSBjaGFuZ2UgYmFjayB0byB0aGF0IGRpcmVjdG9yeSBhbmQgdGhlbiB3aGVuXG5cdFx0XHRcdC8vIENvZGUgc3RhcnRzIGl0IHdpbGwgc2V0IGl0IGJhY2sgdG8gdGhlIGluc3RhbGxhdGlvbiBkaXJlY3RvcnkgYWdhaW4uXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFdvcmtpbmdEaXIgPSBjd2QoKTtcblx0XHRcdFx0XHRcdGlmIChjdXJyZW50V29ya2luZ0RpciAhPT0gcHJvY2Vzcy5jd2QoKSkge1xuXHRcdFx0XHRcdFx0XHRwcm9jZXNzLmNoZGlyKGN1cnJlbnRXb3JraW5nRGlyKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB2ZXRvO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1F1aXQod2lsbFJlc3RhcnQ/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuIC8qIHZldG8gKi8+IHtcblx0XHR0aGlzLnRyYWNlKGBMaWZlY3ljbGUjcXVpdCgpIC0gYmVnaW4gKHdpbGxSZXN0YXJ0OiAke3dpbGxSZXN0YXJ0fSlgKTtcblxuXHRcdGlmICh0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZSkge1xuXHRcdFx0dGhpcy50cmFjZSgnTGlmZWN5Y2xlI3F1aXQoKSAtIHJldHVybmluZyBwZW5kaW5nIHF1aXQgcHJvbWlzZScpO1xuXG5cdFx0XHRyZXR1cm4gdGhpcy5wZW5kaW5nUXVpdFByb21pc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgaWYgd2UgYXJlIGFib3V0IHRvIHJlc3RhcnRcblx0XHRpZiAod2lsbFJlc3RhcnQpIHtcblx0XHRcdHRoaXMuc3RhdGVTZXJ2aWNlLnNldEl0ZW0oTGlmZWN5Y2xlTWFpblNlcnZpY2UuUVVJVF9BTkRfUkVTVEFSVF9LRVksIHRydWUpO1xuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ1F1aXRQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cblx0XHRcdC8vIFN0b3JlIGFzIGZpZWxkIHRvIGFjY2VzcyBpdCBmcm9tIGEgd2luZG93IGNhbmNlbGxhdGlvblxuXHRcdFx0dGhpcy5wZW5kaW5nUXVpdFByb21pc2VSZXNvbHZlID0gcmVzb2x2ZTtcblxuXHRcdFx0Ly8gQ2FsbGluZyBhcHAucXVpdCgpIHdpbGwgdHJpZ2dlciB0aGUgY2xvc2UgaGFuZGxlcnMgb2YgZWFjaCBvcGVuZWQgd2luZG93XG5cdFx0XHQvLyBhbmQgb25seSBpZiBubyB3aW5kb3cgdmV0b2VkIHRoZSBzaHV0ZG93biwgd2Ugd2lsbCBnZXQgdGhlIHdpbGwtcXVpdCBldmVudFxuXHRcdFx0dGhpcy50cmFjZSgnTGlmZWN5Y2xlI3F1aXQoKSAtIGNhbGxpbmcgYXBwLnF1aXQoKScpO1xuXHRcdFx0ZWxlY3Ryb24uYXBwLnF1aXQoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB0aGlzLnBlbmRpbmdRdWl0UHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgdHJhY2UobXNnOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudE1haW5TZXJ2aWNlLmFyZ3NbJ2VuYWJsZS1zbW9rZS10ZXN0LWRyaXZlciddKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhtc2cpOyAvLyBoZWxwcyBkaWFnbm9zZSBpc3N1ZXMgd2l0aCBleGl0aW5nIGZyb20gc21va2UgdGVzdHNcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKG1zZyk7XG5cdFx0fVxuXHR9XG5cblx0c2V0UmVsYXVuY2hIYW5kbGVyKGhhbmRsZXI6IElSZWxhdW5jaEhhbmRsZXIpOiB2b2lkIHtcblx0XHR0aGlzLnJlbGF1bmNoSGFuZGxlciA9IGhhbmRsZXI7XG5cdH1cblxuXHRhc3luYyByZWxhdW5jaChvcHRpb25zPzogSVJlbGF1bmNoT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNyZWxhdW5jaCgpJyk7XG5cblx0XHRjb25zdCBhcmdzID0gcHJvY2Vzcy5hcmd2LnNsaWNlKDEpO1xuXHRcdGlmIChvcHRpb25zPy5hZGRBcmdzKSB7XG5cdFx0XHRhcmdzLnB1c2goLi4ub3B0aW9ucy5hZGRBcmdzKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucz8ucmVtb3ZlQXJncykge1xuXHRcdFx0Zm9yIChjb25zdCBhIG9mIG9wdGlvbnMucmVtb3ZlQXJncykge1xuXHRcdFx0XHRjb25zdCBpZHggPSBhcmdzLmluZGV4T2YoYSk7XG5cdFx0XHRcdGlmIChpZHggPj0gMCkge1xuXHRcdFx0XHRcdGFyZ3Muc3BsaWNlKGlkeCwgMSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBxdWl0TGlzdGVuZXIgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMucmVsYXVuY2hIYW5kbGVyPy5oYW5kbGVSZWxhdW5jaChvcHRpb25zKSkge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdMaWZlY3ljbGUjcmVsYXVuY2goKSAtIGNhbGxpbmcgYXBwLnJlbGF1bmNoKCknKTtcblx0XHRcdFx0ZWxlY3Ryb24uYXBwLnJlbGF1bmNoKHsgYXJncyB9KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGVsZWN0cm9uLmFwcC5vbmNlKCdxdWl0JywgcXVpdExpc3RlbmVyKTtcblxuXHRcdC8vIGBhcHAucmVsYXVuY2goKWAgZG9lcyBub3QgcXVpdCBhdXRvbWF0aWNhbGx5LCBzbyB3ZSBxdWl0IGZpcnN0LFxuXHRcdC8vIGNoZWNrIGZvciB2ZXRvZXMgYW5kIHRoZW4gcmVsYXVuY2ggZnJvbSB0aGUgYGFwcC5vbigncXVpdCcpYCBldmVudFxuXHRcdGNvbnN0IHZldG8gPSBhd2FpdCB0aGlzLnF1aXQodHJ1ZSAvKiB3aWxsIHJlc3RhcnQgKi8pO1xuXHRcdGlmICh2ZXRvKSB7XG5cdFx0XHRlbGVjdHJvbi5hcHAucmVtb3ZlTGlzdGVuZXIoJ3F1aXQnLCBxdWl0TGlzdGVuZXIpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGtpbGwoY29kZT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudHJhY2UoJ0xpZmVjeWNsZSNraWxsKCknKTtcblxuXHRcdC8vIEdpdmUgbWFpbiBwcm9jZXNzIHBhcnRpY2lwYW50cyBhIGNoYW5jZSB0byBvcmRlcmx5IHNodXRkb3duXG5cdFx0YXdhaXQgdGhpcy5maXJlT25XaWxsU2h1dGRvd24oU2h1dGRvd25SZWFzb24uS0lMTCk7XG5cblx0XHQvLyBGcm9tIGV4dGVuc2lvbiB0ZXN0cyB3ZSBoYXZlIHNlZW4gaXNzdWVzIHdoZXJlIGNhbGxpbmcgYXBwLmV4aXQoKVxuXHRcdC8vIHdpdGggYW4gb3BlbmVkIHdpbmRvdyBjYW4gbGVhZCB0byBuYXRpdmUgY3Jhc2hlcyAoTGludXgpLiBBcyBzdWNoLFxuXHRcdC8vIHdlIHNob3VsZCBtYWtlIHN1cmUgdG8gZGVzdHJveSBhbnkgb3BlbmVkIHdpbmRvdyBiZWZvcmUgY2FsbGluZ1xuXHRcdC8vIGBhcHAuZXhpdCgpYC5cblx0XHQvL1xuXHRcdC8vIE5vdGU6IEVsZWN0cm9uIGltcGxlbWVudHMgYSBzaW1pbGFyIGxvZ2ljIGhlcmU6XG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uL2VsZWN0cm9uL2Jsb2IvZmU1MzE4ZDc1MzYzN2MzOTAzZTIzZmMxZWQxYjI2MzAyNTg4N2I2YS9zcGVjLW1haW4vd2luZG93LWhlbHBlcnMudHMjTDVcblxuXHRcdGF3YWl0IFByb21pc2UucmFjZShbXG5cblx0XHRcdC8vIFN0aWxsIGRvIG5vdCBibG9jayBtb3JlIHRoYW4gMXNcblx0XHRcdHRpbWVvdXQoMTAwMCksXG5cblx0XHRcdC8vIERlc3Ryb3kgYW55IG9wZW5lZCB3aW5kb3c6IHdlIGRvIG5vdCB1bmxvYWQgd2luZG93cyBoZXJlIGJlY2F1c2Vcblx0XHRcdC8vIHRoZXJlIGlzIGEgY2hhbmNlIHRoYXQgdGhlIHVubG9hZCBpcyB2ZXRvJ2Qgb3IgbG9uZyBydW5uaW5nIGR1ZVxuXHRcdFx0Ly8gdG8gYSBwYXJ0aWNpcGFudCB3aXRoaW4gdGhlIHdpbmRvdy4gdGhpcyBpcyBub3Qgd2FudGVkIHdoZW4gd2Vcblx0XHRcdC8vIGFyZSBhc2tlZCB0byBraWxsIHRoZSBhcHBsaWNhdGlvbi5cblx0XHRcdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3Qgd2luZG93IG9mIGdldEFsbFdpbmRvd3NFeGNsdWRpbmdPZmZzY3JlZW4oKSkge1xuXHRcdFx0XHRcdGlmICh3aW5kb3cgJiYgIXdpbmRvdy5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRcdFx0XHRsZXQgd2hlbldpbmRvd0Nsb3NlZDogUHJvbWlzZTx2b2lkPjtcblx0XHRcdFx0XHRcdGlmICh3aW5kb3cud2ViQ29udGVudHMgJiYgIXdpbmRvdy53ZWJDb250ZW50cy5pc0Rlc3Ryb3llZCgpKSB7XG5cdFx0XHRcdFx0XHRcdHdoZW5XaW5kb3dDbG9zZWQgPSBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHdpbmRvdy5vbmNlKCdjbG9zZWQnLCByZXNvbHZlKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR3aGVuV2luZG93Q2xvc2VkID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHdpbmRvdy5kZXN0cm95KCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB3aGVuV2luZG93Q2xvc2VkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkoKVxuXHRcdF0pO1xuXG5cdFx0Ly8gTm93IGV4aXQgZWl0aGVyIGFmdGVyIDFzIG9yIGFsbCB3aW5kb3dzIGRlc3Ryb3llZFxuXHRcdGVsZWN0cm9uLmFwcC5leGl0KGNvZGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sY0FBYztBQUNyQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMsVUFBVSxlQUFlO0FBQzNDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxhQUFh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LHNCQUFzQjtBQUVqQyxVQUFNLE9BQU8sUUFBUSxLQUFLLE1BQU0sQ0FBQztBQUNqQyxRQUFJLFNBQVMsU0FBUztBQUNyQixXQUFLLEtBQUssR0FBRyxRQUFRLE9BQU87QUFBQSxJQUM3QjtBQUVBLFFBQUksU0FBUyxZQUFZO0FBQ3hCLGlCQUFXLEtBQUssUUFBUSxZQUFZO0FBQ25DLGNBQU0sTUFBTSxLQUFLLFFBQVEsQ0FBQztBQUMxQixZQUFJLE9BQU8sR0FBRztBQUNiLGVBQUssT0FBTyxLQUFLLENBQUM7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLE1BQU07QUFDMUIsVUFBSSxDQUFDLEtBQUssaUJBQWlCLGVBQWUsT0FBTyxHQUFHO0FBQ25ELGFBQUssTUFBTSwrQ0FBK0M7QUFDMUQsaUJBQVMsSUFBSSxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQUEsTUFDL0I7QUFBQSxJQUNEO0FBQ0EsYUFBUyxJQUFJLEtBQUssUUFBUSxZQUFZO0FBSXRDLFVBQU0sT0FBTyxNQUFNLEtBQUs7QUFBQSxNQUFLO0FBQUE7QUFBQSxJQUF1QjtBQUNwRCxRQUFJLE1BQU07QUFDVCxlQUFTLElBQUksZUFBZSxRQUFRLFlBQVk7QUFBQSxJQUNqRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sS0FBSyxNQUE4QjtBQUN4QyxTQUFLLE1BQU0sa0JBQWtCO0FBRzdCLFVBQU0sS0FBSyxtQkFBbUIsWUFBbUI7QUFVakQsVUFBTSxRQUFRLEtBQUs7QUFBQTtBQUFBLE1BR2xCLFFBQVEsR0FBSTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsT0FNWCxZQUFZO0FBQ1osbUJBQVcsVUFBVSxnQ0FBZ0MsR0FBRztBQUN2RCxjQUFJLFVBQVUsQ0FBQyxPQUFPLFlBQVksR0FBRztBQUNwQyxnQkFBSTtBQUNKLGdCQUFJLE9BQU8sZUFBZSxDQUFDLE9BQU8sWUFBWSxZQUFZLEdBQUc7QUFDNUQsaUNBQW1CLElBQUksUUFBUSxhQUFXLE9BQU8sS0FBSyxVQUFVLE9BQU8sQ0FBQztBQUFBLFlBQ3pFLE9BQU87QUFDTixpQ0FBbUIsUUFBUSxRQUFRO0FBQUEsWUFDcEM7QUFFQSxtQkFBTyxRQUFRO0FBQ2Ysa0JBQU07QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLE1BQ0QsR0FBRztBQUFBLElBQ0osQ0FBQztBQUdELGFBQVMsSUFBSSxLQUFLLElBQUk7QUFBQSxFQUN2QjtBQUNEO0FBaGlCYSxxQkFJWSx1QkFBdUI7QUFKbkMsdUJBQU47QUFBQSxFQTJDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0E3Q1U7IiwKICAibmFtZXMiOiBbIlNodXRkb3duUmVhc29uIiwgIkxpZmVjeWNsZU1haW5QaGFzZSJdCn0K
