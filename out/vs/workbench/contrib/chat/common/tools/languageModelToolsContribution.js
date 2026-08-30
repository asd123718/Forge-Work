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
import { isFalsyOrEmpty } from "../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { transaction } from "../../../../../base/common/observable.js";
import { joinPath } from "../../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize } from "../../../../../nls.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../../services/extensionManagement/common/extensionFeatures.js";
import { isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import * as extensionsRegistry from "../../../../services/extensions/common/extensionsRegistry.js";
import { ILanguageModelToolsService, ToolDataSource } from "./languageModelToolsService.js";
import { toolsParametersSchemaSchemaId } from "./languageModelToolsParametersSchema.js";
const languageModelToolsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "languageModelTools",
  activationEventsGenerator: function* (contributions) {
    for (const contrib of contributions) {
      yield `onLanguageModelTool:${contrib.name}`;
    }
  },
  jsonSchema: {
    description: localize("vscode.extension.contributes.tools", "Contributes a tool that can be invoked by a language model in a chat session, or from a standalone command. Registered tools can be used by all extensions."),
    type: "array",
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{
        body: {
          name: "${1}",
          modelDescription: "${2}",
          inputSchema: {
            type: "object",
            properties: {
              "${3:name}": {
                type: "string",
                description: "${4:description}"
              }
            }
          }
        }
      }],
      required: ["name", "displayName", "modelDescription"],
      properties: {
        name: {
          description: localize("toolName", "A unique name for this tool. This name must be a globally unique identifier, and is also used as a name when presenting this tool to a language model."),
          type: "string",
          // [\\w-]+ is OpenAI's requirement for tool names
          pattern: "^(?!copilot_|vscode_)[\\w-]+$"
        },
        toolReferenceName: {
          markdownDescription: localize("toolName2", "If {0} is enabled for this tool, the user may use '#' with this name to invoke the tool in a query. Otherwise, the name is not required. Name must not contain whitespace.", "`canBeReferencedInPrompt`"),
          type: "string",
          pattern: "^[\\w-]+$"
        },
        displayName: {
          description: localize("toolDisplayName", "A human-readable name for this tool that may be used to describe it in the UI."),
          type: "string"
        },
        userDescription: {
          description: localize("toolUserDescription", "A description of this tool that may be shown to the user."),
          type: "string"
        },
        // eslint-disable-next-line local/code-no-localized-model-description
        modelDescription: {
          description: localize("toolModelDescription", "A description of this tool that may be used by a language model to select it."),
          type: "string"
        },
        inputSchema: {
          description: localize("parametersSchema", "A JSON schema for the input this tool accepts. The input must be an object at the top level. A particular language model may not support all JSON schema features. See the documentation for the language model family you are using for more information."),
          $ref: toolsParametersSchemaSchemaId
        },
        canBeReferencedInPrompt: {
          markdownDescription: localize("canBeReferencedInPrompt", "If true, this tool shows up as an attachment that the user can add manually to their request. Chat participants will receive the tool in {0}.", "`ChatRequest#toolReferences`"),
          type: "boolean"
        },
        icon: {
          markdownDescription: localize("icon", 'An icon that represents this tool. Either a file path, an object with file paths for dark and light themes, or a theme icon reference, like "\\$(zap)"'),
          anyOf: [
            {
              type: "string"
            },
            {
              type: "object",
              properties: {
                light: {
                  description: localize("icon.light", "Icon path when a light theme is used"),
                  type: "string"
                },
                dark: {
                  description: localize("icon.dark", "Icon path when a dark theme is used"),
                  type: "string"
                }
              }
            }
          ]
        },
        when: {
          markdownDescription: localize("condition", "Condition which must be true for this tool to be enabled. Note that a tool may still be invoked by another extension even when its `when` condition is false."),
          type: "string"
        },
        tags: {
          description: localize("toolTags", "A set of tags that roughly describe the tool's capabilities. A tool user may use these to filter the set of tools to just ones that are relevant for the task at hand, or they may want to pick a tag that can be used to identify just the tools contributed by this extension."),
          type: "array",
          items: {
            type: "string",
            pattern: "^(?!copilot_|vscode_)"
          }
        }
      }
    }
  }
});
const languageModelToolSetsExtensionPoint = extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "languageModelToolSets",
  deps: [languageModelToolsExtensionPoint],
  jsonSchema: {
    description: localize("vscode.extension.contributes.toolSets", "Contributes a set of language model tools that can be used together."),
    type: "array",
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{
        body: {
          name: "${1}",
          description: "${2}",
          tools: ["${3}"]
        }
      }],
      required: ["name", "description", "tools"],
      properties: {
        name: {
          description: localize("toolSetName", "A name for this tool set. Used as reference and should not contain whitespace."),
          type: "string",
          pattern: "^[\\w-]+$"
        },
        description: {
          description: localize("toolSetDescription", "A description of this tool set."),
          type: "string"
        },
        icon: {
          markdownDescription: localize("toolSetIcon", "An icon that represents this tool set, like {0}", "`$(zap)`"),
          type: "string"
        },
        tools: {
          markdownDescription: localize("toolSetTools", "A list of tools or tool sets to include in this tool set. Cannot be empty and must reference tools by their `toolReferenceName`."),
          type: "array",
          minItems: 1,
          items: {
            type: "string"
          }
        }
      }
    }
  }
});
function toToolKey(extensionIdentifier, toolName) {
  return `${extensionIdentifier.value}/${toolName}`;
}
function toToolSetKey(extensionIdentifier, toolName) {
  return `toolset:${extensionIdentifier.value}/${toolName}`;
}
function toSyntheticToolSetKey(extensionIdentifier) {
  return `synthetic-toolset:${extensionIdentifier.value}`;
}
let LanguageModelToolsExtensionPointHandler = class {
  constructor(productService, languageModelToolsService) {
    this._registrationDisposables = new DisposableMap();
    languageModelToolsExtensionPoint.setHandler((_extensions, delta) => {
      for (const extension of delta.added) {
        const successfullyRegisteredTools = [];
        let extensionSource;
        for (const rawTool of extension.value) {
          if (!rawTool.name || !rawTool.modelDescription || !rawTool.displayName) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool without name, modelDescription, and displayName: ${JSON.stringify(rawTool)}`);
            continue;
          }
          if (!rawTool.name.match(/^[\w-]+$/)) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with invalid id: ${rawTool.name}. The id must match /^[\\w-]+$/.`);
            continue;
          }
          if (rawTool.canBeReferencedInPrompt && !rawTool.toolReferenceName) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with 'canBeReferencedInPrompt' set without a 'toolReferenceName': ${JSON.stringify(rawTool)}`);
            continue;
          }
          if ((rawTool.name.startsWith("copilot_") || rawTool.name.startsWith("vscode_")) && !isProposedApiEnabled(extension.description, "chatParticipantPrivate")) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with name starting with "vscode_" or "copilot_"`);
            continue;
          }
          if (rawTool.tags?.some((tag) => tag.startsWith("copilot_") || tag.startsWith("vscode_")) && !isProposedApiEnabled(extension.description, "chatParticipantPrivate")) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register tool with tags starting with "vscode_" or "copilot_"`);
          }
          if (rawTool.legacyToolReferenceFullNames && !isProposedApiEnabled(extension.description, "chatParticipantPrivate")) {
            extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT use 'legacyToolReferenceFullNames' without the 'chatParticipantPrivate' API proposal enabled`);
            continue;
          }
          const rawIcon = rawTool.icon;
          let icon;
          if (typeof rawIcon === "string") {
            icon = ThemeIcon.fromString(rawIcon) ?? {
              dark: joinPath(extension.description.extensionLocation, rawIcon),
              light: joinPath(extension.description.extensionLocation, rawIcon)
            };
          } else if (rawIcon) {
            icon = {
              dark: joinPath(extension.description.extensionLocation, rawIcon.dark),
              light: joinPath(extension.description.extensionLocation, rawIcon.light)
            };
          }
          const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
          const isBuiltinTool = chatExtensionId ? ExtensionIdentifier.equals(extension.description.identifier, chatExtensionId) : isProposedApiEnabled(extension.description, "chatParticipantPrivate");
          const source = isBuiltinTool ? ToolDataSource.Internal : { type: "extension", label: extension.description.displayName ?? extension.description.name, extensionId: extension.description.identifier };
          const tool = {
            ...rawTool,
            source,
            inputSchema: rawTool.inputSchema,
            id: rawTool.name,
            icon,
            when: rawTool.when ? ContextKeyExpr.deserialize(rawTool.when) : void 0,
            alwaysDisplayInputOutput: !isBuiltinTool
          };
          try {
            const disposable = languageModelToolsService.registerToolData(tool);
            this._registrationDisposables.set(toToolKey(extension.description.identifier, rawTool.name), disposable);
            successfullyRegisteredTools.push(tool);
            extensionSource ??= source;
          } catch (e) {
            extension.collector.error(`Failed to register tool '${rawTool.name}': ${e}`);
          }
        }
        const hasOwnToolSets = !isFalsyOrEmpty(extension.description.contributes?.languageModelToolSets);
        if (!hasOwnToolSets && extensionSource?.type === "extension" && successfullyRegisteredTools.length > 0) {
          const syntheticKey = toSyntheticToolSetKey(extension.description.identifier);
          const toolSet = languageModelToolsService.createToolSet(
            extensionSource,
            syntheticKey,
            extension.description.identifier.value,
            {
              icon: Codicon.extensions,
              description: extension.description.displayName ?? extension.description.name,
              hiddenInToolsPicker: true
            }
          );
          const store = new DisposableStore();
          store.add(toolSet);
          transaction((tx) => {
            for (const t of successfullyRegisteredTools) {
              store.add(toolSet.addTool(t, tx));
            }
          });
          this._registrationDisposables.set(syntheticKey, store);
        }
      }
      for (const extension of delta.removed) {
        this._registrationDisposables.deleteAndDispose(toSyntheticToolSetKey(extension.description.identifier));
        for (const tool of extension.value) {
          this._registrationDisposables.deleteAndDispose(toToolKey(extension.description.identifier, tool.name));
        }
      }
    });
    languageModelToolSetsExtensionPoint.setHandler((_extensions, delta) => {
      for (const extension of delta.added) {
        if (!isProposedApiEnabled(extension.description, "contribLanguageModelToolSets")) {
          extension.collector.error(`Extension '${extension.description.identifier.value}' CANNOT register language model tools because the 'contribLanguageModelToolSets' API proposal is not enabled.`);
          continue;
        }
        const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
        const isBuiltinTool = chatExtensionId ? ExtensionIdentifier.equals(extension.description.identifier, chatExtensionId) : isProposedApiEnabled(extension.description, "chatParticipantPrivate");
        const source = isBuiltinTool ? ToolDataSource.Internal : { type: "extension", label: extension.description.displayName ?? extension.description.name, extensionId: extension.description.identifier };
        for (const toolSet of extension.value) {
          if (isFalsyOrWhitespace(toolSet.name)) {
            extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty name`);
            continue;
          }
          if (toolSet.legacyFullNames && !isProposedApiEnabled(extension.description, "contribLanguageModelToolSets")) {
            extension.collector.error(`Tool set '${toolSet.name}' CANNOT use 'legacyFullNames' without the 'contribLanguageModelToolSets' API proposal enabled`);
            continue;
          }
          if (isFalsyOrEmpty(toolSet.tools)) {
            extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array`);
            continue;
          }
          const tools = [];
          const toolSets = [];
          const missingToolNames = [];
          for (const toolName of toolSet.tools) {
            const toolObj = languageModelToolsService.getToolByName(toolName);
            if (toolObj) {
              tools.push(toolObj);
              continue;
            }
            const toolSetObj = languageModelToolsService.getToolSetByName(toolName);
            if (toolSetObj) {
              toolSets.push(toolSetObj);
              continue;
            }
            missingToolNames.push(toolName);
          }
          if (toolSets.length === 0 && tools.length === 0) {
            extension.collector.error(`Tool set '${toolSet.name}' CANNOT have an empty tools array (none of the tools were found)`);
            continue;
          }
          const store = new DisposableStore();
          const referenceName = toolSet.referenceName ?? toolSet.name;
          const existingToolSet = languageModelToolsService.getToolSetByName(referenceName);
          const mergeExisting = isBuiltinTool && existingToolSet?.source === ToolDataSource.Internal;
          let obj;
          if (mergeExisting) {
            obj = existingToolSet;
          } else {
            obj = languageModelToolsService.createToolSet(
              source,
              toToolSetKey(extension.description.identifier, toolSet.name),
              referenceName,
              {
                icon: toolSet.icon ? ThemeIcon.fromString(toolSet.icon) : void 0,
                description: toolSet.description,
                legacyFullNames: toolSet.legacyFullNames,
                // Built-in tool sets are deprecated and hidden from Chat Customizations → Tools; extension-contributed sets surface there.
                deprecated: source.type !== "extension"
              }
            );
          }
          transaction((tx) => {
            if (!mergeExisting) {
              store.add(obj);
            }
            tools.forEach((tool) => store.add(obj.addTool(tool, tx)));
            toolSets.forEach((toolSet2) => store.add(obj.addToolSet(toolSet2, tx)));
          });
          if (missingToolNames.length > 0) {
            const pending = new Set(missingToolNames);
            const listener = store.add(languageModelToolsService.onDidChangeTools(() => {
              for (const toolName of pending) {
                const toolObj = languageModelToolsService.getToolByName(toolName);
                if (toolObj) {
                  store.add(obj.addTool(toolObj));
                  pending.delete(toolName);
                } else {
                  const toolSetObj = languageModelToolsService.getToolSetByName(toolName);
                  if (toolSetObj) {
                    store.add(obj.addToolSet(toolSetObj));
                    pending.delete(toolName);
                  }
                }
              }
              if (pending.size === 0) {
                store.delete(listener);
              }
            }));
          }
          this._registrationDisposables.set(toToolSetKey(extension.description.identifier, toolSet.name), store);
        }
      }
      for (const extension of delta.removed) {
        for (const toolSet of extension.value) {
          this._registrationDisposables.deleteAndDispose(toToolSetKey(extension.description.identifier, toolSet.name));
        }
      }
    });
  }
};
LanguageModelToolsExtensionPointHandler.ID = "workbench.contrib.toolsExtensionPointHandler";
LanguageModelToolsExtensionPointHandler = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, ILanguageModelToolsService)
], LanguageModelToolsExtensionPointHandler);
class LanguageModelToolDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.languageModelTools;
  }
  render(manifest) {
    const contribs = manifest.contributes?.languageModelTools ?? [];
    if (!contribs.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("toolTableName", "Name"),
      localize("toolTableDisplayName", "Display Name"),
      localize("toolTableDescription", "Description")
    ];
    const rows = contribs.map((t) => {
      return [
        new MarkdownString(`\`${t.name}\``),
        t.displayName,
        t.userDescription ?? t.modelDescription
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "languageModelTools",
  label: localize("langModelTools", "Language Model Tools"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(LanguageModelToolDataRenderer)
});
class LanguageModelToolSetDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.languageModelToolSets;
  }
  render(manifest) {
    const contribs = manifest.contributes?.languageModelToolSets ?? [];
    if (!contribs.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("name", "Name"),
      localize("reference", "Reference Name"),
      localize("tools", "Tools"),
      localize("descriptions", "Description")
    ];
    const rows = contribs.map((t) => {
      return [
        new MarkdownString(`\`${t.name}\``),
        t.referenceName ? new MarkdownString(`\`#${t.referenceName}\``) : "none",
        t.tools.join(", "),
        t.description
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "languageModelToolSets",
  label: localize("langModelToolSets", "Language Model Tool Sets"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(LanguageModelToolSetDataRenderer)
});
export {
  LanguageModelToolsExtensionPointHandler,
  toToolSetKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcdG9vbHNcXGxhbmd1YWdlTW9kZWxUb29sc0NvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzRmFsc3lPckVtcHR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc0ZhbHN5T3JXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIsIElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBpc1Byb3Bvc2VkQXBpRW5hYmxlZCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0ICogYXMgZXh0ZW5zaW9uc1JlZ2lzdHJ5IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBJVG9vbFNldCwgVG9vbERhdGFTb3VyY2UsIFRvb2xTZXQgfSBmcm9tICcuL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgdG9vbHNQYXJhbWV0ZXJzU2NoZW1hU2NoZW1hSWQgfSBmcm9tICcuL2xhbmd1YWdlTW9kZWxUb29sc1BhcmFtZXRlcnNTY2hlbWEuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElSYXdUb29sQ29udHJpYnV0aW9uIHtcblx0bmFtZTogc3RyaW5nO1xuXHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRtb2RlbERlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHRvb2xSZWZlcmVuY2VOYW1lPzogc3RyaW5nO1xuXHRsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzPzogc3RyaW5nW107XG5cdGljb24/OiBzdHJpbmcgfCB7IGxpZ2h0OiBzdHJpbmc7IGRhcms6IHN0cmluZyB9O1xuXHR3aGVuPzogc3RyaW5nO1xuXHR0YWdzPzogc3RyaW5nW107XG5cdHVzZXJEZXNjcmlwdGlvbj86IHN0cmluZztcblx0aW5wdXRTY2hlbWE/OiBJSlNPTlNjaGVtYTtcblx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ/OiBib29sZWFuO1xufVxuXG5jb25zdCBsYW5ndWFnZU1vZGVsVG9vbHNFeHRlbnNpb25Qb2ludCA9IGV4dGVuc2lvbnNSZWdpc3RyeS5FeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJUmF3VG9vbENvbnRyaWJ1dGlvbltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnbGFuZ3VhZ2VNb2RlbFRvb2xzJyxcblx0YWN0aXZhdGlvbkV2ZW50c0dlbmVyYXRvcjogZnVuY3Rpb24qIChjb250cmlidXRpb25zOiByZWFkb25seSBJUmF3VG9vbENvbnRyaWJ1dGlvbltdKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdHlpZWxkIGBvbkxhbmd1YWdlTW9kZWxUb29sOiR7Y29udHJpYi5uYW1lfWA7XG5cdFx0fVxuXHR9LFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRvb2xzJywgJ0NvbnRyaWJ1dGVzIGEgdG9vbCB0aGF0IGNhbiBiZSBpbnZva2VkIGJ5IGEgbGFuZ3VhZ2UgbW9kZWwgaW4gYSBjaGF0IHNlc3Npb24sIG9yIGZyb20gYSBzdGFuZGFsb25lIGNvbW1hbmQuIFJlZ2lzdGVyZWQgdG9vbHMgY2FuIGJlIHVzZWQgYnkgYWxsIGV4dGVuc2lvbnMuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRuYW1lOiAnJHsxfScsXG5cdFx0XHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJyR7Mn0nLFxuXHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0JyR7MzpuYW1lfSc6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJyR7NDpkZXNjcmlwdGlvbn0nXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnLCAnZGlzcGxheU5hbWUnLCAnbW9kZWxEZXNjcmlwdGlvbiddLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRuYW1lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0b29sTmFtZScsIFwiQSB1bmlxdWUgbmFtZSBmb3IgdGhpcyB0b29sLiBUaGlzIG5hbWUgbXVzdCBiZSBhIGdsb2JhbGx5IHVuaXF1ZSBpZGVudGlmaWVyLCBhbmQgaXMgYWxzbyB1c2VkIGFzIGEgbmFtZSB3aGVuIHByZXNlbnRpbmcgdGhpcyB0b29sIHRvIGEgbGFuZ3VhZ2UgbW9kZWwuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdC8vIFtcXFxcdy1dKyBpcyBPcGVuQUkncyByZXF1aXJlbWVudCBmb3IgdG9vbCBuYW1lc1xuXHRcdFx0XHRcdHBhdHRlcm46ICdeKD8hY29waWxvdF98dnNjb2RlXylbXFxcXHctXSskJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZToge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0b29sTmFtZTInLCBcIklmIHswfSBpcyBlbmFibGVkIGZvciB0aGlzIHRvb2wsIHRoZSB1c2VyIG1heSB1c2UgJyMnIHdpdGggdGhpcyBuYW1lIHRvIGludm9rZSB0aGUgdG9vbCBpbiBhIHF1ZXJ5LiBPdGhlcndpc2UsIHRoZSBuYW1lIGlzIG5vdCByZXF1aXJlZC4gTmFtZSBtdXN0IG5vdCBjb250YWluIHdoaXRlc3BhY2UuXCIsICdgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHRgJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0cGF0dGVybjogJ15bXFxcXHctXSskJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwbGF5TmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9vbERpc3BsYXlOYW1lJywgXCJBIGh1bWFuLXJlYWRhYmxlIG5hbWUgZm9yIHRoaXMgdG9vbCB0aGF0IG1heSBiZSB1c2VkIHRvIGRlc2NyaWJlIGl0IGluIHRoZSBVSS5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0dXNlckRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0b29sVXNlckRlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIG9mIHRoaXMgdG9vbCB0aGF0IG1heSBiZSBzaG93biB0byB0aGUgdXNlci5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tbG9jYWxpemVkLW1vZGVsLWRlc2NyaXB0aW9uXG5cdFx0XHRcdG1vZGVsRGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rvb2xNb2RlbERlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIG9mIHRoaXMgdG9vbCB0aGF0IG1heSBiZSB1c2VkIGJ5IGEgbGFuZ3VhZ2UgbW9kZWwgdG8gc2VsZWN0IGl0LlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncGFyYW1ldGVyc1NjaGVtYScsIFwiQSBKU09OIHNjaGVtYSBmb3IgdGhlIGlucHV0IHRoaXMgdG9vbCBhY2NlcHRzLiBUaGUgaW5wdXQgbXVzdCBiZSBhbiBvYmplY3QgYXQgdGhlIHRvcCBsZXZlbC4gQSBwYXJ0aWN1bGFyIGxhbmd1YWdlIG1vZGVsIG1heSBub3Qgc3VwcG9ydCBhbGwgSlNPTiBzY2hlbWEgZmVhdHVyZXMuIFNlZSB0aGUgZG9jdW1lbnRhdGlvbiBmb3IgdGhlIGxhbmd1YWdlIG1vZGVsIGZhbWlseSB5b3UgYXJlIHVzaW5nIGZvciBtb3JlIGluZm9ybWF0aW9uLlwiKSxcblx0XHRcdFx0XHQkcmVmOiB0b29sc1BhcmFtZXRlcnNTY2hlbWFTY2hlbWFJZFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDoge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdjYW5CZVJlZmVyZW5jZWRJblByb21wdCcsIFwiSWYgdHJ1ZSwgdGhpcyB0b29sIHNob3dzIHVwIGFzIGFuIGF0dGFjaG1lbnQgdGhhdCB0aGUgdXNlciBjYW4gYWRkIG1hbnVhbGx5IHRvIHRoZWlyIHJlcXVlc3QuIENoYXQgcGFydGljaXBhbnRzIHdpbGwgcmVjZWl2ZSB0aGUgdG9vbCBpbiB7MH0uXCIsICdgQ2hhdFJlcXVlc3QjdG9vbFJlZmVyZW5jZXNgJyksXG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGljb246IHtcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaWNvbicsICdBbiBpY29uIHRoYXQgcmVwcmVzZW50cyB0aGlzIHRvb2wuIEVpdGhlciBhIGZpbGUgcGF0aCwgYW4gb2JqZWN0IHdpdGggZmlsZSBwYXRocyBmb3IgZGFyayBhbmQgbGlnaHQgdGhlbWVzLCBvciBhIHRoZW1lIGljb24gcmVmZXJlbmNlLCBsaWtlIFwiXFxcXCQoemFwKVwiJyksXG5cdFx0XHRcdFx0YW55T2Y6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGxpZ2h0OiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdpY29uLmxpZ2h0JywgJ0ljb24gcGF0aCB3aGVuIGEgbGlnaHQgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRhcms6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ljb24uZGFyaycsICdJY29uIHBhdGggd2hlbiBhIGRhcmsgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbmRpdGlvbicsIFwiQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSBmb3IgdGhpcyB0b29sIHRvIGJlIGVuYWJsZWQuIE5vdGUgdGhhdCBhIHRvb2wgbWF5IHN0aWxsIGJlIGludm9rZWQgYnkgYW5vdGhlciBleHRlbnNpb24gZXZlbiB3aGVuIGl0cyBgd2hlbmAgY29uZGl0aW9uIGlzIGZhbHNlLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0YWdzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0b29sVGFncycsIFwiQSBzZXQgb2YgdGFncyB0aGF0IHJvdWdobHkgZGVzY3JpYmUgdGhlIHRvb2wncyBjYXBhYmlsaXRpZXMuIEEgdG9vbCB1c2VyIG1heSB1c2UgdGhlc2UgdG8gZmlsdGVyIHRoZSBzZXQgb2YgdG9vbHMgdG8ganVzdCBvbmVzIHRoYXQgYXJlIHJlbGV2YW50IGZvciB0aGUgdGFzayBhdCBoYW5kLCBvciB0aGV5IG1heSB3YW50IHRvIHBpY2sgYSB0YWcgdGhhdCBjYW4gYmUgdXNlZCB0byBpZGVudGlmeSBqdXN0IHRoZSB0b29scyBjb250cmlidXRlZCBieSB0aGlzIGV4dGVuc2lvbi5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXig/IWNvcGlsb3RffHZzY29kZV8pJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhd1Rvb2xTZXRDb250cmlidXRpb24ge1xuXHRuYW1lOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZFxuXHQgKi9cblx0cmVmZXJlbmNlTmFtZT86IHN0cmluZztcblx0bGVnYWN5RnVsbE5hbWVzPzogc3RyaW5nW107XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGljb24/OiBzdHJpbmc7XG5cdHRvb2xzOiBzdHJpbmdbXTtcbn1cblxuY29uc3QgbGFuZ3VhZ2VNb2RlbFRvb2xTZXRzRXh0ZW5zaW9uUG9pbnQgPSBleHRlbnNpb25zUmVnaXN0cnkuRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVJhd1Rvb2xTZXRDb250cmlidXRpb25bXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2xhbmd1YWdlTW9kZWxUb29sU2V0cycsXG5cdGRlcHM6IFtsYW5ndWFnZU1vZGVsVG9vbHNFeHRlbnNpb25Qb2ludF0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudG9vbFNldHMnLCAnQ29udHJpYnV0ZXMgYSBzZXQgb2YgbGFuZ3VhZ2UgbW9kZWwgdG9vbHMgdGhhdCBjYW4gYmUgdXNlZCB0b2dldGhlci4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdG5hbWU6ICckezF9Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJyR7Mn0nLFxuXHRcdFx0XHRcdHRvb2xzOiBbJyR7M30nXVxuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnLCAnZGVzY3JpcHRpb24nLCAndG9vbHMnXSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9vbFNldE5hbWUnLCBcIkEgbmFtZSBmb3IgdGhpcyB0b29sIHNldC4gVXNlZCBhcyByZWZlcmVuY2UgYW5kIHNob3VsZCBub3QgY29udGFpbiB3aGl0ZXNwYWNlLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRwYXR0ZXJuOiAnXltcXFxcdy1dKyQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0b29sU2V0RGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2YgdGhpcyB0b29sIHNldC5cIiksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjoge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0b29sU2V0SWNvbicsIFwiQW4gaWNvbiB0aGF0IHJlcHJlc2VudHMgdGhpcyB0b29sIHNldCwgbGlrZSB7MH1cIiwgJ2AkKHphcClgJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbHM6IHtcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndG9vbFNldFRvb2xzJywgXCJBIGxpc3Qgb2YgdG9vbHMgb3IgdG9vbCBzZXRzIHRvIGluY2x1ZGUgaW4gdGhpcyB0b29sIHNldC4gQ2Fubm90IGJlIGVtcHR5IGFuZCBtdXN0IHJlZmVyZW5jZSB0b29scyBieSB0aGVpciBgdG9vbFJlZmVyZW5jZU5hbWVgLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdG1pbkl0ZW1zOiAxLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmZ1bmN0aW9uIHRvVG9vbEtleShleHRlbnNpb25JZGVudGlmaWVyOiBFeHRlbnNpb25JZGVudGlmaWVyLCB0b29sTmFtZTogc3RyaW5nKSB7XG5cdHJldHVybiBgJHtleHRlbnNpb25JZGVudGlmaWVyLnZhbHVlfS8ke3Rvb2xOYW1lfWA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b1Rvb2xTZXRLZXkoZXh0ZW5zaW9uSWRlbnRpZmllcjogRXh0ZW5zaW9uSWRlbnRpZmllciwgdG9vbE5hbWU6IHN0cmluZykge1xuXHRyZXR1cm4gYHRvb2xzZXQ6JHtleHRlbnNpb25JZGVudGlmaWVyLnZhbHVlfS8ke3Rvb2xOYW1lfWA7XG59XG5cbi8qKiBLZXkgdXNlZCB0byByZWdpc3RlciB0aGUgYXV0by1zeW50aGVzaXplZCBwZXItZXh0ZW5zaW9uIHRvb2wgc2V0IChvbmUgcGVyIGV4dGVuc2lvbiBjb250cmlidXRpbmcgdG9vbHMgYnV0IG5vIGBsYW5ndWFnZU1vZGVsVG9vbFNldHNgKS4gKi9cbmZ1bmN0aW9uIHRvU3ludGhldGljVG9vbFNldEtleShleHRlbnNpb25JZGVudGlmaWVyOiBFeHRlbnNpb25JZGVudGlmaWVyKSB7XG5cdHJldHVybiBgc3ludGhldGljLXRvb2xzZXQ6JHtleHRlbnNpb25JZGVudGlmaWVyLnZhbHVlfWA7XG59XG5cbmV4cG9ydCBjbGFzcyBMYW5ndWFnZU1vZGVsVG9vbHNFeHRlbnNpb25Qb2ludEhhbmRsZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnRvb2xzRXh0ZW5zaW9uUG9pbnRIYW5kbGVyJztcblxuXHRwcml2YXRlIF9yZWdpc3RyYXRpb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdGxhbmd1YWdlTW9kZWxUb29sc0V4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoKF9leHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Ly8gQ29sbGVjdCB0b29scyB3ZSBzdWNjZXNzZnVsbHkgcmVnaXN0ZXIgc28gd2UgY2FuIHN5bnRoZXNpemUgYSBwZXItZXh0ZW5zaW9uIHRvb2wgc2V0IGJlbG93XG5cdFx0XHRcdC8vIGZvciBleHRlbnNpb25zIHRoYXQgZG9uJ3Qgc2hpcCB0aGVpciBvd24gYGxhbmd1YWdlTW9kZWxUb29sU2V0c2AgY29udHJpYnV0aW9uLlxuXHRcdFx0XHRjb25zdCBzdWNjZXNzZnVsbHlSZWdpc3RlcmVkVG9vbHM6IElUb29sRGF0YVtdID0gW107XG5cdFx0XHRcdGxldCBleHRlbnNpb25Tb3VyY2U6IFRvb2xEYXRhU291cmNlIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgcmF3VG9vbCBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHRpZiAoIXJhd1Rvb2wubmFtZSB8fCAhcmF3VG9vbC5tb2RlbERlc2NyaXB0aW9uIHx8ICFyYXdUb29sLmRpc3BsYXlOYW1lKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBFeHRlbnNpb24gJyR7ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9JyBDQU5OT1QgcmVnaXN0ZXIgdG9vbCB3aXRob3V0IG5hbWUsIG1vZGVsRGVzY3JpcHRpb24sIGFuZCBkaXNwbGF5TmFtZTogJHtKU09OLnN0cmluZ2lmeShyYXdUb29sKX1gKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICghcmF3VG9vbC5uYW1lLm1hdGNoKC9eW1xcdy1dKyQvKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfScgQ0FOTk9UIHJlZ2lzdGVyIHRvb2wgd2l0aCBpbnZhbGlkIGlkOiAke3Jhd1Rvb2wubmFtZX0uIFRoZSBpZCBtdXN0IG1hdGNoIC9eW1xcXFx3LV0rJC8uYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocmF3VG9vbC5jYW5CZVJlZmVyZW5jZWRJblByb21wdCAmJiAhcmF3VG9vbC50b29sUmVmZXJlbmNlTmFtZSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfScgQ0FOTk9UIHJlZ2lzdGVyIHRvb2wgd2l0aCAnY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQnIHNldCB3aXRob3V0IGEgJ3Rvb2xSZWZlcmVuY2VOYW1lJzogJHtKU09OLnN0cmluZ2lmeShyYXdUb29sKX1gKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICgocmF3VG9vbC5uYW1lLnN0YXJ0c1dpdGgoJ2NvcGlsb3RfJykgfHwgcmF3VG9vbC5uYW1lLnN0YXJ0c1dpdGgoJ3ZzY29kZV8nKSkgJiYgIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NoYXRQYXJ0aWNpcGFudFByaXZhdGUnKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgRXh0ZW5zaW9uICcke2V4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLnZhbHVlfScgQ0FOTk9UIHJlZ2lzdGVyIHRvb2wgd2l0aCBuYW1lIHN0YXJ0aW5nIHdpdGggXCJ2c2NvZGVfXCIgb3IgXCJjb3BpbG90X1wiYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocmF3VG9vbC50YWdzPy5zb21lKHRhZyA9PiB0YWcuc3RhcnRzV2l0aCgnY29waWxvdF8nKSB8fCB0YWcuc3RhcnRzV2l0aCgndnNjb2RlXycpKSAmJiAhaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBFeHRlbnNpb24gJyR7ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWV9JyBDQU5OT1QgcmVnaXN0ZXIgdG9vbCB3aXRoIHRhZ3Mgc3RhcnRpbmcgd2l0aCBcInZzY29kZV9cIiBvciBcImNvcGlsb3RfXCJgKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocmF3VG9vbC5sZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzICYmICFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJykpIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCB1c2UgJ2xlZ2FjeVRvb2xSZWZlcmVuY2VGdWxsTmFtZXMnIHdpdGhvdXQgdGhlICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyBBUEkgcHJvcG9zYWwgZW5hYmxlZGApO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgcmF3SWNvbiA9IHJhd1Rvb2wuaWNvbjtcblx0XHRcdFx0XHRsZXQgaWNvbjogSVRvb2xEYXRhWydpY29uJ10gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiByYXdJY29uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0aWNvbiA9IFRoZW1lSWNvbi5mcm9tU3RyaW5nKHJhd0ljb24pID8/IHtcblx0XHRcdFx0XHRcdFx0ZGFyazogam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCByYXdJY29uKSxcblx0XHRcdFx0XHRcdFx0bGlnaHQ6IGpvaW5QYXRoKGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgcmF3SWNvbilcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChyYXdJY29uKSB7XG5cdFx0XHRcdFx0XHRpY29uID0ge1xuXHRcdFx0XHRcdFx0XHRkYXJrOiBqb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIHJhd0ljb24uZGFyayksXG5cdFx0XHRcdFx0XHRcdGxpZ2h0OiBqb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIHJhd0ljb24ubGlnaHQpXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIElmIE9TUyBhbmQgdGhlIHByb2R1Y3QuanNvbiBpcyBub3Qgc2V0IHVwLCBmYWxsIGJhY2sgdG8gY2hlY2tpbmcgYXBpIHByb3Bvc2FsXG5cdFx0XHRcdFx0Y29uc3QgY2hhdEV4dGVuc2lvbklkID0gcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkO1xuXHRcdFx0XHRcdGNvbnN0IGlzQnVpbHRpblRvb2wgPSBjaGF0RXh0ZW5zaW9uSWQgP1xuXHRcdFx0XHRcdFx0RXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIGNoYXRFeHRlbnNpb25JZCkgOlxuXHRcdFx0XHRcdFx0aXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc291cmNlOiBUb29sRGF0YVNvdXJjZSA9IGlzQnVpbHRpblRvb2xcblx0XHRcdFx0XHRcdD8gVG9vbERhdGFTb3VyY2UuSW50ZXJuYWxcblx0XHRcdFx0XHRcdDogeyB0eXBlOiAnZXh0ZW5zaW9uJywgbGFiZWw6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uZGVzY3JpcHRpb24ubmFtZSwgZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyIH07XG5cblx0XHRcdFx0XHRjb25zdCB0b29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRcdFx0XHQuLi5yYXdUb29sLFxuXHRcdFx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHRcdFx0aW5wdXRTY2hlbWE6IHJhd1Rvb2wuaW5wdXRTY2hlbWEsXG5cdFx0XHRcdFx0XHRpZDogcmF3VG9vbC5uYW1lLFxuXHRcdFx0XHRcdFx0aWNvbixcblx0XHRcdFx0XHRcdHdoZW46IHJhd1Rvb2wud2hlbiA/IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKHJhd1Rvb2wud2hlbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRhbHdheXNEaXNwbGF5SW5wdXRPdXRwdXQ6ICFpc0J1aWx0aW5Ub29sLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25EaXNwb3NhYmxlcy5zZXQodG9Ub29sS2V5KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCByYXdUb29sLm5hbWUpLCBkaXNwb3NhYmxlKTtcblx0XHRcdFx0XHRcdHN1Y2Nlc3NmdWxseVJlZ2lzdGVyZWRUb29scy5wdXNoKHRvb2wpO1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uU291cmNlID8/PSBzb3VyY2U7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgRmFpbGVkIHRvIHJlZ2lzdGVyIHRvb2wgJyR7cmF3VG9vbC5uYW1lfSc6ICR7ZX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTeW50aGVzaXplIGEgcGVyLWV4dGVuc2lvbiB0b29sIHNldCBzbyB0aGUgZXh0ZW5zaW9uIHN1cmZhY2VzIGFzIHNpbmdsZSByb3cgaW4gdGhlIENoYXQgQ3VzdG9taXphdGlvbnMuXG5cdFx0XHRcdGNvbnN0IGhhc093blRvb2xTZXRzID0gIWlzRmFsc3lPckVtcHR5KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5jb250cmlidXRlcz8ubGFuZ3VhZ2VNb2RlbFRvb2xTZXRzKTtcblx0XHRcdFx0aWYgKCFoYXNPd25Ub29sU2V0cyAmJiBleHRlbnNpb25Tb3VyY2U/LnR5cGUgPT09ICdleHRlbnNpb24nICYmIHN1Y2Nlc3NmdWxseVJlZ2lzdGVyZWRUb29scy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3ludGhldGljS2V5ID0gdG9TeW50aGV0aWNUb29sU2V0S2V5KGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyKTtcblx0XHRcdFx0XHRjb25zdCB0b29sU2V0ID0gbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uU291cmNlLFxuXHRcdFx0XHRcdFx0c3ludGhldGljS2V5LFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGljb246IENvZGljb24uZXh0ZW5zaW9ucyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uZGVzY3JpcHRpb24ubmFtZSxcblx0XHRcdFx0XHRcdFx0aGlkZGVuSW5Ub29sc1BpY2tlcjogdHJ1ZSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdHN0b3JlLmFkZCh0b29sU2V0KTtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHQgb2Ygc3VjY2Vzc2Z1bGx5UmVnaXN0ZXJlZFRvb2xzKSB7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZCh0b29sU2V0LmFkZFRvb2wodCwgdHgpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25EaXNwb3NhYmxlcy5zZXQoc3ludGhldGljS2V5LCBzdG9yZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHRvU3ludGhldGljVG9vbFNldEtleShleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllcikpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgZXh0ZW5zaW9uLnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0cmF0aW9uRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZSh0b1Rvb2xLZXkoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHRvb2wubmFtZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRsYW5ndWFnZU1vZGVsVG9vbFNldHNFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChfZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblxuXHRcdFx0XHRpZiAoIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NvbnRyaWJMYW5ndWFnZU1vZGVsVG9vbFNldHMnKSkge1xuXHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IoYEV4dGVuc2lvbiAnJHtleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZX0nIENBTk5PVCByZWdpc3RlciBsYW5ndWFnZSBtb2RlbCB0b29scyBiZWNhdXNlIHRoZSAnY29udHJpYkxhbmd1YWdlTW9kZWxUb29sU2V0cycgQVBJIHByb3Bvc2FsIGlzIG5vdCBlbmFibGVkLmApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2hhdEV4dGVuc2lvbklkID0gcHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkO1xuXHRcdFx0XHRjb25zdCBpc0J1aWx0aW5Ub29sID0gY2hhdEV4dGVuc2lvbklkID9cblx0XHRcdFx0XHRFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyhleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllciwgY2hhdEV4dGVuc2lvbklkKSA6XG5cdFx0XHRcdFx0aXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXG5cdFx0XHRcdGNvbnN0IHNvdXJjZTogVG9vbERhdGFTb3VyY2UgPSBpc0J1aWx0aW5Ub29sXG5cdFx0XHRcdFx0PyBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbFxuXHRcdFx0XHRcdDogeyB0eXBlOiAnZXh0ZW5zaW9uJywgbGFiZWw6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uZGVzY3JpcHRpb24ubmFtZSwgZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5pZGVudGlmaWVyIH07XG5cblxuXHRcdFx0XHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgZXh0ZW5zaW9uLnZhbHVlKSB7XG5cblx0XHRcdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZSh0b29sU2V0Lm5hbWUpKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBUb29sIHNldCAnJHt0b29sU2V0Lm5hbWV9JyBDQU5OT1QgaGF2ZSBhbiBlbXB0eSBuYW1lYCk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodG9vbFNldC5sZWdhY3lGdWxsTmFtZXMgJiYgIWlzUHJvcG9zZWRBcGlFbmFibGVkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgJ2NvbnRyaWJMYW5ndWFnZU1vZGVsVG9vbFNldHMnKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgVG9vbCBzZXQgJyR7dG9vbFNldC5uYW1lfScgQ0FOTk9UIHVzZSAnbGVnYWN5RnVsbE5hbWVzJyB3aXRob3V0IHRoZSAnY29udHJpYkxhbmd1YWdlTW9kZWxUb29sU2V0cycgQVBJIHByb3Bvc2FsIGVuYWJsZWRgKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChpc0ZhbHN5T3JFbXB0eSh0b29sU2V0LnRvb2xzKSkge1xuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihgVG9vbCBzZXQgJyR7dG9vbFNldC5uYW1lfScgQ0FOTk9UIGhhdmUgYW4gZW1wdHkgdG9vbHMgYXJyYXlgKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHRvb2xzOiBJVG9vbERhdGFbXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xTZXRzOiBJVG9vbFNldFtdID0gW107XG5cdFx0XHRcdFx0Y29uc3QgbWlzc2luZ1Rvb2xOYW1lczogc3RyaW5nW10gPSBbXTtcblxuXHRcdFx0XHRcdGZvciAoY29uc3QgdG9vbE5hbWUgb2YgdG9vbFNldC50b29scykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9vbE9iaiA9IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0VG9vbEJ5TmFtZSh0b29sTmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAodG9vbE9iaikge1xuXHRcdFx0XHRcdFx0XHR0b29scy5wdXNoKHRvb2xPYmopO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHRvb2xTZXRPYmogPSBsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldFRvb2xTZXRCeU5hbWUodG9vbE5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKHRvb2xTZXRPYmopIHtcblx0XHRcdFx0XHRcdFx0dG9vbFNldHMucHVzaCh0b29sU2V0T2JqKTtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRtaXNzaW5nVG9vbE5hbWVzLnB1c2godG9vbE5hbWUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0b29sU2V0cy5sZW5ndGggPT09IDAgJiYgdG9vbHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGBUb29sIHNldCAnJHt0b29sU2V0Lm5hbWV9JyBDQU5OT1QgaGF2ZSBhbiBlbXB0eSB0b29scyBhcnJheSAobm9uZSBvZiB0aGUgdG9vbHMgd2VyZSBmb3VuZClgKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRcdGNvbnN0IHJlZmVyZW5jZU5hbWUgPSB0b29sU2V0LnJlZmVyZW5jZU5hbWUgPz8gdG9vbFNldC5uYW1lO1xuXHRcdFx0XHRcdGNvbnN0IGV4aXN0aW5nVG9vbFNldCA9IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0VG9vbFNldEJ5TmFtZShyZWZlcmVuY2VOYW1lKTtcblx0XHRcdFx0XHRjb25zdCBtZXJnZUV4aXN0aW5nID0gaXNCdWlsdGluVG9vbCAmJiBleGlzdGluZ1Rvb2xTZXQ/LnNvdXJjZSA9PT0gVG9vbERhdGFTb3VyY2UuSW50ZXJuYWw7XG5cblx0XHRcdFx0XHRsZXQgb2JqOiBUb29sU2V0ICYgSURpc3Bvc2FibGU7XG5cdFx0XHRcdFx0Ly8gQWxsb3cgYnVpbHQtaW4gdG9vbCB0byB1cGRhdGUgdGhlIHRvb2wgc2V0IGlmIGl0IGFscmVhZHkgZXhpc3RzXG5cdFx0XHRcdFx0aWYgKG1lcmdlRXhpc3RpbmcpIHtcblx0XHRcdFx0XHRcdG9iaiA9IGV4aXN0aW5nVG9vbFNldCBhcyBUb29sU2V0ICYgSURpc3Bvc2FibGU7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdG9iaiA9IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFx0XHRcdFx0c291cmNlLFxuXHRcdFx0XHRcdFx0XHR0b1Rvb2xTZXRLZXkoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHRvb2xTZXQubmFtZSksXG5cdFx0XHRcdFx0XHRcdHJlZmVyZW5jZU5hbWUsXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRpY29uOiB0b29sU2V0Lmljb24gPyBUaGVtZUljb24uZnJvbVN0cmluZyh0b29sU2V0Lmljb24pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0b29sU2V0LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdGxlZ2FjeUZ1bGxOYW1lczogdG9vbFNldC5sZWdhY3lGdWxsTmFtZXMsXG5cdFx0XHRcdFx0XHRcdFx0Ly8gQnVpbHQtaW4gdG9vbCBzZXRzIGFyZSBkZXByZWNhdGVkIGFuZCBoaWRkZW4gZnJvbSBDaGF0IEN1c3RvbWl6YXRpb25zIFx1MjE5MiBUb29sczsgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIHNldHMgc3VyZmFjZSB0aGVyZS5cblx0XHRcdFx0XHRcdFx0XHRkZXByZWNhdGVkOiBzb3VyY2UudHlwZSAhPT0gJ2V4dGVuc2lvbicsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFtZXJnZUV4aXN0aW5nKSB7XG5cdFx0XHRcdFx0XHRcdHN0b3JlLmFkZChvYmopO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dG9vbHMuZm9yRWFjaCh0b29sID0+IHN0b3JlLmFkZChvYmouYWRkVG9vbCh0b29sLCB0eCkpKTtcblx0XHRcdFx0XHRcdHRvb2xTZXRzLmZvckVhY2godG9vbFNldCA9PiBzdG9yZS5hZGQob2JqLmFkZFRvb2xTZXQodG9vbFNldCwgdHgpKSk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyBMaXN0ZW4gZm9yIGxhdGUtcmVnaXN0ZXJlZCB0b29scyB0aGF0IHdlcmVuJ3QgYXZhaWxhYmxlIGF0IGNvbnRyaWJ1dGlvbiB0aW1lXG5cdFx0XHRcdFx0aWYgKG1pc3NpbmdUb29sTmFtZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGVuZGluZyA9IG5ldyBTZXQobWlzc2luZ1Rvb2xOYW1lcyk7XG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHN0b3JlLmFkZChsYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlVG9vbHMoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHRvb2xOYW1lIG9mIHBlbmRpbmcpIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCB0b29sT2JqID0gbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRUb29sQnlOYW1lKHRvb2xOYW1lKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAodG9vbE9iaikge1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RvcmUuYWRkKG9iai5hZGRUb29sKHRvb2xPYmopKTtcblx0XHRcdFx0XHRcdFx0XHRcdHBlbmRpbmcuZGVsZXRlKHRvb2xOYW1lKTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgdG9vbFNldE9iaiA9IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0VG9vbFNldEJ5TmFtZSh0b29sTmFtZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodG9vbFNldE9iaikge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRzdG9yZS5hZGQob2JqLmFkZFRvb2xTZXQodG9vbFNldE9iaikpO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRwZW5kaW5nLmRlbGV0ZSh0b29sTmFtZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChwZW5kaW5nLnNpemUgPT09IDApIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBkb25lXG5cdFx0XHRcdFx0XHRcdFx0c3RvcmUuZGVsZXRlKGxpc3RlbmVyKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdHJhdGlvbkRpc3Bvc2FibGVzLnNldCh0b1Rvb2xTZXRLZXkoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmlkZW50aWZpZXIsIHRvb2xTZXQubmFtZSksIHN0b3JlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RyYXRpb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKHRvVG9vbFNldEtleShleHRlbnNpb24uZGVzY3JpcHRpb24uaWRlbnRpZmllciwgdG9vbFNldC5uYW1lKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5cbi8vIC0tLSByZW5kZXJcblxuY2xhc3MgTGFuZ3VhZ2VNb2RlbFRvb2xEYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8ubGFuZ3VhZ2VNb2RlbFRvb2xzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjb250cmlicyA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5sYW5ndWFnZU1vZGVsVG9vbHMgPz8gW107XG5cdFx0aWYgKCFjb250cmlicy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRsb2NhbGl6ZSgndG9vbFRhYmxlTmFtZScsIFwiTmFtZVwiKSxcblx0XHRcdGxvY2FsaXplKCd0b29sVGFibGVEaXNwbGF5TmFtZScsIFwiRGlzcGxheSBOYW1lXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rvb2xUYWJsZURlc2NyaXB0aW9uJywgXCJEZXNjcmlwdGlvblwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYnMubWFwKHQgPT4ge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKGBcXGAke3QubmFtZX1cXGBgKSxcblx0XHRcdFx0dC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0dC51c2VyRGVzY3JpcHRpb24gPz8gdC5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0XTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHJvd3Ncblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnbGFuZ3VhZ2VNb2RlbFRvb2xzJyxcblx0bGFiZWw6IGxvY2FsaXplKCdsYW5nTW9kZWxUb29scycsIFwiTGFuZ3VhZ2UgTW9kZWwgVG9vbHNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihMYW5ndWFnZU1vZGVsVG9vbERhdGFSZW5kZXJlciksXG59KTtcblxuXG5jbGFzcyBMYW5ndWFnZU1vZGVsVG9vbFNldERhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/Lmxhbmd1YWdlTW9kZWxUb29sU2V0cztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29udHJpYnMgPSBtYW5pZmVzdC5jb250cmlidXRlcz8ubGFuZ3VhZ2VNb2RlbFRvb2xTZXRzID8/IFtdO1xuXHRcdGlmICghY29udHJpYnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB7IGhlYWRlcnM6IFtdLCByb3dzOiBbXSB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0gW1xuXHRcdFx0bG9jYWxpemUoJ25hbWUnLCBcIk5hbWVcIiksXG5cdFx0XHRsb2NhbGl6ZSgncmVmZXJlbmNlJywgXCJSZWZlcmVuY2UgTmFtZVwiKSxcblx0XHRcdGxvY2FsaXplKCd0b29scycsIFwiVG9vbHNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnZGVzY3JpcHRpb25zJywgXCJEZXNjcmlwdGlvblwiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYnMubWFwKHQgPT4ge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKGBcXGAke3QubmFtZX1cXGBgKSxcblx0XHRcdFx0dC5yZWZlcmVuY2VOYW1lID8gbmV3IE1hcmtkb3duU3RyaW5nKGBcXGAjJHt0LnJlZmVyZW5jZU5hbWV9XFxgYCkgOiAnbm9uZScsXG5cdFx0XHRcdHQudG9vbHMuam9pbignLCAnKSxcblx0XHRcdFx0dC5kZXNjcmlwdGlvbixcblx0XHRcdF07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2xhbmd1YWdlTW9kZWxUb29sU2V0cycsXG5cdGxhYmVsOiBsb2NhbGl6ZSgnbGFuZ01vZGVsVG9vbFNldHMnLCBcIkxhbmd1YWdlIE1vZGVsIFRvb2wgU2V0c1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKExhbmd1YWdlTW9kZWxUb29sU2V0RGF0YVJlbmRlcmVyKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxZQUFZLGVBQWUsdUJBQW9DO0FBQ3hFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsa0JBQW1IO0FBQzVILFNBQVMsNEJBQTRCO0FBQ3JDLFlBQVksd0JBQXdCO0FBQ3BDLFNBQVMsNEJBQWlELHNCQUErQjtBQUN6RixTQUFTLHFDQUFxQztBQWdCOUMsTUFBTSxtQ0FBbUMsbUJBQW1CLG1CQUFtQix1QkFBK0M7QUFBQSxFQUM3SCxnQkFBZ0I7QUFBQSxFQUNoQiwyQkFBMkIsV0FBVyxlQUFnRDtBQUNyRixlQUFXLFdBQVcsZUFBZTtBQUNwQyxZQUFNLHVCQUF1QixRQUFRLElBQUk7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUNBLFlBQVk7QUFBQSxJQUNYLGFBQWEsU0FBUyxzQ0FBc0MsNkpBQTZKO0FBQUEsSUFDek4sTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ04sc0JBQXNCO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04saUJBQWlCLENBQUM7QUFBQSxRQUNqQixNQUFNO0FBQUEsVUFDTCxNQUFNO0FBQUEsVUFDTixrQkFBa0I7QUFBQSxVQUNsQixhQUFhO0FBQUEsWUFDWixNQUFNO0FBQUEsWUFDTixZQUFZO0FBQUEsY0FDWCxhQUFhO0FBQUEsZ0JBQ1osTUFBTTtBQUFBLGdCQUNOLGFBQWE7QUFBQSxjQUNkO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxVQUFVLENBQUMsUUFBUSxlQUFlLGtCQUFrQjtBQUFBLE1BQ3BELFlBQVk7QUFBQSxRQUNYLE1BQU07QUFBQSxVQUNMLGFBQWEsU0FBUyxZQUFZLHdKQUF3SjtBQUFBLFVBQzFMLE1BQU07QUFBQTtBQUFBLFVBRU4sU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBLG1CQUFtQjtBQUFBLFVBQ2xCLHFCQUFxQixTQUFTLGFBQWEsOEtBQThLLDJCQUEyQjtBQUFBLFVBQ3BQLE1BQU07QUFBQSxVQUNOLFNBQVM7QUFBQSxRQUNWO0FBQUEsUUFDQSxhQUFhO0FBQUEsVUFDWixhQUFhLFNBQVMsbUJBQW1CLGdGQUFnRjtBQUFBLFVBQ3pILE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxpQkFBaUI7QUFBQSxVQUNoQixhQUFhLFNBQVMsdUJBQXVCLDJEQUEyRDtBQUFBLFVBQ3hHLE1BQU07QUFBQSxRQUNQO0FBQUE7QUFBQSxRQUVBLGtCQUFrQjtBQUFBLFVBQ2pCLGFBQWEsU0FBUyx3QkFBd0IsK0VBQStFO0FBQUEsVUFDN0gsTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLGFBQWE7QUFBQSxVQUNaLGFBQWEsU0FBUyxvQkFBb0IsNFBBQTRQO0FBQUEsVUFDdFMsTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLHlCQUF5QjtBQUFBLFVBQ3hCLHFCQUFxQixTQUFTLDJCQUEyQixpSkFBaUosOEJBQThCO0FBQUEsVUFDeE8sTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLE1BQU07QUFBQSxVQUNMLHFCQUFxQixTQUFTLFFBQVEsd0pBQXdKO0FBQUEsVUFDOUwsT0FBTztBQUFBLFlBQUM7QUFBQSxjQUNQLE1BQU07QUFBQSxZQUNQO0FBQUEsWUFDQTtBQUFBLGNBQ0MsTUFBTTtBQUFBLGNBQ04sWUFBWTtBQUFBLGdCQUNYLE9BQU87QUFBQSxrQkFDTixhQUFhLFNBQVMsY0FBYyxzQ0FBc0M7QUFBQSxrQkFDMUUsTUFBTTtBQUFBLGdCQUNQO0FBQUEsZ0JBQ0EsTUFBTTtBQUFBLGtCQUNMLGFBQWEsU0FBUyxhQUFhLHFDQUFxQztBQUFBLGtCQUN4RSxNQUFNO0FBQUEsZ0JBQ1A7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQUM7QUFBQSxRQUNGO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxxQkFBcUIsU0FBUyxhQUFhLCtKQUErSjtBQUFBLFVBQzFNLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxNQUFNO0FBQUEsVUFDTCxhQUFhLFNBQVMsWUFBWSxrUkFBa1I7QUFBQSxVQUNwVCxNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsWUFDTixNQUFNO0FBQUEsWUFDTixTQUFTO0FBQUEsVUFDVjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBY0QsTUFBTSxzQ0FBc0MsbUJBQW1CLG1CQUFtQix1QkFBa0Q7QUFBQSxFQUNuSSxnQkFBZ0I7QUFBQSxFQUNoQixNQUFNLENBQUMsZ0NBQWdDO0FBQUEsRUFDdkMsWUFBWTtBQUFBLElBQ1gsYUFBYSxTQUFTLHlDQUF5QyxzRUFBc0U7QUFBQSxJQUNySSxNQUFNO0FBQUEsSUFDTixPQUFPO0FBQUEsTUFDTixzQkFBc0I7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixpQkFBaUIsQ0FBQztBQUFBLFFBQ2pCLE1BQU07QUFBQSxVQUNMLE1BQU07QUFBQSxVQUNOLGFBQWE7QUFBQSxVQUNiLE9BQU8sQ0FBQyxNQUFNO0FBQUEsUUFDZjtBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0QsVUFBVSxDQUFDLFFBQVEsZUFBZSxPQUFPO0FBQUEsTUFDekMsWUFBWTtBQUFBLFFBQ1gsTUFBTTtBQUFBLFVBQ0wsYUFBYSxTQUFTLGVBQWUsZ0ZBQWdGO0FBQUEsVUFDckgsTUFBTTtBQUFBLFVBQ04sU0FBUztBQUFBLFFBQ1Y7QUFBQSxRQUNBLGFBQWE7QUFBQSxVQUNaLGFBQWEsU0FBUyxzQkFBc0IsaUNBQWlDO0FBQUEsVUFDN0UsTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLE1BQU07QUFBQSxVQUNMLHFCQUFxQixTQUFTLGVBQWUsbURBQW1ELFVBQVU7QUFBQSxVQUMxRyxNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0EsT0FBTztBQUFBLFVBQ04scUJBQXFCLFNBQVMsZ0JBQWdCLGtJQUFrSTtBQUFBLFVBQ2hMLE1BQU07QUFBQSxVQUNOLFVBQVU7QUFBQSxVQUNWLE9BQU87QUFBQSxZQUNOLE1BQU07QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxTQUFTLFVBQVUscUJBQTBDLFVBQWtCO0FBQzlFLFNBQU8sR0FBRyxvQkFBb0IsS0FBSyxJQUFJLFFBQVE7QUFDaEQ7QUFFTyxTQUFTLGFBQWEscUJBQTBDLFVBQWtCO0FBQ3hGLFNBQU8sV0FBVyxvQkFBb0IsS0FBSyxJQUFJLFFBQVE7QUFDeEQ7QUFHQSxTQUFTLHNCQUFzQixxQkFBMEM7QUFDeEUsU0FBTyxxQkFBcUIsb0JBQW9CLEtBQUs7QUFDdEQ7QUFFTyxJQUFNLDBDQUFOLE1BQWdGO0FBQUEsRUFLdEYsWUFDa0IsZ0JBQ1csMkJBQzNCO0FBTEYsU0FBUSwyQkFBMkIsSUFBSSxjQUFzQjtBQU81RCxxQ0FBaUMsV0FBVyxDQUFDLGFBQWEsVUFBVTtBQUNuRSxpQkFBVyxhQUFhLE1BQU0sT0FBTztBQUdwQyxjQUFNLDhCQUEyQyxDQUFDO0FBQ2xELFlBQUk7QUFFSixtQkFBVyxXQUFXLFVBQVUsT0FBTztBQUN0QyxjQUFJLENBQUMsUUFBUSxRQUFRLENBQUMsUUFBUSxvQkFBb0IsQ0FBQyxRQUFRLGFBQWE7QUFDdkUsc0JBQVUsVUFBVSxNQUFNLGNBQWMsVUFBVSxZQUFZLFdBQVcsS0FBSywyRUFBMkUsS0FBSyxVQUFVLE9BQU8sQ0FBQyxFQUFFO0FBQ2xMO0FBQUEsVUFDRDtBQUVBLGNBQUksQ0FBQyxRQUFRLEtBQUssTUFBTSxVQUFVLEdBQUc7QUFDcEMsc0JBQVUsVUFBVSxNQUFNLGNBQWMsVUFBVSxZQUFZLFdBQVcsS0FBSywyQ0FBMkMsUUFBUSxJQUFJLGtDQUFrQztBQUN2SztBQUFBLFVBQ0Q7QUFFQSxjQUFJLFFBQVEsMkJBQTJCLENBQUMsUUFBUSxtQkFBbUI7QUFDbEUsc0JBQVUsVUFBVSxNQUFNLGNBQWMsVUFBVSxZQUFZLFdBQVcsS0FBSyw0RkFBNEYsS0FBSyxVQUFVLE9BQU8sQ0FBQyxFQUFFO0FBQ25NO0FBQUEsVUFDRDtBQUVBLGVBQUssUUFBUSxLQUFLLFdBQVcsVUFBVSxLQUFLLFFBQVEsS0FBSyxXQUFXLFNBQVMsTUFBTSxDQUFDLHFCQUFxQixVQUFVLGFBQWEsd0JBQXdCLEdBQUc7QUFDMUosc0JBQVUsVUFBVSxNQUFNLGNBQWMsVUFBVSxZQUFZLFdBQVcsS0FBSyx3RUFBd0U7QUFDdEo7QUFBQSxVQUNEO0FBRUEsY0FBSSxRQUFRLE1BQU0sS0FBSyxTQUFPLElBQUksV0FBVyxVQUFVLEtBQUssSUFBSSxXQUFXLFNBQVMsQ0FBQyxLQUFLLENBQUMscUJBQXFCLFVBQVUsYUFBYSx3QkFBd0IsR0FBRztBQUNqSyxzQkFBVSxVQUFVLE1BQU0sY0FBYyxVQUFVLFlBQVksV0FBVyxLQUFLLHdFQUF3RTtBQUFBLFVBQ3ZKO0FBRUEsY0FBSSxRQUFRLGdDQUFnQyxDQUFDLHFCQUFxQixVQUFVLGFBQWEsd0JBQXdCLEdBQUc7QUFDbkgsc0JBQVUsVUFBVSxNQUFNLGNBQWMsVUFBVSxZQUFZLFdBQVcsS0FBSyx1R0FBdUc7QUFDckw7QUFBQSxVQUNEO0FBRUEsZ0JBQU0sVUFBVSxRQUFRO0FBQ3hCLGNBQUk7QUFDSixjQUFJLE9BQU8sWUFBWSxVQUFVO0FBQ2hDLG1CQUFPLFVBQVUsV0FBVyxPQUFPLEtBQUs7QUFBQSxjQUN2QyxNQUFNLFNBQVMsVUFBVSxZQUFZLG1CQUFtQixPQUFPO0FBQUEsY0FDL0QsT0FBTyxTQUFTLFVBQVUsWUFBWSxtQkFBbUIsT0FBTztBQUFBLFlBQ2pFO0FBQUEsVUFDRCxXQUFXLFNBQVM7QUFDbkIsbUJBQU87QUFBQSxjQUNOLE1BQU0sU0FBUyxVQUFVLFlBQVksbUJBQW1CLFFBQVEsSUFBSTtBQUFBLGNBQ3BFLE9BQU8sU0FBUyxVQUFVLFlBQVksbUJBQW1CLFFBQVEsS0FBSztBQUFBLFlBQ3ZFO0FBQUEsVUFDRDtBQUdBLGdCQUFNLGtCQUFrQixlQUFlLGtCQUFrQjtBQUN6RCxnQkFBTSxnQkFBZ0Isa0JBQ3JCLG9CQUFvQixPQUFPLFVBQVUsWUFBWSxZQUFZLGVBQWUsSUFDNUUscUJBQXFCLFVBQVUsYUFBYSx3QkFBd0I7QUFFckUsZ0JBQU0sU0FBeUIsZ0JBQzVCLGVBQWUsV0FDZixFQUFFLE1BQU0sYUFBYSxPQUFPLFVBQVUsWUFBWSxlQUFlLFVBQVUsWUFBWSxNQUFNLGFBQWEsVUFBVSxZQUFZLFdBQVc7QUFFOUksZ0JBQU0sT0FBa0I7QUFBQSxZQUN2QixHQUFHO0FBQUEsWUFDSDtBQUFBLFlBQ0EsYUFBYSxRQUFRO0FBQUEsWUFDckIsSUFBSSxRQUFRO0FBQUEsWUFDWjtBQUFBLFlBQ0EsTUFBTSxRQUFRLE9BQU8sZUFBZSxZQUFZLFFBQVEsSUFBSSxJQUFJO0FBQUEsWUFDaEUsMEJBQTBCLENBQUM7QUFBQSxVQUM1QjtBQUNBLGNBQUk7QUFDSCxrQkFBTSxhQUFhLDBCQUEwQixpQkFBaUIsSUFBSTtBQUNsRSxpQkFBSyx5QkFBeUIsSUFBSSxVQUFVLFVBQVUsWUFBWSxZQUFZLFFBQVEsSUFBSSxHQUFHLFVBQVU7QUFDdkcsd0NBQTRCLEtBQUssSUFBSTtBQUNyQyxnQ0FBb0I7QUFBQSxVQUNyQixTQUFTLEdBQUc7QUFDWCxzQkFBVSxVQUFVLE1BQU0sNEJBQTRCLFFBQVEsSUFBSSxNQUFNLENBQUMsRUFBRTtBQUFBLFVBQzVFO0FBQUEsUUFDRDtBQUdBLGNBQU0saUJBQWlCLENBQUMsZUFBZSxVQUFVLFlBQVksYUFBYSxxQkFBcUI7QUFDL0YsWUFBSSxDQUFDLGtCQUFrQixpQkFBaUIsU0FBUyxlQUFlLDRCQUE0QixTQUFTLEdBQUc7QUFDdkcsZ0JBQU0sZUFBZSxzQkFBc0IsVUFBVSxZQUFZLFVBQVU7QUFDM0UsZ0JBQU0sVUFBVSwwQkFBMEI7QUFBQSxZQUN6QztBQUFBLFlBQ0E7QUFBQSxZQUNBLFVBQVUsWUFBWSxXQUFXO0FBQUEsWUFDakM7QUFBQSxjQUNDLE1BQU0sUUFBUTtBQUFBLGNBQ2QsYUFBYSxVQUFVLFlBQVksZUFBZSxVQUFVLFlBQVk7QUFBQSxjQUN4RSxxQkFBcUI7QUFBQSxZQUN0QjtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLGdCQUFNLElBQUksT0FBTztBQUNqQixzQkFBWSxRQUFNO0FBQ2pCLHVCQUFXLEtBQUssNkJBQTZCO0FBQzVDLG9CQUFNLElBQUksUUFBUSxRQUFRLEdBQUcsRUFBRSxDQUFDO0FBQUEsWUFDakM7QUFBQSxVQUNELENBQUM7QUFDRCxlQUFLLHlCQUF5QixJQUFJLGNBQWMsS0FBSztBQUFBLFFBQ3REO0FBQUEsTUFDRDtBQUVBLGlCQUFXLGFBQWEsTUFBTSxTQUFTO0FBQ3RDLGFBQUsseUJBQXlCLGlCQUFpQixzQkFBc0IsVUFBVSxZQUFZLFVBQVUsQ0FBQztBQUN0RyxtQkFBVyxRQUFRLFVBQVUsT0FBTztBQUNuQyxlQUFLLHlCQUF5QixpQkFBaUIsVUFBVSxVQUFVLFlBQVksWUFBWSxLQUFLLElBQUksQ0FBQztBQUFBLFFBQ3RHO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELHdDQUFvQyxXQUFXLENBQUMsYUFBYSxVQUFVO0FBRXRFLGlCQUFXLGFBQWEsTUFBTSxPQUFPO0FBRXBDLFlBQUksQ0FBQyxxQkFBcUIsVUFBVSxhQUFhLDhCQUE4QixHQUFHO0FBQ2pGLG9CQUFVLFVBQVUsTUFBTSxjQUFjLFVBQVUsWUFBWSxXQUFXLEtBQUssZ0hBQWdIO0FBQzlMO0FBQUEsUUFDRDtBQUVBLGNBQU0sa0JBQWtCLGVBQWUsa0JBQWtCO0FBQ3pELGNBQU0sZ0JBQWdCLGtCQUNyQixvQkFBb0IsT0FBTyxVQUFVLFlBQVksWUFBWSxlQUFlLElBQzVFLHFCQUFxQixVQUFVLGFBQWEsd0JBQXdCO0FBRXJFLGNBQU0sU0FBeUIsZ0JBQzVCLGVBQWUsV0FDZixFQUFFLE1BQU0sYUFBYSxPQUFPLFVBQVUsWUFBWSxlQUFlLFVBQVUsWUFBWSxNQUFNLGFBQWEsVUFBVSxZQUFZLFdBQVc7QUFHOUksbUJBQVcsV0FBVyxVQUFVLE9BQU87QUFFdEMsY0FBSSxvQkFBb0IsUUFBUSxJQUFJLEdBQUc7QUFDdEMsc0JBQVUsVUFBVSxNQUFNLGFBQWEsUUFBUSxJQUFJLDZCQUE2QjtBQUNoRjtBQUFBLFVBQ0Q7QUFFQSxjQUFJLFFBQVEsbUJBQW1CLENBQUMscUJBQXFCLFVBQVUsYUFBYSw4QkFBOEIsR0FBRztBQUM1RyxzQkFBVSxVQUFVLE1BQU0sYUFBYSxRQUFRLElBQUksZ0dBQWdHO0FBQ25KO0FBQUEsVUFDRDtBQUVBLGNBQUksZUFBZSxRQUFRLEtBQUssR0FBRztBQUNsQyxzQkFBVSxVQUFVLE1BQU0sYUFBYSxRQUFRLElBQUksb0NBQW9DO0FBQ3ZGO0FBQUEsVUFDRDtBQUVBLGdCQUFNLFFBQXFCLENBQUM7QUFDNUIsZ0JBQU0sV0FBdUIsQ0FBQztBQUM5QixnQkFBTSxtQkFBNkIsQ0FBQztBQUVwQyxxQkFBVyxZQUFZLFFBQVEsT0FBTztBQUNyQyxrQkFBTSxVQUFVLDBCQUEwQixjQUFjLFFBQVE7QUFDaEUsZ0JBQUksU0FBUztBQUNaLG9CQUFNLEtBQUssT0FBTztBQUNsQjtBQUFBLFlBQ0Q7QUFDQSxrQkFBTSxhQUFhLDBCQUEwQixpQkFBaUIsUUFBUTtBQUN0RSxnQkFBSSxZQUFZO0FBQ2YsdUJBQVMsS0FBSyxVQUFVO0FBQ3hCO0FBQUEsWUFDRDtBQUNBLDZCQUFpQixLQUFLLFFBQVE7QUFBQSxVQUMvQjtBQUVBLGNBQUksU0FBUyxXQUFXLEtBQUssTUFBTSxXQUFXLEdBQUc7QUFDaEQsc0JBQVUsVUFBVSxNQUFNLGFBQWEsUUFBUSxJQUFJLG1FQUFtRTtBQUN0SDtBQUFBLFVBQ0Q7QUFFQSxnQkFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLGdCQUFNLGdCQUFnQixRQUFRLGlCQUFpQixRQUFRO0FBQ3ZELGdCQUFNLGtCQUFrQiwwQkFBMEIsaUJBQWlCLGFBQWE7QUFDaEYsZ0JBQU0sZ0JBQWdCLGlCQUFpQixpQkFBaUIsV0FBVyxlQUFlO0FBRWxGLGNBQUk7QUFFSixjQUFJLGVBQWU7QUFDbEIsa0JBQU07QUFBQSxVQUNQLE9BQU87QUFDTixrQkFBTSwwQkFBMEI7QUFBQSxjQUMvQjtBQUFBLGNBQ0EsYUFBYSxVQUFVLFlBQVksWUFBWSxRQUFRLElBQUk7QUFBQSxjQUMzRDtBQUFBLGNBQ0E7QUFBQSxnQkFDQyxNQUFNLFFBQVEsT0FBTyxVQUFVLFdBQVcsUUFBUSxJQUFJLElBQUk7QUFBQSxnQkFDMUQsYUFBYSxRQUFRO0FBQUEsZ0JBQ3JCLGlCQUFpQixRQUFRO0FBQUE7QUFBQSxnQkFFekIsWUFBWSxPQUFPLFNBQVM7QUFBQSxjQUM3QjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBRUEsc0JBQVksUUFBTTtBQUNqQixnQkFBSSxDQUFDLGVBQWU7QUFDbkIsb0JBQU0sSUFBSSxHQUFHO0FBQUEsWUFDZDtBQUNBLGtCQUFNLFFBQVEsVUFBUSxNQUFNLElBQUksSUFBSSxRQUFRLE1BQU0sRUFBRSxDQUFDLENBQUM7QUFDdEQscUJBQVMsUUFBUSxDQUFBQSxhQUFXLE1BQU0sSUFBSSxJQUFJLFdBQVdBLFVBQVMsRUFBRSxDQUFDLENBQUM7QUFBQSxVQUNuRSxDQUFDO0FBR0QsY0FBSSxpQkFBaUIsU0FBUyxHQUFHO0FBQ2hDLGtCQUFNLFVBQVUsSUFBSSxJQUFJLGdCQUFnQjtBQUN4QyxrQkFBTSxXQUFXLE1BQU0sSUFBSSwwQkFBMEIsaUJBQWlCLE1BQU07QUFDM0UseUJBQVcsWUFBWSxTQUFTO0FBQy9CLHNCQUFNLFVBQVUsMEJBQTBCLGNBQWMsUUFBUTtBQUNoRSxvQkFBSSxTQUFTO0FBQ1osd0JBQU0sSUFBSSxJQUFJLFFBQVEsT0FBTyxDQUFDO0FBQzlCLDBCQUFRLE9BQU8sUUFBUTtBQUFBLGdCQUN4QixPQUFPO0FBQ04sd0JBQU0sYUFBYSwwQkFBMEIsaUJBQWlCLFFBQVE7QUFDdEUsc0JBQUksWUFBWTtBQUNmLDBCQUFNLElBQUksSUFBSSxXQUFXLFVBQVUsQ0FBQztBQUNwQyw0QkFBUSxPQUFPLFFBQVE7QUFBQSxrQkFDeEI7QUFBQSxnQkFDRDtBQUFBLGNBQ0Q7QUFDQSxrQkFBSSxRQUFRLFNBQVMsR0FBRztBQUV2QixzQkFBTSxPQUFPLFFBQVE7QUFBQSxjQUN0QjtBQUFBLFlBQ0QsQ0FBQyxDQUFDO0FBQUEsVUFDSDtBQUVBLGVBQUsseUJBQXlCLElBQUksYUFBYSxVQUFVLFlBQVksWUFBWSxRQUFRLElBQUksR0FBRyxLQUFLO0FBQUEsUUFDdEc7QUFBQSxNQUNEO0FBRUEsaUJBQVcsYUFBYSxNQUFNLFNBQVM7QUFDdEMsbUJBQVcsV0FBVyxVQUFVLE9BQU87QUFDdEMsZUFBSyx5QkFBeUIsaUJBQWlCLGFBQWEsVUFBVSxZQUFZLFlBQVksUUFBUSxJQUFJLENBQUM7QUFBQSxRQUM1RztBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUF6UGEsd0NBQ0ksS0FBSztBQURULDBDQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVO0FBOFBiLE1BQU0sc0NBQXNDLFdBQXFEO0FBQUEsRUFBakc7QUFBQTtBQUNDLFNBQVMsT0FBTztBQUFBO0FBQUEsRUFFaEIsYUFBYSxVQUF1QztBQUNuRCxXQUFPLENBQUMsQ0FBQyxTQUFTLGFBQWE7QUFBQSxFQUNoQztBQUFBLEVBRUEsT0FBTyxVQUF5RDtBQUMvRCxVQUFNLFdBQVcsU0FBUyxhQUFhLHNCQUFzQixDQUFDO0FBQzlELFFBQUksQ0FBQyxTQUFTLFFBQVE7QUFDckIsYUFBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLENBQUMsR0FBRyxNQUFNLENBQUMsRUFBRSxHQUFHLFNBQVMsTUFBTTtBQUFBLE1BQUUsRUFBRTtBQUFBLElBQzlEO0FBRUEsVUFBTSxVQUFVO0FBQUEsTUFDZixTQUFTLGlCQUFpQixNQUFNO0FBQUEsTUFDaEMsU0FBUyx3QkFBd0IsY0FBYztBQUFBLE1BQy9DLFNBQVMsd0JBQXdCLGFBQWE7QUFBQSxJQUMvQztBQUVBLFVBQU0sT0FBcUIsU0FBUyxJQUFJLE9BQUs7QUFDNUMsYUFBTztBQUFBLFFBQ04sSUFBSSxlQUFlLEtBQUssRUFBRSxJQUFJLElBQUk7QUFBQSxRQUNsQyxFQUFFO0FBQUEsUUFDRixFQUFFLG1CQUFtQixFQUFFO0FBQUEsTUFDeEI7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPO0FBQUEsTUFDTixNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTLE1BQU07QUFBQSxNQUFFO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQ0Q7QUFFQSxTQUFTLEdBQStCLFdBQVcseUJBQXlCLEVBQUUseUJBQXlCO0FBQUEsRUFDdEcsSUFBSTtBQUFBLEVBQ0osT0FBTyxTQUFTLGtCQUFrQixzQkFBc0I7QUFBQSxFQUN4RCxRQUFRO0FBQUEsSUFDUCxXQUFXO0FBQUEsRUFDWjtBQUFBLEVBQ0EsVUFBVSxJQUFJLGVBQWUsNkJBQTZCO0FBQzNELENBQUM7QUFHRCxNQUFNLHlDQUF5QyxXQUFxRDtBQUFBLEVBQXBHO0FBQUE7QUFFQyxTQUFTLE9BQU87QUFBQTtBQUFBLEVBRWhCLGFBQWEsVUFBdUM7QUFDbkQsV0FBTyxDQUFDLENBQUMsU0FBUyxhQUFhO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE9BQU8sVUFBeUQ7QUFDL0QsVUFBTSxXQUFXLFNBQVMsYUFBYSx5QkFBeUIsQ0FBQztBQUNqRSxRQUFJLENBQUMsU0FBUyxRQUFRO0FBQ3JCLGFBQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxJQUM5RDtBQUVBLFVBQU0sVUFBVTtBQUFBLE1BQ2YsU0FBUyxRQUFRLE1BQU07QUFBQSxNQUN2QixTQUFTLGFBQWEsZ0JBQWdCO0FBQUEsTUFDdEMsU0FBUyxTQUFTLE9BQU87QUFBQSxNQUN6QixTQUFTLGdCQUFnQixhQUFhO0FBQUEsSUFDdkM7QUFFQSxVQUFNLE9BQXFCLFNBQVMsSUFBSSxPQUFLO0FBQzVDLGFBQU87QUFBQSxRQUNOLElBQUksZUFBZSxLQUFLLEVBQUUsSUFBSSxJQUFJO0FBQUEsUUFDbEMsRUFBRSxnQkFBZ0IsSUFBSSxlQUFlLE1BQU0sRUFBRSxhQUFhLElBQUksSUFBSTtBQUFBLFFBQ2xFLEVBQUUsTUFBTSxLQUFLLElBQUk7QUFBQSxRQUNqQixFQUFFO0FBQUEsTUFDSDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsR0FBK0IsV0FBVyx5QkFBeUIsRUFBRSx5QkFBeUI7QUFBQSxFQUN0RyxJQUFJO0FBQUEsRUFDSixPQUFPLFNBQVMscUJBQXFCLDBCQUEwQjtBQUFBLEVBQy9ELFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxFQUNaO0FBQUEsRUFDQSxVQUFVLElBQUksZUFBZSxnQ0FBZ0M7QUFDOUQsQ0FBQzsiLAogICJuYW1lcyI6IFsidG9vbFNldCJdCn0K
