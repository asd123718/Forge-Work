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
import { validateConstraint } from "../../../base/common/types.js";
import * as extHostTypes from "./extHostTypes.js";
import * as extHostTypeConverter from "./extHostTypeConverters.js";
import { cloneAndChange } from "../../../base/common/objects.js";
import { MainContext } from "./extHost.protocol.js";
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { revive } from "../../../base/common/marshalling.js";
import { Range } from "../../../editor/common/core/range.js";
import { Position } from "../../../editor/common/core/position.js";
import { URI } from "../../../base/common/uri.js";
import { toDisposable } from "../../../base/common/lifecycle.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { TestItemImpl } from "./extHostTestItem.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { TelemetryTrustedValue } from "../../../platform/telemetry/common/telemetryUtils.js";
import { IExtHostTelemetry } from "./extHostTelemetry.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { isCancellationError } from "../../../base/common/errors.js";
let ExtHostCommands = class {
  constructor(extHostRpc, logService, extHostTelemetry) {
    this._commands = /* @__PURE__ */ new Map();
    this._apiCommands = /* @__PURE__ */ new Map();
    this.#proxy = extHostRpc.getProxy(MainContext.MainThreadCommands);
    this._logService = logService;
    this.#extHostTelemetry = extHostTelemetry;
    this.#telemetry = extHostRpc.getProxy(MainContext.MainThreadTelemetry);
    this.converter = new CommandsConverter(
      this,
      (id) => {
        const candidate = this._apiCommands.get(id);
        return candidate?.result === ApiCommandResult.Void ? candidate : void 0;
      },
      logService
    );
    this._argumentProcessors = [
      {
        processArgument(a) {
          return revive(a);
        }
      },
      {
        processArgument(arg) {
          return cloneAndChange(arg, function(obj) {
            if (Range.isIRange(obj)) {
              return extHostTypeConverter.Range.to(obj);
            }
            if (Position.isIPosition(obj)) {
              return extHostTypeConverter.Position.to(obj);
            }
            if (Range.isIRange(obj.range) && URI.isUri(obj.uri)) {
              return extHostTypeConverter.location.to(obj);
            }
            if (obj instanceof VSBuffer) {
              return obj.buffer.buffer.slice(obj.buffer.byteOffset, obj.buffer.byteOffset + obj.buffer.byteLength);
            }
            if (!Array.isArray(obj)) {
              return obj;
            }
          });
        }
      }
    ];
  }
  #proxy;
  #telemetry;
  #extHostTelemetry;
  registerArgumentProcessor(processor) {
    this._argumentProcessors.push(processor);
  }
  registerApiCommand(apiCommand) {
    const registration = this.registerCommand(false, apiCommand.id, async (...apiArgs) => {
      const internalArgs = apiCommand.args.map((arg, i) => {
        if (!arg.validate(apiArgs[i])) {
          throw new Error(`Invalid argument '${arg.name}' when running '${apiCommand.id}', received: ${typeof apiArgs[i] === "object" ? JSON.stringify(apiArgs[i], null, "	") : apiArgs[i]} `);
        }
        return arg.convert(apiArgs[i]);
      });
      const internalResult = await this.executeCommand(apiCommand.internalId, ...internalArgs);
      return apiCommand.result.convert(internalResult, apiArgs, this.converter);
    }, void 0, {
      description: apiCommand.description,
      args: apiCommand.args,
      returns: apiCommand.result.description
    });
    this._apiCommands.set(apiCommand.id, apiCommand);
    return new extHostTypes.Disposable(() => {
      registration.dispose();
      this._apiCommands.delete(apiCommand.id);
    });
  }
  registerCommand(global, id, callback, thisArg, metadata, extension) {
    this._logService.trace("ExtHostCommands#registerCommand", id);
    if (!id.trim().length) {
      throw new Error("invalid id");
    }
    if (this._commands.has(id)) {
      throw new Error(`command '${id}' already exists`);
    }
    this._commands.set(id, { callback, thisArg, metadata, extension });
    if (global) {
      this.#proxy.$registerCommand(id);
    }
    return new extHostTypes.Disposable(() => {
      if (this._commands.delete(id)) {
        if (global) {
          this.#proxy.$unregisterCommand(id);
        }
      }
    });
  }
  executeCommand(id, ...args) {
    this._logService.trace("ExtHostCommands#executeCommand", id);
    return this._doExecuteCommand(id, args, true);
  }
  async _doExecuteCommand(id, args, retry) {
    if (this._commands.has(id)) {
      this.#proxy.$fireCommandActivationEvent(id);
      return this._executeContributedCommand(id, args, false);
    } else {
      let hasBuffers = false;
      const toArgs = cloneAndChange(args, function(value) {
        if (value instanceof extHostTypes.Position) {
          return extHostTypeConverter.Position.from(value);
        } else if (value instanceof extHostTypes.Range) {
          return extHostTypeConverter.Range.from(value);
        } else if (value instanceof extHostTypes.Location) {
          return extHostTypeConverter.location.from(value);
        } else if (extHostTypes.NotebookRange.isNotebookRange(value)) {
          return extHostTypeConverter.NotebookRange.from(value);
        } else if (value instanceof ArrayBuffer) {
          hasBuffers = true;
          return VSBuffer.wrap(new Uint8Array(value));
        } else if (value instanceof Uint8Array) {
          hasBuffers = true;
          return VSBuffer.wrap(value);
        } else if (value instanceof VSBuffer) {
          hasBuffers = true;
          return value;
        }
        if (!Array.isArray(value)) {
          return value;
        }
      });
      try {
        const result = await this.#proxy.$executeCommand(id, hasBuffers ? new SerializableObjectWithBuffers(toArgs) : toArgs, retry);
        return revive(result);
      } catch (e) {
        if (e instanceof Error && e.message === "$executeCommand:retry") {
          return this._doExecuteCommand(id, args, false);
        } else {
          throw e;
        }
      }
    }
  }
  async _executeContributedCommand(id, args, annotateError) {
    const command = this._commands.get(id);
    if (!command) {
      throw new Error("Unknown command");
    }
    const { callback, thisArg, metadata } = command;
    if (metadata?.args) {
      for (let i = 0; i < metadata.args.length; i++) {
        try {
          validateConstraint(args[i], metadata.args[i].constraint);
        } catch (err) {
          throw new Error(`Running the contributed command: '${id}' failed. Illegal argument '${metadata.args[i].name}' - ${metadata.args[i].description}`);
        }
      }
    }
    const stopWatch = StopWatch.create();
    try {
      return await callback.apply(thisArg, args);
    } catch (err) {
      if (id === this.converter.delegatingCommandId) {
        const actual = this.converter.getActualCommand(...args);
        if (actual) {
          id = actual.command;
        }
      }
      if (!isCancellationError(err)) {
        this._logService.error(err, id, command.extension?.identifier);
      }
      if (!annotateError) {
        throw err;
      }
      if (command.extension?.identifier) {
        const reported = this.#extHostTelemetry.onExtensionError(command.extension.identifier, err);
        this._logService.trace("forwarded error to extension?", reported, command.extension?.identifier);
      }
      throw new class CommandError extends Error {
        constructor() {
          super(toErrorMessage(err));
          this.id = id;
          this.source = command.extension?.displayName ?? command.extension?.name;
        }
      }();
    } finally {
      this._reportTelemetry(command, id, stopWatch.elapsed());
    }
  }
  _reportTelemetry(command, id, duration) {
    if (!command.extension) {
      return;
    }
    if (id.startsWith("code.copilot.logStructured")) {
      return;
    }
    this.#telemetry.$publicLog2("Extension:ActionExecuted", {
      extensionId: command.extension.identifier.value,
      id: new TelemetryTrustedValue(id),
      duration
    });
  }
  $executeContributedCommand(id, ...args) {
    this._logService.trace("ExtHostCommands#$executeContributedCommand", id);
    const cmdHandler = this._commands.get(id);
    if (!cmdHandler) {
      return Promise.reject(new Error(`Contributed command '${id}' does not exist.`));
    } else {
      args = args.map((arg) => this._argumentProcessors.reduce((r, p) => p.processArgument(r, cmdHandler.extension), arg));
      return this._executeContributedCommand(id, args, true);
    }
  }
  getCommands(filterUnderscoreCommands = false) {
    this._logService.trace("ExtHostCommands#getCommands", filterUnderscoreCommands);
    return this.#proxy.$getCommands().then((result) => {
      if (filterUnderscoreCommands) {
        result = result.filter((command) => command[0] !== "_");
      }
      return result;
    });
  }
  $getContributedCommandMetadata() {
    const result = /* @__PURE__ */ Object.create(null);
    for (const [id, command] of this._commands) {
      const { metadata } = command;
      if (metadata) {
        result[id] = metadata;
      }
    }
    return Promise.resolve(result);
  }
};
ExtHostCommands = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostTelemetry)
], ExtHostCommands);
const IExtHostCommands = createDecorator("IExtHostCommands");
class CommandsConverter {
  // --- conversion between internal and api commands
  constructor(_commands, _lookupApiCommand, _logService) {
    this._commands = _commands;
    this._lookupApiCommand = _lookupApiCommand;
    this._logService = _logService;
    this.delegatingCommandId = `__vsc${generateUuid()}`;
    this._cache = /* @__PURE__ */ new Map();
    this._cachIdPool = 0;
    this._commands.registerCommand(true, this.delegatingCommandId, this._executeConvertedCommand, this);
  }
  toInternal(command, disposables) {
    if (!command) {
      return void 0;
    }
    const result = {
      $ident: void 0,
      id: command.command,
      title: command.title,
      tooltip: command.tooltip
    };
    if (!command.command) {
      return result;
    }
    const apiCommand = this._lookupApiCommand(command.command);
    if (apiCommand) {
      result.id = apiCommand.internalId;
      result.arguments = apiCommand.args.map((arg, i) => arg.convert(command.arguments && command.arguments[i]));
    } else if (isNonEmptyArray(command.arguments)) {
      const id = `${command.command} /${++this._cachIdPool}`;
      this._cache.set(id, command);
      disposables.add(toDisposable(() => {
        this._cache.delete(id);
        this._logService.trace("CommandsConverter#DISPOSE", id);
      }));
      result.$ident = id;
      result.id = this.delegatingCommandId;
      result.arguments = [id];
      this._logService.trace("CommandsConverter#CREATE", command.command, id);
    }
    return result;
  }
  fromInternal(command) {
    if (typeof command.$ident === "string") {
      return this._cache.get(command.$ident);
    } else {
      return {
        command: command.id,
        title: command.title,
        arguments: command.arguments
      };
    }
  }
  getActualCommand(...args) {
    return this._cache.get(args[0]);
  }
  _executeConvertedCommand(...args) {
    const actualCmd = this.getActualCommand(...args);
    this._logService.trace("CommandsConverter#EXECUTE", args[0], actualCmd ? actualCmd.command : "MISSING");
    if (!actualCmd) {
      return Promise.reject(`Actual command not found, wanted to execute ${args[0]}`);
    }
    return this._commands.executeCommand(actualCmd.command, ...actualCmd.arguments || []);
  }
}
const _ApiCommandArgument = class _ApiCommandArgument {
  constructor(name, description, validate, convert) {
    this.name = name;
    this.description = description;
    this.validate = validate;
    this.convert = convert;
  }
  static Arr(element) {
    return new _ApiCommandArgument(
      `${element.name}_array`,
      `Array of ${element.name}, ${element.description}`,
      (v) => Array.isArray(v) && v.every((e) => element.validate(e)),
      (v) => v.map((e) => element.convert(e))
    );
  }
  optional() {
    return new _ApiCommandArgument(
      this.name,
      `(optional) ${this.description}`,
      (value) => value === void 0 || value === null || this.validate(value),
      (value) => value === void 0 ? void 0 : value === null ? null : this.convert(value)
    );
  }
  with(name, description) {
    return new _ApiCommandArgument(name ?? this.name, description ?? this.description, this.validate, this.convert);
  }
};
_ApiCommandArgument.Uri = new _ApiCommandArgument("uri", "Uri of a text document", (v) => URI.isUri(v), (v) => v);
_ApiCommandArgument.Position = new _ApiCommandArgument("position", "A position in a text document", (v) => extHostTypes.Position.isPosition(v), extHostTypeConverter.Position.from);
_ApiCommandArgument.Range = new _ApiCommandArgument("range", "A range in a text document", (v) => extHostTypes.Range.isRange(v), extHostTypeConverter.Range.from);
_ApiCommandArgument.Selection = new _ApiCommandArgument("selection", "A selection in a text document", (v) => extHostTypes.Selection.isSelection(v), extHostTypeConverter.Selection.from);
_ApiCommandArgument.Number = new _ApiCommandArgument("number", "", (v) => typeof v === "number", (v) => v);
_ApiCommandArgument.String = new _ApiCommandArgument("string", "", (v) => typeof v === "string", (v) => v);
_ApiCommandArgument.CallHierarchyItem = new _ApiCommandArgument("item", "A call hierarchy item", (v) => v instanceof extHostTypes.CallHierarchyItem, extHostTypeConverter.CallHierarchyItem.from);
_ApiCommandArgument.TypeHierarchyItem = new _ApiCommandArgument("item", "A type hierarchy item", (v) => v instanceof extHostTypes.TypeHierarchyItem, extHostTypeConverter.TypeHierarchyItem.from);
_ApiCommandArgument.TestItem = new _ApiCommandArgument("testItem", "A VS Code TestItem", (v) => v instanceof TestItemImpl, extHostTypeConverter.TestItem.from);
_ApiCommandArgument.TestProfile = new _ApiCommandArgument("testProfile", "A VS Code test profile", (v) => v instanceof extHostTypes.TestRunProfileBase, extHostTypeConverter.TestRunProfile.from);
let ApiCommandArgument = _ApiCommandArgument;
const _ApiCommandResult = class _ApiCommandResult {
  constructor(description, convert) {
    this.description = description;
    this.convert = convert;
  }
};
_ApiCommandResult.Void = new _ApiCommandResult("no result", (v) => v);
let ApiCommandResult = _ApiCommandResult;
class ApiCommand {
  constructor(id, internalId, description, args, result) {
    this.id = id;
    this.internalId = internalId;
    this.description = description;
    this.args = args;
    this.result = result;
  }
}
export {
  ApiCommand,
  ApiCommandArgument,
  ApiCommandResult,
  CommandsConverter,
  ExtHostCommands,
  IExtHostCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcY29tbW9uXFxleHRIb3N0Q29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB2YWxpZGF0ZUNvbnN0cmFpbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCAqIGFzIGV4dEhvc3RUeXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBleHRIb3N0VHlwZUNvbnZlcnRlciBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBjbG9uZUFuZENoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDb21tYW5kc1NoYXBlLCBFeHRIb3N0Q29tbWFuZHNTaGFwZSwgSUNvbW1hbmREdG8sIElDb21tYW5kTWV0YWRhdGFEdG8sIE1haW5UaHJlYWRUZWxlbWV0cnlTaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBpc05vbkVtcHR5QXJyYXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uLCBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJdGVtSW1wbCB9IGZyb20gJy4vZXh0SG9zdFRlc3RJdGVtLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZWxlbWV0cnkgfSBmcm9tICcuL2V4dEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuaW50ZXJmYWNlIENvbW1hbmRIYW5kbGVyIHtcblx0Y2FsbGJhY2s6IEZ1bmN0aW9uO1xuXHR0aGlzQXJnOiBhbnk7XG5cdG1ldGFkYXRhPzogSUNvbW1hbmRNZXRhZGF0YTtcblx0ZXh0ZW5zaW9uPzogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEFyZ3VtZW50UHJvY2Vzc29yIHtcblx0cHJvY2Vzc0FyZ3VtZW50KGFyZzogYW55LCBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCk6IGFueTtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RDb21tYW5kcyBpbXBsZW1lbnRzIEV4dEhvc3RDb21tYW5kc1NoYXBlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0I3Byb3h5OiBNYWluVGhyZWFkQ29tbWFuZHNTaGFwZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kcyA9IG5ldyBNYXA8c3RyaW5nLCBDb21tYW5kSGFuZGxlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXBpQ29tbWFuZHMgPSBuZXcgTWFwPHN0cmluZywgQXBpQ29tbWFuZD4oKTtcblx0I3RlbGVtZXRyeTogTWFpblRocmVhZFRlbGVtZXRyeVNoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRyZWFkb25seSAjZXh0SG9zdFRlbGVtZXRyeTogSUV4dEhvc3RUZWxlbWV0cnk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FyZ3VtZW50UHJvY2Vzc29yczogQXJndW1lbnRQcm9jZXNzb3JbXTtcblxuXHRyZWFkb25seSBjb252ZXJ0ZXI6IENvbW1hbmRzQ29udmVydGVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dEhvc3RUZWxlbWV0cnkgZXh0SG9zdFRlbGVtZXRyeTogSUV4dEhvc3RUZWxlbWV0cnlcblx0KSB7XG5cdFx0dGhpcy4jcHJveHkgPSBleHRIb3N0UnBjLmdldFByb3h5KE1haW5Db250ZXh0Lk1haW5UaHJlYWRDb21tYW5kcyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZSA9IGxvZ1NlcnZpY2U7XG5cdFx0dGhpcy4jZXh0SG9zdFRlbGVtZXRyeSA9IGV4dEhvc3RUZWxlbWV0cnk7XG5cdFx0dGhpcy4jdGVsZW1ldHJ5ID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkVGVsZW1ldHJ5KTtcblx0XHR0aGlzLmNvbnZlcnRlciA9IG5ldyBDb21tYW5kc0NvbnZlcnRlcihcblx0XHRcdHRoaXMsXG5cdFx0XHRpZCA9PiB7XG5cdFx0XHRcdC8vIEFQSSBjb21tYW5kcyB0aGF0IGhhdmUgbm8gcmV0dXJuIHR5cGUgKHZvaWQpIGNhbiBiZVxuXHRcdFx0XHQvLyBjb252ZXJ0ZWQgdG8gdGhlaXIgaW50ZXJuYWwgY29tbWFuZCBhbmQgZG9uJ3QgbmVlZFxuXHRcdFx0XHQvLyBhbnkgaW5kaXJlY3Rpb24gY29tbWFuZHNcblx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gdGhpcy5fYXBpQ29tbWFuZHMuZ2V0KGlkKTtcblx0XHRcdFx0cmV0dXJuIGNhbmRpZGF0ZT8ucmVzdWx0ID09PSBBcGlDb21tYW5kUmVzdWx0LlZvaWRcblx0XHRcdFx0XHQ/IGNhbmRpZGF0ZSA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRsb2dTZXJ2aWNlXG5cdFx0KTtcblx0XHR0aGlzLl9hcmd1bWVudFByb2Nlc3NvcnMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHByb2Nlc3NBcmd1bWVudChhKSB7XG5cdFx0XHRcdFx0Ly8gVVJJLCBSZWdleFxuXHRcdFx0XHRcdHJldHVybiByZXZpdmUoYSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHByb2Nlc3NBcmd1bWVudChhcmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2xvbmVBbmRDaGFuZ2UoYXJnLCBmdW5jdGlvbiAob2JqKSB7XG5cdFx0XHRcdFx0XHQvLyBSZXZlcnNlIG9mIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2Jsb2IvMWYyOGM1ZmM2ODFmNGMwMTIyNjQ2MGI2ZDFjN2U5MWI4YWNiNGE1Yi9zcmMvdnMvd29ya2JlbmNoL2FwaS9ub2RlL2V4dEhvc3RDb21tYW5kcy50cyNMMTEyLUwxMjdcblx0XHRcdFx0XHRcdGlmIChSYW5nZS5pc0lSYW5nZShvYmopKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBleHRIb3N0VHlwZUNvbnZlcnRlci5SYW5nZS50byhvYmopO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKFBvc2l0aW9uLmlzSVBvc2l0aW9uKG9iaikpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUeXBlQ29udmVydGVyLlBvc2l0aW9uLnRvKG9iaik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoUmFuZ2UuaXNJUmFuZ2UoKG9iaiBhcyBsYW5ndWFnZXMuTG9jYXRpb24pLnJhbmdlKSAmJiBVUkkuaXNVcmkoKG9iaiBhcyBsYW5ndWFnZXMuTG9jYXRpb24pLnVyaSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGV4dEhvc3RUeXBlQ29udmVydGVyLmxvY2F0aW9uLnRvKG9iaik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAob2JqIGluc3RhbmNlb2YgVlNCdWZmZXIpIHtcblx0XHRcdFx0XHRcdFx0Ly8gQ3JlYXRlIGEgY29weSBvZiB0aGUgYnVmZmVyIHNpbmNlIHRoZSBvcmlnaW5hbCBidWZmZXIgaXMgb3duZWQgYnkgdGhlIGV4dGVuc2lvbiBob3N0IGFuZCBtaWdodCBiZSByZXVzZWQgZm9yIG90aGVyIGNvbW1hbmRzXG5cdFx0XHRcdFx0XHRcdHJldHVybiBvYmouYnVmZmVyLmJ1ZmZlci5zbGljZShvYmouYnVmZmVyLmJ5dGVPZmZzZXQsIG9iai5idWZmZXIuYnl0ZU9mZnNldCArIG9iai5idWZmZXIuYnl0ZUxlbmd0aCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkob2JqKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gb2JqO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XTtcblx0fVxuXG5cdHJlZ2lzdGVyQXJndW1lbnRQcm9jZXNzb3IocHJvY2Vzc29yOiBBcmd1bWVudFByb2Nlc3Nvcik6IHZvaWQge1xuXHRcdHRoaXMuX2FyZ3VtZW50UHJvY2Vzc29ycy5wdXNoKHByb2Nlc3Nvcik7XG5cdH1cblxuXHRyZWdpc3RlckFwaUNvbW1hbmQoYXBpQ29tbWFuZDogQXBpQ29tbWFuZCk6IGV4dEhvc3RUeXBlcy5EaXNwb3NhYmxlIHtcblxuXG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gdGhpcy5yZWdpc3RlckNvbW1hbmQoZmFsc2UsIGFwaUNvbW1hbmQuaWQsIGFzeW5jICguLi5hcGlBcmdzKSA9PiB7XG5cblx0XHRcdGNvbnN0IGludGVybmFsQXJncyA9IGFwaUNvbW1hbmQuYXJncy5tYXAoKGFyZywgaSkgPT4ge1xuXHRcdFx0XHRpZiAoIWFyZy52YWxpZGF0ZShhcGlBcmdzW2ldKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBhcmd1bWVudCAnJHthcmcubmFtZX0nIHdoZW4gcnVubmluZyAnJHthcGlDb21tYW5kLmlkfScsIHJlY2VpdmVkOiAke3R5cGVvZiBhcGlBcmdzW2ldID09PSAnb2JqZWN0JyA/IEpTT04uc3RyaW5naWZ5KGFwaUFyZ3NbaV0sIG51bGwsICdcXHQnKSA6IGFwaUFyZ3NbaV19IGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhcmcuY29udmVydChhcGlBcmdzW2ldKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnRlcm5hbFJlc3VsdCA9IGF3YWl0IHRoaXMuZXhlY3V0ZUNvbW1hbmQoYXBpQ29tbWFuZC5pbnRlcm5hbElkLCAuLi5pbnRlcm5hbEFyZ3MpO1xuXHRcdFx0cmV0dXJuIGFwaUNvbW1hbmQucmVzdWx0LmNvbnZlcnQoaW50ZXJuYWxSZXN1bHQsIGFwaUFyZ3MsIHRoaXMuY29udmVydGVyKTtcblx0XHR9LCB1bmRlZmluZWQsIHtcblx0XHRcdGRlc2NyaXB0aW9uOiBhcGlDb21tYW5kLmRlc2NyaXB0aW9uLFxuXHRcdFx0YXJnczogYXBpQ29tbWFuZC5hcmdzLFxuXHRcdFx0cmV0dXJuczogYXBpQ29tbWFuZC5yZXN1bHQuZGVzY3JpcHRpb25cblx0XHR9KTtcblxuXHRcdHRoaXMuX2FwaUNvbW1hbmRzLnNldChhcGlDb21tYW5kLmlkLCBhcGlDb21tYW5kKTtcblxuXHRcdHJldHVybiBuZXcgZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2FwaUNvbW1hbmRzLmRlbGV0ZShhcGlDb21tYW5kLmlkKTtcblx0XHR9KTtcblx0fVxuXG5cdHJlZ2lzdGVyQ29tbWFuZChnbG9iYWw6IGJvb2xlYW4sIGlkOiBzdHJpbmcsIGNhbGxiYWNrOiA8VD4oLi4uYXJnczogYW55W10pID0+IFQgfCBUaGVuYWJsZTxUPiwgdGhpc0FyZz86IGFueSwgbWV0YWRhdGE/OiBJQ29tbWFuZE1ldGFkYXRhLCBleHRlbnNpb24/OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBleHRIb3N0VHlwZXMuRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnRXh0SG9zdENvbW1hbmRzI3JlZ2lzdGVyQ29tbWFuZCcsIGlkKTtcblxuXHRcdGlmICghaWQudHJpbSgpLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIGlkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2NvbW1hbmRzLmhhcyhpZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgY29tbWFuZCAnJHtpZH0nIGFscmVhZHkgZXhpc3RzYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29tbWFuZHMuc2V0KGlkLCB7IGNhbGxiYWNrLCB0aGlzQXJnLCBtZXRhZGF0YSwgZXh0ZW5zaW9uIH0pO1xuXHRcdGlmIChnbG9iYWwpIHtcblx0XHRcdHRoaXMuI3Byb3h5LiRyZWdpc3RlckNvbW1hbmQoaWQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgZXh0SG9zdFR5cGVzLkRpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbW1hbmRzLmRlbGV0ZShpZCkpIHtcblx0XHRcdFx0aWYgKGdsb2JhbCkge1xuXHRcdFx0XHRcdHRoaXMuI3Byb3h5LiR1bnJlZ2lzdGVyQ29tbWFuZChpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGV4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RDb21tYW5kcyNleGVjdXRlQ29tbWFuZCcsIGlkKTtcblx0XHRyZXR1cm4gdGhpcy5fZG9FeGVjdXRlQ29tbWFuZChpZCwgYXJncywgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb0V4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIGFyZ3M6IHVua25vd25bXSwgcmV0cnk6IGJvb2xlYW4pOiBQcm9taXNlPFQ+IHtcblxuXHRcdGlmICh0aGlzLl9jb21tYW5kcy5oYXMoaWQpKSB7XG5cdFx0XHQvLyAtIFdlIHN0YXkgaW5zaWRlIHRoZSBleHRlbnNpb24gaG9zdCBhbmQgc3VwcG9ydFxuXHRcdFx0Ly8gXHQgdG8gcGFzcyBhbnkga2luZCBvZiBwYXJhbWV0ZXJzIGFyb3VuZC5cblx0XHRcdC8vIC0gV2Ugc3RpbGwgZW1pdCB0aGUgY29ycmVzcG9uZGluZyBhY3RpdmF0aW9uIGV2ZW50XG5cdFx0XHQvLyAgIEJVVCB3ZSBkb24ndCBhd2FpdCB0aGF0IGV2ZW50XG5cdFx0XHR0aGlzLiNwcm94eS4kZmlyZUNvbW1hbmRBY3RpdmF0aW9uRXZlbnQoaWQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVDb250cmlidXRlZENvbW1hbmQ8VD4oaWQsIGFyZ3MsIGZhbHNlKTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhdXRvbWFnaWNhbGx5IGNvbnZlcnQgc29tZSBhcmd1bWVudCB0eXBlc1xuXHRcdFx0bGV0IGhhc0J1ZmZlcnMgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHRvQXJncyA9IGNsb25lQW5kQ2hhbmdlKGFyZ3MsIGZ1bmN0aW9uICh2YWx1ZSkge1xuXHRcdFx0XHRpZiAodmFsdWUgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuUG9zaXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUG9zaXRpb24uZnJvbSh2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuUmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUmFuZ2UuZnJvbSh2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuTG9jYXRpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gZXh0SG9zdFR5cGVDb252ZXJ0ZXIubG9jYXRpb24uZnJvbSh2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZXh0SG9zdFR5cGVzLk5vdGVib29rUmFuZ2UuaXNOb3RlYm9va1JhbmdlKHZhbHVlKSkge1xuXHRcdFx0XHRcdHJldHVybiBleHRIb3N0VHlwZUNvbnZlcnRlci5Ob3RlYm9va1JhbmdlLmZyb20odmFsdWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHtcblx0XHRcdFx0XHRoYXNCdWZmZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4gVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheSh2YWx1ZSkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdFx0XHRcdGhhc0J1ZmZlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci53cmFwKHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIFZTQnVmZmVyKSB7XG5cdFx0XHRcdFx0aGFzQnVmZmVycyA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLiNwcm94eS4kZXhlY3V0ZUNvbW1hbmQoaWQsIGhhc0J1ZmZlcnMgPyBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnModG9BcmdzKSA6IHRvQXJncywgcmV0cnkpO1xuXHRcdFx0XHRyZXR1cm4gcmV2aXZlPGFueT4ocmVzdWx0KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gUmVydW4gdGhlIGNvbW1hbmQgd2hlbiBpdCB3YXNuJ3Qga25vd24sIGhhZCBhcmd1bWVudHMsIGFuZCB3aGVuIHJldHJ5XG5cdFx0XHRcdC8vIGlzIGVuYWJsZWQuIFdlIGRvIHRoaXMgYmVjYXVzZSB0aGUgY29tbWFuZCBtaWdodCBiZSByZWdpc3RlcmVkIGluc2lkZVxuXHRcdFx0XHQvLyB0aGUgZXh0ZW5zaW9uIGhvc3Qgbm93IGFuZCBjYW4gdGhlcmVmb3JlIGFjY2VwdCB0aGUgYXJndW1lbnRzIGFzLWlzLlxuXHRcdFx0XHRpZiAoZSBpbnN0YW5jZW9mIEVycm9yICYmIGUubWVzc2FnZSA9PT0gJyRleGVjdXRlQ29tbWFuZDpyZXRyeScpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fZG9FeGVjdXRlQ29tbWFuZChpZCwgYXJncywgZmFsc2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlQ29udHJpYnV0ZWRDb21tYW5kPFQgPSB1bmtub3duPihpZDogc3RyaW5nLCBhcmdzOiB1bmtub3duW10sIGFubm90YXRlRXJyb3I6IGJvb2xlYW4pOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCBjb21tYW5kID0gdGhpcy5fY29tbWFuZHMuZ2V0KGlkKTtcblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBjb21tYW5kJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHsgY2FsbGJhY2ssIHRoaXNBcmcsIG1ldGFkYXRhIH0gPSBjb21tYW5kO1xuXHRcdGlmIChtZXRhZGF0YT8uYXJncykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtZXRhZGF0YS5hcmdzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0dmFsaWRhdGVDb25zdHJhaW50KGFyZ3NbaV0sIG1ldGFkYXRhLmFyZ3NbaV0uY29uc3RyYWludCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgUnVubmluZyB0aGUgY29udHJpYnV0ZWQgY29tbWFuZDogJyR7aWR9JyBmYWlsZWQuIElsbGVnYWwgYXJndW1lbnQgJyR7bWV0YWRhdGEuYXJnc1tpXS5uYW1lfScgLSAke21ldGFkYXRhLmFyZ3NbaV0uZGVzY3JpcHRpb259YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBjYWxsYmFjay5hcHBseSh0aGlzQXJnLCBhcmdzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoZSBpbmRpcmVjdGlvbi1jb21tYW5kIGZyb20gdGhlIGNvbnZlcnRlciBjYW4gZmFpbCB3aGVuIGludm9raW5nIHRoZSBhY3R1YWxcblx0XHRcdC8vIGNvbW1hbmQgYW5kIGluIHRoYXQgY2FzZSBpdCBpcyBiZXR0ZXIgdG8gYmxhbWUgdGhlIGNvcnJlY3QgY29tbWFuZFxuXHRcdFx0aWYgKGlkID09PSB0aGlzLmNvbnZlcnRlci5kZWxlZ2F0aW5nQ29tbWFuZElkKSB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbCA9IHRoaXMuY29udmVydGVyLmdldEFjdHVhbENvbW1hbmQoLi4uYXJncyk7XG5cdFx0XHRcdGlmIChhY3R1YWwpIHtcblx0XHRcdFx0XHRpZCA9IGFjdHVhbC5jb21tYW5kO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgaWQsIGNvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhbm5vdGF0ZUVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdGNvbnN0IHJlcG9ydGVkID0gdGhpcy4jZXh0SG9zdFRlbGVtZXRyeS5vbkV4dGVuc2lvbkVycm9yKGNvbW1hbmQuZXh0ZW5zaW9uLmlkZW50aWZpZXIsIGVycik7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ2ZvcndhcmRlZCBlcnJvciB0byBleHRlbnNpb24/JywgcmVwb3J0ZWQsIGNvbW1hbmQuZXh0ZW5zaW9uPy5pZGVudGlmaWVyKTtcblx0XHRcdH1cblxuXHRcdFx0dGhyb3cgbmV3IGNsYXNzIENvbW1hbmRFcnJvciBleHRlbmRzIEVycm9yIHtcblx0XHRcdFx0cmVhZG9ubHkgaWQgPSBpZDtcblx0XHRcdFx0cmVhZG9ubHkgc291cmNlID0gY29tbWFuZCEuZXh0ZW5zaW9uPy5kaXNwbGF5TmFtZSA/PyBjb21tYW5kIS5leHRlbnNpb24/Lm5hbWU7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHRvRXJyb3JNZXNzYWdlKGVycikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3JlcG9ydFRlbGVtZXRyeShjb21tYW5kLCBpZCwgc3RvcFdhdGNoLmVsYXBzZWQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0VGVsZW1ldHJ5KGNvbW1hbmQ6IENvbW1hbmRIYW5kbGVyLCBpZDogc3RyaW5nLCBkdXJhdGlvbjogbnVtYmVyKSB7XG5cdFx0aWYgKCFjb21tYW5kLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaWQuc3RhcnRzV2l0aCgnY29kZS5jb3BpbG90LmxvZ1N0cnVjdHVyZWQnKSkge1xuXHRcdFx0Ly8gVGhpcyBjb21tYW5kIGlzIHZlcnkgYWN0aXZlLiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1NDE1My5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHlwZSBFeHRlbnNpb25BY3Rpb25UZWxlbWV0cnkgPSB7XG5cdFx0XHRleHRlbnNpb25JZDogc3RyaW5nO1xuXHRcdFx0aWQ6IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+O1xuXHRcdFx0ZHVyYXRpb246IG51bWJlcjtcblx0XHR9O1xuXHRcdHR5cGUgRXh0ZW5zaW9uQWN0aW9uVGVsZW1ldHJ5TWV0YSA9IHtcblx0XHRcdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGlkIG9mIHRoZSBleHRlbnNpb24gaGFuZGxpbmcgdGhlIGNvbW1hbmQsIGluZm9ybWluZyB3aGljaCBleHRlbnNpb25zIHByb3ZpZGUgbW9zdC11c2VkIGZ1bmN0aW9uYWxpdHkuJyB9O1xuXHRcdFx0aWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaWQgb2YgdGhlIGNvbW1hbmQsIHRvIHVuZGVyc3RhbmQgd2hpY2ggc3BlY2lmaWMgZXh0ZW5zaW9uIGZlYXR1cmVzIGFyZSBtb3N0IHBvcHVsYXIuJyB9O1xuXHRcdFx0ZHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgZHVyYXRpb24gb2YgdGhlIGNvbW1hbmQgZXhlY3V0aW9uLCB0byBkZXRlY3QgcGVyZm9ybWFuY2UgaXNzdWVzJyB9O1xuXHRcdFx0b3duZXI6ICdkaWdpdGFyYWxkJztcblx0XHRcdGNvbW1lbnQ6ICdVc2VkIHRvIGdhaW4gaW5zaWdodCBvbiB0aGUgbW9zdCBwb3B1bGFyIGNvbW1hbmRzIHVzZWQgZnJvbSBleHRlbnNpb25zJztcblx0XHR9O1xuXHRcdHRoaXMuI3RlbGVtZXRyeS4kcHVibGljTG9nMjxFeHRlbnNpb25BY3Rpb25UZWxlbWV0cnksIEV4dGVuc2lvbkFjdGlvblRlbGVtZXRyeU1ldGE+KCdFeHRlbnNpb246QWN0aW9uRXhlY3V0ZWQnLCB7XG5cdFx0XHRleHRlbnNpb25JZDogY29tbWFuZC5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdGlkOiBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKGlkKSxcblx0XHRcdGR1cmF0aW9uOiBkdXJhdGlvbixcblx0XHR9KTtcblx0fVxuXG5cdCRleGVjdXRlQ29udHJpYnV0ZWRDb21tYW5kKGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RDb21tYW5kcyMkZXhlY3V0ZUNvbnRyaWJ1dGVkQ29tbWFuZCcsIGlkKTtcblxuXHRcdGNvbnN0IGNtZEhhbmRsZXIgPSB0aGlzLl9jb21tYW5kcy5nZXQoaWQpO1xuXHRcdGlmICghY21kSGFuZGxlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgQ29udHJpYnV0ZWQgY29tbWFuZCAnJHtpZH0nIGRvZXMgbm90IGV4aXN0LmApKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXJncyA9IGFyZ3MubWFwKGFyZyA9PiB0aGlzLl9hcmd1bWVudFByb2Nlc3NvcnMucmVkdWNlKChyLCBwKSA9PiBwLnByb2Nlc3NBcmd1bWVudChyLCBjbWRIYW5kbGVyLmV4dGVuc2lvbiksIGFyZykpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGVDb250cmlidXRlZENvbW1hbmQoaWQsIGFyZ3MsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGdldENvbW1hbmRzKGZpbHRlclVuZGVyc2NvcmVDb21tYW5kczogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0V4dEhvc3RDb21tYW5kcyNnZXRDb21tYW5kcycsIGZpbHRlclVuZGVyc2NvcmVDb21tYW5kcyk7XG5cblx0XHRyZXR1cm4gdGhpcy4jcHJveHkuJGdldENvbW1hbmRzKCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0aWYgKGZpbHRlclVuZGVyc2NvcmVDb21tYW5kcykge1xuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQuZmlsdGVyKGNvbW1hbmQgPT4gY29tbWFuZFswXSAhPT0gJ18nKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHQkZ2V0Q29udHJpYnV0ZWRDb21tYW5kTWV0YWRhdGEoKTogUHJvbWlzZTx7IFtpZDogc3RyaW5nXTogc3RyaW5nIHwgSUNvbW1hbmRNZXRhZGF0YUR0byB9PiB7XG5cdFx0Y29uc3QgcmVzdWx0OiB7IFtpZDogc3RyaW5nXTogc3RyaW5nIHwgSUNvbW1hbmRNZXRhZGF0YSB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IFtpZCwgY29tbWFuZF0gb2YgdGhpcy5fY29tbWFuZHMpIHtcblx0XHRcdGNvbnN0IHsgbWV0YWRhdGEgfSA9IGNvbW1hbmQ7XG5cdFx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdFx0cmVzdWx0W2lkXSA9IG1ldGFkYXRhO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0SG9zdENvbW1hbmRzIGV4dGVuZHMgRXh0SG9zdENvbW1hbmRzIHsgfVxuZXhwb3J0IGNvbnN0IElFeHRIb3N0Q29tbWFuZHMgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dEhvc3RDb21tYW5kcz4oJ0lFeHRIb3N0Q29tbWFuZHMnKTtcblxuZXhwb3J0IGNsYXNzIENvbW1hbmRzQ29udmVydGVyIGltcGxlbWVudHMgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuQ29tbWFuZC5JQ29tbWFuZHNDb252ZXJ0ZXIge1xuXG5cdHJlYWRvbmx5IGRlbGVnYXRpbmdDb21tYW5kSWQ6IHN0cmluZyA9IGBfX3ZzYyR7Z2VuZXJhdGVVdWlkKCl9YDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGUgPSBuZXcgTWFwPHN0cmluZywgdnNjb2RlLkNvbW1hbmQ+KCk7XG5cdHByaXZhdGUgX2NhY2hJZFBvb2wgPSAwO1xuXG5cdC8vIC0tLSBjb252ZXJzaW9uIGJldHdlZW4gaW50ZXJuYWwgYW5kIGFwaSBjb21tYW5kc1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kczogRXh0SG9zdENvbW1hbmRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvb2t1cEFwaUNvbW1hbmQ6IChpZDogc3RyaW5nKSA9PiBBcGlDb21tYW5kIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuX2NvbW1hbmRzLnJlZ2lzdGVyQ29tbWFuZCh0cnVlLCB0aGlzLmRlbGVnYXRpbmdDb21tYW5kSWQsIHRoaXMuX2V4ZWN1dGVDb252ZXJ0ZWRDb21tYW5kLCB0aGlzKTtcblx0fVxuXG5cdHRvSW50ZXJuYWwoY29tbWFuZDogdnNjb2RlLkNvbW1hbmQsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpOiBJQ29tbWFuZER0bztcblx0dG9JbnRlcm5hbChjb21tYW5kOiB2c2NvZGUuQ29tbWFuZCB8IHVuZGVmaW5lZCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IElDb21tYW5kRHRvIHwgdW5kZWZpbmVkO1xuXHR0b0ludGVybmFsKGNvbW1hbmQ6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSUNvbW1hbmREdG8gfCB1bmRlZmluZWQge1xuXG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogSUNvbW1hbmREdG8gPSB7XG5cdFx0XHQkaWRlbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGlkOiBjb21tYW5kLmNvbW1hbmQsXG5cdFx0XHR0aXRsZTogY29tbWFuZC50aXRsZSxcblx0XHRcdHRvb2x0aXA6IGNvbW1hbmQudG9vbHRpcFxuXHRcdH07XG5cblx0XHRpZiAoIWNvbW1hbmQuY29tbWFuZCkge1xuXHRcdFx0Ly8gZmFsc3kgY29tbWFuZCBpZCAtPiByZXR1cm4gY29udmVydGVkIGNvbW1hbmQgYnV0IGRvbid0IGF0dGVtcHQgYW55XG5cdFx0XHQvLyBhcmd1bWVudCBvciBBUEktY29tbWFuZCBkYW5jZSBzaW5jZSB0aGlzIGNvbW1hbmQgd29uJ3QgcnVuIGFueXdheXNcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBpQ29tbWFuZCA9IHRoaXMuX2xvb2t1cEFwaUNvbW1hbmQoY29tbWFuZC5jb21tYW5kKTtcblx0XHRpZiAoYXBpQ29tbWFuZCkge1xuXHRcdFx0Ly8gQVBJIGNvbW1hbmQgd2l0aCByZXR1cm4tdmFsdWUgY2FuIGJlIGNvbnZlcnRlZCBpbnBsYWNlXG5cdFx0XHRyZXN1bHQuaWQgPSBhcGlDb21tYW5kLmludGVybmFsSWQ7XG5cdFx0XHRyZXN1bHQuYXJndW1lbnRzID0gYXBpQ29tbWFuZC5hcmdzLm1hcCgoYXJnLCBpKSA9PiBhcmcuY29udmVydChjb21tYW5kLmFyZ3VtZW50cyAmJiBjb21tYW5kLmFyZ3VtZW50c1tpXSkpO1xuXG5cblx0XHR9IGVsc2UgaWYgKGlzTm9uRW1wdHlBcnJheShjb21tYW5kLmFyZ3VtZW50cykpIHtcblx0XHRcdC8vIHdlIGhhdmUgYSBjb250cmlidXRlZCBjb21tYW5kIHdpdGggYXJndW1lbnRzLiB0aGF0XG5cdFx0XHQvLyBtZWFucyB3ZSBkb24ndCB3YW50IHRvIHNlbmQgdGhlIGFyZ3VtZW50cyBhcm91bmRcblxuXHRcdFx0Y29uc3QgaWQgPSBgJHtjb21tYW5kLmNvbW1hbmR9IC8keysrdGhpcy5fY2FjaElkUG9vbH1gO1xuXHRcdFx0dGhpcy5fY2FjaGUuc2V0KGlkLCBjb21tYW5kKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jYWNoZS5kZWxldGUoaWQpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdDb21tYW5kc0NvbnZlcnRlciNESVNQT1NFJywgaWQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0cmVzdWx0LiRpZGVudCA9IGlkO1xuXG5cdFx0XHRyZXN1bHQuaWQgPSB0aGlzLmRlbGVnYXRpbmdDb21tYW5kSWQ7XG5cdFx0XHRyZXN1bHQuYXJndW1lbnRzID0gW2lkXTtcblxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnQ29tbWFuZHNDb252ZXJ0ZXIjQ1JFQVRFJywgY29tbWFuZC5jb21tYW5kLCBpZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGZyb21JbnRlcm5hbChjb21tYW5kOiBJQ29tbWFuZER0byk6IHZzY29kZS5Db21tYW5kIHwgdW5kZWZpbmVkIHtcblxuXHRcdGlmICh0eXBlb2YgY29tbWFuZC4kaWRlbnQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2FjaGUuZ2V0KGNvbW1hbmQuJGlkZW50KTtcblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb21tYW5kOiBjb21tYW5kLmlkLFxuXHRcdFx0XHR0aXRsZTogY29tbWFuZC50aXRsZSxcblx0XHRcdFx0YXJndW1lbnRzOiBjb21tYW5kLmFyZ3VtZW50c1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXG5cdGdldEFjdHVhbENvbW1hbmQoLi4uYXJnczogdW5rbm93bltdKTogdnNjb2RlLkNvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jYWNoZS5nZXQoYXJnc1swXSBhcyBzdHJpbmcpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXhlY3V0ZUNvbnZlcnRlZENvbW1hbmQ8Uj4oLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTxSPiB7XG5cdFx0Y29uc3QgYWN0dWFsQ21kID0gdGhpcy5nZXRBY3R1YWxDb21tYW5kKC4uLmFyZ3MpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0NvbW1hbmRzQ29udmVydGVyI0VYRUNVVEUnLCBhcmdzWzBdLCBhY3R1YWxDbWQgPyBhY3R1YWxDbWQuY29tbWFuZCA6ICdNSVNTSU5HJyk7XG5cblx0XHRpZiAoIWFjdHVhbENtZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KGBBY3R1YWwgY29tbWFuZCBub3QgZm91bmQsIHdhbnRlZCB0byBleGVjdXRlICR7YXJnc1swXX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKGFjdHVhbENtZC5jb21tYW5kLCAuLi4oYWN0dWFsQ21kLmFyZ3VtZW50cyB8fCBbXSkpO1xuXHR9XG5cbn1cblxuXG5leHBvcnQgY2xhc3MgQXBpQ29tbWFuZEFyZ3VtZW50PFYsIE8gPSBWPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFVyaSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8VVJJPigndXJpJywgJ1VyaSBvZiBhIHRleHQgZG9jdW1lbnQnLCB2ID0+IFVSSS5pc1VyaSh2KSwgdiA9PiB2KTtcblx0c3RhdGljIHJlYWRvbmx5IFBvc2l0aW9uID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxleHRIb3N0VHlwZXMuUG9zaXRpb24sIElQb3NpdGlvbj4oJ3Bvc2l0aW9uJywgJ0EgcG9zaXRpb24gaW4gYSB0ZXh0IGRvY3VtZW50JywgdiA9PiBleHRIb3N0VHlwZXMuUG9zaXRpb24uaXNQb3NpdGlvbih2KSwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuUG9zaXRpb24uZnJvbSk7XG5cdHN0YXRpYyByZWFkb25seSBSYW5nZSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQ8ZXh0SG9zdFR5cGVzLlJhbmdlLCBJUmFuZ2U+KCdyYW5nZScsICdBIHJhbmdlIGluIGEgdGV4dCBkb2N1bWVudCcsIHYgPT4gZXh0SG9zdFR5cGVzLlJhbmdlLmlzUmFuZ2UodiksIGV4dEhvc3RUeXBlQ29udmVydGVyLlJhbmdlLmZyb20pO1xuXHRzdGF0aWMgcmVhZG9ubHkgU2VsZWN0aW9uID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxleHRIb3N0VHlwZXMuU2VsZWN0aW9uLCBJU2VsZWN0aW9uPignc2VsZWN0aW9uJywgJ0Egc2VsZWN0aW9uIGluIGEgdGV4dCBkb2N1bWVudCcsIHYgPT4gZXh0SG9zdFR5cGVzLlNlbGVjdGlvbi5pc1NlbGVjdGlvbih2KSwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuU2VsZWN0aW9uLmZyb20pO1xuXHRzdGF0aWMgcmVhZG9ubHkgTnVtYmVyID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudDxudW1iZXI+KCdudW1iZXInLCAnJywgdiA9PiB0eXBlb2YgdiA9PT0gJ251bWJlcicsIHYgPT4gdik7XG5cdHN0YXRpYyByZWFkb25seSBTdHJpbmcgPSBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50PHN0cmluZz4oJ3N0cmluZycsICcnLCB2ID0+IHR5cGVvZiB2ID09PSAnc3RyaW5nJywgdiA9PiB2KTtcblxuXHRzdGF0aWMgQXJyPFQsIEsgPSBUPihlbGVtZW50OiBBcGlDb21tYW5kQXJndW1lbnQ8VCwgSz4pIHtcblx0XHRyZXR1cm4gbmV3IEFwaUNvbW1hbmRBcmd1bWVudChcblx0XHRcdGAke2VsZW1lbnQubmFtZX1fYXJyYXlgLFxuXHRcdFx0YEFycmF5IG9mICR7ZWxlbWVudC5uYW1lfSwgJHtlbGVtZW50LmRlc2NyaXB0aW9ufWAsXG5cdFx0XHQodjogdW5rbm93bikgPT4gQXJyYXkuaXNBcnJheSh2KSAmJiB2LmV2ZXJ5KGUgPT4gZWxlbWVudC52YWxpZGF0ZShlKSksXG5cdFx0XHQodjogVFtdKSA9PiB2Lm1hcChlID0+IGVsZW1lbnQuY29udmVydChlKSlcblx0XHQpO1xuXHR9XG5cblx0c3RhdGljIHJlYWRvbmx5IENhbGxIaWVyYXJjaHlJdGVtID0gbmV3IEFwaUNvbW1hbmRBcmd1bWVudCgnaXRlbScsICdBIGNhbGwgaGllcmFyY2h5IGl0ZW0nLCB2ID0+IHYgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuQ2FsbEhpZXJhcmNoeUl0ZW0sIGV4dEhvc3RUeXBlQ29udmVydGVyLkNhbGxIaWVyYXJjaHlJdGVtLmZyb20pO1xuXHRzdGF0aWMgcmVhZG9ubHkgVHlwZUhpZXJhcmNoeUl0ZW0gPSBuZXcgQXBpQ29tbWFuZEFyZ3VtZW50KCdpdGVtJywgJ0EgdHlwZSBoaWVyYXJjaHkgaXRlbScsIHYgPT4gdiBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5UeXBlSGllcmFyY2h5SXRlbSwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuVHlwZUhpZXJhcmNoeUl0ZW0uZnJvbSk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0SXRlbSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ3Rlc3RJdGVtJywgJ0EgVlMgQ29kZSBUZXN0SXRlbScsIHYgPT4gdiBpbnN0YW5jZW9mIFRlc3RJdGVtSW1wbCwgZXh0SG9zdFR5cGVDb252ZXJ0ZXIuVGVzdEl0ZW0uZnJvbSk7XG5cdHN0YXRpYyByZWFkb25seSBUZXN0UHJvZmlsZSA9IG5ldyBBcGlDb21tYW5kQXJndW1lbnQoJ3Rlc3RQcm9maWxlJywgJ0EgVlMgQ29kZSB0ZXN0IHByb2ZpbGUnLCB2ID0+IHYgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuVGVzdFJ1blByb2ZpbGVCYXNlLCBleHRIb3N0VHlwZUNvbnZlcnRlci5UZXN0UnVuUHJvZmlsZS5mcm9tKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyxcblx0XHRyZWFkb25seSB2YWxpZGF0ZTogKHY6IFYpID0+IGJvb2xlYW4sXG5cdFx0cmVhZG9ubHkgY29udmVydDogKHY6IFYpID0+IE9cblx0KSB7IH1cblxuXHRvcHRpb25hbCgpOiBBcGlDb21tYW5kQXJndW1lbnQ8ViB8IHVuZGVmaW5lZCB8IG51bGwsIE8gfCB1bmRlZmluZWQgfCBudWxsPiB7XG5cdFx0cmV0dXJuIG5ldyBBcGlDb21tYW5kQXJndW1lbnQoXG5cdFx0XHR0aGlzLm5hbWUsIGAob3B0aW9uYWwpICR7dGhpcy5kZXNjcmlwdGlvbn1gLFxuXHRcdFx0dmFsdWUgPT4gdmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCB8fCB0aGlzLnZhbGlkYXRlKHZhbHVlKSxcblx0XHRcdHZhbHVlID0+IHZhbHVlID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiB2YWx1ZSA9PT0gbnVsbCA/IG51bGwgOiB0aGlzLmNvbnZlcnQodmFsdWUpXG5cdFx0KTtcblx0fVxuXG5cdHdpdGgobmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogQXBpQ29tbWFuZEFyZ3VtZW50PFYsIE8+IHtcblx0XHRyZXR1cm4gbmV3IEFwaUNvbW1hbmRBcmd1bWVudChuYW1lID8/IHRoaXMubmFtZSwgZGVzY3JpcHRpb24gPz8gdGhpcy5kZXNjcmlwdGlvbiwgdGhpcy52YWxpZGF0ZSwgdGhpcy5jb252ZXJ0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQXBpQ29tbWFuZFJlc3VsdDxWLCBPID0gVj4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBWb2lkID0gbmV3IEFwaUNvbW1hbmRSZXN1bHQ8dm9pZCwgdm9pZD4oJ25vIHJlc3VsdCcsIHYgPT4gdik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgZGVzY3JpcHRpb246IHN0cmluZyxcblx0XHRyZWFkb25seSBjb252ZXJ0OiAodjogViwgYXBpQXJnczogYW55W10sIGNtZENvbnZlcnRlcjogQ29tbWFuZHNDb252ZXJ0ZXIpID0+IE9cblx0KSB7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEFwaUNvbW1hbmQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgaW50ZXJuYWxJZDogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgYXJnczogQXBpQ29tbWFuZEFyZ3VtZW50PGFueSwgYW55PltdLFxuXHRcdHJlYWRvbmx5IHJlc3VsdDogQXBpQ29tbWFuZFJlc3VsdDxhbnksIGFueT5cblx0KSB7IH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUywwQkFBMEI7QUFFbkMsWUFBWSxrQkFBa0I7QUFDOUIsWUFBWSwwQkFBMEI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBOEg7QUFDdkksU0FBUyx1QkFBdUI7QUFHaEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxjQUFjO0FBQ3ZCLFNBQWlCLGFBQWE7QUFDOUIsU0FBb0IsZ0JBQWdCO0FBQ3BDLFNBQVMsV0FBVztBQUNwQixTQUEwQixvQkFBb0I7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxn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LG9CQUVJLE1BQU0sSUFBSSxvQkFBd0IsT0FBTywwQkFBMEIsT0FBSyxJQUFJLE1BQU0sQ0FBQyxHQUFHLE9BQUssQ0FBQztBQUZoRyxvQkFHSSxXQUFXLElBQUksb0JBQXFELFlBQVksaUNBQWlDLE9BQUssYUFBYSxTQUFTLFdBQVcsQ0FBQyxHQUFHLHFCQUFxQixTQUFTLElBQUk7QUFIak0sb0JBSUksUUFBUSxJQUFJLG9CQUErQyxTQUFTLDhCQUE4QixPQUFLLGFBQWEsTUFBTSxRQUFRLENBQUMsR0FBRyxxQkFBcUIsTUFBTSxJQUFJO0FBSnpLLG9CQUtJLFlBQVksSUFBSSxvQkFBdUQsYUFBYSxrQ0FBa0MsT0FBSyxhQUFhLFVBQVUsWUFBWSxDQUFDLEdBQUcscUJBQXFCLFVBQVUsSUFBSTtBQUx6TSxvQkFNSSxTQUFTLElBQUksb0JBQTJCLFVBQVUsSUFBSSxPQUFLLE9BQU8sTUFBTSxVQUFVLE9BQUssQ0FBQztBQU41RixvQkFPSSxTQUFTLElBQUksb0JBQTJCLFVBQVUsSUFBSSxPQUFLLE9BQU8sTUFBTSxVQUFVLE9BQUssQ0FBQztBQVA1RixvQkFrQkksb0JBQW9CLElBQUksb0JBQW1CLFFBQVEseUJBQXlCLE9BQUssYUFBYSxhQUFhLG1CQUFtQixxQkFBcUIsa0JBQWtCLElBQUk7QUFsQjdLLG9CQW1CSSxvQkFBb0IsSUFBSSxvQkFBbUIsUUFBUSx5QkFBeUIsT0FBSyxhQUFhLGFBQWEsbUJBQW1CLHFCQUFxQixrQkFBa0IsSUFBSTtBQW5CN0ssb0JBb0JJLFdBQVcsSUFBSSxvQkFBbUIsWUFBWSxzQkFBc0IsT0FBSyxhQUFhLGNBQWMscUJBQXFCLFNBQVMsSUFBSTtBQXBCMUksb0JBcUJJLGNBQWMsSUFBSSxvQkFBbUIsZUFBZSwwQkFBMEIsT0FBSyxhQUFhLGFBQWEsb0JBQW9CLHFCQUFxQixlQUFlLElBQUk7QUFyQm5MLElBQU0scUJBQU47QUEyQ0EsTUFBTSxvQkFBTixNQUFNLGtCQUEyQjtBQUFBLEVBSXZDLFlBQ1UsYUFDQSxTQUNSO0FBRlE7QUFDQTtBQUFBLEVBQ047QUFDTDtBQVJhLGtCQUVJLE9BQU8sSUFBSSxrQkFBNkIsYUFBYSxPQUFLLENBQUM7QUFGckUsSUFBTSxtQkFBTjtBQVVBLE1BQU0sV0FBVztBQUFBLEVBRXZCLFlBQ1UsSUFDQSxZQUNBLGFBQ0EsTUFDQSxRQUNSO0FBTFE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBLEVBQ047QUFDTDsiLAogICJuYW1lcyI6IFtdCn0K
