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
import { Range } from "../../../../../../editor/common/core/range.js";
import { localize } from "../../../../../../nls.js";
import { ILanguageModelToolsService } from "../../tools/languageModelToolsService.js";
import { getPromptsTypeForLanguageId, PromptsType } from "../promptTypes.js";
import { IPromptsService } from "../service/promptsService.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { LEGACY_MODE_FILE_EXTENSION } from "../config/promptFileLocations.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { MARKERS_OWNER_ID, PromptValidatorMarkerCode } from "./promptValidator.js";
import { IMarkerService } from "../../../../../../platform/markers/common/markers.js";
import { CodeActionKind } from "../../../../../../editor/contrib/codeAction/common/types.js";
import { getTarget, isVSCodeOrDefaultTarget } from "./promptFileAttributes.js";
let PromptCodeActionProvider = class {
  constructor(promptsService, languageModelToolsService, fileService, markerService) {
    this.promptsService = promptsService;
    this.languageModelToolsService = languageModelToolsService;
    this.fileService = fileService;
    this.markerService = markerService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptCodeActionProvider";
  }
  async provideCodeActions(model, range, context, token) {
    const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptType || promptType === PromptsType.instructions) {
      return void 0;
    }
    const result = [];
    const promptAST = this.promptsService.getParsedPromptFile(model);
    switch (promptType) {
      case PromptsType.agent:
        this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
        this.getEnableMcpServerCodeActions(model, range, result);
        await this.getMigrateModeFileCodeActions(model, result);
        break;
      case PromptsType.prompt:
        this.getUpdateModeCodeActions(promptAST, model, range, result);
        this.getUpdateToolsCodeActions(promptAST, promptType, model, range, result);
        this.getEnableMcpServerCodeActions(model, range, result);
        break;
    }
    if (result.length === 0) {
      return void 0;
    }
    return {
      actions: result,
      dispose: () => {
      }
    };
  }
  getMarkers(model, range) {
    const markers = this.markerService.read({ resource: model.uri, owner: MARKERS_OWNER_ID });
    return markers.filter((marker) => range.containsRange(marker));
  }
  createCodeAction(model, range, title, edits, command) {
    return {
      title,
      ...edits ? { edit: { edits } } : {},
      ...command ? { command } : {},
      ranges: [range],
      diagnostics: this.getMarkers(model, range),
      kind: CodeActionKind.QuickFix.value
    };
  }
  getEnableMcpServerCodeActions(model, range, result) {
    const markersInRange = this.getMarkersInRange(model, range);
    for (const marker of markersInRange) {
      const markerCode = this.getMarkerCode(marker);
      if (markerCode === PromptValidatorMarkerCode.MissingGithubMcpServer) {
        result.push(this.createCodeAction(
          model,
          range,
          localize("enableGithubMcpServerSetting", "Enable Built-in GitHub MCP Server"),
          void 0,
          { id: "workbench.action.openSettings", title: "", arguments: ["@id:github.copilot.chat.githubMcpServer.enabled"] }
        ));
        result.push(this.createCodeAction(
          model,
          range,
          localize("installGithubMcpServer", "Install GitHub MCP Server from Marketplace"),
          void 0,
          { id: "workbench.extensions.search", title: "", arguments: ["@mcp github"] }
        ));
      } else if (markerCode === PromptValidatorMarkerCode.MissingPlaywrightMcpServer) {
        result.push(this.createCodeAction(
          model,
          range,
          localize("installPlaywrightMcpServer", "Install Playwright MCP Server from Marketplace"),
          void 0,
          { id: "workbench.extensions.search", title: "", arguments: ["@mcp playwright"] }
        ));
      } else if (markerCode === PromptValidatorMarkerCode.UnknownExtensionReference) {
        const reference = model.getValueInRange(new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)).trim();
        const extensionId = reference.split("/")[0].replace(/^['"]|['"]$/g, "");
        if (extensionId) {
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchExtensionMarketplace", "Search Marketplace for Extension '{0}'", extensionId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@id:${extensionId}`] }
          ));
        }
      } else if (markerCode === PromptValidatorMarkerCode.UnknownMcpServerReference) {
        const reference = model.getValueInRange(new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)).trim();
        const serverId = reference.replace(/^['"]|['"]$/g, "");
        if (serverId) {
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchMcpServerMarketplace", "Search Marketplace for MCP Server '{0}'", serverId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@mcp ${serverId}`] }
          ));
        }
      } else {
        const reference = model.getValueInRange(new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn)).trim();
        if (reference) {
          const extensionId = reference.split("/")[0].replace(/^['"]|['"]$/g, "");
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchExtensionMarketplaceGeneric", "Search Marketplace for Extension '{0}'", extensionId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@id:${extensionId}`] }
          ));
          const serverId = reference.replace(/^['"]|['"]$/g, "");
          result.push(this.createCodeAction(
            model,
            range,
            localize("searchMcpServerMarketplaceGeneric", "Search Marketplace for MCP Server '{0}'", serverId),
            void 0,
            { id: "workbench.extensions.search", title: "", arguments: [`@mcp ${serverId}`] }
          ));
        }
      }
    }
  }
  getMarkerCode(marker) {
    if (!marker.code) {
      return void 0;
    }
    return typeof marker.code === "string" ? marker.code : marker.code.value;
  }
  getMarkersInRange(model, range) {
    const markers = this.markerService.read({ resource: model.uri, owner: MARKERS_OWNER_ID });
    return markers.filter((marker) => {
      const markerRange = new Range(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn);
      return markerRange.intersectRanges(range);
    });
  }
  getUpdateModeCodeActions(promptFile, model, range, result) {
    const modeAttr = promptFile.header?.getAttribute(PromptHeaderAttributes.mode);
    if (!modeAttr?.range.containsRange(range)) {
      return;
    }
    const keyRange = new Range(modeAttr.range.startLineNumber, modeAttr.range.startColumn, modeAttr.range.startLineNumber, modeAttr.range.startColumn + modeAttr.key.length);
    result.push(this.createCodeAction(
      model,
      keyRange,
      localize("renameToAgent", "Rename to 'agent'"),
      [asWorkspaceTextEdit(model, { range: keyRange, text: "agent" })]
    ));
  }
  async getMigrateModeFileCodeActions(model, result) {
    if (model.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
      const location = this.promptsService.getAgentFileURIFromModeFile(model.uri);
      if (location && await this.fileService.canMove(model.uri, location)) {
        const edit = { oldResource: model.uri, newResource: location, options: { overwrite: false, copy: false } };
        result.push(this.createCodeAction(
          model,
          new Range(1, 1, 1, 4),
          localize("migrateToAgent", "Migrate to custom agent file"),
          [edit]
        ));
      }
    }
  }
  getUpdateToolsCodeActions(promptFile, promptType, model, range, result) {
    if (!promptFile.header) {
      return;
    }
    const toolsAttr = promptFile.header.getAttribute(PromptHeaderAttributes.tools);
    if (!toolsAttr || !toolsAttr.value.range.containsRange(range)) {
      return;
    }
    const target = getTarget(promptType, promptFile.header);
    if (!isVSCodeOrDefaultTarget(target)) {
      return;
    }
    let value = toolsAttr.value;
    if (value.type === "scalar") {
      value = parseCommaSeparatedList(value);
    }
    if (value.type !== "sequence") {
      return;
    }
    const values = value.items;
    const deprecatedNames = new Lazy(() => this.languageModelToolsService.getDeprecatedFullReferenceNames());
    const edits = [];
    for (const item of values) {
      if (item.type !== "scalar") {
        continue;
      }
      const newNames = deprecatedNames.value.get(item.value);
      if (newNames && newNames.size > 0) {
        const quote = model.getValueInRange(new Range(item.range.startLineNumber, item.range.startColumn, item.range.endLineNumber, item.range.startColumn + 1));
        if (newNames.size === 1) {
          const newName = Array.from(newNames)[0];
          const text = quote === `'` || quote === '"' ? quote + newName + quote : newName;
          const edit = { range: item.range, text };
          edits.push(edit);
          if (item.range.containsRange(range)) {
            result.push(this.createCodeAction(
              model,
              item.range,
              localize("updateToolName", "Update to '{0}'", newName),
              [asWorkspaceTextEdit(model, edit)]
            ));
          }
        } else {
          const newNamesArray = Array.from(newNames).sort((a, b) => a.localeCompare(b));
          const separator = model.getValueInRange(new Range(item.range.startLineNumber, item.range.endColumn, item.range.endLineNumber, item.range.endColumn + 2));
          const useCommaSpace = separator.includes(",");
          const delimiterText = useCommaSpace ? ", " : ",";
          const newNamesText = newNamesArray.map(
            (name) => quote === `'` || quote === '"' ? quote + name + quote : name
          ).join(delimiterText);
          const edit = { range: item.range, text: newNamesText };
          edits.push(edit);
          if (item.range.containsRange(range)) {
            result.push(this.createCodeAction(
              model,
              item.range,
              localize("expandToolNames", "Expand to {0} tools", newNames.size),
              [asWorkspaceTextEdit(model, edit)]
            ));
          }
        }
      }
    }
    if (edits.length && result.length === 0 || edits.length > 1) {
      result.push(
        this.createCodeAction(
          model,
          value.range,
          localize("updateAllToolNames", "Update all tool names"),
          edits.map((edit) => asWorkspaceTextEdit(model, edit))
        )
      );
    }
  }
};
PromptCodeActionProvider = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IMarkerService)
], PromptCodeActionProvider);
function asWorkspaceTextEdit(model, textEdit) {
  return {
    versionId: model.getVersionId(),
    resource: model.uri,
    textEdit
  };
}
export {
  PromptCodeActionProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxccHJvbXB0U3ludGF4XFxsYW5ndWFnZVByb3ZpZGVyc1xccHJvbXB0Q29kZUFjdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uLCBDb2RlQWN0aW9uQ29udGV4dCwgQ29kZUFjdGlvbkxpc3QsIENvZGVBY3Rpb25Qcm92aWRlciwgSVdvcmtzcGFjZUZpbGVFZGl0LCBJV29ya3NwYWNlVGV4dEVkaXQsIFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZCwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0LCBQYXJzZWRQcm9tcHRGaWxlLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIH0gZnJvbSAnLi4vcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IExFR0FDWV9NT0RFX0ZJTEVfRVhURU5TSU9OIH0gZnJvbSAnLi4vY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IE1BUktFUlNfT1dORVJfSUQsIFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUgfSBmcm9tICcuL3Byb21wdFZhbGlkYXRvci5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZ2V0VGFyZ2V0LCBpc1ZTQ29kZU9yRGVmYXVsdFRhcmdldCB9IGZyb20gJy4vcHJvbXB0RmlsZUF0dHJpYnV0ZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgUHJvbXB0Q29kZUFjdGlvblByb3ZpZGVyIGltcGxlbWVudHMgQ29kZUFjdGlvblByb3ZpZGVyIHtcblx0LyoqXG5cdCAqIERlYnVnIGRpc3BsYXkgbmFtZSBmb3IgdGhpcyBwcm92aWRlci5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBfZGVidWdEaXNwbGF5TmFtZTogc3RyaW5nID0gJ1Byb21wdENvZGVBY3Rpb25Qcm92aWRlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNvZGVBY3Rpb25zKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UgfCBTZWxlY3Rpb24sIGNvbnRleHQ6IENvZGVBY3Rpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPENvZGVBY3Rpb25MaXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcHJvbXB0VHlwZSA9IGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZChtb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXHRcdGlmICghcHJvbXB0VHlwZSB8fCBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdC8vIGlmIHRoZSBtb2RlbCBpcyBub3QgYSBwcm9tcHQsIHdlIGRvbid0IHByb3ZpZGUgYW55IGNvZGUgYWN0aW9uc1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQ6IENvZGVBY3Rpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3QgcHJvbXB0QVNUID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsKTtcblx0XHRzd2l0Y2ggKHByb21wdFR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdHRoaXMuZ2V0VXBkYXRlVG9vbHNDb2RlQWN0aW9ucyhwcm9tcHRBU1QsIHByb21wdFR5cGUsIG1vZGVsLCByYW5nZSwgcmVzdWx0KTtcblx0XHRcdFx0dGhpcy5nZXRFbmFibGVNY3BTZXJ2ZXJDb2RlQWN0aW9ucyhtb2RlbCwgcmFuZ2UsIHJlc3VsdCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZ2V0TWlncmF0ZU1vZGVGaWxlQ29kZUFjdGlvbnMobW9kZWwsIHJlc3VsdCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRcdHRoaXMuZ2V0VXBkYXRlTW9kZUNvZGVBY3Rpb25zKHByb21wdEFTVCwgbW9kZWwsIHJhbmdlLCByZXN1bHQpO1xuXHRcdFx0XHR0aGlzLmdldFVwZGF0ZVRvb2xzQ29kZUFjdGlvbnMocHJvbXB0QVNULCBwcm9tcHRUeXBlLCBtb2RlbCwgcmFuZ2UsIHJlc3VsdCk7XG5cdFx0XHRcdHRoaXMuZ2V0RW5hYmxlTWNwU2VydmVyQ29kZUFjdGlvbnMobW9kZWwsIHJhbmdlLCByZXN1bHQpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjdGlvbnM6IHJlc3VsdCxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cblx0fVxuXG5cdHByaXZhdGUgZ2V0TWFya2Vycyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlKTogSU1hcmtlckRhdGFbXSB7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMubWFya2VyU2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IG1vZGVsLnVyaSwgb3duZXI6IE1BUktFUlNfT1dORVJfSUQgfSk7XG5cdFx0cmV0dXJuIG1hcmtlcnMuZmlsdGVyKG1hcmtlciA9PiByYW5nZS5jb250YWluc1JhbmdlKG1hcmtlcikpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb2RlQWN0aW9uKG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogUmFuZ2UsIHRpdGxlOiBzdHJpbmcsIGVkaXRzPzogQXJyYXk8SVdvcmtzcGFjZVRleHRFZGl0IHwgSVdvcmtzcGFjZUZpbGVFZGl0PiwgY29tbWFuZD86IHsgaWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgYXJndW1lbnRzPzogdW5rbm93bltdIH0pOiBDb2RlQWN0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGl0bGUsXG5cdFx0XHQuLi4oZWRpdHMgPyB7IGVkaXQ6IHsgZWRpdHMgfSB9IDoge30pLFxuXHRcdFx0Li4uKGNvbW1hbmQgPyB7IGNvbW1hbmQgfSA6IHt9KSxcblx0XHRcdHJhbmdlczogW3JhbmdlXSxcblx0XHRcdGRpYWdub3N0aWNzOiB0aGlzLmdldE1hcmtlcnMobW9kZWwsIHJhbmdlKSxcblx0XHRcdGtpbmQ6IENvZGVBY3Rpb25LaW5kLlF1aWNrRml4LnZhbHVlXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RW5hYmxlTWNwU2VydmVyQ29kZUFjdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSwgcmVzdWx0OiBDb2RlQWN0aW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBtYXJrZXJzSW5SYW5nZSA9IHRoaXMuZ2V0TWFya2Vyc0luUmFuZ2UobW9kZWwsIHJhbmdlKTtcblx0XHRmb3IgKGNvbnN0IG1hcmtlciBvZiBtYXJrZXJzSW5SYW5nZSkge1xuXHRcdFx0Y29uc3QgbWFya2VyQ29kZSA9IHRoaXMuZ2V0TWFya2VyQ29kZShtYXJrZXIpO1xuXHRcdFx0aWYgKG1hcmtlckNvZGUgPT09IFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuTWlzc2luZ0dpdGh1Yk1jcFNlcnZlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLmNyZWF0ZUNvZGVBY3Rpb24oXG5cdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2VuYWJsZUdpdGh1Yk1jcFNlcnZlclNldHRpbmcnLCBcIkVuYWJsZSBCdWlsdC1pbiBHaXRIdWIgTUNQIFNlcnZlclwiKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0eyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFsnQGlkOmdpdGh1Yi5jb3BpbG90LmNoYXQuZ2l0aHViTWNwU2VydmVyLmVuYWJsZWQnXSB9XG5cdFx0XHRcdCkpO1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLmNyZWF0ZUNvZGVBY3Rpb24oXG5cdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2luc3RhbGxHaXRodWJNY3BTZXJ2ZXInLCBcIkluc3RhbGwgR2l0SHViIE1DUCBTZXJ2ZXIgZnJvbSBNYXJrZXRwbGFjZVwiKSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0eyBpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaCcsIHRpdGxlOiAnJywgYXJndW1lbnRzOiBbJ0BtY3AgZ2l0aHViJ10gfVxuXHRcdFx0XHQpKTtcblx0XHRcdH0gZWxzZSBpZiAobWFya2VyQ29kZSA9PT0gUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5NaXNzaW5nUGxheXdyaWdodE1jcFNlcnZlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh0aGlzLmNyZWF0ZUNvZGVBY3Rpb24oXG5cdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2luc3RhbGxQbGF5d3JpZ2h0TWNwU2VydmVyJywgXCJJbnN0YWxsIFBsYXl3cmlnaHQgTUNQIFNlcnZlciBmcm9tIE1hcmtldHBsYWNlXCIpLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR7IGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJywgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFsnQG1jcCBwbGF5d3JpZ2h0J10gfVxuXHRcdFx0XHQpKTtcblx0XHRcdH0gZWxzZSBpZiAobWFya2VyQ29kZSA9PT0gUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5Vbmtub3duRXh0ZW5zaW9uUmVmZXJlbmNlKSB7XG5cdFx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UobWFya2VyLnN0YXJ0TGluZU51bWJlciwgbWFya2VyLnN0YXJ0Q29sdW1uLCBtYXJrZXIuZW5kTGluZU51bWJlciwgbWFya2VyLmVuZENvbHVtbikpLnRyaW0oKTtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSByZWZlcmVuY2Uuc3BsaXQoJy8nKVswXS5yZXBsYWNlKC9eWydcIl18WydcIl0kL2csICcnKTtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKFxuXHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzZWFyY2hFeHRlbnNpb25NYXJrZXRwbGFjZScsIFwiU2VhcmNoIE1hcmtldHBsYWNlIGZvciBFeHRlbnNpb24gJ3swfSdcIiwgZXh0ZW5zaW9uSWQpLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0eyBpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaCcsIHRpdGxlOiAnJywgYXJndW1lbnRzOiBbYEBpZDoke2V4dGVuc2lvbklkfWBdIH1cblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChtYXJrZXJDb2RlID09PSBQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLlVua25vd25NY3BTZXJ2ZXJSZWZlcmVuY2UpIHtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBtYXJrZXIuc3RhcnRDb2x1bW4sIG1hcmtlci5lbmRMaW5lTnVtYmVyLCBtYXJrZXIuZW5kQ29sdW1uKSkudHJpbSgpO1xuXHRcdFx0XHRjb25zdCBzZXJ2ZXJJZCA9IHJlZmVyZW5jZS5yZXBsYWNlKC9eWydcIl18WydcIl0kL2csICcnKTtcblx0XHRcdFx0aWYgKHNlcnZlcklkKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKFxuXHRcdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzZWFyY2hNY3BTZXJ2ZXJNYXJrZXRwbGFjZScsIFwiU2VhcmNoIE1hcmtldHBsYWNlIGZvciBNQ1AgU2VydmVyICd7MH0nXCIsIHNlcnZlcklkKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHsgaWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5zZWFyY2gnLCB0aXRsZTogJycsIGFyZ3VtZW50czogW2BAbWNwICR7c2VydmVySWR9YF0gfVxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZWZlcmVuY2UgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKG1hcmtlci5zdGFydExpbmVOdW1iZXIsIG1hcmtlci5zdGFydENvbHVtbiwgbWFya2VyLmVuZExpbmVOdW1iZXIsIG1hcmtlci5lbmRDb2x1bW4pKS50cmltKCk7XG5cdFx0XHRcdGlmIChyZWZlcmVuY2UpIHtcblx0XHRcdFx0XHRjb25zdCBleHRlbnNpb25JZCA9IHJlZmVyZW5jZS5zcGxpdCgnLycpWzBdLnJlcGxhY2UoL15bJ1wiXXxbJ1wiXSQvZywgJycpO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihcblx0XHRcdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnc2VhcmNoRXh0ZW5zaW9uTWFya2V0cGxhY2VHZW5lcmljJywgXCJTZWFyY2ggTWFya2V0cGxhY2UgZm9yIEV4dGVuc2lvbiAnezB9J1wiLCBleHRlbnNpb25JZCksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR7IGlkOiAnd29ya2JlbmNoLmV4dGVuc2lvbnMuc2VhcmNoJywgdGl0bGU6ICcnLCBhcmd1bWVudHM6IFtgQGlkOiR7ZXh0ZW5zaW9uSWR9YF0gfVxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdGNvbnN0IHNlcnZlcklkID0gcmVmZXJlbmNlLnJlcGxhY2UoL15bJ1wiXXxbJ1wiXSQvZywgJycpO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihcblx0XHRcdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnc2VhcmNoTWNwU2VydmVyTWFya2V0cGxhY2VHZW5lcmljJywgXCJTZWFyY2ggTWFya2V0cGxhY2UgZm9yIE1DUCBTZXJ2ZXIgJ3swfSdcIiwgc2VydmVySWQpLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0eyBpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaCcsIHRpdGxlOiAnJywgYXJndW1lbnRzOiBbYEBtY3AgJHtzZXJ2ZXJJZH1gXSB9XG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE1hcmtlckNvZGUobWFya2VyOiBJTWFya2VyRGF0YSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFtYXJrZXIuY29kZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVvZiBtYXJrZXIuY29kZSA9PT0gJ3N0cmluZycgPyBtYXJrZXIuY29kZSA6IG1hcmtlci5jb2RlLnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNYXJrZXJzSW5SYW5nZShtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlKTogSU1hcmtlckRhdGFbXSB7XG5cdFx0Y29uc3QgbWFya2VycyA9IHRoaXMubWFya2VyU2VydmljZS5yZWFkKHsgcmVzb3VyY2U6IG1vZGVsLnVyaSwgb3duZXI6IE1BUktFUlNfT1dORVJfSUQgfSk7XG5cdFx0cmV0dXJuIG1hcmtlcnMuZmlsdGVyKG1hcmtlciA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZXJSYW5nZSA9IG5ldyBSYW5nZShtYXJrZXIuc3RhcnRMaW5lTnVtYmVyLCBtYXJrZXIuc3RhcnRDb2x1bW4sIG1hcmtlci5lbmRMaW5lTnVtYmVyLCBtYXJrZXIuZW5kQ29sdW1uKTtcblx0XHRcdHJldHVybiBtYXJrZXJSYW5nZS5pbnRlcnNlY3RSYW5nZXMocmFuZ2UpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRVcGRhdGVNb2RlQ29kZUFjdGlvbnMocHJvbXB0RmlsZTogUGFyc2VkUHJvbXB0RmlsZSwgbW9kZWw6IElUZXh0TW9kZWwsIHJhbmdlOiBSYW5nZSwgcmVzdWx0OiBDb2RlQWN0aW9uW10pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlQXR0ciA9IHByb21wdEZpbGUuaGVhZGVyPy5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlKTtcblx0XHRpZiAoIW1vZGVBdHRyPy5yYW5nZS5jb250YWluc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXlSYW5nZSA9IG5ldyBSYW5nZShtb2RlQXR0ci5yYW5nZS5zdGFydExpbmVOdW1iZXIsIG1vZGVBdHRyLnJhbmdlLnN0YXJ0Q29sdW1uLCBtb2RlQXR0ci5yYW5nZS5zdGFydExpbmVOdW1iZXIsIG1vZGVBdHRyLnJhbmdlLnN0YXJ0Q29sdW1uICsgbW9kZUF0dHIua2V5Lmxlbmd0aCk7XG5cdFx0cmVzdWx0LnB1c2godGhpcy5jcmVhdGVDb2RlQWN0aW9uKG1vZGVsLCBrZXlSYW5nZSxcblx0XHRcdGxvY2FsaXplKCdyZW5hbWVUb0FnZW50JywgXCJSZW5hbWUgdG8gJ2FnZW50J1wiKSxcblx0XHRcdFthc1dvcmtzcGFjZVRleHRFZGl0KG1vZGVsLCB7IHJhbmdlOiBrZXlSYW5nZSwgdGV4dDogJ2FnZW50JyB9KV1cblx0XHQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0TWlncmF0ZU1vZGVGaWxlQ29kZUFjdGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHJlc3VsdDogQ29kZUFjdGlvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKG1vZGVsLnVyaS5wYXRoLmVuZHNXaXRoKExFR0FDWV9NT0RFX0ZJTEVfRVhURU5TSU9OKSkge1xuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnByb21wdHNTZXJ2aWNlLmdldEFnZW50RmlsZVVSSUZyb21Nb2RlRmlsZShtb2RlbC51cmkpO1xuXHRcdFx0aWYgKGxvY2F0aW9uICYmIGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuY2FuTW92ZShtb2RlbC51cmksIGxvY2F0aW9uKSkge1xuXHRcdFx0XHRjb25zdCBlZGl0OiBJV29ya3NwYWNlRmlsZUVkaXQgPSB7IG9sZFJlc291cmNlOiBtb2RlbC51cmksIG5ld1Jlc291cmNlOiBsb2NhdGlvbiwgb3B0aW9uczogeyBvdmVyd3JpdGU6IGZhbHNlLCBjb3B5OiBmYWxzZSB9IH07XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihtb2RlbCwgbmV3IFJhbmdlKDEsIDEsIDEsIDQpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdtaWdyYXRlVG9BZ2VudCcsIFwiTWlncmF0ZSB0byBjdXN0b20gYWdlbnQgZmlsZVwiKSxcblx0XHRcdFx0XHRbZWRpdF1cblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRVcGRhdGVUb29sc0NvZGVBY3Rpb25zKHByb21wdEZpbGU6IFBhcnNlZFByb21wdEZpbGUsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlLCByZXN1bHQ6IENvZGVBY3Rpb25bXSk6IHZvaWQge1xuXHRcdGlmICghcHJvbXB0RmlsZS5oZWFkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdG9vbHNBdHRyID0gcHJvbXB0RmlsZS5oZWFkZXIuZ2V0QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMudG9vbHMpO1xuXHRcdGlmICghdG9vbHNBdHRyIHx8ICF0b29sc0F0dHIudmFsdWUucmFuZ2UuY29udGFpbnNSYW5nZShyYW5nZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZ2V0VGFyZ2V0KHByb21wdFR5cGUsIHByb21wdEZpbGUuaGVhZGVyKTtcblx0XHRpZiAoIWlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0KHRhcmdldCkpIHtcblx0XHRcdC8vIEdpdEh1YiBDb3BpbG90IGFuZCBDbGF1ZGUgY3VzdG9tIGFnZW50cyB1c2UgYSBmaXhlZCBzZXQgb2YgdG9vbCBuYW1lcyB0aGF0IGFyZSBub3QgZGVwcmVjYXRlZFxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgdmFsdWUgPSB0b29sc0F0dHIudmFsdWU7XG5cdFx0aWYgKHZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHR2YWx1ZSA9IHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0KHZhbHVlKTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWVzID0gdmFsdWUuaXRlbXM7XG5cdFx0Y29uc3QgZGVwcmVjYXRlZE5hbWVzID0gbmV3IExhenkoKCkgPT4gdGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldERlcHJlY2F0ZWRGdWxsUmVmZXJlbmNlTmFtZXMoKSk7XG5cdFx0Y29uc3QgZWRpdHM6IFRleHRFZGl0W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdmFsdWVzKSB7XG5cdFx0XHRpZiAoaXRlbS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld05hbWVzID0gZGVwcmVjYXRlZE5hbWVzLnZhbHVlLmdldChpdGVtLnZhbHVlKTtcblx0XHRcdGlmIChuZXdOYW1lcyAmJiBuZXdOYW1lcy5zaXplID4gMCkge1xuXHRcdFx0XHRjb25zdCBxdW90ZSA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGl0ZW0ucmFuZ2Uuc3RhcnRDb2x1bW4sIGl0ZW0ucmFuZ2UuZW5kTGluZU51bWJlciwgaXRlbS5yYW5nZS5zdGFydENvbHVtbiArIDEpKTtcblxuXHRcdFx0XHRpZiAobmV3TmFtZXMuc2l6ZSA9PT0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld05hbWUgPSBBcnJheS5mcm9tKG5ld05hbWVzKVswXTtcblx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gKHF1b3RlID09PSBgJ2AgfHwgcXVvdGUgPT09ICdcIicpID8gKHF1b3RlICsgbmV3TmFtZSArIHF1b3RlKSA6IG5ld05hbWU7XG5cdFx0XHRcdFx0Y29uc3QgZWRpdCA9IHsgcmFuZ2U6IGl0ZW0ucmFuZ2UsIHRleHQgfTtcblx0XHRcdFx0XHRlZGl0cy5wdXNoKGVkaXQpO1xuXG5cdFx0XHRcdFx0aWYgKGl0ZW0ucmFuZ2UuY29udGFpbnNSYW5nZShyYW5nZSkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihtb2RlbCwgaXRlbS5yYW5nZSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ3VwZGF0ZVRvb2xOYW1lJywgXCJVcGRhdGUgdG8gJ3swfSdcIiwgbmV3TmFtZSksXG5cdFx0XHRcdFx0XHRcdFthc1dvcmtzcGFjZVRleHRFZGl0KG1vZGVsLCBlZGl0KV1cblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBNdWx0aXBsZSBuZXcgbmFtZXMgLSBleHBhbmQgdG8gaW5jbHVkZSBhbGwgb2YgdGhlbVxuXHRcdFx0XHRcdGNvbnN0IG5ld05hbWVzQXJyYXkgPSBBcnJheS5mcm9tKG5ld05hbWVzKS5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXHRcdFx0XHRcdGNvbnN0IHNlcGFyYXRvciA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXIsIGl0ZW0ucmFuZ2UuZW5kQ29sdW1uLCBpdGVtLnJhbmdlLmVuZExpbmVOdW1iZXIsIGl0ZW0ucmFuZ2UuZW5kQ29sdW1uICsgMikpO1xuXHRcdFx0XHRcdGNvbnN0IHVzZUNvbW1hU3BhY2UgPSBzZXBhcmF0b3IuaW5jbHVkZXMoJywnKTtcblx0XHRcdFx0XHRjb25zdCBkZWxpbWl0ZXJUZXh0ID0gdXNlQ29tbWFTcGFjZSA/ICcsICcgOiAnLCc7XG5cblx0XHRcdFx0XHRjb25zdCBuZXdOYW1lc1RleHQgPSBuZXdOYW1lc0FycmF5Lm1hcChuYW1lID0+XG5cdFx0XHRcdFx0XHQocXVvdGUgPT09IGAnYCB8fCBxdW90ZSA9PT0gJ1wiJykgPyAocXVvdGUgKyBuYW1lICsgcXVvdGUpIDogbmFtZVxuXHRcdFx0XHRcdCkuam9pbihkZWxpbWl0ZXJUZXh0KTtcblxuXHRcdFx0XHRcdGNvbnN0IGVkaXQgPSB7IHJhbmdlOiBpdGVtLnJhbmdlLCB0ZXh0OiBuZXdOYW1lc1RleHQgfTtcblx0XHRcdFx0XHRlZGl0cy5wdXNoKGVkaXQpO1xuXG5cdFx0XHRcdFx0aWYgKGl0ZW0ucmFuZ2UuY29udGFpbnNSYW5nZShyYW5nZSkpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRoaXMuY3JlYXRlQ29kZUFjdGlvbihtb2RlbCwgaXRlbS5yYW5nZSxcblx0XHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4cGFuZFRvb2xOYW1lcycsIFwiRXhwYW5kIHRvIHswfSB0b29sc1wiLCBuZXdOYW1lcy5zaXplKSxcblx0XHRcdFx0XHRcdFx0W2FzV29ya3NwYWNlVGV4dEVkaXQobW9kZWwsIGVkaXQpXVxuXHRcdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVkaXRzLmxlbmd0aCAmJiByZXN1bHQubGVuZ3RoID09PSAwIHx8IGVkaXRzLmxlbmd0aCA+IDEpIHtcblx0XHRcdHJlc3VsdC5wdXNoKFxuXHRcdFx0XHR0aGlzLmNyZWF0ZUNvZGVBY3Rpb24obW9kZWwsIHZhbHVlLnJhbmdlLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd1cGRhdGVBbGxUb29sTmFtZXMnLCBcIlVwZGF0ZSBhbGwgdG9vbCBuYW1lc1wiKSxcblx0XHRcdFx0XHRlZGl0cy5tYXAoZWRpdCA9PiBhc1dvcmtzcGFjZVRleHRFZGl0KG1vZGVsLCBlZGl0KSlcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHR9XG5cdH1cbn1cbmZ1bmN0aW9uIGFzV29ya3NwYWNlVGV4dEVkaXQobW9kZWw6IElUZXh0TW9kZWwsIHRleHRFZGl0OiBUZXh0RWRpdCk6IElXb3Jrc3BhY2VUZXh0RWRpdCB7XG5cdHJldHVybiB7XG5cdFx0dmVyc2lvbklkOiBtb2RlbC5nZXRWZXJzaW9uSWQoKSxcblx0XHRyZXNvdXJjZTogbW9kZWwudXJpLFxuXHRcdHRleHRFZGl0XG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsYUFBYTtBQUd0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLDZCQUE2QixtQkFBbUI7QUFDekQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBMkMsOEJBQThCO0FBRWxGLFNBQVMsWUFBWTtBQUNyQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQixpQ0FBaUM7QUFDNUQsU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVywrQkFBK0I7QUFFNUMsSUFBTSwyQkFBTixNQUE2RDtBQUFBLEVBTW5FLFlBQ21DLGdCQUNXLDJCQUNkLGFBQ0UsZUFDaEM7QUFKaUM7QUFDVztBQUNkO0FBQ0U7QUFObEM7QUFBQTtBQUFBO0FBQUEsU0FBZ0Isb0JBQTRCO0FBQUEsRUFRNUM7QUFBQSxFQUVBLE1BQU0sbUJBQW1CLE9BQW1CLE9BQTBCLFNBQTRCLE9BQStEO0FBQ2hLLFVBQU0sYUFBYSw0QkFBNEIsTUFBTSxjQUFjLENBQUM7QUFDcEUsUUFBSSxDQUFDLGNBQWMsZUFBZSxZQUFZLGNBQWM7QUFFM0QsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQXVCLENBQUM7QUFFOUIsVUFBTSxZQUFZLEtBQUssZUFBZSxvQkFBb0IsS0FBSztBQUMvRCxZQUFRLFlBQVk7QUFBQSxNQUNuQixLQUFLLFlBQVk7QUFDaEIsYUFBSywwQkFBMEIsV0FBVyxZQUFZLE9BQU8sT0FBTyxNQUFNO0FBQzFFLGFBQUssOEJBQThCLE9B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
