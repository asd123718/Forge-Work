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
import { append, DisposableResizeObserver, getWindow, h } from "../../../../../../../base/browser/dom.js";
import { HoverStyle } from "../../../../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../../../../base/browser/ui/hover/hoverWidget.js";
import { Separator } from "../../../../../../../base/common/actions.js";
import { asArray } from "../../../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { ErrorNoTelemetry, onUnexpectedError } from "../../../../../../../base/common/errors.js";
import { createCommandUri, escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import Severity from "../../../../../../../base/common/severity.js";
import { isObject } from "../../../../../../../base/common/types.js";
import { ILanguageService } from "../../../../../../../editor/common/languages/language.js";
import { localize } from "../../../../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../../platform/storage/common/storage.js";
import { IPreferencesService } from "../../../../../../services/preferences/common/preferences.js";
import { ITerminalChatService } from "../../../../../terminal/browser/terminal.js";
import { TerminalContribCommandId, TerminalContribSettingId } from "../../../../../terminal/terminalContribExports.js";
import { ChatContextKeys } from "../../../../common/actions/chatContextKeys.js";
import { migrateLegacyTerminalToolSpecificData } from "../../../../common/chat.js";
import { SessionType } from "../../../../common/chatSessionsService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsService } from "../../../../common/tools/languageModelToolsService.js";
import { AcceptToolConfirmationActionId, SkipToolConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatCustomConfirmationWidget } from "../chatConfirmationWidget.js";
import { ChatMarkdownContentPart } from "../chatMarkdownContentPart.js";
import { CodeBlockPart } from "../codeBlockPart.js";
import { BaseChatToolInvocationSubPart } from "./chatToolInvocationSubPart.js";
import { createApprovalReasonBadge, createToolRiskBadge } from "./toolRiskBadgeHelper.js";
var TerminalToolConfirmationStorageKeys = /* @__PURE__ */ ((TerminalToolConfirmationStorageKeys2) => {
  TerminalToolConfirmationStorageKeys2["TerminalAutoApproveWarningAccepted"] = "chat.tools.terminal.autoApprove.warningAccepted";
  return TerminalToolConfirmationStorageKeys2;
})(TerminalToolConfirmationStorageKeys || {});
let ChatTerminalToolConfirmationSubPart = class extends BaseChatToolInvocationSubPart {
  constructor(toolInvocation, terminalData, context, renderer, editorPool, currentWidthDelegate, codeBlockStartIndex, instantiationService, dialogService, keybindingService, languageService, configurationService, contextKeyService, chatWidgetService, preferencesService, storageService, terminalChatService, hoverService, languageModelToolsService, riskAssessmentService) {
    super(toolInvocation);
    this.context = context;
    this.renderer = renderer;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.codeBlockStartIndex = codeBlockStartIndex;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.keybindingService = keybindingService;
    this.languageService = languageService;
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.chatWidgetService = chatWidgetService;
    this.preferencesService = preferencesService;
    this.storageService = storageService;
    this.terminalChatService = terminalChatService;
    this.languageModelToolsService = languageModelToolsService;
    this.riskAssessmentService = riskAssessmentService;
    this.codeblocks = [];
    const state = toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
      throw new Error("Confirmation messages are missing");
    }
    terminalData = migrateLegacyTerminalToolSpecificData(terminalData);
    const { title, message, disclaimer, terminalCustomActions } = state.confirmationMessages;
    const initialContent = terminalData.presentationOverrides?.commandLine ?? terminalData.confirmation?.commandLine ?? (terminalData.commandLine.toolEdited ?? terminalData.commandLine.original).trimStart();
    const cdPrefix = terminalData.confirmation?.cdPrefix ?? "";
    const isReadOnly = !!terminalData.presentationOverrides;
    const autoApproveEnabled = this.configurationService.getValue(TerminalContribSettingId.EnableAutoApprove) === true;
    let customActions = terminalCustomActions;
    const buildMoreActions = () => {
      if (!autoApproveEnabled) {
        return void 0;
      }
      const autoApproveWarningAccepted = this.storageService.getBoolean("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalAutoApproveWarningAccepted */, StorageScope.APPLICATION, false);
      const moreActions = [];
      if (!autoApproveWarningAccepted) {
        moreActions.push({
          label: localize("autoApprove.enable", "Enable Auto Approve..."),
          data: {
            type: "enable"
          }
        });
        moreActions.push(new Separator());
        if (customActions) {
          for (const action of customActions) {
            if (!(action instanceof Separator)) {
              action.disabled = true;
            }
          }
        }
      }
      if (customActions) {
        moreActions.push(...customActions);
      }
      return moreActions.length === 0 ? void 0 : moreActions;
    };
    const codeBlockRenderOptions = {
      hideToolbar: true,
      reserveWidth: 19,
      verticalPadding: 5,
      editorOptions: {
        wordWrap: "on",
        readOnly: isReadOnly,
        tabFocusMode: true,
        ariaLabel: typeof title === "string" ? title : title.value
      }
    };
    const languageId = this.languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language ?? "sh") ?? "shellscript";
    const key = CodeBlockPart.poolKey(this.context.element.id, this.codeBlockStartIndex);
    const editor = this._register(this.editorPool.get(key));
    editor.object.render({
      codeBlockIndex: this.codeBlockStartIndex,
      element: this.context.element,
      languageId,
      text: initialContent,
      renderOptions: codeBlockRenderOptions,
      chatSessionResource: this.context.element.sessionResource
    }, this.currentWidthDelegate());
    const model = editor.object.editor.getModel();
    this.codeblocks.push({
      codeBlockIndex: this.codeBlockStartIndex,
      codemapperUri: void 0,
      elementId: this.context.element.id,
      focus: () => editor.object.focus(),
      ownerMarkdownPartId: this.codeblocksPartId,
      uri: model.uri,
      chatSessionResource: this.context.element.sessionResource
    });
    this._register(model.onDidChangeContent(() => {
      const currentValue = model.getValue();
      if (currentValue !== initialContent) {
        terminalData.commandLine.userEdited = cdPrefix + currentValue;
      } else {
        terminalData.commandLine.userEdited = void 0;
      }
    }));
    const elements = h(".chat-confirmation-message-terminal", [
      h(".chat-confirmation-message-terminal-editor@editor"),
      h(".chat-confirmation-message-terminal-disclaimer@disclaimer")
    ]);
    append(elements.editor, editor.object.element);
    const editorResizeObserver = this._register(new DisposableResizeObserver("ChatTerminalToolConfirmationSubPart.editor", (entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        editor.object.layout(width);
      }
    }, getWindow(this.context.container)));
    this._register(editorResizeObserver.observe(elements.editor));
    this._register(hoverService.setupDelayedHover(elements.editor, {
      content: message || "",
      style: HoverStyle.Pointer,
      position: { hoverPosition: HoverPosition.LEFT }
    }));
    const riskBadge = createApprovalReasonBadge(this._store, this.instantiationService, state.confirmationMessages.approvalReason) ?? createToolRiskBadge(this._store, this.instantiationService, this.riskAssessmentService, this.languageModelToolsService, this.toolInvocation.toolId, state.parameters, "terminal");
    const confirmWidget = this._register(this.instantiationService.createInstance(
      ChatCustomConfirmationWidget,
      this.context,
      {
        title,
        icon: Codicon.terminal,
        message: elements.root,
        footerBanner: riskBadge?.domNode,
        buttons: this._createButtons(buildMoreActions())
      }
    ));
    if (autoApproveEnabled && !customActions && terminalData.autoApproveRuleResolvable && getChatSessionType(this.context.element.sessionResource) === SessionType.AgentHostCopilot) {
      const commandForAnalysis = terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
      const analysisLanguage = terminalData.language === "powershell" ? "powershell" : "shellscript";
      this.terminalChatService.getAutoApproveActions(commandForAnalysis, analysisLanguage).then((actions) => {
        if (this._store.isDisposed || !actions?.length) {
          return;
        }
        if (toolInvocation.state.get().type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
          return;
        }
        customActions = actions;
        confirmWidget.updateButtons(this._createButtons(buildMoreActions()));
      }, onUnexpectedError);
    }
    const detailParts = [];
    if (terminalData.requestUnsandboxedExecution) {
      const reasonText = terminalData.requestUnsandboxedExecutionReason && terminalData.requestUnsandboxedExecutionReason.trim() || localize("chat.terminal.unsandboxedExecution.defaultReason", "The model did not provide a reason for requesting unsandboxed execution.");
      const inline = new MarkdownString(void 0, { supportThemeIcons: true });
      inline.appendMarkdown(`$(${Codicon.info.id}) `);
      inline.appendText(reasonText);
      detailParts.push({
        inline,
        hoverLabel: localize("chat.terminal.detail.sandboxInsufficient", "Sandbox insufficient:"),
        hoverBody: escapeMarkdownSyntaxTokens(reasonText),
        isTrusted: void 0
      });
    }
    if (terminalData.requestAllowNetwork) {
      const reasonText = terminalData.requestAllowNetworkReason && terminalData.requestAllowNetworkReason.trim() || localize("chat.terminal.allowNetwork.defaultReason", "The model did not provide a reason for requesting unrestricted network access in the sandbox.");
      const inline = new MarkdownString(void 0, { supportThemeIcons: true });
      inline.appendMarkdown(`$(${Codicon.info.id}) `);
      inline.appendText(reasonText);
      detailParts.push({
        inline,
        hoverLabel: localize("chat.terminal.detail.unrestrictedNetwork", "Unrestricted network access:"),
        hoverBody: escapeMarkdownSyntaxTokens(reasonText),
        isTrusted: void 0
      });
    }
    if (disclaimer) {
      const inline = typeof disclaimer === "string" ? new MarkdownString(disclaimer) : disclaimer;
      const hoverBody = inline.value.replace(/^\s*\$\([^)]+\)\s*/, "");
      detailParts.push({
        inline,
        hoverLabel: localize("chat.terminal.detail.approvalNeeded", "Approval needed:"),
        hoverBody,
        isTrusted: inline.isTrusted
      });
    }
    const renderInlineDisclaimers = () => {
      elements.disclaimer.replaceChildren();
      for (const part of detailParts) {
        this._appendMarkdownPart(elements.disclaimer, part.inline, codeBlockRenderOptions);
      }
    };
    if (riskBadge && detailParts.length) {
      const combined = new MarkdownString(void 0, {
        supportThemeIcons: true,
        isTrusted: detailParts.reduce((acc, part) => {
          if (part.isTrusted === true || acc === true) {
            return true;
          }
          if (typeof part.isTrusted === "object" && part.isTrusted) {
            const enabled = /* @__PURE__ */ new Set([
              ...typeof acc === "object" && acc?.enabledCommands ? acc.enabledCommands : [],
              ...part.isTrusted.enabledCommands
            ]);
            return { enabledCommands: [...enabled] };
          }
          return acc;
        }, void 0)
      });
      detailParts.forEach((part, i) => {
        if (i > 0) {
          combined.appendMarkdown("\n\n");
        }
        combined.appendMarkdown(`**${escapeMarkdownSyntaxTokens(part.hoverLabel)}** ${part.hoverBody}`);
      });
      riskBadge.setDetails(combined);
      this._register(riskBadge.onDidHide(() => renderInlineDisclaimers()));
    } else {
      renderInlineDisclaimers();
    }
    const hasToolConfirmationKey = ChatContextKeys.Editing.hasToolConfirmation.bindTo(this.contextKeyService);
    hasToolConfirmationKey.set(true);
    this._register(toDisposable(() => hasToolConfirmationKey.reset()));
    this._register(confirmWidget.onDidClick(async ({ button, isTouchClick }) => {
      let doComplete = true;
      const data = button.data;
      let toolConfirmKind = ToolConfirmKind.Denied;
      if (typeof data === "boolean") {
        if (data) {
          toolConfirmKind = ToolConfirmKind.UserAction;
          if (terminalData.autoApproveInfo) {
            terminalData.autoApproveInfo = void 0;
          }
        }
      } else if (typeof data !== "boolean") {
        switch (data.type) {
          case "enable": {
            const optedIn = await this._showAutoApproveWarning();
            if (optedIn) {
              this.storageService.store("chat.tools.terminal.autoApprove.warningAccepted" /* TerminalAutoApproveWarningAccepted */, true, StorageScope.APPLICATION, StorageTarget.USER);
              if (terminalData.autoApproveInfo) {
                toolConfirmKind = ToolConfirmKind.UserAction;
              } else {
                if (customActions) {
                  for (const action of customActions) {
                    if (!(action instanceof Separator)) {
                      action.disabled = false;
                    }
                  }
                }
                confirmWidget.updateButtons(this._createButtons(buildMoreActions()));
                doComplete = false;
              }
            } else {
              doComplete = false;
            }
            break;
          }
          case "skip": {
            toolConfirmKind = ToolConfirmKind.Skipped;
            break;
          }
          case "newRule": {
            let formatRuleLinks2 = function(rules, scope) {
              return rules.map((e) => {
                if (scope === "session") {
                  return `\`${e.key}\``;
                }
                const target = scope === "workspace" ? ConfigurationTarget.WORKSPACE : ConfigurationTarget.USER;
                const settingsUri = createCommandUri(TerminalContribCommandId.OpenTerminalSettingsLink, target);
                return `[\`${e.key}\`](${settingsUri.toString()} "${localize("ruleTooltip", "View rule in settings")}")`;
              }).join(", ");
            };
            var formatRuleLinks = formatRuleLinks2;
            const newRules = asArray(data.rule);
            const sessionRules = newRules.filter((r) => r.scope === "session");
            const workspaceRules = newRules.filter((r) => r.scope === "workspace");
            const userRules = newRules.filter((r) => r.scope === "user");
            const chatSessionResource = this.context.element.sessionResource;
            for (const rule of sessionRules) {
              this.terminalChatService.addSessionAutoApproveRule(chatSessionResource, rule.key, rule.value);
            }
            if (workspaceRules.length > 0) {
              const inspect = this.configurationService.inspect(TerminalContribSettingId.AutoApprove);
              const oldValue = inspect.workspaceValue ?? {};
              if (isObject(oldValue)) {
                const newValue = { ...oldValue };
                for (const rule of workspaceRules) {
                  newValue[rule.key] = rule.value;
                }
                await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue, ConfigurationTarget.WORKSPACE);
              } else {
                this.preferencesService.openSettings({
                  jsonEditor: true,
                  target: ConfigurationTarget.WORKSPACE,
                  revealSetting: { key: TerminalContribSettingId.AutoApprove }
                });
                throw new ErrorNoTelemetry(`Cannot add new rule, existing workspace setting is unexpected format`);
              }
            }
            if (userRules.length > 0) {
              const inspect = this.configurationService.inspect(TerminalContribSettingId.AutoApprove);
              const oldValue = inspect.userValue ?? {};
              if (isObject(oldValue)) {
                const newValue = { ...oldValue };
                for (const rule of userRules) {
                  newValue[rule.key] = rule.value;
                }
                await this.configurationService.updateValue(TerminalContribSettingId.AutoApprove, newValue, ConfigurationTarget.USER);
              } else {
                this.preferencesService.openSettings({
                  jsonEditor: true,
                  target: ConfigurationTarget.USER,
                  revealSetting: { key: TerminalContribSettingId.AutoApprove }
                });
                throw new ErrorNoTelemetry(`Cannot add new rule, existing setting is unexpected format`);
              }
            }
            const mdTrustSettings = {
              isTrusted: {
                enabledCommands: [TerminalContribCommandId.OpenTerminalSettingsLink]
              }
            };
            const parts = [];
            if (sessionRules.length > 0) {
              parts.push(sessionRules.length === 1 ? localize("newRule.session", "Session auto approve rule {0} added", formatRuleLinks2(sessionRules, "session")) : localize("newRule.session.plural", "Session auto approve rules {0} added", formatRuleLinks2(sessionRules, "session")));
            }
            if (workspaceRules.length > 0) {
              parts.push(workspaceRules.length === 1 ? localize("newRule.workspace", "Workspace auto approve rule {0} added", formatRuleLinks2(workspaceRules, "workspace")) : localize("newRule.workspace.plural", "Workspace auto approve rules {0} added", formatRuleLinks2(workspaceRules, "workspace")));
            }
            if (userRules.length > 0) {
              parts.push(userRules.length === 1 ? localize("newRule.user", "User auto approve rule {0} added", formatRuleLinks2(userRules, "user")) : localize("newRule.user.plural", "User auto approve rules {0} added", formatRuleLinks2(userRules, "user")));
            }
            if (parts.length > 0) {
              terminalData.autoApproveInfo = new MarkdownString(parts.join(", "), mdTrustSettings);
            }
            toolConfirmKind = ToolConfirmKind.UserAction;
            break;
          }
          case "configure": {
            this.preferencesService.openSettings({
              target: ConfigurationTarget.USER,
              query: `@id:${TerminalContribSettingId.AutoApprove}`
            });
            doComplete = false;
            break;
          }
          case "sessionApproval": {
            const sessionResource = this.context.element.sessionResource;
            this.terminalChatService.setChatSessionAutoApproval(sessionResource, true);
            const disableUri = createCommandUri(TerminalContribCommandId.DisableSessionAutoApproval, sessionResource);
            const mdTrustSettings = {
              isTrusted: {
                enabledCommands: [TerminalContribCommandId.DisableSessionAutoApproval]
              }
            };
            terminalData.autoApproveInfo = new MarkdownString(`${localize("sessionApproval", "All commands will be auto approved for this session")} ([${localize("sessionApproval.disable", "Disable")}](${disableUri.toString()}))`, mdTrustSettings);
            toolConfirmKind = ToolConfirmKind.UserAction;
            break;
          }
        }
      }
      if (doComplete) {
        IChatToolInvocation.confirmWith(toolInvocation, { type: toolConfirmKind });
        if (!isTouchClick) {
          this.chatWidgetService.getWidgetBySessionResource(this.context.element.sessionResource)?.focusInput();
        }
      }
    }));
    this.domNode = confirmWidget.domNode;
  }
  _createButtons(moreActions) {
    const getLabelAndTooltip = (label, actionId, tooltipDetail = label) => {
      const tooltip = this.keybindingService.appendKeybinding(tooltipDetail, actionId);
      return { label, tooltip };
    };
    return [
      {
        ...getLabelAndTooltip(localize("tool.allow", "Allow"), AcceptToolConfirmationActionId),
        data: true,
        moreActions
      },
      {
        ...getLabelAndTooltip(localize("tool.skip", "Skip"), SkipToolConfirmationActionId, localize("skip.detail", "Proceed without executing this command")),
        data: { type: "skip" },
        isSecondary: true
      }
    ];
  }
  async _showAutoApproveWarning() {
    const promptResult = await this.dialogService.prompt({
      type: Severity.Info,
      message: localize("autoApprove.title", "Enable terminal auto approve?"),
      buttons: [{
        label: localize("autoApprove.button.enable", "Enable"),
        run: () => true
      }],
      cancelButton: true,
      custom: {
        icon: Codicon.shield,
        markdownDetails: [{
          markdown: new MarkdownString(localize("autoApprove.markdown", "This will enable a configurable subset of commands to run in the terminal autonomously. It provides *best effort protections* and assumes the agent is not acting maliciously."))
        }, {
          markdown: new MarkdownString(`[${localize("autoApprove.markdown2", "Learn more about the potential risks and how to avoid them.")}](https://code.visualstudio.com/docs/agents/run/security?referrer=in-product#_security-risks-to-be-aware-of)`)
        }]
      }
    });
    return promptResult.result === true;
  }
  _appendMarkdownPart(container, message, codeBlockRenderOptions) {
    const part = this._register(this.instantiationService.createInstance(
      ChatMarkdownContentPart,
      {
        kind: "markdownContent",
        content: typeof message === "string" ? new MarkdownString().appendMarkdown(message) : message
      },
      this.context,
      this.editorPool,
      false,
      this.codeBlockStartIndex,
      this.renderer,
      void 0,
      this.currentWidthDelegate(),
      { codeBlockRenderOptions }
    ));
    append(container, part.domNode);
  }
};
ChatTerminalToolConfirmationSubPart = __decorateClass([
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, ILanguageService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IContextKeyService),
  __decorateParam(13, IChatWidgetService),
  __decorateParam(14, IPreferencesService),
  __decorateParam(15, IStorageService),
  __decorateParam(16, ITerminalChatService),
  __decorateParam(17, IHoverService),
  __decorateParam(18, ILanguageModelToolsService),
  __decorateParam(19, IChatToolRiskAssessmentService)
], ChatTerminalToolConfirmationSubPart);
export {
  ChatTerminalToolConfirmationSubPart,
  TerminalToolConfirmationStorageKeys
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN1YlBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhcHBlbmQsIERpc3Bvc2FibGVSZXNpemVPYnNlcnZlciwgZ2V0V2luZG93LCBoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IEhvdmVyUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFcnJvck5vVGVsZW1ldHJ5LCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb21tYW5kVXJpLCBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucywgTWFya2Rvd25TdHJpbmcsIHR5cGUgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb250cmliQ29tbWFuZElkLCBUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXJtaW5hbC90ZXJtaW5hbENvbnRyaWJFeHBvcnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQsIHR5cGUgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgdHlwZSBJTGVnYWN5Q2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXB0VG9vbENvbmZpcm1hdGlvbkFjdGlvbklkLCBTa2lwVG9vbENvbmZpcm1hdGlvbkFjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYWN0aW9ucy9jaGF0VG9vbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDdXN0b21Db25maXJtYXRpb25XaWRnZXQsIElDaGF0Q29uZmlybWF0aW9uQnV0dG9uIH0gZnJvbSAnLi4vY2hhdENvbmZpcm1hdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQb29sIH0gZnJvbSAnLi4vY2hhdENvbnRlbnRDb2RlUG9vbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzLmpzJztcbmltcG9ydCB7IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vY2hhdE1hcmtkb3duQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ29kZUJsb2NrUGFydCwgSUNvZGVCbG9ja1JlbmRlck9wdGlvbnMgfSBmcm9tICcuLi9jb2RlQmxvY2tQYXJ0LmpzJztcbmltcG9ydCB7IEJhc2VDaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbEludm9jYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IGNyZWF0ZUFwcHJvdmFsUmVhc29uQmFkZ2UsIGNyZWF0ZVRvb2xSaXNrQmFkZ2UgfSBmcm9tICcuL3Rvb2xSaXNrQmFkZ2VIZWxwZXIuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cyB7XG5cdFRlcm1pbmFsQXV0b0FwcHJvdmVXYXJuaW5nQWNjZXB0ZWQgPSAnY2hhdC50b29scy50ZXJtaW5hbC5hdXRvQXBwcm92ZS53YXJuaW5nQWNjZXB0ZWQnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsTmV3QXV0b0FwcHJvdmVSdWxlIHtcblx0a2V5OiBzdHJpbmc7XG5cdHZhbHVlOiBib29sZWFuIHwge1xuXHRcdGFwcHJvdmU6IGJvb2xlYW47XG5cdFx0bWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW47XG5cdH07XG5cdHNjb3BlOiAnc2Vzc2lvbicgfCAnd29ya3NwYWNlJyB8ICd1c2VyJztcbn1cblxuZXhwb3J0IHR5cGUgVGVybWluYWxOZXdBdXRvQXBwcm92ZUJ1dHRvbkRhdGEgPSAoXG5cdHsgdHlwZTogJ2VuYWJsZScgfSB8XG5cdHsgdHlwZTogJ2NvbmZpZ3VyZScgfSB8XG5cdHsgdHlwZTogJ3NraXAnIH0gfFxuXHR7IHR5cGU6ICduZXdSdWxlJzsgcnVsZTogSVRlcm1pbmFsTmV3QXV0b0FwcHJvdmVSdWxlIHwgSVRlcm1pbmFsTmV3QXV0b0FwcHJvdmVSdWxlW10gfSB8XG5cdHsgdHlwZTogJ3Nlc3Npb25BcHByb3ZhbCcgfVxuKTtcblxuZXhwb3J0IGNsYXNzIENoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IGV4dGVuZHMgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHB1YmxpYyByZWFkb25seSBjb2RlYmxvY2tzOiBJQ2hhdENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdHRlcm1pbmFsRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB8IElMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBvb2w6IEVkaXRvclBvb2wsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjdXJyZW50V2lkdGhEZWxlZ2F0ZTogKCkgPT4gbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlcm1pbmFsQ2hhdFNlcnZpY2U6IElUZXJtaW5hbENoYXRTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmlza0Fzc2Vzc21lbnRTZXJ2aWNlOiBJQ2hhdFRvb2xSaXNrQXNzZXNzbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHRvb2xJbnZvY2F0aW9uKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gfHwgIXN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb25maXJtYXRpb24gbWVzc2FnZXMgYXJlIG1pc3NpbmcnKTtcblx0XHR9XG5cblx0XHR0ZXJtaW5hbERhdGEgPSBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRlcm1pbmFsRGF0YSk7XG5cblx0XHRjb25zdCB7IHRpdGxlLCBtZXNzYWdlLCBkaXNjbGFpbWVyLCB0ZXJtaW5hbEN1c3RvbUFjdGlvbnMgfSA9IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzO1xuXG5cdFx0Ly8gVXNlIHByZS1jb21wdXRlZCBjb25maXJtYXRpb24gZGF0YSBmcm9tIHJ1bkluVGVybWluYWxUb29sIChjZCBwcmVmaXggZXh0cmFjdGlvbiBoYXBwZW5zIHRoZXJlIGZvciBsb2NhbGl6YXRpb24pXG5cdFx0Ly8gVXNlIHByZXNlbnRhdGlvbk92ZXJyaWRlcyBmb3IgZGlzcGxheSBpZiBhdmFpbGFibGUgKGUuZy4sIGV4dHJhY3RlZCBQeXRob24gY29kZSlcblx0XHRjb25zdCBpbml0aWFsQ29udGVudCA9IHRlcm1pbmFsRGF0YS5wcmVzZW50YXRpb25PdmVycmlkZXM/LmNvbW1hbmRMaW5lID8/IHRlcm1pbmFsRGF0YS5jb25maXJtYXRpb24/LmNvbW1hbmRMaW5lID8/ICh0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUudG9vbEVkaXRlZCA/PyB0ZXJtaW5hbERhdGEuY29tbWFuZExpbmUub3JpZ2luYWwpLnRyaW1TdGFydCgpO1xuXHRcdGNvbnN0IGNkUHJlZml4ID0gdGVybWluYWxEYXRhLmNvbmZpcm1hdGlvbj8uY2RQcmVmaXggPz8gJyc7XG5cdFx0Ly8gV2hlbiBwcmVzZW50YXRpb25PdmVycmlkZXMgaXMgc2V0LCB0aGUgZWRpdG9yIHNob3VsZCBiZSByZWFkLW9ubHkgc2luY2UgdGhlIGRpc3BsYXllZCBjb250ZW50XG5cdFx0Ly8gZGlmZmVycyBmcm9tIHRoZSBhY3R1YWwgY29tbWFuZCAoZS5nLiwgZXh0cmFjdGVkIFB5dGhvbiBjb2RlIHZzIGZ1bGwgcHl0aG9uIC1jIGNvbW1hbmQpXG5cdFx0Y29uc3QgaXNSZWFkT25seSA9ICEhdGVybWluYWxEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcztcblxuXHRcdGNvbnN0IGF1dG9BcHByb3ZlRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxDb250cmliU2V0dGluZ0lkLkVuYWJsZUF1dG9BcHByb3ZlKSA9PT0gdHJ1ZTtcblx0XHQvLyBDdXN0b20gYWN0aW9ucyB0eXBpY2FsbHkgY29tZSBwcmUtY29tcHV0ZWQgZnJvbSB0aGUgcnVuIGluIHRlcm1pbmFsIHRvb2wsIGJ1dCB0aGV5IGNhblxuXHRcdC8vIGFsc28gYmUgZ2VuZXJhdGVkIGFzeW5jaHJvbm91c2x5IGZvciBjb25maXJtYXRpb25zIHRoYXQgYXJyaXZlIHdpdGhvdXQgdGhlbSAoZWcuIGFnZW50XG5cdFx0Ly8gaG9zdCBzZXNzaW9ucyksIHNvIHRyYWNrIHRoZW0gaW4gYSBtdXRhYmxlIGxvY2FsIHNoYXJlZCBieSB0aGUgYnVpbGRlciBiZWxvdyBhbmQgdGhlXG5cdFx0Ly8gYnV0dG9uIGNsaWNrIGhhbmRsZXIuXG5cdFx0bGV0IGN1c3RvbUFjdGlvbnMgPSB0ZXJtaW5hbEN1c3RvbUFjdGlvbnM7XG5cdFx0Y29uc3QgYnVpbGRNb3JlQWN0aW9ucyA9ICgpOiAoSUNoYXRDb25maXJtYXRpb25CdXR0b248VGVybWluYWxOZXdBdXRvQXBwcm92ZUJ1dHRvbkRhdGE+IHwgU2VwYXJhdG9yKVtdIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGlmICghYXV0b0FwcHJvdmVFbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cy5UZXJtaW5hbEF1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIGZhbHNlKTtcblx0XHRcdGNvbnN0IG1vcmVBY3Rpb25zOiAoSUNoYXRDb25maXJtYXRpb25CdXR0b248VGVybWluYWxOZXdBdXRvQXBwcm92ZUJ1dHRvbkRhdGE+IHwgU2VwYXJhdG9yKVtdID0gW107XG5cdFx0XHRpZiAoIWF1dG9BcHByb3ZlV2FybmluZ0FjY2VwdGVkKSB7XG5cdFx0XHRcdG1vcmVBY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuZW5hYmxlJywgJ0VuYWJsZSBBdXRvIEFwcHJvdmUuLi4nKSxcblx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZW5hYmxlJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdG1vcmVBY3Rpb25zLnB1c2gobmV3IFNlcGFyYXRvcigpKTtcblx0XHRcdFx0aWYgKGN1c3RvbUFjdGlvbnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBjdXN0b21BY3Rpb25zKSB7XG5cdFx0XHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBTZXBhcmF0b3IpKSB7XG5cdFx0XHRcdFx0XHRcdGFjdGlvbi5kaXNhYmxlZCA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoY3VzdG9tQWN0aW9ucykge1xuXHRcdFx0XHRtb3JlQWN0aW9ucy5wdXNoKC4uLmN1c3RvbUFjdGlvbnMpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1vcmVBY3Rpb25zLmxlbmd0aCA9PT0gMCA/IHVuZGVmaW5lZCA6IG1vcmVBY3Rpb25zO1xuXHRcdH07XG5cblx0XHRjb25zdCBjb2RlQmxvY2tSZW5kZXJPcHRpb25zOiBJQ29kZUJsb2NrUmVuZGVyT3B0aW9ucyA9IHtcblx0XHRcdGhpZGVUb29sYmFyOiB0cnVlLFxuXHRcdFx0cmVzZXJ2ZVdpZHRoOiAxOSxcblx0XHRcdHZlcnRpY2FsUGFkZGluZzogNSxcblx0XHRcdGVkaXRvck9wdGlvbnM6IHtcblx0XHRcdFx0d29yZFdyYXA6ICdvbicsXG5cdFx0XHRcdHJlYWRPbmx5OiBpc1JlYWRPbmx5LFxuXHRcdFx0XHR0YWJGb2N1c01vZGU6IHRydWUsXG5cdFx0XHRcdGFyaWFMYWJlbDogdHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJyA/IHRpdGxlIDogdGl0bGUudmFsdWVcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSB0aGlzLmxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUodGVybWluYWxEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcz8ubGFuZ3VhZ2UgPz8gdGVybWluYWxEYXRhLmxhbmd1YWdlID8/ICdzaCcpID8/ICdzaGVsbHNjcmlwdCc7XG5cdFx0Y29uc3Qga2V5ID0gQ29kZUJsb2NrUGFydC5wb29sS2V5KHRoaXMuY29udGV4dC5lbGVtZW50LmlkLCB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yUG9vbC5nZXQoa2V5KSk7XG5cdFx0ZWRpdG9yLm9iamVjdC5yZW5kZXIoe1xuXHRcdFx0Y29kZUJsb2NrSW5kZXg6IHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdGVsZW1lbnQ6IHRoaXMuY29udGV4dC5lbGVtZW50LFxuXHRcdFx0bGFuZ3VhZ2VJZCxcblx0XHRcdHRleHQ6IGluaXRpYWxDb250ZW50LFxuXHRcdFx0cmVuZGVyT3B0aW9uczogY29kZUJsb2NrUmVuZGVyT3B0aW9ucyxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZVxuXHRcdH0sIHRoaXMuY3VycmVudFdpZHRoRGVsZWdhdGUoKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3Iub2JqZWN0LmVkaXRvci5nZXRNb2RlbCgpITtcblx0XHR0aGlzLmNvZGVibG9ja3MucHVzaCh7XG5cdFx0XHRjb2RlQmxvY2tJbmRleDogdGhpcy5jb2RlQmxvY2tTdGFydEluZGV4LFxuXHRcdFx0Y29kZW1hcHBlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0ZWxlbWVudElkOiB0aGlzLmNvbnRleHQuZWxlbWVudC5pZCxcblx0XHRcdGZvY3VzOiAoKSA9PiBlZGl0b3Iub2JqZWN0LmZvY3VzKCksXG5cdFx0XHRvd25lck1hcmtkb3duUGFydElkOiB0aGlzLmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHR1cmk6IG1vZGVsLnVyaSxcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50VmFsdWUgPSBtb2RlbC5nZXRWYWx1ZSgpO1xuXHRcdFx0Ly8gT25seSBzZXQgdXNlckVkaXRlZCBpZiB0aGUgY29udGVudCBhY3R1YWxseSBkaWZmZXJzIGZyb20gdGhlIGluaXRpYWwgdmFsdWVcblx0XHRcdC8vIFByZXBlbmQgY2QgcHJlZml4IGJhY2sgaWYgaXQgd2FzIGV4dHJhY3RlZCBmb3IgZGlzcGxheVxuXHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSAhPT0gaW5pdGlhbENvbnRlbnQpIHtcblx0XHRcdFx0dGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnVzZXJFZGl0ZWQgPSBjZFByZWZpeCArIGN1cnJlbnRWYWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS51c2VyRWRpdGVkID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBlbGVtZW50cyA9IGgoJy5jaGF0LWNvbmZpcm1hdGlvbi1tZXNzYWdlLXRlcm1pbmFsJywgW1xuXHRcdFx0aCgnLmNoYXQtY29uZmlybWF0aW9uLW1lc3NhZ2UtdGVybWluYWwtZWRpdG9yQGVkaXRvcicpLFxuXHRcdFx0aCgnLmNoYXQtY29uZmlybWF0aW9uLW1lc3NhZ2UtdGVybWluYWwtZGlzY2xhaW1lckBkaXNjbGFpbWVyJyksXG5cdFx0XSk7XG5cdFx0YXBwZW5kKGVsZW1lbnRzLmVkaXRvciwgZWRpdG9yLm9iamVjdC5lbGVtZW50KTtcblx0XHRjb25zdCBlZGl0b3JSZXNpemVPYnNlcnZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmVkaXRvcicsIGVudHJpZXMgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBlbnRyaWVzWzBdPy5jb250ZW50UmVjdC53aWR0aDtcblx0XHRcdGlmICh3aWR0aCkge1xuXHRcdFx0XHRlZGl0b3Iub2JqZWN0LmxheW91dCh3aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSwgZ2V0V2luZG93KHRoaXMuY29udGV4dC5jb250YWluZXIpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yUmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShlbGVtZW50cy5lZGl0b3IpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoZWxlbWVudHMuZWRpdG9yLCB7XG5cdFx0XHRjb250ZW50OiBtZXNzYWdlIHx8ICcnLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHRcdHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uTEVGVCB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJpc2tCYWRnZSA9IGNyZWF0ZUFwcHJvdmFsUmVhc29uQmFkZ2UodGhpcy5fc3RvcmUsIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLmFwcHJvdmFsUmVhc29uKVxuXHRcdFx0Pz8gY3JlYXRlVG9vbFJpc2tCYWRnZSh0aGlzLl9zdG9yZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5yaXNrQXNzZXNzbWVudFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgdGhpcy50b29sSW52b2NhdGlvbi50b29sSWQsIHN0YXRlLnBhcmFtZXRlcnMsICd0ZXJtaW5hbCcpO1xuXG5cdFx0Y29uc3QgY29uZmlybVdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0Q3VzdG9tQ29uZmlybWF0aW9uV2lkZ2V0PFRlcm1pbmFsTmV3QXV0b0FwcHJvdmVCdXR0b25EYXRhIHwgYm9vbGVhbj4sXG5cdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnRlcm1pbmFsLFxuXHRcdFx0XHRtZXNzYWdlOiBlbGVtZW50cy5yb290LFxuXHRcdFx0XHRmb290ZXJCYW5uZXI6IHJpc2tCYWRnZT8uZG9tTm9kZSxcblx0XHRcdFx0YnV0dG9uczogdGhpcy5fY3JlYXRlQnV0dG9ucyhidWlsZE1vcmVBY3Rpb25zKCkpXG5cdFx0XHR9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gQWdlbnQgSG9zdCBDb3BpbG90IGNvbmZpcm1hdGlvbnMgbmVlZCBjbGllbnQtZ2VuZXJhdGVkIHBlcnNpc3RlbnQgcnVsZSBhY3Rpb25zLlxuXHRcdGlmIChhdXRvQXBwcm92ZUVuYWJsZWQgJiYgIWN1c3RvbUFjdGlvbnMgJiYgdGVybWluYWxEYXRhLmF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUgJiYgZ2V0Q2hhdFNlc3Npb25UeXBlKHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSkgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRGb3JBbmFseXNpcyA9IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS50b29sRWRpdGVkID8/IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbDtcblx0XHRcdGNvbnN0IGFuYWx5c2lzTGFuZ3VhZ2UgPSB0ZXJtaW5hbERhdGEubGFuZ3VhZ2UgPT09ICdwb3dlcnNoZWxsJyA/ICdwb3dlcnNoZWxsJyA6ICdzaGVsbHNjcmlwdCc7XG5cdFx0XHR0aGlzLnRlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0QXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRGb3JBbmFseXNpcywgYW5hbHlzaXNMYW5ndWFnZSkudGhlbihhY3Rpb25zID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgIWFjdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjdXN0b21BY3Rpb25zID0gYWN0aW9ucztcblx0XHRcdFx0Y29uZmlybVdpZGdldC51cGRhdGVCdXR0b25zKHRoaXMuX2NyZWF0ZUJ1dHRvbnMoYnVpbGRNb3JlQWN0aW9ucygpKSk7XG5cdFx0XHR9LCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgdGhlIHVuc2FuZGJveGVkLWV4ZWN1dGlvbiByZWFzb24gYW5kIGRpc2NsYWltZXIgbWFya2Rvd24uIFdoZW5cblx0XHQvLyB0aGUgcmlzayBiYWRnZSBpcyBzaG93biwgc3VyZmFjZSB0aGVtIHZpYSBpdHMgZGV0YWlscyBob3ZlciAod2l0aFxuXHRcdC8vIGxhYmVsbGVkIHByZWZpeGVzKSBpbnN0ZWFkIG9mIHRoZSBkZWRpY2F0ZWQgZGlzY2xhaW1lciByb3cgdG8ga2VlcFxuXHRcdC8vIHRoZSBjb25maXJtYXRpb24gY29tcGFjdC5cblx0XHRpbnRlcmZhY2UgSURldGFpbFBhcnQge1xuXHRcdFx0cmVhZG9ubHkgaW5saW5lOiBJTWFya2Rvd25TdHJpbmc7XG5cdFx0XHRyZWFkb25seSBob3ZlckxhYmVsOiBzdHJpbmc7XG5cdFx0XHRyZWFkb25seSBob3ZlckJvZHk6IHN0cmluZztcblx0XHRcdHJlYWRvbmx5IGlzVHJ1c3RlZDogSU1hcmtkb3duU3RyaW5nWydpc1RydXN0ZWQnXTtcblx0XHR9XG5cdFx0Y29uc3QgZGV0YWlsUGFydHM6IElEZXRhaWxQYXJ0W10gPSBbXTtcblx0XHRpZiAodGVybWluYWxEYXRhLnJlcXVlc3RVbnNhbmRib3hlZEV4ZWN1dGlvbikge1xuXHRcdFx0Y29uc3QgcmVhc29uVGV4dCA9ICh0ZXJtaW5hbERhdGEucmVxdWVzdFVuc2FuZGJveGVkRXhlY3V0aW9uUmVhc29uICYmIHRlcm1pbmFsRGF0YS5yZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb25SZWFzb24udHJpbSgpKVxuXHRcdFx0XHR8fCBsb2NhbGl6ZSgnY2hhdC50ZXJtaW5hbC51bnNhbmRib3hlZEV4ZWN1dGlvbi5kZWZhdWx0UmVhc29uJywgXCJUaGUgbW9kZWwgZGlkIG5vdCBwcm92aWRlIGEgcmVhc29uIGZvciByZXF1ZXN0aW5nIHVuc2FuZGJveGVkIGV4ZWN1dGlvbi5cIik7XG5cdFx0XHRjb25zdCBpbmxpbmUgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0aW5saW5lLmFwcGVuZE1hcmtkb3duKGAkKCR7Q29kaWNvbi5pbmZvLmlkfSkgYCk7XG5cdFx0XHRpbmxpbmUuYXBwZW5kVGV4dChyZWFzb25UZXh0KTtcblx0XHRcdGRldGFpbFBhcnRzLnB1c2goe1xuXHRcdFx0XHRpbmxpbmUsXG5cdFx0XHRcdGhvdmVyTGFiZWw6IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLmRldGFpbC5zYW5kYm94SW5zdWZmaWNpZW50JywgXCJTYW5kYm94IGluc3VmZmljaWVudDpcIiksXG5cdFx0XHRcdGhvdmVyQm9keTogZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMocmVhc29uVGV4dCksXG5cdFx0XHRcdGlzVHJ1c3RlZDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmICh0ZXJtaW5hbERhdGEucmVxdWVzdEFsbG93TmV0d29yaykge1xuXHRcdFx0Y29uc3QgcmVhc29uVGV4dCA9ICh0ZXJtaW5hbERhdGEucmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbiAmJiB0ZXJtaW5hbERhdGEucmVxdWVzdEFsbG93TmV0d29ya1JlYXNvbi50cmltKCkpXG5cdFx0XHRcdHx8IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLmFsbG93TmV0d29yay5kZWZhdWx0UmVhc29uJywgXCJUaGUgbW9kZWwgZGlkIG5vdCBwcm92aWRlIGEgcmVhc29uIGZvciByZXF1ZXN0aW5nIHVucmVzdHJpY3RlZCBuZXR3b3JrIGFjY2VzcyBpbiB0aGUgc2FuZGJveC5cIik7XG5cdFx0XHRjb25zdCBpbmxpbmUgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0aW5saW5lLmFwcGVuZE1hcmtkb3duKGAkKCR7Q29kaWNvbi5pbmZvLmlkfSkgYCk7XG5cdFx0XHRpbmxpbmUuYXBwZW5kVGV4dChyZWFzb25UZXh0KTtcblx0XHRcdGRldGFpbFBhcnRzLnB1c2goe1xuXHRcdFx0XHRpbmxpbmUsXG5cdFx0XHRcdGhvdmVyTGFiZWw6IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLmRldGFpbC51bnJlc3RyaWN0ZWROZXR3b3JrJywgXCJVbnJlc3RyaWN0ZWQgbmV0d29yayBhY2Nlc3M6XCIpLFxuXHRcdFx0XHRob3ZlckJvZHk6IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHJlYXNvblRleHQpLFxuXHRcdFx0XHRpc1RydXN0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAoZGlzY2xhaW1lcikge1xuXHRcdFx0Y29uc3QgaW5saW5lID0gdHlwZW9mIGRpc2NsYWltZXIgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKGRpc2NsYWltZXIpIDogZGlzY2xhaW1lcjtcblx0XHRcdC8vIEZvciB0aGUgaG92ZXIsIGRyb3AgdGhlIGxlYWRpbmcgYCQoaW5mbykgYCBpY29uIHByZWZpeCB0aGF0IHRoZVxuXHRcdFx0Ly8gZGlzY2xhaW1lciBjYXJyaWVzIGZvciBpbmxpbmUgcmVuZGVyaW5nIFx1MjAxNCB0aGUgbGFiZWxsZWQgcHJlZml4XG5cdFx0XHQvLyBhbHJlYWR5IGNvbnZleXMgdGhlIHNhbWUgcm9sZS5cblx0XHRcdGNvbnN0IGhvdmVyQm9keSA9IGlubGluZS52YWx1ZS5yZXBsYWNlKC9eXFxzKlxcJFxcKFteKV0rXFwpXFxzKi8sICcnKTtcblx0XHRcdGRldGFpbFBhcnRzLnB1c2goe1xuXHRcdFx0XHRpbmxpbmUsXG5cdFx0XHRcdGhvdmVyTGFiZWw6IGxvY2FsaXplKCdjaGF0LnRlcm1pbmFsLmRldGFpbC5hcHByb3ZhbE5lZWRlZCcsIFwiQXBwcm92YWwgbmVlZGVkOlwiKSxcblx0XHRcdFx0aG92ZXJCb2R5LFxuXHRcdFx0XHRpc1RydXN0ZWQ6IGlubGluZS5pc1RydXN0ZWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJJbmxpbmVEaXNjbGFpbWVycyA9ICgpID0+IHtcblx0XHRcdGVsZW1lbnRzLmRpc2NsYWltZXIucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgZGV0YWlsUGFydHMpIHtcblx0XHRcdFx0dGhpcy5fYXBwZW5kTWFya2Rvd25QYXJ0KGVsZW1lbnRzLmRpc2NsYWltZXIsIHBhcnQuaW5saW5lLCBjb2RlQmxvY2tSZW5kZXJPcHRpb25zKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0aWYgKHJpc2tCYWRnZSAmJiBkZXRhaWxQYXJ0cy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGNvbWJpbmVkID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSxcblx0XHRcdFx0aXNUcnVzdGVkOiBkZXRhaWxQYXJ0cy5yZWR1Y2U8TWFya2Rvd25TdHJpbmdbJ2lzVHJ1c3RlZCddPigoYWNjLCBwYXJ0KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHBhcnQuaXNUcnVzdGVkID09PSB0cnVlIHx8IGFjYyA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0eXBlb2YgcGFydC5pc1RydXN0ZWQgPT09ICdvYmplY3QnICYmIHBhcnQuaXNUcnVzdGVkKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBlbmFibGVkID0gbmV3IFNldChbXG5cdFx0XHRcdFx0XHRcdC4uLih0eXBlb2YgYWNjID09PSAnb2JqZWN0JyAmJiBhY2M/LmVuYWJsZWRDb21tYW5kcyA/IGFjYy5lbmFibGVkQ29tbWFuZHMgOiBbXSksXG5cdFx0XHRcdFx0XHRcdC4uLnBhcnQuaXNUcnVzdGVkLmVuYWJsZWRDb21tYW5kcyxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZW5hYmxlZENvbW1hbmRzOiBbLi4uZW5hYmxlZF0gfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGFjYztcblx0XHRcdFx0fSwgdW5kZWZpbmVkKSxcblx0XHRcdH0pO1xuXHRcdFx0ZGV0YWlsUGFydHMuZm9yRWFjaCgocGFydCwgaSkgPT4ge1xuXHRcdFx0XHRpZiAoaSA+IDApIHtcblx0XHRcdFx0XHRjb21iaW5lZC5hcHBlbmRNYXJrZG93bignXFxuXFxuJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29tYmluZWQuYXBwZW5kTWFya2Rvd24oYCoqJHtlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhwYXJ0LmhvdmVyTGFiZWwpfSoqICR7cGFydC5ob3ZlckJvZHl9YCk7XG5cdFx0XHR9KTtcblx0XHRcdHJpc2tCYWRnZS5zZXREZXRhaWxzKGNvbWJpbmVkKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJpc2tCYWRnZS5vbkRpZEhpZGUoKCkgPT4gcmVuZGVySW5saW5lRGlzY2xhaW1lcnMoKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZW5kZXJJbmxpbmVEaXNjbGFpbWVycygpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1Rvb2xDb25maXJtYXRpb25LZXkgPSBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNUb29sQ29uZmlybWF0aW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRoYXNUb29sQ29uZmlybWF0aW9uS2V5LnNldCh0cnVlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gaGFzVG9vbENvbmZpcm1hdGlvbktleS5yZXNldCgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maXJtV2lkZ2V0Lm9uRGlkQ2xpY2soYXN5bmMgKHsgYnV0dG9uLCBpc1RvdWNoQ2xpY2sgfSkgPT4ge1xuXHRcdFx0bGV0IGRvQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGJ1dHRvbi5kYXRhO1xuXHRcdFx0bGV0IHRvb2xDb25maXJtS2luZDogVG9vbENvbmZpcm1LaW5kID0gVG9vbENvbmZpcm1LaW5kLkRlbmllZDtcblx0XHRcdGlmICh0eXBlb2YgZGF0YSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdGlmIChkYXRhKSB7XG5cdFx0XHRcdFx0dG9vbENvbmZpcm1LaW5kID0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb247XG5cdFx0XHRcdFx0Ly8gQ2xlYXIgb3V0IGFueSBhdXRvIGFwcHJvdmUgaW5mbyBzaW5jZSB0aGlzIHdhcyBhbiBleHBsaWNpdCB1c2VyIGFjdGlvbi4gVGhpc1xuXHRcdFx0XHRcdC8vIGNhbiBoYXBwZW4gd2hlbiB0aGUgYXV0byBhcHByb3ZlIGZlYXR1cmUgaXMgb2ZmLlxuXHRcdFx0XHRcdGlmICh0ZXJtaW5hbERhdGEuYXV0b0FwcHJvdmVJbmZvKSB7XG5cdFx0XHRcdFx0XHR0ZXJtaW5hbERhdGEuYXV0b0FwcHJvdmVJbmZvID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZGF0YSAhPT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdHN3aXRjaCAoZGF0YS50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnZW5hYmxlJzoge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb3B0ZWRJbiA9IGF3YWl0IHRoaXMuX3Nob3dBdXRvQXBwcm92ZVdhcm5pbmcoKTtcblx0XHRcdFx0XHRcdGlmIChvcHRlZEluKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVGVybWluYWxUb29sQ29uZmlybWF0aW9uU3RvcmFnZUtleXMuVGVybWluYWxBdXRvQXBwcm92ZVdhcm5pbmdBY2NlcHRlZCwgdHJ1ZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdFx0XHQvLyBJZiB0aGlzIGNvbW1hbmQgd291bGQgaGF2ZSBiZWVuIGF1dG8tYXBwcm92ZWQsIGFwcHJvdmUgaW1tZWRpYXRlbHlcblx0XHRcdFx0XHRcdFx0aWYgKHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZUluZm8pIHtcblx0XHRcdFx0XHRcdFx0XHR0b29sQ29uZmlybUtpbmQgPSBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQvLyBJZiB0aGlzIHdvdWxkIG5vdCBoYXZlIGJlZW4gYXV0byBhcHByb3ZlZCwgZW5hYmxlIHRoZSBvcHRpb25zIGFuZFxuXHRcdFx0XHRcdFx0XHQvLyBkbyBub3QgY29tcGxldGVcblx0XHRcdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGN1c3RvbUFjdGlvbnMpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGN1c3RvbUFjdGlvbnMpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU2VwYXJhdG9yKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGFjdGlvbi5kaXNhYmxlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0Y29uZmlybVdpZGdldC51cGRhdGVCdXR0b25zKHRoaXMuX2NyZWF0ZUJ1dHRvbnMoYnVpbGRNb3JlQWN0aW9ucygpKSk7XG5cdFx0XHRcdFx0XHRcdFx0ZG9Db21wbGV0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRkb0NvbXBsZXRlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnc2tpcCc6IHtcblx0XHRcdFx0XHRcdHRvb2xDb25maXJtS2luZCA9IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ25ld1J1bGUnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdSdWxlcyA9IGFzQXJyYXkoZGF0YS5ydWxlKTtcblxuXHRcdFx0XHRcdFx0Ly8gR3JvdXAgcnVsZXMgYnkgc2NvcGVcblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25SdWxlcyA9IG5ld1J1bGVzLmZpbHRlcihyID0+IHIuc2NvcGUgPT09ICdzZXNzaW9uJyk7XG5cdFx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VSdWxlcyA9IG5ld1J1bGVzLmZpbHRlcihyID0+IHIuc2NvcGUgPT09ICd3b3Jrc3BhY2UnKTtcblx0XHRcdFx0XHRcdGNvbnN0IHVzZXJSdWxlcyA9IG5ld1J1bGVzLmZpbHRlcihyID0+IHIuc2NvcGUgPT09ICd1c2VyJyk7XG5cblx0XHRcdFx0XHRcdC8vIEhhbmRsZSBzZXNzaW9uLXNjb3BlZCBydWxlcyAodGVtcG9yYXJ5LCBpbi1tZW1vcnkgb25seSlcblx0XHRcdFx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHJ1bGUgb2Ygc2Vzc2lvblJ1bGVzKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudGVybWluYWxDaGF0U2VydmljZS5hZGRTZXNzaW9uQXV0b0FwcHJvdmVSdWxlKGNoYXRTZXNzaW9uUmVzb3VyY2UsIHJ1bGUua2V5LCBydWxlLnZhbHVlKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gSGFuZGxlIHdvcmtzcGFjZS1zY29wZWQgcnVsZXNcblx0XHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VSdWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoVGVybWluYWxDb250cmliU2V0dGluZ0lkLkF1dG9BcHByb3ZlKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb2xkVmFsdWUgPSAoaW5zcGVjdC53b3Jrc3BhY2VWYWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPz8ge307XG5cdFx0XHRcdFx0XHRcdGlmIChpc09iamVjdChvbGRWYWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBuZXdWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLm9sZFZhbHVlIH07XG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBydWxlIG9mIHdvcmtzcGFjZVJ1bGVzKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRuZXdWYWx1ZVtydWxlLmtleV0gPSBydWxlLnZhbHVlO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFRlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5BdXRvQXBwcm92ZSwgbmV3VmFsdWUsIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3Moe1xuXHRcdFx0XHRcdFx0XHRcdFx0anNvbkVkaXRvcjogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UsXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXZlYWxTZXR0aW5nOiB7IGtleTogVGVybWluYWxDb250cmliU2V0dGluZ0lkLkF1dG9BcHByb3ZlIH0sXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoYENhbm5vdCBhZGQgbmV3IHJ1bGUsIGV4aXN0aW5nIHdvcmtzcGFjZSBzZXR0aW5nIGlzIHVuZXhwZWN0ZWQgZm9ybWF0YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gSGFuZGxlIHVzZXItc2NvcGVkIHJ1bGVzXG5cdFx0XHRcdFx0XHRpZiAodXNlclJ1bGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaW5zcGVjdCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQXV0b0FwcHJvdmUpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvbGRWYWx1ZSA9IChpbnNwZWN0LnVzZXJWYWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPz8ge307XG5cdFx0XHRcdFx0XHRcdGlmIChpc09iamVjdChvbGRWYWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBuZXdWYWx1ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IC4uLm9sZFZhbHVlIH07XG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBydWxlIG9mIHVzZXJSdWxlcykge1xuXHRcdFx0XHRcdFx0XHRcdFx0bmV3VmFsdWVbcnVsZS5rZXldID0gcnVsZS52YWx1ZTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQXV0b0FwcHJvdmUsIG5ld1ZhbHVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7XG5cdFx0XHRcdFx0XHRcdFx0XHRqc29uRWRpdG9yOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRcdFx0XHRcdFx0XHRyZXZlYWxTZXR0aW5nOiB7IGtleTogVGVybWluYWxDb250cmliU2V0dGluZ0lkLkF1dG9BcHByb3ZlIH0sXG5cdFx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoYENhbm5vdCBhZGQgbmV3IHJ1bGUsIGV4aXN0aW5nIHNldHRpbmcgaXMgdW5leHBlY3RlZCBmb3JtYXRgKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRmdW5jdGlvbiBmb3JtYXRSdWxlTGlua3MocnVsZXM6IElUZXJtaW5hbE5ld0F1dG9BcHByb3ZlUnVsZVtdLCBzY29wZTogJ3Nlc3Npb24nIHwgJ3dvcmtzcGFjZScgfCAndXNlcicpOiBzdHJpbmcge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcnVsZXMubWFwKGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChzY29wZSA9PT0gJ3Nlc3Npb24nKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gYFxcYCR7ZS5rZXl9XFxgYDtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gc2NvcGUgPT09ICd3b3Jrc3BhY2UnID8gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgOiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ3NVcmkgPSBjcmVhdGVDb21tYW5kVXJpKFRlcm1pbmFsQ29udHJpYkNvbW1hbmRJZC5PcGVuVGVybWluYWxTZXR0aW5nc0xpbmssIHRhcmdldCk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGBbXFxgJHtlLmtleX1cXGBdKCR7c2V0dGluZ3NVcmkudG9TdHJpbmcoKX0gXCIke2xvY2FsaXplKCdydWxlVG9vbHRpcCcsICdWaWV3IHJ1bGUgaW4gc2V0dGluZ3MnKX1cIilgO1xuXHRcdFx0XHRcdFx0XHR9KS5qb2luKCcsICcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgbWRUcnVzdFNldHRpbmdzID0ge1xuXHRcdFx0XHRcdFx0XHRpc1RydXN0ZWQ6IHtcblx0XHRcdFx0XHRcdFx0XHRlbmFibGVkQ29tbWFuZHM6IFtUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuT3BlblRlcm1pbmFsU2V0dGluZ3NMaW5rXVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0Y29uc3QgcGFydHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0XHRpZiAoc2Vzc2lvblJ1bGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cGFydHMucHVzaChzZXNzaW9uUnVsZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbmV3UnVsZS5zZXNzaW9uJywgJ1Nlc3Npb24gYXV0byBhcHByb3ZlIHJ1bGUgezB9IGFkZGVkJywgZm9ybWF0UnVsZUxpbmtzKHNlc3Npb25SdWxlcywgJ3Nlc3Npb24nKSlcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCduZXdSdWxlLnNlc3Npb24ucGx1cmFsJywgJ1Nlc3Npb24gYXV0byBhcHByb3ZlIHJ1bGVzIHswfSBhZGRlZCcsIGZvcm1hdFJ1bGVMaW5rcyhzZXNzaW9uUnVsZXMsICdzZXNzaW9uJykpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VSdWxlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHBhcnRzLnB1c2god29ya3NwYWNlUnVsZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbmV3UnVsZS53b3Jrc3BhY2UnLCAnV29ya3NwYWNlIGF1dG8gYXBwcm92ZSBydWxlIHswfSBhZGRlZCcsIGZvcm1hdFJ1bGVMaW5rcyh3b3Jrc3BhY2VSdWxlcywgJ3dvcmtzcGFjZScpKVxuXHRcdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ25ld1J1bGUud29ya3NwYWNlLnBsdXJhbCcsICdXb3Jrc3BhY2UgYXV0byBhcHByb3ZlIHJ1bGVzIHswfSBhZGRlZCcsIGZvcm1hdFJ1bGVMaW5rcyh3b3Jrc3BhY2VSdWxlcywgJ3dvcmtzcGFjZScpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodXNlclJ1bGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cGFydHMucHVzaCh1c2VyUnVsZXMubGVuZ3RoID09PSAxXG5cdFx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnbmV3UnVsZS51c2VyJywgJ1VzZXIgYXV0byBhcHByb3ZlIHJ1bGUgezB9IGFkZGVkJywgZm9ybWF0UnVsZUxpbmtzKHVzZXJSdWxlcywgJ3VzZXInKSlcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCduZXdSdWxlLnVzZXIucGx1cmFsJywgJ1VzZXIgYXV0byBhcHByb3ZlIHJ1bGVzIHswfSBhZGRlZCcsIGZvcm1hdFJ1bGVMaW5rcyh1c2VyUnVsZXMsICd1c2VyJykpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZUluZm8gPSBuZXcgTWFya2Rvd25TdHJpbmcocGFydHMuam9pbignLCAnKSwgbWRUcnVzdFNldHRpbmdzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRvb2xDb25maXJtS2luZCA9IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ2NvbmZpZ3VyZSc6IHtcblx0XHRcdFx0XHRcdHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7XG5cdFx0XHRcdFx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRcdFx0XHRxdWVyeTogYEBpZDoke1Rlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5BdXRvQXBwcm92ZX1gLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRkb0NvbXBsZXRlID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnc2Vzc2lvbkFwcHJvdmFsJzoge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5jb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdFx0dGhpcy50ZXJtaW5hbENoYXRTZXJ2aWNlLnNldENoYXRTZXNzaW9uQXV0b0FwcHJvdmFsKHNlc3Npb25SZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNhYmxlVXJpID0gY3JlYXRlQ29tbWFuZFVyaShUZXJtaW5hbENvbnRyaWJDb21tYW5kSWQuRGlzYWJsZVNlc3Npb25BdXRvQXBwcm92YWwsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRjb25zdCBtZFRydXN0U2V0dGluZ3MgPSB7XG5cdFx0XHRcdFx0XHRcdGlzVHJ1c3RlZDoge1xuXHRcdFx0XHRcdFx0XHRcdGVuYWJsZWRDb21tYW5kczogW1Rlcm1pbmFsQ29udHJpYkNvbW1hbmRJZC5EaXNhYmxlU2Vzc2lvbkF1dG9BcHByb3ZhbF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHRlcm1pbmFsRGF0YS5hdXRvQXBwcm92ZUluZm8gPSBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ3Nlc3Npb25BcHByb3ZhbCcsICdBbGwgY29tbWFuZHMgd2lsbCBiZSBhdXRvIGFwcHJvdmVkIGZvciB0aGlzIHNlc3Npb24nKX0gKFske2xvY2FsaXplKCdzZXNzaW9uQXBwcm92YWwuZGlzYWJsZScsICdEaXNhYmxlJyl9XSgke2Rpc2FibGVVcmkudG9TdHJpbmcoKX0pKWAsIG1kVHJ1c3RTZXR0aW5ncyk7XG5cdFx0XHRcdFx0XHR0b29sQ29uZmlybUtpbmQgPSBUb29sQ29uZmlybUtpbmQuVXNlckFjdGlvbjtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZG9Db21wbGV0ZSkge1xuXHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IHRvb2xDb25maXJtS2luZCB9KTtcblx0XHRcdFx0aWYgKCFpc1RvdWNoQ2xpY2spIHtcblx0XHRcdFx0XHR0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk/LmZvY3VzSW5wdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGNvbmZpcm1XaWRnZXQuZG9tTm9kZTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUJ1dHRvbnMobW9yZUFjdGlvbnM6IChJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbjxUZXJtaW5hbE5ld0F1dG9BcHByb3ZlQnV0dG9uRGF0YT4gfCBTZXBhcmF0b3IpW10gfCB1bmRlZmluZWQpOiBJQ2hhdENvbmZpcm1hdGlvbkJ1dHRvbjxib29sZWFuIHwgVGVybWluYWxOZXdBdXRvQXBwcm92ZUJ1dHRvbkRhdGE+W10ge1xuXHRcdGNvbnN0IGdldExhYmVsQW5kVG9vbHRpcCA9IChsYWJlbDogc3RyaW5nLCBhY3Rpb25JZDogc3RyaW5nLCB0b29sdGlwRGV0YWlsOiBzdHJpbmcgPSBsYWJlbCk6IHsgbGFiZWw6IHN0cmluZzsgdG9vbHRpcDogc3RyaW5nIH0gPT4ge1xuXHRcdFx0Y29uc3QgdG9vbHRpcCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyh0b29sdGlwRGV0YWlsLCBhY3Rpb25JZCk7XG5cdFx0XHRyZXR1cm4geyBsYWJlbCwgdG9vbHRpcCB9O1xuXHRcdH07XG5cblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHQuLi5nZXRMYWJlbEFuZFRvb2x0aXAobG9jYWxpemUoJ3Rvb2wuYWxsb3cnLCBcIkFsbG93XCIpLCBBY2NlcHRUb29sQ29uZmlybWF0aW9uQWN0aW9uSWQpLFxuXHRcdFx0XHRkYXRhOiB0cnVlLFxuXHRcdFx0XHRtb3JlQWN0aW9ucyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdC4uLmdldExhYmVsQW5kVG9vbHRpcChsb2NhbGl6ZSgndG9vbC5za2lwJywgXCJTa2lwXCIpLCBTa2lwVG9vbENvbmZpcm1hdGlvbkFjdGlvbklkLCBsb2NhbGl6ZSgnc2tpcC5kZXRhaWwnLCAnUHJvY2VlZCB3aXRob3V0IGV4ZWN1dGluZyB0aGlzIGNvbW1hbmQnKSksXG5cdFx0XHRcdGRhdGE6IHsgdHlwZTogJ3NraXAnIH0sXG5cdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd0F1dG9BcHByb3ZlV2FybmluZygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBwcm9tcHRSZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUudGl0bGUnLCAnRW5hYmxlIHRlcm1pbmFsIGF1dG8gYXBwcm92ZT8nKSxcblx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYXV0b0FwcHJvdmUuYnV0dG9uLmVuYWJsZScsICdFbmFibGUnKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0cnVlXG5cdFx0XHR9XSxcblx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZSxcblx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRpY29uOiBDb2RpY29uLnNoaWVsZCxcblx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2F1dG9BcHByb3ZlLm1hcmtkb3duJywgJ1RoaXMgd2lsbCBlbmFibGUgYSBjb25maWd1cmFibGUgc3Vic2V0IG9mIGNvbW1hbmRzIHRvIHJ1biBpbiB0aGUgdGVybWluYWwgYXV0b25vbW91c2x5LiBJdCBwcm92aWRlcyAqYmVzdCBlZmZvcnQgcHJvdGVjdGlvbnMqIGFuZCBhc3N1bWVzIHRoZSBhZ2VudCBpcyBub3QgYWN0aW5nIG1hbGljaW91c2x5LicpKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcoYFske2xvY2FsaXplKCdhdXRvQXBwcm92ZS5tYXJrZG93bjInLCAnTGVhcm4gbW9yZSBhYm91dCB0aGUgcG90ZW50aWFsIHJpc2tzIGFuZCBob3cgdG8gYXZvaWQgdGhlbS4nKX1dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvYWdlbnRzL3J1bi9zZWN1cml0eT9yZWZlcnJlcj1pbi1wcm9kdWN0I19zZWN1cml0eS1yaXNrcy10by1iZS1hd2FyZS1vZilgKVxuXHRcdFx0XHR9XSxcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcHJvbXB0UmVzdWx0LnJlc3VsdCA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGVuZE1hcmtkb3duUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcsIGNvZGVCbG9ja1JlbmRlck9wdGlvbnM6IElDb2RlQmxvY2tSZW5kZXJPcHRpb25zKSB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1hcmtkb3duQ29udGVudFBhcnQsXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLFxuXHRcdFx0XHRjb250ZW50OiB0eXBlb2YgbWVzc2FnZSA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihtZXNzYWdlKSA6IG1lc3NhZ2Vcblx0XHRcdH0sXG5cdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHR0aGlzLmVkaXRvclBvb2wsXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdHRoaXMucmVuZGVyZXIsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlKCksXG5cdFx0XHR7IGNvZGVCbG9ja1JlbmRlck9wdGlvbnMgfSxcblx0XHQpKTtcblx0XHRhcHBlbmQoY29udGFpbmVyLCBwYXJ0LmRvbU5vZGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsUUFBUSwwQkFBMEIsV0FBVyxTQUFTO0FBQy9ELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0IseUJBQXlCO0FBQ3BELFNBQVMsa0JBQWtCLDRCQUE0QixzQkFBNEM7QUFDbkcsU0FBUyxvQkFBb0I7QUFDN0IsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQixnQ0FBZ0M7QUFDbkUsU0FBUyx1QkFBdUI7QUFDaEMsU0FB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LGVBQWUsd0NBQXdDLENBQUM7QUFBQSxRQUNwSixNQUFNLEVBQUUsTUFBTSxPQUFPO0FBQUEsUUFDckIsYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYywwQkFBNEM7QUFDekQsVUFBTSxlQUFlLE1BQU0sS0FBSyxjQUFjLE9BQU87QUFBQSxNQUNwRCxNQUFNLFNBQVM7QUFBQSxNQUNmLFNBQVMsU0FBUyxxQkFBcUIsK0JBQStCO0FBQUEsTUFDdEUsU0FBUyxDQUFDO0FBQUEsUUFDVCxPQUFPLFNBQVMsNkJBQTZCLFFBQVE7QUFBQSxRQUNyRCxLQUFLLE1BQU07QUFBQSxNQUNaLENBQUM7QUFBQSxNQUNELGNBQWM7QUFBQSxNQUNkLFFBQVE7QUFBQSxRQUNQLE1BQU0sUUFBUTtBQUFBLFFBQ2QsaUJBQWlCLENBQUM7QUFBQSxVQUNqQixVQUFVLElBQUksZUFBZSxTQUFTLHdCQUF3QixnTEFBZ0wsQ0FBQztBQUFBLFFBQ2hQLEdBQUc7QUFBQSxVQUNGLFVBQVUsSUFBSSxlQUFlLElBQUksU0FBUyx5QkFBeUIsNkRBQTZELENBQUMsOEdBQThHO0FBQUEsUUFDaFAsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLGFBQWEsV0FBVztBQUFBLEVBQ2hDO0FBQUEsRUFFUSxvQkFBb0IsV0FBd0IsU0FBbUMsd0JBQWlEO0FBQ3ZJLFVBQU0sT0FBTyxLQUFLLFVBQVUsS0FBSyxxQkFBcUI7QUFBQSxNQUFlO0FBQUEsTUFDcEU7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFNBQVMsT0FBTyxZQUFZLFdBQVcsSUFBSSxlQUFlLEVBQUUsZUFBZSxPQUFPLElBQUk7QUFBQSxNQUN2RjtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0wsS0FBSztBQUFBLE1BQ0w7QUFBQSxNQUNBLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMO0FBQUEsTUFDQSxLQUFLLHFCQUFxQjtBQUFBLE1BQzFCLEVBQUUsdUJBQXVCO0FBQUEsSUFDMUIsQ0FBQztBQUNELFdBQU8sV0FBVyxLQUFLLE9BQU87QUFBQSxFQUMvQjtBQUNEO0FBM2VhLHNDQUFOO0FBQUEsRUFZSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeEJVOyIsCiAgIm5hbWVzIjogWyJUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdG9yYWdlS2V5cyIsICJmb3JtYXRSdWxlTGlua3MiXQp9Cg==
