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
import { Range } from "../../../../../../editor/common/core/range.js";
import { IChatModeService } from "../../chatModes.js";
import { PromptHeaderAttributes } from "../promptFileParser.js";
import { getPromptsTypeForLanguageId } from "../promptTypes.js";
import { IPromptsService } from "../service/promptsService.js";
let PromptHeaderDefinitionProvider = class {
  constructor(promptsService, chatModeService) {
    this.promptsService = promptsService;
    this.chatModeService = chatModeService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptHeaderDefinitionProvider";
  }
  async provideDefinition(model, position, token) {
    const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptType) {
      return void 0;
    }
    const promptAST = this.promptsService.getParsedPromptFile(model);
    const header = promptAST.header;
    if (!header) {
      return void 0;
    }
    const agentAttr = header.getAttribute(PromptHeaderAttributes.agent) ?? header.getAttribute(PromptHeaderAttributes.mode);
    if (agentAttr && agentAttr.value.type === "scalar" && agentAttr.range.containsPosition(position)) {
      const agent = (await this.chatModeService.getLocalModes()).findModeByName(agentAttr.value.value);
      if (agent && agent.uri) {
        return {
          uri: agent.uri.get(),
          range: new Range(1, 1, 1, 1)
        };
      }
    }
    return void 0;
  }
};
PromptHeaderDefinitionProvider = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, IChatModeService)
], PromptHeaderDefinitionProvider);
export {
  PromptHeaderDefinitionProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xcUHJvbXB0SGVhZGVyRGVmaW5pdGlvblByb3ZpZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgRGVmaW5pdGlvbiwgRGVmaW5pdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIH0gZnJvbSAnLi4vcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRzVHlwZUZvckxhbmd1YWdlSWQgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIFByb21wdEhlYWRlckRlZmluaXRpb25Qcm92aWRlciBpbXBsZW1lbnRzIERlZmluaXRpb25Qcm92aWRlciB7XG5cdC8qKlxuXHQgKiBEZWJ1ZyBkaXNwbGF5IG5hbWUgZm9yIHRoaXMgcHJvdmlkZXIuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgX2RlYnVnRGlzcGxheU5hbWU6IHN0cmluZyA9ICdQcm9tcHRIZWFkZXJEZWZpbml0aW9uUHJvdmlkZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVEZWZpbml0aW9uKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8RGVmaW5pdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHByb21wdFR5cGUgPSBnZXRQcm9tcHRzVHlwZUZvckxhbmd1YWdlSWQobW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKTtcblx0XHRpZiAoIXByb21wdFR5cGUpIHtcblx0XHRcdC8vIGlmIHRoZSBtb2RlbCBpcyBub3QgYSBwcm9tcHQsIHdlIGRvbid0IHByb3ZpZGUgYW55IGRlZmluaXRpb25zXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21wdEFTVCA9IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbCk7XG5cdFx0Y29uc3QgaGVhZGVyID0gcHJvbXB0QVNULmhlYWRlcjtcblx0XHRpZiAoIWhlYWRlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudEF0dHIgPSBoZWFkZXIuZ2V0QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnQpID8/IGhlYWRlci5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlKTtcblx0XHRpZiAoYWdlbnRBdHRyICYmIGFnZW50QXR0ci52YWx1ZS50eXBlID09PSAnc2NhbGFyJyAmJiBhZ2VudEF0dHIucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdGNvbnN0IGFnZW50ID0gKGF3YWl0IHRoaXMuY2hhdE1vZGVTZXJ2aWNlLmdldExvY2FsTW9kZXMoKSkuZmluZE1vZGVCeU5hbWUoYWdlbnRBdHRyLnZhbHVlLnZhbHVlKTtcblx0XHRcdGlmIChhZ2VudCAmJiBhZ2VudC51cmkpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmk6IGFnZW50LnVyaS5nZXQoKSxcblx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLGFBQWE7QUFHdEIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyx1QkFBdUI7QUFFekIsSUFBTSxpQ0FBTixNQUFtRTtBQUFBLEVBTXpFLFlBQ21DLGdCQUNDLGlCQUNsQztBQUZpQztBQUNDO0FBSnBDO0FBQUE7QUFBQTtBQUFBLFNBQWdCLG9CQUE0QjtBQUFBLEVBTTVDO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixPQUFtQixVQUFvQixPQUEyRDtBQUN6SCxVQUFNLGFBQWEsNEJBQTRCLE1BQU0sY0FBYyxDQUFDO0FBQ3BFLFFBQUksQ0FBQyxZQUFZO0FBRWhCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxZQUFZLEtBQUssZUFBZSxvQkFBb0IsS0FBSztBQUMvRCxVQUFNLFNBQVMsVUFBVTtBQUN6QixRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxZQUFZLE9BQU8sYUFBYSx1QkFBdUIsS0FBSyxLQUFLLE9BQU8sYUFBYSx1QkFBdUIsSUFBSTtBQUN0SCxRQUFJLGFBQWEsVUFBVSxNQUFNLFNBQVMsWUFBWSxVQUFVLE1BQU0saUJBQWlCLFFBQVEsR0FBRztBQUNqRyxZQUFNLFNBQVMsTUFBTSxLQUFLLGdCQUFnQixjQUFjLEdBQUcsZUFBZSxVQUFVLE1BQU0sS0FBSztBQUMvRixVQUFJLFNBQVMsTUFBTSxLQUFLO0FBQ3ZCLGVBQU87QUFBQSxVQUNOLEtBQUssTUFBTSxJQUFJLElBQUk7QUFBQSxVQUNuQixPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDNUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBRUQ7QUF0Q2EsaUNBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
