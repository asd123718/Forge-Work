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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { codiconsLibrary } from "../../../../../../base/common/codiconsLibrary.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CompletionItemKind } from "../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { localize } from "../../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../common/contributions.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IChatWidgetService } from "../../../../chat/browser/chat.js";
import { IChatContextPickService } from "../../../../chat/browser/attachments/chatContextPickService.js";
import { ChatDynamicVariableModel } from "../../../../chat/browser/attachments/chatDynamicVariables.js";
import { computeCompletionRanges } from "../../../../chat/browser/widget/input/editor/chatInputCompletionUtils.js";
import { IChatAgentService } from "../../../../chat/common/participants/chatAgents.js";
import { ChatContextKeys } from "../../../../chat/common/actions/chatContextKeys.js";
import { chatVariableLeader } from "../../../../chat/common/requestParser/chatParserTypes.js";
import { ChatAgentLocation } from "../../../../chat/common/constants.js";
import { NOTEBOOK_CELL_HAS_OUTPUTS, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT, NOTEBOOK_CELL_OUTPUT_MIMETYPE } from "../../../common/notebookContextKeys.js";
import { INotebookKernelService } from "../../../common/notebookKernelService.js";
import { createNotebookOutputVariableEntry, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST } from "../../contrib/chat/notebookChatUtils.js";
import { getNotebookEditorFromEditorPane } from "../../notebookBrowser.js";
import * as icons from "../../notebookIcons.js";
import { getOutputViewModelFromId } from "../cellOutputActions.js";
import { NOTEBOOK_ACTIONS_CATEGORY } from "../coreActions.js";
import "./cellChatActions.js";
import { CTX_NOTEBOOK_CHAT_HAS_AGENT } from "./notebookChatContext.js";
const NotebookKernelVariableKey = "kernelVariable";
let NotebookChatContribution = class extends Disposable {
  constructor(contextKeyService, chatAgentService, editorService, chatWidgetService, notebookKernelService, languageFeaturesService, chatContextPickService) {
    super();
    this.editorService = editorService;
    this.chatWidgetService = chatWidgetService;
    this.notebookKernelService = notebookKernelService;
    this.languageFeaturesService = languageFeaturesService;
    this._register(chatContextPickService.registerChatContextItem(new KernelVariableContextPicker(this.editorService, this.notebookKernelService)));
    this._ctxHasProvider = CTX_NOTEBOOK_CHAT_HAS_AGENT.bindTo(contextKeyService);
    const updateNotebookAgentStatus = () => {
      const hasNotebookAgent = Boolean(chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
      this._ctxHasProvider.set(hasNotebookAgent);
    };
    updateNotebookAgentStatus();
    this._register(chatAgentService.onDidChangeAgents(updateNotebookAgentStatus));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatKernelDynamicCompletions",
      triggerCharacters: [chatVariableLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.supportsFileReferences) {
          return null;
        }
        if (widget.location !== ChatAgentLocation.Notebook) {
          return null;
        }
        const variableNameDef = new RegExp(`${chatVariableLeader}\\w*`, "g");
        const range = computeCompletionRanges(model, position, variableNameDef, true);
        if (!range) {
          return null;
        }
        const result = { suggestions: [] };
        const afterRange = new Range(position.lineNumber, range.replace.startColumn, position.lineNumber, range.replace.startColumn + `${chatVariableLeader}${NotebookKernelVariableKey}:`.length);
        result.suggestions.push({
          label: `${chatVariableLeader}${NotebookKernelVariableKey}`,
          insertText: `${chatVariableLeader}${NotebookKernelVariableKey}:`,
          detail: localize("pickKernelVariableLabel", "Pick a variable from the kernel"),
          range,
          kind: CompletionItemKind.Text,
          command: { id: SelectAndInsertKernelVariableAction.ID, title: SelectAndInsertKernelVariableAction.ID, arguments: [{ widget, range: afterRange }] },
          sortText: "z"
        });
        await this.addKernelVariableCompletion(widget, result, range, token);
        return result;
      }
    }));
    NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT.bindTo(contextKeyService).set(NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST);
  }
  async addKernelVariableCompletion(widget, result, info, token) {
    let pattern;
    if (info.varWord?.word && info.varWord.word.startsWith(chatVariableLeader)) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const notebook = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
    if (!notebook) {
      return;
    }
    const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
    const hasVariableProvider = selectedKernel?.hasVariableProvider;
    if (!hasVariableProvider) {
      return;
    }
    const variables = selectedKernel.provideVariables(notebook.uri, void 0, "named", 0, CancellationToken.None);
    for await (const variable of variables) {
      if (pattern && !variable.name.toLowerCase().includes(pattern)) {
        continue;
      }
      result.suggestions.push({
        label: { label: variable.name, description: variable.type },
        insertText: `${chatVariableLeader}${NotebookKernelVariableKey}:${variable.name} `,
        filterText: `${chatVariableLeader}${variable.name}`,
        range: info,
        kind: CompletionItemKind.Variable,
        sortText: "z",
        command: { id: SelectAndInsertKernelVariableAction.ID, title: SelectAndInsertKernelVariableAction.ID, arguments: [{ widget, range: info.insert, variable: variable.name }] },
        detail: variable.type,
        documentation: variable.value
      });
    }
  }
};
NotebookChatContribution.ID = "workbench.contrib.notebookChatContribution";
NotebookChatContribution = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IChatWidgetService),
  __decorateParam(4, INotebookKernelService),
  __decorateParam(5, ILanguageFeaturesService),
  __decorateParam(6, IChatContextPickService)
], NotebookChatContribution);
const _SelectAndInsertKernelVariableAction = class _SelectAndInsertKernelVariableAction extends Action2 {
  constructor() {
    super({
      id: _SelectAndInsertKernelVariableAction.ID,
      title: ""
      // not displayed
    });
  }
  async run(accessor, ...args) {
    const editorService = accessor.get(IEditorService);
    const notebookKernelService = accessor.get(INotebookKernelService);
    const quickInputService = accessor.get(IQuickInputService);
    const notebook = getNotebookEditorFromEditorPane(editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
    if (!notebook) {
      return;
    }
    const context = args[0];
    if (!context || !("widget" in context) || !("range" in context)) {
      return;
    }
    const widget = context.widget;
    const range = context.range;
    const variable = context.variable;
    if (variable !== void 0) {
      this.addVariableReference(widget, variable, range, false);
      return;
    }
    const selectedKernel = notebookKernelService.getMatchingKernel(notebook).selected;
    const hasVariableProvider = selectedKernel?.hasVariableProvider;
    if (!hasVariableProvider) {
      return;
    }
    const variables = selectedKernel.provideVariables(notebook.uri, void 0, "named", 0, CancellationToken.None);
    const quickPickItems = [];
    for await (const variable2 of variables) {
      quickPickItems.push({
        label: variable2.name,
        description: variable2.value,
        detail: variable2.type
      });
    }
    const placeHolder = quickPickItems.length > 0 ? localize("selectKernelVariablePlaceholder", "Select a kernel variable") : localize("noKernelVariables", "No kernel variables found");
    const pickedVariable = await quickInputService.pick(quickPickItems, { placeHolder });
    if (!pickedVariable) {
      return;
    }
    this.addVariableReference(widget, pickedVariable.label, range, true);
  }
  addVariableReference(widget, variableName, range, updateText) {
    if (range) {
      const text = `#kernelVariable:${variableName}`;
      if (updateText) {
        const editor = widget.inputEditor;
        const success = editor.executeEdits("chatInsertFile", [{ range, text: text + " " }]);
        if (!success) {
          return;
        }
      }
      widget.getContrib(ChatDynamicVariableModel.ID)?.addReference({
        id: "vscode.notebook.variable",
        range: { startLineNumber: range.startLineNumber, startColumn: range.startColumn, endLineNumber: range.endLineNumber, endColumn: range.startColumn + text.length },
        data: variableName,
        fullName: variableName,
        icon: codiconsLibrary.variable
      });
    } else {
      widget.attachmentModel.addContext({
        id: "vscode.notebook.variable",
        name: variableName,
        value: variableName,
        icon: codiconsLibrary.variable,
        kind: "generic"
      });
    }
  }
};
_SelectAndInsertKernelVariableAction.ID = "notebook.chat.selectAndInsertKernelVariable";
let SelectAndInsertKernelVariableAction = _SelectAndInsertKernelVariableAction;
let KernelVariableContextPicker = class {
  constructor(editorService, notebookKernelService) {
    this.editorService = editorService;
    this.notebookKernelService = notebookKernelService;
    this.type = "pickerPick";
    this.label = localize("chatContext.notebook.kernelVariable", "Kernel Variable...");
    this.icon = Codicon.serverEnvironment;
  }
  isEnabled(widget) {
    return widget.location === ChatAgentLocation.Notebook && Boolean(getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument);
  }
  asPicker() {
    const picks = (async () => {
      const notebook = getNotebookEditorFromEditorPane(this.editorService.activeEditorPane)?.getViewModel()?.notebookDocument;
      if (!notebook) {
        return [];
      }
      const selectedKernel = this.notebookKernelService.getMatchingKernel(notebook).selected;
      const hasVariableProvider = selectedKernel?.hasVariableProvider;
      if (!hasVariableProvider) {
        return [];
      }
      const variables = selectedKernel.provideVariables(notebook.uri, void 0, "named", 0, CancellationToken.None);
      const result = [];
      for await (const variable of variables) {
        result.push({
          label: variable.name,
          description: variable.value,
          asAttachment: () => {
            return {
              kind: "generic",
              id: "vscode.notebook.variable",
              name: variable.name,
              value: variable.value,
              icon: codiconsLibrary.variable
            };
          }
        });
      }
      return result;
    })();
    return {
      placeholder: localize("chatContext.notebook.kernelVariable.placeholder", "Select a kernel variable"),
      picks
    };
  }
};
KernelVariableContextPicker = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, INotebookKernelService)
], KernelVariableContextPicker);
registerAction2(class AddCellOutputToChatAction extends Action2 {
  constructor() {
    super({
      id: "notebook.cellOutput.addToChat",
      title: localize("notebookActions.addOutputToChat", "Add Cell Output to Chat"),
      menu: {
        id: MenuId.NotebookOutputToolbar,
        when: ContextKeyExpr.and(NOTEBOOK_CELL_HAS_OUTPUTS, ContextKeyExpr.in(NOTEBOOK_CELL_OUTPUT_MIMETYPE.key, NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT.key)),
        order: 10,
        group: "notebook_chat_actions"
      },
      category: NOTEBOOK_ACTIONS_CATEGORY,
      icon: icons.copyIcon,
      precondition: ChatContextKeys.enabled
    });
  }
  getNoteboookEditor(editorService, outputContext) {
    if (outputContext && "notebookEditor" in outputContext) {
      return outputContext.notebookEditor;
    }
    return getNotebookEditorFromEditorPane(editorService.activeEditorPane);
  }
  async run(accessor, outputContext) {
    const notebookEditor = this.getNoteboookEditor(accessor.get(IEditorService), outputContext);
    if (!notebookEditor) {
      return;
    }
    let outputViewModel;
    if (outputContext && "outputId" in outputContext && typeof outputContext.outputId === "string") {
      outputViewModel = getOutputViewModelFromId(outputContext.outputId, notebookEditor);
    } else if (outputContext && "outputViewModel" in outputContext) {
      outputViewModel = outputContext.outputViewModel;
    }
    if (!outputViewModel) {
      const activeCell = notebookEditor.getActiveCell();
      if (!activeCell) {
        return;
      }
      if (activeCell.focusedOutputId !== void 0) {
        outputViewModel = activeCell.outputsViewModels.find((output) => {
          return output.model.outputId === activeCell.focusedOutputId;
        });
      } else {
        outputViewModel = activeCell.outputsViewModels.find((output) => output.pickedMimeType?.isTrusted);
      }
    }
    if (!outputViewModel) {
      return;
    }
    const mimeType = outputViewModel.pickedMimeType?.mimeType;
    const chatWidgetService = accessor.get(IChatWidgetService);
    const widget = await chatWidgetService.revealWidget();
    if (widget && mimeType && NOTEBOOK_CELL_OUTPUT_MIME_TYPE_LIST_FOR_CHAT_CONST.includes(mimeType)) {
      const entry = createNotebookOutputVariableEntry(outputViewModel, mimeType, notebookEditor);
      if (!entry) {
        return;
      }
      widget.attachmentModel.addContext(entry);
      (await chatWidgetService.revealWidget())?.focusInput();
    }
  }
});
registerAction2(SelectAndInsertKernelVariableAction);
registerWorkbenchContribution2(NotebookChatContribution.ID, NotebookChatContribution, WorkbenchPhase.BlockRestore);
export {
  SelectAndInsertKernelVariableAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cm9sbGVyXFxjaGF0XFxub3RlYm9vay5jaGF0LmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBjb2RpY29uc0xpYnJhcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29uc0xpYnJhcnkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJV29yZEF0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvbkl0ZW1LaW5kLCBDb21wbGV0aW9uTGlzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0UGlja2VyLCBJQ2hhdENvbnRleHRQaWNrZXJJdGVtLCBJQ2hhdENvbnRleHRQaWNrZXJQaWNrSXRlbSwgSUNoYXRDb250ZXh0UGlja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdENvbnRleHRQaWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRDb21wbGV0aW9uVXRpbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBjaGF0VmFyaWFibGVMZWFkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19DRUxMX0hBU19PVVRQVVRTLCBOT1RFQk9PS19DRUxMX09VVFBVVF9NSU1FX1RZUEVfTElTVF9GT1JfQ0hBVCwgTk9URUJPT0tfQ0VMTF9PVVRQVVRfTUlNRVRZUEUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rS2VybmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb3RlYm9va091dHB1dFZhcmlhYmxlRW50cnksIE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVfVFlQRV9MSVNUX0ZPUl9DSEFUX0NPTlNUIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L25vdGVib29rQ2hhdFV0aWxzLmpzJztcbmltcG9ydCB7IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUsIElDZWxsT3V0cHV0Vmlld01vZGVsLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0ICogYXMgaWNvbnMgZnJvbSAnLi4vLi4vbm90ZWJvb2tJY29ucy5qcyc7XG5pbXBvcnQgeyBnZXRPdXRwdXRWaWV3TW9kZWxGcm9tSWQgfSBmcm9tICcuLi9jZWxsT3V0cHV0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tPdXRwdXRBY3Rpb25Db250ZXh0LCBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZIH0gZnJvbSAnLi4vY29yZUFjdGlvbnMuanMnO1xuaW1wb3J0ICcuL2NlbGxDaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDVFhfTk9URUJPT0tfQ0hBVF9IQVNfQUdFTlQgfSBmcm9tICcuL25vdGVib29rQ2hhdENvbnRleHQuanMnO1xuXG5jb25zdCBOb3RlYm9va0tlcm5lbFZhcmlhYmxlS2V5ID0gJ2tlcm5lbFZhcmlhYmxlJztcblxuY2xhc3MgTm90ZWJvb2tDaGF0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubm90ZWJvb2tDaGF0Q29udHJpYnV0aW9uJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhIYXNQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASU5vdGVib29rS2VybmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rS2VybmVsU2VydmljZTogSU5vdGVib29rS2VybmVsU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNoYXRDb250ZXh0UGlja1NlcnZpY2UgY2hhdENvbnRleHRQaWNrU2VydmljZTogSUNoYXRDb250ZXh0UGlja1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRDb250ZXh0UGlja1NlcnZpY2UucmVnaXN0ZXJDaGF0Q29udGV4dEl0ZW0obmV3IEtlcm5lbFZhcmlhYmxlQ29udGV4dFBpY2tlcih0aGlzLmVkaXRvclNlcnZpY2UsIHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlKSkpO1xuXG5cdFx0dGhpcy5fY3R4SGFzUHJvdmlkZXIgPSBDVFhfTk9URUJPT0tfQ0hBVF9IQVNfQUdFTlQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHVwZGF0ZU5vdGVib29rQWdlbnRTdGF0dXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBoYXNOb3RlYm9va0FnZW50ID0gQm9vbGVhbihjaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudChDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vaykpO1xuXHRcdFx0dGhpcy5fY3R4SGFzUHJvdmlkZXIuc2V0KGhhc05vdGVib29rQWdlbnQpO1xuXHRcdH07XG5cblx0XHR1cGRhdGVOb3RlYm9va0FnZW50U3RhdHVzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cyh1cGRhdGVOb3RlYm9va0FnZW50U3RhdHVzKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnY2hhdEtlcm5lbER5bmFtaWNDb21wbGV0aW9ucycsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW2NoYXRWYXJpYWJsZUxlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQuc3VwcG9ydHNGaWxlUmVmZXJlbmNlcykge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdpZGdldC5sb2NhdGlvbiAhPT0gQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2spIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHZhcmlhYmxlTmFtZURlZiA9IG5ldyBSZWdFeHAoYCR7Y2hhdFZhcmlhYmxlTGVhZGVyfVxcXFx3KmAsICdnJyk7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCB2YXJpYWJsZU5hbWVEZWYsIHRydWUpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQ6IENvbXBsZXRpb25MaXN0ID0geyBzdWdnZXN0aW9uczogW10gfTtcblxuXHRcdFx0XHRjb25zdCBhZnRlclJhbmdlID0gbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4gKyBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9JHtOb3RlYm9va0tlcm5lbFZhcmlhYmxlS2V5fTpgLmxlbmd0aCk7XG5cdFx0XHRcdHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogYCR7Y2hhdFZhcmlhYmxlTGVhZGVyfSR7Tm90ZWJvb2tLZXJuZWxWYXJpYWJsZUtleX1gLFxuXHRcdFx0XHRcdGluc2VydFRleHQ6IGAke2NoYXRWYXJpYWJsZUxlYWRlcn0ke05vdGVib29rS2VybmVsVmFyaWFibGVLZXl9OmAsXG5cdFx0XHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgncGlja0tlcm5lbFZhcmlhYmxlTGFiZWwnLCBcIlBpY2sgYSB2YXJpYWJsZSBmcm9tIHRoZSBrZXJuZWxcIiksXG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0Y29tbWFuZDogeyBpZDogU2VsZWN0QW5kSW5zZXJ0S2VybmVsVmFyaWFibGVBY3Rpb24uSUQsIHRpdGxlOiBTZWxlY3RBbmRJbnNlcnRLZXJuZWxWYXJpYWJsZUFjdGlvbi5JRCwgYXJndW1lbnRzOiBbeyB3aWRnZXQsIHJhbmdlOiBhZnRlclJhbmdlIH1dIH0sXG5cdFx0XHRcdFx0c29ydFRleHQ6ICd6J1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhd2FpdCB0aGlzLmFkZEtlcm5lbFZhcmlhYmxlQ29tcGxldGlvbih3aWRnZXQsIHJlc3VsdCwgcmFuZ2UsIHRva2VuKTtcblxuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIG91dHB1dCBjb250ZXh0XG5cdFx0Tk9URUJPT0tfQ0VMTF9PVVRQVVRfTUlNRV9UWVBFX0xJU1RfRk9SX0NIQVQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoTk9URUJPT0tfQ0VMTF9PVVRQVVRfTUlNRV9UWVBFX0xJU1RfRk9SX0NIQVRfQ09OU1QpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRLZXJuZWxWYXJpYWJsZUNvbXBsZXRpb24od2lkZ2V0OiBJQ2hhdFdpZGdldCwgcmVzdWx0OiBDb21wbGV0aW9uTGlzdCwgaW5mbzogeyBpbnNlcnQ6IFJhbmdlOyByZXBsYWNlOiBSYW5nZTsgdmFyV29yZDogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRsZXQgcGF0dGVybjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChpbmZvLnZhcldvcmQ/LndvcmQgJiYgaW5mby52YXJXb3JkLndvcmQuc3RhcnRzV2l0aChjaGF0VmFyaWFibGVMZWFkZXIpKSB7XG5cdFx0XHRwYXR0ZXJuID0gaW5mby52YXJXb3JkLndvcmQudG9Mb3dlckNhc2UoKS5zbGljZSgxKTtcblx0XHR9XG5cblx0XHRjb25zdCBub3RlYm9vayA9IGdldE5vdGVib29rRWRpdG9yRnJvbUVkaXRvclBhbmUodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpPy5nZXRWaWV3TW9kZWwoKT8ubm90ZWJvb2tEb2N1bWVudDtcblxuXHRcdGlmICghbm90ZWJvb2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3RlZEtlcm5lbCA9IHRoaXMubm90ZWJvb2tLZXJuZWxTZXJ2aWNlLmdldE1hdGNoaW5nS2VybmVsKG5vdGVib29rKS5zZWxlY3RlZDtcblx0XHRjb25zdCBoYXNWYXJpYWJsZVByb3ZpZGVyID0gc2VsZWN0ZWRLZXJuZWw/Lmhhc1ZhcmlhYmxlUHJvdmlkZXI7XG5cblx0XHRpZiAoIWhhc1ZhcmlhYmxlUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB2YXJpYWJsZXMgPSBzZWxlY3RlZEtlcm5lbC5wcm92aWRlVmFyaWFibGVzKG5vdGVib29rLnVyaSwgdW5kZWZpbmVkLCAnbmFtZWQnLCAwLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGZvciBhd2FpdCAoY29uc3QgdmFyaWFibGUgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRpZiAocGF0dGVybiAmJiAhdmFyaWFibGUubmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHBhdHRlcm4pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXN1bHQuc3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiB2YXJpYWJsZS5uYW1lLCBkZXNjcmlwdGlvbjogdmFyaWFibGUudHlwZSB9LFxuXHRcdFx0XHRpbnNlcnRUZXh0OiBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9JHtOb3RlYm9va0tlcm5lbFZhcmlhYmxlS2V5fToke3ZhcmlhYmxlLm5hbWV9IGAsXG5cdFx0XHRcdGZpbHRlclRleHQ6IGAke2NoYXRWYXJpYWJsZUxlYWRlcn0ke3ZhcmlhYmxlLm5hbWV9YCxcblx0XHRcdFx0cmFuZ2U6IGluZm8sXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5WYXJpYWJsZSxcblx0XHRcdFx0c29ydFRleHQ6ICd6Jyxcblx0XHRcdFx0Y29tbWFuZDogeyBpZDogU2VsZWN0QW5kSW5zZXJ0S2VybmVsVmFyaWFibGVBY3Rpb24uSUQsIHRpdGxlOiBTZWxlY3RBbmRJbnNlcnRLZXJuZWxWYXJpYWJsZUFjdGlvbi5JRCwgYXJndW1lbnRzOiBbeyB3aWRnZXQsIHJhbmdlOiBpbmZvLmluc2VydCwgdmFyaWFibGU6IHZhcmlhYmxlLm5hbWUgfV0gfSxcblx0XHRcdFx0ZGV0YWlsOiB2YXJpYWJsZS50eXBlLFxuXHRcdFx0XHRkb2N1bWVudGF0aW9uOiB2YXJpYWJsZS52YWx1ZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2VsZWN0QW5kSW5zZXJ0S2VybmVsVmFyaWFibGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNlbGVjdEFuZEluc2VydEtlcm5lbFZhcmlhYmxlQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6ICcnIC8vIG5vdCBkaXNwbGF5ZWRcblx0XHR9KTtcblx0fVxuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdub3RlYm9vay5jaGF0LnNlbGVjdEFuZEluc2VydEtlcm5lbFZhcmlhYmxlJztcblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGVib29rS2VybmVsU2VydmljZSA9IGFjY2Vzc29yLmdldChJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgbm90ZWJvb2sgPSBnZXROb3RlYm9va0VkaXRvckZyb21FZGl0b3JQYW5lKGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk/LmdldFZpZXdNb2RlbCgpPy5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0aWYgKCFub3RlYm9vaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRleHQgPSBhcmdzWzBdIGFzIHsgd2lkZ2V0OiBJQ2hhdFdpZGdldDsgcmFuZ2U/OiBSYW5nZTsgdmFyaWFibGU/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWNvbnRleHQgfHwgISgnd2lkZ2V0JyBpbiBjb250ZXh0KSB8fCAhKCdyYW5nZScgaW4gY29udGV4dCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXQgPSBjb250ZXh0LndpZGdldDtcblx0XHRjb25zdCByYW5nZSA9IGNvbnRleHQucmFuZ2U7XG5cdFx0Y29uc3QgdmFyaWFibGUgPSBjb250ZXh0LnZhcmlhYmxlO1xuXG5cdFx0aWYgKHZhcmlhYmxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuYWRkVmFyaWFibGVSZWZlcmVuY2Uod2lkZ2V0LCB2YXJpYWJsZSwgcmFuZ2UsIGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3RlZEtlcm5lbCA9IG5vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vaykuc2VsZWN0ZWQ7XG5cdFx0Y29uc3QgaGFzVmFyaWFibGVQcm92aWRlciA9IHNlbGVjdGVkS2VybmVsPy5oYXNWYXJpYWJsZVByb3ZpZGVyO1xuXG5cdFx0aWYgKCFoYXNWYXJpYWJsZVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFyaWFibGVzID0gc2VsZWN0ZWRLZXJuZWwucHJvdmlkZVZhcmlhYmxlcyhub3RlYm9vay51cmksIHVuZGVmaW5lZCwgJ25hbWVkJywgMCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRjb25zdCBxdWlja1BpY2tJdGVtczogSVF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRcdGZvciBhd2FpdCAoY29uc3QgdmFyaWFibGUgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRxdWlja1BpY2tJdGVtcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IHZhcmlhYmxlLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB2YXJpYWJsZS52YWx1ZSxcblx0XHRcdFx0ZGV0YWlsOiB2YXJpYWJsZS50eXBlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGxhY2VIb2xkZXIgPSBxdWlja1BpY2tJdGVtcy5sZW5ndGggPiAwXG5cdFx0XHQ/IGxvY2FsaXplKCdzZWxlY3RLZXJuZWxWYXJpYWJsZVBsYWNlaG9sZGVyJywgXCJTZWxlY3QgYSBrZXJuZWwgdmFyaWFibGVcIilcblx0XHRcdDogbG9jYWxpemUoJ25vS2VybmVsVmFyaWFibGVzJywgXCJObyBrZXJuZWwgdmFyaWFibGVzIGZvdW5kXCIpO1xuXG5cdFx0Y29uc3QgcGlja2VkVmFyaWFibGUgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKHF1aWNrUGlja0l0ZW1zLCB7IHBsYWNlSG9sZGVyIH0pO1xuXHRcdGlmICghcGlja2VkVmFyaWFibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmFkZFZhcmlhYmxlUmVmZXJlbmNlKHdpZGdldCwgcGlja2VkVmFyaWFibGUubGFiZWwsIHJhbmdlLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVmFyaWFibGVSZWZlcmVuY2Uod2lkZ2V0OiBJQ2hhdFdpZGdldCwgdmFyaWFibGVOYW1lOiBzdHJpbmcsIHJhbmdlPzogUmFuZ2UsIHVwZGF0ZVRleHQ/OiBib29sZWFuKSB7XG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYCNrZXJuZWxWYXJpYWJsZToke3ZhcmlhYmxlTmFtZX1gO1xuXG5cdFx0XHRpZiAodXBkYXRlVGV4dCkge1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB3aWRnZXQuaW5wdXRFZGl0b3I7XG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBlZGl0b3IuZXhlY3V0ZUVkaXRzKCdjaGF0SW5zZXJ0RmlsZScsIFt7IHJhbmdlLCB0ZXh0OiB0ZXh0ICsgJyAnIH1dKTtcblx0XHRcdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHdpZGdldC5nZXRDb250cmliPENoYXREeW5hbWljVmFyaWFibGVNb2RlbD4oQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEKT8uYWRkUmVmZXJlbmNlKHtcblx0XHRcdFx0aWQ6ICd2c2NvZGUubm90ZWJvb2sudmFyaWFibGUnLFxuXHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IHJhbmdlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiByYW5nZS5lbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uICsgdGV4dC5sZW5ndGggfSxcblx0XHRcdFx0ZGF0YTogdmFyaWFibGVOYW1lLFxuXHRcdFx0XHRmdWxsTmFtZTogdmFyaWFibGVOYW1lLFxuXHRcdFx0XHRpY29uOiBjb2RpY29uc0xpYnJhcnkudmFyaWFibGUsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KHtcblx0XHRcdFx0aWQ6ICd2c2NvZGUubm90ZWJvb2sudmFyaWFibGUnLFxuXHRcdFx0XHRuYW1lOiB2YXJpYWJsZU5hbWUsXG5cdFx0XHRcdHZhbHVlOiB2YXJpYWJsZU5hbWUsXG5cdFx0XHRcdGljb246IGNvZGljb25zTGlicmFyeS52YXJpYWJsZSxcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgS2VybmVsVmFyaWFibGVDb250ZXh0UGlja2VyIGltcGxlbWVudHMgSUNoYXRDb250ZXh0UGlja2VySXRlbSB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICdwaWNrZXJQaWNrJztcblx0cmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnY2hhdENvbnRleHQubm90ZWJvb2sua2VybmVsVmFyaWFibGUnLCAnS2VybmVsIFZhcmlhYmxlLi4uJyk7XG5cdHJlYWRvbmx5IGljb24gPSBDb2RpY29uLnNlcnZlckVudmlyb25tZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tLZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGlzRW5hYmxlZCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogUHJvbWlzZTxib29sZWFuPiB8IGJvb2xlYW4ge1xuXHRcdHJldHVybiB3aWRnZXQubG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rICYmIEJvb2xlYW4oZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk/LmdldFZpZXdNb2RlbCgpPy5ub3RlYm9va0RvY3VtZW50KTtcblx0fVxuXG5cdGFzUGlja2VyKCk6IElDaGF0Q29udGV4dFBpY2tlciB7XG5cblx0XHRjb25zdCBwaWNrcyA9IChhc3luYyAoKSA9PiB7XG5cblx0XHRcdGNvbnN0IG5vdGVib29rID0gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZSh0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZSk/LmdldFZpZXdNb2RlbCgpPy5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0XHRpZiAoIW5vdGVib29rKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VsZWN0ZWRLZXJuZWwgPSB0aGlzLm5vdGVib29rS2VybmVsU2VydmljZS5nZXRNYXRjaGluZ0tlcm5lbChub3RlYm9vaykuc2VsZWN0ZWQ7XG5cdFx0XHRjb25zdCBoYXNWYXJpYWJsZVByb3ZpZGVyID0gc2VsZWN0ZWRLZXJuZWw/Lmhhc1ZhcmlhYmxlUHJvdmlkZXI7XG5cblx0XHRcdGlmICghaGFzVmFyaWFibGVQcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZhcmlhYmxlcyA9IHNlbGVjdGVkS2VybmVsLnByb3ZpZGVWYXJpYWJsZXMobm90ZWJvb2sudXJpLCB1bmRlZmluZWQsICduYW1lZCcsIDAsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IElDaGF0Q29udGV4dFBpY2tlclBpY2tJdGVtW10gPSBbXTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgdmFyaWFibGUgb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogdmFyaWFibGUubmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdmFyaWFibGUudmFsdWUsXG5cdFx0XHRcdFx0YXNBdHRhY2htZW50OiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0XHRcdGlkOiAndnNjb2RlLm5vdGVib29rLnZhcmlhYmxlJyxcblx0XHRcdFx0XHRcdFx0bmFtZTogdmFyaWFibGUubmFtZSxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHZhcmlhYmxlLnZhbHVlLFxuXHRcdFx0XHRcdFx0XHRpY29uOiBjb2RpY29uc0xpYnJhcnkudmFyaWFibGUsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pKCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGxhY2Vob2xkZXI6IGxvY2FsaXplKCdjaGF0Q29udGV4dC5ub3RlYm9vay5rZXJuZWxWYXJpYWJsZS5wbGFjZWhvbGRlcicsICdTZWxlY3QgYSBrZXJuZWwgdmFyaWFibGUnKSxcblx0XHRcdHBpY2tzXG5cdFx0fTtcblx0fVxufVxuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBBZGRDZWxsT3V0cHV0VG9DaGF0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2suY2VsbE91dHB1dC5hZGRUb0NoYXQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdub3RlYm9va0FjdGlvbnMuYWRkT3V0cHV0VG9DaGF0JywgXCJBZGQgQ2VsbCBPdXRwdXQgdG8gQ2hhdFwiKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va091dHB1dFRvb2xiYXIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChOT1RFQk9PS19DRUxMX0hBU19PVVRQVVRTLCBDb250ZXh0S2V5RXhwci5pbihOT1RFQk9PS19DRUxMX09VVFBVVF9NSU1FVFlQRS5rZXksIE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVfVFlQRV9MSVNUX0ZPUl9DSEFULmtleSkpLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdGdyb3VwOiAnbm90ZWJvb2tfY2hhdF9hY3Rpb25zJ1xuXHRcdFx0fSxcblx0XHRcdGNhdGVnb3J5OiBOT1RFQk9PS19BQ1RJT05TX0NBVEVHT1JZLFxuXHRcdFx0aWNvbjogaWNvbnMuY29weUljb24sXG5cdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE5vdGVib29va0VkaXRvcihlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSwgb3V0cHV0Q29udGV4dDogSU5vdGVib29rT3V0cHV0QWN0aW9uQ29udGV4dCB8IHsgb3V0cHV0Vmlld01vZGVsOiBJQ2VsbE91dHB1dFZpZXdNb2RlbCB9IHwgdW5kZWZpbmVkKTogSU5vdGVib29rRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAob3V0cHV0Q29udGV4dCAmJiAnbm90ZWJvb2tFZGl0b3InIGluIG91dHB1dENvbnRleHQpIHtcblx0XHRcdHJldHVybiBvdXRwdXRDb250ZXh0Lm5vdGVib29rRWRpdG9yO1xuXHRcdH1cblx0XHRyZXR1cm4gZ2V0Tm90ZWJvb2tFZGl0b3JGcm9tRWRpdG9yUGFuZShlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUpO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvdXRwdXRDb250ZXh0OiBJTm90ZWJvb2tPdXRwdXRBY3Rpb25Db250ZXh0IHwgeyBvdXRwdXRWaWV3TW9kZWw6IElDZWxsT3V0cHV0Vmlld01vZGVsIH0gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHRoaXMuZ2V0Tm90ZWJvb29rRWRpdG9yKGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSksIG91dHB1dENvbnRleHQpO1xuXG5cdFx0aWYgKCFub3RlYm9va0VkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBvdXRwdXRWaWV3TW9kZWw6IElDZWxsT3V0cHV0Vmlld01vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvdXRwdXRDb250ZXh0ICYmICdvdXRwdXRJZCcgaW4gb3V0cHV0Q29udGV4dCAmJiB0eXBlb2Ygb3V0cHV0Q29udGV4dC5vdXRwdXRJZCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG91dHB1dFZpZXdNb2RlbCA9IGdldE91dHB1dFZpZXdNb2RlbEZyb21JZChvdXRwdXRDb250ZXh0Lm91dHB1dElkLCBub3RlYm9va0VkaXRvcik7XG5cdFx0fSBlbHNlIGlmIChvdXRwdXRDb250ZXh0ICYmICdvdXRwdXRWaWV3TW9kZWwnIGluIG91dHB1dENvbnRleHQpIHtcblx0XHRcdG91dHB1dFZpZXdNb2RlbCA9IG91dHB1dENvbnRleHQub3V0cHV0Vmlld01vZGVsO1xuXHRcdH1cblxuXHRcdGlmICghb3V0cHV0Vmlld01vZGVsKSB7XG5cdFx0XHQvLyBub3QgYWJsZSB0byBmaW5kIHRoZSBvdXRwdXQgZnJvbSB0aGUgcHJvdmlkZWQgY29udGV4dCwgdXNlIHRoZSBhY3RpdmUgY2VsbFxuXHRcdFx0Y29uc3QgYWN0aXZlQ2VsbCA9IG5vdGVib29rRWRpdG9yLmdldEFjdGl2ZUNlbGwoKTtcblx0XHRcdGlmICghYWN0aXZlQ2VsbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhY3RpdmVDZWxsLmZvY3VzZWRPdXRwdXRJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdG91dHB1dFZpZXdNb2RlbCA9IGFjdGl2ZUNlbGwub3V0cHV0c1ZpZXdNb2RlbHMuZmluZChvdXRwdXQgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBvdXRwdXQubW9kZWwub3V0cHV0SWQgPT09IGFjdGl2ZUNlbGwuZm9jdXNlZE91dHB1dElkO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG91dHB1dFZpZXdNb2RlbCA9IGFjdGl2ZUNlbGwub3V0cHV0c1ZpZXdNb2RlbHMuZmluZChvdXRwdXQgPT4gb3V0cHV0LnBpY2tlZE1pbWVUeXBlPy5pc1RydXN0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghb3V0cHV0Vmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWltZVR5cGUgPSBvdXRwdXRWaWV3TW9kZWwucGlja2VkTWltZVR5cGU/Lm1pbWVUeXBlO1xuXG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBhd2FpdCBjaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKTtcblx0XHRpZiAod2lkZ2V0ICYmIG1pbWVUeXBlICYmIE5PVEVCT09LX0NFTExfT1VUUFVUX01JTUVfVFlQRV9MSVNUX0ZPUl9DSEFUX0NPTlNULmluY2x1ZGVzKG1pbWVUeXBlKSkge1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IGNyZWF0ZU5vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeShvdXRwdXRWaWV3TW9kZWwsIG1pbWVUeXBlLCBub3RlYm9va0VkaXRvcik7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0d2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KGVudHJ5KTtcblx0XHRcdChhd2FpdCBjaGF0V2lkZ2V0U2VydmljZS5yZXZlYWxXaWRnZXQoKSk/LmZvY3VzSW5wdXQoKTtcblx0XHR9XG5cdH1cblxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihTZWxlY3RBbmRJbnNlcnRLZXJuZWxWYXJpYWJsZUFjdGlvbik7XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoTm90ZWJvb2tDaGF0Q29udHJpYnV0aW9uLklELCBOb3RlYm9va0NoYXRDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFFeEIsU0FBUyxhQUFhO0FBRXRCLFNBQTRCLDBCQUEwQztBQUV0RSxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxnQkFBNkIsMEJBQTBCO0FBRWhFLFNBQVMsMEJBQTBDO0FBQ25ELFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQWlGLCtCQUErQjtBQUNoSCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQiw4Q0FBOEMscUNBQXFDO0FBQ3ZILFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUNBQW1DLDBEQUEwRDtBQUN0RyxTQUFTLHVDQUE4RTtBQUN2RixZQUFZLFdBQVc7QUFDdkIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBdUMsaUNBQWlDO0FBQ3hFLE9BQU87QUFDUCxTQUFTLG1DQUFtQztBQUU1QyxNQUFNLDRCQUE0QjtBQUVsQyxJQUFNLDJCQUFOLGNBQXVDLFdBQTZDO0FBQUEs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
