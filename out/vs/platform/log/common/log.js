import * as nls from "../../../nls.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { hash } from "../../../base/common/hash.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { isWindows } from "../../../base/common/platform.js";
import { joinPath } from "../../../base/common/resources.js";
import { isNumber, isString } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { RawContextKey } from "../../contextkey/common/contextkey.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
const ILogService = createDecorator("logService");
const ILoggerService = createDecorator("loggerService");
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isLogLevel(thing) {
  return isNumber(thing);
}
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["Off"] = 0] = "Off";
  LogLevel2[LogLevel2["Trace"] = 1] = "Trace";
  LogLevel2[LogLevel2["Debug"] = 2] = "Debug";
  LogLevel2[LogLevel2["Info"] = 3] = "Info";
  LogLevel2[LogLevel2["Warning"] = 4] = "Warning";
  LogLevel2[LogLevel2["Error"] = 5] = "Error";
  return LogLevel2;
})(LogLevel || {});
const DEFAULT_LOG_LEVEL = 3 /* Info */;
function canLog(loggerLevel, messageLevel) {
  return loggerLevel !== 0 /* Off */ && loggerLevel <= messageLevel;
}
function log(logger, level, message) {
  switch (level) {
    case 1 /* Trace */:
      logger.trace(message);
      break;
    case 2 /* Debug */:
      logger.debug(message);
      break;
    case 3 /* Info */:
      logger.info(message);
      break;
    case 4 /* Warning */:
      logger.warn(message);
      break;
    case 5 /* Error */:
      logger.error(message);
      break;
    case 0 /* Off */:
      break;
    default:
      throw new Error(`Invalid log level ${level}`);
  }
}
const isDevConsoleLogForwardingEnabled = false;
let isConsoleForwarding = false;
let isLogServiceConsoleEcho = false;
function getConsoleMethod(method) {
  switch (method) {
    case "debug":
      return console.debug;
    case "error":
      return console.error;
    case "info":
      return console.info;
    case "log":
      return console.log;
    case "warn":
      return console.warn;
  }
}
function setConsoleMethod(method, fn) {
  switch (method) {
    case "debug":
      console.debug = fn;
      break;
    case "error":
      console.error = fn;
      break;
    case "info":
      console.info = fn;
      break;
    case "log":
      console.log = fn;
      break;
    case "warn":
      console.warn = fn;
      break;
  }
}
function logToConsole(method, ...args) {
  if (isConsoleForwarding) {
    return;
  }
  isLogServiceConsoleEcho = true;
  try {
    getConsoleMethod(method).apply(console, args);
  } finally {
    isLogServiceConsoleEcho = false;
  }
}
function registerDevConsoleLogForwarder(logService) {
  const originalConsoleMethods = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn
  };
  const forward = (method, level, args) => {
    if (!isLogServiceConsoleEcho) {
      isConsoleForwarding = true;
      try {
        log(logService, level, format(args));
      } catch {
      } finally {
        isConsoleForwarding = false;
      }
    }
    originalConsoleMethods[method].apply(console, args);
  };
  const wrappers = {
    debug: (...args) => forward("debug", 2 /* Debug */, args),
    error: (...args) => forward("error", 5 /* Error */, args),
    info: (...args) => forward("info", 3 /* Info */, args),
    log: (...args) => forward("log", 3 /* Info */, args),
    warn: (...args) => forward("warn", 4 /* Warning */, args)
  };
  setConsoleMethod("debug", wrappers.debug);
  setConsoleMethod("error", wrappers.error);
  setConsoleMethod("info", wrappers.info);
  setConsoleMethod("log", wrappers.log);
  setConsoleMethod("warn", wrappers.warn);
  return toDisposable(() => {
    if (console.debug === wrappers.debug) {
      console.debug = originalConsoleMethods.debug;
    }
    if (console.error === wrappers.error) {
      console.error = originalConsoleMethods.error;
    }
    if (console.info === wrappers.info) {
      console.info = originalConsoleMethods.info;
    }
    if (console.log === wrappers.log) {
      console.log = originalConsoleMethods.log;
    }
    if (console.warn === wrappers.warn) {
      console.warn = originalConsoleMethods.warn;
    }
  });
}
function format(args, verbose = false) {
  let result = "";
  for (let i = 0; i < args.length; i++) {
    let a = args[i];
    if (a instanceof Error) {
      a = toErrorMessage(a, verbose);
    }
    if (typeof a === "object") {
      try {
        a = JSON.stringify(a);
      } catch (e) {
      }
    }
    result += (i > 0 ? " " : "") + a;
  }
  return result;
}
class AbstractLogger extends Disposable {
  constructor() {
    super(...arguments);
    this.level = DEFAULT_LOG_LEVEL;
    this._onDidChangeLogLevel = this._register(new Emitter());
  }
  get onDidChangeLogLevel() {
    return this._onDidChangeLogLevel.event;
  }
  setLevel(level) {
    if (this.level !== level) {
      this.level = level;
      this._onDidChangeLogLevel.fire(this.level);
    }
  }
  getLevel() {
    return this.level;
  }
  checkLogLevel(level) {
    return canLog(this.level, level);
  }
  canLog(level) {
    if (this._store.isDisposed) {
      return false;
    }
    return this.checkLogLevel(level);
  }
}
class AbstractMessageLogger extends AbstractLogger {
  constructor(logAlways) {
    super();
    this.logAlways = logAlways;
  }
  checkLogLevel(level) {
    return this.logAlways || super.checkLogLevel(level);
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      this.log(1 /* Trace */, format([message, ...args], true));
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      this.log(2 /* Debug */, format([message, ...args]));
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      this.log(3 /* Info */, format([message, ...args]));
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      this.log(4 /* Warning */, format([message, ...args]));
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      if (message instanceof Error) {
        const array = Array.prototype.slice.call(arguments);
        array[0] = message.stack;
        this.log(5 /* Error */, format(array));
      } else {
        this.log(5 /* Error */, format([message, ...args]));
      }
    }
  }
  flush() {
  }
}
class ConsoleMainLogger extends AbstractLogger {
  constructor(logLevel = DEFAULT_LOG_LEVEL) {
    super();
    this.setLevel(logLevel);
    this.useColors = !isWindows;
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      if (this.useColors) {
        logToConsole("log", `\x1B[90m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("log", `[main ${now()}]`, message, ...args);
      }
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      if (this.useColors) {
        logToConsole("log", `\x1B[90m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("log", `[main ${now()}]`, message, ...args);
      }
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      if (this.useColors) {
        logToConsole("log", `\x1B[90m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("log", `[main ${now()}]`, message, ...args);
      }
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      if (this.useColors) {
        logToConsole("warn", `\x1B[93m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("warn", `[main ${now()}]`, message, ...args);
      }
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      if (this.useColors) {
        logToConsole("error", `\x1B[91m[main ${now()}]\x1B[0m`, message, ...args);
      } else {
        logToConsole("error", `[main ${now()}]`, message, ...args);
      }
    }
  }
  flush() {
  }
}
class ConsoleLogger extends AbstractLogger {
  constructor(logLevel = DEFAULT_LOG_LEVEL, useColors = true) {
    super();
    this.useColors = useColors;
    this.setLevel(logLevel);
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      if (this.useColors) {
        logToConsole("log", "%cTRACE", "color: #888", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      if (this.useColors) {
        logToConsole("log", "%cDEBUG", "background: #eee; color: #888", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      if (this.useColors) {
        logToConsole("log", "%c INFO", "color: #33f", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      if (this.useColors) {
        logToConsole("warn", "%c WARN", "color: #993", message, ...args);
      } else {
        logToConsole("log", message, ...args);
      }
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      if (this.useColors) {
        logToConsole("error", "%c  ERR", "color: #f33", message, ...args);
      } else {
        logToConsole("error", message, ...args);
      }
    }
  }
  flush() {
  }
}
class AdapterLogger extends AbstractLogger {
  constructor(adapter, logLevel = DEFAULT_LOG_LEVEL) {
    super();
    this.adapter = adapter;
    this.setLevel(logLevel);
  }
  trace(message, ...args) {
    if (this.canLog(1 /* Trace */)) {
      this.adapter.log(1 /* Trace */, [this.extractMessage(message), ...args]);
    }
  }
  debug(message, ...args) {
    if (this.canLog(2 /* Debug */)) {
      this.adapter.log(2 /* Debug */, [this.extractMessage(message), ...args]);
    }
  }
  info(message, ...args) {
    if (this.canLog(3 /* Info */)) {
      this.adapter.log(3 /* Info */, [this.extractMessage(message), ...args]);
    }
  }
  warn(message, ...args) {
    if (this.canLog(4 /* Warning */)) {
      this.adapter.log(4 /* Warning */, [this.extractMessage(message), ...args]);
    }
  }
  error(message, ...args) {
    if (this.canLog(5 /* Error */)) {
      this.adapter.log(5 /* Error */, [this.extractMessage(message), ...args]);
    }
  }
  extractMessage(msg) {
    if (typeof msg === "string") {
      return msg;
    }
    return toErrorMessage(msg, this.canLog(1 /* Trace */));
  }
  flush() {
  }
}
class MultiplexLogger extends AbstractLogger {
  constructor(loggers) {
    super();
    this.loggers = loggers;
    if (loggers.length) {
      this.setLevel(loggers[0].getLevel());
    }
  }
  setLevel(level) {
    for (const logger of this.loggers) {
      logger.setLevel(level);
    }
    super.setLevel(level);
  }
  trace(message, ...args) {
    for (const logger of this.loggers) {
      logger.trace(message, ...args);
    }
  }
  debug(message, ...args) {
    for (const logger of this.loggers) {
      logger.debug(message, ...args);
    }
  }
  info(message, ...args) {
    for (const logger of this.loggers) {
      logger.info(message, ...args);
    }
  }
  warn(message, ...args) {
    for (const logger of this.loggers) {
      logger.warn(message, ...args);
    }
  }
  error(message, ...args) {
    for (const logger of this.loggers) {
      logger.error(message, ...args);
    }
  }
  flush() {
    for (const logger of this.loggers) {
      logger.flush();
    }
  }
  dispose() {
    for (const logger of this.loggers) {
      logger.dispose();
    }
    super.dispose();
  }
}
class AbstractLoggerService extends Disposable {
  constructor(logLevel, logsHome, loggerResources) {
    super();
    this.logLevel = logLevel;
    this.logsHome = logsHome;
    this._loggers = new ResourceMap();
    this._onDidChangeLoggers = this._register(new Emitter());
    this.onDidChangeLoggers = this._onDidChangeLoggers.event;
    this._onDidChangeLogLevel = this._register(new Emitter());
    this.onDidChangeLogLevel = this._onDidChangeLogLevel.event;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.onDidChangeVisibility = this._onDidChangeVisibility.event;
    if (loggerResources) {
      for (const loggerResource of loggerResources) {
        this._loggers.set(loggerResource.resource, { logger: void 0, info: loggerResource });
      }
    }
  }
  getLoggerEntry(resourceOrId) {
    if (isString(resourceOrId)) {
      return [...this._loggers.values()].find((logger) => logger.info.id === resourceOrId);
    }
    return this._loggers.get(resourceOrId);
  }
  getLogger(resourceOrId) {
    return this.getLoggerEntry(resourceOrId)?.logger;
  }
  createLogger(idOrResource, options) {
    const resource = this.toResource(idOrResource);
    const id = isString(idOrResource) ? idOrResource : options?.id ?? hash(resource.toString()).toString(16);
    let logger = this._loggers.get(resource)?.logger;
    const logLevel = options?.logLevel === "always" ? 1 /* Trace */ : options?.logLevel;
    if (!logger) {
      logger = this.doCreateLogger(resource, logLevel ?? this.getLogLevel(resource) ?? this.logLevel, { ...options, id });
    }
    const loggerEntry = {
      logger,
      info: {
        resource,
        id,
        logLevel,
        name: options?.name,
        hidden: options?.hidden,
        group: options?.group,
        extensionId: options?.extensionId,
        when: options?.when
      }
    };
    this.registerLogger(loggerEntry.info);
    this._loggers.set(resource, loggerEntry);
    return logger;
  }
  toResource(idOrResource) {
    return isString(idOrResource) ? joinPath(this.logsHome, `${idOrResource.replace(/[\\/:\*\?"<>\|]/g, "")}.log`) : idOrResource;
  }
  setLogLevel(arg1, arg2) {
    if (URI.isUri(arg1)) {
      const resource = arg1;
      const logLevel = arg2;
      const logger = this._loggers.get(resource);
      if (logger && logLevel !== logger.info.logLevel) {
        logger.info.logLevel = logLevel === this.logLevel ? void 0 : logLevel;
        logger.logger?.setLevel(logLevel);
        this._loggers.set(logger.info.resource, logger);
        this._onDidChangeLogLevel.fire([resource, logLevel]);
      }
    } else {
      this.logLevel = arg1;
      for (const [resource, logger] of this._loggers.entries()) {
        if (this._loggers.get(resource)?.info.logLevel === void 0) {
          logger.logger?.setLevel(this.logLevel);
        }
      }
      this._onDidChangeLogLevel.fire(this.logLevel);
    }
  }
  setVisibility(resourceOrId, visibility) {
    const logger = this.getLoggerEntry(resourceOrId);
    if (logger && visibility !== !logger.info.hidden) {
      logger.info.hidden = !visibility;
      this._loggers.set(logger.info.resource, logger);
      this._onDidChangeVisibility.fire([logger.info.resource, visibility]);
    }
  }
  getLogLevel(resource) {
    let logLevel;
    if (resource) {
      logLevel = this._loggers.get(resource)?.info.logLevel;
    }
    return logLevel ?? this.logLevel;
  }
  registerLogger(resource) {
    const existing = this._loggers.get(resource.resource);
    if (existing) {
      if (existing.info.hidden !== resource.hidden) {
        this.setVisibility(resource.resource, !resource.hidden);
      }
    } else {
      this._loggers.set(resource.resource, { info: resource, logger: void 0 });
      this._onDidChangeLoggers.fire({ added: [resource], removed: [] });
    }
  }
  deregisterLogger(idOrResource) {
    const resource = this.toResource(idOrResource);
    const existing = this._loggers.get(resource);
    if (existing) {
      if (existing.logger) {
        existing.logger.dispose();
      }
      this._loggers.delete(resource);
      this._onDidChangeLoggers.fire({ added: [], removed: [existing.info] });
    }
  }
  *getRegisteredLoggers() {
    for (const entry of this._loggers.values()) {
      yield entry.info;
    }
  }
  getRegisteredLogger(resource) {
    return this._loggers.get(resource)?.info;
  }
  dispose() {
    this._loggers.forEach((logger) => logger.logger?.dispose());
    this._loggers.clear();
    super.dispose();
  }
}
class NullLogger {
  constructor() {
    this.onDidChangeLogLevel = new Emitter().event;
  }
  setLevel(level) {
  }
  getLevel() {
    return 3 /* Info */;
  }
  trace(message, ...args) {
  }
  debug(message, ...args) {
  }
  info(message, ...args) {
  }
  warn(message, ...args) {
  }
  error(message, ...args) {
  }
  critical(message, ...args) {
  }
  dispose() {
  }
  flush() {
  }
}
class NullLogService extends NullLogger {
}
class NullLoggerService extends AbstractLoggerService {
  constructor() {
    super(0 /* Off */, URI.parse("log:///log"));
  }
  doCreateLogger(resource, logLevel, options) {
    return new NullLogger();
  }
}
function getLogLevel(environmentService) {
  if (environmentService.verbose) {
    return 1 /* Trace */;
  }
  if (typeof environmentService.logLevel === "string") {
    const logLevel = parseLogLevel(environmentService.logLevel.toLowerCase());
    if (logLevel !== void 0) {
      return logLevel;
    }
  }
  return DEFAULT_LOG_LEVEL;
}
function LogLevelToString(logLevel) {
  switch (logLevel) {
    case 1 /* Trace */:
      return "trace";
    case 2 /* Debug */:
      return "debug";
    case 3 /* Info */:
      return "info";
    case 4 /* Warning */:
      return "warn";
    case 5 /* Error */:
      return "error";
    case 0 /* Off */:
      return "off";
  }
}
function LogLevelToLocalizedString(logLevel) {
  switch (logLevel) {
    case 1 /* Trace */:
      return { original: "Trace", value: nls.localize("trace", "Trace") };
    case 2 /* Debug */:
      return { original: "Debug", value: nls.localize("debug", "Debug") };
    case 3 /* Info */:
      return { original: "Info", value: nls.localize("info", "Info") };
    case 4 /* Warning */:
      return { original: "Warning", value: nls.localize("warn", "Warning") };
    case 5 /* Error */:
      return { original: "Error", value: nls.localize("error", "Error") };
    case 0 /* Off */:
      return { original: "Off", value: nls.localize("off", "Off") };
  }
}
function parseLogLevel(logLevel) {
  switch (logLevel) {
    case "trace":
      return 1 /* Trace */;
    case "debug":
      return 2 /* Debug */;
    case "info":
      return 3 /* Info */;
    case "warn":
      return 4 /* Warning */;
    case "error":
      return 5 /* Error */;
    case "critical":
      return 5 /* Error */;
    case "off":
      return 0 /* Off */;
  }
  return void 0;
}
const CONTEXT_LOG_LEVEL = new RawContextKey("logLevel", LogLevelToString(3 /* Info */));
export {
  AbstractLogger,
  AbstractLoggerService,
  AbstractMessageLogger,
  AdapterLogger,
  CONTEXT_LOG_LEVEL,
  ConsoleLogger,
  ConsoleMainLogger,
  DEFAULT_LOG_LEVEL,
  ILogService,
  ILoggerService,
  LogLevel,
  LogLevelToLocalizedString,
  LogLevelToString,
  MultiplexLogger,
  NullLogService,
  NullLogger,
  NullLoggerService,
  canLog,
  format,
  getLogLevel,
  isDevConsoleLogForwardingEnabled,
  isLogLevel,
  log,
  parseLogLevel,
  registerDevConsoleLogForwarder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbG9nXFxjb21tb25cXGxvZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IE11dGFibGUsIGlzTnVtYmVyLCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IElMb2dTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElMb2dTZXJ2aWNlPignbG9nU2VydmljZScpO1xuZXhwb3J0IGNvbnN0IElMb2dnZXJTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElMb2dnZXJTZXJ2aWNlPignbG9nZ2VyU2VydmljZScpO1xuXG5mdW5jdGlvbiBub3coKTogc3RyaW5nIHtcblx0cmV0dXJuIG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTG9nTGV2ZWwodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBMb2dMZXZlbCB7XG5cdHJldHVybiBpc051bWJlcih0aGluZyk7XG59XG5cbmV4cG9ydCBlbnVtIExvZ0xldmVsIHtcblx0T2ZmLFxuXHRUcmFjZSxcblx0RGVidWcsXG5cdEluZm8sXG5cdFdhcm5pbmcsXG5cdEVycm9yXG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0xPR19MRVZFTDogTG9nTGV2ZWwgPSBMb2dMZXZlbC5JbmZvO1xuXG5leHBvcnQgaW50ZXJmYWNlIElMb2dnZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9nTGV2ZWw6IEV2ZW50PExvZ0xldmVsPjtcblx0Z2V0TGV2ZWwoKTogTG9nTGV2ZWw7XG5cdHNldExldmVsKGxldmVsOiBMb2dMZXZlbCk6IHZvaWQ7XG5cblx0dHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xuXHRkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG5cdGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIEFuIG9wZXJhdGlvbiB0byBmbHVzaCB0aGUgY29udGVudHMuIENhbiBiZSBzeW5jaHJvbm91cy5cblx0ICovXG5cdGZsdXNoKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjYW5Mb2cobG9nZ2VyTGV2ZWw6IExvZ0xldmVsLCBtZXNzYWdlTGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiB7XG5cdHJldHVybiBsb2dnZXJMZXZlbCAhPT0gTG9nTGV2ZWwuT2ZmICYmIGxvZ2dlckxldmVsIDw9IG1lc3NhZ2VMZXZlbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvZyhsb2dnZXI6IElMb2dnZXIsIGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdHN3aXRjaCAobGV2ZWwpIHtcblx0XHRjYXNlIExvZ0xldmVsLlRyYWNlOiBsb2dnZXIudHJhY2UobWVzc2FnZSk7IGJyZWFrO1xuXHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6IGxvZ2dlci5kZWJ1ZyhtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5JbmZvOiBsb2dnZXIuaW5mbyhtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5XYXJuaW5nOiBsb2dnZXIud2FybihtZXNzYWdlKTsgYnJlYWs7XG5cdFx0Y2FzZSBMb2dMZXZlbC5FcnJvcjogbG9nZ2VyLmVycm9yKG1lc3NhZ2UpOyBicmVhaztcblx0XHRjYXNlIExvZ0xldmVsLk9mZjogLyogZG8gbm90aGluZyAqLyBicmVhaztcblx0XHRkZWZhdWx0OiB0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbG9nIGxldmVsICR7bGV2ZWx9YCk7XG5cdH1cbn1cblxudHlwZSBDb25zb2xlTWV0aG9kID0gJ2RlYnVnJyB8ICdlcnJvcicgfCAnaW5mbycgfCAnbG9nJyB8ICd3YXJuJztcbnR5cGUgQ29uc29sZU1ldGhvZEZuID0gKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZDtcblxuLyoqXG4gKiBGbGFnIHRvIGVuYWJsZSBmb3J3YXJkaW5nIG9mIGNvbnNvbGUuKiBjYWxscyB0byB0aGUgbG9nIHNlcnZpY2UgaW4gZGV2ZWxvcG1lbnQuXG4gKiBUaGlzIGlzIGludGVuZGVkIGZvciB0aGUgdXNlIG9mIGFnZW50cyB0byBxdWlja2x5IGluc3RydW1lbnQgdGhlIGNvZGUgd2l0aCBjb25zb2xlLmxvZ3NcbiAqIHdoaWNoIHdpbGwgZW5kIHVwIGluIHRoZSBsb2cgc2VydmljZSdzIGZpbGUgb3V0cHV0cy5cbiAqL1xuZXhwb3J0IGNvbnN0IGlzRGV2Q29uc29sZUxvZ0ZvcndhcmRpbmdFbmFibGVkID0gZmFsc2Vcblx0Ly8gfHwgQm9vbGVhbihcInRydWVcIikgLy8gZG9uZSBcIndlaXJkbHlcIiBzbyB0aGF0IGEgbGludCB3YXJuaW5nIHByZXZlbnRzIHlvdSBmcm9tIHB1c2hpbmcgdGhpc1xuXHQ7XG5cbmxldCBpc0NvbnNvbGVGb3J3YXJkaW5nID0gZmFsc2U7XG5sZXQgaXNMb2dTZXJ2aWNlQ29uc29sZUVjaG8gPSBmYWxzZTtcblxuZnVuY3Rpb24gZ2V0Q29uc29sZU1ldGhvZChtZXRob2Q6IENvbnNvbGVNZXRob2QpOiBDb25zb2xlTWV0aG9kRm4ge1xuXHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdGNhc2UgJ2RlYnVnJzogcmV0dXJuIGNvbnNvbGUuZGVidWc7XG5cdFx0Y2FzZSAnZXJyb3InOiByZXR1cm4gY29uc29sZS5lcnJvcjtcblx0XHRjYXNlICdpbmZvJzogcmV0dXJuIGNvbnNvbGUuaW5mbztcblx0XHRjYXNlICdsb2cnOiByZXR1cm4gY29uc29sZS5sb2c7XG5cdFx0Y2FzZSAnd2Fybic6IHJldHVybiBjb25zb2xlLndhcm47XG5cdH1cbn1cblxuZnVuY3Rpb24gc2V0Q29uc29sZU1ldGhvZChtZXRob2Q6IENvbnNvbGVNZXRob2QsIGZuOiBDb25zb2xlTWV0aG9kRm4pOiB2b2lkIHtcblx0c3dpdGNoIChtZXRob2QpIHtcblx0XHRjYXNlICdkZWJ1Zyc6IGNvbnNvbGUuZGVidWcgPSBmbjsgYnJlYWs7XG5cdFx0Y2FzZSAnZXJyb3InOiBjb25zb2xlLmVycm9yID0gZm47IGJyZWFrO1xuXHRcdGNhc2UgJ2luZm8nOiBjb25zb2xlLmluZm8gPSBmbjsgYnJlYWs7XG5cdFx0Y2FzZSAnbG9nJzogY29uc29sZS5sb2cgPSBmbjsgYnJlYWs7XG5cdFx0Y2FzZSAnd2Fybic6IGNvbnNvbGUud2FybiA9IGZuOyBicmVhaztcblx0fVxufVxuXG5mdW5jdGlvbiBsb2dUb0NvbnNvbGUobWV0aG9kOiBDb25zb2xlTWV0aG9kLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0aWYgKGlzQ29uc29sZUZvcndhcmRpbmcpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0aXNMb2dTZXJ2aWNlQ29uc29sZUVjaG8gPSB0cnVlO1xuXHR0cnkge1xuXHRcdGdldENvbnNvbGVNZXRob2QobWV0aG9kKS5hcHBseShjb25zb2xlLCBhcmdzKTtcblx0fSBmaW5hbGx5IHtcblx0XHRpc0xvZ1NlcnZpY2VDb25zb2xlRWNobyA9IGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckRldkNvbnNvbGVMb2dGb3J3YXJkZXIobG9nU2VydmljZTogSUxvZ1NlcnZpY2UpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IG9yaWdpbmFsQ29uc29sZU1ldGhvZHM6IFJlY29yZDxDb25zb2xlTWV0aG9kLCBDb25zb2xlTWV0aG9kRm4+ID0ge1xuXHRcdGRlYnVnOiBjb25zb2xlLmRlYnVnLFxuXHRcdGVycm9yOiBjb25zb2xlLmVycm9yLFxuXHRcdGluZm86IGNvbnNvbGUuaW5mbyxcblx0XHRsb2c6IGNvbnNvbGUubG9nLFxuXHRcdHdhcm46IGNvbnNvbGUud2FyblxuXHR9O1xuXG5cdGNvbnN0IGZvcndhcmQgPSAobWV0aG9kOiBDb25zb2xlTWV0aG9kLCBsZXZlbDogTG9nTGV2ZWwsIGFyZ3M6IHVua25vd25bXSk6IHZvaWQgPT4ge1xuXHRcdGlmICghaXNMb2dTZXJ2aWNlQ29uc29sZUVjaG8pIHtcblx0XHRcdGlzQ29uc29sZUZvcndhcmRpbmcgPSB0cnVlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bG9nKGxvZ1NlcnZpY2UsIGxldmVsLCBmb3JtYXQoYXJncykpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIEJlc3QtZWZmb3J0IGRldmVsb3BtZW50IGxvZ2dpbmcgbXVzdCBub3QgYnJlYWsgbm9ybWFsIGNvbnNvbGUgc2VtYW50aWNzLlxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aXNDb25zb2xlRm9yd2FyZGluZyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdG9yaWdpbmFsQ29uc29sZU1ldGhvZHNbbWV0aG9kXS5hcHBseShjb25zb2xlLCBhcmdzKTtcblx0fTtcblxuXHRjb25zdCB3cmFwcGVyczogUmVjb3JkPENvbnNvbGVNZXRob2QsIENvbnNvbGVNZXRob2RGbj4gPSB7XG5cdFx0ZGVidWc6ICguLi5hcmdzOiB1bmtub3duW10pID0+IGZvcndhcmQoJ2RlYnVnJywgTG9nTGV2ZWwuRGVidWcsIGFyZ3MpLFxuXHRcdGVycm9yOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBmb3J3YXJkKCdlcnJvcicsIExvZ0xldmVsLkVycm9yLCBhcmdzKSxcblx0XHRpbmZvOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBmb3J3YXJkKCdpbmZvJywgTG9nTGV2ZWwuSW5mbywgYXJncyksXG5cdFx0bG9nOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBmb3J3YXJkKCdsb2cnLCBMb2dMZXZlbC5JbmZvLCBhcmdzKSxcblx0XHR3YXJuOiAoLi4uYXJnczogdW5rbm93bltdKSA9PiBmb3J3YXJkKCd3YXJuJywgTG9nTGV2ZWwuV2FybmluZywgYXJncylcblx0fTtcblxuXHRzZXRDb25zb2xlTWV0aG9kKCdkZWJ1ZycsIHdyYXBwZXJzLmRlYnVnKTtcblx0c2V0Q29uc29sZU1ldGhvZCgnZXJyb3InLCB3cmFwcGVycy5lcnJvcik7XG5cdHNldENvbnNvbGVNZXRob2QoJ2luZm8nLCB3cmFwcGVycy5pbmZvKTtcblx0c2V0Q29uc29sZU1ldGhvZCgnbG9nJywgd3JhcHBlcnMubG9nKTtcblx0c2V0Q29uc29sZU1ldGhvZCgnd2FybicsIHdyYXBwZXJzLndhcm4pO1xuXG5cdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdGlmIChjb25zb2xlLmRlYnVnID09PSB3cmFwcGVycy5kZWJ1Zykge1xuXHRcdFx0Y29uc29sZS5kZWJ1ZyA9IG9yaWdpbmFsQ29uc29sZU1ldGhvZHMuZGVidWc7XG5cdFx0fVxuXHRcdGlmIChjb25zb2xlLmVycm9yID09PSB3cmFwcGVycy5lcnJvcikge1xuXHRcdFx0Y29uc29sZS5lcnJvciA9IG9yaWdpbmFsQ29uc29sZU1ldGhvZHMuZXJyb3I7XG5cdFx0fVxuXHRcdGlmIChjb25zb2xlLmluZm8gPT09IHdyYXBwZXJzLmluZm8pIHtcblx0XHRcdGNvbnNvbGUuaW5mbyA9IG9yaWdpbmFsQ29uc29sZU1ldGhvZHMuaW5mbztcblx0XHR9XG5cdFx0aWYgKGNvbnNvbGUubG9nID09PSB3cmFwcGVycy5sb2cpIHtcblx0XHRcdGNvbnNvbGUubG9nID0gb3JpZ2luYWxDb25zb2xlTWV0aG9kcy5sb2c7XG5cdFx0fVxuXHRcdGlmIChjb25zb2xlLndhcm4gPT09IHdyYXBwZXJzLndhcm4pIHtcblx0XHRcdGNvbnNvbGUud2FybiA9IG9yaWdpbmFsQ29uc29sZU1ldGhvZHMud2Fybjtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0KGFyZ3M6IGFueSwgdmVyYm9zZTogYm9vbGVhbiA9IGZhbHNlKTogc3RyaW5nIHtcblx0bGV0IHJlc3VsdCA9ICcnO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYXJncy5sZW5ndGg7IGkrKykge1xuXHRcdGxldCBhID0gYXJnc1tpXTtcblxuXHRcdGlmIChhIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdGEgPSB0b0Vycm9yTWVzc2FnZShhLCB2ZXJib3NlKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGEgPT09ICdvYmplY3QnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhID0gSlNPTi5zdHJpbmdpZnkoYSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7IH1cblx0XHR9XG5cblx0XHRyZXN1bHQgKz0gKGkgPiAwID8gJyAnIDogJycpICsgYTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCB0eXBlIExvZ2dlckdyb3VwID0ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElMb2dTZXJ2aWNlIGV4dGVuZHMgSUxvZ2dlciB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTG9nZ2VyT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIElkIG9mIHRoZSBsb2dnZXIuXG5cdCAqL1xuXHRpZD86IHN0cmluZztcblxuXHQvKipcblx0ICogTmFtZSBvZiB0aGUgbG9nZ2VyLlxuXHQgKi9cblx0bmFtZT86IHN0cmluZztcblxuXHQvKipcblx0ICogRG8gbm90IGNyZWF0ZSByb3RhdGluZyBmaWxlcyBpZiBtYXggc2l6ZSBleGNlZWRzLlxuXHQgKi9cblx0ZG9ub3RSb3RhdGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBEbyBub3QgdXNlIGZvcm1hdHRlcnMuXG5cdCAqL1xuXHRkb25vdFVzZUZvcm1hdHRlcnM/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHRvIGxvZy4gU2V0IHRvIGBhbHdheXNgIHRvIGxvZyBhbHdheXMuXG5cdCAqL1xuXHRsb2dMZXZlbD86ICdhbHdheXMnIHwgTG9nTGV2ZWw7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGxvZyBzaG91bGQgYmUgaGlkZGVuIGZyb20gdGhlIHVzZXIuXG5cdCAqL1xuXHRoaWRkZW4/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIHNob3cgdGhpcyBsb2dnZXJcblx0ICovXG5cdHdoZW4/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIElkIG9mIHRoZSBleHRlbnNpb24gdGhhdCBjcmVhdGVkIHRoaXMgbG9nZ2VyLlxuXHQgKi9cblx0ZXh0ZW5zaW9uSWQ/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIEdyb3VwIG9mIHRoZSBsb2dnZXIuXG5cdCAqL1xuXHRncm91cD86IExvZ2dlckdyb3VwO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMb2dnZXJSZXNvdXJjZSB7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxvZ0xldmVsPzogTG9nTGV2ZWw7XG5cdHJlYWRvbmx5IGhpZGRlbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdoZW4/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBncm91cD86IExvZ2dlckdyb3VwO1xufVxuXG5leHBvcnQgdHlwZSBEaWRDaGFuZ2VMb2dnZXJzRXZlbnQgPSB7XG5cdHJlYWRvbmx5IGFkZGVkOiBJdGVyYWJsZTxJTG9nZ2VyUmVzb3VyY2U+O1xuXHRyZWFkb25seSByZW1vdmVkOiBJdGVyYWJsZTxJTG9nZ2VyUmVzb3VyY2U+O1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJTG9nZ2VyU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbG9nZ2VyIGZvciB0aGUgZ2l2ZW4gcmVzb3VyY2UsIG9yIGdldHMgb25lIGlmIGl0IGFscmVhZHkgZXhpc3RzLlxuXHQgKlxuXHQgKiBUaGlzIHdpbGwgYWxzbyByZWdpc3RlciB0aGUgbG9nZ2VyIHdpdGggdGhlIGxvZ2dlciBzZXJ2aWNlLlxuXHQgKi9cblx0Y3JlYXRlTG9nZ2VyKHJlc291cmNlOiBVUkksIG9wdGlvbnM/OiBJTG9nZ2VyT3B0aW9ucyk6IElMb2dnZXI7XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBsb2dnZXIgd2l0aCB0aGUgZ2l2ZW4gaWQgaW4gdGhlIGxvZ3MgZm9sZGVyLCBvciBnZXRzIG9uZSBpZiBpdCBhbHJlYWR5IGV4aXN0cy5cblx0ICpcblx0ICogVGhpcyB3aWxsIGFsc28gcmVnaXN0ZXIgdGhlIGxvZ2dlciB3aXRoIHRoZSBsb2dnZXIgc2VydmljZS5cblx0ICovXG5cdGNyZWF0ZUxvZ2dlcihpZDogc3RyaW5nLCBvcHRpb25zPzogT21pdDxJTG9nZ2VyT3B0aW9ucywgJ2lkJz4pOiBJTG9nZ2VyO1xuXG5cdC8qKlxuXHQgKiBHZXRzIGFuIGV4aXN0aW5nIGxvZ2dlciwgaWYgYW55LlxuXHQgKi9cblx0Z2V0TG9nZ2VyKHJlc291cmNlT3JJZDogVVJJIHwgc3RyaW5nKTogSUxvZ2dlciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgd2hpY2ggZmlyZXMgd2hlbiB0aGUgbG9nIGxldmVsIG9mIGEgbG9nZ2VyIGhhcyBjaGFuZ2VkXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvZ0xldmVsOiBFdmVudDxMb2dMZXZlbCB8IFtVUkksIExvZ0xldmVsXT47XG5cblx0LyoqXG5cdCAqIFNldCBkZWZhdWx0IGxvZyBsZXZlbC5cblx0ICovXG5cdHNldExvZ0xldmVsKGxldmVsOiBMb2dMZXZlbCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFNldCBsb2cgbGV2ZWwgZm9yIGEgbG9nZ2VyLlxuXHQgKi9cblx0c2V0TG9nTGV2ZWwocmVzb3VyY2U6IFVSSSwgbGV2ZWw6IExvZ0xldmVsKTogdm9pZDtcblxuXHQvKipcblx0ICogR2V0IGxvZyBsZXZlbCBmb3IgYSBsb2dnZXIgb3IgdGhlIGRlZmF1bHQgbG9nIGxldmVsLlxuXHQgKi9cblx0Z2V0TG9nTGV2ZWwocmVzb3VyY2U/OiBVUkkpOiBMb2dMZXZlbDtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgd2hpY2ggZmlyZXMgd2hlbiB0aGUgdmlzaWJpbGl0eSBvZiBhIGxvZ2dlciBoYXMgY2hhbmdlZFxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiBFdmVudDxbVVJJLCBib29sZWFuXT47XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgdmlzaWJpbGl0eSBvZiBhIGxvZ2dlci5cblx0ICovXG5cdHNldFZpc2liaWxpdHkocmVzb3VyY2VPcklkOiBVUkkgfCBzdHJpbmcsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuIHRoZSBsb2dnZXIgcmVzb3VyY2VzIGFyZSBjaGFuZ2VkXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxvZ2dlcnM6IEV2ZW50PERpZENoYW5nZUxvZ2dlcnNFdmVudD47XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgbG9nZ2VyIHdpdGggdGhlIGxvZ2dlciBzZXJ2aWNlLlxuXHQgKlxuXHQgKiBOb3RlIHRoYXQgdGhpcyB3aWxsIG5vdCBjcmVhdGUgYSBsb2dnZXIsIGJ1dCBvbmx5IHJlZ2lzdGVyIGl0LlxuXHQgKlxuXHQgKiBVc2UgYGNyZWF0ZUxvZ2dlcmAgdG8gY3JlYXRlIGEgbG9nZ2VyIGFuZCByZWdpc3RlciBpdC5cblx0ICpcblx0ICogVXNlIGl0IHdoZW4geW91IHdhbnQgdG8gcmVnaXN0ZXIgYSBsb2dnZXIgdGhhdCBpcyBub3QgY3JlYXRlZCBieSB0aGUgbG9nZ2VyIHNlcnZpY2UuXG5cdCAqL1xuXHRyZWdpc3RlckxvZ2dlcihyZXNvdXJjZTogSUxvZ2dlclJlc291cmNlKTogdm9pZDtcblxuXHQvKipcblx0ICogRGVyZWdpc3RlciB0aGUgbG9nZ2VyIGZvciB0aGUgZ2l2ZW4gcmVzb3VyY2UuXG5cdCAqL1xuXHRkZXJlZ2lzdGVyTG9nZ2VyKGlkT3JSZXNvdXJjZTogVVJJIHwgc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogR2V0IGFsbCByZWdpc3RlcmVkIGxvZ2dlcnNcblx0ICovXG5cdGdldFJlZ2lzdGVyZWRMb2dnZXJzKCk6IEl0ZXJhYmxlPElMb2dnZXJSZXNvdXJjZT47XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgcmVnaXN0ZXJlZCBsb2dnZXIgZm9yIHRoZSBnaXZlbiByZXNvdXJjZS5cblx0ICovXG5cdGdldFJlZ2lzdGVyZWRMb2dnZXIocmVzb3VyY2U6IFVSSSk6IElMb2dnZXJSZXNvdXJjZSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0TG9nZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdHByaXZhdGUgbGV2ZWw6IExvZ0xldmVsID0gREVGQVVMVF9MT0dfTEVWRUw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTG9nTGV2ZWw6IEVtaXR0ZXI8TG9nTGV2ZWw+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TG9nTGV2ZWw+KCkpO1xuXHRnZXQgb25EaWRDaGFuZ2VMb2dMZXZlbCgpOiBFdmVudDxMb2dMZXZlbD4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VMb2dMZXZlbC5ldmVudDsgfVxuXG5cdHNldExldmVsKGxldmVsOiBMb2dMZXZlbCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxldmVsICE9PSBsZXZlbCkge1xuXHRcdFx0dGhpcy5sZXZlbCA9IGxldmVsO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMb2dMZXZlbC5maXJlKHRoaXMubGV2ZWwpO1xuXHRcdH1cblx0fVxuXG5cdGdldExldmVsKCk6IExvZ0xldmVsIHtcblx0XHRyZXR1cm4gdGhpcy5sZXZlbDtcblx0fVxuXG5cdHByb3RlY3RlZCBjaGVja0xvZ0xldmVsKGxldmVsOiBMb2dMZXZlbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBjYW5Mb2codGhpcy5sZXZlbCwgbGV2ZWwpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNhbkxvZyhsZXZlbDogTG9nTGV2ZWwpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jaGVja0xvZ0xldmVsKGxldmVsKTtcblx0fVxuXG5cdGFic3RyYWN0IHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcblx0YWJzdHJhY3QgZGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xuXHRhYnN0cmFjdCBpbmZvKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZDtcblx0YWJzdHJhY3Qgd2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQ7XG5cdGFic3RyYWN0IGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkO1xuXHRhYnN0cmFjdCBmbHVzaCgpOiB2b2lkO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RNZXNzYWdlTG9nZ2VyIGV4dGVuZHMgQWJzdHJhY3RMb2dnZXIgaW1wbGVtZW50cyBJTG9nZ2VyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGxvZ0Fsd2F5cz86IGJvb2xlYW4pIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNoZWNrTG9nTGV2ZWwobGV2ZWw6IExvZ0xldmVsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubG9nQWx3YXlzIHx8IHN1cGVyLmNoZWNrTG9nTGV2ZWwobGV2ZWwpO1xuXHR9XG5cblx0dHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuVHJhY2UpKSB7XG5cdFx0XHR0aGlzLmxvZyhMb2dMZXZlbC5UcmFjZSwgZm9ybWF0KFttZXNzYWdlLCAuLi5hcmdzXSwgdHJ1ZSkpO1xuXHRcdH1cblx0fVxuXG5cdGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkRlYnVnKSkge1xuXHRcdFx0dGhpcy5sb2coTG9nTGV2ZWwuRGVidWcsIGZvcm1hdChbbWVzc2FnZSwgLi4uYXJnc10pKTtcblx0XHR9XG5cdH1cblxuXHRpbmZvKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkluZm8pKSB7XG5cdFx0XHR0aGlzLmxvZyhMb2dMZXZlbC5JbmZvLCBmb3JtYXQoW21lc3NhZ2UsIC4uLmFyZ3NdKSk7XG5cdFx0fVxuXHR9XG5cblx0d2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5XYXJuaW5nKSkge1xuXHRcdFx0dGhpcy5sb2coTG9nTGV2ZWwuV2FybmluZywgZm9ybWF0KFttZXNzYWdlLCAuLi5hcmdzXSkpO1xuXHRcdH1cblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuRXJyb3IpKSB7XG5cdFx0XHRpZiAobWVzc2FnZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IGFycmF5ID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcblx0XHRcdFx0YXJyYXlbMF0gPSBtZXNzYWdlLnN0YWNrO1xuXHRcdFx0XHR0aGlzLmxvZyhMb2dMZXZlbC5FcnJvciwgZm9ybWF0KGFycmF5KSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmxvZyhMb2dMZXZlbC5FcnJvciwgZm9ybWF0KFttZXNzYWdlLCAuLi5hcmdzXSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGZsdXNoKCk6IHZvaWQgeyB9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGxvZyhsZXZlbDogTG9nTGV2ZWwsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQ7XG59XG5cblxuZXhwb3J0IGNsYXNzIENvbnNvbGVNYWluTG9nZ2VyIGV4dGVuZHMgQWJzdHJhY3RMb2dnZXIgaW1wbGVtZW50cyBJTG9nZ2VyIHtcblxuXHRwcml2YXRlIHVzZUNvbG9yczogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihsb2dMZXZlbDogTG9nTGV2ZWwgPSBERUZBVUxUX0xPR19MRVZFTCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXRMZXZlbChsb2dMZXZlbCk7XG5cdFx0dGhpcy51c2VDb2xvcnMgPSAhaXNXaW5kb3dzO1xuXHR9XG5cblx0dHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuVHJhY2UpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdsb2cnLCBgXFx4MWJbOTBtW21haW4gJHtub3coKX1dXFx4MWJbMG1gLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgYFttYWluICR7bm93KCl9XWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkRlYnVnKSkge1xuXHRcdFx0aWYgKHRoaXMudXNlQ29sb3JzKSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgYFxceDFiWzkwbVttYWluICR7bm93KCl9XVxceDFiWzBtYCwgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsIGBbbWFpbiAke25vdygpfV1gLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpbmZvKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkluZm8pKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdsb2cnLCBgXFx4MWJbOTBtW21haW4gJHtub3coKX1dXFx4MWJbMG1gLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnbG9nJywgYFttYWluICR7bm93KCl9XWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHdhcm4obWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5XYXJuaW5nKSkge1xuXHRcdFx0aWYgKHRoaXMudXNlQ29sb3JzKSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnd2FybicsIGBcXHgxYls5M21bbWFpbiAke25vdygpfV1cXHgxYlswbWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCd3YXJuJywgYFttYWluICR7bm93KCl9XWAsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkVycm9yKSkge1xuXHRcdFx0aWYgKHRoaXMudXNlQ29sb3JzKSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnZXJyb3InLCBgXFx4MWJbOTFtW21haW4gJHtub3coKX1dXFx4MWJbMG1gLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnZXJyb3InLCBgW21haW4gJHtub3coKX1dYCwgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Zmx1c2goKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIENvbnNvbGVMb2dnZXIgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlciBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdGNvbnN0cnVjdG9yKGxvZ0xldmVsOiBMb2dMZXZlbCA9IERFRkFVTFRfTE9HX0xFVkVMLCBwcml2YXRlIHJlYWRvbmx5IHVzZUNvbG9yczogYm9vbGVhbiA9IHRydWUpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc2V0TGV2ZWwobG9nTGV2ZWwpO1xuXHR9XG5cblx0dHJhY2UobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuVHJhY2UpKSB7XG5cdFx0XHRpZiAodGhpcy51c2VDb2xvcnMpIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdsb2cnLCAnJWNUUkFDRScsICdjb2xvcjogIzg4OCcsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdsb2cnLCBtZXNzYWdlLCAuLi5hcmdzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkZWJ1ZyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5EZWJ1ZykpIHtcblx0XHRcdGlmICh0aGlzLnVzZUNvbG9ycykge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsICclY0RFQlVHJywgJ2JhY2tncm91bmQ6ICNlZWU7IGNvbG9yOiAjODg4JywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuSW5mbykpIHtcblx0XHRcdGlmICh0aGlzLnVzZUNvbG9ycykge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsICclYyBJTkZPJywgJ2NvbG9yOiAjMzNmJywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHdhcm4obWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5XYXJuaW5nKSkge1xuXHRcdFx0aWYgKHRoaXMudXNlQ29sb3JzKSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnd2FybicsICclYyBXQVJOJywgJ2NvbG9yOiAjOTkzJywgbWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2dUb0NvbnNvbGUoJ2xvZycsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkVycm9yKSkge1xuXHRcdFx0aWYgKHRoaXMudXNlQ29sb3JzKSB7XG5cdFx0XHRcdGxvZ1RvQ29uc29sZSgnZXJyb3InLCAnJWMgIEVSUicsICdjb2xvcjogI2YzMycsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bG9nVG9Db25zb2xlKCdlcnJvcicsIG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cblx0Zmx1c2goKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZGFwdGVyTG9nZ2VyIGV4dGVuZHMgQWJzdHJhY3RMb2dnZXIgaW1wbGVtZW50cyBJTG9nZ2VyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IGFkYXB0ZXI6IHsgbG9nOiAobG9nTGV2ZWw6IExvZ0xldmVsLCBhcmdzOiBhbnlbXSkgPT4gdm9pZCB9LCBsb2dMZXZlbDogTG9nTGV2ZWwgPSBERUZBVUxUX0xPR19MRVZFTCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXRMZXZlbChsb2dMZXZlbCk7XG5cdH1cblxuXHR0cmFjZShtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNhbkxvZyhMb2dMZXZlbC5UcmFjZSkpIHtcblx0XHRcdHRoaXMuYWRhcHRlci5sb2coTG9nTGV2ZWwuVHJhY2UsIFt0aGlzLmV4dHJhY3RNZXNzYWdlKG1lc3NhZ2UpLCAuLi5hcmdzXSk7XG5cdFx0fVxuXHR9XG5cblx0ZGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuRGVidWcpKSB7XG5cdFx0XHR0aGlzLmFkYXB0ZXIubG9nKExvZ0xldmVsLkRlYnVnLCBbdGhpcy5leHRyYWN0TWVzc2FnZShtZXNzYWdlKSwgLi4uYXJnc10pO1xuXHRcdH1cblx0fVxuXG5cdGluZm8obWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuSW5mbykpIHtcblx0XHRcdHRoaXMuYWRhcHRlci5sb2coTG9nTGV2ZWwuSW5mbywgW3RoaXMuZXh0cmFjdE1lc3NhZ2UobWVzc2FnZSksIC4uLmFyZ3NdKTtcblx0XHR9XG5cdH1cblxuXHR3YXJuKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jYW5Mb2coTG9nTGV2ZWwuV2FybmluZykpIHtcblx0XHRcdHRoaXMuYWRhcHRlci5sb2coTG9nTGV2ZWwuV2FybmluZywgW3RoaXMuZXh0cmFjdE1lc3NhZ2UobWVzc2FnZSksIC4uLmFyZ3NdKTtcblx0XHR9XG5cdH1cblxuXHRlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2FuTG9nKExvZ0xldmVsLkVycm9yKSkge1xuXHRcdFx0dGhpcy5hZGFwdGVyLmxvZyhMb2dMZXZlbC5FcnJvciwgW3RoaXMuZXh0cmFjdE1lc3NhZ2UobWVzc2FnZSksIC4uLmFyZ3NdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGV4dHJhY3RNZXNzYWdlKG1zZzogc3RyaW5nIHwgRXJyb3IpOiBzdHJpbmcge1xuXHRcdGlmICh0eXBlb2YgbXNnID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIG1zZztcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9FcnJvck1lc3NhZ2UobXNnLCB0aGlzLmNhbkxvZyhMb2dMZXZlbC5UcmFjZSkpO1xuXHR9XG5cblx0Zmx1c2goKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNdWx0aXBsZXhMb2dnZXIgZXh0ZW5kcyBBYnN0cmFjdExvZ2dlciBpbXBsZW1lbnRzIElMb2dnZXIge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyczogUmVhZG9ubHlBcnJheTxJTG9nZ2VyPikge1xuXHRcdHN1cGVyKCk7XG5cdFx0aWYgKGxvZ2dlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnNldExldmVsKGxvZ2dlcnNbMF0uZ2V0TGV2ZWwoKSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0TGV2ZWwobGV2ZWw6IExvZ0xldmVsKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsb2dnZXIgb2YgdGhpcy5sb2dnZXJzKSB7XG5cdFx0XHRsb2dnZXIuc2V0TGV2ZWwobGV2ZWwpO1xuXHRcdH1cblx0XHRzdXBlci5zZXRMZXZlbChsZXZlbCk7XG5cdH1cblxuXHR0cmFjZShtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbG9nZ2VyIG9mIHRoaXMubG9nZ2Vycykge1xuXHRcdFx0bG9nZ2VyLnRyYWNlKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdH1cblx0fVxuXG5cdGRlYnVnKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBsb2dnZXIgb2YgdGhpcy5sb2dnZXJzKSB7XG5cdFx0XHRsb2dnZXIuZGVidWcobWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0fVxuXHR9XG5cblx0aW5mbyhtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbG9nZ2VyIG9mIHRoaXMubG9nZ2Vycykge1xuXHRcdFx0bG9nZ2VyLmluZm8obWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0fVxuXHR9XG5cblx0d2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbG9nZ2VyIG9mIHRoaXMubG9nZ2Vycykge1xuXHRcdFx0bG9nZ2VyLndhcm4obWVzc2FnZSwgLi4uYXJncyk7XG5cdFx0fVxuXHR9XG5cblx0ZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbG9nZ2VyIG9mIHRoaXMubG9nZ2Vycykge1xuXHRcdFx0bG9nZ2VyLmVycm9yKG1lc3NhZ2UsIC4uLmFyZ3MpO1xuXHRcdH1cblx0fVxuXG5cdGZsdXNoKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbG9nZ2VyIG9mIHRoaXMubG9nZ2Vycykge1xuXHRcdFx0bG9nZ2VyLmZsdXNoKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGxvZ2dlciBvZiB0aGlzLmxvZ2dlcnMpIHtcblx0XHRcdGxvZ2dlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG50eXBlIExvZ2dlckVudHJ5ID0geyBsb2dnZXI6IElMb2dnZXIgfCB1bmRlZmluZWQ7IGluZm86IE11dGFibGU8SUxvZ2dlclJlc291cmNlPiB9O1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RMb2dnZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMb2dnZXJTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJzID0gbmV3IFJlc291cmNlTWFwPExvZ2dlckVudHJ5PigpO1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlTG9nZ2VycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgYWRkZWQ6IElMb2dnZXJSZXNvdXJjZVtdOyByZW1vdmVkOiBJTG9nZ2VyUmVzb3VyY2VbXSB9Pik7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9nZ2VycyA9IHRoaXMuX29uRGlkQ2hhbmdlTG9nZ2Vycy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUxvZ0xldmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TG9nTGV2ZWwgfCBbVVJJLCBMb2dMZXZlbF0+KTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMb2dMZXZlbCA9IHRoaXMuX29uRGlkQ2hhbmdlTG9nTGV2ZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8W1VSSSwgYm9vbGVhbl0+KTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCBsb2dMZXZlbDogTG9nTGV2ZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsb2dzSG9tZTogVVJJLFxuXHRcdGxvZ2dlclJlc291cmNlcz86IEl0ZXJhYmxlPElMb2dnZXJSZXNvdXJjZT4sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0aWYgKGxvZ2dlclJlc291cmNlcykge1xuXHRcdFx0Zm9yIChjb25zdCBsb2dnZXJSZXNvdXJjZSBvZiBsb2dnZXJSZXNvdXJjZXMpIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2Vycy5zZXQobG9nZ2VyUmVzb3VyY2UucmVzb3VyY2UsIHsgbG9nZ2VyOiB1bmRlZmluZWQsIGluZm86IGxvZ2dlclJlc291cmNlIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TG9nZ2VyRW50cnkocmVzb3VyY2VPcklkOiBVUkkgfCBzdHJpbmcpOiBMb2dnZXJFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzU3RyaW5nKHJlc291cmNlT3JJZCkpIHtcblx0XHRcdHJldHVybiBbLi4udGhpcy5fbG9nZ2Vycy52YWx1ZXMoKV0uZmluZChsb2dnZXIgPT4gbG9nZ2VyLmluZm8uaWQgPT09IHJlc291cmNlT3JJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9sb2dnZXJzLmdldChyZXNvdXJjZU9ySWQpO1xuXHR9XG5cblx0Z2V0TG9nZ2VyKHJlc291cmNlT3JJZDogVVJJIHwgc3RyaW5nKTogSUxvZ2dlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TG9nZ2VyRW50cnkocmVzb3VyY2VPcklkKT8ubG9nZ2VyO1xuXHR9XG5cblx0Y3JlYXRlTG9nZ2VyKGlkT3JSZXNvdXJjZTogVVJJIHwgc3RyaW5nLCBvcHRpb25zPzogSUxvZ2dlck9wdGlvbnMpOiBJTG9nZ2VyIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudG9SZXNvdXJjZShpZE9yUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGlkID0gaXNTdHJpbmcoaWRPclJlc291cmNlKSA/IGlkT3JSZXNvdXJjZSA6IChvcHRpb25zPy5pZCA/PyBoYXNoKHJlc291cmNlLnRvU3RyaW5nKCkpLnRvU3RyaW5nKDE2KSk7XG5cdFx0bGV0IGxvZ2dlciA9IHRoaXMuX2xvZ2dlcnMuZ2V0KHJlc291cmNlKT8ubG9nZ2VyO1xuXHRcdGNvbnN0IGxvZ0xldmVsID0gb3B0aW9ucz8ubG9nTGV2ZWwgPT09ICdhbHdheXMnID8gTG9nTGV2ZWwuVHJhY2UgOiBvcHRpb25zPy5sb2dMZXZlbDtcblx0XHRpZiAoIWxvZ2dlcikge1xuXHRcdFx0bG9nZ2VyID0gdGhpcy5kb0NyZWF0ZUxvZ2dlcihyZXNvdXJjZSwgbG9nTGV2ZWwgPz8gdGhpcy5nZXRMb2dMZXZlbChyZXNvdXJjZSkgPz8gdGhpcy5sb2dMZXZlbCwgeyAuLi5vcHRpb25zLCBpZCB9KTtcblx0XHR9XG5cdFx0Y29uc3QgbG9nZ2VyRW50cnk6IExvZ2dlckVudHJ5ID0ge1xuXHRcdFx0bG9nZ2VyLFxuXHRcdFx0aW5mbzoge1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0aWQsXG5cdFx0XHRcdGxvZ0xldmVsLFxuXHRcdFx0XHRuYW1lOiBvcHRpb25zPy5uYW1lLFxuXHRcdFx0XHRoaWRkZW46IG9wdGlvbnM/LmhpZGRlbixcblx0XHRcdFx0Z3JvdXA6IG9wdGlvbnM/Lmdyb3VwLFxuXHRcdFx0XHRleHRlbnNpb25JZDogb3B0aW9ucz8uZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdHdoZW46IG9wdGlvbnM/LndoZW5cblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMucmVnaXN0ZXJMb2dnZXIobG9nZ2VyRW50cnkuaW5mbyk7XG5cdFx0Ly8gVE9ETzogQHNhbmR5MDgxIFJlbW92ZSB0aGlzIG9uY2UgcmVnaXN0ZXJMb2dnZXIgY2FuIHRha2UgSUxvZ2dlclxuXHRcdHRoaXMuX2xvZ2dlcnMuc2V0KHJlc291cmNlLCBsb2dnZXJFbnRyeSk7XG5cdFx0cmV0dXJuIGxvZ2dlcjtcblx0fVxuXG5cdHByb3RlY3RlZCB0b1Jlc291cmNlKGlkT3JSZXNvdXJjZTogc3RyaW5nIHwgVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gaXNTdHJpbmcoaWRPclJlc291cmNlKSA/IGpvaW5QYXRoKHRoaXMubG9nc0hvbWUsIGAke2lkT3JSZXNvdXJjZS5yZXBsYWNlKC9bXFxcXC86XFwqXFw/XCI8PlxcfF0vZywgJycpfS5sb2dgKSA6IGlkT3JSZXNvdXJjZTtcblx0fVxuXG5cdHNldExvZ0xldmVsKGxvZ0xldmVsOiBMb2dMZXZlbCk6IHZvaWQ7XG5cdHNldExvZ0xldmVsKHJlc291cmNlOiBVUkksIGxvZ0xldmVsOiBMb2dMZXZlbCk6IHZvaWQ7XG5cdHNldExvZ0xldmVsKGFyZzE6IGFueSwgYXJnMj86IGFueSk6IHZvaWQge1xuXHRcdGlmIChVUkkuaXNVcmkoYXJnMSkpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gYXJnMTtcblx0XHRcdGNvbnN0IGxvZ0xldmVsID0gYXJnMjtcblx0XHRcdGNvbnN0IGxvZ2dlciA9IHRoaXMuX2xvZ2dlcnMuZ2V0KHJlc291cmNlKTtcblx0XHRcdGlmIChsb2dnZXIgJiYgbG9nTGV2ZWwgIT09IGxvZ2dlci5pbmZvLmxvZ0xldmVsKSB7XG5cdFx0XHRcdGxvZ2dlci5pbmZvLmxvZ0xldmVsID0gbG9nTGV2ZWwgPT09IHRoaXMubG9nTGV2ZWwgPyB1bmRlZmluZWQgOiBsb2dMZXZlbDtcblx0XHRcdFx0bG9nZ2VyLmxvZ2dlcj8uc2V0TGV2ZWwobG9nTGV2ZWwpO1xuXHRcdFx0XHR0aGlzLl9sb2dnZXJzLnNldChsb2dnZXIuaW5mby5yZXNvdXJjZSwgbG9nZ2VyKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMb2dMZXZlbC5maXJlKFtyZXNvdXJjZSwgbG9nTGV2ZWxdKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dMZXZlbCA9IGFyZzE7XG5cdFx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgbG9nZ2VyXSBvZiB0aGlzLl9sb2dnZXJzLmVudHJpZXMoKSkge1xuXHRcdFx0XHRpZiAodGhpcy5fbG9nZ2Vycy5nZXQocmVzb3VyY2UpPy5pbmZvLmxvZ0xldmVsID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRsb2dnZXIubG9nZ2VyPy5zZXRMZXZlbCh0aGlzLmxvZ0xldmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMb2dMZXZlbC5maXJlKHRoaXMubG9nTGV2ZWwpO1xuXHRcdH1cblx0fVxuXG5cdHNldFZpc2liaWxpdHkocmVzb3VyY2VPcklkOiBVUkkgfCBzdHJpbmcsIHZpc2liaWxpdHk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBsb2dnZXIgPSB0aGlzLmdldExvZ2dlckVudHJ5KHJlc291cmNlT3JJZCk7XG5cdFx0aWYgKGxvZ2dlciAmJiB2aXNpYmlsaXR5ICE9PSAhbG9nZ2VyLmluZm8uaGlkZGVuKSB7XG5cdFx0XHRsb2dnZXIuaW5mby5oaWRkZW4gPSAhdmlzaWJpbGl0eTtcblx0XHRcdHRoaXMuX2xvZ2dlcnMuc2V0KGxvZ2dlci5pbmZvLnJlc291cmNlLCBsb2dnZXIpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUoW2xvZ2dlci5pbmZvLnJlc291cmNlLCB2aXNpYmlsaXR5XSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TG9nTGV2ZWwocmVzb3VyY2U/OiBVUkkpOiBMb2dMZXZlbCB7XG5cdFx0bGV0IGxvZ0xldmVsO1xuXHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0bG9nTGV2ZWwgPSB0aGlzLl9sb2dnZXJzLmdldChyZXNvdXJjZSk/LmluZm8ubG9nTGV2ZWw7XG5cdFx0fVxuXHRcdHJldHVybiBsb2dMZXZlbCA/PyB0aGlzLmxvZ0xldmVsO1xuXHR9XG5cblx0cmVnaXN0ZXJMb2dnZXIocmVzb3VyY2U6IElMb2dnZXJSZXNvdXJjZSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fbG9nZ2Vycy5nZXQocmVzb3VyY2UucmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0aWYgKGV4aXN0aW5nLmluZm8uaGlkZGVuICE9PSByZXNvdXJjZS5oaWRkZW4pIHtcblx0XHRcdFx0dGhpcy5zZXRWaXNpYmlsaXR5KHJlc291cmNlLnJlc291cmNlLCAhcmVzb3VyY2UuaGlkZGVuKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nZ2Vycy5zZXQocmVzb3VyY2UucmVzb3VyY2UsIHsgaW5mbzogcmVzb3VyY2UsIGxvZ2dlcjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMb2dnZXJzLmZpcmUoeyBhZGRlZDogW3Jlc291cmNlXSwgcmVtb3ZlZDogW10gfSk7XG5cdFx0fVxuXHR9XG5cblx0ZGVyZWdpc3RlckxvZ2dlcihpZE9yUmVzb3VyY2U6IFVSSSB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy50b1Jlc291cmNlKGlkT3JSZXNvdXJjZSk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9sb2dnZXJzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRpZiAoZXhpc3RpbmcubG9nZ2VyKSB7XG5cdFx0XHRcdGV4aXN0aW5nLmxvZ2dlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dnZXJzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxvZ2dlcnMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW2V4aXN0aW5nLmluZm9dIH0pO1xuXHRcdH1cblx0fVxuXG5cdCpnZXRSZWdpc3RlcmVkTG9nZ2VycygpOiBJdGVyYWJsZTxJTG9nZ2VyUmVzb3VyY2U+IHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2xvZ2dlcnMudmFsdWVzKCkpIHtcblx0XHRcdHlpZWxkIGVudHJ5LmluZm87XG5cdFx0fVxuXHR9XG5cblx0Z2V0UmVnaXN0ZXJlZExvZ2dlcihyZXNvdXJjZTogVVJJKTogSUxvZ2dlclJlc291cmNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbG9nZ2Vycy5nZXQocmVzb3VyY2UpPy5pbmZvO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXJzLmZvckVhY2gobG9nZ2VyID0+IGxvZ2dlci5sb2dnZXI/LmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5fbG9nZ2Vycy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBkb0NyZWF0ZUxvZ2dlcihyZXNvdXJjZTogVVJJLCBsb2dMZXZlbDogTG9nTGV2ZWwsIG9wdGlvbnM/OiBJTG9nZ2VyT3B0aW9ucyk6IElMb2dnZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBOdWxsTG9nZ2VyIGltcGxlbWVudHMgSUxvZ2dlciB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTG9nTGV2ZWw6IEV2ZW50PExvZ0xldmVsPiA9IG5ldyBFbWl0dGVyPExvZ0xldmVsPigpLmV2ZW50O1xuXHRzZXRMZXZlbChsZXZlbDogTG9nTGV2ZWwpOiB2b2lkIHsgfVxuXHRnZXRMZXZlbCgpOiBMb2dMZXZlbCB7IHJldHVybiBMb2dMZXZlbC5JbmZvOyB9XG5cdHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7IH1cblx0ZGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHsgfVxuXHRpbmZvKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7IH1cblx0d2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQgeyB9XG5cdGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHsgfVxuXHRjcml0aWNhbChtZXNzYWdlOiBzdHJpbmcgfCBFcnJvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7IH1cblx0ZGlzcG9zZSgpOiB2b2lkIHsgfVxuXHRmbHVzaCgpOiB2b2lkIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgTnVsbExvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nZ2VyIGltcGxlbWVudHMgSUxvZ1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIE51bGxMb2dnZXJTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RMb2dnZXJTZXJ2aWNlIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoTG9nTGV2ZWwuT2ZmLCBVUkkucGFyc2UoJ2xvZzovLy9sb2cnKSk7XG5cdH1cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGRvQ3JlYXRlTG9nZ2VyKHJlc291cmNlOiBVUkksIGxvZ0xldmVsOiBMb2dMZXZlbCwgb3B0aW9ucz86IElMb2dnZXJPcHRpb25zKTogSUxvZ2dlciB7XG5cdFx0cmV0dXJuIG5ldyBOdWxsTG9nZ2VyKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldExvZ0xldmVsKGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSk6IExvZ0xldmVsIHtcblx0aWYgKGVudmlyb25tZW50U2VydmljZS52ZXJib3NlKSB7XG5cdFx0cmV0dXJuIExvZ0xldmVsLlRyYWNlO1xuXHR9XG5cdGlmICh0eXBlb2YgZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ0xldmVsID09PSAnc3RyaW5nJykge1xuXHRcdGNvbnN0IGxvZ0xldmVsID0gcGFyc2VMb2dMZXZlbChlbnZpcm9ubWVudFNlcnZpY2UubG9nTGV2ZWwudG9Mb3dlckNhc2UoKSk7XG5cdFx0aWYgKGxvZ0xldmVsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBsb2dMZXZlbDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIERFRkFVTFRfTE9HX0xFVkVMO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gTG9nTGV2ZWxUb1N0cmluZyhsb2dMZXZlbDogTG9nTGV2ZWwpOiBzdHJpbmcge1xuXHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0Y2FzZSBMb2dMZXZlbC5UcmFjZTogcmV0dXJuICd0cmFjZSc7XG5cdFx0Y2FzZSBMb2dMZXZlbC5EZWJ1ZzogcmV0dXJuICdkZWJ1Zyc7XG5cdFx0Y2FzZSBMb2dMZXZlbC5JbmZvOiByZXR1cm4gJ2luZm8nO1xuXHRcdGNhc2UgTG9nTGV2ZWwuV2FybmluZzogcmV0dXJuICd3YXJuJztcblx0XHRjYXNlIExvZ0xldmVsLkVycm9yOiByZXR1cm4gJ2Vycm9yJztcblx0XHRjYXNlIExvZ0xldmVsLk9mZjogcmV0dXJuICdvZmYnO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBMb2dMZXZlbFRvTG9jYWxpemVkU3RyaW5nKGxvZ0xldmVsOiBMb2dMZXZlbCk6IElMb2NhbGl6ZWRTdHJpbmcge1xuXHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0Y2FzZSBMb2dMZXZlbC5UcmFjZTogcmV0dXJuIHsgb3JpZ2luYWw6ICdUcmFjZScsIHZhbHVlOiBubHMubG9jYWxpemUoJ3RyYWNlJywgXCJUcmFjZVwiKSB9O1xuXHRcdGNhc2UgTG9nTGV2ZWwuRGVidWc6IHJldHVybiB7IG9yaWdpbmFsOiAnRGVidWcnLCB2YWx1ZTogbmxzLmxvY2FsaXplKCdkZWJ1ZycsIFwiRGVidWdcIikgfTtcblx0XHRjYXNlIExvZ0xldmVsLkluZm86IHJldHVybiB7IG9yaWdpbmFsOiAnSW5mbycsIHZhbHVlOiBubHMubG9jYWxpemUoJ2luZm8nLCBcIkluZm9cIikgfTtcblx0XHRjYXNlIExvZ0xldmVsLldhcm5pbmc6IHJldHVybiB7IG9yaWdpbmFsOiAnV2FybmluZycsIHZhbHVlOiBubHMubG9jYWxpemUoJ3dhcm4nLCBcIldhcm5pbmdcIikgfTtcblx0XHRjYXNlIExvZ0xldmVsLkVycm9yOiByZXR1cm4geyBvcmlnaW5hbDogJ0Vycm9yJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnZXJyb3InLCBcIkVycm9yXCIpIH07XG5cdFx0Y2FzZSBMb2dMZXZlbC5PZmY6IHJldHVybiB7IG9yaWdpbmFsOiAnT2ZmJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnb2ZmJywgXCJPZmZcIikgfTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VMb2dMZXZlbChsb2dMZXZlbDogc3RyaW5nKTogTG9nTGV2ZWwgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKGxvZ0xldmVsKSB7XG5cdFx0Y2FzZSAndHJhY2UnOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLlRyYWNlO1xuXHRcdGNhc2UgJ2RlYnVnJzpcblx0XHRcdHJldHVybiBMb2dMZXZlbC5EZWJ1Zztcblx0XHRjYXNlICdpbmZvJzpcblx0XHRcdHJldHVybiBMb2dMZXZlbC5JbmZvO1xuXHRcdGNhc2UgJ3dhcm4nOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLldhcm5pbmc7XG5cdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLkVycm9yO1xuXHRcdGNhc2UgJ2NyaXRpY2FsJzpcblx0XHRcdHJldHVybiBMb2dMZXZlbC5FcnJvcjtcblx0XHRjYXNlICdvZmYnOlxuXHRcdFx0cmV0dXJuIExvZ0xldmVsLk9mZjtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vLyBDb250ZXh0c1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfTE9HX0xFVkVMID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignbG9nTGV2ZWwnLCBMb2dMZXZlbFRvU3RyaW5nKExvZ0xldmVsLkluZm8pKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixTQUFrQixVQUFVLGdCQUFnQjtBQUM1QyxTQUFTLFdBQVc7QUFFcEIsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyx1QkFBdUI7QUFFekIsTUFBTSxjQUFjLGdCQUE2QixZQUFZO0FBQzdELE1BQU0saUJBQWlCLGdCQUFnQyxlQUFlO0FBRTdFLFNBQVMsTUFBYztBQUN0QixVQUFPLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQy9CO0FBRU8sU0FBUyxXQUFXLE9BQW1DO0FBQzdELFNBQU8sU0FBUyxL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Q3hFLFFBQUksYUFBYSxRQUFXO0FBQzNCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUVPLFNBQVMsaUJBQWlCLFVBQTRCO0FBQzVELFVBQVEsVUFBVTtBQUFBLElBQ2pCLEtBQUs7QUFBZ0IsYUFBTztBQUFBLElBQzVCLEtBQUs7QUFBZ0IsYUFBTztBQUFBLElBQzVCLEtBQUs7QUFBZSxhQUFPO0FBQUEsSUFDM0IsS0FBSztBQUFrQixhQUFPO0FBQUEsSUFDOUIsS0FBSztBQUFnQixhQUFPO0FBQUEsSUFDNUIsS0FBSztBQUFjLGFBQU87QUFBQSxFQUMzQjtBQUNEO0FBRU8sU0FBUywwQkFBMEIsVUFBc0M7QUFDL0UsVUFBUSxVQUFVO0FBQUEsSUFDakIsS0FBSztBQUFnQixhQUFPLEVBQUUsVUFBVSxTQUFTLE9BQU8sSUFBSSxTQUFTLFNBQVMsT0FBTyxFQUFFO0FBQUEsSUFDdkYsS0FBSztBQUFnQixhQUFPLEVBQUUsVUFBVSxTQUFTLE9BQU8sSUFBSSxTQUFTLFNBQVMsT0FBTyxFQUFFO0FBQUEsSUFDdkYsS0FBSztBQUFlLGFBQU8sRUFBRSxVQUFVLFFBQVEsT0FBTyxJQUFJLFNBQVMsUUFBUSxNQUFNLEVBQUU7QUFBQSxJQUNuRixLQUFLO0FBQWtCLGFBQU8sRUFBRSxVQUFVLFdBQVcsT0FBTyxJQUFJLFNBQVMsUUFBUSxTQUFTLEVBQUU7QUFBQSxJQUM1RixLQUFLO0FBQWdCLGFBQU8sRUFBRSxVQUFVLFNBQVMsT0FBTyxJQUFJLFNBQVMsU0FBUyxPQUFPLEVBQUU7QUFBQSxJQUN2RixLQUFLO0FBQWMsYUFBTyxFQUFFLFVBQVUsT0FBTyxPQUFPLElBQUksU0FBUyxPQUFPLEtBQUssRUFBRTtBQUFBLEVBQ2hGO0FBQ0Q7QUFFTyxTQUFTLGNBQWMsVUFBd0M7QUFDckUsVUFBUSxVQUFVO0FBQUEsSUFDakIsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxJQUNSLEtBQUs7QUFDSixhQUFPO0FBQUEsSUFDUixLQUFLO0FBQ0osYUFBTztBQUFBLElBQ1IsS0FBSztBQUNKLGFBQU87QUFBQSxFQUNUO0FBQ0EsU0FBTztBQUNSO0FBR08sTUFBTSxvQkFBb0IsSUFBSSxjQUFzQixZQUFZLGlCQUFpQixZQUFhLENBQUM7IiwKICAibmFtZXMiOiBbIkxvZ0xldmVsIl0KfQo=
