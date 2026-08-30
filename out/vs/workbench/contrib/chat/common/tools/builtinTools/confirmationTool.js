import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ConfirmationOptionKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ToolDataSource, ToolInvocationPresentation } from "../languageModelToolsService.js";
const ConfirmationToolId = "vscode_get_confirmation";
const ConfirmationToolWithOptionsId = "vscode_get_confirmation_with_options";
const ModifiedFilesConfirmationToolId = "vscode_get_modified_files_confirmation";
const ConfirmationToolData = {
  id: ConfirmationToolId,
  displayName: "Confirmation Tool",
  modelDescription: "A tool that demonstrates different types of confirmations. Takes a title, message, and confirmation type (basic or terminal).",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the confirmation dialog"
      },
      message: {
        type: "string",
        description: "Message to show in the confirmation dialog"
      },
      confirmationType: {
        type: "string",
        enum: ["basic", "terminal"],
        description: "Type of confirmation to show - basic for simple confirmation, terminal for terminal command confirmation"
      },
      terminalCommand: {
        type: "string",
        description: 'Terminal command to show (only used when confirmationType is "terminal")'
      }
    },
    required: ["title", "message", "confirmationType"],
    additionalProperties: false
  }
};
const ConfirmationToolWithOptionsData = {
  id: ConfirmationToolWithOptionsId,
  displayName: "Confirmation Tool with Options",
  modelDescription: "A tool that demonstrates different types of confirmations. Takes a title, message, and buttons.",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the confirmation dialog"
      },
      message: {
        type: "string",
        description: "Message to show in the confirmation dialog"
      },
      buttons: {
        type: "array",
        items: { type: "string" },
        description: "Custom button labels to display."
      }
    },
    required: ["title", "message", "buttons"],
    additionalProperties: false
  }
};
const ModifiedFilesConfirmationToolData = {
  id: ModifiedFilesConfirmationToolId,
  displayName: "Modified Files Confirmation Tool",
  modelDescription: "A tool that shows a modified-files confirmation UI with a split primary button and a hardcoded cancel action.",
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Title for the confirmation dialog"
      },
      message: {
        type: "string",
        description: "Message to show in the confirmation dialog"
      },
      options: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description: "Selectable option labels. The first option is used for the primary split button and the remaining options are placed in the dropdown menu."
      },
      modifiedFiles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "URI of the modified file."
            },
            originalUri: {
              type: "string",
              description: "Optional original URI used when opening a diff."
            },
            insertions: {
              type: "number",
              description: "Optional number of lines added."
            },
            deletions: {
              type: "number",
              description: "Optional number of lines removed."
            },
            title: {
              type: "string",
              description: "Optional title shown in the file tooltip."
            },
            description: {
              type: "string",
              description: "Optional secondary label shown for the file entry."
            }
          },
          required: ["uri"],
          additionalProperties: false
        },
        description: "Modified files to show in the confirmation UI."
      }
    },
    required: ["title", "message", "options", "modifiedFiles"],
    additionalProperties: false
  }
};
class ConfirmationTool {
  async prepareToolInvocation(context, token) {
    const parameters = context.parameters;
    if (!parameters.title || !parameters.message) {
      throw new Error("Missing required parameters for ConfirmationTool");
    }
    const confirmationType = parameters.confirmationType ?? "basic";
    let toolSpecificData;
    if (confirmationType === "terminal") {
      toolSpecificData = {
        kind: "terminal",
        commandLine: {
          original: parameters.terminalCommand ?? ""
        },
        language: "bash"
      };
    } else {
      toolSpecificData = void 0;
    }
    return {
      confirmationMessages: {
        title: parameters.title,
        message: new MarkdownString(parameters.message),
        allowAutoConfirm: (parameters.buttons || []).length ? false : true,
        // We cannot auto confirm if there are custom buttons, as we don't know which one to select
        customOptions: parameters.buttons?.map((label, index) => ({
          id: label,
          label,
          kind: index === 0 ? ConfirmationOptionKind.Approve : ConfirmationOptionKind.Deny
        }))
      },
      toolSpecificData,
      presentation: ToolInvocationPresentation.HiddenAfterComplete
    };
  }
  async invoke(invocation, countTokens, progress, token) {
    if (invocation.selectedCustomButton) {
      return {
        content: [{
          kind: "text",
          value: invocation.selectedCustomButton
        }]
      };
    }
    return {
      content: [{
        kind: "text",
        value: "yes"
        // Consumers should check for this label to know whether the tool was confirmed or skipped
      }]
    };
  }
}
class ModifiedFilesConfirmationTool {
  async prepareToolInvocation(context, token) {
    const parameters = context.parameters;
    if (!parameters.title || !parameters.message) {
      throw new Error("Missing required parameters for ModifiedFilesConfirmationTool");
    }
    if (!parameters.options?.length) {
      throw new Error("ModifiedFilesConfirmationTool requires at least one option");
    }
    const toolSpecificData = {
      kind: "modifiedFilesConfirmation",
      options: parameters.options,
      modifiedFiles: parameters.modifiedFiles.map((file) => ({
        uri: URI.parse(file.uri).toJSON(),
        originalUri: file.originalUri ? URI.parse(file.originalUri).toJSON() : void 0,
        insertions: file.insertions,
        deletions: file.deletions,
        title: file.title,
        description: file.description
      }))
    };
    return {
      confirmationMessages: {
        title: parameters.title,
        message: new MarkdownString(parameters.message),
        allowAutoConfirm: false
      },
      toolSpecificData,
      presentation: ToolInvocationPresentation.HiddenAfterComplete
    };
  }
  async invoke(invocation, countTokens, progress, token) {
    if (invocation.selectedCustomButton) {
      return {
        content: [{
          kind: "text",
          value: invocation.selectedCustomButton
        }]
      };
    }
    return {
      content: [{
        kind: "text",
        value: "yes"
        // Consumers should check for this label to know whether the tool was confirmed or skipped
      }]
    };
  }
}
export {
  ConfirmationTool,
  ConfirmationToolData,
  ConfirmationToolId,
  ConfirmationToolWithOptionsData,
  ConfirmationToolWithOptionsId,
  ModifiedFilesConfirmationTool,
  ModifiedFilesConfirmationToolData,
  ModifiedFilesConfirmationToolId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcY29uZmlybWF0aW9uVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbmZpcm1hdGlvbk9wdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbkRhdGEsIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb3VudFRva2Vuc0NhbGxiYWNrLCBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBJVG9vbFJlc3VsdCwgVG9vbERhdGFTb3VyY2UsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IENvbmZpcm1hdGlvblRvb2xJZCA9ICd2c2NvZGVfZ2V0X2NvbmZpcm1hdGlvbic7XG5leHBvcnQgY29uc3QgQ29uZmlybWF0aW9uVG9vbFdpdGhPcHRpb25zSWQgPSAndnNjb2RlX2dldF9jb25maXJtYXRpb25fd2l0aF9vcHRpb25zJztcbmV4cG9ydCBjb25zdCBNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uVG9vbElkID0gJ3ZzY29kZV9nZXRfbW9kaWZpZWRfZmlsZXNfY29uZmlybWF0aW9uJztcblxuZXhwb3J0IGNvbnN0IENvbmZpcm1hdGlvblRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBDb25maXJtYXRpb25Ub29sSWQsXG5cdGRpc3BsYXlOYW1lOiAnQ29uZmlybWF0aW9uIFRvb2wnLFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnQSB0b29sIHRoYXQgZGVtb25zdHJhdGVzIGRpZmZlcmVudCB0eXBlcyBvZiBjb25maXJtYXRpb25zLiBUYWtlcyBhIHRpdGxlLCBtZXNzYWdlLCBhbmQgY29uZmlybWF0aW9uIHR5cGUgKGJhc2ljIG9yIHRlcm1pbmFsKS4nLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RpdGxlIGZvciB0aGUgY29uZmlybWF0aW9uIGRpYWxvZydcblx0XHRcdH0sXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lc3NhZ2UgdG8gc2hvdyBpbiB0aGUgY29uZmlybWF0aW9uIGRpYWxvZydcblx0XHRcdH0sXG5cdFx0XHRjb25maXJtYXRpb25UeXBlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ2Jhc2ljJywgJ3Rlcm1pbmFsJ10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVHlwZSBvZiBjb25maXJtYXRpb24gdG8gc2hvdyAtIGJhc2ljIGZvciBzaW1wbGUgY29uZmlybWF0aW9uLCB0ZXJtaW5hbCBmb3IgdGVybWluYWwgY29tbWFuZCBjb25maXJtYXRpb24nXG5cdFx0XHR9LFxuXHRcdFx0dGVybWluYWxDb21tYW5kOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Rlcm1pbmFsIGNvbW1hbmQgdG8gc2hvdyAob25seSB1c2VkIHdoZW4gY29uZmlybWF0aW9uVHlwZSBpcyBcInRlcm1pbmFsXCIpJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IFsndGl0bGUnLCAnbWVzc2FnZScsICdjb25maXJtYXRpb25UeXBlJ10sXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBDb25maXJtYXRpb25Ub29sV2l0aE9wdGlvbnNEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiBDb25maXJtYXRpb25Ub29sV2l0aE9wdGlvbnNJZCxcblx0ZGlzcGxheU5hbWU6ICdDb25maXJtYXRpb24gVG9vbCB3aXRoIE9wdGlvbnMnLFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnQSB0b29sIHRoYXQgZGVtb25zdHJhdGVzIGRpZmZlcmVudCB0eXBlcyBvZiBjb25maXJtYXRpb25zLiBUYWtlcyBhIHRpdGxlLCBtZXNzYWdlLCBhbmQgYnV0dG9ucy4nLFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RpdGxlIGZvciB0aGUgY29uZmlybWF0aW9uIGRpYWxvZydcblx0XHRcdH0sXG5cdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ01lc3NhZ2UgdG8gc2hvdyBpbiB0aGUgY29uZmlybWF0aW9uIGRpYWxvZydcblx0XHRcdH0sXG5cdFx0XHRidXR0b25zOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQ3VzdG9tIGJ1dHRvbiBsYWJlbHMgdG8gZGlzcGxheS4nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWyd0aXRsZScsICdtZXNzYWdlJywgJ2J1dHRvbnMnXSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25Ub29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogTW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2xJZCxcblx0ZGlzcGxheU5hbWU6ICdNb2RpZmllZCBGaWxlcyBDb25maXJtYXRpb24gVG9vbCcsXG5cdG1vZGVsRGVzY3JpcHRpb246ICdBIHRvb2wgdGhhdCBzaG93cyBhIG1vZGlmaWVkLWZpbGVzIGNvbmZpcm1hdGlvbiBVSSB3aXRoIGEgc3BsaXQgcHJpbWFyeSBidXR0b24gYW5kIGEgaGFyZGNvZGVkIGNhbmNlbCBhY3Rpb24uJyxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUaXRsZSBmb3IgdGhlIGNvbmZpcm1hdGlvbiBkaWFsb2cnXG5cdFx0XHR9LFxuXHRcdFx0bWVzc2FnZToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdNZXNzYWdlIHRvIHNob3cgaW4gdGhlIGNvbmZpcm1hdGlvbiBkaWFsb2cnXG5cdFx0XHR9LFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZWxlY3RhYmxlIG9wdGlvbiBsYWJlbHMuIFRoZSBmaXJzdCBvcHRpb24gaXMgdXNlZCBmb3IgdGhlIHByaW1hcnkgc3BsaXQgYnV0dG9uIGFuZCB0aGUgcmVtYWluaW5nIG9wdGlvbnMgYXJlIHBsYWNlZCBpbiB0aGUgZHJvcGRvd24gbWVudS4nXG5cdFx0XHR9LFxuXHRcdFx0bW9kaWZpZWRGaWxlczoge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHVyaToge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdVUkkgb2YgdGhlIG1vZGlmaWVkIGZpbGUuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG9yaWdpbmFsVXJpOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIG9yaWdpbmFsIFVSSSB1c2VkIHdoZW4gb3BlbmluZyBhIGRpZmYuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGluc2VydGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgbnVtYmVyIG9mIGxpbmVzIGFkZGVkLidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkZWxldGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnT3B0aW9uYWwgbnVtYmVyIG9mIGxpbmVzIHJlbW92ZWQuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIHRpdGxlIHNob3duIGluIHRoZSBmaWxlIHRvb2x0aXAuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ09wdGlvbmFsIHNlY29uZGFyeSBsYWJlbCBzaG93biBmb3IgdGhlIGZpbGUgZW50cnkuJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsndXJpJ10sXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnTW9kaWZpZWQgZmlsZXMgdG8gc2hvdyBpbiB0aGUgY29uZmlybWF0aW9uIFVJLidcblx0XHRcdH1cblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3RpdGxlJywgJ21lc3NhZ2UnLCAnb3B0aW9ucycsICdtb2RpZmllZEZpbGVzJ10sXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdH1cbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpcm1hdGlvblRvb2xQYXJhbXMge1xuXHR0aXRsZTogc3RyaW5nO1xuXHRtZXNzYWdlOiBzdHJpbmc7XG5cdGNvbmZpcm1hdGlvblR5cGU/OiAnYmFzaWMnIHwgJ3Rlcm1pbmFsJztcblx0dGVybWluYWxDb21tYW5kPzogc3RyaW5nO1xuXHRidXR0b25zPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25Ub29sUGFyYW1zIHtcblx0dGl0bGU6IHN0cmluZztcblx0bWVzc2FnZTogc3RyaW5nO1xuXHRvcHRpb25zOiBzdHJpbmdbXTtcblx0bW9kaWZpZWRGaWxlczoge1xuXHRcdHVyaTogc3RyaW5nO1xuXHRcdG9yaWdpbmFsVXJpPzogc3RyaW5nO1xuXHRcdGluc2VydGlvbnM/OiBudW1iZXI7XG5cdFx0ZGVsZXRpb25zPzogbnVtYmVyO1xuXHRcdHRpdGxlPzogc3RyaW5nO1xuXHRcdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHR9W107XG59XG5cbmV4cG9ydCBjbGFzcyBDb25maXJtYXRpb25Ub29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSUNvbmZpcm1hdGlvblRvb2xQYXJhbXM7XG5cdFx0aWYgKCFwYXJhbWV0ZXJzLnRpdGxlIHx8ICFwYXJhbWV0ZXJzLm1lc3NhZ2UpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTWlzc2luZyByZXF1aXJlZCBwYXJhbWV0ZXJzIGZvciBDb25maXJtYXRpb25Ub29sJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlybWF0aW9uVHlwZSA9IHBhcmFtZXRlcnMuY29uZmlybWF0aW9uVHlwZSA/PyAnYmFzaWMnO1xuXG5cdFx0Ly8gQ3JlYXRlIGRpZmZlcmVudCB0b29sLXNwZWNpZmljIGRhdGEgYmFzZWQgb24gY29uZmlybWF0aW9uIHR5cGVcblx0XHRsZXQgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB8IHVuZGVmaW5lZDtcblxuXHRcdGlmIChjb25maXJtYXRpb25UeXBlID09PSAndGVybWluYWwnKSB7XG5cdFx0XHQvLyBGb3IgdGVybWluYWwgY29uZmlybWF0aW9ucywgdXNlIHRoZSB0ZXJtaW5hbCB0b29sIGRhdGEgc3RydWN0dXJlXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHRjb21tYW5kTGluZToge1xuXHRcdFx0XHRcdG9yaWdpbmFsOiBwYXJhbWV0ZXJzLnRlcm1pbmFsQ29tbWFuZCA/PyAnJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsYW5ndWFnZTogJ2Jhc2gnXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBGb3IgYmFzaWMgY29uZmlybWF0aW9ucywgZG9uJ3Qgc2V0IHRvb2xTcGVjaWZpY0RhdGEgLSB0aGlzIHdpbGwgdXNlIHRoZSBkZWZhdWx0IGNvbmZpcm1hdGlvbiBVSVxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0dGl0bGU6IHBhcmFtZXRlcnMudGl0bGUsXG5cdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhwYXJhbWV0ZXJzLm1lc3NhZ2UpLFxuXHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiAocGFyYW1ldGVycy5idXR0b25zIHx8IFtdKS5sZW5ndGggPyBmYWxzZSA6IHRydWUsIC8vIFdlIGNhbm5vdCBhdXRvIGNvbmZpcm0gaWYgdGhlcmUgYXJlIGN1c3RvbSBidXR0b25zLCBhcyB3ZSBkb24ndCBrbm93IHdoaWNoIG9uZSB0byBzZWxlY3Rcblx0XHRcdFx0Y3VzdG9tT3B0aW9uczogcGFyYW1ldGVycy5idXR0b25zPy5tYXAoKGxhYmVsLCBpbmRleCkgPT4gKHtcblx0XHRcdFx0XHRpZDogbGFiZWwsXG5cdFx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdFx0a2luZDogaW5kZXggPT09IDAgPyBDb25maXJtYXRpb25PcHRpb25LaW5kLkFwcHJvdmUgOiBDb25maXJtYXRpb25PcHRpb25LaW5kLkRlbnksXG5cdFx0XHRcdH0pKSxcblx0XHRcdH0sXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0cHJlc2VudGF0aW9uOiBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIGNvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Ly8gSWYgYSBjdXN0b20gYnV0dG9uIHdhcyBzZWxlY3RlZCwgcmV0dXJuIHRoZSBidXR0b24gbGFiZWxcblx0XHRpZiAoaW52b2NhdGlvbi5zZWxlY3RlZEN1c3RvbUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGludm9jYXRpb24uc2VsZWN0ZWRDdXN0b21CdXR0b25cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gRGVmYXVsdDogcmV0dXJuICd5ZXMnIGZvciBzdGFuZGFyZCBBbGxvdyBjb25maXJtYXRpb25cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogJ3llcycgLy8gQ29uc3VtZXJzIHNob3VsZCBjaGVjayBmb3IgdGhpcyBsYWJlbCB0byBrbm93IHdoZXRoZXIgdGhlIHRvb2wgd2FzIGNvbmZpcm1lZCBvciBza2lwcGVkXG5cdFx0XHR9XVxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25Ub29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcmFtZXRlcnMgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSU1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25Ub29sUGFyYW1zO1xuXHRcdGlmICghcGFyYW1ldGVycy50aXRsZSB8fCAhcGFyYW1ldGVycy5tZXNzYWdlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgcGFyYW1ldGVycyBmb3IgTW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvblRvb2wnKTtcblx0XHR9XG5cblx0XHRpZiAoIXBhcmFtZXRlcnMub3B0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ01vZGlmaWVkRmlsZXNDb25maXJtYXRpb25Ub29sIHJlcXVpcmVzIGF0IGxlYXN0IG9uZSBvcHRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhID0ge1xuXHRcdFx0a2luZDogJ21vZGlmaWVkRmlsZXNDb25maXJtYXRpb24nLFxuXHRcdFx0b3B0aW9uczogcGFyYW1ldGVycy5vcHRpb25zLFxuXHRcdFx0bW9kaWZpZWRGaWxlczogcGFyYW1ldGVycy5tb2RpZmllZEZpbGVzLm1hcChmaWxlID0+ICh7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGZpbGUudXJpKS50b0pTT04oKSxcblx0XHRcdFx0b3JpZ2luYWxVcmk6IGZpbGUub3JpZ2luYWxVcmkgPyBVUkkucGFyc2UoZmlsZS5vcmlnaW5hbFVyaSkudG9KU09OKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluc2VydGlvbnM6IGZpbGUuaW5zZXJ0aW9ucyxcblx0XHRcdFx0ZGVsZXRpb25zOiBmaWxlLmRlbGV0aW9ucyxcblx0XHRcdFx0dGl0bGU6IGZpbGUudGl0bGUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmaWxlLmRlc2NyaXB0aW9uLFxuXHRcdFx0fSkpLFxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29uZmlybWF0aW9uTWVzc2FnZXM6IHtcblx0XHRcdFx0dGl0bGU6IHBhcmFtZXRlcnMudGl0bGUsXG5cdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhwYXJhbWV0ZXJzLm1lc3NhZ2UpLFxuXHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0cHJlc2VudGF0aW9uOiBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIGNvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBwcm9ncmVzczogVG9vbFByb2dyZXNzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Ly8gSWYgYSBjdXN0b20gYnV0dG9uIHdhcyBzZWxlY3RlZCwgcmV0dXJuIHRoZSBidXR0b24gbGFiZWxcblx0XHRpZiAoaW52b2NhdGlvbi5zZWxlY3RlZEN1c3RvbUJ1dHRvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdFx0dmFsdWU6IGludm9jYXRpb24uc2VsZWN0ZWRDdXN0b21CdXR0b25cblx0XHRcdFx0fV1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gRGVmYXVsdDogcmV0dXJuICd5ZXMnIGZvciBzdGFuZGFyZCBBbGxvdyBjb25maXJtYXRpb25cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0a2luZDogJ3RleHQnLFxuXHRcdFx0XHR2YWx1ZTogJ3llcycgLy8gQ29uc3VtZXJzIHNob3VsZCBjaGVjayBmb3IgdGhpcyBsYWJlbCB0byBrbm93IHdoZXRoZXIgdGhlIHRvb2wgd2FzIGNvbmZpcm1lZCBvciBza2lwcGVkXG5cdFx0XHR9XVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLDhCQUE4QjtBQUV2QyxTQUE4SSxnQkFBZ0Isa0NBQWdEO0FBRXZNLE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sa0NBQWtDO0FBRXhDLE1BQU0sdUJBQWtDO0FBQUEsRUFDOUMsSUFBSTtBQUFBLEVBQ0osYUFBYTtBQUFBLEVBQ2Isa0JBQWtCO0FBQUEsRUFDbEIsUUFBUSxlQUFlO0FBQUEsRUFDdkIsYUFBYTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsT0FBTztBQUFBLFFBQ04sTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFB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
