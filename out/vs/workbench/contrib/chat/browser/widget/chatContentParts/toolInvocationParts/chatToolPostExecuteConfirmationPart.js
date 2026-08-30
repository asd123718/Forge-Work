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
import { Separator } from "../../../../../../../base/common/actions.js";
import { getExtensionForMimeType } from "../../../../../../../base/common/mime.js";
import { localize } from "../../../../../../../nls.js";
import { IContextKeyService } from "../../../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { ChatResponseResource } from "../../../../common/model/chatModel.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../../common/chatService/chatService.js";
import { ILanguageModelToolsConfirmationService } from "../../../../common/tools/languageModelToolsConfirmationService.js";
import { ILanguageModelToolsService, stringifyPromptTsxPart } from "../../../../common/tools/languageModelToolsService.js";
import { AcceptToolPostConfirmationActionId, SkipToolPostConfirmationActionId } from "../../../actions/chatToolActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { IChatToolRiskAssessmentService } from "../../../tools/chatToolRiskAssessmentService.js";
import { ChatToolOutputContentSubPart } from "../chatToolOutputContentSubPart.js";
import { AbstractToolConfirmationSubPart } from "./abstractToolConfirmationSubPart.js";
let ChatToolPostExecuteConfirmationPart = class extends AbstractToolConfirmationSubPart {
  constructor(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, confirmationService, riskAssessmentService) {
    super(toolInvocation, context, instantiationService, keybindingService, contextKeyService, chatWidgetService, languageModelToolsService, riskAssessmentService);
    this.confirmationService = confirmationService;
    this._codeblocks = [];
    const subtitle = toolInvocation.pastTenseMessage || toolInvocation.invocationMessage;
    this.render({
      allowActionId: AcceptToolPostConfirmationActionId,
      skipActionId: SkipToolPostConfirmationActionId,
      allowLabel: localize("allow", "Allow Once"),
      skipLabel: localize("skip.post", "Skip Results"),
      partType: "chatToolPostConfirmation",
      subtitle: typeof subtitle === "string" ? subtitle : subtitle?.value
    });
  }
  get codeblocks() {
    return this._codeblocks;
  }
  createContentElement() {
    if (this.toolInvocation.kind !== "toolInvocation") {
      throw new Error("post-approval not supported for serialized data");
    }
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
      throw new Error("Tool invocation is not waiting for post-approval");
    }
    return this.createResultsDisplay(this.toolInvocation, state.contentForModel);
  }
  getTitle() {
    return localize("approveToolResult", "Approve Tool Result");
  }
  additionalPrimaryActions() {
    const actions = super.additionalPrimaryActions();
    const state = this.toolInvocation.state.get();
    if (state.type !== IChatToolInvocation.StateKind.WaitingForPostApproval) {
      return actions;
    }
    const confirmActions = this.confirmationService.getPostConfirmActions({
      toolId: this.toolInvocation.toolId,
      source: this.toolInvocation.source,
      parameters: state.parameters
    });
    for (const action of confirmActions) {
      if (action.divider) {
        actions.push(new Separator());
      }
      actions.push({
        label: action.label,
        tooltip: action.detail,
        scope: action.scope,
        data: async () => {
          const shouldConfirm = await action.select();
          if (shouldConfirm) {
            this.confirmWith(this.toolInvocation, { type: ToolConfirmKind.UserAction });
          }
        }
      });
    }
    return actions;
  }
  createResultsDisplay(toolInvocation, contentForModel) {
    const container = dom.$(".tool-postconfirm-display");
    if (!contentForModel || contentForModel.length === 0) {
      container.textContent = localize("noResults", "No results to display");
      return container;
    }
    const parts = [];
    for (const [i, part] of contentForModel.entries()) {
      if (part.kind === "text") {
        parts.push({
          kind: "code",
          title: part.title,
          data: part.value,
          languageId: "plaintext",
          codeBlockIndex: i,
          ownerMarkdownPartId: this.codeblocksPartId,
          options: {
            hideToolbar: true,
            reserveWidth: 19,
            maxHeightInLines: 13,
            verticalPadding: 5,
            editorOptions: { wordWrap: "on", readOnly: true }
          }
        });
      } else if (part.kind === "promptTsx") {
        const stringified = stringifyPromptTsxPart(part);
        parts.push({
          kind: "code",
          data: stringified,
          languageId: "json",
          codeBlockIndex: i,
          ownerMarkdownPartId: this.codeblocksPartId,
          options: {
            hideToolbar: true,
            reserveWidth: 19,
            maxHeightInLines: 13,
            verticalPadding: 5,
            editorOptions: { wordWrap: "on", readOnly: true }
          }
        });
      } else if (part.kind === "data") {
        const mimeType = part.value.mimeType;
        const data = part.value.data;
        if (mimeType?.startsWith("image/")) {
          const permalinkBasename = getExtensionForMimeType(mimeType) ? `image${getExtensionForMimeType(mimeType)}` : "image.bin";
          const permalinkUri = ChatResponseResource.createUri(this.context.element.sessionResource, toolInvocation.toolCallId, i, permalinkBasename);
          parts.push({ kind: "data", value: data.buffer, mimeType, uri: permalinkUri, audience: part.audience });
        } else {
          const decoder = new TextDecoder("utf-8", { fatal: true });
          try {
            const text = decoder.decode(data.buffer);
            parts.push({
              kind: "code",
              data: text,
              languageId: "plaintext",
              codeBlockIndex: i,
              ownerMarkdownPartId: this.codeblocksPartId,
              options: {
                hideToolbar: true,
                reserveWidth: 19,
                maxHeightInLines: 13,
                verticalPadding: 5,
                editorOptions: { wordWrap: "on", readOnly: true }
              }
            });
          } catch {
            const base64 = data.toString();
            parts.push({
              kind: "code",
              data: base64,
              languageId: "plaintext",
              codeBlockIndex: i,
              ownerMarkdownPartId: this.codeblocksPartId,
              options: {
                hideToolbar: true,
                reserveWidth: 19,
                maxHeightInLines: 13,
                verticalPadding: 5,
                editorOptions: { wordWrap: "on", readOnly: true }
              }
            });
          }
        }
      }
    }
    if (parts.length > 0) {
      const outputSubPart = this._register(this.instantiationService.createInstance(
        ChatToolOutputContentSubPart,
        this.context,
        parts
      ));
      this._codeblocks.push(...outputSubPart.codeblocks);
      outputSubPart.domNode.classList.add("tool-postconfirm-display");
      return outputSubPart.domNode;
    }
    container.textContent = localize("noDisplayableResults", "No displayable results");
    return container;
  }
};
ChatToolPostExecuteConfirmationPart = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, ILanguageModelToolsService),
  __decorateParam(7, ILanguageModelToolsConfirmationService),
  __decorateParam(8, IChatToolRiskAssessmentService)
], ChatToolPostExecuteConfirmationPart);
export {
  ChatToolPostExecuteConfirmationPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcdG9vbEludm9jYXRpb25QYXJ0c1xcY2hhdFRvb2xQb3N0RXhlY3V0ZUNvbmZpcm1hdGlvblBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldEV4dGVuc2lvbkZvck1pbWVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVzcG9uc2VSZXNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNDb25maXJtYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sUmVzdWx0RGF0YVBhcnQsIElUb29sUmVzdWx0UHJvbXB0VHN4UGFydCwgSVRvb2xSZXN1bHRUZXh0UGFydCwgc3RyaW5naWZ5UHJvbXB0VHN4UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjY2VwdFRvb2xQb3N0Q29uZmlybWF0aW9uQWN0aW9uSWQsIFNraXBUb29sUG9zdENvbmZpcm1hdGlvbkFjdGlvbklkIH0gZnJvbSAnLi4vLi4vLi4vYWN0aW9ucy9jaGF0VG9vbEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElDaGF0VG9vbFJpc2tBc3Nlc3NtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rvb2xzL2NoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVJT1BhcnQgfSBmcm9tICcuLi9jaGF0VG9vbElucHV0T3V0cHV0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydCB9IGZyb20gJy4uL2NoYXRUb29sT3V0cHV0Q29udGVudFN1YlBhcnQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydCB9IGZyb20gJy4vYWJzdHJhY3RUb29sQ29uZmlybWF0aW9uU3ViUGFydC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0VG9vbFBvc3RFeGVjdXRlQ29uZmlybWF0aW9uUGFydCBleHRlbmRzIEFic3RyYWN0VG9vbENvbmZpcm1hdGlvblN1YlBhcnQge1xuXHRwcml2YXRlIF9jb2RlYmxvY2tzOiBJQ2hhdENvZGVCbG9ja0luZm9bXSA9IFtdO1xuXHRwdWJsaWMgZ2V0IGNvZGVibG9ja3MoKTogSUNoYXRDb2RlQmxvY2tJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLl9jb2RlYmxvY2tzO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0Y29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc0NvbmZpcm1hdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maXJtYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzQ29uZmlybWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlIHJpc2tBc3Nlc3NtZW50U2VydmljZTogSUNoYXRUb29sUmlza0Fzc2Vzc21lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih0b29sSW52b2NhdGlvbiwgY29udGV4dCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UsIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHJpc2tBc3Nlc3NtZW50U2VydmljZSk7XG5cdFx0Y29uc3Qgc3VidGl0bGUgPSB0b29sSW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlIHx8IHRvb2xJbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlO1xuXHRcdHRoaXMucmVuZGVyKHtcblx0XHRcdGFsbG93QWN0aW9uSWQ6IEFjY2VwdFRvb2xQb3N0Q29uZmlybWF0aW9uQWN0aW9uSWQsXG5cdFx0XHRza2lwQWN0aW9uSWQ6IFNraXBUb29sUG9zdENvbmZpcm1hdGlvbkFjdGlvbklkLFxuXHRcdFx0YWxsb3dMYWJlbDogbG9jYWxpemUoJ2FsbG93JywgXCJBbGxvdyBPbmNlXCIpLFxuXHRcdFx0c2tpcExhYmVsOiBsb2NhbGl6ZSgnc2tpcC5wb3N0JywgJ1NraXAgUmVzdWx0cycpLFxuXHRcdFx0cGFydFR5cGU6ICdjaGF0VG9vbFBvc3RDb25maXJtYXRpb24nLFxuXHRcdFx0c3VidGl0bGU6IHR5cGVvZiBzdWJ0aXRsZSA9PT0gJ3N0cmluZycgPyBzdWJ0aXRsZSA6IHN1YnRpdGxlPy52YWx1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVDb250ZW50RWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0aWYgKHRoaXMudG9vbEludm9jYXRpb24ua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdwb3N0LWFwcHJvdmFsIG5vdCBzdXBwb3J0ZWQgZm9yIHNlcmlhbGl6ZWQgZGF0YScpO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVG9vbCBpbnZvY2F0aW9uIGlzIG5vdCB3YWl0aW5nIGZvciBwb3N0LWFwcHJvdmFsJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlUmVzdWx0c0Rpc3BsYXkodGhpcy50b29sSW52b2NhdGlvbiwgc3RhdGUuY29udGVudEZvck1vZGVsKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYXBwcm92ZVRvb2xSZXN1bHQnLCBcIkFwcHJvdmUgVG9vbCBSZXN1bHRcIik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYWRkaXRpb25hbFByaW1hcnlBY3Rpb25zKCkge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBzdXBlci5hZGRpdGlvbmFsUHJpbWFyeUFjdGlvbnMoKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy50b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0cmV0dXJuIGFjdGlvbnM7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IGFjdGlvbnMgZnJvbSBjb25maXJtYXRpb24gc2VydmljZVxuXHRcdGNvbnN0IGNvbmZpcm1BY3Rpb25zID0gdGhpcy5jb25maXJtYXRpb25TZXJ2aWNlLmdldFBvc3RDb25maXJtQWN0aW9ucyh7XG5cdFx0XHR0b29sSWQ6IHRoaXMudG9vbEludm9jYXRpb24udG9vbElkLFxuXHRcdFx0c291cmNlOiB0aGlzLnRvb2xJbnZvY2F0aW9uLnNvdXJjZSxcblx0XHRcdHBhcmFtZXRlcnM6IHN0YXRlLnBhcmFtZXRlcnNcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGNvbmZpcm1BY3Rpb25zKSB7XG5cdFx0XHRpZiAoYWN0aW9uLmRpdmlkZXIpIHtcblx0XHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHR0b29sdGlwOiBhY3Rpb24uZGV0YWlsLFxuXHRcdFx0XHRzY29wZTogYWN0aW9uLnNjb3BlLFxuXHRcdFx0XHRkYXRhOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2hvdWxkQ29uZmlybSA9IGF3YWl0IGFjdGlvbi5zZWxlY3QoKTtcblx0XHRcdFx0XHRpZiAoc2hvdWxkQ29uZmlybSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jb25maXJtV2l0aCh0aGlzLnRvb2xJbnZvY2F0aW9uLCB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlc3VsdHNEaXNwbGF5KHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBjb250ZW50Rm9yTW9kZWw6IChJVG9vbFJlc3VsdFByb21wdFRzeFBhcnQgfCBJVG9vbFJlc3VsdFRleHRQYXJ0IHwgSVRvb2xSZXN1bHREYXRhUGFydClbXSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb20uJCgnLnRvb2wtcG9zdGNvbmZpcm0tZGlzcGxheScpO1xuXG5cdFx0aWYgKCFjb250ZW50Rm9yTW9kZWwgfHwgY29udGVudEZvck1vZGVsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29udGFpbmVyLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vUmVzdWx0cycsICdObyByZXN1bHRzIHRvIGRpc3BsYXknKTtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydHM6IENoYXRDb2xsYXBzaWJsZUlPUGFydFtdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IFtpLCBwYXJ0XSBvZiBjb250ZW50Rm9yTW9kZWwuZW50cmllcygpKSB7XG5cdFx0XHRpZiAocGFydC5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdFx0Ly8gRGlzcGxheSB0ZXh0IHBhcnRzXG5cdFx0XHRcdHBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6ICdjb2RlJyxcblx0XHRcdFx0XHR0aXRsZTogcGFydC50aXRsZSxcblx0XHRcdFx0XHRkYXRhOiBwYXJ0LnZhbHVlLFxuXHRcdFx0XHRcdGxhbmd1YWdlSWQ6ICdwbGFpbnRleHQnLFxuXHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiBpLFxuXHRcdFx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6IHRoaXMuY29kZWJsb2Nrc1BhcnRJZCxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdFx0XHRcdHJlc2VydmVXaWR0aDogMTksXG5cdFx0XHRcdFx0XHRtYXhIZWlnaHRJbkxpbmVzOiAxMyxcblx0XHRcdFx0XHRcdHZlcnRpY2FsUGFkZGluZzogNSxcblx0XHRcdFx0XHRcdGVkaXRvck9wdGlvbnM6IHsgd29yZFdyYXA6ICdvbicsIHJlYWRPbmx5OiB0cnVlIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdwcm9tcHRUc3gnKSB7XG5cdFx0XHRcdC8vIERpc3BsYXkgVFNYIHBhcnRzIGFzIEpTT04tc3RyaW5naWZpZWRcblx0XHRcdFx0Y29uc3Qgc3RyaW5naWZpZWQgPSBzdHJpbmdpZnlQcm9tcHRUc3hQYXJ0KHBhcnQpO1xuXG5cdFx0XHRcdHBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6ICdjb2RlJyxcblx0XHRcdFx0XHRkYXRhOiBzdHJpbmdpZmllZCxcblx0XHRcdFx0XHRsYW5ndWFnZUlkOiAnanNvbicsXG5cdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IGksXG5cdFx0XHRcdFx0b3duZXJNYXJrZG93blBhcnRJZDogdGhpcy5jb2RlYmxvY2tzUGFydElkLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdGhpZGVUb29sYmFyOiB0cnVlLFxuXHRcdFx0XHRcdFx0cmVzZXJ2ZVdpZHRoOiAxOSxcblx0XHRcdFx0XHRcdG1heEhlaWdodEluTGluZXM6IDEzLFxuXHRcdFx0XHRcdFx0dmVydGljYWxQYWRkaW5nOiA1LFxuXHRcdFx0XHRcdFx0ZWRpdG9yT3B0aW9uczogeyB3b3JkV3JhcDogJ29uJywgcmVhZE9ubHk6IHRydWUgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQua2luZCA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdC8vIERpc3BsYXkgZGF0YSBwYXJ0c1xuXHRcdFx0XHRjb25zdCBtaW1lVHlwZSA9IHBhcnQudmFsdWUubWltZVR5cGU7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBwYXJ0LnZhbHVlLmRhdGE7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgaWYgaXQncyBhbiBpbWFnZVxuXHRcdFx0XHRpZiAobWltZVR5cGU/LnN0YXJ0c1dpdGgoJ2ltYWdlLycpKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGVybWFsaW5rQmFzZW5hbWUgPSBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShtaW1lVHlwZSkgPyBgaW1hZ2Uke2dldEV4dGVuc2lvbkZvck1pbWVUeXBlKG1pbWVUeXBlKX1gIDogJ2ltYWdlLmJpbic7XG5cdFx0XHRcdFx0Y29uc3QgcGVybWFsaW5rVXJpID0gQ2hhdFJlc3BvbnNlUmVzb3VyY2UuY3JlYXRlVXJpKHRoaXMuY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgdG9vbEludm9jYXRpb24udG9vbENhbGxJZCwgaSwgcGVybWFsaW5rQmFzZW5hbWUpO1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goeyBraW5kOiAnZGF0YScsIHZhbHVlOiBkYXRhLmJ1ZmZlciwgbWltZVR5cGUsIHVyaTogcGVybWFsaW5rVXJpLCBhdWRpZW5jZTogcGFydC5hdWRpZW5jZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBUcnkgdG8gZGlzcGxheSBhcyBVVEYtOCB0ZXh0LCBvdGhlcndpc2UgYmFzZTY0XG5cdFx0XHRcdFx0Y29uc3QgZGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigndXRmLTgnLCB7IGZhdGFsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gZGVjb2Rlci5kZWNvZGUoZGF0YS5idWZmZXIpO1xuXG5cdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0a2luZDogJ2NvZGUnLFxuXHRcdFx0XHRcdFx0XHRkYXRhOiB0ZXh0LFxuXHRcdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiAncGxhaW50ZXh0Jyxcblx0XHRcdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IGksXG5cdFx0XHRcdFx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6IHRoaXMuY29kZWJsb2Nrc1BhcnRJZCxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRcdGhpZGVUb29sYmFyOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdHJlc2VydmVXaWR0aDogMTksXG5cdFx0XHRcdFx0XHRcdFx0bWF4SGVpZ2h0SW5MaW5lczogMTMsXG5cdFx0XHRcdFx0XHRcdFx0dmVydGljYWxQYWRkaW5nOiA1LFxuXHRcdFx0XHRcdFx0XHRcdGVkaXRvck9wdGlvbnM6IHsgd29yZFdyYXA6ICdvbicsIHJlYWRPbmx5OiB0cnVlIH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0XHQvLyBOb3QgdmFsaWQgVVRGLTgsIHNob3cgYmFzZTY0XG5cdFx0XHRcdFx0XHRjb25zdCBiYXNlNjQgPSBkYXRhLnRvU3RyaW5nKCk7XG5cblx0XHRcdFx0XHRcdHBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnY29kZScsXG5cdFx0XHRcdFx0XHRcdGRhdGE6IGJhc2U2NCxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3BsYWludGV4dCcsXG5cdFx0XHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiBpLFxuXHRcdFx0XHRcdFx0XHRvd25lck1hcmtkb3duUGFydElkOiB0aGlzLmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0XHRoaWRlVG9vbGJhcjogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRyZXNlcnZlV2lkdGg6IDE5LFxuXHRcdFx0XHRcdFx0XHRcdG1heEhlaWdodEluTGluZXM6IDEzLFxuXHRcdFx0XHRcdFx0XHRcdHZlcnRpY2FsUGFkZGluZzogNSxcblx0XHRcdFx0XHRcdFx0XHRlZGl0b3JPcHRpb25zOiB7IHdvcmRXcmFwOiAnb24nLCByZWFkT25seTogdHJ1ZSB9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBvdXRwdXRTdWJQYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydCxcblx0XHRcdFx0dGhpcy5jb250ZXh0LFxuXHRcdFx0XHRwYXJ0cyxcblx0XHRcdCkpO1xuXG5cdFx0XHR0aGlzLl9jb2RlYmxvY2tzLnB1c2goLi4ub3V0cHV0U3ViUGFydC5jb2RlYmxvY2tzKTtcblx0XHRcdG91dHB1dFN1YlBhcnQuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd0b29sLXBvc3Rjb25maXJtLWRpc3BsYXknKTtcblx0XHRcdHJldHVybiBvdXRwdXRTdWJQYXJ0LmRvbU5vZGU7XG5cdFx0fVxuXG5cdFx0Y29udGFpbmVyLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ25vRGlzcGxheWFibGVSZXN1bHRzJywgJ05vIGRpc3BsYXlhYmxlIHJlc3VsdHMnKTtcblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFCQUFxQix1QkFBdUI7QUFDckQsU0FBUyw4Q0FBOEM7QUFDdkQsU0FBUyw0QkFBZ0csOEJBQThCO0FBQ3ZJLFNBQVMs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
