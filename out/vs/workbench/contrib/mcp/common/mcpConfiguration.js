import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { mcpSchemaId } from "../../../services/configuration/common/configuration.js";
import { inputsSchema } from "../../../services/configurationResolver/common/configurationResolverSchema.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
const mcpActivationEventPrefix = "onMcpCollection:";
const mcpActivationEvent = (contributedCollectionId) => mcpActivationEventPrefix + contributedCollectionId;
var DiscoverySource = /* @__PURE__ */ ((DiscoverySource2) => {
  DiscoverySource2["ClaudeDesktop"] = "claude-desktop";
  DiscoverySource2["Windsurf"] = "windsurf";
  DiscoverySource2["CursorGlobal"] = "cursor-global";
  DiscoverySource2["CursorWorkspace"] = "cursor-workspace";
  return DiscoverySource2;
})(DiscoverySource || {});
const allDiscoverySources = Object.keys({
  ["claude-desktop" /* ClaudeDesktop */]: true,
  ["windsurf" /* Windsurf */]: true,
  ["cursor-global" /* CursorGlobal */]: true,
  ["cursor-workspace" /* CursorWorkspace */]: true
});
const discoverySourceLabel = {
  ["claude-desktop" /* ClaudeDesktop */]: localize("mcp.discovery.source.claude-desktop", "Claude Desktop"),
  ["windsurf" /* Windsurf */]: localize("mcp.discovery.source.windsurf", "Windsurf"),
  ["cursor-global" /* CursorGlobal */]: localize("mcp.discovery.source.cursor-global", "Cursor (Global)"),
  ["cursor-workspace" /* CursorWorkspace */]: localize("mcp.discovery.source.cursor-workspace", "Cursor (Workspace)")
};
const discoverySourceSettingsLabel = {
  ["claude-desktop" /* ClaudeDesktop */]: localize("mcp.discovery.source.claude-desktop.config", "Claude Desktop configuration (`claude_desktop_config.json`)"),
  ["windsurf" /* Windsurf */]: localize("mcp.discovery.source.windsurf.config", "Windsurf configurations (`~/.codeium/windsurf/mcp_config.json`)"),
  ["cursor-global" /* CursorGlobal */]: localize("mcp.discovery.source.cursor-global.config", "Cursor global configuration (`~/.cursor/mcp.json`)"),
  ["cursor-workspace" /* CursorWorkspace */]: localize("mcp.discovery.source.cursor-workspace.config", "Cursor workspace configuration (`.cursor/mcp.json`)")
};
const mcpConfigurationSection = "mcp";
const mcpDiscoverySection = "chat.mcp.discovery.enabled";
const mcpServerSamplingSection = "chat.mcp.serverSampling";
const mcpServerCollisionBehaviorSection = "chat.mcp.collisionBehavior";
const mcpEnterpriseManagedAuthIdpSection = "mcp.enterpriseManagedAuth.idp";
var McpCollisionBehavior = /* @__PURE__ */ ((McpCollisionBehavior2) => {
  McpCollisionBehavior2["Disable"] = "disable";
  McpCollisionBehavior2["Suffix"] = "suffix";
  return McpCollisionBehavior2;
})(McpCollisionBehavior || {});
const mcpSchemaExampleServers = {
  "mcp-server-time": {
    command: "python",
    args: ["-m", "mcp_server_time", "--local-timezone=America/Los_Angeles"],
    env: {}
  }
};
const httpSchemaExamples = {
  "my-mcp-server": {
    url: "http://localhost:3001/mcp",
    headers: {}
  }
};
const mcpDevModeProps = (stdio) => ({
  dev: {
    type: "object",
    markdownDescription: localize("app.mcp.dev", "Enabled development mode for the server. When present, the server will be started eagerly and output will be included in its output. Properties inside the `dev` object can configure additional behavior."),
    examples: [{ watch: "src/**/*.ts", debug: { type: "node" } }],
    properties: {
      watch: {
        description: localize("app.mcp.dev.watch", "A glob pattern or list of glob patterns relative to the workspace folder to watch. The MCP server will be restarted when these files change."),
        examples: ["src/**/*.ts"],
        oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }]
      },
      ...stdio && {
        debug: {
          markdownDescription: localize("app.mcp.dev.debug", "If set, debugs the MCP server using the given runtime as it's started."),
          oneOf: [
            {
              type: "object",
              required: ["type"],
              properties: {
                type: {
                  type: "string",
                  enum: ["node"],
                  description: localize("app.mcp.dev.debug.type.node", "Debug the MCP server using Node.js.")
                }
              },
              additionalProperties: false
            },
            {
              type: "object",
              required: ["type"],
              properties: {
                type: {
                  type: "string",
                  enum: ["debugpy"],
                  description: localize("app.mcp.dev.debug.type.python", "Debug the MCP server using Python and debugpy.")
                },
                debugpyPath: {
                  type: "string",
                  description: localize("app.mcp.dev.debug.debugpyPath", "Path to the debugpy executable.")
                }
              },
              additionalProperties: false
            }
          ]
        }
      }
    }
  }
});
const mcpStdioServerSchema = {
  type: "object",
  additionalProperties: false,
  examples: [mcpSchemaExampleServers["mcp-server-time"]],
  properties: {
    type: {
      type: "string",
      enum: ["stdio"],
      description: localize("app.mcp.json.type", "The type of the server.")
    },
    sandboxEnabled: {
      type: "boolean",
      default: false,
      description: localize("app.mcp.json.sandboxEnabled", "Whether to run the server in a sandboxed environment.")
    },
    command: {
      type: "string",
      description: localize("app.mcp.json.command", "The command to run the server.")
    },
    cwd: {
      type: "string",
      description: localize("app.mcp.json.cwd", "The working directory for the server command. Defaults to the workspace folder when run in a workspace."),
      examples: ["${workspaceFolder}"]
    },
    args: {
      type: "array",
      description: localize("app.mcp.args.command", "Arguments passed to the server."),
      items: {
        type: "string"
      }
    },
    envFile: {
      type: "string",
      description: localize("app.mcp.envFile.command", "Path to a file containing environment variables for the server."),
      examples: ["${workspaceFolder}/.env"]
    },
    env: {
      description: localize("app.mcp.env.command", "Environment variables passed to the server."),
      additionalProperties: {
        anyOf: [
          { type: "null" },
          { type: "string" },
          { type: "number" }
        ]
      }
    },
    ...mcpDevModeProps(true)
  }
};
const mcpServerSchema = {
  id: mcpSchemaId,
  type: "object",
  title: localize("app.mcp.json.title", "Model Context Protocol Servers"),
  allowTrailingCommas: true,
  allowComments: true,
  additionalProperties: false,
  properties: {
    sandbox: {
      description: localize("app.mcp.json.sandbox", "Sandbox config that determines file system and network access. Sandboxing is enabled when sandboxEnabled property is set at the server level on Mac OS and Linux only."),
      type: "object",
      additionalProperties: false,
      properties: {
        network: {
          description: localize("app.mcp.json.sandbox.network", "Network access settings for the sandboxed server."),
          type: "object",
          additionalProperties: false,
          properties: {
            allowedDomains: {
              description: localize("app.mcp.json.sandbox.network.allowedDomains", "List of domains that the server is allowed to access. Wildcards are supported, e.g. `*.example.com`."),
              type: "array",
              items: { type: "string" },
              default: []
            },
            deniedDomains: {
              description: localize("app.mcp.json.sandbox.network.deniedDomains", "List of domains that the server is not allowed to access. e.g. `invalid.example.com`."),
              type: "array",
              items: { type: "string" },
              default: []
            }
          }
        },
        filesystem: {
          description: localize("app.mcp.json.sandbox.filesystem", "Filesystem access settings for the sandboxed server. Glob patterns are supported for Mac OS only."),
          type: "object",
          additionalProperties: false,
          properties: {
            denyRead: {
              description: localize("app.mcp.json.sandbox.filesystem.denyRead", "List of file paths that the server is not allowed to read. By default, all files are allowed to be read. e.g. `~/src/secrets`."),
              type: "array",
              items: { type: "string" },
              default: []
            },
            allowWrite: {
              description: localize("app.mcp.json.sandbox.filesystem.allowWrite", "List of file paths that the server is allowed to write to. e.g. `~/src/`."),
              type: "array",
              items: { type: "string" },
              default: []
            },
            denyWrite: {
              description: localize("app.mcp.json.sandbox.filesystem.denyWrite", "List of file paths that the server is not allowed to write to. e.g. `~/src/auth/`."),
              type: "array",
              items: { type: "string" },
              default: []
            }
          }
        }
      }
    },
    servers: {
      examples: [
        mcpSchemaExampleServers,
        httpSchemaExamples
      ],
      additionalProperties: {
        oneOf: [
          mcpStdioServerSchema,
          {
            type: "object",
            additionalProperties: false,
            required: ["url"],
            examples: [httpSchemaExamples["my-mcp-server"]],
            properties: {
              type: {
                type: "string",
                enum: ["http", "sse"],
                description: localize("app.mcp.json.type", "The type of the server.")
              },
              url: {
                type: "string",
                format: "uri",
                pattern: "^https?:\\/\\/.+",
                patternErrorMessage: localize("app.mcp.json.url.pattern", "The URL must start with 'http://' or 'https://'."),
                description: localize("app.mcp.json.url", "The URL of the Streamable HTTP or SSE endpoint.")
              },
              headers: {
                type: "object",
                description: localize("app.mcp.json.headers", "Additional headers sent to the server."),
                additionalProperties: { type: "string" }
              },
              oauth: {
                type: "object",
                description: localize("app.mcp.json.oauth", "OAuth configuration for authenticating with the server."),
                additionalProperties: false,
                minProperties: 1,
                properties: {
                  clientId: {
                    type: "string",
                    minLength: 1,
                    markdownDescription: localize("app.mcp.json.oauth.clientId", "The OAuth client ID to use when authenticating with the server. When `enterpriseManaged` is `true`, this is the **resource** authorization server's client ID (the client trusted by the protected resource), not the IdP's. To set the matching client secret, use the *Set Client Secret* code lens above this field \u2014 secrets are stored in the OS secret store, not in this file.")
                  },
                  enterpriseManaged: {
                    type: "boolean",
                    default: false,
                    markdownDescription: localize("app.mcp.json.oauth.enterpriseManaged", "(Preview) When set to `true`, this MCP server authenticates through the SSO issuer configured by `#mcp.enterpriseManagedAuth.idp#` using OAuth Identity Assertion Authorization Grant (ID-JAG). After a one-time sign-in, subsequent enterprise-managed servers connect silently. The IdP issuer and client credentials are read from the `#mcp.enterpriseManagedAuth.idp#` setting; the `clientId` on this server entry is passed to the resource authorization server.")
                  }
                }
              },
              ...mcpDevModeProps(false)
            }
          }
        ]
      }
    },
    inputs: inputsSchema.definitions.inputs
  }
};
const mcpContributionPoint = {
  extensionPoint: "mcpServerDefinitionProviders",
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.id) {
        yield mcpActivationEvent(contrib.id);
      }
    }
  },
  jsonSchema: {
    description: localize("vscode.extension.contributes.mcp", "Contributes Model Context Protocol servers. Users of this should also use `vscode.lm.registerMcpServerDefinitionProvider`."),
    type: "array",
    defaultSnippets: [{ body: [{ id: "", label: "" }] }],
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { id: "", label: "" } }],
      properties: {
        id: {
          description: localize("vscode.extension.contributes.mcp.id", "Unique ID for the collection."),
          type: "string"
        },
        label: {
          description: localize("vscode.extension.contributes.mcp.label", "Display name for the collection."),
          type: "string"
        },
        when: {
          description: localize("vscode.extension.contributes.mcp.when", "Condition which must be true to enable this collection."),
          type: "string"
        }
      }
    }
  }
};
class McpServerDefinitionsProviderRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.mcpServerDefinitionProviders && Array.isArray(manifest.contributes.mcpServerDefinitionProviders) && manifest.contributes.mcpServerDefinitionProviders.length > 0;
  }
  render(manifest) {
    const mcpServerDefinitionProviders = manifest.contributes?.mcpServerDefinitionProviders ?? [];
    const headers = [localize("id", "ID"), localize("name", "Name")];
    const rows = mcpServerDefinitionProviders.map((mcpServerDefinitionProvider) => {
      return [
        new MarkdownString().appendMarkdown(`\`${mcpServerDefinitionProvider.id}\``),
        mcpServerDefinitionProvider.label
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: mcpConfigurationSection,
  label: localize("mcpServerDefinitionProviders", "MCP Servers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(McpServerDefinitionsProviderRenderer)
});
export {
  DiscoverySource,
  McpCollisionBehavior,
  allDiscoverySources,
  discoverySourceLabel,
  discoverySourceSettingsLabel,
  mcpActivationEvent,
  mcpConfigurationSection,
  mcpContributionPoint,
  mcpDiscoverySection,
  mcpEnterpriseManagedAuthIdpSection,
  mcpSchemaExampleServers,
  mcpServerCollisionBehaviorSection,
  mcpServerSamplingSection,
  mcpServerSchema,
  mcpStdioServerSchema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BDb25maWd1cmF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0LCBJTWNwQ29sbGVjdGlvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBtY3BTY2hlbWFJZCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaW5wdXRzU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJTY2hlbWEuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUG9pbnREZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcblxuY29uc3QgbWNwQWN0aXZhdGlvbkV2ZW50UHJlZml4ID0gJ29uTWNwQ29sbGVjdGlvbjonO1xuXG4vKipcbiAqIG5vdGU6IGBjb250cmlidXRlZENvbGxlY3Rpb25JZGAgaXMgX25vdF8gdGhlIGNvbGxlY3Rpb24gSUQuIFRoZSBjb2xsZWN0aW9uXG4gKiBJRCBpcyBmb3JtZWQgYnkgcGFzc2luZyB0aGUgY29udHJpYnV0ZWQgSUQgdGhyb3VnaCBgZXh0ZW5zaW9uUHJlZml4ZWRJZGVudGlmaWVyYFxuICovXG5leHBvcnQgY29uc3QgbWNwQWN0aXZhdGlvbkV2ZW50ID0gKGNvbnRyaWJ1dGVkQ29sbGVjdGlvbklkOiBzdHJpbmcpID0+XG5cdG1jcEFjdGl2YXRpb25FdmVudFByZWZpeCArIGNvbnRyaWJ1dGVkQ29sbGVjdGlvbklkO1xuXG5leHBvcnQgY29uc3QgZW51bSBEaXNjb3ZlcnlTb3VyY2Uge1xuXHRDbGF1ZGVEZXNrdG9wID0gJ2NsYXVkZS1kZXNrdG9wJyxcblx0V2luZHN1cmYgPSAnd2luZHN1cmYnLFxuXHRDdXJzb3JHbG9iYWwgPSAnY3Vyc29yLWdsb2JhbCcsXG5cdEN1cnNvcldvcmtzcGFjZSA9ICdjdXJzb3Itd29ya3NwYWNlJyxcbn1cblxuZXhwb3J0IGNvbnN0IGFsbERpc2NvdmVyeVNvdXJjZXMgPSBPYmplY3Qua2V5cyh7XG5cdFtEaXNjb3ZlcnlTb3VyY2UuQ2xhdWRlRGVza3RvcF06IHRydWUsXG5cdFtEaXNjb3ZlcnlTb3VyY2UuV2luZHN1cmZdOiB0cnVlLFxuXHRbRGlzY292ZXJ5U291cmNlLkN1cnNvckdsb2JhbF06IHRydWUsXG5cdFtEaXNjb3ZlcnlTb3VyY2UuQ3Vyc29yV29ya3NwYWNlXTogdHJ1ZSxcbn0gc2F0aXNmaWVzIFJlY29yZDxEaXNjb3ZlcnlTb3VyY2UsIHRydWU+KSBhcyBEaXNjb3ZlcnlTb3VyY2VbXTtcblxuZXhwb3J0IGNvbnN0IGRpc2NvdmVyeVNvdXJjZUxhYmVsOiBSZWNvcmQ8RGlzY292ZXJ5U291cmNlLCBzdHJpbmc+ID0ge1xuXHRbRGlzY292ZXJ5U291cmNlLkNsYXVkZURlc2t0b3BdOiBsb2NhbGl6ZSgnbWNwLmRpc2NvdmVyeS5zb3VyY2UuY2xhdWRlLWRlc2t0b3AnLCBcIkNsYXVkZSBEZXNrdG9wXCIpLFxuXHRbRGlzY292ZXJ5U291cmNlLldpbmRzdXJmXTogbG9jYWxpemUoJ21jcC5kaXNjb3Zlcnkuc291cmNlLndpbmRzdXJmJywgXCJXaW5kc3VyZlwiKSxcblx0W0Rpc2NvdmVyeVNvdXJjZS5DdXJzb3JHbG9iYWxdOiBsb2NhbGl6ZSgnbWNwLmRpc2NvdmVyeS5zb3VyY2UuY3Vyc29yLWdsb2JhbCcsIFwiQ3Vyc29yIChHbG9iYWwpXCIpLFxuXHRbRGlzY292ZXJ5U291cmNlLkN1cnNvcldvcmtzcGFjZV06IGxvY2FsaXplKCdtY3AuZGlzY292ZXJ5LnNvdXJjZS5jdXJzb3Itd29ya3NwYWNlJywgXCJDdXJzb3IgKFdvcmtzcGFjZSlcIiksXG59O1xuZXhwb3J0IGNvbnN0IGRpc2NvdmVyeVNvdXJjZVNldHRpbmdzTGFiZWw6IFJlY29yZDxEaXNjb3ZlcnlTb3VyY2UsIHN0cmluZz4gPSB7XG5cdFtEaXNjb3ZlcnlTb3VyY2UuQ2xhdWRlRGVza3RvcF06IGxvY2FsaXplKCdtY3AuZGlzY292ZXJ5LnNvdXJjZS5jbGF1ZGUtZGVza3RvcC5jb25maWcnLCBcIkNsYXVkZSBEZXNrdG9wIGNvbmZpZ3VyYXRpb24gKGBjbGF1ZGVfZGVza3RvcF9jb25maWcuanNvbmApXCIpLFxuXHRbRGlzY292ZXJ5U291cmNlLldpbmRzdXJmXTogbG9jYWxpemUoJ21jcC5kaXNjb3Zlcnkuc291cmNlLndpbmRzdXJmLmNvbmZpZycsIFwiV2luZHN1cmYgY29uZmlndXJhdGlvbnMgKGB+Ly5jb2RlaXVtL3dpbmRzdXJmL21jcF9jb25maWcuanNvbmApXCIpLFxuXHRbRGlzY292ZXJ5U291cmNlLkN1cnNvckdsb2JhbF06IGxvY2FsaXplKCdtY3AuZGlzY292ZXJ5LnNvdXJjZS5jdXJzb3ItZ2xvYmFsLmNvbmZpZycsIFwiQ3Vyc29yIGdsb2JhbCBjb25maWd1cmF0aW9uIChgfi8uY3Vyc29yL21jcC5qc29uYClcIiksXG5cdFtEaXNjb3ZlcnlTb3VyY2UuQ3Vyc29yV29ya3NwYWNlXTogbG9jYWxpemUoJ21jcC5kaXNjb3Zlcnkuc291cmNlLmN1cnNvci13b3Jrc3BhY2UuY29uZmlnJywgXCJDdXJzb3Igd29ya3NwYWNlIGNvbmZpZ3VyYXRpb24gKGAuY3Vyc29yL21jcC5qc29uYClcIiksXG59O1xuXG5leHBvcnQgY29uc3QgbWNwQ29uZmlndXJhdGlvblNlY3Rpb24gPSAnbWNwJztcbmV4cG9ydCBjb25zdCBtY3BEaXNjb3ZlcnlTZWN0aW9uID0gJ2NoYXQubWNwLmRpc2NvdmVyeS5lbmFibGVkJztcbmV4cG9ydCBjb25zdCBtY3BTZXJ2ZXJTYW1wbGluZ1NlY3Rpb24gPSAnY2hhdC5tY3Auc2VydmVyU2FtcGxpbmcnO1xuZXhwb3J0IGNvbnN0IG1jcFNlcnZlckNvbGxpc2lvbkJlaGF2aW9yU2VjdGlvbiA9ICdjaGF0Lm1jcC5jb2xsaXNpb25CZWhhdmlvcic7XG4vKipcbiAqIENvbmZpZ3VyYXRpb24ga2V5IGZvciB0aGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE1DUCBJZFAgYmFnLiBUaGUgc2V0dGluZyBpc1xuICogcmVnaXN0ZXJlZCB3aXRoIGBpbmNsdWRlZDogZmFsc2VgIHNvIGl0IGlzIGhpZGRlbiBmcm9tIHRoZSBTZXR0aW5ncyBVSSBhbmRcbiAqIHNldHRpbmdzLmpzb24gSW50ZWxsaVNlbnNlOyBpdCBpcyBpbnRlbmRlZCB0byBiZSBkZWxpdmVyZWQgdGhyb3VnaCBlbnRlcnByaXNlXG4gKiBwb2xpY3kgKFdpbmRvd3MgR3JvdXAgUG9saWN5IC8gbWFjT1MgbWFuYWdlZCBwcmVmZXJlbmNlcyAvIExpbnV4XG4gKiBgL2V0Yy92c2NvZGUvcG9saWN5Lmpzb25gKSwgd2l0aCBoYW5kLWVkaXRpbmcgb2YgYHNldHRpbmdzLmpzb25gIGFzIGFcbiAqIGRldmVsb3BlciBlc2NhcGUgaGF0Y2guXG4gKi9cbmV4cG9ydCBjb25zdCBtY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBTZWN0aW9uID0gJ21jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwJztcblxuLyoqXG4gKiBTaGFwZSBvZiB0aGUge0BsaW5rIG1jcEVudGVycHJpc2VNYW5hZ2VkQXV0aElkcFNlY3Rpb259IHNldHRpbmcuIEFsbCBmaWVsZHNcbiAqIGFyZSBvcHRpb25hbCBzbyBwYXJ0aWFsIGNvbmZpZ3VyYXRpb25zIChlLmcuIGp1c3QgdGhlIGlzc3VlcikgcmVtYWluIHZhbGlkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElNY3BFbnRlcnByaXNlTWFuYWdlZEF1dGhJZHBDb25maWcge1xuXHRyZWFkb25seSBpc3N1ZXI/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNsaWVudElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBjbGllbnRTZWNyZXQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIE1jcENvbGxpc2lvbkJlaGF2aW9yIHtcblx0RGlzYWJsZSA9ICdkaXNhYmxlJyxcblx0U3VmZml4ID0gJ3N1ZmZpeCcsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1jcFNlcnZlclNhbXBsaW5nQ29uZmlndXJhdGlvbiB7XG5cdGFsbG93ZWREdXJpbmdDaGF0PzogYm9vbGVhbjtcblx0YWxsb3dlZE91dHNpZGVDaGF0PzogYm9vbGVhbjtcblx0YWxsb3dlZE1vZGVscz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgY29uc3QgbWNwU2NoZW1hRXhhbXBsZVNlcnZlcnMgPSB7XG5cdCdtY3Atc2VydmVyLXRpbWUnOiB7XG5cdFx0Y29tbWFuZDogJ3B5dGhvbicsXG5cdFx0YXJnczogWyctbScsICdtY3Bfc2VydmVyX3RpbWUnLCAnLS1sb2NhbC10aW1lem9uZT1BbWVyaWNhL0xvc19BbmdlbGVzJ10sXG5cdFx0ZW52OiB7fSxcblx0fVxufTtcblxuY29uc3QgaHR0cFNjaGVtYUV4YW1wbGVzID0ge1xuXHQnbXktbWNwLXNlcnZlcic6IHtcblx0XHR1cmw6ICdodHRwOi8vbG9jYWxob3N0OjMwMDEvbWNwJyxcblx0XHRoZWFkZXJzOiB7fSxcblx0fVxufTtcblxuY29uc3QgbWNwRGV2TW9kZVByb3BzID0gKHN0ZGlvOiBib29sZWFuKTogSUpTT05TY2hlbWFNYXAgPT4gKHtcblx0ZGV2OiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuZGV2JywgJ0VuYWJsZWQgZGV2ZWxvcG1lbnQgbW9kZSBmb3IgdGhlIHNlcnZlci4gV2hlbiBwcmVzZW50LCB0aGUgc2VydmVyIHdpbGwgYmUgc3RhcnRlZCBlYWdlcmx5IGFuZCBvdXRwdXQgd2lsbCBiZSBpbmNsdWRlZCBpbiBpdHMgb3V0cHV0LiBQcm9wZXJ0aWVzIGluc2lkZSB0aGUgYGRldmAgb2JqZWN0IGNhbiBjb25maWd1cmUgYWRkaXRpb25hbCBiZWhhdmlvci4nKSxcblx0XHRleGFtcGxlczogW3sgd2F0Y2g6ICdzcmMvKiovKi50cycsIGRlYnVnOiB7IHR5cGU6ICdub2RlJyB9IH1dLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHdhdGNoOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5kZXYud2F0Y2gnLCAnQSBnbG9iIHBhdHRlcm4gb3IgbGlzdCBvZiBnbG9iIHBhdHRlcm5zIHJlbGF0aXZlIHRvIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIHRvIHdhdGNoLiBUaGUgTUNQIHNlcnZlciB3aWxsIGJlIHJlc3RhcnRlZCB3aGVuIHRoZXNlIGZpbGVzIGNoYW5nZS4nKSxcblx0XHRcdFx0ZXhhbXBsZXM6IFsnc3JjLyoqLyoudHMnXSxcblx0XHRcdFx0b25lT2Y6IFt7IHR5cGU6ICdzdHJpbmcnIH0sIHsgdHlwZTogJ2FycmF5JywgaXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSB9XSxcblx0XHRcdH0sXG5cdFx0XHQuLi4oc3RkaW8gJiYge1xuXHRcdFx0XHRkZWJ1Zzoge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmRldi5kZWJ1ZycsICdJZiBzZXQsIGRlYnVncyB0aGUgTUNQIHNlcnZlciB1c2luZyB0aGUgZ2l2ZW4gcnVudGltZSBhcyBpdFxcJ3Mgc3RhcnRlZC4nKSxcblx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsndHlwZSddLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ25vZGUnXSxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5kZXYuZGVidWcudHlwZS5ub2RlJywgXCJEZWJ1ZyB0aGUgTUNQIHNlcnZlciB1c2luZyBOb2RlLmpzLlwiKVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsndHlwZSddLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZToge1xuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2RlYnVncHknXSxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5kZXYuZGVidWcudHlwZS5weXRob24nLCBcIkRlYnVnIHRoZSBNQ1Agc2VydmVyIHVzaW5nIFB5dGhvbiBhbmQgZGVidWdweS5cIilcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGRlYnVncHlQYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5kZXYuZGVidWcuZGVidWdweVBhdGgnLCBcIlBhdGggdG8gdGhlIGRlYnVncHkgZXhlY3V0YWJsZS5cIilcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNvbnN0IG1jcFN0ZGlvU2VydmVyU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0ZXhhbXBsZXM6IFttY3BTY2hlbWFFeGFtcGxlU2VydmVyc1snbWNwLXNlcnZlci10aW1lJ11dLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0dHlwZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ3N0ZGlvJ10sXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi50eXBlJywgXCJUaGUgdHlwZSBvZiB0aGUgc2VydmVyLlwiKVxuXHRcdH0sXG5cdFx0c2FuZGJveEVuYWJsZWQ6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24uc2FuZGJveEVuYWJsZWQnLCBcIldoZXRoZXIgdG8gcnVuIHRoZSBzZXJ2ZXIgaW4gYSBzYW5kYm94ZWQgZW52aXJvbm1lbnQuXCIpXG5cdFx0fSxcblx0XHRjb21tYW5kOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLmNvbW1hbmQnLCBcIlRoZSBjb21tYW5kIHRvIHJ1biB0aGUgc2VydmVyLlwiKVxuXHRcdH0sXG5cdFx0Y3dkOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLmN3ZCcsIFwiVGhlIHdvcmtpbmcgZGlyZWN0b3J5IGZvciB0aGUgc2VydmVyIGNvbW1hbmQuIERlZmF1bHRzIHRvIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIHdoZW4gcnVuIGluIGEgd29ya3NwYWNlLlwiKSxcblx0XHRcdGV4YW1wbGVzOiBbJyR7d29ya3NwYWNlRm9sZGVyfSddLFxuXHRcdH0sXG5cdFx0YXJnczoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5hcmdzLmNvbW1hbmQnLCBcIkFyZ3VtZW50cyBwYXNzZWQgdG8gdGhlIHNlcnZlci5cIiksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdGVudkZpbGU6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmVudkZpbGUuY29tbWFuZCcsIFwiUGF0aCB0byBhIGZpbGUgY29udGFpbmluZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZm9yIHRoZSBzZXJ2ZXIuXCIpLFxuXHRcdFx0ZXhhbXBsZXM6IFsnJHt3b3Jrc3BhY2VGb2xkZXJ9Ly5lbnYnXSxcblx0XHR9LFxuXHRcdGVudjoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmVudi5jb21tYW5kJywgXCJFbnZpcm9ubWVudCB2YXJpYWJsZXMgcGFzc2VkIHRvIHRoZSBzZXJ2ZXIuXCIpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdudW1iZXInIH0sXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdC4uLm1jcERldk1vZGVQcm9wcyh0cnVlKSxcblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IG1jcFNlcnZlclNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdGlkOiBtY3BTY2hlbWFJZCxcblx0dHlwZTogJ29iamVjdCcsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnRpdGxlJywgXCJNb2RlbCBDb250ZXh0IFByb3RvY29sIFNlcnZlcnNcIiksXG5cdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdGFsbG93Q29tbWVudHM6IHRydWUsXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0cHJvcGVydGllczoge1xuXHRcdHNhbmRib3g6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnNhbmRib3gnLCBcIlNhbmRib3ggY29uZmlnIHRoYXQgZGV0ZXJtaW5lcyBmaWxlIHN5c3RlbSBhbmQgbmV0d29yayBhY2Nlc3MuIFNhbmRib3hpbmcgaXMgZW5hYmxlZCB3aGVuIHNhbmRib3hFbmFibGVkIHByb3BlcnR5IGlzIHNldCBhdCB0aGUgc2VydmVyIGxldmVsIG9uIE1hYyBPUyBhbmQgTGludXggb25seS5cIiksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bmV0d29yazoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnNhbmRib3gubmV0d29yaycsIFwiTmV0d29yayBhY2Nlc3Mgc2V0dGluZ3MgZm9yIHRoZSBzYW5kYm94ZWQgc2VydmVyLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YWxsb3dlZERvbWFpbnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24uc2FuZGJveC5uZXR3b3JrLmFsbG93ZWREb21haW5zJywgXCJMaXN0IG9mIGRvbWFpbnMgdGhhdCB0aGUgc2VydmVyIGlzIGFsbG93ZWQgdG8gYWNjZXNzLiBXaWxkY2FyZHMgYXJlIHN1cHBvcnRlZCwgZS5nLiBgKi5leGFtcGxlLmNvbWAuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlbmllZERvbWFpbnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24uc2FuZGJveC5uZXR3b3JrLmRlbmllZERvbWFpbnMnLCBcIkxpc3Qgb2YgZG9tYWlucyB0aGF0IHRoZSBzZXJ2ZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzLiBlLmcuIGBpbnZhbGlkLmV4YW1wbGUuY29tYC5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IFtdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmaWxlc3lzdGVtOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24uc2FuZGJveC5maWxlc3lzdGVtJywgXCJGaWxlc3lzdGVtIGFjY2VzcyBzZXR0aW5ncyBmb3IgdGhlIHNhbmRib3hlZCBzZXJ2ZXIuIEdsb2IgcGF0dGVybnMgYXJlIHN1cHBvcnRlZCBmb3IgTWFjIE9TIG9ubHkuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRkZW55UmVhZDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5zYW5kYm94LmZpbGVzeXN0ZW0uZGVueVJlYWQnLCBcIkxpc3Qgb2YgZmlsZSBwYXRocyB0aGF0IHRoZSBzZXJ2ZXIgaXMgbm90IGFsbG93ZWQgdG8gcmVhZC4gQnkgZGVmYXVsdCwgYWxsIGZpbGVzIGFyZSBhbGxvd2VkIHRvIGJlIHJlYWQuIGUuZy4gYH4vc3JjL3NlY3JldHNgLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogW11cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRhbGxvd1dyaXRlOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLnNhbmRib3guZmlsZXN5c3RlbS5hbGxvd1dyaXRlJywgXCJMaXN0IG9mIGZpbGUgcGF0aHMgdGhhdCB0aGUgc2VydmVyIGlzIGFsbG93ZWQgdG8gd3JpdGUgdG8uIGUuZy4gYH4vc3JjL2AuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlbnlXcml0ZToge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5zYW5kYm94LmZpbGVzeXN0ZW0uZGVueVdyaXRlJywgXCJMaXN0IG9mIGZpbGUgcGF0aHMgdGhhdCB0aGUgc2VydmVyIGlzIG5vdCBhbGxvd2VkIHRvIHdyaXRlIHRvLiBlLmcuIGB+L3NyYy9hdXRoL2AuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBbXVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0c2VydmVyczoge1xuXHRcdFx0ZXhhbXBsZXM6IFtcblx0XHRcdFx0bWNwU2NoZW1hRXhhbXBsZVNlcnZlcnMsXG5cdFx0XHRcdGh0dHBTY2hlbWFFeGFtcGxlcyxcblx0XHRcdF0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdG1jcFN0ZGlvU2VydmVyU2NoZW1hLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3VybCddLFxuXHRcdFx0XHRcdFx0ZXhhbXBsZXM6IFtodHRwU2NoZW1hRXhhbXBsZXNbJ215LW1jcC1zZXJ2ZXInXV0sXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2h0dHAnLCAnc3NlJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24udHlwZScsIFwiVGhlIHR5cGUgb2YgdGhlIHNlcnZlci5cIilcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dXJsOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0Zm9ybWF0OiAndXJpJyxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXmh0dHBzPzpcXFxcL1xcXFwvLisnLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm5FcnJvck1lc3NhZ2U6IGxvY2FsaXplKCdhcHAubWNwLmpzb24udXJsLnBhdHRlcm4nLCBcIlRoZSBVUkwgbXVzdCBzdGFydCB3aXRoICdodHRwOi8vJyBvciAnaHR0cHM6Ly8nLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi51cmwnLCBcIlRoZSBVUkwgb2YgdGhlIFN0cmVhbWFibGUgSFRUUCBvciBTU0UgZW5kcG9pbnQuXCIpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FwcC5tY3AuanNvbi5oZWFkZXJzJywgXCJBZGRpdGlvbmFsIGhlYWRlcnMgc2VudCB0byB0aGUgc2VydmVyLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvYXV0aDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXBwLm1jcC5qc29uLm9hdXRoJywgXCJPQXV0aCBjb25maWd1cmF0aW9uIGZvciBhdXRoZW50aWNhdGluZyB3aXRoIHRoZSBzZXJ2ZXIuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRtaW5Qcm9wZXJ0aWVzOiAxLFxuXHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNsaWVudElkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRtaW5MZW5ndGg6IDEsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24ub2F1dGguY2xpZW50SWQnLCBcIlRoZSBPQXV0aCBjbGllbnQgSUQgdG8gdXNlIHdoZW4gYXV0aGVudGljYXRpbmcgd2l0aCB0aGUgc2VydmVyLiBXaGVuIGBlbnRlcnByaXNlTWFuYWdlZGAgaXMgYHRydWVgLCB0aGlzIGlzIHRoZSAqKnJlc291cmNlKiogYXV0aG9yaXphdGlvbiBzZXJ2ZXIncyBjbGllbnQgSUQgKHRoZSBjbGllbnQgdHJ1c3RlZCBieSB0aGUgcHJvdGVjdGVkIHJlc291cmNlKSwgbm90IHRoZSBJZFAncy4gVG8gc2V0IHRoZSBtYXRjaGluZyBjbGllbnQgc2VjcmV0LCB1c2UgdGhlICpTZXQgQ2xpZW50IFNlY3JldCogY29kZSBsZW5zIGFib3ZlIHRoaXMgZmllbGQgXHUyMDE0IHNlY3JldHMgYXJlIHN0b3JlZCBpbiB0aGUgT1Mgc2VjcmV0IHN0b3JlLCBub3QgaW4gdGhpcyBmaWxlLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdGVudGVycHJpc2VNYW5hZ2VkOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdhcHAubWNwLmpzb24ub2F1dGguZW50ZXJwcmlzZU1hbmFnZWQnLCBcIihQcmV2aWV3KSBXaGVuIHNldCB0byBgdHJ1ZWAsIHRoaXMgTUNQIHNlcnZlciBhdXRoZW50aWNhdGVzIHRocm91Z2ggdGhlIFNTTyBpc3N1ZXIgY29uZmlndXJlZCBieSBgI21jcC5lbnRlcnByaXNlTWFuYWdlZEF1dGguaWRwI2AgdXNpbmcgT0F1dGggSWRlbnRpdHkgQXNzZXJ0aW9uIEF1dGhvcml6YXRpb24gR3JhbnQgKElELUpBRykuIEFmdGVyIGEgb25lLXRpbWUgc2lnbi1pbiwgc3Vic2VxdWVudCBlbnRlcnByaXNlLW1hbmFnZWQgc2VydmVycyBjb25uZWN0IHNpbGVudGx5LiBUaGUgSWRQIGlzc3VlciBhbmQgY2xpZW50IGNyZWRlbnRpYWxzIGFyZSByZWFkIGZyb20gdGhlIGAjbWNwLmVudGVycHJpc2VNYW5hZ2VkQXV0aC5pZHAjYCBzZXR0aW5nOyB0aGUgYGNsaWVudElkYCBvbiB0aGlzIHNlcnZlciBlbnRyeSBpcyBwYXNzZWQgdG8gdGhlIHJlc291cmNlIGF1dGhvcml6YXRpb24gc2VydmVyLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Li4ubWNwRGV2TW9kZVByb3BzKGZhbHNlKSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRpbnB1dHM6IGlucHV0c1NjaGVtYS5kZWZpbml0aW9ucyEuaW5wdXRzXG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBtY3BDb250cmlidXRpb25Qb2ludDogSUV4dGVuc2lvblBvaW50RGVzY3JpcHRvcjxJTWNwQ29sbGVjdGlvbkNvbnRyaWJ1dGlvbltdPiA9IHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdtY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzJyxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChjb250cmlicykge1xuXHRcdGZvciAoY29uc3QgY29udHJpYiBvZiBjb250cmlicykge1xuXHRcdFx0aWYgKGNvbnRyaWIuaWQpIHtcblx0XHRcdFx0eWllbGQgbWNwQWN0aXZhdGlvbkV2ZW50KGNvbnRyaWIuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5tY3AnLCAnQ29udHJpYnV0ZXMgTW9kZWwgQ29udGV4dCBQcm90b2NvbCBzZXJ2ZXJzLiBVc2VycyBvZiB0aGlzIHNob3VsZCBhbHNvIHVzZSBgdnNjb2RlLmxtLnJlZ2lzdGVyTWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVyYC4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW3sgaWQ6ICcnLCBsYWJlbDogJycgfV0gfV0sXG5cdFx0aXRlbXM6IHtcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGlkOiAnJywgbGFiZWw6ICcnIH0gfV0sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1jcC5pZCcsIFwiVW5pcXVlIElEIGZvciB0aGUgY29sbGVjdGlvbi5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0bGFiZWw6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubWNwLmxhYmVsJywgXCJEaXNwbGF5IG5hbWUgZm9yIHRoZSBjb2xsZWN0aW9uLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLm1jcC53aGVuJywgXCJDb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIGVuYWJsZSB0aGlzIGNvbGxlY3Rpb24uXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG5cbmNsYXNzIE1jcFNlcnZlckRlZmluaXRpb25zUHJvdmlkZXJSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/Lm1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcnMgJiYgQXJyYXkuaXNBcnJheShtYW5pZmVzdC5jb250cmlidXRlcy5tY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzKSAmJiBtYW5pZmVzdC5jb250cmlidXRlcy5tY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IG1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlcnMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8ubWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVycyA/PyBbXTtcblx0XHRjb25zdCBoZWFkZXJzID0gW2xvY2FsaXplKCdpZCcsIFwiSURcIiksIGxvY2FsaXplKCduYW1lJywgXCJOYW1lXCIpXTtcblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBtY3BTZXJ2ZXJEZWZpbml0aW9uUHJvdmlkZXJzXG5cdFx0XHQubWFwKG1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlciA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oYFxcYCR7bWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVyLmlkfVxcYGApLFxuXHRcdFx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25Qcm92aWRlci5sYWJlbFxuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogbWNwQ29uZmlndXJhdGlvblNlY3Rpb24sXG5cdGxhYmVsOiBsb2NhbGl6ZSgnbWNwU2VydmVyRGVmaW5pdGlvblByb3ZpZGVycycsIFwiTUNQIFNlcnZlcnNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihNY3BTZXJ2ZXJEZWZpbml0aW9uc1Byb3ZpZGVyUmVuZGVyZXIpLFxufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsa0JBQW1IO0FBRzVILE1BQU0sMkJBQTJCO0FBTTFCLE1BQU0scUJBQXFCLENBQUMsNEJBQ2xDLDJCQUEyQjtBQUVyQixJQUFXLGtCQUFYLGtCQUFXQSxxQkFBWDtBQUNOLEVBQUFBLGlCQUFBLG1CQUFnQjtBQUNoQixFQUFBQSxpQkFBQSxjQUFXO0FBQ1gsRUFBQUEsaUJBQUEsa0JBQWU7QUFDZixFQUFBQSxpQkFBQSxxQkFBa0I7QUFKRCxTQUFBQTtBQUFBLEdBQUE7QUFPWCxNQUFNLHNCQUFzQixPQUFPLEtBQUs7QUFBQSxFQUM5QyxDQUFDLG9DQUE2QixHQUFHO0FBQUEsRUFDakMsQ0FBQyx5QkFBd0IsR0FBRztBQUFBLEVBQzVCLENBQUMsa0NBQTRCLEdBQUc7QUFBQSxFQUNoQyxDQUFDLHdDQUErQixHQUFHO0FBQ3BDLENBQXlDO0FBRWxDLE1BQU0sdUJBQXdEO0FBQUEsRUFDcEUsQ0FBQyxvQ0FBNkIsR0FBRyxTQUFTLHVDQUF1QyxnQkFBZ0I7QUFB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
