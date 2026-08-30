import * as nls from "../../../../nls.js";
const idDescription = nls.localize("JsonSchema.input.id", "The input's id is used to associate an input with a variable of the form ${input:id}.");
const typeDescription = nls.localize("JsonSchema.input.type", "The type of user input prompt to use.");
const descriptionDescription = nls.localize("JsonSchema.input.description", "The description is shown when the user is prompted for input.");
const defaultDescription = nls.localize("JsonSchema.input.default", "The default value for the input.");
const inputsSchema = {
  definitions: {
    inputs: {
      type: "array",
      description: nls.localize("JsonSchema.inputs", "User inputs. Used for defining user input prompts, such as free string input or a choice from several options."),
      items: {
        oneOf: [
          {
            type: "object",
            required: ["id", "type", "description"],
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                description: idDescription
              },
              type: {
                type: "string",
                description: typeDescription,
                enum: ["promptString"],
                enumDescriptions: [
                  nls.localize("JsonSchema.input.type.promptString", "The 'promptString' type opens an input box to ask the user for input.")
                ]
              },
              description: {
                type: "string",
                description: descriptionDescription
              },
              default: {
                type: "string",
                description: defaultDescription
              },
              password: {
                type: "boolean",
                description: nls.localize("JsonSchema.input.password", "Controls if a password input is shown. Password input hides the typed text.")
              }
            }
          },
          {
            type: "object",
            required: ["id", "type", "description", "options"],
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                description: idDescription
              },
              type: {
                type: "string",
                description: typeDescription,
                enum: ["pickString"],
                enumDescriptions: [
                  nls.localize("JsonSchema.input.type.pickString", "The 'pickString' type shows a selection list.")
                ]
              },
              description: {
                type: "string",
                description: descriptionDescription
              },
              default: {
                type: "string",
                description: defaultDescription
              },
              options: {
                type: "array",
                description: nls.localize("JsonSchema.input.options", "An array of strings that defines the options for a quick pick."),
                items: {
                  oneOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "object",
                      required: ["value"],
                      additionalProperties: false,
                      properties: {
                        label: {
                          type: "string",
                          description: nls.localize("JsonSchema.input.pickString.optionLabel", "Label for the option.")
                        },
                        value: {
                          type: "string",
                          description: nls.localize("JsonSchema.input.pickString.optionValue", "Value for the option.")
                        }
                      }
                    }
                  ]
                }
              }
            }
          },
          {
            type: "object",
            required: ["id", "type", "command"],
            additionalProperties: false,
            properties: {
              id: {
                type: "string",
                description: idDescription
              },
              type: {
                type: "string",
                description: typeDescription,
                enum: ["command"],
                enumDescriptions: [
                  nls.localize("JsonSchema.input.type.command", "The 'command' type executes a command.")
                ]
              },
              command: {
                type: "string",
                description: nls.localize("JsonSchema.input.command.command", "The command to execute for this input variable.")
              },
              args: {
                oneOf: [
                  {
                    type: "object",
                    description: nls.localize("JsonSchema.input.command.args", "Optional arguments passed to the command.")
                  },
                  {
                    type: "array",
                    description: nls.localize("JsonSchema.input.command.args", "Optional arguments passed to the command.")
                  },
                  {
                    type: "string",
                    description: nls.localize("JsonSchema.input.command.args", "Optional arguments passed to the command.")
                  }
                ]
              }
            }
          }
        ]
      }
    }
  }
};
export {
  inputsSchema
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxjb25maWd1cmF0aW9uUmVzb2x2ZXJcXGNvbW1vblxcY29uZmlndXJhdGlvblJlc29sdmVyU2NoZW1hLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuXG5jb25zdCBpZERlc2NyaXB0aW9uID0gbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LmlkJywgXCJUaGUgaW5wdXQncyBpZCBpcyB1c2VkIHRvIGFzc29jaWF0ZSBhbiBpbnB1dCB3aXRoIGEgdmFyaWFibGUgb2YgdGhlIGZvcm0gJHtpbnB1dDppZH0uXCIpO1xuY29uc3QgdHlwZURlc2NyaXB0aW9uID0gbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LnR5cGUnLCBcIlRoZSB0eXBlIG9mIHVzZXIgaW5wdXQgcHJvbXB0IHRvIHVzZS5cIik7XG5jb25zdCBkZXNjcmlwdGlvbkRlc2NyaXB0aW9uID0gbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LmRlc2NyaXB0aW9uJywgXCJUaGUgZGVzY3JpcHRpb24gaXMgc2hvd24gd2hlbiB0aGUgdXNlciBpcyBwcm9tcHRlZCBmb3IgaW5wdXQuXCIpO1xuY29uc3QgZGVmYXVsdERlc2NyaXB0aW9uID0gbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LmRlZmF1bHQnLCBcIlRoZSBkZWZhdWx0IHZhbHVlIGZvciB0aGUgaW5wdXQuXCIpO1xuXG5cbmV4cG9ydCBjb25zdCBpbnB1dHNTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRkZWZpbml0aW9uczoge1xuXHRcdGlucHV0czoge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuaW5wdXRzJywgJ1VzZXIgaW5wdXRzLiBVc2VkIGZvciBkZWZpbmluZyB1c2VyIGlucHV0IHByb21wdHMsIHN1Y2ggYXMgZnJlZSBzdHJpbmcgaW5wdXQgb3IgYSBjaG9pY2UgZnJvbSBzZXZlcmFsIG9wdGlvbnMuJyksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAndHlwZScsICdkZXNjcmlwdGlvbiddLFxuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBpZERlc2NyaXB0aW9uXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHR5cGU6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdHlwZURlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFsncHJvbXB0U3RyaW5nJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LnR5cGUucHJvbXB0U3RyaW5nJywgXCJUaGUgJ3Byb21wdFN0cmluZycgdHlwZSBvcGVucyBhbiBpbnB1dCBib3ggdG8gYXNrIHRoZSB1c2VyIGZvciBpbnB1dC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbkRlc2NyaXB0aW9uXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGVmYXVsdERlc2NyaXB0aW9uXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHBhc3N3b3JkOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuaW5wdXQucGFzc3dvcmQnLCBcIkNvbnRyb2xzIGlmIGEgcGFzc3dvcmQgaW5wdXQgaXMgc2hvd24uIFBhc3N3b3JkIGlucHV0IGhpZGVzIHRoZSB0eXBlZCB0ZXh0LlwiKSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAndHlwZScsICdkZXNjcmlwdGlvbicsICdvcHRpb25zJ10sXG5cdFx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGlkRGVzY3JpcHRpb25cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0dHlwZToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0eXBlRGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bTogWydwaWNrU3RyaW5nJ10sXG5cdFx0XHRcdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LnR5cGUucGlja1N0cmluZycsIFwiVGhlICdwaWNrU3RyaW5nJyB0eXBlIHNob3dzIGEgc2VsZWN0aW9uIGxpc3QuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25EZXNjcmlwdGlvblxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGRlZmF1bHREZXNjcmlwdGlvblxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0Lm9wdGlvbnMnLCBcIkFuIGFycmF5IG9mIHN0cmluZ3MgdGhhdCBkZWZpbmVzIHRoZSBvcHRpb25zIGZvciBhIHF1aWNrIHBpY2suXCIpLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3ZhbHVlJ10sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdGxhYmVsOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LnBpY2tTdHJpbmcub3B0aW9uTGFiZWwnLCBcIkxhYmVsIGZvciB0aGUgb3B0aW9uLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LnBpY2tTdHJpbmcub3B0aW9uVmFsdWUnLCBcIlZhbHVlIGZvciB0aGUgb3B0aW9uLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRyZXF1aXJlZDogWydpZCcsICd0eXBlJywgJ2NvbW1hbmQnXSxcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogaWREZXNjcmlwdGlvblxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR0eXBlOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHR5cGVEZXNjcmlwdGlvbixcblx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ2NvbW1hbmQnXSxcblx0XHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuaW5wdXQudHlwZS5jb21tYW5kJywgXCJUaGUgJ2NvbW1hbmQnIHR5cGUgZXhlY3V0ZXMgYSBjb21tYW5kLlwiKSxcblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LmNvbW1hbmQuY29tbWFuZCcsIFwiVGhlIGNvbW1hbmQgdG8gZXhlY3V0ZSBmb3IgdGhpcyBpbnB1dCB2YXJpYWJsZS5cIilcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0YXJnczoge1xuXHRcdFx0XHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmlucHV0LmNvbW1hbmQuYXJncycsIFwiT3B0aW9uYWwgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZC5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuaW5wdXQuY29tbWFuZC5hcmdzJywgXCJPcHRpb25hbCBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBjb21tYW5kLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuaW5wdXQuY29tbWFuZC5hcmdzJywgXCJPcHRpb25hbCBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBjb21tYW5kLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUdyQixNQUFNLGdCQUFnQixJQUFJLFNBQVMsdUJBQXVC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
