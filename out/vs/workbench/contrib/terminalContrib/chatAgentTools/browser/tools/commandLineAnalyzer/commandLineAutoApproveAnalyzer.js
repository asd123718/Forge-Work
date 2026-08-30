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
import { asArray } from "../../../../../../../base/common/arrays.js";
import { createCommandUri, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ITerminalChatService } from "../../../../../terminal/browser/terminal.js";
import { IStorageService, StorageScope } from "../../../../../../../platform/storage/common/storage.js";
import { TerminalToolConfirmationStorageKeys } from "../../../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js";
import { ChatConfiguration } from "../../../../../chat/common/constants.js";
import { TerminalChatAgentToolsSettingId } from "../../../common/terminalChatAgentToolsConfiguration.js";
import { dedupeRules, generateAutoApproveActions, isPowerShell } from "../../runInTerminalHelpers.js";
import { isAutoApproveRule, isNpmScriptAutoApproveRule } from "./commandLineAnalyzer.js";
import { TerminalChatCommandId } from "../../../../chat/browser/terminalChat.js";
import { CommandLineAutoApprover } from "./autoApprove/commandLineAutoApprover.js";
const promptInjectionWarningCommandsLower = [
  "curl",
  "wget"
];
const promptInjectionWarningCommandsLowerPwshOnly = [
  "invoke-restmethod",
  "invoke-webrequest",
  "irm",
  "iwr"
];
let CommandLineAutoApproveAnalyzer = class extends Disposable {
  constructor(_treeSitterCommandParser, _telemetry, _log, _configurationService, instantiationService, _storageService, _terminalChatService) {
    super();
    this._treeSitterCommandParser = _treeSitterCommandParser;
    this._telemetry = _telemetry;
    this._log = _log;
    this._configurationService = _configurationService;
    this._storageService = _storageService;
    this._terminalChatService = _terminalChatService;
    this._commandLineAutoApprover = this._register(instantiationService.createInstance(CommandLineAutoApprover));
  }
  async analyze(options) {
    const isAutoApproveEnabledInSettings = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
    if (isAutoApproveEnabledInSettings && options.chatSessionResource && this._terminalChatService.hasChatSessionAutoApproval(options.chatSessionResource)) {
      this._log("Session has auto approval enabled, auto approving command");
      const disableUri = createCommandUri(TerminalChatCommandId.DisableSessionAutoApproval, options.chatSessionResource);
      const mdTrustSettings = {
        isTrusted: {
          enabledCommands: [TerminalChatCommandId.DisableSessionAutoApproval]
        }
      };
      return {
        isAutoApproved: true,
        isAutoApproveAllowed: true,
        disclaimers: [],
        autoApproveInfo: new MarkdownString(`${localize("autoApprove.session", "Auto approved for this session")} ([${localize("autoApprove.session.disable", "Disable")}](${disableUri.toString()}))`, mdTrustSettings)
      };
    }
    const trimmedCommandLine = options.commandLine.trimStart();
    let subCommands;
    let hasUnanalyzableSyntax = false;
    try {
      const parseResult = await this._treeSitterCommandParser.extractAutoApprovalSubCommands(options.treeSitterLanguage, trimmedCommandLine);
      subCommands = parseResult.subCommands;
      hasUnanalyzableSyntax = parseResult.hasUnanalyzableSyntax;
      this._log(`Parsed sub-commands via ${options.treeSitterLanguage} grammar`, subCommands);
      if (hasUnanalyzableSyntax) {
        this._log("Command line contains syntax that cannot be safely auto-approved");
      }
    } catch (e) {
      console.error(e);
      this._log(`Failed to parse sub-commands via ${options.treeSitterLanguage} grammar`);
    }
    let isAutoApproved = false;
    let autoApproveInfo;
    let customActions;
    if (!subCommands?.length) {
      if (trimmedCommandLine.length === 0) {
        this._log("Command line is empty, auto approving");
        return {
          isAutoApproved: true,
          isAutoApproveAllowed: true,
          disclaimers: []
        };
      }
      this._log("No sub-commands were parsed, auto approval is not allowed");
      return {
        isAutoApproveAllowed: false,
        disclaimers: []
      };
    }
    const subCommandResults = await Promise.all(subCommands.map((e) => this._commandLineAutoApprover.isCommandAutoApproved(e, options.shell, options.os, options.cwd, options.chatSessionResource)));
    const commandLineResult = this._commandLineAutoApprover.isCommandLineAutoApproved(trimmedCommandLine, options.chatSessionResource);
    const autoApproveReasons = [
      ...subCommandResults.map((e) => e.reason),
      commandLineResult.reason
    ];
    let isDenied = false;
    let autoApproveReason;
    let autoApproveDefault;
    const deniedSubCommandResult = subCommandResults.find((e) => e.result === "denied");
    if (deniedSubCommandResult) {
      this._log("Sub-command DENIED auto approval");
      isDenied = true;
      autoApproveDefault = isAutoApproveRule(deniedSubCommandResult.rule) ? deniedSubCommandResult.rule.isDefaultRule : void 0;
      autoApproveReason = "subCommand";
    } else if (commandLineResult.result === "denied") {
      this._log("Command line DENIED auto approval");
      isDenied = true;
      autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : void 0;
      autoApproveReason = "commandLine";
    } else {
      if (subCommandResults.every((e) => e.result === "approved")) {
        this._log("All sub-commands auto-approved");
        isAutoApproved = true;
        autoApproveReason = "subCommand";
        autoApproveDefault = subCommandResults.every((e) => isAutoApproveRule(e.rule) && e.rule.isDefaultRule);
      } else {
        this._log("All sub-commands NOT auto-approved");
        if (commandLineResult.result === "approved") {
          this._log("Command line auto-approved");
          autoApproveReason = "commandLine";
          isAutoApproved = true;
          autoApproveDefault = isAutoApproveRule(commandLineResult.rule) ? commandLineResult.rule.isDefaultRule : void 0;
        } else {
          this._log("Command line NOT auto-approved");
        }
      }
    }
    if (hasUnanalyzableSyntax) {
      isAutoApproved = false;
    }
    for (const reason of autoApproveReasons) {
      this._log(`- ${reason}`);
    }
    const isAutoApproveEnabled = this._configurationService.getValue(TerminalChatAgentToolsSettingId.EnableAutoApprove) === true;
    const isAutoApproveWarningAccepted = this._storageService.getBoolean(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, StorageScope.APPLICATION, false);
    if (isAutoApproveEnabled && isAutoApproved) {
      autoApproveInfo = this._createAutoApproveInfo(
        isAutoApproved,
        isDenied,
        autoApproveReason,
        subCommandResults,
        commandLineResult
      );
    } else {
      isAutoApproved = false;
    }
    this._telemetry.logPrepare({
      terminalToolSessionId: options.terminalToolSessionId,
      subCommands,
      autoApproveAllowed: !isAutoApproveEnabled ? "off" : isAutoApproveWarningAccepted ? "allowed" : "needsOptIn",
      autoApproveResult: isAutoApproved ? "approved" : isDenied ? "denied" : "manual",
      autoApproveReason,
      autoApproveDefault
    });
    const disclaimers = [];
    const subCommandsLowerFirstWordOnly = subCommands.map((command) => command.split(" ")[0].toLowerCase());
    if (!isAutoApproved && (subCommandsLowerFirstWordOnly.some((command) => promptInjectionWarningCommandsLower.includes(command)) || isPowerShell(options.shell, options.os) && subCommandsLowerFirstWordOnly.some((command) => promptInjectionWarningCommandsLowerPwshOnly.includes(command)))) {
      disclaimers.push(localize("runInTerminal.promptInjectionDisclaimer", "Web content may contain malicious code or attempt prompt injection attacks."));
    }
    if (isAutoApproveEnabled && isDenied) {
      const denialInfo = this._createAutoApproveInfo(
        isAutoApproved,
        isDenied,
        autoApproveReason,
        subCommandResults,
        commandLineResult
      );
      if (denialInfo) {
        disclaimers.push(denialInfo);
      }
    }
    if (!isAutoApproved && isAutoApproveEnabled && !hasUnanalyzableSyntax) {
      customActions = generateAutoApproveActions(trimmedCommandLine, subCommands, { subCommandResults, commandLineResult });
    }
    return {
      isAutoApproved,
      // Denied rules stay configurable; unanalyzable syntax cannot be auto-approved safely.
      isAutoApproveAllowed: !hasUnanalyzableSyntax,
      disclaimers,
      autoApproveInfo,
      customActions
    };
  }
  _createAutoApproveInfo(isAutoApproved, isDenied, autoApproveReason, subCommandResults, commandLineResult) {
    const formatRuleLinks = (result) => {
      return asArray(result).filter((e) => isAutoApproveRule(e.rule)).map((e) => {
        const escapedSourceText = e.rule.sourceText.replaceAll("$", "\\$");
        if (e.rule.sourceTarget === "session") {
          return localize("autoApproveRule.sessionIndicator", "{0} (session)", `\`${escapedSourceText}\``);
        }
        const settingsUri = createCommandUri(TerminalChatCommandId.OpenTerminalSettingsLink, e.rule.sourceTarget);
        const tooltip = localize("ruleTooltip", "View rule in settings");
        let label = escapedSourceText;
        switch (e.rule?.sourceTarget) {
          case ConfigurationTarget.DEFAULT:
            label = `${label} (default)`;
            break;
          case ConfigurationTarget.USER:
          case ConfigurationTarget.USER_LOCAL:
            label = `${label} (user)`;
            break;
          case ConfigurationTarget.USER_REMOTE:
            label = `${label} (remote)`;
            break;
          case ConfigurationTarget.WORKSPACE:
          case ConfigurationTarget.WORKSPACE_FOLDER:
            label = `${label} (workspace)`;
            break;
        }
        return `[\`${label}\`](${settingsUri.toString()} "${tooltip}")`;
      }).join(", ");
    };
    const mdTrustSettings = {
      isTrusted: {
        enabledCommands: [TerminalChatCommandId.OpenTerminalSettingsLink]
      }
    };
    const config = this._configurationService.inspect(ChatConfiguration.GlobalAutoApprove);
    const isGlobalAutoApproved = config?.value ?? config.defaultValue;
    if (isGlobalAutoApproved) {
      const settingsUri = createCommandUri(TerminalChatCommandId.OpenTerminalSettingsLink, "global");
      return new MarkdownString(`${localize("autoApprove.global", "Auto approved by setting {0}", `[\`${ChatConfiguration.GlobalAutoApprove}\`](${settingsUri.toString()} "${localize("ruleTooltip.global", "View settings")}")`)}`, mdTrustSettings);
    }
    if (isAutoApproved) {
      switch (autoApproveReason) {
        case "commandLine": {
          if (isAutoApproveRule(commandLineResult.rule)) {
            return new MarkdownString(localize("autoApprove.rule", "Auto approved by rule {0}", formatRuleLinks(commandLineResult)), mdTrustSettings);
          }
          break;
        }
        case "subCommand": {
          const npmScriptApproval = subCommandResults.find((e) => isNpmScriptAutoApproveRule(e.rule));
          if (npmScriptApproval && isNpmScriptAutoApproveRule(npmScriptApproval.rule) && npmScriptApproval.rule.npmScriptResult.autoApproveInfo) {
            return npmScriptApproval.rule.npmScriptResult.autoApproveInfo;
          }
          const uniqueRules = dedupeRules(subCommandResults);
          if (uniqueRules.length === 1) {
            return new MarkdownString(localize("autoApprove.rule", "Auto approved by rule {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          } else if (uniqueRules.length > 1) {
            return new MarkdownString(localize("autoApprove.rules", "Auto approved by rules {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          }
          break;
        }
      }
    } else if (isDenied) {
      switch (autoApproveReason) {
        case "commandLine": {
          if (commandLineResult.rule) {
            return new MarkdownString(localize("autoApproveDenied.rule", "Auto approval denied by rule {0}", formatRuleLinks(commandLineResult)), mdTrustSettings);
          }
          break;
        }
        case "subCommand": {
          const uniqueRules = dedupeRules(subCommandResults.filter((e) => e.result === "denied"));
          if (uniqueRules.length === 1) {
            return new MarkdownString(localize("autoApproveDenied.rule", "Auto approval denied by rule {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          } else if (uniqueRules.length > 1) {
            return new MarkdownString(localize("autoApproveDenied.rules", "Auto approval denied by rules {0}", formatRuleLinks(uniqueRules)), mdTrustSettings);
          }
          break;
        }
      }
    }
    return void 0;
  }
};
CommandLineAutoApproveAnalyzer = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ITerminalChatService)
], CommandLineAutoApproveAnalyzer);
export {
  CommandLineAutoApproveAnalyzer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXGJyb3dzZXJcXHRvb2xzXFxjb21tYW5kTGluZUFuYWx5emVyXFxjb21tYW5kTGluZUF1dG9BcHByb3ZlQW5hbHl6ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmksIE1hcmtkb3duU3RyaW5nLCB0eXBlIElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgeyBTaW5nbGVPck1hbnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbENvbmZpcm1hdGlvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBkZWR1cGVSdWxlcywgZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMsIGlzUG93ZXJTaGVsbCB9IGZyb20gJy4uLy4uL3J1bkluVGVybWluYWxIZWxwZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgUnVuSW5UZXJtaW5hbFRvb2xUZWxlbWV0cnkgfSBmcm9tICcuLi8uLi9ydW5JblRlcm1pbmFsVG9vbFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyB0eXBlIFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyIH0gZnJvbSAnLi4vLi4vdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ29tbWFuZExpbmVBbmFseXplciwgdHlwZSBJQ29tbWFuZExpbmVBbmFseXplck9wdGlvbnMsIHR5cGUgSUNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHQsIHR5cGUgSUF1dG9BcHByb3ZlUnVsZSwgaXNBdXRvQXBwcm92ZVJ1bGUsIGlzTnBtU2NyaXB0QXV0b0FwcHJvdmVSdWxlIH0gZnJvbSAnLi9jb21tYW5kTGluZUFuYWx5emVyLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2hhdENvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvYnJvd3Nlci90ZXJtaW5hbENoYXQuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVBdXRvQXBwcm92ZXIsIHR5cGUgSUNvbW1hbmRBcHByb3ZhbFJlc3VsdFdpdGhSZWFzb24gfSBmcm9tICcuL2F1dG9BcHByb3ZlL2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmpzJztcblxuY29uc3QgcHJvbXB0SW5qZWN0aW9uV2FybmluZ0NvbW1hbmRzTG93ZXIgPSBbXG5cdCdjdXJsJyxcblx0J3dnZXQnLFxuXTtcbmNvbnN0IHByb21wdEluamVjdGlvbldhcm5pbmdDb21tYW5kc0xvd2VyUHdzaE9ubHkgPSBbXG5cdCdpbnZva2UtcmVzdG1ldGhvZCcsXG5cdCdpbnZva2Utd2VicmVxdWVzdCcsXG5cdCdpcm0nLFxuXHQnaXdyJyxcbl07XG5cbmV4cG9ydCBjbGFzcyBDb21tYW5kTGluZUF1dG9BcHByb3ZlQW5hbHl6ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNvbW1hbmRMaW5lQW5hbHl6ZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kTGluZUF1dG9BcHByb3ZlcjogQ29tbWFuZExpbmVBdXRvQXBwcm92ZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJlZVNpdHRlckNvbW1hbmRQYXJzZXI6IFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeTogUnVuSW5UZXJtaW5hbFRvb2xUZWxlbWV0cnksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nOiAobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbENoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tbWFuZExpbmVBdXRvQXBwcm92ZXIpKTtcblx0fVxuXG5cdGFzeW5jIGFuYWx5emUob3B0aW9uczogSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zKTogUHJvbWlzZTxJQ29tbWFuZExpbmVBbmFseXplclJlc3VsdD4ge1xuXHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVFbmFibGVkSW5TZXR0aW5ncyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRW5hYmxlQXV0b0FwcHJvdmUpID09PSB0cnVlO1xuXHRcdGlmIChpc0F1dG9BcHByb3ZlRW5hYmxlZEluU2V0dGluZ3MgJiYgb3B0aW9ucy5jaGF0U2Vzc2lvblJlc291cmNlICYmIHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuaGFzQ2hhdFNlc3Npb25BdXRvQXBwcm92YWwob3B0aW9ucy5jaGF0U2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5fbG9nKCdTZXNzaW9uIGhhcyBhdXRvIGFwcHJvdmFsIGVuYWJsZWQsIGF1dG8gYXBwcm92aW5nIGNvbW1hbmQnKTtcblx0XHRcdGNvbnN0IGRpc2FibGVVcmkgPSBjcmVhdGVDb21tYW5kVXJpKFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5EaXNhYmxlU2Vzc2lvbkF1dG9BcHByb3ZhbCwgb3B0aW9ucy5jaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IG1kVHJ1c3RTZXR0aW5ncyA9IHtcblx0XHRcdFx0aXNUcnVzdGVkOiB7XG5cdFx0XHRcdFx0ZW5hYmxlZENvbW1hbmRzOiBbVGVybWluYWxDaGF0Q29tbWFuZElkLkRpc2FibGVTZXNzaW9uQXV0b0FwcHJvdmFsXVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aXNBdXRvQXBwcm92ZWQ6IHRydWUsXG5cdFx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkOiB0cnVlLFxuXHRcdFx0XHRkaXNjbGFpbWVyczogW10sXG5cdFx0XHRcdGF1dG9BcHByb3ZlSW5mbzogbmV3IE1hcmtkb3duU3RyaW5nKGAke2xvY2FsaXplKCdhdXRvQXBwcm92ZS5zZXNzaW9uJywgJ0F1dG8gYXBwcm92ZWQgZm9yIHRoaXMgc2Vzc2lvbicpfSAoWyR7bG9jYWxpemUoJ2F1dG9BcHByb3ZlLnNlc3Npb24uZGlzYWJsZScsICdEaXNhYmxlJyl9XSgke2Rpc2FibGVVcmkudG9TdHJpbmcoKX0pKWAsIG1kVHJ1c3RTZXR0aW5ncyksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyaW1tZWRDb21tYW5kTGluZSA9IG9wdGlvbnMuY29tbWFuZExpbmUudHJpbVN0YXJ0KCk7XG5cblx0XHRsZXQgc3ViQ29tbWFuZHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBoYXNVbmFuYWx5emFibGVTeW50YXggPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VSZXN1bHQgPSBhd2FpdCB0aGlzLl90cmVlU2l0dGVyQ29tbWFuZFBhcnNlci5leHRyYWN0QXV0b0FwcHJvdmFsU3ViQ29tbWFuZHMob3B0aW9ucy50cmVlU2l0dGVyTGFuZ3VhZ2UsIHRyaW1tZWRDb21tYW5kTGluZSk7XG5cdFx0XHRzdWJDb21tYW5kcyA9IHBhcnNlUmVzdWx0LnN1YkNvbW1hbmRzO1xuXHRcdFx0aGFzVW5hbmFseXphYmxlU3ludGF4ID0gcGFyc2VSZXN1bHQuaGFzVW5hbmFseXphYmxlU3ludGF4O1xuXHRcdFx0dGhpcy5fbG9nKGBQYXJzZWQgc3ViLWNvbW1hbmRzIHZpYSAke29wdGlvbnMudHJlZVNpdHRlckxhbmd1YWdlfSBncmFtbWFyYCwgc3ViQ29tbWFuZHMpO1xuXHRcdFx0aWYgKGhhc1VuYW5hbHl6YWJsZVN5bnRheCkge1xuXHRcdFx0XHR0aGlzLl9sb2coJ0NvbW1hbmQgbGluZSBjb250YWlucyBzeW50YXggdGhhdCBjYW5ub3QgYmUgc2FmZWx5IGF1dG8tYXBwcm92ZWQnKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGUpO1xuXHRcdFx0dGhpcy5fbG9nKGBGYWlsZWQgdG8gcGFyc2Ugc3ViLWNvbW1hbmRzIHZpYSAke29wdGlvbnMudHJlZVNpdHRlckxhbmd1YWdlfSBncmFtbWFyYCk7XG5cdFx0fVxuXG5cdFx0bGV0IGlzQXV0b0FwcHJvdmVkID0gZmFsc2U7XG5cdFx0bGV0IGF1dG9BcHByb3ZlSW5mbzogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjdXN0b21BY3Rpb25zOiBUb29sQ29uZmlybWF0aW9uQWN0aW9uW10gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIXN1YkNvbW1hbmRzPy5sZW5ndGgpIHtcblx0XHRcdGlmICh0cmltbWVkQ29tbWFuZExpbmUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZygnQ29tbWFuZCBsaW5lIGlzIGVtcHR5LCBhdXRvIGFwcHJvdmluZycpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlzQXV0b0FwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkOiB0cnVlLFxuXHRcdFx0XHRcdGRpc2NsYWltZXJzOiBbXSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbG9nKCdObyBzdWItY29tbWFuZHMgd2VyZSBwYXJzZWQsIGF1dG8gYXBwcm92YWwgaXMgbm90IGFsbG93ZWQnKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkOiBmYWxzZSxcblx0XHRcdFx0ZGlzY2xhaW1lcnM6IFtdLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBzdWJDb21tYW5kUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHN1YkNvbW1hbmRzLm1hcChlID0+IHRoaXMuX2NvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZChlLCBvcHRpb25zLnNoZWxsLCBvcHRpb25zLm9zLCBvcHRpb25zLmN3ZCwgb3B0aW9ucy5jaGF0U2Vzc2lvblJlc291cmNlKSkpO1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lUmVzdWx0ID0gdGhpcy5fY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCh0cmltbWVkQ29tbWFuZExpbmUsIG9wdGlvbnMuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZWFzb25zOiBzdHJpbmdbXSA9IFtcblx0XHRcdC4uLnN1YkNvbW1hbmRSZXN1bHRzLm1hcChlID0+IGUucmVhc29uKSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0LnJlYXNvbixcblx0XHRdO1xuXG5cdFx0bGV0IGlzRGVuaWVkID0gZmFsc2U7XG5cdFx0bGV0IGF1dG9BcHByb3ZlUmVhc29uOiAnc3ViQ29tbWFuZCcgfCAnY29tbWFuZExpbmUnIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhdXRvQXBwcm92ZURlZmF1bHQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBkZW5pZWRTdWJDb21tYW5kUmVzdWx0ID0gc3ViQ29tbWFuZFJlc3VsdHMuZmluZChlID0+IGUucmVzdWx0ID09PSAnZGVuaWVkJyk7XG5cdFx0aWYgKGRlbmllZFN1YkNvbW1hbmRSZXN1bHQpIHtcblx0XHRcdHRoaXMuX2xvZygnU3ViLWNvbW1hbmQgREVOSUVEIGF1dG8gYXBwcm92YWwnKTtcblx0XHRcdGlzRGVuaWVkID0gdHJ1ZTtcblx0XHRcdGF1dG9BcHByb3ZlRGVmYXVsdCA9IGlzQXV0b0FwcHJvdmVSdWxlKGRlbmllZFN1YkNvbW1hbmRSZXN1bHQucnVsZSkgPyBkZW5pZWRTdWJDb21tYW5kUmVzdWx0LnJ1bGUuaXNEZWZhdWx0UnVsZSA6IHVuZGVmaW5lZDtcblx0XHRcdGF1dG9BcHByb3ZlUmVhc29uID0gJ3N1YkNvbW1hbmQnO1xuXHRcdH0gZWxzZSBpZiAoY29tbWFuZExpbmVSZXN1bHQucmVzdWx0ID09PSAnZGVuaWVkJykge1xuXHRcdFx0dGhpcy5fbG9nKCdDb21tYW5kIGxpbmUgREVOSUVEIGF1dG8gYXBwcm92YWwnKTtcblx0XHRcdGlzRGVuaWVkID0gdHJ1ZTtcblx0XHRcdGF1dG9BcHByb3ZlRGVmYXVsdCA9IGlzQXV0b0FwcHJvdmVSdWxlKGNvbW1hbmRMaW5lUmVzdWx0LnJ1bGUpID8gY29tbWFuZExpbmVSZXN1bHQucnVsZS5pc0RlZmF1bHRSdWxlIDogdW5kZWZpbmVkO1xuXHRcdFx0YXV0b0FwcHJvdmVSZWFzb24gPSAnY29tbWFuZExpbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoc3ViQ29tbWFuZFJlc3VsdHMuZXZlcnkoZSA9PiBlLnJlc3VsdCA9PT0gJ2FwcHJvdmVkJykpIHtcblx0XHRcdFx0dGhpcy5fbG9nKCdBbGwgc3ViLWNvbW1hbmRzIGF1dG8tYXBwcm92ZWQnKTtcblx0XHRcdFx0aXNBdXRvQXBwcm92ZWQgPSB0cnVlO1xuXHRcdFx0XHRhdXRvQXBwcm92ZVJlYXNvbiA9ICdzdWJDb21tYW5kJztcblx0XHRcdFx0YXV0b0FwcHJvdmVEZWZhdWx0ID0gc3ViQ29tbWFuZFJlc3VsdHMuZXZlcnkoZSA9PiBpc0F1dG9BcHByb3ZlUnVsZShlLnJ1bGUpICYmIGUucnVsZS5pc0RlZmF1bHRSdWxlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZygnQWxsIHN1Yi1jb21tYW5kcyBOT1QgYXV0by1hcHByb3ZlZCcpO1xuXHRcdFx0XHRpZiAoY29tbWFuZExpbmVSZXN1bHQucmVzdWx0ID09PSAnYXBwcm92ZWQnKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nKCdDb21tYW5kIGxpbmUgYXV0by1hcHByb3ZlZCcpO1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlUmVhc29uID0gJ2NvbW1hbmRMaW5lJztcblx0XHRcdFx0XHRpc0F1dG9BcHByb3ZlZCA9IHRydWU7XG5cdFx0XHRcdFx0YXV0b0FwcHJvdmVEZWZhdWx0ID0gaXNBdXRvQXBwcm92ZVJ1bGUoY29tbWFuZExpbmVSZXN1bHQucnVsZSkgPyBjb21tYW5kTGluZVJlc3VsdC5ydWxlLmlzRGVmYXVsdFJ1bGUgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nKCdDb21tYW5kIGxpbmUgTk9UIGF1dG8tYXBwcm92ZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNoZWxsLXN0YXRlIG11dGF0aW9ucyBvbWl0dGVkIGZyb20gbm9ybWFsIGNvbW1hbmQgZXh0cmFjdGlvbiBtdXN0IG5ldmVyXG5cdFx0Ly8gYXV0by1hcHByb3ZlLCBldmVuIHdoZW4gZXZlcnkgZXh0cmFjdGVkIHN1Yi1jb21tYW5kIG1hdGNoZXMgYW4gYWxsb3cgcnVsZS5cblx0XHRpZiAoaGFzVW5hbmFseXphYmxlU3ludGF4KSB7XG5cdFx0XHRpc0F1dG9BcHByb3ZlZCA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIExvZyBkZXRhaWxlZCBhdXRvIGFwcHJvdmFsIHJlYXNvbmluZ1xuXHRcdGZvciAoY29uc3QgcmVhc29uIG9mIGF1dG9BcHByb3ZlUmVhc29ucykge1xuXHRcdFx0dGhpcy5fbG9nKGAtICR7cmVhc29ufWApO1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IGF1dG8gYXBwcm92YWwgb3IgZm9yY2UgaXQgb2ZmIGRlcGVuZGluZyBvbiBlbmFibGVtZW50L29wdC1pbiBzdGF0ZVxuXHRcdGNvbnN0IGlzQXV0b0FwcHJvdmVFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5FbmFibGVBdXRvQXBwcm92ZSkgPT09IHRydWU7XG5cdFx0Y29uc3QgaXNBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMuVGVybWluYWxBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSk7XG5cdFx0aWYgKGlzQXV0b0FwcHJvdmVFbmFibGVkICYmIGlzQXV0b0FwcHJvdmVkKSB7XG5cdFx0XHRhdXRvQXBwcm92ZUluZm8gPSB0aGlzLl9jcmVhdGVBdXRvQXBwcm92ZUluZm8oXG5cdFx0XHRcdGlzQXV0b0FwcHJvdmVkLFxuXHRcdFx0XHRpc0RlbmllZCxcblx0XHRcdFx0YXV0b0FwcHJvdmVSZWFzb24sXG5cdFx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzLFxuXHRcdFx0XHRjb21tYW5kTGluZVJlc3VsdCxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlzQXV0b0FwcHJvdmVkID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gU2VuZCB0ZWxlbWV0cnkgYWJvdXQgYXV0byBhcHByb3ZhbCBwcm9jZXNzXG5cdFx0dGhpcy5fdGVsZW1ldHJ5LmxvZ1ByZXBhcmUoe1xuXHRcdFx0dGVybWluYWxUb29sU2Vzc2lvbklkOiBvcHRpb25zLnRlcm1pbmFsVG9vbFNlc3Npb25JZCxcblx0XHRcdHN1YkNvbW1hbmRzLFxuXHRcdFx0YXV0b0FwcHJvdmVBbGxvd2VkOiAhaXNBdXRvQXBwcm92ZUVuYWJsZWQgPyAnb2ZmJyA6IGlzQXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWQgPyAnYWxsb3dlZCcgOiAnbmVlZHNPcHRJbicsXG5cdFx0XHRhdXRvQXBwcm92ZVJlc3VsdDogaXNBdXRvQXBwcm92ZWQgPyAnYXBwcm92ZWQnIDogaXNEZW5pZWQgPyAnZGVuaWVkJyA6ICdtYW51YWwnLFxuXHRcdFx0YXV0b0FwcHJvdmVSZWFzb24sXG5cdFx0XHRhdXRvQXBwcm92ZURlZmF1bHRcblx0XHR9KTtcblxuXHRcdC8vIFByb21wdCBpbmplY3Rpb24gd2FybmluZyBmb3IgY29tbW9uIGNvbW1hbmRzIHRoYXQgcmV0dXJuIGNvbnRlbnQgZnJvbSB0aGUgd2ViXG5cdFx0Y29uc3QgZGlzY2xhaW1lcnM6IChzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpW10gPSBbXTtcblx0XHRjb25zdCBzdWJDb21tYW5kc0xvd2VyRmlyc3RXb3JkT25seSA9IHN1YkNvbW1hbmRzLm1hcChjb21tYW5kID0+IGNvbW1hbmQuc3BsaXQoJyAnKVswXS50b0xvd2VyQ2FzZSgpKTtcblx0XHRpZiAoIWlzQXV0b0FwcHJvdmVkICYmIChcblx0XHRcdHN1YkNvbW1hbmRzTG93ZXJGaXJzdFdvcmRPbmx5LnNvbWUoY29tbWFuZCA9PiBwcm9tcHRJbmplY3Rpb25XYXJuaW5nQ29tbWFuZHNMb3dlci5pbmNsdWRlcyhjb21tYW5kKSkgfHxcblx0XHRcdChpc1Bvd2VyU2hlbGwob3B0aW9ucy5zaGVsbCwgb3B0aW9ucy5vcykgJiYgc3ViQ29tbWFuZHNMb3dlckZpcnN0V29yZE9ubHkuc29tZShjb21tYW5kID0+IHByb21wdEluamVjdGlvbldhcm5pbmdDb21tYW5kc0xvd2VyUHdzaE9ubHkuaW5jbHVkZXMoY29tbWFuZCkpKVxuXHRcdCkpIHtcblx0XHRcdGRpc2NsYWltZXJzLnB1c2gobG9jYWxpemUoJ3J1bkluVGVybWluYWwucHJvbXB0SW5qZWN0aW9uRGlzY2xhaW1lcicsICdXZWIgY29udGVudCBtYXkgY29udGFpbiBtYWxpY2lvdXMgY29kZSBvciBhdHRlbXB0IHByb21wdCBpbmplY3Rpb24gYXR0YWNrcy4nKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGRlbmlhbCByZWFzb24gdG8gZGlzY2xhaW1lcnMgd2hlbiBhdXRvLWFwcHJvdmUgaXMgZW5hYmxlZCBidXQgY29tbWFuZCB3YXMgZGVuaWVkIGJ5IGEgcnVsZVxuXHRcdGlmIChpc0F1dG9BcHByb3ZlRW5hYmxlZCAmJiBpc0RlbmllZCkge1xuXHRcdFx0Y29uc3QgZGVuaWFsSW5mbyA9IHRoaXMuX2NyZWF0ZUF1dG9BcHByb3ZlSW5mbyhcblx0XHRcdFx0aXNBdXRvQXBwcm92ZWQsXG5cdFx0XHRcdGlzRGVuaWVkLFxuXHRcdFx0XHRhdXRvQXBwcm92ZVJlYXNvbixcblx0XHRcdFx0c3ViQ29tbWFuZFJlc3VsdHMsXG5cdFx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0LFxuXHRcdFx0KTtcblx0XHRcdGlmIChkZW5pYWxJbmZvKSB7XG5cdFx0XHRcdGRpc2NsYWltZXJzLnB1c2goZGVuaWFsSW5mbyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVW5hbmFseXphYmxlIHNoZWxsLXN0YXRlIHN5bnRheCBjYW5ub3QgYmUgZXhwcmVzc2VkIGFzIGEgc2FmZSBwZXJzaXN0ZW50IHJ1bGUuXG5cdFx0aWYgKCFpc0F1dG9BcHByb3ZlZCAmJiBpc0F1dG9BcHByb3ZlRW5hYmxlZCAmJiAhaGFzVW5hbmFseXphYmxlU3ludGF4KSB7XG5cdFx0XHRjdXN0b21BY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnModHJpbW1lZENvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgeyBzdWJDb21tYW5kUmVzdWx0cywgY29tbWFuZExpbmVSZXN1bHQgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzQXV0b0FwcHJvdmVkLFxuXHRcdFx0Ly8gRGVuaWVkIHJ1bGVzIHN0YXkgY29uZmlndXJhYmxlOyB1bmFuYWx5emFibGUgc3ludGF4IGNhbm5vdCBiZSBhdXRvLWFwcHJvdmVkIHNhZmVseS5cblx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkOiAhaGFzVW5hbmFseXphYmxlU3ludGF4LFxuXHRcdFx0ZGlzY2xhaW1lcnMsXG5cdFx0XHRhdXRvQXBwcm92ZUluZm8sXG5cdFx0XHRjdXN0b21BY3Rpb25zLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVBdXRvQXBwcm92ZUluZm8oXG5cdFx0aXNBdXRvQXBwcm92ZWQ6IGJvb2xlYW4sXG5cdFx0aXNEZW5pZWQ6IGJvb2xlYW4sXG5cdFx0YXV0b0FwcHJvdmVSZWFzb246ICdzdWJDb21tYW5kJyB8ICdjb21tYW5kTGluZScgfCB1bmRlZmluZWQsXG5cdFx0c3ViQ29tbWFuZFJlc3VsdHM6IElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uW10sXG5cdFx0Y29tbWFuZExpbmVSZXN1bHQ6IElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uLFxuXHQpOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZvcm1hdFJ1bGVMaW5rcyA9IChyZXN1bHQ6IFNpbmdsZU9yTWFueTxJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbj4pOiBzdHJpbmcgPT4ge1xuXHRcdFx0cmV0dXJuIGFzQXJyYXkocmVzdWx0KVxuXHRcdFx0XHQuZmlsdGVyKChlKTogZSBpcyBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbiAmIHsgcnVsZTogSUF1dG9BcHByb3ZlUnVsZSB9ID0+XG5cdFx0XHRcdFx0aXNBdXRvQXBwcm92ZVJ1bGUoZS5ydWxlKSlcblx0XHRcdFx0Lm1hcChlID0+IHtcblx0XHRcdFx0XHQvLyBTZXNzaW9uIHJ1bGVzIGNhbm5vdCBiZSBhY3Rpb25lZCBjdXJyZW50bHkgc28gbm8gbGlua1xuXHRcdFx0XHRcdGNvbnN0IGVzY2FwZWRTb3VyY2VUZXh0ID0gZS5ydWxlLnNvdXJjZVRleHQucmVwbGFjZUFsbCgnJCcsICdcXFxcJCcpO1xuXHRcdFx0XHRcdGlmIChlLnJ1bGUuc291cmNlVGFyZ2V0ID09PSAnc2Vzc2lvbicpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmVSdWxlLnNlc3Npb25JbmRpY2F0b3InLCAnezB9IChzZXNzaW9uKScsIGBcXGAke2VzY2FwZWRTb3VyY2VUZXh0fVxcYGApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBzZXR0aW5nc1VyaSA9IGNyZWF0ZUNvbW1hbmRVcmkoVGVybWluYWxDaGF0Q29tbWFuZElkLk9wZW5UZXJtaW5hbFNldHRpbmdzTGluaywgZS5ydWxlLnNvdXJjZVRhcmdldCk7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbHRpcCA9IGxvY2FsaXplKCdydWxlVG9vbHRpcCcsICdWaWV3IHJ1bGUgaW4gc2V0dGluZ3MnKTtcblx0XHRcdFx0XHRsZXQgbGFiZWwgPSBlc2NhcGVkU291cmNlVGV4dDtcblx0XHRcdFx0XHRzd2l0Y2ggKGUucnVsZT8uc291cmNlVGFyZ2V0KSB7XG5cdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVDpcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBgJHtsYWJlbH0gKGRlZmF1bHQpYDtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjpcblx0XHRcdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGAke2xhYmVsfSAodXNlcilgO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBgJHtsYWJlbH0gKHJlbW90ZSlgO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjpcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBgJHtsYWJlbH0gKHdvcmtzcGFjZSlgO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGBbXFxgJHtsYWJlbH1cXGBdKCR7c2V0dGluZ3NVcmkudG9TdHJpbmcoKX0gXCIke3Rvb2x0aXB9XCIpYDtcblx0XHRcdFx0fSkuam9pbignLCAnKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbWRUcnVzdFNldHRpbmdzID0ge1xuXHRcdFx0aXNUcnVzdGVkOiB7XG5cdFx0XHRcdGVuYWJsZWRDb21tYW5kczogW1Rlcm1pbmFsQ2hhdENvbW1hbmRJZC5PcGVuVGVybWluYWxTZXR0aW5nc0xpbmtdXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbiB8IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PihDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZSk7XG5cdFx0Y29uc3QgaXNHbG9iYWxBdXRvQXBwcm92ZWQgPSBjb25maWc/LnZhbHVlID8/IGNvbmZpZy5kZWZhdWx0VmFsdWU7XG5cdFx0aWYgKGlzR2xvYmFsQXV0b0FwcHJvdmVkKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nc1VyaSA9IGNyZWF0ZUNvbW1hbmRVcmkoVGVybWluYWxDaGF0Q29tbWFuZElkLk9wZW5UZXJtaW5hbFNldHRpbmdzTGluaywgJ2dsb2JhbCcpO1xuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZ2xvYmFsJywgJ0F1dG8gYXBwcm92ZWQgYnkgc2V0dGluZyB7MH0nLCBgW1xcYCR7Q2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmV9XFxgXSgke3NldHRpbmdzVXJpLnRvU3RyaW5nKCl9IFwiJHtsb2NhbGl6ZSgncnVsZVRvb2x0aXAuZ2xvYmFsJywgJ1ZpZXcgc2V0dGluZ3MnKX1cIilgKX1gLCBtZFRydXN0U2V0dGluZ3MpO1xuXHRcdH1cblxuXHRcdGlmIChpc0F1dG9BcHByb3ZlZCkge1xuXHRcdFx0c3dpdGNoIChhdXRvQXBwcm92ZVJlYXNvbikge1xuXHRcdFx0XHRjYXNlICdjb21tYW5kTGluZSc6IHtcblx0XHRcdFx0XHRpZiAoaXNBdXRvQXBwcm92ZVJ1bGUoY29tbWFuZExpbmVSZXN1bHQucnVsZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2F1dG9BcHByb3ZlLnJ1bGUnLCAnQXV0byBhcHByb3ZlZCBieSBydWxlIHswfScsIGZvcm1hdFJ1bGVMaW5rcyhjb21tYW5kTGluZVJlc3VsdCkpLCBtZFRydXN0U2V0dGluZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlICdzdWJDb21tYW5kJzoge1xuXHRcdFx0XHRcdC8vIENoZWNrIGlmIGFwcHJvdmFsIGNhbWUgZnJvbSBucG0gc2NyaXB0XG5cdFx0XHRcdFx0Y29uc3QgbnBtU2NyaXB0QXBwcm92YWwgPSBzdWJDb21tYW5kUmVzdWx0cy5maW5kKGUgPT4gaXNOcG1TY3JpcHRBdXRvQXBwcm92ZVJ1bGUoZS5ydWxlKSk7XG5cdFx0XHRcdFx0aWYgKG5wbVNjcmlwdEFwcHJvdmFsICYmIGlzTnBtU2NyaXB0QXV0b0FwcHJvdmVSdWxlKG5wbVNjcmlwdEFwcHJvdmFsLnJ1bGUpICYmIG5wbVNjcmlwdEFwcHJvdmFsLnJ1bGUubnBtU2NyaXB0UmVzdWx0LmF1dG9BcHByb3ZlSW5mbykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5wbVNjcmlwdEFwcHJvdmFsLnJ1bGUubnBtU2NyaXB0UmVzdWx0LmF1dG9BcHByb3ZlSW5mbztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgdW5pcXVlUnVsZXMgPSBkZWR1cGVSdWxlcyhzdWJDb21tYW5kUmVzdWx0cyk7XG5cdFx0XHRcdFx0aWYgKHVuaXF1ZVJ1bGVzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYXV0b0FwcHJvdmUucnVsZScsICdBdXRvIGFwcHJvdmVkIGJ5IHJ1bGUgezB9JywgZm9ybWF0UnVsZUxpbmtzKHVuaXF1ZVJ1bGVzKSksIG1kVHJ1c3RTZXR0aW5ncyk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh1bmlxdWVSdWxlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdhdXRvQXBwcm92ZS5ydWxlcycsICdBdXRvIGFwcHJvdmVkIGJ5IHJ1bGVzIHswfScsIGZvcm1hdFJ1bGVMaW5rcyh1bmlxdWVSdWxlcykpLCBtZFRydXN0U2V0dGluZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNEZW5pZWQpIHtcblx0XHRcdHN3aXRjaCAoYXV0b0FwcHJvdmVSZWFzb24pIHtcblx0XHRcdFx0Y2FzZSAnY29tbWFuZExpbmUnOiB7XG5cdFx0XHRcdFx0aWYgKGNvbW1hbmRMaW5lUmVzdWx0LnJ1bGUpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2F1dG9BcHByb3ZlRGVuaWVkLnJ1bGUnLCAnQXV0byBhcHByb3ZhbCBkZW5pZWQgYnkgcnVsZSB7MH0nLCBmb3JtYXRSdWxlTGlua3MoY29tbWFuZExpbmVSZXN1bHQpKSwgbWRUcnVzdFNldHRpbmdzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnc3ViQ29tbWFuZCc6IHtcblx0XHRcdFx0XHRjb25zdCB1bmlxdWVSdWxlcyA9IGRlZHVwZVJ1bGVzKHN1YkNvbW1hbmRSZXN1bHRzLmZpbHRlcihlID0+IGUucmVzdWx0ID09PSAnZGVuaWVkJykpO1xuXHRcdFx0XHRcdGlmICh1bmlxdWVSdWxlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2F1dG9BcHByb3ZlRGVuaWVkLnJ1bGUnLCAnQXV0byBhcHByb3ZhbCBkZW5pZWQgYnkgcnVsZSB7MH0nLCBmb3JtYXRSdWxlTGlua3ModW5pcXVlUnVsZXMpKSwgbWRUcnVzdFNldHRpbmdzKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHVuaXF1ZVJ1bGVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2F1dG9BcHByb3ZlRGVuaWVkLnJ1bGVzJywgJ0F1dG8gYXBwcm92YWwgZGVuaWVkIGJ5IHJ1bGVzIHswfScsIGZvcm1hdFJ1bGVMaW5rcyh1bmlxdWVSdWxlcykpLCBtZFRydXN0U2V0dGluZ3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCLHNCQUE0QztBQUN2RSxTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsYUFBYSw0QkFBNEIsb0JBQW9CO0FBR3RFLFNBQThILG1CQUFtQixrQ0FBa0M7QUFDbkwsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBc0U7QUFFL0UsTUFBTSxzQ0FBc0M7QUFBQSxFQUMzQztBQUFBLEVBQ0E7QUFDRDtBQUNBLE1BQU0sOENBQThDO0FBQUEsRUFDbkQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFDRDtBQUVPLElBQU0saUNBQU4sY0FBNkMsV0FBMkM7QUFBQSxFQUc5RixZQUNrQiwwQkFDQSxZQUNBLE1BQ3VCLHVCQUNqQixzQkFDVyxpQkFDSyxzQkFDdEM7QUFDRCxVQUFNO0FBUlc7QUFDQTtBQUNBO0FBQ3VCO0FBRU47QUFDSztBQUd2QyxTQUFLLDJCQUEyQixLQUFLLFVBQVUscUJBQXFCLGVBQWUsdUJBQXVCLENBQUM7QUFBQSxFQUM1RztBQUFBLEVBRUEsTUFBTSxRQUFRLFNBQTJFO0FBQ3hGLFVBQU0saUNBQWlDLEtBQUssc0JBQXNCLFNBQWtCLGdDQUFnQyxpQkFBaUIsTUFBTTtBQUMzSSxRQUFJLGtDQUFrQyxRQUFRLHVCQUF1QixLQUFLLHFC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
