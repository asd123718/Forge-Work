import { URI } from "../../../../../base/common/uri.js";
import { isEqualOrParent } from "../../../../../base/common/resources.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { makeMcpServerCustomization, parseAgentFile, toParsedAgent } from "../../../../agentPlugins/common/pluginParsers.js";
import { CustomizationType } from "../../../common/state/protocol/channels-session/state.js";
import { CustomizationLoadStatus, customizationId } from "../../../common/state/sessionState.js";
import { isHostInjectedMcpServerName } from "../claudeMcpServerNames.js";
import { deriveMcpState } from "./scan/claudeMcpScan.js";
import { claudeMemoryFiles } from "./scan/claudeRuleScan.js";
import { CLAUDE_BUILTIN_AGENTS, buildClaudeBuiltinSkillsContainer, buildSdkBuiltinSkillsContainer } from "./claudeBuiltinCommands.js";
import { distinctClaudeWorkingDirectories } from "./claudeMultiRootCustomizationDiscovery.js";
import { findMostSpecificClaudeWorkspaceRoot } from "./claudeCustomizationPolicy.js";
const CLAUDE_SDK_DEFAULT_AGENT_NAME = "general-purpose";
const CLAUDE_INTERNAL_SCHEME = "claude-internal";
function makeDirectory(base, sub, contents, children) {
  const uri = URI.joinPath(base, ".claude", sub).toString();
  return {
    type: CustomizationType.Directory,
    id: customizationId(uri),
    uri,
    name: sub,
    enabled: true,
    contents,
    writable: true,
    load: { kind: CustomizationLoadStatus.Loaded },
    children: [...children]
  };
}
function makePlugin(plugin) {
  const uri = plugin.root.toString();
  const children = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (child) => {
    if (!seen.has(child.id)) {
      seen.add(child.id);
      children.push(child);
    }
  };
  for (const agent of plugin.parsed.agents) {
    push(agent.customization);
  }
  for (const skill of plugin.parsed.skills) {
    push(skill.customization);
  }
  for (const rule of plugin.parsed.instructions) {
    push(rule.customization);
  }
  for (const hook of plugin.parsed.hooks) {
    push(hook.customization);
  }
  for (const mcp of plugin.parsed.mcpServers) {
    push(mcp.customization);
  }
  return {
    type: CustomizationType.Plugin,
    id: customizationId(uri),
    uri,
    name: plugin.id,
    load: { kind: CustomizationLoadStatus.Loaded },
    children
  };
}
function createBucket(base) {
  return { base, agents: [], skills: [], rules: [], hooks: [] };
}
function findCustomizationBucket(uri, workspaceBuckets, userBucket) {
  const root = findMostSpecificClaudeWorkspaceRoot(uri, workspaceBuckets.map((bucket) => bucket.base));
  if (workspaceBuckets.length > 1 && uri.scheme === userBucket.base.scheme && isEqualOrParent(uri, userBucket.base) && (!root || userBucket.base.path.length > root.path.length)) {
    return userBucket;
  }
  return workspaceBuckets.find((bucket) => bucket.base === root) ?? userBucket;
}
function mapDiscoveredCustomizations(discovered, mcpServers, hooks, nativePlugins, workingDirectories, userHome) {
  const roots = distinctClaudeWorkingDirectories(Array.isArray(workingDirectories) ? workingDirectories : workingDirectories ? [workingDirectories] : []);
  const workspaceBuckets = roots.map(createBucket);
  const userBucket = createBucket(userHome);
  for (const d of discovered) {
    const bucket = findCustomizationBucket(d.uri, workspaceBuckets, userBucket);
    if (d.customization.type === CustomizationType.Agent) {
      bucket.agents.push(d.customization);
    } else if (d.customization.type === CustomizationType.Skill) {
      bucket.skills.push(d.customization);
    } else {
      bucket.rules.push(d.customization);
    }
  }
  for (const hook of hooks) {
    findCustomizationBucket(URI.parse(hook.uri), workspaceBuckets, userBucket).hooks.push(hook);
  }
  const result = [];
  for (const bucket of [...workspaceBuckets, userBucket]) {
    if (bucket.agents.length > 0) {
      result.push(makeDirectory(bucket.base, "agents", CustomizationType.Agent, bucket.agents));
    }
    if (bucket.skills.length > 0) {
      result.push(makeDirectory(bucket.base, "skills", CustomizationType.Skill, bucket.skills));
    }
    if (bucket.rules.length > 0) {
      result.push(makeDirectory(bucket.base, "rules", CustomizationType.Rule, bucket.rules));
    }
    if (bucket.hooks.length > 0) {
      result.push(makeDirectory(bucket.base, "hooks", CustomizationType.Hook, bucket.hooks));
    }
  }
  for (const plugin of nativePlugins) {
    result.push(makePlugin(plugin));
  }
  result.push(...mcpServers);
  return result;
}
function nonEditableUri(kind, name) {
  return URI.from({ scheme: CLAUDE_INTERNAL_SCHEME, path: `/${kind}/${encodeURIComponent(name)}` });
}
async function resolveClaudeAgentName(agent, fileService, logService, sessionId) {
  if (!agent) {
    return void 0;
  }
  const uri = URI.parse(agent.uri);
  if (uri.scheme === CLAUDE_INTERNAL_SCHEME) {
    const last = uri.path.split("/").pop() ?? "";
    const name2 = last ? decodeURIComponent(last) : "";
    if (!name2) {
      logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: could not extract agent name from URI '${agent.uri}'`);
      return void 0;
    }
    return name2;
  }
  try {
    const parsed = await parseAgentFile(uri, fileService);
    if (parsed.name) {
      return parsed.name;
    }
  } catch (err) {
    logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: failed to parse agent file '${agent.uri}', falling back to basename`, err);
  }
  const basename = uri.path.split("/").pop() ?? "";
  const name = basename.replace(/\.md$/i, "");
  if (!name) {
    logService.warn(`[Claude:${sessionId}] resolveClaudeAgentName: could not extract agent name from URI '${agent.uri}'`);
    return void 0;
  }
  return name;
}
function buildDiscoveredCustomizations(discovered, mcpServers, hooks, nativePlugins, workingDirectories, userHome, sdk) {
  const visiblePlugins = [];
  const pluginAgentNames = /* @__PURE__ */ new Set();
  const pluginSkillNames = /* @__PURE__ */ new Set();
  const pluginMcpNames = /* @__PURE__ */ new Set();
  if (sdk) {
    for (const p of nativePlugins) {
      const sdkPlugin = sdk.plugins.find((s) => s.source === p.id || URI.file(s.path).fsPath === p.root.fsPath);
      if (!sdkPlugin) {
        continue;
      }
      visiblePlugins.push(p);
      const ns = sdkPlugin.name;
      const add = (set, name) => {
        set.add(name);
        if (ns) {
          set.add(`${ns}:${name}`);
        }
      };
      for (const a of p.parsed.agents) {
        add(pluginAgentNames, a.name);
      }
      for (const s of p.parsed.skills) {
        add(pluginSkillNames, s.name);
      }
      for (const m of p.parsed.mcpServers) {
        add(pluginMcpNames, m.name);
      }
    }
  } else {
    visiblePlugins.push(...nativePlugins);
  }
  const diskSkillNames = new Set(
    discovered.filter((d) => d.customization.type === CustomizationType.Skill).map((d) => d.name)
  );
  const builtinSkills = sdk ? buildSdkBuiltinSkillsContainer(sdk.commands.filter((c) => !pluginSkillNames.has(c.name)), diskSkillNames) : buildClaudeBuiltinSkillsContainer(diskSkillNames);
  const withBuiltinSkills = (list) => builtinSkills ? [...list, builtinSkills] : list;
  if (!sdk) {
    const diskAgentNames = new Set(
      discovered.filter((d) => d.customization.type === CustomizationType.Agent).map((d) => d.name)
    );
    const builtinAgents = CLAUDE_BUILTIN_AGENTS.filter((a) => a.name !== CLAUDE_SDK_DEFAULT_AGENT_NAME && !diskAgentNames.has(a.name)).map((a) => toParsedAgent({ uri: nonEditableUri("agent", a.name), name: a.name, description: a.description() }));
    return withBuiltinSkills(mapDiscoveredCustomizations([...discovered, ...builtinAgents], mcpServers, hooks, nativePlugins, workingDirectories, userHome));
  }
  const agentNames = new Set(sdk.agents.map((a) => a.name));
  const commandNames = new Set(sdk.commands.map((c) => c.name));
  const mcpByName = new Map(sdk.mcpServers.map((s) => [s.name, s]));
  const seenAgents = /* @__PURE__ */ new Set();
  const entries = [];
  for (const d of discovered) {
    if (d.customization.type === CustomizationType.Agent) {
      if (d.name === CLAUDE_SDK_DEFAULT_AGENT_NAME) {
        continue;
      }
      if (agentNames.has(d.name)) {
        entries.push(d);
        seenAgents.add(d.name);
      }
    } else if (d.customization.type === CustomizationType.Skill) {
      if (commandNames.has(d.name)) {
        entries.push(d);
      }
    } else {
      entries.push(d);
    }
  }
  for (const agent of sdk.agents) {
    if (agent.name === CLAUDE_SDK_DEFAULT_AGENT_NAME || seenAgents.has(agent.name) || pluginAgentNames.has(agent.name)) {
      continue;
    }
    entries.push(toParsedAgent({ uri: nonEditableUri("agent", agent.name), name: agent.name, ...agent.description ? { description: agent.description } : {} }));
  }
  const seenMcp = /* @__PURE__ */ new Set();
  const servers = [];
  for (const server of mcpServers) {
    const sdkServer = mcpByName.get(server.name);
    if (!sdkServer) {
      continue;
    }
    seenMcp.add(server.name);
    servers.push({ ...server, state: deriveMcpState(sdkServer.status) });
  }
  for (const [name, sdkServer] of mcpByName) {
    if (seenMcp.has(name) || pluginMcpNames.has(name)) {
      continue;
    }
    if (isHostInjectedMcpServerName(name)) {
      continue;
    }
    servers.push({ ...makeMcpServerCustomization(nonEditableUri("mcp", name), name), state: deriveMcpState(sdkServer.status) });
  }
  return withBuiltinSkills(mapDiscoveredCustomizations(entries, servers, hooks, visiblePlugins, workingDirectories, userHome));
}
const CLAUDE_CUSTOMIZATION_SUBPATHS = Object.freeze([
  "agents",
  "skills",
  "commands",
  "rules",
  "plugins",
  "CLAUDE.md",
  "settings.json",
  "settings.local.json"
]);
const _ClaudeCustomizationWatcher = class _ClaudeCustomizationWatcher extends Disposable {
  constructor(workingDirectories, userHome, fileService, logService, debounceMs = _ClaudeCustomizationWatcher.DEBOUNCE_MS) {
    super();
    const roots = distinctClaudeWorkingDirectories(Array.isArray(workingDirectories) ? workingDirectories : workingDirectories ? [workingDirectories] : []);
    const triggers = [];
    const watched = /* @__PURE__ */ new Set();
    const watch = (uri, recursive) => {
      const key = `${recursive}:${uri.toString()}`;
      if (watched.has(key)) {
        return;
      }
      watched.add(key);
      try {
        this._register(fileService.watch(uri, { recursive, excludes: [] }));
      } catch (err) {
        logService.warn(`[ClaudeCustomizationWatcher] failed to watch '${uri.toString()}': ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    const addClaudeTriggers = (base) => {
      for (const sub of CLAUDE_CUSTOMIZATION_SUBPATHS) {
        triggers.push(URI.joinPath(base, sub));
      }
    };
    const primary = roots[0];
    if (primary) {
      const projectClaude = URI.joinPath(primary, ".claude");
      watch(projectClaude, true);
      addClaudeTriggers(projectClaude);
      watch(primary, false);
      triggers.push(URI.joinPath(primary, ".mcp.json"));
    }
    for (const additional of roots.slice(1)) {
      const projectClaude = URI.joinPath(additional, ".claude");
      watch(projectClaude, true);
      triggers.push(
        URI.joinPath(projectClaude, "agents"),
        URI.joinPath(projectClaude, "skills"),
        URI.joinPath(projectClaude, "settings.json"),
        URI.joinPath(projectClaude, "settings.local.json")
      );
    }
    const userClaude = URI.joinPath(userHome, ".claude");
    watch(userClaude, true);
    addClaudeTriggers(userClaude);
    triggers.push(...claudeMemoryFiles(primary, userHome));
    this.onDidChange = Event.signal(Event.debounce(
      Event.filter(fileService.onDidFilesChange, (e) => triggers.some((t) => e.affects(t)), this._store),
      (_last, e) => e,
      debounceMs,
      void 0,
      void 0,
      void 0,
      this._store
    ));
  }
};
_ClaudeCustomizationWatcher.DEBOUNCE_MS = 300;
let ClaudeCustomizationWatcher = _ClaudeCustomizationWatcher;
export {
  CLAUDE_SDK_DEFAULT_AGENT_NAME,
  ClaudeCustomizationWatcher,
  buildDiscoveredCustomizations,
  mapDiscoveredCustomizations,
  resolveClaudeAgentName
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGN1c3RvbWl6YXRpb25zXFxjbGF1ZGVTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsT3JQYXJlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IG1ha2VNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCBwYXJzZUFnZW50RmlsZSwgdG9QYXJzZWRBZ2VudCwgdHlwZSBJUGFyc2VkQWdlbnQsIHR5cGUgSVBhcnNlZFJ1bGUsIHR5cGUgSVBhcnNlZFNraWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWdlbnRQbHVnaW5zL2NvbW1vbi9wbHVnaW5QYXJzZXJzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCB0eXBlIEFnZW50U2VsZWN0aW9uLCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgY3VzdG9taXphdGlvbklkLCB0eXBlIEFnZW50Q3VzdG9taXphdGlvbiwgdHlwZSBDaGlsZEN1c3RvbWl6YXRpb24sIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBEaXJlY3RvcnlDdXN0b21pemF0aW9uLCB0eXBlIEhvb2tDdXN0b21pemF0aW9uLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgUnVsZUN1c3RvbWl6YXRpb24sIHR5cGUgU2tpbGxDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZGtSZXNvbHZlZEN1c3RvbWl6YXRpb25zIH0gZnJvbSAnLi4vY2xhdWRlU2RrUGlwZWxpbmUuanMnO1xuaW1wb3J0IHsgaXNIb3N0SW5qZWN0ZWRNY3BTZXJ2ZXJOYW1lIH0gZnJvbSAnLi4vY2xhdWRlTWNwU2VydmVyTmFtZXMuanMnO1xuaW1wb3J0IHsgZGVyaXZlTWNwU3RhdGUgfSBmcm9tICcuL3NjYW4vY2xhdWRlTWNwU2Nhbi5qcyc7XG5pbXBvcnQgeyBjbGF1ZGVNZW1vcnlGaWxlcyB9IGZyb20gJy4vc2Nhbi9jbGF1ZGVSdWxlU2Nhbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZXNvbHZlZE5hdGl2ZVBsdWdpbiB9IGZyb20gJy4vc2Nhbi9jbGF1ZGVOYXRpdmVQbHVnaW5TY2FuLmpzJztcbmltcG9ydCB7IENMQVVERV9CVUlMVElOX0FHRU5UUywgYnVpbGRDbGF1ZGVCdWlsdGluU2tpbGxzQ29udGFpbmVyLCBidWlsZFNka0J1aWx0aW5Ta2lsbHNDb250YWluZXIgfSBmcm9tICcuL2NsYXVkZUJ1aWx0aW5Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdENsYXVkZVdvcmtpbmdEaXJlY3RvcmllcyB9IGZyb20gJy4vY2xhdWRlTXVsdGlSb290Q3VzdG9taXphdGlvbkRpc2NvdmVyeS5qcyc7XG5pbXBvcnQgeyBmaW5kTW9zdFNwZWNpZmljQ2xhdWRlV29ya3NwYWNlUm9vdCB9IGZyb20gJy4vY2xhdWRlQ3VzdG9taXphdGlvblBvbGljeS5qcyc7XG5cbi8qKlxuICogVGhlIENsYXVkZSBTREsncyBidWlsdC1pbiBkZWZhdWx0IGFnZW50LiBIaWRkZW4gZnJvbSB0aGUgcGlja2VyOlxuICogc2VsZWN0aW5nIGl0IHdvdWxkIGJlIGVxdWl2YWxlbnQgdG8gXCJubyBzZWxlY3Rpb25cIiBzaW5jZSB0aGUgU0RLXG4gKiB1c2VzIGl0IGFzIHRoZSBmYWxsYmFjayB3aGVuIGBPcHRpb25zLmFnZW50YCBpcyBvbWl0dGVkLlxuICovXG5leHBvcnQgY29uc3QgQ0xBVURFX1NES19ERUZBVUxUX0FHRU5UX05BTUUgPSAnZ2VuZXJhbC1wdXJwb3NlJztcblxuLyoqXG4gKiBTY2hlbWUgZm9yIHN5bnRoZXRpYywgbm9uLW9wZW5hYmxlIFVSSXMgdGhhdCBtYXJrIFNESy1vbmx5IGN1c3RvbWl6YXRpb25zXG4gKiB0aGUgZGlzayBzY2FuIGNvdWxkbid0IGxvY2F0ZSAoRGVjaXNpb24gRDIpLiBJdCBoYXMgbm8gZmlsZSBwcm92aWRlciwgc29cbiAqIHRoZSB3b3JrYmVuY2ggcmVuZGVycyBzdWNoIGVudHJpZXMgcmVhZC1vbmx5LiBUaGUgd3JpdGVyICh7QGxpbmsgbm9uRWRpdGFibGVVcml9KVxuICogYW5kIHJlYWRlciAoe0BsaW5rIHJlc29sdmVDbGF1ZGVBZ2VudE5hbWV9KSBzaGFyZSB0aGlzIGNvbnN0YW50IHNvIHRoZSB0d29cbiAqIG5ldmVyIGRyaWZ0LlxuICovXG5jb25zdCBDTEFVREVfSU5URVJOQUxfU0NIRU1FID0gJ2NsYXVkZS1pbnRlcm5hbCc7XG5cbmZ1bmN0aW9uIG1ha2VEaXJlY3RvcnkoYmFzZTogVVJJLCBzdWI6IHN0cmluZywgY29udGVudHM6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50IHwgQ3VzdG9taXphdGlvblR5cGUuU2tpbGwgfCBDdXN0b21pemF0aW9uVHlwZS5SdWxlIHwgQ3VzdG9taXphdGlvblR5cGUuSG9vaywgY2hpbGRyZW46IHJlYWRvbmx5IChBZ2VudEN1c3RvbWl6YXRpb24gfCBTa2lsbEN1c3RvbWl6YXRpb24gfCBSdWxlQ3VzdG9taXphdGlvbiB8IEhvb2tDdXN0b21pemF0aW9uKVtdKTogRGlyZWN0b3J5Q3VzdG9taXphdGlvbiB7XG5cdGNvbnN0IHVyaSA9IFVSSS5qb2luUGF0aChiYXNlLCAnLmNsYXVkZScsIHN1YikudG9TdHJpbmcoKTtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5EaXJlY3RvcnksXG5cdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkpLFxuXHRcdHVyaSxcblx0XHRuYW1lOiBzdWIsXG5cdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRjb250ZW50cyxcblx0XHR3cml0YWJsZTogdHJ1ZSxcblx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdGNoaWxkcmVuOiBbLi4uY2hpbGRyZW5dLFxuXHR9O1xufVxuXG4vKipcbiAqIFByb2plY3RzIGEgcmVzb2x2ZWQgQ2xhdWRlLW5hdGl2ZSBwbHVnaW4gaW50byBhIHRvcC1sZXZlbFxuICoge0BsaW5rIFBsdWdpbkN1c3RvbWl6YXRpb259IChpdHMgb3duIHByb3RvY29sIGNvbnRhaW5lciB0eXBlIFx1MjAxNCAqbm90KiBhXG4gKiBwZXItc2NvcGUge0BsaW5rIERpcmVjdG9yeUN1c3RvbWl6YXRpb259LCBtaXJyb3JpbmcgaG93IE1DUCBzZXJ2ZXJzIGFyZVxuICogdG9wLWxldmVsKS4gVGhlIGNvbnRhaW5lciBgdXJpYCBpcyB0aGUgcmVhbCBwbHVnaW4gcm9vdCBkaXJlY3Rvcnk7IGl0c1xuICogYG5hbWVgIGlzIHRoZSBgZW5hYmxlZFBsdWdpbnNgIGlkICh0aGUgbWFuaWZlc3QgY2FycmllcyBubyBkaXNwbGF5IG5hbWVcbiAqIHRocm91Z2gge0BsaW5rIElSZXNvbHZlZE5hdGl2ZVBsdWdpbn0pLiBDaGlsZHJlbiBhcmUgdGhlIHBsdWdpbidzIGJ1bmRsZWRcbiAqIGNvbXBvbmVudHMsIGRlZHVwZWQgYnkgaWQgKGEgcGx1Z2luJ3MgaG9va3Mgc2hhcmUgb25lIHNldHRpbmdzLWZpbGVcbiAqIGN1c3RvbWl6YXRpb24sIHNvIHRoZSBncm91cHMgd291bGQgb3RoZXJ3aXNlIHJlcGVhdCkuXG4gKi9cbmZ1bmN0aW9uIG1ha2VQbHVnaW4ocGx1Z2luOiBJUmVzb2x2ZWROYXRpdmVQbHVnaW4pOiBQbHVnaW5DdXN0b21pemF0aW9uIHtcblx0Y29uc3QgdXJpID0gcGx1Z2luLnJvb3QudG9TdHJpbmcoKTtcblx0Y29uc3QgY2hpbGRyZW46IENoaWxkQ3VzdG9taXphdGlvbltdID0gW107XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgcHVzaCA9IChjaGlsZDogQ2hpbGRDdXN0b21pemF0aW9uKSA9PiB7XG5cdFx0aWYgKCFzZWVuLmhhcyhjaGlsZC5pZCkpIHtcblx0XHRcdHNlZW4uYWRkKGNoaWxkLmlkKTtcblx0XHRcdGNoaWxkcmVuLnB1c2goY2hpbGQpO1xuXHRcdH1cblx0fTtcblx0Zm9yIChjb25zdCBhZ2VudCBvZiBwbHVnaW4ucGFyc2VkLmFnZW50cykgeyBwdXNoKGFnZW50LmN1c3RvbWl6YXRpb24pOyB9XG5cdGZvciAoY29uc3Qgc2tpbGwgb2YgcGx1Z2luLnBhcnNlZC5za2lsbHMpIHsgcHVzaChza2lsbC5jdXN0b21pemF0aW9uKTsgfVxuXHRmb3IgKGNvbnN0IHJ1bGUgb2YgcGx1Z2luLnBhcnNlZC5pbnN0cnVjdGlvbnMpIHsgcHVzaChydWxlLmN1c3RvbWl6YXRpb24pOyB9XG5cdGZvciAoY29uc3QgaG9vayBvZiBwbHVnaW4ucGFyc2VkLmhvb2tzKSB7IHB1c2goaG9vay5jdXN0b21pemF0aW9uKTsgfVxuXHRmb3IgKGNvbnN0IG1jcCBvZiBwbHVnaW4ucGFyc2VkLm1jcFNlcnZlcnMpIHsgcHVzaChtY3AuY3VzdG9taXphdGlvbik7IH1cblx0cmV0dXJuIHtcblx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0aWQ6IGN1c3RvbWl6YXRpb25JZCh1cmkpLFxuXHRcdHVyaSxcblx0XHRuYW1lOiBwbHVnaW4uaWQsXG5cdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRjaGlsZHJlbixcblx0fTtcbn1cblxuLyoqXG4gKiBBIFVSSS1iYWNrZWQgc2NvcGUgYnVja2V0LiBUaGUgYmFzZSBVUkkgZGlzdGluZ3Vpc2hlcyB3b3Jrc3BhY2UgQSxcbiAqIHdvcmtzcGFjZSBCLCBhbmQgdXNlciBzY29wZSB3aXRob3V0IGEgc2VwYXJhdGUgc2NvcGUgZW51bS5cbiAqL1xuaW50ZXJmYWNlIElDdXN0b21pemF0aW9uQnVja2V0IHtcblx0cmVhZG9ubHkgYmFzZTogVVJJO1xuXHRyZWFkb25seSBhZ2VudHM6IEFnZW50Q3VzdG9taXphdGlvbltdO1xuXHRyZWFkb25seSBza2lsbHM6IFNraWxsQ3VzdG9taXphdGlvbltdO1xuXHRyZWFkb25seSBydWxlczogUnVsZUN1c3RvbWl6YXRpb25bXTtcblx0cmVhZG9ubHkgaG9va3M6IEhvb2tDdXN0b21pemF0aW9uW107XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUJ1Y2tldChiYXNlOiBVUkkpOiBJQ3VzdG9taXphdGlvbkJ1Y2tldCB7XG5cdHJldHVybiB7IGJhc2UsIGFnZW50czogW10sIHNraWxsczogW10sIHJ1bGVzOiBbXSwgaG9va3M6IFtdIH07XG59XG5cbmZ1bmN0aW9uIGZpbmRDdXN0b21pemF0aW9uQnVja2V0KHVyaTogVVJJLCB3b3Jrc3BhY2VCdWNrZXRzOiByZWFkb25seSBJQ3VzdG9taXphdGlvbkJ1Y2tldFtdLCB1c2VyQnVja2V0OiBJQ3VzdG9taXphdGlvbkJ1Y2tldCk6IElDdXN0b21pemF0aW9uQnVja2V0IHtcblx0Y29uc3Qgcm9vdCA9IGZpbmRNb3N0U3BlY2lmaWNDbGF1ZGVXb3Jrc3BhY2VSb290KHVyaSwgd29ya3NwYWNlQnVja2V0cy5tYXAoYnVja2V0ID0+IGJ1Y2tldC5iYXNlKSk7XG5cdGlmICh3b3Jrc3BhY2VCdWNrZXRzLmxlbmd0aCA+IDEgJiYgdXJpLnNjaGVtZSA9PT0gdXNlckJ1Y2tldC5iYXNlLnNjaGVtZSAmJiBpc0VxdWFsT3JQYXJlbnQodXJpLCB1c2VyQnVja2V0LmJhc2UpICYmICghcm9vdCB8fCB1c2VyQnVja2V0LmJhc2UucGF0aC5sZW5ndGggPiByb290LnBhdGgubGVuZ3RoKSkge1xuXHRcdHJldHVybiB1c2VyQnVja2V0O1xuXHR9XG5cdHJldHVybiB3b3Jrc3BhY2VCdWNrZXRzLmZpbmQoYnVja2V0ID0+IGJ1Y2tldC5iYXNlID09PSByb290KSA/PyB1c2VyQnVja2V0O1xufVxuXG4vKipcbiAqIE1hcHMgdGhlIGRpc2stZGlzY292ZXJlZCBjdXN0b21pemF0aW9ucyBpbnRvIHRoZSBwcm90b2NvbFxuICoge0BsaW5rIEN1c3RvbWl6YXRpb259IHN1cmZhY2UuIEFnZW50cywgc2tpbGxzIGFuZCBydWxlcyBhcmUgd3JhcHBlZCBpblxuICoge0BsaW5rIERpcmVjdG9yeUN1c3RvbWl6YXRpb259IGNvbnRhaW5lcnMgKHRoZSBwcm90b2NvbCdzIGBDdXN0b21pemF0aW9uYFxuICogdW5pb24gaGFzIG5vIGJhcmUgYWdlbnQvc2tpbGwvcnVsZSBtZW1iZXIpLCBvbmUgY29udGFpbmVyIHBlciAoc2NvcGUsIGtpbmQpOlxuICogdGhlIGNvbnRhaW5lciBgdXJpYCBpcyB0aGUgcmVhbCBgPHNjb3BlPi8uY2xhdWRlLzxzdWI+YCBkaXJlY3Rvcnkgc28gdGhlXG4gKiB3b3JrYmVuY2ggZGVyaXZlcyB0aGUgXCJXb3Jrc3BhY2VcIiB2cyBcIlVzZXJcIiBsYWJlbCBmcm9tIGl0IChtaXJyb3JpbmdcbiAqIENvcGlsb3RBZ2VudCkuIEVhY2ggY2hpbGQgY2FycmllcyBpdHMgcmVhbCBzb3VyY2UtZmlsZSBgdXJpYCBzbyB0aGVcbiAqIHdvcmtiZW5jaCBjYW4gb3BlbiBpdCBmb3IgZWRpdGluZy4gTUNQIHNlcnZlcnMgYXJlIHRvcC1sZXZlbCBlbnRyaWVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwRGlzY292ZXJlZEN1c3RvbWl6YXRpb25zKFxuXHRkaXNjb3ZlcmVkOiByZWFkb25seSAoSVBhcnNlZEFnZW50IHwgSVBhcnNlZFNraWxsIHwgSVBhcnNlZFJ1bGUpW10sXG5cdG1jcFNlcnZlcnM6IHJlYWRvbmx5IE1jcFNlcnZlckN1c3RvbWl6YXRpb25bXSxcblx0aG9va3M6IHJlYWRvbmx5IEhvb2tDdXN0b21pemF0aW9uW10sXG5cdG5hdGl2ZVBsdWdpbnM6IHJlYWRvbmx5IElSZXNvbHZlZE5hdGl2ZVBsdWdpbltdLFxuXHR3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgVVJJIHwgdW5kZWZpbmVkLFxuXHR1c2VySG9tZTogVVJJLFxuKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHtcblx0Y29uc3Qgcm9vdHMgPSBkaXN0aW5jdENsYXVkZVdvcmtpbmdEaXJlY3RvcmllcyhBcnJheS5pc0FycmF5KHdvcmtpbmdEaXJlY3RvcmllcykgPyB3b3JraW5nRGlyZWN0b3JpZXMgOiB3b3JraW5nRGlyZWN0b3JpZXMgPyBbd29ya2luZ0RpcmVjdG9yaWVzXSA6IFtdKTtcblx0Y29uc3Qgd29ya3NwYWNlQnVja2V0cyA9IHJvb3RzLm1hcChjcmVhdGVCdWNrZXQpO1xuXHRjb25zdCB1c2VyQnVja2V0ID0gY3JlYXRlQnVja2V0KHVzZXJIb21lKTtcblx0Zm9yIChjb25zdCBkIG9mIGRpc2NvdmVyZWQpIHtcblx0XHRjb25zdCBidWNrZXQgPSBmaW5kQ3VzdG9taXphdGlvbkJ1Y2tldChkLnVyaSwgd29ya3NwYWNlQnVja2V0cywgdXNlckJ1Y2tldCk7XG5cdFx0aWYgKGQuY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCkge1xuXHRcdFx0YnVja2V0LmFnZW50cy5wdXNoKGQuY3VzdG9taXphdGlvbik7XG5cdFx0fSBlbHNlIGlmIChkLmN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuU2tpbGwpIHtcblx0XHRcdGJ1Y2tldC5za2lsbHMucHVzaChkLmN1c3RvbWl6YXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRidWNrZXQucnVsZXMucHVzaChkLmN1c3RvbWl6YXRpb24pO1xuXHRcdH1cblx0fVxuXHQvLyBIb29rcyBhcnJpdmUgYWxyZWFkeSBwcm9qZWN0ZWQgKG9uZSBwZXIgZGVjbGFyaW5nIHNldHRpbmdzIGZpbGUpOyB0aGV5XG5cdC8vIGNhcnJ5IG5vIGBJUGFyc2VkKmAgd3JhcHBlciwgc28gYXR0cmlidXRlIHRoZW0gdG8gc2NvcGUgdmlhIHRoZWlyIHNvdXJjZVxuXHQvLyBzZXR0aW5ncy1maWxlIHVyaS5cblx0Zm9yIChjb25zdCBob29rIG9mIGhvb2tzKSB7XG5cdFx0ZmluZEN1c3RvbWl6YXRpb25CdWNrZXQoVVJJLnBhcnNlKGhvb2sudXJpKSwgd29ya3NwYWNlQnVja2V0cywgdXNlckJ1Y2tldCkuaG9va3MucHVzaChob29rKTtcblx0fVxuXG5cdGNvbnN0IHJlc3VsdDogQ3VzdG9taXphdGlvbltdID0gW107XG5cdGZvciAoY29uc3QgYnVja2V0IG9mIFsuLi53b3Jrc3BhY2VCdWNrZXRzLCB1c2VyQnVja2V0XSkge1xuXHRcdGlmIChidWNrZXQuYWdlbnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5wdXNoKG1ha2VEaXJlY3RvcnkoYnVja2V0LmJhc2UsICdhZ2VudHMnLCBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgYnVja2V0LmFnZW50cykpO1xuXHRcdH1cblx0XHRpZiAoYnVja2V0LnNraWxscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlRGlyZWN0b3J5KGJ1Y2tldC5iYXNlLCAnc2tpbGxzJywgQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIGJ1Y2tldC5za2lsbHMpKTtcblx0XHR9XG5cdFx0aWYgKGJ1Y2tldC5ydWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlRGlyZWN0b3J5KGJ1Y2tldC5iYXNlLCAncnVsZXMnLCBDdXN0b21pemF0aW9uVHlwZS5SdWxlLCBidWNrZXQucnVsZXMpKTtcblx0XHR9XG5cdFx0aWYgKGJ1Y2tldC5ob29rcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN1bHQucHVzaChtYWtlRGlyZWN0b3J5KGJ1Y2tldC5iYXNlLCAnaG9va3MnLCBDdXN0b21pemF0aW9uVHlwZS5Ib29rLCBidWNrZXQuaG9va3MpKTtcblx0XHR9XG5cdH1cblxuXHQvLyBOYXRpdmUgcGx1Z2lucyBhcmUgdG9wLWxldmVsIGVudHJpZXMgKGxpa2UgTUNQIHNlcnZlcnMpLCBlYWNoIGNhcnJ5aW5nXG5cdC8vIGl0cyBidW5kbGVkIGNvbXBvbmVudHMgYXMgY2hpbGRyZW4uXG5cdGZvciAoY29uc3QgcGx1Z2luIG9mIG5hdGl2ZVBsdWdpbnMpIHtcblx0XHRyZXN1bHQucHVzaChtYWtlUGx1Z2luKHBsdWdpbikpO1xuXHR9XG5cblx0cmVzdWx0LnB1c2goLi4ubWNwU2VydmVycyk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogQSBzeW50aGV0aWMsIG5vbi1vcGVuYWJsZSBVUkkgdGhhdCBtYXJrcyBhbiBTREstb25seSBjdXN0b21pemF0aW9uIHRoZVxuICogZGlzayBzY2FuIGNvdWxkbid0IGxvY2F0ZS4gVGhlIGBjbGF1ZGUtaW50ZXJuYWw6YCBzY2hlbWUgaGFzIG5vIGZpbGVcbiAqIHByb3ZpZGVyLCBzbyB0aGUgd29ya2JlbmNoIHJlbmRlcnMgdGhlIGVudHJ5IHJlYWQtb25seSAoRGVjaXNpb24gRDIpLlxuICovXG5mdW5jdGlvbiBub25FZGl0YWJsZVVyaShraW5kOiBzdHJpbmcsIG5hbWU6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogQ0xBVURFX0lOVEVSTkFMX1NDSEVNRSwgcGF0aDogYC8ke2tpbmR9LyR7ZW5jb2RlVVJJQ29tcG9uZW50KG5hbWUpfWAgfSk7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYW4ge0BsaW5rIEFnZW50U2VsZWN0aW9ufSBVUkkgdG8gdGhlIFNESyBhZ2VudCBuYW1lIHRoZSBTREtcbiAqIGV4cGVjdHMgb24gYE9wdGlvbnMuYWdlbnRgLiB7QGxpbmsgQWdlbnRTZWxlY3Rpb259IGNhcnJpZXMgb25seSBhIGB1cmlgLFxuICogc28gdGhlIG5hbWUgaXMgcmVjb3ZlcmVkIGZyb20gdGhlIHNvdXJjZTpcbiAqXG4gKiAtIEEgYGNsYXVkZS1pbnRlcm5hbDpgIFVSSSBcdTIwMTQgYW4gU0RLLW9ubHkgYWdlbnQgdGhlIGRpc2sgc2NhbiBjb3VsZG4ndFxuICogICBsb2NhdGUgKERlY2lzaW9uIEQyKTsgdGhlIG5hbWUgaXMgdGhlIHBhdGggc2VnbWVudCBlbmNvZGVkIGJ5XG4gKiAgIHtAbGluayBub25FZGl0YWJsZVVyaX0gKHRoaXMgaXMgaXRzIGludmVyc2UpLlxuICogLSBBIHJlYWwgYGZpbGU6YCBhZ2VudCBcdTIwMTQgdGhlIFNESyBrZXlzIGFnZW50cyBieSB0aGVpciBmcm9udG1hdHRlclxuICogICBgbmFtZWAsIHdoaWNoIG1heSBkaWZmZXIgZnJvbSB0aGUgZmlsZW5hbWUsIHNvIGl0IGlzIHBhcnNlZCAoZmFsbGluZ1xuICogICBiYWNrIHRvIHRoZSBiYXNlbmFtZSB3aGVuIHRoZSBmaWxlIGNhbid0IGJlIHJlYWQpLlxuICpcbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBubyBhZ2VudCBpcyBzZWxlY3RlZCAob3IgdGhlIG5hbWUgY2FuJ3QgYmVcbiAqIHJlY292ZXJlZCkgc28gdGhlIFNESyBmYWxscyBiYWNrIHRvIGl0cyBkZWZhdWx0IChubyBgLS1hZ2VudGAgZmxhZykuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZXNvbHZlQ2xhdWRlQWdlbnROYW1lKFxuXHRhZ2VudDogQWdlbnRTZWxlY3Rpb24gfCB1bmRlZmluZWQsXG5cdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRzZXNzaW9uSWQ6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdGlmICghYWdlbnQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShhZ2VudC51cmkpO1xuXG5cdC8vIFNESy1vbmx5IChub24tZWRpdGFibGUpIGFnZW50cyBlbmNvZGUgdGhlIG5hbWUgaW4gdGhlIHBhdGg6XG5cdC8vIGBjbGF1ZGUtaW50ZXJuYWw6L2FnZW50LzxlbmNvZGVkLW5hbWU+YCAoaW52ZXJzZSBvZiBub25FZGl0YWJsZVVyaSkuXG5cdGlmICh1cmkuc2NoZW1lID09PSBDTEFVREVfSU5URVJOQUxfU0NIRU1FKSB7XG5cdFx0Y29uc3QgbGFzdCA9IHVyaS5wYXRoLnNwbGl0KCcvJykucG9wKCkgPz8gJyc7XG5cdFx0Y29uc3QgbmFtZSA9IGxhc3QgPyBkZWNvZGVVUklDb21wb25lbnQobGFzdCkgOiAnJztcblx0XHRpZiAoIW5hbWUpIHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3Nlc3Npb25JZH1dIHJlc29sdmVDbGF1ZGVBZ2VudE5hbWU6IGNvdWxkIG5vdCBleHRyYWN0IGFnZW50IG5hbWUgZnJvbSBVUkkgJyR7YWdlbnQudXJpfSdgKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBuYW1lO1xuXHR9XG5cblx0Ly8gUmVhbCBvbi1kaXNrIGFnZW50OiB0aGUgU0RLIGlkZW50aWZpZXMgaXQgYnkgaXRzIGZyb250bWF0dGVyIGBuYW1lYCxcblx0Ly8gd2hpY2ggdGhlIGZpbGVuYW1lIG5lZWQgbm90IG1hdGNoLlxuXHR0cnkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IGF3YWl0IHBhcnNlQWdlbnRGaWxlKHVyaSwgZmlsZVNlcnZpY2UpO1xuXHRcdGlmIChwYXJzZWQubmFtZSkge1xuXHRcdFx0cmV0dXJuIHBhcnNlZC5uYW1lO1xuXHRcdH1cblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0bG9nU2VydmljZS53YXJuKGBbQ2xhdWRlOiR7c2Vzc2lvbklkfV0gcmVzb2x2ZUNsYXVkZUFnZW50TmFtZTogZmFpbGVkIHRvIHBhcnNlIGFnZW50IGZpbGUgJyR7YWdlbnQudXJpfScsIGZhbGxpbmcgYmFjayB0byBiYXNlbmFtZWAsIGVycik7XG5cdH1cblxuXHRjb25zdCBiYXNlbmFtZSA9IHVyaS5wYXRoLnNwbGl0KCcvJykucG9wKCkgPz8gJyc7XG5cdGNvbnN0IG5hbWUgPSBiYXNlbmFtZS5yZXBsYWNlKC9cXC5tZCQvaSwgJycpO1xuXHRpZiAoIW5hbWUpIHtcblx0XHRsb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGU6JHtzZXNzaW9uSWR9XSByZXNvbHZlQ2xhdWRlQWdlbnROYW1lOiBjb3VsZCBub3QgZXh0cmFjdCBhZ2VudCBuYW1lIGZyb20gVVJJICcke2FnZW50LnVyaX0nYCk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gbmFtZTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIGRpc2NvdmVyZWQtY3VzdG9taXphdGlvbiBwcm9qZWN0aW9uIGZvciBhIHNlc3Npb24sIGFwcGx5aW5nXG4gKiB0aGUgbGl2ZSBTREsgc25hcHNob3QgYXMgYSBwb3N0LW1hdGVyaWFsaXplIGZpbHRlci5cbiAqXG4gKiAtIGBzZGsgPT09IHVuZGVmaW5lZGAgKHByb3Zpc2lvbmFsKTogdGhlIGZ1bGwgZGlzay1kaXNjb3ZlcmVkIHNldCBpc1xuICogICByZXR1cm5lZCB1bmZpbHRlcmVkIFx1MjAxNCBubyBsaXZlIHNlc3Npb24geWV0IHRvIHNheSB3aGF0J3MgYWN0aXZlLlxuICogLSBgc2RrYCBwcmVzZW50IChtYXRlcmlhbGl6ZWQpOiBkaXNrIGVudHJpZXMgYXJlIGtlcHQgb25seSB3aGVuIHRoZSBsaXZlXG4gKiAgIHNlc3Npb24ga25vd3MgdGhlbSAobWF0Y2hlZCBieSBuYW1lLCBwZXIgdHlwZSBcdTIwMTQgYWdlbnRzIGFnYWluc3QgdGhlIFNES1xuICogICBhZ2VudCBzZXQ7IHNraWxscyBhZ2FpbnN0IHRoZSBTREsgY29tbWFuZCBzZXQ7IE1DUCBhZ2FpbnN0IHRoZSBTREtcbiAqICAgc2VydmVyIHNldCwgZW5yaWNoZWQgd2l0aCBsaXZlIHN0YXRlKS4gU0RLLWtub3duIEFHRU5UUyBhbmQgTUNQIHNlcnZlcnNcbiAqICAgd2l0aCBubyBtYXRjaGluZyBkaXNrIGZpbGUgYXJlIHN1cmZhY2VkIGFzIE5PTi1FRElUQUJMRSBlbnRyaWVzXG4gKiAgIChgY2xhdWRlLWludGVybmFsOmAgXHUyMDE0IERlY2lzaW9uIEQyKTogYSBub24tZWRpdGFibGUgYWdlbnQgaXMgc3RpbGxcbiAqICAgc2VsZWN0YWJsZSBhbmQgYSBub24tZWRpdGFibGUgTUNQIHNlcnZlciBzdGlsbCBzaG93cyBzdGF0dXMuIFNESy1vbmx5XG4gKiAgIFNLSUxMUyAoQ2xhdWRlJ3MgYnVpbHQtaW4gc2xhc2ggY29tbWFuZHMgbGlrZSBgL2luaXRgKSBhcmUgTk9UIG1peGVkIGluXG4gKiAgIGFtb25nIHRoZSBlZGl0YWJsZSBkaXNrIHNraWxscyBcdTIwMTQgaW5zdGVhZCB0aGV5IGFwcGVhciwgcmVhZC1vbmx5LCBpbiB0aGVcbiAqICAgc2VwYXJhdGUgXCJCdWlsdC1pblwiIHNraWxscyBjb250YWluZXIgdGhpcyBmdW5jdGlvbiBhcHBlbmRzLiBUaGUgU0RLJ3NcbiAqICAgYnVpbHQtaW4gZGVmYXVsdCBhZ2VudCBpcyBoaWRkZW4uIFJ1bGVzIChDTEFVREUubWQgKyBgLmNsYXVkZS9ydWxlc2ApXG4gKiAgIGhhdmUgbm8gU0RLIGNvdW50ZXJwYXJ0IGFuZCBhcmUgYWx3YXlzIGtlcHQuXG4gKlxuICogVGhlIFwiQnVpbHQtaW5cIiBzdXJmYWNpbmcgZm9yIEJPVEggYWdlbnRzIGFuZCBza2lsbHMgaXMgZGVjaWRlZCBoZXJlICh0aGVcbiAqIHNpbmdsZSBwbGFjZSB0aGF0IGhhcyB0aGUgZGlzayBzZXQgYW5kIHRoZSBvcHRpb25hbCBgc2RrYCBzbmFwc2hvdCk6IGJ1aWx0LWluXG4gKiBhZ2VudHMgbWVyZ2UgaW50byB0aGUgYWdlbnQgc2V0IChzZWxlY3RhYmxlLCBgY2xhdWRlLWludGVybmFsOmApOyBidWlsdC1pblxuICogc2tpbGxzIGFyZSBhIHNlcGFyYXRlIHJlYWQtb25seSBjb250YWluZXIgYXBwZW5kZWQgdG8gdGhlIHJlc3VsdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkRGlzY292ZXJlZEN1c3RvbWl6YXRpb25zKFxuXHRkaXNjb3ZlcmVkOiByZWFkb25seSAoSVBhcnNlZEFnZW50IHwgSVBhcnNlZFNraWxsIHwgSVBhcnNlZFJ1bGUpW10sXG5cdG1jcFNlcnZlcnM6IHJlYWRvbmx5IE1jcFNlcnZlckN1c3RvbWl6YXRpb25bXSxcblx0aG9va3M6IHJlYWRvbmx5IEhvb2tDdXN0b21pemF0aW9uW10sXG5cdG5hdGl2ZVBsdWdpbnM6IHJlYWRvbmx5IElSZXNvbHZlZE5hdGl2ZVBsdWdpbltdLFxuXHR3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IFVSSVtdIHwgVVJJIHwgdW5kZWZpbmVkLFxuXHR1c2VySG9tZTogVVJJLFxuXHRzZGs6IElTZGtSZXNvbHZlZEN1c3RvbWl6YXRpb25zIHwgdW5kZWZpbmVkLFxuKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHtcblx0Ly8gTmF0aXZlIHBsdWdpbnMgdGhlIGxpdmUgc2Vzc2lvbiBhY3R1YWxseSBsb2FkZWQgXHUyMTkyIHN1cmZhY2VkIGFzIHRvcC1sZXZlbFxuXHQvLyBjb250YWluZXJzIChwYXNzZWQgdG8gdGhlIG1hcHBlciBhdCB0aGUgZW5kKS4gVGhlIFNESyBgaW5pdC5wbHVnaW5zYFxuXHQvLyByZXBvcnRzIGVhY2ggbG9hZGVkIHBsdWdpbidzIGBzb3VyY2VgIChpdHMgYDxwbHVnaW4+QDxtYXJrZXRwbGFjZT5gIGlkKVxuXHQvLyBhbmQgYSBgcGF0aGAuIE1hdGNoIG9uIGBzb3VyY2VgIGFnYWluc3QgdGhlIHJlc29sdmVkIHBsdWdpbiBpZCBmaXJzdCBcdTIwMTQgaXRcblx0Ly8gaXMgZXhhY3QgYW5kIHN0YWJsZSBcdTIwMTQgYW5kIGZhbGwgYmFjayB0byBhIG5vcm1hbGl6ZWQgYHBhdGhgIG1hdGNoIChvbGRlclxuXHQvLyBTREtzIHdpdGhvdXQgYHNvdXJjZWApLiBUaGUgYHBhdGhgIGFsb25lIGlzIHVucmVsaWFibGU6IGZvciBhXG5cdC8vIHdvcmtzcGFjZS1gbG9jYWxgLXNjb3BlZCBwbHVnaW4gdGhlIFNESyBjYW4gcmVwb3J0IGEgbm9uLWNhY2hlIHBhdGggdGhhdFxuXHQvLyBuZXZlciBtYXRjaGVzIHRoZSByZXNvbHZlZCByb290LiBUaGUgcGx1Z2luIGlzIHRoZSBhdG9taWMgZmlsdGVyaW5nIHVuaXQuXG5cdC8vXG5cdC8vIEEgcGx1Z2luJ3MgYnVuZGxlZCBjb21wb25lbnRzIGFyZSBBTFNPIHJlcG9ydGVkIGJ5IHRoZSBsaXZlIFNESyBhc1xuXHQvLyBhZ2VudHMgLyBjb21tYW5kcyAvIE1DUCBzZXJ2ZXJzLiBDb2xsZWN0IGVhY2ggc3VyZmFjZWQgcGx1Z2luJ3Mgb3duXG5cdC8vIHBhcnNlZCBjb21wb25lbnQgbmFtZXMgc28gdGhvc2UgU0RLIGVudHJpZXMgYXJlIHN1cHByZXNzZWQgZnJvbSB0aGVcblx0Ly8gc3RhbmRhbG9uZSBmYWxsYmFja3MgYmVsb3cgXHUyMDE0IGVhY2ggY29tcG9uZW50IHRoZW4gYXBwZWFycyBvbmNlLCB1bmRlciBpdHNcblx0Ly8gcGx1Z2luIGNvbnRhaW5lciwgbm90IGFsc28gbG9vc2UgaW4gdGhlIHBlci1zY29wZSBsaXN0cyAoRGVjaXNpb24gUEItMTApLlxuXHQvLyBUaGUgU0RLIG5hbWVzIHBsdWdpbiBjb21wb25lbnRzIGluY29uc2lzdGVudGx5IChhZ2VudHMgbmFtZXNwYWNlZCBhc1xuXHQvLyBgPHBsdWdpbj46PG5hbWU+YCwgc2tpbGxzIHVzdWFsbHkgYmFyZSksIHNvIGJvdGggZm9ybXMgYXJlIHJlZ2lzdGVyZWQuXG5cdC8vIE9ubHkgKnN1cmZhY2VkKiBwbHVnaW5zIGNvbnRyaWJ1dGUsIHNvIGEgbG9hZGVkLWJ1dC11bnN1cmZhY2VkIHBsdWdpbidzXG5cdC8vIGNvbXBvbmVudHMgYXJlIG5ldmVyIHNpbGVudGx5IGRyb3BwZWQuIEEgc2luZ2xlIHBhc3MgbWF0Y2hlcyBlYWNoIG5hdGl2ZVxuXHQvLyBwbHVnaW4gdG8gaXRzIFNESyBlbnRyeSwgYnVpbGRpbmcgdGhlIHZpc2libGUgc2V0IGFuZCB0aGUgc3VwcHJlc3Npb25cblx0Ly8gbmFtZSBzZXRzIHRvZ2V0aGVyIChubyBzZWNvbmQgYGZpbmRgKS5cblx0Y29uc3QgdmlzaWJsZVBsdWdpbnM6IElSZXNvbHZlZE5hdGl2ZVBsdWdpbltdID0gW107XG5cdGNvbnN0IHBsdWdpbkFnZW50TmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgcGx1Z2luU2tpbGxOYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBwbHVnaW5NY3BOYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRpZiAoc2RrKSB7XG5cdFx0Zm9yIChjb25zdCBwIG9mIG5hdGl2ZVBsdWdpbnMpIHtcblx0XHRcdGNvbnN0IHNka1BsdWdpbiA9IHNkay5wbHVnaW5zLmZpbmQocyA9PiBzLnNvdXJjZSA9PT0gcC5pZCB8fCBVUkkuZmlsZShzLnBhdGgpLmZzUGF0aCA9PT0gcC5yb290LmZzUGF0aCk7XG5cdFx0XHRpZiAoIXNka1BsdWdpbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHZpc2libGVQbHVnaW5zLnB1c2gocCk7XG5cdFx0XHRjb25zdCBucyA9IHNka1BsdWdpbi5uYW1lO1xuXHRcdFx0Y29uc3QgYWRkID0gKHNldDogU2V0PHN0cmluZz4sIG5hbWU6IHN0cmluZykgPT4geyBzZXQuYWRkKG5hbWUpOyBpZiAobnMpIHsgc2V0LmFkZChgJHtuc306JHtuYW1lfWApOyB9IH07XG5cdFx0XHRmb3IgKGNvbnN0IGEgb2YgcC5wYXJzZWQuYWdlbnRzKSB7IGFkZChwbHVnaW5BZ2VudE5hbWVzLCBhLm5hbWUpOyB9XG5cdFx0XHRmb3IgKGNvbnN0IHMgb2YgcC5wYXJzZWQuc2tpbGxzKSB7IGFkZChwbHVnaW5Ta2lsbE5hbWVzLCBzLm5hbWUpOyB9XG5cdFx0XHRmb3IgKGNvbnN0IG0gb2YgcC5wYXJzZWQubWNwU2VydmVycykgeyBhZGQocGx1Z2luTWNwTmFtZXMsIG0ubmFtZSk7IH1cblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0dmlzaWJsZVBsdWdpbnMucHVzaCguLi5uYXRpdmVQbHVnaW5zKTtcblx0fVxuXG5cdC8vIFRoZSByZWFkLW9ubHkgXCJCdWlsdC1pblwiIHNraWxscyBjb250YWluZXI6IHByZS1tYXRlcmlhbGl6ZSB0aGUgY3VyYXRlZFxuXHQvLyBsaXN0LCBwb3N0LW1hdGVyaWFsaXplIHRoZSBsaXZlIFNESyBjb21tYW5kIHNldCBtaW51cyB0aGUgZGlzayBza2lsbHNcblx0Ly8gKGFuZCBtaW51cyBwbHVnaW4tY29udHJpYnV0ZWQgc2tpbGxzLCB3aGljaCBiZWxvbmcgdG8gYSBwbHVnaW4gY29udGFpbmVyKS5cblx0Ly8gQXBwZW5kZWQgdG8gd2hpY2hldmVyIHByb2plY3Rpb24gaXMgcmV0dXJuZWQgYmVsb3cgc28gdGhlIFNESy12cy1jdXJhdGVkXG5cdC8vIGRlY2lzaW9uIGZvciBidWlsdC1pbiBza2lsbHMgc2l0cyBuZXh0IHRvIHRoZSBvbmUgZm9yIGJ1aWx0LWluIGFnZW50cy5cblx0Y29uc3QgZGlza1NraWxsTmFtZXMgPSBuZXcgU2V0KFxuXHRcdGRpc2NvdmVyZWQuZmlsdGVyKGQgPT4gZC5jdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsKS5tYXAoZCA9PiBkLm5hbWUpXG5cdCk7XG5cdGNvbnN0IGJ1aWx0aW5Ta2lsbHMgPSBzZGtcblx0XHQ/IGJ1aWxkU2RrQnVpbHRpblNraWxsc0NvbnRhaW5lcihzZGsuY29tbWFuZHMuZmlsdGVyKGMgPT4gIXBsdWdpblNraWxsTmFtZXMuaGFzKGMubmFtZSkpLCBkaXNrU2tpbGxOYW1lcylcblx0XHQ6IGJ1aWxkQ2xhdWRlQnVpbHRpblNraWxsc0NvbnRhaW5lcihkaXNrU2tpbGxOYW1lcyk7XG5cdGNvbnN0IHdpdGhCdWlsdGluU2tpbGxzID0gKGxpc3Q6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSA9PlxuXHRcdGJ1aWx0aW5Ta2lsbHMgPyBbLi4ubGlzdCwgYnVpbHRpblNraWxsc10gOiBsaXN0O1xuXG5cdGlmICghc2RrKSB7XG5cdFx0Ly8gUHJlLW1hdGVyaWFsaXplIHRoZXJlIGlzIG5vIGxpdmUgYWdlbnQgc2V0LCBzbyBzZWVkIHRoZSBjdXJhdGVkXG5cdFx0Ly8gYnVpbHQtaW4gYWdlbnRzIGFsb25nc2lkZSB0aGUgZGlzayBhZ2VudHMuIFRoZXkgdXNlIHRoZSBzYW1lXG5cdFx0Ly8gbm9uLWVkaXRhYmxlIGBjbGF1ZGUtaW50ZXJuYWw6YCBzaGFwZSB0aGUgU0RLIGZhbGxiYWNrIHByb2R1Y2VzXG5cdFx0Ly8gcG9zdC1tYXRlcmlhbGl6ZSAoc2VsZWN0YWJsZSwgbmFtZSByb3VuZC10cmlwcyksIHNvIHRoZSBzYW1lIGFnZW50XG5cdFx0Ly8gbG9va3MgaWRlbnRpY2FsIGJlZm9yZSBhbmQgYWZ0ZXIgbWF0ZXJpYWxpemUuIEEgZGlzayBhZ2VudCBvZiB0aGVcblx0XHQvLyBzYW1lIG5hbWUgd2luczsgdGhlIFNESyBkZWZhdWx0IGFnZW50IGlzIGhpZGRlbi5cblx0XHRjb25zdCBkaXNrQWdlbnROYW1lcyA9IG5ldyBTZXQoXG5cdFx0XHRkaXNjb3ZlcmVkLmZpbHRlcihkID0+IGQuY3VzdG9taXphdGlvbi50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCkubWFwKGQgPT4gZC5uYW1lKVxuXHRcdCk7XG5cdFx0Y29uc3QgYnVpbHRpbkFnZW50cyA9IENMQVVERV9CVUlMVElOX0FHRU5UU1xuXHRcdFx0LmZpbHRlcihhID0+IGEubmFtZSAhPT0gQ0xBVURFX1NES19ERUZBVUxUX0FHRU5UX05BTUUgJiYgIWRpc2tBZ2VudE5hbWVzLmhhcyhhLm5hbWUpKVxuXHRcdFx0Lm1hcChhID0+IHRvUGFyc2VkQWdlbnQoeyB1cmk6IG5vbkVkaXRhYmxlVXJpKCdhZ2VudCcsIGEubmFtZSksIG5hbWU6IGEubmFtZSwgZGVzY3JpcHRpb246IGEuZGVzY3JpcHRpb24oKSB9KSk7XG5cdFx0cmV0dXJuIHdpdGhCdWlsdGluU2tpbGxzKG1hcERpc2NvdmVyZWRDdXN0b21pemF0aW9ucyhbLi4uZGlzY292ZXJlZCwgLi4uYnVpbHRpbkFnZW50c10sIG1jcFNlcnZlcnMsIGhvb2tzLCBuYXRpdmVQbHVnaW5zLCB3b3JraW5nRGlyZWN0b3JpZXMsIHVzZXJIb21lKSk7XG5cdH1cblxuXHRjb25zdCBhZ2VudE5hbWVzID0gbmV3IFNldChzZGsuYWdlbnRzLm1hcChhID0+IGEubmFtZSkpO1xuXHRjb25zdCBjb21tYW5kTmFtZXMgPSBuZXcgU2V0KHNkay5jb21tYW5kcy5tYXAoYyA9PiBjLm5hbWUpKTtcblx0Y29uc3QgbWNwQnlOYW1lID0gbmV3IE1hcChzZGsubWNwU2VydmVycy5tYXAocyA9PiBbcy5uYW1lLCBzXSBhcyBjb25zdCkpO1xuXG5cdC8vIEtlZXAgZGlzayBlbnRyaWVzIHRoZSBsaXZlIHNlc3Npb24gYWN0dWFsbHkgbG9hZGVkLiBBIGxvYWRlZCBza2lsbFxuXHQvLyBzdXJmYWNlcyBpbiB0aGUgU0RLJ3MgYHN1cHBvcnRlZENvbW1hbmRzKClgIHNldCwgc28gZGlzayBza2lsbHMgYXJlXG5cdC8vIG1hdGNoZWQgYWdhaW5zdCBgY29tbWFuZE5hbWVzYC5cblx0Y29uc3Qgc2VlbkFnZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBlbnRyaWVzOiAoSVBhcnNlZEFnZW50IHwgSVBhcnNlZFNraWxsIHwgSVBhcnNlZFJ1bGUpW10gPSBbXTtcblx0Zm9yIChjb25zdCBkIG9mIGRpc2NvdmVyZWQpIHtcblx0XHRpZiAoZC5jdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50KSB7XG5cdFx0XHQvLyBIaWRlIHRoZSBTREsncyBidWlsdC1pbiBkZWZhdWx0IGFnZW50IGV2ZW4gd2hlbiBhIHNhbWUtbmFtZWRcblx0XHRcdC8vIGZpbGUgZXhpc3RzIG9uIGRpc2sgXHUyMDE0IHNlbGVjdGluZyBpdCBpcyBlcXVpdmFsZW50IHRvIFwibm9cblx0XHRcdC8vIHNlbGVjdGlvblwiLCBzbyBpdCBtdXN0IG5ldmVyIHJlYWNoIHRoZSBwaWNrZXIgcG9zdC1tYXRlcmlhbGl6ZS5cblx0XHRcdGlmIChkLm5hbWUgPT09IENMQVVERV9TREtfREVGQVVMVF9BR0VOVF9OQU1FKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFnZW50TmFtZXMuaGFzKGQubmFtZSkpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKGQpO1xuXHRcdFx0XHRzZWVuQWdlbnRzLmFkZChkLm5hbWUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZC5jdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsKSB7XG5cdFx0XHRpZiAoY29tbWFuZE5hbWVzLmhhcyhkLm5hbWUpKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaChkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUnVsZXMgKENMQVVERS5tZCArIGAuY2xhdWRlL3J1bGVzYCkgaGF2ZSBubyBTREsgY291bnRlcnBhcnQsIHNvXG5cdFx0XHQvLyB0aGV5IGFyZSBuZXZlciBmaWx0ZXJlZCBcdTIwMTQgYWx3YXlzIGtlZXAgdGhlbS5cblx0XHRcdGVudHJpZXMucHVzaChkKTtcblx0XHR9XG5cdH1cblxuXHQvLyBTREsta25vd24tYnV0LW5vdC1vbi1kaXNrIEFHRU5UUyBcdTIxOTIgbm9uLWVkaXRhYmxlIGZhbGxiYWNrIChEZWNpc2lvbiBEMik6XG5cdC8vIHN0aWxsIHNlbGVjdGFibGUgYXMgdGhlIHNlc3Npb24gYWdlbnQgZXZlbiB3aXRob3V0IGFuIGVkaXRhYmxlIGZpbGUuXG5cdC8vIChTa2lsbHMgZ2V0IG5vIHN1Y2ggZmFsbGJhY2sgXHUyMDE0IHNlZSB0aGUgZG9jIGNvbW1lbnQ6IGEgbm9uLW9wZW5hYmxlXG5cdC8vIHNraWxsIGVudHJ5IGlzIG9ubHkgZXZlciBhIGRlYWQgbGluay4pXG5cdGZvciAoY29uc3QgYWdlbnQgb2Ygc2RrLmFnZW50cykge1xuXHRcdGlmIChhZ2VudC5uYW1lID09PSBDTEFVREVfU0RLX0RFRkFVTFRfQUdFTlRfTkFNRSB8fCBzZWVuQWdlbnRzLmhhcyhhZ2VudC5uYW1lKSB8fCBwbHVnaW5BZ2VudE5hbWVzLmhhcyhhZ2VudC5uYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGVudHJpZXMucHVzaCh0b1BhcnNlZEFnZW50KHsgdXJpOiBub25FZGl0YWJsZVVyaSgnYWdlbnQnLCBhZ2VudC5uYW1lKSwgbmFtZTogYWdlbnQubmFtZSwgLi4uKGFnZW50LmRlc2NyaXB0aW9uID8geyBkZXNjcmlwdGlvbjogYWdlbnQuZGVzY3JpcHRpb24gfSA6IHt9KSB9KSk7XG5cdH1cblxuXHQvLyBNQ1A6IGtlZXAgZGlzayBzZXJ2ZXJzIHRoZSBTREsgbG9hZGVkIChlbnJpY2hlZCB3aXRoIGxpdmUgc3RhdGUpOyBhZGRcblx0Ly8gU0RLLW9ubHkgc2VydmVycyBhcyBub24tZWRpdGFibGUgZW50cmllcyAoc3RhdHVzIGlzIHN0aWxsIGluZm9ybWF0aXZlKS5cblx0Y29uc3Qgc2Vlbk1jcCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBzZXJ2ZXJzOiBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uW10gPSBbXTtcblx0Zm9yIChjb25zdCBzZXJ2ZXIgb2YgbWNwU2VydmVycykge1xuXHRcdGNvbnN0IHNka1NlcnZlciA9IG1jcEJ5TmFtZS5nZXQoc2VydmVyLm5hbWUpO1xuXHRcdGlmICghc2RrU2VydmVyKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c2Vlbk1jcC5hZGQoc2VydmVyLm5hbWUpO1xuXHRcdHNlcnZlcnMucHVzaCh7IC4uLnNlcnZlciwgc3RhdGU6IGRlcml2ZU1jcFN0YXRlKHNka1NlcnZlci5zdGF0dXMpIH0pO1xuXHR9XG5cdGZvciAoY29uc3QgW25hbWUsIHNka1NlcnZlcl0gb2YgbWNwQnlOYW1lKSB7XG5cdFx0aWYgKHNlZW5NY3AuaGFzKG5hbWUpIHx8IHBsdWdpbk1jcE5hbWVzLmhhcyhuYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIFRoZSBhZ2VudCBob3N0IGluamVjdHMgaXRzIG93biBpbi1wcm9jZXNzIE1DUCBzZXJ2ZXJzICh0aGUgY2xpZW50LXRvb2xcblx0XHQvLyBhbmQgc2VydmVyLXRvb2wgYnJpZGdlcykgaW50byBgT3B0aW9ucy5tY3BTZXJ2ZXJzYCwgYW5kIHRoZSBTREsgcmVwb3J0c1xuXHRcdC8vIHRoZW0gaGVyZSBhbG9uZ3NpZGUgcmVhbCBvbmVzLiBUaGV5IGFyZSBpbnRlcm5hbCBwbHVtYmluZyB3aXRoIG5vXG5cdFx0Ly8gZGVmaW5pdGlvbiB0aGUgdXNlciBjYW4gYWN0IG9uLCBzbyBhbiBTREstb25seSBlbnRyeSB1bmRlciBvbmUgb2YgdGhvc2Vcblx0XHQvLyBuYW1lcyBpcyBvdXJzOiBzdXJmYWNpbmcgaXQgd291bGQgc2hvdyBhIHBoYW50b20gY3VzdG9taXphdGlvbiBBTkQgZmVlZFxuXHRcdC8vIGl0cyBuYW1lIGludG8gdGhlIHNlc3Npb24ncyBNQ1AgZW5hYmxlbWVudCByZWNvbmNpbGlhdGlvbiwgd2hpY2ggdGhlblxuXHRcdC8vIHRyaWVzIHRvIHRvZ2dsZSBhIHNlcnZlciB0aGUgQ0xJIGhhcyBubyBjb25maWd1cmF0aW9uIGZvclxuXHRcdC8vIChgU2VydmVyIG5vdCBmb3VuZDogPG5hbWU+YCkuIEEgc2VydmVyIHRoZSBkaXNrIHNjYW4gZGlkIGRlZmluZSB1bmRlclxuXHRcdC8vIHRoZSBzYW1lIG5hbWUgaXMgbWF0Y2hlZCBhYm92ZSBhbmQga2VwdCwgc28gYSB1c2VyLWNvbmZpZ3VyZWQgc2VydmVyIGlzXG5cdFx0Ly8gbmV2ZXIgaGlkZGVuIGJ5IHRoaXMuXG5cdFx0aWYgKGlzSG9zdEluamVjdGVkTWNwU2VydmVyTmFtZShuYW1lKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHNlcnZlcnMucHVzaCh7IC4uLm1ha2VNY3BTZXJ2ZXJDdXN0b21pemF0aW9uKG5vbkVkaXRhYmxlVXJpKCdtY3AnLCBuYW1lKSwgbmFtZSksIHN0YXRlOiBkZXJpdmVNY3BTdGF0ZShzZGtTZXJ2ZXIuc3RhdHVzKSB9KTtcblx0fVxuXG5cdC8vIE5hdGl2ZSBwbHVnaW5zIHdlcmUgbWF0Y2hlZCB0byB0aGUgbGl2ZSBTREsgc2V0IGF0IHRoZSB0b3Agb2YgdGhpc1xuXHQvLyBmdW5jdGlvbiAoYHZpc2libGVQbHVnaW5zYCk7IHN1cmZhY2UgdGhlbSBhcyB0b3AtbGV2ZWwgY29udGFpbmVycy5cblx0cmV0dXJuIHdpdGhCdWlsdGluU2tpbGxzKG1hcERpc2NvdmVyZWRDdXN0b21pemF0aW9ucyhlbnRyaWVzLCBzZXJ2ZXJzLCBob29rcywgdmlzaWJsZVBsdWdpbnMsIHdvcmtpbmdEaXJlY3RvcmllcywgdXNlckhvbWUpKTtcbn1cblxuLyoqXG4gKiBUaGUgY3VzdG9taXphdGlvbi1zb3VyY2Ugc3VicGF0aHMgdW5kZXIgYSBgLmNsYXVkZWAgZGlyZWN0b3J5LiBPbmx5IGVkaXRzXG4gKiB0byB0aGVzZSBzaG91bGQgZm9yY2UgYSByZS1zY2FuLiBFdmVyeXRoaW5nIGVsc2UgdW5kZXIgYC5jbGF1ZGVgIGlzIENsYXVkZVxuICogU0RLIHJ1bnRpbWUgY2h1cm4gXHUyMDE0IGBoaXN0b3J5Lmpzb25sYCwgYHByb2plY3RzL2AgKHBlci1tZXNzYWdlIHRyYW5zY3JpcHRzKSxcbiAqIGB0YXNrcy9gLCBgZmlsZS1oaXN0b3J5L2AsIGBzZXNzaW9ucy9gLCBgc2hlbGwtc25hcHNob3RzL2AsIGBiYWNrdXBzL2AsXG4gKiBgc2Vzc2lvbi1lbnYvYCwgYHN0YXRzaWdgLCBhbmQgYXNzb3J0ZWQgYCotY2FjaGUuanNvbmAgZmlsZXMgXHUyMDE0IGFsbCBvZiB3aGljaFxuICogdGhlIFNESyByZXdyaXRlcyBjb25zdGFudGx5IGR1cmluZyBhIHR1cm4uIFRyaWdnZXJpbmcgb24gdGhvc2UgcHJvZHVjZWQgYVxuICogc3Rvcm0gb2YgYFNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWRgIGVudmVsb3BlcyAodGhvdXNhbmRzIHBlciBzZXNzaW9uKSxcbiAqIHNvIHRoZSB3YXRjaGVyIGRlbGliZXJhdGVseSB0cmlnZ2VycyBvbiB0aGlzIGFsbG93bGlzdCBvbmx5LlxuICovXG5jb25zdCBDTEFVREVfQ1VTVE9NSVpBVElPTl9TVUJQQVRIUzogcmVhZG9ubHkgc3RyaW5nW10gPSBPYmplY3QuZnJlZXplKFtcblx0J2FnZW50cycsXG5cdCdza2lsbHMnLFxuXHQnY29tbWFuZHMnLFxuXHQncnVsZXMnLFxuXHQncGx1Z2lucycsXG5cdCdDTEFVREUubWQnLFxuXHQnc2V0dGluZ3MuanNvbicsXG5cdCdzZXR0aW5ncy5sb2NhbC5qc29uJyxcbl0pO1xuXG4vKipcbiAqIFdhdGNoZXMgYSBzZXNzaW9uJ3Mgb24tZGlzayBDbGF1ZGUgY3VzdG9taXphdGlvbiBzb3VyY2VzIGFuZCBmaXJlc1xuICoge0BsaW5rIG9uRGlkQ2hhbmdlfSAoZGVib3VuY2VkKSB3aGVuZXZlciBhbnkgb2YgdGhlbSBpcyBjcmVhdGVkLCBlZGl0ZWQsXG4gKiBvciByZW1vdmVkLCBzbyB0aGUgd29ya2JlbmNoIHJlLWZldGNoZXMgYGdldFNlc3Npb25DdXN0b21pemF0aW9uc2AuXG4gKlxuICogV2F0Y2hlZCByb290czpcbiAqICAtIGA8Y3dkPi8uY2xhdWRlYCBhbmQgYDx1c2VySG9tZT4vLmNsYXVkZWAgKHJlY3Vyc2l2ZSkgXHUyMDE0IGNvdmVyIHRoZVxuICogICAgYWdlbnRzIC8gc2tpbGxzIC8gY29tbWFuZHMgdHJlZXMsIHRoZSBgLmNsYXVkZS9ydWxlc2AgKyBgLmNsYXVkZS9DTEFVREUubWRgXG4gKiAgICBpbnN0cnVjdGlvbiBzb3VyY2VzLCBwbHVzIHRoZSBpbmxpbmUgYHNldHRpbmdzLmpzb25gIE1DUCBjb25maWcuXG4gKiAgLSBgPGN3ZD5gIChub24tcmVjdXJzaXZlKSBcdTIwMTQgd2F0Y2hlZCB0byBjYXRjaCB0aGUgc2libGluZyBgLm1jcC5qc29uYCBhbmRcbiAqICAgIHRoZSByb290IGBDTEFVREUubWRgIC8gYENMQVVERS5sb2NhbC5tZGAgbWVtb3J5IGZpbGVzLlxuICpcbiAqIFRoZSByZWN1cnNpdmUgYC5jbGF1ZGVgIHdhdGNoZXMga2VlcCBPUy1sZXZlbCB3YXRjaGVyIGNvdW50IGxvdywgYnV0IHRoZVxuICogY2hhbmdlICp0cmlnZ2VycyogYXJlIG5hcnJvd2VkIHRvIHtAbGluayBDTEFVREVfQ1VTVE9NSVpBVElPTl9TVUJQQVRIU30gKGFuZFxuICogdGhlIHNwZWNpZmljIG1lbW9yeSAvIGAubWNwLmpzb25gIGZpbGVzKSBzbyB0aGUgU0RLJ3MgaGlnaC1mcmVxdWVuY3kgcnVudGltZVxuICogd3JpdGVzIGVsc2V3aGVyZSB1bmRlciBgLmNsYXVkZWAgKGFuZCB1bnJlbGF0ZWQgZWRpdHMgaW4gdGhlIHdvcmtzcGFjZSByb290KVxuICogZG9uJ3QgZm9yY2UgYSByZS1zY2FuLlxuICovXG5leHBvcnQgY2xhc3MgQ2xhdWRlQ3VzdG9taXphdGlvbldhdGNoZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUJPVU5DRV9NUyA9IDMwMDtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSB8IFVSSSB8IHVuZGVmaW5lZCxcblx0XHR1c2VySG9tZTogVVJJLFxuXHRcdGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0ZGVib3VuY2VNczogbnVtYmVyID0gQ2xhdWRlQ3VzdG9taXphdGlvbldhdGNoZXIuREVCT1VOQ0VfTVMsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCByb290cyA9IGRpc3RpbmN0Q2xhdWRlV29ya2luZ0RpcmVjdG9yaWVzKEFycmF5LmlzQXJyYXkod29ya2luZ0RpcmVjdG9yaWVzKSA/IHdvcmtpbmdEaXJlY3RvcmllcyA6IHdvcmtpbmdEaXJlY3RvcmllcyA/IFt3b3JraW5nRGlyZWN0b3JpZXNdIDogW10pO1xuXHRcdC8vIFVSSXMgd2hvc2Ugc3VidHJlZSAob3IgZXhhY3QgZmlsZSwgZm9yIGAubWNwLmpzb25gKSBzaWduYWxzIGEgcmUtc2Nhbi5cblx0XHRjb25zdCB0cmlnZ2VyczogVVJJW10gPSBbXTtcblx0XHRjb25zdCB3YXRjaGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgd2F0Y2ggPSAodXJpOiBVUkksIHJlY3Vyc2l2ZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gYCR7cmVjdXJzaXZlfToke3VyaS50b1N0cmluZygpfWA7XG5cdFx0XHRpZiAod2F0Y2hlZC5oYXMoa2V5KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR3YXRjaGVkLmFkZChrZXkpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2Uud2F0Y2godXJpLCB7IHJlY3Vyc2l2ZSwgZXhjbHVkZXM6IFtdIH0pKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVDdXN0b21pemF0aW9uV2F0Y2hlcl0gZmFpbGVkIHRvIHdhdGNoICcke3VyaS50b1N0cmluZygpfSc6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBUcmlnZ2VyIG9ubHkgb24gdGhlIGN1c3RvbWl6YXRpb24gc291cmNlcyB1bmRlciBhIGAuY2xhdWRlYCByb290LCBub3Rcblx0XHQvLyBvbiB0aGUgcm9vdCBpdHNlbGYgXHUyMDE0IHRoYXQgd291bGQgZmlyZSBvbiBldmVyeSBTREsgcnVudGltZSB3cml0ZSAoc2VlXG5cdFx0Ly8gQ0xBVURFX0NVU1RPTUlaQVRJT05fU1VCUEFUSFMpLlxuXHRcdGNvbnN0IGFkZENsYXVkZVRyaWdnZXJzID0gKGJhc2U6IFVSSSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzdWIgb2YgQ0xBVURFX0NVU1RPTUlaQVRJT05fU1VCUEFUSFMpIHtcblx0XHRcdFx0dHJpZ2dlcnMucHVzaChVUkkuam9pblBhdGgoYmFzZSwgc3ViKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByaW1hcnkgPSByb290c1swXTtcblx0XHRpZiAocHJpbWFyeSkge1xuXHRcdFx0Y29uc3QgcHJvamVjdENsYXVkZSA9IFVSSS5qb2luUGF0aChwcmltYXJ5LCAnLmNsYXVkZScpO1xuXHRcdFx0d2F0Y2gocHJvamVjdENsYXVkZSwgdHJ1ZSk7XG5cdFx0XHRhZGRDbGF1ZGVUcmlnZ2Vycyhwcm9qZWN0Q2xhdWRlKTtcblx0XHRcdHdhdGNoKHByaW1hcnksIGZhbHNlKTtcblx0XHRcdHRyaWdnZXJzLnB1c2goVVJJLmpvaW5QYXRoKHByaW1hcnksICcubWNwLmpzb24nKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgYWRkaXRpb25hbCBvZiByb290cy5zbGljZSgxKSkge1xuXHRcdFx0Y29uc3QgcHJvamVjdENsYXVkZSA9IFVSSS5qb2luUGF0aChhZGRpdGlvbmFsLCAnLmNsYXVkZScpO1xuXHRcdFx0d2F0Y2gocHJvamVjdENsYXVkZSwgdHJ1ZSk7XG5cdFx0XHR0cmlnZ2Vycy5wdXNoKFxuXHRcdFx0XHRVUkkuam9pblBhdGgocHJvamVjdENsYXVkZSwgJ2FnZW50cycpLFxuXHRcdFx0XHRVUkkuam9pblBhdGgocHJvamVjdENsYXVkZSwgJ3NraWxscycpLFxuXHRcdFx0XHRVUkkuam9pblBhdGgocHJvamVjdENsYXVkZSwgJ3NldHRpbmdzLmpzb24nKSxcblx0XHRcdFx0VVJJLmpvaW5QYXRoKHByb2plY3RDbGF1ZGUsICdzZXR0aW5ncy5sb2NhbC5qc29uJyksXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRjb25zdCB1c2VyQ2xhdWRlID0gVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnLmNsYXVkZScpO1xuXHRcdHdhdGNoKHVzZXJDbGF1ZGUsIHRydWUpO1xuXHRcdGFkZENsYXVkZVRyaWdnZXJzKHVzZXJDbGF1ZGUpO1xuXG5cdFx0Ly8gTWVtb3J5IGZpbGVzIChDTEFVREUubWQgLyBDTEFVREUubG9jYWwubWQpIFx1MjAxNCByZXVzZSB0aGUgc2Nhbm5lcidzXG5cdFx0Ly8gY2Fub25pY2FsIGxpc3Qgc28gdGhlIHdhdGNoZXIgbmV2ZXIgZHJpZnRzIGZyb20gd2hhdCBpdCBhY3R1YWxseVxuXHRcdC8vIHJlYWRzLiBFbnRyaWVzIGFscmVhZHkgdW5kZXIgYSByZWN1cnNpdmVseS13YXRjaGVkIGAuY2xhdWRlYCByb290XG5cdFx0Ly8gKGUuZy4gYC5jbGF1ZGUvQ0xBVURFLm1kYCkgYXJlIGhhcm1sZXNzIGR1cGxpY2F0ZSB0cmlnZ2Vycy5cblx0XHR0cmlnZ2Vycy5wdXNoKC4uLmNsYXVkZU1lbW9yeUZpbGVzKHByaW1hcnksIHVzZXJIb21lKSk7XG5cblx0XHQvLyBDb2xsYXBzZSB0aGUgcmF3IGZpbGUtY2hhbmdlIHN0cmVhbSBpbnRvIGEgc2luZ2xlIGRlYm91bmNlZCBzaWduYWwuXG5cdFx0Ly8gVGhlIGBEaXNwb3NhYmxlU3RvcmVgIGFyZ3VtZW50IGlzIHJlcXVpcmVkIGJlY2F1c2UgYG9uRGlkQ2hhbmdlYCBpcyBhXG5cdFx0Ly8gcHVibGljIHByb3BlcnR5IChzZWUgdGhlIGBFdmVudC5kZWJvdW5jZWAgbGVhay1zYWZldHkgbm90ZSkuXG5cdFx0dGhpcy5vbkRpZENoYW5nZSA9IEV2ZW50LnNpZ25hbChFdmVudC5kZWJvdW5jZShcblx0XHRcdEV2ZW50LmZpbHRlcihmaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlLCBlID0+IHRyaWdnZXJzLnNvbWUodCA9PiBlLmFmZmVjdHModCkpLCB0aGlzLl9zdG9yZSksXG5cdFx0XHQoX2xhc3QsIGUpID0+IGUsXG5cdFx0XHRkZWJvdW5jZU1zLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5fc3RvcmUsXG5cdFx0KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyw0QkFBNEIsZ0JBQWdCLHFCQUE2RTtBQUNsSSxTQUFTLHlCQUEyRTtBQUNwRixTQUFTLHlCQUF5Qix1QkFBNk47QUFFL1AsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyx1QkFBdUIsbUNBQW1DLHNDQUFzQztBQUN6RyxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLDJDQUEyQztBQU83QyxNQUFNLGdDQUFnQztBQVM3QyxNQUFNLHlCQUF5QjtBQUUvQixTQUFTLGNBQWMsTUFBVyxLQUFhLFVBQStHLFVBQWdJO0FBQzdSLFFBQU0sTUFBTSxJQUFJLFNBQVMsTUFBTSxXQUFXLEdBQUcsRUFBRSxTQUFT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
