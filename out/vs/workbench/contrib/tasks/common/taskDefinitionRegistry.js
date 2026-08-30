import * as nls from "../../../../nls.js";
import * as Types from "../../../../base/common/types.js";
import * as Objects from "../../../../base/common/objects.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { Emitter } from "../../../../base/common/event.js";
const taskDefinitionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      description: nls.localize("TaskDefinition.description", "The actual task type. Please note that types starting with a '$' are reserved for internal usage.")
    },
    required: {
      type: "array",
      markdownDescription: nls.localize("TaskDefinition.required", "The names of the properties from the `properties` object that must be provided for a task of this type to be considered a match. Used by VS Code to associate a `tasks.json` entry with a registered task provider."),
      items: {
        type: "string"
      }
    },
    properties: {
      type: "object",
      description: nls.localize("TaskDefinition.properties", "Additional properties of the task type"),
      additionalProperties: {
        $ref: "http://json-schema.org/draft-07/schema#"
      }
    },
    when: {
      type: "string",
      markdownDescription: nls.localize("TaskDefinition.when", "Condition which must be true to enable this type of task. Consider using `shellExecutionSupported`, `processExecutionSupported`, and `customExecutionSupported` as appropriate for this task definition. See the [API documentation](https://code.visualstudio.com/api/extension-guides/task-provider#when-clause) for more information."),
      default: ""
    }
  }
};
var Configuration;
((Configuration2) => {
  function from(value, extensionId, messageCollector) {
    if (!value) {
      return void 0;
    }
    const taskType = Types.isString(value.type) ? value.type : void 0;
    if (!taskType || taskType.length === 0) {
      messageCollector.error(nls.localize("TaskTypeConfiguration.noType", "The task type configuration is missing the required 'taskType' property"));
      return void 0;
    }
    const required = [];
    if (Array.isArray(value.required)) {
      for (const element of value.required) {
        if (Types.isString(element)) {
          required.push(element);
        }
      }
    }
    return {
      extensionId: extensionId.value,
      taskType,
      required,
      properties: value.properties ? Objects.deepClone(value.properties) : {},
      when: value.when ? ContextKeyExpr.deserialize(value.when) : void 0
    };
  }
  Configuration2.from = from;
})(Configuration || (Configuration = {}));
const taskDefinitionsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "taskDefinitions",
  activationEventsGenerator: function* (contributions) {
    for (const task of contributions) {
      if (task.type) {
        yield `onTaskType:${task.type}`;
      }
    }
  },
  jsonSchema: {
    description: nls.localize("TaskDefinitionExtPoint", "Contributes task kinds"),
    type: "array",
    items: taskDefinitionSchema
  }
});
class TaskDefinitionRegistryImpl {
  constructor() {
    this._onDefinitionsChanged = new Emitter();
    this.onDefinitionsChanged = this._onDefinitionsChanged.event;
    this.taskTypes = /* @__PURE__ */ Object.create(null);
    this.readyPromise = new Promise((resolve, reject) => {
      taskDefinitionsExtPoint.setHandler((extensions, delta) => {
        this._schema = void 0;
        try {
          for (const extension of delta.removed) {
            const taskTypes = extension.value;
            for (const taskType of taskTypes) {
              if (this.taskTypes && taskType.type && this.taskTypes[taskType.type]) {
                delete this.taskTypes[taskType.type];
              }
            }
          }
          for (const extension of delta.added) {
            const taskTypes = extension.value;
            for (const taskType of taskTypes) {
              const type = Configuration.from(taskType, extension.description.identifier, extension.collector);
              if (type) {
                this.taskTypes[type.taskType] = type;
              }
            }
          }
          if (delta.removed.length > 0 || delta.added.length > 0) {
            this._onDefinitionsChanged.fire();
          }
        } catch (error) {
        }
        resolve(void 0);
      });
    });
  }
  onReady() {
    return this.readyPromise;
  }
  get(key) {
    return this.taskTypes[key];
  }
  all() {
    return Object.keys(this.taskTypes).map((key) => this.taskTypes[key]);
  }
  getJsonSchema() {
    if (this._schema === void 0) {
      const schemas = [];
      for (const definition of this.all()) {
        const schema = {
          type: "object",
          additionalProperties: false
        };
        if (definition.required.length > 0) {
          schema.required = definition.required.slice(0);
        }
        if (definition.properties !== void 0) {
          schema.properties = Objects.deepClone(definition.properties);
        } else {
          schema.properties = /* @__PURE__ */ Object.create(null);
        }
        schema.properties.type = {
          type: "string",
          enum: [definition.taskType]
        };
        schemas.push(schema);
      }
      this._schema = { oneOf: schemas };
    }
    return this._schema;
  }
}
const TaskDefinitionRegistry = new TaskDefinitionRegistryImpl();
export {
  TaskDefinitionRegistry
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRhc2tzXFxjb21tb25cXHRhc2tEZWZpbml0aW9uUmVnaXN0cnkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuXG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnksIEV4dGVuc2lvbk1lc3NhZ2VDb2xsZWN0b3IgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuXG5pbXBvcnQgKiBhcyBUYXNrcyBmcm9tICcuL3Rhc2tzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcblxuXG5jb25zdCB0YXNrRGVmaW5pdGlvblNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHR0eXBlOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ1Rhc2tEZWZpbml0aW9uLmRlc2NyaXB0aW9uJywgJ1RoZSBhY3R1YWwgdGFzayB0eXBlLiBQbGVhc2Ugbm90ZSB0aGF0IHR5cGVzIHN0YXJ0aW5nIHdpdGggYSBcXCckXFwnIGFyZSByZXNlcnZlZCBmb3IgaW50ZXJuYWwgdXNhZ2UuJylcblx0XHR9LFxuXHRcdHJlcXVpcmVkOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdUYXNrRGVmaW5pdGlvbi5yZXF1aXJlZCcsICdUaGUgbmFtZXMgb2YgdGhlIHByb3BlcnRpZXMgZnJvbSB0aGUgYHByb3BlcnRpZXNgIG9iamVjdCB0aGF0IG11c3QgYmUgcHJvdmlkZWQgZm9yIGEgdGFzayBvZiB0aGlzIHR5cGUgdG8gYmUgY29uc2lkZXJlZCBhIG1hdGNoLiBVc2VkIGJ5IFZTIENvZGUgdG8gYXNzb2NpYXRlIGEgYHRhc2tzLmpzb25gIGVudHJ5IHdpdGggYSByZWdpc3RlcmVkIHRhc2sgcHJvdmlkZXIuJyksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdUYXNrRGVmaW5pdGlvbi5wcm9wZXJ0aWVzJywgJ0FkZGl0aW9uYWwgcHJvcGVydGllcyBvZiB0aGUgdGFzayB0eXBlJyksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHQkcmVmOiAnaHR0cDovL2pzb24tc2NoZW1hLm9yZy9kcmFmdC0wNy9zY2hlbWEjJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0d2hlbjoge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ1Rhc2tEZWZpbml0aW9uLndoZW4nLCAnQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBlbmFibGUgdGhpcyB0eXBlIG9mIHRhc2suIENvbnNpZGVyIHVzaW5nIGBzaGVsbEV4ZWN1dGlvblN1cHBvcnRlZGAsIGBwcm9jZXNzRXhlY3V0aW9uU3VwcG9ydGVkYCwgYW5kIGBjdXN0b21FeGVjdXRpb25TdXBwb3J0ZWRgIGFzIGFwcHJvcHJpYXRlIGZvciB0aGlzIHRhc2sgZGVmaW5pdGlvbi4gU2VlIHRoZSBbQVBJIGRvY3VtZW50YXRpb25dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9leHRlbnNpb24tZ3VpZGVzL3Rhc2stcHJvdmlkZXIjd2hlbi1jbGF1c2UpIGZvciBtb3JlIGluZm9ybWF0aW9uLicpLFxuXHRcdFx0ZGVmYXVsdDogJydcblx0XHR9XG5cdH1cbn07XG5cbm5hbWVzcGFjZSBDb25maWd1cmF0aW9uIHtcblx0ZXhwb3J0IGludGVyZmFjZSBJVGFza0RlZmluaXRpb24ge1xuXHRcdHR5cGU/OiBzdHJpbmc7XG5cdFx0cmVxdWlyZWQ/OiBzdHJpbmdbXTtcblx0XHRwcm9wZXJ0aWVzPzogSUpTT05TY2hlbWFNYXA7XG5cdFx0d2hlbj86IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJVGFza0RlZmluaXRpb24sIGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCBtZXNzYWdlQ29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogVGFza3MuSVRhc2tEZWZpbml0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0YXNrVHlwZSA9IFR5cGVzLmlzU3RyaW5nKHZhbHVlLnR5cGUpID8gdmFsdWUudHlwZSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXRhc2tUeXBlIHx8IHRhc2tUeXBlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0bWVzc2FnZUNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ1Rhc2tUeXBlQ29uZmlndXJhdGlvbi5ub1R5cGUnLCAnVGhlIHRhc2sgdHlwZSBjb25maWd1cmF0aW9uIGlzIG1pc3NpbmcgdGhlIHJlcXVpcmVkIFxcJ3Rhc2tUeXBlXFwnIHByb3BlcnR5JykpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVxdWlyZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUucmVxdWlyZWQpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdmFsdWUucmVxdWlyZWQpIHtcblx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0cmVxdWlyZWQucHVzaChlbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbklkLnZhbHVlLFxuXHRcdFx0dGFza1R5cGUsIHJlcXVpcmVkOiByZXF1aXJlZCxcblx0XHRcdHByb3BlcnRpZXM6IHZhbHVlLnByb3BlcnRpZXMgPyBPYmplY3RzLmRlZXBDbG9uZSh2YWx1ZS5wcm9wZXJ0aWVzKSA6IHt9LFxuXHRcdFx0d2hlbjogdmFsdWUud2hlbiA/IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHZhbHVlLndoZW4pIDogdW5kZWZpbmVkXG5cdFx0fTtcblx0fVxufVxuXG5cbmNvbnN0IHRhc2tEZWZpbml0aW9uc0V4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8Q29uZmlndXJhdGlvbi5JVGFza0RlZmluaXRpb25bXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ3Rhc2tEZWZpbml0aW9ucycsXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnV0aW9uczogcmVhZG9ubHkgQ29uZmlndXJhdGlvbi5JVGFza0RlZmluaXRpb25bXSkge1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiBjb250cmlidXRpb25zKSB7XG5cdFx0XHRpZiAodGFzay50eXBlKSB7XG5cdFx0XHRcdHlpZWxkIGBvblRhc2tUeXBlOiR7dGFzay50eXBlfWA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnVGFza0RlZmluaXRpb25FeHRQb2ludCcsICdDb250cmlidXRlcyB0YXNrIGtpbmRzJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczogdGFza0RlZmluaXRpb25TY2hlbWFcblx0fVxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tEZWZpbml0aW9uUmVnaXN0cnkge1xuXHRvblJlYWR5KCk6IFByb21pc2U8dm9pZD47XG5cblx0Z2V0KGtleTogc3RyaW5nKTogVGFza3MuSVRhc2tEZWZpbml0aW9uO1xuXHRhbGwoKTogVGFza3MuSVRhc2tEZWZpbml0aW9uW107XG5cdGdldEpzb25TY2hlbWEoKTogSUpTT05TY2hlbWE7XG5cdHJlYWRvbmx5IG9uRGVmaW5pdGlvbnNDaGFuZ2VkOiBFdmVudDx2b2lkPjtcbn1cblxuY2xhc3MgVGFza0RlZmluaXRpb25SZWdpc3RyeUltcGwgaW1wbGVtZW50cyBJVGFza0RlZmluaXRpb25SZWdpc3RyeSB7XG5cblx0cHJpdmF0ZSB0YXNrVHlwZXM6IElTdHJpbmdEaWN0aW9uYXJ5PFRhc2tzLklUYXNrRGVmaW5pdGlvbj47XG5cdHByaXZhdGUgcmVhZHlQcm9taXNlOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIF9zY2hlbWE6IElKU09OU2NoZW1hIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9vbkRlZmluaXRpb25zQ2hhbmdlZDogRW1pdHRlcjx2b2lkPiA9IG5ldyBFbWl0dGVyKCk7XG5cdHB1YmxpYyBvbkRlZmluaXRpb25zQ2hhbmdlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRlZmluaXRpb25zQ2hhbmdlZC5ldmVudDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLnRhc2tUeXBlcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5yZWFkeVByb21pc2UgPSBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0YXNrRGVmaW5pdGlvbnNFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zY2hlbWEgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGFza1R5cGVzID0gZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCB0YXNrVHlwZSBvZiB0YXNrVHlwZXMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMudGFza1R5cGVzICYmIHRhc2tUeXBlLnR5cGUgJiYgdGhpcy50YXNrVHlwZXNbdGFza1R5cGUudHlwZV0pIHtcblx0XHRcdFx0XHRcdFx0XHRkZWxldGUgdGhpcy50YXNrVHlwZXNbdGFza1R5cGUudHlwZV07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhc2tUeXBlcyA9IGV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgdGFza1R5cGUgb2YgdGFza1R5cGVzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHR5cGUgPSBDb25maWd1cmF0aW9uLmZyb20odGFza1R5cGUsIGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCBleHRlbnNpb24uY29sbGVjdG9yKTtcblx0XHRcdFx0XHRcdFx0aWYgKHR5cGUpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRhc2tUeXBlc1t0eXBlLnRhc2tUeXBlXSA9IHR5cGU7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKChkZWx0YS5yZW1vdmVkLmxlbmd0aCA+IDApIHx8IChkZWx0YS5hZGRlZC5sZW5ndGggPiAwKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EZWZpbml0aW9uc0NoYW5nZWQuZmlyZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBvblJlYWR5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnJlYWR5UHJvbWlzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQoa2V5OiBzdHJpbmcpOiBUYXNrcy5JVGFza0RlZmluaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLnRhc2tUeXBlc1trZXldO1xuXHR9XG5cblx0cHVibGljIGFsbCgpOiBUYXNrcy5JVGFza0RlZmluaXRpb25bXSB7XG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKHRoaXMudGFza1R5cGVzKS5tYXAoa2V5ID0+IHRoaXMudGFza1R5cGVzW2tleV0pO1xuXHR9XG5cblx0cHVibGljIGdldEpzb25TY2hlbWEoKTogSUpTT05TY2hlbWEge1xuXHRcdGlmICh0aGlzLl9zY2hlbWEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc2NoZW1hczogSUpTT05TY2hlbWFbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBkZWZpbml0aW9uIG9mIHRoaXMuYWxsKCkpIHtcblx0XHRcdFx0Y29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKGRlZmluaXRpb24ucmVxdWlyZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHNjaGVtYS5yZXF1aXJlZCA9IGRlZmluaXRpb24ucmVxdWlyZWQuc2xpY2UoMCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGRlZmluaXRpb24ucHJvcGVydGllcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0c2NoZW1hLnByb3BlcnRpZXMgPSBPYmplY3RzLmRlZXBDbG9uZShkZWZpbml0aW9uLnByb3BlcnRpZXMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNjaGVtYS5wcm9wZXJ0aWVzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzY2hlbWEucHJvcGVydGllcyEudHlwZSA9IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbZGVmaW5pdGlvbi50YXNrVHlwZV1cblx0XHRcdFx0fTtcblx0XHRcdFx0c2NoZW1hcy5wdXNoKHNjaGVtYSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zY2hlbWEgPSB7IG9uZU9mOiBzY2hlbWFzIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zY2hlbWE7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IFRhc2tEZWZpbml0aW9uUmVnaXN0cnk6IElUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5ID0gbmV3IFRhc2tEZWZpbml0aW9uUmVnaXN0cnlJbXBsKCk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFHckIsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksYUFBYTtBQUV6QixTQUFTLDBCQUFxRDtBQUk5RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQXNCO0FBRy9CLE1BQU0sdUJBQW9DO0FBQUEsRUFDekMsTUFBTTtBQUFBLEVBQ04sc0JBQXNCO0FBQUEsRUFDdEIsWUFBWTtBQUFBLElBQ1gsTUFBTTtBQUFBLE1BQ0wsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsOEJBQThCLG1HQUFxRztBQUFBLElBQzlKO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixxQkFBcUIsSUFBSSxTQUFTLDJCQUEyQixxTkFBcU47QUFBQSxNQUNsUixPQUFPO0FBQUEsUUFDTixNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFlBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLDZCQUE2Qix3Q0FBd0M7QUFBQSxNQUMvRixzQkFBc0I7QUFBQSxRQUNyQixNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLE1BQU07QUFBQSxNQUNMLE1BQU07QUFBQSxNQUNOLHFCQUFxQixJQUFJLFNBQVMsdUJBQXVCLDBVQUEwVTtBQUFBLE1BQ25ZLFNBQVM7QUFBQSxJQUNWO0FBQUEsRUFDRDtBQUNEO0FB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
