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
import { structuralEquals } from "../../../../../../../../base/common/equals.js";
import { Disposable } from "../../../../../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters, regExpLeadsToEndlessLoop } from "../../../../../../../../base/common/strings.js";
import { isObject } from "../../../../../../../../base/common/types.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../../../platform/instantiation/common/instantiation.js";
import { ITerminalChatService } from "../../../../../../terminal/browser/terminal.js";
import { TerminalChatAgentToolsSettingId } from "../../../../common/terminalChatAgentToolsConfiguration.js";
import { isPowerShell } from "../../../runInTerminalHelpers.js";
import { NpmScriptAutoApprover } from "./npmScriptAutoApprover.js";
const neverMatchRegex = /(?!.*)/;
const transientEnvVarRegex = /^[A-Z_][A-Z0-9_]*=/i;
let CommandLineAutoApprover = class extends Disposable {
  constructor(_configurationService, instantiationService, _terminalChatService) {
    super();
    this._configurationService = _configurationService;
    this._terminalChatService = _terminalChatService;
    this._denyListRules = [];
    this._allowListRules = [];
    this._allowListCommandLineRules = [];
    this._denyListCommandLineRules = [];
    this._npmScriptAutoApprover = this._register(instantiationService.createInstance(NpmScriptAutoApprover));
    this.updateConfiguration();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(TerminalChatAgentToolsSettingId.AutoApprove) || e.affectsConfiguration(TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules) || e.affectsConfiguration(TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible)) {
        this.updateConfiguration();
      }
    }));
  }
  updateConfiguration() {
    let configValue = this._configurationService.getValue(TerminalChatAgentToolsSettingId.AutoApprove);
    const configInspectValue = this._configurationService.inspect(TerminalChatAgentToolsSettingId.AutoApprove);
    const deprecatedValue = this._configurationService.getValue(TerminalChatAgentToolsSettingId.DeprecatedAutoApproveCompatible);
    if (deprecatedValue && typeof deprecatedValue === "object" && configValue && typeof configValue === "object") {
      configValue = {
        ...configValue,
        ...deprecatedValue
      };
    }
    const {
      denyListRules,
      allowListRules,
      allowListCommandLineRules,
      denyListCommandLineRules
    } = this._mapAutoApproveConfigToRules(configValue, configInspectValue);
    this._allowListRules = allowListRules;
    this._denyListRules = denyListRules;
    this._allowListCommandLineRules = allowListCommandLineRules;
    this._denyListCommandLineRules = denyListCommandLineRules;
  }
  async isCommandAutoApproved(command, shell, os, cwd, chatSessionResource) {
    if (transientEnvVarRegex.test(command)) {
      return {
        result: "denied",
        reason: `Command '${command}' is denied because it contains transient environment variables`
      };
    }
    for (const rule of this._denyListRules) {
      if (this._commandMatchesRule(rule, command, shell, os)) {
        return {
          result: "denied",
          rule,
          reason: `Command '${command}' is denied by deny list rule: ${rule.sourceText}`
        };
      }
    }
    for (const rule of this._getSessionRules(chatSessionResource).allowListRules) {
      if (this._commandMatchesRule(rule, command, shell, os)) {
        return {
          result: "approved",
          rule,
          reason: `Command '${command}' is approved by session allow list rule: ${rule.sourceText}`
        };
      }
    }
    for (const rule of this._allowListRules) {
      if (this._commandMatchesRule(rule, command, shell, os)) {
        return {
          result: "approved",
          rule,
          reason: `Command '${command}' is approved by allow list rule: ${rule.sourceText}`
        };
      }
    }
    const npmScriptResult = await this._npmScriptAutoApprover.isCommandAutoApproved(command, cwd);
    if (npmScriptResult.isAutoApproved) {
      return {
        result: "approved",
        rule: { type: "npmScript", npmScriptResult },
        reason: `Command '${command}' is approved as npm script '${npmScriptResult.scriptName}' is defined in package.json`
      };
    }
    return {
      result: "noMatch",
      reason: `Command '${command}' has no matching auto approve entries`
    };
  }
  isCommandLineAutoApproved(commandLine, chatSessionResource) {
    for (const rule of this._denyListCommandLineRules) {
      if (rule.regex.test(commandLine)) {
        return {
          result: "denied",
          rule,
          reason: `Command line '${commandLine}' is denied by deny list rule: ${rule.sourceText}`
        };
      }
    }
    for (const rule of this._getSessionRules(chatSessionResource).allowListCommandLineRules) {
      if (rule.regex.test(commandLine)) {
        return {
          result: "approved",
          rule,
          reason: `Command line '${commandLine}' is approved by session allow list rule: ${rule.sourceText}`
        };
      }
    }
    for (const rule of this._allowListCommandLineRules) {
      if (rule.regex.test(commandLine)) {
        return {
          result: "approved",
          rule,
          reason: `Command line '${commandLine}' is approved by allow list rule: ${rule.sourceText}`
        };
      }
    }
    return {
      result: "noMatch",
      reason: `Command line '${commandLine}' has no matching auto approve entries`
    };
  }
  _getSessionRules(chatSessionResource) {
    const denyListRules = [];
    const allowListRules = [];
    const allowListCommandLineRules = [];
    const denyListCommandLineRules = [];
    if (!chatSessionResource) {
      return { denyListRules, allowListRules, allowListCommandLineRules, denyListCommandLineRules };
    }
    const sessionRulesConfig = this._terminalChatService.getSessionAutoApproveRules(chatSessionResource);
    for (const [key, value] of Object.entries(sessionRulesConfig)) {
      if (typeof value === "boolean") {
        const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
        if (value === true) {
          allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: "session", isDefaultRule: false });
        } else if (value === false) {
          denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: "session", isDefaultRule: false });
        }
      } else if (typeof value === "object" && value !== null) {
        const objectValue = value;
        if (typeof objectValue.approve === "boolean") {
          const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
          if (objectValue.approve === true) {
            if (objectValue.matchCommandLine === true) {
              allowListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: "session", isDefaultRule: false });
            } else {
              allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: "session", isDefaultRule: false });
            }
          } else if (objectValue.approve === false) {
            if (objectValue.matchCommandLine === true) {
              denyListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: "session", isDefaultRule: false });
            } else {
              denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget: "session", isDefaultRule: false });
            }
          }
        }
      }
    }
    return { denyListRules, allowListRules, allowListCommandLineRules, denyListCommandLineRules };
  }
  _commandMatchesRule(rule, command, shell, os) {
    const isPwsh = isPowerShell(shell, os);
    if ((isPwsh ? rule.regexCaseInsensitive : rule.regex).test(command)) {
      return true;
    } else if (isPwsh && command.startsWith("(")) {
      if (rule.regexCaseInsensitive.test(command.slice(1))) {
        return true;
      }
    }
    return false;
  }
  _mapAutoApproveConfigToRules(config, configInspectValue) {
    if (!config || typeof config !== "object") {
      return {
        denyListRules: [],
        allowListRules: [],
        allowListCommandLineRules: [],
        denyListCommandLineRules: []
      };
    }
    const denyListRules = [];
    const allowListRules = [];
    const allowListCommandLineRules = [];
    const denyListCommandLineRules = [];
    const ignoreDefaults = this._configurationService.getValue(TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules) === true;
    for (const [key, value] of Object.entries(config)) {
      let checkTarget2 = function(inspectValue) {
        return isObject(inspectValue) && Object.prototype.hasOwnProperty.call(inspectValue, key) && structuralEquals(inspectValue[key], value);
      };
      var checkTarget = checkTarget2;
      const defaultValue = configInspectValue?.default?.value;
      const isDefaultRule = !!(isObject(defaultValue) && Object.prototype.hasOwnProperty.call(defaultValue, key) && structuralEquals(defaultValue[key], value));
      const sourceTarget = checkTarget2(configInspectValue.workspaceFolderValue) ? ConfigurationTarget.WORKSPACE_FOLDER : checkTarget2(configInspectValue.workspaceValue) ? ConfigurationTarget.WORKSPACE : checkTarget2(configInspectValue.userRemoteValue) ? ConfigurationTarget.USER_REMOTE : checkTarget2(configInspectValue.userLocalValue) ? ConfigurationTarget.USER_LOCAL : checkTarget2(configInspectValue.userValue) ? ConfigurationTarget.USER : checkTarget2(configInspectValue.applicationValue) ? ConfigurationTarget.APPLICATION : ConfigurationTarget.DEFAULT;
      if (ignoreDefaults && isDefaultRule && sourceTarget === ConfigurationTarget.DEFAULT) {
        continue;
      }
      if (typeof value === "boolean") {
        const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
        if (value === true) {
          allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
        } else if (value === false) {
          denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
        }
      } else if (typeof value === "object" && value !== null) {
        const objectValue = value;
        if (typeof objectValue.approve === "boolean") {
          const { regex, regexCaseInsensitive } = this._convertAutoApproveEntryToRegex(key);
          if (objectValue.approve === true) {
            if (objectValue.matchCommandLine === true) {
              allowListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
            } else {
              allowListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
            }
          } else if (objectValue.approve === false) {
            if (objectValue.matchCommandLine === true) {
              denyListCommandLineRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
            } else {
              denyListRules.push({ regex, regexCaseInsensitive, sourceText: key, sourceTarget, isDefaultRule });
            }
          }
        }
      }
    }
    return {
      denyListRules,
      allowListRules,
      allowListCommandLineRules,
      denyListCommandLineRules
    };
  }
  _convertAutoApproveEntryToRegex(value) {
    const regex = this._doConvertAutoApproveEntryToRegex(value);
    if (regex.flags.includes("i")) {
      return { regex, regexCaseInsensitive: regex };
    }
    return { regex, regexCaseInsensitive: new RegExp(regex.source, regex.flags + "i") };
  }
  _doConvertAutoApproveEntryToRegex(value) {
    const regexMatch = value.match(/^\/(?<pattern>.+)\/(?<flags>[dgimsuvy]*)$/);
    const regexPattern = regexMatch?.groups?.pattern;
    if (regexPattern) {
      let flags = regexMatch.groups?.flags;
      if (flags) {
        flags = flags.replaceAll("g", "");
      }
      if (regexPattern === ".*") {
        return new RegExp(regexPattern);
      }
      try {
        const regex = new RegExp(regexPattern, flags || void 0);
        if (regExpLeadsToEndlessLoop(regex)) {
          return neverMatchRegex;
        }
        return regex;
      } catch (error) {
        return neverMatchRegex;
      }
    }
    if (value === "") {
      return neverMatchRegex;
    }
    let sanitizedValue;
    if (value.includes("/") || value.includes("\\")) {
      let pattern = value.replace(/[/\\]/g, "%%PATH_SEP%%");
      pattern = escapeRegExpCharacters(pattern);
      pattern = pattern.replace(/%%PATH_SEP%%*/g, "[/\\\\]");
      sanitizedValue = `^(?:\\.[/\\\\])?${pattern}`;
    } else {
      sanitizedValue = escapeRegExpCharacters(value);
    }
    return new RegExp(`^${sanitizedValue}\\b`);
  }
};
CommandLineAutoApprover = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITerminalChatService)
], CommandLineAutoApprover);
export {
  CommandLineAutoApprover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxjb21tYW5kTGluZUFuYWx5emVyXFxhdXRvQXBwcm92ZVxcY29tbWFuZExpbmVBdXRvQXBwcm92ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzLCByZWdFeHBMZWFkc1RvRW5kbGVzc0xvb3AgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0eXBlIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNQb3dlclNoZWxsIH0gZnJvbSAnLi4vLi4vLi4vcnVuSW5UZXJtaW5hbEhlbHBlcnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQXV0b0FwcHJvdmVSdWxlLCBJTnBtU2NyaXB0QXV0b0FwcHJvdmVSdWxlIH0gZnJvbSAnLi4vY29tbWFuZExpbmVBbmFseXplci5qcyc7XG5pbXBvcnQgeyBOcG1TY3JpcHRBdXRvQXBwcm92ZXIgfSBmcm9tICcuL25wbVNjcmlwdEF1dG9BcHByb3Zlci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRBcHByb3ZhbFJlc3VsdFdpdGhSZWFzb24ge1xuXHRyZXN1bHQ6IElDb21tYW5kQXBwcm92YWxSZXN1bHQ7XG5cdHJlYXNvbjogc3RyaW5nO1xuXHRydWxlPzogSUF1dG9BcHByb3ZlUnVsZSB8IElOcG1TY3JpcHRBdXRvQXBwcm92ZVJ1bGU7XG59XG5cbmV4cG9ydCB0eXBlIElDb21tYW5kQXBwcm92YWxSZXN1bHQgPSAnYXBwcm92ZWQnIHwgJ2RlbmllZCcgfCAnbm9NYXRjaCc7XG5cbmNvbnN0IG5ldmVyTWF0Y2hSZWdleCA9IC8oPyEuKikvO1xuY29uc3QgdHJhbnNpZW50RW52VmFyUmVnZXggPSAvXltBLVpfXVtBLVowLTlfXSo9L2k7XG5cbmV4cG9ydCBjbGFzcyBDb21tYW5kTGluZUF1dG9BcHByb3ZlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9kZW55TGlzdFJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblx0cHJpdmF0ZSBfYWxsb3dMaXN0UnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXSA9IFtdO1xuXHRwcml2YXRlIF9hbGxvd0xpc3RDb21tYW5kTGluZVJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblx0cHJpdmF0ZSBfZGVueUxpc3RDb21tYW5kTGluZVJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfbnBtU2NyaXB0QXV0b0FwcHJvdmVyOiBOcG1TY3JpcHRBdXRvQXBwcm92ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDaGF0U2VydmljZTogSVRlcm1pbmFsQ2hhdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbnBtU2NyaXB0QXV0b0FwcHJvdmVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTnBtU2NyaXB0QXV0b0FwcHJvdmVyKSk7XG5cdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5JZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcykgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkRlcHJlY2F0ZWRBdXRvQXBwcm92ZUNvbXBhdGlibGUpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0dXBkYXRlQ29uZmlndXJhdGlvbigpIHtcblx0XHRsZXQgY29uZmlnVmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlKTtcblx0XHRjb25zdCBjb25maWdJbnNwZWN0VmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUpO1xuXHRcdGNvbnN0IGRlcHJlY2F0ZWRWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRGVwcmVjYXRlZEF1dG9BcHByb3ZlQ29tcGF0aWJsZSk7XG5cdFx0aWYgKGRlcHJlY2F0ZWRWYWx1ZSAmJiB0eXBlb2YgZGVwcmVjYXRlZFZhbHVlID09PSAnb2JqZWN0JyAmJiBjb25maWdWYWx1ZSAmJiB0eXBlb2YgY29uZmlnVmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb25maWdWYWx1ZSA9IHtcblx0XHRcdFx0Li4uY29uZmlnVmFsdWUsXG5cdFx0XHRcdC4uLmRlcHJlY2F0ZWRWYWx1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCB7XG5cdFx0XHRkZW55TGlzdFJ1bGVzLFxuXHRcdFx0YWxsb3dMaXN0UnVsZXMsXG5cdFx0XHRhbGxvd0xpc3RDb21tYW5kTGluZVJ1bGVzLFxuXHRcdFx0ZGVueUxpc3RDb21tYW5kTGluZVJ1bGVzXG5cdFx0fSA9IHRoaXMuX21hcEF1dG9BcHByb3ZlQ29uZmlnVG9SdWxlcyhjb25maWdWYWx1ZSwgY29uZmlnSW5zcGVjdFZhbHVlKTtcblx0XHR0aGlzLl9hbGxvd0xpc3RSdWxlcyA9IGFsbG93TGlzdFJ1bGVzO1xuXHRcdHRoaXMuX2RlbnlMaXN0UnVsZXMgPSBkZW55TGlzdFJ1bGVzO1xuXHRcdHRoaXMuX2FsbG93TGlzdENvbW1hbmRMaW5lUnVsZXMgPSBhbGxvd0xpc3RDb21tYW5kTGluZVJ1bGVzO1xuXHRcdHRoaXMuX2RlbnlMaXN0Q29tbWFuZExpbmVSdWxlcyA9IGRlbnlMaXN0Q29tbWFuZExpbmVSdWxlcztcblx0fVxuXG5cdGFzeW5jIGlzQ29tbWFuZEF1dG9BcHByb3ZlZChjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0sIGN3ZDogVVJJIHwgdW5kZWZpbmVkLCBjaGF0U2Vzc2lvblJlc291cmNlPzogVVJJKTogUHJvbWlzZTxJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbj4ge1xuXHRcdC8vIENoZWNrIGlmIHRoZSBjb21tYW5kIGhhcyBhIHRyYW5zaWVudCBlbnZpcm9ubWVudCB2YXJpYWJsZSBhc3NpZ25tZW50IHByZWZpeCB3aGljaCB3ZVxuXHRcdC8vIGFsd2F5cyBkZW55IGZvciBub3cgYXMgaXQgY2FuIGVhc2lseSBsZWFkIHRvIGV4ZWN1dGUgb3RoZXIgY29tbWFuZHNcblx0XHRpZiAodHJhbnNpZW50RW52VmFyUmVnZXgudGVzdChjb21tYW5kKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzdWx0OiAnZGVuaWVkJyxcblx0XHRcdFx0cmVhc29uOiBgQ29tbWFuZCAnJHtjb21tYW5kfScgaXMgZGVuaWVkIGJlY2F1c2UgaXQgY29udGFpbnMgdHJhbnNpZW50IGVudmlyb25tZW50IHZhcmlhYmxlc2Bcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhlIGNvbmZpZyBkZW55IGxpc3QgdG8gc2VlIGlmIHRoaXMgY29tbWFuZCByZXF1aXJlcyBleHBsaWNpdCBhcHByb3ZhbFxuXHRcdGZvciAoY29uc3QgcnVsZSBvZiB0aGlzLl9kZW55TGlzdFJ1bGVzKSB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWFuZE1hdGNoZXNSdWxlKHJ1bGUsIGNvbW1hbmQsIHNoZWxsLCBvcykpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyZXN1bHQ6ICdkZW5pZWQnLFxuXHRcdFx0XHRcdHJ1bGUsXG5cdFx0XHRcdFx0cmVhc29uOiBgQ29tbWFuZCAnJHtjb21tYW5kfScgaXMgZGVuaWVkIGJ5IGRlbnkgbGlzdCBydWxlOiAke3J1bGUuc291cmNlVGV4dH1gXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgc2Vzc2lvbiBhbGxvdyBydWxlcyAoc2Vzc2lvbiBkZW55IHJ1bGVzIGNhbid0IGV4aXN0KVxuXHRcdGZvciAoY29uc3QgcnVsZSBvZiB0aGlzLl9nZXRTZXNzaW9uUnVsZXMoY2hhdFNlc3Npb25SZXNvdXJjZSkuYWxsb3dMaXN0UnVsZXMpIHtcblx0XHRcdGlmICh0aGlzLl9jb21tYW5kTWF0Y2hlc1J1bGUocnVsZSwgY29tbWFuZCwgc2hlbGwsIG9zKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlc3VsdDogJ2FwcHJvdmVkJyxcblx0XHRcdFx0XHRydWxlLFxuXHRcdFx0XHRcdHJlYXNvbjogYENvbW1hbmQgJyR7Y29tbWFuZH0nIGlzIGFwcHJvdmVkIGJ5IHNlc3Npb24gYWxsb3cgbGlzdCBydWxlOiAke3J1bGUuc291cmNlVGV4dH1gXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgdGhlIGNvbmZpZyBhbGxvdyBsaXN0IHRvIHNlZSBpZiB0aGUgY29tbWFuZCBpcyBhbGxvd2VkIHRvIHJ1biB3aXRob3V0IGV4cGxpY2l0IGFwcHJvdmFsXG5cdFx0Zm9yIChjb25zdCBydWxlIG9mIHRoaXMuX2FsbG93TGlzdFJ1bGVzKSB7XG5cdFx0XHRpZiAodGhpcy5fY29tbWFuZE1hdGNoZXNSdWxlKHJ1bGUsIGNvbW1hbmQsIHNoZWxsLCBvcykpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRyZXN1bHQ6ICdhcHByb3ZlZCcsXG5cdFx0XHRcdFx0cnVsZSxcblx0XHRcdFx0XHRyZWFzb246IGBDb21tYW5kICcke2NvbW1hbmR9JyBpcyBhcHByb3ZlZCBieSBhbGxvdyBsaXN0IHJ1bGU6ICR7cnVsZS5zb3VyY2VUZXh0fWBcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIGFuIG5wbS95YXJuL3BucG0gc2NyaXB0IGRlZmluZWQgaW4gcGFja2FnZS5qc29uXG5cdFx0Y29uc3QgbnBtU2NyaXB0UmVzdWx0ID0gYXdhaXQgdGhpcy5fbnBtU2NyaXB0QXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZChjb21tYW5kLCBjd2QpO1xuXHRcdGlmIChucG1TY3JpcHRSZXN1bHQuaXNBdXRvQXBwcm92ZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3VsdDogJ2FwcHJvdmVkJyxcblx0XHRcdFx0cnVsZTogeyB0eXBlOiAnbnBtU2NyaXB0JywgbnBtU2NyaXB0UmVzdWx0IH0sXG5cdFx0XHRcdHJlYXNvbjogYENvbW1hbmQgJyR7Y29tbWFuZH0nIGlzIGFwcHJvdmVkIGFzIG5wbSBzY3JpcHQgJyR7bnBtU2NyaXB0UmVzdWx0LnNjcmlwdE5hbWV9JyBpcyBkZWZpbmVkIGluIHBhY2thZ2UuanNvbmBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gVE9ETzogTExNLWJhc2VkIGF1dG8tYXBwcm92YWwgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1MzI2N1xuXG5cdFx0Ly8gRmFsbGJhY2sgaXMgYWx3YXlzIHRvIHJlcXVpcmUgYXBwcm92YWxcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdWx0OiAnbm9NYXRjaCcsXG5cdFx0XHRyZWFzb246IGBDb21tYW5kICcke2NvbW1hbmR9JyBoYXMgbm8gbWF0Y2hpbmcgYXV0byBhcHByb3ZlIGVudHJpZXNgXG5cdFx0fTtcblx0fVxuXG5cdGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoY29tbWFuZExpbmU6IHN0cmluZywgY2hhdFNlc3Npb25SZXNvdXJjZT86IFVSSSk6IElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uIHtcblx0XHQvLyBDaGVjayB0aGUgY29uZmlnIGRlbnkgbGlzdCBmaXJzdCB0byBzZWUgaWYgdGhpcyBjb21tYW5kIGxpbmUgcmVxdWlyZXMgZXhwbGljaXQgYXBwcm92YWxcblx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgdGhpcy5fZGVueUxpc3RDb21tYW5kTGluZVJ1bGVzKSB7XG5cdFx0XHRpZiAocnVsZS5yZWdleC50ZXN0KGNvbW1hbmRMaW5lKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlc3VsdDogJ2RlbmllZCcsXG5cdFx0XHRcdFx0cnVsZSxcblx0XHRcdFx0XHRyZWFzb246IGBDb21tYW5kIGxpbmUgJyR7Y29tbWFuZExpbmV9JyBpcyBkZW5pZWQgYnkgZGVueSBsaXN0IHJ1bGU6ICR7cnVsZS5zb3VyY2VUZXh0fWBcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBzZXNzaW9uIGFsbG93IGxpc3QgKHNlc3Npb24gZGVueSBydWxlcyBjYW4ndCBleGlzdClcblx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgdGhpcy5fZ2V0U2Vzc2lvblJ1bGVzKGNoYXRTZXNzaW9uUmVzb3VyY2UpLmFsbG93TGlzdENvbW1hbmRMaW5lUnVsZXMpIHtcblx0XHRcdGlmIChydWxlLnJlZ2V4LnRlc3QoY29tbWFuZExpbmUpKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzdWx0OiAnYXBwcm92ZWQnLFxuXHRcdFx0XHRcdHJ1bGUsXG5cdFx0XHRcdFx0cmVhc29uOiBgQ29tbWFuZCBsaW5lICcke2NvbW1hbmRMaW5lfScgaXMgYXBwcm92ZWQgYnkgc2Vzc2lvbiBhbGxvdyBsaXN0IHJ1bGU6ICR7cnVsZS5zb3VyY2VUZXh0fWBcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgZnVsbCBjb21tYW5kIGxpbmUgbWF0Y2hlcyBhbnkgb2YgdGhlIGNvbmZpZyBhbGxvdyBsaXN0IGNvbW1hbmQgbGluZSByZWdleGVzXG5cdFx0Zm9yIChjb25zdCBydWxlIG9mIHRoaXMuX2FsbG93TGlzdENvbW1hbmRMaW5lUnVsZXMpIHtcblx0XHRcdGlmIChydWxlLnJlZ2V4LnRlc3QoY29tbWFuZExpbmUpKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzdWx0OiAnYXBwcm92ZWQnLFxuXHRcdFx0XHRcdHJ1bGUsXG5cdFx0XHRcdFx0cmVhc29uOiBgQ29tbWFuZCBsaW5lICcke2NvbW1hbmRMaW5lfScgaXMgYXBwcm92ZWQgYnkgYWxsb3cgbGlzdCBydWxlOiAke3J1bGUuc291cmNlVGV4dH1gXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHQ6ICdub01hdGNoJyxcblx0XHRcdHJlYXNvbjogYENvbW1hbmQgbGluZSAnJHtjb21tYW5kTGluZX0nIGhhcyBubyBtYXRjaGluZyBhdXRvIGFwcHJvdmUgZW50cmllc2Bcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvblJ1bGVzKGNoYXRTZXNzaW9uUmVzb3VyY2U/OiBVUkkpOiB7XG5cdFx0ZGVueUxpc3RSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHRcdGFsbG93TGlzdFJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW107XG5cdFx0YWxsb3dMaXN0Q29tbWFuZExpbmVSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHRcdGRlbnlMaXN0Q29tbWFuZExpbmVSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHR9IHtcblx0XHRjb25zdCBkZW55TGlzdFJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblx0XHRjb25zdCBhbGxvd0xpc3RSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdID0gW107XG5cdFx0Y29uc3QgYWxsb3dMaXN0Q29tbWFuZExpbmVSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdID0gW107XG5cdFx0Y29uc3QgZGVueUxpc3RDb21tYW5kTGluZVJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW10gPSBbXTtcblxuXHRcdGlmICghY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHsgZGVueUxpc3RSdWxlcywgYWxsb3dMaXN0UnVsZXMsIGFsbG93TGlzdENvbW1hbmRMaW5lUnVsZXMsIGRlbnlMaXN0Q29tbWFuZExpbmVSdWxlcyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SdWxlc0NvbmZpZyA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbkF1dG9BcHByb3ZlUnVsZXMoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoc2Vzc2lvblJ1bGVzQ29uZmlnKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdGNvbnN0IHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlIH0gPSB0aGlzLl9jb252ZXJ0QXV0b0FwcHJvdmVFbnRyeVRvUmVnZXgoa2V5KTtcblx0XHRcdFx0aWYgKHZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0YWxsb3dMaXN0UnVsZXMucHVzaCh7IHJlZ2V4LCByZWdleENhc2VJbnNlbnNpdGl2ZSwgc291cmNlVGV4dDoga2V5LCBzb3VyY2VUYXJnZXQ6ICdzZXNzaW9uJywgaXNEZWZhdWx0UnVsZTogZmFsc2UgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0ZGVueUxpc3RSdWxlcy5wdXNoKHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlLCBzb3VyY2VUZXh0OiBrZXksIHNvdXJjZVRhcmdldDogJ3Nlc3Npb24nLCBpc0RlZmF1bHRSdWxlOiBmYWxzZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHRcdGNvbnN0IG9iamVjdFZhbHVlID0gdmFsdWUgYXMgeyBhcHByb3ZlPzogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfTtcblx0XHRcdFx0aWYgKHR5cGVvZiBvYmplY3RWYWx1ZS5hcHByb3ZlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0XHRjb25zdCB7IHJlZ2V4LCByZWdleENhc2VJbnNlbnNpdGl2ZSB9ID0gdGhpcy5fY29udmVydEF1dG9BcHByb3ZlRW50cnlUb1JlZ2V4KGtleSk7XG5cdFx0XHRcdFx0aWYgKG9iamVjdFZhbHVlLmFwcHJvdmUgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdGlmIChvYmplY3RWYWx1ZS5tYXRjaENvbW1hbmRMaW5lID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRcdGFsbG93TGlzdENvbW1hbmRMaW5lUnVsZXMucHVzaCh7IHJlZ2V4LCByZWdleENhc2VJbnNlbnNpdGl2ZSwgc291cmNlVGV4dDoga2V5LCBzb3VyY2VUYXJnZXQ6ICdzZXNzaW9uJywgaXNEZWZhdWx0UnVsZTogZmFsc2UgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhbGxvd0xpc3RSdWxlcy5wdXNoKHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlLCBzb3VyY2VUZXh0OiBrZXksIHNvdXJjZVRhcmdldDogJ3Nlc3Npb24nLCBpc0RlZmF1bHRSdWxlOiBmYWxzZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKG9iamVjdFZhbHVlLmFwcHJvdmUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRpZiAob2JqZWN0VmFsdWUubWF0Y2hDb21tYW5kTGluZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0XHRkZW55TGlzdENvbW1hbmRMaW5lUnVsZXMucHVzaCh7IHJlZ2V4LCByZWdleENhc2VJbnNlbnNpdGl2ZSwgc291cmNlVGV4dDoga2V5LCBzb3VyY2VUYXJnZXQ6ICdzZXNzaW9uJywgaXNEZWZhdWx0UnVsZTogZmFsc2UgfSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRkZW55TGlzdFJ1bGVzLnB1c2goeyByZWdleCwgcmVnZXhDYXNlSW5zZW5zaXRpdmUsIHNvdXJjZVRleHQ6IGtleSwgc291cmNlVGFyZ2V0OiAnc2Vzc2lvbicsIGlzRGVmYXVsdFJ1bGU6IGZhbHNlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IGRlbnlMaXN0UnVsZXMsIGFsbG93TGlzdFJ1bGVzLCBhbGxvd0xpc3RDb21tYW5kTGluZVJ1bGVzLCBkZW55TGlzdENvbW1hbmRMaW5lUnVsZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbW1hbmRNYXRjaGVzUnVsZShydWxlOiBJQXV0b0FwcHJvdmVSdWxlLCBjb21tYW5kOiBzdHJpbmcsIHNoZWxsOiBzdHJpbmcsIG9zOiBPcGVyYXRpbmdTeXN0ZW0pOiBib29sZWFuIHtcblx0XHRjb25zdCBpc1B3c2ggPSBpc1Bvd2VyU2hlbGwoc2hlbGwsIG9zKTtcblxuXHRcdC8vIFBvd2VyU2hlbGwgaXMgY2FzZSBpbnNlbnNpdGl2ZSByZWdhcmRsZXNzIG9mIHBsYXRmb3JtXG5cdFx0aWYgKChpc1B3c2ggPyBydWxlLnJlZ2V4Q2FzZUluc2Vuc2l0aXZlIDogcnVsZS5yZWdleCkudGVzdChjb21tYW5kKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIGlmIChpc1B3c2ggJiYgY29tbWFuZC5zdGFydHNXaXRoKCcoJykpIHtcblx0XHRcdC8vIEFsbG93IGlnbm9yaW5nIG9mIHRoZSBsZWFkaW5nICggZm9yIFBvd2VyU2hlbGwgY29tbWFuZHMgYXMgaXQncyBhIGNvbW1hbmQgcGF0dGVybiB0b1xuXHRcdFx0Ly8gb3BlcmF0ZSBvbiB0aGUgb3V0cHV0IG9mIGEgY29tbWFuZC4gRm9yIGV4YW1wbGUgYChHZXQtQ29udGVudCBSRUFETUUubWQpIC4uLmBcblx0XHRcdGlmIChydWxlLnJlZ2V4Q2FzZUluc2Vuc2l0aXZlLnRlc3QoY29tbWFuZC5zbGljZSgxKSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX21hcEF1dG9BcHByb3ZlQ29uZmlnVG9SdWxlcyhjb25maWc6IHVua25vd24sIGNvbmZpZ0luc3BlY3RWYWx1ZTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxSZWFkb25seTx1bmtub3duPj4pOiB7XG5cdFx0ZGVueUxpc3RSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHRcdGFsbG93TGlzdFJ1bGVzOiBJQXV0b0FwcHJvdmVSdWxlW107XG5cdFx0YWxsb3dMaXN0Q29tbWFuZExpbmVSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHRcdGRlbnlMaXN0Q29tbWFuZExpbmVSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdO1xuXHR9IHtcblx0XHRpZiAoIWNvbmZpZyB8fCB0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGVueUxpc3RSdWxlczogW10sXG5cdFx0XHRcdGFsbG93TGlzdFJ1bGVzOiBbXSxcblx0XHRcdFx0YWxsb3dMaXN0Q29tbWFuZExpbmVSdWxlczogW10sXG5cdFx0XHRcdGRlbnlMaXN0Q29tbWFuZExpbmVSdWxlczogW11cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVueUxpc3RSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdID0gW107XG5cdFx0Y29uc3QgYWxsb3dMaXN0UnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXSA9IFtdO1xuXHRcdGNvbnN0IGFsbG93TGlzdENvbW1hbmRMaW5lUnVsZXM6IElBdXRvQXBwcm92ZVJ1bGVbXSA9IFtdO1xuXHRcdGNvbnN0IGRlbnlMaXN0Q29tbWFuZExpbmVSdWxlczogSUF1dG9BcHByb3ZlUnVsZVtdID0gW107XG5cblx0XHRjb25zdCBpZ25vcmVEZWZhdWx0cyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuSWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXMpID09PSB0cnVlO1xuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMoY29uZmlnKSkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFZhbHVlID0gY29uZmlnSW5zcGVjdFZhbHVlPy5kZWZhdWx0Py52YWx1ZTtcblx0XHRcdGNvbnN0IGlzRGVmYXVsdFJ1bGUgPSAhIShcblx0XHRcdFx0aXNPYmplY3QoZGVmYXVsdFZhbHVlKSAmJlxuXHRcdFx0XHRPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGVmYXVsdFZhbHVlLCBrZXkpICYmXG5cdFx0XHRcdHN0cnVjdHVyYWxFcXVhbHMoKGRlZmF1bHRWYWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XSwgdmFsdWUpXG5cdFx0XHQpO1xuXHRcdFx0ZnVuY3Rpb24gY2hlY2tUYXJnZXQoaW5zcGVjdFZhbHVlOiBSZWFkb25seTx1bmtub3duPiB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gKFxuXHRcdFx0XHRcdGlzT2JqZWN0KGluc3BlY3RWYWx1ZSkgJiZcblx0XHRcdFx0XHRPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5zcGVjdFZhbHVlLCBrZXkpICYmXG5cdFx0XHRcdFx0c3RydWN0dXJhbEVxdWFscygoaW5zcGVjdFZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrZXldLCB2YWx1ZSlcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNvdXJjZVRhcmdldCA9IChcblx0XHRcdFx0Y2hlY2tUYXJnZXQoY29uZmlnSW5zcGVjdFZhbHVlLndvcmtzcGFjZUZvbGRlclZhbHVlKSA/IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUlxuXHRcdFx0XHRcdDogY2hlY2tUYXJnZXQoY29uZmlnSW5zcGVjdFZhbHVlLndvcmtzcGFjZVZhbHVlKSA/IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFXG5cdFx0XHRcdFx0XHQ6IGNoZWNrVGFyZ2V0KGNvbmZpZ0luc3BlY3RWYWx1ZS51c2VyUmVtb3RlVmFsdWUpID8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URVxuXHRcdFx0XHRcdFx0XHQ6IGNoZWNrVGFyZ2V0KGNvbmZpZ0luc3BlY3RWYWx1ZS51c2VyTG9jYWxWYWx1ZSkgPyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUxcblx0XHRcdFx0XHRcdFx0XHQ6IGNoZWNrVGFyZ2V0KGNvbmZpZ0luc3BlY3RWYWx1ZS51c2VyVmFsdWUpID8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSXG5cdFx0XHRcdFx0XHRcdFx0XHQ6IGNoZWNrVGFyZ2V0KGNvbmZpZ0luc3BlY3RWYWx1ZS5hcHBsaWNhdGlvblZhbHVlKSA/IENvbmZpZ3VyYXRpb25UYXJnZXQuQVBQTElDQVRJT05cblx0XHRcdFx0XHRcdFx0XHRcdFx0OiBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFRcblx0XHRcdCk7XG5cblx0XHRcdC8vIElmIGRlZmF1bHQgcnVsZXMgYXJlIGRpc2FibGVkLCBpZ25vcmUgZW50cmllcyB0aGF0IGNvbWUgZnJvbSB0aGUgZGVmYXVsdCBjb25maWdcblx0XHRcdGlmIChpZ25vcmVEZWZhdWx0cyAmJiBpc0RlZmF1bHRSdWxlICYmIHNvdXJjZVRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0Y29uc3QgeyByZWdleCwgcmVnZXhDYXNlSW5zZW5zaXRpdmUgfSA9IHRoaXMuX2NvbnZlcnRBdXRvQXBwcm92ZUVudHJ5VG9SZWdleChrZXkpO1xuXHRcdFx0XHQvLyBJTVBPUlRBTlQ6IE9ubHkgdHJ1ZSBhbmQgZmFsc2UgYXJlIHVzZWQsIG51bGwgZW50cmllcyBuZWVkIHRvIGJlIGlnbm9yZWRcblx0XHRcdFx0aWYgKHZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0YWxsb3dMaXN0UnVsZXMucHVzaCh7IHJlZ2V4LCByZWdleENhc2VJbnNlbnNpdGl2ZSwgc291cmNlVGV4dDoga2V5LCBzb3VyY2VUYXJnZXQsIGlzRGVmYXVsdFJ1bGUgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0ZGVueUxpc3RSdWxlcy5wdXNoKHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlLCBzb3VyY2VUZXh0OiBrZXksIHNvdXJjZVRhcmdldCwgaXNEZWZhdWx0UnVsZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlICE9PSBudWxsKSB7XG5cdFx0XHRcdC8vIEhhbmRsZSBvYmplY3QgZm9ybWF0IGxpa2UgeyBhcHByb3ZlOiB0cnVlL2ZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlL2ZhbHNlIH1cblx0XHRcdFx0Y29uc3Qgb2JqZWN0VmFsdWUgPSB2YWx1ZSBhcyB7IGFwcHJvdmU/OiBib29sZWFuOyBtYXRjaENvbW1hbmRMaW5lPzogYm9vbGVhbiB9O1xuXHRcdFx0XHRpZiAodHlwZW9mIG9iamVjdFZhbHVlLmFwcHJvdmUgPT09ICdib29sZWFuJykge1xuXHRcdFx0XHRcdGNvbnN0IHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlIH0gPSB0aGlzLl9jb252ZXJ0QXV0b0FwcHJvdmVFbnRyeVRvUmVnZXgoa2V5KTtcblx0XHRcdFx0XHRpZiAob2JqZWN0VmFsdWUuYXBwcm92ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0aWYgKG9iamVjdFZhbHVlLm1hdGNoQ29tbWFuZExpbmUgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdFx0YWxsb3dMaXN0Q29tbWFuZExpbmVSdWxlcy5wdXNoKHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlLCBzb3VyY2VUZXh0OiBrZXksIHNvdXJjZVRhcmdldCwgaXNEZWZhdWx0UnVsZSB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGFsbG93TGlzdFJ1bGVzLnB1c2goeyByZWdleCwgcmVnZXhDYXNlSW5zZW5zaXRpdmUsIHNvdXJjZVRleHQ6IGtleSwgc291cmNlVGFyZ2V0LCBpc0RlZmF1bHRSdWxlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAob2JqZWN0VmFsdWUuYXBwcm92ZSA9PT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdGlmIChvYmplY3RWYWx1ZS5tYXRjaENvbW1hbmRMaW5lID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRcdGRlbnlMaXN0Q29tbWFuZExpbmVSdWxlcy5wdXNoKHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlLCBzb3VyY2VUZXh0OiBrZXksIHNvdXJjZVRhcmdldCwgaXNEZWZhdWx0UnVsZSB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGRlbnlMaXN0UnVsZXMucHVzaCh7IHJlZ2V4LCByZWdleENhc2VJbnNlbnNpdGl2ZSwgc291cmNlVGV4dDoga2V5LCBzb3VyY2VUYXJnZXQsIGlzRGVmYXVsdFJ1bGUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlbnlMaXN0UnVsZXMsXG5cdFx0XHRhbGxvd0xpc3RSdWxlcyxcblx0XHRcdGFsbG93TGlzdENvbW1hbmRMaW5lUnVsZXMsXG5cdFx0XHRkZW55TGlzdENvbW1hbmRMaW5lUnVsZXNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29udmVydEF1dG9BcHByb3ZlRW50cnlUb1JlZ2V4KHZhbHVlOiBzdHJpbmcpOiB7IHJlZ2V4OiBSZWdFeHA7IHJlZ2V4Q2FzZUluc2Vuc2l0aXZlOiBSZWdFeHAgfSB7XG5cdFx0Y29uc3QgcmVnZXggPSB0aGlzLl9kb0NvbnZlcnRBdXRvQXBwcm92ZUVudHJ5VG9SZWdleCh2YWx1ZSk7XG5cdFx0aWYgKHJlZ2V4LmZsYWdzLmluY2x1ZGVzKCdpJykpIHtcblx0XHRcdHJldHVybiB7IHJlZ2V4LCByZWdleENhc2VJbnNlbnNpdGl2ZTogcmVnZXggfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcmVnZXgsIHJlZ2V4Q2FzZUluc2Vuc2l0aXZlOiBuZXcgUmVnRXhwKHJlZ2V4LnNvdXJjZSwgcmVnZXguZmxhZ3MgKyAnaScpIH07XG5cdH1cblxuXHRwcml2YXRlIF9kb0NvbnZlcnRBdXRvQXBwcm92ZUVudHJ5VG9SZWdleCh2YWx1ZTogc3RyaW5nKTogUmVnRXhwIHtcblx0XHQvLyBJZiBpdCdzIHdyYXBwZWQgaW4gYC9gLCBpdCdzIGluIHJlZ2V4IGZvcm1hdCBhbmQgc2hvdWxkIGJlIGNvbnZlcnRlZCBkaXJlY3RseVxuXHRcdC8vIFN1cHBvcnQgYWxsIHN0YW5kYXJkIEphdmFTY3JpcHQgcmVnZXggZmxhZ3M6IGQsIGcsIGksIG0sIHMsIHUsIHYsIHlcblx0XHRjb25zdCByZWdleE1hdGNoID0gdmFsdWUubWF0Y2goL15cXC8oPzxwYXR0ZXJuPi4rKVxcLyg/PGZsYWdzPltkZ2ltc3V2eV0qKSQvKTtcblx0XHRjb25zdCByZWdleFBhdHRlcm4gPSByZWdleE1hdGNoPy5ncm91cHM/LnBhdHRlcm47XG5cdFx0aWYgKHJlZ2V4UGF0dGVybikge1xuXHRcdFx0bGV0IGZsYWdzID0gcmVnZXhNYXRjaC5ncm91cHM/LmZsYWdzO1xuXHRcdFx0Ly8gUmVtb3ZlIGdsb2JhbCBmbGFnIGFzIGl0IGNoYW5nZXMgaG93IHRoZSByZWdleCBzdGF0ZSB3b3JrcyB3aGljaCB3ZSBuZWVkIHRvIGhhbmRsZVxuXHRcdFx0Ly8gaW50ZXJuYWxseVxuXHRcdFx0aWYgKGZsYWdzKSB7XG5cdFx0XHRcdGZsYWdzID0gZmxhZ3MucmVwbGFjZUFsbCgnZycsICcnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWxsb3cgLiogYXMgdXNlcnMgZXhwZWN0IHRoaXMgd291bGQgbWF0Y2ggZXZlcnl0aGluZ1xuXHRcdFx0aWYgKHJlZ2V4UGF0dGVybiA9PT0gJy4qJykge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFJlZ0V4cChyZWdleFBhdHRlcm4pO1xuXG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChyZWdleFBhdHRlcm4sIGZsYWdzIHx8IHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmIChyZWdFeHBMZWFkc1RvRW5kbGVzc0xvb3AocmVnZXgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldmVyTWF0Y2hSZWdleDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiByZWdleDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBuZXZlck1hdGNoUmVnZXg7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGVtcHR5IHN0cmluZyBzaG91bGQgYmUgaWdub3JlZCwgcmF0aGVyIHRoYW4gYXBwcm92ZSBldmVyeXRoaW5nXG5cdFx0aWYgKHZhbHVlID09PSAnJykge1xuXHRcdFx0cmV0dXJuIG5ldmVyTWF0Y2hSZWdleDtcblx0XHR9XG5cblx0XHRsZXQgc2FuaXRpemVkVmFsdWU6IHN0cmluZztcblxuXHRcdC8vIE1hdGNoIGJvdGggcGF0aCBzZXBhcmF0b3JzIGl0IGlmIGxvb2tzIGxpa2UgYSBwYXRoXG5cdFx0aWYgKHZhbHVlLmluY2x1ZGVzKCcvJykgfHwgdmFsdWUuaW5jbHVkZXMoJ1xcXFwnKSkge1xuXHRcdFx0Ly8gUmVwbGFjZSBwYXRoIHNlcGFyYXRvcnMgd2l0aCBwbGFjZWhvbGRlcnMgZmlyc3QsIGFwcGx5IHN0YW5kYXJkIHNhbml0aXphdGlvbiwgdGhlblxuXHRcdFx0Ly8gYXBwbHkgc3BlY2lhbCBwYXRoIGhhbmRsaW5nXG5cdFx0XHRsZXQgcGF0dGVybiA9IHZhbHVlLnJlcGxhY2UoL1svXFxcXF0vZywgJyUlUEFUSF9TRVAlJScpO1xuXHRcdFx0cGF0dGVybiA9IGVzY2FwZVJlZ0V4cENoYXJhY3RlcnMocGF0dGVybik7XG5cdFx0XHRwYXR0ZXJuID0gcGF0dGVybi5yZXBsYWNlKC8lJVBBVEhfU0VQJSUqL2csICdbL1xcXFxcXFxcXScpO1xuXHRcdFx0c2FuaXRpemVkVmFsdWUgPSBgXig/OlxcXFwuWy9cXFxcXFxcXF0pPyR7cGF0dGVybn1gO1xuXHRcdH1cblxuXHRcdC8vIEVzY2FwZSByZWdleCBzcGVjaWFsIGNoYXJhY3RlcnMgZm9yIG5vbi1wYXRoIHN0cmluZ3Ncblx0XHRlbHNlIHtcblx0XHRcdHNhbml0aXplZFZhbHVlID0gZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyh2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVndWxhciBzdHJpbmdzIHNob3VsZCBtYXRjaCB0aGUgc3RhcnQgb2YgdGhlIGNvbW1hbmQgbGluZSBhbmQgYmUgYSB3b3JkIGJvdW5kYXJ5XG5cdFx0cmV0dXJuIG5ldyBSZWdFeHAoYF4ke3Nhbml0aXplZFZhbHVlfVxcXFxiYCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyx3QkFBd0IsZ0NBQWdDO0FBQ2pFLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMscUJBQXFCLDZCQUF1RDtBQUNyRixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLDZCQUE2QjtBQVV0QyxNQUFNLGtCQUFrQjtBQUN4QixNQUFNLHVCQUF1QjtBQUV0QixJQUFNLDBCQUFOLGNBQXNDLFdBQVc7QUFBQSxFQU92RCxZQUN5Qyx1QkFDakIsc0JBQ2dCLHNCQUN0QztBQUNELFVBQU07QUFKa0M7QUFFRDtBQVR4QyxTQUFRLGlCQUFxQyxDQUFDO0FBQzlDLFNBQVEsa0JBQXNDLENBQUM7QUFDL0MsU0FBUSw2QkFBaUQsQ0FBQztBQUMxRCxTQUFRLDRCQUFnRCxDQUFDO0FBU3hELFNBQUsseUJBQXlCLEtBQUssVUFBVSxxQkFBcUIsZUFBZSxxQkFBcUIsQ0FBQztBQUN2RyxTQUFLLG9CQUFvQjtBQUN6QixTQUFLLFVBQVUsS0FBSyxzQkFBc0IseUJBQXlCLE9BQUs7QUFDdkUsVUFDQyxFQUFFLHFCQUFxQixnQ0FBZ0MsV0FBVyxLQUNsRSxFQUFFLHFCQUFxQixnQ0FBZ0MsNkJBQTZC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LDRCQUFjLEtBQUssRUFBRSxPQUFPLHNCQUFzQixZQUFZLEtBQUssY0FBYyxjQUFjLENBQUM7QUFBQSxZQUNqRztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQ0FBZ0MsT0FBZ0U7QUFDdkcsVUFBTSxRQUFRLEtBQUssa0NBQWtDLEtBQUs7QUFDMUQsUUFBSSxNQUFNLE1BQU0sU0FBUyxHQUFHLEdBQUc7QUFDOUIsYUFBTyxFQUFFLE9BQU8sc0JBQXNCLE1BQU07QUFBQSxJQUM3QztBQUNBLFdBQU8sRUFBRSxPQUFPLHNCQUFzQixJQUFJLE9BQU8sTUFBTSxRQUFRLE1BQU0sUUFBUSxHQUFHLEVBQUU7QUFBQSxFQUNuRjtBQUFBLEVBRVEsa0NBQWtDLE9BQXVCO0FBR2hFLFVBQU0sYUFBYSxNQUFNLE1BQU0sMkNBQTJDO0FBQzFFLFVBQU0sZUFBZSxZQUFZLFFBQVE7QUFDekMsUUFBSSxjQUFjO0FBQ2pCLFVBQUksUUFBUSxXQUFXLFFBQVE7QUFHL0IsVUFBSSxPQUFPO0FBQ1YsZ0JBQVEsTUFBTSxXQUFXLEtBQUssRUFBRTtBQUFBLE1BQ2pDO0FBR0EsVUFBSSxpQkFBaUIsTUFBTTtBQUMxQixlQUFPLElBQUksT0FBTyxZQUFZO0FBQUEsTUFFL0I7QUFFQSxVQUFJO0FBQ0gsY0FBTSxRQUFRLElBQUksT0FBTyxjQUFjLFNBQVMsTUFBUztBQUN6RCxZQUFJLHlCQUF5QixLQUFLLEdBQUc7QUFDcEMsaUJBQU87QUFBQSxRQUNSO0FBRUEsZUFBTztBQUFBLE1BQ1IsU0FBUyxPQUFPO0FBQ2YsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBR0EsUUFBSSxVQUFVLElBQUk7QUFDakIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJO0FBR0osUUFBSSxNQUFNLFNBQVMsR0FBRyxLQUFLLE1BQU0sU0FBUyxJQUFJLEdBQUc7QUFHaEQsVUFBSSxVQUFVLE1BQU0sUUFBUSxVQUFVLGNBQWM7QUFDcEQsZ0JBQVUsdUJBQXVCLE9BQU87QUFDeEMsZ0JBQVUsUUFBUSxRQUFRLGtCQUFrQixTQUFTO0FBQ3JELHVCQUFpQixtQkFBbUIsT0FBTztBQUFBLElBQzVDLE9BR0s7QUFDSix1QkFBaUIsdUJBQXVCLEtBQUs7QUFBQSxJQUM5QztBQUdBLFdBQU8sSUFBSSxPQUFPLElBQUksY0FBYyxLQUFLO0FBQUEsRUFDMUM7QUFDRDtBQS9XYSwwQkFBTjtBQUFBLEVBUUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbImNoZWNrVGFyZ2V0Il0KfQo=
