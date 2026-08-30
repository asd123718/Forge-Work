import { Codicon, getAllCodicons } from "../../../base/common/codicons.js";
import { OperatingSystem, Platform, PlatformToString } from "../../../base/common/platform.js";
import { localize } from "../../../nls.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import { Registry } from "../../registry/common/platform.js";
import { TerminalSettingId } from "./terminal.js";
import { createProfileSchemaEnums } from "./terminalProfiles.js";
const terminalColorSchema = {
  type: ["string", "null"],
  enum: [
    "terminal.ansiBlack",
    "terminal.ansiRed",
    "terminal.ansiGreen",
    "terminal.ansiYellow",
    "terminal.ansiBlue",
    "terminal.ansiMagenta",
    "terminal.ansiCyan",
    "terminal.ansiWhite"
  ],
  default: null
};
const terminalIconSchema = {
  type: "string",
  enum: Array.from(getAllCodicons(), (icon) => icon.id),
  markdownEnumDescriptions: Array.from(getAllCodicons(), (icon) => `$(${icon.id})`)
};
const terminalProfileBaseProperties = {
  args: {
    description: localize("terminalProfile.args", "An optional set of arguments to run the shell executable with."),
    type: "array",
    items: {
      type: "string"
    }
  },
  icon: {
    description: localize("terminalProfile.icon", "A codicon ID to associate with the terminal icon."),
    ...terminalIconSchema
  },
  color: {
    description: localize("terminalProfile.color", "A theme color ID to associate with the terminal icon."),
    ...terminalColorSchema
  },
  env: {
    markdownDescription: localize("terminalProfile.env", "An object with environment variables that will be added to the terminal profile process. Set to `null` to delete environment variables from the base environment."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  }
};
const terminalProfileSchema = {
  type: "object",
  required: ["path"],
  properties: {
    path: {
      description: localize("terminalProfile.path", "A single path to a shell executable or an array of paths that will be used as fallbacks when one fails."),
      type: ["string", "array"],
      items: {
        type: "string"
      }
    },
    overrideName: {
      description: localize("terminalProfile.overrideName", "Whether or not to replace the dynamic terminal title that detects what program is running with the static profile name."),
      type: "boolean"
    },
    ...terminalProfileBaseProperties
  }
};
const terminalAutomationProfileSchema = {
  type: "object",
  required: ["path"],
  properties: {
    path: {
      description: localize("terminalAutomationProfile.path", "A path to a shell executable."),
      type: ["string"],
      items: {
        type: "string"
      }
    },
    ...terminalProfileBaseProperties
  }
};
function createTerminalProfileMarkdownDescription(platform) {
  const key = platform === Platform.Linux ? "linux" : platform === Platform.Mac ? "osx" : "windows";
  return localize(
    {
      key: "terminal.integrated.profile",
      comment: ["{0} is the platform, {1} is a code block, {2} and {3} are a link start and end"]
    },
    "A set of terminal profile customizations for {0} which allows adding, removing or changing how terminals are launched. Profiles are made up of a mandatory path, optional arguments and other presentation options.\n\nTo override an existing profile use its profile name as the key, for example:\n\n{1}\n\n{2}Read more about configuring profiles{3}.",
    PlatformToString(platform),
    '```json\n"terminal.integrated.profile.' + key + '": {\n  "bash": null\n}\n```',
    "[",
    "](https://code.visualstudio.com/docs/terminal/profiles)"
  );
}
const terminalPlatformConfiguration = {
  id: "terminal",
  order: 100,
  title: localize("terminalIntegratedConfigurationTitle", "Integrated Terminal"),
  type: "object",
  properties: {
    [TerminalSettingId.AutomationProfileLinux]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.automationProfile.linux", "The terminal profile to use on Linux for automation-related terminal usage like tasks and debug."),
      type: ["object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AutomationProfileMacOs]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.automationProfile.osx", "The terminal profile to use on macOS for automation-related terminal usage like tasks and debug."),
      type: ["object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AutomationProfileWindows]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.automationProfile.windows", "The terminal profile to use for automation-related terminal usage like tasks and debug. This setting will currently be ignored if {0} (now deprecated) is set.", "`terminal.integrated.automationShell.windows`"),
      type: ["object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AgentHostProfileLinux]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.agentHostProfile.linux", "The terminal profile to use on Linux for agent host terminals, including shells launched by AI agent tools. Accepts either a profile name from {0} or an inline profile object. When unset, falls back to {1}. Currently applies to the local agent host. Only the executable `path` is honored today; `args` and `env` from the profile are ignored. Remote agent hosts need remote-side shell configuration because local resolved paths may be invalid on the remote.", "`#terminal.integrated.profiles.linux#`", "`#terminal.integrated.defaultProfile.linux#`"),
      type: ["string", "object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        { type: "string" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AgentHostProfileMacOs]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.agentHostProfile.osx", "The terminal profile to use on macOS for agent host terminals, including shells launched by AI agent tools. Accepts either a profile name from {0} or an inline profile object. When unset, falls back to {1}. Currently applies to the local agent host. Only the executable `path` is honored today; `args` and `env` from the profile are ignored. Remote agent hosts need remote-side shell configuration because local resolved paths may be invalid on the remote.", "`#terminal.integrated.profiles.osx#`", "`#terminal.integrated.defaultProfile.osx#`"),
      type: ["string", "object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        { type: "string" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.AgentHostProfileWindows]: {
      restricted: true,
      markdownDescription: localize("terminal.integrated.agentHostProfile.windows", "The terminal profile to use on Windows for agent host terminals, including shells launched by AI agent tools. Accepts either a profile name from {0} or an inline profile object. When unset, falls back to {1}. Currently applies to the local agent host. Only the executable `path` is honored today; `args` and `env` from the profile are ignored. Remote agent hosts need remote-side shell configuration because local resolved paths may be invalid on the remote.", "`#terminal.integrated.profiles.windows#`", "`#terminal.integrated.defaultProfile.windows#`"),
      type: ["string", "object", "null"],
      default: null,
      "anyOf": [
        { type: "null" },
        { type: "string" },
        terminalAutomationProfileSchema
      ],
      defaultSnippets: [
        {
          body: {
            path: "${1}",
            icon: "${2}"
          }
        }
      ]
    },
    [TerminalSettingId.ProfilesWindows]: {
      restricted: true,
      markdownDescription: createTerminalProfileMarkdownDescription(Platform.Windows),
      type: "object",
      default: {
        "PowerShell": {
          source: "PowerShell",
          icon: Codicon.terminalPowershell.id
        },
        "Command Prompt": {
          path: [
            "${env:windir}\\Sysnative\\cmd.exe",
            "${env:windir}\\System32\\cmd.exe"
          ],
          args: [],
          icon: Codicon.terminalCmd.id
        },
        "Git Bash": {
          source: "Git Bash",
          icon: Codicon.terminalGitBash.id
        }
      },
      additionalProperties: {
        "anyOf": [
          {
            type: "object",
            required: ["source"],
            properties: {
              source: {
                description: localize("terminalProfile.windowsSource", "A profile source that will auto detect the paths to the shell. Note that non-standard executable locations are not supported and must be created manually in a new profile."),
                enum: ["PowerShell", "Git Bash"]
              },
              ...terminalProfileBaseProperties
            }
          },
          {
            type: "object",
            required: ["extensionIdentifier", "id", "title"],
            properties: {
              extensionIdentifier: {
                description: localize("terminalProfile.windowsExtensionIdentifier", "The extension that contributed this profile."),
                type: "string"
              },
              id: {
                description: localize("terminalProfile.windowsExtensionId", "The id of the extension terminal"),
                type: "string"
              },
              title: {
                description: localize("terminalProfile.windowsExtensionTitle", "The name of the extension terminal"),
                type: "string"
              },
              ...terminalProfileBaseProperties
            }
          },
          { type: "null" },
          terminalProfileSchema
        ]
      }
    },
    [TerminalSettingId.ProfilesMacOs]: {
      restricted: true,
      markdownDescription: createTerminalProfileMarkdownDescription(Platform.Mac),
      type: "object",
      default: {
        "bash": {
          path: "bash",
          args: ["-l"],
          icon: Codicon.terminalBash.id
        },
        "zsh": {
          path: "zsh",
          args: ["-l"]
        },
        "fish": {
          path: "fish",
          args: ["-l"]
        },
        "tmux": {
          path: "tmux",
          icon: Codicon.terminalTmux.id
        },
        "pwsh": {
          path: "pwsh",
          icon: Codicon.terminalPowershell.id
        }
      },
      additionalProperties: {
        "anyOf": [
          {
            type: "object",
            required: ["extensionIdentifier", "id", "title"],
            properties: {
              extensionIdentifier: {
                description: localize("terminalProfile.osxExtensionIdentifier", "The extension that contributed this profile."),
                type: "string"
              },
              id: {
                description: localize("terminalProfile.osxExtensionId", "The id of the extension terminal"),
                type: "string"
              },
              title: {
                description: localize("terminalProfile.osxExtensionTitle", "The name of the extension terminal"),
                type: "string"
              },
              ...terminalProfileBaseProperties
            }
          },
          { type: "null" },
          terminalProfileSchema
        ]
      }
    },
    [TerminalSettingId.ProfilesLinux]: {
      restricted: true,
      markdownDescription: createTerminalProfileMarkdownDescription(Platform.Linux),
      type: "object",
      default: {
        "bash": {
          path: "bash",
          icon: Codicon.terminalBash.id
        },
        "zsh": {
          path: "zsh"
        },
        "fish": {
          path: "fish"
        },
        "tmux": {
          path: "tmux",
          icon: Codicon.terminalTmux.id
        },
        "pwsh": {
          path: "pwsh",
          icon: Codicon.terminalPowershell.id
        }
      },
      additionalProperties: {
        "anyOf": [
          {
            type: "object",
            required: ["extensionIdentifier", "id", "title"],
            properties: {
              extensionIdentifier: {
                description: localize("terminalProfile.linuxExtensionIdentifier", "The extension that contributed this profile."),
                type: "string"
              },
              id: {
                description: localize("terminalProfile.linuxExtensionId", "The id of the extension terminal"),
                type: "string"
              },
              title: {
                description: localize("terminalProfile.linuxExtensionTitle", "The name of the extension terminal"),
                type: "string"
              },
              ...terminalProfileBaseProperties
            }
          },
          { type: "null" },
          terminalProfileSchema
        ]
      }
    },
    [TerminalSettingId.UseWslProfiles]: {
      description: localize("terminal.integrated.useWslProfiles", "Controls whether or not WSL distros are shown in the terminal dropdown"),
      type: "boolean",
      default: true
    },
    [TerminalSettingId.InheritEnv]: {
      scope: ConfigurationScope.APPLICATION,
      description: localize("terminal.integrated.inheritEnv", "Whether new shells should inherit their environment from VS Code, which may source a login shell to ensure $PATH and other development variables are initialized. This has no effect on Windows."),
      type: "boolean",
      default: true
    },
    [TerminalSettingId.PersistentSessionScrollback]: {
      scope: ConfigurationScope.APPLICATION,
      markdownDescription: localize("terminal.integrated.persistentSessionScrollback", "Controls the maximum amount of lines that will be restored when reconnecting to a persistent terminal session. Increasing this will restore more lines of scrollback at the cost of more memory and increase the time it takes to connect to terminals on start up. This setting requires a restart to take effect and should be set to a value less than or equal to `#terminal.integrated.scrollback#`."),
      type: "number",
      default: 100
    },
    [TerminalSettingId.ShowLinkHover]: {
      scope: ConfigurationScope.APPLICATION,
      description: localize("terminal.integrated.showLinkHover", "Whether to show hovers for links in the terminal output."),
      type: "boolean",
      default: true
    },
    [TerminalSettingId.IgnoreProcessNames]: {
      markdownDescription: localize("terminal.integrated.confirmIgnoreProcesses", "A set of process names to ignore when using the {0} setting.", "`#terminal.integrated.confirmOnKill#`"),
      type: "array",
      items: {
        type: "string",
        uniqueItems: true
      },
      default: [
        // Popular prompt programs, these should not count as child processes
        "starship",
        "oh-my-posh",
        // Git bash may runs a subprocess of itself (bin\bash.exe -> usr\bin\bash.exe)
        "bash",
        "zsh"
      ]
    }
  }
};
function registerTerminalPlatformConfiguration() {
  Registry.as(Extensions.Configuration).registerConfiguration(terminalPlatformConfiguration);
  registerTerminalDefaultProfileConfiguration();
}
let defaultProfilesConfiguration;
function registerTerminalDefaultProfileConfiguration(detectedProfiles, extensionContributedProfiles) {
  const registry = Registry.as(Extensions.Configuration);
  let profileEnum;
  if (detectedProfiles) {
    profileEnum = createProfileSchemaEnums(detectedProfiles?.profiles, extensionContributedProfiles);
  }
  const oldDefaultProfilesConfiguration = defaultProfilesConfiguration;
  defaultProfilesConfiguration = {
    id: "terminal",
    order: 100,
    title: localize("terminalIntegratedConfigurationTitle", "Integrated Terminal"),
    type: "object",
    properties: {
      [TerminalSettingId.DefaultProfileLinux]: {
        restricted: true,
        markdownDescription: localize("terminal.integrated.defaultProfile.linux", "The default terminal profile on Linux."),
        type: ["string", "null"],
        default: null,
        enum: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.values : void 0,
        markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Linux ? profileEnum?.markdownDescriptions : void 0
      },
      [TerminalSettingId.DefaultProfileMacOs]: {
        restricted: true,
        markdownDescription: localize("terminal.integrated.defaultProfile.osx", "The default terminal profile on macOS."),
        type: ["string", "null"],
        default: null,
        enum: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.values : void 0,
        markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Macintosh ? profileEnum?.markdownDescriptions : void 0
      },
      [TerminalSettingId.DefaultProfileWindows]: {
        restricted: true,
        markdownDescription: localize("terminal.integrated.defaultProfile.windows", "The default terminal profile on Windows."),
        type: ["string", "null"],
        default: null,
        enum: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.values : void 0,
        markdownEnumDescriptions: detectedProfiles?.os === OperatingSystem.Windows ? profileEnum?.markdownDescriptions : void 0
      }
    }
  };
  registry.updateConfigurations({ add: [defaultProfilesConfiguration], remove: oldDefaultProfilesConfiguration ? [oldDefaultProfilesConfiguration] : [] });
}
export {
  registerTerminalDefaultProfileConfiguration,
  registerTerminalPlatformConfiguration,
  terminalColorSchema,
  terminalIconSchema,
  terminalProfileBaseProperties
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdGVybWluYWxcXGNvbW1vblxcdGVybWluYWxQbGF0Zm9ybUNvbmZpZ3VyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uLCBnZXRBbGxDb2RpY29ucyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtLCBQbGF0Zm9ybSwgUGxhdGZvcm1Ub1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUsIElUZXJtaW5hbFByb2ZpbGUsIFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQcm9maWxlU2NoZW1hRW51bXMgfSBmcm9tICcuL3Rlcm1pbmFsUHJvZmlsZXMuanMnO1xuXG5leHBvcnQgY29uc3QgdGVybWluYWxDb2xvclNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0ZW51bTogW1xuXHRcdCd0ZXJtaW5hbC5hbnNpQmxhY2snLFxuXHRcdCd0ZXJtaW5hbC5hbnNpUmVkJyxcblx0XHQndGVybWluYWwuYW5zaUdyZWVuJyxcblx0XHQndGVybWluYWwuYW5zaVllbGxvdycsXG5cdFx0J3Rlcm1pbmFsLmFuc2lCbHVlJyxcblx0XHQndGVybWluYWwuYW5zaU1hZ2VudGEnLFxuXHRcdCd0ZXJtaW5hbC5hbnNpQ3lhbicsXG5cdFx0J3Rlcm1pbmFsLmFuc2lXaGl0ZSdcblx0XSxcblx0ZGVmYXVsdDogbnVsbFxufTtcblxuZXhwb3J0IGNvbnN0IHRlcm1pbmFsSWNvblNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBBcnJheS5mcm9tKGdldEFsbENvZGljb25zKCksIGljb24gPT4gaWNvbi5pZCksXG5cdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogQXJyYXkuZnJvbShnZXRBbGxDb2RpY29ucygpLCBpY29uID0+IGAkKCR7aWNvbi5pZH0pYCksXG59O1xuXG5leHBvcnQgY29uc3QgdGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXM6IElKU09OU2NoZW1hTWFwID0ge1xuXHRhcmdzOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUuYXJncycsICdBbiBvcHRpb25hbCBzZXQgb2YgYXJndW1lbnRzIHRvIHJ1biB0aGUgc2hlbGwgZXhlY3V0YWJsZSB3aXRoLicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fVxuXHR9LFxuXHRpY29uOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUuaWNvbicsICdBIGNvZGljb24gSUQgdG8gYXNzb2NpYXRlIHdpdGggdGhlIHRlcm1pbmFsIGljb24uJyksXG5cdFx0Li4udGVybWluYWxJY29uU2NoZW1hXG5cdH0sXG5cdGNvbG9yOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUuY29sb3InLCAnQSB0aGVtZSBjb2xvciBJRCB0byBhc3NvY2lhdGUgd2l0aCB0aGUgdGVybWluYWwgaWNvbi4nKSxcblx0XHQuLi50ZXJtaW5hbENvbG9yU2NoZW1hXG5cdH0sXG5cdGVudjoge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUuZW52JywgXCJBbiBvYmplY3Qgd2l0aCBlbnZpcm9ubWVudCB2YXJpYWJsZXMgdGhhdCB3aWxsIGJlIGFkZGVkIHRvIHRoZSB0ZXJtaW5hbCBwcm9maWxlIHByb2Nlc3MuIFNldCB0byBgbnVsbGAgdG8gZGVsZXRlIGVudmlyb25tZW50IHZhcmlhYmxlcyBmcm9tIHRoZSBiYXNlIGVudmlyb25tZW50LlwiKSxcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddXG5cdFx0fSxcblx0XHRkZWZhdWx0OiB7fVxuXHR9XG59O1xuXG5jb25zdCB0ZXJtaW5hbFByb2ZpbGVTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cmVxdWlyZWQ6IFsncGF0aCddLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0cGF0aDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUucGF0aCcsICdBIHNpbmdsZSBwYXRoIHRvIGEgc2hlbGwgZXhlY3V0YWJsZSBvciBhbiBhcnJheSBvZiBwYXRocyB0aGF0IHdpbGwgYmUgdXNlZCBhcyBmYWxsYmFja3Mgd2hlbiBvbmUgZmFpbHMuJyksXG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdhcnJheSddLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH1cblx0XHR9LFxuXHRcdG92ZXJyaWRlTmFtZToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUub3ZlcnJpZGVOYW1lJywgJ1doZXRoZXIgb3Igbm90IHRvIHJlcGxhY2UgdGhlIGR5bmFtaWMgdGVybWluYWwgdGl0bGUgdGhhdCBkZXRlY3RzIHdoYXQgcHJvZ3JhbSBpcyBydW5uaW5nIHdpdGggdGhlIHN0YXRpYyBwcm9maWxlIG5hbWUuJyksXG5cdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHR9LFxuXHRcdC4uLnRlcm1pbmFsUHJvZmlsZUJhc2VQcm9wZXJ0aWVzXG5cdH1cbn07XG5cbmNvbnN0IHRlcm1pbmFsQXV0b21hdGlvblByb2ZpbGVTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cmVxdWlyZWQ6IFsncGF0aCddLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0cGF0aDoge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbEF1dG9tYXRpb25Qcm9maWxlLnBhdGgnLCAnQSBwYXRoIHRvIGEgc2hlbGwgZXhlY3V0YWJsZS4nKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJ10sXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Li4udGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXNcblx0fVxufTtcblxuZnVuY3Rpb24gY3JlYXRlVGVybWluYWxQcm9maWxlTWFya2Rvd25EZXNjcmlwdGlvbihwbGF0Zm9ybTogUGxhdGZvcm0uTGludXggfCBQbGF0Zm9ybS5NYWMgfCBQbGF0Zm9ybS5XaW5kb3dzKTogc3RyaW5nIHtcblx0Y29uc3Qga2V5ID0gcGxhdGZvcm0gPT09IFBsYXRmb3JtLkxpbnV4ID8gJ2xpbnV4JyA6IHBsYXRmb3JtID09PSBQbGF0Zm9ybS5NYWMgPyAnb3N4JyA6ICd3aW5kb3dzJztcblx0cmV0dXJuIGxvY2FsaXplKFxuXHRcdHtcblx0XHRcdGtleTogJ3Rlcm1pbmFsLmludGVncmF0ZWQucHJvZmlsZScsXG5cdFx0XHRjb21tZW50OiBbJ3swfSBpcyB0aGUgcGxhdGZvcm0sIHsxfSBpcyBhIGNvZGUgYmxvY2ssIHsyfSBhbmQgezN9IGFyZSBhIGxpbmsgc3RhcnQgYW5kIGVuZCddXG5cdFx0fSxcblx0XHRcIkEgc2V0IG9mIHRlcm1pbmFsIHByb2ZpbGUgY3VzdG9taXphdGlvbnMgZm9yIHswfSB3aGljaCBhbGxvd3MgYWRkaW5nLCByZW1vdmluZyBvciBjaGFuZ2luZyBob3cgdGVybWluYWxzIGFyZSBsYXVuY2hlZC4gUHJvZmlsZXMgYXJlIG1hZGUgdXAgb2YgYSBtYW5kYXRvcnkgcGF0aCwgb3B0aW9uYWwgYXJndW1lbnRzIGFuZCBvdGhlciBwcmVzZW50YXRpb24gb3B0aW9ucy5cXG5cXG5UbyBvdmVycmlkZSBhbiBleGlzdGluZyBwcm9maWxlIHVzZSBpdHMgcHJvZmlsZSBuYW1lIGFzIHRoZSBrZXksIGZvciBleGFtcGxlOlxcblxcbnsxfVxcblxcbnsyfVJlYWQgbW9yZSBhYm91dCBjb25maWd1cmluZyBwcm9maWxlc3szfS5cIixcblx0XHRQbGF0Zm9ybVRvU3RyaW5nKHBsYXRmb3JtKSxcblx0XHQnYGBganNvblxcblwidGVybWluYWwuaW50ZWdyYXRlZC5wcm9maWxlLicgKyBrZXkgKyAnXCI6IHtcXG4gIFwiYmFzaFwiOiBudWxsXFxufVxcbmBgYCcsXG5cdFx0J1snLFxuXHRcdCddKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvdGVybWluYWwvcHJvZmlsZXMpJ1xuXHQpO1xufVxuXG5jb25zdCB0ZXJtaW5hbFBsYXRmb3JtQ29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlID0ge1xuXHRpZDogJ3Rlcm1pbmFsJyxcblx0b3JkZXI6IDEwMCxcblx0dGl0bGU6IGxvY2FsaXplKCd0ZXJtaW5hbEludGVncmF0ZWRDb25maWd1cmF0aW9uVGl0bGUnLCBcIkludGVncmF0ZWQgVGVybWluYWxcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkF1dG9tYXRpb25Qcm9maWxlTGludXhdOiB7XG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYXV0b21hdGlvblByb2ZpbGUubGludXgnLCBcIlRoZSB0ZXJtaW5hbCBwcm9maWxlIHRvIHVzZSBvbiBMaW51eCBmb3IgYXV0b21hdGlvbi1yZWxhdGVkIHRlcm1pbmFsIHVzYWdlIGxpa2UgdGFza3MgYW5kIGRlYnVnLlwiKSxcblx0XHRcdHR5cGU6IFsnb2JqZWN0JywgJ251bGwnXSxcblx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdHsgdHlwZTogJ251bGwnIH0sXG5cdFx0XHRcdHRlcm1pbmFsQXV0b21hdGlvblByb2ZpbGVTY2hlbWFcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdHBhdGg6ICckezF9Jyxcblx0XHRcdFx0XHRcdGljb246ICckezJ9J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkF1dG9tYXRpb25Qcm9maWxlTWFjT3NdOiB7XG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYXV0b21hdGlvblByb2ZpbGUub3N4JywgXCJUaGUgdGVybWluYWwgcHJvZmlsZSB0byB1c2Ugb24gbWFjT1MgZm9yIGF1dG9tYXRpb24tcmVsYXRlZCB0ZXJtaW5hbCB1c2FnZSBsaWtlIHRhc2tzIGFuZCBkZWJ1Zy5cIiksXG5cdFx0XHR0eXBlOiBbJ29iamVjdCcsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHR0ZXJtaW5hbEF1dG9tYXRpb25Qcm9maWxlU2NoZW1hXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHRwYXRoOiAnJHsxfScsXG5cdFx0XHRcdFx0XHRpY29uOiAnJHsyfSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdFtUZXJtaW5hbFNldHRpbmdJZC5BdXRvbWF0aW9uUHJvZmlsZVdpbmRvd3NdOiB7XG5cdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYXV0b21hdGlvblByb2ZpbGUud2luZG93cycsIFwiVGhlIHRlcm1pbmFsIHByb2ZpbGUgdG8gdXNlIGZvciBhdXRvbWF0aW9uLXJlbGF0ZWQgdGVybWluYWwgdXNhZ2UgbGlrZSB0YXNrcyBhbmQgZGVidWcuIFRoaXMgc2V0dGluZyB3aWxsIGN1cnJlbnRseSBiZSBpZ25vcmVkIGlmIHswfSAobm93IGRlcHJlY2F0ZWQpIGlzIHNldC5cIiwgJ2B0ZXJtaW5hbC5pbnRlZ3JhdGVkLmF1dG9tYXRpb25TaGVsbC53aW5kb3dzYCcpLFxuXHRcdFx0dHlwZTogWydvYmplY3QnLCAnbnVsbCddLFxuXHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdFx0dGVybWluYWxBdXRvbWF0aW9uUHJvZmlsZVNjaGVtYVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0cGF0aDogJyR7MX0nLFxuXHRcdFx0XHRcdFx0aWNvbjogJyR7Mn0nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuQWdlbnRIb3N0UHJvZmlsZUxpbnV4XToge1xuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmFnZW50SG9zdFByb2ZpbGUubGludXgnLCBcIlRoZSB0ZXJtaW5hbCBwcm9maWxlIHRvIHVzZSBvbiBMaW51eCBmb3IgYWdlbnQgaG9zdCB0ZXJtaW5hbHMsIGluY2x1ZGluZyBzaGVsbHMgbGF1bmNoZWQgYnkgQUkgYWdlbnQgdG9vbHMuIEFjY2VwdHMgZWl0aGVyIGEgcHJvZmlsZSBuYW1lIGZyb20gezB9IG9yIGFuIGlubGluZSBwcm9maWxlIG9iamVjdC4gV2hlbiB1bnNldCwgZmFsbHMgYmFjayB0byB7MX0uIEN1cnJlbnRseSBhcHBsaWVzIHRvIHRoZSBsb2NhbCBhZ2VudCBob3N0LiBPbmx5IHRoZSBleGVjdXRhYmxlIGBwYXRoYCBpcyBob25vcmVkIHRvZGF5OyBgYXJnc2AgYW5kIGBlbnZgIGZyb20gdGhlIHByb2ZpbGUgYXJlIGlnbm9yZWQuIFJlbW90ZSBhZ2VudCBob3N0cyBuZWVkIHJlbW90ZS1zaWRlIHNoZWxsIGNvbmZpZ3VyYXRpb24gYmVjYXVzZSBsb2NhbCByZXNvbHZlZCBwYXRocyBtYXkgYmUgaW52YWxpZCBvbiB0aGUgcmVtb3RlLlwiLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLnByb2ZpbGVzLmxpbnV4I2AnLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRQcm9maWxlLmxpbnV4I2AnKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCcsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdHRlcm1pbmFsQXV0b21hdGlvblByb2ZpbGVTY2hlbWFcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdHBhdGg6ICckezF9Jyxcblx0XHRcdFx0XHRcdGljb246ICckezJ9J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkFnZW50SG9zdFByb2ZpbGVNYWNPc106IHtcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hZ2VudEhvc3RQcm9maWxlLm9zeCcsIFwiVGhlIHRlcm1pbmFsIHByb2ZpbGUgdG8gdXNlIG9uIG1hY09TIGZvciBhZ2VudCBob3N0IHRlcm1pbmFscywgaW5jbHVkaW5nIHNoZWxscyBsYXVuY2hlZCBieSBBSSBhZ2VudCB0b29scy4gQWNjZXB0cyBlaXRoZXIgYSBwcm9maWxlIG5hbWUgZnJvbSB7MH0gb3IgYW4gaW5saW5lIHByb2ZpbGUgb2JqZWN0LiBXaGVuIHVuc2V0LCBmYWxscyBiYWNrIHRvIHsxfS4gQ3VycmVudGx5IGFwcGxpZXMgdG8gdGhlIGxvY2FsIGFnZW50IGhvc3QuIE9ubHkgdGhlIGV4ZWN1dGFibGUgYHBhdGhgIGlzIGhvbm9yZWQgdG9kYXk7IGBhcmdzYCBhbmQgYGVudmAgZnJvbSB0aGUgcHJvZmlsZSBhcmUgaWdub3JlZC4gUmVtb3RlIGFnZW50IGhvc3RzIG5lZWQgcmVtb3RlLXNpZGUgc2hlbGwgY29uZmlndXJhdGlvbiBiZWNhdXNlIGxvY2FsIHJlc29sdmVkIHBhdGhzIG1heSBiZSBpbnZhbGlkIG9uIHRoZSByZW1vdGUuXCIsICdgI3Rlcm1pbmFsLmludGVncmF0ZWQucHJvZmlsZXMub3N4I2AnLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRQcm9maWxlLm9zeCNgJyksXG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdvYmplY3QnLCAnbnVsbCddLFxuXHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0eyB0eXBlOiAnbnVsbCcgfSxcblx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHR0ZXJtaW5hbEF1dG9tYXRpb25Qcm9maWxlU2NoZW1hXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHRwYXRoOiAnJHsxfScsXG5cdFx0XHRcdFx0XHRpY29uOiAnJHsyfSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdFtUZXJtaW5hbFNldHRpbmdJZC5BZ2VudEhvc3RQcm9maWxlV2luZG93c106IHtcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hZ2VudEhvc3RQcm9maWxlLndpbmRvd3MnLCBcIlRoZSB0ZXJtaW5hbCBwcm9maWxlIHRvIHVzZSBvbiBXaW5kb3dzIGZvciBhZ2VudCBob3N0IHRlcm1pbmFscywgaW5jbHVkaW5nIHNoZWxscyBsYXVuY2hlZCBieSBBSSBhZ2VudCB0b29scy4gQWNjZXB0cyBlaXRoZXIgYSBwcm9maWxlIG5hbWUgZnJvbSB7MH0gb3IgYW4gaW5saW5lIHByb2ZpbGUgb2JqZWN0LiBXaGVuIHVuc2V0LCBmYWxscyBiYWNrIHRvIHsxfS4gQ3VycmVudGx5IGFwcGxpZXMgdG8gdGhlIGxvY2FsIGFnZW50IGhvc3QuIE9ubHkgdGhlIGV4ZWN1dGFibGUgYHBhdGhgIGlzIGhvbm9yZWQgdG9kYXk7IGBhcmdzYCBhbmQgYGVudmAgZnJvbSB0aGUgcHJvZmlsZSBhcmUgaWdub3JlZC4gUmVtb3RlIGFnZW50IGhvc3RzIG5lZWQgcmVtb3RlLXNpZGUgc2hlbGwgY29uZmlndXJhdGlvbiBiZWNhdXNlIGxvY2FsIHJlc29sdmVkIHBhdGhzIG1heSBiZSBpbnZhbGlkIG9uIHRoZSByZW1vdGUuXCIsICdgI3Rlcm1pbmFsLmludGVncmF0ZWQucHJvZmlsZXMud2luZG93cyNgJywgJ2AjdGVybWluYWwuaW50ZWdyYXRlZC5kZWZhdWx0UHJvZmlsZS53aW5kb3dzI2AnKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ29iamVjdCcsICdudWxsJ10sXG5cdFx0XHRkZWZhdWx0OiBudWxsLFxuXHRcdFx0J2FueU9mJzogW1xuXHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdHRlcm1pbmFsQXV0b21hdGlvblByb2ZpbGVTY2hlbWFcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdHBhdGg6ICckezF9Jyxcblx0XHRcdFx0XHRcdGljb246ICckezJ9J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLlByb2ZpbGVzV2luZG93c106IHtcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBjcmVhdGVUZXJtaW5hbFByb2ZpbGVNYXJrZG93bkRlc2NyaXB0aW9uKFBsYXRmb3JtLldpbmRvd3MpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCdQb3dlclNoZWxsJzoge1xuXHRcdFx0XHRcdHNvdXJjZTogJ1Bvd2VyU2hlbGwnLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udGVybWluYWxQb3dlcnNoZWxsLmlkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnQ29tbWFuZCBQcm9tcHQnOiB7XG5cdFx0XHRcdFx0cGF0aDogW1xuXHRcdFx0XHRcdFx0JyR7ZW52OndpbmRpcn1cXFxcU3lzbmF0aXZlXFxcXGNtZC5leGUnLFxuXHRcdFx0XHRcdFx0JyR7ZW52OndpbmRpcn1cXFxcU3lzdGVtMzJcXFxcY21kLmV4ZSdcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGFyZ3M6IFtdLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udGVybWluYWxDbWQuaWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdHaXQgQmFzaCc6IHtcblx0XHRcdFx0XHRzb3VyY2U6ICdHaXQgQmFzaCcsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbEdpdEJhc2guaWQsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRyZXF1aXJlZDogWydzb3VyY2UnXSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUud2luZG93c1NvdXJjZScsICdBIHByb2ZpbGUgc291cmNlIHRoYXQgd2lsbCBhdXRvIGRldGVjdCB0aGUgcGF0aHMgdG8gdGhlIHNoZWxsLiBOb3RlIHRoYXQgbm9uLXN0YW5kYXJkIGV4ZWN1dGFibGUgbG9jYXRpb25zIGFyZSBub3Qgc3VwcG9ydGVkIGFuZCBtdXN0IGJlIGNyZWF0ZWQgbWFudWFsbHkgaW4gYSBuZXcgcHJvZmlsZS4nKSxcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ1Bvd2VyU2hlbGwnLCAnR2l0IEJhc2gnXVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHQuLi50ZXJtaW5hbFByb2ZpbGVCYXNlUHJvcGVydGllc1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRyZXF1aXJlZDogWydleHRlbnNpb25JZGVudGlmaWVyJywgJ2lkJywgJ3RpdGxlJ10sXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbklkZW50aWZpZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS53aW5kb3dzRXh0ZW5zaW9uSWRlbnRpZmllcicsICdUaGUgZXh0ZW5zaW9uIHRoYXQgY29udHJpYnV0ZWQgdGhpcyBwcm9maWxlLicpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbFByb2ZpbGUud2luZG93c0V4dGVuc2lvbklkJywgJ1RoZSBpZCBvZiB0aGUgZXh0ZW5zaW9uIHRlcm1pbmFsJyksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS53aW5kb3dzRXh0ZW5zaW9uVGl0bGUnLCAnVGhlIG5hbWUgb2YgdGhlIGV4dGVuc2lvbiB0ZXJtaW5hbCcpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdC4uLnRlcm1pbmFsUHJvZmlsZUJhc2VQcm9wZXJ0aWVzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHRcdHRlcm1pbmFsUHJvZmlsZVNjaGVtYVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuUHJvZmlsZXNNYWNPc106IHtcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBjcmVhdGVUZXJtaW5hbFByb2ZpbGVNYXJrZG93bkRlc2NyaXB0aW9uKFBsYXRmb3JtLk1hYyksXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J2Jhc2gnOiB7XG5cdFx0XHRcdFx0cGF0aDogJ2Jhc2gnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnLWwnXSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsQmFzaC5pZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnenNoJzoge1xuXHRcdFx0XHRcdHBhdGg6ICd6c2gnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnLWwnXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZmlzaCc6IHtcblx0XHRcdFx0XHRwYXRoOiAnZmlzaCcsXG5cdFx0XHRcdFx0YXJnczogWyctbCddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCd0bXV4Jzoge1xuXHRcdFx0XHRcdHBhdGg6ICd0bXV4Jyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsVG11eC5pZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQncHdzaCc6IHtcblx0XHRcdFx0XHRwYXRoOiAncHdzaCcsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbFBvd2Vyc2hlbGwuaWRcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2V4dGVuc2lvbklkZW50aWZpZXInLCAnaWQnLCAndGl0bGUnXSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uSWRlbnRpZmllcjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLm9zeEV4dGVuc2lvbklkZW50aWZpZXInLCAnVGhlIGV4dGVuc2lvbiB0aGF0IGNvbnRyaWJ1dGVkIHRoaXMgcHJvZmlsZS4nKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLm9zeEV4dGVuc2lvbklkJywgJ1RoZSBpZCBvZiB0aGUgZXh0ZW5zaW9uIHRlcm1pbmFsJyksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5vc3hFeHRlbnNpb25UaXRsZScsICdUaGUgbmFtZSBvZiB0aGUgZXh0ZW5zaW9uIHRlcm1pbmFsJyksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0Li4udGVybWluYWxQcm9maWxlQmFzZVByb3BlcnRpZXNcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ251bGwnIH0sXG5cdFx0XHRcdFx0dGVybWluYWxQcm9maWxlU2NoZW1hXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdFtUZXJtaW5hbFNldHRpbmdJZC5Qcm9maWxlc0xpbnV4XToge1xuXHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGNyZWF0ZVRlcm1pbmFsUHJvZmlsZU1hcmtkb3duRGVzY3JpcHRpb24oUGxhdGZvcm0uTGludXgpLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCdiYXNoJzoge1xuXHRcdFx0XHRcdHBhdGg6ICdiYXNoJyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsQmFzaC5pZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnenNoJzoge1xuXHRcdFx0XHRcdHBhdGg6ICd6c2gnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdmaXNoJzoge1xuXHRcdFx0XHRcdHBhdGg6ICdmaXNoJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQndG11eCc6IHtcblx0XHRcdFx0XHRwYXRoOiAndG11eCcsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbFRtdXguaWRcblx0XHRcdFx0fSxcblx0XHRcdFx0J3B3c2gnOiB7XG5cdFx0XHRcdFx0cGF0aDogJ3B3c2gnLFxuXHRcdFx0XHRcdGljb246IENvZGljb24udGVybWluYWxQb3dlcnNoZWxsLmlkXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHQnYW55T2YnOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRyZXF1aXJlZDogWydleHRlbnNpb25JZGVudGlmaWVyJywgJ2lkJywgJ3RpdGxlJ10sXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbklkZW50aWZpZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsUHJvZmlsZS5saW51eEV4dGVuc2lvbklkZW50aWZpZXInLCAnVGhlIGV4dGVuc2lvbiB0aGF0IGNvbnRyaWJ1dGVkIHRoaXMgcHJvZmlsZS4nKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLmxpbnV4RXh0ZW5zaW9uSWQnLCAnVGhlIGlkIG9mIHRoZSBleHRlbnNpb24gdGVybWluYWwnKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR0aXRsZToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWxQcm9maWxlLmxpbnV4RXh0ZW5zaW9uVGl0bGUnLCAnVGhlIG5hbWUgb2YgdGhlIGV4dGVuc2lvbiB0ZXJtaW5hbCcpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdC4uLnRlcm1pbmFsUHJvZmlsZUJhc2VQcm9wZXJ0aWVzXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7IHR5cGU6ICdudWxsJyB9LFxuXHRcdFx0XHRcdHRlcm1pbmFsUHJvZmlsZVNjaGVtYVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbVGVybWluYWxTZXR0aW5nSWQuVXNlV3NsUHJvZmlsZXNdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudXNlV3NsUHJvZmlsZXMnLCAnQ29udHJvbHMgd2hldGhlciBvciBub3QgV1NMIGRpc3Ryb3MgYXJlIHNob3duIGluIHRoZSB0ZXJtaW5hbCBkcm9wZG93bicpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLkluaGVyaXRFbnZdOiB7XG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmluaGVyaXRFbnYnLCBcIldoZXRoZXIgbmV3IHNoZWxscyBzaG91bGQgaW5oZXJpdCB0aGVpciBlbnZpcm9ubWVudCBmcm9tIFZTIENvZGUsIHdoaWNoIG1heSBzb3VyY2UgYSBsb2dpbiBzaGVsbCB0byBlbnN1cmUgJFBBVEggYW5kIG90aGVyIGRldmVsb3BtZW50IHZhcmlhYmxlcyBhcmUgaW5pdGlhbGl6ZWQuIFRoaXMgaGFzIG5vIGVmZmVjdCBvbiBXaW5kb3dzLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdFtUZXJtaW5hbFNldHRpbmdJZC5QZXJzaXN0ZW50U2Vzc2lvblNjcm9sbGJhY2tdOiB7XG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQucGVyc2lzdGVudFNlc3Npb25TY3JvbGxiYWNrJywgXCJDb250cm9scyB0aGUgbWF4aW11bSBhbW91bnQgb2YgbGluZXMgdGhhdCB3aWxsIGJlIHJlc3RvcmVkIHdoZW4gcmVjb25uZWN0aW5nIHRvIGEgcGVyc2lzdGVudCB0ZXJtaW5hbCBzZXNzaW9uLiBJbmNyZWFzaW5nIHRoaXMgd2lsbCByZXN0b3JlIG1vcmUgbGluZXMgb2Ygc2Nyb2xsYmFjayBhdCB0aGUgY29zdCBvZiBtb3JlIG1lbW9yeSBhbmQgaW5jcmVhc2UgdGhlIHRpbWUgaXQgdGFrZXMgdG8gY29ubmVjdCB0byB0ZXJtaW5hbHMgb24gc3RhcnQgdXAuIFRoaXMgc2V0dGluZyByZXF1aXJlcyBhIHJlc3RhcnQgdG8gdGFrZSBlZmZlY3QgYW5kIHNob3VsZCBiZSBzZXQgdG8gYSB2YWx1ZSBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNjcm9sbGJhY2sjYC5cIiksXG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDEwMFxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNob3dMaW5rSG92ZXJdOiB7XG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNob3dMaW5rSG92ZXInLCBcIldoZXRoZXIgdG8gc2hvdyBob3ZlcnMgZm9yIGxpbmtzIGluIHRoZSB0ZXJtaW5hbCBvdXRwdXQuXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W1Rlcm1pbmFsU2V0dGluZ0lkLklnbm9yZVByb2Nlc3NOYW1lc106IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbmZpcm1JZ25vcmVQcm9jZXNzZXMnLCBcIkEgc2V0IG9mIHByb2Nlc3MgbmFtZXMgdG8gaWdub3JlIHdoZW4gdXNpbmcgdGhlIHswfSBzZXR0aW5nLlwiLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbmZpcm1PbktpbGwjYCcpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR1bmlxdWVJdGVtczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IFtcblx0XHRcdFx0Ly8gUG9wdWxhciBwcm9tcHQgcHJvZ3JhbXMsIHRoZXNlIHNob3VsZCBub3QgY291bnQgYXMgY2hpbGQgcHJvY2Vzc2VzXG5cdFx0XHRcdCdzdGFyc2hpcCcsXG5cdFx0XHRcdCdvaC1teS1wb3NoJyxcblx0XHRcdFx0Ly8gR2l0IGJhc2ggbWF5IHJ1bnMgYSBzdWJwcm9jZXNzIG9mIGl0c2VsZiAoYmluXFxiYXNoLmV4ZSAtPiB1c3JcXGJpblxcYmFzaC5leGUpXG5cdFx0XHRcdCdiYXNoJyxcblx0XHRcdFx0J3pzaCcsXG5cdFx0XHRdXG5cdFx0fVxuXHR9XG59O1xuXG4vKipcbiAqIFJlZ2lzdGVycyB0ZXJtaW5hbCBjb25maWd1cmF0aW9ucyByZXF1aXJlZCBieSBzaGFyZWQgcHJvY2VzcyBhbmQgcmVtb3RlIHNlcnZlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVGVybWluYWxQbGF0Zm9ybUNvbmZpZ3VyYXRpb24oKSB7XG5cdFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikucmVnaXN0ZXJDb25maWd1cmF0aW9uKHRlcm1pbmFsUGxhdGZvcm1Db25maWd1cmF0aW9uKTtcblx0cmVnaXN0ZXJUZXJtaW5hbERlZmF1bHRQcm9maWxlQ29uZmlndXJhdGlvbigpO1xufVxuXG5sZXQgZGVmYXVsdFByb2ZpbGVzQ29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Ob2RlIHwgdW5kZWZpbmVkO1xuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyVGVybWluYWxEZWZhdWx0UHJvZmlsZUNvbmZpZ3VyYXRpb24oZGV0ZWN0ZWRQcm9maWxlcz86IHsgb3M6IE9wZXJhdGluZ1N5c3RlbTsgcHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXSB9LCBleHRlbnNpb25Db250cmlidXRlZFByb2ZpbGVzPzogcmVhZG9ubHkgSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdKSB7XG5cdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0bGV0IHByb2ZpbGVFbnVtO1xuXHRpZiAoZGV0ZWN0ZWRQcm9maWxlcykge1xuXHRcdHByb2ZpbGVFbnVtID0gY3JlYXRlUHJvZmlsZVNjaGVtYUVudW1zKGRldGVjdGVkUHJvZmlsZXM/LnByb2ZpbGVzLCBleHRlbnNpb25Db250cmlidXRlZFByb2ZpbGVzKTtcblx0fVxuXHRjb25zdCBvbGREZWZhdWx0UHJvZmlsZXNDb25maWd1cmF0aW9uID0gZGVmYXVsdFByb2ZpbGVzQ29uZmlndXJhdGlvbjtcblx0ZGVmYXVsdFByb2ZpbGVzQ29uZmlndXJhdGlvbiA9IHtcblx0XHRpZDogJ3Rlcm1pbmFsJyxcblx0XHRvcmRlcjogMTAwLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgndGVybWluYWxJbnRlZ3JhdGVkQ29uZmlndXJhdGlvblRpdGxlJywgXCJJbnRlZ3JhdGVkIFRlcm1pbmFsXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFtUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0UHJvZmlsZUxpbnV4XToge1xuXHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZWZhdWx0UHJvZmlsZS5saW51eCcsIFwiVGhlIGRlZmF1bHQgdGVybWluYWwgcHJvZmlsZSBvbiBMaW51eC5cIiksXG5cdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0XHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdFx0ZW51bTogZGV0ZWN0ZWRQcm9maWxlcz8ub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCA/IHByb2ZpbGVFbnVtPy52YWx1ZXMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogZGV0ZWN0ZWRQcm9maWxlcz8ub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5MaW51eCA/IHByb2ZpbGVFbnVtPy5tYXJrZG93bkRlc2NyaXB0aW9ucyA6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdFtUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0UHJvZmlsZU1hY09zXToge1xuXHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZWZhdWx0UHJvZmlsZS5vc3gnLCBcIlRoZSBkZWZhdWx0IHRlcm1pbmFsIHByb2ZpbGUgb24gbWFjT1MuXCIpLFxuXHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ10sXG5cdFx0XHRcdGRlZmF1bHQ6IG51bGwsXG5cdFx0XHRcdGVudW06IGRldGVjdGVkUHJvZmlsZXM/Lm9zID09PSBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoID8gcHJvZmlsZUVudW0/LnZhbHVlcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBkZXRlY3RlZFByb2ZpbGVzPy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCA/IHByb2ZpbGVFbnVtPy5tYXJrZG93bkRlc2NyaXB0aW9ucyA6IHVuZGVmaW5lZFxuXHRcdFx0fSxcblx0XHRcdFtUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0UHJvZmlsZVdpbmRvd3NdOiB7XG5cdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRQcm9maWxlLndpbmRvd3MnLCBcIlRoZSBkZWZhdWx0IHRlcm1pbmFsIHByb2ZpbGUgb24gV2luZG93cy5cIiksXG5cdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0XHRcdFx0ZGVmYXVsdDogbnVsbCxcblx0XHRcdFx0ZW51bTogZGV0ZWN0ZWRQcm9maWxlcz8ub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gcHJvZmlsZUVudW0/LnZhbHVlcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBkZXRlY3RlZFByb2ZpbGVzPy5vcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MgPyBwcm9maWxlRW51bT8ubWFya2Rvd25EZXNjcmlwdGlvbnMgOiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0fVxuXHR9O1xuXHRyZWdpc3RyeS51cGRhdGVDb25maWd1cmF0aW9ucyh7IGFkZDogW2RlZmF1bHRQcm9maWxlc0NvbmZpZ3VyYXRpb25dLCByZW1vdmU6IG9sZERlZmF1bHRQcm9maWxlc0NvbmZpZ3VyYXRpb24gPyBbb2xkRGVmYXVsdFByb2ZpbGVzQ29uZmlndXJhdGlvbl0gOiBbXSB9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsU0FBUyxzQkFBc0I7QUFFeEMsU0FBUyxpQkFBaUIsVUFBVSx3QkFBd0I7QUFDNUQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0Isa0JBQThEO0FBQzNGLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQXNELHlCQUF5QjtBQUMvRSxTQUFTLGdDQUFnQztBQUVsQyxNQUFNLHNCQUFtQztBQUFBLEVBQy9DLE1BQU0sQ0FBQyxVQUFVLE1BQU07QUFBQSxFQUN2QixNQUFNO0FBQUEsSUFDTDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNEO0FBQUEsRUFDQSxTQUFTO0FBQ1Y7QUFFTyxNQUFNLHFCQUFrQztBQUFBLEVBQzlDLE1BQU07QUFBQSxFQUNOLE1BQU0sTUFBTSxLQUFLLGVBQWUsR0FBRyxVQUFRLEtBQUssRUFBRTtBQUFBLEVBQ2xELDBCQUEwQixNQUFNLEtBQUssZUFBZSxHQUFHLFVBQVEsS0FBSyxLQUFLLEVBQUUsR0FBRztBQUMvRTtBQUVPLE1BQU0sZ0NBQWdEO0FBQUEsRUFDNUQsTUFBTTtBQUFBLElBQ0wsYUFBYSxTQUFTLHdCQUF3QixnRUFB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
