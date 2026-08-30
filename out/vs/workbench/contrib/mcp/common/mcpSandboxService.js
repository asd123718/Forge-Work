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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../base/common/network.js";
import { dirname, posix, win32 } from "../../../../base/common/path.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { arch } from "../../../../base/common/process.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget, ConfigurationTargetToString } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IMcpResourceScannerService } from "../../../../platform/mcp/common/mcpResourceScannerService.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { McpServerTransportType } from "./mcpTypes.js";
const IMcpSandboxService = createDecorator("mcpSandboxService");
let McpSandboxService = class extends Disposable {
  constructor(_fileService, _environmentService, _logService, _mcpResourceScannerService, _remoteAgentService) {
    super();
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._mcpResourceScannerService = _mcpResourceScannerService;
    this._remoteAgentService = _remoteAgentService;
    this._defaultAllowedDomains = ["registry.npmjs.org"];
    // Default allowed domains that are commonly needed for MCP servers, even if the user doesn't specify them in their sandbox config
    this._defaultAllowWritePaths = ["~/.npm"];
    this._sandboxConfigPerConfigurationTarget = /* @__PURE__ */ new Map();
    this._pathJoin = (os, ...segments) => {
      const path = os === OperatingSystem.Windows ? win32 : posix;
      return path.join(...segments);
    };
    this._getPathDelimiter = async (remoteAuthority) => {
      const os = await this._getOperatingSystem(remoteAuthority);
      return os === OperatingSystem.Windows ? win32.delimiter : posix.delimiter;
    };
    this._sandboxSettingsId = generateUuid();
    this._remoteEnvDetailsPromise = this._remoteAgentService.getEnvironment();
  }
  async isEnabled(serverDef, remoteAuthority) {
    const os = await this._getOperatingSystem(remoteAuthority);
    if (os === OperatingSystem.Windows) {
      return false;
    }
    return !!serverDef.sandboxEnabled;
  }
  async launchInSandboxIfEnabled(serverDef, launch, remoteAuthority, configTarget) {
    if (launch.type !== McpServerTransportType.Stdio) {
      return launch;
    }
    if (await this.isEnabled(serverDef, remoteAuthority)) {
      this._logService.trace(`McpSandboxService: Launching with config target ${configTarget}`);
      const launchDetails = await this._resolveSandboxLaunchDetails(configTarget, remoteAuthority, launch.sandbox, launch.cwd);
      const quotedCommand = this._quoteShellArgument(launch.command);
      const quotedArgs = launch.args.map((arg) => this._quoteShellArgument(arg));
      const sandboxArgs = this._getSandboxCommandArgs(quotedCommand, quotedArgs, launchDetails.sandboxConfigPath);
      const sandboxEnv = await this._getSandboxEnvVariables(launch.env, launchDetails.tempDir, launchDetails.rgPath, remoteAuthority);
      if (launchDetails.srtPath) {
        if (launchDetails.execPath) {
          return {
            ...launch,
            command: launchDetails.execPath,
            args: [launchDetails.srtPath, ...sandboxArgs],
            env: sandboxEnv,
            type: McpServerTransportType.Stdio
          };
        } else {
          return {
            ...launch,
            command: launchDetails.srtPath,
            args: sandboxArgs,
            env: sandboxEnv,
            type: McpServerTransportType.Stdio
          };
        }
      }
      if (!launchDetails.execPath) {
        this._logService.warn("McpSandboxService: execPath is unavailable, launching without sandbox runtime wrapper");
      }
      this._logService.debug(`McpSandboxService: launch details for server ${serverDef.label} - command: ${launch.command}, args: ${launch.args.join(" ")}`);
    }
    return launch;
  }
  getSandboxConfigSuggestionMessage(serverLabel, potentialBlocks, existingSandboxConfig) {
    const suggestions = this._getSandboxConfigSuggestions(potentialBlocks, existingSandboxConfig);
    if (!suggestions) {
      return void 0;
    }
    const allowWriteList = suggestions.allowWrite;
    const allowedDomainsList = suggestions.allowedDomains;
    const suggestionLines = [];
    if (allowedDomainsList.length) {
      const shown = allowedDomainsList.map((domain) => `"${domain}"`).join(", ");
      suggestionLines.push(localize("mcpSandboxSuggestion.allowedDomains", "Add to `sandbox.network.allowedDomains`: {0}", shown));
    }
    if (allowWriteList.length) {
      const shown = allowWriteList.map((path) => `"${path}"`).join(", ");
      suggestionLines.push(localize("mcpSandboxSuggestion.allowWrite", "Add to `sandbox.filesystem.allowWrite`: {0}", shown));
    }
    const sandboxConfig = {};
    if (allowedDomainsList.length) {
      sandboxConfig.network = { allowedDomains: [...allowedDomainsList] };
    }
    if (allowWriteList.length) {
      sandboxConfig.filesystem = { allowWrite: [...allowWriteList] };
    }
    return {
      message: localize(
        "mcpSandboxSuggestion.message",
        "The MCP server {0} reported potential sandbox blocks. VS Code found possible sandbox configuration updates:\n{1}",
        serverLabel,
        suggestionLines.join("\n")
      ),
      sandboxConfig
    };
  }
  async applySandboxConfigSuggestion(serverDef, mcpResource, configTarget, potentialBlocks, suggestedSandboxConfig) {
    const scanTarget = this._toMcpResourceTarget(configTarget);
    let didChange = false;
    await this._mcpResourceScannerService.updateSandboxConfig((data) => {
      const existingSandbox = data.sandbox;
      const suggestedAllowedDomains = suggestedSandboxConfig?.network?.allowedDomains ?? [];
      const suggestedAllowWrite = suggestedSandboxConfig?.filesystem?.allowWrite ?? [];
      const currentAllowedDomains = new Set(existingSandbox?.network?.allowedDomains ?? []);
      for (const domain of suggestedAllowedDomains) {
        if (domain && !currentAllowedDomains.has(domain)) {
          currentAllowedDomains.add(domain);
        }
      }
      const currentAllowWrite = new Set(existingSandbox?.filesystem?.allowWrite ?? []);
      for (const path of suggestedAllowWrite) {
        if (path && !currentAllowWrite.has(path)) {
          currentAllowWrite.add(path);
        }
      }
      if (suggestedAllowedDomains.length === 0 && suggestedAllowWrite.length === 0) {
        return data;
      }
      didChange = true;
      const nextSandboxConfig = {};
      if (currentAllowedDomains.size > 0) {
        nextSandboxConfig.network = {
          ...existingSandbox?.network,
          allowedDomains: [...currentAllowedDomains]
        };
      }
      if (currentAllowWrite.size > 0) {
        nextSandboxConfig.filesystem = {
          ...existingSandbox?.filesystem,
          allowWrite: [...currentAllowWrite]
        };
      }
      return {
        ...data,
        sandbox: nextSandboxConfig
      };
    }, mcpResource, scanTarget);
    return didChange;
  }
  _getSandboxConfigSuggestions(potentialBlocks, existingSandboxConfig) {
    if (!potentialBlocks.length) {
      return void 0;
    }
    const allowWrite = /* @__PURE__ */ new Set();
    const allowedDomains = /* @__PURE__ */ new Set();
    const existingAllowWrite = new Set(existingSandboxConfig?.filesystem?.allowWrite ?? []);
    const existingAllowedDomains = new Set(existingSandboxConfig?.network?.allowedDomains ?? []);
    for (const block of potentialBlocks) {
      if (block.kind === "network" && block.host && !existingAllowedDomains.has(block.host)) {
        allowedDomains.add(block.host);
      }
      if (block.kind === "filesystem" && block.path && !existingAllowWrite.has(block.path)) {
        allowWrite.add(block.path);
      }
    }
    if (!allowWrite.size && !allowedDomains.size) {
      return void 0;
    }
    return {
      allowWrite: [...allowWrite],
      allowedDomains: [...allowedDomains]
    };
  }
  _toMcpResourceTarget(configTarget) {
    switch (configTarget) {
      case ConfigurationTarget.USER:
      case ConfigurationTarget.USER_LOCAL:
      case ConfigurationTarget.USER_REMOTE:
        return ConfigurationTarget.USER;
      case ConfigurationTarget.WORKSPACE:
        return ConfigurationTarget.WORKSPACE;
      case ConfigurationTarget.WORKSPACE_FOLDER:
        return ConfigurationTarget.WORKSPACE_FOLDER;
      default:
        return ConfigurationTarget.USER;
    }
  }
  async _resolveSandboxLaunchDetails(configTarget, remoteAuthority, sandboxConfig, launchCwd) {
    const os = await this._getOperatingSystem(remoteAuthority);
    if (os === OperatingSystem.Windows) {
      return { execPath: void 0, srtPath: void 0, rgPath: void 0, sandboxConfigPath: void 0, tempDir: void 0 };
    }
    const appRoot = await this._getAppRoot(remoteAuthority);
    const execPath = await this._getExecPath(os, appRoot, remoteAuthority);
    const tempDir = await this._getTempDir(remoteAuthority);
    const srtPath = this._pathJoin(os, appRoot, "node_modules", "@vscode", "sandbox-runtime", "dist", "cli.js");
    const rgPlatform = os === OperatingSystem.Macintosh ? "darwin" : "linux";
    const rgPath = this._pathJoin(os, appRoot, "node_modules", "@vscode", "ripgrep-universal", "bin", `${rgPlatform}-${arch}`, "rg");
    const sandboxConfigPath = tempDir ? await this._updateSandboxConfig(tempDir, configTarget, sandboxConfig, launchCwd) : void 0;
    this._logService.debug(`McpSandboxService: Updated sandbox config path: ${sandboxConfigPath}`);
    return { execPath, srtPath, rgPath, sandboxConfigPath, tempDir };
  }
  async _getExecPath(os, appRoot, remoteAuthority) {
    if (remoteAuthority) {
      return this._pathJoin(os, appRoot, "node");
    }
    return void 0;
  }
  async _getSandboxEnvVariables(baseEnv, tempDir, rgPath, remoteAuthority) {
    let env = { ...baseEnv };
    if (tempDir) {
      env = { ...env, TMPDIR: tempDir.path, SRT_DEBUG: "true", NODE_USE_ENV_PROXY: "1" };
    }
    if (rgPath) {
      env = { ...env, PATH: env["PATH"] ? `${env["PATH"]}${await this._getPathDelimiter(remoteAuthority)}${dirname(rgPath)}` : dirname(rgPath) };
    }
    if (!remoteAuthority) {
      env = { ...env, ELECTRON_RUN_AS_NODE: "1" };
    }
    env["VSCODE_INSPECTOR_OPTIONS"] = null;
    return env;
  }
  _getSandboxCommandArgs(command, args, sandboxConfigPath) {
    const result = [];
    if (sandboxConfigPath) {
      result.push("--settings", sandboxConfigPath);
      result.push("--");
    }
    result.push(command, ...args);
    return result;
  }
  async _getRemoteEnv(remoteAuthority) {
    if (!remoteAuthority) {
      return null;
    }
    return this._remoteEnvDetailsPromise;
  }
  async _getOperatingSystem(remoteAuthority) {
    const remoteEnv = await this._getRemoteEnv(remoteAuthority);
    if (remoteEnv) {
      return remoteEnv.os;
    }
    return OS;
  }
  async _getAppRoot(remoteAuthority) {
    const remoteEnv = await this._getRemoteEnv(remoteAuthority);
    if (remoteEnv) {
      return remoteEnv.appRoot.path;
    }
    return dirname(FileAccess.asFileUri("").path);
  }
  async _getTempDir(remoteAuthority) {
    const remoteEnv = await this._getRemoteEnv(remoteAuthority);
    if (remoteEnv) {
      return remoteEnv.tmpDir;
    }
    const environmentService = this._environmentService;
    const tempDir = environmentService.tmpDir;
    if (!tempDir) {
      this._logService.warn("McpSandboxService: Cannot create sandbox settings file because no tmpDir is available in this environment");
    }
    return tempDir;
  }
  async _updateSandboxConfig(tempDir, configTarget, sandboxConfig, launchCwd) {
    const normalizedSandboxConfig = this._withDefaultSandboxConfig(sandboxConfig, launchCwd);
    let configFileUri;
    const configTargetKey = ConfigurationTargetToString(configTarget);
    if (this._sandboxConfigPerConfigurationTarget.has(configTargetKey)) {
      configFileUri = URI.parse(this._sandboxConfigPerConfigurationTarget.get(configTargetKey));
    } else {
      configFileUri = URI.joinPath(tempDir, `vscode-${configTargetKey}-mcp-sandbox-settings-${this._sandboxSettingsId}.json`);
      this._sandboxConfigPerConfigurationTarget.set(configTargetKey, configFileUri.toString());
    }
    await this._fileService.createFile(configFileUri, VSBuffer.fromString(JSON.stringify(normalizedSandboxConfig, null, "	")), { overwrite: true });
    return configFileUri.path;
  }
  // this method merges the default allowWrite paths and allowedDomains with the ones provided in the sandbox config, to ensure that the default necessary paths and domains are always included in the sandbox config used for launching,
  //  even if they are not explicitly specified in the config provided by the user or the MCP server config.
  _withDefaultSandboxConfig(sandboxConfig, launchCwd) {
    const mergedAllowWrite = new Set(sandboxConfig?.filesystem?.allowWrite ?? []);
    for (const defaultAllowWrite of this._getDefaultAllowWrite(launchCwd ? [launchCwd] : void 0)) {
      if (defaultAllowWrite) {
        mergedAllowWrite.add(defaultAllowWrite);
      }
    }
    const mergedAllowedDomains = new Set(sandboxConfig?.network?.allowedDomains ?? []);
    for (const defaultAllowedDomain of this._defaultAllowedDomains) {
      if (defaultAllowedDomain) {
        mergedAllowedDomains.add(defaultAllowedDomain);
      }
    }
    return {
      ...sandboxConfig,
      network: {
        allowedDomains: [...mergedAllowedDomains],
        deniedDomains: sandboxConfig?.network?.deniedDomains ?? []
      },
      filesystem: {
        allowWrite: [...mergedAllowWrite],
        denyRead: sandboxConfig?.filesystem?.denyRead ?? [],
        denyWrite: sandboxConfig?.filesystem?.denyWrite ?? []
      }
    };
  }
  _getDefaultAllowWrite(directories) {
    for (const launchCwd of directories ?? []) {
      const trimmed = launchCwd.trim();
      if (trimmed) {
        this._defaultAllowWritePaths.push(trimmed);
      }
    }
    return this._defaultAllowWritePaths;
  }
  _quoteShellArgument(value) {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }
};
McpSandboxService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IMcpResourceScannerService),
  __decorateParam(4, IRemoteAgentService)
], McpSandboxService);
export {
  IMcpSandboxService,
  McpSandboxService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1jcFxcY29tbW9uXFxtY3BTYW5kYm94U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgcG9zaXgsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0sIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgYXJjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgQ29uZmlndXJhdGlvblRhcmdldFRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UsIE1jcFJlc291cmNlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWNwL2NvbW1vbi9tY3BSZXNvdXJjZVNjYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEVudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcFBsYXRmb3JtVHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9jaywgTWNwU2VydmVyRGVmaW5pdGlvbiwgTWNwU2VydmVyTGF1bmNoLCBNY3BTZXJ2ZXJUcmFuc3BvcnRTdGRpbywgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSB9IGZyb20gJy4vbWNwVHlwZXMuanMnO1xuXG5cbmV4cG9ydCBjb25zdCBJTWNwU2FuZGJveFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SU1jcFNhbmRib3hTZXJ2aWNlPignbWNwU2FuZGJveFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJTWNwU2FuZGJveFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGxhdW5jaEluU2FuZGJveElmRW5hYmxlZChzZXJ2ZXJEZWY6IE1jcFNlcnZlckRlZmluaXRpb24sIGxhdW5jaDogTWNwU2VydmVyTGF1bmNoLCByZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTxNY3BTZXJ2ZXJMYXVuY2g+O1xuXHRpc0VuYWJsZWQoc2VydmVyRGVmOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBzZXJ2ZXJMYWJlbD86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdGdldFNhbmRib3hDb25maWdTdWdnZXN0aW9uTWVzc2FnZShzZXJ2ZXJMYWJlbDogc3RyaW5nLCBwb3RlbnRpYWxCbG9ja3M6IHJlYWRvbmx5IElNY3BQb3RlbnRpYWxTYW5kYm94QmxvY2tbXSwgZXhpc3RpbmdTYW5kYm94Q29uZmlnPzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uKTogU2FuZGJveENvbmZpZ1N1Z2dlc3Rpb25SZXN1bHQgfCB1bmRlZmluZWQ7XG5cdGFwcGx5U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb24oc2VydmVyRGVmOiBNY3BTZXJ2ZXJEZWZpbml0aW9uLCBtY3BSZXNvdXJjZTogVVJJLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHBvdGVudGlhbEJsb2NrczogcmVhZG9ubHkgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9ja1tdLCBzdWdnZXN0ZWRTYW5kYm94Q29uZmlnPzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uKTogUHJvbWlzZTxib29sZWFuPjtcbn1cblxudHlwZSBTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbnMgPSB7XG5cdGFsbG93V3JpdGU6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRhbGxvd2VkRG9tYWluczogcmVhZG9ubHkgc3RyaW5nW107XG59O1xuXG50eXBlIFNhbmRib3hDb25maWdTdWdnZXN0aW9uUmVzdWx0ID0ge1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdHNhbmRib3hDb25maWc6IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbjtcbn07XG5cbnR5cGUgU2FuZGJveExhdW5jaERldGFpbHMgPSB7XG5cdGV4ZWNQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHNydFBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmdQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHNhbmRib3hDb25maWdQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHRlbXBEaXI6IFVSSSB8IHVuZGVmaW5lZDtcbn07XG5cbmV4cG9ydCBjbGFzcyBNY3BTYW5kYm94U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwU2FuZGJveFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfc2FuZGJveFNldHRpbmdzSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcmVtb3RlRW52RGV0YWlsc1Byb21pc2U6IFByb21pc2U8SVJlbW90ZUFnZW50RW52aXJvbm1lbnQgfCBudWxsPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdEFsbG93ZWREb21haW5zOiByZWFkb25seSBzdHJpbmdbXSA9IFsncmVnaXN0cnkubnBtanMub3JnJ107IC8vIERlZmF1bHQgYWxsb3dlZCBkb21haW5zIHRoYXQgYXJlIGNvbW1vbmx5IG5lZWRlZCBmb3IgTUNQIHNlcnZlcnMsIGV2ZW4gaWYgdGhlIHVzZXIgZG9lc24ndCBzcGVjaWZ5IHRoZW0gaW4gdGhlaXIgc2FuZGJveCBjb25maWdcblx0cHJpdmF0ZSBfZGVmYXVsdEFsbG93V3JpdGVQYXRoczogc3RyaW5nW10gPSBbJ34vLm5wbSddO1xuXHRwcml2YXRlIF9zYW5kYm94Q29uZmlnUGVyQ29uZmlndXJhdGlvblRhcmdldDogTWFwPHN0cmluZywgc3RyaW5nPiA9IG5ldyBNYXAoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwUmVzb3VyY2VTY2FubmVyU2VydmljZTogSU1jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3NhbmRib3hTZXR0aW5nc0lkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fcmVtb3RlRW52RGV0YWlsc1Byb21pc2UgPSB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblxuXHR9XG5cblx0cHVibGljIGFzeW5jIGlzRW5hYmxlZChzZXJ2ZXJEZWY6IE1jcFNlcnZlckRlZmluaXRpb24sIHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG9zID0gYXdhaXQgdGhpcy5fZ2V0T3BlcmF0aW5nU3lzdGVtKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gISFzZXJ2ZXJEZWYuc2FuZGJveEVuYWJsZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgbGF1bmNoSW5TYW5kYm94SWZFbmFibGVkKHNlcnZlckRlZjogTWNwU2VydmVyRGVmaW5pdGlvbiwgbGF1bmNoOiBNY3BTZXJ2ZXJMYXVuY2gsIHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBQcm9taXNlPE1jcFNlcnZlckxhdW5jaD4ge1xuXHRcdGlmIChsYXVuY2gudHlwZSAhPT0gTWNwU2VydmVyVHJhbnNwb3J0VHlwZS5TdGRpbykge1xuXHRcdFx0cmV0dXJuIGxhdW5jaDtcblx0XHR9XG5cdFx0aWYgKGF3YWl0IHRoaXMuaXNFbmFibGVkKHNlcnZlckRlZiwgcmVtb3RlQXV0aG9yaXR5KSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTWNwU2FuZGJveFNlcnZpY2U6IExhdW5jaGluZyB3aXRoIGNvbmZpZyB0YXJnZXQgJHtjb25maWdUYXJnZXR9YCk7XG5cdFx0XHRjb25zdCBsYXVuY2hEZXRhaWxzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVNhbmRib3hMYXVuY2hEZXRhaWxzKGNvbmZpZ1RhcmdldCwgcmVtb3RlQXV0aG9yaXR5LCBsYXVuY2guc2FuZGJveCwgbGF1bmNoLmN3ZCk7XG5cdFx0XHRjb25zdCBxdW90ZWRDb21tYW5kID0gdGhpcy5fcXVvdGVTaGVsbEFyZ3VtZW50KGxhdW5jaC5jb21tYW5kKTtcblx0XHRcdGNvbnN0IHF1b3RlZEFyZ3MgPSBsYXVuY2guYXJncy5tYXAoYXJnID0+IHRoaXMuX3F1b3RlU2hlbGxBcmd1bWVudChhcmcpKTtcblx0XHRcdGNvbnN0IHNhbmRib3hBcmdzID0gdGhpcy5fZ2V0U2FuZGJveENvbW1hbmRBcmdzKHF1b3RlZENvbW1hbmQsIHF1b3RlZEFyZ3MsIGxhdW5jaERldGFpbHMuc2FuZGJveENvbmZpZ1BhdGgpO1xuXHRcdFx0Y29uc3Qgc2FuZGJveEVudiA9IGF3YWl0IHRoaXMuX2dldFNhbmRib3hFbnZWYXJpYWJsZXMobGF1bmNoLmVudiwgbGF1bmNoRGV0YWlscy50ZW1wRGlyLCBsYXVuY2hEZXRhaWxzLnJnUGF0aCwgcmVtb3RlQXV0aG9yaXR5KTtcblx0XHRcdGlmIChsYXVuY2hEZXRhaWxzLnNydFBhdGgpIHtcblx0XHRcdFx0aWYgKGxhdW5jaERldGFpbHMuZXhlY1BhdGgpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4ubGF1bmNoLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogbGF1bmNoRGV0YWlscy5leGVjUGF0aCxcblx0XHRcdFx0XHRcdGFyZ3M6IFtsYXVuY2hEZXRhaWxzLnNydFBhdGgsIC4uLnNhbmRib3hBcmdzXSxcblx0XHRcdFx0XHRcdGVudjogc2FuZGJveEVudixcblx0XHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4ubGF1bmNoLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogbGF1bmNoRGV0YWlscy5zcnRQYXRoLFxuXHRcdFx0XHRcdFx0YXJnczogc2FuZGJveEFyZ3MsXG5cdFx0XHRcdFx0XHRlbnY6IHNhbmRib3hFbnYsXG5cdFx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICghbGF1bmNoRGV0YWlscy5leGVjUGF0aCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ01jcFNhbmRib3hTZXJ2aWNlOiBleGVjUGF0aCBpcyB1bmF2YWlsYWJsZSwgbGF1bmNoaW5nIHdpdGhvdXQgc2FuZGJveCBydW50aW1lIHdyYXBwZXInKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYE1jcFNhbmRib3hTZXJ2aWNlOiBsYXVuY2ggZGV0YWlscyBmb3Igc2VydmVyICR7c2VydmVyRGVmLmxhYmVsfSAtIGNvbW1hbmQ6ICR7bGF1bmNoLmNvbW1hbmR9LCBhcmdzOiAke2xhdW5jaC5hcmdzLmpvaW4oJyAnKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxhdW5jaDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbk1lc3NhZ2Uoc2VydmVyTGFiZWw6IHN0cmluZywgcG90ZW50aWFsQmxvY2tzOiByZWFkb25seSBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrW10sIGV4aXN0aW5nU2FuZGJveENvbmZpZz86IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbik6IFNhbmRib3hDb25maWdTdWdnZXN0aW9uUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdWdnZXN0aW9ucyA9IHRoaXMuX2dldFNhbmRib3hDb25maWdTdWdnZXN0aW9ucyhwb3RlbnRpYWxCbG9ja3MsIGV4aXN0aW5nU2FuZGJveENvbmZpZyk7XG5cdFx0aWYgKCFzdWdnZXN0aW9ucykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxvd1dyaXRlTGlzdCA9IHN1Z2dlc3Rpb25zLmFsbG93V3JpdGU7XG5cdFx0Y29uc3QgYWxsb3dlZERvbWFpbnNMaXN0ID0gc3VnZ2VzdGlvbnMuYWxsb3dlZERvbWFpbnM7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbkxpbmVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0aWYgKGFsbG93ZWREb21haW5zTGlzdC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHNob3duID0gYWxsb3dlZERvbWFpbnNMaXN0Lm1hcChkb21haW4gPT4gYFwiJHtkb21haW59XCJgKS5qb2luKCcsICcpO1xuXHRcdFx0c3VnZ2VzdGlvbkxpbmVzLnB1c2gobG9jYWxpemUoJ21jcFNhbmRib3hTdWdnZXN0aW9uLmFsbG93ZWREb21haW5zJywgXCJBZGQgdG8gYHNhbmRib3gubmV0d29yay5hbGxvd2VkRG9tYWluc2A6IHswfVwiLCBzaG93bikpO1xuXHRcdH1cblxuXHRcdGlmIChhbGxvd1dyaXRlTGlzdC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHNob3duID0gYWxsb3dXcml0ZUxpc3QubWFwKHBhdGggPT4gYFwiJHtwYXRofVwiYCkuam9pbignLCAnKTtcblx0XHRcdHN1Z2dlc3Rpb25MaW5lcy5wdXNoKGxvY2FsaXplKCdtY3BTYW5kYm94U3VnZ2VzdGlvbi5hbGxvd1dyaXRlJywgXCJBZGQgdG8gYHNhbmRib3guZmlsZXN5c3RlbS5hbGxvd1dyaXRlYDogezB9XCIsIHNob3duKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2FuZGJveENvbmZpZzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uID0ge307XG5cdFx0aWYgKGFsbG93ZWREb21haW5zTGlzdC5sZW5ndGgpIHtcblx0XHRcdHNhbmRib3hDb25maWcubmV0d29yayA9IHsgYWxsb3dlZERvbWFpbnM6IFsuLi5hbGxvd2VkRG9tYWluc0xpc3RdIH07XG5cdFx0fVxuXHRcdGlmIChhbGxvd1dyaXRlTGlzdC5sZW5ndGgpIHtcblx0XHRcdHNhbmRib3hDb25maWcuZmlsZXN5c3RlbSA9IHsgYWxsb3dXcml0ZTogWy4uLmFsbG93V3JpdGVMaXN0XSB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZShcblx0XHRcdFx0J21jcFNhbmRib3hTdWdnZXN0aW9uLm1lc3NhZ2UnLFxuXHRcdFx0XHRcIlRoZSBNQ1Agc2VydmVyIHswfSByZXBvcnRlZCBwb3RlbnRpYWwgc2FuZGJveCBibG9ja3MuIFZTIENvZGUgZm91bmQgcG9zc2libGUgc2FuZGJveCBjb25maWd1cmF0aW9uIHVwZGF0ZXM6XFxuezF9XCIsXG5cdFx0XHRcdHNlcnZlckxhYmVsLFxuXHRcdFx0XHRzdWdnZXN0aW9uTGluZXMuam9pbignXFxuJylcblx0XHRcdCksXG5cdFx0XHRzYW5kYm94Q29uZmlnLFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgYXBwbHlTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbihzZXJ2ZXJEZWY6IE1jcFNlcnZlckRlZmluaXRpb24sIG1jcFJlc291cmNlOiBVUkksIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgcG90ZW50aWFsQmxvY2tzOiByZWFkb25seSBJTWNwUG90ZW50aWFsU2FuZGJveEJsb2NrW10sIHN1Z2dlc3RlZFNhbmRib3hDb25maWc/OiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBzY2FuVGFyZ2V0ID0gdGhpcy5fdG9NY3BSZXNvdXJjZVRhcmdldChjb25maWdUYXJnZXQpO1xuXHRcdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblxuXHRcdGF3YWl0IHRoaXMuX21jcFJlc291cmNlU2Nhbm5lclNlcnZpY2UudXBkYXRlU2FuZGJveENvbmZpZyhkYXRhID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nU2FuZGJveCA9IGRhdGEuc2FuZGJveDtcblx0XHRcdGNvbnN0IHN1Z2dlc3RlZEFsbG93ZWREb21haW5zID0gc3VnZ2VzdGVkU2FuZGJveENvbmZpZz8ubmV0d29yaz8uYWxsb3dlZERvbWFpbnMgPz8gW107XG5cdFx0XHRjb25zdCBzdWdnZXN0ZWRBbGxvd1dyaXRlID0gc3VnZ2VzdGVkU2FuZGJveENvbmZpZz8uZmlsZXN5c3RlbT8uYWxsb3dXcml0ZSA/PyBbXTtcblxuXHRcdFx0Y29uc3QgY3VycmVudEFsbG93ZWREb21haW5zID0gbmV3IFNldChleGlzdGluZ1NhbmRib3g/Lm5ldHdvcms/LmFsbG93ZWREb21haW5zID8/IFtdKTtcblx0XHRcdGZvciAoY29uc3QgZG9tYWluIG9mIHN1Z2dlc3RlZEFsbG93ZWREb21haW5zKSB7XG5cdFx0XHRcdGlmIChkb21haW4gJiYgIWN1cnJlbnRBbGxvd2VkRG9tYWlucy5oYXMoZG9tYWluKSkge1xuXHRcdFx0XHRcdGN1cnJlbnRBbGxvd2VkRG9tYWlucy5hZGQoZG9tYWluKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50QWxsb3dXcml0ZSA9IG5ldyBTZXQoZXhpc3RpbmdTYW5kYm94Py5maWxlc3lzdGVtPy5hbGxvd1dyaXRlID8/IFtdKTtcblx0XHRcdGZvciAoY29uc3QgcGF0aCBvZiBzdWdnZXN0ZWRBbGxvd1dyaXRlKSB7XG5cdFx0XHRcdGlmIChwYXRoICYmICFjdXJyZW50QWxsb3dXcml0ZS5oYXMocGF0aCkpIHtcblx0XHRcdFx0XHRjdXJyZW50QWxsb3dXcml0ZS5hZGQocGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHN1Z2dlc3RlZEFsbG93ZWREb21haW5zLmxlbmd0aCA9PT0gMCAmJiBzdWdnZXN0ZWRBbGxvd1dyaXRlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YTtcblx0XHRcdH1cblxuXHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdGNvbnN0IG5leHRTYW5kYm94Q29uZmlnOiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24gPSB7fTtcblx0XHRcdGlmIChjdXJyZW50QWxsb3dlZERvbWFpbnMuc2l6ZSA+IDApIHtcblx0XHRcdFx0bmV4dFNhbmRib3hDb25maWcubmV0d29yayA9IHtcblx0XHRcdFx0XHQuLi5leGlzdGluZ1NhbmRib3g/Lm5ldHdvcmssXG5cdFx0XHRcdFx0YWxsb3dlZERvbWFpbnM6IFsuLi5jdXJyZW50QWxsb3dlZERvbWFpbnNdXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VycmVudEFsbG93V3JpdGUuc2l6ZSA+IDApIHtcblx0XHRcdFx0bmV4dFNhbmRib3hDb25maWcuZmlsZXN5c3RlbSA9IHtcblx0XHRcdFx0XHQuLi5leGlzdGluZ1NhbmRib3g/LmZpbGVzeXN0ZW0sXG5cdFx0XHRcdFx0YWxsb3dXcml0ZTogWy4uLmN1cnJlbnRBbGxvd1dyaXRlXSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmRhdGEsXG5cdFx0XHRcdHNhbmRib3g6IG5leHRTYW5kYm94Q29uZmlnLFxuXHRcdFx0fTtcblx0XHR9LCBtY3BSZXNvdXJjZSwgc2NhblRhcmdldCk7XG5cblx0XHRyZXR1cm4gZGlkQ2hhbmdlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2FuZGJveENvbmZpZ1N1Z2dlc3Rpb25zKHBvdGVudGlhbEJsb2NrczogcmVhZG9ubHkgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9ja1tdLCBleGlzdGluZ1NhbmRib3hDb25maWc/OiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24pOiBTYW5kYm94Q29uZmlnU3VnZ2VzdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcG90ZW50aWFsQmxvY2tzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxvd1dyaXRlID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgYWxsb3dlZERvbWFpbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBleGlzdGluZ0FsbG93V3JpdGUgPSBuZXcgU2V0KGV4aXN0aW5nU2FuZGJveENvbmZpZz8uZmlsZXN5c3RlbT8uYWxsb3dXcml0ZSA/PyBbXSk7XG5cdFx0Y29uc3QgZXhpc3RpbmdBbGxvd2VkRG9tYWlucyA9IG5ldyBTZXQoZXhpc3RpbmdTYW5kYm94Q29uZmlnPy5uZXR3b3JrPy5hbGxvd2VkRG9tYWlucyA/PyBbXSk7XG5cblx0XHRmb3IgKGNvbnN0IGJsb2NrIG9mIHBvdGVudGlhbEJsb2Nrcykge1xuXHRcdFx0aWYgKGJsb2NrLmtpbmQgPT09ICduZXR3b3JrJyAmJiBibG9jay5ob3N0ICYmICFleGlzdGluZ0FsbG93ZWREb21haW5zLmhhcyhibG9jay5ob3N0KSkge1xuXHRcdFx0XHRhbGxvd2VkRG9tYWlucy5hZGQoYmxvY2suaG9zdCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChibG9jay5raW5kID09PSAnZmlsZXN5c3RlbScgJiYgYmxvY2sucGF0aCAmJiAhZXhpc3RpbmdBbGxvd1dyaXRlLmhhcyhibG9jay5wYXRoKSkge1xuXHRcdFx0XHRhbGxvd1dyaXRlLmFkZChibG9jay5wYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWFsbG93V3JpdGUuc2l6ZSAmJiAhYWxsb3dlZERvbWFpbnMuc2l6ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0YWxsb3dXcml0ZTogWy4uLmFsbG93V3JpdGVdLFxuXHRcdFx0YWxsb3dlZERvbWFpbnM6IFsuLi5hbGxvd2VkRG9tYWluc10sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvTWNwUmVzb3VyY2VUYXJnZXQoY29uZmlnVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogTWNwUmVzb3VyY2VUYXJnZXQge1xuXHRcdHN3aXRjaCAoY29uZmlnVGFyZ2V0KSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjpcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOlxuXHRcdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0cmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdHJldHVybiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVTYW5kYm94TGF1bmNoRGV0YWlscyhjb25maWdUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHJlbW90ZUF1dGhvcml0eT86IHN0cmluZywgc2FuZGJveENvbmZpZz86IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiwgbGF1bmNoQ3dkPzogc3RyaW5nKTogUHJvbWlzZTxTYW5kYm94TGF1bmNoRGV0YWlscz4ge1xuXHRcdGNvbnN0IG9zID0gYXdhaXQgdGhpcy5fZ2V0T3BlcmF0aW5nU3lzdGVtKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0aWYgKG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIHsgZXhlY1BhdGg6IHVuZGVmaW5lZCwgc3J0UGF0aDogdW5kZWZpbmVkLCByZ1BhdGg6IHVuZGVmaW5lZCwgc2FuZGJveENvbmZpZ1BhdGg6IHVuZGVmaW5lZCwgdGVtcERpcjogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXBwUm9vdCA9IGF3YWl0IHRoaXMuX2dldEFwcFJvb3QocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRjb25zdCBleGVjUGF0aCA9IGF3YWl0IHRoaXMuX2dldEV4ZWNQYXRoKG9zLCBhcHBSb290LCByZW1vdGVBdXRob3JpdHkpO1xuXHRcdGNvbnN0IHRlbXBEaXIgPSBhd2FpdCB0aGlzLl9nZXRUZW1wRGlyKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0Y29uc3Qgc3J0UGF0aCA9IHRoaXMuX3BhdGhKb2luKG9zLCBhcHBSb290LCAnbm9kZV9tb2R1bGVzJywgJ0B2c2NvZGUnLCAnc2FuZGJveC1ydW50aW1lJywgJ2Rpc3QnLCAnY2xpLmpzJyk7XG5cdFx0Ly8gQHZzY29kZS9yaXBncmVwLXVuaXZlcnNhbCBzaGlwcyBwZXItcGxhdGZvcm0tYXJjaCBiaW5hcmllcyB1bmRlciBiaW4ve3BsYXRmb3JtfS17YXJjaH0ve3JnfHJnLmV4ZX1cblx0XHQvLyBXaW5kb3dzIGlzIGhhbmRsZWQgYnkgdGhlIGVhcmx5IHJldHVybiBhYm92ZSwgc28gb3MgaXMgbmFycm93ZWQgdG8gTWFjL0xpbnV4IGhlcmUuXG5cdFx0Y29uc3QgcmdQbGF0Zm9ybSA9IG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoID8gJ2RhcndpbicgOiAnbGludXgnO1xuXHRcdGNvbnN0IHJnUGF0aCA9IHRoaXMuX3BhdGhKb2luKG9zLCBhcHBSb290LCAnbm9kZV9tb2R1bGVzJywgJ0B2c2NvZGUnLCAncmlwZ3JlcC11bml2ZXJzYWwnLCAnYmluJywgYCR7cmdQbGF0Zm9ybX0tJHthcmNofWAsICdyZycpO1xuXHRcdGNvbnN0IHNhbmRib3hDb25maWdQYXRoID0gdGVtcERpciA/IGF3YWl0IHRoaXMuX3VwZGF0ZVNhbmRib3hDb25maWcodGVtcERpciwgY29uZmlnVGFyZ2V0LCBzYW5kYm94Q29uZmlnLCBsYXVuY2hDd2QpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYE1jcFNhbmRib3hTZXJ2aWNlOiBVcGRhdGVkIHNhbmRib3ggY29uZmlnIHBhdGg6ICR7c2FuZGJveENvbmZpZ1BhdGh9YCk7XG5cdFx0cmV0dXJuIHsgZXhlY1BhdGgsIHNydFBhdGgsIHJnUGF0aCwgc2FuZGJveENvbmZpZ1BhdGgsIHRlbXBEaXIgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEV4ZWNQYXRoKG9zOiBPcGVyYXRpbmdTeXN0ZW0sIGFwcFJvb3Q6IHN0cmluZywgcmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAocmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcGF0aEpvaW4ob3MsIGFwcFJvb3QsICdub2RlJyk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIFVzZSBFbGVjdHJvbiBleGVjdXRhYmxlIGFzIHRoZSBkZWZhdWx0IGV4ZWMgcGF0aCBmb3IgbG9jYWwgZGV2ZWxvcG1lbnQsIHdoaWNoIHdpbGwgcnVuIHRoZSBzYW5kYm94IHJ1bnRpbWUgd3JhcHBlciB3aXRoIEVsZWN0cm9uIGluIG5vZGUgbW9kZS4gRm9yIHJlbW90ZSwgd2UgbmVlZCB0byBzcGVjaWZ5IHRoZSBub2RlIGV4ZWN1dGFibGUgdG8gZW5zdXJlIGl0IHJ1bnMgd2l0aCBOb2RlLmpzLlxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2FuZGJveEVudlZhcmlhYmxlcyhiYXNlRW52OiBNY3BTZXJ2ZXJUcmFuc3BvcnRTdGRpb1snZW52J10sIHRlbXBEaXI6IFVSSSB8IHVuZGVmaW5lZCwgcmdQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IFByb21pc2U8TWNwU2VydmVyVHJhbnNwb3J0U3RkaW9bJ2VudiddPiB7XG5cdFx0bGV0IGVudjogTWNwU2VydmVyVHJhbnNwb3J0U3RkaW9bJ2VudiddID0geyAuLi5iYXNlRW52IH07XG5cdFx0aWYgKHRlbXBEaXIpIHtcblx0XHRcdGVudiA9IHsgLi4uZW52LCBUTVBESVI6IHRlbXBEaXIucGF0aCwgU1JUX0RFQlVHOiAndHJ1ZScsIE5PREVfVVNFX0VOVl9QUk9YWTogJzEnIH07XG5cdFx0fVxuXHRcdGlmIChyZ1BhdGgpIHtcblx0XHRcdGVudiA9IHsgLi4uZW52LCBQQVRIOiBlbnZbJ1BBVEgnXSA/IGAke2VudlsnUEFUSCddfSR7YXdhaXQgdGhpcy5fZ2V0UGF0aERlbGltaXRlcihyZW1vdGVBdXRob3JpdHkpfSR7ZGlybmFtZShyZ1BhdGgpfWAgOiBkaXJuYW1lKHJnUGF0aCkgfTtcblx0XHR9XG5cdFx0aWYgKCFyZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdC8vIEFkZCBhbnkgcmVtb3RlLXNwZWNpZmljIGVudmlyb25tZW50IHZhcmlhYmxlcyBoZXJlXG5cdFx0XHRlbnYgPSB7IC4uLmVudiwgRUxFQ1RST05fUlVOX0FTX05PREU6ICcxJyB9O1xuXHRcdH1cblx0XHQvLyBFbnN1cmUgVlNDT0RFX0lOU1BFQ1RPUl9PUFRJT05TIGlzIG5vdCBpbmhlcml0ZWQgYnkgdGhlIHNhbmRib3hlZCBwcm9jZXNzLCBhcyBpdCBjYW4gY2F1c2UgaXNzdWVzIHdpdGggc2FuZGJveGluZy5cblx0XHRlbnZbJ1ZTQ09ERV9JTlNQRUNUT1JfT1BUSU9OUyddID0gbnVsbDtcblx0XHRyZXR1cm4gZW52O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2FuZGJveENvbW1hbmRBcmdzKGNvbW1hbmQ6IHN0cmluZywgYXJnczogcmVhZG9ubHkgc3RyaW5nW10sIHNhbmRib3hDb25maWdQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChzYW5kYm94Q29uZmlnUGF0aCkge1xuXHRcdFx0cmVzdWx0LnB1c2goJy0tc2V0dGluZ3MnLCBzYW5kYm94Q29uZmlnUGF0aCk7XG5cdFx0XHRyZXN1bHQucHVzaCgnLS0nKTtcblx0XHR9XG5cdFx0cmVzdWx0LnB1c2goY29tbWFuZCwgLi4uYXJncyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFJlbW90ZUVudihyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBQcm9taXNlPElSZW1vdGVBZ2VudEVudmlyb25tZW50IHwgbnVsbD4ge1xuXHRcdGlmICghcmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZUVudkRldGFpbHNQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0T3BlcmF0aW5nU3lzdGVtKHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IFByb21pc2U8T3BlcmF0aW5nU3lzdGVtPiB7XG5cdFx0Y29uc3QgcmVtb3RlRW52ID0gYXdhaXQgdGhpcy5fZ2V0UmVtb3RlRW52KHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0aWYgKHJlbW90ZUVudikge1xuXHRcdFx0cmV0dXJuIHJlbW90ZUVudi5vcztcblx0XHR9XG5cdFx0cmV0dXJuIE9TO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0QXBwUm9vdChyZW1vdGVBdXRob3JpdHk/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IHJlbW90ZUVudiA9IGF3YWl0IHRoaXMuX2dldFJlbW90ZUVudihyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmIChyZW1vdGVFbnYpIHtcblx0XHRcdHJldHVybiByZW1vdGVFbnYuYXBwUm9vdC5wYXRoO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlybmFtZShGaWxlQWNjZXNzLmFzRmlsZVVyaSgnJykucGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUZW1wRGlyKHJlbW90ZUF1dGhvcml0eT86IHN0cmluZyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVtb3RlRW52ID0gYXdhaXQgdGhpcy5fZ2V0UmVtb3RlRW52KHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0aWYgKHJlbW90ZUVudikge1xuXHRcdFx0cmV0dXJuIHJlbW90ZUVudi50bXBEaXI7XG5cdFx0fVxuXHRcdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZSBhcyBJRW52aXJvbm1lbnRTZXJ2aWNlICYgeyB0bXBEaXI/OiBVUkkgfTtcblx0XHRjb25zdCB0ZW1wRGlyID0gZW52aXJvbm1lbnRTZXJ2aWNlLnRtcERpcjtcblx0XHRpZiAoIXRlbXBEaXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignTWNwU2FuZGJveFNlcnZpY2U6IENhbm5vdCBjcmVhdGUgc2FuZGJveCBzZXR0aW5ncyBmaWxlIGJlY2F1c2Ugbm8gdG1wRGlyIGlzIGF2YWlsYWJsZSBpbiB0aGlzIGVudmlyb25tZW50Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZW1wRGlyO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlU2FuZGJveENvbmZpZyh0ZW1wRGlyOiBVUkksIGNvbmZpZ1RhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgc2FuZGJveENvbmZpZz86IElNY3BTYW5kYm94Q29uZmlndXJhdGlvbiwgbGF1bmNoQ3dkPzogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBub3JtYWxpemVkU2FuZGJveENvbmZpZyA9IHRoaXMuX3dpdGhEZWZhdWx0U2FuZGJveENvbmZpZyhzYW5kYm94Q29uZmlnLCBsYXVuY2hDd2QpO1xuXHRcdGxldCBjb25maWdGaWxlVXJpOiBVUkk7XG5cdFx0Y29uc3QgY29uZmlnVGFyZ2V0S2V5ID0gQ29uZmlndXJhdGlvblRhcmdldFRvU3RyaW5nKGNvbmZpZ1RhcmdldCk7XG5cdFx0aWYgKHRoaXMuX3NhbmRib3hDb25maWdQZXJDb25maWd1cmF0aW9uVGFyZ2V0Lmhhcyhjb25maWdUYXJnZXRLZXkpKSB7XG5cdFx0XHRjb25maWdGaWxlVXJpID0gVVJJLnBhcnNlKHRoaXMuX3NhbmRib3hDb25maWdQZXJDb25maWd1cmF0aW9uVGFyZ2V0LmdldChjb25maWdUYXJnZXRLZXkpISk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbmZpZ0ZpbGVVcmkgPSBVUkkuam9pblBhdGgodGVtcERpciwgYHZzY29kZS0ke2NvbmZpZ1RhcmdldEtleX0tbWNwLXNhbmRib3gtc2V0dGluZ3MtJHt0aGlzLl9zYW5kYm94U2V0dGluZ3NJZH0uanNvbmApO1xuXHRcdFx0dGhpcy5fc2FuZGJveENvbmZpZ1BlckNvbmZpZ3VyYXRpb25UYXJnZXQuc2V0KGNvbmZpZ1RhcmdldEtleSwgY29uZmlnRmlsZVVyaS50b1N0cmluZygpKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRmlsZShjb25maWdGaWxlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KG5vcm1hbGl6ZWRTYW5kYm94Q29uZmlnLCBudWxsLCAnXFx0JykpLCB7IG92ZXJ3cml0ZTogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gY29uZmlnRmlsZVVyaS5wYXRoO1xuXHR9XG5cblx0Ly8gdGhpcyBtZXRob2QgbWVyZ2VzIHRoZSBkZWZhdWx0IGFsbG93V3JpdGUgcGF0aHMgYW5kIGFsbG93ZWREb21haW5zIHdpdGggdGhlIG9uZXMgcHJvdmlkZWQgaW4gdGhlIHNhbmRib3ggY29uZmlnLCB0byBlbnN1cmUgdGhhdCB0aGUgZGVmYXVsdCBuZWNlc3NhcnkgcGF0aHMgYW5kIGRvbWFpbnMgYXJlIGFsd2F5cyBpbmNsdWRlZCBpbiB0aGUgc2FuZGJveCBjb25maWcgdXNlZCBmb3IgbGF1bmNoaW5nLFxuXHQvLyAgZXZlbiBpZiB0aGV5IGFyZSBub3QgZXhwbGljaXRseSBzcGVjaWZpZWQgaW4gdGhlIGNvbmZpZyBwcm92aWRlZCBieSB0aGUgdXNlciBvciB0aGUgTUNQIHNlcnZlciBjb25maWcuXG5cdHByaXZhdGUgX3dpdGhEZWZhdWx0U2FuZGJveENvbmZpZyhzYW5kYm94Q29uZmlnPzogSU1jcFNhbmRib3hDb25maWd1cmF0aW9uLCBsYXVuY2hDd2Q/OiBzdHJpbmcpOiBJTWNwU2FuZGJveENvbmZpZ3VyYXRpb24ge1xuXHRcdGNvbnN0IG1lcmdlZEFsbG93V3JpdGUgPSBuZXcgU2V0KHNhbmRib3hDb25maWc/LmZpbGVzeXN0ZW0/LmFsbG93V3JpdGUgPz8gW10pO1xuXHRcdGZvciAoY29uc3QgZGVmYXVsdEFsbG93V3JpdGUgb2YgdGhpcy5fZ2V0RGVmYXVsdEFsbG93V3JpdGUobGF1bmNoQ3dkID8gW2xhdW5jaEN3ZF0gOiB1bmRlZmluZWQpKSB7XG5cdFx0XHRpZiAoZGVmYXVsdEFsbG93V3JpdGUpIHtcblx0XHRcdFx0bWVyZ2VkQWxsb3dXcml0ZS5hZGQoZGVmYXVsdEFsbG93V3JpdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1lcmdlZEFsbG93ZWREb21haW5zID0gbmV3IFNldChzYW5kYm94Q29uZmlnPy5uZXR3b3JrPy5hbGxvd2VkRG9tYWlucyA/PyBbXSk7XG5cdFx0Zm9yIChjb25zdCBkZWZhdWx0QWxsb3dlZERvbWFpbiBvZiB0aGlzLl9kZWZhdWx0QWxsb3dlZERvbWFpbnMpIHtcblx0XHRcdGlmIChkZWZhdWx0QWxsb3dlZERvbWFpbikge1xuXHRcdFx0XHRtZXJnZWRBbGxvd2VkRG9tYWlucy5hZGQoZGVmYXVsdEFsbG93ZWREb21haW4pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5zYW5kYm94Q29uZmlnLFxuXHRcdFx0bmV0d29yazoge1xuXHRcdFx0XHRhbGxvd2VkRG9tYWluczogWy4uLm1lcmdlZEFsbG93ZWREb21haW5zXSxcblx0XHRcdFx0ZGVuaWVkRG9tYWluczogc2FuZGJveENvbmZpZz8ubmV0d29yaz8uZGVuaWVkRG9tYWlucyA/PyBbXSxcblx0XHRcdH0sXG5cdFx0XHRmaWxlc3lzdGVtOiB7XG5cdFx0XHRcdGFsbG93V3JpdGU6IFsuLi5tZXJnZWRBbGxvd1dyaXRlXSxcblx0XHRcdFx0ZGVueVJlYWQ6IHNhbmRib3hDb25maWc/LmZpbGVzeXN0ZW0/LmRlbnlSZWFkID8/IFtdLFxuXHRcdFx0XHRkZW55V3JpdGU6IHNhbmRib3hDb25maWc/LmZpbGVzeXN0ZW0/LmRlbnlXcml0ZSA/PyBbXSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERlZmF1bHRBbGxvd1dyaXRlKGRpcmVjdG9yaWVzPzogc3RyaW5nW10pOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdFx0Zm9yIChjb25zdCBsYXVuY2hDd2Qgb2YgZGlyZWN0b3JpZXMgPz8gW10pIHtcblx0XHRcdGNvbnN0IHRyaW1tZWQgPSBsYXVuY2hDd2QudHJpbSgpO1xuXHRcdFx0aWYgKHRyaW1tZWQpIHtcblx0XHRcdFx0dGhpcy5fZGVmYXVsdEFsbG93V3JpdGVQYXRocy5wdXNoKHRyaW1tZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEFsbG93V3JpdGVQYXRocztcblx0fVxuXG5cdHByaXZhdGUgX3BhdGhKb2luID0gKG9zOiBPcGVyYXRpbmdTeXN0ZW0sIC4uLnNlZ21lbnRzOiBzdHJpbmdbXSkgPT4ge1xuXHRcdGNvbnN0IHBhdGggPSBvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyB3aW4zMiA6IHBvc2l4O1xuXHRcdHJldHVybiBwYXRoLmpvaW4oLi4uc2VnbWVudHMpO1xuXHR9O1xuXG5cdHByaXZhdGUgX2dldFBhdGhEZWxpbWl0ZXIgPSBhc3luYyAocmVtb3RlQXV0aG9yaXR5Pzogc3RyaW5nKSA9PiB7XG5cdFx0Y29uc3Qgb3MgPSBhd2FpdCB0aGlzLl9nZXRPcGVyYXRpbmdTeXN0ZW0ocmVtb3RlQXV0aG9yaXR5KTtcblx0XHRyZXR1cm4gb3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIuZGVsaW1pdGVyIDogcG9zaXguZGVsaW1pdGVyO1xuXHR9O1xuXG5cdHByaXZhdGUgX3F1b3RlU2hlbGxBcmd1bWVudCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCcke3ZhbHVlLnJlcGxhY2UoLycvZywgYCdcXFxcJydgKX0nYDtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FB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
