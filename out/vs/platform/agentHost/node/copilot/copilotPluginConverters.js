import { spawn } from "child_process";
import { Schemas } from "../../../../base/common/network.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { parseFrontMatter } from "../../../../base/common/yaml.js";
import { McpServerType } from "../../../mcp/common/mcpPlatformTypes.js";
import { dirname } from "../../../../base/common/path.js";
function toSdkMcpServers(defs) {
  const result = {};
  for (const def of defs) {
    result[def.name] = toSdkMcpServer(def.name, def.configuration);
  }
  return result;
}
function toSdkMcpServersFromConfigMap(servers) {
  const result = {};
  for (const [name, config] of Object.entries(servers)) {
    if (isSupportedMcpServerConfiguration(config)) {
      result[name] = toSdkMcpServer(name, config);
    }
  }
  return result;
}
function isSupportedMcpServerConfiguration(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value;
  if (candidate.type === McpServerType.LOCAL) {
    return typeof candidate.command === "string";
  }
  if (candidate.type === McpServerType.REMOTE) {
    return typeof candidate.url === "string";
  }
  return false;
}
function toSdkMcpServer(_name, config) {
  if (config.type === McpServerType.LOCAL) {
    return {
      type: "local",
      command: config.command,
      args: config.args ? [...config.args] : [],
      tools: ["*"],
      ...config.env && { env: toStringEnv(config.env) },
      ...config.cwd && { cwd: config.cwd }
    };
  }
  return {
    type: "http",
    url: config.url,
    tools: ["*"],
    ...config.headers && { headers: { ...config.headers } }
  };
}
function toStringEnv(env) {
  const result = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}
