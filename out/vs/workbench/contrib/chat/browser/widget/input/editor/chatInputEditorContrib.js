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
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { Disposable, MutableDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../../../base/common/observable.js";
import { themeColorFromId } from "../../../../../../../base/common/themables.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { MouseTargetType } from "../../../../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../../../../editor/browser/services/codeEditorService.js";
import { EditorOption } from "../../../../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { TrackedRangeStickiness } from "../../../../../../../editor/common/model.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { getInputPlaceholderColor, getRangeForPlaceholder } from "./chatInputPlaceholderDecoration.js";
import { IChatAgentService } from "../../../../common/participants/chatAgents.js";
import { localize } from "../../../../../../../nls.js";
import { chatSlashCommandBackground, chatSlashCommandForeground } from "../../../../common/widget/chatColors.js";
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatAgentLeader, chatSubcommandLeader } from "../../../../common/requestParser/chatParserTypes.js";
import { agentReg, slashReg, variableReg } from "../../../../common/requestParser/chatRequestParser.js";
import { ChatWidget } from "../../chatWidget.js";
import { dynamicVariableDecorationType } from "../../../attachments/chatDynamicVariables.js";
import { NativeEditContextRegistry } from "../../../../../../../editor/browser/controller/editContext/native/nativeEditContextRegistry.js";
import { TextAreaEditContextRegistry } from "../../../../../../../editor/browser/controller/editContext/textArea/textAreaEditContextRegistry.js";
import { ThrottledDelayer } from "../../../../../../../base/common/async.js";
import { isCancellationError } from "../../../../../../../base/common/errors.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { ICustomizationHarnessService } from "../../../../common/customizationHarnessService.js";
const decorationDescription = "chat";
const placeholderDecorationType = "chat-session-detail";
const slashCommandTextDecorationType = "chat-session-text";
const clickableSlashPromptTextDecorationType = "chat-session-clickable-text";
const variableTextDecorationType = "chat-variable-text";
function agentAndCommandToKey(agent, subcommand) {
  return subcommand ? `${agent.id}__${subcommand}` : agent.id;
}
function isWhitespaceOrPromptPart(p) {
  return p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestSlashPromptPart;
}
function exactlyOneSpaceAfterPart(parsedRequest, part) {
  const partIdx = parsedRequest.indexOf(part);
  if (parsedRequest.length > partIdx + 2) {
    return false;
  }
  const nextPart = parsedRequest[partIdx + 1];
  return nextPart && nextPart instanceof ChatRequestTextPart && nextPart.text === " ";
}
let InputEditorDecorations = class extends Disposable {
  constructor(widget, codeEditorService, themeService, chatAgentService, labelService, customizationHarnessService, editorService) {
    super();
    this.widget = widget;
    this.codeEditorService = codeEditorService;
    this.themeService = themeService;
    this.chatAgentService = chatAgentService;
    this.labelService = labelService;
    this.customizationHarnessService = customizationHarnessService;
    this.editorService = editorService;
    this.id = "inputEditorDecorations";
    this.previouslyUsedAgents = /* @__PURE__ */ new Set();
    this.viewModelDisposables = this._register(new MutableDisposable());
    this.updateThrottle = this._register(new ThrottledDelayer(InputEditorDecorations.UPDATE_DELAY));
    this.registeredDecorationTypes();
    this.triggerInputEditorDecorationsUpdate();
    this._register(this.widget.inputEditor.onDidChangeModelContent(() => this.triggerInputEditorDecorationsUpdate()));
    this._register(this.widget.inputEditor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.placeholder)) {
        this.triggerInputEditorDecorationsUpdate();
      }
    }));
    this._register(this.widget.onDidChangeParsedInput(() => this.triggerInputEditorDecorationsUpdate()));
    this._register(this.widget.onDidChangeViewModel(() => {
      this.registerViewModelListeners();
      this.previouslyUsedAgents.clear();
      this.triggerInputEditorDecorationsUpdate();
    }));
    this._register(this.widget.onDidSubmitAgent((e) => {
      this.previouslyUsedAgents.add(agentAndCommandToKey(e.agent, e.slashCommand?.name));
    }));
    this._register(this.widget.inputEditor.onMouseDown((e) => {
      this.mouseDownPromptSlashCommand = void 0;
      if (!e.event.leftButton || e.target.type !== MouseTargetType.CONTENT_TEXT || !e.target.position) {
        return;
      }
      const clickablePromptSlashCommand = this.clickablePromptSlashCommand;
      if (!clickablePromptSlashCommand || !clickablePromptSlashCommand.range.containsPosition(e.target.position)) {
        return;
      }
      this.mouseDownPromptSlashCommand = {
        position: Position.lift(e.target.position),
        uri: clickablePromptSlashCommand.uri,
        range: clickablePromptSlashCommand.range
      };
    }));
    this._register(this.widget.inputEditor.onMouseUp((e) => {
      const mouseDownPromptSlashCommand = this.mouseDownPromptSlashCommand;
      this.mouseDownPromptSlashCommand = void 0;
      if (!mouseDownPromptSlashCommand || e.target.type !== MouseTargetType.CONTENT_TEXT || !e.target.position) {
        return;
      }
      if (!mouseDownPromptSlashCommand.range.containsPosition(e.target.position) || !Position.equals(mouseDownPromptSlashCommand.position, e.target.position)) {
        return;
      }
      void this.editorService.openEditor({ resource: mouseDownPromptSlashCommand.uri });
    }));
    this._register(this.chatAgentService.onDidChangeAgents(() => this.triggerInputEditorDecorationsUpdate()));
    this._register(this.customizationHarnessService.onDidChangeSlashCommands((e) => {
      const sessionResource = this.widget.viewModel?.sessionResource;
      if (sessionResource && e.sessionType === getChatSessionType(sessionResource)) {
        this.triggerInputEditorDecorationsUpdate();
      }
    }));
    this._register(autorun((reader) => {
      const currentMode = this.widget.input.currentModeObs.read(reader);
      if (currentMode) {
        currentMode.description.read(reader);
      }
      this.triggerInputEditorDecorationsUpdate();
    }));
    this.registerViewModelListeners();
  }
  registerViewModelListeners() {
    this.viewModelDisposables.value = this.widget.viewModel?.onDidChange((e) => {
      if (e?.kind === "changePlaceholder" || e?.kind === "initialize") {
        this.triggerInputEditorDecorationsUpdate();
      }
    });
  }
  registeredDecorationTypes() {
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, placeholderDecorationType, {}));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, slashCommandTextDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px"
    }));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, clickableSlashPromptTextDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px",
      cursor: "pointer"
    }));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, variableTextDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px"
    }));
    this._register(this.codeEditorService.registerDecorationType(decorationDescription, dynamicVariableDecorationType, {
      color: themeColorFromId(chatSlashCommandForeground),
      backgroundColor: themeColorFromId(chatSlashCommandBackground),
      borderRadius: "3px",
      rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }));
  }
  getPlaceholderColor() {
    return getInputPlaceholderColor(this.themeService);
  }
  triggerInputEditorDecorationsUpdate() {
    this.updateInputPlaceholderDecoration();
    this.updateThrottle.trigger((token) => this.updateAsyncInputEditorDecorations(token)).catch((err) => {
      if (!isCancellationError(err)) {
        throw err;
      }
    });
  }
  updateInputPlaceholderDecoration() {
    const inputValue = this.widget.inputEditor.getValue();
    const viewModel = this.widget.viewModel;
    if (!viewModel) {
      this.updateAriaPlaceholder(void 0);
      if (inputValue) {
        this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, []);
      }
      return;
    }
    if (!inputValue) {
      if (this.widget.inputEditor.getOption(EditorOption.placeholder)) {
        this.updateAriaPlaceholder(void 0);
        this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, []);
        return;
      }
      const mode = this.widget.input.currentModeObs.get();
      const placeholder = mode.argumentHint?.get() ?? mode.description.get() ?? "";
      const displayPlaceholder = viewModel.inputPlaceholder || placeholder;
      const decoration = [
        {
          range: {
            startLineNumber: 1,
            endLineNumber: 1,
            startColumn: 1,
            endColumn: 1e3
          },
          renderOptions: {
            after: {
              contentText: displayPlaceholder,
              color: this.getPlaceholderColor()
            }
          }
        }
      ];
      this.updateAriaPlaceholder(displayPlaceholder || void 0);
      this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, decoration);
      return;
    }
    this.updateAriaPlaceholder(void 0);
    const parsedRequest = this.widget.parsedInput.parts;
    let placeholderDecoration;
    const agentPart = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
    const agentSubcommandPart = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart);
    const onlyAgentAndWhitespace = agentPart && parsedRequest.every((p) => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart);
    if (onlyAgentAndWhitespace) {
      const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, void 0));
      const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentPart.agent.metadata.followupPlaceholder;
      if (agentPart.agent.description && exactlyOneSpaceAfterPart(parsedRequest, agentPart)) {
        placeholderDecoration = [{
          range: getRangeForPlaceholder(agentPart.editorRange),
          renderOptions: {
            after: {
              contentText: shouldRenderFollowupPlaceholder ? agentPart.agent.metadata.followupPlaceholder : agentPart.agent.description,
              color: this.getPlaceholderColor()
            }
          }
        }];
      }
    }
    const onlyAgentAndAgentCommandAndWhitespace = agentPart && agentSubcommandPart && parsedRequest.every((p) => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentPart || p instanceof ChatRequestAgentSubcommandPart);
    if (onlyAgentAndAgentCommandAndWhitespace) {
      const isFollowupSlashCommand = this.previouslyUsedAgents.has(agentAndCommandToKey(agentPart.agent, agentSubcommandPart.command.name));
      const shouldRenderFollowupPlaceholder = isFollowupSlashCommand && agentSubcommandPart.command.followupPlaceholder;
      if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(parsedRequest, agentSubcommandPart)) {
        placeholderDecoration = [{
          range: getRangeForPlaceholder(agentSubcommandPart.editorRange),
          renderOptions: {
            after: {
              contentText: shouldRenderFollowupPlaceholder ? agentSubcommandPart.command.followupPlaceholder : agentSubcommandPart.command.description,
              color: this.getPlaceholderColor()
            }
          }
        }];
      }
    }
    const onlyAgentCommandAndWhitespace = agentSubcommandPart && parsedRequest.every((p) => p instanceof ChatRequestTextPart && !p.text.trim().length || p instanceof ChatRequestAgentSubcommandPart);
    if (onlyAgentCommandAndWhitespace) {
      if (agentSubcommandPart?.command.description && exactlyOneSpaceAfterPart(parsedRequest, agentSubcommandPart)) {
        placeholderDecoration = [{
          range: getRangeForPlaceholder(agentSubcommandPart.editorRange),
          renderOptions: {
            after: {
              contentText: agentSubcommandPart.command.description,
              color: this.getPlaceholderColor()
            }
          }
        }];
      }
    }
    this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, placeholderDecoration ?? []);
  }
  async updateAsyncInputEditorDecorations(token) {
    this.clickablePromptSlashCommand = void 0;
    this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, []);
    const parsedRequest = this.widget.parsedInput.parts;
    const viewModel = this.widget.viewModel;
    if (!viewModel) {
      return;
    }
    const agentPart = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
    const agentSubcommandPart = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart);
    const slashCommandPart = parsedRequest.find((p) => p instanceof ChatRequestSlashCommandPart);
    const slashPromptPart = parsedRequest.find((p) => p instanceof ChatRequestSlashPromptPart);
    const promptSlashCommand = slashPromptPart ? await this.customizationHarnessService.resolvePromptSlashCommand(slashPromptPart.name, viewModel.sessionResource, token) : void 0;
    if (token.isCancellationRequested) {
      return;
    }
    if (slashPromptPart && promptSlashCommand) {
      const onlyPromptCommandAndWhitespace = slashPromptPart && parsedRequest.every(isWhitespaceOrPromptPart);
      if (onlyPromptCommandAndWhitespace && exactlyOneSpaceAfterPart(parsedRequest, slashPromptPart) && promptSlashCommand) {
        const description = promptSlashCommand.argumentHint;
        if (description) {
          this.widget.inputEditor.setDecorationsByType(decorationDescription, placeholderDecorationType, [{
            range: getRangeForPlaceholder(slashPromptPart.editorRange),
            renderOptions: {
              after: {
                contentText: description,
                color: this.getPlaceholderColor()
              }
            }
          }]);
        }
      }
    }
    const textDecorations = [];
    if (agentPart) {
      textDecorations.push({ range: agentPart.editorRange });
    }
    if (agentSubcommandPart) {
      textDecorations.push({ range: agentSubcommandPart.editorRange, hoverMessage: new MarkdownString(agentSubcommandPart.command.description) });
    }
    if (slashCommandPart) {
      textDecorations.push({ range: slashCommandPart.editorRange, hoverMessage: new MarkdownString(slashCommandPart.slashCommand.detail) });
    }
    if (slashPromptPart && promptSlashCommand) {
      this.clickablePromptSlashCommand = {
        range: Range.lift(slashPromptPart.editorRange),
        uri: promptSlashCommand.uri
      };
      const promptHoverMessage = new MarkdownString();
      if (promptSlashCommand.description) {
        promptHoverMessage.appendText(promptSlashCommand.description);
        promptHoverMessage.appendText("\n");
      }
      promptHoverMessage.appendText(localize(
        "chatInput.promptSlashCommand.open",
        "Click to open {0}",
        this.labelService.getUriLabel(promptSlashCommand.uri, { relative: true })
      ));
      const promptDecoration = {
        range: slashPromptPart.editorRange,
        hoverMessage: promptHoverMessage
      };
      this.widget.inputEditor.setDecorationsByType(decorationDescription, clickableSlashPromptTextDecorationType, [promptDecoration]);
    }
    this.widget.inputEditor.setDecorationsByType(decorationDescription, slashCommandTextDecorationType, textDecorations);
    const varDecorations = [];
    const toolParts = parsedRequest.filter((p) => p instanceof ChatRequestToolPart || p instanceof ChatRequestToolSetPart);
    for (const tool of toolParts) {
      varDecorations.push({ range: tool.editorRange });
    }
    const dynamicVariableParts = parsedRequest.filter((p) => p instanceof ChatRequestDynamicVariablePart);
    const isEditingPreviousRequest = !!viewModel.editing;
    if (isEditingPreviousRequest) {
      for (const variable of dynamicVariableParts) {
        varDecorations.push({ range: variable.editorRange, hoverMessage: URI.isUri(variable.data) ? new MarkdownString(this.labelService.getUriLabel(variable.data, { relative: true })) : void 0 });
      }
    }
    this.widget.inputEditor.setDecorationsByType(decorationDescription, variableTextDecorationType, varDecorations);
  }
  updateAriaPlaceholder(value) {
    const nativeEditContext = NativeEditContextRegistry.get(this.widget.inputEditor.getId());
    if (nativeEditContext) {
      const domNode = nativeEditContext.domNode.domNode;
      if (value && value.trim().length) {
        domNode.setAttribute("aria-placeholder", value);
      } else {
        domNode.removeAttribute("aria-placeholder");
      }
    } else {
      const textAreaEditContext = TextAreaEditContextRegistry.get(this.widget.inputEditor.getId());
      if (textAreaEditContext) {
        const textArea = textAreaEditContext.textArea.domNode;
        if (value && value.trim().length) {
          textArea.setAttribute("aria-placeholder", value);
        } else {
          textArea.removeAttribute("aria-placeholder");
        }
      }
    }
  }
};
InputEditorDecorations.UPDATE_DELAY = 200;
InputEditorDecorations = __decorateClass([
  __decorateParam(1, ICodeEditorService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IChatAgentService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, ICustomizationHarnessService),
  __decorateParam(6, IEditorService)
], InputEditorDecorations);
class InputEditorSlashCommandMode extends Disposable {
  constructor(widget) {
    super();
    this.widget = widget;
    this.id = "InputEditorSlashCommandMode";
    this._register(this.widget.onDidChangeAgent((e) => {
      if (e.slashCommand && e.slashCommand.isSticky || !e.slashCommand && e.agent.metadata.isSticky) {
        this.repopulateAgentCommand(e.agent, e.slashCommand);
      }
    }));
    this._register(this.widget.onDidSubmitAgent((e) => {
      this.repopulateAgentCommand(e.agent, e.slashCommand);
    }));
  }
  async repopulateAgentCommand(agent, slashCommand) {
    if (this.widget.inputEditor.getValue().trim()) {
      return;
    }
    let value;
    if (slashCommand && slashCommand.isSticky) {
      value = `${chatAgentLeader}${agent.name} ${chatSubcommandLeader}${slashCommand.name} `;
    } else if (agent.metadata.isSticky) {
      value = `${chatAgentLeader}${agent.name} `;
    }
    if (value) {
      this.widget.inputEditor.setValue(value);
      this.widget.inputEditor.setPosition({ lineNumber: 1, column: value.length + 1 });
    }
  }
}
ChatWidget.CONTRIBS.push(InputEditorDecorations, InputEditorSlashCommandMode);
class ChatTokenDeleter extends Disposable {
  constructor(widget) {
    super();
    this.widget = widget;
    this.id = "chatTokenDeleter";
    let prevInsertTokenRange;
    this._register(this.widget.inputEditor.onDidChangeModelContent((e) => {
      let insertedTokenRange;
      if (e.changes.length === 1) {
        const change = e.changes[0];
        if (change.text.length > 0 && change.rangeLength === 1) {
          if (slashReg.test(change.text) || agentReg.test(change.text) || variableReg.test(change.text)) {
            insertedTokenRange = new Range(change.range.startLineNumber, change.range.startColumn, change.range.endLineNumber, change.range.startColumn + change.text.length);
          }
        } else if (change.text.length === 0 && prevInsertTokenRange && change.range.endColumn === prevInsertTokenRange.endColumn) {
          this.widget.inputEditor.executeEdits(this.id, [{
            range: prevInsertTokenRange,
            text: ""
          }]);
          this.widget.refreshParsedInput();
        }
      }
      prevInsertTokenRange = insertedTokenRange;
    }));
  }
}
ChatWidget.CONTRIBS.push(ChatTokenDeleter);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXGVkaXRvclxcY2hhdElucHV0RWRpdG9yQ29udHJpYi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgdGhlbWVDb2xvckZyb21JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTW91c2VUYXJnZXRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0SW5wdXRQbGFjZWhvbGRlckNvbG9yLCBnZXRSYW5nZUZvclBsYWNlaG9sZGVyIH0gZnJvbSAnLi9jaGF0SW5wdXRQbGFjZWhvbGRlckRlY29yYXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjaGF0U2xhc2hDb21tYW5kQmFja2dyb3VuZCwgY2hhdFNsYXNoQ29tbWFuZEZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vd2lkZ2V0L2NoYXRDb2xvcnMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RBZ2VudFBhcnQsIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCwgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0LCBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQsIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0LCBDaGF0UmVxdWVzdFRleHRQYXJ0LCBDaGF0UmVxdWVzdFRvb2xQYXJ0LCBDaGF0UmVxdWVzdFRvb2xTZXRQYXJ0LCBJUGFyc2VkQ2hhdFJlcXVlc3RQYXJ0LCBjaGF0QWdlbnRMZWFkZXIsIGNoYXRTdWJjb21tYW5kTGVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IGFnZW50UmVnLCBzbGFzaFJlZywgdmFyaWFibGVSZWcgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UmVxdWVzdFBhcnNlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uL2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgZHluYW1pY1ZhcmlhYmxlRGVjb3JhdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9hdHRhY2htZW50cy9jaGF0RHluYW1pY1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBOYXRpdmVFZGl0Q29udGV4dFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29udHJvbGxlci9lZGl0Q29udGV4dC9uYXRpdmUvbmF0aXZlRWRpdENvbnRleHRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUZXh0QXJlYUVkaXRDb250ZXh0UmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb250cm9sbGVyL2VkaXRDb250ZXh0L3RleHRBcmVhL3RleHRBcmVhRWRpdENvbnRleHRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5cbmNvbnN0IGRlY29yYXRpb25EZXNjcmlwdGlvbiA9ICdjaGF0JztcbmNvbnN0IHBsYWNlaG9sZGVyRGVjb3JhdGlvblR5cGUgPSAnY2hhdC1zZXNzaW9uLWRldGFpbCc7XG5jb25zdCBzbGFzaENvbW1hbmRUZXh0RGVjb3JhdGlvblR5cGUgPSAnY2hhdC1zZXNzaW9uLXRleHQnO1xuY29uc3QgY2xpY2thYmxlU2xhc2hQcm9tcHRUZXh0RGVjb3JhdGlvblR5cGUgPSAnY2hhdC1zZXNzaW9uLWNsaWNrYWJsZS10ZXh0JztcbmNvbnN0IHZhcmlhYmxlVGV4dERlY29yYXRpb25UeXBlID0gJ2NoYXQtdmFyaWFibGUtdGV4dCc7XG5cbmZ1bmN0aW9uIGFnZW50QW5kQ29tbWFuZFRvS2V5KGFnZW50OiBJQ2hhdEFnZW50RGF0YSwgc3ViY29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0cmV0dXJuIHN1YmNvbW1hbmQgPyBgJHthZ2VudC5pZH1fXyR7c3ViY29tbWFuZH1gIDogYWdlbnQuaWQ7XG59XG5cbmZ1bmN0aW9uIGlzV2hpdGVzcGFjZU9yUHJvbXB0UGFydChwOiBJUGFyc2VkQ2hhdFJlcXVlc3RQYXJ0KTogYm9vbGVhbiB7XG5cdHJldHVybiAocCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0VGV4dFBhcnQgJiYgIXAudGV4dC50cmltKCkubGVuZ3RoKSB8fCAocCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0KTtcbn1cblxuZnVuY3Rpb24gZXhhY3RseU9uZVNwYWNlQWZ0ZXJQYXJ0KHBhcnNlZFJlcXVlc3Q6IHJlYWRvbmx5IElQYXJzZWRDaGF0UmVxdWVzdFBhcnRbXSwgcGFydDogSVBhcnNlZENoYXRSZXF1ZXN0UGFydCk6IGJvb2xlYW4ge1xuXHRjb25zdCBwYXJ0SWR4ID0gcGFyc2VkUmVxdWVzdC5pbmRleE9mKHBhcnQpO1xuXHRpZiAocGFyc2VkUmVxdWVzdC5sZW5ndGggPiBwYXJ0SWR4ICsgMikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IG5leHRQYXJ0ID0gcGFyc2VkUmVxdWVzdFtwYXJ0SWR4ICsgMV07XG5cdHJldHVybiBuZXh0UGFydCAmJiBuZXh0UGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0VGV4dFBhcnQgJiYgbmV4dFBhcnQudGV4dCA9PT0gJyAnO1xufVxuXG5jbGFzcyBJbnB1dEVkaXRvckRlY29yYXRpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVVBEQVRFX0RFTEFZID0gMjAwO1xuXG5cdHB1YmxpYyByZWFkb25seSBpZCA9ICdpbnB1dEVkaXRvckRlY29yYXRpb25zJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByZXZpb3VzbHlVc2VkQWdlbnRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgY2xpY2thYmxlUHJvbXB0U2xhc2hDb21tYW5kOiB7IHJhbmdlOiBSYW5nZTsgdXJpOiBVUkkgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb3VzZURvd25Qcm9tcHRTbGFzaENvbW1hbmQ6IHsgcG9zaXRpb246IFBvc2l0aW9uOyB1cmk6IFVSSTsgcmFuZ2U6IFJhbmdlIH0gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3TW9kZWxEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgdXBkYXRlVGhyb3R0bGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjx2b2lkPihJbnB1dEVkaXRvckRlY29yYXRpb25zLlVQREFURV9ERUxBWSkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2lkZ2V0OiBJQ2hhdFdpZGdldCxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJlZERlY29yYXRpb25UeXBlcygpO1xuXHRcdHRoaXMudHJpZ2dlcklucHV0RWRpdG9yRGVjb3JhdGlvbnNVcGRhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCgoKSA9PiB0aGlzLnRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHQvLyBUaGUgZWRpdG9yJ3MgcGxhY2Vob2xkZXIgb3B0aW9uIGlzIHNldC9jbGVhcmVkIGJ5IGZlYXR1cmVzIHN1Y2ggYXNcblx0XHRcdC8vIGRpY3RhdGlvbiAoXCJMaXN0ZW5pbmdcdTIwMjZcIikuIFdoZW4gaXQgaXMgc2V0LCBQbGFjZWhvbGRlclRleHRDb250cmlidXRpb25cblx0XHRcdC8vIHJlbmRlcnMgaXQsIHNvIHRoZSBkZWNvcmF0aW9uIHBsYWNlaG9sZGVyIG11c3QgeWllbGQgdG8gYXZvaWQgdHdvXG5cdFx0XHQvLyBvdmVybGFwcGluZyBwbGFjZWhvbGRlcnM7IHJlLXJ1biB3aGVuIHRoZSBvcHRpb24gY2hhbmdlcy5cblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnBsYWNlaG9sZGVyKSkge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlUGFyc2VkSW5wdXQoKCkgPT4gdGhpcy50cmlnZ2VySW5wdXRFZGl0b3JEZWNvcmF0aW9uc1VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQub25EaWRDaGFuZ2VWaWV3TW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlclZpZXdNb2RlbExpc3RlbmVycygpO1xuXHRcdFx0dGhpcy5wcmV2aW91c2x5VXNlZEFnZW50cy5jbGVhcigpO1xuXHRcdFx0dGhpcy50cmlnZ2VySW5wdXRFZGl0b3JEZWNvcmF0aW9uc1VwZGF0ZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5vbkRpZFN1Ym1pdEFnZW50KChlKSA9PiB7XG5cdFx0XHR0aGlzLnByZXZpb3VzbHlVc2VkQWdlbnRzLmFkZChhZ2VudEFuZENvbW1hbmRUb0tleShlLmFnZW50LCBlLnNsYXNoQ29tbWFuZD8ubmFtZSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5pbnB1dEVkaXRvci5vbk1vdXNlRG93bihlID0+IHtcblx0XHRcdHRoaXMubW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoIWUuZXZlbnQubGVmdEJ1dHRvbiB8fCBlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuQ09OVEVOVF9URVhUIHx8ICFlLnRhcmdldC5wb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsaWNrYWJsZVByb21wdFNsYXNoQ29tbWFuZCA9IHRoaXMuY2xpY2thYmxlUHJvbXB0U2xhc2hDb21tYW5kO1xuXHRcdFx0aWYgKCFjbGlja2FibGVQcm9tcHRTbGFzaENvbW1hbmQgfHwgIWNsaWNrYWJsZVByb21wdFNsYXNoQ29tbWFuZC5yYW5nZS5jb250YWluc1Bvc2l0aW9uKGUudGFyZ2V0LnBvc2l0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMubW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kID0ge1xuXHRcdFx0XHRwb3NpdGlvbjogUG9zaXRpb24ubGlmdChlLnRhcmdldC5wb3NpdGlvbiksXG5cdFx0XHRcdHVyaTogY2xpY2thYmxlUHJvbXB0U2xhc2hDb21tYW5kLnVyaSxcblx0XHRcdFx0cmFuZ2U6IGNsaWNrYWJsZVByb21wdFNsYXNoQ29tbWFuZC5yYW5nZSxcblx0XHRcdH07XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLm9uTW91c2VVcChlID0+IHtcblx0XHRcdGNvbnN0IG1vdXNlRG93blByb21wdFNsYXNoQ29tbWFuZCA9IHRoaXMubW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kO1xuXHRcdFx0dGhpcy5tb3VzZURvd25Qcm9tcHRTbGFzaENvbW1hbmQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGlmICghbW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kIHx8IGUudGFyZ2V0LnR5cGUgIT09IE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQgfHwgIWUudGFyZ2V0LnBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFtb3VzZURvd25Qcm9tcHRTbGFzaENvbW1hbmQucmFuZ2UuY29udGFpbnNQb3NpdGlvbihlLnRhcmdldC5wb3NpdGlvbikgfHwgIVBvc2l0aW9uLmVxdWFscyhtb3VzZURvd25Qcm9tcHRTbGFzaENvbW1hbmQucG9zaXRpb24sIGUudGFyZ2V0LnBvc2l0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHZvaWQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogbW91c2VEb3duUHJvbXB0U2xhc2hDb21tYW5kLnVyaSB9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzKCgpID0+IHRoaXMudHJpZ2dlcklucHV0RWRpdG9yRGVjb3JhdGlvbnNVcGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcygoZSkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy53aWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlICYmIGUuc2Vzc2lvblR5cGUgPT09IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcklucHV0RWRpdG9yRGVjb3JhdGlvbnNVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Ly8gV2F0Y2ggZm9yIGNoYW5nZXMgdG8gdGhlIGN1cnJlbnQgbW9kZSBhbmQgaXRzIHByb3BlcnRpZXNcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlID0gdGhpcy53aWRnZXQuaW5wdXQuY3VycmVudE1vZGVPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGN1cnJlbnRNb2RlKSB7XG5cdFx0XHRcdC8vIEFsc28gd2F0Y2ggdGhlIG1vZGUncyBkZXNjcmlwdGlvbiB0byByZWFjdCB0byBhbnkgY2hhbmdlc1xuXHRcdFx0XHRjdXJyZW50TW9kZS5kZXNjcmlwdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cdFx0XHQvLyBUcmlnZ2VyIGRlY29yYXRpb24gdXBkYXRlIHdoZW4gbW9kZSBvciBpdHMgcHJvcGVydGllcyBjaGFuZ2Vcblx0XHRcdHRoaXMudHJpZ2dlcklucHV0RWRpdG9yRGVjb3JhdGlvbnNVcGRhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyVmlld01vZGVsTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld01vZGVsTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMudmFsdWUgPSB0aGlzLndpZGdldC52aWV3TW9kZWw/Lm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGU/LmtpbmQgPT09ICdjaGFuZ2VQbGFjZWhvbGRlcicgfHwgZT8ua2luZCA9PT0gJ2luaXRpYWxpemUnKSB7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcklucHV0RWRpdG9yRGVjb3JhdGlvbnNVcGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJlZERlY29yYXRpb25UeXBlcygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBwbGFjZWhvbGRlckRlY29yYXRpb25UeXBlLCB7fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uRGVzY3JpcHRpb24sIHNsYXNoQ29tbWFuZFRleHREZWNvcmF0aW9uVHlwZSwge1xuXHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoY2hhdFNsYXNoQ29tbWFuZEZvcmVncm91bmQpLFxuXHRcdFx0YmFja2dyb3VuZENvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGNoYXRTbGFzaENvbW1hbmRCYWNrZ3JvdW5kKSxcblx0XHRcdGJvcmRlclJhZGl1czogJzNweCdcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgY2xpY2thYmxlU2xhc2hQcm9tcHRUZXh0RGVjb3JhdGlvblR5cGUsIHtcblx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGNoYXRTbGFzaENvbW1hbmRGb3JlZ3JvdW5kKSxcblx0XHRcdGJhY2tncm91bmRDb2xvcjogdGhlbWVDb2xvckZyb21JZChjaGF0U2xhc2hDb21tYW5kQmFja2dyb3VuZCksXG5cdFx0XHRib3JkZXJSYWRpdXM6ICczcHgnLFxuXHRcdFx0Y3Vyc29yOiAncG9pbnRlcidcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb2RlRWRpdG9yU2VydmljZS5yZWdpc3RlckRlY29yYXRpb25UeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgdmFyaWFibGVUZXh0RGVjb3JhdGlvblR5cGUsIHtcblx0XHRcdGNvbG9yOiB0aGVtZUNvbG9yRnJvbUlkKGNoYXRTbGFzaENvbW1hbmRGb3JlZ3JvdW5kKSxcblx0XHRcdGJhY2tncm91bmRDb2xvcjogdGhlbWVDb2xvckZyb21JZChjaGF0U2xhc2hDb21tYW5kQmFja2dyb3VuZCksXG5cdFx0XHRib3JkZXJSYWRpdXM6ICczcHgnXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29kZUVkaXRvclNlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uVHlwZShkZWNvcmF0aW9uRGVzY3JpcHRpb24sIGR5bmFtaWNWYXJpYWJsZURlY29yYXRpb25UeXBlLCB7XG5cdFx0XHRjb2xvcjogdGhlbWVDb2xvckZyb21JZChjaGF0U2xhc2hDb21tYW5kRm9yZWdyb3VuZCksXG5cdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IHRoZW1lQ29sb3JGcm9tSWQoY2hhdFNsYXNoQ29tbWFuZEJhY2tncm91bmQpLFxuXHRcdFx0Ym9yZGVyUmFkaXVzOiAnM3B4Jyxcblx0XHRcdHJhbmdlQmVoYXZpb3I6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQbGFjZWhvbGRlckNvbG9yKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGdldElucHV0UGxhY2Vob2xkZXJDb2xvcih0aGlzLnRoZW1lU2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIHRyaWdnZXJJbnB1dEVkaXRvckRlY29yYXRpb25zVXBkYXRlKCk6IHZvaWQge1xuXHRcdC8vIHVwZGF0ZSBwbGFjZWhvbGRlciBkZWNvcmF0aW9ucyBpbW1lZGlhdGVseSwgaW4gc3luY1xuXHRcdHRoaXMudXBkYXRlSW5wdXRQbGFjZWhvbGRlckRlY29yYXRpb24oKTtcblxuXHRcdC8vIHdpdGggYSBkZWxheSwgdXBkYXRlIHRoZSByZXN0IG9mIHRoZSBkZWNvcmF0aW9uc1xuXHRcdHRoaXMudXBkYXRlVGhyb3R0bGUudHJpZ2dlcih0b2tlbiA9PiB0aGlzLnVwZGF0ZUFzeW5jSW5wdXRFZGl0b3JEZWNvcmF0aW9ucyh0b2tlbikpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHQvLyBUaHJvdHRsZWQgZGVsYXllcnMgcmVqZWN0IHdpdGggQ2FuY2VsbGF0aW9uRXJyb3Igd2hlbiBkaXNwb3NlZCBtaWQtZmxpZ2h0LlxuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dFBsYWNlaG9sZGVyRGVjb3JhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dFZhbHVlID0gdGhpcy53aWRnZXQuaW5wdXRFZGl0b3IuZ2V0VmFsdWUoKTtcblxuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMud2lkZ2V0LnZpZXdNb2RlbDtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy51cGRhdGVBcmlhUGxhY2Vob2xkZXIodW5kZWZpbmVkKTtcblx0XHRcdC8vIE5vIGJvdW5kIHZpZXcgbW9kZWwgeWV0IChlLmcuIHNlc3Npb24gc3RpbGwgbG9hZGluZyk6IGNsZWFyIGFueSBzdGFsZVxuXHRcdFx0Ly8gcGxhY2Vob2xkZXIgZGVjb3JhdGlvbiBzbyBpdCBkb2Vzbid0IHJlbmRlciBvdmVyIHR5cGVkIHRleHQuIFNlZSAjMzI1MzIzLlxuXHRcdFx0aWYgKGlucHV0VmFsdWUpIHtcblx0XHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBwbGFjZWhvbGRlckRlY29yYXRpb25UeXBlLCBbXSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFpbnB1dFZhbHVlKSB7XG5cdFx0XHQvLyBJZiB0aGUgZWRpdG9yJ3MgcGxhY2Vob2xkZXIgb3B0aW9uIGlzIHNldCAoZS5nLiBkaWN0YXRpb24gc2hvd3Ncblx0XHRcdC8vIFwiTGlzdGVuaW5nXHUyMDI2XCIpLCBQbGFjZWhvbGRlclRleHRDb250cmlidXRpb24gcmVuZGVycyBpdCBhbHJlYWR5OyBza2lwXG5cdFx0XHQvLyB0aGUgZGVjb3JhdGlvbiBwbGFjZWhvbGRlciBzbyB0aGUgdHdvIGRvbid0IHJlbmRlciBvbiB0b3Agb2YgZWFjaFxuXHRcdFx0Ly8gb3RoZXIuXG5cdFx0XHRpZiAodGhpcy53aWRnZXQuaW5wdXRFZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5wbGFjZWhvbGRlcikpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBcmlhUGxhY2Vob2xkZXIodW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBwbGFjZWhvbGRlckRlY29yYXRpb25UeXBlLCBbXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMud2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpO1xuXHRcdFx0Y29uc3QgcGxhY2Vob2xkZXIgPSBtb2RlLmFyZ3VtZW50SGludD8uZ2V0KCkgPz8gbW9kZS5kZXNjcmlwdGlvbi5nZXQoKSA/PyAnJztcblx0XHRcdGNvbnN0IGRpc3BsYXlQbGFjZWhvbGRlciA9IHZpZXdNb2RlbC5pbnB1dFBsYWNlaG9sZGVyIHx8IHBsYWNlaG9sZGVyO1xuXG5cdFx0XHRjb25zdCBkZWNvcmF0aW9uOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IDEwMDBcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlbmRlck9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHRcdGNvbnRlbnRUZXh0OiBkaXNwbGF5UGxhY2Vob2xkZXIsXG5cdFx0XHRcdFx0XHRcdGNvbG9yOiB0aGlzLmdldFBsYWNlaG9sZGVyQ29sb3IoKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHRcdHRoaXMudXBkYXRlQXJpYVBsYWNlaG9sZGVyKGRpc3BsYXlQbGFjZWhvbGRlciB8fCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBwbGFjZWhvbGRlckRlY29yYXRpb25UeXBlLCBkZWNvcmF0aW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZUFyaWFQbGFjZWhvbGRlcih1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHRoaXMud2lkZ2V0LnBhcnNlZElucHV0LnBhcnRzO1xuXG5cdFx0bGV0IHBsYWNlaG9sZGVyRGVjb3JhdGlvbjogSURlY29yYXRpb25PcHRpb25zW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWdlbnRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5maW5kKChwKTogcCBpcyBDaGF0UmVxdWVzdEFnZW50UGFydCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpO1xuXHRcdGNvbnN0IGFnZW50U3ViY29tbWFuZFBhcnQgPSBwYXJzZWRSZXF1ZXN0LmZpbmQoKHApOiBwIGlzIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0KTtcblxuXHRcdGNvbnN0IG9ubHlBZ2VudEFuZFdoaXRlc3BhY2UgPSBhZ2VudFBhcnQgJiYgcGFyc2VkUmVxdWVzdC5ldmVyeShwID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRleHRQYXJ0ICYmICFwLnRleHQudHJpbSgpLmxlbmd0aCB8fCBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpO1xuXHRcdGlmIChvbmx5QWdlbnRBbmRXaGl0ZXNwYWNlKSB7XG5cdFx0XHQvLyBBZ2VudCByZWZlcmVuY2Ugd2l0aCBubyBvdGhlciB0ZXh0IC0gc2hvdyB0aGUgcGxhY2Vob2xkZXJcblx0XHRcdGNvbnN0IGlzRm9sbG93dXBTbGFzaENvbW1hbmQgPSB0aGlzLnByZXZpb3VzbHlVc2VkQWdlbnRzLmhhcyhhZ2VudEFuZENvbW1hbmRUb0tleShhZ2VudFBhcnQuYWdlbnQsIHVuZGVmaW5lZCkpO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUmVuZGVyRm9sbG93dXBQbGFjZWhvbGRlciA9IGlzRm9sbG93dXBTbGFzaENvbW1hbmQgJiYgYWdlbnRQYXJ0LmFnZW50Lm1ldGFkYXRhLmZvbGxvd3VwUGxhY2Vob2xkZXI7XG5cdFx0XHRpZiAoYWdlbnRQYXJ0LmFnZW50LmRlc2NyaXB0aW9uICYmIGV4YWN0bHlPbmVTcGFjZUFmdGVyUGFydChwYXJzZWRSZXF1ZXN0LCBhZ2VudFBhcnQpKSB7XG5cdFx0XHRcdHBsYWNlaG9sZGVyRGVjb3JhdGlvbiA9IFt7XG5cdFx0XHRcdFx0cmFuZ2U6IGdldFJhbmdlRm9yUGxhY2Vob2xkZXIoYWdlbnRQYXJ0LmVkaXRvclJhbmdlKSxcblx0XHRcdFx0XHRyZW5kZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50VGV4dDogc2hvdWxkUmVuZGVyRm9sbG93dXBQbGFjZWhvbGRlciA/IGFnZW50UGFydC5hZ2VudC5tZXRhZGF0YS5mb2xsb3d1cFBsYWNlaG9sZGVyIDogYWdlbnRQYXJ0LmFnZW50LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRjb2xvcjogdGhpcy5nZXRQbGFjZWhvbGRlckNvbG9yKCksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBvbmx5QWdlbnRBbmRBZ2VudENvbW1hbmRBbmRXaGl0ZXNwYWNlID0gYWdlbnRQYXJ0ICYmIGFnZW50U3ViY29tbWFuZFBhcnQgJiYgcGFyc2VkUmVxdWVzdC5ldmVyeShwID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRleHRQYXJ0ICYmICFwLnRleHQudHJpbSgpLmxlbmd0aCB8fCBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgfHwgcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCk7XG5cdFx0aWYgKG9ubHlBZ2VudEFuZEFnZW50Q29tbWFuZEFuZFdoaXRlc3BhY2UpIHtcblx0XHRcdC8vIEFnZW50IHJlZmVyZW5jZSBhbmQgc3ViY29tbWFuZCB3aXRoIG5vIG90aGVyIHRleHQgLSBzaG93IHRoZSBwbGFjZWhvbGRlclxuXHRcdFx0Y29uc3QgaXNGb2xsb3d1cFNsYXNoQ29tbWFuZCA9IHRoaXMucHJldmlvdXNseVVzZWRBZ2VudHMuaGFzKGFnZW50QW5kQ29tbWFuZFRvS2V5KGFnZW50UGFydC5hZ2VudCwgYWdlbnRTdWJjb21tYW5kUGFydC5jb21tYW5kLm5hbWUpKTtcblx0XHRcdGNvbnN0IHNob3VsZFJlbmRlckZvbGxvd3VwUGxhY2Vob2xkZXIgPSBpc0ZvbGxvd3VwU2xhc2hDb21tYW5kICYmIGFnZW50U3ViY29tbWFuZFBhcnQuY29tbWFuZC5mb2xsb3d1cFBsYWNlaG9sZGVyO1xuXHRcdFx0aWYgKGFnZW50U3ViY29tbWFuZFBhcnQ/LmNvbW1hbmQuZGVzY3JpcHRpb24gJiYgZXhhY3RseU9uZVNwYWNlQWZ0ZXJQYXJ0KHBhcnNlZFJlcXVlc3QsIGFnZW50U3ViY29tbWFuZFBhcnQpKSB7XG5cdFx0XHRcdHBsYWNlaG9sZGVyRGVjb3JhdGlvbiA9IFt7XG5cdFx0XHRcdFx0cmFuZ2U6IGdldFJhbmdlRm9yUGxhY2Vob2xkZXIoYWdlbnRTdWJjb21tYW5kUGFydC5lZGl0b3JSYW5nZSksXG5cdFx0XHRcdFx0cmVuZGVyT3B0aW9uczoge1xuXHRcdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdFx0Y29udGVudFRleHQ6IHNob3VsZFJlbmRlckZvbGxvd3VwUGxhY2Vob2xkZXIgPyBhZ2VudFN1YmNvbW1hbmRQYXJ0LmNvbW1hbmQuZm9sbG93dXBQbGFjZWhvbGRlciA6IGFnZW50U3ViY29tbWFuZFBhcnQuY29tbWFuZC5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0Y29sb3I6IHRoaXMuZ2V0UGxhY2Vob2xkZXJDb2xvcigpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25seUFnZW50Q29tbWFuZEFuZFdoaXRlc3BhY2UgPSBhZ2VudFN1YmNvbW1hbmRQYXJ0ICYmIHBhcnNlZFJlcXVlc3QuZXZlcnkocCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUZXh0UGFydCAmJiAhcC50ZXh0LnRyaW0oKS5sZW5ndGggfHwgcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCk7XG5cdFx0aWYgKG9ubHlBZ2VudENvbW1hbmRBbmRXaGl0ZXNwYWNlKSB7XG5cdFx0XHQvLyBBZ2VudCBzdWJjb21tYW5kIHdpdGggbm8gb3RoZXIgdGV4dCAtIHNob3cgdGhlIHBsYWNlaG9sZGVyXG5cdFx0XHRpZiAoYWdlbnRTdWJjb21tYW5kUGFydD8uY29tbWFuZC5kZXNjcmlwdGlvbiAmJiBleGFjdGx5T25lU3BhY2VBZnRlclBhcnQocGFyc2VkUmVxdWVzdCwgYWdlbnRTdWJjb21tYW5kUGFydCkpIHtcblx0XHRcdFx0cGxhY2Vob2xkZXJEZWNvcmF0aW9uID0gW3tcblx0XHRcdFx0XHRyYW5nZTogZ2V0UmFuZ2VGb3JQbGFjZWhvbGRlcihhZ2VudFN1YmNvbW1hbmRQYXJ0LmVkaXRvclJhbmdlKSxcblx0XHRcdFx0XHRyZW5kZXJPcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0XHRjb250ZW50VGV4dDogYWdlbnRTdWJjb21tYW5kUGFydC5jb21tYW5kLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRjb2xvcjogdGhpcy5nZXRQbGFjZWhvbGRlckNvbG9yKCksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBwbGFjZWhvbGRlckRlY29yYXRpb25UeXBlLCBwbGFjZWhvbGRlckRlY29yYXRpb24gPz8gW10pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVBc3luY0lucHV0RWRpdG9yRGVjb3JhdGlvbnModG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jbGlja2FibGVQcm9tcHRTbGFzaENvbW1hbmQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBjbGlja2FibGVTbGFzaFByb21wdFRleHREZWNvcmF0aW9uVHlwZSwgW10pO1xuXG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHRoaXMud2lkZ2V0LnBhcnNlZElucHV0LnBhcnRzO1xuXHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMud2lkZ2V0LnZpZXdNb2RlbDtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFnZW50UGFydCA9IHBhcnNlZFJlcXVlc3QuZmluZCgocCk6IHAgaXMgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHRjb25zdCBhZ2VudFN1YmNvbW1hbmRQYXJ0ID0gcGFyc2VkUmVxdWVzdC5maW5kKChwKTogcCBpcyBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCk7XG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QuZmluZCgocCk6IHAgaXMgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0ID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQpO1xuXHRcdGNvbnN0IHNsYXNoUHJvbXB0UGFydCA9IHBhcnNlZFJlcXVlc3QuZmluZCgocCk6IHAgaXMgQ2hhdFJlcXVlc3RTbGFzaFByb21wdFBhcnQgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hQcm9tcHRQYXJ0KTtcblxuXHRcdC8vIGZpcnN0LCBmZXRjaCBhbGwgYXN5bmMgY29udGV4dFxuXHRcdGNvbnN0IHByb21wdFNsYXNoQ29tbWFuZCA9IHNsYXNoUHJvbXB0UGFydCA/IGF3YWl0IHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLnJlc29sdmVQcm9tcHRTbGFzaENvbW1hbmQoc2xhc2hQcm9tcHRQYXJ0Lm5hbWUsIHZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHRva2VuKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdC8vIGEgbmV3IHVwZGF0ZSBjYW1lIGluIHdoaWxlIHdlIHdlcmUgd2FpdGluZ1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChzbGFzaFByb21wdFBhcnQgJiYgcHJvbXB0U2xhc2hDb21tYW5kKSB7XG5cdFx0XHRjb25zdCBvbmx5UHJvbXB0Q29tbWFuZEFuZFdoaXRlc3BhY2UgPSBzbGFzaFByb21wdFBhcnQgJiYgcGFyc2VkUmVxdWVzdC5ldmVyeShpc1doaXRlc3BhY2VPclByb21wdFBhcnQpO1xuXHRcdFx0aWYgKG9ubHlQcm9tcHRDb21tYW5kQW5kV2hpdGVzcGFjZSAmJiBleGFjdGx5T25lU3BhY2VBZnRlclBhcnQocGFyc2VkUmVxdWVzdCwgc2xhc2hQcm9tcHRQYXJ0KSAmJiBwcm9tcHRTbGFzaENvbW1hbmQpIHtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBwcm9tcHRTbGFzaENvbW1hbmQuYXJndW1lbnRIaW50O1xuXHRcdFx0XHRpZiAoZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHR0aGlzLndpZGdldC5pbnB1dEVkaXRvci5zZXREZWNvcmF0aW9uc0J5VHlwZShkZWNvcmF0aW9uRGVzY3JpcHRpb24sIHBsYWNlaG9sZGVyRGVjb3JhdGlvblR5cGUsIFt7XG5cdFx0XHRcdFx0XHRyYW5nZTogZ2V0UmFuZ2VGb3JQbGFjZWhvbGRlcihzbGFzaFByb21wdFBhcnQuZWRpdG9yUmFuZ2UpLFxuXHRcdFx0XHRcdFx0cmVuZGVyT3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnRlbnRUZXh0OiBkZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0XHRjb2xvcjogdGhpcy5nZXRQbGFjZWhvbGRlckNvbG9yKCksXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB0ZXh0RGVjb3JhdGlvbnM6IElEZWNvcmF0aW9uT3B0aW9uc1tdIHwgdW5kZWZpbmVkID0gW107XG5cdFx0aWYgKGFnZW50UGFydCkge1xuXHRcdFx0dGV4dERlY29yYXRpb25zLnB1c2goeyByYW5nZTogYWdlbnRQYXJ0LmVkaXRvclJhbmdlIH0pO1xuXHRcdH1cblx0XHRpZiAoYWdlbnRTdWJjb21tYW5kUGFydCkge1xuXHRcdFx0dGV4dERlY29yYXRpb25zLnB1c2goeyByYW5nZTogYWdlbnRTdWJjb21tYW5kUGFydC5lZGl0b3JSYW5nZSwgaG92ZXJNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYWdlbnRTdWJjb21tYW5kUGFydC5jb21tYW5kLmRlc2NyaXB0aW9uKSB9KTtcblx0XHR9XG5cblx0XHRpZiAoc2xhc2hDb21tYW5kUGFydCkge1xuXHRcdFx0dGV4dERlY29yYXRpb25zLnB1c2goeyByYW5nZTogc2xhc2hDb21tYW5kUGFydC5lZGl0b3JSYW5nZSwgaG92ZXJNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoc2xhc2hDb21tYW5kUGFydC5zbGFzaENvbW1hbmQuZGV0YWlsKSB9KTtcblx0XHR9XG5cblx0XHRpZiAoc2xhc2hQcm9tcHRQYXJ0ICYmIHByb21wdFNsYXNoQ29tbWFuZCkge1xuXHRcdFx0dGhpcy5jbGlja2FibGVQcm9tcHRTbGFzaENvbW1hbmQgPSB7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5saWZ0KHNsYXNoUHJvbXB0UGFydC5lZGl0b3JSYW5nZSksXG5cdFx0XHRcdHVyaTogcHJvbXB0U2xhc2hDb21tYW5kLnVyaSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm9tcHRIb3Zlck1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdGlmIChwcm9tcHRTbGFzaENvbW1hbmQuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0cHJvbXB0SG92ZXJNZXNzYWdlLmFwcGVuZFRleHQocHJvbXB0U2xhc2hDb21tYW5kLmRlc2NyaXB0aW9uKTtcblx0XHRcdFx0cHJvbXB0SG92ZXJNZXNzYWdlLmFwcGVuZFRleHQoJ1xcbicpO1xuXHRcdFx0fVxuXHRcdFx0cHJvbXB0SG92ZXJNZXNzYWdlLmFwcGVuZFRleHQobG9jYWxpemUoXG5cdFx0XHRcdCdjaGF0SW5wdXQucHJvbXB0U2xhc2hDb21tYW5kLm9wZW4nLFxuXHRcdFx0XHRcIkNsaWNrIHRvIG9wZW4gezB9XCIsXG5cdFx0XHRcdHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHByb21wdFNsYXNoQ29tbWFuZC51cmksIHsgcmVsYXRpdmU6IHRydWUgfSlcblx0XHRcdCkpO1xuXHRcdFx0Y29uc3QgcHJvbXB0RGVjb3JhdGlvbiA9IHtcblx0XHRcdFx0cmFuZ2U6IHNsYXNoUHJvbXB0UGFydC5lZGl0b3JSYW5nZSxcblx0XHRcdFx0aG92ZXJNZXNzYWdlOiBwcm9tcHRIb3Zlck1lc3NhZ2UsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0RGVjb3JhdGlvbnNCeVR5cGUoZGVjb3JhdGlvbkRlc2NyaXB0aW9uLCBjbGlja2FibGVTbGFzaFByb21wdFRleHREZWNvcmF0aW9uVHlwZSwgW3Byb21wdERlY29yYXRpb25dKTtcblx0XHR9XG5cblx0XHR0aGlzLndpZGdldC5pbnB1dEVkaXRvci5zZXREZWNvcmF0aW9uc0J5VHlwZShkZWNvcmF0aW9uRGVzY3JpcHRpb24sIHNsYXNoQ29tbWFuZFRleHREZWNvcmF0aW9uVHlwZSwgdGV4dERlY29yYXRpb25zKTtcblxuXHRcdGNvbnN0IHZhckRlY29yYXRpb25zOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSA9IFtdO1xuXHRcdGNvbnN0IHRvb2xQYXJ0cyA9IHBhcnNlZFJlcXVlc3QuZmlsdGVyKChwKTogcCBpcyBDaGF0UmVxdWVzdFRvb2xQYXJ0ID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRvb2xQYXJ0IHx8IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRvb2xTZXRQYXJ0KTtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFBhcnRzKSB7XG5cdFx0XHR2YXJEZWNvcmF0aW9ucy5wdXNoKHsgcmFuZ2U6IHRvb2wuZWRpdG9yUmFuZ2UgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHluYW1pY1ZhcmlhYmxlUGFydHMgPSBwYXJzZWRSZXF1ZXN0LmZpbHRlcigocCk6IHAgaXMgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0ID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdER5bmFtaWNWYXJpYWJsZVBhcnQpO1xuXG5cdFx0Y29uc3QgaXNFZGl0aW5nUHJldmlvdXNSZXF1ZXN0ID0gISF2aWV3TW9kZWwuZWRpdGluZztcblx0XHRpZiAoaXNFZGl0aW5nUHJldmlvdXNSZXF1ZXN0KSB7XG5cdFx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGR5bmFtaWNWYXJpYWJsZVBhcnRzKSB7XG5cdFx0XHRcdHZhckRlY29yYXRpb25zLnB1c2goeyByYW5nZTogdmFyaWFibGUuZWRpdG9yUmFuZ2UsIGhvdmVyTWVzc2FnZTogVVJJLmlzVXJpKHZhcmlhYmxlLmRhdGEpID8gbmV3IE1hcmtkb3duU3RyaW5nKHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHZhcmlhYmxlLmRhdGEsIHsgcmVsYXRpdmU6IHRydWUgfSkpIDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKGRlY29yYXRpb25EZXNjcmlwdGlvbiwgdmFyaWFibGVUZXh0RGVjb3JhdGlvblR5cGUsIHZhckRlY29yYXRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQXJpYVBsYWNlaG9sZGVyKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBuYXRpdmVFZGl0Q29udGV4dCA9IE5hdGl2ZUVkaXRDb250ZXh0UmVnaXN0cnkuZ2V0KHRoaXMud2lkZ2V0LmlucHV0RWRpdG9yLmdldElkKCkpO1xuXHRcdGlmIChuYXRpdmVFZGl0Q29udGV4dCkge1xuXHRcdFx0Y29uc3QgZG9tTm9kZSA9IG5hdGl2ZUVkaXRDb250ZXh0LmRvbU5vZGUuZG9tTm9kZTtcblx0XHRcdGlmICh2YWx1ZSAmJiB2YWx1ZS50cmltKCkubGVuZ3RoKSB7XG5cdFx0XHRcdGRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLXBsYWNlaG9sZGVyJywgdmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtcGxhY2Vob2xkZXInKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdGV4dEFyZWFFZGl0Q29udGV4dCA9IFRleHRBcmVhRWRpdENvbnRleHRSZWdpc3RyeS5nZXQodGhpcy53aWRnZXQuaW5wdXRFZGl0b3IuZ2V0SWQoKSk7XG5cdFx0XHRpZiAodGV4dEFyZWFFZGl0Q29udGV4dCkge1xuXHRcdFx0XHRjb25zdCB0ZXh0QXJlYSA9IHRleHRBcmVhRWRpdENvbnRleHQudGV4dEFyZWEuZG9tTm9kZTtcblx0XHRcdFx0aWYgKHZhbHVlICYmIHZhbHVlLnRyaW0oKS5sZW5ndGgpIHtcblx0XHRcdFx0XHR0ZXh0QXJlYS5zZXRBdHRyaWJ1dGUoJ2FyaWEtcGxhY2Vob2xkZXInLCB2YWx1ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGV4dEFyZWEucmVtb3ZlQXR0cmlidXRlKCdhcmlhLXBsYWNlaG9sZGVyJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSW5wdXRFZGl0b3JTbGFzaENvbW1hbmRNb2RlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHB1YmxpYyByZWFkb25seSBpZCA9ICdJbnB1dEVkaXRvclNsYXNoQ29tbWFuZE1vZGUnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2lkZ2V0OiBJQ2hhdFdpZGdldFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlQWdlbnQoZSA9PiB7XG5cdFx0XHRpZiAoZS5zbGFzaENvbW1hbmQgJiYgZS5zbGFzaENvbW1hbmQuaXNTdGlja3kgfHwgIWUuc2xhc2hDb21tYW5kICYmIGUuYWdlbnQubWV0YWRhdGEuaXNTdGlja3kpIHtcblx0XHRcdFx0dGhpcy5yZXBvcHVsYXRlQWdlbnRDb21tYW5kKGUuYWdlbnQsIGUuc2xhc2hDb21tYW5kKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aWRnZXQub25EaWRTdWJtaXRBZ2VudChlID0+IHtcblx0XHRcdHRoaXMucmVwb3B1bGF0ZUFnZW50Q29tbWFuZChlLmFnZW50LCBlLnNsYXNoQ29tbWFuZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXBvcHVsYXRlQWdlbnRDb21tYW5kKGFnZW50OiBJQ2hhdEFnZW50RGF0YSwgc2xhc2hDb21tYW5kOiBJQ2hhdEFnZW50Q29tbWFuZCB8IHVuZGVmaW5lZCkge1xuXHRcdC8vIE1ha2Ugc3VyZSB3ZSBkb24ndCByZXBvcHVsYXRlIGlmIHRoZSB1c2VyIGFscmVhZHkgaGFzIHNvbWV0aGluZyBpbiB0aGUgaW5wdXRcblx0XHRpZiAodGhpcy53aWRnZXQuaW5wdXRFZGl0b3IuZ2V0VmFsdWUoKS50cmltKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgdmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc2xhc2hDb21tYW5kICYmIHNsYXNoQ29tbWFuZC5pc1N0aWNreSkge1xuXHRcdFx0dmFsdWUgPSBgJHtjaGF0QWdlbnRMZWFkZXJ9JHthZ2VudC5uYW1lfSAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7c2xhc2hDb21tYW5kLm5hbWV9IGA7XG5cdFx0fSBlbHNlIGlmIChhZ2VudC5tZXRhZGF0YS5pc1N0aWNreSkge1xuXHRcdFx0dmFsdWUgPSBgJHtjaGF0QWdlbnRMZWFkZXJ9JHthZ2VudC5uYW1lfSBgO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0VmFsdWUodmFsdWUpO1xuXHRcdFx0dGhpcy53aWRnZXQuaW5wdXRFZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IHZhbHVlLmxlbmd0aCArIDEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbkNoYXRXaWRnZXQuQ09OVFJJQlMucHVzaChJbnB1dEVkaXRvckRlY29yYXRpb25zLCBJbnB1dEVkaXRvclNsYXNoQ29tbWFuZE1vZGUpO1xuXG5jbGFzcyBDaGF0VG9rZW5EZWxldGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IGlkID0gJ2NoYXRUb2tlbkRlbGV0ZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2lkZ2V0OiBJQ2hhdFdpZGdldCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGxldCBwcmV2SW5zZXJ0VG9rZW5SYW5nZTogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cblx0XHQvLyBBIHNpbXBsZSBoZXVyaXN0aWMgdG8gZGVsZXRlIHRoZSBwcmV2aW91cyBpbnNlcnQgdG9rZW4gd2hlbiB0aGUgdXNlciBwcmVzc2VzIGJhY2tzcGFjZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChlID0+IHtcblx0XHRcdGxldCBpbnNlcnRlZFRva2VuUmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHQvLyBEb24ndCB0cnkgdG8gaGFuZGxlIG11bHRpLWN1cnNvciBlZGl0cyByaWdodCBub3dcblx0XHRcdGlmIChlLmNoYW5nZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZSA9IGUuY2hhbmdlc1swXTtcblx0XHRcdFx0aWYgKGNoYW5nZS50ZXh0Lmxlbmd0aCA+IDAgJiYgY2hhbmdlLnJhbmdlTGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Ly8gQSBmdWxsIHNsYXNoIGNvbW1hbmQgb3IgYWdlbnQgcmVmZXJlbmNlIHdhcyBqdXN0IGluc2VydGVkIC0gc3RvcmUgaXQgc28gdGhhdCBpZiB0aGUgdXNlciBpbW1lZGlhdGVseSBkZWxldGVzIGl0LCB3ZSBjYW4gZGVsZXRlIHRoZSB3aG9sZSB0aGluZyBpbnN0ZWFkIG9mIGp1c3Qgb25lIGNoYXJhY3RlclxuXHRcdFx0XHRcdGlmIChzbGFzaFJlZy50ZXN0KGNoYW5nZS50ZXh0KSB8fCBhZ2VudFJlZy50ZXN0KGNoYW5nZS50ZXh0KSB8fCB2YXJpYWJsZVJlZy50ZXN0KGNoYW5nZS50ZXh0KSkge1xuXHRcdFx0XHRcdFx0aW5zZXJ0ZWRUb2tlblJhbmdlID0gbmV3IFJhbmdlKGNoYW5nZS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGNoYW5nZS5yYW5nZS5zdGFydENvbHVtbiwgY2hhbmdlLnJhbmdlLmVuZExpbmVOdW1iZXIsIGNoYW5nZS5yYW5nZS5zdGFydENvbHVtbiArIGNoYW5nZS50ZXh0Lmxlbmd0aCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGNoYW5nZS50ZXh0Lmxlbmd0aCA9PT0gMCAmJiBwcmV2SW5zZXJ0VG9rZW5SYW5nZSAmJiBjaGFuZ2UucmFuZ2UuZW5kQ29sdW1uID09PSBwcmV2SW5zZXJ0VG9rZW5SYW5nZS5lbmRDb2x1bW4pIHtcblx0XHRcdFx0XHR0aGlzLndpZGdldC5pbnB1dEVkaXRvci5leGVjdXRlRWRpdHModGhpcy5pZCwgW3tcblx0XHRcdFx0XHRcdHJhbmdlOiBwcmV2SW5zZXJ0VG9rZW5SYW5nZSxcblx0XHRcdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0XHR0aGlzLndpZGdldC5yZWZyZXNoUGFyc2VkSW5wdXQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cHJldkluc2VydFRva2VuUmFuZ2UgPSBpbnNlcnRlZFRva2VuUmFuZ2U7XG5cdFx0fSkpO1xuXHR9XG59XG5DaGF0V2lkZ2V0LkNPTlRSSUJTLnB1c2goQ2hhdFRva2VuRGVsZXRlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFdEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEIsOEJBQThCO0FBQ2pFLFNBQTRDLHlCQUF5QjtBQUNyRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QixrQ0FBa0M7QUFDdkUsU0FBUyxzQkFBc0IsZ0NBQWdDLGdDQUFnQyw2QkFBNkIsNEJBQTRCLHFCQUFxQixxQkFBcUIsd0JBQWdELGlCQUFpQiw0QkFBNEI7QUFDL1IsU0FBUyxVQUFVLFVBQVUsbUJBQW1CO0FBRWhELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsbUNBQW1DO0FBRTVDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0NBQW9DO0FBRTdDLE1BQU0sd0JBQXdCO0FB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
