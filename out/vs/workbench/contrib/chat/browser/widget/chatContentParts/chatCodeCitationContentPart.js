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
import * as dom from "../../../../../../base/browser/dom.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../../nls.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { getCodeCitationsMessage } from "../../../common/model/chatModel.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
let ChatCodeCitationContentPart = class extends Disposable {
  constructor(citations, context, editorService, telemetryService) {
    super();
    this.editorService = editorService;
    this.telemetryService = telemetryService;
    const label = getCodeCitationsMessage(citations.citations);
    const elements = dom.h(".chat-code-citation-message@root", [
      dom.h("span.chat-code-citation-label@label"),
      dom.h(".chat-code-citation-button-container@button")
    ]);
    elements.label.textContent = label + " - ";
    const button = this._register(new Button(elements.button, {
      buttonBackground: void 0,
      buttonBorder: void 0,
      buttonForeground: void 0,
      buttonHoverBackground: void 0,
      buttonSecondaryBackground: void 0,
      buttonSecondaryForeground: void 0,
      buttonSecondaryHoverBackground: void 0,
      buttonSeparator: void 0
    }));
    button.label = localize("viewMatches", "View matches");
    this._register(button.onDidClick(() => {
      const citationText = `# Code Citations

` + citations.citations.map((c) => `## License: ${c.license}
${c.value.toString()}

\`\`\`
${c.snippet}
\`\`\`

`).join("\n");
      this.editorService.openEditor({ resource: void 0, contents: citationText, languageId: "markdown" });
      this.telemetryService.publicLog2("openedChatCodeCitations");
    }));
    this.domNode = elements.root;
  }
  hasSameContent(other, followingContent, element) {
    return other.kind === "codeCitations";
  }
};
ChatCodeCitationContentPart = __decorateClass([
  __decorateParam(2, IEditorService),
  __decorateParam(3, ITelemetryService)
], ChatCodeCitationContentPart);
export {
  ChatCodeCitationContentPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENvbnRlbnRQYXJ0c1xcY2hhdENvZGVDaXRhdGlvbkNvbnRlbnRQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENoYXRUcmVlSXRlbSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydCwgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUNpdGF0aW9uc01lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0Q29kZUNpdGF0aW9ucywgSUNoYXRSZW5kZXJlckNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5cbnR5cGUgQ2hhdENvZGVDaXRhdGlvbk9wZW5lZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ3JvYmxvdXJlbnMnO1xuXHRjb21tZW50OiAnSW5kaWNhdGVzIHdoZW4gYSB1c2VyIG9wZW5zIGNoYXQgY29kZSBjaXRhdGlvbnMnO1xufTtcblxuZXhwb3J0IGNsYXNzIENoYXRDb2RlQ2l0YXRpb25Db250ZW50UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0cHVibGljIHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNpdGF0aW9uczogSUNoYXRDb2RlQ2l0YXRpb25zLFxuXHRcdGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBsYWJlbCA9IGdldENvZGVDaXRhdGlvbnNNZXNzYWdlKGNpdGF0aW9ucy5jaXRhdGlvbnMpO1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gZG9tLmgoJy5jaGF0LWNvZGUtY2l0YXRpb24tbWVzc2FnZUByb290JywgW1xuXHRcdFx0ZG9tLmgoJ3NwYW4uY2hhdC1jb2RlLWNpdGF0aW9uLWxhYmVsQGxhYmVsJyksXG5cdFx0XHRkb20uaCgnLmNoYXQtY29kZS1jaXRhdGlvbi1idXR0b24tY29udGFpbmVyQGJ1dHRvbicpLFxuXHRcdF0pO1xuXHRcdGVsZW1lbnRzLmxhYmVsLnRleHRDb250ZW50ID0gbGFiZWwgKyAnIC0gJztcblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKGVsZW1lbnRzLmJ1dHRvbiwge1xuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHRidXR0b25Ib3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uU2VwYXJhdG9yOiB1bmRlZmluZWRcblx0XHR9KSk7XG5cdFx0YnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ3ZpZXdNYXRjaGVzJywgXCJWaWV3IG1hdGNoZXNcIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2l0YXRpb25UZXh0ID0gYCMgQ29kZSBDaXRhdGlvbnNcXG5cXG5gICsgY2l0YXRpb25zLmNpdGF0aW9ucy5tYXAoYyA9PiBgIyMgTGljZW5zZTogJHtjLmxpY2Vuc2V9XFxuJHtjLnZhbHVlLnRvU3RyaW5nKCl9XFxuXFxuXFxgXFxgXFxgXFxuJHtjLnNuaXBwZXR9XFxuXFxgXFxgXFxgXFxuXFxuYCkuam9pbignXFxuJyk7XG5cdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB1bmRlZmluZWQsIGNvbnRlbnRzOiBjaXRhdGlvblRleHQsIGxhbmd1YWdlSWQ6ICdtYXJrZG93bicgfSk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7fSwgQ2hhdENvZGVDaXRhdGlvbk9wZW5lZENsYXNzaWZpY2F0aW9uPignb3BlbmVkQ2hhdENvZGVDaXRhdGlvbnMnKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gZWxlbWVudHMucm9vdDtcblx0fVxuXG5cdGhhc1NhbWVDb250ZW50KG90aGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgZm9sbG93aW5nQ29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSwgZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIG90aGVyLmtpbmQgPT09ICdjb2RlQ2l0YXRpb25zJztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMseUJBQXlCO0FBR2xDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsc0JBQXNCO0FBT3hCLElBQU0sOEJBQU4sY0FBMEMsV0FBdUM7QUFBQSxFQUd2RixZQUNDLFdBQ0EsU0FDaUMsZUFDRyxrQkFDbkM7QUFDRCxVQUFNO0FBSDJCO0FBQ0c7QUFJcEMsVUFBTSxRQUFRLHdCQUF3QixVQUFVLFNBQVM7QUFDekQsVUFBTSxXQUFXLElBQUksRUFBRSxvQ0FBb0M7QUFBQSxNQUMxRCxJQUFJLEVBQUUscUNBQXFDO0FBQUEsTUFDM0MsSUFBSSxFQUFFLDZDQUE2QztBQUFBLElBQ3BELENBQUM7QUFDRCxhQUFTLE1BQU0sY0FBYyxRQUFRO0FBQ3JDLFVBQU0sU0FBUyxLQUFLLFVBQVUsSUFBSSxPQUFPLFNBQVMsUUFBUTtBQUFBLE1BQ3pELGtCQUFrQjtBQUFBLE1BQ2xCLGNBQWM7QUFBQSxNQUNkLGtCQUFrQjtBQUFBLE1BQ2xCLHVCQUF1QjtBQUFBLE1BQ3ZCLDJCQUEyQjtBQUFBLE1BQzNCLDJCQUEyQjtBQUFBLE1BQzNCLGdDQUFnQztBQUFBLE1BQ2hDLGlCQUFpQjtBQUFBLElBQ2xCLENBQUMsQ0FBQztBQUNGLFdBQU8sUUFBUSxTQUFTLGVBQWUsY0FBYztBQUNyRCxTQUFLLFVBQVUsT0FBTyxXQUFXLE1BQU07QUFDdEMsWUFBTSxlQUFlO0FBQUE7QUFBQSxJQUF5QixVQUFVLFVBQVUsSUFBSSxPQUFLLGVBQWUsRUFBRSxPQUFPO0FBQUEsRUFBSyxFQUFFLE1BQU0sU0FBUyxDQUFDO0FBQUE7QUFBQTtBQUFBLEVBQWUsRUFBRSxPQUFPO0FBQUE7QUFBQTtBQUFBLENBQWMsRUFBRSxLQUFLLElBQUk7QUFDM0ssV0FBSyxjQUFjLFdBQVcsRUFBRSxVQUFVLFFBQVcsVUFBVSxjQUFjLFlBQVksV0FBVyxDQUFDO0FBQ3JHLFdBQUssaUJBQWlCLFdBQXFELHlCQUF5QjtBQUFBLElBQ3JHLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxTQUFTO0FBQUEsRUFDekI7QUFBQSxFQUVBLGVBQWUsT0FBNkIsa0JBQTBDLFNBQWdDO0FBQ3JILFdBQU8sTUFBTSxTQUFTO0FBQUEsRUFDdkI7QUFDRDtBQXZDYSw4QkFBTjtBQUFBLEVBTUo7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