async function toSdkCustomAgents(agents, fileService) {
  const configs = [];
  for (const agent of agents) {
    try {
      const content = await fileService.readFile(agent.uri);
      const raw = content.value.toString();
      const md = parseFrontMatter(raw);
      if (!md) {
        configs.push({
          name: agent.name,
          prompt: raw
        });
      } else {
        const name = md.getStringValue("name")?.trim() || agent.name;
        const description = md.getStringValue("description");
        const tools = md.getStringArrayValue("tools");
        const skills = md.getStringArrayValue("skills");
        let infer = md.getBooleanValue("infer");
        const disableModelInvocation = md.getBooleanValue("disable-model-invocation");
        if (infer === void 0 && disableModelInvocation === true) {
          infer = false;
        }
        const prompt = md.body ?? raw;
        let model = md.getStringValue("model") ?? void 0;
        const models = md.getStringArrayValue("model") ?? void 0;
        if (!model && models && Array.isArray(models) && models.length > 0) {
          model = models[0];
        }
        configs.push({
          name,
          ...description ? { description } : {},
          ...model ? { model } : {},
          tools: tools && tools.length > 0 ? tools : null,
          ...skills !== void 0 ? { skills } : {},
          ...infer !== void 0 ? { infer } : {},
          prompt
        });
      }
    } catch {
    }
  }
  return configs;
}
async function toSdkSessionCustomAgents(plugins, resolvedAgentName, fileService) {
  const pluginsWithoutDirs = plugins.filter((p) => !p.pluginDir || p.pluginDir.scheme !== Schemas.file);
  const customAgents = await toSdkCustomAgents(pluginsWithoutDirs.flatMap((p) => p.agents), fileService);
  if (resolvedAgentName && !customAgents.some((agent) => agent.name === resolvedAgentName)) {
    const selectedAgents = plugins.flatMap((p) => p.agents).filter((agent) => agent.name === resolvedAgentName);
    for (const config of await toSdkCustomAgents(selectedAgents, fileService)) {
      if (!customAgents.some((agent) => agent.name === config.name)) {
        customAgents.push(config);
      }
    }
  }
  return customAgents;
}
function toAgentCustomizations(agents) {
  return agents.map((a) => a.customization);
}
function toChildCustomizations(plugins) {
  const byId = /* @__PURE__ */ new Map();
  const add = (c) => {
    if (!byId.has(c.id)) {
      byId.set(c.id, c);
    }
  };
  for (const plugin of plugins) {
    for (const a of plugin.agents) {
      add(a.customization);
    }
    for (const s of plugin.skills) {
      add(s.customization);
    }
    for (const r of plugin.instructions) {
      add(r.customization);
    }
    for (const h of plugin.hooks) {
      add(h.customization);
    }
    for (const m of plugin.mcpServers) {
      add(m.customization);
    }
  }
  return [...byId.values()];
}
function toSdkSkillDirectories(skills) {
  return toSdkResourceDirectories(skills);
}
function toSdkInstructionDirectories(instructions) {
  return toSdkResourceDirectories(instructions);
}
function toSdkResourceDirectories(resources) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const resource of resources) {
    const dir = dirname(resource.uri.fsPath);
    if (!seen.has(dir)) {
      seen.add(dir);
      result.push(dir);
    }
  }
  return result;
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
function executeHookCommand(hook, stdin) {
  const command = resolveEffectiveCommand(hook, OS);
  if (!command) {
    return Promise.resolve("");
  }
  const timeout = (hook.timeout ?? 30) * 1e3;
  const cwd = hook.cwd?.fsPath;
  return new Promise((resolve, reject) => {
    const isWindows = OS === OperatingSystem.Windows;
    const shell = isWindows ? "cmd.exe" : "/bin/sh";
    const shellArgs = isWindows ? ["/c", command] : ["-c", command];
    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, ...hook.env },
      stdio: ["pipe", "pipe", "pipe"],
      timeout
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Hook command exited with code ${code}: ${stderr || stdout}`));
      }
    });
  });
}
async function runHookCommands(commands, input) {
  if (!commands) {
    return void 0;
  }
  const stdin = JSON.stringify(input);
  for (const cmd of commands) {
    try {
      const output = await executeHookCommand(cmd, stdin);
      if (output.trim()) {
        try {
          const parsed = JSON.parse(output);
          if (parsed && typeof parsed === "object") {
            return parsed;
          }
        } catch {
        }
      }
    } catch {
    }
  }
  return void 0;
}
const HOOK_TYPE_TO_SDK_KEY = {
  "PreToolUse": "onPreToolUse",
  "PostToolUse": "onPostToolUse",
  "UserPromptSubmit": "onUserPromptSubmitted",
  "SessionStart": "onSessionStart",
  "SessionEnd": "onSessionEnd",
  "ErrorOccurred": "onErrorOccurred"
};
function toSdkHooks(hookGroups, editTrackingHooks) {
  const commandsByKey = /* @__PURE__ */ new Map();
  for (const group of hookGroups) {
    const sdkKey = HOOK_TYPE_TO_SDK_KEY[group.type];
    if (!sdkKey) {
      continue;
    }
    const existing = commandsByKey.get(sdkKey) ?? [];
    existing.push(...group.commands);
    commandsByKey.set(sdkKey, existing);
  }
  const hooks = {};
  const preToolCommands = commandsByKey.get("onPreToolUse");
  if (preToolCommands?.length || editTrackingHooks) {
    hooks.onPreToolUse = async (input) => {
      await editTrackingHooks?.onPreToolUse(input);
      return runHookCommands(preToolCommands, input);
    };
  }
  const postToolCommands = commandsByKey.get("onPostToolUse");
  if (postToolCommands?.length || editTrackingHooks) {
    hooks.onPostToolUse = async (input) => {
      await editTrackingHooks?.onPostToolUse(input);
      return runHookCommands(postToolCommands, input);
    };
  }
  const promptCommands = commandsByKey.get("onUserPromptSubmitted");
  if (promptCommands?.length || editTrackingHooks?.onUserPromptSubmitted) {
    hooks.onUserPromptSubmitted = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of promptCommands ?? []) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
      return editTrackingHooks?.onUserPromptSubmitted?.();
    };
  }
  const startCommands = commandsByKey.get("onSessionStart");
  if (startCommands?.length) {
    hooks.onSessionStart = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of startCommands) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
    };
  }
  const endCommands = commandsByKey.get("onSessionEnd");
  if (endCommands?.length) {
    hooks.onSessionEnd = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of endCommands) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
    };
  }
  const errorCommands = commandsByKey.get("onErrorOccurred");
  if (errorCommands?.length) {
    hooks.onErrorOccurred = async (input) => {
      const stdin = JSON.stringify(input);
      for (const cmd of errorCommands) {
        try {
          await executeHookCommand(cmd, stdin);
        } catch {
        }
      }
    };
  }
  return hooks;
}
function parsedPluginsEqual(a, b) {
  const serialize = (plugins) => {
    return JSON.stringify(plugins.map((p) => ({
      format: p.format,
      hooks: p.hooks.map((h) => ({ type: h.type, commands: h.commands.map((c) => ({ command: c.command, windows: c.windows, linux: c.linux, osx: c.osx, cwd: c.cwd?.toString(), env: c.env, timeout: c.timeout })) })),
      mcpServers: p.mcpServers.map((m) => ({ name: m.name, configuration: m.configuration })),
      skills: p.skills.map((s) => ({ uri: s.uri.toString(), name: s.name })),
      agents: p.agents.map((a2) => ({ uri: a2.uri.toString(), name: a2.name })),
      instructions: p.instructions.map((i) => ({ uri: i.uri.toString(), name: i.name }))
    })));
  };
  return serialize(a) === serialize(b);
}
export {
  parsedPluginsEqual,
  toAgentCustomizations,
  toChildCustomizations,
  toSdkCustomAgents,
  toSdkHooks,
  toSdkInstructionDirectories,
  toSdkMcpServers,
  toSdkMcpServersFromConfigMap,
  toSdkSessionCustomAgents,
  toSdkSkillDirectories
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxjb3BpbG90UGx1Z2luQ29udmVydGVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHNwYXduIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgdHlwZSB7IEN1c3RvbUFnZW50Q29uZmlnLCBNQ1BTZXJ2ZXJDb25maWcsIFNlc3Npb25Ib29rcyB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBwYXJzZUZyb250TWF0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24veWFtbC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSwgdHlwZSBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgdHlwZSB7IElNY3BTZXJ2ZXJEZWZpbml0aW9uLCBJTmFtZWRQbHVnaW5SZXNvdXJjZSwgSVBhcnNlZEFnZW50LCBJUGFyc2VkSG9va0NvbW1hbmQsIElQYXJzZWRIb29rR3JvdXAsIElQYXJzZWRQbHVnaW4gfSBmcm9tICcuLi8uLi8uLi9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgdHlwZSBBZ2VudEN1c3RvbWl6YXRpb24sIHR5cGUgQ2hpbGRDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcblxudHlwZSBQcmVUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUHJlVG9vbFVzZSddPj5bMF07XG50eXBlIFBvc3RUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUG9zdFRvb2xVc2UnXT4+WzBdO1xudHlwZSBVc2VyUHJvbXB0U3VibWl0dGVkSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uVXNlclByb21wdFN1Ym1pdHRlZCddPj5bMF07XG50eXBlIFNlc3Npb25TdGFydEhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvblNlc3Npb25TdGFydCddPj5bMF07XG50eXBlIFNlc3Npb25FbmRIb29rSW5wdXQgPSBQYXJhbWV0ZXJzPE5vbk51bGxhYmxlPFNlc3Npb25Ib29rc1snb25TZXNzaW9uRW5kJ10+PlswXTtcbnR5cGUgRXJyb3JPY2N1cnJlZEhvb2tJbnB1dCA9IFBhcmFtZXRlcnM8Tm9uTnVsbGFibGU8U2Vzc2lvbkhvb2tzWydvbkVycm9yT2NjdXJyZWQnXT4+WzBdO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIE1DUCBzZXJ2ZXJzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDb252ZXJ0cyBwYXJzZWQgTUNQIHNlcnZlciBkZWZpbml0aW9ucyBpbnRvIHRoZSBTREsncyBgbWNwU2VydmVyc2AgY29uZmlnLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9TZGtNY3BTZXJ2ZXJzKGRlZnM6IHJlYWRvbmx5IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10pOiBSZWNvcmQ8c3RyaW5nLCBNQ1BTZXJ2ZXJDb25maWc+IHtcblx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCBNQ1BTZXJ2ZXJDb25maWc+ID0ge307XG5cdGZvciAoY29uc3QgZGVmIG9mIGRlZnMpIHtcblx0XHRyZXN1bHRbZGVmLm5hbWVdID0gdG9TZGtNY3BTZXJ2ZXIoZGVmLm5hbWUsIGRlZi5jb25maWd1cmF0aW9uKTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIENvbnZlcnRzIHJvb3QgTUNQIHNlcnZlciBjb25maWcgbWFwcyBpbnRvIHRoZSBTREsncyBgbWNwU2VydmVyc2AgY29uZmlnLlxuICpcbiAqIFRoZSBtYXAgb3JpZ2luYXRlcyBmcm9tIHVzZXItY29udHJvbGxlZCByb290IGNvbmZpZywgd2hlcmUgdGhlIHNjaGVtYSBjYW5ub3RcbiAqIGV4cHJlc3MgcGVyLWVudHJ5IHZhbGlkYXRpb24gKG5vIGBhZGRpdGlvbmFsUHJvcGVydGllc2ApLiBFbnRyaWVzIGFyZVxuICogdGhlcmVmb3JlIHRyZWF0ZWQgYXMgYHVua25vd25gIGFuZCBzaWxlbnRseSBza2lwcGVkIHVubGVzcyB0aGV5IG1hdGNoIG9uZSBvZlxuICogdGhlIHR3byBzdXBwb3J0ZWQgc2hhcGVzIChgc3RkaW9gIHdpdGggYSBgY29tbWFuZGAsIG9yIGBodHRwYCB3aXRoIGEgYHVybGApLFxuICogc28gYSBtYWxmb3JtZWQgZW50cnkgY2FuJ3Qgc3VyZmFjZSBhcyBgY29tbWFuZGAvYHVybDogdW5kZWZpbmVkYCBpbiB0aGUgU0RLXG4gKiBjb25maWcuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nka01jcFNlcnZlcnNGcm9tQ29uZmlnTWFwKHNlcnZlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogUmVjb3JkPHN0cmluZywgTUNQU2VydmVyQ29uZmlnPiB7XG5cdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgTUNQU2VydmVyQ29uZmlnPiA9IHt9O1xuXHRmb3IgKGNvbnN0IFtuYW1lLCBjb25maWddIG9mIE9iamVjdC5lbnRyaWVzKHNlcnZlcnMpKSB7XG5cdFx0aWYgKGlzU3VwcG9ydGVkTWNwU2VydmVyQ29uZmlndXJhdGlvbihjb25maWcpKSB7XG5cdFx0XHRyZXN1bHRbbmFtZV0gPSB0b1Nka01jcFNlcnZlcihuYW1lLCBjb25maWcpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIE5hcnJvd3MgYW4gdW50cnVzdGVkIHZhbHVlIHRvIGEgc3VwcG9ydGVkIHtAbGluayBJTWNwU2VydmVyQ29uZmlndXJhdGlvbn06XG4gKiBhIGBzdGRpb2Agc2VydmVyIHdpdGggYSBzdHJpbmcgYGNvbW1hbmRgLCBvciBhbiBgaHR0cGAgc2VydmVyIHdpdGggYSBzdHJpbmdcbiAqIGB1cmxgLlxuICovXG5mdW5jdGlvbiBpc1N1cHBvcnRlZE1jcFNlcnZlckNvbmZpZ3VyYXRpb24odmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB7XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0Jykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBjYW5kaWRhdGUgPSB2YWx1ZSBhcyB7IHR5cGU/OiB1bmtub3duOyBjb21tYW5kPzogdW5rbm93bjsgdXJsPzogdW5rbm93biB9O1xuXHRpZiAoY2FuZGlkYXRlLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRyZXR1cm4gdHlwZW9mIGNhbmRpZGF0ZS5jb21tYW5kID09PSAnc3RyaW5nJztcblx0fVxuXHRpZiAoY2FuZGlkYXRlLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuUkVNT1RFKSB7XG5cdFx0cmV0dXJuIHR5cGVvZiBjYW5kaWRhdGUudXJsID09PSAnc3RyaW5nJztcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIHRvU2RrTWNwU2VydmVyKF9uYW1lOiBzdHJpbmcsIGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24pOiBNQ1BTZXJ2ZXJDb25maWcge1xuXHRpZiAoY29uZmlnLnR5cGUgPT09IE1jcFNlcnZlclR5cGUuTE9DQUwpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ2xvY2FsJyxcblx0XHRcdGNvbW1hbmQ6IGNvbmZpZy5jb21tYW5kLFxuXHRcdFx0YXJnczogY29uZmlnLmFyZ3MgPyBbLi4uY29uZmlnLmFyZ3NdIDogW10sXG5cdFx0XHR0b29sczogWycqJ10sXG5cdFx0XHQuLi4oY29uZmlnLmVudiAmJiB7IGVudjogdG9TdHJpbmdFbnYoY29uZmlnLmVudikgfSksXG5cdFx0XHQuLi4oY29uZmlnLmN3ZCAmJiB7IGN3ZDogY29uZmlnLmN3ZCB9KSxcblx0XHR9O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0dHlwZTogJ2h0dHAnLFxuXHRcdHVybDogY29uZmlnLnVybCxcblx0XHR0b29sczogWycqJ10sXG5cdFx0Li4uKGNvbmZpZy5oZWFkZXJzICYmIHsgaGVhZGVyczogeyAuLi5jb25maWcuaGVhZGVycyB9IH0pLFxuXHR9O1xufVxuXG4vKipcbiAqIEVuc3VyZXMgYWxsIGVudiB2YWx1ZXMgYXJlIHN0cmluZ3MgKHRoZSBTREsgcmVxdWlyZXMgYFJlY29yZDxzdHJpbmcsIHN0cmluZz5gKS5cbiAqL1xuZnVuY3Rpb24gdG9TdHJpbmdFbnYoZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBudWxsPik6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4ge1xuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoZW52KSkge1xuXHRcdGlmICh2YWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0cmVzdWx0W2tleV0gPSBTdHJpbmcodmFsdWUpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEN1c3RvbSBhZ2VudHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIENvbnZlcnRzIHBhcnNlZCBwbHVnaW4gYWdlbnRzIGludG8gdGhlIFNESydzIGBjdXN0b21BZ2VudHNgIGNvbmZpZy5cbiAqXG4gKiBFYWNoIGFnZW50IGZpbGUgaXMgcmVhZCBhbmQgKHdoZW4gcHJlc2VudCkgaXRzIFlBTUwgZnJvbnRtYXR0ZXIgaXMgcGFyc2VkOlxuICogIC0gYG5hbWVgIGZhbGxzIGJhY2sgdG8gdGhlIGFnZW50J3MgcmVzb3VyY2UgbmFtZSAoZmlsZW5hbWUgc3RlbSkuXG4gKiAgLSBgZGVzY3JpcHRpb25gIGlzIGZvcndhcmRlZCB2ZXJiYXRpbS5cbiAqICAtIGB0b29sc2AgaXMgZm9yd2FyZGVkIGFzIHRoZSBTREsncyBhbGxvdy1saXN0OyBhbiBlbXB0eSAvIG1pc3NpbmcgYXJyYXlcbiAqICAgIGJlY29tZXMgYG51bGxgIHNvIHRoZSBTREsgZ3JhbnRzIHRoZSBhZ2VudCBhY2Nlc3MgdG8gYWxsIHRvb2xzLlxuICogIC0gYHByb21wdGAgaXMgdGhlIG1hcmtkb3duIGJvZHkgdGhhdCBmb2xsb3dzIHRoZSBmcm9udG1hdHRlciAob3IgdGhlXG4gKiAgICBmdWxsIGZpbGUgY29udGVudCB3aGVuIHRoZXJlIGlzIG5vIGZyb250bWF0dGVyKS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50czogcmVhZG9ubHkgSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSwgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSk6IFByb21pc2U8Q3VzdG9tQWdlbnRDb25maWdbXT4ge1xuXHRjb25zdCBjb25maWdzOiBDdXN0b21BZ2VudENvbmZpZ1tdID0gW107XG5cdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShhZ2VudC51cmkpO1xuXHRcdFx0Y29uc3QgcmF3ID0gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgbWQgPSBwYXJzZUZyb250TWF0dGVyKHJhdyk7XG5cdFx0XHRpZiAoIW1kKSB7XG5cdFx0XHRcdGNvbmZpZ3MucHVzaCh7XG5cdFx0XHRcdFx0bmFtZTogYWdlbnQubmFtZSxcblx0XHRcdFx0XHRwcm9tcHQ6IHJhdyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBNYXRjaCBgcGFyc2VBZ2VudEZpbGVgJ3MgbmFtZSBkZXJpdmF0aW9uICh0cmltICsgZmFsc3kgZmFsbGJhY2spIHNvXG5cdFx0XHRcdC8vIHRoZSBTREsgY29uZmlnIG5hbWUgZXF1YWxzIHRoZSBgcmVzb2x2ZWRBZ2VudE5hbWVgIHJlc29sdmVkIGZyb20gdGhlXG5cdFx0XHRcdC8vIHBhcnNlZCBwbHVnaW4gYWdlbnQ7IG90aGVyd2lzZSBhIHdoaXRlc3BhY2UtcGFkZGVkIGZyb250bWF0dGVyIGBuYW1lYFxuXHRcdFx0XHQvLyB3b3VsZCBtYWtlIHRoZSBTREsgcmVqZWN0IHRoZSBzZXNzaW9uLXN0YXJ0IGBhZ2VudDpgIGFzIG5vdCBmb3VuZC5cblx0XHRcdFx0Y29uc3QgbmFtZSA9IG1kLmdldFN0cmluZ1ZhbHVlKCduYW1lJyk/LnRyaW0oKSB8fCBhZ2VudC5uYW1lO1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IG1kLmdldFN0cmluZ1ZhbHVlKCdkZXNjcmlwdGlvbicpO1xuXHRcdFx0XHRjb25zdCB0b29scyA9IG1kLmdldFN0cmluZ0FycmF5VmFsdWUoJ3Rvb2xzJyk7XG5cdFx0XHRcdGNvbnN0IHNraWxscyA9IG1kLmdldFN0cmluZ0FycmF5VmFsdWUoJ3NraWxscycpO1xuXHRcdFx0XHRsZXQgaW5mZXIgPSBtZC5nZXRCb29sZWFuVmFsdWUoJ2luZmVyJyk7XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVNb2RlbEludm9jYXRpb24gPSBtZC5nZXRCb29sZWFuVmFsdWUoJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbicpO1xuXHRcdFx0XHRpZiAoaW5mZXIgPT09IHVuZGVmaW5lZCAmJiBkaXNhYmxlTW9kZWxJbnZvY2F0aW9uID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0aW5mZXIgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwcm9tcHQgPSBtZC5ib2R5ID8/IHJhdztcblx0XHRcdFx0bGV0IG1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSBtZC5nZXRTdHJpbmdWYWx1ZSgnbW9kZWwnKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IG1vZGVscyA9IG1kLmdldFN0cmluZ0FycmF5VmFsdWUoJ21vZGVsJykgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIW1vZGVsICYmIG1vZGVscyAmJiBBcnJheS5pc0FycmF5KG1vZGVscykgJiYgbW9kZWxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRtb2RlbCA9IG1vZGVsc1swXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25maWdzLnB1c2goe1xuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0Li4uKGRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihtb2RlbCA/IHsgbW9kZWwgfSA6IHt9KSxcblx0XHRcdFx0XHR0b29sczogdG9vbHMgJiYgdG9vbHMubGVuZ3RoID4gMCA/IHRvb2xzIDogbnVsbCxcblx0XHRcdFx0XHQuLi4oc2tpbGxzICE9PSB1bmRlZmluZWQgPyB7IHNraWxscyB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihpbmZlciAhPT0gdW5kZWZpbmVkID8geyBpbmZlciB9IDoge30pLFxuXHRcdFx0XHRcdHByb21wdCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBTa2lwIGFnZW50cyB3aG9zZSBmaWxlIGNhbm5vdCBiZSByZWFkXG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb25maWdzO1xufVxuXG4vKiogQSBwbHVnaW4ncyBhZ2VudHMgdG9nZXRoZXIgd2l0aCBpdHMgb24tZGlzayBsb2NhdGlvbiAoaWYgYW55KS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBsdWdpbkFnZW50c0ZvclNkayB7XG5cdHJlYWRvbmx5IHBsdWdpbkRpcj86IFVSSTtcblx0cmVhZG9ubHkgYWdlbnRzOiByZWFkb25seSBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgU0RLJ3MgYGN1c3RvbUFnZW50c2AgY29uZmlnIGZvciBhIHNlc3Npb24uXG4gKlxuICogQWdlbnRzIGNvbnRyaWJ1dGVkIGJ5IHBsdWdpbnMgbWF0ZXJpYWxpemVkIGludG8gYW4gb24tZGlzayAoZmlsZS1zY2hlbWUpXG4gKiBkaXJlY3RvcnkgYXJlIG5vcm1hbGx5IGxlZnQgb3V0IG9mIGBjdXN0b21BZ2VudHNgIGFuZCBkaXNjb3ZlcmVkIGJ5IHRoZSBTREtcbiAqIHRocm91Z2ggYHBsdWdpbkRpcmVjdG9yaWVzYCBpbnN0ZWFkLCB0byBhdm9pZCBkdXBsaWNhdGVzLiBIb3dldmVyLCB0aGUgU0RLXG4gKiB2YWxpZGF0ZXMgdGhlIHNlc3Npb24tc3RhcnQgYGFnZW50OmAgb3B0aW9uIGFnYWluc3QgYGN1c3RvbUFnZW50c2AgKmJ5IG5hbWVcbiAqIG9ubHkqIFx1MjAxNCBpdCBkb2VzIE5PVCBjb25zdWx0IGBwbHVnaW5EaXJlY3Rvcmllc2AuIFNvIGEgc2VsZWN0ZWQgcGx1Z2luIG9yXG4gKiBleHRlbnNpb24gYWdlbnQgKGUuZy4gb25lIGNob3NlbiBpbiB0aGUgYWdlbnQgcGlja2VyKSB3b3VsZCBvdGhlcndpc2UgZmFpbFxuICogd2l0aCBcIkN1c3RvbSBhZ2VudCAnPG5hbWU+JyBub3QgZm91bmRcIi4gVGhpcyBmb3JjZXMgdGhlIHJlc29sdmVkIHNlbGVjdGlvblxuICogaW50byBgY3VzdG9tQWdlbnRzYCBzbyBpdCBjYW4gYmUgYWN0aXZhdGVkLCB3aGlsZSBldmVyeSBvdGhlciBmaWxlLWRpciBhZ2VudFxuICogY29udGludWVzIHRvIGxvYWQgdmlhIGBwbHVnaW5EaXJlY3Rvcmllc2AuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0b1Nka1Nlc3Npb25DdXN0b21BZ2VudHMoXG5cdHBsdWdpbnM6IHJlYWRvbmx5IElQbHVnaW5BZ2VudHNGb3JTZGtbXSxcblx0cmVzb2x2ZWRBZ2VudE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcbik6IFByb21pc2U8Q3VzdG9tQWdlbnRDb25maWdbXT4ge1xuXHRjb25zdCBwbHVnaW5zV2l0aG91dERpcnMgPSBwbHVnaW5zLmZpbHRlcihwID0+ICFwLnBsdWdpbkRpciB8fCBwLnBsdWdpbkRpci5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSk7XG5cdGNvbnN0IGN1c3RvbUFnZW50cyA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKHBsdWdpbnNXaXRob3V0RGlycy5mbGF0TWFwKHAgPT4gcC5hZ2VudHMpLCBmaWxlU2VydmljZSk7XG5cdGlmIChyZXNvbHZlZEFnZW50TmFtZSAmJiAhY3VzdG9tQWdlbnRzLnNvbWUoYWdlbnQgPT4gYWdlbnQubmFtZSA9PT0gcmVzb2x2ZWRBZ2VudE5hbWUpKSB7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRBZ2VudHMgPSBwbHVnaW5zLmZsYXRNYXAocCA9PiBwLmFnZW50cykuZmlsdGVyKGFnZW50ID0+IGFnZW50Lm5hbWUgPT09IHJlc29sdmVkQWdlbnROYW1lKTtcblx0XHRmb3IgKGNvbnN0IGNvbmZpZyBvZiBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhzZWxlY3RlZEFnZW50cywgZmlsZVNlcnZpY2UpKSB7XG5cdFx0XHRpZiAoIWN1c3RvbUFnZW50cy5zb21lKGFnZW50ID0+IGFnZW50Lm5hbWUgPT09IGNvbmZpZy5uYW1lKSkge1xuXHRcdFx0XHRjdXN0b21BZ2VudHMucHVzaChjb25maWcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gY3VzdG9tQWdlbnRzO1xufVxuXG4vKipcbiAqIFByb2plY3RzIHBhcnNlZCBwbHVnaW4gYWdlbnRzIGludG8gdGhlaXIgcHJvdG9jb2wtbGV2ZWxcbiAqIHtAbGluayBBZ2VudEN1c3RvbWl6YXRpb259IHNoYXBlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9BZ2VudEN1c3RvbWl6YXRpb25zKGFnZW50czogcmVhZG9ubHkgSVBhcnNlZEFnZW50W10pOiBBZ2VudEN1c3RvbWl6YXRpb25bXSB7XG5cdHJldHVybiBhZ2VudHMubWFwKGEgPT4gYS5jdXN0b21pemF0aW9uKTtcbn1cblxuLyoqXG4gKiBDb2xsZWN0cyBldmVyeSBjaGlsZCBjdXN0b21pemF0aW9uIChhZ2VudCwgc2tpbGwsIHJ1bGUsIGhvb2ssIE1DUFxuICogc2VydmVyKSBwcm9kdWNlZCBieSBhIHBhcnNlZCBwbHVnaW4sIGRlZHVwZWQgYnkgaWQuIFRoaXMgaXMgdGhlIHNpbmdsZVxuICogc291cmNlIG9mIHRydXRoIGZvciBwb3B1bGF0aW5nIGEgY29udGFpbmVyIGN1c3RvbWl6YXRpb24ncyBgY2hpbGRyZW5gXG4gKiBhcnJheSBcdTIwMTQgZXZlcnkgcHJvamVjdG9yIHRoYXQgcHJvZHVjZWQgYW4gU0RLIGNvbmZpZyBhYm92ZSBkZXJpdmVzIGl0c1xuICogbWF0Y2hpbmcgcHJvdG9jb2wgY2hpbGQgZnJvbSB0aGUgc2FtZSBwYXJzZWQgcHJpbWl0aXZlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9DaGlsZEN1c3RvbWl6YXRpb25zKHBsdWdpbnM6IHJlYWRvbmx5IElQYXJzZWRQbHVnaW5bXSk6IENoaWxkQ3VzdG9taXphdGlvbltdIHtcblx0Y29uc3QgYnlJZCA9IG5ldyBNYXA8c3RyaW5nLCBDaGlsZEN1c3RvbWl6YXRpb24+KCk7XG5cdGNvbnN0IGFkZCA9IChjOiBDaGlsZEN1c3RvbWl6YXRpb24pID0+IHtcblx0XHRpZiAoIWJ5SWQuaGFzKGMuaWQpKSB7XG5cdFx0XHRieUlkLnNldChjLmlkLCBjKTtcblx0XHR9XG5cdH07XG5cdGZvciAoY29uc3QgcGx1Z2luIG9mIHBsdWdpbnMpIHtcblx0XHRmb3IgKGNvbnN0IGEgb2YgcGx1Z2luLmFnZW50cykgeyBhZGQoYS5jdXN0b21pemF0aW9uKTsgfVxuXHRcdGZvciAoY29uc3QgcyBvZiBwbHVnaW4uc2tpbGxzKSB7IGFkZChzLmN1c3RvbWl6YXRpb24pOyB9XG5cdFx0Zm9yIChjb25zdCByIG9mIHBsdWdpbi5pbnN0cnVjdGlvbnMpIHsgYWRkKHIuY3VzdG9taXphdGlvbik7IH1cblx0XHRmb3IgKGNvbnN0IGggb2YgcGx1Z2luLmhvb2tzKSB7IGFkZChoLmN1c3RvbWl6YXRpb24pOyB9XG5cdFx0Zm9yIChjb25zdCBtIG9mIHBsdWdpbi5tY3BTZXJ2ZXJzKSB7IGFkZChtLmN1c3RvbWl6YXRpb24pOyB9XG5cdH1cblx0cmV0dXJuIFsuLi5ieUlkLnZhbHVlcygpXTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTa2lsbCBkaXJlY3Rvcmllc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQ29udmVydHMgcGFyc2VkIHBsdWdpbiBza2lsbHMgaW50byB0aGUgU0RLJ3MgYHNraWxsRGlyZWN0b3JpZXNgIGNvbmZpZy5cbiAqIFRoZSBTREsgZXhwZWN0cyBkaXJlY3RvcnkgcGF0aHM7IHdlIGV4dHJhY3QgdGhlIHBhcmVudCBkaXJlY3Rvcnkgb2YgZWFjaCBTS0lMTC5tZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvU2RrU2tpbGxEaXJlY3Rvcmllcyhza2lsbHM6IHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiB0b1Nka1Jlc291cmNlRGlyZWN0b3JpZXMoc2tpbGxzKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBwYXJzZWQgcGx1Z2luIGluc3RydWN0aW9ucyBpbnRvIHRoZSBTREsnc1xuICogYGluc3RydWN0aW9uRGlyZWN0b3JpZXNgIGNvbmZpZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRvU2RrSW5zdHJ1Y3Rpb25EaXJlY3RvcmllcyhpbnN0cnVjdGlvbnM6IHJlYWRvbmx5IElOYW1lZFBsdWdpblJlc291cmNlW10pOiBzdHJpbmdbXSB7XG5cdHJldHVybiB0b1Nka1Jlc291cmNlRGlyZWN0b3JpZXMoaW5zdHJ1Y3Rpb25zKTtcbn1cblxuZnVuY3Rpb24gdG9TZGtSZXNvdXJjZURpcmVjdG9yaWVzKHJlc291cmNlczogcmVhZG9ubHkgSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0Y29uc3QgZGlyID0gZGlybmFtZShyZXNvdXJjZS51cmkuZnNQYXRoKTtcblx0XHRpZiAoIXNlZW4uaGFzKGRpcikpIHtcblx0XHRcdHNlZW4uYWRkKGRpcik7XG5cdFx0XHRyZXN1bHQucHVzaChkaXIpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEhvb2tzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBSZXNvbHZlcyB0aGUgZWZmZWN0aXZlIGNvbW1hbmQgZm9yIHRoZSBjdXJyZW50IHBsYXRmb3JtIGZyb20gYSBwYXJzZWQgaG9vayBjb21tYW5kLlxuICovXG5mdW5jdGlvbiByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rOiBJUGFyc2VkSG9va0NvbW1hbmQsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzICYmIGhvb2sud2luZG93cykge1xuXHRcdHJldHVybiBob29rLndpbmRvd3M7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2ggJiYgaG9vay5vc3gpIHtcblx0XHRyZXR1cm4gaG9vay5vc3g7XG5cdH0gZWxzZSBpZiAob3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCAmJiBob29rLmxpbnV4KSB7XG5cdFx0cmV0dXJuIGhvb2subGludXg7XG5cdH1cblx0cmV0dXJuIGhvb2suY29tbWFuZDtcbn1cblxuLyoqXG4gKiBFeGVjdXRlcyBhIGhvb2sgY29tbWFuZCBhcyBhIHNoZWxsIHByb2Nlc3MuIFJldHVybnMgdGhlIHN0ZG91dCBvbiBzdWNjZXNzLFxuICogb3IgdGhyb3dzIG9uIG5vbi16ZXJvIGV4aXQgY29kZSBvciB0aW1lb3V0LlxuICovXG5mdW5jdGlvbiBleGVjdXRlSG9va0NvbW1hbmQoaG9vazogSVBhcnNlZEhvb2tDb21tYW5kLCBzdGRpbj86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdGNvbnN0IGNvbW1hbmQgPSByZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPUyk7XG5cdGlmICghY29tbWFuZCkge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoJycpO1xuXHR9XG5cblx0Y29uc3QgdGltZW91dCA9IChob29rLnRpbWVvdXQgPz8gMzApICogMTAwMDtcblx0Y29uc3QgY3dkID0gaG9vay5jd2Q/LmZzUGF0aDtcblxuXHRyZXR1cm4gbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgaXNXaW5kb3dzID0gT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzO1xuXHRcdGNvbnN0IHNoZWxsID0gaXNXaW5kb3dzID8gJ2NtZC5leGUnIDogJy9iaW4vc2gnO1xuXHRcdGNvbnN0IHNoZWxsQXJncyA9IGlzV2luZG93cyA/IFsnL2MnLCBjb21tYW5kXSA6IFsnLWMnLCBjb21tYW5kXTtcblxuXHRcdGNvbnN0IGNoaWxkID0gc3Bhd24oc2hlbGwsIHNoZWxsQXJncywge1xuXHRcdFx0Y3dkLFxuXHRcdFx0ZW52OiB7IC4uLnByb2Nlc3MuZW52LCAuLi5ob29rLmVudiB9LFxuXHRcdFx0c3RkaW86IFsncGlwZScsICdwaXBlJywgJ3BpcGUnXSxcblx0XHRcdHRpbWVvdXQsXG5cdFx0fSk7XG5cblx0XHRsZXQgc3Rkb3V0ID0gJyc7XG5cdFx0bGV0IHN0ZGVyciA9ICcnO1xuXG5cdFx0Y2hpbGQuc3Rkb3V0Lm9uKCdkYXRhJywgKGRhdGE6IEJ1ZmZlcikgPT4geyBzdGRvdXQgKz0gZGF0YS50b1N0cmluZygpOyB9KTtcblx0XHRjaGlsZC5zdGRlcnIub24oJ2RhdGEnLCAoZGF0YTogQnVmZmVyKSA9PiB7IHN0ZGVyciArPSBkYXRhLnRvU3RyaW5nKCk7IH0pO1xuXG5cdFx0aWYgKHN0ZGluKSB7XG5cdFx0XHRjaGlsZC5zdGRpbi53cml0ZShzdGRpbik7XG5cdFx0XHRjaGlsZC5zdGRpbi5lbmQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hpbGQuc3RkaW4uZW5kKCk7XG5cdFx0fVxuXG5cdFx0Y2hpbGQub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRjaGlsZC5vbignY2xvc2UnLCAoY29kZSkgPT4ge1xuXHRcdFx0aWYgKGNvZGUgPT09IDApIHtcblx0XHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihgSG9vayBjb21tYW5kIGV4aXRlZCB3aXRoIGNvZGUgJHtjb2RlfTogJHtzdGRlcnIgfHwgc3Rkb3V0fWApKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59XG5cbi8qKlxuICogUnVucyBhIGxpc3Qgb2YgaG9vayBjb21tYW5kcyBzZXF1ZW50aWFsbHksIHBhc3NpbmcgYGlucHV0YCBhcyBKU09OIHN0ZGluLlxuICogUmV0dXJucyB0aGUgcGFyc2VkIG91dHB1dCBvZiB0aGUgZmlyc3QgY29tbWFuZCB0aGF0IGVtaXRzIGEgdmFsaWQgSlNPTiBvYmplY3QsXG4gKiBvciBgdW5kZWZpbmVkYCBpZiBubyBjb21tYW5kIHByb2R1Y2VzIHBhcnNlYWJsZSBKU09OIG91dHB1dC5cbiAqIENvbW1hbmQgZmFpbHVyZXMgYXJlIHN3YWxsb3dlZCBcdTIwMTQgaG9va3MgYXJlIG5vbi1mYXRhbC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcnVuSG9va0NvbW1hbmRzKGNvbW1hbmRzOiByZWFkb25seSBJUGFyc2VkSG9va0NvbW1hbmRbXSB8IHVuZGVmaW5lZCwgaW5wdXQ6IHVua25vd24pOiBQcm9taXNlPG9iamVjdCB8IHVuZGVmaW5lZD4ge1xuXHRpZiAoIWNvbW1hbmRzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdGRpbiA9IEpTT04uc3RyaW5naWZ5KGlucHV0KTtcblx0Zm9yIChjb25zdCBjbWQgb2YgY29tbWFuZHMpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgZXhlY3V0ZUhvb2tDb21tYW5kKGNtZCwgc3RkaW4pO1xuXHRcdFx0aWYgKG91dHB1dC50cmltKCkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG91dHB1dCk7XG5cdFx0XHRcdFx0aWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIE5vbi1KU09OIG91dHB1dCBpcyBmaW5lIFx1MjAxNCBubyBtb2RpZmljYXRpb25cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gSG9vayBmYWlsdXJlcyBhcmUgbm9uLWZhdGFsXG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogTWFwcGluZyBmcm9tIGNhbm9uaWNhbCBob29rIHR5cGUgaWRlbnRpZmllcnMgdG8gU0RLIFNlc3Npb25Ib29rcyBoYW5kbGVyIGtleXMuXG4gKi9cbmNvbnN0IEhPT0tfVFlQRV9UT19TREtfS0VZOiBSZWNvcmQ8c3RyaW5nLCBrZXlvZiBTZXNzaW9uSG9va3M+ID0ge1xuXHQnUHJlVG9vbFVzZSc6ICdvblByZVRvb2xVc2UnLFxuXHQnUG9zdFRvb2xVc2UnOiAnb25Qb3N0VG9vbFVzZScsXG5cdCdVc2VyUHJvbXB0U3VibWl0JzogJ29uVXNlclByb21wdFN1Ym1pdHRlZCcsXG5cdCdTZXNzaW9uU3RhcnQnOiAnb25TZXNzaW9uU3RhcnQnLFxuXHQnU2Vzc2lvbkVuZCc6ICdvblNlc3Npb25FbmQnLFxuXHQnRXJyb3JPY2N1cnJlZCc6ICdvbkVycm9yT2NjdXJyZWQnLFxufTtcblxuLyoqXG4gKiBDb252ZXJ0cyBwYXJzZWQgcGx1Z2luIGhvb2tzIGludG8gU0RLIHtAbGluayBTZXNzaW9uSG9va3N9IGhhbmRsZXIgZnVuY3Rpb25zLlxuICpcbiAqIEVhY2ggaGFuZGxlciBleGVjdXRlcyB0aGUgaG9vaydzIHNoZWxsIGNvbW1hbmRzIHNlcXVlbnRpYWxseSB3aGVuIGludm9rZWQuXG4gKiBIb29rIHR5cGVzIHRoYXQgZG9uJ3QgbWFwIHRvIFNESyBoYW5kbGVyIGtleXMgYXJlIHNpbGVudGx5IGlnbm9yZWQuXG4gKlxuICogVGhlIG9wdGlvbmFsIGBlZGl0VHJhY2tpbmdIb29rc2AgcGFyYW1ldGVyIHByb3ZpZGVzIGludGVybmFsIGVkaXQtdHJhY2tpbmdcbiAqIGNhbGxiYWNrcyBmcm9tIHtAbGluayBDb3BpbG90QWdlbnRTZXNzaW9ufSB0aGF0IGFyZSBtZXJnZWQgd2l0aCBwbHVnaW4gaG9va3MuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b1Nka0hvb2tzKFxuXHRob29rR3JvdXBzOiByZWFkb25seSBJUGFyc2VkSG9va0dyb3VwW10sXG5cdGVkaXRUcmFja2luZ0hvb2tzPzoge1xuXHRcdHJlYWRvbmx5IG9uUHJlVG9vbFVzZTogKGlucHV0OiBQcmVUb29sVXNlSG9va0lucHV0KSA9PiBQcm9taXNlPHZvaWQ+O1xuXHRcdHJlYWRvbmx5IG9uUG9zdFRvb2xVc2U6IChpbnB1dDogUG9zdFRvb2xVc2VIb29rSW5wdXQpID0+IFByb21pc2U8dm9pZD47XG5cdFx0cmVhZG9ubHkgb25Vc2VyUHJvbXB0U3VibWl0dGVkPzogKCkgPT4geyByZWFkb25seSBhZGRpdGlvbmFsQ29udGV4dDogc3RyaW5nIH0gfCB1bmRlZmluZWQ7XG5cdH0sXG4pOiBTZXNzaW9uSG9va3Mge1xuXHQvLyBHcm91cCBhbGwgY29tbWFuZHMgYnkgU0RLIGhhbmRsZXIga2V5XG5cdGNvbnN0IGNvbW1hbmRzQnlLZXkgPSBuZXcgTWFwPGtleW9mIFNlc3Npb25Ib29rcywgSVBhcnNlZEhvb2tDb21tYW5kW10+KCk7XG5cdGZvciAoY29uc3QgZ3JvdXAgb2YgaG9va0dyb3Vwcykge1xuXHRcdGNvbnN0IHNka0tleSA9IEhPT0tfVFlQRV9UT19TREtfS0VZW2dyb3VwLnR5cGVdO1xuXHRcdGlmICghc2RrS2V5KSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBjb21tYW5kc0J5S2V5LmdldChzZGtLZXkpID8/IFtdO1xuXHRcdGV4aXN0aW5nLnB1c2goLi4uZ3JvdXAuY29tbWFuZHMpO1xuXHRcdGNvbW1hbmRzQnlLZXkuc2V0KHNka0tleSwgZXhpc3RpbmcpO1xuXHR9XG5cblx0Y29uc3QgaG9va3M6IFNlc3Npb25Ib29rcyA9IHt9O1xuXG5cdC8vIFByZS10b29sLXVzZSBoYW5kbGVyXG5cdGNvbnN0IHByZVRvb2xDb21tYW5kcyA9IGNvbW1hbmRzQnlLZXkuZ2V0KCdvblByZVRvb2xVc2UnKTtcblx0aWYgKHByZVRvb2xDb21tYW5kcz8ubGVuZ3RoIHx8IGVkaXRUcmFja2luZ0hvb2tzKSB7XG5cdFx0aG9va3Mub25QcmVUb29sVXNlID0gYXN5bmMgKGlucHV0OiBQcmVUb29sVXNlSG9va0lucHV0KSA9PiB7XG5cdFx0XHRhd2FpdCBlZGl0VHJhY2tpbmdIb29rcz8ub25QcmVUb29sVXNlKGlucHV0KTtcblx0XHRcdHJldHVybiBydW5Ib29rQ29tbWFuZHMocHJlVG9vbENvbW1hbmRzLCBpbnB1dCk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIFBvc3QtdG9vbC11c2UgaGFuZGxlclxuXHRjb25zdCBwb3N0VG9vbENvbW1hbmRzID0gY29tbWFuZHNCeUtleS5nZXQoJ29uUG9zdFRvb2xVc2UnKTtcblx0aWYgKHBvc3RUb29sQ29tbWFuZHM/Lmxlbmd0aCB8fCBlZGl0VHJhY2tpbmdIb29rcykge1xuXHRcdGhvb2tzLm9uUG9zdFRvb2xVc2UgPSBhc3luYyAoaW5wdXQ6IFBvc3RUb29sVXNlSG9va0lucHV0KSA9PiB7XG5cdFx0XHRhd2FpdCBlZGl0VHJhY2tpbmdIb29rcz8ub25Qb3N0VG9vbFVzZShpbnB1dCk7XG5cdFx0XHRyZXR1cm4gcnVuSG9va0NvbW1hbmRzKHBvc3RUb29sQ29tbWFuZHMsIGlucHV0KTtcblx0XHR9O1xuXHR9XG5cblx0Ly8gVXNlci1wcm9tcHQtc3VibWl0dGVkIGhhbmRsZXJcblx0Y29uc3QgcHJvbXB0Q29tbWFuZHMgPSBjb21tYW5kc0J5S2V5LmdldCgnb25Vc2VyUHJvbXB0U3VibWl0dGVkJyk7XG5cdGlmIChwcm9tcHRDb21tYW5kcz8ubGVuZ3RoIHx8IGVkaXRUcmFja2luZ0hvb2tzPy5vblVzZXJQcm9tcHRTdWJtaXR0ZWQpIHtcblx0XHRob29rcy5vblVzZXJQcm9tcHRTdWJtaXR0ZWQgPSBhc3luYyAoaW5wdXQ6IFVzZXJQcm9tcHRTdWJtaXR0ZWRIb29rSW5wdXQpID0+IHtcblx0XHRcdGNvbnN0IHN0ZGluID0gSlNPTi5zdHJpbmdpZnkoaW5wdXQpO1xuXHRcdFx0Zm9yIChjb25zdCBjbWQgb2YgcHJvbXB0Q29tbWFuZHMgPz8gW10pIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBleGVjdXRlSG9va0NvbW1hbmQoY21kLCBzdGRpbik7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIEhvb2sgZmFpbHVyZXMgYXJlIG5vbi1mYXRhbFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZWRpdFRyYWNraW5nSG9va3M/Lm9uVXNlclByb21wdFN1Ym1pdHRlZD8uKCk7XG5cdFx0fTtcblx0fVxuXG5cdC8vIFNlc3Npb24tc3RhcnQgaGFuZGxlclxuXHRjb25zdCBzdGFydENvbW1hbmRzID0gY29tbWFuZHNCeUtleS5nZXQoJ29uU2Vzc2lvblN0YXJ0Jyk7XG5cdGlmIChzdGFydENvbW1hbmRzPy5sZW5ndGgpIHtcblx0XHRob29rcy5vblNlc3Npb25TdGFydCA9IGFzeW5jIChpbnB1dDogU2Vzc2lvblN0YXJ0SG9va0lucHV0KSA9PiB7XG5cdFx0XHRjb25zdCBzdGRpbiA9IEpTT04uc3RyaW5naWZ5KGlucHV0KTtcblx0XHRcdGZvciAoY29uc3QgY21kIG9mIHN0YXJ0Q29tbWFuZHMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBleGVjdXRlSG9va0NvbW1hbmQoY21kLCBzdGRpbik7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdC8vIEhvb2sgZmFpbHVyZXMgYXJlIG5vbi1mYXRhbFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdC8vIFNlc3Npb24tZW5kIGhhbmRsZXJcblx0Y29uc3QgZW5kQ29tbWFuZHMgPSBjb21tYW5kc0J5S2V5LmdldCgnb25TZXNzaW9uRW5kJyk7XG5cdGlmIChlbmRDb21tYW5kcz8ubGVuZ3RoKSB7XG5cdFx0aG9va3Mub25TZXNzaW9uRW5kID0gYXN5bmMgKGlucHV0OiBTZXNzaW9uRW5kSG9va0lucHV0KSA9PiB7XG5cdFx0XHRjb25zdCBzdGRpbiA9IEpTT04uc3RyaW5naWZ5KGlucHV0KTtcblx0XHRcdGZvciAoY29uc3QgY21kIG9mIGVuZENvbW1hbmRzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgZXhlY3V0ZUhvb2tDb21tYW5kKGNtZCwgc3RkaW4pO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBIb29rIGZhaWx1cmVzIGFyZSBub24tZmF0YWxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBFcnJvci1vY2N1cnJlZCBoYW5kbGVyXG5cdGNvbnN0IGVycm9yQ29tbWFuZHMgPSBjb21tYW5kc0J5S2V5LmdldCgnb25FcnJvck9jY3VycmVkJyk7XG5cdGlmIChlcnJvckNvbW1hbmRzPy5sZW5ndGgpIHtcblx0XHRob29rcy5vbkVycm9yT2NjdXJyZWQgPSBhc3luYyAoaW5wdXQ6IEVycm9yT2NjdXJyZWRIb29rSW5wdXQpID0+IHtcblx0XHRcdGNvbnN0IHN0ZGluID0gSlNPTi5zdHJpbmdpZnkoaW5wdXQpO1xuXHRcdFx0Zm9yIChjb25zdCBjbWQgb2YgZXJyb3JDb21tYW5kcykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGV4ZWN1dGVIb29rQ29tbWFuZChjbWQsIHN0ZGluKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gSG9vayBmYWlsdXJlcyBhcmUgbm9uLWZhdGFsXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cmV0dXJuIGhvb2tzO1xufVxuXG4vKipcbiAqIENoZWNrcyB3aGV0aGVyIHR3byBzZXRzIG9mIHBhcnNlZCBwbHVnaW5zIHByb2R1Y2UgZXF1aXZhbGVudCBTREsgY29uZmlnLlxuICogVXNlZCB0byBkZXRlcm1pbmUgaWYgYSBzZXNzaW9uIG5lZWRzIHRvIGJlIHJlZnJlc2hlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlZFBsdWdpbnNFcXVhbChhOiByZWFkb25seSBJUGFyc2VkUGx1Z2luW10sIGI6IHJlYWRvbmx5IElQYXJzZWRQbHVnaW5bXSk6IGJvb2xlYW4ge1xuXHQvLyBTaW1wbGUgc3RydWN0dXJhbCBjb21wYXJpc29uIHZpYSBKU09OIHNlcmlhbGl6YXRpb24uXG5cdC8vIFdlIHNlcmlhbGl6ZSBvbmx5IHRoZSBlc3NlbnRpYWwgZmllbGRzLCByZXBsYWNpbmcgVVJJcyB3aXRoIHN0cmluZ3MuXG5cdGNvbnN0IHNlcmlhbGl6ZSA9IChwbHVnaW5zOiByZWFkb25seSBJUGFyc2VkUGx1Z2luW10pID0+IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkocGx1Z2lucy5tYXAocCA9PiAoe1xuXHRcdFx0Zm9ybWF0OiBwLmZvcm1hdCxcblx0XHRcdGhvb2tzOiBwLmhvb2tzLm1hcChoID0+ICh7IHR5cGU6IGgudHlwZSwgY29tbWFuZHM6IGguY29tbWFuZHMubWFwKGMgPT4gKHsgY29tbWFuZDogYy5jb21tYW5kLCB3aW5kb3dzOiBjLndpbmRvd3MsIGxpbnV4OiBjLmxpbnV4LCBvc3g6IGMub3N4LCBjd2Q6IGMuY3dkPy50b1N0cmluZygpLCBlbnY6IGMuZW52LCB0aW1lb3V0OiBjLnRpbWVvdXQgfSkpIH0pKSxcblx0XHRcdG1jcFNlcnZlcnM6IHAubWNwU2VydmVycy5tYXAobSA9PiAoeyBuYW1lOiBtLm5hbWUsIGNvbmZpZ3VyYXRpb246IG0uY29uZmlndXJhdGlvbiB9KSksXG5cdFx0XHRza2lsbHM6IHAuc2tpbGxzLm1hcChzID0+ICh7IHVyaTogcy51cmkudG9TdHJpbmcoKSwgbmFtZTogcy5uYW1lIH0pKSxcblx0XHRcdGFnZW50czogcC5hZ2VudHMubWFwKGEgPT4gKHsgdXJpOiBhLnVyaS50b1N0cmluZygpLCBuYW1lOiBhLm5hbWUgfSkpLFxuXHRcdFx0aW5zdHJ1Y3Rpb25zOiBwLmluc3RydWN0aW9ucy5tYXAoaSA9PiAoeyB1cmk6IGkudXJpLnRvU3RyaW5nKCksIG5hbWU6IGkubmFtZSB9KSksXG5cdFx0fSkpKTtcblx0fTtcblx0cmV0dXJuIHNlcmlhbGl6ZShhKSA9PT0gc2VyaWFsaXplKGIpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxhQUFhO0FBRXRCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixVQUFVO0FBRXBDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMscUJBQW1EO0FBRzVELFNBQVMsZUFBZTtBQWdCakIsU0FBUyxnQkFBZ0IsTUFBd0U7QUFDdkcsUUFBTSxTQUEwQyxDQUFDO0FBQ2pELGFBQVcsT0FBTyxNQUFNO0FBQ3ZCLFdBQU8sSUFBSSxJQUFJLElBQUksZUFBZSxJQUFJLE1BQU0sSUFBSSxhQUFhO0FBQUEsRUFDOUQ7QUFDQSxTQUFPO0FBQ1I7QUFZTyxTQUFTLDZCQUE2QixTQUFtRTtBQUMvRyxRQUFNLFNBQTBDLENBQUM7QUFDakQsYUFBVyxDQUFDLE1BQU0sTUFBTSxLQUFLLE9BQU8sUUFBUSxPQUFPLEdBQUc7QUFDckQsUUFBSSxrQ0FBa0MsTUFBTSxHQUFHO0FBQzlDLGFBQU8sSUFBSSxJQUFJLGVBQWUsTUFBTSxNQUFNO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBT0EsU0FBUyxrQ0FBa0MsT0FBa0Q7QUFDNUYsTUFBSSxDQUFDLFNBQVMsT0FBTyxVQUFVLFVBQVU7QUFDeEMsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFlBQVk7QUFDbEIsTUFBSSxVQUFVLFNBQVMsY0FBYyxPQUFPO0FBQzNDLFdBQU8sT0FBTyxVQUFVLFlBQVk7QUFBQSxFQUNyQztBQUNBLE1BQUksVUFBVSxTQUFTLGNBQWMsUUFBUTtBQUM1QyxXQUFPLE9BQU8sVUFBVSxRQUFRO0FBQUEsRUFDakM7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLGVBQWUsT0FBZSxRQUFrRDtBQUN4RixNQUFJLE9BQU8sU0FBUyxjQUFjLE9BQU87QUFDeEMsV0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sU0FBUyxPQUFPO0FBQUEsTUFDaEIsTUFBTSxPQUFPLE9BQU8sQ0FBQyxHQUFHLE9BQU8sSUFBSSxJQUFJLENBQUM7QUFBQSxNQUN4QyxPQUFPLENBQUMsR0FBRztBQUFBLE1BQ1gsR0FBSSxPQUFPLE9BQU8sRUFBRSxLQUFLLFlBQVksT0FBTyxHQUFHLEVBQUU7QUFBQSxNQUNqRCxHQUFJLE9BQU8sT0FBTyxFQUFFLEtBQUssT0FBTyxJQUFJO0FBQUEsSUFDckM7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sS0FBSyxPQUFPO0FBQUEsSUFDWixPQUFPLENBQUMsR0FBRztBQUFBLElBQ1gsR0FBSSxPQUFPLFdBQVcsRUFBRSxTQUFTLEVBQUUsR0FBRyxPQUFPLFFBQVEsRUFBRTtBQUFBLEVBQ3hEO0FBQ0Q7QUFLQSxTQUFTLFlBQVksS0FBcUU7QUFDekYsUUFBTSxTQUFpQyxDQUFDO0FBQ3hDLGFBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsR0FBRyxHQUFHO0FBQy9DLFFBQUksVUFBVSxNQUFNO0FBQ25CLGFBQU8sR0FBRyxJQUFJLE9BQU8sS0FBSztBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQWlCQSxlQUFzQixrQkFBa0IsUUFBeUMsYUFBeUQ7QUFDekksUUFBTSxVQUErQixDQUFDO0FBQ3RDLGFBQVcsU0FBUyxRQUFRO0FBQzNCLFFBQUk7QUFDSCxZQUFNLFVBQVUsTUFBTSxZQUFZLFNBQVMsTUFBTSxHQUFHO0FBQ3BELFlBQU0sTUFBTSxRQUFRLE1BQU0sU0FBUztBQUNuQyxZQUFNLEtBQUssaUJBQWlCLEdBQUc7QUFDL0IsVUFBSSxDQUFDLElBQUk7QUFDUixnQkFBUSxLQUFLO0FBQUEsVUFDWixNQUFNLE1BQU07QUFBQSxVQUNaLFFBQVE7QUFBQSxRQUNULENBQUM7QUFBQSxNQUNGLE9BQU87QUFLTixjQUFNLE9BQU8sR0FBRyxlQUFlLE1BQU0sR0FBRyxLQUFLLEtBQUssTUFBTTtBQUN4RCxjQUFNLGNBQWMsR0FBRyxlQUFlLGFBQWE7QUFDbkQsY0FBTSxRQUFRLEdBQUcsb0JBQW9CLE9BQU87QUFDNUMsY0FBTSxTQUFTLEdBQUcsb0JBQW9CLFFBQVE7QUFDOUMsWUFBSSxRQUFRLEdBQUcsZ0JBQWdCLE9BQU87QUFDdEMsY0FBTSx5QkFBeUIsR0FBRyxnQkFBZ0IsMEJBQTBCO0FBQzVFLFlBQUksVUFBVSxVQUFhLDJCQUEyQixNQUFNO0FBQzNELGtCQUFRO0FBQUEsUUFDVDtBQUNBLGNBQU0sU0FBUyxHQUFHLFFBQVE7QUFDMUIsWUFBSSxRQUE0QixHQUFHLGVBQWUsT0FBTyxLQUFLO0FBQzlELGNBQU0sU0FBUyxHQUFHLG9CQUFvQixPQUFPLEtBQUs7QUFDbEQsWUFBSSxDQUFDLFNBQVMsVUFBVSxNQUFNLFFBQVEsTUFBTSxLQUFLLE9BQU8sU0FBUyxHQUFHO0FBQ25FLGtCQUFRLE9BQU8sQ0FBQztBQUFBLFFBQ2pCO0FBQ0EsZ0JBQVEsS0FBSztBQUFBLFVBQ1o7QUFBQSxVQUNBLEdBQUksY0FBYyxFQUFFLFlBQVksSUFBSSxDQUFDO0FBQUEsVUFDckMsR0FBSSxRQUFRLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxVQUN6QixPQUFPLFNBQVMsTUFBTSxTQUFTLElBQUksUUFBUTtBQUFBLFVBQzNDLEdBQUksV0FBVyxTQUFZLEVBQUUsT0FBTyxJQUFJLENBQUM7QUFBQSxVQUN6QyxHQUFJLFVBQVUsU0FBWSxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsVUFDdkM7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxRQUFRO0FBQUEsSUFFUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFxQkEsZUFBc0IseUJBQ3JCLFNBQ0EsbUJBQ0EsYUFDK0I7QUFDL0IsUUFBTSxxQkFBcUIsUUFBUSxPQUFPLE9BQUssQ0FBQyxFQUFFLGFBQWEsRUFBRSxVQUFVLFdBQVcsUUFBUSxJQUFJO0FBQ2xHLFFBQU0sZUFBZSxNQUFNLGtCQUFrQixtQkFBbUIsUUFBUSxPQUFLLEVBQUUsTUFBTSxHQUFHLFdBQVc7QUFDbkcsTUFBSSxxQkFBcUIsQ0FBQyxhQUFhLEtBQUssV0FBUyxNQUFNLFNBQVMsaUJBQWlCLEdBQUc7QUFDdkYsVUFBTSxpQkFBaUIsUUFBUSxRQUFRLE9BQUssRUFBRSxNQUFNLEVBQUUsT0FBTyxXQUFTLE1BQU0sU0FBUyxpQkFBaUI7QUFDdEcsZUFBVyxVQUFVLE1BQU0sa0JBQWtCLGdCQUFnQixXQUFXLEdBQUc7QUFDMUUsVUFBSSxDQUFDLGFBQWEsS0FBSyxXQUFTLE1BQU0sU0FBUyxPQUFPLElBQUksR0FBRztBQUM1RCxxQkFBYSxLQUFLLE1BQU07QUFBQSxNQUN6QjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBTU8sU0FBUyxzQkFBc0IsUUFBdUQ7QUFDNUYsU0FBTyxPQUFPLElBQUksT0FBSyxFQUFFLGFBQWE7QUFDdkM7QUFTTyxTQUFTLHNCQUFzQixTQUF5RDtBQUM5RixRQUFNLE9BQU8sb0JBQUksSUFBZ0M7QUFDakQsUUFBTSxNQUFNLENBQUMsTUFBMEI7QUFDdEMsUUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFLEVBQUUsR0FBRztBQUNwQixXQUFLLElBQUksRUFBRSxJQUFJLENBQUM7QUFBQSxJQUNqQjtBQUFBLEVBQ0Q7QUFDQSxhQUFXLFVBQVUsU0FBUztBQUM3QixlQUFXLEtBQUssT0FBTyxRQUFRO0FBQUUsVUFBSSxFQUFFLGFBQWE7QUFBQSxJQUFHO0FBQ3ZELGVBQVcsS0FBSyxPQUFPLFFBQVE7QUFBRSxVQUFJLEVBQUUsYUFBYTtBQUFBLElBQUc7QUFDdkQsZUFBVyxLQUFLLE9BQU8sY0FBYztBQUFFLFVBQUksRUFBRSxhQUFhO0FBQUEsSUFBRztBQUM3RCxlQUFXLEtBQUssT0FBTyxPQUFPO0FBQUUsVUFBSSxFQUFFLGFBQWE7QUFBQSxJQUFHO0FBQ3RELGVBQVcsS0FBSyxPQUFPLFlBQVk7QUFBRSxVQUFJLEVBQUUsYUFBYTtBQUFBLElBQUc7QUFBQSxFQUM1RDtBQUNBLFNBQU8sQ0FBQyxHQUFHLEtBQUssT0FBTyxDQUFDO0FBQ3pCO0FBVU8sU0FBUyxzQkFBc0IsUUFBbUQ7QUFDeEYsU0FBTyx5QkFBeUIsTUFBTTtBQUN2QztBQU1PLFNBQVMsNEJBQTRCLGNBQXlEO0FBQ3BHLFNBQU8seUJBQXlCLFlBQVk7QUFDN0M7QUFFQSxTQUFTLHlCQUF5QixXQUFzRDtBQUN2RixRQUFNLE9BQU8sb0JBQUksSUFBWTtBQUM3QixRQUFNLFNBQW1CLENBQUM7QUFDMUIsYUFBVyxZQUFZLFdBQVc7QUFDakMsVUFBTSxNQUFNLFFBQVEsU0FBUyxJQUFJLE1BQU07QUFDdkMsUUFBSSxDQUFDLEtBQUssSUFBSSxHQUFHLEdBQUc7QUFDbkIsV0FBSyxJQUFJLEdBQUc7QUFDWixhQUFPLEtBQUssR0FBRztBQUFBLElBQ2hCO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQVNBLFNBQVMsd0JBQXdCLE1BQTBCLElBQXlDO0FBQ25HLE1BQUksT0FBTyxnQkFBZ0IsV0FBVyxLQUFLLFNBQVM7QUFDbkQsV0FBTyxLQUFLO0FBQUEsRUFDYixXQUFXLE9BQU8sZ0JBQWdCLGFBQWEsS0FBSyxLQUFLO0FBQ3hELFdBQU8sS0FBSztBQUFBLEVBQ2IsV0FBVyxPQUFPLGdCQUFnQixTQUFTLEtBQUssT0FBTztBQUN0RCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0EsU0FBTyxLQUFLO0FBQ2I7QUFNQSxTQUFTLG1CQUFtQixNQUEwQixPQUFpQztBQUN0RixRQUFNLFVBQVUsd0JBQXdCLE1BQU0sRUFBRTtBQUNoRCxNQUFJLENBQUMsU0FBUztBQUNiLFdBQU8sUUFBUSxRQUFRLEVBQUU7QUFBQSxFQUMxQjtBQUVBLFFBQU0sV0FBVyxLQUFLLFdBQVcsTUFBTTtBQUN2QyxRQUFNLE1BQU0sS0FBSyxLQUFLO0FBRXRCLFNBQU8sSUFBSSxRQUFnQixDQUFDLFNBQVMsV0FBVztBQUMvQyxVQUFNLFlBQVksT0FBTyxnQkFBZ0I7QUFDekMsVUFBTSxRQUFRLFlBQVksWUFBWTtBQUN0QyxVQUFNLFlBQVksWUFBWSxDQUFDLE1BQU0sT0FBTyxJQUFJLENBQUMsTUFBTSxPQUFPO0FBRTlELFVBQU0sUUFBUSxNQUFNLE9BQU8sV0FBVztBQUFBLE1BQ3JDO0FBQUEsTUFDQSxLQUFLLEVBQUUsR0FBRyxRQUFRLEtBQUssR0FBRyxLQUFLLElBQUk7QUFBQSxNQUNuQyxPQUFPLENBQUMsUUFBUSxRQUFRLE1BQU07QUFBQSxNQUM5QjtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksU0FBUztBQUNiLFFBQUksU0FBUztBQUViLFVBQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxTQUFpQjtBQUFFLGdCQUFVLEtBQUssU0FBUztBQUFBLElBQUcsQ0FBQztBQUN4RSxVQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsU0FBaUI7QUFBRSxnQkFBVSxLQUFLLFNBQVM7QUFBQSxJQUFHLENBQUM7QUFFeEUsUUFBSSxPQUFPO0FBQ1YsWUFBTSxNQUFNLE1BQU0sS0FBSztBQUN2QixZQUFNLE1BQU0sSUFBSTtBQUFBLElBQ2pCLE9BQU87QUFDTixZQUFNLE1BQU0sSUFBSTtBQUFBLElBQ2pCO0FBRUEsVUFBTSxHQUFHLFNBQVMsTUFBTTtBQUN4QixVQUFNLEdBQUcsU0FBUyxDQUFDLFNBQVM7QUFDM0IsVUFBSSxTQUFTLEdBQUc7QUFDZixnQkFBUSxNQUFNO0FBQUEsTUFDZixPQUFPO0FBQ04sZUFBTyxJQUFJLE1BQU0saUNBQWlDLElBQUksS0FBSyxVQUFVLE1BQU0sRUFBRSxDQUFDO0FBQUEsTUFDL0U7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRjtBQVFBLGVBQWUsZ0JBQWdCLFVBQXFELE9BQTZDO0FBQ2hJLE1BQUksQ0FBQyxVQUFVO0FBQ2QsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFFBQVEsS0FBSyxVQUFVLEtBQUs7QUFDbEMsYUFBVyxPQUFPLFVBQVU7QUFDM0IsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLG1CQUFtQixLQUFLLEtBQUs7QUFDbEQsVUFBSSxPQUFPLEtBQUssR0FBRztBQUNsQixZQUFJO0FBQ0gsZ0JBQU0sU0FBUyxLQUFLLE1BQU0sTUFBTTtBQUNoQyxjQUFJLFVBQVUsT0FBTyxXQUFXLFVBQVU7QUFDekMsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRCxRQUFRO0FBQUEsUUFFUjtBQUFBLE1BQ0Q7QUFBQSxJQUNELFFBQVE7QUFBQSxJQUVSO0FBQUEsRUFDRDtBQUNBLFNBQU87QUFDUjtBQUtBLE1BQU0sdUJBQTJEO0FBQUEsRUFDaEUsY0FBYztBQUFBLEVBQ2QsZUFBZTtBQUFBLEVBQ2Ysb0JBQW9CO0FBQUEsRUFDcEIsZ0JBQWdCO0FBQUEsRUFDaEIsY0FBYztBQUFBLEVBQ2QsaUJBQWlCO0FBQ2xCO0FBV08sU0FBUyxXQUNmLFlBQ0EsbUJBS2U7QUFFZixRQUFNLGdCQUFnQixvQkFBSSxJQUE4QztBQUN4RSxhQUFXLFNBQVMsWUFBWTtBQUMvQixVQUFNLFNBQVMscUJBQXFCLE1BQU0sSUFBSTtBQUM5QyxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVyxjQUFjLElBQUksTUFBTSxLQUFLLENBQUM7QUFDL0MsYUFBUyxLQUFLLEdBQUcsTUFBTSxRQUFRO0FBQy9CLGtCQUFjLElBQUksUUFBUSxRQUFRO0FBQUEsRUFDbkM7QUFFQSxRQUFNLFFBQXNCLENBQUM7QUFHN0IsUUFBTSxrQkFBa0IsY0FBYyxJQUFJLGNBQWM7QUFDeEQsTUFBSSxpQkFBaUIsVUFBVSxtQkFBbUI7QUFDakQsVUFBTSxlQUFlLE9BQU8sVUFBK0I7QUFDMUQsWUFBTSxtQkFBbUIsYUFBYSxLQUFLO0FBQzNDLGFBQU8sZ0JBQWdCLGlCQUFpQixLQUFLO0FBQUEsSUFDOUM7QUFBQSxFQUNEO0FBR0EsUUFBTSxtQkFBbUIsY0FBYyxJQUFJLGVBQWU7QUFDMUQsTUFBSSxrQkFBa0IsVUFBVSxtQkFBbUI7QUFDbEQsVUFBTSxnQkFBZ0IsT0FBTyxVQUFnQztBQUM1RCxZQUFNLG1CQUFtQixjQUFjLEtBQUs7QUFDNUMsYUFBTyxnQkFBZ0Isa0JBQWtCLEtBQUs7QUFBQSxJQUMvQztBQUFBLEVBQ0Q7QUFHQSxRQUFNLGlCQUFpQixjQUFjLElBQUksdUJBQXVCO0FBQ2hFLE1BQUksZ0JBQWdCLFVBQVUsbUJBQW1CLHVCQUF1QjtBQUN2RSxVQUFNLHdCQUF3QixPQUFPLFVBQXdDO0FBQzVFLFlBQU0sUUFBUSxLQUFLLFVBQVUsS0FBSztBQUNsQyxpQkFBVyxPQUFPLGtCQUFrQixDQUFDLEdBQUc7QUFDdkMsWUFBSTtBQUNILGdCQUFNLG1CQUFtQixLQUFLLEtBQUs7QUFBQSxRQUNwQyxRQUFRO0FBQUEsUUFFUjtBQUFBLE1BQ0Q7QUFDQSxhQUFPLG1CQUFtQix3QkFBd0I7QUFBQSxJQUNuRDtBQUFBLEVBQ0Q7QUFHQSxRQUFNLGdCQUFnQixjQUFjLElBQUksZ0JBQWdCO0FBQ3hELE1BQUksZUFBZSxRQUFRO0FBQzFCLFVBQU0saUJBQWlCLE9BQU8sVUFBaUM7QUFDOUQsWUFBTSxRQUFRLEtBQUssVUFBVSxLQUFLO0FBQ2xDLGlCQUFXLE9BQU8sZUFBZTtBQUNoQyxZQUFJO0FBQ0gsZ0JBQU0sbUJBQW1CLEtBQUssS0FBSztBQUFBLFFBQ3BDLFFBQVE7QUFBQSxRQUVSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBR0EsUUFBTSxjQUFjLGNBQWMsSUFBSSxjQUFjO0FBQ3BELE1BQUksYUFBYSxRQUFRO0FBQ3hCLFVBQU0sZUFBZSxPQUFPLFVBQStCO0FBQzFELFlBQU0sUUFBUSxLQUFLLFVBQVUsS0FBSztBQUNsQyxpQkFBVyxPQUFPLGFBQWE7QUFDOUIsWUFBSTtBQUNILGdCQUFNLG1CQUFtQixLQUFLLEtBQUs7QUFBQSxRQUNwQyxRQUFRO0FBQUEsUUFFUjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUdBLFFBQU0sZ0JBQWdCLGNBQWMsSUFBSSxpQkFBaUI7QUFDekQsTUFBSSxlQUFlLFFBQVE7QUFDMUIsVUFBTSxrQkFBa0IsT0FBTyxVQUFrQztBQUNoRSxZQUFNLFFBQVEsS0FBSyxVQUFVLEtBQUs7QUFDbEMsaUJBQVcsT0FBTyxlQUFlO0FBQ2hDLFlBQUk7QUFDSCxnQkFBTSxtQkFBbUIsS0FBSyxLQUFLO0FBQUEsUUFDcEMsUUFBUTtBQUFBLFFBRVI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7QUFNTyxTQUFTLG1CQUFtQixHQUE2QixHQUFzQztBQUdyRyxRQUFNLFlBQVksQ0FBQyxZQUFzQztBQUN4RCxXQUFPLEtBQUssVUFBVSxRQUFRLElBQUksUUFBTTtBQUFBLE1BQ3ZDLFFBQVEsRUFBRTtBQUFBLE1BQ1YsT0FBTyxFQUFFLE1BQU0sSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sVUFBVSxFQUFFLFNBQVMsSUFBSSxRQUFNLEVBQUUsU0FBUyxFQUFFLFNBQVMsU0FBUyxFQUFFLFNBQVMsT0FBTyxFQUFFLE9BQU8sS0FBSyxFQUFFLEtBQUssS0FBSyxFQUFFLEtBQUssU0FBUyxHQUFHLEtBQUssRUFBRSxLQUFLLFNBQVMsRUFBRSxRQUFRLEVBQUUsRUFBRSxFQUFFO0FBQUEsTUFDM00sWUFBWSxFQUFFLFdBQVcsSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sZUFBZSxFQUFFLGNBQWMsRUFBRTtBQUFBLE1BQ3BGLFFBQVEsRUFBRSxPQUFPLElBQUksUUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLFNBQVMsR0FBRyxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQUEsTUFDbkUsUUFBUSxFQUFFLE9BQU8sSUFBSSxDQUFBQSxRQUFNLEVBQUUsS0FBS0EsR0FBRSxJQUFJLFNBQVMsR0FBRyxNQUFNQSxHQUFFLEtBQUssRUFBRTtBQUFBLE1BQ25FLGNBQWMsRUFBRSxhQUFhLElBQUksUUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLFNBQVMsR0FBRyxNQUFNLEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDaEYsRUFBRSxDQUFDO0FBQUEsRUFDSjtBQUNBLFNBQU8sVUFBVSxDQUFDLE1BQU0sVUFBVSxDQUFDO0FBQ3BDOyIsCiAgIm5hbWVzIjogWyJhIl0KfQo=
