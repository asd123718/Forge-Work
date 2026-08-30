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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService, MODAL_GROUP } from "../../../services/editor/common/editorService.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { equals } from "../../../../base/common/objects.js";
import { visit } from "../../../../base/common/json.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { ILanguageModelsConfigurationService } from "../common/languageModelsConfiguration.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ILanguageModelsService } from "../common/languageModels.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../common/editor.js";
let LanguageModelsConfigurationService = class extends Disposable {
  constructor(fileService, textFileService, textModelService, editorService, editorGroupsService, userDataProfileService, uriIdentityService) {
    super();
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.textModelService = textModelService;
    this.editorService = editorService;
    this.editorGroupsService = editorGroupsService;
    this._onDidChangeLanguageModelGroups = this._register(new Emitter());
    this.onDidChangeLanguageModelGroups = this._onDidChangeLanguageModelGroups.event;
    this.languageModelsProviderGroups = [];
    this.modelsConfigurationFile = userDataProfileService.currentProfile.languageModelsResource;
    this._whenReady = this.updateLanguageModelsConfiguration().catch(() => {
    });
    this._register(fileService.watch(uriIdentityService.extUri.dirname(this.modelsConfigurationFile)));
    this._register(fileService.onDidFilesChange((e) => {
      if (e.contains(this.modelsConfigurationFile)) {
        this.updateLanguageModelsConfiguration();
      }
    }));
  }
  get configurationFile() {
    return this.modelsConfigurationFile;
  }
  get whenReady() {
    return this._whenReady;
  }
  setLanguageModelsConfiguration(languageModelsConfiguration) {
    const changedGroups = [];
    const oldGroupMap = new Map(this.languageModelsProviderGroups.map((g) => [`${g.vendor}:${g.name}`, g]));
    const newGroupMap = new Map(languageModelsConfiguration.map((g) => [`${g.vendor}:${g.name}`, g]));
    for (const [key, newGroup] of newGroupMap) {
      const oldGroup = oldGroupMap.get(key);
      if (!oldGroup || !equals(oldGroup, newGroup)) {
        changedGroups.push(newGroup);
      }
    }
    for (const [key, oldGroup] of oldGroupMap) {
      if (!newGroupMap.has(key)) {
        changedGroups.push(oldGroup);
      }
    }
    this.languageModelsProviderGroups = languageModelsConfiguration;
    if (changedGroups.length > 0) {
      this._onDidChangeLanguageModelGroups.fire(changedGroups);
    }
  }
  async updateLanguageModelsConfiguration() {
    const languageModelsProviderGroups = await this.withLanguageModelsProviderGroups();
    this.setLanguageModelsConfiguration(languageModelsProviderGroups);
  }
  getLanguageModelsProviderGroups() {
    return this.languageModelsProviderGroups;
  }
  async addLanguageModelsProviderGroup(toAdd) {
    await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
      if (languageModelsProviderGroups.some(({ name, vendor }) => name === toAdd.name && vendor === toAdd.vendor)) {
        throw new Error(`Language model group with name ${toAdd.name} already exists for vendor ${toAdd.vendor}`);
      }
      languageModelsProviderGroups.push(toAdd);
      return languageModelsProviderGroups;
    });
    await this.updateLanguageModelsConfiguration();
    const result = this.getLanguageModelsProviderGroups().find((group) => group.name === toAdd.name && group.vendor === toAdd.vendor);
    if (!result) {
      throw new Error(`Language model group with name ${toAdd.name} not found for vendor ${toAdd.vendor}`);
    }
    return result;
  }
  async updateLanguageModelsProviderGroup(from, to) {
    await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
      const result2 = [];
      for (const group of languageModelsProviderGroups) {
        if (group.name === from.name && group.vendor === from.vendor) {
          result2.push(to);
        } else {
          result2.push(group);
        }
      }
      return result2;
    });
    await this.updateLanguageModelsConfiguration();
    const result = this.getLanguageModelsProviderGroups().find((group) => group.name === to.name && group.vendor === to.vendor);
    if (!result) {
      throw new Error(`Language model group with name ${to.name} not found for vendor ${to.vendor}`);
    }
    return result;
  }
  async removeLanguageModelsProviderGroup(toRemove) {
    await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
      const result = [];
      for (const group of languageModelsProviderGroups) {
        if (group.name === toRemove.name && group.vendor === toRemove.vendor) {
          continue;
        }
        result.push(group);
      }
      return result;
    });
    await this.updateLanguageModelsConfiguration();
  }
  async configureLanguageModels(options) {
    const preferredGroup = this.editorGroupsService.getPart(this.editorGroupsService.activeGroup) === this.editorGroupsService.activeModalEditorPart ? MODAL_GROUP : void 0;
    const editor = await this.editorService.openEditor({
      resource: this.modelsConfigurationFile,
      options: { override: DEFAULT_EDITOR_ASSOCIATION.id }
    }, preferredGroup);
    if (!editor || !options?.group) {
      return;
    }
    const codeEditor = getCodeEditor(editor.getControl());
    if (!codeEditor) {
      return;
    }
    if (options.snippet) {
      const model = codeEditor.getModel();
      if (!model) {
        return;
      }
      const targetRange = options.snippetTarget === "models" ? options.group.modelsRange : options.group.range;
      if (!targetRange) {
        return;
      }
      const models = options.group.models;
      const isModelsArray = options.snippetTarget === "models" && Array.isArray(models);
      const emptyModelsArray = isModelsArray && models.length === 0;
      const insertBeforeModelsArrayEnd = emptyModelsArray || isModelsArray && targetRange.startLineNumber === targetRange.endLineNumber;
      const lastPropertyLine = targetRange.endLineNumber - 1;
      const insertPosition = insertBeforeModelsArrayEnd ? {
        lineNumber: targetRange.endLineNumber,
        column: targetRange.endColumn - 1
      } : {
        lineNumber: lastPropertyLine,
        column: model.getLineLength(lastPropertyLine) + 1
      };
      codeEditor.setPosition(insertPosition);
      codeEditor.revealPositionNearTop(insertPosition);
      codeEditor.focus();
      SnippetController2.get(codeEditor)?.insert(emptyModelsArray ? options.snippet : ",\n" + options.snippet);
    } else {
      if (!options.group.range) {
        return;
      }
      const position = { lineNumber: options.group.range.startLineNumber, column: options.group.range.startColumn };
      codeEditor.setPosition(position);
      codeEditor.revealPositionNearTop(position);
      codeEditor.focus();
    }
  }
  async withLanguageModelsProviderGroups(update) {
    const exists = await this.fileService.exists(this.modelsConfigurationFile);
    if (!exists) {
      await this.fileService.writeFile(this.modelsConfigurationFile, VSBuffer.fromString(JSON.stringify([], void 0, "	")));
    }
    const ref = await this.textModelService.createModelReference(this.modelsConfigurationFile);
    const model = ref.object.textEditorModel;
    try {
      const languageModelsProviderGroups = parseLanguageModelsProviderGroups(model);
      if (!update) {
        return languageModelsProviderGroups;
      }
      const updatedLanguageModelsProviderGroups = await update(languageModelsProviderGroups);
      for (const group of updatedLanguageModelsProviderGroups) {
        delete group.range;
        delete group.modelsRange;
      }
      model.setValue(JSON.stringify(updatedLanguageModelsProviderGroups, void 0, "	"));
      await this.textFileService.save(this.modelsConfigurationFile);
      return updatedLanguageModelsProviderGroups;
    } finally {
      ref.dispose();
    }
  }
};
LanguageModelsConfigurationService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IUserDataProfileService),
  __decorateParam(6, IUriIdentityService)
], LanguageModelsConfigurationService);
function parseLanguageModelsProviderGroups(model) {
  const configuration = [];
  let currentProperty = null;
  let currentParent = configuration;
  const previousParents = [];
  function onValue(value, offset, length) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty !== null) {
      currentParent[currentProperty] = value;
    }
  }
  const visitor = {
    onObjectBegin: (offset, length) => {
      const object = {};
      if (previousParents.length === 1 && Array.isArray(currentParent)) {
        const start = model.getPositionAt(offset);
        const end = model.getPositionAt(offset + length);
        object.range = {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        };
      }
      onValue(object, offset, length);
      previousParents.push(currentParent);
      currentParent = object;
      currentProperty = null;
    },
    onObjectProperty: (name, offset, length) => {
      currentProperty = name;
    },
    onObjectEnd: (offset, length) => {
      const parent = currentParent;
      if (parent.range) {
        const end = model.getPositionAt(offset + length);
        parent.range = {
          startLineNumber: parent.range.startLineNumber,
          startColumn: parent.range.startColumn,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        };
      }
      if (parent._parentConfigurationRange) {
        const end = model.getPositionAt(offset + length);
        parent._parentConfigurationRange.endLineNumber = end.lineNumber;
        parent._parentConfigurationRange.endColumn = end.column;
        delete parent._parentConfigurationRange;
      }
      currentParent = previousParents.pop();
    },
    onArrayBegin: (offset, length) => {
      if (currentParent === configuration && previousParents.length === 0) {
        previousParents.push(currentParent);
        currentProperty = null;
        return;
      }
      const array = [];
      const parent = currentParent;
      if (currentProperty === "models" && parent.range) {
        const start = model.getPositionAt(offset);
        const end = model.getPositionAt(offset + length);
        parent.modelsRange = {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        };
        array._parentModelsRange = parent.modelsRange;
      }
      onValue(array, offset, length);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: (offset, length) => {
      const parent = currentParent;
      if (parent._parentConfigurationRange) {
        const end = model.getPositionAt(offset + length);
        parent._parentConfigurationRange.endLineNumber = end.lineNumber;
        parent._parentConfigurationRange.endColumn = end.column;
        delete parent._parentConfigurationRange;
      }
      if (parent._parentModelsRange) {
        const end = model.getPositionAt(offset + length);
        parent._parentModelsRange.endLineNumber = end.lineNumber;
        parent._parentModelsRange.endColumn = end.column;
        delete parent._parentModelsRange;
      }
      currentParent = previousParents.pop();
    },
    onLiteralValue: (value, offset, length) => {
      onValue(value, offset, length);
    }
  };
  visit(model.getValue(), visitor);
  return configuration;
}
const languageModelsSchemaId = "vscode://schemas/language-models";
let ChatLanguageModelsDataContribution = class extends Disposable {
  constructor(languageModelsService, languageModelsConfigurationService) {
    super();
    this.languageModelsService = languageModelsService;
    const registry = Registry.as(JSONExtensions.JSONContribution);
    this._register(registry.registerSchemaAssociation(languageModelsSchemaId, languageModelsConfigurationService.configurationFile.toString()));
    this.updateSchema(registry);
    this._register(this.languageModelsService.onDidChangeLanguageModels(() => this.updateSchema(registry)));
  }
  updateSchema(registry) {
    const vendors = this.languageModelsService.getVendors();
    const modelSchemas = [];
    const modelIds = this.languageModelsService.getLanguageModelIds();
    for (const modelId of modelIds) {
      const metadata = this.languageModelsService.lookupLanguageModel(modelId);
      if (metadata?.configurationSchema) {
        modelSchemas.push({
          if: {
            properties: {
              vendor: { const: metadata.vendor }
            }
          },
          then: {
            properties: {
              settings: {
                type: "object",
                properties: {
                  [metadata.id]: metadata.configurationSchema
                }
              }
            }
          }
        });
      }
    }
    const schema = {
      type: "array",
      items: {
        properties: {
          vendor: {
            type: "string",
            enum: vendors.map((v) => v.vendor)
          },
          name: { type: "string" },
          settings: {
            type: "object",
            description: localize("settings.perModelConfig", "Per-model settings")
          }
        },
        allOf: [
          ...vendors.map((vendor) => ({
            if: {
              properties: {
                vendor: { const: vendor.vendor }
              }
            },
            then: vendor.configuration
          })),
          ...modelSchemas
        ],
        required: ["vendor", "name"]
      }
    };
    registry.registerSchema(languageModelsSchemaId, schema);
  }
};
ChatLanguageModelsDataContribution.ID = "workbench.contrib.chatLanguageModelsData";
ChatLanguageModelsDataContribution = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, ILanguageModelsConfigurationService)
], ChatLanguageModelsDataContribution);
export {
  ChatLanguageModelsDataContribution,
  LanguageModelsConfigurationService,
  parseLanguageModelsProviderGroups
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSwgTU9EQUxfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBKU09OVmlzaXRvciwgdmlzaXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgZ2V0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbnRyb2xsZXIyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRDb250cm9sbGVyMi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVMYW5ndWFnZU1vZGVsc09wdGlvbnMsIElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwIH0gZnJvbSAnLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIEpTT05FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vanNvbnNjaGVtYXMvY29tbW9uL2pzb25Db250cmlidXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcblxudHlwZSBMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0gTXV0YWJsZTxJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwPltdO1xuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtb2RlbHNDb25maWd1cmF0aW9uRmlsZTogVVJJO1xuXHRnZXQgY29uZmlndXJhdGlvbkZpbGUoKTogVVJJIHsgcmV0dXJuIHRoaXMubW9kZWxzQ29uZmlndXJhdGlvbkZpbGU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwW10+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHM6IEV2ZW50PHJlYWRvbmx5IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBbXT4gPSB0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzOiBMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0gW107XG5cblx0LyoqIFJlc29sdmVkIG9uY2UgdGhlIGZpcnN0IGNvbmZpZy1maWxlIGxvYWQgYXR0ZW1wdCBjb21wbGV0ZXM7IGFzc2lnbmVkIGV4YWN0bHkgb25jZSBpbiB0aGUgY3Rvci4gUmVqZWN0aW9ucyBhcmUgc3dhbGxvd2VkIHNvIGNvbnN1bWVycyBjYW4gdHJlYXQgcmVhZGluZXNzIGFzIFwiZmlyc3QgbG9hZCBhdHRlbXB0ZWRcIi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfd2hlblJlYWR5OiBQcm9taXNlPHZvaWQ+O1xuXHRnZXQgd2hlblJlYWR5KCk6IFByb21pc2U8dm9pZD4geyByZXR1cm4gdGhpcy5fd2hlblJlYWR5OyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0RmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm1vZGVsc0NvbmZpZ3VyYXRpb25GaWxlID0gdXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5sYW5ndWFnZU1vZGVsc1Jlc291cmNlO1xuXHRcdHRoaXMuX3doZW5SZWFkeSA9IHRoaXMudXBkYXRlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uKCkuY2F0Y2goKCkgPT4geyAvKiBzd2FsbG93OiByZWFkaW5lc3Mgc2lnbmFscyBcImF0dGVtcHRlZFwiLCBub3QgXCJzdWNjZWVkZWRcIiAqLyB9KTtcblx0XHQvLyBXYXRjaCB0aGUgcGFyZW50IGZvbGRlciBmb3IgcmVsaWFibGUgY2hhbmdlIGRldGVjdGlvbiBhY3Jvc3MgcGxhdGZvcm1zIChlc3BlY2lhbGx5IFdpbmRvd3Ncblx0XHQvLyB3aGVyZSBgZnMud2F0Y2hgIG9uIGluZGl2aWR1YWwgZmlsZXMgY2FuIG1pc3MgaW4tcGxhY2Ugd3JpdGVzKS5cblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS53YXRjaCh1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmRpcm5hbWUodGhpcy5tb2RlbHNDb25maWd1cmF0aW9uRmlsZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihmaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuY29udGFpbnModGhpcy5tb2RlbHNDb25maWd1cmF0aW9uRmlsZSkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHNldExhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbihsYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb246IExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMpOiB2b2lkIHtcblx0XHRjb25zdCBjaGFuZ2VkR3JvdXBzOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwW10gPSBbXTtcblx0XHRjb25zdCBvbGRHcm91cE1hcCA9IG5ldyBNYXAodGhpcy5sYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzLm1hcChnID0+IFtgJHtnLnZlbmRvcn06JHtnLm5hbWV9YCwgZ10pKTtcblx0XHRjb25zdCBuZXdHcm91cE1hcCA9IG5ldyBNYXAobGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uLm1hcChnID0+IFtgJHtnLnZlbmRvcn06JHtnLm5hbWV9YCwgZ10pKTtcblxuXHRcdC8vIEZpbmQgYWRkZWQgb3IgbW9kaWZpZWQgZ3JvdXBzXG5cdFx0Zm9yIChjb25zdCBba2V5LCBuZXdHcm91cF0gb2YgbmV3R3JvdXBNYXApIHtcblx0XHRcdGNvbnN0IG9sZEdyb3VwID0gb2xkR3JvdXBNYXAuZ2V0KGtleSk7XG5cdFx0XHRpZiAoIW9sZEdyb3VwIHx8ICFlcXVhbHMob2xkR3JvdXAsIG5ld0dyb3VwKSkge1xuXHRcdFx0XHRjaGFuZ2VkR3JvdXBzLnB1c2gobmV3R3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZpbmQgcmVtb3ZlZCBncm91cHNcblx0XHRmb3IgKGNvbnN0IFtrZXksIG9sZEdyb3VwXSBvZiBvbGRHcm91cE1hcCkge1xuXHRcdFx0aWYgKCFuZXdHcm91cE1hcC5oYXMoa2V5KSkge1xuXHRcdFx0XHRjaGFuZ2VkR3JvdXBzLnB1c2gob2xkR3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IGxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbjtcblx0XHRpZiAoY2hhbmdlZEdyb3Vwcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxHcm91cHMuZmlyZShjaGFuZ2VkR3JvdXBzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0gYXdhaXQgdGhpcy53aXRoTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpO1xuXHRcdHRoaXMuc2V0TGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uKGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMpO1xuXHR9XG5cblx0Z2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpOiByZWFkb25seSBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwW10ge1xuXHRcdHJldHVybiB0aGlzLmxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHM7XG5cdH1cblxuXHRhc3luYyBhZGRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodG9BZGQ6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXApOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXA+IHtcblx0XHRhd2FpdCB0aGlzLndpdGhMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKGFzeW5jIGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMgPT4ge1xuXHRcdFx0aWYgKGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMuc29tZSgoeyBuYW1lLCB2ZW5kb3IgfSkgPT4gbmFtZSA9PT0gdG9BZGQubmFtZSAmJiB2ZW5kb3IgPT09IHRvQWRkLnZlbmRvcikpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBncm91cCB3aXRoIG5hbWUgJHt0b0FkZC5uYW1lfSBhbHJlYWR5IGV4aXN0cyBmb3IgdmVuZG9yICR7dG9BZGQudmVuZG9yfWApO1xuXHRcdFx0fVxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcy5wdXNoKHRvQWRkKTtcblx0XHRcdHJldHVybiBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKS5maW5kKGdyb3VwID0+IGdyb3VwLm5hbWUgPT09IHRvQWRkLm5hbWUgJiYgZ3JvdXAudmVuZG9yID09PSB0b0FkZC52ZW5kb3IpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExhbmd1YWdlIG1vZGVsIGdyb3VwIHdpdGggbmFtZSAke3RvQWRkLm5hbWV9IG5vdCBmb3VuZCBmb3IgdmVuZG9yICR7dG9BZGQudmVuZG9yfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKGZyb206IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAsIHRvOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKTogUHJvbWlzZTxJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwPiB7XG5cdFx0YXdhaXQgdGhpcy53aXRoTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhhc3luYyBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKSB7XG5cdFx0XHRcdGlmIChncm91cC5uYW1lID09PSBmcm9tLm5hbWUgJiYgZ3JvdXAudmVuZG9yID09PSBmcm9tLnZlbmRvcikge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRvKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChncm91cCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuZ2V0TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcygpLmZpbmQoZ3JvdXAgPT4gZ3JvdXAubmFtZSA9PT0gdG8ubmFtZSAmJiBncm91cC52ZW5kb3IgPT09IHRvLnZlbmRvcik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgZ3JvdXAgd2l0aCBuYW1lICR7dG8ubmFtZX0gbm90IGZvdW5kIGZvciB2ZW5kb3IgJHt0by52ZW5kb3J9YCk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZW1vdmVMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXAodG9SZW1vdmU6IElMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLndpdGhMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKGFzeW5jIGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMpIHtcblx0XHRcdFx0aWYgKGdyb3VwLm5hbWUgPT09IHRvUmVtb3ZlLm5hbWUgJiYgZ3JvdXAudmVuZG9yID09PSB0b1JlbW92ZS52ZW5kb3IpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQucHVzaChncm91cCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHRcdGF3YWl0IHRoaXMudXBkYXRlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uKCk7XG5cdH1cblxuXHRhc3luYyBjb25maWd1cmVMYW5ndWFnZU1vZGVscyhvcHRpb25zPzogQ29uZmlndXJlTGFuZ3VhZ2VNb2RlbHNPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gTWlycm9yIHRoZSBzdXJmYWNlIHRoYXQgdGhlIGNoYXQgbW9kZWxzIGVkaXRvciBpcyBjdXJyZW50bHkgc2hvd24gaW46IGlmXG5cdFx0Ly8gaXQgbGl2ZXMgaW5zaWRlIHRoZSBtb2RhbCBlZGl0b3IgcGFydCwgb3BlbiB0aGUgSlNPTiBpbiB0aGUgbW9kYWwgdG9vO1xuXHRcdC8vIG90aGVyd2lzZSBmYWxsIGJhY2sgdG8gdGhlIGRlZmF1bHQgZ3JvdXAgcmVzb2x1dGlvbiAocmVndWxhciBlZGl0b3IgYXJlYSkuXG5cdFx0Y29uc3QgcHJlZmVycmVkR3JvdXAgPSB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuZ2V0UGFydCh0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlR3JvdXApID09PSB0aGlzLmVkaXRvckdyb3Vwc1NlcnZpY2UuYWN0aXZlTW9kYWxFZGl0b3JQYXJ0ID8gTU9EQUxfR1JPVVAgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2U6IHRoaXMubW9kZWxzQ29uZmlndXJhdGlvbkZpbGUsXG5cdFx0XHRvcHRpb25zOiB7IG92ZXJyaWRlOiBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCB9XG5cdFx0fSwgcHJlZmVycmVkR3JvdXApO1xuXHRcdGlmICghZWRpdG9yIHx8ICFvcHRpb25zPy5ncm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKGVkaXRvci5nZXRDb250cm9sKCkpO1xuXHRcdGlmICghY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLnNuaXBwZXQpIHtcblx0XHRcdC8vIEluc2VydCBzbmlwcGV0IGF0IHRoZSBlbmQgb2YgdGhlIGxhc3QgcHJvcGVydHkgbGluZSAoYmVmb3JlIHRoZSBjbG9zaW5nIGJyYWNlIGxpbmUpLCB3aXRoIGNvbW1hIHByZXBlbmRlZFxuXHRcdFx0Y29uc3QgbW9kZWwgPSBjb2RlRWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRhcmdldFJhbmdlID0gb3B0aW9ucy5zbmlwcGV0VGFyZ2V0ID09PSAnbW9kZWxzJyA/IG9wdGlvbnMuZ3JvdXAubW9kZWxzUmFuZ2UgOiBvcHRpb25zLmdyb3VwLnJhbmdlO1xuXHRcdFx0aWYgKCF0YXJnZXRSYW5nZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBvcHRpb25zLmdyb3VwLm1vZGVscztcblx0XHRcdGNvbnN0IGlzTW9kZWxzQXJyYXkgPSBvcHRpb25zLnNuaXBwZXRUYXJnZXQgPT09ICdtb2RlbHMnICYmIEFycmF5LmlzQXJyYXkobW9kZWxzKTtcblx0XHRcdGNvbnN0IGVtcHR5TW9kZWxzQXJyYXkgPSBpc01vZGVsc0FycmF5ICYmIG1vZGVscy5sZW5ndGggPT09IDA7XG5cdFx0XHRjb25zdCBpbnNlcnRCZWZvcmVNb2RlbHNBcnJheUVuZCA9IGVtcHR5TW9kZWxzQXJyYXkgfHwgKGlzTW9kZWxzQXJyYXkgJiYgdGFyZ2V0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSB0YXJnZXRSYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGxhc3RQcm9wZXJ0eUxpbmUgPSB0YXJnZXRSYW5nZS5lbmRMaW5lTnVtYmVyIC0gMTtcblx0XHRcdGNvbnN0IGluc2VydFBvc2l0aW9uID0gaW5zZXJ0QmVmb3JlTW9kZWxzQXJyYXlFbmQgPyB7XG5cdFx0XHRcdGxpbmVOdW1iZXI6IHRhcmdldFJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdGNvbHVtbjogdGFyZ2V0UmFuZ2UuZW5kQ29sdW1uIC0gMVxuXHRcdFx0fSA6IHtcblx0XHRcdFx0bGluZU51bWJlcjogbGFzdFByb3BlcnR5TGluZSxcblx0XHRcdFx0Y29sdW1uOiBtb2RlbC5nZXRMaW5lTGVuZ3RoKGxhc3RQcm9wZXJ0eUxpbmUpICsgMVxuXHRcdFx0fTtcblx0XHRcdGNvZGVFZGl0b3Iuc2V0UG9zaXRpb24oaW5zZXJ0UG9zaXRpb24pO1xuXHRcdFx0Y29kZUVkaXRvci5yZXZlYWxQb3NpdGlvbk5lYXJUb3AoaW5zZXJ0UG9zaXRpb24pO1xuXHRcdFx0Y29kZUVkaXRvci5mb2N1cygpO1xuXHRcdFx0U25pcHBldENvbnRyb2xsZXIyLmdldChjb2RlRWRpdG9yKT8uaW5zZXJ0KGVtcHR5TW9kZWxzQXJyYXkgPyBvcHRpb25zLnNuaXBwZXQgOiAnLFxcbicgKyBvcHRpb25zLnNuaXBwZXQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoIW9wdGlvbnMuZ3JvdXAucmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB7IGxpbmVOdW1iZXI6IG9wdGlvbnMuZ3JvdXAucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IG9wdGlvbnMuZ3JvdXAucmFuZ2Uuc3RhcnRDb2x1bW4gfTtcblx0XHRcdGNvZGVFZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0Y29kZUVkaXRvci5yZXZlYWxQb3NpdGlvbk5lYXJUb3AocG9zaXRpb24pO1xuXHRcdFx0Y29kZUVkaXRvci5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2l0aExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHModXBkYXRlPzogKGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHM6IExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMpID0+IFByb21pc2U8TGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcz4pOiBQcm9taXNlPExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHM+IHtcblx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLm1vZGVsc0NvbmZpZ3VyYXRpb25GaWxlKTtcblx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodGhpcy5tb2RlbHNDb25maWd1cmF0aW9uRmlsZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShbXSwgdW5kZWZpbmVkLCAnXFx0JykpKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHRoaXMubW9kZWxzQ29uZmlndXJhdGlvbkZpbGUpO1xuXHRcdGNvbnN0IG1vZGVsID0gcmVmLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMgPSBwYXJzZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMobW9kZWwpO1xuXHRcdFx0aWYgKCF1cGRhdGUpIHtcblx0XHRcdFx0cmV0dXJuIGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHM7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1cGRhdGVkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IGF3YWl0IHVwZGF0ZShsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKTtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdXBkYXRlZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMpIHtcblx0XHRcdFx0ZGVsZXRlIGdyb3VwLnJhbmdlO1xuXHRcdFx0XHRkZWxldGUgZ3JvdXAubW9kZWxzUmFuZ2U7XG5cdFx0XHR9XG5cdFx0XHRtb2RlbC5zZXRWYWx1ZShKU09OLnN0cmluZ2lmeSh1cGRhdGVkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcywgdW5kZWZpbmVkLCAnXFx0JykpO1xuXHRcdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2Uuc2F2ZSh0aGlzLm1vZGVsc0NvbmZpZ3VyYXRpb25GaWxlKTtcblx0XHRcdHJldHVybiB1cGRhdGVkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhtb2RlbDogSVRleHRNb2RlbCk6IExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMge1xuXHRjb25zdCBjb25maWd1cmF0aW9uOiBMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0gW107XG5cdGxldCBjdXJyZW50UHJvcGVydHk6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRsZXQgY3VycmVudFBhcmVudDogdW5rbm93biA9IGNvbmZpZ3VyYXRpb247XG5cdGNvbnN0IHByZXZpb3VzUGFyZW50czogdW5rbm93bltdID0gW107XG5cblx0ZnVuY3Rpb24gb25WYWx1ZSh2YWx1ZTogdW5rbm93biwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY3VycmVudFBhcmVudCkpIHtcblx0XHRcdChjdXJyZW50UGFyZW50IGFzIHVua25vd25bXSkucHVzaCh2YWx1ZSk7XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50UHJvcGVydHkgIT09IG51bGwpIHtcblx0XHRcdChjdXJyZW50UGFyZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtjdXJyZW50UHJvcGVydHldID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgdmlzaXRvcjogSlNPTlZpc2l0b3IgPSB7XG5cdFx0b25PYmplY3RCZWdpbjogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3Qgb2JqZWN0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiAmIHsgcmFuZ2U/OiBJUmFuZ2UgfSA9IHt9O1xuXHRcdFx0aWYgKHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IDEgJiYgQXJyYXkuaXNBcnJheShjdXJyZW50UGFyZW50KSkge1xuXHRcdFx0XHRjb25zdCBzdGFydCA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcblx0XHRcdFx0Y29uc3QgZW5kID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyBsZW5ndGgpO1xuXHRcdFx0XHRvYmplY3QucmFuZ2UgPSB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydC5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBzdGFydC5jb2x1bW4sXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBlbmQuY29sdW1uXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRvblZhbHVlKG9iamVjdCwgb2Zmc2V0LCBsZW5ndGgpO1xuXHRcdFx0cHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gb2JqZWN0O1xuXHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbnVsbDtcblx0XHR9LFxuXHRcdG9uT2JqZWN0UHJvcGVydHk6IChuYW1lOiBzdHJpbmcsIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbmFtZTtcblx0XHR9LFxuXHRcdG9uT2JqZWN0RW5kOiAob2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBjdXJyZW50UGFyZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+ICYgeyByYW5nZT86IElSYW5nZTsgX3BhcmVudENvbmZpZ3VyYXRpb25SYW5nZT86IE11dGFibGU8SVJhbmdlPiB9O1xuXHRcdFx0aWYgKHBhcmVudC5yYW5nZSkge1xuXHRcdFx0XHRjb25zdCBlbmQgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdHBhcmVudC5yYW5nZSA9IHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHBhcmVudC5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHBhcmVudC5yYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBlbmQubGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IGVuZC5jb2x1bW5cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJlbnQuX3BhcmVudENvbmZpZ3VyYXRpb25SYW5nZSkge1xuXHRcdFx0XHRjb25zdCBlbmQgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdHBhcmVudC5fcGFyZW50Q29uZmlndXJhdGlvblJhbmdlLmVuZExpbmVOdW1iZXIgPSBlbmQubGluZU51bWJlcjtcblx0XHRcdFx0cGFyZW50Ll9wYXJlbnRDb25maWd1cmF0aW9uUmFuZ2UuZW5kQ29sdW1uID0gZW5kLmNvbHVtbjtcblx0XHRcdFx0ZGVsZXRlIHBhcmVudC5fcGFyZW50Q29uZmlndXJhdGlvblJhbmdlO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKTtcblx0XHR9LFxuXHRcdG9uQXJyYXlCZWdpbjogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKGN1cnJlbnRQYXJlbnQgPT09IGNvbmZpZ3VyYXRpb24gJiYgcHJldmlvdXNQYXJlbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRwcmV2aW91c1BhcmVudHMucHVzaChjdXJyZW50UGFyZW50KTtcblx0XHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbnVsbDtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXJyYXk6IHVua25vd25bXSAmIHsgX3BhcmVudE1vZGVsc1JhbmdlPzogTXV0YWJsZTxJUmFuZ2U+IH0gPSBbXTtcblx0XHRcdGNvbnN0IHBhcmVudCA9IGN1cnJlbnRQYXJlbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gJiB7IHJhbmdlPzogSVJhbmdlOyBtb2RlbHNSYW5nZT86IE11dGFibGU8SVJhbmdlPiB9O1xuXHRcdFx0aWYgKGN1cnJlbnRQcm9wZXJ0eSA9PT0gJ21vZGVscycgJiYgcGFyZW50LnJhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0ID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQpO1xuXHRcdFx0XHRjb25zdCBlbmQgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdHBhcmVudC5tb2RlbHNSYW5nZSA9IHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IHN0YXJ0LmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IHN0YXJ0LmNvbHVtbixcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBlbmQubGluZU51bWJlcixcblx0XHRcdFx0XHRlbmRDb2x1bW46IGVuZC5jb2x1bW5cblx0XHRcdFx0fTtcblx0XHRcdFx0YXJyYXkuX3BhcmVudE1vZGVsc1JhbmdlID0gcGFyZW50Lm1vZGVsc1JhbmdlO1xuXHRcdFx0fVxuXHRcdFx0b25WYWx1ZShhcnJheSwgb2Zmc2V0LCBsZW5ndGgpO1xuXHRcdFx0cHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG5cdFx0XHRjdXJyZW50UGFyZW50ID0gYXJyYXk7XG5cdFx0XHRjdXJyZW50UHJvcGVydHkgPSBudWxsO1xuXHRcdH0sXG5cdFx0b25BcnJheUVuZDogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gY3VycmVudFBhcmVudCBhcyB7IF9wYXJlbnRDb25maWd1cmF0aW9uUmFuZ2U/OiBNdXRhYmxlPElSYW5nZT47IF9wYXJlbnRNb2RlbHNSYW5nZT86IE11dGFibGU8SVJhbmdlPiB9O1xuXHRcdFx0aWYgKHBhcmVudC5fcGFyZW50Q29uZmlndXJhdGlvblJhbmdlKSB7XG5cdFx0XHRcdGNvbnN0IGVuZCA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0ICsgbGVuZ3RoKTtcblx0XHRcdFx0cGFyZW50Ll9wYXJlbnRDb25maWd1cmF0aW9uUmFuZ2UuZW5kTGluZU51bWJlciA9IGVuZC5saW5lTnVtYmVyO1xuXHRcdFx0XHRwYXJlbnQuX3BhcmVudENvbmZpZ3VyYXRpb25SYW5nZS5lbmRDb2x1bW4gPSBlbmQuY29sdW1uO1xuXHRcdFx0XHRkZWxldGUgcGFyZW50Ll9wYXJlbnRDb25maWd1cmF0aW9uUmFuZ2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFyZW50Ll9wYXJlbnRNb2RlbHNSYW5nZSkge1xuXHRcdFx0XHRjb25zdCBlbmQgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdHBhcmVudC5fcGFyZW50TW9kZWxzUmFuZ2UuZW5kTGluZU51bWJlciA9IGVuZC5saW5lTnVtYmVyO1xuXHRcdFx0XHRwYXJlbnQuX3BhcmVudE1vZGVsc1JhbmdlLmVuZENvbHVtbiA9IGVuZC5jb2x1bW47XG5cdFx0XHRcdGRlbGV0ZSBwYXJlbnQuX3BhcmVudE1vZGVsc1JhbmdlO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudFBhcmVudCA9IHByZXZpb3VzUGFyZW50cy5wb3AoKTtcblx0XHR9LFxuXHRcdG9uTGl0ZXJhbFZhbHVlOiAodmFsdWU6IHVua25vd24sIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0b25WYWx1ZSh2YWx1ZSwgb2Zmc2V0LCBsZW5ndGgpO1xuXHRcdH0sXG5cdH07XG5cdHZpc2l0KG1vZGVsLmdldFZhbHVlKCksIHZpc2l0b3IpO1xuXHRyZXR1cm4gY29uZmlndXJhdGlvbjtcbn1cblxuY29uc3QgbGFuZ3VhZ2VNb2RlbHNTY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL2xhbmd1YWdlLW1vZGVscyc7XG5cbmV4cG9ydCBjbGFzcyBDaGF0TGFuZ3VhZ2VNb2RlbHNEYXRhQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5jaGF0TGFuZ3VhZ2VNb2RlbHNEYXRhJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UgbGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RyeS5yZWdpc3RlclNjaGVtYUFzc29jaWF0aW9uKGxhbmd1YWdlTW9kZWxzU2NoZW1hSWQsIGxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlndXJhdGlvbkZpbGUudG9TdHJpbmcoKSkpO1xuXG5cdFx0dGhpcy51cGRhdGVTY2hlbWEocmVnaXN0cnkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMoKCkgPT4gdGhpcy51cGRhdGVTY2hlbWEocmVnaXN0cnkpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNjaGVtYShyZWdpc3RyeTogSUpTT05Db250cmlidXRpb25SZWdpc3RyeSk6IHZvaWQge1xuXHRcdGNvbnN0IHZlbmRvcnMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzKCk7XG5cblx0XHQvLyBCdWlsZCBwZXItbW9kZWwgY29uZmlndXJhdGlvbiBzY2hlbWFzXG5cdFx0Y29uc3QgbW9kZWxTY2hlbWFzOiBJSlNPTlNjaGVtYVtdID0gW107XG5cdFx0Y29uc3QgbW9kZWxJZHMgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCk7XG5cdFx0Zm9yIChjb25zdCBtb2RlbElkIG9mIG1vZGVsSWRzKSB7XG5cdFx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZCk7XG5cdFx0XHRpZiAobWV0YWRhdGE/LmNvbmZpZ3VyYXRpb25TY2hlbWEpIHtcblx0XHRcdFx0bW9kZWxTY2hlbWFzLnB1c2goe1xuXHRcdFx0XHRcdGlmOiB7XG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHZlbmRvcjogeyBjb25zdDogbWV0YWRhdGEudmVuZG9yIH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRoZW46IHtcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRbbWV0YWRhdGEuaWRdOiBtZXRhZGF0YS5jb25maWd1cmF0aW9uU2NoZW1hXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHR2ZW5kb3I6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZW51bTogdmVuZG9ycy5tYXAodiA9PiB2LnZlbmRvcilcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRzZXR0aW5nczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3NldHRpbmdzLnBlck1vZGVsQ29uZmlnJywgXCJQZXItbW9kZWwgc2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbGxPZjogW1xuXHRcdFx0XHRcdC4uLnZlbmRvcnMubWFwKHZlbmRvciA9PiAoe1xuXHRcdFx0XHRcdFx0aWY6IHtcblx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdHZlbmRvcjogeyBjb25zdDogdmVuZG9yLnZlbmRvciB9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0aGVuOiB2ZW5kb3IuY29uZmlndXJhdGlvblxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0XHQuLi5tb2RlbFNjaGVtYXNcblx0XHRcdFx0XSxcblx0XHRcdFx0cmVxdWlyZWQ6IFsndmVuZG9yJywgJ25hbWUnXVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZWdpc3RyeS5yZWdpc3RlclNjaGVtYShsYW5ndWFnZU1vZGVsc1NjaGVtYUlkLCBzY2hlbWEpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBZ0IsbUJBQW1CO0FBQzVDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsY0FBYztBQUV2QixTQUFzQixhQUFhO0FBRW5DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXlDLDJDQUF5RTtBQUNsSCxTQUFvQyxjQUFjLHNCQUFzQjtBQUN4RSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLGtDQUFrQztBQUlwQyxJQUFNLHFDQUFOLGNBQWlELFdBQTBEO0FBQUEsRUFnQmpILFlBQ2dDLGFBQ0ksaUJBQ0Msa0JBQ0gsZUFDTSxxQkFDZCx3QkFDSixvQkFDcEI7QUFDRCxVQUFNO0FBUnlCO0FBQ0k7QUFDQztBQUNIO0FBQ007QUFkeEMsU0FBaUIsa0NBQWtDLEtBQUssVUFBVSxJQUFJLFFBQWlELENBQUM7QUFDeEgsU0FBUyxpQ0FBaUYsS0FBSyxnQ0FBZ0M7QUFFL0gsU0FBUSwrQkFBNkQsQ0FBQztBQWdCckUsU0FBSywwQkFBMEIsdUJBQXVCLGVBQWU7QUFDckUsU0FBSyxhQUFhLEtBQUssa0NBQWtDLEVBQUUsTUFBTSxNQUFNO0FBQUEsSUFBZ0UsQ0FBQztBQUd4SSxTQUFLLFVBQVUsWUFBWSxNQUFNLG1CQUFtQixPQUFPLFFBQVEsS0FBSyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ2pHLFNBQUssVUFBVSxZQUFZLGlCQUFpQixPQUFLO0FBQ2hELFVBQUksRUFBRSxTQUFTLEtBQUssdUJBQXVCLEdBQUc7QUFDN0MsYUFBSyxrQ0FBa0M7QUFBQSxNQUN4QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBL0JBLElBQUksb0JBQXlCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBeUI7QUFBQSxFQVNwRSxJQUFJLFlBQTJCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBWTtBQUFBLEVBd0JqRCwrQkFBK0IsNkJBQWlFO0FBQ3ZHLFVBQU0sZ0JBQWdELENBQUM7QUFDdkQsVUFBTSxjQUFjLElBQUksSUFBSSxLQUFLLDZCQUE2QixJQUFJLE9BQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxJQUFJLEVBQUUsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQ3BHLFVBQU0sY0FBYyxJQUFJLElBQUksNEJBQTRCLElBQUksT0FBSyxDQUFDLEdBQUcsRUFBRSxNQUFNLElBQUksRUFBRSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUM7QUFHOUYsZUFBVyxDQUFDLEtBQUssUUFBUSxLQUFLLGFBQWE7QUFDMUMsWUFBTSxXQUFXLFlBQVksSUFBSSxHQUFHO0FBQ3BDLFVBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxVQUFVLFFBQVEsR0FBRztBQUM3QyxzQkFBYyxLQUFLLFFBQVE7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFHQSxlQUFXLENBQUMsS0FBSyxRQUFRLEtBQUssYUFBYTtBQUMxQyxVQUFJLENBQUMsWUFBWSxJQUFJLEdBQUcsR0FBRztBQUMxQixzQkFBYyxLQUFLLFFBQVE7QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLCtCQUErQjtBQUNwQyxRQUFJLGNBQWMsU0FBUyxHQUFHO0FBQzdCLFdBQUssZ0NBQWdDLEtBQUssYUFBYTtBQUFBLElBQ3hEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxvQ0FBbUQ7QUFDaEUsVUFBTSwrQkFBK0IsTUFBTSxLQUFLLGlDQUFpQztBQUNqRixTQUFLLCtCQUErQiw0QkFBNEI7QUFBQSxFQUNqRTtBQUFBLEVBRUEsa0NBQTJFO0FBQzFFLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQU0sK0JBQStCLE9BQTRFO0FBQ2hILFVBQU0sS0FBSyxpQ0FBaUMsT0FBTSxpQ0FBZ0M7QUFDakYsVUFBSSw2QkFBNkIsS0FBSyxDQUFDLEVBQUUsTUFBTSxPQUFPLE1BQU0sU0FBUyxNQUFNLFFBQVEsV0FBVyxNQUFNLE1BQU0sR0FBRztBQUM1RyxjQUFNLElBQUksTUFBTSxrQ0FBa0MsTUFBTSxJQUFJLDhCQUE4QixNQUFNLE1BQU0sRUFBRTtBQUFBLE1BQ3pHO0FBQ0EsbUNBQTZCLEtBQUssS0FBSztBQUN2QyxhQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsVUFBTSxLQUFLLGtDQUFrQztBQUM3QyxVQUFNLFNBQVMsS0FBSyxnQ0FBZ0MsRUFBRSxLQUFLLFdBQVMsTUFBTSxTQUFTLE1BQU0sUUFBUSxNQUFNLFdBQVcsTUFBTSxNQUFNO0FBQzlILFFBQUksQ0FBQyxRQUFRO0FBQ1osWUFBTSxJQUFJLE1BQU0sa0NBQWtDLE1BQU0sSUFBSSx5QkFBeUIsTUFBTSxNQUFNLEVBQUU7QUFBQSxJQUNwRztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGtDQUFrQyxNQUFvQyxJQUF5RTtBQUNwSixVQUFNLEtBQUssaUNBQWlDLE9BQU0saUNBQWdDO0FBQ2pGLFlBQU1BLFVBQXVDLENBQUM7QUFDOUMsaUJBQVcsU0FBUyw4QkFBOEI7QUFDakQsWUFBSSxNQUFNLFNBQVMsS0FBSyxRQUFRLE1BQU0sV0FBVyxLQUFLLFFBQVE7QUFDN0QsVUFBQUEsUUFBTyxLQUFLLEVBQUU7QUFBQSxRQUNmLE9BQU87QUFDTixVQUFBQSxRQUFPLEtBQUssS0FBSztBQUFBLFFBQ2xCO0FBQUEsTUFDRDtBQUNBLGFBQU9BO0FBQUEsSUFDUixDQUFDO0FBRUQsVUFBTSxLQUFLLGtDQUFrQztBQUM3QyxVQUFNLFNBQVMsS0FBSyxnQ0FBZ0MsRUFBRSxLQUFLLFdBQVMsTUFBTSxTQUFTLEdBQUcsUUFBUSxNQUFNLFdBQVcsR0FBRyxNQUFNO0FBQ3hILFFBQUksQ0FBQyxRQUFRO0FBQ1osWUFBTSxJQUFJLE1BQU0sa0NBQWtDLEdBQUcsSUFBSSx5QkFBeUIsR0FBRyxNQUFNLEVBQUU7QUFBQSxJQUM5RjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGtDQUFrQyxVQUF1RDtBQUM5RixVQUFNLEtBQUssaUNBQWlDLE9BQU0saUNBQWdDO0FBQ2pGLFlBQU0sU0FBdUMsQ0FBQztBQUM5QyxpQkFBVyxTQUFTLDhCQUE4QjtBQUNqRCxZQUFJLE1BQU0sU0FBUyxTQUFTLFFBQVEsTUFBTSxXQUFXLFNBQVMsUUFBUTtBQUNyRTtBQUFBLFFBQ0Q7QUFDQSxlQUFPLEtBQUssS0FBSztBQUFBLE1BQ2xCO0FBQ0EsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUNELFVBQU0sS0FBSyxrQ0FBa0M7QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBTSx3QkFBd0IsU0FBeUQ7QUFJdEYsVUFBTSxpQkFBaUIsS0FBSyxvQkFBb0IsUUFBUSxLQUFLLG9CQUFvQixXQUFXLE1BQU0sS0FBSyxvQkFBb0Isd0JBQXdCLGNBQWM7QUFDakssVUFBTSxTQUFTLE1BQU0sS0FBSyxjQUFjLFdBQVc7QUFBQSxNQUNsRCxVQUFVLEtBQUs7QUFBQSxNQUNmLFNBQVMsRUFBRSxVQUFVLDJCQUEyQixHQUFHO0FBQUEsSUFDcEQsR0FBRyxjQUFjO0FBQ2pCLFFBQUksQ0FBQyxVQUFVLENBQUMsU0FBUyxPQUFPO0FBQy9CO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSxjQUFjLE9BQU8sV0FBVyxDQUFDO0FBQ3BELFFBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsSUFDRDtBQUVBLFFBQUksUUFBUSxTQUFTO0FBRXBCLFlBQU0sUUFBUSxXQUFXLFNBQVM7QUFDbEMsVUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGNBQWMsUUFBUSxrQkFBa0IsV0FBVyxRQUFRLE1BQU0sY0FBYyxRQUFRLE1BQU07QUFDbkcsVUFBSSxDQUFDLGFBQWE7QUFDakI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxTQUFTLFFBQVEsTUFBTTtBQUM3QixZQUFNLGdCQUFnQixRQUFRLGtCQUFrQixZQUFZLE1BQU0sUUFBUSxNQUFNO0FBQ2hGLFlBQU0sbUJBQW1CLGlCQUFpQixPQUFPLFdBQVc7QUFDNUQsWUFBTSw2QkFBNkIsb0JBQXFCLGlCQUFpQixZQUFZLG9CQUFvQixZQUFZO0FBQ3JILFlBQU0sbUJBQW1CLFlBQVksZ0JBQWdCO0FBQ3JELFlBQU0saUJBQWlCLDZCQUE2QjtBQUFBLFFBQ25ELFlBQVksWUFBWTtBQUFBLFFBQ3hCLFFBQVEsWUFBWSxZQUFZO0FBQUEsTUFDakMsSUFBSTtBQUFBLFFBQ0gsWUFBWTtBQUFBLFFBQ1osUUFBUSxNQUFNLGNBQWMsZ0JBQWdCLElBQUk7QUFBQSxNQUNqRDtBQUNBLGlCQUFXLFlBQVksY0FBYztBQUNyQyxpQkFBVyxzQkFBc0IsY0FBYztBQUMvQyxpQkFBVyxNQUFNO0FBQ2pCLHlCQUFtQixJQUFJLFVBQVUsR0FBRyxPQUFPLG1CQUFtQixRQUFRLFVBQVUsUUFBUSxRQUFRLE9BQU87QUFBQSxJQUN4RyxPQUFPO0FBQ04sVUFBSSxDQUFDLFFBQVEsTUFBTSxPQUFPO0FBQ3pCO0FBQUEsTUFDRDtBQUNBLFlBQU0sV0FBVyxFQUFFLFlBQVksUUFBUSxNQUFNLE1BQU0saUJBQWlCLFFBQVEsUUFBUSxNQUFNLE1BQU0sWUFBWTtBQUM1RyxpQkFBVyxZQUFZLFFBQVE7QUFDL0IsaUJBQVcsc0JBQXNCLFFBQVE7QUFDekMsaUJBQVcsTUFBTTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxpQ0FBaUMsUUFBdUo7QUFDck0sVUFBTSxTQUFTLE1BQU0sS0FBSyxZQUFZLE9BQU8sS0FBSyx1QkFBdUI7QUFDekUsUUFBSSxDQUFDLFFBQVE7QUFDWixZQUFNLEtBQUssWUFBWSxVQUFVLEtBQUsseUJBQXlCLFNBQVMsV0FBVyxLQUFLLFVBQVUsQ0FBQyxHQUFHLFFBQVcsR0FBSSxDQUFDLENBQUM7QUFBQSxJQUN4SDtBQUNBLFVBQU0sTUFBTSxNQUFNLEtBQUssaUJBQWlCLHFCQUFxQixLQUFLLHVCQUF1QjtBQUN6RixVQUFNLFFBQVEsSUFBSSxPQUFPO0FBQ3pCLFFBQUk7QUFDSCxZQUFNLCtCQUErQixrQ0FBa0MsS0FBSztBQUM1RSxVQUFJLENBQUMsUUFBUTtBQUNaLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxzQ0FBc0MsTUFBTSxPQUFPLDRCQUE0QjtBQUNyRixpQkFBVyxTQUFTLHFDQUFxQztBQUN4RCxlQUFPLE1BQU07QUFDYixlQUFPLE1BQU07QUFBQSxNQUNkO0FBQ0EsWUFBTSxTQUFTLEtBQUssVUFBVSxxQ0FBcUMsUUFBVyxHQUFJLENBQUM7QUFDbkYsWUFBTSxLQUFLLGdCQUFnQixLQUFLLEtBQUssdUJBQXVCO0FBQzVELGFBQU87QUFBQSxJQUNSLFVBQUU7QUFDRCxVQUFJLFFBQVE7QUFBQSxJQUNiO0FBQUEsRUFDRDtBQUNEO0FBNU1hLHFDQUFOO0FBQUEsRUFpQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZCVTtBQThNTixTQUFTLGtDQUFrQyxPQUFpRDtBQUNsRyxRQUFNLGdCQUE4QyxDQUFDO0FBQ3JELE1BQUksa0JBQWlDO0FBQ3JDLE1BQUksZ0JBQXlCO0FBQzdCLFFBQU0sa0JBQTZCLENBQUM7QUFFcEMsV0FBUyxRQUFRLE9BQWdCLFFBQWdCLFFBQWdCO0FBQ2hFLFFBQUksTUFBTSxRQUFRLGFBQWEsR0FBRztBQUNqQyxNQUFDLGNBQTRCLEtBQUssS0FBSztBQUFBLElBQ3hDLFdBQVcsb0JBQW9CLE1BQU07QUFDcEMsTUFBQyxjQUEwQyxlQUFlLElBQUk7QUFBQSxJQUMvRDtBQUFBLEVBQ0Q7QUFFQSxRQUFNLFVBQXVCO0FBQUEsSUFDNUIsZUFBZSxDQUFDLFFBQWdCLFdBQW1CO0FBQ2xELFlBQU0sU0FBdUQsQ0FBQztBQUM5RCxVQUFJLGdCQUFnQixXQUFXLEtBQUssTUFBTSxRQUFRLGFBQWEsR0FBRztBQUNqRSxjQUFNLFFBQVEsTUFBTSxjQUFjLE1BQU07QUFDeEMsY0FBTSxNQUFNLE1BQU0sY0FBYyxTQUFTLE1BQU07QUFDL0MsZUFBTyxRQUFRO0FBQUEsVUFDZCxpQkFBaUIsTUFBTTtBQUFBLFVBQ3ZCLGFBQWEsTUFBTTtBQUFBLFVBQ25CLGVBQWUsSUFBSTtBQUFBLFVBQ25CLFdBQVcsSUFBSTtBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUNBLGNBQVEsUUFBUSxRQUFRLE1BQU07QUFDOUIsc0JBQWdCLEtBQUssYUFBYTtBQUNsQyxzQkFBZ0I7QUFDaEIsd0JBQWtCO0FBQUEsSUFDbkI7QUFBQSxJQUNBLGtCQUFrQixDQUFDLE1BQWMsUUFBZ0IsV0FBbUI7QUFDbkUsd0JBQWtCO0FBQUEsSUFDbkI7QUFBQSxJQUNBLGFBQWEsQ0FBQyxRQUFnQixXQUFtQjtBQUNoRCxZQUFNLFNBQVM7QUFDZixVQUFJLE9BQU8sT0FBTztBQUNqQixjQUFNLE1BQU0sTUFBTSxjQUFjLFNBQVMsTUFBTTtBQUMvQyxlQUFPLFFBQVE7QUFBQSxVQUNkLGlCQUFpQixPQUFPLE1BQU07QUFBQSxVQUM5QixhQUFhLE9BQU8sTUFBTTtBQUFBLFVBQzFCLGVBQWUsSUFBSTtBQUFBLFVBQ25CLFdBQVcsSUFBSTtBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUNBLFVBQUksT0FBTywyQkFBMkI7QUFDckMsY0FBTSxNQUFNLE1BQU0sY0FBYyxTQUFTLE1BQU07QUFDL0MsZUFBTywwQkFBMEIsZ0JBQWdCLElBQUk7QUFDckQsZUFBTywwQkFBMEIsWUFBWSxJQUFJO0FBQ2pELGVBQU8sT0FBTztBQUFBLE1BQ2Y7QUFDQSxzQkFBZ0IsZ0JBQWdCLElBQUk7QUFBQSxJQUNyQztBQUFBLElBQ0EsY0FBYyxDQUFDLFFBQWdCLFdBQW1CO0FBQ2pELFVBQUksa0JBQWtCLGlCQUFpQixnQkFBZ0IsV0FBVyxHQUFHO0FBQ3BFLHdCQUFnQixLQUFLLGFBQWE7QUFDbEMsMEJBQWtCO0FBQ2xCO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBOEQsQ0FBQztBQUNyRSxZQUFNLFNBQVM7QUFDZixVQUFJLG9CQUFvQixZQUFZLE9BQU8sT0FBTztBQUNqRCxjQUFNLFFBQVEsTUFBTSxjQUFjLE1BQU07QUFDeEMsY0FBTSxNQUFNLE1BQU0sY0FBYyxTQUFTLE1BQU07QUFDL0MsZUFBTyxjQUFjO0FBQUEsVUFDcEIsaUJBQWlCLE1BQU07QUFBQSxVQUN2QixhQUFhLE1BQU07QUFBQSxVQUNuQixlQUFlLElBQUk7QUFBQSxVQUNuQixXQUFXLElBQUk7QUFBQSxRQUNoQjtBQUNBLGNBQU0scUJBQXFCLE9BQU87QUFBQSxNQUNuQztBQUNBLGNBQVEsT0FBTyxRQUFRLE1BQU07QUFDN0Isc0JBQWdCLEtBQUssYUFBYTtBQUNsQyxzQkFBZ0I7QUFDaEIsd0JBQWtCO0FBQUEsSUFDbkI7QUFBQSxJQUNBLFlBQVksQ0FBQyxRQUFnQixXQUFtQjtBQUMvQyxZQUFNLFNBQVM7QUFDZixVQUFJLE9BQU8sMkJBQTJCO0FBQ3JDLGNBQU0sTUFBTSxNQUFNLGNBQWMsU0FBUyxNQUFNO0FBQy9DLGVBQU8sMEJBQTBCLGdCQUFnQixJQUFJO0FBQ3JELGVBQU8sMEJBQTBCLFlBQVksSUFBSTtBQUNqRCxlQUFPLE9BQU87QUFBQSxNQUNmO0FBQ0EsVUFBSSxPQUFPLG9CQUFvQjtBQUM5QixjQUFNLE1BQU0sTUFBTSxjQUFjLFNBQVMsTUFBTTtBQUMvQyxlQUFPLG1CQUFtQixnQkFBZ0IsSUFBSTtBQUM5QyxlQUFPLG1CQUFtQixZQUFZLElBQUk7QUFDMUMsZUFBTyxPQUFPO0FBQUEsTUFDZjtBQUNBLHNCQUFnQixnQkFBZ0IsSUFBSTtBQUFBLElBQ3JDO0FBQUEsSUFDQSxnQkFBZ0IsQ0FBQyxPQUFnQixRQUFnQixXQUFtQjtBQUNuRSxjQUFRLE9BQU8sUUFBUSxNQUFNO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQ0EsUUFBTSxNQUFNLFNBQVMsR0FBRyxPQUFPO0FBQy9CLFNBQU87QUFDUjtBQUVBLE1BQU0seUJBQXlCO0FBRXhCLElBQU0scUNBQU4sY0FBaUQsV0FBNkM7QUFBQSxFQUlwRyxZQUMwQyx1QkFDSixvQ0FDcEM7QUFDRCxVQUFNO0FBSG1DO0FBSXpDLFVBQU0sV0FBVyxTQUFTLEdBQThCLGVBQWUsZ0JBQWdCO0FBQ3ZGLFNBQUssVUFBVSxTQUFTLDBCQUEwQix3QkFBd0IsbUNBQW1DLGtCQUFrQixTQUFTLENBQUMsQ0FBQztBQUUxSSxTQUFLLGFBQWEsUUFBUTtBQUMxQixTQUFLLFVBQVUsS0FBSyxzQkFBc0IsMEJBQTBCLE1BQU0sS0FBSyxhQUFhLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDdkc7QUFBQSxFQUVRLGFBQWEsVUFBMkM7QUFDL0QsVUFBTSxVQUFVLEtBQUssc0JBQXNCLFdBQVc7QUFHdEQsVUFBTSxlQUE4QixDQUFDO0FBQ3JDLFVBQU0sV0FBVyxLQUFLLHNCQUFzQixvQkFBb0I7QUFDaEUsZUFBVyxXQUFXLFVBQVU7QUFDL0IsWUFBTSxXQUFXLEtBQUssc0JBQXNCLG9CQUFvQixPQUFPO0FBQ3ZFLFVBQUksVUFBVSxxQkFBcUI7QUFDbEMscUJBQWEsS0FBSztBQUFBLFVBQ2pCLElBQUk7QUFBQSxZQUNILFlBQVk7QUFBQSxjQUNYLFFBQVEsRUFBRSxPQUFPLFNBQVMsT0FBTztBQUFBLFlBQ2xDO0FBQUEsVUFDRDtBQUFBLFVBQ0EsTUFBTTtBQUFBLFlBQ0wsWUFBWTtBQUFBLGNBQ1gsVUFBVTtBQUFBLGdCQUNULE1BQU07QUFBQSxnQkFDTixZQUFZO0FBQUEsa0JBQ1gsQ0FBQyxTQUFTLEVBQUUsR0FBRyxTQUFTO0FBQUEsZ0JBQ3pCO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQXNCO0FBQUEsTUFDM0IsTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ04sWUFBWTtBQUFBLFVBQ1gsUUFBUTtBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sTUFBTSxRQUFRLElBQUksT0FBSyxFQUFFLE1BQU07QUFBQSxVQUNoQztBQUFBLFVBQ0EsTUFBTSxFQUFFLE1BQU0sU0FBUztBQUFBLFVBQ3ZCLFVBQVU7QUFBQSxZQUNULE1BQU07QUFBQSxZQUNOLGFBQWEsU0FBUywyQkFBMkIsb0JBQW9CO0FBQUEsVUFDdEU7QUFBQSxRQUNEO0FBQUEsUUFDQSxPQUFPO0FBQUEsVUFDTixHQUFHLFFBQVEsSUFBSSxhQUFXO0FBQUEsWUFDekIsSUFBSTtBQUFBLGNBQ0gsWUFBWTtBQUFBLGdCQUNYLFFBQVEsRUFBRSxPQUFPLE9BQU8sT0FBTztBQUFBLGNBQ2hDO0FBQUEsWUFDRDtBQUFBLFlBQ0EsTUFBTSxPQUFPO0FBQUEsVUFDZCxFQUFFO0FBQUEsVUFDRixHQUFHO0FBQUEsUUFDSjtBQUFBLFFBQ0EsVUFBVSxDQUFDLFVBQVUsTUFBTTtBQUFBLE1BQzVCO0FBQUEsSUFDRDtBQUVBLGFBQVMsZUFBZSx3QkFBd0IsTUFBTTtBQUFBLEVBQ3ZEO0FBQ0Q7QUE1RWEsbUNBRUksS0FBSztBQUZULHFDQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogWyJyZXN1bHQiXQp9Cg==
