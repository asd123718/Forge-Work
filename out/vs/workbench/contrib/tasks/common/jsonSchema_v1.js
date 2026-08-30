import * as nls from "../../../../nls.js";
import * as Objects from "../../../../base/common/objects.js";
import { ProblemMatcherRegistry } from "./problemMatcher.js";
import commonSchema from "./jsonSchemaCommon.js";
const schema = {
  oneOf: [
    {
      allOf: [
        {
          type: "object",
          required: ["version"],
          properties: {
            version: {
              type: "string",
              enum: ["0.1.0"],
              deprecationMessage: nls.localize("JsonSchema.version.deprecated", "Task version 0.1.0 is deprecated. Please use 2.0.0"),
              description: nls.localize("JsonSchema.version", "The config's version number")
            },
            _runner: {
              deprecationMessage: nls.localize("JsonSchema._runner", "The runner has graduated. Use the official runner property")
            },
            runner: {
              type: "string",
              enum: ["process", "terminal"],
              default: "process",
              description: nls.localize("JsonSchema.runner", "Defines whether the task is executed as a process and the output is shown in the output window or inside the terminal.")
            },
            windows: {
              $ref: "#/definitions/taskRunnerConfiguration",
              description: nls.localize("JsonSchema.windows", "Windows specific command configuration")
            },
            osx: {
              $ref: "#/definitions/taskRunnerConfiguration",
              description: nls.localize("JsonSchema.mac", "Mac specific command configuration")
            },
            linux: {
              $ref: "#/definitions/taskRunnerConfiguration",
              description: nls.localize("JsonSchema.linux", "Linux specific command configuration")
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
const shellCommand = {
  type: "boolean",
  default: true,
  description: nls.localize("JsonSchema.shell", "Specifies whether the command is a shell command or an external program. Defaults to false if omitted.")
};
schema.definitions = Objects.deepClone(commonSchema.definitions);
const definitions = schema.definitions;
definitions["commandConfiguration"]["properties"]["isShellCommand"] = Objects.deepClone(shellCommand);
definitions["taskDescription"]["properties"]["isShellCommand"] = Objects.deepClone(shellCommand);
definitions["taskRunnerConfiguration"]["properties"]["isShellCommand"] = Objects.deepClone(shellCommand);
Object.getOwnPropertyNames(definitions).forEach((key) => {
  const newKey = key + "1";
  definitions[newKey] = definitions[key];
  delete definitions[key];
});
function fixReferences(literal) {
  if (Array.isArray(literal)) {
    literal.forEach((element) => {
      if (typeof element === "object" && element !== null) {
        fixReferences(element);
      }
    });
  } else if (typeof literal === "object") {
    if (literal["$ref"]) {
      literal["$ref"] = literal["$ref"] + "1";
    }
    Object.getOwnPropertyNames(literal).forEach((property) => {
      const value = literal[property];
      if (Array.isArray(value) || typeof value === "object") {
        fixReferences(value);
      }
    });
  }
}
fixReferences(schema);
ProblemMatcherRegistry.onReady().then(() => {
  try {
    const matcherIds = ProblemMatcherRegistry.keys().map((key) => "$" + key);
    definitions.problemMatcherType1.oneOf[0].enum = matcherIds;
    definitions.problemMatcherType1.oneOf[2].items.anyOf[1].enum = matcherIds;
  } catch (err) {
    console.log("Installing problem matcher ids failed");
  }
});
var jsonSchema_v1_default = schema;
export {
  jsonSchema_v1_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXGpzb25TY2hlbWFfdjEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIE9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuXG5pbXBvcnQgeyBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5IH0gZnJvbSAnLi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5cbmltcG9ydCBjb21tb25TY2hlbWEgZnJvbSAnLi9qc29uU2NoZW1hQ29tbW9uLmpzJztcblxuY29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0b25lT2Y6IFtcblx0XHR7XG5cdFx0XHRhbGxPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsndmVyc2lvbiddLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHZlcnNpb246IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGVudW06IFsnMC4xLjAnXSxcblx0XHRcdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudmVyc2lvbi5kZXByZWNhdGVkJywgJ1Rhc2sgdmVyc2lvbiAwLjEuMCBpcyBkZXByZWNhdGVkLiBQbGVhc2UgdXNlIDIuMC4wJyksXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEudmVyc2lvbicsICdUaGUgY29uZmlnXFwncyB2ZXJzaW9uIG51bWJlcicpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0X3J1bm5lcjoge1xuXHRcdFx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5fcnVubmVyJywgJ1RoZSBydW5uZXIgaGFzIGdyYWR1YXRlZC4gVXNlIHRoZSBvZmZpY2lhbCBydW5uZXIgcHJvcGVydHknKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHJ1bm5lcjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZW51bTogWydwcm9jZXNzJywgJ3Rlcm1pbmFsJ10sXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6ICdwcm9jZXNzJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5ydW5uZXInLCAnRGVmaW5lcyB3aGV0aGVyIHRoZSB0YXNrIGlzIGV4ZWN1dGVkIGFzIGEgcHJvY2VzcyBhbmQgdGhlIG91dHB1dCBpcyBzaG93biBpbiB0aGUgb3V0cHV0IHdpbmRvdyBvciBpbnNpZGUgdGhlIHRlcm1pbmFsLicpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0d2luZG93czoge1xuXHRcdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy90YXNrUnVubmVyQ29uZmlndXJhdGlvbicsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ0pzb25TY2hlbWEud2luZG93cycsICdXaW5kb3dzIHNwZWNpZmljIGNvbW1hbmQgY29uZmlndXJhdGlvbicpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0b3N4OiB7XG5cdFx0XHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3Rhc2tSdW5uZXJDb25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5tYWMnLCAnTWFjIHNwZWNpZmljIGNvbW1hbmQgY29uZmlndXJhdGlvbicpXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bGludXg6IHtcblx0XHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvdGFza1J1bm5lckNvbmZpZ3VyYXRpb24nLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdKc29uU2NoZW1hLmxpbnV4JywgJ0xpbnV4IHNwZWNpZmljIGNvbW1hbmQgY29uZmlndXJhdGlvbicpXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvdGFza1J1bm5lckNvbmZpZ3VyYXRpb24nXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9XG5cdF1cbn07XG5cbmNvbnN0IHNoZWxsQ29tbWFuZDogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdib29sZWFuJyxcblx0ZGVmYXVsdDogdHJ1ZSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnSnNvblNjaGVtYS5zaGVsbCcsICdTcGVjaWZpZXMgd2hldGhlciB0aGUgY29tbWFuZCBpcyBhIHNoZWxsIGNvbW1hbmQgb3IgYW4gZXh0ZXJuYWwgcHJvZ3JhbS4gRGVmYXVsdHMgdG8gZmFsc2UgaWYgb21pdHRlZC4nKVxufTtcblxuc2NoZW1hLmRlZmluaXRpb25zID0gT2JqZWN0cy5kZWVwQ2xvbmUoY29tbW9uU2NoZW1hLmRlZmluaXRpb25zKTtcbmNvbnN0IGRlZmluaXRpb25zID0gc2NoZW1hLmRlZmluaXRpb25zITtcbmRlZmluaXRpb25zWydjb21tYW5kQ29uZmlndXJhdGlvbiddWydwcm9wZXJ0aWVzJ10hWydpc1NoZWxsQ29tbWFuZCddID0gT2JqZWN0cy5kZWVwQ2xvbmUoc2hlbGxDb21tYW5kKTtcbmRlZmluaXRpb25zWyd0YXNrRGVzY3JpcHRpb24nXVsncHJvcGVydGllcyddIVsnaXNTaGVsbENvbW1hbmQnXSA9IE9iamVjdHMuZGVlcENsb25lKHNoZWxsQ29tbWFuZCk7XG5kZWZpbml0aW9uc1sndGFza1J1bm5lckNvbmZpZ3VyYXRpb24nXVsncHJvcGVydGllcyddIVsnaXNTaGVsbENvbW1hbmQnXSA9IE9iamVjdHMuZGVlcENsb25lKHNoZWxsQ29tbWFuZCk7XG5cbk9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGRlZmluaXRpb25zKS5mb3JFYWNoKGtleSA9PiB7XG5cdGNvbnN0IG5ld0tleSA9IGtleSArICcxJztcblx0ZGVmaW5pdGlvbnNbbmV3S2V5XSA9IGRlZmluaXRpb25zW2tleV07XG5cdGRlbGV0ZSBkZWZpbml0aW9uc1trZXldO1xufSk7XG5cbmZ1bmN0aW9uIGZpeFJlZmVyZW5jZXMobGl0ZXJhbDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmtub3duW10pIHtcblx0aWYgKEFycmF5LmlzQXJyYXkobGl0ZXJhbCkpIHtcblx0XHRsaXRlcmFsLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQgPT09ICdvYmplY3QnICYmIGVsZW1lbnQgIT09IG51bGwpIHtcblx0XHRcdFx0Zml4UmVmZXJlbmNlcyhlbGVtZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSBlbHNlIGlmICh0eXBlb2YgbGl0ZXJhbCA9PT0gJ29iamVjdCcpIHtcblx0XHRpZiAobGl0ZXJhbFsnJHJlZiddKSB7XG5cdFx0XHRsaXRlcmFsWyckcmVmJ10gPSBsaXRlcmFsWyckcmVmJ10gKyAnMSc7XG5cdFx0fVxuXHRcdE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGxpdGVyYWwpLmZvckVhY2gocHJvcGVydHkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBsaXRlcmFsW3Byb3BlcnR5XTtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSB8fCB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGZpeFJlZmVyZW5jZXModmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5maXhSZWZlcmVuY2VzKHNjaGVtYSBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KTtcblxuUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5vblJlYWR5KCkudGhlbigoKSA9PiB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgbWF0Y2hlcklkcyA9IFByb2JsZW1NYXRjaGVyUmVnaXN0cnkua2V5cygpLm1hcChrZXkgPT4gJyQnICsga2V5KTtcblx0XHRkZWZpbml0aW9ucy5wcm9ibGVtTWF0Y2hlclR5cGUxLm9uZU9mIVswXS5lbnVtID0gbWF0Y2hlcklkcztcblx0XHQoZGVmaW5pdGlvbnMucHJvYmxlbU1hdGNoZXJUeXBlMS5vbmVPZiFbMl0uaXRlbXMgYXMgSUpTT05TY2hlbWEpLmFueU9mIVsxXS5lbnVtID0gbWF0Y2hlcklkcztcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0Y29uc29sZS5sb2coJ0luc3RhbGxpbmcgcHJvYmxlbSBtYXRjaGVyIGlkcyBmYWlsZWQnKTtcblx0fVxufSk7XG5cbmV4cG9ydCBkZWZhdWx0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
