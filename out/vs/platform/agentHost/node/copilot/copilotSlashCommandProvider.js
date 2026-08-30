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
import { ILogService } from "../../../log/common/log.js";
import { raceTimeout } from "../../../../base/common/async.js";
let CopilotSlashCommandProvider = class {
  constructor(listCommands, _logService) {
    this.listCommands = listCommands;
    this._logService = _logService;
  }
  async getSlashCommands(options) {
    try {
      const maxWaitMs = options?.maxWaitMs;
      const catalog = await this._getRuntimeSlashCommandCatalog(maxWaitMs === void 0 ? void 0 : Math.max(0, maxWaitMs));
      return catalog.commands;
    } catch (err) {
      this._logService.warn(`[Copilot] rpc.commands.list failed`, err);
      return [];
    }
  }
  async resolveSlashCommand(command, maxWaitMs = void 0) {
    const key = this._normalizeSlashCommandKey(command);
    if (!key) {
      return void 0;
    }
    const catalog = await this._getRuntimeSlashCommandCatalog(maxWaitMs);
    return catalog.byName.get(key) ?? catalog.byAlias.get(key);
  }
  clearCache() {
    if (this._runtimeSlashCommandCache) {
      this._runtimeSlashCommandCache = void 0;
    }
  }
  async _getRuntimeSlashCommandCatalog(maxWaitMs = void 0) {
    const cache = this._runtimeSlashCommandCache ??= {};
    if (cache.value) {
      return cache.value;
    }
    const inFlight = this._refreshRuntimeSlashCommandCatalog(cache);
    if (maxWaitMs === void 0) {
      return inFlight;
    }
    const settled = await raceTimeout(inFlight, maxWaitMs);
    if (settled) {
      return settled;
    }
    if (cache.value) {
      return cache.value;
    }
    return {
      commands: [],
      byName: /* @__PURE__ */ new Map(),
      byAlias: /* @__PURE__ */ new Map()
    };
  }
  async _refreshRuntimeSlashCommandCatalog(cache) {
    if (cache.inFlight) {
      return cache.inFlight;
    }
    const inFlight = this.listCommands().then((result) => this._toRuntimeSlashCommandCatalog(result));
    cache.inFlight = inFlight;
    inFlight.then((catalog) => {
      if (this._runtimeSlashCommandCache === cache) {
        cache.value = catalog;
        cache.inFlight = void 0;
      }
    }, () => {
      if (this._runtimeSlashCommandCache === cache) {
        cache.inFlight = void 0;
        if (!cache.value) {
          this._runtimeSlashCommandCache = void 0;
        }
      }
    });
    return inFlight;
  }
  _toRuntimeSlashCommandCatalog(commands) {
    const byName = /* @__PURE__ */ new Map();
    const byAlias = /* @__PURE__ */ new Map();
    const deduped = [];
    for (const command of commands) {
      const nameKey = this._normalizeSlashCommandKey(command.name);
      if (!nameKey) {
        continue;
      }
      let canonical = byName.get(nameKey);
      if (!canonical) {
        canonical = command;
        byName.set(nameKey, canonical);
        deduped.push(canonical);
      }
      for (const alias of command.aliases ?? []) {
        const aliasKey = this._normalizeSlashCommandKey(alias);
        if (!aliasKey || byAlias.has(aliasKey)) {
          continue;
        }
        byAlias.set(aliasKey, canonical);
      }
    }
    return { commands: deduped, byName, byAlias };
  }
  _normalizeSlashCommandKey(command) {
    const trimmed = command.trim();
    if (!trimmed) {
      return void 0;
    }
    const slashStripped = trimmed.charCodeAt(0) === 47 ? trimmed.slice(1) : trimmed;
    return slashStripped.toLowerCase();
  }
};
CopilotSlashCommandProvider = __decorateClass([
  __decorateParam(1, ILogService)
], CopilotSlashCommandProvider);
export {
  CopilotSlashCommandProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxjb3BpbG90U2xhc2hDb21tYW5kUHJvdmlkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENvcGlsb3RDbGllbnQgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbnR5cGUgUnVudGltZVNsYXNoQ29tbWFuZENhdGFsb2cgPSB7XG5cdHJlYWRvbmx5IGNvbW1hbmRzOiByZWFkb25seSBSdW50aW1lU2xhc2hDb21tYW5kSW5mb1tdO1xuXHRyZWFkb25seSBieU5hbWU6IFJlYWRvbmx5TWFwPHN0cmluZywgUnVudGltZVNsYXNoQ29tbWFuZEluZm8+O1xuXHRyZWFkb25seSBieUFsaWFzOiBSZWFkb25seU1hcDxzdHJpbmcsIFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvPjtcbn07XG5cbnR5cGUgUnVudGltZVNsYXNoQ29tbWFuZENhY2hlID0ge1xuXHR2YWx1ZT86IFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nO1xuXHRpbkZsaWdodD86IFByb21pc2U8UnVudGltZVNsYXNoQ29tbWFuZENhdGFsb2c+O1xufTtcblxudHlwZSBSdW50aW1lU2xhc2hDb21tYW5kSW5mbyA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxDb3BpbG90Q2xpZW50WydycGMnXVsnY29tbWFuZHMnXVsnbGlzdCddPj5bJ2NvbW1hbmRzJ11bbnVtYmVyXTtcblxuZXhwb3J0IGNsYXNzIENvcGlsb3RTbGFzaENvbW1hbmRQcm92aWRlciB7XG5cdHByaXZhdGUgX3J1bnRpbWVTbGFzaENvbW1hbmRDYWNoZTogUnVudGltZVNsYXNoQ29tbWFuZENhY2hlIHwgdW5kZWZpbmVkO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RDb21tYW5kczogKCkgPT4gUHJvbWlzZTxSdW50aW1lU2xhc2hDb21tYW5kSW5mb1tdPixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgZ2V0U2xhc2hDb21tYW5kcyhvcHRpb25zPzogeyByZWFkb25seSBtYXhXYWl0TXM/OiBudW1iZXIgfSk6IFByb21pc2U8cmVhZG9ubHkgUnVudGltZVNsYXNoQ29tbWFuZEluZm9bXT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtYXhXYWl0TXMgPSBvcHRpb25zPy5tYXhXYWl0TXM7XG5cdFx0XHRjb25zdCBjYXRhbG9nID0gYXdhaXQgdGhpcy5fZ2V0UnVudGltZVNsYXNoQ29tbWFuZENhdGFsb2cobWF4V2FpdE1zID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBNYXRoLm1heCgwLCBtYXhXYWl0TXMpKTtcblx0XHRcdHJldHVybiBjYXRhbG9nLmNvbW1hbmRzO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdF0gcnBjLmNvbW1hbmRzLmxpc3QgZmFpbGVkYCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzb2x2ZVNsYXNoQ29tbWFuZChjb21tYW5kOiBzdHJpbmcsIG1heFdhaXRNczogbnVtYmVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogUHJvbWlzZTxSdW50aW1lU2xhc2hDb21tYW5kSW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX25vcm1hbGl6ZVNsYXNoQ29tbWFuZEtleShjb21tYW5kKTtcblx0XHRpZiAoIWtleSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY2F0YWxvZyA9IGF3YWl0IHRoaXMuX2dldFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nKG1heFdhaXRNcyk7XG5cdFx0cmV0dXJuIGNhdGFsb2cuYnlOYW1lLmdldChrZXkpID8/IGNhdGFsb2cuYnlBbGlhcy5nZXQoa2V5KTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhckNhY2hlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ydW50aW1lU2xhc2hDb21tYW5kQ2FjaGUpIHtcblx0XHRcdC8vIEtlZXAgaW4tZmxpZ2h0IHByb21pc2VzIGlzb2xhdGVkIGZyb20gZnJlc2ggbG9va3VwcyBhZnRlciBpbnZhbGlkYXRpb24uXG5cdFx0XHR0aGlzLl9ydW50aW1lU2xhc2hDb21tYW5kQ2FjaGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0UnVudGltZVNsYXNoQ29tbWFuZENhdGFsb2cobWF4V2FpdE1zOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiBQcm9taXNlPFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nPiB7XG5cdFx0Y29uc3QgY2FjaGUgPSB0aGlzLl9ydW50aW1lU2xhc2hDb21tYW5kQ2FjaGUgPz89IHt9O1xuXHRcdGlmIChjYWNoZS52YWx1ZSkge1xuXHRcdFx0cmV0dXJuIGNhY2hlLnZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluRmxpZ2h0ID0gdGhpcy5fcmVmcmVzaFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nKGNhY2hlKTtcblx0XHRpZiAobWF4V2FpdE1zID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBpbkZsaWdodDtcblx0XHR9XG5cdFx0Y29uc3Qgc2V0dGxlZCA9IGF3YWl0IHJhY2VUaW1lb3V0KGluRmxpZ2h0LCBtYXhXYWl0TXMpO1xuXHRcdGlmIChzZXR0bGVkKSB7XG5cdFx0XHRyZXR1cm4gc2V0dGxlZDtcblx0XHR9XG5cdFx0aWYgKGNhY2hlLnZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gY2FjaGUudmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRjb21tYW5kczogW10sXG5cdFx0XHRieU5hbWU6IG5ldyBNYXAoKSxcblx0XHRcdGJ5QWxpYXM6IG5ldyBNYXAoKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nKGNhY2hlOiBSdW50aW1lU2xhc2hDb21tYW5kQ2FjaGUpOiBQcm9taXNlPFJ1bnRpbWVTbGFzaENvbW1hbmRDYXRhbG9nPiB7XG5cdFx0aWYgKGNhY2hlLmluRmxpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gY2FjaGUuaW5GbGlnaHQ7XG5cdFx0fVxuXHRcdGNvbnN0IGluRmxpZ2h0ID0gdGhpcy5saXN0Q29tbWFuZHMoKVxuXHRcdFx0LnRoZW4ocmVzdWx0ID0+IHRoaXMuX3RvUnVudGltZVNsYXNoQ29tbWFuZENhdGFsb2cocmVzdWx0KSk7XG5cdFx0Y2FjaGUuaW5GbGlnaHQgPSBpbkZsaWdodDtcblx0XHRpbkZsaWdodC50aGVuKGNhdGFsb2cgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3J1bnRpbWVTbGFzaENvbW1hbmRDYWNoZSA9PT0gY2FjaGUpIHtcblx0XHRcdFx0Y2FjaGUudmFsdWUgPSBjYXRhbG9nO1xuXHRcdFx0XHRjYWNoZS5pbkZsaWdodCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LCAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fcnVudGltZVNsYXNoQ29tbWFuZENhY2hlID09PSBjYWNoZSkge1xuXHRcdFx0XHRjYWNoZS5pbkZsaWdodCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFjYWNoZS52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3J1bnRpbWVTbGFzaENvbW1hbmRDYWNoZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBpbkZsaWdodDtcblx0fVxuXG5cdHByaXZhdGUgX3RvUnVudGltZVNsYXNoQ29tbWFuZENhdGFsb2coY29tbWFuZHM6IHJlYWRvbmx5IFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvW10pOiBSdW50aW1lU2xhc2hDb21tYW5kQ2F0YWxvZyB7XG5cdFx0Y29uc3QgYnlOYW1lID0gbmV3IE1hcDxzdHJpbmcsIFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvPigpO1xuXHRcdGNvbnN0IGJ5QWxpYXMgPSBuZXcgTWFwPHN0cmluZywgUnVudGltZVNsYXNoQ29tbWFuZEluZm8+KCk7XG5cdFx0Y29uc3QgZGVkdXBlZDogUnVudGltZVNsYXNoQ29tbWFuZEluZm9bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kcykge1xuXHRcdFx0Y29uc3QgbmFtZUtleSA9IHRoaXMuX25vcm1hbGl6ZVNsYXNoQ29tbWFuZEtleShjb21tYW5kLm5hbWUpO1xuXHRcdFx0aWYgKCFuYW1lS2V5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGNhbm9uaWNhbCA9IGJ5TmFtZS5nZXQobmFtZUtleSk7XG5cdFx0XHRpZiAoIWNhbm9uaWNhbCkge1xuXHRcdFx0XHRjYW5vbmljYWwgPSBjb21tYW5kO1xuXHRcdFx0XHRieU5hbWUuc2V0KG5hbWVLZXksIGNhbm9uaWNhbCk7XG5cdFx0XHRcdGRlZHVwZWQucHVzaChjYW5vbmljYWwpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBhbGlhcyBvZiBjb21tYW5kLmFsaWFzZXMgPz8gW10pIHtcblx0XHRcdFx0Y29uc3QgYWxpYXNLZXkgPSB0aGlzLl9ub3JtYWxpemVTbGFzaENvbW1hbmRLZXkoYWxpYXMpO1xuXHRcdFx0XHRpZiAoIWFsaWFzS2V5IHx8IGJ5QWxpYXMuaGFzKGFsaWFzS2V5KSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJ5QWxpYXMuc2V0KGFsaWFzS2V5LCBjYW5vbmljYWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBjb21tYW5kczogZGVkdXBlZCwgYnlOYW1lLCBieUFsaWFzIH07XG5cdH1cblxuXHRwcml2YXRlIF9ub3JtYWxpemVTbGFzaENvbW1hbmRLZXkoY29tbWFuZDogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0cmltbWVkID0gY29tbWFuZC50cmltKCk7XG5cdFx0aWYgKCF0cmltbWVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzbGFzaFN0cmlwcGVkID0gdHJpbW1lZC5jaGFyQ29kZUF0KDApID09PSAweDJmIC8qIC8gKi8gPyB0cmltbWVkLnNsaWNlKDEpIDogdHJpbW1lZDtcblx0XHRyZXR1cm4gc2xhc2hTdHJpcHBlZC50b0xvd2VyQ2FzZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUJBQW1CO0FBZXJCLElBQU0sOEJBQU4sTUFBa0M7QUFBQSxFQUV4QyxZQUNrQixjQUNhLGFBQzdCO0FBRmdCO0FBQ2E7QUFBQSxFQUMzQjtBQUFBLEVBRUosTUFBTSxpQkFBaUIsU0FBd0Y7QUFD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
