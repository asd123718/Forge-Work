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
import { renderAsPlaintext } from "../../../../../base/browser/markdownRenderer.js";
import { Disposable, DisposableResourceMap } from "../../../../../base/common/lifecycle.js";
import { autorun, autorunIterableDelta, observableValue } from "../../../../../base/common/observable.js";
import { migrateLegacyTerminalToolSpecificData } from "../../common/chat.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../common/chatService/chatService.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
var AgentSessionApprovalKind = /* @__PURE__ */ ((AgentSessionApprovalKind2) => {
  AgentSessionApprovalKind2["Terminal"] = "terminal";
  AgentSessionApprovalKind2["Question"] = "question";
  AgentSessionApprovalKind2["Other"] = "other";
  return AgentSessionApprovalKind2;
})(AgentSessionApprovalKind || {});
function agentSessionApprovalId(info) {
  return info.approvalId;
}
let AgentSessionApprovalModel = class extends Disposable {
  constructor(_chatService, _languageService) {
    super();
    this._chatService = _chatService;
    this._languageService = _languageService;
    this._approvals = /* @__PURE__ */ new Map();
    this._modelTrackers = this._register(new DisposableResourceMap());
    this._register(autorunIterableDelta(
      (reader) => this._chatService.chatModels.read(reader),
      ({ addedValues, removedValues }) => {
        for (const model of addedValues) {
          this._modelTrackers.set(model.sessionResource, this._trackModel(model));
        }
        for (const model of removedValues) {
          this._modelTrackers.deleteAndDispose(model.sessionResource);
          this._approvals.get(model.sessionResource.toString())?.set(void 0, void 0);
        }
      }
    ));
  }
  getApproval(sessionResource) {
    return this._getOrCreateApproval(sessionResource.toString());
  }
  _getOrCreateApproval(key) {
    let obs = this._approvals.get(key);
    if (!obs) {
      obs = observableValue(`sessionApproval.${key}`, void 0);
      this._approvals.set(key, obs);
    }
    return obs;
  }
  _trackModel(model) {
    const settable = this._getOrCreateApproval(model.sessionResource.toString());
    const setIfChanged = (value) => {
      const current = settable.get();
      if (current === value) {
        return;
      }
      if (current !== void 0 && value !== void 0 && current.approvalId === value.approvalId && current.kind === value.kind && current.label === value.label && current.languageId === value.languageId) {
        return;
      }
      settable.set(value, void 0);
    };
    return autorun((reader) => {
      const needsInput = model.requestNeedsInput.read(reader);
      if (!needsInput) {
        setIfChanged(void 0);
        return;
      }
      const lastResponse = model.lastRequest?.response;
      if (!lastResponse?.response?.value) {
        setIfChanged(void 0);
        return;
      }
      for (const part of lastResponse.response.value) {
        if (part.kind !== "toolInvocation" || part.toolSpecificData?.kind === "modifiedFilesConfirmation") {
          continue;
        }
        const state = part.state.read(reader);
        if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
          let label;
          let languageId;
          let kind;
          if (part.toolSpecificData?.kind === "terminal") {
            const terminalData = migrateLegacyTerminalToolSpecificData(part.toolSpecificData);
            label = terminalData.presentationOverrides?.commandLine ?? terminalData.commandLine.forDisplay ?? terminalData.commandLine.userEdited ?? terminalData.commandLine.toolEdited ?? terminalData.commandLine.original;
            languageId = this._languageService.getLanguageIdByLanguageName(terminalData.presentationOverrides?.language ?? terminalData.language) ?? void 0;
            kind = "terminal" /* Terminal */;
          } else if (needsInput.detail) {
            label = needsInput.detail;
            kind = "question" /* Question */;
          } else {
            const msg = part.invocationMessage;
            label = typeof msg === "string" ? msg : renderAsPlaintext(msg);
            kind = "other" /* Other */;
          }
          const confirmState = state;
          setIfChanged({
            approvalId: part.toolCallId,
            kind,
            label,
            languageId,
            since: /* @__PURE__ */ new Date(),
            confirm: () => confirmState.confirm({ type: ToolConfirmKind.UserAction })
          });
          return;
        }
      }
      setIfChanged(void 0);
    });
  }
};
AgentSessionApprovalModel = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, ILanguageService)
], AgentSessionApprovalModel);
export {
  AgentSessionApprovalKind,
  AgentSessionApprovalModel,
  agentSessionApprovalId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50U2Vzc2lvbkFwcHJvdmFsTW9kZWwudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByZW5kZXJBc1BsYWludGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVSZXNvdXJjZU1hcCwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgYXV0b3J1bkl0ZXJhYmxlRGVsdGEsIElPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtaWdyYXRlTGVnYWN5VGVybWluYWxUb29sU3BlY2lmaWNEYXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBUb29sQ29uZmlybUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcblxuLyoqXG4gKiBUaGUga2luZCBvZiBhdHRlbnRpb24gYSBwZW5kaW5nIGFwcHJvdmFsIG5lZWRzLiBMZXRzIGNvbnN1bWVycyB0YWlsb3IgVUlcbiAqIChlLmcuIGEgc3VtbWFyeSBtZXNzYWdlKSB0byB3aGF0IHRoZSB1c2VyIGlzIGFjdHVhbGx5IGJlaW5nIGFza2VkIHRvIGRvLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQge1xuXHQvKiogQSB0ZXJtaW5hbCBjb21tYW5kIGlzIHdhaXRpbmcgdG8gYmUgcnVuLiAqL1xuXHRUZXJtaW5hbCA9ICd0ZXJtaW5hbCcsXG5cdC8qKiBUaGUgYWdlbnQgaXMgYXNraW5nIHRoZSB1c2VyIGEgcXVlc3Rpb24gLyBuZWVkcyBhIGZyZWUtZm9ybSByZXNwb25zZS4gKi9cblx0UXVlc3Rpb24gPSAncXVlc3Rpb24nLFxuXHQvKiogU29tZSBvdGhlciB0b29sIGludm9jYXRpb24gaXMgd2FpdGluZyBmb3IgY29uZmlybWF0aW9uLiAqL1xuXHRPdGhlciA9ICdvdGhlcicsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB7XG5cdHJlYWRvbmx5IGFwcHJvdmFsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkga2luZDogQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBsYW5ndWFnZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNpbmNlOiBEYXRlO1xuXHRjb25maXJtKCk6IHZvaWQ7XG59XG5cbi8qKlxuICogQSBzdGFibGUgaWRlbnRpdHkgZm9yIGEgc3BlY2lmaWMgcGVuZGluZyBhcHByb3ZhbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFnZW50U2Vzc2lvbkFwcHJvdmFsSWQoaW5mbzogSUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyk6IHN0cmluZyB7XG5cdHJldHVybiBpbmZvLmFwcHJvdmFsSWQ7XG59XG5cbi8qKlxuICogVHJhY2tzIGFwcHJvdmFsIHN0YXRlIGZvciBhbGwgbGl2ZSBjaGF0IHNlc3Npb25zLiBGb3IgZWFjaCBzZXNzaW9uLFxuICogZXhwb3NlcyBhbiBvYnNlcnZhYmxlIHRoYXQgZW1pdHMge0BsaW5rIElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm99XG4gKiB3aGVuIGEgdG9vbCBpbnZvY2F0aW9uIGlzIHdhaXRpbmcgZm9yIHVzZXIgY29uZmlybWF0aW9uLCBvciBgdW5kZWZpbmVkYFxuICogd2hlbiBubyBhcHByb3ZhbCBpcyBuZWVkZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25BcHByb3ZhbE1vZGVsIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXBwcm92YWxzID0gbmV3IE1hcDxzdHJpbmcsIElTZXR0YWJsZU9ic2VydmFibGU8SUFnZW50U2Vzc2lvbkFwcHJvdmFsSW5mbyB8IHVuZGVmaW5lZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsVHJhY2tlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuSXRlcmFibGVEZWx0YShcblx0XHRcdHJlYWRlciA9PiB0aGlzLl9jaGF0U2VydmljZS5jaGF0TW9kZWxzLnJlYWQocmVhZGVyKSxcblx0XHRcdCh7IGFkZGVkVmFsdWVzLCByZW1vdmVkVmFsdWVzIH0pID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBhZGRlZFZhbHVlcykge1xuXHRcdFx0XHRcdHRoaXMuX21vZGVsVHJhY2tlcnMuc2V0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgdGhpcy5fdHJhY2tNb2RlbChtb2RlbCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgbW9kZWwgb2YgcmVtb3ZlZFZhbHVlcykge1xuXHRcdFx0XHRcdHRoaXMuX21vZGVsVHJhY2tlcnMuZGVsZXRlQW5kRGlzcG9zZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuX2FwcHJvdmFscy5nZXQobW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpPy5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSk7XG5cdH1cblxuXHRnZXRBcHByb3ZhbChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElPYnNlcnZhYmxlPElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0T3JDcmVhdGVBcHByb3ZhbChzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZUFwcHJvdmFsKGtleTogc3RyaW5nKTogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IG9icyA9IHRoaXMuX2FwcHJvdmFscy5nZXQoa2V5KTtcblx0XHRpZiAoIW9icykge1xuXHRcdFx0b2JzID0gb2JzZXJ2YWJsZVZhbHVlPElBZ2VudFNlc3Npb25BcHByb3ZhbEluZm8gfCB1bmRlZmluZWQ+KGBzZXNzaW9uQXBwcm92YWwuJHtrZXl9YCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2FwcHJvdmFscy5zZXQoa2V5LCBvYnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gb2JzO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHJhY2tNb2RlbChtb2RlbDogSUNoYXRNb2RlbCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzZXR0YWJsZSA9IHRoaXMuX2dldE9yQ3JlYXRlQXBwcm92YWwobW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3Qgc2V0SWZDaGFuZ2VkID0gKHZhbHVlOiBJQWdlbnRTZXNzaW9uQXBwcm92YWxJbmZvIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gc2V0dGFibGUuZ2V0KCk7XG5cdFx0XHRpZiAoY3VycmVudCA9PT0gdmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnQgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIGN1cnJlbnQuYXBwcm92YWxJZCA9PT0gdmFsdWUuYXBwcm92YWxJZCAmJiBjdXJyZW50LmtpbmQgPT09IHZhbHVlLmtpbmQgJiYgY3VycmVudC5sYWJlbCA9PT0gdmFsdWUubGFiZWwgJiYgY3VycmVudC5sYW5ndWFnZUlkID09PSB2YWx1ZS5sYW5ndWFnZUlkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHNldHRhYmxlLnNldCh2YWx1ZSwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG5lZWRzSW5wdXQgPSBtb2RlbC5yZXF1ZXN0TmVlZHNJbnB1dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW5lZWRzSW5wdXQpIHtcblx0XHRcdFx0c2V0SWZDaGFuZ2VkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGFzdFJlc3BvbnNlID0gbW9kZWwubGFzdFJlcXVlc3Q/LnJlc3BvbnNlO1xuXHRcdFx0aWYgKCFsYXN0UmVzcG9uc2U/LnJlc3BvbnNlPy52YWx1ZSkge1xuXHRcdFx0XHRzZXRJZkNoYW5nZWQodW5kZWZpbmVkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgbGFzdFJlc3BvbnNlLnJlc3BvbnNlLnZhbHVlKSB7XG5cdFx0XHRcdGlmIChwYXJ0LmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnbW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbicpIHtcblx0XHRcdFx0XHRjb250aW51ZTsgLy8gdW5zdXBwb3J0ZWRcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiB8fCBzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yUG9zdEFwcHJvdmFsKSB7XG5cdFx0XHRcdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0XHRcdFx0bGV0IGxhbmd1YWdlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRsZXQga2luZDogQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kO1xuXHRcdFx0XHRcdGlmIChwYXJ0LnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IG1pZ3JhdGVMZWdhY3lUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEocGFydC50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdFx0XHRcdGxhYmVsID0gdGVybWluYWxEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcz8uY29tbWFuZExpbmUgPz8gdGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLmZvckRpc3BsYXkgPz8gdGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnVzZXJFZGl0ZWQgPz8gdGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLnRvb2xFZGl0ZWQgPz8gdGVybWluYWxEYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsO1xuXHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZCA9IHRoaXMuX2xhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZUlkQnlMYW5ndWFnZU5hbWUodGVybWluYWxEYXRhLnByZXNlbnRhdGlvbk92ZXJyaWRlcz8ubGFuZ3VhZ2UgPz8gdGVybWluYWxEYXRhLmxhbmd1YWdlKSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRraW5kID0gQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlRlcm1pbmFsO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAobmVlZHNJbnB1dC5kZXRhaWwpIHtcblx0XHRcdFx0XHRcdGxhYmVsID0gbmVlZHNJbnB1dC5kZXRhaWw7XG5cdFx0XHRcdFx0XHRraW5kID0gQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLlF1ZXN0aW9uO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtc2cgPSBwYXJ0Lmludm9jYXRpb25NZXNzYWdlO1xuXHRcdFx0XHRcdFx0bGFiZWwgPSB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IHJlbmRlckFzUGxhaW50ZXh0KG1zZyk7XG5cdFx0XHRcdFx0XHRraW5kID0gQWdlbnRTZXNzaW9uQXBwcm92YWxLaW5kLk90aGVyO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNvbmZpcm1TdGF0ZSA9IHN0YXRlO1xuXHRcdFx0XHRcdHNldElmQ2hhbmdlZCh7XG5cdFx0XHRcdFx0XHRhcHByb3ZhbElkOiBwYXJ0LnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRraW5kLFxuXHRcdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0XHRcdFx0c2luY2U6IG5ldyBEYXRlKCksXG5cdFx0XHRcdFx0XHRjb25maXJtOiAoKSA9PiBjb25maXJtU3RhdGUuY29uZmlybSh7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzZXRJZkNoYW5nZWQodW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksNkJBQTBDO0FBQy9ELFNBQVMsU0FBUyxzQkFBd0QsdUJBQXVCO0FBRWpHLFNBQVMsNkNBQTZDO0FBRXRELFNBQVMsY0FBYyxxQkFBcUIsdUJBQXVCO0FBQ25FLFNBQVMsd0JBQXdCO0FBTTFCLElBQVcsMkJBQVgsa0JBQVdBLDhCQUFYO0FBRU4sRUFBQUEsMEJBQUEsY0FBVztBQUVYLEVBQUFBLDBCQUFBLGNBQVc7QUFFWCxFQUFBQSwwQkFBQSxXQUFRO0FBTlMsU0FBQUE7QUFBQSxHQUFBO0FBcUJYLFNBQVMsdUJBQXVCLE1BQXlDO0FBQy9FLFNBQU8sS0FBSztBQUNiO0FBUU8sSUFBTSw0QkFBTixjQUF3QyxXQUFXO0FBQUEsRUFLekQsWUFDZ0MsY0FDSSxrQkFDbEM7QUFDRCxVQUFNO0FBSHlCO0FBQ0k7QUFMcEMsU0FBaUIsYUFBYSxvQkFBSSxJQUF3RTtBQUMxRyxTQUFpQixpQkFBaUIsS0FBSyxVQUFVLElBQUksc0JBQXNCLENBQUM7QUFRM0UsU0FBSyxVQUFVO0FBQUEsTUFDZCxZQUFVLEtBQUssYUFBYSxXQUFXLEtBQUssTUFBTTtBQUFBLE1BQ2xELENBQUMsRUFBRSxhQUFhLGNBQWMsTUFBTTtBQUNuQyxtQkFBVyxTQUFTLGFBQWE7QUFDaEMsZUFBSyxlQUFlLElBQUksTUFBTSxpQkFBaUIsS0FBSyxZQUFZLEtBQUssQ0FBQztBQUFBLFFBQ3ZFO0FBQ0EsbUJBQVcsU0FBUyxlQUFlO0FBQ2xDLGVBQUssZUFBZSxpQkFBaUIsTUFBTSxlQUFlO0FBQzFELGVBQUssV0FBVyxJQUFJLE1BQU0sZ0JBQWdCLFNBQVMsQ0FBQyxHQUFHLElBQUksUUFBVyxNQUFTO0FBQUEsUUFDaEY7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsWUFBWSxpQkFBMEU7QUFDckYsV0FBTyxLQUFLLHFCQUFxQixnQkFBZ0IsU0FBUyxDQUFDO0FBQUEsRUFDNUQ7QUFBQSxFQUVRLHFCQUFxQixLQUF5RTtBQUNyRyxRQUFJLE1BQU0sS0FBSyxXQUFXLElBQUksR0FBRztBQUNqQyxRQUFJLENBQUMsS0FBSztBQUNULFlBQU0sZ0JBQXVELG1CQUFtQixHQUFHLElBQUksTUFBUztBQUNoRyxXQUFLLFdBQVcsSUFBSSxLQUFLLEdBQUc7QUFBQSxJQUM3QjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxZQUFZLE9BQWdDO0FBQ25ELFVBQU0sV0FBVyxLQUFLLHFCQUFxQixNQUFNLGdCQUFnQixTQUFTLENBQUM7QUFFM0UsVUFBTSxlQUFlLENBQUMsVUFBaUQ7QUFDdEUsWUFBTSxVQUFVLFNBQVMsSUFBSTtBQUM3QixVQUFJLFlBQVksT0FBTztBQUN0QjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLFlBQVksVUFBYSxVQUFVLFVBQWEsUUFBUSxlQUFlLE1BQU0sY0FBYyxRQUFRLFNBQVMsTUFBTSxRQUFRLFFBQVEsVUFBVSxNQUFNLFNBQVMsUUFBUSxlQUFlLE1BQU0sWUFBWTtBQUN2TTtBQUFBLE1BQ0Q7QUFDQSxlQUFTLElBQUksT0FBTyxNQUFTO0FBQUEsSUFDOUI7QUFFQSxXQUFPLFFBQVEsWUFBVTtBQUN4QixZQUFNLGFBQWEsTUFBTSxrQkFBa0IsS0FBSyxNQUFNO0FBQ3RELFVBQUksQ0FBQyxZQUFZO0FBQ2hCLHFCQUFhLE1BQVM7QUFDdEI7QUFBQSxNQUNEO0FBRUEsWUFBTSxlQUFlLE1BQU0sYUFBYTtBQUN4QyxVQUFJLENBQUMsY0FBYyxVQUFVLE9BQU87QUFDbkMscUJBQWEsTUFBUztBQUN0QjtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxRQUFRLGFBQWEsU0FBUyxPQUFPO0FBQy9DLFlBQUksS0FBSyxTQUFTLG9CQUFvQixLQUFLLGtCQUFrQixTQUFTLDZCQUE2QjtBQUNsRztBQUFBLFFBQ0Q7QUFDQSxjQUFNLFFBQVEsS0FBSyxNQUFNLEtBQUssTUFBTTtBQUNwQyxZQUFJLE1BQU0sU0FBUyxvQkFBb0IsVUFBVSwwQkFBMEIsTUFBTSxTQUFTLG9CQUFvQixVQUFVLHdCQUF3QjtBQUMvSSxjQUFJO0FBQ0osY0FBSTtBQUNKLGNBQUk7QUFDSixjQUFJLEtBQUssa0JBQWtCLFNBQVMsWUFBWTtBQUMvQyxrQkFBTSxlQUFlLHNDQUFzQyxLQUFLLGdCQUFnQjtBQUNoRixvQkFBUSxhQUFhLHVCQUF1QixlQUFlLGFBQWEsWUFBWSxjQUFjLGFBQWEsWUFBWSxjQUFjLGFBQWEsWUFBWSxjQUFjLGFBQWEsWUFBWTtBQUN6TSx5QkFBYSxLQUFLLGlCQUFpQiw0QkFBNEIsYUFBYSx1QkFBdUIsWUFBWSxhQUFhLFFBQVEsS0FBSztBQUN6SSxtQkFBTztBQUFBLFVBQ1IsV0FBVyxXQUFXLFFBQVE7QUFDN0Isb0JBQVEsV0FBVztBQUNuQixtQkFBTztBQUFBLFVBQ1IsT0FBTztBQUNOLGtCQUFNLE1BQU0sS0FBSztBQUNqQixvQkFBUSxPQUFPLFFBQVEsV0FBVyxNQUFNLGtCQUFrQixHQUFHO0FBQzdELG1CQUFPO0FBQUEsVUFDUjtBQUVBLGdCQUFNLGVBQWU7QUFDckIsdUJBQWE7QUFBQSxZQUNaLFlBQVksS0FBSztBQUFBLFlBQ2pCO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBLE9BQU8sb0JBQUksS0FBSztBQUFBLFlBQ2hCLFNBQVMsTUFBTSxhQUFhLFFBQVEsRUFBRSxNQUFNLGdCQUFnQixXQUFXLENBQUM7QUFBQSxVQUN6RSxDQUFDO0FBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLG1CQUFhLE1BQVM7QUFBQSxJQUN2QixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBeEdhLDRCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogWyJBZ2VudFNlc3Npb25BcHByb3ZhbEtpbmQiXQp9Cg==
