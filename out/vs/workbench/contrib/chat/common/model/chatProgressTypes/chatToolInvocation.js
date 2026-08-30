import { encodeBase64 } from "../../../../../../base/common/buffer.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { localize } from "../../../../../../nls.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../chatService/chatService.js";
import { isToolResultOutputDetails } from "../../tools/languageModelToolsService.js";
class ChatToolInvocation {
  constructor(preparedInvocation, toolData, toolCallId, subAgentInvocationId, parameters, startOptions = {}, chatRequestId) {
    this.toolCallId = toolCallId;
    this.kind = "toolInvocation";
    this.isAttachedToThinking = false;
    this._toolSpecificDataKind = observableValue(this, void 0);
    this.toolSpecificDataKind = this._toolSpecificDataKind;
    this._progress = observableValue(this, { progress: 0 });
    // Streaming-related observables
    this._partialInput = observableValue(this, void 0);
    this._streamingMessage = observableValue(this, void 0);
    let defaultMessage = "";
    if (startOptions.startInStreaming) {
      defaultMessage = toolData.displayName;
    } else if (startOptions.startInCancelled) {
      defaultMessage = startOptions.cancelReasonMessage ?? localize("toolDeniedMessage", 'Tool "{0}" was denied', toolData.displayName);
    }
    this.invocationMessage = preparedInvocation?.invocationMessage ?? defaultMessage;
    this.pastTenseMessage = preparedInvocation?.pastTenseMessage;
    this.originMessage = preparedInvocation?.originMessage;
    this.confirmationMessages = preparedInvocation?.confirmationMessages;
    this.presentation = preparedInvocation?.presentation;
    this.toolSpecificData = preparedInvocation?.toolSpecificData;
    this.toolId = toolData.id;
    this.icon = preparedInvocation?.icon ?? (toolData.icon && ThemeIcon.isThemeIcon(toolData.icon) ? toolData.icon : void 0);
    this.source = toolData.source;
    this.subAgentInvocationId = subAgentInvocationId;
    this.parameters = parameters;
    this.chatRequestId = chatRequestId;
    if (startOptions.startInCancelled) {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: startOptions.cancelReason ?? ToolConfirmKind.Denied,
        reasonMessage: startOptions.cancelReasonMessage,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      });
    } else if (startOptions.startInStreaming) {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.Streaming,
        partialInput: this._partialInput,
        streamingMessage: this._streamingMessage
      });
    } else if (!this.confirmationMessages?.title) {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.Executing,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: this.confirmationMessages?.confirmationNotNeededReason },
        progress: this._progress,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      });
    } else {
      this._state = observableValue(this, {
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages,
        confirm: (reason) => this._confirm(reason)
      });
    }
  }
  get toolSpecificData() {
    return this._toolSpecificData;
  }
  set toolSpecificData(value) {
    this._toolSpecificData = value;
    this._toolSpecificDataKind.set(value?.kind, void 0);
  }
  get state() {
    return this._state;
  }
  /**
   * Create a tool invocation in streaming state.
   * Use this when the tool call is beginning to stream partial input from the LM.
   */
  static createStreaming(options) {
    return new ChatToolInvocation(void 0, options.toolData, options.toolCallId, options.subagentInvocationId, void 0, { startInStreaming: true }, options.chatRequestId);
  }
  /**
   * Create a tool invocation already in cancelled state.
   * Use this when a hook denies tool execution before it even starts.
   */
  static createCancelled(options, parameters, reason, reasonMessage) {
    return new ChatToolInvocation(void 0, options.toolData, options.toolCallId, options.subagentInvocationId, parameters, { startInCancelled: true, cancelReason: reason, cancelReasonMessage: reasonMessage }, options.chatRequestId);
  }
  /**
   * Shared confirmation handler used by every `WaitingForConfirmation` state
   * this invocation can enter (initial construction, transition out of
   * streaming, and re-arming via {@link requestConfirmation}). Denials/skips
   * cancel; anything else moves to executing.
   */
  _confirm(reason) {
    if (reason.type === ToolConfirmKind.Denied || reason.type === ToolConfirmKind.Skipped) {
      this._state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: reason.type,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
    } else {
      this._state.set({
        type: IChatToolInvocation.StateKind.Executing,
        confirmed: reason,
        progress: this._progress,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
    }
  }
  /**
   * Update the partial input observable during streaming.
   */
  updatePartialInput(input) {
    if (this._state.get().type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    this._partialInput.set(input, void 0);
  }
  /**
   * Update the streaming message (from handleToolStream).
   */
  updateStreamingMessage(message) {
    const state = this._state.get();
    if (state.type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    this._streamingMessage.set(message, void 0);
  }
  /**
   * Notifies state observers that `toolSpecificData` has been mutated.
   * Since `toolSpecificData` isn't observable, this re-sets the internal
   * state to trigger autoruns that need to re-read tool metadata.
   */
  notifyToolSpecificDataChanged() {
    const current = this._state.get();
    this._state.set({ ...current }, void 0);
  }
  updateConfirmationMessages(confirmationMessages) {
    const current = this._state.get();
    if (current.type !== IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return;
    }
    this.confirmationMessages = confirmationMessages;
    this._state.set({ ...current, confirmationMessages }, void 0);
  }
  /**
   * Cancel a streaming invocation directly (e.g., when preToolUse hook denies).
   * Only works when in Streaming state.
   * @returns true if the cancellation was applied, false if not in streaming state
   */
  cancelFromStreaming(reason, reasonMessage) {
    const currentState = this._state.get();
    if (currentState.type !== IChatToolInvocation.StateKind.Streaming) {
      return false;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.Cancelled,
      reason,
      reasonMessage,
      parameters: this.parameters,
      confirmationMessages: this.confirmationMessages
    }, void 0);
    return true;
  }
  /**
   * Transition from streaming state to prepared/executing state.
   * Called when the full tool call is ready.
   */
  transitionFromStreaming(preparedInvocation, parameters, autoConfirmed) {
    const currentState = this._state.get();
    if (currentState.type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    const lastStreamingMessage = this._streamingMessage.get();
    if (lastStreamingMessage && !preparedInvocation?.invocationMessage) {
      this.invocationMessage = lastStreamingMessage;
    }
    this._updatePreparedInvocation(preparedInvocation, parameters);
    if (autoConfirmed) {
      this._confirm(autoConfirmed);
    } else if (!this.confirmationMessages?.title) {
      this._state.set({
        type: IChatToolInvocation.StateKind.Executing,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: this.confirmationMessages?.confirmationNotNeededReason },
        progress: this._progress,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
    } else {
      this._state.set({
        type: IChatToolInvocation.StateKind.WaitingForConfirmation,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages,
        confirm: (reason) => this._confirm(reason)
      }, void 0);
    }
  }
  /**
   * Applies locally prepared parameters and presentation without changing an
   * invocation state already established by an external protocol.
   */
  updatePreparedInvocation(preparedInvocation, parameters) {
    const currentState = this._state.get();
    if (currentState.type === IChatToolInvocation.StateKind.Streaming || currentState.type === IChatToolInvocation.StateKind.Completed || currentState.type === IChatToolInvocation.StateKind.Cancelled) {
      return false;
    }
    this._updatePreparedInvocation(preparedInvocation, parameters);
    this._state.set({
      ...currentState,
      parameters: this.parameters,
      confirmationMessages: this.confirmationMessages
    }, void 0);
    return true;
  }
  _updatePreparedInvocation(preparedInvocation, parameters) {
    this.parameters = parameters;
    if (!preparedInvocation) {
      return;
    }
    if (preparedInvocation.invocationMessage) {
      this.invocationMessage = preparedInvocation.invocationMessage;
    }
    this.pastTenseMessage = preparedInvocation.pastTenseMessage;
    this.confirmationMessages = preparedInvocation.confirmationMessages;
    this.presentation = preparedInvocation.presentation;
    this.toolSpecificData = preparedInvocation.toolSpecificData;
  }
  /** Moves an active invocation into confirmation while preserving the same tool card. */
  requestConfirmation(preparedInvocation) {
    const currentType = this._state.get().type;
    if (currentType === IChatToolInvocation.StateKind.Streaming) {
      this.transitionFromStreaming(preparedInvocation, this.parameters, void 0);
      return;
    }
    if (currentType === IChatToolInvocation.StateKind.Completed || currentType === IChatToolInvocation.StateKind.Cancelled || currentType === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      return;
    }
    if (preparedInvocation.invocationMessage) {
      this.invocationMessage = preparedInvocation.invocationMessage;
    }
    this.pastTenseMessage = preparedInvocation.pastTenseMessage;
    this.confirmationMessages = preparedInvocation.confirmationMessages;
    this.presentation = preparedInvocation.presentation;
    this.toolSpecificData = preparedInvocation.toolSpecificData;
    if (!this.confirmationMessages?.title) {
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.WaitingForConfirmation,
      parameters: this.parameters,
      confirmationMessages: this.confirmationMessages,
      confirm: (reason) => this._confirm(reason)
    }, void 0);
  }
  _setCompleted(result, postConfirmed) {
    if (postConfirmed && (postConfirmed.type === ToolConfirmKind.Denied || postConfirmed.type === ToolConfirmKind.Skipped)) {
      this._state.set({
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: postConfirmed.type,
        parameters: this.parameters,
        confirmationMessages: this.confirmationMessages
      }, void 0);
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.Completed,
      confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
      resultDetails: result?.toolResultDetails,
      postConfirmed,
      contentForModel: result?.content || [],
      parameters: this.parameters,
      confirmationMessages: this.confirmationMessages
    }, void 0);
  }
  async didExecuteTool(result, final, checkIfResultAutoApproved) {
    const currentState = this._state.get();
    if (currentState.type === IChatToolInvocation.StateKind.Completed || currentState.type === IChatToolInvocation.StateKind.Cancelled) {
      return currentState;
    }
    if (result?.toolSpecificData) {
      this.toolSpecificData = result.toolSpecificData;
    }
    if (result?.toolResultMessage) {
      this.pastTenseMessage = result.toolResultMessage;
    } else if (this._progress.get().message) {
      this.pastTenseMessage = this._progress.get().message;
    }
    if (this.confirmationMessages?.confirmResults && !result?.toolResultError && result?.confirmResults !== false && !final) {
      const autoApproved = await checkIfResultAutoApproved?.();
      if (autoApproved) {
        this._setCompleted(result, autoApproved);
      } else {
        this._state.set({
          type: IChatToolInvocation.StateKind.WaitingForPostApproval,
          confirmed: IChatToolInvocation.executionConfirmedOrDenied(this) || { type: ToolConfirmKind.ConfirmationNotNeeded },
          resultDetails: result?.toolResultDetails,
          contentForModel: result?.content || [],
          confirm: (reason) => this._setCompleted(result, reason),
          parameters: this.parameters,
          confirmationMessages: this.confirmationMessages
        }, void 0);
      }
    } else {
      this._setCompleted(result);
    }
    return this._state.get();
  }
  setAuthenticationRequired(server, cancel = () => {
  }) {
    const state = this._state.get();
    if (state.type !== IChatToolInvocation.StateKind.Executing && state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.WaitingForAuthentication,
      server,
      // Agent-host status can refresh while the same authentication request
      // remains pending. Keep the callback that identifies and cancels this
      // occurrence; replace it only after authentication resolves and the tool
      // enters a new WaitingForAuthentication state.
      cancel: state.type === IChatToolInvocation.StateKind.WaitingForAuthentication ? state.cancel : cancel,
      confirmed: state.confirmed,
      parameters: state.parameters,
      confirmationMessages: state.confirmationMessages
    }, void 0);
  }
  setAuthenticationResolved() {
    const state = this._state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
      return;
    }
    this._state.set({
      type: IChatToolInvocation.StateKind.Executing,
      confirmed: state.confirmed,
      progress: this._progress,
      parameters: state.parameters,
      confirmationMessages: state.confirmationMessages
    }, void 0);
  }
  acceptProgress(step) {
    const prev = this._progress.get();
    this._progress.set({
      progress: step.progress || prev.progress || 0,
      message: step.message
    }, void 0);
  }
  toJSON() {
    const waitingForPostApproval = this.state.get().type === IChatToolInvocation.StateKind.WaitingForPostApproval;
    const details = waitingForPostApproval ? void 0 : IChatToolInvocation.resultDetails(this);
    return {
      kind: "toolInvocationSerialized",
      presentation: this.presentation,
      invocationMessage: this.invocationMessage,
      pastTenseMessage: this.pastTenseMessage,
      originMessage: this.originMessage,
      isConfirmed: waitingForPostApproval ? { type: ToolConfirmKind.Skipped } : IChatToolInvocation.executionConfirmedOrDenied(this),
      isComplete: true,
      source: this.source,
      resultDetails: isToolResultOutputDetails(details) ? { output: { type: "data", mimeType: details.output.mimeType, base64Data: encodeBase64(details.output.value) } } : details,
      toolSpecificData: this.toolSpecificData?.kind === "automationConfiguration" ? void 0 : this.toolSpecificData,
      toolCallId: this.toolCallId,
      toolId: this.toolId,
      subAgentInvocationId: this.subAgentInvocationId,
      generatedTitle: this.generatedTitle
    };
  }
}
export {
  ChatToolInvocation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcbW9kZWxcXGNoYXRQcm9ncmVzc1R5cGVzXFxjaGF0VG9vbEludm9jYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlbmNvZGVCYXNlNjQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpcm1lZFJlYXNvbiwgSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uRGF0YSwgSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJhdGlvbkRhdGEsIElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhLCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBJQ2hhdEdlbmVyYXRlZEltYWdlRGF0YSwgSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSwgSUNoYXRTZWFyY2hUb29sSW52b2NhdGlvbkRhdGEsIElDaGF0U2Vzc2lvbkNyZWF0ZWREYXRhLCBJQ2hhdFNpbXBsZVRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSwgSUNoYXRUb2RvTGlzdENvbnRlbnQsIElDaGF0VG9vbElucHV0SW52b2NhdGlvbkRhdGEsIElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbEludm9jYXRpb25PdGhlckNsaWVudERhdGEsIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBUb29sQ29uZmlybUtpbmQsIHR5cGUgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyLCB0eXBlIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgaXNUb29sUmVzdWx0T3V0cHV0RGV0YWlscywgSVRvb2xDb25maXJtYXRpb25NZXNzYWdlcywgSVRvb2xEYXRhLCBJVG9vbFByb2dyZXNzU3RlcCwgSVRvb2xSZXN1bHQsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVN0cmVhbWluZ1Rvb2xDYWxsT3B0aW9ucyB7XG5cdHRvb2xDYWxsSWQ6IHN0cmluZztcblx0dG9vbElkOiBzdHJpbmc7XG5cdHRvb2xEYXRhOiBJVG9vbERhdGE7XG5cdHN1YmFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nO1xuXHRjaGF0UmVxdWVzdElkPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFRvb2xJbnZvY2F0aW9uIGltcGxlbWVudHMgSUNoYXRUb29sSW52b2NhdGlvbiB7XG5cdHB1YmxpYyByZWFkb25seSBraW5kOiAndG9vbEludm9jYXRpb24nID0gJ3Rvb2xJbnZvY2F0aW9uJztcblxuXHRwdWJsaWMgaW52b2NhdGlvbk1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IG9yaWdpbk1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIHBhc3RUZW5zZU1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcHJlc2VudGF0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvblsncHJlc2VudGF0aW9uJ107XG5cdHB1YmxpYyByZWFkb25seSB0b29sSWQ6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGljb24/OiBUaGVtZUljb247XG5cdHB1YmxpYyBzb3VyY2U6IFRvb2xEYXRhU291cmNlO1xuXHRwdWJsaWMgcmVhZG9ubHkgc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIHBhcmFtZXRlcnM6IHVua25vd247XG5cdHB1YmxpYyBnZW5lcmF0ZWRUaXRsZT86IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGNoYXRSZXF1ZXN0SWQ/OiBzdHJpbmc7XG5cdHB1YmxpYyBpc0F0dGFjaGVkVG9UaGlua2luZzogYm9vbGVhbiA9IGZhbHNlO1xuXHRwdWJsaWMgb3RoZXJDbGllbnRUb29sQ2FsbD86IElDaGF0VG9vbEludm9jYXRpb25PdGhlckNsaWVudERhdGE7XG5cblx0cHJpdmF0ZSBfdG9vbFNwZWNpZmljRGF0YT86IElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhIHwgSUNoYXRFeHRlbnNpb25zQ29udGVudCB8IElDaGF0VG9kb0xpc3RDb250ZW50IHwgSUNoYXRTdWJhZ2VudFRvb2xJbnZvY2F0aW9uRGF0YSB8IElDaGF0U2ltcGxlVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRTZWFyY2hUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhIHwgSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uRGF0YSB8IElDaGF0U2Vzc2lvbkNyZWF0ZWREYXRhIHwgSUNoYXRHZW5lcmF0ZWRJbWFnZURhdGEgfCBJQ2hhdEF1dG9tYXRpb25Db25maWd1cmF0aW9uRGF0YSB8IElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sU3BlY2lmaWNEYXRhS2luZCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHB1YmxpYyByZWFkb25seSB0b29sU3BlY2lmaWNEYXRhS2luZDogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPiA9IHRoaXMuX3Rvb2xTcGVjaWZpY0RhdGFLaW5kO1xuXG5cdHB1YmxpYyBnZXQgdG9vbFNwZWNpZmljRGF0YSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9vbFNwZWNpZmljRGF0YTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdG9vbFNwZWNpZmljRGF0YSh2YWx1ZTogdHlwZW9mIHRoaXMuX3Rvb2xTcGVjaWZpY0RhdGEpIHtcblx0XHR0aGlzLl90b29sU3BlY2lmaWNEYXRhID0gdmFsdWU7XG5cdFx0dGhpcy5fdG9vbFNwZWNpZmljRGF0YUtpbmQuc2V0KHZhbHVlPy5raW5kLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3MgPSBvYnNlcnZhYmxlVmFsdWU8eyBtZXNzYWdlPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nOyBwcm9ncmVzczogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KHRoaXMsIHsgcHJvZ3Jlc3M6IDAgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlOiBJU2V0dGFibGVPYnNlcnZhYmxlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+O1xuXG5cdC8vIFN0cmVhbWluZy1yZWxhdGVkIG9ic2VydmFibGVzXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhcnRpYWxJbnB1dCA9IG9ic2VydmFibGVWYWx1ZTx1bmtub3duPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHJlYW1pbmdNZXNzYWdlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRwdWJsaWMgZ2V0IHN0YXRlKCk6IElPYnNlcnZhYmxlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgdG9vbCBpbnZvY2F0aW9uIGluIHN0cmVhbWluZyBzdGF0ZS5cblx0ICogVXNlIHRoaXMgd2hlbiB0aGUgdG9vbCBjYWxsIGlzIGJlZ2lubmluZyB0byBzdHJlYW0gcGFydGlhbCBpbnB1dCBmcm9tIHRoZSBMTS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlU3RyZWFtaW5nKG9wdGlvbnM6IElTdHJlYW1pbmdUb29sQ2FsbE9wdGlvbnMpOiBDaGF0VG9vbEludm9jYXRpb24ge1xuXHRcdHJldHVybiBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKHVuZGVmaW5lZCwgb3B0aW9ucy50b29sRGF0YSwgb3B0aW9ucy50b29sQ2FsbElkLCBvcHRpb25zLnN1YmFnZW50SW52b2NhdGlvbklkLCB1bmRlZmluZWQsIHsgc3RhcnRJblN0cmVhbWluZzogdHJ1ZSB9LCBvcHRpb25zLmNoYXRSZXF1ZXN0SWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIHRvb2wgaW52b2NhdGlvbiBhbHJlYWR5IGluIGNhbmNlbGxlZCBzdGF0ZS5cblx0ICogVXNlIHRoaXMgd2hlbiBhIGhvb2sgZGVuaWVzIHRvb2wgZXhlY3V0aW9uIGJlZm9yZSBpdCBldmVuIHN0YXJ0cy5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlQ2FuY2VsbGVkKG9wdGlvbnM6IElTdHJlYW1pbmdUb29sQ2FsbE9wdGlvbnMsIHBhcmFtZXRlcnM6IHVua25vd24sIHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB8IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkLCByZWFzb25NZXNzYWdlPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nKTogQ2hhdFRvb2xJbnZvY2F0aW9uIHtcblx0XHRyZXR1cm4gbmV3IENoYXRUb29sSW52b2NhdGlvbih1bmRlZmluZWQsIG9wdGlvbnMudG9vbERhdGEsIG9wdGlvbnMudG9vbENhbGxJZCwgb3B0aW9ucy5zdWJhZ2VudEludm9jYXRpb25JZCwgcGFyYW1ldGVycywgeyBzdGFydEluQ2FuY2VsbGVkOiB0cnVlLCBjYW5jZWxSZWFzb246IHJlYXNvbiwgY2FuY2VsUmVhc29uTWVzc2FnZTogcmVhc29uTWVzc2FnZSB9LCBvcHRpb25zLmNoYXRSZXF1ZXN0SWQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCxcblx0XHR0b29sRGF0YTogSVRvb2xEYXRhLFxuXHRcdHB1YmxpYyByZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmcsXG5cdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwYXJhbWV0ZXJzOiB1bmtub3duLFxuXHRcdHN0YXJ0T3B0aW9uczogeyBzdGFydEluU3RyZWFtaW5nPzogYm9vbGVhbjsgc3RhcnRJbkNhbmNlbGxlZD86IGJvb2xlYW47IGNhbmNlbFJlYXNvbj86IFRvb2xDb25maXJtS2luZC5EZW5pZWQgfCBUb29sQ29uZmlybUtpbmQuU2tpcHBlZDsgY2FuY2VsUmVhc29uTWVzc2FnZT86IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB9ID0ge30sXG5cdFx0Y2hhdFJlcXVlc3RJZD86IHN0cmluZ1xuXHQpIHtcblx0XHQvLyBGb3Igc3RyZWFtaW5nIGludm9jYXRpb25zLCB1c2UgYSBkZWZhdWx0IG1lc3NhZ2UgdW50aWwgaGFuZGxlVG9vbFN0cmVhbSBwcm92aWRlcyBvbmVcblx0XHRsZXQgZGVmYXVsdE1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyA9ICcnO1xuXHRcdGlmIChzdGFydE9wdGlvbnMuc3RhcnRJblN0cmVhbWluZykge1xuXHRcdFx0ZGVmYXVsdE1lc3NhZ2UgPSB0b29sRGF0YS5kaXNwbGF5TmFtZTtcblx0XHR9IGVsc2UgaWYgKHN0YXJ0T3B0aW9ucy5zdGFydEluQ2FuY2VsbGVkKSB7XG5cdFx0XHRkZWZhdWx0TWVzc2FnZSA9IHN0YXJ0T3B0aW9ucy5jYW5jZWxSZWFzb25NZXNzYWdlID8/IGxvY2FsaXplKCd0b29sRGVuaWVkTWVzc2FnZScsIFwiVG9vbCBcXFwiezB9XFxcIiB3YXMgZGVuaWVkXCIsIHRvb2xEYXRhLmRpc3BsYXlOYW1lKTtcblx0XHR9XG5cdFx0dGhpcy5pbnZvY2F0aW9uTWVzc2FnZSA9IHByZXBhcmVkSW52b2NhdGlvbj8uaW52b2NhdGlvbk1lc3NhZ2UgPz8gZGVmYXVsdE1lc3NhZ2U7XG5cdFx0dGhpcy5wYXN0VGVuc2VNZXNzYWdlID0gcHJlcGFyZWRJbnZvY2F0aW9uPy5wYXN0VGVuc2VNZXNzYWdlO1xuXHRcdHRoaXMub3JpZ2luTWVzc2FnZSA9IHByZXBhcmVkSW52b2NhdGlvbj8ub3JpZ2luTWVzc2FnZTtcblx0XHR0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzID0gcHJlcGFyZWRJbnZvY2F0aW9uPy5jb25maXJtYXRpb25NZXNzYWdlcztcblx0XHR0aGlzLnByZXNlbnRhdGlvbiA9IHByZXBhcmVkSW52b2NhdGlvbj8ucHJlc2VudGF0aW9uO1xuXHRcdHRoaXMudG9vbFNwZWNpZmljRGF0YSA9IHByZXBhcmVkSW52b2NhdGlvbj8udG9vbFNwZWNpZmljRGF0YTtcblx0XHR0aGlzLnRvb2xJZCA9IHRvb2xEYXRhLmlkO1xuXHRcdHRoaXMuaWNvbiA9IHByZXBhcmVkSW52b2NhdGlvbj8uaWNvbiA/PyAodG9vbERhdGEuaWNvbiAmJiBUaGVtZUljb24uaXNUaGVtZUljb24odG9vbERhdGEuaWNvbikgPyB0b29sRGF0YS5pY29uIDogdW5kZWZpbmVkKTtcblx0XHR0aGlzLnNvdXJjZSA9IHRvb2xEYXRhLnNvdXJjZTtcblx0XHR0aGlzLnN1YkFnZW50SW52b2NhdGlvbklkID0gc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdFx0dGhpcy5wYXJhbWV0ZXJzID0gcGFyYW1ldGVycztcblx0XHR0aGlzLmNoYXRSZXF1ZXN0SWQgPSBjaGF0UmVxdWVzdElkO1xuXG5cdFx0aWYgKHN0YXJ0T3B0aW9ucy5zdGFydEluQ2FuY2VsbGVkKSB7XG5cdFx0XHQvLyBTdGFydCBkaXJlY3RseSBpbiBjYW5jZWxsZWQgc3RhdGUgKGUuZy4sIHdoZW4gYSBob29rIGRlbmllcyBleGVjdXRpb24pXG5cdFx0XHR0aGlzLl9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdFx0cmVhc29uOiBzdGFydE9wdGlvbnMuY2FuY2VsUmVhc29uID8/IFRvb2xDb25maXJtS2luZC5EZW5pZWQsXG5cdFx0XHRcdHJlYXNvbk1lc3NhZ2U6IHN0YXJ0T3B0aW9ucy5jYW5jZWxSZWFzb25NZXNzYWdlLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChzdGFydE9wdGlvbnMuc3RhcnRJblN0cmVhbWluZykge1xuXHRcdFx0Ly8gU3RhcnQgaW4gc3RyZWFtaW5nIHN0YXRlXG5cdFx0XHR0aGlzLl9zdGF0ZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZyxcblx0XHRcdFx0cGFydGlhbElucHV0OiB0aGlzLl9wYXJ0aWFsSW5wdXQsXG5cdFx0XHRcdHN0cmVhbWluZ01lc3NhZ2U6IHRoaXMuX3N0cmVhbWluZ01lc3NhZ2UsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGNvbmZpcm1lZDogeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkLCByZWFzb246IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXM/LmNvbmZpcm1hdGlvbk5vdE5lZWRlZFJlYXNvbiB9LFxuXHRcdFx0XHRwcm9ncmVzczogdGhpcy5fcHJvZ3Jlc3MsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0XHRjb25maXJtOiByZWFzb24gPT4gdGhpcy5fY29uZmlybShyZWFzb24pLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNoYXJlZCBjb25maXJtYXRpb24gaGFuZGxlciB1c2VkIGJ5IGV2ZXJ5IGBXYWl0aW5nRm9yQ29uZmlybWF0aW9uYCBzdGF0ZVxuXHQgKiB0aGlzIGludm9jYXRpb24gY2FuIGVudGVyIChpbml0aWFsIGNvbnN0cnVjdGlvbiwgdHJhbnNpdGlvbiBvdXQgb2Zcblx0ICogc3RyZWFtaW5nLCBhbmQgcmUtYXJtaW5nIHZpYSB7QGxpbmsgcmVxdWVzdENvbmZpcm1hdGlvbn0pLiBEZW5pYWxzL3NraXBzXG5cdCAqIGNhbmNlbDsgYW55dGhpbmcgZWxzZSBtb3ZlcyB0byBleGVjdXRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9jb25maXJtKHJlYXNvbjogQ29uZmlybWVkUmVhc29uKTogdm9pZCB7XG5cdFx0aWYgKHJlYXNvbi50eXBlID09PSBUb29sQ29uZmlybUtpbmQuRGVuaWVkIHx8IHJlYXNvbi50eXBlID09PSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCkge1xuXHRcdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkLFxuXHRcdFx0XHRyZWFzb246IHJlYXNvbi50eXBlLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRjb25maXJtZWQ6IHJlYXNvbixcblx0XHRcdFx0cHJvZ3Jlc3M6IHRoaXMuX3Byb2dyZXNzLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIHRoZSBwYXJ0aWFsIGlucHV0IG9ic2VydmFibGUgZHVyaW5nIHN0cmVhbWluZy5cblx0ICovXG5cdHB1YmxpYyB1cGRhdGVQYXJ0aWFsSW5wdXQoaW5wdXQ6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUuZ2V0KCkudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRyZXR1cm47IC8vIE9ubHkgdXBkYXRlIGluIHN0cmVhbWluZyBzdGF0ZVxuXHRcdH1cblx0XHR0aGlzLl9wYXJ0aWFsSW5wdXQuc2V0KGlucHV0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgc3RyZWFtaW5nIG1lc3NhZ2UgKGZyb20gaGFuZGxlVG9vbFN0cmVhbSkuXG5cdCAqL1xuXHRwdWJsaWMgdXBkYXRlU3RyZWFtaW5nTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdHJldHVybjsgLy8gT25seSB1cGRhdGUgaW4gc3RyZWFtaW5nIHN0YXRlXG5cdFx0fVxuXHRcdHRoaXMuX3N0cmVhbWluZ01lc3NhZ2Uuc2V0KG1lc3NhZ2UsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogTm90aWZpZXMgc3RhdGUgb2JzZXJ2ZXJzIHRoYXQgYHRvb2xTcGVjaWZpY0RhdGFgIGhhcyBiZWVuIG11dGF0ZWQuXG5cdCAqIFNpbmNlIGB0b29sU3BlY2lmaWNEYXRhYCBpc24ndCBvYnNlcnZhYmxlLCB0aGlzIHJlLXNldHMgdGhlIGludGVybmFsXG5cdCAqIHN0YXRlIHRvIHRyaWdnZXIgYXV0b3J1bnMgdGhhdCBuZWVkIHRvIHJlLXJlYWQgdG9vbCBtZXRhZGF0YS5cblx0ICovXG5cdHB1YmxpYyBub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0dGhpcy5fc3RhdGUuc2V0KHsgLi4uY3VycmVudCB9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZUNvbmZpcm1hdGlvbk1lc3NhZ2VzKGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdGlmIChjdXJyZW50LnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5jb25maXJtYXRpb25NZXNzYWdlcyA9IGNvbmZpcm1hdGlvbk1lc3NhZ2VzO1xuXHRcdHRoaXMuX3N0YXRlLnNldCh7IC4uLmN1cnJlbnQsIGNvbmZpcm1hdGlvbk1lc3NhZ2VzIH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VsIGEgc3RyZWFtaW5nIGludm9jYXRpb24gZGlyZWN0bHkgKGUuZy4sIHdoZW4gcHJlVG9vbFVzZSBob29rIGRlbmllcykuXG5cdCAqIE9ubHkgd29ya3Mgd2hlbiBpbiBTdHJlYW1pbmcgc3RhdGUuXG5cdCAqIEByZXR1cm5zIHRydWUgaWYgdGhlIGNhbmNlbGxhdGlvbiB3YXMgYXBwbGllZCwgZmFsc2UgaWYgbm90IGluIHN0cmVhbWluZyBzdGF0ZVxuXHQgKi9cblx0cHVibGljIGNhbmNlbEZyb21TdHJlYW1pbmcocmVhc29uOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkIHwgVG9vbENvbmZpcm1LaW5kLlNraXBwZWQsIHJlYXNvbk1lc3NhZ2U/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBPbmx5IGNhbmNlbCBmcm9tIHN0cmVhbWluZyBzdGF0ZVxuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRyZWFzb246IHJlYXNvbixcblx0XHRcdHJlYXNvbk1lc3NhZ2U6IHJlYXNvbk1lc3NhZ2UsXG5cdFx0XHRwYXJhbWV0ZXJzOiB0aGlzLnBhcmFtZXRlcnMsXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdGhpcy5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zaXRpb24gZnJvbSBzdHJlYW1pbmcgc3RhdGUgdG8gcHJlcGFyZWQvZXhlY3V0aW5nIHN0YXRlLlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgZnVsbCB0b29sIGNhbGwgaXMgcmVhZHkuXG5cdCAqL1xuXHRwdWJsaWMgdHJhbnNpdGlvbkZyb21TdHJlYW1pbmcocHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZCwgcGFyYW1ldGVyczogdW5rbm93biwgYXV0b0NvbmZpcm1lZDogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKGN1cnJlbnRTdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdHJldHVybjsgLy8gT25seSB0cmFuc2l0aW9uIGZyb20gc3RyZWFtaW5nIHN0YXRlXG5cdFx0fVxuXG5cdFx0Ly8gUHJlc2VydmUgdGhlIGxhc3Qgc3RyZWFtaW5nIG1lc3NhZ2UgaWYgbm8gbmV3IGludm9jYXRpb24gbWVzc2FnZSBpcyBwcm92aWRlZFxuXHRcdGNvbnN0IGxhc3RTdHJlYW1pbmdNZXNzYWdlID0gdGhpcy5fc3RyZWFtaW5nTWVzc2FnZS5nZXQoKTtcblx0XHRpZiAobGFzdFN0cmVhbWluZ01lc3NhZ2UgJiYgIXByZXBhcmVkSW52b2NhdGlvbj8uaW52b2NhdGlvbk1lc3NhZ2UpIHtcblx0XHRcdHRoaXMuaW52b2NhdGlvbk1lc3NhZ2UgPSBsYXN0U3RyZWFtaW5nTWVzc2FnZTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVQcmVwYXJlZEludm9jYXRpb24ocHJlcGFyZWRJbnZvY2F0aW9uLCBwYXJhbWV0ZXJzKTtcblxuXHRcdC8vIFRyYW5zaXRpb24gdG8gdGhlIGFwcHJvcHJpYXRlIHN0YXRlXG5cdFx0aWYgKGF1dG9Db25maXJtZWQpIHtcblx0XHRcdHRoaXMuX2NvbmZpcm0oYXV0b0NvbmZpcm1lZCk7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdFx0Y29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQsIHJlYXNvbjogdGhpcy5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uIH0sXG5cdFx0XHRcdHByb2dyZXNzOiB0aGlzLl9wcm9ncmVzcyxcblx0XHRcdFx0cGFyYW1ldGVyczogdGhpcy5wYXJhbWV0ZXJzLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdGhpcy5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24sXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHRcdGNvbmZpcm06IHJlYXNvbiA9PiB0aGlzLl9jb25maXJtKHJlYXNvbiksXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIGxvY2FsbHkgcHJlcGFyZWQgcGFyYW1ldGVycyBhbmQgcHJlc2VudGF0aW9uIHdpdGhvdXQgY2hhbmdpbmcgYW5cblx0ICogaW52b2NhdGlvbiBzdGF0ZSBhbHJlYWR5IGVzdGFibGlzaGVkIGJ5IGFuIGV4dGVybmFsIHByb3RvY29sLlxuXHQgKi9cblx0cHVibGljIHVwZGF0ZVByZXBhcmVkSW52b2NhdGlvbihwcmVwYXJlZEludm9jYXRpb246IElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkLCBwYXJhbWV0ZXJzOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKGN1cnJlbnRTdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmdcblx0XHRcdHx8IGN1cnJlbnRTdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWRcblx0XHRcdHx8IGN1cnJlbnRTdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVQcmVwYXJlZEludm9jYXRpb24ocHJlcGFyZWRJbnZvY2F0aW9uLCBwYXJhbWV0ZXJzKTtcblx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0Li4uY3VycmVudFN0YXRlLFxuXHRcdFx0cGFyYW1ldGVyczogdGhpcy5wYXJhbWV0ZXJzLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVByZXBhcmVkSW52b2NhdGlvbihwcmVwYXJlZEludm9jYXRpb246IElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkLCBwYXJhbWV0ZXJzOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5wYXJhbWV0ZXJzID0gcGFyYW1ldGVycztcblx0XHRpZiAoIXByZXBhcmVkSW52b2NhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAocHJlcGFyZWRJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlKSB7XG5cdFx0XHR0aGlzLmludm9jYXRpb25NZXNzYWdlID0gcHJlcGFyZWRJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlO1xuXHRcdH1cblx0XHR0aGlzLnBhc3RUZW5zZU1lc3NhZ2UgPSBwcmVwYXJlZEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZTtcblx0XHR0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzID0gcHJlcGFyZWRJbnZvY2F0aW9uLmNvbmZpcm1hdGlvbk1lc3NhZ2VzO1xuXHRcdHRoaXMucHJlc2VudGF0aW9uID0gcHJlcGFyZWRJbnZvY2F0aW9uLnByZXNlbnRhdGlvbjtcblx0XHR0aGlzLnRvb2xTcGVjaWZpY0RhdGEgPSBwcmVwYXJlZEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0fVxuXG5cdC8qKiBNb3ZlcyBhbiBhY3RpdmUgaW52b2NhdGlvbiBpbnRvIGNvbmZpcm1hdGlvbiB3aGlsZSBwcmVzZXJ2aW5nIHRoZSBzYW1lIHRvb2wgY2FyZC4gKi9cblx0cHVibGljIHJlcXVlc3RDb25maXJtYXRpb24ocHJlcGFyZWRJbnZvY2F0aW9uOiBJUHJlcGFyZWRUb29sSW52b2NhdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRUeXBlID0gdGhpcy5fc3RhdGUuZ2V0KCkudHlwZTtcblx0XHRpZiAoY3VycmVudFR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0dGhpcy50cmFuc2l0aW9uRnJvbVN0cmVhbWluZyhwcmVwYXJlZEludm9jYXRpb24sIHRoaXMucGFyYW1ldGVycywgdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGN1cnJlbnRUeXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWRcblx0XHRcdHx8IGN1cnJlbnRUeXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWRcblx0XHRcdHx8IGN1cnJlbnRUeXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHByZXBhcmVkSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSkge1xuXHRcdFx0dGhpcy5pbnZvY2F0aW9uTWVzc2FnZSA9IHByZXBhcmVkSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZTtcblx0XHR9XG5cdFx0dGhpcy5wYXN0VGVuc2VNZXNzYWdlID0gcHJlcGFyZWRJbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2U7XG5cdFx0dGhpcy5jb25maXJtYXRpb25NZXNzYWdlcyA9IHByZXBhcmVkSW52b2NhdGlvbi5jb25maXJtYXRpb25NZXNzYWdlcztcblx0XHR0aGlzLnByZXNlbnRhdGlvbiA9IHByZXBhcmVkSW52b2NhdGlvbi5wcmVzZW50YXRpb247XG5cdFx0dGhpcy50b29sU3BlY2lmaWNEYXRhID0gcHJlcGFyZWRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cblx0XHRpZiAoIXRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHRyZXR1cm47IC8vIG5vdGhpbmcgdG8gY29uZmlybVxuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uLFxuXHRcdFx0cGFyYW1ldGVyczogdGhpcy5wYXJhbWV0ZXJzLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHRjb25maXJtOiByZWFzb24gPT4gdGhpcy5fY29uZmlybShyZWFzb24pLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb21wbGV0ZWQocmVzdWx0OiBJVG9vbFJlc3VsdCB8IHVuZGVmaW5lZCwgcG9zdENvbmZpcm1lZD86IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZCkge1xuXHRcdGlmIChwb3N0Q29uZmlybWVkICYmIChwb3N0Q29uZmlybWVkLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5EZW5pZWQgfHwgcG9zdENvbmZpcm1lZC50eXBlID09PSBUb29sQ29uZmlybUtpbmQuU2tpcHBlZCkpIHtcblx0XHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCxcblx0XHRcdFx0cmVhc29uOiBwb3N0Q29uZmlybWVkLnR5cGUsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHRoaXMucGFyYW1ldGVycyxcblx0XHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLnNldCh7XG5cdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQsXG5cdFx0XHRjb25maXJtZWQ6IElDaGF0VG9vbEludm9jYXRpb24uZXhlY3V0aW9uQ29uZmlybWVkT3JEZW5pZWQodGhpcykgfHwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH0sXG5cdFx0XHRyZXN1bHREZXRhaWxzOiByZXN1bHQ/LnRvb2xSZXN1bHREZXRhaWxzLFxuXHRcdFx0cG9zdENvbmZpcm1lZCxcblx0XHRcdGNvbnRlbnRGb3JNb2RlbDogcmVzdWx0Py5jb250ZW50IHx8IFtdLFxuXHRcdFx0cGFyYW1ldGVyczogdGhpcy5wYXJhbWV0ZXJzLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHRoaXMuY29uZmlybWF0aW9uTWVzc2FnZXMsXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBkaWRFeGVjdXRlVG9vbChyZXN1bHQ6IElUb29sUmVzdWx0IHwgdW5kZWZpbmVkLCBmaW5hbD86IGJvb2xlYW4sIGNoZWNrSWZSZXN1bHRBdXRvQXBwcm92ZWQ/OiAoKSA9PiBQcm9taXNlPENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZD4pOiBQcm9taXNlPElDaGF0VG9vbEludm9jYXRpb24uU3RhdGU+IHtcblx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNvbXBsZXRlZCB8fCBjdXJyZW50U3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudFN0YXRlO1xuXHRcdH1cblxuXHRcdGlmIChyZXN1bHQ/LnRvb2xTcGVjaWZpY0RhdGEpIHtcblx0XHRcdHRoaXMudG9vbFNwZWNpZmljRGF0YSA9IHJlc3VsdC50b29sU3BlY2lmaWNEYXRhO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0Py50b29sUmVzdWx0TWVzc2FnZSkge1xuXHRcdFx0dGhpcy5wYXN0VGVuc2VNZXNzYWdlID0gcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5fcHJvZ3Jlc3MuZ2V0KCkubWVzc2FnZSkge1xuXHRcdFx0dGhpcy5wYXN0VGVuc2VNZXNzYWdlID0gdGhpcy5fcHJvZ3Jlc3MuZ2V0KCkubWVzc2FnZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maXJtYXRpb25NZXNzYWdlcz8uY29uZmlybVJlc3VsdHMgJiYgIXJlc3VsdD8udG9vbFJlc3VsdEVycm9yICYmIHJlc3VsdD8uY29uZmlybVJlc3VsdHMgIT09IGZhbHNlICYmICFmaW5hbCkge1xuXHRcdFx0Y29uc3QgYXV0b0FwcHJvdmVkID0gYXdhaXQgY2hlY2tJZlJlc3VsdEF1dG9BcHByb3ZlZD8uKCk7XG5cdFx0XHRpZiAoYXV0b0FwcHJvdmVkKSB7XG5cdFx0XHRcdHRoaXMuX3NldENvbXBsZXRlZChyZXN1bHQsIGF1dG9BcHByb3ZlZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmV4ZWN1dGlvbkNvbmZpcm1lZE9yRGVuaWVkKHRoaXMpIHx8IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCB9LFxuXHRcdFx0XHRcdHJlc3VsdERldGFpbHM6IHJlc3VsdD8udG9vbFJlc3VsdERldGFpbHMsXG5cdFx0XHRcdFx0Y29udGVudEZvck1vZGVsOiByZXN1bHQ/LmNvbnRlbnQgfHwgW10sXG5cdFx0XHRcdFx0Y29uZmlybTogcmVhc29uID0+IHRoaXMuX3NldENvbXBsZXRlZChyZXN1bHQsIHJlYXNvbiksXG5cdFx0XHRcdFx0cGFyYW1ldGVyczogdGhpcy5wYXJhbWV0ZXJzLFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiB0aGlzLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdFx0XHR9LCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zZXRDb21wbGV0ZWQocmVzdWx0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0QXV0aGVudGljYXRpb25SZXF1aXJlZChzZXJ2ZXI6IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlciwgY2FuY2VsOiAoKSA9PiB2b2lkID0gKCkgPT4geyB9KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nICYmIHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZS5zZXQoe1xuXHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uLFxuXHRcdFx0c2VydmVyLFxuXHRcdFx0Ly8gQWdlbnQtaG9zdCBzdGF0dXMgY2FuIHJlZnJlc2ggd2hpbGUgdGhlIHNhbWUgYXV0aGVudGljYXRpb24gcmVxdWVzdFxuXHRcdFx0Ly8gcmVtYWlucyBwZW5kaW5nLiBLZWVwIHRoZSBjYWxsYmFjayB0aGF0IGlkZW50aWZpZXMgYW5kIGNhbmNlbHMgdGhpc1xuXHRcdFx0Ly8gb2NjdXJyZW5jZTsgcmVwbGFjZSBpdCBvbmx5IGFmdGVyIGF1dGhlbnRpY2F0aW9uIHJlc29sdmVzIGFuZCB0aGUgdG9vbFxuXHRcdFx0Ly8gZW50ZXJzIGEgbmV3IFdhaXRpbmdGb3JBdXRoZW50aWNhdGlvbiBzdGF0ZS5cblx0XHRcdGNhbmNlbDogc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uID8gc3RhdGUuY2FuY2VsIDogY2FuY2VsLFxuXHRcdFx0Y29uZmlybWVkOiBzdGF0ZS5jb25maXJtZWQsXG5cdFx0XHRwYXJhbWV0ZXJzOiBzdGF0ZS5wYXJhbWV0ZXJzLFxuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0QXV0aGVudGljYXRpb25SZXNvbHZlZCgpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGUuc2V0KHtcblx0XHRcdHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZyxcblx0XHRcdGNvbmZpcm1lZDogc3RhdGUuY29uZmlybWVkLFxuXHRcdFx0cHJvZ3Jlc3M6IHRoaXMuX3Byb2dyZXNzLFxuXHRcdFx0cGFyYW1ldGVyczogc3RhdGUucGFyYW1ldGVycyxcblx0XHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiBzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHR9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIGFjY2VwdFByb2dyZXNzKHN0ZXA6IElUb29sUHJvZ3Jlc3NTdGVwKSB7XG5cdFx0Y29uc3QgcHJldiA9IHRoaXMuX3Byb2dyZXNzLmdldCgpO1xuXHRcdHRoaXMuX3Byb2dyZXNzLnNldCh7XG5cdFx0XHRwcm9ncmVzczogc3RlcC5wcm9ncmVzcyB8fCBwcmV2LnByb2dyZXNzIHx8IDAsXG5cdFx0XHRtZXNzYWdlOiBzdGVwLm1lc3NhZ2UsXG5cdFx0fSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyB0b0pTT04oKTogSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQge1xuXHRcdC8vIHBlcnNpc3QgdGhlIHNlcmlhbGl6ZWQgY2FsbCBhcyAnc2tpcHBlZCcgaWYgd2Ugd2VyZSB3YWl0aW5nIGZvciBwb3N0YXBwcm92YWxcblx0XHRjb25zdCB3YWl0aW5nRm9yUG9zdEFwcHJvdmFsID0gdGhpcy5zdGF0ZS5nZXQoKS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsO1xuXHRcdGNvbnN0IGRldGFpbHMgPSB3YWl0aW5nRm9yUG9zdEFwcHJvdmFsID8gdW5kZWZpbmVkIDogSUNoYXRUb29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKHRoaXMpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB0aGlzLnByZXNlbnRhdGlvbixcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB0aGlzLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogdGhpcy5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0b3JpZ2luTWVzc2FnZTogdGhpcy5vcmlnaW5NZXNzYWdlLFxuXHRcdFx0aXNDb25maXJtZWQ6IHdhaXRpbmdGb3JQb3N0QXBwcm92YWwgPyB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIH0gOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmV4ZWN1dGlvbkNvbmZpcm1lZE9yRGVuaWVkKHRoaXMpLFxuXHRcdFx0aXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdHNvdXJjZTogdGhpcy5zb3VyY2UsXG5cdFx0XHRyZXN1bHREZXRhaWxzOiBpc1Rvb2xSZXN1bHRPdXRwdXREZXRhaWxzKGRldGFpbHMpXG5cdFx0XHRcdD8geyBvdXRwdXQ6IHsgdHlwZTogJ2RhdGEnLCBtaW1lVHlwZTogZGV0YWlscy5vdXRwdXQubWltZVR5cGUsIGJhc2U2NERhdGE6IGVuY29kZUJhc2U2NChkZXRhaWxzLm91dHB1dC52YWx1ZSkgfSB9XG5cdFx0XHRcdDogZGV0YWlscyxcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGE6IHRoaXMudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2F1dG9tYXRpb25Db25maWd1cmF0aW9uJyA/IHVuZGVmaW5lZCA6IHRoaXMudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdHRvb2xDYWxsSWQ6IHRoaXMudG9vbENhbGxJZCxcblx0XHRcdHRvb2xJZDogdGhpcy50b29sSWQsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogdGhpcy5zdWJBZ2VudEludm9jYXRpb25JZCxcblx0XHRcdGdlbmVyYXRlZFRpdGxlOiB0aGlzLmdlbmVyYXRlZFRpdGxlLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JB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LHNCQUFzQixNQUFNO0FBQUEsSUFDN0IsR0FBRyxNQUFTO0FBQUEsRUFDYjtBQUFBLEVBRU8sNEJBQWtDO0FBQ3hDLFVBQU0sUUFBUSxLQUFLLE9BQU8sSUFBSTtBQUM5QixRQUFJLE1BQU0sU0FBUyxvQkFBb0IsVUFBVSwwQkFBMEI7QUFDMUU7QUFBQSxJQUNEO0FBQ0EsU0FBSyxPQUFPLElBQUk7QUFBQSxNQUNmLE1BQU0sb0JBQW9CLFVBQVU7QUFBQSxNQUNwQyxXQUFXLE1BQU07QUFBQSxNQUNqQixVQUFVLEtBQUs7QUFBQSxNQUNmLFlBQVksTUFBTTtBQUFBLE1BQ2xCLHNCQUFzQixNQUFNO0FBQUEsSUFDN0IsR0FBRyxNQUFTO0FBQUEsRUFDYjtBQUFBLEVBRU8sZUFBZSxNQUF5QjtBQUM5QyxVQUFNLE9BQU8sS0FBSyxVQUFVLElBQUk7QUFDaEMsU0FBSyxVQUFVLElBQUk7QUFBQSxNQUNsQixVQUFVLEtBQUssWUFBWSxLQUFLLFlBQVk7QUFBQSxNQUM1QyxTQUFTLEtBQUs7QUFBQSxJQUNmLEdBQUcsTUFBUztBQUFBLEVBQ2I7QUFBQSxFQUVPLFNBQXdDO0FBRTlDLFVBQU0seUJBQXlCLEtBQUssTUFBTSxJQUFJLEVBQUUsU0FBUyxvQkFBb0IsVUFBVTtBQUN2RixVQUFNLFVBQVUseUJBQXlCLFNBQVksb0JBQW9CLGNBQWMsSUFBSTtBQUUzRixXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTixjQUFjLEtBQUs7QUFBQSxNQUNuQixtQkFBbUIsS0FBSztBQUFBLE1BQ3hCLGtCQUFrQixLQUFLO0FBQUEsTUFDdkIsZUFBZSxLQUFLO0FBQUEsTUFDcEIsYUFBYSx5QkFBeUIsRUFBRSxNQUFNLGdCQUFnQixRQUFRLElBQUksb0JBQW9CLDJCQUEyQixJQUFJO0FBQUEsTUFDN0gsWUFBWTtBQUFBLE1BQ1osUUFBUSxLQUFLO0FBQUEsTUFDYixlQUFlLDBCQUEwQixPQUFPLElBQzdDLEVBQUUsUUFBUSxFQUFFLE1BQU0sUUFBUSxVQUFVLFFBQVEsT0FBTyxVQUFVLFlBQVksYUFBYSxRQUFRLE9BQU8sS0FBSyxFQUFFLEVBQUUsSUFDOUc7QUFBQSxNQUNILGtCQUFrQixLQUFLLGtCQUFrQixTQUFTLDRCQUE0QixTQUFZLEtBQUs7QUFBQSxNQUMvRixZQUFZLEtBQUs7QUFBQSxNQUNqQixRQUFRLEtBQUs7QUFBQSxNQUNiLHNCQUFzQixLQUFLO0FBQUEsTUFDM0IsZ0JBQWdCLEtBQUs7QUFBQSxJQUN0QjtBQUFBLEVBQ0Q7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
