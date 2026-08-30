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
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable, dispose } from "../../../../../base/common/lifecycle.js";
import { RunOnceScheduler } from "../../../../../base/common/async.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ChatRequestQueueKind } from "../chatService/chatService.js";
import { getFullyQualifiedId, IChatAgentNameService } from "../participants/chatAgents.js";
import { ChatStreamStatsTracker } from "./chatStreamStats.js";
import { countWords } from "./chatWordCounter.js";
function isRequestVM(item) {
  return !!item && typeof item === "object" && "message" in item;
}
function isResponseVM(item) {
  return !!item && typeof item.setVote !== "undefined";
}
function isPendingDividerVM(item) {
  return !!item && typeof item === "object" && item.kind === "pendingDivider";
}
function isPendingChatViewModelItem(item) {
  return item.kind === "pendingDivider" || item.pendingKind !== void 0;
}
function getStickyScrollTargetItem(items) {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (!isPendingChatViewModelItem(item)) {
      return item;
    }
  }
  return items.at(-1);
}
function isChatTreeItem(item) {
  return isRequestVM(item) || isResponseVM(item);
}
function assertIsResponseVM(item) {
  if (!isResponseVM(item)) {
    throw new Error("Expected item to be IChatResponseViewModel");
  }
}
let ChatViewModel = class extends Disposable {
  constructor(_model, _options, instantiationService) {
    super();
    this._model = _model;
    this._options = _options;
    this.instantiationService = instantiationService;
    this._onDidDisposeModel = this._register(new Emitter());
    this.onDidDisposeModel = this._onDidDisposeModel.event;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._items = [];
    this._inputPlaceholder = void 0;
    this._editing = void 0;
    _model.getRequests().forEach((request, i) => {
      const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, request);
      this._items.push(requestModel);
      if (request.response) {
        this.onAddResponse(request.response);
      }
    });
    this._register(_model.onDidDispose(() => this._onDidDisposeModel.fire()));
    this._register(_model.onDidChangePendingRequests(() => this._onDidChange.fire(null)));
    this._register(_model.onDidChange((e) => {
      if (e.kind === "addRequest") {
        const requestModel = this.instantiationService.createInstance(ChatRequestViewModel, e.request);
        this._items.push(requestModel);
        if (e.request.response) {
          this.onAddResponse(e.request.response);
        }
      } else if (e.kind === "addResponse") {
        this.onAddResponse(e.response);
      } else if (e.kind === "removeRequest") {
        const requestIdx = this._items.findIndex((item) => isRequestVM(item) && item.id === e.requestId);
        if (requestIdx >= 0) {
          this._items.splice(requestIdx, 1);
        }
        const responseIdx = e.responseId && this._items.findIndex((item) => isResponseVM(item) && item.id === e.responseId);
        if (typeof responseIdx === "number" && responseIdx >= 0) {
          const items = this._items.splice(responseIdx, 1);
          const item = items[0];
          if (item instanceof ChatResponseViewModel) {
            item.dispose();
          }
        }
      }
      const modelEventToVmEvent = e.kind === "addRequest" ? { kind: "addRequest" } : e.kind === "initialize" ? { kind: "initialize" } : e.kind === "setHidden" ? { kind: "setHidden" } : null;
      this._onDidChange.fire(modelEventToVmEvent);
    }));
  }
  get inputPlaceholder() {
    return this._inputPlaceholder;
  }
  get model() {
    return this._model;
  }
  setInputPlaceholder(text) {
    this._inputPlaceholder = text;
    this._onDidChange.fire({ kind: "changePlaceholder" });
  }
  resetInputPlaceholder() {
    this._inputPlaceholder = void 0;
    this._onDidChange.fire({ kind: "changePlaceholder" });
  }
  get sessionResource() {
    return this._model.sessionResource;
  }
  onAddResponse(responseModel) {
    const response = this.instantiationService.createInstance(ChatResponseViewModel, responseModel, this);
    this._register(response.onDidChange(() => {
      return this._onDidChange.fire(null);
    }));
    this._items.push(response);
  }
  getItems() {
    let items = this._items.filter((item) => {
      if (item.isHiddenFromTranscript || item.shouldBeRemovedOnSend && !item.shouldBeRemovedOnSend.afterUndoStop) {
        return false;
      }
      return true;
    });
    if (this._options?.maxVisibleItems !== void 0 && items.length > this._options.maxVisibleItems) {
      items = items.slice(-this._options.maxVisibleItems);
    }
    const pendingRequests = this._model.getPendingRequests().filter((pending) => !pending.request.isHiddenFromTranscript);
    if (pendingRequests.length > 0) {
      const steeringRequests = pendingRequests.filter((p) => p.kind === ChatRequestQueueKind.Steering);
      const queuedRequests = pendingRequests.filter((p) => p.kind === ChatRequestQueueKind.Queued);
      if (steeringRequests.length > 0) {
        const isSystemInitiated = steeringRequests.every((p) => p.request.isSystemInitiated);
        items.push({ kind: "pendingDivider", id: "pending-divider-steering", sessionResource: this._model.sessionResource, isComplete: true, dividerKind: ChatRequestQueueKind.Steering, isSystemInitiated, currentRenderedHeight: void 0 });
        for (const pending of steeringRequests) {
          const requestVM = this.instantiationService.createInstance(ChatRequestViewModel, pending.request, pending.kind);
          items.push(requestVM);
        }
      }
      if (queuedRequests.length > 0) {
        items.push({ kind: "pendingDivider", id: "pending-divider-queued", sessionResource: this._model.sessionResource, isComplete: true, dividerKind: ChatRequestQueueKind.Queued, currentRenderedHeight: void 0 });
        for (const pending of queuedRequests) {
          const requestVM = this.instantiationService.createInstance(ChatRequestViewModel, pending.request, pending.kind);
          items.push(requestVM);
        }
      }
    }
    return items;
  }
  get editing() {
    return this._editing;
  }
  setEditing(editing) {
    if (this.editing && editing && this.editing.id === editing.id) {
      return;
    }
    this._editing = editing;
  }
  dispose() {
    super.dispose();
    dispose(this._items.filter((item) => item instanceof ChatResponseViewModel));
    this._items.length = 0;
  }
};
ChatViewModel = __decorateClass([
  __decorateParam(2, IInstantiationService)
], ChatViewModel);
class ChatRequestViewModel {
  constructor(_model, _pendingKind) {
    this._model = _model;
    this._pendingKind = _pendingKind;
  }
  get id() {
    return this._model.id;
  }
  /**
   * An ID that changes when the request should be re-rendered.
   */
  get dataId() {
    return `${this.id}_${this._model.version + (this._model.response?.isComplete ? 1 : 0)}`;
  }
  get sessionResource() {
    return this._model.session.sessionResource;
  }
  get username() {
    return "User";
  }
  get avatarIcon() {
    return Codicon.account;
  }
  get message() {
    return this._model.message;
  }
  get messageText() {
    return this.message.text;
  }
  get attempt() {
    return this._model.attempt;
  }
  get variables() {
    return this._model.variableData.variables;
  }
  get contentReferences() {
    return this._model.response?.contentReferences;
  }
  get confirmation() {
    return this._model.confirmation;
  }
  get isComplete() {
    return this._model.response?.isComplete ?? false;
  }
  get isCompleteAddedRequest() {
    return this._model.isCompleteAddedRequest;
  }
  get isTerminalCommand() {
    return this._model.isTerminalCommand;
  }
  get shouldBeRemovedOnSend() {
    return this._model.shouldBeRemovedOnSend;
  }
  get isHiddenFromTranscript() {
    return this._model.isHiddenFromTranscript;
  }
  get shouldBeBlocked() {
    return this._model.shouldBeBlocked;
  }
  get slashCommand() {
    return this._model.response?.slashCommand;
  }
  get agentOrSlashCommandDetected() {
    return this._model.response?.agentOrSlashCommandDetected ?? false;
  }
  get attachedContext() {
    return this._model.attachedContext;
  }
  get modelId() {
    return this._model.modelId;
  }
  get resolvedModelId() {
    const resolvedModel = this._model.response?.result?.metadata?.resolvedModel;
    return typeof resolvedModel === "string" ? resolvedModel : void 0;
  }
  get timestamp() {
    return this._model.timestamp;
  }
  get requestTimestamp() {
    return this._model.requestTimestamp;
  }
  get origin() {
    return this._model.origin;
  }
  get pendingKind() {
    return this._pendingKind;
  }
  get isSystemInitiated() {
    return this._model.isSystemInitiated;
  }
  get systemInitiatedLabel() {
    return this._model.systemInitiatedLabel;
  }
}
let ChatResponseViewModel = class extends Disposable {
  constructor(_model, session, instantiationService, chatAgentNameService) {
    super();
    this._model = _model;
    this.session = session;
    this.instantiationService = instantiationService;
    this.chatAgentNameService = chatAgentNameService;
    this._modelChangeCount = 0;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.renderData = void 0;
    this._vulnerabilitiesListExpanded = false;
    if (!_model.isComplete) {
      this.liveUpdateTracker = this.instantiationService.createInstance(ChatStreamStatsTracker);
    }
    const wordCountScheduler = this.liveUpdateTracker ? this._register(new RunOnceScheduler(() => {
      const wordCount = countWords(_model.entireResponse.getMarkdown());
      this.liveUpdateTracker.update({ totalWordCount: wordCount });
    }, 0)) : void 0;
    this._register(_model.onDidChange(() => {
      wordCountScheduler?.schedule();
      this._modelChangeCount++;
      this._onDidChange.fire();
    }));
  }
  get model() {
    return this._model;
  }
  get id() {
    return this._model.id;
  }
  get dataId() {
    return this._model.id + `_${this._modelChangeCount}` + (this.isLast ? "_last" : "");
  }
  get sessionResource() {
    return this._model.session.sessionResource;
  }
  get username() {
    if (this.agent) {
      const isAllowed = this.chatAgentNameService.getAgentNameRestriction(this.agent);
      if (isAllowed) {
        return this.agent.fullName || this.agent.name;
      } else {
        return getFullyQualifiedId(this.agent);
      }
    }
    return this._model.username;
  }
  get agent() {
    return this._model.agent;
  }
  get slashCommand() {
    return this._model.slashCommand;
  }
  get agentOrSlashCommandDetected() {
    return this._model.agentOrSlashCommandDetected;
  }
  get response() {
    return this._model.response;
  }
  get usedContext() {
    return this._model.usedContext;
  }
  get contentReferences() {
    return this._model.contentReferences;
  }
  get codeCitations() {
    return this._model.codeCitations;
  }
  get progressMessages() {
    return this._model.progressMessages;
  }
  get isComplete() {
    return this._model.isComplete;
  }
  get isCanceled() {
    return this._model.isCanceled;
  }
  get shouldBeBlocked() {
    return this._model.shouldBeBlocked;
  }
  get shouldBeRemovedOnSend() {
    return this._model.shouldBeRemovedOnSend;
  }
  get isHiddenFromTranscript() {
    return this._model.isHiddenFromTranscript;
  }
  get isCompleteAddedRequest() {
    return this._model.isCompleteAddedRequest;
  }
  get isTerminalCommand() {
    return this._model.request?.isTerminalCommand ?? false;
  }
  get replyFollowups() {
    return this._model.followups?.filter((f) => f.kind === "reply");
  }
  get result() {
    return this._model.result;
  }
  get errorDetails() {
    return this.result?.errorDetails;
  }
  get vote() {
    return this._model.vote;
  }
  get requestId() {
    return this._model.requestId;
  }
  get isStale() {
    return this._model.isStale;
  }
  get isLast() {
    return this.session.getItems().at(-1) === this;
  }
  get usedReferencesExpanded() {
    if (typeof this._usedReferencesExpanded === "boolean") {
      return this._usedReferencesExpanded;
    }
    return void 0;
  }
  set usedReferencesExpanded(v) {
    this._usedReferencesExpanded = v;
  }
  get vulnerabilitiesListExpanded() {
    return this._vulnerabilitiesListExpanded;
  }
  set vulnerabilitiesListExpanded(v) {
    this._vulnerabilitiesListExpanded = v;
  }
  get contentUpdateTimings() {
    return this.liveUpdateTracker?.data;
  }
  get confirmationAdjustedTimestamp() {
    return this._model.confirmationAdjustedTimestamp;
  }
  get usageObs() {
    return this._model.usageObs;
  }
  get completionTokenCountObs() {
    return this._model.completionTokenCountObs;
  }
  setVote(vote) {
    this._modelChangeCount++;
    this._model.setVote(vote);
  }
  setEditApplied(edit, editCount) {
    this._modelChangeCount++;
    this._model.setEditApplied(edit, editCount);
  }
};
ChatResponseViewModel = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IChatAgentNameService)
], ChatResponseViewModel);
export {
  ChatRequestViewModel,
  ChatResponseViewModel,
  ChatViewModel,
  assertIsResponseVM,
  getStickyScrollTargetItem,
  isChatTreeItem,
  isPendingDividerVM,
  isRequestVM,
  isResponseVM
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcbW9kZWxcXGNoYXRWaWV3TW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24sIENoYXRSZXF1ZXN0UXVldWVLaW5kLCBJQ2hhdENvZGVDaXRhdGlvbiwgSUNoYXRDb250ZW50UmVmZXJlbmNlLCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0LCBJQ2hhdEZvbGxvd3VwLCBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQsIElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nLCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3csIElDaGF0UGxhblJldmlldywgSUNoYXRQcm9ncmVzc01lc3NhZ2UsIElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscywgSUNoYXRUYXNrLCBJQ2hhdFVzYWdlLCBJQ2hhdFVzZWRDb250ZXh0IH0gZnJvbSAnLi4vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0RnVsbHlRdWFsaWZpZWRJZCwgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50TmFtZVNlcnZpY2UsIElDaGF0QWdlbnRSZXN1bHQgfSBmcm9tICcuLi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdFByb2dyZXNzUmVuZGVyYWJsZVJlc3BvbnNlQ29udGVudCwgSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQsIElDaGF0UmVxdWVzdE1vZGVsLCBJQ2hhdFJlc3BvbnNlTW9kZWwsIElDaGF0VGV4dEVkaXRHcm91cCwgSVJlc3BvbnNlIH0gZnJvbSAnLi9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFN0cmVhbVN0YXRzVHJhY2tlciwgSUNoYXRTdHJlYW1TdGF0cyB9IGZyb20gJy4vY2hhdFN0cmVhbVN0YXRzLmpzJztcbmltcG9ydCB7IGNvdW50V29yZHMgfSBmcm9tICcuL2NoYXRXb3JkQ291bnRlci5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1JlcXVlc3RWTShpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwge1xuXHRyZXR1cm4gISFpdGVtICYmIHR5cGVvZiBpdGVtID09PSAnb2JqZWN0JyAmJiAnbWVzc2FnZScgaW4gaXRlbTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzUmVzcG9uc2VWTShpdGVtOiB1bmtub3duKTogaXRlbSBpcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHtcblx0cmV0dXJuICEhaXRlbSAmJiB0eXBlb2YgKGl0ZW0gYXMgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCkuc2V0Vm90ZSAhPT0gJ3VuZGVmaW5lZCc7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1BlbmRpbmdEaXZpZGVyVk0oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSUNoYXRQZW5kaW5nRGl2aWRlclZpZXdNb2RlbCB7XG5cdHJldHVybiAhIWl0ZW0gJiYgdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIChpdGVtIGFzIElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwpLmtpbmQgPT09ICdwZW5kaW5nRGl2aWRlcic7XG59XG5cbmludGVyZmFjZSBJQ2hhdFZpZXdNb2RlbEl0ZW1XaXRoUGVuZGluZ1N0YXRlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkga2luZD86IHN0cmluZztcblx0cmVhZG9ubHkgcGVuZGluZ0tpbmQ/OiBDaGF0UmVxdWVzdFF1ZXVlS2luZDtcbn1cblxuZnVuY3Rpb24gaXNQZW5kaW5nQ2hhdFZpZXdNb2RlbEl0ZW0oaXRlbTogSUNoYXRWaWV3TW9kZWxJdGVtV2l0aFBlbmRpbmdTdGF0ZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXRlbS5raW5kID09PSAncGVuZGluZ0RpdmlkZXInIHx8IGl0ZW0ucGVuZGluZ0tpbmQgIT09IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBUaGUgYWN0aXZlIHJlc3BvbnNlIHRoYXQgY29udGVudCBzdHJlYW1zIGludG86IHRoZSBsYXN0IG5vbi1wZW5kaW5nIGl0ZW0sIGlnbm9yaW5nXG4gKiB0cmFpbGluZyBxdWV1ZWQvc3RlZXJpbmcgcm93cyAoYW5kIHRoZWlyIGRpdmlkZXJzKS4gRmFsbHMgYmFjayB0byB0aGUgbGFzdCBpdGVtIHdoZW5cbiAqIGV2ZXJ5dGhpbmcgaXMgcGVuZGluZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFN0aWNreVNjcm9sbFRhcmdldEl0ZW08VCBleHRlbmRzIElDaGF0Vmlld01vZGVsSXRlbVdpdGhQZW5kaW5nU3RhdGU+KGl0ZW1zOiByZWFkb25seSBUW10pOiBUIHwgdW5kZWZpbmVkIHtcblx0Zm9yIChsZXQgaSA9IGl0ZW1zLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2ldO1xuXHRcdGlmICghaXNQZW5kaW5nQ2hhdFZpZXdNb2RlbEl0ZW0oaXRlbSkpIHtcblx0XHRcdHJldHVybiBpdGVtO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gaXRlbXMuYXQoLTEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNDaGF0VHJlZUl0ZW0oaXRlbTogdW5rbm93bik6IGl0ZW0gaXMgSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB7XG5cdHJldHVybiBpc1JlcXVlc3RWTShpdGVtKSB8fCBpc1Jlc3BvbnNlVk0oaXRlbSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRJc1Jlc3BvbnNlVk0oaXRlbTogdW5rbm93bik6IGFzc2VydHMgaXRlbSBpcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHtcblx0aWYgKCFpc1Jlc3BvbnNlVk0oaXRlbSkpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGl0ZW0gdG8gYmUgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCcpO1xuXHR9XG59XG5cbmV4cG9ydCB0eXBlIElDaGF0Vmlld01vZGVsQ2hhbmdlRXZlbnQgPSBJQ2hhdEFkZFJlcXVlc3RFdmVudCB8IElDaGFuZ2VQbGFjZWhvbGRlckV2ZW50IHwgSUNoYXRTZXNzaW9uSW5pdEV2ZW50IHwgSUNoYXRTZXRIaWRkZW5FdmVudCB8IG51bGw7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRBZGRSZXF1ZXN0RXZlbnQge1xuXHRraW5kOiAnYWRkUmVxdWVzdCc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYW5nZVBsYWNlaG9sZGVyRXZlbnQge1xuXHRraW5kOiAnY2hhbmdlUGxhY2Vob2xkZXInO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0U2Vzc2lvbkluaXRFdmVudCB7XG5cdGtpbmQ6ICdpbml0aWFsaXplJztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFNldEhpZGRlbkV2ZW50IHtcblx0a2luZDogJ3NldEhpZGRlbic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRWaWV3TW9kZWwge1xuXHRyZWFkb25seSBtb2RlbDogSUNoYXRNb2RlbDtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZU1vZGVsOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PElDaGF0Vmlld01vZGVsQ2hhbmdlRXZlbnQ+O1xuXHRyZWFkb25seSBpbnB1dFBsYWNlaG9sZGVyPzogc3RyaW5nO1xuXHRnZXRJdGVtcygpOiAoSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB8IElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwpW107XG5cdHNldElucHV0UGxhY2Vob2xkZXIodGV4dDogc3RyaW5nKTogdm9pZDtcblx0cmVzZXRJbnB1dFBsYWNlaG9sZGVyKCk6IHZvaWQ7XG5cdGVkaXRpbmc/OiBJQ2hhdFJlcXVlc3RWaWV3TW9kZWw7XG5cdHNldEVkaXRpbmcoZWRpdGluZzogSUNoYXRSZXF1ZXN0Vmlld01vZGVsKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlcXVlc3RWaWV3TW9kZWwge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcblx0LyoqIFRoaXMgSUQgdXBkYXRlcyBldmVyeSB0aW1lIHRoZSB1bmRlcmx5aW5nIGRhdGEgY2hhbmdlcyAqL1xuXHRyZWFkb25seSBkYXRhSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdXNlcm5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgYXZhdGFySWNvbj86IFVSSSB8IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgbWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0IHwgSUNoYXRGb2xsb3d1cDtcblx0cmVhZG9ubHkgbWVzc2FnZVRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXR0ZW1wdDogbnVtYmVyO1xuXHRyZWFkb25seSB2YXJpYWJsZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblx0Y3VycmVudFJlbmRlcmVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbnRlbnRSZWZlcmVuY2VzPzogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+O1xuXHRyZWFkb25seSBjb25maXJtYXRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNob3VsZEJlUmVtb3ZlZE9uU2VuZDogSUNoYXRSZXF1ZXN0RGlzYWJsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzSGlkZGVuRnJvbVRyYW5zY3JpcHQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQ29tcGxldGU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzQ29tcGxldGVBZGRlZFJlcXVlc3Q6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVGVybWluYWxDb21tYW5kOiBib29sZWFuO1xuXHRyZWFkb25seSBzbGFzaENvbW1hbmQ6IElDaGF0QWdlbnRDb21tYW5kIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBhZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3VsZEJlQmxvY2tlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGF0dGFjaGVkQ29udGV4dD86IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblx0cmVhZG9ubHkgbW9kZWxJZD86IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb2x2ZWRNb2RlbElkPzogc3RyaW5nO1xuXHRyZWFkb25seSB0aW1lc3RhbXA6IG51bWJlcjtcblx0cmVhZG9ubHkgcmVxdWVzdFRpbWVzdGFtcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHQvKiogVGhlIGtpbmQgb2YgcGVuZGluZyByZXF1ZXN0LCBvciB1bmRlZmluZWQgaWYgbm90IHBlbmRpbmcgKi9cblx0cmVhZG9ubHkgcGVuZGluZ0tpbmQ/OiBDaGF0UmVxdWVzdFF1ZXVlS2luZDtcblx0cmVhZG9ubHkgaXNTeXN0ZW1Jbml0aWF0ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBzeXN0ZW1Jbml0aWF0ZWRMYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgb3JpZ2luPzogSUNoYXRSZXF1ZXN0TW9kZWxbJ29yaWdpbiddO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVzcG9uc2VNYXJrZG93blJlbmRlckRhdGEge1xuXHRyZW5kZXJlZFdvcmRDb3VudDogbnVtYmVyO1xuXHRsYXN0UmVuZGVyVGltZTogbnVtYmVyO1xuXHRpc0Z1bGx5UmVuZGVyZWQ6IGJvb2xlYW47XG5cdG9yaWdpbmFsTWFya2Rvd246IElNYXJrZG93blN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlTWFya2Rvd25SZW5kZXJEYXRhMiB7XG5cdHJlbmRlcmVkV29yZENvdW50OiBudW1iZXI7XG5cdGxhc3RSZW5kZXJUaW1lOiBudW1iZXI7XG5cdGlzRnVsbHlSZW5kZXJlZDogYm9vbGVhbjtcblx0b3JpZ2luYWxNYXJrZG93bjogSU1hcmtkb3duU3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UHJvZ3Jlc3NNZXNzYWdlUmVuZGVyRGF0YSB7XG5cdHByb2dyZXNzTWVzc2FnZTogSUNoYXRQcm9ncmVzc01lc3NhZ2U7XG5cblx0LyoqXG5cdCAqIEluZGljYXRlcyB3aGV0aGVyIHRoaXMgaXMgcGFydCBvZiBhIGdyb3VwIG9mIHByb2dyZXNzIG1lc3NhZ2VzIHRoYXQgYXJlIGF0IHRoZSBlbmQgb2YgdGhlIHJlc3BvbnNlLlxuXHQgKiAoTm90IHdoZXRoZXIgdGhpcyBwYXJ0aWN1bGFyIGl0ZW0gaXMgdGhlIHZlcnkgbGFzdCBvbmUgaW4gdGhlIHJlc3BvbnNlKS5cblx0ICogTmVlZCB0byByZS1yZW5kZXIgYW5kIGFkZCB0byBwYXJ0c1RvUmVuZGVyIHdoZW4gdGhpcyBjaGFuZ2VzLlxuXHQgKi9cblx0aXNBdEVuZE9mUmVzcG9uc2U6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyBwcm9ncmVzcyBtZXNzYWdlIHRoZSB2ZXJ5IGxhc3QgaXRlbSBpbiB0aGUgcmVzcG9uc2UuXG5cdCAqIE5lZWQgdG8gcmUtcmVuZGVyIHRvIHVwZGF0ZSBzcGlubmVyIHZzIGNoZWNrIHdoZW4gdGhpcyBjaGFuZ2VzLlxuXHQgKi9cblx0aXNMYXN0OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0VGFza1JlbmRlckRhdGEge1xuXHR0YXNrOiBJQ2hhdFRhc2s7XG5cdGlzU2V0dGxlZDogYm9vbGVhbjtcblx0cHJvZ3Jlc3NMZW5ndGg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlc3BvbnNlUmVuZGVyRGF0YSB7XG5cdHJlbmRlcmVkUGFydHM6IElDaGF0UmVuZGVyZXJDb250ZW50W107XG5cblx0cmVuZGVyZWRXb3JkQ291bnQ6IG51bWJlcjtcblx0bGFzdFJlbmRlclRpbWU6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBDb250ZW50IHR5cGUgZm9yIHJlZmVyZW5jZXMgdXNlZCBkdXJpbmcgcmVuZGVyaW5nLCBub3QgaW4gdGhlIG1vZGVsXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRSZWZlcmVuY2VzIHtcblx0cmVmZXJlbmNlczogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+O1xuXHRraW5kOiAncmVmZXJlbmNlcyc7XG59XG5cbi8qKlxuICogQ29udGVudCB0eXBlIGZvciB0aGUgXCJXb3JraW5nXCIgcHJvZ3Jlc3MgbWVzc2FnZVxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0V29ya2luZ1Byb2dyZXNzIHtcblx0a2luZDogJ3dvcmtpbmcnO1xuXHRjb250ZW50PzogSU1hcmtkb3duU3RyaW5nO1xufVxuXG5cbi8qKlxuICogQ29udGVudCB0eXBlIGZvciBjaXRhdGlvbnMgdXNlZCBkdXJpbmcgcmVuZGVyaW5nLCBub3QgaW4gdGhlIG1vZGVsXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRDb2RlQ2l0YXRpb25zIHtcblx0Y2l0YXRpb25zOiBSZWFkb25seUFycmF5PElDaGF0Q29kZUNpdGF0aW9uPjtcblx0a2luZDogJ2NvZGVDaXRhdGlvbnMnO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0RXJyb3JEZXRhaWxzUGFydCB7XG5cdGtpbmQ6ICdlcnJvckRldGFpbHMnO1xuXHRlcnJvckRldGFpbHM6IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHM7XG5cdGlzTGFzdDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdENoYW5nZXNTdW1tYXJ5UGFydCB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdjaGFuZ2VzU3VtbWFyeSc7XG5cdHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFR1cm5QaWxsc1BhcnQge1xuXHRyZWFkb25seSBraW5kOiAndHVyblBpbGxzJztcblx0cmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBpc0xhc3RUdXJuOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFR5cGUgZm9yIGNvbnRlbnQgcGFydHMgcmVuZGVyZWQgYnkgSUNoYXRMaXN0UmVuZGVyZXIgKG5vdCBuZWNlc3NhcmlseSBpbiB0aGUgbW9kZWwpXG4gKi9cbmV4cG9ydCB0eXBlIElDaGF0UmVuZGVyZXJDb250ZW50ID0gSUNoYXRQcm9ncmVzc1JlbmRlcmFibGVSZXNwb25zZUNvbnRlbnQgfCBJQ2hhdFJlZmVyZW5jZXMgfCBJQ2hhdENvZGVDaXRhdGlvbnMgfCBJQ2hhdEVycm9yRGV0YWlsc1BhcnQgfCBJQ2hhdENoYW5nZXNTdW1tYXJ5UGFydCB8IElDaGF0V29ya2luZ1Byb2dyZXNzIHwgSUNoYXRNY3BTZXJ2ZXJzU3RhcnRpbmcgfCBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQgfCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1Nsb3cgfCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwgfCBJQ2hhdFBsYW5SZXZpZXcgfCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0IHwgSUNoYXRUdXJuUGlsbHNQYXJ0O1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwge1xuXHRyZWFkb25seSBtb2RlbDogSUNoYXRSZXNwb25zZU1vZGVsO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uOiBJQ2hhdFZpZXdNb2RlbDtcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdC8qKiBUaGlzIElEIHVwZGF0ZXMgZXZlcnkgdGltZSB0aGUgdW5kZXJseWluZyBkYXRhIGNoYW5nZXMgKi9cblx0cmVhZG9ubHkgZGF0YUlkOiBzdHJpbmc7XG5cdC8qKiBUaGUgSUQgb2YgdGhlIGFzc29jaWF0ZWQgSUNoYXRSZXF1ZXN0Vmlld01vZGVsICovXG5cdHJlYWRvbmx5IHJlcXVlc3RJZDogc3RyaW5nO1xuXHRyZWFkb25seSB1c2VybmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudD86IElDaGF0QWdlbnREYXRhO1xuXHRyZWFkb25seSBzbGFzaENvbW1hbmQ/OiBJQ2hhdEFnZW50Q29tbWFuZDtcblx0cmVhZG9ubHkgYWdlbnRPclNsYXNoQ29tbWFuZERldGVjdGVkOiBib29sZWFuO1xuXHRyZWFkb25seSByZXNwb25zZTogSVJlc3BvbnNlO1xuXHRyZWFkb25seSB1c2VkQ29udGV4dDogSUNoYXRVc2VkQ29udGV4dCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29udGVudFJlZmVyZW5jZXM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb250ZW50UmVmZXJlbmNlPjtcblx0cmVhZG9ubHkgY29kZUNpdGF0aW9uczogUmVhZG9ubHlBcnJheTxJQ2hhdENvZGVDaXRhdGlvbj47XG5cdHJlYWRvbmx5IHByb2dyZXNzTWVzc2FnZXM6IFJlYWRvbmx5QXJyYXk8SUNoYXRQcm9ncmVzc01lc3NhZ2U+O1xuXHRyZWFkb25seSBpc0NvbXBsZXRlOiBib29sZWFuO1xuXHRyZWFkb25seSBpc0NhbmNlbGVkOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1N0YWxlOiBib29sZWFuO1xuXHRyZWFkb25seSB2b3RlOiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSByZXBseUZvbGxvd3Vwcz86IElDaGF0Rm9sbG93dXBbXTtcblx0cmVhZG9ubHkgZXJyb3JEZXRhaWxzPzogSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscztcblx0cmVhZG9ubHkgcmVzdWx0PzogSUNoYXRBZ2VudFJlc3VsdDtcblx0cmVhZG9ubHkgY29udGVudFVwZGF0ZVRpbWluZ3M/OiBJQ2hhdFN0cmVhbVN0YXRzO1xuXHRyZWFkb25seSBjb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcDogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cmVhZG9ubHkgdXNhZ2VPYnM6IElPYnNlcnZhYmxlPElDaGF0VXNhZ2UgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBjb21wbGV0aW9uVG9rZW5Db3VudE9iczogSU9ic2VydmFibGU8bnVtYmVyIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgc2hvdWxkQmVSZW1vdmVkT25TZW5kOiBJQ2hhdFJlcXVlc3REaXNhYmxlbWVudCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaXNIaWRkZW5Gcm9tVHJhbnNjcmlwdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNDb21wbGV0ZUFkZGVkUmVxdWVzdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNUZXJtaW5hbENvbW1hbmQ6IGJvb2xlYW47XG5cdHJlbmRlckRhdGE/OiBJQ2hhdFJlc3BvbnNlUmVuZGVyRGF0YTtcblx0Y3VycmVudFJlbmRlcmVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHNldFZvdGUodm90ZTogQ2hhdEFnZW50Vm90ZURpcmVjdGlvbik6IHZvaWQ7XG5cdHVzZWRSZWZlcmVuY2VzRXhwYW5kZWQ/OiBib29sZWFuO1xuXHR2dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQ6IGJvb2xlYW47XG5cdHNldEVkaXRBcHBsaWVkKGVkaXQ6IElDaGF0VGV4dEVkaXRHcm91cCwgZWRpdENvdW50OiBudW1iZXIpOiB2b2lkO1xuXHRyZWFkb25seSBzaG91bGRCZUJsb2NrZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwge1xuXHRyZWFkb25seSBraW5kOiAncGVuZGluZ0RpdmlkZXInO1xuXHRyZWFkb25seSBpZDogc3RyaW5nOyAvLyBlLmcuLCAncGVuZGluZy1kaXZpZGVyLXN0ZWVyaW5nJyBvciAncGVuZGluZy1kaXZpZGVyLXF1ZXVlZCdcblx0cmVhZG9ubHkgc2Vzc2lvblJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGlzQ29tcGxldGU6IHRydWU7XG5cdHJlYWRvbmx5IGRpdmlkZXJLaW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZDtcblx0cmVhZG9ubHkgaXNTeXN0ZW1Jbml0aWF0ZWQ/OiBib29sZWFuO1xuXHRjdXJyZW50UmVuZGVyZWRIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFZpZXdNb2RlbE9wdGlvbnMge1xuXHQvKipcblx0ICogTWF4aW11bSBudW1iZXIgb2YgaXRlbXMgdG8gcmV0dXJuIGZyb20gZ2V0SXRlbXMoKS5cblx0ICogV2hlbiBzZXQsIG9ubHkgdGhlIGxhc3QgTiBpdGVtcyBhcmUgcmV0dXJuZWQgKG1vc3QgcmVjZW50IHJlcXVlc3QvcmVzcG9uc2UgcGFpcnMpLlxuXHQgKi9cblx0cmVhZG9ubHkgbWF4VmlzaWJsZUl0ZW1zPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXdNb2RlbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdFZpZXdNb2RlbCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlTW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlTW9kZWwgPSB0aGlzLl9vbkRpZERpc3Bvc2VNb2RlbC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0Vmlld01vZGVsQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zOiAoQ2hhdFJlcXVlc3RWaWV3TW9kZWwgfCBDaGF0UmVzcG9uc2VWaWV3TW9kZWwpW10gPSBbXTtcblxuXHRwcml2YXRlIF9pbnB1dFBsYWNlaG9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGdldCBpbnB1dFBsYWNlaG9sZGVyKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0UGxhY2Vob2xkZXI7XG5cdH1cblxuXHRnZXQgbW9kZWwoKTogSUNoYXRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsO1xuXHR9XG5cblx0c2V0SW5wdXRQbGFjZWhvbGRlcih0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dFBsYWNlaG9sZGVyID0gdGV4dDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsga2luZDogJ2NoYW5nZVBsYWNlaG9sZGVyJyB9KTtcblx0fVxuXG5cdHJlc2V0SW5wdXRQbGFjZWhvbGRlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dFBsYWNlaG9sZGVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBraW5kOiAnY2hhbmdlUGxhY2Vob2xkZXInIH0pO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25SZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSUNoYXRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJQ2hhdFZpZXdNb2RlbE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRfbW9kZWwuZ2V0UmVxdWVzdHMoKS5mb3JFYWNoKChyZXF1ZXN0LCBpKSA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0TW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0Vmlld01vZGVsLCByZXF1ZXN0KTtcblx0XHRcdHRoaXMuX2l0ZW1zLnB1c2gocmVxdWVzdE1vZGVsKTtcblxuXHRcdFx0aWYgKHJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdFx0dGhpcy5vbkFkZFJlc3BvbnNlKHJlcXVlc3QucmVzcG9uc2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX21vZGVsLm9uRGlkRGlzcG9zZSgoKSA9PiB0aGlzLl9vbkRpZERpc3Bvc2VNb2RlbC5maXJlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfbW9kZWwub25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShudWxsKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9tb2RlbC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09ICdhZGRSZXF1ZXN0Jykge1xuXHRcdFx0XHRjb25zdCByZXF1ZXN0TW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0Vmlld01vZGVsLCBlLnJlcXVlc3QpO1xuXHRcdFx0XHR0aGlzLl9pdGVtcy5wdXNoKHJlcXVlc3RNb2RlbCk7XG5cblx0XHRcdFx0aWYgKGUucmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRcdHRoaXMub25BZGRSZXNwb25zZShlLnJlcXVlc3QucmVzcG9uc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGUua2luZCA9PT0gJ2FkZFJlc3BvbnNlJykge1xuXHRcdFx0XHR0aGlzLm9uQWRkUmVzcG9uc2UoZS5yZXNwb25zZSk7XG5cdFx0XHR9IGVsc2UgaWYgKGUua2luZCA9PT0gJ3JlbW92ZVJlcXVlc3QnKSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RJZHggPSB0aGlzLl9pdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpc1JlcXVlc3RWTShpdGVtKSAmJiBpdGVtLmlkID09PSBlLnJlcXVlc3RJZCk7XG5cdFx0XHRcdGlmIChyZXF1ZXN0SWR4ID49IDApIHtcblx0XHRcdFx0XHR0aGlzLl9pdGVtcy5zcGxpY2UocmVxdWVzdElkeCwgMSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXNwb25zZUlkeCA9IGUucmVzcG9uc2VJZCAmJiB0aGlzLl9pdGVtcy5maW5kSW5kZXgoaXRlbSA9PiBpc1Jlc3BvbnNlVk0oaXRlbSkgJiYgaXRlbS5pZCA9PT0gZS5yZXNwb25zZUlkKTtcblx0XHRcdFx0aWYgKHR5cGVvZiByZXNwb25zZUlkeCA9PT0gJ251bWJlcicgJiYgcmVzcG9uc2VJZHggPj0gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGl0ZW1zID0gdGhpcy5faXRlbXMuc3BsaWNlKHJlc3BvbnNlSWR4LCAxKTtcblx0XHRcdFx0XHRjb25zdCBpdGVtID0gaXRlbXNbMF07XG5cdFx0XHRcdFx0aWYgKGl0ZW0gaW5zdGFuY2VvZiBDaGF0UmVzcG9uc2VWaWV3TW9kZWwpIHtcblx0XHRcdFx0XHRcdGl0ZW0uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2RlbEV2ZW50VG9WbUV2ZW50OiBJQ2hhdFZpZXdNb2RlbENoYW5nZUV2ZW50ID1cblx0XHRcdFx0ZS5raW5kID09PSAnYWRkUmVxdWVzdCcgPyB7IGtpbmQ6ICdhZGRSZXF1ZXN0JyB9XG5cdFx0XHRcdFx0OiBlLmtpbmQgPT09ICdpbml0aWFsaXplJyA/IHsga2luZDogJ2luaXRpYWxpemUnIH1cblx0XHRcdFx0XHRcdDogZS5raW5kID09PSAnc2V0SGlkZGVuJyA/IHsga2luZDogJ3NldEhpZGRlbicgfVxuXHRcdFx0XHRcdFx0XHQ6IG51bGw7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKG1vZGVsRXZlbnRUb1ZtRXZlbnQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25BZGRSZXNwb25zZShyZXNwb25zZU1vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwpIHtcblx0XHRjb25zdCByZXNwb25zZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlc3BvbnNlVmlld01vZGVsLCByZXNwb25zZU1vZGVsLCB0aGlzKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZXNwb25zZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZShudWxsKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5faXRlbXMucHVzaChyZXNwb25zZSk7XG5cdH1cblxuXHRnZXRJdGVtcygpOiAoSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB8IElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwpW10ge1xuXHRcdGxldCBpdGVtczogKElDaGF0UmVxdWVzdFZpZXdNb2RlbCB8IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfCBJQ2hhdFBlbmRpbmdEaXZpZGVyVmlld01vZGVsKVtdID0gdGhpcy5faXRlbXMuZmlsdGVyKChpdGVtKSA9PiB7XG5cdFx0XHRpZiAoaXRlbS5pc0hpZGRlbkZyb21UcmFuc2NyaXB0IHx8IChpdGVtLnNob3VsZEJlUmVtb3ZlZE9uU2VuZCAmJiAhaXRlbS5zaG91bGRCZVJlbW92ZWRPblNlbmQuYWZ0ZXJVbmRvU3RvcCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/Lm1heFZpc2libGVJdGVtcyAhPT0gdW5kZWZpbmVkICYmIGl0ZW1zLmxlbmd0aCA+IHRoaXMuX29wdGlvbnMubWF4VmlzaWJsZUl0ZW1zKSB7XG5cdFx0XHRpdGVtcyA9IGl0ZW1zLnNsaWNlKC10aGlzLl9vcHRpb25zLm1heFZpc2libGVJdGVtcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3RzID0gdGhpcy5fbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkuZmlsdGVyKHBlbmRpbmcgPT4gIXBlbmRpbmcucmVxdWVzdC5pc0hpZGRlbkZyb21UcmFuc2NyaXB0KTtcblx0XHRpZiAocGVuZGluZ1JlcXVlc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIFNlcGFyYXRlIHN0ZWVyaW5nIGFuZCBxdWV1ZWQgcmVxdWVzdHNcblx0XHRcdGNvbnN0IHN0ZWVyaW5nUmVxdWVzdHMgPSBwZW5kaW5nUmVxdWVzdHMuZmlsdGVyKHAgPT4gcC5raW5kID09PSBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZyk7XG5cdFx0XHRjb25zdCBxdWV1ZWRSZXF1ZXN0cyA9IHBlbmRpbmdSZXF1ZXN0cy5maWx0ZXIocCA9PiBwLmtpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCk7XG5cblx0XHRcdC8vIEFkZCBzdGVlcmluZyByZXF1ZXN0cyB3aXRoIHRoZWlyIGRpdmlkZXIgZmlyc3Rcblx0XHRcdGlmIChzdGVlcmluZ1JlcXVlc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgaXNTeXN0ZW1Jbml0aWF0ZWQgPSBzdGVlcmluZ1JlcXVlc3RzLmV2ZXJ5KHAgPT4gcC5yZXF1ZXN0LmlzU3lzdGVtSW5pdGlhdGVkKTtcblx0XHRcdFx0aXRlbXMucHVzaCh7IGtpbmQ6ICdwZW5kaW5nRGl2aWRlcicsIGlkOiAncGVuZGluZy1kaXZpZGVyLXN0ZWVyaW5nJywgc2Vzc2lvblJlc291cmNlOiB0aGlzLl9tb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGlzQ29tcGxldGU6IHRydWUsIGRpdmlkZXJLaW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZywgaXNTeXN0ZW1Jbml0aWF0ZWQsIGN1cnJlbnRSZW5kZXJlZEhlaWdodDogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2Ygc3RlZXJpbmdSZXF1ZXN0cykge1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RWTSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RWaWV3TW9kZWwsIHBlbmRpbmcucmVxdWVzdCwgcGVuZGluZy5raW5kKTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHJlcXVlc3RWTSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQWRkIHF1ZXVlZCByZXF1ZXN0cyB3aXRoIHRoZWlyIGRpdmlkZXJcblx0XHRcdGlmIChxdWV1ZWRSZXF1ZXN0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiAncGVuZGluZ0RpdmlkZXInLCBpZDogJ3BlbmRpbmctZGl2aWRlci1xdWV1ZWQnLCBzZXNzaW9uUmVzb3VyY2U6IHRoaXMuX21vZGVsLnNlc3Npb25SZXNvdXJjZSwgaXNDb21wbGV0ZTogdHJ1ZSwgZGl2aWRlcktpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwgY3VycmVudFJlbmRlcmVkSGVpZ2h0OiB1bmRlZmluZWQgfSk7XG5cdFx0XHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiBxdWV1ZWRSZXF1ZXN0cykge1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RWTSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RWaWV3TW9kZWwsIHBlbmRpbmcucmVxdWVzdCwgcGVuZGluZy5raW5kKTtcblx0XHRcdFx0XHRpdGVtcy5wdXNoKHJlcXVlc3RWTSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXG5cdHByaXZhdGUgX2VkaXRpbmc6IElDaGF0UmVxdWVzdFZpZXdNb2RlbCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Z2V0IGVkaXRpbmcoKTogSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdGluZztcblx0fVxuXG5cdHNldEVkaXRpbmcoZWRpdGluZzogSUNoYXRSZXF1ZXN0Vmlld01vZGVsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWRpdGluZyAmJiBlZGl0aW5nICYmIHRoaXMuZWRpdGluZy5pZCA9PT0gZWRpdGluZy5pZCkge1xuXHRcdFx0cmV0dXJuOyAvLyBhbHJlYWR5IGVkaXRpbmcgdGhpcyByZXF1ZXN0XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWRpdGluZyA9IGVkaXRpbmc7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NlKHRoaXMuX2l0ZW1zLmZpbHRlcigoaXRlbSk6IGl0ZW0gaXMgQ2hhdFJlc3BvbnNlVmlld01vZGVsID0+IGl0ZW0gaW5zdGFuY2VvZiBDaGF0UmVzcG9uc2VWaWV3TW9kZWwpKTtcblx0XHR0aGlzLl9pdGVtcy5sZW5ndGggPSAwO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0UmVxdWVzdFZpZXdNb2RlbCBpbXBsZW1lbnRzIElDaGF0UmVxdWVzdFZpZXdNb2RlbCB7XG5cdGdldCBpZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaWQ7XG5cdH1cblxuXHQvKipcblx0ICogQW4gSUQgdGhhdCBjaGFuZ2VzIHdoZW4gdGhlIHJlcXVlc3Qgc2hvdWxkIGJlIHJlLXJlbmRlcmVkLlxuXHQgKi9cblx0Z2V0IGRhdGFJZCgpIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5pZH1fJHt0aGlzLl9tb2RlbC52ZXJzaW9uICsgKHRoaXMuX21vZGVsLnJlc3BvbnNlPy5pc0NvbXBsZXRlID8gMSA6IDApfWA7XG5cdH1cblxuXHRnZXQgc2Vzc2lvblJlc291cmNlKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdGdldCB1c2VybmFtZSgpIHtcblx0XHRyZXR1cm4gJ1VzZXInO1xuXHR9XG5cblx0Z2V0IGF2YXRhckljb24oKTogVGhlbWVJY29uIHtcblx0XHRyZXR1cm4gQ29kaWNvbi5hY2NvdW50O1xuXHR9XG5cblx0Z2V0IG1lc3NhZ2UoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLm1lc3NhZ2U7XG5cdH1cblxuXHRnZXQgbWVzc2FnZVRleHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMubWVzc2FnZS50ZXh0O1xuXHR9XG5cblx0Z2V0IGF0dGVtcHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmF0dGVtcHQ7XG5cdH1cblxuXHRnZXQgdmFyaWFibGVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC52YXJpYWJsZURhdGEudmFyaWFibGVzO1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRSZWZlcmVuY2VzKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXNwb25zZT8uY29udGVudFJlZmVyZW5jZXM7XG5cdH1cblxuXHRnZXQgY29uZmlybWF0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5jb25maXJtYXRpb247XG5cdH1cblxuXHRnZXQgaXNDb21wbGV0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVzcG9uc2U/LmlzQ29tcGxldGUgPz8gZmFsc2U7XG5cdH1cblxuXHRnZXQgaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdDtcblx0fVxuXG5cdGdldCBpc1Rlcm1pbmFsQ29tbWFuZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaXNUZXJtaW5hbENvbW1hbmQ7XG5cdH1cblxuXHRnZXQgc2hvdWxkQmVSZW1vdmVkT25TZW5kKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5zaG91bGRCZVJlbW92ZWRPblNlbmQ7XG5cdH1cblxuXHRnZXQgaXNIaWRkZW5Gcm9tVHJhbnNjcmlwdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaXNIaWRkZW5Gcm9tVHJhbnNjcmlwdDtcblx0fVxuXG5cdGdldCBzaG91bGRCZUJsb2NrZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnNob3VsZEJlQmxvY2tlZDtcblx0fVxuXG5cdGdldCBzbGFzaENvbW1hbmQoKTogSUNoYXRBZ2VudENvbW1hbmQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXNwb25zZT8uc2xhc2hDb21tYW5kO1xuXHR9XG5cblx0Z2V0IGFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVzcG9uc2U/LmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCA/PyBmYWxzZTtcblx0fVxuXG5cdGN1cnJlbnRSZW5kZXJlZEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdGdldCBhdHRhY2hlZENvbnRleHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmF0dGFjaGVkQ29udGV4dDtcblx0fVxuXG5cdGdldCBtb2RlbElkKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5tb2RlbElkO1xuXHR9XG5cblx0Z2V0IHJlc29sdmVkTW9kZWxJZCgpIHtcblx0XHRjb25zdCByZXNvbHZlZE1vZGVsID0gdGhpcy5fbW9kZWwucmVzcG9uc2U/LnJlc3VsdD8ubWV0YWRhdGE/LnJlc29sdmVkTW9kZWw7XG5cdFx0cmV0dXJuIHR5cGVvZiByZXNvbHZlZE1vZGVsID09PSAnc3RyaW5nJyA/IHJlc29sdmVkTW9kZWwgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXQgdGltZXN0YW1wKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC50aW1lc3RhbXA7XG5cdH1cblxuXHRnZXQgcmVxdWVzdFRpbWVzdGFtcCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVxdWVzdFRpbWVzdGFtcDtcblx0fVxuXG5cdGdldCBvcmlnaW4oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLm9yaWdpbjtcblx0fVxuXG5cdGdldCBwZW5kaW5nS2luZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0tpbmQ7XG5cdH1cblxuXHRnZXQgaXNTeXN0ZW1Jbml0aWF0ZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmlzU3lzdGVtSW5pdGlhdGVkO1xuXHR9XG5cblx0Z2V0IHN5c3RlbUluaXRpYXRlZExhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5zeXN0ZW1Jbml0aWF0ZWRMYWJlbDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJQ2hhdFJlcXVlc3RNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nS2luZD86IENoYXRSZXF1ZXN0UXVldWVLaW5kLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFJlc3BvbnNlVmlld01vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0UmVzcG9uc2VWaWV3TW9kZWwge1xuXHRwcml2YXRlIF9tb2RlbENoYW5nZUNvdW50ID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGdldCBtb2RlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWw7XG5cdH1cblxuXHRnZXQgaWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmlkO1xuXHR9XG5cblx0Z2V0IGRhdGFJZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaWQgK1xuXHRcdFx0YF8ke3RoaXMuX21vZGVsQ2hhbmdlQ291bnR9YCArXG5cdFx0XHQodGhpcy5pc0xhc3QgPyAnX2xhc3QnIDogJycpO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25SZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZTtcblx0fVxuXG5cdGdldCB1c2VybmFtZSgpIHtcblx0XHRpZiAodGhpcy5hZ2VudCkge1xuXHRcdFx0Y29uc3QgaXNBbGxvd2VkID0gdGhpcy5jaGF0QWdlbnROYW1lU2VydmljZS5nZXRBZ2VudE5hbWVSZXN0cmljdGlvbih0aGlzLmFnZW50KTtcblx0XHRcdGlmIChpc0FsbG93ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuYWdlbnQuZnVsbE5hbWUgfHwgdGhpcy5hZ2VudC5uYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGdldEZ1bGx5UXVhbGlmaWVkSWQodGhpcy5hZ2VudCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnVzZXJuYW1lO1xuXHR9XG5cblx0Z2V0IGFnZW50KCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5hZ2VudDtcblx0fVxuXG5cdGdldCBzbGFzaENvbW1hbmQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnNsYXNoQ29tbWFuZDtcblx0fVxuXG5cdGdldCBhZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZDtcblx0fVxuXG5cdGdldCByZXNwb25zZSgpOiBJUmVzcG9uc2Uge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXNwb25zZTtcblx0fVxuXG5cdGdldCB1c2VkQ29udGV4dCgpOiBJQ2hhdFVzZWRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwudXNlZENvbnRleHQ7XG5cdH1cblxuXHRnZXQgY29udGVudFJlZmVyZW5jZXMoKTogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRSZWZlcmVuY2U+IHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuY29udGVudFJlZmVyZW5jZXM7XG5cdH1cblxuXHRnZXQgY29kZUNpdGF0aW9ucygpOiBSZWFkb25seUFycmF5PElDaGF0Q29kZUNpdGF0aW9uPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmNvZGVDaXRhdGlvbnM7XG5cdH1cblxuXHRnZXQgcHJvZ3Jlc3NNZXNzYWdlcygpOiBSZWFkb25seUFycmF5PElDaGF0UHJvZ3Jlc3NNZXNzYWdlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnByb2dyZXNzTWVzc2FnZXM7XG5cdH1cblxuXHRnZXQgaXNDb21wbGV0ZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaXNDb21wbGV0ZTtcblx0fVxuXG5cdGdldCBpc0NhbmNlbGVkKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5pc0NhbmNlbGVkO1xuXHR9XG5cblx0Z2V0IHNob3VsZEJlQmxvY2tlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuc2hvdWxkQmVCbG9ja2VkO1xuXHR9XG5cblx0Z2V0IHNob3VsZEJlUmVtb3ZlZE9uU2VuZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuc2hvdWxkQmVSZW1vdmVkT25TZW5kO1xuXHR9XG5cblx0Z2V0IGlzSGlkZGVuRnJvbVRyYW5zY3JpcHQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmlzSGlkZGVuRnJvbVRyYW5zY3JpcHQ7XG5cdH1cblxuXHRnZXQgaXNDb21wbGV0ZUFkZGVkUmVxdWVzdCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaXNDb21wbGV0ZUFkZGVkUmVxdWVzdDtcblx0fVxuXG5cdGdldCBpc1Rlcm1pbmFsQ29tbWFuZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwucmVxdWVzdD8uaXNUZXJtaW5hbENvbW1hbmQgPz8gZmFsc2U7XG5cdH1cblxuXHRnZXQgcmVwbHlGb2xsb3d1cHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLmZvbGxvd3Vwcz8uZmlsdGVyKChmKTogZiBpcyBJQ2hhdEZvbGxvd3VwID0+IGYua2luZCA9PT0gJ3JlcGx5Jyk7XG5cdH1cblxuXHRnZXQgcmVzdWx0KCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXN1bHQ7XG5cdH1cblxuXHRnZXQgZXJyb3JEZXRhaWxzKCk6IElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnJlc3VsdD8uZXJyb3JEZXRhaWxzO1xuXHR9XG5cblx0Z2V0IHZvdGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnZvdGU7XG5cdH1cblxuXHRnZXQgcmVxdWVzdElkKCkge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5yZXF1ZXN0SWQ7XG5cdH1cblxuXHRnZXQgaXNTdGFsZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbW9kZWwuaXNTdGFsZTtcblx0fVxuXG5cdGdldCBpc0xhc3QoKTogYm9vbGVhbiB7XG5cdFx0Ly8gTk9URTogdGhpcyBpcyB1c2VkIGluIGBkYXRhSWRgIHRvIGZvcmNlIGEgcmUtcmVuZGVyIHdoZW4gdGhlIHJlc3BvbnNlIHRyYW5zaXRpb25zXG5cdFx0Ly8gYmV0d2VlbiBiZWluZyB0aGUgbGFzdCByb3cgYW5kIG5vdCwgZS5nLiB3aGVuIGEgcXVldWVkL3N0ZWVyaW5nIHJvdyBpcyBhZGRlZCBiZWxvd1xuXHRcdC8vIGl0LiBJdCBtdXN0IHJlZmxlY3QgdGhlIGFjdHVhbCBsYXN0IHJvdyBzbyB0aGUgcm93IHJlLXJlbmRlcnMgYW5kIGRyb3BzIHRoZVxuXHRcdC8vIHJlc2VydmVkLXNwYWNlIGZpbGxlciBjbGFzcy4gUHJvZ3Jlc3NpdmUgcmVuZGVyaW5nIHRhcmdldHMgdGhlIHN0cmVhbWluZyByZXNwb25zZVxuXHRcdC8vIHNlcGFyYXRlbHkgKHNlZSBgZ2V0U3RpY2t5U2Nyb2xsVGFyZ2V0SXRlbWApLlxuXHRcdHJldHVybiB0aGlzLnNlc3Npb24uZ2V0SXRlbXMoKS5hdCgtMSkgPT09IHRoaXM7XG5cdH1cblxuXHRyZW5kZXJEYXRhOiBJQ2hhdFJlc3BvbnNlUmVuZGVyRGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0Y3VycmVudFJlbmRlcmVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfdXNlZFJlZmVyZW5jZXNFeHBhbmRlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Z2V0IHVzZWRSZWZlcmVuY2VzRXhwYW5kZWQoKTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLl91c2VkUmVmZXJlbmNlc0V4cGFuZGVkID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHJldHVybiB0aGlzLl91c2VkUmVmZXJlbmNlc0V4cGFuZGVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXQgdXNlZFJlZmVyZW5jZXNFeHBhbmRlZCh2OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fdXNlZFJlZmVyZW5jZXNFeHBhbmRlZCA9IHY7XG5cdH1cblxuXHRwcml2YXRlIF92dWxuZXJhYmlsaXRpZXNMaXN0RXhwYW5kZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IHZ1bG5lcmFiaWxpdGllc0xpc3RFeHBhbmRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkO1xuXHR9XG5cblx0c2V0IHZ1bG5lcmFiaWxpdGllc0xpc3RFeHBhbmRlZCh2OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fdnVsbmVyYWJpbGl0aWVzTGlzdEV4cGFuZGVkID0gdjtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGl2ZVVwZGF0ZVRyYWNrZXI6IENoYXRTdHJlYW1TdGF0c1RyYWNrZXIgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGNvbnRlbnRVcGRhdGVUaW1pbmdzKCk6IElDaGF0U3RyZWFtU3RhdHMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmxpdmVVcGRhdGVUcmFja2VyPy5kYXRhO1xuXHR9XG5cblx0Z2V0IGNvbmZpcm1hdGlvbkFkanVzdGVkVGltZXN0YW1wKCk6IElPYnNlcnZhYmxlPG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5jb25maXJtYXRpb25BZGp1c3RlZFRpbWVzdGFtcDtcblx0fVxuXG5cdGdldCB1c2FnZU9icygpOiBJT2JzZXJ2YWJsZTxJQ2hhdFVzYWdlIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnVzYWdlT2JzO1xuXHR9XG5cblx0Z2V0IGNvbXBsZXRpb25Ub2tlbkNvdW50T2JzKCk6IElPYnNlcnZhYmxlPG51bWJlciB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbC5jb21wbGV0aW9uVG9rZW5Db3VudE9icztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJQ2hhdFJlc3BvbnNlTW9kZWwsXG5cdFx0cHVibGljIHJlYWRvbmx5IHNlc3Npb246IElDaGF0Vmlld01vZGVsLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50TmFtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnROYW1lU2VydmljZTogSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCFfbW9kZWwuaXNDb21wbGV0ZSkge1xuXHRcdFx0dGhpcy5saXZlVXBkYXRlVHJhY2tlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFN0cmVhbVN0YXRzVHJhY2tlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29yZENvdW50U2NoZWR1bGVyID0gdGhpcy5saXZlVXBkYXRlVHJhY2tlciA/IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRcdGNvbnN0IHdvcmRDb3VudCA9IGNvdW50V29yZHMoX21vZGVsLmVudGlyZVJlc3BvbnNlLmdldE1hcmtkb3duKCkpO1xuXHRcdFx0dGhpcy5saXZlVXBkYXRlVHJhY2tlciEudXBkYXRlKHsgdG90YWxXb3JkQ291bnQ6IHdvcmRDb3VudCB9KTtcblx0XHR9LCAwKSkgOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihfbW9kZWwub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0d29yZENvdW50U2NoZWR1bGVyPy5zY2hlZHVsZSgpO1xuXG5cdFx0XHQvLyBuZXcgZGF0YSAtPiBuZXcgaWQsIG5ldyBjb250ZW50IHRvIHJlbmRlclxuXHRcdFx0dGhpcy5fbW9kZWxDaGFuZ2VDb3VudCsrO1xuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c2V0Vm90ZSh2b3RlOiBDaGF0QWdlbnRWb3RlRGlyZWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxDaGFuZ2VDb3VudCsrO1xuXHRcdHRoaXMuX21vZGVsLnNldFZvdGUodm90ZSk7XG5cdH1cblxuXHRzZXRFZGl0QXBwbGllZChlZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXAsIGVkaXRDb3VudDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fbW9kZWxDaGFuZ2VDb3VudCsrO1xuXHRcdHRoaXMuX21vZGVsLnNldEVkaXRBcHBsaWVkKGVkaXQsIGVkaXRDb3VudCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFl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
