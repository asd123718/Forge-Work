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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { InjectedTextCursorStops } from "../../../../editor/common/model.js";
import { Range } from "../../../../editor/common/core/range.js";
import { getWordAtText } from "../../../../editor/common/core/wordHelper.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { localize } from "../../../../nls.js";
import { AICustomizationManagementCommands, AICustomizationManagementSection } from "../../../../workbench/contrib/chat/browser/aiCustomization/aiCustomizationManagement.js";
import { IChatSubmitRequestHandlerService } from "../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js";
import { INewChatModelPickerService } from "./newChatModelPicker.js";
import { isAgentHostTarget } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { ISessionContext } from "../../../services/sessions/browser/sessionContext.js";
import { ICustomizationHarnessService } from "../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { IChatPetService } from "../../../../workbench/contrib/chat/browser/chatPetService.js";
const SESSIONS_EXECUTE_SLASH_COMMAND_ID = "sessions.chat.executeSlashCommand";
CommandsRegistry.registerCommand(SESSIONS_EXECUTE_SLASH_COMMAND_ID, (_, handler, slashCommandStr) => {
  handler.tryExecuteSlashCommand(slashCommandStr);
  handler.clearInput();
});
let SlashCommandHandler = class extends Disposable {
  constructor(_editor, commandService, languageFeaturesService, harnessService, newChatModelPickerService, sessionContext, chatPetService, submitRequestHandlerService) {
    super();
    this._editor = _editor;
    this.commandService = commandService;
    this.languageFeaturesService = languageFeaturesService;
    this.harnessService = harnessService;
    this.newChatModelPickerService = newChatModelPickerService;
    this.sessionContext = sessionContext;
    this.chatPetService = chatPetService;
    this.id = "sessions.slashCommands";
    this._slashCommands = [];
    this._cachedPromptCommands = [];
    this._promptCommandsRefreshGeneration = 0;
    this._commandDecorations = this._editor.createDecorationsCollection();
    this._placeholderDecorations = this._editor.createDecorationsCollection();
    this._registerSlashCommands();
    this._register(submitRequestHandlerService.register(this));
    this._registerCompletions();
    this._registerDecorations();
    this._register(autorun((reader) => {
      this._refreshPromptCommands(this.sessionContext.session.read(reader)?.resource);
    }));
    this._register(this.harnessService.onDidChangeSlashCommands((e) => {
      const sessionResource = this.sessionContext.session.get()?.resource;
      if (sessionResource && e.sessionType === getChatSessionType(sessionResource)) {
        this._refreshPromptCommands(sessionResource);
      }
    }));
  }
  clearInput() {
    this._editor.getModel()?.setValue("");
  }
  async tryHandle(request) {
    const currentSessionResource = this.sessionContext.session.get()?.resource;
    if (!currentSessionResource || !request.providerId || !request.sessionId || !isEqual(currentSessionResource, request.sessionResource)) {
      return false;
    }
    return this.tryExecuteSlashCommand(request.input);
  }
  _refreshPromptCommands(sessionResource) {
    const refreshGeneration = ++this._promptCommandsRefreshGeneration;
    if (!sessionResource) {
      this._cachedPromptCommands = [];
      this._updateDecorations();
      return;
    }
    this.harnessService.getSlashCommands(sessionResource, CancellationToken.None).then((commands) => {
      const currentSessionResource = this.sessionContext.session.get()?.resource;
      if (refreshGeneration !== this._promptCommandsRefreshGeneration || !currentSessionResource || !isEqual(currentSessionResource, sessionResource)) {
        return;
      }
      this._cachedPromptCommands = commands;
      this._updateDecorations();
    }, () => {
      const currentSessionResource = this.sessionContext.session.get()?.resource;
      if (refreshGeneration !== this._promptCommandsRefreshGeneration || !currentSessionResource || !isEqual(currentSessionResource, sessionResource)) {
        return;
      }
      this._cachedPromptCommands = [];
      this._updateDecorations();
    });
  }
  /**
   * Attempts to parse and execute a slash command from the input.
   * Returns `true` if a command was handled.
   */
  tryExecuteSlashCommand(query) {
    const match = query.match(/^\/([\w\p{L}\d_\-\.:]+)\s*(.*)/su);
    if (!match) {
      return false;
    }
    const commandName = match[1];
    const slashCommand = this._slashCommands.find((c) => c.command === commandName);
    if (!slashCommand) {
      return false;
    }
    slashCommand.execute(match[2]?.trim() ?? "");
    return true;
  }
  _registerSlashCommands() {
    const openSection = (section) => () => this.commandService.executeCommand(AICustomizationManagementCommands.OpenEditor, section);
    this._slashCommands.push({
      command: "vscode-pet",
      detail: localize("slashCommand.vscodePet", "Toggle an interactive VS Code pet (Experimental)"),
      sortText: "z3_vscodePet",
      executeImmediately: true,
      execute: () => this.chatPetService.toggle()
    });
    this._slashCommands.push({
      command: "agents",
      detail: localize("slashCommand.agents", "View and manage custom agents"),
      sortText: "z3_agents",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Agents)
    });
    this._slashCommands.push({
      command: "skills",
      detail: localize("slashCommand.skills", "View and manage skills"),
      sortText: "z3_skills",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Skills)
    });
    this._slashCommands.push({
      command: "instructions",
      detail: localize("slashCommand.instructions", "View and manage instructions"),
      sortText: "z3_instructions",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Instructions)
    });
    this._slashCommands.push({
      command: "hooks",
      detail: localize("slashCommand.hooks", "View and manage hooks"),
      sortText: "z3_hooks",
      executeImmediately: true,
      execute: openSection(AICustomizationManagementSection.Hooks)
    });
    this._slashCommands.push({
      command: "models",
      detail: localize("slashCommand.models", "Open the model picker"),
      sortText: "z3_models",
      executeImmediately: true,
      execute: () => this.newChatModelPickerService.openModelPicker()
    });
  }
  _registerDecorations() {
    this._register(this._editor.onDidChangeModelContent(() => this._updateDecorations()));
    this._register(autorun((reader) => {
      this.sessionContext.session.read(reader);
      this._updateDecorations();
    }));
    this._updateDecorations();
  }
  _updateDecorations() {
    const model = this._editor.getModel();
    const value = model?.getValue() ?? "";
    const match = value.match(/^\/([\w\p{L}\d_\-\.:]+)\s?/u);
    const activeSession = this.sessionContext.session.get();
    if (!match || activeSession && isAgentHostTarget(getChatSessionType(activeSession.resource))) {
      this._commandDecorations.clear();
      this._placeholderDecorations.clear();
      return;
    }
    const commandName = match[1];
    const slashCommand = this._slashCommands.find((c) => c.command === commandName);
    const promptCommand = this._cachedPromptCommands.find((c) => c.name === commandName);
    if (!slashCommand && !promptCommand) {
      this._commandDecorations.clear();
      this._placeholderDecorations.clear();
      return;
    }
    const commandEnd = match[0].trimEnd().length;
    this._commandDecorations.set([{
      range: new Range(1, 1, 1, commandEnd + 1),
      options: { description: "sessions-slash-command", inlineClassName: SlashCommandHandler._commandClassName }
    }]);
    const restOfInput = value.slice(match[0].length).trim();
    const detail = slashCommand?.detail ?? promptCommand?.argumentHint;
    if (!restOfInput && detail) {
      const placeholderCol = match[0].length + 1;
      this._placeholderDecorations.set([{
        range: new Range(1, placeholderCol, 1, model.getLineMaxColumn(1)),
        options: {
          description: "sessions-slash-placeholder",
          // The range is collapsed (nothing follows the command), so injected
          // text only renders with `showIfCollapsed`.
          showIfCollapsed: true,
          after: { content: detail, inlineClassName: SlashCommandHandler._placeholderClassName, cursorStops: InjectedTextCursorStops.None }
        }
      }]);
    } else {
      this._placeholderDecorations.clear();
    }
  }
  _registerCompletions() {
    const uri = this._editor.getModel()?.uri;
    if (!uri) {
      return;
    }
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
      _debugDisplayName: "sessionsSlashCommands",
      triggerCharacters: ["/"],
      provideCompletionItems: (model, position, _context, _token) => {
        const range = this._computeCompletionRanges(model, position, /\/\w*/g);
        if (!range) {
          return null;
        }
        const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
        if (textBefore.trim() !== "") {
          return null;
        }
        return {
          suggestions: this._slashCommands.map((c, i) => {
            const withSlash = `/${c.command}`;
            return {
              label: withSlash,
              insertText: c.executeImmediately ? "" : `${withSlash} `,
              detail: c.detail,
              range,
              sortText: c.sortText ?? "a".repeat(i + 1),
              kind: CompletionItemKind.Text,
              command: c.executeImmediately ? { id: SESSIONS_EXECUTE_SLASH_COMMAND_ID, title: withSlash, arguments: [this, withSlash] } : void 0
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: uri.scheme, hasAccessToAllModels: true }, {
      _debugDisplayName: "sessionsPromptSlashCommands",
      triggerCharacters: ["/"],
      provideCompletionItems: async (model, position, _context, token) => {
        const activeSession = this.sessionContext.session.get();
        if (!activeSession) {
          return null;
        }
        if (isAgentHostTarget(getChatSessionType(activeSession.resource))) {
          return null;
        }
        const range = this._computeCompletionRanges(model, position, /\/[\p{L}0-9_.:-]*/gu);
        if (!range) {
          return null;
        }
        const textBefore = model.getValueInRange(new Range(1, 1, range.replace.startLineNumber, range.replace.startColumn));
        if (textBefore.trim() !== "") {
          return null;
        }
        const promptCommands = await this.harnessService.getSlashCommands(activeSession?.resource, token);
        const userInvocable = promptCommands.filter((c) => c.userInvocable);
        if (userInvocable.length === 0) {
          return null;
        }
        return {
          suggestions: userInvocable.map((c, i) => {
            const label = `/${c.name}`;
            return {
              label: { label, description: c.description },
              insertText: `${label} `,
              documentation: c.description,
              range,
              sortText: "b".repeat(i + 1),
              kind: CompletionItemKind.Text
            };
          })
        };
      }
    }));
  }
  _computeCompletionRanges(model, position, reg) {
    const varWord = getWordAtText(position.column, reg, model.getLineContent(position.lineNumber), 0);
    if (!varWord && model.getWordUntilPosition(position).word) {
      return;
    }
    if (!varWord && position.column > 1) {
      const textBefore = model.getValueInRange(new Range(position.lineNumber, position.column - 1, position.lineNumber, position.column));
      if (textBefore !== " ") {
        return;
      }
    }
    let insert;
    let replace;
    if (!varWord) {
      insert = replace = Range.fromPositions(position);
    } else {
      insert = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, position.column);
      replace = new Range(position.lineNumber, varWord.startColumn, position.lineNumber, varWord.endColumn);
    }
    return { insert, replace };
  }
};
SlashCommandHandler._commandClassName = "sessions-slash-command";
SlashCommandHandler._placeholderClassName = "sessions-slash-placeholder";
SlashCommandHandler = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, ICustomizationHarnessService),
  __decorateParam(4, INewChatModelPickerService),
  __decorateParam(5, ISessionContext),
  __decorateParam(6, IChatPetService),
  __decorateParam(7, IChatSubmitRequestHandlerService)
], SlashCommandHandler);
export {
  SESSIONS_EXECUTE_SLASH_COMMAND_ID,
  SlashCommandHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcYnJvd3Nlclxcc2xhc2hDb21tYW5kcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIEluamVjdGVkVGV4dEN1cnNvclN0b3BzLCBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgZ2V0V29yZEF0VGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudENvbW1hbmRzLCBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSwgdHlwZSBJQ2hhdFN1Ym1pdFJlcXVlc3QsIHR5cGUgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2UgfSBmcm9tICcuL25ld0NoYXRNb2RlbFBpY2tlci5qcyc7XG5pbXBvcnQgeyBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25Db250ZXh0LmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRQZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRQZXRTZXJ2aWNlLmpzJztcbi8qKlxuICogU3RhdGljIGNvbW1hbmQgSUQgdXNlZCBieSBjb21wbGV0aW9uIGl0ZW1zIHRvIHRyaWdnZXIgaW1tZWRpYXRlIHNsYXNoIGNvbW1hbmQgZXhlY3V0aW9uLFxuICogbWlycm9yaW5nIHRoZSBwYXR0ZXJuIG9mIGNvcmUncyBgQ2hhdFN1Ym1pdEFjdGlvbmAgZm9yIGBleGVjdXRlSW1tZWRpYXRlbHlgIGNvbW1hbmRzLlxuICovXG5leHBvcnQgY29uc3QgU0VTU0lPTlNfRVhFQ1VURV9TTEFTSF9DT01NQU5EX0lEID0gJ3Nlc3Npb25zLmNoYXQuZXhlY3V0ZVNsYXNoQ29tbWFuZCc7XG5cbkNvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKFNFU1NJT05TX0VYRUNVVEVfU0xBU0hfQ09NTUFORF9JRCwgKF8sIGhhbmRsZXI6IFNsYXNoQ29tbWFuZEhhbmRsZXIsIHNsYXNoQ29tbWFuZFN0cjogc3RyaW5nKSA9PiB7XG5cdGhhbmRsZXIudHJ5RXhlY3V0ZVNsYXNoQ29tbWFuZChzbGFzaENvbW1hbmRTdHIpO1xuXHRoYW5kbGVyLmNsZWFySW5wdXQoKTtcbn0pO1xuXG4vKipcbiAqIE1pbmltYWwgc2xhc2ggY29tbWFuZCBkZXNjcmlwdG9yIGZvciB0aGUgc2Vzc2lvbnMgbmV3LWNoYXQgd2lkZ2V0LlxuICogU2VsZi1jb250YWluZWQgY29weSBvZiB0aGUgZXNzZW50aWFsIGZpZWxkcyBmcm9tIGNvcmUncyBgSUNoYXRTbGFzaERhdGFgXG4gKiB0byBhdm9pZCBhIGRpcmVjdCBkZXBlbmRlbmN5IG9uIHRoZSB3b3JrYmVuY2ggY2hhdCBzbGFzaCBjb21tYW5kIHNlcnZpY2UuXG4gKi9cbmludGVyZmFjZSBJU2Vzc2lvbnNTbGFzaENvbW1hbmREYXRhIHtcblx0cmVhZG9ubHkgY29tbWFuZDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWw6IHN0cmluZztcblx0cmVhZG9ubHkgc29ydFRleHQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4ZWN1dGVJbW1lZGlhdGVseT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGV4ZWN1dGU6IChhcmdzOiBzdHJpbmcpID0+IHZvaWQ7XG59XG5cblxuLyoqXG4gKiBNYW5hZ2VzIHNsYXNoIGNvbW1hbmRzIGZvciB0aGUgc2Vzc2lvbnMgbmV3LWNoYXQgaW5wdXQgd2lkZ2V0IFx1MjAxNCByZWdpc3RyYXRpb24sXG4gKiBhdXRvY29tcGxldGlvbiwgZGVjb3JhdGlvbnMgKHN5bnRheCBoaWdobGlnaHRpbmcgKyBwbGFjZWhvbGRlciB0ZXh0KSwgYW5kIGV4ZWN1dGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIFNsYXNoQ29tbWFuZEhhbmRsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2NvbW1hbmRDbGFzc05hbWUgPSAnc2Vzc2lvbnMtc2xhc2gtY29tbWFuZCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9wbGFjZWhvbGRlckNsYXNzTmFtZSA9ICdzZXNzaW9ucy1zbGFzaC1wbGFjZWhvbGRlcic7XG5cdHJlYWRvbmx5IGlkID0gJ3Nlc3Npb25zLnNsYXNoQ29tbWFuZHMnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NsYXNoQ29tbWFuZHM6IElTZXNzaW9uc1NsYXNoQ29tbWFuZERhdGFbXSA9IFtdO1xuXHRwcml2YXRlIF9jYWNoZWRQcm9tcHRDb21tYW5kczogcmVhZG9ubHkgSUNoYXRQcm9tcHRTbGFzaENvbW1hbmRbXSA9IFtdO1xuXHRwcml2YXRlIF9wcm9tcHRDb21tYW5kc1JlZnJlc2hHZW5lcmF0aW9uID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kRGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnM6IElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElOZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZTogSU5ld0NoYXRNb2RlbFBpY2tlclNlcnZpY2UsXG5cdFx0QElTZXNzaW9uQ29udGV4dCBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25Db250ZXh0OiBJU2Vzc2lvbkNvbnRleHQsXG5cdFx0QElDaGF0UGV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRQZXRTZXJ2aWNlOiBJQ2hhdFBldFNlcnZpY2UsXG5cdFx0QElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlIHN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZTogSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29tbWFuZERlY29yYXRpb25zID0gdGhpcy5fZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJTbGFzaENvbW1hbmRzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoc3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLnJlZ2lzdGVyKHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlckNvbXBsZXRpb25zKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJEZWNvcmF0aW9ucygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fcmVmcmVzaFByb21wdENvbW1hbmRzKHRoaXMuc2Vzc2lvbkNvbnRleHQuc2Vzc2lvbi5yZWFkKHJlYWRlcik/LnJlc291cmNlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhhcm5lc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygoZSkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpPy5yZXNvdXJjZTtcblx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UgJiYgZS5zZXNzaW9uVHlwZSA9PT0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5fcmVmcmVzaFByb21wdENvbW1hbmRzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Y2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKT8uc2V0VmFsdWUoJycpO1xuXHR9XG5cblx0YXN5bmMgdHJ5SGFuZGxlKHJlcXVlc3Q6IElDaGF0U3VibWl0UmVxdWVzdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLnNlc3Npb25Db250ZXh0LnNlc3Npb24uZ2V0KCk/LnJlc291cmNlO1xuXHRcdGlmICghY3VycmVudFNlc3Npb25SZXNvdXJjZSB8fCAhcmVxdWVzdC5wcm92aWRlcklkIHx8ICFyZXF1ZXN0LnNlc3Npb25JZCB8fCAhaXNFcXVhbChjdXJyZW50U2Vzc2lvblJlc291cmNlLCByZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudHJ5RXhlY3V0ZVNsYXNoQ29tbWFuZChyZXF1ZXN0LmlucHV0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZnJlc2hQcm9tcHRDb21tYW5kcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZnJlc2hHZW5lcmF0aW9uID0gKyt0aGlzLl9wcm9tcHRDb21tYW5kc1JlZnJlc2hHZW5lcmF0aW9uO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRQcm9tcHRDb21tYW5kcyA9IFtdO1xuXHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5oYXJuZXNzU2VydmljZS5nZXRTbGFzaENvbW1hbmRzKHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkudGhlbihjb21tYW5kcyA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblJlc291cmNlID0gdGhpcy5zZXNzaW9uQ29udGV4dC5zZXNzaW9uLmdldCgpPy5yZXNvdXJjZTtcblx0XHRcdGlmIChyZWZyZXNoR2VuZXJhdGlvbiAhPT0gdGhpcy5fcHJvbXB0Q29tbWFuZHNSZWZyZXNoR2VuZXJhdGlvbiB8fCAhY3VycmVudFNlc3Npb25SZXNvdXJjZSB8fCAhaXNFcXVhbChjdXJyZW50U2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NhY2hlZFByb21wdENvbW1hbmRzID0gY29tbWFuZHM7XG5cdFx0XHR0aGlzLl91cGRhdGVEZWNvcmF0aW9ucygpO1xuXHRcdH0sICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLnNlc3Npb25Db250ZXh0LnNlc3Npb24uZ2V0KCk/LnJlc291cmNlO1xuXHRcdFx0aWYgKHJlZnJlc2hHZW5lcmF0aW9uICE9PSB0aGlzLl9wcm9tcHRDb21tYW5kc1JlZnJlc2hHZW5lcmF0aW9uIHx8ICFjdXJyZW50U2Vzc2lvblJlc291cmNlIHx8ICFpc0VxdWFsKGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY2FjaGVkUHJvbXB0Q29tbWFuZHMgPSBbXTtcblx0XHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQXR0ZW1wdHMgdG8gcGFyc2UgYW5kIGV4ZWN1dGUgYSBzbGFzaCBjb21tYW5kIGZyb20gdGhlIGlucHV0LlxuXHQgKiBSZXR1cm5zIGB0cnVlYCBpZiBhIGNvbW1hbmQgd2FzIGhhbmRsZWQuXG5cdCAqL1xuXHR0cnlFeGVjdXRlU2xhc2hDb21tYW5kKHF1ZXJ5OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBtYXRjaCA9IHF1ZXJ5Lm1hdGNoKC9eXFwvKFtcXHdcXHB7TH1cXGRfXFwtXFwuOl0rKVxccyooLiopL3N1KTtcblx0XHRpZiAoIW1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29tbWFuZE5hbWUgPSBtYXRjaFsxXTtcblx0XHRjb25zdCBzbGFzaENvbW1hbmQgPSB0aGlzLl9zbGFzaENvbW1hbmRzLmZpbmQoYyA9PiBjLmNvbW1hbmQgPT09IGNvbW1hbmROYW1lKTtcblx0XHRpZiAoIXNsYXNoQ29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHNsYXNoQ29tbWFuZC5leGVjdXRlKG1hdGNoWzJdPy50cmltKCkgPz8gJycpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJTbGFzaENvbW1hbmRzKCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wZW5TZWN0aW9uID0gKHNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uKSA9PlxuXHRcdFx0KCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50Q29tbWFuZHMuT3BlbkVkaXRvciwgc2VjdGlvbik7XG5cblx0XHR0aGlzLl9zbGFzaENvbW1hbmRzLnB1c2goe1xuXHRcdFx0Y29tbWFuZDogJ3ZzY29kZS1wZXQnLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnc2xhc2hDb21tYW5kLnZzY29kZVBldCcsIFwiVG9nZ2xlIGFuIGludGVyYWN0aXZlIFZTIENvZGUgcGV0IChFeHBlcmltZW50YWwpXCIpLFxuXHRcdFx0c29ydFRleHQ6ICd6M192c2NvZGVQZXQnLFxuXHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0ZXhlY3V0ZTogKCkgPT4gdGhpcy5jaGF0UGV0U2VydmljZS50b2dnbGUoKSxcblx0XHR9KTtcblx0XHR0aGlzLl9zbGFzaENvbW1hbmRzLnB1c2goe1xuXHRcdFx0Y29tbWFuZDogJ2FnZW50cycsXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdzbGFzaENvbW1hbmQuYWdlbnRzJywgXCJWaWV3IGFuZCBtYW5hZ2UgY3VzdG9tIGFnZW50c1wiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfYWdlbnRzJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdGV4ZWN1dGU6IG9wZW5TZWN0aW9uKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyksXG5cdFx0fSk7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kcy5wdXNoKHtcblx0XHRcdGNvbW1hbmQ6ICdza2lsbHMnLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnc2xhc2hDb21tYW5kLnNraWxscycsIFwiVmlldyBhbmQgbWFuYWdlIHNraWxsc1wiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfc2tpbGxzJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdGV4ZWN1dGU6IG9wZW5TZWN0aW9uKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyksXG5cdFx0fSk7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kcy5wdXNoKHtcblx0XHRcdGNvbW1hbmQ6ICdpbnN0cnVjdGlvbnMnLFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnc2xhc2hDb21tYW5kLmluc3RydWN0aW9ucycsIFwiVmlldyBhbmQgbWFuYWdlIGluc3RydWN0aW9uc1wiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdGV4ZWN1dGU6IG9wZW5TZWN0aW9uKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucyksXG5cdFx0fSk7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kcy5wdXNoKHtcblx0XHRcdGNvbW1hbmQ6ICdob29rcycsXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdzbGFzaENvbW1hbmQuaG9va3MnLCBcIlZpZXcgYW5kIG1hbmFnZSBob29rc1wiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfaG9va3MnLFxuXHRcdFx0ZXhlY3V0ZUltbWVkaWF0ZWx5OiB0cnVlLFxuXHRcdFx0ZXhlY3V0ZTogb3BlblNlY3Rpb24oQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3MpLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3NsYXNoQ29tbWFuZHMucHVzaCh7XG5cdFx0XHRjb21tYW5kOiAnbW9kZWxzJyxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3NsYXNoQ29tbWFuZC5tb2RlbHMnLCBcIk9wZW4gdGhlIG1vZGVsIHBpY2tlclwiKSxcblx0XHRcdHNvcnRUZXh0OiAnejNfbW9kZWxzJyxcblx0XHRcdGV4ZWN1dGVJbW1lZGlhdGVseTogdHJ1ZSxcblx0XHRcdGV4ZWN1dGU6ICgpID0+IHRoaXMubmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZS5vcGVuTW9kZWxQaWNrZXIoKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHRoaXMuX3VwZGF0ZURlY29yYXRpb25zKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLnNlc3Npb25Db250ZXh0LnNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZURlY29yYXRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Y29uc3QgdmFsdWUgPSBtb2RlbD8uZ2V0VmFsdWUoKSA/PyAnJztcblx0XHRjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9eXFwvKFtcXHdcXHB7TH1cXGRfXFwtXFwuOl0rKVxccz8vdSk7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbkNvbnRleHQuc2Vzc2lvbi5nZXQoKTtcblxuXHRcdC8vIEFnZW50LWhvc3Qgc2Vzc2lvbnMgc2hvdWxkIG5vdCBnZXQgZGVjb3JhdGlvbnMgYXMgdGhpcyBjbGFzcyBpcyBvbmx5IGZvciB1c2Ugd2l0aCBMb2NhbCBBZ2VudCBIYXJuZXNzIGFuZCBDb3BpbG90IENoYXQgRXh0ZW5zaW9uLlxuXHRcdGlmICghbWF0Y2ggfHwgKGFjdGl2ZVNlc3Npb24gJiYgaXNBZ2VudEhvc3RUYXJnZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpKSkpIHtcblx0XHRcdHRoaXMuX2NvbW1hbmREZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJEZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmROYW1lID0gbWF0Y2hbMV07XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kID0gdGhpcy5fc2xhc2hDb21tYW5kcy5maW5kKGMgPT4gYy5jb21tYW5kID09PSBjb21tYW5kTmFtZSk7XG5cdFx0Y29uc3QgcHJvbXB0Q29tbWFuZCA9IHRoaXMuX2NhY2hlZFByb21wdENvbW1hbmRzLmZpbmQoYyA9PiBjLm5hbWUgPT09IGNvbW1hbmROYW1lKTtcblx0XHRpZiAoIXNsYXNoQ29tbWFuZCAmJiAhcHJvbXB0Q29tbWFuZCkge1xuXHRcdFx0dGhpcy5fY29tbWFuZERlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zLmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gSGlnaGxpZ2h0IHRoZSBzbGFzaCBjb21tYW5kIHRleHRcblx0XHRjb25zdCBjb21tYW5kRW5kID0gbWF0Y2hbMF0udHJpbUVuZCgpLmxlbmd0aDtcblx0XHR0aGlzLl9jb21tYW5kRGVjb3JhdGlvbnMuc2V0KFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIGNvbW1hbmRFbmQgKyAxKSxcblx0XHRcdG9wdGlvbnM6IHsgZGVzY3JpcHRpb246ICdzZXNzaW9ucy1zbGFzaC1jb21tYW5kJywgaW5saW5lQ2xhc3NOYW1lOiBTbGFzaENvbW1hbmRIYW5kbGVyLl9jb21tYW5kQ2xhc3NOYW1lIH0sXG5cdFx0fV0pO1xuXG5cdFx0Ly8gU2hvdyB0aGUgY29tbWFuZCBkZXNjcmlwdGlvbiBhcyBhIHBsYWNlaG9sZGVyIGFmdGVyIHRoZSBjb21tYW5kXG5cdFx0Y29uc3QgcmVzdE9mSW5wdXQgPSB2YWx1ZS5zbGljZShtYXRjaFswXS5sZW5ndGgpLnRyaW0oKTtcblx0XHRjb25zdCBkZXRhaWwgPSBzbGFzaENvbW1hbmQ/LmRldGFpbCA/PyBwcm9tcHRDb21tYW5kPy5hcmd1bWVudEhpbnQ7XG5cdFx0aWYgKCFyZXN0T2ZJbnB1dCAmJiBkZXRhaWwpIHtcblx0XHRcdGNvbnN0IHBsYWNlaG9sZGVyQ29sID0gbWF0Y2hbMF0ubGVuZ3RoICsgMTtcblx0XHRcdHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMuc2V0KFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgcGxhY2Vob2xkZXJDb2wsIDEsIG1vZGVsIS5nZXRMaW5lTWF4Q29sdW1uKDEpKSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnc2Vzc2lvbnMtc2xhc2gtcGxhY2Vob2xkZXInLFxuXHRcdFx0XHRcdC8vIFRoZSByYW5nZSBpcyBjb2xsYXBzZWQgKG5vdGhpbmcgZm9sbG93cyB0aGUgY29tbWFuZCksIHNvIGluamVjdGVkXG5cdFx0XHRcdFx0Ly8gdGV4dCBvbmx5IHJlbmRlcnMgd2l0aCBgc2hvd0lmQ29sbGFwc2VkYC5cblx0XHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdFx0YWZ0ZXI6IHsgY29udGVudDogZGV0YWlsLCBpbmxpbmVDbGFzc05hbWU6IFNsYXNoQ29tbWFuZEhhbmRsZXIuX3BsYWNlaG9sZGVyQ2xhc3NOYW1lLCBjdXJzb3JTdG9wczogSW5qZWN0ZWRUZXh0Q3Vyc29yU3RvcHMuTm9uZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSBzYXRpc2ZpZXMgSU1vZGVsRGVsdGFEZWNvcmF0aW9uXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckNvbXBsZXRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy51cmk7XG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogdXJpLnNjaGVtZSwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdzZXNzaW9uc1NsYXNoQ29tbWFuZHMnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnLyddLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuX2NvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgL1xcL1xcdyovZyk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE9ubHkgYWxsb3cgc2xhc2ggY29tbWFuZHMgYXQgdGhlIHN0YXJ0IG9mIGlucHV0XG5cdFx0XHRcdGNvbnN0IHRleHRCZWZvcmUgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIHJhbmdlLnJlcGxhY2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5yZXBsYWNlLnN0YXJ0Q29sdW1uKSk7XG5cdFx0XHRcdGlmICh0ZXh0QmVmb3JlLnRyaW0oKSAhPT0gJycpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IHRoaXMuX3NsYXNoQ29tbWFuZHMubWFwKChjLCBpKTogQ29tcGxldGlvbkl0ZW0gPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qgd2l0aFNsYXNoID0gYC8ke2MuY29tbWFuZH1gO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHdpdGhTbGFzaCxcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogYy5leGVjdXRlSW1tZWRpYXRlbHkgPyAnJyA6IGAke3dpdGhTbGFzaH0gYCxcblx0XHRcdFx0XHRcdFx0ZGV0YWlsOiBjLmRldGFpbCxcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiBjLnNvcnRUZXh0ID8/ICdhJy5yZXBlYXQoaSArIDEpLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogYy5leGVjdXRlSW1tZWRpYXRlbHkgPyB7IGlkOiBTRVNTSU9OU19FWEVDVVRFX1NMQVNIX0NPTU1BTkRfSUQsIHRpdGxlOiB3aXRoU2xhc2gsIGFyZ3VtZW50czogW3RoaXMsIHdpdGhTbGFzaF0gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBEeW5hbWljIGNvbXBsZXRpb25zIGZvciBpbmRpdmlkdWFsIHByb21wdC9za2lsbCBmaWxlcyAoZmlsdGVyZWQgdG8gbWF0Y2hcblx0XHQvLyB3aGF0IHRoZSBzZXNzaW9ucyBjdXN0b21pemF0aW9ucyB2aWV3IHNob3dzKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogdXJpLnNjaGVtZSwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdzZXNzaW9uc1Byb21wdFNsYXNoQ29tbWFuZHMnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnLyddLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25Db250ZXh0LnNlc3Npb24uZ2V0KCk7XG5cdFx0XHRcdGlmICghYWN0aXZlU2Vzc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc0FnZW50SG9zdFRhcmdldChnZXRDaGF0U2Vzc2lvblR5cGUoYWN0aXZlU2Vzc2lvbi5yZXNvdXJjZSkpKSB7XG5cdFx0XHRcdFx0Ly8gQWdlbnQtaG9zdCBzZXNzaW9ucyBkZWxlZ2F0ZSBjb21wbGV0aW9ucyB0byB0aGUgaG9zdFxuXHRcdFx0XHRcdC8vIHByb2Nlc3MgdmlhIGBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zYC5cblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9jb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIC9cXC9bXFxwe0x9MC05Xy46LV0qL2d1KTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGV4dEJlZm9yZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgcmFuZ2UucmVwbGFjZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4pKTtcblx0XHRcdFx0aWYgKHRleHRCZWZvcmUudHJpbSgpICE9PSAnJykge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcHJvbXB0Q29tbWFuZHMgPSBhd2FpdCB0aGlzLmhhcm5lc3NTZXJ2aWNlLmdldFNsYXNoQ29tbWFuZHMoYWN0aXZlU2Vzc2lvbj8ucmVzb3VyY2UsIHRva2VuKTtcblx0XHRcdFx0Y29uc3QgdXNlckludm9jYWJsZSA9IHByb21wdENvbW1hbmRzLmZpbHRlcihjID0+IGMudXNlckludm9jYWJsZSk7XG5cdFx0XHRcdGlmICh1c2VySW52b2NhYmxlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogdXNlckludm9jYWJsZS5tYXAoKGMsIGkpOiBDb21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGAvJHtjLm5hbWV9YDtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsLCBkZXNjcmlwdGlvbjogYy5kZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBgJHtsYWJlbH0gYCxcblx0XHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYy5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiAnYicucmVwZWF0KGkgKyAxKSxcblx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgcmVnOiBSZWdFeHApOiB7IGluc2VydDogUmFuZ2U7IHJlcGxhY2U6IFJhbmdlIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhcldvcmQgPSBnZXRXb3JkQXRUZXh0KHBvc2l0aW9uLmNvbHVtbiwgcmVnLCBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKSwgMCk7XG5cdFx0aWYgKCF2YXJXb3JkICYmIG1vZGVsLmdldFdvcmRVbnRpbFBvc2l0aW9uKHBvc2l0aW9uKS53b3JkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF2YXJXb3JkICYmIHBvc2l0aW9uLmNvbHVtbiA+IDEpIHtcblx0XHRcdGNvbnN0IHRleHRCZWZvcmUgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiAtIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikpO1xuXHRcdFx0aWYgKHRleHRCZWZvcmUgIT09ICcgJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IGluc2VydDogUmFuZ2U7XG5cdFx0bGV0IHJlcGxhY2U6IFJhbmdlO1xuXHRcdGlmICghdmFyV29yZCkge1xuXHRcdFx0aW5zZXJ0ID0gcmVwbGFjZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnNlcnQgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHRcdHJlcGxhY2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5zdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgdmFyV29yZC5lbmRDb2x1bW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGluc2VydCwgcmVwbGFjZSB9O1xuXHR9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
