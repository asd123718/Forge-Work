import * as nls from "../../../../nls.js";
import { Schemas } from "./problemMatcher.js";
const schema = {
  definitions: {
    showOutputType: {
      type: "string",
      enum: ["always", "silent", "never"]
    },
    options: {
      type: "object",
      description: nls.localize("JsonSchema.options", "Additional command options"),
      properties: {
        cwd: {
          type: "string",
          description: nls.localize("JsonSchema.options.cwd", "The current working directory of the executed program or script. If omitted Code's current workspace root is used.")
        },
        env: {
          type: "object",
          additionalProperties: {
            type: "string"
          },
          description: nls.localize("JsonSchema.options.env", "The environment of the executed program or shell. If omitted the parent process' environment is used.")
        }
      },
      additionalProperties: {
        type: ["string", "array", "object"]
      }
    },
    problemMatcherType: {
      oneOf: [
        {
          type: "string",
          errorMessage: nls.localize("JsonSchema.tasks.matcherError", "Unrecognized problem matcher. Is the extension that contributes this problem matcher installed?")
        },
        Schemas.LegacyProblemMatcher,
        {
          type: "array",
          items: {
            anyOf: [
              {
                type: "string",
                errorMessage: nls.localize("JsonSchema.tasks.matcherError", "Unrecognized problem matcher. Is the extension that contributes this problem matcher installed?")
              },
              Schemas.LegacyProblemMatcher
            ]
          }
        }
      ]
    },
    shellConfiguration: {
      type: "object",
      additionalProperties: false,
      description: nls.localize("JsonSchema.shellConfiguration", "Configures the shell to be used."),
      properties: {
        executable: {
          type: "string",
          description: nls.localize("JsonSchema.shell.executable", "The shell to be used.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.shell.args", "The shell arguments."),
          items: {
            type: "string"
          }
        }
      }
    },
    commandConfiguration: {
      type: "object",
      additionalProperties: false,
      properties: {
        command: {
          type: "string",
          description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.tasks.args", "Arguments passed to the command when this task is invoked."),
          items: {
            type: "string"
          }
        },
        options: {
          $ref: "#/definitions/options"
        }
      }
    },
    taskDescription: {
      type: "object",
      required: ["taskName"],
      additionalProperties: false,
      properties: {
        taskName: {
          type: "string",
          description: nls.localize("JsonSchema.tasks.taskName", "The task's name")
        },
        command: {
          type: "string",
          description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.tasks.args", "Arguments passed to the command when this task is invoked."),
          items: {
            type: "string"
          }
        },
        options: {
          $ref: "#/definitions/options"
        },
        windows: {
          anyOf: [
            {
              $ref: "#/definitions/commandConfiguration",
              description: nls.localize("JsonSchema.tasks.windows", "Windows specific command configuration")
            },
            {
              properties: {
                problemMatcher: {
                  $ref: "#/definitions/problemMatcherType",
                  description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
                }
              }
            }
          ]
        },
        osx: {
          anyOf: [
            {
              $ref: "#/definitions/commandConfiguration",
              description: nls.localize("JsonSchema.tasks.mac", "Mac specific command configuration")
            },
            {
              properties: {
                problemMatcher: {
                  $ref: "#/definitions/problemMatcherType",
                  description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
                }
              }
            }
          ]
        },
        linux: {
          anyOf: [
            {
              $ref: "#/definitions/commandConfiguration",
              description: nls.localize("JsonSchema.tasks.linux", "Linux specific command configuration")
            },
            {
              properties: {
                problemMatcher: {
                  $ref: "#/definitions/problemMatcherType",
                  description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
                }
              }
            }
          ]
        },
        suppressTaskName: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.suppressTaskName", "Controls whether the task name is added as an argument to the command. If omitted the globally defined value is used."),
          default: true
        },
        showOutput: {
          $ref: "#/definitions/showOutputType",
          description: nls.localize("JsonSchema.tasks.showOutput", "Controls whether the output of the running task is shown or not. If omitted the globally defined value is used.")
        },
        echoCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.echoCommand", "Controls whether the executed command is echoed to the output. Default is false."),
          default: true
        },
        isWatching: {
          type: "boolean",
          deprecationMessage: nls.localize("JsonSchema.tasks.watching.deprecation", "Deprecated. Use isBackground instead."),
          description: nls.localize("JsonSchema.tasks.watching", "Whether the executed task is kept alive and is watching the file system."),
          default: true
        },
        isBackground: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.background", "Whether the executed task is kept alive and is running in the background."),
          default: true
        },
        promptOnClose: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.promptOnClose", "Whether the user is prompted when VS Code closes with a running task."),
          default: false
        },
        isBuildCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.build", "Maps this task to Code's default build command."),
          default: true
        },
        isTestCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.tasks.test", "Maps this task to Code's default test command."),
          default: true
        },
        problemMatcher: {
          $ref: "#/definitions/problemMatcherType",
          description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
        }
      }
    },
    taskRunnerConfiguration: {
      type: "object",
      required: [],
      properties: {
        command: {
          type: "string",
          description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
        },
        args: {
          type: "array",
          description: nls.localize("JsonSchema.args", "Additional arguments passed to the command."),
          items: {
            type: "string"
          }
        },
        options: {
          $ref: "#/definitions/options"
        },
        showOutput: {
          $ref: "#/definitions/showOutputType",
          description: nls.localize("JsonSchema.showOutput", "Controls whether the output of the running task is shown or not. If omitted 'always' is used.")
        },
        isWatching: {
          type: "boolean",
          deprecationMessage: nls.localize("JsonSchema.watching.deprecation", "Deprecated. Use isBackground instead."),
          description: nls.localize("JsonSchema.watching", "Whether the executed task is kept alive and is watching the file system."),
          default: true
        },
        isBackground: {
          type: "boolean",
          description: nls.localize("JsonSchema.background", "Whether the executed task is kept alive and is running in the background."),
          default: true
        },
        promptOnClose: {
          type: "boolean",
          description: nls.localize("JsonSchema.promptOnClose", "Whether the user is prompted when VS Code closes with a running background task."),
          default: false
        },
        echoCommand: {
          type: "boolean",
          description: nls.localize("JsonSchema.echoCommand", "Controls whether the executed command is echoed to the output. Default is false."),
          default: true
        },
        suppressTaskName: {
          type: "boolean",
          description: nls.localize("JsonSchema.suppressTaskName", "Controls whether the task name is added as an argument to the command. Default is false."),
          default: true
        },
        taskSelector: {
          type: "string",
          description: nls.localize("JsonSchema.taskSelector", "Prefix to indicate that an argument is task.")
        },
        problemMatcher: {
          $ref: "#/definitions/problemMatcherType",
          description: nls.localize("JsonSchema.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
        },
        tasks: {
          type: "array",
          description: nls.localize("JsonSchema.tasks", "The task configurations. Usually these are enrichments of task already defined in the external task runner."),
          items: {
            type: "object",
            $ref: "#/definitions/taskDescription"
          }
        }
      }
    }
  }
};
var jsonSchemaCommon_default = schema;
export {
  jsonSchemaCommon_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXGpzb25TY2hlbWFDb21tb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5cbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuL3Byb2JsZW1NYXRjaGVyLmpzJztcblxuY29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0ZGVmaW5pdGlvbnM6IHtcblx0XHRzaG93T3V0cHV0VHlwZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdzaWxlbnQnLCAnbmV2ZXInXVxuXHRcdH0sXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLm9wdGlvbnMnLCAnQWRkaXRpb25hbCBjb21tYW5kIG9wdGlvbnMnKSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Y3dkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5vcHRpb25zLmN3ZCcsICdUaGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBvZiB0aGUgZXhlY3V0ZWQgcHJvZ3JhbSBvciBzY3JpcHQuIElmIG9taXR0ZWQgQ29kZVxcJ3MgY3VycmVudCB3b3Jrc3BhY2Ugcm9vdCBpcyB1c2VkLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVudjoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5vcHRpb25zLmVudicsICdUaGUgZW52aXJvbm1lbnQgb2YgdGhlIGV4ZWN1dGVkIHByb2dyYW0gb3Igc2hlbGwuIElmIG9taXR0ZWQgdGhlIHBhcmVudCBwcm9jZXNzXFwnIGVudmlyb25tZW50IGlzIHVzZWQuJylcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ2FycmF5JywgJ29iamVjdCddXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRwcm9ibGVtTWF0Y2hlclR5cGU6IHtcblx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5tYXRjaGVyRXJyb3InLCAnVW5yZWNvZ25pemVkIHByb2JsZW0gbWF0Y2hlci4gSXMgdGhlIGV4dGVuc2lvbiB0aGF0IGNvbnRyaWJ1dGVzIHRoaXMgcHJvYmxlbSBtYXRjaGVyIGluc3RhbGxlZD8nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRTY2hlbWFzLkxlZ2FjeVByb2JsZW1NYXRjaGVyLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdGVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLm1hdGNoZXJFcnJvcicsICdVbnJlY29nbml6ZWQgcHJvYmxlbSBtYXRjaGVyLiBJcyB0aGUgZXh0ZW5zaW9uIHRoYXQgY29udHJpYnV0ZXMgdGhpcyBwcm9ibGVtIG1hdGNoZXIgaW5zdGFsbGVkPycpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFNjaGVtYXMuTGVnYWN5UHJvYmxlbU1hdGNoZXJcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdHNoZWxsQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnNoZWxsQ29uZmlndXJhdGlvbicsICdDb25maWd1cmVzIHRoZSBzaGVsbCB0byBiZSB1c2VkLicpLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRleGVjdXRhYmxlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5zaGVsbC5leGVjdXRhYmxlJywgJ1RoZSBzaGVsbCB0byBiZSB1c2VkLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFyZ3M6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuc2hlbGwuYXJncycsICdUaGUgc2hlbGwgYXJndW1lbnRzLicpLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y29tbWFuZENvbmZpZ3VyYXRpb246IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jb21tYW5kJywgJ1RoZSBjb21tYW5kIHRvIGJlIGV4ZWN1dGVkLiBDYW4gYmUgYW4gZXh0ZXJuYWwgcHJvZ3JhbSBvciBhIHNoZWxsIGNvbW1hbmQuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0YXJnczoge1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5hcmdzJywgJ0FyZ3VtZW50cyBwYXNzZWQgdG8gdGhlIGNvbW1hbmQgd2hlbiB0aGlzIHRhc2sgaXMgaW52b2tlZC4nKSxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9vcHRpb25zJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHR0YXNrRGVzY3JpcHRpb246IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cmVxdWlyZWQ6IFsndGFza05hbWUnXSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0dGFza05hbWU6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnRhc2tOYW1lJywgXCJUaGUgdGFzaydzIG5hbWVcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuY29tbWFuZCcsICdUaGUgY29tbWFuZCB0byBiZSBleGVjdXRlZC4gQ2FuIGJlIGFuIGV4dGVybmFsIHByb2dyYW0gb3IgYSBzaGVsbCBjb21tYW5kLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFyZ3M6IHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuYXJncycsICdBcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBjb21tYW5kIHdoZW4gdGhpcyB0YXNrIGlzIGludm9rZWQuJyksXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvb3B0aW9ucydcblx0XHRcdFx0fSxcblx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2NvbW1hbmRDb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy53aW5kb3dzJywgJ1dpbmRvd3Mgc3BlY2lmaWMgY29tbWFuZCBjb25maWd1cmF0aW9uJyksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0cHJvYmxlbU1hdGNoZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Byb2JsZW1NYXRjaGVyVHlwZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLm1hdGNoZXJzJywgJ1RoZSBwcm9ibGVtIG1hdGNoZXIocykgdG8gdXNlLiBDYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgcHJvYmxlbSBtYXRjaGVyIGRlZmluaXRpb24gb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncyBhbmQgcHJvYmxlbSBtYXRjaGVycy4nKVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3N4OiB7XG5cdFx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvY29tbWFuZENvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLm1hYycsICdNYWMgc3BlY2lmaWMgY29tbWFuZCBjb25maWd1cmF0aW9uJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRwcm9ibGVtTWF0Y2hlcjoge1xuXHRcdFx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcHJvYmxlbU1hdGNoZXJUeXBlJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MubWF0Y2hlcnMnLCAnVGhlIHByb2JsZW0gbWF0Y2hlcihzKSB0byB1c2UuIENhbiBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBwcm9ibGVtIG1hdGNoZXIgZGVmaW5pdGlvbiBvciBhbiBhcnJheSBvZiBzdHJpbmdzIGFuZCBwcm9ibGVtIG1hdGNoZXJzLicpXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRsaW51eDoge1xuXHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2NvbW1hbmRDb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5saW51eCcsICdMaW51eCBzcGVjaWZpYyBjb21tYW5kIGNvbmZpZ3VyYXRpb24nKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9wcm9ibGVtTWF0Y2hlclR5cGUnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5tYXRjaGVycycsICdUaGUgcHJvYmxlbSBtYXRjaGVyKHMpIHRvIHVzZS4gQ2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBhIHByb2JsZW0gbWF0Y2hlciBkZWZpbml0aW9uIG9yIGFuIGFycmF5IG9mIHN0cmluZ3MgYW5kIHByb2JsZW0gbWF0Y2hlcnMuJylcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN1cHByZXNzVGFza05hbWU6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5zdXBwcmVzc1Rhc2tOYW1lJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHRhc2sgbmFtZSBpcyBhZGRlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgY29tbWFuZC4gSWYgb21pdHRlZCB0aGUgZ2xvYmFsbHkgZGVmaW5lZCB2YWx1ZSBpcyB1c2VkLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0c2hvd091dHB1dDoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Nob3dPdXRwdXRUeXBlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnNob3dPdXRwdXQnLCAnQ29udHJvbHMgd2hldGhlciB0aGUgb3V0cHV0IG9mIHRoZSBydW5uaW5nIHRhc2sgaXMgc2hvd24gb3Igbm90LiBJZiBvbWl0dGVkIHRoZSBnbG9iYWxseSBkZWZpbmVkIHZhbHVlIGlzIHVzZWQuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0ZWNob0NvbW1hbmQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5lY2hvQ29tbWFuZCcsICdDb250cm9scyB3aGV0aGVyIHRoZSBleGVjdXRlZCBjb21tYW5kIGlzIGVjaG9lZCB0byB0aGUgb3V0cHV0LiBEZWZhdWx0IGlzIGZhbHNlLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNXYXRjaGluZzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy53YXRjaGluZy5kZXByZWNhdGlvbicsICdEZXByZWNhdGVkLiBVc2UgaXNCYWNrZ3JvdW5kIGluc3RlYWQuJyksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy53YXRjaGluZycsICdXaGV0aGVyIHRoZSBleGVjdXRlZCB0YXNrIGlzIGtlcHQgYWxpdmUgYW5kIGlzIHdhdGNoaW5nIHRoZSBmaWxlIHN5c3RlbS4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlzQmFja2dyb3VuZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmJhY2tncm91bmQnLCAnV2hldGhlciB0aGUgZXhlY3V0ZWQgdGFzayBpcyBrZXB0IGFsaXZlIGFuZCBpcyBydW5uaW5nIGluIHRoZSBiYWNrZ3JvdW5kLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJvbXB0T25DbG9zZToge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByb21wdE9uQ2xvc2UnLCAnV2hldGhlciB0aGUgdXNlciBpcyBwcm9tcHRlZCB3aGVuIFZTIENvZGUgY2xvc2VzIHdpdGggYSBydW5uaW5nIHRhc2suJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNCdWlsZENvbW1hbmQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5idWlsZCcsICdNYXBzIHRoaXMgdGFzayB0byBDb2RlXFwncyBkZWZhdWx0IGJ1aWxkIGNvbW1hbmQuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpc1Rlc3RDb21tYW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MudGVzdCcsICdNYXBzIHRoaXMgdGFzayB0byBDb2RlXFwncyBkZWZhdWx0IHRlc3QgY29tbWFuZC4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcHJvYmxlbU1hdGNoZXJUeXBlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLm1hdGNoZXJzJywgJ1RoZSBwcm9ibGVtIG1hdGNoZXIocykgdG8gdXNlLiBDYW4gZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgcHJvYmxlbSBtYXRjaGVyIGRlZmluaXRpb24gb3IgYW4gYXJyYXkgb2Ygc3RyaW5ncyBhbmQgcHJvYmxlbSBtYXRjaGVycy4nKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHR0YXNrUnVubmVyQ29uZmlndXJhdGlvbjoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRyZXF1aXJlZDogW10sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmNvbW1hbmQnLCAnVGhlIGNvbW1hbmQgdG8gYmUgZXhlY3V0ZWQuIENhbiBiZSBhbiBleHRlcm5hbCBwcm9ncmFtIG9yIGEgc2hlbGwgY29tbWFuZC4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhcmdzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmFyZ3MnLCAnQWRkaXRpb25hbCBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBjb21tYW5kLicpLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL29wdGlvbnMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNob3dPdXRwdXQ6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9zaG93T3V0cHV0VHlwZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5zaG93T3V0cHV0JywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIG91dHB1dCBvZiB0aGUgcnVubmluZyB0YXNrIGlzIHNob3duIG9yIG5vdC4gSWYgb21pdHRlZCBcXCdhbHdheXNcXCcgaXMgdXNlZC4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpc1dhdGNoaW5nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLndhdGNoaW5nLmRlcHJlY2F0aW9uJywgJ0RlcHJlY2F0ZWQuIFVzZSBpc0JhY2tncm91bmQgaW5zdGVhZC4nKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLndhdGNoaW5nJywgJ1doZXRoZXIgdGhlIGV4ZWN1dGVkIHRhc2sgaXMga2VwdCBhbGl2ZSBhbmQgaXMgd2F0Y2hpbmcgdGhlIGZpbGUgc3lzdGVtLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNCYWNrZ3JvdW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuYmFja2dyb3VuZCcsICdXaGV0aGVyIHRoZSBleGVjdXRlZCB0YXNrIGlzIGtlcHQgYWxpdmUgYW5kIGlzIHJ1bm5pbmcgaW4gdGhlIGJhY2tncm91bmQuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRwcm9tcHRPbkNsb3NlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEucHJvbXB0T25DbG9zZScsICdXaGV0aGVyIHRoZSB1c2VyIGlzIHByb21wdGVkIHdoZW4gVlMgQ29kZSBjbG9zZXMgd2l0aCBhIHJ1bm5pbmcgYmFja2dyb3VuZCB0YXNrLicpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVjaG9Db21tYW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuZWNob0NvbW1hbmQnLCAnQ29udHJvbHMgd2hldGhlciB0aGUgZXhlY3V0ZWQgY29tbWFuZCBpcyBlY2hvZWQgdG8gdGhlIG91dHB1dC4gRGVmYXVsdCBpcyBmYWxzZS4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN1cHByZXNzVGFza05hbWU6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5zdXBwcmVzc1Rhc2tOYW1lJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHRhc2sgbmFtZSBpcyBhZGRlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgY29tbWFuZC4gRGVmYXVsdCBpcyBmYWxzZS4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRhc2tTZWxlY3Rvcjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza1NlbGVjdG9yJywgJ1ByZWZpeCB0byBpbmRpY2F0ZSB0aGF0IGFuIGFyZ3VtZW50IGlzIHRhc2suJylcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJvYmxlbU1hdGNoZXI6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9wcm9ibGVtTWF0Y2hlclR5cGUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEubWF0Y2hlcnMnLCAnVGhlIHByb2JsZW0gbWF0Y2hlcihzKSB0byB1c2UuIENhbiBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBwcm9ibGVtIG1hdGNoZXIgZGVmaW5pdGlvbiBvciBhbiBhcnJheSBvZiBzdHJpbmdzIGFuZCBwcm9ibGVtIG1hdGNoZXJzLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRhc2tzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzJywgJ1RoZSB0YXNrIGNvbmZpZ3VyYXRpb25zLiBVc3VhbGx5IHRoZXNlIGFyZSBlbnJpY2htZW50cyBvZiB0YXNrIGFscmVhZHkgZGVmaW5lZCBpbiB0aGUgZXh0ZXJuYWwgdGFzayBydW5uZXIuJyksXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvdGFza0Rlc2NyaXB0aW9uJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufTtcblxuZXhwb3J0IGRlZmF1bHQgc2NoZW1hO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFB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
