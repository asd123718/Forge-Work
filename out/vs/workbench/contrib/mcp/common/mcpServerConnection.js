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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { log, LogLevel } from "../../../../platform/log/common/log.js";
import { McpServerRequestHandler } from "./mcpServerRequestHandler.js";
import { McpConnectionState } from "./mcpTypes.js";
let McpServerConnection = class extends Disposable {
  constructor(_collection, definition, _delegate, launchDefinition, _logger, _errorOnUserInteraction, _taskManager, _instantiationService) {
    super();
    this._collection = _collection;
    this.definition = definition;
    this._delegate = _delegate;
    this.launchDefinition = launchDefinition;
    this._logger = _logger;
    this._errorOnUserInteraction = _errorOnUserInteraction;
    this._taskManager = _taskManager;
    this._instantiationService = _instantiationService;
    this._launch = this._register(new MutableDisposable());
    this._state = observableValue("mcpServerState", { state: McpConnectionState.Kind.Stopped });
    this._requestHandler = observableValue("mcpServerRequestHandler", void 0);
    this._onPotentialSandboxBlock = this._register(new Emitter());
    this.state = this._state;
    this.handler = this._requestHandler;
    this.onPotentialSandboxBlock = this._onPotentialSandboxBlock.event;
  }
  /** @inheritdoc */
  async start(methods) {
    const currentState = this._state.get();
    if (!McpConnectionState.canBeStarted(currentState.state)) {
      return this._waitForState(McpConnectionState.Kind.Running, McpConnectionState.Kind.Error);
    }
    this._launch.value = void 0;
    this._state.set({ state: McpConnectionState.Kind.Starting }, void 0);
    this._logger.info(localize("mcpServer.starting", "Starting server {0}", this.definition.label));
    try {
      const launch = this._delegate.start(this._collection, this.definition, this.launchDefinition, { errorOnUserInteraction: this._errorOnUserInteraction });
      this._launch.value = this.adoptLaunch(launch, methods);
      return this._waitForState(McpConnectionState.Kind.Running, McpConnectionState.Kind.Error);
    } catch (e) {
      const errorState = {
        state: McpConnectionState.Kind.Error,
        message: e instanceof Error ? e.message : String(e)
      };
      this._state.set(errorState, void 0);
      return errorState;
    }
  }
  adoptLaunch(launch, methods) {
    const store = new DisposableStore();
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    store.add(launch);
    store.add(launch.onDidLog(({ level, message }) => {
      log(this._logger, level, message);
      const potentialBlock = this._toPotentialSandboxBlock(message);
      if (potentialBlock) {
        this._onPotentialSandboxBlock.fire(potentialBlock);
      }
    }));
    let didStart = false;
    store.add(autorun((reader) => {
      const state = launch.state.read(reader);
      this._state.set(state, void 0);
      this._logger.info(localize("mcpServer.state", "Connection state: {0}", McpConnectionState.toString(state)));
      if (state.state === McpConnectionState.Kind.Running && !didStart) {
        didStart = true;
        McpServerRequestHandler.create(this._instantiationService, {
          ...methods,
          launch,
          logger: this._logger,
          requestLogLevel: this.definition.devMode ? LogLevel.Info : LogLevel.Debug,
          taskManager: this._taskManager
        }, cts.token).then(
          (handler) => {
            if (!store.isDisposed) {
              this._requestHandler.set(handler, void 0);
            } else {
              handler.dispose();
            }
          },
          (err) => {
            if (!store.isDisposed && McpConnectionState.isRunning(this._state.read(void 0))) {
              let message = err.message;
              if (err instanceof CancellationError) {
                message = "Server exited before responding to `initialize` request.";
                this._logger.error(message);
              } else {
                this._logger.error(err);
              }
              this._state.set({ state: McpConnectionState.Kind.Error, message }, void 0);
            }
            store.dispose();
          }
        );
      }
    }));
    return { dispose: () => store.dispose(), object: launch };
  }
  async stop() {
    this._logger.info(localize("mcpServer.stopping", "Stopping server {0}", this.definition.label));
    this._launch.value?.object.stop();
    await this._waitForState(McpConnectionState.Kind.Stopped, McpConnectionState.Kind.Error);
  }
  dispose() {
    this._requestHandler.get()?.dispose();
    super.dispose();
    this._state.set({ state: McpConnectionState.Kind.Stopped }, void 0);
  }
  _waitForState(...kinds) {
    const current = this._state.get();
    if (kinds.includes(current.state)) {
      return Promise.resolve(current);
    }
    return new Promise((resolve) => {
      const disposable = autorun((reader) => {
        const state = this._state.read(reader);
        if (kinds.includes(state.state)) {
          disposable.dispose();
          resolve(state);
        }
      });
    });
  }
  _toPotentialSandboxBlock(message) {
    if (!this.definition.sandboxEnabled) {
      return void 0;
    }
    if (/No matching config rule, denying:/i.test(message)) {
      return {
        kind: "network",
        message,
        host: this._extractSandboxHost(message)
      };
    }
    if (/(?:\b(?:EACCES|EPERM|ENOENT|EROFS|fail(?:ed|ure)?)\b|not accessible|read[- ]only)/i.test(message)) {
      return {
        kind: "filesystem",
        message,
        path: this._extractSandboxPath(message)
      };
    }
    return void 0;
  }
  _extractSandboxPath(line) {
    const bracketedPath = line.match(/\[(\/[^\]\r\n]+)\]/);
    if (bracketedPath?.[1]) {
      return bracketedPath[1].trim();
    }
    const quotedPath = line.match(/["'`](\/[^"'`]+)["'`]/);
    if (quotedPath?.[1]) {
      return quotedPath[1];
    }
    const trailingPath = line.match(/(\/[\w.\-~/ ]+)$/);
    return trailingPath?.[1]?.trim();
  }
  _extractSandboxHost(value) {
    const match = value.match(/No matching config rule, denying:\s+(?<host>[^:\s]+):\d+\.?$/i);
    return match?.groups?.host;
  }
};
McpServerConnection = __decorateClass([
  __decorateParam(7, IInstantiationService)
], McpServerConnection);
export {
  McpServerConnection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BTZXJ2ZXJDb25uZWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dnZXIsIGxvZywgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWNwSG9zdERlbGVnYXRlLCBJTWNwTWVzc2FnZVRyYW5zcG9ydCB9IGZyb20gJy4vbWNwUmVnaXN0cnlUeXBlcy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB9IGZyb20gJy4vbWNwU2VydmVyUmVxdWVzdEhhbmRsZXIuanMnO1xuaW1wb3J0IHsgTWNwVGFza01hbmFnZXIgfSBmcm9tICcuL21jcFRhc2tNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElNY3BDbGllbnRNZXRob2RzLCBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrLCBJTWNwU2VydmVyQ29ubmVjdGlvbiwgTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sIE1jcENvbm5lY3Rpb25TdGF0ZSwgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoIH0gZnJvbSAnLi9tY3BUeXBlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNY3BTZXJ2ZXJDb25uZWN0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BTZXJ2ZXJDb25uZWN0aW9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbGF1bmNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElSZWZlcmVuY2U8SU1jcE1lc3NhZ2VUcmFuc3BvcnQ+PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8TWNwQ29ubmVjdGlvblN0YXRlPignbWNwU2VydmVyU3RhdGUnLCB7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkIH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXF1ZXN0SGFuZGxlciA9IG9ic2VydmFibGVWYWx1ZTxNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB8IHVuZGVmaW5lZD4oJ21jcFNlcnZlclJlcXVlc3RIYW5kbGVyJywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qb3RlbnRpYWxTYW5kYm94QmxvY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrPigpKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc3RhdGU6IElPYnNlcnZhYmxlPE1jcENvbm5lY3Rpb25TdGF0ZT4gPSB0aGlzLl9zdGF0ZTtcblx0cHVibGljIHJlYWRvbmx5IGhhbmRsZXI6IElPYnNlcnZhYmxlPE1jcFNlcnZlclJlcXVlc3RIYW5kbGVyIHwgdW5kZWZpbmVkPiA9IHRoaXMuX3JlcXVlc3RIYW5kbGVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25Qb3RlbnRpYWxTYW5kYm94QmxvY2sgPSB0aGlzLl9vblBvdGVudGlhbFNhbmRib3hCbG9jay5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb2xsZWN0aW9uOiBNY3BDb2xsZWN0aW9uRGVmaW5pdGlvbixcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGVmaW5pdGlvbjogTWNwU2VydmVyRGVmaW5pdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWxlZ2F0ZTogSU1jcEhvc3REZWxlZ2F0ZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGF1bmNoRGVmaW5pdGlvbjogTWNwU2VydmVyTGF1bmNoLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ2dlcjogSUxvZ2dlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lcnJvck9uVXNlckludGVyYWN0aW9uOiBib29sZWFuIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Rhc2tNYW5hZ2VyOiBNY3BUYXNrTWFuYWdlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIGFzeW5jIHN0YXJ0KG1ldGhvZHM6IElNY3BDbGllbnRNZXRob2RzKTogUHJvbWlzZTxNY3BDb25uZWN0aW9uU3RhdGU+IHtcblx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRpZiAoIU1jcENvbm5lY3Rpb25TdGF0ZS5jYW5CZVN0YXJ0ZWQoY3VycmVudFN0YXRlLnN0YXRlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3dhaXRGb3JTdGF0ZShNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nLCBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGF1bmNoLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0YXRlLnNldCh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdGFydGluZyB9LCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGxvY2FsaXplKCdtY3BTZXJ2ZXIuc3RhcnRpbmcnLCAnU3RhcnRpbmcgc2VydmVyIHswfScsIHRoaXMuZGVmaW5pdGlvbi5sYWJlbCkpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxhdW5jaCA9IHRoaXMuX2RlbGVnYXRlLnN0YXJ0KHRoaXMuX2NvbGxlY3Rpb24sIHRoaXMuZGVmaW5pdGlvbiwgdGhpcy5sYXVuY2hEZWZpbml0aW9uLCB7IGVycm9yT25Vc2VySW50ZXJhY3Rpb246IHRoaXMuX2Vycm9yT25Vc2VySW50ZXJhY3Rpb24gfSk7XG5cdFx0XHR0aGlzLl9sYXVuY2gudmFsdWUgPSB0aGlzLmFkb3B0TGF1bmNoKGxhdW5jaCwgbWV0aG9kcyk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd2FpdEZvclN0YXRlKE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcsIE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zdCBlcnJvclN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUgPSB7XG5cdFx0XHRcdHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fc3RhdGUuc2V0KGVycm9yU3RhdGUsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm4gZXJyb3JTdGF0ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkb3B0TGF1bmNoKGxhdW5jaDogSU1jcE1lc3NhZ2VUcmFuc3BvcnQsIG1ldGhvZHM6IElNY3BDbGllbnRNZXRob2RzKTogSVJlZmVyZW5jZTxJTWNwTWVzc2FnZVRyYW5zcG9ydD4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHN0b3JlLmFkZChsYXVuY2gpO1xuXHRcdHN0b3JlLmFkZChsYXVuY2gub25EaWRMb2coKHsgbGV2ZWwsIG1lc3NhZ2UgfSkgPT4ge1xuXHRcdFx0bG9nKHRoaXMuX2xvZ2dlciwgbGV2ZWwsIG1lc3NhZ2UpO1xuXHRcdFx0Y29uc3QgcG90ZW50aWFsQmxvY2sgPSB0aGlzLl90b1BvdGVudGlhbFNhbmRib3hCbG9jayhtZXNzYWdlKTtcblx0XHRcdGlmIChwb3RlbnRpYWxCbG9jaykge1xuXHRcdFx0XHR0aGlzLl9vblBvdGVudGlhbFNhbmRib3hCbG9jay5maXJlKHBvdGVudGlhbEJsb2NrKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgZGlkU3RhcnQgPSBmYWxzZTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBsYXVuY2guc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fc3RhdGUuc2V0KHN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8obG9jYWxpemUoJ21jcFNlcnZlci5zdGF0ZScsICdDb25uZWN0aW9uIHN0YXRlOiB7MH0nLCBNY3BDb25uZWN0aW9uU3RhdGUudG9TdHJpbmcoc3RhdGUpKSk7XG5cblx0XHRcdGlmIChzdGF0ZS5zdGF0ZSA9PT0gTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZyAmJiAhZGlkU3RhcnQpIHtcblx0XHRcdFx0ZGlkU3RhcnQgPSB0cnVlO1xuXHRcdFx0XHRNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlci5jcmVhdGUodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsIHtcblx0XHRcdFx0XHQuLi5tZXRob2RzLFxuXHRcdFx0XHRcdGxhdW5jaCxcblx0XHRcdFx0XHRsb2dnZXI6IHRoaXMuX2xvZ2dlcixcblx0XHRcdFx0XHRyZXF1ZXN0TG9nTGV2ZWw6IHRoaXMuZGVmaW5pdGlvbi5kZXZNb2RlID8gTG9nTGV2ZWwuSW5mbyA6IExvZ0xldmVsLkRlYnVnLFxuXHRcdFx0XHRcdHRhc2tNYW5hZ2VyOiB0aGlzLl90YXNrTWFuYWdlcixcblx0XHRcdFx0fSwgY3RzLnRva2VuKS50aGVuKFxuXHRcdFx0XHRcdGhhbmRsZXIgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlcXVlc3RIYW5kbGVyLnNldChoYW5kbGVyLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aGFuZGxlci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRlcnIgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFzdG9yZS5pc0Rpc3Bvc2VkICYmIE1jcENvbm5lY3Rpb25TdGF0ZS5pc1J1bm5pbmcodGhpcy5fc3RhdGUucmVhZCh1bmRlZmluZWQpKSkge1xuXHRcdFx0XHRcdFx0XHRsZXQgbWVzc2FnZSA9IGVyci5tZXNzYWdlO1xuXHRcdFx0XHRcdFx0XHRpZiAoZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gJ1NlcnZlciBleGl0ZWQgYmVmb3JlIHJlc3BvbmRpbmcgdG8gYGluaXRpYWxpemVgIHJlcXVlc3QuJztcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dnZXIuZXJyb3IobWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKGVycik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RhdGUuc2V0KHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yLCBtZXNzYWdlIH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiBzdG9yZS5kaXNwb3NlKCksIG9iamVjdDogbGF1bmNoIH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3RvcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnbWNwU2VydmVyLnN0b3BwaW5nJywgJ1N0b3BwaW5nIHNlcnZlciB7MH0nLCB0aGlzLmRlZmluaXRpb24ubGFiZWwpKTtcblx0XHR0aGlzLl9sYXVuY2gudmFsdWU/Lm9iamVjdC5zdG9wKCk7XG5cdFx0YXdhaXQgdGhpcy5fd2FpdEZvclN0YXRlKE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQsIE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLkVycm9yKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlcXVlc3RIYW5kbGVyLmdldCgpPy5kaXNwb3NlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0YXRlLnNldCh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkIH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF93YWl0Rm9yU3RhdGUoLi4ua2luZHM6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kW10pOiBQcm9taXNlPE1jcENvbm5lY3Rpb25TdGF0ZT4ge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRpZiAoa2luZHMuaW5jbHVkZXMoY3VycmVudC5zdGF0ZSkpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoY3VycmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmIChraW5kcy5pbmNsdWRlcyhzdGF0ZS5zdGF0ZSkpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKHN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF90b1BvdGVudGlhbFNhbmRib3hCbG9jayhtZXNzYWdlOiBzdHJpbmcpOiBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuZGVmaW5pdGlvbi5zYW5kYm94RW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoL05vIG1hdGNoaW5nIGNvbmZpZyBydWxlLCBkZW55aW5nOi9pLnRlc3QobWVzc2FnZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICduZXR3b3JrJyxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0aG9zdDogdGhpcy5fZXh0cmFjdFNhbmRib3hIb3N0KG1lc3NhZ2UpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoLyg/OlxcYig/OkVBQ0NFU3xFUEVSTXxFTk9FTlR8RVJPRlN8ZmFpbCg/OmVkfHVyZSk/KVxcYnxub3QgYWNjZXNzaWJsZXxyZWFkWy0gXW9ubHkpL2kudGVzdChtZXNzYWdlKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2ZpbGVzeXN0ZW0nLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRwYXRoOiB0aGlzLl9leHRyYWN0U2FuZGJveFBhdGgobWVzc2FnZSksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9leHRyYWN0U2FuZGJveFBhdGgobGluZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBicmFja2V0ZWRQYXRoID0gbGluZS5tYXRjaCgvXFxbKFxcL1teXFxdXFxyXFxuXSspXFxdLyk7XG5cdFx0aWYgKGJyYWNrZXRlZFBhdGg/LlsxXSkge1xuXHRcdFx0cmV0dXJuIGJyYWNrZXRlZFBhdGhbMV0udHJpbSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1b3RlZFBhdGggPSBsaW5lLm1hdGNoKC9bXCInYF0oXFwvW15cIidgXSspW1wiJ2BdLyk7XG5cdFx0aWYgKHF1b3RlZFBhdGg/LlsxXSkge1xuXHRcdFx0cmV0dXJuIHF1b3RlZFBhdGhbMV07XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJhaWxpbmdQYXRoID0gbGluZS5tYXRjaCgvKFxcL1tcXHcuXFwtfi8gXSspJC8pO1xuXHRcdHJldHVybiB0cmFpbGluZ1BhdGg/LlsxXT8udHJpbSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdFNhbmRib3hIb3N0KHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hdGNoID0gdmFsdWUubWF0Y2goL05vIG1hdGNoaW5nIGNvbmZpZyBydWxlLCBkZW55aW5nOlxccysoPzxob3N0PlteOlxcc10rKTpcXGQrXFwuPyQvaSk7XG5cdFx0cmV0dXJuIG1hdGNoPy5ncm91cHM/Lmhvc3Q7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBNkIsbUJBQW1CLG9CQUFvQjtBQUN6RixTQUFTLFNBQXNCLHVCQUF1QjtBQUN0RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFrQixLQUFLLGdCQUFnQjtBQUV2QyxTQUFTLCtCQUErQjtBQUV4QyxTQUFzRywwQkFBZ0U7QUFFL0osSUFBTSxzQkFBTixjQUFrQyxXQUEyQztBQUFBLEVBVW5GLFlBQ2tCLGFBQ0QsWUFDQyxXQUNELGtCQUNDLFNBQ0EseUJBQ0EsY0FDdUIsdUJBQ3ZDO0FBQ0QsVUFBTTtBQVRXO0FBQ0Q7QUFDQztBQUNEO0FBQ0M7QUFDQTtBQUNBO0FBQ3VCO0FBakJ6QyxTQUFpQixVQUFVLEtBQUssVUFBVSxJQUFJLGtCQUFvRCxDQUFDO0FBQ25HLFNBQWlCLFNBQVMsZ0JBQW9DLGtCQUFrQixFQUFFLE9BQU8sbUJBQW1CLEtBQUssUUFBUSxDQUFDO0FBQzFILFNBQWlCLGtCQUFrQixnQkFBcUQsMkJBQTJCLE1BQVM7QUFD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
