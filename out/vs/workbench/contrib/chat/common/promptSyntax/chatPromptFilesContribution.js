var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key2, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key2) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key2, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key2, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key2) => decorator(target, key2, index);
import { Disposable, DisposableMap } from "../../../../../base/common/lifecycle.js";
import { joinPath, isEqualOrParent } from "../../../../../base/common/resources.js";
import { localize } from "../../../../../nls.js";
import * as extensionsRegistry from "../../../../services/extensions/common/extensionsRegistry.js";
import { IPromptsService, PromptsStorage } from "./service/promptsService.js";
import { PromptsType } from "./promptTypes.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../../services/extensionManagement/common/extensionFeatures.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
var ChatContributionPoint = /* @__PURE__ */ ((ChatContributionPoint2) => {
  ChatContributionPoint2["chatInstructions"] = "chatInstructions";
  ChatContributionPoint2["chatAgents"] = "chatAgents";
  ChatContributionPoint2["chatPromptFiles"] = "chatPromptFiles";
  ChatContributionPoint2["chatSkills"] = "chatSkills";
  return ChatContributionPoint2;
})(ChatContributionPoint || {});
function registerChatFilesExtensionPoint(point) {
  return extensionsRegistry.ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: point,
    jsonSchema: {
      description: localize("chatContribution.schema.description", "Contributes {0} for chat prompts.", point),
      type: "array",
      items: {
        additionalProperties: false,
        type: "object",
        defaultSnippets: [{
          body: {
            path: point === "chatSkills" /* chatSkills */ ? "./relative/path/to/skill-name/SKILL.md" : "./relative/path/to/file.md"
          }
        }],
        required: ["path"],
        properties: {
          path: {
            description: point === "chatSkills" /* chatSkills */ ? localize("chatContribution.property.path.skills", 'Path to the SKILL.md file relative to the extension root. The folder name must match the "name" property in SKILL.md.') : localize("chatContribution.property.path", "Path to the file relative to the extension root."),
            type: "string"
          },
          name: {
            description: localize("chatContribution.property.name", "(Optional) Name for this entry."),
            deprecationMessage: localize("chatContribution.property.name.deprecated", 'Specify "name" in the prompt file itself instead.'),
            type: "string"
          },
          description: {
            description: localize("chatContribution.property.description", "(Optional) Description of the entry."),
            deprecationMessage: localize("chatContribution.property.description.deprecated", 'Specify "description" in the prompt file itself instead.'),
            type: "string"
          },
          when: {
            description: localize("chatContribution.property.when", "(Optional) A condition which must be true to enable this entry."),
            type: "string"
          },
          sessionTypes: {
            description: localize("chatContribution.property.sessionTypes", "(Optional) The chat session types where this entry should be offered."),
            type: "array",
            items: { type: "string" }
          }
        }
      }
    }
  });
}
const epPrompt = registerChatFilesExtensionPoint("chatPromptFiles" /* chatPromptFiles */);
const epInstructions = registerChatFilesExtensionPoint("chatInstructions" /* chatInstructions */);
const epAgents = registerChatFilesExtensionPoint("chatAgents" /* chatAgents */);
const epSkills = registerChatFilesExtensionPoint("chatSkills" /* chatSkills */);
function pointToType(contributionPoint) {
  switch (contributionPoint) {
    case "chatPromptFiles" /* chatPromptFiles */:
      return PromptsType.prompt;
    case "chatInstructions" /* chatInstructions */:
      return PromptsType.instructions;
    case "chatAgents" /* chatAgents */:
      return PromptsType.agent;
    case "chatSkills" /* chatSkills */:
      return PromptsType.skill;
    default: {
      const exhaustiveCheck = contributionPoint;
      throw new Error(`Unknown contribution point: ${exhaustiveCheck}`);
    }
  }
}
function key(extensionId, type, path) {
  return `${extensionId.value}/${type}/${path}`;
}
let ChatPromptFilesExtensionPointHandler = class {
  constructor(promptsService) {
    this.promptsService = promptsService;
    this.registrations = new DisposableMap();
    this.handle(epPrompt, "chatPromptFiles" /* chatPromptFiles */);
    this.handle(epInstructions, "chatInstructions" /* chatInstructions */);
    this.handle(epAgents, "chatAgents" /* chatAgents */);
    this.handle(epSkills, "chatSkills" /* chatSkills */);
  }
  handle(extensionPoint, contributionPoint) {
    extensionPoint.setHandler((_extensions, delta) => {
      for (const ext of delta.added) {
        const type = pointToType(contributionPoint);
        for (const raw of ext.value) {
          if (!raw.path) {
            ext.collector.error(localize("extension.missing.path", "Extension '{0}' cannot register {1} entry without path.", ext.description.identifier.value, contributionPoint));
            continue;
          }
          const fileUri = joinPath(ext.description.extensionLocation, raw.path);
          if (!isEqualOrParent(fileUri, ext.description.extensionLocation)) {
            ext.collector.error(localize("extension.invalid.path", "Extension '{0}' {1} entry '{2}' resolves outside the extension.", ext.description.identifier.value, contributionPoint, raw.path));
            continue;
          }
          if (raw.when && !ContextKeyExpr.deserialize(raw.when)) {
            ext.collector.error(localize("extension.invalid.when", "Extension '{0}' {1} entry '{2}' has an invalid when clause: '{3}'.", ext.description.identifier.value, contributionPoint, raw.path, raw.when));
            continue;
          }
          try {
            const d = this.promptsService.registerContributedFile(type, fileUri, ext.description, raw.name, raw.description, raw.when, raw.sessionTypes);
            this.registrations.set(key(ext.description.identifier, type, raw.path), d);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            ext.collector.error(localize("extension.registration.failed", "Extension '{0}' {1}. Failed to register {2}: {3}", ext.description.identifier.value, contributionPoint, raw.path, msg));
          }
        }
      }
      for (const ext of delta.removed) {
        const type = pointToType(contributionPoint);
        for (const raw of ext.value) {
          this.registrations.deleteAndDispose(key(ext.description.identifier, type, raw.path));
        }
      }
    });
  }
};
ChatPromptFilesExtensionPointHandler.ID = "workbench.contrib.chatPromptFilesExtensionPointHandler";
ChatPromptFilesExtensionPointHandler = __decorateClass([
  __decorateParam(0, IPromptsService)
], ChatPromptFilesExtensionPointHandler);
CommandsRegistry.registerCommand("_listExtensionPromptFiles", async (accessor) => {
  const promptsService = accessor.get(IPromptsService);
  const [agents, instructions, prompts, skills, hooks] = await Promise.all([
    promptsService.listPromptFiles(PromptsType.agent, CancellationToken.None),
    promptsService.listPromptFiles(PromptsType.instructions, CancellationToken.None),
    promptsService.listPromptFiles(PromptsType.prompt, CancellationToken.None),
    promptsService.listPromptFiles(PromptsType.skill, CancellationToken.None),
    promptsService.listPromptFiles(PromptsType.hook, CancellationToken.None)
  ]);
  const result = [];
  for (const file of [...agents, ...instructions, ...prompts, ...skills, ...hooks]) {
    if (file.storage === PromptsStorage.extension) {
      result.push({ uri: file.uri.toJSON(), type: file.type, extensionId: file.extension.identifier.value });
    } else if (file.storage === PromptsStorage.plugin) {
      result.push({ uri: file.uri.toJSON(), type: file.type, extensionId: file.pluginUri.toString() });
    }
  }
  return result;
});
class ChatPromptFilesDataRenderer extends Disposable {
  constructor(contributionPoint) {
    super();
    this.contributionPoint = contributionPoint;
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.[this.contributionPoint];
  }
  render(manifest) {
    const contributions = manifest.contributes?.[this.contributionPoint] ?? [];
    if (!contributions.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("chatFilesName", "Name"),
      localize("chatFilesDescription", "Description"),
      localize("chatFilesPath", "Path")
    ];
    const rows = contributions.map((d) => {
      return [
        d.name ?? "-",
        d.description ?? "-",
        d.path
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
  id: "chatPromptFiles" /* chatPromptFiles */,
  label: localize("chatPromptFiles", "Chat Prompt Files"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, ["chatPromptFiles" /* chatPromptFiles */])
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "chatInstructions" /* chatInstructions */,
  label: localize("chatInstructions", "Chat Instructions"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, ["chatInstructions" /* chatInstructions */])
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "chatAgents" /* chatAgents */,
  label: localize("chatAgents", "Chat Agents"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, ["chatAgents" /* chatAgents */])
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "chatSkills" /* chatSkills */,
  label: localize("chatSkills", "Chat Skills"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ChatPromptFilesDataRenderer, ["chatSkills" /* chatSkills */])
});
export {
  ChatPromptFilesExtensionPointHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxjaGF0UHJvbXB0RmlsZXNDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pblBhdGgsIGlzRXF1YWxPclBhcmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBleHRlbnNpb25zUmVnaXN0cnkgZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuL3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUgfSBmcm9tICcuL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElSZW5kZXJlZERhdGEsIElSb3dEYXRhLCBJVGFibGVEYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcblxuaW50ZXJmYWNlIElSYXdDaGF0RmlsZUNvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IHBhdGg6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdoZW4/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5lbnVtIENoYXRDb250cmlidXRpb25Qb2ludCB7XG5cdGNoYXRJbnN0cnVjdGlvbnMgPSAnY2hhdEluc3RydWN0aW9ucycsXG5cdGNoYXRBZ2VudHMgPSAnY2hhdEFnZW50cycsXG5cdGNoYXRQcm9tcHRGaWxlcyA9ICdjaGF0UHJvbXB0RmlsZXMnLFxuXHRjaGF0U2tpbGxzID0gJ2NoYXRTa2lsbHMnLFxufVxuXG5mdW5jdGlvbiByZWdpc3RlckNoYXRGaWxlc0V4dGVuc2lvblBvaW50KHBvaW50OiBDaGF0Q29udHJpYnV0aW9uUG9pbnQpIHtcblx0cmV0dXJuIGV4dGVuc2lvbnNSZWdpc3RyeS5FeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJUmF3Q2hhdEZpbGVDb250cmlidXRpb25bXT4oe1xuXHRcdGV4dGVuc2lvblBvaW50OiBwb2ludCxcblx0XHRqc29uU2NoZW1hOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb250cmlidXRpb24uc2NoZW1hLmRlc2NyaXB0aW9uJywgJ0NvbnRyaWJ1dGVzIHswfSBmb3IgY2hhdCBwcm9tcHRzLicsIHBvaW50KSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0cGF0aDogcG9pbnQgPT09IENoYXRDb250cmlidXRpb25Qb2ludC5jaGF0U2tpbGxzXG5cdFx0XHRcdFx0XHRcdD8gJy4vcmVsYXRpdmUvcGF0aC90by9za2lsbC1uYW1lL1NLSUxMLm1kJ1xuXHRcdFx0XHRcdFx0XHQ6ICcuL3JlbGF0aXZlL3BhdGgvdG8vZmlsZS5tZCcsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0cmVxdWlyZWQ6IFsncGF0aCddLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHBvaW50ID09PSBDaGF0Q29udHJpYnV0aW9uUG9pbnQuY2hhdFNraWxsc1xuXHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0Q29udHJpYnV0aW9uLnByb3BlcnR5LnBhdGguc2tpbGxzJywgJ1BhdGggdG8gdGhlIFNLSUxMLm1kIGZpbGUgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiByb290LiBUaGUgZm9sZGVyIG5hbWUgbXVzdCBtYXRjaCB0aGUgXCJuYW1lXCIgcHJvcGVydHkgaW4gU0tJTEwubWQuJylcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdENvbnRyaWJ1dGlvbi5wcm9wZXJ0eS5wYXRoJywgJ1BhdGggdG8gdGhlIGZpbGUgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiByb290LicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG5hbWU6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbnRyaWJ1dGlvbi5wcm9wZXJ0eS5uYW1lJywgJyhPcHRpb25hbCkgTmFtZSBmb3IgdGhpcyBlbnRyeS4nKSxcblx0XHRcdFx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2NoYXRDb250cmlidXRpb24ucHJvcGVydHkubmFtZS5kZXByZWNhdGVkJywgJ1NwZWNpZnkgXCJuYW1lXCIgaW4gdGhlIHByb21wdCBmaWxlIGl0c2VsZiBpbnN0ZWFkLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb250cmlidXRpb24ucHJvcGVydHkuZGVzY3JpcHRpb24nLCAnKE9wdGlvbmFsKSBEZXNjcmlwdGlvbiBvZiB0aGUgZW50cnkuJyksXG5cdFx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdjaGF0Q29udHJpYnV0aW9uLnByb3BlcnR5LmRlc2NyaXB0aW9uLmRlcHJlY2F0ZWQnLCAnU3BlY2lmeSBcImRlc2NyaXB0aW9uXCIgaW4gdGhlIHByb21wdCBmaWxlIGl0c2VsZiBpbnN0ZWFkLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbnRyaWJ1dGlvbi5wcm9wZXJ0eS53aGVuJywgJyhPcHRpb25hbCkgQSBjb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIGVuYWJsZSB0aGlzIGVudHJ5LicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHNlc3Npb25UeXBlczoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0Q29udHJpYnV0aW9uLnByb3BlcnR5LnNlc3Npb25UeXBlcycsICcoT3B0aW9uYWwpIFRoZSBjaGF0IHNlc3Npb24gdHlwZXMgd2hlcmUgdGhpcyBlbnRyeSBzaG91bGQgYmUgb2ZmZXJlZC4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuY29uc3QgZXBQcm9tcHQgPSByZWdpc3RlckNoYXRGaWxlc0V4dGVuc2lvblBvaW50KENoYXRDb250cmlidXRpb25Qb2ludC5jaGF0UHJvbXB0RmlsZXMpO1xuY29uc3QgZXBJbnN0cnVjdGlvbnMgPSByZWdpc3RlckNoYXRGaWxlc0V4dGVuc2lvblBvaW50KENoYXRDb250cmlidXRpb25Qb2ludC5jaGF0SW5zdHJ1Y3Rpb25zKTtcbmNvbnN0IGVwQWdlbnRzID0gcmVnaXN0ZXJDaGF0RmlsZXNFeHRlbnNpb25Qb2ludChDaGF0Q29udHJpYnV0aW9uUG9pbnQuY2hhdEFnZW50cyk7XG5jb25zdCBlcFNraWxscyA9IHJlZ2lzdGVyQ2hhdEZpbGVzRXh0ZW5zaW9uUG9pbnQoQ2hhdENvbnRyaWJ1dGlvblBvaW50LmNoYXRTa2lsbHMpO1xuXG5mdW5jdGlvbiBwb2ludFRvVHlwZShjb250cmlidXRpb25Qb2ludDogQ2hhdENvbnRyaWJ1dGlvblBvaW50KTogUHJvbXB0c1R5cGUge1xuXHRzd2l0Y2ggKGNvbnRyaWJ1dGlvblBvaW50KSB7XG5cdFx0Y2FzZSBDaGF0Q29udHJpYnV0aW9uUG9pbnQuY2hhdFByb21wdEZpbGVzOiByZXR1cm4gUHJvbXB0c1R5cGUucHJvbXB0O1xuXHRcdGNhc2UgQ2hhdENvbnRyaWJ1dGlvblBvaW50LmNoYXRJbnN0cnVjdGlvbnM6IHJldHVybiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM7XG5cdFx0Y2FzZSBDaGF0Q29udHJpYnV0aW9uUG9pbnQuY2hhdEFnZW50czogcmV0dXJuIFByb21wdHNUeXBlLmFnZW50O1xuXHRcdGNhc2UgQ2hhdENvbnRyaWJ1dGlvblBvaW50LmNoYXRTa2lsbHM6IHJldHVybiBQcm9tcHRzVHlwZS5za2lsbDtcblx0XHRkZWZhdWx0OiB7XG5cdFx0XHRjb25zdCBleGhhdXN0aXZlQ2hlY2s6IG5ldmVyID0gY29udHJpYnV0aW9uUG9pbnQ7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gY29udHJpYnV0aW9uIHBvaW50OiAke2V4aGF1c3RpdmVDaGVja31gKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24ga2V5KGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLCB0eXBlOiBQcm9tcHRzVHlwZSwgcGF0aDogc3RyaW5nKSB7XG5cdHJldHVybiBgJHtleHRlbnNpb25JZC52YWx1ZX0vJHt0eXBlfS8ke3BhdGh9YDtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRQcm9tcHRGaWxlc0V4dGVuc2lvblBvaW50SGFuZGxlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmNoYXRQcm9tcHRGaWxlc0V4dGVuc2lvblBvaW50SGFuZGxlcic7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZWdpc3RyYXRpb25zID0gbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmhhbmRsZShlcFByb21wdCwgQ2hhdENvbnRyaWJ1dGlvblBvaW50LmNoYXRQcm9tcHRGaWxlcyk7XG5cdFx0dGhpcy5oYW5kbGUoZXBJbnN0cnVjdGlvbnMsIENoYXRDb250cmlidXRpb25Qb2ludC5jaGF0SW5zdHJ1Y3Rpb25zKTtcblx0XHR0aGlzLmhhbmRsZShlcEFnZW50cywgQ2hhdENvbnRyaWJ1dGlvblBvaW50LmNoYXRBZ2VudHMpO1xuXHRcdHRoaXMuaGFuZGxlKGVwU2tpbGxzLCBDaGF0Q29udHJpYnV0aW9uUG9pbnQuY2hhdFNraWxscyk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZShleHRlbnNpb25Qb2ludDogZXh0ZW5zaW9uc1JlZ2lzdHJ5LklFeHRlbnNpb25Qb2ludDxJUmF3Q2hhdEZpbGVDb250cmlidXRpb25bXT4sIGNvbnRyaWJ1dGlvblBvaW50OiBDaGF0Q29udHJpYnV0aW9uUG9pbnQpIHtcblx0XHRleHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChfZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0IG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSBwb2ludFRvVHlwZShjb250cmlidXRpb25Qb2ludCk7XG5cdFx0XHRcdGZvciAoY29uc3QgcmF3IG9mIGV4dC52YWx1ZSkge1xuXHRcdFx0XHRcdGlmICghcmF3LnBhdGgpIHtcblx0XHRcdFx0XHRcdGV4dC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2V4dGVuc2lvbi5taXNzaW5nLnBhdGgnLCBcIkV4dGVuc2lvbiAnezB9JyBjYW5ub3QgcmVnaXN0ZXIgezF9IGVudHJ5IHdpdGhvdXQgcGF0aC5cIiwgZXh0LmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGNvbnRyaWJ1dGlvblBvaW50KSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZmlsZVVyaSA9IGpvaW5QYXRoKGV4dC5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbiwgcmF3LnBhdGgpO1xuXHRcdFx0XHRcdGlmICghaXNFcXVhbE9yUGFyZW50KGZpbGVVcmksIGV4dC5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdGV4dC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2V4dGVuc2lvbi5pbnZhbGlkLnBhdGgnLCBcIkV4dGVuc2lvbiAnezB9JyB7MX0gZW50cnkgJ3syfScgcmVzb2x2ZXMgb3V0c2lkZSB0aGUgZXh0ZW5zaW9uLlwiLCBleHQuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgY29udHJpYnV0aW9uUG9pbnQsIHJhdy5wYXRoKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJhdy53aGVuICYmICFDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShyYXcud2hlbikpIHtcblx0XHRcdFx0XHRcdGV4dC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2V4dGVuc2lvbi5pbnZhbGlkLndoZW4nLCBcIkV4dGVuc2lvbiAnezB9JyB7MX0gZW50cnkgJ3syfScgaGFzIGFuIGludmFsaWQgd2hlbiBjbGF1c2U6ICd7M30nLlwiLCBleHQuZGVzY3JpcHRpb24uaWRlbnRpZmllci52YWx1ZSwgY29udHJpYnV0aW9uUG9pbnQsIHJhdy5wYXRoLCByYXcud2hlbikpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkID0gdGhpcy5wcm9tcHRzU2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGVkRmlsZSh0eXBlLCBmaWxlVXJpLCBleHQuZGVzY3JpcHRpb24sIHJhdy5uYW1lLCByYXcuZGVzY3JpcHRpb24sIHJhdy53aGVuLCByYXcuc2Vzc2lvblR5cGVzKTtcblx0XHRcdFx0XHRcdHRoaXMucmVnaXN0cmF0aW9ucy5zZXQoa2V5KGV4dC5kZXNjcmlwdGlvbi5pZGVudGlmaWVyLCB0eXBlLCByYXcucGF0aCksIGQpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1zZyA9IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKTtcblx0XHRcdFx0XHRcdGV4dC5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoJ2V4dGVuc2lvbi5yZWdpc3RyYXRpb24uZmFpbGVkJywgXCJFeHRlbnNpb24gJ3swfScgezF9LiBGYWlsZWQgdG8gcmVnaXN0ZXIgezJ9OiB7M31cIiwgZXh0LmRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGNvbnRyaWJ1dGlvblBvaW50LCByYXcucGF0aCwgbXNnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGV4dCBvZiBkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdGNvbnN0IHR5cGUgPSBwb2ludFRvVHlwZShjb250cmlidXRpb25Qb2ludCk7XG5cdFx0XHRcdGZvciAoY29uc3QgcmF3IG9mIGV4dC52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMucmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKGtleShleHQuZGVzY3JpcHRpb24uaWRlbnRpZmllciwgdHlwZSwgcmF3LnBhdGgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogUmVzdWx0IHR5cGUgZm9yIHRoZSBleHRlbnNpb24gcHJvbXB0IGZpbGUgcHJvdmlkZXIgY29tbWFuZC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uUHJvbXB0RmlsZVJlc3VsdCB7XG5cdHJlYWRvbmx5IHVyaTogVXJpQ29tcG9uZW50cztcblx0cmVhZG9ubHkgdHlwZTogUHJvbXB0c1R5cGU7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkOiBzdHJpbmc7XG59XG5cbi8qKlxuICogUmVnaXN0ZXIgdGhlIGNvbW1hbmQgdG8gbGlzdCBhbGwgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIHByb21wdCBmaWxlcy5cbiAqL1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19saXN0RXh0ZW5zaW9uUHJvbXB0RmlsZXMnLCBhc3luYyAoYWNjZXNzb3IpOiBQcm9taXNlPElFeHRlbnNpb25Qcm9tcHRGaWxlUmVzdWx0W10+ID0+IHtcblx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb21wdHNTZXJ2aWNlKTtcblxuXHQvLyBHZXQgZXh0ZW5zaW9uIHByb21wdCBmaWxlcyBmb3IgYWxsIHByb21wdCB0eXBlcyBpbiBwYXJhbGxlbFxuXHRjb25zdCBbYWdlbnRzLCBpbnN0cnVjdGlvbnMsIHByb21wdHMsIHNraWxscywgaG9va3NdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdHByb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlcyhQcm9tcHRzVHlwZS5hZ2VudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0cHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0cHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnByb21wdCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0cHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzKFByb21wdHNUeXBlLnNraWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRwcm9tcHRzU2VydmljZS5saXN0UHJvbXB0RmlsZXMoUHJvbXB0c1R5cGUuaG9vaywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdF0pO1xuXG5cdC8vIENvbWJpbmUgYWxsIGZpbGVzIGFuZCBjb2xsZWN0IGV4dGVuc2lvbi0gYW5kIHBsdWdpbi1jb250cmlidXRlZCBvbmVzLlxuXHQvLyBQbHVnaW4gZmlsZXMgYXJlIGluY2x1ZGVkIHNvIHRoZSBjb3BpbG90IGV4dGVuc2lvbiBjYW4gdHJ1c3QgdGhlbSBhbmRcblx0Ly8gc2VydmUgdGhlbSB0byB0aGUgTExNIHdpdGhvdXQgYSBjb25maXJtYXRpb24gZGlhbG9nIHdoZW4gY29ubmVjdGVkIHRvIGFcblx0Ly8gcmVtb3RlICh3aGVyZSB0aGV5IGFyZSBlbWl0dGVkIGFzIHZzY29kZS1sb2NhbDovLi4uIFVSSXMpLlxuXHRjb25zdCByZXN1bHQ6IElFeHRlbnNpb25Qcm9tcHRGaWxlUmVzdWx0W10gPSBbXTtcblx0Zm9yIChjb25zdCBmaWxlIG9mIFsuLi5hZ2VudHMsIC4uLmluc3RydWN0aW9ucywgLi4ucHJvbXB0cywgLi4uc2tpbGxzLCAuLi5ob29rc10pIHtcblx0XHRpZiAoZmlsZS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgdXJpOiBmaWxlLnVyaS50b0pTT04oKSwgdHlwZTogZmlsZS50eXBlLCBleHRlbnNpb25JZDogZmlsZS5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSB9KTtcblx0XHR9IGVsc2UgaWYgKGZpbGUuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UucGx1Z2luKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHVyaTogZmlsZS51cmkudG9KU09OKCksIHR5cGU6IGZpbGUudHlwZSwgZXh0ZW5zaW9uSWQ6IGZpbGUucGx1Z2luVXJpLnRvU3RyaW5nKCkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn0pO1xuXG5jbGFzcyBDaGF0UHJvbXB0RmlsZXNEYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBjb250cmlidXRpb25Qb2ludDogQ2hhdENvbnRyaWJ1dGlvblBvaW50KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/Llt0aGlzLmNvbnRyaWJ1dGlvblBvaW50XTtcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9ucyA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5bdGhpcy5jb250cmlidXRpb25Qb2ludF0gPz8gW107XG5cdFx0aWYgKCFjb250cmlidXRpb25zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdGxvY2FsaXplKCdjaGF0RmlsZXNOYW1lJywgXCJOYW1lXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2NoYXRGaWxlc0Rlc2NyaXB0aW9uJywgXCJEZXNjcmlwdGlvblwiKSxcblx0XHRcdGxvY2FsaXplKCdjaGF0RmlsZXNQYXRoJywgXCJQYXRoXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBjb250cmlidXRpb25zLm1hcChkID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdGQubmFtZSA/PyAnLScsXG5cdFx0XHRcdGQuZGVzY3JpcHRpb24gPz8gJy0nLFxuXHRcdFx0XHRkLnBhdGgsXG5cdFx0XHRdO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6IENoYXRDb250cmlidXRpb25Qb2ludC5jaGF0UHJvbXB0RmlsZXMsXG5cdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdFByb21wdEZpbGVzJywgXCJDaGF0IFByb21wdCBGaWxlc1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKENoYXRQcm9tcHRGaWxlc0RhdGFSZW5kZXJlciwgW0NoYXRDb250cmlidXRpb25Qb2ludC5jaGF0UHJvbXB0RmlsZXNdKSxcbn0pO1xuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogQ2hhdENvbnRyaWJ1dGlvblBvaW50LmNoYXRJbnN0cnVjdGlvbnMsXG5cdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdEluc3RydWN0aW9ucycsIFwiQ2hhdCBJbnN0cnVjdGlvbnNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihDaGF0UHJvbXB0RmlsZXNEYXRhUmVuZGVyZXIsIFtDaGF0Q29udHJpYnV0aW9uUG9pbnQuY2hhdEluc3RydWN0aW9uc10pLFxufSk7XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiBDaGF0Q29udHJpYnV0aW9uUG9pbnQuY2hhdEFnZW50cyxcblx0bGFiZWw6IGxvY2FsaXplKCdjaGF0QWdlbnRzJywgXCJDaGF0IEFnZW50c1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKENoYXRQcm9tcHRGaWxlc0RhdGFSZW5kZXJlciwgW0NoYXRDb250cmlidXRpb25Qb2ludC5jaGF0QWdlbnRzXSksXG59KTtcblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6IENoYXRDb250cmlidXRpb25Qb2ludC5jaGF0U2tpbGxzLFxuXHRsYWJlbDogbG9jYWxpemUoJ2NoYXRTa2lsbHMnLCBcIkNoYXQgU2tpbGxzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdFByb21wdEZpbGVzRGF0YVJlbmRlcmVyLCBbQ2hhdENvbnRyaWJ1dGlvblBvaW50LmNoYXRTa2lsbHNdKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLFlBQVkscUJBQXFCO0FBQzFDLFNBQVMsVUFBVSx1QkFBdUI7QUFDMUMsU0FBUyxnQkFBZ0I7QUFHekIsWUFBWSx3QkFBd0I7QUFDcEMsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQW1IO0FBQzVILFNBQVMsc0JBQXNCO0FBVS9CLElBQUssd0JBQUwsa0JBQUtBLDJCQUFMO0FBQ0MsRUFBQUEsdUJBQUEsc0JBQW1CO0FBQ25CLEVBQUFBLHVCQUFBLGdCQUFhO0FBQ2IsRUFBQUEsdUJBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLHVCQUFBLGdCQUFhO0FBSlQsU0FBQUE7QUFBQSxHQUFBO0FBT0wsU0FBUyxnQ0FBZ0MsT0FBOEI7QUFDdEUsU0FBTyxtQkFBbUIsbUJBQW1CLHVCQUFtRDtBQUFBLElBQy9GLGdCQUFnQjtBQUFBLElBQ2hCLFlBQVk7QUFBQSxNQUNYLGFBQWEsU0FBUyx1Q0FBdUMscUNBQXFDLEtBQUs7QUFBQSxNQUN2RyxNQUFNO0FBQUEsTUFDTixPQUFPO0FBQUEsUUFDTixzQkFBc0I7QUFBQSxRQUN0QixNQUFNO0FBQUEsUUFDTixpQkFBaUIsQ0FBQztBQUFBLFVBQ2pCLE1BQU07QUFBQSxZQUNMLE1BQU0sVUFBVSxnQ0FDYiwyQ0FDQTtBQUFBLFVBQ0o7QUFBQSxRQUNELENBQUM7QUFBQSxRQUNELFVBQVUsQ0FBQyxNQUFNO0FBQUEsUUFDakIs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QUEsTUFDZixTQUFTLGlCQUFpQixNQUFNO0FBQUEsTUFDaEMsU0FBUyx3QkFBd0IsYUFBYTtBQUFBLE1BQzlDLFNBQVMsaUJBQWlCLE1BQU07QUFBQSxJQUNqQztBQUVBLFVBQU0sT0FBcUIsY0FBYyxJQUFJLE9BQUs7QUFDakQsYUFBTztBQUFBLFFBQ04sRUFBRSxRQUFRO0FBQUEsUUFDVixFQUFFLGVBQWU7QUFBQSxRQUNqQixFQUFFO0FBQUEsTUFDSDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsR0FBK0IsV0FBVyx5QkFBeUIsRUFBRSx5QkFBeUI7QUFBQSxFQUN0RyxJQUFJO0FBQUEsRUFDSixPQUFPLFNBQVMsbUJBQW1CLG1CQUFtQjtBQUFBLEVBQ3RELFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxFQUNaO0FBQUEsRUFDQSxVQUFVLElBQUksZUFBZSw2QkFBNkIsQ0FBQyx1Q0FBcUMsQ0FBQztBQUNsRyxDQUFDO0FBRUQsU0FBUyxHQUErQixXQUFXLHlCQUF5QixFQUFFLHlCQUF5QjtBQUFBLEVBQ3RHLElBQUk7QUFBQSxFQUNKLE9BQU8sU0FBUyxvQkFBb0IsbUJBQW1CO0FBQUEsRUFDdkQsUUFBUTtBQUFBLElBQ1AsV0FBVztBQUFBLEVBQ1o7QUFBQSxFQUNBLFVBQVUsSUFBSSxlQUFlLDZCQUE2QixDQUFDLHlDQUFzQyxDQUFDO0FBQ25HLENBQUM7QUFFRCxTQUFTLEdBQStCLFdBQVcseUJBQXlCLEVBQUUseUJBQXlCO0FBQUEsRUFDdEcsSUFBSTtBQUFBLEVBQ0osT0FBTyxTQUFTLGNBQWMsYUFBYTtBQUFBLEVBQzNDLFFBQVE7QUFBQSxJQUNQLFdBQVc7QUFBQSxFQUNaO0FBQUEsRUFDQSxVQUFVLElBQUksZUFBZSw2QkFBNkIsQ0FBQyw2QkFBZ0MsQ0FBQztBQUM3RixDQUFDO0FBRUQsU0FBUyxHQUErQixXQUFXLHlCQUF5QixFQUFFLHlCQUF5QjtBQUFBLEVBQ3RHLElBQUk7QUFBQSxFQUNKLE9BQU8sU0FBUyxjQUFjLGFBQWE7QUFBQSxFQUMzQyxRQUFRO0FBQUEsSUFDUCxXQUFXO0FBQUEsRUFDWjtBQUFBLEVBQ0EsVUFBVSxJQUFJLGVBQWUsNkJBQTZCLENBQUMsNkJBQWdDLENBQUM7QUFDN0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiQ2hhdENvbnRyaWJ1dGlvblBvaW50Il0KfQo=
