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
import { Emitter, Event } from "../../../../base/common/event.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { codeActionCommandId, refactorCommandId, sourceActionCommandId } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind } from "../../../../editor/contrib/codeAction/common/types.js";
import * as nls from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const createCodeActionsAutoSave = (description) => {
  return {
    type: "string",
    enum: ["always", "explicit", "never", true, false],
    enumDescriptions: [
      nls.localize("alwaysSave", "Triggers Code Actions on explicit saves and auto saves triggered by window or focus changes."),
      nls.localize("explicitSave", "Triggers Code Actions only when explicitly saved"),
      nls.localize("neverSave", "Never triggers Code Actions on save"),
      nls.localize("explicitSaveBoolean", 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "explicit".'),
      nls.localize("neverSaveBoolean", 'Never triggers Code Actions on save. This value will be deprecated in favor of "never".')
    ],
    default: "explicit",
    description
  };
};
const createNotebookCodeActionsAutoSave = (description) => {
  return {
    type: ["string", "boolean"],
    enum: ["explicit", "never", true, false],
    enumDescriptions: [
      nls.localize("explicit", "Triggers Code Actions only when explicitly saved."),
      nls.localize("never", "Never triggers Code Actions on save."),
      nls.localize("explicitBoolean", 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "explicit".'),
      nls.localize("neverBoolean", 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "never".')
    ],
    default: "explicit",
    description
  };
};
const codeActionsOnSaveSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: {
        type: "string"
      }
    },
    {
      type: "array",
      items: { type: "string" }
    }
  ],
  markdownDescription: nls.localize("editor.codeActionsOnSave", 'Run Code Actions for the editor on save. Code Actions must be specified and the editor must not be shutting down. When {0} is set to `afterDelay`, Code Actions will only be run when the file is saved explicitly. Example: `"source.organizeImports": "explicit" `', "`#files.autoSave#`"),
  type: ["object", "array"],
  additionalProperties: {
    type: "string",
    enum: ["always", "explicit", "never", true, false]
  },
  default: {},
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
};
const editorConfiguration = Object.freeze({
  ...editorConfigurationBaseNode,
  properties: {
    "editor.codeActionsOnSave": codeActionsOnSaveSchema
  }
});
const notebookCodeActionsOnSaveSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: {
        type: "string"
      }
    },
    {
      type: "array",
      items: { type: "string" }
    }
  ],
  markdownDescription: nls.localize("notebook.codeActionsOnSave", 'Run a series of Code Actions for a notebook on save. Code Actions must be specified and the editor must not be shutting down. When {0} is set to `afterDelay`, Code Actions will only be run when the file is saved explicitly. Example: `"notebook.source.organizeImports": "explicit"`', "`#files.autoSave#`"),
  type: "object",
  additionalProperties: {
    type: ["string", "boolean"],
    enum: ["explicit", "never", true, false]
    // enum: ['explicit', 'always', 'never'], -- autosave support needs to be built first
    // nls.localize('always', 'Always triggers Code Actions on save, including autosave, focus, and window change events.'),
  },
  default: {}
};
const notebookEditorConfiguration = Object.freeze({
  ...editorConfigurationBaseNode,
  properties: {
    "notebook.codeActionsOnSave": notebookCodeActionsOnSaveSchema
  }
});
let CodeActionsContribution = class extends Disposable {
  constructor(keybindingService, languageFeatures) {
    super();
    this.languageFeatures = languageFeatures;
    this._onDidChangeSchemaContributions = this._register(new Emitter());
    this._allProvidedCodeActionKinds = [];
    this._register(
      Event.runAndSubscribe(
        Event.debounce(languageFeatures.codeActionProvider.onDidChange, () => {
        }, 1e3),
        () => {
          this._allProvidedCodeActionKinds = this.getAllProvidedCodeActionKinds();
          this.updateConfigurationSchema(this._allProvidedCodeActionKinds);
          this._onDidChangeSchemaContributions.fire();
        }
      )
    );
    this._register(keybindingService.registerSchemaContribution({
      getSchemaAdditions: () => this.getKeybindingSchemaAdditions(),
      onDidChange: this._onDidChangeSchemaContributions.event
    }));
  }
  getAllProvidedCodeActionKinds() {
    const out = /* @__PURE__ */ new Map();
    for (const provider of this.languageFeatures.codeActionProvider.allNoModel()) {
      for (const kind of provider.providedCodeActionKinds ?? []) {
        out.set(kind, new HierarchicalKind(kind));
      }
    }
    return Array.from(out.values());
  }
  updateConfigurationSchema(allProvidedKinds) {
    const properties = { ...codeActionsOnSaveSchema.properties };
    const notebookProperties = { ...notebookCodeActionsOnSaveSchema.properties };
    for (const codeActionKind of allProvidedKinds) {
      if (CodeActionKind.Source.contains(codeActionKind) && !properties[codeActionKind.value]) {
        properties[codeActionKind.value] = createCodeActionsAutoSave(nls.localize("codeActionsOnSave.generic", "Controls whether '{0}' actions should be run on file save.", codeActionKind.value));
        notebookProperties[codeActionKind.value] = createNotebookCodeActionsAutoSave(nls.localize("codeActionsOnSave.generic", "Controls whether '{0}' actions should be run on file save.", codeActionKind.value));
      }
    }
    codeActionsOnSaveSchema.properties = properties;
    notebookCodeActionsOnSaveSchema.properties = notebookProperties;
    Registry.as(Extensions.Configuration).notifyConfigurationSchemaUpdated(editorConfiguration);
  }
  getKeybindingSchemaAdditions() {
    const conditionalSchema = (command, kinds) => {
      return {
        if: {
          required: ["command"],
          properties: {
            "command": { const: command }
          }
        },
        then: {
          properties: {
            "args": {
              required: ["kind"],
              properties: {
                "kind": {
                  anyOf: [
                    { enum: Array.from(kinds) },
                    { type: "string" }
                  ]
                }
              }
            }
          }
        }
      };
    };
    const filterProvidedKinds = (ofKind) => {
      const out = /* @__PURE__ */ new Set();
      for (const providedKind of this._allProvidedCodeActionKinds) {
        if (ofKind.contains(providedKind)) {
          out.add(providedKind.value);
        }
      }
      return Array.from(out);
    };
    return [
      conditionalSchema(codeActionCommandId, filterProvidedKinds(HierarchicalKind.Empty)),
      conditionalSchema(refactorCommandId, filterProvidedKinds(CodeActionKind.Refactor)),
      conditionalSchema(sourceActionCommandId, filterProvidedKinds(CodeActionKind.Source))
    ];
  }
};
CodeActionsContribution = __decorateClass([
  __decorateParam(0, IKeybindingService),
  __decorateParam(1, ILanguageFeaturesService)
], CodeActionsContribution);
export {
  CodeActionsContribution,
  editorConfiguration,
  notebookEditorConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVBY3Rpb25zXFxicm93c2VyXFxjb2RlQWN0aW9uc0NvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSGllcmFyY2hpY2FsS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hpZXJhcmNoaWNhbEtpbmQuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEsIElKU09OU2NoZW1hTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IGNvZGVBY3Rpb25Db21tYW5kSWQsIHJlZmFjdG9yQ29tbWFuZElkLCBzb3VyY2VBY3Rpb25Db21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2Jyb3dzZXIvY29kZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk5vZGUsIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuXG5jb25zdCBjcmVhdGVDb2RlQWN0aW9uc0F1dG9TYXZlID0gKGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBJSlNPTlNjaGVtYSA9PiB7XG5cdHJldHVybiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydhbHdheXMnLCAnZXhwbGljaXQnLCAnbmV2ZXInLCB0cnVlLCBmYWxzZV0sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdhbHdheXNTYXZlJywgJ1RyaWdnZXJzIENvZGUgQWN0aW9ucyBvbiBleHBsaWNpdCBzYXZlcyBhbmQgYXV0byBzYXZlcyB0cmlnZ2VyZWQgYnkgd2luZG93IG9yIGZvY3VzIGNoYW5nZXMuJyksXG5cdFx0XHRubHMubG9jYWxpemUoJ2V4cGxpY2l0U2F2ZScsICdUcmlnZ2VycyBDb2RlIEFjdGlvbnMgb25seSB3aGVuIGV4cGxpY2l0bHkgc2F2ZWQnKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnbmV2ZXJTYXZlJywgJ05ldmVyIHRyaWdnZXJzIENvZGUgQWN0aW9ucyBvbiBzYXZlJyksXG5cdFx0XHRubHMubG9jYWxpemUoJ2V4cGxpY2l0U2F2ZUJvb2xlYW4nLCAnVHJpZ2dlcnMgQ29kZSBBY3Rpb25zIG9ubHkgd2hlbiBleHBsaWNpdGx5IHNhdmVkLiBUaGlzIHZhbHVlIHdpbGwgYmUgZGVwcmVjYXRlZCBpbiBmYXZvciBvZiBcImV4cGxpY2l0XCIuJyksXG5cdFx0XHRubHMubG9jYWxpemUoJ25ldmVyU2F2ZUJvb2xlYW4nLCAnTmV2ZXIgdHJpZ2dlcnMgQ29kZSBBY3Rpb25zIG9uIHNhdmUuIFRoaXMgdmFsdWUgd2lsbCBiZSBkZXByZWNhdGVkIGluIGZhdm9yIG9mIFwibmV2ZXJcIi4nKVxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2V4cGxpY2l0Jyxcblx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25cblx0fTtcbn07XG5cbmNvbnN0IGNyZWF0ZU5vdGVib29rQ29kZUFjdGlvbnNBdXRvU2F2ZSA9IChkZXNjcmlwdGlvbjogc3RyaW5nKTogSUpTT05TY2hlbWEgPT4ge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6IFsnc3RyaW5nJywgJ2Jvb2xlYW4nXSxcblx0XHRlbnVtOiBbJ2V4cGxpY2l0JywgJ25ldmVyJywgdHJ1ZSwgZmFsc2VdLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnZXhwbGljaXQnLCAnVHJpZ2dlcnMgQ29kZSBBY3Rpb25zIG9ubHkgd2hlbiBleHBsaWNpdGx5IHNhdmVkLicpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCduZXZlcicsICdOZXZlciB0cmlnZ2VycyBDb2RlIEFjdGlvbnMgb24gc2F2ZS4nKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnZXhwbGljaXRCb29sZWFuJywgJ1RyaWdnZXJzIENvZGUgQWN0aW9ucyBvbmx5IHdoZW4gZXhwbGljaXRseSBzYXZlZC4gVGhpcyB2YWx1ZSB3aWxsIGJlIGRlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgXCJleHBsaWNpdFwiLicpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCduZXZlckJvb2xlYW4nLCAnVHJpZ2dlcnMgQ29kZSBBY3Rpb25zIG9ubHkgd2hlbiBleHBsaWNpdGx5IHNhdmVkLiBUaGlzIHZhbHVlIHdpbGwgYmUgZGVwcmVjYXRlZCBpbiBmYXZvciBvZiBcIm5ldmVyXCIuJylcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdleHBsaWNpdCcsXG5cdFx0ZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uXG5cdH07XG59O1xuXG5cbmNvbnN0IGNvZGVBY3Rpb25zT25TYXZlU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHRvbmVPZjogW1xuXHRcdHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0fSxcblx0XHR7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfVxuXHRcdH1cblx0XSxcblx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuY29kZUFjdGlvbnNPblNhdmUnLCAnUnVuIENvZGUgQWN0aW9ucyBmb3IgdGhlIGVkaXRvciBvbiBzYXZlLiBDb2RlIEFjdGlvbnMgbXVzdCBiZSBzcGVjaWZpZWQgYW5kIHRoZSBlZGl0b3IgbXVzdCBub3QgYmUgc2h1dHRpbmcgZG93bi4gV2hlbiB7MH0gaXMgc2V0IHRvIGBhZnRlckRlbGF5YCwgQ29kZSBBY3Rpb25zIHdpbGwgb25seSBiZSBydW4gd2hlbiB0aGUgZmlsZSBpcyBzYXZlZCBleHBsaWNpdGx5LiBFeGFtcGxlOiBgXCJzb3VyY2Uub3JnYW5pemVJbXBvcnRzXCI6IFwiZXhwbGljaXRcIiBgJywgJ2AjZmlsZXMuYXV0b1NhdmUjYCcpLFxuXHR0eXBlOiBbJ29iamVjdCcsICdhcnJheSddLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnYWx3YXlzJywgJ2V4cGxpY2l0JywgJ25ldmVyJywgdHJ1ZSwgZmFsc2VdLFxuXHR9LFxuXHRkZWZhdWx0OiB7fSxcblx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcbn07XG5cbmV4cG9ydCBjb25zdCBlZGl0b3JDb25maWd1cmF0aW9uID0gT2JqZWN0LmZyZWV6ZTxJQ29uZmlndXJhdGlvbk5vZGU+KHtcblx0Li4uZWRpdG9yQ29uZmlndXJhdGlvbkJhc2VOb2RlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0J2VkaXRvci5jb2RlQWN0aW9uc09uU2F2ZSc6IGNvZGVBY3Rpb25zT25TYXZlU2NoZW1hXG5cdH1cbn0pO1xuXG5jb25zdCBub3RlYm9va0NvZGVBY3Rpb25zT25TYXZlU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHRvbmVPZjogW1xuXHRcdHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0fSxcblx0XHR7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfVxuXHRcdH1cblx0XSxcblx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdub3RlYm9vay5jb2RlQWN0aW9uc09uU2F2ZScsICdSdW4gYSBzZXJpZXMgb2YgQ29kZSBBY3Rpb25zIGZvciBhIG5vdGVib29rIG9uIHNhdmUuIENvZGUgQWN0aW9ucyBtdXN0IGJlIHNwZWNpZmllZCBhbmQgdGhlIGVkaXRvciBtdXN0IG5vdCBiZSBzaHV0dGluZyBkb3duLiBXaGVuIHswfSBpcyBzZXQgdG8gYGFmdGVyRGVsYXlgLCBDb2RlIEFjdGlvbnMgd2lsbCBvbmx5IGJlIHJ1biB3aGVuIHRoZSBmaWxlIGlzIHNhdmVkIGV4cGxpY2l0bHkuIEV4YW1wbGU6IGBcIm5vdGVib29rLnNvdXJjZS5vcmdhbml6ZUltcG9ydHNcIjogXCJleHBsaWNpdFwiYCcsICdgI2ZpbGVzLmF1dG9TYXZlI2AnKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0dHlwZTogWydzdHJpbmcnLCAnYm9vbGVhbiddLFxuXHRcdGVudW06IFsnZXhwbGljaXQnLCAnbmV2ZXInLCB0cnVlLCBmYWxzZV0sXG5cdFx0Ly8gZW51bTogWydleHBsaWNpdCcsICdhbHdheXMnLCAnbmV2ZXInXSwgLS0gYXV0b3NhdmUgc3VwcG9ydCBuZWVkcyB0byBiZSBidWlsdCBmaXJzdFxuXHRcdC8vIG5scy5sb2NhbGl6ZSgnYWx3YXlzJywgJ0Fsd2F5cyB0cmlnZ2VycyBDb2RlIEFjdGlvbnMgb24gc2F2ZSwgaW5jbHVkaW5nIGF1dG9zYXZlLCBmb2N1cywgYW5kIHdpbmRvdyBjaGFuZ2UgZXZlbnRzLicpLFxuXHR9LFxuXHRkZWZhdWx0OiB7fVxufTtcblxuZXhwb3J0IGNvbnN0IG5vdGVib29rRWRpdG9yQ29uZmlndXJhdGlvbiA9IE9iamVjdC5mcmVlemU8SUNvbmZpZ3VyYXRpb25Ob2RlPih7XG5cdC4uLmVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSxcblx0cHJvcGVydGllczoge1xuXHRcdCdub3RlYm9vay5jb2RlQWN0aW9uc09uU2F2ZSc6IG5vdGVib29rQ29kZUFjdGlvbnNPblNhdmVTY2hlbWFcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBDb2RlQWN0aW9uc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNjaGVtYUNvbnRyaWJ1dGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRwcml2YXRlIF9hbGxQcm92aWRlZENvZGVBY3Rpb25LaW5kczogSGllcmFyY2hpY2FsS2luZFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFRPRE86IEBqdXN0c2NoZW4gY2FjaGluZyBvZiBjb2RlIGFjdGlvbnMgYmFzZWQgb24gZXh0ZW5zaW9ucyBsb2FkZWQ6IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTYwMTlcblx0XHR0aGlzLl9yZWdpc3Rlcihcblx0XHRcdEV2ZW50LnJ1bkFuZFN1YnNjcmliZShcblx0XHRcdFx0RXZlbnQuZGVib3VuY2UobGFuZ3VhZ2VGZWF0dXJlcy5jb2RlQWN0aW9uUHJvdmlkZXIub25EaWRDaGFuZ2UsICgpID0+IHsgfSwgMTAwMCksXG5cdFx0XHRcdCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9hbGxQcm92aWRlZENvZGVBY3Rpb25LaW5kcyA9IHRoaXMuZ2V0QWxsUHJvdmlkZWRDb2RlQWN0aW9uS2luZHMoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb25TY2hlbWEodGhpcy5fYWxsUHJvdmlkZWRDb2RlQWN0aW9uS2luZHMpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2NoZW1hQ29udHJpYnV0aW9ucy5maXJlKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGtleWJpbmRpbmdTZXJ2aWNlLnJlZ2lzdGVyU2NoZW1hQ29udHJpYnV0aW9uKHtcblx0XHRcdGdldFNjaGVtYUFkZGl0aW9uczogKCkgPT4gdGhpcy5nZXRLZXliaW5kaW5nU2NoZW1hQWRkaXRpb25zKCksXG5cdFx0XHRvbkRpZENoYW5nZTogdGhpcy5fb25EaWRDaGFuZ2VTY2hlbWFDb250cmlidXRpb25zLmV2ZW50LFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QWxsUHJvdmlkZWRDb2RlQWN0aW9uS2luZHMoKTogQXJyYXk8SGllcmFyY2hpY2FsS2luZD4ge1xuXHRcdGNvbnN0IG91dCA9IG5ldyBNYXA8c3RyaW5nLCBIaWVyYXJjaGljYWxLaW5kPigpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5sYW5ndWFnZUZlYXR1cmVzLmNvZGVBY3Rpb25Qcm92aWRlci5hbGxOb01vZGVsKCkpIHtcblx0XHRcdGZvciAoY29uc3Qga2luZCBvZiBwcm92aWRlci5wcm92aWRlZENvZGVBY3Rpb25LaW5kcyA/PyBbXSkge1xuXHRcdFx0XHRvdXQuc2V0KGtpbmQsIG5ldyBIaWVyYXJjaGljYWxLaW5kKGtpbmQpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIEFycmF5LmZyb20ob3V0LnZhbHVlcygpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvblNjaGVtYShhbGxQcm92aWRlZEtpbmRzOiBJdGVyYWJsZTxIaWVyYXJjaGljYWxLaW5kPik6IHZvaWQge1xuXHRcdGNvbnN0IHByb3BlcnRpZXM6IElKU09OU2NoZW1hTWFwID0geyAuLi5jb2RlQWN0aW9uc09uU2F2ZVNjaGVtYS5wcm9wZXJ0aWVzIH07XG5cdFx0Y29uc3Qgbm90ZWJvb2tQcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCA9IHsgLi4ubm90ZWJvb2tDb2RlQWN0aW9uc09uU2F2ZVNjaGVtYS5wcm9wZXJ0aWVzIH07XG5cdFx0Zm9yIChjb25zdCBjb2RlQWN0aW9uS2luZCBvZiBhbGxQcm92aWRlZEtpbmRzKSB7XG5cdFx0XHRpZiAoQ29kZUFjdGlvbktpbmQuU291cmNlLmNvbnRhaW5zKGNvZGVBY3Rpb25LaW5kKSAmJiAhcHJvcGVydGllc1tjb2RlQWN0aW9uS2luZC52YWx1ZV0pIHtcblx0XHRcdFx0cHJvcGVydGllc1tjb2RlQWN0aW9uS2luZC52YWx1ZV0gPSBjcmVhdGVDb2RlQWN0aW9uc0F1dG9TYXZlKG5scy5sb2NhbGl6ZSgnY29kZUFjdGlvbnNPblNhdmUuZ2VuZXJpYycsIFwiQ29udHJvbHMgd2hldGhlciAnezB9JyBhY3Rpb25zIHNob3VsZCBiZSBydW4gb24gZmlsZSBzYXZlLlwiLCBjb2RlQWN0aW9uS2luZC52YWx1ZSkpO1xuXHRcdFx0XHRub3RlYm9va1Byb3BlcnRpZXNbY29kZUFjdGlvbktpbmQudmFsdWVdID0gY3JlYXRlTm90ZWJvb2tDb2RlQWN0aW9uc0F1dG9TYXZlKG5scy5sb2NhbGl6ZSgnY29kZUFjdGlvbnNPblNhdmUuZ2VuZXJpYycsIFwiQ29udHJvbHMgd2hldGhlciAnezB9JyBhY3Rpb25zIHNob3VsZCBiZSBydW4gb24gZmlsZSBzYXZlLlwiLCBjb2RlQWN0aW9uS2luZC52YWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb2RlQWN0aW9uc09uU2F2ZVNjaGVtYS5wcm9wZXJ0aWVzID0gcHJvcGVydGllcztcblx0XHRub3RlYm9va0NvZGVBY3Rpb25zT25TYXZlU2NoZW1hLnByb3BlcnRpZXMgPSBub3RlYm9va1Byb3BlcnRpZXM7XG5cblx0XHRSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pXG5cdFx0XHQubm90aWZ5Q29uZmlndXJhdGlvblNjaGVtYVVwZGF0ZWQoZWRpdG9yQ29uZmlndXJhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmdTY2hlbWFBZGRpdGlvbnMoKTogSUpTT05TY2hlbWFbXSB7XG5cdFx0Y29uc3QgY29uZGl0aW9uYWxTY2hlbWEgPSAoY29tbWFuZDogc3RyaW5nLCBraW5kczogcmVhZG9ubHkgc3RyaW5nW10pOiBJSlNPTlNjaGVtYSA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZjoge1xuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2NvbW1hbmQnXSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6IHsgY29uc3Q6IGNvbW1hbmQgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0dGhlbjoge1xuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdCdhcmdzJzoge1xuXHRcdFx0XHRcdFx0XHRyZXF1aXJlZDogWydraW5kJ10sXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHQna2luZCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHsgZW51bTogQXJyYXkuZnJvbShraW5kcykgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZmlsdGVyUHJvdmlkZWRLaW5kcyA9IChvZktpbmQ6IEhpZXJhcmNoaWNhbEtpbmQpOiBzdHJpbmdbXSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgcHJvdmlkZWRLaW5kIG9mIHRoaXMuX2FsbFByb3ZpZGVkQ29kZUFjdGlvbktpbmRzKSB7XG5cdFx0XHRcdGlmIChvZktpbmQuY29udGFpbnMocHJvdmlkZWRLaW5kKSkge1xuXHRcdFx0XHRcdG91dC5hZGQocHJvdmlkZWRLaW5kLnZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIEFycmF5LmZyb20ob3V0KTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIFtcblx0XHRcdGNvbmRpdGlvbmFsU2NoZW1hKGNvZGVBY3Rpb25Db21tYW5kSWQsIGZpbHRlclByb3ZpZGVkS2luZHMoSGllcmFyY2hpY2FsS2luZC5FbXB0eSkpLFxuXHRcdFx0Y29uZGl0aW9uYWxTY2hlbWEocmVmYWN0b3JDb21tYW5kSWQsIGZpbHRlclByb3ZpZGVkS2luZHMoQ29kZUFjdGlvbktpbmQuUmVmYWN0b3IpKSxcblx0XHRcdGNvbmRpdGlvbmFsU2NoZW1hKHNvdXJjZUFjdGlvbkNvbW1hbmRJZCwgZmlsdGVyUHJvdmlkZWRLaW5kcyhDb2RlQWN0aW9uS2luZC5Tb3VyY2UpKSxcblx0XHRdO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCLG1CQUFtQiw2QkFBNkI7QUFDOUUsU0FBUyxzQkFBc0I7QUFDL0IsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsb0JBQW9CLGtCQUE0RjtBQUN6SCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQjtBQUd6QixNQUFNLDRCQUE0QixDQUFDLGdCQUFxQztBQUN2RSxTQUFPO0FBQUEs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
