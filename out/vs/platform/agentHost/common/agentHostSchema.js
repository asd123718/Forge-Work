import { localize } from "../../../nls.js";
import { structuralEquals } from "../../../base/common/equals.js";
import { ConfigurationTarget } from "../../configuration/common/configuration.js";
import { DEFAULT_EDIT_AUTO_APPROVE_PATTERNS } from "../../chat/common/chatSettings.js";
import { TelemetryConfiguration, TelemetryLevel } from "../../telemetry/common/telemetry.js";
import { SessionConfigKey } from "./sessionConfigKeys.js";
import { JsonRpcErrorCodes, ProtocolError } from "./state/sessionProtocol.js";
function schemaProperty(protocol) {
  const assertFn = buildAssert(protocol);
  const assertValid = (value, path = "") => assertFn(value, path);
  const validate = (value) => {
    try {
      assertFn(value, "");
      return true;
    } catch {
      return false;
    }
  };
  return { protocol, validate, assertValid };
}
function createSchema(definition) {
  return {
    definition,
    toProtocol() {
      const properties = {};
      for (const key of Object.keys(definition)) {
        properties[key] = definition[key].protocol;
      }
      return { type: "object", properties };
    },
    values(values) {
      const raw = values;
      for (const key of Object.keys(definition)) {
        const value = raw[key];
        if (value === void 0) {
          continue;
        }
        const prop = definition[key];
        prop.assertValid(value, key);
      }
      return { ...raw };
    },
    validate(key, value) {
      const prop = definition[key];
      return prop ? prop.validate(value) : false;
    },
    assertValid(key, value) {
      const prop = definition[key];
      if (!prop) {
        throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Unknown schema key '${key}'`);
      }
      const narrowed = prop;
      narrowed.assertValid(value, key);
    },
    validateOrDefault(values, defaults) {
      const result = {};
      const raw = values ?? {};
      for (const key of Object.keys(definition)) {
        const prop = definition[key];
        const candidate = raw[key];
        if (candidate !== void 0 && prop.validate(candidate)) {
          result[key] = candidate;
        } else if (Object.prototype.hasOwnProperty.call(defaults, key)) {
          result[key] = defaults[key];
        }
      }
      return result;
    }
  };
}
function buildAssert(schema) {
  if (schema.type === "object" && schema.properties) {
    const propAsserts = {};
    for (const key of Object.keys(schema.properties)) {
      propAsserts[key] = buildAssert(schema.properties[key]);
    }
    const required = new Set(schema.required ?? []);
    return (value, path) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw invalidParams(path, "object", value);
      }
      const obj = value;
      for (const key of Object.keys(propAsserts)) {
        const childPath = joinPath(path, key);
        if (obj[key] === void 0) {
          if (required.has(key)) {
            throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Missing required property at '${childPath}'`);
          }
          continue;
        }
        propAsserts[key](obj[key], childPath);
      }
    };
  }
  if (schema.type === "array" && schema.items) {
    const itemAssert = buildAssert(schema.items);
    return (value, path) => {
      if (!Array.isArray(value)) {
        throw invalidParams(path, "array", value);
      }
      for (let i = 0; i < value.length; i++) {
        itemAssert(value[i], `${path}[${i}]`);
      }
    };
  }
  return buildPrimitiveAssert(schema);
}
function buildPrimitiveAssert(schema) {
  const enumDynamic = schema.enumDynamic === true;
  return (value, path) => {
    switch (schema.type) {
      case "string":
        if (typeof value !== "string") {
          throw invalidParams(path, "string", value);
        }
        break;
      case "number":
        if (typeof value !== "number") {
          throw invalidParams(path, "number", value);
        }
        break;
      case "boolean":
        if (typeof value !== "boolean") {
          throw invalidParams(path, "boolean", value);
        }
        break;
      case "array":
        if (!Array.isArray(value)) {
          throw invalidParams(path, "array", value);
        }
        break;
      case "object":
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          throw invalidParams(path, "object", value);
        }
        break;
    }
    if (schema.enum && !enumDynamic && !schema.enum.includes(value)) {
      throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Invalid value at '${path || "<root>"}': ${safeStringify(value)} is not one of [${schema.enum.map((v) => JSON.stringify(v)).join(", ")}]`);
    }
  };
}
function invalidParams(path, expected, value) {
  return new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Invalid value at '${path || "<root>"}': expected ${expected}, got ${safeStringify(value)}`);
}
function joinPath(parent, key) {
  return parent ? `${parent}.${key}` : key;
}
function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
const permissionsProperty = schemaProperty({
  type: "object",
  title: localize("agentHost.sessionConfig.permissions", "Permissions"),
  description: localize("agentHost.sessionConfig.permissionsDescription", 'Per-tool session permissions. Updated automatically when approving a tool "in this Session".'),
  properties: {
    allow: {
      type: "array",
      title: localize("agentHost.sessionConfig.permissions.allow", "Allowed tools"),
      items: {
        type: "string",
        title: localize("agentHost.sessionConfig.permissions.toolName", "Tool name")
      }
    },
    deny: {
      type: "array",
      title: localize("agentHost.sessionConfig.permissions.deny", "Denied tools"),
      items: {
        type: "string",
        title: localize("agentHost.sessionConfig.permissions.toolName", "Tool name")
      }
    }
  },
  default: { allow: [], deny: [] },
  sessionMutable: true
});
const platformSessionSchema = createSchema({
  [SessionConfigKey.AutoApprove]: schemaProperty({
    type: "string",
    title: localize("agentHost.sessionConfig.autoApprove", "Approvals"),
    description: localize("agentHost.sessionConfig.autoApproveDescription", "Tool approval behavior for this session"),
    enum: ["default", "assisted", "autoApprove"],
    enumLabels: [
      localize("agentHost.sessionConfig.autoApprove.default", "Manual permissions"),
      localize("agentHost.sessionConfig.autoApprove.assisted", "Assisted permissions"),
      localize("agentHost.sessionConfig.autoApprove.bypass", "Allow all")
    ],
    enumDescriptions: [
      localize("agentHost.sessionConfig.autoApprove.defaultDescription", "Asks when approval settings don't apply"),
      localize("agentHost.sessionConfig.autoApprove.assistedDescription", "Evaluates risk before running tools"),
      localize("agentHost.sessionConfig.autoApprove.bypassDescription", "Runs tool calls without asking")
    ],
    default: "default",
    sessionMutable: true
  }),
  [SessionConfigKey.Permissions]: permissionsProperty,
  [SessionConfigKey.Mode]: schemaProperty({
    type: "string",
    title: localize("agentHost.sessionConfig.mode", "Agent Mode"),
    description: localize("agentHost.sessionConfig.modeDescription", "How the agent should approach this turn"),
    enum: ["interactive", "plan", "autopilot"],
    enumLabels: [
      localize("agentHost.sessionConfig.mode.interactive", "Interactive"),
      localize("agentHost.sessionConfig.mode.plan", "Plan"),
      localize("agentHost.sessionConfig.mode.autopilot", "Autopilot")
    ],
    enumDescriptions: [
      localize("agentHost.sessionConfig.mode.interactiveDescription", "Step-by-step collaboration"),
      localize("agentHost.sessionConfig.mode.planDescription", "Plan first, execute when ready"),
      localize("agentHost.sessionConfig.mode.autopilotDescription", "Works autonomously within permissions")
    ],
    default: "interactive",
    sessionMutable: true
  })
});
function migrateLegacyAutopilotConfig(config) {
  if (!config || config[SessionConfigKey.AutoApprove] !== "autopilot") {
    return config;
  }
  const migrated = { ...config };
  if (migrated[SessionConfigKey.Mode] !== "plan") {
    migrated[SessionConfigKey.Mode] = "autopilot";
  }
  migrated[SessionConfigKey.AutoApprove] = "default";
  return migrated;
}
const AgentHostTelemetryLevelConfigKey = "telemetryLevel";
const AgentHostEditTelemetryEnabledConfigKey = "editTelemetryEnabled";
const AgentHostDisableRepoInfoTelemetryConfigKey = "disableRepoInfoTelemetry";
const DISABLE_REPO_INFO_TELEMETRY_SETTING_ID = "chat.advanced.debug.disableRepoInfoTelemetry";
const AgentHostSessionSyncEnabledConfigKey = "sessionSyncEnabled";
const AgentHostCodexEnabledConfigKey = "codexAgentEnabled";
const AgentHostEditAutoApprovePatternsConfigKey = "editAutoApprovePatterns";
const AgentHostTerminalAutoApproveEnabledConfigKey = "terminalAutoApproveEnabled";
const TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID = "chat.tools.terminal.enableAutoApprove";
const GLOBAL_AUTO_APPROVE_SETTING_ID = "chat.tools.global.autoApprove";
const AgentHostGlobalAutoApproveEnabledConfigKey = "globalAutoApproveEnabled";
const AgentHostAutoReplyEnabledConfigKey = "autoReplyEnabled";
const AgentHostAutoReplyAnswer = "The user is not available to answer your question. Choose a pragmatic option best aligned with the context of the request.";
const AgentHostSystemProxyEnabledConfigKey = "systemProxyEnabled";
const AgentHostActiveAgentTitleGenerationConfigKey = "activeAgentTitleGeneration";
const AgentHostMarkdownPlanRichLinksEnabledConfigKey = "markdownPlanRichLinksEnabled";
const AgentHostMigrateLegacyCopilotCliEnabledConfigKey = "migrateLegacyCopilotCliEnabled";
const AgentHostShowExternalSessionsConfigKey = "showExternalSessions";
var AgentHostExternalSessionsMode = /* @__PURE__ */ ((AgentHostExternalSessionsMode2) => {
  AgentHostExternalSessionsMode2["None"] = "none";
  AgentHostExternalSessionsMode2["All"] = "all";
  AgentHostExternalSessionsMode2["Last24Hours"] = "last24Hours";
  AgentHostExternalSessionsMode2["Last7Days"] = "last7Days";
  return AgentHostExternalSessionsMode2;
})(AgentHostExternalSessionsMode || {});
const AgentHostCopilotMultiRootEnabledConfigKey = "copilotMultiRootEnabled";
const AgentHostClaudeMultiRootEnabledConfigKey = "claudeMultiRootEnabled";
const AgentHostCodexMultiRootEnabledConfigKey = "codexMultiRootEnabled";
const AgentHostTerminalAutoApproveRulesConfigKey = "terminalAutoApproveRules";
const TERMINAL_AUTO_APPROVE_SETTING_ID = "chat.tools.terminal.autoApprove";
const TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID = "chat.tools.terminal.ignoreDefaultAutoApproveRules";
function getAgentHostTerminalAutoApproveRulesConfig(configurationService) {
  const config = configurationService.getValue(TERMINAL_AUTO_APPROVE_SETTING_ID);
  const configInspectValue = configurationService.inspect(TERMINAL_AUTO_APPROVE_SETTING_ID);
  const ignoreDefaults = configurationService.getValue(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID) === true;
  return normalizeAgentHostTerminalAutoApproveRulesConfig(config, configInspectValue, ignoreDefaults);
}
function normalizeAgentHostTerminalAutoApproveRulesConfig(config, configInspectValue, ignoreDefaults) {
  if (!config) {
    return {};
  }
  const rules = {};
  for (const [key, value] of Object.entries(config)) {
    if (ignoreDefaults && isDefaultOnlyAutoApproveRule(key, value, configInspectValue)) {
      continue;
    }
    rules[key] = value;
  }
  return rules;
}
function isDefaultOnlyAutoApproveRule(key, value, configInspectValue) {
  const defaultValue = configInspectValue.default?.value;
  const isDefaultRule = hasMatchingRule(defaultValue, key, value);
  if (!isDefaultRule) {
    return false;
  }
  const sourceTarget = getAutoApproveRuleSourceTarget(key, value, configInspectValue);
  return sourceTarget === ConfigurationTarget.DEFAULT;
}
function getAutoApproveRuleSourceTarget(key, value, configInspectValue) {
  if (hasMatchingRule(configInspectValue.workspaceFolderValue, key, value)) {
    return ConfigurationTarget.WORKSPACE_FOLDER;
  }
  if (hasMatchingRule(configInspectValue.workspaceValue, key, value)) {
    return ConfigurationTarget.WORKSPACE;
  }
  if (hasMatchingRule(configInspectValue.userRemoteValue, key, value)) {
    return ConfigurationTarget.USER_REMOTE;
  }
  if (hasMatchingRule(configInspectValue.userLocalValue, key, value)) {
    return ConfigurationTarget.USER_LOCAL;
  }
  if (hasMatchingRule(configInspectValue.userValue, key, value)) {
    return ConfigurationTarget.USER;
  }
  if (hasMatchingRule(configInspectValue.applicationValue, key, value)) {
    return ConfigurationTarget.APPLICATION;
  }
  return ConfigurationTarget.DEFAULT;
}
function hasMatchingRule(config, key, value) {
  return !!config && Object.prototype.hasOwnProperty.call(config, key) && structuralEquals(config[key], value);
}
const AgentHostMcpServersConfigKey = "mcpServers";
function telemetryLevelToAgentHostConfigValue(telemetryLevel) {
  switch (telemetryLevel) {
    case TelemetryLevel.NONE:
      return TelemetryConfiguration.OFF;
    case TelemetryLevel.CRASH:
      return TelemetryConfiguration.CRASH;
    case TelemetryLevel.ERROR:
      return TelemetryConfiguration.ERROR;
    case TelemetryLevel.USAGE:
      return TelemetryConfiguration.ON;
  }
}
function agentHostConfigValueToTelemetryLevel(value) {
  switch (value) {
    case TelemetryConfiguration.OFF:
      return TelemetryLevel.NONE;
    case TelemetryConfiguration.CRASH:
      return TelemetryLevel.CRASH;
    case TelemetryConfiguration.ERROR:
      return TelemetryLevel.ERROR;
    case TelemetryConfiguration.ON:
      return TelemetryLevel.USAGE;
    default:
      return void 0;
  }
}
const mcpServerConfigProperties = {
  type: {
    type: "string",
    title: localize("agentHost.config.mcpServers.type.title", "Server Type"),
    description: localize("agentHost.config.mcpServers.type.description", "The transport used to reach the server: `stdio` for a local command, `http` for a remote endpoint."),
    enum: ["stdio", "http"]
  },
  command: {
    type: "string",
    title: localize("agentHost.config.mcpServers.command.title", "Command"),
    description: localize("agentHost.config.mcpServers.command.description", "For `stdio` servers, the executable to spawn.")
  },
  args: {
    type: "array",
    title: localize("agentHost.config.mcpServers.args.title", "Arguments"),
    description: localize("agentHost.config.mcpServers.args.description", "For `stdio` servers, the arguments passed to the command."),
    items: { type: "string", title: localize("agentHost.config.mcpServers.arg.title", "Argument") }
  },
  env: {
    type: "object",
    title: localize("agentHost.config.mcpServers.env.title", "Environment"),
    description: localize("agentHost.config.mcpServers.env.description", "For `stdio` servers, environment variables set on the spawned process.")
  },
  cwd: {
    type: "string",
    title: localize("agentHost.config.mcpServers.cwd.title", "Working Directory"),
    description: localize("agentHost.config.mcpServers.cwd.description", "For `stdio` servers, the working directory the command runs in.")
  },
  url: {
    type: "string",
    title: localize("agentHost.config.mcpServers.url.title", "URL"),
    description: localize("agentHost.config.mcpServers.url.description", "For `http` servers, the endpoint URL of the MCP server.")
  },
  headers: {
    type: "object",
    title: localize("agentHost.config.mcpServers.headers.title", "Headers"),
    description: localize("agentHost.config.mcpServers.headers.description", "For `http` servers, HTTP headers sent with every request.")
  }
};
const mcpServersValueProperties = {
  "<serverName>": {
    type: "object",
    title: localize("agentHost.config.mcpServers.entry.title", "MCP Server"),
    description: localize("agentHost.config.mcpServers.entry.description", "A single MCP server entry. The property key is the server name."),
    properties: mcpServerConfigProperties
  }
};
const platformRootSchema = createSchema({
  [SessionConfigKey.Permissions]: permissionsProperty,
  [AgentHostDisableRepoInfoTelemetryConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.disableRepoInfoTelemetry.title", "Disable Repository Information Telemetry"),
    description: localize("agentHost.config.disableRepoInfoTelemetry.description", "Whether repository information telemetry is disabled for Agent Host sessions."),
    default: false
  }),
  [AgentHostTelemetryLevelConfigKey]: schemaProperty({
    type: "string",
    title: localize("agentHost.config.telemetryLevel.title", "Telemetry Level"),
    description: localize("agentHost.config.telemetryLevel.description", "Most restrictive telemetry level requested by connected clients."),
    enum: [TelemetryConfiguration.ON, TelemetryConfiguration.ERROR, TelemetryConfiguration.CRASH, TelemetryConfiguration.OFF],
    default: TelemetryConfiguration.ON
  }),
  [AgentHostEditTelemetryEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.editTelemetryEnabled.title", "Edit Telemetry"),
    description: localize("agentHost.config.editTelemetryEnabled.description", "Whether edit attribution telemetry is enabled for Agent Host sessions."),
    default: true
  }),
  [AgentHostSessionSyncEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.sessionSyncEnabled.title", "Session Sync"),
    description: localize("agentHost.config.sessionSyncEnabled.description", "Whether remote session sync is enabled for the copilot-sdk CLI."),
    default: false
  }),
  [AgentHostCodexEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.codexAgentEnabled.title", "Codex Agent"),
    description: localize("agentHost.config.codexAgentEnabled.description", "Whether the Codex provider is enabled."),
    default: false
  }),
  [AgentHostTerminalAutoApproveEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.terminalAutoApproveEnabled.title", "Terminal Auto Approve"),
    description: localize("agentHost.config.terminalAutoApproveEnabled.description", "Whether terminal auto-approve rules forwarded by the connected client are allowed to apply to agent-host shell permission requests."),
    default: true
  }),
  [AgentHostGlobalAutoApproveEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.globalAutoApproveEnabled.title", "Global Auto Approve"),
    description: localize("agentHost.config.globalAutoApproveEnabled.description", "Whether VS Code's global auto-approve setting is enabled. When `true`, every tool call is auto-approved, equivalent to a session using Allow all."),
    default: false
  }),
  [AgentHostAutoReplyEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.autoReplyEnabled.title", "Auto Reply"),
    description: localize("agentHost.config.autoReplyEnabled.description", "Whether VS Code's auto-reply setting is enabled. When `true`, `ask_user` questions are auto-answered instead of blocking on the user, mirroring autopilot mode."),
    default: false
  }),
  [AgentHostSystemProxyEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.systemProxyEnabled.title", "System Proxy Discovery"),
    description: localize("agentHost.config.systemProxyEnabled.description", "Whether Copilot sessions automatically discover and use the operating system's proxy configuration."),
    default: true
  }),
  [AgentHostActiveAgentTitleGenerationConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.activeAgentTitleGeneration.title", "Active Agent Title Generation"),
    description: localize("agentHost.config.activeAgentTitleGeneration.description", "Whether the active agent names sessions and chats with rename tools instead of utility-model title generation."),
    default: false
  }),
  [AgentHostMarkdownPlanRichLinksEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.markdownPlanRichLinksEnabled.title", "Markdown Plan Rich Links"),
    description: localize("agentHost.config.markdownPlanRichLinksEnabled.description", "Whether agents receive guidance for using rich links and running task markers in Markdown plan documents."),
    default: false
  }),
  [AgentHostMigrateLegacyCopilotCliEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.migrateLegacyCopilotCliEnabled.title", "Migrate Legacy Copilot CLI Sessions"),
    description: localize("agentHost.config.migrateLegacyCopilotCliEnabled.description", "Whether un-adopted extension-host Copilot CLI sessions are surfaced as adoptable agent-host sessions and migrated in place when opened."),
    default: false
  }),
  [AgentHostShowExternalSessionsConfigKey]: schemaProperty({
    type: "string",
    title: localize("agentHost.config.showExternalSessions.title", "Show External Agent Sessions"),
    description: localize("agentHost.config.showExternalSessions.description", "Controls whether sessions created outside the Agent Host are included in the session catalog."),
    enum: ["none" /* None */, "all" /* All */, "last24Hours" /* Last24Hours */, "last7Days" /* Last7Days */],
    default: "last7Days" /* Last7Days */
  }),
  [AgentHostCopilotMultiRootEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.copilotMultiRootEnabled.title", "Copilot Multiple Working Directories"),
    description: localize("agentHost.config.copilotMultiRootEnabled.description", "Whether the Copilot provider advertises support for multiple working directories, letting a session span every folder of a multi-root workspace."),
    default: false
  }),
  [AgentHostClaudeMultiRootEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.claudeMultiRootEnabled.title", "Claude Multiple Working Directories"),
    description: localize("agentHost.config.claudeMultiRootEnabled.description", "Whether the Claude provider advertises support for multiple working directories, letting a session span every folder of a multi-root workspace."),
    default: false
  }),
  [AgentHostCodexMultiRootEnabledConfigKey]: schemaProperty({
    type: "boolean",
    title: localize("agentHost.config.codexMultiRootEnabled.title", "Codex Multiple Working Directories"),
    description: localize("agentHost.config.codexMultiRootEnabled.description", "Whether the Codex provider advertises support for multiple working directories, letting a session span every folder of a multi-root workspace."),
    default: false
  }),
  [AgentHostEditAutoApprovePatternsConfigKey]: schemaProperty({
    type: "object",
    title: localize("agentHost.config.editAutoApprovePatterns.title", "Edit Auto Approve Patterns"),
    description: localize("agentHost.config.editAutoApprovePatterns.description", "Effective edit auto-approve patterns forwarded by the connected client for agent-host write permission checks."),
    default: DEFAULT_EDIT_AUTO_APPROVE_PATTERNS
  }),
  [AgentHostTerminalAutoApproveRulesConfigKey]: schemaProperty({
    type: "object",
    title: localize("agentHost.config.terminalAutoApproveRules.title", "Terminal Auto Approve Rules"),
    description: localize("agentHost.config.terminalAutoApproveRules.description", "Terminal auto-approve rules forwarded by the connected client for agent-host shell permission checks."),
    default: {}
  }),
  [AgentHostMcpServersConfigKey]: schemaProperty({
    type: "object",
    title: localize("agentHost.config.mcpServers.title", "MCP Servers"),
    description: localize("agentHost.config.mcpServers.description", "Agent-host-level MCP servers exposed to every session, keyed by server name. Each value is a server configuration (see `<serverName>`)."),
    properties: mcpServersValueProperties,
    default: {}
  })
});
export {
  AgentHostActiveAgentTitleGenerationConfigKey,
  AgentHostAutoReplyAnswer,
  AgentHostAutoReplyEnabledConfigKey,
  AgentHostClaudeMultiRootEnabledConfigKey,
  AgentHostCodexEnabledConfigKey,
  AgentHostCodexMultiRootEnabledConfigKey,
  AgentHostCopilotMultiRootEnabledConfigKey,
  AgentHostDisableRepoInfoTelemetryConfigKey,
  AgentHostEditAutoApprovePatternsConfigKey,
  AgentHostEditTelemetryEnabledConfigKey,
  AgentHostExternalSessionsMode,
  AgentHostGlobalAutoApproveEnabledConfigKey,
  AgentHostMarkdownPlanRichLinksEnabledConfigKey,
  AgentHostMcpServersConfigKey,
  AgentHostMigrateLegacyCopilotCliEnabledConfigKey,
  AgentHostSessionSyncEnabledConfigKey,
  AgentHostShowExternalSessionsConfigKey,
  AgentHostSystemProxyEnabledConfigKey,
  AgentHostTelemetryLevelConfigKey,
  AgentHostTerminalAutoApproveEnabledConfigKey,
  AgentHostTerminalAutoApproveRulesConfigKey,
  DISABLE_REPO_INFO_TELEMETRY_SETTING_ID,
  GLOBAL_AUTO_APPROVE_SETTING_ID,
  TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID,
  TERMINAL_AUTO_APPROVE_SETTING_ID,
  TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID,
  agentHostConfigValueToTelemetryLevel,
  createSchema,
  getAgentHostTerminalAutoApproveRulesConfig,
  migrateLegacyAutopilotConfig,
  normalizeAgentHostTerminalAutoApproveRulesConfig,
  platformRootSchema,
  platformSessionSchema,
  schemaProperty,
  telemetryLevelToAgentHostConfigValue
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXGFnZW50SG9zdFNjaGVtYS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgdHlwZSBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHR5cGUgSUNvbmZpZ3VyYXRpb25WYWx1ZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUX0FVVE9fQVBQUk9WRV9QQVRURVJOUywgdHlwZSBDaGF0RWRpdEF1dG9BcHByb3ZlUGF0dGVybnMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jaGF0U2V0dGluZ3MuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBUZWxlbWV0cnlDb25maWd1cmF0aW9uLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hLCBTZXNzaW9uQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBKc29uUnBjRXJyb3JDb2RlcywgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcblxuLy8gLS0tLSBTY2hlbWEgYnVpbGRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIEEgc2NoZW1hIHByb3BlcnR5IHdpdGggYSBwaGFudG9tIFR5cGVTY3JpcHQgdHlwZSBhbmQgYSBwcmVjb21wdXRlZFxuICogcnVudGltZSB2YWxpZGF0b3IuXG4gKlxuICogVGhlIGA8VD5gIHR5cGUgcGFyYW1ldGVyIGlzIHRoZSBkZXZlbG9wZXIncyBhc3NlcnRpb24gYWJvdXQgdGhlXG4gKiBwcm9wZXJ0eSdzIHJ1bnRpbWUgc2hhcGU7IHRoZSB2YWxpZGF0b3IgZGVyaXZlZCBmcm9tIGBwcm90b2NvbGBcbiAqIChgdHlwZWAsIGBlbnVtYCwgYGl0ZW1zYCwgYHByb3BlcnRpZXNgLCBgcmVxdWlyZWRgKSBlbmZvcmNlcyBpdCBhdFxuICogcnVudGltZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2NoZW1hUHJvcGVydHk8VD4ge1xuXHRyZWFkb25seSBwcm90b2NvbDogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hO1xuXHQvKipcblx0ICogUmV0dXJucyBgdHJ1ZWAgaWZmIGB2YWx1ZWAgY29uZm9ybXMgdG8ge0BsaW5rIHByb3RvY29sfS4gTmFycm93c1xuXHQgKiB0aGUgdHlwZSB0byBgVGAgZm9yIGNhbGxlcnMuIFRoZSBib29sZWFuIGZvcm0gaXMgcHJlZmVycmVkIGZvclxuXHQgKiBjb250cm9sIGZsb3c7IHVzZSB7QGxpbmsgYXNzZXJ0VmFsaWR9IHdoZW4geW91IHdhbnQgYSBkZXNjcmlwdGl2ZVxuXHQgKiBlcnJvciBmb3IgdGhlIG9mZmVuZGluZyBwYXRoLlxuXHQgKi9cblx0dmFsaWRhdGUodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBUO1xuXHQvKipcblx0ICogVGhyb3dzIGEge0BsaW5rIFByb3RvY29sRXJyb3J9IHdpdGggYEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXNgXG5cdCAqIGRlc2NyaWJpbmcgdGhlIG9mZmVuZGluZyBwYXRoIChlLmcuIGAncGVybWlzc2lvbnMuYWxsb3dbMl0nYCkgd2hlblxuXHQgKiBgdmFsdWVgIGRvZXMgbm90IGNvbmZvcm0gdG8ge0BsaW5rIHByb3RvY29sfS4gT3RoZXJ3aXNlIHJldHVybnMgYW5kXG5cdCAqIG5hcnJvd3MgdGhlIHR5cGUgdG8gYFRgLlxuXHQgKlxuXHQgKiBAcGFyYW0gcGF0aCBEb3R0ZWQgcGF0aCBwcmVmaXggdG8gZW1iZWQgaW4gZXJyb3IgbWVzc2FnZXMuIERlZmF1bHRzXG5cdCAqIHRvIGVtcHR5ICh0aGUgdmFsdWUgaXRzZWxmKS5cblx0ICovXG5cdGFzc2VydFZhbGlkKHZhbHVlOiB1bmtub3duLCBwYXRoPzogc3RyaW5nKTogYXNzZXJ0cyB2YWx1ZSBpcyBUO1xufVxuXG4vKipcbiAqIERlZmluZXMgYSBzdHJvbmdseS10eXBlZCBzY2hlbWEgcHJvcGVydHkgd2hvc2UgcnVudGltZSB2YWxpZGF0b3IgaXNcbiAqIGRlcml2ZWQgZnJvbSB0aGUgc3VwcGxpZWQgSlNPTi1zY2hlbWEgZGVzY3JpcHRvci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNjaGVtYVByb3BlcnR5PFQ+KHByb3RvY29sOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEpOiBJU2NoZW1hUHJvcGVydHk8VD4ge1xuXHRjb25zdCBhc3NlcnRGbiA9IGJ1aWxkQXNzZXJ0KHByb3RvY29sKTtcblx0Y29uc3QgYXNzZXJ0VmFsaWQgPSAodmFsdWU6IHVua25vd24sIHBhdGg6IHN0cmluZyA9ICcnKTogYXNzZXJ0cyB2YWx1ZSBpcyBUID0+IGFzc2VydEZuKHZhbHVlLCBwYXRoKTtcblx0Y29uc3QgdmFsaWRhdGUgPSAodmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBUID0+IHtcblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0Rm4odmFsdWUsICcnKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fTtcblx0cmV0dXJuIHsgcHJvdG9jb2wsIHZhbGlkYXRlLCBhc3NlcnRWYWxpZCB9O1xufVxuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuZXhwb3J0IHR5cGUgU2NoZW1hRGVmaW5pdGlvbiA9IFJlY29yZDxzdHJpbmcsIElTY2hlbWFQcm9wZXJ0eTxhbnk+PjtcblxuZXhwb3J0IHR5cGUgU2NoZW1hVmFsdWU8UD4gPSBQIGV4dGVuZHMgSVNjaGVtYVByb3BlcnR5PGluZmVyIFQ+ID8gVCA6IG5ldmVyO1xuXG5leHBvcnQgdHlwZSBTY2hlbWFWYWx1ZXM8RCBleHRlbmRzIFNjaGVtYURlZmluaXRpb24+ID0ge1xuXHRbSyBpbiBrZXlvZiBEXT86IFNjaGVtYVZhbHVlPERbS10+O1xufTtcblxuLyoqXG4gKiBBIGJ1bmRsZSBvZiBuYW1lZCBzY2hlbWEgcHJvcGVydGllcyBwbHVzIGhlbHBlcnMgZm9yIHNlcmlhbGl6aW5nIHRvIHRoZVxuICogcHJvdG9jb2wgc2hhcGUsIHZhbGlkYXRpbmcgYSB2YWx1ZXMgYmFnIGF0IHdyaXRlIHNpdGVzLCBhbmQgdmFsaWRhdGluZ1xuICogYSBzaW5nbGUga2V5IGF0IHJlYWQgc2l0ZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNjaGVtYTxEIGV4dGVuZHMgU2NoZW1hRGVmaW5pdGlvbj4ge1xuXHRyZWFkb25seSBkZWZpbml0aW9uOiBEO1xuXHQvKiogUmV0dXJucyB0aGUgcHJvdG9jb2wtc2VyaWFsaXphYmxlIHNjaGVtYSBmb3IgdGhpcyBidW5kbGUuICovXG5cdHRvUHJvdG9jb2woKTogU2Vzc2lvbkNvbmZpZ1NjaGVtYTtcblx0LyoqXG5cdCAqIFZhbGlkYXRlcyBlYWNoIGtub3duIGtleSBpbiBgdmFsdWVzYCBhZ2FpbnN0IGl0cyBzY2hlbWEgYW5kIHJldHVybnNcblx0ICogYSBuZXcgcGxhaW4gcmVjb3JkLiBUaHJvd3MgYSB7QGxpbmsgUHJvdG9jb2xFcnJvcn0gd2l0aCBhIHBhdGggbGlrZVxuXHQgKiBgJ3Blcm1pc3Npb25zLmFsbG93WzJdJ2Agd2hlbiBhbnkgc3VwcGxpZWQgdmFsdWUgZmFpbHMgdmFsaWRhdGlvbi5cblx0ICogVW5rbm93biBrZXlzIGFyZSBwYXNzZWQgdGhyb3VnaCB1bnRvdWNoZWQgZm9yIGZvcndhcmQtY29tcGF0aWJpbGl0eS5cblx0ICovXG5cdHZhbHVlcyh2YWx1ZXM6IFNjaGVtYVZhbHVlczxEPik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHQvKipcblx0ICogUmV0dXJucyBgdHJ1ZWAgaWZmIGB2YWx1ZWAgdmFsaWRhdGVzIGFnYWluc3QgdGhlIHNjaGVtYSBmb3IgYGtleWAuXG5cdCAqIFVua25vd24ga2V5cyByZXR1cm4gYGZhbHNlYC5cblx0ICovXG5cdHZhbGlkYXRlPEsgZXh0ZW5kcyBrZXlvZiBEICYgc3RyaW5nPihrZXk6IEssIHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgU2NoZW1hVmFsdWU8RFtLXT47XG5cdC8qKlxuXHQgKiBUaHJvd3MgYSB7QGxpbmsgUHJvdG9jb2xFcnJvcn0gZGVzY3JpYmluZyB0aGUgb2ZmZW5kaW5nIHBhdGggd2hlblxuXHQgKiBgdmFsdWVgIGRvZXMgbm90IHZhbGlkYXRlIGFnYWluc3QgdGhlIHNjaGVtYSBmb3IgYGtleWAsIG9yIHdoZW5cblx0ICogYGtleWAgaXMgbm90IGRlZmluZWQgaW4gdGhlIHNjaGVtYS5cblx0ICovXG5cdGFzc2VydFZhbGlkPEsgZXh0ZW5kcyBrZXlvZiBEICYgc3RyaW5nPihrZXk6IEssIHZhbHVlOiB1bmtub3duKTogYXNzZXJ0cyB2YWx1ZSBpcyBTY2hlbWFWYWx1ZTxEW0tdPjtcblx0LyoqXG5cdCAqIFJldHVybnMgYSBmdWxseS10eXBlZCB2YWx1ZXMgYmFnIGJ5IHZhbGlkYXRpbmcgZWFjaCBrZXkgb2YgdGhlXG5cdCAqIHNjaGVtYSBhZ2FpbnN0IGB2YWx1ZXNgIGFuZCBmYWxsaW5nIGJhY2sgdG8gdGhlIGRlZmF1bHQgd2hlblxuXHQgKiB0aGUgaW5jb21pbmcgdmFsdWUgaXMgbWlzc2luZyBvciBmYWlscyB2YWxpZGF0aW9uLlxuXHQgKlxuXHQgKiBTZW1hbnRpY3M6IGZvciBldmVyeSBrZXkgZGVjbGFyZWQgaW4gdGhlIHNjaGVtYSBgZGVmaW5pdGlvbmA6XG5cdCAqIC0gaWYgYHZhbHVlc1trZXldYCB2YWxpZGF0ZXMsIGl0IGlzIGtlcHQ7XG5cdCAqIC0gZWxzZSBpZiBga2V5YCBpcyBwcmVzZW50IGluIGBkZWZhdWx0c2AsIHRoZSBkZWZhdWx0IGlzIHVzZWQ7XG5cdCAqIC0gZWxzZSB0aGUga2V5IGlzIG9taXR0ZWQgZnJvbSB0aGUgcmVzdWx0LlxuXHQgKlxuXHQgKiBUaGlzIG1lYW5zIGNhbGxlcnMgTUFZIHN1cHBseSBkZWZhdWx0cyBmb3Igb25seSBhIHN1YnNldCBvZiB0aGVcblx0ICogc2NoZW1hIFx1MjAxNCBrZXlzIG5vdCBwcmVzZW50IGluIGBkZWZhdWx0c2AgYXJlIHNpbXBseSBsZWZ0IHVuc2V0XG5cdCAqIHdoZW4gdGhlIGluY29taW5nIHZhbHVlIGlzIG1pc3Npbmcgb3IgaW52YWxpZC4gVGhpcyBpcyB1c2VmdWxcblx0ICogd2hlbiBzb21lIHByb3BlcnRpZXMgKGUuZy4gcGVyLXNlc3Npb24gYHBlcm1pc3Npb25zYCkgc2hvdWxkIGJlXG5cdCAqIGluaGVyaXRlZCBmcm9tIGEgaGlnaGVyIHNjb3BlIHJhdGhlciB0aGFuIG1hdGVyaWFsaXplZCBvbiBldmVyeVxuXHQgKiBuZXcgc2Vzc2lvbi5cblx0ICpcblx0ICogSW50ZW5kZWQgZm9yIHNhbml0aXppbmcgdW50cnVzdGVkIGlucHV0IGF0IHByb3RvY29sIGJvdW5kYXJpZXNcblx0ICogKGUuZy4gYHJlc29sdmVTZXNzaW9uQ29uZmlnYCkuIEtleXMgdGhhdCBmYWlsIHZhbGlkYXRpb24gYXJlXG5cdCAqIHNpbGVudGx5IHJlcGxhY2VkIHdpdGggdGhlaXIgZGVmYXVsdCBvciBkcm9wcGVkOyB1c2Vcblx0ICoge0BsaW5rIHZhbHVlc30gb3Ige0BsaW5rIGFzc2VydFZhbGlkfSB3aGVuIHlvdSB3YW50IGEgZGVzY3JpcHRpdmVcblx0ICoge0BsaW5rIFByb3RvY29sRXJyb3J9IGluc3RlYWQuXG5cdCAqL1xuXHR2YWxpZGF0ZU9yRGVmYXVsdDxUIGV4dGVuZHMgUGFydGlhbDx7IFtLIGluIGtleW9mIERdOiBTY2hlbWFWYWx1ZTxEW0tdPiB9Pj4odmFsdWVzOiB7IFtLIGluIGtleW9mIFRdPzogdW5rbm93biB9IHwgdW5kZWZpbmVkLCBkZWZhdWx0czogVCk6IFQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTY2hlbWE8RCBleHRlbmRzIFNjaGVtYURlZmluaXRpb24+KGRlZmluaXRpb246IEQpOiBJU2NoZW1hPEQ+IHtcblx0cmV0dXJuIHtcblx0XHRkZWZpbml0aW9uLFxuXHRcdHRvUHJvdG9jb2woKTogU2Vzc2lvbkNvbmZpZ1NjaGVtYSB7XG5cdFx0XHRjb25zdCBwcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWE+ID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhkZWZpbml0aW9uKSkge1xuXHRcdFx0XHRwcm9wZXJ0aWVzW2tleV0gPSBkZWZpbml0aW9uW2tleV0ucHJvdG9jb2w7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllcyB9O1xuXHRcdH0sXG5cdFx0dmFsdWVzKHZhbHVlcykge1xuXHRcdFx0Y29uc3QgcmF3ID0gdmFsdWVzIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoZGVmaW5pdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSByYXdba2V5XTtcblx0XHRcdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBMb2NhbCB3aXRoIGV4cGxpY2l0IGFubm90YXRpb24gc28gVHlwZVNjcmlwdCBhY2NlcHRzIHRoZVxuXHRcdFx0XHQvLyBhc3NlcnRpb24tc2lnbmF0dXJlIGNhbGwgKHBlciBUUzQxMDQpLlxuXHRcdFx0XHRjb25zdCBwcm9wOiBJU2NoZW1hUHJvcGVydHk8dW5rbm93bj4gPSBkZWZpbml0aW9uW2tleV07XG5cdFx0XHRcdHByb3AuYXNzZXJ0VmFsaWQodmFsdWUsIGtleSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyAuLi5yYXcgfTtcblx0XHR9LFxuXHRcdHZhbGlkYXRlPEsgZXh0ZW5kcyBrZXlvZiBEICYgc3RyaW5nPihrZXk6IEssIHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgU2NoZW1hVmFsdWU8RFtLXT4ge1xuXHRcdFx0Y29uc3QgcHJvcCA9IGRlZmluaXRpb25ba2V5XTtcblx0XHRcdHJldHVybiBwcm9wID8gcHJvcC52YWxpZGF0ZSh2YWx1ZSkgOiBmYWxzZTtcblx0XHR9LFxuXHRcdGFzc2VydFZhbGlkPEsgZXh0ZW5kcyBrZXlvZiBEICYgc3RyaW5nPihrZXk6IEssIHZhbHVlOiB1bmtub3duKTogYXNzZXJ0cyB2YWx1ZSBpcyBTY2hlbWFWYWx1ZTxEW0tdPiB7XG5cdFx0XHRjb25zdCBwcm9wOiBJU2NoZW1hUHJvcGVydHk8dW5rbm93bj4gfCB1bmRlZmluZWQgPSBkZWZpbml0aW9uW2tleV07XG5cdFx0XHRpZiAoIXByb3ApIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcywgYFVua25vd24gc2NoZW1hIGtleSAnJHtrZXl9J2ApO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmUtYmluZCBwb3N0LW5hcnJvd2luZyB0byBrZWVwIHRoZSBjYWxsIHRhcmdldCBleHBsaWNpdGx5IHR5cGVkXG5cdFx0XHQvLyAocmVxdWlyZWQgZm9yIGFzc2VydGlvbi1zaWduYXR1cmUgY2FsbHMsIFRTNDEwNCkuXG5cdFx0XHRjb25zdCBuYXJyb3dlZDogSVNjaGVtYVByb3BlcnR5PHVua25vd24+ID0gcHJvcDtcblx0XHRcdG5hcnJvd2VkLmFzc2VydFZhbGlkKHZhbHVlLCBrZXkpO1xuXHRcdH0sXG5cdFx0dmFsaWRhdGVPckRlZmF1bHQ8VCBleHRlbmRzIFBhcnRpYWw8eyBbSyBpbiBrZXlvZiBEXTogU2NoZW1hVmFsdWU8RFtLXT4gfT4+KHZhbHVlczogeyBbSyBpbiBrZXlvZiBUXT86IHVua25vd24gfSB8IHVuZGVmaW5lZCwgZGVmYXVsdHM6IFQpOiBUIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRcdGNvbnN0IHJhdzogeyBbSyBpbiBrZXlvZiBUXT86IHVua25vd24gfSA9IHZhbHVlcyA/PyB7fTtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGRlZmluaXRpb24pKSB7XG5cdFx0XHRcdGNvbnN0IHByb3AgPSBkZWZpbml0aW9uW2tleV07XG5cdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHJhd1trZXldO1xuXHRcdFx0XHRpZiAoY2FuZGlkYXRlICE9PSB1bmRlZmluZWQgJiYgcHJvcC52YWxpZGF0ZShjYW5kaWRhdGUpKSB7XG5cdFx0XHRcdFx0cmVzdWx0W2tleV0gPSBjYW5kaWRhdGU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGRlZmF1bHRzLCBrZXkpKSB7XG5cdFx0XHRcdFx0cmVzdWx0W2tleV0gPSAoZGVmYXVsdHMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV07XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gZWxzZToga2V5IG5vdCBpbiBkZWZhdWx0cyBhbmQgaW5jb21pbmcgdmFsdWUgbWlzc2luZy9pbnZhbGlkXG5cdFx0XHRcdC8vIFx1MjE5MiBsZWF2ZSB1bnNldCBzbyBoaWdoZXItc2NvcGUgZGVmYXVsdHMgY2FuIGZpbGwgaW4uXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0IGFzIFQ7XG5cdFx0fSxcblx0fTtcbn1cblxuLy8gLS0tLSBWYWxpZGF0b3IgZGVyaXZhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIEEgdmFsaWRhdG9yIHRoYXQgdGhyb3dzIGEge0BsaW5rIFByb3RvY29sRXJyb3J9IGFubm90YXRlZCB3aXRoIHRoZVxuICogb2ZmZW5kaW5nIHBhdGggd2hlbiBgdmFsdWVgIGRvZXMgbm90IGNvbmZvcm0sIG9yIHJldHVybnMgbm9ybWFsbHlcbiAqIHdoZW4gaXQgZG9lcy5cbiAqL1xudHlwZSBBc3NlcnRWYWxpZGF0b3IgPSAodmFsdWU6IHVua25vd24sIHBhdGg6IHN0cmluZykgPT4gdm9pZDtcblxuZnVuY3Rpb24gYnVpbGRBc3NlcnQoc2NoZW1hOiBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWEpOiBBc3NlcnRWYWxpZGF0b3Ige1xuXHRpZiAoc2NoZW1hLnR5cGUgPT09ICdvYmplY3QnICYmIHNjaGVtYS5wcm9wZXJ0aWVzKSB7XG5cdFx0Y29uc3QgcHJvcEFzc2VydHM6IFJlY29yZDxzdHJpbmcsIEFzc2VydFZhbGlkYXRvcj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhzY2hlbWEucHJvcGVydGllcykpIHtcblx0XHRcdHByb3BBc3NlcnRzW2tleV0gPSBidWlsZEFzc2VydChzY2hlbWEucHJvcGVydGllc1trZXldIGFzIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlcXVpcmVkID0gbmV3IFNldChzY2hlbWEucmVxdWlyZWQgPz8gW10pO1xuXHRcdHJldHVybiAodmFsdWUsIHBhdGgpID0+IHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHZhbHVlID09PSBudWxsIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRcdHRocm93IGludmFsaWRQYXJhbXMocGF0aCwgJ29iamVjdCcsIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9iaiA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocHJvcEFzc2VydHMpKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkUGF0aCA9IGpvaW5QYXRoKHBhdGgsIGtleSk7XG5cdFx0XHRcdGlmIChvYmpba2V5XSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKHJlcXVpcmVkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnZhbGlkUGFyYW1zLCBgTWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eSBhdCAnJHtjaGlsZFBhdGh9J2ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcm9wQXNzZXJ0c1trZXldKG9ialtrZXldLCBjaGlsZFBhdGgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblx0aWYgKHNjaGVtYS50eXBlID09PSAnYXJyYXknICYmIHNjaGVtYS5pdGVtcykge1xuXHRcdGNvbnN0IGl0ZW1Bc3NlcnQgPSBidWlsZEFzc2VydChzY2hlbWEuaXRlbXMgYXMgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hKTtcblx0XHRyZXR1cm4gKHZhbHVlLCBwYXRoKSA9PiB7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRcdHRocm93IGludmFsaWRQYXJhbXMocGF0aCwgJ2FycmF5JywgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpdGVtQXNzZXJ0KHZhbHVlW2ldLCBgJHtwYXRofVske2l9XWApO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblx0cmV0dXJuIGJ1aWxkUHJpbWl0aXZlQXNzZXJ0KHNjaGVtYSk7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkUHJpbWl0aXZlQXNzZXJ0KHNjaGVtYTogU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hKTogQXNzZXJ0VmFsaWRhdG9yIHtcblx0Y29uc3QgZW51bUR5bmFtaWMgPSBzY2hlbWEuZW51bUR5bmFtaWMgPT09IHRydWU7XG5cdHJldHVybiAodmFsdWUsIHBhdGgpID0+IHtcblx0XHRzd2l0Y2ggKHNjaGVtYS50eXBlKSB7XG5cdFx0XHRjYXNlICdzdHJpbmcnOiBpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykgeyB0aHJvdyBpbnZhbGlkUGFyYW1zKHBhdGgsICdzdHJpbmcnLCB2YWx1ZSk7IH0gYnJlYWs7XG5cdFx0XHRjYXNlICdudW1iZXInOiBpZiAodHlwZW9mIHZhbHVlICE9PSAnbnVtYmVyJykgeyB0aHJvdyBpbnZhbGlkUGFyYW1zKHBhdGgsICdudW1iZXInLCB2YWx1ZSk7IH0gYnJlYWs7XG5cdFx0XHRjYXNlICdib29sZWFuJzogaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ2Jvb2xlYW4nKSB7IHRocm93IGludmFsaWRQYXJhbXMocGF0aCwgJ2Jvb2xlYW4nLCB2YWx1ZSk7IH0gYnJlYWs7XG5cdFx0XHRjYXNlICdhcnJheSc6IGlmICghQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHsgdGhyb3cgaW52YWxpZFBhcmFtcyhwYXRoLCAnYXJyYXknLCB2YWx1ZSk7IH0gYnJlYWs7XG5cdFx0XHRjYXNlICdvYmplY3QnOiBpZiAodHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCB2YWx1ZSA9PT0gbnVsbCB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSkgeyB0aHJvdyBpbnZhbGlkUGFyYW1zKHBhdGgsICdvYmplY3QnLCB2YWx1ZSk7IH0gYnJlYWs7XG5cdFx0fVxuXHRcdGlmIChzY2hlbWEuZW51bSAmJiAhZW51bUR5bmFtaWMgJiYgIXNjaGVtYS5lbnVtLmluY2x1ZGVzKHZhbHVlIGFzIHN0cmluZykpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBJbnZhbGlkIHZhbHVlIGF0ICcke3BhdGggfHwgJzxyb290Pid9JzogJHtzYWZlU3RyaW5naWZ5KHZhbHVlKX0gaXMgbm90IG9uZSBvZiBbJHtzY2hlbWEuZW51bS5tYXAodiA9PiBKU09OLnN0cmluZ2lmeSh2KSkuam9pbignLCAnKX1dYCk7XG5cdFx0fVxuXHR9O1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkUGFyYW1zKHBhdGg6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZywgdmFsdWU6IHVua25vd24pOiBQcm90b2NvbEVycm9yIHtcblx0cmV0dXJuIG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludmFsaWRQYXJhbXMsIGBJbnZhbGlkIHZhbHVlIGF0ICcke3BhdGggfHwgJzxyb290Pid9JzogZXhwZWN0ZWQgJHtleHBlY3RlZH0sIGdvdCAke3NhZmVTdHJpbmdpZnkodmFsdWUpfWApO1xufVxuXG5mdW5jdGlvbiBqb2luUGF0aChwYXJlbnQ6IHN0cmluZywga2V5OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gcGFyZW50ID8gYCR7cGFyZW50fS4ke2tleX1gIDoga2V5O1xufVxuXG5mdW5jdGlvbiBzYWZlU3RyaW5naWZ5KHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gU3RyaW5nKHZhbHVlKTtcblx0fVxufVxuXG4vLyAtLS0tIFBsYXRmb3JtLW93bmVkIHNjaGVtYSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCB0eXBlIEF1dG9BcHByb3ZlTGV2ZWwgPSAnZGVmYXVsdCcgfCAnYXNzaXN0ZWQnIHwgJ2F1dG9BcHByb3ZlJztcblxuZXhwb3J0IHR5cGUgU2Vzc2lvbk1vZGUgPSAnaW50ZXJhY3RpdmUnIHwgJ3BsYW4nIHwgJ2F1dG9waWxvdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVBlcm1pc3Npb25zVmFsdWUge1xuXHRyZWFkb25seSBhbGxvdzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGRlbnk6IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5jb25zdCBwZXJtaXNzaW9uc1Byb3BlcnR5ID0gc2NoZW1hUHJvcGVydHk8SVBlcm1pc3Npb25zVmFsdWU+KHtcblx0dHlwZTogJ29iamVjdCcsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcucGVybWlzc2lvbnMnLCBcIlBlcm1pc3Npb25zXCIpLFxuXHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zRGVzY3JpcHRpb24nLCBcIlBlci10b29sIHNlc3Npb24gcGVybWlzc2lvbnMuIFVwZGF0ZWQgYXV0b21hdGljYWxseSB3aGVuIGFwcHJvdmluZyBhIHRvb2wgXFxcImluIHRoaXMgU2Vzc2lvblxcXCIuXCIpLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0YWxsb3c6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25zLmFsbG93JywgXCJBbGxvd2VkIHRvb2xzXCIpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcucGVybWlzc2lvbnMudG9vbE5hbWUnLCBcIlRvb2wgbmFtZVwiKSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRkZW55OiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9ucy5kZW55JywgXCJEZW5pZWQgdG9vbHNcIiksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9ucy50b29sTmFtZScsIFwiVG9vbCBuYW1lXCIpLFxuXHRcdFx0fSxcblx0XHR9LFxuXHR9LFxuXHRkZWZhdWx0OiB7IGFsbG93OiBbXSwgZGVueTogW10gfSxcblx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG59KTtcblxuLyoqXG4gKiBTZXNzaW9uLWNvbmZpZyBwcm9wZXJ0aWVzIG93bmVkIGJ5IHRoZSBwbGF0Zm9ybSBpdHNlbGYgXHUyMDE0IGkuZS4gY29uc3VtZWRcbiAqIGJ5IHRoZSBhZ2VudCBob3N0IHJhdGhlciB0aGFuIGJ5IGFueSBwYXJ0aWN1bGFyIGFnZW50LlxuICpcbiAqIEFnZW50cyBleHRlbmQgdGhpcyBzY2hlbWEgYnkgc3ByZWFkaW5nIGBwbGF0Zm9ybVNlc3Npb25TY2hlbWEuZGVmaW5pdGlvbmBcbiAqIGludG8gdGhlaXIgb3duIHtAbGluayBjcmVhdGVTY2hlbWF9IGNhbGwgdG9nZXRoZXIgd2l0aCBhbnlcbiAqIHByb3ZpZGVyLXNwZWNpZmljIHByb3BlcnRpZXMuXG4gKi9cbmV4cG9ydCBjb25zdCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEgPSBjcmVhdGVTY2hlbWEoe1xuXHRbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06IHNjaGVtYVByb3BlcnR5PEF1dG9BcHByb3ZlTGV2ZWw+KHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmF1dG9BcHByb3ZlJywgXCJBcHByb3ZhbHNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5hdXRvQXBwcm92ZURlc2NyaXB0aW9uJywgXCJUb29sIGFwcHJvdmFsIGJlaGF2aW9yIGZvciB0aGlzIHNlc3Npb25cIiksXG5cdFx0ZW51bTogWydkZWZhdWx0JywgJ2Fzc2lzdGVkJywgJ2F1dG9BcHByb3ZlJ10sXG5cdFx0ZW51bUxhYmVsczogW1xuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmF1dG9BcHByb3ZlLmRlZmF1bHQnLCBcIk1hbnVhbCBwZXJtaXNzaW9uc1wiKSxcblx0XHRcdGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5hdXRvQXBwcm92ZS5hc3Npc3RlZCcsIFwiQXNzaXN0ZWQgcGVybWlzc2lvbnNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuYXV0b0FwcHJvdmUuYnlwYXNzJywgXCJBbGxvdyBhbGxcIiksXG5cdFx0XSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuYXV0b0FwcHJvdmUuZGVmYXVsdERlc2NyaXB0aW9uJywgXCJBc2tzIHdoZW4gYXBwcm92YWwgc2V0dGluZ3MgZG9uJ3QgYXBwbHlcIiksXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuYXV0b0FwcHJvdmUuYXNzaXN0ZWREZXNjcmlwdGlvbicsIFwiRXZhbHVhdGVzIHJpc2sgYmVmb3JlIHJ1bm5pbmcgdG9vbHNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuYXV0b0FwcHJvdmUuYnlwYXNzRGVzY3JpcHRpb24nLCBcIlJ1bnMgdG9vbCBjYWxscyB3aXRob3V0IGFza2luZ1wiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRzZXNzaW9uTXV0YWJsZTogdHJ1ZSxcblx0fSksXG5cdFtTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXTogcGVybWlzc2lvbnNQcm9wZXJ0eSxcblx0W1Nlc3Npb25Db25maWdLZXkuTW9kZV06IHNjaGVtYVByb3BlcnR5PFNlc3Npb25Nb2RlPih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5tb2RlJywgXCJBZ2VudCBNb2RlXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcubW9kZURlc2NyaXB0aW9uJywgXCJIb3cgdGhlIGFnZW50IHNob3VsZCBhcHByb2FjaCB0aGlzIHR1cm5cIiksXG5cdFx0ZW51bTogWydpbnRlcmFjdGl2ZScsICdwbGFuJywgJ2F1dG9waWxvdCddLFxuXHRcdGVudW1MYWJlbHM6IFtcblx0XHRcdGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5tb2RlLmludGVyYWN0aXZlJywgXCJJbnRlcmFjdGl2ZVwiKSxcblx0XHRcdGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5tb2RlLnBsYW4nLCBcIlBsYW5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcubW9kZS5hdXRvcGlsb3QnLCBcIkF1dG9waWxvdFwiKSxcblx0XHRdLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5tb2RlLmludGVyYWN0aXZlRGVzY3JpcHRpb24nLCBcIlN0ZXAtYnktc3RlcCBjb2xsYWJvcmF0aW9uXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLm1vZGUucGxhbkRlc2NyaXB0aW9uJywgXCJQbGFuIGZpcnN0LCBleGVjdXRlIHdoZW4gcmVhZHlcIiksXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcubW9kZS5hdXRvcGlsb3REZXNjcmlwdGlvbicsIFwiV29ya3MgYXV0b25vbW91c2x5IHdpdGhpbiBwZXJtaXNzaW9uc1wiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdpbnRlcmFjdGl2ZScsXG5cdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdH0pLFxufSk7XG5cbi8qKlxuICogUmV3cml0ZXMgYSBsZWdhY3kgYGF1dG9BcHByb3ZlPSdhdXRvcGlsb3QnYCBjb25maWcgdmFsdWUgXHUyMDE0IHVzZWQgYmVmb3JlXG4gKiBBdXRvcGlsb3QgbW92ZWQgZnJvbSB0aGUgYGF1dG9BcHByb3ZlYCBheGlzIG9udG8gdGhlIG9ydGhvZ29uYWwgYG1vZGVgXG4gKiBheGlzIFx1MjAxNCBpbnRvIHRoZSBjdXJyZW50IHR3by1heGlzIHNoYXBlOlxuICpcbiAqICAtIGBhdXRvQXBwcm92ZT0nYXV0b3BpbG90J2AgKyBgbW9kZT0ncGxhbidgICBcdTIxOTIgYG1vZGU9J3BsYW4nYCwgYGF1dG9BcHByb3ZlPSdkZWZhdWx0J2BcbiAqICAgIChsZWdhY3kgYHBsYW5gIHRvb2sgcHJlY2VkZW5jZSBvdmVyIGF1dG9waWxvdCB3aGVuIHJlc29sdmluZyB0aGUgU0RLIG1vZGUpLlxuICogIC0gYGF1dG9BcHByb3ZlPSdhdXRvcGlsb3QnYCArIGFueSBvdGhlciBtb2RlIFx1MjE5MiBgbW9kZT0nYXV0b3BpbG90J2AsIGBhdXRvQXBwcm92ZT0nZGVmYXVsdCdgLlxuICpcbiAqIFJldHVybnMgYSBzaGFsbG93IGNvcHkgd2l0aCB0aGUgbWlncmF0aW9uIGFwcGxpZWQsIG9yIHRoZSBvcmlnaW5hbFxuICogcmVmZXJlbmNlIHVuY2hhbmdlZCB3aGVuIG5vIGxlZ2FjeSB2YWx1ZSBpcyBwcmVzZW50LiBTYWZlIHRvIGNhbGwgb25cbiAqIGB1bmRlZmluZWRgLlxuICpcbiAqIFdpdGhvdXQgdGhpcywgYSBzZXNzaW9uIHBlcnNpc3RlZCAob3IgYSBcInJlbWVtYmVyZWRcIiBwaWNrZXIgdmFsdWUgc2VlZGVkKVxuICogd2l0aCBgYXV0b0FwcHJvdmU9J2F1dG9waWxvdCdgIHdvdWxkIGZhaWwgdGhlIG5ldyBzY2hlbWEncyBlbnVtIHZhbGlkYXRpb25cbiAqIGFuZCBzaWxlbnRseSBmYWxsIGJhY2sgdG8gYGRlZmF1bHRgLCBkb3duZ3JhZGluZyB0aGUgc2Vzc2lvbiBmcm9tXG4gKiBhdXRvbm9tb3VzIEF1dG9waWxvdCB0byBtYW51YWwgcGVyLXRvb2wgY29uZmlybWF0aW9uLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWlncmF0ZUxlZ2FjeUF1dG9waWxvdENvbmZpZzxUIGV4dGVuZHMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ+KGNvbmZpZzogVCk6IFQge1xuXHRpZiAoIWNvbmZpZyB8fCBjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV0gIT09ICdhdXRvcGlsb3QnKSB7XG5cdFx0cmV0dXJuIGNvbmZpZztcblx0fVxuXHRjb25zdCBtaWdyYXRlZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLmNvbmZpZyB9O1xuXHRpZiAobWlncmF0ZWRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSAhPT0gJ3BsYW4nKSB7XG5cdFx0bWlncmF0ZWRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSA9ICdhdXRvcGlsb3QnIHNhdGlzZmllcyBTZXNzaW9uTW9kZTtcblx0fVxuXHRtaWdyYXRlZFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXSA9ICdkZWZhdWx0JyBzYXRpc2ZpZXMgQXV0b0FwcHJvdmVMZXZlbDtcblx0cmV0dXJuIG1pZ3JhdGVkIGFzIFQ7XG59XG5cbi8qKlxuICogUm9vdCAoYWdlbnQgaG9zdCkgY29uZmlnIHByb3BlcnRpZXMgb3duZWQgYnkgdGhlIHBsYXRmb3JtIGl0c2VsZi5cbiAqXG4gKiBSb290IGNvbmZpZyBhY3RzIGFzIHRoZSBiYXNlbGluZSB0aGF0IGFwcGxpZXMgdG8gZXZlcnkgc2Vzc2lvbjpcbiAqXG4gKiAtIHtAbGluayBTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zfSBcdTIwMTQgaG9zdC13aWRlIGFsbG93L2RlbnkgbGlzdHNcbiAqICAgdW5pb25lZCB3aXRoIGVhY2ggc2Vzc2lvbidzIG93biBwZXJtaXNzaW9ucyB3aGVuIGV2YWx1YXRpbmcgdG9vbFxuICogICBhdXRvLWFwcHJvdmFsLiBTZWUgYFNlc3Npb25QZXJtaXNzaW9uTWFuYWdlcmAgZm9yIHRoZSBldmFsdWF0aW9uXG4gKiAgIHJ1bGVzLlxuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXkgPSAndGVsZW1ldHJ5TGV2ZWwnO1xuXG4vKiogV2hldGhlciBBZ2VudCBIb3N0IGVkaXQgYXR0cmlidXRpb24gdGVsZW1ldHJ5IGlzIGVuYWJsZWQuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXkgPSAnZWRpdFRlbGVtZXRyeUVuYWJsZWQnO1xuXG4vKiogTGVnYWN5IENvcGlsb3QgQ2hhdCBkZWJ1ZyBzd2l0Y2ggdGhhdCBkaXNhYmxlcyBgcmVxdWVzdC5yZXBvSW5mb2AgY29sbGVjdGlvbi4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXkgPSAnZGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5JztcblxuLyoqIFZTIENvZGUgc2V0dGluZyBmb3J3YXJkZWQgaW50byB7QGxpbmsgQWdlbnRIb3N0RGlzYWJsZVJlcG9JbmZvVGVsZW1ldHJ5Q29uZmlnS2V5fS4gKi9cbmV4cG9ydCBjb25zdCBESVNBQkxFX1JFUE9fSU5GT19URUxFTUVUUllfU0VUVElOR19JRCA9ICdjaGF0LmFkdmFuY2VkLmRlYnVnLmRpc2FibGVSZXBvSW5mb1RlbGVtZXRyeSc7XG5cbi8qKlxuICogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciB3aGVuIFZTIENvZGUnc1xuICogYGNoYXQuc2Vzc2lvblN5bmMuZW5hYmxlZGAgc2V0dGluZyBjaGFuZ2VzLiBDb250cm9scyB0aGUgYHJlbW90ZWAgZmxhZ1xuICogcGFzc2VkIHRvIHRoZSBjb3BpbG90LXNkayBgQ29waWxvdENsaWVudE9wdGlvbnNgLlxuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0U2Vzc2lvblN5bmNFbmFibGVkQ29uZmlnS2V5ID0gJ3Nlc3Npb25TeW5jRW5hYmxlZCc7XG5cbi8qKlxuICogUm9vdCBjb25maWcga2V5IGZvcndhcmRlZCBmcm9tIHRoZSByZW5kZXJlciBjYXJyeWluZyB0aGUgZXhwZXJpbWVudC1hd2FyZVxuICogdmFsdWUgb2YgYGNoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuZW5hYmxlZGAuIFRoZSBob3N0IHJlZ2lzdGVycyB0aGUgQ29kZXhcbiAqIHByb3ZpZGVyIHdoZW4gdGhpcyBpcyBgdHJ1ZWA7IGRpc2FibGluZyByZXF1aXJlcyBhbiBhZ2VudCBob3N0IHJlc3RhcnQuXG4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RDb2RleEVuYWJsZWRDb25maWdLZXkgPSAnY29kZXhBZ2VudEVuYWJsZWQnO1xuXG4vKiogUm9vdCBjb25maWcga2V5IGNhcnJ5aW5nIHRoZSBlZmZlY3RpdmUgZWRpdCBhdXRvLWFwcHJvdmUgcGF0dGVybnMuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0RWRpdEF1dG9BcHByb3ZlUGF0dGVybnNDb25maWdLZXkgPSAnZWRpdEF1dG9BcHByb3ZlUGF0dGVybnMnO1xuXG4vKipcbiAqIFJvb3QgY29uZmlnIGtleSBmb3J3YXJkZWQgZnJvbSB0aGUgcmVuZGVyZXIgd2hlbiBWUyBDb2RlJ3NcbiAqIGBjaGF0LnRvb2xzLnRlcm1pbmFsLmVuYWJsZUF1dG9BcHByb3ZlYCBzZXR0aW5nIGNoYW5nZXMuIENvbnRyb2xzIHdoZXRoZXJcbiAqIGFnZW50LWhvc3Qgc2hlbGwgcGVybWlzc2lvbiBjaGVja3MgbWF5IGFwcGx5IHRlcm1pbmFsIGF1dG8tYXBwcm92ZSBydWxlcy5cbiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5ID0gJ3Rlcm1pbmFsQXV0b0FwcHJvdmVFbmFibGVkJztcblxuLyoqXG4gKiBUaGUgVlMgQ29kZSBzZXR0aW5nIElEIGZvciB0ZXJtaW5hbCBhdXRvIGFwcHJvdmUgZW5hYmxlbWVudC4gRGVmaW5lZCBoZXJlIHNvXG4gKiByZW5kZXJlci1zaWRlIGFnZW50LWhvc3QgY2xpZW50cyBjYW4gZm9yd2FyZCBpdCB3aXRob3V0IGltcG9ydGluZyBmcm9tXG4gKiB3b3JrYmVuY2ggdGVybWluYWwgY29udHJpYnV0aW9ucy5cbiAqL1xuZXhwb3J0IGNvbnN0IFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9FTkFCTEVEX1NFVFRJTkdfSUQgPSAnY2hhdC50b29scy50ZXJtaW5hbC5lbmFibGVBdXRvQXBwcm92ZSc7XG5cbi8qKiBUaGUgVlMgQ29kZSBzZXR0aW5nIElEIGZvciBnbG9iYWwgYXV0byBhcHByb3ZlIGVuYWJsZW1lbnQuICovXG5leHBvcnQgY29uc3QgR0xPQkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEID0gJ2NoYXQudG9vbHMuZ2xvYmFsLmF1dG9BcHByb3ZlJztcblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIHdoZW4gVlMgQ29kZSdzXG4gKiBgY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmVgIHNldHRpbmcgY2hhbmdlcy4gV2hlbiBgdHJ1ZWAsIHRoZSBnbG9iYWxcbiAqIGF1dG8tYXBwcm92ZSAoXCJhcHByb3ZlIGV2ZXJ5dGhpbmdcIikgc2V0dGluZyBpcyBlbmFibGVkIGFuZCB0aGUgYWdlbnQgaG9zdFxuICogdHJlYXRzIGV2ZXJ5IHRvb2wgY2FsbCBhcyBhdXRvLWFwcHJvdmVkIFx1MjAxNCBlcXVpdmFsZW50IHRvIGEgc2Vzc2lvbiBydW5uaW5nXG4gKiB3aXRoIEFsbG93IGFsbC5cbiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSA9ICdnbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQnO1xuXG4vKipcbiAqIFJvb3QgY29uZmlnIGtleSBmb3J3YXJkZWQgZnJvbSB0aGUgcmVuZGVyZXIgd2hlbiBWUyBDb2RlJ3MgYGNoYXQuYXV0b1JlcGx5YFxuICogc2V0dGluZyBjaGFuZ2VzLiBXaGVuIGB0cnVlYCwgdGhlIGFnZW50IGhvc3QgYXV0by1hbnN3ZXJzIGBhc2tfdXNlcmBcbiAqIHF1ZXN0aW9ucyBpbnN0ZWFkIG9mIGJsb2NraW5nIG9uIHRoZSB1c2VyIFx1MjAxNCB0aGUgdXNlciBpcyB0cmVhdGVkIGFzXG4gKiB1bmF2YWlsYWJsZSBhbmQgdGhlIGFnZW50IGlzIHRvbGQgdG8gdXNlIGl0cyBiZXN0IGp1ZGdtZW50LCBtaXJyb3JpbmcgdGhlXG4gKiBiZWhhdmlvciBvZiBgYXV0b3BpbG90YCBtb2RlLlxuICovXG5leHBvcnQgY29uc3QgQWdlbnRIb3N0QXV0b1JlcGx5RW5hYmxlZENvbmZpZ0tleSA9ICdhdXRvUmVwbHlFbmFibGVkJztcblxuZXhwb3J0IGNvbnN0IEFnZW50SG9zdEF1dG9SZXBseUFuc3dlciA9ICdUaGUgdXNlciBpcyBub3QgYXZhaWxhYmxlIHRvIGFuc3dlciB5b3VyIHF1ZXN0aW9uLiBDaG9vc2UgYSBwcmFnbWF0aWMgb3B0aW9uIGJlc3QgYWxpZ25lZCB3aXRoIHRoZSBjb250ZXh0IG9mIHRoZSByZXF1ZXN0Lic7XG5cbi8qKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIGZvciBhdXRvbWF0aWMgT1Mgc3lzdGVtIHByb3h5IGRpc2NvdmVyeS4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RTeXN0ZW1Qcm94eUVuYWJsZWRDb25maWdLZXkgPSAnc3lzdGVtUHJveHlFbmFibGVkJztcblxuLyoqIFJvb3QgY29uZmlnIGtleSBmb3J3YXJkZWQgZnJvbSB0aGUgcmVuZGVyZXIgZm9yIGFjdGl2ZS1hZ2VudCB0aXRsZSBnZW5lcmF0aW9uLiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdEFjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uQ29uZmlnS2V5ID0gJ2FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uJztcblxuLyoqIFJvb3QgY29uZmlnIGtleSBjb250cm9sbGluZyByaWNoLWxpbmsgZ3VpZGFuY2UgZm9yIE1hcmtkb3duIHBsYW4gZG9jdW1lbnRzLiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdE1hcmtkb3duUGxhblJpY2hMaW5rc0VuYWJsZWRDb25maWdLZXkgPSAnbWFya2Rvd25QbGFuUmljaExpbmtzRW5hYmxlZCc7XG5cbi8vIFJvb3QgY29uZmlnIGtleSBmb3J3YXJkZWQgZnJvbSB0aGUgcmVuZGVyZXIgd2hlbiB0aGUgYGNoYXQuYWdlbnRTZXNzaW9ucy5taWdyYXRlTGVnYWN5Q29waWxvdENsaWBcbi8vIHNldHRpbmcgY2hhbmdlcy4gV2hlbiBgdHJ1ZWAsIGBsaXN0U2Vzc2lvbnNgIHN1cmZhY2VzIHVuLWFkb3B0ZWQgZXh0ZW5zaW9uLWhvc3QgQ29waWxvdCBDTElcbi8vIHNlc3Npb25zIGFzIGFkb3B0YWJsZSBhZ2VudC1ob3N0IHNlc3Npb25zLCBhbmQgb3BlbmluZyBvbmUgYWRvcHRzIGl0IGluIHBsYWNlLiBFeHBlcmltZW50YWw7IG9mZi5cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RNaWdyYXRlTGVnYWN5Q29waWxvdENsaUVuYWJsZWRDb25maWdLZXkgPSAnbWlncmF0ZUxlZ2FjeUNvcGlsb3RDbGlFbmFibGVkJztcblxuZXhwb3J0IGNvbnN0IEFnZW50SG9zdFNob3dFeHRlcm5hbFNlc3Npb25zQ29uZmlnS2V5ID0gJ3Nob3dFeHRlcm5hbFNlc3Npb25zJztcblxuZXhwb3J0IGNvbnN0IGVudW0gQWdlbnRIb3N0RXh0ZXJuYWxTZXNzaW9uc01vZGUge1xuXHROb25lID0gJ25vbmUnLFxuXHRBbGwgPSAnYWxsJyxcblx0TGFzdDI0SG91cnMgPSAnbGFzdDI0SG91cnMnLFxuXHRMYXN0N0RheXMgPSAnbGFzdDdEYXlzJyxcbn1cblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIHRoYXQgZ2F0ZXMgbXVsdGlwbGUtd29ya2luZy1kaXJlY3RvcnlcbiAqIHN1cHBvcnQgZm9yIHRoZSBDb3BpbG90IHByb3ZpZGVyLiBXaGVuIGB0cnVlYCwgdGhlIENvcGlsb3QgcHJvdmlkZXIgYWR2ZXJ0aXNlc1xuICogdGhlIGBtdWx0aXBsZVdvcmtpbmdEaXJlY3Rvcmllc2AgY2FwYWJpbGl0eS4gTWlycm9ycyB0aGUgaGlkZGVuXG4gKiBgY2hhdC5hZ2VudEhvc3QuY29waWxvdEFnZW50Lm11bHRpUm9vdEVuYWJsZWRgIFZTIENvZGUgc2V0dGluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdENvcGlsb3RNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5ID0gJ2NvcGlsb3RNdWx0aVJvb3RFbmFibGVkJztcblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIHRoYXQgZ2F0ZXMgbXVsdGlwbGUtd29ya2luZy1kaXJlY3RvcnlcbiAqIHN1cHBvcnQgZm9yIHRoZSBDbGF1ZGUgcHJvdmlkZXIuIFdoZW4gYHRydWVgLCB0aGUgQ2xhdWRlIHByb3ZpZGVyIGFkdmVydGlzZXNcbiAqIHRoZSBgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXNgIGNhcGFiaWxpdHkuIE1pcnJvcnMgdGhlIGhpZGRlblxuICogYGNoYXQuYWdlbnRIb3N0LmNsYXVkZUFnZW50Lm11bHRpUm9vdEVuYWJsZWRgIFZTIENvZGUgc2V0dGluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRDb25maWdLZXkgPSAnY2xhdWRlTXVsdGlSb290RW5hYmxlZCc7XG5cbi8qKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIHRoYXQgZ2F0ZXMgQ29kZXggbXVsdGlwbGUtd29ya2luZy1kaXJlY3Rvcnkgc3VwcG9ydC4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXkgPSAnY29kZXhNdWx0aVJvb3RFbmFibGVkJztcblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgZm9yd2FyZGVkIGZyb20gdGhlIHJlbmRlcmVyIHdoZW4gVlMgQ29kZSdzXG4gKiBgY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZWAgc2V0dGluZyBjaGFuZ2VzLiBIb2xkcyB0aGUgZWZmZWN0aXZlXG4gKiB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZSBvYmplY3QgZm9yIGFnZW50LWhvc3Qgc2hlbGwgcGVybWlzc2lvbiBjaGVja3MuXG4gKi9cbmV4cG9ydCBjb25zdCBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWdLZXkgPSAndGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGUge1xuXHRyZWFkb25seSBhcHByb3ZlOiBib29sZWFuO1xuXHRyZWFkb25seSBtYXRjaENvbW1hbmRMaW5lPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVWYWx1ZSA9IGJvb2xlYW4gfCBudWxsIHwgSUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlO1xuZXhwb3J0IHR5cGUgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzID0gUmVjb3JkPHN0cmluZywgQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVWYWx1ZT47XG5cbi8qKlxuICogVGhlIFZTIENvZGUgc2V0dGluZyBJRHMgZm9yIHRlcm1pbmFsIGF1dG8gYXBwcm92ZSBydWxlcy4gRGVmaW5lZCBoZXJlIHNvXG4gKiByZW5kZXJlci1zaWRlIGFnZW50LWhvc3QgY2xpZW50cyBjYW4gZm9yd2FyZCB0aGVtIHdpdGhvdXQgaW1wb3J0aW5nIGZyb21cbiAqIHdvcmtiZW5jaCB0ZXJtaW5hbCBjb250cmlidXRpb25zLlxuICovXG5leHBvcnQgY29uc3QgVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQgPSAnY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZSc7XG5leHBvcnQgY29uc3QgVEVSTUlOQUxfSUdOT1JFX0RFRkFVTFRfQVVUT19BUFBST1ZFX1JVTEVTX1NFVFRJTkdfSUQgPSAnY2hhdC50b29scy50ZXJtaW5hbC5pZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWcoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSk6IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB7XG5cdGNvbnN0IGNvbmZpZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB8IHVuZGVmaW5lZD4oVEVSTUlOQUxfQVVUT19BUFBST1ZFX1NFVFRJTkdfSUQpO1xuXHRjb25zdCBjb25maWdJbnNwZWN0VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4+KFRFUk1JTkFMX0FVVE9fQVBQUk9WRV9TRVRUSU5HX0lEKTtcblx0Y29uc3QgaWdub3JlRGVmYXVsdHMgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihURVJNSU5BTF9JR05PUkVfREVGQVVMVF9BVVRPX0FQUFJPVkVfUlVMRVNfU0VUVElOR19JRCkgPT09IHRydWU7XG5cdHJldHVybiBub3JtYWxpemVBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXNDb25maWcoY29uZmlnLCBjb25maWdJbnNwZWN0VmFsdWUsIGlnbm9yZURlZmF1bHRzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZyhjb25maWc6IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB8IHVuZGVmaW5lZCwgY29uZmlnSW5zcGVjdFZhbHVlOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4+LCBpZ25vcmVEZWZhdWx0czogYm9vbGVhbik6IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyB7XG5cdGlmICghY29uZmlnKSB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cblx0Y29uc3QgcnVsZXM6IEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcyA9IHt9O1xuXHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhjb25maWcpKSB7XG5cdFx0aWYgKGlnbm9yZURlZmF1bHRzICYmIGlzRGVmYXVsdE9ubHlBdXRvQXBwcm92ZVJ1bGUoa2V5LCB2YWx1ZSwgY29uZmlnSW5zcGVjdFZhbHVlKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHJ1bGVzW2tleV0gPSB2YWx1ZTtcblx0fVxuXHRyZXR1cm4gcnVsZXM7XG59XG5cbmZ1bmN0aW9uIGlzRGVmYXVsdE9ubHlBdXRvQXBwcm92ZVJ1bGUoa2V5OiBzdHJpbmcsIHZhbHVlOiBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZVZhbHVlLCBjb25maWdJbnNwZWN0VmFsdWU6IElDb25maWd1cmF0aW9uVmFsdWU8UmVhZG9ubHk8QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzPj4pOiBib29sZWFuIHtcblx0Y29uc3QgZGVmYXVsdFZhbHVlID0gY29uZmlnSW5zcGVjdFZhbHVlLmRlZmF1bHQ/LnZhbHVlO1xuXHRjb25zdCBpc0RlZmF1bHRSdWxlID0gaGFzTWF0Y2hpbmdSdWxlKGRlZmF1bHRWYWx1ZSwga2V5LCB2YWx1ZSk7XG5cdGlmICghaXNEZWZhdWx0UnVsZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IHNvdXJjZVRhcmdldCA9IGdldEF1dG9BcHByb3ZlUnVsZVNvdXJjZVRhcmdldChrZXksIHZhbHVlLCBjb25maWdJbnNwZWN0VmFsdWUpO1xuXG5cdHJldHVybiBzb3VyY2VUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVDtcbn1cblxuZnVuY3Rpb24gZ2V0QXV0b0FwcHJvdmVSdWxlU291cmNlVGFyZ2V0KGtleTogc3RyaW5nLCB2YWx1ZTogQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVWYWx1ZSwgY29uZmlnSW5zcGVjdFZhbHVlOiBJQ29uZmlndXJhdGlvblZhbHVlPFJlYWRvbmx5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4+KTogQ29uZmlndXJhdGlvblRhcmdldCB7XG5cdGlmIChoYXNNYXRjaGluZ1J1bGUoY29uZmlnSW5zcGVjdFZhbHVlLndvcmtzcGFjZUZvbGRlclZhbHVlLCBrZXksIHZhbHVlKSkge1xuXHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI7XG5cdH1cblx0aWYgKGhhc01hdGNoaW5nUnVsZShjb25maWdJbnNwZWN0VmFsdWUud29ya3NwYWNlVmFsdWUsIGtleSwgdmFsdWUpKSB7XG5cdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHR9XG5cdGlmIChoYXNNYXRjaGluZ1J1bGUoY29uZmlnSW5zcGVjdFZhbHVlLnVzZXJSZW1vdGVWYWx1ZSwga2V5LCB2YWx1ZSkpIHtcblx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTtcblx0fVxuXHRpZiAoaGFzTWF0Y2hpbmdSdWxlKGNvbmZpZ0luc3BlY3RWYWx1ZS51c2VyTG9jYWxWYWx1ZSwga2V5LCB2YWx1ZSkpIHtcblx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMO1xuXHR9XG5cdGlmIChoYXNNYXRjaGluZ1J1bGUoY29uZmlnSW5zcGVjdFZhbHVlLnVzZXJWYWx1ZSwga2V5LCB2YWx1ZSkpIHtcblx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHR9XG5cdGlmIChoYXNNYXRjaGluZ1J1bGUoY29uZmlnSW5zcGVjdFZhbHVlLmFwcGxpY2F0aW9uVmFsdWUsIGtleSwgdmFsdWUpKSB7XG5cdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT047XG5cdH1cblx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVDtcbn1cblxuZnVuY3Rpb24gaGFzTWF0Y2hpbmdSdWxlKGNvbmZpZzogUmVhZG9ubHk8QWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzPiB8IHVuZGVmaW5lZCwga2V5OiBzdHJpbmcsIHZhbHVlOiBBZ2VudEhvc3RUZXJtaW5hbEF1dG9BcHByb3ZlUnVsZVZhbHVlKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIWNvbmZpZyAmJiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoY29uZmlnLCBrZXkpICYmIHN0cnVjdHVyYWxFcXVhbHMoY29uZmlnW2tleV0sIHZhbHVlKTtcbn1cblxuLyoqXG4gKiBSb290IGNvbmZpZyBrZXkgaG9sZGluZyBhZ2VudC1ob3N0LWxldmVsIE1DUCBzZXJ2ZXIgZGVmaW5pdGlvbnMuXG4gKlxuICogVGhlIHZhbHVlIGlzIGEgbWFwIG9mIHNlcnZlciBuYW1lIFx1MjE5MiB7QGxpbmsgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb259XG4gKiAodGhlIHNhbWUgYHNlcnZlcnNgIHNoYXBlIHVzZWQgYnkgYG1jcC5qc29uYCkuIFRoZXNlIHNlcnZlcnMgYXJlXG4gKiBleHBvc2VkIHRvIGV2ZXJ5IHNlc3Npb24gY3JlYXRlZCBieSB0aGUgaG9zdCwgbWVyZ2VkIHdpdGggYW55XG4gKiBwbHVnaW4tcHJvdmlkZWQgTUNQIHNlcnZlcnMgd2hlbiBsYXVuY2hpbmcgdGhlIGNvcGlsb3Qtc2RrIGNsaWVudC5cbiAqL1xuZXhwb3J0IGNvbnN0IEFnZW50SG9zdE1jcFNlcnZlcnNDb25maWdLZXkgPSAnbWNwU2VydmVycyc7XG5cbi8qKlxuICogTWFwIG9mIHNlcnZlciBuYW1lIFx1MjE5MiBNQ1Agc2VydmVyIGNvbmZpZ3VyYXRpb24sIGFzIHN0b3JlZCBpbiB0aGVcbiAqIHtAbGluayBBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5fSByb290IGNvbmZpZyB2YWx1ZS5cbiAqL1xuZXhwb3J0IHR5cGUgQWdlbnRIb3N0TWNwU2VydmVycyA9IFJlY29yZDxzdHJpbmcsIElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uPjtcblxuZXhwb3J0IGZ1bmN0aW9uIHRlbGVtZXRyeUxldmVsVG9BZ2VudEhvc3RDb25maWdWYWx1ZSh0ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWwpOiBUZWxlbWV0cnlDb25maWd1cmF0aW9uIHtcblx0c3dpdGNoICh0ZWxlbWV0cnlMZXZlbCkge1xuXHRcdGNhc2UgVGVsZW1ldHJ5TGV2ZWwuTk9ORTpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9GRjtcblx0XHRjYXNlIFRlbGVtZXRyeUxldmVsLkNSQVNIOlxuXHRcdFx0cmV0dXJuIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uQ1JBU0g7XG5cdFx0Y2FzZSBUZWxlbWV0cnlMZXZlbC5FUlJPUjpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlDb25maWd1cmF0aW9uLkVSUk9SO1xuXHRcdGNhc2UgVGVsZW1ldHJ5TGV2ZWwuVVNBR0U6XG5cdFx0XHRyZXR1cm4gVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PTjtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYWdlbnRIb3N0Q29uZmlnVmFsdWVUb1RlbGVtZXRyeUxldmVsKHZhbHVlOiB1bmtub3duKTogVGVsZW1ldHJ5TGV2ZWwgfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0Y2FzZSBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9GRjpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlMZXZlbC5OT05FO1xuXHRcdGNhc2UgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5DUkFTSDpcblx0XHRcdHJldHVybiBUZWxlbWV0cnlMZXZlbC5DUkFTSDtcblx0XHRjYXNlIFRlbGVtZXRyeUNvbmZpZ3VyYXRpb24uRVJST1I6XG5cdFx0XHRyZXR1cm4gVGVsZW1ldHJ5TGV2ZWwuRVJST1I7XG5cdFx0Y2FzZSBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9OOlxuXHRcdFx0cmV0dXJuIFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogRmllbGQgZGVzY3JpcHRvcnMgZm9yIGEgc2luZ2xlIE1DUCBzZXJ2ZXIgZW50cnksIHNoYXJlZCBieSB0aGUgc3RkaW8gYW5kXG4gKiBodHRwIHNoYXBlcy4gVGhlIGFnZW50LWhvc3QgY29uZmlnIHNjaGVtYSBoYXMgbm8gYG9uZU9mYCwgc28gYm90aCB2YXJpYW50cydcbiAqIGZpZWxkcyBhcmUgZGVzY3JpYmVkIHRvZ2V0aGVyOyBgdHlwZWAgc2VsZWN0cyB3aGljaCBmaWVsZHMgYXBwbHlcbiAqIChgc3RkaW9gIHVzZXMgYGNvbW1hbmRgL2BhcmdzYC9gZW52YC9gY3dkYCwgYGh0dHBgIHVzZXMgYHVybGAvYGhlYWRlcnNgKS5cbiAqL1xuY29uc3QgbWNwU2VydmVyQ29uZmlnUHJvcGVydGllczogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiA9IHtcblx0dHlwZToge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnR5cGUudGl0bGUnLCBcIlNlcnZlciBUeXBlXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnR5cGUuZGVzY3JpcHRpb24nLCBcIlRoZSB0cmFuc3BvcnQgdXNlZCB0byByZWFjaCB0aGUgc2VydmVyOiBgc3RkaW9gIGZvciBhIGxvY2FsIGNvbW1hbmQsIGBodHRwYCBmb3IgYSByZW1vdGUgZW5kcG9pbnQuXCIpLFxuXHRcdGVudW06IFsnc3RkaW8nLCAnaHR0cCddLFxuXHR9LFxuXHRjb21tYW5kOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuY29tbWFuZC50aXRsZScsIFwiQ29tbWFuZFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5jb21tYW5kLmRlc2NyaXB0aW9uJywgXCJGb3IgYHN0ZGlvYCBzZXJ2ZXJzLCB0aGUgZXhlY3V0YWJsZSB0byBzcGF3bi5cIiksXG5cdH0sXG5cdGFyZ3M6IHtcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmFyZ3MudGl0bGUnLCBcIkFyZ3VtZW50c1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5hcmdzLmRlc2NyaXB0aW9uJywgXCJGb3IgYHN0ZGlvYCBzZXJ2ZXJzLCB0aGUgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZC5cIiksXG5cdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmFyZy50aXRsZScsIFwiQXJndW1lbnRcIikgfSxcblx0fSxcblx0ZW52OiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuZW52LnRpdGxlJywgXCJFbnZpcm9ubWVudFwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5lbnYuZGVzY3JpcHRpb24nLCBcIkZvciBgc3RkaW9gIHNlcnZlcnMsIGVudmlyb25tZW50IHZhcmlhYmxlcyBzZXQgb24gdGhlIHNwYXduZWQgcHJvY2Vzcy5cIiksXG5cdH0sXG5cdGN3ZDoge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmN3ZC50aXRsZScsIFwiV29ya2luZyBEaXJlY3RvcnlcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuY3dkLmRlc2NyaXB0aW9uJywgXCJGb3IgYHN0ZGlvYCBzZXJ2ZXJzLCB0aGUgd29ya2luZyBkaXJlY3RvcnkgdGhlIGNvbW1hbmQgcnVucyBpbi5cIiksXG5cdH0sXG5cdHVybDoge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnVybC50aXRsZScsIFwiVVJMXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnVybC5kZXNjcmlwdGlvbicsIFwiRm9yIGBodHRwYCBzZXJ2ZXJzLCB0aGUgZW5kcG9pbnQgVVJMIG9mIHRoZSBNQ1Agc2VydmVyLlwiKSxcblx0fSxcblx0aGVhZGVyczoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmhlYWRlcnMudGl0bGUnLCBcIkhlYWRlcnNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1jcFNlcnZlcnMuaGVhZGVycy5kZXNjcmlwdGlvbicsIFwiRm9yIGBodHRwYCBzZXJ2ZXJzLCBIVFRQIGhlYWRlcnMgc2VudCB3aXRoIGV2ZXJ5IHJlcXVlc3QuXCIpLFxuXHR9LFxufTtcblxuLyoqXG4gKiBEb2N1bWVudHMgdGhlIHZhbHVlIHNoYXBlIG9mIHRoZSB7QGxpbmsgQWdlbnRIb3N0TWNwU2VydmVyc0NvbmZpZ0tleX0gbWFwLlxuICpcbiAqIFRoZSBjb25maWcgdmFsdWUgaXMgYSBtYXAgb2Ygc2VydmVyIG5hbWUgXHUyMTkyIHNlcnZlciBjb25maWcuIFRoZSBzY2hlbWFcbiAqIGxhbmd1YWdlIGhhcyBubyBgYWRkaXRpb25hbFByb3BlcnRpZXNgLCBzbyB0aGUgcGVyLWVudHJ5IHNoYXBlIGlzIGF0dGFjaGVkXG4gKiB1bmRlciBhIHBsYWNlaG9sZGVyIGtleSAoYDxzZXJ2ZXJOYW1lPmApIHJhdGhlciB0aGFuIGF0IHRoZSBtYXAgbGV2ZWwgXHUyMDE0XG4gKiB0aGlzIGtlZXBzIHRoZSBmaWVsZCBkZXNjcmlwdGlvbnMgZGlzY292ZXJhYmxlIHdpdGhvdXQgdGhlIHJ1bnRpbWVcbiAqIHZhbGlkYXRvciBtaXN0YWtpbmcgYSByZWFsIHNlcnZlciBuYW1lZCBlLmcuIGBjb21tYW5kYCBmb3IgdGhlIGBjb21tYW5kYFxuICogZmllbGQuIFJlYWwgZW50cmllcyAoa2V5ZWQgYnkgYWN0dWFsIHNlcnZlciBuYW1lcykgYXJlIHBhc3NlZCB0aHJvdWdoLlxuICovXG5jb25zdCBtY3BTZXJ2ZXJzVmFsdWVQcm9wZXJ0aWVzOiBSZWNvcmQ8c3RyaW5nLCBTZXNzaW9uQ29uZmlnUHJvcGVydHlTY2hlbWE+ID0ge1xuXHQnPHNlcnZlck5hbWU+Jzoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmVudHJ5LnRpdGxlJywgXCJNQ1AgU2VydmVyXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLmVudHJ5LmRlc2NyaXB0aW9uJywgXCJBIHNpbmdsZSBNQ1Agc2VydmVyIGVudHJ5LiBUaGUgcHJvcGVydHkga2V5IGlzIHRoZSBzZXJ2ZXIgbmFtZS5cIiksXG5cdFx0cHJvcGVydGllczogbWNwU2VydmVyQ29uZmlnUHJvcGVydGllcyxcblx0fSxcbn07XG5cbmV4cG9ydCBjb25zdCBwbGF0Zm9ybVJvb3RTY2hlbWEgPSBjcmVhdGVTY2hlbWEoe1xuXHRbU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc106IHBlcm1pc3Npb25zUHJvcGVydHksXG5cdFtBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5kaXNhYmxlUmVwb0luZm9UZWxlbWV0cnkudGl0bGUnLCBcIkRpc2FibGUgUmVwb3NpdG9yeSBJbmZvcm1hdGlvbiBUZWxlbWV0cnlcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmRpc2FibGVSZXBvSW5mb1RlbGVtZXRyeS5kZXNjcmlwdGlvbicsIFwiV2hldGhlciByZXBvc2l0b3J5IGluZm9ybWF0aW9uIHRlbGVtZXRyeSBpcyBkaXNhYmxlZCBmb3IgQWdlbnQgSG9zdCBzZXNzaW9ucy5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0VGVsZW1ldHJ5TGV2ZWxDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxUZWxlbWV0cnlDb25maWd1cmF0aW9uPih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLnRlbGVtZXRyeUxldmVsLnRpdGxlJywgXCJUZWxlbWV0cnkgTGV2ZWxcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLnRlbGVtZXRyeUxldmVsLmRlc2NyaXB0aW9uJywgXCJNb3N0IHJlc3RyaWN0aXZlIHRlbGVtZXRyeSBsZXZlbCByZXF1ZXN0ZWQgYnkgY29ubmVjdGVkIGNsaWVudHMuXCIpLFxuXHRcdGVudW06IFtUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9OLCBUZWxlbWV0cnlDb25maWd1cmF0aW9uLkVSUk9SLCBUZWxlbWV0cnlDb25maWd1cmF0aW9uLkNSQVNILCBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9GRl0sXG5cdFx0ZGVmYXVsdDogVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PTixcblx0fSksXG5cdFtBZ2VudEhvc3RFZGl0VGVsZW1ldHJ5RW5hYmxlZENvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmVkaXRUZWxlbWV0cnlFbmFibGVkLnRpdGxlJywgXCJFZGl0IFRlbGVtZXRyeVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuZWRpdFRlbGVtZXRyeUVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgZWRpdCBhdHRyaWJ1dGlvbiB0ZWxlbWV0cnkgaXMgZW5hYmxlZCBmb3IgQWdlbnQgSG9zdCBzZXNzaW9ucy5cIiksXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSksXG5cdFtBZ2VudEhvc3RTZXNzaW9uU3luY0VuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5zZXNzaW9uU3luY0VuYWJsZWQudGl0bGUnLCBcIlNlc3Npb24gU3luY1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuc2Vzc2lvblN5bmNFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHJlbW90ZSBzZXNzaW9uIHN5bmMgaXMgZW5hYmxlZCBmb3IgdGhlIGNvcGlsb3Qtc2RrIENMSS5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0Q29kZXhFbmFibGVkQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuY29kZXhBZ2VudEVuYWJsZWQudGl0bGUnLCBcIkNvZGV4IEFnZW50XCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5jb2RleEFnZW50RW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0aGUgQ29kZXggcHJvdmlkZXIgaXMgZW5hYmxlZC5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0VGVybWluYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy50ZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZC50aXRsZScsIFwiVGVybWluYWwgQXV0byBBcHByb3ZlXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy50ZXJtaW5hbEF1dG9BcHByb3ZlRW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0ZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMgZm9yd2FyZGVkIGJ5IHRoZSBjb25uZWN0ZWQgY2xpZW50IGFyZSBhbGxvd2VkIHRvIGFwcGx5IHRvIGFnZW50LWhvc3Qgc2hlbGwgcGVybWlzc2lvbiByZXF1ZXN0cy5cIiksXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSksXG5cdFtBZ2VudEhvc3RHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5nbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWQudGl0bGUnLCBcIkdsb2JhbCBBdXRvIEFwcHJvdmVcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciBWUyBDb2RlJ3MgZ2xvYmFsIGF1dG8tYXBwcm92ZSBzZXR0aW5nIGlzIGVuYWJsZWQuIFdoZW4gYHRydWVgLCBldmVyeSB0b29sIGNhbGwgaXMgYXV0by1hcHByb3ZlZCwgZXF1aXZhbGVudCB0byBhIHNlc3Npb24gdXNpbmcgQWxsb3cgYWxsLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0fSksXG5cdFtBZ2VudEhvc3RBdXRvUmVwbHlFbmFibGVkQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuYXV0b1JlcGx5RW5hYmxlZC50aXRsZScsIFwiQXV0byBSZXBseVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuYXV0b1JlcGx5RW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciBWUyBDb2RlJ3MgYXV0by1yZXBseSBzZXR0aW5nIGlzIGVuYWJsZWQuIFdoZW4gYHRydWVgLCBgYXNrX3VzZXJgIHF1ZXN0aW9ucyBhcmUgYXV0by1hbnN3ZXJlZCBpbnN0ZWFkIG9mIGJsb2NraW5nIG9uIHRoZSB1c2VyLCBtaXJyb3JpbmcgYXV0b3BpbG90IG1vZGUuXCIpLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHR9KSxcblx0W0FnZW50SG9zdFN5c3RlbVByb3h5RW5hYmxlZENvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLnN5c3RlbVByb3h5RW5hYmxlZC50aXRsZScsIFwiU3lzdGVtIFByb3h5IERpc2NvdmVyeVwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuc3lzdGVtUHJveHlFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIENvcGlsb3Qgc2Vzc2lvbnMgYXV0b21hdGljYWxseSBkaXNjb3ZlciBhbmQgdXNlIHRoZSBvcGVyYXRpbmcgc3lzdGVtJ3MgcHJveHkgY29uZmlndXJhdGlvbi5cIiksXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSksXG5cdFtBZ2VudEhvc3RBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkNvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmFjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uLnRpdGxlJywgXCJBY3RpdmUgQWdlbnQgVGl0bGUgR2VuZXJhdGlvblwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcuYWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb24uZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdGhlIGFjdGl2ZSBhZ2VudCBuYW1lcyBzZXNzaW9ucyBhbmQgY2hhdHMgd2l0aCByZW5hbWUgdG9vbHMgaW5zdGVhZCBvZiB1dGlsaXR5LW1vZGVsIHRpdGxlIGdlbmVyYXRpb24uXCIpLFxuXHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHR9KSxcblx0W0FnZW50SG9zdE1hcmtkb3duUGxhblJpY2hMaW5rc0VuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tYXJrZG93blBsYW5SaWNoTGlua3NFbmFibGVkLnRpdGxlJywgXCJNYXJrZG93biBQbGFuIFJpY2ggTGlua3NcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLm1hcmtkb3duUGxhblJpY2hMaW5rc0VuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgYWdlbnRzIHJlY2VpdmUgZ3VpZGFuY2UgZm9yIHVzaW5nIHJpY2ggbGlua3MgYW5kIHJ1bm5pbmcgdGFzayBtYXJrZXJzIGluIE1hcmtkb3duIHBsYW4gZG9jdW1lbnRzLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0fSksXG5cdFtBZ2VudEhvc3RNaWdyYXRlTGVnYWN5Q29waWxvdENsaUVuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5taWdyYXRlTGVnYWN5Q29waWxvdENsaUVuYWJsZWQudGl0bGUnLCBcIk1pZ3JhdGUgTGVnYWN5IENvcGlsb3QgQ0xJIFNlc3Npb25zXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5taWdyYXRlTGVnYWN5Q29waWxvdENsaUVuYWJsZWQuZGVzY3JpcHRpb24nLCBcIldoZXRoZXIgdW4tYWRvcHRlZCBleHRlbnNpb24taG9zdCBDb3BpbG90IENMSSBzZXNzaW9ucyBhcmUgc3VyZmFjZWQgYXMgYWRvcHRhYmxlIGFnZW50LWhvc3Qgc2Vzc2lvbnMgYW5kIG1pZ3JhdGVkIGluIHBsYWNlIHdoZW4gb3BlbmVkLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0fSksXG5cdFtBZ2VudEhvc3RTaG93RXh0ZXJuYWxTZXNzaW9uc0NvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlPih7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLnNob3dFeHRlcm5hbFNlc3Npb25zLnRpdGxlJywgXCJTaG93IEV4dGVybmFsIEFnZW50IFNlc3Npb25zXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5zaG93RXh0ZXJuYWxTZXNzaW9ucy5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBzZXNzaW9ucyBjcmVhdGVkIG91dHNpZGUgdGhlIEFnZW50IEhvc3QgYXJlIGluY2x1ZGVkIGluIHRoZSBzZXNzaW9uIGNhdGFsb2cuXCIpLFxuXHRcdGVudW06IFtBZ2VudEhvc3RFeHRlcm5hbFNlc3Npb25zTW9kZS5Ob25lLCBBZ2VudEhvc3RFeHRlcm5hbFNlc3Npb25zTW9kZS5BbGwsIEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlLkxhc3QyNEhvdXJzLCBBZ2VudEhvc3RFeHRlcm5hbFNlc3Npb25zTW9kZS5MYXN0N0RheXNdLFxuXHRcdGRlZmF1bHQ6IEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlLkxhc3Q3RGF5cyxcblx0fSksXG5cdFtBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmNvcGlsb3RNdWx0aVJvb3RFbmFibGVkLnRpdGxlJywgXCJDb3BpbG90IE11bHRpcGxlIFdvcmtpbmcgRGlyZWN0b3JpZXNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmNvcGlsb3RNdWx0aVJvb3RFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRoZSBDb3BpbG90IHByb3ZpZGVyIGFkdmVydGlzZXMgc3VwcG9ydCBmb3IgbXVsdGlwbGUgd29ya2luZyBkaXJlY3RvcmllcywgbGV0dGluZyBhIHNlc3Npb24gc3BhbiBldmVyeSBmb2xkZXIgb2YgYSBtdWx0aS1yb290IHdvcmtzcGFjZS5cIiksXG5cdFx0ZGVmYXVsdDogZmFsc2UsXG5cdH0pLFxuXHRbQWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZENvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PGJvb2xlYW4+KHtcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmNsYXVkZU11bHRpUm9vdEVuYWJsZWQudGl0bGUnLCBcIkNsYXVkZSBNdWx0aXBsZSBXb3JraW5nIERpcmVjdG9yaWVzXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5jbGF1ZGVNdWx0aVJvb3RFbmFibGVkLmRlc2NyaXB0aW9uJywgXCJXaGV0aGVyIHRoZSBDbGF1ZGUgcHJvdmlkZXIgYWR2ZXJ0aXNlcyBzdXBwb3J0IGZvciBtdWx0aXBsZSB3b3JraW5nIGRpcmVjdG9yaWVzLCBsZXR0aW5nIGEgc2Vzc2lvbiBzcGFuIGV2ZXJ5IGZvbGRlciBvZiBhIG11bHRpLXJvb3Qgd29ya3NwYWNlLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0fSksXG5cdFtBZ2VudEhvc3RDb2RleE11bHRpUm9vdEVuYWJsZWRDb25maWdLZXldOiBzY2hlbWFQcm9wZXJ0eTxib29sZWFuPih7XG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5jb2RleE11bHRpUm9vdEVuYWJsZWQudGl0bGUnLCBcIkNvZGV4IE11bHRpcGxlIFdvcmtpbmcgRGlyZWN0b3JpZXNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmNvZGV4TXVsdGlSb290RW5hYmxlZC5kZXNjcmlwdGlvbicsIFwiV2hldGhlciB0aGUgQ29kZXggcHJvdmlkZXIgYWR2ZXJ0aXNlcyBzdXBwb3J0IGZvciBtdWx0aXBsZSB3b3JraW5nIGRpcmVjdG9yaWVzLCBsZXR0aW5nIGEgc2Vzc2lvbiBzcGFuIGV2ZXJ5IGZvbGRlciBvZiBhIG11bHRpLXJvb3Qgd29ya3NwYWNlLlwiKSxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0fSksXG5cdFtBZ2VudEhvc3RFZGl0QXV0b0FwcHJvdmVQYXR0ZXJuc0NvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PENoYXRFZGl0QXV0b0FwcHJvdmVQYXR0ZXJucz4oe1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5lZGl0QXV0b0FwcHJvdmVQYXR0ZXJucy50aXRsZScsIFwiRWRpdCBBdXRvIEFwcHJvdmUgUGF0dGVybnNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QuY29uZmlnLmVkaXRBdXRvQXBwcm92ZVBhdHRlcm5zLmRlc2NyaXB0aW9uJywgXCJFZmZlY3RpdmUgZWRpdCBhdXRvLWFwcHJvdmUgcGF0dGVybnMgZm9yd2FyZGVkIGJ5IHRoZSBjb25uZWN0ZWQgY2xpZW50IGZvciBhZ2VudC1ob3N0IHdyaXRlIHBlcm1pc3Npb24gY2hlY2tzLlwiKSxcblx0XHRkZWZhdWx0OiBERUZBVUxUX0VESVRfQVVUT19BUFBST1ZFX1BBVFRFUk5TLFxuXHR9KSxcblx0W0FnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlc0NvbmZpZ0tleV06IHNjaGVtYVByb3BlcnR5PEFnZW50SG9zdFRlcm1pbmFsQXV0b0FwcHJvdmVSdWxlcz4oe1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy50ZXJtaW5hbEF1dG9BcHByb3ZlUnVsZXMudGl0bGUnLCBcIlRlcm1pbmFsIEF1dG8gQXBwcm92ZSBSdWxlc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcudGVybWluYWxBdXRvQXBwcm92ZVJ1bGVzLmRlc2NyaXB0aW9uJywgXCJUZXJtaW5hbCBhdXRvLWFwcHJvdmUgcnVsZXMgZm9yd2FyZGVkIGJ5IHRoZSBjb25uZWN0ZWQgY2xpZW50IGZvciBhZ2VudC1ob3N0IHNoZWxsIHBlcm1pc3Npb24gY2hlY2tzLlwiKSxcblx0XHRkZWZhdWx0OiB7fSxcblx0fSksXG5cdFtBZ2VudEhvc3RNY3BTZXJ2ZXJzQ29uZmlnS2V5XTogc2NoZW1hUHJvcGVydHk8QWdlbnRIb3N0TWNwU2VydmVycz4oe1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNvbmZpZy5tY3BTZXJ2ZXJzLnRpdGxlJywgXCJNQ1AgU2VydmVyc1wiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5jb25maWcubWNwU2VydmVycy5kZXNjcmlwdGlvbicsIFwiQWdlbnQtaG9zdC1sZXZlbCBNQ1Agc2VydmVycyBleHBvc2VkIHRvIGV2ZXJ5IHNlc3Npb24sIGtleWVkIGJ5IHNlcnZlciBuYW1lLiBFYWNoIHZhbHVlIGlzIGEgc2VydmVyIGNvbmZpZ3VyYXRpb24gKHNlZSBgPHNlcnZlck5hbWU+YCkuXCIpLFxuXHRcdHByb3BlcnRpZXM6IG1jcFNlcnZlcnNWYWx1ZVByb3BlcnRpZXMsXG5cdFx0ZGVmYXVsdDoge30sXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDJCQUFpRjtBQUMxRixTQUFTLDBDQUE0RTtBQUVyRixTQUFT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
