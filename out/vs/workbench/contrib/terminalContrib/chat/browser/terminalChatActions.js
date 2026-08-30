import { Codicon } from "../../../../../base/common/codicons.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ChatViewId, IChatWidgetService } from "../../../chat/browser/chat.js";
import { ChatContextKeys } from "../../../chat/common/actions/chatContextKeys.js";
import { IChatService } from "../../../chat/common/chatService/chatService.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../chat/common/constants.js";
import { isDetachedTerminalInstance, ITerminalChatService, ITerminalEditorService, ITerminalGroupService, ITerminalService } from "../../../terminal/browser/terminal.js";
import { registerActiveXtermAction } from "../../../terminal/browser/terminalActions.js";
import { TerminalContextMenuGroup } from "../../../terminal/browser/terminalMenus.js";
import { TerminalContextKeys } from "../../../terminal/common/terminalContextKey.js";
import { MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from "./terminalChat.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { getIconId } from "../../../terminal/browser/terminalIcon.js";
import { TerminalChatController } from "./terminalChatController.js";
import { TerminalCapability } from "../../../../../platform/terminal/common/capabilities/capabilities.js";
import { isString } from "../../../../../base/common/types.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { ConfigurationTarget } from "../../../../../platform/configuration/common/configuration.js";
import { TerminalChatAgentToolsSettingId } from "../../chatAgentTools/common/terminalChatAgentToolsConfiguration.js";
import { AbstractInlineChatAction } from "../../../inlineChat/browser/inlineChatActions.js";
registerActiveXtermAction({
  id: TerminalChatCommandId.Start,
  title: localize2("startChat", "Open Inline Chat"),
  category: localize2("terminalCategory", "Terminal"),
  keybinding: {
    primary: KeyMod.CtrlCmd | KeyCode.KeyI,
    when: ContextKeyExpr.and(TerminalContextKeys.focusInAny),
    // HACK: Force weight to be higher than the extension contributed keybinding to override it until it gets replaced
    weight: KeybindingWeight.ExternalExtension + 1
    // KeybindingWeight.WorkbenchContrib,
  },
  f1: true,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalChatContextKeys.hasChatAgent
  ),
  menu: {
    id: MenuId.TerminalInstanceContext,
    group: TerminalContextMenuGroup.Chat,
    order: 2,
    when: ChatContextKeys.enabled
  },
  run: (_xterm, _accessor, activeInstance, opts) => {
    if (isDetachedTerminalInstance(activeInstance)) {
      return;
    }
    const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
    if (!contr) {
      return;
    }
    if (opts) {
      let isValidOptionsObject2 = function(obj) {
        return typeof obj === "object" && obj !== null && "query" in obj && isString(obj.query);
      };
      var isValidOptionsObject = isValidOptionsObject2;
      opts = isString(opts) ? { query: opts } : opts;
      if (isValidOptionsObject2(opts)) {
        contr.updateInput(opts.query, false);
        if (!opts.isPartialQuery) {
          contr.terminalChatWidget?.acceptInput();
        }
      }
    }
    contr.terminalChatWidget?.reveal();
  }
});
registerActiveXtermAction({
  id: TerminalChatCommandId.Close,
  title: localize2("closeChat", "Close"),
  category: AbstractInlineChatAction.category,
  keybinding: {
    primary: KeyCode.Escape,
    when: ContextKeyExpr.and(
      ContextKeyExpr.or(TerminalContextKeys.focus, TerminalChatContextKeys.focused),
      TerminalChatContextKeys.visible
    ),
    weight: KeybindingWeight.WorkbenchContrib
  },
  menu: [{
    id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
    group: "0_main",
    order: 2
  }],
  icon: Codicon.close,
  f1: true,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    TerminalChatContextKeys.visible
  ),
  run: (_xterm, _accessor, activeInstance) => {
    if (isDetachedTerminalInstance(activeInstance)) {
      return;
    }
    const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
    contr?.terminalChatWidget?.clear();
  }
});
registerActiveXtermAction({
  id: TerminalChatCommandId.RunCommand,
  title: localize2("runCommand", "Run Chat Command"),
  shortTitle: localize2("run", "Run"),
  category: AbstractInlineChatAction.category,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalChatContextKeys.requestActive.negate(),
    TerminalChatContextKeys.responseContainsCodeBlock,
    TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate()
  ),
  icon: Codicon.play,
  keybinding: {
    when: TerminalChatContextKeys.requestActive.negate(),
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.CtrlCmd | KeyCode.Enter
  },
  menu: {
    id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
    group: "0_main",
    order: 0,
    when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate(), TerminalChatContextKeys.requestActive.negate())
  },
  run: (_xterm, _accessor, activeInstance) => {
    if (isDetachedTerminalInstance(activeInstance)) {
      return;
    }
    const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
    contr?.terminalChatWidget?.acceptCommand(true);
  }
});
registerActiveXtermAction({
  id: TerminalChatCommandId.RunFirstCommand,
  title: localize2("runFirstCommand", "Run First Chat Command"),
  shortTitle: localize2("runFirst", "Run First"),
  category: AbstractInlineChatAction.category,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalChatContextKeys.requestActive.negate(),
    TerminalChatContextKeys.responseContainsMultipleCodeBlocks
  ),
  icon: Codicon.play,
  keybinding: {
    when: TerminalChatContextKeys.requestActive.negate(),
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.CtrlCmd | KeyCode.Enter
  },
  menu: {
    id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
    group: "0_main",
    order: 0,
    when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsMultipleCodeBlocks, TerminalChatContextKeys.requestActive.negate())
  },
  run: (_xterm, _accessor, activeInstance) => {
    if (isDetachedTerminalInstance(activeInstance)) {
      return;
    }
    const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
    contr?.terminalChatWidget?.acceptCommand(true);
  }
});
registerActiveXtermAction({
  id: TerminalChatCommandId.InsertCommand,
  title: localize2("insertCommand", "Insert Chat Command"),
  shortTitle: localize2("insert", "Insert"),
  category: AbstractInlineChatAction.category,
  icon: Codicon.insert,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalChatContextKeys.requestActive.negate(),
    TerminalChatContextKeys.responseContainsCodeBlock,
    TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate()
  ),
  keybinding: {
    when: TerminalChatContextKeys.requestActive.negate(),
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.Alt | KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.Enter | KeyMod.Alt]
  },
  menu: {
    id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
    group: "0_main",
    order: 1,
    when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate(), TerminalChatContextKeys.requestActive.negate())
  },
  run: (_xterm, _accessor, activeInstance) => {
    if (isDetachedTerminalInstance(activeInstance)) {
      return;
    }
    const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
    contr?.terminalChatWidget?.acceptCommand(false);
  }
});
registerActiveXtermAction({
  id: TerminalChatCommandId.InsertFirstCommand,
  title: localize2("insertFirstCommand", "Insert First Chat Command"),
  shortTitle: localize2("insertFirst", "Insert First"),
  category: AbstractInlineChatAction.category,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalChatContextKeys.requestActive.negate(),
    TerminalChatContextKeys.responseContainsMultipleCodeBlocks
  ),
  keybinding: {
    when: TerminalChatContextKeys.requestActive.negate(),
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.Alt | KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.Enter | KeyMod.Alt]
  },
  menu: {
    id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
    group: "0_main",
    order: 1,
    when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsMultipleCodeBlocks, TerminalChatContextKeys.requestActive.negate())
  },
  run: (_xterm, _accessor, activeInstance) => {
    if (isDetachedTerminalInstance(activeInstance)) {
      return;
    }
    const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
    contr?.terminalChatWidget?.acceptCommand(false);
  }
});
registerActiveXtermAction({
  id: TerminalChatCommandId.RerunRequest,
  title: localize2("chat.rerun.label", "Rerun Request"),
  f1: false,
  icon: Codicon.refresh,
  category: AbstractInlineChatAction.category,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalChatContextKeys.requestActive.negate()
  ),
  keybinding: {
    weight: KeybindingWeight.WorkbenchContrib,
    primary: KeyMod.CtrlCmd | KeyCode.KeyR,
    when: TerminalChatContextKeys.focused
  },
  menu: {
    id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
    group: "0_main",
    order: 5,
    when: ContextKeyExpr.and(TerminalChatContextKeys.inputHasText.toNegated(), TerminalChatContextKeys.requestActive.negate())
  },
  run: async (_xterm, _accessor, activeInstance) => {
    const chatService = _accessor.get(IChatService);
    const chatWidgetService = _accessor.get(IChatWidgetService);
    const contr = TerminalChatController.activeChatController;
    const model = contr?.terminalChatWidget?.inlineChatWidget.chatWidget.viewModel?.model;
    if (!model) {
      return;
    }
    const lastRequest = model.getRequests().at(-1);
    if (lastRequest) {
      const widget = chatWidgetService.getWidgetBySessionResource(model.sessionResource);
      await chatService.resendRequest(lastRequest, {
        noCommandDetection: false,
        attempt: lastRequest.attempt + 1,
        location: ChatAgentLocation.Terminal,
        userSelectedModelId: widget?.input.currentLanguageModel
      });
    }
  }
});
registerActiveXtermAction({
  id: TerminalChatCommandId.ViewInChat,
  title: localize2("viewInChat", "View in Chat"),
  category: AbstractInlineChatAction.category,
  precondition: ContextKeyExpr.and(
    ChatContextKeys.enabled,
    ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
    TerminalChatContextKeys.requestActive.negate()
  ),
  icon: Codicon.chatSparkle,
  menu: [{
    id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
    group: "zzz",
    order: 1,
    isHiddenByDefault: true,
    when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.requestActive.negate())
  }],
  run: (_xterm, _accessor, activeInstance) => {
    if (isDetachedTerminalInstance(activeInstance)) {
      return;
    }
    const contr = TerminalChatController.activeChatController || TerminalChatController.get(activeInstance);
    contr?.viewInChat();
  }
});
registerAction2(class ShowChatTerminalsAction extends Action2 {
  constructor() {
    super({
      id: TerminalChatCommandId.ViewHiddenChatTerminals,
      title: localize2("viewHiddenChatTerminals", "View Hidden Chat Terminals"),
      category: localize2("terminalCategory2", "Terminal"),
      f1: true,
      precondition: ContextKeyExpr.and(TerminalChatContextKeys.hasHiddenChatTerminals, ChatContextKeys.enabled),
      menu: [{
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.and(TerminalChatContextKeys.hasHiddenChatTerminals, ContextKeyExpr.equals("view", ChatViewId)),
        group: "terminal",
        order: 0,
        isHiddenByDefault: true
      }]
    });
  }
  async run(accessor) {
    const terminalService = accessor.get(ITerminalService);
    const groupService = accessor.get(ITerminalGroupService);
    const editorService = accessor.get(ITerminalEditorService);
    const terminalChatService = accessor.get(ITerminalChatService);
    const quickInputService = accessor.get(IQuickInputService);
    const instantiationService = accessor.get(IInstantiationService);
    const chatService = accessor.get(IChatService);
    const telemetryService = accessor.get(ITelemetryService);
    const visible = /* @__PURE__ */ new Set([...groupService.instances, ...editorService.instances]);
    const toolInstances = terminalChatService.getToolSessionTerminalInstances();
    if (toolInstances.length === 0) {
      return;
    }
    const all = /* @__PURE__ */ new Map();
    for (const i of toolInstances) {
      if (!visible.has(i)) {
        all.set(i.instanceId, i);
      }
    }
    if (all.size === 0) {
      return;
    }
    telemetryService.publicLog2("terminal.chatViewHiddenTerminals", {
      hiddenCount: all.size
    });
    if (all.size === 1) {
      const instance = Array.from(all.values())[0];
      terminalService.setActiveInstance(instance);
      await terminalService.revealTerminal(instance);
      await terminalService.focusInstance(instance);
      this._logRevealHiddenTerminal(telemetryService, "single");
      return;
    }
    const items = [];
    const lastCommandLocalized = (command) => localize2("chatTerminal.lastCommand", "Last: {0}", command).value;
    const MAX_DETAIL_LENGTH = 80;
    const metas = [];
    for (const instance of all.values()) {
      const iconId = instantiationService.invokeFunction(getIconId, instance);
      const label = `$(${iconId}) ${instance.title}`;
      const lastCommand = instance.capabilities.get(TerminalCapability.CommandDetection)?.commands.at(-1)?.command;
      const chatSessionResource = terminalChatService.getChatSessionResourceForInstance(instance);
      let chatSessionTitle;
      if (chatSessionResource) {
        const liveTitle = chatService.getSession(chatSessionResource)?.title;
        chatSessionTitle = liveTitle ?? chatService.getSessionTitle(chatSessionResource);
      }
      const description = chatSessionTitle;
      let detail;
      let tooltip;
      if (lastCommand) {
        const commandLines = lastCommand.split("\n");
        const firstLine = commandLines[0];
        const displayCommand = firstLine.length > MAX_DETAIL_LENGTH ? firstLine.substring(0, MAX_DETAIL_LENGTH) + "\u2026" : firstLine;
        detail = lastCommandLocalized(displayCommand);
        const wasTruncated = firstLine.length > MAX_DETAIL_LENGTH;
        const hasMultipleLines = commandLines.length > 1;
        if (wasTruncated || hasMultipleLines) {
          if (hasMultipleLines) {
            tooltip = { value: `\`\`\`
${lastCommand}
\`\`\``, supportThemeIcons: true };
          } else {
            tooltip = lastCommandLocalized(lastCommand);
          }
        }
      }
      metas.push({
        label,
        description,
        detail,
        tooltip,
        id: String(instance.instanceId)
      });
    }
    for (const m of metas) {
      items.push({
        label: m.label,
        description: m.description,
        detail: m.detail,
        tooltip: m.tooltip,
        id: m.id
      });
    }
    const qp = quickInputService.createQuickPick();
    qp.placeholder = localize2("selectChatTerminal", "Select a chat terminal to show and focus").value;
    qp.items = items;
    qp.canSelectMany = false;
    qp.title = localize2("showChatTerminals.title", "Chat Terminals").value;
    qp.matchOnDescription = true;
    qp.matchOnDetail = true;
    const qpDisposables = new DisposableStore();
    qpDisposables.add(qp);
    qpDisposables.add(qp.onDidAccept(async () => {
      const sel = qp.selectedItems[0];
      if (sel) {
        const instance = all.get(Number(sel.id));
        if (instance) {
          terminalService.setActiveInstance(instance);
          await terminalService.revealTerminal(instance);
          qp.hide();
          await terminalService.focusInstance(instance);
          this._logRevealHiddenTerminal(telemetryService, "quickPick");
        } else {
          qp.hide();
        }
      } else {
        qp.hide();
      }
    }));
    qpDisposables.add(qp.onDidHide(() => {
      qpDisposables.dispose();
      qp.dispose();
    }));
    qp.show();
  }
  _logRevealHiddenTerminal(telemetryService, via) {
    telemetryService.publicLog2("terminal.chatRevealHiddenTerminal", { via });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: TerminalChatCommandId.FocusMostRecentChatTerminal,
  weight: KeybindingWeight.WorkbenchContrib,
  when: ChatContextKeys.inChatSession,
  handler: async (accessor) => {
    const terminalChatService = accessor.get(ITerminalChatService);
    const part = terminalChatService.getMostRecentProgressPart();
    if (!part) {
      return;
    }
    await part.focusTerminal();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: TerminalChatCommandId.FocusMostRecentChatTerminalOutput,
  weight: KeybindingWeight.WorkbenchContrib,
  when: ChatContextKeys.inChatSession,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyO,
  handler: async (accessor) => {
    const terminalChatService = accessor.get(ITerminalChatService);
    const part = terminalChatService.getMostRecentProgressPart();
    if (!part) {
      return;
    }
    await part.toggleOutputFromKeyboard();
  }
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: TerminalChatCommandId.FocusMostRecentChatTerminal,
    title: localize("chat.focusMostRecentTerminal", "Chat: Focus Most Recent Terminal")
  },
  when: ChatContextKeys.inChatSession
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: TerminalChatCommandId.FocusMostRecentChatTerminalOutput,
    title: localize("chat.focusMostRecentTerminalOutput", "Chat: Focus Most Recent Terminal Output")
  },
  when: ChatContextKeys.inChatSession
});
CommandsRegistry.registerCommand(TerminalChatCommandId.OpenTerminalSettingsLink, async (accessor, scopeRaw) => {
  const preferencesService = accessor.get(IPreferencesService);
  if (scopeRaw === "global") {
    preferencesService.openSettings({
      query: `@id:${ChatConfiguration.GlobalAutoApprove}`
    });
  } else {
    const scope = parseInt(scopeRaw);
    const target = !isNaN(scope) ? scope : void 0;
    const options = {
      jsonEditor: true,
      revealSetting: {
        key: TerminalChatAgentToolsSettingId.AutoApprove
      }
    };
    switch (target) {
      case ConfigurationTarget.APPLICATION:
        preferencesService.openApplicationSettings(options);
        break;
      case ConfigurationTarget.USER:
      case ConfigurationTarget.USER_LOCAL:
        preferencesService.openUserSettings(options);
        break;
      case ConfigurationTarget.USER_REMOTE:
        preferencesService.openRemoteSettings(options);
        break;
      case ConfigurationTarget.WORKSPACE:
      case ConfigurationTarget.WORKSPACE_FOLDER:
        preferencesService.openWorkspaceSettings(options);
        break;
      default: {
        preferencesService.openSettings({
          target: ConfigurationTarget.USER,
          query: `@id:${TerminalChatAgentToolsSettingId.AutoApprove}`
        });
        break;
      }
    }
  }
});
CommandsRegistry.registerCommand(TerminalChatCommandId.DisableSessionAutoApproval, async (accessor, chatSessionResource) => {
  const terminalChatService = accessor.get(ITerminalChatService);
  terminalChatService.setChatSessionAutoApproval(chatSessionResource, false);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdFxcYnJvd3NlclxcdGVybWluYWxDaGF0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENoYXRWaWV3SWQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5cbmltcG9ydCB7IGlzRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxDaGF0U2VydmljZSwgSVRlcm1pbmFsRWRpdG9yU2VydmljZSwgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxBY3Rpb25zLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cCB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxNZW51cy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyBNRU5VX1RFUk1JTkFMX0NIQVRfV0lER0VUX1NUQVRVUywgVGVybWluYWxDaGF0Q29tbWFuZElkLCBUZXJtaW5hbENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4vdGVybWluYWxDaGF0LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0SWNvbklkIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEljb24uanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0Q29udHJvbGxlciB9IGZyb20gJy4vdGVybWluYWxDaGF0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlLCBJT3BlblNldHRpbmdzT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY2hhdEFnZW50VG9vbHMvY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0QWN0aW9ucy5qcyc7XG5cbnJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRpZDogVGVybWluYWxDaGF0Q29tbWFuZElkLlN0YXJ0LFxuXHR0aXRsZTogbG9jYWxpemUyKCdzdGFydENoYXQnLCAnT3BlbiBJbmxpbmUgQ2hhdCcpLFxuXHRjYXRlZ29yeTogbG9jYWxpemUyKCd0ZXJtaW5hbENhdGVnb3J5JywgXCJUZXJtaW5hbFwiKSxcblx0a2V5YmluZGluZzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzSW5BbnkpLFxuXHRcdC8vIEhBQ0s6IEZvcmNlIHdlaWdodCB0byBiZSBoaWdoZXIgdGhhbiB0aGUgZXh0ZW5zaW9uIGNvbnRyaWJ1dGVkIGtleWJpbmRpbmcgdG8gb3ZlcnJpZGUgaXQgdW50aWwgaXQgZ2V0cyByZXBsYWNlZFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FeHRlcm5hbEV4dGVuc2lvbiArIDEsIC8vIEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0fSxcblx0ZjE6IHRydWUsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSxcblx0XHRUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5oYXNDaGF0QWdlbnRcblx0KSxcblx0bWVudToge1xuXHRcdGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsXG5cdFx0Z3JvdXA6IFRlcm1pbmFsQ29udGV4dE1lbnVHcm91cC5DaGF0LFxuXHRcdG9yZGVyOiAyLFxuXHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdH0sXG5cdHJ1bjogKF94dGVybSwgX2FjY2Vzc29yLCBhY3RpdmVJbnN0YW5jZSwgb3B0cz86IHVua25vd24pID0+IHtcblx0XHRpZiAoaXNEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UoYWN0aXZlSW5zdGFuY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHIgPSBUZXJtaW5hbENoYXRDb250cm9sbGVyLmFjdGl2ZUNoYXRDb250cm9sbGVyIHx8IFRlcm1pbmFsQ2hhdENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUluc3RhbmNlKTtcblx0XHRpZiAoIWNvbnRyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG9wdHMpIHtcblx0XHRcdGZ1bmN0aW9uIGlzVmFsaWRPcHRpb25zT2JqZWN0KG9iajogdW5rbm93bik6IG9iaiBpcyB7IHF1ZXJ5OiBzdHJpbmc7IGlzUGFydGlhbFF1ZXJ5PzogYm9vbGVhbiB9IHtcblx0XHRcdFx0cmV0dXJuIHR5cGVvZiBvYmogPT09ICdvYmplY3QnICYmIG9iaiAhPT0gbnVsbCAmJiAncXVlcnknIGluIG9iaiAmJiBpc1N0cmluZyhvYmoucXVlcnkpO1xuXHRcdFx0fVxuXHRcdFx0b3B0cyA9IGlzU3RyaW5nKG9wdHMpID8geyBxdWVyeTogb3B0cyB9IDogb3B0cztcblx0XHRcdGlmIChpc1ZhbGlkT3B0aW9uc09iamVjdChvcHRzKSkge1xuXHRcdFx0XHRjb250ci51cGRhdGVJbnB1dChvcHRzLnF1ZXJ5LCBmYWxzZSk7XG5cdFx0XHRcdGlmICghb3B0cy5pc1BhcnRpYWxRdWVyeSkge1xuXHRcdFx0XHRcdGNvbnRyLnRlcm1pbmFsQ2hhdFdpZGdldD8uYWNjZXB0SW5wdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0Y29udHIudGVybWluYWxDaGF0V2lkZ2V0Py5yZXZlYWwoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRpZDogVGVybWluYWxDaGF0Q29tbWFuZElkLkNsb3NlLFxuXHR0aXRsZTogbG9jYWxpemUyKCdjbG9zZUNoYXQnLCAnQ2xvc2UnKSxcblx0Y2F0ZWdvcnk6IEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbi5jYXRlZ29yeSxcblx0a2V5YmluZGluZzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMuZm9jdXMsIFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLmZvY3VzZWQpLFxuXHRcdFx0VGVybWluYWxDaGF0Q29udGV4dEtleXMudmlzaWJsZVxuXHRcdCksXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdH0sXG5cdG1lbnU6IFt7XG5cdFx0aWQ6IE1FTlVfVEVSTUlOQUxfQ0hBVF9XSURHRVRfU1RBVFVTLFxuXHRcdGdyb3VwOiAnMF9tYWluJyxcblx0XHRvcmRlcjogMixcblx0fV0sXG5cdGljb246IENvZGljb24uY2xvc2UsXG5cdGYxOiB0cnVlLFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRUZXJtaW5hbENoYXRDb250ZXh0S2V5cy52aXNpYmxlLFxuXHQpLFxuXHRydW46IChfeHRlcm0sIF9hY2Nlc3NvciwgYWN0aXZlSW5zdGFuY2UpID0+IHtcblx0XHRpZiAoaXNEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UoYWN0aXZlSW5zdGFuY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyID0gVGVybWluYWxDaGF0Q29udHJvbGxlci5hY3RpdmVDaGF0Q29udHJvbGxlciB8fCBUZXJtaW5hbENoYXRDb250cm9sbGVyLmdldChhY3RpdmVJbnN0YW5jZSk7XG5cdFx0Y29udHI/LnRlcm1pbmFsQ2hhdFdpZGdldD8uY2xlYXIoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRpZDogVGVybWluYWxDaGF0Q29tbWFuZElkLlJ1bkNvbW1hbmQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1bkNvbW1hbmQnLCAnUnVuIENoYXQgQ29tbWFuZCcpLFxuXHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ3J1bicsICdSdW4nKSxcblx0Y2F0ZWdvcnk6IEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbi5jYXRlZ29yeSxcblx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0Q29udGV4dEtleUV4cHIub3IoVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLCBUZXJtaW5hbENvbnRleHRLZXlzLnRlcm1pbmFsSGFzQmVlbkNyZWF0ZWQpLFxuXHRcdFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnJlcXVlc3RBY3RpdmUubmVnYXRlKCksXG5cdFx0VGVybWluYWxDaGF0Q29udGV4dEtleXMucmVzcG9uc2VDb250YWluc0NvZGVCbG9jayxcblx0XHRUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUNvbnRhaW5zTXVsdGlwbGVDb2RlQmxvY2tzLm5lZ2F0ZSgpXG5cdCksXG5cdGljb246IENvZGljb24ucGxheSxcblx0a2V5YmluZGluZzoge1xuXHRcdHdoZW46IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnJlcXVlc3RBY3RpdmUubmVnYXRlKCksXG5cdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHR9LFxuXHRtZW51OiB7XG5cdFx0aWQ6IE1FTlVfVEVSTUlOQUxfQ0hBVF9XSURHRVRfU1RBVFVTLFxuXHRcdGdyb3VwOiAnMF9tYWluJyxcblx0XHRvcmRlcjogMCxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVzcG9uc2VDb250YWluc0NvZGVCbG9jaywgVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVzcG9uc2VDb250YWluc011bHRpcGxlQ29kZUJsb2Nrcy5uZWdhdGUoKSwgVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSlcblx0fSxcblx0cnVuOiAoX3h0ZXJtLCBfYWNjZXNzb3IsIGFjdGl2ZUluc3RhbmNlKSA9PiB7XG5cdFx0aWYgKGlzRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlKGFjdGl2ZUluc3RhbmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250ciA9IFRlcm1pbmFsQ2hhdENvbnRyb2xsZXIuYWN0aXZlQ2hhdENvbnRyb2xsZXIgfHwgVGVybWluYWxDaGF0Q29udHJvbGxlci5nZXQoYWN0aXZlSW5zdGFuY2UpO1xuXHRcdGNvbnRyPy50ZXJtaW5hbENoYXRXaWRnZXQ/LmFjY2VwdENvbW1hbmQodHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5SdW5GaXJzdENvbW1hbmQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1bkZpcnN0Q29tbWFuZCcsICdSdW4gRmlyc3QgQ2hhdCBDb21tYW5kJyksXG5cdHNob3J0VGl0bGU6IGxvY2FsaXplMigncnVuRmlyc3QnLCAnUnVuIEZpcnN0JyksXG5cdGNhdGVnb3J5OiBBYnN0cmFjdElubGluZUNoYXRBY3Rpb24uY2F0ZWdvcnksXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSxcblx0XHRUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0QWN0aXZlLm5lZ2F0ZSgpLFxuXHRcdFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlQ29udGFpbnNNdWx0aXBsZUNvZGVCbG9ja3Ncblx0KSxcblx0aWNvbjogQ29kaWNvbi5wbGF5LFxuXHRrZXliaW5kaW5nOiB7XG5cdFx0d2hlbjogVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdH0sXG5cdG1lbnU6IHtcblx0XHRpZDogTUVOVV9URVJNSU5BTF9DSEFUX1dJREdFVF9TVEFUVVMsXG5cdFx0Z3JvdXA6ICcwX21haW4nLFxuXHRcdG9yZGVyOiAwLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUNvbnRhaW5zTXVsdGlwbGVDb2RlQmxvY2tzLCBUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0QWN0aXZlLm5lZ2F0ZSgpKVxuXHR9LFxuXHRydW46IChfeHRlcm0sIF9hY2Nlc3NvciwgYWN0aXZlSW5zdGFuY2UpID0+IHtcblx0XHRpZiAoaXNEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UoYWN0aXZlSW5zdGFuY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyID0gVGVybWluYWxDaGF0Q29udHJvbGxlci5hY3RpdmVDaGF0Q29udHJvbGxlciB8fCBUZXJtaW5hbENoYXRDb250cm9sbGVyLmdldChhY3RpdmVJbnN0YW5jZSk7XG5cdFx0Y29udHI/LnRlcm1pbmFsQ2hhdFdpZGdldD8uYWNjZXB0Q29tbWFuZCh0cnVlKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aXZlWHRlcm1BY3Rpb24oe1xuXHRpZDogVGVybWluYWxDaGF0Q29tbWFuZElkLkluc2VydENvbW1hbmQsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydENvbW1hbmQnLCAnSW5zZXJ0IENoYXQgQ29tbWFuZCcpLFxuXHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydCcsICdJbnNlcnQnKSxcblx0Y2F0ZWdvcnk6IEFic3RyYWN0SW5saW5lQ2hhdEFjdGlvbi5jYXRlZ29yeSxcblx0aWNvbjogQ29kaWNvbi5pbnNlcnQsXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdENvbnRleHRLZXlFeHByLm9yKFRlcm1pbmFsQ29udGV4dEtleXMucHJvY2Vzc1N1cHBvcnRlZCwgVGVybWluYWxDb250ZXh0S2V5cy50ZXJtaW5hbEhhc0JlZW5DcmVhdGVkKSxcblx0XHRUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0QWN0aXZlLm5lZ2F0ZSgpLFxuXHRcdFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLnJlc3BvbnNlQ29udGFpbnNDb2RlQmxvY2ssXG5cdFx0VGVybWluYWxDaGF0Q29udGV4dEtleXMucmVzcG9uc2VDb250YWluc011bHRpcGxlQ29kZUJsb2Nrcy5uZWdhdGUoKVxuXHQpLFxuXHRrZXliaW5kaW5nOiB7XG5cdFx0d2hlbjogVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSxcblx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbnRlcixcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIgfCBLZXlNb2QuQWx0XVxuXHR9LFxuXHRtZW51OiB7XG5cdFx0aWQ6IE1FTlVfVEVSTUlOQUxfQ0hBVF9XSURHRVRfU1RBVFVTLFxuXHRcdGdyb3VwOiAnMF9tYWluJyxcblx0XHRvcmRlcjogMSxcblx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVzcG9uc2VDb250YWluc0NvZGVCbG9jaywgVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVzcG9uc2VDb250YWluc011bHRpcGxlQ29kZUJsb2Nrcy5uZWdhdGUoKSwgVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSlcblx0fSxcblx0cnVuOiAoX3h0ZXJtLCBfYWNjZXNzb3IsIGFjdGl2ZUluc3RhbmNlKSA9PiB7XG5cdFx0aWYgKGlzRGV0YWNoZWRUZXJtaW5hbEluc3RhbmNlKGFjdGl2ZUluc3RhbmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb250ciA9IFRlcm1pbmFsQ2hhdENvbnRyb2xsZXIuYWN0aXZlQ2hhdENvbnRyb2xsZXIgfHwgVGVybWluYWxDaGF0Q29udHJvbGxlci5nZXQoYWN0aXZlSW5zdGFuY2UpO1xuXHRcdGNvbnRyPy50ZXJtaW5hbENoYXRXaWRnZXQ/LmFjY2VwdENvbW1hbmQoZmFsc2UpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3RpdmVYdGVybUFjdGlvbih7XG5cdGlkOiBUZXJtaW5hbENoYXRDb21tYW5kSWQuSW5zZXJ0Rmlyc3RDb21tYW5kLFxuXHR0aXRsZTogbG9jYWxpemUyKCdpbnNlcnRGaXJzdENvbW1hbmQnLCAnSW5zZXJ0IEZpcnN0IENoYXQgQ29tbWFuZCcpLFxuXHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ2luc2VydEZpcnN0JywgJ0luc2VydCBGaXJzdCcpLFxuXHRjYXRlZ29yeTogQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uLmNhdGVnb3J5LFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksXG5cdFx0VGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSxcblx0XHRUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUNvbnRhaW5zTXVsdGlwbGVDb2RlQmxvY2tzXG5cdCksXG5cdGtleWJpbmRpbmc6IHtcblx0XHR3aGVuOiBUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0QWN0aXZlLm5lZ2F0ZSgpLFxuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5FbnRlciB8IEtleU1vZC5BbHRdXG5cdH0sXG5cdG1lbnU6IHtcblx0XHRpZDogTUVOVV9URVJNSU5BTF9DSEFUX1dJREdFVF9TVEFUVVMsXG5cdFx0Z3JvdXA6ICcwX21haW4nLFxuXHRcdG9yZGVyOiAxLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUNvbnRhaW5zTXVsdGlwbGVDb2RlQmxvY2tzLCBUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0QWN0aXZlLm5lZ2F0ZSgpKVxuXHR9LFxuXHRydW46IChfeHRlcm0sIF9hY2Nlc3NvciwgYWN0aXZlSW5zdGFuY2UpID0+IHtcblx0XHRpZiAoaXNEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UoYWN0aXZlSW5zdGFuY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyID0gVGVybWluYWxDaGF0Q29udHJvbGxlci5hY3RpdmVDaGF0Q29udHJvbGxlciB8fCBUZXJtaW5hbENoYXRDb250cm9sbGVyLmdldChhY3RpdmVJbnN0YW5jZSk7XG5cdFx0Y29udHI/LnRlcm1pbmFsQ2hhdFdpZGdldD8uYWNjZXB0Q29tbWFuZChmYWxzZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5SZXJ1blJlcXVlc3QsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2NoYXQucmVydW4ubGFiZWwnLCBcIlJlcnVuIFJlcXVlc3RcIiksXG5cdGYxOiBmYWxzZSxcblx0aWNvbjogQ29kaWNvbi5yZWZyZXNoLFxuXHRjYXRlZ29yeTogQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uLmNhdGVnb3J5LFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksXG5cdFx0VGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSxcblx0KSxcblx0a2V5YmluZGluZzoge1xuXHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlSLFxuXHRcdHdoZW46IFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLmZvY3VzZWRcblx0fSxcblx0bWVudToge1xuXHRcdGlkOiBNRU5VX1RFUk1JTkFMX0NIQVRfV0lER0VUX1NUQVRVUyxcblx0XHRncm91cDogJzBfbWFpbicsXG5cdFx0b3JkZXI6IDUsXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzVGV4dC50b05lZ2F0ZWQoKSwgVGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSlcblx0fSxcblx0cnVuOiBhc3luYyAoX3h0ZXJtLCBfYWNjZXNzb3IsIGFjdGl2ZUluc3RhbmNlKSA9PiB7XG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBfYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBfYWNjZXNzb3IuZ2V0KElDaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0Y29uc3QgY29udHIgPSBUZXJtaW5hbENoYXRDb250cm9sbGVyLmFjdGl2ZUNoYXRDb250cm9sbGVyO1xuXHRcdGNvbnN0IG1vZGVsID0gY29udHI/LnRlcm1pbmFsQ2hhdFdpZGdldD8uaW5saW5lQ2hhdFdpZGdldC5jaGF0V2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWw7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RSZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0aWYgKGxhc3RSZXF1ZXN0KSB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSBjaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgY2hhdFNlcnZpY2UucmVzZW5kUmVxdWVzdChsYXN0UmVxdWVzdCwge1xuXHRcdFx0XHRub0NvbW1hbmREZXRlY3Rpb246IGZhbHNlLFxuXHRcdFx0XHRhdHRlbXB0OiBsYXN0UmVxdWVzdC5hdHRlbXB0ICsgMSxcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsLFxuXHRcdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbElkOiB3aWRnZXQ/LmlucHV0LmN1cnJlbnRMYW5ndWFnZU1vZGVsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGl2ZVh0ZXJtQWN0aW9uKHtcblx0aWQ6IFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5WaWV3SW5DaGF0LFxuXHR0aXRsZTogbG9jYWxpemUyKCd2aWV3SW5DaGF0JywgJ1ZpZXcgaW4gQ2hhdCcpLFxuXHRjYXRlZ29yeTogQWJzdHJhY3RJbmxpbmVDaGF0QWN0aW9uLmNhdGVnb3J5LFxuXHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRDb250ZXh0S2V5RXhwci5vcihUZXJtaW5hbENvbnRleHRLZXlzLnByb2Nlc3NTdXBwb3J0ZWQsIFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZCksXG5cdFx0VGVybWluYWxDaGF0Q29udGV4dEtleXMucmVxdWVzdEFjdGl2ZS5uZWdhdGUoKSxcblx0KSxcblx0aWNvbjogQ29kaWNvbi5jaGF0U3BhcmtsZSxcblx0bWVudTogW3tcblx0XHRpZDogTUVOVV9URVJNSU5BTF9DSEFUX1dJREdFVF9TVEFUVVMsXG5cdFx0Z3JvdXA6ICd6enonLFxuXHRcdG9yZGVyOiAxLFxuXHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlLFxuXHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXNwb25zZUNvbnRhaW5zQ29kZUJsb2NrLCBUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5yZXF1ZXN0QWN0aXZlLm5lZ2F0ZSgpKSxcblx0fV0sXG5cdHJ1bjogKF94dGVybSwgX2FjY2Vzc29yLCBhY3RpdmVJbnN0YW5jZSkgPT4ge1xuXHRcdGlmIChpc0RldGFjaGVkVGVybWluYWxJbnN0YW5jZShhY3RpdmVJbnN0YW5jZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29udHIgPSBUZXJtaW5hbENoYXRDb250cm9sbGVyLmFjdGl2ZUNoYXRDb250cm9sbGVyIHx8IFRlcm1pbmFsQ2hhdENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUluc3RhbmNlKTtcblx0XHRjb250cj8udmlld0luQ2hhdCgpO1xuXHR9XG59KTtcblxudHlwZSBWaWV3SGlkZGVuQ2hhdFRlcm1pbmFsc0V2ZW50ID0ge1xuXHRoaWRkZW5Db3VudDogbnVtYmVyO1xufTtcbnR5cGUgVmlld0hpZGRlbkNoYXRUZXJtaW5hbHNDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdhbnRob255a2ltMSc7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgd2hlbiB0aGUgdXNlciBvcGVucyB0aGUgaGlkZGVuIGNoYXQgdGVybWluYWxzIFVJIHRvIHVuZGVyc3RhbmQgaG93IG9mdGVuIHVzZXJzIG5lZWQgdG8gcmVhY2ggaW50byBhZ2VudC1vd25lZCB0ZXJtaW5hbHMuJztcblx0aGlkZGVuQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGhpZGRlbiBjaGF0IHRlcm1pbmFscyB0aGF0IGV4aXN0ZWQgd2hlbiB0aGUgYWN0aW9uIHdhcyBpbnZva2VkLiBBIHZhbHVlIG9mIDEgcmV2ZWFscyB0aGUgdGVybWluYWwgZGlyZWN0bHksIHdoaWxlIG1vcmUgdGhhbiAxIHNob3dzIGEgcXVpY2sgcGljay4nIH07XG59O1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU2hvd0NoYXRUZXJtaW5hbHNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5WaWV3SGlkZGVuQ2hhdFRlcm1pbmFscyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3ZpZXdIaWRkZW5DaGF0VGVybWluYWxzJywgJ1ZpZXcgSGlkZGVuIENoYXQgVGVybWluYWxzJyksXG5cdFx0XHRjYXRlZ29yeTogbG9jYWxpemUyKCd0ZXJtaW5hbENhdGVnb3J5MicsICdUZXJtaW5hbCcpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChUZXJtaW5hbENoYXRDb250ZXh0S2V5cy5oYXNIaWRkZW5DaGF0VGVybWluYWxzLCBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCksXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlcm1pbmFsQ2hhdENvbnRleHRLZXlzLmhhc0hpZGRlbkNoYXRUZXJtaW5hbHMsIENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIENoYXRWaWV3SWQpKSxcblx0XHRcdFx0Z3JvdXA6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRpc0hpZGRlbkJ5RGVmYXVsdDogdHJ1ZVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxTZXJ2aWNlKTtcblx0XHRjb25zdCBncm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsR3JvdXBTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXJtaW5hbEVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlcm1pbmFsQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdmlzaWJsZSA9IG5ldyBTZXQ8SVRlcm1pbmFsSW5zdGFuY2U+KFsuLi5ncm91cFNlcnZpY2UuaW5zdGFuY2VzLCAuLi5lZGl0b3JTZXJ2aWNlLmluc3RhbmNlc10pO1xuXHRcdGNvbnN0IHRvb2xJbnN0YW5jZXMgPSB0ZXJtaW5hbENoYXRTZXJ2aWNlLmdldFRvb2xTZXNzaW9uVGVybWluYWxJbnN0YW5jZXMoKTtcblxuXHRcdGlmICh0b29sSW5zdGFuY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbCA9IG5ldyBNYXA8bnVtYmVyLCBJVGVybWluYWxJbnN0YW5jZT4oKTtcblxuXHRcdGZvciAoY29uc3QgaSBvZiB0b29sSW5zdGFuY2VzKSB7XG5cdFx0XHRpZiAoIXZpc2libGUuaGFzKGkpKSB7XG5cdFx0XHRcdGFsbC5zZXQoaS5pbnN0YW5jZUlkLCBpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBhcmUgbm8gaGlkZGVuIHRlcm1pbmFscywgcmV0dXJuIGVhcmx5XG5cdFx0aWYgKGFsbC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZpZXdIaWRkZW5DaGF0VGVybWluYWxzRXZlbnQsIFZpZXdIaWRkZW5DaGF0VGVybWluYWxzQ2xhc3NpZmljYXRpb24+KCd0ZXJtaW5hbC5jaGF0Vmlld0hpZGRlblRlcm1pbmFscycsIHtcblx0XHRcdGhpZGRlbkNvdW50OiBhbGwuc2l6ZSxcblx0XHR9KTtcblxuXHRcdC8vIElmIHRoZXJlJ3Mgb25seSBvbmUgaGlkZGVuIHRlcm1pbmFsLCBzaG93IGl0IGRpcmVjdGx5IHdpdGhvdXQgdGhlIHF1aWNrIHBpY2tcblx0XHRpZiAoYWxsLnNpemUgPT09IDEpIHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gQXJyYXkuZnJvbShhbGwudmFsdWVzKCkpWzBdO1xuXHRcdFx0dGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGF3YWl0IHRlcm1pbmFsU2VydmljZS5yZXZlYWxUZXJtaW5hbChpbnN0YW5jZSk7XG5cdFx0XHRhd2FpdCB0ZXJtaW5hbFNlcnZpY2UuZm9jdXNJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHR0aGlzLl9sb2dSZXZlYWxIaWRkZW5UZXJtaW5hbCh0ZWxlbWV0cnlTZXJ2aWNlLCAnc2luZ2xlJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXM6IElRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRpbnRlcmZhY2UgSUl0ZW1NZXRhIHtcblx0XHRcdGxhYmVsOiBzdHJpbmc7XG5cdFx0XHRkZXNjcmlwdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZGV0YWlsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHR0b29sdGlwOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZDogc3RyaW5nO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0Q29tbWFuZExvY2FsaXplZCA9IChjb21tYW5kOiBzdHJpbmcpID0+IGxvY2FsaXplMignY2hhdFRlcm1pbmFsLmxhc3RDb21tYW5kJywgJ0xhc3Q6IHswfScsIGNvbW1hbmQpLnZhbHVlO1xuXHRcdGNvbnN0IE1BWF9ERVRBSUxfTEVOR1RIID0gODA7XG5cblx0XHRjb25zdCBtZXRhczogSUl0ZW1NZXRhW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIGFsbC52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgaWNvbklkID0gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0SWNvbklkLCBpbnN0YW5jZSk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGAkKCR7aWNvbklkfSkgJHtpbnN0YW5jZS50aXRsZX1gO1xuXHRcdFx0Y29uc3QgbGFzdENvbW1hbmQgPSBpbnN0YW5jZS5jYXBhYmlsaXRpZXMuZ2V0KFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKT8uY29tbWFuZHMuYXQoLTEpPy5jb21tYW5kO1xuXG5cdFx0XHQvLyBHZXQgdGhlIGNoYXQgc2Vzc2lvbiB0aXRsZVxuXHRcdFx0Y29uc3QgY2hhdFNlc3Npb25SZXNvdXJjZSA9IHRlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0Q2hhdFNlc3Npb25SZXNvdXJjZUZvckluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGxldCBjaGF0U2Vzc2lvblRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoY2hhdFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBsaXZlVGl0bGUgPSBjaGF0U2VydmljZS5nZXRTZXNzaW9uKGNoYXRTZXNzaW9uUmVzb3VyY2UpPy50aXRsZTtcblx0XHRcdFx0Y2hhdFNlc3Npb25UaXRsZSA9IGxpdmVUaXRsZSA/PyBjaGF0U2VydmljZS5nZXRTZXNzaW9uVGl0bGUoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gY2hhdFNlc3Npb25UaXRsZTtcblx0XHRcdGxldCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCB0b29sdGlwOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobGFzdENvbW1hbmQpIHtcblx0XHRcdFx0Ly8gVGFrZSBvbmx5IHRoZSBmaXJzdCBsaW5lIGlmIHRoZSBjb21tYW5kIHNwYW5zIG11bHRpcGxlIGxpbmVzXG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lcyA9IGxhc3RDb21tYW5kLnNwbGl0KCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgZmlyc3RMaW5lID0gY29tbWFuZExpbmVzWzBdO1xuXHRcdFx0XHRjb25zdCBkaXNwbGF5Q29tbWFuZCA9IGZpcnN0TGluZS5sZW5ndGggPiBNQVhfREVUQUlMX0xFTkdUSCA/IGZpcnN0TGluZS5zdWJzdHJpbmcoMCwgTUFYX0RFVEFJTF9MRU5HVEgpICsgJ1x1MjAyNicgOiBmaXJzdExpbmU7XG5cdFx0XHRcdGRldGFpbCA9IGxhc3RDb21tYW5kTG9jYWxpemVkKGRpc3BsYXlDb21tYW5kKTtcblx0XHRcdFx0Ly8gSWYgdGhlIGNvbW1hbmQgd2FzIHRydW5jYXRlZCBvciBoYXMgbXVsdGlwbGUgbGluZXMsIHByb3ZpZGUgYSB0b29sdGlwIHdpdGggdGhlIGZ1bGwgY29tbWFuZFxuXHRcdFx0XHRjb25zdCB3YXNUcnVuY2F0ZWQgPSBmaXJzdExpbmUubGVuZ3RoID4gTUFYX0RFVEFJTF9MRU5HVEg7XG5cdFx0XHRcdGNvbnN0IGhhc011bHRpcGxlTGluZXMgPSBjb21tYW5kTGluZXMubGVuZ3RoID4gMTtcblx0XHRcdFx0aWYgKHdhc1RydW5jYXRlZCB8fCBoYXNNdWx0aXBsZUxpbmVzKSB7XG5cdFx0XHRcdFx0Ly8gVXNlIG1hcmtkb3duIGNvZGUgYmxvY2sgdG8gcHJlc2VydmUgZm9ybWF0dGluZyBmb3IgbXVsdGktbGluZSBjb21tYW5kc1xuXHRcdFx0XHRcdGlmIChoYXNNdWx0aXBsZUxpbmVzKSB7XG5cdFx0XHRcdFx0XHR0b29sdGlwID0geyB2YWx1ZTogYFxcYFxcYFxcYFxcbiR7bGFzdENvbW1hbmR9XFxuXFxgXFxgXFxgYCwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dG9vbHRpcCA9IGxhc3RDb21tYW5kTG9jYWxpemVkKGxhc3RDb21tYW5kKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bWV0YXMucHVzaCh7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdFx0ZGV0YWlsLFxuXHRcdFx0XHR0b29sdGlwLFxuXHRcdFx0XHRpZDogU3RyaW5nKGluc3RhbmNlLmluc3RhbmNlSWQpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBtIG9mIG1ldGFzKSB7XG5cdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IG0ubGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRkZXRhaWw6IG0uZGV0YWlsLFxuXHRcdFx0XHR0b29sdGlwOiBtLnRvb2x0aXAsXG5cdFx0XHRcdGlkOiBtLmlkXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBxcCA9IHF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT4oKTtcblx0XHRxcC5wbGFjZWhvbGRlciA9IGxvY2FsaXplMignc2VsZWN0Q2hhdFRlcm1pbmFsJywgJ1NlbGVjdCBhIGNoYXQgdGVybWluYWwgdG8gc2hvdyBhbmQgZm9jdXMnKS52YWx1ZTtcblx0XHRxcC5pdGVtcyA9IGl0ZW1zO1xuXHRcdHFwLmNhblNlbGVjdE1hbnkgPSBmYWxzZTtcblx0XHRxcC50aXRsZSA9IGxvY2FsaXplMignc2hvd0NoYXRUZXJtaW5hbHMudGl0bGUnLCAnQ2hhdCBUZXJtaW5hbHMnKS52YWx1ZTtcblx0XHRxcC5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdHFwLm1hdGNoT25EZXRhaWwgPSB0cnVlO1xuXHRcdGNvbnN0IHFwRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0cXBEaXNwb3NhYmxlcy5hZGQocXApO1xuXHRcdHFwRGlzcG9zYWJsZXMuYWRkKHFwLm9uRGlkQWNjZXB0KGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlbCA9IHFwLnNlbGVjdGVkSXRlbXNbMF07XG5cdFx0XHRpZiAoc2VsKSB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gYWxsLmdldChOdW1iZXIoc2VsLmlkKSk7XG5cdFx0XHRcdGlmIChpbnN0YW5jZSkge1xuXHRcdFx0XHRcdHRlcm1pbmFsU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHRcdFx0YXdhaXQgdGVybWluYWxTZXJ2aWNlLnJldmVhbFRlcm1pbmFsKGluc3RhbmNlKTtcblx0XHRcdFx0XHRxcC5oaWRlKCk7XG5cdFx0XHRcdFx0YXdhaXQgdGVybWluYWxTZXJ2aWNlLmZvY3VzSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1JldmVhbEhpZGRlblRlcm1pbmFsKHRlbGVtZXRyeVNlcnZpY2UsICdxdWlja1BpY2snKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRxcC5oaWRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHFwLmhpZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cXBEaXNwb3NhYmxlcy5hZGQocXAub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHFwRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0cXAuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblx0XHRxcC5zaG93KCk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2dSZXZlYWxIaWRkZW5UZXJtaW5hbCh0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSwgdmlhOiAnc2luZ2xlJyB8ICdxdWlja1BpY2snKTogdm9pZCB7XG5cdFx0dHlwZSBSZXZlYWxIaWRkZW5DaGF0VGVybWluYWxFdmVudCA9IHtcblx0XHRcdHZpYTogJ3NpbmdsZScgfCAncXVpY2tQaWNrJztcblx0XHR9O1xuXHRcdHR5cGUgUmV2ZWFsSGlkZGVuQ2hhdFRlcm1pbmFsQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2FudGhvbnlraW0xJztcblx0XHRcdGNvbW1lbnQ6ICdUcmFja3Mgd2hlbiB0aGUgdXNlciByZXZlYWxzIGFuZCBmb2N1c2VzIGEgc3BlY2lmaWMgaGlkZGVuIGNoYXQgdGVybWluYWwsIGluZGljYXRpbmcgdGhleSBuZWVkZWQgdG8gaW50ZXJhY3QgZGlyZWN0bHkgd2l0aCBhbiBhZ2VudC1vd25lZCB0ZXJtaW5hbC4nO1xuXHRcdFx0dmlhOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSG93IHRoZSB0ZXJtaW5hbCB3YXMgcmV2ZWFsZWQ6IHNpbmdsZSAob25seSBvbmUgaGlkZGVuIHRlcm1pbmFsKSBvciBxdWlja1BpY2sgKHNlbGVjdGVkIGZyb20gdGhlIGxpc3QpLicgfTtcblx0XHR9O1xuXHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSZXZlYWxIaWRkZW5DaGF0VGVybWluYWxFdmVudCwgUmV2ZWFsSGlkZGVuQ2hhdFRlcm1pbmFsQ2xhc3NpZmljYXRpb24+KCd0ZXJtaW5hbC5jaGF0UmV2ZWFsSGlkZGVuVGVybWluYWwnLCB7IHZpYSB9KTtcblx0fVxufSk7XG5cblxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6IFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5Gb2N1c01vc3RSZWNlbnRDaGF0VGVybWluYWwsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbixcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgdGVybWluYWxDaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxDaGF0U2VydmljZSk7XG5cdFx0Y29uc3QgcGFydCA9IHRlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0TW9zdFJlY2VudFByb2dyZXNzUGFydCgpO1xuXHRcdGlmICghcGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBwYXJ0LmZvY3VzVGVybWluYWwoKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogVGVybWluYWxDaGF0Q29tbWFuZElkLkZvY3VzTW9zdFJlY2VudENoYXRUZXJtaW5hbE91dHB1dCxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleU8sXG5cdGhhbmRsZXI6IGFzeW5jIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHRlcm1pbmFsQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsQ2hhdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHBhcnQgPSB0ZXJtaW5hbENoYXRTZXJ2aWNlLmdldE1vc3RSZWNlbnRQcm9ncmVzc1BhcnQoKTtcblx0XHRpZiAoIXBhcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgcGFydC50b2dnbGVPdXRwdXRGcm9tS2V5Ym9hcmQoKTtcblx0fVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUZXJtaW5hbENoYXRDb21tYW5kSWQuRm9jdXNNb3N0UmVjZW50Q2hhdFRlcm1pbmFsLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5mb2N1c01vc3RSZWNlbnRUZXJtaW5hbCcsICdDaGF0OiBGb2N1cyBNb3N0IFJlY2VudCBUZXJtaW5hbCcpLFxuXHR9LFxuXHR3aGVuOiBDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvblxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBUZXJtaW5hbENoYXRDb21tYW5kSWQuRm9jdXNNb3N0UmVjZW50Q2hhdFRlcm1pbmFsT3V0cHV0LFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5mb2N1c01vc3RSZWNlbnRUZXJtaW5hbE91dHB1dCcsICdDaGF0OiBGb2N1cyBNb3N0IFJlY2VudCBUZXJtaW5hbCBPdXRwdXQnKSxcblx0fSxcblx0d2hlbjogQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb25cbn0pO1xuXG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFRlcm1pbmFsQ2hhdENvbW1hbmRJZC5PcGVuVGVybWluYWxTZXR0aW5nc0xpbmssIGFzeW5jIChhY2Nlc3Nvciwgc2NvcGVSYXc6IHN0cmluZykgPT4ge1xuXHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cblx0aWYgKHNjb3BlUmF3ID09PSAnZ2xvYmFsJykge1xuXHRcdHByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3Moe1xuXHRcdFx0cXVlcnk6IGBAaWQ6JHtDaGF0Q29uZmlndXJhdGlvbi5HbG9iYWxBdXRvQXBwcm92ZX1gXG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0Y29uc3Qgc2NvcGUgPSBwYXJzZUludChzY29wZVJhdyk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gIWlzTmFOKHNjb3BlKSA/IHNjb3BlIGFzIENvbmZpZ3VyYXRpb25UYXJnZXQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMgPSB7XG5cdFx0XHRqc29uRWRpdG9yOiB0cnVlLFxuXHRcdFx0cmV2ZWFsU2V0dGluZzoge1xuXHRcdFx0XHRrZXk6IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUsXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRzd2l0Y2ggKHRhcmdldCkge1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OOiBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlbkFwcGxpY2F0aW9uU2V0dGluZ3Mob3B0aW9ucyk7IGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI6XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDogcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3Mob3B0aW9ucyk7IGJyZWFrO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOiBwcmVmZXJlbmNlc1NlcnZpY2Uub3BlblJlbW90ZVNldHRpbmdzKG9wdGlvbnMpOyBicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjogcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyhvcHRpb25zKTsgYnJlYWs7XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdC8vIEZhbGxiYWNrIGlmIHNvbWV0aGluZyBnb2VzIHdyb25nXG5cdFx0XHRcdHByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3Moe1xuXHRcdFx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRcdHF1ZXJ5OiBgQGlkOiR7VGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZX1gLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChUZXJtaW5hbENoYXRDb21tYW5kSWQuRGlzYWJsZVNlc3Npb25BdXRvQXBwcm92YWwsIGFzeW5jIChhY2Nlc3NvciwgY2hhdFNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiB7XG5cdGNvbnN0IHRlcm1pbmFsQ2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsQ2hhdFNlcnZpY2UpO1xuXHR0ZXJtaW5hbENoYXRTZXJ2aWNlLnNldENoYXRTZXNzaW9uQXV0b0FwcHJvdmFsKGNoYXRTZXNzaW9uUmVzb3VyY2UsIGZhbHNlKTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsU0FBUyxjQUFjO0FBRWhDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsWUFBWSwwQkFBMEI7QUFDL0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFD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
