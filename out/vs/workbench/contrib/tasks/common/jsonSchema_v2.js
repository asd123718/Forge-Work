import * as nls from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import commonSchema from "./jsonSchemaCommon.js";
import { ProblemMatcherRegistry } from "./problemMatcher.js";
import { TaskDefinitionRegistry } from "./taskDefinitionRegistry.js";
import * as ConfigurationResolverUtils from "../../../services/configurationResolver/common/configurationResolverUtils.js";
import { inputsSchema } from "../../../services/configurationResolver/common/configurationResolverSchema.js";
import { getAllCodicons } from "../../../../base/common/codicons.js";
function fixReferences(literal) {
  if (Array.isArray(literal)) {
    literal.forEach((element) => {
      if (typeof element === "object" && element !== null) {
        fixReferences(element);
      }
    });
  } else if (typeof literal === "object") {
    if (literal["$ref"]) {
      literal["$ref"] = literal["$ref"] + "2";
    }
    Object.getOwnPropertyNames(literal).forEach((property) => {
      const value = literal[property];
      if (Array.isArray(value) || typeof value === "object" && value !== null) {
        fixReferences(value);
      }
    });
  }
}
const shellCommand = {
  anyOf: [
    {
      type: "boolean",
      default: true,
      description: nls.localize("JsonSchema.shell", "Specifies whether the command is a shell command or an external program. Defaults to false if omitted.")
    },
    {
      $ref: "#/definitions/shellConfiguration"
    }
  ],
  deprecationMessage: nls.localize("JsonSchema.tasks.isShellCommand.deprecated", "The property isShellCommand is deprecated. Use the type property of the task and the shell property in the options instead. See also the 1.14 release notes.")
};
const hide = {
  type: "boolean",
  description: nls.localize("JsonSchema.hide", "Hide this task from the run task quick pick"),
  default: true
};
const inAgents = {
  type: "boolean",
  description: nls.localize("JsonSchema.inAgents", "Show this task in the Agents run action dropdown"),
  default: false
};
const taskIdentifier = {
  type: "object",
  additionalProperties: true,
  properties: {
    type: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.dependsOn.identifier", "The task identifier.")
    }
  }
};
const dependsOn = {
  anyOf: [
    {
      type: "string",
      description: nls.localize("JsonSchema.tasks.dependsOn.string", "Another task this task depends on.")
    },
    taskIdentifier,
    {
      type: "array",
      description: nls.localize("JsonSchema.tasks.dependsOn.array", "The other tasks this task depends on."),
      items: {
        anyOf: [
          {
            type: "string"
          },
          taskIdentifier
        ]
      }
    }
  ],
  description: nls.localize("JsonSchema.tasks.dependsOn", "Either a string representing another task or an array of other tasks that this task depends on.")
};
const dependsOrder = {
  type: "string",
  enum: ["parallel", "sequence"],
  enumDescriptions: [
    nls.localize("JsonSchema.tasks.dependsOrder.parallel", "Run all dependsOn tasks in parallel."),
    nls.localize("JsonSchema.tasks.dependsOrder.sequence", "Run all dependsOn tasks in sequence.")
  ],
  default: "parallel",
  description: nls.localize("JsonSchema.tasks.dependsOrder", "Determines the order of the dependsOn tasks for this task. Note that this property is not recursive.")
};
const detail = {
  type: "string",
  description: nls.localize("JsonSchema.tasks.detail", "An optional description of a task that shows in the Run Task quick pick as a detail.")
};
const icon = {
  type: "object",
  description: nls.localize("JsonSchema.tasks.icon", "An optional icon for the task"),
  properties: {
    id: {
      description: nls.localize("JsonSchema.tasks.icon.id", "An optional codicon ID to use"),
      type: ["string", "null"],
      enum: Array.from(getAllCodicons(), (icon2) => icon2.id),
      markdownEnumDescriptions: Array.from(getAllCodicons(), (icon2) => `$(${icon2.id})`)
    },
    color: {
      description: nls.localize("JsonSchema.tasks.icon.color", "An optional color of the icon"),
      type: ["string", "null"],
      enum: [
        "terminal.ansiBlack",
        "terminal.ansiRed",
        "terminal.ansiGreen",
        "terminal.ansiYellow",
        "terminal.ansiBlue",
        "terminal.ansiMagenta",
        "terminal.ansiCyan",
        "terminal.ansiWhite"
      ]
    }
  }
};
const presentation = {
  type: "object",
  default: {
    echo: true,
    reveal: "always",
    focus: false,
    panel: "shared",
    showReuseMessage: true,
    clear: false
  },
  description: nls.localize("JsonSchema.tasks.presentation", "Configures the panel that is used to present the task's output and reads its input."),
  additionalProperties: false,
  properties: {
    echo: {
      type: "boolean",
      default: true,
      description: nls.localize("JsonSchema.tasks.presentation.echo", "Controls whether the executed command is echoed to the panel. Default is true.")
    },
    focus: {
      type: "boolean",
      default: false,
      description: nls.localize("JsonSchema.tasks.presentation.focus", "Controls whether the panel takes focus. Default is false. If set to true the panel is revealed as well.")
    },
    revealProblems: {
      type: "string",
      enum: ["always", "onProblem", "never"],
      enumDescriptions: [
        nls.localize("JsonSchema.tasks.presentation.revealProblems.always", "Always reveals the problems panel when this task is executed."),
        nls.localize("JsonSchema.tasks.presentation.revealProblems.onProblem", "Only reveals the problems panel if a problem is found."),
        nls.localize("JsonSchema.tasks.presentation.revealProblems.never", "Never reveals the problems panel when this task is executed.")
      ],
      default: "never",
      description: nls.localize("JsonSchema.tasks.presentation.revealProblems", 'Controls whether the problems panel is revealed when running this task or not. Takes precedence over option "reveal". Default is "never".')
    },
    reveal: {
      type: "string",
      enum: ["always", "silent", "never"],
      enumDescriptions: [
        nls.localize("JsonSchema.tasks.presentation.reveal.always", "Always reveals the terminal when this task is executed."),
        nls.localize("JsonSchema.tasks.presentation.reveal.silent", "Only reveals the terminal if the task exits with an error or the problem matcher finds an error."),
        nls.localize("JsonSchema.tasks.presentation.reveal.never", "Never reveals the terminal when this task is executed.")
      ],
      default: "always",
      description: nls.localize("JsonSchema.tasks.presentation.reveal", 'Controls whether the terminal running the task is revealed or not. May be overridden by option "revealProblems". Default is "always".')
    },
    panel: {
      type: "string",
      enum: ["shared", "dedicated", "new"],
      default: "shared",
      description: nls.localize("JsonSchema.tasks.presentation.instance", "Controls if the panel is shared between tasks, dedicated to this task or a new one is created on every run.")
    },
    showReuseMessage: {
      type: "boolean",
      default: true,
      description: nls.localize("JsonSchema.tasks.presentation.showReuseMessage", "Controls whether to show the `Terminal will be reused by tasks, press any key to close it` message.")
    },
    clear: {
      type: "boolean",
      default: false,
      description: nls.localize("JsonSchema.tasks.presentation.clear", "Controls whether the terminal is cleared before executing the task.")
    },
    group: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.presentation.group", "Controls whether the task is executed in a specific terminal group using split panes.")
    },
    close: {
      type: "boolean",
      description: nls.localize("JsonSchema.tasks.presentation.close", "Controls whether the terminal the task runs in is closed when the task exits.")
    },
    preserveTerminalName: {
      type: "boolean",
      default: false,
      description: nls.localize("JsonSchema.tasks.presentation.preserveTerminalName", "Controls whether to preserve the task name in the terminal after task completion.")
    }
  }
};
const terminal = Objects.deepClone(presentation);
terminal.deprecationMessage = nls.localize("JsonSchema.tasks.terminal", "The terminal property is deprecated. Use presentation instead");
const groupStrings = {
  type: "string",
  enum: [
    "build",
    "test",
    "none"
  ],
  enumDescriptions: [
    nls.localize("JsonSchema.tasks.group.build", "Marks the task as a build task accessible through the 'Run Build Task' command."),
    nls.localize("JsonSchema.tasks.group.test", "Marks the task as a test task accessible through the 'Run Test Task' command."),
    nls.localize("JsonSchema.tasks.group.none", "Assigns the task to no group")
  ],
  description: nls.localize("JsonSchema.tasks.group.kind", "The task's execution group.")
};
const group = {
  oneOf: [
    groupStrings,
    {
      type: "object",
      properties: {
        kind: groupStrings,
        isDefault: {
          type: ["boolean", "string"],
          default: false,
          description: nls.localize("JsonSchema.tasks.group.isDefault", "Defines if this task is the default task in the group, or a glob to match the file which should trigger this task.")
        }
      }
    }
  ],
  defaultSnippets: [
    {
      body: { kind: "build", isDefault: true },
      description: nls.localize("JsonSchema.tasks.group.defaultBuild", "Marks the task as the default build task.")
    },
    {
      body: { kind: "test", isDefault: true },
      description: nls.localize("JsonSchema.tasks.group.defaultTest", "Marks the task as the default test task.")
    }
  ],
  description: nls.localize("JsonSchema.tasks.group", 'Defines to which execution group this task belongs to. It supports "build" to add it to the build group and "test" to add it to the test group.')
};
const taskType = {
  type: "string",
  enum: ["shell"],
  default: "process",
  description: nls.localize("JsonSchema.tasks.type", "Defines whether the task is run as a process or as a command inside a shell.")
};
const command = {
  oneOf: [
    {
      oneOf: [
        {
          type: "string"
        },
        {
          type: "array",
          items: {
            type: "string"
          },
          description: nls.localize("JsonSchema.commandArray", "The shell command to be executed. Array items will be joined using a space character")
        }
      ]
    },
    {
      type: "object",
      required: ["value", "quoting"],
      properties: {
        value: {
          oneOf: [
            {
              type: "string"
            },
            {
              type: "array",
              items: {
                type: "string"
              },
              description: nls.localize("JsonSchema.commandArray", "The shell command to be executed. Array items will be joined using a space character")
            }
          ],
          description: nls.localize("JsonSchema.command.quotedString.value", "The actual command value")
        },
        quoting: {
          type: "string",
          enum: ["escape", "strong", "weak"],
          enumDescriptions: [
            nls.localize("JsonSchema.tasks.quoting.escape", "Escapes characters using the shell's escape character (e.g. ` under PowerShell and \\ under bash)."),
            nls.localize("JsonSchema.tasks.quoting.strong", "Quotes the argument using the shell's strong quote character (e.g. ' under PowerShell and bash)."),
            nls.localize("JsonSchema.tasks.quoting.weak", `Quotes the argument using the shell's weak quote character (e.g. " under PowerShell and bash).`)
          ],
          default: "strong",
          description: nls.localize("JsonSchema.command.quotesString.quote", "How the command value should be quoted.")
        }
      }
    }
  ],
  description: nls.localize("JsonSchema.command", "The command to be executed. Can be an external program or a shell command.")
};
const args = {
  type: "array",
  items: {
    oneOf: [
      {
        type: "string"
      },
      {
        type: "object",
        required: ["value", "quoting"],
        properties: {
          value: {
            type: "string",
            description: nls.localize("JsonSchema.args.quotedString.value", "The actual argument value")
          },
          quoting: {
            type: "string",
            enum: ["escape", "strong", "weak"],
            enumDescriptions: [
              nls.localize("JsonSchema.tasks.quoting.escape", "Escapes characters using the shell's escape character (e.g. ` under PowerShell and \\ under bash)."),
              nls.localize("JsonSchema.tasks.quoting.strong", "Quotes the argument using the shell's strong quote character (e.g. ' under PowerShell and bash)."),
              nls.localize("JsonSchema.tasks.quoting.weak", `Quotes the argument using the shell's weak quote character (e.g. " under PowerShell and bash).`)
            ],
            default: "strong",
            description: nls.localize("JsonSchema.args.quotesString.quote", "How the argument value should be quoted.")
          }
        }
      }
    ]
  },
  description: nls.localize("JsonSchema.tasks.args", "Arguments passed to the command when this task is invoked.")
};
const label = {
  type: "string",
  description: nls.localize("JsonSchema.tasks.label", "The task's user interface label")
};
const version = {
  type: "string",
  enum: ["2.0.0"],
  description: nls.localize("JsonSchema.version", "The config's version number.")
};
const identifier = {
  type: "string",
  description: nls.localize("JsonSchema.tasks.identifier", "A user defined identifier to reference the task in launch.json or a dependsOn clause."),
  deprecationMessage: nls.localize("JsonSchema.tasks.identifier.deprecated", "User defined identifiers are deprecated. For custom task use the name as a reference and for tasks provided by extensions use their defined task identifier.")
};
const runOptions = {
  type: "object",
  additionalProperties: false,
  properties: {
    reevaluateOnRerun: {
      type: "boolean",
      description: nls.localize("JsonSchema.tasks.reevaluateOnRerun", "Whether to reevaluate task variables on rerun."),
      default: true
    },
    runOn: {
      type: "string",
      enum: ["default", "folderOpen", "worktreeCreated"],
      description: nls.localize("JsonSchema.tasks.runOn", "Configures when the task should be run. If set to folderOpen, then the task will be run automatically when the folder is opened. If set to worktreeCreated, then the task will be run automatically when an Agent Session worktree is created."),
      default: "default"
    },
    instanceLimit: {
      type: "number",
      description: nls.localize("JsonSchema.tasks.instanceLimit", "The number of instances of the task that are allowed to run simultaneously."),
      default: 1
    },
    instancePolicy: {
      type: "string",
      enum: ["terminateNewest", "terminateOldest", "prompt", "warn", "silent"],
      enumDescriptions: [
        nls.localize("JsonSchema.tasks.instancePolicy.terminateNewest", "Terminates the newest instance."),
        nls.localize("JsonSchema.tasks.instancePolicy.terminateOldest", "Terminates the oldest instance."),
        nls.localize("JsonSchema.tasks.instancePolicy.prompt", "Asks which instance to terminate."),
        nls.localize("JsonSchema.tasks.instancePolicy.warn", "Does nothing but warns that the instance limit has been reached."),
        nls.localize("JsonSchema.tasks.instancePolicy.silent", "Does nothing.")
      ],
      description: nls.localize("JsonSchema.tasks.instancePolicy", "Policy to apply when instance limit is reached."),
      default: "prompt"
    }
  },
  description: nls.localize("JsonSchema.tasks.runOptions", "The task's run related options")
};
const commonSchemaDefinitions = commonSchema.definitions;
const options = Objects.deepClone(commonSchemaDefinitions.options);
const optionsProperties = options.properties;
optionsProperties.shell = Objects.deepClone(commonSchemaDefinitions.shellConfiguration);
const taskConfiguration = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.taskLabel", "The task's label")
    },
    taskName: {
      type: "string",
      description: nls.localize("JsonSchema.tasks.taskName", "The task's name"),
      deprecationMessage: nls.localize("JsonSchema.tasks.taskName.deprecated", "The task's name property is deprecated. Use the label property instead.")
    },
    identifier: Objects.deepClone(identifier),
    group: Objects.deepClone(group),
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
    presentation: Objects.deepClone(presentation),
    icon: Objects.deepClone(icon),
    hide: Objects.deepClone(hide),
    inAgents: Objects.deepClone(inAgents),
    options,
    problemMatcher: {
      $ref: "#/definitions/problemMatcherType",
      description: nls.localize("JsonSchema.tasks.matchers", "The problem matcher(s) to use. Can either be a string or a problem matcher definition or an array of strings and problem matchers.")
    },
    runOptions: Objects.deepClone(runOptions),
    dependsOn: Objects.deepClone(dependsOn),
    dependsOrder: Objects.deepClone(dependsOrder),
    detail: Objects.deepClone(detail)
  }
};
const taskDefinitions = [];
TaskDefinitionRegistry.onReady().then(() => {
  updateTaskDefinitions();
});
function updateTaskDefinitions() {
  for (const taskType2 of TaskDefinitionRegistry.all()) {
    if (taskDefinitions.find((schema3) => {
      return schema3.properties?.type?.enum?.find ? schema3.properties?.type.enum.find((element) => element === taskType2.taskType) : void 0;
    })) {
      continue;
    }
    const schema2 = Objects.deepClone(taskConfiguration);
    const schemaProperties = schema2.properties;
    schemaProperties.type = {
      type: "string",
      description: nls.localize("JsonSchema.customizations.customizes.type", "The task type to customize"),
      enum: [taskType2.taskType]
    };
    if (taskType2.required) {
      schema2.required = taskType2.required.slice();
    } else {
      schema2.required = [];
    }
    schema2.required.push("type");
    if (taskType2.properties) {
      for (const key of Object.keys(taskType2.properties)) {
        const property = taskType2.properties[key];
        schemaProperties[key] = Objects.deepClone(property);
      }
    }
    fixReferences(schema2);
    taskDefinitions.push(schema2);
  }
}
const customize = Objects.deepClone(taskConfiguration);
customize.properties.customize = {
  type: "string",
  deprecationMessage: nls.localize("JsonSchema.tasks.customize.deprecated", "The customize property is deprecated. See the 1.14 release notes on how to migrate to the new task customization approach")
};
if (!customize.required) {
  customize.required = [];
}
customize.required.push("customize");
taskDefinitions.push(customize);
const definitions = Objects.deepClone(commonSchemaDefinitions);
const taskDescription = definitions.taskDescription;
taskDescription.required = ["label"];
const taskDescriptionProperties = taskDescription.properties;
taskDescriptionProperties.label = Objects.deepClone(label);
taskDescriptionProperties.command = Objects.deepClone(command);
taskDescriptionProperties.args = Objects.deepClone(args);
taskDescriptionProperties.isShellCommand = Objects.deepClone(shellCommand);
taskDescriptionProperties.dependsOn = dependsOn;
taskDescriptionProperties.hide = Objects.deepClone(hide);
taskDescriptionProperties.inAgents = Objects.deepClone(inAgents);
taskDescriptionProperties.dependsOrder = dependsOrder;
taskDescriptionProperties.identifier = Objects.deepClone(identifier);
taskDescriptionProperties.type = Objects.deepClone(taskType);
taskDescriptionProperties.presentation = Objects.deepClone(presentation);
taskDescriptionProperties.terminal = terminal;
taskDescriptionProperties.icon = Objects.deepClone(icon);
taskDescriptionProperties.group = Objects.deepClone(group);
taskDescriptionProperties.runOptions = Objects.deepClone(runOptions);
taskDescriptionProperties.detail = detail;
taskDescriptionProperties.taskName.deprecationMessage = nls.localize(
  "JsonSchema.tasks.taskName.deprecated",
  "The task's name property is deprecated. Use the label property instead."
);
const processTask = Objects.deepClone(taskDescription);
taskDescription.default = {
  label: "My Task",
  type: "shell",
  command: "echo Hello",
  problemMatcher: []
};
definitions.showOutputType.deprecationMessage = nls.localize(
  "JsonSchema.tasks.showOutput.deprecated",
  "The property showOutput is deprecated. Use the reveal property inside the presentation property instead. See also the 1.14 release notes."
);
taskDescriptionProperties.echoCommand.deprecationMessage = nls.localize(
  "JsonSchema.tasks.echoCommand.deprecated",
  "The property echoCommand is deprecated. Use the echo property inside the presentation property instead. See also the 1.14 release notes."
);
taskDescriptionProperties.suppressTaskName.deprecationMessage = nls.localize(
  "JsonSchema.tasks.suppressTaskName.deprecated",
  "The property suppressTaskName is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes."
);
taskDescriptionProperties.isBuildCommand.deprecationMessage = nls.localize(
  "JsonSchema.tasks.isBuildCommand.deprecated",
  "The property isBuildCommand is deprecated. Use the group property instead. See also the 1.14 release notes."
);
taskDescriptionProperties.isTestCommand.deprecationMessage = nls.localize(
  "JsonSchema.tasks.isTestCommand.deprecated",
  "The property isTestCommand is deprecated. Use the group property instead. See also the 1.14 release notes."
);
processTask.properties.type = {
  type: "string",
  enum: ["process"],
  default: "process",
  description: nls.localize("JsonSchema.tasks.type", "Defines whether the task is run as a process or as a command inside a shell.")
};
processTask.required.push("command");
processTask.required.push("type");
taskDefinitions.push(processTask);
taskDefinitions.push({
  $ref: "#/definitions/taskDescription"
});
const definitionsTaskRunnerConfigurationProperties = definitions.taskRunnerConfiguration.properties;
const tasks = definitionsTaskRunnerConfigurationProperties.tasks;
tasks.items = {
  oneOf: taskDefinitions
};
definitionsTaskRunnerConfigurationProperties.inputs = inputsSchema.definitions.inputs;
definitions.commandConfiguration.properties.isShellCommand = Objects.deepClone(shellCommand);
definitions.commandConfiguration.properties.args = Objects.deepClone(args);
definitions.options.properties.shell = {
  $ref: "#/definitions/shellConfiguration"
};
definitionsTaskRunnerConfigurationProperties.isShellCommand = Objects.deepClone(shellCommand);
definitionsTaskRunnerConfigurationProperties.type = Objects.deepClone(taskType);
definitionsTaskRunnerConfigurationProperties.group = Objects.deepClone(group);
definitionsTaskRunnerConfigurationProperties.presentation = Objects.deepClone(presentation);
definitionsTaskRunnerConfigurationProperties.suppressTaskName.deprecationMessage = nls.localize(
  "JsonSchema.tasks.suppressTaskName.deprecated",
  "The property suppressTaskName is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes."
);
definitionsTaskRunnerConfigurationProperties.taskSelector.deprecationMessage = nls.localize(
  "JsonSchema.tasks.taskSelector.deprecated",
  "The property taskSelector is deprecated. Inline the command with its arguments into the task instead. See also the 1.14 release notes."
);
const osSpecificTaskRunnerConfiguration = Objects.deepClone(definitions.taskRunnerConfiguration);
delete osSpecificTaskRunnerConfiguration.properties.tasks;
osSpecificTaskRunnerConfiguration.additionalProperties = false;
definitions.osSpecificTaskRunnerConfiguration = osSpecificTaskRunnerConfiguration;
definitionsTaskRunnerConfigurationProperties.version = Objects.deepClone(version);
const schema = {
  oneOf: [
    {
      "allOf": [
        {
          type: "object",
          required: ["version"],
          properties: {
            version: Objects.deepClone(version),
            windows: {
              "$ref": "#/definitions/osSpecificTaskRunnerConfiguration",
              "description": nls.localize("JsonSchema.windows", "Windows specific command configuration")
            },
            osx: {
              "$ref": "#/definitions/osSpecificTaskRunnerConfiguration",
              "description": nls.localize("JsonSchema.mac", "Mac specific command configuration")
            },
            linux: {
              "$ref": "#/definitions/osSpecificTaskRunnerConfiguration",
              "description": nls.localize("JsonSchema.linux", "Linux specific command configuration")
            }
          }
        },
        {
          $ref: "#/definitions/taskRunnerConfiguration"
        }
      ]
    }
  ]
};
schema.definitions = definitions;
function deprecatedVariableMessage(schemaMap, property) {
  const mapAtProperty = schemaMap[property].properties;
  if (mapAtProperty) {
    Object.keys(mapAtProperty).forEach((name) => {
      deprecatedVariableMessage(mapAtProperty, name);
    });
  } else {
    ConfigurationResolverUtils.applyDeprecatedVariableMessage(schemaMap[property]);
  }
}
Object.getOwnPropertyNames(definitions).forEach((key) => {
  const newKey = key + "2";
  definitions[newKey] = definitions[key];
  delete definitions[key];
  deprecatedVariableMessage(definitions, newKey);
});
fixReferences(schema);
function updateProblemMatchers() {
  try {
    const matcherIds = ProblemMatcherRegistry.keys().map((key) => "$" + key);
    definitions.problemMatcherType2.oneOf[0].enum = matcherIds;
    definitions.problemMatcherType2.oneOf[2].items.anyOf[0].enum = matcherIds;
  } catch (err) {
    console.log("Installing problem matcher ids failed");
  }
}
ProblemMatcherRegistry.onReady().then(() => {
  updateProblemMatchers();
});
var jsonSchema_v2_default = schema;
export {
  jsonSchema_v2_default as default,
  updateProblemMatchers,
  updateTaskDefinitions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXGpzb25TY2hlbWFfdjIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIE9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSwgSUpTT05TY2hlbWFNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcblxuaW1wb3J0IGNvbW1vblNjaGVtYSBmcm9tICcuL2pzb25TY2hlbWFDb21tb24uanMnO1xuXG5pbXBvcnQgeyBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5IH0gZnJvbSAnLi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5pbXBvcnQgeyBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi90YXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCAqIGFzIENvbmZpZ3VyYXRpb25SZXNvbHZlclV0aWxzIGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyVXRpbHMuanMnO1xuaW1wb3J0IHsgaW5wdXRzU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXJTY2hlbWEuanMnO1xuaW1wb3J0IHsgZ2V0QWxsQ29kaWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5cbmZ1bmN0aW9uIGZpeFJlZmVyZW5jZXMobGl0ZXJhbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmtub3duW10pIHtcblx0aWYgKEFycmF5LmlzQXJyYXkobGl0ZXJhbCkpIHtcblx0XHRsaXRlcmFsLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdvYmplY3QnICYmIGVsZW1lbnQgIT09IG51bGwpIHtcblx0XHRcdFx0Zml4UmVmZXJlbmNlcyhlbGVtZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSBlbHNlIGlmICh0eXBlb2YgbGl0ZXJhbCA9PT0gJ29iamVjdCcpIHtcblx0XHRpZiAobGl0ZXJhbFsnJHJlZiddKSB7XG5cdFx0XHRsaXRlcmFsWyckcmVmJ10gPSBsaXRlcmFsWyckcmVmJ10gKyAnMic7XG5cdFx0fVxuXHRcdE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGxpdGVyYWwpLmZvckVhY2gocHJvcGVydHkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBsaXRlcmFsW3Byb3BlcnR5XTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSB8fCAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZSAhPT0gbnVsbCkpIHtcblx0XHRcdFx0Zml4UmVmZXJlbmNlcyh2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY29uc3Qgc2hlbGxDb21tYW5kOiBJSlNPTlNjaGVtYSA9IHtcblx0YW55T2Y6IFtcblx0XHR7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5zaGVsbCcsICdTcGVjaWZpZXMgd2hldGhlciB0aGUgY29tbWFuZCBpcyBhIHNoZWxsIGNvbW1hbmQgb3IgYW4gZXh0ZXJuYWwgcHJvZ3JhbS4gRGVmYXVsdHMgdG8gZmFsc2UgaWYgb21pdHRlZC4nKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc2hlbGxDb25maWd1cmF0aW9uJ1xuXHRcdH1cblx0XSxcblx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaXNTaGVsbENvbW1hbmQuZGVwcmVjYXRlZCcsICdUaGUgcHJvcGVydHkgaXNTaGVsbENvbW1hbmQgaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSB0eXBlIHByb3BlcnR5IG9mIHRoZSB0YXNrIGFuZCB0aGUgc2hlbGwgcHJvcGVydHkgaW4gdGhlIG9wdGlvbnMgaW5zdGVhZC4gU2VlIGFsc28gdGhlIDEuMTQgcmVsZWFzZSBub3Rlcy4nKVxufTtcblxuXG5jb25zdCBoaWRlOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmhpZGUnLCAnSGlkZSB0aGlzIHRhc2sgZnJvbSB0aGUgcnVuIHRhc2sgcXVpY2sgcGljaycpLFxuXHRkZWZhdWx0OiB0cnVlXG59O1xuXG5jb25zdCBpbkFnZW50czogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdib29sZWFuJyxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5pbkFnZW50cycsICdTaG93IHRoaXMgdGFzayBpbiB0aGUgQWdlbnRzIHJ1biBhY3Rpb24gZHJvcGRvd24nKSxcblx0ZGVmYXVsdDogZmFsc2Vcbn07XG5cbmNvbnN0IHRhc2tJZGVudGlmaWVyOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB0cnVlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0dHlwZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmRlcGVuZHNPbi5pZGVudGlmaWVyJywgJ1RoZSB0YXNrIGlkZW50aWZpZXIuJylcblx0XHR9XG5cdH1cbn07XG5cbmNvbnN0IGRlcGVuZHNPbjogSUpTT05TY2hlbWEgPSB7XG5cdGFueU9mOiBbXG5cdFx0e1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmRlcGVuZHNPbi5zdHJpbmcnLCAnQW5vdGhlciB0YXNrIHRoaXMgdGFzayBkZXBlbmRzIG9uLicpXG5cdFx0fSxcblx0XHR0YXNrSWRlbnRpZmllcixcblx0XHR7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5kZXBlbmRzT24uYXJyYXknLCAnVGhlIG90aGVyIHRhc2tzIHRoaXMgdGFzayBkZXBlbmRzIG9uLicpLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRhc2tJZGVudGlmaWVyXG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9XG5cdF0sXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZGVwZW5kc09uJywgJ0VpdGhlciBhIHN0cmluZyByZXByZXNlbnRpbmcgYW5vdGhlciB0YXNrIG9yIGFuIGFycmF5IG9mIG90aGVyIHRhc2tzIHRoYXQgdGhpcyB0YXNrIGRlcGVuZHMgb24uJylcbn07XG5cbmNvbnN0IGRlcGVuZHNPcmRlcjogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBbJ3BhcmFsbGVsJywgJ3NlcXVlbmNlJ10sXG5cdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZGVwZW5kc09yZGVyLnBhcmFsbGVsJywgJ1J1biBhbGwgZGVwZW5kc09uIHRhc2tzIGluIHBhcmFsbGVsLicpLFxuXHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5kZXBlbmRzT3JkZXIuc2VxdWVuY2UnLCAnUnVuIGFsbCBkZXBlbmRzT24gdGFza3MgaW4gc2VxdWVuY2UuJyksXG5cdF0sXG5cdGRlZmF1bHQ6ICdwYXJhbGxlbCcsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZGVwZW5kc09yZGVyJywgJ0RldGVybWluZXMgdGhlIG9yZGVyIG9mIHRoZSBkZXBlbmRzT24gdGFza3MgZm9yIHRoaXMgdGFzay4gTm90ZSB0aGF0IHRoaXMgcHJvcGVydHkgaXMgbm90IHJlY3Vyc2l2ZS4nKVxufTtcblxuY29uc3QgZGV0YWlsOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZGV0YWlsJywgJ0FuIG9wdGlvbmFsIGRlc2NyaXB0aW9uIG9mIGEgdGFzayB0aGF0IHNob3dzIGluIHRoZSBSdW4gVGFzayBxdWljayBwaWNrIGFzIGEgZGV0YWlsLicpXG59O1xuXG5jb25zdCBpY29uOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaWNvbicsICdBbiBvcHRpb25hbCBpY29uIGZvciB0aGUgdGFzaycpLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0aWQ6IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaWNvbi5pZCcsICdBbiBvcHRpb25hbCBjb2RpY29uIElEIHRvIHVzZScpLFxuXHRcdFx0dHlwZTogWydzdHJpbmcnLCAnbnVsbCddLFxuXHRcdFx0ZW51bTogQXJyYXkuZnJvbShnZXRBbGxDb2RpY29ucygpLCBpY29uID0+IGljb24uaWQpLFxuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBBcnJheS5mcm9tKGdldEFsbENvZGljb25zKCksIGljb24gPT4gYCQoJHtpY29uLmlkfSlgKSxcblx0XHR9LFxuXHRcdGNvbG9yOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmljb24uY29sb3InLCAnQW4gb3B0aW9uYWwgY29sb3Igb2YgdGhlIGljb24nKSxcblx0XHRcdHR5cGU6IFsnc3RyaW5nJywgJ251bGwnXSxcblx0XHRcdGVudW06IFtcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCbGFjaycsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpUmVkJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lHcmVlbicsXG5cdFx0XHRcdCd0ZXJtaW5hbC5hbnNpWWVsbG93Jyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lCbHVlJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lNYWdlbnRhJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lDeWFuJyxcblx0XHRcdFx0J3Rlcm1pbmFsLmFuc2lXaGl0ZSdcblx0XHRcdF0sXG5cdFx0fSxcblx0fVxufTtcblxuY29uc3QgcHJlc2VudGF0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGRlZmF1bHQ6IHtcblx0XHRlY2hvOiB0cnVlLFxuXHRcdHJldmVhbDogJ2Fsd2F5cycsXG5cdFx0Zm9jdXM6IGZhbHNlLFxuXHRcdHBhbmVsOiAnc2hhcmVkJyxcblx0XHRzaG93UmV1c2VNZXNzYWdlOiB0cnVlLFxuXHRcdGNsZWFyOiBmYWxzZSxcblx0fSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24nLCAnQ29uZmlndXJlcyB0aGUgcGFuZWwgdGhhdCBpcyB1c2VkIHRvIHByZXNlbnQgdGhlIHRhc2tcXCdzIG91dHB1dCBhbmQgcmVhZHMgaXRzIGlucHV0LicpLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRlY2hvOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24uZWNobycsICdDb250cm9scyB3aGV0aGVyIHRoZSBleGVjdXRlZCBjb21tYW5kIGlzIGVjaG9lZCB0byB0aGUgcGFuZWwuIERlZmF1bHQgaXMgdHJ1ZS4nKVxuXHRcdH0sXG5cdFx0Zm9jdXM6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24uZm9jdXMnLCAnQ29udHJvbHMgd2hldGhlciB0aGUgcGFuZWwgdGFrZXMgZm9jdXMuIERlZmF1bHQgaXMgZmFsc2UuIElmIHNldCB0byB0cnVlIHRoZSBwYW5lbCBpcyByZXZlYWxlZCBhcyB3ZWxsLicpXG5cdFx0fSxcblx0XHRyZXZlYWxQcm9ibGVtczoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdvblByb2JsZW0nLCAnbmV2ZXInXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5yZXZlYWxQcm9ibGVtcy5hbHdheXMnLCAnQWx3YXlzIHJldmVhbHMgdGhlIHByb2JsZW1zIHBhbmVsIHdoZW4gdGhpcyB0YXNrIGlzIGV4ZWN1dGVkLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLnJldmVhbFByb2JsZW1zLm9uUHJvYmxlbScsICdPbmx5IHJldmVhbHMgdGhlIHByb2JsZW1zIHBhbmVsIGlmIGEgcHJvYmxlbSBpcyBmb3VuZC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5yZXZlYWxQcm9ibGVtcy5uZXZlcicsICdOZXZlciByZXZlYWxzIHRoZSBwcm9ibGVtcyBwYW5lbCB3aGVuIHRoaXMgdGFzayBpcyBleGVjdXRlZC4nKSxcblx0XHRcdF0sXG5cdFx0XHRkZWZhdWx0OiAnbmV2ZXInLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24ucmV2ZWFsUHJvYmxlbXMnLCAnQ29udHJvbHMgd2hldGhlciB0aGUgcHJvYmxlbXMgcGFuZWwgaXMgcmV2ZWFsZWQgd2hlbiBydW5uaW5nIHRoaXMgdGFzayBvciBub3QuIFRha2VzIHByZWNlZGVuY2Ugb3ZlciBvcHRpb24gXFxcInJldmVhbFxcXCIuIERlZmF1bHQgaXMgXFxcIm5ldmVyXFxcIi4nKVxuXHRcdH0sXG5cdFx0cmV2ZWFsOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnYWx3YXlzJywgJ3NpbGVudCcsICduZXZlciddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLnJldmVhbC5hbHdheXMnLCAnQWx3YXlzIHJldmVhbHMgdGhlIHRlcm1pbmFsIHdoZW4gdGhpcyB0YXNrIGlzIGV4ZWN1dGVkLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJlc2VudGF0aW9uLnJldmVhbC5zaWxlbnQnLCAnT25seSByZXZlYWxzIHRoZSB0ZXJtaW5hbCBpZiB0aGUgdGFzayBleGl0cyB3aXRoIGFuIGVycm9yIG9yIHRoZSBwcm9ibGVtIG1hdGNoZXIgZmluZHMgYW4gZXJyb3IuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24ucmV2ZWFsLm5ldmVyJywgJ05ldmVyIHJldmVhbHMgdGhlIHRlcm1pbmFsIHdoZW4gdGhpcyB0YXNrIGlzIGV4ZWN1dGVkLicpLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdhbHdheXMnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24ucmV2ZWFsJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHJ1bm5pbmcgdGhlIHRhc2sgaXMgcmV2ZWFsZWQgb3Igbm90LiBNYXkgYmUgb3ZlcnJpZGRlbiBieSBvcHRpb24gXFxcInJldmVhbFByb2JsZW1zXFxcIi4gRGVmYXVsdCBpcyBcXFwiYWx3YXlzXFxcIi4nKVxuXHRcdH0sXG5cdFx0cGFuZWw6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydzaGFyZWQnLCAnZGVkaWNhdGVkJywgJ25ldyddLFxuXHRcdFx0ZGVmYXVsdDogJ3NoYXJlZCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5pbnN0YW5jZScsICdDb250cm9scyBpZiB0aGUgcGFuZWwgaXMgc2hhcmVkIGJldHdlZW4gdGFza3MsIGRlZGljYXRlZCB0byB0aGlzIHRhc2sgb3IgYSBuZXcgb25lIGlzIGNyZWF0ZWQgb24gZXZlcnkgcnVuLicpXG5cdFx0fSxcblx0XHRzaG93UmV1c2VNZXNzYWdlOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24uc2hvd1JldXNlTWVzc2FnZScsICdDb250cm9scyB3aGV0aGVyIHRvIHNob3cgdGhlIGBUZXJtaW5hbCB3aWxsIGJlIHJldXNlZCBieSB0YXNrcywgcHJlc3MgYW55IGtleSB0byBjbG9zZSBpdGAgbWVzc2FnZS4nKVxuXHRcdH0sXG5cdFx0Y2xlYXI6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5wcmVzZW50YXRpb24uY2xlYXInLCAnQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgaXMgY2xlYXJlZCBiZWZvcmUgZXhlY3V0aW5nIHRoZSB0YXNrLicpXG5cdFx0fSxcblx0XHRncm91cDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5ncm91cCcsICdDb250cm9scyB3aGV0aGVyIHRoZSB0YXNrIGlzIGV4ZWN1dGVkIGluIGEgc3BlY2lmaWMgdGVybWluYWwgZ3JvdXAgdXNpbmcgc3BsaXQgcGFuZXMuJylcblx0XHR9LFxuXHRcdGNsb3NlOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5jbG9zZScsICdDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCB0aGUgdGFzayBydW5zIGluIGlzIGNsb3NlZCB3aGVuIHRoZSB0YXNrIGV4aXRzLicpXG5cdFx0fSxcblx0XHRwcmVzZXJ2ZVRlcm1pbmFsTmFtZToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnByZXNlbnRhdGlvbi5wcmVzZXJ2ZVRlcm1pbmFsTmFtZScsICdDb250cm9scyB3aGV0aGVyIHRvIHByZXNlcnZlIHRoZSB0YXNrIG5hbWUgaW4gdGhlIHRlcm1pbmFsIGFmdGVyIHRhc2sgY29tcGxldGlvbi4nKVxuXHRcdH1cblx0fVxufTtcblxuY29uc3QgdGVybWluYWw6IElKU09OU2NoZW1hID0gT2JqZWN0cy5kZWVwQ2xvbmUocHJlc2VudGF0aW9uKTtcbnRlcm1pbmFsLmRlcHJlY2F0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy50ZXJtaW5hbCcsICdUaGUgdGVybWluYWwgcHJvcGVydHkgaXMgZGVwcmVjYXRlZC4gVXNlIHByZXNlbnRhdGlvbiBpbnN0ZWFkJyk7XG5cbmNvbnN0IGdyb3VwU3RyaW5nczogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRlbnVtOiBbXG5cdFx0J2J1aWxkJyxcblx0XHQndGVzdCcsXG5cdFx0J25vbmUnXG5cdF0sXG5cdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAuYnVpbGQnLCAnTWFya3MgdGhlIHRhc2sgYXMgYSBidWlsZCB0YXNrIGFjY2Vzc2libGUgdGhyb3VnaCB0aGUgXFwnUnVuIEJ1aWxkIFRhc2tcXCcgY29tbWFuZC4nKSxcblx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAudGVzdCcsICdNYXJrcyB0aGUgdGFzayBhcyBhIHRlc3QgdGFzayBhY2Nlc3NpYmxlIHRocm91Z2ggdGhlIFxcJ1J1biBUZXN0IFRhc2tcXCcgY29tbWFuZC4nKSxcblx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAubm9uZScsICdBc3NpZ25zIHRoZSB0YXNrIHRvIG5vIGdyb3VwJylcblx0XSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5ncm91cC5raW5kJywgJ1RoZSB0YXNrXFwncyBleGVjdXRpb24gZ3JvdXAuJylcbn07XG5cbmNvbnN0IGdyb3VwOiBJSlNPTlNjaGVtYSA9IHtcblx0b25lT2Y6IFtcblx0XHRncm91cFN0cmluZ3MsXG5cdFx0e1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGtpbmQ6IGdyb3VwU3RyaW5ncyxcblx0XHRcdFx0aXNEZWZhdWx0OiB7XG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAuaXNEZWZhdWx0JywgJ0RlZmluZXMgaWYgdGhpcyB0YXNrIGlzIHRoZSBkZWZhdWx0IHRhc2sgaW4gdGhlIGdyb3VwLCBvciBhIGdsb2IgdG8gbWF0Y2ggdGhlIGZpbGUgd2hpY2ggc2hvdWxkIHRyaWdnZXIgdGhpcyB0YXNrLicpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRdLFxuXHRkZWZhdWx0U25pcHBldHM6IFtcblx0XHR7XG5cdFx0XHRib2R5OiB7IGtpbmQ6ICdidWlsZCcsIGlzRGVmYXVsdDogdHJ1ZSB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5ncm91cC5kZWZhdWx0QnVpbGQnLCAnTWFya3MgdGhlIHRhc2sgYXMgdGhlIGRlZmF1bHQgYnVpbGQgdGFzay4nKVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0Ym9keTogeyBraW5kOiAndGVzdCcsIGlzRGVmYXVsdDogdHJ1ZSB9LFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5ncm91cC5kZWZhdWx0VGVzdCcsICdNYXJrcyB0aGUgdGFzayBhcyB0aGUgZGVmYXVsdCB0ZXN0IHRhc2suJylcblx0XHR9XG5cdF0sXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuZ3JvdXAnLCAnRGVmaW5lcyB0byB3aGljaCBleGVjdXRpb24gZ3JvdXAgdGhpcyB0YXNrIGJlbG9uZ3MgdG8uIEl0IHN1cHBvcnRzIFwiYnVpbGRcIiB0byBhZGQgaXQgdG8gdGhlIGJ1aWxkIGdyb3VwIGFuZCBcInRlc3RcIiB0byBhZGQgaXQgdG8gdGhlIHRlc3QgZ3JvdXAuJylcbn07XG5cbmNvbnN0IHRhc2tUeXBlOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGVudW06IFsnc2hlbGwnXSxcblx0ZGVmYXVsdDogJ3Byb2Nlc3MnLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnR5cGUnLCAnRGVmaW5lcyB3aGV0aGVyIHRoZSB0YXNrIGlzIHJ1biBhcyBhIHByb2Nlc3Mgb3IgYXMgYSBjb21tYW5kIGluc2lkZSBhIHNoZWxsLicpXG59O1xuXG5jb25zdCBjb21tYW5kOiBJSlNPTlNjaGVtYSA9IHtcblx0b25lT2Y6IFtcblx0XHR7XG5cdFx0XHRvbmVPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmNvbW1hbmRBcnJheScsICdUaGUgc2hlbGwgY29tbWFuZCB0byBiZSBleGVjdXRlZC4gQXJyYXkgaXRlbXMgd2lsbCBiZSBqb2luZWQgdXNpbmcgYSBzcGFjZSBjaGFyYWN0ZXInKVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHR7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHJlcXVpcmVkOiBbJ3ZhbHVlJywgJ3F1b3RpbmcnXSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmNvbW1hbmRBcnJheScsICdUaGUgc2hlbGwgY29tbWFuZCB0byBiZSBleGVjdXRlZC4gQXJyYXkgaXRlbXMgd2lsbCBiZSBqb2luZWQgdXNpbmcgYSBzcGFjZSBjaGFyYWN0ZXInKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jb21tYW5kLnF1b3RlZFN0cmluZy52YWx1ZScsICdUaGUgYWN0dWFsIGNvbW1hbmQgdmFsdWUnKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRxdW90aW5nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydlc2NhcGUnLCAnc3Ryb25nJywgJ3dlYWsnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucXVvdGluZy5lc2NhcGUnLCAnRXNjYXBlcyBjaGFyYWN0ZXJzIHVzaW5nIHRoZSBzaGVsbFxcJ3MgZXNjYXBlIGNoYXJhY3RlciAoZS5nLiBgIHVuZGVyIFBvd2VyU2hlbGwgYW5kIFxcXFwgdW5kZXIgYmFzaCkuJyksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucXVvdGluZy5zdHJvbmcnLCAnUXVvdGVzIHRoZSBhcmd1bWVudCB1c2luZyB0aGUgc2hlbGxcXCdzIHN0cm9uZyBxdW90ZSBjaGFyYWN0ZXIgKGUuZy4gXFwnIHVuZGVyIFBvd2VyU2hlbGwgYW5kIGJhc2gpLicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnF1b3Rpbmcud2VhaycsICdRdW90ZXMgdGhlIGFyZ3VtZW50IHVzaW5nIHRoZSBzaGVsbFxcJ3Mgd2VhayBxdW90ZSBjaGFyYWN0ZXIgKGUuZy4gXCIgdW5kZXIgUG93ZXJTaGVsbCBhbmQgYmFzaCkuJyksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnc3Ryb25nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmNvbW1hbmQucXVvdGVzU3RyaW5nLnF1b3RlJywgJ0hvdyB0aGUgY29tbWFuZCB2YWx1ZSBzaG91bGQgYmUgcXVvdGVkLicpXG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH1cblx0XSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5jb21tYW5kJywgJ1RoZSBjb21tYW5kIHRvIGJlIGV4ZWN1dGVkLiBDYW4gYmUgYW4gZXh0ZXJuYWwgcHJvZ3JhbSBvciBhIHNoZWxsIGNvbW1hbmQuJylcbn07XG5cbmNvbnN0IGFyZ3M6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnYXJyYXknLFxuXHRpdGVtczoge1xuXHRcdG9uZU9mOiBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ3ZhbHVlJywgJ3F1b3RpbmcnXSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEuYXJncy5xdW90ZWRTdHJpbmcudmFsdWUnLCAnVGhlIGFjdHVhbCBhcmd1bWVudCB2YWx1ZScpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRxdW90aW5nOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IFsnZXNjYXBlJywgJ3N0cm9uZycsICd3ZWFrJ10sXG5cdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5xdW90aW5nLmVzY2FwZScsICdFc2NhcGVzIGNoYXJhY3RlcnMgdXNpbmcgdGhlIHNoZWxsXFwncyBlc2NhcGUgY2hhcmFjdGVyIChlLmcuIGAgdW5kZXIgUG93ZXJTaGVsbCBhbmQgXFxcXCB1bmRlciBiYXNoKS4nKSxcblx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnF1b3Rpbmcuc3Ryb25nJywgJ1F1b3RlcyB0aGUgYXJndW1lbnQgdXNpbmcgdGhlIHNoZWxsXFwncyBzdHJvbmcgcXVvdGUgY2hhcmFjdGVyIChlLmcuIFxcJyB1bmRlciBQb3dlclNoZWxsIGFuZCBiYXNoKS4nKSxcblx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnF1b3Rpbmcud2VhaycsICdRdW90ZXMgdGhlIGFyZ3VtZW50IHVzaW5nIHRoZSBzaGVsbFxcJ3Mgd2VhayBxdW90ZSBjaGFyYWN0ZXIgKGUuZy4gXCIgdW5kZXIgUG93ZXJTaGVsbCBhbmQgYmFzaCkuJyksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdDogJ3N0cm9uZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmFyZ3MucXVvdGVzU3RyaW5nLnF1b3RlJywgJ0hvdyB0aGUgYXJndW1lbnQgdmFsdWUgc2hvdWxkIGJlIHF1b3RlZC4nKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0XVxuXHR9LFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmFyZ3MnLCAnQXJndW1lbnRzIHBhc3NlZCB0byB0aGUgY29tbWFuZCB3aGVuIHRoaXMgdGFzayBpcyBpbnZva2VkLicpXG59O1xuXG5jb25zdCBsYWJlbDogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdzdHJpbmcnLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmxhYmVsJywgXCJUaGUgdGFzaydzIHVzZXIgaW50ZXJmYWNlIGxhYmVsXCIpXG59O1xuXG5jb25zdCB2ZXJzaW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGVudW06IFsnMi4wLjAnXSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS52ZXJzaW9uJywgJ1RoZSBjb25maWdcXCdzIHZlcnNpb24gbnVtYmVyLicpXG59O1xuXG5jb25zdCBpZGVudGlmaWVyOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ3N0cmluZycsXG5cdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaWRlbnRpZmllcicsICdBIHVzZXIgZGVmaW5lZCBpZGVudGlmaWVyIHRvIHJlZmVyZW5jZSB0aGUgdGFzayBpbiBsYXVuY2guanNvbiBvciBhIGRlcGVuZHNPbiBjbGF1c2UuJyksXG5cdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmlkZW50aWZpZXIuZGVwcmVjYXRlZCcsICdVc2VyIGRlZmluZWQgaWRlbnRpZmllcnMgYXJlIGRlcHJlY2F0ZWQuIEZvciBjdXN0b20gdGFzayB1c2UgdGhlIG5hbWUgYXMgYSByZWZlcmVuY2UgYW5kIGZvciB0YXNrcyBwcm92aWRlZCBieSBleHRlbnNpb25zIHVzZSB0aGVpciBkZWZpbmVkIHRhc2sgaWRlbnRpZmllci4nKVxufTtcblxuY29uc3QgcnVuT3B0aW9uczogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRyZWV2YWx1YXRlT25SZXJ1bjoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5yZWV2YWx1YXRlT25SZXJ1bicsICdXaGV0aGVyIHRvIHJlZXZhbHVhdGUgdGFzayB2YXJpYWJsZXMgb24gcmVydW4uJyksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHRydW5Pbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAnZm9sZGVyT3BlbicsICd3b3JrdHJlZUNyZWF0ZWQnXSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucnVuT24nLCAnQ29uZmlndXJlcyB3aGVuIHRoZSB0YXNrIHNob3VsZCBiZSBydW4uIElmIHNldCB0byBmb2xkZXJPcGVuLCB0aGVuIHRoZSB0YXNrIHdpbGwgYmUgcnVuIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgZm9sZGVyIGlzIG9wZW5lZC4gSWYgc2V0IHRvIHdvcmt0cmVlQ3JlYXRlZCwgdGhlbiB0aGUgdGFzayB3aWxsIGJlIHJ1biBhdXRvbWF0aWNhbGx5IHdoZW4gYW4gQWdlbnQgU2Vzc2lvbiB3b3JrdHJlZSBpcyBjcmVhdGVkLicpLFxuXHRcdFx0ZGVmYXVsdDogJ2RlZmF1bHQnXG5cdFx0fSxcblx0XHRpbnN0YW5jZUxpbWl0OiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaW5zdGFuY2VMaW1pdCcsICdUaGUgbnVtYmVyIG9mIGluc3RhbmNlcyBvZiB0aGUgdGFzayB0aGF0IGFyZSBhbGxvd2VkIHRvIHJ1biBzaW11bHRhbmVvdXNseS4nKSxcblx0XHRcdGRlZmF1bHQ6IDFcblx0XHR9LFxuXHRcdGluc3RhbmNlUG9saWN5OiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsndGVybWluYXRlTmV3ZXN0JywgJ3Rlcm1pbmF0ZU9sZGVzdCcsICdwcm9tcHQnLCAnd2FybicsICdzaWxlbnQnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLmluc3RhbmNlUG9saWN5LnRlcm1pbmF0ZU5ld2VzdCcsICdUZXJtaW5hdGVzIHRoZSBuZXdlc3QgaW5zdGFuY2UuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5pbnN0YW5jZVBvbGljeS50ZXJtaW5hdGVPbGRlc3QnLCAnVGVybWluYXRlcyB0aGUgb2xkZXN0IGluc3RhbmNlLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaW5zdGFuY2VQb2xpY3kucHJvbXB0JywgJ0Fza3Mgd2hpY2ggaW5zdGFuY2UgdG8gdGVybWluYXRlLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaW5zdGFuY2VQb2xpY3kud2FybicsICdEb2VzIG5vdGhpbmcgYnV0IHdhcm5zIHRoYXQgdGhlIGluc3RhbmNlIGxpbWl0IGhhcyBiZWVuIHJlYWNoZWQuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5pbnN0YW5jZVBvbGljeS5zaWxlbnQnLCAnRG9lcyBub3RoaW5nLicpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuaW5zdGFuY2VQb2xpY3knLCAnUG9saWN5IHRvIGFwcGx5IHdoZW4gaW5zdGFuY2UgbGltaXQgaXMgcmVhY2hlZC4nKSxcblx0XHRcdGRlZmF1bHQ6ICdwcm9tcHQnXG5cdFx0fVxuXHR9LFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnJ1bk9wdGlvbnMnLCAnVGhlIHRhc2tcXCdzIHJ1biByZWxhdGVkIG9wdGlvbnMnKVxufTtcblxuY29uc3QgY29tbW9uU2NoZW1hRGVmaW5pdGlvbnMgPSBjb21tb25TY2hlbWEuZGVmaW5pdGlvbnMhO1xuY29uc3Qgb3B0aW9uczogSUpTT05TY2hlbWEgPSBPYmplY3RzLmRlZXBDbG9uZShjb21tb25TY2hlbWFEZWZpbml0aW9ucy5vcHRpb25zKTtcbmNvbnN0IG9wdGlvbnNQcm9wZXJ0aWVzID0gb3B0aW9ucy5wcm9wZXJ0aWVzITtcbm9wdGlvbnNQcm9wZXJ0aWVzLnNoZWxsID0gT2JqZWN0cy5kZWVwQ2xvbmUoY29tbW9uU2NoZW1hRGVmaW5pdGlvbnMuc2hlbGxDb25maWd1cmF0aW9uKTtcblxuY29uc3QgdGFza0NvbmZpZ3VyYXRpb246IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0bGFiZWw6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy50YXNrTGFiZWwnLCBcIlRoZSB0YXNrJ3MgbGFiZWxcIilcblx0XHR9LFxuXHRcdHRhc2tOYW1lOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MudGFza05hbWUnLCAnVGhlIHRhc2tcXCdzIG5hbWUnKSxcblx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLnRhc2tzLnRhc2tOYW1lLmRlcHJlY2F0ZWQnLCAnVGhlIHRhc2tcXCdzIG5hbWUgcHJvcGVydHkgaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSBsYWJlbCBwcm9wZXJ0eSBpbnN0ZWFkLicpXG5cdFx0fSxcblx0XHRpZGVudGlmaWVyOiBPYmplY3RzLmRlZXBDbG9uZShpZGVudGlmaWVyKSxcblx0XHRncm91cDogT2JqZWN0cy5kZWVwQ2xvbmUoZ3JvdXApLFxuXHRcdGlzQmFja2dyb3VuZDoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5iYWNrZ3JvdW5kJywgJ1doZXRoZXIgdGhlIGV4ZWN1dGVkIHRhc2sgaXMga2VwdCBhbGl2ZSBhbmQgaXMgcnVubmluZyBpbiB0aGUgYmFja2dyb3VuZC4nKSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdHByb21wdE9uQ2xvc2U6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MucHJvbXB0T25DbG9zZScsICdXaGV0aGVyIHRoZSB1c2VyIGlzIHByb21wdGVkIHdoZW4gVlMgQ29kZSBjbG9zZXMgd2l0aCBhIHJ1bm5pbmcgdGFzay4nKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHRwcmVzZW50YXRpb246IE9iamVjdHMuZGVlcENsb25lKHByZXNlbnRhdGlvbiksXG5cdFx0aWNvbjogT2JqZWN0cy5kZWVwQ2xvbmUoaWNvbiksXG5cdFx0aGlkZTogT2JqZWN0cy5kZWVwQ2xvbmUoaGlkZSksXG5cdFx0aW5BZ2VudHM6IE9iamVjdHMuZGVlcENsb25lKGluQWdlbnRzKSxcblx0XHRvcHRpb25zOiBvcHRpb25zLFxuXHRcdHByb2JsZW1NYXRjaGVyOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9wcm9ibGVtTWF0Y2hlclR5cGUnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy5tYXRjaGVycycsICdUaGUgcHJvYmxlbSBtYXRjaGVyKHMpIHRvIHVzZS4gQ2FuIGVpdGhlciBiZSBhIHN0cmluZyBvciBhIHByb2JsZW0gbWF0Y2hlciBkZWZpbml0aW9uIG9yIGFuIGFycmF5IG9mIHN0cmluZ3MgYW5kIHByb2JsZW0gbWF0Y2hlcnMuJylcblx0XHR9LFxuXHRcdHJ1bk9wdGlvbnM6IE9iamVjdHMuZGVlcENsb25lKHJ1bk9wdGlvbnMpLFxuXHRcdGRlcGVuZHNPbjogT2JqZWN0cy5kZWVwQ2xvbmUoZGVwZW5kc09uKSxcblx0XHRkZXBlbmRzT3JkZXI6IE9iamVjdHMuZGVlcENsb25lKGRlcGVuZHNPcmRlciksXG5cdFx0ZGV0YWlsOiBPYmplY3RzLmRlZXBDbG9uZShkZXRhaWwpLFxuXHR9XG59O1xuXG5jb25zdCB0YXNrRGVmaW5pdGlvbnM6IElKU09OU2NoZW1hW10gPSBbXTtcblRhc2tEZWZpbml0aW9uUmVnaXN0cnkub25SZWFkeSgpLnRoZW4oKCkgPT4ge1xuXHR1cGRhdGVUYXNrRGVmaW5pdGlvbnMoKTtcbn0pO1xuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlVGFza0RlZmluaXRpb25zKCkge1xuXHRmb3IgKGNvbnN0IHRhc2tUeXBlIG9mIFRhc2tEZWZpbml0aW9uUmVnaXN0cnkuYWxsKCkpIHtcblx0XHQvLyBDaGVjayB0aGF0IHdlIGhhdmVuJ3QgYWxyZWFkeSBhZGRlZCB0aGlzIHRhc2sgdHlwZVxuXHRcdGlmICh0YXNrRGVmaW5pdGlvbnMuZmluZChzY2hlbWEgPT4ge1xuXHRcdFx0cmV0dXJuIHNjaGVtYS5wcm9wZXJ0aWVzPy50eXBlPy5lbnVtPy5maW5kID8gc2NoZW1hLnByb3BlcnRpZXM/LnR5cGUuZW51bS5maW5kKGVsZW1lbnQgPT4gZWxlbWVudCA9PT0gdGFza1R5cGUudGFza1R5cGUpIDogdW5kZWZpbmVkO1xuXHRcdH0pKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0gT2JqZWN0cy5kZWVwQ2xvbmUodGFza0NvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IHNjaGVtYVByb3BlcnRpZXMgPSBzY2hlbWEucHJvcGVydGllcyE7XG5cdFx0Ly8gU2luY2Ugd2UgZG8gdGhpcyBhZnRlciB0aGUgc2NoZW1hIGlzIGFzc2lnbmVkIHdlIG5lZWQgdG8gcGF0Y2ggdGhlIHJlZnMuXG5cdFx0c2NoZW1hUHJvcGVydGllcy50eXBlID0ge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmN1c3RvbWl6YXRpb25zLmN1c3RvbWl6ZXMudHlwZScsICdUaGUgdGFzayB0eXBlIHRvIGN1c3RvbWl6ZScpLFxuXHRcdFx0ZW51bTogW3Rhc2tUeXBlLnRhc2tUeXBlXVxuXHRcdH07XG5cdFx0aWYgKHRhc2tUeXBlLnJlcXVpcmVkKSB7XG5cdFx0XHRzY2hlbWEucmVxdWlyZWQgPSB0YXNrVHlwZS5yZXF1aXJlZC5zbGljZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzY2hlbWEucmVxdWlyZWQgPSBbXTtcblx0XHR9XG5cdFx0Ly8gQ3VzdG9taXplZCB0YXNrcyByZXF1aXJlIHRoYXQgdGhlIHRhc2sgdHlwZSBiZSBzZXQuXG5cdFx0c2NoZW1hLnJlcXVpcmVkLnB1c2goJ3R5cGUnKTtcblx0XHRpZiAodGFza1R5cGUucHJvcGVydGllcykge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModGFza1R5cGUucHJvcGVydGllcykpIHtcblx0XHRcdFx0Y29uc3QgcHJvcGVydHkgPSB0YXNrVHlwZS5wcm9wZXJ0aWVzW2tleV07XG5cdFx0XHRcdHNjaGVtYVByb3BlcnRpZXNba2V5XSA9IE9iamVjdHMuZGVlcENsb25lKHByb3BlcnR5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zml4UmVmZXJlbmNlcyhzY2hlbWEgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik7XG5cdFx0dGFza0RlZmluaXRpb25zLnB1c2goc2NoZW1hKTtcblx0fVxufVxuXG5jb25zdCBjdXN0b21pemUgPSBPYmplY3RzLmRlZXBDbG9uZSh0YXNrQ29uZmlndXJhdGlvbik7XG5jdXN0b21pemUucHJvcGVydGllcyEuY3VzdG9taXplID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudGFza3MuY3VzdG9taXplLmRlcHJlY2F0ZWQnLCAnVGhlIGN1c3RvbWl6ZSBwcm9wZXJ0eSBpcyBkZXByZWNhdGVkLiBTZWUgdGhlIDEuMTQgcmVsZWFzZSBub3RlcyBvbiBob3cgdG8gbWlncmF0ZSB0byB0aGUgbmV3IHRhc2sgY3VzdG9taXphdGlvbiBhcHByb2FjaCcpXG59O1xuaWYgKCFjdXN0b21pemUucmVxdWlyZWQpIHtcblx0Y3VzdG9taXplLnJlcXVpcmVkID0gW107XG59XG5jdXN0b21pemUucmVxdWlyZWQucHVzaCgnY3VzdG9taXplJyk7XG50YXNrRGVmaW5pdGlvbnMucHVzaChjdXN0b21pemUpO1xuXG5jb25zdCBkZWZpbml0aW9ucyA9IE9iamVjdHMuZGVlcENsb25lKGNvbW1vblNjaGVtYURlZmluaXRpb25zKTtcbmNvbnN0IHRhc2tEZXNjcmlwdGlvbjogSUpTT05TY2hlbWEgPSBkZWZpbml0aW9ucy50YXNrRGVzY3JpcHRpb247XG50YXNrRGVzY3JpcHRpb24ucmVxdWlyZWQgPSBbJ2xhYmVsJ107XG5jb25zdCB0YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzID0gdGFza0Rlc2NyaXB0aW9uLnByb3BlcnRpZXMhO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5sYWJlbCA9IE9iamVjdHMuZGVlcENsb25lKGxhYmVsKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuY29tbWFuZCA9IE9iamVjdHMuZGVlcENsb25lKGNvbW1hbmQpO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5hcmdzID0gT2JqZWN0cy5kZWVwQ2xvbmUoYXJncyk7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmlzU2hlbGxDb21tYW5kID0gT2JqZWN0cy5kZWVwQ2xvbmUoc2hlbGxDb21tYW5kKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuZGVwZW5kc09uID0gZGVwZW5kc09uO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5oaWRlID0gT2JqZWN0cy5kZWVwQ2xvbmUoaGlkZSk7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmluQWdlbnRzID0gT2JqZWN0cy5kZWVwQ2xvbmUoaW5BZ2VudHMpO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5kZXBlbmRzT3JkZXIgPSBkZXBlbmRzT3JkZXI7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXIgPSBPYmplY3RzLmRlZXBDbG9uZShpZGVudGlmaWVyKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMudHlwZSA9IE9iamVjdHMuZGVlcENsb25lKHRhc2tUeXBlKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMucHJlc2VudGF0aW9uID0gT2JqZWN0cy5kZWVwQ2xvbmUocHJlc2VudGF0aW9uKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMudGVybWluYWwgPSB0ZXJtaW5hbDtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuaWNvbiA9IE9iamVjdHMuZGVlcENsb25lKGljb24pO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5ncm91cCA9IE9iamVjdHMuZGVlcENsb25lKGdyb3VwKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMucnVuT3B0aW9ucyA9IE9iamVjdHMuZGVlcENsb25lKHJ1bk9wdGlvbnMpO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5kZXRhaWwgPSBkZXRhaWw7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLnRhc2tOYW1lLmRlcHJlY2F0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0J0pzb25TY2hlbWEudGFza3MudGFza05hbWUuZGVwcmVjYXRlZCcsXG5cdCdUaGUgdGFza1xcJ3MgbmFtZSBwcm9wZXJ0eSBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIGxhYmVsIHByb3BlcnR5IGluc3RlYWQuJ1xuKTtcbi8vIENsb25lIHRoZSB0YXNrRGVzY3JpcHRpb24gZm9yIHByb2Nlc3MgdGFzayBiZWZvcmUgc2V0dGluZyBhIGRlZmF1bHQgdG8gcHJldmVudCB0d28gZGVmYXVsdHMgIzExNTI4MVxuY29uc3QgcHJvY2Vzc1Rhc2sgPSBPYmplY3RzLmRlZXBDbG9uZSh0YXNrRGVzY3JpcHRpb24pO1xudGFza0Rlc2NyaXB0aW9uLmRlZmF1bHQgPSB7XG5cdGxhYmVsOiAnTXkgVGFzaycsXG5cdHR5cGU6ICdzaGVsbCcsXG5cdGNvbW1hbmQ6ICdlY2hvIEhlbGxvJyxcblx0cHJvYmxlbU1hdGNoZXI6IFtdXG59O1xuZGVmaW5pdGlvbnMuc2hvd091dHB1dFR5cGUuZGVwcmVjYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHQnSnNvblNjaGVtYS50YXNrcy5zaG93T3V0cHV0LmRlcHJlY2F0ZWQnLFxuXHQnVGhlIHByb3BlcnR5IHNob3dPdXRwdXQgaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSByZXZlYWwgcHJvcGVydHkgaW5zaWRlIHRoZSBwcmVzZW50YXRpb24gcHJvcGVydHkgaW5zdGVhZC4gU2VlIGFsc28gdGhlIDEuMTQgcmVsZWFzZSBub3Rlcy4nXG4pO1xudGFza0Rlc2NyaXB0aW9uUHJvcGVydGllcy5lY2hvQ29tbWFuZC5kZXByZWNhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoXG5cdCdKc29uU2NoZW1hLnRhc2tzLmVjaG9Db21tYW5kLmRlcHJlY2F0ZWQnLFxuXHQnVGhlIHByb3BlcnR5IGVjaG9Db21tYW5kIGlzIGRlcHJlY2F0ZWQuIFVzZSB0aGUgZWNobyBwcm9wZXJ0eSBpbnNpZGUgdGhlIHByZXNlbnRhdGlvbiBwcm9wZXJ0eSBpbnN0ZWFkLiBTZWUgYWxzbyB0aGUgMS4xNCByZWxlYXNlIG5vdGVzLidcbik7XG50YXNrRGVzY3JpcHRpb25Qcm9wZXJ0aWVzLnN1cHByZXNzVGFza05hbWUuZGVwcmVjYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHQnSnNvblNjaGVtYS50YXNrcy5zdXBwcmVzc1Rhc2tOYW1lLmRlcHJlY2F0ZWQnLFxuXHQnVGhlIHByb3BlcnR5IHN1cHByZXNzVGFza05hbWUgaXMgZGVwcmVjYXRlZC4gSW5saW5lIHRoZSBjb21tYW5kIHdpdGggaXRzIGFyZ3VtZW50cyBpbnRvIHRoZSB0YXNrIGluc3RlYWQuIFNlZSBhbHNvIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMuJ1xuKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuaXNCdWlsZENvbW1hbmQuZGVwcmVjYXRpb25NZXNzYWdlID0gbmxzLmxvY2FsaXplKFxuXHQnSnNvblNjaGVtYS50YXNrcy5pc0J1aWxkQ29tbWFuZC5kZXByZWNhdGVkJyxcblx0J1RoZSBwcm9wZXJ0eSBpc0J1aWxkQ29tbWFuZCBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIGdyb3VwIHByb3BlcnR5IGluc3RlYWQuIFNlZSBhbHNvIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMuJ1xuKTtcbnRhc2tEZXNjcmlwdGlvblByb3BlcnRpZXMuaXNUZXN0Q29tbWFuZC5kZXByZWNhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoXG5cdCdKc29uU2NoZW1hLnRhc2tzLmlzVGVzdENvbW1hbmQuZGVwcmVjYXRlZCcsXG5cdCdUaGUgcHJvcGVydHkgaXNUZXN0Q29tbWFuZCBpcyBkZXByZWNhdGVkLiBVc2UgdGhlIGdyb3VwIHByb3BlcnR5IGluc3RlYWQuIFNlZSBhbHNvIHRoZSAxLjE0IHJlbGVhc2Ugbm90ZXMuJ1xuKTtcblxuLy8gUHJvY2VzcyB0YXNrcyBhcmUgYWxtb3N0IGlkZW50aWNhbCBzY2hlbWEtd2lzZSB0byBzaGVsbCB0YXNrcywgYnV0IHRoZXkgYXJlIHJlcXVpcmVkIHRvIGhhdmUgYSBjb21tYW5kXG5wcm9jZXNzVGFzay5wcm9wZXJ0aWVzIS50eXBlID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0ZW51bTogWydwcm9jZXNzJ10sXG5cdGRlZmF1bHQ6ICdwcm9jZXNzJyxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS50YXNrcy50eXBlJywgJ0RlZmluZXMgd2hldGhlciB0aGUgdGFzayBpcyBydW4gYXMgYSBwcm9jZXNzIG9yIGFzIGEgY29tbWFuZCBpbnNpZGUgYSBzaGVsbC4nKVxufTtcbnByb2Nlc3NUYXNrLnJlcXVpcmVkIS5wdXNoKCdjb21tYW5kJyk7XG5wcm9jZXNzVGFzay5yZXF1aXJlZCEucHVzaCgndHlwZScpO1xuXG50YXNrRGVmaW5pdGlvbnMucHVzaChwcm9jZXNzVGFzayk7XG5cbnRhc2tEZWZpbml0aW9ucy5wdXNoKHtcblx0JHJlZjogJyMvZGVmaW5pdGlvbnMvdGFza0Rlc2NyaXB0aW9uJ1xufSk7XG5cbmNvbnN0IGRlZmluaXRpb25zVGFza1J1bm5lckNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gZGVmaW5pdGlvbnMudGFza1J1bm5lckNvbmZpZ3VyYXRpb24ucHJvcGVydGllcyE7XG5jb25zdCB0YXNrcyA9IGRlZmluaXRpb25zVGFza1J1bm5lckNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnRhc2tzO1xudGFza3MuaXRlbXMgPSB7XG5cdG9uZU9mOiB0YXNrRGVmaW5pdGlvbnNcbn07XG5cbmRlZmluaXRpb25zVGFza1J1bm5lckNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlucHV0cyA9IGlucHV0c1NjaGVtYS5kZWZpbml0aW9ucyEuaW5wdXRzO1xuXG5kZWZpbml0aW9ucy5jb21tYW5kQ29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzIS5pc1NoZWxsQ29tbWFuZCA9IE9iamVjdHMuZGVlcENsb25lKHNoZWxsQ29tbWFuZCk7XG5kZWZpbml0aW9ucy5jb21tYW5kQ29uZmlndXJhdGlvbi5wcm9wZXJ0aWVzIS5hcmdzID0gT2JqZWN0cy5kZWVwQ2xvbmUoYXJncyk7XG5kZWZpbml0aW9ucy5vcHRpb25zLnByb3BlcnRpZXMhLnNoZWxsID0ge1xuXHQkcmVmOiAnIy9kZWZpbml0aW9ucy9zaGVsbENvbmZpZ3VyYXRpb24nXG59O1xuXG5kZWZpbml0aW9uc1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uUHJvcGVydGllcy5pc1NoZWxsQ29tbWFuZCA9IE9iamVjdHMuZGVlcENsb25lKHNoZWxsQ29tbWFuZCk7XG5kZWZpbml0aW9uc1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uUHJvcGVydGllcy50eXBlID0gT2JqZWN0cy5kZWVwQ2xvbmUodGFza1R5cGUpO1xuZGVmaW5pdGlvbnNUYXNrUnVubmVyQ29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPSBPYmplY3RzLmRlZXBDbG9uZShncm91cCk7XG5kZWZpbml0aW9uc1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uUHJvcGVydGllcy5wcmVzZW50YXRpb24gPSBPYmplY3RzLmRlZXBDbG9uZShwcmVzZW50YXRpb24pO1xuZGVmaW5pdGlvbnNUYXNrUnVubmVyQ29uZmlndXJhdGlvblByb3BlcnRpZXMuc3VwcHJlc3NUYXNrTmFtZS5kZXByZWNhdGlvbk1lc3NhZ2UgPSBubHMubG9jYWxpemUoXG5cdCdKc29uU2NoZW1hLnRhc2tzLnN1cHByZXNzVGFza05hbWUuZGVwcmVjYXRlZCcsXG5cdCdUaGUgcHJvcGVydHkgc3VwcHJlc3NUYXNrTmFtZSBpcyBkZXByZWNhdGVkLiBJbmxpbmUgdGhlIGNvbW1hbmQgd2l0aCBpdHMgYXJndW1lbnRzIGludG8gdGhlIHRhc2sgaW5zdGVhZC4gU2VlIGFsc28gdGhlIDEuMTQgcmVsZWFzZSBub3Rlcy4nXG4pO1xuZGVmaW5pdGlvbnNUYXNrUnVubmVyQ29uZmlndXJhdGlvblByb3BlcnRpZXMudGFza1NlbGVjdG9yLmRlcHJlY2F0aW9uTWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0J0pzb25TY2hlbWEudGFza3MudGFza1NlbGVjdG9yLmRlcHJlY2F0ZWQnLFxuXHQnVGhlIHByb3BlcnR5IHRhc2tTZWxlY3RvciBpcyBkZXByZWNhdGVkLiBJbmxpbmUgdGhlIGNvbW1hbmQgd2l0aCBpdHMgYXJndW1lbnRzIGludG8gdGhlIHRhc2sgaW5zdGVhZC4gU2VlIGFsc28gdGhlIDEuMTQgcmVsZWFzZSBub3Rlcy4nXG4pO1xuXG5jb25zdCBvc1NwZWNpZmljVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSBPYmplY3RzLmRlZXBDbG9uZShkZWZpbml0aW9ucy50YXNrUnVubmVyQ29uZmlndXJhdGlvbik7XG5kZWxldGUgb3NTcGVjaWZpY1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uLnByb3BlcnRpZXMhLnRhc2tzO1xub3NTcGVjaWZpY1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uLmFkZGl0aW9uYWxQcm9wZXJ0aWVzID0gZmFsc2U7XG5kZWZpbml0aW9ucy5vc1NwZWNpZmljVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSBvc1NwZWNpZmljVGFza1J1bm5lckNvbmZpZ3VyYXRpb247XG5kZWZpbml0aW9uc1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uUHJvcGVydGllcy52ZXJzaW9uID0gT2JqZWN0cy5kZWVwQ2xvbmUodmVyc2lvbik7XG5cbmNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdG9uZU9mOiBbXG5cdFx0e1xuXHRcdFx0J2FsbE9mJzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsndmVyc2lvbiddLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHZlcnNpb246IE9iamVjdHMuZGVlcENsb25lKHZlcnNpb24pLFxuXHRcdFx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdFx0XHQnJHJlZic6ICcjL2RlZmluaXRpb25zL29zU3BlY2lmaWNUYXNrUnVubmVyQ29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS53aW5kb3dzJywgJ1dpbmRvd3Mgc3BlY2lmaWMgY29tbWFuZCBjb25maWd1cmF0aW9uJylcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRvc3g6IHtcblx0XHRcdFx0XHRcdFx0JyRyZWYnOiAnIy9kZWZpbml0aW9ucy9vc1NwZWNpZmljVGFza1J1bm5lckNvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEubWFjJywgJ01hYyBzcGVjaWZpYyBjb21tYW5kIGNvbmZpZ3VyYXRpb24nKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGxpbnV4OiB7XG5cdFx0XHRcdFx0XHRcdCckcmVmJzogJyMvZGVmaW5pdGlvbnMvb3NTcGVjaWZpY1Rhc2tSdW5uZXJDb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmxpbnV4JywgJ0xpbnV4IHNwZWNpZmljIGNvbW1hbmQgY29uZmlndXJhdGlvbicpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvdGFza1J1bm5lckNvbmZpZ3VyYXRpb24nXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9XG5cdF1cbn07XG5cbnNjaGVtYS5kZWZpbml0aW9ucyA9IGRlZmluaXRpb25zO1xuXG5mdW5jdGlvbiBkZXByZWNhdGVkVmFyaWFibGVNZXNzYWdlKHNjaGVtYU1hcDogSUpTT05TY2hlbWFNYXAsIHByb3BlcnR5OiBzdHJpbmcpIHtcblx0Y29uc3QgbWFwQXRQcm9wZXJ0eSA9IHNjaGVtYU1hcFtwcm9wZXJ0eV0ucHJvcGVydGllcyE7XG5cdGlmIChtYXBBdFByb3BlcnR5KSB7XG5cdFx0T2JqZWN0LmtleXMobWFwQXRQcm9wZXJ0eSkuZm9yRWFjaChuYW1lID0+IHtcblx0XHRcdGRlcHJlY2F0ZWRWYXJpYWJsZU1lc3NhZ2UobWFwQXRQcm9wZXJ0eSwgbmFtZSk7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29uZmlndXJhdGlvblJlc29sdmVyVXRpbHMuYXBwbHlEZXByZWNhdGVkVmFyaWFibGVNZXNzYWdlKHNjaGVtYU1hcFtwcm9wZXJ0eV0pO1xuXHR9XG59XG5cbk9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGRlZmluaXRpb25zKS5mb3JFYWNoKGtleSA9PiB7XG5cdGNvbnN0IG5ld0tleSA9IGtleSArICcyJztcblx0ZGVmaW5pdGlvbnNbbmV3S2V5XSA9IGRlZmluaXRpb25zW2tleV07XG5cdGRlbGV0ZSBkZWZpbml0aW9uc1trZXldO1xuXHRkZXByZWNhdGVkVmFyaWFibGVNZXNzYWdlKGRlZmluaXRpb25zLCBuZXdLZXkpO1xufSk7XG5maXhSZWZlcmVuY2VzKHNjaGVtYSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVByb2JsZW1NYXRjaGVycygpIHtcblx0dHJ5IHtcblx0XHRjb25zdCBtYXRjaGVySWRzID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5rZXlzKCkubWFwKGtleSA9PiAnJCcgKyBrZXkpO1xuXHRcdGRlZmluaXRpb25zLnByb2JsZW1NYXRjaGVyVHlwZTIub25lT2YhWzBdLmVudW0gPSBtYXRjaGVySWRzO1xuXHRcdChkZWZpbml0aW9ucy5wcm9ibGVtTWF0Y2hlclR5cGUyLm9uZU9mIVsyXS5pdGVtcyBhcyBJSlNPTlNjaGVtYSkuYW55T2YhWzBdLmVudW0gPSBtYXRjaGVySWRzO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRjb25zb2xlLmxvZygnSW5zdGFsbGluZyBwcm9ibGVtIG1hdGNoZXIgaWRzIGZhaWxlZCcpO1xuXHR9XG59XG5cblByb2JsZW1NYXRjaGVyUmVnaXN0cnkub25SZWFkeSgpLnRoZW4oKCkgPT4ge1xuXHR1cGRhdGVQcm9ibGVtTWF0Y2hlcnMoKTtcbn0pO1xuXG5leHBvcnQgZGVmYXVsdCBzY2hlbWE7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxhQUFhO0FBR3pCLE9BQU8sa0JBQWtCO0FBRXpCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsOEJBQThCO0FBQ3ZDLFlBQVksZ0NBQWdDO0FBQzVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsY0FBYyxTQUE4QztBQUNwRSxNQUFJLE1BQU0sUUFBUSxPQUFPLEdBQUc7QUFDM0IsWUFBUSxRQUFRLGFBQVc7QUFDMUIsVUFBSSxPQUFPLFlBQVksWUFBWSxZQUFZLE1BQU07QUFDcEQsc0JBQWMsT0FBa0M7QUFBQSxNQUNqRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsV0FBVyxPQUFPLFlBQVksVUFBVTtBQUN2QyxRQUFJLFFBQVEsTUFBTSxHQUFHO0FBQ3BCLGNBQVEsTUFBTSxJQUFJLFFBQVEsTUFBTSxJQUFJO0FBQUEsSUFDckM7QUFDQSxXQUFPLG9CQUFvQixPQUFPLEVBQUUsUUFBUSxjQUFZO0FBQ3ZELFlBQU0sUUFBUSxRQUFRLFFBQVE7QUFDOUIsVUFBSSxNQUFNLFFBQVEsS0FBSyxLQUFNLE9BQU8sVUFBVSxZQUFZLFVBQVUsTUFBTztBQUMxRSxzQkFBYyxLQUFnQztBQUFBLE1BQy9DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBRUEsTUFBTSxlQUE0QjtBQUFBLEVBQ2pDLE9BQU87QUFBQSxJQUNOO0FBQUEsTUFDQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxhQUFhLElBQUksU0FBUyxvQkFBb0Isd0dBQXdHO0FBQUEsSUFDdko7QUFBQSxJQUNBO0FBQUEsTUFDQyxNQUFNO0FBQUEsSUFDUDtBQUFBLEVBQ0Q7QUFBQSxFQUNBLG9CQUFvQixJQUFJLFNBQVMsOENBQThDLDhKQUE4SjtBQUM5TztBQUdB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
