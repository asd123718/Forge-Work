import { Extensions as JSONExtensions } from "../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
const toolsParametersSchemaSchemaId = "vscode://schemas/toolsParameters";
const toolsParametersSchemaSchema = {
  definitions: {
    schemaArray: {
      type: "array",
      minItems: 1,
      items: {
        $ref: "#"
      }
    },
    nonNegativeInteger: {
      type: "integer",
      minimum: 0
    },
    nonNegativeIntegerDefault0: {
      allOf: [
        {
          $ref: "#/definitions/nonNegativeInteger"
        },
        {
          default: 0
        }
      ]
    },
    simpleTypes: {
      enum: [
        "array",
        "boolean",
        "integer",
        "null",
        "number",
        "object",
        "string"
      ]
    },
    stringArray: {
      type: "array",
      items: {
        type: "string"
      },
      uniqueItems: true,
      default: []
    }
  },
  type: ["object"],
  properties: {
    $id: {
      type: "string",
      format: "uri-reference"
    },
    $schema: {
      type: "string",
      format: "uri"
    },
    $ref: {
      type: "string",
      format: "uri-reference"
    },
    $comment: {
      type: "string"
    },
    title: {
      type: "string"
    },
    description: {
      type: "string"
    },
    readOnly: {
      type: "boolean",
      default: false
    },
    writeOnly: {
      type: "boolean",
      default: false
    },
    multipleOf: {
      type: "number",
      exclusiveMinimum: 0
    },
    maximum: {
      type: "number"
    },
    exclusiveMaximum: {
      type: "number"
    },
    minimum: {
      type: "number"
    },
    exclusiveMinimum: {
      type: "number"
    },
    maxLength: {
      $ref: "#/definitions/nonNegativeInteger"
    },
    minLength: {
      $ref: "#/definitions/nonNegativeIntegerDefault0"
    },
    pattern: {
      type: "string",
      format: "regex"
    },
    additionalItems: {
      $ref: "#"
    },
    items: {
      anyOf: [
        {
          $ref: "#"
        },
        {
          $ref: "#/definitions/schemaArray"
        }
      ],
      default: true
    },
    maxItems: {
      $ref: "#/definitions/nonNegativeInteger"
    },
    minItems: {
      $ref: "#/definitions/nonNegativeIntegerDefault0"
    },
    uniqueItems: {
      type: "boolean",
      default: false
    },
    contains: {
      $ref: "#"
    },
    maxProperties: {
      $ref: "#/definitions/nonNegativeInteger"
    },
    minProperties: {
      $ref: "#/definitions/nonNegativeIntegerDefault0"
    },
    required: {
      $ref: "#/definitions/stringArray"
    },
    additionalProperties: {
      $ref: "#"
    },
    definitions: {
      type: "object",
      additionalProperties: {
        $ref: "#"
      },
      default: {}
    },
    properties: {
      type: "object",
      additionalProperties: {
        $ref: "#"
      },
      default: {}
    },
    patternProperties: {
      type: "object",
      additionalProperties: {
        $ref: "#"
      },
      propertyNames: {
        format: "regex"
      },
      default: {}
    },
    dependencies: {
      type: "object",
      additionalProperties: {
        anyOf: [
          {
            $ref: "#"
          },
          {
            $ref: "#/definitions/stringArray"
          }
        ]
      }
    },
    propertyNames: {
      $ref: "#"
    },
    enum: {
      type: "array",
      minItems: 1,
      uniqueItems: true
    },
    type: {
      anyOf: [
        {
          $ref: "#/definitions/simpleTypes"
        },
        {
          type: "array",
          items: {
            $ref: "#/definitions/simpleTypes"
          },
          minItems: 1,
          uniqueItems: true
        }
      ]
    },
    format: {
      type: "string"
    },
    contentMediaType: {
      type: "string"
    },
    contentEncoding: {
      type: "string"
    },
    if: {
      $ref: "#"
    },
    then: {
      $ref: "#"
    },
    else: {
      $ref: "#"
    },
    allOf: {
      $ref: "#/definitions/schemaArray"
    },
    anyOf: {
      $ref: "#/definitions/schemaArray"
    },
    oneOf: {
      $ref: "#/definitions/schemaArray"
    },
    not: {
      $ref: "#"
    }
  },
  defaultSnippets: [{
    body: {
      type: "object",
      properties: {
        "${1:paramName}": {
          type: "string",
          description: "${2:description}"
        }
      }
    }
  }]
};
const contributionRegistry = Registry.as(JSONExtensions.JSONContribution);
contributionRegistry.registerSchema(toolsParametersSchemaSchemaId, toolsParametersSchemaSchema);
export {
  toolsParametersSchemaSchemaId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGxhbmd1YWdlTW9kZWxUb29sc1BhcmFtZXRlcnNTY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucywgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG4vKipcbiAqIEEgc2NoZW1hIGZvciBwYXJhbWV0ZXJzU2NoZW1hXG4gKiBUaGlzIGlzIGEgc3Vic2V0IG9mIGh0dHBzOi8vanNvbi1zY2hlbWEub3JnL2RyYWZ0LTA3L3NjaGVtYSB0byBjYXB0dXJlIHdoYXQgaXMgYWN0dWFsbHkgc3VwcG9ydGVkIGJ5IGxhbmd1YWdlIG1vZGVscyBmb3IgdG9vbHMsIG1haW5seSwgdGhhdCB0aGV5IG11c3QgYmUgYW4gb2JqZWN0IGF0IHRoZSB0b3AgbGV2ZWwuXG4gKiBQb3NzaWJseSBpdCBjYW4gYmUgd2hpdHRsZWQgZG93biBzb21lIG1vcmUgYmFzZWQgb24gd2hpY2ggYXR0cmlidXRlcyBhcmUgc3VwcG9ydGVkIGJ5IGxhbmd1YWdlIG1vZGVscy5cbiAqL1xuZXhwb3J0IGNvbnN0IHRvb2xzUGFyYW1ldGVyc1NjaGVtYVNjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMvdG9vbHNQYXJhbWV0ZXJzJztcbmNvbnN0IHRvb2xzUGFyYW1ldGVyc1NjaGVtYVNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdGRlZmluaXRpb25zOiB7XG5cdFx0c2NoZW1hQXJyYXk6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdCRyZWY6ICcjJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0bm9uTmVnYXRpdmVJbnRlZ2VyOiB7XG5cdFx0XHR0eXBlOiAnaW50ZWdlcicsXG5cdFx0XHRtaW5pbXVtOiAwXG5cdFx0fSxcblx0XHRub25OZWdhdGl2ZUludGVnZXJEZWZhdWx0MDoge1xuXHRcdFx0YWxsT2Y6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL25vbk5lZ2F0aXZlSW50ZWdlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRlZmF1bHQ6IDBcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0sXG5cdFx0c2ltcGxlVHlwZXM6IHtcblx0XHRcdGVudW06IFtcblx0XHRcdFx0J2FycmF5Jyxcblx0XHRcdFx0J2Jvb2xlYW4nLFxuXHRcdFx0XHQnaW50ZWdlcicsXG5cdFx0XHRcdCdudWxsJyxcblx0XHRcdFx0J251bWJlcicsXG5cdFx0XHRcdCdvYmplY3QnLFxuXHRcdFx0XHQnc3RyaW5nJ1xuXHRcdFx0XVxuXHRcdH0sXG5cdFx0c3RyaW5nQXJyYXk6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fSxcblx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdFx0ZGVmYXVsdDogW11cblx0XHR9XG5cdH0sXG5cdHR5cGU6IFsnb2JqZWN0J10sXG5cdHByb3BlcnRpZXM6IHtcblx0XHQkaWQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0Zm9ybWF0OiAndXJpLXJlZmVyZW5jZSdcblx0XHR9LFxuXHRcdCRzY2hlbWE6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0Zm9ybWF0OiAndXJpJ1xuXHRcdH0sXG5cdFx0JHJlZjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRmb3JtYXQ6ICd1cmktcmVmZXJlbmNlJ1xuXHRcdH0sXG5cdFx0JGNvbW1lbnQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHR0aXRsZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdH0sXG5cdFx0cmVhZE9ubHk6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHR3cml0ZU9ubHk6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0fSxcblx0XHRtdWx0aXBsZU9mOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGV4Y2x1c2l2ZU1pbmltdW06IDBcblx0XHR9LFxuXHRcdG1heGltdW06IHtcblx0XHRcdHR5cGU6ICdudW1iZXInXG5cdFx0fSxcblx0XHRleGNsdXNpdmVNYXhpbXVtOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJ1xuXHRcdH0sXG5cdFx0bWluaW11bToge1xuXHRcdFx0dHlwZTogJ251bWJlcidcblx0XHR9LFxuXHRcdGV4Y2x1c2l2ZU1pbmltdW06IHtcblx0XHRcdHR5cGU6ICdudW1iZXInXG5cdFx0fSxcblx0XHRtYXhMZW5ndGg6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL25vbk5lZ2F0aXZlSW50ZWdlcidcblx0XHR9LFxuXHRcdG1pbkxlbmd0aDoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvbm9uTmVnYXRpdmVJbnRlZ2VyRGVmYXVsdDAnXG5cdFx0fSxcblx0XHRwYXR0ZXJuOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGZvcm1hdDogJ3JlZ2V4J1xuXHRcdH0sXG5cdFx0YWRkaXRpb25hbEl0ZW1zOiB7XG5cdFx0XHQkcmVmOiAnIydcblx0XHR9LFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0JHJlZjogJyMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9zY2hlbWFBcnJheSdcblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdG1heEl0ZW1zOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9ub25OZWdhdGl2ZUludGVnZXInXG5cdFx0fSxcblx0XHRtaW5JdGVtczoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvbm9uTmVnYXRpdmVJbnRlZ2VyRGVmYXVsdDAnXG5cdFx0fSxcblx0XHR1bmlxdWVJdGVtczoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdGNvbnRhaW5zOiB7XG5cdFx0XHQkcmVmOiAnIydcblx0XHR9LFxuXHRcdG1heFByb3BlcnRpZXM6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL25vbk5lZ2F0aXZlSW50ZWdlcidcblx0XHR9LFxuXHRcdG1pblByb3BlcnRpZXM6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL25vbk5lZ2F0aXZlSW50ZWdlckRlZmF1bHQwJ1xuXHRcdH0sXG5cdFx0cmVxdWlyZWQ6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3N0cmluZ0FycmF5J1xuXHRcdH0sXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdCRyZWY6ICcjJ1xuXHRcdH0sXG5cdFx0ZGVmaW5pdGlvbnM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0JHJlZjogJyMnXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge31cblx0XHR9LFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0JHJlZjogJyMnXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge31cblx0XHR9LFxuXHRcdHBhdHRlcm5Qcm9wZXJ0aWVzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdCRyZWY6ICcjJ1xuXHRcdFx0fSxcblx0XHRcdHByb3BlcnR5TmFtZXM6IHtcblx0XHRcdFx0Zm9ybWF0OiAncmVnZXgnXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge31cblx0XHR9LFxuXHRcdGRlcGVuZGVuY2llczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdCRyZWY6ICcjJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc3RyaW5nQXJyYXknXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRwcm9wZXJ0eU5hbWVzOiB7XG5cdFx0XHQkcmVmOiAnIydcblx0XHR9LFxuXHRcdGVudW06IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlXG5cdFx0fSxcblx0XHR0eXBlOiB7XG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc2ltcGxlVHlwZXMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9zaW1wbGVUeXBlcydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1pbkl0ZW1zOiAxLFxuXHRcdFx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9LFxuXHRcdGZvcm1hdDoge1xuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGNvbnRlbnRNZWRpYVR5cGU6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRjb250ZW50RW5jb2Rpbmc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRpZjoge1xuXHRcdFx0JHJlZjogJyMnXG5cdFx0fSxcblx0XHR0aGVuOiB7XG5cdFx0XHQkcmVmOiAnIydcblx0XHR9LFxuXHRcdGVsc2U6IHtcblx0XHRcdCRyZWY6ICcjJ1xuXHRcdH0sXG5cdFx0YWxsT2Y6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5J1xuXHRcdH0sXG5cdFx0YW55T2Y6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5J1xuXHRcdH0sXG5cdFx0b25lT2Y6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3NjaGVtYUFycmF5J1xuXHRcdH0sXG5cdFx0bm90OiB7XG5cdFx0XHQkcmVmOiAnIydcblx0XHR9XG5cdH0sXG5cdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRib2R5OiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0JyR7MTpwYXJhbU5hbWV9Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnJHsyOmRlc2NyaXB0aW9ufSdcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdH1dLFxufTtcbmNvbnN0IGNvbnRyaWJ1dGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5jb250cmlidXRpb25SZWdpc3RyeS5yZWdpc3RlclNjaGVtYSh0b29sc1BhcmFtZXRlcnNTY2hlbWFTY2hlbWFJZCwgdG9vbHNQYXJhbWV0ZXJzU2NoZW1hU2NoZW1hKTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsY0FBYyxzQkFBaUQ7QUFDeEUsU0FBUyxnQkFBZ0I7QUFPbEIsTUFBTSxnQ0FBZ0M7QUFDN0MsTUFBTSw4QkFBMkM7QUFBQSxFQUNoRCxhQUFhO0FBQUEsSUFDWixhQUFhO0FBQUEsTUFDWixNQUFNO0FBQUEsTUFDTixVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLG9CQUFvQjtBQUFBLE1BQ25CLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxJQUNWO0FBQUEsSUFDQSw0QkFBNEI7QUFBQSxNQUMzQixPQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsUUFDVjtBQUFBLE1BQ0Q7QUFBQSxJ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
