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
import { AsyncIterableProducer } from "../../../../../base/common/async.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { Disposable, markAsSingleton } from "../../../../../base/common/lifecycle.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { CopyAction } from "../../../../../editor/contrib/clipboard/browser/clipboard.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { MenuEntryActionViewItem } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, MenuId, MenuItemAction, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { TerminalLocation } from "../../../../../platform/terminal/common/terminal.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { accessibleViewInCodeBlock } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { IAiEditTelemetryService } from "../../../editTelemetry/browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { EditDeltaInfo } from "../../../../../editor/common/textModelEditSource.js";
import { reviewEdits } from "./reviewEdits.js";
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from "../../../terminal/browser/terminal.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ChatCopyKind, IChatService } from "../../common/chatService/chatService.js";
import { isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { IChatCodeBlockContextProviderService, IChatWidgetService } from "../chat.js";
import { ChatCopyActionViewItem } from "./chatCopyActions.js";
import { DefaultChatTextEditor } from "../widget/chatContentParts/codeBlockPart.js";
import { CHAT_CATEGORY } from "./chatActions.js";
import { ApplyCodeBlockOperation, InsertCodeBlockOperation } from "./codeBlockOperations.js";
const shellLangIds = [
  "fish",
  "ps1",
  "pwsh",
  "powershell",
  "sh",
  "shellscript",
  "zsh"
];
function isCodeBlockActionContext(thing) {
  return typeof thing === "object" && thing !== null && "code" in thing && "element" in thing;
}
function isCodeCompareBlockActionContext(thing) {
  return typeof thing === "object" && thing !== null && "element" in thing && "diffEditor" in thing && "toggleDiffViewMode" in thing;
}
function isResponseFiltered(context) {
  return isResponseVM(context.element) && context.element.errorDetails?.responseIsFiltered;
}
class ChatCodeBlockAction extends Action2 {
  run(accessor, ...args) {
    let context = args[0];
    if (!isCodeBlockActionContext(context)) {
      const codeEditorService = accessor.get(ICodeEditorService);
      const editor = codeEditorService.getFocusedCodeEditor() || codeEditorService.getActiveCodeEditor();
      if (!editor) {
        return;
      }
      context = getContextFromEditor(editor, accessor);
      if (!isCodeBlockActionContext(context)) {
        return;
      }
    }
    return this.runWithContext(accessor, context);
  }
}
const APPLY_IN_EDITOR_ID = "workbench.action.chat.applyInEditor";
let CodeBlockActionRendering = class extends Disposable {
  constructor(actionViewItemService, instantiationService, labelService) {
    super();
    const copyCodeBlockActionRendering = this._register(actionViewItemService.register(MenuId.ChatCodeBlock, "workbench.action.chat.copyCodeBlock", (action, options) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(ChatCopyActionViewItem, action, options);
    }));
    const disposable = actionViewItemService.register(MenuId.ChatCodeBlock, APPLY_IN_EDITOR_ID, (action, options) => {
      if (!(action instanceof MenuItemAction)) {
        return void 0;
      }
      return instantiationService.createInstance(class extends MenuEntryActionViewItem {
        getTooltip() {
          const context = this._context;
          if (isCodeBlockActionContext(context) && context.codemapperUri) {
            const label = labelService.getUriLabel(context.codemapperUri, { relative: true });
            return localize("interactive.applyInEditorWithURL.label", "Apply to {0}", label);
          }
          return super.getTooltip();
        }
        setActionContext(newContext) {
          super.setActionContext(newContext);
          this.updateTooltip();
        }
      }, action, void 0);
    });
    markAsSingleton(copyCodeBlockActionRendering);
    markAsSingleton(disposable);
  }
};
CodeBlockActionRendering.ID = "chat.codeBlockActionRendering";
CodeBlockActionRendering = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILabelService)
], CodeBlockActionRendering);
function registerChatCodeBlockActions() {
  registerAction2(class CopyCodeBlockAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.copyCodeBlock",
        title: localize2("interactive.copyCodeBlock.label", "Copy"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.copy,
        menu: {
          id: MenuId.ChatCodeBlock,
          group: "navigation",
          order: 30
        }
      });
    }
    run(accessor, ...args) {
      const context = args[0];
      if (!isCodeBlockActionContext(context) || isResponseFiltered(context)) {
        return;
      }
      const clipboardService = accessor.get(IClipboardService);
      const aiEditTelemetryService = accessor.get(IAiEditTelemetryService);
      clipboardService.writeText(context.code);
      if (isResponseVM(context.element)) {
        const chatService = accessor.get(IChatService);
        const requestId = context.element.requestId;
        const request = context.element.session.getItems().find((item) => item.id === requestId && isRequestVM(item));
        chatService.notifyUserAction({
          agentId: context.element.agent?.id,
          command: context.element.slashCommand?.name,
          sessionResource: context.element.sessionResource,
          requestId: context.element.requestId,
          result: context.element.result,
          action: {
            kind: "copy",
            codeBlockIndex: context.codeBlockIndex,
            copyKind: ChatCopyKind.Toolbar,
            copiedCharacters: context.code.length,
            totalCharacters: context.code.length,
            copiedText: context.code,
            copiedLines: context.code.split("\n").length,
            languageId: context.languageId,
            totalLines: context.code.split("\n").length,
            modelId: request?.modelId ?? ""
          }
        });
        const codeBlockInfo = context.element.model.codeBlockInfos?.at(context.codeBlockIndex);
        aiEditTelemetryService.handleCodeAccepted({
          acceptanceMethod: "copyButton",
          suggestionId: codeBlockInfo?.suggestionId,
          editDeltaInfo: EditDeltaInfo.fromText(context.code),
          feature: "sideBarChat",
          languageId: context.languageId,
          modeId: context.element.model.request?.modeInfo?.telemetryModeId,
          modelId: request?.modelId,
          presentation: "codeBlock",
          applyCodeBlockSuggestionId: void 0,
          source: void 0,
          sourceRequestId: void 0
        });
      }
    }
  });
  CopyAction?.addImplementation(5e4, "chat-codeblock", (accessor) => {
    const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
    if (!editor) {
      return false;
    }
    const editorModel = editor.getModel();
    if (!editorModel) {
      return false;
    }
    const context = getContextFromEditor(editor, accessor);
    if (!context) {
      return false;
    }
    const noSelection = editor.getSelections()?.length === 1 && editor.getSelection()?.isEmpty();
    const copiedText = noSelection ? editorModel.getValue() : editor.getSelections()?.reduce((acc, selection) => acc + editorModel.getValueInRange(selection), "") ?? "";
    const totalCharacters = editorModel.getValueLength();
    const chatService = accessor.get(IChatService);
    const aiEditTelemetryService = accessor.get(IAiEditTelemetryService);
    const element = context.element;
    if (isResponseVM(element)) {
      const requestId = element.requestId;
      const request = element.session.getItems().find((item) => item.id === requestId && isRequestVM(item));
      chatService.notifyUserAction({
        agentId: element.agent?.id,
        command: element.slashCommand?.name,
        sessionResource: element.sessionResource,
        requestId: element.requestId,
        result: element.result,
        action: {
          kind: "copy",
          codeBlockIndex: context.codeBlockIndex,
          copyKind: ChatCopyKind.Action,
          copiedText,
          copiedCharacters: copiedText.length,
          totalCharacters,
          languageId: context.languageId,
          totalLines: context.code.split("\n").length,
          copiedLines: copiedText.split("\n").length,
          modelId: request?.modelId ?? ""
        }
      });
      const codeBlockInfo = element.model.codeBlockInfos?.at(context.codeBlockIndex);
      aiEditTelemetryService.handleCodeAccepted({
        acceptanceMethod: "copyManual",
        suggestionId: codeBlockInfo?.suggestionId,
        editDeltaInfo: EditDeltaInfo.fromText(copiedText),
        feature: "sideBarChat",
        languageId: context.languageId,
        modeId: element.model.request?.modeInfo?.telemetryModeId,
        modelId: request?.modelId,
        presentation: "codeBlock",
        applyCodeBlockSuggestionId: void 0,
        source: void 0,
        sourceRequestId: void 0
      });
    }
    if (noSelection) {
      accessor.get(IClipboardService).writeText(context.code);
      return true;
    }
    return false;
  });
  registerAction2(class SmartApplyInEditorAction extends ChatCodeBlockAction {
    constructor() {
      super({
        id: APPLY_IN_EDITOR_ID,
        title: localize2("interactive.applyInEditor.label", "Apply in Editor"),
        precondition: ChatContextKeys.enabled,
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.gitPullRequestGoToChanges,
        menu: [
          {
            id: MenuId.ChatCodeBlock,
            group: "navigation",
            when: ContextKeyExpr.and(
              ...shellLangIds.map((e) => ContextKeyExpr.notEquals(EditorContextKeys.languageId.key, e))
            ),
            order: 10
          },
          {
            id: MenuId.ChatCodeBlock,
            when: ContextKeyExpr.or(
              ...shellLangIds.map((e) => ContextKeyExpr.equals(EditorContextKeys.languageId.key, e))
            )
          }
        ],
        keybinding: {
          when: ContextKeyExpr.or(ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate()), accessibleViewInCodeBlock),
          primary: KeyMod.CtrlCmd | KeyCode.Enter,
          mac: { primary: KeyMod.WinCtrl | KeyCode.Enter },
          weight: KeybindingWeight.ExternalExtension + 1
        }
      });
    }
    runWithContext(accessor, context) {
      if (!this.operation) {
        this.operation = accessor.get(IInstantiationService).createInstance(ApplyCodeBlockOperation);
      }
      return this.operation.run(context);
    }
  });
  registerAction2(class InsertAtCursorAction extends ChatCodeBlockAction {
    constructor() {
      super({
        id: "workbench.action.chat.insertCodeBlock",
        title: localize2("interactive.insertCodeBlock.label", "Insert At Cursor"),
        precondition: ChatContextKeys.enabled,
        f1: true,
        category: CHAT_CATEGORY,
        icon: Codicon.insert,
        menu: [{
          id: MenuId.ChatCodeBlock,
          group: "navigation",
          when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.location.notEqualsTo(ChatAgentLocation.Terminal)),
          order: 20
        }, {
          id: MenuId.ChatCodeBlock,
          group: "navigation",
          when: ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.location.isEqualTo(ChatAgentLocation.Terminal)),
          isHiddenByDefault: true,
          order: 20
        }],
        keybinding: {
          when: ContextKeyExpr.or(ContextKeyExpr.and(ChatContextKeys.inChatSession, ChatContextKeys.inChatInput.negate()), accessibleViewInCodeBlock),
          primary: KeyMod.CtrlCmd | KeyCode.Enter,
          mac: { primary: KeyMod.WinCtrl | KeyCode.Enter },
          weight: KeybindingWeight.ExternalExtension + 1
        }
      });
    }
    runWithContext(accessor, context) {
      const operation = accessor.get(IInstantiationService).createInstance(InsertCodeBlockOperation);
      return operation.run(context);
    }
  });
  registerAction2(class InsertIntoNewFileAction extends ChatCodeBlockAction {
    constructor() {
      super({
        id: "workbench.action.chat.insertIntoNewFile",
        title: localize2("interactive.insertIntoNewFile.label", "Insert into New File"),
        precondition: ChatContextKeys.enabled,
        f1: true,
        category: CHAT_CATEGORY,
        icon: Codicon.newFile,
        menu: {
          id: MenuId.ChatCodeBlock,
          group: "navigation",
          isHiddenByDefault: true,
          order: 40
        }
      });
    }
    async runWithContext(accessor, context) {
      if (isResponseFiltered(context)) {
        return;
      }
      const editorService = accessor.get(IEditorService);
      const chatService = accessor.get(IChatService);
      const aiEditTelemetryService = accessor.get(IAiEditTelemetryService);
      editorService.openEditor({ contents: context.code, languageId: context.languageId, resource: void 0 });
      if (isResponseVM(context.element)) {
        const requestId = context.element.requestId;
        const request = context.element.session.getItems().find((item) => item.id === requestId && isRequestVM(item));
        chatService.notifyUserAction({
          agentId: context.element.agent?.id,
          command: context.element.slashCommand?.name,
          sessionResource: context.element.sessionResource,
          requestId: context.element.requestId,
          result: context.element.result,
          action: {
            kind: "insert",
            codeBlockIndex: context.codeBlockIndex,
            totalCharacters: context.code.length,
            newFile: true,
            totalLines: context.code.split("\n").length,
            languageId: context.languageId,
            modelId: request?.modelId ?? ""
          }
        });
        const codeBlockInfo = context.element.model.codeBlockInfos?.at(context.codeBlockIndex);
        aiEditTelemetryService.handleCodeAccepted({
          acceptanceMethod: "insertInNewFile",
          suggestionId: codeBlockInfo?.suggestionId,
          editDeltaInfo: EditDeltaInfo.fromText(context.code),
          feature: "sideBarChat",
          languageId: context.languageId,
          modeId: context.element.model.request?.modeInfo?.telemetryModeId,
          modelId: request?.modelId,
          presentation: "codeBlock",
          applyCodeBlockSuggestionId: void 0,
          source: void 0,
          sourceRequestId: void 0
        });
      }
    }
  });
  registerAction2(class RunInTerminalAction extends ChatCodeBlockAction {
    constructor() {
      super({
        id: "workbench.action.chat.runInTerminal",
        title: localize2("interactive.runInTerminal.label", "Insert into Terminal"),
        precondition: ChatContextKeys.enabled,
        f1: true,
        category: CHAT_CATEGORY,
        icon: Codicon.terminal,
        menu: [
          {
            id: MenuId.ChatCodeBlock,
            group: "navigation",
            when: ContextKeyExpr.and(
              ChatContextKeys.inChatSession,
              ContextKeyExpr.or(...shellLangIds.map((e) => ContextKeyExpr.equals(EditorContextKeys.languageId.key, e)))
            )
          },
          {
            id: MenuId.ChatCodeBlock,
            group: "navigation",
            isHiddenByDefault: true,
            when: ContextKeyExpr.and(
              ChatContextKeys.inChatSession,
              ...shellLangIds.map((e) => ContextKeyExpr.notEquals(EditorContextKeys.languageId.key, e))
            )
          }
        ],
        keybinding: [{
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Enter,
          mac: {
            primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.Enter
          },
          weight: KeybindingWeight.EditorContrib,
          when: ContextKeyExpr.or(ChatContextKeys.inChatSession, accessibleViewInCodeBlock)
        }]
      });
    }
    async runWithContext(accessor, context) {
      if (isResponseFiltered(context)) {
        return;
      }
      const chatService = accessor.get(IChatService);
      const terminalService = accessor.get(ITerminalService);
      const editorService = accessor.get(IEditorService);
      const terminalEditorService = accessor.get(ITerminalEditorService);
      const terminalGroupService = accessor.get(ITerminalGroupService);
      let terminal = await terminalService.getActiveOrCreateInstance({ acceptsInput: true });
      if (terminal.xterm?.isStdinDisabled || terminal.shellLaunchConfig.isFeatureTerminal) {
        terminal = await terminalService.createAndFocusTerminal({ location: TerminalLocation.Panel });
      } else {
        await terminalService.focusInstance(terminal);
      }
      if (terminal.target === TerminalLocation.Editor) {
        const existingEditors = editorService.findEditors(terminal.resource);
        terminalEditorService.openEditor(terminal, { viewColumn: existingEditors?.[0].groupId });
      } else {
        await terminalGroupService.showPanel(true);
      }
      terminal.runCommand(context.code, false);
      if (isResponseVM(context.element)) {
        chatService.notifyUserAction({
          agentId: context.element.agent?.id,
          command: context.element.slashCommand?.name,
          sessionResource: context.element.sessionResource,
          requestId: context.element.requestId,
          result: context.element.result,
          action: {
            kind: "runInTerminal",
            codeBlockIndex: context.codeBlockIndex,
            languageId: context.languageId
          }
        });
      }
    }
  });
  function navigateCodeBlocks(accessor, reverse) {
    const codeEditorService = accessor.get(ICodeEditorService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = chatWidgetService.lastFocusedWidget;
    if (!widget) {
      return;
    }
    const editor = codeEditorService.getFocusedCodeEditor();
    const editorUri = editor?.getModel()?.uri;
    const curCodeBlockInfo = editorUri ? widget.getCodeBlockInfoForEditor(editorUri) : void 0;
    const focused = !widget.inputEditor.hasWidgetFocus() && widget.getFocus();
    const focusedResponse = isResponseVM(focused) ? focused : void 0;
    const elementId = curCodeBlockInfo?.elementId;
    const element = elementId ? widget.viewModel?.getItems().find((item) => item.id === elementId) : void 0;
    const currentResponse = element ?? (focusedResponse ?? widget.viewModel?.getItems().reverse().find((item) => isResponseVM(item)));
    if (!currentResponse || !isResponseVM(currentResponse)) {
      return;
    }
    widget.reveal(currentResponse);
    const responseCodeblocks = widget.getCodeBlockInfosForResponse(currentResponse);
    const focusIdx = curCodeBlockInfo ? (curCodeBlockInfo.codeBlockIndex + (reverse ? -1 : 1) + responseCodeblocks.length) % responseCodeblocks.length : reverse ? responseCodeblocks.length - 1 : 0;
    responseCodeblocks[focusIdx]?.focus();
  }
  registerAction2(class NextCodeBlockAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.nextCodeBlock",
        title: localize2("interactive.nextCodeBlock.label", "Next Code Block"),
        keybinding: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown,
          mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageDown },
          weight: KeybindingWeight.WorkbenchContrib,
          when: ChatContextKeys.inChatSession
        },
        precondition: ChatContextKeys.enabled,
        f1: true,
        category: CHAT_CATEGORY
      });
    }
    run(accessor, ...args) {
      navigateCodeBlocks(accessor);
    }
  });
  registerAction2(class PreviousCodeBlockAction extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.previousCodeBlock",
        title: localize2("interactive.previousCodeBlock.label", "Previous Code Block"),
        keybinding: {
          primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp,
          mac: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.PageUp },
          weight: KeybindingWeight.WorkbenchContrib,
          when: ChatContextKeys.inChatSession
        },
        precondition: ChatContextKeys.enabled,
        f1: true,
        category: CHAT_CATEGORY
      });
    }
    run(accessor, ...args) {
      navigateCodeBlocks(accessor, true);
    }
  });
}
function getContextFromEditor(editor, accessor) {
  const chatWidgetService = accessor.get(IChatWidgetService);
  const chatCodeBlockContextProviderService = accessor.get(IChatCodeBlockContextProviderService);
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const widget = chatWidgetService.lastFocusedWidget;
  const codeBlockInfo = widget?.getCodeBlockInfoForEditor(model.uri);
  if (!codeBlockInfo) {
    for (const provider of chatCodeBlockContextProviderService.providers) {
      const context = provider.getCodeBlockContext(editor);
      if (context) {
        return context;
      }
    }
    return;
  }
  const element = widget?.viewModel?.getItems().find((item) => item.id === codeBlockInfo.elementId);
  return {
    element,
    codeBlockIndex: codeBlockInfo.codeBlockIndex,
    code: editor.getValue(),
    languageId: editor.getModel().getLanguageId(),
    codemapperUri: codeBlockInfo.codemapperUri,
    chatSessionResource: codeBlockInfo.chatSessionResource
  };
}
function registerChatCodeCompareBlockActions() {
  class ChatCompareCodeBlockAction extends Action2 {
    run(accessor, ...args) {
      const context = args[0];
      if (!isCodeCompareBlockActionContext(context)) {
        return;
      }
      return this.runWithContext(accessor, context);
    }
  }
  registerAction2(class ApplyEditsCompareBlockAction extends ChatCompareCodeBlockAction {
    constructor() {
      super({
        id: "workbench.action.chat.applyCompareEdits",
        title: localize2("interactive.compare.apply", "Apply Edits"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.gitPullRequestGoToChanges,
        precondition: ContextKeyExpr.and(EditorContextKeys.hasChanges, ChatContextKeys.editApplied.negate(), EditorContextKeys.readOnly.negate()),
        menu: {
          id: MenuId.ChatCompareBlock,
          group: "navigation",
          order: 10,
          when: EditorContextKeys.readOnly.negate()
        }
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async runWithContext(accessor, context) {
      const instaService = accessor.get(IInstantiationService);
      const editorService = accessor.get(ICodeEditorService);
      const item = context.edit;
      const response = context.element;
      if (item.state?.applied) {
        return false;
      }
      if (!response.response.value.includes(item)) {
        return false;
      }
      const firstEdit = item.edits[0]?.[0];
      if (!firstEdit) {
        return false;
      }
      const textEdits = AsyncIterableProducer.fromArray(item.edits);
      const editorToApply = await editorService.openCodeEditor({ resource: item.uri }, null);
      if (editorToApply) {
        editorToApply.revealLineInCenterIfOutsideViewport(firstEdit.range.startLineNumber);
        instaService.invokeFunction(reviewEdits, editorToApply, textEdits, CancellationToken.None, void 0);
        response.setEditApplied(item, 1);
        return true;
      }
      return false;
    }
  });
  registerAction2(class DiscardEditsCompareBlockAction extends ChatCompareCodeBlockAction {
    constructor() {
      super({
        id: "workbench.action.chat.discardCompareEdits",
        title: localize2("interactive.compare.discard", "Discard Edits"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.trash,
        precondition: ContextKeyExpr.and(EditorContextKeys.hasChanges, ChatContextKeys.editApplied.negate(), EditorContextKeys.readOnly.negate()),
        menu: {
          id: MenuId.ChatCompareBlock,
          group: "navigation",
          order: 11,
          when: EditorContextKeys.readOnly.negate()
        }
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async runWithContext(accessor, context) {
      const instaService = accessor.get(IInstantiationService);
      const editor = instaService.createInstance(DefaultChatTextEditor);
      editor.discard(context.element, context.edit);
    }
  });
  registerAction2(class ToggleDiffViewModeAction extends ChatCompareCodeBlockAction {
    constructor() {
      super({
        id: "workbench.action.chat.toggleCompareBlockDiffViewMode",
        title: localize2("interactive.compare.toggleDiffViewMode", "Toggle Inline/Side-by-Side Diff"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.diffSingle,
        toggled: {
          condition: EditorContextKeys.diffEditorInlineMode,
          icon: Codicon.diff
        },
        menu: {
          id: MenuId.ChatCompareBlock,
          group: "navigation",
          order: 1
        }
      });
    }
    runWithContext(_accessor, context) {
      context.toggleDiffViewMode();
    }
  });
  registerAction2(class OpenCompareBlockInDiffEditor extends ChatCompareCodeBlockAction {
    constructor() {
      super({
        id: "workbench.action.chat.openCompareBlockInDiffEditor",
        title: localize2("interactive.compare.openInDiffEditor", "Open in Diff Editor"),
        f1: false,
        category: CHAT_CATEGORY,
        icon: Codicon.goToFile,
        menu: {
          id: MenuId.ChatCompareBlock,
          group: "navigation",
          order: 2
        }
      });
    }
    async runWithContext(accessor, context) {
      const editorService = accessor.get(IEditorService);
      const model = context.diffEditor.getModel();
      if (!model) {
        return;
      }
      await editorService.openEditor({
        original: { resource: model.original.uri },
        modified: { resource: model.modified.uri }
      });
    }
  });
}
export {
  CodeBlockActionRendering,
  isCodeBlockActionContext,
  isCodeCompareBlockActionContext,
  registerChatCodeBlockActions,
  registerChatCodeCompareBlockActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFjdGlvbnNcXGNoYXRDb2RlYmxvY2tBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIG1hcmtBc1NpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENvcHlBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jbGlwYm9hcmQvYnJvd3Nlci9jbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVVudGl0bGVkVGV4dFJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFjY2Vzc2libGVWaWV3SW5Db2RlQmxvY2sgfSBmcm9tICcuLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0VGVsZW1ldHJ5L2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXREZWx0YUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuaW1wb3J0IHsgcmV2aWV3RWRpdHMgfSBmcm9tICcuL3Jldmlld0VkaXRzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEVkaXRvclNlcnZpY2UsIElUZXJtaW5hbEdyb3VwU2VydmljZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRDb3B5S2luZCwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdENvcHlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vY2hhdENvcHlBY3Rpb25zLmpzJztcbmltcG9ydCB7IERlZmF1bHRDaGF0VGV4dEVkaXRvciwgSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQsIElDb2RlQ29tcGFyZUJsb2NrQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSB9IGZyb20gJy4vY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQXBwbHlDb2RlQmxvY2tPcGVyYXRpb24sIEluc2VydENvZGVCbG9ja09wZXJhdGlvbiB9IGZyb20gJy4vY29kZUJsb2NrT3BlcmF0aW9ucy5qcyc7XG5cbmNvbnN0IHNoZWxsTGFuZ0lkcyA9IFtcblx0J2Zpc2gnLFxuXHQncHMxJyxcblx0J3B3c2gnLFxuXHQncG93ZXJzaGVsbCcsXG5cdCdzaCcsXG5cdCdzaGVsbHNjcmlwdCcsXG5cdCd6c2gnXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0Q29kZUJsb2NrQWN0aW9uQ29udGV4dCBleHRlbmRzIElDb2RlQmxvY2tBY3Rpb25Db250ZXh0IHtcblx0ZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ29kZUJsb2NrQWN0aW9uQ29udGV4dCh0aGluZzogdW5rbm93bik6IHRoaW5nIGlzIElDb2RlQmxvY2tBY3Rpb25Db250ZXh0IHtcblx0cmV0dXJuIHR5cGVvZiB0aGluZyA9PT0gJ29iamVjdCcgJiYgdGhpbmcgIT09IG51bGwgJiYgJ2NvZGUnIGluIHRoaW5nICYmICdlbGVtZW50JyBpbiB0aGluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQ29kZUNvbXBhcmVCbG9ja0FjdGlvbkNvbnRleHQodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBJQ29kZUNvbXBhcmVCbG9ja0FjdGlvbkNvbnRleHQge1xuXHRyZXR1cm4gdHlwZW9mIHRoaW5nID09PSAnb2JqZWN0JyAmJiB0aGluZyAhPT0gbnVsbCAmJiAnZWxlbWVudCcgaW4gdGhpbmcgJiYgJ2RpZmZFZGl0b3InIGluIHRoaW5nICYmICd0b2dnbGVEaWZmVmlld01vZGUnIGluIHRoaW5nO1xufVxuXG5mdW5jdGlvbiBpc1Jlc3BvbnNlRmlsdGVyZWQoY29udGV4dDogSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQpIHtcblx0cmV0dXJuIGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbnRleHQuZWxlbWVudC5lcnJvckRldGFpbHM/LnJlc3BvbnNlSXNGaWx0ZXJlZDtcbn1cblxuYWJzdHJhY3QgY2xhc3MgQ2hhdENvZGVCbG9ja0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGxldCBjb250ZXh0ID0gYXJnc1swXTtcblx0XHRpZiAoIWlzQ29kZUJsb2NrQWN0aW9uQ29udGV4dChjb250ZXh0KSkge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGNvZGVFZGl0b3JTZXJ2aWNlLmdldEZvY3VzZWRDb2RlRWRpdG9yKCkgfHwgY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb250ZXh0ID0gZ2V0Q29udGV4dEZyb21FZGl0b3IoZWRpdG9yLCBhY2Nlc3Nvcik7XG5cdFx0XHRpZiAoIWlzQ29kZUJsb2NrQWN0aW9uQ29udGV4dChjb250ZXh0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucnVuV2l0aENvbnRleHQoYWNjZXNzb3IsIGNvbnRleHQpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0YWJzdHJhY3QgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0KTogYW55O1xufVxuXG5jb25zdCBBUFBMWV9JTl9FRElUT1JfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmFwcGx5SW5FZGl0b3InO1xuXG5leHBvcnQgY2xhc3MgQ29kZUJsb2NrQWN0aW9uUmVuZGVyaW5nIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0LmNvZGVCbG9ja0FjdGlvblJlbmRlcmluZyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBY3Rpb25WaWV3SXRlbVNlcnZpY2UgYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjb3B5Q29kZUJsb2NrQWN0aW9uUmVuZGVyaW5nID0gdGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKE1lbnVJZC5DaGF0Q29kZUJsb2NrLCAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmNvcHlDb2RlQmxvY2snLCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb3B5QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGFjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3RlcihNZW51SWQuQ2hhdENvZGVCbG9jaywgQVBQTFlfSU5fRURJVE9SX0lELCAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShjbGFzcyBleHRlbmRzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHtcblx0XHRcdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fY29udGV4dDtcblx0XHRcdFx0XHRpZiAoaXNDb2RlQmxvY2tBY3Rpb25Db250ZXh0KGNvbnRleHQpICYmIGNvbnRleHQuY29kZW1hcHBlclVyaSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBsYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoY29udGV4dC5jb2RlbWFwcGVyVXJpLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdpbnRlcmFjdGl2ZS5hcHBseUluRWRpdG9yV2l0aFVSTC5sYWJlbCcsIFwiQXBwbHkgdG8gezB9XCIsIGxhYmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHN1cGVyLmdldFRvb2x0aXAoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBzZXRBY3Rpb25Db250ZXh0KG5ld0NvbnRleHQ6IHVua25vd24pOiB2b2lkIHtcblx0XHRcdFx0XHRzdXBlci5zZXRBY3Rpb25Db250ZXh0KG5ld0NvbnRleHQpO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBhY3Rpb24sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHQvLyBSZWR1Y2VzIGZsaWNrZXIgYSBiaXQgb24gcmVsb2FkL3Jlc3RhcnRcblx0XHRtYXJrQXNTaW5nbGV0b24oY29weUNvZGVCbG9ja0FjdGlvblJlbmRlcmluZyk7XG5cdFx0bWFya0FzU2luZ2xldG9uKGRpc3Bvc2FibGUpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWdpc3RlckNoYXRDb2RlQmxvY2tBY3Rpb25zKCkge1xuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29weUNvZGVCbG9ja0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5jb3B5Q29kZUJsb2NrJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuY29weUNvZGVCbG9jay5sYWJlbCcsIFwiQ29weVwiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5jb3B5LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29kZUJsb2NrLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDMwXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXJnc1swXTtcblx0XHRcdGlmICghaXNDb2RlQmxvY2tBY3Rpb25Db250ZXh0KGNvbnRleHQpIHx8IGlzUmVzcG9uc2VGaWx0ZXJlZChjb250ZXh0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWlFZGl0VGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChjb250ZXh0LmNvZGUpO1xuXG5cdFx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdElkID0gY29udGV4dC5lbGVtZW50LnJlcXVlc3RJZDtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IGNvbnRleHQuZWxlbWVudC5zZXNzaW9uLmdldEl0ZW1zKCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IHJlcXVlc3RJZCAmJiBpc1JlcXVlc3RWTShpdGVtKSkgYXMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRjaGF0U2VydmljZS5ub3RpZnlVc2VyQWN0aW9uKHtcblx0XHRcdFx0XHRhZ2VudElkOiBjb250ZXh0LmVsZW1lbnQuYWdlbnQ/LmlkLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGNvbnRleHQuZWxlbWVudC5zbGFzaENvbW1hbmQ/Lm5hbWUsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdHJlcXVlc3RJZDogY29udGV4dC5lbGVtZW50LnJlcXVlc3RJZCxcblx0XHRcdFx0XHRyZXN1bHQ6IGNvbnRleHQuZWxlbWVudC5yZXN1bHQsXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnY29weScsXG5cdFx0XHRcdFx0XHRjb2RlQmxvY2tJbmRleDogY29udGV4dC5jb2RlQmxvY2tJbmRleCxcblx0XHRcdFx0XHRcdGNvcHlLaW5kOiBDaGF0Q29weUtpbmQuVG9vbGJhcixcblx0XHRcdFx0XHRcdGNvcGllZENoYXJhY3RlcnM6IGNvbnRleHQuY29kZS5sZW5ndGgsXG5cdFx0XHRcdFx0XHR0b3RhbENoYXJhY3RlcnM6IGNvbnRleHQuY29kZS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRjb3BpZWRUZXh0OiBjb250ZXh0LmNvZGUsXG5cdFx0XHRcdFx0XHRjb3BpZWRMaW5lczogY29udGV4dC5jb2RlLnNwbGl0KCdcXG4nKS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiBjb250ZXh0Lmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHR0b3RhbExpbmVzOiBjb250ZXh0LmNvZGUuc3BsaXQoJ1xcbicpLmxlbmd0aCxcblx0XHRcdFx0XHRcdG1vZGVsSWQ6IHJlcXVlc3Q/Lm1vZGVsSWQgPz8gJydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNvZGVCbG9ja0luZm8gPSBjb250ZXh0LmVsZW1lbnQubW9kZWwuY29kZUJsb2NrSW5mb3M/LmF0KGNvbnRleHQuY29kZUJsb2NrSW5kZXgpO1xuXHRcdFx0XHRhaUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmhhbmRsZUNvZGVBY2NlcHRlZCh7XG5cdFx0XHRcdFx0YWNjZXB0YW5jZU1ldGhvZDogJ2NvcHlCdXR0b24nLFxuXHRcdFx0XHRcdHN1Z2dlc3Rpb25JZDogY29kZUJsb2NrSW5mbz8uc3VnZ2VzdGlvbklkLFxuXHRcdFx0XHRcdGVkaXREZWx0YUluZm86IEVkaXREZWx0YUluZm8uZnJvbVRleHQoY29udGV4dC5jb2RlKSxcblx0XHRcdFx0XHRmZWF0dXJlOiAnc2lkZUJhckNoYXQnLFxuXHRcdFx0XHRcdGxhbmd1YWdlSWQ6IGNvbnRleHQubGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRtb2RlSWQ6IGNvbnRleHQuZWxlbWVudC5tb2RlbC5yZXF1ZXN0Py5tb2RlSW5mbz8udGVsZW1ldHJ5TW9kZUlkLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IHJlcXVlc3Q/Lm1vZGVsSWQsXG5cdFx0XHRcdFx0cHJlc2VudGF0aW9uOiAnY29kZUJsb2NrJyxcblx0XHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHNvdXJjZVJlcXVlc3RJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdENvcHlBY3Rpb24/LmFkZEltcGxlbWVudGF0aW9uKDUwMDAwLCAnY2hhdC1jb2RlYmxvY2snLCAoYWNjZXNzb3IpID0+IHtcblx0XHQvLyBnZXQgYWN0aXZlIGNvZGUgZWRpdG9yXG5cdFx0Y29uc3QgZWRpdG9yID0gYWNjZXNzb3IuZ2V0KElDb2RlRWRpdG9yU2VydmljZSkuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvck1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFlZGl0b3JNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSBnZXRDb250ZXh0RnJvbUVkaXRvcihlZGl0b3IsIGFjY2Vzc29yKTtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBub1NlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb25zKCk/Lmxlbmd0aCA9PT0gMSAmJiBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk/LmlzRW1wdHkoKTtcblx0XHRjb25zdCBjb3BpZWRUZXh0ID0gbm9TZWxlY3Rpb24gP1xuXHRcdFx0ZWRpdG9yTW9kZWwuZ2V0VmFsdWUoKSA6XG5cdFx0XHRlZGl0b3IuZ2V0U2VsZWN0aW9ucygpPy5yZWR1Y2UoKGFjYywgc2VsZWN0aW9uKSA9PiBhY2MgKyBlZGl0b3JNb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uKSwgJycpID8/ICcnO1xuXHRcdGNvbnN0IHRvdGFsQ2hhcmFjdGVycyA9IGVkaXRvck1vZGVsLmdldFZhbHVlTGVuZ3RoKCk7XG5cblx0XHQvLyBSZXBvcnQgY29weSB0byBleHRlbnNpb25zXG5cdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRjb25zdCBhaUVkaXRUZWxlbWV0cnlTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRjb25zdCBlbGVtZW50ID0gY29udGV4dC5lbGVtZW50IGFzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdElkID0gZWxlbWVudC5yZXF1ZXN0SWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gZWxlbWVudC5zZXNzaW9uLmdldEl0ZW1zKCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IHJlcXVlc3RJZCAmJiBpc1JlcXVlc3RWTShpdGVtKSkgYXMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y2hhdFNlcnZpY2Uubm90aWZ5VXNlckFjdGlvbih7XG5cdFx0XHRcdGFnZW50SWQ6IGVsZW1lbnQuYWdlbnQ/LmlkLFxuXHRcdFx0XHRjb21tYW5kOiBlbGVtZW50LnNsYXNoQ29tbWFuZD8ubmFtZSxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBlbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0cmVxdWVzdElkOiBlbGVtZW50LnJlcXVlc3RJZCxcblx0XHRcdFx0cmVzdWx0OiBlbGVtZW50LnJlc3VsdCxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0a2luZDogJ2NvcHknLFxuXHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiBjb250ZXh0LmNvZGVCbG9ja0luZGV4LFxuXHRcdFx0XHRcdGNvcHlLaW5kOiBDaGF0Q29weUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRcdGNvcGllZFRleHQsXG5cdFx0XHRcdFx0Y29waWVkQ2hhcmFjdGVyczogY29waWVkVGV4dC5sZW5ndGgsXG5cdFx0XHRcdFx0dG90YWxDaGFyYWN0ZXJzLFxuXHRcdFx0XHRcdGxhbmd1YWdlSWQ6IGNvbnRleHQubGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHR0b3RhbExpbmVzOiBjb250ZXh0LmNvZGUuc3BsaXQoJ1xcbicpLmxlbmd0aCxcblx0XHRcdFx0XHRjb3BpZWRMaW5lczogY29waWVkVGV4dC5zcGxpdCgnXFxuJykubGVuZ3RoLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IHJlcXVlc3Q/Lm1vZGVsSWQgPz8gJydcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNvZGVCbG9ja0luZm8gPSBlbGVtZW50Lm1vZGVsLmNvZGVCbG9ja0luZm9zPy5hdChjb250ZXh0LmNvZGVCbG9ja0luZGV4KTtcblx0XHRcdGFpRWRpdFRlbGVtZXRyeVNlcnZpY2UuaGFuZGxlQ29kZUFjY2VwdGVkKHtcblx0XHRcdFx0YWNjZXB0YW5jZU1ldGhvZDogJ2NvcHlNYW51YWwnLFxuXHRcdFx0XHRzdWdnZXN0aW9uSWQ6IGNvZGVCbG9ja0luZm8/LnN1Z2dlc3Rpb25JZCxcblx0XHRcdFx0ZWRpdERlbHRhSW5mbzogRWRpdERlbHRhSW5mby5mcm9tVGV4dChjb3BpZWRUZXh0KSxcblx0XHRcdFx0ZmVhdHVyZTogJ3NpZGVCYXJDaGF0Jyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogY29udGV4dC5sYW5ndWFnZUlkLFxuXHRcdFx0XHRtb2RlSWQ6IGVsZW1lbnQubW9kZWwucmVxdWVzdD8ubW9kZUluZm8/LnRlbGVtZXRyeU1vZGVJZCxcblx0XHRcdFx0bW9kZWxJZDogcmVxdWVzdD8ubW9kZWxJZCxcblx0XHRcdFx0cHJlc2VudGF0aW9uOiAnY29kZUJsb2NrJyxcblx0XHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNvdXJjZVJlcXVlc3RJZDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29weSBmdWxsIGNlbGwgaWYgbm8gc2VsZWN0aW9uLCBvdGhlcndpc2UgZmFsbCBiYWNrIG9uIG5vcm1hbCBlZGl0b3IgaW1wbGVtZW50YXRpb25cblx0XHRpZiAobm9TZWxlY3Rpb24pIHtcblx0XHRcdGFjY2Vzc29yLmdldChJQ2xpcGJvYXJkU2VydmljZSkud3JpdGVUZXh0KGNvbnRleHQuY29kZSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTbWFydEFwcGx5SW5FZGl0b3JBY3Rpb24gZXh0ZW5kcyBDaGF0Q29kZUJsb2NrQWN0aW9uIHtcblxuXHRcdHByaXZhdGUgb3BlcmF0aW9uOiBBcHBseUNvZGVCbG9ja09wZXJhdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogQVBQTFlfSU5fRURJVE9SX0lELFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5hcHBseUluRWRpdG9yLmxhYmVsJywgXCJBcHBseSBpbiBFZGl0b3JcIiksXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24uZ2l0UHVsbFJlcXVlc3RHb1RvQ2hhbmdlcyxcblxuXHRcdFx0XHRtZW51OiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29kZUJsb2NrLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdFx0Li4uc2hlbGxMYW5nSWRzLm1hcChlID0+IENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhFZGl0b3JDb250ZXh0S2V5cy5sYW5ndWFnZUlkLmtleSwgZSkpXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDEwXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRDb2RlQmxvY2ssXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Li4uc2hlbGxMYW5nSWRzLm1hcChlID0+IENvbnRleHRLZXlFeHByLmVxdWFscyhFZGl0b3JDb250ZXh0S2V5cy5sYW5ndWFnZUlkLmtleSwgZSkpXG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKENvbnRleHRLZXlFeHByLmFuZChDaGF0Q29udGV4dEtleXMuaW5DaGF0U2Vzc2lvbiwgQ2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0Lm5lZ2F0ZSgpKSwgYWNjZXNzaWJsZVZpZXdJbkNvZGVCbG9jayksXG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuRW50ZXIgfSxcblx0XHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRXh0ZXJuYWxFeHRlbnNpb24gKyAxXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRvdmVycmlkZSBydW5XaXRoQ29udGV4dChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSUNvZGVCbG9ja0FjdGlvbkNvbnRleHQpIHtcblx0XHRcdGlmICghdGhpcy5vcGVyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5vcGVyYXRpb24gPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKS5jcmVhdGVJbnN0YW5jZShBcHBseUNvZGVCbG9ja09wZXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5vcGVyYXRpb24ucnVuKGNvbnRleHQpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEluc2VydEF0Q3Vyc29yQWN0aW9uIGV4dGVuZHMgQ2hhdENvZGVCbG9ja0FjdGlvbiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc2VydENvZGVCbG9jaycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmluc2VydENvZGVCbG9jay5sYWJlbCcsIFwiSW5zZXJ0IEF0IEN1cnNvclwiKSxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZCxcblx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmluc2VydCxcblx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRDb2RlQmxvY2ssXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIENoYXRDb250ZXh0S2V5cy5sb2NhdGlvbi5ub3RFcXVhbHNUbyhDaGF0QWdlbnRMb2NhdGlvbi5UZXJtaW5hbCkpLFxuXHRcdFx0XHRcdG9yZGVyOiAyMFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29kZUJsb2NrLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMubG9jYXRpb24uaXNFcXVhbFRvKENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsKSksXG5cdFx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0b3JkZXI6IDIwXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLCBDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQubmVnYXRlKCkpLCBhY2Nlc3NpYmxlVmlld0luQ29kZUJsb2NrKSxcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdFx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5XaW5DdHJsIHwgS2V5Q29kZS5FbnRlciB9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FeHRlcm5hbEV4dGVuc2lvbiArIDFcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJQ29kZUJsb2NrQWN0aW9uQ29udGV4dCkge1xuXHRcdFx0Y29uc3Qgb3BlcmF0aW9uID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSkuY3JlYXRlSW5zdGFuY2UoSW5zZXJ0Q29kZUJsb2NrT3BlcmF0aW9uKTtcblx0XHRcdHJldHVybiBvcGVyYXRpb24ucnVuKGNvbnRleHQpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIEluc2VydEludG9OZXdGaWxlQWN0aW9uIGV4dGVuZHMgQ2hhdENvZGVCbG9ja0FjdGlvbiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lmluc2VydEludG9OZXdGaWxlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuaW5zZXJ0SW50b05ld0ZpbGUubGFiZWwnLCBcIkluc2VydCBpbnRvIE5ldyBGaWxlXCIpLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24ubmV3RmlsZSxcblx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdENvZGVCbG9jayxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG9yZGVyOiA0MCxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgYXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0KSB7XG5cdFx0XHRpZiAoaXNSZXNwb25zZUZpbHRlcmVkKGNvbnRleHQpKSB7XG5cdFx0XHRcdC8vIFdoZW4gcnVuIGZyb20gY29tbWFuZCBwYWxldHRlXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCBjaGF0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgYWlFZGl0VGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IGNvbnRlbnRzOiBjb250ZXh0LmNvZGUsIGxhbmd1YWdlSWQ6IGNvbnRleHQubGFuZ3VhZ2VJZCwgcmVzb3VyY2U6IHVuZGVmaW5lZCB9IHNhdGlzZmllcyBJVW50aXRsZWRUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCk7XG5cblx0XHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkO1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0ID0gY29udGV4dC5lbGVtZW50LnNlc3Npb24uZ2V0SXRlbXMoKS5maW5kKGl0ZW0gPT4gaXRlbS5pZCA9PT0gcmVxdWVzdElkICYmIGlzUmVxdWVzdFZNKGl0ZW0pKSBhcyBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGNoYXRTZXJ2aWNlLm5vdGlmeVVzZXJBY3Rpb24oe1xuXHRcdFx0XHRcdGFnZW50SWQ6IGNvbnRleHQuZWxlbWVudC5hZ2VudD8uaWQsXG5cdFx0XHRcdFx0Y29tbWFuZDogY29udGV4dC5lbGVtZW50LnNsYXNoQ29tbWFuZD8ubmFtZSxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkLFxuXHRcdFx0XHRcdHJlc3VsdDogY29udGV4dC5lbGVtZW50LnJlc3VsdCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbnNlcnQnLFxuXHRcdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IGNvbnRleHQuY29kZUJsb2NrSW5kZXgsXG5cdFx0XHRcdFx0XHR0b3RhbENoYXJhY3RlcnM6IGNvbnRleHQuY29kZS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRuZXdGaWxlOiB0cnVlLFxuXHRcdFx0XHRcdFx0dG90YWxMaW5lczogY29udGV4dC5jb2RlLnNwbGl0KCdcXG4nKS5sZW5ndGgsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiBjb250ZXh0Lmxhbmd1YWdlSWQsXG5cdFx0XHRcdFx0XHRtb2RlbElkOiByZXF1ZXN0Py5tb2RlbElkID8/ICcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjb2RlQmxvY2tJbmZvID0gY29udGV4dC5lbGVtZW50Lm1vZGVsLmNvZGVCbG9ja0luZm9zPy5hdChjb250ZXh0LmNvZGVCbG9ja0luZGV4KTtcblxuXHRcdFx0XHRhaUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmhhbmRsZUNvZGVBY2NlcHRlZCh7XG5cdFx0XHRcdFx0YWNjZXB0YW5jZU1ldGhvZDogJ2luc2VydEluTmV3RmlsZScsXG5cdFx0XHRcdFx0c3VnZ2VzdGlvbklkOiBjb2RlQmxvY2tJbmZvPy5zdWdnZXN0aW9uSWQsXG5cdFx0XHRcdFx0ZWRpdERlbHRhSW5mbzogRWRpdERlbHRhSW5mby5mcm9tVGV4dChjb250ZXh0LmNvZGUpLFxuXHRcdFx0XHRcdGZlYXR1cmU6ICdzaWRlQmFyQ2hhdCcsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogY29udGV4dC5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdG1vZGVJZDogY29udGV4dC5lbGVtZW50Lm1vZGVsLnJlcXVlc3Q/Lm1vZGVJbmZvPy50ZWxlbWV0cnlNb2RlSWQsXG5cdFx0XHRcdFx0bW9kZWxJZDogcmVxdWVzdD8ubW9kZWxJZCxcblx0XHRcdFx0XHRwcmVzZW50YXRpb246ICdjb2RlQmxvY2snLFxuXHRcdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c291cmNlUmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJ1bkluVGVybWluYWxBY3Rpb24gZXh0ZW5kcyBDaGF0Q29kZUJsb2NrQWN0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucnVuSW5UZXJtaW5hbCcsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLnJ1bkluVGVybWluYWwubGFiZWwnLCBcIkluc2VydCBpbnRvIFRlcm1pbmFsXCIpLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24udGVybWluYWwsXG5cdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29kZUJsb2NrLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vciguLi5zaGVsbExhbmdJZHMubWFwKGUgPT4gQ29udGV4dEtleUV4cHIuZXF1YWxzKEVkaXRvckNvbnRleHRLZXlzLmxhbmd1YWdlSWQua2V5LCBlKSkpXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdENvZGVCbG9jayxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLFxuXHRcdFx0XHRcdFx0Li4uc2hlbGxMYW5nSWRzLm1hcChlID0+IENvbnRleHRLZXlFeHByLm5vdEVxdWFscyhFZGl0b3JDb250ZXh0S2V5cy5sYW5ndWFnZUlkLmtleSwgZSkpXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0a2V5YmluZGluZzogW3tcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLkVudGVyLFxuXHRcdFx0XHRcdG1hYzoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5FbnRlclxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWIsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIub3IoQ2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24sIGFjY2Vzc2libGVWaWV3SW5Db2RlQmxvY2spLFxuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgYXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0KSB7XG5cdFx0XHRpZiAoaXNSZXNwb25zZUZpbHRlcmVkKGNvbnRleHQpKSB7XG5cdFx0XHRcdC8vIFdoZW4gcnVuIGZyb20gY29tbWFuZCBwYWxldHRlXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2hhdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IHRlcm1pbmFsU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVybWluYWxTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxFZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXJtaW5hbEVkaXRvclNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgdGVybWluYWxHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsR3JvdXBTZXJ2aWNlKTtcblxuXHRcdFx0bGV0IHRlcm1pbmFsID0gYXdhaXQgdGVybWluYWxTZXJ2aWNlLmdldEFjdGl2ZU9yQ3JlYXRlSW5zdGFuY2UoeyBhY2NlcHRzSW5wdXQ6IHRydWUgfSk7XG5cblx0XHRcdC8vIGlzRmVhdHVyZVRlcm1pbmFsID0gZGVidWcgdGVybWluYWwgb3IgdGFzayB0ZXJtaW5hbFxuXHRcdFx0aWYgKHRlcm1pbmFsLnh0ZXJtPy5pc1N0ZGluRGlzYWJsZWQgfHwgdGVybWluYWwuc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwpIHtcblx0XHRcdFx0dGVybWluYWwgPSBhd2FpdCB0ZXJtaW5hbFNlcnZpY2UuY3JlYXRlQW5kRm9jdXNUZXJtaW5hbCh7IGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGVybWluYWxTZXJ2aWNlLmZvY3VzSW5zdGFuY2UodGVybWluYWwpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGVybWluYWwudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0XHRjb25zdCBleGlzdGluZ0VkaXRvcnMgPSBlZGl0b3JTZXJ2aWNlLmZpbmRFZGl0b3JzKHRlcm1pbmFsLnJlc291cmNlKTtcblx0XHRcdFx0dGVybWluYWxFZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IodGVybWluYWwsIHsgdmlld0NvbHVtbjogZXhpc3RpbmdFZGl0b3JzPy5bMF0uZ3JvdXBJZCB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRlcm1pbmFsR3JvdXBTZXJ2aWNlLnNob3dQYW5lbCh0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0dGVybWluYWwucnVuQ29tbWFuZChjb250ZXh0LmNvZGUsIGZhbHNlKTtcblxuXHRcdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRcdGNoYXRTZXJ2aWNlLm5vdGlmeVVzZXJBY3Rpb24oe1xuXHRcdFx0XHRcdGFnZW50SWQ6IGNvbnRleHQuZWxlbWVudC5hZ2VudD8uaWQsXG5cdFx0XHRcdFx0Y29tbWFuZDogY29udGV4dC5lbGVtZW50LnNsYXNoQ29tbWFuZD8ubmFtZSxcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0cmVxdWVzdElkOiBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkLFxuXHRcdFx0XHRcdHJlc3VsdDogY29udGV4dC5lbGVtZW50LnJlc3VsdCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdydW5JblRlcm1pbmFsJyxcblx0XHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiBjb250ZXh0LmNvZGVCbG9ja0luZGV4LFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZDogY29udGV4dC5sYW5ndWFnZUlkLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRmdW5jdGlvbiBuYXZpZ2F0ZUNvZGVCbG9ja3MoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJldmVyc2U/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblx0XHRjb25zdCBjaGF0V2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yID0gY29kZUVkaXRvclNlcnZpY2UuZ2V0Rm9jdXNlZENvZGVFZGl0b3IoKTtcblx0XHRjb25zdCBlZGl0b3JVcmkgPSBlZGl0b3I/LmdldE1vZGVsKCk/LnVyaTtcblx0XHRjb25zdCBjdXJDb2RlQmxvY2tJbmZvID0gZWRpdG9yVXJpID8gd2lkZ2V0LmdldENvZGVCbG9ja0luZm9Gb3JFZGl0b3IoZWRpdG9yVXJpKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmb2N1c2VkID0gIXdpZGdldC5pbnB1dEVkaXRvci5oYXNXaWRnZXRGb2N1cygpICYmIHdpZGdldC5nZXRGb2N1cygpO1xuXHRcdGNvbnN0IGZvY3VzZWRSZXNwb25zZSA9IGlzUmVzcG9uc2VWTShmb2N1c2VkKSA/IGZvY3VzZWQgOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBlbGVtZW50SWQgPSBjdXJDb2RlQmxvY2tJbmZvPy5lbGVtZW50SWQ7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGVsZW1lbnRJZCA/IHdpZGdldC52aWV3TW9kZWw/LmdldEl0ZW1zKCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IGVsZW1lbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY3VycmVudFJlc3BvbnNlID0gZWxlbWVudCA/P1xuXHRcdFx0KGZvY3VzZWRSZXNwb25zZSA/PyB3aWRnZXQudmlld01vZGVsPy5nZXRJdGVtcygpLnJldmVyc2UoKS5maW5kKChpdGVtKTogaXRlbSBpcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsID0+IGlzUmVzcG9uc2VWTShpdGVtKSkpO1xuXHRcdGlmICghY3VycmVudFJlc3BvbnNlIHx8ICFpc1Jlc3BvbnNlVk0oY3VycmVudFJlc3BvbnNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHdpZGdldC5yZXZlYWwoY3VycmVudFJlc3BvbnNlKTtcblx0XHRjb25zdCByZXNwb25zZUNvZGVibG9ja3MgPSB3aWRnZXQuZ2V0Q29kZUJsb2NrSW5mb3NGb3JSZXNwb25zZShjdXJyZW50UmVzcG9uc2UpO1xuXHRcdGNvbnN0IGZvY3VzSWR4ID0gY3VyQ29kZUJsb2NrSW5mbyA/XG5cdFx0XHQoY3VyQ29kZUJsb2NrSW5mby5jb2RlQmxvY2tJbmRleCArIChyZXZlcnNlID8gLTEgOiAxKSArIHJlc3BvbnNlQ29kZWJsb2Nrcy5sZW5ndGgpICUgcmVzcG9uc2VDb2RlYmxvY2tzLmxlbmd0aCA6XG5cdFx0XHRyZXZlcnNlID8gcmVzcG9uc2VDb2RlYmxvY2tzLmxlbmd0aCAtIDEgOiAwO1xuXG5cdFx0cmVzcG9uc2VDb2RlYmxvY2tzW2ZvY3VzSWR4XT8uZm9jdXMoKTtcblx0fVxuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBOZXh0Q29kZUJsb2NrQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm5leHRDb2RlQmxvY2snLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5uZXh0Q29kZUJsb2NrLmxhYmVsJywgXCJOZXh0IENvZGUgQmxvY2tcIiksXG5cdFx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlBhZ2VEb3duLFxuXHRcdFx0XHRcdG1hYzogeyBwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLlBhZ2VEb3duLCB9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0bmF2aWdhdGVDb2RlQmxvY2tzKGFjY2Vzc29yKTtcblx0XHR9XG5cdH0pO1xuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBQcmV2aW91c0NvZGVCbG9ja0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5wcmV2aW91c0NvZGVCbG9jaycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLnByZXZpb3VzQ29kZUJsb2NrLmxhYmVsJywgXCJQcmV2aW91cyBDb2RlIEJsb2NrXCIpLFxuXHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5QYWdlVXAsXG5cdFx0XHRcdFx0bWFjOiB7IHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLkFsdCB8IEtleUNvZGUuUGFnZVVwLCB9LFxuXHRcdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRcdHdoZW46IENoYXRDb250ZXh0S2V5cy5pbkNoYXRTZXNzaW9uLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0bmF2aWdhdGVDb2RlQmxvY2tzKGFjY2Vzc29yLCB0cnVlKTtcblx0XHR9XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBnZXRDb250ZXh0RnJvbUVkaXRvcihlZGl0b3I6IElDb2RlRWRpdG9yLCBhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IElDb2RlQmxvY2tBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0Y29uc3QgY2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRDb2RlQmxvY2tDb250ZXh0UHJvdmlkZXJTZXJ2aWNlKTtcblx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IHdpZGdldCA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRjb25zdCBjb2RlQmxvY2tJbmZvID0gd2lkZ2V0Py5nZXRDb2RlQmxvY2tJbmZvRm9yRWRpdG9yKG1vZGVsLnVyaSk7XG5cdGlmICghY29kZUJsb2NrSW5mbykge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgY2hhdENvZGVCbG9ja0NvbnRleHRQcm92aWRlclNlcnZpY2UucHJvdmlkZXJzKSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gcHJvdmlkZXIuZ2V0Q29kZUJsb2NrQ29udGV4dChlZGl0b3IpO1xuXHRcdFx0aWYgKGNvbnRleHQpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnRleHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGVsZW1lbnQgPSB3aWRnZXQ/LnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5maW5kKGl0ZW0gPT4gaXRlbS5pZCA9PT0gY29kZUJsb2NrSW5mby5lbGVtZW50SWQpO1xuXHRyZXR1cm4ge1xuXHRcdGVsZW1lbnQsXG5cdFx0Y29kZUJsb2NrSW5kZXg6IGNvZGVCbG9ja0luZm8uY29kZUJsb2NrSW5kZXgsXG5cdFx0Y29kZTogZWRpdG9yLmdldFZhbHVlKCksXG5cdFx0bGFuZ3VhZ2VJZDogZWRpdG9yLmdldE1vZGVsKCkhLmdldExhbmd1YWdlSWQoKSxcblx0XHRjb2RlbWFwcGVyVXJpOiBjb2RlQmxvY2tJbmZvLmNvZGVtYXBwZXJVcmksXG5cdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogY29kZUJsb2NrSW5mby5jaGF0U2Vzc2lvblJlc291cmNlLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJDaGF0Q29kZUNvbXBhcmVCbG9ja0FjdGlvbnMoKSB7XG5cblx0YWJzdHJhY3QgY2xhc3MgQ2hhdENvbXBhcmVDb2RlQmxvY2tBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IGFyZ3NbMF07XG5cdFx0XHRpZiAoIWlzQ29kZUNvbXBhcmVCbG9ja0FjdGlvbkNvbnRleHQoY29udGV4dCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHQvLyBUT0RPQGpyaWVrZW4gZGVyaXZlIGNvbnRleHRcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMucnVuV2l0aENvbnRleHQoYWNjZXNzb3IsIGNvbnRleHQpO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0YWJzdHJhY3QgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDb2RlQ29tcGFyZUJsb2NrQWN0aW9uQ29udGV4dCk6IGFueTtcblx0fVxuXG5cdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBBcHBseUVkaXRzQ29tcGFyZUJsb2NrQWN0aW9uIGV4dGVuZHMgQ2hhdENvbXBhcmVDb2RlQmxvY2tBY3Rpb24ge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hcHBseUNvbXBhcmVFZGl0cycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmNvbXBhcmUuYXBwbHknLCBcIkFwcGx5IEVkaXRzXCIpLFxuXHRcdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0R29Ub0NoYW5nZXMsXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEVkaXRvckNvbnRleHRLZXlzLmhhc0NoYW5nZXMsIENoYXRDb250ZXh0S2V5cy5lZGl0QXBwbGllZC5uZWdhdGUoKSwgRWRpdG9yQ29udGV4dEtleXMucmVhZE9ubHkubmVnYXRlKCkpLFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29tcGFyZUJsb2NrLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEwLFxuXHRcdFx0XHRcdHdoZW46IEVkaXRvckNvbnRleHRLZXlzLnJlYWRPbmx5Lm5lZ2F0ZSgpLFxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdGFzeW5jIHJ1bldpdGhDb250ZXh0KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250ZXh0OiBJQ29kZUNvbXBhcmVCbG9ja0FjdGlvbkNvbnRleHQpOiBQcm9taXNlPGFueT4ge1xuXG5cdFx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvZGVFZGl0b3JTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgaXRlbSA9IGNvbnRleHQuZWRpdDtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gY29udGV4dC5lbGVtZW50O1xuXG5cdFx0XHRpZiAoaXRlbS5zdGF0ZT8uYXBwbGllZCkge1xuXHRcdFx0XHQvLyBhbHJlYWR5IGFwcGxpZWRcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlLmluY2x1ZGVzKGl0ZW0pKSB7XG5cdFx0XHRcdC8vIGJvZ291cyBpdGVtXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlyc3RFZGl0ID0gaXRlbS5lZGl0c1swXT8uWzBdO1xuXHRcdFx0aWYgKCFmaXJzdEVkaXQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGV4dEVkaXRzID0gQXN5bmNJdGVyYWJsZVByb2R1Y2VyLmZyb21BcnJheShpdGVtLmVkaXRzKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yVG9BcHBseSA9IGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkNvZGVFZGl0b3IoeyByZXNvdXJjZTogaXRlbS51cmkgfSwgbnVsbCk7XG5cdFx0XHRpZiAoZWRpdG9yVG9BcHBseSkge1xuXHRcdFx0XHRlZGl0b3JUb0FwcGx5LnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KGZpcnN0RWRpdC5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmV2aWV3RWRpdHMsIGVkaXRvclRvQXBwbHksIHRleHRFZGl0cywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0cmVzcG9uc2Uuc2V0RWRpdEFwcGxpZWQoaXRlbSwgMSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIERpc2NhcmRFZGl0c0NvbXBhcmVCbG9ja0FjdGlvbiBleHRlbmRzIENoYXRDb21wYXJlQ29kZUJsb2NrQWN0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuZGlzY2FyZENvbXBhcmVFZGl0cycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlLmNvbXBhcmUuZGlzY2FyZCcsIFwiRGlzY2FyZCBFZGl0c1wiKSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi50cmFzaCxcblx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoRWRpdG9yQ29udGV4dEtleXMuaGFzQ2hhbmdlcywgQ2hhdENvbnRleHRLZXlzLmVkaXRBcHBsaWVkLm5lZ2F0ZSgpLCBFZGl0b3JDb250ZXh0S2V5cy5yZWFkT25seS5uZWdhdGUoKSksXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRDb21wYXJlQmxvY2ssXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMTEsXG5cdFx0XHRcdFx0d2hlbjogRWRpdG9yQ29udGV4dEtleXMucmVhZE9ubHkubmVnYXRlKCksXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDb2RlQ29tcGFyZUJsb2NrQWN0aW9uQ29udGV4dCk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRjb25zdCBpbnN0YVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWZhdWx0Q2hhdFRleHRFZGl0b3IpO1xuXHRcdFx0ZWRpdG9yLmRpc2NhcmQoY29udGV4dC5lbGVtZW50LCBjb250ZXh0LmVkaXQpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZURpZmZWaWV3TW9kZUFjdGlvbiBleHRlbmRzIENoYXRDb21wYXJlQ29kZUJsb2NrQWN0aW9uIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudG9nZ2xlQ29tcGFyZUJsb2NrRGlmZlZpZXdNb2RlJyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmUuY29tcGFyZS50b2dnbGVEaWZmVmlld01vZGUnLCBcIlRvZ2dsZSBJbmxpbmUvU2lkZS1ieS1TaWRlIERpZmZcIiksXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24uZGlmZlNpbmdsZSxcblx0XHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRcdGNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuZGlmZkVkaXRvcklubGluZU1vZGUsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5kaWZmLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZW51OiB7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0Q29tcGFyZUJsb2NrLFxuXHRcdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJ1bldpdGhDb250ZXh0KF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY29udGV4dDogSUNvZGVDb21wYXJlQmxvY2tBY3Rpb25Db250ZXh0KTogdm9pZCB7XG5cdFx0XHRjb250ZXh0LnRvZ2dsZURpZmZWaWV3TW9kZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5Db21wYXJlQmxvY2tJbkRpZmZFZGl0b3IgZXh0ZW5kcyBDaGF0Q29tcGFyZUNvZGVCbG9ja0FjdGlvbiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5Db21wYXJlQmxvY2tJbkRpZmZFZGl0b3InLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdpbnRlcmFjdGl2ZS5jb21wYXJlLm9wZW5JbkRpZmZFZGl0b3InLCBcIk9wZW4gaW4gRGlmZiBFZGl0b3JcIiksXG5cdFx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdGljb246IENvZGljb24uZ29Ub0ZpbGUsXG5cdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXRDb21wYXJlQmxvY2ssXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0XHRvcmRlcjogMixcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0YXN5bmMgcnVuV2l0aENvbnRleHQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGNvbnRleHQ6IElDb2RlQ29tcGFyZUJsb2NrQWN0aW9uQ29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvbnRleHQuZGlmZkVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBtb2RlbC5vcmlnaW5hbC51cmkgfSxcblx0XHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IG1vZGVsLm1vZGlmaWVkLnVyaSB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSx1QkFBdUI7QUFHNUMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLFNBQVMsUUFBUSxnQkFBZ0IsdUJBQXVCO0FBQ2pFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBR2pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCLHVCQUF1Qix3QkFBd0I7QUFDaEYsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjLG9CQUFvQjtBQUMzQyxTQUF3RCxhQUFhLG9CQUFvQjtBQUN6RixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNDQUFzQywwQkFBMEI7QUFDekUsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBc0Y7QUFDL0YsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUIsZ0NBQWdDO0FBRWxFLE1BQU0sZUFBZTtBQUFBLEVBQ3BCO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQ0Q7QUFNTyxTQUFTLHlCQUF5QixPQUFrRDtBQUMxRixT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
