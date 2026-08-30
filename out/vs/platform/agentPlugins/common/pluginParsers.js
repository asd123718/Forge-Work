import { parse as parseJSONC } from "../../../base/common/json.js";
import { cloneAndChange, equals as objectEquals } from "../../../base/common/objects.js";
import { isAbsolute } from "../../../base/common/path.js";
import { basename, extname, isEqualOrParent, joinPath, normalizePath, isEqual as isURLEquals, dirname } from "../../../base/common/resources.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { parseFrontMatter } from "../../../base/common/yaml.js";
import { McpServerType } from "../../mcp/common/mcpPlatformTypes.js";
import { CustomizationType, McpServerStatus } from "../../agentHost/common/state/protocol/state.js";
import { DEFAULT_MCP_APP } from "../../agentHost/common/state/protocol/mcpAppDefaults.js";
import { customizationId } from "../../agentHost/common/state/sessionState.js";
import { readAgentPluginManifest } from "./agentPluginParser.js";
var IParsedHookCommand;
((IParsedHookCommand2) => {
  function isEquals(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.command === b.command && a.windows === b.windows && a.linux === b.linux && a.osx === b.osx && isURLEquals(a.cwd, b.cwd) && objectEquals(a.env, b.env) && a.timeout === b.timeout && isURLEquals(a.sourceUri, b.sourceUri);
  }
  IParsedHookCommand2.isEquals = isEquals;
})(IParsedHookCommand || (IParsedHookCommand = {}));
var PluginFormat = /* @__PURE__ */ ((PluginFormat2) => {
  PluginFormat2[PluginFormat2["Copilot"] = 0] = "Copilot";
  PluginFormat2[PluginFormat2["Claude"] = 1] = "Claude";
  PluginFormat2[PluginFormat2["OpenPlugin"] = 2] = "OpenPlugin";
  PluginFormat2[PluginFormat2["AgentPlugin"] = 3] = "AgentPlugin";
  return PluginFormat2;
})(PluginFormat || {});
const COPILOT_FORMAT = {
  format: 0 /* Copilot */,
  manifestPath: "plugin.json",
  hookConfigPath: "hooks.json",
  pluginRootTokens: ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"],
  pluginRootEnvVars: ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"],
  parseHooks(hookUri, json, _pluginUri, workspaceRoot, userHome) {
    return parseHooksJson(hookUri, json, workspaceRoot, userHome);
  }
};
const CLAUDE_FORMAT = {
  format: 1 /* Claude */,
  manifestPath: ".claude-plugin/plugin.json",
  hookConfigPath: "hooks/hooks.json",
  pluginRootTokens: ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"],
  pluginRootEnvVars: ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"],
  parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
    return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, "${CLAUDE_PLUGIN_ROOT}", "CLAUDE_PLUGIN_ROOT");
  }
};
const OPEN_PLUGIN_FORMAT = {
  format: 2 /* OpenPlugin */,
  manifestPath: ".plugin/plugin.json",
  hookConfigPath: "hooks/hooks.json",
  pluginRootTokens: ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"],
  pluginRootEnvVars: ["PLUGIN_ROOT", "CLAUDE_PLUGIN_ROOT"],
  parseHooks(hookUri, json, pluginUri, workspaceRoot, userHome) {
    return interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, "${PLUGIN_ROOT}", "PLUGIN_ROOT");
  }
};
const AGENT_PLUGIN_COPILOT_EXTENSION_NAMESPACE = "com.github.copilot";
const AGENT_PLUGIN_FORMAT = {
  format: 3 /* AgentPlugin */,
  manifestPath: "plugin.json",
  hookConfigPath: `${AGENT_PLUGIN_COPILOT_EXTENSION_NAMESPACE}/hooks/hooks.json`,
  componentPaths: {
    commands: `${AGENT_PLUGIN_COPILOT_EXTENSION_NAMESPACE}/commands`,
    skills: "skills",
    agents: `${AGENT_PLUGIN_COPILOT_EXTENSION_NAMESPACE}/agents`,
    rules: `${AGENT_PLUGIN_COPILOT_EXTENSION_NAMESPACE}/rules`,
    hooks: `${AGENT_PLUGIN_COPILOT_EXTENSION_NAMESPACE}/hooks/hooks.json`,
    mcpServers: "mcp.json"
  },
  manifestExtensionNamespace: AGENT_PLUGIN_COPILOT_EXTENSION_NAMESPACE,
  requiresManifest: true,
  pluginRootTokens: [],
  pluginRootEnvVars: [],
  parseHooks(hookUri, json, _pluginUri, workspaceRoot, userHome) {
    return parseHooksJson(hookUri, json, workspaceRoot, userHome);
  }
};
async function detectPluginFormat(pluginUri, fileService) {
  if (await readAgentPluginManifest(pluginUri, fileService)) {
    return AGENT_PLUGIN_FORMAT;
  }
  if (await pathExists(joinPath(pluginUri, ".plugin", "plugin.json"), fileService)) {
    return OPEN_PLUGIN_FORMAT;
  }
  const isInClaudeDirectory = pluginUri.path.split("/").includes(".claude");
  if (isInClaudeDirectory || await pathExists(joinPath(pluginUri, ".claude-plugin", "plugin.json"), fileService)) {
    return CLAUDE_FORMAT;
  }
  return COPILOT_FORMAT;
}
async function readPluginManifest(pluginUri, format, fileService) {
  if (format.format === 3 /* AgentPlugin */) {
    const manifest = await readAgentPluginManifest(pluginUri, fileService);
    return manifest ? { ...manifest } : void 0;
  }
  const json = await readJsonFile(joinPath(pluginUri, format.manifestPath), fileService);
  return json && typeof json === "object" && !Array.isArray(json) ? json : void 0;
}
function getPluginManifestComponent(format, component, manifest) {
  if (format.manifestExtensionNamespace) {
    const extensions = manifest?.["extensions"];
    if (!extensions || typeof extensions !== "object" || Array.isArray(extensions)) {
      return void 0;
    }
    const extension = extensions[format.manifestExtensionNamespace];
    return extension && typeof extension === "object" && !Array.isArray(extension) ? extension[component] : void 0;
  }
  return format.componentPaths && Object.hasOwn(format.componentPaths, component) ? void 0 : manifest?.[component];
}
function resolvePluginComponentDirs(pluginUri, format, component, fallbackPath, manifestSection, boundaryUri) {
  const componentPath = format.componentPaths?.[component];
  if (format.componentPaths && Object.hasOwn(format.componentPaths, component)) {
    if (typeof componentPath !== "string") {
      return [];
    }
    if (!format.manifestExtensionNamespace) {
      return resolveComponentDirs(pluginUri, componentPath, emptyComponentPathConfig, boundaryUri);
    }
    const config = parseComponentPathConfig(manifestSection);
    const defaultDirs = config.exclusive ? [] : resolveComponentDirs(pluginUri, componentPath, emptyComponentPathConfig, boundaryUri);
    const extensionRoot = joinPath(pluginUri, format.manifestExtensionNamespace);
    const configuredDirs = resolveComponentDirs(extensionRoot, "", { paths: config.paths, exclusive: true }, extensionRoot);
    return [...defaultDirs, ...configuredDirs];
  }
  return resolveComponentDirs(
    pluginUri,
    fallbackPath,
    parseComponentPathConfig(manifestSection),
    boundaryUri
  );
}
function buildChildId(uri, disambiguator) {
  const base = customizationId(uri.toString());
  if (!disambiguator) {
    return base;
  }
  return `${base.replace(/#/g, "%23")}#${disambiguator}`;
}
function makeAgentCustomization(resource) {
  const uri = resource.uri.toString();
  return {
    type: CustomizationType.Agent,
    id: buildChildId(resource.uri),
    uri,
    name: resource.name,
    ...resource.description ? { description: resource.description } : {},
    ...resource.model ? { model: resource.model } : {},
    ...resource.tools?.length ? { tools: [...resource.tools] } : {},
    ...resource.disableModelInvocation ? { disableModelInvocation: true } : {},
    ...resource.disableUserInvocation ? { disableUserInvocation: true } : {}
  };
}
function makeSkillCustomization(resource) {
  const uri = resource.uri.toString();
  return {
    type: CustomizationType.Skill,
    id: buildChildId(resource.uri),
    uri,
    name: resource.name,
    ...resource.description ? { description: resource.description } : {}
  };
}
function makeRuleCustomization(resource) {
  const uri = resource.uri.toString();
  return {
    type: CustomizationType.Rule,
    id: buildChildId(resource.uri),
    uri,
    name: resource.name,
    ...resource.description ? { description: resource.description } : {}
  };
}
function makeHookCustomization(hookUri) {
  return {
    type: CustomizationType.Hook,
    id: buildChildId(hookUri),
    uri: hookUri.toString(),
    name: basename(hookUri)
  };
}
function makeMcpServerCustomization(definitionUri, name) {
  return {
    type: CustomizationType.McpServer,
    id: buildChildId(definitionUri, `mcp=${encodeURIComponent(name)}`),
    uri: definitionUri.toString(),
    name,
    state: { kind: McpServerStatus.Stopped },
    mcpApp: DEFAULT_MCP_APP
  };
}
const emptyComponentPathConfig = { paths: [], exclusive: false };
function parseComponentPathConfig(raw) {
  if (raw === void 0 || raw === null) {
    return emptyComponentPathConfig;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? { paths: [trimmed], exclusive: false } : emptyComponentPathConfig;
  }
  if (Array.isArray(raw)) {
    const paths = raw.filter((v) => typeof v === "string").map((v) => v.trim()).filter((v) => v.length > 0);
    return { paths, exclusive: false };
  }
  if (typeof raw === "object") {
    const obj = raw;
    if (Array.isArray(obj["paths"])) {
      const paths = obj["paths"].filter((v) => typeof v === "string").map((v) => v.trim()).filter((v) => v.length > 0);
      const exclusive = obj["exclusive"] === true;
      return { paths, exclusive };
    }
  }
  return emptyComponentPathConfig;
}
function resolveComponentDirs(pluginUri, defaultDir, config, boundaryUri) {
  const boundary = boundaryUri && isEqualOrParent(pluginUri, boundaryUri) ? boundaryUri : pluginUri;
  const dirs = [];
  if (!config.exclusive) {
    dirs.push(joinPath(pluginUri, defaultDir));
  }
  for (const p of config.paths) {
    const resolved = normalizePath(joinPath(pluginUri, p));
    if (isEqualOrParent(resolved, boundary)) {
      dirs.push(resolved);
    }
  }
  return dirs;
}
function resolveMcpServersMap(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return void 0;
  }
  const obj = raw;
  return Object.hasOwn(obj, "mcpServers") ? obj.mcpServers : obj;
}
function normalizeMcpServerConfiguration(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object") {
    return void 0;
  }
  const candidate = rawConfig;
  const type = typeof candidate["type"] === "string" ? candidate["type"] : void 0;
  const command = typeof candidate["command"] === "string" ? candidate["command"] : void 0;
  const url = typeof candidate["url"] === "string" ? candidate["url"] : void 0;
  const args = Array.isArray(candidate["args"]) ? candidate["args"].filter((value) => typeof value === "string") : void 0;
  const env = candidate["env"] && typeof candidate["env"] === "object" ? Object.fromEntries(Object.entries(candidate["env"]).filter(([, value]) => typeof value === "string" || typeof value === "number" || value === null).map(([key, value]) => [key, value])) : void 0;
  const envFile = typeof candidate["envFile"] === "string" ? candidate["envFile"] : void 0;
  const cwd = typeof candidate["cwd"] === "string" ? candidate["cwd"] : void 0;
  const headers = candidate["headers"] && typeof candidate["headers"] === "object" ? Object.fromEntries(Object.entries(candidate["headers"]).filter(([, value]) => typeof value === "string").map(([key, value]) => [key, value])) : void 0;
  const dev = candidate["dev"] && typeof candidate["dev"] === "object" ? candidate["dev"] : void 0;
  if (type === "ws") {
    return void 0;
  }
  if (type === McpServerType.LOCAL || !type && command) {
    if (!command) {
      return void 0;
    }
    return { type: McpServerType.LOCAL, command, args, env, envFile, cwd, dev };
  }
  if (type === McpServerType.REMOTE || type === "streamable-http" || type === "sse" || !type && url) {
    if (!url) {
      return void 0;
    }
    return { type: McpServerType.REMOTE, url, headers, dev };
  }
  return void 0;
}
const shellUnsafeChars = /[\s&|<>()^;!`"']/;
function shellQuotePluginRootInCommand(command, fsPath, token) {
  if (!command.includes(token)) {
    return command;
  }
  if (!shellUnsafeChars.test(fsPath)) {
    return command.replaceAll(token, fsPath);
  }
  const escapedToken = escapeRegExpCharacters(token);
  const pattern = new RegExp(
    `(["']?)` + escapedToken + `([\\w./\\\\~:-]*)`,
    "g"
  );
  return command.replace(pattern, (_match, leadingQuote, suffix) => {
    const fullPath = fsPath + suffix;
    if (leadingQuote) {
      return leadingQuote + fullPath;
    }
    return '"' + fullPath.replace(/"/g, '\\"') + '"';
  });
}
function interpolateMcpPluginRoot(def, fsPath, tokens, envVars) {
  const replace = (s) => tokens.reduce((result, token) => result.replaceAll(token, fsPath), s);
  const config = def.configuration;
  let interpolated;
  if (config.type === McpServerType.LOCAL) {
    const local = { ...config };
    local.command = replace(local.command);
    if (local.args) {
      local.args = local.args.map(replace);
    }
    if (local.cwd) {
      local.cwd = replace(local.cwd);
    }
    local.env = { ...local.env };
    for (const [k, v] of Object.entries(local.env)) {
      if (typeof v === "string") {
        local.env[k] = replace(v);
      }
    }
    for (const envVar of envVars) {
      local.env[envVar] = fsPath;
    }
    if (local.envFile) {
      local.envFile = replace(local.envFile);
    }
    interpolated = local;
  } else {
    const remote = { ...config };
    remote.url = replace(remote.url);
    if (remote.headers) {
      remote.headers = Object.fromEntries(
        Object.entries(remote.headers).map(([k, v]) => [k, replace(v)])
      );
    }
    interpolated = remote;
  }
  return { name: def.name, configuration: interpolated, uri: def.uri, customization: def.customization };
}
const BARE_ENV_VAR_RE = /\$\{(?![A-Za-z]+:)([A-Z_][A-Z0-9_]*)\}/g;
function convertBareEnvVarsToVsCodeSyntax(def) {
  return cloneAndChange(def, (value) => {
    if (URI.isUri(value)) {
      return value;
    }
    if (typeof value === "string") {
      const replaced = value.replace(BARE_ENV_VAR_RE, "${env:$1}");
      return replaced !== value ? replaced : void 0;
    }
    return void 0;
  });
}
const HOOK_TYPE_MAP = {
  // PascalCase (VS Code / Claude)
  "SessionStart": "SessionStart",
  "SessionEnd": "SessionEnd",
  "UserPromptSubmit": "UserPromptSubmit",
  "PreToolUse": "PreToolUse",
  "PostToolUse": "PostToolUse",
  "PreCompact": "PreCompact",
  "SubagentStart": "SubagentStart",
  "SubagentStop": "SubagentStop",
  "Stop": "Stop",
  "ErrorOccurred": "ErrorOccurred",
  // camelCase (GitHub Copilot CLI)
  "sessionStart": "SessionStart",
  "sessionEnd": "SessionEnd",
  "userPromptSubmitted": "UserPromptSubmit",
  "preToolUse": "PreToolUse",
  "postToolUse": "PostToolUse",
  "agentStop": "Stop",
  "subagentStop": "SubagentStop",
  "errorOccurred": "ErrorOccurred"
};
function normalizeHookCommand(raw) {
  if (raw.type !== void 0 && raw.type !== "command") {
    return void 0;
  }
  const hasCommand = typeof raw.command === "string" && raw.command.length > 0;
  const hasBash = typeof raw.bash === "string" && raw.bash.length > 0;
  const hasPowerShell = typeof raw.powershell === "string" && raw.powershell.length > 0;
  const hasWindows = typeof raw.windows === "string" && raw.windows.length > 0;
  const hasLinux = typeof raw.linux === "string" && raw.linux.length > 0;
  const hasOsx = typeof raw.osx === "string" && raw.osx.length > 0;
  if (!hasCommand && !hasBash && !hasPowerShell && !hasWindows && !hasLinux && !hasOsx) {
    return void 0;
  }
  const windows = hasWindows ? raw.windows : hasPowerShell ? raw.powershell : void 0;
  const linux = hasLinux ? raw.linux : hasBash ? raw.bash : void 0;
  const osx = hasOsx ? raw.osx : hasBash ? raw.bash : void 0;
  const timeout = typeof raw.timeout === "number" ? raw.timeout : typeof raw.timeoutSec === "number" ? raw.timeoutSec : void 0;
  return {
    ...hasCommand && { command: raw.command },
    ...windows && { windows },
    ...linux && { linux },
    ...osx && { osx },
    ...typeof raw.env === "object" && raw.env !== null && { env: raw.env },
    ...timeout !== void 0 && { timeout }
  };
}
function resolveHookCommand(raw, workspaceRoot, userHome) {
  const normalized = normalizeHookCommand(raw);
  if (!normalized) {
    return void 0;
  }
  let cwdUri;
  const rawCwd = typeof raw.cwd === "string" ? raw.cwd : void 0;
  if (rawCwd) {
    if (rawCwd.startsWith("~/")) {
      cwdUri = URI.joinPath(userHome, rawCwd.substring(2));
    } else if (isAbsolute(rawCwd)) {
      cwdUri = URI.file(rawCwd);
    } else if (workspaceRoot) {
      cwdUri = joinPath(workspaceRoot, rawCwd);
    }
  } else {
    cwdUri = workspaceRoot;
  }
  return { ...normalized, cwd: cwdUri };
}
function extractHookCommands(item, workspaceRoot, userHome) {
  if (!item || typeof item !== "object") {
    return [];
  }
  const itemObj = item;
  const commands = [];
  const nestedHooks = itemObj.hooks;
  if (nestedHooks !== void 0 && Array.isArray(nestedHooks)) {
    for (const nested of nestedHooks) {
      if (!nested || typeof nested !== "object") {
        continue;
      }
      const resolved = resolveHookCommand(nested, workspaceRoot, userHome);
      if (resolved) {
        commands.push(resolved);
      }
    }
  } else {
    const resolved = resolveHookCommand(itemObj, workspaceRoot, userHome);
    if (resolved) {
      commands.push(resolved);
    }
  }
  return commands;
}
function parseHooksJson(hookUri, json, workspaceRoot, userHome) {
  if (!json || typeof json !== "object") {
    return [];
  }
  const root = json;
  if (root.disableAllHooks === true) {
    return [];
  }
  const hooks = root.hooks;
  const hooksObj = hooks && typeof hooks === "object" && !Array.isArray(hooks) ? hooks : root;
  const result = [];
  const customization = makeHookCustomization(hookUri);
  for (const originalId of Object.keys(hooksObj)) {
    const canonicalType = HOOK_TYPE_MAP[originalId];
    if (!canonicalType) {
      continue;
    }
    const hookArray = hooksObj[originalId];
    if (!Array.isArray(hookArray)) {
      continue;
    }
    const commands = [];
    for (const item of hookArray) {
      commands.push(...extractHookCommands(item, workspaceRoot, userHome));
    }
    if (commands.length > 0) {
      result.push({ type: canonicalType, commands, uri: hookUri, originalId, customization });
    }
  }
  return result;
}
function interpolateHookPluginRoot(hookUri, json, pluginUri, workspaceRoot, userHome, token, envVar) {
  const fsPath = pluginUri.fsPath;
  const typedJson = json;
  const mutateHookCommand = (hook) => {
    for (const field of ["command", "windows", "linux", "osx"]) {
      if (typeof hook[field] === "string") {
        hook[field] = shellQuotePluginRootInCommand(hook[field], fsPath, token);
      }
    }
    if (!hook.env || typeof hook.env !== "object") {
      hook.env = {};
    }
    hook.env[envVar] = fsPath;
  };
  for (const lifecycle of Object.values(typedJson.hooks ?? {})) {
    if (!Array.isArray(lifecycle)) {
      continue;
    }
    for (const lifecycleEntry of lifecycle) {
      if (!lifecycleEntry || typeof lifecycleEntry !== "object") {
        continue;
      }
      const entry = lifecycleEntry;
      if (Array.isArray(entry.hooks)) {
        for (const hook of entry.hooks) {
          mutateHookCommand(hook);
        }
      } else {
        mutateHookCommand(entry);
      }
    }
  }
  const replacer = (v) => {
    return typeof v === "string" ? v.replaceAll(token, pluginUri.fsPath) : void 0;
  };
  return parseHooksJson(hookUri, cloneAndChange(json, replacer), workspaceRoot, userHome);
}
async function readJsonFile(uri, fileService) {
  try {
    const fileContents = await fileService.readFile(uri);
    return parseJSONC(fileContents.value.toString());
  } catch {
    return void 0;
  }
}
async function pathExists(resource, fileService) {
  try {
    await fileService.resolve(resource);
    return true;
  } catch {
    return false;
  }
}
const COMMAND_FILE_SUFFIX = ".md";
const RULE_FILE_SUFFIX = ".mdc";
const INSTRUCTION_FILE_SUFFIX = ".instructions.md";
async function readSkills(pluginRoot, dirs, fileService, options) {
  const seen = /* @__PURE__ */ new Set();
  const skills = [];
  const addSkill = async (name, skillMd) => {
    if (options?.containmentRoot && !await isResolvedWithin(options.containmentRoot, skillMd, fileService)) {
      return;
    }
    let description;
    try {
      const parsedInfo = await parseSkillFile(skillMd, fileService);
      description = parsedInfo.description;
      name = parsedInfo.name || name;
    } catch {
    }
    if (seen.has(name)) {
      return;
    }
    seen.add(name);
    skills.push({ uri: skillMd, name, ...description ? { description } : {} });
  };
  await Promise.all(dirs.map(async (dir) => {
    if (!options?.childDirectoriesOnly) {
      const skillMd = URI.joinPath(dir, "SKILL.md");
      if (await pathExists(skillMd, fileService)) {
        await addSkill(basename(dir), skillMd);
        return;
      }
    }
    let stat;
    try {
      stat = await fileService.resolve(dir);
    } catch {
      return;
    }
    if (!stat.isDirectory || !stat.children) {
      return;
    }
    await Promise.all(stat.children.map(async (child) => {
      const childSkillMd = URI.joinPath(child.resource, "SKILL.md");
      if (await pathExists(childSkillMd, fileService)) {
        await addSkill(basename(child.resource), childSkillMd);
      }
    }));
  }));
  if (!options?.childDirectoriesOnly && skills.length === 0) {
    const rootSkillMd = URI.joinPath(pluginRoot, "SKILL.md");
    if (await pathExists(rootSkillMd, fileService)) {
      await addSkill(basename(pluginRoot), rootSkillMd);
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}
async function readPluginSkills(pluginRoot, dirs, format, fileService) {
  return readSkills(pluginRoot, dirs, fileService, format.format === 3 /* AgentPlugin */ ? { childDirectoriesOnly: true, containmentRoot: pluginRoot } : void 0);
}
async function isResolvedWithin(root, resource, fileService) {
  try {
    const [resolvedRoot, resolvedResource] = await Promise.all([
      fileService.realpath(root),
      fileService.realpath(resource)
    ]);
    return isEqualOrParent(resolvedResource ?? normalizePath(resource), resolvedRoot ?? normalizePath(root));
  } catch {
    return false;
  }
}
async function readMarkdownComponents(dirs, fileService, options) {
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  const addItem = async (name, uri) => {
    if (options?.containmentRoot && !await isResolvedWithin(options.containmentRoot, uri, fileService)) {
      return;
    }
    if (!seen.has(name)) {
      seen.add(name);
      items.push({ uri, name });
    }
  };
  for (const dir of dirs) {
    let stat;
    try {
      stat = await fileService.resolve(dir);
    } catch {
      continue;
    }
    if (stat.isFile && extname(dir).toLowerCase() === COMMAND_FILE_SUFFIX) {
      await addItem(basename(dir).slice(0, -COMMAND_FILE_SUFFIX.length), dir);
      continue;
    }
    if (!stat.isDirectory || !stat.children) {
      continue;
    }
    for (const child of stat.children) {
      if (!child.isFile || extname(child.resource).toLowerCase() !== COMMAND_FILE_SUFFIX) {
        continue;
      }
      await addItem(basename(child.resource).slice(0, -COMMAND_FILE_SUFFIX.length), child.resource);
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}
function getInstructionFileName(resource) {
  const fileName = basename(resource);
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(RULE_FILE_SUFFIX)) {
    return fileName.slice(0, -RULE_FILE_SUFFIX.length);
  }
  if (lowerName.endsWith(INSTRUCTION_FILE_SUFFIX)) {
    return fileName.slice(0, -INSTRUCTION_FILE_SUFFIX.length);
  }
  return void 0;
}
async function readInstructionComponents(dirs, fileService, options) {
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  const addItem = async (name, uri) => {
    if (options?.containmentRoot && !await isResolvedWithin(options.containmentRoot, uri, fileService)) {
      return;
    }
    if (!seen.has(name)) {
      seen.add(name);
      items.push({ uri, name });
    }
  };
  for (const dir of dirs) {
    let stat;
    try {
      stat = await fileService.resolve(dir);
    } catch {
      continue;
    }
    if (stat.isFile) {
      const instructionName = getInstructionFileName(dir);
      if (instructionName) {
        await addItem(instructionName, dir);
      }
      continue;
    }
    if (!stat.isDirectory || !stat.children) {
      continue;
    }
    for (const child of stat.children) {
      if (!child.isFile) {
        continue;
      }
      const instructionName = getInstructionFileName(child.resource);
      if (instructionName) {
        await addItem(instructionName, child.resource);
      }
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}
async function readAgentComponents(dirs, fileService, options) {
  const files = await readMarkdownComponents(dirs, fileService, options);
  if (files.length === 0) {
    return files;
  }
  const enriched = await Promise.all(files.map(async (file) => {
    try {
      const parsed = await parseAgentFile(file.uri, fileService);
      return {
        uri: file.uri,
        name: parsed.name || file.name,
        ...parsed.description ? { description: parsed.description } : {},
        ...parsed.model ? { model: parsed.model } : {},
        ...parsed.tools?.length ? { tools: parsed.tools } : {},
        ...parsed.disableModelInvocation ? { disableModelInvocation: true } : {},
        ...parsed.userInvocable === false ? { disableUserInvocation: true } : {}
      };
    } catch {
      return file;
    }
  }));
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of enriched) {
    if (seen.has(item.name)) {
      continue;
    }
    seen.add(item.name);
    result.push(item);
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
async function parseAgentFile(uri, fileService) {
  const nameFromFile = basename(uri).replace(/(\.agent)?\.md$/i, "");
  try {
    const content = await fileService.readFile(uri);
    const frontmatter = parseFrontMatter(content.value.toString());
    const name = frontmatter?.getStringValue("name")?.trim() || nameFromFile;
    const description = frontmatter?.getStringValue("description")?.trim();
    const userInvocable = frontmatter?.getBooleanValue("user-invocable");
    const model = frontmatter?.getStringArrayValue("model")?.map((value) => value.trim()).find(Boolean);
    const tools = frontmatter?.getStringArrayValue("tools")?.map((value) => value.trim()).filter(Boolean);
    const infer = frontmatter?.getBooleanValue("infer");
    const disableModelInvocation = resolveAgentDisableModelInvocation(infer, frontmatter?.getBooleanValue("disable-model-invocation"));
    return { name, description, userInvocable, model, tools, disableModelInvocation };
  } catch {
    return { name: nameFromFile };
  }
}
function resolveAgentDisableModelInvocation(infer, disableModelInvocation, fallback) {
  return infer !== void 0 ? !infer : disableModelInvocation ?? fallback;
}
async function parseSkillFile(uri, fileService) {
  try {
    const content = await fileService.readFile(uri);
    const frontmatter = parseFrontMatter(content.value.toString());
    const name = frontmatter?.getStringValue("name")?.trim() || basename(dirname(uri));
    const description = frontmatter?.getStringValue("description")?.trim();
    const userInvokable = frontmatter?.getBooleanValue("user-invocable");
    return { name, description, userInvokable };
  } catch {
    return { name: basename(dirname(uri)) };
  }
}
async function parseRuleFile(uri, fileService) {
  const nameFromFile = basename(uri).replace(/(\.instructions)?\.md$/i, "");
  try {
    const content = await fileService.readFile(uri);
    const frontmatter = parseFrontMatter(content.value.toString());
    const name = frontmatter?.getStringValue("name")?.trim() || nameFromFile;
    const description = frontmatter?.getStringValue("description")?.trim();
    const globs = frontmatter?.getStringArrayValue("globs") ?? frontmatter?.getStringArrayValue("applyTo") ?? frontmatter?.getStringArrayValue("paths") ?? void 0;
    const alwaysApply = frontmatter?.getBooleanValue("alwaysApply");
    return { name, description, globs, alwaysApply };
  } catch {
    return { name: nameFromFile };
  }
}
async function readHooks(pluginUri, paths, formatConfig, fileService, workspaceRoot, userHome) {
  for (const hookPath of paths) {
    if (formatConfig.format === 3 /* AgentPlugin */ && !await isResolvedWithin(pluginUri, hookPath, fileService)) {
      continue;
    }
    const json = await readJsonFile(hookPath, fileService);
    if (!json) {
      continue;
    }
    return formatConfig.parseHooks(hookPath, json, pluginUri, workspaceRoot, userHome);
  }
  return [];
}
async function readMcpServers(pluginUri, paths, formatConfig, fileService) {
  const merged = /* @__PURE__ */ new Map();
  for (const mcpPath of paths) {
    if (formatConfig.format === 3 /* AgentPlugin */ && !await isResolvedWithin(pluginUri, mcpPath, fileService)) {
      continue;
    }
    const json = await readJsonFile(mcpPath, fileService);
    for (const def of parseMcpServerDefinitionMap(mcpPath, json, pluginUri.fsPath, formatConfig)) {
      if (!merged.has(def.name)) {
        merged.set(def.name, def);
      }
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
async function readPluginMcpServers(pluginUri, paths, format, fileService) {
  return readMcpServers(pluginUri, paths, format, fileService);
}
function parseMcpServerDefinitionMap(definitionURI, raw, pluginFsPath, formatConfig) {
  const mcpServers = resolveMcpServersMap(raw);
  if (!mcpServers) {
    return [];
  }
  const definitions = [];
  for (const [name, configValue] of Object.entries(mcpServers)) {
    const configuration = normalizeMcpServerConfiguration(configValue);
    if (!configuration) {
      continue;
    }
    let def = {
      name,
      configuration,
      uri: definitionURI,
      customization: makeMcpServerCustomization(definitionURI, name)
    };
    def = interpolateMcpPluginRoot(def, pluginFsPath, formatConfig.pluginRootTokens, formatConfig.pluginRootEnvVars);
    if (formatConfig.format !== 3 /* AgentPlugin */ && def.configuration.type === McpServerType.LOCAL && def.configuration.cwd === void 0) {
      def = { ...def, configuration: { ...def.configuration, cwd: pluginFsPath } };
    }
    if (formatConfig.format !== 3 /* AgentPlugin */) {
      def = convertBareEnvVarsToVsCodeSyntax(def);
    }
    definitions.push(def);
  }
  return definitions;
}
async function parsePlugin(pluginUri, fileService, workspaceRoot, userHome, boundaryUri) {
  const formatConfig = await detectPluginFormat(pluginUri, fileService);
  const manifest = await readPluginManifest(pluginUri, formatConfig, fileService);
  if (formatConfig.requiresManifest && !manifest) {
    throw new Error(`Plugin manifest '${joinPath(pluginUri, formatConfig.manifestPath).toString()}' is missing`);
  }
  const hooksSection = getPluginManifestComponent(formatConfig, "hooks", manifest);
  const mcpSection = getPluginManifestComponent(formatConfig, "mcpServers", manifest);
  const skillsSection = getPluginManifestComponent(formatConfig, "skills", manifest);
  const agentsSection = getPluginManifestComponent(formatConfig, "agents", manifest);
  const rulesSection = getPluginManifestComponent(formatConfig, "rules", manifest);
  const hookDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "hooks", formatConfig.hookConfigPath, hooksSection, boundaryUri);
  const mcpDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "mcpServers", ".mcp.json", mcpSection, boundaryUri);
  const skillDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "skills", "skills", skillsSection, boundaryUri);
  const agentDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "agents", "agents", agentsSection, boundaryUri);
  const instructionDirs = resolvePluginComponentDirs(pluginUri, formatConfig, "rules", "rules", rulesSection, boundaryUri);
  let embeddedMcp = [];
  if (mcpSection && typeof mcpSection === "object" && !Array.isArray(mcpSection) && !hasKey(mcpSection, { paths: true })) {
    embeddedMcp = parseMcpServerDefinitionMap(
      joinPath(pluginUri, formatConfig.manifestPath),
      { mcpServers: mcpSection },
      pluginUri.fsPath,
      formatConfig
    );
  }
  let embeddedHooks = [];
  if (hooksSection && typeof hooksSection === "object" && !Array.isArray(hooksSection) && !hasKey(hooksSection, { paths: true })) {
    const manifestUri = joinPath(pluginUri, formatConfig.manifestPath);
    embeddedHooks = formatConfig.parseHooks(manifestUri, hooksSection, pluginUri, workspaceRoot, userHome);
  }
  const [hooks, mcpServers, skills, agents, instructions] = await Promise.all([
    embeddedHooks.length > 0 ? Promise.resolve(embeddedHooks) : readHooks(pluginUri, hookDirs, formatConfig, fileService, workspaceRoot, userHome),
    embeddedMcp.length > 0 ? Promise.resolve(embeddedMcp) : readPluginMcpServers(pluginUri, mcpDirs, formatConfig, fileService),
    readPluginSkills(pluginUri, skillDirs, formatConfig, fileService),
    readAgentComponents(agentDirs, fileService, formatConfig.format === 3 /* AgentPlugin */ ? { containmentRoot: pluginUri } : void 0),
    readInstructionComponents(instructionDirs, fileService, formatConfig.format === 3 /* AgentPlugin */ ? { containmentRoot: pluginUri } : void 0)
  ]);
  return {
    format: formatConfig.format,
    hooks,
    mcpServers,
    skills: skills.map(toParsedSkill),
    agents: agents.map(toParsedAgent),
    instructions: instructions.map(toParsedRule)
  };
}
function toParsedAgent(resource) {
  return { ...resource, customization: makeAgentCustomization(resource) };
}
function toParsedSkill(resource) {
  return { ...resource, customization: makeSkillCustomization(resource) };
}
function toParsedRule(resource) {
  return { ...resource, customization: makeRuleCustomization(resource) };
}
export {
  IParsedHookCommand,
  PluginFormat,
  convertBareEnvVarsToVsCodeSyntax,
  detectPluginFormat,
  getPluginManifestComponent,
  interpolateHookPluginRoot,
  interpolateMcpPluginRoot,
  makeMcpServerCustomization,
  normalizeMcpServerConfiguration,
  parseAgentFile,
  parseComponentPathConfig,
  parseHooksJson,
  parseMcpServerDefinitionMap,
  parsePlugin,
  parseRuleFile,
  parseSkillFile,
  pathExists,
  readAgentComponents,
  readInstructionComponents,
  readJsonFile,
  readMarkdownComponents,
  readPluginManifest,
  readPluginMcpServers,
  readPluginSkills,
  readSkills,
  resolveAgentDisableModelInvocation,
  resolveComponentDirs,
  resolveMcpServersMap,
  resolvePluginComponentDirs,
  shellQuotePluginRootInCommand,
  toParsedAgent,
  toParsedSkill
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRQbHVnaW5zXFxjb21tb25cXHBsdWdpblBhcnNlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZUpTT05DIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBjbG9uZUFuZENoYW5nZSwgZXF1YWxzIGFzIG9iamVjdEVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGV4dG5hbWUsIGlzRXF1YWxPclBhcmVudCwgam9pblBhdGgsIG5vcm1hbGl6ZVBhdGgsIGlzRXF1YWwgYXMgaXNVUkxFcXVhbHMsIGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBwYXJzZUZyb250TWF0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24veWFtbC5qcyc7XG5pbXBvcnQgeyBJTWNwUmVtb3RlU2VydmVyQ29uZmlndXJhdGlvbiwgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sIElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24sIE1jcFNlcnZlclR5cGUgfSBmcm9tICcuLi8uLi9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvblR5cGUsIE1jcFNlcnZlclN0YXR1cywgdHlwZSBBZ2VudEN1c3RvbWl6YXRpb24sIHR5cGUgSG9va0N1c3RvbWl6YXRpb24sIHR5cGUgTWNwU2VydmVyQ3VzdG9taXphdGlvbiwgdHlwZSBSdWxlQ3VzdG9taXphdGlvbiwgdHlwZSBTa2lsbEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTUNQX0FQUCB9IGZyb20gJy4uLy4uL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvbWNwQXBwRGVmYXVsdHMuanMnO1xuaW1wb3J0IHsgY3VzdG9taXphdGlvbklkIH0gZnJvbSAnLi4vLi4vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgcmVhZEFnZW50UGx1Z2luTWFuaWZlc3QgfSBmcm9tICcuL2FnZW50UGx1Z2luUGFyc2VyLmpzJztcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUeXBlc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKiBBIHNpbmdsZSBob29rIGNvbW1hbmQgdG8gZXhlY3V0ZS4gUGxhdGZvcm0gcmVzb2x1dGlvbiBoYXBwZW5zIGF0IGNvbnZlcnNpb24gdGltZS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlZEhvb2tDb21tYW5kIHtcblx0LyoqIENyb3NzLXBsYXRmb3JtIGRlZmF1bHQgY29tbWFuZC4gKi9cblx0cmVhZG9ubHkgY29tbWFuZD86IHN0cmluZztcblx0LyoqIFdpbmRvd3Mtc3BlY2lmaWMgY29tbWFuZC4gKi9cblx0cmVhZG9ubHkgd2luZG93cz86IHN0cmluZztcblx0LyoqIExpbnV4LXNwZWNpZmljIGNvbW1hbmQuICovXG5cdHJlYWRvbmx5IGxpbnV4Pzogc3RyaW5nO1xuXHQvKiogbWFjT1Mtc3BlY2lmaWMgY29tbWFuZC4gKi9cblx0cmVhZG9ubHkgb3N4Pzogc3RyaW5nO1xuXHQvKiogV29ya2luZyBkaXJlY3RvcnkuICovXG5cdHJlYWRvbmx5IGN3ZD86IFVSSTtcblx0LyoqIEVudmlyb25tZW50IHZhcmlhYmxlcy4gKi9cblx0cmVhZG9ubHkgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0LyoqIFRpbWVvdXQgaW4gc2Vjb25kcy4gKi9cblx0cmVhZG9ubHkgdGltZW91dD86IG51bWJlcjtcblx0LyoqIFVSSSBvZiB0aGUgZmlsZSB0aGlzIGhvb2sgd2FzIGRlZmluZWQgaW4uICovXG5cdHJlYWRvbmx5IHNvdXJjZVVyaT86IFVSSTtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJUGFyc2VkSG9va0NvbW1hbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gaXNFcXVhbHMoYTogSVBhcnNlZEhvb2tDb21tYW5kIHwgdW5kZWZpbmVkLCBiOiBJUGFyc2VkSG9va0NvbW1hbmQgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5jb21tYW5kID09PSBiLmNvbW1hbmRcblx0XHRcdCYmIGEud2luZG93cyA9PT0gYi53aW5kb3dzXG5cdFx0XHQmJiBhLmxpbnV4ID09PSBiLmxpbnV4XG5cdFx0XHQmJiBhLm9zeCA9PT0gYi5vc3hcblx0XHRcdCYmIGlzVVJMRXF1YWxzKGEuY3dkLCBiLmN3ZClcblx0XHRcdCYmIG9iamVjdEVxdWFscyhhLmVudiwgYi5lbnYpXG5cdFx0XHQmJiBhLnRpbWVvdXQgPT09IGIudGltZW91dFxuXHRcdFx0JiYgaXNVUkxFcXVhbHMoYS5zb3VyY2VVcmksIGIuc291cmNlVXJpKTtcblx0fVxufVxuXG4vKiogQSBncm91cCBvZiBob29rcyBmb3IgYSBzaW5nbGUgbGlmZWN5Y2xlIGV2ZW50LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VkSG9va0dyb3VwIHtcblx0LyoqIENhbm9uaWNhbCBob29rIHR5cGUgaWRlbnRpZmllciAoZS5nLiBgJ1Nlc3Npb25TdGFydCdgLCBgJ1ByZVRvb2xVc2UnYCkuICovXG5cdHJlYWRvbmx5IHR5cGU6IHN0cmluZztcblx0LyoqIFRoZSBjb21tYW5kcyB0byBleGVjdXRlIGZvciB0aGlzIGhvb2sgdHlwZS4gKi9cblx0cmVhZG9ubHkgY29tbWFuZHM6IHJlYWRvbmx5IElQYXJzZWRIb29rQ29tbWFuZFtdO1xuXHQvKiogVVJJIHdoZXJlIHRoaXMgaG9vayBpcyBkZWZpbmVkLiAqL1xuXHRyZWFkb25seSB1cmk6IFVSSTtcblx0LyoqIE9yaWdpbmFsIGtleSBhcyBpdCBhcHBlYXJzIGluIHRoZSBob29rIGZpbGUuICovXG5cdHJlYWRvbmx5IG9yaWdpbmFsSWQ6IHN0cmluZztcblx0LyoqXG5cdCAqIFByb3RvY29sLWxldmVsIHByb2plY3Rpb24gb2YgdGhpcyBob29rIGdyb3VwIGFzIGEgY2hpbGQgY3VzdG9taXphdGlvbi5cblx0ICogTXVsdGlwbGUgZ3JvdXBzIHBhcnNlZCBmcm9tIHRoZSBzYW1lIGZpbGUgc2hhcmUgdGhlIHNhbWUgYGN1c3RvbWl6YXRpb24uaWRgXG5cdCAqIHNvIGNvbnN1bWVycyBjYW4gZGVkdXBlIGJ5IGlkIHdoZW4gY29sbGVjdGluZyBjdXN0b21pemF0aW9ucy5cblx0ICovXG5cdHJlYWRvbmx5IGN1c3RvbWl6YXRpb246IEhvb2tDdXN0b21pemF0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElNY3BTZXJ2ZXJEZWZpbml0aW9uIHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uOiBJTWNwU2VydmVyQ29uZmlndXJhdGlvbjtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdC8qKiBQcm90b2NvbC1sZXZlbCBwcm9qZWN0aW9uIG9mIHRoaXMgTUNQIHNlcnZlciBhcyBhIGNoaWxkIGN1c3RvbWl6YXRpb24uICovXG5cdHJlYWRvbmx5IGN1c3RvbWl6YXRpb246IE1jcFNlcnZlckN1c3RvbWl6YXRpb247XG59XG5cbi8qKiBBIG5hbWVkIHJlc291cmNlIChza2lsbCwgYWdlbnQsIGNvbW1hbmQsIG9yIGluc3RydWN0aW9uKSB3aXRoaW4gYSBwbHVnaW4uICovXG5leHBvcnQgaW50ZXJmYWNlIElOYW1lZFBsdWdpblJlc291cmNlIHtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIHNob3J0IGRlc2NyaXB0aW9uLCBwb3B1bGF0ZWQgZm9yIHJlc291cmNlcyB3aG9zZSByZWFkZXJzXG5cdCAqIHBhcnNlIGl0IGZyb20gdGhlIGZpbGUncyBZQU1MIGZyb250bWF0dGVyIChlLmcuIGFnZW50cykuXG5cdCAqL1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuLyoqIEEgcGFyc2VkIGFnZW50IHJlc291cmNlIHdpdGggdGhlIGZyb250bWF0dGVyIG1ldGFkYXRhIHNoYXJlZCBieSBwcm92aWRlcnMuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFBsdWdpblJlc291cmNlIGV4dGVuZHMgSU5hbWVkUGx1Z2luUmVzb3VyY2Uge1xuXHRyZWFkb25seSBtb2RlbD86IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgZGlzYWJsZU1vZGVsSW52b2NhdGlvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRpc2FibGVVc2VySW52b2NhdGlvbj86IGJvb2xlYW47XG59XG5cbi8qKiBBIHBhcnNlZCBhZ2VudCBwYWlyZWQgd2l0aCBpdHMgcHJvdG9jb2wtbGV2ZWwgY2hpbGQgY3VzdG9taXphdGlvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlZEFnZW50IGV4dGVuZHMgSUFnZW50UGx1Z2luUmVzb3VyY2Uge1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uOiBBZ2VudEN1c3RvbWl6YXRpb247XG59XG5cbi8qKiBBIHBhcnNlZCBza2lsbCBwYWlyZWQgd2l0aCBpdHMgcHJvdG9jb2wtbGV2ZWwgY2hpbGQgY3VzdG9taXphdGlvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBhcnNlZFNraWxsIGV4dGVuZHMgSU5hbWVkUGx1Z2luUmVzb3VyY2Uge1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uOiBTa2lsbEN1c3RvbWl6YXRpb247XG59XG5cbi8qKiBBIHBhcnNlZCBydWxlIChpbnN0cnVjdGlvbikgcGFpcmVkIHdpdGggaXRzIHByb3RvY29sLWxldmVsIGNoaWxkIGN1c3RvbWl6YXRpb24uICovXG5leHBvcnQgaW50ZXJmYWNlIElQYXJzZWRSdWxlIGV4dGVuZHMgSU5hbWVkUGx1Z2luUmVzb3VyY2Uge1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uOiBSdWxlQ3VzdG9taXphdGlvbjtcbn1cblxuLyoqIFRoZSByZXN1bHQgb2YgcGFyc2luZyBhIHNpbmdsZSBwbHVnaW4gZGlyZWN0b3J5LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUGFyc2VkUGx1Z2luIHtcblx0cmVhZG9ubHkgZm9ybWF0OiBQbHVnaW5Gb3JtYXQ7XG5cdHJlYWRvbmx5IGhvb2tzOiByZWFkb25seSBJUGFyc2VkSG9va0dyb3VwW107XG5cdHJlYWRvbmx5IG1jcFNlcnZlcnM6IHJlYWRvbmx5IElNY3BTZXJ2ZXJEZWZpbml0aW9uW107XG5cdHJlYWRvbmx5IHNraWxsczogcmVhZG9ubHkgSVBhcnNlZFNraWxsW107XG5cdHJlYWRvbmx5IGFnZW50czogcmVhZG9ubHkgSVBhcnNlZEFnZW50W107XG5cdHJlYWRvbmx5IGluc3RydWN0aW9uczogcmVhZG9ubHkgSVBhcnNlZFJ1bGVbXTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBQbHVnaW4gZm9ybWF0IGRldGVjdGlvblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBjb25zdCBlbnVtIFBsdWdpbkZvcm1hdCB7XG5cdENvcGlsb3QsXG5cdENsYXVkZSxcblx0T3BlblBsdWdpbixcblx0QWdlbnRQbHVnaW4sXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBsdWdpbkZvcm1hdENvbmZpZyB7XG5cdHJlYWRvbmx5IGZvcm1hdDogUGx1Z2luRm9ybWF0O1xuXHRyZWFkb25seSBtYW5pZmVzdFBhdGg6IHN0cmluZztcblx0cmVhZG9ubHkgaG9va0NvbmZpZ1BhdGg6IHN0cmluZztcblx0cmVhZG9ubHkgY29tcG9uZW50UGF0aHM/OiBSZWFkb25seTxQYXJ0aWFsPFJlY29yZDxQbHVnaW5Db21wb25lbnQsIHN0cmluZyB8IGZhbHNlPj4+O1xuXHRyZWFkb25seSBtYW5pZmVzdEV4dGVuc2lvbk5hbWVzcGFjZT86IHN0cmluZztcblx0cmVhZG9ubHkgcmVxdWlyZXNNYW5pZmVzdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBsdWdpblJvb3RUb2tlbnM6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBwbHVnaW5Sb290RW52VmFyczogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKiBQYXJzZXMgaG9va3MgZnJvbSBhIEpTT04gb2JqZWN0IHVzaW5nIHRoZSBmb3JtYXQncyBjb252ZW50aW9ucy4gKi9cblx0cGFyc2VIb29rcyhob29rVXJpOiBVUkksIGpzb246IHVua25vd24sIHBsdWdpblVyaTogVVJJLCB3b3Jrc3BhY2VSb290OiBVUkkgfCB1bmRlZmluZWQsIHVzZXJIb21lOiBVUkkpOiBJUGFyc2VkSG9va0dyb3VwW107XG59XG5cbmV4cG9ydCB0eXBlIFBsdWdpbkNvbXBvbmVudCA9ICdjb21tYW5kcycgfCAnc2tpbGxzJyB8ICdhZ2VudHMnIHwgJ3J1bGVzJyB8ICdob29rcycgfCAnbWNwU2VydmVycyc7XG5cbmNvbnN0IENPUElMT1RfRk9STUFUOiBJUGx1Z2luRm9ybWF0Q29uZmlnID0ge1xuXHRmb3JtYXQ6IFBsdWdpbkZvcm1hdC5Db3BpbG90LFxuXHRtYW5pZmVzdFBhdGg6ICdwbHVnaW4uanNvbicsXG5cdGhvb2tDb25maWdQYXRoOiAnaG9va3MuanNvbicsXG5cdHBsdWdpblJvb3RUb2tlbnM6IFsnJHtQTFVHSU5fUk9PVH0nLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9J10sXG5cdHBsdWdpblJvb3RFbnZWYXJzOiBbJ1BMVUdJTl9ST09UJywgJ0NMQVVERV9QTFVHSU5fUk9PVCddLFxuXHRwYXJzZUhvb2tzKGhvb2tVcmksIGpzb24sIF9wbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKSB7XG5cdFx0cmV0dXJuIHBhcnNlSG9va3NKc29uKGhvb2tVcmksIGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0fSxcbn07XG5cbmNvbnN0IENMQVVERV9GT1JNQVQ6IElQbHVnaW5Gb3JtYXRDb25maWcgPSB7XG5cdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNsYXVkZSxcblx0bWFuaWZlc3RQYXRoOiAnLmNsYXVkZS1wbHVnaW4vcGx1Z2luLmpzb24nLFxuXHRob29rQ29uZmlnUGF0aDogJ2hvb2tzL2hvb2tzLmpzb24nLFxuXHRwbHVnaW5Sb290VG9rZW5zOiBbJyR7UExVR0lOX1JPT1R9JywgJyR7Q0xBVURFX1BMVUdJTl9ST09UfSddLFxuXHRwbHVnaW5Sb290RW52VmFyczogWydQTFVHSU5fUk9PVCcsICdDTEFVREVfUExVR0lOX1JPT1QnXSxcblx0cGFyc2VIb29rcyhob29rVXJpLCBqc29uLCBwbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKSB7XG5cdFx0cmV0dXJuIGludGVycG9sYXRlSG9va1BsdWdpblJvb3QoaG9va1VyaSwganNvbiwgcGx1Z2luVXJpLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSwgJyR7Q0xBVURFX1BMVUdJTl9ST09UfScsICdDTEFVREVfUExVR0lOX1JPT1QnKTtcblx0fSxcbn07XG5cbmNvbnN0IE9QRU5fUExVR0lOX0ZPUk1BVDogSVBsdWdpbkZvcm1hdENvbmZpZyA9IHtcblx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuT3BlblBsdWdpbixcblx0bWFuaWZlc3RQYXRoOiAnLnBsdWdpbi9wbHVnaW4uanNvbicsXG5cdGhvb2tDb25maWdQYXRoOiAnaG9va3MvaG9va3MuanNvbicsXG5cdHBsdWdpblJvb3RUb2tlbnM6IFsnJHtQTFVHSU5fUk9PVH0nLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9J10sXG5cdHBsdWdpblJvb3RFbnZWYXJzOiBbJ1BMVUdJTl9ST09UJywgJ0NMQVVERV9QTFVHSU5fUk9PVCddLFxuXHRwYXJzZUhvb2tzKGhvb2tVcmksIGpzb24sIHBsdWdpblVyaSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpIHtcblx0XHRyZXR1cm4gaW50ZXJwb2xhdGVIb29rUGx1Z2luUm9vdChob29rVXJpLCBqc29uLCBwbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lLCAnJHtQTFVHSU5fUk9PVH0nLCAnUExVR0lOX1JPT1QnKTtcblx0fSxcbn07XG5cbmNvbnN0IEFHRU5UX1BMVUdJTl9DT1BJTE9UX0VYVEVOU0lPTl9OQU1FU1BBQ0UgPSAnY29tLmdpdGh1Yi5jb3BpbG90JztcblxuY29uc3QgQUdFTlRfUExVR0lOX0ZPUk1BVDogSVBsdWdpbkZvcm1hdENvbmZpZyA9IHtcblx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4sXG5cdG1hbmlmZXN0UGF0aDogJ3BsdWdpbi5qc29uJyxcblx0aG9va0NvbmZpZ1BhdGg6IGAke0FHRU5UX1BMVUdJTl9DT1BJTE9UX0VYVEVOU0lPTl9OQU1FU1BBQ0V9L2hvb2tzL2hvb2tzLmpzb25gLFxuXHRjb21wb25lbnRQYXRoczoge1xuXHRcdGNvbW1hbmRzOiBgJHtBR0VOVF9QTFVHSU5fQ09QSUxPVF9FWFRFTlNJT05fTkFNRVNQQUNFfS9jb21tYW5kc2AsXG5cdFx0c2tpbGxzOiAnc2tpbGxzJyxcblx0XHRhZ2VudHM6IGAke0FHRU5UX1BMVUdJTl9DT1BJTE9UX0VYVEVOU0lPTl9OQU1FU1BBQ0V9L2FnZW50c2AsXG5cdFx0cnVsZXM6IGAke0FHRU5UX1BMVUdJTl9DT1BJTE9UX0VYVEVOU0lPTl9OQU1FU1BBQ0V9L3J1bGVzYCxcblx0XHRob29rczogYCR7QUdFTlRfUExVR0lOX0NPUElMT1RfRVhURU5TSU9OX05BTUVTUEFDRX0vaG9va3MvaG9va3MuanNvbmAsXG5cdFx0bWNwU2VydmVyczogJ21jcC5qc29uJyxcblx0fSxcblx0bWFuaWZlc3RFeHRlbnNpb25OYW1lc3BhY2U6IEFHRU5UX1BMVUdJTl9DT1BJTE9UX0VYVEVOU0lPTl9OQU1FU1BBQ0UsXG5cdHJlcXVpcmVzTWFuaWZlc3Q6IHRydWUsXG5cdHBsdWdpblJvb3RUb2tlbnM6IFtdLFxuXHRwbHVnaW5Sb290RW52VmFyczogW10sXG5cdHBhcnNlSG9va3MoaG9va1VyaSwganNvbiwgX3BsdWdpblVyaSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpIHtcblx0XHRyZXR1cm4gcGFyc2VIb29rc0pzb24oaG9va1VyaSwganNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHR9LFxufTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRldGVjdFBsdWdpbkZvcm1hdChwbHVnaW5Vcmk6IFVSSSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8SVBsdWdpbkZvcm1hdENvbmZpZz4ge1xuXHRpZiAoYXdhaXQgcmVhZEFnZW50UGx1Z2luTWFuaWZlc3QocGx1Z2luVXJpLCBmaWxlU2VydmljZSkpIHtcblx0XHRyZXR1cm4gQUdFTlRfUExVR0lOX0ZPUk1BVDtcblx0fVxuXHRpZiAoYXdhaXQgcGF0aEV4aXN0cyhqb2luUGF0aChwbHVnaW5VcmksICcucGx1Z2luJywgJ3BsdWdpbi5qc29uJyksIGZpbGVTZXJ2aWNlKSkge1xuXHRcdHJldHVybiBPUEVOX1BMVUdJTl9GT1JNQVQ7XG5cdH1cblxuXHRjb25zdCBpc0luQ2xhdWRlRGlyZWN0b3J5ID0gcGx1Z2luVXJpLnBhdGguc3BsaXQoJy8nKS5pbmNsdWRlcygnLmNsYXVkZScpO1xuXHRpZiAoaXNJbkNsYXVkZURpcmVjdG9yeSB8fCBhd2FpdCBwYXRoRXhpc3RzKGpvaW5QYXRoKHBsdWdpblVyaSwgJy5jbGF1ZGUtcGx1Z2luJywgJ3BsdWdpbi5qc29uJyksIGZpbGVTZXJ2aWNlKSkge1xuXHRcdHJldHVybiBDTEFVREVfRk9STUFUO1xuXHR9XG5cblx0cmV0dXJuIENPUElMT1RfRk9STUFUO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFBsdWdpbk1hbmlmZXN0KHBsdWdpblVyaTogVVJJLCBmb3JtYXQ6IElQbHVnaW5Gb3JtYXRDb25maWcsIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkPiB7XG5cdGlmIChmb3JtYXQuZm9ybWF0ID09PSBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4pIHtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IHJlYWRBZ2VudFBsdWdpbk1hbmlmZXN0KHBsdWdpblVyaSwgZmlsZVNlcnZpY2UpO1xuXHRcdHJldHVybiBtYW5pZmVzdCA/IHsgLi4ubWFuaWZlc3QgfSA6IHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBqc29uID0gYXdhaXQgcmVhZEpzb25GaWxlKGpvaW5QYXRoKHBsdWdpblVyaSwgZm9ybWF0Lm1hbmlmZXN0UGF0aCksIGZpbGVTZXJ2aWNlKTtcblx0cmV0dXJuIGpzb24gJiYgdHlwZW9mIGpzb24gPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGpzb24pID8ganNvbiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFBsdWdpbk1hbmlmZXN0Q29tcG9uZW50KGZvcm1hdDogSVBsdWdpbkZvcm1hdENvbmZpZywgY29tcG9uZW50OiBQbHVnaW5Db21wb25lbnQsIG1hbmlmZXN0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IHVua25vd24ge1xuXHRpZiAoZm9ybWF0Lm1hbmlmZXN0RXh0ZW5zaW9uTmFtZXNwYWNlKSB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IG1hbmlmZXN0Py5bJ2V4dGVuc2lvbnMnXTtcblx0XHRpZiAoIWV4dGVuc2lvbnMgfHwgdHlwZW9mIGV4dGVuc2lvbnMgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoZXh0ZW5zaW9ucykpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IChleHRlbnNpb25zIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtmb3JtYXQubWFuaWZlc3RFeHRlbnNpb25OYW1lc3BhY2VdO1xuXHRcdHJldHVybiBleHRlbnNpb24gJiYgdHlwZW9mIGV4dGVuc2lvbiA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uKVxuXHRcdFx0PyAoZXh0ZW5zaW9uIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtjb21wb25lbnRdXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gZm9ybWF0LmNvbXBvbmVudFBhdGhzICYmIE9iamVjdC5oYXNPd24oZm9ybWF0LmNvbXBvbmVudFBhdGhzLCBjb21wb25lbnQpID8gdW5kZWZpbmVkIDogbWFuaWZlc3Q/Lltjb21wb25lbnRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZVBsdWdpbkNvbXBvbmVudERpcnMoXG5cdHBsdWdpblVyaTogVVJJLFxuXHRmb3JtYXQ6IElQbHVnaW5Gb3JtYXRDb25maWcsXG5cdGNvbXBvbmVudDogUGx1Z2luQ29tcG9uZW50LFxuXHRmYWxsYmFja1BhdGg6IHN0cmluZyxcblx0bWFuaWZlc3RTZWN0aW9uOiB1bmtub3duLFxuXHRib3VuZGFyeVVyaT86IFVSSSxcbik6IHJlYWRvbmx5IFVSSVtdIHtcblx0Y29uc3QgY29tcG9uZW50UGF0aCA9IGZvcm1hdC5jb21wb25lbnRQYXRocz8uW2NvbXBvbmVudF07XG5cdGlmIChmb3JtYXQuY29tcG9uZW50UGF0aHMgJiYgT2JqZWN0Lmhhc093bihmb3JtYXQuY29tcG9uZW50UGF0aHMsIGNvbXBvbmVudCkpIHtcblx0XHRpZiAodHlwZW9mIGNvbXBvbmVudFBhdGggIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmICghZm9ybWF0Lm1hbmlmZXN0RXh0ZW5zaW9uTmFtZXNwYWNlKSB7XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCBjb21wb25lbnRQYXRoLCBlbXB0eUNvbXBvbmVudFBhdGhDb25maWcsIGJvdW5kYXJ5VXJpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25maWcgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcobWFuaWZlc3RTZWN0aW9uKTtcblx0XHRjb25zdCBkZWZhdWx0RGlycyA9IGNvbmZpZy5leGNsdXNpdmVcblx0XHRcdD8gW11cblx0XHRcdDogcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCBjb21wb25lbnRQYXRoLCBlbXB0eUNvbXBvbmVudFBhdGhDb25maWcsIGJvdW5kYXJ5VXJpKTtcblx0XHRjb25zdCBleHRlbnNpb25Sb290ID0gam9pblBhdGgocGx1Z2luVXJpLCBmb3JtYXQubWFuaWZlc3RFeHRlbnNpb25OYW1lc3BhY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWREaXJzID0gcmVzb2x2ZUNvbXBvbmVudERpcnMoZXh0ZW5zaW9uUm9vdCwgJycsIHsgcGF0aHM6IGNvbmZpZy5wYXRocywgZXhjbHVzaXZlOiB0cnVlIH0sIGV4dGVuc2lvblJvb3QpO1xuXHRcdHJldHVybiBbLi4uZGVmYXVsdERpcnMsIC4uLmNvbmZpZ3VyZWREaXJzXTtcblx0fVxuXHRyZXR1cm4gcmVzb2x2ZUNvbXBvbmVudERpcnMoXG5cdFx0cGx1Z2luVXJpLFxuXHRcdGZhbGxiYWNrUGF0aCxcblx0XHRwYXJzZUNvbXBvbmVudFBhdGhDb25maWcobWFuaWZlc3RTZWN0aW9uKSxcblx0XHRib3VuZGFyeVVyaSxcblx0KTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDaGlsZCBjdXN0b21pemF0aW9uIGhlbHBlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIE1pbnRzIGEgY2hpbGQtY3VzdG9taXphdGlvbiBpZCBmcm9tIGEgc291cmNlIHVyaSBwbHVzIGFuIG9wdGlvbmFsIG9wYXF1ZVxuICogZGlzYW1iaWd1YXRvci4gVXNlZCB3aGVuIG11bHRpcGxlIGN1c3RvbWl6YXRpb25zIGFyZSBkZWNsYXJlZCBpbmxpbmUgaW5cbiAqIGEgc2luZ2xlIGZpbGUgKGUuZy4gdHdvIE1DUCBzZXJ2ZXJzIGluIG9uZSBgLm1jcC5qc29uYCwgb3IgdHdvIGhvb2tcbiAqIGxpZmVjeWNsZSBncm91cHMgaW4gb25lIGhvb2sgZmlsZSkuXG4gKlxuICogUGVyY2VudC1lbmNvZGVzIGFueSBwcmUtZXhpc3RpbmcgYCNgIGluIHRoZSBVUkkgYmVmb3JlIGFwcGVuZGluZyB0aGVcbiAqIGRpc2FtYmlndWF0aW5nIGZyYWdtZW50IHNvIHRoZSByZXN1bHRpbmcgaWQgY2FuIG5ldmVyIGNvbGxpZGUgd2l0aCBhXG4gKiBVUkkgdGhhdCBoYXBwZW5zIHRvIGFscmVhZHkgY29udGFpbiBhIG1hdGNoaW5nIGZyYWdtZW50LlxuICovXG5mdW5jdGlvbiBidWlsZENoaWxkSWQodXJpOiBVUkksIGRpc2FtYmlndWF0b3I/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBiYXNlID0gY3VzdG9taXphdGlvbklkKHVyaS50b1N0cmluZygpKTtcblx0aWYgKCFkaXNhbWJpZ3VhdG9yKSB7XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblx0cmV0dXJuIGAke2Jhc2UucmVwbGFjZSgvIy9nLCAnJTIzJyl9IyR7ZGlzYW1iaWd1YXRvcn1gO1xufVxuXG5mdW5jdGlvbiBtYWtlQWdlbnRDdXN0b21pemF0aW9uKHJlc291cmNlOiBJQWdlbnRQbHVnaW5SZXNvdXJjZSk6IEFnZW50Q3VzdG9taXphdGlvbiB7XG5cdGNvbnN0IHVyaSA9IHJlc291cmNlLnVyaS50b1N0cmluZygpO1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdGlkOiBidWlsZENoaWxkSWQocmVzb3VyY2UudXJpKSxcblx0XHR1cmksXG5cdFx0bmFtZTogcmVzb3VyY2UubmFtZSxcblx0XHQuLi4ocmVzb3VyY2UuZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiByZXNvdXJjZS5kZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdC4uLihyZXNvdXJjZS5tb2RlbCA/IHsgbW9kZWw6IHJlc291cmNlLm1vZGVsIH0gOiB7fSksXG5cdFx0Li4uKHJlc291cmNlLnRvb2xzPy5sZW5ndGggPyB7IHRvb2xzOiBbLi4ucmVzb3VyY2UudG9vbHNdIH0gOiB7fSksXG5cdFx0Li4uKHJlc291cmNlLmRpc2FibGVNb2RlbEludm9jYXRpb24gPyB7IGRpc2FibGVNb2RlbEludm9jYXRpb246IHRydWUgfSA6IHt9KSxcblx0XHQuLi4ocmVzb3VyY2UuZGlzYWJsZVVzZXJJbnZvY2F0aW9uID8geyBkaXNhYmxlVXNlckludm9jYXRpb246IHRydWUgfSA6IHt9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVNraWxsQ3VzdG9taXphdGlvbihyZXNvdXJjZTogSU5hbWVkUGx1Z2luUmVzb3VyY2UpOiBTa2lsbEN1c3RvbWl6YXRpb24ge1xuXHRjb25zdCB1cmkgPSByZXNvdXJjZS51cmkudG9TdHJpbmcoKTtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCxcblx0XHRpZDogYnVpbGRDaGlsZElkKHJlc291cmNlLnVyaSksXG5cdFx0dXJpLFxuXHRcdG5hbWU6IHJlc291cmNlLm5hbWUsXG5cdFx0Li4uKHJlc291cmNlLmRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbjogcmVzb3VyY2UuZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVJ1bGVDdXN0b21pemF0aW9uKHJlc291cmNlOiBJTmFtZWRQbHVnaW5SZXNvdXJjZSk6IFJ1bGVDdXN0b21pemF0aW9uIHtcblx0Y29uc3QgdXJpID0gcmVzb3VyY2UudXJpLnRvU3RyaW5nKCk7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUnVsZSxcblx0XHRpZDogYnVpbGRDaGlsZElkKHJlc291cmNlLnVyaSksXG5cdFx0dXJpLFxuXHRcdG5hbWU6IHJlc291cmNlLm5hbWUsXG5cdFx0Li4uKHJlc291cmNlLmRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbjogcmVzb3VyY2UuZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZUhvb2tDdXN0b21pemF0aW9uKGhvb2tVcmk6IFVSSSk6IEhvb2tDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ib29rLFxuXHRcdGlkOiBidWlsZENoaWxkSWQoaG9va1VyaSksXG5cdFx0dXJpOiBob29rVXJpLnRvU3RyaW5nKCksXG5cdFx0bmFtZTogYmFzZW5hbWUoaG9va1VyaSksXG5cdH07XG59XG5cbi8qKlxuICogQnVpbGRzIHRoZSBwcm90b2NvbCB7QGxpbmsgTWNwU2VydmVyQ3VzdG9taXphdGlvbn0gZm9yIGFuIE1DUCBzZXJ2ZXJcbiAqIGRlY2xhcmVkIGF0IGBkZWZpbml0aW9uVXJpYCAodGhlIG1hbmlmZXN0IC8gc2V0dGluZ3MgLyBgLm1jcC5qc29uYCBmaWxlXG4gKiB0aGUgc2VydmVyIGlzIGRlZmluZWQgaW4pLiBUaGUgaWQgaXMgZGlzYW1iaWd1YXRlZCBieSBzZXJ2ZXIgYG5hbWVgIHNvXG4gKiBtdWx0aXBsZSBzZXJ2ZXJzIGRlY2xhcmVkIGluIG9uZSBmaWxlIGdldCBkaXN0aW5jdCBpZHMsIGFuZCB0aGUgZW50cnlcbiAqIGNhcnJpZXMge0BsaW5rIERFRkFVTFRfTUNQX0FQUH0gc28gTUNQIEFwcCBzdXBwb3J0IGlzIGFkdmVydGlzZWRcbiAqIGNvbnNpc3RlbnRseSB3aXRoIGV2ZXJ5IG90aGVyIE1DUCBjdXN0b21pemF0aW9uLlxuICpcbiAqIFRoZSBzZWVkIHN0YXRlIGlzIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZH06IGEgZGVjbGFyZWQtYnV0LW5vdC15ZXRcbiAqIGNvbm5lY3RlZCBzZXJ2ZXIgaGFzIG5vdCBiZWVuIHN0YXJ0ZWQgYnkgYW55IFNESywgc28gaXQgbXVzdCBub3QgY2xhaW0gdG9cbiAqIGJlIHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmd9LiBUaGUgbGl2ZSBzdGF0ZSBpcyBlbnJpY2hlZCBmcm9tIHRoZVxuICogU0RLJ3MgcmVwb3J0ZWQgc3RhdHVzIG9uY2UgYSBzZXNzaW9uIG1hdGVyaWFsaXplcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1ha2VNY3BTZXJ2ZXJDdXN0b21pemF0aW9uKGRlZmluaXRpb25Vcmk6IFVSSSwgbmFtZTogc3RyaW5nKTogTWNwU2VydmVyQ3VzdG9taXphdGlvbiB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdGlkOiBidWlsZENoaWxkSWQoZGVmaW5pdGlvblVyaSwgYG1jcD0ke2VuY29kZVVSSUNvbXBvbmVudChuYW1lKX1gKSxcblx0XHR1cmk6IGRlZmluaXRpb25VcmkudG9TdHJpbmcoKSxcblx0XHRuYW1lLFxuXHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0bWNwQXBwOiBERUZBVUxUX01DUF9BUFAsXG5cdH07XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQ29tcG9uZW50IHBhdGggY29uZmlnXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29tcG9uZW50UGF0aENvbmZpZyB7XG5cdHJlYWRvbmx5IHBhdGhzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgZXhjbHVzaXZlOiBib29sZWFuO1xufVxuXG5jb25zdCBlbXB0eUNvbXBvbmVudFBhdGhDb25maWc6IElDb21wb25lbnRQYXRoQ29uZmlnID0geyBwYXRoczogW10sIGV4Y2x1c2l2ZTogZmFsc2UgfTtcblxuLyoqXG4gKiBQYXJzZXMgYSBtYW5pZmVzdCBjb21wb25lbnQgcGF0aCBmaWVsZCBpbnRvIGEgbm9ybWFsaXplZCBjb25maWcuXG4gKiBTdXBwb3J0cyBgdW5kZWZpbmVkYCwgYHN0cmluZ2AsIGBzdHJpbmdbXWAsIGFuZCBgeyBwYXRoczogc3RyaW5nW10sIGV4Y2x1c2l2ZT86IGJvb2xlYW4gfWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcocmF3OiB1bmtub3duKTogSUNvbXBvbmVudFBhdGhDb25maWcge1xuXHRpZiAocmF3ID09PSB1bmRlZmluZWQgfHwgcmF3ID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGVtcHR5Q29tcG9uZW50UGF0aENvbmZpZztcblx0fVxuXG5cdGlmICh0eXBlb2YgcmF3ID09PSAnc3RyaW5nJykge1xuXHRcdGNvbnN0IHRyaW1tZWQgPSByYXcudHJpbSgpO1xuXHRcdHJldHVybiB0cmltbWVkID8geyBwYXRoczogW3RyaW1tZWRdLCBleGNsdXNpdmU6IGZhbHNlIH0gOiBlbXB0eUNvbXBvbmVudFBhdGhDb25maWc7XG5cdH1cblxuXHRpZiAoQXJyYXkuaXNBcnJheShyYXcpKSB7XG5cdFx0Y29uc3QgcGF0aHMgPSByYXdcblx0XHRcdC5maWx0ZXIodiA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycpXG5cdFx0XHQubWFwKHYgPT4gdi50cmltKCkpXG5cdFx0XHQuZmlsdGVyKHYgPT4gdi5sZW5ndGggPiAwKTtcblx0XHRyZXR1cm4geyBwYXRocywgZXhjbHVzaXZlOiBmYWxzZSB9O1xuXHR9XG5cblx0aWYgKHR5cGVvZiByYXcgPT09ICdvYmplY3QnKSB7XG5cdFx0Y29uc3Qgb2JqID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGlmIChBcnJheS5pc0FycmF5KG9ialsncGF0aHMnXSkpIHtcblx0XHRcdGNvbnN0IHBhdGhzID0gKG9ialsncGF0aHMnXSBhcyB1bmtub3duW10pXG5cdFx0XHRcdC5maWx0ZXIodiA9PiB0eXBlb2YgdiA9PT0gJ3N0cmluZycpXG5cdFx0XHRcdC5tYXAodiA9PiB2LnRyaW0oKSlcblx0XHRcdFx0LmZpbHRlcih2ID0+IHYubGVuZ3RoID4gMCk7XG5cdFx0XHRjb25zdCBleGNsdXNpdmUgPSBvYmpbJ2V4Y2x1c2l2ZSddID09PSB0cnVlO1xuXHRcdFx0cmV0dXJuIHsgcGF0aHMsIGV4Y2x1c2l2ZSB9O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBlbXB0eUNvbXBvbmVudFBhdGhDb25maWc7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIGRpcmVjdG9yaWVzIHRvIHNjYW4gZm9yIGEgZ2l2ZW4gY29tcG9uZW50IHR5cGUsIGNvbWJpbmluZ1xuICogdGhlIGRlZmF1bHQgZGlyZWN0b3J5IHdpdGggYW55IGN1c3RvbSBwYXRocyBmcm9tIHRoZSBtYW5pZmVzdCBjb25maWcuXG4gKiBQYXRocyB0aGF0IHJlc29sdmUgb3V0c2lkZSB0aGUgYm91bmRhcnkgYXJlIHNpbGVudGx5IGlnbm9yZWQuXG4gKiBAcGFyYW0gYm91bmRhcnlVcmkgVGhlIG91dGVybW9zdCBkaXJlY3RvcnkgdGhhdCByZXNvbHZlZCBwYXRocyBtdXN0IHN0YXkgd2l0aGluLiBEZWZhdWx0cyB0byB7QGxpbmsgcGx1Z2luVXJpfS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVDb21wb25lbnREaXJzKHBsdWdpblVyaTogVVJJLCBkZWZhdWx0RGlyOiBzdHJpbmcsIGNvbmZpZzogSUNvbXBvbmVudFBhdGhDb25maWcsIGJvdW5kYXJ5VXJpPzogVVJJKTogcmVhZG9ubHkgVVJJW10ge1xuXHRjb25zdCBib3VuZGFyeSA9IChib3VuZGFyeVVyaSAmJiBpc0VxdWFsT3JQYXJlbnQocGx1Z2luVXJpLCBib3VuZGFyeVVyaSkpID8gYm91bmRhcnlVcmkgOiBwbHVnaW5Vcmk7XG5cdGNvbnN0IGRpcnM6IFVSSVtdID0gW107XG5cdGlmICghY29uZmlnLmV4Y2x1c2l2ZSkge1xuXHRcdGRpcnMucHVzaChqb2luUGF0aChwbHVnaW5VcmksIGRlZmF1bHREaXIpKTtcblx0fVxuXHRmb3IgKGNvbnN0IHAgb2YgY29uZmlnLnBhdGhzKSB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBub3JtYWxpemVQYXRoKGpvaW5QYXRoKHBsdWdpblVyaSwgcCkpO1xuXHRcdGlmIChpc0VxdWFsT3JQYXJlbnQocmVzb2x2ZWQsIGJvdW5kYXJ5KSkge1xuXHRcdFx0ZGlycy5wdXNoKHJlc29sdmVkKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGRpcnM7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gTUNQIHNlcnZlciBoZWxwZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgTUNQIHNlcnZlciBtYXAgZnJvbSBhIHJhdyBKU09OIHZhbHVlLiBBY2NlcHRzIGJvdGggdGhlXG4gKiB3cmFwcGVkIGZvcm1hdCBgeyBtY3BTZXJ2ZXJzOiB7IFx1MjAyNiB9IH1gIGFuZCB0aGUgZmxhdCBmb3JtYXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlTWNwU2VydmVyc01hcChyYXc6IHVua25vd24pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkocmF3KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb2JqID0gcmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRyZXR1cm4gT2JqZWN0Lmhhc093bihvYmosICdtY3BTZXJ2ZXJzJylcblx0XHQ/IChvYmoubWNwU2VydmVycyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilcblx0XHQ6IG9iajtcbn1cblxuLyoqXG4gKiBOb3JtYWxpemVzIGEgcmF3IEpTT04gdmFsdWUgaW50byBhIHR5cGVkIE1DUCBzZXJ2ZXIgY29uZmlndXJhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24ocmF3Q29uZmlnOiB1bmtub3duKTogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJhd0NvbmZpZyB8fCB0eXBlb2YgcmF3Q29uZmlnICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBjYW5kaWRhdGUgPSByYXdDb25maWcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGNvbnN0IHR5cGUgPSB0eXBlb2YgY2FuZGlkYXRlWyd0eXBlJ10gPT09ICdzdHJpbmcnID8gY2FuZGlkYXRlWyd0eXBlJ10gOiB1bmRlZmluZWQ7XG5cblx0Y29uc3QgY29tbWFuZCA9IHR5cGVvZiBjYW5kaWRhdGVbJ2NvbW1hbmQnXSA9PT0gJ3N0cmluZycgPyBjYW5kaWRhdGVbJ2NvbW1hbmQnXSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgdXJsID0gdHlwZW9mIGNhbmRpZGF0ZVsndXJsJ10gPT09ICdzdHJpbmcnID8gY2FuZGlkYXRlWyd1cmwnXSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgYXJncyA9IEFycmF5LmlzQXJyYXkoY2FuZGlkYXRlWydhcmdzJ10pID8gY2FuZGlkYXRlWydhcmdzJ10uZmlsdGVyKCh2YWx1ZSk6IHZhbHVlIGlzIHN0cmluZyA9PiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgZW52ID0gY2FuZGlkYXRlWydlbnYnXSAmJiB0eXBlb2YgY2FuZGlkYXRlWydlbnYnXSA9PT0gJ29iamVjdCdcblx0XHQ/IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhjYW5kaWRhdGVbJ2VudiddIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVxuXHRcdFx0LmZpbHRlcigoWywgdmFsdWVdKSA9PiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgfHwgdmFsdWUgPT09IG51bGwpXG5cdFx0XHQubWFwKChba2V5LCB2YWx1ZV0pID0+IFtrZXksIHZhbHVlIGFzIHN0cmluZyB8IG51bWJlciB8IG51bGxdKSlcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3QgZW52RmlsZSA9IHR5cGVvZiBjYW5kaWRhdGVbJ2VudkZpbGUnXSA9PT0gJ3N0cmluZycgPyBjYW5kaWRhdGVbJ2VudkZpbGUnXSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgY3dkID0gdHlwZW9mIGNhbmRpZGF0ZVsnY3dkJ10gPT09ICdzdHJpbmcnID8gY2FuZGlkYXRlWydjd2QnXSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgaGVhZGVycyA9IGNhbmRpZGF0ZVsnaGVhZGVycyddICYmIHR5cGVvZiBjYW5kaWRhdGVbJ2hlYWRlcnMnXSA9PT0gJ29iamVjdCdcblx0XHQ/IE9iamVjdC5mcm9tRW50cmllcyhPYmplY3QuZW50cmllcyhjYW5kaWRhdGVbJ2hlYWRlcnMnXSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilcblx0XHRcdC5maWx0ZXIoKFssIHZhbHVlXSkgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJylcblx0XHRcdC5tYXAoKFtrZXksIHZhbHVlXSkgPT4gW2tleSwgdmFsdWUgYXMgc3RyaW5nXSkpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IGRldiA9IGNhbmRpZGF0ZVsnZGV2J10gJiYgdHlwZW9mIGNhbmRpZGF0ZVsnZGV2J10gPT09ICdvYmplY3QnID8gY2FuZGlkYXRlWydkZXYnXSBhcyBJTWNwU3RkaW9TZXJ2ZXJDb25maWd1cmF0aW9uWydkZXYnXSA6IHVuZGVmaW5lZDtcblxuXHRpZiAodHlwZSA9PT0gJ3dzJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAodHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCB8fCAoIXR5cGUgJiYgY29tbWFuZCkpIHtcblx0XHRpZiAoIWNvbW1hbmQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQsIGFyZ3MsIGVudiwgZW52RmlsZSwgY3dkLCBkZXYgfTtcblx0fVxuXG5cdGlmICh0eXBlID09PSBNY3BTZXJ2ZXJUeXBlLlJFTU9URSB8fCB0eXBlID09PSAnc3RyZWFtYWJsZS1odHRwJyB8fCB0eXBlID09PSAnc3NlJyB8fCAoIXR5cGUgJiYgdXJsKSkge1xuXHRcdGlmICghdXJsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyB0eXBlOiBNY3BTZXJ2ZXJUeXBlLlJFTU9URSwgdXJsLCBoZWFkZXJzLCBkZXYgfTtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQ2hhcmFjdGVycyBpbiBhIGZpbGUgcGF0aCB0aGF0IHJlcXVpcmUgc2hlbGwgcXVvdGluZyB0byBwcmV2ZW50XG4gKiB3b3JkIHNwbGl0dGluZyBvciBpbnRlcnByZXRhdGlvbiBieSBjb21tb24gc2hlbGxzLlxuICovXG5jb25zdCBzaGVsbFVuc2FmZUNoYXJzID0gL1tcXHMmfDw+KCleOyFgXCInXS87XG5cbi8qKlxuICogUmVwbGFjZXMgYSBwbHVnaW4tcm9vdCB0b2tlbiBpbiBhIHNoZWxsIGNvbW1hbmQgc3RyaW5nIHdpdGggdGhlXG4gKiBnaXZlbiBmc1BhdGgsIHNoZWxsLXF1b3RpbmcgaWYgdGhlIHBhdGggY29udGFpbnMgc3BlY2lhbCBjaGFyYWN0ZXJzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoY29tbWFuZDogc3RyaW5nLCBmc1BhdGg6IHN0cmluZywgdG9rZW46IHN0cmluZykge1xuXHRpZiAoIWNvbW1hbmQuaW5jbHVkZXModG9rZW4pKSB7XG5cdFx0cmV0dXJuIGNvbW1hbmQ7XG5cdH1cblxuXHRpZiAoIXNoZWxsVW5zYWZlQ2hhcnMudGVzdChmc1BhdGgpKSB7XG5cdFx0cmV0dXJuIGNvbW1hbmQucmVwbGFjZUFsbCh0b2tlbiwgZnNQYXRoKTtcblx0fVxuXG5cdGNvbnN0IGVzY2FwZWRUb2tlbiA9IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnModG9rZW4pO1xuXHRjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcblx0XHRgKFtcIiddPylgICsgZXNjYXBlZFRva2VuICsgYChbXFxcXHcuL1xcXFxcXFxcfjotXSopYCxcblx0XHQnZycsXG5cdCk7XG5cblx0cmV0dXJuIGNvbW1hbmQucmVwbGFjZShwYXR0ZXJuLCAoX21hdGNoLCBsZWFkaW5nUXVvdGU6IHN0cmluZywgc3VmZml4OiBzdHJpbmcpID0+IHtcblx0XHRjb25zdCBmdWxsUGF0aCA9IGZzUGF0aCArIHN1ZmZpeDtcblx0XHRpZiAobGVhZGluZ1F1b3RlKSB7XG5cdFx0XHRyZXR1cm4gbGVhZGluZ1F1b3RlICsgZnVsbFBhdGg7XG5cdFx0fVxuXHRcdHJldHVybiAnXCInICsgZnVsbFBhdGgucmVwbGFjZSgvXCIvZywgJ1xcXFxcIicpICsgJ1wiJztcblx0fSk7XG59XG5cbi8qKlxuICogUmVwbGFjZXMgcGx1Z2luLXJvb3QgdG9rZW4gcmVmZXJlbmNlcyBpbiBNQ1Agc2VydmVyIGRlZmluaXRpb24gc3RyaW5nIGZpZWxkc1xuICogd2l0aCB0aGUgcGx1Z2luIHJvb3QgZmlsZXN5c3RlbSBwYXRoLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW50ZXJwb2xhdGVNY3BQbHVnaW5Sb290KFxuXHRkZWY6IElNY3BTZXJ2ZXJEZWZpbml0aW9uLFxuXHRmc1BhdGg6IHN0cmluZyxcblx0dG9rZW5zOiByZWFkb25seSBzdHJpbmdbXSxcblx0ZW52VmFyczogcmVhZG9ubHkgc3RyaW5nW10sXG4pOiBJTWNwU2VydmVyRGVmaW5pdGlvbiB7XG5cdGNvbnN0IHJlcGxhY2UgPSAoczogc3RyaW5nKSA9PiB0b2tlbnMucmVkdWNlKChyZXN1bHQsIHRva2VuKSA9PiByZXN1bHQucmVwbGFjZUFsbCh0b2tlbiwgZnNQYXRoKSwgcyk7XG5cblx0Y29uc3QgY29uZmlnID0gZGVmLmNvbmZpZ3VyYXRpb247XG5cdGxldCBpbnRlcnBvbGF0ZWQ6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uO1xuXG5cdGlmIChjb25maWcudHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCkge1xuXHRcdGNvbnN0IGxvY2FsOiBNdXRhYmxlPElNY3BTdGRpb1NlcnZlckNvbmZpZ3VyYXRpb24+ID0geyAuLi5jb25maWcgfTtcblx0XHRsb2NhbC5jb21tYW5kID0gcmVwbGFjZShsb2NhbC5jb21tYW5kKTtcblx0XHRpZiAobG9jYWwuYXJncykge1xuXHRcdFx0bG9jYWwuYXJncyA9IGxvY2FsLmFyZ3MubWFwKHJlcGxhY2UpO1xuXHRcdH1cblx0XHRpZiAobG9jYWwuY3dkKSB7XG5cdFx0XHRsb2NhbC5jd2QgPSByZXBsYWNlKGxvY2FsLmN3ZCk7XG5cdFx0fVxuXHRcdGxvY2FsLmVudiA9IHsgLi4ubG9jYWwuZW52IH07XG5cdFx0Zm9yIChjb25zdCBbaywgdl0gb2YgT2JqZWN0LmVudHJpZXMobG9jYWwuZW52KSkge1xuXHRcdFx0aWYgKHR5cGVvZiB2ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRsb2NhbC5lbnZba10gPSByZXBsYWNlKHYpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGVudlZhciBvZiBlbnZWYXJzKSB7XG5cdFx0XHRsb2NhbC5lbnZbZW52VmFyXSA9IGZzUGF0aDtcblx0XHR9XG5cdFx0aWYgKGxvY2FsLmVudkZpbGUpIHtcblx0XHRcdGxvY2FsLmVudkZpbGUgPSByZXBsYWNlKGxvY2FsLmVudkZpbGUpO1xuXHRcdH1cblx0XHRpbnRlcnBvbGF0ZWQgPSBsb2NhbDtcblx0fSBlbHNlIHtcblx0XHRjb25zdCByZW1vdGU6IE11dGFibGU8SU1jcFJlbW90ZVNlcnZlckNvbmZpZ3VyYXRpb24+ID0geyAuLi5jb25maWcgfTtcblx0XHRyZW1vdGUudXJsID0gcmVwbGFjZShyZW1vdGUudXJsKTtcblx0XHRpZiAocmVtb3RlLmhlYWRlcnMpIHtcblx0XHRcdHJlbW90ZS5oZWFkZXJzID0gT2JqZWN0LmZyb21FbnRyaWVzKFxuXHRcdFx0XHRPYmplY3QuZW50cmllcyhyZW1vdGUuaGVhZGVycykubWFwKChbaywgdl0pID0+IFtrLCByZXBsYWNlKHYpXSlcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGludGVycG9sYXRlZCA9IHJlbW90ZTtcblx0fVxuXG5cdHJldHVybiB7IG5hbWU6IGRlZi5uYW1lLCBjb25maWd1cmF0aW9uOiBpbnRlcnBvbGF0ZWQsIHVyaTogZGVmLnVyaSwgY3VzdG9taXphdGlvbjogZGVmLmN1c3RvbWl6YXRpb24gfTtcbn1cblxuLyoqXG4gKiBSZWdleCBtYXRjaGluZyBiYXJlIGAke1ZBUl9OQU1FfWAgcmVmZXJlbmNlcyAodXBwZXJjYXNlIG9ubHkpIHRoYXQgYXJlIE5PVFxuICogdXNpbmcgVlMgQ29kZSdzIGAke2VudjpWQVJ9YCBjb2xvbi1kZWxpbWl0ZWQgc3ludGF4LlxuICovXG5jb25zdCBCQVJFX0VOVl9WQVJfUkUgPSAvXFwkXFx7KD8hW0EtWmEtel0rOikoW0EtWl9dW0EtWjAtOV9dKilcXH0vZztcblxuLyoqXG4gKiBDb252ZXJ0cyBiYXJlIGAke1ZBUn1gIGVudmlyb25tZW50LXZhcmlhYmxlIHJlZmVyZW5jZXMgdG8gVlMgQ29kZSBgJHtlbnY6VkFSfWAgc3ludGF4LlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoXG5cdGRlZjogSU1jcFNlcnZlckRlZmluaXRpb24sXG4pOiBJTWNwU2VydmVyRGVmaW5pdGlvbiB7XG5cdHJldHVybiBjbG9uZUFuZENoYW5nZShkZWYsICh2YWx1ZSkgPT4ge1xuXHRcdGlmIChVUkkuaXNVcmkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCByZXBsYWNlZCA9IHZhbHVlLnJlcGxhY2UoQkFSRV9FTlZfVkFSX1JFLCAnJHtlbnY6JDF9Jyk7XG5cdFx0XHRyZXR1cm4gcmVwbGFjZWQgIT09IHZhbHVlID8gcmVwbGFjZWQgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH0pO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEhvb2sgcGFyc2luZyBoZWxwZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBNYXBzIGtub3duIGhvb2sgdHlwZSBpZGVudGlmaWVycyBmcm9tIGFsbCBmb3JtYXRzIChWUyBDb2RlIFBhc2NhbENhc2UsXG4gKiBDb3BpbG90IENMSSBjYW1lbENhc2UsIENsYXVkZSBQYXNjYWxDYXNlKSB0byBjYW5vbmljYWwgaWRlbnRpZmllcnMuXG4gKi9cbmNvbnN0IEhPT0tfVFlQRV9NQVA6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdC8vIFBhc2NhbENhc2UgKFZTIENvZGUgLyBDbGF1ZGUpXG5cdCdTZXNzaW9uU3RhcnQnOiAnU2Vzc2lvblN0YXJ0Jyxcblx0J1Nlc3Npb25FbmQnOiAnU2Vzc2lvbkVuZCcsXG5cdCdVc2VyUHJvbXB0U3VibWl0JzogJ1VzZXJQcm9tcHRTdWJtaXQnLFxuXHQnUHJlVG9vbFVzZSc6ICdQcmVUb29sVXNlJyxcblx0J1Bvc3RUb29sVXNlJzogJ1Bvc3RUb29sVXNlJyxcblx0J1ByZUNvbXBhY3QnOiAnUHJlQ29tcGFjdCcsXG5cdCdTdWJhZ2VudFN0YXJ0JzogJ1N1YmFnZW50U3RhcnQnLFxuXHQnU3ViYWdlbnRTdG9wJzogJ1N1YmFnZW50U3RvcCcsXG5cdCdTdG9wJzogJ1N0b3AnLFxuXHQnRXJyb3JPY2N1cnJlZCc6ICdFcnJvck9jY3VycmVkJyxcblx0Ly8gY2FtZWxDYXNlIChHaXRIdWIgQ29waWxvdCBDTEkpXG5cdCdzZXNzaW9uU3RhcnQnOiAnU2Vzc2lvblN0YXJ0Jyxcblx0J3Nlc3Npb25FbmQnOiAnU2Vzc2lvbkVuZCcsXG5cdCd1c2VyUHJvbXB0U3VibWl0dGVkJzogJ1VzZXJQcm9tcHRTdWJtaXQnLFxuXHQncHJlVG9vbFVzZSc6ICdQcmVUb29sVXNlJyxcblx0J3Bvc3RUb29sVXNlJzogJ1Bvc3RUb29sVXNlJyxcblx0J2FnZW50U3RvcCc6ICdTdG9wJyxcblx0J3N1YmFnZW50U3RvcCc6ICdTdWJhZ2VudFN0b3AnLFxuXHQnZXJyb3JPY2N1cnJlZCc6ICdFcnJvck9jY3VycmVkJyxcbn07XG5cbi8qKlxuICogTm9ybWFsaXplcyBhIHJhdyBob29rIGNvbW1hbmQgb2JqZWN0LCB2YWxpZGF0aW5nIHN0cnVjdHVyZSBhbmQgbWFwcGluZ1xuICogbGVnYWN5IGBiYXNoYC9gcG93ZXJzaGVsbGAgZmllbGRzIHRvIHBsYXRmb3JtLXNwZWNpZmljIG92ZXJyaWRlcy5cbiAqL1xuZnVuY3Rpb24gbm9ybWFsaXplSG9va0NvbW1hbmQocmF3OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IElQYXJzZWRIb29rQ29tbWFuZCB8IHVuZGVmaW5lZCB7XG5cdC8vIEFsbG93IG9taXR0ZWQgdHlwZSAoQ2xhdWRlIGNvbXBhdGliaWxpdHkpIFx1MjAxNCB0cmVhdCBhcyAnY29tbWFuZCdcblx0aWYgKHJhdy50eXBlICE9PSB1bmRlZmluZWQgJiYgcmF3LnR5cGUgIT09ICdjb21tYW5kJykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBoYXNDb21tYW5kID0gdHlwZW9mIHJhdy5jb21tYW5kID09PSAnc3RyaW5nJyAmJiByYXcuY29tbWFuZC5sZW5ndGggPiAwO1xuXHRjb25zdCBoYXNCYXNoID0gdHlwZW9mIHJhdy5iYXNoID09PSAnc3RyaW5nJyAmJiAocmF3LmJhc2ggYXMgc3RyaW5nKS5sZW5ndGggPiAwO1xuXHRjb25zdCBoYXNQb3dlclNoZWxsID0gdHlwZW9mIHJhdy5wb3dlcnNoZWxsID09PSAnc3RyaW5nJyAmJiAocmF3LnBvd2Vyc2hlbGwgYXMgc3RyaW5nKS5sZW5ndGggPiAwO1xuXHRjb25zdCBoYXNXaW5kb3dzID0gdHlwZW9mIHJhdy53aW5kb3dzID09PSAnc3RyaW5nJyAmJiAocmF3LndpbmRvd3MgYXMgc3RyaW5nKS5sZW5ndGggPiAwO1xuXHRjb25zdCBoYXNMaW51eCA9IHR5cGVvZiByYXcubGludXggPT09ICdzdHJpbmcnICYmIChyYXcubGludXggYXMgc3RyaW5nKS5sZW5ndGggPiAwO1xuXHRjb25zdCBoYXNPc3ggPSB0eXBlb2YgcmF3Lm9zeCA9PT0gJ3N0cmluZycgJiYgKHJhdy5vc3ggYXMgc3RyaW5nKS5sZW5ndGggPiAwO1xuXG5cdGlmICghaGFzQ29tbWFuZCAmJiAhaGFzQmFzaCAmJiAhaGFzUG93ZXJTaGVsbCAmJiAhaGFzV2luZG93cyAmJiAhaGFzTGludXggJiYgIWhhc09zeCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCB3aW5kb3dzID0gaGFzV2luZG93cyA/IHJhdy53aW5kb3dzIGFzIHN0cmluZyA6IChoYXNQb3dlclNoZWxsID8gcmF3LnBvd2Vyc2hlbGwgYXMgc3RyaW5nIDogdW5kZWZpbmVkKTtcblx0Y29uc3QgbGludXggPSBoYXNMaW51eCA/IHJhdy5saW51eCBhcyBzdHJpbmcgOiAoaGFzQmFzaCA/IHJhdy5iYXNoIGFzIHN0cmluZyA6IHVuZGVmaW5lZCk7XG5cdGNvbnN0IG9zeCA9IGhhc09zeCA/IHJhdy5vc3ggYXMgc3RyaW5nIDogKGhhc0Jhc2ggPyByYXcuYmFzaCBhcyBzdHJpbmcgOiB1bmRlZmluZWQpO1xuXG5cdGNvbnN0IHRpbWVvdXQgPSB0eXBlb2YgcmF3LnRpbWVvdXQgPT09ICdudW1iZXInXG5cdFx0PyByYXcudGltZW91dFxuXHRcdDogKHR5cGVvZiByYXcudGltZW91dFNlYyA9PT0gJ251bWJlcicgPyByYXcudGltZW91dFNlYyA6IHVuZGVmaW5lZCk7XG5cblx0cmV0dXJuIHtcblx0XHQuLi4oaGFzQ29tbWFuZCAmJiB7IGNvbW1hbmQ6IHJhdy5jb21tYW5kIGFzIHN0cmluZyB9KSxcblx0XHQuLi4od2luZG93cyAmJiB7IHdpbmRvd3MgfSksXG5cdFx0Li4uKGxpbnV4ICYmIHsgbGludXggfSksXG5cdFx0Li4uKG9zeCAmJiB7IG9zeCB9KSxcblx0XHQuLi4odHlwZW9mIHJhdy5lbnYgPT09ICdvYmplY3QnICYmIHJhdy5lbnYgIT09IG51bGwgJiYgeyBlbnY6IHJhdy5lbnYgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9KSxcblx0XHQuLi4odGltZW91dCAhPT0gdW5kZWZpbmVkICYmIHsgdGltZW91dCB9KSxcblx0fTtcbn1cblxuLyoqXG4gKiBSZXNvbHZlcyBhIHJhdyBob29rIGNvbW1hbmQgSlNPTiBvYmplY3QgaW50byBhIHtAbGluayBJUGFyc2VkSG9va0NvbW1hbmR9LFxuICogbm9ybWFsaXppbmcgZmllbGRzIGFuZCByZXNvbHZpbmcgdGhlIHdvcmtpbmcgZGlyZWN0b3J5LlxuICovXG5mdW5jdGlvbiByZXNvbHZlSG9va0NvbW1hbmQocmF3OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgd29ya3NwYWNlUm9vdDogVVJJIHwgdW5kZWZpbmVkLCB1c2VySG9tZTogVVJJKTogSVBhcnNlZEhvb2tDb21tYW5kIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZUhvb2tDb21tYW5kKHJhdyk7XG5cdGlmICghbm9ybWFsaXplZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRsZXQgY3dkVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IHJhd0N3ZCA9IHR5cGVvZiByYXcuY3dkID09PSAnc3RyaW5nJyA/IHJhdy5jd2QgOiB1bmRlZmluZWQ7XG5cdGlmIChyYXdDd2QpIHtcblx0XHRpZiAocmF3Q3dkLnN0YXJ0c1dpdGgoJ34vJykpIHtcblx0XHRcdGN3ZFVyaSA9IFVSSS5qb2luUGF0aCh1c2VySG9tZSwgcmF3Q3dkLnN1YnN0cmluZygyKSk7XG5cdFx0fSBlbHNlIGlmIChpc0Fic29sdXRlKHJhd0N3ZCkpIHtcblx0XHRcdGN3ZFVyaSA9IFVSSS5maWxlKHJhd0N3ZCk7XG5cdFx0fSBlbHNlIGlmICh3b3Jrc3BhY2VSb290KSB7XG5cdFx0XHRjd2RVcmkgPSBqb2luUGF0aCh3b3Jrc3BhY2VSb290LCByYXdDd2QpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRjd2RVcmkgPSB3b3Jrc3BhY2VSb290O1xuXHR9XG5cblx0cmV0dXJuIHsgLi4ubm9ybWFsaXplZCwgY3dkOiBjd2RVcmkgfTtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBob29rIGNvbW1hbmRzIGZyb20gYW4gaXRlbSB0aGF0IG1heSBiZSBhIGRpcmVjdCBjb21tYW5kIG9iamVjdFxuICogb3IgYSBuZXN0ZWQgc3RydWN0dXJlIHdpdGggYSBgbWF0Y2hlcmAgKENsYXVkZSBmb3JtYXQpLlxuICovXG5mdW5jdGlvbiBleHRyYWN0SG9va0NvbW1hbmRzKGl0ZW06IHVua25vd24sIHdvcmtzcGFjZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZCwgdXNlckhvbWU6IFVSSSk6IElQYXJzZWRIb29rQ29tbWFuZFtdIHtcblx0aWYgKCFpdGVtIHx8IHR5cGVvZiBpdGVtICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IGl0ZW1PYmogPSBpdGVtIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRjb25zdCBjb21tYW5kczogSVBhcnNlZEhvb2tDb21tYW5kW10gPSBbXTtcblxuXHQvLyBOZXN0ZWQgaG9va3Mgd2l0aCBtYXRjaGVyIChDbGF1ZGUgc3R5bGUpOiB7IG1hdGNoZXI6IFwiLi4uXCIsIGhvb2tzOiBbLi4uXSB9XG5cdGNvbnN0IG5lc3RlZEhvb2tzID0gaXRlbU9iai5ob29rcztcblx0aWYgKG5lc3RlZEhvb2tzICE9PSB1bmRlZmluZWQgJiYgQXJyYXkuaXNBcnJheShuZXN0ZWRIb29rcykpIHtcblx0XHRmb3IgKGNvbnN0IG5lc3RlZCBvZiBuZXN0ZWRIb29rcykge1xuXHRcdFx0aWYgKCFuZXN0ZWQgfHwgdHlwZW9mIG5lc3RlZCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IHJlc29sdmVIb29rQ29tbWFuZChuZXN0ZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHRjb21tYW5kcy5wdXNoKHJlc29sdmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlSG9va0NvbW1hbmQoaXRlbU9iaiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0Y29tbWFuZHMucHVzaChyZXNvbHZlZCk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNvbW1hbmRzO1xufVxuXG4vKipcbiAqIFBhcnNlcyBob29rcyBmcm9tIGEgSlNPTiBvYmplY3QgKGFueSBzdXBwb3J0ZWQgZm9ybWF0KS5cbiAqXG4gKiBIYW5kbGVzIENsYXVkZSdzIGBkaXNhYmxlQWxsSG9va3NgIHNob3J0LWNpcmN1aXQsIHRoZSBgSE9PS19UWVBFX01BUGBcbiAqIGNhbm9uaWNhbGl6YXRpb24sIGFuZCB0aGUgbmVzdGVkIGB7IG1hdGNoZXIsIGhvb2tzOiBbLi4uXSB9YCBjb21tYW5kXG4gKiBmb3JtLiBSZXR1cm5zIG9uZSB7QGxpbmsgSVBhcnNlZEhvb2tHcm91cH0gcGVyIHJlY29nbml6ZWQgbGlmZWN5Y2xlXG4gKiBldmVudDsgYWxsIGdyb3VwcyBwYXJzZWQgZnJvbSB0aGUgc2FtZSBmaWxlIHNoYXJlIGEgc2luZ2xlXG4gKiB7QGxpbmsgSVBhcnNlZEhvb2tHcm91cC5jdXN0b21pemF0aW9ufSAoa2V5ZWQgb24gYGhvb2tVcmlgKSwgc28gY2FsbGVyc1xuICogdGhhdCBvbmx5IG5lZWQgdGhlIGZpbGUtbGV2ZWwgY3VzdG9taXphdGlvbiBjYW4gcmVhZCBpdCBvZmYgYW55IGdyb3VwLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VIb29rc0pzb24oXG5cdGhvb2tVcmk6IFVSSSxcblx0anNvbjogdW5rbm93bixcblx0d29ya3NwYWNlUm9vdDogVVJJIHwgdW5kZWZpbmVkLFxuXHR1c2VySG9tZTogVVJJLFxuKTogSVBhcnNlZEhvb2tHcm91cFtdIHtcblx0aWYgKCFqc29uIHx8IHR5cGVvZiBqc29uICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGNvbnN0IHJvb3QgPSBqc29uIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5cdC8vIENsYXVkZSdzIGRpc2FibGVBbGxIb29rc1xuXHRpZiAocm9vdC5kaXNhYmxlQWxsSG9va3MgPT09IHRydWUpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBob29rcyA9IHJvb3QuaG9va3M7XG5cdGNvbnN0IGhvb2tzT2JqID0gaG9va3MgJiYgdHlwZW9mIGhvb2tzID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShob29rcylcblx0XHQ/IGhvb2tzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+XG5cdFx0OiByb290O1xuXHRjb25zdCByZXN1bHQ6IElQYXJzZWRIb29rR3JvdXBbXSA9IFtdO1xuXHRjb25zdCBjdXN0b21pemF0aW9uID0gbWFrZUhvb2tDdXN0b21pemF0aW9uKGhvb2tVcmkpO1xuXG5cdGZvciAoY29uc3Qgb3JpZ2luYWxJZCBvZiBPYmplY3Qua2V5cyhob29rc09iaikpIHtcblx0XHRjb25zdCBjYW5vbmljYWxUeXBlID0gSE9PS19UWVBFX01BUFtvcmlnaW5hbElkXTtcblx0XHRpZiAoIWNhbm9uaWNhbFR5cGUpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvb2tBcnJheSA9IGhvb2tzT2JqW29yaWdpbmFsSWRdO1xuXHRcdGlmICghQXJyYXkuaXNBcnJheShob29rQXJyYXkpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21tYW5kczogSVBhcnNlZEhvb2tDb21tYW5kW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaG9va0FycmF5KSB7XG5cdFx0XHRjb21tYW5kcy5wdXNoKC4uLmV4dHJhY3RIb29rQ29tbWFuZHMoaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpKTtcblx0XHR9XG5cblx0XHRpZiAoY29tbWFuZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmVzdWx0LnB1c2goeyB0eXBlOiBjYW5vbmljYWxUeXBlLCBjb21tYW5kcywgdXJpOiBob29rVXJpLCBvcmlnaW5hbElkLCBjdXN0b21pemF0aW9uIH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQXBwbGllcyBwbHVnaW4tcm9vdCB0b2tlbiBpbnRlcnBvbGF0aW9uIHRvIGhvb2sgY29tbWFuZHMgZm9yXG4gKiBDbGF1ZGUgYW5kIE9wZW5QbHVnaW4gZm9ybWF0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGludGVycG9sYXRlSG9va1BsdWdpblJvb3QoXG5cdGhvb2tVcmk6IFVSSSxcblx0anNvbjogdW5rbm93bixcblx0cGx1Z2luVXJpOiBVUkksXG5cdHdvcmtzcGFjZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZCxcblx0dXNlckhvbWU6IFVSSSxcblx0dG9rZW46IHN0cmluZyxcblx0ZW52VmFyOiBzdHJpbmcsXG4pOiBJUGFyc2VkSG9va0dyb3VwW10ge1xuXHRjb25zdCBmc1BhdGggPSBwbHVnaW5VcmkuZnNQYXRoO1xuXHRjb25zdCB0eXBlZEpzb24gPSBqc29uIGFzIHsgaG9va3M/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duW10+IH07XG5cblx0Y29uc3QgbXV0YXRlSG9va0NvbW1hbmQgPSAoaG9vazogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkID0+IHtcblx0XHRmb3IgKGNvbnN0IGZpZWxkIG9mIFsnY29tbWFuZCcsICd3aW5kb3dzJywgJ2xpbnV4JywgJ29zeCddIGFzIGNvbnN0KSB7XG5cdFx0XHRpZiAodHlwZW9mIGhvb2tbZmllbGRdID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRob29rW2ZpZWxkXSA9IHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKGhvb2tbZmllbGRdIGFzIHN0cmluZywgZnNQYXRoLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFob29rLmVudiB8fCB0eXBlb2YgaG9vay5lbnYgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRob29rLmVudiA9IHt9O1xuXHRcdH1cblx0XHQoaG9vay5lbnYgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPilbZW52VmFyXSA9IGZzUGF0aDtcblx0fTtcblxuXHRmb3IgKGNvbnN0IGxpZmVjeWNsZSBvZiBPYmplY3QudmFsdWVzKHR5cGVkSnNvbi5ob29rcyA/PyB7fSkpIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkobGlmZWN5Y2xlKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgbGlmZWN5Y2xlRW50cnkgb2YgbGlmZWN5Y2xlKSB7XG5cdFx0XHRpZiAoIWxpZmVjeWNsZUVudHJ5IHx8IHR5cGVvZiBsaWZlY3ljbGVFbnRyeSAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRyeSA9IGxpZmVjeWNsZUVudHJ5IGFzIHsgaG9va3M/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdIH0gJiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KGVudHJ5Lmhvb2tzKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGhvb2sgb2YgZW50cnkuaG9va3MpIHtcblx0XHRcdFx0XHRtdXRhdGVIb29rQ29tbWFuZChob29rKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bXV0YXRlSG9va0NvbW1hbmQoZW50cnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHJlcGxhY2VyID0gKHY6IHVua25vd24pOiB1bmtub3duID0+IHtcblx0XHRyZXR1cm4gdHlwZW9mIHYgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IHYucmVwbGFjZUFsbCh0b2tlbiwgcGx1Z2luVXJpLmZzUGF0aClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHR9O1xuXG5cdHJldHVybiBwYXJzZUhvb2tzSnNvbihob29rVXJpLCBjbG9uZUFuZENoYW5nZShqc29uLCByZXBsYWNlciksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBGaWxlc3lzdGVtIGhlbHBlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZEpzb25GaWxlKHVyaTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTx1bmtub3duIHwgdW5kZWZpbmVkPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnRzID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRyZXR1cm4gcGFyc2VKU09OQyhmaWxlQ29udGVudHMudmFsdWUudG9TdHJpbmcoKSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHBhdGhFeGlzdHMocmVzb3VyY2U6IFVSSSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0cnkge1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDb21wb25lbnQgcmVhZGVyc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IENPTU1BTkRfRklMRV9TVUZGSVggPSAnLm1kJztcbmNvbnN0IFJVTEVfRklMRV9TVUZGSVggPSAnLm1kYyc7XG5jb25zdCBJTlNUUlVDVElPTl9GSUxFX1NVRkZJWCA9ICcuaW5zdHJ1Y3Rpb25zLm1kJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRTa2lsbHMoXG5cdHBsdWdpblJvb3Q6IFVSSSxcblx0ZGlyczogcmVhZG9ubHkgVVJJW10sXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdG9wdGlvbnM/OiB7IHJlYWRvbmx5IGNoaWxkRGlyZWN0b3JpZXNPbmx5PzogYm9vbGVhbjsgcmVhZG9ubHkgY29udGFpbm1lbnRSb290PzogVVJJIH0sXG4pOiBQcm9taXNlPHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10+IHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBza2lsbHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbXTtcblxuXHRjb25zdCBhZGRTa2lsbCA9IGFzeW5jIChuYW1lOiBzdHJpbmcsIHNraWxsTWQ6IFVSSSkgPT4ge1xuXHRcdGlmIChvcHRpb25zPy5jb250YWlubWVudFJvb3QgJiYgIWF3YWl0IGlzUmVzb2x2ZWRXaXRoaW4ob3B0aW9ucy5jb250YWlubWVudFJvb3QsIHNraWxsTWQsIGZpbGVTZXJ2aWNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkSW5mbyA9IGF3YWl0IHBhcnNlU2tpbGxGaWxlKHNraWxsTWQsIGZpbGVTZXJ2aWNlKTtcblx0XHRcdGRlc2NyaXB0aW9uID0gcGFyc2VkSW5mby5kZXNjcmlwdGlvbjtcblx0XHRcdG5hbWUgPSBwYXJzZWRJbmZvLm5hbWUgfHwgbmFtZTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIEtlZXAgdGhlIGV4aXN0aW5nIGJlc3QtZWZmb3J0IGRpc2NvdmVyeSBiZWhhdmlvciBmb3IgbWFsZm9ybWVkIHNraWxscy5cblx0XHR9XG5cdFx0aWYgKHNlZW4uaGFzKG5hbWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdHNraWxscy5wdXNoKHsgdXJpOiBza2lsbE1kLCBuYW1lLCAuLi4oZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uIH0gOiB7fSkgfSk7XG5cdH07XG5cblx0YXdhaXQgUHJvbWlzZS5hbGwoZGlycy5tYXAoYXN5bmMgZGlyID0+IHtcblx0XHRpZiAoIW9wdGlvbnM/LmNoaWxkRGlyZWN0b3JpZXNPbmx5KSB7XG5cdFx0XHRjb25zdCBza2lsbE1kID0gVVJJLmpvaW5QYXRoKGRpciwgJ1NLSUxMLm1kJyk7XG5cdFx0XHRpZiAoYXdhaXQgcGF0aEV4aXN0cyhza2lsbE1kLCBmaWxlU2VydmljZSkpIHtcblx0XHRcdFx0YXdhaXQgYWRkU2tpbGwoYmFzZW5hbWUoZGlyKSwgc2tpbGxNZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlc29sdmUoZGlyKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXQuaXNEaXJlY3RvcnkgfHwgIXN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChzdGF0LmNoaWxkcmVuLm1hcChhc3luYyBjaGlsZCA9PiB7XG5cdFx0XHRjb25zdCBjaGlsZFNraWxsTWQgPSBVUkkuam9pblBhdGgoY2hpbGQucmVzb3VyY2UsICdTS0lMTC5tZCcpO1xuXHRcdFx0aWYgKGF3YWl0IHBhdGhFeGlzdHMoY2hpbGRTa2lsbE1kLCBmaWxlU2VydmljZSkpIHtcblx0XHRcdFx0YXdhaXQgYWRkU2tpbGwoYmFzZW5hbWUoY2hpbGQucmVzb3VyY2UpLCBjaGlsZFNraWxsTWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fSkpO1xuXG5cdGlmICghb3B0aW9ucz8uY2hpbGREaXJlY3Rvcmllc09ubHkgJiYgc2tpbGxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdGNvbnN0IHJvb3RTa2lsbE1kID0gVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdTS0lMTC5tZCcpO1xuXHRcdGlmIChhd2FpdCBwYXRoRXhpc3RzKHJvb3RTa2lsbE1kLCBmaWxlU2VydmljZSkpIHtcblx0XHRcdGF3YWl0IGFkZFNraWxsKGJhc2VuYW1lKHBsdWdpblJvb3QpLCByb290U2tpbGxNZCk7XG5cdFx0fVxuXHR9XG5cblx0c2tpbGxzLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRyZXR1cm4gc2tpbGxzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFBsdWdpblNraWxscyhwbHVnaW5Sb290OiBVUkksIGRpcnM6IHJlYWRvbmx5IFVSSVtdLCBmb3JtYXQ6IElQbHVnaW5Gb3JtYXRDb25maWcsIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10+IHtcblx0cmV0dXJuIHJlYWRTa2lsbHMocGx1Z2luUm9vdCwgZGlycywgZmlsZVNlcnZpY2UsIGZvcm1hdC5mb3JtYXQgPT09IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpblxuXHRcdD8geyBjaGlsZERpcmVjdG9yaWVzT25seTogdHJ1ZSwgY29udGFpbm1lbnRSb290OiBwbHVnaW5Sb290IH1cblx0XHQ6IHVuZGVmaW5lZCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGlzUmVzb2x2ZWRXaXRoaW4ocm9vdDogVVJJLCByZXNvdXJjZTogVVJJLCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgW3Jlc29sdmVkUm9vdCwgcmVzb2x2ZWRSZXNvdXJjZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRmaWxlU2VydmljZS5yZWFscGF0aChyb290KSxcblx0XHRcdGZpbGVTZXJ2aWNlLnJlYWxwYXRoKHJlc291cmNlKSxcblx0XHRdKTtcblx0XHRyZXR1cm4gaXNFcXVhbE9yUGFyZW50KHJlc29sdmVkUmVzb3VyY2UgPz8gbm9ybWFsaXplUGF0aChyZXNvdXJjZSksIHJlc29sdmVkUm9vdCA/PyBub3JtYWxpemVQYXRoKHJvb3QpKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkTWFya2Rvd25Db21wb25lbnRzKFxuXHRkaXJzOiByZWFkb25seSBVUklbXSxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0b3B0aW9ucz86IHsgcmVhZG9ubHkgY29udGFpbm1lbnRSb290PzogVVJJIH0sXG4pOiBQcm9taXNlPHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10+IHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBpdGVtczogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFtdO1xuXG5cdGNvbnN0IGFkZEl0ZW0gPSBhc3luYyAobmFtZTogc3RyaW5nLCB1cmk6IFVSSSkgPT4ge1xuXHRcdGlmIChvcHRpb25zPy5jb250YWlubWVudFJvb3QgJiYgIWF3YWl0IGlzUmVzb2x2ZWRXaXRoaW4ob3B0aW9ucy5jb250YWlubWVudFJvb3QsIHVyaSwgZmlsZVNlcnZpY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghc2Vlbi5oYXMobmFtZSkpIHtcblx0XHRcdHNlZW4uYWRkKG5hbWUpO1xuXHRcdFx0aXRlbXMucHVzaCh7IHVyaSwgbmFtZSB9KTtcblx0XHR9XG5cdH07XG5cblx0Zm9yIChjb25zdCBkaXIgb2YgZGlycykge1xuXHRcdGxldCBzdGF0O1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVzb2x2ZShkaXIpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXQuaXNGaWxlICYmIGV4dG5hbWUoZGlyKS50b0xvd2VyQ2FzZSgpID09PSBDT01NQU5EX0ZJTEVfU1VGRklYKSB7XG5cdFx0XHRhd2FpdCBhZGRJdGVtKGJhc2VuYW1lKGRpcikuc2xpY2UoMCwgLUNPTU1BTkRfRklMRV9TVUZGSVgubGVuZ3RoKSwgZGlyKTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSB8fCAhc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoIWNoaWxkLmlzRmlsZSB8fCBleHRuYW1lKGNoaWxkLnJlc291cmNlKS50b0xvd2VyQ2FzZSgpICE9PSBDT01NQU5EX0ZJTEVfU1VGRklYKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgYWRkSXRlbShiYXNlbmFtZShjaGlsZC5yZXNvdXJjZSkuc2xpY2UoMCwgLUNPTU1BTkRfRklMRV9TVUZGSVgubGVuZ3RoKSwgY2hpbGQucmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdGl0ZW1zLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRyZXR1cm4gaXRlbXM7XG59XG5cbmZ1bmN0aW9uIGdldEluc3RydWN0aW9uRmlsZU5hbWUocmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZpbGVOYW1lID0gYmFzZW5hbWUocmVzb3VyY2UpO1xuXHRjb25zdCBsb3dlck5hbWUgPSBmaWxlTmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRpZiAobG93ZXJOYW1lLmVuZHNXaXRoKFJVTEVfRklMRV9TVUZGSVgpKSB7XG5cdFx0cmV0dXJuIGZpbGVOYW1lLnNsaWNlKDAsIC1SVUxFX0ZJTEVfU1VGRklYLmxlbmd0aCk7XG5cdH1cblx0aWYgKGxvd2VyTmFtZS5lbmRzV2l0aChJTlNUUlVDVElPTl9GSUxFX1NVRkZJWCkpIHtcblx0XHRyZXR1cm4gZmlsZU5hbWUuc2xpY2UoMCwgLUlOU1RSVUNUSU9OX0ZJTEVfU1VGRklYLmxlbmd0aCk7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBSZWFkcyBydWxlL2luc3RydWN0aW9uIGZpbGVzIGZyb20gcGx1Z2luIGBydWxlc2AgY29tcG9uZW50IGRpcmVjdG9yaWVzLlxuICpcbiAqIE9wZW4gUGx1Z2lucyBydWxlcyBhcmUgY29udmVudGlvbmFsbHkgYC5tZGNgIGZpbGVzLiBXZSBhbHNvIGFjY2VwdFxuICogYC5pbnN0cnVjdGlvbnMubWRgIGZvciBjb21wYXRpYmlsaXR5IHdpdGggVlMgQ29kZS1kaXNjb3ZlcmVkIGluc3RydWN0aW9uc1xuICogYnVuZGxlZCBhcyBzeW50aGV0aWMgcGx1Z2lucy5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRJbnN0cnVjdGlvbkNvbXBvbmVudHMoXG5cdGRpcnM6IHJlYWRvbmx5IFVSSVtdLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRvcHRpb25zPzogeyByZWFkb25seSBjb250YWlubWVudFJvb3Q/OiBVUkkgfSxcbik6IFByb21pc2U8cmVhZG9ubHkgSU5hbWVkUGx1Z2luUmVzb3VyY2VbXT4ge1xuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IGl0ZW1zOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW107XG5cblx0Y29uc3QgYWRkSXRlbSA9IGFzeW5jIChuYW1lOiBzdHJpbmcsIHVyaTogVVJJKSA9PiB7XG5cdFx0aWYgKG9wdGlvbnM/LmNvbnRhaW5tZW50Um9vdCAmJiAhYXdhaXQgaXNSZXNvbHZlZFdpdGhpbihvcHRpb25zLmNvbnRhaW5tZW50Um9vdCwgdXJpLCBmaWxlU2VydmljZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFzZWVuLmhhcyhuYW1lKSkge1xuXHRcdFx0c2Vlbi5hZGQobmFtZSk7XG5cdFx0XHRpdGVtcy5wdXNoKHsgdXJpLCBuYW1lIH0pO1xuXHRcdH1cblx0fTtcblxuXHRmb3IgKGNvbnN0IGRpciBvZiBkaXJzKSB7XG5cdFx0bGV0IHN0YXQ7XG5cdFx0dHJ5IHtcblx0XHRcdHN0YXQgPSBhd2FpdCBmaWxlU2VydmljZS5yZXNvbHZlKGRpcik7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoc3RhdC5pc0ZpbGUpIHtcblx0XHRcdGNvbnN0IGluc3RydWN0aW9uTmFtZSA9IGdldEluc3RydWN0aW9uRmlsZU5hbWUoZGlyKTtcblx0XHRcdGlmIChpbnN0cnVjdGlvbk5hbWUpIHtcblx0XHRcdFx0YXdhaXQgYWRkSXRlbShpbnN0cnVjdGlvbk5hbWUsIGRpcik7XG5cdFx0XHR9XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRpZiAoIXN0YXQuaXNEaXJlY3RvcnkgfHwgIXN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0aWYgKCFjaGlsZC5pc0ZpbGUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbk5hbWUgPSBnZXRJbnN0cnVjdGlvbkZpbGVOYW1lKGNoaWxkLnJlc291cmNlKTtcblx0XHRcdGlmIChpbnN0cnVjdGlvbk5hbWUpIHtcblx0XHRcdFx0YXdhaXQgYWRkSXRlbShpbnN0cnVjdGlvbk5hbWUsIGNoaWxkLnJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpdGVtcy5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKTtcblx0cmV0dXJuIGl0ZW1zO1xufVxuXG4vKipcbiAqIFJlYWRzIGAubWRgIGZpbGVzIGluIGFnZW50IGRpcmVjdG9yaWVzIGFuZCBlbnJpY2hlcyBlYWNoIGVudHJ5IHdpdGhcbiAqIHRoZSBvcHRpb25hbCBgbmFtZWAgLyBgZGVzY3JpcHRpb25gIGZyb20gWUFNTCBmcm9udG1hdHRlci4gRmFsbHMgYmFja1xuICogdG8gdGhlIGZpbGUtZGVyaXZlZCBuYW1lIHdoZW4gZnJvbnRtYXR0ZXIgaXMgbWlzc2luZyBvciB1bnJlYWRhYmxlLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZEFnZW50Q29tcG9uZW50cyhcblx0ZGlyczogcmVhZG9ubHkgVVJJW10sXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdG9wdGlvbnM/OiB7IHJlYWRvbmx5IGNvbnRhaW5tZW50Um9vdD86IFVSSSB9LFxuKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRQbHVnaW5SZXNvdXJjZVtdPiB7XG5cdGNvbnN0IGZpbGVzID0gYXdhaXQgcmVhZE1hcmtkb3duQ29tcG9uZW50cyhkaXJzLCBmaWxlU2VydmljZSwgb3B0aW9ucyk7XG5cdGlmIChmaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gZmlsZXM7XG5cdH1cblx0Y29uc3QgZW5yaWNoZWQgPSBhd2FpdCBQcm9taXNlLmFsbChmaWxlcy5tYXAoYXN5bmMgZmlsZSA9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IGF3YWl0IHBhcnNlQWdlbnRGaWxlKGZpbGUudXJpLCBmaWxlU2VydmljZSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IGZpbGUudXJpLFxuXHRcdFx0XHRuYW1lOiBwYXJzZWQubmFtZSB8fCBmaWxlLm5hbWUsXG5cdFx0XHRcdC4uLihwYXJzZWQuZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiBwYXJzZWQuZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0XHRcdFx0Li4uKHBhcnNlZC5tb2RlbCA/IHsgbW9kZWw6IHBhcnNlZC5tb2RlbCB9IDoge30pLFxuXHRcdFx0XHQuLi4ocGFyc2VkLnRvb2xzPy5sZW5ndGggPyB7IHRvb2xzOiBwYXJzZWQudG9vbHMgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHBhcnNlZC5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uID8geyBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uOiB0cnVlIH0gOiB7fSksXG5cdFx0XHRcdC4uLihwYXJzZWQudXNlckludm9jYWJsZSA9PT0gZmFsc2UgPyB7IGRpc2FibGVVc2VySW52b2NhdGlvbjogdHJ1ZSB9IDoge30pLFxuXHRcdFx0fSBzYXRpc2ZpZXMgSUFnZW50UGx1Z2luUmVzb3VyY2U7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gZmlsZTtcblx0XHR9XG5cdH0pKTtcblx0Ly8gRGUtZHVwZSBhZ2FpbiBpbiBjYXNlIGZyb250bWF0dGVyIGBuYW1lYCBjb2xsaWRlczsgZmlyc3Qtc2VlbiB3aW5zLlxuXHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGNvbnN0IHJlc3VsdDogSUFnZW50UGx1Z2luUmVzb3VyY2VbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgZW5yaWNoZWQpIHtcblx0XHRpZiAoc2Vlbi5oYXMoaXRlbS5uYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHNlZW4uYWRkKGl0ZW0ubmFtZSk7XG5cdFx0cmVzdWx0LnB1c2goaXRlbSk7XG5cdH1cblx0cmVzdWx0LnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VBZ2VudEZpbGUodXJpOiBVUkksIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UpOiBQcm9taXNlPHsgbmFtZTogc3RyaW5nOyBkZXNjcmlwdGlvbj86IHN0cmluZzsgdXNlckludm9jYWJsZT86IGJvb2xlYW47IG1vZGVsPzogc3RyaW5nOyB0b29scz86IHJlYWRvbmx5IHN0cmluZ1tdOyBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uPzogYm9vbGVhbiB9PiB7XG5cdC8vIFVzZSByZWdleCB0byBzdHJpcCB0aGUgdHJhaWxpbmcgYC5hZ2VudC5tZGAgb3IgLm1kIGJlZm9yZSBwYXJzaW5nLCBzbyB3ZSBjYW4gZmFsbCBiYWNrIHRvIGEgY2xlYW5lciBuYW1lIGlmIGZyb250bWF0dGVyIGlzIG1pc3Npbmcgb3IgYnJva2VuLlxuXHRjb25zdCBuYW1lRnJvbUZpbGUgPSBiYXNlbmFtZSh1cmkpLnJlcGxhY2UoLyhcXC5hZ2VudCk/XFwubWQkL2ksICcnKTtcblx0dHJ5IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCBmcm9udG1hdHRlciA9IHBhcnNlRnJvbnRNYXR0ZXIoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRjb25zdCBuYW1lID0gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ1ZhbHVlKCduYW1lJyk/LnRyaW0oKSB8fCBuYW1lRnJvbUZpbGU7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBmcm9udG1hdHRlcj8uZ2V0U3RyaW5nVmFsdWUoJ2Rlc2NyaXB0aW9uJyk/LnRyaW0oKTtcblx0XHRjb25zdCB1c2VySW52b2NhYmxlID0gZnJvbnRtYXR0ZXI/LmdldEJvb2xlYW5WYWx1ZSgndXNlci1pbnZvY2FibGUnKTtcblx0XHRjb25zdCBtb2RlbCA9IGZyb250bWF0dGVyPy5nZXRTdHJpbmdBcnJheVZhbHVlKCdtb2RlbCcpPy5tYXAodmFsdWUgPT4gdmFsdWUudHJpbSgpKS5maW5kKEJvb2xlYW4pO1xuXHRcdGNvbnN0IHRvb2xzID0gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ0FycmF5VmFsdWUoJ3Rvb2xzJyk/Lm1hcCh2YWx1ZSA9PiB2YWx1ZS50cmltKCkpLmZpbHRlcihCb29sZWFuKTtcblx0XHRjb25zdCBpbmZlciA9IGZyb250bWF0dGVyPy5nZXRCb29sZWFuVmFsdWUoJ2luZmVyJyk7XG5cdFx0Y29uc3QgZGlzYWJsZU1vZGVsSW52b2NhdGlvbiA9IHJlc29sdmVBZ2VudERpc2FibGVNb2RlbEludm9jYXRpb24oaW5mZXIsIGZyb250bWF0dGVyPy5nZXRCb29sZWFuVmFsdWUoJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbicpKTtcblx0XHRyZXR1cm4geyBuYW1lLCBkZXNjcmlwdGlvbiwgdXNlckludm9jYWJsZSwgbW9kZWwsIHRvb2xzLCBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uIH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7IG5hbWU6IG5hbWVGcm9tRmlsZSB9O1xuXHR9XG59XG5cbi8qKiBSZXNvbHZlcyB0aGUgZGVwcmVjYXRlZCBgaW5mZXJgIGZpZWxkIGJlZm9yZSBpdHMgbW9kZXJuIHJlcGxhY2VtZW50LCBtYXRjaGluZyB3b3Jrc3BhY2UtYWdlbnQgcGFyc2luZy4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlQWdlbnREaXNhYmxlTW9kZWxJbnZvY2F0aW9uKGluZmVyOiBib29sZWFuIHwgdW5kZWZpbmVkLCBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uOiBib29sZWFuIHwgdW5kZWZpbmVkLCBmYWxsYmFjaz86IGJvb2xlYW4pOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGluZmVyICE9PSB1bmRlZmluZWQgPyAhaW5mZXIgOiAoZGlzYWJsZU1vZGVsSW52b2NhdGlvbiA/PyBmYWxsYmFjayk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVNraWxsRmlsZSh1cmk6IFVSSSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8eyBuYW1lOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyB1c2VySW52b2thYmxlPzogYm9vbGVhbiB9PiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgZnJvbnRtYXR0ZXIgPSBwYXJzZUZyb250TWF0dGVyKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGZyb250bWF0dGVyPy5nZXRTdHJpbmdWYWx1ZSgnbmFtZScpPy50cmltKCkgfHwgYmFzZW5hbWUoZGlybmFtZSh1cmkpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGZyb250bWF0dGVyPy5nZXRTdHJpbmdWYWx1ZSgnZGVzY3JpcHRpb24nKT8udHJpbSgpO1xuXHRcdGNvbnN0IHVzZXJJbnZva2FibGUgPSBmcm9udG1hdHRlcj8uZ2V0Qm9vbGVhblZhbHVlKCd1c2VyLWludm9jYWJsZScpO1xuXHRcdHJldHVybiB7IG5hbWUsIGRlc2NyaXB0aW9uLCB1c2VySW52b2thYmxlIH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB7IG5hbWU6IGJhc2VuYW1lKGRpcm5hbWUodXJpKSkgfTtcblx0fVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VSdWxlRmlsZSh1cmk6IFVSSSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8eyBuYW1lOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyBnbG9icz86IHN0cmluZ1tdOyBhbHdheXNBcHBseT86IGJvb2xlYW4gfT4ge1xuXHRjb25zdCBuYW1lRnJvbUZpbGUgPSBiYXNlbmFtZSh1cmkpLnJlcGxhY2UoLyhcXC5pbnN0cnVjdGlvbnMpP1xcLm1kJC9pLCAnJyk7XG5cdHRyeSB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0Y29uc3QgZnJvbnRtYXR0ZXIgPSBwYXJzZUZyb250TWF0dGVyKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgbmFtZSA9IGZyb250bWF0dGVyPy5nZXRTdHJpbmdWYWx1ZSgnbmFtZScpPy50cmltKCkgfHwgbmFtZUZyb21GaWxlO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gZnJvbnRtYXR0ZXI/LmdldFN0cmluZ1ZhbHVlKCdkZXNjcmlwdGlvbicpPy50cmltKCk7XG5cdFx0Y29uc3QgZ2xvYnMgPSBmcm9udG1hdHRlcj8uZ2V0U3RyaW5nQXJyYXlWYWx1ZSgnZ2xvYnMnKSA/PyBmcm9udG1hdHRlcj8uZ2V0U3RyaW5nQXJyYXlWYWx1ZSgnYXBwbHlUbycpID8/IGZyb250bWF0dGVyPy5nZXRTdHJpbmdBcnJheVZhbHVlKCdwYXRocycpID8/IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhbHdheXNBcHBseSA9IGZyb250bWF0dGVyPy5nZXRCb29sZWFuVmFsdWUoJ2Fsd2F5c0FwcGx5Jyk7XG5cdFx0cmV0dXJuIHsgbmFtZSwgZGVzY3JpcHRpb24sIGdsb2JzLCBhbHdheXNBcHBseSB9O1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4geyBuYW1lOiBuYW1lRnJvbUZpbGUgfTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiByZWFkSG9va3MoXG5cdHBsdWdpblVyaTogVVJJLFxuXHRwYXRoczogcmVhZG9ubHkgVVJJW10sXG5cdGZvcm1hdENvbmZpZzogSVBsdWdpbkZvcm1hdENvbmZpZyxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0d29ya3NwYWNlUm9vdDogVVJJIHwgdW5kZWZpbmVkLFxuXHR1c2VySG9tZTogVVJJLFxuKTogUHJvbWlzZTxyZWFkb25seSBJUGFyc2VkSG9va0dyb3VwW10+IHtcblx0Zm9yIChjb25zdCBob29rUGF0aCBvZiBwYXRocykge1xuXHRcdGlmIChmb3JtYXRDb25maWcuZm9ybWF0ID09PSBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4gJiYgIWF3YWl0IGlzUmVzb2x2ZWRXaXRoaW4ocGx1Z2luVXJpLCBob29rUGF0aCwgZmlsZVNlcnZpY2UpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QganNvbiA9IGF3YWl0IHJlYWRKc29uRmlsZShob29rUGF0aCwgZmlsZVNlcnZpY2UpO1xuXHRcdGlmICghanNvbikge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZvcm1hdENvbmZpZy5wYXJzZUhvb2tzKGhvb2tQYXRoLCBqc29uLCBwbHVnaW5VcmksIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0fVxuXHRyZXR1cm4gW107XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlYWRNY3BTZXJ2ZXJzKFxuXHRwbHVnaW5Vcmk6IFVSSSxcblx0cGF0aHM6IHJlYWRvbmx5IFVSSVtdLFxuXHRmb3JtYXRDb25maWc6IElQbHVnaW5Gb3JtYXRDb25maWcsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG4pOiBQcm9taXNlPHJlYWRvbmx5IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10+IHtcblx0Y29uc3QgbWVyZ2VkID0gbmV3IE1hcDxzdHJpbmcsIElNY3BTZXJ2ZXJEZWZpbml0aW9uPigpO1xuXHRmb3IgKGNvbnN0IG1jcFBhdGggb2YgcGF0aHMpIHtcblx0XHRpZiAoZm9ybWF0Q29uZmlnLmZvcm1hdCA9PT0gUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luICYmICFhd2FpdCBpc1Jlc29sdmVkV2l0aGluKHBsdWdpblVyaSwgbWNwUGF0aCwgZmlsZVNlcnZpY2UpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QganNvbiA9IGF3YWl0IHJlYWRKc29uRmlsZShtY3BQYXRoLCBmaWxlU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBkZWYgb2YgcGFyc2VNY3BTZXJ2ZXJEZWZpbml0aW9uTWFwKG1jcFBhdGgsIGpzb24sIHBsdWdpblVyaS5mc1BhdGgsIGZvcm1hdENvbmZpZykpIHtcblx0XHRcdGlmICghbWVyZ2VkLmhhcyhkZWYubmFtZSkpIHtcblx0XHRcdFx0bWVyZ2VkLnNldChkZWYubmFtZSwgZGVmKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIFsuLi5tZXJnZWQudmFsdWVzKCldLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVhZFBsdWdpbk1jcFNlcnZlcnMoXG5cdHBsdWdpblVyaTogVVJJLFxuXHRwYXRoczogcmVhZG9ubHkgVVJJW10sXG5cdGZvcm1hdDogSVBsdWdpbkZvcm1hdENvbmZpZyxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcbik6IFByb21pc2U8cmVhZG9ubHkgSU1jcFNlcnZlckRlZmluaXRpb25bXT4ge1xuXHRyZXR1cm4gcmVhZE1jcFNlcnZlcnMocGx1Z2luVXJpLCBwYXRocywgZm9ybWF0LCBmaWxlU2VydmljZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU1jcFNlcnZlckRlZmluaXRpb25NYXAoXG5cdGRlZmluaXRpb25VUkk6IFVSSSxcblx0cmF3OiB1bmtub3duLFxuXHRwbHVnaW5Gc1BhdGg6IHN0cmluZyxcblx0Zm9ybWF0Q29uZmlnOiBJUGx1Z2luRm9ybWF0Q29uZmlnLFxuKTogSU1jcFNlcnZlckRlZmluaXRpb25bXSB7XG5cdGNvbnN0IG1jcFNlcnZlcnMgPSByZXNvbHZlTWNwU2VydmVyc01hcChyYXcpO1xuXHRpZiAoIW1jcFNlcnZlcnMpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBkZWZpbml0aW9uczogSU1jcFNlcnZlckRlZmluaXRpb25bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IFtuYW1lLCBjb25maWdWYWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMobWNwU2VydmVycykpIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbihjb25maWdWYWx1ZSk7XG5cdFx0aWYgKCFjb25maWd1cmF0aW9uKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRsZXQgZGVmOiBJTWNwU2VydmVyRGVmaW5pdGlvbiA9IHtcblx0XHRcdG5hbWUsXG5cdFx0XHRjb25maWd1cmF0aW9uLFxuXHRcdFx0dXJpOiBkZWZpbml0aW9uVVJJLFxuXHRcdFx0Y3VzdG9taXphdGlvbjogbWFrZU1jcFNlcnZlckN1c3RvbWl6YXRpb24oZGVmaW5pdGlvblVSSSwgbmFtZSksXG5cdFx0fTtcblx0XHRkZWYgPSBpbnRlcnBvbGF0ZU1jcFBsdWdpblJvb3QoZGVmLCBwbHVnaW5Gc1BhdGgsIGZvcm1hdENvbmZpZy5wbHVnaW5Sb290VG9rZW5zLCBmb3JtYXRDb25maWcucGx1Z2luUm9vdEVudlZhcnMpO1xuXHRcdGlmIChmb3JtYXRDb25maWcuZm9ybWF0ICE9PSBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4gJiYgZGVmLmNvbmZpZ3VyYXRpb24udHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCAmJiBkZWYuY29uZmlndXJhdGlvbi5jd2QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0ZGVmID0geyAuLi5kZWYsIGNvbmZpZ3VyYXRpb246IHsgLi4uZGVmLmNvbmZpZ3VyYXRpb24sIGN3ZDogcGx1Z2luRnNQYXRoIH0gfTtcblx0XHR9XG5cdFx0aWYgKGZvcm1hdENvbmZpZy5mb3JtYXQgIT09IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpbikge1xuXHRcdFx0ZGVmID0gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoZGVmKTtcblx0XHR9XG5cdFx0ZGVmaW5pdGlvbnMucHVzaChkZWYpO1xuXHR9XG5cblx0cmV0dXJuIGRlZmluaXRpb25zO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFRvcC1sZXZlbCBwYXJzZSBmdW5jdGlvblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogUGFyc2VzIGEgcGx1Z2luIGRpcmVjdG9yeSB0byBleHRyYWN0IGhvb2tzLCBNQ1Agc2VydmVycywgc2tpbGxzLCBhZ2VudHMsXG4gKiBhbmQgaW5zdHJ1Y3Rpb25zLlxuICogVGhpcyBpcyB0aGUgbWFpbiBlbnRyeSBwb2ludCBmb3IgdGhlIGFnZW50IGhvc3QgdG8gZGlzY292ZXIgcGx1Z2luIGNvbnRlbnRzLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGFyc2VQbHVnaW4oXG5cdHBsdWdpblVyaTogVVJJLFxuXHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHR3b3Jrc3BhY2VSb290OiBVUkkgfCB1bmRlZmluZWQsXG5cdHVzZXJIb21lOiBVUkksXG5cdGJvdW5kYXJ5VXJpPzogVVJJLFxuKTogUHJvbWlzZTxJUGFyc2VkUGx1Z2luPiB7XG5cdGNvbnN0IGZvcm1hdENvbmZpZyA9IGF3YWl0IGRldGVjdFBsdWdpbkZvcm1hdChwbHVnaW5VcmksIGZpbGVTZXJ2aWNlKTtcblxuXHQvLyBSZWFkIG1hbmlmZXN0XG5cdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgcmVhZFBsdWdpbk1hbmlmZXN0KHBsdWdpblVyaSwgZm9ybWF0Q29uZmlnLCBmaWxlU2VydmljZSk7XG5cdGlmIChmb3JtYXRDb25maWcucmVxdWlyZXNNYW5pZmVzdCAmJiAhbWFuaWZlc3QpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFBsdWdpbiBtYW5pZmVzdCAnJHtqb2luUGF0aChwbHVnaW5VcmksIGZvcm1hdENvbmZpZy5tYW5pZmVzdFBhdGgpLnRvU3RyaW5nKCl9JyBpcyBtaXNzaW5nYCk7XG5cdH1cblxuXHQvLyBSZXNvbHZlIGNvbXBvbmVudCBkaXJlY3RvcmllcyBmcm9tIG1hbmlmZXN0XG5cdGNvbnN0IGhvb2tzU2VjdGlvbiA9IGdldFBsdWdpbk1hbmlmZXN0Q29tcG9uZW50KGZvcm1hdENvbmZpZywgJ2hvb2tzJywgbWFuaWZlc3QpO1xuXHRjb25zdCBtY3BTZWN0aW9uID0gZ2V0UGx1Z2luTWFuaWZlc3RDb21wb25lbnQoZm9ybWF0Q29uZmlnLCAnbWNwU2VydmVycycsIG1hbmlmZXN0KTtcblx0Y29uc3Qgc2tpbGxzU2VjdGlvbiA9IGdldFBsdWdpbk1hbmlmZXN0Q29tcG9uZW50KGZvcm1hdENvbmZpZywgJ3NraWxscycsIG1hbmlmZXN0KTtcblx0Y29uc3QgYWdlbnRzU2VjdGlvbiA9IGdldFBsdWdpbk1hbmlmZXN0Q29tcG9uZW50KGZvcm1hdENvbmZpZywgJ2FnZW50cycsIG1hbmlmZXN0KTtcblx0Y29uc3QgcnVsZXNTZWN0aW9uID0gZ2V0UGx1Z2luTWFuaWZlc3RDb21wb25lbnQoZm9ybWF0Q29uZmlnLCAncnVsZXMnLCBtYW5pZmVzdCk7XG5cdGNvbnN0IGhvb2tEaXJzID0gcmVzb2x2ZVBsdWdpbkNvbXBvbmVudERpcnMocGx1Z2luVXJpLCBmb3JtYXRDb25maWcsICdob29rcycsIGZvcm1hdENvbmZpZy5ob29rQ29uZmlnUGF0aCwgaG9va3NTZWN0aW9uLCBib3VuZGFyeVVyaSk7XG5cdGNvbnN0IG1jcERpcnMgPSByZXNvbHZlUGx1Z2luQ29tcG9uZW50RGlycyhwbHVnaW5VcmksIGZvcm1hdENvbmZpZywgJ21jcFNlcnZlcnMnLCAnLm1jcC5qc29uJywgbWNwU2VjdGlvbiwgYm91bmRhcnlVcmkpO1xuXHRjb25zdCBza2lsbERpcnMgPSByZXNvbHZlUGx1Z2luQ29tcG9uZW50RGlycyhwbHVnaW5VcmksIGZvcm1hdENvbmZpZywgJ3NraWxscycsICdza2lsbHMnLCBza2lsbHNTZWN0aW9uLCBib3VuZGFyeVVyaSk7XG5cdGNvbnN0IGFnZW50RGlycyA9IHJlc29sdmVQbHVnaW5Db21wb25lbnREaXJzKHBsdWdpblVyaSwgZm9ybWF0Q29uZmlnLCAnYWdlbnRzJywgJ2FnZW50cycsIGFnZW50c1NlY3Rpb24sIGJvdW5kYXJ5VXJpKTtcblx0Y29uc3QgaW5zdHJ1Y3Rpb25EaXJzID0gcmVzb2x2ZVBsdWdpbkNvbXBvbmVudERpcnMocGx1Z2luVXJpLCBmb3JtYXRDb25maWcsICdydWxlcycsICdydWxlcycsIHJ1bGVzU2VjdGlvbiwgYm91bmRhcnlVcmkpO1xuXG5cdC8vIEhhbmRsZSBlbWJlZGRlZCBNQ1Agc2VydmVycyBpbiBtYW5pZmVzdFxuXHRsZXQgZW1iZWRkZWRNY3A6IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10gPSBbXTtcblx0aWYgKG1jcFNlY3Rpb24gJiYgdHlwZW9mIG1jcFNlY3Rpb24gPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KG1jcFNlY3Rpb24pICYmICEoaGFzS2V5KG1jcFNlY3Rpb24sIHsgcGF0aHM6IHRydWUgfSkpKSB7XG5cdFx0ZW1iZWRkZWRNY3AgPSBwYXJzZU1jcFNlcnZlckRlZmluaXRpb25NYXAoXG5cdFx0XHRqb2luUGF0aChwbHVnaW5VcmksIGZvcm1hdENvbmZpZy5tYW5pZmVzdFBhdGgpLFxuXHRcdFx0eyBtY3BTZXJ2ZXJzOiBtY3BTZWN0aW9uIH0sXG5cdFx0XHRwbHVnaW5VcmkuZnNQYXRoLFxuXHRcdFx0Zm9ybWF0Q29uZmlnLFxuXHRcdCk7XG5cdH1cblxuXHQvLyBIYW5kbGUgZW1iZWRkZWQgaG9va3MgaW4gbWFuaWZlc3Rcblx0bGV0IGVtYmVkZGVkSG9va3M6IElQYXJzZWRIb29rR3JvdXBbXSA9IFtdO1xuXHRpZiAoaG9va3NTZWN0aW9uICYmIHR5cGVvZiBob29rc1NlY3Rpb24gPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KGhvb2tzU2VjdGlvbikgJiYgIShoYXNLZXkoaG9va3NTZWN0aW9uLCB7IHBhdGhzOiB0cnVlIH0pKSkge1xuXHRcdGNvbnN0IG1hbmlmZXN0VXJpID0gam9pblBhdGgocGx1Z2luVXJpLCBmb3JtYXRDb25maWcubWFuaWZlc3RQYXRoKTtcblx0XHRlbWJlZGRlZEhvb2tzID0gZm9ybWF0Q29uZmlnLnBhcnNlSG9va3MobWFuaWZlc3RVcmksIGhvb2tzU2VjdGlvbiwgcGx1Z2luVXJpLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdH1cblxuXHRjb25zdCBbaG9va3MsIG1jcFNlcnZlcnMsIHNraWxscywgYWdlbnRzLCBpbnN0cnVjdGlvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdGVtYmVkZGVkSG9va3MubGVuZ3RoID4gMFxuXHRcdFx0PyBQcm9taXNlLnJlc29sdmUoZW1iZWRkZWRIb29rcylcblx0XHRcdDogcmVhZEhvb2tzKHBsdWdpblVyaSwgaG9va0RpcnMsIGZvcm1hdENvbmZpZywgZmlsZVNlcnZpY2UsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKSxcblx0XHRlbWJlZGRlZE1jcC5sZW5ndGggPiAwXG5cdFx0XHQ/IFByb21pc2UucmVzb2x2ZShlbWJlZGRlZE1jcClcblx0XHRcdDogcmVhZFBsdWdpbk1jcFNlcnZlcnMocGx1Z2luVXJpLCBtY3BEaXJzLCBmb3JtYXRDb25maWcsIGZpbGVTZXJ2aWNlKSxcblx0XHRyZWFkUGx1Z2luU2tpbGxzKHBsdWdpblVyaSwgc2tpbGxEaXJzLCBmb3JtYXRDb25maWcsIGZpbGVTZXJ2aWNlKSxcblx0XHRyZWFkQWdlbnRDb21wb25lbnRzKGFnZW50RGlycywgZmlsZVNlcnZpY2UsIGZvcm1hdENvbmZpZy5mb3JtYXQgPT09IFBsdWdpbkZvcm1hdC5BZ2VudFBsdWdpbiA/IHsgY29udGFpbm1lbnRSb290OiBwbHVnaW5VcmkgfSA6IHVuZGVmaW5lZCksXG5cdFx0cmVhZEluc3RydWN0aW9uQ29tcG9uZW50cyhpbnN0cnVjdGlvbkRpcnMsIGZpbGVTZXJ2aWNlLCBmb3JtYXRDb25maWcuZm9ybWF0ID09PSBQbHVnaW5Gb3JtYXQuQWdlbnRQbHVnaW4gPyB7IGNvbnRhaW5tZW50Um9vdDogcGx1Z2luVXJpIH0gOiB1bmRlZmluZWQpLFxuXHRdKTtcblxuXHRyZXR1cm4ge1xuXHRcdGZvcm1hdDogZm9ybWF0Q29uZmlnLmZvcm1hdCxcblx0XHRob29rcyxcblx0XHRtY3BTZXJ2ZXJzLFxuXHRcdHNraWxsczogc2tpbGxzLm1hcCh0b1BhcnNlZFNraWxsKSxcblx0XHRhZ2VudHM6IGFnZW50cy5tYXAodG9QYXJzZWRBZ2VudCksXG5cdFx0aW5zdHJ1Y3Rpb25zOiBpbnN0cnVjdGlvbnMubWFwKHRvUGFyc2VkUnVsZSksXG5cdH07XG59XG5cbi8qKiBQYWlycyBhbiBhZ2VudCB7QGxpbmsgSUFnZW50UGx1Z2luUmVzb3VyY2V9IHdpdGggaXRzIHByb3RvY29sLWxldmVsIHtAbGluayBBZ2VudEN1c3RvbWl6YXRpb259LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvUGFyc2VkQWdlbnQocmVzb3VyY2U6IElBZ2VudFBsdWdpblJlc291cmNlKTogSVBhcnNlZEFnZW50IHtcblx0cmV0dXJuIHsgLi4ucmVzb3VyY2UsIGN1c3RvbWl6YXRpb246IG1ha2VBZ2VudEN1c3RvbWl6YXRpb24ocmVzb3VyY2UpIH07XG59XG5cbi8qKiBQYWlycyBhIHNraWxsIHtAbGluayBJTmFtZWRQbHVnaW5SZXNvdXJjZX0gd2l0aCBpdHMgcHJvdG9jb2wtbGV2ZWwge0BsaW5rIFNraWxsQ3VzdG9taXphdGlvbn0uICovXG5leHBvcnQgZnVuY3Rpb24gdG9QYXJzZWRTa2lsbChyZXNvdXJjZTogSU5hbWVkUGx1Z2luUmVzb3VyY2UpOiBJUGFyc2VkU2tpbGwge1xuXHRyZXR1cm4geyAuLi5yZXNvdXJjZSwgY3VzdG9taXphdGlvbjogbWFrZVNraWxsQ3VzdG9taXphdGlvbihyZXNvdXJjZSkgfTtcbn1cblxuZnVuY3Rpb24gdG9QYXJzZWRSdWxlKHJlc291cmNlOiBJTmFtZWRQbHVnaW5SZXNvdXJjZSk6IElQYXJzZWRSdWxlIHtcblx0cmV0dXJuIHsgLi4ucmVzb3VyY2UsIGN1c3RvbWl6YXRpb246IG1ha2VSdWxlQ3VzdG9taXphdGlvbihyZXNvdXJjZSkgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxrQkFBa0I7QUFDcEMsU0FBUyxnQkFBZ0IsVUFBVSxvQkFBb0I7QUFDdkQsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLFNBQVMsaUJBQWlCLFVBQVUsZUFBZSxXQUFXLGFBQWEsZUFBZTtBQUM3RyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGNBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUVwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUErRixxQkFBcUI7QUFDcEgsU0FBUyxtQkFBbUIsdUJBQXNKO0FBQ2xMLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0JBQStCO0FBMEJqQyxJQUFVO0FBQUEsQ0FBVixDQUFVQSx3QkFBVjtBQUNDLFdBQVMsU0FBUyxHQUFtQyxHQUE0QztBQUN2RyxRQUFJLE1BQU0sR0FBRztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEVBQUUsWUFBWSxFQUFFLFdBQ25CLEVBQUUsWUFBWSxFQUFFLFdBQ2hCLEVBQUUsVUFBVSxFQUFFLFNBQ2QsRUFBRSxRQUFRLEVBQUUsT0FDWixZQUFZLEVBQUUsS0FBSyxFQUFFLEdBQUcsS0FDeEIsYUFBYSxFQUFFLEtBQUssRUFBRSxHQUFHLEtBQ3pCLEVBQUUsWUFBWSxFQUFFLFdBQ2hCLFlBQVksRUFBRSxXQUFXLEVBQUUsU0FBUztBQUFBLEVBQ3pDO0FBZk8sRUFBQUEsb0JBQVM7QUFBQSxHQURBO0FBNkZWLElBQVcsZUFBWCxr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
