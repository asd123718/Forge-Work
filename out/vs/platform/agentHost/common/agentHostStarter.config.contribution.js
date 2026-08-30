import * as nls from "../../../nls.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../configuration/common/configurationRegistry.js";
import { COPILOT_OTEL_CAPTURE_CONTENT_KEY, COPILOT_OTEL_ENABLED_KEY, COPILOT_OTEL_ENDPOINT_KEY, COPILOT_OTEL_HEADERS_KEY, COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY, COPILOT_OTEL_PROTOCOL_KEY, COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY, COPILOT_OTEL_SERVICE_NAME_KEY, managedSettingValue } from "../../policy/common/copilotManagedSettings.js";
import product from "../../product/common/product.js";
import { Registry } from "../../registry/common/platform.js";
import {
  AgentHostByokModelsEnabledSettingId,
  AgentHostActiveAgentTitleGenerationSettingId,
  AgentHostClaudeAgentEnabledSettingId,
  AgentHostClaudeMultiRootEnabledSettingId,
  AgentHostCodexAgentBinaryArgsSettingId,
  AgentHostCodexAgentEnabledSettingId,
  AgentHostCodexMultiRootEnabledSettingId,
  AgentHostCodexAgentSdkRootSettingId,
  AgentHostCodexAgentCodexHomeSettingId,
  AgentHostCopilotMultiRootEnabledSettingId,
  AgentHostMarkdownPlanRichLinksEnabledSettingId,
  AgentHostOTelCaptureContentSettingId,
  AgentHostOTelDbSpanExporterEnabledSettingId,
  AgentHostOTelEnabledSettingId,
  AgentHostOTelExporterTypeSettingId,
  AgentHostOTelOtlpEndpointSettingId,
  AgentHostOTelOtlpProtocolSettingId,
  AgentHostOTelOutfileSettingId,
  AgentHostOTelResourceAttributesSettingId,
  AgentHostOTelServiceNameSettingId,
  AgentHostSystemProxyEnabledSettingId
} from "./agentService.js";
import {
  AgentHostClaudeMultiRootEnabledConfigKey,
  AgentHostActiveAgentTitleGenerationConfigKey,
  AgentHostCodexEnabledConfigKey,
  AgentHostCodexMultiRootEnabledConfigKey,
  AgentHostCopilotMultiRootEnabledConfigKey,
  AgentHostMarkdownPlanRichLinksEnabledConfigKey,
  AgentHostSystemProxyEnabledConfigKey
} from "./agentHostSchema.js";
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
function managedOTelProtocolValue(policyData) {
  const protocol = policyData.managedSettings?.[COPILOT_OTEL_PROTOCOL_KEY];
  if (protocol === "grpc") {
    return "otlp-grpc";
  }
  if (protocol === "http/protobuf" || protocol === "http/json") {
    return "otlp-http";
  }
  return void 0;
}
function managedOTelCaptureContentValue(policyData) {
  const captureContent = policyData.managedSettings?.[COPILOT_OTEL_CAPTURE_CONTENT_KEY];
  if (typeof captureContent === "boolean") {
    return captureContent;
  }
  return policyData.managedSettings?.[COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY] === true ? false : void 0;
}
function managedOTelOutfileValue(policyData) {
  const managedSettings = policyData.managedSettings;
  if (managedSettings?.[COPILOT_OTEL_ENDPOINT_KEY] !== void 0 || managedSettings?.[COPILOT_OTEL_PROTOCOL_KEY] !== void 0) {
    return "";
  }
  return void 0;
}
configurationRegistry.registerConfiguration({
  id: "chatAgentHostStarter",
  title: nls.localize("chatAgentHostStarterConfigurationTitle", "Chat Agent Host Starter"),
  type: "object",
  properties: {
    [AgentHostActiveAgentTitleGenerationSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.experimental.activeAgentTitleGeneration", "When enabled, the active agent names new sessions and chats using rename tools. When disabled, a utility model generates titles. Changes apply to sessions and chats created afterward."),
      default: product.quality !== "stable",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      experiment: { mode: "auto" },
      agentHost: { key: AgentHostActiveAgentTitleGenerationConfigKey }
    },
    [AgentHostMarkdownPlanRichLinksEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.experimental.markdownPlanRichLinks", "When enabled, agents receive guidance for using rich links to issues, pull requests, commits, sessions, and chats, plus running task markers, when creating or editing Markdown plan documents."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      experiment: { mode: "auto" },
      agentHost: { key: AgentHostMarkdownPlanRichLinksEnabledConfigKey }
    },
    [AgentHostSystemProxyEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.systemProxy.enabled", "When enabled, Copilot sessions automatically discover and use the operating system's proxy configuration when no proxy environment variable is set."),
      default: true,
      tags: ["experimental", "advanced"],
      experiment: { mode: "startup" },
      agentHost: { key: AgentHostSystemProxyEnabledConfigKey }
    },
    [AgentHostCopilotMultiRootEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.copilotAgent.multiRootEnabled", "When enabled, Copilot agent-host sessions advertise support for multiple working directories, so a session created in a multi-root workspace can span every workspace folder. Experimental; newly created sessions pick up a change without restarting the agent host."),
      default: false,
      // Hidden from the Settings UI while the feature is dogfooded internally.
      // Still settable via `settings.json`; flip `default` (e.g. to
      // `product.quality !== 'stable'`) to enable it for a build channel.
      included: false,
      agentHost: { key: AgentHostCopilotMultiRootEnabledConfigKey }
    },
    [AgentHostClaudeMultiRootEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.claudeAgent.multiRootEnabled", "When enabled, Claude agent-host sessions advertise support for multiple working directories, so a session created in a multi-root workspace can span every workspace folder. Experimental; newly created sessions pick up a change without restarting the agent host."),
      default: false,
      // Hidden from the Settings UI while the feature is dogfooded internally.
      // Still settable via `settings.json`; flip `default` (e.g. to
      // `product.quality !== 'stable'`) to enable it for a build channel.
      included: false,
      agentHost: { key: AgentHostClaudeMultiRootEnabledConfigKey }
    },
    [AgentHostCodexMultiRootEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.codexAgent.multiRootEnabled", "When enabled, Codex agent-host sessions advertise support for multiple working directories, so a session created in a multi-root workspace can span every workspace folder. Experimental; newly created sessions pick up a change without restarting the agent host."),
      default: false,
      included: false,
      agentHost: { key: AgentHostCodexMultiRootEnabledConfigKey }
    },
    [AgentHostClaudeAgentEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.claudeAgent.enabled", "When enabled, the agent host registers the Claude provider, subject to the Claude SDK being reachable. The agent host process must be restarted for changes to take effect."),
      default: true,
      tags: ["experimental", "advanced"],
      // Owns the policy so the account-side preview-features flag can disable Claude across all surfaces.
      policy: {
        name: "Claude3PIntegration",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.113",
        value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.agentHost.claudeAgent.enabled.policy",
            value: nls.localize("chat.agentHost.claudeAgent.enabled.policy", "Enable Claude Agent sessions in VS Code. Start and resume agentic coding sessions powered by Anthropic Claude Agent SDK directly in the editor. Uses your existing Copilot subscription.")
          }
        }
      }
    },
    [AgentHostByokModelsEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.byokModels.enabled", "When enabled, the agent host wires up the BYOK ('bring your own key') language-model bridge so extension-provided BYOK models can run in agent-host sessions. The agent host process must be restarted for changes to take effect."),
      default: false,
      tags: ["experimental", "advanced"],
      experiment: { mode: "startup" }
    },
    [AgentHostCodexAgentEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.codexAgent.enabled", "When enabled, the agent host registers the Codex provider (subject to the Codex SDK being reachable). Enabling takes effect without restarting the agent host."),
      default: true,
      tags: ["experimental", "advanced"],
      // Allow the default to be overridden by an experiment. Uses `startup`
      // to match the sibling agent-host provider settings.
      experiment: { mode: "startup" },
      // Always mirrored, including when `false`: the host only acts on enable, so a
      // forwarded `false` takes effect on the next agent host restart (otherwise
      // in-progress Codex sessions would have to be stopped).
      agentHost: { key: AgentHostCodexEnabledConfigKey },
      // Owns the `Codex3PIntegration` policy; gating here disables Codex across all agent-host surfaces.
      policy: {
        name: "Codex3PIntegration",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.126",
        value: (policyData) => policyData.chat_preview_features_enabled === false ? false : void 0,
        localization: {
          description: {
            key: "chat.agentHost.codexAgent.enabled.policy",
            value: nls.localize("chat.agentHost.codexAgent.enabled.policy", "Enable Codex Agent sessions in VS Code. Start and resume agentic coding sessions powered by OpenAI Codex. Usage can be routed through GitHub Copilot or authenticated directly with an OpenAI account.")
          }
        }
      }
    },
    [AgentHostCodexAgentSdkRootSettingId]: {
      type: "string",
      description: nls.localize("chat.agentHost.codexAgent.sdkRoot", "Experimental, for local SDK development only. Absolute path to a directory containing `node_modules/@openai/codex`. When set, the agent host spawns the Codex binary from this tree instead of downloading the SDK. Empty (the default) falls through to the SDK distribution shipped with this build. The agent host process must be restarted for changes to take effect."),
      default: "",
      tags: ["experimental", "advanced"],
      included: product.quality !== "stable"
    },
    [AgentHostCodexAgentCodexHomeSettingId]: {
      type: "string",
      description: nls.localize("chat.agentHost.codexAgent.codexHome", "Optional override for `$CODEX_HOME`. Controls where the codex binary reads config and writes rollouts. When empty, codex uses its default (`~/.codex`)."),
      default: "",
      tags: ["experimental", "advanced"],
      included: product.quality !== "stable"
    },
    [AgentHostCodexAgentBinaryArgsSettingId]: {
      type: "array",
      items: { type: "string" },
      description: nls.localize("chat.agentHost.codexAgent.binaryArgs", "Additional command-line arguments passed to `codex app-server`. Primarily useful for debugging (for example, `--log-level=debug`)."),
      default: [],
      tags: ["experimental", "advanced"],
      included: product.quality !== "stable"
    },
    [AgentHostOTelEnabledSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.otel.enabled", "When enabled, the agent host emits OpenTelemetry traces from the Copilot SDK. Configurable in user settings only. Either configure `#chat.agentHost.otel.otlpEndpoint#` to ship traces to an external collector or enable `#chat.agentHost.otel.dbSpanExporter.enabled#` to capture them locally."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelEnabled`; the copilot-chat setting `github.copilot.chat.otel.enabled`
      // attaches to it via a `policyReference` in the extension's package.json.
      policy: {
        name: "CopilotOtelEnabled",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_ENABLED_KEY),
        managedSettings: {
          [COPILOT_OTEL_ENABLED_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.enabled.policy",
            value: nls.localize("chat.agentHost.otel.enabled.policy", "Controls whether Copilot OpenTelemetry export is enabled. When managed, users cannot override the enterprise value.")
          }
        }
      }
    },
    [AgentHostOTelExporterTypeSettingId]: {
      type: "string",
      enum: ["otlp-http", "otlp-grpc", "console", "file"],
      markdownDescription: nls.localize("chat.agentHost.otel.exporterType", "Exporter backend used by the Copilot SDK when `#chat.agentHost.otel.enabled#` is on. Configurable in user settings only. `otlp-grpc` is downgraded to `otlp-http` transparently in the CLI runtime."),
      default: "otlp-http",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelProtocol`; the managed `telemetry.protocol` string is mapped onto
      // the exporter type (`grpc` -> `otlp-grpc`, `http/*` -> `otlp-http`).
      policy: {
        name: "CopilotOtelProtocol",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedOTelProtocolValue,
        managedSettings: {
          [COPILOT_OTEL_PROTOCOL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.protocol.policy",
            value: nls.localize("chat.agentHost.otel.protocol.policy", "Controls the enterprise-managed OTLP protocol for Copilot OpenTelemetry export.")
          },
          enumDescriptions: [
            { key: "chat.agentHost.otel.protocol.policy.otlpHttp", value: nls.localize("chat.agentHost.otel.protocol.policy.otlpHttp", "Use OTLP over HTTP.") },
            { key: "chat.agentHost.otel.protocol.policy.otlpGrpc", value: nls.localize("chat.agentHost.otel.protocol.policy.otlpGrpc", "Use OTLP over gRPC.") },
            { key: "chat.agentHost.otel.protocol.policy.console", value: nls.localize("chat.agentHost.otel.protocol.policy.console", "Console exporter is not selected by enterprise managed settings.") },
            { key: "chat.agentHost.otel.protocol.policy.file", value: nls.localize("chat.agentHost.otel.protocol.policy.file", "File exporter is not selected by enterprise managed settings.") }
          ]
        }
      }
    },
    [AgentHostOTelOtlpProtocolSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.otlpProtocol", "Enterprise-managed OTLP wire protocol (`http/json`, `http/protobuf`, or `grpc`) for Copilot OpenTelemetry export. Policy-only: there is no user-facing setting; it carries the managed `telemetry.protocol` so the agent host's `OTEL_EXPORTER_OTLP_PROTOCOL` distinguishes protobuf from json."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      // Policy-only delivery slot — no user-writable surface (mirrors `chat.plugins.extraMarketplaces`).
      included: false,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelOtlpProtocol`; passes the raw managed `telemetry.protocol` through so the
      // starters can set `OTEL_EXPORTER_OTLP_PROTOCOL` (the `exporterType` policy only carries transport).
      policy: {
        name: "CopilotOtelOtlpProtocol",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_PROTOCOL_KEY),
        managedSettings: {
          [COPILOT_OTEL_PROTOCOL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.otlpProtocol.policy",
            value: nls.localize("chat.agentHost.otel.otlpProtocol.policy", "Controls the enterprise-managed OTLP wire protocol (protobuf vs JSON) for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    [AgentHostOTelOtlpEndpointSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.otlpEndpoint", "OTLP endpoint URL when exporter type is `otlp-http` or `otlp-grpc`. Configurable in user settings only. Sets `OTEL_EXPORTER_OTLP_ENDPOINT` inside the agent host process."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelEndpoint`.
      policy: {
        name: "CopilotOtelEndpoint",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_ENDPOINT_KEY),
        managedSettings: {
          [COPILOT_OTEL_ENDPOINT_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.otlpEndpoint.policy",
            value: nls.localize("chat.agentHost.otel.otlpEndpoint.policy", "Controls the enterprise-managed OTLP collector endpoint for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    [AgentHostOTelCaptureContentSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.otel.captureContent", "When enabled, includes prompt and response content in OTel span attributes. Configurable in user settings only. Sets `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`. Privacy-sensitive: do not enable in environments that ship spans to shared sinks."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelCaptureContent`; explicit managed value wins, otherwise
      // `telemetry.lockCaptureContent` forces capture off.
      policy: {
        name: "CopilotOtelCaptureContent",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedOTelCaptureContentValue,
        managedSettings: {
          [COPILOT_OTEL_CAPTURE_CONTENT_KEY]: { type: "boolean" },
          [COPILOT_OTEL_LOCK_CAPTURE_CONTENT_KEY]: { type: "boolean" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.captureContent.policy",
            value: nls.localize("chat.agentHost.otel.captureContent.policy", "Controls whether Copilot OpenTelemetry export captures prompt, response, and tool content.")
          }
        }
      }
    },
    [AgentHostOTelOutfileSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.outfile", "Output path for span JSON lines when exporter type is `file`. Configurable in user settings only. Sets `COPILOT_OTEL_FILE_EXPORTER_PATH`."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelOutfile`; suppresses local file export when the enterprise mandates an OTLP sink.
      policy: {
        name: "CopilotOtelOutfile",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedOTelOutfileValue,
        managedSettings: {
          [COPILOT_OTEL_ENDPOINT_KEY]: { type: "string" },
          [COPILOT_OTEL_PROTOCOL_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.outfile.policy",
            value: nls.localize("chat.agentHost.otel.outfile.policy", "Prevents local file export when enterprise-managed Copilot OpenTelemetry export is configured.")
          }
        }
      }
    },
    [AgentHostOTelDbSpanExporterEnabledSettingId]: {
      type: "boolean",
      markdownDescription: nls.localize("chat.agentHost.otel.dbSpanExporter.enabled", "When enabled, the agent host persists every emitted OTel span to a local SQLite database. Configurable in user settings only. Spans can be inspected via the `Export Agent Host Traces Database` command. Compatible with external exporters: spans are written to SQLite *and* forwarded to the user-configured sink."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [AgentHostOTelServiceNameSettingId]: {
      type: "string",
      markdownDescription: nls.localize("chat.agentHost.otel.serviceName", "Enterprise-managed OTel `service.name` resource attribute for Copilot OpenTelemetry export. Policy-only: there is no user-facing setting; it carries the managed `telemetry.serviceName` so the agent host's `OTEL_SERVICE_NAME` identifies spans from this deployment."),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      // Policy-only delivery slot — no user-writable surface (mirrors `chat.agentHost.otel.otlpProtocol`).
      included: false,
      tags: ["experimental", "advanced"],
      // Owns `CopilotOtelServiceName`; passes the raw managed `telemetry.serviceName` through so the
      // starters can set `OTEL_SERVICE_NAME` on the agent host process.
      policy: {
        name: "CopilotOtelServiceName",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_SERVICE_NAME_KEY),
        managedSettings: {
          [COPILOT_OTEL_SERVICE_NAME_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.serviceName.policy",
            value: nls.localize("chat.agentHost.otel.serviceName.policy", "Controls the enterprise-managed OTel `service.name` resource attribute for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    [AgentHostOTelResourceAttributesSettingId]: {
      // Policy-only delivery slot — no user-writable surface (mirrors `chat.plugins.extraMarketplaces`).
      // Carried as a `{ [key]: string }` object; the starters serialize it into `OTEL_RESOURCE_ATTRIBUTES`.
      type: "object",
      additionalProperties: { type: ["string"] },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      included: false,
      tags: ["experimental", "advanced"],
      markdownDescription: nls.localize("chat.agentHost.otel.resourceAttributes", "Enterprise-managed OTel resource attributes for Copilot OpenTelemetry export. Policy-only: there is no user-facing setting; it carries the managed `telemetry.resourceAttributes` map so the agent host's `OTEL_RESOURCE_ATTRIBUTES` includes the deployment's attributes."),
      policy: {
        name: "CopilotOtelResourceAttributes",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY),
        managedSettings: {
          [COPILOT_OTEL_RESOURCE_ATTRIBUTES_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.resourceAttributes.policy",
            value: nls.localize("chat.agentHost.otel.resourceAttributes.policy", "Controls the enterprise-managed OTel resource attributes for Copilot OpenTelemetry export.")
          }
        }
      }
    },
    // Extension-only policy delivery slot for managed OTLP exporter headers (e.g. auth tokens).
    // Deliberately NOT delivered to the agent host: headers would have to travel via env vars,
    // which the agent host leaks into the tool subprocesses it spawns, exposing the secret. The
    // Copilot Chat extension applies these headers directly to its OTLP exporter instead.
    ["chat.agentHost.otel.headers"]: {
      type: "object",
      additionalProperties: { type: ["string"] },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      included: false,
      tags: ["experimental", "advanced"],
      markdownDescription: nls.localize("chat.agentHost.otel.headers", "Enterprise-managed OTLP exporter headers (e.g. auth tokens) for Copilot OpenTelemetry export. Policy-only and extension-only: applied directly to the Copilot Chat extension's OTLP exporter, never delivered to the agent host process."),
      policy: {
        name: "CopilotOtelHeaders",
        category: PolicyCategory.InteractiveSession,
        minimumVersion: "1.127",
        value: managedSettingValue(COPILOT_OTEL_HEADERS_KEY),
        managedSettings: {
          [COPILOT_OTEL_HEADERS_KEY]: { type: "string" }
        },
        localization: {
          description: {
            key: "chat.agentHost.otel.headers.policy",
            value: nls.localize("chat.agentHost.otel.headers.policy", "Controls the enterprise-managed OTLP exporter headers for Copilot OpenTelemetry export.")
          }
        }
      }
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXGFnZW50SG9zdFN0YXJ0ZXIuY29uZmlnLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVBvbGljeURhdGEgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBQb2xpY3lDYXRlZ29yeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9PVEVMX0NBUFRVUkVfQ09OVEVOVF9LRVksIENPUElMT1RfT1RFTF9FTkFCTEVEX0tFWSwgQ09QSUxPVF9PVEVMX0VORFBPSU5UX0tFWSwgQ09QSUxPVF9PVEVMX0hFQURFUlNfS0VZLCBDT1BJTE9UX09URUxfTE9DS19DQVBUVVJFX0NPTlRFTlRfS0VZLCBDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZLCBDT1BJTE9UX09URUxfUkVTT1VSQ0VfQVRUUklCVVRFU19LRVksIENPUElMT1RfT1RFTF9TRVJWSUNFX05BTUVfS0VZLCBtYW5hZ2VkU2V0dGluZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vcG9saWN5L2NvbW1vbi9jb3BpbG90TWFuYWdlZFNldHRpbmdzLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHtcblx0QWdlbnRIb3N0Qnlva01vZGVsc0VuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdEFjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RDbGF1ZGVBZ2VudEVuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdENvZGV4QWdlbnRCaW5hcnlBcmdzU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCxcblx0QWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RDb2RleEFnZW50U2RrUm9vdFNldHRpbmdJZCxcblx0QWdlbnRIb3N0Q29kZXhBZ2VudENvZGV4SG9tZVNldHRpbmdJZCxcblx0QWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE1hcmtkb3duUGxhblJpY2hMaW5rc0VuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE9UZWxDYXB0dXJlQ29udGVudFNldHRpbmdJZCxcblx0QWdlbnRIb3N0T1RlbERiU3BhbkV4cG9ydGVyRW5hYmxlZFNldHRpbmdJZCxcblx0QWdlbnRIb3N0T1RlbEVuYWJsZWRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE9UZWxFeHBvcnRlclR5cGVTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE9UZWxPdGxwRW5kcG9pbnRTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE9UZWxPdGxwUHJvdG9jb2xTZXR0aW5nSWQsXG5cdEFnZW50SG9zdE9UZWxPdXRmaWxlU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RPVGVsUmVzb3VyY2VBdHRyaWJ1dGVzU2V0dGluZ0lkLFxuXHRBZ2VudEhvc3RPVGVsU2VydmljZU5hbWVTZXR0aW5nSWQsXG5cdEFnZW50SG9zdFN5c3RlbVByb3h5RW5hYmxlZFNldHRpbmdJZCxcbn0gZnJvbSAnLi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHtcblx0QWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSxcblx0QWdlbnRIb3N0QWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25Db25maWdLZXksXG5cdEFnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleSxcblx0QWdlbnRIb3N0Q29kZXhNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5LFxuXHRBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSxcblx0QWdlbnRIb3N0TWFya2Rvd25QbGFuUmljaExpbmtzRW5hYmxlZENvbmZpZ0tleSxcblx0QWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5LFxufSBmcm9tICcuL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5cbi8vIFNldHRpbmdzIGNvbnN1bWVkIGJ5IHRoZSBhZ2VudCBob3N0IHN0YXJ0ZXIgKGBlbGVjdHJvbkFnZW50SG9zdFN0YXJ0ZXIudHNgXG4vLyBhbmQgYG5vZGVBZ2VudEhvc3RTdGFydGVyLnRzYCkgdG8gcG9wdWxhdGUgdGhlIHNwYXduZWQgYWdlbnQgaG9zdCBwcm9jZXNzJ3Ncbi8vIGVudmlyb25tZW50LiBUaGUgc3RhcnRlciBleGlzdHMgaW4gYm90aCB0aGUgZGVza3RvcCBtYWluIHByb2Nlc3MgYW5kIHRoZVxuLy8gcmVtb3RlIHNlcnZlciBwcm9jZXNzLCBzbyB0aGlzIHJlZ2lzdHJhdGlvbiBoYXMgdG8gYmUgdmlzaWJsZSB0byBib3RoIFx1MjAxNFxuLy8gZWFjaCBzdGFydGVyIGZpbGUgc2lkZS1lZmZlY3QtaW1wb3J0cyB0aGlzIGNvbnRyaWJ1dGlvbiwgd2hpY2ggY2F1c2VzIHRoZVxuLy8gcmVnaXN0cmF0aW9uIHRvIHJ1biBhcyBzb29uIGFzIHRoZSBzdGFydGVyIG1vZHVsZSBpcyBsb2FkZWQuIFRoZSByZW5kZXJlclxuLy8gYWxzbyBpbXBvcnRzIHRoaXMgc28gdGhlIHNhbWUgZGVmYXVsdHMgc2hvdyB1cCBpbiB0aGUgc2V0dGluZ3MgVUkuXG4vL1xuLy8gU2lkZS1lZmZlY3QgaW1wb3J0cyBvZiB0aGlzIGZpbGU6XG4vLyAgIC0gYHNyYy92cy9wbGF0Zm9ybS9hZ2VudEhvc3QvZWxlY3Ryb24tbWFpbi9lbGVjdHJvbkFnZW50SG9zdFN0YXJ0ZXIudHNgXG4vLyAgICAgKG1haW4gcHJvY2VzcywgbG9hZGVkIHRyYW5zaXRpdmVseSBmcm9tIGBhcHAudHNgKS5cbi8vICAgLSBgc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL25vZGVBZ2VudEhvc3RTdGFydGVyLnRzYFxuLy8gICAgIChyZW1vdGUgc2VydmVyLCBsb2FkZWQgdHJhbnNpdGl2ZWx5IGZyb20gYHNlcnZlclNlcnZpY2VzLnRzYCkuXG4vLyAgIC0gYHNyYy92cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5zaGFyZWQuY29udHJpYnV0aW9uLnRzYFxuLy8gICAgIChyZW5kZXJlciByZWdpc3RyYXRpb24gZm9yIHRoZSBzZXR0aW5ncyBVSSkuXG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG4vLyBDdXN0b20gbWFuYWdlZC1zZXR0aW5ncyByZXNvbHZlcnMgZm9yIHRoZSBlbnRlcnByaXNlIE9UZWwgcG9saWNpZXMuIFRoZSBzaW1wbGUgcGFzcy10aHJvdWdoXG4vLyBrZXlzIHVzZSBgbWFuYWdlZFNldHRpbmdWYWx1ZShLRVkpYDsgdGhlc2UgdGhyZWUgY29tYmluZSBvciB0cmFuc2Zvcm0gdGhlIG1hbmFnZWQgdmFsdWU6XG4vLyAgIC0gcHJvdG9jb2w6IHRoZSBzY2hlbWEncyBPVExQIHByb3RvY29sIHN0cmluZyBtYXBzIG9udG8gdGhlIGFnZW50LWhvc3QgZXhwb3J0ZXIgdHlwZS5cbi8vICAgLSBjYXB0dXJlQ29udGVudDogZXhwbGljaXQgYm9vbGVhbiB3aW5zOyBvdGhlcndpc2UgYGxvY2tDYXB0dXJlQ29udGVudGAgZm9yY2VzIGl0IG9mZi5cbi8vICAgLSBvdXRmaWxlOiB3aGVuIHRoZSBlbnRlcnByaXNlIG1hbmRhdGVzIGFuIE9UTFAgZW5kcG9pbnQvcHJvdG9jb2wsIGxvY2FsIGZpbGUgZXhwb3J0IGlzXG4vLyAgICAgc3VwcHJlc3NlZCBzbyBzcGFucyBjYW4ndCBiZSBkaXZlcnRlZCB0byBkaXNrLlxuZnVuY3Rpb24gbWFuYWdlZE9UZWxQcm90b2NvbFZhbHVlKHBvbGljeURhdGE6IElQb2xpY3lEYXRhKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcHJvdG9jb2wgPSBwb2xpY3lEYXRhLm1hbmFnZWRTZXR0aW5ncz8uW0NPUElMT1RfT1RFTF9QUk9UT0NPTF9LRVldO1xuXHRpZiAocHJvdG9jb2wgPT09ICdncnBjJykge1xuXHRcdHJldHVybiAnb3RscC1ncnBjJztcblx0fVxuXHRpZiAocHJvdG9jb2wgPT09ICdodHRwL3Byb3RvYnVmJyB8fCBwcm90b2NvbCA9PT0gJ2h0dHAvanNvbicpIHtcblx0XHRyZXR1cm4gJ290bHAtaHR0cCc7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gbWFuYWdlZE9UZWxDYXB0dXJlQ29udGVudFZhbHVlKHBvbGljeURhdGE6IElQb2xpY3lEYXRhKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNhcHR1cmVDb250ZW50ID0gcG9saWN5RGF0YS5tYW5hZ2VkU2V0dGluZ3M/LltDT1BJTE9UX09URUxfQ0FQVFVSRV9DT05URU5UX0tFWV07XG5cdGlmICh0eXBlb2YgY2FwdHVyZUNvbnRlbnQgPT09ICdib29sZWFuJykge1xuXHRcdHJldHVybiBjYXB0dXJlQ29udGVudDtcblx0fVxuXHRyZXR1cm4gcG9saWN5RGF0YS5tYW5hZ2VkU2V0dGluZ3M/LltDT1BJTE9UX09URUxfTE9DS19DQVBUVVJFX0NPTlRFTlRfS0VZXSA9PT0gdHJ1ZSA/IGZhbHNlIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBtYW5hZ2VkT1RlbE91dGZpbGVWYWx1ZShwb2xpY3lEYXRhOiBJUG9saWN5RGF0YSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1hbmFnZWRTZXR0aW5ncyA9IHBvbGljeURhdGEubWFuYWdlZFNldHRpbmdzO1xuXHRpZiAobWFuYWdlZFNldHRpbmdzPy5bQ09QSUxPVF9PVEVMX0VORFBPSU5UX0tFWV0gIT09IHVuZGVmaW5lZCB8fCBtYW5hZ2VkU2V0dGluZ3M/LltDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ2NoYXRBZ2VudEhvc3RTdGFydGVyJyxcblx0dGl0bGU6IG5scy5sb2NhbGl6ZSgnY2hhdEFnZW50SG9zdFN0YXJ0ZXJDb25maWd1cmF0aW9uVGl0bGUnLCBcIkNoYXQgQWdlbnQgSG9zdCBTdGFydGVyXCIpLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdFtBZ2VudEhvc3RBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvblNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmV4cGVyaW1lbnRhbC5hY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbicsIFwiV2hlbiBlbmFibGVkLCB0aGUgYWN0aXZlIGFnZW50IG5hbWVzIG5ldyBzZXNzaW9ucyBhbmQgY2hhdHMgdXNpbmcgcmVuYW1lIHRvb2xzLiBXaGVuIGRpc2FibGVkLCBhIHV0aWxpdHkgbW9kZWwgZ2VuZXJhdGVzIHRpdGxlcy4gQ2hhbmdlcyBhcHBseSB0byBzZXNzaW9ucyBhbmQgY2hhdHMgY3JlYXRlZCBhZnRlcndhcmQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogcHJvZHVjdC5xdWFsaXR5ICE9PSAnc3RhYmxlJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnYXV0bycgfSxcblx0XHRcdGFnZW50SG9zdDogeyBrZXk6IEFnZW50SG9zdEFjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uQ29uZmlnS2V5IH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0TWFya2Rvd25QbGFuUmljaExpbmtzRW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmV4cGVyaW1lbnRhbC5tYXJrZG93blBsYW5SaWNoTGlua3MnLCBcIldoZW4gZW5hYmxlZCwgYWdlbnRzIHJlY2VpdmUgZ3VpZGFuY2UgZm9yIHVzaW5nIHJpY2ggbGlua3MgdG8gaXNzdWVzLCBwdWxsIHJlcXVlc3RzLCBjb21taXRzLCBzZXNzaW9ucywgYW5kIGNoYXRzLCBwbHVzIHJ1bm5pbmcgdGFzayBtYXJrZXJzLCB3aGVuIGNyZWF0aW5nIG9yIGVkaXRpbmcgTWFya2Rvd24gcGxhbiBkb2N1bWVudHMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgbW9kZTogJ2F1dG8nIH0sXG5cdFx0XHRhZ2VudEhvc3Q6IHsga2V5OiBBZ2VudEhvc3RNYXJrZG93blBsYW5SaWNoTGlua3NFbmFibGVkQ29uZmlnS2V5IH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Quc3lzdGVtUHJveHkuZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCBDb3BpbG90IHNlc3Npb25zIGF1dG9tYXRpY2FsbHkgZGlzY292ZXIgYW5kIHVzZSB0aGUgb3BlcmF0aW5nIHN5c3RlbSdzIHByb3h5IGNvbmZpZ3VyYXRpb24gd2hlbiBubyBwcm94eSBlbnZpcm9ubWVudCB2YXJpYWJsZSBpcyBzZXQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHRleHBlcmltZW50OiB7IG1vZGU6ICdzdGFydHVwJyB9LFxuXHRcdFx0YWdlbnRIb3N0OiB7IGtleTogQWdlbnRIb3N0U3lzdGVtUHJveHlFbmFibGVkQ29uZmlnS2V5IH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0Q29waWxvdE11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb3BpbG90QWdlbnQubXVsdGlSb290RW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCBDb3BpbG90IGFnZW50LWhvc3Qgc2Vzc2lvbnMgYWR2ZXJ0aXNlIHN1cHBvcnQgZm9yIG11bHRpcGxlIHdvcmtpbmcgZGlyZWN0b3JpZXMsIHNvIGEgc2Vzc2lvbiBjcmVhdGVkIGluIGEgbXVsdGktcm9vdCB3b3Jrc3BhY2UgY2FuIHNwYW4gZXZlcnkgd29ya3NwYWNlIGZvbGRlci4gRXhwZXJpbWVudGFsOyBuZXdseSBjcmVhdGVkIHNlc3Npb25zIHBpY2sgdXAgYSBjaGFuZ2Ugd2l0aG91dCByZXN0YXJ0aW5nIHRoZSBhZ2VudCBob3N0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0Ly8gSGlkZGVuIGZyb20gdGhlIFNldHRpbmdzIFVJIHdoaWxlIHRoZSBmZWF0dXJlIGlzIGRvZ2Zvb2RlZCBpbnRlcm5hbGx5LlxuXHRcdFx0Ly8gU3RpbGwgc2V0dGFibGUgdmlhIGBzZXR0aW5ncy5qc29uYDsgZmxpcCBgZGVmYXVsdGAgKGUuZy4gdG9cblx0XHRcdC8vIGBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnYCkgdG8gZW5hYmxlIGl0IGZvciBhIGJ1aWxkIGNoYW5uZWwuXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHRhZ2VudEhvc3Q6IHsga2V5OiBBZ2VudEhvc3RDb3BpbG90TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSB9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdENsYXVkZU11bHRpUm9vdEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jbGF1ZGVBZ2VudC5tdWx0aVJvb3RFbmFibGVkJywgXCJXaGVuIGVuYWJsZWQsIENsYXVkZSBhZ2VudC1ob3N0IHNlc3Npb25zIGFkdmVydGlzZSBzdXBwb3J0IGZvciBtdWx0aXBsZSB3b3JraW5nIGRpcmVjdG9yaWVzLCBzbyBhIHNlc3Npb24gY3JlYXRlZCBpbiBhIG11bHRpLXJvb3Qgd29ya3NwYWNlIGNhbiBzcGFuIGV2ZXJ5IHdvcmtzcGFjZSBmb2xkZXIuIEV4cGVyaW1lbnRhbDsgbmV3bHkgY3JlYXRlZCBzZXNzaW9ucyBwaWNrIHVwIGEgY2hhbmdlIHdpdGhvdXQgcmVzdGFydGluZyB0aGUgYWdlbnQgaG9zdC5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdC8vIEhpZGRlbiBmcm9tIHRoZSBTZXR0aW5ncyBVSSB3aGlsZSB0aGUgZmVhdHVyZSBpcyBkb2dmb29kZWQgaW50ZXJuYWxseS5cblx0XHRcdC8vIFN0aWxsIHNldHRhYmxlIHZpYSBgc2V0dGluZ3MuanNvbmA7IGZsaXAgYGRlZmF1bHRgIChlLmcuIHRvXG5cdFx0XHQvLyBgcHJvZHVjdC5xdWFsaXR5ICE9PSAnc3RhYmxlJ2ApIHRvIGVuYWJsZSBpdCBmb3IgYSBidWlsZCBjaGFubmVsLlxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0YWdlbnRIb3N0OiB7IGtleTogQWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSB9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQubXVsdGlSb290RW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCBDb2RleCBhZ2VudC1ob3N0IHNlc3Npb25zIGFkdmVydGlzZSBzdXBwb3J0IGZvciBtdWx0aXBsZSB3b3JraW5nIGRpcmVjdG9yaWVzLCBzbyBhIHNlc3Npb24gY3JlYXRlZCBpbiBhIG11bHRpLXJvb3Qgd29ya3NwYWNlIGNhbiBzcGFuIGV2ZXJ5IHdvcmtzcGFjZSBmb2xkZXIuIEV4cGVyaW1lbnRhbDsgbmV3bHkgY3JlYXRlZCBzZXNzaW9ucyBwaWNrIHVwIGEgY2hhbmdlIHdpdGhvdXQgcmVzdGFydGluZyB0aGUgYWdlbnQgaG9zdC5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGluY2x1ZGVkOiBmYWxzZSxcblx0XHRcdGFnZW50SG9zdDogeyBrZXk6IEFnZW50SG9zdENvZGV4TXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSB9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdENsYXVkZUFnZW50RW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNsYXVkZUFnZW50LmVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgdGhlIGFnZW50IGhvc3QgcmVnaXN0ZXJzIHRoZSBDbGF1ZGUgcHJvdmlkZXIsIHN1YmplY3QgdG8gdGhlIENsYXVkZSBTREsgYmVpbmcgcmVhY2hhYmxlLiBUaGUgYWdlbnQgaG9zdCBwcm9jZXNzIG11c3QgYmUgcmVzdGFydGVkIGZvciBjaGFuZ2VzIHRvIHRha2UgZWZmZWN0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyB0aGUgcG9saWN5IHNvIHRoZSBhY2NvdW50LXNpZGUgcHJldmlldy1mZWF0dXJlcyBmbGFnIGNhbiBkaXNhYmxlIENsYXVkZSBhY3Jvc3MgYWxsIHN1cmZhY2VzLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDbGF1ZGUzUEludGVncmF0aW9uJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjExMycsXG5cdFx0XHRcdHZhbHVlOiAocG9saWN5RGF0YSkgPT4gcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnRIb3N0LmNsYXVkZUFnZW50LmVuYWJsZWQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmNsYXVkZUFnZW50LmVuYWJsZWQucG9saWN5JywgXCJFbmFibGUgQ2xhdWRlIEFnZW50IHNlc3Npb25zIGluIFZTIENvZGUuIFN0YXJ0IGFuZCByZXN1bWUgYWdlbnRpYyBjb2Rpbmcgc2Vzc2lvbnMgcG93ZXJlZCBieSBBbnRocm9waWMgQ2xhdWRlIEFnZW50IFNESyBkaXJlY3RseSBpbiB0aGUgZWRpdG9yLiBVc2VzIHlvdXIgZXhpc3RpbmcgQ29waWxvdCBzdWJzY3JpcHRpb24uXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RCeW9rTW9kZWxzRW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmJ5b2tNb2RlbHMuZW5hYmxlZCcsIFwiV2hlbiBlbmFibGVkLCB0aGUgYWdlbnQgaG9zdCB3aXJlcyB1cCB0aGUgQllPSyAoJ2JyaW5nIHlvdXIgb3duIGtleScpIGxhbmd1YWdlLW1vZGVsIGJyaWRnZSBzbyBleHRlbnNpb24tcHJvdmlkZWQgQllPSyBtb2RlbHMgY2FuIHJ1biBpbiBhZ2VudC1ob3N0IHNlc3Npb25zLiBUaGUgYWdlbnQgaG9zdCBwcm9jZXNzIG11c3QgYmUgcmVzdGFydGVkIGZvciBjaGFuZ2VzIHRvIHRha2UgZWZmZWN0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGV4cGVyaW1lbnQ6IHsgbW9kZTogJ3N0YXJ0dXAnIH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb2RleEFnZW50LmVuYWJsZWQnLCBcIldoZW4gZW5hYmxlZCwgdGhlIGFnZW50IGhvc3QgcmVnaXN0ZXJzIHRoZSBDb2RleCBwcm92aWRlciAoc3ViamVjdCB0byB0aGUgQ29kZXggU0RLIGJlaW5nIHJlYWNoYWJsZSkuIEVuYWJsaW5nIHRha2VzIGVmZmVjdCB3aXRob3V0IHJlc3RhcnRpbmcgdGhlIGFnZW50IGhvc3QuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHQvLyBBbGxvdyB0aGUgZGVmYXVsdCB0byBiZSBvdmVycmlkZGVuIGJ5IGFuIGV4cGVyaW1lbnQuIFVzZXMgYHN0YXJ0dXBgXG5cdFx0XHQvLyB0byBtYXRjaCB0aGUgc2libGluZyBhZ2VudC1ob3N0IHByb3ZpZGVyIHNldHRpbmdzLlxuXHRcdFx0ZXhwZXJpbWVudDogeyBtb2RlOiAnc3RhcnR1cCcgfSxcblx0XHRcdC8vIEFsd2F5cyBtaXJyb3JlZCwgaW5jbHVkaW5nIHdoZW4gYGZhbHNlYDogdGhlIGhvc3Qgb25seSBhY3RzIG9uIGVuYWJsZSwgc28gYVxuXHRcdFx0Ly8gZm9yd2FyZGVkIGBmYWxzZWAgdGFrZXMgZWZmZWN0IG9uIHRoZSBuZXh0IGFnZW50IGhvc3QgcmVzdGFydCAob3RoZXJ3aXNlXG5cdFx0XHQvLyBpbi1wcm9ncmVzcyBDb2RleCBzZXNzaW9ucyB3b3VsZCBoYXZlIHRvIGJlIHN0b3BwZWQpLlxuXHRcdFx0YWdlbnRIb3N0OiB7IGtleTogQWdlbnRIb3N0Q29kZXhFbmFibGVkQ29uZmlnS2V5IH0sXG5cdFx0XHQvLyBPd25zIHRoZSBgQ29kZXgzUEludGVncmF0aW9uYCBwb2xpY3k7IGdhdGluZyBoZXJlIGRpc2FibGVzIENvZGV4IGFjcm9zcyBhbGwgYWdlbnQtaG9zdCBzdXJmYWNlcy5cblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ29kZXgzUEludGVncmF0aW9uJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNicsXG5cdFx0XHRcdHZhbHVlOiAocG9saWN5RGF0YSkgPT4gcG9saWN5RGF0YS5jaGF0X3ByZXZpZXdfZmVhdHVyZXNfZW5hYmxlZCA9PT0gZmFsc2UgPyBmYWxzZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnRIb3N0LmNvZGV4QWdlbnQuZW5hYmxlZC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY29kZXhBZ2VudC5lbmFibGVkLnBvbGljeScsIFwiRW5hYmxlIENvZGV4IEFnZW50IHNlc3Npb25zIGluIFZTIENvZGUuIFN0YXJ0IGFuZCByZXN1bWUgYWdlbnRpYyBjb2Rpbmcgc2Vzc2lvbnMgcG93ZXJlZCBieSBPcGVuQUkgQ29kZXguIFVzYWdlIGNhbiBiZSByb3V0ZWQgdGhyb3VnaCBHaXRIdWIgQ29waWxvdCBvciBhdXRoZW50aWNhdGVkIGRpcmVjdGx5IHdpdGggYW4gT3BlbkFJIGFjY291bnQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDb2RleEFnZW50U2RrUm9vdFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QuY29kZXhBZ2VudC5zZGtSb290JywgXCJFeHBlcmltZW50YWwsIGZvciBsb2NhbCBTREsgZGV2ZWxvcG1lbnQgb25seS4gQWJzb2x1dGUgcGF0aCB0byBhIGRpcmVjdG9yeSBjb250YWluaW5nIGBub2RlX21vZHVsZXMvQG9wZW5haS9jb2RleGAuIFdoZW4gc2V0LCB0aGUgYWdlbnQgaG9zdCBzcGF3bnMgdGhlIENvZGV4IGJpbmFyeSBmcm9tIHRoaXMgdHJlZSBpbnN0ZWFkIG9mIGRvd25sb2FkaW5nIHRoZSBTREsuIEVtcHR5ICh0aGUgZGVmYXVsdCkgZmFsbHMgdGhyb3VnaCB0byB0aGUgU0RLIGRpc3RyaWJ1dGlvbiBzaGlwcGVkIHdpdGggdGhpcyBidWlsZC4gVGhlIGFnZW50IGhvc3QgcHJvY2VzcyBtdXN0IGJlIHJlc3RhcnRlZCBmb3IgY2hhbmdlcyB0byB0YWtlIGVmZmVjdC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHRpbmNsdWRlZDogcHJvZHVjdC5xdWFsaXR5ICE9PSAnc3RhYmxlJyxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RDb2RleEFnZW50Q29kZXhIb21lU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb2RleEFnZW50LmNvZGV4SG9tZScsIFwiT3B0aW9uYWwgb3ZlcnJpZGUgZm9yIGAkQ09ERVhfSE9NRWAuIENvbnRyb2xzIHdoZXJlIHRoZSBjb2RleCBiaW5hcnkgcmVhZHMgY29uZmlnIGFuZCB3cml0ZXMgcm9sbG91dHMuIFdoZW4gZW1wdHksIGNvZGV4IHVzZXMgaXRzIGRlZmF1bHQgKGB+Ly5jb2RleGApLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdGluY2x1ZGVkOiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnLFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdENvZGV4QWdlbnRCaW5hcnlBcmdzU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jb2RleEFnZW50LmJpbmFyeUFyZ3MnLCBcIkFkZGl0aW9uYWwgY29tbWFuZC1saW5lIGFyZ3VtZW50cyBwYXNzZWQgdG8gYGNvZGV4IGFwcC1zZXJ2ZXJgLiBQcmltYXJpbHkgdXNlZnVsIGZvciBkZWJ1Z2dpbmcgKGZvciBleGFtcGxlLCBgLS1sb2ctbGV2ZWw9ZGVidWdgKS5cIiksXG5cdFx0XHRkZWZhdWx0OiBbXSxcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHRpbmNsdWRlZDogcHJvZHVjdC5xdWFsaXR5ICE9PSAnc3RhYmxlJyxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsRW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5lbmFibGVkJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBhZ2VudCBob3N0IGVtaXRzIE9wZW5UZWxlbWV0cnkgdHJhY2VzIGZyb20gdGhlIENvcGlsb3QgU0RLLiBDb25maWd1cmFibGUgaW4gdXNlciBzZXR0aW5ncyBvbmx5LiBFaXRoZXIgY29uZmlndXJlIGAjY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwRW5kcG9pbnQjYCB0byBzaGlwIHRyYWNlcyB0byBhbiBleHRlcm5hbCBjb2xsZWN0b3Igb3IgZW5hYmxlIGAjY2hhdC5hZ2VudEhvc3Qub3RlbC5kYlNwYW5FeHBvcnRlci5lbmFibGVkI2AgdG8gY2FwdHVyZSB0aGVtIGxvY2FsbHkuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdC8vIE93bnMgYENvcGlsb3RPdGVsRW5hYmxlZGA7IHRoZSBjb3BpbG90LWNoYXQgc2V0dGluZyBgZ2l0aHViLmNvcGlsb3QuY2hhdC5vdGVsLmVuYWJsZWRgXG5cdFx0XHQvLyBhdHRhY2hlcyB0byBpdCB2aWEgYSBgcG9saWN5UmVmZXJlbmNlYCBpbiB0aGUgZXh0ZW5zaW9uJ3MgcGFja2FnZS5qc29uLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbEVuYWJsZWQnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTI3Jyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9PVEVMX0VOQUJMRURfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9FTkFCTEVEX0tFWV06IHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLmVuYWJsZWQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuZW5hYmxlZC5wb2xpY3knLCBcIkNvbnRyb2xzIHdoZXRoZXIgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydCBpcyBlbmFibGVkLiBXaGVuIG1hbmFnZWQsIHVzZXJzIGNhbm5vdCBvdmVycmlkZSB0aGUgZW50ZXJwcmlzZSB2YWx1ZS5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsRXhwb3J0ZXJUeXBlU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ290bHAtaHR0cCcsICdvdGxwLWdycGMnLCAnY29uc29sZScsICdmaWxlJ10sXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuZXhwb3J0ZXJUeXBlJywgXCJFeHBvcnRlciBiYWNrZW5kIHVzZWQgYnkgdGhlIENvcGlsb3QgU0RLIHdoZW4gYCNjaGF0LmFnZW50SG9zdC5vdGVsLmVuYWJsZWQjYCBpcyBvbi4gQ29uZmlndXJhYmxlIGluIHVzZXIgc2V0dGluZ3Mgb25seS4gYG90bHAtZ3JwY2AgaXMgZG93bmdyYWRlZCB0byBgb3RscC1odHRwYCB0cmFuc3BhcmVudGx5IGluIHRoZSBDTEkgcnVudGltZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAnb3RscC1odHRwJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyBgQ29waWxvdE90ZWxQcm90b2NvbGA7IHRoZSBtYW5hZ2VkIGB0ZWxlbWV0cnkucHJvdG9jb2xgIHN0cmluZyBpcyBtYXBwZWQgb250b1xuXHRcdFx0Ly8gdGhlIGV4cG9ydGVyIHR5cGUgKGBncnBjYCAtPiBgb3RscC1ncnBjYCwgYGh0dHAvKmAgLT4gYG90bHAtaHR0cGApLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbFByb3RvY29sJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNycsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkT1RlbFByb3RvY29sVmFsdWUsXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3knLCBcIkNvbnRyb2xzIHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgT1RMUCBwcm90b2NvbCBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwucHJvdG9jb2wucG9saWN5Lm90bHBIdHRwJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3kub3RscEh0dHAnLCBcIlVzZSBPVExQIG92ZXIgSFRUUC5cIiksIH0sXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwucHJvdG9jb2wucG9saWN5Lm90bHBHcnBjJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3kub3RscEdycGMnLCBcIlVzZSBPVExQIG92ZXIgZ1JQQy5cIiksIH0sXG5cdFx0XHRcdFx0XHR7IGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwucHJvdG9jb2wucG9saWN5LmNvbnNvbGUnLCB2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLnByb3RvY29sLnBvbGljeS5jb25zb2xlJywgXCJDb25zb2xlIGV4cG9ydGVyIGlzIG5vdCBzZWxlY3RlZCBieSBlbnRlcnByaXNlIG1hbmFnZWQgc2V0dGluZ3MuXCIpLCB9LFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLnByb3RvY29sLnBvbGljeS5maWxlJywgdmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5wcm90b2NvbC5wb2xpY3kuZmlsZScsIFwiRmlsZSBleHBvcnRlciBpcyBub3Qgc2VsZWN0ZWQgYnkgZW50ZXJwcmlzZSBtYW5hZ2VkIHNldHRpbmdzLlwiKSwgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsT3RscFByb3RvY29sU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwub3RscFByb3RvY29sJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgT1RMUCB3aXJlIHByb3RvY29sIChgaHR0cC9qc29uYCwgYGh0dHAvcHJvdG9idWZgLCBvciBgZ3JwY2ApIGZvciBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0LiBQb2xpY3ktb25seTogdGhlcmUgaXMgbm8gdXNlci1mYWNpbmcgc2V0dGluZzsgaXQgY2FycmllcyB0aGUgbWFuYWdlZCBgdGVsZW1ldHJ5LnByb3RvY29sYCBzbyB0aGUgYWdlbnQgaG9zdCdzIGBPVEVMX0VYUE9SVEVSX09UTFBfUFJPVE9DT0xgIGRpc3Rpbmd1aXNoZXMgcHJvdG9idWYgZnJvbSBqc29uLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdC8vIFBvbGljeS1vbmx5IGRlbGl2ZXJ5IHNsb3QgXHUyMDE0IG5vIHVzZXItd3JpdGFibGUgc3VyZmFjZSAobWlycm9ycyBgY2hhdC5wbHVnaW5zLmV4dHJhTWFya2V0cGxhY2VzYCkuXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyBgQ29waWxvdE90ZWxPdGxwUHJvdG9jb2xgOyBwYXNzZXMgdGhlIHJhdyBtYW5hZ2VkIGB0ZWxlbWV0cnkucHJvdG9jb2xgIHRocm91Z2ggc28gdGhlXG5cdFx0XHQvLyBzdGFydGVycyBjYW4gc2V0IGBPVEVMX0VYUE9SVEVSX09UTFBfUFJPVE9DT0xgICh0aGUgYGV4cG9ydGVyVHlwZWAgcG9saWN5IG9ubHkgY2FycmllcyB0cmFuc3BvcnQpLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbE90bHBQcm90b2NvbCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9QUk9UT0NPTF9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLm90bHBQcm90b2NvbC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwUHJvdG9jb2wucG9saWN5JywgXCJDb250cm9scyB0aGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE9UTFAgd2lyZSBwcm90b2NvbCAocHJvdG9idWYgdnMgSlNPTikgZm9yIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0T1RlbE90bHBFbmRwb2ludFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLm90bHBFbmRwb2ludCcsIFwiT1RMUCBlbmRwb2ludCBVUkwgd2hlbiBleHBvcnRlciB0eXBlIGlzIGBvdGxwLWh0dHBgIG9yIGBvdGxwLWdycGNgLiBDb25maWd1cmFibGUgaW4gdXNlciBzZXR0aW5ncyBvbmx5LiBTZXRzIGBPVEVMX0VYUE9SVEVSX09UTFBfRU5EUE9JTlRgIGluc2lkZSB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICcnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0XHQvLyBPd25zIGBDb3BpbG90T3RlbEVuZHBvaW50YC5cblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ29waWxvdE90ZWxFbmRwb2ludCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZFNldHRpbmdWYWx1ZShDT1BJTE9UX09URUxfRU5EUE9JTlRfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9FTkRQT0lOVF9LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLm90bHBFbmRwb2ludC5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdGxwRW5kcG9pbnQucG9saWN5JywgXCJDb250cm9scyB0aGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE9UTFAgY29sbGVjdG9yIGVuZHBvaW50IGZvciBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0LlwiKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0W0FnZW50SG9zdE9UZWxDYXB0dXJlQ29udGVudFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5jYXB0dXJlQ29udGVudCcsIFwiV2hlbiBlbmFibGVkLCBpbmNsdWRlcyBwcm9tcHQgYW5kIHJlc3BvbnNlIGNvbnRlbnQgaW4gT1RlbCBzcGFuIGF0dHJpYnV0ZXMuIENvbmZpZ3VyYWJsZSBpbiB1c2VyIHNldHRpbmdzIG9ubHkuIFNldHMgYE9URUxfSU5TVFJVTUVOVEFUSU9OX0dFTkFJX0NBUFRVUkVfTUVTU0FHRV9DT05URU5UYC4gUHJpdmFjeS1zZW5zaXRpdmU6IGRvIG5vdCBlbmFibGUgaW4gZW52aXJvbm1lbnRzIHRoYXQgc2hpcCBzcGFucyB0byBzaGFyZWQgc2lua3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdC8vIE93bnMgYENvcGlsb3RPdGVsQ2FwdHVyZUNvbnRlbnRgOyBleHBsaWNpdCBtYW5hZ2VkIHZhbHVlIHdpbnMsIG90aGVyd2lzZVxuXHRcdFx0Ly8gYHRlbGVtZXRyeS5sb2NrQ2FwdHVyZUNvbnRlbnRgIGZvcmNlcyBjYXB0dXJlIG9mZi5cblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnQ29waWxvdE90ZWxDYXB0dXJlQ29udGVudCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZE9UZWxDYXB0dXJlQ29udGVudFZhbHVlLFxuXHRcdFx0XHRtYW5hZ2VkU2V0dGluZ3M6IHtcblx0XHRcdFx0XHRbQ09QSUxPVF9PVEVMX0NBUFRVUkVfQ09OVEVOVF9LRVldOiB7IHR5cGU6ICdib29sZWFuJyB9LFxuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfTE9DS19DQVBUVVJFX0NPTlRFTlRfS0VZXTogeyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuY2FwdHVyZUNvbnRlbnQucG9saWN5Jyxcblx0XHRcdFx0XHRcdHZhbHVlOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuY2FwdHVyZUNvbnRlbnQucG9saWN5JywgXCJDb250cm9scyB3aGV0aGVyIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQgY2FwdHVyZXMgcHJvbXB0LCByZXNwb25zZSwgYW5kIHRvb2wgY29udGVudC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsT3V0ZmlsZVNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLm91dGZpbGUnLCBcIk91dHB1dCBwYXRoIGZvciBzcGFuIEpTT04gbGluZXMgd2hlbiBleHBvcnRlciB0eXBlIGlzIGBmaWxlYC4gQ29uZmlndXJhYmxlIGluIHVzZXIgc2V0dGluZ3Mgb25seS4gU2V0cyBgQ09QSUxPVF9PVEVMX0ZJTEVfRVhQT1JURVJfUEFUSGAuXCIpLFxuXHRcdFx0ZGVmYXVsdDogJycsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdC8vIE93bnMgYENvcGlsb3RPdGVsT3V0ZmlsZWA7IHN1cHByZXNzZXMgbG9jYWwgZmlsZSBleHBvcnQgd2hlbiB0aGUgZW50ZXJwcmlzZSBtYW5kYXRlcyBhbiBPVExQIHNpbmsuXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NvcGlsb3RPdGVsT3V0ZmlsZScsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5JbnRlcmFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS4xMjcnLFxuXHRcdFx0XHR2YWx1ZTogbWFuYWdlZE9UZWxPdXRmaWxlVmFsdWUsXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfRU5EUE9JTlRfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfUFJPVE9DT0xfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudEhvc3Qub3RlbC5vdXRmaWxlLnBvbGljeScsXG5cdFx0XHRcdFx0XHR2YWx1ZTogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLm91dGZpbGUucG9saWN5JywgXCJQcmV2ZW50cyBsb2NhbCBmaWxlIGV4cG9ydCB3aGVuIGVudGVycHJpc2UtbWFuYWdlZCBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0IGlzIGNvbmZpZ3VyZWQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0T1RlbERiU3BhbkV4cG9ydGVyRW5hYmxlZFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5kYlNwYW5FeHBvcnRlci5lbmFibGVkJywgXCJXaGVuIGVuYWJsZWQsIHRoZSBhZ2VudCBob3N0IHBlcnNpc3RzIGV2ZXJ5IGVtaXR0ZWQgT1RlbCBzcGFuIHRvIGEgbG9jYWwgU1FMaXRlIGRhdGFiYXNlLiBDb25maWd1cmFibGUgaW4gdXNlciBzZXR0aW5ncyBvbmx5LiBTcGFucyBjYW4gYmUgaW5zcGVjdGVkIHZpYSB0aGUgYEV4cG9ydCBBZ2VudCBIb3N0IFRyYWNlcyBEYXRhYmFzZWAgY29tbWFuZC4gQ29tcGF0aWJsZSB3aXRoIGV4dGVybmFsIGV4cG9ydGVyczogc3BhbnMgYXJlIHdyaXR0ZW4gdG8gU1FMaXRlICphbmQqIGZvcndhcmRlZCB0byB0aGUgdXNlci1jb25maWd1cmVkIHNpbmsuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RPVGVsU2VydmljZU5hbWVTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5zZXJ2aWNlTmFtZScsIFwiRW50ZXJwcmlzZS1tYW5hZ2VkIE9UZWwgYHNlcnZpY2UubmFtZWAgcmVzb3VyY2UgYXR0cmlidXRlIGZvciBDb3BpbG90IE9wZW5UZWxlbWV0cnkgZXhwb3J0LiBQb2xpY3ktb25seTogdGhlcmUgaXMgbm8gdXNlci1mYWNpbmcgc2V0dGluZzsgaXQgY2FycmllcyB0aGUgbWFuYWdlZCBgdGVsZW1ldHJ5LnNlcnZpY2VOYW1lYCBzbyB0aGUgYWdlbnQgaG9zdCdzIGBPVEVMX1NFUlZJQ0VfTkFNRWAgaWRlbnRpZmllcyBzcGFucyBmcm9tIHRoaXMgZGVwbG95bWVudC5cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHQvLyBQb2xpY3ktb25seSBkZWxpdmVyeSBzbG90IFx1MjAxNCBubyB1c2VyLXdyaXRhYmxlIHN1cmZhY2UgKG1pcnJvcnMgYGNoYXQuYWdlbnRIb3N0Lm90ZWwub3RscFByb3RvY29sYCkuXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0Ly8gT3ducyBgQ29waWxvdE90ZWxTZXJ2aWNlTmFtZWA7IHBhc3NlcyB0aGUgcmF3IG1hbmFnZWQgYHRlbGVtZXRyeS5zZXJ2aWNlTmFtZWAgdGhyb3VnaCBzbyB0aGVcblx0XHRcdC8vIHN0YXJ0ZXJzIGNhbiBzZXQgYE9URUxfU0VSVklDRV9OQU1FYCBvbiB0aGUgYWdlbnQgaG9zdCBwcm9jZXNzLlxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbFNlcnZpY2VOYW1lJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNycsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkU2V0dGluZ1ZhbHVlKENPUElMT1RfT1RFTF9TRVJWSUNFX05BTUVfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9TRVJWSUNFX05BTUVfS0VZXTogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0a2V5OiAnY2hhdC5hZ2VudEhvc3Qub3RlbC5zZXJ2aWNlTmFtZS5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5zZXJ2aWNlTmFtZS5wb2xpY3knLCBcIkNvbnRyb2xzIHRoZSBlbnRlcnByaXNlLW1hbmFnZWQgT1RlbCBgc2VydmljZS5uYW1lYCByZXNvdXJjZSBhdHRyaWJ1dGUgZm9yIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRbQWdlbnRIb3N0T1RlbFJlc291cmNlQXR0cmlidXRlc1NldHRpbmdJZF06IHtcblx0XHRcdC8vIFBvbGljeS1vbmx5IGRlbGl2ZXJ5IHNsb3QgXHUyMDE0IG5vIHVzZXItd3JpdGFibGUgc3VyZmFjZSAobWlycm9ycyBgY2hhdC5wbHVnaW5zLmV4dHJhTWFya2V0cGxhY2VzYCkuXG5cdFx0XHQvLyBDYXJyaWVkIGFzIGEgYHsgW2tleV06IHN0cmluZyB9YCBvYmplY3Q7IHRoZSBzdGFydGVycyBzZXJpYWxpemUgaXQgaW50byBgT1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTYC5cblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHsgdHlwZTogWydzdHJpbmcnXSBhcyBbJ3N0cmluZyddIH0sXG5cdFx0XHRkZWZhdWx0OiB7fSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRpbmNsdWRlZDogZmFsc2UsXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5vdGVsLnJlc291cmNlQXR0cmlidXRlcycsIFwiRW50ZXJwcmlzZS1tYW5hZ2VkIE9UZWwgcmVzb3VyY2UgYXR0cmlidXRlcyBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC4gUG9saWN5LW9ubHk6IHRoZXJlIGlzIG5vIHVzZXItZmFjaW5nIHNldHRpbmc7IGl0IGNhcnJpZXMgdGhlIG1hbmFnZWQgYHRlbGVtZXRyeS5yZXNvdXJjZUF0dHJpYnV0ZXNgIG1hcCBzbyB0aGUgYWdlbnQgaG9zdCdzIGBPVEVMX1JFU09VUkNFX0FUVFJJQlVURVNgIGluY2x1ZGVzIHRoZSBkZXBsb3ltZW50J3MgYXR0cmlidXRlcy5cIiksXG5cdFx0XHRwb2xpY3k6IHtcblx0XHRcdFx0bmFtZTogJ0NvcGlsb3RPdGVsUmVzb3VyY2VBdHRyaWJ1dGVzJyxcblx0XHRcdFx0Y2F0ZWdvcnk6IFBvbGljeUNhdGVnb3J5LkludGVyYWN0aXZlU2Vzc2lvbixcblx0XHRcdFx0bWluaW11bVZlcnNpb246ICcxLjEyNycsXG5cdFx0XHRcdHZhbHVlOiBtYW5hZ2VkU2V0dGluZ1ZhbHVlKENPUElMT1RfT1RFTF9SRVNPVVJDRV9BVFRSSUJVVEVTX0tFWSksXG5cdFx0XHRcdG1hbmFnZWRTZXR0aW5nczoge1xuXHRcdFx0XHRcdFtDT1BJTE9UX09URUxfUkVTT1VSQ0VfQVRUUklCVVRFU19LRVldOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICdjaGF0LmFnZW50SG9zdC5vdGVsLnJlc291cmNlQXR0cmlidXRlcy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5yZXNvdXJjZUF0dHJpYnV0ZXMucG9saWN5JywgXCJDb250cm9scyB0aGUgZW50ZXJwcmlzZS1tYW5hZ2VkIE9UZWwgcmVzb3VyY2UgYXR0cmlidXRlcyBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC5cIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdC8vIEV4dGVuc2lvbi1vbmx5IHBvbGljeSBkZWxpdmVyeSBzbG90IGZvciBtYW5hZ2VkIE9UTFAgZXhwb3J0ZXIgaGVhZGVycyAoZS5nLiBhdXRoIHRva2VucykuXG5cdFx0Ly8gRGVsaWJlcmF0ZWx5IE5PVCBkZWxpdmVyZWQgdG8gdGhlIGFnZW50IGhvc3Q6IGhlYWRlcnMgd291bGQgaGF2ZSB0byB0cmF2ZWwgdmlhIGVudiB2YXJzLFxuXHRcdC8vIHdoaWNoIHRoZSBhZ2VudCBob3N0IGxlYWtzIGludG8gdGhlIHRvb2wgc3VicHJvY2Vzc2VzIGl0IHNwYXducywgZXhwb3NpbmcgdGhlIHNlY3JldC4gVGhlXG5cdFx0Ly8gQ29waWxvdCBDaGF0IGV4dGVuc2lvbiBhcHBsaWVzIHRoZXNlIGhlYWRlcnMgZGlyZWN0bHkgdG8gaXRzIE9UTFAgZXhwb3J0ZXIgaW5zdGVhZC5cblx0XHRbJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuaGVhZGVycyddOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7IHR5cGU6IFsnc3RyaW5nJ10gYXMgWydzdHJpbmcnXSB9LFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0aW5jbHVkZWQ6IGZhbHNlLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5oZWFkZXJzJywgXCJFbnRlcnByaXNlLW1hbmFnZWQgT1RMUCBleHBvcnRlciBoZWFkZXJzIChlLmcuIGF1dGggdG9rZW5zKSBmb3IgQ29waWxvdCBPcGVuVGVsZW1ldHJ5IGV4cG9ydC4gUG9saWN5LW9ubHkgYW5kIGV4dGVuc2lvbi1vbmx5OiBhcHBsaWVkIGRpcmVjdGx5IHRvIHRoZSBDb3BpbG90IENoYXQgZXh0ZW5zaW9uJ3MgT1RMUCBleHBvcnRlciwgbmV2ZXIgZGVsaXZlcmVkIHRvIHRoZSBhZ2VudCBob3N0IHByb2Nlc3MuXCIpLFxuXHRcdFx0cG9saWN5OiB7XG5cdFx0XHRcdG5hbWU6ICdDb3BpbG90T3RlbEhlYWRlcnMnLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuSW50ZXJhY3RpdmVTZXNzaW9uLFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuMTI3Jyxcblx0XHRcdFx0dmFsdWU6IG1hbmFnZWRTZXR0aW5nVmFsdWUoQ09QSUxPVF9PVEVMX0hFQURFUlNfS0VZKSxcblx0XHRcdFx0bWFuYWdlZFNldHRpbmdzOiB7XG5cdFx0XHRcdFx0W0NPUElMT1RfT1RFTF9IRUFERVJTX0tFWV06IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9jYWxpemF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdGtleTogJ2NoYXQuYWdlbnRIb3N0Lm90ZWwuaGVhZGVycy5wb2xpY3knLFxuXHRcdFx0XHRcdFx0dmFsdWU6IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3Qub3RlbC5oZWFkZXJzLnBvbGljeScsIFwiQ29udHJvbHMgdGhlIGVudGVycHJpc2UtbWFuYWdlZCBPVExQIGV4cG9ydGVyIGhlYWRlcnMgZm9yIENvcGlsb3QgT3BlblRlbGVtZXRyeSBleHBvcnQuXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0Is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
