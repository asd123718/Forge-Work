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
import { raceCancellation } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { localize } from "../../../../../../nls.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IChatService } from "../../chatService/chatService.js";
import { ChatPlanReviewData } from "../../model/chatProgressTypes/chatPlanReviewData.js";
import { ToolDataSource } from "../languageModelToolsService.js";
const ReviewPlanToolId = "vscode_reviewPlan";
function createReviewPlanToolData() {
  const approvalActionSchema = {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Short action label shown in the dropdown button."
      },
      description: {
        type: "string",
        description: "Optional detail shown below the label in the dropdown list."
      },
      default: {
        type: "boolean",
        description: "Whether this action should be selected by default."
      },
      permissionLevel: {
        type: "string",
        enum: ["autopilot"],
        description: 'When set to "autopilot", a confirmation dialog is shown before proceeding.'
      }
    },
    required: ["label"]
  };
  const inputSchema = {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: 'Title displayed in the widget header. Defaults to "Plan summary" if omitted.'
      },
      plan: {
        type: "string",
        description: "Optional URI of an editable plan file. An Edit button in the widget header opens it in the editor."
      },
      content: {
        type: "string",
        description: "Markdown content rendered in the body of the widget. May be the plan summary or full plan text."
      },
      actions: {
        type: "array",
        description: "List of approval actions offered in the primary dropdown button. Order is preserved.",
        items: approvalActionSchema,
        minItems: 1
      },
      canProvideFeedback: {
        type: "boolean",
        description: "When true, an additional feedback textarea is shown below the plan content."
      }
    },
    required: ["content", "actions", "canProvideFeedback"]
  };
  return {
    id: ReviewPlanToolId,
    toolReferenceName: "reviewPlan",
    canBeReferencedInPrompt: false,
    icon: ThemeIcon.fromId(Codicon.checklist.id),
    displayName: localize("tool.reviewPlan.displayName", "Review Plan"),
    userDescription: localize("tool.reviewPlan.userDescription", "Ask the user to review and approve a plan before proceeding."),
    modelDescription: "Use this tool to present a plan to the user for review. Provide the plan content as markdown, a list of approval actions (with optional default), and whether the user can provide freeform feedback. Optionally provide a URI to the backing plan file so the user can edit it. The tool returns the chosen action, whether the plan was rejected, and any feedback.",
    source: ToolDataSource.Internal,
    inputSchema
  };
}
const ReviewPlanToolData = createReviewPlanToolData();
let ReviewPlanTool = class extends Disposable {
  constructor(chatService, logService) {
    super();
    this.chatService = chatService;
    this.logService = logService;
  }
  async invoke(invocation, _countTokens, _progress, token) {
    const parameters = invocation.parameters;
    const { title, plan, content, actions, canProvideFeedback } = parameters;
    if (!actions || actions.length === 0) {
      throw new Error(localize("reviewPlanTool.noActions", "At least one approval action must be provided."));
    }
    const { request } = this.getRequest(invocation.context?.sessionResource, invocation.chatRequestId);
    if (!request) {
      this.logService.warn("[ReviewPlanTool] Missing chat context; returning rejected result.");
      return this.toResult({ rejected: true });
    }
    let planUri;
    if (plan) {
      try {
        planUri = URI.parse(plan);
      } catch {
        try {
          planUri = URI.file(plan);
        } catch {
          planUri = void 0;
        }
      }
    }
    const reviewData = new ChatPlanReviewData(
      title ?? localize("reviewPlanTool.defaultTitle", "Plan summary"),
      content,
      actions,
      canProvideFeedback,
      planUri?.toJSON(),
      generateUuid()
    );
    this.chatService.appendProgress(request, reviewData);
    const result = await raceCancellation(reviewData.completion.p, token);
    if (token.isCancellationRequested) {
      reviewData.dismiss();
      throw new CancellationError();
    }
    return this.toResult(result ?? { rejected: true });
  }
  async prepareToolInvocation(context, _token) {
    const parameters = context.parameters;
    if (!parameters.actions || parameters.actions.length === 0) {
      throw new Error(localize("reviewPlanTool.noActions", "At least one approval action must be provided."));
    }
    return {
      invocationMessage: new MarkdownString(localize("reviewPlanTool.invocation", "Asking you to review the plan")),
      pastTenseMessage: new MarkdownString(localize("reviewPlanTool.invocation.past", "Asked you to review the plan"))
    };
  }
  toResult(result) {
    return {
      content: [{ kind: "text", value: JSON.stringify(result) }]
    };
  }
  getRequest(chatSessionResource, chatRequestId) {
    if (!chatSessionResource) {
      return { request: void 0 };
    }
    const model = this.chatService.getSession(chatSessionResource);
    if (!model) {
      return { request: void 0 };
    }
    let request;
    if (chatRequestId) {
      request = model.getRequests().find((r) => r.id === chatRequestId);
    }
    if (!request) {
      request = model.getRequests().at(-1);
    }
    return { request };
  }
};
ReviewPlanTool = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, ILogService)
], ReviewPlanTool);
export {
  ReviewPlanTool,
  ReviewPlanToolData,
  ReviewPlanToolId,
  createReviewPlanToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xccmV2aWV3UGxhblRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDaGF0UGxhbkFwcHJvdmFsQWN0aW9uLCBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRQbGFuUmV2aWV3RGF0YSB9IGZyb20gJy4uLy4uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRQbGFuUmV2aWV3RGF0YS5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgUmV2aWV3UGxhblRvb2xJZCA9ICd2c2NvZGVfcmV2aWV3UGxhbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJldmlld1BsYW5QYXJhbXMge1xuXHRyZWFkb25seSB0aXRsZT86IHN0cmluZztcblx0cmVhZG9ubHkgcGxhbj86IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSBhY3Rpb25zOiBJQ2hhdFBsYW5BcHByb3ZhbEFjdGlvbltdO1xuXHRyZWFkb25seSBjYW5Qcm92aWRlRmVlZGJhY2s6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVSZXZpZXdQbGFuVG9vbERhdGEoKTogSVRvb2xEYXRhIHtcblx0Y29uc3QgYXBwcm92YWxBY3Rpb25TY2hlbWE6IElKU09OU2NoZW1hICYgeyBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCB9ID0ge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdGxhYmVsOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Nob3J0IGFjdGlvbiBsYWJlbCBzaG93biBpbiB0aGUgZHJvcGRvd24gYnV0dG9uLidcblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdPcHRpb25hbCBkZXRhaWwgc2hvd24gYmVsb3cgdGhlIGxhYmVsIGluIHRoZSBkcm9wZG93biBsaXN0Lidcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGV0aGVyIHRoaXMgYWN0aW9uIHNob3VsZCBiZSBzZWxlY3RlZCBieSBkZWZhdWx0Lidcblx0XHRcdH0sXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnYXV0b3BpbG90J10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV2hlbiBzZXQgdG8gXCJhdXRvcGlsb3RcIiwgYSBjb25maXJtYXRpb24gZGlhbG9nIGlzIHNob3duIGJlZm9yZSBwcm9jZWVkaW5nLidcblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ2xhYmVsJ11cblx0fTtcblxuXHRjb25zdCBpbnB1dFNjaGVtYTogSUpTT05TY2hlbWEgJiB7IHByb3BlcnRpZXM6IElKU09OU2NoZW1hTWFwIH0gPSB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGl0bGUgZGlzcGxheWVkIGluIHRoZSB3aWRnZXQgaGVhZGVyLiBEZWZhdWx0cyB0byBcIlBsYW4gc3VtbWFyeVwiIGlmIG9taXR0ZWQuJ1xuXHRcdFx0fSxcblx0XHRcdHBsYW46IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgVVJJIG9mIGFuIGVkaXRhYmxlIHBsYW4gZmlsZS4gQW4gRWRpdCBidXR0b24gaW4gdGhlIHdpZGdldCBoZWFkZXIgb3BlbnMgaXQgaW4gdGhlIGVkaXRvci4nXG5cdFx0XHR9LFxuXHRcdFx0Y29udGVudDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdNYXJrZG93biBjb250ZW50IHJlbmRlcmVkIGluIHRoZSBib2R5IG9mIHRoZSB3aWRnZXQuIE1heSBiZSB0aGUgcGxhbiBzdW1tYXJ5IG9yIGZ1bGwgcGxhbiB0ZXh0Lidcblx0XHRcdH0sXG5cdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnTGlzdCBvZiBhcHByb3ZhbCBhY3Rpb25zIG9mZmVyZWQgaW4gdGhlIHByaW1hcnkgZHJvcGRvd24gYnV0dG9uLiBPcmRlciBpcyBwcmVzZXJ2ZWQuJyxcblx0XHRcdFx0aXRlbXM6IGFwcHJvdmFsQWN0aW9uU2NoZW1hLFxuXHRcdFx0XHRtaW5JdGVtczogMVxuXHRcdFx0fSxcblx0XHRcdGNhblByb3ZpZGVGZWVkYmFjazoge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV2hlbiB0cnVlLCBhbiBhZGRpdGlvbmFsIGZlZWRiYWNrIHRleHRhcmVhIGlzIHNob3duIGJlbG93IHRoZSBwbGFuIGNvbnRlbnQuJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFsnY29udGVudCcsICdhY3Rpb25zJywgJ2NhblByb3ZpZGVGZWVkYmFjayddXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHRpZDogUmV2aWV3UGxhblRvb2xJZCxcblx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3Jldmlld1BsYW4nLFxuXHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uY2hlY2tsaXN0LmlkKSxcblx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3Rvb2wucmV2aWV3UGxhbi5kaXNwbGF5TmFtZScsICdSZXZpZXcgUGxhbicpLFxuXHRcdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2wucmV2aWV3UGxhbi51c2VyRGVzY3JpcHRpb24nLCAnQXNrIHRoZSB1c2VyIHRvIHJldmlldyBhbmQgYXBwcm92ZSBhIHBsYW4gYmVmb3JlIHByb2NlZWRpbmcuJyksXG5cdFx0bW9kZWxEZXNjcmlwdGlvbjogJ1VzZSB0aGlzIHRvb2wgdG8gcHJlc2VudCBhIHBsYW4gdG8gdGhlIHVzZXIgZm9yIHJldmlldy4gUHJvdmlkZSB0aGUgcGxhbiBjb250ZW50IGFzIG1hcmtkb3duLCBhIGxpc3Qgb2YgYXBwcm92YWwgYWN0aW9ucyAod2l0aCBvcHRpb25hbCBkZWZhdWx0KSwgYW5kIHdoZXRoZXIgdGhlIHVzZXIgY2FuIHByb3ZpZGUgZnJlZWZvcm0gZmVlZGJhY2suIE9wdGlvbmFsbHkgcHJvdmlkZSBhIFVSSSB0byB0aGUgYmFja2luZyBwbGFuIGZpbGUgc28gdGhlIHVzZXIgY2FuIGVkaXQgaXQuIFRoZSB0b29sIHJldHVybnMgdGhlIGNob3NlbiBhY3Rpb24sIHdoZXRoZXIgdGhlIHBsYW4gd2FzIHJlamVjdGVkLCBhbmQgYW55IGZlZWRiYWNrLicsXG5cdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRpbnB1dFNjaGVtYVxuXHR9O1xufVxuXG5leHBvcnQgY29uc3QgUmV2aWV3UGxhblRvb2xEYXRhOiBJVG9vbERhdGEgPSBjcmVhdGVSZXZpZXdQbGFuVG9vbERhdGEoKTtcblxuZXhwb3J0IGNsYXNzIFJldmlld1BsYW5Ub29sIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgcGFyYW1ldGVycyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJUmV2aWV3UGxhblBhcmFtcztcblx0XHRjb25zdCB7IHRpdGxlLCBwbGFuLCBjb250ZW50LCBhY3Rpb25zLCBjYW5Qcm92aWRlRmVlZGJhY2sgfSA9IHBhcmFtZXRlcnM7XG5cblx0XHRpZiAoIWFjdGlvbnMgfHwgYWN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgncmV2aWV3UGxhblRvb2wubm9BY3Rpb25zJywgJ0F0IGxlYXN0IG9uZSBhcHByb3ZhbCBhY3Rpb24gbXVzdCBiZSBwcm92aWRlZC4nKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyByZXF1ZXN0IH0gPSB0aGlzLmdldFJlcXVlc3QoaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2UsIGludm9jYXRpb24uY2hhdFJlcXVlc3RJZCk7XG5cdFx0aWYgKCFyZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW1Jldmlld1BsYW5Ub29sXSBNaXNzaW5nIGNoYXQgY29udGV4dDsgcmV0dXJuaW5nIHJlamVjdGVkIHJlc3VsdC4nKTtcblx0XHRcdHJldHVybiB0aGlzLnRvUmVzdWx0KHsgcmVqZWN0ZWQ6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0bGV0IHBsYW5Vcmk6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpZiAocGxhbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cGxhblVyaSA9IFVSSS5wYXJzZShwbGFuKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHBsYW5VcmkgPSBVUkkuZmlsZShwbGFuKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0cGxhblVyaSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJldmlld0RhdGEgPSBuZXcgQ2hhdFBsYW5SZXZpZXdEYXRhKFxuXHRcdFx0dGl0bGUgPz8gbG9jYWxpemUoJ3Jldmlld1BsYW5Ub29sLmRlZmF1bHRUaXRsZScsICdQbGFuIHN1bW1hcnknKSxcblx0XHRcdGNvbnRlbnQsXG5cdFx0XHRhY3Rpb25zLFxuXHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrLFxuXHRcdFx0cGxhblVyaT8udG9KU09OKCksXG5cdFx0XHRnZW5lcmF0ZVV1aWQoKSxcblx0XHQpO1xuXG5cdFx0dGhpcy5jaGF0U2VydmljZS5hcHBlbmRQcm9ncmVzcyhyZXF1ZXN0LCByZXZpZXdEYXRhKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJhY2VDYW5jZWxsYXRpb24ocmV2aWV3RGF0YS5jb21wbGV0aW9uLnAsIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldmlld0RhdGEuZGlzbWlzcygpO1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudG9SZXN1bHQocmVzdWx0ID8/IHsgcmVqZWN0ZWQ6IHRydWUgfSk7XG5cdH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSVJldmlld1BsYW5QYXJhbXM7XG5cdFx0aWYgKCFwYXJhbWV0ZXJzLmFjdGlvbnMgfHwgcGFyYW1ldGVycy5hY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdyZXZpZXdQbGFuVG9vbC5ub0FjdGlvbnMnLCAnQXQgbGVhc3Qgb25lIGFwcHJvdmFsIGFjdGlvbiBtdXN0IGJlIHByb3ZpZGVkLicpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3Jldmlld1BsYW5Ub29sLmludm9jYXRpb24nLCAnQXNraW5nIHlvdSB0byByZXZpZXcgdGhlIHBsYW4nKSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ3Jldmlld1BsYW5Ub29sLmludm9jYXRpb24ucGFzdCcsICdBc2tlZCB5b3UgdG8gcmV2aWV3IHRoZSBwbGFuJykpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9SZXN1bHQocmVzdWx0OiBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQpOiBJVG9vbFJlc3VsdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6IEpTT04uc3RyaW5naWZ5KHJlc3VsdCkgfV1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRSZXF1ZXN0KGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCwgY2hhdFJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyByZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCB8IHVuZGVmaW5lZCB9IHtcblx0XHRpZiAoIWNoYXRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB7IHJlcXVlc3Q6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4geyByZXF1ZXN0OiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdFx0bGV0IHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjaGF0UmVxdWVzdElkKSB7XG5cdFx0XHRyZXF1ZXN0ID0gbW9kZWwuZ2V0UmVxdWVzdHMoKS5maW5kKHIgPT4gci5pZCA9PT0gY2hhdFJlcXVlc3RJZCk7XG5cdFx0fVxuXHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0cmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdH1cblx0XHRyZXR1cm4geyByZXF1ZXN0IH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUF5RCxvQkFBb0I7QUFFN0UsU0FBUywwQkFBMEI7QUFDbkMsU0FBOEksc0JBQW9DO0FBRTNLLE1BQU0sbUJBQW1CO0FBVXpCLFNBQVMsMkJBQXNDO0FBQ3JELFFBQU0sdUJBQXFFO0FBQUEsSUFDMUUsTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLGFBQWE7QUFBQSxRQUNaLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsaUJBQWlCO0FBQUEsUUFDaEIsTUFBTTtBQUFBLFFBQ04sTUFBTSxDQUFDLFdBQVc7QUFBQSxRQUNsQixhQUFhO0FBQUEsTUFDZDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFVBQVUsQ0FBQyxPQUFPO0FBQUEsRUFDbkI7QUFFQSxRQUFNLGNBQTREO0FBQUEsSUFDakUsTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxTQUFTO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsU0FBUztBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLFFBQ2IsT0FBTztBQUFBLFFBQ1AsVUFBVTtBQUFBLE1BQ1g7QUFBQSxNQUNBLG9CQUFvQjtBQUFBLFFBQ25CLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUFBLElBQ0EsVUFBVSxDQUFDLFdBQVcsV0FBVyxvQkFBb0I7QUFBQSxFQUN0RDtBQUVBLFNBQU87QUFBQSxJQUNOLElBQUk7QUFBQSxJQUNKLG1CQUFtQjtBQUFBLElBQ25CLHlCQUF5QjtBQUFBLElBQ3pCLE1BQU0sVUFBVSxPQUFPLFFBQVEsVUFBVSxFQUFFO0FBQUEsSUFDM0MsYUFBYSxTQUFTLCtCQUErQixhQUFhO0FBQUEsSUFDbEUsaUJBQWlCLFNBQVMsbUNBQW1DLDhEQUE4RDtBQUFBLElBQzNILGtCQUFrQjtBQUFBLElBQ2xCLFFBQVEsZUFBZTtBQUFBLElBQ3ZCO0FBQUEsRUFDRDtBQUNEO0FBRU8sTUFBTSxxQkFBZ0MseUJBQXlCO0FBRS9ELElBQU0saUJBQU4sY0FBNkIsV0FBZ0M7QUFBQSxFQUVuRSxZQUNnQyxhQUNELFlBQzdCO0FBQ0QsVUFBTTtBQUh5QjtBQUNEO0FBQUEsRUFHL0I7QUFBQSxFQUVBLE1BQU0sT0FBTyxZQUE2QixjQUFtQyxXQUF5QixPQUFnRDtBQUNySixVQUFNLGFBQWEsV0FBVztBQUM5QixVQUFNLEVBQUUsT0FBTyxNQUFNLFNBQVMsU0FBUyxtQkFBbUIsSUFBSTtBQUU5RCxRQUFJLENBQUMsV0FBVyxRQUFRLFdBQVcsR0FBRztBQUNyQyxZQUFNLElBQUksTUFBTSxTQUFTLDRCQUE0QixnREFBZ0QsQ0FBQztBQUFBLElBQ3ZHO0FBRUEsVUFBTSxFQUFFLFFBQVEsSUFBSSxLQUFLLFdBQVcsV0FBVyxTQUFTLGlCQUFpQixXQUFXLGFBQWE7QUFDakcsUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLFdBQVcsS0FBSyxtRUFBbUU7QUFDeEYsYUFBTyxLQUFLLFNBQVMsRUFBRSxVQUFVLEtBQUssQ0FBQztBQUFBLElBQ3hDO0FBRUEsUUFBSTtBQUNKLFFBQUksTUFBTTtBQUNULFVBQUk7QUFDSCxrQkFBVSxJQUFJLE1BQU0sSUFBSTtBQUFBLE1BQ3pCLFFBQVE7QUFDUCxZQUFJO0FBQ0gsb0JBQVUsSUFBSSxLQUFLLElBQUk7QUFBQSxRQUN4QixRQUFRO0FBQ1Asb0JBQVU7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsSUFBSTtBQUFBLE1BQ3RCLFNBQVMsU0FBUywrQkFBK0IsY0FBYztBQUFBLE1BQy9EO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLFNBQVMsT0FBTztBQUFBLE1BQ2hCLGFBQWE7QUFBQSxJQUNkO0FBRUEsU0FBSyxZQUFZLGVBQWUsU0FBUyxVQUFVO0FBRW5ELFVBQU0sU0FBUyxNQUFNLGlCQUFpQixXQUFXLFdBQVcsR0FBRyxLQUFLO0FBQ3BFLFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsaUJBQVcsUUFBUTtBQUNuQixZQUFNLElBQUksa0JBQWtCO0FBQUEsSUFDN0I7QUFFQSxXQUFPLEtBQUssU0FBUyxVQUFVLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsU0FBNEMsUUFBeUU7QUFDaEosVUFBTSxhQUFhLFFBQVE7QUFDM0IsUUFBSSxDQUFDLFdBQVcsV0FBVyxXQUFXLFFBQVEsV0FBVyxHQUFHO0FBQzNELFlBQU0sSUFBSSxNQUFNLFNBQVMsNEJBQTRCLGdEQUFnRCxDQUFDO0FBQUEsSUFDdkc7QUFDQSxXQUFPO0FBQUEsTUFDTixtQkFBbUIsSUFBSSxlQUFlLFNBQVMsNkJBQTZCLCtCQUErQixDQUFDO0FBQUEsTUFDNUcsa0JBQWtCLElBQUksZUFBZSxTQUFTLGtDQUFrQyw4QkFBOEIsQ0FBQztBQUFBLElBQ2hIO0FBQUEsRUFDRDtBQUFBLEVBRVEsU0FBUyxRQUE0QztBQUM1RCxXQUFPO0FBQUEsTUFDTixTQUFTLENBQUMsRUFBRSxNQUFNLFFBQVEsT0FBTyxLQUFLLFVBQVUsTUFBTSxFQUFFLENBQUM7QUFBQSxJQUMxRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFdBQVcscUJBQXNDLGVBQStFO0FBQ3ZJLFFBQUksQ0FBQyxxQkFBcUI7QUFDekIsYUFBTyxFQUFFLFNBQVMsT0FBVTtBQUFBLElBQzdCO0FBQ0EsVUFBTSxRQUFRLEtBQUssWUFBWSxXQUFXLG1CQUFtQjtBQUM3RCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU8sRUFBRSxTQUFTLE9BQVU7QUFBQSxJQUM3QjtBQUNBLFFBQUk7QUFDSixRQUFJLGVBQWU7QUFDbEIsZ0JBQVUsTUFBTSxZQUFZLEVBQUUsS0FBSyxPQUFLLEVBQUUsT0FBTyxhQUFhO0FBQUEsSUFDL0Q7QUFDQSxRQUFJLENBQUMsU0FBUztBQUNiLGdCQUFVLE1BQU0sWUFBWSxFQUFFLEdBQUcsRUFBRTtBQUFBLElBQ3BDO0FBQ0EsV0FBTyxFQUFFLFFBQVE7QUFBQSxFQUNsQjtBQUNEO0FBMUZhLGlCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
