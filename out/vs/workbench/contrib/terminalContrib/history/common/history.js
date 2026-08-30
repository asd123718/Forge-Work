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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { LRUCache } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { join } from "../../../../../base/common/path.js";
import { isWindows, OperatingSystem } from "../../../../../base/common/platform.js";
import { env } from "../../../../../base/common/process.js";
import { isNumber } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { FileOperationError, FileOperationResult, IFileService } from "../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { GeneralShellType, PosixShellType } from "../../../../../platform/terminal/common/terminal.js";
import { IRemoteAgentService } from "../../../../services/remote/common/remoteAgentService.js";
import { TerminalHistorySettingId } from "./terminal.history.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["DefaultHistoryLimit"] = 100] = "DefaultHistoryLimit";
  return Constants2;
})(Constants || {});
var StorageKeys = /* @__PURE__ */ ((StorageKeys2) => {
  StorageKeys2["Entries"] = "terminal.history.entries";
  StorageKeys2["Timestamp"] = "terminal.history.timestamp";
  return StorageKeys2;
})(StorageKeys || {});
let directoryHistory = void 0;
function getDirectoryHistory(accessor) {
  if (!directoryHistory) {
    directoryHistory = accessor.get(IInstantiationService).createInstance(TerminalPersistedHistory, "dirs");
  }
  return directoryHistory;
}
let commandHistory = void 0;
function getCommandHistory(accessor) {
  if (!commandHistory) {
    commandHistory = accessor.get(IInstantiationService).createInstance(TerminalPersistedHistory, "commands");
  }
  return commandHistory;
}
let TerminalPersistedHistory = class extends Disposable {
  constructor(_storageDataKey, _configurationService, _storageService) {
    super();
    this._storageDataKey = _storageDataKey;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._timestamp = 0;
    this._isReady = false;
    this._isStale = true;
    this._entries = new LRUCache(this._getHistoryLimit());
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalHistorySettingId.ShellIntegrationCommandHistory)) {
        this._entries.limit = this._getHistoryLimit();
      }
    }));
    this._register(this._storageService.onDidChangeValue(StorageScope.APPLICATION, this._getTimestampStorageKey(), this._store)(() => {
      if (!this._isStale) {
        this._isStale = this._storageService.getNumber(this._getTimestampStorageKey(), StorageScope.APPLICATION, 0) !== this._timestamp;
      }
    }));
  }
  get entries() {
    this._ensureUpToDate();
    return this._entries.entries();
  }
  add(key, value) {
    this._ensureUpToDate();
    this._entries.set(key, value);
    this._saveState();
  }
  remove(key) {
    this._ensureUpToDate();
    this._entries.delete(key);
    this._saveState();
  }
  clear() {
    this._ensureUpToDate();
    this._entries.clear();
    this._saveState();
  }
  _ensureUpToDate() {
    if (!this._isReady) {
      this._loadState();
      this._isReady = true;
    }
    if (this._isStale) {
      this._entries.clear();
      this._loadState();
      this._isStale = false;
    }
  }
  _loadState() {
    this._timestamp = this._storageService.getNumber(this._getTimestampStorageKey(), StorageScope.APPLICATION, 0);
    const serialized = this._loadPersistedState();
    if (serialized) {
      for (const entry of serialized.entries) {
        this._entries.set(entry.key, entry.value);
      }
    }
  }
  _loadPersistedState() {
    const raw = this._storageService.get(this._getEntriesStorageKey(), StorageScope.APPLICATION);
    if (raw === void 0 || raw.length === 0) {
      return void 0;
    }
    let serialized = void 0;
    try {
      serialized = JSON.parse(raw);
    } catch {
      return void 0;
    }
    return serialized;
  }
  _saveState() {
    const serialized = { entries: [] };
    this._entries.forEach((value, key) => serialized.entries.push({ key, value }));
    this._storageService.store(this._getEntriesStorageKey(), JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
    this._timestamp = Date.now();
    this._storageService.store(this._getTimestampStorageKey(), this._timestamp, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  _getHistoryLimit() {
    const historyLimit = this._configurationService.getValue(TerminalHistorySettingId.ShellIntegrationCommandHistory);
    return isNumber(historyLimit) ? historyLimit : 100 /* DefaultHistoryLimit */;
  }
  _getTimestampStorageKey() {
    return `${"terminal.history.timestamp" /* Timestamp */}.${this._storageDataKey}`;
  }
  _getEntriesStorageKey() {
    return `${"terminal.history.entries" /* Entries */}.${this._storageDataKey}`;
  }
};
TerminalPersistedHistory = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IStorageService)
], TerminalPersistedHistory);
const shellFileHistory = /* @__PURE__ */ new Map();
async function getShellFileHistory(accessor, shellType) {
  const cached = shellFileHistory.get(shellType);
  if (cached === null) {
    return void 0;
  }
  if (cached !== void 0) {
    return cached;
  }
  let result;
  switch (shellType) {
    case PosixShellType.Bash:
      result = await fetchBashHistory(accessor);
      break;
    case GeneralShellType.PowerShell:
      result = await fetchPwshHistory(accessor);
      break;
    case PosixShellType.Zsh:
      result = await fetchZshHistory(accessor);
      break;
    case PosixShellType.Fish:
      result = await fetchFishHistory(accessor);
      break;
    case GeneralShellType.Python:
      result = await fetchPythonHistory(accessor);
      break;
    default:
      return void 0;
  }
  if (result === void 0) {
    shellFileHistory.set(shellType, null);
    return void 0;
  }
  shellFileHistory.set(shellType, result);
  return result;
}
function clearShellFileHistory() {
  shellFileHistory.clear();
}
async function fetchBashHistory(accessor) {
  const fileService = accessor.get(IFileService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  const remoteEnvironment = await remoteAgentService.getEnvironment();
  if (remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows) {
    return void 0;
  }
  const sourceLabel = "~/.bash_history";
  const home = remoteEnvironment?.userHome?.fsPath ?? env["HOME"];
  const resolvedFile = await fetchFileContents(home, ".bash_history", false, fileService, remoteAgentService);
  if (resolvedFile === void 0) {
    return void 0;
  }
  const fileLines = resolvedFile.content.split("\n");
  const result = /* @__PURE__ */ new Set();
  let currentLine;
  let currentCommand = void 0;
  let wrapChar = void 0;
  for (let i = 0; i < fileLines.length; i++) {
    currentLine = fileLines[i];
    if (currentCommand === void 0) {
      currentCommand = currentLine;
    } else {
      currentCommand += `
${currentLine}`;
    }
    for (let c = 0; c < currentLine.length; c++) {
      if (wrapChar) {
        if (currentLine[c] === wrapChar) {
          wrapChar = void 0;
        }
      } else {
        if (currentLine[c].match(/['"]/)) {
          wrapChar = currentLine[c];
        }
      }
    }
    if (wrapChar === void 0) {
      if (currentCommand.length > 0) {
        result.add(currentCommand.trim());
      }
      currentCommand = void 0;
    }
  }
  return {
    sourceLabel,
    sourceResource: resolvedFile.resource,
    commands: Array.from(result.values())
  };
}
async function fetchZshHistory(accessor) {
  const fileService = accessor.get(IFileService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  const remoteEnvironment = await remoteAgentService.getEnvironment();
  if (remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows) {
    return void 0;
  }
  const sourceLabel = "~/.zsh_history";
  const home = remoteEnvironment?.userHome?.fsPath ?? env["HOME"];
  const resolvedFile = await fetchFileContents(home, ".zsh_history", false, fileService, remoteAgentService);
  if (resolvedFile === void 0) {
    return void 0;
  }
  const isExtendedHistory = /^:\s\d+:\d+;/.test(resolvedFile.content);
  const fileLines = resolvedFile.content.split(isExtendedHistory ? /\:\s\d+\:\d+;/ : /(?<!\\)\n/);
  const result = /* @__PURE__ */ new Set();
  for (let i = 0; i < fileLines.length; i++) {
    const sanitized = fileLines[i].replace(/\\\n/g, "\n").trim();
    if (sanitized.length > 0) {
      result.add(sanitized);
    }
  }
  return {
    sourceLabel,
    sourceResource: resolvedFile.resource,
    commands: Array.from(result.values())
  };
}
async function fetchPythonHistory(accessor) {
  const fileService = accessor.get(IFileService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  const remoteEnvironment = await remoteAgentService.getEnvironment();
  const sourceLabel = "~/.python_history";
  const home = remoteEnvironment?.userHome?.fsPath ?? env["HOME"];
  const resolvedFile = await fetchFileContents(home, ".python_history", false, fileService, remoteAgentService);
  if (resolvedFile === void 0) {
    return void 0;
  }
  const fileLines = resolvedFile.content.split("\n");
  const result = /* @__PURE__ */ new Set();
  fileLines.forEach((line) => {
    if (line.trim().length > 0) {
      result.add(line.trim());
    }
  });
  return {
    sourceLabel,
    sourceResource: resolvedFile.resource,
    commands: Array.from(result.values())
  };
}
async function fetchPwshHistory(accessor) {
  const fileService = accessor.get(IFileService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  let folderPrefix;
  let filePath;
  const remoteEnvironment = await remoteAgentService.getEnvironment();
  const isFileWindows = remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows;
  let sourceLabel;
  if (isFileWindows) {
    folderPrefix = env["APPDATA"];
    filePath = "Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt";
    sourceLabel = `$APPDATA\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt`;
  } else {
    folderPrefix = remoteEnvironment?.userHome?.fsPath ?? env["HOME"];
    filePath = ".local/share/powershell/PSReadline/ConsoleHost_history.txt";
    sourceLabel = `~/${filePath}`;
  }
  const resolvedFile = await fetchFileContents(folderPrefix, filePath, isFileWindows, fileService, remoteAgentService);
  if (resolvedFile === void 0) {
    return void 0;
  }
  const fileLines = resolvedFile.content.split("\n");
  const result = /* @__PURE__ */ new Set();
  let currentLine;
  let currentCommand = void 0;
  let wrapChar = void 0;
  for (let i = 0; i < fileLines.length; i++) {
    currentLine = fileLines[i];
    if (currentCommand === void 0) {
      currentCommand = currentLine;
    } else {
      currentCommand += `
${currentLine}`;
    }
    if (!currentLine.endsWith("`")) {
      const sanitized = currentCommand.trim();
      if (sanitized.length > 0) {
        result.add(sanitized);
      }
      currentCommand = void 0;
      continue;
    }
    for (let c = 0; c < currentLine.length; c++) {
      if (wrapChar) {
        if (currentLine[c] === wrapChar) {
          wrapChar = void 0;
        }
      } else {
        if (currentLine[c].match(/`/)) {
          wrapChar = currentLine[c];
        }
      }
    }
    if (!wrapChar) {
      const sanitized = currentCommand.trim();
      if (sanitized.length > 0) {
        result.add(sanitized);
      }
      currentCommand = void 0;
    } else {
      currentCommand = currentCommand.replace(/`$/, "");
      wrapChar = void 0;
    }
  }
  return {
    sourceLabel,
    sourceResource: resolvedFile.resource,
    commands: Array.from(result.values())
  };
}
async function fetchFishHistory(accessor) {
  const fileService = accessor.get(IFileService);
  const remoteAgentService = accessor.get(IRemoteAgentService);
  const remoteEnvironment = await remoteAgentService.getEnvironment();
  if (remoteEnvironment?.os === OperatingSystem.Windows || !remoteEnvironment && isWindows) {
    return void 0;
  }
  const overridenDataHome = env["XDG_DATA_HOME"];
  let folderPrefix;
  let filePath;
  let sourceLabel;
  if (overridenDataHome) {
    sourceLabel = "$XDG_DATA_HOME/fish/fish_history";
    folderPrefix = env["XDG_DATA_HOME"];
    filePath = "fish/fish_history";
  } else {
    sourceLabel = "~/.local/share/fish/fish_history";
    folderPrefix = remoteEnvironment?.userHome?.fsPath ?? env["HOME"];
    filePath = ".local/share/fish/fish_history";
  }
  const resolvedFile = await fetchFileContents(folderPrefix, filePath, false, fileService, remoteAgentService);
  if (resolvedFile === void 0) {
    return void 0;
  }
  const result = /* @__PURE__ */ new Set();
  const cmds = resolvedFile.content.split("\n").filter((x) => x.startsWith("- cmd:")).map((x) => x.substring(6).trimStart());
  for (let i = 0; i < cmds.length; i++) {
    const sanitized = sanitizeFishHistoryCmd(cmds[i]).trim();
    if (sanitized.length > 0) {
      result.add(sanitized);
    }
  }
  return {
    sourceLabel,
    sourceResource: resolvedFile.resource,
    commands: Array.from(result.values())
  };
}
function sanitizeFishHistoryCmd(cmd) {
  return repeatedReplace(/(^|[^\\])((?:\\\\)*)(\\n)/g, cmd, "$1$2\n");
}
function repeatedReplace(pattern, value, replaceValue) {
  let last;
  let current = value;
  while (true) {
    last = current;
    current = current.replace(pattern, replaceValue);
    if (current === last) {
      return current;
    }
  }
}
async function fetchFileContents(folderPrefix, filePath, isFileWindows, fileService, remoteAgentService) {
  if (!folderPrefix) {
    return void 0;
  }
  const connection = remoteAgentService.getConnection();
  const isRemote = !!connection?.remoteAuthority;
  const resource = URI.from({
    scheme: isRemote ? Schemas.vscodeRemote : Schemas.file,
    authority: isRemote ? connection.remoteAuthority : void 0,
    path: URI.file(join(folderPrefix, filePath)).path
  });
  let content;
  try {
    content = await fileService.readFile(resource);
  } catch (e) {
    if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
      return void 0;
    }
    throw e;
  }
  if (content === void 0) {
    return void 0;
  }
  return {
    resource,
    content: content.value.toString()
  };
}
export {
  TerminalPersistedHistory,
  clearShellFileHistory,
  fetchBashHistory,
  fetchFishHistory,
  fetchPwshHistory,
  fetchPythonHistory,
  fetchZshHistory,
  getCommandHistory,
  getDirectoryHistory,
  getShellFileHistory,
  sanitizeFishHistoryCmd
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcaGlzdG9yeVxcY29tbW9uXFxoaXN0b3J5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVudiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlQ29udGVudCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IEdlbmVyYWxTaGVsbFR5cGUsIFBvc2l4U2hlbGxUeXBlLCBUZXJtaW5hbFNoZWxsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxIaXN0b3J5U2V0dGluZ0lkIH0gZnJvbSAnLi90ZXJtaW5hbC5oaXN0b3J5LmpzJztcblxuLyoqXG4gKiBUcmFja3MgYSBsaXN0IG9mIGdlbmVyaWMgZW50cmllcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxQZXJzaXN0ZWRIaXN0b3J5PFQ+IHtcblx0LyoqXG5cdCAqIFRoZSBwZXJzaXN0ZWQgZW50cmllcy5cblx0ICovXG5cdHJlYWRvbmx5IGVudHJpZXM6IEl0ZXJhYmxlSXRlcmF0b3I8W3N0cmluZywgVF0+O1xuXHQvKipcblx0ICogQWRkcyBhbiBlbnRyeS5cblx0ICovXG5cdGFkZChrZXk6IHN0cmluZywgdmFsdWU6IFQpOiB2b2lkO1xuXHQvKipcblx0ICogUmVtb3ZlcyBhbiBlbnRyeS5cblx0ICovXG5cdHJlbW92ZShrZXk6IHN0cmluZyk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBDbGVhcnMgYWxsIGVudHJpZXMuXG5cdCAqL1xuXHRjbGVhcigpOiB2b2lkO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRDYWNoZTxUPiB7XG5cdGVudHJpZXM6IHsga2V5OiBzdHJpbmc7IHZhbHVlOiBUIH1bXTtcbn1cblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHREZWZhdWx0SGlzdG9yeUxpbWl0ID0gMTAwXG59XG5cbmNvbnN0IGVudW0gU3RvcmFnZUtleXMge1xuXHRFbnRyaWVzID0gJ3Rlcm1pbmFsLmhpc3RvcnkuZW50cmllcycsXG5cdFRpbWVzdGFtcCA9ICd0ZXJtaW5hbC5oaXN0b3J5LnRpbWVzdGFtcCdcbn1cblxubGV0IGRpcmVjdG9yeUhpc3Rvcnk6IElUZXJtaW5hbFBlcnNpc3RlZEhpc3Rvcnk8eyByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcgfT4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5leHBvcnQgZnVuY3Rpb24gZ2V0RGlyZWN0b3J5SGlzdG9yeShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElUZXJtaW5hbFBlcnNpc3RlZEhpc3Rvcnk8eyByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcgfT4ge1xuXHRpZiAoIWRpcmVjdG9yeUhpc3RvcnkpIHtcblx0XHRkaXJlY3RvcnlIaXN0b3J5ID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxQZXJzaXN0ZWRIaXN0b3J5LCAnZGlycycpIGFzIFRlcm1pbmFsUGVyc2lzdGVkSGlzdG9yeTx7IHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyB9Pjtcblx0fVxuXHRyZXR1cm4gZGlyZWN0b3J5SGlzdG9yeTtcbn1cblxubGV0IGNvbW1hbmRIaXN0b3J5OiBJVGVybWluYWxQZXJzaXN0ZWRIaXN0b3J5PHsgc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB9PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21tYW5kSGlzdG9yeShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElUZXJtaW5hbFBlcnNpc3RlZEhpc3Rvcnk8eyBzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkIH0+IHtcblx0aWYgKCFjb21tYW5kSGlzdG9yeSkge1xuXHRcdGNvbW1hbmRIaXN0b3J5ID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxQZXJzaXN0ZWRIaXN0b3J5LCAnY29tbWFuZHMnKSBhcyBUZXJtaW5hbFBlcnNpc3RlZEhpc3Rvcnk8eyBzaGVsbFR5cGU6IFRlcm1pbmFsU2hlbGxUeXBlIH0+O1xuXHR9XG5cdHJldHVybiBjb21tYW5kSGlzdG9yeTtcbn1cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsUGVyc2lzdGVkSGlzdG9yeTxUPiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxQZXJzaXN0ZWRIaXN0b3J5PFQ+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllczogTFJVQ2FjaGU8c3RyaW5nLCBUPjtcblx0cHJpdmF0ZSBfdGltZXN0YW1wOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9pc1JlYWR5ID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzU3RhbGUgPSB0cnVlO1xuXG5cdGdldCBlbnRyaWVzKCk6IEl0ZXJhYmxlSXRlcmF0b3I8W3N0cmluZywgVF0+IHtcblx0XHR0aGlzLl9lbnN1cmVVcFRvRGF0ZSgpO1xuXHRcdHJldHVybiB0aGlzLl9lbnRyaWVzLmVudHJpZXMoKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VEYXRhS2V5OiBzdHJpbmcsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIEluaXQgY2FjaGVcblx0XHR0aGlzLl9lbnRyaWVzID0gbmV3IExSVUNhY2hlPHN0cmluZywgVD4odGhpcy5fZ2V0SGlzdG9yeUxpbWl0KCkpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBjb25maWcgY2hhbmdlcyB0byBzZXQgaGlzdG9yeSBsaW1pdFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsSGlzdG9yeVNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uQ29tbWFuZEhpc3RvcnkpKSB7XG5cdFx0XHRcdHRoaXMuX2VudHJpZXMubGltaXQgPSB0aGlzLl9nZXRIaXN0b3J5TGltaXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gY2FjaGUgY2hhbmdlcyBmcm9tIG90aGVyIHdpbmRvd3Ncblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgdGhpcy5fZ2V0VGltZXN0YW1wU3RvcmFnZUtleSgpLCB0aGlzLl9zdG9yZSkoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9pc1N0YWxlKSB7XG5cdFx0XHRcdHRoaXMuX2lzU3RhbGUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXROdW1iZXIodGhpcy5fZ2V0VGltZXN0YW1wU3RvcmFnZUtleSgpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIDApICE9PSB0aGlzLl90aW1lc3RhbXA7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0YWRkKGtleTogc3RyaW5nLCB2YWx1ZTogVCkge1xuXHRcdHRoaXMuX2Vuc3VyZVVwVG9EYXRlKCk7XG5cdFx0dGhpcy5fZW50cmllcy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0dGhpcy5fc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRyZW1vdmUoa2V5OiBzdHJpbmcpIHtcblx0XHR0aGlzLl9lbnN1cmVVcFRvRGF0ZSgpO1xuXHRcdHRoaXMuX2VudHJpZXMuZGVsZXRlKGtleSk7XG5cdFx0dGhpcy5fc2F2ZVN0YXRlKCk7XG5cdH1cblxuXHRjbGVhcigpIHtcblx0XHR0aGlzLl9lbnN1cmVVcFRvRGF0ZSgpO1xuXHRcdHRoaXMuX2VudHJpZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9zYXZlU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVVwVG9EYXRlKCkge1xuXHRcdC8vIEluaXRpYWwgbG9hZFxuXHRcdGlmICghdGhpcy5faXNSZWFkeSkge1xuXHRcdFx0dGhpcy5fbG9hZFN0YXRlKCk7XG5cdFx0XHR0aGlzLl9pc1JlYWR5ID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBSZWFjdCB0byBzdGFsZSBjYWNoZSBjYXVzZWQgYnkgYW5vdGhlciB3aW5kb3dcblx0XHRpZiAodGhpcy5faXNTdGFsZSkge1xuXHRcdFx0Ly8gU2luY2Ugc3RhdGUgaXMgc2F2ZWQgd2hlbmV2ZXIgdGhlIGVudHJpZXMgY2hhbmdlLCBpdCdzIGEgc2FmZSBhc3N1bXB0aW9uIHRoYXQgbm9cblx0XHRcdC8vIG1lcmdpbmcgb2YgZW50cmllcyBuZWVkcyB0byBoYXBwZW4sIGp1c3QgbG9hZGluZyB0aGUgbmV3IHN0YXRlLlxuXHRcdFx0dGhpcy5fZW50cmllcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fbG9hZFN0YXRlKCk7XG5cdFx0XHR0aGlzLl9pc1N0YWxlID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZFN0YXRlKCkge1xuXHRcdHRoaXMuX3RpbWVzdGFtcCA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcih0aGlzLl9nZXRUaW1lc3RhbXBTdG9yYWdlS2V5KCksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgMCk7XG5cblx0XHQvLyBMb2FkIGdsb2JhbCBlbnRyaWVzIHBsdXNcblx0XHRjb25zdCBzZXJpYWxpemVkID0gdGhpcy5fbG9hZFBlcnNpc3RlZFN0YXRlKCk7XG5cdFx0aWYgKHNlcmlhbGl6ZWQpIHtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2Ygc2VyaWFsaXplZC5lbnRyaWVzKSB7XG5cdFx0XHRcdHRoaXMuX2VudHJpZXMuc2V0KGVudHJ5LmtleSwgZW50cnkudmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xvYWRQZXJzaXN0ZWRTdGF0ZSgpOiBJU2VyaWFsaXplZENhY2hlPFQ+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQodGhpcy5fZ2V0RW50cmllc1N0b3JhZ2VLZXkoKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0bGV0IHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkQ2FjaGU8VD4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHNlcmlhbGl6ZWQgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJbnZhbGlkIGRhdGFcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzZXJpYWxpemVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2F2ZVN0YXRlKCkge1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWQ6IElTZXJpYWxpemVkQ2FjaGU8VD4gPSB7IGVudHJpZXM6IFtdIH07XG5cdFx0dGhpcy5fZW50cmllcy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiBzZXJpYWxpemVkLmVudHJpZXMucHVzaCh7IGtleSwgdmFsdWUgfSkpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuX2dldEVudHJpZXNTdG9yYWdlS2V5KCksIEpTT04uc3RyaW5naWZ5KHNlcmlhbGl6ZWQpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5fdGltZXN0YW1wID0gRGF0ZS5ub3coKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSh0aGlzLl9nZXRUaW1lc3RhbXBTdG9yYWdlS2V5KCksIHRoaXMuX3RpbWVzdGFtcCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SGlzdG9yeUxpbWl0KCkge1xuXHRcdGNvbnN0IGhpc3RvcnlMaW1pdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsSGlzdG9yeVNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uQ29tbWFuZEhpc3RvcnkpO1xuXHRcdHJldHVybiBpc051bWJlcihoaXN0b3J5TGltaXQpID8gaGlzdG9yeUxpbWl0IDogQ29uc3RhbnRzLkRlZmF1bHRIaXN0b3J5TGltaXQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUaW1lc3RhbXBTdG9yYWdlS2V5KCkge1xuXHRcdHJldHVybiBgJHtTdG9yYWdlS2V5cy5UaW1lc3RhbXB9LiR7dGhpcy5fc3RvcmFnZURhdGFLZXl9YDtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudHJpZXNTdG9yYWdlS2V5KCkge1xuXHRcdHJldHVybiBgJHtTdG9yYWdlS2V5cy5FbnRyaWVzfS4ke3RoaXMuX3N0b3JhZ2VEYXRhS2V5fWA7XG5cdH1cbn1cblxuLy8gU2hlbGwgZmlsZSBoaXN0b3J5IGxvYWRzIG9uY2UgcGVyIHNoZWxsIHBlciB3aW5kb3dcbmludGVyZmFjZSBJU2hlbGxGaWxlSGlzdG9yeUVudHJ5IHtcblx0c291cmNlTGFiZWw6IHN0cmluZztcblx0c291cmNlUmVzb3VyY2U6IFVSSTtcblx0Y29tbWFuZHM6IHN0cmluZ1tdO1xufVxuY29uc3Qgc2hlbGxGaWxlSGlzdG9yeTogTWFwPFRlcm1pbmFsU2hlbGxUeXBlIHwgdW5kZWZpbmVkLCBJU2hlbGxGaWxlSGlzdG9yeUVudHJ5IHwgbnVsbD4gPSBuZXcgTWFwKCk7XG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2V0U2hlbGxGaWxlSGlzdG9yeShhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2hlbGxUeXBlOiBUZXJtaW5hbFNoZWxsVHlwZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVNoZWxsRmlsZUhpc3RvcnlFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBjYWNoZWQgPSBzaGVsbEZpbGVIaXN0b3J5LmdldChzaGVsbFR5cGUpO1xuXHRpZiAoY2FjaGVkID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoY2FjaGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gY2FjaGVkO1xuXHR9XG5cdGxldCByZXN1bHQ6IElTaGVsbEZpbGVIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQ7XG5cdHN3aXRjaCAoc2hlbGxUeXBlKSB7XG5cdFx0Y2FzZSBQb3NpeFNoZWxsVHlwZS5CYXNoOlxuXHRcdFx0cmVzdWx0ID0gYXdhaXQgZmV0Y2hCYXNoSGlzdG9yeShhY2Nlc3Nvcik7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIEdlbmVyYWxTaGVsbFR5cGUuUG93ZXJTaGVsbDpcblx0XHRcdHJlc3VsdCA9IGF3YWl0IGZldGNoUHdzaEhpc3RvcnkoYWNjZXNzb3IpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBQb3NpeFNoZWxsVHlwZS5ac2g6XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCBmZXRjaFpzaEhpc3RvcnkoYWNjZXNzb3IpO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBQb3NpeFNoZWxsVHlwZS5GaXNoOlxuXHRcdFx0cmVzdWx0ID0gYXdhaXQgZmV0Y2hGaXNoSGlzdG9yeShhY2Nlc3Nvcik7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIEdlbmVyYWxTaGVsbFR5cGUuUHl0aG9uOlxuXHRcdFx0cmVzdWx0ID0gYXdhaXQgZmV0Y2hQeXRob25IaXN0b3J5KGFjY2Vzc29yKTtcblx0XHRcdGJyZWFrO1xuXHRcdGRlZmF1bHQ6IHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0c2hlbGxGaWxlSGlzdG9yeS5zZXQoc2hlbGxUeXBlLCBudWxsKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHNoZWxsRmlsZUhpc3Rvcnkuc2V0KHNoZWxsVHlwZSwgcmVzdWx0KTtcblx0cmV0dXJuIHJlc3VsdDtcbn1cbmV4cG9ydCBmdW5jdGlvbiBjbGVhclNoZWxsRmlsZUhpc3RvcnkoKSB7XG5cdHNoZWxsRmlsZUhpc3RvcnkuY2xlYXIoKTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoQmFzaEhpc3RvcnkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPElTaGVsbEZpbGVIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0Y29uc3QgcmVtb3RlQWdlbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRjb25zdCByZW1vdGVFbnZpcm9ubWVudCA9IGF3YWl0IHJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRpZiAocmVtb3RlRW52aXJvbm1lbnQ/Lm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB8fCAhcmVtb3RlRW52aXJvbm1lbnQgJiYgaXNXaW5kb3dzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzb3VyY2VMYWJlbCA9ICd+Ly5iYXNoX2hpc3RvcnknO1xuXHRjb25zdCBob21lID0gcmVtb3RlRW52aXJvbm1lbnQ/LnVzZXJIb21lPy5mc1BhdGggPz8gZW52WydIT01FJ107XG5cdGNvbnN0IHJlc29sdmVkRmlsZSA9IGF3YWl0IGZldGNoRmlsZUNvbnRlbnRzKGhvbWUsICcuYmFzaF9oaXN0b3J5JywgZmFsc2UsIGZpbGVTZXJ2aWNlLCByZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRpZiAocmVzb2x2ZWRGaWxlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIC5iYXNoX2hpc3RvcnkgZG9lcyBub3QgZGlmZmVyZW50aWF0ZSB3cmFwcGVkIGNvbW1hbmRzIGZyb20gbXVsdGlwbGUgY29tbWFuZHMuIFBhcnNlXG5cdC8vIHRoZSBvdXRwdXQgdG8gZ2V0IHRoZVxuXHRjb25zdCBmaWxlTGluZXMgPSByZXNvbHZlZEZpbGUuY29udGVudC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IHJlc3VsdDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdGxldCBjdXJyZW50TGluZTogc3RyaW5nO1xuXHRsZXQgY3VycmVudENvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0bGV0IHdyYXBDaGFyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y3VycmVudExpbmUgPSBmaWxlTGluZXNbaV07XG5cdFx0aWYgKGN1cnJlbnRDb21tYW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGN1cnJlbnRDb21tYW5kID0gY3VycmVudExpbmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnJlbnRDb21tYW5kICs9IGBcXG4ke2N1cnJlbnRMaW5lfWA7XG5cdFx0fVxuXHRcdGZvciAobGV0IGMgPSAwOyBjIDwgY3VycmVudExpbmUubGVuZ3RoOyBjKyspIHtcblx0XHRcdGlmICh3cmFwQ2hhcikge1xuXHRcdFx0XHRpZiAoY3VycmVudExpbmVbY10gPT09IHdyYXBDaGFyKSB7XG5cdFx0XHRcdFx0d3JhcENoYXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjdXJyZW50TGluZVtjXS5tYXRjaCgvWydcIl0vKSkge1xuXHRcdFx0XHRcdHdyYXBDaGFyID0gY3VycmVudExpbmVbY107XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHdyYXBDaGFyID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGlmIChjdXJyZW50Q29tbWFuZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdC5hZGQoY3VycmVudENvbW1hbmQudHJpbSgpKTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRDb21tYW5kID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7XG5cdFx0c291cmNlTGFiZWwsXG5cdFx0c291cmNlUmVzb3VyY2U6IHJlc29sdmVkRmlsZS5yZXNvdXJjZSxcblx0XHRjb21tYW5kczogQXJyYXkuZnJvbShyZXN1bHQudmFsdWVzKCkpXG5cdH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaFpzaEhpc3RvcnkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPElTaGVsbEZpbGVIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0Y29uc3QgcmVtb3RlQWdlbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRjb25zdCByZW1vdGVFbnZpcm9ubWVudCA9IGF3YWl0IHJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRpZiAocmVtb3RlRW52aXJvbm1lbnQ/Lm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyB8fCAhcmVtb3RlRW52aXJvbm1lbnQgJiYgaXNXaW5kb3dzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHNvdXJjZUxhYmVsID0gJ34vLnpzaF9oaXN0b3J5Jztcblx0Y29uc3QgaG9tZSA9IHJlbW90ZUVudmlyb25tZW50Py51c2VySG9tZT8uZnNQYXRoID8/IGVudlsnSE9NRSddO1xuXHRjb25zdCByZXNvbHZlZEZpbGUgPSBhd2FpdCBmZXRjaEZpbGVDb250ZW50cyhob21lLCAnLnpzaF9oaXN0b3J5JywgZmFsc2UsIGZpbGVTZXJ2aWNlLCByZW1vdGVBZ2VudFNlcnZpY2UpO1xuXHRpZiAocmVzb2x2ZWRGaWxlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGlzRXh0ZW5kZWRIaXN0b3J5ID0gL146XFxzXFxkKzpcXGQrOy8udGVzdChyZXNvbHZlZEZpbGUuY29udGVudCk7XG5cdGNvbnN0IGZpbGVMaW5lcyA9IHJlc29sdmVkRmlsZS5jb250ZW50LnNwbGl0KGlzRXh0ZW5kZWRIaXN0b3J5ID8gL1xcOlxcc1xcZCtcXDpcXGQrOy8gOiAvKD88IVxcXFwpXFxuLyk7XG5cdGNvbnN0IHJlc3VsdDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gZmlsZUxpbmVzW2ldLnJlcGxhY2UoL1xcXFxcXG4vZywgJ1xcbicpLnRyaW0oKTtcblx0XHRpZiAoc2FuaXRpemVkLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5hZGQoc2FuaXRpemVkKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzb3VyY2VMYWJlbCxcblx0XHRzb3VyY2VSZXNvdXJjZTogcmVzb2x2ZWRGaWxlLnJlc291cmNlLFxuXHRcdGNvbW1hbmRzOiBBcnJheS5mcm9tKHJlc3VsdC52YWx1ZXMoKSlcblx0fTtcbn1cblxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZmV0Y2hQeXRob25IaXN0b3J5KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxJU2hlbGxGaWxlSGlzdG9yeUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdGNvbnN0IHJlbW90ZUFnZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0Y29uc3QgcmVtb3RlRW52aXJvbm1lbnQgPSBhd2FpdCByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblxuXHRjb25zdCBzb3VyY2VMYWJlbCA9ICd+Ly5weXRob25faGlzdG9yeSc7XG5cdGNvbnN0IGhvbWUgPSByZW1vdGVFbnZpcm9ubWVudD8udXNlckhvbWU/LmZzUGF0aCA/PyBlbnZbJ0hPTUUnXTtcblx0Y29uc3QgcmVzb2x2ZWRGaWxlID0gYXdhaXQgZmV0Y2hGaWxlQ29udGVudHMoaG9tZSwgJy5weXRob25faGlzdG9yeScsIGZhbHNlLCBmaWxlU2VydmljZSwgcmVtb3RlQWdlbnRTZXJ2aWNlKTtcblxuXHRpZiAocmVzb2x2ZWRGaWxlID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Ly8gUHl0aG9uIGhpc3RvcnkgZmlsZSBpcyBhIHNpbXBsZSB0ZXh0IGZpbGUgd2l0aCBvbmUgY29tbWFuZCBwZXIgbGluZVxuXHRjb25zdCBmaWxlTGluZXMgPSByZXNvbHZlZEZpbGUuY29udGVudC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IHJlc3VsdDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cblx0ZmlsZUxpbmVzLmZvckVhY2gobGluZSA9PiB7XG5cdFx0aWYgKGxpbmUudHJpbSgpLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5hZGQobGluZS50cmltKCkpO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIHtcblx0XHRzb3VyY2VMYWJlbCxcblx0XHRzb3VyY2VSZXNvdXJjZTogcmVzb2x2ZWRGaWxlLnJlc291cmNlLFxuXHRcdGNvbW1hbmRzOiBBcnJheS5mcm9tKHJlc3VsdC52YWx1ZXMoKSlcblx0fTtcbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGZldGNoUHdzaEhpc3RvcnkoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPElTaGVsbEZpbGVIaXN0b3J5RW50cnkgfCB1bmRlZmluZWQ+IHtcblx0Y29uc3QgZmlsZVNlcnZpY2U6IFBpY2s8SUZpbGVTZXJ2aWNlLCAncmVhZEZpbGUnPiA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXHRjb25zdCByZW1vdGVBZ2VudFNlcnZpY2U6IFBpY2s8SVJlbW90ZUFnZW50U2VydmljZSwgJ2dldENvbm5lY3Rpb24nIHwgJ2dldEVudmlyb25tZW50Jz4gPSBhY2Nlc3Nvci5nZXQoSVJlbW90ZUFnZW50U2VydmljZSk7XG5cdGxldCBmb2xkZXJQcmVmaXg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IGZpbGVQYXRoOiBzdHJpbmc7XG5cdGNvbnN0IHJlbW90ZUVudmlyb25tZW50ID0gYXdhaXQgcmVtb3RlQWdlbnRTZXJ2aWNlLmdldEVudmlyb25tZW50KCk7XG5cdGNvbnN0IGlzRmlsZVdpbmRvd3MgPSByZW1vdGVFbnZpcm9ubWVudD8ub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzIHx8ICFyZW1vdGVFbnZpcm9ubWVudCAmJiBpc1dpbmRvd3M7XG5cdGxldCBzb3VyY2VMYWJlbDogc3RyaW5nO1xuXHRpZiAoaXNGaWxlV2luZG93cykge1xuXHRcdGZvbGRlclByZWZpeCA9IGVudlsnQVBQREFUQSddO1xuXHRcdGZpbGVQYXRoID0gJ01pY3Jvc29mdFxcXFxXaW5kb3dzXFxcXFBvd2VyU2hlbGxcXFxcUFNSZWFkTGluZVxcXFxDb25zb2xlSG9zdF9oaXN0b3J5LnR4dCc7XG5cdFx0c291cmNlTGFiZWwgPSBgJEFQUERBVEFcXFxcTWljcm9zb2Z0XFxcXFdpbmRvd3NcXFxcUG93ZXJTaGVsbFxcXFxQU1JlYWRMaW5lXFxcXENvbnNvbGVIb3N0X2hpc3RvcnkudHh0YDtcblx0fSBlbHNlIHtcblx0XHRmb2xkZXJQcmVmaXggPSByZW1vdGVFbnZpcm9ubWVudD8udXNlckhvbWU/LmZzUGF0aCA/PyBlbnZbJ0hPTUUnXTtcblx0XHRmaWxlUGF0aCA9ICcubG9jYWwvc2hhcmUvcG93ZXJzaGVsbC9QU1JlYWRsaW5lL0NvbnNvbGVIb3N0X2hpc3RvcnkudHh0Jztcblx0XHRzb3VyY2VMYWJlbCA9IGB+LyR7ZmlsZVBhdGh9YDtcblx0fVxuXHRjb25zdCByZXNvbHZlZEZpbGUgPSBhd2FpdCBmZXRjaEZpbGVDb250ZW50cyhmb2xkZXJQcmVmaXgsIGZpbGVQYXRoLCBpc0ZpbGVXaW5kb3dzLCBmaWxlU2VydmljZSwgcmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0aWYgKHJlc29sdmVkRmlsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBmaWxlTGluZXMgPSByZXNvbHZlZEZpbGUuY29udGVudC5zcGxpdCgnXFxuJyk7XG5cdGNvbnN0IHJlc3VsdDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdGxldCBjdXJyZW50TGluZTogc3RyaW5nO1xuXHRsZXQgY3VycmVudENvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0bGV0IHdyYXBDaGFyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y3VycmVudExpbmUgPSBmaWxlTGluZXNbaV07XG5cdFx0aWYgKGN1cnJlbnRDb21tYW5kID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGN1cnJlbnRDb21tYW5kID0gY3VycmVudExpbmU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnJlbnRDb21tYW5kICs9IGBcXG4ke2N1cnJlbnRMaW5lfWA7XG5cdFx0fVxuXHRcdGlmICghY3VycmVudExpbmUuZW5kc1dpdGgoJ2AnKSkge1xuXHRcdFx0Y29uc3Qgc2FuaXRpemVkID0gY3VycmVudENvbW1hbmQudHJpbSgpO1xuXHRcdFx0aWYgKHNhbml0aXplZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlc3VsdC5hZGQoc2FuaXRpemVkKTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRDb21tYW5kID0gdW5kZWZpbmVkO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIElmIHRoZSBsaW5lIGVuZHMgd2l0aCBgLCB0aGUgbGluZSBtYXkgYmUgd3JhcHBlZC4gTmVlZCB0byBhbHNvIHRlc3QgdGhlIGNhc2Ugd2hlcmUgYCBpc1xuXHRcdC8vIHRoZSBsYXN0IGNoYXJhY3RlciBpbiB0aGUgbGluZVxuXHRcdGZvciAobGV0IGMgPSAwOyBjIDwgY3VycmVudExpbmUubGVuZ3RoOyBjKyspIHtcblx0XHRcdGlmICh3cmFwQ2hhcikge1xuXHRcdFx0XHRpZiAoY3VycmVudExpbmVbY10gPT09IHdyYXBDaGFyKSB7XG5cdFx0XHRcdFx0d3JhcENoYXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjdXJyZW50TGluZVtjXS5tYXRjaCgvYC8pKSB7XG5cdFx0XHRcdFx0d3JhcENoYXIgPSBjdXJyZW50TGluZVtjXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBIYXZpbmcgYW4gZXZlbiBudW1iZXIgb2YgYmFja3RpY2tzIG1lYW5zIHRoZSBsaW5lIGlzIHRlcm1pbmF0ZWRcblx0XHQvLyBUT0RPOiBUaGlzIGRvZXNuJ3QgY292ZXIgbW9yZSBjb21wbGljYXRlZCBjYXNlcyB3aGVyZSBgIGlzIHdpdGhpbiBxdW90ZXNcblx0XHRpZiAoIXdyYXBDaGFyKSB7XG5cdFx0XHRjb25zdCBzYW5pdGl6ZWQgPSBjdXJyZW50Q29tbWFuZC50cmltKCk7XG5cdFx0XHRpZiAoc2FuaXRpemVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0cmVzdWx0LmFkZChzYW5pdGl6ZWQpO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudENvbW1hbmQgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFJlbW92ZSB0cmFpbGluZyBiYWNrdGlja1xuXHRcdFx0Y3VycmVudENvbW1hbmQgPSBjdXJyZW50Q29tbWFuZC5yZXBsYWNlKC9gJC8sICcnKTtcblx0XHRcdHdyYXBDaGFyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7XG5cdFx0c291cmNlTGFiZWwsXG5cdFx0c291cmNlUmVzb3VyY2U6IHJlc29sdmVkRmlsZS5yZXNvdXJjZSxcblx0XHRjb21tYW5kczogQXJyYXkuZnJvbShyZXN1bHQudmFsdWVzKCkpXG5cdH07XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBmZXRjaEZpc2hIaXN0b3J5KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTxJU2hlbGxGaWxlSGlzdG9yeUVudHJ5IHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0IGZpbGVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElGaWxlU2VydmljZSk7XG5cdGNvbnN0IHJlbW90ZUFnZW50U2VydmljZSA9IGFjY2Vzc29yLmdldChJUmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0Y29uc3QgcmVtb3RlRW52aXJvbm1lbnQgPSBhd2FpdCByZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0aWYgKHJlbW90ZUVudmlyb25tZW50Py5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgfHwgIXJlbW90ZUVudmlyb25tZW50ICYmIGlzV2luZG93cykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogRnJvbSBgZmlzaGAgZG9jczpcblx0ICogPiBUaGUgY29tbWFuZCBoaXN0b3J5IGlzIHN0b3JlZCBpbiB0aGUgZmlsZSB+Ly5sb2NhbC9zaGFyZS9maXNoL2Zpc2hfaGlzdG9yeVxuXHQgKiAgIChvciAkWERHX0RBVEFfSE9NRS9maXNoL2Zpc2hfaGlzdG9yeSBpZiB0aGF0IHZhcmlhYmxlIGlzIHNldCkgYnkgZGVmYXVsdC5cblx0ICpcblx0ICogKGh0dHBzOi8vZmlzaHNoZWxsLmNvbS9kb2NzL2N1cnJlbnQvaW50ZXJhY3RpdmUuaHRtbCNoaXN0b3J5LXNlYXJjaClcblx0ICovXG5cdGNvbnN0IG92ZXJyaWRlbkRhdGFIb21lID0gZW52WydYREdfREFUQV9IT01FJ107XG5cblx0Ly8gVE9ETzogVW5jaGVja2VkIGZpc2ggYmVoYXZpb3I6XG5cdC8vIFdoYXQgaWYgWERHX0RBVEFfSE9NRSB3YXMgZGVmaW5lZCBidXQgc29tZWhvdyAkWERHX0RBVEFfSE9NRS9maXNoL2Zpc2hfaGlzdG9yeVxuXHQvLyB3YXMgbm90IGV4aXN0LiBEb2VzIGZpc2ggZmFsbCBiYWNrIHRvIH4vLmxvY2FsL3NoYXJlL2Zpc2gvZmlzaF9oaXN0b3J5P1xuXG5cdGxldCBmb2xkZXJQcmVmaXg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IGZpbGVQYXRoOiBzdHJpbmc7XG5cdGxldCBzb3VyY2VMYWJlbDogc3RyaW5nO1xuXHRpZiAob3ZlcnJpZGVuRGF0YUhvbWUpIHtcblx0XHRzb3VyY2VMYWJlbCA9ICckWERHX0RBVEFfSE9NRS9maXNoL2Zpc2hfaGlzdG9yeSc7XG5cdFx0Zm9sZGVyUHJlZml4ID0gZW52WydYREdfREFUQV9IT01FJ107XG5cdFx0ZmlsZVBhdGggPSAnZmlzaC9maXNoX2hpc3RvcnknO1xuXHR9IGVsc2Uge1xuXHRcdHNvdXJjZUxhYmVsID0gJ34vLmxvY2FsL3NoYXJlL2Zpc2gvZmlzaF9oaXN0b3J5Jztcblx0XHRmb2xkZXJQcmVmaXggPSByZW1vdGVFbnZpcm9ubWVudD8udXNlckhvbWU/LmZzUGF0aCA/PyBlbnZbJ0hPTUUnXTtcblx0XHRmaWxlUGF0aCA9ICcubG9jYWwvc2hhcmUvZmlzaC9maXNoX2hpc3RvcnknO1xuXHR9XG5cdGNvbnN0IHJlc29sdmVkRmlsZSA9IGF3YWl0IGZldGNoRmlsZUNvbnRlbnRzKGZvbGRlclByZWZpeCwgZmlsZVBhdGgsIGZhbHNlLCBmaWxlU2VydmljZSwgcmVtb3RlQWdlbnRTZXJ2aWNlKTtcblx0aWYgKHJlc29sdmVkRmlsZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGVzZSBhcHBseSB0byBgZmlzaGAgdjMuNS4xOlxuXHQgKiAtIEl0IGxvb2tzIGxpa2UgWUFNTCBidXQgaXQncyBub3QuIEl0J3MsIHF1b3RpbmcsICpcImEgYnJva2VuIHBzdWVkby1ZQU1MXCIqLlxuXHQgKiAgIFNlZSB0aGVzZSBkaXNjdXNzaW9ucyBmb3IgbW9yZSBkZXRhaWxzOlxuXHQgKiAgIC0gaHR0cHM6Ly9naXRodWIuY29tL2Zpc2gtc2hlbGwvZmlzaC1zaGVsbC9wdWxsLzY0OTNcblx0ICogICAtIGh0dHBzOi8vZ2l0aHViLmNvbS9maXNoLXNoZWxsL2Zpc2gtc2hlbGwvaXNzdWVzLzMzNDFcblx0ICogLSBFdmVyeSByZWNvcmQgc2hvdWxkIGV4YWN0bHkgc3RhcnQgd2l0aCBgLSBjbWQ6YCAodGhlIHdoaXRlc3BhY2UgYmV0d2VlbiBgLWAgYW5kIGBjbWRgIGNhbm5vdCBiZSByZXBsYWNlZCB3aXRoIHRhYilcblx0ICogLSBCb3RoIGAtIGNtZDogZWNobyAxYCBhbmQgYC0gY21kOmVjaG8gMWAgYXJlIHZhbGlkIGVudHJpZXMuXG5cdCAqIC0gQmFja3NsYXNoZXMgYXJlIGVzYWNwZWQgYXMgYFxcXFxgLlxuXHQgKiAtIE11bHRpbGluZSBjb21tYW5kcyBhcmUgam9pbmVkIHdpdGggYSBgXFxuYCBzZXF1ZW5jZSwgaGVuY2UgdGhleSdyZSByZWFkIGFzIHNpbmdsZSBsaW5lIGNvbW1hbmRzLlxuXHQgKiAtIFByb3BlcnR5IGB3aGVuYCBpcyBvcHRpb25hbC5cblx0ICogLSBIaXN0b3J5IG5hdmlnYXRpb24gcmVzcGVjdHMgdGhlIHJlY29yZHMgb3JkZXIgYW5kIGlnbm9yZSB0aGUgYWN0dWFsIGB3aGVuYCBwcm9wZXJ0eSB2YWx1ZXMgKGNocm9ub2xvZ2ljYWwgb3JkZXIpLlxuXHQgKiAtIElmIGBjbWRgIHZhbHVlIGlzIG11bHRpbGluZSAsIGl0IGp1c3QgdGFrZXMgdGhlIGZpcnN0IGxpbmUuIEFsc28gWUFNTCBvcGVyYXRvcnMgbGlrZSBgPi1gIG9yIGB8LWAgYXJlIG5vdCBzdXBwb3J0ZWQuXG5cdCAqL1xuXHRjb25zdCByZXN1bHQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRjb25zdCBjbWRzID0gcmVzb2x2ZWRGaWxlLmNvbnRlbnQuc3BsaXQoJ1xcbicpXG5cdFx0LmZpbHRlcih4ID0+IHguc3RhcnRzV2l0aCgnLSBjbWQ6JykpXG5cdFx0Lm1hcCh4ID0+IHguc3Vic3RyaW5nKDYpLnRyaW1TdGFydCgpKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjbWRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gc2FuaXRpemVGaXNoSGlzdG9yeUNtZChjbWRzW2ldKS50cmltKCk7XG5cdFx0aWYgKHNhbml0aXplZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQuYWRkKHNhbml0aXplZCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7XG5cdFx0c291cmNlTGFiZWwsXG5cdFx0c291cmNlUmVzb3VyY2U6IHJlc29sdmVkRmlsZS5yZXNvdXJjZSxcblx0XHRjb21tYW5kczogQXJyYXkuZnJvbShyZXN1bHQudmFsdWVzKCkpXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYW5pdGl6ZUZpc2hIaXN0b3J5Q21kKGNtZDogc3RyaW5nKTogc3RyaW5nIHtcblx0LyoqXG5cdCAqIE5PVEVcblx0ICogVGhpcyByZXBlYXRlZFJlcGxhY2UoKSBjYWxsIGNhbiBiZSBlbGltaW5hdGVkIGJ5IHVzaW5nIGxvb2stYWhlYWRcblx0ICogY2FsdXNlcyBpbiB0aGUgb3JpZ2luYWwgUmVnRXhwIHBhdHRlcm46XG5cdCAqXG5cdCAqID4+PiBgYGB0c1xuXHQgKiA+Pj4gY21kc1tpXS5yZXBsYWNlKC8oPzw9XnxbXlxcXFxdKSgoPzpcXFxcXFxcXCkqKShcXFxcbikvZywgJyQxXFxuJylcblx0ICogPj4+IGBgYFxuXHQgKlxuXHQgKiBCdXQgc2luY2Ugbm90IGFsbCBicm93c2VycyBzdXBwb3J0IGxvb2sgYWhlYWRzIHdlIG9wdGVkIHRvIGEgc2ltcGxlXG5cdCAqIHBhdHRlcm4gYW5kIHJlcGVhdGVkbHkgY2FsbGluZyByZXBsYWNlIG1ldGhvZC5cblx0ICovXG5cdHJldHVybiByZXBlYXRlZFJlcGxhY2UoLyhefFteXFxcXF0pKCg/OlxcXFxcXFxcKSopKFxcXFxuKS9nLCBjbWQsICckMSQyXFxuJyk7XG59XG5cbmZ1bmN0aW9uIHJlcGVhdGVkUmVwbGFjZShwYXR0ZXJuOiBSZWdFeHAsIHZhbHVlOiBzdHJpbmcsIHJlcGxhY2VWYWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0bGV0IGxhc3Q7XG5cdGxldCBjdXJyZW50ID0gdmFsdWU7XG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0bGFzdCA9IGN1cnJlbnQ7XG5cdFx0Y3VycmVudCA9IGN1cnJlbnQucmVwbGFjZShwYXR0ZXJuLCByZXBsYWNlVmFsdWUpO1xuXHRcdGlmIChjdXJyZW50ID09PSBsYXN0KSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudDtcblx0XHR9XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gZmV0Y2hGaWxlQ29udGVudHMoXG5cdGZvbGRlclByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRmaWxlUGF0aDogc3RyaW5nLFxuXHRpc0ZpbGVXaW5kb3dzOiBib29sZWFuLFxuXHRmaWxlU2VydmljZTogUGljazxJRmlsZVNlcnZpY2UsICdyZWFkRmlsZSc+LFxuXHRyZW1vdGVBZ2VudFNlcnZpY2U6IFBpY2s8SVJlbW90ZUFnZW50U2VydmljZSwgJ2dldENvbm5lY3Rpb24nPixcbik6IFByb21pc2U8eyByZXNvdXJjZTogVVJJOyBjb250ZW50OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4ge1xuXHRpZiAoIWZvbGRlclByZWZpeCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY29ubmVjdGlvbiA9IHJlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdGNvbnN0IGlzUmVtb3RlID0gISFjb25uZWN0aW9uPy5yZW1vdGVBdXRob3JpdHk7XG5cdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oe1xuXHRcdHNjaGVtZTogaXNSZW1vdGUgPyBTY2hlbWFzLnZzY29kZVJlbW90ZSA6IFNjaGVtYXMuZmlsZSxcblx0XHRhdXRob3JpdHk6IGlzUmVtb3RlID8gY29ubmVjdGlvbi5yZW1vdGVBdXRob3JpdHkgOiB1bmRlZmluZWQsXG5cdFx0cGF0aDogVVJJLmZpbGUoam9pbihmb2xkZXJQcmVmaXgsIGZpbGVQYXRoKSkucGF0aFxuXHR9KTtcblx0bGV0IGNvbnRlbnQ6IElGaWxlQ29udGVudDtcblx0dHJ5IHtcblx0XHRjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHR9IGNhdGNoIChlOiB1bmtub3duKSB7XG5cdFx0Ly8gSGFuZGxlIGZpbGUgbm90IGZvdW5kIG9ubHlcblx0XHRpZiAoZSBpbnN0YW5jZW9mIEZpbGVPcGVyYXRpb25FcnJvciAmJiBlLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRocm93IGU7XG5cdH1cblx0aWYgKGNvbnRlbnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZSxcblx0XHRjb250ZW50OiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKClcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVcsdUJBQXVCO0FBQzNDLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0IscUJBQW1DLG9CQUFvQjtBQUNwRixTQUFTLDZCQUErQztBQUN4RCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGtCQUFrQixzQkFBeUM7QUFDcEUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQ0FBZ0M7QUE0QnpDLElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUNDLEVBQUFBLHNCQUFBLHlCQUFzQixPQUF0QjtBQURVLFNBQUFBO0FBQUEsR0FBQTtBQUlYLElBQVcsY0FBWCxrQkFBV0MsaUJBQVg7QUFDQyxFQUFBQSxhQUFBLGFBQVU7QUFDVixFQUFBQSxhQUFBLGVBQVk7QUFGRixTQUFBQTtBQUFBLEdBQUE7QUFLWCxJQUFJLG1CQUF3RjtBQUNyRixTQUFTLG9CQUFvQixVQUFxRjtBQUN4SCxNQUFJLENBQUMsa0JBQWtCO0FBQ3RCLHVCQUFtQixTQUFTLElBQUkscUJBQXFCLEVBQUUsZUFBZSwwQkFBMEIsTUFBTTtBQUFBLEVBQ3ZHO0FBQ0EsU0FBTztB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QXNCLG9CQUFJLElBQUk7QUFDcEMsUUFBTSxPQUFPLGFBQWEsUUFBUSxNQUFNLElBQUksRUFDMUMsT0FBTyxPQUFLLEVBQUUsV0FBVyxRQUFRLENBQUMsRUFDbEMsSUFBSSxPQUFLLEVBQUUsVUFBVSxDQUFDLEVBQUUsVUFBVSxDQUFDO0FBQ3JDLFdBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLEtBQUs7QUFDckMsVUFBTSxZQUFZLHVCQUF1QixLQUFLLENBQUMsQ0FBQyxFQUFFLEtBQUs7QUFDdkQsUUFBSSxVQUFVLFNBQVMsR0FBRztBQUN6QixhQUFPLElBQUksU0FBUztBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxnQkFBZ0IsYUFBYTtBQUFBLElBQzdCLFVBQVUsTUFBTSxLQUFLLE9BQU8sT0FBTyxDQUFDO0FBQUEsRUFDckM7QUFDRDtBQUVPLFNBQVMsdUJBQXVCLEtBQXFCO0FBYTNELFNBQU8sZ0JBQWdCLDhCQUE4QixLQUFLLFFBQVE7QUFDbkU7QUFFQSxTQUFTLGdCQUFnQixTQUFpQixPQUFlLGNBQThCO0FBQ3RGLE1BQUk7QUFDSixNQUFJLFVBQVU7QUFDZCxTQUFPLE1BQU07QUFDWixXQUFPO0FBQ1AsY0FBVSxRQUFRLFFBQVEsU0FBUyxZQUFZO0FBQy9DLFFBQUksWUFBWSxNQUFNO0FBQ3JCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUNEO0FBRUEsZUFBZSxrQkFDZCxjQUNBLFVBQ0EsZUFDQSxhQUNBLG9CQUMwRDtBQUMxRCxNQUFJLENBQUMsY0FBYztBQUNsQixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sYUFBYSxtQkFBbUIsY0FBYztBQUNwRCxRQUFNLFdBQVcsQ0FBQyxDQUFDLFlBQVk7QUFDL0IsUUFBTSxXQUFXLElBQUksS0FBSztBQUFBLElBQ3pCLFFBQVEsV0FBVyxRQUFRLGVBQWUsUUFBUTtBQUFBLElBQ2xELFdBQVcsV0FBVyxXQUFXLGtCQUFrQjtBQUFBLElBQ25ELE1BQU0sSUFBSSxLQUFLLEtBQUssY0FBYyxRQUFRLENBQUMsRUFBRTtBQUFBLEVBQzlDLENBQUM7QUFDRCxNQUFJO0FBQ0osTUFBSTtBQUNILGNBQVUsTUFBTSxZQUFZLFNBQVMsUUFBUTtBQUFBLEVBQzlDLFNBQVMsR0FBWTtBQUVwQixRQUFJLGFBQWEsc0JBQXNCLEVBQUUsd0JBQXdCLG9CQUFvQixnQkFBZ0I7QUFDcEcsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNO0FBQUEsRUFDUDtBQUNBLE1BQUksWUFBWSxRQUFXO0FBQzFCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBLFNBQVMsUUFBUSxNQUFNLFNBQVM7QUFBQSxFQUNqQztBQUNEOyIsCiAgIm5hbWVzIjogWyJDb25zdGFudHMiLCAiU3RvcmFnZUtleXMiXQp9Cg==
