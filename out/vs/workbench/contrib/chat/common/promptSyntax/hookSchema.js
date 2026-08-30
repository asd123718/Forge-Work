import * as nls from "../../../../../nls.js";
import { URI } from "../../../../../base/common/uri.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { isAbsolute } from "../../../../../base/common/path.js";
import { untildify } from "../../../../../base/common/labels.js";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { IParsedHookCommand } from "../../../../../platform/agentPlugins/common/pluginParsers.js";
import { HookType, HOOKS_BY_TARGET, HOOK_METADATA } from "./hookTypes.js";
import { Target } from "./promptTypes.js";
var ChatRequestHooks;
((ChatRequestHooks2) => {
  function isEquals(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    for (const hookType of Object.values(HookType)) {
      const aArr = a[hookType];
      const bArr = b[hookType];
      if (aArr?.length !== bArr?.length) {
        return false;
      }
      if (aArr && bArr) {
        for (let i = 0; i < aArr.length; i++) {
          if (!IParsedHookCommand.isEquals(aArr[i], bArr[i])) {
            return false;
          }
        }
      }
    }
    return true;
  }
  ChatRequestHooks2.isEquals = isEquals;
})(ChatRequestHooks || (ChatRequestHooks = {}));
function mergeHooks(base, additional) {
  if (!base) {
    return additional;
  }
  const result = { ...base };
  for (const hookType of Object.values(HookType)) {
    const baseArr = base[hookType];
    const additionalArr = additional[hookType];
    if (additionalArr && additionalArr.length > 0) {
      result[hookType] = baseArr ? [...baseArr, ...additionalArr] : additionalArr;
    }
  }
  return result;
}
const HOOK_COMMAND_FIELD_DESCRIPTIONS = {
  type: nls.localize("hook.type", 'Must be "command".'),
  command: nls.localize("hook.command", "The command to execute. This is the default cross-platform command."),
  windows: nls.localize("hook.windows", 'Windows-specific command. If specified and running on Windows, this overrides the "command" field.'),
  linux: nls.localize("hook.linux", 'Linux-specific command. If specified and running on Linux, this overrides the "command" field.'),
  osx: nls.localize("hook.osx", 'macOS-specific command. If specified and running on macOS, this overrides the "command" field.'),
  bash: nls.localize("hook.bash", "Bash command for Linux and macOS."),
  powershell: nls.localize("hook.powershell", "PowerShell command for Windows."),
  cwd: nls.localize("hook.cwd", "Working directory for the script (relative to repository root)."),
  env: nls.localize("hook.env", "Additional environment variables that are merged with the existing environment."),
  timeout: nls.localize("hook.timeout", "Maximum execution time in seconds (default: 30)."),
  timeoutSec: nls.localize("hook.timeoutSec", "Maximum execution time in seconds (default: 10).")
};
const vscodeHookCommandSchema = {
  type: "object",
  additionalProperties: true,
  required: ["type"],
  anyOf: [
    { required: ["command"] },
    { required: ["windows"] },
    { required: ["linux"] },
    { required: ["osx"] },
    { required: ["bash"] },
    { required: ["powershell"] }
  ],
  errorMessage: nls.localize("hook.commandRequired", 'At least one of "command", "windows", "linux", or "osx" must be specified.'),
  properties: {
    type: {
      type: "string",
      enum: ["command"],
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.type
    },
    command: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.command
    },
    windows: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.windows
    },
    linux: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.linux
    },
    osx: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.osx
    },
    cwd: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.cwd
    },
    env: {
      type: "object",
      additionalProperties: { type: "string" },
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.env
    },
    timeout: {
      type: "number",
      default: 30,
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.timeout
    }
  }
};
const hookArraySchema = {
  type: "array",
  items: vscodeHookCommandSchema
};
function buildHookProperties(target, arraySchema) {
  return Object.fromEntries(
    Object.entries(HOOKS_BY_TARGET[target]).map(([key, hookType]) => [
      key,
      { ...arraySchema, description: HOOK_METADATA[hookType]?.description }
    ])
  );
}
const vscodeHookProperties = buildHookProperties(Target.VSCode, hookArraySchema);
const copilotCliHookCommandSchema = {
  type: "object",
  additionalProperties: true,
  required: ["type"],
  anyOf: [
    { required: ["bash"] },
    { required: ["powershell"] }
  ],
  errorMessage: nls.localize("hook.cliCommandRequired", 'At least one of "bash" or "powershell" must be specified.'),
  properties: {
    type: {
      type: "string",
      enum: ["command"],
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.type
    },
    bash: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.bash
    },
    powershell: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.powershell
    },
    cwd: {
      type: "string",
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.cwd
    },
    env: {
      type: "object",
      additionalProperties: { type: "string" },
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.env
    },
    timeoutSec: {
      type: "number",
      default: 10,
      description: HOOK_COMMAND_FIELD_DESCRIPTIONS.timeoutSec
    }
  }
};
const copilotCliHookArraySchema = {
  type: "array",
  items: copilotCliHookCommandSchema
};
const copilotCliHookProperties = buildHookProperties(Target.GitHubCopilot, copilotCliHookArraySchema);
const hookFileSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  description: nls.localize("hookFile.description", "GitHub Copilot hook configuration file. Hooks enable executing custom shell commands at strategic points in an agent's workflow."),
  additionalProperties: true,
  required: ["hooks"],
  properties: {
    hooks: {
      type: "object",
      description: nls.localize("hookFile.hooks", "Hook definitions organized by type."),
      additionalProperties: true
    }
  },
  // Conditionally apply PascalCase or camelCase hook properties based on
  // whether the file uses the Copilot CLI format (detected by the "version" field).
  if: {
    required: ["version"],
    properties: {
      version: { type: "number" }
    }
  },
  then: {
    // Copilot CLI format: camelCase hook names, bash/powershell/timeoutSec fields
    properties: {
      version: {
        type: "number",
        description: nls.localize("hookFile.version", "Hook configuration format version.")
      },
      hooks: {
        properties: copilotCliHookProperties
      }
    }
  },
  else: {
    // VS Code / PascalCase format
    properties: {
      hooks: {
        properties: vscodeHookProperties
      }
    }
  },
  defaultSnippets: [
    {
      label: nls.localize("hookFile.snippet.basic", "Basic hook configuration"),
      description: nls.localize("hookFile.snippet.basic.description", "A basic hook configuration with common hooks"),
      body: {
        hooks: {
          SessionStart: [
            {
              type: "command",
              command: '${1:echo "Session started" >> session.log}'
            }
          ],
          PreToolUse: [
            {
              type: "command",
              command: "${2:./scripts/validate.sh}",
              timeout: 15
            }
          ]
        }
      }
    }
  ]
};
const HOOK_SCHEMA_URI = "vscode://schemas/hooks";
function toHookType(rawHookTypeId) {
  if (Object.values(HookType).includes(rawHookTypeId)) {
    return rawHookTypeId;
  }
  return void 0;
}
function normalizeHookCommand(raw) {
  if (raw.type !== "command") {
    return void 0;
  }
  const hasCommand = typeof raw.command === "string" && raw.command.length > 0;
  const hasBash = typeof raw.bash === "string" && raw.bash.length > 0;
  const hasPowerShell = typeof raw.powershell === "string" && raw.powershell.length > 0;
  const hasWindows = typeof raw.windows === "string" && raw.windows.length > 0;
  const hasLinux = typeof raw.linux === "string" && raw.linux.length > 0;
  const hasOsx = typeof raw.osx === "string" && raw.osx.length > 0;
  const windows = hasWindows ? raw.windows : hasPowerShell ? raw.powershell : void 0;
  const linux = hasLinux ? raw.linux : hasBash ? raw.bash : void 0;
  const osx = hasOsx ? raw.osx : hasBash ? raw.bash : void 0;
  const windowsSource = hasWindows ? "windows" : hasPowerShell ? "powershell" : void 0;
  const linuxSource = hasLinux ? "linux" : hasBash ? "bash" : void 0;
  const osxSource = hasOsx ? "osx" : hasBash ? "bash" : void 0;
  return {
    ...hasCommand && { command: raw.command },
    ...windows && { windows },
    ...linux && { linux },
    ...osx && { osx },
    ...windowsSource && { windowsSource },
    ...linuxSource && { linuxSource },
    ...osxSource && { osxSource },
    ...typeof raw.cwd === "string" && { cwd: raw.cwd },
    ...typeof raw.env === "object" && raw.env !== null && { env: raw.env },
    ...typeof raw.timeout !== "number" && typeof raw.timeoutSec === "number" && { timeout: raw.timeoutSec },
    ...typeof raw.timeout === "number" && { timeout: raw.timeout }
  };
}
function getPlatformLabel(os) {
  if (os === OperatingSystem.Windows) {
    return "Windows";
  } else if (os === OperatingSystem.Macintosh) {
    return "macOS";
  } else if (os === OperatingSystem.Linux) {
    return "Linux";
  }
  return "";
}
function resolveEffectiveCommand(hook, os) {
  if (os === OperatingSystem.Windows && hook.windows) {
    return hook.windows;
  } else if (os === OperatingSystem.Macintosh && hook.osx) {
    return hook.osx;
  } else if (os === OperatingSystem.Linux && hook.linux) {
    return hook.linux;
  }
  return hook.command;
}
function isUsingPlatformOverride(hook, os) {
  if (os === OperatingSystem.Windows && hook.windows) {
    return true;
  } else if (os === OperatingSystem.Macintosh && hook.osx) {
    return true;
  } else if (os === OperatingSystem.Linux && hook.linux) {
    return true;
  }
  return false;
}
function getEffectiveCommandSource(hook, os) {
  if (os === OperatingSystem.Windows && hook.windows && hook.windowsSource === "powershell") {
    return "powershell";
  } else if (os === OperatingSystem.Macintosh && hook.osx && hook.osxSource === "bash") {
    return "bash";
  } else if (os === OperatingSystem.Linux && hook.linux && hook.linuxSource === "bash") {
    return "bash";
  }
  return void 0;
}
function getEffectiveCommandFieldKey(hook, os) {
  const h = hook;
  if (os === OperatingSystem.Windows && hook.windows) {
    return h.windowsSource ?? "windows";
  } else if (os === OperatingSystem.Macintosh && hook.osx) {
    return h.osxSource ?? "osx";
  } else if (os === OperatingSystem.Linux && hook.linux) {
    return h.linuxSource ?? "linux";
  }
  return "command";
}
function formatHookCommandLabel(hook, os) {
  const command = resolveEffectiveCommand(hook, os);
  if (!command) {
    return "";
  }
  return command;
}
function resolveHookCommand(raw, workspaceRootUri, userHome) {
  const normalized = normalizeHookCommand(raw);
  if (!normalized) {
    return void 0;
  }
  let cwdUri;
  if (normalized.cwd) {
    const expandedCwd = untildify(normalized.cwd, userHome);
    if (isAbsolute(expandedCwd)) {
      cwdUri = URI.file(expandedCwd);
    } else if (workspaceRootUri) {
      cwdUri = joinPath(workspaceRootUri, expandedCwd);
    }
  } else {
    cwdUri = workspaceRootUri;
  }
  return {
    type: "command",
    ...normalized.command && { command: normalized.command },
    ...normalized.windows && { windows: normalized.windows },
    ...normalized.linux && { linux: normalized.linux },
    ...normalized.osx && { osx: normalized.osx },
    ...normalized.windowsSource && { windowsSource: normalized.windowsSource },
    ...normalized.linuxSource && { linuxSource: normalized.linuxSource },
    ...normalized.osxSource && { osxSource: normalized.osxSource },
    ...cwdUri && { cwd: cwdUri },
    ...normalized.env && { env: normalized.env },
    ...normalized.timeout !== void 0 && { timeout: normalized.timeout }
  };
}
function extractHookCommandsFromItem(item, workspaceRootUri, userHome) {
  if (!item || typeof item !== "object") {
    return [];
  }
  const itemObj = item;
  const commands = [];
  const nestedHooks = itemObj.hooks;
  if (nestedHooks !== void 0 && Array.isArray(nestedHooks)) {
    for (const nestedHook of nestedHooks) {
      if (!nestedHook || typeof nestedHook !== "object") {
        continue;
      }
      const normalized = normalizeForResolve(nestedHook);
      const resolved = resolveHookCommand(normalized, workspaceRootUri, userHome);
      if (resolved) {
        commands.push(resolved);
      }
    }
  } else {
    const normalized = normalizeForResolve(itemObj);
    const resolved = resolveHookCommand(normalized, workspaceRootUri, userHome);
    if (resolved) {
      commands.push(resolved);
    }
  }
  return commands;
}
function normalizeForResolve(raw) {
  if (raw.type === void 0 || raw.type === "command") {
    return { ...raw, type: "command" };
  }
  return raw;
}
function yamlValueToPlain(value) {
  switch (value.type) {
    case "scalar":
      return value.value;
    case "sequence":
      return value.items.map(yamlValueToPlain);
    case "map": {
      const obj = {};
      for (const prop of value.properties) {
        obj[prop.key.value] = yamlValueToPlain(prop.value);
      }
      return obj;
    }
  }
}
function parseSubagentHooksFromYaml(hooksMap, workspaceRootUri, userHome, target = Target.Undefined) {
  const result = {};
  const targetHookMap = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
  for (const prop of hooksMap.properties) {
    const hookTypeName = prop.key.value;
    const hookType = targetHookMap[hookTypeName] ?? toHookType(hookTypeName);
    if (!hookType) {
      continue;
    }
    if (prop.value.type !== "sequence") {
      continue;
    }
    const commands = [];
    for (const item of prop.value.items) {
      const plainItem = yamlValueToPlain(item);
      const extracted = extractHookCommandsFromItem(plainItem, workspaceRootUri, userHome);
      commands.push(...extracted);
    }
    if (commands.length > 0) {
      if (!result[hookType]) {
        result[hookType] = [];
      }
      result[hookType].push(...commands);
    }
  }
  return result;
}
export {
  ChatRequestHooks,
  HOOK_COMMAND_FIELD_DESCRIPTIONS,
  HOOK_SCHEMA_URI,
  extractHookCommandsFromItem,
  formatHookCommandLabel,
  getEffectiveCommandFieldKey,
  getEffectiveCommandSource,
  getPlatformLabel,
  hookFileSchema,
  isUsingPlatformOverride,
  mergeHooks,
  parseSubagentHooksFromYaml,
  resolveEffectiveCommand,
  resolveHookCommand,
  toHookType
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxob29rU2NoZW1hLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IHVudGlsZGlmeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJUGFyc2VkSG9va0NvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgSG9va1R5cGUsIEhPT0tTX0JZX1RBUkdFVCwgSE9PS19NRVRBREFUQSB9IGZyb20gJy4vaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IFRhcmdldCB9IGZyb20gJy4vcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSVZhbHVlLCBJTWFwVmFsdWUgfSBmcm9tICcuL3Byb21wdEZpbGVQYXJzZXIuanMnO1xuXG4vKipcbiAqIEEgc2luZ2xlIGhvb2sgY29tbWFuZCBjb25maWd1cmF0aW9uLlxuICogRXh0ZW5kcyB0aGUgcGxhdGZvcm0tbGF5ZXIge0BsaW5rIElQYXJzZWRIb29rQ29tbWFuZH0gd2l0aCBlZGl0b3Itc3BlY2lmaWNcbiAqIG1ldGFkYXRhIHVzZWQgZm9yIFVJIGRpc3BsYXkgYW5kIGZpZWxkIGhpZ2hsaWdodGluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJSG9va0NvbW1hbmQgZXh0ZW5kcyBJUGFyc2VkSG9va0NvbW1hbmQge1xuXHRyZWFkb25seSB0eXBlOiAnY29tbWFuZCc7XG5cdC8qKiBPcmlnaW5hbCBKU09OIGZpZWxkIG5hbWUgdGhhdCBwcm92aWRlZCB0aGUgd2luZG93cyBjb21tYW5kLiAqL1xuXHRyZWFkb25seSB3aW5kb3dzU291cmNlPzogJ3dpbmRvd3MnIHwgJ3Bvd2Vyc2hlbGwnO1xuXHQvKiogT3JpZ2luYWwgSlNPTiBmaWVsZCBuYW1lIHRoYXQgcHJvdmlkZWQgdGhlIGxpbnV4IGNvbW1hbmQuICovXG5cdHJlYWRvbmx5IGxpbnV4U291cmNlPzogJ2xpbnV4JyB8ICdiYXNoJztcblx0LyoqIE9yaWdpbmFsIEpTT04gZmllbGQgbmFtZSB0aGF0IHByb3ZpZGVkIHRoZSBvc3ggY29tbWFuZC4gKi9cblx0cmVhZG9ubHkgb3N4U291cmNlPzogJ29zeCcgfCAnYmFzaCc7XG59XG5cbi8qKlxuICogQ29sbGVjdGVkIGhvb2tzIGZvciBhIGNoYXQgcmVxdWVzdCwgb3JnYW5pemVkIGJ5IGhvb2sgdHlwZS5cbiAqIFRoaXMgaXMgcGFzc2VkIHRvIHRoZSBleHRlbnNpb24gaG9zdCBzbyBpdCBrbm93cyB3aGF0IGhvb2tzIGFyZSBhdmFpbGFibGUuXG4gKi9cbmV4cG9ydCB0eXBlIENoYXRSZXF1ZXN0SG9va3MgPSB7XG5cdHJlYWRvbmx5IFtLIGluIEhvb2tUeXBlXT86IHJlYWRvbmx5IElQYXJzZWRIb29rQ29tbWFuZFtdO1xufTtcblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0UmVxdWVzdEhvb2tzIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGlzRXF1YWxzKGE6IENoYXRSZXF1ZXN0SG9va3MgfCB1bmRlZmluZWQsIGI6IENoYXRSZXF1ZXN0SG9va3MgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGhvb2tUeXBlIG9mIE9iamVjdC52YWx1ZXMoSG9va1R5cGUpKSB7XG5cdFx0XHRjb25zdCBhQXJyID0gYVtob29rVHlwZV07XG5cdFx0XHRjb25zdCBiQXJyID0gYltob29rVHlwZV07XG5cdFx0XHRpZiAoYUFycj8ubGVuZ3RoICE9PSBiQXJyPy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFBcnIgJiYgYkFycikge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGFBcnIubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRpZiAoIUlQYXJzZWRIb29rQ29tbWFuZC5pc0VxdWFscyhhQXJyW2ldLCBiQXJyW2ldKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG4vKipcbiAqIE1lcmdlcyB0d28gc2V0cyBvZiBob29rcyBieSBjb25jYXRlbmF0aW5nIHRoZSBjb21tYW5kIGFycmF5cyBmb3IgZWFjaCBob29rIHR5cGUuXG4gKiBBZGRpdGlvbmFsIGhvb2tzIGFyZSBhcHBlbmRlZCBhZnRlciB0aGUgYmFzZSBob29rcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlSG9va3MoYmFzZTogQ2hhdFJlcXVlc3RIb29rcyB8IHVuZGVmaW5lZCwgYWRkaXRpb25hbDogQ2hhdFJlcXVlc3RIb29rcyk6IENoYXRSZXF1ZXN0SG9va3Mge1xuXHRpZiAoIWJhc2UpIHtcblx0XHRyZXR1cm4gYWRkaXRpb25hbDtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDogUGFydGlhbDxSZWNvcmQ8SG9va1R5cGUsIHJlYWRvbmx5IElQYXJzZWRIb29rQ29tbWFuZFtdPj4gPSB7IC4uLmJhc2UgfTtcblx0Zm9yIChjb25zdCBob29rVHlwZSBvZiBPYmplY3QudmFsdWVzKEhvb2tUeXBlKSkge1xuXHRcdGNvbnN0IGJhc2VBcnIgPSBiYXNlW2hvb2tUeXBlXTtcblx0XHRjb25zdCBhZGRpdGlvbmFsQXJyID0gYWRkaXRpb25hbFtob29rVHlwZV07XG5cdFx0aWYgKGFkZGl0aW9uYWxBcnIgJiYgYWRkaXRpb25hbEFyci5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHRbaG9va1R5cGVdID0gYmFzZUFyciA/IFsuLi5iYXNlQXJyLCAuLi5hZGRpdGlvbmFsQXJyXSA6IGFkZGl0aW9uYWxBcnI7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQgYXMgQ2hhdFJlcXVlc3RIb29rcztcbn1cblxuLyoqXG4gKiBEZXNjcmlwdGlvbnMgZm9yIGhvb2sgY29tbWFuZCBmaWVsZHMsIHVzZWQgYnkgYm90aCB0aGUgSlNPTiBzY2hlbWEgYW5kIHRoZSBob3ZlciBwcm92aWRlci5cbiAqL1xuZXhwb3J0IGNvbnN0IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdHR5cGU6IG5scy5sb2NhbGl6ZSgnaG9vay50eXBlJywgJ011c3QgYmUgXCJjb21tYW5kXCIuJyksXG5cdGNvbW1hbmQ6IG5scy5sb2NhbGl6ZSgnaG9vay5jb21tYW5kJywgJ1RoZSBjb21tYW5kIHRvIGV4ZWN1dGUuIFRoaXMgaXMgdGhlIGRlZmF1bHQgY3Jvc3MtcGxhdGZvcm0gY29tbWFuZC4nKSxcblx0d2luZG93czogbmxzLmxvY2FsaXplKCdob29rLndpbmRvd3MnLCAnV2luZG93cy1zcGVjaWZpYyBjb21tYW5kLiBJZiBzcGVjaWZpZWQgYW5kIHJ1bm5pbmcgb24gV2luZG93cywgdGhpcyBvdmVycmlkZXMgdGhlIFwiY29tbWFuZFwiIGZpZWxkLicpLFxuXHRsaW51eDogbmxzLmxvY2FsaXplKCdob29rLmxpbnV4JywgJ0xpbnV4LXNwZWNpZmljIGNvbW1hbmQuIElmIHNwZWNpZmllZCBhbmQgcnVubmluZyBvbiBMaW51eCwgdGhpcyBvdmVycmlkZXMgdGhlIFwiY29tbWFuZFwiIGZpZWxkLicpLFxuXHRvc3g6IG5scy5sb2NhbGl6ZSgnaG9vay5vc3gnLCAnbWFjT1Mtc3BlY2lmaWMgY29tbWFuZC4gSWYgc3BlY2lmaWVkIGFuZCBydW5uaW5nIG9uIG1hY09TLCB0aGlzIG92ZXJyaWRlcyB0aGUgXCJjb21tYW5kXCIgZmllbGQuJyksXG5cdGJhc2g6IG5scy5sb2NhbGl6ZSgnaG9vay5iYXNoJywgJ0Jhc2ggY29tbWFuZCBmb3IgTGludXggYW5kIG1hY09TLicpLFxuXHRwb3dlcnNoZWxsOiBubHMubG9jYWxpemUoJ2hvb2sucG93ZXJzaGVsbCcsICdQb3dlclNoZWxsIGNvbW1hbmQgZm9yIFdpbmRvd3MuJyksXG5cdGN3ZDogbmxzLmxvY2FsaXplKCdob29rLmN3ZCcsICdXb3JraW5nIGRpcmVjdG9yeSBmb3IgdGhlIHNjcmlwdCAocmVsYXRpdmUgdG8gcmVwb3NpdG9yeSByb290KS4nKSxcblx0ZW52OiBubHMubG9jYWxpemUoJ2hvb2suZW52JywgJ0FkZGl0aW9uYWwgZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXQgYXJlIG1lcmdlZCB3aXRoIHRoZSBleGlzdGluZyBlbnZpcm9ubWVudC4nKSxcblx0dGltZW91dDogbmxzLmxvY2FsaXplKCdob29rLnRpbWVvdXQnLCAnTWF4aW11bSBleGVjdXRpb24gdGltZSBpbiBzZWNvbmRzIChkZWZhdWx0OiAzMCkuJyksXG5cdHRpbWVvdXRTZWM6IG5scy5sb2NhbGl6ZSgnaG9vay50aW1lb3V0U2VjJywgJ01heGltdW0gZXhlY3V0aW9uIHRpbWUgaW4gc2Vjb25kcyAoZGVmYXVsdDogMTApLicpLFxufTtcblxuLyoqXG4gKiBKU09OIFNjaGVtYSBmb3IgR2l0SHViIENvcGlsb3QgaG9vayBjb25maWd1cmF0aW9uIGZpbGVzLlxuICogSG9va3MgZW5hYmxlIGV4ZWN1dGluZyBjdXN0b20gc2hlbGwgY29tbWFuZHMgYXQgc3RyYXRlZ2ljIHBvaW50cyBpbiBhbiBhZ2VudCdzIHdvcmtmbG93LlxuICovXG5jb25zdCB2c2NvZGVIb29rQ29tbWFuZFNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0cmVxdWlyZWQ6IFsndHlwZSddLFxuXHRhbnlPZjogW1xuXHRcdHsgcmVxdWlyZWQ6IFsnY29tbWFuZCddIH0sXG5cdFx0eyByZXF1aXJlZDogWyd3aW5kb3dzJ10gfSxcblx0XHR7IHJlcXVpcmVkOiBbJ2xpbnV4J10gfSxcblx0XHR7IHJlcXVpcmVkOiBbJ29zeCddIH0sXG5cdFx0eyByZXF1aXJlZDogWydiYXNoJ10gfSxcblx0XHR7IHJlcXVpcmVkOiBbJ3Bvd2Vyc2hlbGwnXSB9XG5cdF0sXG5cdGVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdob29rLmNvbW1hbmRSZXF1aXJlZCcsICdBdCBsZWFzdCBvbmUgb2YgXCJjb21tYW5kXCIsIFwid2luZG93c1wiLCBcImxpbnV4XCIsIG9yIFwib3N4XCIgbXVzdCBiZSBzcGVjaWZpZWQuJyksXG5cdHByb3BlcnRpZXM6IHtcblx0XHR0eXBlOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnY29tbWFuZCddLFxuXHRcdFx0ZGVzY3JpcHRpb246IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlMudHlwZVxuXHRcdH0sXG5cdFx0Y29tbWFuZDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogSE9PS19DT01NQU5EX0ZJRUxEX0RFU0NSSVBUSU9OUy5jb21tYW5kXG5cdFx0fSxcblx0XHR3aW5kb3dzOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TLndpbmRvd3Ncblx0XHR9LFxuXHRcdGxpbnV4OiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TLmxpbnV4XG5cdFx0fSxcblx0XHRvc3g6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlMub3N4XG5cdFx0fSxcblx0XHRjd2Q6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlMuY3dkXG5cdFx0fSxcblx0XHRlbnY6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdGRlc2NyaXB0aW9uOiBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TLmVudlxuXHRcdH0sXG5cdFx0dGltZW91dDoge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiAzMCxcblx0XHRcdGRlc2NyaXB0aW9uOiBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TLnRpbWVvdXRcblx0XHR9XG5cdH1cbn07XG5cbmNvbnN0IGhvb2tBcnJheVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdhcnJheScsXG5cdGl0ZW1zOiB2c2NvZGVIb29rQ29tbWFuZFNjaGVtYVxufTtcblxuLyoqXG4gKiBCdWlsZHMgSlNPTiBTY2hlbWEgaG9vayBwcm9wZXJ0aWVzIGZvciBhIGdpdmVuIHRhcmdldCBieSBsb29raW5nIHVwXG4gKiB0aGUgaG9vayBrZXlzIGZyb20gSE9PS1NfQllfVEFSR0VUIGFuZCBkZXNjcmlwdGlvbnMgZnJvbSBIT09LX01FVEFEQVRBLlxuICovXG5mdW5jdGlvbiBidWlsZEhvb2tQcm9wZXJ0aWVzKHRhcmdldDogVGFyZ2V0LCBhcnJheVNjaGVtYTogSUpTT05TY2hlbWEpOiBSZWNvcmQ8c3RyaW5nLCBJSlNPTlNjaGVtYT4ge1xuXHRyZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKFxuXHRcdE9iamVjdC5lbnRyaWVzKEhPT0tTX0JZX1RBUkdFVFt0YXJnZXRdKS5tYXAoKFtrZXksIGhvb2tUeXBlXSkgPT4gW1xuXHRcdFx0a2V5LFxuXHRcdFx0eyAuLi5hcnJheVNjaGVtYSwgZGVzY3JpcHRpb246IEhPT0tfTUVUQURBVEFbaG9va1R5cGVdPy5kZXNjcmlwdGlvbiB9XG5cdFx0XSlcblx0KTtcbn1cblxuLyoqXG4gKiBIb29rIHByb3BlcnRpZXMgZm9yIHRoZSBWUyBDb2RlIGZvcm1hdC5cbiAqL1xuY29uc3QgdnNjb2RlSG9va1Byb3BlcnRpZXM6IFJlY29yZDxzdHJpbmcsIElKU09OU2NoZW1hPiA9IGJ1aWxkSG9va1Byb3BlcnRpZXMoVGFyZ2V0LlZTQ29kZSwgaG9va0FycmF5U2NoZW1hKTtcblxuLyoqXG4gKiBIb29rIGNvbW1hbmQgc2NoZW1hIGZvciB0aGUgQ29waWxvdCBDTEkgZm9ybWF0LlxuICogQWRkcyBgYmFzaGAsIGBwb3dlcnNoZWxsYCwgYW5kIGB0aW1lb3V0U2VjYCBmaWVsZHMgYWxvbmdzaWRlIHRoZSBzdGFuZGFyZCBvbmVzLlxuICovXG5jb25zdCBjb3BpbG90Q2xpSG9va0NvbW1hbmRTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHRydWUsXG5cdHJlcXVpcmVkOiBbJ3R5cGUnXSxcblx0YW55T2Y6IFtcblx0XHR7IHJlcXVpcmVkOiBbJ2Jhc2gnXSB9LFxuXHRcdHsgcmVxdWlyZWQ6IFsncG93ZXJzaGVsbCddIH1cblx0XSxcblx0ZXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2hvb2suY2xpQ29tbWFuZFJlcXVpcmVkJywgJ0F0IGxlYXN0IG9uZSBvZiBcImJhc2hcIiBvciBcInBvd2Vyc2hlbGxcIiBtdXN0IGJlIHNwZWNpZmllZC4nKSxcblx0cHJvcGVydGllczoge1xuXHRcdHR5cGU6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydjb21tYW5kJ10sXG5cdFx0XHRkZXNjcmlwdGlvbjogSE9PS19DT01NQU5EX0ZJRUxEX0RFU0NSSVBUSU9OUy50eXBlXG5cdFx0fSxcblx0XHRiYXNoOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TLmJhc2hcblx0XHR9LFxuXHRcdHBvd2Vyc2hlbGw6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlMucG93ZXJzaGVsbFxuXHRcdH0sXG5cdFx0Y3dkOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBIT09LX0NPTU1BTkRfRklFTERfREVTQ1JJUFRJT05TLmN3ZFxuXHRcdH0sXG5cdFx0ZW52OiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogSE9PS19DT01NQU5EX0ZJRUxEX0RFU0NSSVBUSU9OUy5lbnZcblx0XHR9LFxuXHRcdHRpbWVvdXRTZWM6IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMTAsXG5cdFx0XHRkZXNjcmlwdGlvbjogSE9PS19DT01NQU5EX0ZJRUxEX0RFU0NSSVBUSU9OUy50aW1lb3V0U2VjXG5cdFx0fVxuXHR9XG59O1xuXG5jb25zdCBjb3BpbG90Q2xpSG9va0FycmF5U2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ2FycmF5Jyxcblx0aXRlbXM6IGNvcGlsb3RDbGlIb29rQ29tbWFuZFNjaGVtYVxufTtcblxuLyoqXG4gKiBIb29rIHByb3BlcnRpZXMgZm9yIHRoZSBDb3BpbG90IENMSSBmb3JtYXQuXG4gKi9cbmNvbnN0IGNvcGlsb3RDbGlIb29rUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgSUpTT05TY2hlbWE+ID0gYnVpbGRIb29rUHJvcGVydGllcyhUYXJnZXQuR2l0SHViQ29waWxvdCwgY29waWxvdENsaUhvb2tBcnJheVNjaGVtYSk7XG5cbmV4cG9ydCBjb25zdCBob29rRmlsZVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdCRzY2hlbWE6ICdodHRwOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA3L3NjaGVtYSMnLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaG9va0ZpbGUuZGVzY3JpcHRpb24nLCAnR2l0SHViIENvcGlsb3QgaG9vayBjb25maWd1cmF0aW9uIGZpbGUuIEhvb2tzIGVuYWJsZSBleGVjdXRpbmcgY3VzdG9tIHNoZWxsIGNvbW1hbmRzIGF0IHN0cmF0ZWdpYyBwb2ludHMgaW4gYW4gYWdlbnRcXCdzIHdvcmtmbG93LicpLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0cmVxdWlyZWQ6IFsnaG9va3MnXSxcblx0cHJvcGVydGllczoge1xuXHRcdGhvb2tzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvb2tGaWxlLmhvb2tzJywgJ0hvb2sgZGVmaW5pdGlvbnMgb3JnYW5pemVkIGJ5IHR5cGUuJyksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogdHJ1ZSxcblx0XHR9XG5cdH0sXG5cdC8vIENvbmRpdGlvbmFsbHkgYXBwbHkgUGFzY2FsQ2FzZSBvciBjYW1lbENhc2UgaG9vayBwcm9wZXJ0aWVzIGJhc2VkIG9uXG5cdC8vIHdoZXRoZXIgdGhlIGZpbGUgdXNlcyB0aGUgQ29waWxvdCBDTEkgZm9ybWF0IChkZXRlY3RlZCBieSB0aGUgXCJ2ZXJzaW9uXCIgZmllbGQpLlxuXHRpZjoge1xuXHRcdHJlcXVpcmVkOiBbJ3ZlcnNpb24nXSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHR2ZXJzaW9uOiB7IHR5cGU6ICdudW1iZXInIH1cblx0XHR9XG5cdH0sXG5cdHRoZW46IHtcblx0XHQvLyBDb3BpbG90IENMSSBmb3JtYXQ6IGNhbWVsQ2FzZSBob29rIG5hbWVzLCBiYXNoL3Bvd2Vyc2hlbGwvdGltZW91dFNlYyBmaWVsZHNcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHR2ZXJzaW9uOiB7XG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob29rRmlsZS52ZXJzaW9uJywgJ0hvb2sgY29uZmlndXJhdGlvbiBmb3JtYXQgdmVyc2lvbi4nKSxcblx0XHRcdH0sXG5cdFx0XHRob29rczoge1xuXHRcdFx0XHRwcm9wZXJ0aWVzOiBjb3BpbG90Q2xpSG9va1Byb3BlcnRpZXNcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdGVsc2U6IHtcblx0XHQvLyBWUyBDb2RlIC8gUGFzY2FsQ2FzZSBmb3JtYXRcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRob29rczoge1xuXHRcdFx0XHRwcm9wZXJ0aWVzOiB2c2NvZGVIb29rUHJvcGVydGllc1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0e1xuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnaG9va0ZpbGUuc25pcHBldC5iYXNpYycsICdCYXNpYyBob29rIGNvbmZpZ3VyYXRpb24nKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvb2tGaWxlLnNuaXBwZXQuYmFzaWMuZGVzY3JpcHRpb24nLCAnQSBiYXNpYyBob29rIGNvbmZpZ3VyYXRpb24gd2l0aCBjb21tb24gaG9va3MnKSxcblx0XHRcdGJvZHk6IHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRTZXNzaW9uU3RhcnQ6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiAnJHsxOmVjaG8gXCJTZXNzaW9uIHN0YXJ0ZWRcIiA+PiBzZXNzaW9uLmxvZ30nLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6ICckezI6Li9zY3JpcHRzL3ZhbGlkYXRlLnNofScsXG5cdFx0XHRcdFx0XHRcdHRpbWVvdXQ6IDE1XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRdXG59O1xuXG4vKipcbiAqIFVSSSBmb3IgdGhlIGhvb2sgc2NoZW1hIHJlZ2lzdHJhdGlvbi5cbiAqL1xuZXhwb3J0IGNvbnN0IEhPT0tfU0NIRU1BX1VSSSA9ICd2c2NvZGU6Ly9zY2hlbWFzL2hvb2tzJztcblxuLyoqXG4gKiBOb3JtYWxpemVzIGEgcmF3IGhvb2sgdHlwZSBpZGVudGlmaWVyIHRvIHRoZSBjYW5vbmljYWwgSG9va1R5cGUgZW51bSB2YWx1ZS5cbiAqIE9ubHkgbWF0Y2hlcyBleGFjdCBlbnVtIHZhbHVlcy4gRm9yIHRvb2wtc3BlY2lmaWMgbmFtaW5nIGNvbnZlbnRpb25zIChlLmcuLCBDbGF1ZGUsIENvcGlsb3QgQ0xJKSxcbiAqIHVzZSB0aGUgY29ycmVzcG9uZGluZyBjb21wYXQgbW9kdWxlJ3MgcmVzb2x2ZXIgZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b0hvb2tUeXBlKHJhd0hvb2tUeXBlSWQ6IHN0cmluZyk6IEhvb2tUeXBlIHwgdW5kZWZpbmVkIHtcblx0aWYgKE9iamVjdC52YWx1ZXMoSG9va1R5cGUpLmluY2x1ZGVzKHJhd0hvb2tUeXBlSWQgYXMgSG9va1R5cGUpKSB7XG5cdFx0cmV0dXJuIHJhd0hvb2tUeXBlSWQgYXMgSG9va1R5cGU7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBOb3JtYWxpemVzIGEgcmF3IGhvb2sgY29tbWFuZCBvYmplY3QsIHZhbGlkYXRpbmcgc3RydWN0dXJlLlxuICogTWFwcyBsZWdhY3kgYmFzaC9wb3dlcnNoZWxsIGZpZWxkcyB0byBwbGF0Zm9ybS1zcGVjaWZpYyBvdmVycmlkZXM6XG4gKiAtIGJhc2ggLT4gbGludXggKyBvc3hcbiAqIC0gcG93ZXJzaGVsbCAtPiB3aW5kb3dzXG4gKiBUaGlzIGlzIGFuIGludGVybmFsIGhlbHBlciAtIHVzZSByZXNvbHZlSG9va0NvbW1hbmQgZm9yIHRoZSBmdWxsIHJlc29sdXRpb24uXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUhvb2tDb21tYW5kKHJhdzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB7IGNvbW1hbmQ/OiBzdHJpbmc7IHdpbmRvd3M/OiBzdHJpbmc7IGxpbnV4Pzogc3RyaW5nOyBvc3g/OiBzdHJpbmc7IHdpbmRvd3NTb3VyY2U/OiAnd2luZG93cycgfCAncG93ZXJzaGVsbCc7IGxpbnV4U291cmNlPzogJ2xpbnV4JyB8ICdiYXNoJzsgb3N4U291cmNlPzogJ29zeCcgfCAnYmFzaCc7IGN3ZD86IHN0cmluZzsgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgdGltZW91dD86IG51bWJlciB9IHwgdW5kZWZpbmVkIHtcblx0aWYgKHJhdy50eXBlICE9PSAnY29tbWFuZCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgaGFzQ29tbWFuZCA9IHR5cGVvZiByYXcuY29tbWFuZCA9PT0gJ3N0cmluZycgJiYgcmF3LmNvbW1hbmQubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzQmFzaCA9IHR5cGVvZiByYXcuYmFzaCA9PT0gJ3N0cmluZycgJiYgKHJhdy5iYXNoIGFzIHN0cmluZykubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzUG93ZXJTaGVsbCA9IHR5cGVvZiByYXcucG93ZXJzaGVsbCA9PT0gJ3N0cmluZycgJiYgKHJhdy5wb3dlcnNoZWxsIGFzIHN0cmluZykubGVuZ3RoID4gMDtcblxuXHQvLyBQbGF0Zm9ybSBvdmVycmlkZXMgY2FuIGJlIHN0cmluZ3MgZGlyZWN0bHlcblx0Y29uc3QgaGFzV2luZG93cyA9IHR5cGVvZiByYXcud2luZG93cyA9PT0gJ3N0cmluZycgJiYgKHJhdy53aW5kb3dzIGFzIHN0cmluZykubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzTGludXggPSB0eXBlb2YgcmF3LmxpbnV4ID09PSAnc3RyaW5nJyAmJiAocmF3LmxpbnV4IGFzIHN0cmluZykubGVuZ3RoID4gMDtcblx0Y29uc3QgaGFzT3N4ID0gdHlwZW9mIHJhdy5vc3ggPT09ICdzdHJpbmcnICYmIChyYXcub3N4IGFzIHN0cmluZykubGVuZ3RoID4gMDtcblxuXHQvLyBNYXAgYmFzaCAtPiBsaW51eCArIG9zeCAoaWYgbm90IGFscmVhZHkgc3BlY2lmaWVkKVxuXHQvLyBNYXAgcG93ZXJzaGVsbCAtPiB3aW5kb3dzIChpZiBub3QgYWxyZWFkeSBzcGVjaWZpZWQpXG5cdGNvbnN0IHdpbmRvd3MgPSBoYXNXaW5kb3dzID8gcmF3LndpbmRvd3MgYXMgc3RyaW5nIDogKGhhc1Bvd2VyU2hlbGwgPyByYXcucG93ZXJzaGVsbCBhcyBzdHJpbmcgOiB1bmRlZmluZWQpO1xuXHRjb25zdCBsaW51eCA9IGhhc0xpbnV4ID8gcmF3LmxpbnV4IGFzIHN0cmluZyA6IChoYXNCYXNoID8gcmF3LmJhc2ggYXMgc3RyaW5nIDogdW5kZWZpbmVkKTtcblx0Y29uc3Qgb3N4ID0gaGFzT3N4ID8gcmF3Lm9zeCBhcyBzdHJpbmcgOiAoaGFzQmFzaCA/IHJhdy5iYXNoIGFzIHN0cmluZyA6IHVuZGVmaW5lZCk7XG5cblx0Ly8gVHJhY2sgc291cmNlIGZpZWxkIG5hbWVzIGZvciBlZGl0b3IgZm9jdXMgKHdoaWNoIEpTT04gZmllbGQgdG8gaGlnaGxpZ2h0KVxuXHRjb25zdCB3aW5kb3dzU291cmNlOiAnd2luZG93cycgfCAncG93ZXJzaGVsbCcgfCB1bmRlZmluZWQgPSBoYXNXaW5kb3dzID8gJ3dpbmRvd3MnIDogKGhhc1Bvd2VyU2hlbGwgPyAncG93ZXJzaGVsbCcgOiB1bmRlZmluZWQpO1xuXHRjb25zdCBsaW51eFNvdXJjZTogJ2xpbnV4JyB8ICdiYXNoJyB8IHVuZGVmaW5lZCA9IGhhc0xpbnV4ID8gJ2xpbnV4JyA6IChoYXNCYXNoID8gJ2Jhc2gnIDogdW5kZWZpbmVkKTtcblx0Y29uc3Qgb3N4U291cmNlOiAnb3N4JyB8ICdiYXNoJyB8IHVuZGVmaW5lZCA9IGhhc09zeCA/ICdvc3gnIDogKGhhc0Jhc2ggPyAnYmFzaCcgOiB1bmRlZmluZWQpO1xuXG5cdHJldHVybiB7XG5cdFx0Li4uKGhhc0NvbW1hbmQgJiYgeyBjb21tYW5kOiByYXcuY29tbWFuZCBhcyBzdHJpbmcgfSksXG5cdFx0Li4uKHdpbmRvd3MgJiYgeyB3aW5kb3dzIH0pLFxuXHRcdC4uLihsaW51eCAmJiB7IGxpbnV4IH0pLFxuXHRcdC4uLihvc3ggJiYgeyBvc3ggfSksXG5cdFx0Li4uKHdpbmRvd3NTb3VyY2UgJiYgeyB3aW5kb3dzU291cmNlIH0pLFxuXHRcdC4uLihsaW51eFNvdXJjZSAmJiB7IGxpbnV4U291cmNlIH0pLFxuXHRcdC4uLihvc3hTb3VyY2UgJiYgeyBvc3hTb3VyY2UgfSksXG5cdFx0Li4uKHR5cGVvZiByYXcuY3dkID09PSAnc3RyaW5nJyAmJiB7IGN3ZDogcmF3LmN3ZCB9KSxcblx0XHQuLi4odHlwZW9mIHJhdy5lbnYgPT09ICdvYmplY3QnICYmIHJhdy5lbnYgIT09IG51bGwgJiYgeyBlbnY6IHJhdy5lbnYgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9KSxcblx0XHQuLi4odHlwZW9mIHJhdy50aW1lb3V0ICE9PSAnbnVtYmVyJyAmJiB0eXBlb2YgcmF3LnRpbWVvdXRTZWMgPT09ICdudW1iZXInICYmIHsgdGltZW91dDogcmF3LnRpbWVvdXRTZWMgfSksXG5cdFx0Li4uKHR5cGVvZiByYXcudGltZW91dCA9PT0gJ251bWJlcicgJiYgeyB0aW1lb3V0OiByYXcudGltZW91dCB9KSxcblx0fTtcbn1cblxuLyoqXG4gKiBHZXRzIGEgbGFiZWwgZm9yIHRoZSBnaXZlbiBwbGF0Zm9ybS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFBsYXRmb3JtTGFiZWwob3M6IE9wZXJhdGluZ1N5c3RlbSk6IHN0cmluZyB7XG5cdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRyZXR1cm4gJ1dpbmRvd3MnO1xuXHR9IGVsc2UgaWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSB7XG5cdFx0cmV0dXJuICdtYWNPUyc7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCkge1xuXHRcdHJldHVybiAnTGludXgnO1xuXHR9XG5cdHJldHVybiAnJztcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgZWZmZWN0aXZlIGNvbW1hbmQgZm9yIHRoZSBnaXZlbiBwbGF0Zm9ybS5cbiAqIFRoaXMgYXBwbGllcyBPUy1zcGVjaWZpYyBvdmVycmlkZXMgKHdpbmRvd3MsIGxpbnV4LCBvc3gpIHRvIGdldCB0aGUgYWN0dWFsIGNvbW1hbmQgdGhhdCB3aWxsIGJlIGV4ZWN1dGVkLlxuICogU2ltaWxhciB0byBob3cgbGF1bmNoLmpzb24gaGFuZGxlcyBwbGF0Zm9ybS1zcGVjaWZpYyBjb25maWd1cmF0aW9ucyBpbiBkZWJ1Z0FkYXB0ZXIudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rOiBJUGFyc2VkSG9va0NvbW1hbmQsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHQvLyBTZWxlY3QgdGhlIHBsYXRmb3JtLXNwZWNpZmljIG92ZXJyaWRlIGJhc2VkIG9uIHRoZSBPU1xuXHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzICYmIGhvb2sud2luZG93cykge1xuXHRcdHJldHVybiBob29rLndpbmRvd3M7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggJiYgaG9vay5vc3gpIHtcblx0XHRyZXR1cm4gaG9vay5vc3g7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCAmJiBob29rLmxpbnV4KSB7XG5cdFx0cmV0dXJuIGhvb2subGludXg7XG5cdH1cblxuXHQvLyBGYWxsIGJhY2sgdG8gdGhlIGRlZmF1bHQgY29tbWFuZFxuXHRyZXR1cm4gaG9vay5jb21tYW5kO1xufVxuXG4vKipcbiAqIENoZWNrcyBpZiB0aGUgaG9vayBpcyB1c2luZyBhIHBsYXRmb3JtLXNwZWNpZmljIGNvbW1hbmQgb3ZlcnJpZGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1VzaW5nUGxhdGZvcm1PdmVycmlkZShob29rOiBJUGFyc2VkSG9va0NvbW1hbmQsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBib29sZWFuIHtcblx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyAmJiBob29rLndpbmRvd3MpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBlbHNlIGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCAmJiBob29rLm9zeCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGVsc2UgaWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTGludXggJiYgaG9vay5saW51eCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBzb3VyY2Ugc2hlbGwgdHlwZSBmb3IgdGhlIGVmZmVjdGl2ZSBjb21tYW5kIG9uIHRoZSBnaXZlbiBwbGF0Zm9ybS5cbiAqIFJldHVybnMgJ3Bvd2Vyc2hlbGwnIGlmIHRoZSBXaW5kb3dzIGNvbW1hbmQgY2FtZSBmcm9tIGEgcG93ZXJzaGVsbCBmaWVsZCxcbiAqICdiYXNoJyBpZiB0aGUgTGludXgvbWFjT1MgY29tbWFuZCBjYW1lIGZyb20gYSBiYXNoIGZpZWxkLFxuICogb3IgdW5kZWZpbmVkIGZvciBkZWZhdWx0IHNoZWxsIGhhbmRsaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0RWZmZWN0aXZlQ29tbWFuZFNvdXJjZShob29rOiBJSG9va0NvbW1hbmQsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiAncG93ZXJzaGVsbCcgfCAnYmFzaCcgfCB1bmRlZmluZWQge1xuXHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzICYmIGhvb2sud2luZG93cyAmJiBob29rLndpbmRvd3NTb3VyY2UgPT09ICdwb3dlcnNoZWxsJykge1xuXHRcdHJldHVybiAncG93ZXJzaGVsbCc7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggJiYgaG9vay5vc3ggJiYgaG9vay5vc3hTb3VyY2UgPT09ICdiYXNoJykge1xuXHRcdHJldHVybiAnYmFzaCc7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCAmJiBob29rLmxpbnV4ICYmIGhvb2subGludXhTb3VyY2UgPT09ICdiYXNoJykge1xuXHRcdHJldHVybiAnYmFzaCc7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSBvcmlnaW5hbCBKU09OIGZpZWxkIGtleSBuYW1lIGZvciB0aGUgZ2l2ZW4gcGxhdGZvcm0ncyBjb21tYW5kLlxuICogUmV0dXJucyB0aGUgYWN0dWFsIGZpZWxkIG5hbWUgZnJvbSB0aGUgSlNPTiAoZS5nLiwgJ2Jhc2gnIGluc3RlYWQgb2YgJ29zeCcgaWYgYmFzaCB3YXMgdXNlZCkuXG4gKiBUaGlzIGlzIHVzZWQgZm9yIGVkaXRvciBmb2N1cyB0byBoaWdobGlnaHQgdGhlIGNvcnJlY3QgZmllbGQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZmZlY3RpdmVDb21tYW5kRmllbGRLZXkoaG9vazogSUhvb2tDb21tYW5kIHwgSVBhcnNlZEhvb2tDb21tYW5kLCBvczogT3BlcmF0aW5nU3lzdGVtKTogc3RyaW5nIHtcblx0Y29uc3QgaCA9IGhvb2sgYXMgUGFydGlhbDxJSG9va0NvbW1hbmQ+O1xuXHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzICYmIGhvb2sud2luZG93cykge1xuXHRcdHJldHVybiBoLndpbmRvd3NTb3VyY2UgPz8gJ3dpbmRvd3MnO1xuXHR9IGVsc2UgaWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoICYmIGhvb2sub3N4KSB7XG5cdFx0cmV0dXJuIGgub3N4U291cmNlID8/ICdvc3gnO1xuXHR9IGVsc2UgaWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTGludXggJiYgaG9vay5saW51eCkge1xuXHRcdHJldHVybiBoLmxpbnV4U291cmNlID8/ICdsaW51eCc7XG5cdH1cblx0cmV0dXJuICdjb21tYW5kJztcbn1cblxuLyoqXG4gKiBGb3JtYXRzIGEgaG9vayBjb21tYW5kIGZvciBkaXNwbGF5LlxuICogUmVzb2x2ZXMgT1Mtc3BlY2lmaWMgb3ZlcnJpZGVzIHRvIHNob3cgdGhlIGVmZmVjdGl2ZSBjb21tYW5kIGZvciB0aGUgZ2l2ZW4gcGxhdGZvcm0uXG4gKiBJZiB1c2luZyBhIHBsYXRmb3JtLXNwZWNpZmljIG92ZXJyaWRlLCBpbmNsdWRlcyB0aGUgcGxhdGZvcm0gYXMgYSBwcmVmaXggYmFkZ2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRIb29rQ29tbWFuZExhYmVsKGhvb2s6IElQYXJzZWRIb29rQ29tbWFuZCwgb3M6IE9wZXJhdGluZ1N5c3RlbSk6IHN0cmluZyB7XG5cdGNvbnN0IGNvbW1hbmQgPSByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBvcyk7XG5cdGlmICghY29tbWFuZCkge1xuXHRcdHJldHVybiAnJztcblx0fVxuXHRyZXR1cm4gY29tbWFuZDtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhIHJhdyBob29rIGNvbW1hbmQgb2JqZWN0IHRvIHRoZSBjYW5vbmljYWwgSUhvb2tDb21tYW5kIGZvcm1hdC5cbiAqIE5vcm1hbGl6ZXMgdGhlIGNvbW1hbmQgYW5kIHJlc29sdmVzIHRoZSBjd2QgcGF0aCByZWxhdGl2ZSB0byB0aGUgd29ya3NwYWNlIHJvb3QuXG4gKiBAcGFyYW0gcmF3IFRoZSByYXcgaG9vayBjb21tYW5kIG9iamVjdCBmcm9tIEpTT05cbiAqIEBwYXJhbSB3b3Jrc3BhY2VSb290VXJpIFRoZSB3b3Jrc3BhY2Ugcm9vdCBVUkkgdG8gcmVzb2x2ZSByZWxhdGl2ZSBjd2QgcGF0aHMgYWdhaW5zdFxuICogQHBhcmFtIHVzZXJIb21lIFRoZSB1c2VyJ3MgaG9tZSBkaXJlY3RvcnkgcGF0aCBmb3IgdGlsZGUgZXhwYW5zaW9uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlSG9va0NvbW1hbmQocmF3OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgd29ya3NwYWNlUm9vdFVyaTogVVJJIHwgdW5kZWZpbmVkLCB1c2VySG9tZTogc3RyaW5nKTogSUhvb2tDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUhvb2tDb21tYW5kKHJhdyk7XG5cdGlmICghbm9ybWFsaXplZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgY3dkVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdGlmIChub3JtYWxpemVkLmN3ZCkge1xuXHRcdC8vIEV4cGFuZCB0aWxkZSB0byB1c2VyIGhvbWUgZGlyZWN0b3J5XG5cdFx0Y29uc3QgZXhwYW5kZWRDd2QgPSB1bnRpbGRpZnkobm9ybWFsaXplZC5jd2QsIHVzZXJIb21lKTtcblx0XHRpZiAoaXNBYnNvbHV0ZShleHBhbmRlZEN3ZCkpIHtcblx0XHRcdC8vIFVzZSBhYnNvbHV0ZSBwYXRoIGRpcmVjdGx5XG5cdFx0XHRjd2RVcmkgPSBVUkkuZmlsZShleHBhbmRlZEN3ZCk7XG5cdFx0fSBlbHNlIGlmICh3b3Jrc3BhY2VSb290VXJpKSB7XG5cdFx0XHQvLyBSZXNvbHZlIHJlbGF0aXZlIHRvIHdvcmtzcGFjZSByb290XG5cdFx0XHRjd2RVcmkgPSBqb2luUGF0aCh3b3Jrc3BhY2VSb290VXJpLCBleHBhbmRlZEN3ZCk7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdGN3ZFVyaSA9IHdvcmtzcGFjZVJvb3RVcmk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHQuLi4obm9ybWFsaXplZC5jb21tYW5kICYmIHsgY29tbWFuZDogbm9ybWFsaXplZC5jb21tYW5kIH0pLFxuXHRcdC4uLihub3JtYWxpemVkLndpbmRvd3MgJiYgeyB3aW5kb3dzOiBub3JtYWxpemVkLndpbmRvd3MgfSksXG5cdFx0Li4uKG5vcm1hbGl6ZWQubGludXggJiYgeyBsaW51eDogbm9ybWFsaXplZC5saW51eCB9KSxcblx0XHQuLi4obm9ybWFsaXplZC5vc3ggJiYgeyBvc3g6IG5vcm1hbGl6ZWQub3N4IH0pLFxuXHRcdC4uLihub3JtYWxpemVkLndpbmRvd3NTb3VyY2UgJiYgeyB3aW5kb3dzU291cmNlOiBub3JtYWxpemVkLndpbmRvd3NTb3VyY2UgfSksXG5cdFx0Li4uKG5vcm1hbGl6ZWQubGludXhTb3VyY2UgJiYgeyBsaW51eFNvdXJjZTogbm9ybWFsaXplZC5saW51eFNvdXJjZSB9KSxcblx0XHQuLi4obm9ybWFsaXplZC5vc3hTb3VyY2UgJiYgeyBvc3hTb3VyY2U6IG5vcm1hbGl6ZWQub3N4U291cmNlIH0pLFxuXHRcdC4uLihjd2RVcmkgJiYgeyBjd2Q6IGN3ZFVyaSB9KSxcblx0XHQuLi4obm9ybWFsaXplZC5lbnYgJiYgeyBlbnY6IG5vcm1hbGl6ZWQuZW52IH0pLFxuXHRcdC4uLihub3JtYWxpemVkLnRpbWVvdXQgIT09IHVuZGVmaW5lZCAmJiB7IHRpbWVvdXQ6IG5vcm1hbGl6ZWQudGltZW91dCB9KSxcblx0fTtcbn1cblxuLyoqXG4gKiBIZWxwZXIgdG8gZXh0cmFjdCBob29rIGNvbW1hbmRzIGZyb20gYW4gaXRlbSB0aGF0IGNvdWxkIGJlOlxuICogMS4gQSBkaXJlY3QgY29tbWFuZCBvYmplY3Q6IHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnLi4uJyB9XG4gKiAyLiBBIG5lc3RlZCBzdHJ1Y3R1cmUgd2l0aCBtYXRjaGVyIChDbGF1ZGUgc3R5bGUpOiB7IG1hdGNoZXI6ICcuLi4nLCBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnLi4uJyB9XSB9XG4gKlxuICogVGhpcyBhbGxvd3MgQ29waWxvdCBmb3JtYXQgdG8gaGFuZGxlIENsYXVkZS1zdHlsZSBlbnRyaWVzIGlmIHBhc3RlZC5cbiAqIEFsc28gaGFuZGxlcyBDbGF1ZGUncyBsZW5pZW5jeSB3aGVyZSAndHlwZScgZmllbGQgY2FuIGJlIG9taXR0ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0oXG5cdGl0ZW06IHVua25vd24sXG5cdHdvcmtzcGFjZVJvb3RVcmk6IFVSSSB8IHVuZGVmaW5lZCxcblx0dXNlckhvbWU6IHN0cmluZ1xuKTogSUhvb2tDb21tYW5kW10ge1xuXHRpZiAoIWl0ZW0gfHwgdHlwZW9mIGl0ZW0gIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgaXRlbU9iaiA9IGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGNvbnN0IGNvbW1hbmRzOiBJSG9va0NvbW1hbmRbXSA9IFtdO1xuXG5cdC8vIENoZWNrIGZvciBuZXN0ZWQgaG9va3Mgd2l0aCBtYXRjaGVyIChDbGF1ZGUgc3R5bGUpOiB7IG1hdGNoZXI6IFwiLi4uXCIsIGhvb2tzOiBbLi4uXSB9XG5cdGNvbnN0IG5lc3RlZEhvb2tzID0gaXRlbU9iai5ob29rcztcblx0aWYgKG5lc3RlZEhvb2tzICE9PSB1bmRlZmluZWQgJiYgQXJyYXkuaXNBcnJheShuZXN0ZWRIb29rcykpIHtcblx0XHRmb3IgKGNvbnN0IG5lc3RlZEhvb2sgb2YgbmVzdGVkSG9va3MpIHtcblx0XHRcdGlmICghbmVzdGVkSG9vayB8fCB0eXBlb2YgbmVzdGVkSG9vayAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplRm9yUmVzb2x2ZShuZXN0ZWRIb29rIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZUhvb2tDb21tYW5kKG5vcm1hbGl6ZWQsIHdvcmtzcGFjZVJvb3RVcmksIHVzZXJIb21lKTtcblx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKHJlc29sdmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Ly8gRGlyZWN0IGNvbW1hbmQgb2JqZWN0XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUZvclJlc29sdmUoaXRlbU9iaik7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlSG9va0NvbW1hbmQobm9ybWFsaXplZCwgd29ya3NwYWNlUm9vdFVyaSwgdXNlckhvbWUpO1xuXHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0Y29tbWFuZHMucHVzaChyZXNvbHZlZCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNvbW1hbmRzO1xufVxuXG4vKipcbiAqIE5vcm1hbGl6ZXMgYSBob29rIGNvbW1hbmQgb2JqZWN0IGZvciByZXNvbHZpbmcuXG4gKiBDbGF1ZGUgZm9ybWF0IGFsbG93cyBvbWl0dGluZyB0aGUgJ3R5cGUnIGZpZWxkLCB0cmVhdGluZyBpdCBhcyAnY29tbWFuZCcuXG4gKiBUaGlzIGVuc3VyZXMgY29tcGF0aWJpbGl0eSB3aGVuIENsYXVkZS1zdHlsZSBob29rcyBhcmUgcGFzdGVkIGludG8gQ29waWxvdCBmb3JtYXQuXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUZvclJlc29sdmUocmF3OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0Ly8gSWYgdHlwZSBpcyBtaXNzaW5nIG9yIGFscmVhZHkgJ2NvbW1hbmQnLCBlbnN1cmUgaXQncyBzZXQgdG8gJ2NvbW1hbmQnXG5cdGlmIChyYXcudHlwZSA9PT0gdW5kZWZpbmVkIHx8IHJhdy50eXBlID09PSAnY29tbWFuZCcpIHtcblx0XHRyZXR1cm4geyAuLi5yYXcsIHR5cGU6ICdjb21tYW5kJyB9O1xuXHR9XG5cdHJldHVybiByYXc7XG59XG5cbi8qKlxuICogQ29udmVydHMgYW4ge0BsaW5rIElWYWx1ZX0gWUFNTCBBU1Qgbm9kZSBpbnRvIGEgcGxhaW4gSmF2YVNjcmlwdCB2YWx1ZVxuICogKHN0cmluZywgYXJyYXksIG9yIG9iamVjdCkgc3VpdGFibGUgZm9yIHBhc3NpbmcgdG8gaG9vayBwYXJzaW5nIGhlbHBlcnMuXG4gKi9cbmZ1bmN0aW9uIHlhbWxWYWx1ZVRvUGxhaW4odmFsdWU6IElWYWx1ZSk6IHVua25vd24ge1xuXHRzd2l0Y2ggKHZhbHVlLnR5cGUpIHtcblx0XHRjYXNlICdzY2FsYXInOlxuXHRcdFx0cmV0dXJuIHZhbHVlLnZhbHVlO1xuXHRcdGNhc2UgJ3NlcXVlbmNlJzpcblx0XHRcdHJldHVybiB2YWx1ZS5pdGVtcy5tYXAoeWFtbFZhbHVlVG9QbGFpbik7XG5cdFx0Y2FzZSAnbWFwJzoge1xuXHRcdFx0Y29uc3Qgb2JqOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBwcm9wIG9mIHZhbHVlLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0b2JqW3Byb3Aua2V5LnZhbHVlXSA9IHlhbWxWYWx1ZVRvUGxhaW4ocHJvcC52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gb2JqO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFBhcnNlcyBob29rcyBmcm9tIGEgc3ViYWdlbnQncyBZQU1MIGZyb250bWF0dGVyIGBob29rc2AgYXR0cmlidXRlLlxuICpcbiAqIFN1cHBvcnRzIHR3byBmb3JtYXRzIGZvciBob29rIGVudHJpZXM6XG4gKlxuICogMS4gKipEaXJlY3QgY29tbWFuZCoqIChvdXIgZm9ybWF0LCB3aXRob3V0IG1hdGNoZXIpOlxuICogYGBgeWFtbFxuICogaG9va3M6XG4gKiAgIFByZVRvb2xVc2U6XG4gKiAgICAgLSB0eXBlOiBjb21tYW5kXG4gKiAgICAgICBjb21tYW5kOiBcIi4vc2NyaXB0cy92YWxpZGF0ZS5zaFwiXG4gKiBgYGBcbiAqXG4gKiAyLiAqKk5lc3RlZCB3aXRoIG1hdGNoZXIqKiAoQ2xhdWRlIENvZGUgZm9ybWF0KTpcbiAqIGBgYHlhbWxcbiAqIGhvb2tzOlxuICogICBQcmVUb29sVXNlOlxuICogICAgIC0gbWF0Y2hlcjogXCJCYXNoXCJcbiAqICAgICAgIGhvb2tzOlxuICogICAgICAgICAtIHR5cGU6IGNvbW1hbmRcbiAqICAgICAgICAgICBjb21tYW5kOiBcIi4vc2NyaXB0cy92YWxpZGF0ZS5zaFwiXG4gKiBgYGBcbiAqXG4gKiBAcGFyYW0gaG9va3NNYXAgVGhlIHJhdyBZQU1MIG1hcCB2YWx1ZSBmcm9tIHRoZSBgaG9va3NgIGZyb250bWF0dGVyIGF0dHJpYnV0ZS5cbiAqIEBwYXJhbSB3b3Jrc3BhY2VSb290VXJpIFdvcmtzcGFjZSByb290IGZvciByZXNvbHZpbmcgcmVsYXRpdmUgYGN3ZGAgcGF0aHMuXG4gKiBAcGFyYW0gdXNlckhvbWUgVXNlciBob21lIGRpcmVjdG9yeSBwYXRoIGZvciB0aWxkZSBleHBhbnNpb24uXG4gKiBAcGFyYW0gdGFyZ2V0IFRoZSBhZ2VudCdzIHRhcmdldCwgdXNlZCB0byByZXNvbHZlIGhvb2sgdHlwZSBuYW1lcyBjb3JyZWN0bHkuXG4gKiBAcmV0dXJucyBSZXNvbHZlZCBob29rcyBvcmdhbml6ZWQgYnkgaG9vayB0eXBlLCByZWFkeSBmb3IgdXNlIGluIHtAbGluayBDaGF0UmVxdWVzdEhvb2tzfS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU3ViYWdlbnRIb29rc0Zyb21ZYW1sKFxuXHRob29rc01hcDogSU1hcFZhbHVlLFxuXHR3b3Jrc3BhY2VSb290VXJpOiBVUkkgfCB1bmRlZmluZWQsXG5cdHVzZXJIb21lOiBzdHJpbmcsXG5cdHRhcmdldDogVGFyZ2V0ID0gVGFyZ2V0LlVuZGVmaW5lZCxcbik6IENoYXRSZXF1ZXN0SG9va3Mge1xuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIElIb29rQ29tbWFuZFtdPiA9IHt9O1xuXHRjb25zdCB0YXJnZXRIb29rTWFwID0gSE9PS1NfQllfVEFSR0VUW3RhcmdldF0gPz8gSE9PS1NfQllfVEFSR0VUW1RhcmdldC5VbmRlZmluZWRdO1xuXG5cdGZvciAoY29uc3QgcHJvcCBvZiBob29rc01hcC5wcm9wZXJ0aWVzKSB7XG5cdFx0Y29uc3QgaG9va1R5cGVOYW1lID0gcHJvcC5rZXkudmFsdWU7XG5cblx0XHQvLyBSZXNvbHZlIGhvb2sgdHlwZSBuYW1lIHVzaW5nIHRoZSB0YXJnZXQncyBvd24gbWFwIGZpcnN0LCB0aGVuIGZhbGwgYmFjayB0byBjYW5vbmljYWwgbmFtZXNcblx0XHRjb25zdCBob29rVHlwZSA9IHRhcmdldEhvb2tNYXBbaG9va1R5cGVOYW1lXSA/PyB0b0hvb2tUeXBlKGhvb2tUeXBlTmFtZSk7XG5cdFx0aWYgKCFob29rVHlwZSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHZhbHVlIG11c3QgYmUgYSBzZXF1ZW5jZSAoYXJyYXkgb2YgaG9vayBlbnRyaWVzKVxuXHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmRzOiBJSG9va0NvbW1hbmRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHByb3AudmFsdWUuaXRlbXMpIHtcblx0XHRcdC8vIENvbnZlcnQgdGhlIFlBTUwgQVNUIG5vZGUgdG8gYSBwbGFpbiBvYmplY3Qgc28gdGhlIGV4aXN0aW5nXG5cdFx0XHQvLyBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0gaGVscGVyIGNhbiBoYW5kbGUgYm90aCBkaXJlY3Rcblx0XHRcdC8vIGNvbW1hbmRzIGFuZCBuZXN0ZWQgbWF0Y2hlciBzdHJ1Y3R1cmVzLlxuXHRcdFx0Y29uc3QgcGxhaW5JdGVtID0geWFtbFZhbHVlVG9QbGFpbihpdGVtKTtcblx0XHRcdGNvbnN0IGV4dHJhY3RlZCA9IGV4dHJhY3RIb29rQ29tbWFuZHNGcm9tSXRlbShwbGFpbkl0ZW0sIHdvcmtzcGFjZVJvb3RVcmksIHVzZXJIb21lKTtcblx0XHRcdGNvbW1hbmRzLnB1c2goLi4uZXh0cmFjdGVkKTtcblx0XHR9XG5cblx0XHRpZiAoY29tbWFuZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKCFyZXN1bHRbaG9va1R5cGVdKSB7XG5cdFx0XHRcdHJlc3VsdFtob29rVHlwZV0gPSBbXTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdFtob29rVHlwZV0ucHVzaCguLi5jb21tYW5kcyk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdCBhcyBDaGF0UmVxdWVzdEhvb2tzO1xu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
