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
import { Schemas } from "../../../../base/common/network.js";
import { env } from "../../../../base/common/process.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { OperatingSystem, OS } from "../../../../base/common/platform.js";
import { ITerminalLogService, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { ITerminalProfileService } from "../common/terminal.js";
import * as path from "../../../../base/common/path.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { debounce } from "../../../../base/common/decorators.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isUriComponents, URI } from "../../../../base/common/uri.js";
import { deepClone } from "../../../../base/common/objects.js";
import { ITerminalInstanceService } from "./terminal.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isString } from "../../../../base/common/types.js";
const generatedProfileName = "Generated";
class BaseTerminalProfileResolverService extends Disposable {
  constructor(_context, _configurationService, _configurationResolverService, _historyService, _logService, _terminalProfileService, _workspaceContextService, _remoteAgentService) {
    super();
    this._context = _context;
    this._configurationService = _configurationService;
    this._configurationResolverService = _configurationResolverService;
    this._historyService = _historyService;
    this._logService = _logService;
    this._terminalProfileService = _terminalProfileService;
    this._workspaceContextService = _workspaceContextService;
    this._remoteAgentService = _remoteAgentService;
    this._iconRegistry = getIconRegistry();
    if (this._remoteAgentService.getConnection()) {
      this._remoteAgentService.getEnvironment().then((env2) => this._primaryBackendOs = env2?.os || OS);
    } else {
      this._primaryBackendOs = OS;
    }
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalSettingId.DefaultProfileWindows) || e.affectsConfiguration(TerminalSettingId.DefaultProfileMacOs) || e.affectsConfiguration(TerminalSettingId.DefaultProfileLinux)) {
        this._refreshDefaultProfileName();
      }
    }));
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this._refreshDefaultProfileName()));
  }
  get defaultProfileName() {
    return this._defaultProfileName;
  }
  async _refreshDefaultProfileName() {
    if (this._primaryBackendOs) {
      this._defaultProfileName = (await this.getDefaultProfile({
        remoteAuthority: this._remoteAgentService.getConnection()?.remoteAuthority,
        os: this._primaryBackendOs
      }))?.profileName;
    }
  }
  resolveIcon(shellLaunchConfig, os) {
    if (shellLaunchConfig.icon) {
      shellLaunchConfig.icon = this._getCustomIcon(shellLaunchConfig.icon) || this.getDefaultIcon();
      return;
    }
    if (shellLaunchConfig.customPtyImplementation) {
      shellLaunchConfig.icon = this.getDefaultIcon();
      return;
    }
    if (shellLaunchConfig.executable) {
      return;
    }
    const defaultProfile = this._getUnresolvedRealDefaultProfile(os);
    if (defaultProfile) {
      shellLaunchConfig.icon = defaultProfile.icon;
    }
    if (!shellLaunchConfig.icon) {
      shellLaunchConfig.icon = this.getDefaultIcon();
    }
  }
  getDefaultIcon(resource) {
    return this._iconRegistry.getIcon(this._configurationService.getValue(TerminalSettingId.TabsDefaultIcon, { resource })) || Codicon.terminal;
  }
  async resolveShellLaunchConfig(shellLaunchConfig, options) {
    let resolvedProfile;
    if (shellLaunchConfig.executable) {
      resolvedProfile = await this._resolveProfile({
        path: shellLaunchConfig.executable,
        args: shellLaunchConfig.args,
        profileName: generatedProfileName,
        isDefault: false
      }, options);
    } else {
      resolvedProfile = await this.getDefaultProfile(options);
    }
    shellLaunchConfig.executable = resolvedProfile.path;
    shellLaunchConfig.args = resolvedProfile.args;
    if (resolvedProfile.env) {
      if (shellLaunchConfig.env) {
        shellLaunchConfig.env = { ...shellLaunchConfig.env, ...resolvedProfile.env };
      } else {
        shellLaunchConfig.env = resolvedProfile.env;
      }
    }
    const resource = shellLaunchConfig === void 0 || isString(shellLaunchConfig.cwd) ? void 0 : shellLaunchConfig.cwd;
    shellLaunchConfig.icon = this._getCustomIcon(shellLaunchConfig.icon) || this._getCustomIcon(resolvedProfile.icon) || this.getDefaultIcon(resource);
    if (resolvedProfile.overrideName) {
      shellLaunchConfig.name = resolvedProfile.profileName;
    }
    shellLaunchConfig.color = shellLaunchConfig.color || resolvedProfile.color || this._configurationService.getValue(TerminalSettingId.TabsDefaultColor, { resource });
    if (shellLaunchConfig.useShellEnvironment === void 0) {
      shellLaunchConfig.useShellEnvironment = this._configurationService.getValue(TerminalSettingId.InheritEnv);
    }
  }
  async getDefaultShell(options) {
    return (await this.getDefaultProfile(options)).path;
  }
  async getDefaultShellArgs(options) {
    return (await this.getDefaultProfile(options)).args || [];
  }
  async getDefaultProfile(options) {
    return this._resolveProfile(await this._getUnresolvedDefaultProfile(options), options);
  }
  getEnvironment(remoteAuthority) {
    return this._context.getEnvironment(remoteAuthority);
  }
  _getCustomIcon(icon) {
    if (!icon) {
      return void 0;
    }
    if (isString(icon)) {
      return ThemeIcon.fromId(icon);
    }
    if (ThemeIcon.isThemeIcon(icon)) {
      return icon;
    }
    if (URI.isUri(icon) || isUriComponents(icon)) {
      return URI.revive(icon);
    }
    if ((URI.isUri(icon.light) || isUriComponents(icon.light)) && (URI.isUri(icon.dark) || isUriComponents(icon.dark))) {
      return { light: URI.revive(icon.light), dark: URI.revive(icon.dark) };
    }
    return void 0;
  }
  async _getUnresolvedDefaultProfile(options) {
    if (options.allowAgentHostShell) {
      const raw = this._configurationService.getValue(`terminal.integrated.agentHostProfile.${this._getOsKey(options.os)}`);
      if (isString(raw)) {
        await this._terminalProfileService.profilesReady;
      }
      const agentHostShellProfile = this._getUnresolvedAgentHostShellProfile(options);
      if (agentHostShellProfile) {
        return agentHostShellProfile;
      }
    }
    if (options.allowAutomationShell) {
      const automationShellProfile = this._getUnresolvedAutomationShellProfile(options);
      if (automationShellProfile) {
        return automationShellProfile;
      }
    }
    await this._terminalProfileService.profilesReady;
    const defaultProfile = this._getUnresolvedRealDefaultProfile(options.os);
    if (defaultProfile) {
      return this._setIconForAutomation(options, defaultProfile);
    }
    return this._setIconForAutomation(options, await this._getUnresolvedFallbackDefaultProfile(options));
  }
  _setIconForAutomation(options, profile) {
    if (options.allowAutomationShell) {
      const profileClone = deepClone(profile);
      profileClone.icon = Codicon.tools;
      return profileClone;
    }
    return profile;
  }
  _getUnresolvedRealDefaultProfile(os) {
    return this._terminalProfileService.getDefaultProfile(os);
  }
  async _getUnresolvedFallbackDefaultProfile(options) {
    const executable = await this._context.getDefaultSystemShell(options.remoteAuthority, options.os);
    if (options.os === OS) {
      let existingProfile = this._terminalProfileService.availableProfiles.find((e) => path.parse(e.path).name === path.parse(executable).name);
      if (existingProfile) {
        if (options.allowAutomationShell) {
          existingProfile = deepClone(existingProfile);
          existingProfile.icon = Codicon.tools;
        }
        return existingProfile;
      }
    }
    let args;
    if (options.os === OperatingSystem.Macintosh && path.parse(executable).name.match(/(zsh|bash)/)) {
      args = ["--login"];
    } else {
      args = [];
    }
    const icon = this._guessProfileIcon(executable);
    return {
      profileName: generatedProfileName,
      path: executable,
      args,
      icon,
      isDefault: false
    };
  }
  _getUnresolvedAutomationShellProfile(options) {
    const automationProfile = this._configurationService.getValue(`terminal.integrated.automationProfile.${this._getOsKey(options.os)}`);
    if (this._isValidAutomationProfile(automationProfile, options.os)) {
      automationProfile.icon = this._getCustomIcon(automationProfile.icon) || Codicon.tools;
      return automationProfile;
    }
    return void 0;
  }
  _getUnresolvedAgentHostShellProfile(options) {
    const agentHostProfile = this._configurationService.getValue(`terminal.integrated.agentHostProfile.${this._getOsKey(options.os)}`);
    if (isString(agentHostProfile)) {
      const named = this._terminalProfileService.availableProfiles.find((p) => p.profileName === agentHostProfile && !p.isAutoDetected);
      if (named) {
        const cloned = deepClone(named);
        cloned.icon = this._getCustomIcon(cloned.icon) || Codicon.tools;
        return cloned;
      }
      return void 0;
    }
    if (this._isValidAutomationProfile(agentHostProfile, options.os)) {
      agentHostProfile.icon = this._getCustomIcon(agentHostProfile.icon) || Codicon.tools;
      return agentHostProfile;
    }
    return void 0;
  }
  async _resolveProfile(profile, options) {
    const env2 = await this._context.getEnvironment(options.remoteAuthority);
    if (options.os === OperatingSystem.Windows) {
      const isWoW64 = !!env2.hasOwnProperty("PROCESSOR_ARCHITEW6432");
      const windir = env2.windir;
      if (!isWoW64 && windir) {
        const sysnativePath = path.join(windir, "Sysnative").replace(/\//g, "\\").toLowerCase();
        if (profile.path && profile.path.toLowerCase().indexOf(sysnativePath) === 0) {
          profile.path = path.join(windir, "System32", profile.path.substr(sysnativePath.length + 1));
        }
      }
      if (profile.path) {
        profile.path = profile.path.replace(/\//g, "\\");
      }
    }
    const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot(options.remoteAuthority ? Schemas.vscodeRemote : Schemas.file);
    const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
    profile.path = await this._resolveVariables(profile.path, env2, lastActiveWorkspace);
    if (profile.args) {
      if (isString(profile.args)) {
        profile.args = await this._resolveVariables(profile.args, env2, lastActiveWorkspace);
      } else {
        profile.args = await Promise.all(profile.args.map((arg) => this._resolveVariables(arg, env2, lastActiveWorkspace)));
      }
    }
    return profile;
  }
  async _resolveVariables(value, env2, lastActiveWorkspace) {
    try {
      value = await this._configurationResolverService.resolveWithEnvironment(env2, lastActiveWorkspace, value);
    } catch (e) {
      this._logService.error(`Could not resolve shell`, e);
    }
    return value;
  }
  _getOsKey(os) {
    switch (os) {
      case OperatingSystem.Linux:
        return "linux";
      case OperatingSystem.Macintosh:
        return "osx";
      case OperatingSystem.Windows:
        return "windows";
    }
  }
  _guessProfileIcon(shell) {
    const file = path.parse(shell).name;
    switch (file) {
      case "bash":
        return Codicon.terminalBash;
      case "pwsh":
      case "powershell":
        return Codicon.terminalPowershell;
      case "tmux":
        return Codicon.terminalTmux;
      case "cmd":
        return Codicon.terminalCmd;
      default:
        return void 0;
    }
  }
  _isValidAutomationProfile(profile, os) {
    if (profile === null || profile === void 0 || typeof profile !== "object") {
      return false;
    }
    if ("path" in profile && isString(profile.path)) {
      return true;
    }
    return false;
  }
}
__decorateClass([
  debounce(200)
], BaseTerminalProfileResolverService.prototype, "_refreshDefaultProfileName", 1);
let BrowserTerminalProfileResolverService = class extends BaseTerminalProfileResolverService {
  constructor(configurationResolverService, configurationService, historyService, logService, terminalInstanceService, terminalProfileService, workspaceContextService, remoteAgentService) {
    super(
      {
        getDefaultSystemShell: async (remoteAuthority, os) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!remoteAuthority || !backend) {
            return os === OperatingSystem.Windows ? "pwsh" : "bash";
          }
          return backend.getDefaultSystemShell(os);
        },
        getEnvironment: async (remoteAuthority) => {
          const backend = await terminalInstanceService.getBackend(remoteAuthority);
          if (!remoteAuthority || !backend) {
            return env;
          }
          return backend.getEnvironment();
        }
      },
      configurationService,
      configurationResolverService,
      historyService,
      logService,
      terminalProfileService,
      workspaceContextService,
      remoteAgentService
    );
  }
};
BrowserTerminalProfileResolverService = __decorateClass([
  __decorateParam(0, IConfigurationResolverService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IHistoryService),
  __decorateParam(3, ITerminalLogService),
  __decorateParam(4, ITerminalInstanceService),
  __decorateParam(5, ITerminalProfileService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, IRemoteAgentService)
], BrowserTerminalProfileResolverService);
export {
  BaseTerminalProfileResolverService,
  BrowserTerminalProfileResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFxicm93c2VyXFx0ZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBlbnYgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIE9wZXJhdGluZ1N5c3RlbSwgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbExvZ1NlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGUsIFRlcm1pbmFsSWNvbiwgVGVybWluYWxTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMsIElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZ2V0SWNvblJlZ2lzdHJ5LCBJSWNvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVib3VuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc1VyaUNvbXBvbmVudHMsIFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSB9IGZyb20gJy4vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZywgdHlwZSBTaW5nbGVPck1hbnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByb2ZpbGVDb250ZXh0UHJvdmlkZXIge1xuXHRnZXREZWZhdWx0U3lzdGVtU2hlbGwocmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBQcm9taXNlPHN0cmluZz47XG5cdGdldEVudmlyb25tZW50KHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50Pjtcbn1cblxuY29uc3QgZ2VuZXJhdGVkUHJvZmlsZU5hbWUgPSAnR2VuZXJhdGVkJztcblxuLypcbiAqIFJlc29sdmVzIHRlcm1pbmFsIHNoZWxsIGxhdW5jaCBjb25maWcgYW5kIHRlcm1pbmFsIHByb2ZpbGVzIGZvciB0aGUgZ2l2ZW4gb3BlcmF0aW5nIHN5c3RlbSxcbiAqIGVudmlyb25tZW50LCBhbmQgdXNlciBjb25maWd1cmF0aW9uLlxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQmFzZVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHtcblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcHJpbWFyeUJhY2tlbmRPczogT3BlcmF0aW5nU3lzdGVtIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ljb25SZWdpc3RyeTogSUljb25SZWdpc3RyeSA9IGdldEljb25SZWdpc3RyeSgpO1xuXG5cdHByaXZhdGUgX2RlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgZGVmYXVsdFByb2ZpbGVOYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9kZWZhdWx0UHJvZmlsZU5hbWU7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBJUHJvZmlsZUNvbnRleHRQcm92aWRlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCkpIHtcblx0XHRcdHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpLnRoZW4oZW52ID0+IHRoaXMuX3ByaW1hcnlCYWNrZW5kT3MgPSBlbnY/Lm9zIHx8IE9TKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmRPcyA9IE9TO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0UHJvZmlsZVdpbmRvd3MpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuRGVmYXVsdFByb2ZpbGVNYWNPcykgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0UHJvZmlsZUxpbnV4KSkge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoRGVmYXVsdFByb2ZpbGVOYW1lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFibGVQcm9maWxlcygoKSA9PiB0aGlzLl9yZWZyZXNoRGVmYXVsdFByb2ZpbGVOYW1lKCkpKTtcblx0fVxuXG5cdEBkZWJvdW5jZSgyMDApXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hEZWZhdWx0UHJvZmlsZU5hbWUoKSB7XG5cdFx0aWYgKHRoaXMuX3ByaW1hcnlCYWNrZW5kT3MpIHtcblx0XHRcdHRoaXMuX2RlZmF1bHRQcm9maWxlTmFtZSA9IChhd2FpdCB0aGlzLmdldERlZmF1bHRQcm9maWxlKHtcblx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHRcdG9zOiB0aGlzLl9wcmltYXJ5QmFja2VuZE9zXG5cdFx0XHR9KSk/LnByb2ZpbGVOYW1lO1xuXHRcdH1cblx0fVxuXG5cdHJlc29sdmVJY29uKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiB2b2lkIHtcblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuaWNvbikge1xuXHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaWNvbiA9IHRoaXMuX2dldEN1c3RvbUljb24oc2hlbGxMYXVuY2hDb25maWcuaWNvbikgfHwgdGhpcy5nZXREZWZhdWx0SWNvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2hlbGxMYXVuY2hDb25maWcuY3VzdG9tUHR5SW1wbGVtZW50YXRpb24pIHtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmljb24gPSB0aGlzLmdldERlZmF1bHRJY29uKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlID0gdGhpcy5fZ2V0VW5yZXNvbHZlZFJlYWxEZWZhdWx0UHJvZmlsZShvcyk7XG5cdFx0aWYgKGRlZmF1bHRQcm9maWxlKSB7XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pY29uID0gZGVmYXVsdFByb2ZpbGUuaWNvbjtcblx0XHR9XG5cdFx0aWYgKCFzaGVsbExhdW5jaENvbmZpZy5pY29uKSB7XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pY29uID0gdGhpcy5nZXREZWZhdWx0SWNvbigpO1xuXHRcdH1cblx0fVxuXG5cdGdldERlZmF1bHRJY29uKHJlc291cmNlPzogVVJJKTogVGVybWluYWxJY29uICYgVGhlbWVJY29uIHtcblx0XHRyZXR1cm4gdGhpcy5faWNvblJlZ2lzdHJ5LmdldEljb24odGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuVGFic0RlZmF1bHRJY29uLCB7IHJlc291cmNlIH0pKSB8fCBDb2RpY29uLnRlcm1pbmFsO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVNoZWxsTGF1bmNoQ29uZmlnKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgc2hlbGwgYW5kIHNoZWxsIGFyZ3Ncblx0XHRsZXQgcmVzb2x2ZWRQcm9maWxlOiBJVGVybWluYWxQcm9maWxlO1xuXHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlKSB7XG5cdFx0XHRyZXNvbHZlZFByb2ZpbGUgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUHJvZmlsZSh7XG5cdFx0XHRcdHBhdGg6IHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUsXG5cdFx0XHRcdGFyZ3M6IHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MsXG5cdFx0XHRcdHByb2ZpbGVOYW1lOiBnZW5lcmF0ZWRQcm9maWxlTmFtZSxcblx0XHRcdFx0aXNEZWZhdWx0OiBmYWxzZVxuXHRcdFx0fSwgb3B0aW9ucyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc29sdmVkUHJvZmlsZSA9IGF3YWl0IHRoaXMuZ2V0RGVmYXVsdFByb2ZpbGUob3B0aW9ucyk7XG5cdFx0fVxuXHRcdHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUgPSByZXNvbHZlZFByb2ZpbGUucGF0aDtcblx0XHRzaGVsbExhdW5jaENvbmZpZy5hcmdzID0gcmVzb2x2ZWRQcm9maWxlLmFyZ3M7XG5cdFx0aWYgKHJlc29sdmVkUHJvZmlsZS5lbnYpIHtcblx0XHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5lbnYpIHtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuZW52ID0geyAuLi5zaGVsbExhdW5jaENvbmZpZy5lbnYsIC4uLnJlc29sdmVkUHJvZmlsZS5lbnYgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmVudiA9IHJlc29sdmVkUHJvZmlsZS5lbnY7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBpY29uIGlzIHZhbGlkLCBhbmQgZmFsbGJhY2sgY29ycmVjdGx5IHRvIHRoZSBnZW5lcmljIHRlcm1pbmFsIGlkIGlmIHRoZXJlIGlzXG5cdFx0Ly8gYW4gaXNzdWVcblx0XHRjb25zdCByZXNvdXJjZSA9IHNoZWxsTGF1bmNoQ29uZmlnID09PSB1bmRlZmluZWQgfHwgaXNTdHJpbmcoc2hlbGxMYXVuY2hDb25maWcuY3dkKSA/IHVuZGVmaW5lZCA6IHNoZWxsTGF1bmNoQ29uZmlnLmN3ZDtcblx0XHRzaGVsbExhdW5jaENvbmZpZy5pY29uID0gdGhpcy5fZ2V0Q3VzdG9tSWNvbihzaGVsbExhdW5jaENvbmZpZy5pY29uKVxuXHRcdFx0fHwgdGhpcy5fZ2V0Q3VzdG9tSWNvbihyZXNvbHZlZFByb2ZpbGUuaWNvbilcblx0XHRcdHx8IHRoaXMuZ2V0RGVmYXVsdEljb24ocmVzb3VyY2UpO1xuXG5cdFx0Ly8gT3ZlcnJpZGUgdGhlIG5hbWUgaWYgc3BlY2lmaWVkXG5cdFx0aWYgKHJlc29sdmVkUHJvZmlsZS5vdmVycmlkZU5hbWUpIHtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLm5hbWUgPSByZXNvbHZlZFByb2ZpbGUucHJvZmlsZU5hbWU7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgdGhlIGNvbG9yXG5cdFx0c2hlbGxMYXVuY2hDb25maWcuY29sb3IgPSBzaGVsbExhdW5jaENvbmZpZy5jb2xvclxuXHRcdFx0fHwgcmVzb2x2ZWRQcm9maWxlLmNvbG9yXG5cdFx0XHR8fCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5UYWJzRGVmYXVsdENvbG9yLCB7IHJlc291cmNlIH0pO1xuXG5cdFx0Ly8gUmVzb2x2ZSB1c2VTaGVsbEVudmlyb25tZW50IGJhc2VkIG9uIHRoZSBzZXR0aW5nIGlmIGl0J3Mgbm90IHNldFxuXHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLnVzZVNoZWxsRW52aXJvbm1lbnQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbFNldHRpbmdJZC5Jbmhlcml0RW52KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXREZWZhdWx0U2hlbGwob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5nZXREZWZhdWx0UHJvZmlsZShvcHRpb25zKSkucGF0aDtcblx0fVxuXG5cdGFzeW5jIGdldERlZmF1bHRTaGVsbEFyZ3Mob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPFNpbmdsZU9yTWFueTxzdHJpbmc+PiB7XG5cdFx0cmV0dXJuIChhd2FpdCB0aGlzLmdldERlZmF1bHRQcm9maWxlKG9wdGlvbnMpKS5hcmdzIHx8IFtdO1xuXHR9XG5cblx0YXN5bmMgZ2V0RGVmYXVsdFByb2ZpbGUob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb2x2ZVByb2ZpbGUoYXdhaXQgdGhpcy5fZ2V0VW5yZXNvbHZlZERlZmF1bHRQcm9maWxlKG9wdGlvbnMpLCBvcHRpb25zKTtcblx0fVxuXG5cdGdldEVudmlyb25tZW50KHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRleHQuZ2V0RW52aXJvbm1lbnQocmVtb3RlQXV0aG9yaXR5KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1c3RvbUljb24oaWNvbj86IFRlcm1pbmFsSWNvbik6IFRlcm1pbmFsSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoaXNTdHJpbmcoaWNvbikpIHtcblx0XHRcdHJldHVybiBUaGVtZUljb24uZnJvbUlkKGljb24pO1xuXHRcdH1cblx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHRyZXR1cm4gaWNvbjtcblx0XHR9XG5cdFx0aWYgKFVSSS5pc1VyaShpY29uKSB8fCBpc1VyaUNvbXBvbmVudHMoaWNvbikpIHtcblx0XHRcdHJldHVybiBVUkkucmV2aXZlKGljb24pO1xuXHRcdH1cblx0XHRpZiAoKFVSSS5pc1VyaShpY29uLmxpZ2h0KSB8fCBpc1VyaUNvbXBvbmVudHMoaWNvbi5saWdodCkpICYmIChVUkkuaXNVcmkoaWNvbi5kYXJrKSB8fCBpc1VyaUNvbXBvbmVudHMoaWNvbi5kYXJrKSkpIHtcblx0XHRcdHJldHVybiB7IGxpZ2h0OiBVUkkucmV2aXZlKGljb24ubGlnaHQpLCBkYXJrOiBVUkkucmV2aXZlKGljb24uZGFyaykgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFVucmVzb2x2ZWREZWZhdWx0UHJvZmlsZShvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT4ge1xuXHRcdC8vIElmIGFnZW50IGhvc3Qgc2hlbGwgaXMgYWxsb3dlZCwgcHJlZmVyIHRoYXQuXG5cdFx0aWYgKG9wdGlvbnMuYWxsb3dBZ2VudEhvc3RTaGVsbCkge1xuXHRcdFx0Y29uc3QgcmF3ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoYHRlcm1pbmFsLmludGVncmF0ZWQuYWdlbnRIb3N0UHJvZmlsZS4ke3RoaXMuX2dldE9zS2V5KG9wdGlvbnMub3MpfWApO1xuXHRcdFx0aWYgKGlzU3RyaW5nKHJhdykpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5wcm9maWxlc1JlYWR5O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWdlbnRIb3N0U2hlbGxQcm9maWxlID0gdGhpcy5fZ2V0VW5yZXNvbHZlZEFnZW50SG9zdFNoZWxsUHJvZmlsZShvcHRpb25zKTtcblx0XHRcdGlmIChhZ2VudEhvc3RTaGVsbFByb2ZpbGUpIHtcblx0XHRcdFx0cmV0dXJuIGFnZW50SG9zdFNoZWxsUHJvZmlsZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBhdXRvbWF0aW9uIHNoZWxsIGlzIGFsbG93ZWQsIHByZWZlciB0aGF0XG5cdFx0aWYgKG9wdGlvbnMuYWxsb3dBdXRvbWF0aW9uU2hlbGwpIHtcblx0XHRcdGNvbnN0IGF1dG9tYXRpb25TaGVsbFByb2ZpbGUgPSB0aGlzLl9nZXRVbnJlc29sdmVkQXV0b21hdGlvblNoZWxsUHJvZmlsZShvcHRpb25zKTtcblx0XHRcdGlmIChhdXRvbWF0aW9uU2hlbGxQcm9maWxlKSB7XG5cdFx0XHRcdHJldHVybiBhdXRvbWF0aW9uU2hlbGxQcm9maWxlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJldHVybiB0aGUgcmVhbCBkZWZhdWx0IHByb2ZpbGUgaWYgaXQgZXhpc3RzIGFuZCBpcyB2YWxpZCwgd2FpdCBmb3IgcHJvZmlsZXMgdG8gYmUgcmVhZHlcblx0XHQvLyBpZiB0aGUgd2luZG93IGp1c3Qgb3BlbmVkXG5cdFx0YXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5wcm9maWxlc1JlYWR5O1xuXHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlID0gdGhpcy5fZ2V0VW5yZXNvbHZlZFJlYWxEZWZhdWx0UHJvZmlsZShvcHRpb25zLm9zKTtcblx0XHRpZiAoZGVmYXVsdFByb2ZpbGUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXRJY29uRm9yQXV0b21hdGlvbihvcHRpb25zLCBkZWZhdWx0UHJvZmlsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgbm8gcmVhbCBkZWZhdWx0IHByb2ZpbGUsIGNyZWF0ZSBhIGZhbGxiYWNrIGRlZmF1bHQgcHJvZmlsZSBiYXNlZCBvbiB0aGUgc2hlbGxcblx0XHQvLyBhbmQgc2hlbGxBcmdzIHNldHRpbmdzIGluIGFkZGl0aW9uIHRvIHRoZSBjdXJyZW50IGVudmlyb25tZW50LlxuXHRcdHJldHVybiB0aGlzLl9zZXRJY29uRm9yQXV0b21hdGlvbihvcHRpb25zLCBhd2FpdCB0aGlzLl9nZXRVbnJlc29sdmVkRmFsbGJhY2tEZWZhdWx0UHJvZmlsZShvcHRpb25zKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRJY29uRm9yQXV0b21hdGlvbihvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucywgcHJvZmlsZTogSVRlcm1pbmFsUHJvZmlsZSk6IElUZXJtaW5hbFByb2ZpbGUge1xuXHRcdGlmIChvcHRpb25zLmFsbG93QXV0b21hdGlvblNoZWxsKSB7XG5cdFx0XHRjb25zdCBwcm9maWxlQ2xvbmUgPSBkZWVwQ2xvbmUocHJvZmlsZSk7XG5cdFx0XHRwcm9maWxlQ2xvbmUuaWNvbiA9IENvZGljb24udG9vbHM7XG5cdFx0XHRyZXR1cm4gcHJvZmlsZUNsb25lO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvZmlsZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFVucmVzb2x2ZWRSZWFsRGVmYXVsdFByb2ZpbGUob3M6IE9wZXJhdGluZ1N5c3RlbSk6IElUZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlKG9zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFVucmVzb2x2ZWRGYWxsYmFja0RlZmF1bHRQcm9maWxlKG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlPiB7XG5cdFx0Y29uc3QgZXhlY3V0YWJsZSA9IGF3YWl0IHRoaXMuX2NvbnRleHQuZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5LCBvcHRpb25zLm9zKTtcblxuXHRcdC8vIFRyeSBzZWxlY3QgYW4gZXhpc3RpbmcgcHJvZmlsZSB0byBmYWxsYmFjayB0bywgYmFzZWQgb24gdGhlIGRlZmF1bHQgc3lzdGVtIHNoZWxsLCBvbmx5IGRvXG5cdFx0Ly8gdGhpcyB3aGVuIGl0IGlzIE5PVCBhIGxvY2FsIHRlcm1pbmFsIGluIGEgcmVtb3RlIHdpbmRvdyB3aGVyZSB0aGUgZnJvbnQgYW5kIGJhY2sgZW5kIE9TXG5cdFx0Ly8gZGlmZmVycyAoZWcuIFdpbmRvd3MgLT4gV1NMLCBNYWMgLT4gTGludXgpXG5cdFx0aWYgKG9wdGlvbnMub3MgPT09IE9TKSB7XG5cdFx0XHRsZXQgZXhpc3RpbmdQcm9maWxlID0gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5hdmFpbGFibGVQcm9maWxlcy5maW5kKGUgPT4gcGF0aC5wYXJzZShlLnBhdGgpLm5hbWUgPT09IHBhdGgucGFyc2UoZXhlY3V0YWJsZSkubmFtZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdQcm9maWxlKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zLmFsbG93QXV0b21hdGlvblNoZWxsKSB7XG5cdFx0XHRcdFx0ZXhpc3RpbmdQcm9maWxlID0gZGVlcENsb25lKGV4aXN0aW5nUHJvZmlsZSk7XG5cdFx0XHRcdFx0ZXhpc3RpbmdQcm9maWxlLmljb24gPSBDb2RpY29uLnRvb2xzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBleGlzdGluZ1Byb2ZpbGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmluYWxseSBmYWxsYmFjayB0byBhIGdlbmVyYXRlZCBwcm9maWxlXG5cdFx0bGV0IGFyZ3M6IFNpbmdsZU9yTWFueTxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zLm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoICYmIHBhdGgucGFyc2UoZXhlY3V0YWJsZSkubmFtZS5tYXRjaCgvKHpzaHxiYXNoKS8pKSB7XG5cdFx0XHQvLyBtYWNPUyBzaG91bGQgbGF1bmNoIGEgbG9naW4gc2hlbGwgYnkgZGVmYXVsdFxuXHRcdFx0YXJncyA9IFsnLS1sb2dpbiddO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBSZXNvbHZlIHVuZGVmaW5lZCB0byBbXVxuXHRcdFx0YXJncyA9IFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGljb24gPSB0aGlzLl9ndWVzc1Byb2ZpbGVJY29uKGV4ZWN1dGFibGUpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb2ZpbGVOYW1lOiBnZW5lcmF0ZWRQcm9maWxlTmFtZSxcblx0XHRcdHBhdGg6IGV4ZWN1dGFibGUsXG5cdFx0XHRhcmdzLFxuXHRcdFx0aWNvbixcblx0XHRcdGlzRGVmYXVsdDogZmFsc2Vcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VW5yZXNvbHZlZEF1dG9tYXRpb25TaGVsbFByb2ZpbGUob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBJVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdXRvbWF0aW9uUHJvZmlsZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmF1dG9tYXRpb25Qcm9maWxlLiR7dGhpcy5fZ2V0T3NLZXkob3B0aW9ucy5vcyl9YCk7XG5cdFx0aWYgKHRoaXMuX2lzVmFsaWRBdXRvbWF0aW9uUHJvZmlsZShhdXRvbWF0aW9uUHJvZmlsZSwgb3B0aW9ucy5vcykpIHtcblx0XHRcdGF1dG9tYXRpb25Qcm9maWxlLmljb24gPSB0aGlzLl9nZXRDdXN0b21JY29uKGF1dG9tYXRpb25Qcm9maWxlLmljb24pIHx8IENvZGljb24udG9vbHM7XG5cdFx0XHRyZXR1cm4gYXV0b21hdGlvblByb2ZpbGU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFVucmVzb2x2ZWRBZ2VudEhvc3RTaGVsbFByb2ZpbGUob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBJVGVybWluYWxQcm9maWxlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhZ2VudEhvc3RQcm9maWxlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoYHRlcm1pbmFsLmludGVncmF0ZWQuYWdlbnRIb3N0UHJvZmlsZS4ke3RoaXMuX2dldE9zS2V5KG9wdGlvbnMub3MpfWApO1xuXG5cdFx0Ly8gQWxsb3cgYSBzdHJpbmcgdmFsdWUgYXMgYSByZWZlcmVuY2UgdG8gYSBuYW1lZCBwcm9maWxlIHVuZGVyXG5cdFx0Ly8gYHRlcm1pbmFsLmludGVncmF0ZWQucHJvZmlsZXMuPG9zPmAgXHUyMDE0IHNhbWUgY29udmVudGlvbiBhc1xuXHRcdC8vIGB0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRQcm9maWxlLjxvcz5gIFx1MjAxNCBzbyB1c2VycyBkb24ndCBoYXZlXG5cdFx0Ly8gdG8gaW5saW5lIHRoZSBwYXRoIHdoZW4gdGhleSBhbHJlYWR5IGhhdmUgdGhlIHByb2ZpbGUgZGVmaW5lZC5cblx0XHRpZiAoaXNTdHJpbmcoYWdlbnRIb3N0UHJvZmlsZSkpIHtcblx0XHRcdGNvbnN0IG5hbWVkID0gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5hdmFpbGFibGVQcm9maWxlcy5maW5kKHAgPT4gcC5wcm9maWxlTmFtZSA9PT0gYWdlbnRIb3N0UHJvZmlsZSAmJiAhcC5pc0F1dG9EZXRlY3RlZCk7XG5cdFx0XHRpZiAobmFtZWQpIHtcblx0XHRcdFx0Y29uc3QgY2xvbmVkID0gZGVlcENsb25lKG5hbWVkKTtcblx0XHRcdFx0Y2xvbmVkLmljb24gPSB0aGlzLl9nZXRDdXN0b21JY29uKGNsb25lZC5pY29uKSB8fCBDb2RpY29uLnRvb2xzO1xuXHRcdFx0XHRyZXR1cm4gY2xvbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNWYWxpZEF1dG9tYXRpb25Qcm9maWxlKGFnZW50SG9zdFByb2ZpbGUsIG9wdGlvbnMub3MpKSB7XG5cdFx0XHRhZ2VudEhvc3RQcm9maWxlLmljb24gPSB0aGlzLl9nZXRDdXN0b21JY29uKGFnZW50SG9zdFByb2ZpbGUuaWNvbikgfHwgQ29kaWNvbi50b29scztcblx0XHRcdHJldHVybiBhZ2VudEhvc3RQcm9maWxlO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlUHJvZmlsZShwcm9maWxlOiBJVGVybWluYWxQcm9maWxlLCBvcHRpb25zOiBJU2hlbGxMYXVuY2hDb25maWdSZXNvbHZlT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZT4ge1xuXHRcdGNvbnN0IGVudiA9IGF3YWl0IHRoaXMuX2NvbnRleHQuZ2V0RW52aXJvbm1lbnQob3B0aW9ucy5yZW1vdGVBdXRob3JpdHkpO1xuXG5cdFx0aWYgKG9wdGlvbnMub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSB7XG5cdFx0XHQvLyBDaGFuZ2UgU3lzbmF0aXZlIHRvIFN5c3RlbTMyIGlmIHRoZSBPUyBpcyBXaW5kb3dzIGJ1dCBOT1QgV29XNjQuIEl0J3Ncblx0XHRcdC8vIHNhZmUgdG8gYXNzdW1lIHRoYXQgdGhpcyB3YXMgdXNlZCBieSBhY2NpZGVudCBhcyBTeXNuYXRpdmUgZG9lcyBub3Rcblx0XHRcdC8vIGV4aXN0IGFuZCB3aWxsIGJyZWFrIHRoZSB0ZXJtaW5hbCBpbiBub24tV29XNjQgZW52aXJvbm1lbnRzLlxuXHRcdFx0Y29uc3QgaXNXb1c2NCA9ICEhZW52Lmhhc093blByb3BlcnR5KCdQUk9DRVNTT1JfQVJDSElURVc2NDMyJyk7XG5cdFx0XHRjb25zdCB3aW5kaXIgPSBlbnYud2luZGlyO1xuXHRcdFx0aWYgKCFpc1dvVzY0ICYmIHdpbmRpcikge1xuXHRcdFx0XHRjb25zdCBzeXNuYXRpdmVQYXRoID0gcGF0aC5qb2luKHdpbmRpciwgJ1N5c25hdGl2ZScpLnJlcGxhY2UoL1xcLy9nLCAnXFxcXCcpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmIChwcm9maWxlLnBhdGggJiYgcHJvZmlsZS5wYXRoLnRvTG93ZXJDYXNlKCkuaW5kZXhPZihzeXNuYXRpdmVQYXRoKSA9PT0gMCkge1xuXHRcdFx0XHRcdHByb2ZpbGUucGF0aCA9IHBhdGguam9pbih3aW5kaXIsICdTeXN0ZW0zMicsIHByb2ZpbGUucGF0aC5zdWJzdHIoc3lzbmF0aXZlUGF0aC5sZW5ndGggKyAxKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCAvIHRvIFxcIG9uIFdpbmRvd3MgZm9yIGNvbnZlbmllbmNlXG5cdFx0XHRpZiAocHJvZmlsZS5wYXRoKSB7XG5cdFx0XHRcdHByb2ZpbGUucGF0aCA9IHByb2ZpbGUucGF0aC5yZXBsYWNlKC9cXC8vZywgJ1xcXFwnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIHBhdGggdmFyaWFibGVzXG5cdFx0Y29uc3QgYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA9IHRoaXMuX2hpc3RvcnlTZXJ2aWNlLmdldExhc3RBY3RpdmVXb3Jrc3BhY2VSb290KG9wdGlvbnMucmVtb3RlQXV0aG9yaXR5ID8gU2NoZW1hcy52c2NvZGVSZW1vdGUgOiBTY2hlbWFzLmZpbGUpO1xuXHRcdGNvbnN0IGxhc3RBY3RpdmVXb3Jrc3BhY2UgPSBhY3RpdmVXb3Jrc3BhY2VSb290VXJpID8gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRwcm9maWxlLnBhdGggPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGVzKHByb2ZpbGUucGF0aCwgZW52LCBsYXN0QWN0aXZlV29ya3NwYWNlKTtcblxuXHRcdC8vIFJlc29sdmUgYXJncyB2YXJpYWJsZXNcblx0XHRpZiAocHJvZmlsZS5hcmdzKSB7XG5cdFx0XHRpZiAoaXNTdHJpbmcocHJvZmlsZS5hcmdzKSkge1xuXHRcdFx0XHRwcm9maWxlLmFyZ3MgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGVzKHByb2ZpbGUuYXJncywgZW52LCBsYXN0QWN0aXZlV29ya3NwYWNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2ZpbGUuYXJncyA9IGF3YWl0IFByb21pc2UuYWxsKHByb2ZpbGUuYXJncy5tYXAoYXJnID0+IHRoaXMuX3Jlc29sdmVWYXJpYWJsZXMoYXJnLCBlbnYsIGxhc3RBY3RpdmVXb3Jrc3BhY2UpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHByb2ZpbGU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVmFyaWFibGVzKHZhbHVlOiBzdHJpbmcsIGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCwgbGFzdEFjdGl2ZVdvcmtzcGFjZTogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCkge1xuXHRcdHRyeSB7XG5cdFx0XHR2YWx1ZSA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZVdpdGhFbnZpcm9ubWVudChlbnYsIGxhc3RBY3RpdmVXb3Jrc3BhY2UsIHZhbHVlKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBDb3VsZCBub3QgcmVzb2x2ZSBzaGVsbGAsIGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPc0tleShvczogT3BlcmF0aW5nU3lzdGVtKTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKG9zKSB7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5MaW51eDogcmV0dXJuICdsaW51eCc7XG5cdFx0XHRjYXNlIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2g6IHJldHVybiAnb3N4Jztcblx0XHRcdGNhc2UgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3M6IHJldHVybiAnd2luZG93cyc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ3Vlc3NQcm9maWxlSWNvbihzaGVsbDogc3RyaW5nKTogVGhlbWVJY29uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaWxlID0gcGF0aC5wYXJzZShzaGVsbCkubmFtZTtcblx0XHRzd2l0Y2ggKGZpbGUpIHtcblx0XHRcdGNhc2UgJ2Jhc2gnOlxuXHRcdFx0XHRyZXR1cm4gQ29kaWNvbi50ZXJtaW5hbEJhc2g7XG5cdFx0XHRjYXNlICdwd3NoJzpcblx0XHRcdGNhc2UgJ3Bvd2Vyc2hlbGwnOlxuXHRcdFx0XHRyZXR1cm4gQ29kaWNvbi50ZXJtaW5hbFBvd2Vyc2hlbGw7XG5cdFx0XHRjYXNlICd0bXV4Jzpcblx0XHRcdFx0cmV0dXJuIENvZGljb24udGVybWluYWxUbXV4O1xuXHRcdFx0Y2FzZSAnY21kJzpcblx0XHRcdFx0cmV0dXJuIENvZGljb24udGVybWluYWxDbWQ7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzVmFsaWRBdXRvbWF0aW9uUHJvZmlsZShwcm9maWxlOiB1bmtub3duLCBvczogT3BlcmF0aW5nU3lzdGVtKTogcHJvZmlsZSBpcyBJVGVybWluYWxQcm9maWxlIHtcblx0XHRpZiAocHJvZmlsZSA9PT0gbnVsbCB8fCBwcm9maWxlID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHByb2ZpbGUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICgncGF0aCcgaW4gcHJvZmlsZSAmJiBpc1N0cmluZygocHJvZmlsZSBhcyB7IHBhdGg6IHVua25vd24gfSkucGF0aCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgZXh0ZW5kcyBCYXNlVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSGlzdG9yeVNlcnZpY2UgaGlzdG9yeVNlcnZpY2U6IElIaXN0b3J5U2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgdGVybWluYWxJbnN0YW5jZVNlcnZpY2U6IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSxcblx0XHRASVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UgdGVybWluYWxQcm9maWxlU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihcblx0XHRcdHtcblx0XHRcdFx0Z2V0RGVmYXVsdFN5c3RlbVNoZWxsOiBhc3luYyAocmVtb3RlQXV0aG9yaXR5LCBvcykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0ZXJtaW5hbEluc3RhbmNlU2VydmljZS5nZXRCYWNrZW5kKHJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRcdFx0aWYgKCFyZW1vdGVBdXRob3JpdHkgfHwgIWJhY2tlbmQpIHtcblx0XHRcdFx0XHRcdC8vIEp1c3QgcmV0dXJuIGJhc2ljIHZhbHVlcywgdGhpcyBpcyBvbmx5IGZvciBzZXJ2ZXJsZXNzIHdlYiBhbmQgd291bGRuJ3QgYmUgdXNlZFxuXHRcdFx0XHRcdFx0cmV0dXJuIG9zID09PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyA/ICdwd3NoJyA6ICdiYXNoJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGJhY2tlbmQuZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9zKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0RW52aXJvbm1lbnQ6IGFzeW5jIChyZW1vdGVBdXRob3JpdHkpID0+IHtcblx0XHRcdFx0XHRjb25zdCBiYWNrZW5kID0gYXdhaXQgdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZ2V0QmFja2VuZChyZW1vdGVBdXRob3JpdHkpO1xuXHRcdFx0XHRcdGlmICghcmVtb3RlQXV0aG9yaXR5IHx8ICFiYWNrZW5kKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZW52O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYmFja2VuZC5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0aGlzdG9yeVNlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0dGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRcdHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0cmVtb3RlQWdlbnRTZXJ2aWNlXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWtEO0FBQzNELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQThCLGlCQUFpQixVQUFVO0FBQ3pELFNBQTZCLHFCQUFxRCx5QkFBeUI7QUFDM0csU0FBNEUsK0JBQStCO0FBQzNHLFlBQVksVUFBVTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBc0M7QUFDL0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxpQkFBaUIsV0FBVztBQUNyQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFtQztBQU81QyxNQUFNLHVCQUF1QjtBQU10QixNQUFlLDJDQUEyQyxXQUFzRDtBQUFBLEVBVXRILFlBQ2tCLFVBQ0EsdUJBQ0EsK0JBQ0EsaUJBQ0EsYUFDQSx5QkFDQSwwQkFDQSxxQkFDaEI7QUFDRCxVQUFNO0FBVFc7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQWJsQixTQUFpQixnQkFBK0IsZ0JBQWdCO0FBaUIvRCxRQUFJLEtBQUssb0JBQW9CLGNBQWMsR0FBRztBQUM3QyxXQUFLLG9CQUFvQixlQUFlLEVBQUUsS0FBSyxDQUFBQSxTQUFPLEtBQUssb0JBQW9CQSxNQUFLLE1BQU0sRUFBRTtBQUFBLElBQzdGLE9BQU87QUFDTixXQUFLLG9CQUFvQjtBQUFBLElBQzFCO0FBQ0EsU0FBSyxVQUFVLEtBQUssc0JBQXNCLHlCQUF5QixPQUFLO0FBQ3ZFLFVB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
