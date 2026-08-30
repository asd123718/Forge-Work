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
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { observableFromEvent, observableSignalFromEvent, autorun, transaction } from "../../../../../base/common/observable.js";
import { basename, joinPath } from "../../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../../base/common/strings.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { assertType, isObject } from "../../../../../base/common/types.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ILifecycleService, LifecyclePhase } from "../../../../services/lifecycle/common/lifecycle.js";
import { IUserDataProfileService } from "../../../../services/userDataProfile/common/userDataProfile.js";
import { CHAT_CATEGORY, CHAT_CONFIG_MENU_ID } from "../actions/chatActions.js";
import { ILanguageModelToolsService, isToolSet, ToolAndToolSetEnablementMap, ToolDataSource } from "../../common/tools/languageModelToolsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { Codicon, getAllCodicons } from "../../../../../base/common/codicons.js";
import { isValidBasename } from "../../../../../base/common/extpath.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { parse } from "../../../../../base/common/jsonc.js";
import * as JSONContributionRegistry from "../../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { ChatViewId, IChatWidgetService } from "../chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
const toolEnumValues = [];
const toolEnumDescriptions = [];
const toolSetSchemaId = "vscode://schemas/toolsets";
const toolSetsSchema = {
  id: toolSetSchemaId,
  allowComments: true,
  allowTrailingCommas: true,
  defaultSnippets: [{
    label: localize("schema.default", "Empty tool set"),
    body: { "${1:toolSetName}": { "tools": ["${2:someTool}", "${3:anotherTool}"], "description": "${4:description}", "icon": "${5:tools}" } }
  }],
  type: "object",
  description: localize("toolsetSchema.json", "User tool sets configuration"),
  additionalProperties: {
    type: "object",
    required: ["tools"],
    additionalProperties: false,
    properties: {
      tools: {
        description: localize("schema.tools", "A list of tools or tool sets to include in this tool set. Cannot be empty and must reference tools the way they are referenced in prompts."),
        type: "array",
        minItems: 1,
        items: {
          type: "string",
          enum: toolEnumValues,
          enumDescriptions: toolEnumDescriptions
        }
      },
      icon: {
        description: localize("schema.icon", 'Icon to use for this tool set in the UI. Uses the "\\$(name)"-syntax, like "\\$(zap)"'),
        type: "string",
        enum: Array.from(getAllCodicons(), (icon) => icon.id),
        markdownEnumDescriptions: Array.from(getAllCodicons(), (icon) => `$(${icon.id})`)
      },
      description: {
        description: localize("schema.description", "A short description of this tool set."),
        type: "string"
      }
    }
  }
};
const reg = Registry.as(JSONContributionRegistry.Extensions.JSONContribution);
const _RawToolSetsShape = class _RawToolSetsShape {
  static isToolSetFileName(uri) {
    return basename(uri).endsWith(_RawToolSetsShape.suffix);
  }
  static from(data, logService) {
    if (!isObject(data)) {
      throw new Error(`Invalid tool set data`);
    }
    const map = /* @__PURE__ */ new Map();
    for (const [name, value] of Object.entries(data)) {
      if (isFalsyOrWhitespace(name)) {
        logService.error(`Tool set name cannot be empty`);
      }
      if (isFalsyOrEmpty(value.tools)) {
        logService.error(`Tool set '${name}' cannot have an empty tools array`);
      }
      map.set(name, {
        name,
        tools: value.tools,
        description: value.description,
        icon: value.icon
      });
    }
    return new class extends _RawToolSetsShape {
    }(map);
  }
  constructor(entries) {
    this.entries = Object.freeze(new Map(entries));
  }
};
_RawToolSetsShape.suffix = ".toolsets.jsonc";
let RawToolSetsShape = _RawToolSetsShape;
let UserToolSetsContributions = class extends Disposable {
  constructor(extensionService, lifecycleService, _languageModelToolsService, _userDataProfileService, _fileService, _logService) {
    super();
    this._languageModelToolsService = _languageModelToolsService;
    this._userDataProfileService = _userDataProfileService;
    this._fileService = _fileService;
    this._logService = _logService;
    Promise.allSettled([
      extensionService.whenInstalledExtensionsRegistered,
      lifecycleService.when(LifecyclePhase.Restored)
    ]).then(() => this._initToolSets());
    const toolsObs = observableFromEvent(this, _languageModelToolsService.onDidChangeTools, () => Array.from(_languageModelToolsService.getAllToolsIncludingDisabled()));
    const store = this._store.add(new DisposableStore());
    this._store.add(autorun((r) => {
      const tools = toolsObs.read(r);
      const toolSets = this._languageModelToolsService.toolSets.read(r);
      const data = [];
      for (const tool of tools) {
        if (tool.canBeReferencedInPrompt) {
          data.push({
            name: this._languageModelToolsService.getFullReferenceName(tool),
            sourceLabel: ToolDataSource.classify(tool.source).label,
            sourceOrdinal: ToolDataSource.classify(tool.source).ordinal,
            description: tool.userDescription ?? tool.modelDescription
          });
        }
      }
      for (const toolSet of toolSets) {
        data.push({
          name: this._languageModelToolsService.getFullReferenceName(toolSet),
          sourceLabel: ToolDataSource.classify(toolSet.source).label,
          sourceOrdinal: ToolDataSource.classify(toolSet.source).ordinal,
          description: toolSet.description
        });
      }
      toolEnumValues.length = 0;
      toolEnumDescriptions.length = 0;
      data.sort((a, b) => {
        if (a.sourceOrdinal !== b.sourceOrdinal) {
          return a.sourceOrdinal - b.sourceOrdinal;
        }
        if (a.sourceLabel !== b.sourceLabel) {
          return a.sourceLabel.localeCompare(b.sourceLabel);
        }
        return a.name.localeCompare(b.name);
      });
      for (const item of data) {
        toolEnumValues.push(item.name);
        toolEnumDescriptions.push(localize("tool.description", "{1} ({0})\n\n{2}", item.sourceLabel, item.name, item.description));
      }
      store.clear();
      reg.registerSchema(toolSetSchemaId, toolSetsSchema, store);
    }));
  }
  _initToolSets() {
    const promptFolder = observableFromEvent(this, this._userDataProfileService.onDidChangeCurrentProfile, () => this._userDataProfileService.currentProfile.promptsHome);
    const toolsSig = observableSignalFromEvent(this, this._languageModelToolsService.onDidChangeTools);
    const fileEventSig = observableSignalFromEvent(this, Event.filter(this._fileService.onDidFilesChange, (e) => e.affects(promptFolder.get())));
    const store = this._store.add(new DisposableStore());
    const getFilesInFolder = async (folder) => {
      try {
        return (await this._fileService.resolve(folder)).children ?? [];
      } catch (err) {
        return [];
      }
    };
    this._store.add(autorun(async (r) => {
      store.clear();
      toolsSig.read(r);
      fileEventSig.read(r);
      const uri = promptFolder.read(r);
      const cts = new CancellationTokenSource();
      store.add(toDisposable(() => cts.dispose(true)));
      const entries = await getFilesInFolder(uri);
      if (cts.token.isCancellationRequested) {
        return;
      }
      for (const entry of entries) {
        if (!entry.isFile || !RawToolSetsShape.isToolSetFileName(entry.resource)) {
          continue;
        }
        store.add(this._fileService.watch(entry.resource));
        let data;
        try {
          const content = await this._fileService.readFile(entry.resource, void 0, cts.token);
          const rawObj = parse(content.value.toString());
          data = RawToolSetsShape.from(rawObj, this._logService);
        } catch (err) {
          this._logService.error(`Error reading tool set file ${entry.resource.toString()}:`, err);
          continue;
        }
        if (cts.token.isCancellationRequested) {
          return;
        }
        for (const [name, value] of data.entries) {
          const tools = [];
          const toolSets = [];
          value.tools.forEach((name2) => {
            const toolOrToolSet = this._languageModelToolsService.getToolByFullReferenceName(name2);
            if (isToolSet(toolOrToolSet)) {
              toolSets.push(toolOrToolSet);
              return;
            } else if (toolOrToolSet) {
              tools.push(toolOrToolSet);
              return;
            }
            const tool = this._languageModelToolsService.getToolByName(name2);
            if (tool) {
              tools.push(tool);
              return;
            }
            const toolSet = this._languageModelToolsService.getToolSetByName(name2);
            if (toolSet) {
              toolSets.push(toolSet);
              return;
            }
          });
          if (tools.length === 0 && toolSets.length === 0) {
            continue;
          }
          const toolset = this._languageModelToolsService.createToolSet(
            { type: "user", file: entry.resource, label: basename(entry.resource) },
            `user/${entry.resource.toString()}/${name}`,
            name,
            {
              // toolReferenceName: value.referenceName,
              icon: value.icon ? ThemeIcon.fromId(value.icon) : void 0,
              description: value.description,
              deprecated: true
            }
          );
          transaction((tx) => {
            store.add(toolset);
            tools.forEach((tool) => store.add(toolset.addTool(tool, tx)));
            toolSets.forEach((toolSet) => store.add(toolset.addToolSet(toolSet, tx)));
          });
        }
      }
    }));
  }
};
UserToolSetsContributions.ID = "chat.userToolSets";
UserToolSetsContributions = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, ILanguageModelToolsService),
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IFileService),
  __decorateParam(5, ILogService)
], UserToolSetsContributions);
function getSelectionFromArg(arg) {
  if (!isObject(arg)) {
    return void 0;
  }
  const selection = arg.selection;
  if (!(selection instanceof ToolAndToolSetEnablementMap)) {
    return void 0;
  }
  return selection;
}
function getEnabledSelectionReferences(selection, toolsService) {
  const enabledToolSets = [];
  const enabledTools = [];
  for (const [item, enabled] of selection) {
    if (!enabled) {
      continue;
    }
    if (isToolSet(item)) {
      if (Iterable.every(item.getTools(), (tool) => selection.get(tool) !== false)) {
        enabledToolSets.push(item);
      }
    } else {
      enabledTools.push(item);
    }
  }
  const coveredToolIds = /* @__PURE__ */ new Set();
  for (const toolSet of enabledToolSets) {
    for (const tool of toolSet.getTools()) {
      coveredToolIds.add(tool.id);
    }
  }
  const references = [];
  const seen = /* @__PURE__ */ new Set();
  const addReference = (referenceName) => {
    if (seen.has(referenceName)) {
      return;
    }
    seen.add(referenceName);
    references.push(referenceName);
  };
  for (const toolSet of enabledToolSets) {
    addReference(toolsService.getFullReferenceName(toolSet));
  }
  for (const tool of enabledTools) {
    if (coveredToolIds.has(tool.id)) {
      continue;
    }
    const referenceName = toolsService.getFullReferenceName(tool);
    if (toolsService.getToolByFullReferenceName(referenceName) !== tool) {
      continue;
    }
    addReference(referenceName);
  }
  return references;
}
function createToolSetFileContents(toolSetName, toolReferences) {
  const serializedReferences = toolReferences.map((reference) => `			${JSON.stringify(reference)}`).join(",\n");
  return [
    "{",
    `	${JSON.stringify(toolSetName)}: {`,
    '		"tools": [',
    serializedReferences,
    "		],",
    '		"description": "",',
    '		"icon": "tools"',
    "	}",
    "}"
  ].join("\n");
}
function deleteToolSetFromFileContents(rawContents, toolSetName) {
  const parsed = parse(rawContents);
  if (!isObject(parsed)) {
    return void 0;
  }
  const record = parsed;
  if (!Object.hasOwn(record, toolSetName)) {
    return void 0;
  }
  delete record[toolSetName];
  return { contents: JSON.stringify(record, void 0, "	"), isEmpty: Object.keys(record).length === 0 };
}
const _ConfigureToolSets = class _ConfigureToolSets extends Action2 {
  constructor() {
    super({
      id: _ConfigureToolSets.ID,
      title: localize2("chat.configureToolSets", "Configure Tool Sets..."),
      shortTitle: localize("chat.configureToolSets.short", "Tool Sets"),
      category: CHAT_CATEGORY,
      f1: true,
      precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatContextKeys.Tools.toolsCount.greater(0)),
      menu: [
        {
          id: CHAT_CONFIG_MENU_ID,
          when: ContextKeyExpr.equals("view", ChatViewId),
          order: 11,
          group: "2_level"
        },
        {
          id: MenuId.ViewTitle,
          when: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.equals("view", ChatViewId)),
          order: 11,
          group: "2_level"
        }
      ]
    });
  }
  async run(accessor, options) {
    const toolsService = accessor.get(ILanguageModelToolsService);
    const quickInputService = accessor.get(IQuickInputService);
    const editorService = accessor.get(IEditorService);
    const userDataProfileService = accessor.get(IUserDataProfileService);
    const fileService = accessor.get(IFileService);
    const textFileService = accessor.get(ITextFileService);
    const chatWidgetService = accessor.get(IChatWidgetService);
    const picks = [];
    const currentSelection = getSelectionFromArg(options) ?? chatWidgetService.lastFocusedWidget?.input.selectedToolsModel.entriesMap.get() ?? ToolAndToolSetEnablementMap.fromEntries([]);
    const selectedReferences = getEnabledSelectionReferences(currentSelection, toolsService);
    if (selectedReferences.length > 0) {
      picks.push({
        label: localize("chat.configureToolSets.createFromCurrentSelection", "Create from current selection..."),
        kind: "createFromSelection",
        alwaysShow: true,
        iconClass: ThemeIcon.asClassName(Codicon.plus)
      });
    }
    picks.push({
      label: localize("chat.configureToolSets.add", "Create new tool sets file..."),
      kind: "createNewFile",
      alwaysShow: true,
      iconClass: ThemeIcon.asClassName(Codicon.plus)
    });
    for (const toolSet of toolsService.toolSets.get()) {
      if (toolSet.source.type !== "user") {
        continue;
      }
      picks.push({
        label: toolSet.referenceName,
        kind: "existing",
        toolset: toolSet,
        tooltip: toolSet.description,
        iconClass: ThemeIcon.asClassName(toolSet.icon)
      });
    }
    const pick = await quickInputService.pick(picks, {
      canPickMany: false,
      placeHolder: localize("chat.configureToolSets.placeholder", "Select a tool set to configure")
    });
    if (!pick) {
      return;
    }
    let resource;
    if (!pick.toolset) {
      const name = await quickInputService.input({
        placeHolder: localize("input.placeholder", "Type tool sets file name"),
        validateInput: async (input) => {
          if (!input) {
            return localize("bad_name1", "Invalid file name");
          }
          if (!isValidBasename(input)) {
            return localize("bad_name2", "'{0}' is not a valid file name", input);
          }
          if (pick.kind === "createFromSelection") {
            const candidate = joinPath(userDataProfileService.currentProfile.promptsHome, `${input}${RawToolSetsShape.suffix}`);
            if (await fileService.exists(candidate)) {
              return localize("chat.configureToolSets.fileAlreadyExists", "A file with this name already exists");
            }
          }
          return void 0;
        }
      });
      if (isFalsyOrWhitespace(name)) {
        return;
      }
      resource = joinPath(userDataProfileService.currentProfile.promptsHome, `${name}${RawToolSetsShape.suffix}`);
      if (pick.kind === "createFromSelection") {
        const toolSetName = await quickInputService.input({
          placeHolder: localize("toolSetName.placeholder", "Type new tool set name"),
          validateInput: async (input) => {
            if (isFalsyOrWhitespace(input)) {
              return localize("toolSetName.bad_name", "Tool set name cannot be empty");
            }
            return void 0;
          }
        });
        if (!toolSetName || isFalsyOrWhitespace(toolSetName)) {
          return;
        }
        await textFileService.write(resource, createToolSetFileContents(toolSetName, selectedReferences));
      } else if (!await fileService.exists(resource)) {
        await textFileService.write(resource, [
          "// Place your tool sets here...",
          "// Example:",
          "// {",
          '// 	"toolSetName": {',
          '// 		"tools": [',
          '// 			"someTool",',
          '// 			"anotherTool"',
          "// 		],",
          '// 		"description": "description",',
          '// 		"icon": "tools"',
          "// 	}",
          "// }"
        ].join("\n"));
      }
    } else {
      assertType(pick.toolset.source.type === "user");
      resource = pick.toolset.source.file;
    }
    await editorService.openEditor({ resource, options: { pinned: true } });
  }
};
_ConfigureToolSets.ID = "chat.configureToolSets";
let ConfigureToolSets = _ConfigureToolSets;
export {
  ConfigureToolSets,
  RawToolSetsShape,
  UserToolSetsContributions,
  createToolSetFileContents,
  deleteToolSetFromFileContents,
  getEnabledSelectionReferences
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHRvb2xzXFx0b29sU2V0c0NvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGlzRmFsc3lPckVtcHR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50LCBhdXRvcnVuLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUsIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRmFsc3lPcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlLCBpc09iamVjdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlksIENIQVRfQ09ORklHX01FTlVfSUQgfSBmcm9tICcuLi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIElUb29sU2V0LCBpc1Rvb2xTZXQsIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCwgVG9vbERhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmF3VG9vbFNldENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiwgZ2V0QWxsQ29kaWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBpc1ZhbGlkQmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbmMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCAqIGFzIEpTT05Db250cmlidXRpb25SZWdpc3RyeSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0lkLCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5cbmNvbnN0IHRvb2xFbnVtVmFsdWVzOiBzdHJpbmdbXSA9IFtdO1xuY29uc3QgdG9vbEVudW1EZXNjcmlwdGlvbnM6IHN0cmluZ1tdID0gW107XG5cbmNvbnN0IHRvb2xTZXRTY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL3Rvb2xzZXRzJztcbmNvbnN0IHRvb2xTZXRzU2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0aWQ6IHRvb2xTZXRTY2hlbWFJZCxcblx0YWxsb3dDb21tZW50czogdHJ1ZSxcblx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbe1xuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2NoZW1hLmRlZmF1bHQnLCBcIkVtcHR5IHRvb2wgc2V0XCIpLFxuXHRcdGJvZHk6IHsgJyR7MTp0b29sU2V0TmFtZX0nOiB7ICd0b29scyc6IFsnJHsyOnNvbWVUb29sfScsICckezM6YW5vdGhlclRvb2x9J10sICdkZXNjcmlwdGlvbic6ICckezQ6ZGVzY3JpcHRpb259JywgJ2ljb24nOiAnJHs1OnRvb2xzfScgfSB9XG5cdH1dLFxuXHR0eXBlOiAnb2JqZWN0Jyxcblx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0b29sc2V0U2NoZW1hLmpzb24nLCAnVXNlciB0b29sIHNldHMgY29uZmlndXJhdGlvbicpLFxuXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cmVxdWlyZWQ6IFsndG9vbHMnXSxcblx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0dG9vbHM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY2hlbWEudG9vbHMnLCBcIkEgbGlzdCBvZiB0b29scyBvciB0b29sIHNldHMgdG8gaW5jbHVkZSBpbiB0aGlzIHRvb2wgc2V0LiBDYW5ub3QgYmUgZW1wdHkgYW5kIG11c3QgcmVmZXJlbmNlIHRvb2xzIHRoZSB3YXkgdGhleSBhcmUgcmVmZXJlbmNlZCBpbiBwcm9tcHRzLlwiKSxcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogdG9vbEVudW1WYWx1ZXMsXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogdG9vbEVudW1EZXNjcmlwdGlvbnMsXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRpY29uOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2NoZW1hLmljb24nLCAnSWNvbiB0byB1c2UgZm9yIHRoaXMgdG9vbCBzZXQgaW4gdGhlIFVJLiBVc2VzIHRoZSBcIlxcXFwkKG5hbWUpXCItc3ludGF4LCBsaWtlIFwiXFxcXCQoemFwKVwiJyksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBBcnJheS5mcm9tKGdldEFsbENvZGljb25zKCksIGljb24gPT4gaWNvbi5pZCksXG5cdFx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogQXJyYXkuZnJvbShnZXRBbGxDb2RpY29ucygpLCBpY29uID0+IGAkKCR7aWNvbi5pZH0pYCksXG5cdFx0XHR9LFxuXHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzY2hlbWEuZGVzY3JpcHRpb24nLCBcIkEgc2hvcnQgZGVzY3JpcHRpb24gb2YgdGhpcyB0b29sIHNldC5cIiksXG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH1cbn07XG5cbmNvbnN0IHJlZyA9IFJlZ2lzdHJ5LmFzPEpTT05Db250cmlidXRpb25SZWdpc3RyeS5JSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkuRXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgUmF3VG9vbFNldHNTaGFwZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IHN1ZmZpeCA9ICcudG9vbHNldHMuanNvbmMnO1xuXG5cdHN0YXRpYyBpc1Rvb2xTZXRGaWxlTmFtZSh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBiYXNlbmFtZSh1cmkpLmVuZHNXaXRoKFJhd1Rvb2xTZXRzU2hhcGUuc3VmZml4KTtcblx0fVxuXG5cdHN0YXRpYyBmcm9tKGRhdGE6IHVua25vd24sIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKSB7XG5cdFx0aWYgKCFpc09iamVjdChkYXRhKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIHRvb2wgc2V0IGRhdGFgKTtcblx0XHR9XG5cblx0XHRjb25zdCBtYXAgPSBuZXcgTWFwPHN0cmluZywgRXhjbHVkZTxJUmF3VG9vbFNldENvbnRyaWJ1dGlvbiwgJ25hbWUnPj4oKTtcblxuXHRcdGZvciAoY29uc3QgW25hbWUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhkYXRhIGFzIFJhd1Rvb2xTZXRzU2hhcGUpKSB7XG5cblx0XHRcdGlmIChpc0ZhbHN5T3JXaGl0ZXNwYWNlKG5hbWUpKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYFRvb2wgc2V0IG5hbWUgY2Fubm90IGJlIGVtcHR5YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNGYWxzeU9yRW1wdHkodmFsdWUudG9vbHMpKSB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYFRvb2wgc2V0ICcke25hbWV9JyBjYW5ub3QgaGF2ZSBhbiBlbXB0eSB0b29scyBhcnJheWApO1xuXHRcdFx0fVxuXG5cdFx0XHRtYXAuc2V0KG5hbWUsIHtcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0dG9vbHM6IHZhbHVlLnRvb2xzLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdmFsdWUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGljb246IHZhbHVlLmljb24sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgUmF3VG9vbFNldHNTaGFwZSB7IH0obWFwKTtcblx0fVxuXG5cdGVudHJpZXM6IFJlYWRvbmx5TWFwPHN0cmluZywgRXhjbHVkZTxJUmF3VG9vbFNldENvbnRyaWJ1dGlvbiwgJ25hbWUnPj47XG5cblx0cHJpdmF0ZSBjb25zdHJ1Y3RvcihlbnRyaWVzOiBNYXA8c3RyaW5nLCBFeGNsdWRlPElSYXdUb29sU2V0Q29udHJpYnV0aW9uLCAnbmFtZSc+Pikge1xuXHRcdHRoaXMuZW50cmllcyA9IE9iamVjdC5mcmVlemUobmV3IE1hcChlbnRyaWVzKSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFVzZXJUb29sU2V0c0NvbnRyaWJ1dGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2NoYXQudXNlclRvb2xTZXRzJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRQcm9taXNlLmFsbFNldHRsZWQoW1xuXHRcdFx0ZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQsXG5cdFx0XHRsaWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpXG5cdFx0XSkudGhlbigoKSA9PiB0aGlzLl9pbml0VG9vbFNldHMoKSk7XG5cblx0XHRjb25zdCB0b29sc09icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2Uub25EaWRDaGFuZ2VUb29scywgKCkgPT4gQXJyYXkuZnJvbShfbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRBbGxUb29sc0luY2x1ZGluZ0Rpc2FibGVkKCkpKTtcblx0XHRjb25zdCBzdG9yZSA9IHRoaXMuX3N0b3JlLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCB0b29scyA9IHRvb2xzT2JzLnJlYWQocik7XG5cdFx0XHRjb25zdCB0b29sU2V0cyA9IHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UudG9vbFNldHMucmVhZChyKTtcblxuXG5cdFx0XHR0eXBlIFRvb2xEZXNjID0ge1xuXHRcdFx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0XHRcdHNvdXJjZUxhYmVsOiBzdHJpbmc7XG5cdFx0XHRcdHNvdXJjZU9yZGluYWw6IG51bWJlcjtcblx0XHRcdFx0ZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBkYXRhOiBUb29sRGVzY1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbHMpIHtcblx0XHRcdFx0aWYgKHRvb2wuY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQpIHtcblx0XHRcdFx0XHRkYXRhLnB1c2goe1xuXHRcdFx0XHRcdFx0bmFtZTogdGhpcy5fbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sKSxcblx0XHRcdFx0XHRcdHNvdXJjZUxhYmVsOiBUb29sRGF0YVNvdXJjZS5jbGFzc2lmeSh0b29sLnNvdXJjZSkubGFiZWwsXG5cdFx0XHRcdFx0XHRzb3VyY2VPcmRpbmFsOiBUb29sRGF0YVNvdXJjZS5jbGFzc2lmeSh0b29sLnNvdXJjZSkub3JkaW5hbCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0b29sLnVzZXJEZXNjcmlwdGlvbiA/PyB0b29sLm1vZGVsRGVzY3JpcHRpb25cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0b29sU2V0IG9mIHRvb2xTZXRzKSB7XG5cdFx0XHRcdGRhdGEucHVzaCh7XG5cdFx0XHRcdFx0bmFtZTogdGhpcy5fbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sU2V0KSxcblx0XHRcdFx0XHRzb3VyY2VMYWJlbDogVG9vbERhdGFTb3VyY2UuY2xhc3NpZnkodG9vbFNldC5zb3VyY2UpLmxhYmVsLFxuXHRcdFx0XHRcdHNvdXJjZU9yZGluYWw6IFRvb2xEYXRhU291cmNlLmNsYXNzaWZ5KHRvb2xTZXQuc291cmNlKS5vcmRpbmFsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB0b29sU2V0LmRlc2NyaXB0aW9uXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0b29sRW51bVZhbHVlcy5sZW5ndGggPSAwO1xuXHRcdFx0dG9vbEVudW1EZXNjcmlwdGlvbnMubGVuZ3RoID0gMDtcblxuXHRcdFx0ZGF0YS5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdGlmIChhLnNvdXJjZU9yZGluYWwgIT09IGIuc291cmNlT3JkaW5hbCkge1xuXHRcdFx0XHRcdHJldHVybiBhLnNvdXJjZU9yZGluYWwgLSBiLnNvdXJjZU9yZGluYWw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGEuc291cmNlTGFiZWwgIT09IGIuc291cmNlTGFiZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gYS5zb3VyY2VMYWJlbC5sb2NhbGVDb21wYXJlKGIuc291cmNlTGFiZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBkYXRhKSB7XG5cdFx0XHRcdHRvb2xFbnVtVmFsdWVzLnB1c2goaXRlbS5uYW1lKTtcblx0XHRcdFx0dG9vbEVudW1EZXNjcmlwdGlvbnMucHVzaChsb2NhbGl6ZSgndG9vbC5kZXNjcmlwdGlvbicsIFwiezF9ICh7MH0pXFxuXFxuezJ9XCIsIGl0ZW0uc291cmNlTGFiZWwsIGl0ZW0ubmFtZSwgaXRlbS5kZXNjcmlwdGlvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5jbGVhcigpOyAvLyByZXNldCBvbGQgc2NoZW1hXG5cdFx0XHRyZWcucmVnaXN0ZXJTY2hlbWEodG9vbFNldFNjaGVtYUlkLCB0b29sU2V0c1NjaGVtYSwgc3RvcmUpO1xuXHRcdH0pKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdFRvb2xTZXRzKCk6IHZvaWQge1xuXG5cdFx0Y29uc3QgcHJvbXB0Rm9sZGVyID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VycmVudFByb2ZpbGUsICgpID0+IHRoaXMuX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUucHJvbXB0c0hvbWUpO1xuXG5cdFx0Y29uc3QgdG9vbHNTaWcgPSBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50KHRoaXMsIHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2Uub25EaWRDaGFuZ2VUb29scyk7XG5cdFx0Y29uc3QgZmlsZUV2ZW50U2lnID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCBFdmVudC5maWx0ZXIodGhpcy5fZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZSwgZSA9PiBlLmFmZmVjdHMocHJvbXB0Rm9sZGVyLmdldCgpKSkpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSB0aGlzLl9zdG9yZS5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGNvbnN0IGdldEZpbGVzSW5Gb2xkZXIgPSBhc3luYyAoZm9sZGVyOiBVUkkpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShmb2xkZXIpKS5jaGlsZHJlbiA/PyBbXTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRyZXR1cm4gW107IC8vIGZvbGRlciBkb2VzIG5vdCBleGlzdCBvciBjYW5ub3QgYmUgcmVhZFxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLl9zdG9yZS5hZGQoYXV0b3J1bihhc3luYyByID0+IHtcblxuXHRcdFx0c3RvcmUuY2xlYXIoKTtcblxuXHRcdFx0dG9vbHNTaWcucmVhZChyKTsgLy8gU0lHTkFMU1xuXHRcdFx0ZmlsZUV2ZW50U2lnLnJlYWQocik7XG5cblx0XHRcdGNvbnN0IHVyaSA9IHByb21wdEZvbGRlci5yZWFkKHIpO1xuXG5cdFx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IGdldEZpbGVzSW5Gb2xkZXIodXJpKTtcblxuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXG5cdFx0XHRcdGlmICghZW50cnkuaXNGaWxlIHx8ICFSYXdUb29sU2V0c1NoYXBlLmlzVG9vbFNldEZpbGVOYW1lKGVudHJ5LnJlc291cmNlKSkge1xuXHRcdFx0XHRcdC8vIG5vdCBpbnRlcmVzdGluZ1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gd2F0Y2ggdGhpcyBmaWxlXG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9maWxlU2VydmljZS53YXRjaChlbnRyeS5yZXNvdXJjZSkpO1xuXG5cdFx0XHRcdGxldCBkYXRhOiBSYXdUb29sU2V0c1NoYXBlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShlbnRyeS5yZXNvdXJjZSwgdW5kZWZpbmVkLCBjdHMudG9rZW4pO1xuXHRcdFx0XHRcdGNvbnN0IHJhd09iaiA9IHBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0ZGF0YSA9IFJhd1Rvb2xTZXRzU2hhcGUuZnJvbShyYXdPYmosIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHJlYWRpbmcgdG9vbCBzZXQgZmlsZSAke2VudHJ5LnJlc291cmNlLnRvU3RyaW5nKCl9OmAsIGVycik7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBbbmFtZSwgdmFsdWVdIG9mIGRhdGEuZW50cmllcykge1xuXG5cdFx0XHRcdFx0Y29uc3QgdG9vbHM6IElUb29sRGF0YVtdID0gW107XG5cdFx0XHRcdFx0Y29uc3QgdG9vbFNldHM6IElUb29sU2V0W10gPSBbXTtcblx0XHRcdFx0XHR2YWx1ZS50b29scy5mb3JFYWNoKG5hbWUgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gUmVzb2x2ZSBieSBmdWxsIHJlZmVyZW5jZSBuYW1lIGZpcnN0LiBUaGlzIGhhbmRsZXMgcXVhbGlmaWVkIG5hbWVzXG5cdFx0XHRcdFx0XHQvLyAoZS5nLiBgdnNjb2RlL21lbW9yeWAsIGBnaXRodWIvKmApIGFzIHdlbGwgYXMgdW5xdWFsaWZpZWQgbmFtZXNcblx0XHRcdFx0XHRcdC8vIChlLmcuIGBtZW1vcnlgKSB2aWEgdGhlaXIgYWxpYXNlcy5cblx0XHRcdFx0XHRcdGNvbnN0IHRvb2xPclRvb2xTZXQgPSB0aGlzLl9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKG5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKGlzVG9vbFNldCh0b29sT3JUb29sU2V0KSkge1xuXHRcdFx0XHRcdFx0XHR0b29sU2V0cy5wdXNoKHRvb2xPclRvb2xTZXQpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHRvb2xPclRvb2xTZXQpIHtcblx0XHRcdFx0XHRcdFx0dG9vbHMucHVzaCh0b29sT3JUb29sU2V0KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gRmFsbCBiYWNrIHRvIGxlZ2FjeSBsb29rdXAgYnkgdW5xdWFsaWZpZWQgcmVmZXJlbmNlIG5hbWUuXG5cdFx0XHRcdFx0XHRjb25zdCB0b29sID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRUb29sQnlOYW1lKG5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKHRvb2wpIHtcblx0XHRcdFx0XHRcdFx0dG9vbHMucHVzaCh0b29sKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgdG9vbFNldCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0VG9vbFNldEJ5TmFtZShuYW1lKTtcblx0XHRcdFx0XHRcdGlmICh0b29sU2V0KSB7XG5cdFx0XHRcdFx0XHRcdHRvb2xTZXRzLnB1c2godG9vbFNldCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmICh0b29scy5sZW5ndGggPT09IDAgJiYgdG9vbFNldHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHQvLyBOTyB0b29scyBpbiB0aGlzIHNldFxuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgdG9vbHNldCA9IHRoaXMuX2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3VzZXInLCBmaWxlOiBlbnRyeS5yZXNvdXJjZSwgbGFiZWw6IGJhc2VuYW1lKGVudHJ5LnJlc291cmNlKSB9LFxuXHRcdFx0XHRcdFx0YHVzZXIvJHtlbnRyeS5yZXNvdXJjZS50b1N0cmluZygpfS8ke25hbWV9YCxcblx0XHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdC8vIHRvb2xSZWZlcmVuY2VOYW1lOiB2YWx1ZS5yZWZlcmVuY2VOYW1lLFxuXHRcdFx0XHRcdFx0XHRpY29uOiB2YWx1ZS5pY29uID8gVGhlbWVJY29uLmZyb21JZCh2YWx1ZS5pY29uKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHZhbHVlLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRkZXByZWNhdGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdCk7XG5cblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdFx0XHRzdG9yZS5hZGQodG9vbHNldCk7XG5cdFx0XHRcdFx0XHR0b29scy5mb3JFYWNoKHRvb2wgPT4gc3RvcmUuYWRkKHRvb2xzZXQuYWRkVG9vbCh0b29sLCB0eCkpKTtcblx0XHRcdFx0XHRcdHRvb2xTZXRzLmZvckVhY2godG9vbFNldCA9PiBzdG9yZS5hZGQodG9vbHNldC5hZGRUb29sU2V0KHRvb2xTZXQsIHR4KSkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyZVRvb2xTZXRzT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNlbGVjdGlvbj86IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcDtcbn1cblxuZnVuY3Rpb24gZ2V0U2VsZWN0aW9uRnJvbUFyZyhhcmc6IHVua25vd24pOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgfCB1bmRlZmluZWQge1xuXHRpZiAoIWlzT2JqZWN0KGFyZykpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3Qgc2VsZWN0aW9uID0gKGFyZyBhcyBJQ29uZmlndXJlVG9vbFNldHNPcHRpb25zKS5zZWxlY3Rpb247XG5cdGlmICghKHNlbGVjdGlvbiBpbnN0YW5jZW9mIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHNlbGVjdGlvbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzKHNlbGVjdGlvbjogVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLCB0b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKTogc3RyaW5nW10ge1xuXHRjb25zdCBlbmFibGVkVG9vbFNldHM6IElUb29sU2V0W10gPSBbXTtcblx0Y29uc3QgZW5hYmxlZFRvb2xzOiBJVG9vbERhdGFbXSA9IFtdO1xuXG5cdGZvciAoY29uc3QgW2l0ZW0sIGVuYWJsZWRdIG9mIHNlbGVjdGlvbikge1xuXHRcdGlmICghZW5hYmxlZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzVG9vbFNldChpdGVtKSkge1xuXHRcdFx0Ly8gT25seSBzZXJpYWxpemUgYSB0b29sIHNldCB3aGVuIG5vbmUgb2YgaXRzIG1lbWJlciB0b29scyBhcmUgZXhwbGljaXRseVxuXHRcdFx0Ly8gdW5jaGVja2VkIGluIHRoZSBzZWxlY3Rpb24uIEEgcGFydGlhbGx5LWRlc2VsZWN0ZWQgdG9vbCBzZXQgd291bGQgb3RoZXJ3aXNlXG5cdFx0XHQvLyBzaWxlbnRseSByZS1lbmFibGUgdGhlIGRlc2VsZWN0ZWQgbWVtYmVyIHRvb2xzLCBtYXRjaGluZyB0aGUgZ3VhcmQgaW5cblx0XHRcdC8vIGB0b0Z1bGxSZWZlcmVuY2VOYW1lc2AuIE1lbWJlcnMgYWJzZW50IGZyb20gdGhlIG1hcCBpbmhlcml0IHRoZSB0b29sIHNldCdzIHN0YXRlLlxuXHRcdFx0aWYgKEl0ZXJhYmxlLmV2ZXJ5KGl0ZW0uZ2V0VG9vbHMoKSwgdG9vbCA9PiBzZWxlY3Rpb24uZ2V0KHRvb2wpICE9PSBmYWxzZSkpIHtcblx0XHRcdFx0ZW5hYmxlZFRvb2xTZXRzLnB1c2goaXRlbSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVuYWJsZWRUb29scy5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGNvdmVyZWRUb29sSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGZvciAoY29uc3QgdG9vbFNldCBvZiBlbmFibGVkVG9vbFNldHMpIHtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgdG9vbFNldC5nZXRUb29scygpKSB7XG5cdFx0XHRjb3ZlcmVkVG9vbElkcy5hZGQodG9vbC5pZCk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgcmVmZXJlbmNlczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBhZGRSZWZlcmVuY2UgPSAocmVmZXJlbmNlTmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0aWYgKHNlZW4uaGFzKHJlZmVyZW5jZU5hbWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlZW4uYWRkKHJlZmVyZW5jZU5hbWUpO1xuXHRcdHJlZmVyZW5jZXMucHVzaChyZWZlcmVuY2VOYW1lKTtcblx0fTtcblxuXHRmb3IgKGNvbnN0IHRvb2xTZXQgb2YgZW5hYmxlZFRvb2xTZXRzKSB7XG5cdFx0YWRkUmVmZXJlbmNlKHRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZSh0b29sU2V0KSk7XG5cdH1cblxuXHRmb3IgKGNvbnN0IHRvb2wgb2YgZW5hYmxlZFRvb2xzKSB7XG5cdFx0aWYgKGNvdmVyZWRUb29sSWRzLmhhcyh0b29sLmlkKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdC8vIGBnZXRGdWxsUmVmZXJlbmNlTmFtZWAgYWxyZWFkeSByZXR1cm5zIHRoZSBxdWFsaWZpZWQgYHRvb2xTZXQvdG9vbGAgbmFtZSBmb3IgdG9vbHNcblx0XHQvLyB0aGF0IGJlbG9uZyB0byBhIG5vbi11c2VyIHRvb2wgc2V0LCBldmVuIHdoZW4gdGhlIHRvb2wgaXMgbm90IGluZGVwZW5kZW50bHlcblx0XHQvLyByZWZlcmVuY2VhYmxlIGluIHByb21wdHMuIE9ubHkgaW5jbHVkZSB0aGUgdG9vbCB3aGVuIHRoZSByZWZlcmVuY2Ugcm91bmQtdHJpcHMsIHdoaWNoXG5cdFx0Ly8gZmlsdGVycyBvdXQgb3JwaGFuIHRvb2xzIHRoYXQgY2Fubm90IGJlIHJlZmVyZW5jZWQgYXQgYWxsLlxuXHRcdGNvbnN0IHJlZmVyZW5jZU5hbWUgPSB0b29sc1NlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWUodG9vbCk7XG5cdFx0aWYgKHRvb2xzU2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZShyZWZlcmVuY2VOYW1lKSAhPT0gdG9vbCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGFkZFJlZmVyZW5jZShyZWZlcmVuY2VOYW1lKTtcblx0fVxuXG5cdHJldHVybiByZWZlcmVuY2VzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVG9vbFNldEZpbGVDb250ZW50cyh0b29sU2V0TmFtZTogc3RyaW5nLCB0b29sUmVmZXJlbmNlczogcmVhZG9ubHkgc3RyaW5nW10pOiBzdHJpbmcge1xuXHRjb25zdCBzZXJpYWxpemVkUmVmZXJlbmNlcyA9IHRvb2xSZWZlcmVuY2VzLm1hcChyZWZlcmVuY2UgPT4gYFxcdFxcdFxcdCR7SlNPTi5zdHJpbmdpZnkocmVmZXJlbmNlKX1gKS5qb2luKCcsXFxuJyk7XG5cblx0cmV0dXJuIFtcblx0XHQneycsXG5cdFx0YFxcdCR7SlNPTi5zdHJpbmdpZnkodG9vbFNldE5hbWUpfToge2AsXG5cdFx0J1xcdFxcdFwidG9vbHNcIjogWycsXG5cdFx0c2VyaWFsaXplZFJlZmVyZW5jZXMsXG5cdFx0J1xcdFxcdF0sJyxcblx0XHQnXFx0XFx0XCJkZXNjcmlwdGlvblwiOiBcIlwiLCcsXG5cdFx0J1xcdFxcdFwiaWNvblwiOiBcInRvb2xzXCInLFxuXHRcdCdcXHR9Jyxcblx0XHQnfScsXG5cdF0uam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cyhyYXdDb250ZW50czogc3RyaW5nLCB0b29sU2V0TmFtZTogc3RyaW5nKTogeyBjb250ZW50czogc3RyaW5nOyBpc0VtcHR5OiBib29sZWFuIH0gfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXJzZWQgPSBwYXJzZShyYXdDb250ZW50cyk7XG5cdGlmICghaXNPYmplY3QocGFyc2VkKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCByZWNvcmQgPSBwYXJzZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGlmICghT2JqZWN0Lmhhc093bihyZWNvcmQsIHRvb2xTZXROYW1lKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRkZWxldGUgcmVjb3JkW3Rvb2xTZXROYW1lXTtcblx0cmV0dXJuIHsgY29udGVudHM6IEpTT04uc3RyaW5naWZ5KHJlY29yZCwgdW5kZWZpbmVkLCAnXFx0JyksIGlzRW1wdHk6IE9iamVjdC5rZXlzKHJlY29yZCkubGVuZ3RoID09PSAwIH07XG59XG5cbi8vIC0tLS0gYWN0aW9uc1xuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJlVG9vbFNldHMgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnY2hhdC5jb25maWd1cmVUb29sU2V0cyc7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENvbmZpZ3VyZVRvb2xTZXRzLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY2hhdC5jb25maWd1cmVUb29sU2V0cycsICdDb25maWd1cmUgVG9vbCBTZXRzLi4uJyksXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZSgnY2hhdC5jb25maWd1cmVUb29sU2V0cy5zaG9ydCcsIFwiVG9vbCBTZXRzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDaGF0Q29udGV4dEtleXMuVG9vbHMudG9vbHNDb3VudC5ncmVhdGVyKDApKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBDSEFUX0NPTkZJR19NRU5VX0lELFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBDaGF0Vmlld0lkKSxcblx0XHRcdFx0b3JkZXI6IDExLFxuXHRcdFx0XHRncm91cDogJzJfbGV2ZWwnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENoYXRDb250ZXh0S2V5cy5lbmFibGVkLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBDaGF0Vmlld0lkKSksXG5cdFx0XHRcdG9yZGVyOiAxMSxcblx0XHRcdFx0Z3JvdXA6ICcyX2xldmVsJ1xuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIG9wdGlvbnM/OiBJQ29uZmlndXJlVG9vbFNldHNPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgdXNlckRhdGFQcm9maWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVXNlckRhdGFQcm9maWxlU2VydmljZSk7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUZpbGVTZXJ2aWNlKTtcblx0XHRjb25zdCB0ZXh0RmlsZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRleHRGaWxlU2VydmljZSk7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBpY2tzOiAoSVF1aWNrUGlja0l0ZW0gJiB7IHRvb2xzZXQ/OiBJVG9vbFNldDsga2luZDogJ2NyZWF0ZUZyb21TZWxlY3Rpb24nIHwgJ2NyZWF0ZU5ld0ZpbGUnIHwgJ2V4aXN0aW5nJyB9KVtdID0gW107XG5cdFx0Ly8gV2hlbiB0aGUgY29tbWFuZCBpcyBpbnZva2VkIHdpdGhvdXQgYW4gZXhwbGljaXQgc2VsZWN0aW9uIChlLmcuIGZyb20gRjEgb3IgdGhlIGNoYXRcblx0XHQvLyB2aWV3IHRpdGxlIG1lbnUpLCBmYWxsIGJhY2sgdG8gdGhlIHRvb2wgc2VsZWN0aW9uIG9mIHRoZSBhY3RpdmUgY2hhdCB3aWRnZXQuXG5cdFx0Y29uc3QgY3VycmVudFNlbGVjdGlvbiA9IGdldFNlbGVjdGlvbkZyb21Bcmcob3B0aW9ucylcblx0XHRcdD8/IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py5pbnB1dC5zZWxlY3RlZFRvb2xzTW9kZWwuZW50cmllc01hcC5nZXQoKVxuXHRcdFx0Pz8gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtdKTtcblx0XHRjb25zdCBzZWxlY3RlZFJlZmVyZW5jZXMgPSBnZXRFbmFibGVkU2VsZWN0aW9uUmVmZXJlbmNlcyhjdXJyZW50U2VsZWN0aW9uLCB0b29sc1NlcnZpY2UpO1xuXG5cdFx0aWYgKHNlbGVjdGVkUmVmZXJlbmNlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LmNvbmZpZ3VyZVRvb2xTZXRzLmNyZWF0ZUZyb21DdXJyZW50U2VsZWN0aW9uJywgXCJDcmVhdGUgZnJvbSBjdXJyZW50IHNlbGVjdGlvbi4uLlwiKSxcblx0XHRcdFx0a2luZDogJ2NyZWF0ZUZyb21TZWxlY3Rpb24nLFxuXHRcdFx0XHRhbHdheXNTaG93OiB0cnVlLFxuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnBsdXMpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRwaWNrcy5wdXNoKHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5jb25maWd1cmVUb29sU2V0cy5hZGQnLCAnQ3JlYXRlIG5ldyB0b29sIHNldHMgZmlsZS4uLicpLFxuXHRcdFx0a2luZDogJ2NyZWF0ZU5ld0ZpbGUnLFxuXHRcdFx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucGx1cylcblx0XHR9KTtcblxuXHRcdGZvciAoY29uc3QgdG9vbFNldCBvZiB0b29sc1NlcnZpY2UudG9vbFNldHMuZ2V0KCkpIHtcblx0XHRcdGlmICh0b29sU2V0LnNvdXJjZS50eXBlICE9PSAndXNlcicpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHBpY2tzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogdG9vbFNldC5yZWZlcmVuY2VOYW1lLFxuXHRcdFx0XHRraW5kOiAnZXhpc3RpbmcnLFxuXHRcdFx0XHR0b29sc2V0OiB0b29sU2V0LFxuXHRcdFx0XHR0b29sdGlwOiB0b29sU2V0LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZSh0b29sU2V0Lmljb24pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UucGljayhwaWNrcywge1xuXHRcdFx0Y2FuUGlja01hbnk6IGZhbHNlLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdjaGF0LmNvbmZpZ3VyZVRvb2xTZXRzLnBsYWNlaG9sZGVyJywgJ1NlbGVjdCBhIHRvb2wgc2V0IHRvIGNvbmZpZ3VyZScpLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFwaWNrKSB7XG5cdFx0XHRyZXR1cm47IC8vIHVzZXIgY2FuY2VsbGVkXG5cdFx0fVxuXG5cdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAoIXBpY2sudG9vbHNldCkge1xuXG5cdFx0XHRjb25zdCBuYW1lID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ2lucHV0LnBsYWNlaG9sZGVyJywgXCJUeXBlIHRvb2wgc2V0cyBmaWxlIG5hbWVcIiksXG5cdFx0XHRcdHZhbGlkYXRlSW5wdXQ6IGFzeW5jIChpbnB1dCkgPT4ge1xuXHRcdFx0XHRcdGlmICghaW5wdXQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYmFkX25hbWUxJywgXCJJbnZhbGlkIGZpbGUgbmFtZVwiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFpc1ZhbGlkQmFzZW5hbWUoaW5wdXQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2JhZF9uYW1lMicsIFwiJ3swfScgaXMgbm90IGEgdmFsaWQgZmlsZSBuYW1lXCIsIGlucHV0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHBpY2sua2luZCA9PT0gJ2NyZWF0ZUZyb21TZWxlY3Rpb24nKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSBqb2luUGF0aCh1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnByb21wdHNIb21lLCBgJHtpbnB1dH0ke1Jhd1Rvb2xTZXRzU2hhcGUuc3VmZml4fWApO1xuXHRcdFx0XHRcdFx0aWYgKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhjYW5kaWRhdGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5jb25maWd1cmVUb29sU2V0cy5maWxlQWxyZWFkeUV4aXN0cycsIFwiQSBmaWxlIHdpdGggdGhpcyBuYW1lIGFscmVhZHkgZXhpc3RzXCIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGlzRmFsc3lPcldoaXRlc3BhY2UobmFtZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyB1c2VyIGNhbmNlbGxlZFxuXHRcdFx0fVxuXG5cdFx0XHRyZXNvdXJjZSA9IGpvaW5QYXRoKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUucHJvbXB0c0hvbWUsIGAke25hbWV9JHtSYXdUb29sU2V0c1NoYXBlLnN1ZmZpeH1gKTtcblxuXHRcdFx0aWYgKHBpY2sua2luZCA9PT0gJ2NyZWF0ZUZyb21TZWxlY3Rpb24nKSB7XG5cdFx0XHRcdGNvbnN0IHRvb2xTZXROYW1lID0gYXdhaXQgcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgndG9vbFNldE5hbWUucGxhY2Vob2xkZXInLCBcIlR5cGUgbmV3IHRvb2wgc2V0IG5hbWVcIiksXG5cdFx0XHRcdFx0dmFsaWRhdGVJbnB1dDogYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoaXNGYWxzeU9yV2hpdGVzcGFjZShpbnB1dCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCd0b29sU2V0TmFtZS5iYWRfbmFtZScsIFwiVG9vbCBzZXQgbmFtZSBjYW5ub3QgYmUgZW1wdHlcIik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCF0b29sU2V0TmFtZSB8fCBpc0ZhbHN5T3JXaGl0ZXNwYWNlKHRvb2xTZXROYW1lKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGF3YWl0IHRleHRGaWxlU2VydmljZS53cml0ZShyZXNvdXJjZSwgY3JlYXRlVG9vbFNldEZpbGVDb250ZW50cyh0b29sU2V0TmFtZSwgc2VsZWN0ZWRSZWZlcmVuY2VzKSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFhd2FpdCBmaWxlU2VydmljZS5leGlzdHMocmVzb3VyY2UpKSB7XG5cdFx0XHRcdGF3YWl0IHRleHRGaWxlU2VydmljZS53cml0ZShyZXNvdXJjZSwgW1xuXHRcdFx0XHRcdCcvLyBQbGFjZSB5b3VyIHRvb2wgc2V0cyBoZXJlLi4uJyxcblx0XHRcdFx0XHQnLy8gRXhhbXBsZTonLFxuXHRcdFx0XHRcdCcvLyB7Jyxcblx0XHRcdFx0XHQnLy8gXFx0XCJ0b29sU2V0TmFtZVwiOiB7Jyxcblx0XHRcdFx0XHQnLy8gXFx0XFx0XCJ0b29sc1wiOiBbJyxcblx0XHRcdFx0XHQnLy8gXFx0XFx0XFx0XCJzb21lVG9vbFwiLCcsXG5cdFx0XHRcdFx0Jy8vIFxcdFxcdFxcdFwiYW5vdGhlclRvb2xcIicsXG5cdFx0XHRcdFx0Jy8vIFxcdFxcdF0sJyxcblx0XHRcdFx0XHQnLy8gXFx0XFx0XCJkZXNjcmlwdGlvblwiOiBcImRlc2NyaXB0aW9uXCIsJyxcblx0XHRcdFx0XHQnLy8gXFx0XFx0XCJpY29uXCI6IFwidG9vbHNcIicsXG5cdFx0XHRcdFx0Jy8vIFxcdH0nLFxuXHRcdFx0XHRcdCcvLyB9Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0VHlwZShwaWNrLnRvb2xzZXQuc291cmNlLnR5cGUgPT09ICd1c2VyJyk7XG5cdFx0XHRyZXNvdXJjZSA9IHBpY2sudG9vbHNldC5zb3VyY2UuZmlsZTtcblx0XHR9XG5cblx0XHRhd2FpdCBlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxxQkFBcUIsMkJBQTJCLFNBQVMsbUJBQW1CO0FBQ3JGLFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxZQUFZLGdCQUFnQjtBQUVyQyxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBDO0FBRW5ELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWUsMkJBQTJCO0FBQ25ELFNBQVMsNEJBQWlELFdBQVcsNkJBQTZCLHNCQUFzQjtBQUV4SCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFNBQVMsc0JBQXNCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FB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QUksS0FBSyxTQUFTLHVCQUF1QjtBQUN4QyxrQkFBTSxZQUFZLFNBQVMsdUJBQXVCLGVBQWUsYUFBYSxHQUFHLEtBQUssR0FBRyxpQkFBaUIsTUFBTSxFQUFFO0FBQ2xILGdCQUFJLE1BQU0sWUFBWSxPQUFPLFNBQVMsR0FBRztBQUN4QyxxQkFBTyxTQUFTLDRDQUE0QyxzQ0FBc0M7QUFBQSxZQUNuRztBQUFBLFVBQ0Q7QUFDQSxpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNELENBQUM7QUFFRCxVQUFJLG9CQUFvQixJQUFJLEdBQUc7QUFDOUI7QUFBQSxNQUNEO0FBRUEsaUJBQVcsU0FBUyx1QkFBdUIsZUFBZSxhQUFhLEdBQUcsSUFBSSxHQUFHLGlCQUFpQixNQUFNLEVBQUU7QUFFMUcsVUFBSSxLQUFLLFNBQVMsdUJBQXVCO0FBQ3hDLGNBQU0sY0FBYyxNQUFNLGtCQUFrQixNQUFNO0FBQUEsVUFDakQsYUFBYSxTQUFTLDJCQUEyQix3QkFBd0I7QUFBQSxVQUN6RSxlQUFlLE9BQU8sVUFBVTtBQUMvQixnQkFBSSxvQkFBb0IsS0FBSyxHQUFHO0FBQy9CLHFCQUFPLFNBQVMsd0JBQXdCLCtCQUErQjtBQUFBLFlBQ3hFO0FBQ0EsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRCxDQUFDO0FBRUQsWUFBSSxDQUFDLGVBQWUsb0JBQW9CLFdBQVcsR0FBRztBQUNyRDtBQUFBLFFBQ0Q7QUFFQSxjQUFNLGdCQUFnQixNQUFNLFVBQVUsMEJBQTBCLGFBQWEsa0JBQWtCLENBQUM7QUFBQSxNQUNqRyxXQUFXLENBQUMsTUFBTSxZQUFZLE9BQU8sUUFBUSxHQUFHO0FBQy9DLGNBQU0sZ0JBQWdCLE1BQU0sVUFBVTtBQUFBLFVBQ3JDO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxNQUNiO0FBQUEsSUFFRCxPQUFPO0FBQ04saUJBQVcsS0FBSyxRQUFRLE9BQU8sU0FBUyxNQUFNO0FBQzlDLGlCQUFXLEtBQUssUUFBUSxPQUFPO0FBQUEsSUFDaEM7QUFFQSxVQUFNLGNBQWMsV0FBVyxFQUFFLFVBQVUsU0FBUyxFQUFFLFFBQVEsS0FBSyxFQUFFLENBQUM7QUFBQSxFQUN2RTtBQUNEO0FBekphLG1CQUVJLEtBQUs7QUFGZixJQUFNLG9CQUFOOyIsCiAgIm5hbWVzIjogWyJuYW1lIl0KfQo=
