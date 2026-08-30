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
import * as dom from "../../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derivedOpts } from "../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IChatToolInvocation, isLegacyChatTerminalToolInvocationData, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { isResponseVM } from "../../../../common/model/chatViewModel.js";
import { IChatTodoListService } from "../../../../common/tools/chatTodoListService.js";
import { isToolResultInputOutputDetails, isToolResultOutputDetails, ToolInvocationPresentation } from "../../../../common/tools/languageModelToolsService.js";
import { ExtensionsInstallConfirmationWidgetSubPart } from "./chatExtensionsInstallToolSubPart.js";
import { ChatInputOutputMarkdownProgressPart } from "./chatInputOutputMarkdownProgressPart.js";
import { ChatMcpAppSubPart } from "./chatMcpAppSubPart.js";
import { ChatResultListSubPart } from "./chatResultListSubPart.js";
import { ChatAutomationConfiguredResultSubPart } from "./chatAutomationConfiguredResultSubPart.js";
import { ChatGeneratedImageResultSubPart } from "./chatGeneratedImageResultSubPart.js";
import { ChatSessionCreatedResultSubPart } from "./chatSessionCreatedResultSubPart.js";
import { ChatSimpleToolProgressPart } from "./chatSimpleToolProgressPart.js";
import { ChatSandboxPrerequisiteConfirmationSubPart } from "./chatSandboxPrerequisiteConfirmationSubPart.js";
import { ChatModifiedFilesConfirmationSubPart } from "./chatModifiedFilesConfirmationSubPart.js";
import { ChatAgentFeedbackReviewConfirmationSubPart } from "./chatAgentFeedbackReviewConfirmationSubPart.js";
import { ChatTerminalToolConfirmationSubPart } from "./chatTerminalToolConfirmationSubPart.js";
import { ChatTerminalToolProgressPart } from "./chatTerminalToolProgressPart.js";
import { ChatToolAuthenticationSubPart } from "./chatToolAuthenticationSubPart.js";
import { ToolConfirmationSubPart } from "./chatToolConfirmationSubPart.js";
import { ChatToolOutputSubPart } from "./chatToolOutputPart.js";
import { ChatToolPostExecuteConfirmationPart } from "./chatToolPostExecuteConfirmationPart.js";
import { ChatToolProgressSubPart } from "./chatToolProgressPart.js";
import { ChatToolStreamingSubPart } from "./chatToolStreamingSubPart.js";
import { ChatOtherClientToolProgressPart } from "./chatOtherClientToolProgressPart.js";
function mcpAppRenderDataEquals(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.kind !== b.kind || a.resourceUri !== b.resourceUri || a.input !== b.input || a.sessionResource.toString() !== b.sessionResource.toString()) {
    return false;
  }
  if (a.kind === "agentHost" && b.kind === "agentHost") {
    return a.serverId === b.serverId && a.channel === b.channel;
  }
  if (a.kind === "local" && b.kind === "local") {
    return a.serverDefinitionId === b.serverDefinitionId && a.collectionId === b.collectionId;
  }
  return false;
}
function shouldRenderSessionCreatedResult(toolSpecificDataKind, isResponseComplete) {
  return toolSpecificDataKind === "sessionCreated" && isResponseComplete;
}
function shouldRenderGeneratedImageResult(toolSpecificDataKind, isResponseComplete) {
  return toolSpecificDataKind === "generatedImage" && isResponseComplete;
}
let ChatToolInvocationPart = class extends Disposable {
  constructor(toolInvocation, context, renderer, listPool, editorPool, currentWidthDelegate, announcedToolProgressKeys, codeBlockStartIndex, instantiationService, chatTodoListService) {
    super();
    this.toolInvocation = toolInvocation;
    this.context = context;
    this.renderer = renderer;
    this.listPool = listPool;
    this.editorPool = editorPool;
    this.currentWidthDelegate = currentWidthDelegate;
    this.announcedToolProgressKeys = announcedToolProgressKeys;
    this.codeBlockStartIndex = codeBlockStartIndex;
    this.instantiationService = instantiationService;
    this.chatTodoListService = chatTodoListService;
    this.mcpAppPart = this._register(new MutableDisposable());
    this._onDidRemount = this._register(new Emitter());
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this.renderedSessionCreatedResult = shouldRenderSessionCreatedResult(
      toolInvocation.toolSpecificData?.kind,
      isResponseVM(context.element) && context.element.isComplete
    );
    this.renderedGeneratedImageResult = shouldRenderGeneratedImageResult(
      toolInvocation.toolSpecificData?.kind,
      isResponseVM(context.element) && context.element.isComplete
    );
    this.domNode = dom.$(".chat-tool-invocation-part");
    this.domNode.classList.toggle("generated-image-tool-invocation", this.renderedGeneratedImageResult);
    if (toolInvocation.presentation === "hidden") {
      return;
    }
    if (toolInvocation.toolSpecificData?.kind === "todoList") {
      const sessionResource = context.element.sessionResource;
      const todos = toolInvocation.toolSpecificData.todoList.map((todo, index) => {
        const parsedId = parseInt(todo.id, 10);
        const id = Number.isNaN(parsedId) ? index + 1 : parsedId;
        return {
          id,
          title: todo.title,
          status: todo.status
        };
      });
      this.chatTodoListService.setTodos(sessionResource, todos);
    }
    let appData = constObservable(void 0);
    if (toolInvocation.kind === "toolInvocation") {
      let previousState = toolInvocation.state.get();
      let previousDataKind = toolInvocation.toolSpecificDataKind.get();
      let previousToolSpecificData = toolInvocation.toolSpecificData;
      this._register(autorun((reader) => {
        const state = toolInvocation.state.read(reader);
        const dataKind = toolInvocation.toolSpecificDataKind.read(reader);
        const toolSpecificData = toolInvocation.toolSpecificData;
        const stateChanged = state.type !== previousState.type;
        const dataKindChanged = dataKind !== previousDataKind;
        const dataChanged = state !== previousState && toolSpecificData !== previousToolSpecificData;
        const confirmationMessagesChanged = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && previousState.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages !== previousState.confirmationMessages;
        previousState = state;
        previousDataKind = dataKind;
        previousToolSpecificData = toolSpecificData;
        if (stateChanged || dataKindChanged || dataChanged || confirmationMessagesChanged) {
          render();
        }
      }));
      appData = derivedOpts({
        owner: this,
        equalsFn: mcpAppRenderDataEquals
      }, (reader) => {
        reader.readObservable(toolInvocation.state);
        reader.readObservable(toolInvocation.toolSpecificDataKind);
        const data = this.getMcpAppRenderData();
        if (!data) {
          return void 0;
        }
        const outcome = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation, reader);
        return !!outcome && outcome.type !== ToolConfirmKind.Denied && outcome.type !== ToolConfirmKind.Skipped ? data : void 0;
      });
    } else {
      const data = this.getMcpAppRenderData();
      if (data) {
        const outcome = IChatToolInvocation.executionConfirmedOrDenied(toolInvocation, void 0);
        appData = constObservable(!!outcome && outcome.type !== ToolConfirmKind.Denied && outcome.type !== ToolConfirmKind.Skipped ? data : void 0);
      }
    }
    const partStore = this._register(new DisposableStore());
    let subPartDomNode = document.createElement("div");
    this.domNode.appendChild(subPartDomNode);
    const render = () => {
      partStore.clear();
      if (toolInvocation.presentation === ToolInvocationPresentation.Hidden || toolInvocation.presentation === ToolInvocationPresentation.HiddenAfterComplete && IChatToolInvocation.isComplete(toolInvocation)) {
        dom.hide(this.domNode);
        return;
      }
      dom.show(this.domNode);
      this.subPart = partStore.add(this.createToolInvocationSubPart());
      subPartDomNode.replaceWith(this.subPart.domNode);
      subPartDomNode = this.subPart.domNode;
      const isConfirmation = this.subPart instanceof ToolConfirmationSubPart || this.subPart instanceof ChatTerminalToolConfirmationSubPart || this.subPart instanceof ChatModifiedFilesConfirmationSubPart || this.subPart instanceof ChatSandboxPrerequisiteConfirmationSubPart || this.subPart instanceof ExtensionsInstallConfirmationWidgetSubPart || this.subPart instanceof ChatToolAuthenticationSubPart || this.subPart instanceof ChatToolPostExecuteConfirmationPart;
      this.domNode.classList.toggle("has-confirmation", isConfirmation);
      partStore.add(this.subPart.onNeedsRerender(render));
      if (this.subPart instanceof ChatGeneratedImageResultSubPart) {
        partStore.add(this.subPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
      }
    };
    let appDomNode = document.createElement("div");
    this.domNode.appendChild(appDomNode);
    this._register(autorun((r) => {
      const data = appData.read(r);
      if (!data) {
        this.mcpAppPart.clear();
        dom.clearNode(appDomNode);
        return;
      }
      this.mcpAppPart.value = this.instantiationService.createInstance(
        ChatMcpAppSubPart,
        this.toolInvocation,
        this._onDidRemount.event,
        context,
        data
      );
      appDomNode.replaceWith(this.mcpAppPart.value.domNode);
      appDomNode = this.mcpAppPart.value.domNode;
    }));
    render();
  }
  get toolCallId() {
    return this.toolInvocation.toolCallId;
  }
  get codeblocks() {
    const codeblocks = this.subPart?.codeblocks ?? [];
    if (this.mcpAppPart) {
      codeblocks.push(...this.mcpAppPart.value?.codeblocks ?? []);
    }
    return codeblocks;
  }
  get codeblocksPartId() {
    return this.subPart?.codeblocksPartId;
  }
  createToolInvocationSubPart() {
    if (this.toolInvocation.kind === "toolInvocation") {
      if (this.toolInvocation.otherClientToolCall && !IChatToolInvocation.isComplete(this.toolInvocation)) {
        return this.instantiationService.createInstance(ChatOtherClientToolProgressPart, this.toolInvocation, this.renderer, this.announcedToolProgressKeys);
      }
      if (this.toolInvocation.toolSpecificData?.kind === "extensions") {
        return this.instantiationService.createInstance(ExtensionsInstallConfirmationWidgetSubPart, this.toolInvocation, this.context);
      }
      const state = this.toolInvocation.state.get();
      if (state.type === IChatToolInvocation.StateKind.Streaming) {
        return this.instantiationService.createInstance(ChatToolStreamingSubPart, this.toolInvocation, this.context, this.renderer);
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
        if (this.toolInvocation.toolSpecificData?.kind === "terminal" && !isLegacyChatTerminalToolInvocationData(this.toolInvocation.toolSpecificData) && (this.toolInvocation.toolSpecificData.missingSandboxDependencies?.length || this.toolInvocation.toolSpecificData.sandboxRemediations?.length)) {
          return this.instantiationService.createInstance(ChatSandboxPrerequisiteConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
        } else if (this.toolInvocation.toolSpecificData?.kind === "terminal") {
          return this.instantiationService.createInstance(ChatTerminalToolConfirmationSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
        } else if (this.toolInvocation.toolSpecificData?.kind === "modifiedFilesConfirmation") {
          return this.instantiationService.createInstance(ChatModifiedFilesConfirmationSubPart, this.toolInvocation, this.context, this.listPool);
        } else if (this.toolInvocation.toolSpecificData?.kind === "agentFeedbackReviewConfirmation") {
          return this.instantiationService.createInstance(ChatAgentFeedbackReviewConfirmationSubPart, this.toolInvocation, this.context);
        } else {
          return this.instantiationService.createInstance(ToolConfirmationSubPart, this.toolInvocation, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
        }
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForAuthentication) {
        return this.instantiationService.createInstance(ChatToolAuthenticationSubPart, this.toolInvocation, this.context);
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        return this.instantiationService.createInstance(ChatToolPostExecuteConfirmationPart, this.toolInvocation, this.context);
      }
    }
    if (this.renderedSessionCreatedResult && this.toolInvocation.toolSpecificData?.kind === "sessionCreated") {
      return this.instantiationService.createInstance(ChatSessionCreatedResultSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
    }
    if (this.renderedGeneratedImageResult && this.toolInvocation.toolSpecificData?.kind === "generatedImage") {
      return this.instantiationService.createInstance(ChatGeneratedImageResultSubPart, this.toolInvocation, this.context);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "automationConfigured") {
      return this.instantiationService.createInstance(ChatAutomationConfiguredResultSubPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "terminal") {
      return this.instantiationService.createInstance(ChatTerminalToolProgressPart, this.toolInvocation, this.toolInvocation.toolSpecificData, this.context, this.renderer, this.editorPool, this.currentWidthDelegate, this.codeBlockStartIndex);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "resources" && this.toolInvocation.toolSpecificData.values.length > 0) {
      return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, this.toolInvocation.toolSpecificData.values, this.listPool);
    }
    if (this.toolInvocation.toolSpecificData?.kind === "simpleToolInvocation") {
      return this.instantiationService.createInstance(
        ChatSimpleToolProgressPart,
        this.toolInvocation,
        this.context,
        this.codeBlockStartIndex,
        this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage,
        this.toolInvocation.originMessage,
        this.toolInvocation.toolSpecificData,
        false
      );
    }
    const resultDetails = IChatToolInvocation.resultDetails(this.toolInvocation);
    if (Array.isArray(resultDetails) && resultDetails.length) {
      return this.instantiationService.createInstance(ChatResultListSubPart, this.toolInvocation, this.context, this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage, resultDetails, this.listPool);
    }
    if (isToolResultOutputDetails(resultDetails)) {
      return this.instantiationService.createInstance(ChatToolOutputSubPart, this.toolInvocation, this.context, this._onDidRemount.event);
    }
    if (isToolResultInputOutputDetails(resultDetails)) {
      return this.instantiationService.createInstance(
        ChatInputOutputMarkdownProgressPart,
        this.toolInvocation,
        this.context,
        this.codeBlockStartIndex,
        this.toolInvocation.pastTenseMessage ?? this.toolInvocation.invocationMessage,
        this.toolInvocation.originMessage,
        resultDetails.input,
        resultDetails.inputLanguage,
        resultDetails.output,
        !!resultDetails.isError
      );
    }
    if (this.toolInvocation.kind === "toolInvocation" && this.toolInvocation.toolSpecificData?.kind === "input" && !IChatToolInvocation.isComplete(this.toolInvocation)) {
      return this.instantiationService.createInstance(
        ChatInputOutputMarkdownProgressPart,
        this.toolInvocation,
        this.context,
        this.codeBlockStartIndex,
        this.toolInvocation.invocationMessage,
        this.toolInvocation.originMessage,
        typeof this.toolInvocation.toolSpecificData.rawInput === "string" ? this.toolInvocation.toolSpecificData.rawInput : JSON.stringify(this.toolInvocation.toolSpecificData.rawInput, null, 2),
        void 0,
        void 0,
        false
      );
    }
    return this.instantiationService.createInstance(ChatToolProgressSubPart, this.toolInvocation, this.context, this.renderer, this.announcedToolProgressKeys);
  }
  /**
   * Gets MCP App render data if this tool invocation has MCP App UI.
   * Returns data from either:
   * - toolSpecificData.mcpAppData (for in-progress tools)
   * - result details mcpOutput (for completed tools)
   */
  getMcpAppRenderData() {
    const toolSpecificData = this.toolInvocation.toolSpecificData;
    if (toolSpecificData?.kind === "input" && toolSpecificData.mcpAppData) {
      const rawInput = typeof toolSpecificData.rawInput === "string" ? toolSpecificData.rawInput : JSON.stringify(toolSpecificData.rawInput, null, 2);
      return {
        ...toolSpecificData.mcpAppData,
        input: rawInput,
        sessionResource: this.context.element.sessionResource
      };
    }
    return void 0;
  }
  onDidRemount() {
    this._onDidRemount.fire();
  }
  hasSameContent(other, followingContent, element) {
    if ((other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolSpecificData?.kind === "subagent" && !other.subAgentInvocationId) {
      return false;
    }
    if ((other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && this.renderedSessionCreatedResult !== shouldRenderSessionCreatedResult(other.toolSpecificData?.kind, isResponseVM(element) && element.isComplete)) {
      return false;
    }
    if ((other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && this.renderedGeneratedImageResult !== shouldRenderGeneratedImageResult(other.toolSpecificData?.kind, isResponseVM(element) && element.isComplete)) {
      return false;
    }
    return (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && this.toolInvocation.toolCallId === other.toolCallId;
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
};
ChatToolInvocationPart = __decorateClass([
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IChatTodoListService)
], ChatToolInvocationPart);
export {
  ChatToolInvocationPart,
  shouldRenderGeneratedImageResult,
  shouldRenderSessionCreatedResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdFRvb2xJbnZvY2F0aW9uUGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgaXNMZWdhY3lDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIFRvb2xDb25maXJtS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlbmRlcmVyQ29udGVudCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRUb2RvTGlzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvY2hhdFRvZG9MaXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMsIGlzVG9vbFJlc3VsdE91dHB1dERldGFpbHMsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdENvZGVCbG9ja0luZm8gfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IEVkaXRvclBvb2wgfSBmcm9tICcuLi9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0LCBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ29sbGFwc2libGVMaXN0UG9vbCB9IGZyb20gJy4uL2NoYXRSZWZlcmVuY2VzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc0luc3RhbGxDb25maXJtYXRpb25XaWRnZXRTdWJQYXJ0IH0gZnJvbSAnLi9jaGF0RXh0ZW5zaW9uc0luc3RhbGxUb29sU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydCB9IGZyb20gJy4vY2hhdElucHV0T3V0cHV0TWFya2Rvd25Qcm9ncmVzc1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdE1jcEFwcFN1YlBhcnQsIElNY3BBcHBSZW5kZXJEYXRhIH0gZnJvbSAnLi9jaGF0TWNwQXBwU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzdWx0TGlzdFN1YlBhcnQgfSBmcm9tICcuL2NoYXRSZXN1bHRMaXN0U3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWRSZXN1bHRTdWJQYXJ0IH0gZnJvbSAnLi9jaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWRSZXN1bHRTdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRHZW5lcmF0ZWRJbWFnZVJlc3VsdFN1YlBhcnQgfSBmcm9tICcuL2NoYXRHZW5lcmF0ZWRJbWFnZVJlc3VsdFN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25DcmVhdGVkUmVzdWx0U3ViUGFydCB9IGZyb20gJy4vY2hhdFNlc3Npb25DcmVhdGVkUmVzdWx0U3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0U2ltcGxlVG9vbFByb2dyZXNzUGFydCB9IGZyb20gJy4vY2hhdFNpbXBsZVRvb2xQcm9ncmVzc1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFNhbmRib3hQcmVyZXF1aXNpdGVDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0U2FuZGJveFByZXJlcXVpc2l0ZUNvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0QWdlbnRGZWVkYmFja1Jldmlld0NvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRlcm1pbmFsVG9vbENvbmZpcm1hdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQgfSBmcm9tICcuL2NoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xBdXRoZW50aWNhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sQXV0aGVudGljYXRpb25TdWJQYXJ0LmpzJztcbmltcG9ydCB7IFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sSW52b2NhdGlvblN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xPdXRwdXRTdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbE91dHB1dFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xQb3N0RXhlY3V0ZUNvbmZpcm1hdGlvblBhcnQgfSBmcm9tICcuL2NoYXRUb29sUG9zdEV4ZWN1dGVDb25maXJtYXRpb25QYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0IH0gZnJvbSAnLi9jaGF0VG9vbFByb2dyZXNzUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbFN0cmVhbWluZ1N1YlBhcnQgfSBmcm9tICcuL2NoYXRUb29sU3RyZWFtaW5nU3ViUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0T3RoZXJDbGllbnRUb29sUHJvZ3Jlc3NQYXJ0IH0gZnJvbSAnLi9jaGF0T3RoZXJDbGllbnRUb29sUHJvZ3Jlc3NQYXJ0LmpzJztcblxuLyoqXG4gKiBWYWx1ZSBlcXVhbGl0eSBmb3Ige0BsaW5rIElNY3BBcHBSZW5kZXJEYXRhfSwgdXNlZCBzbyB0aGUgQXBwJ3MgZGVyaXZlZFxuICogcmVuZGVyIGRhdGEgc3RheXMgc3RhYmxlIGFjcm9zcyBzdGF0ZSB0aWNrcyB0aGF0IGRvbid0IGFjdHVhbGx5IGNoYW5nZSB3aGF0XG4gKiB0aGUgd2VidmlldyByZW5kZXJzIFx1MjAxNCBvdGhlcndpc2UgcmUtcmVhZGluZyBgc3RhdGVgICh0byByZWFjdCB0byBpbi1wbGFjZVxuICogYHRvb2xTcGVjaWZpY0RhdGFgIG11dGF0aW9ucykgd291bGQgcmVjcmVhdGUgdGhlIHdlYnZpZXcgb24gZXZlcnkgcHJvZ3Jlc3NcbiAqIHVwZGF0ZS5cbiAqL1xuZnVuY3Rpb24gbWNwQXBwUmVuZGVyRGF0YUVxdWFscyhhOiBJTWNwQXBwUmVuZGVyRGF0YSB8IHVuZGVmaW5lZCwgYjogSU1jcEFwcFJlbmRlckRhdGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0aWYgKGEgPT09IGIpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoIWEgfHwgIWIpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGEua2luZCAhPT0gYi5raW5kIHx8IGEucmVzb3VyY2VVcmkgIT09IGIucmVzb3VyY2VVcmkgfHwgYS5pbnB1dCAhPT0gYi5pbnB1dCB8fCBhLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpICE9PSBiLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmIChhLmtpbmQgPT09ICdhZ2VudEhvc3QnICYmIGIua2luZCA9PT0gJ2FnZW50SG9zdCcpIHtcblx0XHRyZXR1cm4gYS5zZXJ2ZXJJZCA9PT0gYi5zZXJ2ZXJJZCAmJiBhLmNoYW5uZWwgPT09IGIuY2hhbm5lbDtcblx0fVxuXHRpZiAoYS5raW5kID09PSAnbG9jYWwnICYmIGIua2luZCA9PT0gJ2xvY2FsJykge1xuXHRcdHJldHVybiBhLnNlcnZlckRlZmluaXRpb25JZCA9PT0gYi5zZXJ2ZXJEZWZpbml0aW9uSWQgJiYgYS5jb2xsZWN0aW9uSWQgPT09IGIuY29sbGVjdGlvbklkO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFJlbmRlclNlc3Npb25DcmVhdGVkUmVzdWx0KHRvb2xTcGVjaWZpY0RhdGFLaW5kOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzUmVzcG9uc2VDb21wbGV0ZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdG9vbFNwZWNpZmljRGF0YUtpbmQgPT09ICdzZXNzaW9uQ3JlYXRlZCcgJiYgaXNSZXNwb25zZUNvbXBsZXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkUmVuZGVyR2VuZXJhdGVkSW1hZ2VSZXN1bHQodG9vbFNwZWNpZmljRGF0YUtpbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgaXNSZXNwb25zZUNvbXBsZXRlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiB0b29sU3BlY2lmaWNEYXRhS2luZCA9PT0gJ2dlbmVyYXRlZEltYWdlJyAmJiBpc1Jlc3BvbnNlQ29tcGxldGU7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0VG9vbEludm9jYXRpb25QYXJ0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0Q29udGVudFBhcnQge1xuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHVibGljIGdldCB0b29sQ2FsbElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudG9vbEludm9jYXRpb24udG9vbENhbGxJZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY29kZWJsb2NrcygpOiBJQ2hhdENvZGVCbG9ja0luZm9bXSB7XG5cdFx0Y29uc3QgY29kZWJsb2NrcyA9IHRoaXMuc3ViUGFydD8uY29kZWJsb2NrcyA/PyBbXTtcblx0XHRpZiAodGhpcy5tY3BBcHBQYXJ0KSB7XG5cdFx0XHRjb2RlYmxvY2tzLnB1c2goLi4udGhpcy5tY3BBcHBQYXJ0LnZhbHVlPy5jb2RlYmxvY2tzID8/IFtdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvZGVibG9ja3M7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3NQYXJ0SWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zdWJQYXJ0Py5jb2RlYmxvY2tzUGFydElkO1xuXHR9XG5cblx0cHJpdmF0ZSBzdWJQYXJ0ITogQmFzZUNoYXRUb29sSW52b2NhdGlvblN1YlBhcnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWNwQXBwUGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0TWNwQXBwU3ViUGFydD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcmVuZGVyZWRTZXNzaW9uQ3JlYXRlZFJlc3VsdDogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlZEdlbmVyYXRlZEltYWdlUmVzdWx0OiBib29sZWFuO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3VudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZUhlaWdodC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxpc3RQb29sOiBDb2xsYXBzaWJsZUxpc3RQb29sLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUG9vbDogRWRpdG9yUG9vbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGN1cnJlbnRXaWR0aERlbGVnYXRlOiAoKSA9PiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzOiBTZXQ8c3RyaW5nPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRUb2RvTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0VG9kb0xpc3RTZXJ2aWNlOiBJQ2hhdFRvZG9MaXN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVuZGVyZWRTZXNzaW9uQ3JlYXRlZFJlc3VsdCA9IHNob3VsZFJlbmRlclNlc3Npb25DcmVhdGVkUmVzdWx0KFxuXHRcdFx0dG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCxcblx0XHRcdGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbnRleHQuZWxlbWVudC5pc0NvbXBsZXRlLFxuXHRcdCk7XG5cdFx0dGhpcy5yZW5kZXJlZEdlbmVyYXRlZEltYWdlUmVzdWx0ID0gc2hvdWxkUmVuZGVyR2VuZXJhdGVkSW1hZ2VSZXN1bHQoXG5cdFx0XHR0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLFxuXHRcdFx0aXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY29udGV4dC5lbGVtZW50LmlzQ29tcGxldGUsXG5cdFx0KTtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLmNoYXQtdG9vbC1pbnZvY2F0aW9uLXBhcnQnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZ2VuZXJhdGVkLWltYWdlLXRvb2wtaW52b2NhdGlvbicsIHRoaXMucmVuZGVyZWRHZW5lcmF0ZWRJbWFnZVJlc3VsdCk7XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9PT0gJ2hpZGRlbicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIHRvZG8gbGlzdCBzZXJ2aWNlIGlmIHRoaXMgdG9vbCBpbnZvY2F0aW9uIGNvbnRhaW5zIHRvZG8gZGF0YVxuXHRcdGlmICh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndG9kb0xpc3QnKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0Y29uc3QgdG9kb3MgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnRvZG9MaXN0Lm1hcCgodG9kbywgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkSWQgPSBwYXJzZUludCh0b2RvLmlkLCAxMCk7XG5cdFx0XHRcdGNvbnN0IGlkID0gTnVtYmVyLmlzTmFOKHBhcnNlZElkKSA/IGluZGV4ICsgMSA6IHBhcnNlZElkO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHRpdGxlOiB0b2RvLnRpdGxlLFxuXHRcdFx0XHRcdHN0YXR1czogdG9kby5zdGF0dXMgYXMgJ25vdC1zdGFydGVkJyB8ICdpbi1wcm9ncmVzcycgfCAnY29tcGxldGVkJ1xuXHRcdFx0XHR9O1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNoYXRUb2RvTGlzdFNlcnZpY2Uuc2V0VG9kb3Moc2Vzc2lvblJlc291cmNlLCB0b2Rvcyk7XG5cdFx0fVxuXG5cdFx0bGV0IGFwcERhdGE6IElPYnNlcnZhYmxlPElNY3BBcHBSZW5kZXJEYXRhIHwgdW5kZWZpbmVkPiA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbi5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRsZXQgcHJldmlvdXNTdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0bGV0IHByZXZpb3VzRGF0YUtpbmQgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhS2luZC5nZXQoKTtcblx0XHRcdGxldCBwcmV2aW91c1Rvb2xTcGVjaWZpY0RhdGEgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgZGF0YUtpbmQgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhS2luZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGEgPSB0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhO1xuXHRcdFx0XHRjb25zdCBzdGF0ZUNoYW5nZWQgPSBzdGF0ZS50eXBlICE9PSBwcmV2aW91c1N0YXRlLnR5cGU7XG5cdFx0XHRcdGNvbnN0IGRhdGFLaW5kQ2hhbmdlZCA9IGRhdGFLaW5kICE9PSBwcmV2aW91c0RhdGFLaW5kO1xuXHRcdFx0XHRjb25zdCBkYXRhQ2hhbmdlZCA9IHN0YXRlICE9PSBwcmV2aW91c1N0YXRlICYmIHRvb2xTcGVjaWZpY0RhdGEgIT09IHByZXZpb3VzVG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdFx0Y29uc3QgY29uZmlybWF0aW9uTWVzc2FnZXNDaGFuZ2VkID0gc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvblxuXHRcdFx0XHRcdCYmIHByZXZpb3VzU3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvblxuXHRcdFx0XHRcdCYmIHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzICE9PSBwcmV2aW91c1N0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzO1xuXHRcdFx0XHRwcmV2aW91c1N0YXRlID0gc3RhdGU7XG5cdFx0XHRcdHByZXZpb3VzRGF0YUtpbmQgPSBkYXRhS2luZDtcblx0XHRcdFx0cHJldmlvdXNUb29sU3BlY2lmaWNEYXRhID0gdG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdFx0aWYgKHN0YXRlQ2hhbmdlZCB8fCBkYXRhS2luZENoYW5nZWQgfHwgZGF0YUNoYW5nZWQgfHwgY29uZmlybWF0aW9uTWVzc2FnZXNDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmVuZGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0YXBwRGF0YSA9IGRlcml2ZWRPcHRzPElNY3BBcHBSZW5kZXJEYXRhIHwgdW5kZWZpbmVkPih7XG5cdFx0XHRcdG93bmVyOiB0aGlzLFxuXHRcdFx0XHRlcXVhbHNGbjogbWNwQXBwUmVuZGVyRGF0YUVxdWFscyxcblx0XHRcdH0sIHJlYWRlciA9PiB7XG5cdFx0XHRcdC8vIFJlYWQgYHN0YXRlYCBhbG9uZ3NpZGUgYHRvb2xTcGVjaWZpY0RhdGFLaW5kYCBzbyB0aGUgQXBwXG5cdFx0XHRcdC8vIHJlLWRlcml2ZXMgd2hlbiBgdG9vbFNwZWNpZmljRGF0YWAgaXMgbXV0YXRlZCBpbiBwbGFjZSBcdTIwMTQgZS5nLlxuXHRcdFx0XHQvLyBgbWNwQXBwRGF0YWAgYXR0YWNoZWQgb24gdGhlIGNvbmZpcm1hdGlvbiAtPiBydW5uaW5nXG5cdFx0XHRcdC8vIHRyYW5zaXRpb24sIHdoaWNoIGJ1bXBzIGBzdGF0ZWAgdmlhXG5cdFx0XHRcdC8vIGBub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpYCBidXQgbGVhdmVzIHRoZSBraW5kIChgaW5wdXRgKVxuXHRcdFx0XHQvLyB1bmNoYW5nZWQuIGBlcXVhbHNGbmAga2VlcHMgdGhlIHdlYnZpZXcgc3RhYmxlIGFjcm9zcyBzdGF0ZVxuXHRcdFx0XHQvLyB0aWNrcyB0aGF0IGRvbid0IGNoYW5nZSB0aGUgcmVuZGVyIGRhdGEuXG5cdFx0XHRcdHJlYWRlci5yZWFkT2JzZXJ2YWJsZSh0b29sSW52b2NhdGlvbi5zdGF0ZSk7XG5cdFx0XHRcdHJlYWRlci5yZWFkT2JzZXJ2YWJsZSh0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhS2luZCk7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdldE1jcEFwcFJlbmRlckRhdGEoKTtcblx0XHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG91dGNvbWUgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLmV4ZWN1dGlvbkNvbmZpcm1lZE9yRGVuaWVkKHRvb2xJbnZvY2F0aW9uLCByZWFkZXIpO1xuXHRcdFx0XHRyZXR1cm4gISFvdXRjb21lICYmIG91dGNvbWUudHlwZSAhPT0gVG9vbENvbmZpcm1LaW5kLkRlbmllZCAmJiBvdXRjb21lLnR5cGUgIT09IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkID8gZGF0YSA6IHVuZGVmaW5lZDtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBkYXRhID0gdGhpcy5nZXRNY3BBcHBSZW5kZXJEYXRhKCk7XG5cdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRjb25zdCBvdXRjb21lID0gSUNoYXRUb29sSW52b2NhdGlvbi5leGVjdXRpb25Db25maXJtZWRPckRlbmllZCh0b29sSW52b2NhdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YXBwRGF0YSA9IGNvbnN0T2JzZXJ2YWJsZSghIW91dGNvbWUgJiYgb3V0Y29tZS50eXBlICE9PSBUb29sQ29uZmlybUtpbmQuRGVuaWVkICYmIG91dGNvbWUudHlwZSAhPT0gVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgPyBkYXRhIDogdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUaGlzIHBhcnQgaXMgYSBiaXQgZGlmZmVyZW50LCBzaW5jZSBJQ2hhdFRvb2xJbnZvY2F0aW9uIGlzIG5vdCBhbiBpbW11dGFibGUgbW9kZWwgb2JqZWN0LiBTbyB0aGlzIHBhcnQgaXMgYWJsZSB0byByZXJlbmRlciBpdHNlbGYuXG5cdFx0Ly8gSWYgdGhpcyB0dXJucyBvdXQgdG8gYmUgYSB0eXBpY2FsIHBhdHRlcm4sIHdlIGNvdWxkIGNvbWUgdXAgd2l0aCBhIG1vcmUgcmV1c2FibGUgcGF0dGVybiwgbGlrZSB0ZWxsaW5nIHRoZSBsaXN0IHRvIHJlcmVuZGVyIGFuIGVsZW1lbnRcblx0XHQvLyB3aGVuIHRoZSBtb2RlbCBjaGFuZ2VzLCBvciB0cnlpbmcgdG8gbWFrZSB0aGUgbW9kZWwgaW1tdXRhYmxlIGFuZCBzd2FwIG91dCBvbmUgY29udGVudCBwYXJ0IGZvciBhIG5ldyBvbmUgYmFzZWQgb24gdXNlciBhY3Rpb25zIGluIHRoZSB2aWV3LlxuXHRcdC8vIE5vdGUgdGhhdCBgbm9kZS5yZXBsYWNlV2l0aGAgaXMgdXNlZCB0byBlbnN1cmUgb3JkZXIgaXMgcHJlc2VydmVkIHdoZW4gYW4gbXBjIGFwcCBpcyBwcmVzZW50LlxuXHRcdGNvbnN0IHBhcnRTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IHN1YlBhcnREb21Ob2RlOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZChzdWJQYXJ0RG9tTm9kZSk7XG5cblx0XHRjb25zdCByZW5kZXIgPSAoKSA9PiB7XG5cdFx0XHRwYXJ0U3RvcmUuY2xlYXIoKTtcblxuXHRcdFx0aWYgKHRvb2xJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9PT0gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuIHx8ICh0b29sSW52b2NhdGlvbi5wcmVzZW50YXRpb24gPT09IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGUgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRvb2xJbnZvY2F0aW9uKSkpIHtcblx0XHRcdFx0ZG9tLmhpZGUodGhpcy5kb21Ob2RlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRkb20uc2hvdyh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5zdWJQYXJ0ID0gcGFydFN0b3JlLmFkZCh0aGlzLmNyZWF0ZVRvb2xJbnZvY2F0aW9uU3ViUGFydCgpKTtcblx0XHRcdHN1YlBhcnREb21Ob2RlLnJlcGxhY2VXaXRoKHRoaXMuc3ViUGFydC5kb21Ob2RlKTtcblx0XHRcdHN1YlBhcnREb21Ob2RlID0gdGhpcy5zdWJQYXJ0LmRvbU5vZGU7XG5cblx0XHRcdC8vIEFkZCBjbGFzcyB3aGVuIGRpc3BsYXlpbmcgYSBjb25maXJtYXRpb24gd2lkZ2V0XG5cdFx0XHRjb25zdCBpc0NvbmZpcm1hdGlvbiA9IHRoaXMuc3ViUGFydCBpbnN0YW5jZW9mIFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IHx8XG5cdFx0XHRcdHRoaXMuc3ViUGFydCBpbnN0YW5jZW9mIENoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0IHx8XG5cdFx0XHRcdHRoaXMuc3ViUGFydCBpbnN0YW5jZW9mIENoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uU3ViUGFydCB8fFxuXHRcdFx0XHR0aGlzLnN1YlBhcnQgaW5zdGFuY2VvZiBDaGF0U2FuZGJveFByZXJlcXVpc2l0ZUNvbmZpcm1hdGlvblN1YlBhcnQgfHxcblx0XHRcdFx0dGhpcy5zdWJQYXJ0IGluc3RhbmNlb2YgRXh0ZW5zaW9uc0luc3RhbGxDb25maXJtYXRpb25XaWRnZXRTdWJQYXJ0IHx8XG5cdFx0XHRcdHRoaXMuc3ViUGFydCBpbnN0YW5jZW9mIENoYXRUb29sQXV0aGVudGljYXRpb25TdWJQYXJ0IHx8XG5cdFx0XHRcdHRoaXMuc3ViUGFydCBpbnN0YW5jZW9mIENoYXRUb29sUG9zdEV4ZWN1dGVDb25maXJtYXRpb25QYXJ0O1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1jb25maXJtYXRpb24nLCBpc0NvbmZpcm1hdGlvbik7XG5cblx0XHRcdHBhcnRTdG9yZS5hZGQodGhpcy5zdWJQYXJ0Lm9uTmVlZHNSZXJlbmRlcihyZW5kZXIpKTtcblx0XHRcdGlmICh0aGlzLnN1YlBhcnQgaW5zdGFuY2VvZiBDaGF0R2VuZXJhdGVkSW1hZ2VSZXN1bHRTdWJQYXJ0KSB7XG5cdFx0XHRcdHBhcnRTdG9yZS5hZGQodGhpcy5zdWJQYXJ0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlSGVpZ2h0LmZpcmUoKSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgYXBwRG9tTm9kZTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kQ2hpbGQoYXBwRG9tTm9kZSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgZGF0YSA9IGFwcERhdGEucmVhZChyKTtcblx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHR0aGlzLm1jcEFwcFBhcnQuY2xlYXIoKTtcblx0XHRcdFx0ZG9tLmNsZWFyTm9kZShhcHBEb21Ob2RlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm1jcEFwcFBhcnQudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0TWNwQXBwU3ViUGFydCxcblx0XHRcdFx0dGhpcy50b29sSW52b2NhdGlvbixcblx0XHRcdFx0dGhpcy5fb25EaWRSZW1vdW50LmV2ZW50LFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHRkYXRhLFxuXHRcdFx0KTtcblxuXHRcdFx0YXBwRG9tTm9kZS5yZXBsYWNlV2l0aCh0aGlzLm1jcEFwcFBhcnQudmFsdWUuZG9tTm9kZSk7XG5cdFx0XHRhcHBEb21Ob2RlID0gdGhpcy5tY3BBcHBQYXJ0LnZhbHVlLmRvbU5vZGU7XG5cdFx0fSkpO1xuXG5cdFx0cmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRvb2xJbnZvY2F0aW9uU3ViUGFydCgpOiBCYXNlQ2hhdFRvb2xJbnZvY2F0aW9uU3ViUGFydCB7XG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb24ua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb24ub3RoZXJDbGllbnRUb29sQ2FsbCAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHRoaXMudG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRPdGhlckNsaWVudFRvb2xQcm9ncmVzc1BhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMucmVuZGVyZXIsIHRoaXMuYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnZXh0ZW5zaW9ucycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXh0ZW5zaW9uc0luc3RhbGxDb25maXJtYXRpb25XaWRnZXRTdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXG5cdFx0XHQvLyBIYW5kbGUgc3RyZWFtaW5nIHN0YXRlIC0gc2hvdyBzdHJlYW1pbmcgcHJvZ3Jlc3Ncblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRvb2xTdHJlYW1pbmdTdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQsIHRoaXMucmVuZGVyZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0XHRpZiAodGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnICYmICFpc0xlZ2FjeUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpICYmICh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubWlzc2luZ1NhbmRib3hEZXBlbmRlbmNpZXM/Lmxlbmd0aCB8fCB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuc2FuZGJveFJlbWVkaWF0aW9ucz8ubGVuZ3RoKSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTYW5kYm94UHJlcmVxdWlzaXRlQ29uZmlybWF0aW9uU3ViUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB0aGlzLmNvbnRleHQsIHRoaXMucmVuZGVyZXIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUZXJtaW5hbFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHRoaXMuY29udGV4dCwgdGhpcy5yZW5kZXJlciwgdGhpcy5lZGl0b3JQb29sLCB0aGlzLmN1cnJlbnRXaWR0aERlbGVnYXRlLCB0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ21vZGlmaWVkRmlsZXNDb25maXJtYXRpb24nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25TdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQsIHRoaXMubGlzdFBvb2wpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2FnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb24nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25TdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRvb2xDb25maXJtYXRpb25TdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQsIHRoaXMucmVuZGVyZXIsIHRoaXMuZWRpdG9yUG9vbCwgdGhpcy5jdXJyZW50V2lkdGhEZWxlZ2F0ZSwgdGhpcy5jb2RlQmxvY2tTdGFydEluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VG9vbEF1dGhlbnRpY2F0aW9uU3ViUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy5jb250ZXh0KTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUb29sUG9zdEV4ZWN1dGVDb25maXJtYXRpb25QYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLnJlbmRlcmVkU2Vzc2lvbkNyZWF0ZWRSZXN1bHQgJiYgdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc2Vzc2lvbkNyZWF0ZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvbkNyZWF0ZWRSZXN1bHRTdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHRoaXMuY29udGV4dCwgdGhpcy5yZW5kZXJlcik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucmVuZGVyZWRHZW5lcmF0ZWRJbWFnZVJlc3VsdCAmJiB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdnZW5lcmF0ZWRJbWFnZScpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRHZW5lcmF0ZWRJbWFnZVJlc3VsdFN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2F1dG9tYXRpb25Db25maWd1cmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEF1dG9tYXRpb25Db25maWd1cmVkUmVzdWx0U3ViUGFydCwgdGhpcy50b29sSW52b2NhdGlvbiwgdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB0aGlzLmNvbnRleHQsIHRoaXMucmVuZGVyZXIpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUZXJtaW5hbFRvb2xQcm9ncmVzc1BhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwgdGhpcy5jb250ZXh0LCB0aGlzLnJlbmRlcmVyLCB0aGlzLmVkaXRvclBvb2wsIHRoaXMuY3VycmVudFdpZHRoRGVsZWdhdGUsIHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Jlc291cmNlcycgJiYgdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnZhbHVlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVzdWx0TGlzdFN1YlBhcnQsIHRoaXMudG9vbEludm9jYXRpb24sIHRoaXMuY29udGV4dCwgdGhpcy50b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID8/IHRoaXMudG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UsIHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS52YWx1ZXMsIHRoaXMubGlzdFBvb2wpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzaW1wbGVUb29sSW52b2NhdGlvbicpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0U2ltcGxlVG9vbFByb2dyZXNzUGFydCxcblx0XHRcdFx0dGhpcy50b29sSW52b2NhdGlvbixcblx0XHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0XHR0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA/PyB0aGlzLnRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLm9yaWdpbk1lc3NhZ2UsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXHRcdH1cblxuXG5cdFx0Y29uc3QgcmVzdWx0RGV0YWlscyA9IElDaGF0VG9vbEludm9jYXRpb24ucmVzdWx0RGV0YWlscyh0aGlzLnRvb2xJbnZvY2F0aW9uKTtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShyZXN1bHREZXRhaWxzKSAmJiByZXN1bHREZXRhaWxzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlc3VsdExpc3RTdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQsIHRoaXMudG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA/PyB0aGlzLnRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLCByZXN1bHREZXRhaWxzLCB0aGlzLmxpc3RQb29sKTtcblx0XHR9XG5cblx0XHRpZiAoaXNUb29sUmVzdWx0T3V0cHV0RGV0YWlscyhyZXN1bHREZXRhaWxzKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRvb2xPdXRwdXRTdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQsIHRoaXMuX29uRGlkUmVtb3VudC5ldmVudCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyhyZXN1bHREZXRhaWxzKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRJbnB1dE91dHB1dE1hcmtkb3duUHJvZ3Jlc3NQYXJ0LFxuXHRcdFx0XHR0aGlzLnRvb2xJbnZvY2F0aW9uLFxuXHRcdFx0XHR0aGlzLmNvbnRleHQsXG5cdFx0XHRcdHRoaXMuY29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdFx0dGhpcy50b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID8/IHRoaXMudG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24ub3JpZ2luTWVzc2FnZSxcblx0XHRcdFx0cmVzdWx0RGV0YWlscy5pbnB1dCxcblx0XHRcdFx0cmVzdWx0RGV0YWlscy5pbnB1dExhbmd1YWdlLFxuXHRcdFx0XHRyZXN1bHREZXRhaWxzLm91dHB1dCxcblx0XHRcdFx0ISFyZXN1bHREZXRhaWxzLmlzRXJyb3IsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUodGhpcy50b29sSW52b2NhdGlvbikpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0SW5wdXRPdXRwdXRNYXJrZG93blByb2dyZXNzUGFydCxcblx0XHRcdFx0dGhpcy50b29sSW52b2NhdGlvbixcblx0XHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0XHR0aGlzLmNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdHRoaXMudG9vbEludm9jYXRpb24ub3JpZ2luTWVzc2FnZSxcblx0XHRcdFx0dHlwZW9mIHRoaXMudG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5yYXdJbnB1dCA9PT0gJ3N0cmluZycgPyB0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQgOiBKU09OLnN0cmluZ2lmeSh0aGlzLnRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEucmF3SW5wdXQsIG51bGwsIDIpLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUb29sUHJvZ3Jlc3NTdWJQYXJ0LCB0aGlzLnRvb2xJbnZvY2F0aW9uLCB0aGlzLmNvbnRleHQsIHRoaXMucmVuZGVyZXIsIHRoaXMuYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cyk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBNQ1AgQXBwIHJlbmRlciBkYXRhIGlmIHRoaXMgdG9vbCBpbnZvY2F0aW9uIGhhcyBNQ1AgQXBwIFVJLlxuXHQgKiBSZXR1cm5zIGRhdGEgZnJvbSBlaXRoZXI6XG5cdCAqIC0gdG9vbFNwZWNpZmljRGF0YS5tY3BBcHBEYXRhIChmb3IgaW4tcHJvZ3Jlc3MgdG9vbHMpXG5cdCAqIC0gcmVzdWx0IGRldGFpbHMgbWNwT3V0cHV0IChmb3IgY29tcGxldGVkIHRvb2xzKVxuXHQgKi9cblx0cHJpdmF0ZSBnZXRNY3BBcHBSZW5kZXJEYXRhKCk6IElNY3BBcHBSZW5kZXJEYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhID0gdGhpcy50b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhO1xuXHRcdGlmICh0b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnICYmIHRvb2xTcGVjaWZpY0RhdGEubWNwQXBwRGF0YSkge1xuXHRcdFx0Y29uc3QgcmF3SW5wdXQgPSB0eXBlb2YgdG9vbFNwZWNpZmljRGF0YS5yYXdJbnB1dCA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyB0b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0XG5cdFx0XHRcdDogSlNPTi5zdHJpbmdpZnkodG9vbFNwZWNpZmljRGF0YS5yYXdJbnB1dCwgbnVsbCwgMik7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnRvb2xTcGVjaWZpY0RhdGEubWNwQXBwRGF0YSxcblx0XHRcdFx0aW5wdXQ6IHJhd0lucHV0LFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG9uRGlkUmVtb3VudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFJlbW91bnQuZmlyZSgpO1xuXHR9XG5cblx0aGFzU2FtZUNvbnRlbnQob3RoZXI6IElDaGF0UmVuZGVyZXJDb250ZW50LCBmb2xsb3dpbmdDb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBlbGVtZW50OiBDaGF0VHJlZUl0ZW0pOiBib29sZWFuIHtcblx0XHRpZiAoKG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgb3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpXG5cdFx0XHQmJiBvdGhlci50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnXG5cdFx0XHQmJiAhb3RoZXIuc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKChvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKVxuXHRcdFx0JiYgdGhpcy5yZW5kZXJlZFNlc3Npb25DcmVhdGVkUmVzdWx0ICE9PSBzaG91bGRSZW5kZXJTZXNzaW9uQ3JlYXRlZFJlc3VsdChvdGhlci50b29sU3BlY2lmaWNEYXRhPy5raW5kLCBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgZWxlbWVudC5pc0NvbXBsZXRlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoKG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgb3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpXG5cdFx0XHQmJiB0aGlzLnJlbmRlcmVkR2VuZXJhdGVkSW1hZ2VSZXN1bHQgIT09IHNob3VsZFJlbmRlckdlbmVyYXRlZEltYWdlUmVzdWx0KG90aGVyLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsIGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiBlbGVtZW50LmlzQ29tcGxldGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgdGhpcy50b29sSW52b2NhdGlvbi50b29sQ2FsbElkID09PSBvdGhlci50b29sQ2FsbElkO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLGlCQUE4Qix5QkFBeUI7QUFDNUUsU0FBUyxTQUFTLGlCQUFpQixtQkFBZ0M7QUFDbkUsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxxQkFBb0Qsd0NBQXdDLHVCQUF1QjtBQUM1SCxTQUErQixvQkFBb0I7QUFDbkQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQ0FBZ0MsMkJBQTJCLGtDQUFrQztBQUt0RyxTQUFTLGtEQUFrRDtBQUMzRCxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHlCQUE0QztBQUNyRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZDQUE2QztBQUN0RCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGtEQUFrRDtBQUMzRCxT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
