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
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import {
  ToolDataSource,
  ToolInvocationPresentation
} from "../languageModelToolsService.js";
import { IChatArtifactsService } from "../chatArtifactsService.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { IChatService } from "../../chatService/chatService.js";
const SetArtifactsToolId = "setArtifacts";
const inputSchema = {
  type: "object",
  properties: {
    artifacts: {
      type: "array",
      description: "The complete list of artifacts for this session. Overwrites any existing artifacts.",
      items: {
        type: "object",
        properties: {
          label: {
            type: "string",
            description: "Display label for the artifact."
          },
          uri: {
            type: "string",
            description: "Fully qualified URI of the artifact (e.g. https://localhost:3000 or file:///path/to/file). Must include the scheme."
          },
          type: {
            type: "string",
            enum: ["devServer", "screenshot", "plan"],
            description: "The type of artifact."
          }
        },
        required: ["label"]
      }
    }
  },
  required: ["artifacts"]
};
const SetArtifactsToolData = {
  id: SetArtifactsToolId,
  toolReferenceName: "artifacts",
  legacyToolReferenceFullNames: ["Set Session Artifacts"],
  displayName: localize("tool.setArtifacts.displayName", "Set Session Artifacts"),
  modelDescription: "Set the list of artifacts for the current session. Each artifact has a label and either a uri or a toolCallId+dataPartIndex reference, plus an optional type (devServer, screenshot, plan). This overwrites the entire artifact list. URIs must be fully qualified with a scheme (e.g. https://localhost:3000, file:///tmp/plan.md). To reference a screenshot or image from a previous tool result, use toolCallId and dataPartIndex instead of uri.\n\nWhen to use this tool:\n- When creating or updating a plan saved to session memory \u2014 set a plan artifact so the user can view it in the artifact panel\n- When taking screenshots or producing visual output \u2014 set a screenshot artifact to surface the image\n- When starting a dev server \u2014 set a devServer artifact with the URL so the user can access it\n- When producing important documents, drafts, or temporary markdown files \u2014 set an artifact to make them easily accessible\n- After verification steps that produce visual results \u2014 update artifacts with screenshots showing the outcome\n\nWorkflow:\n- Prefer artifacts over printing long content inline in chat. Save content to a file or memory, then set an artifact pointing to it.\n- When updating plans or documents, update both the underlying file AND the artifact list.\n- Keep artifact labels concise and descriptive.",
  canBeReferencedInPrompt: true,
  source: ToolDataSource.Internal,
  inputSchema
};
let SetArtifactsTool = class {
  constructor(_chatArtifactsService, _fileService, _chatService) {
    this._chatArtifactsService = _chatArtifactsService;
    this._fileService = _fileService;
    this._chatService = _chatService;
  }
  async prepareToolInvocation(_context, _token) {
    return {
      pastTenseMessage: new MarkdownString(localize("tool.setArtifacts.pastTense", "Updated session artifacts")),
      presentation: ToolInvocationPresentation.Hidden
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const args = invocation.parameters;
    const chatSessionResource = invocation.context?.sessionResource;
    if (!chatSessionResource) {
      return {
        content: [{ kind: "text", value: "Error: No session resource available" }]
      };
    }
    const artifacts = [];
    for (const a of args.artifacts ?? []) {
      let uri = a.uri;
      if (!uri) {
        uri = "";
      }
      if (uri) {
        const parsed = URI.parse(uri);
        if (parsed.scheme !== "http" && parsed.scheme !== "https") {
          if (!await this._fileService.exists(parsed)) {
            throw new Error(localize("tool.setArtifacts.uriNotFound", "Artifact URI does not exist: {0}", uri));
          }
        }
      }
      artifacts.push({ label: a.label, uri, type: a.type });
    }
    const chatArtifacts = this._chatArtifactsService.getArtifacts(chatSessionResource);
    const subAgentInvocationId = invocation.subAgentInvocationId;
    if (subAgentInvocationId) {
      const agentName = this._resolveSubagentName(chatSessionResource, subAgentInvocationId);
      chatArtifacts.setSubagentArtifacts(subAgentInvocationId, agentName, artifacts);
    } else {
      chatArtifacts.setAgentArtifacts(artifacts);
    }
    return {
      content: [{ kind: "text", value: localize("tool.setArtifacts.success", "Set {0} artifact(s)", artifacts.length) }]
    };
  }
  _resolveSubagentName(sessionResource, subAgentInvocationId) {
    const model = this._chatService.getSession(sessionResource);
    if (!model) {
      return void 0;
    }
    for (const request of model.getRequests()) {
      const response = request.response;
      if (!response) {
        continue;
      }
      for (const part of response.response.value) {
        if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolCallId === subAgentInvocationId && part.toolSpecificData?.kind === "subagent") {
          return part.toolSpecificData.agentName;
        }
      }
    }
    return void 0;
  }
};
SetArtifactsTool = __decorateClass([
  __decorateParam(0, IChatArtifactsService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IChatService)
], SetArtifactsTool);
export {
  SetArtifactsTool,
  SetArtifactsToolData,
  SetArtifactsToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcc2V0QXJ0aWZhY3RzVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQge1xuXHRJVG9vbERhdGEsXG5cdElUb29sSW1wbCxcblx0SVRvb2xJbnZvY2F0aW9uLFxuXHRJVG9vbFJlc3VsdCxcblx0VG9vbERhdGFTb3VyY2UsXG5cdElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCxcblx0SVByZXBhcmVkVG9vbEludm9jYXRpb24sXG5cdFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uXG59IGZyb20gJy4uL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBcnRpZmFjdCwgSUNoYXRBcnRpZmFjdHNTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdEFydGlmYWN0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBTZXRBcnRpZmFjdHNUb29sSWQgPSAnc2V0QXJ0aWZhY3RzJztcblxuY29uc3QgaW5wdXRTY2hlbWE6IElKU09OU2NoZW1hICYgeyBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCB9ID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0cHJvcGVydGllczoge1xuXHRcdGFydGlmYWN0czoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIGNvbXBsZXRlIGxpc3Qgb2YgYXJ0aWZhY3RzIGZvciB0aGlzIHNlc3Npb24uIE92ZXJ3cml0ZXMgYW55IGV4aXN0aW5nIGFydGlmYWN0cy4nLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Rpc3BsYXkgbGFiZWwgZm9yIHRoZSBhcnRpZmFjdC4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR1cmk6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdGdWxseSBxdWFsaWZpZWQgVVJJIG9mIHRoZSBhcnRpZmFjdCAoZS5nLiBodHRwczovL2xvY2FsaG9zdDozMDAwIG9yIGZpbGU6Ly8vcGF0aC90by9maWxlKS4gTXVzdCBpbmNsdWRlIHRoZSBzY2hlbWUuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dHlwZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRlbnVtOiBbJ2RldlNlcnZlcicsICdzY3JlZW5zaG90JywgJ3BsYW4nXSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIHR5cGUgb2YgYXJ0aWZhY3QuJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0cmVxdWlyZWQ6IFsnbGFiZWwnXVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0cmVxdWlyZWQ6IFsnYXJ0aWZhY3RzJ11cbn07XG5cbmV4cG9ydCBjb25zdCBTZXRBcnRpZmFjdHNUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogU2V0QXJ0aWZhY3RzVG9vbElkLFxuXHR0b29sUmVmZXJlbmNlTmFtZTogJ2FydGlmYWN0cycsXG5cdGxlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXM6IFsnU2V0IFNlc3Npb24gQXJ0aWZhY3RzJ10sXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgndG9vbC5zZXRBcnRpZmFjdHMuZGlzcGxheU5hbWUnLCAnU2V0IFNlc3Npb24gQXJ0aWZhY3RzJyksXG5cdG1vZGVsRGVzY3JpcHRpb246ICdTZXQgdGhlIGxpc3Qgb2YgYXJ0aWZhY3RzIGZvciB0aGUgY3VycmVudCBzZXNzaW9uLiBFYWNoIGFydGlmYWN0IGhhcyBhIGxhYmVsIGFuZCBlaXRoZXIgYSB1cmkgb3IgYSB0b29sQ2FsbElkK2RhdGFQYXJ0SW5kZXggcmVmZXJlbmNlLCBwbHVzIGFuIG9wdGlvbmFsIHR5cGUgKGRldlNlcnZlciwgc2NyZWVuc2hvdCwgcGxhbikuIFRoaXMgb3ZlcndyaXRlcyB0aGUgZW50aXJlIGFydGlmYWN0IGxpc3QuIFVSSXMgbXVzdCBiZSBmdWxseSBxdWFsaWZpZWQgd2l0aCBhIHNjaGVtZSAoZS5nLiBodHRwczovL2xvY2FsaG9zdDozMDAwLCBmaWxlOi8vL3RtcC9wbGFuLm1kKS4gVG8gcmVmZXJlbmNlIGEgc2NyZWVuc2hvdCBvciBpbWFnZSBmcm9tIGEgcHJldmlvdXMgdG9vbCByZXN1bHQsIHVzZSB0b29sQ2FsbElkIGFuZCBkYXRhUGFydEluZGV4IGluc3RlYWQgb2YgdXJpLlxcblxcbldoZW4gdG8gdXNlIHRoaXMgdG9vbDpcXG4tIFdoZW4gY3JlYXRpbmcgb3IgdXBkYXRpbmcgYSBwbGFuIHNhdmVkIHRvIHNlc3Npb24gbWVtb3J5IFx1MjAxNCBzZXQgYSBwbGFuIGFydGlmYWN0IHNvIHRoZSB1c2VyIGNhbiB2aWV3IGl0IGluIHRoZSBhcnRpZmFjdCBwYW5lbFxcbi0gV2hlbiB0YWtpbmcgc2NyZWVuc2hvdHMgb3IgcHJvZHVjaW5nIHZpc3VhbCBvdXRwdXQgXHUyMDE0IHNldCBhIHNjcmVlbnNob3QgYXJ0aWZhY3QgdG8gc3VyZmFjZSB0aGUgaW1hZ2VcXG4tIFdoZW4gc3RhcnRpbmcgYSBkZXYgc2VydmVyIFx1MjAxNCBzZXQgYSBkZXZTZXJ2ZXIgYXJ0aWZhY3Qgd2l0aCB0aGUgVVJMIHNvIHRoZSB1c2VyIGNhbiBhY2Nlc3MgaXRcXG4tIFdoZW4gcHJvZHVjaW5nIGltcG9ydGFudCBkb2N1bWVudHMsIGRyYWZ0cywgb3IgdGVtcG9yYXJ5IG1hcmtkb3duIGZpbGVzIFx1MjAxNCBzZXQgYW4gYXJ0aWZhY3QgdG8gbWFrZSB0aGVtIGVhc2lseSBhY2Nlc3NpYmxlXFxuLSBBZnRlciB2ZXJpZmljYXRpb24gc3RlcHMgdGhhdCBwcm9kdWNlIHZpc3VhbCByZXN1bHRzIFx1MjAxNCB1cGRhdGUgYXJ0aWZhY3RzIHdpdGggc2NyZWVuc2hvdHMgc2hvd2luZyB0aGUgb3V0Y29tZVxcblxcbldvcmtmbG93Olxcbi0gUHJlZmVyIGFydGlmYWN0cyBvdmVyIHByaW50aW5nIGxvbmcgY29udGVudCBpbmxpbmUgaW4gY2hhdC4gU2F2ZSBjb250ZW50IHRvIGEgZmlsZSBvciBtZW1vcnksIHRoZW4gc2V0IGFuIGFydGlmYWN0IHBvaW50aW5nIHRvIGl0Llxcbi0gV2hlbiB1cGRhdGluZyBwbGFucyBvciBkb2N1bWVudHMsIHVwZGF0ZSBib3RoIHRoZSB1bmRlcmx5aW5nIGZpbGUgQU5EIHRoZSBhcnRpZmFjdCBsaXN0Llxcbi0gS2VlcCBhcnRpZmFjdCBsYWJlbHMgY29uY2lzZSBhbmQgZGVzY3JpcHRpdmUuJyxcblx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGlucHV0U2NoZW1hXG59O1xuXG5pbnRlcmZhY2UgSVNldEFydGlmYWN0c1Rvb2xJbnB1dCB7XG5cdGFydGlmYWN0czogSUNoYXRBcnRpZmFjdFtdO1xufVxuXG5leHBvcnQgY2xhc3MgU2V0QXJ0aWZhY3RzVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0QXJ0aWZhY3RzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0QXJ0aWZhY3RzU2VydmljZTogSUNoYXRBcnRpZmFjdHNTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKF9jb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndG9vbC5zZXRBcnRpZmFjdHMucGFzdFRlbnNlJywgXCJVcGRhdGVkIHNlc3Npb24gYXJ0aWZhY3RzXCIpKSxcblx0XHRcdHByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IG5ldmVyLCBfcHJvZ3Jlc3M6IG5ldmVyLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSVNldEFydGlmYWN0c1Rvb2xJbnB1dDtcblx0XHRjb25zdCBjaGF0U2Vzc2lvblJlc291cmNlID0gaW52b2NhdGlvbi5jb250ZXh0Py5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0aWYgKCFjaGF0U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnRXJyb3I6IE5vIHNlc3Npb24gcmVzb3VyY2UgYXZhaWxhYmxlJyB9XVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRjb25zdCBhcnRpZmFjdHM6IElDaGF0QXJ0aWZhY3RbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYSBvZiBhcmdzLmFydGlmYWN0cyA/PyBbXSkge1xuXHRcdFx0bGV0IHVyaSA9IGEudXJpO1xuXHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0dXJpID0gJyc7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1cmkpIHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkID0gVVJJLnBhcnNlKHVyaSk7XG5cdFx0XHRcdGlmIChwYXJzZWQuc2NoZW1lICE9PSAnaHR0cCcgJiYgcGFyc2VkLnNjaGVtZSAhPT0gJ2h0dHBzJykge1xuXHRcdFx0XHRcdGlmICghYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHBhcnNlZCkpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihsb2NhbGl6ZSgndG9vbC5zZXRBcnRpZmFjdHMudXJpTm90Rm91bmQnLCBcIkFydGlmYWN0IFVSSSBkb2VzIG5vdCBleGlzdDogezB9XCIsIHVyaSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhcnRpZmFjdHMucHVzaCh7IGxhYmVsOiBhLmxhYmVsLCB1cmksIHR5cGU6IGEudHlwZSB9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0QXJ0aWZhY3RzID0gdGhpcy5fY2hhdEFydGlmYWN0c1NlcnZpY2UuZ2V0QXJ0aWZhY3RzKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHN1YkFnZW50SW52b2NhdGlvbklkID0gaW52b2NhdGlvbi5zdWJBZ2VudEludm9jYXRpb25JZDtcblxuXHRcdGlmIChzdWJBZ2VudEludm9jYXRpb25JZCkge1xuXHRcdFx0Y29uc3QgYWdlbnROYW1lID0gdGhpcy5fcmVzb2x2ZVN1YmFnZW50TmFtZShjaGF0U2Vzc2lvblJlc291cmNlLCBzdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdFx0XHRjaGF0QXJ0aWZhY3RzLnNldFN1YmFnZW50QXJ0aWZhY3RzKHN1YkFnZW50SW52b2NhdGlvbklkLCBhZ2VudE5hbWUsIGFydGlmYWN0cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNoYXRBcnRpZmFjdHMuc2V0QWdlbnRBcnRpZmFjdHMoYXJ0aWZhY3RzKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogbG9jYWxpemUoJ3Rvb2wuc2V0QXJ0aWZhY3RzLnN1Y2Nlc3MnLCBcIlNldCB7MH0gYXJ0aWZhY3QocylcIiwgYXJ0aWZhY3RzLmxlbmd0aCkgfV1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVN1YmFnZW50TmFtZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIG1vZGVsLmdldFJlcXVlc3RzKCkpIHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZTtcblx0XHRcdGlmICghcmVzcG9uc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgcmVzcG9uc2UucmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0aWYgKChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiZcblx0XHRcdFx0XHRwYXJ0LnRvb2xDYWxsSWQgPT09IHN1YkFnZW50SW52b2NhdGlvbklkICYmXG5cdFx0XHRcdFx0cGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQudG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFPQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0I7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
